#!/usr/bin/env bash
# meyden-ssh svc status <unit>     state + recent log lines
# meyden-ssh svc restart <unit>    restart, then confirm it came back
# meyden-ssh svc reload <unit>     reload (keeps connections), then confirm
# meyden-ssh svc failed            every failed unit on the host
#
# A change is not done when the command exits 0 -- it is done when the effect is
# visible. Every restart/reload re-checks the unit and prints the log lines since
# the change, so a service that died on startup cannot be reported as restarted.
set -uo pipefail
LIB=$(cd "$(dirname "$0")/../lib" && pwd -P)
. "$LIB/ui.sh"; . "$LIB/pin.sh"; . "$LIB/ssh_common.sh"

target=""
while [ $# -gt 0 ]; do
  case "$1" in
    --host) target=${2:-}; shift 2 ;;
    -h|--help) sed -n '2,5p' "$0" | sed 's/^# //'; exit 0 ;;
    --) shift; break ;;
    -*) die "unknown option: $1" ;;
    *) break ;;
  esac
done

host=$(resolve_host "$target") || exit $?
action=${1:-}
unit=${2:-}

case "$action" in
  failed)
    remote_run "$host" 'systemctl --failed --no-pager --no-legend 2>/dev/null || echo "(no systemd on this host)"'
    ;;

  status)
    [ -n "$unit" ] || die "usage: meyden-ssh svc status <unit>"
    q=$(sq "$unit")
    remote_run "$host" "
      systemctl status --no-pager --lines=0 $q 2>&1 | head -12
      echo '--- is-active ---';  systemctl is-active $q 2>&1
      echo '--- is-enabled ---'; systemctl is-enabled $q 2>&1
      echo '--- last 20 log lines ---'
      journalctl --no-pager -n 20 -u $q 2>/dev/null || true"
    ;;

  restart|reload)
    [ -n "$unit" ] || die "usage: meyden-ssh svc $action <unit>"
    q=$(sq "$unit")
    step "$action $unit on $host"
    remote_run "$host" "
      if [ \"\$(id -u)\" -ne 0 ]; then SUDO='sudo -n'; else SUDO=''; fi
      set -e
      stamp=\$(date '+%Y-%m-%d %H:%M:%S')
      \$SUDO systemctl $action $q
      sleep 2
      echo '--- is-active ---'
      systemctl is-active $q || true
      echo \"--- log lines since \$stamp ---\"
      journalctl --no-pager -u $q --since \"\$stamp\" 2>/dev/null | tail -30 || true"
    rc=$?
    echo
    if [ $rc -ne 0 ]; then
      fail "$action of '$unit' on $host did not complete cleanly (exit $rc)."
      echo "   Read the log lines above before retrying: a unit that fails to start" >&2
      echo "   usually names its reason there." >&2
      exit $rc
    fi
    ok "$unit on $host: $action issued and the unit re-checked, read is-active above."
    ;;

  *)
    die "usage: meyden-ssh svc {status <unit>|restart <unit>|reload <unit>|failed}"
    ;;
esac
