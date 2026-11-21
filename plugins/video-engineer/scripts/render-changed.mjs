#!/usr/bin/env node
// Renders only the scenes whose hash changed, then concatenates and mixes music.
// Run with cwd = the Remotion project root, after gen-index.mjs.
// Usage: render-changed.mjs <slug> [--all]
//        render-changed.mjs <slug> --cut tall|square    full 9:16 or 1:1 composition -> out/final-9x16.mp4 / out/final-1x1.mp4
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const args = process.argv.slice(2);
const all = args.includes("--all");
const cutIndex = args.indexOf("--cut");
const cut = cutIndex >= 0 ? args[cutIndex + 1] : undefined;
const slug = args.find((a, i) => !a.startsWith("--") && (cutIndex < 0 || i !== cutIndex + 1));
if (!slug || (cutIndex >= 0 && !["tall", "square"].includes(cut))) {
  console.error("usage: render-changed.mjs <slug> [--all | --cut tall|square]");
  process.exit(1);
}

const fail = (msg) => {
  console.error(`render-changed: ${msg}`);
  process.exit(1);
};
const sha = (data) => createHash("sha256").update(data).digest("hex");
const fileSha = (path) => {
  if (!existsSync(path)) fail(`missing file ${path}`);
  return sha(readFileSync(path));
};
const run = (cmd, cmdArgs) => {
  const r = spawnSync(cmd, cmdArgs, { stdio: "inherit" });
  if (r.status !== 0) fail(`${cmd} ${cmdArgs.slice(0, 3).join(" ")} failed (exit ${r.status})`);
};
const ffmpeg = (ffArgs) => run("npx", ["remotion", "ffmpeg", "-y", "-loglevel", "error", ...ffArgs]);

const dir = join("videos", slug);
const manifestPath = join(dir, "scenes.json");
if (!existsSync(manifestPath)) fail(`${manifestPath} not found; run from the Remotion project root`);
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const { meta, scenes } = manifest;

const scenesOut = join(dir, "out", "scenes");
mkdirSync(scenesOut, { recursive: true });

const music = join("public", "audio", "music.mp3");
// Loops the music bed under the narration at meta.sound.musicDuck; copies the input when there is no bed.
const mixMusic = (input, output) => {
  if (!existsSync(music)) return copyFileSync(input, output);
  const mixed = `${output}.tmp.mp4`;
  ffmpeg([
    "-i", input,
    "-stream_loop", "-1", "-i", music,
    "-filter_complex", `[1:a]volume=${meta.sound.musicDuck}[m];[0:a][m]amix=inputs=2:duration=first:normalize=0[a]`,
    "-map", "0:v", "-map", "[a]", "-c:v", "copy", "-c:a", "aac", "-shortest", mixed,
  ]);
  copyFileSync(mixed, output);
  rmSync(mixed);
};

const captionsFile = (id) => join(dir, "captions", `${id}.json`);
const cap = (id) => id[0].toUpperCase() + id.slice(1);
const optSha = (path) => (existsSync(path) ? fileSha(path) : null);
// Inputs of the tutorial overlays: capture boxes, word timings and the shared UI sounds.
const tutorialHash = (s) =>
  s.capture || s.data?.steps
    ? {
        capture: s.capture ? fileSha(join("public", "capture", `${s.id}.json`)) : null,
        words: s.data?.steps ? optSha(join("public", "audio", `${s.id}.words.json`)) : null,
        ui: meta.sound.sfxDensity === "none" ? null : ["click", "type"].map((n) => optSha(join("public", "sfx", `ui-${n}.mp3`))),
      }
    : null;
if (cut) {
  const missing = scenes.filter((s) => s.audio.durationSec == null).map((s) => s.id);
  if (missing.length) fail(`audio.durationSec is null for ${missing.join(", ")}; run the voice stage first`);
  const body = join(dir, "out", `cut-${cut}.mp4`);
  const final = join(dir, "out", cut === "tall" ? "final-9x16.mp4" : "final-1x1.mp4");
  run("npx", ["remotion", "render", `${slug}-${cut}`, body, "--log=warn", "--gl=angle"]);
  mixMusic(body, final);
  rmSync(body);
  console.log(`render-changed: ${slug} cut ${cut}\n  music:  ${existsSync(music) ? `mixed at ${meta.sound.musicDuck}` : "none"}\n  output: ${final}`);
  process.exit(0);
}

const rendered = [];
const skipped = [];

for (const s of scenes) {
  if (s.audio.durationSec == null) fail(`scene ${s.id}: audio.durationSec is null; run the voice stage first`);
  const tsx = join("src", "videos", slug, "scenes", `${cap(s.id)}.tsx`);
  s.hash = sha(
    JSON.stringify({
      narration: s.narration,
      onScreen: s.onScreen,
      data: s.data ?? null,
      motion: s.motion,
      assetHashes: s.assets.map((a) => fileSha(a.file)),
      audioHash: fileSha(s.audio.file),
      sfxHashes: s.sfx.map((x) => fileSha(x.file)),
      audioDurationSec: s.audio.durationSec,
      captions: s.captions ? (existsSync(captionsFile(s.id)) ? fileSha(captionsFile(s.id)) : "pending") : null,
      tsx: existsSync(tsx) ? fileSha(tsx) : null,
      tutorial: tutorialHash(s),
      meta: {
        width: meta.width,
        height: meta.height,
        fps: meta.fps,
        tailFrames: meta.tailFrames ?? 12,
        style: { palette: meta.style.palette, font: meta.style.font, minTextPx: meta.style.minTextPx, tutorial: meta.style.tutorial ?? null },
      },
      // only scenes that play a sound effect re-render when the effect volume changes
      sfxVolume: s.sfx.length || s.capture || s.data?.steps ? (meta.sound.sfxVolume ?? 0.15) : null,
    }),
  );
}
writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

for (const s of scenes) {
  const hashFile = join(scenesOut, `${s.id}.hash`);
  const mp4 = join(scenesOut, `${s.id}.mp4`);
  const clean = !all && existsSync(mp4) && existsSync(hashFile) && readFileSync(hashFile, "utf8").trim() === s.hash;
  if (clean) {
    skipped.push(s.id);
    continue;
  }
  run("npx", ["remotion", "render", `${slug}-${s.id}`, mp4, "--log=warn", "--gl=angle"]);
  writeFileSync(hashFile, `${s.hash}\n`);
  rendered.push(s.id);
}

const out = join(dir, "out");
const list = join(out, "list.txt");
writeFileSync(list, scenes.map((s) => `file 'scenes/${s.id}.mp4'`).join("\n") + "\n");
const body = join(out, "body.mp4");
ffmpeg(["-f", "concat", "-safe", "0", "-i", list, "-c", "copy", body]);

const final = join(out, "final.mp4");
mixMusic(body, final);

console.log(`render-changed: ${slug}`);
console.log(`  rendered: ${rendered.join(", ") || "none"}`);
console.log(`  skipped:  ${skipped.join(", ") || "none"}`);
console.log(`  music:    ${existsSync(music) ? `mixed at ${meta.sound.musicDuck}` : "none"}`);
console.log(`  output:   ${final}`);
