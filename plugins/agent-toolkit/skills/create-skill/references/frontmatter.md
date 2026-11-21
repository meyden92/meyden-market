# Frontmatter reference (Claude Code ≥ v2.1.220)

Verified against https://code.claude.com/docs/en/skills#frontmatter-reference. All fields are optional; only `description` is recommended. Malformed YAML doesn't break `/name` invocation, but Claude gets no description to match against (debug with `--debug`).

Booleans accept `true/false`, and since v2.1.218 also `yes/no/on/off/1/0` in any case. Still, write `true`/`false` for portability.

## Field-by-field decision guide

### `name`
Display label in skill listings. The **command name comes from the directory name** for personal/project skills, so `name` does NOT change what you type. (Plugin skills differ: there `name` sets the last command segment.) Use when: you want a prettier listing label, or you're authoring a plugin skill. Skip when: it would just duplicate the directory name (harmless but redundant; conventional to include anyway).

### `description`
What the skill does AND when to use it, the primary triggering mechanism. Key use case first: combined `description` + `when_to_use` is truncated at 1,536 chars in the listing (cap configurable via `skillListingMaxDescChars`). If omitted, the first paragraph of the body is used. Claude undertriggers skills, so be a bit pushy ("Use whenever the user mentions X, Y, Z, even if they don't say 'X'"). Always set this.

### `when_to_use`
Extra triggering context: trigger phrases, example requests. Appended to `description` in the listing, counts toward the same 1,536-char cap. Use when: trigger phrases would clutter the capability description. Skip when: the description already covers triggering in its budget. Current and documented: the `plugin-dev` marketplace's `skill-reviewer` agent calls it deprecated, which the official reference does not; treat every field documented here as usable.

### `argument-hint`
Autocomplete hint, e.g. `[issue-number]` or `[filename] [format]`. Use when: the skill takes arguments and users invoke it by hand. Skip when: no arguments. YAML note: quote values that start with `[` or YAML parses them as a list.

### `arguments`
Named positional arguments for `$name` substitution; space-separated string or YAML list; names map to positions in order (`arguments: [issue, branch]` → `$issue` = first arg, `$branch` = second). Use when: multiple arguments where `$issue` reads better than `$0`. Skip when: zero or one argument (`$ARGUMENTS` suffices). Unmatched named placeholders expand to empty string; unmatched `$N` stays literal.

### `disable-model-invocation`
`true` → only the user can invoke; the skill's description is removed from Claude's context entirely; also blocks preloading into subagents and (≥v2.1.196) scheduled-task invocation. Use when: side effects or timing the user must control (deploy, commit, send-message), or to keep a rarely-needed skill out of the listing budget. Skip when: you want automatic triggering, which is the point of most skills.

### `user-invocable`
`false` → hidden from the `/` menu; only Claude invokes it. Use when: background knowledge that isn't a meaningful user action (e.g. `legacy-system-context`). Skip otherwise. Note: this only controls menu visibility, NOT Skill-tool access; use `disable-model-invocation: true` to block Claude.

Invocation matrix:

| Frontmatter | You | Claude | Context behavior |
| :-- | :-- | :-- | :-- |
| (default) | Yes | Yes | Description always in context; body loads on invoke |
| `disable-model-invocation: true` | Yes | No | Description NOT in context; body loads when you invoke |
| `user-invocable: false` | No | Yes | Description always in context; body loads on invoke |

### `allowed-tools`
Tools Claude may use **without permission prompts during the turn that invokes the skill**; the grant clears on the user's next message (re-invoking re-applies it). It does NOT restrict other tools. Space- or comma-separated string, or YAML list; same rule syntax as permission settings, e.g. `Bash(git add *)`. Use when: the skill's workflow runs known commands (especially bundled scripts) and prompts would break the flow. Skip when: the skill only reads/writes files or you can't scope the rules tightly. For project skills it takes effect only after workspace trust. For session-wide pre-approval use permission settings instead.

Key pattern, a bundled script without prompts (`${CLAUDE_SKILL_DIR}` substitutes in both body and allowed-tools Bash rules, ≥v2.1.129):

```yaml
allowed-tools: Bash(python3 ${CLAUDE_SKILL_DIR}/scripts/render.py *)
```
…and in the body: ``Run `python3 ${CLAUDE_SKILL_DIR}/scripts/render.py <file>` ``. Rule and body must match so the prompt-free grant actually applies.

### `disallowed-tools`
Tools **removed from the pool** while the skill is active (clears on next user message). Use when: an autonomous/background skill must never call something (e.g. `AskUserQuestion` in a loop skill). Skip for ordinary skills. Can't remove `EndConversation` while other tools remain.

### `model`
Model override while the skill is active (rest of the current turn; session model resumes next prompt). Accepts `/model` values or `inherit`. Use when: the skill genuinely needs a different tier (e.g. a bulk-mechanical skill on a cheaper model). Skip by default, since inheriting the session model is almost always right. Values excluded by an org `availableModels` allowlist are ignored.

### `effort`
Effort override (`low`/`medium`/`high`/`xhigh`/`max`; availability depends on model). Use when: a mechanical skill wastes reasoning at high effort, or a hard-analysis skill needs more. Skip by default. Body alternative: include `ultrathink` in content for one-off deep reasoning.

### `context`
`fork` → the skill body becomes the prompt of an isolated subagent with no conversation history. Only makes sense for **explicit task instructions**; guideline-only content forks into nothing useful. Use when: self-contained tasks whose intermediate output would pollute the main context (research sweeps, report generation, reviews). Skip when: the skill must see or shape the ongoing conversation.

### `agent`
Which subagent type executes a `context: fork` skill: `Explore`, `Plan`, `general-purpose` (default), or any custom agent from `.claude/agents/`. Explore/Plan skip CLAUDE.md and git status for a leaner context. Only meaningful with `context: fork`. Agent capabilities, tool filters, and precedence: [subagents.md](subagents.md).

### `background`
Only with `context: fork`. Default `true` (≥v2.1.218): the fork runs in the background and the result arrives later; note backgrounded forks get the narrower background-subagent tool set, and their edits bypass session checkpoints (`/rewind` won't undo them). Set `false` to block the invoking turn and keep the full tool set. Use `false` when: the turn needs the result to continue, or the skill depends on tools unavailable in background subagents.

### `hooks`
Hooks scoped to the skill's lifecycle (format: https://code.claude.com/docs/en/hooks#hooks-in-skills-and-agents). Use when: the skill needs deterministic enforcement around tool events while active (e.g. block edits to generated files, post-run formatting). Skip when: instructions suffice; hooks are the escalation path for behavior the model keeps getting wrong.

### `paths`
Glob patterns (comma-separated string or YAML list) limiting **automatic** loading to work on matching files; same format as path-specific memory rules. Use when: the skill only applies to part of a repo (e.g. `packages/api/**`). Skip when: generally applicable; needless `paths` makes a skill mysteriously not trigger.

### `shell`
`bash` (default) or `powershell`, the shell for `` !`cmd` `` / ```` ```! ```` blocks. Use when: authoring for Windows/PowerShell environments. Skip on macOS/Linux.

## String substitutions

Substituted in the body (and `${CLAUDE_SKILL_DIR}`/`${CLAUDE_PROJECT_DIR}` also in `allowed-tools` Bash rules):

| Variable | Expands to |
| :-- | :-- |
| `$ARGUMENTS` | Full argument string as typed. If absent from the body but args were passed, Claude Code appends `ARGUMENTS: <value>` to the content |
| `$ARGUMENTS[N]` / `$N` | 0-based positional arg (shell-style quoting: `/skill "hello world" x` → `$0` = `hello world`) |
| `$name` | Named arg declared in `arguments:` |
| `${CLAUDE_SKILL_DIR}` | Directory containing SKILL.md, used for every bundled-file path (allowed-tools substitution ≥v2.1.129) |
| `${CLAUDE_PROJECT_DIR}` | Project root, same value hooks receive (≥v2.1.196) |
| `${CLAUDE_SESSION_ID}` | Current session ID (logs, session-scoped files) |
| `${CLAUDE_EFFORT}` | Active effort level (`low`…`max`; ultracode reports `xhigh`) |

Escaping: `\$1` renders a literal `$1`; only a single backslash directly before the token escapes; `\\$1` keeps both backslashes AND substitutes.

## Dynamic context injection

`` !`command` `` (at line start or after whitespace) runs **before** Claude sees the content; the output replaces the placeholder. Multi-line commands: fenced block opened with ```` ```! ````. One pass only; emitted output is not re-scanned. `KEY=!`cmd`` (no preceding whitespace) is left literal. Disabled entirely when `disableSkillShellExecution: true` is set in (usually managed) settings, so don't build skills that fail closed on that.

Use for live state the instructions depend on (diffs, PR data, env versions). Don't use for anything slow or side-effectful: it runs on every invocation before Claude can decide anything.

## Command naming

- Personal/project skill: command = directory name (`.claude/skills/deploy-staging/` → `/deploy-staging`); `name` is display-only
- Nested skill with a name clash: `apps/web/.claude/skills/deploy/` → `/apps/web:deploy`
- `.claude/commands/deploy.md` → `/deploy` (legacy commands still work, same frontmatter)
- Plugin: `/plugin-name:skill-name`, last segment overridable via `name` (≥v2.1.216 keeps the prefix)
