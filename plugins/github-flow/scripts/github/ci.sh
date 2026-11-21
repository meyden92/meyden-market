#!/usr/bin/env bash
# meyden-gh ci: show the failed jobs of a GitHub Actions run and dump their logs.
#
# Resolves the workflow runs for a commit (current branch by default; one
# commit can have several runs, one per workflow), lists the jobs in the given
# state, and prints the tail of each job's log with ANSI codes, group markers
# and log timestamps stripped so the actual error is readable.
#
# Requires: gh (authenticated), jq.

set -euo pipefail

REPO=""
BRANCH=""
PR=""
RUN=""
LINES=120
STATUS="failed"

usage() {
  cat <<'EOF'
Usage: meyden-gh ci [options]

  -R, --repo <path>      Repository (OWNER/REPO). Default: current directory's repo.
  -b, --branch <name>    Runs for this branch's newest commit. Default: current branch.
      --pr <number>      Runs for this pull request's head commit instead of a branch.
  -r, --run <id>         Use this exact run ID.
  -n, --lines <n>        Log tail length per job (default: 120; 0 = full log).
  -s, --status <state>   Job state to report (default: failed). e.g. success, cancelled, skipped.
  -h, --help             Show this help.

Examples:
  meyden-gh ci
  meyden-gh ci --pr 123
  meyden-gh ci --run 9182736450 --lines 300
  meyden-gh ci --repo owner/repo --branch main
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    -R|--repo)   REPO="${2:?--repo needs a value}"; shift 2 ;;
    -b|--branch) BRANCH="${2:?--branch needs a value}"; shift 2 ;;
    --pr)        PR="${2:?--pr needs a value}"; shift 2 ;;
    -r|--run)    RUN="${2:?--run needs a value}"; shift 2 ;;
    -n|--lines)  LINES="${2:?--lines needs a value}"; shift 2 ;;
    -s|--status) STATUS="${2:?--status needs a value}"; shift 2 ;;
    -h|--help)   usage; exit 0 ;;
    *) echo "unknown option: $1" >&2; usage >&2; exit 2 ;;
  esac
done

command -v gh >/dev/null || { echo "gh is not installed" >&2; exit 127; }
command -v jq >/dev/null || { echo "jq is not installed" >&2; exit 127; }

# The CLI's job-state vocabulary: "failed" reads naturally but the API says
# "failure"; both are accepted here.
case "$STATUS" in
  failed) STATUS="failure" ;;
  canceled) STATUS="cancelled" ;;
  succeeded|success) STATUS="success" ;;
esac

repo_args=()
[[ -n "$REPO" ]] && repo_args=(-R "$REPO")

RUN_FIELDS='databaseId,displayTitle,status,conclusion,workflowName,headBranch,headSha,url'

# --- resolve the runs: one commit, possibly several workflows ---
if [[ -n "$RUN" ]]; then
  runs_json=$(gh run view "$RUN" "${repo_args[@]}" --json "$RUN_FIELDS" | jq -c '[.]')
else
  if [[ -n "$PR" ]]; then
    sha=$(gh pr view "$PR" "${repo_args[@]}" --json headRefOid --jq .headRefOid)
    list_args=(--commit "$sha")
    where="PR #$PR (head $sha)"
  else
    if [[ -z "$BRANCH" ]]; then
      BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || true)
      [[ -z "$BRANCH" || "$BRANCH" == "HEAD" ]] && { echo "not on a branch, pass --branch, --pr or --run" >&2; exit 2; }
    fi
    list_args=(--branch "$BRANCH")
    where="branch $BRANCH"
  fi
  all_runs=$(gh run list "${repo_args[@]}" "${list_args[@]}" --limit 20 --json "$RUN_FIELDS")
  if [[ "$(jq 'length' <<<"$all_runs")" -eq 0 ]]; then
    echo "No workflow runs found for $where."
    echo "Either no workflow triggers on it, or Actions is disabled for this repository."
    exit 0
  fi
  # One commit is the subject. Branch mode keeps only the newest commit's
  # runs; mixing older commits' failures in answers a different question.
  newest_sha=$(jq -r '.[0].headSha' <<<"$all_runs")
  runs_json=$(jq -c --arg sha "$newest_sha" '[.[] | select(.headSha == $sha)]' <<<"$all_runs")
fi

echo "$(jq 'length' <<<"$runs_json") run(s) for commit $(jq -r '.[0].headSha' <<<"$runs_json" | cut -c1-8):"
jq -r '.[] | "  - \(.workflowName): \(.conclusion // .status)  (run \(.databaseId))\n    \(.url)"' <<<"$runs_json"
echo

esc=$(printf '\033')
clean_log() {
  # `gh run view --job --log` prefixes every line with "<job>\t<step>\t" and a
  # timestamp; Actions logs also carry ANSI codes and ##[group] markers.
  sed -E -e 's/^[^\t]*\t[^\t]*\t//' \
         -e "s/${esc}\[[0-9;]*[a-zA-Z]//g" \
         -e 's/^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9:.]+Z ?//' \
         -e 's/^##\[(group|endgroup|section)\]//' \
    | cat -s
}

startup_failures=$(jq -r '[.[] | select(.conclusion == "startup_failure")] | length' <<<"$runs_json")
if [[ "$startup_failures" -gt 0 ]]; then
  echo "‼️  $startup_failures run(s) ended in startup_failure: the workflow file itself"
  echo "   failed to parse, so no job ever ran. GitHub has no server-side lint API;"
  if command -v actionlint >/dev/null; then
    echo "   running actionlint on .github/workflows:"
    actionlint 2>&1 | sed 's/^/  /' || true
  else
    echo "   read the run page above for the parse error, or install actionlint"
    echo "   (https://github.com/rhysd/actionlint) to lint locally."
  fi
  echo
fi

# --- collect matching jobs across the runs ---
matched=()
while IFS= read -r line; do
  [[ -n "$line" ]] && matched+=("$line")
done < <(
  for run_id in $(jq -r '.[] | select(.conclusion != "startup_failure") | .databaseId' <<<"$runs_json"); do
    gh run view "$run_id" "${repo_args[@]}" --json jobs \
      --jq ".jobs[] | select(.conclusion == \"$STATUS\") | [(.databaseId|tostring), .name, .url] | @tsv"
  done
)

if [[ ${#matched[@]} -eq 0 ]]; then
  echo "No jobs with status '$STATUS' in these runs. All jobs:"
  for run_id in $(jq -r '.[] | select(.conclusion != "startup_failure") | .databaseId' <<<"$runs_json"); do
    gh run view "$run_id" "${repo_args[@]}" --json jobs \
      --jq '.jobs[] | "  - \(.name): \(.conclusion // .status)"' 2>/dev/null || true
  done
  exit 0
fi

echo "${#matched[@]} job(s) with status '$STATUS':"
for row in "${matched[@]}"; do
  IFS=$'\t' read -r id name _url <<<"$row"
  printf '  - %s (job %s)\n' "$name" "$id"
done

for row in "${matched[@]}"; do
  IFS=$'\t' read -r id name url <<<"$row"
  printf '\n%s\n=== %s: job %s\n' "$(printf '=%.0s' {1..72})" "$name" "$id"
  [[ -n "$url" ]] && printf '%s\n' "$url"
  printf '%s\n' "$(printf -- '-%.0s' {1..72})"

  # Logs exist only once the run is complete; an in-progress job errors here.
  if ! raw=$(gh run view "${repo_args[@]}" --job "$id" --log 2>&1); then
    echo "(could not fetch log: $raw)"
    continue
  fi
  if [[ -z "${raw//[[:space:]]/}" ]]; then
    echo "(log is empty; the job may not have started)"
    continue
  fi

  if [[ "$LINES" -gt 0 ]]; then
    printf '%s\n' "$raw" | clean_log | tail -n "$LINES"
  else
    printf '%s\n' "$raw" | clean_log
  fi
done
