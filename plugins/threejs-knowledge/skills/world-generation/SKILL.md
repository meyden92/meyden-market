---
name: world-generation
description: "Building explorable three.js environments from a description: seeded procedural terrain from layered noise, regions and biomes, splat-blended ground, water, sky and fog, instanced scattering of trees and rocks, placed landmarks, chunking and level of detail, and camera fly-throughs. Use when asked for a landscape, island, planet surface, city block, forest, level, open world or any 3D environment larger than a single object."
---

# World generation

A world is one data description rendered by code, so that it can be regenerated, edited and inspected. Write the description first, then the generator.

## 1. Write the world spec

One plain object, kept in its own file. Everything random derives from `seed`.

```javascript
export const world = {
  seed: 1337,
  size: 512,            // metres on a side
  resolution: 256,      // height samples per side
  heightRange: [-8, 60],
  seaLevel: 0,
  regions: [
    // normalized centre and radius; each region shapes terrain, palette and scatter
    { id: "highlands", center: [0.7, 0.3], radius: 0.35, landform: "ridged", palette: ["#5b6b4a", "#8a8f86"], scatter: ["pine", "boulder"] },
    { id: "delta", center: [0.3, 0.7], radius: 0.3, landform: "flat", palette: ["#7d8f55", "#b9a878"], scatter: ["reed", "willow"] },
  ],
  landmarks: [{ id: "tower", model: "tower.glb", at: [0.68, 0.28], scale: 1 }],
  atmosphere: { sun: [0.4, 0.6, 0.2], fog: ["#c9d6df", 0.0025], sky: "clear" },
  cameraPath: [{ t: 0, position: [0.1, 40, 0.9], target: [0.5, 5, 0.5] }],
};
```

Keep what the user stated apart from what you added: mark invented regions and landmarks in a comment, and name them in the report. Three to seven regions is the workable range; each one must differ in silhouette, surface or purpose.

## 2. Terrain

Height comes from layered noise sampled in world units, so the result does not change with resolution.

```javascript
import { SimplexNoise } from "three/addons/math/SimplexNoise.js";

function mulberry32(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const random = mulberry32(world.seed);
const simplex = new SimplexNoise({ random }); // the noise table is drawn from the seeded generator

function fbm(x, z, octaves = 5) {
  let sum = 0, amplitude = 1, frequency = 1 / 180, total = 0;
  for (let i = 0; i < octaves; i++) {
    sum += amplitude * simplex.noise(x * frequency, z * frequency);
    total += amplitude;
    amplitude *= 0.5;
    frequency *= 2;
  }
  return sum / total; // -1..1
}
```

- `Math.random()` anywhere in generation breaks determinism; pass the seeded generator down.
- Landforms are functions of the noise: `ridged` = `1 - Math.abs(fbm)` squared, `flat` = fbm scaled down and terraced, `dunes` = stretched noise along one axis, `island` = fbm minus distance from centre. Blend regions by a smooth weight of distance to each region centre so borders have no seams.
- Geometry: a `PlaneGeometry(size, size, resolution - 1, resolution - 1)` rotated to lie in XZ, heights written into the position attribute, then `computeVertexNormals()`. Keep the height function available as `heightAt(x, z)`: scattering, landmarks, physics and the camera all need it.
- Ground color: write region palette and slope into vertex colors for a first pass. For close-up quality, blend three or four tiling PBR texture sets by slope and height in the material (TSL `mix` under WebGPURenderer, `onBeforeCompile` under WebGLRenderer); triplanar projection removes stretching on cliffs.

## 3. Water, sky, fog

- Water: a plane at `seaLevel` with `Water` (`three/addons/objects/Water.js`) or `WaterMesh` for WebGPURenderer; a plain transparent `MeshPhysicalMaterial` is enough for distant or stylised water. Fade the shoreline with depth.
- Sky: `Sky` or `SkyMesh` from `three/addons/objects/`, with the sun direction shared with the directional light, or an HDR environment.
- Fog (`FogExp2`) matched to the horizon color hides the far edge and gives depth. Set the camera `far` just past where fog reaches full density.

## 4. Scattering

Thousands of objects are one `InstancedMesh` per model and material.

1. Candidate points come from the seeded generator: jittered grid or Poisson-disc sampling for even spacing, noise-thresholded density for clumps.
2. Reject by rule: region weight, height band, slope limit (from the terrain normal), distance to water, and exclusion zones around landmarks and paths.
3. Per instance: position from `heightAt`, a random yaw, a scale within a range, a slight sink into the ground, optional tilt toward the terrain normal. Write the matrix with `setMatrixAt`, per-instance tint with `setColorAt`, then set `instanceMatrix.needsUpdate`.
4. Vegetation with alpha-cut leaves uses `alphaTest` or `alphaToCoverage`, never sorted transparency.

Models come from the `asset-generation` skill (CC0 kits for repeated props) and go through `asset-pipeline` before use. A believable region needs several variants per category; one tree model repeated reads as a pattern.

## 5. Landmarks

Each landmark has a stable id, a position resolved through `heightAt`, and a flattened pad: blend the terrain toward the landmark's base height inside its footprint before building the geometry, so buildings do not float or sink.

## 6. Scale: chunks and level of detail

Past roughly 1 km or a million terrain triangles, split the world into square chunks generated from the same `heightAt`, each with its own terrain mesh and instance batches, so frustum culling removes what is off screen. Give distant chunks lower resolution (stitch or skirt the borders), and swap scattered models to low-poly or billboard versions with `LOD` or by rebuilding batches per ring. Generate chunks in a worker when the world streams in as the camera moves.

## 7. Camera

A fly-through is a `CatmullRomCurve3` through the spec's camera path with a second curve for the look-at target; sample both by eased time. Keep the camera above `heightAt + clearance` along the whole path and check it in code. For walking, place the camera at `heightAt` plus eye height, or hand movement to the `physics` skill with a heightfield collider built from the same samples.

## 8. Inspect

Run the `visual-qa` loop from three distances: the whole world from above, each region from a hill, and at walking height. Look for region seams, floating or buried objects, visible repetition, scatter inside landmarks or water, and the terrain edge showing through fog. A debug mode that colors the terrain by region id and draws exclusion zones finds placement faults faster than the lit view.

**Done when** the same seed reproduces the same world, every region in the spec is recognisable in a capture, no object floats or intersects, and frame stats sit inside the budgets in `visual-qa`.
