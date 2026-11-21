// cel: anime / toon. Plates flattened into three tone bands that keep their hue, shadows pushed toward the ink tint,
// highlights to paper, ink outlines from the image edges. Refrain: banded toon face, ink outline hull.
import { outlineMaterial, shadedMaterial } from "./materials";
import type { Look } from "./types";

const plate = /* glsl */ `
vec4 plate(vec2 uv) {
  vec3 c = (blur(uv, 2.0) + blur(uv, 5.0)) * 0.5 * gain;
  float l = luma(c);
  vec3 g = pow(max(c, 0.0), vec3(0.4545));
  vec3 hue = g / max(max(g.r, max(g.g, g.b)), 0.05);
  // three bands with a soft 1-px edge between them
  float aa = 0.02;
  float b = mix(0.3, 0.66, smoothstep(lo - aa, lo + aa, l));
  b = mix(b, 1.0, smoothstep(hi - aa, hi + aa, l));
  vec3 col = toLin(hue * b);
  // shadow band takes a cool ink tint, as painted cels do
  col = mix(col, col * 0.55 + inkCol * 0.8, smoothstep(lo + aa, lo - aa, l) * 0.45);
  col = mix(col, paperCol, smoothstep(0.9, 1.0, l) * 0.7);
  // ink lines where the image has an edge
  // ink lines on the outlines of shapes only: edges of the smoothed tone bands, not texture detail
  vec2 d = texel * line;
  float bl = luma(blur(uv, 3.0));
  float gx = luma(blur(uv + vec2(d.x, 0.0), 3.0)) - luma(blur(uv - vec2(d.x, 0.0), 3.0));
  float gy = luma(blur(uv + vec2(0.0, d.y), 3.0)) - luma(blur(uv - vec2(0.0, d.y), 3.0));
  float e = length(vec2(gx, gy)) * (0.6 + bl);
  col = mix(col, inkCol, smoothstep(edgeLo, edgeLo + 0.08, e));
  return vec4(col, 1.0);
}`;

const front = /* glsl */ `
vec3 shade(vec3 n, vec3 p) {
  // lit from the upper left: highlight band across the top of the letters
  float k = p.y * 0.9 - p.x * 0.05;
  return k > 0.85 ? mix(paperCol, popCol, 0.25) : mix(popCol, paperCol, 0.15);
}`;

const side = /* glsl */ `
vec3 shade(vec3 n, vec3 p) {
  float k = dot(n, normalize(vec3(-0.6, 0.6, 0.5)));
  return k > 0.15 ? accentCol : mix(accentCol, inkCol, 0.55);
}`;

export const cel: Look = {
  id: "cel",
  label: "Cel / anime",
  summary: "Hand-painted anime cels: three flat tone bands per colour, tinted shadows, ink outlines, outlined refrain type.",
  art: "Plain, clearly lit illustration or photo with readable shapes and clean silhouettes; the shader flattens tones and draws the outlines. No anime style or outlines in the prompt.",
  palette: { ink: "#1C1730", paper: "#FFF8EC", accent: "#FF5A7A", pop: "#FFD166" },
  effects: "restrained",
  density: 1,
  plate,
  params: { lo: 0.3, hi: 0.66, line: 2.0, edgeLo: 0.12 },
  refrain: (p) => ({ front: shadedMaterial(p, front), side: shadedMaterial(p, side), outline: outlineMaterial(p.ink) }),
  post: { bloom: 0.2, bloomThreshold: 0.95, ca: 0, noise: 0.04, vignette: 0.25 },
  lyricShadow: "0 0 2px rgba(0,0,0,0.9), 3px 4px 0 rgba(0,0,0,0.75), 0 0 24px rgba(0,0,0,0.45)",
};
