# `gh api`: the escape hatch

`gh api <endpoint>` makes an authenticated REST call against the GitHub API using the same credentials as the CLI. Use it whenever `gh` has no subcommand for what you need.

## Mechanics

```bash
gh api repos/{owner}/{repo}/pulls/123/reviews
gh api repos/{owner}/{repo}/issues --paginate --slurp | jq 'map(length) | add'
gh api -X PATCH repos/{owner}/{repo}/issues/42 -f title="New title"
```

- **Endpoint** is the path after `api.github.com/`, with no leading slash and no host.
- **`--jq` is built in**, so no piping is needed for simple projections (a full `jq` is still fine for anything complex).
- **Placeholders** `{owner}`, `{repo}`, `{branch}` expand from the current directory's git remote. They only work inside a git directory; from elsewhere spell the path out (`repos/acme/widget/...`).
- `--paginate` walks every page; add `--slurp` to wrap the pages into one JSON array (the result is an array *of pages*, so flatten it). `-i/--include` adds response headers; `--silent` suppresses the body.
- **`-f/--raw-field key=value` sends a string; `-F/--field key=value` infers the type** (`true`, `42`, `null`, `@file` reads from a file). This is the **inverse of glab**: use `-f` for anything human-written, `-F` for booleans, numbers and ids. **Either flag switches the default method to POST**, so pass `-X GET` explicitly if you only meant to add query parameters.
- Arrays are expressed with bracket syntax: `-F 'labels[]=Bug' -F 'labels[]=Prio: High'`; an empty array is a bare `-F 'labels[]'`. Nested objects: `-F 'obj[key]=v'`. For a deep body, `--input <file|->` sends real JSON.
- Quote any endpoint containing `?` or `&` so the shell doesn't mangle it.
- `-X POST|PATCH|PUT|DELETE` is a write, so confirm with the user before running it, same as any other write.
- GraphQL: `gh api graphql -f query=@file.graphql -F number=42`, with variables via the field flags. A rejected mutation answers HTTP 200 with the reason in the payload's `errors` array, so check both channels.

## `id` vs `number`

The classic endpoints and all `gh` subcommands take the per-repo issue **number**. The sub-issue and dependency endpoints take the global database **id**. Resolve it first:

```bash
gh api repos/{owner}/{repo}/issues/42 --jq .id
```

Passing a number where an id belongs fails with a 404/422 that reads like a missing issue.

## Sub-issues (native hierarchy)

`gh issue edit --add-sub-issue/--parent` and `gh issue create --parent` cover the common cases; `meyden-gh issue sub` adds verification. The raw endpoints:

```bash
gh api repos/{owner}/{repo}/issues/42/sub_issues                  # children
gh api repos/{owner}/{repo}/issues/57/parent                      # 404 when none
gh api -X POST repos/{owner}/{repo}/issues/42/sub_issues -F sub_issue_id=<id>
gh api -X DELETE repos/{owner}/{repo}/issues/42/sub_issue -F sub_issue_id=<id>   # note: singular path
gh api -X PATCH repos/{owner}/{repo}/issues/42/sub_issues/priority -F sub_issue_id=<id> -F after_id=<id>
```

One parent per issue; up to 100 sub-issues per parent, nesting to 8 levels; the sub-issue must belong to the same repository owner. `POST` with `-F replace_parent=true` re-parents in one call. Issue objects carry a `sub_issues_summary` (`total`/`completed`) for roll-ups.

## Dependencies (blocked by / blocking)

`gh issue edit --add-blocked-by` covers the common case. The raw endpoints:

```bash
gh api repos/{owner}/{repo}/issues/42/dependencies/blocked_by                  # what blocks 42
gh api repos/{owner}/{repo}/issues/42/dependencies/blocking                    # what 42 blocks
gh api -X POST repos/{owner}/{repo}/issues/42/dependencies/blocked_by -F issue_id=<id>
gh api -X DELETE repos/{owner}/{repo}/issues/42/dependencies/blocked_by/<id>
```

Only `blocked_by` has write endpoints; a "blocks" edge is written from the other issue's side. Up to 50 issues per relationship type. Search understands `is:blocked`, `blocked-by:<n>`, `blocking:<n>`.

## Recipes worth knowing

**Who reviewed and how.** `gh pr view` shows the roll-up, not the history:

```bash
gh api repos/{owner}/{repo}/pulls/123/reviews --jq '.[] | {user: .user.login, state}'
```

**Line-anchored review comments** (read before writing, so you don't repeat a point):

```bash
gh api repos/{owner}/{repo}/pulls/123/comments --jq '.[] | {path, line, user: .user.login, body}'
gh api -X POST repos/{owner}/{repo}/pulls/123/comments \
  -f body="This ignores the error return." \
  -f commit_id="$(gh pr view 123 --json headRefOid --jq .headRefOid)" \
  -f path=src/api.go -F line=42 -f side=RIGHT
```

**Jobs of a run, and one job's log** (what `meyden-gh ci` uses):

```bash
gh api repos/{owner}/{repo}/actions/runs/<run-id>/jobs --jq '.jobs[] | {id, name, conclusion}'
gh api repos/{owner}/{repo}/actions/jobs/<job-id>/logs      # plain text via a 302 gh follows
```

**Branch protection / rulesets**, to explain why a push or merge was rejected:

```bash
gh api repos/{owner}/{repo}/branches/main/protection --jq '{required_status_checks, required_pull_request_reviews}'
gh api repos/{owner}/{repo}/rules/branches/main             # rulesets, the newer mechanism
```

A 404 on `/protection` means no classic protection is configured (rulesets may still apply), or the token lacks admin read.

**Collaborators and their roles:**

```bash
gh api repos/{owner}/{repo}/collaborators --jq '.[] | "\(.login) \(.role_name)"'
```

**Commits and their check status:**

```bash
gh api "repos/{owner}/{repo}/commits?sha=main&per_page=5" --jq '.[] | "\(.sha[0:8]) \(.commit.message | split("\n")[0])"'
gh api repos/{owner}/{repo}/commits/<sha>/check-runs --jq '.check_runs[] | "\(.name) \(.conclusion)"'
```

**Read a file at a ref without cloning:**

```bash
gh api repos/{owner}/{repo}/contents/package.json?ref=main --jq .content | base64 -d
gh api -H "Accept: application/vnd.github.raw" repos/{owner}/{repo}/contents/src/main.go?ref=main
```

**Compare two refs**, the merge-base check behind `meyden-gh pr delete-branch`:

```bash
gh api "repos/{owner}/{repo}/compare/main...feature-x" --jq '{status, ahead_by, behind_by}'
# status "identical" or "behind" ⇒ the branch is fully contained in main
```

## Writes (confirm before running)

```bash
# Retarget a PR
gh api -X PATCH repos/{owner}/{repo}/pulls/123 -f base=develop

# Comment on a commit
gh api -X POST repos/{owner}/{repo}/commits/<sha>/comments -f body="..."

# Close an issue
gh api -X PATCH repos/{owner}/{repo}/issues/42 -f state=closed -f state_reason=completed
```

Prefer the dedicated `gh` subcommand when one exists: it validates input and prints a usable URL back. Reach for `gh api` for the gaps.
