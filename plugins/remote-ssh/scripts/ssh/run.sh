#!/usr/bin/env bash
# meyden-ssh run '<command>'          on the pinned host
# meyden-ssh run --host web1 '<cmd>'  explicit target (refused if pinned elsewhere)
# meyden-ssh run --stdin < script     multi-line work
#
# Pass the remote command as ONE single-quoted argument. Single quotes keep the
# local shell from expanding variables and command substitutions before ssh sees
# them -- the trap that silently turns a remote path into a local one.
set -uo pipefail
LIB=$(cd "$(dirname "$0")/../lib" && pwd -P)
. "$LIB/ui.sh"; . "$LIB/pin.sh"; . "$LIB/ssh_common.sh"

target=""
use_stdin=no
while [ $# -gt 0 ]; do
  case "$1" in
    --host) target=${2:-}; shift 2 ;;
    --stdin) use_stdin=yes; shift ;;
    -h|--help) sed -n '2,5p' "$0" | sed 's/^# //'; exit 0 ;;
    --) shift; break ;;
    -*) die "unknown option: $1" ;;
    *) break ;;
  esac
done

host=$(resolve_host "$target") || exit $?

if [ "$use_stdin" = yes ]; then
  remote_run "$host" 'bash -s'
  exit $?
fi

[ $# -gt 0 ] || die "no command given." \
  "usage: meyden-ssh run [--host <alias>] '<remote command>'" \
  "       meyden-ssh run [--host <alias>] --stdin < script"

remote_run "$host" "$*"
