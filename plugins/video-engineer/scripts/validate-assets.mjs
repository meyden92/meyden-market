#!/usr/bin/env node
// Validate the PNG and WebM assets of one video against the asset contract. Node stdlib only.
// Run with cwd = the Remotion project root.
//   validate-assets.mjs <slug>
// Narrated videos list assets in videos/<slug>/scenes.json (scenes[].assets[]); music videos in
// videos/<slug>/assets.json ({ width, height, assets: [{ file, owner, layer, prompt, scale?, status }] },
// owner = a block id from blocks.json or "shared"). Writes each asset's status (valid | invalid; pending when
// the file is missing) back into that file and videos/<slug>/research/asset-report.md. Exit 1 when any asset fails.
// Rules (see skills/asset-contract):
//   file name      public/img/<owner>-<name>.png, lowercase kebab name, owner = owning scene id (s02) or, in a
//                  music video, block id or "shared"; screencast: public/video/<sceneid>-<name>.webm
//   format         real PNG: signature, IHDR, chunk walk to IEND; screencast: WebM (EBML header)
//   alpha          layers subject and overlay: color type 4 or 6, or a tRNS chunk
//   size           scale = the asset's scale (1 to 2, default 1): the largest magnification the video applies to it
//                  background: width >= ceil(scale * width) and height >= ceil(scale * height)
//                  subject, overlay: longer side >= ceil(scale * min(width, height))
//                  screenshot: no size rule
//   unique         no two files in public/img share a content hash (an image generator can return one image for two
//                  prompts, or an image from another session)
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const slug = process.argv[2];
if (!slug) {
  console.error("usage: validate-assets.mjs <slug>");
  process.exit(1);
}
const musicPath = join("videos", slug, "assets.json");
const music = existsSync(join("videos", slug, "blocks.json"));
const manifestPath = music ? musicPath : join("videos", slug, "scenes.json");
if (!existsSync(manifestPath)) {
  console.error(`missing ${manifestPath}`);
  process.exit(1);
}
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
// One shape for both: canvas and [owner, asset] pairs.
const canvas = music ? { width: manifest.width, height: manifest.height } : { width: manifest.meta.width, height: manifest.meta.height };
if (!canvas.width || !canvas.height) {
  console.error(`${manifestPath}: needs width and height`);
  process.exit(1);
}
const blockIds = music ? JSON.parse(readFileSync(join("videos", slug, "blocks.json"), "utf8")).blocks.map((b) => b.id) : [];
const owned = music
  ? manifest.assets.map((a) => [a.owner, a])
  : manifest.scenes.flatMap((s) => s.assets.map((a) => [s.id, a]));

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

// Returns { width, height, colorType, trns } or { error }.
const parsePng = (buf) => {
  if (buf.length < 33 || !buf.subarray(0, 8).equals(SIGNATURE)) return { error: "not a PNG (bad signature)" };
  let pos = 8;
  let ihdr;
  let trns = false;
  let iend = false;
  while (pos + 8 <= buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString("latin1", pos + 4, pos + 8);
    if (pos + 12 + len > buf.length) return { error: `truncated ${type} chunk` };
    if (type === "IHDR") {
      if (len !== 13) return { error: "bad IHDR length" };
      ihdr = {
        width: buf.readUInt32BE(pos + 8),
        height: buf.readUInt32BE(pos + 12),
        colorType: buf[pos + 17],
      };
    } else if (type === "tRNS") trns = true;
    else if (type === "IEND") {
      iend = true;
      break;
    }
    pos += 12 + len;
  }
  if (!ihdr) return { error: "IHDR chunk missing" };
  if (!iend) return { error: "IEND chunk missing (truncated file)" };
  return { ...ihdr, trns };
};

const NAME = music ? /^public\/img\/([a-z][a-z0-9]*)-([a-z0-9]+(?:-[a-z0-9]+)*)\.png$/ : /^public\/img\/(s\d{2,3})-([a-z0-9]+(?:-[a-z0-9]+)*)\.png$/;
const VIDEO_NAME = /^public\/video\/(s\d{2,3})-([a-z0-9]+(?:-[a-z0-9]+)*)\.webm$/;
const EBML = Buffer.from([0x1a, 0x45, 0xdf, 0xa3]);
const needsAlpha = (layer) => layer === "subject" || layer === "overlay";
const minSize = ({ layer, scale = 1 }) => {
  const [w, h, side] = [canvas.width, canvas.height, Math.min(canvas.width, canvas.height)].map((n) => Math.ceil(scale * n));
  if (layer === "background") return { w, h, text: `>= ${w}x${h} (scale ${scale})` };
  if (needsAlpha(layer)) return { long: side, text: `longer side >= ${side} (scale ${scale})` };
  return undefined;
};

const rows = [];
const failures = [];

const sha = (file) => createHash("sha256").update(readFileSync(file)).digest("hex");
const byHash = new Map();
const hashOf = new Map();
if (existsSync("public/img"))
  for (const f of readdirSync("public/img").filter((n) => n.endsWith(".png"))) {
    const h = sha(join("public/img", f));
    hashOf.set(`public/img/${f}`, h);
    byHash.set(h, [...(byHash.get(h) ?? []), `public/img/${f}`]);
  }

for (const [owner, asset] of owned) {
  const row = { scene: owner, file: asset.file, layer: asset.layer, size: "-", alpha: "-", result: "valid", reason: "" };
  const reasons = [];
  let missing = false;

  const video = asset.layer === "screencast";
  const m = asset.file.match(video ? VIDEO_NAME : NAME);
  if (music && owner !== "shared" && !blockIds.includes(owner)) reasons.push(`owner ${owner} is not a block id in blocks.json or "shared"`);
  if (!m) reasons.push(video ? "name must match public/video/<sceneid>-<name>.webm (lowercase kebab)" : `name must match public/img/<${music ? "blockid|shared" : "sceneid"}>-<name>.png (lowercase kebab)`);
  else if (m[1] !== owner) reasons.push(`name prefix ${m[1]} does not match owner ${owner}`);

  if (!existsSync(asset.file)) {
    missing = true;
    reasons.push("file missing");
  } else if (video) {
    if (!readFileSync(asset.file).subarray(0, 4).equals(EBML)) reasons.push("not a WebM file (bad EBML header)");
  } else {
    const twins = (byHash.get(hashOf.get(asset.file) ?? sha(asset.file)) ?? []).filter((f) => f !== asset.file);
    if (twins.length) reasons.push(`identical content to ${twins.join(", ")}`);
    const png = parsePng(readFileSync(asset.file));
    if (png.error) reasons.push(png.error);
    else {
      const hasAlpha = png.colorType === 4 || png.colorType === 6 || png.trns;
      row.size = `${png.width}x${png.height}`;
      row.alpha = hasAlpha ? "yes" : "no";
      if (needsAlpha(asset.layer) && !hasAlpha) reasons.push(`no alpha channel on ${asset.layer} layer`);
      const rule = minSize(asset);
      if (rule) {
        const ok = rule.long
          ? Math.max(png.width, png.height) >= rule.long
          : png.width >= rule.w && png.height >= rule.h;
        if (!ok) reasons.push(`too small: ${png.width}x${png.height}, needs ${rule.text}`);
      }
    }
  }

  if (reasons.length) {
    row.result = missing ? "missing" : "invalid";
    row.reason = reasons.join("; ");
    failures.push(`${owner} ${asset.file}: ${row.reason}`);
  }
  asset.status = reasons.length ? (missing ? "pending" : "invalid") : "valid";
  rows.push(row);
}

writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");

const report = [
  `# Asset report: ${slug}`,
  "",
  `Canvas ${canvas.width}x${canvas.height}. ${rows.length - failures.length} of ${rows.length} assets valid.`,
  "",
  `| ${music ? "Owner" : "Scene"} | File | Layer | Size | Alpha | Result | Reason |`,
  "|---|---|---|---|---|---|---|",
  ...rows.map((r) => `| ${r.scene} | ${r.file} | ${r.layer} | ${r.size} | ${r.alpha} | ${r.result} | ${r.reason || "-"} |`),
  "",
].join("\n");
const reportPath = join("videos", slug, "research", "asset-report.md");
mkdirSync(join("videos", slug, "research"), { recursive: true });
writeFileSync(reportPath, report);

console.log(`${rows.length - failures.length}/${rows.length} assets valid; report: ${reportPath}`);
if (failures.length) {
  console.error(`FAILED (${failures.length}):`);
  for (const f of failures) console.error(`  ${f}`);
  process.exit(1);
}
