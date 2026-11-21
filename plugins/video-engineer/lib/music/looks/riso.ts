// riso: two-ink risograph halftone. Accent dots from the plate's red channel, paper-white dots from its highlights,
// on ink-black paper, two screen angles, slight misregistration. Refrain: halftone-printed paper face, near-black sides.
import * as THREE from "three";
import { SOFT_SHADOW } from "./shadow";
import type { Look } from "./types";

const plate = /* glsl */ `
float screenDot(vec2 uv, float ang, int ch, vec2 off) {
  vec2 p = rot(ang) * (uv * cells);
  vec2 id = floor(p);
  vec2 f = fract(p) - 0.5;
  vec2 cuv = (rot(-ang) * (id + 0.5)) / cells + off;
  vec4 s = tex(cuv);
  float amt = ch == 0 ? smoothstep(thresh, 0.95, s.r) : smoothstep(0.32, 0.9, s.g);
  amt = clamp(amt * gain, 0.0, 1.0);
  float h = hash(id);
  float r = sqrt(amt) * 0.64 * (1.0 + jitter * (h - 0.5) * 0.9);
  vec2 jo = jitter * 0.22 * vec2(hash(id + 3.1) - 0.5, hash(id + 7.7) - 0.5);
  float d = length(f + jo);
  float aa = fwidth(d) * 0.9 + 0.02;
  return smoothstep(r + aa, r - aa, d);
}
vec4 plate(vec2 uv) {
  vec2 mr = vec2(0.0012, -0.0008) * misreg;
  float red = screenDot(uv, 0.26, 0, mr);
  float wht = screenDot(uv, 0.785, 1, -mr);
  vec3 col = mix(inkCol, tex(uv).rgb * baseGain, under);
  col = mix(col, accentCol, red);
  col = mix(col, paperCol * 1.6, wht);
  return vec4(col, max(paper, max(red, wht)));
}`;

/** Printed refrain face: paper white with accent and black halftone dots, slight misregistration and press grain. */
const printedFront = (p: Look["palette"]) =>
  new THREE.ShaderMaterial({
    uniforms: { paper: { value: new THREE.Color(p.paper) }, red: { value: new THREE.Color(p.accent) }, ink: { value: new THREE.Color(p.ink) } },
    vertexShader: /* glsl */ `
      varying vec3 vW;
      void main() {
        vW = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 paper; uniform vec3 red; uniform vec3 ink;
      varying vec3 vW;
      mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }
      float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float vn(vec2 p) {
        vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y);
      }
      float dots(vec2 p, float ang, float cell, float cov, vec2 off) {
        vec2 q = rot(ang) * (p + off) / cell;
        vec2 id = floor(q);
        vec2 f = fract(q) - 0.5;
        float r = sqrt(clamp(cov, 0.0, 1.0)) * 0.72 * (0.92 + 0.16 * h(id));
        float d = length(f) + 0.05 * (vn(q * 3.0) - 0.5);
        float aa = fwidth(d) * 0.8 + 0.015;
        return smoothstep(r + aa, r - aa, d);
      }
      void main() {
        vec2 p = vW.xy;
        // tone: heavier ink toward the foot of the letters, lit from the upper left, with blotchy press density
        float tone = 0.62 - (p.y - 0.1) * 0.5 + 0.34 * (vn(p * 0.55) - 0.5);
        float redCov = clamp(tone, 0.0, 1.0);
        float blkCov = smoothstep(0.62, 1.05, tone + 0.15 * (vn(p * 2.3) - 0.5));
        float rd = dots(p, 0.26, 0.105, redCov, vec2(0.0));
        float bd = dots(p, 1.05, 0.105, blkCov * 0.9, vec2(0.022, -0.017));
        float fib = vn(p * vec2(60.0, 4.0)) * 0.5 + vn(p * vec2(5.0, 70.0)) * 0.5;
        float grain = h(gl_FragCoord.xy);
        vec3 col = paper * (0.965 + 0.05 * fib + 0.035 * (grain - 0.5));
        col = mix(col, mix(col, red, 0.16), smoothstep(0.35, 0.8, vn(p * 0.9 + 7.0)));
        vec3 inkRed = red * (0.94 + 0.1 * grain);
        col = mix(col, inkRed, rd * 0.96);
        col = mix(col, mix(ink, inkRed * 0.25, 0.3), bd * 0.9);
        gl_FragColor = vec4(col, 1.0);
      }`,
    toneMapped: false,
  });

export const riso: Look = {
  id: "riso",
  label: "Riso halftone",
  summary: "Two-ink risograph print: accent and paper-white halftone dots on ink-black, slight misregistration, press grain.",
  art: "Plain art lit with strong value contrast; no halftone, riso or dots in the prompt (the shader prints them). Accent-dominant colour reads as accent ink.",
  palette: { ink: "#0A0A0C", paper: "#F2EFE8", accent: "#FF2B3A", pop: "#C6FF1A" },
  effects: "restrained",
  density: 150,
  plate,
  params: { thresh: 0.1, baseGain: 0.55, under: 0, paper: 1, misreg: 1 },
  refrain: (p) => ({ front: printedFront(p), side: new THREE.MeshStandardMaterial({ color: "#050506", roughness: 0.55, metalness: 0.1 }) }),
  post: { bloom: 0.6, bloomThreshold: 0.8, ca: 0.0006, noise: 0.12, vignette: 0.45 },
  lyricShadow: SOFT_SHADOW,
};
