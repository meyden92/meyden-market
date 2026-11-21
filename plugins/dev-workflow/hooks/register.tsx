import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'
import type { CheckResult, Offer, Question } from '../types'
import { CHECKS_PATH, fixPrompt, readChecks, runChecks, summary } from './checks'
import { formatAge, handoffName, handoffPrompt, joinPath, newestHandoff, redact, repoName } from './handoff'
import { answerText, parseQuestion, typedAnswer } from './interview'
import { CACHE_MS, adrRows, contextFor, issueRows, loadIssues } from './issues'
import type { IssueRow } from '../types'

const offer = atom({ plugin: 'dev-workflow', key: 'offer' } as const, null as Offer | null)
const question = atom({ plugin: 'dev-workflow', key: 'question' } as const, null as Question | null)
const checks = atom({ plugin: 'dev-workflow', key: 'checks' } as const, null as CheckResult | null)
const isChecking = atom({ plugin: 'dev-workflow', key: 'isChecking' } as const, false)

const EDIT_TOOLS = ['Edit', 'Write', 'NotebookEdit'] as const
const ADR_DIR = 'docs/adr'

const failed = (error: unknown) => (error instanceof Error ? error.message : String(error))

// Lost on reload, which costs a refetch or one more attached issue at most
let issues: IssueRow[] = []
let issuesAt = 0
let isLoadingIssues = false
const attached = new Set<number>()
const edited = new Set<string>()

async function tempDir($: EngineInterface) {
  return (await $.env.get('TMPDIR')) ?? (await $.env.get('TEMP')) ?? '/tmp'
}

// $.store 'handled': repo -> the name of the last handoff read or dismissed there
async function handledNames($: EngineInterface) {
  return ((await $.store.get('handled')) ?? {}) as Record<string, string>
}

async function findOffer($: EngineInterface, cwd: string) {
  const dir = await tempDir($)
  const repo = repoName(cwd)
  const found = newestHandoff(await $.fs.list(dir), dir, repo, await $.clock.now(), (await handledNames($))[repo])
  await update($, offer, () => found)
}

async function settleOffer($: EngineInterface, isRead: boolean) {
  const current = await read($, offer)
  if (current === null) return
  await $.store.set('handled', { ...(await handledNames($)), [current.repo]: current.name })
  await update($, offer, () => null)
  if (isRead) await $.prompt.submit({ text: `Read ${current.path} and continue the work it hands off.`, asUser: true })
}

async function writeHandoff($: EngineInterface, focus: string) {
  const reply = await $.model.fork({ prompt: handoffPrompt(focus) })
  if (!reply.isAnswered) return `No handoff before compaction: ${String(reply.reason)}`
  const path = joinPath(await tempDir($), handoffName(repoName(await $.session.cwd()), await $.clock.now()))
  await $.fs.write(path, redact(reply.text).text)
  return `Handoff written before compaction: ${path}`
}

async function answerQuestion($: EngineInterface, n: number) {
  const current = await read($, question)
  if (current === null) return
  await update($, question, () => null)
  await $.prompt.submit({ text: answerText(current, n), asUser: true })
}

async function refreshIssues($: EngineInterface) {
  if (isLoadingIssues) return
  isLoadingIssues = true
  try {
    issues = await loadIssues($)
    issuesAt = await $.clock.now()
  } catch (error) {
    $.ui.log(`dev-workflow: issue list not loaded: ${failed(error)}`, { to: 'debug' })
  } finally {
    isLoadingIssues = false
  }
}

async function adrFiles($: EngineInterface) {
  if (!(await $.fs.exists(ADR_DIR))) return []
  return (await $.fs.list(ADR_DIR)).filter(entry => entry.kind === 'file').map(entry => entry.name)
}

// After a main-conversation turn that edited files
async function checkEdits($: EngineInterface, files: readonly string[]) {
  const configured = await readChecks($).catch((error: unknown) => {
    $.ui.log(`dev-workflow: ${failed(error)}`)
    return null
  })
  if (configured === null || (await read($, isChecking))) return
  await update($, isChecking, () => true)
  $.ui.status('Checks running…')
  try {
    const result = await runChecks($, configured, files)
    $.ui.log(summary(result))
    await update($, checks, () => (result.ok ? null : result))
  } finally {
    $.ui.status(undefined)
    await update($, isChecking, () => false)
  }
}

async function pressFix($: EngineInterface, choice: 'send' | 'fill' | 'show' | 'ignore') {
  const result = await read($, checks)
  if (result === null) return
  if (choice === 'show') {
    await $.ui.open({ id: 'checks', title: 'Checks' })
    return
  }
  await update($, checks, () => null)
  if (choice === 'send') await $.prompt.submit({ text: fixPrompt(result), asUser: true })
  if (choice === 'fill') await $.prompt.fill({ text: fixPrompt(result) })
}

async function closeChecksPane($: EngineInterface) {
  await $.ui.close({ id: 'checks' })
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await findOffer($, e.cwd)
    if (e.isInteractive) void refreshIssues($)
    return next(e)
  })

  // /clear and /resume reset $.state without firing session.start
  on('classic.SessionStart', { source: ['clear', 'resume'] }, async ($, e, next) => {
    await findOffer($, e.cwd)
    return next(e)
  })

  on('session.compact', async ($, e, next) => {
    if (e.agentId === undefined && (e.trigger === 'manual' || e.trigger === 'auto')) {
      $.ui.log(await writeHandoff($, e.instructions ?? '').catch(error => `No handoff before compaction: ${failed(error)}`))
    }
    return next(e)
  })

  on('tool.call', { tool: EDIT_TOOLS }, async ($, e, next) => {
    const path = (e as { file_path?: unknown; notebook_path?: unknown }).file_path ?? (e as { notebook_path?: unknown }).notebook_path
    if (e.agentId === undefined && typeof path === 'string') edited.add(path)
    return next(e)
  })

  // A new main turn retires the question and starts a fresh set of edited files
  on('turn.start', async ($, e, next) => {
    if (e.agentId === undefined) {
      await update($, question, () => null)
      edited.clear()
    }
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId !== undefined || e.isAborted) return next(e)
    await update($, question, () => parseQuestion(e.answer))
    if (edited.size > 0) void checkEdits($, [...edited])
    return next(e)
  })

  on('prompt.submit', async ($, e, next) => {
    if (e.command !== undefined || e.isMeta || (e.origin.kind !== 'composer' && e.origin.kind !== 'bridge')) return next(e)
    // A digit typed as the answer, alone or followed by a remark, is sent as the full choice
    const asked = await read($, question)
    const answered = asked === null ? null : typedAnswer(asked, e.text)
    if (answered !== null) await update($, question, () => null)
    const text = answered ?? e.text
    // Each issue a prompt names reaches Claude once per session, with its blockers
    const blocks = await contextFor($, text, attached).catch((error: unknown) => {
      $.ui.log(`dev-workflow: issue context not attached: ${failed(error)}`, { to: 'debug' })
      return []
    })
    return next({ ...e, text, context: blocks.length === 0 ? e.context : [...(e.context ?? []), ...blocks] })
  })

  on('prompt.autocomplete', { token: /^#[^#\s]*$/ }, async ($, e, next) => {
    if ((await $.clock.now()) - issuesAt > CACHE_MS) void refreshIssues($)
    const rows = issueRows(issues, e.token, issues.find(issue => issue.epic !== null)?.epic ?? null)
    return { suggestions: [...(await next(e)).suggestions, ...rows] }
  })

  on('prompt.autocomplete', { token: /^@?(?:docs\/)?adr\//i }, async ($, e, next) => {
    return { suggestions: [...(await next(e)).suggestions, ...adrRows(await adrFiles($), e.token, ADR_DIR)] }
  })

  // The band: an open interview question first, then red checks, the handoff offer
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)
    const { Box, Text, Button } = $.ui.resolve(e)
    const asked = await read($, question)
    if (asked !== null && !e.props.isWorking) {
      return (
        <Box flexDirection="column">
          <Box flexDirection="row" columnGap={1}>
            <Box flexShrink={1} minWidth={0}>
              <Text weight="semibold" wrap="truncate-end">{`❓ ${asked.title}`}</Text>
            </Box>
            {asked.open === null ? null : <Text dimColor>{`· ${asked.open} open`}</Text>}
          </Box>
          {asked.choices.map((choice, i) => (
            <Button
              key={`choice-${i + 1}`}
              label={`${choice}${asked.recommended === i + 1 ? '  ★ recommended' : ''}`}
              hotkey={String(i + 1)}
              plain
              onPress={() => answerQuestion($, i + 1)}
            />
          ))}
          <Text dimColor>Digit answers · digit and text adds a remark · or answer in your own words</Text>
          {await next(e)}
        </Box>
      )
    }

    const red = await read($, checks)
    if (red !== null && !e.props.isWorking) {
      return (
        <Box flexDirection="column">
          <Text wrap="truncate-end">{summary(red)}</Text>
          <Box flexDirection="row" columnGap={2} flexWrap="wrap">
            <Button key="fix-send" label="Fix round" hotkey="1" plain onPress={() => pressFix($, 'send')} />
            <Button key="fix-fill" label="Edit fix prompt" hotkey="2" plain onPress={() => pressFix($, 'fill')} />
            <Button key="fix-show" label="Show output" hotkey="3" plain onPress={() => pressFix($, 'show')} />
            <Button key="fix-ignore" label="Ignore" hotkey="4" plain onPress={() => pressFix($, 'ignore')} />
          </Box>
          {await next(e)}
        </Box>
      )
    }

    const current = await read($, offer)
    if (current === null) return next(e)
    const age = formatAge((await $.clock.now()) - current.writtenAt)
    return (
      <Box flexDirection="column">
        <Box flexDirection="row" columnGap={2}>
          <Box flexShrink={1} minWidth={0}>
            <Text wrap="truncate-end">{`Handoff from ${age} ago: ${current.name}`}</Text>
          </Box>
          <Button key="read" label="Read" hotkey="1" plain onPress={() => settleOffer($, true)} />
          <Button key="dismiss" label="Dismiss" hotkey="2" plain onPress={() => settleOffer($, false)} />
        </Box>
        {await next(e)}
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: 'checks' }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const result = await read($, checks)
    if (result === null) return <Button key="checks-close" label="Close" onPress={() => closeChecksPane($)} />
    return (
      <Box flexDirection="column" rowGap={1}>
        <Text weight="semibold">{summary(result)}</Text>
        {result.runs.map(check => (
          <Text key={`run-${check.name}`} wrap="wrap" dimColor={check.ok}>{`${check.ok ? '✓' : '✗'} ${check.name}${check.ok ? '' : `\n${check.output}`}`}</Text>
        ))}
        <Text dimColor>{`Checks come from ${CHECKS_PATH}.`}</Text>
      </Box>
    )
  })
}
