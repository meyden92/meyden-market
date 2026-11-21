#!/usr/bin/env node
// Analyses a song for music mode: tempo, beat grid, downbeats, onsets, energy, bands, sections, vocal onsets.
// Run with cwd = the Remotion project root (decodes through `npx remotion ffmpeg`, the only ffmpeg assumed).
// Usage: analyze-music.mjs <audio file> <out.json> [--fps 30] [--plot <out.png>]
// Times are seconds; every event also carries its frame at --fps. Node standard library only.
// Output (JSON): duration, fps, bpm, bpmConfidence, bpmHalves, beats[{t,frame}], downbeats[{t,frame}],
//   onsets[{t,frame,strength}], energy[], bands{low,mid,high}[] (both sampled every `step` = 0.1 s, 0-1),
//   sections[{label,start,end,startFrame,endFrame,energy}], vocalOnsets[{t,frame,strength}].
// vocalOnsets is a heuristic (onsets whose spectral flux sits mostly in 300-3400 Hz, not in the bass), not source separation.
import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";

const args = process.argv.slice(2);
const opt = (n, d) => (args.includes(n) ? args[args.indexOf(n) + 1] : d);
const positional = args.filter((a, i) => !a.startsWith("--") && !["--fps", "--plot"].includes(args[i - 1]));
const [inFile, outFile] = positional;
if (!inFile || !outFile) {
  console.error("Usage: analyze-music.mjs <audio file> <out.json> [--fps 30] [--plot <out.png>]");
  process.exit(1);
}
const FPS = Number(opt("--fps", 30));
const plotFile = opt("--plot");

const SR = 22050, N = 1024, HOP = 256, STEP = 0.1;
const FR = SR / HOP; // onset envelope frames per second

// ---------- decode ----------
const dec = spawnSync("npx", ["remotion", "ffmpeg", "-v", "error", "-i", inFile, "-vn", "-ac", "1", "-ar", String(SR), "-c:a", "pcm_s16le", "-f", "wav", "-"], {
  maxBuffer: 1 << 30,
});
if (dec.status !== 0 || !dec.stdout?.length) {
  console.error(`decode failed: ${dec.stderr?.toString() || dec.error}`);
  process.exit(1);
}
// this ffmpeg build has no raw s16le muxer, so read the wav stream (sizes are unknown on a pipe) and skip to the data chunk
const dataAt = dec.stdout.indexOf("data") + 8;
const pcmBytes = (dec.stdout.length - dataAt) & ~1;
const pcm = new Int16Array(dec.stdout.buffer.slice(dec.stdout.byteOffset + dataAt, dec.stdout.byteOffset + dataAt + pcmBytes));
const duration = pcm.length / SR;

// ---------- helpers ----------
const clamp01 = (x) => Math.max(0, Math.min(1, x));
const quantile = (arr, q) => {
  const s = Float64Array.from(arr).sort();
  return s[Math.min(s.length - 1, Math.floor(q * s.length))] ?? 0;
};
const norm01 = (arr) => {
  const p = quantile(arr, 0.99) || 1;
  return Array.from(arr, (v) => clamp01(v / p));
};
const movAvg = (arr, w) => {
  const out = new Float64Array(arr.length), h = Math.floor(w / 2);
  let sum = 0, lo = 0, hi = -1;
  for (let i = 0; i < arr.length; i++) {
    const a = Math.max(0, i - h), b = Math.min(arr.length - 1, i + h);
    while (hi < b) sum += arr[++hi];
    while (lo < a) sum -= arr[lo++];
    out[i] = sum / (b - a + 1);
  }
  return out;
};
const r = (x, d = 3) => Number(x.toFixed(d));
const fr = (t) => Math.round(t * FPS);

// ---------- STFT, flux ----------
const win = new Float64Array(N);
let winSum = 0;
for (let i = 0; i < N; i++) winSum += win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N);
const cosT = new Float64Array(N / 2), sinT = new Float64Array(N / 2);
for (let i = 0; i < N / 2; i++) { cosT[i] = Math.cos((2 * Math.PI * i) / N); sinT[i] = -Math.sin((2 * Math.PI * i) / N); }
const rev = new Uint16Array(N);
for (let i = 0, bits = Math.log2(N); i < N; i++) { let x = i, y = 0; for (let b = 0; b < bits; b++) { y = (y << 1) | (x & 1); x >>= 1; } rev[i] = y; }
const re = new Float64Array(N), im = new Float64Array(N);
function fft() {
  for (let i = 0; i < N; i++) { const j = rev[i]; if (j > i) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; } }
  for (let size = 2; size <= N; size <<= 1) {
    const half = size >> 1, stride = N / size;
    for (let s = 0; s < N; s += size) {
      for (let k = 0, w = 0; k < half; k++, w += stride) {
        const a = s + k, b = a + half;
        const tr = re[b] * cosT[w] - im[b] * sinT[w], ti = re[b] * sinT[w] + im[b] * cosT[w];
        re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti;
      }
    }
  }
}

const NB = N / 2 + 1, binHz = SR / N;
const bin = (hz) => Math.round(hz / binHz);
const B = { lowLo: bin(40), lowHi: bin(250), midLo: bin(300), midHi: bin(3400), hiLo: bin(3400), hiHi: bin(10000), fluxHi: bin(8000) };
const nFrames = Math.max(0, Math.floor((pcm.length - N) / HOP) + 1);
if (nFrames < 100) { console.error("audio too short"); process.exit(1); }

const flux = new Float64Array(nFrames), fluxLow = new Float64Array(nFrames), fluxMid = new Float64Array(nFrames);
const pLow = new Float64Array(nFrames), pMid = new Float64Array(nFrames), pHigh = new Float64Array(nFrames);
let prev = new Float64Array(NB), cur = new Float64Array(NB);
const scale = 2 / winSum / 32768;
for (let t = 0; t < nFrames; t++) {
  const o = t * HOP;
  for (let i = 0; i < N; i++) { re[i] = pcm[o + i] * win[i]; im[i] = 0; }
  fft();
  let fl = 0, flL = 0, flM = 0, eL = 0, eM = 0, eH = 0;
  for (let k = 0; k < NB; k++) {
    const m = Math.hypot(re[k], im[k]) * scale;
    cur[k] = Math.log1p(m * 1000);
    const p = m * m;
    if (k >= B.lowLo && k <= B.lowHi) eL += p; else if (k >= B.midLo && k < B.midHi) eM += p; else if (k >= B.hiLo && k < B.hiHi) eH += p;
    if (t > 0 && k > 0 && k <= B.fluxHi) {
      // SuperFlux style: compare against the previous frame's local max to ignore vibrato
      const ref = Math.max(prev[k - 1], prev[k], prev[Math.min(NB - 1, k + 1)]);
      const d = cur[k] - ref;
      if (d > 0) {
        fl += d;
        if (k >= B.lowLo && k <= B.lowHi) flL += d; else if (k >= B.midLo && k < B.midHi) flM += d;
      }
    }
  }
  flux[t] = fl; fluxLow[t] = flL; fluxMid[t] = flM; pLow[t] = eL; pMid[t] = eM; pHigh[t] = eH;
  [prev, cur] = [cur, prev];
}

// onset envelope: flux minus its local mean (~0.4 s), rectified
const lm = movAvg(flux, Math.round(0.4 * FR));
const env = new Float64Array(nFrames);
for (let t = 0; t < nFrames; t++) env[t] = Math.max(0, flux[t] - lm[t]);
const frameTime = (t) => (t * HOP + N / 2) / SR;

// ---------- onsets ----------
const envP = quantile(env, 0.98) || 1;
const envMean = env.reduce((a, b) => a + b, 0) / nFrames;
const onsetFrames = [];
{
  const w = 3, minGap = Math.round(0.05 * FR), thr = envMean * 1.5;
  for (let t = w; t < nFrames - w; t++) {
    if (env[t] < thr) continue;
    let isMax = true;
    for (let k = -w; k <= w && isMax; k++) if (k && env[t + k] > env[t] || (k < 0 && env[t + k] === env[t])) isMax = false;
    if (!isMax) continue;
    const last = onsetFrames[onsetFrames.length - 1];
    if (last !== undefined && t - last < minGap) { if (env[t] > env[last]) onsetFrames[onsetFrames.length - 1] = t; continue; }
    onsetFrames.push(t);
  }
}
const onsets = onsetFrames.map((t) => ({ t: r(frameTime(t)), frame: fr(frameTime(t)), strength: r(clamp01(env[t] / envP)) }));

// ---------- tempo ----------
function acfTempo(a, b) {
  const x = env.subarray(a, b), n = x.length;
  let mean = 0; for (const v of x) mean += v; mean /= n;
  const z = Float64Array.from(x, (v) => v - mean);
  const lag = (l) => { let s = 0; for (let i = 0; i + l < n; i++) s += z[i] * z[i + l]; return s / (n - l); };
  const lo = Math.floor((60 / 200) * FR), hi = Math.ceil((60 / 60) * FR) + 1;
  const a0 = lag(0) || 1;
  let best = -Infinity, bl = lo;
  const ac = new Float64Array(hi + 2);
  for (let l = lo - 1; l <= hi + 1; l++) ac[l] = lag(l);
  for (let l = lo; l <= hi; l++) {
    const bpm = (60 * FR) / l;
    const prior = Math.exp(-0.5 * (Math.log2(bpm / 110) / 0.9) ** 2);
    const s = (ac[l] + 0.5 * (ac[2 * l] ?? lag(2 * l))) * prior;
    if (ac[l] >= ac[l - 1] && ac[l] >= ac[l + 1] && s > best) { best = s; bl = l; }
  }
  const y0 = ac[bl - 1], y1 = ac[bl], y2 = ac[bl + 1];
  const den = y0 - 2 * y1 + y2;
  const l = bl + (den < 0 ? (0.5 * (y0 - y2)) / den : 0);
  return { bpm: (60 * FR) / l, period: l, confidence: clamp01(y1 / a0) };
}
const tempo = acfTempo(0, nFrames);
const mid = Math.floor(nFrames / 2);
const bpmHalves = [acfTempo(0, mid), acfTempo(mid, nFrames)].map((h) => r(h.bpm, 1));

// ---------- beat tracking (dynamic programming, Ellis 2007) ----------
const envStd = Math.sqrt(env.reduce((a, b) => a + (b - envMean) ** 2, 0) / nFrames) || 1;
function trackBeats(T) {
  const tight = 100, C = new Float64Array(nFrames), back = new Int32Array(nFrames).fill(-1);
  const lo = Math.round(T / 2), hi = Math.round(2 * T);
  for (let t = 0; t < nFrames; t++) {
    const e = env[t] / envStd;
    let best = 0, bp = -1;
    for (let g = lo; g <= hi; g++) {
      const p = t - g;
      if (p < 0) break;
      const s = C[p] - tight * Math.log(g / T) ** 2;
      if (s > best) { best = s; bp = p; }
    }
    C[t] = e + best; back[t] = bp;
  }
  let end = nFrames - 1, bestC = -Infinity;
  for (let t = nFrames - 1; t >= Math.max(0, nFrames - Math.round(1.5 * T)); t--) if (C[t] > bestC) { bestC = C[t]; end = t; }
  const out = [];
  for (let t = end; t >= 0; t = back[t]) { out.push(t); if (back[t] < 0) break; }
  return out.reverse();
}
let beatFrames = trackBeats(tempo.period);
// refine bpm from the tracked grid; keep the autocorrelation value if the grid disagrees
let bpm = tempo.bpm;
if (beatFrames.length > 8) {
  const spanBpm = (60 * (beatFrames.length - 1)) / ((beatFrames.at(-1) - beatFrames[0]) / FR);
  if (Math.abs(spanBpm - tempo.bpm) / tempo.bpm < 0.04) bpm = spanBpm;
}
const beatT = beatFrames.map(frameTime);
const beats = beatT.map((t) => ({ t: r(t), frame: fr(t) }));

// ---------- downbeats ----------
const accent = beatFrames.map((t) => {
  let s = 0;
  for (let k = -1; k <= 1; k++) s += (env[t + k] ?? 0) / envStd + 2 * ((fluxLow[t + k] ?? 0) / (quantile(fluxLow, 0.98) || 1));
  return s;
});
let phase = 0;
{
  const sums = [0, 0, 0, 0], cnt = [0, 0, 0, 0];
  accent.forEach((a, i) => { sums[i % 4] += a; cnt[i % 4]++; });
  let bestV = -Infinity;
  for (let p = 0; p < 4; p++) { const v = sums[p] / (cnt[p] || 1); if (v > bestV) { bestV = v; phase = p; } }
}
const downbeatT = beatT.filter((_, i) => i % 4 === phase);
const downbeats = downbeatT.map((t) => ({ t: r(t), frame: fr(t) }));

// ---------- energy and bands per 0.1 s ----------
const nSteps = Math.ceil(duration / STEP);
const rmsRaw = new Float64Array(nSteps), lowRaw = new Float64Array(nSteps), midRaw = new Float64Array(nSteps), highRaw = new Float64Array(nSteps);
const spp = Math.round(SR * STEP);
for (let i = 0; i < nSteps; i++) {
  const a = i * spp, b = Math.min(pcm.length, a + spp);
  let s = 0; for (let k = a; k < b; k++) s += pcm[k] * pcm[k];
  rmsRaw[i] = b > a ? Math.sqrt(s / (b - a)) : 0;
}
{
  const cnt = new Float64Array(nSteps);
  for (let t = 0; t < nFrames; t++) {
    const i = Math.min(nSteps - 1, Math.floor(frameTime(t) / STEP));
    lowRaw[i] += pLow[t]; midRaw[i] += pMid[t]; highRaw[i] += pHigh[t]; cnt[i]++;
  }
  for (let i = 0; i < nSteps; i++) if (cnt[i]) { lowRaw[i] = Math.sqrt(lowRaw[i] / cnt[i]); midRaw[i] = Math.sqrt(midRaw[i] / cnt[i]); highRaw[i] = Math.sqrt(highRaw[i] / cnt[i]); }
}
const energy = norm01(rmsRaw), low = norm01(lowRaw), midB = norm01(midRaw), high = norm01(highRaw);

// ---------- sections ----------
const SM = 10; // 1 s smoothing
const feats = [energy, low, midB, high].map((a) => movAvg(a, SM));
const W = 40; // 4 s windows either side of the candidate boundary
const novelty = new Float64Array(nSteps);
for (let i = W; i < nSteps - W; i++) {
  let d = 0;
  for (const f of feats) {
    let l = 0, rr = 0;
    for (let k = 0; k < W; k++) { l += f[i - W + k]; rr += f[i + k]; }
    d += ((rr - l) / W) ** 2;
  }
  novelty[i] = Math.sqrt(d);
}
const minSep = Math.max(6, Math.min(12, duration / 16)); // seconds between boundaries
const maxSections = Math.max(1, Math.min(12, Math.floor(duration / minSep)));
const cands = [];
for (let i = W; i < nSteps - W; i++) {
  let ok = novelty[i] > 0;
  for (let k = -10; k <= 10 && ok; k++) if (k && novelty[i + k] > novelty[i]) ok = false;
  if (ok) cands.push({ t: i * STEP, v: novelty[i] });
}
cands.sort((a, b) => b.v - a.v);
const nMax = cands[0]?.v ?? 0;
const snap = (t) => downbeatT.length ? downbeatT.reduce((b, d) => (Math.abs(d - t) < Math.abs(b - t) ? d : b)) : t;
const bounds = [];
for (const c of cands) {
  if (bounds.length >= maxSections - 1 || c.v < 0.25 * nMax) break;
  const t = snap(c.t);
  if (t < minSep || duration - t < minSep || bounds.some((b) => Math.abs(b - t) < minSep)) continue;
  bounds.push(t);
}
bounds.sort((a, b) => a - b);
const edges = [0, ...bounds, duration];
const mean = (arr, a, b) => { let s = 0, n = 0; for (let i = Math.floor(a / STEP); i < Math.min(arr.length, Math.ceil(b / STEP)); i++) { s += arr[i]; n++; } return n ? s / n : 0; };
const secE = edges.slice(0, -1).map((a, i) => mean(energy, a, edges[i + 1]));
const eMin = Math.min(...secE), eMax = Math.max(...secE);
const rel = secE.map((e) => (eMax > eMin ? (e - eMin) / (eMax - eMin) : 0.5));
const sections = secE.map((e, i) => {
  const n = secE.length;
  let label = rel[i] >= 0.66 ? "high" : rel[i] >= 0.33 ? "mid" : "low";
  if (rel[i] >= 0.66 && i > 0 && rel[i] - rel[i - 1] >= 0.3 && mean(low, edges[i], edges[i + 1]) > mean(low, edges[i - 1], edges[i]) * 1.15) label = "drop";
  const edgeMax = Math.max(20, 0.2 * duration); // intro and outro are short edge sections
  if (n > 1 && i === 0 && rel[i] < 0.6 && edges[1] <= edgeMax) label = "intro";
  if (n > 1 && i === n - 1 && (rel[i] < 0.6 || rel[i] < rel[i - 1] - 0.2) && duration - edges[i] <= edgeMax) label = "outro";
  return { label, start: r(edges[i], 2), end: r(edges[i + 1], 2), startFrame: fr(edges[i]), endFrame: fr(edges[i + 1]), energy: r(e) };
});

// ---------- vocal onsets (heuristic) ----------
const midFl = [];
for (const t of onsetFrames) {
  let m = 0, l = 0;
  for (let k = 0; k <= 3; k++) { m += fluxMid[t + k] ?? 0; l += fluxLow[t + k] ?? 0; }
  midFl.push({ t, m, share: m / (m + l + 1e-9) });
}
const mThr = quantile(midFl.map((o) => o.m), 0.4);
const vocalOnsets = midFl
  .filter((o) => o.share >= 0.65 && o.m >= mThr)
  .map((o) => ({ t: r(frameTime(o.t)), frame: fr(frameTime(o.t)), strength: r(clamp01(env[o.t] / envP)) }));

// ---------- write ----------
const result = {
  source: inFile, duration: r(duration, 2), fps: FPS, step: STEP,
  bpm: r(bpm, 1), bpmConfidence: r(tempo.confidence, 2), bpmHalves,
  beats, downbeats, onsets, energy: energy.map((v) => r(v)),
  bands: { low: low.map((v) => r(v)), mid: midB.map((v) => r(v)), high: high.map((v) => r(v)) },
  sections, vocalOnsets,
};
writeFileSync(outFile, JSON.stringify(result));

// ---------- summary ----------
const gaps = beatT.slice(1).map((t, i) => t - beatT[i]);
const medGap = quantile(gaps, 0.5), badGap = gaps.filter((g) => Math.abs(g - medGap) > 0.15 * medGap).length;
console.log(`${inFile}: ${r(duration, 1)} s, bpm ${r(bpm, 1)} (confidence ${r(tempo.confidence, 2)}, halves ${bpmHalves.join(" / ")}), ${beats.length} beats (${badGap} gaps off by >15%), ${downbeats.length} downbeats, ${onsets.length} onsets, ${vocalOnsets.length} vocal onsets`);
console.log("section  start    end   energy  label");
sections.forEach((s, i) => console.log(`${String(i + 1).padStart(7)}  ${s.start.toFixed(1).padStart(5)}  ${s.end.toFixed(1).padStart(5)}  ${s.energy.toFixed(2).padStart(6)}  ${s.label}`));

// ---------- PNG plot ----------
if (plotFile) {
  const Wd = 1600, Hd = 400, px = Buffer.alloc(Wd * Hd * 3, 18);
  const set = (x, y, c) => { if (x >= 0 && x < Wd && y >= 0 && y < Hd) { const o = (y * Wd + x) * 3; px[o] = c[0]; px[o + 1] = c[1]; px[o + 2] = c[2]; } };
  const rect = (x0, y0, x1, y1, c) => { for (let y = Math.round(y0); y < Math.round(y1); y++) for (let x = Math.round(x0); x < Math.round(x1); x++) set(x, y, c); };
  const X = (t) => (t / duration) * (Wd - 1);
  const colors = { intro: [90, 110, 150], low: [70, 90, 120], mid: [90, 150, 130], high: [220, 170, 60], drop: [230, 70, 70], outro: [120, 90, 150] };
  sections.forEach((s) => { rect(X(s.start) + 1, 0, X(s.end), 22, colors[s.label]); });
  const top = 30, bot = 300;
  const line = (arr, c) => {
    let py = null;
    for (let x = 0; x < Wd; x++) {
      const i = Math.min(arr.length - 1, Math.floor((x / (Wd - 1)) * (arr.length - 1)));
      const y = Math.round(bot - arr[i] * (bot - top));
      const [a, b] = py === null ? [y, y] : [Math.min(py, y), Math.max(py, y)];
      for (let yy = a; yy <= b + 1; yy++) set(x, yy, c);
      py = y;
    }
  };
  const bandAvg = (arr) => Array.from(movAvg(arr, 3));
  line(bandAvg(low), [230, 80, 80]); line(bandAvg(midB), [90, 200, 110]); line(bandAvg(high), [90, 150, 240]); line(energy, [245, 245, 245]);
  const dbSet = new Set(downbeats.map((d) => d.t));
  beats.forEach((b) => { const x = Math.round(X(b.t)); rect(x, dbSet.has(b.t) ? 306 : 314, x + 1, 344, dbSet.has(b.t) ? [255, 220, 80] : [150, 150, 150]); });
  onsets.forEach((o) => { const x = Math.round(X(o.t)); rect(x, 396 - o.strength * 46, x + 1, 396, [140, 120, 200]); });
  bounds.forEach((t) => { for (let y = 22; y < 304; y += 6) rect(X(t), y, X(t) + 2, y + 3, [255, 255, 255]); });
  writeFileSync(plotFile, encodePng(px, Wd, Hd));
}

function encodePng(rgb, w, h) {
  const crcT = new Int32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crcT[n] = c; }
  const crc = (buf) => { let c = -1; for (const b of buf) c = crcT[(c ^ b) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };
  const chunk = (type, data) => {
    const body = Buffer.concat([Buffer.from(type), data]);
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const sum = Buffer.alloc(4); sum.writeUInt32BE(crc(body));
    return Buffer.concat([len, body, sum]);
  };
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) rgb.copy(raw, y * (w * 3 + 1) + 1, y * w * 3, (y + 1) * w * 3);
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}
