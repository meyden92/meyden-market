# When the SSH connection fails

Read this the moment a connection or authentication fails. Retrying with different flags is guessing; each symptom below has a check that identifies the cause in one step.

## Get the real error first

```bash
ssh -vvv -o BatchMode=yes -o ConnectTimeout=10 <target> true 2>&1 | tail -40
```

Read the **first** thing that went wrong, not the last line. The final message is usually `Permission denied` regardless of cause; the useful line is further up: which keys were offered, which methods the server allowed, where the handshake stopped.

`ssh -G <target>` (local, instant, no network) shows what the client actually resolved: the real hostname, user, port, identity file, and `ProxyJump`. A surprising number of failures are simply a different `Host` block matching than the one the user had in mind.

## Symptom table

| Symptom | Usual cause | Check |
| :-- | :-- | :-- |
| `Connection timed out` | Packets dropped by a firewall, a security group, a VPN that isn't up, or a wrong address | `nc -z -w5 <host> <port>`; compare `ssh -G` hostname against what the user expects |
| `Connection refused` | Reached the host, nothing listening on that port | Try the real port; the host is up, so the daemon is down or on a non-standard port |
| `Could not resolve hostname` | DNS, or an alias that isn't in any config | `ssh -G <target>`; if hostname echoes the alias unchanged, no `Host` block matched |
| `Permission denied (publickey)` | Key not offered, not authorized, or wrong username | See below |
| `Permission denied (publickey,password)` | Same, but the server would take a password, which BatchMode correctly refuses to supply | Ask the user to authenticate once interactively, or install the key |
| `Too many authentication failures` | The agent offered many keys; the server cut the connection after ~6 | Add `-o IdentitiesOnly=yes -i <the right key>` |
| `Host key verification failed` | Unknown host in BatchMode, or a changed key | Unknown: show the fingerprint, let the user confirm. **Changed: stop and report it**, meaning a rebuild, address reuse, or interception |
| `no matching key exchange method` / `no matching cipher` | Modern client, ancient server | Report the algorithm the server wants; enabling it is the user's security decision |
| Hangs, returns nothing | A prompt with nobody to answer it | Always pass `-o BatchMode=yes`; see the non-interactive rules in SKILL.md |
| Connects, then `shell request failed` | Remote disk full, or the account's shell is `/sbin/nologin` | `ssh <target> 'df -h'` if it gets that far; check the account's shell |
| Worked a moment ago, now fails | A stale multiplex socket outlived the connection | Remove the socket under `/tmp/.cssh-<uid>/` and reconnect |

## Permission denied (publickey), specifically

Work down this list; the answer is almost always in the first three:

1. **Which key is being offered?** `ssh -G <target> | grep -i identityfile`, and `ssh-add -l` for what the agent holds. `Permission denied` with no key offered at all means the agent isn't running or the identity isn't loaded.
2. **Which user?** `ssh -G <target> | grep -i '^user '`. The local username is the default, and it is frequently not the remote account.
3. **Is the public key in the remote `authorized_keys`?** Only checkable with some working access. If nobody can get in, this is a console/provider task for the user, not something to solve over ssh.
4. **Permissions on the remote side.** sshd silently refuses keys when the file modes are loose: `~/.ssh` must be `700`, `authorized_keys` `600`, and the home directory itself must not be group- or world-writable. This one produces no client-side hint at all: the server logs it and says nothing.
5. **Local key file permissions.** A private key readable by others makes the client refuse it: `chmod 600`.
6. **Server restrictions.** `AllowUsers`, `PermitRootLogin no`, or a key restricted by `from=` in `authorized_keys`. Visible in `/var/log/auth.log` or `journalctl -u ssh` on the server, which needs another way in.

Installing a key is `ssh-copy-id`, which requires an existing way to authenticate. It is the user's action to take: it needs their password, and entering that is not something to automate.

## Jump hosts and bastions

When `ProxyJump` appears in `ssh -G`, there are two connections that can fail. Test the bastion alone first:

```bash
ssh -o BatchMode=yes -o ConnectTimeout=10 <bastion> true
```

If that works and the full target doesn't, the failure is bastion → target: the bastion's own network reach, or its lack of the key needed for the second hop. Prefer `ProxyJump` over agent forwarding, since forwarding exposes the agent to anyone with root on the bastion.

## Once it works again

Re-run the probe. It reopens the multiplexed master, and a connection that just came back for an unclear reason is worth re-confirming before you make changes over it.
