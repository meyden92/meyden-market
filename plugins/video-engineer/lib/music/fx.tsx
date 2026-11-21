// Particle effects for 3D shots: Burst (timed point bursts), Flakes (falling confetti/ash/shards, instanced); Grain (film-grain overlay).
import React, { useMemo } from "react";
import * as THREE from "three";
import { AbsoluteFill, random } from "remotion";
import type { V3 } from "./three";

const r = (seed: string, i: number, lo = 0, hi = 1) => lo + (hi - lo) * random(`${seed}-${i}`);

const dotSprite = (() => {
  let t: THREE.Texture | null = null;
  return () => {
    if (t) return t;
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const g = c.getContext("2d")!;
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, "rgba(255,255,255,1)");
    gr.addColorStop(0.4, "rgba(255,255,255,0.85)");
    gr.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = gr;
    g.fillRect(0, 0, 64, 64);
    t = new THREE.CanvasTexture(c);
    return t;
  };
})();

/** Point bursts fired at given times (seconds); positions are closed-form in (t - t0). */
export const Burst: React.FC<{ times: number[]; t: number; count: number; center: V3; color: string; seed: string; speed?: number; life?: number; size?: number; gravity?: number; spread?: V3 }> = ({ times, t, count, center, color, seed, speed = 6, life = 1.2, size = 0.12, gravity = 4, spread = [1, 0.7, 1] }) => {
  const dirs = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => {
        const th = r(seed, i * 3, 0, Math.PI * 2);
        const ph = Math.acos(r(seed, i * 3 + 1, -1, 1));
        const v = r(seed, i * 3 + 2, 0.35, 1);
        return [Math.sin(ph) * Math.cos(th) * v * spread[0], Math.abs(Math.cos(ph)) * v * spread[1] + 0.2, Math.sin(ph) * Math.sin(th) * v * spread[2]];
      }),
    [count, seed, spread],
  );
  const geo = useMemo(() => new THREE.BufferGeometry(), []);
  const active = times.filter((x) => t >= x && t < x + life);
  const pos = new Float32Array(active.length * count * 3);
  let k = 0;
  let fade = 0;
  for (const t0 of active) {
    const dt = t - t0;
    const e = 1 - Math.exp(-dt * 3.2);
    fade = Math.max(fade, 1 - dt / life);
    for (const d of dirs) {
      pos[k++] = center[0] + d[0] * speed * e * 0.6;
      pos[k++] = center[1] + d[1] * speed * e * 0.6 - gravity * dt * dt * 0.5;
      pos[k++] = center[2] + d[2] * speed * e * 0.6;
    }
  }
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  if (!active.length) return null;
  return (
    <points geometry={geo}>
      <pointsMaterial size={size} map={dotSprite()} color={color} transparent opacity={Math.min(1, fade * 1.6)} depthWrite={false} sizeAttenuation toneMapped={false} />
    </points>
  );
};

/**
 * Falling flakes (confetti, ash, paper, shards) as one instanced mesh. Each flake loops on its own
 * period; `density` (0..1, e.g. the high band) decides what fraction of flakes is alive.
 */
export const Flakes: React.FC<{ t: number; count: number; box: V3; center?: V3; seed: string; size: [number, number]; fall?: number; spin?: number; density?: number; geometry?: "plane" | "shard"; material: THREE.Material; drift?: number; zeroG?: number }> = ({ t, count, box, center = [0, 0, 0], seed, size, fall = 1.2, spin = 2, density = 1, geometry = "plane", material, drift = 0.4, zeroG = 0 }) => {
  const geo = useMemo(() => {
    if (geometry === "shard") {
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute([0, 0.6, 0, -0.35, -0.4, 0.05, 0.45, -0.3, -0.05, 0, 0.6, 0, 0.45, -0.3, -0.05, 0.1, -0.1, 0.25], 3));
      g.computeVertexNormals();
      return g;
    }
    return new THREE.PlaneGeometry(1, 0.6);
  }, [geometry]);
  const mesh = useMemo(() => new THREE.InstancedMesh(geo, material, count), [geo, material, count]);
  const p = useMemo(() => Array.from({ length: count }, (_, i) => ({ x: r(seed, i * 7), y: r(seed, i * 7 + 1), z: r(seed, i * 7 + 2), s: r(seed, i * 7 + 3, size[0], size[1]), a: r(seed, i * 7 + 4, 0, 6.28), b: r(seed, i * 7 + 5, 0, 6.28), th: r(seed, i * 7 + 6) })), [count, seed, size]);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const v = new THREE.Vector3();
  const sc = new THREE.Vector3();
  const g = 1 - zeroG;
  p.forEach((it, i) => {
    const yy = (((it.y - (t * fall * g * (0.6 + it.th * 0.8)) / box[1]) % 1) + 1) % 1;
    v.set(center[0] + (it.x - 0.5) * box[0] + Math.sin(t * 0.9 + it.a) * drift, center[1] + (yy - 0.5) * box[1], center[2] + (it.z - 0.5) * box[2]);
    e.set(it.a + t * spin * (0.3 + g * 0.7), it.b + t * spin * 0.7 * (0.3 + g * 0.7), it.a * 0.5);
    q.setFromEuler(e);
    const alive = it.th < density ? 1 : 0;
    sc.setScalar(it.s * alive + 1e-5);
    m.compose(v, q, sc);
    mesh.setMatrixAt(i, m);
  });
  mesh.instanceMatrix.needsUpdate = true;
  return <primitive object={mesh} />;
};

/** Animated film grain over the whole frame; pass the current frame so it changes every frame. */
export const Grain: React.FC<{ frame: number; opacity?: number }> = ({ frame, opacity = 0.13 }) => (
  <AbsoluteFill style={{ pointerEvents: "none", mixBlendMode: "overlay", opacity }}>
    <svg width="100%" height="100%">
      <filter id={`g${frame % 7}`}>
        <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves={2} seed={frame % 97} />
        <feColorMatrix type="saturate" values="0" />
      </filter>
      <rect width="100%" height="100%" filter={`url(#g${frame % 7})`} />
    </svg>
  </AbsoluteFill>
);
