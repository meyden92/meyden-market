// film: 35 mm photographic grade. Split-toned (ink shadows, paper highlights, accent warmth in the mids), red halation
// around highlights, moving grain, gate weave and a soft gate vignette. Refrain: satin metal lit by the palette studio.
import React from "react";
import * as THREE from "three";
import { AbsoluteFill } from "remotion";
import { Grain } from "../fx";
import { SOFT_SHADOW } from "./shadow";
import type { Look } from "./types";

const plate = /* glsl */ `
vec4 plate(vec2 uv) {
  vec3 c = tex(uv).rgb * gain;
  // print contrast: an S-curve around the mid grey
  vec3 g = pow(max(c, 0.0), vec3(0.4545));
  g = clamp((g - 0.5) * contrast + 0.5, 0.0, 1.0);
  g = g * g * (3.0 - 2.0 * g) * 0.35 + g * 0.65;
  c = toLin(g);
  float l = luma(c);
  vec3 col = c;
  // split tone: shadows sink into ink, highlights lift toward paper, mids pick up accent warmth
  col = mix(col, inkCol + c * 0.35, smoothstep(0.42, 0.02, l) * 0.6);
  col = mix(col, paperCol * 1.05, smoothstep(0.72, 1.0, l) * 0.3);
  col = mix(col, col * (0.6 + accentCol * 0.8), warmth * smoothstep(0.15, 0.5, l) * smoothstep(0.95, 0.55, l));
  // halation: highlights bleed a thin accent glow into their surroundings
  float h = 0.0;
  for (int i = 0; i < 8; i++) {
    float a = float(i) * 0.785;
    h += smoothstep(0.78, 1.0, luma(tex(uv + vec2(cos(a), sin(a)) * texel * halo).rgb));
  }
  col += accentCol * (h / 8.0) * halation * (1.0 - smoothstep(0.8, 1.0, l));
  // grain in the emulsion, finer in the highlights
  float gr = hash(floor(uv * cells) + floor(uTime * 24.0) * 7.31) - 0.5;
  col += gr * grain * (1.0 - l * 0.6) * (0.4 + jitter);
  return vec4(max(col, 0.0), 1.0);
}`;

/** Gate weave, breathing exposure and a soft round gate. Grain on top of everything. */
const Overlay: NonNullable<Look["overlay"]> = ({ frame }) => {
  const flicker = 0.035 * Math.sin(frame * 1.7) * Math.sin(frame * 0.53);
  return React.createElement(
    React.Fragment,
    null,
    React.createElement(AbsoluteFill, { style: { background: `rgba(0,0,0,${0.06 + flicker})` } }),
    React.createElement(AbsoluteFill, { style: { background: "radial-gradient(ellipse 75% 70% at 50% 50%, transparent 55%, rgba(0,0,0,0.55) 100%)" } }),
    React.createElement(Grain, { frame, opacity: 0.16 }),
  );
};

export const film: Look = {
  id: "film",
  label: "35 mm film",
  summary: "Photographic: split-toned grade, red halation around highlights, moving grain, gate flicker, soft vignette.",
  art: "Photographic plates: real-looking scenes and people with natural light, a clear light source and deep shadows. No grain or film effects in the prompt.",
  palette: { ink: "#101418", paper: "#F4E9D8", accent: "#E8673A", pop: "#7FB7C9" },
  effects: "allowed",
  density: 700,
  plate,
  params: { warmth: 0.55, halation: 1.6, halo: 9, grain: 0.06, contrast: 1.15 },
  refrain: (p) => ({
    front: new THREE.MeshStandardMaterial({ color: p.paper, metalness: 0.15, roughness: 0.45, envMapIntensity: 1.2, emissive: p.paper, emissiveIntensity: 0.45 }),
    side: new THREE.MeshStandardMaterial({ color: p.ink, metalness: 0.6, roughness: 0.45 }),
  }),
  post: { bloom: 0.55, bloomThreshold: 0.72, ca: 0.0007, noise: 0.08, vignette: 0.5 },
  environment: true,
  overlay: Overlay,
  lyricShadow: SOFT_SHADOW,
};
