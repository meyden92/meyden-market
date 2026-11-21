// pixel: 8-bit. The whole 3D frame is snapped to a coarse pixel grid, ordered-dithered to a few levels per channel
// and pulled toward the 5-step palette ramp.
// Plates only add contrast; the screen pass does the pixels. Lyric text stays crisp with a hard pixel drop shadow.
import { shadedMaterial } from "./materials";
import type { Look } from "./types";

const plate = /* glsl */ `
vec4 plate(vec2 uv) {
  vec3 c = blur(uv, 1.5) * gain;
  float l = luma(c);
  // push the image apart so the dither has clear bands to work with
  return vec4(c * (0.7 + 0.6 * smoothstep(0.1, 0.9, l)), 1.0);
}`;

const screen = /* glsl */ `
void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  vec2 grid = vec2(rows * resolution.x / resolution.y, rows);
  vec2 cell = floor(uv * grid);
  vec3 c = texture2D(inputBuffer, (cell + 0.5) / grid).rgb;
  // ordered dither, then each channel posterised to the given levels; the result is pulled toward the palette ramp
  float d = bayer4(cell) - 0.5;
  vec3 g = pow(max(c, 0.0), vec3(0.4545));
  vec3 q = clamp(floor(g * (levels - 1.0) + d * spread + 0.5) / (levels - 1.0), 0.0, 1.0);
  vec3 pal = rampStep(clamp(luma(c) + d * spread * 0.2, 0.0, 0.999));
  vec3 col = mix(toLin(q), pal, palette);
  outputColor = vec4(col, 1.0);
}`;

const front = /* glsl */ `
vec3 shade(vec3 n, vec3 p) {
  // two-tone pixel face: paper with an accent band at the foot of the letters
  float band = step(p.y, 0.18);
  return mix(paperCol, accentCol, band);
}`;

const side = /* glsl */ `
vec3 shade(vec3 n, vec3 p) {
  float k = dot(n, normalize(vec3(-0.5, 0.7, 0.4)));
  return k > 0.2 ? ramp[2] : k > -0.3 ? ramp[1] : ramp[0];
}`;

export const pixel: Look = {
  id: "pixel",
  label: "8-bit pixel",
  summary: "Retro game screen: the whole frame snapped to big pixels, ordered-dithered to a few colours per channel, pulled toward the palette.",
  art: "Plain art with big simple shapes, strong silhouettes and clear light and dark areas; fine detail is lost at the pixel size. No pixel art in the prompt.",
  palette: { ink: "#1B1530", paper: "#F8F3D4", accent: "#E94F64", pop: "#43C6AC" },
  effects: "restrained",
  density: 60,
  plate,
  refrain: (p) => ({ front: shadedMaterial(p, front), side: shadedMaterial(p, side) }),
  post: { bloom: 0, ca: 0, noise: 0, vignette: 0 },
  screen,
  screenParams: { rows: 120, spread: 0.45, levels: 4, palette: 0.35 },
  lyricShadow: "6px 6px 0 rgba(0,0,0,0.85)",
};
