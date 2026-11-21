#!/usr/bin/env node
// Fingerprints of finished videos, so the next video's direction can be checked against the last ones.
// Node stdlib only. Run with cwd = the Remotion project root.
//   fingerprint.mjs add <slug> --data <dir>     record videos/<slug>/scenes.json, or videos/<slug>/research/direction.json for a
//                                               music video (replaces an earlier record of the slug)
//   fingerprint.mjs list --data <dir> [--last <n>]   the last n records (default 5), newest last
// The ledger is <dir>/fingerprints.jsonl, normally ${CLAUDE_PLUGIN_DATA}, so it spans every project on this machine.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const [cmd, ...argv] = process.argv.slice(2);
const opt = (n) => (argv.includes(n) ? argv[argv.indexOf(n) + 1] : undefined);
const die = (msg) => {
  console.error(`fingerprint: ${msg}`);
  process.exit(1);
};
const data = opt("--data") ?? die("--data <dir> is required (the plugin data folder)");
const ledger = join(data, "fingerprints.jsonl");
const read = () => (existsSync(ledger) ? readFileSync(ledger, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)) : []);

const count = (values) => Object.fromEntries([...new Set(values)].map((v) => [v, values.filter((x) => x === v).length]));

if (cmd === "add") {
  const slug = argv.find((a, i) => !a.startsWith("--") && argv[i - 1] !== "--data") ?? die("add needs a slug");
  const file = join("videos", slug, "scenes.json");
  const music = join("videos", slug, "research", "direction.json");
  if (!existsSync(file) && !existsSync(music)) die(`missing ${file} (narrated video) or ${music} (music video)`);
  const record = existsSync(file) ? narrated(slug, JSON.parse(readFileSync(file, "utf8"))) : musicVideo(slug, JSON.parse(readFileSync(music, "utf8")));
  const rest = read().filter((r) => !(r.project === record.project && r.slug === slug));
  mkdirSync(data, { recursive: true });
  writeFileSync(ledger, [...rest, record].map((r) => JSON.stringify(r)).join("\n") + "\n");
  console.log(`fingerprint: recorded ${slug} in ${ledger}`);
} else if (cmd === "list") {
  const last = Number(opt("--last") ?? 5);
  const records = read().slice(-last);
  if (!records.length) console.log("fingerprint: no earlier videos recorded");
  for (const r of records) console.log(JSON.stringify(r));
} else die("usage: fingerprint.mjs add <slug> --data <dir> | list --data <dir> [--last <n>]");

function musicVideo(slug, d) {
  return {
    date: new Date().toISOString().slice(0, 10),
    project: process.cwd(),
    slug,
    kind: "music",
    title: d.name ?? slug,
    direction: { name: d.name ?? null, world: d.world ?? null, madeOf: d.madeOf ?? null, device: d.device ?? null, form: d.form ?? null, motion: d.motion ?? null },
    palette: d.palette ?? null,
    font: d.font ?? null,
  };
}

function narrated(slug, { meta, scenes }) {
  const d = meta.direction ?? {};
  return {
    date: new Date().toISOString().slice(0, 10),
    project: process.cwd(),
    slug,
    title: meta.title,
    direction: { name: d.name ?? null, world: d.world ?? null, madeOf: d.madeOf ?? null, device: d.device ?? null, form: d.form ?? null, motion: d.motion ?? null },
    palette: meta.style.palette,
    font: meta.style.font,
    canvas: `${meta.width}x${meta.height}`,
    visualTypes: count(scenes.map((s) => s.visualType)),
    entrances: count(scenes.map((s) => s.motion.entrance)),
    transitions: count(scenes.map((s) => s.motion.transitionIn)),
    customScenes: scenes.filter((s) => existsSync(join("src", "videos", slug, "scenes", `${s.id[0].toUpperCase()}${s.id.slice(1)}.tsx`))).length,
    scenes: scenes.length,
  };
}
