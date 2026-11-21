#!/usr/bin/env bash
# meyden-ssh status: what this session is pinned to, and where that was decided.
set -uo pipefail
LIB=$(cd "$(dirname "$0")/../lib" && pwd -P)
. "$LIB/ui.sh"; . "$LIB/pin.sh"

session=$(meyden_session_id)
if [ -z "$session" ]; then
  warn "no session id (CLAUDE_CODE_SESSION_ID unset), pinning is unavailable in this process."
  exit 0
fi

host=$(pin_get host) || host=""
if [ -z "$host" ]; then
  echo "no host pinned for this session."
  echo "   Any target is allowed, but every verb must name one with --host."
  echo "   Settle on one: meyden-ssh pin <alias>"
  exit 0
fi

created=$(pin_get created)
canonical=$(pin_canonical) || canonical=""
printf '▶︎  pinned host : %s\n' "$host"
# The guard compares machines, not names, so show which machine that is
# whenever the alias differs from it. Otherwise the two layers look like they
# disagree when a command names the same box differently.
[ -n "$canonical" ] && [ "$canonical" != "$host" ] && \
  printf '   machine     : %s  (every alias for it is accepted)\n' "$canonical"
printf '   project     : %s\n' "$(pin_get project)"
printf '   pinned since: %s\n' "$(date -r "${created:-0}" '+%Y-%m-%d %H:%M:%S' 2>/dev/null || echo unknown)"
printf '   session     : %s\n' "$session"
pin_check_project
