import { atom, read, update } from 'claude-code'
import type { EngineInterface, ModelUsage, Register, SessionRateLimit, Timer } from 'claude-code'
import type { ContextPane, Demo, Stats } from '../types'

const TICK_MS = 30_000

const GREEN = '#22c55e'
const AMBER = '#eab308'
const RED = '#ef4444'
const TRACK = '#3f3f46'

// Context turns amber earlier than limits: quality drops before the window is full
export const contextColor = (percent: number) => (percent >= 80 ? RED : percent >= 60 ? AMBER : GREEN)

export const limitColor = (percent: number) => (percent >= 90 ? RED : percent >= 50 ? AMBER : GREEN)

export const limitLabel = (kind: string) =>
  kind === 'five_hour' ? '5h' : kind === 'seven_day' ? '7d' : kind === 'spend_limit' ? 'spend' : kind

export const formatReset = (resetsAt: string, now: number) => {
  const minutes = Math.max(0, Math.round((Date.parse(resetsAt) - now) / 60_000))
  const days = Math.floor(minutes / 1440)
  const hours = Math.floor((minutes % 1440) / 60)
  const mins = minutes % 60
  return days > 0 ? `${days}d${hours}h` : hours > 0 ? `${hours}h${mins}m` : `${mins}m`
}

export const formatTokens = (tokens: number) =>
  tokens >= 1_000_000 ? `${+(tokens / 1_000_000).toFixed(1)}M` : tokens >= 1000 ? `${Math.round(tokens / 1000)}k` : `${tokens}`

// claude-sonnet-5-5 -> Sonnet 5.5; ids that do not match pass through
export const modelLabel = (id: string) => {
  const match = /^claude-([a-z]+)-(\d+)-(\d+)/.exec(id)
  if (!match) return id
  const [, family = '', major, minor] = match
  return `${family.charAt(0).toUpperCase()}${family.slice(1)} ${major}.${minor}`
}

export const formatDelta = (tokens: number) => `${tokens < 0 ? '−' : '+'}${formatTokens(Math.abs(tokens))}`

export const formatUsd = (usd: number) => `$${usd.toFixed(2)}`

// Share of a turn's input tokens the prompt cache served; undefined when the turn had no input
export const cacheRate = (usage: ModelUsage) => {
  const input = usage.input_tokens + usage.cache_read_input_tokens + usage.cache_creation_input_tokens
  return input === 0 ? undefined : Math.round((usage.cache_read_input_tokens / input) * 100)
}

const SOURCE_LABEL: Record<string, string> = {
  env: 'CLAUDE_CODE_AUTO_COMPACT_WINDOW',
  settings: 'settings',
  clientdata: 'account',
  experiment: 'experiment',
  'model-default': 'model default',
  'unknown-model': 'unknown model',
  auto: 'model limit',
}

export const formatAge = (ms: number) => {
  const minutes = Math.max(0, Math.floor(ms / 60_000))
  return minutes >= 60 ? `${Math.floor(minutes / 60)}h${minutes % 60}m` : `${minutes}m`
}

const glyph = (percent: number) =>
  percent >= 87.5 ? '●' : percent >= 62.5 ? '◕' : percent >= 37.5 ? '◑' : percent >= 12.5 ? '◔' : '○'

const ICONS = {
  clock: '<path d="M12 7.5V12l3 2" fill="none" stroke="#a1a1aa" stroke-width="1.8" stroke-linecap="round"/>',
  calendar:
    '<rect x="8" y="8.5" width="8" height="7.5" rx="1.2" fill="none" stroke="COLOR" stroke-width="1.6"/><path d="M8 11h8M10 7v2.5M14 7v2.5" stroke="COLOR" stroke-width="1.6" stroke-linecap="round"/>',
  context:
    '<path d="M8.5 9h7M8.5 12h7M8.5 15h4.5" fill="none" stroke="COLOR" stroke-width="1.6" stroke-linecap="round"/>',
}

export const ring = (percent: number, color: string, icon: keyof typeof ICONS) => {
  const circumference = 2 * Math.PI * 10
  const filled = (Math.min(100, Math.max(0, percent)) / 100) * circumference
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24">` +
    `<circle cx="12" cy="12" r="10" fill="none" stroke="${TRACK}" stroke-width="2.4"/>` +
    `<circle cx="12" cy="12" r="10" fill="none" stroke="${color}" stroke-width="2.4" stroke-linecap="round" ` +
    `stroke-dasharray="${filled.toFixed(2)} ${circumference.toFixed(2)}" transform="rotate(-90 12 12)"/>` +
    ICONS[icon].replaceAll('COLOR', color) +
    `</svg>`
  )
}

const stats = atom({ plugin: 'usage-band', key: 'stats' } as const, {} as Stats)

// /usage-context: the window broken down as /context breaks it down
const CONTEXT_PANE = 'usage-band-context'
const contextPane = atom({ plugin: 'usage-band', key: 'contextPane' } as const, { breakdown: null, isLoading: false } as ContextPane)
const KIND_COLOR = { used: '#3b82f6', free: TRACK, buffer: '#a1a1aa', deferred: TRACK }
const BAR_WIDTH = 24

async function loadContextPane($: EngineInterface) {
  await update($, contextPane, p => ({ ...p, isLoading: true }))
  // full counts with the token-count API as /context does; on demand only
  const { breakdown: b } = (await $.session.usage({ breakdown: 'full' })).context
  const breakdown = b
    ? {
        categories: b.categories.map(({ name, tokens, isDeferred, kind }) => ({ name, tokens, isDeferred, kind })),
        totalTokens: b.totalTokens,
        rawMaxTokens: b.rawMaxTokens,
        percentage: b.percentage,
        autocompactSource: b.autocompactSource,
      }
    : null
  await update($, contextPane, () => ({ breakdown, isLoading: false }))
}

// /usage-demo: a pane whose buttons try out what a mod can do
const DEMO_PANE = 'usage-band-demo'
const DEMO_TABS_PANE = 'usage-band-demo-tab'
const DEMO_SUFFIX = ' · usage-band demo'
const DEMO_COLORS = [
  { value: GREEN, label: 'green' },
  { value: AMBER, label: 'amber' },
  { value: RED, label: 'red' },
]
const DEMO_DEFAULT: Demo = {
  spinner: false,
  tagTools: false,
  guard: false,
  context: false,
  status: false,
  ticking: false,
  ticks: 0,
  clicks: 0,
  color: GREEN,
  echo: '',
  output: [],
}
const demo = atom({ plugin: 'usage-band', key: 'demo' } as const, DEMO_DEFAULT)

// Lost on reload; session.start then resets demo.ticking to match
let demoTimer: Timer | undefined

async function say($: EngineInterface, line: string) {
  await update($, demo, d => ({ ...d, output: [...d.output, line].slice(-6) }))
}

async function toggle($: EngineInterface, key: 'spinner' | 'tagTools' | 'guard' | 'context') {
  await update($, demo, d => ({ ...d, [key]: !d[key] }))
  // Spinner and tool rows read the toggles at their own render sites
  $.ui.invalidate('ui.render')
}

async function toggleStatus($: EngineInterface) {
  const d = await update($, demo, d => ({ ...d, status: !d.status }))
  $.ui.status(d.status ? `usage-band demo · ${d.clicks} clicks` : undefined)
}

async function toggleTicks($: EngineInterface) {
  if (demoTimer) {
    demoTimer.cancel()
    demoTimer = undefined
    await update($, demo, d => ({ ...d, ticking: false }))
    return
  }
  await update($, demo, d => ({ ...d, ticking: true }))
  demoTimer = $.clock.every(1000, () => update($, demo, d => ({ ...d, ticks: d.ticks + 1 })))
}

async function askDemo($: EngineInterface) {
  try {
    const answer = await $.ui.ask('Which mod feature do you like best?', ['Panes', 'Guards', 'Prompt rewrites'])
    await say($, `ask: you picked ${answer}`)
  } catch {
    await say($, 'ask: dismissed')
  }
}

async function haiku($: EngineInterface) {
  await say($, 'model: asking Haiku...')
  const reply = await $.model.complete({
    model: 'haiku',
    system: 'Reply with a haiku and nothing else.',
    prompt: 'A haiku about a plugin that redraws its own editor.',
    maxTokens: 80,
    timeoutMs: 20_000,
  })
  await say($, reply.isAnswered ? `model: ${reply.text.trim().replaceAll('\n', ' / ')}` : `model: failed (${reply.reason})`)
}

async function forkSummary($: EngineInterface) {
  await say($, 'fork: reading this conversation...')
  const reply = await $.model.fork({ prompt: 'Summarise this conversation so far in one sentence.' })
  await say($, reply.isAnswered ? `fork: ${reply.text.trim()}` : `fork: failed (${reply.reason})`)
}

async function storeDemo($: EngineInterface) {
  const opened = Number((await $.store.get('demo-presses')) ?? 0) + 1
  await $.store.set('demo-presses', opened)
  await say($, `store: pressed ${opened} times across all sessions`)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    if (e.isInteractive) {
      // Keeps the reset countdowns current between measurements
      $.clock.every(TICK_MS, () => $.ui.invalidate('ui.render'))
      // A reload drops the demo timer, so its state must say it stopped
      await update($, demo, d => ({ ...d, ticking: false }))
    }
    // Registered for every session: desktop Code tab sessions start non-interactive.
    // Register commands last: a taken name throws and skips the rest of the hook
    await $.command.register({
      name: 'usage-context',
      description: 'Open a pane with the context window broken down by category',
      immediate: true,
    })
    await $.command.register({
      name: 'usage-demo',
      description: 'Open a pane that tries out what mods can do',
      immediate: true,
    })
    return next(e)
  })

  on('command.run', { command: 'usage-context' }, async $ => {
    await $.ui.open({ id: CONTEXT_PANE, title: 'Context window', focus: true, closeOnEscape: true })
    await loadContextPane($)
    return {}
  })

  // The effort the main loop asks for; the status line does not carry it
  on('turn.step', async function* ($, e, next) {
    if (e.agentId === undefined && e.effort !== undefined) {
      const effort = String(e.effort)
      if ((await read($, stats)).effort !== effort) await update($, stats, s => ({ ...s, effort }))
    }
    return yield* next(e)
  })

  // After each main-loop turn: the compaction window, the context the turn added, its cache share
  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    if (e.agentId !== undefined) return result
    const { context } = await $.session.usage({ breakdown: 'summary' })
    const raw = context.breakdown?.rawMaxTokens
    await update($, stats, s => ({
      ...s,
      compactWindow: raw !== undefined && raw < context.window ? raw : undefined,
      lastTokens: context.tokens ?? s.lastTokens,
      delta: context.tokens !== undefined && s.lastTokens !== undefined ? context.tokens - s.lastTokens : s.delta,
      cacheRate: e.usage ? cacheRate(e.usage) : s.cacheRate,
    }))
    return result
  })

  on('command.run', { command: 'usage-demo' }, async $ => {
    await $.ui.open({ id: DEMO_PANE, title: 'Mods demo', focus: true, closeOnEscape: true })
    return {}
  })

  // Demo guard: holds every Bash call for a yes/no while switched on
  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    if (!(await read($, demo)).guard) return next(e)
    let answer = 'Refuse'
    try {
      answer = await $.ui.ask(`usage-band demo guard: run \`${e.command}\`?`, ['Run it', 'Refuse'])
    } catch {
      // Dismissed, or nobody to ask
    }
    if (answer !== 'Run it') return { deny: 'The usage-band demo guard refused this command. Ask the user before retrying.' }
    return next(e)
  }).catch(async ($, e, next) => ({
    deny: `The usage-band demo guard failed (${next.error.kind}), so the command was not run.`,
  }))

  // Demo context: Claude reads it after the prompt; the transcript does not show it
  on('prompt.submit', async ($, e, next) => {
    if (!(await read($, demo)).context) return next(e)
    return next({
      ...e,
      context: [...(e.context ?? []), 'The usage-band demo is on: end your reply with the word "modded".'],
    })
  })

  on('ui.render', { component: 'Spinner' }, async ($, e, next) => {
    if (!(await read($, demo)).spinner) return next(e)
    return next({ ...e, props: { ...e.props, suffix: e.props.suffix + DEMO_SUFFIX } })
  })

  on('ui.render', { component: 'ToolUse' }, async ($, e, next) => {
    if (!(await read($, demo)).tagTools) return next(e)
    const { Box, Text } = $.ui.resolve(e)
    return (
      <Box flexDirection="row" columnGap={1}>
        <Text color={AMBER}>[demo]</Text>
        {await next(e)}
      </Box>
    )
  })

  on('ui.render', { component: 'Pane' }, async ($, e, next) => {
    if (e.requestId === CONTEXT_PANE) {
      const { breakdown, isLoading } = await read($, contextPane)
      const { Box, Text, Button } = $.ui.resolve(e)
      const refresh = (
        <Button key="refresh" label="r Refresh" hotkey="r" plain onPress={() => loadContextPane($)} />
      )
      if (breakdown === null) {
        return (
          <Box flexDirection="column" rowGap={1}>
            <Text dimColor>{isLoading ? 'Counting…' : 'No breakdown yet: the session has no conversation to measure.'}</Text>
            {refresh}
          </Box>
        )
      }
      const window = breakdown.rawMaxTokens
      const nameWidth = Math.max(...breakdown.categories.map(c => c.name.length))
      return (
        <Box flexDirection="column" rowGap={1}>
          <Text bold>{`${formatTokens(breakdown.totalTokens)} / ${formatTokens(window)} (${Math.round(breakdown.percentage)}%)`}</Text>
          <Text dimColor>{`Window from ${SOURCE_LABEL[breakdown.autocompactSource] ?? breakdown.autocompactSource}${isLoading ? ' · counting…' : ''}`}</Text>
          <Box flexDirection="column">
            {breakdown.categories.map(c => {
              const share = window === 0 ? 0 : (c.tokens / window) * 100
              const filled = c.isDeferred ? 0 : Math.round((Math.min(100, share) / 100) * BAR_WIDTH)
              return (
                <Box key={c.name} flexDirection="row" columnGap={1}>
                  <Text>{c.name.padEnd(nameWidth)}</Text>
                  <Text color={KIND_COLOR[c.kind]}>{'█'.repeat(filled) + '·'.repeat(BAR_WIDTH - filled)}</Text>
                  <Text>{formatTokens(c.tokens).padStart(5)}</Text>
                  <Text dimColor>{c.isDeferred ? 'loaded on demand' : `${share.toFixed(1)}%`}</Text>
                </Box>
              )
            })}
          </Box>
          {refresh}
        </Box>
      )
    }
    if (e.requestId === DEMO_TABS_PANE) {
      const { Box, Button, Markdown } = $.ui.resolve(e)
      return (
        <Box flexDirection="column" rowGap={1}>
          <Markdown text={'**A second pane.** Panes beyond the first become tabs: switch with `ctrl+x tab`.'} />
          <Button key="close" label="Close this pane (x)" hotkey="x" plain onPress={() => $.ui.close({ id: DEMO_TABS_PANE })} />
        </Box>
      )
    }
    if (e.requestId !== DEMO_PANE) return next(e)
    const d = await read($, demo)
    const els = $.ui.resolve(e)
    const { Box, Text, Button, Link, Code } = els
    const onOff = (isOn: boolean) => (isOn ? 'on' : 'off')
    const heading = (text: string) => (
      <Text key={`h-${text}`} bold>
        {text}
      </Text>
    )
    const percent = (d.clicks * 10) % 110
    return (
      <Box flexDirection="column" rowGap={1}>
        <Text dimColor>{`Drawn on ${e.surface}, placed ${e.props.placement}, ${e.props.bodyColumns} columns wide`}</Text>

        {heading('Notify')}
        <Box flexDirection="row" flexWrap="wrap" columnGap={2}>
          <Button key="toast" label="1 Toast" hotkey="1" plain onPress={() => $.ui.toast('Hello from usage-band')} />
          <Button key="log" label="2 Transcript note" hotkey="2" plain onPress={() => $.ui.log('usage-band demo: a dim line Claude does not read')} />
          <Button key="status" label={`3 Status line (${onOff(d.status)})`} hotkey="3" plain onPress={() => toggleStatus($)} />
        </Box>

        {heading('Ask and models')}
        <Box flexDirection="row" flexWrap="wrap" columnGap={2}>
          <Button key="ask" label="4 Ask me" hotkey="4" plain onPress={() => askDemo($)} />
          <Button key="haiku" label="5 Haiku via model.complete" hotkey="5" plain onPress={() => haiku($)} />
          <Button key="fork" label="6 Summarise via model.fork" hotkey="6" plain onPress={() => forkSummary($)} />
        </Box>

        {heading('Prompt')}
        <Box flexDirection="row" flexWrap="wrap" columnGap={2}>
          <Button key="fill" label="7 Fill the prompt box" hotkey="7" plain onPress={() => $.prompt.fill({ text: 'What can a Claude Code mod do?', mode: 'replace' })} />
          <Button key="submit" label="8 Start a turn" hotkey="8" plain onPress={() => $.prompt.submit({ text: 'In one sentence: what is a Claude Code mod?' })} />
          <Button key="context" label={`c Hidden context (${onOff(d.context)})`} hotkey="c" plain onPress={() => toggle($, 'context')} />
        </Box>

        {heading('Redraw Claude Code')}
        <Box flexDirection="row" flexWrap="wrap" columnGap={2}>
          <Button key="spinner" label={`s Spinner suffix (${onOff(d.spinner)})`} hotkey="s" plain onPress={() => toggle($, 'spinner')} />
          <Button key="tag" label={`t Tag tool rows (${onOff(d.tagTools)})`} hotkey="t" plain onPress={() => toggle($, 'tagTools')} />
          <Button key="guard" label={`g Ask before Bash (${onOff(d.guard)})`} hotkey="g" plain onPress={() => toggle($, 'guard')} />
        </Box>

        {heading('State and timers')}
        <Box flexDirection="row" flexWrap="wrap" columnGap={2}>
          <Button key="count" label={`9 $.state counter: ${d.clicks}`} hotkey="9" plain onPress={() => update($, demo, d => ({ ...d, clicks: d.clicks + 1 }))} />
          <Button key="tick" label={`k Clock timer: ${d.ticks}s (${onOff(d.ticking)})`} hotkey="k" plain onPress={() => toggleTicks($)} />
          <Button key="store" label="0 $.store, shared by sessions" hotkey="0" plain onPress={() => storeDemo($)} />
        </Box>

        {heading('Controls and elements')}
        {'Input' in els && (
          <els.Input key="echo" label="Input" placeholder="type and press Enter" onSubmit={(value: string) => update($, demo, d => ({ ...d, echo: value }))} />
        )}
        {d.echo !== '' && <Text>{`You typed: ${d.echo}`}</Text>}
        {'Select' in els && (
          <els.Select key="color" label="Select" options={DEMO_COLORS} value={d.color} onSelect={(value: string) => update($, demo, d => ({ ...d, color: value }))} />
        )}
        {e.surface !== 'terminal' && 'Svg' in els ? (
          <els.Svg source={ring(percent, d.color, 'clock')} alt={`Ring at ${percent}%`} width={48} />
        ) : (
          <Text color={d.color}>{`${glyph(percent)} ${percent}% (the desktop draws an SVG ring here)`}</Text>
        )}
        <Code language="ts" source={"on('tool.call', { tool: 'Bash' }, async ($, e, next) => next(e))"} />
        <Link href="https://code.claude.com/docs/en/plugins/mods/overview" label="Mods docs" />
        <Button key="tab" label="p Open a second pane (tabs)" hotkey="p" plain onPress={() => $.ui.open({ id: DEMO_TABS_PANE, title: 'Second pane' })} />

        {heading('Output')}
        {d.output.length === 0 ? <Text dimColor>Press a button.</Text> : d.output.map((line, i) => <Text key={`out-${i}`}>{line}</Text>)}
      </Box>
    )
  })

  on('session.measure', async ($, e, next) => {
    $.ui.invalidate('ui.render')
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)
    const usage = await $.session.usage()
    const limits: SessionRateLimit[] = usage.rateLimits
    const now = await $.clock.now()
    const model = await $.session.model()
    const els = $.ui.resolve(e)
    const { Box, Text } = els
    const icon = (svg: string, alt: string, fallback: string, color: string) =>
      e.surface !== 'terminal' && 'Svg' in els ? (
        <els.Svg key="icon" source={svg} alt={alt} width={18} />
      ) : (
        <Text key="icon" color={color}>
          {fallback}
        </Text>
      )

    const segments = limits.map(limit => {
      const color = limitColor(limit.percentUsed)
      const label = limitLabel(limit.kind)
      const reset = limit.resetsAt ? ` · resets ${formatReset(limit.resetsAt, now)}` : ''
      return (
        <Box key={limit.kind} flexDirection="row" alignItems="center" columnGap={1}>
          {icon(
            ring(limit.percentUsed, color, limit.kind === 'five_hour' ? 'clock' : 'calendar'),
            `${label} limit ${limit.percentUsed}% used`,
            glyph(limit.percentUsed),
            color,
          )}
          <Text bold>{`${Math.round(limit.percentUsed)}%`}</Text>
          <Text dimColor>{`${label}${reset}`}</Text>
        </Box>
      )
    })

    // tokens and percent are missing before the first response and after an Esc interrupt.
    // A compaction window smaller than the model's is where the session actually ends
    const s = await read($, stats)
    const { tokens } = usage.context
    const window = s.compactWindow ?? usage.context.window
    const percent =
      s.compactWindow !== undefined && tokens !== undefined ? (tokens / s.compactWindow) * 100 : usage.context.percent
    const fill = percent ?? 0
    const color = contextColor(fill)
    segments.push(
      <Box key="context" flexDirection="row" alignItems="center" columnGap={1}>
        {icon(ring(fill, color, 'context'), `Context ${Math.round(fill)}% full`, glyph(fill), color)}
        <Text bold>{percent === undefined ? '–' : `${Math.round(percent)}%`}</Text>
        <Text dimColor>{`ctx ${tokens === undefined ? '–' : formatTokens(tokens)} / ${formatTokens(window)}`}</Text>
        {s.delta !== undefined && <Text dimColor>{`· ${formatDelta(s.delta)} last turn`}</Text>}
        {s.cacheRate !== undefined && <Text dimColor>{`· cache ${s.cacheRate}%`}</Text>}
      </Box>,
    )

    const details = [
      s.effort === undefined ? undefined : `effort ${s.effort}`,
      `session ${formatAge(now - usage.startedAt)}`,
      usage.cost === undefined ? undefined : formatUsd(usage.cost.usd),
    ].filter(part => part !== undefined)
    segments.push(
      <Box key="session" flexDirection="row" alignItems="center" columnGap={1}>
        <Text>{modelLabel(model)}</Text>
        <Text dimColor>{`· ${details.join(' · ')}`}</Text>
      </Box>,
    )

    return (
      <Box flexDirection="column">
        <Box flexDirection="row" flexWrap="wrap" columnGap={4}>
          {segments}
        </Box>
        {await next(e)}
      </Box>
    )
  })
}
