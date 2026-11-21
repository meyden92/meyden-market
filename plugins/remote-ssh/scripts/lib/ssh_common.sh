#!/usr/bin/env bash
# The correct ssh invocation, written once. Sourced by every ssh script.
#
# Every remote command goes out with BatchMode (so a password or passphrase
# prompt fails immediately instead of hanging until the tool call times out), a
# connect timeout, and connection multiplexing. Rebuilding that by hand on each
# call is how one of them ends up missing.
#
# Requires lib/pin.sh (for $MEYDEN_SOCKET_DIR) and lib/ui.sh to be sourced first.

ssh_opts() {
  printf '%s\n' \
    -o BatchMode=yes \
    -o ConnectTimeout=10 \
    -o ServerAliveInterval=15 \
    -o ServerAliveCountMax=3 \
    -o ControlMaster=auto \
    -o "ControlPath=$MEYDEN_SOCKET_DIR/%C" \
    -o ControlPersist=10m
}

# Single-quote a value for a remote shell, including values containing quotes.
# Interpolating an unquoted unit name or path into the remote command string is
# how a log filter turns into an arbitrary remote command.
sq() {
  printf "'%s'" "$(printf '%s' "$1" | sed "s/'/'\\\\''/g")"
}

# The `ssh -G` fields that say which machine and which account a name resolves
# to. Everything else is noise for the purpose of "did a Host block apply".
ssh_identity_fields() { grep -E '^(hostname|user|port|identityfile) ' | sort; }

# True when a Host block actually applies to this alias, decided by comparing
# the effective config against the same query with no config file at all.
#
# Testing whether `ssh -G` echoed the name back looks equivalent and is not: an
# alias deliberately named after its own target (`Host app1.example.com` with
# `HostName app1.example.com`) resolves to itself exactly like an unknown name
# does, and was rejected as unconfigured.
#
# The comparison is restricted to the identity fields on purpose. A full diff
# does not work: the system-wide /etc/ssh/ssh_config contributes `sendenv LANG`
# and `sendenv LC_*`, so every name -- typos included -- differs from the bare
# baseline and the check would pass everything while still looking strict.
host_is_configured() {  # $1 = alias
  local with without
  with=$(ssh -G "$1" 2>/dev/null | ssh_identity_fields)
  without=$(ssh -G -F /dev/null "$1" 2>/dev/null | ssh_identity_fields)
  [ -n "$with" ] && [ "$with" != "$without" ]
}

list_configured_hosts() {
  ssh_config_host_patterns ~/.ssh/config | sort -u | sed 's/^/     /'
}

# Host patterns from a config file and everything it Includes.
#
# `ssh -G` answers for one name but cannot enumerate them, so the file has to be
# parsed -- and it must be parsed the way ssh reads it. The previous awk saw
# ~/.ssh/config alone, so anyone using `Include ~/.ssh/config.d/*` got a list
# that contradicted host_is_configured: the same disagreement, only at the
# output instead of the check.
#
# Wildcard and negated patterns are dropped: they are not names anything can be
# pinned to. The depth bound mirrors ssh's own nesting limit and stops a config
# that includes itself from hanging the session.
ssh_config_host_patterns() {  # $1 = config file, $2 = depth
  local file=$1 depth=${2:-0} keyword rest pattern target expanded
  local values=()
  [ "$depth" -lt 16 ] || return 0
  [ -r "$file" ] || return 0
  while read -r keyword rest; do
    # `read -ra` splits on whitespace WITHOUT pathname expansion. Splitting an
    # unquoted $rest instead would let the `*` of a `Host *` block glob against
    # the working directory and list its filenames as configured hosts.
    read -ra values <<< "$rest"
    case "$keyword" in
      [Hh][Oo][Ss][Tt])
        for pattern in "${values[@]}"; do
          case "$pattern" in *[*?!]*) ;; *) printf '%s\n' "$pattern" ;; esac
        done
        ;;
      [Ii][Nn][Cc][Ll][Uu][Dd][Ee])
        for target in "${values[@]}"; do
          case "$target" in
            "~/"*) target="$HOME/${target#\~/}" ;;
            /*) ;;
            *) target="$HOME/.ssh/$target" ;;   # ssh resolves a bare path here
          esac
          # Unquoted on purpose: here the glob is the point. A pattern matching
          # nothing stays literal and fails the -f test.
          for expanded in $target; do
            [ -f "$expanded" ] && ssh_config_host_patterns "$expanded" "$((depth + 1))"
          done
        done
        ;;
    esac
  done < "$file"
}

remote_run() {  # $1 = host, rest = remote command string
  local host=$1; shift
  local opts; IFS=$'\n' read -r -d '' -a opts < <(ssh_opts; printf '\0')
  ssh "${opts[@]}" "$host" "$@"
}
