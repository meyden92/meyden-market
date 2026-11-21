#!/usr/bin/env node
// Builds each captioned scene's captions from the word timings the voice stage saved (public/audio/<id>.words.json,
// Scribe, seconds from the scene start) and writes videos/<slug>/captions/<id>.json (@remotion/captions Caption[],
// ms relative to the scene start). Node stdlib only.
// Usage: captions.mjs <slug> [--scene <id>]
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const args = process.argv.slice(2);
const opt = (n) => (args.includes(n) ? args[args.indexOf(n) + 1] : undefined);
const slug = args.find((a, i) => !a.startsWith("--") && args[i - 1] !== "--scene");
const fail = (msg) => {
  console.error(`captions: ${msg}`);
  process.exit(1);
};
if (!slug) fail("usage: captions.mjs <slug> [--scene <id>]");

const manifestPath = join("videos", slug, "scenes.json");
if (!existsSync(manifestPath)) fail(`${manifestPath} not found; run from the Remotion project root`);
const { scenes } = JSON.parse(readFileSync(manifestPath, "utf8"));

const only = opt("--scene");
const targets = scenes.filter((s) => s.captions && (!only || s.id === only));
if (only && !targets.length) fail(`scene ${only} not found or has captions: false`);

const outDir = join("videos", slug, "captions");
mkdirSync(outDir, { recursive: true });
for (const s of targets) {
  const wordsFile = s.audio.file.replace(/\.mp3$/, ".words.json");
  if (!existsSync(wordsFile)) fail(`${s.id}: missing ${wordsFile}; run the voice stage first`);
  const words = JSON.parse(readFileSync(wordsFile, "utf8"));
  const captions = words.map((w, i) => ({
    text: i === 0 ? w.text : ` ${w.text}`,
    startMs: Math.round(w.start * 1000),
    endMs: Math.round(w.end * 1000),
    timestampMs: Math.round(((w.start + w.end) / 2) * 1000),
    confidence: null,
  }));
  writeFileSync(join(outDir, `${s.id}.json`), `${JSON.stringify(captions, null, 2)}\n`);
  console.log(`${s.id}: wrote ${captions.length} captions`);
}
