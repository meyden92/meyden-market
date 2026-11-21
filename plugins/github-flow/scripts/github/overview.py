#!/usr/bin/env python3
"""Every open issue, paginated and grouped: one call instead of a repo loop.

`gh issue list` stops at `--limit` (default 30), which quietly turns "what is
left in the backlog?" into "what are the 30 most recent items?". This walks
all pages, and pushes the filters server-side so a question like "what is
assigned to X across every repo of the owner?" costs one invocation rather
than a repo x user loop.

Grouping is by label prefix and defaults to `stream`, but the prefix is a flag:
`--group-by status` or `--group-by prio` regroups the same data. Issues with no
matching label are listed separately rather than dropped.

Blocked issues are hidden by default: they are not actionable, and mixing them
into a backlog overview makes it read longer than it is. An issue counts as
blocked when it carries a blocked-style label *or* an open native `blocked by`
dependency. `--include-blocked` brings them back, tagged.

By default the scope is this repository **and its submodules**, resolved by
`meyden-gh scope`. A question asked inside a repository is about that
repository, and a superproject whose code lives in submodules is one piece of
work. Issues found outside that set are summarised rather than dropped.

Usage:
    meyden-gh overview                                 # this repo + its submodules
    meyden-gh overview --mine                          # ...assigned to you
    meyden-gh overview --mine --all                    # every repo, no scope filter
    meyden-gh overview -R owner/repo                   # one named repository
    meyden-gh overview -R myorg --owner                # every repo of a user/org
    meyden-gh overview -R myorg --owner --assignee none --label "Prio: High"
    meyden-gh overview --group-by status --table
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import urllib.parse
from collections import defaultdict

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "lib"))
from gh_common import BLOCKED_SYNONYMS, GhError, api, label_value, repo_path  # noqa: E402
from scope import ScopeError, resolve as resolve_scope  # noqa: E402

REPOSITORY_URL = re.compile(r"/repos/([^/]+/[^/]+)$")


def only_issues(items: list[dict]) -> list[dict]:
    """Drop pull requests: GitHub's issue endpoints return both."""
    return [i for i in items if not i.get("pull_request")]


def fetch_open_issues(
    target: str | None,
    owner: bool,
    assignee: str | None = None,
    label: str | None = None,
    search: str | None = None,
    milestone: str | None = None,
) -> list[dict]:
    """All open issues for a repository or owner, filters applied server-side."""
    if owner:
        if not target:
            raise GhError("--owner needs -R <user-or-org>.")
        # Repo endpoints only cover one repository; owner-wide questions go
        # through the search API instead (capped at 1000 results by GitHub).
        terms = [f"owner:{target}", "is:issue", "is:open"]
        if assignee == "none":
            terms.append("no:assignee")
        elif assignee:
            terms.append(f"assignee:{assignee}")
        for name in (label or "").split(","):
            if name.strip():
                terms.append(f'label:"{name.strip()}"')
        if milestone:
            terms.append(f'milestone:"{milestone}"')
        if search:
            terms.append(search)
        query = urllib.parse.quote(" ".join(terms))
        pages = api(f"search/issues?q={query}&per_page=100", paginate=True)
        if isinstance(pages, dict):
            pages = [pages]
        return [item for page in (pages or []) for item in page.get("items", [])]

    params = ["state=open", "per_page=100"]
    if assignee == "none":
        params.append("assignee=none")
    elif assignee:
        params.append(f"assignee={urllib.parse.quote(assignee)}")
    if label:
        params.append(f"labels={urllib.parse.quote(label)}")
    if milestone:
        params.append(f"milestone={urllib.parse.quote(milestone)}")

    issues = only_issues(
        api(f"repos/{repo_path(target)}/issues?{'&'.join(params)}", paginate=True) or []
    )
    if search:
        needle = search.lower()
        issues = [
            i for i in issues
            if needle in i.get("title", "").lower() or needle in (i.get("body") or "").lower()
        ]
    return issues


def fetch_assigned(
    label: str | None = None,
    search: str | None = None,
    milestone: str | None = None,
) -> list[dict]:
    """Every open issue assigned to the authenticated user, account-wide.

    One call, then the repository scope is applied here rather than by asking
    each repo in turn: a round trip per repo to answer "what is assigned to
    me" multiplies the latency for the same set of issues.
    """
    params = ["filter=assigned", "state=open", "per_page=100"]
    if label:
        params.append(f"labels={urllib.parse.quote(label)}")
    issues = only_issues(api(f"issues?{'&'.join(params)}", paginate=True) or [])
    if search:
        needle = search.lower()
        issues = [
            i for i in issues
            if needle in i.get("title", "").lower() or needle in (i.get("body") or "").lower()
        ]
    if milestone:
        issues = [i for i in issues if (i.get("milestone") or {}).get("title") == milestone]
    return issues


def project_of(issue: dict) -> str:
    """`owner/repo` an issue belongs to, for scope matching."""
    match = REPOSITORY_URL.search(issue.get("repository_url", ""))
    if match:
        return match.group(1)
    return (issue.get("repository") or {}).get("full_name", "")


def group_key(issue: dict, prefix: str) -> str | None:
    """First label starting with `prefix`, case-insensitively."""
    for name in label_names(issue):
        if name.lower().startswith(prefix.lower()):
            return name
    return None


def label_names(issue: dict) -> list[str]:
    return [entry["name"] for entry in issue.get("labels", []) if isinstance(entry, dict)]


def is_blocked(issue: dict) -> bool:
    if any(label_value(name) in BLOCKED_SYNONYMS for name in label_names(issue)):
        return True
    # Native dependencies, when the endpoint includes the summary.
    summary = issue.get("issue_dependencies_summary") or {}
    return bool(summary.get("blocked_by"))


def assignees_of(issue: dict) -> str:
    return ",".join(a["login"] for a in issue.get("assignees", [])) or "-"


def issue_ref(issue: dict, multi_repo: bool) -> str:
    """`#463` within one repository, `core#463` when several are in play."""
    if not multi_repo:
        return f"#{issue['number']}"
    repo = project_of(issue)
    name = repo.rsplit("/", 1)[-1] if repo else ""
    return f"{name}#{issue['number']}" if name else f"#{issue['number']}"


def main() -> int:
    parser = argparse.ArgumentParser(prog="meyden-gh overview", description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("-R", "--repo", help="owner/repo, or a user/org with --owner")
    parser.add_argument("--owner", action="store_true", help="treat -R as a user/org: every repo at once")
    parser.add_argument("--group-by", default="stream", help="label prefix to group by (default: stream)")
    parser.add_argument("--assignee", help="login, or 'none' for unassigned")
    parser.add_argument("--label", help="label filter; comma-separated means AND")
    parser.add_argument("--search", help="search titles and bodies")
    parser.add_argument("--milestone", help="milestone (number for a repo, title with --owner)")
    parser.add_argument("--mine", action="store_true", help="only issues assigned to you")
    parser.add_argument("--all", dest="all_projects", action="store_true",
                        help="with --mine: do not restrict to this repository and its submodules")
    parser.add_argument("--include-blocked", action="store_true")
    parser.add_argument("--table", action="store_true", help="markdown table output")
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args()

    if args.all_projects and not args.mine:
        print("❌ --all only makes sense together with --mine. "
              "For a whole org, use -R <user-or-org> --owner.")
        return 2
    if args.mine and args.assignee:
        print("❌ --mine and --assignee both name who the issues belong to. Pass one.")
        return 2

    # The repository and its submodules are the scope, unless the caller named a
    # target explicitly. A question asked inside a repository is about it.
    scope_info = None
    scope_paths: set[str] | None = None
    if not args.repo and not args.all_projects:
        try:
            scope_info = resolve_scope(os.getcwd())
            # Case-folded: .gitmodules may carry `Owner/Repo` while the API
            # answers with its own casing, and an exact match would drop the
            # repository without saying so.
            scope_paths = {p["path"].casefold() for p in scope_info["projects"]}
        except ScopeError as exc:
            print(f"‼️  {exc}", file=sys.stderr)
            if not args.mine:
                return 1

    out_of_scope: list[dict] = []
    unreachable: list[str] = []

    try:
        if args.mine:
            found = fetch_assigned(label=args.label, search=args.search, milestone=args.milestone)
            if scope_paths is None:
                issues = found
            else:
                issues = []
                for issue in found:
                    target = issues if project_of(issue).casefold() in scope_paths else out_of_scope
                    target.append(issue)
        elif scope_info is not None:
            issues = []
            for project in scope_info["projects"]:
                try:
                    issues += fetch_open_issues(
                        project["path"], False,
                        assignee=args.assignee, label=args.label,
                        search=args.search, milestone=args.milestone,
                    )
                except GhError as exc:
                    # One inaccessible submodule must not empty the whole answer.
                    unreachable.append(f"{project['path']}: {exc}")
        else:
            issues = fetch_open_issues(
                args.repo, args.owner,
                assignee=args.assignee, label=args.label,
                search=args.search, milestone=args.milestone,
            )
    except GhError as exc:
        print(f"❌ {exc}")
        return 1

    if args.repo:
        target_name = args.repo
        multi_repo = args.owner
    elif scope_info is not None:
        projects = scope_info["projects"]
        multi_repo = len(projects) > 1
        target_name = (
            f"{projects[0]['path']} + {len(projects) - 1} submodule(s)"
            if multi_repo else projects[0]["path"]
        )
    else:
        target_name = "every repository you have access to"
        multi_repo = True

    blocked = [i for i in issues if is_blocked(i)]
    if not args.include_blocked:
        issues = [i for i in issues if not is_blocked(i)]

    grouped: dict[str, list[dict]] = defaultdict(list)
    ungrouped: list[dict] = []
    for issue in issues:
        key = group_key(issue, args.group_by)
        (grouped[key] if key else ungrouped).append(issue)

    def slim(issue: dict) -> dict:
        return {
            "ref": issue_ref(issue, multi_repo),
            "number": issue["number"],
            "repo": project_of(issue),
            "title": issue["title"],
            "assignee": assignees_of(issue),
            "labels": label_names(issue),
            "url": issue.get("html_url", ""),
        }

    def report_extras() -> None:
        """Everything the main listing deliberately left out.

        Out-of-scope issues are counted, never listed. A listing reaches the
        user in full whatever the surrounding text says, and it answers a
        question nobody asked. The count is there so a wider question is
        discoverable, not so it can be answered pre-emptively.
        """
        if blocked and not args.include_blocked:
            print(f"-- {len(blocked)} blocked issue(s) hidden. --include-blocked shows them.")
        if out_of_scope:
            print(f"\n-- {len(out_of_scope)} further issue(s) assigned to you outside this "
                  "repository and its submodules. --all lists them.")
        for problem in unreachable:
            print(f"‼️  could not read {problem}")

    if args.json:
        print(json.dumps({
            "target": target_name,
            "scope": [p["path"] for p in scope_info["projects"]] if scope_info else None,
            "total": len(issues),
            "grouped_by": args.group_by,
            "groups": {k: [slim(i) for i in v] for k, v in grouped.items()},
            "ungrouped": [slim(i) for i in ungrouped],
            "blocked_hidden": [slim(i) for i in blocked] if not args.include_blocked else [],
            "out_of_scope_count": len(out_of_scope),
            "unreachable": unreachable,
        }, indent=2, ensure_ascii=False))
        return 0

    if args.table:
        print(f"_Scope: {target_name}_\n")
        print("| ID | Description | Assignee |")
        print("| :-- | :-- | :-- |")
        for issue in sorted(issues, key=lambda i: -i["number"]):
            title = issue["title"].replace("|", "\\|")
            print(f"| {issue_ref(issue, multi_repo)} | {title} | {assignees_of(issue)} |")
        print()
        report_extras()
        return 0

    print(f"# Open issues: {target_name} ({len(issues)} shown)\n")
    for key in sorted(grouped):
        items = sorted(grouped[key], key=lambda i: -i["number"])
        print(f"## {key} ({len(items)})")
        for issue in items:
            print(f"  {issue_ref(issue, multi_repo):<24} {issue['title'][:70]}  [{assignees_of(issue)}]")
        print()
    if ungrouped:
        items = sorted(ungrouped, key=lambda i: -i["number"])
        print(f"## (no {args.group_by}* label) ({len(items)})")
        for issue in items:
            print(f"  {issue_ref(issue, multi_repo):<24} {issue['title'][:70]}  [{assignees_of(issue)}]")
        print()
    report_extras()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
