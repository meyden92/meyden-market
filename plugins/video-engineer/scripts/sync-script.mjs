#!/usr/bin/env node
// Regenerates the scenes of videos/<slug>/scenes.json from videos/<slug>/SCRIPT.md, then validates.
// Run with cwd = the Remotion project root.
// Usage: sync-script.mjs <slug>                      resync an existing scenes.json (meta untouched)
//        sync-script.mjs <slug> --init < meta.json    first write; meta JSON on stdin
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
const init = args.includes("--init");
const slug = args.find((a) => !a.startsWith("--"));
if (!slug) {
  console.error("usage: sync-script.mjs <slug> [--init < meta.json]");
  process.exit(1);
}
const fail = (msg) => {
  console.error(`sync-script: ${msg}`);
  process.exit(1);
};

const dir = join("videos", slug);
const scriptPath = join(dir, "SCRIPT.md");
const manifestPath = join(dir, "scenes.json");
if (!existsSync(scriptPath)) fail(`${scriptPath} not found; run from the Remotion project root`);

// Fallback speaking rate when meta.voice.wpm (measured by audio.mjs pace) is absent.
const DEFAULT_WPM = 140;
const LAYERS = ["background", "subject", "overlay", "screenshot"];

// ---- parse SCRIPT.md ----
const errors = [];
const parsed = [];
let cur = null;
let list = null; // "assets" | "sfx" | "steps" while reading "- " items
const src = readFileSync(scriptPath, "utf8").replace(/<!--[\s\S]*?-->/g, (c) => c.replace(/[^\n]/g, ""));

const lines = src.split("\n");
lines.forEach((raw, i) => {
  const line = raw.trim();
  const at = `SCRIPT.md:${i + 1}`;
  if (!line || line.startsWith("# ")) return;
  const head = line.match(/^##\s+(.*)$/);
  if (head) {
    const m = head[1].match(/^(s\d{2,3})\s+·\s+(\S.*)$/);
    if (!m) {
      errors.push(`${at}: scene heading must be "## sNN · <section>"`);
      cur = null;
      return;
    }
    cur = { id: m[1], section: m[2].trim(), paras: [[]], fields: {}, assets: [], sfx: [], steps: [], line: i + 1 };
    parsed.push(cur);
    list = null;
    return;
  }
  if (!cur) return errors.push(`${at}: text before the first "## sNN · <section>" heading`);

  const field = line.match(/^(Type|On screen|Motion|Voice|Data|Capture|Steps|Assets|SFX|Captions):\s*(.*)$/);
  if (field) {
    const [, name, value] = field;
    if (name in cur.fields) errors.push(`${at}: ${cur.id}: "${name}:" appears twice`);
    cur.fields[name] = value;
    list = { Assets: "assets", SFX: "sfx", Steps: "steps" }[name] ?? null;
    if (list && value && value !== "none") errors.push(`${at}: ${cur.id}: put ${name} items on "- " lines below "${name}:"`);
    return;
  }
  if (line.startsWith("- ") && list === "assets") {
    const m = line.match(/^-\s+(\S+)\s+\(([a-z]+)(?:,\s*(\d+(?:\.\d+)?)x)?\):\s*(\S.*)$/);
    if (!m) return errors.push(`${at}: ${cur.id}: asset must be "- <file>.png (<layer>[, <scale>x]): <prompt>"`);
    const [, name, layer, scale, prompt] = m;
    if (!new RegExp(`^${cur.id}-[a-z0-9]+(?:-[a-z0-9]+)*\\.png$`).test(name))
      errors.push(`${at}: ${cur.id}: asset file must be ${cur.id}-<kebab-name>.png, got ${name}`);
    if (!LAYERS.includes(layer)) errors.push(`${at}: ${cur.id}: layer must be one of ${LAYERS.join(", ")}`);
    if (scale && !(Number(scale) >= 1 && Number(scale) <= 2)) errors.push(`${at}: ${cur.id}: asset scale must be between 1x and 2x, got ${scale}x`);
    cur.assets.push({ file: `public/img/${name}`, layer, prompt: prompt.trim(), ...(scale ? { scale: Number(scale) } : {}) });
    return;
  }
  if (line.startsWith("- ") && list === "sfx") {
    const m = line.match(/^-\s+(\d+(?:\.\d+)?):\s*(\S.*)$/);
    if (!m) return errors.push(`${at}: ${cur.id}: sfx must be "- <seconds>: <prompt>"`);
    cur.sfx.push({ at: Number(m[1]), prompt: m[2].trim(), file: `public/sfx/${cur.id}-${cur.sfx.length}.mp3` });
    return;
  }
  if (line.startsWith("- ") && list === "steps") {
    // - "<word>"[#n]: <action> [<target>] ["<text>"]   or   - <seconds>: ...
    const m = line.match(/^-\s+(?:"([^"]+)"(?:#(\d+))?|(\d+(?:\.\d+)?)):\s*([a-z]+)(?:\s+([a-z0-9]+(?:-[a-z0-9]+)*))?(?:\s+"(.*)")?\s*$/);
    if (!m) return errors.push(`${at}: ${cur.id}: step must be '- "<word>"[#n]: <action> [<target>] ["<text>"]' or '- <seconds>: ...'`);
    const [, word, n, seconds, action, target, text] = m;
    const step = { at: word ? { word, ...(n ? { n: Number(n) } : {}) } : Number(seconds), action };
    if (target) step.target = target;
    if (text !== undefined) step.text = text;
    cur.steps.push(step);
    return;
  }
  if (Object.keys(cur.fields).length) return errors.push(`${at}: ${cur.id}: narration must come before the field lines`);
  // narration: paragraphs separated by blank lines in the source
  const prevBlank = i > 0 && lines[i - 1].trim() === "";
  if (prevBlank && cur.paras.at(-1).length) cur.paras.push([]);
  cur.paras.at(-1).push(line);
});

const motionOf = (s, value) => {
  const parts = value.split("·").map((p) => p.trim());
  if (parts.length !== 3 || parts.some((p) => !p)) {
    errors.push(`${s.id}: Motion must be "<entrance> · <camera> · <transitionIn>"`);
    return { entrance: "", camera: "", transitionIn: "" };
  }
  return { entrance: parts[0], camera: parts[1], transitionIn: parts[2] };
};

const scenesFromScript = parsed.map((s) => {
  const f = s.fields;
  for (const req of ["Type", "On screen", "Motion"]) if (!(req in f)) errors.push(`${s.id}: missing "${req}:" line`);
  const narration = s.paras.map((p) => p.join(" ")).filter(Boolean).join("\n\n");
  if (!narration) errors.push(`${s.id}: no narration`);
  let data;
  if (f.Data) {
    try {
      data = JSON.parse(f.Data);
      if (typeof data !== "object" || data === null || Array.isArray(data)) throw new Error("not an object");
    } catch (e) {
      errors.push(`${s.id}: Data is not a JSON object (${e.message})`);
    }
  }
  let capture;
  if (f.Capture) {
    try {
      capture = JSON.parse(f.Capture);
      if (typeof capture !== "object" || capture === null || Array.isArray(capture)) throw new Error("not an object");
      capture = { shot: capture.shot, record: capture.record ?? false, steps: capture.steps ?? [], targets: capture.targets ?? {} };
    } catch (e) {
      errors.push(`${s.id}: Capture is not a JSON object (${e.message})`);
    }
  }
  const assets = [...s.assets];
  if (capture) {
    const file = capture.record ? `public/video/${s.id}-${capture.shot}.webm` : `public/img/${s.id}-${capture.shot}.png`;
    if (assets.some((a) => a.file === file)) errors.push(`${s.id}: ${file} comes from Capture; remove it from Assets`);
    // The prompt carries the capture spec, so a changed capture resets the asset to pending.
    assets.push({ file, layer: capture.record ? "screencast" : "screenshot", prompt: `capture ${JSON.stringify(capture)}` });
  }
  if (s.steps.length) {
    if (data?.steps) errors.push(`${s.id}: steps are given both in Data and in Steps`);
    data = { ...(data ?? {}), steps: s.steps };
  }
  const captions = (f.Captions ?? "on").trim();
  if (!["on", "off"].includes(captions)) errors.push(`${s.id}: Captions must be on or off`);
  const voiceStyle = (f.Voice ?? "").trim();
  return {
    id: s.id,
    section: s.section,
    narration,
    ...(voiceStyle ? { voiceStyle } : {}),
    onScreen: (f["On screen"] ?? "").trim(),
    visualType: (f.Type ?? "").trim(),
    motion: motionOf(s, f.Motion ?? ""),
    assets,
    sfx: s.sfx,
    ...(data ? { data } : {}),
    ...(capture ? { capture } : {}),
    captions: captions === "on",
  };
});

const seen = new Set();
for (const s of scenesFromScript) {
  if (seen.has(s.id)) errors.push(`${s.id}: duplicate scene id`);
  seen.add(s.id);
}
if (!parsed.length) errors.push("no scenes found");
if (errors.length) {
  console.error(`sync-script: ${slug}: ${errors.length} error(s) in SCRIPT.md`);
  for (const e of errors) console.error(`  ${e}`);
  process.exit(1);
}

// ---- merge with the existing manifest ----
let previousText = null;
let meta;
let oldScenes = [];
if (init) {
  if (existsSync(manifestPath)) fail(`${manifestPath} exists; run without --init to resync`);
  try {
    meta = JSON.parse(readFileSync(0, "utf8"));
  } catch (e) {
    fail(`--init needs the meta JSON object on stdin (${e.message})`);
  }
} else {
  if (!existsSync(manifestPath)) fail(`${manifestPath} not found; run with --init first`);
  previousText = readFileSync(manifestPath, "utf8");
  const old = JSON.parse(previousText);
  meta = old.meta;
  oldScenes = old.scenes ?? [];
}
const oldById = new Map(oldScenes.map((s) => [s.id, s]));
const content = (s) =>
  JSON.stringify([s.section, s.narration, s.voiceStyle ?? null, s.onScreen, s.visualType, s.motion, s.assets.map(({ file, layer, prompt }) => [file, layer, prompt]), s.sfx, s.data ?? null, s.capture ?? null, s.captions]);

const counts = { kept: 0, changed: 0, added: 0, removed: 0 };
const scenes = scenesFromScript.map((n) => {
  const old = oldById.get(n.id);
  if (!old) counts.added++;
  const sameNarration = old?.narration === n.narration && old?.voiceStyle === n.voiceStyle;
  const same = old && content(old) === content(n);
  if (old) counts[same ? "kept" : "changed"]++;
  const oldAsset = new Map((old?.assets ?? []).map((a) => [a.file, a]));
  return {
    id: n.id,
    section: n.section,
    narration: n.narration,
    ...(n.voiceStyle ? { voiceStyle: n.voiceStyle } : {}),
    onScreen: n.onScreen,
    visualType: n.visualType,
    motion: n.motion,
    assets: n.assets.map((a) => {
      const o = oldAsset.get(a.file);
      return { ...a, status: o && o.layer === a.layer && o.prompt === a.prompt && o.scale === a.scale ? o.status : "pending" };
    }),
    audio: { file: old?.audio?.file ?? `public/audio/${n.id}.mp3`, durationSec: sameNarration ? old.audio.durationSec : null },
    sfx: n.sfx,
    ...(n.data ? { data: n.data } : {}),
    ...(n.capture ? { capture: n.capture } : {}),
    captions: n.captions,
    hash: same ? old.hash : "",
    qa: same ? old.qa : { score: null, issues: [] },
  };
});
counts.removed = oldScenes.filter((s) => !seen.has(s.id)).length;

// ---- write, validate, restore on failure ----
writeFileSync(manifestPath, JSON.stringify({ meta, scenes }, null, 2) + "\n");
const validator = join(dirname(fileURLToPath(import.meta.url)), "validate-manifest.mjs");
const v = spawnSync(process.execPath, [validator, slug], { stdio: "inherit" });
if (v.status !== 0) {
  if (previousText === null) rmSync(manifestPath);
  else writeFileSync(manifestPath, previousText);
  fail(`scenes.json failed validation; ${previousText === null ? "nothing written" : "previous file restored"}. Fix SCRIPT.md${init ? " or the meta JSON" : ""}.`);
}

// ---- scene table ----
const words = (t) => t.split(/\s+/).filter(Boolean).length;
const WPM = meta.voice.wpm ?? DEFAULT_WPM;
let total = 0;
let outOfBand = 0;
console.log("\n| id | section | type | words | est s | |\n|---|---|---|---|---|---|");
for (const s of scenes) {
  const w = words(s.narration);
  const sec = (w / WPM) * 60;
  total += sec;
  const flag = sec < 8 ? "under 8 s" : sec > 20 ? "over 20 s" : "";
  if (flag) outOfBand++;
  console.log(`| ${s.id} | ${s.section} | ${s.visualType} | ${w} | ${sec.toFixed(1)} | ${flag} |`);
}
const [lo, hi] = meta.targetSec;
const totalFlag = total < lo || total > hi ? ` (outside targetSec ${lo}-${hi})` : "";
console.log(`\nestimated total at ${WPM} wpm${meta.voice.wpm ? " (measured)" : " (default, not measured)"}: ${total.toFixed(1)} s${totalFlag}`);
console.log(`scenes: ${scenes.length} (kept ${counts.kept}, changed ${counts.changed}, added ${counts.added}, removed ${counts.removed})`);
if (outOfBand) console.log(`warning: ${outOfBand} scene(s) outside 8-20 s of narration`);
