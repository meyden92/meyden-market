#!/usr/bin/env bash
# Status markers shared by every meyden script. Sourced, never executed.
#
# These are printed by the scripts rather than composed by the model, so the
# same event always reads the same way. The skills instruct the model to relay
# these lines verbatim; that only works if they are stable.
#
#   ▶︎  a target or session state changed  : always names host AND project
#   ☑️  done and verified on the far end   : not merely "exit status 0"
#   ➕  something was added to the session : project context, a host block
#   ‼️  needs the user's attention         : mismatch, changed host key, pending destructive op
#   ❌  refused or failed                   : always with the reason

step()  { printf '▶︎  %s\n' "$*"; }
ok()    { printf '☑️  %s\n' "$*"; }
added() { printf '➕ %s\n' "$*"; }
warn()  { printf '‼️  %s\n' "$*" >&2; }
fail()  { printf '❌ %s\n' "$*" >&2; }

# Abort with a reason. Extra arguments become indented continuation lines, so a
# refusal can say what to do next without smuggling it into the headline.
die() {
  fail "$1"; shift
  for line in "$@"; do printf '   %s\n' "$line" >&2; done
  exit 1
}
