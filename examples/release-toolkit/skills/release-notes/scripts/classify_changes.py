#!/usr/bin/env python3
"""Classify collected commits and derive the semantic version bump.

Stage 2 of the release-notes pipeline. Reads the JSON document produced by
`collect_commits.py`, writes a classified document to stdout.

    ./collect_commits.py --range v1.4.0..HEAD | ./classify_changes.py --current-version 1.4.0

The conventional-commit rules this implements are documented in
`references/commit-conventions.md`; the bump rules in
`references/versioning-policy.md`. Change them together.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

# type(scope)!: description
CONVENTIONAL_RE = re.compile(
    r"^(?P<type>[a-zA-Z]+)"
    r"(?:\((?P<scope>[^)]*)\))?"
    r"(?P<breaking>!)?"
    r":\s*(?P<description>.+)$"
)

REVERT_RE = re.compile(r'^[Rr]evert\s+"?(?P<subject>.+?)"?$')

# Commit type -> Keep a Changelog section. Types mapped to None are real work
# but produce no user-visible change, so they are excluded from the notes.
TYPE_SECTIONS: dict[str, str | None] = {
    "feat": "Added",
    "feature": "Added",
    "fix": "Fixed",
    "bugfix": "Fixed",
    "perf": "Changed",
    "change": "Changed",
    "deprecate": "Deprecated",
    "remove": "Removed",
    "security": "Security",
    "revert": "Changed",
    "docs": None,
    "refactor": None,
    "test": None,
    "tests": None,
    "chore": None,
    "ci": None,
    "build": None,
    "style": None,
}

SECTION_ORDER = ["Added", "Changed", "Deprecated", "Removed", "Fixed", "Security"]

BUMP_RANK = {"patch": 0, "minor": 1, "major": 2}

VERSION_RE = re.compile(
    r"^v?(?P<major>\d+)\.(?P<minor>\d+)\.(?P<patch>\d+)"
    r"(?:-(?P<prerelease>[0-9A-Za-z.-]+))?"
    r"(?:\+(?P<build>[0-9A-Za-z.-]+))?$"
)


def parse_subject(subject: str) -> dict:
    """Split a commit subject into conventional-commit parts.

    A subject that does not follow the convention is returned with
    `conventional: False` and is reported rather than guessed at.
    """
    match = CONVENTIONAL_RE.match(subject)
    if not match:
        return {
            "conventional": False,
            "type": None,
            "scope": None,
            "breaking": False,
            "description": subject.strip(),
        }
    return {
        "conventional": True,
        "type": match.group("type").lower(),
        "scope": (match.group("scope") or "").strip() or None,
        "breaking": match.group("breaking") == "!",
        "description": match.group("description").strip(),
    }


def is_breaking(commit: dict, parsed: dict) -> tuple[bool, str | None]:
    """Return whether a commit is breaking and the note explaining why."""
    trailers = {k.lower(): v for k, v in (commit.get("trailers") or {}).items()}
    for key in ("breaking change", "breaking-change"):
        if key in trailers:
            return True, trailers[key]
    if parsed["breaking"]:
        return True, None
    # A `BREAKING CHANGE:` paragraph that is not in the trailer block still counts.
    body = commit.get("body") or ""
    for line in body.splitlines():
        stripped = line.strip()
        if stripped.upper().startswith(("BREAKING CHANGE:", "BREAKING-CHANGE:")):
            return True, stripped.split(":", 1)[1].strip()
    return False, None


def find_reverted(commits: list[dict]) -> set[str]:
    """Return SHAs of commits that cancel out inside this range.

    A `Revert "X"` commit and the commit whose subject is `X` are both churn:
    the net change is zero, so neither belongs in the release notes. Only the
    nearest preceding match is cancelled, so a revert-of-a-revert leaves the
    original change standing.
    """
    churn: set[str] = set()
    # Oldest first, so "preceding" means what it says.
    ordered = list(reversed(commits))
    for index, commit in enumerate(ordered):
        match = REVERT_RE.match(commit["subject"].strip())
        if not match:
            continue
        target = match.group("subject").strip().rstrip('"')
        for candidate in reversed(ordered[:index]):
            if candidate["sha"] in churn:
                continue
            if candidate["subject"].strip().strip('"') == target:
                churn.add(candidate["sha"])
                churn.add(commit["sha"])
                break
    return churn


def bump_version(current: str, bump: str) -> str:
    """Apply a semver bump to `current`, preserving a leading `v` if present."""
    match = VERSION_RE.match(current.strip())
    if not match:
        raise ValueError(f"not a semantic version: {current!r}")

    prefix = "v" if current.strip().startswith("v") else ""
    major = int(match.group("major"))
    minor = int(match.group("minor"))
    patch = int(match.group("patch"))

    # A prerelease being promoted to a release consumes the bump: 2.0.0-rc.1
    # with any bump becomes 2.0.0, not 2.1.0.
    if match.group("prerelease"):
        return f"{prefix}{major}.{minor}.{patch}"

    if bump == "major":
        # 0.x is unstable: a breaking change bumps the minor, per the policy in
        # references/versioning-policy.md.
        if major == 0:
            return f"{prefix}0.{minor + 1}.0"
        return f"{prefix}{major + 1}.0.0"
    if bump == "minor":
        return f"{prefix}{major}.{minor + 1}.0"
    return f"{prefix}{major}.{minor}.{patch + 1}"


def classify(document: dict, current_version: str | None) -> dict:
    commits = document.get("commits", [])
    churn_shas = find_reverted(commits)

    sections: dict[str, list[dict]] = {name: [] for name in SECTION_ORDER}
    breaking: list[dict] = []
    excluded: list[dict] = []
    churn: list[dict] = []
    unconventional: list[dict] = []

    bump = "patch"
    bump_reason = "no feature or breaking commits in range"

    for commit in commits:
        parsed = parse_subject(commit["subject"])
        breaks, note = is_breaking(commit, parsed)

        entry = {
            "sha": commit["sha"],
            "short_sha": commit.get("short_sha", commit["sha"][:7]),
            "author": commit.get("author"),
            "type": parsed["type"],
            "scope": parsed["scope"],
            "description": parsed["description"],
            "breaking": breaks,
            "breaking_note": note,
        }

        if commit["sha"] in churn_shas:
            churn.append({**entry, "reason": "reverted within this range"})
            continue

        if not parsed["conventional"]:
            unconventional.append(entry)
            # An unclassifiable commit is surfaced, not dropped. It lands in
            # Changed so a human sees it and can move or delete it.
            sections["Changed"].append(entry)
            continue

        if breaks:
            breaking.append(entry)
            if BUMP_RANK[bump] < BUMP_RANK["major"]:
                bump = "major"
                bump_reason = f"{entry['short_sha']} {commit['subject']}"
        elif parsed["type"] in ("feat", "feature"):
            if BUMP_RANK[bump] < BUMP_RANK["minor"]:
                bump = "minor"
                bump_reason = f"{entry['short_sha']} {commit['subject']}"

        section = TYPE_SECTIONS.get(parsed["type"], "Changed")
        if section is None:
            excluded.append({**entry, "reason": f"'{parsed['type']}' is not user-facing"})
            continue
        sections[section].append(entry)

    result = {
        "range": document.get("range"),
        "base": document.get("base"),
        "head": document.get("head"),
        "bump": bump,
        "bump_reason": bump_reason,
        "current_version": current_version,
        "next_version": None,
        "sections": {name: sections[name] for name in SECTION_ORDER if sections[name]},
        "breaking": breaking,
        "excluded": excluded,
        "churn": churn,
        "unconventional": unconventional,
        "stats": {
            "total": len(commits),
            "included": sum(len(v) for v in sections.values()),
            "excluded": len(excluded),
            "churn": len(churn),
            "unconventional": len(unconventional),
        },
    }

    if current_version:
        try:
            result["next_version"] = bump_version(current_version, bump)
        except ValueError as exc:
            print(f"warning: {exc}", file=sys.stderr)

    return result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Classify collected commits and derive the semantic version bump."
    )
    parser.add_argument(
        "input",
        nargs="?",
        help="commit JSON from collect_commits.py (default: stdin)",
    )
    parser.add_argument(
        "--current-version",
        help="current project version, used to compute next_version",
    )
    args = parser.parse_args(argv)

    try:
        raw = (
            Path(args.input).read_text(encoding="utf-8")
            if args.input
            else sys.stdin.read()
        )
        document = json.loads(raw)
    except OSError as exc:
        print(f"error: cannot read {args.input}: {exc}", file=sys.stderr)
        return 2
    except json.JSONDecodeError as exc:
        print(f"error: input is not valid JSON: {exc}", file=sys.stderr)
        return 2

    if "commits" not in document:
        print("error: input has no 'commits' key — is this collect_commits.py output?", file=sys.stderr)
        return 2

    print(json.dumps(classify(document, args.current_version), indent=2, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
