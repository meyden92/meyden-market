---
name: cut
description: "Render a platform cut of a finished video-engineer video: the full composition in 9:16 (1080x1920) or 1:1 (1080x1080) with burned-in captions and the music mix. Use when the user asks for a vertical, square, Shorts, Reels or TikTok version of a video."
user-invocable: false
---

# Cut

Run from the Remotion project root. Arguments: `<slug>` (if missing and `videos/` holds one project, use it) and `9:16` or `1:1` (if missing, use `meta.cuts` from scenes.json and run each). Safe zones and caption sizes: `platform-norms` skill.

1. Validate: `node "${CLAUDE_PLUGIN_ROOT}/scripts/validate-manifest.mjs" <slug>`. Stop on errors.
2. If any scene has `captions: true` and no `videos/<slug>/captions/<id>.json`, run the `captions` skill's generate step first.
3. Generate: `node "${CLAUDE_PLUGIN_ROOT}/scripts/gen-index.mjs"`.
4. Render: `node "${CLAUDE_PLUGIN_ROOT}/scripts/render-changed.mjs" <slug> --cut tall` for 9:16, `--cut square` for 1:1. It renders the `<slug>-tall` or `<slug>-square` composition in one pass (not incremental) and mixes the music bed the same way as `render`.
5. Probe the result: `npx remotion ffprobe -v error -show_entries stream=width,height -of csv=p=0 videos/<slug>/out/final-9x16.mp4` (or `final-1x1.mp4`). Report path, size and duration.

A cut is the same scenes in another layout. A shorter cut (a 45 s hook from a 6 minute video) is a new SCRIPT.md and slug, not an option of this command.

Done when: the output file exists and ffprobe reports 1080x1920 (9:16) or 1080x1080 (1:1).
