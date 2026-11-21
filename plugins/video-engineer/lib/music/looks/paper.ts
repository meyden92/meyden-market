// paper: layered paper craft. An edge-preserving (Kuwahara) flat image is cut into five paper layers that keep each
// object's hue, pulled toward the palette, with wobbly scissor edges; each higher layer drops a soft shadow on the one
// below, cut edges catch a thin paper rim, every layer has paper fibre. Refrain: paper face with fibre, darker card sides. Overlay: very subtle paper grain.
import React from "react";
import { AbsoluteFill } from "remotion";
import { Grain } from "../fx";
import { shadedMaterial } from "./materials";
import { SOFT_SHADOW } from "./shadow";
import type { Look } from "./types";

const plate = /* glsl */ `
const vec2 LIGHT = vec2(-0.6, 0.8);  // towards the light: up and left in plate uv (y up)
const float LAYERS = 5.0;
// scissor wobble: the cut follows the shape with a slight hand-cut waver
vec2 cut(vec2 uv) { return uv + (vec2(fbm(uv * 18.0 + seed), fbm(uv * 18.0 + seed + 5.3)) - 0.5) * texel * wobble; }
// edge-preserving flat image: whole objects become flat areas, so layers follow objects instead of photo noise
vec3 flatImg(vec2 uv) {
  vec2 u = cut(uv);
  // two offset passes: one pass flips between quadrants near a threshold and combs the cut edge
  return (kuwahara(u, radius) + kuwahara(u + texel * vec2(2.0, -1.5), radius * 0.75)) * 0.5 * gain;
}
float levelOf(vec3 c) { return clamp(floor(clamp((luma(c) - lo) / (hi - lo), 0.0, 0.999) * LAYERS), 0.0, LAYERS - 1.0); }
vec4 plate(vec2 uv) {
  vec3 c = flatImg(uv);
  float k = levelOf(c);
  // layer colour: the object's own hue at the layer's value, pulled toward the palette ramp
  vec3 g = pow(max(c, 0.0), vec3(0.4545));
  vec3 hue = g / max(max(g.r, max(g.g, g.b)), 0.05);
  hue = mix(vec3(dot(hue, vec3(0.333))), hue, 1.25);
  float val = mix(0.22, 1.0, k / (LAYERS - 1.0));
  vec3 col = mix(toLin(clamp(hue * val, 0.0, 1.0)), rampAt(k / (LAYERS - 1.0)), pal);
  col = mix(col, paperCol, smoothstep(LAYERS - 1.5, LAYERS - 1.0, k) * 0.5);

  // soft drop shadow: raised layers toward the light darken this layer, longer for bigger steps
  float sh = 0.0;
  for (int i = 1; i <= 3; i++) {
    float f = float(i) / 3.0;
    sh += clamp(levelOf(flatImg(uv + LIGHT * texel * lift * f)) - k, 0.0, 2.0) * (1.0 - f * 0.7);
  }
  sh = clamp(sh / 1.6, 0.0, 1.0);
  // thin paper rim on cut edges facing the light
  float rim = step(levelOf(flatImg(uv + LIGHT * texel * 3.0)) + 0.5, k);
  col *= 1.0 - sh * shadow;
  col = mix(col, paperCol, rim * 0.4);

  // paper fibre: each layer has its own grain direction, plus fine tooth
  vec2 q = rot(k * 1.7 + 0.4) * (uv * cells);
  float fib = vnoise(q * vec2(0.9, 0.09)) * 0.55 + vnoise(q * vec2(0.12, 1.1) + 9.0) * 0.45;
  float tooth = vnoise(uv * cells * 1.6 + k * 17.0);
  col *= 0.92 + 0.14 * fib + 0.05 * (tooth - 0.5);
  return vec4(max(col, 0.0), 1.0);
}`;

const front = /* glsl */ `
vec3 shade(vec3 n, vec3 p) {
  vec2 q = rot(0.3) * (p.xy * 36.0);
  float fib = vnoise(q * vec2(0.9, 0.09)) * 0.55 + vnoise(q * vec2(0.12, 1.1) + 9.0) * 0.45;
  float k = 0.97 + 0.05 * (0.5 - p.y) + 0.03 * p.x;
  return paperCol * k * (0.9 + 0.2 * fib);
}`;

const side = /* glsl */ `
vec3 shade(vec3 n, vec3 p) {
  vec2 q = rot(1.2) * (p.xy * 28.0 + p.z * 40.0);
  float fib = vnoise(q * vec2(1.0, 0.12)) * 0.6 + vnoise(q * vec2(0.15, 1.0) + 4.0) * 0.4;
  float k = dot(n, normalize(vec3(-0.6, 0.6, 0.5)));
  vec3 card = mix(paperCol, inkCol, 0.5);
  return card * mix(0.7, 1.05, smoothstep(-0.3, 0.6, k)) * (0.88 + 0.22 * fib);
}`;

/** Static paper grain: the same every frame so the sheet does not shimmer. */
const Overlay: NonNullable<Look["overlay"]> = () => React.createElement(AbsoluteFill, null, React.createElement(Grain, { frame: 0, opacity: 0.07 }));

export const paper: Look = {
  id: "paper",
  label: "Cut paper",
  summary: "Layered paper craft: objects cut from five layers of coloured paper, wobbly scissor edges, soft drop shadows, paper rims and fibre.",
  art: "Plain art with large clear shapes and a clean light-to-dark structure; fine detail is lost in the five layers. No paper, collage or shadows in the prompt.",
  palette: { ink: "#0F4C5C", paper: "#F6EFE0", accent: "#F26B5B", pop: "#F2B134" },
  effects: "restrained",
  density: 600,
  plate,
  params: { radius: 14, wobble: 5, lo: 0.08, hi: 0.92, pal: 0.3, lift: 26, shadow: 0.5 },
  refrain: (p) => ({ front: shadedMaterial(p, front), side: shadedMaterial(p, side) }),
  post: { bloom: 0, bloomThreshold: 1, ca: 0, noise: 0.02, vignette: 0.2 },
  overlay: Overlay,
  lyricShadow: SOFT_SHADOW,
};
