---
name: mods
description: >-
  Claude Code mods: plugins whose hooks module (`register(on)`, hooks `($, e, next)`) runs inside
  Claude Code and observes, rewrites or answers its events. A mod can rewrite prompts and tool calls,
  approve or deny calls, add slash commands, tools and subagent types, call models, run timers, and
  draw panes, a band above the prompt, rows in the transcript, status lines and toasts, redraw
  Claude Code's own rows and spinner, or recolor the desktop and mobile apps with a look and a
  backdrop, in the terminal, the desktop Code tab, VS Code and the mobile app. Covers what a mod can and cannot do, choosing a
  mod over a settings hook, skill or MCP server, building one in this marketplace, validating,
  testing and debugging it, releasing it, reviewing a third-party mod for safety, and organization
  policy for mods.
when_to_use: >-
  Use whenever the user wants Claude Code itself to look or behave differently through code, even
  if they never say "mod". Examples: "make a mod", "can a mod do X", "add a pane/sidebar/panel to
  Claude Code", "show X above the prompt", "change the spinner", "make the app cream / dark brown",
  "a theme or backdrop for the Code tab", "$.theme.set", "block or rewrite this tool call with code", "hooks module", "function hooks", "register(on", "ui.render", "claude plugin test",
  "my mod does nothing", "is this mod safe to install", "allowManagedModsOnly". Shell or HTTP hooks
  in settings.json belong to update-config, the statusLine command to statusline-setup, a terminal
  color theme file (themes/*.json) and a plugin with no hooks module to create-plugin.
user-invocable: false
---

# Claude Code mods

A mod is a plugin whose `hooks/hooks.json` names one JavaScript or TypeScript **hooks module** under
`"modules"`. The module exports `register(on, options)`, and each `on(event, matcher?, hook)` adds a
hook `($, e, next)`:

- `$` is the mods API and the module's only reach outside itself. The module has no Node, no DOM,
  no `setTimeout` and no `fetch` of its own.
- `e` is the event, frozen at every depth. A changed copy goes to `next`.
- `next(e)` runs the rest of the **chain** (later mods, then Claude Code's own behaviour) and
  resolves to the event's result.

A hook makes one of three moves: **observe** (`return next(e)`), **rewrite**
(`next({ ...e, text })`), or **answer** (return a result without calling `next`, such as
`{ deny: reason }`). Every `$` call is itself an event, which is how one mod watches or refuses
another. A mod is not sandboxed: it runs with the user's own file, process, network and secret
access.

## Ground truth comes from the running version

The API changed between patch releases all through early access, and code that validates on one
version fails on another. Before stating an API fact or writing hook code:

1. Run `claude --version`. Mods need **2.1.287 or later**. Below that, tell the user to update and
   stop.
2. When sources disagree, trust them in this order:
   1. The types Claude Code generates for the running version,
      `<mod>/.claude-plugin/types/claude-code/index.d.ts`, written each time an interactive session
      loads the mod from `--plugin-dir` or from the session's dev-mods folder (never in `claude -p`
      or SDK sessions, from 2.1.295). Its first line names the version. Before any mod has loaded,
      load the built-in `plugin-authoring` skill once: it writes the same file for the session's
      engine as `types/claude-code.d.ts` in its own folder, beside `make-colors.js`, `look.md`,
      `reference.md` and `examples/`.
      Search it for the name at hand (`'tool.call'`, `open: (`, `Pane: {`) and read the declaration
      the match lands on.
   2. What `claude plugin validate <mod>` reports.
   3. The docs under `https://code.claude.com/docs/en/plugins/mods/` (pages `overview`, `create`,
      `events`, `interface`, `api`, `test`, `troubleshoot`, `admin`, `reference`).
   4. This skill's references, a snapshot of 2.1.325 taken on 2026-11-14.

The `claude` on PATH and the engine running this session can be different versions (the desktop
app bundles its own). `validate`, `test` and users' terminals run the CLI, so its version is the
one that counts.

## Route

| The user wants | Go to |
| :-- | :-- |
| An answer: "can a mod...", "how do mods...", "which event..." | [What a mod can and cannot do](#what-a-mod-can-and-cannot-do), then [references/api-map.md](references/api-map.md) for the exact event, method, site or limit |
| A mod built or changed | [Is a mod the right tool](#is-a-mod-the-right-tool), then [Build a mod](#build-a-mod) |
| A mod released to the marketplace | [Ship a mod](#ship-a-mod) |
| A mod that does nothing, errors, or draws nothing | [references/testing-and-debugging.md](references/testing-and-debugging.md#find-out-why-a-mod-does-nothing) |
| Ideas for a mod, or how others built one like it | [references/published-mods.md](references/published-mods.md) |
| A third-party mod judged, or org policy for mods | [references/security-and-policy.md](references/security-and-policy.md) |

An answer names the surface it holds on (terminal, desktop, or both) and the doc page or type it
rests on.

## Is a mod the right tool

| The need | Reach for |
| :-- | :-- |
| A pane, a band above the prompt, a command that runs code with no Claude turn, Claude Code's own UI redrawn, or an event rewritten | A mod |
| Block, allow or log an event with a script that already exists | A settings hook (`update-config`) |
| A status line printed by a shell command | The `statusLine` setting (`statusline-setup`) |
| Instructions Claude should follow | A skill (`create-skill`) |
| Tools that reach an external system, in any language | An MCP server |

One plugin can hold a mod beside a skill, an MCP server and settings hooks, so a mod ships next to
whatever it complements.

## What a mod can and cannot do

A mod can:

- **Draw**: open a pane (a sidebar beside the transcript in a wide fullscreen terminal, a framed
  region above the prompt otherwise, a widget when minimized on desktop), draw its own row in the
  band above the prompt, place a row in the transcript (`$.ui.place`), set a status line under the
  prompt (`$.ui.status`), show a toast (`$.ui.toast`) or a native notification (`$.ui.notify`),
  and add a dim transcript line Claude does not read (`$.ui.log`). Trees are built from `Box`,
  `Text`, `Button`, `Input`, `Select`, `Link`, `Code`, `Markdown`, `Progress`, plus `Client`
  (terminal and desktop), `Raster` and `Image` (terminal) and `Svg` (desktop, VS Code, mobile).
- **Set a look** for the desktop Code tab and the mobile app (`$.theme.set`): about a hundred
  design-system colors per mode built with `makeColors`, a still background, or an animated scene
  drawn at the `Backdrop` site. The terminal keeps its own colors; a terminal theme is a
  `themes/*.json` file, which `create-plugin` covers.
- **Redraw Claude Code's own UI** at a render site: messages, tool rows, command output, the
  spinner, the AskUserQuestion dialog, the mode labels and the prompt hint.
- **Step into a tool call**: deny it, rewrite its input, retry it, answer it without running the
  tool, hold it while asking the user (`$.ui.ask`), or return allow, ask or deny from `tool.check`
  after the rules and settings hooks have decided.
- **Shape what Claude reads**: rewrite or drop a prompt, add context after it, redirect or refuse
  an @-mentioned file, add autocomplete rows, and rewrite system-prompt sections, first-message
  context, reminders, skill text, attribution text and the rows the conversation stores.
- **Add things**: slash commands (`immediate: true` runs one during a turn), tools Claude calls
  (listed as `mcp__<plugin>__<name>`, or under their own name through a `tool.list` hook, which can
  also take tools away from Claude and every agent) and subagent types, and send a subagent or a
  single model request to another model.
- **Work on its own**: timers (`$.clock.every`, `$.clock.after`), model calls on the user's plan
  (`$.model.complete`, `$.model.fork`), a new turn (`$.prompt.submit`), messages to other
  sessions, files, processes, HTTP, environment variables, settings and MCP calls.
- **Keep state** in module variables (lost on reload), `$.state` (reactive, per session, reset by
  `/clear`, `/resume` and `/branch`) or `$.store` (JSON shared by every session, 4 MiB).
- **Govern other mods**: refuse one as it loads (`plugin.register`), intercept any `$` call by its
  event name, add or withhold `$` namespaces (`engine.create`, hooked by name), and hide or reorder
  other mods' band rows (`AbovePromptList`).

A mod cannot:

- Change the permission prompt or what it shows, or reword Claude Code's own confirmation
  questions (2.1.323). `$.ui.notice` adds context beside a permission prompt.
- Read raw keys or rebind Tab, the arrow keys or Esc. Keys reach a mod's controls only while its
  pane or band holds focus, apart from a digit hotkey on a band button typed into an empty prompt.
- Draw where no UI exists. Hooks run in `claude -p`, the Agent SDK and cloud sessions, and nothing
  they draw appears there. Desktop WSL sessions load no plugins at all. The VS Code chat panel
  draws from extension 2.1.299 (2.1.304 without feature flags, as on Bedrock), and the mobile app
  when attached, each with fewer sites and elements; see the tables in
  [references/api-map.md](references/api-map.md#render-sites).
- Expand a band the user collapsed, or keep a look another mod replaces: one look stands per
  session, the last `$.theme.set` from any mod.
- Lift a block from a managed `PreToolUse` hook, or, where the built-in guard loads, approve a call
  a `deny` rule refuses.
- Spend more than 10 seconds of its own time on one event. Time inside `next` and `$` calls is
  free, apart from `$.clock.sleep`.

## Build a mod

1. **Shape it.** List the events the mod hooks and the `$` calls it makes. Read
   [references/patterns.md](references/patterns.md) and start from the closest recipe; when the mod
   resembles a public one, read its row in [references/published-mods.md](references/published-mods.md)
   too. Done when
   every behaviour the user asked for maps to an event or call in
   [references/api-map.md](references/api-map.md).
2. **Pick its home.**
   - A throwaway for this session: load the built-in `plugin-authoring` skill with the Skill tool
     and follow it. It writes the mod into `~/.claude/dev-mods/<session-id>/`, hot-reloads it once
     the user approves, and names the type file for this session's engine.
   - A mod for this marketplace: `plugins/<name>/` in this repo, scaffolded and registered through
     `agent-toolkit:create-plugin` (load it with the Skill tool unless it is already loaded). The name must not start with `claude-`, `anthropic-`, `anthropics-` or
     `cc-plugin-`; `validate` rejects those.

   Done when the directory holds `.claude-plugin/plugin.json`, `hooks/hooks.json` with
   `"modules": ["./register.ts"]` (or `.tsx` for JSX), and the module at `hooks/register.ts`: the
   path resolves against `hooks.json`, so a module at the plugin root fails with `no such file`.
3. **Generate the types** for a marketplace mod: with a module that exports an empty `register`,
   ask the user to run `claude --plugin-dir plugins/<name>` in their terminal and quit once the
   prompt appears. Only an interactive session writes the types; `claude -p` and SDK runs write
   nothing. Claude Code writes `.claude-plugin/types/` (it ignores itself in git) and a root
   `tsconfig.json` (commit it). Done when the first line of
   `.claude-plugin/types/claude-code/index.d.ts` names the version `claude --version` prints.
4. **Write the module** to the rules the static analyzer enforces at load and in `validate`:
   - Spell every API call in full at its call site: `$.store.get(...)`. Pass `$` only to a
     function declaration (top-level, in this file or imported from another file of the mod), or
     to `read` and `update` from `claude-code`. Leave `$` and its namespaces whole: no alias,
     destructuring or computed index.
   - Write event names as string literals, and register each event once per matcher: two
     unmatched `on('session.start', ...)` calls fail the load, so one hook does all start-up work.
     A telemetry hook takes the matcher `{ to: 'collector' }` or fails validation.
   - Keep `on` as the only binding of that name inside `register`.
   - Import plugin files by relative path with `import` declarations. The one bare import is
     `claude-code`. Every file is an ES module.
   - Keep values that must survive a reload in `$.state`, declared in `types/index.d.ts` (another
     path only when `"types"` in `plugin.json` names it), with `plugin` and `key` written as
     literals, or in `$.store`.
   - `session.start` fires again on every reload, so its work must be safe to repeat. Register
     commands last in it: a taken name throws and skips the rest of the hook.
   - Give every guard a `.catch(...)` handler that answers `{ deny }`, so the guard **fails
     closed**. Without one, a throw or timeout skips the hook and the call runs. `.catch` runs
     only on a throw or timeout of the hook itself; a wrong-shaped return still skips the hook.
   - In the band (`AbovePrompt`), return the mod's own row or `next(e)` for none; since 2.1.323
     Claude Code stacks each mod's row. Never make the band the only place to answer something:
     the user can collapse it.
   - To add or withhold a `$` namespace, hook `engine.create` by name in the one form `validate`
     accepts (2.1.323); a `*` hook only observes.
   - A look goes in one `$.theme.set` call in `session.start` (it does not survive a reload),
     with `colors` from a copied `make-colors.js`, and `$.theme.clear()` only on the user's ask.

   Done when the module is written and each rule above holds.
5. **Validate.** `claude plugin validate <dir>` exits 0, and `--strict` too: from 2.1.323 it
   type-checks a TypeScript module and reports each type error as a warning. Its `hooks:` line
   lists every event you meant to hook, its `calls:` line lists every `$` call you meant to make
   and nothing else, an `adds to $:` / `withholds from $:` line says what an `engine.create` hook
   changes, and every hook on a `gating hook without .catch:` line only observes (a hook that can
   deny or refuse belongs on the `with .catch` line).
6. **Test.** Read [references/testing-and-debugging.md](references/testing-and-debugging.md) before
   writing the first test, because stubs and the kit's rules decide whether a test means anything.
   Put `*.test.ts` files under `tests/`, cover every answer path (deny, rewrite, command text), and
   mount each drawing on `terminal`, `desktop`, `vscode` and `mobile` when the site draws there.
   Done when
   `claude plugin test <dir>` exits 0 and each test has been seen to fail once against a
   deliberately broken hook.
7. **Type-check in the editor** against the generated types (`tsc -p <dir>`); `validate` already
   ran the same check in step 5, so this step only matters on builds before 2.1.323.
8. **Try it live.** Give the user the command `claude --plugin-dir <dir>` (add
   `--debug-file ./mod.log` when something is off). The transcript shows a reload line naming the
   mod's hooks on every save. A look shows only in the Code tab or the mobile app: ask the user to
   check both light and dark mode with a long code block on screen. Done when the user has seen the
   behaviour on each surface they use, or has been told which part was not tried and why.

## Ship a mod

1. Release through the Ship section of `agent-toolkit:create-plugin` (load it with the Skill tool
   unless it is already loaded): marketplace entry, version bump in `plugin.json`, CHANGELOG, and
   the push an install waits for.
2. `plugin.json` sets `engines` to the oldest Claude Code the mod was tested on
   (`{ "claude-code": ">=2.1.323" }`), so older builds never load it (2.1.323+). The README states
   that version too, pastes the `hooks:` and `calls:` lines from `validate` so a reader can judge
   it, and lists any `userConfig` the user has to set.
3. `claude plugin validate --strict <dir>` and `claude plugin test <dir>` pass on the release
   commit. For a mod meant for Anthropic's plugin directory, `--profile directory` also passes
   (README, LICENSE or `license`, icon); the directory runs its own checks on hooks modules on
   top. `claude plugin tag <dir>` creates the `<name>--v<version>` tag after checking that
   `plugin.json` and the marketplace entry agree.
4. Users install with `claude plugin install <name>@meyden` or `/plugin install <name>@meyden`,
   then run `/reload-plugins` in a session that was already open.

Done when all four hold.

## References

- [references/api-map.md](references/api-map.md): every event and what a hook on it may return,
  every `$` namespace, render sites and their props, elements per surface, limits, settings,
  environment variables and commands. Read it before answering any "can a mod", "which event" or
  "what limit" question, and in Build step 1.
- [references/patterns.md](references/patterns.md): thirteen complete recipes, including a desktop
  and mobile look, then techniques from published mods (`Client` animation, adding a `$`
  namespace, per-surface drawing, model routing in `turn.step`), all validated and type-checked on
  2.1.325, three with passing tests. Read it in Build step 1 and copy the closest one.
- [references/published-mods.md](references/published-mods.md): ten public mods with what each
  does and which events and calls it uses, ideas by kind, and how they are packaged. Read it when
  the user asks for mod ideas or examples, and in Build step 1 when the mod resembles one listed.
- [references/testing-and-debugging.md](references/testing-and-debugging.md): the test kit, stubs,
  mocks and drawing tests, then where Claude Code reports a failure and what each message means.
  Read it before writing a test and whenever a mod does nothing.
- [references/security-and-policy.md](references/security-and-policy.md): the trust model, a review
  procedure built on `validate`'s output, the built-in guard, managed settings and policy mods.
  Read it before judging a third-party mod or answering an organization-policy question.
- [references/gotchas.md](references/gotchas.md): traps and open bugs, each with the version it
  was seen on. Read it when a mod misbehaves in a way the docs do not explain, and before shipping
  a mod that hooks Bash calls, compaction, `classic.*` events, `$.prompt.submit`, `tool.check`
  or panes.
