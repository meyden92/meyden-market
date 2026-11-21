// comic: Ben-Day pop art. Colours flattened to the palette (accent or pop by hue, ink for shadows, paper for lights),
// Ben-Day dot screens in the mid tones, thick ink outlines from image edges. Refrain: pop face with accent dots,
// ink outline hull, accent sides.
import { outlineMaterial, shadedMaterial } from "./materials";
import type { Look } from "./types";

const plate = /* glsl */ `
// family colour of a cell: pop for yellows and bright warm areas, accent for everything else
vec3 family(vec3 c) {
  vec3 g = pow(max(c, 0.0), vec3(0.4545));
  float warm = min(g.r, g.g) - g.b;
  float pop = max(smoothstep(0.09, 0.11, warm), smoothstep(0.55, 0.57, luma(c)) * smoothstep(0.0, 0.02, g.r - g.b));
  return mix(accentCol, popCol, pop);
}
vec4 plate(vec2 uv) {
  float ang = 0.785;
  vec2 p = rot(ang) * (uv * cells);
  vec2 id = floor(p);
  vec2 f = fract(p) - 0.5;
  vec2 cuv = (rot(-ang) * (id + 0.5)) / cells;
  vec3 cc = blur(cuv, 3.0) * gain;
  float lc = pow(luma(cc), lift);
  // dot coverage grows as the cell gets darker; solid below the dot range
  float amt = smoothstep(dotHi, dotLo, lc);
  float r = 0.57 * sqrt(amt) + 0.2 * smoothstep(0.8, 1.0, amt);
  float d = length(f);
  float aa = fwidth(d) * 0.9 + 0.02;
  float dotMask = smoothstep(r + aa, r - aa, d);
  vec3 fam = family(blur(uv, 4.0) * gain);

  vec3 c = blur(uv, 1.5) * gain;
  float l = pow(luma(c), lift);
  vec3 col = paperCol;
  col = mix(col, fam, dotMask);
  col = mix(col, fam, smoothstep(solidHi + 0.02, solidHi - 0.02, l));
  // second, finer ink screen deep in the shadows before they go solid
  float inkAmt = smoothstep(solidHi * 0.75, inkLo, l);
  vec2 q = rot(-0.26) * (uv * cells * 1.4);
  float dd = length(fract(q) - 0.5);
  float inkDots = smoothstep(0.57 * sqrt(inkAmt) + aa, 0.57 * sqrt(inkAmt) - aa, dd) * step(0.01, inkAmt);
  col = mix(col, inkCol, inkDots);
  col = mix(col, inkCol, smoothstep(inkLo + 0.02, inkLo - 0.02, l));
  // thick ink outline from image edges
  float e = max(edge(uv, line), edge(uv, line * 0.5) * 0.9);
  col = mix(col, inkCol, smoothstep(edgeLo, edgeLo + 0.2, e));
  // very light paper tooth on the cheap newsprint
  col *= 0.97 + 0.05 * vnoise(uv * cells * 2.5);
  return vec4(col, 1.0);
}`;

const front = /* glsl */ `
vec3 shade(vec3 n, vec3 p) {
  vec2 q = rot(0.785) * (p.xy * 11.0);
  float k = clamp(0.55 - p.y * 0.55 + 0.1 * p.x, 0.0, 1.0);
  float d = length(fract(q) - 0.5);
  float aa = fwidth(d) * 0.9 + 0.02;
  float m = smoothstep(sqrt(k) * 0.6 + aa, sqrt(k) * 0.6 - aa, d);
  return mix(popCol, accentCol, m);
}`;

const side = /* glsl */ `
vec3 shade(vec3 n, vec3 p) {
  float k = dot(n, normalize(vec3(-0.6, 0.6, 0.5)));
  return k > 0.1 ? accentCol : mix(accentCol, inkCol, 0.5);
}`;

export const comic: Look = {
  id: "comic",
  label: "Comic / pop art",
  summary: "Ben-Day pop art: palette-flat colour, accent and pop dot screens in the mid tones, solid ink shadows, thick ink outlines.",
  art: "Plain, clearly lit art with readable shapes and strong value contrast; no halftone, comic or outline effects in the prompt (the shader prints them).",
  palette: { ink: "#111111", paper: "#FFF6E0", accent: "#E8322F", pop: "#FFD400" },
  effects: "restrained",
  density: 120,
  plate,
  params: { lift: 0.8, dotHi: 0.8, dotLo: 0.26, solidHi: 0.25, inkLo: 0.12, line: 2.4, edgeLo: 0.6 },
  refrain: (p) => ({ front: shadedMaterial(p, front), side: shadedMaterial(p, side), outline: outlineMaterial(p.ink, 0.05) }),
  post: { bloom: 0, bloomThreshold: 1, ca: 0, noise: 0.03, vignette: 0 },
  lyricShadow: (p) => `-2px -2px 0 ${p.ink}, 2px -2px 0 ${p.ink}, -2px 2px 0 ${p.ink}, 2px 2px 0 ${p.ink}, 5px 5px 0 ${p.ink}`,
};
