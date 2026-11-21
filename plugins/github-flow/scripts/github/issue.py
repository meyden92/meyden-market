#!/usr/bin/env python3
"""Issue writes that survive real bodies and verify what GitHub actually did.

Three problems this exists to solve, each of which has cost a session before:

- **Shell quoting.** Issue bodies contain backticks, `$`, umlauts, code fences
  and newlines. Passed through a shell they mangle or hang; passed through
  `gh issue create -b "$(cat f)"` they still go through one level of word
  splitting. Everything here goes through argv (no shell at any point), so the
  body arrives byte-for-byte.
- **Assignment is reported as successful when it was discarded.** GitHub drops
  an assignee who has no access to the repository and still answers 201, so
  `--assignee` looks like it worked. Every assignment here is read back.
- **`id` vs `number`.** The sub-issue and dependency endpoints take the global
  database `id`, everything else the per-repo `number`. The resolution hop
  lives here so no caller ever has to know.

Usage (repo defaults to the current directory's git remote):

    meyden-gh issue create  --title "..." --body-file plan.md [--label "Type: Bug"] [--assignee user]
    meyden-gh issue update  <number> [--title ...] [--body-file f | -] [--label L] [--unlabel L]
    meyden-gh issue comment <number> (--body "..." | --body-file f | -)
    meyden-gh issue append  <number> (--body "..." | --body-file f | -) [--separator ---]
    meyden-gh issue replace <number> --old-file old.md --new-file new.md
    meyden-gh issue status  <number> (todo|doing|testing|done)
    meyden-gh issue link    <number> <target> [--type blocked_by|blocks]
    meyden-gh issue sub     (list|create|add|detach) <parent> [child] [--title ...]
    meyden-gh issue view    <number>

`-` reads the body from stdin and is the only thing that does: without it
stdin is left alone, so a body-less call returns at once even when no
terminal is attached.

Add `-R owner/repo` to act on another repository.
"""

from __future__ import annotations

import argparse
import os
import sys
import urllib.parse

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "lib"))
from gh_common import (  # noqa: E402
    GhError,
    api,
    die,
    fetch_labels,
    issue_db_id,
    repo_path,
    resolve_lifecycle,
    LIFECYCLE_SYNONYMS,
)


def read_body(args) -> str | None:
    """Body from --body, --body-file, or stdin. Returns None when unset.

    stdin is read only when `-` was given explicitly. Deciding by
    `isatty()` instead looked reasonable and hung every body-less
    `update` under an agent, where stdin is never a terminal but never
    carries data either. The read blocked until the caller timed out.
    """
    if args.body is not None:
        return args.body
    if args.body_file:
        with open(args.body_file, encoding="utf-8") as handle:
            return handle.read()
    if getattr(args, "stdin", False):
        data = sys.stdin.read()
        return data if data.strip() else None
    return None


def issue_url(issue: dict) -> str:
    return issue.get("html_url", "")


def fetch_issue(repo, number: int) -> dict:
    issue = api(f"repos/{repo_path(repo)}/issues/{number}")
    if issue.get("pull_request"):
        die(
            f"#{number} is a pull request, not an issue: GitHub numbers both "
            "from the same sequence. Use `meyden-gh pr` or `gh pr` for it."
        )
    return issue


def verify_assignee(number: int, expected: str, repo) -> None:
    """Read the assignment back: GitHub discards invalid assignees silently.

    Reported as a warning rather than an error: the issue itself was written
    correctly, and the fix (give the user access to the repository) is not
    something this script should attempt.
    """
    issue = api(f"repos/{repo_path(repo)}/issues/{number}")
    actual = [a["login"] for a in issue.get("assignees", [])]
    if expected not in actual:
        print(
            f"WARNING: assignee {expected!r} did not stick (now: {actual or 'none'}). "
            "GitHub discards assignees without access to the repository: "
            "add them as a collaborator, then reassign.",
            file=sys.stderr,
        )


def warn_missing_tldr(body: str | None) -> None:
    """Nudge when a body opens with something other than a summary.

    A leading TL;DR is what makes an issue triageable from a board or a
    notification email, where the opening line is all anyone sees.
    """
    if not body:
        return
    head = "\n".join(body.strip().splitlines()[:3]).lower()
    if "tl;dr" not in head and "tldr" not in head:
        print(
            "NOTE: body does not open with a TL;DR. Boards and notification "
            "emails show only the opening lines.",
            file=sys.stderr,
        )


def cmd_create(args) -> int:
    body = read_body(args)
    warn_missing_tldr(body)
    fields: dict = {"title": args.title}
    raw_fields: dict = {}
    if body is not None:
        raw_fields["body"] = body
    if args.label:
        fields["labels"] = [name.strip() for name in args.label.split(",") if name.strip()]
    if args.milestone:
        fields["milestone"] = int(args.milestone)
    if args.assignee:
        fields["assignees"] = [args.assignee]

    issue = api(
        f"repos/{repo_path(args.repo)}/issues",
        method="POST",
        fields=fields,
        raw_fields=raw_fields,
    )
    print(f"#{issue['number']} created: {issue_url(issue)}")
    if args.assignee:
        verify_assignee(issue["number"], args.assignee, args.repo)
    return 0


def cmd_update(args) -> int:
    body = read_body(args)
    path = f"repos/{repo_path(args.repo)}/issues/{args.number}"
    raw_fields: dict = {}
    fields: dict = {}
    if args.title:
        raw_fields["title"] = args.title
    if body is not None:
        warn_missing_tldr(body)
        raw_fields["body"] = body
    if args.assignee:
        fields["assignees"] = [args.assignee]

    changed = bool(raw_fields or fields or args.label or args.unlabel)
    if not changed:
        die("Nothing to update.")

    issue = fetch_issue(args.repo, args.number)
    if raw_fields or fields:
        issue = api(path, method="PATCH", fields=fields, raw_fields=raw_fields)

    # Labels go through the dedicated endpoints: PATCHing `labels` replaces
    # the whole set, so a bare "add one label" would silently strip the rest.
    if args.label:
        api(
            f"{path}/labels",
            method="POST",
            fields={"labels": [n.strip() for n in args.label.split(",") if n.strip()]},
        )
    for name in (args.unlabel or "").split(","):
        name = name.strip()
        if name:
            api(f"{path}/labels/{urllib.parse.quote(name)}", method="DELETE")

    print(f"#{args.number} updated: {issue_url(issue)}")
    if args.assignee:
        verify_assignee(args.number, args.assignee, args.repo)
    if body is not None:
        # The off-by-one that shifted plans across #129-#150 was invisible
        # until someone compared each title against its own body.
        print(f"  title: {issue['title']}")
        print(f"  body opens: {body.strip().splitlines()[0][:80] if body.strip() else '(empty)'}")
    return 0


def cmd_comment(args) -> int:
    body = read_body(args)
    if body is None:
        die("comment needs a body (--body / --body-file / -).")
    comment = api(
        f"repos/{repo_path(args.repo)}/issues/{args.number}/comments",
        method="POST",
        raw_fields={"body": body},
    )
    print(f"#{args.number} comment posted (id {comment['id']}).")
    return 0


def cmd_append(args) -> int:
    body = read_body(args)
    if body is None:
        die("append needs a body (--body / --body-file / -).")
    path = f"repos/{repo_path(args.repo)}/issues/{args.number}"
    issue = fetch_issue(args.repo, args.number)
    current = issue.get("body") or ""
    updated_body = f"{current.rstrip()}\n\n{args.separator}\n\n{body.strip()}\n"
    updated = api(path, method="PATCH", raw_fields={"body": updated_body})
    print(
        f"#{args.number} appended "
        f"({len(current)} -> {len(updated['body'])} chars): {issue_url(updated)}"
    )
    return 0


def cmd_replace(args) -> int:
    """Replace a passage in the body, but only on an unambiguous match.

    Refusing on 0 or 2+ matches is the whole point: a blind replace on a
    repeated heading rewrites the wrong section, and the damage is only
    visible to someone who reads the issue afterwards.
    """
    with open(args.old_file, encoding="utf-8") as handle:
        old = handle.read().strip()
    with open(args.new_file, encoding="utf-8") as handle:
        new = handle.read().strip()
    if not old:
        die("--old-file is empty, refusing to guess where to insert.")

    path = f"repos/{repo_path(args.repo)}/issues/{args.number}"
    issue = fetch_issue(args.repo, args.number)
    current = issue.get("body") or ""
    count = current.count(old)
    if count != 1:
        die(f"Old text found {count}x, expected exactly 1: nothing changed.")

    updated = api(path, method="PATCH", raw_fields={"body": current.replace(old, new)})
    print(f"#{args.number} replaced 1 passage: {issue_url(updated)}")
    return 0


def cmd_status(args) -> int:
    """Move an issue to a lifecycle stage using the project's own label names.

    The stage is fixed by the workflow; the label name is not. A project that
    calls it `Status: Doing` and one that calls it `In Arbeit` both work, and
    neither gets a second near-duplicate label created behind its back.
    """
    labels = fetch_labels(args.repo)
    lifecycle = resolve_lifecycle(labels)
    target = lifecycle.get(args.stage)
    if not target:
        known = ", ".join(f"{k}={v}" for k, v in lifecycle.items()) or "none"
        die(
            f"This repository has no label for the {args.stage!r} stage "
            f"(recognised: {known}).\n"
            f"Repository labels: {', '.join(labels) or 'none'}\n"
            "Creating one is a project-wide change: ask first, then add it by name."
        )

    path = f"repos/{repo_path(args.repo)}/issues/{args.number}"
    issue = fetch_issue(args.repo, args.number)
    current = [entry["name"] for entry in issue.get("labels", [])]

    # Drop the other lifecycle labels explicitly. GitHub has no scoped-label
    # exclusivity at all, so without this an issue simply accumulates
    # `Status: Todo` next to `Status: Doing` and every board shows it twice.
    #
    # Only labels this repository actually resolved to a stage are eligible.
    # Matching on the synonym list instead would strip a `test` label that
    # means "test infrastructure" rather than "in testing": the words
    # overlap, the meanings do not.
    lifecycle_labels = set(lifecycle.values())
    stale = [name for name in current if name != target and name in lifecycle_labels]

    if target not in current:
        api(f"{path}/labels", method="POST", fields={"labels": [target]})
    for name in stale:
        api(f"{path}/labels/{urllib.parse.quote(name)}", method="DELETE")

    updated = api(path)
    now = [entry["name"] for entry in updated.get("labels", [])]
    if target not in now:
        die(f"Label {target!r} did not stick: labels are still {now}.")
    print(f"#{args.number} -> {args.stage} ({target})")
    if stale:
        print(f"  removed: {', '.join(stale)}")
    print(f"  labels now: {', '.join(now) or 'none'}")
    return 0


def cmd_link(args) -> int:
    """Record a dependency between two issues.

    `blocked_by` / `blocks` are what `meyden-gh graph` walks to answer "can
    this start yet?". Both directions write the same native relationship;
    only which issue carries the `blocked_by` entry differs. For a loose
    cross-reference with no ordering, mention the other issue in the body or
    a comment instead; GitHub backlinks it in the timeline automatically.
    """
    if args.type == "blocked_by":
        blocked, blocker = args.number, args.target
    else:  # blocks: this issue blocks the target
        blocked, blocker = args.target, args.number
    blocker_repo = args.target_repo if args.type == "blocked_by" else args.repo
    blocked_repo = args.repo if args.type == "blocked_by" else (args.target_repo or args.repo)

    api(
        f"repos/{repo_path(blocked_repo)}/issues/{blocked}/dependencies/blocked_by",
        method="POST",
        fields={"issue_id": issue_db_id(blocker_repo, blocker)},
    )
    print(f"#{args.number} {args.type.replace('_', ' ')} #{args.target}")
    return 0


def cmd_sub(args) -> int:
    """Manage the native sub-issue hierarchy.

    One parent per issue, and, unlike GitLab's work items, an issue may
    parent other issues directly, so an epic's children are ordinary issues
    with no extra bookkeeping. The parent renders its sub-issue list with a
    progress bar in the UI; nothing needs to be mirrored into the body.
    """
    path = f"repos/{repo_path(args.repo)}/issues"
    parent = fetch_issue(args.repo, args.parent)

    if args.action == "list":
        children = api(f"{path}/{args.parent}/sub_issues?per_page=100", paginate=True) or []
        print(f"#{parent['number']} {parent['title']}")
        try:
            up = api(f"{path}/{args.parent}/parent")
        except GhError:
            up = None
        if up:
            print(f"  parent: #{up['number']} {up['title']}")
        if not children:
            print("  (no sub-issues)")
            return 0
        done = sum(1 for c in children if c["state"] == "closed")
        print(f"  sub-issues: {done}/{len(children)} closed")
        for child in children:
            mark = "[x]" if child["state"] == "closed" else "[ ]"
            print(f"    {mark} #{child['number']:<5} {child['title']}")
        return 0

    if args.action == "create":
        if not args.title:
            die("sub create needs --title.")
        body = read_body(args) or ""
        child = api(
            path,
            method="POST",
            fields={},
            raw_fields={"title": args.title, "body": body},
        )
        api(
            f"{path}/{args.parent}/sub_issues",
            method="POST",
            fields={"sub_issue_id": child["id"]},
        )
        print(f"#{child['number']} created under #{args.parent}: {child['title']}")
        return 0

    # add / detach operate on an existing issue.
    if args.child is None:
        die(f"sub {args.action} needs the child issue number.")
    child_id = issue_db_id(args.repo, args.child)
    if args.action == "add":
        try:
            api(
                f"{path}/{args.parent}/sub_issues",
                method="POST",
                fields={"sub_issue_id": child_id},
            )
        except GhError as exc:
            die(
                f"{exc}\n"
                "An issue has at most one parent. If #%d already has one, detach it "
                "first (meyden-gh issue sub detach <old-parent> %d), then re-add."
                % (args.child, args.child)
            )
        print(f"#{args.child} is now a sub-issue of #{args.parent}")
    else:
        api(
            f"{path}/{args.parent}/sub_issue",
            method="DELETE",
            fields={"sub_issue_id": child_id},
        )
        print(f"#{args.child} detached from #{args.parent}")
    return 0


def cmd_view(args) -> int:
    issue = fetch_issue(args.repo, args.number)
    assignees = ", ".join(a["login"] for a in issue.get("assignees", [])) or "-"
    labels = ", ".join(entry["name"] for entry in issue.get("labels", [])) or "none"
    print(f"#{issue['number']} {issue['title']}")
    print(f"  state: {issue['state']}  assignee: {assignees}")
    print(f"  labels: {labels}")
    print(f"  url: {issue_url(issue)}")
    summary = issue.get("sub_issues_summary") or {}
    if summary.get("total"):
        print(f"  sub-issues: {summary.get('completed', 0)}/{summary['total']} closed")
    if issue.get("body"):
        print("\n" + issue["body"])
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="meyden-gh issue", description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("-R", "--repo", help="owner/repo (default: current repo)")
    sub = parser.add_subparsers(dest="command", required=True)

    # `-R` reads as a per-command flag, so it gets written after the subcommand
    # at least as often as before it. Accepted in both positions: argparse would
    # otherwise take `sub list 38 -R owner/repo` and bind the repo path to the
    # next positional, failing with "invalid int value", a message that points
    # at the wrong argument entirely.
    #
    # SUPPRESS is what makes this safe: without it the subparser writes its own
    # default over a value the top-level parser already captured, so `-R x sub
    # list 38` would silently lose the repo.
    def target_args(p):
        p.add_argument("-R", "--repo", default=argparse.SUPPRESS,
                       help=argparse.SUPPRESS)

    def body_args(p, allow_stdin=True):
        p.add_argument("--body")
        p.add_argument("--body-file")
        if allow_stdin:
            p.add_argument("-", dest="stdin", action="store_true", help="read body from stdin")

    p = sub.add_parser("create", help="create an issue")
    target_args(p)
    p.add_argument("--title", required=True)
    p.add_argument("--label", help="comma-separated, must already exist in the repository")
    p.add_argument("--assignee", help="login; verified after writing")
    p.add_argument("--milestone", help="milestone number")
    body_args(p)
    p.set_defaults(func=cmd_create)

    p = sub.add_parser("update", help="update title/body/labels")
    target_args(p)
    p.add_argument("number", type=int)
    p.add_argument("--title")
    p.add_argument("--label", help="labels to add")
    p.add_argument("--unlabel", help="labels to remove")
    p.add_argument("--assignee")
    body_args(p)
    p.set_defaults(func=cmd_update)

    p = sub.add_parser("comment", help="post a comment")
    target_args(p)
    p.add_argument("number", type=int)
    body_args(p)
    p.set_defaults(func=cmd_comment)

    p = sub.add_parser("append", help="append to the body")
    target_args(p)
    p.add_argument("number", type=int)
    p.add_argument("--separator", default="---")
    body_args(p)
    p.set_defaults(func=cmd_append)

    p = sub.add_parser("replace", help="replace one passage in the body")
    target_args(p)
    p.add_argument("number", type=int)
    p.add_argument("--old-file", required=True)
    p.add_argument("--new-file", required=True)
    p.set_defaults(func=cmd_replace)

    p = sub.add_parser("status", help="move to a lifecycle stage")
    target_args(p)
    p.add_argument("number", type=int)
    p.add_argument("stage", choices=sorted(LIFECYCLE_SYNONYMS))
    p.set_defaults(func=cmd_status)

    p = sub.add_parser("link", help="record a dependency between two issues")
    target_args(p)
    p.add_argument("number", type=int)
    p.add_argument("target", type=int)
    p.add_argument(
        "--type",
        default="blocks",
        choices=("blocks", "blocked_by"),
        help="both are walked by meyden-gh graph; for a loose reference, mention the issue in a comment",
    )
    p.add_argument("--target-repo", help="if the other issue lives in another repository")
    p.set_defaults(func=cmd_link)

    p = sub.add_parser("sub", help="native sub-issues")
    target_args(p)
    p.add_argument("action", choices=("list", "create", "add", "detach"))
    p.add_argument("parent", type=int)
    p.add_argument("child", type=int, nargs="?", help="for add/detach: the existing issue")
    p.add_argument("--title", help="for create")
    body_args(p)
    p.set_defaults(func=cmd_sub)

    p = sub.add_parser("view", help="show one issue")
    target_args(p)
    p.add_argument("number", type=int)
    p.set_defaults(func=cmd_view)

    return parser


def main() -> int:
    args = build_parser().parse_args()
    try:
        return args.func(args)
    except GhError as exc:
        print(str(exc), file=sys.stderr)
        return 1
    except FileNotFoundError as exc:
        print(f"File not found: {exc.filename}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
