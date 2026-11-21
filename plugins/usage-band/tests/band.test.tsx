import type { SessionContextBreakdown } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'
import { cacheRate, formatDelta, formatReset, formatTokens, formatUsd, modelLabel } from '../hooks/register'

const NOW = Date.parse('2026-10-02T12:00:00')

const PROPS = {
  hasSurvey: false,
  isWorking: false,
  maxRows: 10,
  bodyColumns: 120,
  scroll: { offset: 0, bodyRows: 10 },
  view: {},
}

const USAGE = {
  startedAt: NOW - 72 * 60_000,
  context: { tokens: 84_000, window: 200_000, percent: 42 },
  rateLimits: [
    { kind: 'five_hour', percentUsed: 14, resetsAt: new Date(NOW + 67 * 60_000).toISOString() },
    { kind: 'seven_day', percentUsed: 83, resetsAt: new Date(NOW + 227 * 60_000).toISOString() },
  ],
}

for (const surface of ['terminal', 'desktop'] as const) {
  test(`draws limits, context and session on ${surface}`, async ($, on) => {
    mock.clock(on, { now: NOW })
    on('session.usage', () => ({ value: USAGE }))
    on('session.model', () => ({ value: 'claude-sonnet-5-5' }))
    on('ui.render', () => ({ type: 'Text', props: {}, children: ['drawn by Claude Code'] }))
    const ui = await $.ui.mount({ plugin: 'usage-band', surface, component: 'AbovePrompt', props: PROPS })
    expect(await ui.find({ type: 'Text', text: '14%' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: '5h · resets 1h7m' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: '83%' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: '7d · resets 3h47m' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: '42%' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: 'ctx 84k / 200k' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: 'Sonnet 5.5' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: '· session 1h12m' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: 'drawn by Claude Code' })).toBeDefined()
    if (surface === 'desktop') {
      expect(await ui.find({ type: 'Svg' })).toBeDefined()
    } else {
      // The terminal drops Svg, so its rings are glyphs
      expect(await ui.find({ type: 'Text', text: '◔' })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: '◕' })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: '◑' })).toBeDefined()
    }
  })

  test(`shows context without limits or a reading on ${surface}`, async ($, on) => {
    mock.clock(on, { now: NOW })
    on('session.usage', () => ({ value: { startedAt: NOW, context: { window: 200_000 }, rateLimits: [] } }))
    on('session.model', () => ({ value: 'claude-opus-5-5' }))
    on('ui.render', () => ({ type: 'Text', props: {}, children: ['drawn by Claude Code'] }))
    const ui = await $.ui.mount({ plugin: 'usage-band', surface, component: 'AbovePrompt', props: PROPS })
    expect(await ui.find({ type: 'Text', text: 'ctx – / 200k' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /resets/ })).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: 'Opus 5.5' })).toBeDefined()
  })

  test(`yields the band to a survey on ${surface}`, async ($, on) => {
    mock.clock(on, { now: NOW })
    on('session.usage', () => ({ value: USAGE }))
    on('session.model', () => ({ value: 'claude-sonnet-5-5' }))
    on('ui.render', () => ({ type: 'Text', props: {}, children: ['survey'] }))
    const ui = await $.ui.mount({
      plugin: 'usage-band',
      surface,
      component: 'AbovePrompt',
      props: { ...PROPS, hasSurvey: true },
    })
    expect(await ui.find({ type: 'Text', text: 'survey' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: '14%' })).toBeUndefined()
  })
}

test('formats resets, token counts and model ids', () => {
  expect(formatReset(new Date(NOW + (2 * 1440 + 3 * 60 + 5) * 60_000).toISOString(), NOW)).toBe('2d3h')
  expect(formatReset(new Date(NOW + 9 * 60_000).toISOString(), NOW)).toBe('9m')
  expect(formatTokens(950)).toBe('950')
  expect(formatTokens(1_000_000)).toBe('1M')
  expect(formatTokens(1_250_000)).toBe('1.3M')
  expect(modelLabel('claude-haiku-4-5-20251001')).toBe('Haiku 4.5')
  expect(modelLabel('custom-model')).toBe('custom-model')
  expect(formatDelta(-80_000)).toBe('−80k')
  expect(formatUsd(0.5)).toBe('$0.50')
  expect(cacheRate({ input_tokens: 0, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 })).toBeUndefined()
})

const BREAKDOWN: SessionContextBreakdown = {
  categories: [
    { name: 'System prompt', tokens: 20_000, color: 'promptBorder', isDeferred: false, kind: 'used' },
    { name: 'Messages', tokens: 163_000, color: 'permission', isDeferred: false, kind: 'used' },
    { name: 'Free space', tokens: 517_000, color: 'inactive', isDeferred: false, kind: 'free' },
  ],
  totalTokens: 183_000,
  maxTokens: 700_000,
  rawMaxTokens: 700_000,
  autocompactSource: 'settings',
  percentage: 26,
  gridRows: [],
  model: 'claude-opus-5-5',
  memoryFiles: [],
  mcpTools: [],
  agents: [],
  isAutoCompactEnabled: true,
  apiUsage: null,
}

const LIVE = {
  startedAt: NOW - 32 * 60_000,
  context: { tokens: 183_000, window: 1_000_000, percent: 18 },
  rateLimits: [],
  cost: { usd: 1.234 },
}

test('measures against a smaller compaction window and shows turn figures', async ($, on) => {
  mock.clock(on, { now: NOW })
  let tokens = 171_000
  on('session.usage', ($, e) => ({
    value: {
      ...LIVE,
      context: { ...LIVE.context, tokens, ...(e.breakdown ? { breakdown: BREAKDOWN } : {}) },
    },
  }))
  on('session.model', () => ({ value: 'claude-opus-5-5' }))
  on('turn.complete', () => ({ text: '' }))
  on('ui.render', () => ({ type: 'Text', props: {}, children: [''] }))
  const usage = { input_tokens: 2_000, output_tokens: 500, cache_read_input_tokens: 176_000, cache_creation_input_tokens: 2_000, model: 'claude-opus-5-5' }
  await $.turn.complete({ turnId: 't1', answer: 'a', durationMs: 1, isAborted: false, reason: 'answer', usage })
  tokens = 183_000
  await $.turn.complete({ turnId: 't2', answer: 'b', durationMs: 1, isAborted: false, reason: 'answer', usage })
  // A subagent's turn changes nothing
  tokens = 999_000
  await $.turn.complete({ turnId: 's1', agentId: 'a1', answer: 'c', durationMs: 1, isAborted: false, reason: 'answer' })
  tokens = 183_000
  const ui = await $.ui.mount({ plugin: 'usage-band', surface: 'terminal', component: 'AbovePrompt', props: PROPS })
  expect(await ui.find({ type: 'Text', text: 'ctx 183k / 700k' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '26%' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '· +12k last turn' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '· cache 98%' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '· session 32m · $1.23' })).toBeDefined()
})

test('keeps the model window when no smaller compaction window is set', async ($, on) => {
  mock.clock(on, { now: NOW })
  on('session.usage', ($, e) => ({
    value: {
      ...LIVE,
      context: { ...LIVE.context, ...(e.breakdown ? { breakdown: { ...BREAKDOWN, rawMaxTokens: 1_000_000, autocompactSource: 'auto' } } : {}) },
    },
  }))
  on('session.model', () => ({ value: 'claude-opus-5-5' }))
  on('turn.complete', () => ({ text: '' }))
  on('ui.render', () => ({ type: 'Text', props: {}, children: [''] }))
  await $.turn.complete({ turnId: 't1', answer: 'a', durationMs: 1, isAborted: false, reason: 'answer' })
  const ui = await $.ui.mount({ plugin: 'usage-band', surface: 'terminal', component: 'AbovePrompt', props: PROPS })
  expect(await ui.find({ type: 'Text', text: 'ctx 183k / 1M' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '18%' })).toBeDefined()
})

test('/usage-context lists the breakdown by category', async ($, on) => {
  on('session.usage', () => ({ value: { ...LIVE, context: { ...LIVE.context, breakdown: BREAKDOWN } } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  await $.command.run({
    command: 'usage-context',
    args: '',
    origin: { kind: 'composer' },
    presentation: { isFullscreen: true, columns: 120 },
  })
  const ui = await $.ui.mount({
    plugin: 'usage-band',
    surface: 'terminal',
    component: 'Pane',
    requestId: 'usage-band-context',
    viewport: { columns: 120, rows: 60 },
    props: { title: 'Context window', isFocused: true, bodyColumns: 80, placement: 'dock', scroll: { offset: 0, bodyRows: 50 }, view: {} },
  })
  expect(await ui.find({ type: 'Text', text: '183k / 700k (26%)' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'Window from settings' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'Messages     ' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '23.3%' })).toBeDefined()
})

test('shows the effort the main loop asks for', async ($, on) => {
  mock.clock(on, { now: NOW })
  on('session.usage', () => ({ value: LIVE }))
  on('session.model', () => ({ value: 'claude-opus-5-5' }))
  on('turn.step', async function* (_$, e) {
    return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: 'end_turn' as const, usage: null }
  })
  on('ui.render', () => ({ type: 'Text', props: {}, children: [''] }))
  for await (const _ of $.turn.step({ turnId: 't1', index: 0, model: 'claude-opus-5-5', effort: 'high', messageCount: 1 })) {
  }
  // A subagent's effort is not the session's
  for await (const _ of $.turn.step({ turnId: 's1', index: 0, model: 'claude-haiku-4-5', effort: 'low', messageCount: 1, agentId: 'a1' })) {
  }
  const ui = await $.ui.mount({ plugin: 'usage-band', surface: 'terminal', component: 'AbovePrompt', props: PROPS })
  expect(await ui.find({ type: 'Text', text: '· effort high · session 32m · $1.23' })).toBeDefined()
})
