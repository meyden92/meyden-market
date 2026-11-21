# Plugin components

Verified against https://code.claude.com/docs/en/plugins/components and Claude Code v2.1.325.
Read this when choosing what a plugin ships, and again when wiring each component up.

The manifest fields that point at these live in [manifest.md](manifest.md).

## Contents

- [Path variables](#path-variables): read first; every component below depends on them
- [File locations](#file-locations)
- [Skills](#skills)
- [Agents](#agents)
- [Hooks](#hooks)
- [`bin/` executables](#bin-executables)
- [MCP servers](#mcp-servers)
- [LSP servers](#lsp-servers)
- [Monitors](#monitors)
- [`settings.json`](#settingsjson)
- [Output styles, themes, workflows](#output-styles-themes-workflows)
- [Themes](#themes)

## Path variables

A marketplace plugin never runs from where you wrote it. It is copied into
`~/.claude/plugins/cache`, into a directory whose name contains the version and therefore changes on
every update. Every path a plugin uses has to be expressed relative to something Claude Code
substitutes at runtime.

| Variable | Resolves to | Use it for |
| :-- | :-- | :-- |
| `${CLAUDE_PLUGIN_ROOT}` | The plugin's installation directory | Bundled scripts, binaries, config files |
| `${CLAUDE_PLUGIN_DATA}` | A persistent directory that survives updates, created on first reference | Installed dependencies (`node_modules`, virtualenvs), generated code, caches |
| `${CLAUDE_PROJECT_DIR}` | The project root | Project-local scripts and config |

All three are exported as environment variables to hook processes and to MCP and LSP subprocesses,
**and to nothing else**; hook processes also get `CLAUDE_PLUGIN_OPTION_<KEY>` for each `userConfig`
option. A `bin/` executable receives none of them, so anything on `PATH` must locate
its own files from `$0`; see [`bin/` executables](#bin-executables).

Where they substitute *inline* depends on the component:

| Component | Fields where placeholders resolve |
| :-- | :-- |
| Skill and agent content | Anywhere the placeholder appears |
| Hook and monitor commands | Anywhere the placeholder appears |
| MCP `stdio` servers | `command`, `args`, `env` |
| MCP `http` / `sse` / `ws` servers | `url`, `headers`, `headersHelper` |
| LSP servers | `command`, `args`, `env`, `workspaceFolder`, `initializationOptions`, `settings` (v2.1.288+) |

In shell-form hook and monitor commands, wrap them in double quotes,
`"${CLAUDE_PLUGIN_ROOT}"/scripts/x.sh`, so a path containing spaces survives. In exec-form hooks,
use `args` and each path arrives as one argument with no quoting at all.

Inside a plugin skill, `${CLAUDE_SKILL_DIR}` still resolves to that skill's own folder; reach for
`${CLAUDE_PLUGIN_ROOT}` for anything shared across the plugin, and when in doubt
`${CLAUDE_PLUGIN_ROOT}/skills/<name>/…` is unambiguous.

Substitution in skill bodies is **textual**, performed before the content is used. The placeholders
are not present in the environment of a `!`…`` render command, so `'${CLAUDE_PROJECT_DIR}'` inside
single quotes still arrives filled in, while a bare `$CLAUDE_PROJECT_DIR` does not. `${CLAUDE_SESSION_ID}`
substitutes here too, which is how a skill hands the current session to a script that has no other way
to learn it. In a Bash tool process the session is `$CLAUDE_CODE_SESSION_ID` instead: a different
name, and the same value in the main thread and in subagents.

### `${CLAUDE_PLUGIN_DATA}` and the update problem

`${CLAUDE_PLUGIN_ROOT}` changes when the plugin updates. The old directory lingers for roughly two
weeks and is then cleaned up, so treat it as ephemeral and never write state there.

`${CLAUDE_PLUGIN_DATA}` resolves to `~/.claude/plugins/data/{id}/`, where `{id}` is the plugin
identifier with anything outside `a-zA-Z0-9_-` replaced by `-`. A plugin installed as
`formatter@my-marketplace` gets `~/.claude/plugins/data/formatter-my-marketplace/`. It is deleted
when the plugin is uninstalled from its last scope, unless you pass `--keep-data`.

Because the data directory outlives any single version, a bare "does the directory exist?" check
cannot tell that an update changed your dependency manifest. Compare the bundled manifest against a
copy in the data directory instead:

```json
{
  "hooks": {
    "SessionStart": [
      { "hooks": [ { "type": "command",
        "command": "diff -q \"${CLAUDE_PLUGIN_ROOT}/package.json\" \"${CLAUDE_PLUGIN_DATA}/package.json\" >/dev/null 2>&1 || (cd \"${CLAUDE_PLUGIN_DATA}\" && cp \"${CLAUDE_PLUGIN_ROOT}/package.json\" . && npm install) || rm -f \"${CLAUDE_PLUGIN_DATA}/package.json\"" } ] }
    ]
  }
}
```

`diff` exits nonzero both on first run and after a dependency-changing update; the trailing `rm`
removes the copied manifest if the install failed, so the next session retries.

For Node.js packages there is a built-in route: when Claude Code copies a plugin into the cache, it
installs the dependencies of a `package.json` at the plugin root itself, but only when a supported
lockfile sits beside it (`package-lock.json` or `npm-shrinkwrap.json` with `lockfileVersion` 2 or 3,
or a text `bun.lock`). It runs with `--ignore-scripts`, registry packages pinned to exact versions only,
no npm `overrides`, and a 60-second limit; anything else gets no install and the plugin loads without
the packages. Plugins loaded in place (`--plugin-dir`, a local-path marketplace) get no install. An
npm-source plugin needs `npm-shrinkwrap.json`, because npm drops `package-lock.json` from published
packages. The `diff` hook above stays the route for anything outside those rules.

When a plugin updates mid-session, hooks, monitors, MCP and LSP servers keep using the old path.
`/reload-plugins` moves hooks, MCP and LSP to the new one; monitors need a session restart.

## File locations

| Component | Default location | Notes |
| :-- | :-- | :-- |
| Manifest | `.claude-plugin/plugin.json` | The only thing in `.claude-plugin/` |
| Skills | `skills/<name>/SKILL.md` | |
| Commands | `commands/*.md` | Flat legacy form; prefer `skills/` |
| Agents | `agents/**/*.md` | Loaded recursively; subfolders join the name |
| Workflows | `workflows/*.js` | |
| Output styles | `output-styles/*.md` | |
| Themes | `themes/<slug>.json` | Experimental; see [Themes](#themes) |
| Hooks | `hooks/hooks.json` | |
| MCP servers | `.mcp.json` | Plugin root, **not** `~/.claude/.mcp.json` |
| LSP servers | `.lsp.json` | |
| Monitors | `monitors/monitors.json` | Experimental |
| Executables | `bin/` | Added to the Bash tool's `PATH`; claude.ai and Cowork refuse the plugin |
| Settings | `settings.json` | Only `agent` is read, and it is deprecated |

A `CLAUDE.md` at the plugin root is **not** loaded as project context, and `claude plugin validate`
warns about one. To ship instructions that reach Claude's context, put them in a skill.

## Skills

The point of most plugins. Author them with the `agent-toolkit:create-skill` skill, since everything it says about
descriptions, progressive disclosure, and completion criteria applies unchanged. Four differences
matter inside a plugin:

- **Invocation is namespaced**: `/plugin-name:skill-name`. Users cannot collide with anyone else's
  skill, and cannot shorten it.
- **The frontmatter `name` sets the last segment.** For personal and project skills the directory
  name wins and `name` is cosmetic; in a plugin `name` is what you type. Set it deliberately.
- **A project or user `.claude/agents/` definition overrides a same-named plugin agent**, but skills
  don't work that way: `/skill-name` and `/plugin-name:skill-name` coexist. After migrating a skill
  into a plugin, delete the original or both remain.
- **Boolean frontmatter** accepts `yes/no/on/off/1/0` in any case as well as `true`/`false`
  (v2.1.218+). Write `true`/`false` anyway.

Skills and commands are discovered automatically. After installing, check the summary: if it says
`Run /reload-plugins to activate.`, run it.

## Agents

`agents/<name>.md`, one subagent per file. They appear in the @-mention typeahead as
`plugin-name:agent-name` once the plugin is enabled. Subfolders are loaded recursively and join the
name: `agents/review/security.md` becomes `plugin-name:review:security`. Frontmatter `name` replaces
only the file-name segment; a file listed in the manifest's `agents` key loads without the subfolder
segments.

```markdown
---
name: security-reviewer
description: What this agent specializes in and when Claude should invoke it
model: sonnet
effort: medium
maxTurns: 20
disallowedTools: Write, Edit
---

The system prompt: role, expertise, behavior.
```

Supported frontmatter: `name`, `description`, `model`, `effort`, `maxTurns`, `autoCompactWindow`,
`tools`, `disallowedTools`, `skills`, `memory`, `background`, `omitClaudeMd`, `isolation`, `color`,
and `experimental.cacheTtl`. The only valid `isolation` value is `"worktree"`. `autoCompactWindow`
(v2.1.296+) compacts the subagent earlier than the main window and never raises it. `skills` preloads
at most 32 skills (v2.1.295+); the rest stay reachable through the Skill tool.

**`hooks`, `mcpServers`, `permissionMode` and `initialPrompt` are ignored for plugin-shipped agents**,
for security reasons. A plugin cannot hand an agent its own hooks or servers; ship them as plugin
hooks and MCP servers instead.

Two silent fallbacks: a `name` longer than 256 characters is ignored and the agent is named after its
file, and frontmatter that doesn't parse loads the agent with every field ignored and the description
`Agent from <plugin> plugin`. `claude plugin validate` finds both.

This is a genuine plugin-only capability: an `agents/` folder inside a plain skill registers nothing
at all. Only `.claude/agents/`, `~/.claude/agents/`, managed settings, `--agents`, and plugins
register subagent types.

## Hooks

`hooks/hooks.json`, or inline under `hooks` in the manifest. Same format as user hooks in
`settings.json`, so migrating is a copy of the `hooks` object.

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Write|Edit",
        "hooks": [
          { "type": "command", "command": "\"${CLAUDE_PLUGIN_ROOT}\"/scripts/format-code.sh" }
        ]
      }
    ]
  }
}
```

Hooks are the reason to build a plugin rather than a skill when behavior must happen **whether or not
the model decides to do it**. A skill is an instruction the model may ignore; a hook is the harness
acting.

**Types**: `command` (shell), `http` (POST the event JSON to a URL), `mcp_tool` (call a tool on a
configured MCP server), `prompt` (evaluate a prompt with an LLM, using `$ARGUMENTS` for context),
`agent` (run an agentic verifier with tools).

**Failing closed**: a hook that cannot start, times out or exits with an unexpected code lets the
action through. Set `"onFailure": "block"` on a `command` or `http` hook (v2.1.295+) when a guard must
block instead. Prompt and agent hooks run at most 24 at a time per session, subagents included, plus
12 that have waited past their event's timeout (v2.1.312+); a `timeout` under 1 second counts as 1.

**Events**:

| Event | Fires |
| :-- | :-- |
| `SessionStart` | A session begins or resumes |
| `Setup` | `--init-only`, or `--init`/`--maintenance` in `-p` mode: one-time CI or script preparation |
| `UserPromptSubmit` | A prompt is submitted, before Claude processes it |
| `UserPromptExpansion` | A typed command expands into a prompt. Can block the expansion |
| `PreToolUse` | Before a tool call. Can block it |
| `PermissionRequest` | A tool call needs a permission decision |
| `PermissionDenied` | The auto-mode classifier denied a call. Return `{retry: true}` to allow a retry |
| `PostToolUse` | After a tool call succeeds |
| `PostToolUseFailure` | After a tool call fails |
| `PostToolBatch` | After a batch of parallel tool calls resolves, before the next model call |
| `Notification` | Claude Code sends a notification |
| `MessageDisplay` | While assistant message text is displayed |
| `SubagentStart` / `SubagentStop` | A subagent is spawned / finishes |
| `TaskCreated` / `TaskCompleted` | A task is created via `TaskCreate` / marked completed |
| `Stop` | Claude finishes responding |
| `StopFailure` | The turn ends on an API error. Output and exit code ignored |
| `TeammateIdle` | An agent-team teammate is about to go idle |
| `InstructionsLoaded` | A CLAUDE.md or `.claude/rules/*.md` loads, at session start or lazily |
| `ConfigChange` | A configuration file changes mid-session |
| `CwdChanged` | The working directory changes, e.g. after a `cd` |
| `DirectoryAdded` | A directory is added via `/add-dir` or the SDK |
| `FileChanged` | A watched file changes; `matcher` names the filenames to watch |
| `WorktreeCreate` / `WorktreeRemove` | A worktree is created / removed. Replaces default git behavior |
| `PreCompact` / `PostCompact` | Before / after context compaction |
| `PreModelSwitch` / `PostModelSwitch` | Before / after the session model changes. `PreModelSwitch` can block the switch or ask for confirmation |
| `Elicitation` / `ElicitationResult` | An MCP server requests user input / the user responds |
| `SessionEnd` | The session terminates |

**Payloads worth knowing.** Most events carry only `session_id`, `cwd` and `hook_event_name`, but
three carry numbers a hook can act on:

`SessionStart` has `source` (`startup`, `resume`, `clear`, `compact`, `fork`) and, on `resume` and
`fork` only, four optional fields describing what resuming costs: `seconds_since_last_response`,
`context_tokens` (the tokens the first request re-sends), `prompt_cache_likely_expired`, and
`estimated_cache_write_usd`. They are the basis for a hook that warns before an expensive resume, or
that skips its own expensive setup on a session that is merely being cleared. Being optional, they
are absent on a `startup` source, so read them with a default rather than assuming a number.

`PreModelSwitch` and `PostModelSwitch` share `from_model`, `to_model`, `requested_model` (the alias
that was asked for, or `null` for "default"), `source`, `context_tokens`, `prompt_cache_warm`,
`cache_ttl`, `estimated_cache_write_usd` and `pricing`. `PreModelSwitch` fires for `command`,
`picker` and `sdk` switches; `PostModelSwitch` also fires for `auto` and `resume`, so a hook that
only wants deliberate switches has to filter on `source` itself.

An `if` condition such as `Monitor(tail *)` matches the Monitor tool's shell commands the way
`Bash(tail *)` matches Bash's (v2.1.314+). `WorktreeCreate` and `WorktreeRemove` plugin hooks also
run for `claude --worktree` (v2.1.300+).

**Targeting your own bundled MCP server** needs scoped names, and a matcher on the bare server key
never fires. Tool matchers and `if` fields take `mcp__plugin_<plugin-name>_<server-name>__<tool>`; an
`mcp_tool` hook's `server` field takes `plugin:<plugin-name>:<server-name>`.

Traps: event names are case-sensitive (`PostToolUse`, never `postToolUse`); the script needs
`chmod +x` and a shebang; a malformed `hooks/hooks.json` stops the **whole plugin** from loading.

## `bin/` executables

Files in `bin/` are added to the Bash tool's `PATH` while the plugin is enabled, so Claude invokes
them as bare commands in any Bash call, with no path and no `${CLAUDE_PLUGIN_ROOT}` prefix.

```
my-plugin/
└── bin/
    └── my-tool        # chmod +x, with a shebang
```

Nothing in a plain skill can do this. It is the cleanest way to give Claude a verb: instead of a
skill explaining a twelve-flag invocation every session, ship `my-tool` and let the skill say
`run my-tool --check`. It is also the only invocation form that survives an update unchanged, which
matters for `allowed-tools` and permission rules: `Bash(my-tool check:*)` keeps working, while a
pattern naming `${CLAUDE_PLUGIN_ROOT}/scripts/check.sh` matches a cache path containing the version
and stops matching the moment you publish a new one.

**A `bin/` executable is given none of the plugin path variables**: not `CLAUDE_PLUGIN_ROOT`, not
`CLAUDE_PLUGIN_DATA`, not `CLAUDE_PROJECT_DIR`. Only the hook, MCP and LSP subprocesses get those. So
resolve bundled files from the script's own location, never from the environment:

```bash
ROOT=$(cd "$(dirname "$0")/.." && pwd -P)   # $0 arrives as a full path
```

For the project, fall back to the working directory (`git rev-parse --show-toplevel`, else `$PWD`).
For a session identity, `$CLAUDE_CODE_SESSION_ID` is present and is the same value the payload's
`session_id` carries in a hook, which is what lets a `bin/` tool and a hook agree on per-session
state.

Plugin `bin/` entries come after the user's own `PATH`, so a plugin cannot shadow `git` or `ls`. The
PowerShell tool finds them too, outside the sandbox only. **claude.ai and Cowork refuse to install a
plugin with a top-level `bin/`**; a plugin meant for those surfaces keeps its executables elsewhere and
calls them through `${CLAUDE_PLUGIN_ROOT}`.

Keep them portable: `#!/usr/bin/env bash` or `#!/usr/bin/env python3`, POSIX-ish, no assumption
about the host's package manager. If the tool needs real dependencies, install them into
`${CLAUDE_PLUGIN_DATA}` from a `SessionStart` hook.

## MCP servers

`.mcp.json` at the plugin root, or inline under `mcpServers`.

```json
{
  "mcpServers": {
    "plugin-database": {
      "command": "${CLAUDE_PLUGIN_ROOT}/servers/db-server",
      "args": ["--config", "${CLAUDE_PLUGIN_ROOT}/config.json"],
      "env": { "DB_PATH": "${CLAUDE_PLUGIN_DATA}/data" }
    },
    "plugin-api-client": {
      "command": "npx",
      "args": ["@company/mcp-server", "--plugin-mode"]
    }
  }
}
```

They start automatically when the plugin is enabled and appear as ordinary MCP tools. `/reload-plugins`
keeps live connections for servers whose configuration is unchanged.

A stdio server runs in Claude Code and a local Cowork session but never on claude.ai; reach those
users with a remote server referenced by its `https://` URL. `mcpServers` in the manifest also takes a
packaged `.mcpb` (or older `.dxt`) bundle, as a path in the plugin or an `https://` URL; the server is
named after the bundle's manifest, and since v2.1.325 it unpacks under the plugins directory. A bundle
whose `user_config` has a required value left unset doesn't start (`Bundled MCP server "<name>" was
not started: it needs configuration`); users fill it in through `/plugin` → Configure or
`claude plugin install --config <server>.<key>=<value>` (v2.1.285+, bundles inside the plugin only).

Pair with `userConfig` for credentials: declare an option with `"sensitive": true` and reference it as
`${user_config.KEY}` in `env` or `headers`. That is the supported way to ship a server that needs a
token without asking users to edit any file.

## LSP servers

`.lsp.json` at the plugin root, or inline under `lspServers`. Only worth building for a language the
official marketplace doesn't already cover: `typescript-lsp`, `pyright-lsp` and `rust-analyzer-lsp`
exist there already.

```json
{
  "go": {
    "command": "gopls",
    "args": ["serve"],
    "extensionToLanguage": { ".go": "go" }
  }
}
```

Required: `command`, `extensionToLanguage`. Optional: `args`, `transport` (`stdio` default, or
`socket`), `env`, `initializationOptions`, `settings`, `workspaceFolder`, `startupTimeout`,
`shutdownTimeout`, `requestTimeout` (default 60000 ms, v2.1.288+), `restartOnCrash` (default `true`),
`maxRestarts`, `diagnostics` (default `true`; `false` keeps navigation but stops pushing diagnostics
into context). A `lspServers` key in the manifest adds to `.lsp.json`; a same-named server there
replaces the file's.

Stdout is protocol only: log to stderr. A server that writes anything else to stdout, or a header
over 64 KiB or body over 32 MiB, is disconnected and the disconnect counts as a crash.

`restartOnCrash` and `shutdownTimeout` need v2.1.205+. On earlier versions setting either made Claude
Code skip the server entirely, visible only under `claude --debug`.

The plugin configures the connection; **the user still has to install the binary**. Say so in the
README. A missing binary logs `LSP server <name> failed to start` under `claude --debug`, and since
v2.1.323 Claude Code warns when a plugin's language server can't start. `claude plugin validate`
does not read `.lsp.json`: one invalid entry skips the whole file at load, shown in the `/plugin`
Errors tab as `Invalid LSP server config for ".lsp.json"`.

When two enabled servers claim the same extension, the first registered handles those files and the
Errors tab warns `LSP server "<name>" is not used for <ext> files`.

## Monitors

`monitors/monitors.json`, an array. Claude Code starts each one automatically while the plugin is
active, runs it for the session, and delivers every stdout line to Claude as a notification. Nothing
has to ask it to start watching.

```json
[
  { "name": "deploy-status",
    "command": "\"${CLAUDE_PLUGIN_ROOT}\"/scripts/poll-deploy.sh",
    "description": "Deployment status changes" },
  { "name": "error-log",
    "command": "tail -F ./logs/error.log",
    "description": "Application error log",
    "when": "on-skill-invoke:debug" }
]
```

Required: `name` (unique in the plugin; prevents duplicate processes on reload), `command`,
`description`. Optional `when`: `"always"` (default) or `"on-skill-invoke:<skill-name>"`, which
starts it the first time that skill is dispatched, the right choice for anything expensive.

Declare them inline via `experimental.monitors` in the manifest, or point that key at a relative path.
Monitors are an experimental component: the top-level key still works but `claude plugin validate`
warns, and a future release will require `experimental.*`.

Constraints: interactive sessions only (never `-p`), unsandboxed with the user's full permissions,
skipped where the Monitor tool is unavailable, and **not loaded at all for project-scope `@skills-dir`
plugins**. On Bedrock, Vertex, Foundry, or with `DISABLE_TELEMETRY` or
`CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC` set, monitors need v2.1.310+. A monitor that references
`${user_config.*}` does not start, and monitors get no `CLAUDE_PLUGIN_OPTION_<KEY>` either, so have
the script read the value from a config file. Disabling a plugin mid-session does not stop monitors already
running; they end with the session.

## `settings.json`

**Deprecated; don't ship one in a new plugin.** At the plugin root, only `agent` is read. Since
v2.1.323 it still applies but warns at startup, in `claude plugin list` and in
`claude plugin validate`, and a future release stops applying it. `subagentStatusLine` was removed in
v2.1.323; a file that still holds it loads and the key does nothing. Cowork ignores a plugin's
`agent` (v2.1.311+).

`agent` made one of the plugin's agents the **main thread**. The supported route now is the user's
choice: they set `agent` in their own settings or pass `--agent`, and the
README says so. A plugin that ships `settings.json` today should remove it in its next release.

## Output styles, themes, workflows

- **`output-styles/<name>.md`**: the custom output style format, frontmatter `name` and
  `description` (plus `keep-coding-instructions`), listed in `/output-style` as `<plugin>:<name>`.
  `outputStyles` in the manifest replaces the default directory.
- **`themes/<slug>.json`**: terminal color themes, see [Themes](#themes).
- **`workflows/*.js`**: workflow scripts, one per file. `workflows` in the manifest replaces the
  default directory.

## Themes

Two different things are called a theme, and a plugin can ship either:

| | Terminal theme | Desktop and mobile look |
| :-- | :-- | :-- |
| What changes | The terminal UI's colors | The Code tab's ~100 design-system colors, a backdrop, the code highlighting theme |
| Shipped as | A JSON file in `themes/` | A mod calling `$.theme.set` at `session.start` |
| User picks it | In `/theme` | No: it applies while the mod is on |
| Covered in | This section | The `agent-toolkit:mods` skill (look, `makeColors`) |

The terminal ignores a mod's look and the desktop app ignores a terminal theme, so a plugin that wants
both ships both.

### Terminal theme files

`themes/<slug>.json` at the plugin root, the same format users write in `~/.claude/themes/`. The file
name without `.json` is the slug. Each one appears in `/theme` under its `name`, marked as from the
plugin, and selecting it stores `custom:<plugin-name>:<slug>`. Plugin themes are read-only: editing one
in `/theme` (`Ctrl+E`) saves a copy in the user's `~/.claude/themes/`.

```json
{
  "name": "Dracula",
  "base": "dark",
  "overrides": { "claude": "#bd93f9", "error": "#ff5555", "success": "#50fa7b" }
}
```

All three fields are optional:

- `name`: label in `/theme`; defaults to the slug.
- `base`: the preset it starts from: `dark` (default), `light`, `dark-daltonized`,
  `light-daltonized`, `dark-ansi`, `light-ansi`. An `-ansi` base follows the terminal's own 16
  colors, so overrides there are best written as `ansi:<name>`.
- `overrides`: token to color. Tokens not listed fall through to `base`.

Colors: `#rrggbb`, `#rgb`, `rgb(r,g,b)`, `ansi256(n)`, or `ansi:<name>` with one of the 16 ANSI names
(`red`, `cyanBright`, ...). **Unknown tokens and invalid colors are ignored without a word**, and
`claude plugin validate` checks neither, so a typo ships; `check_plugin.py` lints both.

Tokens, by group:

| Group | Tokens |
| :-- | :-- |
| Text and accent | `claude`, `text`, `inverseText`, `inactive`, `subtle`, `suggestion`, `permission`, `remember` |
| Status | `success`, `error`, `warning`, `merged` |
| Prompt and modes | `promptBorder`, `planMode`, `autoAccept`, `bashBorder`, `ide`, `fastMode`, `effortUltra` |
| Diffs | `diffAdded`, `diffRemoved`, `diffAddedDimmed`, `diffRemovedDimmed`, `diffAddedWord`, `diffRemovedWord` |
| Transcript backgrounds | `userMessageBackground`, `userMessageBackgroundHover`, `bashMessageBackgroundColor`, `memoryBackgroundColor`, `selectionBg`, `composerSidebarBackground` |
| Usage meter, labels | `rate_limit_fill`, `rate_limit_empty`, `briefLabelYou`, `briefLabelClaude` |
| Shimmer pairs | `claudeShimmer`, `warningShimmer`, `permissionShimmer`, `promptBorderShimmer`, `inactiveShimmer`, `fastModeShimmer` |
| Subagent colors | `<color>_FOR_SUBAGENTS_ONLY` for `red`, `blue`, `green`, `yellow`, `purple`, `orange`, `pink`, `cyan` |
| Ultrathink rainbow | `rainbow_<color>` and `rainbow_<color>_shimmer` for `red`, `orange`, `yellow`, `green`, `blue`, `indigo`, `violet` |

`userMessageBackgroundHover`, `selectionBg` and `composerSidebarBackground` paint only in fullscreen
rendering. Override a shimmer token together with its base token, or the spinner gradient clashes.
The `/theme` editor shows a few more single-purpose tokens (onboarding colors) that the docs omit.

Write a theme as a set: change `claude` alone and the accent clashes with `promptBorder`,
`suggestion` and the shimmer. Check it on the base it claims, in fullscreen and normal rendering, with
a diff and a permission prompt on screen.

### Declaring them

The default `themes/` directory needs no manifest entry. `experimental.themes` (a path or an array of
files or directories) **replaces** that scan. A top-level `themes` key still loads, but validate warns;
write it under `experimental`. Validate checks that the paths exist and stay inside the plugin
(v2.1.283+), not what the files contain. Themes are still experimental as of v2.1.325.
