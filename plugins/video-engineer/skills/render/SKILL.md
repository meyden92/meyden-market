---
name: render
description: "Render a narrated video-engineer video: regenerate the Remotion index files, render only the scenes whose hash changed, concatenate them and mix music into out/final.mp4. Use when the user asks to render, export or re-render a video."
user-invocable: false
---

# Render

Run from the Remotion project root. `<slug>` is the folder name under `videos/`; if the user gave none and `videos/` holds one project, use it.

1. Validate: `node "${CLAUDE_PLUGIN_ROOT}/scripts/validate-manifest.mjs" <slug>`. Stop on errors.
2. Generate: `node "${CLAUDE_PLUGIN_ROOT}/scripts/gen-index.mjs"`. It refuses when any `audio.durationSec` is null; run the voice stage first in that case.
3. Render: `node "${CLAUDE_PLUGIN_ROOT}/scripts/render-changed.mjs" <slug>`. Add `--all` when the user passed it to re-render every scene.
4. Relay the script's summary: scenes rendered, scenes skipped, output path.

Done when: `videos/<slug>/out/final.mp4` exists and the summary lists rendered and skipped scenes.
