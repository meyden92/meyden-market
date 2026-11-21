# Commit conventions

The subset of [Conventional Commits 1.0.0](https://www.conventionalcommits.org/) that
`classify_changes.py` implements. If you change this file, change `TYPE_SECTIONS` in
`scripts/classify_changes.py` to match — the parser is the enforcement, this file is the
explanation.

## Subject format

```
<type>(<scope>)!: <description>
```

| Part | Required | Notes |
| --- | --- | --- |
| `type` | Yes | Lowercase word from the table below. Parsed case-insensitively. |
| `scope` | No | The area touched: `cli`, `api`, `auth`, `db`. Rendered as a bold prefix in the notes. |
| `!` | No | Marks a breaking change. Placed after the scope, before the colon. |
| `description` | Yes | Imperative mood, no trailing period. `add retry flag`, not `added a retry flag.` |

## Types and where they land

| Type | Changelog section | In the notes? |
| --- | --- | --- |
| `feat`, `feature` | Added | Yes — forces a **minor** bump |
| `fix`, `bugfix` | Fixed | Yes |
| `perf`, `change` | Changed | Yes |
| `deprecate` | Deprecated | Yes |
| `remove` | Removed | Yes |
| `security` | Security | Yes |
| `revert` | Changed | Yes, unless it pairs with a commit in the same range |
| `docs`, `refactor`, `test`, `tests`, `chore`, `ci`, `build`, `style` | — | No — recorded in `excluded` with a reason |

An unrecognized type is not dropped. It is placed in **Changed** and listed under
`unconventional` so a human decides where it belongs. Silent loss is the failure mode this
avoids.

## Breaking changes

A commit is breaking when **any** of these hold:

1. The subject has `!` before the colon: `feat(api)!: drop v1 endpoints`
2. The body has a `BREAKING CHANGE:` trailer in the trailing block
3. The body has a line starting with `BREAKING CHANGE:` or `BREAKING-CHANGE:` anywhere

Form 2 is preferred, because the text after the colon becomes the migration note rendered
in the release notes:

```
feat(api)!: drop v1 endpoints

The v1 handlers were deprecated in 1.2.0 and have no remaining callers in
the monorepo.

BREAKING CHANGE: Callers must move to /v2 — the request body is unchanged,
the response wraps results in a `data` envelope.
Refs: #481
```

A `!` with no trailer produces a `**BREAKING:**` entry with no migration text, which is worse
for the reader. Use the trailer.

## Trailers

Trailers are `Key: value` lines in the **trailing block** of the message — the last run of
non-empty lines. This is why a prose line like `Note: this was tricky` in the middle of a body
is not parsed as a trailer, while the same line at the end is.

Recognized by the pipeline:

| Trailer | Effect |
| --- | --- |
| `BREAKING CHANGE:` / `BREAKING-CHANGE:` | Marks the commit breaking, supplies the migration note |
| `Refs:` / `Closes:` | Preserved in the JSON for the changelog writer to link |

Any other trailer is captured in the JSON and ignored by the renderer.

## Reverts

`git revert` writes `Revert "<original subject>"`. When both the revert and its target are in
the same range, the pipeline drops both — the net change to the release is zero, so neither
belongs in the notes. Both appear under `churn` in review output.

A revert whose target is in an *earlier* release is a real change to this release and stays in
the notes as a `Changed` entry.

## What this does not do

- It does not read the diff. A commit labeled `fix:` that removes a public function is classed
  as a fix. Catching that mislabeling is the `release-auditor` agent's job, not the parser's.
- It does not merge duplicate entries. Three `fix: typo` commits produce three lines.
- It does not translate a developer-facing subject into user-facing prose. That is the model's
  job after the pipeline runs.
