# agent-toolkit

Writing and testing Claude Code extensions: skills, plugins, mods, and the marketplace that ships
them. One command, `/agent-toolkit:create-plugin`, followed by what you want in your own words:

```
/agent-toolkit:create-plugin add a skill for our release checklist to dev-workflow
/agent-toolkit:create-plugin a pane that lists this session's tool calls
/agent-toolkit:create-plugin why does my github skill never fire
```

It reads the request and loads the layer the work needs: `create-skill` for a SKILL.md or subagent,
`mods` for code that runs inside Claude Code. Those two are not in the `/` menu; Claude also loads
them on its own when a request matches. A fourth skill, `writing-for-agents`, holds the writing
craft `create-skill` (and every CLAUDE.md) draws on.

## Which one

A plain skill is instructions the model reads. Reach for `create-plugin` when the job needs
something a skill cannot: a hook that fires whether or not the model chooses to, an executable on
`PATH`, a per-user secret, a registered subagent, a bundled MCP or LSP server, a terminal color
theme, or state that survives its own updates. Everything else is `create-skill`, and `create-plugin` hands the
SKILL.md itself to it.

Reach for `mods` when the plugin has to change Claude Code itself: draw a pane or a band above the
prompt, recolor the desktop Code tab and the mobile app, add a command that runs code with no
Claude turn, or rewrite prompts and tool calls from inside the session. It builds on `create-plugin` for the marketplace entry and release.

## All skills

| Skill | What it does |
| :-- | :-- |
| `create-skill` | Create and edit skills, audit frontmatter and structure against the current spec, run evals and benchmarks, optimize a description for triggering accuracy |
| `writing-for-agents` | The craft of writing anything an agent reads (skills, CLAUDE.md, subagent prompts, pointer-reached docs): context pointers, information hierarchy, completion criteria, leading words, pruning. Adapted from [Matt Pocock's skill of the same name](https://github.com/mattpocock/skills) (MIT) |
| `create-plugin` | Scaffold `plugins/<name>/` with its manifest, add hooks / `bin/` / MCP / LSP / agents / terminal themes / `userConfig` / `engines`, register the marketplace entry, lint (theme files included) and validate, bootstrap a marketplace repo when there isn't one |
| `mods` | Explain what a mod can and cannot do, build one against the types of the running Claude Code version (desktop and mobile looks included), validate and test it, ship it, review a third-party mod for safety, and answer organization-policy questions. Needs Claude Code 2.1.287 or later; the references describe 2.1.325 |

## What it needs

`python3` and a POSIX shell for the bundled scripts (stdlib only), plus the `claude` CLI for
`claude plugin validate`, `claude plugin details` and `claude plugin eval`. `claude plugin eval`
spends real tokens and publishes its report to claude.ai unless you pass `--no-publish`.

## Install

```bash
claude plugin install agent-toolkit@meyden
```
