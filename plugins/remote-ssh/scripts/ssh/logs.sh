#!/usr/bin/env bash
# meyden-ssh logs [unit] [lines] [since]   journal for one unit, or the whole one
# meyden-ssh logs --errors                 priority<=err across all units
# meyden-ssh logs --file /var/log/x        a plain file instead of the journal
#
# Everything here is bounded and --no-pager. `journalctl -f` and `tail -f` never
# return without a TTY, so they are not reachable through this verb at all.
#
# Every value that reaches the remote shell goes through sq(); a unit name or
# path containing a quote is data, not syntax.
set -uo pipefail
LIB=$(cd "$(dirname "$0")/../lib" && pwd -P)
. "$LIB/ui.sh"; . "$LIB/pin.sh"; . "$LIB/ssh_common.sh"

target=""; errors_only=no; plain_file=""
while [ $# -gt 0 ]; do
  case "$1" in
    --host) target=${2:-}; shift 2 ;;
    --errors) errors_only=yes; shift ;;
    --file) plain_file=${2:-}; shift 2 ;;
    -h|--help) sed -n '2,4p' "$0" | sed 's/^# //'; exit 0 ;;
    --) shift; break ;;
    -*) die "unknown option: $1" ;;
    *) break ;;
  esac
done

host=$(resolve_host "$target") || exit $?
unit=${1:-}
lines=${2:-200}
since=${3:-}

case "$lines" in ''|*[!0-9]*) die "line count must be a number, got '$lines'" ;; esac

if [ -n "$plain_file" ]; then
  remote_run "$host" "tail -n $lines -- $(sq "$plain_file")"
  exit $?
fi

cmd="journalctl --no-pager -n $lines"
[ -n "$unit" ]  && cmd="$cmd -u $(sq "$unit")"
[ -n "$since" ] && cmd="$cmd --since $(sq "$since")"
[ "$errors_only" = yes ] && cmd="$cmd -p err"

# Fall back to the classic log files where journald is absent.
remote_run "$host" "command -v journalctl >/dev/null 2>&1 && $cmd || tail -n $lines /var/log/syslog /var/log/messages 2>/dev/null"
