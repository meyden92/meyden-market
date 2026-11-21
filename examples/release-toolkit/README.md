# Release Toolkit

Release readiness checks, changelog authoring, and generated release notes from conventional
commits.

**Example plugin.** It is not listed in `marketplace.json` and cannot be installed from the
marketplace. It exists as the worked reference for [authoring a plugin](../../docs/authoring-plugins.md),
because it ships every component type — commands, agents, and a skill with references and scripts.
Load it with `--plugin-dir` to try it, or copy it as a starting point for a real plugin.

```bash
claude --plugin-dir examples/release-toolkit
```

## What it provides

### Commands

| Command | Purpose |
| --- | --- |
| `/release-check [base-ref]` | Read-only pre-release gate. Runs the auditor and the dependency analyst in parallel, cross-checks the version, and returns `READY` or `BLOCKED`. |
| `/release-prep [version] [base-ref]` | Drafts the release: generates notes, updates `CHANGELOG.md`, bumps the version file. Commits and tags nothing. |

### Agents

| Agent | Purpose |
| --- | --- |
| `release-toolkit:release-auditor` | Audits a commit range for unreleasable work — WIP commits, debug leftovers, mislabeled breaking changes, migrations without rollback — and derives the semver bump. Read-only. |
| `release-toolkit:changelog-writer` | Writes Keep a Changelog entries for a user-facing audience. Prepends only; never rewrites history. |
| `release-toolkit:dependency-risk-analyst` | Classifies dependency and lockfile changes by blast radius. Verifies impact against real import sites. Read-only. |

### Skill

`release-notes` — a three-stage Python pipeline that turns a commit range into markdown.

```
collect_commits.py  →  classify_changes.py  →  render_notes.py
   git → JSON            JSON → sections,        JSON → markdown
                         bump, churn
```

Bundled with it:

- `references/commit-conventions.md` — the conventional-commit subset the parser implements
- `references/versioning-policy.md` — bump derivation, 0.x and prerelease rules, company rules
- `references/release-notes-template.md` — output shapes and the pre-publish checklist
- `references/troubleshooting.md` — error-by-error diagnosis
- `scripts/test_release_notes.py` — 41 tests, standard library only

## Use it directly

The scripts run standalone, without Claude Code:

```bash
SKILL=examples/release-toolkit/skills/release-notes

python3 $SKILL/scripts/collect_commits.py --repo . --range v1.4.0..HEAD \
  | python3 $SKILL/scripts/classify_changes.py --current-version 1.4.0 \
  | python3 $SKILL/scripts/render_notes.py --style review
```

Styles: `changelog` (prepend to CHANGELOG.md), `announce` (release announcement), `review`
(everything, including what was excluded and why — read this one first).

## Requirements

- `git` on PATH
- Python 3.9+ (standard library only — no install step)

## Development

```bash
cd examples/release-toolkit
python3 skills/release-notes/scripts/test_release_notes.py -v
claude plugin validate . --strict
```
