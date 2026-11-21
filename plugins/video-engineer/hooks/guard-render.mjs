#!/usr/bin/env node
// PreToolUse Bash: deny `remotion render` / render-changed.mjs while any scene has audio.durationSec null.
// Music videos (videos/<slug>/blocks.json) have no narration and are skipped.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { deny, readEvent } from "./_lib.mjs";

const ev = readEvent();
const cmd = ev?.tool_input?.command;
if (typeof cmd !== "string") process.exit(0);
const renderChanged = /render-changed\.mjs/.test(cmd);
if (!renderChanged && !/remotion\s+render\b/.test(cmd)) process.exit(0);

const cwd = resolve(ev.cwd || process.cwd());
const tokens = cmd.split(/[\s;&|]+/).map((t) => t.replace(/^['"]|['"]$/g, "")).filter(Boolean);
const videos = join(cwd, "videos");
if (!existsSync(videos)) process.exit(0);

const slugs = new Set();
if (renderChanged) {
  const i = tokens.findIndex((t) => t.endsWith("render-changed.mjs"));
  const arg = tokens[i + 1];
  if (arg && !arg.startsWith("-")) slugs.add(arg);
}
for (const d of readdirSync(videos)) {
  if (tokens.some((t) => t === d || t.startsWith(`${d}-`))) slugs.add(d);
}

const problems = [];
for (const slug of slugs) {
  if (existsSync(join(videos, slug, "blocks.json"))) continue;
  try {
    const m = JSON.parse(readFileSync(join(videos, slug, "scenes.json"), "utf8"));
    const nulls = m.scenes.filter((s) => s.audio?.durationSec == null).map((s) => s.id);
    if (nulls.length) problems.push(`${slug}: ${nulls.join(", ")}`);
  } catch {
    // unreadable manifest: not this hook's concern
  }
}
if (problems.length) {
  deny(
    `Render blocked: audio.durationSec is null for ${problems.join("; ")}. Run the voice stage (the voice skill, or scripts/measure.sh <slug>) to generate and measure the narration first.`,
  );
}
