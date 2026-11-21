export type Demo = {
  spinner: boolean
  tagTools: boolean
  guard: boolean
  context: boolean
  status: boolean
  ticking: boolean
  ticks: number
  clicks: number
  color: string
  echo: string
  output: string[]
}

// Figures the band keeps between turns; the status line has none of them
export type Stats = {
  // The compaction window when it is smaller than the model's, from the context breakdown
  compactWindow?: number
  effort?: string
  // Context tokens at the end of the last main-loop turn, and the change from the one before
  lastTokens?: number
  delta?: number
  // Share of the last turn's input tokens the prompt cache served, 0 to 100
  cacheRate?: number
}

// The part of the context breakdown the pane draws
export type Breakdown = {
  categories: { name: string; tokens: number; isDeferred: boolean; kind: 'used' | 'free' | 'buffer' | 'deferred' }[]
  totalTokens: number
  rawMaxTokens: number
  percentage: number
  autocompactSource: string
}

export type ContextPane = {
  breakdown: Breakdown | null
  isLoading: boolean
}

declare module 'claude-code' {
  interface PluginState {
    'usage-band': { demo: Demo; stats: Stats; contextPane: ContextPane }
  }
}
