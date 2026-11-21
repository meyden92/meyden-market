// A handoff this session can pick up, shown in the band until it is read or dismissed
export type Offer = { repo: string; name: string; path: string; writtenAt: number }

// The interview question the last reply asked, shown in the band until it is answered
export type Question = { title: string; open: number | null; choices: string[]; recommended: number | null }

// An open issue as the `#` autocomplete lists it
export type IssueRow = { number: number; title: string; labels: string[]; epic: number | null }

// One check from checks.json and how its last run went
export type CheckRun = { name: string; ok: boolean; output: string }
export type CheckResult = { ok: boolean; runs: CheckRun[]; files: string[] }

declare module 'claude-code' {
  interface PluginState {
    'dev-workflow': {
      offer: Offer | null
      question: Question | null
      checks: CheckResult | null
      isChecking: boolean
    }
  }
}
