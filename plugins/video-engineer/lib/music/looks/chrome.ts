// chrome: Y2K liquid chrome. Plates become high-contrast silver from their own luma, with a thin accent-to-pop iridescent
// tint on the slopes of a fake embossed normal, anisotropic streaks and sharp paper speculars. Refrain: mirror chrome in the palette studio.
import * as THREE from "three";
import { SOFT_SHADOW } from "./shadow";
import type { Look } from "./types";

const plate = /* glsl */ `
float lumaAt(vec2 uv, float r) { return luma(blur(uv, r) * gain); }
vec4 plate(vec2 uv) {
  vec3 c = tex(uv).rgb * gain;
  float l = luma(c);
  // fake height from luma at two scales; the wide scale carries the liquid swells
  vec2 d1 = texel * 4.0, d2 = texel * 14.0;
  vec2 g1 = vec2(lumaAt(uv + vec2(d1.x, 0.0), 2.0) - lumaAt(uv - vec2(d1.x, 0.0), 2.0), lumaAt(uv + vec2(0.0, d1.y), 2.0) - lumaAt(uv - vec2(0.0, d1.y), 2.0));
  vec2 g2 = vec2(lumaAt(uv + vec2(d2.x, 0.0), 6.0) - lumaAt(uv - vec2(d2.x, 0.0), 6.0), lumaAt(uv + vec2(0.0, d2.y), 6.0) - lumaAt(uv - vec2(0.0, d2.y), 6.0));
  vec2 g = (g1 * 0.25 + g2) * emboss;
  vec3 n = normalize(vec3(-g.x, g.y, 1.0));
  // silver base: steep S-curve of the smoothed luma, ink floor to paper cap, neutral
  float h = lumaAt(uv, 2.0);
  float sc = smoothstep(0.0, 1.0, smoothstep(0.08, 0.92, h));
  vec3 silver = mix(inkCol * 1.4, paperCol * 1.05, sc);
  silver = vec3(dot(silver, vec3(0.333)));
  // keep faces natural: pull a little of the plate's own value back in
  silver = mix(silver, vec3(l * l) * paperCol, 0.18);
  // thin iridescent tint (accent to pop) only on mid-tone slopes
  float m = length(g);
  float slope = smoothstep(0.06, 0.2, m) * (1.0 - smoothstep(0.3, 0.5, m));
  float hue = 0.5 + 0.5 * sin(dot(g, vec2(7.0, 5.0)) * 4.0 + h * 5.0 + uTime * 0.5 + jitter);
  vec3 irid = mix(accentCol, popCol, hue) * 1.1;
  float tintW = slope * smoothstep(0.1, 0.45, h) * (1.0 - smoothstep(0.7, 0.9, h)) * 0.3;
  vec3 col = mix(silver, irid * (0.4 + 0.8 * h), tintW);
  // soft anisotropic streaks: bright areas smeared along x
  float st = 0.0;
  for (int i = -3; i <= 3; i++) st += lumaAt(uv + vec2(float(i) * texel.x * 16.0, 0.0), 5.0);
  st = smoothstep(0.62, 0.95, st / 7.0);
  col += paperCol * st * 0.22;
  // a few sharp speculars on the brightest edges
  vec3 hv = normalize(normalize(vec3(-0.45, 0.6, 0.65)) + vec3(0.0, 0.0, 1.0));
  float sp = pow(max(dot(n, hv), 0.0), spec);
  col += paperCol * smoothstep(0.6, 0.95, sp) * smoothstep(0.4, 0.8, h) * 1.5;
  return vec4(max(col, 0.0), 1.0);
}
`;

export const chrome: Look = {
  id: "chrome",
  label: "Y2K chrome",
  summary: "Y2K chrome: silver high-contrast plates with an iridescent accent-to-pop sheen, streak highlights and mirror-chrome refrain type.",
  art: "Plain art with clear shapes, strong silhouettes and smooth value gradients; the shader embosses it into metal. No chrome or metal in the prompt.",
  palette: { ink: "#050914", paper: "#EAF4FF", accent: "#2D6BFF", pop: "#E63CFF" },
  effects: "allowed",
  density: 700,
  plate,
  params: { emboss: 1.2, spec: 60 },
  refrain: (p) => ({
    front: new THREE.MeshStandardMaterial({ color: new THREE.Color(p.paper).lerp(new THREE.Color(p.accent), 0.08), metalness: 1, roughness: 0.04, envMapIntensity: 1.5 }),
    side: new THREE.MeshStandardMaterial({ color: new THREE.Color(p.paper).lerp(new THREE.Color(p.accent), 0.3), metalness: 1, roughness: 0.22, envMapIntensity: 1.2 }),
  }),
  post: { bloom: 0.7, bloomThreshold: 0.9, ca: 0.0004, noise: 0.03, vignette: 0.3 },
  environment: true,
  lyricShadow: SOFT_SHADOW,
};
