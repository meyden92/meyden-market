# video-engineer

Turns screenshots and a sentence of direction into a finished Remotion video: interview, brief, script, voice, music and sound effects through the fal or ElevenLabs MCP, build, critic-gated QA, incremental render and platform cuts. Showcase and tutorial mode films a running app and animates the captures. Music mode turns a song and its lyrics into a lyric music video with one scene world per song section.

## Install

```bash
/plugin install video-engineer@meyden
```

## What you run

| When | Command | What it does |
|---|---|---|
| Once per project | `/video-engineer:setup` | Scaffolds a Remotion project in the current directory (asks first inside an existing app repo), copies the scene library, runs `npm install`, checks node, the bundled ffmpeg and which MCP servers are connected |
| Per video | `/video-engineer:new [direction]` | Asks what kind of video you want (narrated video, app showcase or tutorial, lyric music video), then runs the matching interview and pipeline |

Everything else runs when you ask for it in plain words, and Claude loads the matching skill itself: "render it again", "make the sound effects quieter", "give me a vertical cut", "fix how .app is pronounced", "set up our brand colours", "continue the video". The stage skills (`run`, `music-video`, `assets`, `voice`, `sound`, `build`, `qa`, `render`, `cut`, `brand`) do not appear in the `/` menu. `/video-engineer:upgrade` is for plugin maintainers: it diffs vendored files and the Remotion docs against upstream.

To revise a narrated video, edit `videos/<slug>/SCRIPT.md` and ask Claude to update the video. The pipeline resumes and only regenerates and re-renders changed scenes.

While a video is being built, Remotion Studio runs in the background (port 3000, or the next free port when your app already uses 3000). Claude gives you the URL so you can preview in real time. Studio is stopped after the final render.

Captions are burned in by Remotion from the voice's word timings, in a style written for the video, not stored as a subtitle track.

## Direction

Every video, narrated or lyric music video, gets a look and motion language of its own. In the interview Claude first writes down what a generic run would make for your brief, then three treatments that leave it in different ways: each with an idea only your subject carries, a world (the medium and material the video is made of), a way of telling the story, a way of connecting scenes, a palette, type, a motion language in numbers and one signature scene. One of the three is deliberately the bold option. Each is rendered as a style frame with the real fonts and colours, and you pick. The treatments must also differ from the last videos made on this machine (a ledger in the plugin's data folder, `scripts/fingerprint.mjs`).

The build follows the chosen treatment: the hook, the signature scene and every scene of type `custom` are written for the video, a build plan is checked against the default reaches (same entrance everywhere, centred everything, gradient-and-grain grounds, Ken Burns on every still) before code is written, and the `lib/` components are used only where the plan says why. The critic scores two extra axes, specificity (does this look like only this video) and variety (do scenes differ where their content does, measured partly by a layout-similarity check on the frames).

## Showcase and tutorial mode

A video of kind showcase or tutorial shows a running app. `/video-engineer:new` asks for the app source, how to start it, how to log in, the features to show in order, the viewport and theme, and what to hide, then writes `videos/<slug>/app.json`. You choose the cursor, highlight and zoom from rendered stills.

Pipeline order: sync-script, capture, assets, voice, sound, captions, build, QA, render. Voice and sound run in the main conversation, because they call MCP tools.

1. `scripts/capture.mjs <slug>` starts the app (or reuses one that answers), logs in once, runs each scene's `Capture:` steps and writes `public/img/<id>-<shot>.png` or `public/video/<id>-<shot>.webm` plus the element boxes in `public/capture/<id>.json`. Unchanged scenes are skipped. The app log is `videos/<slug>/research/app.log`.
2. Scenes of type `screenshot` with `Steps:` animate a cursor, clicks, typed text, highlights, callouts, badges and zooms over the capture; `screencast` plays a recording. Steps are anchored to spoken words, whose times come from the voice stage (`public/audio/<id>.words.json`).
3. Click and type sounds come from the sound library when `sfxDensity` is not `none`.

Needs: Playwright Chromium (`/video-engineer:setup` installs it) and `app.json`. Credentials come only from environment variables or the app's seed files, never from `app.json` or `SCRIPT.md`. Only local dev hosts or a staging host you name are captured.

## Music mode

Pick "lyric music video" in `/video-engineer:new`. It needs the song as audio and the lyrics you supply (it finds `lyrics.txt`, `song.txt` or similar in the project and proposes `[SECTION]` headers when they are missing). The plugin never writes song lyrics itself.

1. `scripts/analyze-music.mjs` measures bpm, beats, downbeats, onsets, bands, energy and sections.
2. ElevenLabs forced alignment on fal (`fal-ai/elevenlabs/forced-alignment`, a paid call) gets the word times; `scripts/audio.mjs` prepares the call and stores the result. Sung words are accurate to about ±0.2 s.
3. `scripts/music-blocks.mjs` turns both into `blocks.json`: one block per lyric section, cuts snapped to downbeats, a confidence per cut, pickups flagged. `--stubs` writes a placeholder file per block.
4. You pick one of three treatments, each a style frame of the same chorus line with its own world, lyric staging, typeface and refrain, written for the song. The storyboard gives each block a shot per lyric line, cut on downbeats.
5. Images are listed in `videos/<slug>/assets.json`, named `<block>-<name>.png` or `shared-<name>.png`.
6. Block builders (`agents/block-builder.md`) build blocks in parallel waves, the flagship chorus first. Each owns its own files; the kit is read-only for them. Stills land in a progress folder after every round.
7. QA: `scripts/frames.sh` renders a half-size draft, samples frames and measures flashes, black frames and dark frame edges on every frame; the critic agent scores it, at most three fix rounds. The final render is 1080p only.

The project uses `lib/music/` (copied into `src/lib/music/` by setup) and `templates/music/`: song and lyric timing helpers, a lyric layer with one lyric font, image plates and extruded 3D text printed in the video's look, a poster cut-out word, a WebGL canvas with a post stack that renders headless, particles. Renders use `--gl=angle`.

Finishes (optional, one per video, any palette): plain (default), riso halftone, 35 mm film, 8-bit pixel, cel/anime, neon noir, Y2K chrome, VHS tape, linocut, engraving, blueprint, ASCII terminal, cut paper, watercolour, comic/pop art, duotone poster. Each sets how image plates print, the refrain material, the post stack and screen pass, a 2D overlay and the lyric shadow.

## Voice and audio

Audio is generated through MCP servers you connect yourself; the plugin holds no audio API key. `scripts/audio.mjs` lists the calls still needed and stores what comes back (WAV is converted to mp3), so unchanged scenes are never generated twice. Every paid stage states its cost and asks first.

| Need | Through |
|---|---|
| Narration | your choice in the interview: Gemini Flash TTS via fal (30 voices, delivery directed in plain words such as "calm and warm, slightly fast"), ElevenLabs v4 via fal (premade voices, audio tags such as `[calm]`), or the ElevenLabs MCP (your own, library or designed voices) |
| Word timings (tutorial steps, pace) | ElevenLabs Scribe v2 via fal |
| Sound effects | ElevenLabs Sound Effects v3 via fal, after the sound library |
| Music bed | ElevenLabs Music v2.5 via fal |
| Lyric alignment (music videos) | ElevenLabs forced alignment via fal |

The voice style applies to the whole video; a scene with its own `Voice:` line in `SCRIPT.md` is spoken with that delivery instead.

## Sound library

Generic sound effects (clicks, typing, whooshes, pops, chimes, ...) are generated once and reused. `sfx/` ships with the plugin, and `sfx/soundlist.md` describes each sound: id, length, description, use case, prompt and settings. Scripts reuse a sound with `lib:<id>` in an `SFX:` line, and tutorial click and typing sounds always come from the library. After each video, new generic effects are saved back. Set the plugin option **Sound library folder** to `<your marketplace checkout>/plugins/video-engineer/sfx` and they land in the repo, ready to commit and ship. Left empty, they stay in the plugin's data folder on that machine. Effects play at `meta.sound.sfxVolume` (default 0.15).

## What you need

- Node 18 or newer. The bundled ffmpeg of Remotion is used; no system ffmpeg.
- The fal MCP, connected in Claude Code (https://fal.ai/docs/documentation/setting-up/mcp/claude-code), for images, narration, word timings, sound effects, music and lyric alignment. Without it the plugin writes image prompts for you to paste into another tool. Optional: the ElevenLabs MCP for narration with your own ElevenLabs voices; its voice search and previews are free.
- For app showcases and tutorials: Playwright Chromium (about 150 MB, installed by setup) and a runnable app.

## Settings and hooks

The plugin needs no API keys: images and audio go through the MCP servers connected in Claude Code. Its one setting is the sound library folder (`/plugin` → video-engineer → configure).

The plugin is a mod (tested with Claude Code 2.1.296). On session start it exports the sound library folder as `VIDEO_ENGINEER_SFX_LIBRARY`; scripts read only the environment. `claude plugin validate` reports:

```
hooks: session.start
calls: $.env.set
env writes: VIDEO_ENGINEER_SFX_LIBRARY
```

## Remotion licence

Remotion is free for individuals and companies of up to 3 employees. Companies with more than 3 employees need a Remotion company licence (remotion.pro). The plugin installs Remotion into your project; the licence obligation is yours.

## Contents

- `skills/`: `setup`, `new` and `upgrade` (in the `/` menu), the stage skills Claude loads itself, and background skills (`scene-manifest`, `remotion-core`, `motion-rules`, `direction`, `audio`, `captions`, `qa-critic`, `platform-norms`, `asset-contract`, `video-interview`, `brief-and-script`, `reference-analysis`).
- `agents/`: `interviewer`, `researcher`, `director`, `critic`, `block-builder`.
- `scripts/`, `hooks/`: Node standard library and POSIX sh only. `scripts/analyze-music.mjs <audio> <out.json> [--fps 30] [--plot <png>]` analyses a song (bpm, beats, downbeats, onsets, energy, bands, sections, vocal onsets) for music mode; run it from the project root.
- `lib/`: scene, motion, transition and music components copied into the project as `src/lib/` by setup.
- `sfx/`: the shipped sound library and `soundlist.md`; `scripts/sfx-library.mjs list|use|save` manages it.
- `templates/music/`: the music-video project skeleton (song composition, per-block and preview compositions, theme, storyboard).
- `examples/hello-world/`: three scenes with audio and images, needs no API keys.
- `tests/critic-fixture/`: frames with three planted defects; the critic must return exactly those (see its README).
- `VENDORED.md`, `vendor-licenses/`: third-party code, commits and MIT licence texts.
