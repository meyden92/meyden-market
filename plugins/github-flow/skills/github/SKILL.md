---
name: github
description: Work with GitHub from the terminal via the `gh` CLI for pull requests, issues, sub-issues and dependencies, Actions runs and job logs, releases, labels, milestones, and raw REST/GraphQL through `gh api`. Covers the mandatory issue lifecycle, pull-request conventions and the PR description template, non-interactive usage (gh otherwise hangs on a prompt or opens an editor), JSON output and flag traps, and which writes need confirming first.
when_to_use: Use when the thing being asked about lives on GitHub rather than in the local working tree (a pull request, an issue or ticket, a workflow run/job/build that ran in CI, a release, labels, milestones, reviews, or branch protection), even when the user never says "GitHub" or "gh". Typical phrasings, none of which name the tool - "why is the build red", "what's left in the backlog", "who can approve on main", "get me the full job log, the browser truncates it", "close those stale tickets", "open a request to merge my branch", "write up the PR description", "did the deploy workflow run on that tag". Do NOT use for work that stays on the local machine (uncommitted diffs, reviewing the working tree, commit/rebase/squash/force-push, codebase-wide renames) or for other platforms (GitLab, Jenkins, CircleCI). Being inside a GitHub-hosted repo is not on its own a reason to use this.
allowed-tools: Bash(gh pr view:*), Bash(gh pr list:*), Bash(gh pr diff:*), Bash(gh pr checks:*), Bash(gh issue view:*), Bash(gh issue list:*), Bash(gh run list:*), Bash(gh run view:*), Bash(gh release list:*), Bash(gh release view:*), Bash(gh label list:*), Bash(gh repo view:*), Bash(gh search:*), Bash(gh auth status:*), Bash(gh api:*), Bash(meyden-gh ci:*), Bash(meyden-gh scope:*), Bash(meyden-gh overview:*), Bash(meyden-gh graph:*), Bash(meyden-gh issue view:*), Bash(meyden-gh issue sub list:*)
---

# GitHub via `gh`

`gh` is the GitHub CLI. It is the right tool for anything on GitHub: reading PRs, triaging Actions runs, filing issues.

Authentication lives in gh's own store (OS keyring, or `~/.config/gh/hosts.yml`), set up once with `gh auth login`. Never put a token on a command line or in an env prefix: permission recording captures the expanded value, and a token written into `settings.local.json` or a transcript is burned and has to be rotated. If a call fails with 401, the fix is `gh auth login`, never exporting `GH_TOKEN` or `GITHUB_TOKEN`.

## Project rules

!`bash "${CLAUDE_PLUGIN_ROOT}/scripts/lib/context.sh" github "${CLAUDE_PROJECT_DIR}"`

## Scope: where you are

!`python3 "${CLAUDE_PLUGIN_ROOT}/scripts/github/scope.py" --root "${CLAUDE_PROJECT_DIR}"`

## The one failure that ruins a session: interactive prompts

`gh` is built for humans at a TTY. Several commands prompt or open `$EDITOR` when required input is missing. In an agent session that **hangs the command until it times out**, and no output comes back. Every invocation must be fully non-interactive:

- Always pass the content explicitly: `-t/--title` and `-F/--body-file` on `create`, `-b/--body` or `-F` on comments. `gh issue create`, `gh pr create` and `gh issue comment` all prompt when title/body are missing.
- Never pass `-e/--editor`; that is the "open an editor" sentinel. Never `-w/--web` either; it opens a browser and gives you nothing to read.
- `gh pr merge` with no strategy flag prompts for one, so always name `--merge`, `--squash` or `--rebase` (or use `meyden-gh pr merge`, which pins the reviewed SHA too).
- Set `GH_PROMPT_DISABLED=1` when scripting a command you have not used before: it turns a would-hang prompt into a fast failure. `GH_PAGER=cat` keeps output from disappearing into a pager.
- `gh run watch` blocks until the run finishes. Use it only when the user explicitly asked to wait, and bound it with a `timeout`.

## Guardrails: reads are free, writes land on a shared server

Reading GitHub state is safe, so run it freely and without asking. A write is different: comments notify people, reviews change merge eligibility, and some operations can't be undone. Two questions decide what to do.

**Did the user ask for this specific write?** If they did ("open a PR for this branch", "close issue #42", "comment on #3 saying X"), carry it out. Say which repository and which object you're acting on, then report the resulting URL. Re-asking "shall I?" when they just told you to is obstructive, not careful.

If they didn't, don't do it. Never post a comment, approve a PR, or file an issue as a helpful side effect of a read-only question. Scope doesn't expand on its own either: a request to comment is not a request to approve, and a request to open a PR is not a request to merge it.

**Is it irreversible or high-blast-radius?** These deserve an explicit confirmation *even when the user asked*, because being wrong is expensive and the wording is often looser than the action:

- `pr merge` (and `--auto`), `pr review --approve`
- anything with `delete` in it (`pr close --delete-branch`, `release delete`, `label delete`, `repo delete`)
- `secret set` / `variable set` (production credentials), `repo rename`, `repo archive`, transfers
- `run rerun` / `workflow run` when the workflow deploys rather than just tests

State what you are about to do and on which repository, and wait for a yes.

**When you can't reach the user** (running non-interactively, no one to answer), silence is not consent. Do the writes that were plainly requested, skip the irreversible ones, and report the exact command you would have run so the user can paste it themselves.

## Mandatory workflow conventions

These are house rules, not suggestions. They exist because each one has already cost something: a closed ticket nobody verified, a plan that landed on the wrong issue, a board column that stopped meaning anything. Follow them on every GitHub write. The reasoning behind each is in [references/conventions.md](references/conventions.md); read it when a rule seems to get in the way, because the *why* usually names the exception.

A project may add to these in its own `CONTEXT.md` (see **Project rules** above): its label vocabulary, its integration branch, the language its issues are written in. Project rules can tighten these conventions and name local specifics. They never license skipping a confirmation or closing an issue the user has not signed off.

**1. Every issue carries a status label, and you move it.** The lifecycle is *todo → doing → testing → done*. Set `doing` when implementation starts, `testing` when it goes to the user, `done` only at close. Don't ask permission for these transitions; they're bookkeeping.

The label *names* differ per project (`In Arbeit`, `Status: Doing`, `workflow::Doing` are all the same stage). Never guess and never create one: `meyden-gh issue status <n> doing` resolves the project's own vocabulary and refuses if the project has no label for that stage. GitHub has no scoped-label exclusivity, so a stale status label does not fall off by itself: the verb removes it; a raw `gh issue edit --add-label` does not.

**2. Never close an issue without explicit user confirmation.** Green tests, a clean deploy and a commit that says "manually verified" are all insufficient. Wait for the user to say it works. This is the rule most likely to be broken by accident; see rule 3.

**3. Never write `Closes` / `Fixes` / `Resolves #N` in a PR body or in a commit that lands on the default branch.** It reads as a cross-reference and acts as an action: the issue closes on merge, the acceptance test never happens, and nobody notices until someone opens the issue later. Write `Part of #N` instead, or `Bezug: #N` on a German-language project. Both `meyden-gh pr` and the guard hook refuse these keywords, the hook even on a raw `gh pr create`; if one slips through anyway, reopen the issue rather than treating it as done.

**4. Closing is two steps in order:** set the `done` label, then close.

**5. Every commit references its issue** as `#NNN`. If no issue exists, create one first: "commit without an issue" is not an option to offer. In code comments, `#NNN` is only ever a supplement to a self-explanatory comment, never a bare number standing alone. Mind rule 3: a closing keyword in front of the `#NNN` turns the reference into an auto-close.

**6. Epics get their own branch.** `epic/<n>-<slug>` off the integration branch, one identically named branch per affected repo. Merge back only after the user's test passes, and never with a branch delete: check whether the repository auto-deletes head branches (`gh api repos/{owner}/{repo} --jq .delete_branch_on_merge`) before merging an epic PR, or the branch vanishes out from under an epic that isn't finished. Standalone bugfixes may go straight to the integration branch.

**7. Issue bodies open with a TL;DR and follow the house anatomy.** The TL;DR is one or two sentences saying what is being built and why, before anything else: most people meet an issue as one line in a list or in a notification email that shows only the opening text. A work ticket then carries, as sections in the project's language: the **problem** (the current state and why it cannot stay), a **solution plan** (numbered implementation steps: what to change, how, and where, at the level of modules, interfaces and behaviour), **acceptance criteria** as checkboxes, and its **dependencies** (the native parent sub-issue link, native `blocked_by` links, and related issues mentioned in the body; never hand-written Blocked-by or Sub-Issues sections). Write each section detailed enough that a developer or agent opening the ticket with no other context knows exactly what to implement. A title plus three checkboxes is not a ticket. Write requirements in your own words: no verbatim user quotes, no "User wants:" framing. An issue is a requirements document, not a chat transcript. Match the project's existing language and section vocabulary.

**8. Issue overviews are tables**, with a suggestion column so the user can see where to start:

| ID | Description | Assignee | Suggestion |
| :-- | :-- | :-- | :-- |
| #412 | Worker drops queued tasks on restart | tovi | ✅ quick win |
| #418 | License gate before input validation | - | |

`meyden-gh overview --table` produces the first three columns; add the fourth yourself. Drop the assignee column on `--mine`, where every row has the same answer. Copy each ID exactly as the verb printed it: where several repositories are in scope it carries the repo prefix, and a shortened one refers to nothing.

**The suggestion column may only claim a relationship you have read.** "part of", "blocks", "sub of" are statements about GitHub's hierarchy, and `meyden-gh issue sub list <n>` or `meyden-gh graph <n>` is what tells you whether one holds. An issue number written into a title is not a link: it is typed by hand, the parent behind it is often never set, and that mismatch is exactly what the user needs to hear about. Either query it, or say where the reading came from ("laut Titel", "topically related, not linked on GitHub").

Blocked issues are hidden by default; list them in a separate section below if their precondition just cleared.

**9. Reuse the labels that already exist.** Read them first (`gh label list --limit 200 --json name --jq '.[].name'`) and choose from what comes back. Projects carry a deliberate taxonomy, and boards, saved filters and automation key on those exact strings. A near-duplicate (`bug` next to an existing `Type: Bug`) silently splits it: the issue shows on no board and matches no filter. Match an existing label even when the user's wording differs. If nothing fits, leave it unlabelled and say which label you'd suggest adding, since creating one is a project-wide change.

**10. After a planning round, write the plan onto the issues immediately.** Split it so each repo gets its part, using `meyden-gh issue append` or `update`. Don't ask first; an agreed plan that lives only in the chat is lost at the end of the session.

**11. The repository you are in is the scope, and its submodules are part of it.** A GitHub question asked inside a repository is about that repository. A superproject whose code lives in submodules is one piece of work, so an answer that stops at the superproject describes almost none of it; the scope block above lists the exact set.

Answer only from the scope. `meyden-gh overview --mine` ends with a bare count of what falls outside it, and that count is the whole mention it gets. One short sentence at the end, never a table, never a list of titles or references. A user who asked what is assigned to them *here* did not ask about unrelated projects, and listing those anyway is the behaviour the scope exists to stop.

The count is there so the user can discover more exist and ask for them. When they do, `--all` lists them. Until then, do not fetch, name or characterise them. Never present an account-wide result as if it were the repository's.

Reach for a bare `gh api issues` and you get the account-wide answer with no scope at all. Use the verb.

**12. Verify what GitHub actually did.** It reports success on writes it silently discarded; an assignee without access to the repository is the common one. After bulk body updates, check title against body per issue; an off-by-one shift across a range of issues is invisible otherwise. The verbs here read back what they wrote, which is most of the reason to use them.

## Verbs

Run these rather than rebuilding the same sequence inline. They go through `gh api`, with no token handling and no hand-built pagination. Omit `-R` to act on the current repository; pass `-R owner/repo` to work on another.

```bash
# Issues: writes go through argv, so bodies with backticks, $, umlauts and
# code fences arrive byte-for-byte instead of being mangled by the shell.
meyden-gh issue create --title "..." --body-file plan.md --label "Type: Bug"
meyden-gh issue comment 42 --body-file solution.md
meyden-gh issue append 42 --body-file plan-part.md
meyden-gh issue replace 42 --old-file old.md --new-file new.md
meyden-gh issue status 42 doing

# Dependencies: native blocked-by/blocking relationships
meyden-gh issue link 42 37 --type blocked_by     # 42 is blocked by 37
meyden-gh issue link 37 42 --type blocks         # same edge, other way round

# Sub-issues: the native parent/child hierarchy
meyden-gh issue sub list 42
meyden-gh issue sub create 42 --title "..." --body-file task.md
meyden-gh issue sub add 42 57      # adopt an existing issue
meyden-gh issue sub detach 42 57

# Where am I? This repository plus its submodules, one level
meyden-gh scope
meyden-gh scope --json

# Backlog: scoped to that set by default; walks every page, where
# `gh issue list` silently stops at --limit (default 30).
meyden-gh overview --table
meyden-gh overview --mine                  # assigned to you, within the scope
meyden-gh overview --mine --all            # every repo, scope filter off
meyden-gh overview -R myorg --owner --assignee jdoe
meyden-gh overview --group-by status

# Dependencies: "can this start yet?"
meyden-gh graph 464

# Pull requests, with the checks gh skips (SHA pinning, merge-base check)
meyden-gh pr create epic/235-browser-block --title "..." --description-file pr.md --keep-branch
meyden-gh pr merge 12 --keep-branch
meyden-gh pr delete-branch epic/235-browser-block

# CI triage: runs, failed jobs, log tails, in one call
meyden-gh ci --pr 123
```

The PR description follows [references/pr-description.md](references/pr-description.md). Its Summary section is produced with the `dev-workflow:show-me` skill (Skill tool) when available; otherwise pick a view from the template's catalogue.

`replace` refuses unless the old text matches exactly once, and `delete-branch` refuses unless the branch's head is already contained in the target. Those refusals are the feature; don't work around them by hand.

All of them share `scripts/lib/gh_common.py` (API transport, label-role resolution, credential scrubbing). It is imported, never invoked directly; change it only when the behaviour is meant to shift for every verb at once.

## Traps worth knowing before you hit them

**Issues and PRs share one number space.** `#42` may be either; `gh issue view 42` on a PR fails with a hint rather than answering. There is no `!N` syntax; a reference that looks like one came from GitLab. Cross-repo references are `owner/repo#N`.

**`gh api`'s field flags are the inverse of what you may expect: `-F` is the *typed* one, `-f` the raw string.** `-F x=true` sends a boolean, `-f x=true` the string. A body passed with `-F` that happens to be "42" arrives as a number. The verbs' transport maps this correctly; in raw calls, use `-f` for anything human-written.

**`id` vs `number`.** The sub-issue and dependency REST endpoints take the global database `id` (`gh api repos/{owner}/{repo}/issues/42 --jq .id`), while every `gh` subcommand and classic endpoint takes the per-repo `number`. Passing a number where an id belongs fails with a misleading 404/422. The verbs resolve the hop for you.

**`gh issue list` and `gh label list` stop at `--limit` (default 30) without saying so.** A repository's label taxonomy or backlog silently truncates. Pass `--limit 200` on labels; use `meyden-gh overview` for issues, which paginates properly and applies the repository scope.

**One commit can have several workflow runs**, one per workflow that triggers on it. "The pipeline" is a GitLab concept; on GitHub, triage iterates runs. `meyden-gh ci` does.

**`gh pr merge` makes one attempt and does not pin the revision unless told.** Pass `--match-head-commit <full-sha>` to refuse merging anything but the reviewed revision, or use `meyden-gh pr merge`, which pins it and retries the transient `405 Base branch was modified` error. On repos with auto-merge enabled, `--auto` delegates the waiting to GitHub.

**A repo setting can delete branches out from under you.** With *Automatically delete head branches* on, every merged PR's branch is removed, which is fatal for epic branches that several PRs share. Check `gh api repos/{owner}/{repo} --jq .delete_branch_on_merge` before merging epic work.

**The repo issue endpoints return PRs too.** `GET repos/{owner}/{repo}/issues` includes pull requests; filter out items with a `pull_request` key or counts are wrong. The verbs do.

**Never echo a raw API object wholesale.** Filter with `--jq` to the fields you need: the payloads are large, and echoing them into a transcript buries the answer.

## Getting parseable output

Prefer JSON and filter it, rather than parsing the human-readable tables (column-aligned, truncated, ANSI-colored). Unlike glab's `-F/-O` mess, gh is uniform: every read command takes `--json <fields>` plus a built-in `--jq`:

```bash
gh pr list --json number,title,author --jq '.[] | {number, title, author: .author.login}'
gh run list --json databaseId,conclusion --jq '.[] | select(.conclusion=="failure") | .databaseId'
gh issue view 42 --json title,body,labels,assignees,parent,subIssues,blockedBy
```

`--json` requires naming the fields; a bare `--json` errors with the list of available ones, which doubles as discovery. `gh api` also has `--jq`, plus `--paginate` (add `--slurp` to merge pages into one array).

## Targeting the right repository

`gh` infers the repository from the current directory's git remote, so **`cd` into the repo first** or pass `-R`:

```bash
gh pr list -R owner/repo
```

In `gh api` paths, `{owner}` and `{repo}` expand from the current repo the same way. `gh auth status` shows who you are authenticated as.

## Common workflows

**Open a PR, or rewrite its description.** Read [references/pr-description.md](references/pr-description.md) before writing or rewriting any PR description. It is the one template: the issue reference line per rule 3, then Summary, Evidence and Merge Danger, headed in the project's language. Write the body to a file and pass it with `--description-file` to `meyden-gh pr create`; for an existing PR, `gh pr edit <n> -F pr.md`. The Summary section is produced with the `dev-workflow:show-me` skill (Skill tool) when available; otherwise pick a view from the template's catalogue.

**Review a PR.** Gather description, diff and existing discussion before forming an opinion:

```bash
gh pr view 123 --json title,body,headRefName,baseRefName,state,reviewDecision
gh pr diff 123                    # plain patch, pipe-safe
gh api repos/{owner}/{repo}/pulls/123/comments --jq '.[] | {path, line, body}'   # so you don't repeat a point already made
gh pr checks 123                  # CI roll-up
```

Anchor review comments to a line rather than writing a wall-of-text summary:

```bash
gh api repos/{owner}/{repo}/pulls/123/comments -f body="This ignores the error return." \
  -f commit_id="$(gh pr view 123 --json headRefOid --jq .headRefOid)" \
  -f path=src/api.go -F line=42 -f side=RIGHT
gh pr comment 123 -b "Build is green."      # top-level, for non-line-anchored notes
```

**Triage a CI failure.** A fixed sequence (runs → failed jobs → logs), so use the verb:

```bash
meyden-gh ci --pr 123
meyden-gh ci --run 9182736450 --lines 300
```

Read the actual error out of the log before proposing a fix; "failed" alone tells you nothing. One case misleads if you only check job status: a run whose conclusion is **`startup_failure`** never got past parsing the workflow file, so there is no job log and "no failed jobs" is the wrong answer. The verb detects this and points at the parse error (running `actionlint` when it is installed, since GitHub has no server-side lint API).

**Break large work into an epic.** Work that splits into several tickets is an **epic**: one umbrella issue that owns them. This is the default for planned work: a phase, a feature, anything a planning session breaks down. What stays standalone is work that was never a body of work: a lone bug report, a single improvement, or whatever the user says to leave alone.

An epic is an **ordinary issue** with an `[Epic] ` title prefix. Its body opens with a TL;DR like any issue (rule 7), then records the starting position and the decisions taken during planning (the *why* that no child ticket carries). Its children are ordinary issues attached as **native sub-issues**: GitHub parents issue→issue directly, so no title suffixes, no hand-maintained checklists, no substitute link types:

```bash
meyden-gh issue sub create 42 --title "..." --body-file part.md   # new child under the epic
meyden-gh issue sub add 42 57                                     # adopt an existing issue
```

The parent relation is the single source of truth for membership. The epic renders its sub-issue list with a progress bar by itself; do not mirror the children into the body, because a hand-written copy drifts and then lies. One parent per issue, up to 100 children, nesting to 8 levels.

**Blocking is a separate mechanism from membership.** Sub-issues say "belongs to this epic"; dependencies say "can't start yet" (`meyden-gh issue link <ticket> <blocker> --type blocked_by`). The dependency renders in the UI on both issues and is what `meyden-gh graph` walks. Write the edge explicitly rather than relying on the inverse being inferred. Blocking edges may cross repositories; reference those as `owner/repo#N`.

**Grouping beyond one epic is done with labels, not nesting**: a workstream label, a bundle or release label, a priority label. Read the project's existing vocabulary and reuse it (rule 9); never invent a label to express structure, and never assume a project uses the same names as another.

A **milestone** groups work and gives it a due date; use it alongside, not instead of, the epic.

Propose the breakdown before creating a pile of items, then create the epic first so the children have something to reference.

## Reference files

- [references/conventions.md](references/conventions.md): the reasoning behind each mandatory rule above, and what the exceptions are. Read it when a rule seems wrong for the situation.
- [references/commands.md](references/commands.md): fuller per-command flag reference. Read it when you need a flag that isn't above, rather than guessing.
- [references/pr-description.md](references/pr-description.md): the PR description template. Read it before writing or rewriting any PR description.
- [references/api.md](references/api.md): `gh api` recipes for the gaps (sub-issues, dependencies, review comments, run logs, branch protection).

If a flag still isn't obvious, `gh <cmd> <subcmd> --help` is fast and authoritative; prefer it over guessing.
