#!/usr/bin/env bash
# meyden-ssh new-host <alias> <user>@<hostname> [port]          dry run
# meyden-ssh new-host <alias> <user>@<hostname> [port] --write  apply
#
# Generates a named keypair and a ~/.ssh/config block. Touches ONLY the local
# machine: it never contacts the server and never handles a password. Installing
# the public key is a command the user runs themselves.
set -uo pipefail
LIB=$(cd "$(dirname "$0")/../lib" && pwd -P)
. "$LIB/ui.sh"

alias_name=${1:-}
dest=${2:-}
port=22
write=no

case "$alias_name" in -h|--help) sed -n '2,3p' "$0" | sed 's/^# //'; exit 0 ;; esac

shift 2 2>/dev/null || true
for arg in "$@"; do
  case "$arg" in
    --write) write=yes ;;
    ''|*[!0-9]*) die "unrecognised argument: $arg" ;;
    *) port=$arg ;;
  esac
done

if [ -z "$alias_name" ] || [ -z "$dest" ]; then
  die "usage: meyden-ssh new-host <alias> <user>@<hostname> [port] [--write]"
fi
case "$dest" in
  *@*) remote_user=${dest%%@*}; remote_host=${dest#*@} ;;
  *)   die "second argument must be <user>@<hostname>, got: $dest" ;;
esac
if [ -z "$remote_user" ] || [ -z "$remote_host" ]; then
  die "could not parse user and hostname out of: $dest"
fi

cfg="$HOME/.ssh/config"
# Match the naming convention already on this machine: <alias>_ed25519(.pub)
safe=$(printf '%s' "$alias_name" | tr -c 'A-Za-z0-9_.-' '_')
key="$HOME/.ssh/${safe}_ed25519"
key_display="~/.ssh/${safe}_ed25519"   # what goes in the config, for portability

# --- refuse to clobber -------------------------------------------------------
# A Host line can name several aliases ("Host prod prod-eu"), so compare field by
# field. A regex misses the single-alias case and silently appends a duplicate
# block, which leaves the first match winning and the edit looking lost.
if [ -f "$cfg" ] && awk -v a="$alias_name" '
      tolower($1) == "host" { for (i = 2; i <= NF; i++) if ($i == a) { found = 1; exit } }
      END { exit found ? 0 : 1 }
   ' "$cfg"; then
  die "'$alias_name' already has a Host block in $cfg." \
      "Inspect it with: ssh -G $alias_name"
fi
key_exists=no
[ -f "$key" ] && key_exists=yes

block=$(cat <<BLOCK

Host $alias_name
    HostName $remote_host
    User $remote_user
    Port $port
    IdentityFile $key_display
    IdentitiesOnly yes
    ServerAliveInterval 15
    ServerAliveCountMax 3
BLOCK
)

step "plan for '$alias_name' → ${remote_user}@${remote_host}:${port}"
echo
if [ "$key_exists" = yes ]; then
  echo "  keypair:  $key already exists, reusing it, NOT regenerating"
  echo "            (regenerating would lock you out of anywhere the old key is installed)"
else
  echo "  keypair:  create $key and ${key}.pub (ed25519, no passphrase)"
fi
echo "  config:   append this block to $cfg"
echo "$block" | sed 's/^/            /'
echo
echo "  remote:   NOTHING. This never touches the server."

if [ "$write" != yes ]; then
  echo
  echo "-- dry run. Re-run with --write to apply."
  exit 0
fi

# --- apply -------------------------------------------------------------------
echo
mkdir -p "$HOME/.ssh" && chmod 700 "$HOME/.ssh"

if [ "$key_exists" = no ]; then
  ssh-keygen -t ed25519 -N '' \
    -C "${alias_name} ${remote_user}@${remote_host} ($(id -un)@$(hostname -s) $(date +%Y-%m-%d))" \
    -f "$key" >/dev/null || die "ssh-keygen failed"
  chmod 600 "$key"; chmod 644 "${key}.pub"
  added "created $key"
fi

if [ -f "$cfg" ]; then
  backup="${cfg}.bak-$(date +%Y%m%d-%H%M%S)"
  cp -p "$cfg" "$backup"
  echo "   backed up config → $backup"
else
  touch "$cfg"
fi
chmod 600 "$cfg"
printf '%s\n' "$block" >> "$cfg"
added "appended Host block for '$alias_name' to $cfg"

echo
echo "=== the public key to install on ${remote_host} ==="
cat "${key}.pub"
echo
warn "YOU run one of these: the password is yours to type, not mine."
echo
echo "  # 1. server still accepts password logins (usual case):"
echo "  ssh-copy-id -i ${key}.pub -p ${port} ${remote_user}@${remote_host}"
echo
echo "  # 2. password auth disabled, paste the key via the provider's web console:"
echo "  mkdir -p ~/.ssh && chmod 700 ~/.ssh"
echo "  echo '<the public key line above>' >> ~/.ssh/authorized_keys"
echo "  chmod 600 ~/.ssh/authorized_keys"
echo
echo "  # 3. you already reach the box some other way:"
echo "  ssh <working-target> \"mkdir -p ~/.ssh && chmod 700 ~/.ssh && echo '$(cat "${key}.pub")' >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys\""
echo
echo "then verify with:  meyden-ssh probe $alias_name"
