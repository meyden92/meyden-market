# Writing a skill well: the skill-specific layer

The general writing craft (context pointers, the information hierarchy and progressive disclosure, co-location, completion criteria, leading words, negation, no-ops, duplication, sediment, when to split, the two loads, the revision pass) lives in `agent-toolkit:writing-for-agents`. Call the Skill tool for `agent-toolkit:writing-for-agents` before drafting or revising any skill body; this file only adds what changes when the document is a skill.

For _what the fields mean_, see [frontmatter.md](frontmatter.md). For _where skills live and how they load_, see [skill-structure.md](skill-structure.md).

## The description

The description is the skill's top-level context pointer and the whole triggering mechanism. It has one job (fire when it should, stay quiet when it shouldn't), and it is the single highest-leverage text in the skill, because everything else is unreachable without it. Under-triggering is the dominant failure mode, and it is silent.

It is loaded on **every turn of every session** whether or not the skill fires. The pointer rules in writing-for-agents apply in full (leading word first, one trigger per branch, prune for sharpness rather than size). On top of them:

- Lead with the capability, in the words the user actually says, not your names for things.
- Claude undertriggers, so be pushy: "Use whenever the user mentions X, Y, or Z, even if they don't say 'X'."
- Cover the phrasings a user reaches for when they _don't_ know the skill exists. Those are the invocations you lose without noticing.
- Trigger phrases go in `when_to_use`; keep `description` on capability. Both share one 1,536-character budget in the listing: spend it, don't hoard it.
- Carve out near-misses explicitly when a neighbouring skill competes.

Reliable triggering is measurable rather than a matter of taste: the loop in [triggering.md](triggering.md) scores a description against realistic should-fire and should-not-fire prompts and rewrites it against the failures. Reach for it whenever a skill matters, and always when one isn't firing.

## The invocation choice

Two choices, trading the two loads (context load on the agent, cognitive load on the human; defined in writing-for-agents). The field mechanics and the full invocation matrix are in [frontmatter.md](frontmatter.md).

- A **model-invoked** skill (the default) keeps its description in context, so the agent can fire it autonomously and other skills can reach it. The user can still type its name: a description only ever adds agent discovery, never removes the human's. The cost is permanent context load in exchange for discoverability. A model-invoked skill whose content is all reference is also one home for shared reference: another skill can invoke it, so reference several skills need lives in one place.
- A **user-invoked** skill (`disable-model-invocation: true`) strips the description from the agent's reach: only the human typing its name can invoke it, and no other skill can. Zero context load, but the human is now the index that must remember it exists. The description becomes a human-facing one-liner, trigger lists stripped.

Pick model-invocation only when the agent must reach the skill on its own, or another skill must. Spend user-invocation where human judgement genuinely belongs (deploys, commits, anything with side effects the user must time).

Shared reference that two user-invoked skills both need can live in neither: with no descriptions, neither can fire the other. Push it to a plain file outside the skill system, external reference any skill can point at.

**Splitting by invocation** is the skill-specific cut (the sequence cut is in writing-for-agents): split off a model-invoked skill when a distinct leading word you actually use in your prompts should trigger it on its own, or another skill must reach it. The new always-loaded description costs context load, so that independent reach has to be worth it.

**Router skills.** When user-invoked skills multiply past what anyone can remember, one user-invoked router skill names the others and when to reach for each, so the human has one skill to remember instead of many. It can only hint, never fire them: user-invoked skills have no description, so nothing but the human can reach them.

## Frontmatter discipline

The default skill is `description`-only. Every additional field must justify itself against a concrete need surfaced in the interview:

| Need | Field |
| :-- | :-- |
| User passes arguments | `argument-hint` (+ `arguments` for readable `$names`) |
| Side effects the user must time | `disable-model-invocation: true` |
| Background knowledge, not a user action | `user-invocable: false` |
| Bundled scripts that should run without prompts | `allowed-tools`, scoped to those exact invocations |
| Self-contained task worth isolating | `context: fork` (+ `agent`, `background`) |

Reaching for `model`, `effort`, `paths`, `hooks`, `shell`, or `disallowed-tools` without a specific reason is overengineering. `paths` in particular is a common cause of "my skill mysteriously never triggers".

## The body persists

Once invoked, the rendered SKILL.md stays in the conversation for the rest of the session: Claude Code does not re-read the file on later turns. Write standing instructions, not one-time steps, and treat every line as a recurring cost. The documented ceiling for a SKILL.md body is 500 lines, and a skill with branches should sit well under it.

**That ceiling applies to SKILL.md, not to `references/`.** A reference file loads only when something reads it, so it should be exactly as long as the material demands: a thorough field-by-field reference beats a short one that made the reader go and look it up anyway. Cutting real content to hit a line count trades a cost you can measure for a gap you can't.

(The `allowed-tools` grant behaves differently from the content: it clears on the user's next message and re-applies on re-invocation.)

## Bundled files

Three directories, three lifecycles:

- **`scripts/`**: _executed_, never loaded into context. The right home for anything deterministic or repeated: file conversion, validation, report generation. If the same helper would be rewritten on every invocation, write it once here.
- **`references/`**: _loaded_ into context when the agent reads them. Disclosed reference.
- **`assets/`**: _used in output_: templates, fonts, boilerplate.

Conventions for bundled scripts on this machine (macOS): bash/sh or python3, stdlib-only unless the user agrees to dependencies, shebang line, `chmod +x`. Reference them as `${CLAUDE_SKILL_DIR}/scripts/<name>` so paths resolve wherever the skill is installed, and mirror the exact invocation in an `allowed-tools` rule so it runs without a prompt:

```yaml
allowed-tools: Bash(python3 ${CLAUDE_SKILL_DIR}/scripts/render.py *)
```

The rule and the body must match, or the grant doesn't apply and the flow breaks on a permission prompt.

Every bundled file needs a pointer from SKILL.md saying _when_ to read or run it. Unreferenced files are not discovered reliably.

## Dynamic context injection

An exclamation mark followed by a backticked command (``!`git diff HEAD` ``) placed at line start or after whitespace runs **before** the agent sees the skill; its output replaces the placeholder. Multi-line: a fenced block opened with ```` ```! ````. Use it for live state the instructions must be grounded in: a diff, a PR body, today's date.

It runs on every invocation before the agent can decide anything, so keep it fast and free of side effects.

One trap worth knowing: this is preprocessing, and it fires even inside markdown code spans. A skill that merely _mentions_ the syntax will execute the example at invocation time. Keep a non-space character directly before the `!` (as every example in this file does), or the mention becomes a command that can break the skill on a machine missing that binary.

## `context: fork` needs a task

A forked skill's body becomes a subagent's prompt, with no conversation history behind it. That works for explicit instructions ("do X, then Y, return Z") and produces nothing useful from guideline-only content: a style guide forked into a subagent has no task to perform.

Pick `agent: Explore` for read-only research, leave the default `general-purpose` otherwise. Set `background: false` when the invoking turn needs the result to continue, and note that a backgrounded fork runs with a **narrower tool set**, so a skill whose steps need a tool outside it must set `background: false` regardless.

Choosing the agent, and the inverse pattern (a subagent that preloads skills as reference material), are covered in [subagents.md](subagents.md).
