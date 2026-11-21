#!/usr/bin/env node
// Builds blocks.json for music mode: one block per lyric section, cut on downbeats. Node standard library only.
// Usage: music-blocks.mjs <song.json> <alignment.json> <out blocks.json> [--fps 30] [--tolerance 0.1] [--stubs src/videos/<slug>]
// --stubs writes <dir>/blocks/<Id>.tsx (a Pending stub, skipped when the file exists) and <dir>/worlds.ts (the block registry, always rewritten).
// song.json comes from analyze-music.mjs, alignment.json from `audio.mjs save <slug> align`.
// Start of a block: the downbeat nearest to the section's first vocal. If that downbeat lies before the previous
// section's last vocal ends, the nearest downbeat after the first vocal is used instead. A cut after the first vocal
// makes the block a pickup (its first line is sung over the previous block). --tolerance is the alignment slack in s.
// A block ends where the next starts; a tail block runs from the last vocal to the end of the audio.
// Output: { fps, duration, total, bar, blocks[{id, section, from, to, firstVocal, lastVocal, cutT, pickup, pickupSec, confidence}] }
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const args = process.argv.slice(2);
const opt = (n, d) => (args.includes(n) ? args[args.indexOf(n) + 1] : d);
const positional = args.filter((a, i) => !a.startsWith("--") && !["--fps", "--tolerance", "--stubs"].includes(args[i - 1]));
const [songFile, alignFile, outFile] = positional;
if (!songFile || !alignFile || !outFile) {
  console.error("Usage: music-blocks.mjs <song.json> <alignment.json> <out blocks.json> [--fps 30] [--tolerance 0.1] [--stubs <src dir>]");
  process.exit(1);
}
const die = (m) => {
  console.error(`music-blocks: ${m}`);
  process.exit(1);
};
const song = JSON.parse(readFileSync(songFile, "utf8"));
const align = JSON.parse(readFileSync(alignFile, "utf8"));
const fps = Number(opt("--fps", song.fps ?? 30));
const tol = Number(opt("--tolerance", 0.1));
const downbeats = (song.downbeats ?? []).map((d) => d.t);
if (!downbeats.length) die("song.json has no downbeats");
if (!song.duration) die("song.json has no duration");

// Sections: consecutive lines with the same header form one block; a header that returns later is a new block.
if (align.lines?.some((l) => l.section == null)) die("alignment.json has lines without a section; add [SECTION] headers to lyrics.txt and re-run audio.mjs plan <slug> align (no new paid call)");
const sections = [];
for (const l of align.lines ?? []) {
  if (l.start == null) continue;
  const label = l.section;
  const last = sections.at(-1);
  if (last && last.label === label) last.lines.push(l);
  else sections.push({ label, lines: [l] });
}
if (!sections.length) die("alignment.json has no aligned lines");
for (const s of sections) {
  s.first = Math.min(...s.lines.map((l) => l.start));
  s.last = Math.max(...s.lines.map((l) => l.end));
}

const gaps = downbeats.slice(1).map((t, i) => t - downbeats[i]).sort((a, b) => a - b);
const bar = gaps[Math.floor(gaps.length / 2)] ?? 2;
const before = (t) => downbeats.filter((d) => d <= t).at(-1);
const after = (t) => downbeats.find((d) => d > t);

// Ids: label without spaces and punctuation; a label that occurs more than once gets its occurrence number.
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const count = {};
for (const s of sections) count[s.label] = (count[s.label] ?? 0) + 1;
const seen = {};
for (const s of sections) {
  seen[s.label] = (seen[s.label] ?? 0) + 1;
  s.id = slug(s.label) + (count[s.label] > 1 ? seen[s.label] : "");
}
if (new Set(sections.map((s) => s.id)).size !== sections.length) die("section labels produce duplicate block ids");

const cuts = [];
sections.forEach((s, i) => {
  if (i === 0) {
    cuts.push({ t: 0, pickup: false, conf: 1 });
    return;
  }
  const prevEnd = sections[i - 1].last;
  const prevCut = cuts[i - 1].t;
  const b = before(s.first + tol);
  const a = after(s.first);
  let t = b === undefined || (a !== undefined && a - s.first < s.first - b) ? a : b;
  if (t === undefined || t <= prevCut || t < prevEnd - tol) t = a;
  if (t === undefined) die(`no downbeat found for ${s.label} at ${s.first.toFixed(2)} s`);
  // Confidence: 1 when the cut sits on the first vocal, 0 when half a bar away (the other downbeat is as close).
  const conf = Math.max(0, 1 - Math.abs(t - s.first) / (bar / 2));
  cuts.push({ t, pickup: t - s.first > tol, conf });
});

const lastVocal = sections.at(-1).last;
const tailT = after(lastVocal - tol);
const hasTail = tailT !== undefined && tailT < song.duration - 0.3 && tailT > cuts.at(-1).t;
const fr = (t) => Math.round(t * fps);
const total = fr(song.duration);

const blocks = sections.map((s, i) => {
  const endT = i + 1 < sections.length ? cuts[i + 1].t : hasTail ? tailT : song.duration;
  const c = cuts[i];
  return {
    id: s.id,
    section: s.label,
    from: fr(c.t),
    to: i + 1 < sections.length || hasTail ? fr(endT) : total,
    firstVocal: +s.first.toFixed(2),
    lastVocal: +s.last.toFixed(2),
    cutT: +c.t.toFixed(3),
    pickup: c.pickup,
    pickupSec: c.pickup ? +(c.t - s.first).toFixed(2) : 0,
    confidence: +c.conf.toFixed(2),
  };
});
if (hasTail) blocks.push({ id: "tail", section: null, from: fr(tailT), to: total, firstVocal: null, lastVocal: null, cutT: +tailT.toFixed(3), pickup: false, pickupSec: 0, confidence: 1 });

writeFileSync(outFile, JSON.stringify({ fps, duration: song.duration, total, bar: +bar.toFixed(3), blocks }, null, 2) + "\n");
console.log(`music-blocks: wrote ${outFile} (${blocks.length} blocks, ${total} frames, bar ${bar.toFixed(2)} s)`);
for (const b of blocks) {
  const flag = b.confidence < 0.5 ? "  LOW CONFIDENCE" : b.pickup ? `  pickup ${b.pickupSec} s` : "";
  console.log(`  ${b.id.padEnd(12)} ${String(b.from).padStart(5)}-${String(b.to).padEnd(5)} conf ${b.confidence.toFixed(2)}${flag}`);
}

const stubDir = opt("--stubs");
if (stubDir) {
  const names = blocks.map((b) => ({ id: b.id, name: b.id[0].toUpperCase() + b.id.slice(1) }));
  mkdirSync(join(stubDir, "blocks"), { recursive: true });
  let made = 0;
  for (const { id, name } of names) {
    const file = join(stubDir, "blocks", `${name}.tsx`);
    if (existsSync(file)) continue;
    writeFileSync(file, `import React from "react";\nimport { Pending } from "./Pending";\n\nexport const ${name}: React.FC = () => <Pending id="${id}" />;\n`);
    made++;
  }
  const code = `// Generated by music-blocks.mjs. Do not edit.
import type React from "react";
${names.map((n) => `import { ${n.name} } from "./blocks/${n.name}";`).join("\n")}

export const WORLDS: Record<string, React.FC> = {
${names.map((n) => `  ${n.id}: ${n.name},`).join("\n")}
};
`;
  writeFileSync(join(stubDir, "worlds.ts"), code);
  console.log(`music-blocks: ${made} new stub(s) in ${join(stubDir, "blocks")}, wrote ${join(stubDir, "worlds.ts")}`);
}
