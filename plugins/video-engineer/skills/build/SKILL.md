---
name: build
description: Build the Remotion scenes of a narrated video-engineer video from scenes.json and BRIEF.md, covering the build plan checked against default reaches, theme.ts with the motion language, custom scene components in the chosen treatment's world, generated index files and typecheck. Use when scenes need building or rebuilding, or the user asks to change how a scene looks.
user-invocable: false
---

# Build

Run from the Remotion project root. `<slug>` is the folder name under `videos/`; if the user gave none and `videos/` holds one project, use it. Load `motion-rules`, `direction`, `remotion-core` and `scene-manifest` first.

1. Read `videos/<slug>/scenes.json` and `videos/<slug>/BRIEF.md`. Note the Direction section, the Motion language, `meta.direction`, `meta.style`, and for each scene its `visualType`, `onScreen`, `data`, `motion` and assets. Look at the chosen style frame (`research/choices/direction-<n>.png`) and read its source in `src/videos/<slug>/frames/`: it is the look every scene continues.
2. Write `src/videos/<slug>/theme.ts` from `${CLAUDE_PLUGIN_ROOT}/templates/theme.ts`. Replace `__SLUG__` with the slug and `__FONTS__` with an import and a `loadFont` call per family in `meta.style.font` and `meta.style.displayFont` (`@remotion/google-fonts/<Family without spaces>`, for example `DMSans`; the weights from BRIEF.md's Type line). Colours come from `meta.style.palette`; to change a colour, edit the palette in scenes.json, not theme.ts. Add the motion language as named values (eases by role, spring config, arrival frames, stagger, hold) so every scene reads them from one place.
3. **Build plan.** Write `videos/<slug>/research/build-plan.md`, one row per scene: composition (focal point, alignment, scale contrast), what arrives and how, camera, the seam in and out, the ground, and the parts from the bin it uses with the reason. Then review the plan against the default reaches in the `direction` skill: under a "Default check" heading, name every scene whose row matches a default reach the brief did not ask for, change it, and note what changed. The plan is ready when no row matches an unasked default, no two neighbouring scenes share composition and entrance, and the signature scene differs from every other.
4. **Custom scenes.** Write `src/videos/<slug>/scenes/<Id>.tsx` for every `custom` scene (most scenes are), and for any base-type scene whose base component cannot carry the treatment's world. `<Id>` is the scene id with the first letter uppercased (`S07`). Export a component of the same name taking `{ scene, meta, layout }` and handle all three layouts (wide, tall, square). Build the world the treatment names (its material, ground, type behaviour and seams) in `src/videos/<slug>/components/`, and use parts from `src/lib/motion` and `src/lib/scenes/kit` only where the build plan says why; follow `motion-rules`. Keep text at or above `meta.style.minTextPx` using `theme.type(layout, width)`.
5. **Base scenes.** The remaining scenes (screenshot and screencast with their capture and tutorial steps, code or terminal shown as they are) use the base component for their `visualType`, with the content in `scene.data` (keys are in `scene-manifest`). Base scenes take the ground from `meta.style.ground` and the camera from `scene.motion.camera`. Edit SCRIPT.md for that, run `sync-script.mjs <slug>`, and validate: `node "${CLAUDE_PLUGIN_ROOT}/scripts/validate-manifest.mjs" <slug>`.
6. **Captions.** When BRIEF.md's Captions line asks for a style the base caption component does not draw, write `src/videos/<slug>/Captions.tsx` (`captions` skill, Style).
7. Generate the index files: `node "${CLAUDE_PLUGIN_ROOT}/scripts/gen-index.mjs"`. It fails while a `custom` scene has no component.
8. Typecheck: `npx tsc --noEmit`. On errors, fix the cause and run it again. Make at most 2 fix rounds. If errors remain after the second, stop and report them.

Studio is started and stopped by the `run` skill in the main conversation, not here; it picks up regenerated index files by itself.

## Transitions

Scenes render as separate compositions and are concatenated, so scenes cannot overlap and `TransitionSeries` does not apply. A transition is `TransitionIn` from `src/lib/transitions`: it plays the entering half of a presentation over the first 0.4 s of the scene against the background colour. The base scene shell applies it from `scene.motion.transitionIn`. In a custom scene, wrap only the visuals in `TransitionIn` and keep audio outside it. The previous scene's `Exit` ends on the background colour, so the pair reads as one transition. `cut`, `none` and `custom` skip it; a `custom` seam is written into the last frames of the leaving scene and the first frames of the arriving one, matching axis, direction and speed (`motion-rules`, Transitions).

## Limits

- Do not edit `src/lib/`; it is copied from the plugin and overwritten by setup. Project-specific components, effects and fonts go in `src/videos/<slug>/`.
- Do not edit generated files (`src/Root.tsx`, `src/videos/<slug>/index.tsx`).
- Do not hand-write the `hash` field.

Done when: `research/build-plan.md` passes its default check, every `custom` scene has its own component, a caption style the base cannot draw has its own `Captions.tsx`, `npx tsc --noEmit` exits 0, and `src/Root.tsx` lists a composition per scene.
