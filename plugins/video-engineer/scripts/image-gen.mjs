#!/usr/bin/env node
// Image assets of a video-engineer video through the fal MCP. Node stdlib only. It never calls a paid API:
// `plan` prints each image call still needed as one JSON line, Claude runs them with the fal MCP, `save` downloads
// what came back. Run with cwd = the Remotion project root.
//   image-gen.mjs plan <slug> [--scene <id>] [--force]    pending images (all generated layers with --force)
//   image-gen.mjs save <slug> <file> --url <url>          download one result to <file>, status delivered
// Narrated videos list assets in videos/<slug>/scenes.json, music videos in videos/<slug>/assets.json
// (--scene is the owning block id there). The size requested is the asset's size rule (asset-contract: canvas x
// the asset's scale), rounded up to multiples of 16; backgrounds keep the canvas aspect, subjects and overlays
// are square. Model limits (GPT Image 2.5 on fal): edges up to 3840, 655,360 to 8,294,400 pixels, aspect <= 3:1.
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const ENDPOINT = "openai/gpt-image-2.5/flare/text-to-image";
const MAX_EDGE = 3840;
const MIN_PIXELS = 655360;
const MAX_PIXELS = 8294400;
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const [cmd, slug, ...argv] = process.argv.slice(2);
const flag = (n) => argv.includes(n);
const opt = (n) => (argv.includes(n) ? argv[argv.indexOf(n) + 1] : undefined);
const die = (msg) => {
  console.error(`image-gen: ${msg}`);
  process.exit(1);
};
const usage = "usage: image-gen.mjs plan <slug> [--scene <id>] [--force] | save <slug> <file> --url <url>";
if (!["plan", "save"].includes(cmd) || !slug || slug.startsWith("--")) die(usage);

const music = existsSync(join("videos", slug, "blocks.json"));
const manifestPath = join("videos", slug, music ? "assets.json" : "scenes.json");
if (!existsSync(manifestPath)) die(`missing ${manifestPath}; run from the Remotion project root`);
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const canvas = music ? manifest : manifest.meta;
const sheet = music ? "" : manifest.meta.style.sheet;
const owned = music ? manifest.assets.map((a) => [a.owner, a]) : manifest.scenes.flatMap((s) => s.assets.map((a) => [s.id, a]));
const generated = (layer) => ["background", "subject", "overlay"].includes(layer);

const up16 = (n) => Math.ceil(n / 16) * 16;
// The smallest size the model accepts that meets the asset's size rule, or an error.
const sizeFor = (asset) => {
  const scale = asset.scale ?? 1;
  const side = up16(scale * Math.min(canvas.width, canvas.height));
  let [w, h] = asset.layer === "background" ? [up16(scale * canvas.width), up16(scale * canvas.height)] : [side, side];
  if (w * h < MIN_PIXELS) {
    const k = Math.sqrt(MIN_PIXELS / (w * h));
    [w, h] = [up16(w * k), up16(h * k)];
  }
  if (Math.max(w, h) > MAX_EDGE || w * h > MAX_PIXELS || Math.max(w, h) / Math.min(w, h) > 3)
    return { error: `needs ${w}x${h} (scale ${scale}); the model allows edges up to ${MAX_EDGE}, ${MAX_PIXELS} pixels and 3:1` };
  return { width: w, height: h };
};

if (cmd === "plan") {
  const only = opt("--scene");
  if (only && !owned.some(([o]) => o === only)) die(`no ${music ? "owner" : "scene"} ${only} in ${manifestPath}`);
  const todo = owned.filter(([o, a]) => generated(a.layer) && (!only || o === only) && (flag("--force") || a.status === "pending"));
  const sized = todo.map(([owner, a]) => ({ owner, a, size: sizeFor(a) }));
  const failed = sized.filter((s) => s.size.error);
  if (failed.length) die(`cannot reach the size rule:\n${failed.map((s) => `  ${s.a.file}: ${s.size.error}`).join("\n")}\nLower the asset's scale or deliver the file by hand.`);
  for (const { owner, a, size } of sized) {
    const transparent = a.layer !== "background";
    console.log(
      JSON.stringify({
        file: a.file,
        owner,
        endpoint_id: ENDPOINT,
        input: {
          prompt: sheet ? `${sheet}\n\n${a.prompt}` : a.prompt,
          image_size: size,
          background: transparent ? "transparent" : "opaque",
          output_format: "png",
          num_images: 1,
        },
      }),
    );
  }
  if (!sized.length) console.log("nothing to generate");
}

if (cmd === "save") {
  const file = argv.find((a, i) => !a.startsWith("--") && argv[i - 1] !== "--url");
  const url = opt("--url");
  if (!file || !url) die(usage);
  const entry = owned.find(([, a]) => a.file === file);
  if (!entry) die(`${file} is not an asset in ${manifestPath}`);
  const res = await fetch(url).catch((e) => die(`${file}: ${e.message}`));
  if (!res.ok) die(`${file}: HTTP ${res.status} for ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (!buf.subarray(0, 8).equals(PNG)) die(`${file}: the result is not a PNG`);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, buf);
  entry[1].status = "delivered";
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
  const size = `${buf.readUInt32BE(16)}x${buf.readUInt32BE(20)}`;
  const log = join("videos", slug, "research", "decisions.md");
  mkdirSync(dirname(log), { recursive: true });
  appendFileSync(log, `- ${new Date().toISOString().slice(0, 10)} image-gen ${file}: ${ENDPOINT} ${size}\n`);
  console.log(`${file}: saved (${size})`);
}
