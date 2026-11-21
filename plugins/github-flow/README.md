# GitHub Flow

GitHub issues, pull requests and CI through `gh`, with the organisation's issue lifecycle and
PR conventions enforced.

## What you get

**`meyden-gh` on your PATH** while the plugin is enabled.

```bash
meyden-gh scope                 # which repositories a question here covers
meyden-gh overview --table      # the backlog, paginated properly
meyden-gh overview --mine       # assigned to you, within this repo + submodules
meyden-gh issue status 42 doing # move the lifecycle label the project actually uses
meyden-gh ci --pr 123           # runs, failed jobs, log tails
meyden-gh graph 464             # what blocks this, what it unblocks
```

Run `meyden-gh` for the full verb list, and `meyden-gh <verb> --help` for one verb.

**One skill**, `/github-flow:github`. It fires on its own when the work matches.

**A guard hook** on every Bash command, whether or not the skill loaded. It denies
pull-request text containing `Closes/Fixes/Resolves #N`.

## What a GitHub question covers

The repository you are standing in, **and its submodules**. `meyden-gh scope` prints
the set, and the github skill loads it on every invocation, so an answer is scoped without
anyone having to say so.

Submodules come from `.gitmodules`, one level deep, so the ones not yet checked out still
count. A superproject whose code lives in submodules is one piece of work; an answer that
stops at the superproject would describe almost none of it.

Going wider is a separate question. `meyden-gh overview --mine` ends with a bare count
of what falls outside the scope: enough to know more exists, not enough to answer a
question nobody asked. `--all` lists them properly, `-R owner/repo` targets one.

## Project-specific rules

```
<project>/.claude/skill-context/github-flow/CONTEXT.md          # every skill
<project>/.claude/skill-context/github-flow/github/CONTEXT.md   # github only
```

Anything in there is loaded whenever the skill runs: this project's label vocabulary, its
integration branch. Keep them short; they are injected on every invocation and are truncated
past 8 KB.

Project rules add to the skill's own rules. They never license skipping a confirmation, a
verification step, or a destructive-operation prompt.

## What you need installed

- **`gh`** (2.94+ for sub-issue and dependency flags), authenticated: `gh auth login`. The
  plugin never handles a token: every GitHub call goes through `gh`, which reads its own
  keyring store.
- **`jq`**, for `meyden-gh ci`.
- **`python3`** (3.9+) and **`bash`**.

## Configuration

None. `gh` owns GitHub authentication, so the plugin holds no credentials of its own and asks
for nothing on install.
