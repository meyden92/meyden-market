#!/bin/sh
# Compares vendored files with their upstream repositories.
#   vendor-upstream.sh [--report FILE]   clone each repo in VENDORED.md at HEAD, diff every vendored file's
#                                        upstream path between the recorded commit and HEAD, write FILE
#                                        (default ./vendor-upstream-report.md)
#   vendor-upstream.sh --check           offline; exit 1 when an upstream header's commit differs from
#                                        VENDORED.md, or a header and a table row do not match
# A vendored file starts with a comment: upstream: <owner/repo> <path> [(section)] @ <40-hex commit> (<licence>)
set -eu
root=$(cd "$(dirname "$0")/.." && pwd)
mode=report
report="$PWD/vendor-upstream-report.md"
while [ $# -gt 0 ]; do
  case "$1" in
    --check) mode=check ;;
    --report) shift; report="$1" ;;
    *) echo "usage: vendor-upstream.sh [--check | --report FILE]" >&2; exit 1 ;;
  esac
  shift
done

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

# headers.txt: file repo path commit, one line per upstream header found in the plugin
(cd "$root" && grep -rn -E 'upstream: [^ ]+ [^ ]+( \([^)]*\))? @ [0-9a-f]{40}' lib skills agents scripts templates hooks 2>/dev/null |
  sed -E 's/^([^:]+):[0-9]+:.*upstream: ([^ ]+) ([^ ]+)( \([^)]*\))? @ ([0-9a-f]{40}).*/\1 \2 \3 \5/') | sort > "$tmp/headers.txt"

# table.txt: file repo path commit, one line per VENDORED.md table row
awk -F'|' '
  function clean(s) { gsub(/[ `]/, "", s); return s }
  /^\|/ && $3 ~ /[0-9a-f]{40}/ {
    path = $6; sub(/ \(.*/, "", path); gsub(/[ `]/, "", path)
    print clean($5), clean($2), path, clean($3)
  }' "$root/VENDORED.md" | sort > "$tmp/table.txt"

if [ "$mode" = check ]; then
  status=0
  while read -r file repo path sha; do
    row=$(awk -v f="$file" '$1 == f' "$tmp/table.txt")
    if [ -z "$row" ]; then
      echo "not in VENDORED.md: $file ($repo @ $sha)"; status=1
    elif [ "${row##* }" != "$sha" ]; then
      echo "commit differs: $file header ${sha} VENDORED.md ${row##* }"; status=1
    fi
  done < "$tmp/headers.txt"
  while read -r file repo path sha; do
    grep -q "^$file " "$tmp/headers.txt" || { echo "no upstream header: $file (listed in VENDORED.md)"; status=1; }
  done < "$tmp/table.txt"
  [ "$status" -eq 0 ] && echo "vendor-upstream: $(wc -l < "$tmp/headers.txt" | tr -d ' ') vendored files match VENDORED.md"
  exit "$status"
fi

remote="${VENDOR_REMOTE:-https://github.com/}"
{
  echo "# Upstream changes"
  echo
  echo "Generated $(date -u +%Y-%m-%dT%H:%MZ). Each section is the diff of the upstream file between the recorded commit and HEAD."
} > "$report"
for repo in $(awk '{print $2}' "$tmp/table.txt" | sort -u); do
  dir="$tmp/$(echo "$repo" | tr / -)"
  if ! git clone --quiet "$remote$repo.git" "$dir" 2>"$tmp/err"; then
    printf '\n## %s\n\nclone failed: %s\n' "$repo" "$(cat "$tmp/err")" >> "$report"
    continue
  fi
  head=$(git -C "$dir" rev-parse HEAD)
  printf '\n## %s (HEAD %s)\n' "$repo" "$head" >> "$report"
  awk -v r="$repo" '$2 == r' "$tmp/table.txt" | while read -r file _ path sha; do
    printf '\n### %s <- %s\n\nrecorded %s\n\n' "$file" "$path" "$sha" >> "$report"
    if ! git -C "$dir" cat-file -e "$sha" 2>/dev/null; then
      echo "recorded commit not found in the clone" >> "$report"
    elif ! git -C "$dir" cat-file -e "HEAD:$path" 2>/dev/null; then
      echo "path no longer exists at HEAD (moved or deleted)" >> "$report"
    elif git -C "$dir" diff --quiet "$sha" HEAD -- "$path"; then
      echo "unchanged" >> "$report"
    else
      { echo '```diff'; git -C "$dir" diff "$sha" HEAD -- "$path"; echo '```'; } >> "$report"
    fi
  done
done
echo "vendor-upstream: report written to $report"
