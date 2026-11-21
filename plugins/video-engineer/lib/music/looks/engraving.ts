// engraving: banknote / etching. Hatching lines whose width grows with darkness, a second cross-hatch angle for deeper
// shadows and a third for the darkest, slightly wavy, antialiased with fwidth so fine lines fade to tone instead of moire.
// A pale accent wash sits under the mid tones, on ivory paper. Refrain: engraved face (fine horizontal lines, darker toward
// the foot), ink sides.
import { shadedMaterial } from "./materials";
import type { Look } from "./types";

const plate = /* glsl */ `
// one hatch layer: phase ph (1 per line), ink width w (0..1 of the period); fades to its mean tone when lines get sub-pixel
float hatch(float ph, float w) {
  float aa = fwidth(ph);
  float d = abs(fract(ph) - 0.5);
  float cov = smoothstep(0.5 * w + aa * 0.8, 0.5 * w - aa * 0.8, d);
  return mix(cov, w, smoothstep(0.4, 0.8, aa));
}
vec4 plate(vec2 uv) {
  vec2 p = uv * cells;
  vec3 s = tex(uv).rgb;
  float l = clamp(luma(blur(uv, 1.5)) * gain, 0.0, 1.0);
  float d = 1.0 - smoothstep(0.04, 0.9, l);

  // hatch phase bends along a heavily blurred luma so lines follow form
  float lb = luma(softBlur(uv, 18.0)) * gain;
  float sw = fbm(p * 0.01) * 2.0;
  float a1 = 0.12, a2 = a1 + 1.0;
  float p1 = dot(p, vec2(-sin(a1), cos(a1))) + wave * sin(dot(p, vec2(cos(a1), sin(a1))) * 0.11 + sw) + sw + follow * lb;
  float p2 = dot(p, vec2(-sin(a2), cos(a2))) + sw + follow * lb;
  // primary lines are always present; only their thickness changes
  float l1 = hatch(p1, 0.04 + 0.86 * pow(smoothstep(0.02, 0.95, d), 0.8));
  // thin cross lines in the deep tones, constant width so crossings do not break into dots
  float l2 = hatch(p2, 0.12) * smoothstep(0.6, 0.85, d);
  float ink = 1.0 - (1.0 - l1) * (1.0 - l2);

  // fine contour lines from image edges, slightly broken
  float ol = smoothstep(edgeLo, edgeLo + 0.35, edge(uv, 2.0));
  ink = max(ink, ol * 0.6);

  // warm areas of the art pull the ink toward the pop red
  float warm = smoothstep(0.08, 0.4, s.r - max(s.g, s.b) * 0.8);
  vec3 inkC = mix(inkCol, mix(inkCol, popCol, 0.8), warm * 0.4);

  // paper with fibres, accent wash under the mid tones
  float fib = fbm(p * 4.0) * 0.08 + (vnoise(p * vec2(30.0, 2.0)) - 0.5) * 0.04;
  vec3 paper = paperCol * (0.94 + fib);
  float wash = smoothstep(0.12, 0.42, l) * smoothstep(0.98, 0.55, l) * (0.55 + 0.9 * fbm(p * 0.22 + 4.0));
  paper = mix(paper, mix(paperCol, accentCol, 0.55) * (0.95 + fib), clamp(wash, 0.0, 1.0) * washAmt);
  return vec4(mix(paper, inkC, ink), 1.0);
}`;

const front = /* glsl */ `
vec3 shade(vec3 n, vec3 p) {
  vec2 q = p.xy;
  float t = 1.0 - clamp(q.y, 0.0, 1.0);
  float ph = q.y * 52.0 + 0.5 * sin(q.x * 4.0 + 2.0 * vnoise(q * 1.5)) + 1.5 * vnoise(q * 0.8);
  float w = 0.06 + 0.74 * t * t + 0.1 * (vnoise(q * 3.0) - 0.5);
  float aa = fwidth(ph);
  float cov = smoothstep(0.5 * w + aa * 0.8, 0.5 * w - aa * 0.8, abs(fract(ph) - 0.5));
  cov = mix(cov, w, smoothstep(0.4, 0.8, aa));
  vec3 base = mix(paperCol, accentCol, 0.1 + 0.12 * t) * (0.96 + 0.06 * vnoise(q * 30.0));
  return mix(base, inkCol, cov);
}`;

const side = /* glsl */ `
vec3 shade(vec3 n, vec3 p) {
  float k = dot(n, normalize(vec3(-0.6, 0.6, 0.5)));
  return mix(inkCol, mix(inkCol, accentCol, 0.6), smoothstep(0.1, 0.9, k) * 0.7);
}`;

export const engraving: Look = {
  id: "engraving",
  label: "Engraving",
  summary: "Banknote etching on ivory paper: fine wavy hatching that thickens with shadow, cross-hatch in the deep tones, pale accent wash in the mids.",
  art: "Plain art with clear light, mid and deep tones and readable contours; the shader turns tone into hatch lines. No engraving, etching, banknote or line-art style in the prompt.",
  palette: { ink: "#0E1E17", paper: "#F3EBD3", accent: "#2E7D55", pop: "#A8423A" },
  effects: "restrained",
  density: 300,
  plate,
  params: { wave: 0.25, follow: 3.5, edgeLo: 0.55, washAmt: 0.75 },
  refrain: (p) => ({ front: shadedMaterial(p, front), side: shadedMaterial(p, side) }),
  post: { bloom: 0, ca: 0, noise: 0.03, vignette: 0.15 },
  lyricShadow: "0 0 3px rgba(0,0,0,0.95), 2px 3px 0 rgba(0,0,0,0.8), 0 0 24px rgba(0,0,0,0.7)",
};
