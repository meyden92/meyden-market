---
name: asset-generation
description: "Getting 3D models, textures and HDR environments a three.js scene needs but does not have: free CC0 libraries, AI text-to-3D and image-to-3D through a fal MCP server, modelling and export through a Blender MCP server, and procedural stand-ins. Use when a scene needs a model, prop, character, material texture or sky that is not in the project, or when the user asks to generate or find a 3D asset."
---

# Sourcing 3D assets

Pick the source by the asset's role, then run every model through the `asset-pipeline` skill before it enters the scene.

| The scene needs | Source |
| :-- | :-- |
| Repeated props: trees, rocks, furniture, street items | A CC0 kit, so the pieces share one style |
| A PBR ground or wall material, an HDR sky | A CC0 texture or HDRI library |
| One specific object described in words or shown in an image | AI generation through a fal MCP server |
| A precise, parametric or hard-surface shape; fixing or combining models | Blender through its MCP server |
| A placeholder while the real asset is decided | Primitives, in the final size and position |

## Free libraries

Poly Haven (models, PBR textures, HDRIs), ambientCG (PBR textures, HDRIs), Kenney and Quaternius (low-poly model kits) publish under CC0. Other sites license per asset: read the licence on the asset's page and record it. Download with `curl` from the direct file URL into `assets/src/`, prefer glTF or GLB, and take 1K or 2K textures unless the object fills the screen.

## AI generation through fal

Available when the session has a fal MCP server (its tools include `recommend_model`, `submit_job` or `run_model`, and `wait_for_jobs`). Without one, say so and offer a library asset or a Blender-built one.

1. Call `recommend_model` with the task ("text to 3D model with PBR textures, GLB output" or "image to 3D") and use the endpoint it selects. Model names and prices change; take them from the tool, never from memory.
2. Generation costs money. Before the first call, tell the user the model, the number of assets and the price the tool reports, and proceed on their yes. Generate one asset and inspect it before a batch.
3. Prompt for one object per call: the object, its style, its materials, "single object, centred, neutral pose, no ground, no background". A whole scene in one mesh comes back as an unusable blob; generate the hero objects and assemble them in code.
4. For a specific look, generate or pick a reference image first and use image-to-3D: a clear three-quarter view on a plain background, the whole object in frame.
5. Ask for GLB with PBR textures and a face limit that suits the role (about 10k triangles for a prop, 50k for a hero object).

## Blender

Available when the session has a Blender MCP server (`execute_blender_code`, with Blender running). Use it to build exact shapes with modifiers, clean a generated mesh (decimate, recalculate normals, merge by distance, set the origin to the base, apply transforms), bake procedural materials to textures, and combine parts. Inspect the scene before changing it and keep the user's existing objects.

Export for three.js:

```python
bpy.ops.export_scene.gltf(filepath=path, export_format="GLB", use_selection=True, export_apply=True, export_yup=True)
```

One Blender unit is one metre in three.js. Apply scale and rotation before export, name objects and animations (the names arrive in three.js), and bake any procedural shader: only Principled BSDF inputs with image textures survive glTF export.

## Accept an asset

Check every incoming model before using it:

1. `npx @gltf-transform/cli inspect model.glb`: triangle count, texture sizes, material and mesh counts. A generated model with one 4K texture set per small prop needs resizing.
2. Load it in the scene with a bounding-box helper: real-world size in metres, origin at the base centre, Y up, facing a known direction. Correct these in Blender or with a wrapper group.
3. Look at it from all sides under the scene's lighting: holes, inverted faces, baked-in shadows or lighting, melted details on the far side (common in image-to-3D), texture seams.
4. Optimize with the `asset-pipeline` skill and commit the optimized file. Record source, licence or model, and prompt in `assets/README.md` beside it.

**Done when** each asset is in the project in optimized form, has the right size, origin and orientation in the scene, and its source and licence are recorded.
