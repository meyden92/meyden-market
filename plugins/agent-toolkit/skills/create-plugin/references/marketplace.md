# The marketplace (`marketplace.json`)

Verified against https://code.claude.com/docs/en/plugins/marketplace-reference,
https://code.claude.com/docs/en/plugins/cli-reference and Claude Code v2.1.325.
Read this when registering a plugin, changing an entry, renaming or removing a plugin, or setting up
distribution.

## Contents

- [The catalog](#the-catalog)
- [Plugin entries](#plugin-entries)
- [Plugin sources](#plugin-sources)
- [Strict mode](#strict-mode)
- [Registering a plugin](#registering-a-plugin)
- [Renaming or removing a plugin](#renaming-or-removing-a-plugin)
- [Reserved names](#reserved-names)
- [Hosting and distribution](#hosting-and-distribution)
- [Validation](#validation)

## The catalog

`<repo-root>/.claude-plugin/marketplace.json`. In this repository layout every plugin lives at
`plugins/<name>/` and every entry uses a relative source pointing there.

```json
{
  "name": "company-tools",
  "description": "Internal Claude Code plugins",
  "owner": { "name": "DevTools Team", "email": "devtools@example.com" },
  "plugins": [
    { "name": "code-formatter", "source": "./plugins/code-formatter",
      "description": "Automatic code formatting on save" }
  ]
}
```

**Required**: `name` (kebab-case, public-facing, since users type `plugin@name` to install), `owner`
(`name` required; `email` and `url` optional), `plugins`.

Each user can register **one marketplace per name**. To publish many plugins under one name, list them all in one `marketplace.json`.

**Optional**: `description`, `version`, `$schema`, `metadata.pluginRoot` (a base directory prepended
to relative sources, letting entries read `"source": "formatter"`),
`allowCrossMarketplaceDependenciesOn` (other marketplaces this one's plugins may depend on, since a
dependency on anything else is blocked at install), and `renames`. `description` and `version` are
also accepted under `metadata` for backward compatibility.

## Plugin entries

An entry accepts **any field from the plugin manifest schema** except the directory-listing fields
(`icon`, `documentationUrl`, `supportUrl`, `privacyPolicyUrl`, `termsOfServiceUrl`, which validate
reports as unknown there), plus the marketplace-only fields `source`, `category`, `tags`, `strict`,
`relevance`, and `headers`/`headersHelper` for archive downloads (v2.1.238+).

**Required**: `name` (kebab-case; the public identifier) and `source`.

Worth knowing beyond the manifest fields:

| Field | Notes |
| :-- | :-- |
| `category` / `tags` | Organization and searchability |
| `strict` | Whether `plugin.json` is the authority for components. Default `true`. [See below](#strict-mode) |
| `relevance` | Signals for suggesting the plugin. Only takes effect for marketplaces an administrator allowlists in managed settings. v2.1.152+ |
| `defaultEnabled` | Overrides the manifest's value |
| `displayName` | UI label; never used for lookup |
| `skills` / `commands` / `agents` / `hooks` / `outputStyles` / `themes` | Component fields, if the entry needs to supplement or define them |

**What applies depends on whether the plugin has its own `plugin.json`.** Without one, the entry *is*
the manifest and every field applies. With one, only the six component fields above combine with it
(appended under `strict: true`, except `hooks`, whose matchers replace the manifest's per event); the
entry's `mcpServers`, `lspServers`, `userConfig` and `channels` are **ignored**, so declare those in
`plugin.json`. Entry `hooks` must be an inline object: a file path or array passes validate and then
fails at load with `not yet supported in a marketplace entry`.

Display fields (`displayName`, `description`, `author`, `homepage`, `repository`, `license`,
`keywords`) set on the entry win over `plugin.json`'s. Before install Claude Code can read
`plugin.json` only for relative-path entries, so for any other source users see just the entry.

When several entries share one `skills/` folder at the marketplace root (`"source": "./"`), list each
entry's own subdirectories so they don't all load everything:

```json
"source": "./",
"skills": ["./skills/code-review", "./skills/docs"]
```

With a marketplace-root source those listed paths are the complete set; other directories in the
shared folder don't load. Listing `./skills/` itself keeps the full scan, and if none of the listed
paths exist the default scan runs anyway.

**Do not set `version` in the entry.** Claude Code takes `plugin.json`'s value first; only
`claude plugin validate` warns about a disagreement, installs and updates don't. A version here is at
best redundant and at worst a mask over the one you edited. Keep it in `plugin.json` alone.
`sync_marketplace.py` strips it.

## Plugin sources

`source` says where to fetch each plugin. Distinct from the *marketplace* source, which says where to
fetch the catalog itself: a marketplace at `acme/catalog` can list a plugin from `acme/formatter`,
and the two are pinned independently. Git-based marketplace sources have `ref` but no `sha` field,
though since v2.1.324 `ref` may be the full lowercase SHA of a commit on a branch or tag (older clients
can't clone such a pin, and it is refused for a reserved name); git-based plugin sources support both
fields.

| Source | Shape | Fields |
| :-- | :-- | :-- |
| Relative path | `"./plugins/my-plugin"` | none; must start with `./`, no `..` |
| `github` | object | `repo` (`owner/repo`), `ref?`, `sha?` |
| `url` | object | `url` (https or git@, `.git` optional), `ref?`, `sha?` |
| `git-subdir` | object | `url`, `path`, `ref?`, `sha?`: sparse clone, for monorepos |
| `npm` | object | `package`, `version?`, `registry?`: install scripts never run |
| `archive` | object | `url` (HTTPS only), `sha256?`: no git or npm needed. v2.1.224+ |
| `command` | object | `command`, `timeout?` (1 to 600 s, default 60), `mode?` (`copy` or `link`): a tool on the user's machine prints the plugin directory. v2.1.229+ |

Relative paths resolve against the **marketplace root**, the directory containing `.claude-plugin/`,
not `.claude-plugin/` itself. So `./plugins/my-plugin` means `<repo>/plugins/my-plugin`.

When `ref` and `sha` are both set, `sha` wins and Claude Code checks out that commit directly. On
most hosts that survives the branch being deleted upstream; on servers that can't fetch by SHA (AWS
CodeCommit) the `ref` must still exist.

An `npm` `package` refuses git addresses, folder or `file:` paths and `npm:` aliases, and an `http`
registry other than the user's default. Ship `npm-shrinkwrap.json` so the automatic Node dependency
install has a lockfile (npm drops `package-lock.json` from published packages).

A `command` source suits a tool that renders the plugin for the user's own setup. Claude Code shows the
whole command for review, runs it through `sh` from the home directory on install, update and once per
session, and expects exactly one line: the plugin directory's absolute path. `copy` hashes the files
into the cache (256 MiB, 20,000 entries); `link` loads the directory in place, so it must stay put and
already contain its `node_modules`; Windows refuses `link`. Administrators turn the source off with
`disableCommandPluginSources`.

When the marketplace repository has git submodules, v2.1.295+ fetches only those that hold plugin
files; `--sparse` or `sparsePaths` fetch none. Since v2.1.323 an install fails when a submodule isn't
on its recorded commit.

Two traps:

- **Relative paths break in URL-based marketplaces.** Adding a marketplace by a direct URL to
  `marketplace.json` downloads only that file, so relative sources have nothing to resolve against.
  For URL distribution use `github`, `url`, `npm`, or `archive` sources, or host the marketplace in
  git, which clones the whole repository.
- **`archive` needs v2.1.224+.** On v2.1.120–v2.1.223 the install fails with a version error; on
  anything older the entire marketplace fails to load. Archives are capped at 256 MiB and Claude Code
  looks for `.claude-plugin/` at the archive root or inside a single top-level folder, no deeper.

## Strict mode

| `strict` | Behavior |
| :-- | :-- |
| `true` (default) | `plugin.json` is the authority; the marketplace entry may supplement it, and both merge |
| `false` | The marketplace entry is the whole definition. If `plugin.json` also declares components, that is a conflict and the plugin fails to load |

`strict: false` is for a marketplace operator curating someone else's raw files into a different
shape. For plugins you own in your own marketplace, leave it alone.

## Registering a plugin

`sync_marketplace.py` reconciles the catalog against `plugins/`, so the manifest stays the single
source of truth:

```bash
python3 ${CLAUDE_SKILL_DIR}/scripts/sync_marketplace.py --root <marketplace-root>
```

It adds a missing entry with `"source": "./plugins/<name>"`, mirrors `description` and `keywords`
from `plugin.json` (`category` is entry-only and left alone), strips any `version` from the entry, and reports what only a human can
fix: a name that disagrees with its directory, a catalog description left as TODO, and orphan entries
whose directory is gone. `--check` reports without writing and exits 1 on any of it; that is the CI
form. `--plugin <name>` limits it to one.

## Renaming or removing a plugin

`name` is the stable identifier: users reference it in `enabledPlugins`, in `pluginConfigs`, and in
`/plugin install`. Changing it breaks every existing install. To change only the label, set
`displayName` and leave `name` alone.

When you must rename, or you remove an entry, add a top-level `renames` map so existing users migrate
instead of hitting `plugin-not-found` (v2.1.193+):

```json
{
  "plugins": [ { "name": "code-formatter", "source": "./plugins/code-formatter" } ],
  "renames": { "formatter": "code-formatter", "legacy-linter": null }
}
```

A mapped name loads under the new one with a one-line notice, and Claude Code rewrites the key in the
user, project and local scopes for both `enabledPlugins` and `pluginConfigs`, so the notice appears
once. `null` drops the key and reports removal. A renamed plugin on a remote source reports
`plugin-cache-miss` and needs one `/plugin install`.

Treat `renames` as **append-only history**. Claude Code follows chains, so a second rename gets a
second entry rather than an edit to the first. `claude plugin validate` rejects a chain that cycles
or doesn't terminate at `null` or a listed plugin.

Managed and policy settings are read-only, so a plugin enabled there keeps showing the rename notice
until an administrator updates it.

## Reserved names

A marketplace name is letters, digits, `.`, `_` and `-`, starting with a letter or digit, with no
`..`; validate fails anything else. These are refused:

- **Anthropic's names**, unless the marketplace comes from `github.com/anthropics/`:
  `claude-code-marketplace`, `claude-code-plugins`, `claude-plugins-official`,
  `anthropic-marketplace`, `anthropic-plugins`, `agent-skills`, `anthropic-agent-skills`,
  `life-sciences`, `knowledge-work-plugins`, `claude-for-legal`, `claude-for-financial-services`,
  `financial-services-plugins`, `first-party-plugins`, `claude-tag-plugins`, the community names
  `claude-community`, `claude-plugins-community`, `healthcare`, and the directory names
  `anthropic-plugin-directory`, `claude-plugin-directory`.
- **Impersonations** such as `official-claude-plugins` or `claude-plugins-v2`, and any name with a
  non-ASCII character.
- **Another spelling** of a reserved name: a trailing dot, or another symbol for a hyphen
  (`claude.code.plugins`). v2.1.280+.
- **Names Claude Code uses itself**: `inline` (`--plugin-dir`), `builtin`, `skills-dir`, `synced`,
  `claude-plugin-test`, and the `claudeai-` prefix (marketplaces hosted on claude.ai).
- **JavaScript member names**: `constructor`, `hasOwnProperty`, `isPrototypeOf`,
  `propertyIsEnumerable`, `toLocaleString`, `toString`, `valueOf`. v2.1.296+.
- **`<owner>-<repo>`** of a GitHub marketplace you have registered under another name, since that is
  its download folder. v2.1.290+.

The check runs on **every load**, not just on add, so a marketplace registered before a name became
reserved stops loading with `Claude Code refuses the marketplace name "<name>"`. Removing it uninstalls
its plugins and deletes their data, options and secrets; re-add under a different name. Since v2.1.323
`npm`, `pip`, `uv`, `cargo`, `github` and `gh` are allowed again.

Plugin names have their own reserved set (verified on 2.1.325). `claude plugin validate` rejects a
plugin named `claude`, `anthropic` or `anthropics`, any name starting with `claude-`, `anthropic-`,
`anthropics-` or `cc-plugin-` (so `claude-code` and `claude-mods` too), and any name with `official`
directly beside `claude` or `anthropic`, matched case-insensitively with runs of separators collapsed.
`claude`, `anthropic` or `anthropics` as a whole word elsewhere in the name is only a warning. Such a
plugin still installs and loads, but its plugin and marketplace both fail validation, and
`claude plugin init` and `claude plugin tag` refuse it. `init_plugin.sh` refuses these names.

Separately, `org`, `org-provisioned` and `unknown` are rejected by Claude Desktop's managed
marketplace sync in any casing, and Desktop only accepts names up to 128 characters of letters,
digits, `.`, `_` and `-` starting with a letter or digit. Claude Code tolerates more; `validate`
warns. `init_marketplace.sh` refuses all of these up front.

## Hosting and distribution

Push the repository to any git host. Users add it with:

```bash
claude plugin marketplace add owner/repo            # GitHub shorthand, @ref to pin
claude plugin marketplace add git@github.com:team/plugins.git
claude plugin marketplace add ./my-marketplace      # local, for testing
```

Or in one step, adding the marketplace if needed (v2.1.292+ from the shell, v2.1.275+ in-session):

```bash
claude plugin install my-plugin --marketplace owner/repo
/plugin install my-plugin --marketplace owner/repo
```

That is the line a README should carry; `claude plugin validate` gives Advice (v2.1.295+) when a
plugin's README has no install line, without changing the verdict.

`--scope user|project|local` decides which settings file declares it; `--sparse <paths...>` limits the
checkout for a monorepo. `claude plugin marketplace list --json`, `... update [name]`, and
`... remove <name>` round it out. **Removing a marketplace from its last scope uninstalls every plugin
installed from it**; use `update` to refresh.

To have teammates prompted automatically when they trust the repo, commit to `.claude/settings.json`
(in an untrusted workspace these settings can neither toggle plugins nor disable hooks, v2.1.323+):

```json
{
  "extraKnownMarketplaces": {
    "company-tools": { "source": { "source": "github", "repo": "your-org/claude-plugins" } }
  },
  "enabledPlugins": { "code-formatter@company-tools": true }
}
```

**Private repositories** work through your existing git credential helpers for commands you run.
Background auto-updates are the weak spot: they disable credential helpers, so an HTTPS pull can't
authenticate and falls back to a full re-clone that may time out. SSH remotes with a key in
`ssh-agent` are unaffected. Two settings make it predictable:
`CLAUDE_CODE_PLUGIN_KEEP_MARKETPLACE_ON_FAILURE=1` keeps the existing clone when a pull fails, and a
configured helper (`gh auth setup-git`) lets the re-clone authenticate. A git URL rewrite scoped to
the marketplace repository makes the background pull itself work; scope it to the repo or org path,
never to a bare host, and use a read-only token since it is stored in plaintext.

`CLAUDE_CODE_PLUGIN_GIT_TIMEOUT_MS` raises the 120-second git timeout.
`CLAUDE_CODE_PLUGIN_SEED_DIR` pre-populates marketplaces and caches for containers and airgapped
environments; seed entries are read-only and take precedence over user configuration.

Organizations declare marketplaces with `extraKnownMarketplaces` in managed settings. Since v2.1.321 a
name declared there can't be added from another source, its plugins reinstall from the declared one,
and a take-over is set aside until `claude plugin restore-set-aside`. Plugins that managed settings
enable from a remote marketplace and list in `prependPlugins` or `appendPlugins` count as the
organization's (v2.1.325; this is what lets an organization's mod hold org-only powers, see the
`agent-toolkit:mods` skill); `pluginDigests` is deprecated and ignored.

Organizations can restrict sources with `strictKnownMarketplaces` in managed settings: an empty
array locks everything down including the official marketplace; a list allowlists exact sources, with
`hostPattern` and `pathPattern` regex forms for self-hosted servers. Matching does not normalize
URLs, so a trailing slash or `.git` suffix is a different value; prefer `hostPattern` when a repo can
be cloned more than one way.

## Validation

```bash
claude plugin validate <marketplace-root>     # marketplace.json
claude plugin validate <plugin-dir>           # plugin.json + skill/agent/command/hook files
claude plugin validate . --strict             # warnings become errors, the CI form
claude plugin validate . --strict --json      # same findings and exit codes, machine-readable
```

Pointed at a marketplace, it checks the schema, duplicate plugin names, and source path traversal,
then descends into every entry whose `source` is a local path to validate that plugin's own
`plugin.json`, prefixing findings with the entry index, `plugins[2] plugin.json →`. It does not open
those plugins' skill, agent, command or hook files, so validate each plugin directory too. It warns
when an entry's `version` disagrees with the manifest's, which is one more reason not to set it in
both places.

Pointed at a plugin directory it additionally parses skill, agent and command frontmatter and
`hooks/hooks.json`. It does not read `.lsp.json` or a root `SKILL.md`, warns about a root
`CLAUDE.md`, and follows no symlinks: a linked `skills/`, `agents/` or `commands/` directory is
reported as unread. A directory holding both `marketplace.json` and `plugin.json` validates both
(v2.1.289+). Since v2.1.325 it also reports unsafe paths and links that loading skips.

Exit codes: `0` passed (with warnings unless `--strict`), `1` failed, `2` the validator itself failed
(nothing on stdout). `--json` gives `success`, `strict`, `target`, `manifest`, `contents` (per-file
`errors`, `warnings`, `notes`) and `advice`.

On v2.1.325 a plugin run also prints **plugin directory checks**: what Anthropic's directory would
refuse a submission for (no README of 40+ words, no `LICENSE` file or `license` field) and warn about
(no icon). They don't change the verdict unless you pass `--profile directory`. Ignore them for an
internal marketplace.

Common warnings: no plugins defined, no marketplace description, a name that isn't kebab-case, and
the Claude Desktop name checks.

`claude plugin tag` creates the `{name}--v{version}` release tag and validates that `plugin.json` and
any enclosing marketplace entry agree: `--push`, `--dry-run`, `-f`/`--force`, `-m` with `%s` for the
version.
