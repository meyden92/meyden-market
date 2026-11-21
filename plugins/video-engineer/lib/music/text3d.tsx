// Text3D: per-letter extruded type from FONT3D with a pose callback. Materials come from the look: useRefrainMaterials().
import React, { useMemo } from "react";
import * as THREE from "three";
import { TextGeometry } from "three/examples/jsm/geometries/TextGeometry.js";
import { mergeVertices, toCreasedNormals } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { FONT3D } from "./fonts";
import type { V3 } from "./three";

export type LetterPose = { pos?: V3; rot?: V3; scale?: number; visible?: boolean };

/**
 * Extruded type in the static 3D font (config.font3d), one mesh per letter so letters can stamp, tilt or sink on their own.
 * Front faces use `front`, sides and bevel use `side`; `outline` (an inverted-hull material, e.g. from the look) is drawn
 * behind each letter, `outlineWidth` in letter units (default 4.5 % of `size`). Spread useRefrainMaterials() into it.
 */
export const Text3D: React.FC<{
  text: string;
  size: number;
  depth: number;
  front: THREE.Material;
  side: THREE.Material;
  outline?: THREE.Material;
  outlineWidth?: number;
  tracking?: number;
  pose?: (i: number, ch: string) => LetterPose;
  position?: V3;
  rotation?: V3;
  scale?: number | V3;
}> = ({ text, size, depth, front, side, outline, outlineWidth, tracking = 0.035, pose, position, rotation, scale = 1 }) => {
  const letters = useMemo(() => {
    const font = FONT3D.font;
    if (!font) throw new Error("lib/music: Text3D needs font3d in theme.ts (a static TTF from scripts/font-ttf.mjs)");
    const out: { ch: string; geo: THREE.BufferGeometry | null; hull: THREE.BufferGeometry | null; x: number; w: number }[] = [];
    let x = 0;
    for (const ch of text) {
      if (ch === " ") {
        x += size * 0.42;
        out.push({ ch, geo: null, hull: null, x, w: 0 });
        continue;
      }
      let g: THREE.BufferGeometry = new TextGeometry(ch, { font, size, depth, curveSegments: 10, bevelEnabled: true, bevelThickness: size * 0.035, bevelSize: size * 0.022, bevelSegments: 4 });
      g.computeBoundingBox();
      const bb = g.boundingBox!;
      const w = bb.max.x - bb.min.x;
      g.translate(-bb.min.x - w / 2, 0, -depth / 2);
      // the hull needs smooth normals over welded vertices, or it splits open at every crease
      const hull = mergeVertices(g.clone().deleteAttribute("normal").deleteAttribute("uv"));
      hull.computeVertexNormals();
      g = toCreasedNormals(g, 0.7);
      out.push({ ch, geo: g, hull, x: x + w / 2, w });
      x += w + size * tracking;
    }
    const total = x - size * tracking;
    return { list: out.map((l) => ({ ...l, x: l.x - total / 2 })), total };
  }, [text, size, depth, tracking]);
  const hullMat = useMemo(() => {
    if (!outline) return null;
    const m = outline.clone() as THREE.ShaderMaterial;
    if (m.uniforms?.width) m.uniforms.width.value = outlineWidth ?? size * 0.045;
    return m;
  }, [outline, outlineWidth, size]);
  return (
    <group position={position} rotation={rotation} scale={scale}>
      {letters.list.map((l, i) => {
        if (!l.geo) return null;
        const p = pose?.(i, l.ch) ?? {};
        if (p.visible === false) return null;
        return (
          <group key={i} position={[l.x + (p.pos?.[0] ?? 0), p.pos?.[1] ?? 0, p.pos?.[2] ?? 0]} rotation={p.rot} scale={p.scale ?? 1}>
            <mesh geometry={l.geo} material={[front, side]} />
            {hullMat && l.hull ? <mesh geometry={l.hull} material={hullMat} /> : null}
          </group>
        );
      })}
    </group>
  );
};
