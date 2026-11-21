// neon: night city. Plates sink to dark ink with a trace of their own colour; image and silhouette edges are drawn as glowing
// neon tubes (accent and pop by slow noise regions) with a wide soft halo and a slight flicker. Refrain: a lit neon sign
// (emissive pop-colour face, dark glass sides, accent outline hull).
import { outlineMaterial, shadedMaterial } from "./materials";
import type { Look } from "./types";

const plate = /* glsl */ `
float aEdge(vec2 uv, float r) {
  vec2 d = texel * r;
  float a = tex(uv + vec2(d.x, 0.0)).a + tex(uv - vec2(d.x, 0.0)).a + tex(uv + vec2(0.0, d.y)).a + tex(uv - vec2(0.0, d.y)).a;
  return clamp((4.0 - a) * 0.5, 0.0, 1.0) * step(0.5, tex(uv).a);
}
vec4 plate(vec2 uv) {
  vec3 c = tex(uv).rgb * gain;
  float l = luma(c);
  // dark ink base keeping a little of the plate's own colour
  vec3 own = mix(vec3(l * l), c, 0.55) * mix(vec3(1.0), accentCol * 2.0 + popCol, 0.25);
  vec3 col = inkCol * 0.9 + own * base * (0.3 + 0.7 * l);
  // tubes: sharp edge core plus wide soft halo from the same edge signal at a larger radius
  float eCore = max(edge(uv, tube), edge(uv, tube * 3.0) * 0.8) + 3.0 * aEdge(uv, tube * 1.5);
  float eWide = edge(uv, tube * 3.5) * 0.7 + 0.8 * aEdge(uv, tube * 4.0);
  float core = smoothstep(edgeLo, edgeLo + 0.6, eCore);
  float halo = smoothstep(edgeLo * 0.7, edgeLo * 0.7 + 1.5, eWide) * (1.0 - core * 0.6);
  // colour by slow noise region, flicker per region and in time
  vec2 q = uv * vec2(cells.x / cells.y, 1.0);
  float region = fbm(q * 2.2 + 3.0);
  float pick = smoothstep(0.47, 0.53, region);
  vec3 tubeCol = mix(accentCol, popCol, pick);
  vec2 rid = floor(q * 2.2);
  float fl = 1.0 - flicker * (0.5 + jitter) * step(0.93, hash(rid + floor(uTime * 9.0))) * (0.5 + 0.5 * hash(rid + 5.0));
  fl *= 1.0 - 0.06 * sin(uTime * 37.0 + region * 20.0);
  // hot white-ish centre of the tube, saturated colour toward the edges
  vec3 hot = mix(tubeCol, paperCol, 0.35);
  col += tubeCol * halo * haloGain * fl;
  col += mix(tubeCol * 1.6, hot * 2.2, core) * core * fl * glow;
  return vec4(col, 1.0);
}`;

const front = /* glsl */ `
vec3 shade(vec3 n, vec3 p) {
  // lightbox sign face: white-hot core at the top fading into the pop colour at the foot, a slow
  // diagonal sheen, above 1 for the bloom
  float t = smoothstep(-0.05, 1.0, p.y);
  vec3 c = mix(popCol * 1.1, mix(popCol, paperCol, 0.75) * 1.5, t);
  c *= 0.92 + 0.12 * smoothstep(0.3, 0.7, fract((p.x + p.y) * 0.35));
  return c * (0.8 + 0.2 * n.z);
}`;

const side = /* glsl */ `
vec3 shade(vec3 n, vec3 p) {
  // dark glass: ink with a faint reflection of the lit face
  float k = dot(n, normalize(vec3(-0.5, 0.6, 0.6)));
  return inkCol * 0.6 + accentCol * 0.08 * (0.5 + 0.5 * k);
}`;

export const neon: Look = {
  id: "neon",
  label: "Neon noir",
  summary: "Night city in dark ink: image edges drawn as glowing accent and pop neon tubes with a soft halo, strong bloom, neon-sign refrain type.",
  art: "Plain art with clear outlines and readable shapes, ideally a night scene with a few bright lights; the shader draws the tubes from the edges. No neon or glow in the prompt.",
  palette: { ink: "#0B0716", paper: "#FFF3E6", accent: "#FF2D95", pop: "#19E3FF" },
  effects: "allowed",
  density: 700,
  plate,
  params: { base: 0.2, tube: 1.3, edgeLo: 1.15, glow: 1.2, haloGain: 0.35, flicker: 0.5 },
  refrain: (p) => ({ front: shadedMaterial(p, front), side: shadedMaterial(p, side), outline: outlineMaterial(p.accent, 0.05, 2.2) }),
  post: { bloom: 1.1, bloomThreshold: 0.85, ca: 0.0007, noise: 0.05, vignette: 0.6 },
  lyricShadow: (p) => `0 2px 3px rgba(0,0,0,0.9), 0 0 14px rgba(0,0,0,0.85), 0 0 26px color-mix(in srgb, ${p.accent} 30%, transparent), 0 0 40px rgba(0,0,0,0.6)`,
};
