// 3D shot toolkit: ShotCanvas (WebGL + synchronous post stack in the current look), useCameraRig, drift, RingBand, Dust, Card.
// Render with `--gl=angle`; textures must be decoded first (useAssetsReady).
import React, { useLayoutEffect, useMemo } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { ThreeCanvas } from "@remotion/three";
import * as PP from "postprocessing";
import { useCurrentFrame } from "remotion";
import { music } from "./config";
import { LookId, LookScope, useLook, usePalette } from "./looks";
import { SCREEN_PRELUDE } from "./looks/glsl";
import { declare, paletteEnvTexture, paletteUniforms, toUniform } from "./looks/materials";
import type { Look, Palette } from "./looks/types";
import { rnd } from "./textures";

export type V3 = [number, number, number];

/**
 * WebGL canvas for one shot: background, fog, camera defaults, and the look's post stack and screen pass.
 * `post` overrides single values of the look's post defaults.
 */
export const ShotCanvas: React.FC<{
  bg: string;
  fog?: [number, number];
  fov?: number;
  children: React.ReactNode;
  post?: PostProps;
}> = ({ bg, fog, fov = 50, children, post }) => {
  const look = useLook();
  const palette = usePalette();
  return (
    <ThreeCanvas
      width={music().width}
      height={music().height}
      flat
      gl={{ antialias: false, powerPreference: "high-performance", preserveDrawingBuffer: true }}
      camera={{ fov, near: 0.1, far: 400, position: [0, 0, 10] }}
      dpr={1}
    >
      <LookScope look={look.id as LookId} palette={palette}>
        <color attach="background" args={[bg]} />
        {fog ? <fog attach="fog" args={[bg, fog[0], fog[1]]} /> : null}
        {look.environment ? <PaletteEnvironment /> : null}
        {children}
        <Post look={look} palette={palette} {...look.post} {...post} />
      </LookScope>
    </ThreeCanvas>
  );
};

/** Palette studio as scene.environment, for reflective look materials. */
const PaletteEnvironment: React.FC = () => {
  const { gl, scene } = useThree();
  const palette = usePalette();
  useLayoutEffect(() => {
    const pm = new THREE.PMREMGenerator(gl);
    const src = paletteEnvTexture(palette);
    const env = pm.fromEquirectangular(src).texture;
    scene.environment = env;
    return () => {
      scene.environment = null;
      env.dispose();
      src.dispose();
      pm.dispose();
    };
  }, [gl, scene, palette]);
  return null;
};

/** The look's screen pass as a postprocessing effect; uniforms: palette, uTime, seed, jitter and the look's screenParams. */
const makeScreenEffect = (look: Look, palette: Palette) =>
  new PP.Effect("LookScreen", `${SCREEN_PRELUDE}\n${declare(look.screenParams)}\n${look.screen}`, {
    attributes: PP.EffectAttribute.CONVOLUTION,
    uniforms: new Map<string, THREE.Uniform>(
      Object.entries({ ...paletteUniforms(palette), uTime: { value: 0 }, seed: { value: 0 }, jitter: { value: 0 }, ...Object.fromEntries(Object.entries(look.screenParams ?? {}).map(([k, v]) => [k, toUniform(v)])) }).map(([k, u]) => [k, new THREE.Uniform(u.value)]),
    ),
  });

export type PostProps = {
  bloom?: number;
  bloomThreshold?: number;
  focus?: number;
  focusRange?: number;
  bokeh?: number;
  ca?: number;
  noise?: number;
  vignette?: number;
  /** 0..1 fed to the look's screen pass (e.g. the high band). */
  jitter?: number;
};

/**
 * Post stack built synchronously with postprocessing classes. @react-three/postprocessing's
 * EffectComposer creates its composer in a passive effect, after ThreeCanvas has already
 * advanced the frame, so headless renders came out blank.
 * useFrame is used only as the render hook (priority 1); all animation is frame-derived.
 */
const Post: React.FC<PostProps & { look: Look; palette: Palette }> = ({ look, palette, bloom = 0.6, bloomThreshold = 0.8, focus, focusRange = 6, bokeh = 3, ca = 0, noise = 0.12, vignette = 0.45, jitter = 0 }) => {
  const { gl, scene, camera, size } = useThree();
  const frame = useCurrentFrame();
  const fx = useMemo(() => {
    const composer = new PP.EffectComposer(gl, { multisampling: 4, frameBufferType: THREE.HalfFloatType });
    composer.addPass(new PP.RenderPass(scene, camera));
    const dof = focus !== undefined ? new PP.DepthOfFieldEffect(camera, { worldFocusDistance: focus, worldFocusRange: focusRange, bokehScale: bokeh }) : null;
    if (dof) composer.addPass(new PP.EffectPass(camera, dof));
    const bloomFx = new PP.BloomEffect({ intensity: bloom, luminanceThreshold: bloomThreshold, luminanceSmoothing: 0.2, mipmapBlur: true, radius: 0.7 });
    const caFx = new PP.ChromaticAberrationEffect({ offset: new THREE.Vector2(ca, ca * 0.6), radialModulation: false, modulationOffset: 0 });
    const noiseFx = new PP.NoiseEffect({ premultiply: false, blendFunction: PP.BlendFunction.OVERLAY });
    noiseFx.blendMode.opacity.value = noise;
    const vig = new PP.VignetteEffect({ offset: 0.3, darkness: vignette });
    composer.addPass(new PP.EffectPass(camera, bloomFx));
    composer.addPass(new PP.EffectPass(camera, caFx));
    const screen = look.screen ? makeScreenEffect(look, palette) : null;
    if (screen) composer.addPass(new PP.EffectPass(camera, screen));
    composer.addPass(new PP.EffectPass(camera, noiseFx, vig));
    composer.setSize(size.width, size.height);
    return { composer, dof, bloomFx, caFx, screen };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gl, scene, camera, look, palette]);
  if (fx.dof && focus !== undefined) {
    fx.dof.cocMaterial.worldFocusDistance = focus;
    fx.dof.cocMaterial.worldFocusRange = focusRange;
    fx.dof.bokehScale = bokeh;
  }
  fx.bloomFx.intensity = bloom;
  fx.caFx.offset.set(ca, ca * 0.6);
  if (fx.screen) {
    fx.screen.uniforms.get("uTime")!.value = frame / music().fps;
    fx.screen.uniforms.get("jitter")!.value = jitter;
  }
  React.useEffect(() => () => fx.composer.dispose(), [fx]);
  const { fps } = music();
  useFrame(() => {
    fx.composer.render(1 / fps);
  }, 1);
  return null;
};

/** Drives the default camera from the current frame (deterministic, no useFrame). */
export const useCameraRig = (fn: (f: number) => { pos: V3; look: V3; roll?: number; fov?: number }) => {
  const { camera } = useThree();
  const f = useCurrentFrame();
  useLayoutEffect(() => {
    const c = camera as THREE.PerspectiveCamera;
    const s = fn(f);
    c.position.set(...s.pos);
    c.up.set(Math.sin(s.roll ?? 0), Math.cos(s.roll ?? 0), 0);
    c.lookAt(...s.look);
    if (s.fov && c.fov !== s.fov) {
      c.fov = s.fov;
    }
    c.updateProjectionMatrix();
  });
};

/** Smooth pseudo-noise for handheld drift. */
export const drift = (f: number, seed: number, amp = 1) =>
  amp * (Math.sin(f * 0.031 + seed) * 0.6 + Math.sin(f * 0.077 + seed * 2.3) * 0.3 + Math.sin(f * 0.19 + seed * 5.1) * 0.1);

/** Open cylinder band carrying a canvas texture (text ring / ribbon). */
export const RingBand: React.FC<{
  radius: number;
  height: number;
  texture: THREE.Texture;
  repeat?: number;
  angle: number;
  position?: V3;
  tilt?: V3;
  innerTint?: string;
  emissive?: number;
}> = ({ radius, height, texture, repeat = 2, angle, position, tilt, innerTint = "#777777", emissive = 0 }) => {
  const [t, tBack] = useMemo(() => {
    const mk = (r: number) => {
      const c = texture.clone();
      c.wrapS = THREE.RepeatWrapping;
      c.repeat.set(r, 1);
      c.needsUpdate = true;
      return c;
    };
    // the inside of a cylinder shows the texture mirrored; a negative repeat un-mirrors it
    return [mk(repeat), mk(-repeat)];
  }, [texture, repeat]);
  return (
    <group position={position} rotation={tilt}>
      <group rotation={[0, angle, 0]}>
        <mesh>
          <cylinderGeometry args={[radius, radius, height, 160, 1, true]} />
          <meshBasicMaterial map={t} side={THREE.FrontSide} toneMapped={false} color={new THREE.Color(1 + emissive, 1 + emissive, 1 + emissive)} />
        </mesh>
        <mesh>
          <cylinderGeometry args={[radius * 0.995, radius * 0.995, height, 160, 1, true]} />
          <meshBasicMaterial map={tBack} side={THREE.BackSide} color={innerTint} toneMapped={false} />
        </mesh>
      </group>
    </group>
  );
};

/** Floating particles: seeded positions, drift derived from frame, wrapped inside a box. */
export const Dust: React.FC<{ count: number; box: V3; center?: V3; size: number; color: string; seed: string; vel?: V3; opacity?: number }> = ({ count, box, center = [0, 0, 0], size, color, seed, vel = [0, 0.01, 0], opacity = 0.9 }) => {
  const f = useCurrentFrame();
  const base = useMemo(() => Array.from({ length: count }, (_, i) => [rnd(seed, i * 3), rnd(seed, i * 3 + 1), rnd(seed, i * 3 + 2)]), [count, seed]);
  const geo = useMemo(() => new THREE.BufferGeometry(), []);
  const sprite = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const g = c.getContext("2d")!;
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, "rgba(255,255,255,1)");
    gr.addColorStop(0.35, "rgba(255,255,255,0.8)");
    gr.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = gr;
    g.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  }, []);
  const pos = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    for (let k = 0; k < 3; k++) {
      const u = (((base[i][k] + (vel[k] * f) / box[k]) % 1) + 1) % 1;
      pos[i * 3 + k] = center[k] + (u - 0.5) * box[k];
    }
  }
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  return (
    <points geometry={geo}>
      <pointsMaterial size={size} map={sprite} color={color} transparent opacity={opacity} depthWrite={false} sizeAttenuation />
    </points>
  );
};

/** Flat card with a canvas texture; optional thickness slab behind it. */
export const Card: React.FC<{ texture: THREE.Texture; aspect: number; width: number; position?: V3; rotation?: V3; back?: string; thickness?: number; opacity?: number; bright?: number }> = ({ texture, aspect, width, position, rotation, back, thickness = 0.06, opacity = 1, bright = 1 }) => (
  <group position={position} rotation={rotation}>
    {back ? (
      <mesh position={[thickness * 0.6, -thickness * 0.9, -thickness]}>
        <planeGeometry args={[width, width / aspect]} />
        <meshBasicMaterial map={texture} color={back} transparent alphaTest={0.4} opacity={opacity} side={THREE.DoubleSide} toneMapped={false} />
      </mesh>
    ) : null}
    <mesh>
      <planeGeometry args={[width, width / aspect]} />
      <meshBasicMaterial map={texture} transparent alphaTest={0.02} opacity={opacity} side={THREE.DoubleSide} toneMapped={false} color={new THREE.Color(bright, bright, bright)} />
    </mesh>
  </group>
);

