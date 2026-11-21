// Song-time helpers: absolute time inside blocks (TimeOffset), band envelopes, beat and onset pulses, event lookups.
// All data comes from the song analysis given to defineMusic(); series are normalised so 1 is a strong hit.
import { createContext, useContext } from "react";
import { useCurrentFrame } from "remotion";
import { Ev, music, SongAnalysis } from "./config";

/** Absolute song frame of the enclosing block/shot's frame 0, so local frames map to song time. */
export const TimeOffset = createContext(0);
export const useAbsFrame = () => useCurrentFrame() + useContext(TimeOffset);
/** Absolute song time in seconds. */
export const useT = () => useAbsFrame() / music().fps;
/** The song's URL, for <Audio src>. */
export const songSrc = () => music().songSrc;

/** The analysis object (beats, downbeats, onsets, vocalOnsets, sections, ...). */
export const MUSIC = new Proxy({} as SongAnalysis, { get: (_, k) => music().song[k as keyof SongAnalysis] });

// Normalise each series by its 97th percentile so 1 ≈ a strong hit.
const norm = (a: number[]) => {
  const s = [...a].sort((x, y) => x - y);
  const p = s[Math.floor(s.length * 0.97)] || 1;
  return a.map((v) => Math.min(1.3, v / p));
};
export type Series = "low" | "mid" | "high" | "energy";

let built: { src: SongAnalysis; series: Record<Series, number[]>; cum: Record<Series, number[]> } | null = null;
const data = () => {
  const S = music().song;
  if (built?.src === S) return built;
  const series = { low: norm(S.bands.low), mid: norm(S.bands.mid), high: norm(S.bands.high), energy: norm(S.energy) };
  const cum = {} as Record<Series, number[]>;
  for (const k of Object.keys(series) as Series[]) {
    const out: number[] = [0];
    for (const v of series[k]) out.push(out[out.length - 1] + v * S.step);
    cum[k] = out;
  }
  built = { src: S, series, cum };
  return built;
};

/** Linear-interpolated series value at time t (0.1 s grid). */
export const at = (name: Series, t: number) => {
  const a = data().series[name];
  const x = Math.max(0, t / music().song.step);
  const i = Math.floor(x);
  const u = x - i;
  return (a[Math.min(i, a.length - 1)] ?? 0) * (1 - u) + (a[Math.min(i + 1, a.length - 1)] ?? 0) * u;
};
/** Smoothed value (box average over ±w seconds). */
export const smooth = (name: Series, t: number, w = 0.25) => {
  let s = 0;
  const n = 5;
  for (let k = -n; k <= n; k++) s += at(name, t + (k / n) * w);
  return s / (2 * n + 1);
};
/** Integral of a series from 0 to t (for audio-driven rotation/scroll that never runs backwards). */
export const integral = (name: Series, t: number) => {
  const c = data().cum[name];
  const x = Math.max(0, t / music().song.step);
  const i = Math.min(Math.floor(x), c.length - 2);
  return c[i] + (c[i + 1] - c[i]) * (x - i);
};

const lastBefore = (list: Ev[], t: number, minS = 0) => {
  let lo = 0;
  let hi = list.length - 1;
  let best = -1;
  while (lo <= hi) {
    const m = (lo + hi) >> 1;
    if (list[m].t <= t) {
      best = m;
      lo = m + 1;
    } else hi = m - 1;
  }
  if (minS > 0) while (best >= 0 && (list[best].strength ?? 1) < minS) best--;
  return best;
};
/** Seconds since the last event at or before t (Infinity if none). */
export const since = (list: Ev[], t: number, minS = 0) => {
  const i = lastBefore(list, t, minS);
  return i < 0 ? Infinity : t - list[i].t;
};
export const pulse = (list: Ev[], t: number, decay = 0.12, minS = 0) => Math.exp(-since(list, t, minS) / decay);
export const beatPulse = (t: number, decay = 0.12) => pulse(music().song.beats, t, decay);
export const downbeatPulse = (t: number, decay = 0.2) => pulse(music().song.downbeats, t, decay);
export const onsetHit = (t: number, minS = 0.5, decay = 0.1) => pulse(music().song.onsets, t, decay, minS);
/** Number of beats at or before t. */
export const beatIndex = (t: number) => lastBefore(music().song.beats, t) + 1;
export const downbeatIndex = (t: number) => lastBefore(music().song.downbeats, t) + 1;
export const downbeatsIn = (a: number, b: number) => music().song.downbeats.filter((d) => d.t >= a - 1e-3 && d.t < b).map((d) => d.t);
export const vocalOnsetsIn = (a: number, b: number, minS = 0) => music().song.vocalOnsets.filter((d) => d.t >= a && d.t <= b && (d.strength ?? 1) >= minS);
/** Low-band hits (local maxima above thr) between a and b, for crack growth, stamps etc. */
export const lowHits = (a: number, b: number, thr = 0.75) => {
  const out: number[] = [];
  const v = data().series.low;
  const step = music().song.step;
  for (let i = Math.max(1, Math.floor(a / step)); i < Math.min(v.length - 1, b / step); i++) if (v[i] > thr && v[i] >= v[i - 1] && v[i] > v[i + 1]) out.push(i * step);
  return out;
};
/** Start of the first music section with this label inside [a,b), e.g. the bass drop in a chorus. */
export const sectionStartIn = (label: string, a: number, b: number) => music().song.sections.find((s) => s.label === label && s.start > a && s.start < b)?.start;
