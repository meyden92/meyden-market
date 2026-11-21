// duotone: bold screen-printed poster. Contrast-curved luma mapped ink -> accent -> paper, pop only in the very brightest
// highlights, fine monochrome grain and a faint paper tooth. Refrain: flat accent face fading to pop, ink sides.
import React from "react";
import { AbsoluteFill } from "remotion";
import { Grain } from "../fx";
import { shadedMaterial } from "./materials";
import { SOFT_SHADOW } from "./shadow";
import type { Look } from "./types";

const plate = /* glsl */ `
vec4 plate(vec2 uv) {
  vec3 c = blur(uv, 1.0) * gain;
  float l = luma(c);
  // S-curve around the mid grey: poster contrast
  float t = clamp((l - 0.5) * contrast + 0.5, 0.0, 1.0);
  t = t * t * (3.0 - 2.0 * t) * 0.6 + t * 0.4;
  // fine grain, stronger in the mids where the ink is thinnest
  float g = hash(floor(uv * cells * 2.0)) - 0.5;
  t = clamp(t + g * grain * (1.0 - abs(t - 0.5) * 1.4), 0.0, 1.0);
  // ink -> accent over the lower half, accent -> paper over the upper half
  vec3 col = t < 0.5 ? mix(inkCol, accentCol, smoothstep(0.0, 0.5, t)) : mix(accentCol, paperCol, smoothstep(0.5, 0.92, t));
  // pop only in the brightest highlights, broken up by the grain so it stays a small share
  float hi = smoothstep(0.88, 0.99, t + 0.05 * (vnoise(uv * cells * 0.5) - 0.5));
  col = mix(col, popCol, hi * 0.9);
  // paper tooth: low-frequency fibre that lifts and sinks the print a few percent
  float tooth = vnoise(uv * cells * vec2(1.0, 0.18)) * 0.5 + vnoise(uv * cells * vec2(0.22, 1.0)) * 0.5;
  col *= 0.95 + tooth * 0.1;
  return vec4(col, 1.0);
}`;

const front = /* glsl */ `
vec3 shade(vec3 n, vec3 p) {
  float k = smoothstep(0.0, 1.0, p.y * 0.9 + 0.1);
  return mix(accentCol, popCol, k * 0.85) * (0.985 + 0.03 * hash(gl_FragCoord.xy));
}`;

const side = /* glsl */ `
vec3 shade(vec3 n, vec3 p) {
  float k = dot(n, normalize(vec3(-0.6, 0.6, 0.5)));
  return mix(inkCol * 0.7, inkCol * 1.6 + accentCol * 0.05, smoothstep(-0.3, 0.6, k));
}`;

const Overlay: NonNullable<Look["overlay"]> = ({ frame }) =>
  React.createElement(AbsoluteFill, null, React.createElement(Grain, { frame: Math.floor(frame / 2), opacity: 0.1 }));

export const duotone: Look = {
  id: "duotone",
  label: "Duotone poster",
  summary: "Graphic poster duotone: ink to accent to paper with a few pop highlights, fine grain, flat refrain type.",
  art: "Plain art with clear shapes and strong light-dark separation; colour does not matter (the shader maps luminance to the palette).",
  palette: { ink: "#1A1446", paper: "#FFE9D6", accent: "#FF4F79", pop: "#FFC145" },
  effects: "restrained",
  density: 900,
  plate,
  params: { contrast: 1.5, grain: 0.14 },
  refrain: (p) => ({ front: shadedMaterial(p, front), side: shadedMaterial(p, side) }),
  post: { bloom: 0, bloomThreshold: 1, ca: 0, noise: 0.05, vignette: 0.2 },
  overlay: Overlay,
  lyricShadow: SOFT_SHADOW,
};
