// linocut: two-block relief print. The ink block is carved with parallel grooves that follow a slow noise flow field,
// groove width follows tone (bright = wide white groove, dark = solid ink), wobbly edges, strong outlines from image edges.
// An accent block under it fills the mid tones with flat blotchy colour. Refrain: printed face (paper + accent blotches,
// carved ink lines heavier toward the foot), ink sides.
import { shadedMaterial } from "./materials";
import type { Look } from "./types";

const plate = /* glsl */ `
float lumB(vec2 uv, float r) { return luma(blur(uv, r)); }
vec4 plate(vec2 uv) {
  vec2 p = uv * cells;
  float l = clamp(lumB(uv, 2.0) * gain, 0.0, 1.0);

  // big-shape tone: strongly blurred luma and its gradient steer the grooves along the contours of the picture
  float R = 14.0;
  float lb = lumB(uv, R) * gain;
  vec2 dx = vec2(texel.x * 14.0, 0.0), dy = vec2(0.0, texel.y * 14.0);
  vec2 gr = vec2(lumB(uv + dx, R) - lumB(uv - dx, R), lumB(uv + dy, R) - lumB(uv - dy, R)) * gain;

  // phase = a straight carrier (with a gentle noise bend) plus the blurred tone: grooves run along iso-tone lines where the
  // picture has a gradient and fall back to the carrier where it is flat
  float a0 = 0.5;
  float ph = dot(p, vec2(sin(a0), cos(a0))) + flow * fbm(p * 0.02 + 3.0) + follow * lb;
  float f = fract(ph);
  float dd = abs(f - 0.5);
  float g = smoothstep(0.16, 0.8, l);
  float hw = 0.5 * (1.0 - g);
  float wob = (vnoise(p * 0.8 + 5.0) - 0.5) * 0.14;
  float aa = fwidth(ph) * 0.75 + 0.01;
  float ink = smoothstep(aa, -aa, dd - hw + wob);
  ink = max(ink, smoothstep(0.42, 0.34, l));
  ink *= 1.0 - smoothstep(0.82, 0.9, l);

  // bold outlines on the major shapes only: edge of a lightly blurred picture, thickened
  vec2 ex = vec2(texel.x * 3.0, 0.0), ey = vec2(0.0, texel.y * 3.0);
  vec2 ge = vec2(lumB(uv + ex, 3.0) - lumB(uv - ex, 3.0), lumB(uv + ey, 3.0) - lumB(uv - ey, 3.0)) * gain;
  float ol = smoothstep(edgeLo, edgeLo + 0.08, length(ge) + 0.5 * length(gr));
  ink = max(ink, ol * 0.97);

  // press speckle: small paper pinholes in the ink
  ink *= 1.0 - 0.3 * smoothstep(0.9, 0.95, vnoise(p * 3.1 + 2.0)) * smoothstep(0.4, 0.6, l);

  // accent block follows the tone shapes (flat bands of the blurred picture), slightly off register
  float lm = lumB(uv + vec2(0.0016, -0.0011), 5.0) * gain + (vnoise(p * 0.5) - 0.5) * 0.04;
  float cov = smoothstep(0.34, 0.37, lm) * smoothstep(0.56, 0.53, lm);
  float pc = smoothstep(0.56, 0.59, lm) * smoothstep(0.78, 0.75, lm) * popAmt;
  cov *= 1.0 - 0.3 * smoothstep(0.7, 0.82, vnoise(p * 4.0 + 1.0));

  float fib = fbm(p * 6.0) * 0.1 + (vnoise(p * vec2(22.0, 2.0)) - 0.5) * 0.05;
  vec3 col = paperCol * (0.9 + fib + 0.03 * (hash(floor(uv / texel)) - 0.5));
  col = mix(col, popCol * (0.95 + fib), pc);
  col = mix(col, accentCol * (0.92 + 0.2 * fib), cov);
  col = mix(col, inkCol * (1.0 + 0.4 * fib), ink);
  return vec4(col, 1.0);
}`;

const front = /* glsl */ `
vec3 shade(vec3 n, vec3 p) {
  vec2 q = p.xy;
  float d = clamp(0.62 - q.y * 0.55 + 0.3 * (vnoise(q * 2.5) - 0.5), 0.0, 1.0);
  float ph = q.y * 24.0 + q.x * 7.0 + 3.0 * vnoise(q * 1.3);
  float dd = abs(fract(ph) - 0.5);
  float hw = 0.5 * d;
  float aa = fwidth(ph) * 0.75 + 0.01;
  float ink = smoothstep(aa, -aa, dd - hw + (vnoise(q * 6.0) - 0.5) * 0.18);
  float blot = smoothstep(0.42, 0.5, vnoise(q * 2.2 + 4.0) + 0.25 * (vnoise(q * 7.0) - 0.5));
  vec3 base = paperCol * (0.93 + 0.1 * vnoise(q * 40.0));
  base = mix(base, accentCol, blot * 0.95);
  return mix(base, inkCol, ink * 0.95);
}`;

const side = /* glsl */ `
vec3 shade(vec3 n, vec3 p) {
  float k = dot(n, normalize(vec3(-0.6, 0.6, 0.5)));
  return inkCol * (1.0 + 0.5 * smoothstep(0.2, 0.9, k)) + paperCol * 0.03 * smoothstep(0.3, 0.9, k);
}`;

export const linocut: Look = {
  id: "linocut",
  label: "Linocut",
  summary: "Two-block relief print on cream paper: carved ink grooves that follow tone, strong outlines, flat blotchy accent colour under the mid tones.",
  art: "Plain art with strong value contrast, clear shapes and bold silhouettes; mid tones become flat accent blotches, fine detail is lost to the grooves. No linocut, woodcut or print style in the prompt.",
  palette: { ink: "#14110F", paper: "#F1E7D2", accent: "#D8452B", pop: "#E2A93B" },
  effects: "restrained",
  density: 100,
  plate,
  params: { flow: 4, follow: 3, edgeLo: 0.14, popAmt: 0.7 },
  refrain: (p) => ({ front: shadedMaterial(p, front), side: shadedMaterial(p, side) }),
  post: { bloom: 0, ca: 0, noise: 0.05, vignette: 0.2 },
  lyricShadow: "0 0 3px rgba(0,0,0,0.95), 3px 4px 0 rgba(0,0,0,0.85), 0 0 26px rgba(0,0,0,0.7)",
};
