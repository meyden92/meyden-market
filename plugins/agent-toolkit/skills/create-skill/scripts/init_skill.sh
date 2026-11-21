#!/bin/bash
# Scaffold a new Claude Code skill directory.
#
# Usage: init_skill.sh <skill-name> <personal|project|path>
#   personal → ~/.claude/skills/<name>
#   project  → ./.claude/skills/<name>
#   <path>   → <path>/<name>
set -euo pipefail

USAGE="usage: init_skill.sh <skill-name> <personal|project|path>"
NAME="${1:?$USAGE}"
WHERE="${2:?$USAGE}"

if ! [[ "$NAME" =~ ^[a-z0-9]+(-[a-z0-9]+)*$ ]]; then
  echo "error: name '$NAME' must be lowercase words separated by hyphens" >&2
  exit 1
fi

case "$WHERE" in
  personal) DEST="$HOME/.claude/skills/$NAME" ;;
  project)  DEST="$PWD/.claude/skills/$NAME" ;;
  *)        DEST="$WHERE/$NAME" ;;
esac

if [ -e "$DEST" ]; then
  echo "error: $DEST already exists" >&2
  exit 1
fi

PARENT="$(dirname "$DEST")"
NEW_TOPLEVEL=""
[ -d "$PARENT" ] || NEW_TOPLEVEL="yes"

mkdir -p "$DEST"
cat > "$DEST/SKILL.md" <<EOF
---
name: $NAME
description: >-
  TODO: what this skill does AND when to use it, key use case first.
  Use whenever the user mentions ... (be a bit pushy; Claude undertriggers).
# --- optional fields: keep only what the skill actually needs ---
# when_to_use: Trigger phrases like "...", "...".
# argument-hint: "[arg1] [arg2]"
# arguments: [arg1, arg2]
# disable-model-invocation: true   # user-only (side effects: deploy, commit, ...)
# user-invocable: false            # Claude-only background knowledge
# allowed-tools: Bash(python3 \${CLAUDE_SKILL_DIR}/scripts/*)
# context: fork                    # run isolated; body becomes the subagent prompt
# agent: Explore                   # only with context: fork
---

TODO: standing instructions in imperative form. The body persists in context
for the whole session once invoked, so every line is a recurring cost.

Reference bundled files as \${CLAUDE_SKILL_DIR}/scripts/<file> and link
reference docs with a note on when to read them.
EOF

echo "created $DEST/SKILL.md"
echo "next: edit the description, then validate:"
echo "  python3 \"\$(dirname \"\$0\")/validate_skill.py\" \"$DEST\""
if [ -n "$NEW_TOPLEVEL" ]; then
  echo "note: $PARENT did not exist before; restart Claude Code so the new skills directory is watched."
fi
