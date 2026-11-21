# Supersede the official claude-md-management plugin

We are writing our own `claude-md` skill in `agent-toolkit` rather than adopting or configuring Anthropic's `claude-md-management` plugin, and uninstalling that plugin once ours ships. Two skills claiming "audit my CLAUDE.md" make triggering a coin flip, and the official one is behind the current documentation — it has no notion of `.claude/rules/`, still describes the `#` shortcut as writing to CLAUDE.md when it now writes to auto memory, and names `.claude.local.md` for a file actually called `CLAUDE.local.md`. Its quality criteria remain a useful checklist and we keep it as a reference, not a dependency.

## Considered Options

- **Differentiate** — ours opinionated toward meyden conventions, theirs kept for generic work. Rejected: both would still match the same request, which is the ambiguity we were trying to avoid.
- **Configure theirs** — rejected: the gaps are in its model of the tool, not in its settings.

## Consequences

Tracking Claude Code's evolution is now our job. When the documentation changes, `references/mechanics.md` is what goes stale, which is why it is isolated in its own file.
