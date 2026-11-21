#!/usr/bin/env python3
"""Onboarding preflight probe.

Read-only. Inspects the machine and the repository it is run in, and reports
every check as OK / WARN / FAIL together with the fix: either a command that
can be run for the developer (AUTO) or a short instruction only they can carry
out (MANUAL).

Nothing here mutates state. Applying fixes is the caller's job.

Usage:
    preflight.py [--repo DIR] [--github-host HOST] [--json]
"""

import argparse
import json
import os
import platform
import re
import shutil
import subprocess
import sys
from collections import Counter
from pathlib import Path

# Every fix command here was written for macOS + Homebrew, which is what meyden
# developers run. The checks themselves are portable; the remedies are not.
IS_MACOS = platform.system() == "Darwin"

HOME = Path.home()
CLAUDE_DIR = HOME / ".claude"
PLUGIN_DIR = CLAUDE_DIR / "plugins"
PROJECTS_DIR = CLAUDE_DIR / "projects"
OFFICIAL_MARKETPLACE = "claude-plugins-official"

# These skills hand the model a repo it has just met and expect it to hold a
# multi-step plan while reading unfamiliar code. Below this bar the failure is
# not a refusal but a plausible-looking one: steps quietly skipped, sub-agents
# briefed too thinly, a spec that reads well and does not match the codebase.
REQUIRED_FAMILIES = ("opus", "fable")
REQUIRED_MAJOR = 5
REQUIRED_EFFORTS = ("high", "xhigh", "max")

MODEL_FAMILY = re.compile(r"^(opus|fable|sonnet|haiku)(?:-(\d+))?")

# Written into the project's .claude/settings.json when absent. Auto-memory
# writes session notes the team never sees; the attribution blanks keep the
# plugin's name out of commit messages and pull requests.
REQUIRED_PROJECT_SETTINGS = {
    "autoMemoryEnabled": False,
    "attribution": {"commit": "", "pr": ""},
}

# The marketplace these skills ship from, and the plugins that have to be live
# for them to work. github-flow is a declared dependency of dev-workflow, so a fresh
# install pulls it in: this check catches machines set up before that
# dependency existed, and anyone who disabled it afterwards.
MEYDEN_MARKETPLACE = "meyden"
MEYDEN_MARKETPLACE_SOURCE = "git@github.com:meyden92/meyden-market.git"
MEYDEN_PLUGINS = {
    "github-flow": "every GitHub operation runs through its `github` skill",
    "dev-workflow": "the plugin these skills live in",
}

# The GitHub host every meyden repo lives on. Deliberately NOT derived from the
# repo's remote: a remote may use an ssh alias, and the text before the colon is
# then an alias, not a hostname. Overridable with --github-host for the
# exceptional repo elsewhere (GitHub Enterprise).
DEFAULT_GITHUB_HOST = "github.com"

# gh 2.94 added the sub-issue and issue-dependency flags the tracker doc relies on.
MIN_GH = (2, 94)

NET_TIMEOUT = 20

# Skills across this marketplace bundle python3 scripts and invoke them as
# `python3 <script>`, so the interpreter on PATH is shared infrastructure: it
# matters on every machine, not only in Python projects. 3.9 is the floor:
# 3.8 went end-of-life in October 2024, and macOS ships 3.9 with the Xcode
# command line tools.
MIN_PYTHON = (3, 9)

# Fallback map of the official LSP plugins: extension -> (plugin, server binary).
# Verified against the claude-plugins-official catalog on 2026-08-06. The live
# catalog is preferred when the official marketplace is installed; this table is
# what keeps the language check working on a machine that has not added it yet.
FALLBACK_LSP = {
    "typescript-lsp": {
        "command": "typescript-language-server",
        "install": "npm install -g typescript-language-server typescript",
        "exts": [".ts", ".tsx", ".js", ".jsx", ".mts", ".cts", ".mjs", ".cjs"],
    },
    "pyright-lsp": {
        "command": "pyright-langserver",
        "install": "npm install -g pyright",
        "exts": [".py", ".pyi"],
    },
    "gopls-lsp": {
        "command": "gopls",
        "install": "go install golang.org/x/tools/gopls@latest",
        "exts": [".go"],
    },
    "rust-analyzer-lsp": {
        "command": "rust-analyzer",
        "install": "rustup component add rust-analyzer",
        "exts": [".rs"],
    },
    "clangd-lsp": {
        "command": "clangd",
        "install": "brew install llvm  (or install the Xcode command line tools)",
        "exts": [".c", ".cc", ".cpp", ".cxx", ".h", ".hpp", ".hxx", ".C", ".H"],
    },
    "php-lsp": {
        "command": "intelephense",
        "install": "npm install -g intelephense",
        "exts": [".php"],
    },
    "ruby-lsp": {
        "command": "ruby-lsp",
        "install": "gem install ruby-lsp",
        "exts": [".rb", ".rake", ".gemspec", ".ru", ".erb"],
    },
    "jdtls-lsp": {
        "command": "jdtls",
        "install": "brew install jdtls",
        "exts": [".java"],
    },
    "kotlin-lsp": {
        "command": "kotlin-lsp",
        "install": "brew install kotlin-lsp",
        "exts": [".kt", ".kts"],
    },
    "lua-lsp": {
        "command": "lua-language-server",
        "install": "brew install lua-language-server",
        "exts": [".lua"],
    },
    "swift-lsp": {
        "command": "sourcekit-lsp",
        "install": "install the Xcode command line tools: xcode-select --install",
        "exts": [".swift"],
    },
    "csharp-lsp": {
        "command": "csharp-ls",
        "install": "dotnet tool install --global csharp-ls",
        "exts": [".cs"],
    },
}

INSTALL_HINTS = {p: c["install"] for p, c in FALLBACK_LSP.items()}

SKIP_DIRS = {
    ".git", "node_modules", "vendor", "dist", "build", "out", "target",
    ".venv", "venv", "__pycache__", ".next", ".nuxt", ".turbo", ".cache",
    "coverage", ".gradle", ".idea", ".tox", "Pods", ".terraform",
}

results = []


def add(status, category, name, detail, fix=None, fix_kind=None):
    results.append({
        "status": status, "category": category, "name": name,
        "detail": detail, "fix": fix, "fix_kind": fix_kind,
    })


def run(cmd, timeout=NET_TIMEOUT, env=None):
    """Run a command, returning (returncode, combined output). -1 on timeout."""
    try:
        p = subprocess.run(
            cmd, capture_output=True, text=True, timeout=timeout,
            env={**os.environ, **(env or {})},
        )
        return p.returncode, (p.stdout + p.stderr).strip()
    except subprocess.TimeoutExpired:
        return -1, "timed out"
    except (FileNotFoundError, OSError) as e:
        return -2, str(e)


def read_json(path):
    try:
        with open(path) as f:
            return json.load(f)
    except (OSError, ValueError):
        return None


# --------------------------------------------------------------------------
# Session: the model and effort level this skill is being run with
# --------------------------------------------------------------------------

def session_transcript():
    """The JSONL for the session this script was invoked from, if findable."""
    sid = os.environ.get("CLAUDE_CODE_SESSION_ID")
    if not sid:
        return None
    return next(PROJECTS_DIR.glob(f"*/{sid}.jsonl"), None)


def last_assistant(path):
    """(model, effort) from the newest assistant turn. Both None if there is none."""
    model = effort = None
    try:
        with open(path) as f:
            for line in f:
                try:
                    rec = json.loads(line)
                except ValueError:
                    continue
                if rec.get("type") == "assistant":
                    model = (rec.get("message") or {}).get("model") or model
                    effort = rec.get("effort") or effort
    except OSError:
        pass
    return model, effort


def model_meets_bar(model):
    """A bare alias (`opus`) is the latest of its family, so it passes."""
    name = re.sub(r"\[[^\]]*\]$", "", (model or "").strip())
    name = name[len("claude-"):] if name.startswith("claude-") else name
    hit = MODEL_FAMILY.match(name)
    if not hit:
        return False
    family, majorver = hit.group(1), hit.group(2)
    return family in REQUIRED_FAMILIES and (majorver is None or int(majorver) >= REQUIRED_MAJOR)


def check_session():
    """(model, effort, source, ok): the gate the skill refuses to run below."""
    transcript = session_transcript()
    model, effort = last_assistant(transcript) if transcript else (None, None)
    source = "this session"

    if not model:
        # Reachable when the transcript has not been written yet. The configured
        # defaults are what the session will have started with.
        settings = read_json(CLAUDE_DIR / "settings.json") or {}
        model = settings.get("model")
        effort = os.environ.get("CLAUDE_EFFORT") or settings.get("effortLevel")
        source = "configured default, no transcript yet"

    effort = (effort or os.environ.get("CLAUDE_EFFORT") or "").lower()
    ok = model_meets_bar(model) and effort in REQUIRED_EFFORTS
    return model or "unknown", effort or "unknown", source, ok


# --------------------------------------------------------------------------
# Platform
# --------------------------------------------------------------------------

def check_platform():
    system = platform.system()
    if IS_MACOS:
        add("OK", "Platform", "operating system",
            f"macOS {platform.mac_ver()[0] or platform.release()} ({platform.machine()})")
    else:
        add("WARN", "Platform", "operating system",
            f"{system or 'unknown'}: this preflight is written and tested for macOS. "
            f"The checks still run, but each suggested fix is a macOS command",
            "translate each fix below to your package manager before running it", "MANUAL")


def localize_fixes():
    """Off macOS, a Homebrew command is a suggestion: never something to run for someone."""
    if IS_MACOS:
        return
    for r in results:
        if r["fix_kind"] == "AUTO" and re.search(r"\bbrew\b|\bopen -a\b", r["fix"] or ""):
            r["fix_kind"] = "MANUAL"
            r["fix"] += "   [macOS command: substitute your platform's equivalent]"


# --------------------------------------------------------------------------
# Skill runtime: what the skills themselves need, in any repository
# --------------------------------------------------------------------------

def check_runtime():
    """Interpreters the bundled skill scripts run on, regardless of project type."""
    want = ".".join(str(n) for n in MIN_PYTHON)

    py = shutil.which("python3")
    if not py:
        # Reachable when this script is run as `path/to/preflight.py` on a
        # machine where python3 resolves through a shebang but not on PATH.
        add("FAIL", "Skill runtime", "python3",
            "not on PATH: every bundled skill script is invoked as `python3 <script>`",
            "install Python: brew install python   (or: xcode-select --install)", "MANUAL")
    else:
        out = run([py, "--version"], timeout=15)[1]
        m = re.search(r"(\d+)\.(\d+)\.?(\d+)?", out or "")
        got = tuple(int(g) for g in m.groups()[:2]) if m else None
        if not got:
            add("WARN", "Skill runtime", "python3",
                f"{py} did not report a version ({out or 'no output'})",
                f"check it by hand: python3 --version", "MANUAL")
        elif got < MIN_PYTHON:
            add("FAIL", "Skill runtime", "python3",
                f"{'.'.join(str(n) for n in got)} at {py}, skill scripts need >= {want}",
                f"brew install python   (then reopen your terminal so python3 resolves "
                f"to the new one)", "MANUAL")
        else:
            add("OK", "Skill runtime", "python3", f"{'.'.join(str(n) for n in got)} at {py}")

    for tool, why, fix in (
        ("git", "every skill that touches history or branches",
         "xcode-select --install" if IS_MACOS else "install git via your package manager"),
        ("bash", "the shell scripts bundled with the skills",
         "brew install bash" if IS_MACOS else "install bash via your package manager"),
    ):
        path = shutil.which(tool)
        if path:
            add("OK", "Skill runtime", tool, path)
        else:
            add("FAIL", "Skill runtime", tool, f"not on PATH: needed by {why}", fix, "MANUAL")


# --------------------------------------------------------------------------
# Claude Code
# --------------------------------------------------------------------------

def enabled_plugins(repo):
    """Merged `enabledPlugins` map, later scopes overriding earlier ones."""
    merged = {}
    for settings in (HOME / ".claude" / "settings.json",
                     repo / ".claude" / "settings.json",
                     repo / ".claude" / "settings.local.json"):
        merged.update((read_json(settings) or {}).get("enabledPlugins") or {})
    return merged


def check_meyden_plugins(repo, known, installed):
    """The marketplace and plugins these skills themselves are made of."""
    if MEYDEN_MARKETPLACE in known:
        add("OK", "Claude Code", "meyden marketplace", f"{MEYDEN_MARKETPLACE} added")
    else:
        # Every meyden plugin install fails until this exists, so nothing below
        # can pass either: one fix unblocks the whole group.
        add("FAIL", "Claude Code", "meyden marketplace",
            f"{MEYDEN_MARKETPLACE} not added: the meyden plugins are installed from here",
            f"claude plugin marketplace add {MEYDEN_MARKETPLACE_SOURCE}", "AUTO")

    enabled = enabled_plugins(repo)
    for plugin, why in MEYDEN_PLUGINS.items():
        plugin_id = f"{plugin}@{MEYDEN_MARKETPLACE}"
        scopes = installed.get(plugin_id) or []
        version = next((s.get("version") for s in scopes if s.get("version")), None)
        if not scopes:
            add("FAIL", "Claude Code", plugin, f"not installed: {why}",
                f"claude plugin install {plugin_id}", "AUTO")
        elif not enabled.get(plugin_id):
            add("FAIL", "Claude Code", plugin,
                f"{version or 'installed'} but disabled: {why}",
                f"claude plugin enable {plugin_id}", "AUTO")
        else:
            add("OK", "Claude Code", plugin, f"{version or 'installed'}, enabled")


def check_claude(repo):
    claude = shutil.which("claude")
    if not claude:
        add("FAIL", "Claude Code", "claude CLI", "not on PATH",
            "install Claude Code, then reopen your terminal: "
            "https://code.claude.com/docs/en/quickstart", "MANUAL")
        return
    rc, out = run([claude, "--version"], timeout=30)
    version = out.split()[0] if rc == 0 and out else "unknown"
    add("OK", "Claude Code", "claude CLI", f"{version} at {claude}")

    known = read_json(PLUGIN_DIR / "known_marketplaces.json") or {}

    if OFFICIAL_MARKETPLACE in known:
        add("OK", "Claude Code", "official marketplace", f"{OFFICIAL_MARKETPLACE} added")
    else:
        add("WARN", "Claude Code", "official marketplace",
            "not added: the official LSP plugins live here",
            f"claude plugin marketplace add anthropics/{OFFICIAL_MARKETPLACE}", "AUTO")

    installed = (read_json(PLUGIN_DIR / "installed_plugins.json") or {}).get("plugins", {})
    check_meyden_plugins(repo, known, installed)

    if os.environ.get("CLAUDE_CODE_PLUGIN_KEEP_MARKETPLACE_ON_FAILURE"):
        add("OK", "Claude Code", "marketplace resilience",
            "CLAUDE_CODE_PLUGIN_KEEP_MARKETPLACE_ON_FAILURE set")
    else:
        profile = "~/.zshrc" if "zsh" in os.environ.get("SHELL", "") else "~/.bashrc"
        add("WARN", "Claude Code", "marketplace resilience",
            "CLAUDE_CODE_PLUGIN_KEEP_MARKETPLACE_ON_FAILURE unset: a failed refresh "
            "(network down) drops the local marketplace clone",
            f"echo 'export CLAUDE_CODE_PLUGIN_KEEP_MARKETPLACE_ON_FAILURE=1' >> {profile}",
            "AUTO")
    return installed


# --------------------------------------------------------------------------
# GitHub access
# --------------------------------------------------------------------------

def origin_url(repo):
    rc, out = run(["git", "-C", str(repo), "remote", "get-url", "origin"], timeout=10)
    if rc != 0 or not out:
        return None
    return out.strip()


def check_github(repo, host):
    git = ["git", "-C", str(repo)]
    name = run(git + ["config", "--get", "user.name"], timeout=10)[1]
    email = run(git + ["config", "--get", "user.email"], timeout=10)[1]
    if name and email:
        add("OK", "GitHub", "git identity", f"{name} <{email}>")
    else:
        missing = "user.name" if not name else "user.email"
        add("FAIL", "GitHub", "git identity", f"git {missing} is not set",
            'git config --global user.name "Your Name" && '
            'git config --global user.email "you@example.com"', "MANUAL")

    rc, out = run(["ssh-add", "-l"], timeout=10)
    if rc == 0:
        add("OK", "GitHub", "ssh-agent", f"{len(out.splitlines())} key(s) loaded")
    else:
        add("FAIL", "GitHub", "ssh-agent",
            "no keys loaded: Claude Code suppresses SSH passphrase prompts, so "
            "plugin updates fail silently without one",
            "ssh-add --apple-use-keychain ~/.ssh/id_ed25519" if IS_MACOS
            else "ssh-add ~/.ssh/id_ed25519", "AUTO")

    known_hosts = HOME / ".ssh" / "known_hosts"
    rc, _ = run(["ssh-keygen", "-F", host, "-f", str(known_hosts)], timeout=10)
    if rc == 0:
        add("OK", "GitHub", "host key", f"{host} in known_hosts")
    else:
        add("FAIL", "GitHub", "host key", f"{host} not in known_hosts: SSH will fail silently",
            f"ssh-keyscan {host} >> ~/.ssh/known_hosts", "AUTO")

    rc, out = run(
        ["ssh", "-T", "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=yes",
         "-o", f"ConnectTimeout={NET_TIMEOUT - 5}", f"git@{host}"],
    )
    # GitHub greets an authenticated user ("Hi <user>! You've successfully
    # authenticated") and exits 1 because it offers no shell; the text is the signal.
    greeting = re.search(r"Hi (\S+)! You've successfully authenticated", out)
    if greeting:
        add("OK", "GitHub", "ssh auth", f"authenticated to {host} as {greeting.group(1)}")
    elif rc == -1:
        add("FAIL", "GitHub", "ssh auth", f"{host} unreachable (timed out)",
            "check your network connection, then run this check again", "MANUAL")
    elif "Permission denied" in out:
        add("FAIL", "GitHub", "ssh auth", f"{host} rejected the key",
            f"add your public key (~/.ssh/id_ed25519.pub) at "
            f"https://{host}/settings/keys", "MANUAL")
    else:
        add("FAIL", "GitHub", "ssh auth", f"{host}: {out.splitlines()[0] if out else 'no response'}",
            f"verify by hand: ssh -T git@{host}", "MANUAL")

    gh = shutil.which("gh")
    if not gh:
        add("FAIL", "GitHub", "gh CLI",
            "not installed: every tracker operation, PR and CI log goes through it",
            "brew install gh", "AUTO")
        return
    rc, out = run([gh, "--version"], timeout=15)
    hit = re.search(r"gh version (\d+)\.(\d+)\.(\d+)", out or "")
    got = tuple(int(g) for g in hit.groups()[:2]) if hit else None
    want = ".".join(str(n) for n in MIN_GH)
    if not got:
        add("WARN", "GitHub", "gh CLI", f"{gh} did not report a version ({out or 'no output'})",
            "check it by hand: gh --version", "MANUAL")
    elif got < MIN_GH:
        add("FAIL", "GitHub", "gh CLI",
            f"{'.'.join(str(n) for n in got)} at {gh}, sub-issue and dependency flags need >= {want}",
            "brew upgrade gh", "AUTO")
    else:
        add("OK", "GitHub", "gh CLI", f"{'.'.join(str(n) for n in got)} at {gh}")

    rc, out = run([gh, "auth", "status", "--hostname", host], timeout=30)
    if rc == 0 and "Logged in" in out:
        add("OK", "GitHub", "gh auth", f"authenticated to {host}")
    else:
        login = "gh auth login" if host == DEFAULT_GITHUB_HOST else f"gh auth login --hostname {host}"
        add("FAIL", "GitHub", "gh auth", f"not authenticated to {host}", login, "MANUAL")


# --------------------------------------------------------------------------
# Repo config: settings this project is expected to carry
# --------------------------------------------------------------------------

def missing_project_settings(repo):
    """Which REQUIRED_PROJECT_SETTINGS the project's settings.json does not carry."""
    current = read_json(repo / ".claude" / "settings.json") or {}
    missing = {}
    for key, want in REQUIRED_PROJECT_SETTINGS.items():
        have = current.get(key)
        if isinstance(want, dict):
            # Only the keys we care about have to match; anything else the
            # project set under `attribution` is theirs to keep.
            if not isinstance(have, dict) or any(have.get(k) != v for k, v in want.items()):
                missing[key] = want
        elif have != want:
            missing[key] = want
    return missing


def check_project_settings(repo):
    missing = missing_project_settings(repo)
    if missing:
        add("WARN", "Repo config", "claude settings",
            f".claude/settings.json does not carry: {', '.join(missing)}")
    else:
        add("OK", "Repo config", "claude settings",
            f".claude/settings.json carries {', '.join(REQUIRED_PROJECT_SETTINGS)}")
    return missing


# --------------------------------------------------------------------------
# Other user-scope extensions: what else is loaded in every session
# --------------------------------------------------------------------------

def components(root):
    """Skill, command and agent names provided by a plugin or config directory."""
    root = Path(root)
    return {
        "skills": sorted(p.parent.name for p in root.glob("skills/*/SKILL.md")),
        "commands": sorted(p.stem for p in root.glob("commands/*.md")),
        "agents": sorted(p.stem for p in root.glob("agents/*.md")),
    }


def check_other_extensions(repo, installed):
    """User-scope plugins and personal skills that load alongside ours.

    Namespacing keeps slash commands apart, but an auto-firing skill competes
    with ours on description alone, so name overlap is the signal worth having.
    """
    enabled = enabled_plugins(repo)
    ours, others = {}, []
    for plugin_id, scopes in installed.items():
        name, _, marketplace = plugin_id.partition("@")
        scope = next((s for s in scopes if s.get("scope") == "user"), None)
        if not scope:
            continue
        entry = {
            "id": plugin_id, "name": name,
            "version": scope.get("version") or "unknown",
            "enabled": bool(enabled.get(plugin_id)),
            **components(scope.get("installPath") or ""),
        }
        if marketplace == MEYDEN_MARKETPLACE:
            ours[name] = entry
        else:
            others.append(entry)

    personal = components(CLAUDE_DIR)
    if any(personal.values()):
        others.append({"id": "~/.claude", "name": "personal (~/.claude)",
                       "version": "-", "enabled": True, **personal})

    def names(entry):
        return {n for kind in ("skills", "commands", "agents") for n in entry[kind]}

    our_names = set().union(*(names(e) for e in ours.values())) if ours else set()
    for entry in others:
        entry["overlap"] = sorted(names(entry) & our_names)

    clashing = [e for e in others if e["overlap"] and e["enabled"]]
    if clashing:
        add("WARN", "Extensions", "name overlap",
            "; ".join(f"{e['name']} also provides {', '.join(e['overlap'])}" for e in clashing))
    else:
        add("OK", "Extensions", "name overlap",
            f"{len(others)} other user-scope extension(s), no skill name shared with ours")
    return others


# --------------------------------------------------------------------------
# Language servers
# --------------------------------------------------------------------------

def live_lsp_catalog():
    """Read lspServers straight from installed marketplace catalogs when present."""
    table = {}
    for mp in (PLUGIN_DIR / "marketplaces").glob("*/.claude-plugin/marketplace.json"):
        data = read_json(mp) or {}
        for plugin in data.get("plugins", []):
            servers = plugin.get("lspServers") or {}
            for cfg in servers.values():
                exts = list((cfg.get("extensionToLanguage") or {}).keys())
                if cfg.get("command") and exts:
                    table[plugin["name"]] = {
                        "command": cfg["command"],
                        "exts": exts,
                        "install": INSTALL_HINTS.get(plugin["name"], f"install {cfg['command']}"),
                    }
    return table


def detect_languages(repo):
    counts, samples = Counter(), {}
    for root, dirs, files in os.walk(repo):
        dirs[:] = [d for d in dirs if d not in SKIP_DIRS and not d.startswith(".")]
        for fn in files:
            ext = Path(fn).suffix
            if ext:
                counts[ext] += 1
                path = Path(root) / fn
                # Keep the biggest file per extension: most likely to have symbols.
                try:
                    size = path.stat().st_size
                except OSError:
                    continue
                if ext not in samples or size > samples[ext][1]:
                    samples[ext] = (str(path), size)
    return counts, samples


def check_lsp(repo, installed):
    live = live_lsp_catalog()
    table = live or FALLBACK_LSP
    source = "official marketplace catalog" if live else "built-in table"
    counts, samples = detect_languages(repo)

    ext_to_plugin = {}
    for plugin, cfg in table.items():
        for ext in cfg["exts"]:
            ext_to_plugin[ext] = plugin

    per_plugin = Counter()
    per_plugin_sample = {}
    for ext, n in counts.items():
        plugin = ext_to_plugin.get(ext)
        if not plugin:
            continue
        per_plugin[plugin] += n
        cur = per_plugin_sample.get(plugin)
        if ext in samples and (cur is None or samples[ext][1] > cur[1]):
            per_plugin_sample[plugin] = samples[ext]

    if not per_plugin:
        add("SKIP", "Language server", "detection",
            "no files matching a supported language server in this repo")
        return []

    probes = []
    for plugin, n in per_plugin.most_common(3):
        cfg = table[plugin]
        key = next((k for k in installed if k.split("@")[0] == plugin), None)
        binary = shutil.which(cfg["command"])
        label = f"{plugin} ({n} files, via {source})"

        if not key:
            add("FAIL", "Language server", plugin,
                f"{n} matching file(s) but the plugin is not installed",
                f"claude plugin install {plugin}@{OFFICIAL_MARKETPLACE}", "AUTO")
        elif not binary:
            add("FAIL", "Language server", plugin,
                f"plugin installed but `{cfg['command']}` is not on PATH: the plugin "
                f"ships no binary, it only points at one",
                cfg["install"], "AUTO")
        else:
            add("OK", "Language server", plugin, f"{label}; {cfg['command']} at {binary}")
            sample = per_plugin_sample.get(plugin)
            if sample:
                probes.append({"plugin": plugin, "command": cfg["command"], "file": sample[0]})
    return probes


# --------------------------------------------------------------------------
# Report
# --------------------------------------------------------------------------

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--repo", default=".")
    ap.add_argument("--github-host")
    ap.add_argument("--json", action="store_true")
    args = ap.parse_args()

    repo = Path(args.repo).resolve()
    rc, root = run(["git", "-C", str(repo), "rev-parse", "--show-toplevel"], timeout=10)
    if rc == 0 and root:
        repo = Path(root)

    url = origin_url(repo)
    host = args.github_host or DEFAULT_GITHUB_HOST

    model, effort, source, session_ok = check_session()
    if not session_ok:
        # Nothing else is reported: a run below the bar is one the developer is
        # being asked to abandon, and a table of findings invites them to act on
        # it instead of restarting.
        print("SESSION")
        print(f"model: {model}  ({source})")
        print(f"effort: {effort}")
        print("verdict: BLOCKED. These skills need Opus 5 or Fable 5 "
              f"at {'/'.join(REQUIRED_EFFORTS)} effort")
        print("action:")
        print("  1. /model opus            (or: /model fable)")
        print("  2. /effort high")
        print("  3. /clear")
        print("  4. /dev-workflow:setup")
        return 2

    check_platform()
    check_runtime()
    installed = check_claude(repo) or {}
    check_github(repo, host)
    missing_settings = check_project_settings(repo)
    extensions = check_other_extensions(repo, installed)
    probes = check_lsp(repo, installed)
    localize_fixes()

    if args.json:
        print(json.dumps({"repo": str(repo), "github_host": host,
                          "platform": platform.system(), "macos": IS_MACOS,
                          "session": {"model": model, "effort": effort, "source": source},
                          "results": results, "lsp_probes": probes,
                          "missing_project_settings": missing_settings,
                          "extensions": extensions}, indent=2))
        return 0

    if not IS_MACOS:
        bar = "=" * 78
        print(f"{bar}\n"
              f"  !!  PLATFORM WARNING: this preflight targets macOS, "
              f"detected {platform.system() or 'unknown'}\n"
              f"  !!  Checks below still ran and their results are valid. Fixes that are\n"
              f"  !!  macOS-specific are marked MANUAL and tagged: substitute your own\n"
              f"  !!  package manager before running those.\n"
              f"{bar}\n")

    print(f"repo: {repo}")
    print(f"github host: {host}" + (f"  (origin: {url})" if url else ""))
    print(f"session: {model} at {effort} effort  ({source})")
    print()
    for r in results:
        print(f"[{r['status']:<4}] {r['category']} · {r['name']}: {r['detail']}")

    fixes = [r for r in results if r["fix"]]
    if fixes:
        print("\nFIXES")
        for i, r in enumerate(fixes, 1):
            print(f"{i}. {r['fix_kind']} · {r['category']} · {r['name']}\n   {r['fix']}")

    if missing_settings:
        print("\nPROJECT-SETTINGS  (merge into .claude/settings.json)")
        print(json.dumps(missing_settings, indent=2))

    if extensions:
        print("\nOTHER-EXTENSIONS")
        for e in extensions:
            state = "enabled" if e["enabled"] else "disabled"
            print(f"- {e['name']} {e['version']} ({state})")
            for kind in ("skills", "commands", "agents"):
                if e[kind]:
                    print(f"    {kind}: {', '.join(e[kind])}")
            if e["overlap"]:
                print(f"    OVERLAPS OURS: {', '.join(e['overlap'])}")

    if probes:
        print("\nLSP-PROBES")
        for p in probes:
            print(f"- {p['plugin']} :: {p['file']}")

    counts = Counter(r["status"] for r in results)
    print(f"\nSUMMARY ok={counts['OK']} warn={counts['WARN']} "
          f"fail={counts['FAIL']} skip={counts['SKIP']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
