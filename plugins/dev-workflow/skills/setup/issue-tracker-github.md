# Issue tracker: GitHub

Issues and specs for this repo live as GitHub issues.

**Invoke the `github-flow:github` skill before any tracker operation and follow its rules**: it carries the organisation's issue lifecycle, pull-request conventions, and non-interactive `gh` usage. That skill is required: if it is not available, stop and install the `github-flow` plugin rather than improvising `gh` calls.

GitHub numbers issues and pull requests in one space, so `#42` may be either; `gh issue view` on a PR fails with a hint rather than answering.

## When a skill says "publish to the issue tracker"

Create a GitHub issue.

## When a skill says "fetch the relevant ticket"

Read the issue with its comments through the `github-flow:github` skill (`meyden-gh issue view <number>`).

## Epics

Planned work that breaks into several tickets is an **epic**: one umbrella issue that owns them, titled `[Epic] <what it delivers>`. Create it before the tickets so each can be attached. Work that is not a body of work (a lone bug report, a single improvement) stays standalone unless the user says otherwise.

The epic is an **ordinary issue**, and its tickets are its **native sub-issues**: GitHub parents issue→issue directly. Attach at creation (`gh issue create --parent <epic>`) or after the fact (`gh issue edit <epic> --add-sub-issue <ticket>`). The epic renders its sub-issue list with a progress bar by itself; don't mirror the children into its body, and don't encode membership in titles.

Blocking is a separate relation from membership: a native dependency, written explicitly (`gh issue edit <ticket> --add-blocked-by <blocker>`), and free to cross repositories (`owner/repo#N`). Use both; neither substitutes for the other.

## Wayfinding operations

Used by `/dev-workflow:wayfinder`. The **map** is a single issue with **child** issues as tickets.

- **Map**: a single issue labelled `wayfinder:map`, holding the Notes / Decisions-so-far / Fog body. `gh issue create --label wayfinder:map ...`. Its tickets are its native sub-issues (`gh issue create --parent <map>`).
- **Child ticket**: a sub-issue of the map, labelled `wayfinder:<type>` (`research`/`prototype`/`interview`/`task`). Once claimed, the ticket is assigned to the driving dev.
- **Blocking**: GitHub's **native issue dependency**, the canonical, UI-visible representation: `gh issue edit <child> --add-blocked-by <blocker>`. A ticket is unblocked when every blocker is closed.
- **Frontier query**: the map's open sub-issues without an open blocker or an assignee. Run `gh issue view <map> --json subIssues`, then check each candidate's `blockedBy` (or search with `is:open is:blocked` to exclude); first in map order wins.
- **Claim**: `gh issue edit <n> --add-assignee @me`, the session's first write.
- **Resolve**: `gh issue close <n> --comment "<answer>" --reason completed`, then append a context pointer (gist + link) to the map's Decisions-so-far.
