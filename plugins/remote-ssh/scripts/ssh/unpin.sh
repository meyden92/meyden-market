#!/usr/bin/env bash
# meyden-ssh unpin: release this session's host, so another can be pinned.
set -uo pipefail
LIB=$(cd "$(dirname "$0")/../lib" && pwd -P)
. "$LIB/ui.sh"; . "$LIB/pin.sh"

previous=$(pin_get host) || previous=""
if [ -z "$previous" ]; then
  echo "no host pinned for this session, nothing to clear."
  exit 0
fi

pin_clear
step "pin cleared (was '$previous'), no host is settled for this session any more."
echo "   meyden-ssh verbs now require --host, or a new: meyden-ssh pin <alias>"
