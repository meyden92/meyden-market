# Troubleshooting the pipeline

## `error: <path> is not a git repository`

`collect_commits.py` runs `git -C <repo> rev-parse --git-dir` before anything else. Pass
`--repo` pointing at the repository you want to read — the skill's own directory is in the
plugin cache, not in the target project.

```bash
python3 "${CLAUDE_SKILL_DIR}/scripts/collect_commits.py" --repo /path/to/project --range v1.0.0..HEAD
```

## `warning: no commits in range`

The range is empty. Usual causes, in order of likelihood:

1. **The base tag is newer than you think.** `git describe --tags --abbrev=0` returns the most
   recent *reachable* tag, which on a feature branch may be a tag you already released from.
   Check with `git describe --tags --abbrev=0` and pass `--range` explicitly.
2. **A shallow clone.** CI often clones with `--depth 1`, so the base tag is not present.
   Set `fetch-depth: 0` in GitHub Actions, or fetch with `git fetch --unshallow --tags`.
3. **Tags were never fetched.** `git fetch --tags`.

## `error: git log ... failed: unknown revision`

The base ref does not exist locally. Fetch tags, or check for a typo — `v1.4` and `v1.4.0` are
different refs.

## A commit is missing from the notes

Check the `--style review` output before assuming a bug. The commit is in one of three lists:

- **`excluded`** — its type is not user-facing (`chore`, `refactor`, `docs`, `test`, `ci`,
  `build`, `style`). If it should have been included, the commit was mislabeled. Note it in
  the notes manually; do not change the type mapping for one commit.
- **`churn`** — it was reverted later in the same range. Correct behavior; the net change is
  zero.
- **`unconventional`** — the subject does not match `type: description`, so it was placed in
  **Changed** for you to relocate.

If it is in none of them, it is outside the range. Re-check the base ref.

## The bump is wrong

`bump_reason` names the single commit that forced it. Read that commit's diff.

- **Unexpected `major`** — a commit carries a `!` or a `BREAKING CHANGE:` trailer. If the
  change is not actually breaking, the commit is mislabeled: say so and override with
  `--version`.
- **Unexpected `minor`** — a `feat:` commit exists in the range. Feature work behind a disabled
  flag is still typed `feat:` but is not observable; that is a legitimate override.
- **`patch` when you expected more** — the feature was committed as `chore:` or `refactor:`.
  Check the `excluded` list.

For 0.x and prerelease behavior, see `versioning-policy.md`.

## `warning: not a semantic version`

`--current-version` was not `MAJOR.MINOR.PATCH` (optionally `v`-prefixed, optionally with a
`-prerelease` or `+build` suffix). Calendar versions like `2025.03` and two-part versions like
`1.4` are not supported. Classification still succeeds; `next_version` is `null`, so pass
`--version` to `render_notes.py`.

## `error: no version to render`

Stage 3 had neither `--version` nor a `next_version` from stage 2. Either pass
`--current-version` to stage 2 or `--version` to stage 3.

## `error: input has no 'commits' key`

Stage 2 received something other than stage 1's output — usually because stage 1 exited
nonzero and its error text was piped in. Run the stages separately and read stage 1's stderr.

## Breaking change has no migration note

Expected when the commit used `!` without a `BREAKING CHANGE:` trailer. The trailer text *is*
the migration note; there is nothing else to render. Ask the commit author for the migration
steps rather than inferring them from the diff.

## The trailer was ignored

Trailers are parsed from the **trailing block** — the last run of non-empty lines. A
`BREAKING CHANGE:` line followed by another prose paragraph is not a trailer.

`is_breaking()` has a fallback that scans the whole body for a line starting with
`BREAKING CHANGE:`, so the commit is still marked breaking; only `Refs:`-style trailers are
genuinely lost. Move them to the end of the message.

## Tests fail after an edit

```bash
python3 "${CLAUDE_SKILL_DIR}/scripts/test_release_notes.py" -v
```

The end-to-end class skips itself when `git` is not on PATH, so a suite reporting skips in a
minimal container is expected, not a failure. If the classification tests fail, you changed
behavior the references document — update `commit-conventions.md` and `versioning-policy.md`
in the same change.
