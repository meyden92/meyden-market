---
name: voice
description: Generate the narration of one video-engineer video through the fal MCP or the ElevenLabs MCP, then measure the audio and write scene durations into scenes.json. Use when the user asks to generate, regenerate or change the narration, voice-over, voice style or pronunciation.
user-invocable: false
---

# Voice

Run in the main conversation from the Remotion project root; the MCP calls are not available to subagents. `<slug>` is the video; if it is not clear, use the only directory under `videos/` or ask which one. Load the `audio` skill first: it has the providers, the call flow and the cost rule.

1. Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/audio.mjs" plan <slug> tts`. Nothing to generate: continue at step 4.
2. Price the printed lines and the Scribe calls, state the total and ask. Stop on a no.
3. For each line: generate, run its Scribe call, and `save` with the words on stdin (`audio` skill, Narration). A failed generation is reported with the tool's error, and the stage stops.
4. Run `sh "${CLAUDE_PLUGIN_ROOT}/scripts/measure.sh" <slug>`.
5. If measure.sh exits 1, report which scenes are under 4 s or that the total is outside `meta.targetSec`, with the printed durations. Stop. Do not edit narration or targets to make it pass.
6. Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/validate-manifest.mjs" <slug>`.

A word the user says is pronounced wrong is fixed in the narration's spelling in SCRIPT.md ("lunashare dot app"), then `sync-script.mjs <slug>` and step 1 with `--scene <id>`. A delivery the user wants changed for one scene goes in that scene's `Voice:` line in SCRIPT.md; for the whole video, in `meta.voice.style`.

Done when: `plan <slug> tts` reports every scene up to date, measure.sh exits 0, and validate-manifest exits 0.
