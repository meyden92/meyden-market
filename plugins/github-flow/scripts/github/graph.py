#!/usr/bin/env python3
"""The blocker chain around an issue: what must land first, what this frees up.

Answers the two questions that decide whether work can start:

    "What has to be done before I can touch this?"   (blocked by, upwards)
    "What does finishing this unblock?"              (blocking, downwards)

Both are resolved transitively, because a blocker three levels up still blocks.
Closed dependencies are marked resolved rather than hidden: a chain whose
blockers are all closed reads very differently from an issue with no blockers
at all, and the distinction is the answer to "can I start?".

The native sub-issue hierarchy is shown alongside: it is a separate mechanism
from dependencies (membership, not ordering), and leaving it out makes an
issue with a full breakdown look exactly like one with nothing planned.

Usage (repo defaults to the current directory's git remote):

    meyden-gh graph <number> [-R owner/repo] [--json]
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "lib"))
from gh_common import GhError, api, repo_path  # noqa: E402

# A runaway chain means the dependency data is wrong; printing 200 levels of
# it helps nobody, so the walk stops well before that.
MAX_DEPTH = 8

REPOSITORY_URL = re.compile(r"/repos/([^/]+/[^/]+)$")

DIRECTION_PATH = {"blocked_by": "blocked_by", "blocking": "blocking"}


def repo_of(issue: dict, fallback: str | None) -> str | None:
    """The repository a dependency entry lives in: edges may cross repos."""
    match = REPOSITORY_URL.search(issue.get("repository_url", ""))
    return match.group(1) if match else fallback


def assignees(issue: dict) -> str:
    return ",".join(a["login"] for a in issue.get("assignees", [])) or "-"


def label_names(issue: dict) -> list[str]:
    return [entry["name"] for entry in issue.get("labels", []) if isinstance(entry, dict)]


def planning_labels(issue: dict) -> str:
    """Only labels that bear on sequencing; everything else is noise here."""
    keep = [
        name
        for name in label_names(issue)
        if name.lower().startswith(("stream", "prio", "status", "type", "epic"))
    ]
    return " ".join(keep)


def walk(repo, number: int, direction: str, seen: set[tuple[str, int]], depth: int = 0) -> list[dict]:
    """Collect dependencies in one direction, transitively.

    `seen` guards against cycles: a mutual blocker pair would otherwise recurse
    forever, and that is precisely the sort of data error worth surfacing
    rather than hanging on. Keys are (repo, number) because edges may cross
    repositories.
    """
    key = (repo or "", number)
    if depth >= MAX_DEPTH or key in seen:
        return []
    seen.add(key)

    out: list[dict] = []
    linked = api(
        f"repos/{repo_path(repo)}/issues/{number}/dependencies/{DIRECTION_PATH[direction]}",
        paginate=True,
    ) or []
    for issue in linked:
        child_repo = repo_of(issue, repo)
        out.append(
            {
                "number": issue["number"],
                "repo": child_repo,
                "title": issue.get("title", ""),
                "state": issue.get("state", "?"),
                "assignees": assignees(issue),
                "labels": planning_labels(issue),
                "depth": depth,
                "children": walk(child_repo, issue["number"], direction, seen, depth + 1),
            }
        )
    return out


def flatten(nodes: list[dict]) -> list[dict]:
    out: list[dict] = []
    for node in nodes:
        out.append(node)
        out.extend(flatten(node["children"]))
    return out


def render(nodes: list[dict], indent: int = 1) -> None:
    for node in nodes:
        mark = "[done]" if node["state"] == "closed" else "[open]"
        pad = "  " * indent
        labels = f"  [{node['labels']}]" if node["labels"] else ""
        print(f"{pad}{mark} #{node['number']:<5} {node['title'][:58]}")
        print(f"{pad}       {node['state']}, {node['assignees']}{labels}")
        render(node["children"], indent + 1)


def main() -> int:
    parser = argparse.ArgumentParser(prog="meyden-gh graph", description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("number")
    parser.add_argument("-R", "--repo", help="owner/repo (default: current repo)")
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args()

    try:
        number = int(str(args.number).lstrip("#"))
    except ValueError:
        print(f"{args.number!r} is not an issue number")
        return 2

    try:
        issue = api(f"repos/{repo_path(args.repo)}/issues/{number}")
        if issue.get("pull_request"):
            print(
                f"#{number} is a pull request, not an issue: GitHub numbers both "
                "from the same sequence. Dependencies live on issues."
            )
            return 2
        blockers = walk(args.repo, number, "blocked_by", set())
        blocks = walk(args.repo, number, "blocking", set())
    except GhError as exc:
        print(str(exc))
        return 1

    if args.json:
        print(
            json.dumps(
                {
                    "number": number,
                    "title": issue["title"],
                    "state": issue["state"],
                    "assignees": assignees(issue),
                    "blocked_by": blockers,
                    "blocking": blocks,
                },
                indent=2,
                ensure_ascii=False,
            )
        )
        return 0

    labels = planning_labels(issue)
    print(f"#{number} {issue['title']}")
    print(f"  {issue['state']}, {assignees(issue)}" + (f"  [{labels}]" if labels else ""))

    all_blockers = flatten(blockers)
    open_blockers = [n for n in all_blockers if n["state"] != "closed"]

    # Three distinct states, and collapsing them is what makes this misleading:
    # blockers exist and are open; blockers existed and are all closed; no
    # dependency was ever recorded, which says nothing about readiness, only
    # that nobody wrote the ordering down.
    if open_blockers:
        verdict = ""
    elif all_blockers:
        verdict = ": all blockers closed, READY TO START"
    else:
        verdict = ": none recorded"
    print(f"\n-- Blocked by ({len(open_blockers)} open of {len(all_blockers)}){verdict}")
    render(blockers) if blockers else print("  (none)")

    print(f"\n-- Blocking ({len(flatten(blocks))})")
    render(blocks) if blocks else print("  (none)")

    # The sub-issue hierarchy is a separate mechanism from dependencies:
    # membership, not ordering. Shown so an issue with a full breakdown does
    # not look like one with nothing planned.
    try:
        parent = api(f"repos/{repo_path(args.repo)}/issues/{number}/parent")
    except GhError:
        parent = None
    if parent:
        print(f"\n-- Parent\n  #{parent['number']:<5} {parent['title'][:58]}")
    try:
        children = api(
            f"repos/{repo_path(args.repo)}/issues/{number}/sub_issues?per_page=100",
            paginate=True,
        ) or []
    except GhError:
        children = []
    if children:
        done = sum(1 for c in children if c["state"] == "closed")
        print(f"\n-- Sub-issues ({done}/{len(children)} closed)")
        for child in children:
            mark = "[done]" if child["state"] == "closed" else "[open]"
            print(f"  {mark} #{child['number']:<5} {child['title'][:58]}")

    if not all_blockers and not flatten(blocks):
        print(
            "\nNote: no dependencies are recorded on this issue. That is not evidence "
            "that nothing blocks the work. Check the issue body and its sub-issues."
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
