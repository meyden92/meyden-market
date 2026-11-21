import type { EngineInterface } from 'claude-code'
import type { CheckResult, CheckRun } from '../types'

// Where the project keeps its checks, beside the other dev-workflow project rules
export const CHECKS_PATH = '.claude/skill-context/dev-workflow/checks.json'
const OUTPUT_TAIL = 80
const TIMEOUT_MS = 10 * 60 * 1000

export type Check = { name: string; run: string[] }

// checks.json: { "checks": [{ "name": "test", "run": ["npx", "vitest", "related", "--run", "{files}"] }] }
export const parseChecks = (text: string): Check[] => {
  const parsed = JSON.parse(text) as { checks?: unknown }
  if (!Array.isArray(parsed.checks)) throw new Error(`${CHECKS_PATH} has no "checks" list`)
  return parsed.checks.map((entry, i) => {
    const check = entry as { name?: unknown; run?: unknown }
    if (typeof check.name !== 'string' || !Array.isArray(check.run) || check.run.length === 0 || !check.run.every(arg => typeof arg === 'string')) {
      throw new Error(`${CHECKS_PATH}: check ${i + 1} needs a "name" and a non-empty "run" list of strings`)
    }
    return { name: check.name, run: check.run as string[] }
  })
}

// The argument vector with {files} replaced by the changed files; null when it needs files and there are none
export const expandArgv = (run: readonly string[], files: readonly string[]) => {
  if (!run.includes('{files}')) return [...run]
  return files.length === 0 ? null : run.flatMap(arg => (arg === '{files}' ? files : [arg]))
}

export const tail = (text: string, lines = OUTPUT_TAIL) => text.trimEnd().split('\n').slice(-lines).join('\n')

export const summary = (result: CheckResult) => {
  const red = result.runs.filter(run => !run.ok).map(run => run.name)
  return red.length === 0 ? `✓ checks green (${result.runs.map(run => run.name).join(', ')})` : `✗ red: ${red.join(', ')}`
}

// The fix round Claude gets: the red checks' output and the TDD rule that the change stays minimal
export const fixPrompt = (result: CheckResult) =>
  [
    'These checks are red after the last change:',
    '',
    ...result.runs.filter(run => !run.ok).flatMap(run => [`### ${run.name}`, '```', run.output, '```', '']),
    'Make them green with the smallest change. A red test is fixed in the code under test, not by weakening the test; if the test itself is wrong, say so and why before changing it.',
  ].join('\n')

export async function readChecks($: EngineInterface): Promise<Check[] | null> {
  if (!(await $.fs.exists(CHECKS_PATH))) return null
  return parseChecks(await $.fs.read(CHECKS_PATH))
}

// Runs every check in order; one that cannot start counts as red with the reason as its output
export async function runChecks($: EngineInterface, checks: readonly Check[], files: readonly string[]): Promise<CheckResult> {
  const runs: CheckRun[] = []
  for (const check of checks) {
    const argv = expandArgv(check.run, files)
    if (argv === null) continue
    const run = await $.process
      .run(argv, { timeoutMs: TIMEOUT_MS })
      .then(done => ({ ok: done.exitCode === 0, output: tail(`${done.stdout}\n${done.stderr}`) }))
      .catch((error: unknown) => ({ ok: false, output: error instanceof Error ? error.message : String(error) }))
    runs.push({ name: check.name, ...run })
  }
  return { ok: runs.every(run => run.ok), runs, files: [...files] }
}
