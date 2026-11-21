# Deploying and syncing to a remote host

Read this before the first transfer or release of a session. The stack varies; the sequence doesn't.

## The sequence

1. **Know what you're shipping.** The artifact's local path, and the commit or version it was built from. If the working tree is dirty or the build is stale relative to the source, say so before transferring; shipping an unidentifiable build is how a rollback becomes archaeology.
2. **Know where it lands.** The exact remote path, its current owner and mode, and what is already there. `ssh <host> 'ls -la <path>'` costs one round trip and prevents the whole class of "deployed into the wrong directory" incidents.
3. **Record the rollback point *before* changing anything**: the current release directory, the running image tag, the deployed git SHA, or a copy of the config you're about to replace. A rollback path you create afterwards is one you don't have.
4. **Dry-run.** `rsync -n` shows the exact file list. Read it: unexpected deletions, an entire nested directory, or a file count far off from what you built all show up here and nowhere else.
5. **Confirm with the user** when the dry run includes deletions, when the target is production, or when the change extends past the artifact itself (service config, database, packages). A pure additive sync to a staging path the user just named needs no ceremony.
6. **Apply**, then **verify on the host**, then report which host and which version now runs there.

## rsync

Prefer it over `scp`: it is resumable, it shows what changed, and it has a dry run. It must exist on **both** ends, and a minimal server image often lacks it (the probe's tool list tells you). When it's missing, either install it (`apt-get install -y rsync`, a change worth confirming) or fall back to a tar pipe, which needs nothing but a shell:

```bash
tar -czf - -C ./build . | ssh -o BatchMode=yes web1 'mkdir -p /srv/app/current && tar -xzf - -C /srv/app/current'
```

That has no dry run and no deletion semantics, so list the archive with `tar -tzf` locally first, and know it only ever adds and overwrites. Baseline rsync:

```bash
rsync -a --info=stats1,progress2 \
  -e 'ssh -o BatchMode=yes -o ControlPath=/tmp/.cssh-'"$(id -u)"'/%C' \
  ./build/ web1:/srv/app/current/
```

Reuse the probe's `ControlPath` and the transfer connects instantly without re-authenticating.

**The trailing slash is the single most consequential character in the command.** `src/` copies the *contents* of `src` into the destination. `src` (no slash) copies the *directory itself*, creating `dest/src/`. Getting this backwards nests a whole release one level deep, and the service keeps serving the old one.

Flags that matter:

| Flag | Why |
| :-- | :-- |
| `-n` / `--dry-run` | Always first. Pair with `-i` for a per-file change summary |
| `-a` | Archive: recursive, preserves symlinks, times, modes |
| `--delete` | Removes remote files absent locally. **Destructive**: dry-run it, show the deletion list, get confirmation |
| `--exclude` | Keep `.git`, `node_modules`, `.env`, local caches off the server. An `.env` overwritten by a local one takes the app down with the least obvious cause |
| `-z` | Compress; worth it over WAN, noise over LAN |
| `--chown=user:group` | Land files owned correctly instead of fixing modes afterwards (needs privilege) |
| `--partial` | Resume a large transfer that dropped |

`rsync` preserves ownership only when running as root remotely. If the app runs as a different user, either `--chown`, or fix ownership in a follow-up command; a deploy that lands root-owned files under a service account fails at the next restart, not at transfer time.

## Release layout and rollback

Where you control the layout, deploy beside the live directory and swap a symlink:

```bash
rsync -a ./build/ web1:/srv/app/releases/2026-08-07T1342/
ssh web1 'ln -sfn /srv/app/releases/2026-08-07T1342 /srv/app/current.new && mv -T /srv/app/current.new /srv/app/current'
```

`ln -sfn` + `mv -T` replaces the symlink atomically, so no request ever sees a half-synced tree. Rollback is then repointing the symlink at the previous release and restarting, which takes seconds, not a rebuild. Keep the last few releases; prune the rest only when the user asks.

Where you don't control the layout (syncing into a live directory), back up what you're about to overwrite: `cp -a <path> <path>.bak-<date>` on the remote, and tell the user where it went.

## Restarting the service

Choose by what the probe reported:

- **systemd**: `sudo -n systemctl restart <unit>`. Use `reload` when the unit supports it: it keeps connections alive. After editing a unit file, `daemon-reload` first or systemd keeps running the old definition. Verify with `systemctl is-active <unit>` and `journalctl -u <unit> --no-pager -n 50 --since '2 min ago'`.
- **docker compose**: `docker compose pull && docker compose up -d`, from the directory holding the compose file. Verify with `docker compose ps` (look at the health column, not just "Up") and `docker compose logs --no-color --tail 50`.
- **git-pull-on-remote**: record the current SHA first, then `git -C <dir> pull --ff-only`, then the build/install step, then restart. `--ff-only` turns a diverged remote checkout into a clean error instead of a merge commit made on a server.

Validate config before restarting, never after: `nginx -t`, `sshd -t`, `apachectl configtest`. A service that fails to start on a bad config leaves you locked out of exactly the box you need.

**Never restart sshd blind.** Validate with `sshd -t`, and keep the existing session open while you test a new connection in parallel: if the new config breaks auth, the open session is the only way back in.

## Verify, then report

The deploy is done when the new version is answering, not when rsync exited 0:

- the health endpoint or listening port returns what it should, requested *from the host*
- the version the app reports matches the version you shipped
- logs since the restart carry no new errors
- for a symlink release, `readlink /srv/app/current` points where you intended

Report the host, the version, and the rollback command you left behind. If verification failed, lead with that and with the rollback command, not with the transfer having succeeded.
