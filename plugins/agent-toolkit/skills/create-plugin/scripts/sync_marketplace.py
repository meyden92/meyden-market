#!/usr/bin/env python3
"""Reconcile .claude-plugin/marketplace.json with the plugins/ directory.

Usage:
    sync_marketplace.py [--root DIR] [--plugin NAME] [--check]

Every plugin under <root>/plugins/ that has a .claude-plugin/plugin.json gets an
entry in the marketplace catalog, with `description` and `keywords` mirrored from
its manifest.

`category` is NOT mirrored. It is a marketplace-entry field and `claude plugin
validate --strict` rejects it inside plugin.json, so there is no manifest value
to mirror from. Treating it as mirrored meant every sync silently deleted a
category the catalog had been carrying.

`version` is deliberately never written into the marketplace entry. Claude Code
resolves a plugin's version from plugin.json first; only `claude plugin validate`
warns about a disagreement, so a version carried in both files can mask the one
you edited. Keeping it in plugin.json alone makes drift impossible.

Exit codes: 0 clean (or written), 1 drift found under --check, 2 usage error.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

MIRRORED = ("description", "keywords")


def find_root(start: Path) -> Path | None:
    for d in [start, *start.parents]:
        if (d / ".claude-plugin" / "marketplace.json").is_file():
            return d
    return None


def load_json(path: Path) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        sys.exit(f"error: {path}: invalid JSON: {exc}")


def main() -> int:
    ap = argparse.ArgumentParser(add_help=True)
    ap.add_argument("--root", help="marketplace root (default: walk up from cwd)")
    ap.add_argument("--plugin", help="only reconcile this plugin")
    ap.add_argument("--check", action="store_true", help="report drift, write nothing")
    args = ap.parse_args()

    root = Path(args.root).resolve() if args.root else find_root(Path.cwd())
    if root is None:
        sys.exit(
            "error: no .claude-plugin/marketplace.json found walking up from cwd\n"
            "       pass --root <dir>, or bootstrap one with init_marketplace.sh"
        )
    manifest_path = root / ".claude-plugin" / "marketplace.json"
    if not manifest_path.is_file():
        sys.exit(f"error: {manifest_path} does not exist")

    catalog = load_json(manifest_path)
    if not isinstance(catalog, dict):
        sys.exit(f"error: {manifest_path}: expected a JSON object")
    entries = catalog.setdefault("plugins", [])
    if not isinstance(entries, list):
        sys.exit(f"error: {manifest_path}: 'plugins' must be an array")

    by_name = {e.get("name"): e for e in entries if isinstance(e, dict)}

    plugins_dir = root / "plugins"
    found: dict[str, dict] = {}
    if plugins_dir.is_dir():
        for d in sorted(p for p in plugins_dir.iterdir() if p.is_dir()):
            pj = d / ".claude-plugin" / "plugin.json"
            if pj.is_file():
                found[d.name] = load_json(pj)

    if args.plugin:
        if args.plugin not in found:
            sys.exit(f"error: {plugins_dir / args.plugin}/.claude-plugin/plugin.json not found")
        found = {args.plugin: found[args.plugin]}

    changes: list[str] = []   # things this script writes
    issues: list[str] = []    # things only a human can fix

    catalog_desc = catalog.get("description", "")
    if not catalog_desc:
        issues.append("CATALOG  marketplace.json: no 'description', so users see nothing when browsing")
    elif "TODO" in catalog_desc:
        issues.append("CATALOG  marketplace.json: description still says TODO")

    for name, pj in found.items():
        declared = pj.get("name")
        if declared and declared != name:
            issues.append(
                f"MISMATCH plugins/{name}: plugin.json declares name '{declared}' but the "
                f"directory is '{name}'; rename one so they agree"
            )
        entry = by_name.get(name)
        if entry is None:
            entry = {"name": name, "source": f"./plugins/{name}"}
            entries.append(entry)
            by_name[name] = entry
            changes.append(f"ADD      {name}: entry created with source ./plugins/{name}")

        want_source = f"./plugins/{name}"
        if entry.get("source") != want_source:
            changes.append(f"SOURCE   {name}: {entry.get('source')!r} -> {want_source!r}")
            entry["source"] = want_source

        for field in MIRRORED:
            if field in pj:
                if entry.get(field) != pj[field]:
                    changes.append(f"FIELD    {name}.{field}: mirrored from plugin.json")
                    entry[field] = pj[field]
            elif field in entry:
                changes.append(f"FIELD    {name}.{field}: dropped (absent from plugin.json)")
                del entry[field]

        if "version" in entry:
            changes.append(
                f"VERSION  {name}: removed from the marketplace entry; "
                f"plugin.json ({pj.get('version', 'unset')}) is the single source"
            )
            del entry["version"]

    if not args.plugin:
        for n in [n for n in by_name if n not in found]:
            issues.append(
                f"ORPHAN   {n}: listed in marketplace.json with no plugins/{n}/ directory. "
                f"Remove the entry and add a 'renames' mapping so installed users migrate"
            )

    for line in changes + issues:
        print(line)

    if args.check:
        if changes or issues:
            print(f"\n{len(changes)} unwritten change(s), {len(issues)} issue(s)")
            return 1
        print(f"marketplace.json is in sync ({len(found)} plugin(s) checked)")
        return 0

    if changes:
        manifest_path.write_text(
            json.dumps(catalog, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
        )
        print(f"\nwrote {manifest_path}")
    elif not issues:
        print(f"marketplace.json is in sync ({len(found)} plugin(s) checked)")

    if issues:
        print(f"\n{len(issues)} issue(s) need a manual fix")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
