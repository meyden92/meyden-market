#!/usr/bin/env bash
# meyden-ssh probe [--host <alias>]
#
# One-round-trip identity and health probe: resolved config, OS, uptime, load,
# disk and memory pressure, whether sudo works without a password, and which of
# systemd/docker are present.
#
# It also opens the multiplexed master connection that every later call reuses,
# so the rest of the session connects instantly and does not re-authenticate.
set -uo pipefail
LIB=$(cd "$(dirname "$0")/../lib" && pwd -P)
. "$LIB/ui.sh"; . "$LIB/pin.sh"; . "$LIB/ssh_common.sh"

target=""
while [ $# -gt 0 ]; do
  case "$1" in
    --host) target=${2:-}; shift 2 ;;
    -h|--help) echo "usage: meyden-ssh probe [--host <alias>]"; exit 0 ;;
    --) shift; break ;;
    -*) die "unknown option: $1" ;;
    *) target=$1; shift ;;
  esac
done

host=$(resolve_host "$target") || exit $?

step "probing $host"
echo
echo "--- resolved config (local, no connection) ---"
ssh -G "$host" 2>/dev/null | awk '
  $1 ~ /^(hostname|user|port|proxyjump|identityfile|identityagent|forwardagent)$/ { print "  " $0 }
' || echo "  (ssh -G failed: unknown target?)"

echo
echo "--- remote ---"
remote_run "$host" 'bash -s' <<'REMOTE'
set -u
say() { printf '  %-14s %s\n' "$1" "$2"; }

if [ -r /etc/os-release ]; then
  . /etc/os-release 2>/dev/null
  say "os" "${PRETTY_NAME:-${NAME:-unknown}}"
else
  say "os" "$(uname -s) $(uname -r)"
fi
say "kernel"   "$(uname -sr)"
say "arch"     "$(uname -m)"
say "hostname" "$(hostname -f 2>/dev/null || hostname)"
say "whoami"   "$(id -un)@$(id -gn) (uid $(id -u))"
say "uptime"   "$(uptime 2>/dev/null | sed 's/^ *//')"

if sudo -n true 2>/dev/null; then
  say "sudo" "passwordless"
elif command -v sudo >/dev/null 2>&1; then
  say "sudo" "PRESENT BUT NEEDS A PASSWORD -- ask the user to run privileged steps"
else
  say "sudo" "not installed"
fi

echo
echo "  --- capacity ---"
# -h without -P: BSD df lets -P override -h and prints 512-blocks instead.
df -h / /var /tmp 2>/dev/null | awk '!seen[$NF]++ {print "  " $0}'
if command -v free >/dev/null 2>&1; then
  free -h 2>/dev/null | awk '{print "  " $0}'
else
  say "memory" "$(vm_stat 2>/dev/null | head -2 | tr '\n' ' ' || echo unknown)"
fi

echo
echo "  --- what is available ---"
for tool in systemctl service docker podman nginx apache2 rsync git python3 journalctl; do
  if command -v "$tool" >/dev/null 2>&1; then printf '  %s' "$tool"; fi
done
echo
if command -v systemctl >/dev/null 2>&1; then
  failed=$(systemctl --failed --no-legend --no-pager 2>/dev/null | wc -l | tr -d ' ')
  say "failed units" "${failed:-0}"
  if [ "${failed:-0}" != "0" ]; then
    systemctl --failed --no-legend --no-pager 2>/dev/null | awk '{print "    " $0}'
  fi
fi
REMOTE

rc=$?
echo
if [ "$rc" -ne 0 ]; then
  fail "ssh exited $rc on $host: not reachable, auth failed, or the remote script errored."
  echo "   Read references/troubleshooting.md; re-run with -vvv for the handshake log." >&2
  exit "$rc"
fi
ok "$host answered; master connection open for 10m, later calls reuse it."
