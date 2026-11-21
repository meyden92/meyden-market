#!/usr/bin/env python3
"""Pull requests over the API, with the safety checks gh does not do for you.

`gh pr merge` makes exactly one attempt and does not pin the revision unless
told to; `gh` has no merge-base check before a branch delete at all. This
wraps the API and encodes the three traps that matter:

- **Merging pins the head SHA.** The API's `sha` parameter refuses to merge a
  revision other than the one that was reviewed; it is taken from the PR
  object here rather than from the caller.
- **"Base branch was modified" is transient.** GitHub occasionally answers a
  merge with `405 Base branch was modified. Review and try the merge again.`
  even when nothing is wrong. That exact error is retried a few times;
  every other failure is reported as-is.
- **Deleting a branch is only safe once its head is contained in the target.**
  `git push --delete` has no such brake; `delete-branch` here checks the
  compare status first and refuses otherwise.

Closing keywords (`Closes #N`, `Fixes #N`) are rejected in PR bodies unless
explicitly allowed: GitHub closes the referenced issue on merge, which skips
the acceptance test. Write `Part of #N` to link without closing.

Usage (repo defaults to the current directory's git remote):

    meyden-gh pr create <head-branch> --title "..." --description-file pr.md
                     [--target <branch>] [--keep-branch] [--merge]
    meyden-gh pr merge <number> [--keep-branch] [--method merge|squash|rebase]
    meyden-gh pr delete-branch <branch> [--target <branch>]
    meyden-gh pr view <number>
"""

from __future__ import annotations

import argparse
import os
import re
import sys
import time

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "lib"))
from gh_common import GhError, api, die, repo_path  # noqa: E402

# Phrases GitHub acts on when it sees them in a PR body: on merge, the
# referenced issue is closed automatically.
CLOSING_PATTERN = re.compile(
    r"\b(clos(?:e|es|ed)|fix(?:es|ed)?|resolv(?:e|es|ed))\b[\s:]*#\d+", re.IGNORECASE
)

# States worth translating for the merge error: `mergeable_state` is
# undocumented-but-stable vocabulary.
MERGE_STATE_HINTS = {
    "dirty": "merge conflicts with the target branch",
    "blocked": "blocked by branch protection (required checks or reviews)",
    "behind": "the head branch is behind the target and the rules require it up to date",
    "draft": "the PR is still a draft",
}

RETRYABLE = "base branch was modified"


def default_target(repo) -> str:
    """The repository's own default branch: never a hardcoded `main`/`develop`."""
    project = api(f"repos/{repo_path(repo)}")
    return project.get("default_branch") or "main"


def reject_closing_keywords(description: str, allow: bool) -> None:
    """Refuse `Closes #123` in a PR body unless explicitly allowed.

    The line reads as a cross-reference but behaves as an action: merging the
    PR closes the issue, with no close command ever typed and no chance for
    whoever owns the acceptance test to object. The effect only becomes
    visible on a later `issue view`. Use `Bezug: #123` / `Part of #123` to
    link without closing.
    """
    match = CLOSING_PATTERN.search(description)
    if match and not allow:
        die(
            f"PR body contains {match.group(0)!r}, which closes the issue on merge "
            "and bypasses acceptance testing.\n"
            "Write 'Bezug: #N' or 'Part of #N' to link without closing, "
            "or pass --allow-closing-keywords if the automatic close is genuinely wanted."
        )


def cmd_create(args) -> int:
    with open(args.description_file, encoding="utf-8") as handle:
        description = handle.read()
    reject_closing_keywords(description, args.allow_closing_keywords)

    target = args.target or default_target(args.repo)
    pr = api(
        f"repos/{repo_path(args.repo)}/pulls",
        method="POST",
        raw_fields={
            "head": args.head_branch,
            "base": target,
            "title": args.title,
            "body": description,
        },
    )
    print(f"PR #{pr['number']} created: {pr['html_url']}")
    print(f"  {pr['head']['ref']} -> {pr['base']['ref']}")
    if args.merge:
        return do_merge(args.repo, pr["number"], args.keep_branch, args.method)
    return 0


def do_merge(repo, number: int, keep_branch: bool, method: str) -> int:
    pr = api(f"repos/{repo_path(repo)}/pulls/{number}")
    if pr.get("merged"):
        die(f"PR #{number} is already merged.")

    result = None
    for attempt in range(3):
        try:
            result = api(
                f"repos/{repo_path(repo)}/pulls/{number}/merge",
                method="PUT",
                raw_fields={
                    # Full head SHA straight from the PR: the API then refuses
                    # to merge anything but the reviewed revision.
                    "sha": pr["head"]["sha"],
                    "merge_method": method,
                },
            )
            break
        except GhError as exc:
            if RETRYABLE in str(exc).lower() and attempt < 2:
                print(f"  transient: {exc}, retrying", file=sys.stderr)
                time.sleep(2)
                continue
            state = pr.get("mergeable_state", "")
            hint = MERGE_STATE_HINTS.get(state)
            die(f"PR #{number} could not be merged: {exc}" + (f"\n({hint})" if hint else ""))
    if result is None:
        die(f"PR #{number}: merge kept failing with 'Base branch was modified', try again.")

    print(f"PR #{number}: merged  merge_commit: {result.get('sha')}")
    head = pr["head"]["ref"]
    if keep_branch:
        print(f"  head branch {head} kept")
    elif pr["head"]["repo"] and pr["head"]["repo"]["full_name"] == pr["base"]["repo"]["full_name"]:
        # The merge endpoint never deletes the branch; the repo-level
        # "automatically delete head branches" setting may have done it
        # already, so a 422 "Reference does not exist" here is fine.
        try:
            api(f"repos/{repo_path(repo)}/git/refs/heads/{head}", method="DELETE")
            print(f"  head branch {head} deleted")
        except GhError as exc:
            if "does not exist" not in str(exc).lower():
                raise
            print(f"  head branch {head} already deleted")
    return 0


def cmd_merge(args) -> int:
    return do_merge(args.repo, args.number, args.keep_branch, args.method)


def cmd_delete_branch(args) -> int:
    """Delete a branch only once it is fully contained in the target."""
    path = repo_path(args.repo)
    target = args.target or default_target(args.repo)
    compare = api(f"repos/{path}/compare/{target}...{args.branch}")
    # `identical` or `behind` means every commit on the branch is already in
    # the target; `ahead`/`diverged` means commits would be lost.
    status = compare.get("status", "")
    if status not in ("identical", "behind"):
        die(
            f"{args.branch} is NOT fully merged into {target} "
            f"(compare status: {status or 'unknown'}, "
            f"{compare.get('ahead_by', '?')} commit(s) ahead): refusing to delete. "
            "Commits would be lost."
        )
    api(f"repos/{path}/git/refs/heads/{args.branch}", method="DELETE")
    print(f"Deleted {args.branch} (was fully merged into {target}).")
    return 0


def cmd_view(args) -> int:
    pr = api(f"repos/{repo_path(args.repo)}/pulls/{args.number}")
    print(f"#{pr['number']} {pr['title']}")
    print(f"  {pr['head']['ref']} -> {pr['base']['ref']}  state: {pr['state']}"
          + ("  (draft)" if pr.get("draft") else ""))
    print(f"  mergeable: {pr.get('mergeable')}  state: {pr.get('mergeable_state', '?')}  sha: {pr['head']['sha']}")
    print(f"  url: {pr['html_url']}")
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="meyden-gh pr", description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("-R", "--repo", help="owner/repo (default: current repo)")
    sub = parser.add_subparsers(dest="command", required=True)

    # `-R` reads as a per-command flag and gets written after the subcommand as
    # often as before it. Accepted in both positions; SUPPRESS keeps the
    # subparser from overwriting a value the top-level parser already captured.
    def target_args(p):
        p.add_argument("-R", "--repo", default=argparse.SUPPRESS, help=argparse.SUPPRESS)

    def method_arg(p):
        p.add_argument("--method", default="merge", choices=("merge", "squash", "rebase"),
                       help="merge strategy (default: merge commit)")

    p = sub.add_parser("create", help="create a PR")
    target_args(p)
    p.add_argument("head_branch", help="must already be pushed to the remote")
    p.add_argument("--title", required=True)
    p.add_argument("--description-file", required=True)
    p.add_argument("--target", help="base branch (default: repository default branch)")
    p.add_argument("--keep-branch", action="store_true", help="required for epic branches")
    p.add_argument("--merge", action="store_true", help="merge straight after creating")
    p.add_argument("--allow-closing-keywords", action="store_true")
    method_arg(p)
    p.set_defaults(func=cmd_create)

    p = sub.add_parser("merge", help="merge an existing PR")
    target_args(p)
    p.add_argument("number", type=int)
    p.add_argument("--keep-branch", action="store_true")
    method_arg(p)
    p.set_defaults(func=cmd_merge)

    p = sub.add_parser("delete-branch", help="delete a branch, containment checked")
    target_args(p)
    p.add_argument("branch")
    p.add_argument("--target")
    p.set_defaults(func=cmd_delete_branch)

    p = sub.add_parser("view", help="show one PR")
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
