---
name: debugging
description: "Diagnosing a three.js scene that renders wrong: black or empty canvas, invisible or black objects, washed-out or dark colors, shadow artefacts, z-fighting, wrong draw order of transparent objects, a model that loads at the wrong size or place, WebGL context loss, shader compile errors, NaN transforms. Use when a 3D scene shows nothing, looks wrong, flickers, or broke after an upgrade."
---

# Debugging three.js rendering

Find the cause before changing code: read the console, then narrow with the checks below. Each symptom lists causes in the order they occur most often. Confirm one with evidence (a console message, a logged value, a helper drawn in the scene) and fix that cause.

## First evidence

1. The browser console. three.js names most failures there: shader compile logs with line numbers, deprecated API, textures that failed to load, `THREE.WebGLRenderer: Context Lost`.
2. `three-check <dir>`: outdated API that fails silently after an upgrade.
3. `renderer.info.render` after a frame: zero draw calls means nothing reached the renderer (camera, visibility, culling); a positive count with an empty picture means it drew something you cannot see (material, light, clipping, canvas size).
4. Helpers in the scene: `AxesHelper`, `Box3Helper` around the object, `CameraHelper` on a light's shadow camera, `DirectionalLightHelper`.

## Nothing is visible

- The render loop never runs, or `renderer.render` is called before an async init finished (`WebGPURenderer` needs `await renderer.init()` or `setAnimationLoop`).
- The canvas has zero size or is not in the document: log `renderer.domElement.width` and its bounding rectangle. A parent with no height collapses a `<Canvas>`.
- The camera looks away from the object or sits inside it: frame it from the bounding box (`new THREE.Box3().setFromObject(object)`, then place the camera at the box centre plus a multiple of its size).
- The object lies outside `near`/`far`. A model in millimetres is a thousand times larger than expected; one in kilometres is a speck.
- The object was never added to the scene, is `visible = false`, or sits on a layer the camera does not render.
- Frustum culling removes it: a skinned or vertex-displaced mesh has a stale bounding sphere. Recompute it, or set `frustumCulled = false` on that mesh.
- A transform is NaN: log `object.matrixWorld.elements`. Division by zero in a delta or a normalised zero vector is the usual source.
- A `<Canvas>` child suspends forever: a failed load inside `Suspense` with no error boundary shows an empty scene.

## Objects are black

- A lit material with no light and no `scene.environment`.
- A metallic material (`metalness` near 1) with no environment map: metal shows only reflections.
- Normals missing or inverted: `geometry.computeVertexNormals()`, or the model's faces wind the wrong way.
- A color texture failed to load (console 404) or was created before the image decoded and never flagged `needsUpdate`.
- Light intensity in the pre-r155 scale: point and spot lights take candela, so values near 1 are nearly dark at a few metres.

## Colors look wrong

- Washed out: a color texture left at `NoColorSpace`. Color maps and emissive maps take `SRGBColorSpace`; data maps (normal, roughness, metalness, ao) stay `NoColorSpace`.
- Too dark or too contrasty: tone mapping applied twice (renderer and an output pass) or not at all in a post-processing chain without `OutputPass`.
- Different from the design tool: colors given as hex are sRGB and converted to linear; a custom shader that writes them out must convert back (`#include <colorspace_fragment>`), and tone mapping shifts saturated colors.
- Dull glTF model: no environment map. PBR materials need one for believable reflections.

## Shadows

- None: `renderer.shadowMap.enabled`, `light.castShadow`, `mesh.castShadow`, `mesh.receiveShadow`, and a material that receives light. `MeshBasicMaterial` shows no shadow.
- Cut off at an edge: the object is outside the light's shadow camera. Draw a `CameraHelper` on `light.shadow.camera` and fit `left/right/top/bottom/near/far` to the scene.
- Stripes on lit surfaces (acne): raise `light.shadow.normalBias` in small steps first, then `bias` (negative, small).
- Shadow detached from the object (peter-panning): the bias is too large.
- Blocky: the shadow camera covers too large an area for `shadow.mapSize`. Shrink the frustum before raising the map size.

## Flicker and draw order

- Two surfaces flicker where they overlap (z-fighting): move one apart, or set `polygonOffset` on the decal. Across a whole large scene, `near` is too small for `far`: raise `near`, or use `logarithmicDepthBuffer` (WebGL) or `reversedDepthBuffer`.
- Transparent objects draw in the wrong order: they sort by object centre. Set `depthWrite = false` on transparent materials, split a self-overlapping mesh, or give explicit `renderOrder`. For cut-out textures (leaves, fences) use `alphaTest` or `alphaToCoverage` with an opaque material.
- A texture shimmers in the distance: mipmaps off or `anisotropy` at 1.

## Models

- Wrong size or position: read the bounding box, then scale and recentre a wrapper group; leave the loaded hierarchy intact so animations keep working.
- Animation does not play: `mixer.update(delta)` is missing from the loop, the clip targets node names that changed, or the model was cloned with `clone()` and shares its skeleton (`SkeletonUtils.clone`).
- Loads forever or fails: a Draco or KTX2 model without its decoder set, or decoder files from another three release.

## Context loss and shader errors

- `Context Lost`: GPU memory exhausted (oversized or leaked textures and render targets), too many canvases on one page, or the tab was backgrounded on a phone. Listen for `webglcontextlost` (call `preventDefault`) and `webglcontextrestored`, and find the leak with `renderer.info.memory` over time.
- Shader compile error: the console prints the failing line of the generated source. For `ShaderMaterial` check that every uniform the GLSL declares exists in `uniforms`, and that GLSL ES 3.00 names are used (`texture`, `in`/`out` handled by three's prefix). Under `WebGPURenderer`, GLSL materials are not compiled at all; the material must be a node material.
- A `onBeforeCompile` patch silently stopped working after an upgrade: the chunk it replaces was renamed. Log `shader.fragmentShader` and search for the target string.

## After the fix

Run the `visual-qa` loop: the symptom is gone in a fresh capture, the console is clean, and views that worked before still do.
