// Canvas texture helpers: rnd (seeded scatter), canvasTex, stickerTexture (diegetic word sticker), blobTexture (soft shadow/glow).
import * as THREE from "three";
import { random } from "remotion";

const canvas = (w: number, h: number) => {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return [c, c.getContext("2d")!] as const;
};

/** Canvas as an sRGB texture. */
export const canvasTex = (c: HTMLCanvasElement, repeatX = 1) => {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (repeatX !== 1) {
    t.wrapS = THREE.RepeatWrapping;
    t.repeat.set(repeatX, 1);
  }
  t.needsUpdate = true;
  return t;
};

/** Seeded scatter helper. */
export const rnd = (seed: string, i: number, lo = 0, hi = 1) => lo + (hi - lo) * random(`${seed}-${i}`);

export type StickerShape = "pill" | "rect" | "tag";
/** Word sticker with rounded shape, outline and optional small caption. Returns texture and aspect. Use only where a sticker exists in the scene. */
export const stickerTexture = (o: {
  text: string;
  font: string;
  fg: string;
  bg: string;
  outline?: string;
  shape?: StickerShape;
  italic?: boolean;
  weight?: string;
  caption?: string;
  captionFont?: string;
  upper?: boolean;
}) => {
  const fs = 160;
  const [, mg] = canvas(8, 8);
  const fontStr = `${o.italic ? "italic " : ""}${o.weight ?? "400"} ${fs}px ${o.font}`;
  mg.font = fontStr;
  const text = o.upper ? o.text.toUpperCase() : o.text;
  const tw = mg.measureText(text).width;
  const padX = fs * 0.45;
  const padY = fs * 0.22;
  const capH = o.caption ? fs * 0.22 : 0;
  const w = Math.ceil(tw + padX * 2);
  const h = Math.ceil(fs * 1.12 + padY * 2 + capH);
  const [c, g] = canvas(w + 24, h + 24);
  g.translate(12, 12);
  const r = o.shape === "rect" ? fs * 0.12 : o.shape === "tag" ? fs * 0.3 : h / 2;
  g.beginPath();
  g.roundRect(0, 0, w, h, r);
  g.fillStyle = o.bg;
  g.fill();
  if (o.outline) {
    g.lineWidth = 8;
    g.strokeStyle = o.outline;
    g.stroke();
  }
  if (o.shape === "tag") {
    g.beginPath();
    g.arc(fs * 0.28, h / 2, fs * 0.07, 0, Math.PI * 2);
    g.fillStyle = o.fg;
    g.fill();
  }
  g.fillStyle = o.fg;
  g.font = fontStr;
  g.textBaseline = "middle";
  g.textAlign = "center";
  g.fillText(text, w / 2 + (o.shape === "tag" ? fs * 0.12 : 0), padY + fs * 0.6);
  if (o.caption) {
    g.font = `500 ${fs * 0.15}px ${o.captionFont}`;
    g.globalAlpha = 0.75;
    g.fillText(o.caption, w / 2, h - capH * 0.9);
  }
  return { texture: canvasTex(c), aspect: (w + 24) / (h + 24) };
};

/** Soft radial blob (contact shadow / glow). */
export const blobTexture = (color: string) => {
  const [c, g] = canvas(256, 256);
  const gr = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  gr.addColorStop(0, color);
  gr.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = gr;
  g.fillRect(0, 0, 256, 256);
  return canvasTex(c);
};
