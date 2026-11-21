#!/usr/bin/env node
// Interview-seam checker. Run with cwd = the Remotion project root. Usage: check.mjs <slug>
// Passes when BRIEF.md has every heading filled, scenes.json validates, every scene is 8-20 s of
// narration at 140 wpm, every visualType is in the closed set, and research/references.md follows
// the reference-analysis schema.
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const slug = process.argv[2];
if (!slug) {
  console.error("usage: check.mjs <slug>");
  process.exit(1);
}
const plugin = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const dir = join("videos", slug);
const fails = [];
const read = (f) => (existsSync(join(dir, f)) ? readFileSync(join(dir, f), "utf8") : (fails.push(`${f} missing`), ""));

const HEADINGS = ["Job", "Audience", "Promise", "Format", "References", "Visual system", "Structure", "Voice", "Sound", "Assets", "Constraints", "Decisions"];
const brief = read("BRIEF.md");
if (brief) {
  if (!/^# \S/m.test(brief)) fails.push("BRIEF.md: no title");
  const parts = brief.split(/^## /m).slice(1).map((p) => [p.split("\n")[0].trim(), p.split("\n").slice(1).join("\n").trim()]);
  const names = parts.map(([h]) => h);
  if (names.join("|") !== HEADINGS.join("|")) fails.push(`BRIEF.md: headings are [${names.join(", ")}], expected [${HEADINGS.join(", ")}]`);
  for (const [h, body] of parts) if (!body) fails.push(`BRIEF.md: ## ${h} is empty`);
  if (/<[^>\n]*>/.test(brief.replace(/<!--[\s\S]*?-->/g, ""))) fails.push("BRIEF.md: a <...> placeholder is left");
}

const v = spawnSync(process.execPath, [join(plugin, "scripts", "validate-manifest.mjs"), slug], { encoding: "utf8" });
if (v.status !== 0) fails.push(`validate-manifest: ${(v.stderr || v.stdout).trim()}`);

const TYPES = ["title", "illustration", "layered", "diagram", "counter", "list", "code", "terminal", "screenshot", "comparison", "quote", "cta"];
const manifestText = read("scenes.json");
const rows = [];
if (manifestText) {
  for (const s of JSON.parse(manifestText).scenes) {
    const words = s.narration.split(/\s+/).filter(Boolean).length;
    const sec = (words / 140) * 60;
    rows.push(`${s.id} ${s.visualType} ${words}w ${sec.toFixed(1)}s`);
    if (sec < 8 || sec > 20) fails.push(`${s.id}: ${sec.toFixed(1)} s of narration, outside 8-20 s`);
    if (!TYPES.includes(s.visualType)) fails.push(`${s.id}: visualType ${s.visualType} not in the closed set`);
  }
}

const FIELDS = ["Layout", "Palette", "Type", "Density", "Implied motion", "Platform UI visible", "Take", "Reject"];
const refs = read("research/references.md");
if (refs) {
  const blocks = refs.split(/^## /m).slice(1).filter((b) => !b.startsWith("Summary"));
  if (!blocks.length) fails.push("references.md: no screenshot blocks");
  if (!/^## Summary/m.test(refs)) fails.push("references.md: no Summary");
  for (const b of blocks) {
    const name = b.split("\n")[0].trim();
    for (const f of FIELDS) if (!new RegExp(`^- ${f}: \\S`, "m").test(b)) fails.push(`references.md: ${name}: missing "- ${f}:"`);
    const pal = b.match(/^- Palette: (.*)$/m)?.[1] ?? "";
    if (!/#[0-9A-Fa-f]{6}\b/.test(pal) || /#(?![0-9A-Fa-f]{6}\b)/.test(pal)) fails.push(`references.md: ${name}: palette is not #RRGGBB hex`);
  }
}

console.log(rows.join("\n"));
if (fails.length) {
  console.error(`check: ${slug}: FAIL (${fails.length})`);
  for (const f of fails) console.error(`  ${f}`);
  process.exit(1);
}
console.log(`check: ${slug}: pass (${rows.length} scenes)`);
