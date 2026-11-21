---
name: session-end
description: "Close a working session: land the work and verify it actually reached the remote. Extended per project and per user through skill-context."
disable-model-invocation: true
allowed-tools: Bash(git status:*), Bash(git log:*), Bash(git fetch:*)
---

# End a working session

## Project rules

!`bash "${CLAUDE_PLUGIN_ROOT}/scripts/lib/context.sh" session-end "${CLAUDE_PROJECT_DIR}"`

The baseline below is deliberately small. Rules injected above may add steps to
it, since this repo's own closing ritual belongs there rather than here.

## 1. One question, asked once

Bundle into a single message: is there anything worth a `CHANGELOG.md` entry, and
should the git state be committed and pushed? Anything the injected rules need
decided goes in the same message. Wait for the answer before touching anything.

## 2. Land the work

Only if the user said to commit. Three rules, each of them the residue of a real
failure:

- **Commit and push are separate Bash invocations.** A policy hook inspects the
  whole invocation before any of it runs, so one blocked push discards the commit
  alongside it, and the session reports a commit that never happened.
- **A push rejected with `fetch first`** → `git fetch`, `git rebase
  origin/<branch>`, push again. Session commits are local, so the rebase is safe.
  Stop and ask if it conflicts.
- **Verify every push**, per repo touched:

  ```
  git log --oneline @{upstream}..HEAD
  ```

  Empty output is the only thing that earns the word "pushed" in the report. Any
  output means the commits are still local: lead the report with that and name
  the next step. A protected branch rejects a push quietly; this is how three
  commits once sat stranded across two sessions.

## 3. Handoff

If the next session needs context to pick this up, point the user at
`/dev-workflow:handoff` and let that skill write it.

## 4. Close

Two or three lines on what the session accomplished.

**Done when** every push has been verified empty and every step the injected
rules added has run.
