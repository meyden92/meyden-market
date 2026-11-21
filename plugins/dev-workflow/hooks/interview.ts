import type { Question } from '../types'

// The block the interview skill ends a question reply with:
//   ❓ **<title>** · <n> open
//   1. <choice>
//   ➡️ <number> – <why>
const HEAD = /^❓\s*\*\*(.+?)\*\*(?:\s*·\s*(\d+)\s+open)?/u
const CHOICE = /^\s*(\d)\.\s+(.+?)\s*$/
const RECOMMENDED = /^\s*➡️?\s*(\d)\b/u

// The last question block in a reply, or null when the reply asks none with at least two choices
export const parseQuestion = (answer: string): Question | null => {
  const lines = answer.split('\n')
  const at = lines.findLastIndex(line => HEAD.test(line.trim()))
  const head = HEAD.exec(lines[at]?.trim() ?? '')
  if (head?.[1] === undefined) return null
  let choices: string[] = []
  let recommended: number | null = null
  for (const line of lines.slice(at + 1)) {
    const choice = CHOICE.exec(line)
    if (choice?.[2] !== undefined) {
      // A numbered list in the body comes before the choices; the last run counting up from 1 wins
      const n = Number(choice[1])
      if (n === 1) choices = [choice[2]]
      else if (n === choices.length + 1) choices.push(choice[2])
      continue
    }
    const pick = RECOMMENDED.exec(line)
    if (pick !== null) recommended = Number(pick[1])
  }
  if (choices.length < 2) return null
  return {
    title: head[1].trim(),
    open: head[2] === undefined ? null : Number(head[2]),
    choices,
    recommended: recommended !== null && recommended >= 1 && recommended <= choices.length ? recommended : null,
  }
}

// What the user sends for choice n: the digit and the choice, then their remark on its own line
export const answerText = (question: Question, n: number, remark = '') =>
  `${n} – ${question.choices[n - 1] ?? ''}${remark.trim() === '' ? '' : `\n${remark.trim()}`}`

// A typed reply of a digit, or a digit and a remark ("2 but without the cache"), as the full answer
export const typedAnswer = (question: Question, text: string): string | null => {
  const typed = /^\s*(\d)(?:\s*[-–:.,)]?\s+([\s\S]*))?\s*$/.exec(text)
  if (typed === null) return null
  const n = Number(typed[1])
  if (n < 1 || n > question.choices.length) return null
  return answerText(question, n, typed[2] ?? '')
}
