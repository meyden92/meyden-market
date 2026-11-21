---
name: audio
description: How video-engineer makes narration, sound effects, music and lyric alignment through the fal MCP or the ElevenLabs MCP with scripts/audio.mjs, covering TTS providers and their style controls, voice samples, pace, per-scene files, word timings, cost confirmation, ducking, music licence, SFX density and the sound library. Use before running or changing any audio stage or choosing a voice.
user-invocable: false
---

# Audio

Audio is generated through MCP tools, which only the main conversation can call, so every audio stage runs there, never in the director. `scripts/audio.mjs` never calls a paid API: `plan` prints each call still needed as one JSON line, you make the call, and `save` downloads the result into place. Run everything from the Remotion project root.

## Tools

- **fal MCP**: `run_model` (`endpoint_id`, `input`), `check_job` for a job that comes back `processing`, `get_pricing` and `estimate_cost`, `upload_file`. Generated audio is at `result.audio.url`.
- **ElevenLabs MCP**, only for narration with provider `elevenlabs-mcp`: `creative_list_voices` (free, a `preview_url` per voice), `creative_generate_speech`, `creative_get_generations` (its `full_res_url` is the file), `creative_design_voice`.

MCP tool names carry a server prefix that differs per install; match on the part after the last `__`. Word timings and lyric alignment always go through fal, so fal is needed for every narrated video. When a needed server is missing, stop the stage and tell the user which one to connect (fal: https://fal.ai/docs/documentation/setting-up/mcp/claude-code).

## Commands

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/audio.mjs" plan <slug> tts [--scene <id>] [--force]
node "${CLAUDE_PLUGIN_ROOT}/scripts/audio.mjs" save <slug> tts <scene> --url <audio url>      # word timings on stdin
node "${CLAUDE_PLUGIN_ROOT}/scripts/audio.mjs" plan <slug> sfx [--duration <0.5-30>] [--loop] [--force] --data "${CLAUDE_PLUGIN_DATA}/sfx"
node "${CLAUDE_PLUGIN_ROOT}/scripts/audio.mjs" save <slug> sfx <key> --url <audio url>
node "${CLAUDE_PLUGIN_ROOT}/scripts/audio.mjs" plan <slug> music [--force]
node "${CLAUDE_PLUGIN_ROOT}/scripts/audio.mjs" save <slug> music --url <audio url>
node "${CLAUDE_PLUGIN_ROOT}/scripts/audio.mjs" plan <slug> align --audio <song> [--force]
node "${CLAUDE_PLUGIN_ROOT}/scripts/audio.mjs" save <slug> align --audio <song>                # alignment result on stdin
node "${CLAUDE_PLUGIN_ROOT}/scripts/audio.mjs" pace <slug> --voice "<provider, model, voice, style>"  # word timings on stdin
node "${CLAUDE_PLUGIN_ROOT}/scripts/audio.mjs" fetch <url> <dest.mp3>
node "${CLAUDE_PLUGIN_ROOT}/scripts/audio.mjs" fail <slug> "<what failed and why>"
sh "${CLAUDE_PLUGIN_ROOT}/scripts/measure.sh" <slug>
node "${CLAUDE_PLUGIN_ROOT}/scripts/sfx-library.mjs" list|use|save ... --data "${CLAUDE_PLUGIN_DATA}/sfx"
```

`save` converts anything that is not mp3 (Gemini returns WAV) with Remotion's ffmpeg and writes the cache sidecar, so the next `plan` skips the file.

## Cost

Every generation is paid. Before a stage's calls, price them all: `get_pricing` for the endpoints in the plan lines (characters for TTS, seconds for effects, minutes for music and for Scribe), or `estimate_only: true` on one `creative_generate_speech` call. State the total and ask once per stage; call only after a yes. Files already in place cost nothing, and `plan` lists only what is missing or changed. A failed call is reported, never repeated in a loop, because a second call is a second charge. A `run_model` that returns `processing` is still running: poll `check_job` with its `request_id` and never call `run_model` again for it.

## TTS providers

The interview picks the provider and writes `meta.voice`: `{provider, model, voice, style, settings}`.

| Choice | `provider` · `model` | `voice` | `style` becomes | Notes |
|---|---|---|---|---|
| Gemini Flash TTS | `fal` · `google/gemini-3.8-flash-tts` (cheaper: `google/gemini-3.8-flash-lite-tts`) | one of 30 prebuilt names (Kore, Charon, Puck, Aoede, ...; `get_model_schema` lists them) | `style_instructions`, free-text direction | language detected from the text; `<laugh>` and `<sigh>` may stand in the narration |
| ElevenLabs v4 via fal | `fal` · `elevenlabs/tts/eleven-v4` | a premade voice name (George, Rachel, Aria, ...) | audio tags put before the text (`[calm]`) | `settings.stability` 0-1, lower is more expressive |
| ElevenLabs via its MCP | `elevenlabs-mcp` · `eleven_v4` | a `voice_id` from `creative_list_voices`, or a designed voice | audio tags put before the text | the user's own ElevenLabs account, library and designed voices |

Style:

- The narration is spoken as written. Delivery directions live in `style` or in a scene's `Voice:` line, never in the narration.
- Gemini: one or two short clauses ("calm and warm, slightly fast", "amused, like sharing a shortcut"). Age, gender and accent come from the voice, not the style. Long director's notes make the voice drift.
- ElevenLabs: one or two tags describing delivery (`[whispers]`, `[excited]`, `[sighs]`).
- `meta.voice.style` is the delivery of the whole video. A scene that needs another delivery (a punchier hook, a warmer CTA) gets a `Voice:` line in SCRIPT.md, stored as `scene.voiceStyle`, which replaces the video style for that scene.
- A changed voice, model or style regenerates every scene it applies to; `plan` shows which.

## Voice samples

- ElevenLabs MCP: `creative_list_voices` with gender, age, language and descriptive filters is free. Download each `preview_url` with `fetch` into `videos/<slug>/research/choices/voice/<n>-<name>.mp3`.
- Gemini and ElevenLabs via fal have no free previews: generate one line of 1-2 sentences from the video, in its language and the planned style, with 2 or 3 voices (a few hundred characters in all; state the cost first), and `fetch` each into the same folder.
- When no voice fits, offer ElevenLabs voice design (`creative_design_voice`). It needs the user's own description and sample line.

## Pace

Once voice and style are chosen, generate one sample of 25-40 words in the video's language and tone with exactly that provider, voice and style, run the Scribe call on it (see Narration step 3), and pipe the words into `pace <slug> --voice "<provider, model, voice, style>"`. It writes `research/pace.json` with the words per minute the script is written to. `fetch` the sample to `research/choices/voice/pace.mp3` so the user can hear it.

## Narration

1. `plan <slug> tts` prints one line per scene to generate: `tool`, `endpoint_id`, `input`, `chars`, `out` and `words`, the Scribe call for its word timings. Only a summary line means everything is current.
2. For each line, call `tool` with `input` exactly as printed: `run_model` with the `endpoint_id` on fal, or `creative_generate_speech` on ElevenLabs followed by `creative_get_generations` for the `full_res_url`.
3. Call the `words` entry (`run_model`, `fal-ai/elevenlabs/speech-to-text/scribe-v2`) with `audio_url` set to the generated audio's URL.
4. Pipe the Scribe `words` into `save` as `[text, start, end]` triples, copying the numbers exactly. Spacing entries can be left out:

   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/scripts/audio.mjs" save <slug> tts s01 --url "<audio url>" <<'EOF'
   [["Run",0.38,0.52],["one",0.6,0.72],["command",0.76,1.34]]
   EOF
   ```

5. After the last scene, run `measure.sh <slug>`.

- One file per scene at `scenes[].audio.file`, never one file for the whole video. Beside it, `<id>.words.json` holds the spoken words with start and end seconds from scene start (tutorial steps anchored to a word read it), and `<id>.txt.sha256` holds the hash of narration, voice and style.
- A word the voice mispronounces (a URL, `.app`, an acronym) is fixed in the narration's spelling in SCRIPT.md ("lunashare dot app"), then `sync-script.mjs <slug>` and `plan <slug> tts --scene <id>` for that scene. The interview's Pronunciation list prevents most of them.
- `measure.sh` writes `audio.durationSec` from the files. Scene lengths come from that value only.

## Sound effects

- `plan <slug> sfx --data "${CLAUDE_PLUGIN_DATA}/sfx"` copies every `lib:<id>` sound and the UI sounds from the library (free) and prints one line per effect still to generate (`key`, `endpoint_id` `elevenlabs/sound-effects/v3`, `input`, `out`). Call each, then `save <slug> sfx <key> --url <url>`.
- Add `--duration <s>` (0.5-30) and `--loop` to both `plan` and `save` only for ambience beds. Without `--duration` the length follows the prompt.
- Volume: every effect plays at `meta.sound.sfxVolume` (default 0.15). "Too loud" or "too present" is fixed by lowering that value in scenes.json, never per file or in code.
- Density comes from `meta.sound.sfxDensity`:
  - `none`: no sfx entries; skip the sfx plan.
  - `cuts`: one short effect (whoosh, tick, hit) at scene cuts only.
  - `rich`: cut effects plus effects on key on-screen events inside scenes.
- When any scene clicks or types (a click or type step, or a recorded click or type in a capture) and density is not `none`, the plan also puts `public/sfx/ui-click.mp3` and `ui-type.mp3` in place from the library (`ui-click`, `ui-type`); only without a library copy are they generated. Tutorial overlays play them on each click and type.
- A failed effect: `fail <slug> "sfx <key> failed: <reason>"`. It plays as silence and the stage continues.

## Sound library

Generic effects are generated once and reused by every video: clicks, typing, whooshes, swooshes, pops, chimes, ticks, risers, impacts, notification blips, page turns. Each library folder holds the mp3 files and `soundlist.md` (id, file, length, description, use, prompt, settings, source). `sfx-library.mjs` reads, in order: the plugin setting "Sound library folder" (exported as `VIDEO_ENGINEER_SFX_LIBRARY`, normally `<marketplace checkout>/plugins/video-engineer/sfx`), then `--data` (`${CLAUDE_PLUGIN_DATA}/sfx`), then the `sfx/` folder shipped with the plugin.

- Before writing an SFX prompt, `list` the library and use `lib:<id>` where a sound fits; alternate variants (`-1`, `-2`, ...) on consecutive cuts.
- After the sound stage, save every newly generated effect that is generic (it would fit another video unchanged: a whoosh, a click, a pop) with `save <file> <id> --description ... --use ... --prompt ... --settings ...`. Keep effects tied to this video's content (a brand jingle, a spoken word, a sound only this story needs) out of the library. Ids are kebab-case and descriptive (`whoosh-deep-fast-1`, `pop-bubbly`).
- `save` writes into the setting's folder when it is set, so the sound can be committed and shipped with the plugin; tell the user which files were added to that checkout. Without the setting it writes to the plugin data folder on this machine.

## Music

- `plan <slug> music` prints one call: `elevenlabs/music/v2.5`, instrumental, as long as the total narration rounded up (3 to 600 s). It needs the voice stage first. Music takes minutes, so the call usually returns `processing`: poll `check_job`. Then `save <slug> music --url <url>`.
- `render-changed.mjs` loops the bed under the narration at volume `meta.sound.musicDuck` (0.15 means 15 % of full volume). Change the value in `meta.sound`, not in code.
- An empty music prompt is logged to `decisions.md` by the plan; a failed call is logged with `fail`. The video renders without a bed.
- Generated music can carry licence limits for ads and broadcast. If the Constraints section of BRIEF.md names ads or broadcast, tell the user before the final render to check the model's licence on its fal page.

## Lyric alignment

Music videos only.

1. `plan <slug> align --audio public/audio/<song>` prints "up to date" (and refreshes the section labels from `lyrics.txt` for free) or one line with the `text` to align.
2. Upload the song: `upload_file` with `prepare_upload: true`, `file_name` and `file_size`, then `curl --upload-file public/audio/<song> "<upload_url>"`. The returned file URL is the `audio_url`.
3. Call `fal-ai/elevenlabs/forced-alignment` with that `audio_url` and the `text` exactly as printed.
4. Pipe the result into `save <slug> align --audio public/audio/<song>` as `{"words": [{"text", "start", "end"}, ...], "loss": <n>}`, copying every word and number exactly. It writes `research/alignment.json`.

- Word times on sung audio are good to about +/- 0.2 s. Snap cuts to downbeats, never to a word time alone.
- `lyrics.txt` comes from the user. The plugin never writes or reproduces commercial lyrics.

Done when: every scene has its audio file, words file and sidecar, `durationSec` is filled, and each sfx and music file exists or its failure is logged in `decisions.md`.
