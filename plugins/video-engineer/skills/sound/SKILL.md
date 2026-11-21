---
name: sound
description: Generate the sound effects and the music bed of one video-engineer video through the fal MCP, reusing sounds from the plugin's sound library first, and save new generic sounds back to it. Use when the user asks for sound effects or music, to regenerate them, or to make them quieter or louder.
user-invocable: false
---

# Sound

Run in the main conversation from the Remotion project root; the MCP calls are not available to subagents. `<slug>` is the video; if it is not clear, use the only directory under `videos/` or ask which one. Load the `audio` skill first: it has the call flow, the cost rule and the sound library rules.

1. Check that every scene has a non-null `audio.durationSec`. If not, run the `voice` skill first; music length depends on it.
2. If `meta.sound.sfxDensity` is not `none`: list the library (`node "${CLAUDE_PLUGIN_ROOT}/scripts/sfx-library.mjs" list --data "${CLAUDE_PLUGIN_DATA}/sfx"`) and, for every SFX prompt a library sound covers, change that line in SCRIPT.md to `lib:<id>` and run `sync-script.mjs <slug>`. Then run `node "${CLAUDE_PLUGIN_ROOT}/scripts/audio.mjs" plan <slug> sfx --data "${CLAUDE_PLUGIN_DATA}/sfx"`; add `--loop` and `--duration <s>` only for ambience beds. It copies the library sounds, including the shared UI click and typing sounds when a scene clicks or types.
3. Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/audio.mjs" plan <slug> music`.
4. Price the effects and the music the two plans printed, state the total and ask once. Stop on a no and report that the video renders without them.
5. Generate each and `save` it (`audio` skill, Sound effects and Music). Log each failure with `audio.mjs fail`; it does not stop the stage.
6. Save each newly generated effect that is generic into the library (`sfx-library.mjs save <file> <id> --description ... --use ... --prompt ... --settings ... --source "<slug>" --data "${CLAUDE_PLUGIN_DATA}/sfx"`), and list the saved ids in the report with the folder they went to.
7. Read the Constraints section of BRIEF.md. If it names ads or broadcast use, report that the music licence must be checked for that use.

Done when: each sfx file, each needed UI sound, and `public/audio/music.mp3` exists or its failure is logged in `decisions.md`, every new generic effect is in the library, and the report lists library sounds used, sounds saved and any silent fallbacks.
