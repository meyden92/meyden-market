# Hosting on GitHub

Operational guide for running this marketplace on GitHub. Verified against Claude Code
2.1.222.

The marketplace lives at `meyden92/meyden-market` on `github.com` and registers under the
name `meyden`.

## What needs a paid plan, and what does not

| Capability | Free GitHub plan | Notes |
| --- | --- | --- |
| Private marketplace on GitHub | ✅ | Access = GitHub repo permissions |
| `claude plugin marketplace add` / `install` | ✅ | |
| Automatic marketplace updates | ✅ | Per-marketplace `autoUpdate`, needs working git credentials |
| Project-level install prompts | ✅ | Commit `.claude/settings.json` |
| File-based managed settings via MDM | ✅ | You deploy the file; not an Anthropic service |
| `strictKnownMarketplaces` allowlist | ✅ | Enforced from managed settings |
| Org settings via claude.ai Admin Settings | ❌ | Requires Team or Enterprise |

Each developer still needs their own Claude Code access.

## Repository setup

The marketplace is a private repository, `meyden92/meyden-market`.

1. **Visibility: Private.** Grant everyone who should have the plugins **Read** access —
   as collaborators, or through an org team. Read is enough to clone. Restrict Write and
   above to the owning team.
2. **Protect the default branch** with a ruleset: no direct pushes, no force pushes.
3. **Require pull-request review.** Plugins are executable content; a second pair of eyes
   on every change is the review gate.
4. Optionally add a GitHub Actions workflow that runs `claude plugin validate . --strict`
   on every PR.

### Release branch, optional

If you want a review gate between "merged" and "developers receive it", have developers add
the marketplace pinned to a `stable` branch and merge `main` → `stable` when you are ready:

```bash
claude plugin marketplace add git@github.com:meyden92/meyden-market.git#stable
```

The `#ref` suffix pins the marketplace source. Note it pins the *catalog*; plugin entries using
relative sources come from that same checkout, which is what you want here.

## Adding the marketplace

This is the supported command, and the only one developers should be given:

```bash
claude plugin marketplace add git@github.com:meyden92/meyden-market.git
```

The SCP-style `git@host:path` form is what Claude Code expects for SSH. The GitHub
`owner/repo` shorthand (`claude plugin marketplace add meyden92/meyden-market`) also works,
but it clones over HTTPS — see [Why SSH and not HTTPS](#why-ssh-and-not-https) for why that
makes background auto-updates of a private repository intermittent. Keep the `.git` suffix
on the SSH form so Claude Code clones the repository instead of treating the URL as a direct
link to a `marketplace.json` file; a direct-URL marketplace downloads only that one file, and
every relative plugin source in it fails to resolve.

## Authentication

### SSH — the predictable option

Each developer:

1. Registers their own SSH key with GitHub (<https://github.com/settings/keys>).
2. Has at least Read access on the repository.
3. Has the GitHub host key in `~/.ssh/known_hosts`.
4. Has the private key loaded in `ssh-agent` before starting Claude Code.

Claude Code suppresses interactive SSH prompts for host-key confirmation and key passphrases,
so a host that is not yet in `known_hosts` or a key that is not yet in the agent fails silently
rather than prompting. Verify both before blaming the plugin system:

```bash
ssh -T git@github.com
git clone git@github.com:meyden92/meyden-market.git /tmp/mp-test
```

(`ssh -T git@github.com` greets you by name and exits 1 — the greeting is the success signal,
not the exit code.)

Do not hand out one shared deploy key. Individual identities are what make GitHub access
auditable and revocable per person.

### Why SSH and not HTTPS

Commands the developer runs (`marketplace add`, `install`, `update`) use normal git credential
helpers, so an HTTPS remote works the way it does in their terminal. **Background auto-updates
do not**: the background refresh disables credential helpers for its `git pull`. Over HTTPS that
pull cannot authenticate to a private repository, so Claude Code falls back to re-cloning, which
can time out. Auto-updates over HTTPS are therefore intermittent.

A key in `ssh-agent` authenticates background pulls normally, which is why SSH is the form
documented above.

### Update resilience

Set on every developer machine:

```bash
export CLAUDE_CODE_PLUGIN_KEEP_MARKETPLACE_ON_FAILURE=1
```

Without it, a failed background refresh deletes the local clone and re-clones. With it, the
last good clone is kept when the network is down or GitHub is unreachable, and plugins keep
working from that state.

Updates land after session startup. A running session keeps the version it loaded; `/reload-plugins`
switches to the new one without a restart.

## Rolling out to projects

Commit [`examples/project-settings.json`](../examples/project-settings.json) as
`.claude/settings.json` in a meyden repository. When a developer trusts the folder, Claude
Code offers to add the marketplace and enable the listed plugins.

They can decline. That is by design — project settings do not silently install executable
content, and no configuration makes them.

## Fleet deployment via MDM

Anthropic-hosted org settings need Team/Enterprise. File-based managed settings are a separate
mechanism you deploy yourself:

| Platform | Path |
| --- | --- |
| macOS | `/Library/Application Support/ClaudeCode/managed-settings.json` |
| Linux / WSL | `/etc/claude-code/managed-settings.json` |
| Windows | `C:\Program Files\ClaudeCode\managed-settings.json` |

Deploy and maintain it through MDM, configuration management, or a system package.

### Restricting which marketplaces are allowed

`strictKnownMarketplaces` in managed settings is an **allowlist**. Exact repository:

```json
{
  "strictKnownMarketplaces": [
    {
      "source": "git",
      "url": "git@github.com:meyden92/meyden-market.git"
    }
  ]
}
```

Use the exact-repository form. A `hostPattern` matching `github.com` would allow *every*
marketplace hosted on GitHub — on a shared public host the pattern form protects nothing.

**This also blocks Anthropic's official marketplace and every other third-party source.** If
developers should keep access to those, list them explicitly too. Decide this deliberately —
silently removing access to the official marketplace generates support tickets.

## Pre-populating containers and CI

Point `CLAUDE_CODE_PLUGIN_SEED_DIR` at a directory mirroring `~/.claude/plugins`, so images
start with plugins available and clone nothing at runtime:

```
$CLAUDE_CODE_PLUGIN_SEED_DIR/
  known_marketplaces.json
  marketplaces/<name>/...
  cache/<marketplace>/<plugin>/<version>/...
```

Build it by installing directly into the target path:

```bash
CLAUDE_CODE_PLUGIN_CACHE_DIR=/opt/claude-seed claude plugin marketplace add git@github.com:meyden92/meyden-market.git
CLAUDE_CODE_PLUGIN_CACHE_DIR=/opt/claude-seed claude plugin install dev-workflow@meyden
```

## Rollout checklist

1. Create the private repository and protect the default branch.
2. Land `marketplace.json` and one pilot plugin.
3. Require pull-request review.
4. `claude plugin validate . --strict` green.
5. Test the SSH install path on two developer machines, from a clean state.
6. Set `CLAUDE_CODE_PLUGIN_KEEP_MARKETPLACE_ON_FAILURE=1` in the standard shell profile.
7. Add `.claude/settings.json` to one pilot codebase; confirm the install prompt appears.
8. Confirm auto-update and `/reload-plugins` behave as expected.
9. Decide on `strictKnownMarketplaces` before the marketplace name is widely used.
10. Add further plugins.

## Troubleshooting

| Symptom | Cause |
| --- | --- |
| `Invalid marketplace source format` | Missing scheme, or `.` instead of `./` for a local path |
| Marketplace adds, plugin install says source does not exist | The plugin entry's `source` is wrong — it resolves from the marketplace **root**, not from `.claude-plugin/` |
| Plugin installs but has no components | Component directories are inside `.claude-plugin/` instead of at the plugin root |
| Auto-update fails intermittently, manual update works | The marketplace was added with an HTTPS remote — background pulls disable credential helpers. Re-add it with the SSH command above. |
| Marketplace disappears after a network blip | `CLAUDE_CODE_PLUGIN_KEEP_MARKETPLACE_ON_FAILURE` is not set |
| A plugin change never reaches developers | `version` in `plugin.json` was not bumped |
| Relative plugin sources fail to resolve | The marketplace was added as a direct URL to `marketplace.json` rather than as a git repository |
