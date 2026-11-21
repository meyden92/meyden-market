---
name: ssh
description: Open a shell on one specific remote machine over SSH and work there, running commands on it, reading its logs, services, disk, memory and containers, copying or deploying files onto it, setting up first-time access (named keypair plus ~/.ssh/config entry), and diagnosing ssh or publickey failures. Resolves targets from ~/.ssh/config, keeps remote commands non-interactive, verifies each change, and confirms before destructive operations.
when_to_use: Fires only when BOTH are present - a machine to act on, AND work that can only be done from a shell on it. Qualifying work - ssh, scp or rsync named outright; an ssh key, ~/.ssh/config entry or "Permission denied (publickey)" for a host; that machine's own internals (its RAM, disk, journal/journald, systemd units, containers, processes, files); copying a build to a path on it and restarting the service there. An environment word like "staging" or "prod" still qualifies once shell-only work is attached - "put dist/ in /srv/app on staging and bounce it", "grab the journal for the coolify unit", "what's eating the ram on that box" are all in scope. What does NOT qualify is a machine named with no shell-only work attached - "is X up", "why is X slow", "X returns 502" are answerable from outside and could equally mean curl, DNS or the app, and a bare environment word may cover several machines; ask which host and what to run there rather than connecting. Skip local work (this repo, local shell, local Docker), CI workflows on GitHub, and git push/clone over ssh.
argument-hint: "[host-to-pin]"
allowed-tools: Bash(meyden-ssh status:*), Bash(meyden-ssh pin:*), Bash(meyden-ssh probe:*), Bash(meyden-ssh logs:*), Bash(meyden-ssh svc status:*), Bash(meyden-ssh svc failed:*)
---

# Remote work over SSH

Hosts configured on this machine:

!`awk '/^[Hh]ost[ \t]/{print} /^[ \t]+([Hh]ostName|[Uu]ser|[Pp]ort|[Pp]roxyJump)[ \t]/{print "   " $1 " " $2}' ~/.ssh/config 2>/dev/null | head -80`

An empty or short list is not proof a host doesn't exist: `~/.ssh/config` can pull in more via `Include` lines, hosts can come from `/etc/ssh/ssh_config`, and a target can be a bare `user@host` that appears in no config at all. Read the config file before concluding an alias is missing.

Current session state:

!`meyden-ssh status 2>&1`

## Project rules

!`bash "${CLAUDE_PLUGIN_ROOT}/scripts/lib/context.sh" ssh "${CLAUDE_PROJECT_DIR}"`

## Pin the host (argument: `$ARGUMENTS`)

If an argument was passed, that is the host for this whole session. Run this **first, before anything else**:

```bash
meyden-ssh pin $ARGUMENTS
```

It checks the alias resolves to a real `Host` block and answers, *then* records the pin, so a typo fails immediately instead of halfway through the first task. If the alias isn't configured it lists the ones that are and points at `meyden-ssh new-host`; set the host up, then pin again.

The pin belongs to **this Claude session** and to nothing else. A second session, in this project or another, holds its own; neither can reach the other's. It is released automatically when the session ends, and it survives a resume, because it is keyed on the session rather than on a clock.

Once pinned, the machine is settled and stays settled: every verb below acts on it without being told, and the guard hook denies raw `ssh`/`scp`/`rsync` aimed anywhere else. Don't ask which host again, and don't pass `--host`; that is the point of the pin. To genuinely change target, run `meyden-ssh unpin` first and say so.

**The pin names a machine, not a spelling.** `meyden-ssh pin` records the alias you gave it and, alongside it, the `HostName` that alias resolves to; the guard compares that resolved name. So a session pinned to `app1` accepts a command written against `app1.example.com`, and a skill that hardcodes one name works on a colleague's laptop where `~/.ssh/config` calls the same box something else. `meyden-ssh status` prints the resolved machine whenever it differs from the alias, so what the guard enforces is always visible.

The deliberate consequence: **two aliases pointing at one machine with different accounts count as one target.** `Host prod` as `deploy@box` and `Host prod-root` as `root@box` are the same machine to the pin, and a session pinned to either accepts commands naming the other. That matches what the pin promises, one session, one machine, but it does not police which account you land on. Connections still use the alias as typed, so each block's own `User` and `IdentityFile` apply; the pin simply does not treat the account as part of the target's identity. Where that distinction matters, keep the accounts in separate sessions.

With no argument, nothing is pinned; resolve the target as below, and offer to pin it if the session is going to stay on one machine.

**Relay the status lines the scripts print, verbatim.** They are the record of what changed on which machine, and they are written by the scripts precisely so they read the same every time:

| Marker | Means |
| :-- | :-- |
| `▶︎` | the target or the session state changed: names host and project |
| `☑️` | done **and verified** on the far end |
| `➕` | something was added: project context, a host block, a keypair |
| `‼️` | needs the user's attention: pin/project mismatch, changed host key, a pending destructive operation |
| `❌` | refused or failed, with the reason |

Never paraphrase a `‼️` or a `❌` into a reassuring summary. Those two lines exist because something needs a decision.

## Use the verbs, not hand-built ssh lines

Each verb applies `BatchMode`, a connect timeout and connection multiplexing, and reads the pin. Reaching for a raw `ssh` line instead means rebuilding all of that correctly, every time, from memory.

| Need | Command |
| :-- | :-- |
| What is this host? | `meyden-ssh probe`, for OS, disk, memory, sudo, tooling, in one round trip |
| Run anything | `meyden-ssh run '<command>'`, one single-quoted argument |
| Multi-line script | `printf '%s\n' 'line' 'line' \| meyden-ssh run --stdin` |
| Logs | `meyden-ssh logs [unit] [lines] [since]`, `--errors`, `--file <path>` |
| Service state | `meyden-ssh svc status <unit>` |
| Restart / reload | `meyden-ssh svc restart\|reload <unit>`, verifies it came back |
| Every failed unit | `meyden-ssh svc failed` |
| Ship a directory | `meyden-ssh deploy <src> <dest>` (dry run), then `--apply [--restart <unit>]` |
| New machine | `meyden-ssh new-host <alias> <user>@<host> [port]`, dry run, then `--write` |
| Where am I pointed? | `meyden-ssh status` · release it with `meyden-ssh unpin` |

Single-quote the remote command. Double quotes let the *local* shell expand variables and command substitutions before ssh ever sees them, so a path built from a variable silently becomes the local one.

Raw `ssh` remains available for things no verb covers; the rules below still apply to it, and the hook enforces them.

## Confirm this is remote-shell work before connecting

If the request named a machine but not work that needs a shell on it ("is prod up", "why is the site slow", "it's returning 502"), connecting is a guess, and the guess runs commands on somebody's live server. An environment word can also cover several machines. Ask which host and what they want run there. One question costs a turn; the wrong command on the wrong production box costs more.

## Resolve the target before you connect

`ssh -G <target>` prints the fully resolved settings (real hostname, user, port, `ProxyJump`, identity file) without connecting or touching the network. Use it whenever an alias is ambiguous, or later when a connection misbehaves.

`ssh -G <name>` is also how you tell a **configured** host from an unknown one: if `hostname` comes back as the alias unchanged, no `Host` block matched and the name is not set up.

Never fall back to the alias that looks closest: on a machine with `web1`/`web1-staging`, the near-miss is production. Say plainly that the name isn't configured, list the aliases that do exist in case it's a typo, and offer to set it up. Then read [references/onboarding.md](references/onboarding.md): it covers what to ask for, generating a named keypair and `Host` block with `meyden-ssh new-host`, and the three ways the user installs the public key on the server. Password authentication can never work from here, since `BatchMode` refuses it by design and typing the user's password isn't yours to do, so a key is the destination in every case.

State which host you are on in your reports. "Restarted nginx" is ambiguous the moment two hosts are in play; "restarted nginx on web1" isn't.

## Probe before you act

Once per host per session, before the first real command:

```bash
meyden-ssh probe
```

It returns the resolved config, OS, uptime, load, disk and memory pressure, whether `sudo` works without a password, and which of systemd/docker are present, all in one round trip. It also opens a multiplexed master connection that later calls to the same target reuse, so they connect instantly and don't re-authenticate.

The probe tells you what the host *is*, which decides how you talk to it: `systemctl` on a systemd box, `service`/`rc-service` elsewhere; `sudo` only if the probe says it's passwordless.

## Every remote command must be non-interactive

This is the failure that ruins a session: a command that waits for a human hangs until the tool call times out, and you get nothing back, not even the reason.

- Pass `-o BatchMode=yes -o ConnectTimeout=10` on every raw invocation. BatchMode turns a password or passphrase prompt into an immediate, readable failure. The verbs do this for you.
- Wrap the remote command in **single** quotes: `ssh web1 'df -h /var'`. Double quotes let the *local* shell expand variables and command substitutions before ssh ever sees them.
- Multi-line work goes through a quoted heredoc, which is immune to the same trap:
  ```bash
  ssh -o BatchMode=yes web1 'bash -s' <<'REMOTE'
  set -euo pipefail
  cd /srv/app
  git log -1 --oneline
  REMOTE
  ```
- Use the batch form of anything that would page or redraw: `journalctl --no-pager -n 200`, `systemctl status --no-pager nginx`, `top -b -n1`, `ps aux`, `apt-get -y`. Editors, `less`, and bare `top` have no batch form, so read files with `cat`, and change them by writing the new content through a heredoc.
- Bound anything that streams. `tail -f` and `journalctl -f` never return; use `-n <count>`, or `timeout 20 ...` when the user genuinely wants to watch.
- Leave `-t` off. The TTY it allocates is exactly what lets remote programs go interactive.
- Use `sudo -n` so a password prompt fails loudly instead of hanging. If the probe reported that sudo needs a password, say so and ask the user to run that step, since entering their password is not something to automate.

A hook enforces the rules above rather than trusting them to be remembered: it runs on every Bash command, denies the hang-inducing and host-key-silencing forms, and routes destructive ones to a confirmation prompt. It fires whether or not this skill loaded, so a denial is the guard working, not a permissions glitch; read its reason and use the batch form it names.

## A changed host key is a signal

If ssh reports `REMOTE HOST IDENTIFICATION HAS CHANGED`, stop and tell the user what it says. The host was rebuilt, the address moved, or the connection is being intercepted, and all three are things they need to know. Clearing the entry with `ssh-keygen -R <host>` is their decision to make, and `StrictHostKeyChecking=no` would only hide the warning while the cause stays.

An unknown (not changed) key on a first connection is ordinary: show the fingerprint and let the user confirm it.

## Reads are free, writes need care, destructive stops

**Read freely, without asking**: logs, config files, process and service state, disk, packages, network. Inspection is why you're there.

**Carry out the writes the user asked for.** They said restart that service, deploy that build, fix that config line: do it, then verify and report. Re-asking "shall I?" when they just told you is obstructive, not careful.

**Stop and confirm, quoting the exact command you intend to run**, before anything in this class:

- deleting or overwriting data (`rm -rf`, truncating a log, `>` onto an existing file, `rsync --delete`)
- database drops, restores, or schema migrations
- removing or downgrading packages
- any command carrying `--force`, or a wildcard whose expansion you haven't listed yet
- disabling a service, editing sshd/firewall/sudoers, rebooting, `shutdown`
- writing anywhere outside the deploy target or the user's home

Before a wildcard delete, run the `ls` first and show the user what it matched. The gap between what a glob looks like it matches and what it does is where the accidents live.

## Verify every change on the host

Exit status 0 means the command ran, not that the change took. Confirm the effect, and quote the evidence:

| Change | Verification |
| :-- | :-- |
| service restart/reload | `systemctl is-active <unit>` plus the log lines since the restart |
| config edit | re-read the file, and run the service's own validator (`nginx -t`, `sshd -t`) |
| file transfer | compare sizes or checksums on both ends |
| deploy | request the health endpoint or the listening port from the host |
| package install | the binary's `--version`, not the package manager's summary |

When verification fails, report it with the output rather than the intent. A restart that didn't come back is the single most important thing in your response.

## Deploying or syncing to a host

Read [references/deploy.md](references/deploy.md) before the first transfer or release. It covers the dry-run → confirm → apply → verify → rollback sequence, the rsync flags and trailing-slash behaviour that decide where files actually land, and how to leave a rollback path before you need one.

## When the connection fails

Read [references/troubleshooting.md](references/troubleshooting.md) as soon as ssh fails to connect or authenticate; it maps each symptom (`Permission denied (publickey)`, timeout vs refused, `Too many authentication failures`, jump-host failures) to the check that identifies it, so you diagnose instead of retrying with different flags.

## Done when

- [ ] the target was resolved from config, or, if it wasn't configured, set up and probed successfully
- [ ] every report names the host it refers to
- [ ] every remote command ran non-interactively and returned output
- [ ] each change was verified on the host, with the evidence quoted
- [ ] anything destructive was confirmed with the user before it ran
- [ ] every `▶︎`, `‼️` and `❌` line the scripts printed was passed on to the user unchanged
