#!/usr/bin/env node
// Reusable sound library: generic sound effects (clicks, typing, whooshes, pops, chimes, ...) shared by every video.
// Node stdlib only. Run with cwd = the Remotion project root.
//   sfx-library.mjs list [--data <dir>]                  every sound with id, length, description and use
//   sfx-library.mjs use <id> <dest.mp3> [--data <dir>]   copy a library sound into the project
//   sfx-library.mjs save <file.mp3> <id> --description "<what it sounds like>" --use "<when to use it>"
//                   --prompt "<generation prompt>" [--settings "<duration, loop>"] [--data <dir>]
// Each library folder holds the mp3 files and soundlist.md, a table with one row per sound.
// Folders, read in this order (first match wins):
//   1. VIDEO_ENGINEER_SFX_LIBRARY: the plugin setting "Sound library folder", normally
//      <marketplace checkout>/plugins/video-engineer/sfx, so saved sounds can be committed and shipped
//   2. --data <dir>: the plugin data folder (${CLAUDE_PLUGIN_DATA}/sfx), used when the setting is empty
//   3. the sfx/ folder shipped with the plugin
// `save` writes to the first of 1 and 2 that is given.
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const BUNDLED = resolve(dirname(fileURLToPath(import.meta.url)), "..", "sfx");
const COLUMNS = ["id", "file", "length", "description", "use", "prompt", "settings", "source"];
const HEADER = [
  "# Sound library",
  "",
  "Generic sound effects for reuse across videos. One row per sound; `file` is relative to this folder.",
  "Generated with ElevenLabs sound-effect models; the `settings` and `source` columns name how each sound was made.",
  "Files are raw at full volume; videos play them at `meta.sound.sfxVolume` (default 0.15).",
  "",
  `| ${COLUMNS.join(" | ")} |`,
  `|${COLUMNS.map(() => "---").join("|")}|`,
].join("\n");

const cell = (s) => String(s ?? "").replace(/\|/g, "/").replace(/\n/g, " ").trim();

export const libraryDirs = (data) => {
  const dirs = [process.env.VIDEO_ENGINEER_SFX_LIBRARY, data, BUNDLED].filter(Boolean).map((d) => resolve(d));
  return [...new Set(dirs)];
};

export const writeDir = (data) => {
  const dir = process.env.VIDEO_ENGINEER_SFX_LIBRARY || data;
  return dir ? resolve(dir) : undefined;
};

const readList = (dir) => {
  const file = join(dir, "soundlist.md");
  if (!existsSync(file)) return [];
  return readFileSync(file, "utf8")
    .split("\n")
    .filter((l) => l.startsWith("|") && !l.startsWith("|---") && !l.startsWith("| id |"))
    .map((l) => {
      const cells = l.slice(1, -1).split("|").map((c) => c.trim());
      return { ...Object.fromEntries(COLUMNS.map((c, i) => [c, cells[i] ?? ""])), dir };
    });
};

export const allSounds = (data) => {
  const seen = new Set();
  return libraryDirs(data)
    .flatMap(readList)
    .filter((s) => !seen.has(s.id) && seen.add(s.id));
};

export const findSound = (id, data) => allSounds(data).find((s) => s.id === id);

export const useSound = (id, dest, data) => {
  const s = findSound(id, data);
  if (!s) return false;
  mkdirSync(dirname(dest), { recursive: true });
  copyFileSync(join(s.dir, s.file), dest);
  return true;
};

// Duration of a CBR mp3 from its size (the library is mp3_44100_128: 16000 bytes per second).
const lengthOf = (file) => `${(statSync(file).size / 16000).toFixed(1)} s`;

const save = (src, id, o) => {
  const dir = writeDir(o.data);
  if (!dir) fail("save needs the plugin setting \"Sound library folder\" or --data <dir>");
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(id)) fail(`id must be lowercase kebab-case: ${id}`);
  if (!existsSync(src)) fail(`missing ${src}`);
  if (!o.description || !o.use || !o.prompt) fail("save needs --description, --use and --prompt");
  if (findSound(id, o.data)) fail(`id ${id} exists in the library; pick another id (for a variant: ${id}-2)`);
  mkdirSync(dir, { recursive: true });
  const file = `${id}.mp3`;
  copyFileSync(src, join(dir, file));
  const list = join(dir, "soundlist.md");
  const before = existsSync(list) ? readFileSync(list, "utf8").replace(/\n*$/, "\n") : `${HEADER}\n`;
  const row = [id, file, lengthOf(src), o.description, o.use, o.prompt, o.settings || "default", o.source || "-"].map(cell);
  writeFileSync(list, `${before}| ${row.join(" | ")} |\n`);
  console.log(`sfx-library: saved ${id} to ${join(dir, file)}`);
};

const fail = (msg) => {
  console.error(`sfx-library: ${msg}`);
  process.exit(1);
};

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [cmd, ...args] = process.argv.slice(2);
  const opt = (n) => (args.includes(n) ? args[args.indexOf(n) + 1] : undefined);
  const pos = args.filter((a, i) => !a.startsWith("--") && !(i > 0 && args[i - 1].startsWith("--")));
  const data = opt("--data");
  if (cmd === "list") {
    const sounds = allSounds(data);
    if (!sounds.length) console.log("sfx-library: empty");
    for (const s of sounds) console.log(`${s.id} | ${s.length} | ${s.description} | use: ${s.use} | ${join(s.dir, s.file)}`);
  } else if (cmd === "use") {
    const [id, dest] = pos;
    if (!id || !dest) fail("usage: sfx-library.mjs use <id> <dest.mp3>");
    if (!useSound(id, dest, data)) fail(`no sound ${id} in the library (run list)`);
    console.log(`sfx-library: ${id} -> ${dest}`);
  } else if (cmd === "save") {
    const [src, id] = pos;
    if (!src || !id) fail("usage: sfx-library.mjs save <file.mp3> <id> --description ... --use ... --prompt ...");
    save(src, id, { data, description: opt("--description"), use: opt("--use"), prompt: opt("--prompt"), settings: opt("--settings"), source: opt("--source") });
  } else {
    fail("usage: sfx-library.mjs list|use|save ...");
  }
}
