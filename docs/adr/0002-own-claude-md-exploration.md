# claude-md owns its codebase exploration

The `create` mode of `claude-md` explores a repository itself — a subagent sweep for what is discoverable, then an interview for what is not — instead of delegating the sweep to the built-in `/init` command and refining its output. A future reader will reasonably ask why we did not build on `/init`, since it already scans build systems, test frameworks and conventions.

## Considered Options

- **Wrap `/init`** — delegate the scan, refine on top. Genuinely attractive: less to build, and it tracks Claude Code's own evolution for free. Rejected because the refinement pass needs the exploration's *findings*, not its output document; reverse-engineering what a generated CLAUDE.md implies about a codebase is harder than reading the codebase.
- **Drop `create`** — audit and improve only, tell people to run `/init` first. Rejected: the interview half is where the content Claude cannot infer comes from, and that is the reason generated files read as generic.

## Consequences

We inherit the maintenance `/init` would have absorbed: when Claude Code changes what it detects, our sweep does not follow automatically. Accepted because the interview, not the scan, is where this skill's value sits.
