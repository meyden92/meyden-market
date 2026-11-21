#!/usr/bin/env node
// Tiles the PNG frames of a folder into one contact sheet, in time order, with the tile
// index drawn in each tile's corner, and writes a text map of index -> frame file.
// Remotion's bundled ffmpeg has no tile, overlay or drawtext filter, so this uses node:zlib only.
// Usage: contact-sheet.mjs <framesDir> <sheet.png> <map.txt> [columns=4] [tileWidth=400] [flags.txt]
// With flags.txt, appends `similar:` lines: pairs of scenes whose middle frames share a layout (24x24 grey
// thumbnails correlate at 0.9 or more, colour ignored), so the critic can see repetition it would miss tile by tile.
// Frame files are named t<seconds>-<sceneid>.png (as frames.sh extracts them). Without any such file, every
// *.png in the folder is used in name order. 8-bit greyscale, grey+alpha, RGB and RGBA PNGs are accepted;
// transparency is composited over black.
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const [dir, sheetPath, mapPath, colsArg, tileArg, flagsPath] = process.argv.slice(2);
if (!dir || !sheetPath || !mapPath) {
  console.error("usage: contact-sheet.mjs <framesDir> <sheet.png> <map.txt> [columns] [tileWidth]");
  process.exit(1);
}
const cols = Number(colsArg ?? 4);
const tileW = Number(tileArg ?? 400);
const GAP = 4;

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

// Decodes to tightly packed RGB; alpha is composited over black.
function decodePng(buf) {
  let pos = 8;
  let w = 0, h = 0, ct = 0;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString("ascii", pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === "IHDR") {
      w = data.readUInt32BE(0);
      h = data.readUInt32BE(4);
      ct = data[9];
      if (data[8] !== 8 || ![0, 2, 4, 6].includes(ct) || data[12] !== 0) throw new Error("expected 8-bit non-interlaced greyscale, grey+alpha, RGB or RGBA PNG");
    } else if (type === "IDAT") idat.push(data);
    pos += 12 + len;
  }
  const bpp = { 0: 1, 2: 3, 4: 2, 6: 4 }[ct];
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = w * bpp;
  const px = Buffer.alloc(stride * h);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)];
    const src = y * (stride + 1) + 1;
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? px[y * stride + x - bpp] : 0;
      const b = y > 0 ? px[(y - 1) * stride + x] : 0;
      const c = x >= bpp && y > 0 ? px[(y - 1) * stride + x - bpp] : 0;
      let v = raw[src + x];
      if (f === 1) v += a;
      else if (f === 2) v += b;
      else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      px[y * stride + x] = v & 0xff;
    }
  }
  if (ct === 2) return { w, h, px };
  const rgb = Buffer.alloc(w * h * 3);
  for (let i = 0; i < w * h; i++) {
    const o = i * bpp;
    const k = ct === 4 ? px[o + 1] / 255 : ct === 6 ? px[o + 3] / 255 : 1;
    const gray = ct === 0 || ct === 4;
    for (let c = 0; c < 3; c++) rgb[i * 3 + c] = Math.round(px[o + (gray ? 0 : c)] * k);
  }
  return { w, h, px: rgb };
}

function encodePng(w, h, px) {
  const stride = w * 3;
  const raw = Buffer.alloc((stride + 1) * h);
  for (let y = 0; y < h; y++) px.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  const chunk = (type, data) => {
    const out = Buffer.alloc(12 + data.length);
    out.writeUInt32BE(data.length, 0);
    out.write(type, 4, "ascii");
    data.copy(out, 8);
    out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
    return out;
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// 3x5 digit font, one 15-bit row-major mask per digit.
const FONT = [0x7b6f, 0x2c97, 0x73e7, 0x73cf, 0x5bc9, 0x79cf, 0x79ef, 0x7249, 0x7bef, 0x7bcf];
function drawIndex(sheet, sw, x0, y0, n) {
  const s = 5;
  const digits = String(n).split("").map(Number);
  const boxW = digits.length * 4 * s + s;
  const boxH = 7 * s;
  for (let y = 0; y < boxH; y++)
    for (let x = 0; x < boxW; x++) sheet.fill(0, ((y0 + y) * sw + x0 + x) * 3, ((y0 + y) * sw + x0 + x) * 3 + 3);
  digits.forEach((d, i) => {
    for (let r = 0; r < 5; r++)
      for (let c = 0; c < 3; c++) {
        if (!((FONT[d] >> (14 - (r * 3 + c))) & 1)) continue;
        for (let dy = 0; dy < s; dy++)
          for (let dx = 0; dx < s; dx++) {
            const o = ((y0 + (r + 1) * s + dy) * sw + x0 + (i * 4 + c) * s + s + dx) * 3;
            sheet[o] = sheet[o + 1] = sheet[o + 2] = 255;
          }
      }
  });
}

const files = fs.readdirSync(dir);
const timed = files.filter((f) => /^t[\d.]+-.+\.png$/.test(f)).sort((a, b) => parseFloat(a.slice(1)) - parseFloat(b.slice(1)));
const frames = timed.length ? timed : files.filter((f) => f.endsWith(".png")).sort();
if (frames.length === 0) {
  console.error(`contact-sheet: no PNG files in ${dir}`);
  process.exit(1);
}

const first = decodePng(fs.readFileSync(path.join(dir, frames[0])));
const tileH = Math.round((tileW * first.h) / first.w);
const rows = Math.ceil(frames.length / cols);
const sw = cols * tileW + (cols + 1) * GAP;
const sh = rows * tileH + (rows + 1) * GAP;
const sheet = Buffer.alloc(sw * sh * 3, 128);

// 24x24 grey thumbnail, area-averaged, for layout comparison.
const THUMB = 24;
const thumbOf = (img) => {
  const t = new Float64Array(THUMB * THUMB);
  for (let ty = 0; ty < THUMB; ty++)
    for (let tx = 0; tx < THUMB; tx++) {
      const y0 = Math.floor((ty * img.h) / THUMB), y1 = Math.max(y0 + 1, Math.floor(((ty + 1) * img.h) / THUMB));
      const x0 = Math.floor((tx * img.w) / THUMB), x1 = Math.max(x0 + 1, Math.floor(((tx + 1) * img.w) / THUMB));
      let sum = 0, n = 0;
      for (let y = y0; y < y1; y += 2)
        for (let x = x0; x < x1; x += 2) {
          const o = (y * img.w + x) * 3;
          sum += 0.299 * img.px[o] + 0.587 * img.px[o + 1] + 0.114 * img.px[o + 2];
          n++;
        }
      t[ty * THUMB + tx] = sum / n;
    }
  return t;
};
const thumbs = [];

frames.forEach((f, i) => {
  const img = decodePng(fs.readFileSync(path.join(dir, f)));
  if (flagsPath) thumbs[i] = thumbOf(img);
  const x0 = GAP + (i % cols) * (tileW + GAP);
  const y0 = GAP + Math.floor(i / cols) * (tileH + GAP);
  for (let y = 0; y < tileH; y++) {
    const sy0 = Math.floor((y * img.h) / tileH);
    const sy1 = Math.max(sy0 + 1, Math.floor(((y + 1) * img.h) / tileH));
    for (let x = 0; x < tileW; x++) {
      const sx0 = Math.floor((x * img.w) / tileW);
      const sx1 = Math.max(sx0 + 1, Math.floor(((x + 1) * img.w) / tileW));
      let r = 0, g = 0, b = 0, n = 0;
      for (let sy = sy0; sy < sy1; sy++)
        for (let sx = sx0; sx < sx1; sx++) {
          const o = (sy * img.w + sx) * 3;
          r += img.px[o]; g += img.px[o + 1]; b += img.px[o + 2]; n++;
        }
      const d = ((y0 + y) * sw + x0 + x) * 3;
      sheet[d] = r / n; sheet[d + 1] = g / n; sheet[d + 2] = b / n;
    }
  }
  drawIndex(sheet, sw, x0, y0, i + 1);
});

fs.writeFileSync(sheetPath, encodePng(sw, sh, sheet));
const lines = frames.map((f, i) => {
  const m = /^t([\d.]+)-(.+)\.png$/.exec(f);
  return m ? `${i + 1}\t${f}\tscene=${m[2]}\tt=${m[1]}s` : `${i + 1}\t${f}`;
});
fs.writeFileSync(mapPath, `# tile index (row-major, ${cols} columns) / frame file / scene / time in the video\n${lines.join("\n")}\n`);
console.log(`contact sheet: ${frames.length} tiles, ${sw}x${sh}, ${sheetPath}`);

if (flagsPath) {
  // One representative frame per scene: the middle of its sampled frames.
  const byScene = new Map();
  frames.forEach((f, i) => {
    const m = /^t[\d.]+-(.+)\.png$/.exec(f);
    if (m) byScene.set(m[1], [...(byScene.get(m[1]) ?? []), i]);
  });
  const reps = [...byScene].map(([id, idx]) => ({ id, i: idx[Math.floor(idx.length / 2)] }));
  const stats = (t) => {
    const mean = t.reduce((a, v) => a + v, 0) / t.length;
    const sd = Math.sqrt(t.reduce((a, v) => a + (v - mean) ** 2, 0) / t.length);
    return { mean, sd };
  };
  const alike = (a, b) => {
    const sa = stats(a), sb = stats(b);
    if (sa.sd < 4 || sb.sd < 4) return sa.sd < 4 && sb.sd < 4 ? 1 : 0;
    let cov = 0;
    for (let k = 0; k < a.length; k++) cov += (a[k] - sa.mean) * (b[k] - sb.mean);
    return cov / a.length / (sa.sd * sb.sd);
  };
  const out = [];
  for (let x = 0; x < reps.length; x++)
    for (let y = x + 1; y < reps.length; y++) {
      const r = alike(thumbs[reps[x].i], thumbs[reps[y].i]);
      if (r >= 0.9) out.push(`similar: ${reps[x].id} ~ ${reps[y].id} share a layout (correlation ${r.toFixed(2)}; ${frames[reps[x].i]}, ${frames[reps[y].i]})`);
    }
  const repeated = new Set(out.flatMap((l) => l.match(/^similar: (\S+) ~ (\S+)/).slice(1)));
  out.push(`layouts: ${reps.length - repeated.size} of ${reps.length} scenes have a layout no other scene shares`);
  fs.appendFileSync(flagsPath, out.join("\n") + "\n");
  console.log(`layout check: ${out.length - 1} similar pair(s), appended to ${flagsPath}`);
}
