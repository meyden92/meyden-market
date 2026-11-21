---
name: setup
description: Onboarding and per-repo setup for the meyden dev-workflow skills. It checks the session is running on a model strong enough, probes the machine (skill runtime, Claude Code and marketplace wiring, GitHub access, and whether the repo's language server actually answers), offers the safe fixes, scaffolds this repo's GitHub issue tracker, label vocabulary and domain doc layout, then reads back how the developer has been working and hands over the workflow. Run once per repo, and again on a new machine or when something that worked has stopped.
disable-model-invocation: true
---

# Setup meyden dev-workflow skills

## Project rules

!`bash "${CLAUDE_PLUGIN_ROOT}/scripts/lib/context.sh" setup "${CLAUDE_PROJECT_DIR}"`

> [!WARNING]
> **The machine probe is written and tested for macOS.** The checks are portable; the fixes are
> not, since they assume Homebrew and macOS paths. On any other platform the probe prints a
> `PLATFORM WARNING` banner and downgrades every macOS fix to MANUAL so nothing doomed gets run
> for the developer.
>
> When that banner appears, **lead the report with it**, before the findings, in your own
> words, stating the detected platform and that each fix needs translating. A developer on
> Linux who reads only the table will otherwise paste `brew install` commands that fail.

Four jobs, in one pass:

- **Steps 1 to 4: the machine.** Can this developer run the dev-workflow skills at all? Read-only
  probe, then the fixes they approve.
- **Steps 5 to 8: the repository.** The per-repo configuration the other skills assume: a GitHub
  issue tracker, a label vocabulary, a domain doc layout, and the project's Claude settings.
- **Step 9: the report.** One table covering both.
- **Step 10: the developer.** How they have actually been working, and how to use what they
  just installed.

The value here is an honest verdict, so a check that could not be completed is reported as
unknown rather than folded into a pass. Someone will trust the closing table on their first day.

## 1. Probe the machine

```bash
python3 ${CLAUDE_SKILL_DIR}/scripts/preflight.py --repo "${CLAUDE_PROJECT_DIR}"
```

Read-only: it inspects the CLI, `~/.claude/plugins` state, whether `github-flow` and `dev-workflow` are
installed and enabled, SSH and `gh` auth, this project's `.claude/settings.json`, what else is
loaded at user scope, and the file extensions present in the repo. It changes nothing.

**Before anything else it checks the model and effort level this session is running on**, read
from the session's own transcript. These skills hand you a repo you have just met and expect you
to hold a multi-step plan while reading unfamiliar code; below Opus 5 or Fable 5 at high effort
the failure is not a refusal but a plausible-looking one: steps quietly skipped, sub-agents
briefed too thinly, a spec that reads well and does not match the codebase.

If the output is a `SESSION` block ending in `BLOCKED`, the script has exited with status 2 and
run no other check. **Stop the skill there.** Relay the model, the effort level, and the four
numbered actions as they are printed, tell the user plainly why the bar exists, and do nothing
else: no probing, no exploring, no writing. A restart on the right model costs a minute; a
setup done badly costs the rest of the week. Do not offer to continue anyway, and do not treat
a user saying "just carry on" as a reason to skip the restart. Offer instead to have the
commands ready for them to paste.

Otherwise the run continues and five blocks come back:

- **status lines**: one per check, `OK` / `WARN` / `FAIL` / `SKIP`
- **FIXES**: numbered, each tagged `AUTO` (a command that can be run for the developer) or
  `MANUAL` (something only they can do)
- **PROJECT-SETTINGS**: the settings this project's `.claude/settings.json` is missing, for step 8
- **OTHER-EXTENSIONS**: user-scope plugins and personal skills that load in every session, for step 4
- **LSP-PROBES**: one sample file per detected language, for step 3

One flag exists for when the default is wrong: `--github-host <host>`. The script otherwise
assumes `github.com`, deliberately not derived from the repo's remote, which may name an ssh
alias rather than a host.

If the command itself fails with `python3: command not found`, that is the finding, and the
most important one: the probe is Python, and so is nearly every script bundled with the meyden
skills. Report it as a failed preflight with `brew install python` (or `xcode-select --install`)
as the first action, and go no further: everything downstream depends on it.

Hold the findings until the closing table: a running commentary of failures reads as alarming,
and some of them are about to be fixed.

**Done when** you have the output through the `SUMMARY` line, or the run was `BLOCKED` and you
have stopped.

## 2. Launch the working-habits analysis

Start this now so it runs while the rest of the setup happens, and read it back in step 10.

Spawn **two agents in the background**, in one message so they run concurrently. Each one runs a
single command and hands the output back:

```bash
python3 ${CLAUDE_SKILL_DIR}/scripts/session_stats.py --models  --repo "${CLAUDE_PROJECT_DIR}" --days 30
python3 ${CLAUDE_SKILL_DIR}/scripts/session_stats.py --hygiene --repo "${CLAUDE_PROJECT_DIR}" --days 30
```

They exist to keep months of transcripts out of this context, so brief them narrowly: run the
command, return its output verbatim, add nothing. **No interpretation, no recommendations, no
summary of their own**: reading the numbers is your job in step 10, and an agent that
editorialises will have thrown away the detail you need to do it.

If a run errors or the project has no recorded history, that is the finding: record working
habits as unknown in step 10 rather than inventing a pattern.

**Done when** both agents are running. Do not wait for them. Carry on with step 3.

## 3. Prove the language servers answer

The script confirms that a plugin is installed and its binary is on PATH. Neither of those
shows that the server *answers*: the official LSP plugins ship no binary, they only declare a
command to launch, and a server can start and still fail to resolve the project or index it.

For each entry under LSP-PROBES, spawn `dev-workflow:lsp-prober` once, passing every target
as a plugin name paired with its sample file path.

**Run it in the foreground**: pass `run_in_background: false`. Background subagents get a
narrower tool set that excludes `LSP`, so a backgrounded prober reports the tool as missing
instead of probing anything.

When LSP-PROBES is absent, no supported language was detected: record language servers as not
applicable and move on.

**Done when** every LSP-PROBES entry carries a WORKING, BROKEN, or UNKNOWN verdict.

## 4. Offer the machine fixes, and read what else is loaded

**AUTO fixes**: collect them into one `AskUserQuestion` with `multiSelect: true`, one option
per fix, labelled with what it changes (`add the meyden marketplace`, `enable github-flow`). Two
things belong in each description: the command itself, and what it touches. Appending to
`~/.zshrc` and installing a plugin deserve different levels of thought.

Ask once. Then run the approved commands in the order the script listed them, since the
marketplace has to exist before a plugin installs from it. Report a fix that fails with its
error and carry on to the rest.

**MANUAL fixes**: these go in the closing table, at two lines at most: the action, and where
to do it. A new developer reading "add your public key at https://github.com/settings/keys" can
act immediately; a paragraph about SSH agents sends them to search for the URL.

Re-run the step 1 probe once after applying any fix, and build the table from that second run,
so it reflects the machine as it now stands. Re-probing the language servers is worth it only
if a fix installed a server or its plugin.

**OTHER-EXTENSIONS**: every plugin and personal skill listed there loads in *every* session
alongside ours, so read the list and judge whether anything competes. Namespacing keeps slash
commands apart; auto-firing skills are matched on their descriptions and do not have that
protection. What matters:

- A line tagged `OVERLAPS OURS`: the same component name exists in two places. Name the pair.
- A skill that covers the same ground under a different name: another issue-tracker or GitHub
  wrapper, another code-review or planning skill, a second time tracker. `feature-dev` and a
  `code-reviewer` agent are the sort of thing to mention; a language server or a design skill is
  not.
- Anything at user scope the developer may not know is enabled.

Report what you find as one or two sentences and, where something genuinely competes, say which
of the two should win for this repo. **Do not disable or uninstall anything**: the developer
chose to install it, and this skill is not the place to reverse that. Offer, at most, to raise it
again later.

If nothing overlaps, one line saying so is the whole report.

**Done when** every AUTO fix has been applied, declined, or has failed with its error recorded,
and the extensions list has been read and judged.

## 5. Explore the repository

The rest is prompt-driven, not a script. Explore, present what you found, confirm with the
user, then write.

Look at the current repo to understand its starting state. Read whatever exists; don't assume:

- `git remote -v` and `.git/config`: which GitHub repository is this?
- `AGENTS.md` and `CLAUDE.md` at the repo root: does either exist? Is there already an `## Agent skills` section in either?
- `CONTEXT.md` and `CONTEXT-MAP.md` at the repo root
- `docs/adr/` and any `src/*/docs/adr/` directories
- `docs/agents/`: does this skill's prior output already exist?
- The project's check commands: typecheck, lint and test scripts in `package.json`, a `Makefile`, `pyproject.toml`, `Cargo.toml` or `go.mod`, and whether the test runner can run only the tests related to a set of files (`vitest related`, `jest --findRelatedTests`). Also `.claude/skill-context/dev-workflow/checks.json`, if it already exists.
- Monorepo signals: a `pnpm-workspace.yaml`, a `workspaces` field in `package.json`, or a populated `packages/*` with its own `src/`. Present only in a genuinely large multi-package repo; their absence means single-context, which is almost every repo.

If no remote points at GitHub, stop and tell the user: these skills track work exclusively on
GitHub Issues, so the repo needs a GitHub remote (or the user's explicit go-ahead to configure
the tracker doc anyway, e.g. for a repo about to be pushed).

Whether `github-flow` is available was already answered in step 1. Don't re-check it. If its row
came back FAIL and the fix was declined, say so and stop: every tracker operation goes through
its `github` skill, and there is no fallback.

## 6. Present findings and confirm

Summarise what's present and what's missing. There is only one genuine question:

**Section A: Issue tracker.** No choice to offer: issues, specs, and tickets for this repo live
in **GitHub Issues**, and every tracker operation goes through the `github-flow:github` skill.
Record it in `docs/agents/issue-tracker.md` from the seed template.

**Section B: Domain docs.** Default to **single-context**: one `CONTEXT.md` + `docs/adr/` at
the repo root. This fits almost every repo; write it without asking.

Offer **multi-context** (a root `CONTEXT-MAP.md` pointing to per-context `CONTEXT.md` files)
only when exploration found monorepo signals. Then confirm which layout they want.

**Section C: Checks.** The dev-workflow mod runs the project's checks itself after Claude edits
files and after every ticket of an epic run. Propose `.claude/skill-context/dev-workflow/checks.json`
from the commands exploration found, fast ones first. Each check is an argument vector run without
a shell; a `{files}` argument expands to the changed files, and a check holding it is skipped when
no file changed:

```json
{
  "checks": [
    { "name": "typecheck", "run": ["npx", "tsc", "--noEmit"] },
    { "name": "tests", "run": ["npx", "vitest", "related", "--run", "{files}"] }
  ]
}
```

Leave the file out when the repo has no check commands.

Show the user a draft of:

- `checks.json`, when Section C proposed one
- The `## Agent skills` block to add to whichever of `CLAUDE.md` / `AGENTS.md` is being edited (see step 8 for selection rules)
- The contents of `docs/agents/issue-tracker.md` and `docs/agents/domain.md`

Let them edit before writing.

## 7. Audit the labels

The dev-workflow skills assume a label vocabulary on the GitHub repository. Read what exists
(`gh label list --limit 200 --json name`; the default limit of 30 truncates silently) and check
it against what the skills need:

- **Status stages**: one label per lifecycle stage *todo → doing → testing → done*. Any existing vocabulary counts (`In Arbeit`, `Status: Doing`, and `workflow::Doing` are all the same stage: match by meaning, not exact name); a stage no label covers is missing.
- **`ready-for-agent`**: marks an issue fully specified and agent-grabbable; applied by `/dev-workflow:to-spec` and `/dev-workflow:to-tickets`.
- **`wayfinder:map`, `wayfinder:research`, `wayfinder:prototype`, `wayfinder:interview`, `wayfinder:task`**: needed only if the team will use `/dev-workflow:wayfinder`; offer them as an optional group rather than creating them by default.

If the `gh auth` row from step 1 is still failing, this step cannot run. Record the labels as
unknown in the closing table with the `gh auth login` command as the next action, and move on.
Don't guess at what the repository has.

Present the missing labels and **offer to create them**: setup is the one sanctioned moment to
create labels, and only with the user's confirmation, because a new label reshapes everyone's
board. For missing status stages propose names in the project's language: e.g. `Erstellt` /
`In Arbeit` / `Testing` / `Abgeschlossen` on a German project, `Todo` / `Doing` / `Testing` /
`Done` on an English one, each with a short description and a colour that reads as its stage
(`428BCA` todo, `E67E22` doing, `F0AD4E` testing, `5CB85C` done). These are the names
`meyden-gh issue status` resolves to a stage, so a label created here is one the
`github-flow:github` skill can move issues to. No `#` in the colour; `gh` takes bare hex:

```bash
gh label create "In Arbeit" --color "E67E22" --description "Aktuell in Bearbeitung"
```

Never rename or replace labels the repository already has: an existing vocabulary wins over the
proposed one, even when the names differ.

## 8. Write

**Pick the file to edit:**

- If `CLAUDE.md` exists, edit it.
- Else if `AGENTS.md` exists, edit it.
- If neither exists, ask the user which one to create: don't pick for them.

Never create `AGENTS.md` when `CLAUDE.md` already exists (or vice versa). Always edit the one that's already there.

If an `## Agent skills` block already exists in the chosen file, update its contents in-place rather than appending a duplicate. Don't overwrite user edits to the surrounding sections.

The block:

```markdown
## Agent skills

### Issue tracker

Issues live in this repo's GitHub Issues. See `docs/agents/issue-tracker.md`.

### Domain docs

[one-line summary of layout: "single-context" or "multi-context"]. See `docs/agents/domain.md`.
```

Then write the docs files using the seed templates in this skill folder as a starting point:

- [issue-tracker-github.md](./issue-tracker-github.md): GitHub issue tracker
- [domain.md](./domain.md): domain doc consumer rules + layout

Write `.claude/skill-context/dev-workflow/checks.json` as confirmed in Section C. An existing file
is updated in place, keeping checks the user added.

**Keep personal skill rules out of git.** Every skill in this plugin loads project
rules from `.claude/skill-context/dev-workflow/`, where `CONTEXT.md` is shared
with the team and `CONTEXT.local.md` is one developer's own. The personal tier only
works if it stays uncommitted, so ensure the repo's `.gitignore` carries:

```gitignore
.claude/skill-context/**/*.local.md
```

Already present → leave it. Missing → append it under a one-line comment. If the
repo has no `.gitignore`, create one containing just this rule.

**Merge the project's Claude settings.** When step 1 printed a `PROJECT-SETTINGS` block, write
those keys into `<repo>/.claude/settings.json`:

```json
{
  "autoMemoryEnabled": false,
  "attribution": { "commit": "", "pr": "" }
}
```

`autoMemoryEnabled: false` keeps per-session memory files out of a repo the whole team shares;
the blank `attribution` strings keep tool branding out of commit messages and pull requests,
which is what the GitHub conventions in `docs/agents/issue-tracker.md` assume.

**Merge, never overwrite.** Read the file first if it exists, add only the keys the block listed,
and leave everything else (`permissions`, `hooks`, `enabledPlugins`) exactly as it is. Under
`attribution`, set only `commit` and `pr`; any other key the project put there stays. If the file
does not exist, create it with just these keys. This file is committed, so say in the report that
it changed.

## 9. Report

Close with one markdown table covering **every** check from the probe *and* every piece of repo
configuration, including the ones that passed, since "what is already working" is half of what
the developer asked for.

| Area | Check | Status | Detail |
| :-- | :-- | :-- | :-- |
| Claude Code | github-flow | ✅ working | 0.1.0, enabled |
| GitHub | ssh-agent | ❌ not working | Run: `ssh-add --apple-use-keychain ~/.ssh/id_ed25519` |
| Language server | typescript-lsp | ✅ working | 47 symbols returned from `src/index.ts` |
| Repo config | issue tracker | ✅ working | wrote `docs/agents/issue-tracker.md` |
| Repo config | labels | ⚠️ check | created 4 status stages; `ready-for-agent` declined |
| Repo config | checks | ✅ working | wrote `checks.json` with typecheck, tests |

Use ✅ working, ⚠️ check, ❌ not working, and `-` not applicable. Order rows by area in the
sequence the probe reported them, with `Repo config` last. For anything not working, the Detail
cell holds the next action: the command for an AUTO fix the developer declined, or the short
instruction for a MANUAL one.

Under the table, add two lines: whether this machine is ready to work on the repository, and
which dev-workflow skills now read from the files that were written. Say `❌` plainly where it
applies; a setup that reads as reassuring when SSH is broken has failed at its only job.

Mention they can edit `docs/agents/*.md` directly later: re-running this skill is only
necessary to restart from scratch or to re-check the machine.

**Done when** the table has a row for every check the probe reported and every file this skill
wrote, every not-working row names a next action, and the verdict line is present.

## 10. Working habits, and how to use these skills

Collect the two agents from step 2. **You** read the numbers. They only fetched them.

### How they have been working

Two questions, answered from the data and nothing else. Where the numbers do not support a
claim, say so rather than reaching for the generic advice.

**Model and effort.** `--models` gives turns by model, turns by effort, and a per-session
verdict. The bar is Opus 5 or Fable 5 at high effort or above. Judge on the share of *turns*,
not the share of sessions: a one-turn session on Haiku is noise, a 400-turn session at medium
effort is the whole picture. If most work already clears the bar, say so in one line and name the
exceptions. If it does not, be specific about the cost: at medium effort these skills skip steps
in long procedures and brief sub-agents too thinly, so a spec or a ticket set comes back
plausible and wrong, and the time lost is in the review that catches it, or in the week that
does not.

**Context hygiene.** `--hygiene` gives sessions, prompts per session, hours, `/clear` count,
long-running sessions, and which sessions mixed planning commands with building ones. What to
look for, and what each one means:

- **Long-running sessions**: one context carrying a whole day. Late work in that session is
  reasoning over a transcript that is mostly irrelevant to it.
- **Rare `/clear`** relative to the number of distinct tasks: the same context reused for
  unrelated work.
- **Planning and building in one session**: `spec-planning` or `to-tickets` in the same session
  as `implement`. The spec conversation is exactly the context an implementer does not need, and
  it crowds out the code they do.
- **Bookends unused**: `session-start` / `session-end` / `handoff` never invoked.

Turn what you find into concrete advice tied to their own numbers ("your longest session ran 7.2
hours across planning and two tickets: that is three sessions"). If the data shows they already
work this way, say that and move on; manufacturing a problem to have advice to give wastes the
only credibility this report has.

### How to use what they just installed

Close by handing over the workflow. Keep it short (this is a map, not a manual) and cover only
plugins the probe found installed.

**The flow, one session per box:**

```
/dev-workflow:spec-planning   →  /to-spec  →  /to-tickets
                                                  ↓
                               /implement <ticket or epic>
```

Say plainly that the arrows are session boundaries, not just steps: `/clear` between them is the
point, and `to-tickets` exists so each ticket is small enough to fit one. Given an epic,
`implement` gives every ticket its own fresh subagent and ends with `/code-review` on the branch.

Then, briefly:

- **Small change?** Skip spec and tickets: `/interview`, then `/implement`.
- **Too big to plan in one go?** `/wayfinder` first.
- **Bookends**: `/session-start` to open, `/session-end` to land the work, `/handoff` when
  context runs out before the work does.
- **Session went badly?** `/retro` turns it into concrete fixes to the agent's environment.

**What happens without them asking**: the part developers most often miss:

- `github-flow:github` fires on its own for anything on GitHub (issues, pull requests, CI runs,
  labels); they never need to name it, in German or English.
- `domain-modeling` fires when a hard-to-reverse decision crystallises in ordinary work and
  writes the ADR.
- Every skill reads this repo's rules from `.claude/skill-context/dev-workflow/` on each
  invocation: that is where to put a convention instead of repeating it every session.

End with the single next command for this repo: usually `/dev-workflow:session-start`, or
`/dev-workflow:spec-planning` if they came here with a feature in mind.

**Done when** both agents have been read, each of the two questions has a verdict grounded in
their numbers or an explicit "not enough data", and the handover names the next command.
