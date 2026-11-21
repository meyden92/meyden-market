import { expect, test } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'
import { parseQuestion, typedAnswer } from '../hooks/interview'

const REPLY = [
  'The cache decides how the rest is built.',
  '',
  '❓ **Where does the cache live?** · 3 open',
  '',
  'Two steps matter here:',
  '1. reads stay local',
  '2. writes go through the API',
  '',
  '1. In memory per process',
  '2. Redis shared by all workers',
  '3. No cache for now',
  '',
  '➡️ 2 – the workers already share Redis',
].join('\n')

const ASKED = {
  title: 'Where does the cache live?',
  open: 3,
  choices: ['In memory per process', 'Redis shared by all workers', 'No cache for now'],
  recommended: 2,
}

const PROPS = {
  hasSurvey: false,
  isWorking: false,
  maxRows: 10,
  bodyColumns: 120,
  scroll: { offset: 0, bodyRows: 10 },
  view: {},
}
const BAND = { plugin: 'dev-workflow', component: 'AbovePrompt', props: PROPS } as const

test('parses the last question block and its choices', () => {
  expect(parseQuestion(REPLY)).toEqual(ASKED)
  expect(parseQuestion('❓ **Name?** · 0 open\n\n➡️ `orders`')).toBe(null)
  expect(parseQuestion('No question here.\n1. a\n2. b')).toBe(null)
  expect(parseQuestion('❓ **Pick** \n1. a\n2. b\n➡️ 7 – out of range')).toEqual({ title: 'Pick', open: null, choices: ['a', 'b'], recommended: null })
})

test('reads a typed digit, alone or with a remark', () => {
  expect(typedAnswer(ASKED, '2')).toBe('2 – Redis shared by all workers')
  expect(typedAnswer(ASKED, ' 3: but revisit after launch ')).toBe('3 – No cache for now\nbut revisit after launch')
  expect(typedAnswer(ASKED, '4')).toBe(null)
  expect(typedAnswer(ASKED, '22 workers is plenty')).toBe(null)
  expect(typedAnswer(ASKED, 'Redis, obviously')).toBe(null)
})

const reply = async ($: Parameters<TestBody>[0], answer: string) => {
  await $.turn.start({ turnId: 't1', text: 'next question' })
  await $.turn.complete({ turnId: 't1', answer, durationMs: 1, isAborted: false, reason: 'answer' })
}

for (const surface of ['terminal', 'desktop'] as const) {
  test(`offers each choice as a digit key on ${surface}`, async ($, on) => {
    on('turn.start', ($, e) => ({ turnId: e.turnId }))
    on('turn.complete', () => ({ text: '' }))
    on('ui.render', () => ({ type: 'Text', props: {}, children: ['drawn by Claude Code'] }))
    await reply($, REPLY)
    const ui = await $.ui.mount({ ...BAND, surface })
    expect(await ui.find({ type: 'Text', text: '❓ Where does the cache live?' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: '· 3 open' })).toBeDefined()
    expect((await ui.find({ key: 'choice-2' }))?.props).toMatchObject({ hotkey: '2', label: 'Redis shared by all workers  ★ recommended' })
    expect((await ui.find({ key: 'choice-3' }))?.props).toMatchObject({ hotkey: '3', label: 'No cache for now' })
    expect(await ui.find({ type: 'Text', text: 'drawn by Claude Code' })).toBeDefined()
  })
}

test('a pressed choice is sent as the user and retires the question', async ($, on) => {
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  on('turn.complete', () => ({ text: '' }))
  on('ui.render', () => ({ type: 'Text', props: {}, children: ['drawn by Claude Code'] }))
  const sent: string[] = []
  on('prompt.submit', ($, e) => {
    sent.push(e.text)
    return { text: e.text }
  })
  await reply($, REPLY)
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  await ui.press({ key: 'choice-1' })
  expect(sent).toEqual(['1 – In memory per process'])
  expect(await ui.find({ key: 'choice-1' })).toBeUndefined()
})

test('a typed digit and remark become the full answer', async ($, on) => {
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  on('turn.complete', () => ({ text: '' }))
  on('prompt.submit', ($, e) => ({ text: e.text }))
  await reply($, REPLY)
  const first = await $.prompt.submit({ text: '2 but with a 5 min TTL', wait: false, origin: { kind: 'composer' } })
  expect(first).toMatchObject({ text: '2 – Redis shared by all workers\nbut with a 5 min TTL' })
  // The question is answered: the next digit is plain text again
  const second = await $.prompt.submit({ text: '2', wait: false, origin: { kind: 'composer' } })
  expect(second).toMatchObject({ text: '2' })
})

test('hides while Claude works, for a survey, and after a reply without a question', async ($, on) => {
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  on('turn.complete', () => ({ text: '' }))
  on('ui.render', () => ({ type: 'Text', props: {}, children: ['drawn by Claude Code'] }))
  await reply($, REPLY)
  const working = await $.ui.mount({ ...BAND, surface: 'terminal', props: { ...PROPS, isWorking: true } })
  expect(await working.find({ key: 'choice-1' })).toBeUndefined()
  const survey = await $.ui.mount({ ...BAND, surface: 'terminal', props: { ...PROPS, hasSurvey: true } })
  expect(await survey.find({ key: 'choice-1' })).toBeUndefined()
  await reply($, 'Done, the spec is written.')
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await ui.find({ key: 'choice-1' })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: 'drawn by Claude Code' })).toBeDefined()
})

test('a subagent reply does not replace the question', async ($, on) => {
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  on('turn.complete', () => ({ text: '' }))
  on('ui.render', () => ({ type: 'Text', props: {}, children: ['drawn by Claude Code'] }))
  await reply($, REPLY)
  await $.turn.start({ turnId: 's1', text: 'look this up', agentId: 'a1' })
  await $.turn.complete({ turnId: 's1', answer: 'found it', durationMs: 1, isAborted: false, reason: 'answer', agentId: 'a1' })
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await ui.find({ key: 'choice-2' })).toBeDefined()
})

test('an answer in free text retires the question even when its turn is aborted', async ($, on) => {
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  on('turn.complete', () => ({ text: '' }))
  on('ui.render', () => ({ type: 'Text', props: {}, children: ['drawn by Claude Code'] }))
  await reply($, REPLY)
  await $.turn.start({ turnId: 't2', text: 'Redis, but ask ops first' })
  await $.turn.complete({ turnId: 't2', answer: '', durationMs: 1, isAborted: true, reason: 'aborted' })
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await ui.find({ key: 'choice-1' })).toBeUndefined()
})
