#!/usr/bin/env python3
"""Collect commits in a git range and emit them as JSON.

Stage 1 of the release-notes pipeline. Reads a repository, writes a commit
document to stdout. Standard library only.

    ./collect_commits.py --range v1.4.0..HEAD > commits.json
    ./collect_commits.py --repo /path/to/repo          # auto-resolves the base

Output schema:

    {
      "range": "v1.4.0..HEAD",
      "base": "v1.4.0",
      "head": "HEAD",
      "repo": "/abs/path",
      "commits": [
        {"sha", "short_sha", "author", "date", "subject", "body", "trailers": {...}}
      ]
    }
"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from pathlib import Path

# Record and field separators that cannot appear in a commit message.
RECORD_SEP = "\x1e"
FIELD_SEP = "\x1f"

GIT_FORMAT = FIELD_SEP.join(["%H", "%h", "%an", "%aI", "%s", "%b"]) + RECORD_SEP

TRAILER_RE = re.compile(r"^(?P<key>[A-Za-z][A-Za-z0-9 -]*)\s*:\s*(?P<value>.+)$")


class GitError(RuntimeError):
    """A git invocation failed in a way the caller needs to see."""


def git(repo: Path, *args: str) -> str:
    """Run a git command in `repo` and return stdout, raising on failure."""
    result = subprocess.run(
        ["git", "-C", str(repo), *args],
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        raise GitError(
            f"git {' '.join(args)} failed ({result.returncode}): "
            f"{result.stderr.strip() or 'no stderr'}"
        )
    return result.stdout


def resolve_base(repo: Path) -> str:
    """Return the most recent tag, or the root commit when the repo has no tags.

    A repository with no tags is a first release, not an error.
    """
    try:
        return git(repo, "describe", "--tags", "--abbrev=0").strip()
    except GitError:
        pass

    roots = git(repo, "rev-list", "--max-parents=0", "HEAD").split()
    if not roots:
        raise GitError("repository has no commits")
    return roots[-1]


def parse_trailers(body: str) -> dict[str, str]:
    """Extract `Key: value` trailers from a commit body.

    Only the trailing block of the message is considered, so a `Note:` line in
    the middle of a prose paragraph is not mistaken for a trailer. Keys are
    lowercased; `BREAKING CHANGE` becomes `breaking change`.
    """
    trailers: dict[str, str] = {}
    for line in reversed(body.strip().splitlines()):
        stripped = line.strip()
        if not stripped:
            break
        match = TRAILER_RE.match(stripped)
        if not match:
            break
        trailers[match.group("key").strip().lower()] = match.group("value").strip()
    return trailers


def collect(repo: Path, rev_range: str, include_merges: bool) -> list[dict]:
    """Return the parsed commits in `rev_range`, newest first."""
    args = ["log", f"--format={GIT_FORMAT}"]
    if not include_merges:
        args.append("--no-merges")
    args.append(rev_range)

    raw = git(repo, *args)

    commits = []
    for record in raw.split(RECORD_SEP):
        record = record.strip("\n")
        if not record.strip():
            continue
        fields = record.split(FIELD_SEP)
        if len(fields) < 6:
            # Defensive: a malformed record means the format string and the
            # parser disagree. Surface it rather than silently dropping work.
            print(
                f"warning: skipping malformed git log record: {record!r}",
                file=sys.stderr,
            )
            continue
        sha, short_sha, author, date, subject, body = fields[:6]
        commits.append(
            {
                "sha": sha,
                "short_sha": short_sha,
                "author": author,
                "date": date,
                "subject": subject,
                "body": body.strip(),
                "trailers": parse_trailers(body),
            }
        )
    return commits


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Collect commits in a git range and emit them as JSON."
    )
    parser.add_argument(
        "--repo",
        type=Path,
        default=Path.cwd(),
        help="repository to read (default: current directory)",
    )
    parser.add_argument(
        "--range",
        dest="rev_range",
        help="git range such as v1.4.0..HEAD (default: <latest tag>..HEAD)",
    )
    parser.add_argument(
        "--include-merges",
        action="store_true",
        help="keep merge commits (excluded by default)",
    )
    parser.add_argument(
        "-o",
        "--output",
        type=Path,
        help="write JSON here instead of stdout",
    )
    args = parser.parse_args(argv)

    repo = args.repo.resolve()

    try:
        git(repo, "rev-parse", "--git-dir")
    except GitError:
        print(f"error: {repo} is not a git repository", file=sys.stderr)
        return 2

    try:
        if args.rev_range:
            rev_range = args.rev_range
            base, _, head = rev_range.partition("..")
            head = head or "HEAD"
        else:
            base = resolve_base(repo)
            head = "HEAD"
            rev_range = f"{base}..{head}"

        commits = collect(repo, rev_range, args.include_merges)
    except GitError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1

    document = {
        "range": rev_range,
        "base": base,
        "head": head,
        "repo": str(repo),
        "commits": commits,
    }

    payload = json.dumps(document, indent=2, ensure_ascii=False)
    if args.output:
        args.output.write_text(payload + "\n", encoding="utf-8")
        print(f"wrote {len(commits)} commits to {args.output}", file=sys.stderr)
    else:
        print(payload)

    if not commits:
        print(f"warning: no commits in range {rev_range}", file=sys.stderr)

    return 0


if __name__ == "__main__":
    sys.exit(main())
