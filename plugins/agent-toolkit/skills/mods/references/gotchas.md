# Mod gotchas

Traps the docs do not spell out, and bugs reported against real builds. Each entry carries the
version it was seen on and its source. **Verified** means reproduced on the version named (2.1.287
on 2026-10-02, 2.1.318 on 2026-11-06, or 2.1.325 on 2026-11-14); anything else is a report to re-check before relying on
it, since many were fixed in later builds. Issue numbers without a repository refer to
`github.com/anthropics/claude-code`; an open issue there can still be fixed, so check the
CHANGELOG too.

## Contents

- [Versions and naming](#versions-and-naming)
- [Writing hooks](#writing-hooks)
- [Tool calls and permissions](#tool-calls-and-permissions)
- [Prompts, turns and compaction](#prompts-turns-and-compaction)
- [Drawing](#drawing)
- [Tests](#tests)
- [Loading and runtime](#loading-and-runtime)

## Versions and naming

- **Code that validates on one version fails on another.** The state helpers (`read`, `update`
  taking `$`) fail `validate` on 2.1.278 with `$ is followed only into a function declared in this
  same file` and pass on 2.1.287; a test stub `on('command.register', () => ({ value: undefined }))`
  type-checks on 2.1.318 and fails on 2.1.325, where the value is `{ command }`. Develop, validate
  and test with the version users run, and pin it with `engines` in `plugin.json`
  (`{ "claude-code": ">=2.1.323" }`): from 2.1.323 Claude Code installs, updates and loads only a
  release whose range fits, so users on older builds stay on the last release that does. Verified
  on 2.1.325.
- **The Grep tool finds nothing in the generated types.** `.claude-plugin/types/` ignores itself
  in git, and the tool skips ignored files; search with `command grep -n <name> <file>` in Bash,
  or Read the file at the line. Verified on 2.1.288.
- **`$` is implicitly `any` in a helper function** (TS7006) until the parameter is typed:
  `import type { EngineInterface } from 'claude-code'`. Verified on 2.1.287.
- **`validate` type-checks a TypeScript module from 2.1.323.** Each type error is a warning, so
  `--strict` fails on it, and a mod that passed before can fail CI after a Claude Code update with
  no change of its own. Verified on 2.1.325.
- **A `$.state` contract exports types and nothing else.** `export {}` at the top of
  `types/index.d.ts` fails validation (`a contract exports types and nothing else`) once `"types"`
  in `plugin.json` names the file. Verified on 2.1.325.
- **Pre-2.1.287 instructions are stale.** `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS` is ignored, and
  `/plugin-types` is replaced by types written into `<mod>/.claude-plugin/types/` on each load. The
  types on GitHub (`mods/types/claude-code.d.ts`) are older than the installed build: on
  2026-11-06 they still said 2.1.277. Docs, 2.1.287.
- **`claude -p --plugin-dir` writes no types** from 2.1.295; only an interactive session that
  loads the mod does. Verified on 2.1.318. The built-in `plugin-authoring` skill writes the running
  engine's API file into its own folder each time it loads, a quicker source before the mod has
  loaded. A CI job no longer needs the generated types: `validate` type-checks from 2.1.323.
- **Reserved plugin names.** `validate` rejects names starting with `claude-`, `anthropic-`,
  `anthropics-` or `cc-plugin-`, the names `claude`, `anthropic`, `anthropics`, `claude-code` and
  `claude-mods`, and `official` beside `claude` or `anthropic`. This applies to every plugin, not
  only mods. Verified.
- **The CLI and the session's engine can differ.** The desktop app bundles its own Claude Code, so
  the `plugin-authoring` skill's type file can name a different version from `claude --version`.
  Observed 2.1.286 against 2.1.287.

## Writing hooks

- **`tool.check` gives `e.input` the type `unknown`**, even under a `{ tool: 'Bash' }` matcher.
  Cast it: `(e.input as { command?: string }).command`. `tool.call` does narrow by tool. Verified.
- **`session.start` runs again on every hot reload**, and module variables and timers restart with
  it. Start-up work must be safe to repeat. Docs.
- **One unmatched registration per event.** A second `on('session.start', ...)` without a matcher
  fails the whole module. Docs.
- **`$.command.register` throws for a taken name** and skips the rest of the hook it is in.
  Register commands last. Docs.
- **`false` for `focus`, `closeOnEscape` or `holdToasts` throws.** Build the argument without the
  field. Docs.
- **Awaiting your own promise costs budget**; awaiting `next` or a `$` call does not, except
  `$.clock.sleep`. A guard that times out is skipped and the call runs, unless it has `.catch`.
  Docs.
- **`.catch` no longer covers everything** from 2.1.301: it runs when the hook itself throws or
  times out. A wrong-shaped return, and events raised beneath the hook's own `$` calls, skip the
  hook without asking `.catch`. CHANGELOG 2.1.301.
- **`$.config.list()` inside a `config.set` hook answers with the old value**, and it rejects
  until Claude Code has bound the session (a resumed scheduled-task session, a draw right after
  start). Use the value the event carries, and read again on the next draw. claude-skins #77,
  late October 2026.
- **`engine.create` changes `$` only from a hook on it by name, in one form** (2.1.323). A `*`,
  `engine.*` or negated hook observes and its return is ignored, and `validate` fails any other
  shape of the named hook (a second `next`, a computed key, a matcher, a method instead of a value).
  The form is in [patterns.md](patterns.md#add-a--namespace-for-other-mods). Installed mods in an
  old form keep loading. CHANGELOG 2.1.323.
- **A `$.theme.clear()` clears whichever mod's look stands**, not the caller's own, and any later
  `$.theme.set` replaces the whole look. Clear only on the user's ask, never at `session.start`,
  and run one look mod at a time. Docs (`interface`).
- **`$` calls after the hook has returned are refused.** Work a hook leaves running (`void
  promise`) must not call `$` once the hook is done; start it from a timer or `$.clock.after`.
  Reported by effortless and claude-skins, October 2026.
- **`$.store` is not transactional across sessions**, and `$.fs.write` is not atomic. Give each
  item its own key and re-read right before writing. Docs.
- **System-prompt and context hooks that change their text between requests break the prompt
  cache**, which costs every request. From 2.1.321 a running conversation keeps the
  `prompt.section` and `tool.describe` text it saved, so a changed section reaches Claude only when
  the rerun hook returns `breakPromptCache: true`, and that turn pays for a fresh cache. Docs.
- **A hooks module may link at most 512 files**; past that the whole module is dropped with an
  error naming an unrelated file. Reported on 2.1.278, said to be lifted later (#91870). Re-check.

## Tool calls and permissions

- **A rewritten tool input is invisible to Claude.** Claude still believes it sent what it wrote.
  Return `context` on the result (`{ ...result, context: ['ran with --dry-run added'] }`) to tell
  it. Design thread #91870.
- **Auto mode denies a rewritten call** with `a hook changed this call's input after the model
  wrote it`, because the classifier reviewed the original. Docs.
- **Any `tool.call` hook on Bash, even a pass-through, made every Bash call fail inside
  `isolation: "worktree"` subagents.** #92533, 2.1.263 and 2.1.272, open as of 2026-10-02.
  Re-check before shipping a Bash hook to anyone who uses worktree agents.
- **`classic.PreToolUse` and `skill.prompt` were documented but never dispatched to modules.**
  #96831, 2.1.281, still open. `skill.prompt` gained `e.source`, `e.frontmatter` and more in
  2.1.299, so it is dispatched now; re-check `classic.PreToolUse`.
- **`tool.check` can approve past a user's `deny` rule** where the built-in guard does not load
  (no managed settings, no Team or Enterprise sign-in). Docs.
- **A mod's own `$.tool.call` and `$.mcp.call` raise no permission prompt** from 2.1.321, even under
  ask rules, in `dontAsk` and in `-p`. Deny rules and organization policy still apply. A mod that
  used to rely on the user confirming its calls now runs them silently; ask with `$.ui.ask` first
  where the user should decide. CHANGELOG 2.1.321.
- **Mods can no longer reword Claude Code's own confirmation questions** (2.1.323), and a
  `tool.check` hook's ask names only the mod that asked (2.1.323). CHANGELOG.

## Prompts, turns and compaction

- **`$.prompt.submit` cannot reach a running turn.** It queues until the session is idle; slash
  text is refused, so use `$.command.run` for commands. #95682, 2.1.278.
- **Desktop showed nothing for a turn a mod started with `$.prompt.submit` on an idle session.**
  #96336, desktop 2.7032.0 with CLI 2.1.280. Re-check.
- **A `session.compact` hook that returns its own `{ messages }` was undone by `--resume`**: the
  full history replayed. Return what `next` gave you, or test resume explicitly. #95328 and
  #96485, 2.1.274 to 2.1.280. Re-check.
- **`$.session.compact()` compacts only the main conversation, between turns.** Reported on
  2.1.282.
- **`$.session.usage()` after an Esc interrupt omitted `tokens` and `percent`.** Reported on
  2.1.280. Read both as optional. From 2.1.325 its `cost`, `/cost` and `--max-budget-usd` include
  every mod's answered `$.model.complete` and `$.model.classify` calls, so a mod that calls a model
  per turn shows up in the user's budget.
- **A context percentage has two meanings** when `autoCompactWindow` or
  `CLAUDE_CODE_AUTO_COMPACT_WINDOW` is set below the model's window. token-optimizer, claude-skins
  and flightdeck each shipped a meter users misread; show which window the number is measured
  against.
- **`turn.step` does not carry the system prompt, tool schemas or subagent messages.** Use
  `session.append` to see every stored row. Reported on 2.1.277.
- **Background agents raised `tool.call` but not `agent.spawn`.** Reported on 2.1.263. Re-check.

## Drawing

- **`await next(e)` at a built-in site resolves to an opaque engine reference**, not text, so a
  mod can wrap or replace Claude Code's drawing but not edit its words. #98808, 2.1.287.
- **A plugin pane shares the fullscreen dock with `/diff`**, and an open plugin pane is hidden
  while `/diff` is open with no event saying so. Traced on 2.1.270. Re-check.
- **One mod's `$.ui.invalidate` re-ran another mod's `Pane` hook.** Reported on 2.1.283. Draw from
  state, never from a count of render calls.
- **`PromptHint` flashed a duplicate frame on each redraw.** Reported on 2.1.280.
- **Nothing reaches the desktop below 2.1.287**: before it, desktop sessions logged
  `surface=null interactive=false` and raised no `ui.render`. #91870, 2.1.281; desktop drawing is
  supported from the 2.1.287 launch.
- **Cloud sessions run hooks and show only `$.ui.log` lines.** #91870, late September 2026.
- **Only the terminal and desktop draw a `Client`.** On 2.1.325 the element tables of `vscode` and
  `mobile` have none, and `validate`'s type check fails `els.Client` unless `e.surface` was
  narrowed to `terminal` or `desktop` first. Verified on 2.1.325.
- **VS Code, mobile and Remote Control draw less.** Mod panes that never rendered or rendered
  oversized in VS Code were reported by effortless (#40 to #51) and flightdeck in October 2026.
  VS Code ignores a pane's `rows` and `columns` and draws no band; mobile draws the band but no
  `Client`, `Raster` or `Image`, and a `ToolUse` addition as one line unless its Box has a border
  or background. Mount every surface the site is raised on in tests.
- **The band was one shared drawing before 2.1.323.** There, a mod's tree replaced the bands of the
  mods after it unless it held `await next(e)`; from 2.1.323 each mod gets its own row and that
  child draws nothing extra. The user can collapse the band and no mod can reopen it. Docs.
- **A look draws only on desktop and mobile.** `$.theme.set` resolves `isDrawn: false` with a
  `reason` in the terminal and VS Code, and `isDrawn: true` only says a drawing client is attached,
  not that it painted `colors`. A misspelled `colors` key or a scene with no `Backdrop` hook draws
  nothing and reports nothing; build `colors` with `makeColors` and check for a
  `Desktop won't paint this theme` line in its `problems`. Docs (`interface`) and the built-in
  `plugin-authoring` skill, 2.1.325.
- **A hook that blocks on a slow program stalls every mod.** `git ls-files` with no `timeoutMs`,
  a missing `lsof`, and `osascript` scripts over about 1,000 bytes (killed by macOS endpoint
  security) were reported against hamzafer/claude-code-mods and prismantis. Pass `timeoutMs` to
  `$.process.run` and treat a rejection as "no data".

## Tests

- **`find({ key })` misses `Text` elements**, because `key` is dropped from a drawn `Text`; find
  text by `type` and `text`. Verified.
- **Mounts in one test share the module and `$.state`**: a change made on the terminal mount
  persists into the desktop mount. Verified.
- **`claude plugin test <file>` fails** with `no such plugin folder`; pass the plugin directory.
  Verified.
- **`find` sees only the rows a pane has room to draw.** A test that looks for a row below the
  fold fails although the hook returned it; mount with a taller `viewport` and a larger
  `scroll.bodyRows` in the props, as the pane recipe in [patterns.md](patterns.md) does. Verified on 2.1.287.
- **Since 2.1.323 a band stub is per mod.** A test that stubs `ui.render` for `AbovePrompt`
  registers it with `{ plugin }` in the matcher, since each mod's row is asked for separately.
  Docs (`test`).

## Loading and runtime

- **The built-in guard skips a user's mod on organization machines.** With managed settings, or a
  Team or Enterprise `/login`, `sec-default` never runs a user-installed mod's hooks on
  `classic.*`, `prompt.compose`, `prompt.section`, `prompt.context`, `prompt.attachment`,
  `skill.prompt`, `attribution.text`, `session.compact`, `settings.read`, or `session.append` with
  `door` `attachment`, `hook-context` or `compaction`. `/plugin` and `validate` name the skipped
  hooks (2.1.299), and a transcript line names them (2.1.304). A mod that restores state in
  `classic.SessionStart` loses it there: effortless #47, claude-skins, flightdeck,
  token-optimizer. Keep a fallback path through events the guard leaves alone, such as
  `session.start` and `ui.render`. Docs (`admin`).
- **Hot reload missed some file changes before 2.1.323**: a file created right after a failed
  reload (fixed 2.1.323), a delete-then-recreate in `.claude/skills` (fixed 2.1.319). On an older
  build, save once more or restart. CHANGELOG.
- **Claude-written mods load without asking in auto and bypass modes** from 2.1.321, even with
  managed `allowUnsandboxedCommands: false` or `allowManagedDomainsOnly`, and never in `dontAsk`.
  CHANGELOG 2.1.321.
- **A large module evaluates seconds after start** (3 to 4.4 s reported); a mod command typed
  before then reaches only built-ins. Reported on 2.1.278.
- **All installed mods share one worker.** A hook that blocks it (a loop without an `await`) gets
  its mod unloaded, and three untraceable crashes unload every non-built-in mod until
  `/reload-plugins`. Docs.
- **A boolean `userConfig` field rendered as a text box in `/plugin configure`, and typing `y`
  saved `false`.** Reported on 2.1.282. Prefer a `string` field with `options` for a switch until
  re-checked.
- **A command the mod registers under a built-in's name is refused**, including names of built-ins
  that are themselves mods (`diff`). Reported 2026-09-26.
- **`claude plugin details` lists a mod as `Hooks (0)`.** Use `validate` to see what it does.
  Verified on 2.1.287 and 2.1.318.
