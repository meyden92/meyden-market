# Mod security and organization policy

What a mod can reach, how to judge one before it is installed, and the controls an administrator
has. Facts as of Claude Code 2.1.287, rechecked against the 2.1.325 docs (2026-11-14); the guard's source is public at
`https://github.com/anthropics/claude-code/tree/main/mods/sec-default`.

## Contents

- [The trust model](#the-trust-model)
- [Review a mod before installing it](#review-a-mod-before-installing-it)
- [The order mods run in](#the-order-mods-run-in)
- [The built-in guard](#the-built-in-guard)
- [Managed settings for mods](#managed-settings-for-mods)
- [Organization mods and policy mods](#organization-mods-and-policy-mods)
- [Turning mods off](#turning-mods-off)

## The trust model

A loaded mod runs inside Claude Code as the user, with no sandbox. Sandboxing covers the Bash
commands Claude runs; processes a mod starts run outside it. A mod can:

- read and write any file the user can, start programs, and make network requests;
- read environment variables and settings files, including API keys kept there;
- see every prompt and every tool call, and rewrite either;
- submit a prompt as if the user typed it, and message the user's other sessions;
- approve a tool call before the user is asked, including one an `ask` rule would prompt for or a
  non-managed `PreToolUse` hook blocked, and in auto mode skip the classifier for calls it
  approves;
- spend the user's plan or API key on model calls (counted in `/cost` and `--max-budget-usd`
  from 2.1.325);
- call tools and MCP tools itself with no permission prompt (2.1.321), stopped only by deny rules
  and organization policy;
- recolor the desktop and mobile apps and draw behind the conversation (`$.theme.set`);
- redraw most of the UI, including the AskUserQuestion dialog, but never the permission prompt or
  Claude Code's own confirmation questions (2.1.323).

Installing a mod is trusting its author and its marketplace with all of that.

## Review a mod before installing it

1. Get the plugin's files without installing them (clone its repository).
2. Run `claude plugin validate <dir>` on 2.1.323 or later, so long `hooks:` and `calls:` lists run on
   to further lines instead of being cut, and approve nothing that fails it. Claude Code refuses to
   load a module whose use of `$` the analyzer cannot read, so those lines are a complete list of
   what the code can reach. From 2.1.325 it also reports unsafe paths and links in the folder.
3. Read the lines against these tables.

| In `calls:` | Means |
| :-- | :-- |
| `$.fs.read`, `$.fs.write` | Reads or writes files anywhere the user can |
| `$.process.run`, `$.process.spawn` | Starts programs as the user, outside sandbox and network policy |
| `$.http.fetch` | Network requests (covered by the organization's network policy) |
| `$.env.get`, `$.settings.read` | Reads variables and settings that can hold keys; `env reads:` names each variable |
| `$.env.set` | Changes the environment of every later command and MCP server; `env writes:` names each |
| `$.mcp.call`, `$.tool.call` | Calls tools with no permission prompt (2.1.321): ask rules don't stop it, deny rules and organization policy do |
| `$.model.complete`, `$.model.fork`, `$.model.classify` | Spends the user's plan or API key; from 2.1.325 `/cost` shows it |
| `$.theme.set`, `$.theme.clear` | Changes the desktop and mobile look, and `clear` removes any other mod's look |
| `$.prompt.submit` | Starts turns, possibly in the user's own words |
| `$.session.send` | Sends text another session's or subagent's Claude reads |

| In `hooks:` | Means |
| :-- | :-- |
| `tool.call`, `prompt.submit` | Sees and can change every tool call or every prompt |
| `tool.check` | Approves or denies calls before the permission prompt |
| `session.append` | Rewrites each conversation row before it is stored |
| `ui.render{component=AskUserQuestion}` | Can redraw the dialog Claude uses to ask the user a question |
| `prompt.section`, `prompt.compose`, `skill.prompt` | Rewrites what Claude is instructed with |
| `plugin.register`, `engine.create`, `<noun>.<method>` | Acts on other mods or intercepts their calls; read the `adds to $:` and `withholds from $:` lines (2.1.323) for what `engine.create` changes |
| `tool.list` | Adds tools Claude sees or takes tools away from it and every agent |
| `ui.render{component=AbovePromptList}` | Can hide or reorder other mods' band rows |

4. Read the module source wherever a risky call appears. The combinations that matter: a file or
   environment read flowing into `$.http.fetch` (exfiltration), a URL or command assembled from
   fetched data (the payload can change after install), `tool.check` answering `allow`,
   `$.prompt.submit` with `asUser: true`, and `$.env.set` on `PATH` or a proxy variable.
5. Report a verdict: what the mod reaches, which of those reaches its purpose explains, and
   anything it reaches that its purpose does not.

`claude plugin details` reports `Hooks (0)` for a mod (2.1.287, still on 2.1.318), so `validate`
is the review tool.

When Claude writes a mod in a session, it turns on without asking in auto and bypass modes (from
2.1.321, even with managed `allowUnsandboxedCommands: false` or `allowManagedDomainsOnly`), asks
once in the other modes, and never loads in `dontAsk`. Managed `disableSideloadFlags` keeps such
mods from loading at all.

## The order mods run in

Hooks on one event form a single chain. The first mod is outermost: it sees the event first and
the result last, and decides whether the rest run. From outermost:

1. The built-in guard `sec-default@builtin` where it loads, then the mods in managed
   `prependPlugins`, then any other mod that counts as the organization's and is not appended.
2. Mods the user installed. Among them, a mod runs before the mods it lists in `dependencies`.
3. Mods in `appendPlugins`.
4. Other built-in mods.

Within one module, hooks run in `on()` order. There are no numeric priorities.

Settings hooks sit at fixed points of a tool call. Managed `PreToolUse` hooks run before the first
mod's `tool.call`, their block is final, and they run again on a call a mod rewrote. Every other
`PreToolUse` hook (user, project and plugin settings) runs after the last mod calls `next`, so a
mod that answers without `next` keeps them from running. `tool.check` fires after those hooks and
the permission rules, so it can approve a call a non-managed hook blocked.

## The built-in guard

`sec-default@builtin` (shown as `cc-plugin-sec-default`) loads ahead of every user mod when the
machine has managed settings or the user signs in with a Team or Enterprise plan. API-key,
Bedrock, Vertex and Foundry users get it only on a managed machine. Users cannot turn it off. If
managed `prependPlugins` is set, the guard loads only when that list names it.

It stops a user's mod from changing what managed hooks receive or decide, the system prompt,
managed `CLAUDE.md` and instructions, what any mod reads as settings, and the tools and
descriptions of managed MCP servers. Where it loads, a user's mod cannot approve a call a `deny`
rule refuses. It adds nothing else: a user's mod still reads and writes files, runs processes and
reaches the network, and a denied `Read(.env)` does not stop `$.fs.read` of that file or a program
the mod starts.

Its two options live only in managed settings, only under this spelling:

```json
{
  "pluginConfigs": {
    "cc-plugin-sec-default@builtin": {
      "options": { "allowManagedModsOnly": true, "allowModsToOverrideDenyRules": false }
    }
  }
}
```

- `allowManagedModsOnly`: only the organization's mods and built-ins load.
- `allowModsToOverrideDenyRules`: lets a user's mod approve a call a `deny` rule refuses.

The guard fails closed: unable to read managed settings, it refuses every user mod; unable to check
the deny rules for a mod-approved call, it refuses the call.

## Managed settings for mods

| Goal | Managed settings |
| :-- | :-- |
| No user mods, organization mods allowed | Guard option `allowManagedModsOnly: true` |
| Only the organization's mods, no sideloading | `allowManagedModsOnly` plus `disableSideloadFlags: true`, organization mods enabled through managed `enabledPlugins` |
| No mods and no hooks at all | `disableAllHooks: true` (organization mods stop too) |
| Only managed hooks and mods | `allowManagedHooksOnly: true` |
| Control which plugins can be installed | The existing plugin controls (`strictKnownMarketplaces` and friends) cover mods |
| A policy of your own | A policy mod listed in `prependPlugins` beside `sec-default@builtin` |

Network policy covers `$.http.fetch` and not programs a mod starts. Users on machines without
managed settings and without a Team or Enterprise sign-in may set `prependPlugins` and
`appendPlugins` in their own settings.

## Organization mods and policy mods

A mod counts as the organization's in one of two setups, both in managed settings:

- **A remote marketplace** (GitHub, git, URL), from 2.1.324: `enabledPlugins` sets it `true`,
  `extraKnownMarketplaces` declares the marketplace (pin it and the entry to control when the code
  changes), and the mod's id is listed in `prependPlugins` or `appendPlugins`; with
  `prependPlugins`, also list `sec-default@builtin` to keep the guard. This works from the claude.ai
  admin console, with nothing to place on disk. `pluginDigests` is deprecated and ignored.
- **A directory on each machine**: `enabledPlugins` sets it `true`, and the marketplace is a
  `directory` source at an absolute path (through `extraKnownMarketplaces`) that lists the plugin
  by relative path, so it loads in place. The directory must exist on each machine and be
  writable only by an administrator; server-delivered managed settings can carry the keys but
  cannot place the directory.

Any other installed plugin counts as the user's, even when managed `enabledPlugins` enables it:
`prependPlugins` and `appendPlugins` skip it, `allowManagedModsOnly` refuses it, and the debug log
says `is enabled by managed settings, but`.

A policy mod in `prependPlugins` sees every other mod first:

- `plugin.register` receives `e.tier` and `e.uses` (events, calls spelled `process.run`, env and
  state) and may return `{ refuse: reason }`. Give it a `.catch` that refuses user-tier mods, or a
  throw lets the mod through.
- A hook on any `$` call by name (`fs.write`, `http.fetch`) observes, rewrites or denies that call
  for every later mod; `next.origin.plugin` names the caller.
- `engine.create` can withhold a namespace from a mod entirely, from a hook on it by name in the
  one form `validate` accepts (2.1.323); a `*` hook only observes. Withholding is refused in the
  user tier and unloads that module.
- An `AbovePromptList` hook can hide or reorder other mods' band rows (2.1.323).
- `next.to(e, tier)` lets a prepended or appended mod skip ahead in the chain.

The complete recipe is in [patterns.md](patterns.md#policy-mod-that-refuses-other-mods), and its
test pattern (`tier('prepend')`, inline `plugins`) in
[testing-and-debugging.md](testing-and-debugging.md#testing-clear-and-policy-mods). A policy mod is
not a hard boundary: three hooks-worker crashes unload every non-built-in mod including it, and
`--safe-mode` starts without it.

## Turning mods off

| Scope | How |
| :-- | :-- |
| One mod | Disable or uninstall its plugin in `/plugin`, Installed tab |
| Every installed mod, one session | `claude --safe-mode` (also drops other customizations), or `--bare` |
| Every mod the user installed, every session | `"disableAllHooks": true` in `~/.claude/settings.json`; settings hooks and the custom status line stop too, managed ones keep running |
| A built-in mod | Disable it in `/plugin` (the guard excepted) |

`disableAllHooks` and `allowManagedModsOnly` stop only the hooks module: the plugin stays
installed and its skills, commands, agents and MCP servers still load. `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=0`
does nothing from 2.1.287 on.
