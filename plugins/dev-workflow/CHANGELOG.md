# Changelog

## 0.14.0

Ported from upstream `mattpocock/skills` 1.3.2 and later.

- **`wizard` template fixes.** `write_env` single-quotes values so spaces, `#`, `$` and quotes
  survive `source`, writes through a symlinked `.env`, keeps an existing file's mode and creates a
  new one with mode 600; `_existing` strips the quotes again, so Enter-keeps-current no longer
  stores them. `ask` uses Readline (arrow keys work), `ask` and `ask_secret` fail at EOF instead
  of looping, `_clear` falls back to ANSI when `tput clear` fails, and stages run inside
  `run_wizard`, so editing the script mid-run can't break it.
- **`tdd`** gives each proposed seam a one-line note on what it catches and what it misses.
- **`code-review`** searches the repo for standards files and always includes `CODING_STANDARDS.md`
  and `CONTRIBUTING.md` when they exist; both sub-agents run in the foreground.
- **`wayfinder`** writes cross-references only with real issue ids and opens no PR for research
  branches.
- **Subagents start with a fresh context window** instead of a fork of the conversation, in
  `code-review`, `codebase-design`, `implement`, `improve-codebase-architecture`, `interview`,
  `research` and `wayfinder`.

## 0.13.0

- **`implement` walks an epic on its own again; the epic autopilot is gone.** For a spec with
  tickets, Claude creates or reuses `epic/<n>-<slug>` from the remote's default branch, runs one
  implementer subagent per frontier ticket (one commit ending `Refs #<n>` each), confirms the
  commit and the tests after each, then reviews the whole branch with `code-review`, has the
  findings fixed in one subagent, and pushes and opens a pull request through `github-flow:github`
  without merging. It asks only when blocked. Tickets with a `Refs #<n>` commit on the branch count
  as done, and uncommitted changes on the branch are continued by the next ticket's implementer.
- **Removed** the `mcp__dev-workflow__epic_start` tool, the `dev-workflow:ticket-implementer` agent
  type, the epic checkpoints in the band and the Epic pane. In the first real run, "Commit" and
  "Have findings fixed" could not reach the finished worker (its type was hidden through
  `agent.offer`, which also refuses the resume), the review counted as done when the main turn
  ended while its reviewers still ran in the background, and the start failed in repositories
  without a local `origin/HEAD`.

## 0.12.0

- **Renamed from `engineering`.** Skills are now invoked as `/dev-workflow:<skill>`, the epic
  tool is `mcp__dev-workflow__epic_start`, and project rules and `checks.json` are read from
  `.claude/skill-context/dev-workflow/` instead of `.claude/skill-context/engineering/`.
- **Depends on `github-flow`** instead of `tools`, which was split. Every tracker operation goes
  through `github-flow:github`; the scripts it calls are `meyden-gh <verb>`.
- **`spec-planning` checks the setup first.** It stops and asks for `/dev-workflow:setup` when
  `docs/agents/issue-tracker.md` is missing or still names `tools:github`, and asks for an old
  `.claude/skill-context/engineering/` to be renamed.

## 0.11.0

- **Interview answers by digit.** `interview` (and `spec-planning` through it) ends every
  question with a fixed block: `❓ **<title>** · <n> open`, the choices as a numbered list, and
  `➡️ <number> – <why>`. The mod reads that block from the main conversation's last reply and
  shows the question in the band above the prompt with one button per choice, the recommended one
  marked. A digit in the empty prompt sends `<n> – <choice>` as your answer; a digit followed by
  text (`2 but with a 5 min TTL`) sends the choice with your remark on its own line; anything else
  is sent as typed. The band goes away once the question is answered and while Claude works, and
  the handoff offer stays hidden while a question is open so the two do not share digit keys.
- **`#` and `adr/` autocomplete.** Typing `#` lists the open issues (loaded with `gh` at session
  start and refreshed after five minutes), the current epic's tickets first when the branch is
  `epic/<n>-…`. Typing `adr/` lists the files in `docs/adr/` as @-mentions. Every `#<n>` in a
  prompt reaches Claude once per session as context: the issue's title, state, labels, blockers
  and body, up to 8000 characters each and five issues per prompt.
- **Check loop.** After a main-conversation turn that edited files, the mod runs the checks in
  `.claude/skill-context/engineering/checks.json` (argument vectors without a shell, `{files}`
  expands to the edited files) and writes a dim summary line. Red checks put four keys in the
  band: a TDD-framed fix round, the fix prompt in the input box to edit first, the output in a
  pane, or ignore. Nothing runs without a press. `setup` proposes and writes `checks.json`.
- **Epic autopilot.** `implement` for a spec with tickets calls the mod's `epic_start` tool
  instead of walking the epic itself. After a confirmation it checks out `epic/<n>-<slug>` from
  the default branch and opens an Epic pane with every ticket and its state. Tickets run one
  after another; before each one the band offers Start, Skip, Do it myself or Pause (step mode,
  the default; run mode skips this question, key 0 switches). A hidden
  `engineering:ticket-implementer` subagent builds the ticket test-first without committing;
  the pane's View opens its transcript in the main view, where you can write to it. The mod
  runs the checks, then asks the main conversation for an `engineering:code-review` of the
  uncommitted changes. You commit (the worker lands one commit ending `Refs #<n>`, the mod
  comments the sha on the issue), send the findings back, or view the worker. When every ticket
  is landed or skipped, the band offers a PR from the epic branch (through `tools:github`, never
  merged), a review of the whole branch, or closing the autopilot. The run is kept per
  repository in `$.store`, so `/engineering:implement <epic>` after a restart picks it up and
  counts tickets with a `Refs #<n>` commit as done. Ticket status labels are set by the worker
  through `tools:github`.

## 0.10.0

- **Handoff mod.** The plugin now carries a hooks module (Claude Code 2.1.287 or later). Before
  every manual or automatic compaction it writes a redacted handoff to
  `$TMPDIR/handoff-<repo>-<UTC time>.md` through a model fork. When a session starts, and after
  `/clear` or `/resume`, the band above the prompt offers the newest handoff of the same
  directory from the last 24 hours with Read (sends it as the prompt) and Dismiss.
- **`handoff` writes to a fixed path**, `$TMPDIR/handoff-<repo>-<UTC time>.md`, so the next
  session offers it.
- Replaces the `engineering-mods` plugin, which is removed from the marketplace. Its push guards,
  git status line, epic pane, `/handoff-now`, hygiene nudges and structural guards are gone.
  Uninstall it with `claude plugin uninstall engineering-mods@meyden`.

## 0.9.0

- **`implement` walks an epic's task graph.** A single ticket is built in the conversation. A
  spec with tickets is read as a graph: the frontier is the tickets whose blockers are all done,
  each frontier ticket goes to one fresh implementer subagent, one after another on the current
  branch (no worktrees), one commit per ticket. On GitHub the graph is the epic's native
  sub-issues plus each ticket's `blocked_by` links (`meyden github graph`). An optional
  exploration subagent writes notes outside the repo for the implementers. `engineering:code-review`
  runs once at the end through the Skill tool, and the skill closes on a Done when.
- **`interview` asks one question at a time.** The most load-bearing question on the frontier,
  then a recomputed frontier after every answer, with no cap on the number of questions. A batch
  went stale whenever one answer made the rest of it moot. The `Q1`/`Q2` numbering and the `---`
  separators are gone.
- **`to-tickets` takes stock of the tracker before drafting.** An inventory of the existing
  tickets for the work, every slice mapped to keep #n, revise #n or new, and open tickets no
  slice maps to flagged obsolete. The quiz shows each ticket's status and the obsolete tickets
  with a proposed fate. Publishing edits revised tickets in place with a change note and closes
  obsolete ones only with the user's approval, so a re-plan no longer publishes a second set
  beside the first. A lone bug or small change becomes one ticket that mentions the issue that
  prompted it, with no epic. The survey stays mandatory.
- **Ticket anatomy** is `## TL;DR`, `## Problem`, `## Solution plan` (numbered steps, each saying
  whether it extends something existing or adds something new, with the prior art named) and
  `## Acceptance criteria`, matching what `tools:github` now requires. Dependencies are native
  GitHub links, never a body section.
- **`to-spec` revises in place.** It checks whether the work already has a spec or `[Epic]` issue
  and, when it does, rewrites that body and adds a change note instead of opening a second
  issue. Native sub-issues stay attached.
- **`spec-planning`** runs the interview with the domain-modeling discipline active throughout,
  and closes with a "When the interview converges" section: propose `to-spec`, then `to-tickets`,
  never straight to tickets. A bug or small change goes to `to-tickets` directly. Both are
  user-invoked, so the skill tells the user to run them.
- **`retro`** lists the skill-context lever (`.claude/skill-context/engineering/[<skill>/]CONTEXT.md`),
  names the transcript location (`~/.claude/projects/<project-slug>/*.jsonl`), and loads the
  writing guide only if `extension-dev:writing-for-agents` is installed.
- **`writing-for-agents` moves to `extension-dev`** as `extension-dev:writing-for-agents`. It is
  removed from this plugin, and the `retro` references point at the new name.
- No em-dashes in prose: removed from the README, this changelog, `show-me`, `wizard/template.sh`
  and `scripts/lib/context.sh`, rewritten rather than substituted.
- The plugin declares `tools` in `dependencies`, so installing `engineering` installs and enables
  it. The description and keywords gain the onboarding preflight.
- `setup` is now an onboarding preflight. It refuses to run below Opus 5 or Fable 5 at high
  effort, then probes the machine (python3, git, bash, Claude Code and `meyden` marketplace
  wiring with `tools` and `engineering` installed and enabled, GitHub SSH and `gh` 2.94+ auth,
  matching language servers, name collisions with other user-scope plugins) and offers the fixes
  in one prompt. `scripts/preflight.py` is read-only and has `--json`.
- New subagent `lsp-prober` proves a language server answers with real requests. `setup` audits
  the repo's status and `ready-for-agent` labels and offers to create missing ones, and merges
  `autoMemoryEnabled: false` and blank `attribution` into `.claude/settings.json`.
- `setup` closes with a table of every check and file written, a working-habits readout
  (`scripts/session_stats.py`) and a handover. The tracker doc has no inline `gh` fallback.

## 0.8.0

- **`writing-for-agents`** (model-invoked): the reference for writing any document an agent
  consumes, whether a skill, a `CLAUDE.md`/`AGENTS.md`, or a doc behind a pointer. Covers
  context pointers, context load versus cognitive load, the information hierarchy and
  progressive disclosure, completion criteria, when to split, leading words, and pruning.
  `SKILL-MECHANICS.md` carries the skill-specific branch: frontmatter, the model-invoked
  versus user-invoked choice, and router skills.
- **`retro`** (user-invoked): retrospective on a coding session that suggests improvements to
  the agent's environment, ordered by severity, across navigation, automated checks, coding
  standards, `AGENTS.md`, tool economy, no-ops and information access. A mechanical violation
  gets a deterministic check rather than a written rule; a repo with no guardrail is itself a
  finding. Step 1 loads `engineering:writing-for-agents`.
- Both are ported from [Matt Pocock's skills](https://github.com/mattpocock/skills)
  (`retro/deterministic-checks` branch). Changes from the original: the project-rules block
  every skill in this plugin carries, fully qualified cross-skill invocation, the reviewer
  agent named as the Standards axis of `engineering:code-review`, and the Codex-only
  `agents/openai.yaml` files dropped.

## 0.7.2

- **`to-spec` and `to-tickets` ground their output in the code that already exists.** Both
  skills opened on an exploration step that named no output, and `to-spec` let the agent skip
  it outright ("if you haven't already"), so specs and tickets described structure the
  codebase did not have. Exploration is now a **survey** that is not optional and ends on four
  named outputs: the existing modules the work extends, the prior art it should resemble, the
  conventions of that area it inherits, and the constraints already fixed by ADRs and the
  glossary.
- **Extend before inventing.** Matching what exists is the default and needs no justification;
  a new module, pattern or abstraction is a decision that carries the reason nothing existing
  fit, into the spec's Implementation Decisions or into the ticket that introduces it.
- **Every step ends on a checkable bar.** `to-spec` had no completion criteria at all and now
  closes on a fresh agent being able to implement the feature without re-deriving a decision.
  In `to-tickets` the blueprint paragraph was trailing prose after the publish instructions,
  where it read as encouragement; it is now the gate on publishing, and the approval step ends
  on the user having approved rather than on iterating.
- `to-spec` states positively what a spec names (modules, interfaces and symbols by domain
  name) in place of the prohibition on file paths, which named the unwanted behaviour and put
  nothing in its place. The prototype-snippet exception is unchanged.
- `to-tickets` implementation plans say per step whether it extends something existing or adds
  something new, and name the prior art worth imitating rather than any prior art.

## 0.7.0

- **Cross-skill invocation is now an explicit Skill tool call**, not a bare `/engineering:x`
  mention left for the model to read as a command. `wayfinder`, `improve-codebase-architecture`,
  `tdd`, `implement` and `spec-planning` name the tool and the fully qualified skill; a step
  needing two skills says so as two calls. Prose that only lists skills for a human to pick
  from keeps its plain `/engineering:x` labels.
- **A skill never calls a user-invoked skill.** `code-review`, `to-spec`, `to-tickets` and
  `wayfinder` told the agent to run `/engineering:setup`, which is unreachable that way; they
  now tell the user to run it. `spec-planning` does the same for its `to-spec`/`to-tickets` exit.
- `interview` separates the questions in a round with a horizontal rule, so a multi-question
  round reads as distinct questions rather than one block.
- `domain-modeling` triggers on writing or editing a `CONTEXT.md` and on recording or editing
  an ADR, alongside discussing codebase terminology.
- All skill prose is free of em-dashes, rewritten sentence by sentence rather than substituted.
  Three descriptions gained a colon in the process and are now quoted, which is what keeps the
  YAML frontmatter parseable.

## 0.6.0

- `to-tickets` ticket bodies are **blueprints**: the issue template gains an
  `## Implementation plan` section: an ordered sequence of steps naming the modules,
  interfaces and symbols each one touches, the seams the tests go through, and prior
  art worth imitating, so a developer or fresh agent context can implement without
  re-deriving the design. File paths and code snippets stay out (prototype exception
  unchanged). Codebase exploration is now mandatory before drafting: a ticket whose
  plan can't be written isn't ready to publish.
- `spec-planning` closes by routing through `/engineering:to-spec` before
  `/engineering:to-tickets`: spec first by default, skippable for a small body
  of work, with the chosen route stated.

## 0.5.0

- **The issue tracker is GitHub Issues** (breaking). `setup` seeds
  `docs/agents/issue-tracker.md` from `issue-tracker-github.md`, gates on a GitHub
  remote, and delegates to the `tools:github` skill when installed; the inline
  fallback conventions use `gh` (2.94+).
- **The local markdown tracker is removed.** `to-tickets` no longer writes
  `.scratch/<slug>/issues/*.md` files when no tracker is configured. A configured
  GitHub tracker is now required, and publishing has exactly one path.
- Epics use **native sub-issues**: tickets attach with `--parent`/`--add-sub-issue`
  instead of the three-way membership convention (title suffix, `## Sub-Issues`
  checklist, `relates_to` link). Blocking edges are native `blocked-by` dependencies.
  The issue and epic templates drop their hand-maintained `## Parent`, `## Blocked by`
  and `## Sub-Issues` sections: the native relations render in the UI and a
  hand-written copy drifts.
- `wayfinder` drops the body-convention fallback for blocking: GitHub's native
  dependencies are always available, so the frontier is always UI-visible.
- `wizard` writes CI values with `gh secret set` / `gh variable set` only; the
  glab-first arm in `template.sh` is gone.
- `session-start` surfaces open issues via `tools:github`; `to-spec` consults the
  `github` skill for epics; `code-review`'s reference examples use the shared `#N`
  number space (GitLab's `!N` is gone).

## 0.4.0

- `domain-modeling` treats `CONTEXT-MAP.md` as authoritative for where each context's
  `CONTEXT.md` and adr directory live. The example trees are now explicitly the common
  cases, covering superprojects that keep all docs in the root repo with nothing inside
  their submodules. ADR numbering runs per context.
- ADRs close with `_Decided {date} · {decider}_`: the person who made the call, or an
  issue reference when the decision was taken there.
- `domain-modeling` fires on qualifying decisions made in ordinary work, not only inside
  planning sessions.
- The `setup` seed for `docs/agents/domain.md` carries the same map-is-authoritative rule.

## 0.3.0

- New skill `session-start`: restores the time-tracking clock, brings the repo up to date
  (never resolving a dirty tree or a failed fast-forward on its own), surfaces open issues
  via `tools:gitlab` when that skill is present, and proposes a first task.
- New skill `session-end`: one bundled question, then lands the work and verifies the push
  with `git log --oneline @{upstream}..HEAD` per touched repo. A protected branch rejects
  a push quietly, and the report may only say "pushed" once that is empty. The clock stops
  last, so committing and pushing count as session time.
- Both skills are deliberately thin. The baseline is a minimum; each project and developer
  extends the ritual through their own skill-context files.
- Project rules gained a personal tier: `context.sh` now reads `CONTEXT.local.md` alongside
  `CONTEXT.md` at both the plugin-wide and per-skill level, personal files last so they
  outrank the committed ones. All skills inherit it.
- `setup` adds `.claude/skill-context/**/*.local.md` to the repo's `.gitignore`, so the
  personal tier cannot be committed by accident.

## 0.2.0

- `to-tickets` publishes an epic. A breakdown into several tickets is a body of work and
  gets an umbrella ticket that owns it; previously the skill described only a flat list,
  and contemplated a parent solely when the plan came from an existing issue.
- `to-tickets` gained an `<epic-template>`, including a "Decisions taken during planning"
  section: the tickets record what to build but never why the breakdown is shaped so.
- `to-tickets` no longer files the planning session's own documents as tickets.
- `spec-planning` states that glossary entries and ADRs are never tickets. The obligation
  to write them inline already lived in `domain-modeling`; this closes the seam where a
  session could hand its own documents to `to-tickets` instead.
- `to-spec`: a spec destined for several tickets publishes as an epic.
- Tracker doc gained an `## Epics` section, so the convention lives where `to-tickets`
  looks for it. Corrected the Wayfinding claim that a labelled issue can hold child
  issues: GitLab's hierarchy cannot parent an issue to an issue.

## 0.1.0

Initial release, adapted from [mattpocock/skills](https://github.com/mattpocock/skills) (MIT).

- 16 skills: setup, spec-planning, interview, domain-modeling, codebase-design, to-spec, to-tickets, implement, tdd, code-review, wayfinder, prototype, research, improve-codebase-architecture, wizard, handoff
- Renamed the interview family: `grilling` → `interview`, `grill-with-docs` → `spec-planning`; all wording and cross-references updated
- Issue tracker hardwired to GitLab; setup no longer asks. Tracker doc delegates to the `tools:gitlab` skill when installed, with inline `glab` conventions as fallback
- Dropped: ask-matt, triage, diagnosing-bugs, resolving-merge-conflicts, grill-me, teach, to-questionnaire, wait-what, writing-for-agents
- Every skill loads project rules from `.claude/skill-context/engineering/` at invocation time (same mechanism as tools)
- Wizard's CI helpers write GitLab CI/CD variables via `glab` (GitHub `gh` kept as fallback)
