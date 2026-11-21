# meyden Claude Code marketplace

Internal Claude Code plugins — skills, agents, hooks, and CLI tools — that meyden developers
install into their own projects.

These plugins are published here:

| Plugin | In one line |
| --- | --- |
| [remote-ssh](#remote-ssh) | Work on one remote machine over SSH, pinned per session |
| [github-flow](#github-flow) | Issues, pull requests and CI through `gh`, with the issue lifecycle enforced |
| [dev-workflow](#dev-workflow) | Plan → spec → tickets → TDD → review workflow |
| [agent-toolkit](#agent-toolkit) | Author skills, plugins and mods for this marketplace |

## How to use this marketplace

The marketplace is the private GitHub repository
[`meyden92/meyden-market`](https://github.com/meyden92/meyden-market). Add it once per machine —
this registers the catalog; nothing is installed yet.

```bash
claude plugin marketplace add git@github.com:meyden92/meyden-market.git
```

You need read access to the repository, your SSH key registered on your GitHub account, and that
key loaded in `ssh-agent` before starting Claude Code. Claude Code suppresses interactive SSH
prompts, so a missing key or an unknown host key fails silently rather than asking. Verify both
first:

```bash
ssh -T git@github.com
```

HTTPS (`https://github.com/meyden92/meyden-market.git`) also works for adding, installing, and
manual updates, because those use your normal git credential helper. Background auto-updates do
not: the refresh runs its `git pull` with credential helpers disabled, which cannot authenticate
against a private repository. Use the SSH form.

The marketplace registers under the name **`meyden`**.

## Installing plugins

Everything past adding the marketplace happens inside Claude Code. Browse the catalog:

```
/plugin  →  Discover tab  →  select a plugin  →  Enter
```

Or go straight to one:

```
/plugin install dev-workflow@meyden
```

The install step asks which scope to use. **Take the default, User** — these plugins are general
tooling, not project-specific, and User scope installs them for you in every project. That is what
you want here.

### Configuring a plugin

A plugin that needs settings asks for them on install, and you can revisit them at any time:

```
/plugin  →  installed plugin  →  configure
```

Secrets go to the OS keychain; the rest goes to your own `~/.claude/settings.json`. Nothing is
written into the repository, so a cloned project can never set these for you.

### Enable auto-updates

Third-party marketplaces have auto-update **off** by default, so this marketplace does not refresh itself until you turn it on:

```
/plugin  →  Marketplaces tab  →  meyden  →  Enable auto-update
```

Updates are fetched shortly after a session starts. The running session keeps the versions it
launched with; `/reload-plugins` switches to the new ones without a restart.

Also set this in your shell profile, so a network blip or an unreachable GitHub does not wipe the local clone:

```bash
export CLAUDE_CODE_PLUGIN_KEEP_MARKETPLACE_ON_FAILURE=1
```

### Commands are namespaced

Every skill, command, and agent a plugin provides is prefixed with the plugin name. The `github-flow` plugin's `github` skill is therefore invoked as:

```
/github-flow:github
```

That prefix is what you will see in the slash-command suggestions — search for the plugin name if
you cannot find a command by its bare name.

### Two kinds of skill

Each skill is either **user-invoked only** or **auto-firing**:

- **User-invoked only** skills run when you type their slash command and never otherwise. They cost nothing in context until used. Marked 🔒 in the tables below.
- **Auto-firing** skills also load on their own when the work matches their description — asking
  "why is the build red" pulls in `github-flow:github` without you naming it. You can still invoke them explicitly.

### Per-project rules

`remote-ssh`, `github-flow` and `dev-workflow` read project-specific rules on every invocation from
`.claude/skill-context/<plugin>/`, so one repository's label vocabulary or deploy paths travel with the repo instead of living in your head. Details are in each plugin's README.

---

## Plugins


### remote-ssh

**Work on one remote machine over SSH.** Installs **`meyden-ssh`** on your `PATH` while enabled,
gives you a skill over it, and adds a guard hook that runs on *every* Bash command — skill loaded
or not — denying remote commands that would hang with no TTY, denying `StrictHostKeyChecking=no`,
denying work aimed at a host other than the pinned one, and routing destructive operations to a
confirmation prompt.

```
/plugin install remote-ssh@meyden
```

Needs `python3` 3.10+ and `bash`. No credentials of its own.

| Command | When to use | Example |
| --- | --- | --- |
| `/remote-ssh:ssh` | Work that can only be done *on* one specific machine: its logs, services, disk, containers, or deploying a build onto it. Not for "is X up" — that is answerable from outside | "pin app1, then show me the last 200 lines of the nginx journal"<br>→ `meyden-ssh pin app1` then `meyden-ssh logs nginx 200` |

**The session pin.** `meyden-ssh pin <alias>` settles a Claude session on one machine; every
`meyden-ssh` verb then acts on it without being told, and raw `ssh`/`scp`/`rsync` aimed anywhere
else is denied. The pin belongs to one session — a second terminal holds its own — survives a
resume, and is released when the session ends. `meyden-ssh status` / `meyden-ssh unpin`.

**Writes are dry-run first.** `meyden-ssh deploy` shows what would change and needs `--apply` to do it.

[Plugin README](plugins/remote-ssh) — full verb list, guard-hook rules, project rules.

---

### github-flow

**GitHub work through `gh`.** Installs **`meyden-gh`** on your `PATH` while enabled, gives you a
skill over it, and adds a guard hook that denies pull-request text with `Closes/Fixes/Resolves #N`.

```
/plugin install github-flow@meyden
```

Needs `gh` (authenticated, 2.94+), `jq` for CI log parsing, `python3` 3.10+, and `bash`. No credentials of its own.

| Command | When to use | Example |
| --- | --- | --- |
| `/github-flow:github` | Anything living on GitHub rather than your working tree: issues, pull requests, workflow runs, job logs, releases, labels. Not for local diffs or rebases | "why is the build on PR 123 red?"<br>→ `meyden-gh ci --pr 123` |

**GitHub scope.** A question here covers the repository you are standing in *and its submodules*,
read from `.gitmodules`. `meyden-gh scope` prints the set. `--all` or `-R owner/repo` goes wider when you actually mean to.

[Plugin README](plugins/github-flow) — full verb list, project rules.

---

### dev-workflow

**The workflow for building a feature with an agent without giving up your standards.** Plan
through a relentless interview, turn the plan into a spec, split the spec into tracer-bullet
tickets on GitHub, implement each ticket test-first in its own session, and review on two
independent axes.

```
/plugin install dev-workflow@meyden
```

Needs `gh` authenticated. Installing it also installs `github-flow`, whose `github` skill carries every
tracker operation and enforces the organisation's issue lifecycle.

**Run `/dev-workflow:setup` once per repo** before anything else, and again on a new machine. It
refuses to run below Opus 5 or Fable 5 at high effort, probes the machine (runtime, marketplace
wiring, GitHub access, language servers) and offers fixes, writes `docs/agents/issue-tracker.md`
and `docs/agents/domain.md`, audits the repo's labels, adds an `## Agent skills` block to the
repo's `CLAUDE.md`, and merges `autoMemoryEnabled: false` and blank `attribution` into
`.claude/settings.json`.

#### The main flow

| Command | When to use | Example |
| --- | --- | --- |
| 🔒 `/dev-workflow:spec-planning` | Start here for anything non-trivial. A relentless planning interview that also writes ADRs and glossary entries as decisions resolve | `/dev-workflow:spec-planning` then answer questions until the design stops moving |
| 🔒 `/dev-workflow:to-spec` | The interview settled and you want it written down — synthesis only, no further questions. Publishes a GitHub issue labelled `ready-for-agent`, or revises the existing spec in place | `/dev-workflow:to-spec` at the end of a planning conversation |
| 🔒 `/dev-workflow:to-tickets` | The spec is bigger than one session. Splits it into vertical slices with native GitHub blocking links. On a re-plan it maps slices onto the existing tickets (keep, revise, new) instead of publishing a second set | `/dev-workflow:to-tickets` — reads the spec issue, opens the ticket set |
| 🔒 `/dev-workflow:implement` | One ticket, one fresh session: TDD at the seams agreed during planning, then self-review and commit. Given an epic, walks its task graph with one fresh subagent and one commit per ticket, then reviews | `/dev-workflow:implement 464` |
| `/dev-workflow:code-review` | Before opening the MR, or reviewing someone else's branch. Two parallel sub-agents: repo standards, and fidelity to what the issue asked for | `/dev-workflow:code-review since develop` |

Small change that fits one session? Interview, then `/dev-workflow:implement` directly — skip
spec and tickets.

#### Session bookends

| Command | When to use | Example |
| --- | --- | --- |
| 🔒 `/dev-workflow:session-start` | Opening a working session — restores the clock, pulls, surfaces open issues, proposes a first task | `/dev-workflow:session-start finishing the ssh pin fix` |
| 🔒 `/dev-workflow:session-end` | Closing one — lands the work, verifies the push actually reached the remote, stops the clock | `/dev-workflow:session-end` |
| 🔒 `/dev-workflow:handoff` | Context is nearly full but the work is not done. Compacts the session into a document a fresh agent continues from | `/dev-workflow:handoff next session finishes the migration` |

Both bookends are deliberately thin — the point is that each project and each developer bolts its
own steps on through project rules.

#### Thinking and design

| Command | When to use | Example |
| --- | --- | --- |
| `/dev-workflow:interview` | You have a plan or decision and want it stress-tested. The interview primitive: one question at a time, the most load-bearing first, facts looked up, decisions asked | `/dev-workflow:interview should we shard the ledger per author?` |
| `/dev-workflow:codebase-design` | Designing or improving a module's interface — deep modules, seams, adapters, testability | "where should the seam between the parser and the renderer go?" |
| `/dev-workflow:domain-modeling` | Pinning down terminology or recording an architectural decision. Also fires on its own when a hard-to-reverse decision crystallises mid-work | "record that we chose JSONL over SQLite and why" |
| 🔒 `/dev-workflow:wayfinder` | Work far too big for one session — a map issue of decision tickets, resolved one per session until the route is clear | `/dev-workflow:wayfinder migrate the api to the new auth model` |
| 🔒 `/dev-workflow:improve-codebase-architecture` | Periodic health scan. Presents deepening opportunities as an HTML report, then walks the one you pick through a planning interview | `/dev-workflow:improve-codebase-architecture` |

#### Building

| Command | When to use | Example |
| --- | --- | --- |
| `/dev-workflow:tdd` | Building a feature or fixing a bug test-first; "red-green-refactor" | "write the failing test for the idle-gap calculation first" |
| `/dev-workflow:prototype` | A design question you cannot answer by arguing — throwaway code that shows whether the state model or the UI feels right | `/dev-workflow:prototype does the split-ledger report read clearly?` |
| `/dev-workflow:research` | Reading legwork against primary sources, delegated to a background agent. Writes a cited markdown file into the repo | `/dev-workflow:research how does GitHub's issue-dependencies API model blocking edges?` |
| `/dev-workflow:wizard` | Steps only a human can perform — provisioning, CI secrets, an unfamiliar third-party dashboard. Generates an interactive bash script | `/dev-workflow:wizard set up the deploy key on the new runner` |

#### Project rules

Every skill loads repo-specific rules on each invocation, from four files, each overriding the ones
before it:

```
.claude/skill-context/dev-workflow/CONTEXT.md               committed · all skills
.claude/skill-context/dev-workflow/<skill>/CONTEXT.md       committed · one skill
.claude/skill-context/dev-workflow/CONTEXT.local.md         personal  · all skills
.claude/skill-context/dev-workflow/<skill>/CONTEXT.local.md personal  · one skill
```

A rule you keep to yourself outranks one the repo shares. Rules may extend or override a skill's
defaults; they never authorise skipping a confirmation or publishing without approval. 8 KB cap
each.

[Plugin README](plugins/dev-workflow) · [team guide](docs/using-dev-workflow.md)

---


### agent-toolkit

**For working on this marketplace itself** — authoring, auditing, and shipping Claude Code
extensions. Three skills, one per layer.

```
/plugin install agent-toolkit@meyden
```

Needs `python3`, a POSIX shell, and the `claude` CLI for `claude plugin validate` / `details` /
`eval`. 
***Note:*** that `claude plugin eval` spends a **lot** of tokens,
depending on the evaluation turns it does it may use several million tokens.

| Command | When to use | Example |
| --- | --- | --- |
| `agent-toolkit:create-skill` | Loaded by `create-plugin`, or by Claude on its own. A plain skill — instructions the model reads. Also edits, audits frontmatter against the current spec, runs evals, and tunes a description that is not triggering | `/agent-toolkit:create-plugin audit ./plugins/github-flow/skills/github`<br>"create a skill for our release checklist" |
| `/agent-toolkit:create-plugin` | The one command: write what you want after it, and it loads `create-skill` or `mods` when the work needs them. On its own it covers anything a skill alone cannot do: a hook, a `PATH` executable, per-user secrets, a registered subagent, a bundled MCP or LSP server, or state surviving updates. Scaffolds, registers in `marketplace.json`, validates, releases | `/agent-toolkit:create-plugin add a PreToolUse hook to dev-workflow`<br>`/agent-toolkit:create-plugin release remote-ssh` |
| `agent-toolkit:mods` | Loaded by `create-plugin`, or by Claude on its own. A mod: a plugin whose code runs inside Claude Code to draw a pane or a band above the prompt, add a command that runs with no Claude turn, or rewrite prompts and tool calls. Explains what mods can do, builds, tests and ships one, reviews a third-party mod. Needs Claude Code 2.1.287+ | `/agent-toolkit:create-plugin build a pane that lists this session's tool calls`<br>"is ./some-mod safe to install" |
| `agent-toolkit:writing-for-agents` | Writing any document an agent consumes: a skill, a `CLAUDE.md`/`AGENTS.md`, a doc behind a pointer. Fires on its own, and `create-skill` loads it every time | "tighten this CLAUDE.md, the agent keeps ignoring it" |

`create-plugin` takes free text; there are no mode or target arguments.

[Plugin README](plugins/agent-toolkit)

---

## Contributing

[docs/authoring-plugins.md](docs/authoring-plugins.md) — required layout, manifest fields, and how
to validate a plugin before opening a merge request.

[`examples/release-toolkit`](examples/release-toolkit) is the worked example to copy from. It ships
every component type — commands, agents, and a skill with references and scripts — and is
deliberately kept out of the catalog, so it is not installable.
