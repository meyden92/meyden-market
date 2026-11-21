# Using the dev-workflow plugin

Team guide for the `dev-workflow` plugin: what the workflow is, which skill to reach for
when, and how the documentation trail (`CONTEXT.md`, ADRs) works across features. For
installing the marketplace itself, see [hosting-on-github.md](hosting-on-github.md).

The plugin is adapted from [Matt Pocock's skills](https://github.com/mattpocock/skills) (MIT),
renamed and rewired for meyden: the interview family lost its "grilling" naming, the issue
tracker is always GitHub (delegating to `github-flow:github` when installed), and every skill
loads project-specific rules on invocation.

## The idea in three sentences

An agent is an engineer with no memory — it is only as good as the process and the written
record you hand it. So: decide first (a structured interview), record what must survive
(glossary terms and ADRs in git, specs and tickets on GitHub), then build in slices small
enough that each fits one fresh context window. Humans own decisions; the agent owns facts
and legwork.

## One-time repo setup

Run once per repository:

```
/dev-workflow:setup
```

It records the GitHub tracker conventions in `docs/agents/issue-tracker.md`, the domain-doc
layout in `docs/agents/domain.md`, and adds an `## Agent skills` block to the repo's
`CLAUDE.md`. The repo needs a GitHub remote and an authenticated
[`gh`](https://cli.github.com/) CLI (2.94+). If the `github-flow` plugin is installed, all
tracker operations go through its `github` skill and follow the organisation's issue
lifecycle; otherwise the recorded `gh` conventions apply directly.

`CONTEXT.md` and `docs/adr/` are **not** scaffolded here — they get created lazily, the first
time a term or decision is actually worth writing down.

## The main flow

For a feature too big for one session:

| Step | Skill | What happens |
| --- | --- | --- |
| 1. Plan | `/dev-workflow:spec-planning` | A structured interview sharpens the plan. Questions come in numbered rounds with a recommended answer each — answer by number, push back, say "I don't know". Glossary terms and ADRs are written as they resolve. |
| 2. Spec | `/dev-workflow:to-spec` | **Same conversation, don't clear it.** Synthesises the discussion into a spec — no new questions — agrees the test seams with you, and publishes it as a GitHub issue labelled `ready-for-agent`. |
| 3. Tickets | `/dev-workflow:to-tickets` | Splits the spec into tracer-bullet tickets: narrow vertical slices through every layer, each demoable alone, each sized to one context window, published as sub-issues of an epic with GitHub blocking links between them. You approve the breakdown before anything is published. |
| 4. Build | `/dev-workflow:implement #NN` | One ticket per **fresh** session: clear context, implement test-first at the pre-agreed seams, self-review, commit, clear again. Closing the ticket is your job — the agent never closes tickets. |
| 5. Review | `/dev-workflow:code-review` | Two independent axes in parallel sub-agents: Standards (repo conventions + a fixed code-smell baseline) and Spec (does the diff match the originating issue). Findings are leads, not a loop-until-clean gate. |

For a change that fits one session, skip the middle: interview, then
`/dev-workflow:implement` directly in the same conversation. The spec only earns its cost
on multi-session work.

Session hygiene is part of the method: don't clear between planning and `to-spec`/`to-tickets`
(the decisions live in the conversation until then), and always clear before each
`implement` run.

## Shaping: when the plan is too foggy to plan

- `/dev-workflow:wayfinder` — for efforts bigger than one planning session. Charts a
  **map** (a GitHub issue labelled `wayfinder:map`) of decision tickets — `interview`,
  `prototype`, `research`, `task` — worked one per session until the way is clear, then hands
  off to `to-spec`.
- `/dev-workflow:prototype` — throwaway code that answers one design question talking
  can't settle: a self-contained HTML state-model demo, or several radically different UI
  variants on one route. The validated decision goes into the real code; the prototype parks
  on a never-merged branch, linked from the issue.
- `/dev-workflow:research` — a background agent reads primary sources only and writes a
  cited markdown file. Delete or archive research files once absorbed — stale research
  poisons future repo reads; ADRs are the thing you keep.
- `/dev-workflow:handoff` — compacts the current session into a document a fresh agent
  can continue from. Use it when work must travel: another repo or directory (the prototype
  round-trip), another machine, or a colleague.

## Upkeep

- `/dev-workflow:improve-codebase-architecture` — every few days or before a big build:
  scans for shallow modules worth deepening and writes a visual HTML report. Picking a
  candidate starts an interview whose outcome re-enters the main flow at `to-spec`.
  Rejecting a candidate for a load-bearing reason offers an ADR so it never gets re-suggested.
- `/dev-workflow:wizard` — generates an interactive bash script that walks a *human*
  through manual steps (dashboards, credentials, one-off migrations). Captured CI values are
  written with `gh secret set` / `gh variable set`.

## The documentation trail: CONTEXT.md and ADRs

Two files carry a repo's memory between sessions, both git-tracked in the working repo:

- **`CONTEXT.md`** (repo root) — the domain glossary and *nothing else*. One or two sentences
  per term, with rejected synonyms under `_Avoid_`. Written inline during interviews, the
  moment a term resolves. It must never swell into a spec — if it does, run an interview
  session to slim it back down.
- **`docs/adr/NNNN-slug.md`** — architecture decision records, sequentially numbered. An ADR
  is 1–3 sentences: context, choice, why. One is only written when a decision passes **all
  three gates**: hard to reverse, surprising without context, and the result of a real
  trade-off. Most planning sessions produce zero ADRs — that is by design, and it is what
  keeps `docs/adr/` small enough that agents actually read it.

Everything else you decided lives in the conversation (until `to-spec` snapshots it) and in
the GitHub issues. The spec is a throwaway snapshot; the glossary and ADRs are the durable
memory.

### What happens to old ADRs when you plan the next feature

They are **read, never rewritten**:

- The planning interview cross-references what you say against `CONTEXT.md` and existing
  ADRs — contradict ADR-0004 and it will ask whether you're revisiting that decision instead
  of silently planning around it.
- `to-spec`, `to-tickets`, and `tdd` all respect ADRs in the area being touched.
- `improve-codebase-architecture` reads them so it never re-suggests a rejected refactor, and
  flags any candidate that conflicts with one.

Numbering simply continues — the next qualifying decision scans `docs/adr/` for the highest
number and increments. ADRs are append-only history: when a later feature reverses a
decision, write a *new* ADR ("supersedes ADR-0002") and optionally mark the old one
`Status: superseded by ADR-NNNN`. The old file stays, so the trail of why the codebase looked
that way in between remains readable.

ADRs are not auto-injected into every session — skills read them lazily when touching the
relevant area. Keeping each one tiny is what makes that affordable.

### Migrating an existing repo's decision logs to ADRs

An existing repo with a free-form decision log converts well, and there is an intended path:

```
/dev-workflow:spec-planning help me convert our existing decision log into ADRs and a glossary
```

1. The interview reads the old documents and the code, then walks the entries with you in
   numbered rounds — ambiguities in the old log become questions you settle, not guesses.
2. Each old entry gets one of three fates, decided with you:
   - **ADR** — only if it passes the three gates. Decisions that were later reversed get
     `Status: superseded` frontmatter instead of being dropped.
   - **Glossary term** — much of a typical decision log is really terminology; that belongs
     in `CONTEXT.md` with `_Avoid_` lines, not in an ADR.
   - **Dropped** — most entries. Reversible, obvious, or no-real-alternative decisions don't
     need to survive, and aggressive filtering is what keeps `docs/adr/` readable. This is a
     feature, not a loss.
3. Archive or delete the old log afterwards — its useful content now lives in `docs/adr/` and
   `CONTEXT.md`, and git history keeps the original. For a transition period, a project rule
   (see below) can keep the legacy log authoritative for topics not yet migrated.

Number historical decisions chronologically if the order is known; numbers are identity, not
priority. Monorepos with several distinct domains can use the multi-context layout — a root
`CONTEXT-MAP.md` pointing at per-context `CONTEXT.md` files — which `setup` offers when it
spots monorepo signals.

## Project-specific rules

Every skill loads project rules on each invocation, plugin-wide first, then per-skill:

```
<repo>/.claude/skill-context/dev-workflow/CONTEXT.md
<repo>/.claude/skill-context/dev-workflow/<skill>/CONTEXT.md
```

Use them for the repo's label vocabulary, target GitHub repository, language conventions, or to
tighten any default a skill sets. They may override plugin defaults, but never authorise
skipping a confirmation or publishing without approval. Files are capped at 8 KB — they are
injected on every invocation, so keep them short. (This is a different file from the repo-root
`CONTEXT.md` glossary: `skill-context` files configure the *skills*; the root `CONTEXT.md`
documents the *domain*.)

## Habits that make it work

- **Don't nod along.** Answering "agreed" to forty interview questions produces a plan the
  agent wrote with unearned certainty. Push back, change scope, say "I don't know".
- **One ticket, one fresh session.** Context discipline is a feature of the method, not an
  inconvenience.
- **You close tickets.** The agent implements; frontier visibility on the GitHub board is
  yours to maintain.
- **Specs are disposable, ADRs are not.** Never copy durable decisions only into a spec —
  make sure they landed in `CONTEXT.md` or an ADR during planning.
