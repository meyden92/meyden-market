// vhs: camcorder tape. Plates keep sharp luma but smear soft chroma to the right and sit in a washed, lifted grade. The screen pass
// adds per-line jitter, a rolling tracking band, RGB offset and head-switching noise at the bottom; the overlay adds scanlines and
// noise. Refrain: washed paper face with horizontal tape banding and dark red sides.
import React from "react";
import * as THREE from "three";
import { AbsoluteFill } from "remotion";
import { Grain } from "../fx";
import { shadedMaterial } from "./materials";
import type { Look } from "./types";

const plate = /* glsl */ `
vec4 plate(vec2 uv) {
  vec3 c = tex(uv).rgb * gain;
  float y = luma(c);
  // chroma: decaying taps to the left so colour trails off to the right of every edge
  vec3 cs = vec3(0.0);
  float wsum = 0.0;
  for (int i = 0; i < 9; i++) {
    float k = float(i);
    float w = exp(-k * 0.32);
    cs += blur(uv - vec2(texel.x * k * smear, 0.0), 2.5) * w;
    wsum += w;
  }
  cs /= wsum;
  float ys = max(luma(cs), 0.02);
  // keep sharp luma, take the smeared colour (chroma ratio) and a little residual saturation
  vec3 col = cs * clamp(y / ys, 0.0, 3.0);
  col = mix(col, vec3(y * y), 0.18);
  // slightly washed: lifted ink shadows, softened highlights tinted toward paper
  col = mix(col, inkCol * 2.2 + col * 0.8, lift * smoothstep(0.5, 0.0, y));
  col = mix(col, paperCol * 0.9, wash * smoothstep(0.55, 1.0, y));
  col *= 0.94;
  return vec4(max(col, 0.0), 1.0);
}`;

const screen = /* glsl */ `
void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  float rows = resolution.y;
  float line = floor(uv.y * rows * 0.5);
  float t = floor(uTime * 24.0);
  float j = 0.4 + jitter * 1.2;
  // per-line wobble: most lines hold, some tear sideways, always with a slow sine sway
  float tear = step(0.9, hash(vec2(line, t))) * (hash(vec2(line * 1.7, t + 3.0)) - 0.5);
  float dx = (tear * 0.012 + 0.0007 * sin(uv.y * 9.0 + uTime * 2.0)) * j;
  // rolling tracking band: a soft bar drifting upward, with extra shear and noise inside
  float yb = fract(0.62 - uTime * 0.065);
  float band = smoothstep(0.04, 0.0, abs(uv.y - yb));
  float shear = band * (0.007 + 0.004 * sin(uv.y * 160.0 + uTime * 9.0)) * (0.6 + jitter);
  dx += shear * (0.4 + hash(vec2(line, t + 9.0)));
  // head-switching: bottom 2% of the frame is ripped sideways
  float hs = smoothstep(0.03, 0.0, uv.y);
  dx += hs * (0.02 + 0.03 * (hash(vec2(line, t)) - 0.3)) * (0.4 + 0.5 * sin(uv.y * 400.0));
  vec2 p = vec2(uv.x + dx, uv.y);
  float o = 0.0014 + band * 0.002;
  vec3 col = vec3(
    texture2D(inputBuffer, p + vec2(o, 0.0)).r,
    texture2D(inputBuffer, p).g,
    texture2D(inputBuffer, p - vec2(o, 0.0)).b);
  // tape noise: bright flecks in the band, grey static in the head-switch strip
  float n = hash(vec2(floor(uv.x * resolution.x * 0.5), line + t * 17.0));
  col += band * 0.12 * step(0.86, n) * paperCol + band * 0.05 * (n - 0.5);
  col = mix(col, paperCol * (0.25 + 0.6 * n), hs * 0.65);
  col *= 1.0 - band * 0.12;
  outputColor = vec4(max(col, 0.0), 1.0);
}`;

/** Fine scanlines and a faint noise above everything, light enough for the lyrics. */
const Overlay: NonNullable<Look["overlay"]> = ({ frame }) =>
  React.createElement(
    React.Fragment,
    null,
    React.createElement(AbsoluteFill, { style: { background: "repeating-linear-gradient(to bottom, rgba(0,0,0,0) 0px, rgba(0,0,0,0) 2px, rgba(0,0,0,0.16) 2px, rgba(0,0,0,0.16) 3px)" } }),
    React.createElement(Grain, { frame, opacity: 0.1 }),
  );

const front = /* glsl */ `
vec3 shade(vec3 n, vec3 p) {
  // washed paper with tape banding: faint horizontal lines and a slightly dimmer lower half
  float line = 0.93 + 0.07 * sin(p.y * 90.0);
  float k = 0.82 + 0.1 * n.y - 0.08 * smoothstep(0.5, 0.0, p.y);
  return mix(paperCol, accentCol, 0.06) * line * k;
}`;

const side = /* glsl */ `
vec3 shade(vec3 n, vec3 p) {
  float k = dot(n, normalize(vec3(-0.5, 0.6, 0.6)));
  return mix(inkCol * 1.5, accentCol * 0.55, smoothstep(-0.3, 0.6, k));
}`;

export const vhs: Look = {
  id: "vhs",
  label: "VHS tape",
  summary: "Camcorder tape: sharp luma with smeared, washed chroma, jittering lines, a rolling tracking band, RGB offset, head-switch noise, scanlines.",
  art: "Plain, everyday footage-like art with clear light and dark areas and some saturated colour; no VHS, glitch or scanlines in the prompt.",
  palette: { ink: "#0B0A0C", paper: "#F1EADB", accent: "#E02B2B", pop: "#2BB8B0" },
  effects: "allowed",
  density: 480,
  plate,
  params: { smear: 2.2, lift: 0.35, wash: 0.25 },
  refrain: (p) => ({ front: shadedMaterial(p, front), side: shadedMaterial(p, side) }),
  post: { bloom: 0.25, bloomThreshold: 0.85, ca: 0.0006, noise: 0.14, vignette: 0.4 },
  screen,
  lyricShadow: "-2px 0 0 rgba(255,40,60,0.65), 2px 0 0 rgba(40,230,230,0.55), 0 3px 6px rgba(0,0,0,0.6), 0 0 28px rgba(0,0,0,0.65)",
};
