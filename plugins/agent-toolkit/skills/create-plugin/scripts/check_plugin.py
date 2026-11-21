#!/usr/bin/env python3
"""Lint a plugin for the wiring and portability faults `claude plugin validate` does not cover.

Usage:
    check_plugin.py <plugin-dir> [<plugin-dir>...] [--strict]

`claude plugin validate` checks manifest and frontmatter *schemas*. It does not
check that the plugin will actually work once copied into the plugin cache on
someone else's machine. This checks that: component placement, executable bits,
path variables, dangling script references, unfilled scaffolds, hardcoded
host paths, and the contents of terminal theme files, which validate never opens.

Run both. This one first, because its failures are the ones that reproduce as
"the plugin loads but nothing happens".

Exit codes: 0 clean, 1 errors (or warnings under --strict), 2 usage error.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
from pathlib import Path

KEBAB = re.compile(r"^[a-z0-9]+(-[a-z0-9]+)*$")
SEMVER = re.compile(r"^\d+\.\d+\.\d+([-+].+)?$")
PLUGIN_VARS = ("${CLAUDE_PLUGIN_ROOT}", "${CLAUDE_PLUGIN_DATA}", "${CLAUDE_PROJECT_DIR}")
HOST_PATHS = re.compile(r"(/Users/[A-Za-z0-9._-]+|/home/[A-Za-z0-9._-]+|[A-Za-z]:\\\\?Users)")
COMPONENT_DIRS = ("skills", "commands", "agents", "hooks", "bin", "workflows",
                  "output-styles", "themes", "monitors", "scripts")
SKIP_DIRS = {".git", "node_modules", "__pycache__", ".venv", "venv"}
USER_CONFIG_KEY = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")

# Terminal theme files (themes/<slug>.json). Claude Code ignores an unknown token or
# an invalid color without a word, and `claude plugin validate` reads neither.
THEME_BASES = {"dark", "light", "dark-daltonized", "light-daltonized", "dark-ansi", "light-ansi"}
ANSI_NAMES = {f"{c}{b}" for c in ("black", "red", "green", "yellow", "blue", "magenta", "cyan", "white")
              for b in ("", "Bright")}
THEME_COLOR = re.compile(r"^(#[0-9a-fA-F]{6}|#[0-9a-fA-F]{3}|rgb\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*\)"
                         r"|ansi256\(\s*\d{1,3}\s*\)|ansi:[A-Za-z]+)$")
THEME_TOKENS = {
    "claude", "text", "inverseText", "inactive", "subtle", "suggestion", "permission", "remember",
    "success", "error", "warning", "merged",
    "promptBorder", "planMode", "autoAccept", "bashBorder", "ide", "fastMode", "effortUltra",
    "diffAdded", "diffRemoved", "diffAddedDimmed", "diffRemovedDimmed", "diffAddedWord", "diffRemovedWord",
    "userMessageBackground", "userMessageBackgroundHover", "bashMessageBackgroundColor",
    "memoryBackgroundColor", "selectionBg", "composerSidebarBackground",
    "rate_limit_fill", "rate_limit_empty", "briefLabelYou", "briefLabelClaude",
    "claudeShimmer", "warningShimmer", "permissionShimmer", "promptBorderShimmer",
    "inactiveShimmer", "fastModeShimmer",
} | {f"{c}_FOR_SUBAGENTS_ONLY" for c in
     ("red", "blue", "green", "yellow", "purple", "orange", "pink", "cyan")} | {
    f"rainbow_{c}{s}" for c in ("red", "orange", "yellow", "green", "blue", "indigo", "violet")
    for s in ("", "_shimmer")}
TEXT_SUFFIXES = {".md", ".json", ".sh", ".bash", ".py", ".js", ".ts", ".mjs", ".cjs",
                 ".yaml", ".yml", ".toml", ".txt", ""}


class Report:
    def __init__(self) -> None:
        self.errors: list[str] = []
        self.warnings: list[str] = []

    def error(self, where: str, msg: str) -> None:
        self.errors.append(f"ERROR  {where}: {msg}")

    def warn(self, where: str, msg: str) -> None:
        self.warnings.append(f"WARN   {where}: {msg}")


def read_json(path: Path, rep: Report, where: str):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        return None
    except json.JSONDecodeError as exc:
        rep.error(where, f"invalid JSON: {exc}")
        return None


def frontmatter(path: Path) -> dict[str, str] | None:
    """Top-level `key: value` pairs from a leading --- block. Presence checks only."""
    try:
        text = path.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return None
    if not text.startswith("---"):
        return None
    end = text.find("\n---", 3)
    if end == -1:
        return None
    out: dict[str, str] = {}
    for line in text[3:end].splitlines():
        if not line or line[0].isspace() or line.lstrip().startswith("#"):
            continue
        key, sep, value = line.partition(":")
        if sep:
            out[key.strip()] = value.strip()
    return out


def iter_files(root: Path):
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS]
        for f in filenames:
            yield Path(dirpath) / f


def collect_commands(plugin: Path, rep: Report) -> list[tuple[str, str]]:
    """(source label, command string) for every field that runs code."""
    out: list[tuple[str, str]] = []
    manifest = read_json(plugin / ".claude-plugin" / "plugin.json", rep, "plugin.json") or {}

    def walk_hooks(obj, label):
        if isinstance(obj, dict):
            if obj.get("type") == "command" and isinstance(obj.get("command"), str):
                out.append((label, obj["command"]))
            for v in obj.values():
                walk_hooks(v, label)
        elif isinstance(obj, list):
            for v in obj:
                walk_hooks(v, label)

    hooks_file = plugin / "hooks" / "hooks.json"
    if hooks_file.is_file():
        walk_hooks(read_json(hooks_file, rep, "hooks/hooks.json"), "hooks/hooks.json")
    walk_hooks(manifest.get("hooks"), "plugin.json:hooks")

    def servers(obj, label):
        if not isinstance(obj, dict):
            return
        for name, cfg in obj.items():
            if isinstance(cfg, dict):
                if isinstance(cfg.get("command"), str):
                    out.append((f"{label}:{name}", cfg["command"]))
                for arg in cfg.get("args", []) or []:
                    if isinstance(arg, str) and ("/" in arg or "\\" in arg):
                        out.append((f"{label}:{name}.args", arg))

    mcp = plugin / ".mcp.json"
    if mcp.is_file():
        servers((read_json(mcp, rep, ".mcp.json") or {}).get("mcpServers"), ".mcp.json")
    servers(manifest.get("mcpServers"), "plugin.json:mcpServers")

    lsp = plugin / ".lsp.json"
    if lsp.is_file():
        servers(read_json(lsp, rep, ".lsp.json"), ".lsp.json")
    servers(manifest.get("lspServers"), "plugin.json:lspServers")

    for entry in monitor_entries(plugin, manifest, rep):
        if isinstance(entry, dict) and isinstance(entry.get("command"), str):
            out.append((f"monitors:{entry.get('name', '?')}", entry["command"]))
    return out


def monitor_entries(plugin: Path, manifest: dict, rep: Report) -> list:
    exp = manifest.get("experimental")
    declared = exp.get("monitors") if isinstance(exp, dict) else None
    if declared is None:
        declared = manifest.get("monitors")
    if isinstance(declared, list):
        return declared
    if isinstance(declared, str):
        data = read_json(plugin / declared, rep, f"plugin.json:monitors {declared}")
        return data if isinstance(data, list) else []
    mon = plugin / "monitors" / "monitors.json"
    data = read_json(mon, rep, "monitors/monitors.json") if mon.is_file() else None
    return data if isinstance(data, list) else []


def theme_files(plugin: Path, manifest: dict) -> list[Path]:
    exp = manifest.get("experimental")
    declared = exp.get("themes") if isinstance(exp, dict) else None
    if declared is None:
        declared = manifest.get("themes")
    if declared is None:
        roots = [plugin / "themes"]
    else:
        roots = [plugin / p for p in ([declared] if isinstance(declared, str) else declared)
                 if isinstance(p, str)]
    files: list[Path] = []
    for r in roots:
        if r.is_dir():
            files.extend(sorted(r.glob("*.json")))
        elif r.is_file():
            files.append(r)
    return files


def check_theme(path: Path, where: str, rep: Report) -> None:
    data = read_json(path, rep, where)
    if data is None:
        return
    if not isinstance(data, dict):
        rep.error(where, "a theme file is a JSON object with name, base and overrides")
        return
    for key in data:
        if key not in ("name", "base", "overrides"):
            rep.warn(where, f"unknown field '{key}': a theme has only name, base and overrides")
    base = data.get("base", "dark")
    if base not in THEME_BASES:
        rep.error(where, f"base '{base}' is not a preset ({', '.join(sorted(THEME_BASES))})")
    overrides = data.get("overrides", {})
    if not isinstance(overrides, dict):
        rep.error(where, "overrides must be an object of token to color")
        return
    if not overrides:
        rep.error(where, "scaffolded but still empty: no overrides, so it looks exactly like "
                         "its base")
    for token, color in overrides.items():
        if token not in THEME_TOKENS:
            rep.warn(where, f"token '{token}' is not a documented theme token and is ignored "
                            f"unless /theme lists it")
        ok = isinstance(color, str) and bool(THEME_COLOR.match(color.strip()))
        if ok and color.startswith("ansi:"):
            ok = color[5:] in ANSI_NAMES
        if ok and color.startswith(("rgb(", "ansi256(")):
            ok = all(int(n) <= 255 for n in re.findall(r"\d+", color.split("(", 1)[1]))
        if not ok:
            rep.error(where, f"{token}: '{color}' is not a color Claude Code reads "
                             f"(#rrggbb, #rgb, rgb(r,g,b), ansi256(n), ansi:<name>) and is ignored")


def check_plugin(plugin: Path, rep: Report) -> None:
    name = plugin.name
    manifest_path = plugin / ".claude-plugin" / "plugin.json"
    manifest = read_json(manifest_path, rep, f"{name}/plugin.json")

    # --- manifest identity -------------------------------------------------
    if manifest is None:
        if not manifest_path.exists():
            rep.warn(name, "no .claude-plugin/plugin.json: loads with the directory name "
                           "and no metadata; a marketplace-distributed plugin needs one")
        manifest = {}
    else:
        declared = manifest.get("name")
        if not declared:
            rep.error(f"{name}/plugin.json", "'name' is required")
        else:
            if not KEBAB.match(declared):
                rep.error(f"{name}/plugin.json", f"name '{declared}' is not kebab-case")
            if declared != name:
                rep.error(f"{name}/plugin.json",
                          f"name '{declared}' differs from directory '{name}': the marketplace "
                          f"entry source points at the directory, so the two must agree")
        desc = manifest.get("description", "")
        if not desc:
            rep.warn(f"{name}/plugin.json", "no description, so users see nothing when browsing")
        elif "TODO" in desc:
            rep.error(f"{name}/plugin.json", "description still says TODO")
        version = manifest.get("version")
        if version and not SEMVER.match(str(version)):
            rep.warn(f"{name}/plugin.json", f"version '{version}' is not semver MAJOR.MINOR.PATCH")

        homepage = manifest.get("homepage")
        if homepage is not None and not re.match(r"^[a-z][a-z0-9+.-]*://\S+$", str(homepage)):
            rep.error(f"{name}/plugin.json", f"homepage '{homepage}' is not a URL, and the plugin "
                                             f"fails to load")

        exp = manifest.get("experimental") if isinstance(manifest.get("experimental"), dict) else {}
        path_fields = [(f, manifest.get(f)) for f in
                       ("skills", "commands", "agents", "workflows", "outputStyles")]
        path_fields += [(f"experimental.{f}", exp.get(f)) for f in ("themes", "monitors", "evals")]
        for field, value in path_fields:
            if isinstance(value, dict):
                continue  # commands object map, inline monitors
            paths = [value] if isinstance(value, str) else (value or [])
            for p in paths:
                if not isinstance(p, str):
                    continue
                if p.startswith("/") or ".." in p:
                    rep.error(f"{name}/plugin.json", f"{field}: '{p}' must be relative to the "
                                                     f"plugin root without '..'")
                elif not p.startswith("./") and not (field == "skills" and p == "."):
                    rep.error(f"{name}/plugin.json", f"{field}: '{p}' must start with './'")
                elif not (plugin / p).exists():
                    rep.error(f"{name}/plugin.json", f"{field}: '{p}' does not exist")
        for legacy in ("themes", "monitors"):
            if legacy in manifest:
                rep.warn(f"{name}/plugin.json", f"top-level '{legacy}' still loads but validate "
                                                f"warns; declare it as experimental.{legacy}")

        engines = manifest.get("engines")
        if engines is not None and not (isinstance(engines, dict)
                                        and isinstance(engines.get("claude-code"), str)):
            rep.error(f"{name}/plugin.json", "engines must be { \"claude-code\": \"<range>\" }, "
                                             "or it is ignored at load")

        user_config = manifest.get("userConfig")
        if isinstance(user_config, dict):
            for key, opt in user_config.items():
                if not USER_CONFIG_KEY.match(key):
                    rep.error(f"{name}/plugin.json", f"userConfig key '{key}': letters, digits "
                                                     f"and underscores, not starting with a digit")
                if isinstance(opt, dict) and "options" in opt and not engines:
                    rep.warn(f"{name}/plugin.json",
                             f"userConfig.{key}.options: Claude Code before 2.1.271 can't load "
                             f"this plugin; set engines {{\"claude-code\": \">=2.1.271\"}}")

    # --- placement ---------------------------------------------------------
    for d in COMPONENT_DIRS:
        if (plugin / ".claude-plugin" / d).exists():
            rep.error(f"{name}/.claude-plugin/{d}", "only plugin.json belongs in .claude-plugin/; "
                                                    "components must sit at the plugin root")
    for f in (".mcp.json", ".lsp.json", "settings.json"):
        if (plugin / ".claude-plugin" / f).exists():
            rep.error(f"{name}/.claude-plugin/{f}", "must sit at the plugin root, "
                                                    "not inside .claude-plugin/")

    if (plugin / "SKILL.md").is_file() and (plugin / "skills").is_dir():
        rep.warn(f"{name}/SKILL.md", "ignored: a root SKILL.md loads only when there is no "
                                     "skills/ directory and no 'skills' manifest field")
    if (plugin / "CLAUDE.md").is_file():
        rep.warn(f"{name}/CLAUDE.md", "not loaded as context in a plugin; put instructions "
                                      "in a skill")

    settings = plugin / "settings.json"
    if settings.is_file():
        data = read_json(settings, rep, f"{name}/settings.json")
        if isinstance(data, dict):
            if "agent" in data:
                rep.warn(f"{name}/settings.json", "'agent' is deprecated since 2.1.323 and warns "
                                                  "at startup; tell users to set agent themselves")
            if "subagentStatusLine" in data:
                rep.warn(f"{name}/settings.json", "'subagentStatusLine' was removed in 2.1.323 "
                                                  "and does nothing")
            if not data.get("agent"):
                rep.error(f"{name}/settings.json", "nothing in it is read any more: delete it")

    # --- docs --------------------------------------------------------------
    for doc in ("README.md", "CHANGELOG.md"):
        if not (plugin / doc).is_file():
            rep.warn(name, f"no {doc}")
    changelog = plugin / "CHANGELOG.md"
    version = str(manifest.get("version", ""))
    if version and changelog.is_file():
        if version not in changelog.read_text(encoding="utf-8", errors="replace"):
            rep.warn(f"{name}/CHANGELOG.md", f"no entry for version {version}")

    # --- unfilled scaffolds ------------------------------------------------
    # A mod's hooks.json may hold only "modules" (its hooks module), no settings hooks.
    hooks_json = plugin / "hooks" / "hooks.json"
    if hooks_json.is_file():
        data = read_json(hooks_json, rep, f"{name}/hooks/hooks.json")
        if isinstance(data, dict) and not data.get("hooks") and not data.get("modules"):
            if set(data) - {"hooks", "modules", "description"}:
                rep.error(f"{name}/hooks/hooks.json", "the event map needs a top-level \"hooks\" "
                                                      "wrapper; without it the file fails to load")
            else:
                rep.error(f"{name}/hooks/hooks.json", "scaffolded but still empty: fill it in "
                                                      "or delete it")
    empties = [
        (".mcp.json", lambda o: not o.get("mcpServers")),
        (".lsp.json", lambda o: not o),
        ("monitors/monitors.json", lambda o: not o),
    ]
    for rel, is_empty in empties:
        path = plugin / rel
        if path.is_file():
            data = read_json(path, rep, f"{name}/{rel}")
            if data is not None and is_empty(data):
                rep.error(f"{name}/{rel}", "scaffolded but still empty: fill it in or delete it")

    # --- themes ------------------------------------------------------------
    themes = theme_files(plugin, manifest)
    for tf in themes:
        check_theme(tf, f"{name}/{tf.relative_to(plugin)}", rep)

    # --- skills ------------------------------------------------------------
    skills_dir = plugin / "skills"
    skill_count = 0
    if skills_dir.is_dir():
        for sd in sorted(p for p in skills_dir.iterdir() if p.is_dir()):
            sk = sd / "SKILL.md"
            if not sk.is_file():
                rep.error(f"{name}/skills/{sd.name}", "no SKILL.md")
                continue
            skill_count += 1
            fm = frontmatter(sk)
            if fm is None:
                rep.error(f"{name}/skills/{sd.name}/SKILL.md",
                          "no YAML frontmatter: loads with empty metadata and never triggers")
            elif not fm.get("description"):
                rep.error(f"{name}/skills/{sd.name}/SKILL.md",
                          "no description, so Claude has nothing to match against")

    # --- agents ------------------------------------------------------------
    agents_dir = plugin / "agents"
    agent_count = 0
    if agents_dir.is_dir():
        for af in sorted(agents_dir.rglob("*.md")):
            agent_count += 1
            rel = af.relative_to(plugin)
            fm = frontmatter(af)
            if fm is None:
                rep.error(f"{name}/{rel}", "no parseable frontmatter: loads with every field "
                                           "ignored and a generic description")
                fm = {}
            for banned in ("hooks", "mcpServers", "permissionMode", "initialPrompt"):
                if banned in fm:
                    rep.error(f"{name}/{rel}",
                              f"'{banned}' is ignored for plugin-shipped agents")
            if len(fm.get("name", "")) > 256:
                rep.error(f"{name}/{rel}", "name over 256 characters is ignored")
            if not fm.get("description"):
                rep.warn(f"{name}/{rel}", "no description, so Claude cannot route to it")

    # --- executables -------------------------------------------------------
    bin_dir = plugin / "bin"
    bin_count = 0
    if bin_dir.is_dir():
        for f in sorted(bin_dir.iterdir()):
            if f.is_file():
                bin_count += 1
                if not os.access(f, os.X_OK):
                    rep.error(f"{name}/bin/{f.name}", "not executable: chmod +x it")
                first = f.read_text(encoding="utf-8", errors="replace")[:2]
                if first != "#!":
                    rep.warn(f"{name}/bin/{f.name}", "no shebang line")

    # --- commands that run code -------------------------------------------
    for label, cmd in collect_commands(plugin, rep):
        where = f"{name}/{label}"
        if ".." in cmd:
            rep.error(where, f"'{cmd}': paths outside the plugin are not copied into the cache")
        if label.startswith("monitors:") and "${user_config." in cmd:
            rep.error(where, "a monitor that references ${user_config.*} does not start; have "
                             "the script read its own config")
        for var in PLUGIN_VARS:
            if var in cmd:
                rel = re.split(r"""[\s"']""", cmd.split(var, 1)[1].lstrip("\"'/"), maxsplit=1)[0]
                if var == "${CLAUDE_PLUGIN_ROOT}" and rel:
                    target = plugin / rel
                    if not target.exists():
                        rep.error(where, f"references {var}/{rel} which does not exist")
                    elif target.is_file() and not os.access(target, os.X_OK) and \
                            target.suffix in (".sh", ".py", ".js", ""):
                        rep.error(where, f"{rel} is not executable: chmod +x it")
                break
        else:
            if HOST_PATHS.search(cmd) or cmd.startswith("/"):
                rep.error(where, f"'{cmd}': absolute path; use ${{CLAUDE_PLUGIN_ROOT}} so it "
                                 f"resolves in the plugin cache")

    # --- portability -------------------------------------------------------
    for f in iter_files(plugin):
        if f.suffix.lower() not in TEXT_SUFFIXES:
            continue
        try:
            if f.stat().st_size > 1_000_000:
                continue
            text = f.read_text(encoding="utf-8", errors="replace")
        except OSError:
            continue
        hit = HOST_PATHS.search(text)
        if hit:
            line = text[: hit.start()].count("\n") + 1
            rep.error(f"{name}/{f.relative_to(plugin)}:{line}",
                      f"hardcoded host path '{hit.group(0)}': a plugin must work on any machine")
        if f.is_symlink():
            try:
                f.resolve().relative_to(plugin.resolve())
            except ValueError:
                rep.warn(f"{name}/{f.relative_to(plugin)}",
                         "symlink resolves outside the plugin and is skipped on install")

    # --- does it earn being a plugin? --------------------------------------
    extras = [
        agent_count, bin_count,
        (plugin / "hooks" / "hooks.json").is_file() or bool(manifest.get("hooks")),
        (plugin / ".mcp.json").is_file() or bool(manifest.get("mcpServers")),
        (plugin / ".lsp.json").is_file() or bool(manifest.get("lspServers")),
        bool(monitor_entries(plugin, manifest, rep)),
        bool(themes),
        (plugin / "output-styles").is_dir() or bool(manifest.get("outputStyles")),
        bool(manifest.get("userConfig")),
        bool(manifest.get("channels")),
        (plugin / "workflows").is_dir(),
    ]
    if skill_count and not any(extras):
        rep.warn(name, "skills only, so nothing here needs a plugin. Either add a component a bare "
                       "skill cannot reach (hook, bin, userConfig, MCP, agent, theme) or ship it "
                       "as a plain skill")


def main() -> int:
    ap = argparse.ArgumentParser(add_help=True)
    ap.add_argument("plugins", nargs="+", help="plugin directories to check")
    ap.add_argument("--strict", action="store_true", help="treat warnings as errors")
    args = ap.parse_args()

    rep = Report()
    for raw in args.plugins:
        p = Path(raw).resolve()
        if not p.is_dir():
            sys.exit(f"error: {raw} is not a directory")
        check_plugin(p, rep)

    for line in rep.errors:
        print(line)
    for line in rep.warnings:
        print(line)

    n_e, n_w = len(rep.errors), len(rep.warnings)
    if not n_e and not n_w:
        print(f"clean: {len(args.plugins)} plugin(s) checked")
        return 0
    print(f"\n{n_e} error(s), {n_w} warning(s)")
    if n_e or (args.strict and n_w):
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
