# Skill structure, locations, and lifecycle (Claude Code ≥ v2.1.220)

Verified against https://code.claude.com/docs/en/skills. Claude Code skills follow the Agent Skills open standard (agentskills.io), extended with invocation control, subagent execution, and dynamic context injection.

## Anatomy

```
skill-name/
├── SKILL.md          # required: frontmatter + instructions; the only auto-loaded file
├── references/       # docs loaded into context when needed (read by Claude)
├── scripts/          # executable code (run by Claude, never loaded into context)
├── assets/           # files used in output: templates, icons, fonts, boilerplate
└── evals/            # test cases (evals.json) if the skill has them
```

Reference every supporting file from SKILL.md with a note on *when* to read/run it; Claude won't discover unreferenced files reliably.

There is no `agents/` in that list, and that's deliberate: **an `agents/` folder inside a plain skill registers no subagents.** Subagents load only from `.claude/agents/`, `~/.claude/agents/`, managed settings, `--agents`, or a plugin. Naming a folder `agents/` inside a skill implies agent types that don't resolve; see [subagents.md](subagents.md#bundling-a-subagent-with-a-skill) for the four ways to actually pair a subagent with a skill.

### Progressive disclosure (three loading levels)

1. **Metadata** (name + description + when_to_use): always in context for every skill (~listing budget: 1% of context window; per-skill cap 1,536 chars)
2. **SKILL.md body**: enters context when the skill is invoked; keep under 500 lines
3. **Bundled resources**: loaded (references) or executed (scripts) only as needed; effectively unlimited

Approaching 500 lines? Add a hierarchy level: move detail into `references/` with clear pointers.

The 500-line bound is on SKILL.md, which every invocation pays for. **Reference files have no upper limit**: they load only when read, so write them to the length the material actually needs rather than trimming to a number. Give any reference over ~300 lines a table of contents so a reader can jump.

### Domain organization

When a skill covers multiple variants (frameworks, clouds, formats), keep the workflow + selection logic in SKILL.md and split variants into per-domain reference files so only the relevant one loads:

```
cloud-deploy/
├── SKILL.md            # workflow + "which cloud?" selection
└── references/
    ├── aws.md
    ├── gcp.md
    └── azure.md
```

## Where skills live

| Location | Path | Applies to |
| :-- | :-- | :-- |
| Enterprise | managed settings | whole org |
| Personal | `~/.claude/skills/<name>/SKILL.md` | all your projects |
| Project | `.claude/skills/<name>/SKILL.md` | that project |
| Plugin | `<plugin>/skills/<name>/SKILL.md` | where plugin enabled |

- Same name across levels: enterprise > personal > project; any level overrides a same-named bundled skill; skills beat same-named `.claude/commands/` files. Plugin skills are namespaced (`plugin:skill`), so they never conflict.
- Project skills load from `.claude/skills/` in the starting directory and every parent up to the repo root. Directories added with `--add-dir`/`/add-dir` also contribute their `.claude/skills/` (the `permissions.additionalDirectories` setting does NOT).
- Nested `.claude/skills/` below the working directory load lazily, the first time Claude touches a file in that subdirectory. On a name clash the nested one gets a qualified name (`apps/web:deploy`) and Claude picks the variant matching the files being worked on.
- A `<skill-name>` entry may be a **symlink** to a directory elsewhere (useful: keep skills in a versioned repo, symlink into `~/.claude/skills/`). Same target reachable twice loads once.
- Adding `.claude-plugin/plugin.json` to a skill folder turns it into a plugin (`<name>@skills-dir`) that can bundle agents, hooks, and MCP servers, with real trade-offs (namespacing, trust gate, reload step) covered in [subagents.md](subagents.md#the-plugin-bridge-precisely).

### Live change detection

Edits to SKILL.md under watched directories (`~/.claude/skills/`, project `.claude/skills/`, add-dir skills) apply within the session, with no restart. But a **top-level skills directory created after session start needs a restart** to be watched. Plugin extras (hooks/, .mcp.json, agents/) need `/reload-plugins`.

### Cloud/Cowork caveat

Cowork and cloud sessions (incl. routines) don't read the local `~/.claude/skills/`; they load claude.ai-account skills and (cloud) repo-committed `.claude/skills/`. A personal-only skill "not found" in a routine is why. Desktop scheduled tasks run locally and see everything.

## Skill content lifecycle

- Invoked skill content enters the conversation as one message and **persists for the rest of the session**. Claude Code does not re-read the file on later turns → write standing instructions, not one-time steps.
- Re-invocation with identical rendered content adds a short "already loaded" note instead of a duplicate (≥v2.1.202); changed arguments or dynamic-context output append the full new render.
- The `allowed-tools` grant, unlike the content, clears on the user's next message.
- **Compaction**: after auto-compact, each invoked skill's most recent invocation is re-attached (first 5,000 tokens each, 25,000-token combined budget, most-recent-first), so older skills can drop out entirely. If a skill seems to "stop working", the content is usually still present and the model is just choosing other approaches: strengthen description/instructions, use hooks for deterministic enforcement, or re-invoke after compaction.

## Controlling skill access

- Deny the `Skill` tool in `/permissions` to disable model-invocation of all skills; `Skill(name)` / `Skill(name *)` rules allow/deny specific ones.
- `skillOverrides` in settings (or the `/skills` menu, Space to cycle) per skill: `"on"` | `"name-only"` (listed without description, which saves listing budget) | `"user-invocable-only"` | `"off"`. Doesn't affect plugin skills.
- `disableBundledSkills` turns off bundled skills except `/doctor`.

## Troubleshooting

**Not triggering:** description lacks the words users actually say → add them (and `when_to_use` trigger phrases); check it appears in "What skills are available?"; remember Claude skips skills for tasks it can trivially do alone; check `paths` isn't silently filtering it out; malformed YAML → body loads with empty metadata (run with `--debug`).

**Triggers too often:** make the description more specific; carve out near-miss cases explicitly ("do NOT use for X"); or `disable-model-invocation: true` for manual-only.

**Descriptions cut short:** the listing budget is 1% of context window; `/doctor` estimates the cost and top contributors; raise via `skillListingBudgetFraction` or trim descriptions / set low-priority skills to `"name-only"`. Least-invoked skills lose their descriptions first.

## Distribution

- Project: commit `.claude/skills/` to version control
- Personal-from-repo: symlink the repo's skill directory into `~/.claude/skills/`
- Plugin `skills/` directory for marketplace distribution; managed settings for org-wide
- `.skill` file (zip via `scripts/package_skill.py`) for claude.ai upload
