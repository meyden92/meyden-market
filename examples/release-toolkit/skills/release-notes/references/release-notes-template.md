# Release notes templates

The shapes `render_notes.py` emits, and the editing pass to apply before publishing. The script
produces a correct draft; it cannot produce a good one, because it has never read the diff.

## `--style changelog`

Prepend to `CHANGELOG.md`, directly under `## [Unreleased]`.

```markdown
## [2.0.0] - 2025-03-14

### Breaking changes

- **api:** **BREAKING:** Drop v1 endpoints — callers must move to /v2 (a1b2c3d)

### Added

- **cli:** Add --retry flag (e4f5g6h)

### Fixed

- Crash on BOM in config (i7j8k9l)
```

Section order is fixed: Breaking changes, Added, Changed, Deprecated, Removed, Fixed, Security.
Empty sections are omitted. A release with no user-facing changes renders
`_No user-facing changes in this release._` rather than an empty heading — if you see that on a
release you expected to be substantial, the commits were mistyped.

## `--style announce`

For the release channel, the internal mailing list, or a GitHub release description.

```markdown
# Release 2.0.0

_2025-03-14_

This release contains 1 new feature, 1 fix, 1 breaking change.

## Before you upgrade

- **api:** **BREAKING:** Drop v1 endpoints — callers must move to /v2

> Replace this section with migration steps before publishing.

## Added

- **cli:** Add --retry flag
...
```

The blockquote is a deliberate tripwire. Shipping it means nobody wrote the migration steps.

## `--style review`

The changelog output plus everything the pipeline set aside. Read this before publishing
anything — it is where mistakes are visible.

```markdown
<!-- REVIEW SECTION — delete before publishing -->

Bump: **major** (a1b2c3d feat(api)!: drop v1 endpoints)
Range: `v1.4.0..HEAD`
Commits: 12 total, 4 included, 6 excluded, 2 churn, 0 unconventional

### Excluded (not user-facing)
- `m1n2o3p` bump dev deps — 'chore' is not user-facing

### Churn (reverted within range)
- `q4r5s6t` add widget — reverted within this range

### Unconventional subjects — verify placement
- `u7v8w9x` made it faster
```

## The editing pass

Generated entries are commit subjects. Commit subjects are written for reviewers. Rewrite them
for the person who will read the release notes.

| Generated | Published | Why |
| --- | --- | --- |
| `Fix null deref in SyncManager.flush` | `Fix crash when syncing an empty queue` | Users hit symptoms, not stack frames |
| `Add --retry flag` | `Add --retry to reattempt failed uploads (default: 3)` | The flag name alone does not say what it does |
| `Bump timeout to 30s` | `Increase the default request timeout to 30s` | Say what changed for them |
| `Update transport layer` | *(delete)* | Invisible to users; it belongs in the excluded list |

Checklist before publishing:

- [ ] Every `**BREAKING:**` entry names the replacement, not just the removal
- [ ] Nothing in the `unconventional` list ended up in the wrong section
- [ ] Nothing in the `excluded` list should actually have been included
- [ ] No internal-only names, ticket IDs, or personal names in user-facing entries
- [ ] The version matches the manifest and the tag you are about to push
- [ ] The `REVIEW SECTION` comment and the `> Replace this section` blockquote are gone

## Customizing the output

The renderers are three plain functions in `scripts/render_notes.py` —
`render_changelog`, `render_announce`, `render_review`. To add a house style, add a fourth and
list it in the `--style` choices. Do not fork the script per repository; the whole point of
shipping it in a plugin is that every team renders the same shapes.
