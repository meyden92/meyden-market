#!/usr/bin/env bash
# Scaffold a plugin inside a marketplace repository and register its entry.
#
# Usage: init_plugin.sh <plugin-name> [options]
#   --root <dir>            marketplace root (default: walk up from $PWD for
#                           .claude-plugin/marketplace.json)
#   --description <text>    manifest description
#   --with <components...>  scaffold component skeletons; any of:
#                           skills agents hooks mcp lsp bin monitors themes output-styles workflows
#
# Only the components you name are created. Every generated config is valid but
# inert: check_plugin.py fails on any that is still empty, so a scaffolded
# component must be filled in before the plugin ships.
set -euo pipefail

NAME=""
ROOT=""
DESCRIPTION=""
COMPONENTS=()

while [ $# -gt 0 ]; do
  case "$1" in
    --root)        ROOT="${2:?--root needs a directory}"; shift 2 ;;
    --description) DESCRIPTION="${2:?--description needs text}"; shift 2 ;;
    --with)
      shift
      while [ $# -gt 0 ] && [[ "$1" != --* ]]; do COMPONENTS+=("$1"); shift; done ;;
    -h|--help)     sed -n '2,14p' "$0"; exit 0 ;;
    --*)           echo "error: unknown option $1" >&2; exit 2 ;;
    *)
      if [ -z "$NAME" ]; then NAME="$1"; else echo "error: unexpected argument $1" >&2; exit 2; fi
      shift ;;
  esac
done

[ -n "$NAME" ] || { echo "usage: init_plugin.sh <plugin-name> [--root <dir>] [--description <text>] [--with <components...>]" >&2; exit 2; }

if ! [[ "$NAME" =~ ^[a-z0-9]+(-[a-z0-9]+)*$ ]]; then
  echo "error: plugin name '$NAME' must be kebab-case (lowercase words separated by hyphens)" >&2
  exit 1
fi

# Names claude plugin validate reserves for Anthropic's own plugins (2.1.325).
if [[ "$NAME" =~ ^(claude|anthropics?)(-|$)|^cc-plugin-|(claude|anthropic)-?official|official-?(claude|anthropic) ]]; then
  echo "error: plugin name '$NAME' is reserved for Anthropic: no 'claude-', 'anthropic-', 'anthropics-' or 'cc-plugin-' prefix, not 'claude' or 'anthropic(s)' alone, no 'official' beside 'claude' or 'anthropic'" >&2
  exit 1
fi

# ------------------------------------------------------------- marketplace root
if [ -z "$ROOT" ]; then
  d="$PWD"
  while [ "$d" != "/" ]; do
    if [ -f "$d/.claude-plugin/marketplace.json" ]; then ROOT="$d"; break; fi
    d="$(dirname "$d")"
  done
fi
if [ -z "$ROOT" ] || [ ! -f "$ROOT/.claude-plugin/marketplace.json" ]; then
  echo "error: no .claude-plugin/marketplace.json found walking up from $PWD" >&2
  echo "       pass --root <dir>, or bootstrap one with init_marketplace.sh <name> <dir>" >&2
  exit 1
fi
ROOT="$(cd "$ROOT" && pwd)"

DEST="$ROOT/plugins/$NAME"
[ -e "$DEST" ] && { echo "error: $DEST already exists" >&2; exit 1; }

AUTHOR_NAME="$(git -C "$ROOT" config user.name 2>/dev/null || git config user.name 2>/dev/null || echo "TODO: author name")"
AUTHOR_EMAIL="$(git -C "$ROOT" config user.email 2>/dev/null || git config user.email 2>/dev/null || true)"
[ -n "$DESCRIPTION" ] || DESCRIPTION="TODO: what this plugin does, in one line"
# The README's install line names the marketplace repository; validate gives Advice without one.
REPO="$(git -C "$ROOT" remote get-url origin 2>/dev/null | sed -E 's#^(git@github\.com:|https://github\.com/)##; s#\.git$##' || true)"
[[ "$REPO" =~ ^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$ ]] || REPO="<owner>/<repo>"

mkdir -p "$DEST/.claude-plugin"

if [ -n "$AUTHOR_EMAIL" ]; then
  AUTHOR_BLOCK=$(printf '    "name": %s,\n    "email": %s' "\"$AUTHOR_NAME\"" "\"$AUTHOR_EMAIL\"")
else
  AUTHOR_BLOCK=$(printf '    "name": %s' "\"$AUTHOR_NAME\"")
fi

cat > "$DEST/.claude-plugin/plugin.json" <<EOF
{
  "\$schema": "https://json.schemastore.org/claude-code-plugin-manifest.json",
  "name": "$NAME",
  "description": "$DESCRIPTION",
  "version": "0.1.0",
  "author": {
$AUTHOR_BLOCK
  },
  "keywords": []
}
EOF

cat > "$DEST/README.md" <<EOF
# $NAME

$DESCRIPTION

## Install

\`\`\`bash
/plugin install $NAME --marketplace $REPO
\`\`\`

## What it provides

TODO: list the skills, and any hooks, executables, servers or themes.

## Configuration

TODO: remove this section, or document each userConfig option.
EOF

cat > "$DEST/CHANGELOG.md" <<EOF
# Changelog

All notable changes to $NAME.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
versions follow [semver](https://semver.org).

## [0.1.0] - unreleased

### Added

- Initial plugin scaffold.
EOF

# ------------------------------------------------------------------ components
created=()
for c in ${COMPONENTS+"${COMPONENTS[@]}"}; do
  case "$c" in
    skills)
      mkdir -p "$DEST/skills"
      created+=("skills/: author each skill with the agent-toolkit:create-skill skill, target $DEST/skills") ;;
    agents)
      mkdir -p "$DEST/agents"
      created+=("agents/: one .md per subagent; hooks, mcpServers, permissionMode and initialPrompt are ignored in plugin agents") ;;
    hooks)
      mkdir -p "$DEST/hooks"
      printf '{\n  "hooks": {}\n}\n' > "$DEST/hooks/hooks.json"
      created+=("hooks/hooks.json: empty; add an event matcher") ;;
    mcp)
      printf '{\n  "mcpServers": {}\n}\n' > "$DEST/.mcp.json"
      created+=(".mcp.json: empty; add a server") ;;
    lsp)
      printf '{}\n' > "$DEST/.lsp.json"
      created+=(".lsp.json: empty; add a language server") ;;
    bin)
      mkdir -p "$DEST/bin"
      created+=("bin/: executables on PATH while enabled; chmod +x each one") ;;
    monitors)
      mkdir -p "$DEST/monitors"
      printf '[]\n' > "$DEST/monitors/monitors.json"
      created+=("monitors/monitors.json: empty; declare via experimental.monitors in plugin.json") ;;
    themes)
      mkdir -p "$DEST/themes"
      printf '{\n  "name": "%s",\n  "base": "dark",\n  "overrides": {}\n}\n' "$NAME" > "$DEST/themes/$NAME.json"
      created+=("themes/$NAME.json: empty overrides; add color tokens (components.md, Themes); shows in /theme") ;;
    output-styles)
      mkdir -p "$DEST/output-styles"
      created+=("output-styles/: one .md per style, frontmatter name and description") ;;
    workflows)
      mkdir -p "$DEST/workflows"
      created+=("workflows/: one .js workflow script per file") ;;
    *)
      echo "error: unknown component '$c' (skills agents hooks mcp lsp bin monitors themes output-styles workflows)" >&2
      exit 2 ;;
  esac
done

# -------------------------------------------------------------------- register
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# Outstanding catalog issues (a TODO description on a freshly bootstrapped marketplace, say) make
# sync exit non-zero. The plugin is still scaffolded, so report and carry on rather than aborting.
if ! python3 "$SCRIPT_DIR/sync_marketplace.py" --root "$ROOT" --plugin "$NAME"; then
  echo "note: the catalog has outstanding issues (above); the plugin was created regardless" >&2
fi

echo
echo "created $DEST"
for line in ${created+"${created[@]}"}; do echo "  $line"; done
echo
echo "next:"
echo "  1. fill in description and keywords in .claude-plugin/plugin.json"
echo "  2. author the skills with the agent-toolkit:create-skill skill"
echo "  3. python3 $SCRIPT_DIR/check_plugin.py \"$DEST\""
echo "  4. claude plugin validate \"$DEST\""
