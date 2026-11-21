import type { EngineInterface, PromptAutocompleteSuggestion } from 'claude-code'
import type { IssueRow } from '../types'

const MAX_ROWS = 15
const MAX_CONTEXT = 8000
const MAX_ISSUES_PER_PROMPT = 5
export const CACHE_MS = 5 * 60 * 1000

type GhIssue = { number: number; title: string; state?: string; body?: string; labels?: { name: string }[] }

// The epic a branch belongs to: epic/<number>-<slug>
export const epicOfBranch = (branch: string) => {
  const match = /^epic\/(\d+)\b/.exec(branch.trim())
  return match?.[1] === undefined ? null : Number(match[1])
}

// Rows for a `#` token: the current epic's tickets first, then by number, matched on number or title
export const issueRows = (issues: readonly IssueRow[], token: string, epic: number | null): PromptAutocompleteSuggestion[] => {
  const query = token.slice(1).toLowerCase()
  return issues
    .filter(issue => query === '' || String(issue.number).startsWith(query) || issue.title.toLowerCase().includes(query))
    .sort((a, b) => Number(b.epic !== null && b.epic === epic) - Number(a.epic !== null && a.epic === epic) || b.number - a.number)
    .slice(0, MAX_ROWS)
    .map(issue => ({
      text: `#${issue.number}`,
      label: `#${issue.number} ${issue.title}`,
      description: [issue.epic === null ? '' : `epic #${issue.epic}`, ...issue.labels].filter(part => part !== '').join(' · '),
    }))
}

// Rows for an `adr/` token: the ADR files, written as @-mentions so Claude Code reads them
export const adrRows = (files: readonly string[], token: string, dir: string): PromptAutocompleteSuggestion[] => {
  const query = token.replace(/^@?(?:docs\/)?adr\/?/i, '').toLowerCase()
  return files
    .filter(name => name.endsWith('.md') && name.toLowerCase().includes(query))
    .sort()
    .slice(0, MAX_ROWS)
    .map(name => ({ text: `@${dir}/${name}`, label: name.replace(/\.md$/, ''), description: 'ADR' }))
}

// The issue numbers a prompt names, each once, in order
export const mentionedIssues = (text: string) => [...new Set([...text.matchAll(/(?:^|[\s(])#(\d+)\b/g)].map(match => Number(match[1])))]

// The context block Claude reads beside a prompt that names an issue
export const issueContext = (issue: GhIssue, blockedBy: readonly GhIssue[]) => {
  const blockers = blockedBy.map(blocker => `#${blocker.number} ${blocker.title} (${blocker.state ?? '?'})`).join(', ')
  const text = [
    `Issue #${issue.number}: ${issue.title} (${issue.state ?? '?'})`,
    issue.labels === undefined || issue.labels.length === 0 ? '' : `Labels: ${issue.labels.map(label => label.name).join(', ')}`,
    blockers === '' ? '' : `Blocked by: ${blockers}`,
    '',
    issue.body ?? '',
  ]
    .filter((line, i) => i >= 3 || line !== '')
    .join('\n')
  return text.length > MAX_CONTEXT ? `${text.slice(0, MAX_CONTEXT)}\n[cut at ${MAX_CONTEXT} characters]` : text
}

export async function ghJson($: EngineInterface, argv: readonly string[]): Promise<unknown> {
  const run = await $.process.run(['gh', ...argv], { timeoutMs: 30_000 })
  if (run.exitCode !== 0) throw new Error(run.stderr.trim() || `gh ${argv[0] ?? ''} exited ${run.exitCode}`)
  return JSON.parse(run.stdout)
}

export async function currentBranch($: EngineInterface) {
  const run = await $.process.run(['git', 'branch', '--show-current'])
  return run.exitCode === 0 ? run.stdout.trim() : ''
}

// The open issues, with the current epic's tickets marked
export async function loadIssues($: EngineInterface): Promise<IssueRow[]> {
  const listed = (await ghJson($, ['issue', 'list', '--state', 'open', '--limit', '300', '--json', 'number,title,labels'])) as GhIssue[]
  const epic = epicOfBranch(await currentBranch($))
  const tickets =
    epic === null ? new Set<number>() : new Set(((await ghJson($, ['api', `repos/{owner}/{repo}/issues/${epic}/sub_issues`, '--paginate'])) as GhIssue[]).map(t => t.number))
  return listed.map(issue => ({
    number: issue.number,
    title: issue.title,
    labels: (issue.labels ?? []).map(label => label.name),
    epic: tickets.has(issue.number) ? epic : null,
  }))
}

// The context blocks for the issues a prompt names, skipping those already attached this session
export async function contextFor($: EngineInterface, text: string, attached: Set<number>) {
  const blocks: string[] = []
  for (const number of mentionedIssues(text).filter(n => !attached.has(n)).slice(0, MAX_ISSUES_PER_PROMPT)) {
    const issue = (await ghJson($, ['issue', 'view', String(number), '--json', 'number,title,state,body,labels']).catch(() => null)) as GhIssue | null
    if (issue === null) continue
    const blockedBy = ((await ghJson($, ['api', `repos/{owner}/{repo}/issues/${number}/dependencies/blocked_by`]).catch(() => [])) ?? []) as GhIssue[]
    attached.add(number)
    blocks.push(issueContext(issue, blockedBy))
  }
  return blocks
}
