# Agent Instructions

Guidance for Claude Code (and other agents) working in this repository.

## General Rules

* Remove all mannered prose

# What this project is

The meyden Claude Code plugin marketplace. It hosts internal plugins (commands, agents, skills)
that developers install into their own projects. There is no application code here — the
deliverable is the plugins themselves and the docs describing how to author and host them.

## Architecture

A single repo containing a marketplace manifest plus one directory per plugin:

- `.claude-plugin/marketplace.json` — the plugin catalog
- `plugins/<name>/` — one self-contained plugin each, with `.claude-plugin/plugin.json` and
  `commands/`, `agents/`, `skills/` at the plugin root
- `docs/` — authoring and GitHub hosting guides
- `examples/` — sample consumer configuration

Plugins are independent; changes stay inside the plugin being worked on.
See `docs/authoring-plugins.md` for the required layout.

## Operating Principles

- If asked to do too much work at once, stop and state that clearly.
- If computer use is helpful for completing or verifying work, shell out to gpt-5.5 with Codex skill for it.
- Implement only what the user explicitly requested.
- Prefer the smallest correct change that solves the actual problem.
- Keep changes localized and targeted.
- Prefer reusing existing code, utilities, patterns, and conventions before introducing anything new.
- Preserve existing architecture, naming, style, and project structure unless the task explicitly requires changing them.
- Do not perform "while I'm here" cleanups, opportunistic refactors, or unrelated modernization unless it was requested.
- Do not add unnecessary abstractions, indirection, configuration, dependencies, or files.

## Planning and Autonomy

- Read and understand the relevant existing files before proposing or making changes.
- For simple, obvious, localized fixes, proceed directly.
- For non-trivial work, inspect the relevant code first, then produce a concise implementation plan.
- Get explicit approval before implementing when the task:
  - affects multiple unrelated areas,
  - changes architecture,
  - changes public behavior,
  - modifies dependencies,
  - requires a product decision,
  - or involves meaningful ambiguity.
- Once a plan is approved, execute it autonomously without per-step confirmation.
- If implementation materially diverges from the approved plan, stop and report before continuing.
- Only pause when genuinely blocked or when a decision requires user input.
- When blocked, ask the smallest set of necessary questions and batch related questions into one message.

## Root Cause Analysis

Required for bugs, failures, regressions, broken behavior, unexpected output, or failing commands.

- Gather evidence first: error messages, logs, reproduction steps, relevant files, and exact file:line references where possible.
- Form hypotheses and validate them against the evidence. Do not guess.
- Keep asking why until the underlying cause is identified, not only the visible symptom.
- State the root cause explicitly before proposing or implementing the fix.
- The fix must address the root cause directly.
- Workarounds, symptom patches, broad try/catch wrappers, silent fallbacks, retries, and temporary fixes are forbidden unless explicitly approved.
- If the root cause is outside the task scope, stop and report instead of patching around it.

## Quality Bar

- Prefer targeted edits over refactors.
- Touch the minimum code necessary.
- Remove unnecessary complexity instead of adding to it.
- Implement clean, maintainable, and extendable code within the requested scope.
- In case we refactor, look for dead code and remove it.
- Use current stable, project-approved language and framework patterns.
- Avoid deprecated APIs and outdated patterns in code you touch.
- Do not modernize unrelated code, upgrade frameworks, or replace libraries unless explicitly requested.
- Before finalizing a non-trivial change, reassess whether the implementation is the simplest clean solution.
- If there is a clearly better approach within the approved scope, use it.
- Do not expand scope or refactor unrelated code in the name of elegance.

## Code and File Handling

- Always strive for concise, simple solutions.
- If a problem can be solved in a simpler way, propose it.
- Prefer editing existing files over creating new files.
- Create new files only when the requested change cannot be implemented cleanly in existing files.
- Never create documentation files, README files, CHANGELOG entries, migration notes, or implementation summaries unless explicitly requested.
- Keep related code consistent across the project.
- Do not add backward compatibility layers, migration shims, adapters, feature flags, or legacy fallbacks unless explicitly requested.
- Do not add defensive programming unless the motivation is explained and approved.

## Execution Efficiency

- When multiple independent inspections are needed, perform them in parallel where the tool environment supports it.
- Use subagents with the sonnet model on medium or low effort for non-trivial research, broad codebase exploration, independent review, or large file-reading tasks.
- Do not use subagents for simple localized edits.
- Subagents should usually investigate or review; the main agent remains responsible for final implementation decisions.

## Agent skills

### Issue tracker

Issues live in this repo's GitHub Issues. See `docs/agents/issue-tracker.md`.

### Domain docs

Single-context — `CONTEXT.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.