#!/usr/bin/env bash
# The per-session host pin. Sourced by every ssh script; mirrored in pin.py for
# the hooks, which must reach exactly the same file.
#
# One pin per Claude session, keyed on the session id. The project the pin was
# made in is recorded alongside it and reported on mismatch, but is deliberately
# NOT part of the key: a bin/ process only knows its cwd while a hook is given
# ${CLAUDE_PROJECT_DIR}, so keying on project would let the two layers disagree
# about which pin applies -- the scripts acting on a host the guard is not
# policing, which is the one outcome the pin exists to prevent.
#
# State lives under /tmp rather than ${CLAUDE_PLUGIN_DATA} for two reasons:
# a bin/ executable is not given CLAUDE_PLUGIN_DATA at all (only hooks are), so
# the two layers could not agree on the path; and ssh control sockets are capped
# near 104 bytes, where the plugin data directory plus ssh's 40-character %C
# hash lands at 102. Session state should not survive a reboot anyway.

MEYDEN_STATE_DIR="/tmp/.meyden-$(id -u)"
MEYDEN_PIN_DIR="$MEYDEN_STATE_DIR/pins"
MEYDEN_SOCKET_DIR="$MEYDEN_STATE_DIR/cm"

mkdir -p "$MEYDEN_PIN_DIR" "$MEYDEN_SOCKET_DIR" 2>/dev/null || true
chmod 700 "$MEYDEN_STATE_DIR" "$MEYDEN_PIN_DIR" "$MEYDEN_SOCKET_DIR" 2>/dev/null || true

# The session this process belongs to. Subagents inherit the parent's value, so
# a pin set in the main thread still applies inside one.
meyden_session_id() { printf '%s' "${CLAUDE_CODE_SESSION_ID:-}"; }

# The project this process is acting in. Hooks are handed CLAUDE_PROJECT_DIR;
# a bin/ process is not, so it falls back to the git root of the working
# directory and finally to the directory itself.
meyden_project_dir() {
  if [ -n "${CLAUDE_PROJECT_DIR:-}" ]; then
    printf '%s' "$CLAUDE_PROJECT_DIR"
    return 0
  fi
  git rev-parse --show-toplevel 2>/dev/null || pwd -P
}

# The machine a name refers to, independent of what anyone calls it locally.
# `ssh -G` reports the effective HostName, so every alias for one box collapses
# to the same string and a name nothing matches resolves to itself -- which is
# why an unknown target can never collide with a pin by accident.
#
# This is what the pin compares. Comparing the names as typed instead makes
# enforcement depend on local naming: `app-deploy` says app1.example.com, a
# colleague's config calls the same machine app1, and one of the two gets
# denied for no reason. Mirrored in pin.py for the guard.
canonical_host() {  # $1 = name
  local resolved
  resolved=$(ssh -G "$1" 2>/dev/null | sed -n 's/^hostname //p' | head -1)
  printf '%s' "${resolved:-$1}"
}

meyden_pin_file() {
  local session; session=$(meyden_session_id)
  [ -n "$session" ] || return 1
  printf '%s/%s' "$MEYDEN_PIN_DIR" "$session"
}

pin_get() {  # $1 = field name (host|project|created)
  local file; file=$(meyden_pin_file) || return 1
  [ -f "$file" ] || return 1
  local value; value=$(sed -n "s/^$1=//p" "$file" 2>/dev/null | head -1)
  [ -n "$value" ] || return 1
  printf '%s' "$value"
}

# Both names are recorded on purpose. `host` is the alias as typed and is what
# every verb connects with, so the Host block's User and IdentityFile still
# apply; `canonical` is what the pin is enforced on. Connecting to the canonical
# name instead would silently drop that block -- same machine, wrong account.
pin_write() {  # $1 = alias as typed
  local file; file=$(meyden_pin_file) || die \
    "cannot pin: this process has no session id (CLAUDE_CODE_SESSION_ID is unset)." \
    "A pin is scoped to one Claude session; without the id there is nothing to scope it to."
  umask 077
  {
    printf 'host=%s\n' "$1"
    printf 'canonical=%s\n' "$(canonical_host "$1")"
    printf 'project=%s\n' "$(meyden_project_dir)"
    printf 'created=%s\n' "$(date +%s)"
  } > "$file"
}

# The pinned machine, as the guard sees it. Falls back to resolving the alias
# for a pin file written before `canonical` existed: such a file is still live
# in /tmp during an upgrade, and treating its absence as "no match" would deny
# every remote command for the rest of that session.
pin_canonical() {
  pin_get canonical && return 0
  local host; host=$(pin_get host) || return 1
  canonical_host "$host"
}

pin_clear() {
  local file; file=$(meyden_pin_file) || return 1
  [ -f "$file" ] || return 1
  rm -f "$file"
}

# Warn when the pin was made in a different project. This is a notice, not a
# refusal: one session may legitimately move between directories, and refusing
# here would invent a new way to be stuck. The point is that it can never happen
# silently.
pin_check_project() {
  local pinned_project here
  pinned_project=$(pin_get project) || return 0
  here=$(meyden_project_dir)
  [ "$pinned_project" = "$here" ] && return 0
  warn "the pin was made in $pinned_project but this command runs in $here."
  warn "   Still acting on '$(pin_get host)'. Re-pin here if that is wrong: meyden-ssh pin <alias>"
}

# The host to act on. A pin wins; otherwise the caller must name a target.
# Guessing a host is never acceptable.
resolve_host() {  # $1 = explicit target, may be empty
  local explicit=${1:-} pinned
  pinned=$(pin_get host) || pinned=""
  if [ -n "$pinned" ]; then
    # Compared canonically, so naming the pinned machine by any of its aliases
    # is accepted and only a genuinely different box is refused.
    if [ -n "$explicit" ] && [ "$(canonical_host "$explicit")" != "$(pin_canonical)" ]; then
      die "this session is pinned to '$pinned' but the command targets '$explicit'." \
          "The pin exists so one session cannot act on two machines by accident." \
          "To act on '$explicit': meyden-ssh unpin, then pin it."
    fi
    pin_check_project >&2
    printf '%s' "$pinned"
    return 0
  fi
  [ -n "$explicit" ] || die "no host given and no host pinned for this session." \
      "Pin one:  meyden-ssh pin <alias>" \
      "or name the target explicitly with --host <alias>."
  printf '%s' "$explicit"
}
