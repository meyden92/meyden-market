# The plugin manifest (`plugin.json`)

Verified against https://code.claude.com/docs/en/plugins/manifest-reference and Claude Code v2.1.325.
Read this whenever you write or edit `.claude-plugin/plugin.json`.

For what each component *is*, see [components.md](components.md). For the catalog entry that ships
it, see [marketplace.md](marketplace.md).

## Contents

- [Location and shape](#location-and-shape)
- [Identity and metadata fields](#identity-and-metadata-fields)
- [Component path fields](#component-path-fields)
- [Path behavior rules](#path-behavior-rules): the replace-vs-add trap
- [`userConfig`](#userconfig): per-user values prompted at enable time
- [`dependencies`](#dependencies)
- [`defaultEnabled`](#defaultenabled)
- [`engines`](#engines): the Claude Code versions a release supports
- [Versioning](#versioning)
- [Unrecognized fields and type errors](#unrecognized-fields-and-type-errors)

## Location and shape

`<plugin-root>/.claude-plugin/plugin.json`. **Only `plugin.json` goes in `.claude-plugin/`.** Every
component directory sits at the plugin root. This is the single most common structural mistake and
it fails silently: the plugin loads, the components don't.

The manifest is optional; without one, components are auto-discovered in default locations and the
name comes from the directory. A plugin distributed through a marketplace should always have one,
because that is where `description`, `version` and `author` come from.

If you include a manifest, `name` is the only required field.

```json
{
  "$schema": "https://json.schemastore.org/claude-code-plugin-manifest.json",
  "name": "plugin-name",
  "displayName": "Plugin Name",
  "version": "1.2.0",
  "description": "Brief plugin description",
  "author": { "name": "Author Name", "email": "author@example.com", "url": "https://…" },
  "homepage": "https://docs.example.com/plugin",
  "repository": "https://github.com/author/plugin",
  "license": "MIT",
  "keywords": ["keyword1", "keyword2"],
  "engines": { "claude-code": ">=2.1.323" },
  "skills": "./custom/skills/",
  "commands": ["./custom/commands/special.md"],
  "agents": ["./custom/agents/reviewer.md"],
  "hooks": "./config/hooks.json",
  "mcpServers": "./mcp-config.json",
  "lspServers": "./.lsp.json",
  "outputStyles": "./styles/",
  "experimental": { "themes": "./themes/", "monitors": "./monitors.json", "evals": "./evals/" },
  "dependencies": ["helper-lib", { "name": "secrets-vault", "version": "~2.1.0" }]
}
```

## Identity and metadata fields

| Field | Type | Notes |
| :-- | :-- | :-- |
| `name` | string | **Required.** kebab-case, no spaces. Namespaces every component (`/plugin-name:skill-name`, agent `plugin-name:reviewer`). Changing it breaks every existing install, so use `displayName` for cosmetics and `renames` in the marketplace when you truly must change it |
| `displayName` | string | Human-readable label in `/plugin` and other UI. Falls back to `name`. May contain spaces and any casing. Never used for namespacing or lookup. Needs v2.1.143+ |
| `version` | string | Semver. See [Versioning](#versioning); this field is the update signal |
| `description` | string | Shown when browsing and installing. Write it for someone deciding whether to install |
| `author` | object | `name` required; `email` and `url` optional |
| `homepage` | string | Documentation URL. **Must parse as a URL, or the plugin fails to load** |
| `repository` | string | Source URL. Not validated |
| `license` | string | SPDX identifier (`MIT`, `Apache-2.0`) |
| `keywords` | array | Discovery tags |
| `metadata` | object | Free-form; Claude Code never reads it. A non-object value is ignored with a validate warning |
| `defaultEnabled` | boolean | Default `true`. See [below](#defaultenabled). Needs v2.1.154+ |
| `engines` | object | `{ "claude-code": "<range>" }`. See [below](#engines). Needs v2.1.323+ |
| `icon`, `documentationUrl`, `supportUrl`, `privacyPolicyUrl`, `termsOfServiceUrl` | string | Read only by Anthropic's plugin directory for its listing; Claude Code ignores them. `icon` is a path to a square PNG or JPEG in the plugin (512 to 2048 px, under 2 MB), the others `https://` URLs. Set them in `plugin.json` only: in a marketplace entry validate reports them as unknown. Before v2.1.281 validate flags them as unknown even here |
| `types` | path | A mod's `.d.ts` contract for its `$.state` values and `$` nouns; see the `agent-toolkit:mods` skill |
| `$schema` | string | Editor autocomplete only; ignored at load time |

## Component path fields

Every one of these is optional; the default directory is scanned without them. Use them only when
the layout genuinely differs.

| Field | Type | Points at |
| :-- | :-- | :-- |
| `skills` | string\|array | Skill directories containing `<name>/SKILL.md` |
| `commands` | string\|array\|object | Flat `.md` skill files or directories, or an object map (below) |
| `agents` | string\|array | Agent `.md` files; directories are not accepted |
| `workflows` | string\|array | Workflow script files or directories |
| `hooks` | string\|array\|object | Hook config paths, or inline config |
| `mcpServers` | string\|array\|object | MCP config paths, or inline config |
| `lspServers` | string\|array\|object | LSP config paths, or inline config |
| `outputStyles` | string\|array | Output style files or directories |
| `experimental.themes` | string\|array | Theme files or directories |
| `experimental.monitors` | string\|array\|object | Monitor config path, or the inline array |
| `experimental.evals` | string\|array | Eval case directory when it isn't `evals/`; `claude plugin eval --eval-dir` overrides it |
| `userConfig` | object | [See below](#userconfig) |
| `channels` | array | Channel declarations bound to a bundled MCP server |
| `dependencies` | array | [See below](#dependencies) |

`mcpServers` also takes a packaged `.mcpb`/`.dxt` bundle path or an `https://` URL to one. `hooks`
as a file path needs the top-level `"hooks"` wrapper that `hooks/hooks.json` has; a file holding only
the event map fails to load, while an inline object is the bare event map.

`commands` as an object map names each command by its key (`"about"` in plugin `deploy-tools` runs as
`/deploy-tools:about`). Each value sets exactly one of `source` (a `.md` path) or `content` (inline
Markdown), plus optional `description`, `argumentHint`, `model` and `allowedTools`:

```json
"commands": {
  "status": { "source": "./commands/status.md", "argumentHint": "[env]" },
  "about": { "content": "Explain what this plugin provides." }
}
```

Rules for every path field:

- Relative to the plugin root and starting with `./`. The one exception: `skills` also accepts `"."`
  (the plugin root itself). Before v2.1.221 `"."` failed validation, so write `"./"` if you need to
  support older versions.
- No `..`. Installed plugins are copied into `~/.claude/plugins/cache`, and anything outside the
  plugin directory is simply not copied. The path must also exist: the `/plugin` Errors tab shows
  `<component> path escapes plugin directory` or `<component> path not found`, and validate reports
  `Path contains ".."` or `Path not found` (for `outputStyles`, `lspServers`, monitors and themes since
  v2.1.283).
- Arrays for multiple paths.

## Path behavior rules

**A custom path replaces the default directory for most fields, but adds to it for `skills`.** Get
this backwards and half the plugin silently disappears.

| Behavior | Fields |
| :-- | :-- |
| **Replaces** the default directory | `commands`, `agents`, `workflows`, `outputStyles`, `experimental.themes`, `experimental.monitors` |
| **Adds to** the default directory | `skills`: `skills/` is always scanned, listed paths load alongside it |
| Own merge rules | `hooks`, `mcpServers`, `lspServers`: see [components.md](components.md) |

To keep the default *and* add more, list it explicitly: `"commands": ["./commands/", "./extras/"]`.

Two exceptions worth knowing:

- For a **marketplace entry whose `source` resolves to the marketplace root**, declaring specific
  subdirectories in `skills` *replaces* the default scan. This is how several plugin entries share
  one `skills/` folder; each lists only its own subdirectories. If none of the listed paths exist,
  the default scan runs after all.
- A plugin with a `SKILL.md` at its root, no `skills/` directory and no `skills` field loads as a
  **single-skill plugin** (v2.1.142+). Set the frontmatter `name`, or the invocation name falls back
  to the install directory, which for a marketplace install is a version string that changes on
  every update. Use the `skills/` layout for anything that might grow to two skills.

When a plugin has both a default folder and the matching manifest key, v2.1.140+ warns
`Default <folder>/ folder is ignored because the manifest sets "<key>"` in `claude plugin list` and the
`/plugin` detail view. The plugin still loads. Pointing the key at a path inside that folder
(`"commands": ["./commands/deploy.md"]`) silences it.

## `userConfig`

Values Claude Code prompts for when the plugin is enabled: the alternative to telling users to
hand-edit `settings.json`, and the reason a plugin can hold an API token that a skill cannot.

```json
{
  "userConfig": {
    "api_endpoint": {
      "type": "string",
      "title": "API endpoint",
      "description": "Your team's API endpoint"
    },
    "api_token": {
      "type": "string",
      "title": "API token",
      "description": "API authentication token",
      "sensitive": true
    }
  }
}
```

Keys are letters, digits and underscores, not starting with a digit. Each option is a strict object:
an unknown field fails validation. Per option:

| Field | Required | Notes |
| :-- | :-- | :-- |
| `type` | Yes | `string`, `number`, `boolean`, `directory`, or `file` |
| `title` | Yes | Label in the configuration dialog |
| `description` | Yes | Help text under the field |
| `sensitive` | No | `true` masks input and stores it in secure storage instead of settings.json |
| `required` | No | `true` fails validation when empty |
| `default` | No | Used when the user provides nothing: a string, number, boolean, or array of strings |
| `options` | No | For a `string` that isn't `multiple` or `sensitive`: the allowed values, shown as a picker in `/config`. Each a plain label of 1 to 64 characters; `default` must be one of them, or set `required`. **Users before v2.1.271 can't load a plugin that declares any `options`**, so pair it with `engines` |
| `multiple` | No | For `string`, allow an array |
| `min` / `max` | No | Bounds for `number` |

**Where the value can be used.** `${user_config.KEY}` substitutes in MCP and LSP server configs and
exec-form hook `args`; non-sensitive values also substitute in skill and agent content, where a
sensitive one becomes a placeholder. Every value is exported to hook processes as
`CLAUDE_PLUGIN_OPTION_<KEY>` (key uppercased).

**Where it is rejected.** Fields that run through a shell refuse `${user_config.*}`, because substituting a
user-supplied value into a shell command would let the shell run whatever it contains. The component
fails with an error instead of substituting (v2.1.207+; earlier versions did substitute).

| Rejected field | Pass the value this way instead |
| :-- | :-- |
| Shell-form hook commands | Use exec form with `args`, or read `CLAUDE_PLUGIN_OPTION_<KEY>` from the environment |
| Monitor commands | Have the script read it from a config file it owns; monitors get no `CLAUDE_PLUGIN_OPTION_<KEY>` |
| MCP `headersHelper` | Same: its environment holds only `CLAUDE_PLUGIN_ROOT`, `CLAUDE_CODE_MCP_SERVER_NAME` and `CLAUDE_CODE_MCP_SERVER_URL` |

**Storage.** Non-sensitive values land in `pluginConfigs[<plugin-id>].options` in the user's
`~/.claude/settings.json`. Sensitive values go to the macOS Keychain (or `~/.claude/.credentials.json`
where no keychain exists); that store is shared with OAuth tokens and capped around 2 KB, so keep
secrets small.

`pluginConfigs` is read only from user settings, `--settings`, and managed settings. Project
`.claude/settings.json` and `.claude/settings.local.json` entries are **ignored**, because a cloned
repository could otherwise feed values straight into hook commands and server configs. Note that
`enabledPlugins` still honors project and local scopes; the restriction is specific to
`pluginConfigs`.

`claude plugin install` never prompts. Set values non-interactively with
`claude plugin install <plugin> --config key=value` (repeatable), or later with
`claude plugin configure <plugin>@<marketplace>` (`--values-stdin` reads them as JSON, `--json` for
output). Since v2.1.323 `claude plugin install --json` reports `unsetOptionCount`, the options still
without a value, so a script can tell the user what is left to fill in.

## `dependencies`

Other plugins this one requires, as `"name"`, `"name@marketplace"` or
`{ "name", "marketplace", "version" }`, optionally with a semver constraint:

```json
"dependencies": ["helper-lib", { "name": "secrets-vault", "version": "~2.1.0" }]
```

Claude Code installs and enables them transitively at the same scope. Enabling fails when a
dependency is not installed; disabling fails when another enabled plugin depends on the target (the
error gives you a chained command that disables the dependents first). `claude plugin prune` removes
auto-installed dependencies nothing needs any more. Since v2.1.319 `claude plugin update` also installs
dependencies a new version adds.

A dependency on a plugin from another marketplace is blocked at install unless the depended-on
marketplace is listed in `allowCrossMarketplaceDependenciesOn` in *this* plugin's marketplace.
Version constraints resolve against `{plugin-name}--v{version}` git tags, and `claude plugin tag`
creates them.

## `defaultEnabled`

`false` ships a plugin that installs disabled until the user opts in. Use it for anything that adds
cost or reach the user should choose, such as a plugin that connects to an external service.

It is only the fallback. Two things outrank it:

- **The user's setting.** Any `enabledPlugins` entry at any scope. Once written it survives updates
  and reinstalls, so changing `defaultEnabled` later never flips an existing user.
- **A dependency requirement.** When another active plugin requires this one, Claude Code writes
  `true` at install or enable time.

The marketplace entry's `defaultEnabled` takes precedence over the manifest's. Since v2.1.323 a
`defaultEnabled: false` plugin also stays off in claude.ai cloud sessions.

## `engines`

```json
"engines": { "claude-code": ">=2.1.323" }
```

The Claude Code versions a release works on, as a semver range (`>=2.1.323`, `^2.1`). Since v2.1.323 a
plugin outside its range is not installed, updated or loaded, and install and update pick the newest
version of the plugin whose range fits. It is the way to ship a release that depends on a newer
feature (`userConfig.options`, a new hook event, a mod API) without breaking users on older builds:
they stay on the last release that fits.

An invalid value is a validate warning (`Must be a version range such as ">=2.1.0"`, or `'engines'
must be an object`) and is ignored at load. Versions before v2.1.323 ignore the field entirely, so
it protects nobody below that. The official manifest reference doesn't list it yet; this shape is
taken from the changelog and the v2.1.325 validator.

## Versioning

Claude Code uses the resolved version as the cache key that decides whether an update exists.
Resolution order, first one set wins:

1. `version` in `plugin.json`
2. `version` in the marketplace entry
3. The git commit SHA of the plugin's source (`github`, `url`, `git-subdir`, and relative paths in a
   git-hosted marketplace)
4. For `archive` sources, the `sha256` pin, or the digest of the downloaded file, shortened to 12 chars
5. `unknown`, for `npm` sources and local directories outside a git repository

| Approach | How | Users get updates |
| :-- | :-- | :-- |
| **Explicit** | Set `version` in `plugin.json` | Only when you bump the field |
| **Commit-SHA** | Omit `version` everywhere | Whenever the source commit changes |
| **Digest** | `archive` source, no `version` | When the pin, or the zip's bytes, change |

Explicit versioning is right for anything published on a release cycle; a `CHANGELOG.md` beside it is
the reason. Commit-SHA suits internal plugins under active development.

> **Set `version` in exactly one place.** Claude Code always takes the `plugin.json` value at load
> time, so a stale manifest version masks the one you edited in `marketplace.json`. Only
> `claude plugin validate` on the marketplace notices (`Entry declares version "x" but
> <path>/plugin.json says "y"`); installs and updates say nothing. `sync_marketplace.py` enforces one
> place by stripping `version` from marketplace entries.

Forgetting to bump is the classic failure: push new commits under an unchanged `"version": "1.0.0"`
and every existing user keeps the cached copy while `/plugin update` reports "already at the latest
version". `claude plugin tag` creates the release tag and checks that the manifest and the enclosing
marketplace entry agree.

## Unrecognized fields and type errors

Unknown top-level fields are ignored at load time, so one manifest can double as a VS Code extension
manifest, an npm `package.json`, or an MCPB/DXT bundle manifest. `claude plugin validate` reports
them as warnings and suggests a correction when a name is a character or two off; `--strict` turns
them into errors, which is what you want in CI.

A recognized field with the wrong *type* behaves differently: most fields fail the plugin's load
outright (a `keywords` string instead of an array is a load error), while `experimental` and
`metadata` are ignored with a warning.
