#!/bin/sh
# Reads each scene's audio duration with Remotion's bundled ffprobe, writes audio.durationSec
# into videos/<slug>/scenes.json, then checks total vs meta.targetSec and scenes under 4 s.
# Run with cwd = the Remotion project root. Usage: measure.sh <slug>
set -eu
slug="${1:-}"
[ -n "$slug" ] || { echo "usage: measure.sh <slug>" >&2; exit 1; }
manifest="videos/$slug/scenes.json"
[ -f "$manifest" ] || { echo "measure: missing $manifest" >&2; exit 1; }

tmp=$(mktemp)
trap 'rm -f "$tmp"' EXIT
node -e '
const m = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
console.log(m.scenes.map((s) => s.id + "\t" + s.audio.file).join("\n"));
' "$manifest" > "$tmp"

durations=""
while IFS="$(printf '\t')" read -r id file; do
  if [ ! -f "$file" ]; then
    echo "measure: $id: missing $file" >&2
    exit 1
  fi
  d=$(npx remotion ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 "$file" | tail -n 1)
  case "$d" in
    ''|*[!0-9.]*) echo "measure: $id: ffprobe returned '$d' for $file" >&2; exit 1 ;;
  esac
  durations="$durations$id=$d "
done < "$tmp"

DURATIONS="$durations" node -e '
const fs = require("fs");
const f = process.argv[1];
const m = JSON.parse(fs.readFileSync(f, "utf8"));
const d = Object.fromEntries(process.env.DURATIONS.trim().split(/\s+/).map((p) => p.split("=")));
for (const s of m.scenes) s.audio.durationSec = Math.round(Number(d[s.id]) * 1000) / 1000;
fs.writeFileSync(f, JSON.stringify(m, null, 2) + "\n");
const total = m.scenes.reduce((a, s) => a + s.audio.durationSec, 0);
const [lo, hi] = m.meta.targetSec;
const short = m.scenes.filter((s) => s.audio.durationSec < 4);
for (const s of m.scenes) console.log(s.id + "  " + s.audio.durationSec.toFixed(3) + " s");
console.log("total " + total.toFixed(3) + " s (target " + lo + "-" + hi + ")");
let bad = false;
if (total < lo || total > hi) { console.error("FAIL: total " + total.toFixed(1) + " s is outside targetSec [" + lo + ", " + hi + "]"); bad = true; }
if (short.length) { console.error("FAIL: scenes under 4 s: " + short.map((s) => s.id + " (" + s.audio.durationSec.toFixed(2) + " s)").join(", ")); bad = true; }
process.exit(bad ? 1 : 0);
' "$manifest"
