#!/usr/bin/env python3
"""Shared plumbing for the github helper scripts.

Everything here goes through `gh api` rather than talking to the REST API
directly. That is a deliberate choice with three consequences worth knowing:

- **No credential handling.** `gh` supplies the token from its own store
  (OS keyring, or ~/.config/gh/hosts.yml). No GH_TOKEN needs to exist in the
  environment, so no token can be recorded into a permission pattern, a
  settings file, or a session transcript.
- **No hardcoded repository.** The `{owner}`/`{repo}` placeholders expand from
  the current directory's git remote; an explicit `owner/repo` passes through
  as-is (GitHub paths are flat: no nested groups, no URL-encoding needed).
- **One flag trap, inherited from the CLI.** `gh api -f` is the *raw string*
  flag and `-F` the *typed* one, the exact inverse of glab. The `fields`/
  `raw_fields` split below hides that: `fields` values are typed (`-F`),
  `raw_fields` values stay strings (`-f`). Getting it backwards silently turns
  a body of "true" into a boolean.

GitHub API objects do not embed live secrets the way GitLab's project object
carried `runners_token`, but `scrub()` stays as cheap insurance for anything
echoed wholesale to stdout.
"""

from __future__ import annotations

import json
import re
import subprocess
import sys
from typing import Any, NoReturn

# Keys whose values are credentials in some API payloads. Matched as
# substrings so `node_id`-style false positives are avoided but `*_token` and
# `*_secret` are caught.
SENSITIVE_KEY_PARTS = ("token", "password", "secret", "private_key", "passphrase")

# Lifecycle stages every project models somehow, mapped to the label names
# projects actually use for them. The skill enforces the *workflow*; the
# vocabulary is whatever the project already has, because inventing a
# near-duplicate label silently splits boards and saved filters.
#
# Values are matched case-insensitively against the label name and, for
# prefixed labels (`Status: Todo`), against the part after the colon.
LIFECYCLE_SYNONYMS: dict[str, tuple[str, ...]] = {
    "todo": ("erstellt", "todo", "to do", "open", "offen", "backlog", "neu", "new", "created"),
    "doing": ("in arbeit", "doing", "in progress", "progress", "wip", "active", "bearbeitung"),
    "testing": (
        "testing", "test", "review", "review needed", "needs review", "ready for review",
        "in review", "qa", "verify", "validation", "abnahme", "verifizierung", "im test",
    ),
    "done": ("abgeschlossen", "done", "completed", "complete", "closed", "erledigt", "fertig", "resolved"),
}

BLOCKED_SYNONYMS = ("blockiert", "blocked", "on hold", "waiting", "wartet")


class GhError(RuntimeError):
    """A `gh` invocation failed. Carries the trimmed stderr for reporting."""


def scrub(value):
    """Recursively drop credential-bearing keys from an API payload.

    Applied before printing anything that came back from the API. A caller
    that formats specific fields by hand does not need this; a caller that
    echoes a whole object does.
    """
    if isinstance(value, dict):
        return {
            k: scrub(v)
            for k, v in value.items()
            if not any(part in k.lower() for part in SENSITIVE_KEY_PARTS)
        }
    if isinstance(value, list):
        return [scrub(v) for v in value]
    return value


def repo_path(repo: str | None) -> str:
    """Path segment for `repos/<here>`: the current repo, or an explicit one.

    `{owner}/{repo}` is expanded by gh from the current directory's git
    remote, so the common case needs no repository named at all.
    """
    return repo if repo else "{owner}/{repo}"


def api(
    path: str,
    method: str | None = None,
    fields: dict[str, Any] | None = None,
    raw_fields: dict[str, str] | None = None,
    paginate: bool = False,
    cwd: str | None = None,
) -> Any:
    """Call `gh api` and return the parsed JSON response.

    Typed `Any` on purpose: the shape is whatever the endpoint returns, and
    pretending otherwise only moves the guesswork into the annotations.

    `fields` uses `-F` (gh infers types: `true`, `42`, `@file`); a list value
    becomes repeated `key[]=v` pairs, which is how gh expresses JSON arrays.
    `raw_fields` uses `-f`, which always sends a string; use it for values
    that merely look like numbers or booleans (issue bodies, titles).

    Passing any field flips gh's default method to POST, so `method` is set
    explicitly whenever fields are present on a read.

    Pagination: `--paginate --slurp` wraps each page in an outer array, so the
    pages are flattened here: callers always see one flat list.
    """
    cmd = ["gh", "api", path]
    if method:
        cmd += ["--method", method]
    for key, value in (fields or {}).items():
        if isinstance(value, (list, tuple)):
            for item in value:
                cmd += ["--field", f"{key}[]={item}"]
        else:
            cmd += ["--field", f"{key}={value}"]
    for key, value in (raw_fields or {}).items():
        cmd += ["--raw-field", f"{key}={value}"]
    if paginate:
        cmd += ["--paginate", "--slurp"]

    result = subprocess.run(cmd, capture_output=True, text=True, cwd=cwd)
    if result.returncode != 0:
        raise GhError(_readable_error(result.stdout, result.stderr, path))
    if not result.stdout.strip():
        return None
    try:
        data = json.loads(result.stdout)
    except json.JSONDecodeError as exc:
        raise GhError(f"{path}: response was not JSON ({exc})") from exc
    if paginate and isinstance(data, list) and all(isinstance(page, list) for page in data):
        return [item for page in data for item in page]
    return data


def gh(*args: str, cwd: str | None = None) -> str:
    """Run a plain `gh` command (not `gh api`) and return its stdout.

    For the handful of operations where the CLI subcommand is the better
    interface than raw REST, e.g. `gh issue edit --add-label X
    --remove-label Y`, which applies both changes in one atomic call.
    """
    result = subprocess.run(["gh", *args], capture_output=True, text=True, cwd=cwd)
    if result.returncode != 0:
        raise GhError(_readable_error(result.stdout, result.stderr, " ".join(args[:2])))
    return result.stdout.strip()


def issue_db_id(repo: str | None, number: int) -> int:
    """The global database id of an issue, from its number.

    The classic endpoints and every `gh` subcommand take the per-repo
    `number`; the sub-issue and dependency endpoints take this global `id`
    instead. The two are not interchangeable, and passing a number where an
    id belongs fails with a misleading 404/422.
    """
    issue = api(f"repos/{repo_path(repo)}/issues/{number}")
    return issue["id"]


def _readable_error(stdout: str, stderr: str, path: str) -> str:
    """Turn gh's two-channel failure output into one line worth reading.

    gh prints its own message on stderr and the API body on stdout; the API
    body usually carries the actual reason ("Not Found"), so it wins when
    both are present.
    """
    blob = f"{stderr}\n{stdout}".strip()
    match = re.search(r'"(?:message|error)"\s*:\s*"([^"]+)"', blob)
    if match:
        return f"{path}: {match.group(1)}"
    match = re.search(r"^gh: (.+)$", blob, re.MULTILINE)
    if match:
        return f"{path}: {match.group(1)}"
    condensed = re.sub(r"\s+", " ", blob).strip()
    return f"{path}: {condensed[:200] or 'gh failed with no output'}"


def label_value(name: str) -> str:
    """Comparable form of a label name: prefix stripped, lowercased.

    `Status: Todo` and `todo` both reduce to `todo`, which is what makes the
    lifecycle mapping work across projects that prefix their labels and ones
    that don't.
    """
    _, _, tail = name.rpartition("::")
    _, sep, after_colon = tail.partition(":")
    return (after_colon if sep else tail).strip().lower()


def label_scope(name: str) -> str | None:
    """Prefix of a label, or None for an unprefixed one.

    GitHub has no scoped-label exclusivity: a `Status: Doing` and a
    `Status: Todo` stack silently, so a status change must always remove the
    stale sibling explicitly.
    """
    if "::" in name:
        return name.rsplit("::", 1)[0]
    if ":" in name:
        return name.split(":", 1)[0].strip()
    return None


def fetch_labels(repo: str | None = None) -> list[str]:
    """All label names defined on the repository."""
    labels = api(f"repos/{repo_path(repo)}/labels?per_page=100", paginate=True)
    return [entry["name"] for entry in (labels or [])]


def resolve_lifecycle(labels: list[str]) -> dict[str, str]:
    """Map each lifecycle stage to this repository's label for it.

    Returns only the stages that matched, so a caller can tell "this project
    calls it `Status: Doing`" apart from "this project has no in-progress
    label at all": the second case must not be answered by creating one.
    """
    resolved: dict[str, str] = {}
    for role, synonyms in LIFECYCLE_SYNONYMS.items():
        for name in labels:
            if label_value(name) in synonyms:
                resolved.setdefault(role, name)
                break
    return resolved


def resolve_blocked(labels: list[str]) -> str | None:
    """This repository's "blocked" label, if it has one."""
    for name in labels:
        if label_value(name) in BLOCKED_SYNONYMS:
            return name
    return None


def die(message: str, code: int = 1) -> NoReturn:
    """Abort with a message on stderr.

    Annotated `NoReturn` so callers can treat a `die()` on the failure branch
    as narrowing: `x = d.get(k)` followed by `if not x: die(...)` leaves `x`
    a plain `str` afterwards, which is exactly how it reads.
    """
    print(message, file=sys.stderr)
    raise SystemExit(code)
