---
name: release-check
description: Run the pre-release readiness audit for the current branch against a base ref. Reports blocking issues, risky dependency changes, and the semver bump the commits imply.
argument-hint: "[base-ref] (default: last release tag)"
allowed-tools: Bash(git log:*), Bash(git diff:*), Bash(git tag:*), Bash(git status:*), Bash(git rev-parse:*), Read, Glob, Grep
---

# Release readiness check

Audit whether the current branch is ready to release. Do not change any files during this
command — it is a read-only gate.

Base ref: `$0` — if empty, resolve it yourself with `git describe --tags --abbrev=0` and fall
back to the repository's first commit when no tag exists.

## Steps

1. **Establish the range.** Confirm the working tree is clean (`git status --porcelain`) and
   resolve `<base>..HEAD`. Report the commit count. If the range is empty, stop and say so.

2. **Audit in parallel.** Launch these two subagents in a single message so they run
   concurrently:
   - `release-toolkit:release-auditor` — pass the resolved range and ask for blocking issues,
     the implied semver bump, and anything that looks unreleasable.
   - `release-toolkit:dependency-risk-analyst` — pass the resolved range and ask for the risk
     assessment of dependency and lockfile changes.

3. **Cross-check the version.** Read the project's version file (`package.json`, `pyproject.toml`,
   `Cargo.toml`, `VERSION`, or whatever this repo uses) and compare the current version against
   the bump the auditor derived. Flag a mismatch.

4. **Report.** Produce a single verdict block:

   ```
   Range:        <base>..HEAD  (<n> commits)
   Implied bump: <major|minor|patch>  -> <current> => <suggested>
   Verdict:      READY | BLOCKED

   Blocking:
     - ...
   Risks:
     - ...
   ```

   List blocking issues first, most severe first. If there are none, say `Blocking: none`
   rather than omitting the section. Never soften a BLOCKED verdict — state it plainly.

5. **Next step.** If the verdict is READY, tell the user they can run `/release-prep` to draft
   the changelog and release notes. Do not run it for them.
