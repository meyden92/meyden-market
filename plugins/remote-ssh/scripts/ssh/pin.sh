#!/usr/bin/env bash
# meyden-ssh pin <alias>
#
# Settle this Claude session on exactly one machine. Every ssh verb then acts on
# it without being told, and the remote guard denies raw ssh/scp/rsync aimed
# anywhere else.
#
# The alias is verified to resolve and to answer BEFORE the pin is written, so a
# typo fails here rather than halfway through the first real task.
set -uo pipefail
LIB=$(cd "$(dirname "$0")/../lib" && pwd -P)
. "$LIB/ui.sh"; . "$LIB/pin.sh"; . "$LIB/ssh_common.sh"

alias_name=${1:-}
case "$alias_name" in
  ""|-h|--help) echo "usage: meyden-ssh pin <alias>"; exit 0 ;;
esac

if ! host_is_configured "$alias_name"; then
  fail "'$alias_name' is not configured: no Host block in ~/.ssh/config matched."
  echo "   Configured hosts on this machine:" >&2
  list_configured_hosts >&2
  echo >&2
  echo "   If '$alias_name' is a new machine, set it up first:" >&2
  echo "     meyden-ssh new-host $alias_name <user>@<hostname> [port]" >&2
  exit 3
fi

step "checking $alias_name answers before pinning..."
err=$(mktemp)
if ! remote_run "$alias_name" true 2>"$err"; then
  fail "'$alias_name' is configured but did not answer:"
  sed 's/^/     /' "$err" >&2
  rm -f "$err"
  echo >&2
  echo "   Not pinned. See references/troubleshooting.md, or:" >&2
  echo "     ssh -vvv -o BatchMode=yes $alias_name true 2>&1 | tail -40" >&2
  exit 4
fi
rm -f "$err"

previous=$(pin_get host) || previous=""
project=$(meyden_project_dir)

pin_write "$alias_name"

if [ -n "$previous" ] && [ "$previous" != "$alias_name" ]; then
  warn "pin CHANGED: $previous → $alias_name"
fi
step "pinned to '$alias_name'  (project: $project)"
ok "every meyden-ssh verb and every raw ssh command in this session now targets '$alias_name'."
echo "   change target: meyden-ssh unpin, then pin again    ·    inspect: meyden-ssh status"
