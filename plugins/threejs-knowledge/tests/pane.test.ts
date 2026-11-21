import { expect, mock, test } from 'claude-code/testing'

const PANE = {
  plugin: 'threejs-knowledge',
  component: 'Pane',
  requestId: 'three-stats',
  viewport: { columns: 120, rows: 30 },
  props: {
    title: 'three.js frame stats',
    isFocused: true,
    bodyColumns: 50,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 20 },
    view: {},
  },
} as const

const SAMPLE = {
  url: 'http://localhost:5173/',
  fps: 60,
  frameMs: 21.4,
  worstFrameMs: 40.1,
  calls: 312,
  triangles: 1_530_000,
  geometries: 40,
  textures: 12,
  programs: 9,
  backend: 'webgl2',
  width: 1920,
  height: 1080,
  pixelRatio: 2,
}

test('says the collector is off before anything was polled', async $ => {
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect(await ui.find({ type: 'Text', text: 'Collector is not running.' })).toBeDefined()
    await ui.unmount()
  }
})

test('the command starts the collector and opens the pane', async ($, on) => {
  const ran: string[][] = []
  let opened = ''
  on('process.run', ($, e) => {
    ran.push([...e.argv])
    return { value: { exitCode: 0, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })
  on('ui.open', ($, e) => {
    opened = e.id
    return { value: { isPlaced: true } }
  })
  await $.command.run({
    command: 'three-stats',
    args: '',
    origin: { kind: 'composer' },
    presentation: { isFullscreen: true, columns: 120 },
  })
  expect(ran[0]?.[2]).toBe('start')
  expect(ran[0]?.[1]).toMatch(/bin\/three-stats$/)
  expect(opened).toBe('three-stats')
})

test('polls the collector while the pane is shown and draws the sample', async ($, on) => {
  const clock = mock.clock(on)
  let body = JSON.stringify({ live: true, sample: SAMPLE })
  on('command.register', () => ({ value: { command: 'three-stats' } }))
  on('session.start', () => ({ cwd: '/work' }))
  on('ui.panes', () => ({ value: [{ id: 'three-stats', title: '', isShown: true, isFocused: false, isPlaced: true }] }))
  on('http.fetch', () => ({ value: { status: 200, ok: true, headers: {}, text: body } }))
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  await clock.advance(1000)
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: '312' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '1.53M' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /21\.4 ms/ })).toBeDefined()
  await ui.unmount()

  body = JSON.stringify({ live: false, sample: SAMPLE })
  await clock.advance(1000)
  const idle = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await idle.find({ type: 'Text', text: 'No page is reporting.' })).toBeDefined()
})

test('does not poll while the pane is closed', async ($, on) => {
  const clock = mock.clock(on)
  let fetched = 0
  on('command.register', () => ({ value: { command: 'three-stats' } }))
  on('session.start', () => ({ cwd: '/work' }))
  on('ui.panes', () => ({ value: [] }))
  on('http.fetch', () => {
    fetched += 1
    return { value: { status: 200, ok: true, headers: {}, text: '{}' } }
  })
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  await clock.advance(3000)
  expect(fetched).toBe(0)
})
