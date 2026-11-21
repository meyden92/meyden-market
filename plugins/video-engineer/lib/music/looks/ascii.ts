// ascii: terminal. Every plate is a grid of monospace glyphs (" .:-=+*#%@" by brightness) sampled from a canvas glyph atlas,
// phosphor accent on ink with the brightest cells in paper, taller-than-wide cells, a few glyphs flipping per frame.
// Refrain: flat emissive phosphor face, dark sides. Overlay: very faint scanlines.
import React from "react";
import * as THREE from "three";
import { AbsoluteFill } from "remotion";
import { shadedMaterial } from "./materials";
import type { Look } from "./types";

const RAMP = " .:-=+*#%@";
const NOISE = "01/\\|<>?";
const CELL_W = 36;
const CELL_H = 60;

/** One row of glyph cells: the ten brightness glyphs, then the flicker set. */
const glyphAtlas = () => {
  const chars = RAMP + NOISE;
  const c = document.createElement("canvas");
  c.width = CELL_W * chars.length;
  c.height = CELL_H;
  const g = c.getContext("2d")!;
  g.fillStyle = "#000";
  g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = "#fff";
  g.font = `bold ${CELL_H - 12}px Menlo, "DejaVu Sans Mono", "Courier New", monospace`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  [...chars].forEach((ch, i) => g.fillText(ch, i * CELL_W + CELL_W / 2, CELL_H / 2 + 2));
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.NoColorSpace;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.needsUpdate = true;
  return { glyphs: t };
};

const plate = /* glsl */ `
vec4 plate(vec2 uv) {
  vec2 q = uv * cells;
  vec2 id = floor(q);
  vec2 f = fract(q);
  vec2 cuv = (id + 0.5) / cells;
  float r = max(0.35 / (cells.y * texel.y), 1.0);
  float l = clamp(luma(blur(cuv, r)) * gain, 0.0, 1.0);
  float b = pow(smoothstep(0.08, 0.92, l), 1.5);
  float idx = floor(b * 9.999);

  // a few cells flip to a random glyph, ten times a second; the high band shakes more of them
  float tick = floor(uTime * 10.0);
  float h = hash(id + tick * 17.3);
  float flip = step(h, flipRate + jitter * 0.1) * step(0.05, b);
  idx = mix(idx, 10.0 + floor(hash(id + tick * 3.1 + 7.0) * 8.0), flip);
  f.x += (hash(id + tick) - 0.5) * jitter * 0.12;

  float g = texture2D(glyphs, vec2((idx + clamp(f.x, 0.03, 0.97)) / 18.0, f.y)).r;
  g *= step(0.0, f.x) * step(f.x, 1.0);

  vec3 glyphCol = mix(accentCol, paperCol, smoothstep(0.8, 0.95, b));
  glyphCol = mix(glyphCol, popCol, step(0.988, hash(id + 41.0)) * step(0.15, b));
  vec3 col = inkCol + accentCol * 0.03 * b;
  col += glyphCol * g * (0.4 + 1.0 * b);
  return vec4(col, 1.0);
}`;

const front = /* glsl */ `
vec3 shade(vec3 n, vec3 p) {
  return accentCol * (1.5 + 0.2 * vnoise(p.xy * 9.0)) + paperCol * 0.12;
}`;

const side = /* glsl */ `
vec3 shade(vec3 n, vec3 p) {
  float k = dot(n, normalize(vec3(-0.6, 0.6, 0.5)));
  return mix(inkCol, accentCol, 0.05 + 0.1 * smoothstep(0.2, 0.9, k));
}`;

/** Very faint scanlines and a slow bright band rolling down the frame. */
const Overlay: NonNullable<Look["overlay"]> = ({ frame, height }) =>
  React.createElement(
    React.Fragment,
    null,
    React.createElement(AbsoluteFill, { style: { background: "repeating-linear-gradient(0deg, rgba(0,0,0,0.1) 0px, rgba(0,0,0,0.1) 1px, transparent 1px, transparent 3px)" } }),
    React.createElement(AbsoluteFill, {
      style: { background: `linear-gradient(180deg, transparent, rgba(255,255,255,0.025), transparent)`, height: height * 0.18, top: ((frame * 3) % (height * 1.3)) - height * 0.18 },
    }),
  );

export const ascii: Look = {
  id: "ascii",
  label: "ASCII terminal",
  summary: "Everything drawn as phosphor text in the accent colour on a dark terminal: monospace glyphs picked by brightness, a few flipping each frame, faint scanlines.",
  art: "Plain art with strong value contrast and big readable shapes; faces and silhouettes survive best. No ASCII, text or terminal look in the prompt.",
  palette: { ink: "#030A05", paper: "#D9FFE4", accent: "#2BE86A", pop: "#FFB000" },
  effects: "allowed",
  density: 70,
  cellAspect: 0.6,
  plate,
  params: { flipRate: 0.03 },
  textures: glyphAtlas,
  refrain: (p) => ({ front: shadedMaterial(p, front), side: shadedMaterial(p, side) }),
  post: { bloom: 0.7, bloomThreshold: 0.85, ca: 0, noise: 0.03, vignette: 0.3 },
  overlay: Overlay,
  lyricShadow: (p) => `0 0 6px rgba(0,0,0,0.95), 0 0 16px color-mix(in srgb, ${p.accent} 40%, transparent), 2px 2px 0 rgba(0,0,0,0.9), 0 0 30px rgba(0,0,0,0.7)`,
};
