#!/usr/bin/env bash
# meyden-ssh deploy <local-src-dir> <remote-dest-dir> [--host h] [--apply] [--delete] [--restart unit]
#
# Dry run by default, then apply, then verify. The dry run is not optional
# politeness -- it is the only place an unexpected deletion or a wrong-directory
# nesting becomes visible before it happens.
#
# The trailing slash on the source is handled here so the classic mistake cannot
# occur: this always copies the CONTENTS of <src> into <dest>, never <src> itself
# into <dest>/<src>.
set -uo pipefail
LIB=$(cd "$(dirname "$0")/../lib" && pwd -P)
HERE=$(cd "$(dirname "$0")" && pwd -P)
. "$LIB/ui.sh"; . "$LIB/pin.sh"; . "$LIB/ssh_common.sh"

target=""; apply=no; restart_unit=""; delete=no
src=""; dest=""
while [ $# -gt 0 ]; do
  case "$1" in
    --host) target=${2:-}; shift 2 ;;
    --apply) apply=yes; shift ;;
    --restart) restart_unit=${2:-}; shift 2 ;;
    --delete) delete=yes; shift ;;
    -h|--help) sed -n '2,2p' "$0" | sed 's/^# //'; exit 0 ;;
    --) shift; break ;;
    -*) die "unknown option: $1" ;;
    *) if [ -z "$src" ]; then src=$1; elif [ -z "$dest" ]; then dest=$1; else die "unexpected argument: $1"; fi; shift ;;
  esac
done

[ -n "$src" ] && [ -n "$dest" ] || die \
  "usage: meyden-ssh deploy <local-src-dir> <remote-dest-dir> [--host h] [--apply] [--delete] [--restart unit]"
[ -d "$src" ] || die "local source '$src' is not a directory"
case "$dest" in /*) ;; *) die "remote destination must be an absolute path, got '$dest'" ;; esac

host=$(resolve_host "$target") || exit $?
src="${src%/}/"     # always contents-of-src
dest="${dest%/}/"
qdest=$(sq "$dest")

have_rsync_local=no;  command -v rsync >/dev/null 2>&1 && have_rsync_local=yes
have_rsync_remote=no; remote_run "$host" 'command -v rsync >/dev/null 2>&1' && have_rsync_remote=yes

step "deploy $src → $host:$dest"
echo "   rsync: local=$have_rsync_local remote=$have_rsync_remote"
[ "$delete" = yes ] && warn "--delete is ON: files absent locally will be REMOVED on $host"
echo

if [ "$have_rsync_local" = yes ] && [ "$have_rsync_remote" = yes ]; then
  opts=(-a --info=stats1 -e "ssh $(ssh_opts | tr '\n' ' ')")
  [ "$delete" = yes ] && opts+=(--delete)
  if [ "$apply" != yes ]; then
    echo "--- DRY RUN (nothing transferred) ---"
    rsync -n -i "${opts[@]}" "$src" "$host:$dest"
    echo
    echo "-- re-run with --apply to transfer. Read the list above first:"
    echo "   unexpected deletions, or a file count far off from your build, show up here and nowhere else."
    exit 0
  fi
  rsync "${opts[@]}" "$src" "$host:$dest" || die "rsync to $host failed"
else
  # A minimal server image often lacks rsync. tar over ssh needs only a shell.
  echo "-- rsync unavailable on one end; using a tar pipe (adds and overwrites only, never deletes)"
  if [ "$apply" != yes ]; then
    echo "--- DRY RUN: files that would be sent ---"
    tar -czf - -C "$src" . | tar -tzf - | head -100
    echo "   (first 100 shown; total: $(tar -czf - -C "$src" . | tar -tzf - | wc -l | tr -d ' ') entries)"
    echo
    echo "-- re-run with --apply to transfer."
    exit 0
  fi
  tar -czf - -C "$src" . | remote_run "$host" "mkdir -p $qdest && tar -xzf - -C $qdest" || die "tar pipe to $host failed"
fi

echo
echo "--- verifying on $host ---"
remote_run "$host" "ls -la $qdest | head -20; echo '--- entry count ---'; find $qdest -type f | wc -l"
ok "transfer to $host:$dest completed and listed above."

if [ -n "$restart_unit" ]; then
  echo
  bash "$HERE/svc.sh" --host "$host" restart "$restart_unit"
fi
