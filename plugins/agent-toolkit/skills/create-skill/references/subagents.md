# Subagents reference (Claude Code ≥ v2.1.220)

Verified against https://code.claude.com/docs/en/sub-agents. Read this when a skill sets `context: fork`, when choosing or writing an `agent:` target, or when the task is to author a subagent rather than a skill.

**Contents**
- [Skill or subagent?](#skill-or-subagent)
- [Where subagent files live](#where-subagent-files-live)
- [Frontmatter reference](#frontmatter-reference)
- [Tools](#tools)
- [Model resolution](#model-resolution)
- [Permission modes](#permission-modes)
- [Skills and subagents, both directions](#skills-and-subagents-both-directions)
- [Persistent memory](#persistent-memory)
- [Worktree isolation](#worktree-isolation)
- [Built-in subagents](#built-in-subagents)
- [Invoking a subagent](#invoking-a-subagent)
- [Foreground and background](#foreground-and-background)
- [Limits](#limits)
- [What loads at startup](#what-loads-at-startup)
- [Forks](#forks)
- [Bundling a subagent with a skill](#bundling-a-subagent-with-a-skill)
- [Writing a subagent well](#writing-a-subagent-well)

## Skill or subagent?

They solve different problems and compose well:

| | Skill | Subagent |
| :-- | :-- | :-- |
| Runs in | The main conversation | Its own context window |
| Carries | Instructions/reference the main agent follows | A system prompt, tool restrictions, its own permissions |
| Returns | Nothing; it *is* the conversation | A summary; intermediate output never reaches you |
| Reach for it when | You want a reusable prompt or workflow in context | A side task would flood your context with output you'll never reference again |

Use the **main conversation** for work needing back-and-forth, shared context across phases, or low latency, since a subagent starts fresh and must gather its own context.

Use a **subagent** when the task produces verbose output you don't need, when you want tool or permission restrictions enforced, or when the work is self-contained enough to return just a summary.

## Where subagent files live

A subagent is a markdown file: YAML frontmatter, then the body as its system prompt.

| Location | Scope | Priority |
| :-- | :-- | :-- |
| Managed settings `.claude/agents/` | Organization-wide | 1 (highest) |
| `--agents` CLI flag (JSON) | Current session only | 2 |
| `.claude/agents/` | Current project | 3 |
| `~/.claude/agents/` | All your projects | 4 |
| Plugin `agents/` directory | Where the plugin is enabled | 5 (lowest) |

**This precedence is inverted relative to skills.** For skills, personal beats project; for subagents, **project beats user**. Don't carry the intuition across.

- Identity comes only from the `name` field; the filename is irrelevant, and both `.claude/agents/` and `~/.claude/agents/` are scanned **recursively**, so `agents/review/security.md` is fine. For plugins the subfolder *does* become part of the identifier (`my-plugin:review:security`).
- `name` must be lowercase letters and hyphens, and **cannot contain `:`**, which is reserved for plugin scoping. A file with `:` in its name isn't loaded (error goes to the debug log).
- Duplicate names in the same directory tree: only one loads, chosen by filesystem read order. `/doctor` reports these. Across nested project directories, the definition closest to the working directory wins.
- Project subagents are found by walking up from the working directory to the repo root; `--add-dir` directories contribute theirs too.
- Claude Code watches both directories and picks up edits within seconds. Two cases still need a restart: creating a scope's *first* agent file in a new `agents/` directory, and sessions started with `--disable-slash-commands`.

## Frontmatter reference

Only `name` and `description` are required.

| Field | Description |
| :-- | :-- |
| `name` | Unique id, lowercase and hyphens, no `:`. Hooks receive it as `agent_type`. |
| `description` | When Claude should delegate here. This is the triggering mechanism, so include "use proactively" to encourage automatic delegation. |
| `tools` | Allowlist of tools. Inherits everything available to subagents if omitted. To preload skills use the `skills` field, not `Skill` here. |
| `disallowedTools` | Denylist, removed from the inherited or specified list. |
| `model` | `sonnet`, `opus`, `haiku`, `fable`, a full id like `claude-opus-5`, or `inherit`. Defaults to `inherit`. |
| `permissionMode` | `default`, `acceptEdits`, `auto`, `dontAsk`, `bypassPermissions`, `plan`, or `manual` (alias for `default`). |
| `maxTurns` | Cap on agentic turns before the subagent stops. |
| `skills` | Skills whose **full content** is injected at startup. |
| `mcpServers` | MCP servers for this subagent: a name referencing a configured server, or an inline definition. |
| `hooks` | Lifecycle hooks scoped to this subagent. |
| `memory` | `user`, `project`, or `local`: a persistent directory across conversations. |
| `background` | `true` forces background execution even when Claude wants the result immediately. Unset, Claude chooses (and defaults to background). |
| `effort` | `low`, `medium`, `high`, `xhigh`, `max`. Overrides session effort. |
| `isolation` | `worktree` runs the subagent in a temporary git worktree. |
| `color` | Display color in the task list: `red`, `blue`, `green`, `yellow`, `purple`, `orange`, `pink`, `cyan`. |
| `initialPrompt` | Auto-submitted as the first user turn when this agent runs as the *main session* agent (`--agent` or the `agent` setting). Skills and commands in it are processed. |

**Plugin subagents ignore `hooks`, `mcpServers`, and `permissionMode`** for security reasons. Copy the file into `.claude/agents/` if you need them.

Minimal example:

```markdown
---
name: code-reviewer
description: Reviews code for quality and best practices. Use proactively after code changes.
tools: Read, Glob, Grep
model: sonnet
---

You are a code reviewer. Analyze the code and give specific, actionable
feedback on quality, security, and best practices.
```

The `--agents` CLI flag accepts the same fields as JSON, using `prompt` in place of the markdown body.

## Tools

Subagents inherit the main conversation's built-in and MCP tools, then **two filters** narrow the set.

**Filter 1, removed from every subagent**, even if listed in `tools`:

`AskUserQuestion`, `EndConversation`, `EnterPlanMode`, `ScheduleWakeup`, `TaskOutput`, `WaitForMcpServers`, `Workflow`, plus `ExitPlanMode` (unless `permissionMode: plan`) and `Agent` (at the depth limit).

**Filter 2, background subagents** keep every MCP tool but only these built-ins:

`Read`, `Grep`, `Glob`, `Bash`, `PowerShell`, `Edit`, `Write`, `NotebookEdit`, `WebFetch`, `WebSearch`, `TodoWrite`, `Skill`, `ToolSearch`, `EnterWorktree`, `ExitWorktree`, `Monitor`, `TaskStop`, `SendMessage`, `Artifact`.

Since background is the default, **the same definition can resolve to different tools depending on where it runs**. If a subagent's work depends on a tool outside that list, it needs to run in the foreground. Forks skip both filters entirely.

Rules:

- `disallowedTools` is applied first, then `tools` resolves against what remains. A tool in both is removed.
- Both accept MCP server patterns: `mcp__<server>` or `mcp__<server>__*`. In `disallowedTools`, `mcp__*` removes every MCP tool.
- If nothing in `tools` resolves to a real tool, the subagent refuses to launch with an error naming the bad entries.
- Listing `Agent` lets a subagent spawn its own subagents (within the depth limit). Omit it, or add it to `disallowedTools`, to keep one read-only.
- `Agent(worker, researcher)` restricts *which* types can be spawned, but this allowlist only applies to an agent running as the main thread via `claude --agent`. Inside a subagent definition, the parenthesized list is ignored.

## Model resolution

Resolved in this order, first match wins:

1. `CLAUDE_CODE_SUBAGENT_MODEL` environment variable
2. The per-invocation `model` parameter Claude passes when spawning
3. The definition's `model` frontmatter
4. The main conversation's model

Values excluded by an organization's `availableModels` allowlist are skipped and the subagent runs on the inherited model. Subagents inherit the main conversation's extended-thinking setting; there is no per-subagent thinking control.

## Permission modes

| Mode | Behavior |
| :-- | :-- |
| `default` | Standard prompting |
| `acceptEdits` | Auto-accept edits and common filesystem commands in the working directory |
| `auto` | A background classifier reviews commands and protected-directory writes |
| `dontAsk` | Auto-deny anything that would prompt; explicitly allowed tools still work |
| `bypassPermissions` | Skip prompts |
| `plan` | Read-only exploration |

**The parent can override the child.** If the parent runs `bypassPermissions` or `acceptEdits`, that takes precedence and the subagent's field can't loosen or tighten it. If the parent is in auto mode, the subagent inherits auto mode and its `permissionMode` is ignored entirely.

`bypassPermissions` still prompts for explicit `ask` rules, connector tools an organization set to `ask`, MCP tools marked `requiresUserInteraction`, and root/home removals.

## Skills and subagents, both directions

These are inverses of one another, and mixing them up is a common authoring error:

| Approach | System prompt | The task | Also loads |
| :-- | :-- | :-- | :-- |
| Skill with `context: fork` | From the agent type | The SKILL.md content | CLAUDE.md, unless the agent is Explore or Plan |
| Subagent with `skills:` | The subagent's markdown body | Claude's delegation message | The preloaded skills + CLAUDE.md |

With `context: fork` you write the task in the skill and pick an agent to execute it. With `skills:` you write the agent and preload reference material into it.

Preloading notes:

- The **full content** of each listed skill is injected at startup, not just the description.
- `skills:` controls what is *preloaded*, not what is *reachable*; the subagent can still invoke other skills through the Skill tool. To prevent that, drop `Skill` from `tools` or add it to `disallowedTools`.
- **A skill with `disable-model-invocation: true` cannot be preloaded**, since preloading draws from the same set Claude can invoke. That includes the bundled `/verify` and `/code-review`.
- A missing or disabled skill in the list is skipped with a debug-log warning.

## Persistent memory

`memory` gives the subagent a directory that survives across conversations.

| Scope | Location | Use when |
| :-- | :-- | :-- |
| `user` | `~/.claude/agent-memory/<name>/` | Learnings should apply across all projects |
| `project` | `.claude/agent-memory/<name>/` | Knowledge is project-specific and worth version-controlling |
| `local` | `.claude/agent-memory-local/<name>/` | Project-specific but shouldn't be committed |

`project` is the recommended default. When memory is on, the subagent's system prompt gains memory instructions plus the first 200 lines (or 25KB) of `MEMORY.md`, and Read/Write/Edit are automatically enabled so it can maintain its own files.

Memory is part of auto memory, so disabling that (`autoMemoryEnabled`, `CLAUDE_CODE_DISABLE_AUTO_MEMORY`) makes the field a no-op. Prompt the subagent to consult and update its memory in the body, or it mostly won't.

## Worktree isolation

`isolation: worktree` gives the subagent its own git worktree, branched from your **default branch** rather than the parent's `HEAD`. It's cleaned up automatically if the subagent changes nothing.

Bash and PowerShell commands then run inside the worktree. A command whose working directory resolves back to the main checkout fails rather than running there. For Bash, Claude Code also inspects the command itself: redirecting git into the main checkout via `git -C`, `--git-dir`, `GIT_DIR`/`GIT_WORK_TREE`, or a `cd` fails, as does a command too complex to analyze, with an error asking for it to be split up.

Note that `cd` never persists between tool calls inside a subagent, and never affects the main conversation.

## Built-in subagents

| Agent | Model | Tools | Use |
| :-- | :-- | :-- | :-- |
| `Explore` | Inherits, capped at Opus on the Claude API | Read-only; Write/Edit denied | File discovery, code search |
| `Plan` | Inherits | Read-only | Codebase research during plan mode |
| `general-purpose` | Inherits | Everything available to subagents | Multi-step work needing exploration *and* changes |
| `claude` | Inherits | Everything available to subagents | Catch-all; default for dispatched background sessions |
| `statusline-setup` | Sonnet | - | `/statusline` |
| `claude-code-guide` | Haiku | - | Questions about Claude Code |

**Explore and Plan skip CLAUDE.md and git status** to stay fast and cheap; every other built-in and custom subagent loads both. So a forked skill using `agent: Explore` sees only the SKILL.md content and the agent's own prompt; if a project rule matters to it, restate it in the skill.

A user or project subagent named `Explore` overrides the built-in; define one with `model: haiku` to keep exploration cheap.

## Invoking a subagent

- **Automatic**: Claude delegates based on your request, the `description` field, and context. "Use proactively" in the description encourages it.
- **Natural language**: "Use the test-runner subagent to fix failing tests." No special syntax.
- **@-mention**: guarantees *which* subagent runs (not what prompt it gets; Claude still writes the task). Type `@` and pick, or write `@agent-<name>` manually.
- **Whole session**: `claude --agent code-reviewer` replaces the main system prompt with the subagent's, along with its tools and model. CLAUDE.md still loads. Set `"agent": "code-reviewer"` in `.claude/settings.json` to make it the project default; the CLI flag wins over the setting.

## Foreground and background

Subagents run in the **background by default**. Claude runs one in the foreground when it needs the result to continue.

- Background: you keep working; permission prompts surface in your main session naming the asking subagent; results arrive as a completion notification in a later turn. Ctrl+B backgrounds a running task.
- Background subagents get the narrower tool set described above, the single biggest gotcha when a subagent "can't do" something it could do interactively.
- A subagent cut off by an API error reports the failure rather than returning the error text as findings. With partial output, you get that output plus a note it didn't finish.
- `CLAUDE_CODE_DISABLE_BACKGROUND_TASKS=1` forces everything to the foreground.

## Limits

Three independent limits, each with its own environment variable:

| Limit | Default | Variable |
| :-- | :-- | :-- |
| Nesting depth below the main conversation | 3 | `CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH` (`1` disables nesting) |
| Total spawned per session | 200 | `CLAUDE_CODE_MAX_SUBAGENTS_PER_SESSION` |
| Running concurrently | 20 | `CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS` (not enforced under ultracode) |

At the depth limit, `Agent` is withheld so the deepest subagent does its own work. Finished subagents still count toward the session total; `/clear` resets it. Workflow `agent()` calls have their own separate limit.

## What loads at startup

A non-fork subagent starts with a fresh context containing:

- **Its system prompt**: the markdown body or `prompt` field, plus environment details. Not the full Claude Code system prompt.
- **The delegation message** Claude writes when handing off.
- **CLAUDE.md** at every level the main conversation loads, except for Explore and Plan.
- **Git status**: a snapshot from the parent session's start; absent outside a repo. Explore and Plan skip it.
- **Preloaded skills** from `skills:`.
- **A sibling roster** listing `main` and other named agents, as valid `SendMessage` targets, but only when the subagent has `SendMessage` and at least one other agent is named.

What never reaches it: your conversation history, skills you've already invoked, files already read, your output style, and the main conversation's auto memory.

## Forks

A fork inherits the entire conversation instead of starting fresh: same system prompt, tools, model, and history. Its tool calls stay out of your context and only the final result returns.

| | Fork | Named subagent |
| :-- | :-- | :-- |
| Context | Full conversation history | Fresh, plus the delegation prompt |
| System prompt and tools | Same as main session | From its definition, filtered for background |
| Model | Same as main session | From its `model` field |
| Prompt cache | Shared with main session | Separate |

Because the system prompt and tools match the parent, a fork's first request reuses the parent's prompt cache, which is cheaper than a fresh subagent when the task needs the same context. Start one with `/subtask <task>`. A fork can't spawn further forks.

## Bundling a subagent with a skill

**An `agents/` folder inside a plain skill directory does nothing.** A skill loads `SKILL.md` plus the supporting files it points at; subagents are discovered only from `.claude/agents/`, `~/.claude/agents/`, managed settings, `--agents`, or a plugin. Dropping `agents/reviewer.md` into `.claude/skills/my-skill/` registers no `reviewer` agent, and the folder name invites everyone afterwards to write `agent: reviewer` and get an unresolvable type.

Four ways to pair a subagent with a skill, and they scope very differently:

| Approach | Registered as a type? | Live when | Cost |
| :-- | :-- | :-- | :-- |
| **Prompt file** in the skill, passed as text | No | Only when your code sends it | None |
| **`--agents` JSON** at spawn time | Yes, for that process only | Only that run | None persistent |
| **`.claude/agents/`** or `~/.claude/agents/` | Yes | Always | Its description sits in the agent listing permanently |
| **Plugin bridge** (`.claude-plugin/plugin.json`) | Yes | Whenever the plugin is enabled | Namespacing, trust gate, reload step |

The distinction that usually decides it: **neither persistent option is scoped to the skill.** A registered agent is live whether or not the skill was invoked, and you pay for its description on every turn. There is no "register this agent only while my skill runs".

So work backwards from why you want a type at all:

- **Does Claude need to select it by name**, via `agent:` in a `context: fork` skill, or automatic delegation? Then it must be registered: `.claude/agents/` for a project, `~/.claude/agents/` for yourself. Accept the permanent listing cost.
- **Is your own code spawning it**, a script running `claude -p`, or a prompt you hand to the Agent tool? Then it never needs to be a type. Keep the text in a file under the skill (`prompts/` reads honestly; `agents/` does not) and pass it as the prompt. If that spawned process genuinely needs agent *configuration* (restricted tools, a specific model), pass `--agents` JSON so the definition exists only for that process.

### The plugin bridge, precisely

Any folder under a skills directory containing `.claude-plugin/plugin.json` loads as a plugin named `<name>@skills-dir` on the next session, discovered in place, no marketplace, no install step. It can then bundle `agents/`, `hooks/`, `.mcp.json`, and `output-styles/`.

Know what you're taking on:

- A `SKILL.md` at the plugin root becomes a **plugin skill**, and plugin skills are namespaced, which changes how the skill is invoked.
- **Project scope** (`<cwd>/.claude/skills/`) loads only after the workspace trust dialog, its MCP servers need per-server approval, and background monitors don't load at all. Personal scope (`~/.claude/skills/`) has none of these restrictions.
- Project-scope `@skills-dir` plugins load **only from the `.claude/skills/` of the directory you started Claude Code in**; they do not walk up to the repo root the way plain skills do. Launch from the root or run `/reload-plugins`.
- Live reload covers `SKILL.md` text only. Changes to `agents/`, `hooks/`, `.mcp.json`, and `output-styles/` need `/reload-plugins` or a restart.
- Plugin subagents ignore `hooks`, `mcpServers`, and `permissionMode`.
- Disable with `claude plugin disable <name>@skills-dir`; there's no uninstall, since nothing was installed.

This is the right tool when you're distributing a coherent bundle: skill plus its agents plus its hooks. It is the wrong tool for "I want one helper agent for one skill".

## Writing a subagent well

The body is a system prompt, not a document, yet the same craft applies: call the Skill tool for `agent-toolkit:writing-for-agents` before writing one. The differences:

- **The description is the delegation trigger.** Same discipline as a skill description: say what it does and when to hand off to it, in the words that will appear in real requests.
- **Give it a completion criterion.** A subagent returns one summary and can't be corrected mid-flight, so a vague bar produces a vague summary you then have to chase.
- **Say what to return, and in what shape.** The summary is the entire product. "Report findings" gets prose; "report each finding as file:line, severity, and a one-line fix" gets something usable.
- **Restrict tools to enforce intent, not to be tidy.** A reviewer that can't `Write` cannot quietly "fix" what it was asked to report on.
- **Remember it starts blind.** No conversation history, no files you've read. Anything it needs must be in its prompt, its preloaded skills, or discoverable with its tools.
