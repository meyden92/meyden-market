# Mod recipes

Thirteen complete mods first. Each passed `claude plugin validate`, which type-checks a TypeScript
module since 2.1.323, on Claude Code 2.1.325 on 2026-11-14 (first written and `tsc`-checked on
2.1.287); `guard`, `tool-log` and `clock` also pass their `claude plugin test` suites. Copy the closest recipe into `plugins/<name>/`, rename the plugin,
and adjust. Each needs the two JSON files shown in the first recipe; only extra manifest fields
are repeated after that. Techniques taken from published mods follow the recipes.

## Contents

- [Deny a tool call, failing closed](#deny-a-tool-call-failing-closed): `tool.call`, `.catch`, test
- [Hold a tool call for the user](#hold-a-tool-call-for-the-user): `$.ui.ask`
- [Decide allow, ask or deny from live state](#decide-allow-ask-or-deny-from-live-state): `tool.check`
- [Add context to a prompt](#add-context-to-a-prompt): `prompt.submit`
- [Pane with a command, state and a test](#pane-with-a-command-state-and-a-test): `$.ui.open`, `$.state`, `$.store`, `/clear`
- [Band above the prompt](#band-above-the-prompt): `AbovePrompt`, one row per mod
- [A look for the desktop and mobile apps](#a-look-for-the-desktop-and-mobile-apps): `$.theme.set`, `makeColors`, `Backdrop`
- [Background poller with a status line](#background-poller-with-a-status-line): `$.clock.every`, `$.process.run`, `userConfig`
- [A tool Claude can call](#a-tool-claude-can-call): `$.tool.register`, `$.http.fetch`, secrets
- [A command that calls a model](#a-command-that-calls-a-model): `$.model.complete`
- [Send a subagent type to another model](#send-a-subagent-type-to-another-model): `agent.spawn`
- [Read every model request](#read-every-model-request): `turn.step` as an async generator
- [Policy mod that refuses other mods](#policy-mod-that-refuses-other-mods): `plugin.register`, `fs.write`

Techniques from published mods, each validated and type-checked by `validate` on 2.1.325
(2026-11-14):

- [Animate with a Client, fall back on a fault](#animate-with-a-client-fall-back-on-a-fault): `Client`, `ui.fault`, `vscode`, test
- [Add a `$` namespace for other mods](#add-a--namespace-for-other-mods): `engine.create`
- [Change one prop per surface](#change-one-prop-per-surface): `Spinner`, `e.surface`
- [Route subagent requests to a cheaper model](#route-subagent-requests-to-a-cheaper-model): `turn.step` rewrite
- [Where published mods put the rest](#where-published-mods-put-the-rest)

## Deny a tool call, failing closed

`.catch` answers in the hook's place when it throws or times out, so the guard fails closed
instead of letting the command run. Claude reads the `deny` text as the tool result, so write it
as an instruction.

`.claude-plugin/plugin.json`:

```json
{ "name": "guard", "version": "0.1.0", "description": "Blocks force pushes", "author": { "name": "meyden" } }
```

`hooks/hooks.json`:

```json
{ "modules": ["./register.ts"] }
```

`hooks/register.ts`:

```ts
import type { Register } from 'claude-code'

const FORCE_PUSH = /\bgit\s+push\b.*(\s--force\b|\s-f\b)/

export const register: Register = on => {
  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    if (FORCE_PUSH.test(e.command)) {
      return { deny: 'Force pushes are blocked in this repository. Push to a new branch instead.' }
    }
    return next(e)
  }).catch(async ($, e, next) => ({
    deny: `The ${$.plugin.name} guard failed (${next.error.kind}), so the command was not run.`,
  }))
}
```

`tests/guard.test.ts`:

```ts
import { expect, test } from 'claude-code/testing'

test('a force push is denied before the tool runs', async ($, on) => {
  let ran = 0
  on('tool.call', () => {
    ran += 1
    return { result: 'ok' }
  })
  const pushed = await $.tool.call({ tool: 'Bash', command: 'git push --force origin main' })
  expect(pushed.deny).toMatch(/Force pushes are blocked/)
  expect(ran).toBe(0)

  const listed = await $.tool.call({ tool: 'Bash', command: 'ls' })
  expect(listed).toEqual({ result: 'ok' })
  expect(ran).toBe(1)
})
```

## Hold a tool call for the user

The call stays pending while `$.ui.ask` waits, and that wait does not count against the 10 s
budget. Start from the refusing answer so a dismissed dialog, "Chat about this" or a `claude -p`
run (where `ask` rejects) refuses the command. A typed answer resolves to its text, which is
compared with the label and so refuses too.

```ts
import type { Register } from 'claude-code'

const RISKY = /\brm\s+-rf?\b|\bgit\s+reset\s+--hard\b/

export const register: Register = on => {
  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    if (!RISKY.test(e.command)) return next(e)
    let answer = 'Refuse'
    try {
      answer = await $.ui.ask('Run this command? ' + e.command, ['Run it', 'Refuse'])
    } catch {
      // Dismissed, "Chat about this", or a claude -p run with nobody to ask
    }
    if (answer !== 'Run it') {
      return { deny: 'The user declined this command. Ask before trying another approach.' }
    }
    return next(e)
  })
}
```

## Decide allow, ask or deny from live state

`tool.check` fires after the rules, the permission mode and `PreToolUse` hooks; `next(e)` resolves
to their decision. Use it when the answer depends on something only known at call time. A fixed
command or path belongs in a permission rule instead. The hook matches command text, so it is a
reminder for Claude, not a security boundary.

```ts
import type { Register } from 'claude-code'

export const register: Register = on => {
  on('tool.check', { tool: 'Bash' }, async ($, e, next) => {
    const decided = await next(e)
    // tool.check types input as unknown; the matcher does not narrow it
    const command = (e.input as { command?: string }).command ?? ''
    if (!command.includes('git push')) return decided
    const branch = await $.process.run(['git', 'branch', '--show-current'])
    if (branch.stdout.trim() !== 'main') return decided
    return { decision: 'deny', reason: 'Pushing from main is not allowed. Create a branch first.' }
  })
}
```

## Add context to a prompt

`context` is read by Claude after the prompt and does not show in the transcript; rewriting
`text` does show. Keep the `context` earlier hooks added.

```ts
import type { Register } from 'claude-code'

export const register: Register = on => {
  on('prompt.submit', async ($, e, next) => {
    if (!/\bPR\b|pull request/i.test(e.text)) return next(e)
    const git = await $.process.run(['git', 'branch', '--show-current'])
    if (git.exitCode !== 0) return next(e)
    return next({ ...e, context: [...(e.context ?? []), 'Current branch: ' + git.stdout.trim()] })
  })
}
```

## Pane with a command, state and a test

A slash command opens the pane, a `tool.call` hook records calls into `$.state`, and the pane
redraws whenever that state is written, with no `$.ui.invalidate`. The open count lives in
`$.store` across sessions and is copied back into `$.state` after `/clear`, `/resume` and
`/branch`, which reset `$.state` without firing `session.start`. `immediate: true` lets the
command run while Claude is working.

`.claude-plugin/plugin.json`:

```json
{
  "name": "tool-log",
  "version": "0.1.0",
  "description": "A pane listing this session's tool calls",
  "author": { "name": "meyden" },
  "types": "./types/index.d.ts"
}
```

`types/index.d.ts`, the state contract `validate` holds every `$.state` reference to:

```ts
export type Call = { id: string; tool: string; isDone: boolean }

declare module 'claude-code' {
  interface PluginState {
    'tool-log': { calls: Call[]; opened: number }
  }
}
```

`hooks/register.tsx`:

```tsx
import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'
import type { Call } from '../types'

const PANE = 'tool-log'
const calls = atom({ plugin: 'tool-log', key: 'calls' } as const, [] as Call[])
const opened = atom({ plugin: 'tool-log', key: 'opened' } as const, 0)

// $ may be passed to a top-level function declared in this file
async function loadOpened($: EngineInterface) {
  const saved = Number((await $.store.get('opened')) ?? 0)
  await update($, opened, () => saved)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await loadOpened($)
    // Register commands last: a taken name throws and skips the rest of the hook
    await $.command.register({ name: 'tool-log', description: 'Show this session\'s tool calls', immediate: true })
    return next(e)
  })

  // /clear, /resume and /branch reset $.state and do not fire session.start again
  on('classic.SessionStart', { source: ['clear', 'resume', 'fork'] }, async ($, e, next) => {
    await loadOpened($)
    return next(e)
  })

  on('command.run', { command: 'tool-log' }, async ($) => {
    await $.ui.open({ id: PANE, title: 'Tool calls', focus: true, closeOnEscape: true })
    const count = Number((await $.store.get('opened')) ?? 0) + 1
    await $.store.set('opened', count)
    await update($, opened, () => count)
    return {}
  })

  on('tool.call', async ($, e, next) => {
    const call: Call = { id: e.tool_use_id, tool: e.tool, isDone: false }
    await update($, calls, list => [...list, call].slice(-200))
    const result = await next(e)
    await update($, calls, list => list.map(one => (one.id === call.id ? { ...one, isDone: true } : one)))
    return result
  })

  on('ui.render', { component: 'Pane' }, async ($, e, next) => {
    if (e.requestId !== PANE) return next(e)
    const { Box, Text, Button } = $.ui.resolve(e)
    const list = await read($, calls)
    const times = await read($, opened)
    const rows = Math.max(1, (e.props.scroll?.bodyRows ?? 12) - 2)
    return (
      <Box flexDirection="column">
        <Box flexDirection="row" columnGap={2}>
          <Button key="clear" label="Clear" hotkey="c" plain onPress={() => update($, calls, () => [])} />
          <Text dimColor>opened {times} times</Text>
        </Box>
        {list.length === 0 && <Text dimColor>No tool calls yet.</Text>}
        {list.slice(-rows).map(call => (
          <Text key={call.id} dimColor={call.isDone}>
            {call.isDone ? 'done' : 'runs'} {call.tool}
          </Text>
        ))}
      </Box>
    )
  })
}
```

`tests/tool-log.test.ts`. Both mounts share one loaded module and its state, which is why each
surface raises its own tool call:

```ts
import { expect, test } from 'claude-code/testing'

const PANE = {
  plugin: 'tool-log',
  component: 'Pane',
  requestId: 'tool-log',
  viewport: { columns: 120, rows: 30 },
  props: {
    title: 'Tool calls',
    isFocused: true,
    bodyColumns: 50,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 20 },
    view: {},
  },
} as const

test('lists tool calls and clears them, on every surface that draws panes', async ($, on) => {
  on('tool.call', () => ({ result: 'ok' }))

  // Both mounts share one loaded module and its state, so each surface records its own call
  for (const surface of ['terminal', 'desktop'] as const) {
    await $.tool.call({ tool: 'Bash', command: 'ls' })
    const ui = await $.ui.mount({ ...PANE, surface })
    expect(await ui.find({ type: 'Text', text: /done Bash/ })).toBeDefined()
    await ui.press({ key: 'clear' })
    expect(await ui.find({ type: 'Text', text: 'No tool calls yet.' })).toBeDefined()
    await ui.unmount()
  }
})

test('the open count comes back after /clear', async ($, on) => {
  on('store.get', () => ({ value: 7 }))
  on('classic.SessionStart', () => ({}))
  await $.classic.SessionStart({ source: 'clear' })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /opened 7 times/ })).toBeDefined()
})
```

## Band above the prompt

Since 2.1.323 each mod that hooks `AbovePrompt` gets a row of its own: the hook returns its row, or
`next(e)` for none, and Claude Code stacks the rows. Before 2.1.323 a returned tree replaced the
bands of the mods after it unless it held `await next(e)`; a mod that must still run there sets
`engines` to `>=2.1.323` instead of carrying both. `turn.complete` fires for subagent turns too, with
`agentId` set. The tool counter is a module variable because losing it on reload costs nothing.

`types/index.d.ts`:

```ts
export type Turn = { seconds: number; tools: number }

declare module 'claude-code' {
  interface PluginState {
    'turn-band': { last: Turn | null }
  }
}
```

`hooks/register.tsx`:

```tsx
import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'
import type { Turn } from '../types'

const last = atom({ plugin: 'turn-band', key: 'last' } as const, null as Turn | null)

export const register: Register = on => {
  // A counter that may reset on reload lives in a module variable
  let tools = 0

  on('turn.start', async ($, e, next) => {
    tools = 0
    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    tools += 1
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    // Subagent turns fire turn.complete too, with agentId set
    if (e.agentId) return next(e)
    await update($, last, () => ({ seconds: Math.round(e.durationMs / 1000), tools }))
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const turn = await read($, last)
    if (turn === null || e.props.hasSurvey) return next(e)
    const { Box, Text } = $.ui.resolve(e)
    // This mod's own row; other mods' rows are stacked beside it by Claude Code
    return (
      <Box>
        <Text dimColor>Last turn: {turn.seconds}s, {turn.tools} tool calls</Text>
      </Box>
    )
  })
}
```

The user can collapse the band (`e.props.isCollapsed`) and no mod can expand it, so anything the user
must answer also needs a command or a pane.

## A look for the desktop and mobile apps

`$.theme.set` recolors the Code tab and the mobile app and can put a scene behind the conversation
(colors need 2.1.324, the rest 2.1.319); the terminal and VS Code ignore it. A theme is about a
hundred design-system colors per mode, so never write `colors` by hand: copy `make-colors.js` and
`make-colors.d.ts` unchanged from the built-in `plugin-authoring` skill's folder into `hooks/` (load
that skill once and its folder is named) and call `makeColors` with a few anchors. Work until no
line of `problems` starts `Desktop won't paint this theme`; the other lines still paint. One look
stands per session, the last `$.theme.set` from any mod, so the whole look goes in one call. For a
still background instead of a scene, pass `backdrop: { color }`, `{ gradient }` or
`{ image: { source: 'harbour.jpg' } }` (1 MiB, 4096 px a side) and drop the `Backdrop` hook.

Anchors: `surface-0` (the page) and `text-primary` are required in each mode, then `surface-1`
(cards), `surface-2` (panels), `surface-3` (menus), `text-secondary`, `text-muted`; surfaces get
lighter or stay level from 0 to 3 in both modes, and in light mode `surface-2` and `surface-3` match
if both are given. `roles` (`accent`, `danger`, `success`, `warning`, `pro`) keep their hue and also
color code. `codeTheme: { light, dark }` names a highlighting theme, `contrast: 'more'` strengthens
borders, `only: 'dark'` makes a one-mode look. `validate` does not look inside a look, and a
misspelled `colors` key paints nothing silently: keep `colors` from `makeColors`, run
`checkColors(colors)` on anything else, and annotate a stored look as `ThemeSetArgs`.

`hooks/register.tsx`, beside the copied `make-colors.js` and `make-colors.d.ts`:

```tsx
import type { Register, ThemeSetArgs } from 'claude-code'

import { makeColors } from './make-colors.js'

// Built once at load. makeColors throws on a color it can't use and lists contrast problems
const { theme, problems } = makeColors({
  label: 'Harbour',
  roles: { accent: '#2f6f8c', danger: '#b3392f', success: '#4e7d3a', warning: '#a86f14', pro: '#6d4f94' },
  light: {
    gray: { anchors: { 'surface-0': '#e9eef0', 'surface-1': '#f1f5f6', 'surface-2': '#f8fafb', 'text-primary': '#1d2a30', 'text-muted': '#56656c' } },
  },
  dark: {
    gray: { anchors: { 'surface-0': '#11191d', 'surface-1': '#172126', 'surface-2': '#1d292f', 'surface-3': '#233138', 'text-primary': '#e6eef1', 'text-muted': '#9fb0b7' } },
  },
})

// One call carries the whole look: a later $.theme.set from any mod replaces it
const LOOK: ThemeSetArgs = {
  colors: theme,
  backdrop: { scene: 'harbour-tide', glass: { blur: 12, opacity: 0.6 } },
}

const SCENE = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 1000" preserveAspectRatio="xMidYMid slice">
<style>@keyframes tide { from { transform: translateY(0) } to { transform: translateY(14px) } }
.wave { animation: tide 9s ease-in-out infinite alternate }</style>
<rect width="1600" height="1000" fill="#11191d"/>
<path class="wave" d="M0 820 Q400 780 800 820 T1600 820 V1000 H0 Z" fill="#1d3a46"/>
</svg>`

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    // While building: the line that stops Desktop painting the colors at all
    const unpainted = problems.find(line => line.startsWith("Desktop won't paint"))
    if (unpainted !== undefined) $.ui.toast(unpainted)
    // Neither a reload nor --resume keeps a look, so set it here every time
    const set = await $.theme.set(LOOK)
    if (!set.isDrawn) $.ui.log(`harbour: ${set.reason}`, { to: 'debug' })
    await $.command.register({ name: 'plain', description: 'Take the look off this session' })
    return next(e)
  })

  on('ui.render', { component: 'Backdrop' }, async ($, e, next) => {
    // Every mod's Backdrop hook hears every scene: draw only our own
    if (e.props.plugin !== $.plugin.name || e.props.scene !== 'harbour-tide') return next(e)
    if (e.surface !== 'desktop' && e.surface !== 'mobile') return next(e)
    const { Svg } = $.ui.resolve(e)
    return <Svg source={SCENE} alt="A slow tide in a harbour at night" isInteractive />
  })

  // $.theme.clear() removes whichever mod's look stands, so only on the user's ask
  on('command.run', { command: 'plain' }, async $ => {
    const cleared = await $.theme.clear()
    return { text: cleared.isDrawn ? 'still drawn' : cleared.reason }
  })
}
```

A test cannot show paint, so ask the user to look in both modes, with a long code block on screen.

## Background poller with a status line

Work that outlives one event runs on a timer started in `session.start`. The timer callback runs
outside any event, keeps going between turns and stops when the module reloads. `options` carries
the `userConfig` values with defaults filled in. `e.isInteractive` is false under `claude -p` and
the SDK, where nothing is drawn.

`.claude-plugin/plugin.json`:

```json
{
  "name": "ci-status",
  "version": "0.1.0",
  "description": "Shows the PR's check status under the prompt",
  "author": { "name": "meyden" },
  "userConfig": {
    "interval_seconds": {
      "type": "number",
      "title": "Poll interval (seconds)",
      "description": "How often to ask gh for the PR's checks",
      "default": 60,
      "min": 15
    }
  }
}
```

`hooks/register.ts`:

```ts
import type { Register } from 'claude-code'

type Check = { state: string }

export const register: Register = (on, options) => {
  const everyMs = Number(options.interval_seconds ?? 60) * 1000

  on('session.start', async ($, e, next) => {
    // claude -p and the SDK draw nothing, so skip the polling there
    if (!e.isInteractive) return next(e)
    $.clock.every(everyMs, async () => {
      try {
        const run = await $.process.run(['gh', 'pr', 'checks', '--json', 'state'])
        if (run.exitCode !== 0) return $.ui.status(undefined)
        const checks = JSON.parse(run.stdout) as Check[]
        const failing = checks.filter(check => check.state === 'FAILURE').length
        $.ui.status(failing > 0 ? `checks: ${failing} failing` : `checks: ${checks.length} passing`)
      } catch {
        // gh missing, or still running at the 30 s timeout
        $.ui.status(undefined)
      }
    })
    return next(e)
  })
}
```

## A tool Claude can call

Register in `session.start`, which Claude Code awaits before the first prompt, so the tool exists
from turn one. Serve it from a `tool.call` hook on the full name `mcp__<plugin>__<name>`; a call no
hook answers fails. `sensitive: true` keeps the token out of `settings.json`.

`.claude-plugin/plugin.json`:

```json
{
  "name": "tickets",
  "version": "0.1.0",
  "description": "Gives Claude a ticket lookup tool",
  "author": { "name": "meyden" },
  "userConfig": {
    "api_url": { "type": "string", "title": "Tracker API URL", "description": "Base URL, without a trailing slash", "required": true },
    "api_token": { "type": "string", "title": "API token", "description": "Token for the tracker API", "sensitive": true }
  }
}
```

`hooks/register.ts`:

```ts
import type { Register } from 'claude-code'

export const register: Register = (on, options) => {
  on('session.start', async ($, e, next) => {
    await $.tool.register({
      name: 'ticket',
      description: 'Look up a ticket by its id and return its title and status',
      inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
    })
    return next(e)
  })

  // Claude sees the tool as mcp__<plugin>__<name>
  on('tool.call', { tool: 'mcp__tickets__ticket' }, async ($, e) => {
    const response = await $.http.fetch(`${options.api_url}/tickets/${encodeURIComponent(String(e.id))}`, {
      headers: { authorization: `Bearer ${options.api_token}` },
    })
    return { result: response.ok ? response.text : `Lookup failed with status ${response.status}` }
  })
}
```

## A command that calls a model

`$.model.complete` has no conversation history and spends the user's plan or API key. Read
`isAnswered` before `text`. For a question about the current conversation, `$.model.fork` reuses
the prompt cache.

```ts
import type { Register } from 'claude-code'

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'triage', description: 'Label text as bug, feature or question', argumentHint: '<text>' })
    return next(e)
  })

  on('command.run', { command: 'triage' }, async ($, e) => {
    const reply = await $.model.complete({
      model: 'haiku',
      system: 'Reply with one word: bug, feature, or question.',
      prompt: e.args,
      maxTokens: 20,
      timeoutMs: 15_000,
    })
    // An API failure resolves with isAnswered false; it does not reject
    return { text: 'Label: ' + (reply.isAnswered ? reply.text.trim() : `unknown (${reply.reason})`) }
  })
}
```

## Send a subagent type to another model

```ts
import type { Register } from 'claude-code'

export const register: Register = on => {
  on('agent.spawn', { subagentType: 'Explore' }, async ($, e, next) => next({ ...e, model: 'haiku' }))
}
```

## Read every model request

`yield* next(e)` forwards the streamed response and evaluates to the finished result. The hook
also runs for subagent requests, which carry `e.agentId`.

```ts
import type { Register } from 'claude-code'

export const register: Register = on => {
  // turn.step streams, so its hook is an async generator
  on('turn.step', async function* ($, e, next) {
    const result = yield* next(e)
    if (!e.agentId && result.usage) {
      $.ui.log(`cache read ${result.usage.cache_read_input_tokens} · wrote ${result.usage.cache_creation_input_tokens}`)
    }
    return result
  })
}
```

## Policy mod that refuses other mods

Only has authority when listed in managed `prependPlugins`; see
[security-and-policy.md](security-and-policy.md). `e.uses.calls` spells calls without `$.`.
`.catch` makes the check fail closed for user mods while letting the organization's and built-in
mods through. The `fs.write` hook audits every other mod's file writes to the debug log.

```ts
import type { EngineInterface, Next, PluginRegisterInput, Register } from 'claude-code'

const BLOCKED_CALLS = ['process.run', 'process.spawn']

async function checkMod($: EngineInterface, e: PluginRegisterInput, next: Next<'plugin.register'>) {
  const blocked = e.uses.calls.filter(call => BLOCKED_CALLS.includes(call))
  if (e.tier === 'user' && blocked.length > 0) {
    return { refuse: 'Policy: mods may not call ' + blocked.join(', ') }
  }
  return next(e)
}

export const register: Register = on => {
  // Fail closed: if checkMod throws or times out, refuse the user's mod
  on('plugin.register', checkMod).catch(async ($, e, next) =>
    e.tier !== 'user' ? next(e) : { refuse: 'Policy check failed, so this mod was not loaded' },
  )

  on('fs.write', async ($, e, next) => {
    $.ui.log(`audit fs.write by ${next.origin.plugin} ${JSON.stringify(e.path)}`, { to: 'debug' })
    return next(e)
  })
}
```

## Animate with a Client, fall back on a fault

A `Client` is a second module with no `$` that runs on the surface's own frame clock, so a ticking
value does not redraw the whole pane (flightdeck, project-sentinel). Claude Code raises `ui.fault`
when it fails to load, draw or run, then redraws the site, so the hook draws plain text from then
on. Only the terminal and desktop draw a `Client`; VS Code and mobile do not. Narrow `e.surface`
first and resolve `Client` inside that branch, which is also what the types require.

`hooks/register.tsx`:

```tsx
import type { Register } from 'claude-code'

const PANE = 'clock'

export const register: Register = on => {
  let isFaulted = false
  let startedAt = 0

  on('session.start', async ($, e, next) => {
    startedAt = await $.clock.now()
    await $.command.register({ name: 'clock', description: 'Show how long this session has run' })
    return next(e)
  })

  on('command.run', { command: 'clock' }, async ($) => {
    await $.ui.open({ id: PANE, title: 'Session time' })
    return {}
  })

  // A Client that fails to load, draw or run raises ui.fault; draw without it from then on
  on('ui.fault', async ($, e, next) => {
    isFaulted = true
    $.ui.log(`clock: ${e.phase} fault, drawing without animation: ${e.reason}`, { to: 'debug' })
    return next(e)
  })

  on('ui.render', { component: 'Pane' }, async ($, e, next) => {
    if (e.requestId !== PANE) return next(e)
    const now = await $.clock.now()
    // Only the terminal and desktop draw a Client; narrowing e.surface narrows the element table
    if ((e.surface === 'terminal' || e.surface === 'desktop') && !isFaulted) {
      const { Box, Client } = $.ui.resolve(e)
      return (
        <Box flexDirection="column">
          <Client key="ticker" module="./ticker.tsx" props={{ since: startedAt, now }} />
        </Box>
      )
    }
    const { Box, Text } = $.ui.resolve(e)
    return (
      <Box flexDirection="column">
        <Text>{Math.round((now - startedAt) / 60000)} min</Text>
      </Box>
    )
  })
}
```

`hooks/ticker.tsx`, the `Client` module:

```tsx
import type { ClientModule } from 'claude-code'

type Props = { since: number; now: number }
type State = { ticks: number }

// Runs on the surface's own frame clock: the pane is not redrawn every second
const Ticker: ClientModule<Props, State> = (props, surface) => {
  const { Text } = surface.elements
  if (surface.state === undefined) {
    surface.setState({ ticks: 0 })
    surface.every(1000, () => surface.setState({ ticks: (surface.state?.ticks ?? 0) + 1 }))
  }
  const seconds = Math.floor((props.now - props.since) / 1000) + (surface.state?.ticks ?? 0)
  return <Text>{Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')}</Text>
}

export default Ticker
```

`tests/clock.test.ts`:

```ts
import { expect, mock, test } from 'claude-code/testing'

const PANE = {
  plugin: 'clock',
  component: 'Pane',
  requestId: 'clock',
  viewport: { columns: 120, rows: 30 },
  props: { title: 'Session time', isFocused: false, bodyColumns: 40, placement: 'dock', scroll: { offset: 0, bodyRows: 10 }, view: {} },
} as const

test('animates where Client exists, falls back to text in VS Code', async ($, on) => {
  const clock = mock.clock(on, { now: 0 })
  on('command.register', () => ({ value: { command: 'clock' } }))
  on('session.start', () => ({ cwd: '/work' }))
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  await clock.advance(120_000)

  const terminal = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await terminal.find({ type: 'Client' })).toBeDefined()
  await terminal.unmount()

  const vscode = await $.ui.mount({ ...PANE, surface: 'vscode' })
  expect(await vscode.find({ type: 'Text', text: '2 min' })).toBeDefined()
  await vscode.unmount()
})
```

## Add a `$` namespace for other mods

A mod adds a namespace in `engine.create`; each call on it is raised as an event named
`<namespace>.<method>`, and a hook on that event answers with `{ value }`. prismantis, claude-skins
and lemo-core share their markdown renderer and state this way. `types/index.d.ts` declares the
namespace; a mod that lists this plugin under `dependencies` gets the declaration laid at
`.claude-plugin/types/<plugin>/index.d.ts`.

`types/index.d.ts`:

```ts
declare module 'claude-code' {
  interface EngineInterface {
    shout: { upper: (text: string) => Promise<string> }
  }
}
export {}
```

`hooks/register.ts`:

```ts
import type { Register } from 'claude-code'

export const register: Register = on => {
  // Add $.shout to every mod's $. The method body is a placeholder: each call is raised as
  // the event 'shout.upper', and the hook below answers it
  on('engine.create', async ($, e, next) => ({ ...(await next(e)), shout: { upper: async () => '' } }))

  // The event's input is the call's argument, here the string itself
  on('shout.upper', async ($, e) => ({ value: e.toUpperCase() }))
}
```

## Change one prop per surface

Passing a changed copy of `props` keeps Claude Code's own drawing, so the site stays right on
surfaces the mod never tested. Return a whole tree only for the surfaces you draw for, as
claude-skins does with an `Svg` spinner on desktop and a changed `word` in the terminal.

```ts
import type { Register } from 'claude-code'

export const register: Register = on => {
  on('ui.render', { component: 'Spinner' }, async ($, e, next) => {
    // Change one prop and let Claude Code draw the spinner on every surface
    if (e.surface !== 'terminal') return next(e)
    return next({ ...e, props: { ...e.props, word: 'Brewing' } })
  })
}
```

## Route subagent requests to a cheaper model

`turn.step` takes a rewrite of `model` and `effort` before the request goes out; a model alias
such as `haiku` resolves from 2.1.309. effortless routes every prompt this way after a cheap
`$.model.complete` judge decides the effort.

```ts
import type { Register } from 'claude-code'

export const register: Register = on => {
  on('turn.step', async function* ($, e, next) {
    // Main-loop requests pass through; subagent requests go to haiku at low effort
    if (!e.agentId) return yield* next(e)
    const result = yield* next({ ...e, model: 'haiku', effort: 'low' })
    $.ui.log(`subagent step on haiku: ${result.usage?.output_tokens ?? 0} output tokens`, { to: 'debug' })
    return result
  })
}
```

## Where published mods put the rest

The mods named here are listed with links in [published-mods.md](published-mods.md).

- **Bands from several mods.** Since 2.1.323 each mod draws its own row and Claude Code stacks
  them, so the effortless #46 problem (one mod's tree hiding every band after it) is gone. To order
  or hide rows, hook `AbovePromptList` and hand `next` a subset of `e.props.rows`;
  hamzafer/claude-code-mods ordered its mods' bands from a shared helper and a user-edited order
  file before that existed.
- **State with a schema version.** flightdeck stores one atom per concern with a `version` field
  and runs every `read` through a `normalize(defaults, value)`, so state saved by an older release
  never breaks a draw.
- **Draw off the hot path.** prismantis caches parsed markdown in a `Map` capped at 500 entries;
  flightdeck reads all its atoms with one `Promise.all` per render.
- **A mod inside a larger plugin.** token-optimizer ships a Python plugin (skills, settings hooks,
  a dashboard) with the mod in its own folder for the desktop band. show-your-work registers model
  tools and slash commands from the mod instead of an MCP server, and concatenates its source
  files into one module with a build script.
- **CI.** Most published mods run `claude plugin validate --strict` and `claude plugin test` on
  every push, on a matrix of operating systems and two Claude Code versions: the one the README
  names, and `latest` as non-blocking. prismantis installs its release zip from an `archive`
  marketplace pinned by sha256 and runs a smoke prompt.
