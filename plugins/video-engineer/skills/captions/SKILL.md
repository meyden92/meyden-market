---
name: captions
description: "How video-engineer makes burned-in captions: per-scene caption files built from the voice stage's word timings, a caption style written for the treatment, how they are rendered and how they enter the render hash. Use before generating, styling or changing captions."
user-invocable: false
---

# Captions

Captions are burned in by Remotion. There is no soft subtitle track. API details for `Caption`, `createTikTokStyleCaptions` and the page-lookup pattern: `remotion-core` reference `references/captions.md`.

## Generate

From the Remotion project root, after the voice stage:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/captions.mjs" <slug> [--scene <id>]
```

- Source: `public/audio/<id>.words.json`, the Scribe word timings the voice stage saved for each scene. No transcription runs; the words are the narration as spoken.
- Output: `videos/<slug>/captions/<id>.json`, a `Caption[]` with milliseconds relative to the scene start. Run it again after the voice stage regenerates a scene.
- Only scenes with `captions: true` are processed.

## Style

The caption style comes from BRIEF.md's Captions line, written for the treatment: where captions sit, how many words show at once, how the spoken word is marked, the type and any plate. The base component (`src/lib/motion/Caption.tsx`: lower third in `wide`, large in the middle 75 % in `tall`, centred low in `square`, the spoken word in the primary colour on a soft plate) is one option. When the treatment wants another, write `src/videos/<slug>/Captions.tsx` exporting `SceneCaptions` with the props of `src/lib/scenes/Captions.tsx` (`scene`, `meta`, `layout`, `captions`); `gen-index.mjs` uses it instead of the base one. Group words into pages with `createTikTokStyleCaptions` (`remotion-core` references/captions.md) and keep every caption at or above `meta.style.minTextPx` and inside the platform's safe zone.

## Render

- `scripts/gen-index.mjs` imports `captions/<id>.json` for every scene with `captions: true` when the file exists, and the generated index renders `SceneCaptions` (the video's own `src/videos/<slug>/Captions.tsx`, else `src/lib/scenes/Captions.tsx`) above the scene. A scene without a caption file renders without captions; no error.
- `stagePadding` in `kit.tsx` keeps base-scene content out of the base caption area; a custom caption style keeps its own area clear in the custom scenes.
- `render-changed.mjs` includes the caption file hash in the scene hash. Adding or changing captions re-renders exactly the scenes concerned. Run `gen-index.mjs` first so the index imports new files.

Done when: every scene with `captions: true` has `videos/<slug>/captions/<id>.json` and `gen-index.mjs` was run afterwards.
