import type { Offer } from '../types'

// A handoff older than this is not offered to a new session
export const OFFER_MS = 24 * 60 * 60 * 1000

const SECRET_PATTERNS: RegExp[] = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
  /\b(?:sk|rk)-[A-Za-z0-9_-]{20,}/g,
  /\bgh[pousr]_[A-Za-z0-9]{30,}/g,
  /\bgithub_pat_[A-Za-z0-9_]{20,}/g,
  /\bAKIA[0-9A-Z]{16}\b/g,
  /\bxox[abprs]-[A-Za-z0-9-]{10,}/g,
  /\bAIza[0-9A-Za-z_-]{35}\b/g,
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g,
]
const ASSIGNED_SECRET = /\b(password|passwd|secret|token|api[_-]?key)(\s*[:=]\s*)(?!\[REDACTED\])[^\s`'",;]+/gi

export const redact = (text: string) => {
  let count = 0
  let out = text
  for (const pattern of SECRET_PATTERNS) {
    out = out.replace(pattern, () => {
      count += 1
      return '[REDACTED]'
    })
  }
  out = out.replace(ASSIGNED_SECRET, (_, key: string, sep: string) => {
    count += 1
    return `${key}${sep}[REDACTED]`
  })
  return { text: out, count }
}

export const handoffPrompt = (focus: string) =>
  [
    'Write a handoff document so a fresh agent can continue the work of this conversation.',
    'Reply with the document only, in Markdown, with no preamble.',
    '- State the goal, where the work stands, the decisions taken and why, open questions, and the next concrete steps.',
    '- Do not duplicate content already captured in other artifacts (specs, plans, ADRs, issues, commits, diffs). Reference them by path or URL.',
    '- End with a "## Suggested skills" section naming the skills the next agent should invoke.',
    '- Leave out sensitive information: API keys, passwords, tokens, personal data.',
    focus.trim() === '' ? '' : `The next session will focus on: ${focus.trim()}`,
  ]
    .filter(line => line !== '')
    .join('\n')

// The repo part of a handoff name: the working directory's last segment
export const repoName = (cwd: string) => (cwd.split(/[\\/]/).pop() ?? '').replace(/[^A-Za-z0-9_-]/g, '_') || 'session'

// handoff-<repo>-<UTC yyyymmdd-hhmmss>.md, the name the handoff skill writes too
export const handoffName = (repo: string, now: number) => {
  const stamp = new Date(now).toISOString().slice(0, 19).replace(/[-:]/g, '').replace('T', '-')
  return `handoff-${repo}-${stamp}.md`
}

export const joinPath = (dir: string, name: string) => `${dir.replace(/[\\/]+$/, '')}/${name}`

// The newest handoff of this repo written within OFFER_MS, unless it was already read or dismissed
export const newestHandoff = (
  entries: readonly { name: string; kind: string; mtimeMs: number }[],
  dir: string,
  repo: string,
  now: number,
  handled: string | undefined,
): Offer | null => {
  const pattern = new RegExp(`^handoff-${repo}-\\d{8}-\\d{6}\\.md$`)
  const newest = entries
    .filter(entry => entry.kind === 'file' && pattern.test(entry.name) && now - entry.mtimeMs < OFFER_MS)
    .sort((a, b) => b.mtimeMs - a.mtimeMs)[0]
  if (newest === undefined || newest.name === handled) return null
  return { repo, name: newest.name, path: joinPath(dir, newest.name), writtenAt: newest.mtimeMs }
}

export const formatAge = (ms: number) => {
  const minutes = Math.max(0, Math.round(ms / 60_000))
  return minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)} h ${minutes % 60} min`
}
