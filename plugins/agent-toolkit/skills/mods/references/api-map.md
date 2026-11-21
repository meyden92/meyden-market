# Mods API map

A map of the mod surface as of Claude Code 2.1.325 (2026-11-14). It answers "is there an event or
method for this" and "what may a hook return". For field-level shapes, read the generated
`<mod>/.claude-plugin/types/claude-code/index.d.ts`, which wins over this file whenever they
disagree.

## Contents

- [Files](#files)
- [The hook function](#the-hook-function)
- [Events](#events)
- [The mods API on `$`](#the-mods-api-on-)
- [Render sites](#render-sites)
- [Elements](#elements)
- [Limits](#limits)
- [Settings and environment variables](#settings-and-environment-variables)
- [Commands](#commands)

## Files

| File | Needed | What it holds |
| :-- | :-- | :-- |
| `.claude-plugin/plugin.json` | Always | The ordinary plugin manifest. Mods add no required field. |
| `hooks/hooks.json` | Always | `"modules": ["./register.ts"]`, one path relative to this file. The key is what makes the plugin a mod. Classic settings hooks may sit beside it under `"hooks"`. |
| The hooks module | Always | Exports `register(on, options)`. Suffix `.js`, `.mjs`, `.cjs`, `.jsx`, `.ts`, `.mts`, `.cts` or `.tsx`; always an ES module; no build step. |
| `types/index.d.ts` (or the path `"types"` in `plugin.json` names) | When the mod uses `$.state` or adds a `$` namespace | `declare module 'claude-code' { interface PluginState { '<plugin>': { ... } } }`, and `interface EngineInterface { <noun>: ... }` for an added namespace. Self-contained: no import or reference. |
| `tests/*.test.ts`, `*.test.tsx` | No | Run by `claude plugin test`. |
| `.claude-plugin/types/` | Generated | Written on each load from `--plugin-dir` or dev-mods in an interactive session (not `-p` or SDK): `claude-code/`, `claude-code-tools/`, `claude-code-mcp/`, one folder per plugin in `dependencies`, and a `tsconfig.json`. Ignores itself in git. Before a mod has loaded, the built-in `plugin-authoring` skill writes the same API file as `types/claude-code.d.ts` in its own folder each time it loads. |
| `make-colors.js`, `make-colors.d.ts` | For a desktop look | Copied unchanged from the built-in `plugin-authoring` skill's folder into the mod's `hooks/`; `makeColors` builds `$.theme.set`'s `colors`. Copy again after a Claude Code update. |

`options` holds the plugin's `userConfig` values with defaults filled in. A `userConfig` field has
`type` (`string`, `number`, `boolean`, `directory`, `file`), `title`, `description`, and optionally
`required`, `default`, `options` (a fixed picker for strings), `multiple`, `sensitive` (masked,
kept in secure storage), `min` and `max`. Values for a `--plugin-dir` mod live under
`pluginConfigs["<name>@inline"]` in settings.

## The hook function

`on(event, matcher?, hook)` returns a registration whose `.catch(handler)` sets an error handler
for that one hook.

- **Matcher**: an object compared field by field with `e`. Each field is a value, an array of
  allowed values, or a RegExp: `{ tool: 'Bash' }`, `{ tool: ['Edit', 'Write'] }`,
  `{ tool: /^mcp__github__/ }`, `{ component: 'Pane' }`, `{ source: ['clear', 'resume'] }`.
- **Event patterns**: an exact name, `'classic.*'` for every settings-hook event, `'*'` for every
  event except telemetry, `'telemetry.*'` for telemetry.
- **Order inside one module**: hooks run in the order `register` called `on`.

`next` carries more than the call:

| Member | Meaning |
| :-- | :-- |
| `next(e)` | Run the rest of the chain with this event; resolves to the result. Calling it twice runs the rest twice (a retry). |
| `next.signal` | AbortSignal that fires when the dispatch is abandoned (user interrupt, budget spent, an outer hook settled first). |
| `next.origin` | `{ plugin, tier }` of whoever raised the event. Claude Code itself is `{ plugin: 'engine', tier: 'core' }`. |
| `next.budget` | `ms` (the whole limit) and `remainingMs`. |
| `next.to(e, tier)` | Skip ahead to `append`, `builtin` or `core`. Only mods in `prependPlugins` or `appendPlugins` may call it. |
| `next.error`, `next.called` | Inside `.catch` only: `error.kind` is `throw` or `timeout`, `error.message` the text; `called` says whether the failed hook had called `next`. `kind: 're-entry'` (2.1.292) means the event came from inside this mod's own `$` call, with `error.cause` `rewritten` or `lent`. |

`.catch` runs only when the hook throws or times out (2.1.301); events raised beneath the hook's own `$` calls skip it without asking `.catch`. A hook with no `.catch` that throws, times out or returns the wrong shape is skipped: before `next`
the next handler runs in its place, after `next` resolved its result stands. Streaming events
(`turn.step`, `process.spawn`) take an async generator: `async function* ($, e, next) { const r =
yield* next(e); return r }`.

## Events

"Return" lists what a hook may answer besides `next(e)`. A rewrite is `next({ ...e, field })`.

### Tools

| Event | Fires | Return |
| :-- | :-- | :-- |
| `tool.call` | A tool is about to run, including subagent and MCP tool calls. Arguments are fields of `e` (`e.command`, `e.file_path`); `e.tool` names the tool. `next(e)` runs the permission check, then the tool. | `{ deny }`, `{ result }`, a rewrite of the arguments; after `next`, the result may carry `context` for Claude, and `{ deny }` withholds the result (Claude reads that the tool ran) |
| `tool.check` | The run/ask/deny decision, after `tool.call` hooks, `PreToolUse` hooks and the permission rules. `e.input` holds the arguments, typed `unknown`; `e.isReadOnly` (2.1.304) marks a read-only call; `e.ceiling` (2.1.290) names the approval an organization requires. | `{ decision: 'allow' \| 'ask' \| 'deny', reason?, decider? }`; `decider: 'person'` (2.1.304) lets only the permission dialog approve the ask, refused where nobody can be asked |
| `tool.describe` | Once per tool, when its description is first sent | `{ description, isDeferred? }`; add `breakPromptCache: true` (2.1.321) to send a changed description in a running conversation |
| `tool.list` | The session's tool pool is built: before a thread's first request, when mods, tool names or a setting change, and after `$.ui.invalidate('tool.list')` | `next(e)` resolves `{ value }`; return the pool with entries left out (taken away from the model and every agent, 2.1.323) or added as `{ name, description, mcp: false, inputSchema? }`, answered by a `tool.call` hook. Deny rules and `--tools` still hold. |

### Prompts and what Claude reads

| Event | Fires | Return |
| :-- | :-- | :-- |
| `prompt.submit` | A prompt is submitted | Rewrite `text` (the transcript shows it), add `context` (Claude alone reads it), or `{ drop }` |
| `prompt.fill`, `prompt.suggest` | Text is about to fill the prompt box as a draft or a dim suggestion | Rewrite |
| `prompt.edit` | The user edits the prompt box; 50 ms budget | Observe, or rewrite the draft |
| `prompt.change` | The box's text changes without a typed edit: history recall, clear, undo, a plugin's fill (2.1.300) | Observe |
| `prompt.autocomplete` | A word ends at the cursor (`e.token`); Claude Code's own rows show first (2.1.292) | `{ suggestions: [{ text, label, description }] }` |
| `prompt.mention` | Claude Code is about to read an @-mentioned file (2.1.290) | `next({ ...e, path })`, or `{ deny }` |
| `prompt.compose` | A system prompt is rendered | `{ sections: [{ id, text, scope }] }` |
| `prompt.section` | Once per named system-prompt section (`e.name`) | `{ text }`, or `{ text: null }` to drop it; `breakPromptCache: true` (2.1.321) sends a changed section in a running conversation |
| `prompt.context` | Once per conversation, for the context of the first message | `{ blocks }` |
| `prompt.attachment` | Claude Code adds a message of its own, such as a reminder (`e.type`, `e.detail`) | `{ text }` or `{ text: null }` |
| `skill.prompt` | A skill's text is expanded (`e.skill`, `e.text`; from 2.1.299 also `e.source`, `e.pluginName`, `e.path`, `e.frontmatter`) | `{ text }` |
| `attribution.text` | Commit or PR attribution text is composed | `{ text }` |

Text these hooks change between requests invalidates the prompt cache. Since 2.1.321 a running
conversation keeps the `prompt.section` and `tool.describe` text it saved until a hook rerun by
`$.ui.invalidate('prompt.section')` or `$.ui.invalidate('tool.describe')` returns
`breakPromptCache: true`; the next turn then starts the cache over, slower and dearer.

### Commands and configuration

| Event | Fires | Return |
| :-- | :-- | :-- |
| `command.run` | A command is about to run (`e.command`, `e.args`) | `{ text }` (printed after the plugin name; Claude reads it), `{}` (prints nothing) |
| `command.describe` | Once per command, for the command list | `{ description, argumentHint, isHidden }` |
| `config.set` | A `/config` row is about to change | Rewrite `value`, or `{ deny }` |
| `config.describe` | Once per `/config` row | `{ label, description, isHidden }` |
| `settings.read` | A mod calls `$.settings.read`, or Claude Code merges the session's settings (2.1.304). `e.layers` holds one `{ source, settings }` per layer, lowest precedence first; `e.source` the one source a mod asked for. | `next(e)`, `{ value }`, `{ deny }` |

### Turns

| Event | Fires | Return |
| :-- | :-- | :-- |
| `turn.start` | A turn begins (`e.turnId`, `e.text`), including subagent and teammate turns from 2.1.299 (`e.agentId` set; absent on the main loop) | Observe |
| `turn.step` | One model request is about to go out; several per turn with tool calls. `e.agentId` set for a subagent. Async generator. | `yield* next(e)`; rewrite `model` or `effort`; or answer without calling the model. The result carries `usage` and `serverToolUses` (2.1.290). |
| `turn.complete` | A turn ended (`e.answer`, `e.durationMs`, `e.usage`, `e.isAborted`, `e.agentId`) | `{ text }` shows a line under the answer |

### Session

| Event | Fires | Return |
| :-- | :-- | :-- |
| `session.start` | Once per loaded mod before the first prompt (`e.cwd`, `e.surface`, `e.isInteractive`), and again after each reload of that mod. Not after `/clear`, `/resume` or `/branch`. Awaited before the first prompt. | Observe |
| `session.end` | Session ends, or `/clear`, `/resume`, `/branch` (`e.reason`: `clear`, `resume`, `logout`, `prompt_input_exit`, `other`; `/branch` reports `resume`) | Observe; all `session.end` hooks share 1.5 s |
| `session.compact` | Before compaction | `{ skip }` |
| `session.receive` | A message from another session or agent arrives, before Claude reads it (`e.origin.kind`: `peer`, `peer-send-message`, `task-notification`, `scheduled-trigger`, ...) | `{ consumed }` keeps it from Claude |
| `session.send` | A message is about to leave (SendMessage tool or a mod) | `{ isDelivered: false, reason }` |
| `session.append` | Each row the conversation keeps, before it is stored (`e.door`: `prompt`, `response`, `notice`, `attachment`, `hook-context`, `compaction`, `queue`; `e.origin`, `e.message`) | Rewrite `message.content` only; all other fields are pinned |
| `session.attach`, `session.detach` | Another app connects or disconnects | Observe |
| `session.measure` | After each turn, and when a plan limit's percent used changes | Observe |

### Subagents

| Event | Fires | Return |
| :-- | :-- | :-- |
| `agent.offer` | A subagent type is offered to Claude | `{ isOffered: false }` hides it |
| `agent.spawn` | A subagent, teammate or workflow agent is about to start or be resumed (`e.subagentType`, `e.model`, `e.prompt`, `e.isTeammate`, `e.resume`) | Rewrite `model` (and `prompt` for a workflow agent), or `{ deny }` |

### Interface

| Event | Fires |
| :-- | :-- |
| `ui.render` | A render site is about to be drawn. Return a tree, a rewrite of `props`, or `next(e)`. |
| `ui.resolve` | Once per app, site and mod at load; its result is the element table `$.ui.resolve(e)` reads |
| `ui.press`, `ui.input`, `ui.select` | A mod's `Button`, `Input` or `Select` is used (`e.element` is the control's key). Runs before the control's own callback, so another mod can see or change it. |
| `ui.focus`, `ui.scroll` | Focus or scroll position of a pane or the band is about to change; `{ deny }` keeps it |
| `ui.close` | A pane is about to close (`e.id`; `e.origin.kind`: `plugin`, `person`, `unload`) |
| `ui.message` | A `Client` element posts data to its mod |
| `ui.fault` | A `Client` failed (`e.phase`: `load`, `render`, `run`; `e.reason`). Claude Code redraws the site after the hooks return, so draw a fallback (2.1.289). |

### Other mods, telemetry, settings hooks

| Event | Fires | Return |
| :-- | :-- | :-- |
| `plugin.register` | A hooks module is about to load (`e.name`, `e.tier`, `e.provenance`, `e.uses.events`, `e.uses.calls` spelled `fs.read`, `e.uses.env`, `e.uses.state`) | `{ refuse }` |
| `engine.create` | The `$` table is being built for a mod (no time budget) | A changed table, to add or withhold a namespace. Only a hook on `engine.create` **by name** in the one form `validate` accepts changes `$` (2.1.323); `*`, `engine.*` or a negation only observes. See [patterns.md](patterns.md#adding-a--namespace-for-other-mods). |
| `telemetry.log`, `telemetry.mark` | A usage record is logged, or a feature use marked. Hook by exact name or `telemetry.*` with the matcher `{ to: 'collector' }`, or `validate` fails; `*` does not select them. | `{ deny }` |
| `classic.<Event>` | Each settings-hook event (`classic.Stop`, `classic.PostToolUse`, `classic.SessionStart`); `e` is that hook's stdin JSON | Observe or rewrite as the settings hook allows |

### `$` calls as events

Every `$` method is also an event named without the `$.`: `fs.read`, `model.complete`, `ui.open`,
`process.run`. A hook on one intercepts that call from every mod after it in the chain and may
return `next(e)`, `{ deny }` or `{ value }`. Policy mods and tests use this.

## The mods API on `$`

| Namespace | Methods | Notes |
| :-- | :-- | :-- |
| `$.plugin` | `name`, `root` | Properties, not calls |
| `$.ui` | `resolve`, `invalidate`, `open`, `close`, `panes`, `place`, `focus`, `scroll`, `toast`, `notify`, `cancelNotify`, `status`, `log`, `notice`, `ask`, `copy`, `selection`, `view`, `blit` | `status(text)` sets the line under the prompt (`undefined` clears it); `toast(text, { timeoutMs? })`; `notify(text, { title?, key? })` sends a native notification through the user's `preferredNotifChannel` and resolves `{ isSent, channel }` or `{ isSent: false, reason }` (`disabled`, `no-channel`, `no-surface`, `refused`), and `cancelNotify(key)` takes one back; `place({ id })` puts a row at the transcript's end, drawn at the `Placed` site, and resolves `{ isPlaced, requestId }` (same id while the row stands answers that row; 500 per mod); `view({ agentId })` shows an agent's transcript, `view({})` goes back; `log(text, { to: 'debug' }?)`; `ask(question, labels)` resolves to the picked or typed label and rejects when dismissed or in `-p`; `notice(toolUseId, text)` adds context beside a permission prompt; `invalidate('ui.render' \| 'tool.list' \| 'prompt.section' \| 'tool.describe')` asks for a rerun |
| `$.theme` | `set`, `clear` | The session's one look in the desktop and mobile apps (2.1.319; `colors` 2.1.324). `set({ colors?, backdrop?, overrideColorScheme? })` replaces the whole look, whichever mod set the last one, and resolves `{ isDrawn: true, requestId }` or `{ isDrawn: false, reason }`; `isDrawn` only says a client that draws looks is attached. `backdrop` is a scene (`{ scene, glass? }`, drawn by a `Backdrop` hook) or a still ground (`{ color }`, `{ gradient }`, `{ vector }`, `{ image }`). `clear()` removes any mod's look: call it only on the user's ask. Not kept across `--resume` or a reload, so set it in `session.start`. Replaces `$.ui.backdrop`, removed in 2.1.319. The terminal and VS Code draw none. |
| `$.command` | `register`, `run`, `list` | `register({ name, description, argumentHint?, immediate? })` throws for a built-in name |
| `$.tool` | `register`, `call`, `check`, `list` | `register({ name, description, inputSchema, isDeferred? })`, where `isDeferred: false` lists the schema from the start instead of behind tool search; Claude sees `mcp__<plugin>__<name>`; serve it from a `tool.call` hook on that full name |
| `$.agent` | `register`, `spawn`, `list` | `register` takes an agent definition; listed as `<plugin>:<name>`. `list()` gives each subagent and teammate a `status`: `pending`, `running`, `waiting`, `idle`, `completed`, `failed`, `killed` |
| `$.model` | `complete`, `fork`, `classify` | `complete({ model, system?, prompt, maxTokens?, timeoutMs?, effort? }, { signal? })` resolves `{ isAnswered, text, usage }` or `{ isAnswered: false, reason }` (`api-error`, `empty-reply`, `aborted`) and never rejects over an API failure; aborting `signal` cuts it; `prompt` and `system` also take `[{ text, cache: true }]` blocks, cached up to the marked block (2.1.292); `fork({ prompt, effort? })` asks one tool-less question over this conversation, served from the prompt cache. Since 2.1.325 answered `complete` and `classify` calls count in `/cost`, `$.session.usage()`, `--max-budget-usd` and the cost metrics |
| `$.prompt` | `submit`, `read`, `fill`, `suggest`, `compose`, `media`, `paint` | `submit({ text, asUser? })` waits until the session is idle and starts a new turn; without `asUser` Claude reads a sentence naming the mod as sender. `media` (managed mods only, 2.1.299) reads the bytes of an image or document attached to the prompt. `paint({ text, decorations: [{ start, end, bold? ... }] })` decorates the draft without changing it (no `prompt.change`), resolving `isPainted: false` once the draft no longer reads `text` |
| `$.turn` | `abort` | |
| `$.session` | `messages`, `cwd`, `root`, `model`, `turns`, `id`, `repo`, `surfaces`, `surface` (deprecated: first of `surfaces()`), `usage`, `version`, `compact`, `send`, `append`, `authorize`, `identity` | `identity()` (managed mods only, 2.1.299) says how the session is signed in. `messages()` returns `{ role, text, toolUses }` rows (newest 4,096), not API content blocks; `usage()` returns `{ startedAt, context: { tokens, window, percent }, rateLimits: [{ kind, percentUsed, resetsAt }], cost }`; `send({ to, text })` |
| `$.config` | `list`, `set` | `/config` rows |
| `$.settings` | `read` | `read({ source?, key? })`: merged settings, one source (`user`, `project`, `local`, `flag`, `policy`), or one key |
| `$.env` | `get`, `set` | Name the variable as a string literal; `set` reaches every later child process and MCP server and resolves `{}`, or `{ deny }` saying why it was not made (2.1.301) |
| `$.fs` | `read`, `write`, `list`, `exists`, `stat`, `ancestors` | Relative paths resolve under the session's cwd; 4 MiB per file; `write` is not atomic; `stat(path, { resolve: true })` adds `realPath` |
| `$.store` | `get`, `set`, `delete`, `keys` | JSON per plugin under `~/.claude/plugins/store/`, shared by all sessions, 4 MiB; get-then-set races across sessions |
| `$.state` | `get`, `set` | Reactive per-session values; use the helpers `atom`, `read`, `update`, `derive`, `memberOf` imported from `claude-code`. A `ui.render` hook may read and never write. |
| `$.clock` | `now`, `sleep`, `after`, `every` | `now()` is a Promise; `after(ms, fn)` and `every(ms, fn)` return `{ cancel }` and stop when the module reloads |
| `$.http` | `fetch` | `fetch(url, init)` resolves `{ status, ok, headers, text }` with the body read |
| `$.process` | `run`, `spawn` | `run(argv, { cwd?, timeoutMs? })` uses no shell and resolves `{ exitCode, stdout, stderr, isStdoutTruncated, isStderrTruncated }` whatever the exit code (4 MiB per stream); rejects if the program cannot start or outlives its timeout (30 s default, 10 min max); `spawn` streams |
| `$.mcp` | `call`, `connect` | `connect(server)` only for a server the mod's own manifest lists. Since 2.1.321 a mod's own `$.mcp.call` and `$.tool.call` raise no permission prompt, under ask rules, `dontAsk` and `-p` alike; deny rules and organization policy still apply, and `$.mcp.call` is refused for tools marked `requiresUserInteraction` or set to `ask` by an organization |
| `$.audio` | `play`, `speak` | `play({ asset })` plays a sound file shipped in the mod's folder |
| `$.telemetry` | `log`, `mark` | Sent only when Claude Code or a built-in raised it |

The module itself has standard JavaScript and web APIs (`URL`, `TextEncoder`, `AbortController`,
`crypto.subtle`), `h` and `Fragment` for JSX, and nothing else.

## Render sites

A `ui.render` hook narrows with `{ component: '<Site>' }`. `e.surface` is `terminal`, `desktop`,
`vscode` or `mobile` (the Claude mobile app attached to a session); treat a value you don't know
as a surface that draws what its element table holds. The VS Code chat panel draws from extension 2.1.299, or 2.1.304
in sessions that fetch no feature flags (Bedrock, Vertex, Foundry, a gateway). `e.viewport` holds
`columns`, `rows` (the whole window) and `isFullscreen`; in the terminal and desktop it is absent
until measured, in VS Code always present.

| Site | `e.props` | `e.requestId` | Raised on |
| :-- | :-- | :-- | :-- |
| `Pane` | `title`, `isFocused`, `isPromptCovered` (2.1.323: true while a dialog or a field above the prompt takes the keys), `bodyColumns`, `placement` (`dock`, `inline`, or on desktop `widget`, a minimized pane where clicks may not reach), `anchoredEdges` (widgets only), `scroll` (`bodyRows`, `offset`), `view` | The pane's `id` | Every surface |
| `AbovePrompt` (the band) | `hasSurvey`, `isCollapsed`, `isWorking`, `maxRows`, `bodyColumns`, `scroll`, `view`; asked once per mod, `e.plugin` names it | One row per mod | Terminal, desktop, mobile |
| `AbovePromptList` | `rows` (`[{ plugin, tree }]` in chain order) plus the `AbovePrompt` props | One instance | Terminal, desktop, mobile |
| `Placed` | `id`, `plugin`, `onScreen` | From `$.ui.place` | Every surface |
| `Backdrop` | `scene`, `plugin`, `glass`, `overrideColorScheme` | From `$.theme.set` | Desktop, mobile |
| `UserMessage` | `text`, `origin`, `isExpanded`, and `task` or `from` by origin | Message id | Every surface |
| `AssistantMessage` | The reply text | Message id | Every surface |
| `ToolUse`, `ToolResult`, `ToolGroup` | Tool name, input, result | Tool call id | Every surface |
| `CommandOutput` | `command`, `text` | Message id | Every surface |
| `AskUserQuestion` | Question and options | Tool call id | Every surface |
| `Spinner` | `word`, `message`, `suffix`, `mode` | Agent id | Terminal, desktop, VS Code |
| `SessionMode` | `modes` | One instance | Terminal, desktop |
| `PromptHint` | `isDraft`, `isWorking`, `hint` | One instance | Terminal, desktop, mobile |
| `ToolProgress` | `kind` | Tool call id | Terminal only |
| `TurnDuration` | `word`, `durationMs` | Message id | Terminal only |
| `InfoNotice` | `text`, `command` | Message id | Terminal only |

Size a pane or band tree to `e.props.bodyColumns`. A docked pane has `e.props.scroll.bodyRows`
rows; an inline pane grows with its tree up to a limit. A tree taller than its site scrolls whole.
The permission prompt is not a site.

At an existing site a hook changes a detail (`next({ ...e, props: { ...e.props, suffix } })`),
replaces the drawing (return a tree, no `next`), or leaves it (`next(e)`).

**The band (2.1.323+)**: each mod that hooks `AbovePrompt` is asked for its own row (`e.plugin`
names it) and returns its row or `next(e)` for none; `AbovePromptList` stacks the rows from the top
in chain order. A row that fails validation or passes the limits draws nothing on its own. A mod
hides or reorders others' rows only from an `AbovePromptList` hook, handing `next` a subset of the
`rows` it got (unchanged values, no copies). The user can collapse the band (`isCollapsed`), and a
mod cannot expand it, so the band must never be the only place to answer something. Before 2.1.323
all mods shared one drawing and a tree replaced later mods' bands unless it held `await next(e)`.

**A look (2.1.319+)**: `$.theme.set({ backdrop: { scene } })` raises `Backdrop` on desktop and
mobile; draw it full-bleed with an `Svg` (`preserveAspectRatio="xMidYMid slice"`, under 131,072
characters, CSS animation only) and pass for other mods' scenes. A still ground needs no hook. See
[patterns.md](patterns.md#a-look-for-the-desktop-and-mobile-apps).

On mobile a `ToolUse` hook's addition draws as one quiet line, or as a card under the row when the
Box holding the row and your content has `borderStyle` or `backgroundColor`.

`$.ui.open({ id, title?, focus?, closeOnEscape?, holdToasts?, rows?, columns? })` resolves
`{ isPlaced, reason? }`. `focus`, `closeOnEscape` and `holdToasts` take only `true`; to leave one
off, omit it, since `false` throws. A pane opened by the user's own action appears at any width; one
a mod opens by itself (timer, `turn.start`) needs 144 columns, or 110 once the user has opened it.
A docked pane stays within 45% of the terminal's width (2.1.305), whatever `columns` asks; VS Code
ignores `rows` and `columns`. Close with `$.ui.close({ id })`. On desktop `placement: 'widget'` asks to
start minimized (ignored where there are no widgets), and `backgroundColor` asks the surface to paint
under the body.

## Elements

Elements come from `const { Box, Text } = $.ui.resolve(e)`; there are no element globals. Call
them as functions (`Text({ children: ['hi'] })`) or as JSX in a `.tsx` module.

| Element | Main props | Terminal | Desktop | VS Code |
| :-- | :-- | :-: | :-: | :-: |
| `Progress` | `label` (required, read by screen readers), `value` (absent: running with no known end), `max` (default 1), `valueText` (`412 of 900`), `color` | yes | yes | yes |
| `Box` | `key`, flex layout, `gap`, `columnGap`, `padding`, `margin` (numbers or the steps `xs` to `xl`), `width`, `height`, `minWidth`, `minHeight`, `borderStyle`, `borderColor`, `backgroundColor`, `position`, `overflow`, `hover` | yes | yes | yes |
| `Text` | `color`, `backgroundColor`, `weight` (`regular`, `medium`, `semibold`, `bold`; replaces the deprecated `bold`), `size`, `mono`, `tabular`, `italic`, `underline`, `strikethrough`, `dimColor`, `inverse`, `wrap`, `dir` (right-to-left), `hover`. `weight`, `size`, `mono`, `tabular` need 2.1.299: on older builds the tree does not draw | yes | yes | yes |
| `Button` | `key`, `label` or `children` (strings and `Text` only, 2.1.295), `onPress`, `hotkey` (one digit or lowercase letter), `plain`, `variant` (`primary`, `secondary`), `role` (`dismiss`), `dimColor`, `autoFocus`, `action` (a keybinding action) | yes | yes | yes |
| `Link` | `href` (up to 2,048 characters), `label` | yes | yes | yes |
| `Code` | `source`, `language`, `path`, `startLine`, `format` (a diff), `wrap` | yes | yes | yes |
| `Markdown` | `text` (not children), `key`, `dimColor`, `onLinkPress`, `pressableLinks` | yes | yes | yes |
| `Input` | `key`, `label`, `placeholder`, `value`, `submitLabel`, `rows` (several lines; Shift+Enter breaks a line, 2.1.301), `onSubmit`, `onInput`, `autoFocus` | yes | yes | yes |
| `Select` | `key`, `label`, `options` (`[{ value, label }]`), `value`, `onSelect`, `autoFocus` | yes | yes | yes |
| `Client` | `module` (a literal path to a second module with no `$`, for animation and pointer input), `key`, `props`, `width`, `height`, `flexGrow` | yes | yes | no |
| `Svg` | `source` (SVG markup up to 131,072 characters), `alt`, `width`, `height`, `isInteractive` | no | yes | yes |
| `Raster` | `key`, `columns` up to 512, `rows` up to 256, `cells` (base64 of three uint32 per cell: code point, colour, background; `0x01000000` is the default colour) | yes | no | no |
| `Image` | `key`, `source` (PNG or RGBA bytes up to 2 MiB, or a file path), `columns` and `rows` up to 255, `alt`. Draws in kitty, Ghostty and iTerm2 3.5+, inside tmux with `allow-passthrough`; elsewhere its `alt` text | yes | no | no |

Mobile draws `Box`, `Text`, `Button`, `Input`, `Select`, `Svg`, `Link`, `Code`, `Markdown` and
`Progress`: no `Client`, `Raster` or `Image`. `autoFocus: false` is refused; omit the prop. A tree with an unknown element or prop, or a child
where none goes, is refused whole and Claude Code draws its own version of the site.
`$.ui.blit({ requestId, key, columns, rows, cells })` repaints a mounted `Raster` without a render
pass.

Keyboard: a pane or band gets focus from `focus: true` on open (granted only while the prompt is
empty), Ctrl+X then Tab, or a click. With focus, Tab and the arrows move between controls, Enter
presses or submits, a hotkey presses its button, Esc returns to the prompt (and closes the pane
with `closeOnEscape`). In the terminal a bracketed button hides its hotkey, so use `plain: true` or
name the key in the label.

## Limits

| Limit | Value |
| :-- | :-- |
| A hook's own time per event (time in `next` and `$` calls not counted, `$.clock.sleep` counted) | 10 s; 50 ms for `prompt.edit` |
| A `.catch` handler | 1 s |
| All `session.end` hooks together | The `SessionEnd` hook budget, 1.5 s by default, counted after settings `SessionEnd` hooks finish |
| `$.process.run` timeout | 30 s default, 10 min max |
| `$.model.complete` `maxTokens` | 1024 default, up to 64,000 or the model's limit |
| `$.fs.read`, `$.fs.write` | 4 MiB per file |
| Text in one tree | The first 100,000 characters are drawn |
| Tree nesting depth, elements and text children | 32 levels below the root, 20,000 |
| `$.http.fetch` | 4 MiB request and response body, 30 s per call, 5 redirects |
| `drop` or `config.set` `deny` reason | 4,096 characters, the rest cut |
| `$.store` | 4 MiB of JSON |
| `$.session.messages()` | Newest 4,096 entries |
| `$.ui.invalidate` redraws | 10 per second, 30 in the terminal for the visible pane, the expanded band and the prompt hint; faster calls coalesce |
| `$.ui.toast` | 4 s unless `timeoutMs` |
| Pane a mod opens by itself | 144 terminal columns, 110 after the user opened it once |
| Docked pane width | 45% of the terminal |
| Command, tool, subagent type, pane and placed-row names | `[A-Za-z0-9_-]`, up to 64 characters |
| `$.ui.place` rows | 500 per mod |
| A backdrop `Svg` | 131,072 characters; an `image` ground 1 MiB and 4096 px a side |
| One `claude plugin test` test | 5 s unless it sets `timeoutMs` |

## Settings and environment variables

| Name | Where | Effect |
| :-- | :-- | :-- |
| `CLAUDE_CODE_PLUGIN_DIRS` | Environment, or `env` in `~/.claude/settings.json` | Plugin directories loaded as `--plugin-dir` would, for apps that take no flag. Absolute paths, `:`-separated (`;` on Windows). |
| `CLAUDE_CODE_PLUGIN_DIR_WATCH` | Environment | `1` makes a long-running non-interactive session reload `--plugin-dir` mods on save. Since 2.1.321 headless sessions also reload mods in `.claude/skills` on change by default; `0` turns that off |
| `prependPlugins`, `appendPlugins` | Managed settings (user settings only on unmanaged, non-Team/Enterprise machines) | Plugin ids run before or after every user-installed mod. Since 2.1.325 a plugin from a remote marketplace that managed settings declare, enable and list here counts as the organization's |
| `allowManagedModsOnly`, `allowModsToOverrideDenyRules` | Managed `pluginConfigs["cc-plugin-sec-default@builtin"].options` | Options on the built-in guard |
| `allowManagedHooksOnly` | Managed settings | Blocks hooks and installed mods that are not the organization's |
| `disableAllHooks` | Any settings file | Managed: no installed mod or hook runs. Elsewhere: the user's own mods stop, managed ones keep running. Also stops the settings-hook status line. |
| `disableSideloadFlags` | Managed settings | Rejects `--plugin-dir` and `--plugin-url` at startup and keeps Claude-written mods from loading |
| `pluginConfigs` | User or managed settings | `userConfig` values keyed `<plugin>@<marketplace>` or `<name>@inline` |
| `--safe-mode`, `--bare` | CLI flags | Turn installed mods off for the session; built-in mods keep running |

## Commands

| Command | Does |
| :-- | :-- |
| `claude plugin validate <dir> [--strict] [--json] [--profile directory]` | Static analysis of manifest and module; prints `hooks:`, `calls:` (a call made inside a helper reads `$.ui.toast (via say)`), `adds to $:` / `withholds from $:` for an `engine.create` hook (2.1.323), `gating hook with .catch:` / `gating hook without .catch:`, `env reads/writes:`, `state reads/writes:`, `hooks telemetry for:`; a long list continues on further lines under the same label (2.1.323). These lists are notes and fail nothing. Since 2.1.323 it also type-checks a TypeScript module (each finding a warning, so `--strict` fails on it) and fails an `engine.create` hook outside its one form; since 2.1.325 it reports unsafe paths and links. `--profile directory` also fails on what Anthropic's plugin directory refuses (README, license, icon). Exit 0 pass, 1 fail, 2 unexpected error. `/plugin validate <path>` in a session. |
| `claude plugin test [dir]` | Runs every `*.test.ts(x)` under the directory; exit 1 on a failure. In a folder with no mod it reports whether mods can load at all. |
| `claude --plugin-dir <dir>` | Loads the plugin for one session and hot-reloads the module on save; repeat for several |
| `claude plugin tag [dir]` | Creates a `<name>--v<version>` git tag after checking `plugin.json` against the marketplace entry |
| `engines` in `plugin.json` | `{ "claude-code": ">=2.1.323" }` keeps a release from installing, updating or loading on other versions (2.1.323+); install and update pick the newest release that fits |
| `/plugin` | Shows `N mod active · <names>`, and a note naming hooks the built-in guard skips; built-ins under Installed, Built-in |
| `/reload-plugins` | Reloads plugins after an install from the shell, or after the hooks worker crashed |
| `/plugin-authoring` | Loads the built-in skill that writes mods into the session's dev-mods folder |
