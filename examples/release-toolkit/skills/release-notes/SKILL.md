---
name: release-notes
description: Generate release notes and changelog entries from a git commit range using conventional commits. Derives the semantic version bump, groups changes by audience, separates churn and non-user-facing work, and renders changelog, announcement, or review markdown. Use when writing release notes, drafting a CHANGELOG entry, deciding whether a release is a major/minor/patch, or summarizing what changed since the last tag.
when_to_use: Triggered by requests like "write the release notes", "what changed since v1.4.0", "draft a changelog entry", "is this a major or minor release", "summarize the commits for this release", or "prepare the notes for tagging".
argument-hint: "[base-ref] (default: last tag)"
allowed-tools: Bash(python3:*), Bash(git log:*), Bash(git describe:*), Bash(git tag:*), Bash(git rev-parse:*), Bash(git status:*), Read, Glob, Grep, Write, Edit
---

# Release notes

Turn a git commit range into publishable release notes. A three-stage Python pipeline does the
mechanical work — parsing, classification, version derivation, rendering — and you do the part
it cannot: reading the diff, checking the classification is honest, and rewriting commit
subjects into prose a user understands.

Do not hand-write notes from `git log` output. The pipeline handles revert pairing, breaking
change detection across three notations, and bump derivation, and it does it the same way for
every repository. Reproducing that by reading a log is slower and quietly inconsistent.

## Pipeline

Three scripts in `${CLAUDE_SKILL_DIR}/scripts/`, composed over stdin/stdout. Standard library
only — no install step, no virtualenv.

```bash
cd "${CLAUDE_SKILL_DIR}/scripts"

python3 collect_commits.py --repo "$PWD_OF_TARGET_REPO" --range v1.4.0..HEAD \
  | python3 classify_changes.py --current-version 1.4.0 \
  | python3 render_notes.py --style review
```

| Stage | Script | In → Out |
| --- | --- | --- |
| 1 | `collect_commits.py` | git repo → commit JSON (sha, subject, body, trailers) |
| 2 | `classify_changes.py` | commit JSON → sections, breaking list, bump, next version, excluded, churn |
| 3 | `render_notes.py` | classified JSON → markdown (`changelog`, `announce`, or `review`) |

Each stage is independently runnable and its output is inspectable JSON. When something looks
wrong, run the stages separately and read the intermediate document rather than guessing which
stage misbehaved.

`--help` on any script lists its full flags.

## Procedure

1. **Resolve the range.** If the user gave a base ref, use it. Otherwise let stage 1 resolve it
   — it uses the most recent tag, falling back to the root commit for a first release. State
   the range you resolved before going further, so a wrong base is caught immediately.

2. **Find the current version.** Read it from the project's manifest (`package.json`,
   `pyproject.toml`, `Cargo.toml`, `VERSION`, `plugin.json`). Pass it as `--current-version` so
   stage 2 computes `next_version`. Without it the pipeline still classifies, but you must
   supply `--version` to stage 3 yourself.

3. **Run the pipeline with `--style review` first.** Always. The review output includes the
   excluded, churn, and unconventional lists, which is where classification mistakes show up.

4. **Verify the classification against the code.** This is the step that makes the output
   trustworthy, and it is the step a pipeline cannot do:
   - Read the diff for every commit in the `breaking` list. Confirm each one actually breaks a
     public interface. A `!` on an internal rename is noise that forces a false major.
   - Read the diff for every commit in `unconventional`. Put it in the right section or drop it.
   - Scan `excluded` for anything mislabeled — a user-visible change committed as `chore:` is
     the common case, and the pipeline has no way to see it.
   - If the derived bump disagrees with what the diff shows, say so plainly and explain which
     commit is mislabeled. Do not silently override it.

5. **Rewrite the entries for the audience.** Commit subjects are written for reviewers. Release
   notes are read by people who did not see the code. See
   `references/release-notes-template.md` for the before/after table and the pre-publish
   checklist.

6. **Render the final output** in the style the user asked for, and report what you changed
   from the generated draft. If you moved, dropped, or rewrote entries, list them — the user
   needs to know the published notes differ from what the commits say.

## Reference material

Read these when the situation calls for them; they are not needed for a routine release.

| File | Read it when |
| --- | --- |
| `references/commit-conventions.md` | A commit is classified oddly, or you need the exact type → section mapping and the three breaking-change notations |
| `references/versioning-policy.md` | The bump is contested, the project is `0.x`, a prerelease is involved, or you are considering overriding the derived version |
| `references/release-notes-template.md` | Writing the final prose — output shapes, the rewrite table, and the pre-publish checklist |
| `references/troubleshooting.md` | A script errors, the range is empty, or the output is missing commits you expected |

## Constraints

- **Never commit, tag, or push.** Produce files and print the commands; the developer runs them.
  A tag is not reversible once it reaches the remote.
- **Never edit `CHANGELOG.md` below the section you are adding.** Delegate changelog edits to
  the `release-toolkit:changelog-writer` agent, which prepends and preserves history.
- **Report an empty range as empty.** If there are no commits between the base and HEAD, say
  so and stop. Do not produce a plausible-looking set of notes from nothing.
- **Do not invent migration steps.** If a breaking change has no `BREAKING CHANGE:` trailer,
  the migration text is missing. Say it is missing and ask the author, rather than writing a
  migration you inferred from the diff.

## Changing the pipeline

The scripts have a test suite. Run it after any edit:

```bash
python3 "${CLAUDE_SKILL_DIR}/scripts/test_release_notes.py"
```

41 tests, no dependencies, under a second. The end-to-end cases build a throwaway git
repository and skip themselves if `git` is unavailable. When you change classification rules,
update `references/commit-conventions.md` and `references/versioning-policy.md` in the same
change — those files document the behavior the tests pin.
