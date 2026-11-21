# When a plugin doesn't work

Read this when a plugin loads but a component is missing, a hook never fires, a server never starts,
or `validate` passes and the plugin still misbehaves.

Almost every failure here is silent. The plugin loads, reports nothing, and simply does less than you
wrote, so start from the symptom, not from the manifest.

## The loop

1. `python3 ${CLAUDE_SKILL_DIR}/scripts/check_plugin.py <plugin-dir>`: placement, executable bits,
   dangling `${CLAUDE_PLUGIN_ROOT}` references, host paths, unfilled scaffolds.
2. `claude plugin validate <plugin-dir>`: manifest and frontmatter schemas.
3. `claude --plugin-dir ./my-plugin`: load it for one session without installing. Accepts a `.zip`;
   repeat the flag for several plugins (`--plugin-url` loads one from a URL). A `--plugin-dir` copy takes precedence over an installed
   plugin of the same name, so you can test changes without uninstalling. (Managed force-enabled or
   force-disabled plugins are the exception; `--plugin-dir` can't override those.)
4. `/reload-plugins` after each edit: reloads plugins, skills, agents, hooks, plugin MCP and plugin
   LSP servers. Its summary counts only `commands/`, so it can say `0 skills` while your `skills/`
   edits reloaded fine.
5. `claude --debug`: which plugins load, manifest errors, skill/agent/hook registration, MCP
   initialization, why a server was skipped, and unrecognized agent frontmatter fields with typo
   hints (v2.1.296+).
6. The `/plugin` **Errors** tab, where a language server that failed to start shows up.

`claude plugin details <name>` (for a plugin on disk, `claude --plugin-dir <dir> plugin details <name>`) lists what the plugin actually contributes, grouped as Skills, Agents,
Hooks, MCP and LSP servers, with an always-on and per-component token estimate. If a component isn't
in that inventory, Claude Code never registered it; stop debugging behavior and go fix placement.

## Symptom → cause

| Symptom | Cause | Fix |
| :-- | :-- | :-- |
| Plugin doesn't load at all | Invalid `plugin.json`, or a malformed `hooks/hooks.json` | `claude plugin validate`; a broken hooks file takes the whole plugin down |
| Loads, but skills/agents/hooks missing | Component directories inside `.claude-plugin/` | Move them to the plugin root; only `plugin.json` belongs there |
| A component directory is ignored | The manifest declares that key, and for most fields a custom path **replaces** the default directory | List the default explicitly too: `"commands": ["./commands/", "./extras/"]`. v2.1.140+ warns about this in `claude plugin list` |
| Root `SKILL.md` ignored | A `skills/` directory or a `skills` manifest field exists | Pick one layout |
| Skill invocation name changes on every update | Single-skill plugin with no frontmatter `name`, so it falls back to the install directory, which is a version string | Set `name` in the frontmatter |
| Hook doesn't fire | Script not executable, wrong shebang, case-wrong event name, or a matcher that doesn't match | `chmod +x`; `PostToolUse` not `postToolUse`; test the script by hand; check the debug log, which records which hooks matched and how they exited |
| Hook on your own MCP server never fires | Matcher written against the bare server key | Use `mcp__plugin_<plugin>_<server>__<tool>`, and `plugin:<plugin>:<server>` for an `mcp_tool` hook's `server` |
| MCP server fails to start | Paths not using `${CLAUDE_PLUGIN_ROOT}` | Every bundled path goes through the variable; test the server outside Claude Code; `claude --debug` shows init errors |
| LSP `failed to start` (debug log), or a start warning (v2.1.323+) | The language server binary isn't installed | It's the user's job; say which binary in the README |
| LSP absent, `Invalid LSP server config for ".lsp.json"` | One invalid entry skips the whole file; validate never reads `.lsp.json` | Fix the entry (`command` and `extensionToLanguage` are required) |
| `LSP server "<name>" is not used for <ext> files` | Another enabled server claimed the extension first | Drop the extension from one of them |
| Files missing after install | Paths traversing outside the plugin (`../shared-utils`) | Nothing outside the plugin directory is copied into the cache. Restructure, or use a symlink that resolves inside the plugin or elsewhere in the same marketplace |
| Users never receive an update | `version` unchanged in `plugin.json` | Bump it, or omit it and let the commit SHA drive updates |
| `plugin-not-found` after a rename | No `renames` entry | Add one mapping the old name; append, never edit |
| Relative plugin sources fail | The marketplace was added by direct URL to `marketplace.json` | Only that file is downloaded. Use a git-hosted marketplace, or `github`/`npm`/`url`/`archive` sources |
| Monitors never start | Project-scope `@skills-dir` plugin, a `-p` run, or `${user_config.*}` in the command | Monitors don't load in those cases. Personal scope or a real marketplace install, an interactive session, a script that reads its own config |
| Skill in a nested `.claude/skills` doesn't show | Since v2.1.325 a `--plugin-dir` plugin's nested `.claude/skills` loads only for a session started in the plugin folder, and since v2.1.321 none load from inside `~/.claude/plugins` | Put skills in the plugin's `skills/` |
| Agent loads with description `Agent from <plugin> plugin` | Its frontmatter doesn't parse, so every field was ignored | `claude plugin validate` names the file |
| Startup warns about a plugin's `agent` setting | `settings.json` `agent` is deprecated since v2.1.323 | Remove `settings.json`; tell users to set `agent` themselves |
| Plugin with a version list in `enabledPlugins` stays off | The list doesn't match what is installed | Since v2.1.323 `/plugin` and `claude plugin list` say why; act on that message |
| A newer release never arrives for some users | `engines["claude-code"]` excludes their Claude Code version | Expected: they stay on the newest release that fits until they update Claude Code |
| Install fails on a submodule | Since v2.1.323 a submodule must be on its recorded commit | Commit the submodule pointer you intend |
| `install`/`enable` warns the settings file doesn't load | The settings file it wrote is invalid JSON or blocked (v2.1.295+) | Fix that file; the change didn't take |
| Scheduled task or `/loop` stops to ask before running a skill | Since v2.1.325 it asks for a skill that declares `allowed-tools` or hooks | Add `Skill(<name>)` to `permissions.allow` |
| `${user_config.*}` errors instead of substituting | Used in a shell-form hook command, a monitor command, or `headersHelper` | Exec form with `args`, or read `CLAUDE_PLUGIN_OPTION_<KEY>` / a config file |
| `userConfig` values ignored | Set in project `.claude/settings.json` | `pluginConfigs` is read only from user settings, `--settings`, and managed settings |

## Manifest error messages

- `Invalid JSON syntax: Unexpected token } in JSON at position 142`: missing or extra comma, or an
  unquoted string.
- `… Validation errors: name: Invalid input: expected string, received undefined`: a required field
  is missing.
- `Warning: No commands found in plugin my-plugin custom directory: ./cmds.`: the path exists but
  holds no `.md` files or `SKILL.md` subdirectories.
- `Plugin directory not found at path: ./plugins/my-plugin.`: the marketplace entry's `source` points
  nowhere.
- `Plugin my-plugin has conflicting manifests: both plugin.json and marketplace entry specify
  components.`: remove the duplicate definitions, or drop `strict: false` from the entry.
- `<component> path escapes plugin directory: <path>` / `<component> path not found: <path>`: a
  manifest path leaves the plugin or doesn't exist.
- `not yet supported in a marketplace entry`: the entry's `hooks` is a path or array; write it as an
  inline object or move it into the plugin.
- `Default <folder>/ folder is ignored because the manifest sets "<key>"`: the replace-vs-add rule;
  see [manifest.md](manifest.md#path-behavior-rules).

## The cache

Marketplace plugins are copied into `~/.claude/plugins/cache`, one directory per installed version.
The previous version is marked orphaned on update and removed after 14 days, so sessions that already
loaded it keep working. Glob and Grep skip orphaned directories.

That copy is the reason `..` never works, the reason absolute paths written on your machine break on
everyone else's, and the reason `${CLAUDE_PLUGIN_ROOT}` changes on every update. State that must
survive an update belongs in `${CLAUDE_PLUGIN_DATA}`.

Since v2.1.325 `.mcpb`/`.dxt` bundles unpack under the plugins directory instead of a `.mcpb-cache`
in the plugin's own folder, so read-only plugin folders load.

Symlinks inside a plugin are handled three ways on install: one resolving **within the plugin** stays
a relative symlink; one resolving **elsewhere in the same marketplace** is dereferenced and its target
copied in (this is how a meta-plugin's `skills/` links to a sibling's skills); one resolving **outside
the marketplace** is skipped. For `--plugin-dir` and local-path installs, only the first case survives.
Since v2.1.325 loading also skips some unsafe paths and links in a plugin's folder, and
`claude plugin validate` reports them.
