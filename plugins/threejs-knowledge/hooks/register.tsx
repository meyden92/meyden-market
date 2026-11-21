import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'
import type { Sample, Stats } from '../types'

const PANE = 'three-stats'
const LATEST = 'http://127.0.0.1:47186/latest'
// Budgets from the visual-qa skill; a value past its budget is drawn in the warning color
const BUDGET = { frameMs: 16.7, calls: 200, triangles: 1_000_000 }

const stats = atom({ plugin: 'threejs-knowledge', key: 'stats' } as const, { status: 'off', sample: null } as Stats)

async function poll($: EngineInterface) {
  const panes = await $.ui.panes()
  if (!panes.some(pane => pane.id === PANE && pane.isShown)) return
  let next: Stats = { status: 'off', sample: null }
  try {
    const response = await $.http.fetch(LATEST, {})
    if (response.ok) {
      const body = JSON.parse(response.text) as { live: boolean; sample: Sample | null }
      next = body.live ? { status: 'live', sample: body.sample } : { status: 'idle', sample: null }
    }
  } catch {
    // collector not running
  }
  await update($, stats, () => next)
}

async function startCollector($: EngineInterface) {
  try {
    await $.process.run(['python3', `${$.plugin.root}/bin/three-stats`, 'start'], { timeoutMs: 10_000 })
  } catch {
    // python3 missing or the port is taken; the pane says the collector is off
  }
}

function count(value: number) {
  return value >= 1_000_000 ? `${(value / 1_000_000).toFixed(2)}M` : value >= 10_000 ? `${Math.round(value / 1000)}k` : String(value)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    if (e.isInteractive) {
      $.clock.every(1000, () => {
        void poll($)
      })
      // Register commands last: a taken name throws and skips the rest of the hook
      await $.command.register({
        name: 'three-stats',
        description: 'Live frame stats of the running three.js page',
        immediate: true,
      })
    }
    return next(e)
  })

  on('command.run', { command: 'three-stats' }, async $ => {
    await startCollector($)
    await $.ui.open({ id: PANE, title: 'three.js frame stats', closeOnEscape: true })
    return {}
  })

  on('ui.render', { component: 'Pane' }, async ($, e, next) => {
    if (e.requestId !== PANE) return next(e)
    const { Box, Text } = $.ui.resolve(e)
    const { status, sample } = await read($, stats)
    if (status === 'off') {
      return (
        <Box flexDirection="column">
          <Text>Collector is not running.</Text>
          <Text dimColor>Run /three-stats again, or `three-stats start` in a terminal.</Text>
        </Box>
      )
    }
    if (status === 'idle' || !sample) {
      return (
        <Box flexDirection="column">
          <Text>No page is reporting.</Text>
          <Text dimColor>Attach the probe to the renderer (`three-stats snippet` prints the lines,</Text>
          <Text dimColor>or ask Claude to add it) and keep the page in a visible tab.</Text>
        </Box>
      )
    }
    const row = (label: string, value: string, isOver = false) => (
      <Box key={label} flexDirection="row" columnGap={1}>
        <Text dimColor>{label.padEnd(11)}</Text>
        <Text color={isOver ? 'warning' : undefined}>{value}</Text>
      </Box>
    )
    return (
      <Box flexDirection="column">
        {row('fps', String(sample.fps))}
        {row('frame', `${sample.frameMs} ms  (worst ${sample.worstFrameMs} ms)`, sample.frameMs > BUDGET.frameMs)}
        {row('draw calls', count(sample.calls), sample.calls > BUDGET.calls)}
        {row('triangles', count(sample.triangles), sample.triangles > BUDGET.triangles)}
        {row('geometries', count(sample.geometries))}
        {row('textures', count(sample.textures))}
        {sample.programs !== null && row('programs', String(sample.programs))}
        {row('canvas', `${sample.width}×${sample.height} @ ${sample.pixelRatio}x`)}
        {row('backend', sample.backend)}
        <Text dimColor>{sample.url}</Text>
      </Box>
    )
  })
}
