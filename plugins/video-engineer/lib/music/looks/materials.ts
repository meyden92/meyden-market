// Material helpers for look refrains: palette uniforms, scene-light-independent shaded materials, inverted-hull outlines,
// and the palette studio environment for reflective looks.
import * as THREE from "three";
import { NOISE_GLSL, PALETTE_GLSL } from "./glsl";
import type { Palette, Uniform } from "./types";

const lum = (c: THREE.Color) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;

/** ink, paper, accent, pop as linear colours plus the 5-step ramp sorted dark to light. */
export const paletteUniforms = (p: Palette) => {
  const ink = new THREE.Color(p.ink);
  const accent = new THREE.Color(p.accent);
  const ramp = [ink, ink.clone().lerp(accent, 0.5), accent, new THREE.Color(p.pop), new THREE.Color(p.paper)].sort((a, b) => lum(a) - lum(b));
  return {
    inkCol: { value: ink },
    paperCol: { value: new THREE.Color(p.paper) },
    accentCol: { value: accent },
    popCol: { value: new THREE.Color(p.pop) },
    ramp: { value: ramp },
  };
};

export const toUniform = (v: Uniform) => ({ value: typeof v === "number" ? v : v.length === 2 ? new THREE.Vector2(...v) : new THREE.Vector3(...v) });
export const glslType = (v: Uniform) => (typeof v === "number" ? "float" : v.length === 2 ? "vec2" : "vec3");
/** Uniform declarations for a params record. */
export const declare = (params: Record<string, Uniform> = {}) =>
  Object.entries(params)
    .map(([k, v]) => `uniform ${glslType(v)} ${k};`)
    .join("\n");

/**
 * Shaded material that does not depend on scene lights. The fragment GLSL defines `vec3 shade(vec3 n, vec3 p)`:
 * n = view-space normal, p = object-space position (letter units). Palette uniforms, ramp and noise helpers are in scope.
 */
export const shadedMaterial = (p: Palette, frag: string, params: Record<string, Uniform> = {}) =>
  new THREE.ShaderMaterial({
    uniforms: { ...paletteUniforms(p), seed: { value: 0 }, ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, toUniform(v)])) },
    vertexShader: /* glsl */ `
      varying vec3 vN;
      varying vec3 vP;
      void main() {
        vN = normalize(normalMatrix * normal);
        vP = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform float seed;
      ${PALETTE_GLSL}
      ${NOISE_GLSL}
      ${declare(params)}
      varying vec3 vN;
      varying vec3 vP;
      ${frag}
      void main() { gl_FragColor = vec4(shade(normalize(vN), vP), 1.0); }`,
    toneMapped: false,
  });

/** Inverted hull: back faces pushed out along the normal by `width` (letter units). Text3D scales it to the type size. */
export const outlineMaterial = (color: string, width = 0.045, brightness = 1) =>
  new THREE.ShaderMaterial({
    uniforms: { color: { value: new THREE.Color(color).multiplyScalar(brightness) }, width: { value: width } },
    vertexShader: /* glsl */ `
      uniform float width;
      void main() { gl_Position = projectionMatrix * modelViewMatrix * vec4(position + normal * width, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform vec3 color;
      void main() { gl_FragColor = vec4(color, 1.0); }`,
    side: THREE.BackSide,
    toneMapped: false,
  });

/** Equirect studio in the palette: ink floor, accent and pop horizon bands, paper softbox strips. For reflective looks. */
export const paletteEnvTexture = (p: Palette) => {
  const c = document.createElement("canvas");
  c.width = 1024;
  c.height = 512;
  const g = c.getContext("2d")!;
  const sky = g.createLinearGradient(0, 0, 0, 512);
  sky.addColorStop(0, p.ink);
  sky.addColorStop(0.32, p.accent);
  sky.addColorStop(0.47, p.paper);
  sky.addColorStop(0.5, p.ink);
  sky.addColorStop(0.62, p.pop);
  sky.addColorStop(1, p.ink);
  g.fillStyle = sky;
  g.fillRect(0, 0, 1024, 512);
  g.fillStyle = p.paper;
  for (const [x, y, w, h] of [
    [120, 60, 70, 150],
    [430, 40, 220, 40],
    [760, 70, 60, 170],
    [300, 300, 300, 18],
  ])
    g.fillRect(x, y, w, h);
  const t = new THREE.CanvasTexture(c);
  t.mapping = THREE.EquirectangularReflectionMapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
};
