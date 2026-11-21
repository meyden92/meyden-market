// GLSL shared by every look: uniforms and helpers for plate shaders (plate UV space) and screen passes.

/** Palette uniforms: the four project colours and a 5-step ramp sorted dark to light (ink, ink/accent, accent, pop, paper). */
export const PALETTE_GLSL = /* glsl */ `
uniform vec3 inkCol;
uniform vec3 paperCol;
uniform vec3 accentCol;
uniform vec3 popCol;
uniform vec3 ramp[5];
vec3 rampAt(float t) {
  float x = clamp(t, 0.0, 1.0) * 4.0;
  int i = int(min(floor(x), 3.0));
  float f = x - float(i);
  vec3 a = ramp[0], b = ramp[1];
  if (i == 1) { a = ramp[1]; b = ramp[2]; }
  if (i == 2) { a = ramp[2]; b = ramp[3]; }
  if (i == 3) { a = ramp[3]; b = ramp[4]; }
  return mix(a, b, f);
}
vec3 rampStep(float t) {
  int i = int(clamp(floor(t * 5.0), 0.0, 4.0));
  if (i == 0) return ramp[0];
  if (i == 1) return ramp[1];
  if (i == 2) return ramp[2];
  if (i == 3) return ramp[3];
  return ramp[4];
}`;

/** Noise and shape helpers. `seed` must be declared by the including shader. */
export const NOISE_GLSL = /* glsl */ `
mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7)) + seed) * 43758.5453); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm(vec2 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) { s += a * vnoise(p); p = rot(0.5) * p * 2.03 + 11.0; a *= 0.5; }
  return s;
}
// colours arrive linear (sRGB textures, THREE.Color); luma is perceptual so thresholds read like image values
float luma(vec3 c) { return dot(pow(max(c, 0.0), vec3(0.4545)), vec3(0.299, 0.587, 0.114)); }
vec3 toLin(vec3 c) { return pow(max(c, 0.0), vec3(2.2)); }
float bayer2(vec2 a) { a = floor(a); return fract(a.x / 2.0 + a.y * a.y * 0.75); }
float bayer4(vec2 a) { return bayer2(0.5 * a) * 0.25 + bayer2(a); }`;

/**
 * Plate prelude: everything a look's `plate` GLSL can use.
 * - tex(uv): the plate image at plate UV (0..1, crop applied); texel: one source pixel in plate UV
 * - blur(uv, r): 9-tap blur, r in source pixels (small radii); softBlur(uv, r): 16-tap spiral disc blur for large radii
 * - kuwahara(uv, r): edge-preserving smoothing over radius r source pixels (flat areas, sharp shape boundaries)
 * - edge(uv, r): Sobel luma edge strength, offsets r source pixels
 * - texel: one source pixel in plate UV (crop applied), so radii in source pixels scale with the image, not the screen
 * - cells: the look's screen (dots, pixels, lines, glyphs) across and down the plate
 * - gain, jitter (0..1, usually the high band), uTime (seconds), seed
 */
export const PLATE_PRELUDE = /* glsl */ `
uniform sampler2D map;
uniform vec4 uvRect;
uniform vec2 texel;
uniform vec2 cells;
uniform float jitter;
uniform float seed;
uniform float gain;
uniform float uTime;
uniform vec3 pool;
${PALETTE_GLSL}
${NOISE_GLSL}
vec4 tex(vec2 uv) { return texture2D(map, uvRect.xy + uv * uvRect.zw); }
vec3 blur(vec2 uv, float r) {
  vec2 d = texel * r;
  vec3 s = tex(uv).rgb * 0.25;
  s += (tex(uv + vec2(d.x, 0.0)).rgb + tex(uv - vec2(d.x, 0.0)).rgb + tex(uv + vec2(0.0, d.y)).rgb + tex(uv - vec2(0.0, d.y)).rgb) * 0.125;
  s += (tex(uv + d).rgb + tex(uv - d).rgb + tex(uv + vec2(d.x, -d.y)).rgb + tex(uv + vec2(-d.x, d.y)).rgb) * 0.0625;
  return s;
}
vec3 softBlur(vec2 uv, float r) {
  vec3 s = vec3(0.0);
  for (int i = 0; i < 16; i++) {
    float fi = float(i) + 0.5;
    float a = fi * 2.39996;
    s += tex(uv + vec2(cos(a), sin(a)) * sqrt(fi / 16.0) * r * texel).rgb;
  }
  return s / 16.0;
}
vec3 kuwahara(vec2 uv, float r) {
  vec2 d = texel * r / 3.0;
  vec3 best = tex(uv).rgb;
  float bestVar = 1e9;
  for (int q = 0; q < 4; q++) {
    vec2 sg = vec2(q == 0 || q == 2 ? -1.0 : 1.0, q < 2 ? -1.0 : 1.0);
    vec3 s = vec3(0.0), s2 = vec3(0.0);
    for (int i = 0; i < 4; i++) {
      for (int j = 0; j < 4; j++) {
        vec3 c = tex(uv + sg * vec2(float(i), float(j)) * d).rgb;
        s += c;
        s2 += c * c;
      }
    }
    s /= 16.0;
    vec3 v = abs(s2 / 16.0 - s * s);
    float var = v.r + v.g + v.b;
    if (var < bestVar) { bestVar = var; best = s; }
  }
  return best;
}
float edge(vec2 uv, float r) {
  vec2 d = texel * r;
  float tl = luma(tex(uv + vec2(-d.x, d.y)).rgb), t = luma(tex(uv + vec2(0.0, d.y)).rgb), tr = luma(tex(uv + d).rgb);
  float l = luma(tex(uv - vec2(d.x, 0.0)).rgb), rr = luma(tex(uv + vec2(d.x, 0.0)).rgb);
  float bl = luma(tex(uv - d).rgb), b = luma(tex(uv - vec2(0.0, d.y)).rgb), br = luma(tex(uv + vec2(d.x, -d.y)).rgb);
  float gx = (tr + 2.0 * rr + br) - (tl + 2.0 * l + bl);
  float gy = (tl + 2.0 * t + tr) - (bl + 2.0 * b + br);
  return length(vec2(gx, gy));
}
float poolGain(vec2 uv) { return pool.z > 0.0 ? smoothstep(pool.z * 1.2, 0.0, distance(uv, pool.xy)) * 1.4 + 0.15 : 1.0; }`;

/** Screen-pass prelude (postprocessing Effect): palette, noise and uTime; `inputBuffer`, `resolution` and `texelSize` come from postprocessing. */
export const SCREEN_PRELUDE = /* glsl */ `
uniform float uTime;
uniform float seed;
uniform float jitter;
${PALETTE_GLSL}
${NOISE_GLSL}`;
