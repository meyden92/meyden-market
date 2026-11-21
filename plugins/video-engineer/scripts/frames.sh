#!/bin/sh
# QA frame extraction. Renders the 50 % draft, pulls frames into out/qa/frames/ (t<seconds>-<id>.png) and builds
# out/qa/contact.png with out/qa/contact.txt (tile index -> frame file).
#   narrated video (scenes.json): one frame every 2 s plus the first and last frame of every scene; id = scene id
#   music video (blocks.json):    one frame every 2 s plus the first, middle and last frame of every block; id = block id
# Edge, flash and black-frame facts in flags.txt are measured on every draft frame, not on the samples.
# Also writes out/qa/flags.txt: measured facts the critic cannot see in sampled stills (white flashes per second,
# near-black runs, dark frame edges while the centre is lit, and extracted frames that came out near-black, each
# re-extracted once).
# Run with cwd = the Remotion project root. Usage: frames.sh <slug>
set -eu
slug="${1:-}"
[ -n "$slug" ] || { echo "usage: frames.sh <slug>" >&2; exit 1; }
if [ -f "videos/$slug/blocks.json" ]; then manifest="videos/$slug/blocks.json"; else manifest="videos/$slug/scenes.json"; fi
[ -f "$manifest" ] || { echo "frames: missing $manifest" >&2; exit 1; }
here=$(cd "$(dirname "$0")" && pwd)
qa="videos/$slug/out/qa"
mkdir -p "$qa/frames"
rm -f "$qa"/frames/*.png

# Plan: one line per frame: <frame number> <id>. Narrated scene length = round(durationSec*fps) + tailFrames;
# music blocks carry absolute from/to frames.
plan=$(node -e '
const m = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
const music = Array.isArray(m.blocks);
const fps = music ? m.fps : m.meta.fps;
const picks = new Map();
let parts;
if (music) {
  parts = m.blocks.map((b) => ({ id: b.id, start: b.from, end: b.to - 1 }));
} else {
  const tail = m.meta.tailFrames ?? 12;
  let start = 0;
  parts = m.scenes.map((s) => {
    if (s.audio.durationSec == null) { console.error("frames: " + s.id + ": audio.durationSec is null"); process.exit(1); }
    const frames = Math.round(s.audio.durationSec * fps) + tail;
    const r = { id: s.id, start, end: start + frames - 1 };
    start += frames;
    return r;
  });
}
const step = 2 * fps;
const first = parts[0].start, last = parts[parts.length - 1].end;
const partAt = (f) => parts.find((p) => f >= p.start && f <= p.end);
for (const p of parts) {
  picks.set(p.start, p.id);
  picks.set(p.end, p.id);
  if (music) picks.set(Math.round((p.start + p.end) / 2), p.id);
}
for (let f = first; f <= last; f += step) { const p = partAt(f); if (p) picks.set(f, p.id); }
console.log(fps);
console.log([...picks].sort((a, b) => a[0] - b[0]).map(([f, id]) => (f - first) + " " + id).join("\n"));
' "$manifest")
fps=$(printf '%s\n' "$plan" | sed -n 1p)

npx remotion render "$slug" "$qa/draft.mp4" --scale=0.5 --log=warn >/dev/null

# a 16x9 RGB grid per draft frame, 432 bytes per frame (bundled ffmpeg: no signalstats, no rawvideo muxer). Luma is
# computed here from RGB: the bundled ffmpeg's gray output is not full range and reads a navy frame as near-black.
luma="$qa/luma.bin"
npx remotion ffmpeg -y -loglevel error -i "$qa/draft.mp4" -vf scale=16:9:flags=area,format=rgb24 -c:v rawvideo -f image2pipe "$luma"
node -e '
const fs = require("fs");
const fps = Number(process.argv[1]);
const rgb = fs.readFileSync(process.argv[2]);
const W = 16, H = 9, N = W * H, count = rgb.length / (N * 3);
const cell = (i, x, y) => { const o = (i * N + y * W + x) * 3; return 0.299 * rgb[o] + 0.587 * rgb[o + 1] + 0.114 * rgb[o + 2]; };
const mean = (i, xs, ys) => { let s = 0, n = 0; for (const y of ys) for (const x of xs) { s += cell(i, x, y); n++; } return s / n; };
const all = [...Array(W).keys()], rows = [...Array(H).keys()];
const b = Array.from({ length: count }, (_, i) => Math.round(mean(i, all, rows)));
const t = (i) => (i / fps).toFixed(2) + "s";
const out = [];
const flashes = [];
for (let i = 1; i < b.length; i++) if (b[i] >= 235 && b[i - 1] < 235) flashes.push(i);
for (let k = 0; k < flashes.length; k++) {
  const n = flashes.filter((f) => f >= flashes[k] && f < flashes[k] + fps).length;
  if (n > 3) { out.push("flash: " + n + " full-frame white flashes within 1 s from " + t(flashes[k])); k += n - 1; }
}
for (let i = 0; i < b.length; i++) {
  if (b[i] > 10) continue;
  let j = i; while (j + 1 < b.length && b[j + 1] <= 10) j++;
  out.push("near-black: frames " + i + "-" + j + " (" + t(i) + " to " + t(j + 1) + ", " + (j - i + 1) + " frames, luma <= 10 of 255)");
  i = j;
}
// Dark edge: an outer strip (1/16 of the width or 1/9 of the height) near-black while the centre is lit. This is
// how a plate edge, a black band on a camera turn or an empty void at the frame edge shows.
const centre = (i) => mean(i, [5, 6, 7, 8, 9, 10], [3, 4, 5]);
const edges = { left: (i) => mean(i, [0], rows), right: (i) => mean(i, [W - 1], rows), top: (i) => mean(i, all, [0]), bottom: (i) => mean(i, all, [H - 1]) };
for (const [side, edge] of Object.entries(edges)) {
  const dark = (i) => edge(i) <= 12 && centre(i) >= 45;
  for (let i = 0; i < count; i++) {
    if (!dark(i)) continue;
    let j = i; while (j + 1 < count && dark(j + 1)) j++;
    if (j - i + 1 >= 3) out.push("dark-edge: " + side + " strip near-black while the centre is lit, frames " + i + "-" + j + " (" + t(i) + " to " + t(j + 1) + ")");
    i = j;
  }
}
console.log(out.length ? out.join("\n") : "no flash, near-black or dark-edge runs in the draft");
' "$fps" "$luma" > "$qa/flags.txt"

# mean luma (0-255) of one extracted still, from RGB (see the grid pass above)
still_luma() { npx remotion ffmpeg -loglevel error -i "$1" -vf scale=1:1:flags=area,format=rgb24 -c:v rawvideo -f image2pipe - | od -An -tu1 | awk 'NF { printf "%d", 0.299 * $1 + 0.587 * $2 + 0.114 * $3; exit }'; }

printf '%s\n' "$plan" | sed 1d | while read -r frame id; do
  name=$(node -e 'console.log("t" + (Number(process.argv[1]) / Number(process.argv[2])).toFixed(2) + "-" + process.argv[3] + ".png")' "$frame" "$fps" "$id")
  # seek 2 ms before the frame's timestamp: input seeking keeps the first frame at or after ts, so rounding up skips a frame
  ts=$(node -e 'console.log(Math.max(0, Number(process.argv[1]) / Number(process.argv[2]) - 0.002).toFixed(4))' "$frame" "$fps")
  npx remotion ffmpeg -y -loglevel error -ss "$ts" -i "$qa/draft.mp4" -frames:v 1 -pix_fmt rgb24 "$qa/frames/$name"
  # a near-black still is extracted once more: a bright second extraction is an extraction flake, a dark one a real black frame
  first=$(still_luma "$qa/frames/$name")
  if [ "$first" -le 10 ]; then
    npx remotion ffmpeg -y -loglevel error -ss "$ts" -i "$qa/draft.mp4" -frames:v 1 -pix_fmt rgb24 "$qa/frames/$name"
    second=$(still_luma "$qa/frames/$name")
    if [ "$second" -le 10 ]; then verdict="real black frame"; else verdict="extraction flake, second extraction kept"; fi
    echo "extract: $name luma $first then $second after re-extraction: $verdict" >> "$qa/flags.txt"
  fi
done

node "$here/contact-sheet.mjs" "$qa/frames" "$qa/contact.png" "$qa/contact.txt" 4 400 "$qa/flags.txt"
rm -f "$luma"
echo "frames: $(ls "$qa/frames" | wc -l | tr -d ' ') in $qa/frames, sheet $qa/contact.png, map $qa/contact.txt, flags $qa/flags.txt"
