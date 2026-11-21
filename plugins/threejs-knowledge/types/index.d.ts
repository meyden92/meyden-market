// One sample from the frame-stats probe (scripts/probe.js)
export type Sample = {
  url: string
  fps: number
  frameMs: number
  worstFrameMs: number
  calls: number
  triangles: number
  geometries: number
  textures: number
  programs: number | null
  backend: string
  width: number | null
  height: number | null
  pixelRatio: number | null
}

export type Stats = {
  // 'off': collector not running; 'idle': running, no page reporting; 'live': a page reports
  status: 'off' | 'idle' | 'live'
  sample: Sample | null
}

declare module 'claude-code' {
  interface PluginState {
    'threejs-knowledge': { stats: Stats }
  }
}
