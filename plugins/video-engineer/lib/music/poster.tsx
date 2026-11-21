// PosterWord: huge flat "poster cut-out" type with the scene visible through the letters, offset shadow and halftone edge.
// A full-frame overlay for rare accents; lines are fitted to the given width in the lyric font.
import React, { useLayoutEffect, useRef } from "react";
import { AbsoluteFill, Easing, interpolate } from "remotion";
import { music } from "./config";
import { F } from "./fonts";
import { useT } from "./audio";
import { usePalette } from "./looks";
import type { Palette } from "./looks/types";

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const SHADOW = [30, 26] as const;

type Layout = { text: string; fs: number; baseline: number }[];

const drawText = (g: CanvasRenderingContext2D, ox: number, oy: number, layout: Layout) => {
  const { width: W } = music();
  g.textAlign = "center";
  g.textBaseline = "alphabetic";
  for (const l of layout) {
    g.font = `${F.bold} ${l.fs}px "${F.lyric}"`;
    g.fillText(l.text, W / 2 + ox, l.baseline + oy);
  }
};

/** Every line fitted to `width`, stacked on cap height + `gap`, centred on `cy`. */
const layoutLines = (lines: string[], width: number, gap: number, cy: number): Layout => {
  const m = document.createElement("canvas").getContext("2d")!;
  const fit = lines.map((text) => {
    m.font = `${F.bold} 100px "${F.lyric}"`;
    const fs = (100 * width) / m.measureText(text).width;
    m.font = `${F.bold} ${fs}px "${F.lyric}"`;
    return { text, fs, asc: m.measureText(text).actualBoundingBoxAscent };
  });
  const total = fit.reduce((s, f) => s + f.asc, 0) + gap * (fit.length - 1);
  let y = cy - total / 2;
  return fit.map((f) => {
    y += f.asc;
    const o = { text: f.text, fs: f.fs, baseline: y };
    y += gap;
    return o;
  });
};

/**
 * Ink sheet with the lines knocked out (the scene shows through), a solid red offset print shadow and a
 * halftone dot fringe around the cut edge, all on one canvas.
 */
const renderPoster = (layout: Layout, C: Palette) => {
  const { width: W, height: H } = music();
  const cv = document.createElement("canvas");
  cv.width = W;
  cv.height = H;
  const g = cv.getContext("2d")!;
  // ink sheet + faint red screen that thickens toward the bottom
  g.fillStyle = C.ink;
  g.globalAlpha = 0.86;
  g.fillRect(0, 0, W, H);
  g.globalAlpha = 1;
  const dotsAt = (draw: (x: number, y: number, r: number) => void, step: number, a: number, field: (x: number, y: number) => number) => {
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    for (let i = -80; i < 160; i++)
      for (let j = -80; j < 160; j++) {
        const x = (i * ca - j * sa) * step + W / 2;
        const yy = (i * sa + j * ca) * step + H / 2;
        if (x < -step || x > W + step || yy < -step || yy > H + step) continue;
        const v = field(x, yy);
        if (v > 0.02) draw(x, yy, Math.sqrt(v) * step * 0.62);
      }
  };
  const dot = (x: number, yy: number, r: number) => {
    g.beginPath();
    g.arc(x, yy, r, 0, 7);
    g.fill();
  };
  g.fillStyle = C.accent;
  g.globalAlpha = 0.9;
  dotsAt(dot, 15, 0.26, (_x, yy) => Math.max(0, (yy / H - 0.45) * 0.5));
  g.globalAlpha = 1;
  // red offset shadow, then punch the letters through both layers
  g.fillStyle = C.accent;
  drawText(g, SHADOW[0], SHADOW[1], layout);
  g.globalCompositeOperation = "destination-out";
  g.fillStyle = "#000";
  drawText(g, 0, 0, layout);
  g.globalCompositeOperation = "source-over";
  // halftone fringe on the cut edge: dots sized by the blurred letter mask, only outside letters and shadow
  const mask = (ox: number, oy: number, blur: number) => {
    const c = document.createElement("canvas");
    c.width = W;
    c.height = H;
    const mg = c.getContext("2d")!;
    mg.filter = blur ? `blur(${blur}px)` : "none";
    mg.fillStyle = "#fff";
    drawText(mg, ox, oy, layout);
    return mg.getImageData(0, 0, W, H).data;
  };
  const soft = mask(0, 0, 13);
  const hard = mask(0, 0, 0);
  const shadow = mask(SHADOW[0], SHADOW[1], 0);
  const A = (d: Uint8ClampedArray, x: number, yy: number) => d[((Math.round(yy) * W + Math.round(x)) << 2) + 3] / 255;
  g.fillStyle = C.paper;
  dotsAt(dot, 10, 0.785, (x, yy) => {
    const xi = Math.min(W - 1, Math.max(0, x));
    const yi = Math.min(H - 1, Math.max(0, yy));
    if (A(hard, xi, yi) > 0.3 || A(shadow, xi, yi) > 0.3) return 0;
    return Math.min(1, A(soft, xi, yi) * 1.7);
  });
  return cv;
};

const cache = new Map<string, HTMLCanvasElement>();

/**
 * "Poster cut-out": huge flat lyric face in its bold weight with the scene visible through the letters, a red offset
 * shadow and a halftone edge. A full-frame overlay: place it above the scene. Times are absolute song seconds.
 */
export const PosterWord: React.FC<{
  /** One entry per stacked line, e.g. ["LÄUFT", "BEI UNS"]; each is fitted to `width`. */
  lines: string[];
  /** Visible from `from` until `to` (seconds). */
  from: number;
  to: number;
  /** Absolute time each line appears, same order as `lines`; default: all at `from`. */
  lineAt?: number[];
  /** Line width in px (default 90% of the frame). */
  width?: number;
  /** Gap between lines in px. */
  gap?: number;
  /** Vertical centre of the block in px (default frame centre). */
  centerY?: number;
}> = ({ lines, from, to, lineAt, width: widthProp, gap = 40, centerY: centerYProp }) => {
  const { width: W, height: H } = music();
  const palette = usePalette();
  const width = widthProp ?? W * 0.9;
  const centerY = centerYProp ?? H / 2 + 6;
  const t = useT();
  const ref = useRef<HTMLCanvasElement>(null);
  const shown = lines.filter((_, i) => t >= (lineAt?.[i] ?? from) - 0.02);
  const key = `${shown.join("|")}@${width}/${gap}/${centerY}/${Object.values(palette).join()}`;
  useLayoutEffect(() => {
    if (!shown.length || !ref.current) return;
    // the lines already on screen keep their fitted size and position: lay out the full set, draw the visible ones
    const full = layoutLines(lines, width, gap, centerY);
    const layout = full.filter((l) => shown.includes(l.text));
    if (!cache.has(key)) cache.set(key, renderPoster(layout, palette));
    const g = ref.current.getContext("2d")!;
    g.clearRect(0, 0, W, H);
    g.drawImage(cache.get(key)!, 0, 0);
  }, [key]);
  const k = interpolate(t, [from - 0.02, from + 0.1], [0, 1], { ...clamp, easing: Easing.out(Easing.back(2)) });
  const o = t >= to ? 0 : interpolate(t, [from - 0.02, from + 0.03], [0, 1], clamp) * interpolate(t, [to - 0.1, to], [1, 0], clamp);
  return (
    <AbsoluteFill style={{ opacity: o, transform: `scale(${interpolate(k, [0, 1], [1.12, 1])})`, pointerEvents: "none" }}>
      <canvas ref={ref} width={W} height={H} style={{ width: W, height: H }} />
    </AbsoluteFill>
  );
};
