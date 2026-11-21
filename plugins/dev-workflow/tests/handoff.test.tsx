import { expect, mock, test } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'
import { handoffName, redact, repoName } from '../hooks/handoff'

const NOW = Date.parse('2026-11-06T12:34:56Z')
const HOUR = 60 * 60 * 1000
const USAGE = { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }
const MESSAGES = [{ role: 'user' as const, text: 'hi', toolUses: [] }]
const PROPS = {
  hasSurvey: false,
  isWorking: false,
  maxRows: 10,
  bodyColumns: 120,
  scroll: { offset: 0, bodyRows: 10 },
  view: {},
}
const BAND = { plugin: 'dev-workflow', component: 'AbovePrompt', props: PROPS } as const

const file = (name: string, ageMs: number) => ({ name, kind: 'file' as const, size: 1, mtimeMs: NOW - ageMs, isLink: false })

const ENTRIES = [
  file('handoff-repo-20261106-103456.md', 2 * HOUR),
  file('handoff-repo-20261106-083456.md', 4 * HOUR),
  file('handoff-repo-20261105-083456.md', 28 * HOUR),
  file('handoff-other-20261106-120000.md', 0),
  file('notes.md', 0),
]

test('repo names, handoff names and redaction', () => {
  expect(repoName('/work/my repo.x')).toBe('my_repo_x')
  expect(repoName('/')).toBe('session')
  expect(handoffName('repo', NOW)).toBe('handoff-repo-20261106-123456.md')
  const key = '-----BEGIN RSA PRIVATE KEY-----\nabc\n-----END RSA PRIVATE KEY-----'
  const { text, count } = redact(`AKIAABCDEFGHIJKLMNOP and ${key} and api_key: s3cr3t; the token flow is fine`)
  expect(text).toBe('[REDACTED] and [REDACTED] and api_key: [REDACTED]; the token flow is fine')
  expect(count).toBe(3)
})

for (const surface of ['terminal', 'desktop'] as const) {
  test(`offers the newest handoff of this repo on ${surface}`, async ($, on) => {
    mock.clock(on, { now: NOW })
    mock.env(on, { TMPDIR: '/tmp/x/' })
    mock.store(on, {})
    on('fs.list', ($, e) => {
      // The engine drops the trailing slash TMPDIR carries
      expect(e.path).toBe('/tmp/x')
      return { value: ENTRIES }
    })
    on('session.start', () => ({ cwd: '/work/repo' }))
    on('ui.render', () => ({ type: 'Text', props: {}, children: ['drawn by Claude Code'] }))
    await $.session.start({ surface, isInteractive: true, cwd: '/work/repo' })
    const ui = await $.ui.mount({ ...BAND, surface })
    expect(await ui.find({ type: 'Text', text: 'Handoff from 2 h 0 min ago: handoff-repo-20261106-103456.md' })).toBeDefined()
    expect(await ui.find({ key: 'read' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: 'drawn by Claude Code' })).toBeDefined()
  })
}

test('Read sends the handoff as a prompt and is not offered again', async ($, on) => {
  mock.clock(on, { now: NOW })
  mock.env(on, { TMPDIR: '/tmp/x' })
  const saved = new Map<string, unknown>()
  on('store.get', ($, e) => ({ value: saved.get(e.key) }))
  on('store.set', ($, e) => {
    saved.set(e.key, e.value)
    return { value: undefined }
  })
  on('fs.list', () => ({ value: ENTRIES }))
  on('session.start', () => ({ cwd: '/work/repo' }))
  const prompts: string[] = []
  on('prompt.submit', ($, e) => {
    prompts.push(e.text)
    return { text: e.text }
  })
  on('ui.render', () => ({ type: 'Text', props: {}, children: ['drawn by Claude Code'] }))
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work/repo' })
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  await ui.press({ key: 'read' })
  expect(prompts).toEqual(['Read /tmp/x/handoff-repo-20261106-103456.md and continue the work it hands off.'])
  expect(saved.get('handled')).toEqual({ repo: 'handoff-repo-20261106-103456.md' })
  expect(await ui.find({ type: 'Text', text: /Handoff from/ })).toBeUndefined()

  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work/repo' })
  expect(await ui.find({ type: 'Text', text: /Handoff from/ })).toBeUndefined()
})

test('Dismiss hides the handoff without a prompt', async ($, on) => {
  mock.clock(on, { now: NOW })
  mock.env(on, { TMPDIR: '/tmp/x' })
  const saved = new Map<string, unknown>([['handled', { other: 'handoff-other-20261106-120000.md' }]])
  on('store.get', ($, e) => ({ value: saved.get(e.key) }))
  on('store.set', ($, e) => {
    saved.set(e.key, e.value)
    return { value: undefined }
  })
  on('fs.list', () => ({ value: ENTRIES }))
  on('session.start', () => ({ cwd: '/work/repo' }))
  let submitted = 0
  on('prompt.submit', ($, e) => {
    submitted += 1
    return { text: e.text }
  })
  on('ui.render', () => ({ type: 'Text', props: {}, children: ['drawn by Claude Code'] }))
  await $.session.start({ surface: 'desktop', isInteractive: false, cwd: '/work/repo' })
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  await ui.press({ key: 'dismiss' })
  expect(submitted).toBe(0)
  expect(saved.get('handled')).toEqual({ other: 'handoff-other-20261106-120000.md', repo: 'handoff-repo-20261106-103456.md' })
  expect(await ui.find({ type: 'Text', text: /Handoff from/ })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: 'drawn by Claude Code' })).toBeDefined()
})

test('offers nothing when no handoff of this repo is recent', async ($, on) => {
  mock.clock(on, { now: NOW })
  mock.env(on, { TMPDIR: '/tmp/x' })
  mock.store(on, {})
  on('fs.list', () => ({ value: ENTRIES.slice(2) }))
  on('session.start', () => ({ cwd: '/work/repo' }))
  on('ui.render', () => ({ type: 'Text', props: {}, children: ['drawn by Claude Code'] }))
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work/repo' })
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /Handoff from/ })).toBeUndefined()
})

test('/clear offers a handoff written just before it', async ($, on) => {
  mock.clock(on, { now: NOW })
  mock.env(on, { TMPDIR: '/tmp/x' })
  mock.store(on, {})
  on('fs.list', () => ({ value: [file('handoff-repo-20261106-123400.md', 60_000)] }))
  on('classic.SessionStart', () => ({}))
  on('ui.render', () => ({ type: 'Text', props: {}, children: ['drawn by Claude Code'] }))
  await $.classic.SessionStart({ source: 'clear', cwd: '/work/repo' })
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: 'Handoff from 1 min ago: handoff-repo-20261106-123400.md' })).toBeDefined()
})

const forking = (on: Parameters<TestBody>[1], written: Map<string, string>, logs: string[]) => {
  mock.clock(on, { now: NOW })
  mock.env(on, { TMPDIR: '/tmp/x/' })
  on('model.fork', () => ({ value: { isAnswered: true, text: '# Handoff\npassword=hunter2\n', usage: USAGE } }))
  on('session.cwd', () => ({ value: '/work/repo' }))
  on('fs.write', ($, e) => {
    written.set(e.path, e.text)
    return { value: undefined }
  })
  on('ui.log', ($, e) => {
    logs.push(e.text)
    return { value: undefined }
  })
}

for (const trigger of ['auto', 'manual'] as const) {
  test(`${trigger} compaction writes a redacted handoff before it runs`, async ($, on) => {
    const written = new Map<string, string>()
    const logs: string[] = []
    forking(on, written, logs)
    let compacted = 0
    on('session.compact', () => {
      compacted += 1
      expect(written.size).toBe(1)
      return { messages: MESSAGES }
    })
    await $.session.compact({ trigger, messages: MESSAGES })
    expect(compacted).toBe(1)
    expect(written.get('/tmp/x/handoff-repo-20261106-123456.md')).toBe('# Handoff\npassword=[REDACTED]\n')
    expect(logs).toEqual(['Handoff written before compaction: /tmp/x/handoff-repo-20261106-123456.md'])
  })
}

test('a fork that does not answer is logged and compaction still runs', async ($, on) => {
  const logs: string[] = []
  on('model.fork', () => ({ value: { isAnswered: false, reason: 'nothing-to-fork' } }))
  on('ui.log', ($, e) => {
    logs.push(e.text)
    return { value: undefined }
  })
  let compacted = 0
  on('session.compact', () => {
    compacted += 1
    return { messages: MESSAGES }
  })
  await $.session.compact({ trigger: 'auto', messages: MESSAGES })
  expect(compacted).toBe(1)
  expect(logs).toEqual(['No handoff before compaction: nothing-to-fork'])
})

test('a precompute or a subagent compaction writes no handoff', async ($, on) => {
  const written = new Map<string, string>()
  forking(on, written, [])
  on('session.compact', () => ({ messages: MESSAGES }))
  await $.session.compact({ trigger: 'precompute', messages: MESSAGES })
  await $.session.compact({ trigger: 'auto', agentId: 'a1', messages: MESSAGES })
  expect(written.size).toBe(0)
})

test('yields the band to a survey', async ($, on) => {
  mock.clock(on, { now: NOW })
  mock.env(on, { TMPDIR: '/tmp/x' })
  mock.store(on, {})
  on('fs.list', () => ({ value: ENTRIES }))
  on('session.start', () => ({ cwd: '/work/repo' }))
  on('ui.render', () => ({ type: 'Text', props: {}, children: ['survey'] }))
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work/repo' })
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal', props: { ...PROPS, hasSurvey: true } })
  expect(await ui.find({ type: 'Text', text: 'survey' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /Handoff from/ })).toBeUndefined()
})
