// blueprint: technical drawing. The plate is an ink-blue sheet with a fine grid (stronger major lines), paper-white edge
// lines from the image, a faint light hatch of the image's tone, pop annotation crosses at a few grid intersections, and
// faded paper texture. Refrain: ink face with a fine paper grid inside a paper outline hull (wireframe feel), pale sides.
import { outlineMaterial, shadedMaterial } from "./materials";
import type { Look } from "./types";

const plate = /* glsl */ `
// 1 on integer values of c, about px pixels wide; fades out when the lines get denser than the pixels
float gridAt(float c, float px) {
  float aa = fwidth(c);
  float d = abs(c - floor(c + 0.5));
  float cov = 1.0 - smoothstep(0.0, aa * px, d);
  return cov * (1.0 - smoothstep(0.3, 0.6, aa));
}
vec4 plate(vec2 uv) {
  vec2 p = uv * cells;
  float l = clamp(luma(blur(uv, 2.5)) * gain, 0.0, 1.0);

  // faded sheet: ink-blue with soft blotches and a faint lift where the picture is light
  float sheet = fbm(p * 0.06);
  float fade = 0.72 + 0.4 * sheet;
  vec3 col = inkCol * (0.9 + 0.25 * sheet) + paperCol * 0.045 * l;

  // fine grid and stronger major grid
  float minor = max(gridAt(p.x, 1.1), gridAt(p.y, 1.1));
  float major = max(gridAt(p.x / 5.0, 1.5), gridAt(p.y / 5.0, 1.5));
  col = mix(col, paperCol * fade, minor * 0.11);
  col = mix(col, paperCol * fade, major * 0.3);

  // light diagonal hatch carrying the image's tone, in a pale accent
  float hph = (p.x + p.y) * 2.6;
  float hw = smoothstep(0.12, 0.92, l) * 0.55;
  float haa = fwidth(hph);
  float hatch = smoothstep(0.5 * hw + haa, 0.5 * hw - haa, abs(fract(hph) - 0.5)) * (1.0 - smoothstep(0.3, 0.6, haa));
  col = mix(col, mix(accentCol, paperCol, 0.35) * fade, hatch * 0.4);

  // drawn edges
  float ol = smoothstep(edgeLo, edgeLo + 0.35, edge(uv, 1.2));
  col = mix(col, paperCol * (0.82 + 0.25 * sheet), ol * 0.95);

  // annotation crosses at a few major intersections
  vec2 gi = floor(p / 5.0 + 0.5);
  vec2 q = p - gi * 5.0;
  float on = step(0.8, hash(gi + 3.0));
  vec2 aw = fwidth(p);
  float arm = 0.9;
  float cross = max(smoothstep(0.5 * aw.y + aw.y, 0.0, abs(q.y)) * step(abs(q.x), arm), smoothstep(0.5 * aw.x + aw.x, 0.0, abs(q.x)) * step(abs(q.y), arm));
  col = mix(col, popCol, cross * on * 0.9);

  // sheet grain
  col *= 0.97 + 0.06 * hash(floor(uv / texel));
  return vec4(col, 1.0);
}`;

const front = /* glsl */ `
float gl(float c, float px) {
  float aa = fwidth(c);
  return (1.0 - smoothstep(0.0, aa * px, abs(c - floor(c + 0.5)))) * (1.0 - smoothstep(0.35, 0.7, aa));
}
vec3 shade(vec3 n, vec3 p) {
  vec2 q = p.xy;
  vec3 col = mix(inkCol, accentCol, 0.04) * (1.0 + 0.1 * vnoise(q * 4.0));
  float minor = max(gl(q.x * 12.0, 1.1), gl(q.y * 12.0, 1.1));
  float major = max(gl(q.x * 3.0, 1.5), gl(q.y * 3.0, 1.5));
  col = mix(col, paperCol, minor * 0.28);
  col = mix(col, paperCol, major * 0.55);
  return col;
}`;

const side = /* glsl */ `
vec3 shade(vec3 n, vec3 p) {
  float k = dot(n, normalize(vec3(-0.6, 0.6, 0.5)));
  return mix(mix(paperCol, inkCol, 0.4), paperCol, smoothstep(-0.2, 0.8, k)) * 0.95;
}`;

export const blueprint: Look = {
  id: "blueprint",
  label: "Blueprint",
  summary: "Technical drawing on a blue sheet: paper-white contour lines, fine grid with major lines, light tone hatch, small annotation crosses.",
  art: "Plain art with clear shapes and strong edges (architecture, objects, figures with clean silhouettes read best); the shader draws the lines and grid. No blueprint, grid or line-drawing style in the prompt.",
  palette: { ink: "#0B2A5B", paper: "#E8EEF5", accent: "#4DD2E8", pop: "#F4C542" },
  effects: "restrained",
  density: 60,
  plate,
  params: { edgeLo: 0.45 },
  refrain: (p) => ({ front: shadedMaterial(p, front), side: shadedMaterial(p, side), outline: outlineMaterial(p.paper, 0.028) }),
  post: { bloom: 0, ca: 0, noise: 0.03, vignette: 0.25 },
  lyricShadow: "0 0 2px rgba(2,10,28,0.95), 0 2px 0 rgba(2,10,28,0.9), 0 0 20px rgba(2,10,28,0.8)",
};
