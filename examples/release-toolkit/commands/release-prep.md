---
name: release-prep
description: Draft a release — generate release notes from the commit range, update CHANGELOG.md, and bump the project version. Use after /release-check reports READY.
argument-hint: "[version] [base-ref]"
allowed-tools: Bash(git log:*), Bash(git diff:*), Bash(git tag:*), Bash(git status:*), Bash(git rev-parse:*), Bash(git describe:*), Read, Glob, Grep, Edit, Write
---

# Prepare a release

Draft the release artifacts for this repository. Commit nothing and tag nothing — the
developer reviews the diff and does that themselves.

Target version: `$0` (if empty, derive it from the implied semver bump).
Base ref: `$1` (if empty, resolve with `git describe --tags --abbrev=0`).

## Steps

1. **Verify readiness.** Check `git status --porcelain` is clean. If it is not, stop and tell
   the user to commit or stash first. If the user has not run `/release-check` in this session,
   say so and recommend it, but continue if they asked for `/release-prep` directly.

2. **Generate the notes.** Use the `release-notes` skill to build the notes from the commit
   range. It resolves the version bump, groups commits by audience, and renders markdown. Do
   not hand-write the notes from `git log` when the skill can produce them.

3. **Confirm the version.** If `$0` was empty, state the version you derived and the bump that
   produced it before writing anything. If the derived bump is `major`, list the breaking
   changes that caused it.

4. **Update the changelog.** Delegate to the `release-toolkit:changelog-writer` subagent. Give
   it the generated notes and the path to `CHANGELOG.md`. It prepends a new section and leaves
   the rest of the file untouched.

5. **Bump the version.** Edit the project's version file to the target version. Change only the
   version field. If the repository has a lockfile that embeds the version (for example
   `package-lock.json`), update it too and say which files you touched.

6. **Report.** List every file you changed, then print the exact commands the developer runs to
   finish — do not run them:

   ```bash
   git add -A && git commit -m "chore(release): v<version>"
   git tag -a v<version> -m "v<version>"
   git push && git push --tags
   ```
