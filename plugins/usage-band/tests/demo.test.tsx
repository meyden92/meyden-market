import type { ToolCallInput } from 'claude-code'
import { expect, test } from 'claude-code/testing'

const PANE = {
  plugin: 'usage-band',
  component: 'Pane',
  requestId: 'usage-band-demo',
  viewport: { columns: 120, rows: 220 },
  props: {
    title: 'Mods demo',
    isFocused: true,
    bodyColumns: 60,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 200 },
    view: {},
  },
} as const

test('/usage-demo opens the demo pane', async ($, on) => {
  const opened: string[] = []
  on('session.start', () => ({ cwd: '/work' }))
  on('command.register', () => ({ value: { command: 'usage-demo' } }))
  on('state.set', ($, e, next) => next(e))
  on('ui.open', ($, e) => (opened.push(e.id), { value: { isPlaced: true } }))
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  await $.command.run({
    command: 'usage-demo',
    args: '',
    origin: { kind: 'composer' },
    presentation: { isFullscreen: true, columns: 120 },
  })
  expect(opened).toEqual(['usage-band-demo'])
})

test('/usage-demo is registered in non-interactive sessions', async ($, on) => {
  const registered: string[] = []
  on('session.start', () => ({ cwd: '/work' }))
  on('command.register', ($, e) => (registered.push(e.name), { value: { command: e.name } }))
  await $.session.start({ surface: 'desktop', isInteractive: false, cwd: '/work' })
  expect(registered).toEqual(['usage-context', 'usage-demo'])
})

for (const surface of ['terminal', 'desktop'] as const) {
  test(`demo buttons toast and count on ${surface}`, async ($, on) => {
    const toasts: string[] = []
    on('ui.toast', ($, e) => (toasts.push(e.text), { value: undefined }))
    const ui = await $.ui.mount({ ...PANE, surface })
    await ui.press({ key: 'toast' })
    expect(toasts).toEqual(['Hello from usage-band'])
    await ui.press({ key: 'count' })
    await ui.press({ key: 'count' })
    expect(await ui.find({ key: 'count' })).toMatchObject({ props: { label: '9 $.state counter: 2' } })
    if (surface === 'desktop') expect(await ui.find({ type: 'Svg' })).toBeDefined()
    else expect(await ui.find({ type: 'Text', text: /desktop draws an SVG ring/ })).toBeDefined()
  })
}

const askingStub = (answer: string) => (_: unknown, e: ToolCallInput & { questions?: { question: string }[] }) =>
  e.tool === 'AskUserQuestion'
    ? { result: { answers: { [e.questions?.[0]?.question ?? '']: answer } } }
    : { result: 'ran' }

test('the demo guard refuses Bash unless the user allows it', async ($, on) => {
  on('tool.call', askingStub('Refuse'))
  expect(await $.tool.call({ tool: 'Bash', command: 'ls' })).toEqual({ result: 'ran' })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.press({ key: 'guard' })
  const refused = await $.tool.call({ tool: 'Bash', command: 'ls' })
  expect(refused.deny).toMatch(/demo guard refused/)
})

test('the demo guard runs Bash once allowed', async ($, on) => {
  on('tool.call', askingStub('Run it'))
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.press({ key: 'guard' })
  expect(await $.tool.call({ tool: 'Bash', command: 'ls' })).toEqual({ result: 'ran' })
})

test('hidden context is added to prompts only while switched on', async ($, on) => {
  const seen: (readonly string[] | undefined)[] = []
  on('prompt.submit', ($, e) => (seen.push(e.context), { text: e.text }))
  await $.prompt.submit({ text: 'hi', wait: false, origin: { kind: 'composer' } })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.press({ key: 'context' })
  await $.prompt.submit({ text: 'hi', wait: false, origin: { kind: 'composer' } })
  expect(seen[0] ?? []).toEqual([])
  expect(seen[1]).toEqual(['The usage-band demo is on: end your reply with the word "modded".'])
})

test('spinner suffix and tool tags follow their toggles', async ($, on) => {
  on('ui.render', ($, e) => ({
    type: 'Text',
    props: {},
    children: [e.component === 'Spinner' ? `suffix:${e.props.suffix}` : 'tool row'],
  }))
  const pane = await $.ui.mount({ ...PANE, surface: 'terminal' })
  const spinnerProps = { word: 'Working', message: null, suffix: '', mode: 'responding' } as const
  const toolProps = { tool_use_id: 't1', tool: 'Bash', input: {}, isRunning: false, isErrored: false, isInterrupted: false }

  let spinner = await $.ui.mount({ plugin: 'usage-band', surface: 'terminal', component: 'Spinner', props: spinnerProps })
  expect(await spinner.find({ type: 'Text', text: 'suffix:' })).toBeDefined()
  let tool = await $.ui.mount({ plugin: 'usage-band', surface: 'terminal', component: 'ToolUse', props: toolProps })
  expect(await tool.find({ type: 'Text', text: '[demo]' })).toBeUndefined()

  await pane.press({ key: 'spinner' })
  await pane.press({ key: 'tag' })
  spinner = await $.ui.mount({ plugin: 'usage-band', surface: 'terminal', component: 'Spinner', props: spinnerProps })
  expect(await spinner.find({ type: 'Text', text: 'suffix: · usage-band demo' })).toBeDefined()
  tool = await $.ui.mount({ plugin: 'usage-band', surface: 'terminal', component: 'ToolUse', props: toolProps })
  expect(await tool.find({ type: 'Text', text: '[demo]' })).toBeDefined()
  expect(await tool.find({ type: 'Text', text: 'tool row' })).toBeDefined()
})
