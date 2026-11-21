#!/usr/bin/env bash
# Bootstrap a Claude Code plugin marketplace repository.
#
# Usage: init_marketplace.sh <marketplace-name> [target-dir]
#   target-dir defaults to the current directory.
#
# Creates:
#   <dir>/.claude-plugin/marketplace.json
#   <dir>/plugins/            (empty; plugins land here via init_plugin.sh)
#   <dir>/README.md
#   <dir>/.gitignore          (only if absent)
#
# docs/ and examples/ are deliberately not created; they are maintained by hand.
set -euo pipefail

NAME="${1:?usage: init_marketplace.sh <marketplace-name> [target-dir]}"
DIR="${2:-$PWD}"

if ! [[ "$NAME" =~ ^[a-z0-9]+(-[a-z0-9]+)*$ ]]; then
  echo "error: marketplace name '$NAME' must be kebab-case (lowercase words separated by hyphens)" >&2
  exit 1
fi

# Names reserved by Anthropic or used by Claude Code itself (2.1.325), plus the three
# Claude Desktop rejects. The kebab-case check above already rules out the JavaScript
# member names (constructor, toString, ...) and other spellings of these.
RESERVED=(
  claude-code-marketplace claude-code-plugins claude-plugins-official
  claude-plugins-community claude-community anthropic-marketplace
  anthropic-plugins agent-skills anthropic-agent-skills
  knowledge-work-plugins life-sciences claude-for-legal
  claude-for-financial-services financial-services-plugins
  first-party-plugins claude-tag-plugins healthcare
  anthropic-plugin-directory claude-plugin-directory
  inline builtin skills-dir synced claude-plugin-test
  org org-provisioned unknown
)
for r in "${RESERVED[@]}"; do
  if [ "$NAME" = "$r" ]; then
    echo "error: '$NAME' is a reserved marketplace name and will be refused at load time" >&2
    exit 1
  fi
done
case "$NAME" in
  claudeai-* )
    echo "error: names starting with 'claudeai-' are reserved for marketplaces hosted on claude.ai" >&2
    exit 1 ;;
  official-* | *-official | anthropic-* )
    echo "warning: '$NAME' may read as an impersonation of an official Anthropic marketplace" >&2 ;;
esac

MANIFEST="$DIR/.claude-plugin/marketplace.json"
if [ -e "$MANIFEST" ]; then
  echo "error: $MANIFEST already exists: this is already a marketplace root" >&2
  exit 1
fi

OWNER_NAME="$(git -C "$DIR" config user.name 2>/dev/null || git config user.name 2>/dev/null || echo "TODO: owner name")"
OWNER_EMAIL="$(git -C "$DIR" config user.email 2>/dev/null || git config user.email 2>/dev/null || true)"

mkdir -p "$DIR/.claude-plugin" "$DIR/plugins"

if [ -n "$OWNER_EMAIL" ]; then
  OWNER_BLOCK=$(printf '    "name": %s,\n    "email": %s' "\"$OWNER_NAME\"" "\"$OWNER_EMAIL\"")
else
  OWNER_BLOCK=$(printf '    "name": %s' "\"$OWNER_NAME\"")
fi

cat > "$MANIFEST" <<EOF
{
  "name": "$NAME",
  "description": "TODO: one line on what this marketplace distributes",
  "owner": {
$OWNER_BLOCK
  },
  "plugins": []
}
EOF

if [ ! -e "$DIR/README.md" ]; then
  cat > "$DIR/README.md" <<EOF
# $NAME

Claude Code plugin marketplace.

## Install

\`\`\`bash
claude plugin marketplace add <owner>/<repo>
claude plugin install <plugin-name>@$NAME
\`\`\`

## Plugins

None yet.
EOF
fi

if [ ! -e "$DIR/.gitignore" ]; then
  cat > "$DIR/.gitignore" <<'EOF'
.DS_Store
node_modules/
__pycache__/
*.pyc
EOF
fi

echo "created marketplace '$NAME' at $DIR"
echo
echo "  .claude-plugin/marketplace.json   fill in the description"
echo "  plugins/                          add plugins with init_plugin.sh"
echo
echo "next: init_plugin.sh <plugin-name> --root \"$DIR\""
