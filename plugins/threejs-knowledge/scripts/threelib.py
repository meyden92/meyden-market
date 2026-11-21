"""Shared helpers for three-check and the session hook. Standard library only."""
import json
import os
import re

SKILLS_TARGET = 186
SOURCE_EXT = (".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs", ".html", ".vue", ".svelte", ".astro", ".glsl", ".vert", ".frag")
SKIP_DIRS = {"node_modules", ".git", "dist", "build", ".next", ".nuxt", ".output", "coverage", ".vite", ".turbo", "out"}
THREE_HINT = re.compile(r"""from\s+["'](three|@react-three/)|import\(["']three|\bTHREE\.|["']three["']\s*:|three@\d""")
_RELEASE = re.compile(r"(?<![\d.])0\.(\d{2,3})(?:\.\d+)?")


def read_json(path):
    try:
        with open(path, encoding="utf-8") as fh:
            return json.load(fh)
    except (OSError, ValueError):
        return None


def read_text(path, limit=400_000):
    try:
        with open(path, encoding="utf-8", errors="replace") as fh:
            return fh.read(limit)
    except OSError:
        return ""


def release_of(version):
    """'0.186.0' or '^0.170.0' -> 186 / 170; None when it is not a three version."""
    match = _RELEASE.search(version or "")
    return int(match.group(1)) if match else None


def package_dirs(start):
    """Directories from `start` upward that hold a package.json."""
    current = os.path.abspath(start)
    while True:
        if os.path.isfile(os.path.join(current, "package.json")):
            yield current
        parent = os.path.dirname(current)
        if parent == current:
            return
        current = parent


def installed(start, name):
    """Version string of package `name` as seen from `start`: installed copy first, declared range second."""
    declared = None
    for directory in package_dirs(start):
        found = read_json(os.path.join(directory, "node_modules", *name.split("/"), "package.json"))
        if found and found.get("version"):
            return found["version"]
        if declared is None:
            manifest = read_json(os.path.join(directory, "package.json")) or {}
            for key in ("dependencies", "devDependencies", "peerDependencies"):
                if name in (manifest.get(key) or {}):
                    declared = manifest[key][name]
                    break
    return declared


def html_release(text):
    """three release named in an import map or CDN URL, e.g. three@0.186.0."""
    match = re.search(r"three@(0\.\d{2,3}(?:\.\d+)?)", text)
    return release_of(match.group(1)) if match else None


def load_rules():
    here = os.path.dirname(os.path.abspath(__file__))
    rules = read_json(os.path.join(here, "rules.json")) or []
    for rule in rules:
        rule["regex"] = re.compile(rule["pattern"])
    return rules


def scan(text, rules, release):
    """Findings as (line, rule) for every rule that applies at `release` (None = current)."""
    findings = []
    for number, line in enumerate(text.splitlines(), 1):
        for rule in rules:
            if release is not None and release < rule["since"]:
                continue
            if rule["regex"].search(line):
                findings.append((number, rule))
    return findings


def source_files(root, cap=4000):
    count = 0
    for directory, subdirs, files in os.walk(root):
        subdirs[:] = [d for d in subdirs if d not in SKIP_DIRS and not d.startswith(".")]
        for name in files:
            if name.endswith(SOURCE_EXT):
                yield os.path.join(directory, name)
                count += 1
                if count >= cap:
                    return
