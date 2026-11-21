# Authoring plugins for this marketplace

Reference for adding a plugin here. Verified against Claude Code 2.1.222 — check
[the official reference](https://code.claude.com/docs/en/plugins-reference) when something
below disagrees with what the CLI does.

Use `examples/release-toolkit/` as the worked example. It ships every component type this guide
describes. It is a reference implementation only — it is not listed in `marketplace.json` and is
not installable.

## Layout

```
plugins/<name>/
├── .claude-plugin/
│   └── plugin.json          # the ONLY thing that belongs in here
├── commands/                # flat .md files  ->  /name
├── agents/                  # subagent .md files
├── skills/
│   └── <skill-name>/
│       ├── SKILL.md
│       ├── references/      # loaded on demand
│       └── scripts/         # bundled executables
├── hooks/hooks.json         # event handlers
├── bin/                     # executables added to the Bash tool's PATH
├── .mcp.json                # MCP servers
├── README.md
└── CHANGELOG.md
```

Everything except `plugin.json` lives at the **plugin root**. A component directory inside
`.claude-plugin/` is silently ignored — the plugin loads with zero components and no error.
`ci/validate_json.py` fails the build on this.

`CLAUDE.md` at a plugin root is **not** loaded as context. Ship instructions as a skill.

## Manifest

`.claude-plugin/plugin.json` is technically optional — components are auto-discovered and the
name falls back to the directory name. **This marketplace requires it**, because it is where
`version` lives, and without a version every repo commit looks like an update to every plugin.

```json
{
  "$schema": "https://json.schemastore.org/claude-code-plugin-manifest.json",
  "name": "my-plugin",
  "displayName": "My Plugin",
  "version": "1.0.0",
  "description": "One line: what it does",
  "author": { "name": "Team", "email": "team@example.com" },
  "license": "UNLICENSED",
  "keywords": ["area"]
}
```

`name` must be kebab-case and match the marketplace entry. It namespaces components: an agent
`reviewer` in plugin `my-plugin` is referenced as `my-plugin:reviewer`.

Unrecognized top-level fields are ignored at load time and reported as warnings by
`claude plugin validate --strict`. Fields with the wrong *type* are hard errors.

Useful optional fields:

| Field | Use |
| --- | --- |
| `defaultEnabled: false` | Ship installed-but-disabled. Right for plugins that reach an external service or add real token cost. |
| `userConfig` | Prompt for values at enable time instead of asking users to edit settings.json. Mark secrets `"sensitive": true` so they go to secure storage. |
| `dependencies` | Require another plugin, optionally with a semver range |
| `commands` / `agents` / `skills` | Custom component paths. `commands`, `agents` **replace** the default directory; `skills` **adds** to it. |

## Components

### Commands — `commands/<name>.md`

A flat markdown file that becomes `/<name>`. Best for a procedure a person invokes explicitly.

```markdown
---
name: my-command
description: One line — shown in the / menu
argument-hint: "[target] [mode]"
allowed-tools: Bash(git log:*), Read, Grep
---

Instructions. `$0` is the first argument, `$1` the second, `$ARGUMENTS` is all of them.
```

`allowed-tools` pre-approves tools for the turn that invokes the command, and the grant clears
on the user's next message. Scope Bash narrowly — `Bash(git log:*)`, never bare `Bash`.

### Agents — `agents/<name>.md`

A subagent with its own context window. Best for work that would flood the main conversation:
broad searches, audits, anything producing output the user does not need verbatim.

```markdown
---
name: my-agent
description: What it specializes in and when Claude should invoke it
model: sonnet
effort: medium
maxTurns: 30
disallowedTools: Write, Edit
---

System prompt.
```

Supported frontmatter: `name`, `description`, `model`, `effort`, `maxTurns`, `tools`,
`disallowedTools`, `skills`, `memory`, `background`, `isolation` (only `"worktree"`).

`hooks`, `mcpServers`, and `permissionMode` are **rejected** in plugin-shipped agents, for
security reasons.

Give read-only agents `disallowedTools: Write, Edit, NotebookEdit`. An auditor that can edit
is an auditor that will eventually "fix" what it was asked to report.

### Skills — `skills/<name>/SKILL.md`

A directory with instructions plus supporting files. Use this over a command whenever there is
more material than fits comfortably in one file, or when Claude should be able to invoke it
automatically.

```markdown
---
name: my-skill
description: What it does AND when to use it — this is what Claude matches against
when_to_use: Trigger phrases users actually say
allowed-tools: Bash(python3:*), Read, Write
---
```

The `description` is the whole triggering mechanism. Write it as *when to use this*, not *what
this is*. `description` + `when_to_use` are truncated at 1,536 characters in the listing, so
lead with the key use case.

Other frontmatter worth knowing: `disable-model-invocation` (manual `/name` only),
`user-invocable: false` (background knowledge, hidden from the menu), `model`, `effort`,
`context: fork` (run in a subagent), `paths` (only auto-load when working on matching files).

**Progressive disclosure is the point.** Only `SKILL.md` loads when the skill fires; files in
`references/` cost nothing until read. Put the procedure in `SKILL.md` and the long material —
specs, tables, troubleshooting — in `references/`, with a table in `SKILL.md` saying when to
read each one.

Reference bundled files with `${CLAUDE_SKILL_DIR}` (the skill's own directory) — never a
relative path, because the working directory is the user's project, not the plugin.

**One skill calling another.** Write it as an explicit Skill tool call naming the fully
qualified skill — `Call the Skill tool with "dev-workflow:codebase-design"` — not as a bare
`/plugin:skill` mention left for the model to read as a command. The tool takes one skill per
call, so a step needing two is two calls: `Call the Skill tool twice, for "dev-workflow:interview"
and "dev-workflow:domain-modeling"`. This only works for model-invoked skills. A skill marked
`disable-model-invocation: true` is unreachable this way, so a step that depends on one tells the
human instead — *"tell the user to run `/dev-workflow:setup`"*. Prose that merely lists skills for
a person to pick from (READMEs, menus) keeps plain `/plugin:skill` labels; it is not invoking
anything.

### Hooks — `hooks/hooks.json`

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Write|Edit",
        "hooks": [{ "type": "command", "command": "\"${CLAUDE_PLUGIN_ROOT}\"/scripts/format.sh" }]
      }
    ]
  }
}
```

Hooks run commands on developer machines without asking. They get the closest review of
anything in a merge request. Quote `${CLAUDE_PLUGIN_ROOT}` in shell-form commands.

## Environment variables

| Variable | Resolves to | Use for |
| --- | --- | --- |
| `${CLAUDE_PLUGIN_ROOT}` | The plugin's install directory | Bundled scripts and configs |
| `${CLAUDE_SKILL_DIR}` | The skill's own subdirectory | Files next to `SKILL.md` |
| `${CLAUDE_PLUGIN_DATA}` | Persistent dir surviving updates | Installed deps, caches |
| `${CLAUDE_PROJECT_DIR}` | The user's project root | Project-local files |

`${CLAUDE_PLUGIN_ROOT}` changes on every update — never write state there. Use
`${CLAUDE_PLUGIN_DATA}` (`~/.claude/plugins/data/<id>/`), which survives updates and is deleted
on uninstall.

## Self-containment

Installed plugins are copied to `~/.claude/plugins/cache`. **A plugin cannot read anything
outside its own directory.** A skill referencing `../../../shared/policy.md` works in the repo
and breaks after install.

To share material between plugins, pick one:

- Duplicate small static files.
- Generate synchronized copies in CI.
- Symlink within the marketplace — a symlink to a sibling plugin's file is dereferenced (its
  content is copied) when the plugin is cached. Symlinks pointing outside the marketplace are
  skipped for security.
- Package the shared capability as its own plugin and use `dependencies`.

## Versioning

This marketplace uses explicit semver in `plugin.json`.

- Every functional change bumps the version. CI (`ci/check_version_bump.sh`) enforces it.
- Never declare `version` in both `plugin.json` and the marketplace entry. `plugin.json` wins,
  and a stale duplicate is a confusing way to pin the wrong release. `ci/validate_json.py`
  fails on it.
- Patch for fixes and wording, minor for new components, major for removed or renamed ones.
  Renaming a command or agent breaks muscle memory and any settings referencing it.

The alternative — omitting `version` so the commit SHA is used — means every commit to this
repository looks like an update to *every* plugin in it. Acceptable for a small pilot;
noisy at scale. If you switch, switch the whole repository at once.

## Testing before you open a merge request

```bash
# Manifests, layout, cross-references
python3 ci/validate_json.py --repo .
claude plugin validate . --strict
claude plugin validate plugins/<name> --strict

# Load it without installing
claude --plugin-dir plugins/<name>

# End to end through the marketplace, from this directory
claude plugin marketplace add ./
claude plugin install <name>@meyden --scope local
claude plugin details <name>@meyden    # component inventory + token cost
claude plugin marketplace remove meyden
```

`claude plugin details` is the check that matters. `validate` confirms the manifests parse;
`details` confirms Claude Code actually *found* your commands, agents, and skills — and shows
what each one costs in tokens. A plugin that validates cleanly and reports `Skills (0)` has its
directories in the wrong place.

Watch the always-on cost in that output. It is added to every session for every developer who
installs the plugin.
