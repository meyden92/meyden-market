# Changelog

All notable changes to the Release Toolkit plugin are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this plugin
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - 2026-08-05

### Added

- `/release-check` command — read-only pre-release gate combining the auditor and the
  dependency analyst
- `/release-prep` command — drafts release notes, changelog entry, and version bump
- `release-auditor` agent — audits a commit range for unreleasable work and derives the bump
- `changelog-writer` agent — maintains `CHANGELOG.md` in Keep a Changelog format
- `dependency-risk-analyst` agent — classifies dependency changes by blast radius
- `release-notes` skill — three-stage Python pipeline (collect → classify → render) with
  reference documentation and a 41-case test suite
