#!/usr/bin/env python3
"""The GitHub repositories this repository covers: itself, plus its submodules.

A question asked inside a repository is about that repository. Without this,
"which issues are assigned to me" has no repo-scoped command behind it, so the
answer comes from an account-wide query and arrives mixed with issues from
projects the user is not working on.

Submodules count. A superproject whose code lives in its submodules is one
piece of work, and an overview that stops at the superproject describes almost
none of it.

Two details decide the implementation, both taken from real repositories here:

- **Submodule URLs may use ssh aliases** (`my-alias:group/project.git`) rather
  than `git@host:path`. The project path is still whatever follows the colon, so
  no host resolution is needed to read it.
- **`.gitmodules` is the source, not `git submodule foreach`.** Most submodules
  in a fresh clone are not checked out, and iterating working directories finds
  only the initialised ones, usually a minority. They are reported as not
  checked out rather than dropped: an issue in that project still belongs to
  this work.

One level only. Nested submodules are not walked.

Usage:
    meyden-gh scope [--root DIR] [--json]
"""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess

# scheme://[user@]host/owner/repo(.git)
URL_WITH_SCHEME = re.compile(r"^[a-zA-Z][a-zA-Z0-9+.-]*://(?:[^@/]+@)?[^/]+/(.+)$")
# host-or-alias:owner/repo(.git) -- the scp-like form, and the one ssh
# aliases take. No slash may appear before the colon, or a plain path with a
# colon in it would parse as a remote.
URL_SCP_LIKE = re.compile(r"^([^/:]+):(.+)$")


class ScopeError(RuntimeError):
    """The scope could not be resolved. Carries a message worth printing."""


def git(args: list[str], cwd: str) -> str:
    result = subprocess.run(
        ["git", *args], cwd=cwd, capture_output=True, text=True
    )
    if result.returncode != 0:
        return ""
    return result.stdout.strip()


def repo_root(start: str) -> str:
    root = git(["rev-parse", "--show-toplevel"], start)
    if not root:
        raise ScopeError(
            f"{start} is not inside a git repository, so there is no repository "
            "scope to resolve. Name the repository explicitly with -R owner/repo."
        )
    return root


def project_path_from_url(url: str) -> str | None:
    """`git@github.com:owner/repo.git` (or an ssh alias) -> `owner/repo`.

    Returns None for anything that does not carry an owner/repo path, a
    relative submodule URL, say. The caller reports those rather than dropping
    them, because a silently shortened scope is indistinguishable from a
    correct one.
    """
    url = url.strip()
    if not url:
        return None
    match = URL_WITH_SCHEME.match(url) or URL_SCP_LIKE.match(url)
    if not match:
        return None
    path = match.group(match.lastindex or 1).strip("/")
    if path.endswith(".git"):
        path = path[:-4]
    return path or None


def superproject_url(root: str) -> str:
    """The remote to read this repository's own project path from."""
    url = git(["remote", "get-url", "origin"], root)
    if url:
        return url
    remotes = git(["remote"], root).splitlines()
    if not remotes:
        raise ScopeError(
            f"{root} has no git remote, so its GitHub repository cannot be "
            "determined. Name it explicitly with -R owner/repo."
        )
    return git(["remote", "get-url", remotes[0].strip()], root)


def submodule_entries(root: str) -> list[tuple[str, str]]:
    """(directory, url) per submodule declared in .gitmodules, one level deep."""
    if not os.path.isfile(os.path.join(root, ".gitmodules")):
        return []
    raw = git(
        ["config", "-f", ".gitmodules", "--get-regexp", r"^submodule\..*\.(path|url)$"],
        root,
    )
    by_name: dict[str, dict[str, str]] = {}
    for line in raw.splitlines():
        key, _, value = line.partition(" ")
        # submodule.<name>.<field> -- the name may itself contain dots
        parts = key.split(".")
        if len(parts) < 3:
            continue
        name, field = ".".join(parts[1:-1]), parts[-1]
        by_name.setdefault(name, {})[field] = value.strip()
    return [
        (entry["path"], entry["url"])
        for entry in by_name.values()
        if entry.get("path") and entry.get("url")
    ]


def uninitialised(root: str) -> set[str]:
    """Submodule directories with no checkout, by `git submodule status`.

    A leading '-' marks one that is declared but not initialised.
    """
    out = set()
    for line in git(["submodule", "status"], root).splitlines():
        if not line:
            continue
        if line[0] == "-":
            fields = line[1:].split()
            if len(fields) >= 2:
                out.add(fields[1])
    return out


def resolve(start: str) -> dict:
    root = repo_root(start)
    projects = []
    unparsed = []

    own = project_path_from_url(superproject_url(root))
    if not own:
        raise ScopeError(
            f"could not read a GitHub repository path out of the remote of {root}."
        )
    projects.append({"path": own, "role": "repository", "dir": ".", "checked_out": True})

    missing = uninitialised(root)
    for directory, url in sorted(submodule_entries(root)):
        path = project_path_from_url(url)
        if not path:
            unparsed.append({"dir": directory, "url": url})
            continue
        projects.append({
            "path": path,
            "role": "submodule",
            "dir": directory,
            "checked_out": directory not in missing,
        })

    return {"root": root, "projects": projects, "unparsed": unparsed}


def render(scope: dict) -> None:
    projects = scope["projects"]
    submodules = [p for p in projects if p["role"] == "submodule"]
    if submodules:
        headline = "%d repositories (this repository + %d submodules)" % (
            len(projects), len(submodules)
        )
    else:
        headline = "1 repository (this repository, no submodules)"
    print("▶︎  GitHub scope: %s" % headline)

    width = max(len(p["path"]) for p in projects)
    for project in projects:
        if project["role"] == "repository":
            note = "(this repository)"
        else:
            note = project["dir"]
            if not project["checked_out"]:
                note += "   [not checked out]"
        print("   %-*s  %s" % (width, project["path"], note))

    for entry in scope["unparsed"]:
        print("‼️  submodule %s: no GitHub repository path in %r, not in scope."
              % (entry["dir"], entry["url"]))

    print()
    print("   This is the scope. A GitHub question asked here is about these")
    print("   repositories unless the user says otherwise.")


def main() -> int:
    parser = argparse.ArgumentParser(prog="meyden-gh scope", description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--root", default=os.getcwd(), help="repository directory (default: cwd)")
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args()

    try:
        scope = resolve(args.root)
    except ScopeError as exc:
        # Printed rather than raised: this runs inside a skill body, where a
        # traceback is noise and a sentence is usable.
        if args.json:
            print(json.dumps({"error": str(exc)}))
        else:
            print("❌ %s" % exc)
        return 1

    if args.json:
        print(json.dumps(scope, indent=2, ensure_ascii=False))
    else:
        render(scope)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
