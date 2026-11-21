// watercolor: wet wash on cold-press paper. Noise-warped, blurred colour pulled toward the palette, light areas left as
// bare paper, darker pigment pooled at wash edges, granulation in dense pigment, paper tooth.
// Refrain: blotchy accent wash on paper with darker pooled edges, paper-tinted sides.
import { shadedMaterial } from "./materials";
import type { Look } from "./types";

const plate = /* glsl */ `
vec4 plate(vec2 uv) {
  // wet-in-wet bleed: the wash wanders by about wobble of the plate width
  vec2 w = (vec2(fbm(uv * 5.0), fbm(uv * 5.0 + 5.2)) - 0.5) * wobble;
  vec2 u = uv + w;
  vec3 c = softBlur(u, 8.0) * gain;
  float l = pow(luma(c), 0.8);
  float tooth = fbm(uv * cells * 0.3);
  float fine = vnoise(uv * cells * 0.9);
  float blot = fbm(uv * 3.0 + 3.0);

  // a few large soft washes; the boundary between two washes wanders with the blot noise
  float x = l * washes + (blot - 0.5) * 0.7;
  float f = fract(x);
  float lq = (floor(x) + smoothstep(0.3, 0.7, f)) / washes;
  float edgeLine = (1.0 - smoothstep(0.0, 0.07, abs(f - 0.5))) * step(0.5, x);
  l = mix(l, lq, 0.8);

  // pigment: none in the lights (bare paper), growing through the mids, blotchy
  float d = smoothstep(bare, bare - 0.5, l);
  d *= 0.85 + 0.3 * blot;
  d = clamp(d, 0.0, 1.0);

  // the image's own hues, slightly lifted in saturation; the palette only nudges them
  vec3 g = pow(max(c, 0.0), vec3(0.4545));
  vec3 sat = toLin(clamp(mix(vec3(luma(c)), g, 1.25), 0.0, 1.0));
  vec3 pig = mix(sat, rampAt(l), pull);
  pig = mix(pig, mix(inkCol, sat, 0.55), smoothstep(0.3, 0.05, l) * 0.5);

  // pooled pigment: thin and darker only at wash boundaries
  float pool = edgeLine * smoothstep(0.05, 0.3, d);
  // granulation only where the pigment is dense
  float gran = (fine - 0.5) * 0.8 + (tooth - 0.5);
  vec3 paperTex = paperCol * (0.9 + 0.2 * tooth + 0.06 * (fine - 0.5));
  vec3 col = mix(paperTex, pig, d * 0.9);
  col *= 1.0 - 0.28 * pool;
  col *= 1.0 - gran * 0.16 * smoothstep(0.65, 1.0, d);
  col *= 0.97 + 0.06 * (tooth - 0.5);
  return vec4(max(col, 0.0), 1.0);
}`;

const front = /* glsl */ `
vec3 shade(vec3 n, vec3 p) {
  float tooth = fbm(p.xy * 14.0);
  float blot = fbm(p.xy * 2.4 + 1.7);
  float d = smoothstep(0.2, 0.42, blot + 0.18 * (tooth - 0.5) + 0.1 * (0.5 - p.y) + 0.12);
  float ring = smoothstep(0.02, 0.3, d) * (1.0 - smoothstep(0.3, 0.75, d));
  // pigment pools toward the rim where the face turns into the bevel
  float rim = smoothstep(0.97, 0.78, n.z);
  vec3 paperTex = paperCol * (0.94 + 0.1 * tooth);
  vec3 wash = mix(paperTex, accentCol * (0.92 + 0.14 * tooth), d * 0.95);
  wash = mix(wash, mix(accentCol, inkCol, 0.4), clamp(rim * 0.75 + ring * 0.75 + d * smoothstep(0.55, 0.95, blot) * 0.15, 0.0, 1.0));
  return wash;
}`;

const side = /* glsl */ `
vec3 shade(vec3 n, vec3 p) {
  float k = dot(n, normalize(vec3(-0.6, 0.6, 0.5)));
  vec3 c = mix(paperCol * 0.82, accentCol, 0.18);
  return mix(c * 0.82, c, smoothstep(-0.2, 0.5, k)) * (0.96 + 0.08 * vnoise(p.xy * 30.0));
}`;

export const watercolor: Look = {
  id: "watercolor",
  label: "Watercolour",
  summary: "Wet wash painting on cold-press paper: soft wobbling colour, bare paper in the lights, pooled pigment edges, granulation.",
  art: "Plain art with soft colour fields and clear value structure; light skies and highlights stay empty paper. No watercolour, paint or paper texture in the prompt.",
  palette: { ink: "#262C63", paper: "#FBF5E8", accent: "#D8506E", pop: "#6FA24A" },
  effects: "restrained",
  density: 520,
  plate,
  params: { wobble: 0.014, bare: 0.9, pull: 0.04, washes: 3 },
  refrain: (p) => ({ front: shadedMaterial(p, front), side: shadedMaterial(p, side) }),
  post: { bloom: 0, bloomThreshold: 1, ca: 0, noise: 0.03, vignette: 0.15 },
  lyricShadow: "0 1px 2px rgba(18,14,40,0.9), 0 2px 10px rgba(18,14,40,0.85), 0 0 30px rgba(18,14,40,0.7)",
};
