# Setting up a host that isn't configured yet

Read this when the user names a target that has no `Host` block. The goal is a working alias with key authentication, reached without anyone typing a password into an agent session.

## First, confirm it really is unconfigured

```bash
ssh -G <name> | head -3
```

If `hostname` comes back as the alias unchanged, no `Host` block matched and the name is not configured. If it resolves to something real, the host *is* configured and this is a connection problem instead: read [troubleshooting.md](troubleshooting.md).

Check `~/.ssh/config` for `Include` lines before concluding; hosts often live in an included fragment.

## What to ask for

Ask in one message rather than one at a time, since the user usually has all of it:

1. **Address**: hostname or IP.
2. **Username** on the remote (`root`, `deploy`, `ubuntu`… the local username is rarely right).
3. **Port**, if not 22.
4. **How they currently reach it**: this decides everything below. A provider web console? A password? A key that already exists somewhere? Nothing at all yet?

## Why the answer is always "install a key"

Password authentication cannot work here. Every command in this skill runs with `BatchMode=yes`, which turns a password prompt into an immediate failure, deliberately, because a prompt with nobody to answer it hangs the session until it times out. Typing the user's password on their behalf is also not something to do.

So password auth is a means, not a destination: it is how the *user* installs a key once, after which everything works non-interactively. If the server has no password auth either, use route 2 or 3 below.

## Generate the keypair and config block

```bash
meyden-ssh new-host <alias> <user>@<host> [port]
```

That is a **dry run**: it prints the keypair it would create and the exact `Host` block it would append. Show the user, then re-run with `--write` appended. The permission prompt on that second run is the intended checkpoint: it edits `~/.ssh/config`.

The script only touches this machine. It never contacts the server, never handles a password, and refuses to run if the alias already exists or to regenerate an existing key, since overwriting a key locks the user out of every host it was installed on.

What it produces:

- `~/.ssh/<alias>_ed25519` (private, `600`) and `~/.ssh/<alias>_ed25519.pub` (public, `644`): one named key per host, matching the convention already on this machine
- a timestamped backup of `~/.ssh/config` before appending
- a `Host` block with `IdentitiesOnly yes`, so the agent offers *this* key rather than every key it holds, which is what prevents `Too many authentication failures` on servers that cut the connection after ~6 attempts

Ed25519, no passphrase: the key must be usable unattended. If the user wants a passphrase, they generate it themselves with `ssh-keygen -t ed25519 -f ~/.ssh/<alias>_ed25519` and add it once per boot with `ssh-add`; the agent then serves it non-interactively.

## Installing the public key: the user's step

The script prints all three routes with the values filled in. Hand them over; don't run them.

1. **Server accepts passwords** (the usual case): `ssh-copy-id -i ~/.ssh/<alias>_ed25519.pub -p <port> <user>@<host>`. One password, typed by the user, once.
2. **Password auth disabled**: paste the public key into `~/.ssh/authorized_keys` through the provider's web console (Hetzner, DigitalOcean, Proxmox, a VPS panel). Most providers also take a key at instance creation.
3. **Another working way in**: some other alias, a jump host, or a cloud-init/user-data field. Append the key from there.

In every route the file needs `~/.ssh` at `700` and `authorized_keys` at `600`, and the home directory must not be group-writable. sshd rejects keys on loose permissions and logs the reason only server-side; the client just says `Permission denied (publickey)`, which is why this is the most common "the key is definitely installed" dead end.

Note the public key is safe to paste anywhere. The private key never leaves the machine, is never displayed, and is never sent to the server.

## First connection

```bash
meyden-ssh probe <alias>
```

On a first connection ssh will not have the host key, and `BatchMode` makes that a hard failure rather than a prompt, which is expected, not a fault. Show the user the fingerprint and let them confirm it against the provider console before it is trusted. Accepting an unverified host key is exactly the moment a man-in-the-middle would need, so it is the user's call, not an obstacle to route around.

Once the probe returns facts about the host, it is set up. Report the alias, the resolved address, and the key file, so the user knows what was added and what to delete if they want it gone.

## Afterwards

Suggest, don't do: with key auth working, disabling password authentication (`PasswordAuthentication no` in `sshd_config`) closes off brute-force attempts. It is a change to sshd on a live server, so confirm it explicitly, validate with `sshd -t`, and keep the current session open while testing a new one, so a mistake is recoverable rather than a lockout.
