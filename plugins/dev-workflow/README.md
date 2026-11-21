# dev-workflow

Engineering workflow skills for senior engineers: plan through a structured interview, turn the plan into a spec, split the spec into tracer-bullet tickets on GitHub, implement each ticket test-first, and review on two independent axes.

Adapted from [Matt Pocock's skills](https://github.com/mattpocock/skills) (MIT). Changes from the original: the interview family is renamed (`grilling` → `interview`, `grill-with-docs` → `spec-planning`), the issue tracker is hardwired to GitHub (every tracker operation goes through the `github-flow:github` skill), triage and the productivity extras are dropped, and every skill loads project-specific rules at invocation time.

## The main flow

```
/dev-workflow:spec-planning   plan through a relentless interview; glossary + ADRs written as you go
/dev-workflow:to-spec         same conversation → spec, published as a GitHub issue
/dev-workflow:to-tickets      spec → tracer-bullet tickets with blocking edges
/dev-workflow:implement       a ticket, or a whole epic on its own branch: one subagent and one commit per ticket, review and pull request at the end
/dev-workflow:code-review     two-axis review: repo standards + spec fidelity
```

Bug fix or single small change? Skip the spec and the epic: `/dev-workflow:to-tickets` publishes one detailed ticket linked to the issue that prompted it, then `/dev-workflow:implement`.

## All skills

| Skill | What it does |
| :-- | :-- |
| `setup` | Run once per repo: records the GitHub tracker conventions and domain-doc layout under `docs/agents/` |
| `spec-planning` | Planning interview that maintains `CONTEXT.md` and `docs/adr/` as decisions resolve |
| `interview` | The interview primitive: one question at a time from the frontier, facts looked up, decisions asked; answer by digit (see [Mod](#mod)) |
| `domain-modeling` | Glossary (`CONTEXT.md`) and ADR discipline; files created lazily in the working repo |
| `codebase-design` | Shared vocabulary for deep modules: interface, depth, seam, adapter, leverage, locality |
| `to-spec` | Conversation → spec issue (labelled `ready-for-agent`), or a revision of the existing spec in place |
| `to-tickets` | Spec → vertical-slice tickets as native sub-issues with GitHub blocking links; reconciles with existing tickets (keep, revise, new, obsolete) on a re-plan |
| `implement` | Build one ticket, or run a whole epic without stopping between tickets: one implementer subagent and one `Refs #<n>` commit per ticket on `epic/<n>-<slug>`, then a review of the branch and a pull request |
| `tdd` | Rules of the red → green loop; tests only at pre-agreed seams |
| `code-review` | Standards axis (Fowler smell baseline, repo overrides) + Spec axis, in parallel sub-agents |
| `wayfinder` | Multi-session planning: a map issue with decision tickets, worked one per session |
| `prototype` | Throwaway logic/UI prototypes that answer one design question |
| `research` | Background agent reads primary sources, writes a cited markdown file |
| `improve-codebase-architecture` | Periodic scan for deepening opportunities, presented as an HTML report |
| `wizard` | Generates an interactive bash script walking a human through manual setup steps |
| `handoff` | Compacts the session into a document a fresh agent can continue from; the next session offers it (see [Mod](#mod)) |
| `session-start` | Opens a session: restores the clock, pulls, surfaces open issues, proposes a first task |
| `session-end` | Closes a session: lands the work, verifies the push actually landed, stops the clock |
| `retro` | Retrospective on a session: proposes environment improvements, preferring a deterministic check over a written rule |

`session-start` and `session-end` are deliberately thin. Their baseline is a
sensible minimum; the point is that each project, and each developer, bolts its
own opening and closing steps on through the project rules below.

## Per-repo setup

Run `/dev-workflow:setup` once per repo and again on a new machine. It first checks the session runs on Opus 5 or Fable 5 at high effort, then probes the machine (runtime, marketplace and plugin wiring, GitHub access, language servers) and offers the fixes in one prompt. It writes `docs/agents/issue-tracker.md` (all tracker operations go through the `github-flow:github` skill) and `docs/agents/domain.md`, audits the repo's status and `ready-for-agent` labels, adds an `## Agent skills` block to `CLAUDE.md`/`AGENTS.md`, and merges `autoMemoryEnabled: false` and blank `attribution` into `.claude/settings.json`. It closes with a status table, a readout of how you have been working, and the workflow handover.

`CONTEXT.md` (domain glossary) and `docs/adr/` (architecture decision records) are created lazily in the working repo: git-tracked, never scaffolded up front.

## Project rules

Every skill loads project-specific rules on each invocation, from four files in this order, each one able to override the ones before it:

```
<project>/.claude/skill-context/dev-workflow/CONTEXT.md              committed · all skills
<project>/.claude/skill-context/dev-workflow/<skill>/CONTEXT.md      committed · one skill
<project>/.claude/skill-context/dev-workflow/CONTEXT.local.md        personal  · all skills
<project>/.claude/skill-context/dev-workflow/<skill>/CONTEXT.local.md personal · one skill
```

Committed files come first, personal `*.local.md` files last: a rule you keep to yourself outranks one the repo shares. `/dev-workflow:setup` adds `.claude/skill-context/**/*.local.md` to the repo's `.gitignore` so the personal tier stays personal.

Project rules may add to or override the defaults a skill sets; they never authorise skipping a confirmation or publishing without user approval. Each file is size-capped at 8 KB. Keep them short.

## Mod

The plugin carries a hooks module (`hooks/register.tsx`) that runs inside Claude Code 2.1.287 or later.

**Handoff**

- Before every `/compact` and every automatic compaction of the main conversation it writes a handoff to `$TMPDIR/handoff-<repo>-<UTC time>.md`, through a model fork that adds nothing to the transcript. Values that look like keys, tokens, private keys and `password=` assignments are redacted; the redaction is pattern-based, so read a handoff before sharing it. A dim transcript line names the file.
- When a session starts, and after `/clear` or `/resume`, the band above the prompt offers the newest handoff of the same directory written in the last 24 hours, whether the mod or `/dev-workflow:handoff` wrote it. **1 Read** sends `Read <path> and continue the work it hands off.` as your prompt; **2 Dismiss** hides it. A handoff read or dismissed is not offered again (`$.store` key `handled`, one file name per repo).

The band draws in the terminal and the desktop Code tab. The compaction handoff also runs in `claude -p` and cloud sessions. On machines with managed settings or a Team or Enterprise login, the built-in guard skips a user-installed mod's `session.compact` and `classic.SessionStart` hooks, so there the handoff before compaction and the offer after `/clear` do not run.

**Interview answers**

- When the main conversation's last reply ends with an `interview` question (`❓ **<title>** · <n> open`, numbered choices, `➡️ <number> – <why>`), the band shows the title, how many decisions are still open, and one button per choice, the recommended one marked with ★.
- A digit typed into the empty prompt sends `<n> – <choice>` as your answer. A digit followed by text, such as `2 but with a 5 min TTL`, sends the choice with your remark on the next line. Any other reply is sent as typed.
- The band hides while Claude works and once the question is answered. While a question is open, the handoff offer stays hidden so the two do not share digit keys. A question without numbered choices gets no band.

**Issue and ADR autocomplete**

- `#` in the prompt lists the open issues by number and title, the current epic's tickets first when the branch is `epic/<n>-…`; `#ord` filters by title, `#4` by number. The list is loaded with `gh issue list` at session start and refreshed when it is older than five minutes.
- `adr/` lists the files in `docs/adr/` and writes the pick as an @-mention.
- Every `#<n>` in a prompt you send reaches Claude once per session as hidden context: the issue's title, state, labels, the issues blocking it and its body (8000 characters at most, five issues per prompt).

**Check loop**

- `.claude/skill-context/dev-workflow/checks.json` lists the project's checks; `/dev-workflow:setup` proposes it. Each `run` is an argument vector run without a shell, and a `{files}` argument expands to the changed files (a check holding it is skipped when none changed):

  ```json
  { "checks": [{ "name": "typecheck", "run": ["npx", "tsc", "--noEmit"] }, { "name": "tests", "run": ["npx", "vitest", "related", "--run", "{files}"] }] }
  ```

- After a main-conversation turn that edited files, the checks run in the background and a dim transcript line sums them up. When one is red, the band offers **1 Fix round** (sends the red output with the rule to fix the code with the smallest change, not the test), **2 Edit fix prompt** (puts it in the input box), **3 Show output** (Checks pane) and **4 Ignore**.

Tested with Claude Code 2.1.325. The module registers these hooks and makes these calls:

```
hooks: session.start, classic.SessionStart{source=clear|resume}, session.compact, tool.call{tool=Edit|Write|NotebookEdit}, turn.start, turn.complete, prompt.submit, prompt.autocomplete{token=/"^#[^#\\s]*$"/}, prompt.autocomplete{token=/"^@?(?:docs\\/)?adr\\/"/i}, ui.render{component=AbovePrompt}, ui.render{component=Pane, requestId=checks}
calls: $.clock.now, $.env.get (via tempDir), $.fs.exists (via adrFiles, readChecks), $.fs.list (via adrFiles, findOffer), $.fs.read (via readChecks), $.fs.write (via writeHandoff), $.model.fork (via writeHandoff), $.process.run (via currentBranch, ghJson, runChecks), $.prompt.fill (via pressFix), $.prompt.submit (via answerQuestion, pressFix, settleOffer), $.session.cwd (via writeHandoff), $.state.get, $.state.set, $.store.get (via handledNames), $.store.set (via settleOffer), $.ui.close (via closeChecksPane), $.ui.log, $.ui.open (via pressFix), $.ui.resolve, $.ui.status (via checkEdits)
env reads: TEMP, TMPDIR
```

No `userConfig`.

## Requirements

- [`gh`](https://cli.github.com/) CLI (2.94+), authenticated
- The `github-flow` plugin (same marketplace): its `github` skill enforces the organisation's issue lifecycle and carries all tracker operations. Required; it is a declared dependency of this plugin, so installing `dev-workflow` installs and enables it.
