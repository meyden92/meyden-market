# `gh` command reference

Flags below were verified against gh 2.97.0. When in doubt, `gh <cmd> <sub> --help` is authoritative.

Universal flags on nearly every command: `-R/--repo <owner/repo>`, `-h/--help`. Every read command takes `--json <fields>` plus a built-in `--jq <expr>` and `--template`; a bare `--json` errors with the list of available fields, which doubles as discovery. List commands take `-L/--limit` (default 30, so raise it or results silently truncate).

Environment worth setting when scripting: `GH_PROMPT_DISABLED=1` (fail fast instead of prompting), `GH_PAGER=cat`, `NO_COLOR=1`.

## Pull requests (`gh pr`)

| Subcommand | Notes |
| :-- | :-- |
| `list` | `-s/--state open\|closed\|merged\|all`, `-a` assignee, `-A` author, `-l` label, `-B` base branch, `-H` head branch, `-d/--draft`, `-S/--search <query>` (full search syntax), `--json` |
| `view <n\|branch\|url>` | `-c/--comments` for the discussion. JSON fields worth knowing: `mergeable`, `mergeStateStatus`, `headRefOid`, `reviewDecision`, `statusCheckRollup`, `autoMergeRequest`. |
| `diff <n>` | Plain patch on stdout. `--name-only` for the file list, `--patch` explicit. No `--json`. |
| `checks <n>` | CI roll-up per check. `--watch` blocks, so avoid it. `--json` supported. |
| `create` | `-t` title, `-b` body / `-F` body-file, `-B` base, `-H` head (default: current branch, must be pushed), `-d/--draft`, `-a` assignee, `-r` reviewer, `-l` label, `-m` milestone, `--dry-run`. **Prompts when `-t`/`-b` missing; opens an editor on `-e`.** No `--json`; it prints the URL on stdout. |
| `edit <n>` | `-t`, `-b`/`-F`, `--add-label`/`--remove-label` (comma-separated, one atomic call), `--add-assignee`/`--remove-assignee`, `--add-reviewer`, `-B` retargets the base branch. |
| `merge <n>` | `-m/--merge`, `-s/--squash`, `-r/--rebase` (one is required non-interactively, else it prompts), `--auto` (server-side auto-merge; requires the repo setting), `--delete-branch` (local **and** remote), `--match-head-commit <full-sha>` (refuse to merge anything but that revision), `--subject`/`--body` for the merge commit (closing keywords act here too), `--admin`. Makes **one** attempt, with no mergeability polling. |
| `review <n>` | `--approve`, `--request-changes`, `--comment`, with `-b`/`-F`. Approving changes merge eligibility, so confirm first. |
| `comment <n>` | `-b`/`-F`, `--edit-last`, `--create-if-none`, `--delete-last`. Top-level comment; line-anchored review comments go through `gh api` (see api.md). |
| `close` / `reopen <n>` | `close` takes `-c/--comment` and `-d/--delete-branch`. |
| `checkout <n>` | Checks out the PR branch locally. |
| `ready <n>` | Marks a draft ready (`--undo` reverses). |
| `status` | Your PRs: created, assigned, review-requested. |

## Issues (`gh issue`)

| Subcommand | Notes |
| :-- | :-- |
| `list` | `-s/--state`, `-a` assignee (`@me` works), `-A` author, `-l` label, `-m` milestone, `-S/--search <query>`, `--json`. **Default `--limit 30` truncates silently**, so use `meyden-gh overview` for a full backlog. JSON fields include `parent`, `subIssues`, `subIssuesSummary`, `blockedBy`, `blocking`, `issueType`. |
| `view <n\|url>` | `-c/--comments`. Fails with a hint when `<n>` is a PR, since issues and PRs share one number space. |
| `create` | `-t` title, `-b` body / `-F` body-file, `-a` assignee, `-l` label, `-m` milestone, `--type <name>` (org issue types), `--parent <n\|url>` (create directly as a sub-issue), `--blocked-by <n,n>` / `--blocking <n>`. **Prompts when `-t`/`-b` missing.** No `--json`; prints the URL. |
| `edit <n...>` | `-t`, `-b`/`-F`, `--add-label`/`--remove-label` (comma-separated, add+remove in **one atomic call**), `--add-assignee`/`--remove-assignee` (`@me`), `--milestone`, `--parent <n>` / `--remove-parent`, `--add-sub-issue <n,n>` / `--remove-sub-issue`, `--add-blocked-by <n>` / `--remove-blocked-by`, `--add-blocking` / `--remove-blocking`, `--type`. Accepts several issue numbers at once. No `--json`; read back with `view`. |
| `comment <n>` | `-b`/`-F` (body-file exists here, unlike glab), `--edit-last`, `--create-if-none`, `--delete-last`. **Prompts when the body is missing.** |
| `close <n>` | `-c/--comment "..."` posts a comment in the same call, `-r/--reason completed\|"not planned"\|duplicate`. |
| `reopen` / `delete <n>` | `delete` is irreversible and asks for confirmation; type mismatch (`--yes`) skips it, so confirm with the user instead. |
| `develop <n>` | Creates a branch linked to the issue: `--name epic/42-slug`, `--base develop`, `--checkout`. The link renders on the issue. |
| `pin` / `unpin` / `transfer` / `lock` | Housekeeping; `transfer` moves an issue to another repo. |

## CI / Actions (`gh run`, `gh workflow`)

| Subcommand | Notes |
| :-- | :-- |
| `run list` | `-b/--branch`, `-c/--commit <sha>`, `-w/--workflow`, `-e/--event`, `-s/--status` (`queued\|in_progress\|completed\|success\|failure\|cancelled\|startup_failure\|…`), `-u/--user`, `--json` (fields: `databaseId`, `conclusion`, `status`, `workflowName`, `headSha`, `url`, …). One commit can have **several runs**, one per triggered workflow. |
| `run view [run-id]` | `--json jobs` lists jobs with `databaseId`, `conclusion`, `steps`. `--log` full log, `--log-failed` failed steps only, `--job <job-databaseId>` scopes to one job (**databaseId, not name**). Logs are only available once the run completed. `--verbose`, `--attempt <n>`. |
| `run watch` | Blocks until the run finishes, so use it only when the user asked to wait, bounded by `timeout`. |
| `run rerun <id>` | `--failed` reruns failed jobs only, `--job <id>` one job. A rerun of a deploy workflow is a deploy, so confirm. |
| `run cancel <id>` | Cancels an in-progress run. |
| `run download <id>` | Artifacts: `-n <name>`, `-D <dir>`. |
| `workflow list/view/run/enable/disable` | `workflow run <file>` dispatches (needs `workflow_dispatch`; `-f key=value` for inputs), which is a write, so confirm. There is **no server-side lint**; a broken workflow file surfaces as a run with conclusion `startup_failure`. Use `actionlint` locally. |

Job/run state vocabulary: `status` is `queued`/`in_progress`/`completed`; `conclusion` (only when completed) is `success`/`failure`/`cancelled`/`skipped`/`startup_failure`/`action_required`/`timed_out`/`neutral`. Filter on `conclusion` for finished work. GitHub has no `allow_failure`; a non-blocking check is one not marked required in branch protection.

## Repos, releases, labels, secrets

| Command | Notes |
| :-- | :-- |
| `repo view [repo]` | `--json` fields include `defaultBranchRef`, `deleteBranchOnMerge` (epic-branch hazard), `visibility`. `repo list`, `repo clone`, `repo fork`. |
| `repo create` / `delete` / `rename` / `archive` / `edit` | Server-side changes; confirm first. `repo edit --delete-branch-on-merge` flips the auto-delete setting. |
| `release list` / `view <tag>` | `--json` on both. |
| `release create <tag> [files...]` | `-t` title, `-n/--notes`, `-F/--notes-file`, `--generate-notes`, `--draft`, `--prerelease`, `--target <ref>`, `--latest`. |
| `release upload <tag> <files...>` / `download` / `delete` | Asset management. `delete` is irreversible. |
| `label list` | `--json name,color,description`, `--search`, **`--limit` default 30**, so pass `--limit 200` before claiming a project's taxonomy. |
| `label create <name>` | `-c/--color <hex>`, `-d/--description`, `--force` updates an existing one. `label edit`, `label delete`, `label clone <source-repo>`. |
| `secret set <name>` / `variable set <name>` | `-b/--body`, `--env`, `-o/--org`. Production-affecting writes, so confirm, and never echo secret values back into the transcript. `secret list`/`variable list` show names only. |
| `search issues/prs/code/commits/repos` | Full search syntax including `is:blocked`, `is:blocking`, `blocked-by:<n>`, `blocking:<n>`. `--json`, `--limit` (max 1000 results overall). |
| `auth status` | Accounts, scopes, active host. Exits 1 when any host has an auth problem. `gh auth refresh -s <scope>` adds a missing scope. |
| `api <endpoint>` | See [api.md](api.md). |

## Traps to watch

- **`-f` vs `-F` on `gh api`**: `-f` raw string, `-F` typed, the inverse of glab. Everywhere else `-F` means `--body-file`.
- **No `--json` on writes**: `create`, `edit`, `merge`, `close`, `label create` print human text or a URL; read state back with the corresponding `view`.
- **`--limit` defaults to 30** on every list command and truncates without saying so.
- **Prompts, not errors**, are the default failure mode for missing input at a TTY-less session: always pass title/body/strategy flags explicitly.
