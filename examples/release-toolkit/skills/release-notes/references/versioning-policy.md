# Versioning policy

How `classify_changes.py` derives a version bump, and the company rules behind it. The
implementation is `bump_version()` and the bump logic in `classify()`; keep them in sync with
this file.

## Bump derivation

The bump is the **highest** level any single commit in the range demands:

| Trigger | Bump |
| --- | --- |
| Any breaking change (see `commit-conventions.md`) | `major` |
| Any `feat:` / `feature:` commit | `minor` |
| Everything else, including a range with only excluded commits | `patch` |

The commit that forced the bump is reported as `bump_reason`. When a release is contested, that
field is the thing to argue about — not the number.

## Applying the bump

| Current | Bump | Next | Why |
| --- | --- | --- | --- |
| `1.4.2` | patch | `1.4.3` | |
| `1.4.2` | minor | `1.5.0` | patch resets |
| `1.4.2` | major | `2.0.0` | minor and patch reset |
| `v1.4.2` | minor | `v1.5.0` | a leading `v` is preserved |
| `0.3.1` | major | `0.4.0` | **see 0.x below** |
| `0.3.1` | minor | `0.4.0` | |
| `2.0.0-rc.1` | any | `2.0.0` | **see prereleases below** |

### 0.x is unstable

Under semver, a `0.x` version makes no compatibility promise. A breaking change bumps the
**minor**, not the major. `0.3.1` never becomes `1.0.0` automatically — going to 1.0.0 is a
deliberate statement that the API is now stable, so it is always a manual `--version 1.0.0`.

### Prereleases

Promoting a prerelease consumes the bump: `2.0.0-rc.1` becomes `2.0.0` regardless of what
changed since the rc, because the target version was already decided when the rc was cut.

The pipeline does not generate prerelease versions. Cut an rc by passing it explicitly:

```bash
python3 scripts/render_notes.py --version 2.0.0-rc.1 < classified.json
```

## Company rules on top of semver

1. **Never reuse or move a published tag.** A tag that reached the GitHub registry is
   immutable. A bad release is superseded by a new patch version, not overwritten.

2. **A security fix ships as its own patch release.** Do not bundle a `security:` commit into a
   feature release — downstream teams need to be able to take the fix without taking the
   features. If the range contains both, cut the patch from the release branch first.

3. **A major release needs a migration note per breaking change.** `render_notes.py` emits
   `**BREAKING:**` entries with the trailer text; an entry with no migration text is an
   incomplete release, and the reviewer should send it back.

4. **The tag and the manifest version must agree**, including the `v` prefix convention the
   repository already uses. Do not switch conventions mid-project.

5. **Plugins in this marketplace bump on every functional change.** A plugin whose files
   changed without a `version` bump in `plugin.json` will not reach developers who already
   installed it — CI enforces this in `ci/check-version-bump.sh`.

## Overriding the derived version

The derivation is a default, not a decision. Override it when:

- The commits understate the change — a `fix:` that alters behavior enough that integrators
  must retest is a minor, not a patch.
- Marketing or coordination fixes the number in advance.
- A batch of `feat:` commits are all behind a disabled feature flag, so nothing is observable
  yet. That is a patch.

Pass `--version` to `render_notes.py` and say in the release notes why the derived bump was
overridden.
