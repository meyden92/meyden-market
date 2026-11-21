---
name: create-plugin
description: Create Claude Code plugins inside a marketplace repo, scaffolding plugins/<name>/ with its plugin.json manifest, bundling skills, subagents, hooks, bin/ executables, MCP and LSP servers, monitors, terminal themes, output styles and userConfig, registering the entry in .claude-plugin/marketplace.json, then linting, validating and releasing. Bootstraps a new marketplace repo when there isn't one.
when_to_use: Trigger phrases include "create a plugin", "make/write a new plugin", "turn this skill into a plugin", "add a hook / an executable / an MCP server / user config / a theme to my plugin", "ship a color theme", "register it in the marketplace", "bump the plugin version", "release the plugin", "why won't my plugin load", "my plugin's skill doesn't show up", "validate my plugin", "set up a plugin marketplace", "package these skills so my team can install them", "share/distribute this with the team". Use whenever the work touches a .claude-plugin/plugin.json or a marketplace.json, even when the user says "skill", because a skill that needs a hook, a PATH executable, a bundled server, per-user secrets or a registered subagent has to be a plugin. For a plain skill that needs none of those, use agent-toolkit:create-skill instead.
argument-hint: "[what to build or change]"
allowed-tools: Bash(${CLAUDE_SKILL_DIR}/scripts/init_marketplace.sh *), Bash(${CLAUDE_SKILL_DIR}/scripts/init_plugin.sh *), Bash(python3 ${CLAUDE_SKILL_DIR}/scripts/sync_marketplace.py *), Bash(python3 ${CLAUDE_SKILL_DIR}/scripts/check_plugin.py *), Bash(claude plugin validate *), Bash(claude plugin details *), Bash(claude --plugin-dir * plugin details *)
---

# Plugin Creator

Request: $ARGUMENTS (empty → the conversation is the request).

A plugin is a skill with a machine around it. The skill is still the point; the plugin is what lets
that skill fire without being asked, ship an executable, hold a secret, register a subagent, and keep
state across its own updates.

Two standards run through every branch below:

- **It earns its manifest.** A plugin that ships only skills is a skill with extra ceremony. Before
  it ships, one component must be doing something a bare skill cannot reach.
- **It is portable.** It will run on a machine you have never seen, from a cache directory whose path
  changes on every update. No host paths, no assumed language or repo layout.

## Route

This skill is the entry point for skills, plugins and mods. Match the request, and the files it
names, against every row; one request often matches several. Where a row names a skill, load it with
the Skill tool before doing that part of the work.

| The work is | Load | Then |
| :-- | :-- | :-- |
| A skill outside any plugin (`.claude/skills/`, `~/.claude/skills/`) | `agent-toolkit:create-skill` | Follow it alone; the rest of this skill does not apply |
| A SKILL.md or subagent inside a plugin, written or changed | `agent-toolkit:create-skill` | [Write the skills](#write-the-skills), then [Ship](#ship) |
| Code that runs inside Claude Code: a pane, a band, a look, a command with no Claude turn, a rewritten prompt or tool call | `agent-toolkit:mods` | Build it there, then [Ship](#ship) |
| A new plugin, or "turn this skill into a plugin" | | [Create](#create) |
| Another component added to a plugin that exists | | [Extend](#extend) |
| It registered, versioned, validated, released | | [Ship](#ship) |
| A plugin renamed, removed, or distributed to others | | [references/marketplace.md](references/marketplace.md) |
| A plugin that loads but does nothing | | [references/troubleshooting.md](references/troubleshooting.md) |
| Numbers: does this plugin actually help? | | [Measure](#measure) |
| A marketplace repo that doesn't exist yet | | [Resolve the marketplace root](#resolve-the-marketplace-root) |

## The structure

Fixed, for every plugin in this marketplace:

```
<marketplace-root>/
├── .claude-plugin/
│   └── marketplace.json        # the catalog, one entry per plugin
└── plugins/
    └── <plugin-name>/
        ├── .claude-plugin/
        │   └── plugin.json     # the ONLY thing that goes in .claude-plugin/
        ├── skills/<name>/SKILL.md
        ├── agents/*.md
        ├── hooks/hooks.json
        ├── bin/                # executables, on PATH while enabled
        ├── scripts/            # helpers called by hooks and bin
        ├── themes/<slug>.json  # terminal color themes
        ├── output-styles/*.md
        ├── .mcp.json
        ├── .lsp.json
        ├── README.md
        └── CHANGELOG.md
```

Everything except `plugin.json` sits at the **plugin root**. Components placed inside
`.claude-plugin/` fail silently: the plugin loads and the components simply don't exist. This is the
most common structural mistake there is.

`docs/` and `examples/` at the marketplace root are maintained by hand, so leave them alone.

## Resolve the marketplace root

Every branch needs it. The scripts walk up from the working directory for
`.claude-plugin/marketplace.json`; pass `--root <dir>` to override.

If there is no marketplace root, say so and offer to create one before doing anything else:

```bash
${CLAUDE_SKILL_DIR}/scripts/init_marketplace.sh <marketplace-name> [target-dir]
```

It writes `.claude-plugin/marketplace.json`, `plugins/`, a README and a `.gitignore`, and refuses the
names Anthropic and Claude Desktop reserve. Bootstrapping is a real decision about where a body of
work lives; confirm the name and location with the user rather than picking them.

**Done when** the absolute path of the marketplace root is known and contains
`.claude-plugin/marketplace.json`.

## What a plugin unlocks

Work down this table with the user's actual job in hand. Each row is something a plain skill cannot
do. That is what the plugin is buying.

| The plugin needs to | Component | Because a skill can't |
| :-- | :-- | :-- |
| Act whether or not the model chooses to | `hooks/hooks.json` | only instruct; a hook is the harness acting |
| Give Claude a verb in every Bash call | `bin/` | put anything on `PATH` |
| Ask each user for a path, endpoint or token | `userConfig` in the manifest | prompt at enable time or reach the Keychain |
| Keep state across its own updates | `${CLAUDE_PLUGIN_DATA}` | survive reinstall |
| Register a subagent type | `agents/` | an `agents/` folder in a skill registers nothing |
| Ship its own tools | `.mcp.json` | bundle a server |
| See diagnostics after every edit | `.lsp.json` | reach the language server |
| Watch a log or endpoint unprompted | `monitors/monitors.json` | run in the background |
| Recolor the terminal UI | `themes/<slug>.json` | appear in `/theme` |
| Change how Claude formats its answers | `output-styles/*.md` | appear in `/output-style` |
| Recolor the desktop app, draw panes, rewrite tool calls in code | a hooks module (a mod) | run code inside Claude Code; load `agent-toolkit:mods` before designing it |
| Hold back a release from Claude Code versions it doesn't support | `engines` in the manifest | gate install, update and load by version |

`settings.json` with `agent` used to replace the main thread. It is deprecated since v2.1.323 and
warns everywhere; don't ship it.

Schemas, minimal working examples and the traps for each: [references/components.md](references/components.md).

## Create

1. **Capture intent.** What job does this plugin do, for whom, and what does success look like? Mine
   the conversation first: "turn this into a plugin" means the transcript is the spec. Name the
   plugin in kebab-case; it namespaces every component and changing it later breaks every install.
   Names starting with `claude-`, `anthropic-`, `anthropics-` or `cc-plugin-` are reserved
   ([references/marketplace.md](references/marketplace.md#reserved-names)).

2. **Choose components.** Walk the whole table above and decide each row, out loud, against the job.
   Pushing a hook or a server into a plugin that doesn't need one costs the user reach and trust;
   shipping skills alone means the plugin earned nothing. Both are failures.

3. **Scaffold.** Only the components step 2 selected:

   ```bash
   ${CLAUDE_SKILL_DIR}/scripts/init_plugin.sh <name> --description "<one line>" --with skills hooks bin
   ```

   Valid `--with` values: `skills agents hooks mcp lsp bin monitors themes output-styles workflows`.
   It writes the manifest, README and CHANGELOG, creates the selected skeletons, and registers the
   marketplace entry. Generated configs are valid but inert, and `check_plugin.py` fails on any left
   that way. (`claude plugin init` is the built-in scaffolder, but it writes to `~/.claude/skills/`,
   not into a marketplace, so it doesn't fit here.)

4. **Write the skills**: [Write the skills](#write-the-skills) below.

5. **Wire the other components.** Read [references/components.md](references/components.md) before
   writing any of them; read [references/manifest.md](references/manifest.md) before touching a
   manifest field beyond name, description and version. Every bundled script gets a shebang and
   `chmod +x`.

6. **Fill the docs.** README says what it provides, what the user must install themselves (an LSP
   binary, a runtime), and what each `userConfig` option is for. CHANGELOG gets the version entry.

7. **Verify**: the [Ship](#ship) checks, run now rather than later.

**Done when** every component selected in step 2 is filled in and exercised, no TODO remains in the
manifest or README, and both checkers pass clean.

## Write the skills

Load `agent-toolkit:create-skill` with the Skill tool once, then take every skill and subagent
through its steps. Three facts it cannot infer:

- the target directory is `<marketplace-root>/plugins/<name>/skills/`
- it is a **plugin** skill, so the frontmatter `name` sets the invocation segment
  (`/<plugin-name>:<skill-name>`) rather than being cosmetic
- `${CLAUDE_PLUGIN_ROOT}`, `${CLAUDE_PLUGIN_DATA}` and `${CLAUDE_PROJECT_DIR}` substitute in skill
  content, so a skill may point at `bin/`, `scripts/` and bundled assets

When subagents write the skills, each brief tells the subagent to load `agent-toolkit:create-skill`
itself and to return the output of `validate_skill.py` for every skill it wrote. A brief that
paraphrases the rules instead produces skills nothing checked.

**Done when** you have seen `validate_skill.py` exit clean for each skill directory written or
changed, one run per directory.

## Extend

1. Locate the plugin under `<marketplace-root>/plugins/`, and read its manifest and README before
   changing anything; the component may already exist in a form you'd duplicate.
2. Name which row of [the table](#what-a-plugin-unlocks) the request is, then read that component's
   section in [references/components.md](references/components.md). Recalling a schema wrongly looks
   exactly like recalling it correctly.
3. Add the component. A new component directory or config file needs no manifest change unless it
   sits somewhere non-default. And if you do add a path field, check the replace-vs-add rule in
   [references/manifest.md](references/manifest.md#path-behavior-rules) first, because for every field
   except `skills` a custom path *replaces* the default directory.
4. Update the README, then [Ship](#ship).

**Done when** the new component appears in `claude --plugin-dir <plugin-dir> plugin details <name>`
and its effect has been triggered once for real: a hook by causing its event, a `bin/` entry by
running it, a server by loading the plugin and seeing its tools.

## Ship

Every change to a plugin's files ships, a one-line skill edit included: an install keeps its cached
copy until the version string changes. Bump the version in `plugin.json` and add the CHANGELOG entry
first, without asking, then run:

```bash
python3 ${CLAUDE_SKILL_DIR}/scripts/check_plugin.py <marketplace-root>/plugins/<name>
python3 ${CLAUDE_SKILL_DIR}/scripts/sync_marketplace.py --root <marketplace-root>
claude plugin validate <marketplace-root>/plugins/<name> --strict
claude plugin validate <marketplace-root> --strict
```

The two checkers cover different ground, so run both. `claude plugin validate` checks manifest and
frontmatter *schemas*; `check_plugin.py` checks whether the plugin will still work once copied into
someone else's plugin cache: placement, executable bits, dangling `${CLAUDE_PLUGIN_ROOT}` targets,
hardcoded host paths, scaffolds never filled in.

Add `--json` to either `claude plugin validate` call for the same findings as a machine-readable
report, on the same exit codes. That is the form to parse in CI or to read back a long warning list
without re-running the check.

`sync_marketplace.py` mirrors description and keywords from the manifest into the catalog entry
(`category` is an entry-only field and stays as you set it) and strips any `version` there. Version lives in `plugin.json` alone: Claude Code reads that one
first and only `validate` notices a disagreement, so a version in both places masks the one you
edited. Bump it on every release; users of an unchanged version string keep their cached copy and
`/plugin update` tells them they are current. When a release needs a newer Claude Code (a new
manifest field, hook event or mod API), set `engines` so older installs stay on the last release that
fits ([references/manifest.md](references/manifest.md#engines)).

On v2.1.325 `validate` also prints plugin directory checks (README, license, icon) for Anthropic's
public directory. They don't change the verdict; ignore them for an internal marketplace.

Confirm the component inventory matches what you wrote; a component missing there was never
registered:

```bash
claude --plugin-dir <marketplace-root>/plugins/<name> plugin details <name>
```

`--plugin-dir` goes before `plugin`; after `details` it is an unknown option, and without it
`details` reads the installed copy. Behaviour only an interactive session shows (a hook firing, a
pane drawing) needs the user: give them `claude --plugin-dir <marketplace-root>/plugins/<name>`, and
name in your report whatever nobody has seen run.

### Release

Once the checks pass, ask one question: commit and push this release? With it, tell the user the
order an install needs, because a marketplace added from git serves the pushed commit and `install`
or `update` finds nothing new before the push:

1. `git push`
2. `claude plugin marketplace update <marketplace>`
3. `claude plugin update <name>@<marketplace>`, or `install` the first time
4. `/reload-plugins` in a session that was already open

Commit and push only on their yes, and commit only this plugin's files plus `marketplace.json`.
Release tagging is `claude plugin tag`, which validates that the manifest and the catalog entry
agree. It writes and can push a git tag, so run it only when the user asks.

Read [references/marketplace.md](references/marketplace.md) before editing `marketplace.json` by
hand, renaming or removing a plugin (both need a `renames` entry or every existing install breaks),
choosing a source type other than a relative path, or setting up how others add the marketplace.

**Done when** both validators exit clean, the inventory matches, the CHANGELOG names the version in
the manifest, and the release question has been asked.

## Measure

`claude plugin eval` runs eval cases against a plugin and scores them, with a no-plugin baseline arm
so the number means something:

```bash
claude plugin eval init                 # author a suite under evals/ via an interview
claude plugin eval <plugin-dir>         # run it
```

Useful flags: `--ablation with-without`, `--runs <n>`, `--case <glob>`, `--threshold <0..1>`,
`--max-cost-usd <usd>`, `--allow-tools <tools...>`, `--disallow-tools <tools...>`, `--eval-dir <dir>`
(default: `experimental.evals` in the manifest, else `evals/`), `--json [path]`, `--report <path>`,
and `--trust-plugin` for CI. Put the target before `--tag`, `--allow-tools` and `--json`, which
swallow the words after them. Exit codes: `0` passed, `1` a failing case or a run that ended on an API
error, `2` a partial run. It spends real tokens and publishes an HTML report to claude.ai by default,
so confirm with the user before running it, and pass `--no-publish` unless they want it shared.

## Portability

Checked by `check_plugin.py`, but decide it while writing rather than at the end:

- Bundled paths go through `${CLAUDE_PLUGIN_ROOT}`; state that must survive updates goes in
  `${CLAUDE_PLUGIN_DATA}`; project paths through `${CLAUDE_PROJECT_DIR}`. Never a literal `/Users/…`.
- Nothing reaches outside the plugin directory; `..` paths aren't copied into the cache.
- Node.js dependencies of hooks and MCP servers install themselves when the plugin is cached, if a
  `package.json` with a pinned npm or Bun lockfile sits at the plugin root
  ([references/components.md](references/components.md#claude_plugin_data-and-the-update-problem)).
- `bin/` and `scripts/` are POSIX shell or `python3`, **standard library only**, with nothing that has
  to be installed first. The plugin runs against a Python you did not choose, and a package the
  user never installed reads to them as a broken plugin, not as a missing package. An import
  guarded by `try/except ImportError` is not an exemption: behaviour that changes with what happens
  to be installed is worse than a clean failure. Where a job genuinely cannot be done from the
  standard library, put it to the user with AskUserQuestion before writing the import: name the
  dependency, say what it buys, and offer the standard-library alternative beside it, and have the
  plugin install what they approve into `${CLAUDE_PLUGIN_DATA}` itself rather than assuming it is
  there.
- A plugin assumes no language, framework or repo layout. Where it genuinely needs one, it detects it
  or declares a `userConfig` option; it does not hardcode it.
- Skill descriptions trigger on the words any user would say, not on in-house vocabulary.
