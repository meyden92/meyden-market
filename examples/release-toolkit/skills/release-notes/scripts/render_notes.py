#!/usr/bin/env python3
"""Render classified changes as markdown release notes.

Stage 3 of the release-notes pipeline. Reads the JSON document produced by
`classify_changes.py`, writes markdown to stdout.

    ./collect_commits.py --range v1.4.0..HEAD \\
      | ./classify_changes.py --current-version 1.4.0 \\
      | ./render_notes.py --style changelog

Styles:
    changelog   Keep a Changelog section, ready to prepend to CHANGELOG.md
    announce    Prose-led notes for a release announcement
    review      Everything including excluded and churn commits, for a human check

The output shape is documented in `references/release-notes-template.md`.
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

SECTION_ORDER = ["Added", "Changed", "Deprecated", "Removed", "Fixed", "Security"]


def format_entry(entry: dict, *, show_sha: bool, show_scope: bool) -> str:
    """Format one commit as a changelog bullet."""
    text = entry["description"]
    text = text[:1].upper() + text[1:] if text else text
    text = text.rstrip(".")

    if show_scope and entry.get("scope"):
        text = f"**{entry['scope']}:** {text}"

    if entry.get("breaking"):
        note = entry.get("breaking_note")
        text = f"**BREAKING:** {text}"
        if note:
            text = f"{text} — {note.rstrip('.')}"

    if show_sha:
        text = f"{text} ({entry['short_sha']})"

    return f"- {text}"


def render_changelog(data: dict, version: str, date: str, *, show_sha: bool, show_scope: bool) -> str:
    lines = [f"## [{version}] - {date}", ""]

    breaking = data.get("breaking") or []
    if breaking:
        lines.append("### Breaking changes")
        lines.append("")
        for entry in breaking:
            lines.append(format_entry(entry, show_sha=show_sha, show_scope=show_scope))
        lines.append("")

    sections = data.get("sections") or {}
    for name in SECTION_ORDER:
        entries = [e for e in sections.get(name, []) if not e.get("breaking")]
        if not entries:
            continue
        lines.append(f"### {name}")
        lines.append("")
        for entry in entries:
            lines.append(format_entry(entry, show_sha=show_sha, show_scope=show_scope))
        lines.append("")

    if len(lines) == 2:
        lines.append("_No user-facing changes in this release._")
        lines.append("")

    return "\n".join(lines).rstrip() + "\n"


def render_announce(data: dict, version: str, date: str) -> str:
    stats = data.get("stats") or {}
    sections = data.get("sections") or {}
    breaking = data.get("breaking") or []

    lines = [f"# Release {version}", "", f"_{date}_", ""]

    added = len(sections.get("Added", []))
    fixed = len(sections.get("Fixed", []))
    summary = []
    if added:
        summary.append(f"{added} new {'feature' if added == 1 else 'features'}")
    if fixed:
        summary.append(f"{fixed} {'fix' if fixed == 1 else 'fixes'}")
    if breaking:
        summary.append(f"{len(breaking)} breaking {'change' if len(breaking) == 1 else 'changes'}")
    if summary:
        lines.append(f"This release contains {', '.join(summary)}.")
        lines.append("")

    if breaking:
        lines.append("## Before you upgrade")
        lines.append("")
        for entry in breaking:
            lines.append(format_entry(entry, show_sha=False, show_scope=True))
        lines.append("")
        lines.append("> Replace this section with migration steps before publishing.")
        lines.append("")

    for name in SECTION_ORDER:
        entries = [e for e in sections.get(name, []) if not e.get("breaking")]
        if not entries:
            continue
        lines.append(f"## {name}")
        lines.append("")
        for entry in entries:
            lines.append(format_entry(entry, show_sha=False, show_scope=True))
        lines.append("")

    lines.append("---")
    lines.append("")
    lines.append(
        f"Full changes: `{data.get('range', 'unknown range')}` "
        f"({stats.get('total', 0)} commits)"
    )
    lines.append("")
    return "\n".join(lines)


def render_review(data: dict, version: str, date: str) -> str:
    lines = [render_changelog(data, version, date, show_sha=True, show_scope=True)]
    lines.append("")
    lines.append("<!-- REVIEW SECTION — delete before publishing -->")
    lines.append("")

    stats = data.get("stats") or {}
    lines.append(
        f"Bump: **{data.get('bump')}** ({data.get('bump_reason')})  \n"
        f"Range: `{data.get('range')}`  \n"
        f"Commits: {stats.get('total', 0)} total, "
        f"{stats.get('included', 0)} included, "
        f"{stats.get('excluded', 0)} excluded, "
        f"{stats.get('churn', 0)} churn, "
        f"{stats.get('unconventional', 0)} unconventional"
    )
    lines.append("")

    for key, heading in (
        ("excluded", "Excluded (not user-facing)"),
        ("churn", "Churn (reverted within range)"),
        ("unconventional", "Unconventional subjects — verify placement"),
    ):
        entries = data.get(key) or []
        if not entries:
            continue
        lines.append(f"### {heading}")
        lines.append("")
        for entry in entries:
            reason = entry.get("reason")
            suffix = f" — {reason}" if reason else ""
            lines.append(f"- `{entry['short_sha']}` {entry['description']}{suffix}")
        lines.append("")

    return "\n".join(lines)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Render classified changes as markdown release notes."
    )
    parser.add_argument(
        "input",
        nargs="?",
        help="classified JSON from classify_changes.py (default: stdin)",
    )
    parser.add_argument(
        "--style",
        choices=["changelog", "announce", "review"],
        default="changelog",
        help="output style (default: changelog)",
    )
    parser.add_argument(
        "--version",
        dest="version",
        help="version to render (default: next_version from the input)",
    )
    parser.add_argument(
        "--date",
        help="release date as YYYY-MM-DD (default: today, UTC)",
    )
    parser.add_argument("--no-sha", action="store_true", help="omit commit SHAs")
    parser.add_argument("--no-scope", action="store_true", help="omit commit scopes")
    parser.add_argument("-o", "--output", help="write markdown here instead of stdout")
    args = parser.parse_args(argv)

    try:
        raw = (
            Path(args.input).read_text(encoding="utf-8")
            if args.input
            else sys.stdin.read()
        )
        data = json.loads(raw)
    except OSError as exc:
        print(f"error: cannot read {args.input}: {exc}", file=sys.stderr)
        return 2
    except json.JSONDecodeError as exc:
        print(f"error: input is not valid JSON: {exc}", file=sys.stderr)
        return 2

    version = args.version or data.get("next_version") or data.get("current_version")
    if not version:
        print(
            "error: no version to render — pass --version, or run classify_changes.py "
            "with --current-version so next_version is computed",
            file=sys.stderr,
        )
        return 2

    date = args.date or datetime.now(timezone.utc).strftime("%Y-%m-%d")

    if args.style == "changelog":
        output = render_changelog(
            data, version, date, show_sha=not args.no_sha, show_scope=not args.no_scope
        )
    elif args.style == "announce":
        output = render_announce(data, version, date)
    else:
        output = render_review(data, version, date)

    if args.output:
        with open(args.output, "w", encoding="utf-8") as handle:
            handle.write(output)
        print(f"wrote {args.output}", file=sys.stderr)
    else:
        sys.stdout.write(output)

    return 0


if __name__ == "__main__":
    sys.exit(main())
