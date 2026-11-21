---
name: session-start
description: "Open a working session: bring the repo up to date, surface what's open, and propose a first task. Extended per project and per user through skill-context."
argument-hint: "[what you're working on]"
disable-model-invocation: true
allowed-tools: Bash(git status:*), Bash(git log:*), Bash(git pull --ff-only)
---

# Start a working session

## Project rules

!`bash "${CLAUDE_PLUGIN_ROOT}/scripts/lib/context.sh" session-start "${CLAUDE_PROJECT_DIR}"`

The baseline below is deliberately small. Rules injected above may add steps to
it, since this repo's own opening ritual belongs there rather than here.

## 1. Repo state

`git status --short` and `git log -3 --oneline`, issued in one message. Clean tree → `git pull
--ff-only`. Dirty tree, or a fast-forward that fails → report the exact state and
ask how to proceed: stash then pull, rebase, or leave it. This one is the user's
call; `git reset` and `--force` stay out of it.

## 2. Open work

Only when the `github-flow:github` skill is available: invoke it for this repo's
open issues, and before proposing one, have it resolve that issue's blocker
chain. Without that skill, skip this step; the tracker conventions live there,
not here.

## 3. Report and propose

One short report: repo state (pulled or already current, at which commit) and
open issues if any were found. Then name one concrete first task and ask
what to start with. Arguments passed to this skill say what the user came to work
on, so let them pick the task.

**Done when** the user has a first task in front of them and every step the
injected rules added has run.
