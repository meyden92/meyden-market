---
name: build
description: "The entry point for any three.js or React Three Fiber work: reads the project's stack, picks the renderer, loads the topic skills the task needs, hands separable parts to the specialist agents, and ends with a visual check of the running scene. Use whenever the user asks to build, add to, change, fix, speed up or review anything 3D on the web (a scene, a model viewer, a game, a product configurator, a shader, particles, a WebGL or WebGPU effect, a 3D background), even when they do not say three.js."
---

# Three.js work, start to finish

The user states a goal. You choose the skills and agents; never ask the user which to use.

## 1. Read the stack

The session-start note from this plugin states the three release, React Three Fiber, the renderer and installed helpers. When it is absent (new project, or three added mid-session), read `package.json` and the entry file yourself.

- **No project yet**: Vite with the newest `three`. Use React Three Fiber only when the user asks for React or the page is already a React app.
- **Renderer**: keep the one the project uses. For a new project choose `WebGPURenderer` with TSL when the work centres on custom shading, compute or heavy post-processing, and `WebGLRenderer` when it depends on `ShaderMaterial`, `EffectComposer` passes or a library that needs them. State the choice and the reason in one line.
- **Installed release below the skills' target**: check an API in `node_modules/three` before using it.

## 2. Load what the task needs

Load every row that applies with the Skill tool before writing code for it. `fundamentals` applies to every new scene.

| The task involves | Skill |
| :-- | :-- |
| Scene, camera, renderer, resize, render loop | `fundamentals` |
| Shapes, BufferGeometry, instancing, points, lines | `geometry` |
| Material choice, PBR, transparency | `materials` |
| Lights, shadows, environment maps | `lighting` |
| Image textures, color spaces, render targets | `textures` |
| Loading glTF, HDR and other files | `loaders` |
| Compressing or validating models | `asset-pipeline` |
| Clips, mixers, skeletal and morph animation | `animation` |
| Custom shaders, TSL, node materials | `shaders` |
| Bloom, depth of field, screen effects | `postprocessing` |
| Picking, controls, dragging | `interaction` |
| React components for the scene | `react-three-fiber` |
| Collisions, rigid bodies, character movement | `physics` |
| Terrain, biomes, scattering, large environments | `world-generation` |
| Models that do not exist yet | `asset-generation` |
| VR, AR, headsets | `xr` |
| Sound in the scene | `audio` |
| Low frame rate, memory growth, long loads | `performance` |
| Something renders wrong or not at all | `debugging` |

## 3. Plan and split

For a task that touches one area, do it yourself. For a task with separable parts, write a short plan and dispatch agents in parallel, each with the files it owns, the stack facts from step 1 and what done looks like. Two agents never write the same file.

| Agent | Give it |
| :-- | :-- |
| `threejs-knowledge:scene-builder` | Scene structure, cameras, lights, geometry, controls, React Three Fiber components |
| `threejs-knowledge:shader-artist` | Custom materials, TSL or GLSL, post-processing chains |
| `threejs-knowledge:asset-engineer` | Loading, compressing and animating models and textures |
| `threejs-knowledge:performance-auditor` | Measuring a slow or heavy scene; it reports and edits nothing |
| `threejs-knowledge:visual-critic` | Judging screenshots in step 5; it sees only the frames and the brief |

## 4. Build

- Every object created at runtime has an owner that disposes its geometry, materials and textures.
- Numbers that shape the look (camera, light intensities, colors, sizes) sit together at the top of the file or in one config object, so a later request to adjust them is a one-line edit.
- The PostToolUse hook `three-check` reports outdated API in text you just wrote. Fix what it reports before continuing; `three-check <dir>` scans a whole project.

## 5. Verify by looking

Code that compiles is unverified. Load `visual-qa` and run its loop: start the page, capture frames, read the console, read the frame stats. Fix and repeat until its pass bar holds. For work the user will judge by eye (a hero scene, a look, an effect), also dispatch `visual-critic` with the frames and the user's brief, and fix every failure it returns.

**Done when** the scene runs with an empty error console, a frame was captured after the last edit and matches the request, `three-check` finds nothing in the files you touched, and the report to the user says what was looked at and names anything that could not be checked.
