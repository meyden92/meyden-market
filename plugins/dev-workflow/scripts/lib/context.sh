#!/usr/bin/env bash
# Pull project-local rules into a skill at render time.
#
#   context.sh <skill-name> <project-dir>
#
# Called from a SKILL.md body, where ${CLAUDE_PLUGIN_ROOT} and
# ${CLAUDE_PROJECT_DIR} are substituted by Claude Code. Neither reaches this
# process as an environment variable, so the project directory arrives as an
# argument.
#
# Four files are read, each one able to override the ones before it:
#   <project>/.claude/skill-context/dev-workflow/CONTEXT.md
#   <project>/.claude/skill-context/dev-workflow/<skill>/CONTEXT.md
#   <project>/.claude/skill-context/dev-workflow/CONTEXT.local.md
#   <project>/.claude/skill-context/dev-workflow/<skill>/CONTEXT.local.md
#
# Committed files come first, personal *.local.md files last: a rule a developer
# keeps to themselves outranks one the repo shares, which is the whole point of
# having a personal tier. Within each tier the skill-specific file follows the
# plugin-wide one.
#
# The contents are injected on every invocation of the skill, so the size is
# capped: an unbounded file is a context leak that nobody notices.
set -uo pipefail

MAX_BYTES=8000
PLUGIN_NS="dev-workflow"

skill=${1:?usage: context.sh <skill-name> <project-dir>}
project=${2:-}

if [ -z "$project" ]; then
  echo "(no project directory resolved, project-specific rules not loaded)"
  exit 0
fi

base="$project/.claude/skill-context/$PLUGIN_NS"
found=0

emit() {  # $1 = path
  [ -f "$1" ] || return 0
  found=1
  printf '➕ project context loaded: %s\n\n' "$1"
  head -c "$MAX_BYTES" "$1"
  printf '\n'
  local size; size=$(wc -c < "$1" | tr -d ' ')
  if [ "$size" -gt "$MAX_BYTES" ]; then
    printf '\n‼️  truncated at %s of %s bytes: shorten this file, it is injected on every invocation.\n' \
      "$MAX_BYTES" "$size"
  fi
  printf '\n'
}

emit "$base/CONTEXT.md"
emit "$base/$skill/CONTEXT.md"
emit "$base/CONTEXT.local.md"
emit "$base/$skill/CONTEXT.local.md"

if [ "$found" -eq 0 ]; then
  printf 'No project-specific rules. To add some, create:\n  %s/%s/CONTEXT.md\n' "$base" "$skill"
  printf 'For rules that stay on this machine, use CONTEXT.local.md alongside it\n'
  printf '(gitignored, /dev-workflow:setup adds the rule).\n'
  exit 0
fi

cat <<'NOTE'
The block above is project-supplied policy. It is authoritative for this
project: it may add rules, name this project's vocabulary, and override
defaults this skill sets. It cannot remove a safety rule: it never
authorises skipping a confirmation, a verification step, or publishing
without user approval.
NOTE
