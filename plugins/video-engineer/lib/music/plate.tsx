// Plate: an image plate printed in the current look (halftone, linocut, pixel, film, ...). makePlateMaterial is the same
// material for custom meshes. Generate PLAIN art for plates; the look's shader adds the treatment.
import React, { useMemo } from "react";
import * as THREE from "three";
import { useCurrentFrame } from "remotion";
import { music } from "./config";
import { PLATE_PRELUDE } from "./looks/glsl";
import { declare, paletteUniforms, toUniform } from "./looks/materials";
import { getLook, LookId, useLook, usePalette } from "./looks";
import type { Look, Palette, Uniform } from "./looks/types";
import type { V3 } from "./three";

const vert = /* glsl */ `
varying vec2 vUv;
#include <fog_pars_vertex>
void main() {
  vUv = uv;
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

const textureCache = new Map<string, Record<string, THREE.Texture>>();
const lookTextures = (look: Look) => {
  if (!look.textures) return {};
  if (!textureCache.has(look.id)) textureCache.set(look.id, look.textures());
  return textureCache.get(look.id)!;
};

const frag = (look: Look) => /* glsl */ `
${PLATE_PRELUDE}
uniform float opacity;
uniform float blackout;
${declare(look.params)}
${Object.keys(lookTextures(look))
  .map((k) => `uniform sampler2D ${k};`)
  .join("\n")}
varying vec2 vUv;
#include <fog_pars_fragment>
${look.plate}
void main() {
  if (tex(vUv).a < 0.5) discard;
  vec4 c = plate(vUv);
  c.rgb = mix(inkCol, c.rgb, clamp(poolGain(vUv), 0.0, 1.0));
  c.rgb = mix(c.rgb, inkCol, blackout);
  if (c.a < 0.02) discard;
  gl_FragColor = vec4(c.rgb, opacity * c.a);
  #include <fog_fragment>
}`;

/** Shader material that prints `map` in `look` and `palette` (default: the project's). `cells` = screen cells across and down. */
export const makePlateMaterial = (map: THREE.Texture, cells: [number, number], seed = 0, look: Look = getLook(music().look ?? "plain"), palette: Palette = music().palette) =>
  new THREE.ShaderMaterial({
    uniforms: {
      ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
      ...paletteUniforms(palette),
      map: { value: map },
      uvRect: { value: new THREE.Vector4(0, 0, 1, 1) },
      texel: { value: new THREE.Vector2(1 / 1024, 1 / 1024) },
      cells: { value: new THREE.Vector2(...cells) },
      jitter: { value: 0 },
      seed: { value: seed },
      gain: { value: 1 },
      uTime: { value: 0 },
      pool: { value: new THREE.Vector3(0, 0, 0) },
      opacity: { value: 1 },
      blackout: { value: 0 },
      ...Object.fromEntries(Object.entries(look.params ?? {}).map(([k, v]) => [k, toUniform(v)])),
      ...Object.fromEntries(Object.entries(lookTextures(look)).map(([k, v]) => [k, { value: v }])),
    },
    vertexShader: vert,
    fragmentShader: frag(look),
    transparent: true,
    fog: true,
    toneMapped: false,
  });

const setUniform = (u: { value: unknown }, v: Uniform) => {
  if (typeof v === "number") u.value = v;
  else (u.value as THREE.Vector2 | THREE.Vector3).set(...(v as [number, number, number]));
};

/**
 * A world plate printed in the look. `density` = screen rows across the plate height (look default if omitted);
 * `jitter` (0..1, usually the high band) shakes the screen; `gain` brightens; `blackout` fades to ink;
 * `params` overrides the look's own uniforms (see the look file); `look` forces another look for this plate only.
 */
export const Plate: React.FC<{
  map: THREE.Texture;
  width: number;
  aspect?: number;
  density?: number;
  jitter?: number;
  gain?: number;
  blackout?: number;
  opacity?: number;
  position?: V3;
  rotation?: V3;
  seed?: number;
  renderOrder?: number;
  depthWrite?: boolean;
  /** light pool: [u, v, radius] in plate UV; the plate fades to ink outside it */
  pool?: V3;
  /** crop of the source image: [u0, v0, du, dv] */
  crop?: [number, number, number, number];
  params?: Record<string, Uniform>;
  look?: LookId;
}> = ({ map, width, aspect = 1.5, density, jitter = 0, gain = 1, blackout = 0, opacity = 1, position, rotation, seed = 0, renderOrder, depthWrite = true, pool, crop, params, look: lookId }) => {
  const ctx = useLook();
  const palette = usePalette();
  const look = lookId ? getLook(lookId) : ctx;
  const rows = density ?? look.density;
  const frame = useCurrentFrame();
  const mat = useMemo(() => makePlateMaterial(map, [(rows * aspect) / (look.cellAspect ?? 1), rows], seed, look, palette), [map, rows, aspect, seed, look, palette]);
  const u = mat.uniforms;
  const rect = crop ?? [0, 0, 1, 1];
  const img = map.image as { width: number; height: number } | undefined;
  u.uvRect.value.set(...rect);
  if (img?.width) u.texel.value.set(1 / (img.width * rect[2]), 1 / (img.height * rect[3]));
  u.jitter.value = jitter;
  u.gain.value = gain;
  u.blackout.value = blackout;
  u.opacity.value = opacity;
  u.uTime.value = frame / music().fps;
  u.pool.value.set(...(pool ?? [0, 0, 0]));
  for (const [k, v] of Object.entries({ ...look.params, ...params })) setUniform(u[k], v);
  mat.depthWrite = depthWrite;
  return (
    <mesh position={position} rotation={rotation} material={mat} renderOrder={renderOrder}>
      <planeGeometry args={[width, width / aspect]} />
    </mesh>
  );
};
