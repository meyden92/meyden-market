---
name: implement
description: "Implement a piece of work based on a spec or set of tickets."
disable-model-invocation: true
---

## Project rules

!`bash "${CLAUDE_PLUGIN_ROOT}/scripts/lib/context.sh" implement "${CLAUDE_PROJECT_DIR}"`


Implement the work described by the user in the spec or tickets, committing to the current branch.

## How to build

Every implementer (you, or a subagent you start) builds the same way:

- Call the Skill tool with "dev-workflow:tdd" where possible, at pre-agreed seams.
- Run typechecking regularly, single test files regularly, and the full test suite once at the end.
- Commit to the current branch.

## A single ticket

Implement it in this conversation, then call the Skill tool with "dev-workflow:code-review" to review the work and fix what it raises.

## A spec with tickets

An epic's tickets are not a list of steps. They form a **task graph**: each ticket's blocking edges say what must land first, so there is always a **frontier** of tickets whose blockers are all done.

Run the whole epic without asking between tickets. Stop and ask only when you are blocked: a ticket is unclear or contradicts the spec, or tests stay red after an implementer's fix attempt.

Start every subagent with a fresh context window.

1. Read the epic and its tickets until you can name the task graph and its current frontier. The epic's native sub-issues are the tickets and each ticket's `blocked_by` links are the edges; `meyden-gh graph <epic>` (see `github-flow:github`) shows which tickets can start.
2. Work on the branch `epic/<epic>-<slug>`, the slug taken from the epic's title. Switch to it when it exists; otherwise create it from the remote's default branch (`gh repo view --json defaultBranchRef`). Tickets with a `Refs #<ticket>` commit on the branch are already done. Uncommitted changes found on the branch belong to the first unfinished ticket; its implementer continues from them.
3. Optional: when the tickets need exploration (relevant code, external docs), run one exploration subagent first. It saves its notes as markdown in a directory outside the repo that every later subagent can read, so implementers spend their context on building.
4. Walk the frontier **one ticket at a time**. For each ticket, start a fresh implementer subagent and wait for it to finish before starting the next. All implementers share one working tree and one branch, so two at once would build on each other's half-finished changes. Do not use worktrees. Brief each one through **context pointers** (the epic, its ticket, the exploration notes, the commits already on the branch) rather than restating what those hold. Each implementer moves its ticket to the doing status through `github-flow:github`, builds as described above, and lands its ticket as one commit whose message ends with `Refs #<ticket>`.
5. After each implementer returns, confirm its commit is on the branch and the tests pass, then recompute the frontier.
6. Once every ticket is done, call the Skill tool with "dev-workflow:code-review" on the branch since the default branch, against the epic, and fix everything it raises in a single implementer subagent.
7. Push the branch and open a pull request to the default branch through `github-flow:github`, following its PR conventions. Do not merge it and do not close any issue.

**Done when** every ticket in the task graph has its commit on the branch, the full test suite passes, every code-review finding is fixed or reported to the user with the reason it stands, and the pull request is open.
