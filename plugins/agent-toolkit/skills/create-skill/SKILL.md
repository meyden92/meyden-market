---
name: create-skill
description: Create Claude Code skills, edit and improve existing ones, audit frontmatter and structure against the current spec, measure a skill with evals and benchmarks, and optimize a description for triggering accuracy.
when_to_use: Trigger phrases include "create a skill", "make this a skill", "turn this into a skill", "make this repeatable", "edit/update/improve my X skill", "why isn't my skill triggering", "my skill isn't working", "audit my skills", "review this SKILL.md", "run skill evals", "benchmark my skill".
user-invocable: false
allowed-tools: Bash(python3 ${CLAUDE_SKILL_DIR}/scripts/*), Bash(${CLAUDE_SKILL_DIR}/scripts/init_skill.sh *), Bash(python3 ${CLAUDE_SKILL_DIR}/eval-viewer/generate_review.py *), Bash(python3 -m scripts.run_loop *)
---

# Skill Creator

Request: $ARGUMENTS (empty → the conversation is the request).

A skill exists to pull determinism out of a stochastic system. What you are making predictable is the **process** the agent follows, not the text it emits; that is the standard every decision below answers to.

## Route

| The user wants | Start at |
| :-- | :-- |
| A new skill, or "turn this into a skill" | [Capture intent](#capture-intent) |
| An existing skill changed or improved | [Diagnose](#diagnose-before-editing) |
| A skill that won't fire, or fires too often | [Diagnose](#diagnose-before-editing), then [references/triggering.md](references/triggering.md) |
| A subagent, or a skill that forks into one | [references/subagents.md](references/subagents.md) |
| Their skills checked over | [Audit](#audit) |
| Numbers: does this skill actually help? | [references/evaluating.md](references/evaluating.md) |
| It installed, shared, committed, or released inside a plugin | [Ship it](#ship-it) |

If the user says they'd rather just iterate by hand, skip the eval machinery and stay in the draft → validate loop.

## Capture intent

The conversation may already contain the workflow the user wants captured: "turn this into a skill" means the transcript above is the spec. Mine it first for tools used, order of steps, corrections the user made, and input/output formats, then confirm only the gaps.

Otherwise ask:

1. What should this let Claude do?
2. When should it fire, in the words the user actually types?
3. Who invokes it? User-only (side effects, timing they control), Claude-only (background knowledge), or both.
4. Inline or isolated? Default is inline; `context: fork` suits self-contained tasks whose intermediate work would clutter the conversation. See [references/subagents.md](references/subagents.md) for picking the agent that runs it.
5. Does it need live state at invocation time (a diff, a PR, today's date)?
6. What does good output look like?
7. Are there objectively checkable outcomes? That decides whether evals are worth building.
8. Where does it live: this project's `.claude/skills/`, the user's `~/.claude/skills/`, or a plugin?
   Ask unless the request or the files it names settle it; "everywhere" does not.

Ask about edge cases, example files, and dependencies here rather than after drafting. If docs or MCP research would sharpen the draft, do it now and arrive with the context so the user isn't the one supplying it.

**Done when** you can answer all eight without guessing.

## Diagnose before editing

Read the skill and run the validator before proposing any change. Then name the failure, because the cure differs sharply:

| The complaint | Usually |
| :-- | :-- |
| "It never fires" | The description lacks the words the user actually says → [references/triggering.md](references/triggering.md) |
| "It fires when I don't want it" | Description too broad, near-misses not carved out, or it should be user-invoked |
| "It does the wrong thing" | Fuzzy completion criteria, prohibitions that name the unwanted behaviour, or must-have material buried behind a weak pointer |
| "It wastes turns" | Sprawl, or a step sending the agent down an unproductive path; read a transcript, don't guess |
| "It used to work" | Sediment from repeated edits, or the body dropping out after compaction |

The vocabulary behind those terms, and the fixes, is in `agent-toolkit:writing-for-agents` (call the Skill tool for it); description and invocation fixes are in [references/authoring.md](references/authoring.md).

**Done when** you can state which failure you're fixing and why the change addresses it.

## Write it

Scaffold: `${CLAUDE_SKILL_DIR}/scripts/init_skill.sh <name> <personal|project|path>`, where a plugin skill takes the path `<plugin-dir>/skills`.

A skill is infrastructure: it shapes every future session that invokes it, and a flaw in it is copied silently into all of them. Being thorough here is cheap compared to being wrong here, so read the references rather than working from memory of them, and spend the extra pass.

Call the Skill tool for `agent-toolkit:writing-for-agents` **every time** before you write or revise a skill body; it holds the writing craft. Read [references/authoring.md](references/authoring.md) **every time** as well, for the skill-specific layer on top (description, invocation choice, frontmatter discipline, bundled files, dynamic context injection, forks), and [references/frontmatter.md](references/frontmatter.md) **every time** you write frontmatter. Not when you feel unsure: recalling a field's semantics wrongly looks exactly like recalling it correctly, and `paths` or `disable-model-invocation` chosen from memory produces a skill that silently never fires.

Read [references/skill-structure.md](references/skill-structure.md) when deciding where the skill lives or how to split it across files.

Read [references/subagents.md](references/subagents.md) whenever a subagent is in play: the skill sets `context: fork`, you're choosing an `agent:` target, or the thing to build is a subagent rather than a skill. Subagents have their own frontmatter, their own precedence order (project beats user, the opposite of skills), and tool filters that silently narrow what a backgrounded agent can do.

### Bundled scripts

Everything under `scripts/` runs on machines you will never see, against whatever `python3` is already there: **the standard library only**, nothing that has to be installed first, and POSIX for shell. A script that imports a package the user never installed dies at its import line, and what they see is a broken skill rather than a missing package. An import wrapped in `try/except ImportError` is not an exemption either: a script whose verdict depends on what happens to be installed passes on one machine and fails on the next.

When a job genuinely cannot be done from the standard library, stop and put it to the user with AskUserQuestion before writing the import: name the dependency, say what it buys, and offer the standard-library alternative (a narrower check, a slower implementation, a different approach) as a real option beside it. Their call, made before the code exists, not at someone else's traceback.

### Before handing it over

Draft, then make a deliberate second pass, since the draft is where the thinking happened and the pass is where the defects surface:

- [ ] `validate_skill.py` exits clean, and each warning is fixed or raised with the user
- [ ] Re-read the body against the failure modes in writing-for-agents: every no-op deleted, every prohibition either reframed positively or justified as a guardrail
- [ ] Every frontmatter field checked against frontmatter.md, and each one you kept has a reason you could say out loud
- [ ] Every bundled file has a pointer saying when to read or run it
- [ ] **Bundled scripts actually run.** Execute each one against a realistic input; a script that was never invoked is a guess
- [ ] Every bundled script runs on a bare `python3` and a POSIX shell, or its dependency was put to the user with AskUserQuestion and accepted
- [ ] `context: fork` skills: the `agent:` value resolves to a real type, and the body reads as an executable task
- [ ] **The description fires.** Say aloud three ways a user would ask for this without knowing the skill exists; if the description wouldn't match them, it isn't finished. Offer the scored loop in [references/triggering.md](references/triggering.md) for anything that matters
- [ ] The skill works for prompts outside the examples that prompted it

**Done when** every box is checked, not when the skill looks finished.

## Validate

After every draft and every edit:

```bash
python3 ${CLAUDE_SKILL_DIR}/scripts/validate_skill.py <skill-dir>
```

It checks frontmatter against the current spec: unknown fields, invalid booleans, description length, argument placeholders, fork sanity, `allowed-tools` syntax, broken file references, script permissions.

**Done when** it exits with no errors for each skill directory written or changed, one run per directory. Warnings are judgement calls: fix or surface them to the user, don't silently pass over them.

## Audit

Run the validator across each skill directory, then report findings grouped by skill with a one-line severity read. Change nothing until the user picks what to fix; an audit that edits as it goes gives them no chance to disagree.

## Evals

Read [references/evaluating.md](references/evaluating.md) whenever the user wants evidence rather than an opinion; it covers when evals are worth building, how the arms stay isolated, and the grade → benchmark → human-review loop.

When the skill ships inside a plugin, `claude plugin eval` is the first-party way to get a scored number in one command, with a no-plugin baseline arm it sets up itself. It answers "does this help?"; the bundled harness answers "what should I change?", because it is the one with the review viewer, per-iteration baselines, and the feedback loop. [references/evaluating.md](references/evaluating.md#the-first-party-alternative) has the trade-off and the flags.

Offer [references/triggering.md](references/triggering.md) afterwards: output evals measure what a skill does once invoked, triggering evals measure whether it gets invoked at all.

## Ship it

A skill inside a plugin reaches its users only through a release of that plugin: an install keeps its cached copy until the plugin's version changes. After any edit to one, load `agent-toolkit:create-plugin` with the Skill tool, unless it is already loaded, and run its Ship section.

Skills outside a plugin are plain directories; packaging is only for distribution. Commit project skills to version control, or symlink a repo directory into `~/.claude/skills/` for personal use.

For a `.skill` file (claude.ai upload, sharing):

```bash
python3 ${CLAUDE_SKILL_DIR}/scripts/package_skill.py <skill-dir>
```

Edits to a skill in an already-watched directory apply within the session. A brand-new top-level `.claude/skills/` directory needs a Claude Code restart before it is watched, so tell the user when you create one.

## Communicating

Users of this skill range from people who write skills for a living to people who just opened a terminal. "Evaluation" and "benchmark" are usually safe; for "frontmatter", "assertion", and "JSON", watch for signs the user knows the term and explain it in a clause when in doubt.

Skills must not contain malware, exploit code, or anything that would surprise the user given the stated intent: no misleading skills, nothing facilitating unauthorized access or exfiltration. Roleplay and persona skills are fine.
