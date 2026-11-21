import { expect, mock, test } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'
import { expandArgv, fixPrompt, parseChecks, summary } from '../hooks/checks'
import { adrRows, epicOfBranch, issueContext, issueRows, mentionedIssues } from '../hooks/issues'

type On = Parameters<TestBody>[1]
type Run = { exitCode: number; stdout: string; stderr: string; isStdoutTruncated: boolean; isStderrTruncated: boolean }

const PROPS = {
  hasSurvey: false,
  isWorking: false,
  maxRows: 10,
  bodyColumns: 120,
  scroll: { offset: 0, bodyRows: 10 },
  view: {},
}
const BAND = { plugin: 'dev-workflow', component: 'AbovePrompt', props: PROPS } as const
const result = (exitCode: number, stdout: string): Run => ({ exitCode, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false })
const ok = (stdout: unknown = ''): Run => result(0, typeof stdout === 'string' ? stdout : JSON.stringify(stdout))

// Answers $.process.run from a table keyed by the joined argv; an unlisted command fails the test
const processes = (on: On, table: Record<string, Run | ((argv: readonly string[]) => Run)>, ran: string[] = []) => {
  on('process.run', ($, e) => {
    const key = e.argv.join(' ')
    ran.push(key)
    const answer = table[key]
    expect(answer).toBeDefined()
    return { value: typeof answer === 'function' ? answer(e.argv) : (answer ?? ok()) }
  })
  return ran
}

test('issue rows, ADR rows and mentions', () => {
  const issues = [
    { number: 7, title: 'Fix login', labels: ['bug'], epic: null },
    { number: 41, title: 'Order model', labels: [], epic: 40 },
    { number: 12, title: 'Order export', labels: ['Status: Todo'], epic: null },
  ]
  expect(issueRows(issues, '#', 40).map(row => row.text)).toEqual(['#41', '#12', '#7'])
  expect(issueRows(issues, '#ord', null).map(row => row.label)).toEqual(['#41 Order model', '#12 Order export'])
  expect(issueRows(issues, '#1', null)[0]).toEqual({ text: '#12', label: '#12 Order export', description: 'Status: Todo' })
  expect(adrRows(['0001-use-redis.md', '0002-drop-cache.md', 'README.txt'], 'adr/red', 'docs/adr')).toEqual([
    { text: '@docs/adr/0001-use-redis.md', label: '0001-use-redis', description: 'ADR' },
  ])
  expect(mentionedIssues('see #12 and (#7), not abc#5, again #12')).toEqual([12, 7])
  expect(epicOfBranch('epic/40-orders')).toBe(40)
  expect(epicOfBranch('main')).toBe(null)
  expect(issueContext({ number: 12, title: 'Export', state: 'OPEN', body: 'Body', labels: [] }, [{ number: 7, title: 'Login', state: 'open' }])).toBe(
    'Issue #12: Export (OPEN)\nBlocked by: #7 Login (open)\n\nBody',
  )
})

test('checks.json, file expansion and the fix prompt', () => {
  const checks = parseChecks('{"checks":[{"name":"types","run":["tsc"]},{"name":"tests","run":["vitest","related","{files}"]}]}')
  expect(checks.map(check => check.name)).toEqual(['types', 'tests'])
  expect(() => parseChecks('{"checks":[{"name":"x","run":[]}]}')).toThrow()
  expect(expandArgv(['vitest', 'related', '{files}'], ['a.ts', 'b.ts'])).toEqual(['vitest', 'related', 'a.ts', 'b.ts'])
  expect(expandArgv(['vitest', 'related', '{files}'], [])).toBe(null)
  const red = { ok: false, files: [], runs: [{ name: 'types', ok: true, output: '' }, { name: 'tests', ok: false, output: 'expected 2, got 3' }] }
  expect(summary(red)).toBe('✗ red: tests')
  expect(fixPrompt(red)).toContain('### tests\n```\nexpected 2, got 3\n```')
})

const startSession = (on: On) => {
  on('session.start', () => ({ cwd: '/work/repo' }))
  on('fs.list', () => ({ value: [] }))
}

test('a prompt naming an issue carries it as context once per session', async ($, on) => {
  const ran = processes(on, {
    'gh issue view 12 --json number,title,state,body,labels': ok({ number: 12, title: 'Export', state: 'OPEN', body: 'Export orders as CSV.', labels: [] }),
    'gh api repos/{owner}/{repo}/issues/12/dependencies/blocked_by': ok([{ number: 7, title: 'Login', state: 'closed' }]),
  })
  on('prompt.submit', ($, e) => ({ text: e.text, context: e.context }))
  const first = await $.prompt.submit({ text: 'work on #12', wait: false, origin: { kind: 'composer' } })
  expect(first).toMatchObject({ context: ['Issue #12: Export (OPEN)\nBlocked by: #7 Login (closed)\n\nExport orders as CSV.'] })
  const second = await $.prompt.submit({ text: 'and #12 again', wait: false, origin: { kind: 'composer' } })
  expect((second as { context?: unknown }).context).toBeUndefined()
  expect(ran.length).toBe(2)
})

test('# completes open issues loaded at session start', async ($, on) => {
  mock.clock(on, { now: 1_000 })
  mock.env(on, { TMPDIR: '/tmp' })
  mock.store(on, {})
  startSession(on)
  processes(on, {
    'gh issue list --state open --limit 300 --json number,title,labels': ok([{ number: 41, title: 'Order model', labels: [] }, { number: 7, title: 'Login', labels: [{ name: 'bug' }] }]),
    'git branch --show-current': ok('epic/40-orders\n'),
    'gh api repos/{owner}/{repo}/issues/40/sub_issues --paginate': ok([{ number: 41, title: 'Order model', state: 'open' }]),
  })
  on('prompt.autocomplete', () => ({ suggestions: [] }))
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work/repo' })
  // session.start loads the issues without waiting for them
  await new Promise(resolve => setTimeout(resolve, 0))
  // The kit raises prompt.autocomplete though the engine's own $ has no such call
  const rows = await ($.prompt as unknown as { autocomplete: (e: object) => Promise<{ suggestions: { label?: string; description?: string }[] }> }).autocomplete({ text: 'see #', cursor: 5, token: '#', start: 4 })
  expect(rows.suggestions.map(row => row.label)).toEqual(['#41 Order model', '#7 Login'])
  expect(rows.suggestions[0]?.description).toBe('epic #40')
})

test('red checks after an edit offer a fix round in the band', async ($, on) => {
  on('fs.exists', ($, e) => ({ value: e.path.endsWith('checks.json') }))
  on('fs.read', () => ({ value: '{"checks":[{"name":"tests","run":["npm","test","--","{files}"]}]}' }))
  processes(on, { 'npm test -- /work/repo/src/a.ts': result(1, 'expected 2, got 3') })
  on('tool.call', () => ({ result: 'ok' }))
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  on('turn.complete', () => ({ text: '' }))
  on('ui.status', () => ({ value: undefined }))
  const logs: string[] = []
  on('ui.log', ($, e) => {
    logs.push(e.text)
    return { value: undefined }
  })
  const sent: string[] = []
  on('prompt.submit', ($, e) => {
    sent.push(e.text)
    return { text: e.text }
  })
  on('ui.render', () => ({ type: 'Text', props: {}, children: ['drawn by Claude Code'] }))
  await $.turn.start({ turnId: 't1', text: 'change a' })
  await $.tool.call({ tool: 'Edit', file_path: '/work/repo/src/a.ts', old_string: 'a', new_string: 'b' })
  await $.turn.complete({ turnId: 't1', answer: 'Changed a.', durationMs: 1, isAborted: false, reason: 'answer' })
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: '✗ red: tests' })).toBeDefined()
  expect(logs).toEqual(['✗ red: tests'])
  await ui.press({ key: 'fix-send' })
  expect(sent.length).toBe(1)
  expect(sent[0]).toContain('expected 2, got 3')
  expect(await ui.find({ key: 'fix-send' })).toBeUndefined()
})
