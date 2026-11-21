# Remote SSH

Remote work on one machine over SSH, with the host pinned per Claude session.

## What you get

**`meyden-ssh` on your PATH** while the plugin is enabled.

```bash
meyden-ssh pin web1                 # settle this session on one machine
meyden-ssh probe                    # OS, disk, memory, sudo, tooling, one round trip
meyden-ssh logs nginx 200           # bounded journal read
meyden-ssh svc restart nginx        # restart, then verify it came back
meyden-ssh deploy ./build /srv/app  # dry run; --apply to transfer
```

Run `meyden-ssh` for the full verb list, and `meyden-ssh <verb> --help` for one verb.

**One skill**, `/remote-ssh:ssh`. It fires on its own when the work matches.

**A guard hook** on every Bash command, whether or not the skill loaded. It denies remote
commands that would hang the session with no TTY to answer them, denies
`StrictHostKeyChecking=no`, denies work aimed at a host other than the pinned one, and routes
destructive operations to a confirmation prompt.

## The session pin

`meyden-ssh pin <alias>` settles a Claude session on one machine. Every `meyden-ssh` verb then
acts on it without being told, and raw `ssh`/`scp`/`rsync` aimed anywhere else is denied.

The pin belongs to one session. A second session (this project or another, another
terminal, a cloud session) holds its own, and neither can see the other's. It is released
when the session ends, and it survives a resume.

`meyden-ssh status` says where you are pointed. `meyden-ssh unpin` releases it.

State lives in `/tmp/.meyden-<uid>/`, alongside the ssh control sockets that need a short
path. Nothing there is meant to outlive the session.

## Project-specific rules

```
<project>/.claude/skill-context/remote-ssh/CONTEXT.md        # every skill
<project>/.claude/skill-context/remote-ssh/ssh/CONTEXT.md    # ssh only
```

Anything in there is loaded whenever the skill runs: which hosts belong to this project, its
deploy paths. Keep them short; they are injected on every invocation and are truncated past
8 KB.

Project rules add to the skill's own rules. They never license skipping a confirmation, a
verification step, or a destructive-operation prompt.

## What you need installed

- **`python3`** (3.9+) and **`bash`**.
- **ssh keys** set up as usual. `meyden-ssh new-host` generates a keypair and a
  `~/.ssh/config` block for a new machine, and prints the command *you* run to install the
  public key. It never touches the server and never handles a password.

## Configuration

None. ssh owns its keys, so the plugin holds no credentials of its own and asks for nothing on
install.
