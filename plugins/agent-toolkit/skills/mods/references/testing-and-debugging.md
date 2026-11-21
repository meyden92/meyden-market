# Testing and debugging mods

Part one is the test kit `claude plugin test` runs. Part two is where Claude Code reports a
failing mod and what each message means. Facts as of Claude Code 2.1.287, rechecked on 2.1.325;
the kit's typings live in the generated `.claude-plugin/types/claude-code/index.d.ts` under
`'claude-code/testing'`. For worked suites, read the five built-in mods' `tests/` folders at
`https://github.com/anthropics/claude-code/tree/main/mods` (`diff`, `agents-md`, `privacy`,
`telemetry`, `sec-default`): one test file per hook file (`register.test.ts` beside
`hooks/register.ts`), shared fixtures under `tests/fixtures/`, one `describe` per file.

## Contents

- [Run tests](#run-tests)
- [How a test talks to the mod](#how-a-test-talks-to-the-mod)
- [Stubs](#stubs)
- [Kit rules](#kit-rules)
- [Mocks: clock, store, env](#mocks-clock-store-env)
- [Drawing tests](#drawing-tests)
- [Testing /clear and policy mods](#testing-clear-and-policy-mods)
- [Find out why a mod does nothing](#find-out-why-a-mod-does-nothing)
- [Messages and what they mean](#messages-and-what-they-mean)
- [The debug log](#the-debug-log)
- [CI](#ci)

## Run tests

`claude plugin test [dir]` runs every `*.test.ts` and `*.test.tsx` under the directory (default:
the current one) with no session, sign-in or network, and exits 1 on any failure, so it fits CI.
Point it at the plugin folder, not at a single file: a file path fails with `no such plugin
folder`. A test file with no `test()` fails with `declares no test(): nothing ran`. Each test has 5
seconds unless it sets `timeoutMs`. Test files may import the mod's own files and plain helpers,
so pure functions (a game's rules, a parser) can be unit tested without the kit.

```ts
import { describe, expect, mock, test, tier } from 'claude-code/testing'
```

`expect` offers `toBe`, `toEqual`, `toMatch`, `toMatchObject`, `toContain`, `toBeDefined`,
`toBeUndefined`, `toThrow`, each negatable with `.not`.

## How a test talks to the mod

`test(name, [options,] async ($, on) => { ... })`:

- `$` is the test's own handle and stands where Claude Code stands. Each method raises the event of
  the same name through the mod's hooks and resolves to the result: `$.tool.call({ tool: 'Bash',
  command: 'ls' })`, `$.command.run({ command, args })`, `$.prompt.submit(...)`,
  `$.session.start({ surface, isInteractive, cwd })`, `$.turn.complete(...)`, `$.turn.step(...)`,
  `$.session.receive(...)`, and `$.classic.<Event>(...)` for settings-hook events. Mods API calls
  such as `ui.close` cannot be raised directly; trigger them through the mod (press the button that
  closes the pane).
- `on` registers **stubs**: hooks that sit beneath the mod and answer in Claude Code's place.

A tool call is raised with the tool name and its arguments as fields:
`$.tool.call({ tool: 'Read', file_path: 'README.md' })`.

## Stubs

A stub for a mods API call is named without `$.` and returns `{ value }` (what the call resolves
to) or `{ deny }` (the call rejects in the mod). A stub for an event returns that event's own
result. Two errors in a failing test's `the engine reported:` block point at stubs:
`returned neither { value } nor { deny }` (a bare value from an API stub) and
`no implementation for <name>` (the mod made a call nothing answers).

| The mod calls or passes on | Stub |
| :-- | :-- |
| `$.command.register`, `$.tool.register`, `$.ui.toast`, `$.ui.log`, `$.ui.status`, `$.ui.close`, `$.store.set` | `() => ({ value: undefined })`; toast and log text is `e.text` |
| `$.store.get` | `($, e) => ({ value: saved.get(e.key) })` |
| `$.fs.read` | `($, e) => ({ value: '...' })`; `e.path` arrives absolute, so compare with `endsWith` |
| `$.ui.open` | `() => ({ value: { isPlaced: true } })` |
| `$.ui.ask` | A `tool.call` stub, because the question arrives as an `AskUserQuestion` call: `($, e) => ({ result: { answers: { [e.questions[0].question]: 'Run it' } } })` |
| `$.model.complete` | `() => ({ value: { isAnswered: true, text: '...', usage: { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } } })` |
| `$.process.run` | `($, e) => ({ value: { exitCode: 0, stdout: '...', stderr: '' } })`; `e.argv`, `e.init` |
| `$.session.messages`, `$.session.id`, `$.agent.list` | `{ value: [...] }`, `{ value: 'abc123' }`, `{ value: [] }` |
| `$.prompt.read`, `$.ui.copy` | `{ value: { text, cursor } }`, `{ value: { isCopied: true } }` |
| `tool.call` (an event the mod passes on) | `() => ({ result: 'ok' })` |
| `session.start` | `() => ({ cwd: '/work' })` |
| `turn.start` | `($, e) => ({ turnId: e.turnId })` |
| `turn.complete` | `() => ({ text: '' })` |
| `prompt.submit` | `($, e) => ({ text: e.text })` |
| `prompt.fill`, `session.send` | `() => ({ isFilled: true })`, `() => ({ isDelivered: true })` |
| `session.receive` | `($, e) => ({ text: e.text })` |
| `ui.render` (the mod returns `next(e)`) | `() => ({ type: 'Text', props: {}, children: ['drawn by Claude Code'] })` |
| `turn.step` | An async generator that yields chunks and returns `{ turnId, index, answer, toolUses: [], stopReason: 'end_turn', usage: null }` |

`$.ui.invalidate` and `$.state` need no stub; the kit answers them.

## Kit rules

- Register every stub before the test's first call on `$`. A later `on(...)` throws
  `on("<event>") after the test first called $`.
- Each test starts with the module freshly loaded, its variables at their initial values, every
  `$.state` value at its default, and **no `session.start` run**. Raise it when a hook depends on
  it, with stubs for what that hook calls (`command.register` and the `session.start` result).
  Without the `command.register` stub the call rejects, the kit skips the rest of the hook, and the
  test fails later for no visible reason; the skip is listed under `the engine reported:`.
- `test(name, { options }, body)` gives the mod `userConfig` values as if read from settings;
  omitted, the mod gets its manifest defaults.
- A failed `expect` inside a stub, or a stub answer the engine refuses, fails the test (2.1.292).
  A served `$` method that has not answered within 10 seconds fails, as in a session (2.1.299).
- Each mod's `Box` or `Text` root in a drawn tree carries `part: { plugin }` (2.1.299), so an
  exact-tree `toEqual` must include it; `find` is unaffected.

## Mocks: clock, store, env

- `const clock = mock.clock(on, { now? })` answers `$.clock`. `await clock.advance(ms)` moves time
  and runs due timers, `clock.set(t)`, `clock.now()`, `await clock.settle()` runs timers already
  due, and `await clock.sleep(ms)` inside a stub delays that stub's answer until the test advances
  that far (a slow model or process). A mod that calls `$.clock.now()` without a mock fails with
  `no implementation for clock.now`.
- `mock.store(on, { key: value })` answers `$.store` from memory and returns nothing; to assert
  what the mod saved, write `store.get` and `store.set` stubs over a `Map`.
- `mock.env(on, { CI: 'true' })` answers `$.env.get`.
- `const session = mock.session(on)` answers `$.session.append`; `session.appended()` lists the
  rows the mod added, oldest first (2.1.293).

## Drawing tests

`const ui = await $.ui.mount({ plugin, component, requestId, surface, viewport, props })` draws
one render site through the mod's `ui.render` hook. Name the surface every time and loop the body
over `['terminal', 'desktop', 'vscode', 'mobile'] as const`, leaving out a surface the site is not
raised on (the render sites table). `find({ type: 'Client' })` finds a `Client`; in `vscode` and
`mobile` the drawn tree holds none.

From 2.1.321 a mount needs no `ui.render` stub: without one, `keepsBeneath()` on the handle resolves
`true` when the drawing kept what `next(e)` returned and `false` when the hook left it out. With a
stub registered, use `find` for what the stub drew. From 2.1.323 a stub for the band (`AbovePrompt`)
answers a mod's `next(e)` only when registered with that mod's name, `on('ui.render', { plugin:
'my-mod' }, stub)`, since each mod's row is asked for on its own. Set `props` to what Claude Code would pass for that site
(see the render sites table in [api-map.md](api-map.md#render-sites)).

| Handle method | Does |
| :-- | :-- |
| `press({ key })` | Presses the `Button` with that key |
| `input({ key, text, kind? })` | Types into the `Input` and presses Enter; `kind: 'change'` types without submitting |
| `select({ key, value })` | Picks an option in the `Select` |
| `find({ key })`, `find({ type, text })` | First matching element as `{ type, props, text, children }`, or `undefined`; `text` is a string or RegExp |
| `keepsBeneath()` | `true` when the drawing includes what `next(e)` returned (no `ui.render` stub registered), 2.1.321+ |
| `unmount()` | Removes the drawing |

Each act resolves after the handler and any work it left running have settled, so assert on the
next line. Observed on 2.1.287:

- `find`'s `text` matches the element's joined text, so JSX like `{n} calls` (children `"3"`,
  `" calls"`) is found by `text: '3 calls'` or `/3 calls/`.
- `key` on a `Text` is dropped from the drawn element, so `find({ key })` locates controls
  (`Button`, `Input`, `Select`) and not text; find text by `type` and `text`.
- Every mount in one test uses the same loaded module and the same `$.state`. A change made on the
  terminal mount is still there on the desktop mount.

A drawing test checks the returned tree and that it is valid for the surface. It does not check
how the surface paints it, so look at a new layout in a live session too.

## Testing /clear and policy mods

- After `/clear`: skip `session.start`, stub `classic.SessionStart` with `() => ({})`, raise
  `await $.classic.SessionStart({ source: 'clear' })`, then mount and assert the restored value.
  The pane recipe in [patterns.md](patterns.md#pane-with-a-command-state-and-a-test) does this.
- A mod that judges other mods: call `tier('prepend')` once at the top of the file, and pass
  `test(name, { plugins: [{ name, register }] }, body)` with inline mods to admit or refuse. The
  kit loads every mod at the test's first call on `$`; a refusal makes that call throw with
  `<mod>: refused by <policy>: <reason>`.

## Find out why a mod does nothing

Work through these in order, stopping at the first that explains it:

1. `claude --version` is 2.1.287 or later.
2. `claude plugin test` in a folder with no mod reports whether mods can load at all:
   `no hooks module to load` means they can; `hooks modules are turned off here` means a setting
   (`disableAllHooks`, organization policy) keeps them off; `hooks modules are turned off in this
   process` means Anthropic switched installed mods off remotely and nothing local fixes it.
   `allowManagedModsOnly` is not reported here.
3. `claude plugin validate <dir>` passes and its `hooks:` line names the event. A pass with no
   `hooks` line means `hooks/hooks.json` lacks a `modules` key.
4. `/plugin` shows `N mod active · <name>`. If the mod is missing, the debug log has
   `hooks module <name>@<marketplace> not loaded: <reason>` (`@inline` for `--plugin-dir`).
5. Read the line Claude Code wrote about the failure. Where it goes depends on the session:
   - A session hot-reloading a plugin folder (`--plugin-dir`, or dev-mods with hot reload on): a
     dim transcript line.
   - Any other interactive session, including an installed mod: the debug log only.
   - `claude -p` with `--plugin-dir`: stderr in text output mode; a refusal by another mod goes to
     the debug log only.
6. An installed mod ignores edits because Claude Code runs the copy cached for its version. Develop
   against the working copy with `--plugin-dir`, and bump the version to ship.
7. A directory opened for the first time loads no mod until the trust prompt is accepted;
   `--safe-mode` and `--bare` load no installed mod.

## Messages and what they mean

| Message contains | Cause | Fix |
| :-- | :-- | :-- |
| `not loaded: hooks modules are turned off for installed plugins in this process` | Remote kill switch | None locally |
| `not loaded: disableAllHooks in managed settings` | Organization turned off hooks from installed plugins | Ask the admin |
| `not loaded: only managed plugins and built-in plugins run` | `allowManagedHooksOnly`, or `disableAllHooks` in a non-managed settings file | Change the setting |
| `not loaded: installed plugins that are not managed load no hooks module in this mode (--bare)` | Started with `--bare` | Start without it |
| `not loaded: another plugin of that name loads first` | Two plugins share a name | Rename one |
| `hooks module did not load: <reason>` | The module failed to load; the reason gives file and line when it is the mod's code | Fix that line |
| `options do not fit plugin.json userConfig` | A `userConfig` value is out of bounds or a required one is unset | Set it under the `pluginConfigs` entry the line names |
| `mods are limited to your organization's by policy (allowManagedModsOnly)` | Built-in guard | Admin decision |
| `tried to lift a deny rule in your settings` | A `tool.check` hook approved a call a deny rule refuses; it stays denied | Expected where the guard loads |
| `the deny rules in your settings could not be checked for this call, so it is refused` | The guard failed while checking a mod-approved call and failed closed | Retry; report if persistent |
| `refused by <plugin>: <reason>` | A policy mod refused this one | Read the reason |
| `<mod>: <event> hook skipped: <reason>` | The hook threw, passed its 10 s budget, or returned the wrong shape; shown once per event and failure kind until reload | Fix the hook; the debug log has every occurrence |
| `<mod> registered /<cmd> but no command.run hook answered it` | No `command.run` hook matched, it returned `next(e)`, or it was skipped (passing `focus: false` to `$.ui.open` is one way) | Look for a `hook skipped` line naming `command.run` |
| `"/<name>" refused: it is the built-in /<name>` | `$.command.register` with a taken name; the rest of that `session.start` hook was skipped | Pick another name; register commands last |
| `<mod> was unloaded: it crashed the hooks worker` | A hook blocked or crashed the worker all installed mods share (a loop that never awaits) | Fix the hook |
| `hooks: mods that run in the hooks worker are off for this session: it crashed 3 times` | Three untraceable worker crashes; every non-built-in mod is unloaded | `/reload-plugins` |
| `a hook changed this call's input after the model wrote it` | Auto mode: a `tool.call`, `turn.step` or `PreToolUse` hook rewrote input after the classifier reviewed it | Turn the rewrite off for auto mode, or leave auto mode |
| `<mod>: <event> hook was skipped. "<plugin>" runs first and sent the event on past it.` | A plugin earlier in the chain, usually the built-in guard, skipped this hook (2.1.304) | Move the work to an event the guard leaves alone, or install the mod as the organization's |
| `ui.render (<Site>) refused: <reason>; the engine drew its own` | The returned tree did not validate (unknown prop or element, a child where none goes, an element the surface lacks) | Fix the prop or element named |
| `reload failed, the previous version stays loaded:` | A save broke the module during hot reload | Fix the error; the last working version keeps running |
| `ui.open: focus is true or left out` | `false` passed to `focus`, `closeOnEscape` or `holdToasts` | Omit the field instead |

Symptoms with no message:

- `$.ui.open` runs and no pane appears: the mod opened it unasked in a terminal under 144 columns
  (110 once the user has opened it). Check `isPlaced`, or open it from a command or button.
- Hotkeys do nothing: the pane lacks focus. Open with `focus: true` from a command, or press Ctrl+X
  then Tab.
- Works in the terminal, not on the desktop: the site or element is terminal-only (`Raster`,
  `Image`, `ToolProgress`, `TurnDuration`, `InfoNotice`).
- A look (`$.theme.set`) shows nothing: the session is in the terminal or VS Code, which draw none;
  or `colors` was written by hand or has a `Desktop won't paint this theme` line in `makeColors`'
  `problems`; or another mod's later `$.theme.set` or `$.theme.clear()` replaced it; or a scene has
  no `Backdrop` hook. Read the `reason` when `isDrawn` is `false`. The Code tab needs 2.1.324 for
  colors; colors that stay after the mod is off are removed in Settings, `code appearance`.
- Works in the terminal, not on mobile: mobile draws no `Client`, `Raster` or `Image`, raises no
  `Spinner`, `SessionMode`, `ToolProgress`, `TurnDuration` or `InfoNotice`, and draws a `ToolUse`
  addition as one quiet line unless its Box has `borderStyle` or `backgroundColor`.
- Another mod's band row is gone: since 2.1.323 a mod with an `AbovePromptList` hook can hide or
  reorder rows, and a row that fails validation or passes the band's limits draws nothing on its own
  (`ui.render (AbovePrompt) refused: a row past the limits of the band`). The user may also have
  collapsed the band.
- Works on the desktop, not in VS Code: the panel needs extension 2.1.299 (2.1.304 without feature
  flags), and draws no band, `Client`, `CommandOutput`, `SessionMode` or `PromptHint`.
- A hook runs nowhere on a Team or Enterprise machine: the built-in guard skips that event for
  user mods, and `/plugin` names it in a note. See [gotchas.md](gotchas.md#loading-and-runtime).
- A value resets on save: module variables restart on every reload; use `$.state` or `$.store`.
- A value resets after `/clear`, `/resume` or `/branch`: `$.state` went back to defaults and
  `session.start` did not fire; reload it in a `classic.SessionStart` hook filtered on `source`.

## The debug log

Start with `claude --debug`, or `claude --debug-file ./mod.log --plugin-dir <dir>` and follow it
with `tail -f ./mod.log | grep <mod>`. The log has a line for every module loaded or refused, every
hook failure and every refused result. A loaded mod shows as
`hooks module <name>@inline loaded (worker, environment N, tier user); events: ...`.
`$.ui.log(text, { to: 'debug' })` writes the mod's own lines there instead of the transcript.

## CI

Most published mods run, on every push:

```sh
claude plugin validate --strict .
claude plugin test .
```

on a matrix of operating systems and two Claude Code versions: the one `engines` in `plugin.json`
names as the floor, and `latest` marked `continue-on-error`, since a new release can change the API.
From 2.1.323 `validate` type-checks a TypeScript module itself (findings are warnings, so `--strict`
fails on them), so a separate `tsc -p` step and its checked-in types are no longer needed. Since
2.1.323 a `claude -p` run whose `--plugin-dir` mod hangs or crashes the hooks worker says so on
stderr instead of printing nothing.
