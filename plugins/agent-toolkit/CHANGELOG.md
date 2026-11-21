# Changelog

## 0.8.0

From a review of 26 past sessions that used these skills.

- **One entry point.** `/agent-toolkit:create-plugin <free text>` routes by what the request
  touches and loads `create-skill` or `mods` with the Skill tool: a skill outside a plugin goes to
  `create-skill` alone, a skill inside a plugin goes there and then to Ship, code inside Claude Code
  goes to `mods`. `create-skill` and `mods` leave the `/` menu (`user-invocable: false`); Claude
  still loads them on their own triggers.
- **No mode and target arguments.** `create-plugin` and `create-skill` drop `arguments` and
  `argument-hint` and read the whole text after the command as the request. The first two words of
  free text used to be parsed as mode and target.
- **Release tail.** Every change to a plugin's files, a skill edit included, gets the version bump
  and CHANGELOG entry without asking, then one question about commit and push, with the order an
  install needs (push, `marketplace update`, `update`, `/reload-plugins`). `create-skill` sends an
  edit to a plugin skill to that section.
- **Hand-off that can be checked.** Skills written for a plugin are done when `validate_skill.py`
  has run clean once per skill directory; a subagent that writes skills loads `create-skill` itself
  and returns the validator output.
- `create-skill` asks where a skill lives, and `init_skill.sh` takes the location as a required
  argument instead of defaulting to `~/.claude/skills/`.
- `create-plugin` reads the inventory with `claude --plugin-dir <dir> plugin details <name>`;
  `details --plugin-dir` is an unknown option.
- `check_plugin.py` no longer reports a quoted `"${CLAUDE_PLUGIN_ROOT}/bin/x" arg` command as a
  missing file.
- `mods` gotchas: `find` sees only the rows a pane draws, the Grep tool skips the generated types,
  and `$` needs `EngineInterface` in a helper function.

## 0.7.0

- **Renamed from `extension-dev`.** Skills are now invoked as `/agent-toolkit:<skill>`.

## 0.6.0

Both skills brought to Claude Code 2.1.325, from the changelog, the split plugin and mod docs on
code.claude.com, the 2.1.325 mod typings, and checks against the 2.1.325 `claude plugin validate`.

- Themes, in two kinds. `create-plugin`'s `components.md` gets a Themes section for terminal
  theme files (`themes/<slug>.json`: the six `base` presets, every documented token by group, the
  five color forms, `experimental.themes`, still experimental) and a table separating them from
  desktop and mobile looks. `mods` covers looks: `$.theme.set` and `$.theme.clear` (2.1.319,
  colors 2.1.324), `makeColors` from the built-in `plugin-authoring` skill, the `Backdrop` site,
  still grounds, and a new validated recipe, "A look for the desktop and mobile apps".
- `create-plugin` scripts: `check_plugin.py` lints theme files (base, tokens, color syntax, empty
  scaffolds), validates `experimental.*` paths and their existence, checks `engines`, `homepage`,
  `userConfig` keys and `options`, reads `agents/` recursively, flags `initialPrompt`, a root
  `CLAUDE.md`, `${user_config.*}` in a monitor and a `hooks.json` without its `hooks` wrapper, and
  counts themes, output styles and channels as earning a plugin. `init_plugin.sh` drops
  `--with settings` and adds `themes` and `output-styles`; its README install line is
  `/plugin install <name> --marketplace <owner>/<repo>`, read from the git remote.
  `init_marketplace.sh` knows the new reserved names (`claude-tag-plugins`, the directory names,
  `inline`, `builtin`, `skills-dir`, `synced`, `claude-plugin-test`, `claudeai-`).
- `create-plugin` references: `engines["claude-code"]` (2.1.323, shape tested on the validator);
  `settings.json` `agent` deprecated and `subagentStatusLine` removed (2.1.323); the directory
  listing fields, `types`, the `commands` object map, `experimental.evals`, `userConfig.options`,
  `claude plugin configure` and `unsetOptionCount`; marketplace entry fields that don't apply
  beside a `plugin.json`, `ref` as a commit SHA, the `command` source, submodules, the full
  reserved-name list, install with `--marketplace`, organization plugins through
  `prependPlugins`/`appendPlugins`, validate's exit codes, JSON fields, Advice and directory
  checks; agent frontmatter (`autoCompactWindow`, `omitClaudeMd`, `color`, subfolders, ignored
  fields); LSP `requestTimeout` and stdout limits; hooks `onFailure: "block"` and concurrency
  caps; monitors, `bin/` on claude.ai and Cowork, the automatic Node dependency install; new
  eval flags and exit codes; troubleshooting rows for each. The "version mismatch never warns"
  and "sync mirrors category" statements were wrong and are corrected.
- `mods` references: the band is one row per mod from 2.1.323 (`AbovePromptList`, `isCollapsed`),
  `engine.create` changes `$` only from a named hook in one form, `tool.list`, `$.ui.place` and
  `Placed`, `$.ui.cancelNotify`, `$.prompt.paint`, `Progress`, pane widgets and
  `isPromptCovered`, the mobile surface, `breakPromptCache`, `$.model.complete` with a `signal`
  and in `/cost`, mod tool calls without permission prompts (2.1.321), org mods from a remote
  marketplace (2.1.324), `validate` type-checking TypeScript (2.1.323), `keepsBeneath()` and
  per-mod band stubs, headless hot reload, and `engines` as the way to pin a release. Fixed
  gotchas are marked with the version that fixed them.
- Every `patterns.md` recipe re-validated and type-checked on 2.1.325; the `Client` recipe now
  narrows `e.surface` before resolving `Client`, its test stubs `command.register` with
  `{ command }`, and the namespace recipe reads the call's argument directly.

## 0.5.1

- `mods` brought from 2.1.287 to 2.1.318. Build step 3 no longer uses `claude -p`, which stopped
  writing the generated types in 2.1.295; the user runs one interactive `claude --plugin-dir`.
  Step 2 says the module sits in `hooks/`, step 4 allows passing `$` to an imported function and
  requires `{ to: 'collector' }` on telemetry hooks, and step 5 checks the `gating hook without
  .catch:` line. The VS Code chat panel draws from extension 2.1.299 and is now a test surface.
- `api-map.md` adds the events `prompt.autocomplete`, `prompt.mention`, `prompt.change`,
  `settings.read` and `ui.fault`, the calls `$.ui.notify`, `$.ui.selection`, `$.ui.view`,
  `$.prompt.media` and `$.session.identity`, the new fields on `tool.check`, `turn.step`,
  `agent.spawn`, `skill.prompt` and `next.error`, cached `$.model.complete` blocks, a VS Code
  column for sites and elements, the current element props and limits, `plugin tag` and
  `validate --profile directory`.
- `patterns.md` adds techniques from published mods: a `Client` with a `ui.fault` fallback and a
  test, a `$` namespace through `engine.create`, per-surface prop changes, subagent routing in
  `turn.step`, and how published mods handle bands, state, CI and larger plugins.
- `gotchas.md` adds the hooks the built-in guard skips on organization machines, the `.catch`
  change in 2.1.301, `$.config.list` and late `$` calls, VS Code drawing gaps, `Client` in
  VS Code, and slow programs in hooks. The `$.model.complete` caching entry is gone (fixed in
  2.1.292).
- New `mods` reference `published-mods.md`: ten public mods (token-optimizer, effortless,
  prismantis, claude-skins, flightdeck and others) with what each does and uses, ideas by kind,
  how they are packaged, and the mod catalogs. The route table and Build step 1 point to it.
- `testing-and-debugging.md` points to the built-in mods' test suites, adds `mock.session`,
  `part: { plugin }` on drawn roots, the guard's skip line, and a CI section.

## 0.5.0

- New skill `writing-for-agents`, moved in from the `engineering` plugin and now the single source
  for the writing craft of any document an agent consumes, CLAUDE.md included. It is invoked as
  `extension-dev:writing-for-agents`; `engineering:writing-for-agents` is gone. It is the
  newer version, with `when_to_use` triggers, a "What to optimize for" section,
  pointer examples, a revision pass and a "Done when" bar.
- `create-skill`'s `authoring.md` keeps only the skill-specific layer (the description, the
  invocation choice, frontmatter, bundled files, dynamic context injection, forks) and points to
  `writing-for-agents` for the rest. `create-skill/SKILL.md` and `references/subagents.md` call it
  by name.
- No em-dashes in prose, script output included. The validator, the plugin lint, the eval scripts
  and the review viewer print colons, periods and `-` placeholders instead.

## 0.4.1

- `create-skill`'s triggering harness runs each query in its own temporary project. All parallel
  workers used to write their command files into the same `.claude/commands/`, so every run saw up
  to `--num-workers` identical copies of the skill, often invoked a sibling's copy, and was scored
  as not triggered. With 6 workers the `mods` skill scored 1/30 on should-trigger queries that
  fired on the first try when run alone. Runs also skip session persistence and auto memory now,
  so the temporary projects leave nothing behind in `~/.claude/projects/`.
- The harness tests `when_to_use` as well as `description`. It parsed only `description`, so a
  skill that put its trigger phrases in `when_to_use`, as the create-skill references advise, was
  measured without them. The command file now carries both fields and Claude Code builds the
  listing entry itself. The optimization loop rewrites `description` only, holds `when_to_use`
  fixed and shows it to the rewriter, and caps the description at what the 1,536-character listing
  budget leaves after `when_to_use` (at most 1,024). `references/triggering.md` says so.

## 0.4.0

- The plugin is renamed from `claude-harness-dev` to `extension-dev`. Claude Code 2.1.287 reserves
  plugin names starting with `claude-`, so `claude plugin validate` rejected the plugin and the
  whole marketplace. There is no `renames` entry: existing installs report `plugin-not-found` until
  you run `claude plugin uninstall claude-harness-dev@meyden` and
  `claude plugin install extension-dev@meyden`. Every command moves with the name, for example
  `/extension-dev:create-skill`, `/extension-dev:create-plugin` and `/extension-dev:mods`.
- `create-plugin`'s `init_plugin.sh` refuses the reserved plugin names, and
  `references/marketplace.md` lists them. Before this it only checked kebab-case, which is how this
  plugin got its name.

## 0.3.0

- New skill `mods` for Claude Code mods, the plugins whose hooks module runs inside Claude Code
  (shipped in 2.1.287). It covers what a mod can and cannot do, when a settings hook, skill or MCP
  server fits better, building a mod in this marketplace, validating, testing and debugging it,
  releasing it, reviewing a third-party mod, and organization policy. The API moved between patch
  releases all through early access, so the skill treats the types Claude Code generates for the
  running version as the authority and its own references as a dated snapshot. Its twelve recipes
  were each validated and type-checked on 2.1.287 rather than copied from docs written for older
  builds.
- `create-plugin`'s `check_plugin.py` no longer reports a mod's `hooks/hooks.json` as an unfilled
  scaffold. A mod's file holds only `"modules"`, and the check only looked for `"hooks"`, so every
  valid mod failed the lint.

## 0.2.2

- `create-plugin` documents `claude plugin validate --json`, which reports the same findings on the
  same exit codes in machine-readable form. Only `--strict` was covered before, so the CI-facing
  advice stopped at a human-readable log.
- `create-plugin`'s hook events table gains `PreModelSwitch` / `PostModelSwitch`, and the reference
  now names the payload fields worth acting on. `SessionStart` carries
  `seconds_since_last_response`, `context_tokens`, `prompt_cache_likely_expired` and
  `estimated_cache_write_usd` on a `resume` or `fork` source, and both model-switch events carry
  `from_model`, `to_model`, `requested_model`, `prompt_cache_warm` and the same cost estimate. The
  table listed events only, so a hook author had no way to know these existed short of dumping a
  payload.
- `create-skill` points at `claude plugin eval` for skills that ship inside a plugin, with the
  trade-off stated rather than implied: it is the scored number, the bundled harness is how you
  improve it. The bundled harness keeps the viewer, the human feedback loop, snapshot baselines and
  the triggering loop, none of which `plugin eval` covers.

## 0.2.1

- All skill prose in `create-skill` and `create-plugin` is free of em-dashes, rewritten sentence
  by sentence rather than substituted. `create-plugin`'s `when_to_use` was rephrased to drop a
  colon that would have broken its YAML frontmatter. No behaviour change.

## 0.2.0

- The plugin ships its first two skills, `create-skill` and `create-plugin`, moved in from this
  repo's own `.claude/skills/` where only this checkout could reach them. Everything they do is
  unchanged; the `meyden-` prefix on their names goes away, since the plugin namespace now carries
  it. They are invoked as `/claude-harness-dev:create-skill` and
  `/claude-harness-dev:create-plugin`.
- Both skills now state the rule their own scripts broke: bundled scripts are stdlib-only, an
  optional import that degrades is not an exemption, and a genuine dependency goes to the user
  through AskUserQuestion (with the stdlib alternative offered beside it) before the import is
  written.
- `quick_validate.py` and `validate_skill.py` no longer touch `pyyaml`. `quick_validate.py` died
  outright on any machine without it; `validate_skill.py` used it for a strict YAML parity check
  when present, which made the same skill pass on one machine and fail on another. Both now parse
  frontmatter with the stdlib parser `validate_skill.py` already carried.
- The manifest's empty `skills` array is gone. `skills/` is always scanned, and a listed path adds
  to that scan rather than replacing it, so the array said nothing.

## 0.1.1

- Initial manifest and marketplace entry.
