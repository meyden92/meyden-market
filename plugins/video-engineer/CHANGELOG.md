# Changelog

All notable changes to video-engineer.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
versions follow [semver](https://semver.org).

## [0.8.0] - 2026-11-06

### Added

- Per-asset `scale` (1 to 2, default 1): the largest magnification the video applies to an image (camera push, parallax, a 9:16 cut). Written in SCRIPT.md as `(<layer>, <scale>x)` and in a music video's `assets.json`; it sets the image's size rule. A still image at canvas size is generated at canvas size.

### Changed

- Images are generated through the fal MCP (GPT Image 2.5, transparent where the layer needs alpha). `image-gen.mjs plan` prints one call per pending image with its size; `image-gen.mjs save` downloads the result. It covers music videos' `assets.json` too. Costs are confirmed once per run, as for audio.
- The plugin's mod only exports the sound library folder.

### Removed

- The OpenAI API key setting, `OPENAI_API_KEY`, the key redaction in prompts and the Read/Grep key filter.
- The Codex image route and its size probe.
- `meta.assetScale` and `assets.json` `scale`; the per-asset `scale` replaces them.

## [0.7.0] - 2026-11-06

### Added

- Lyric music videos run the Direction method (the `direction` skill's Lyric music video section): an inventory from the lyrics and the song's world, three treatments that differ in world, in how the lyrics live in it, in how blocks connect and in typeface, each a hand-written style frame of the same chorus line; `research/direction.json` records the choice and the fingerprint ledger covers music videos.
- `plain` look in `lib/music` and the default for new music videos: images print unchanged, no post stack or overlay. The other looks are finishes a treatment names, not the menu.
- `scripts/font-ttf.mjs`: a static TTF of any Google Font weight for extruded 3D type.
- `lyricWeights` in `defineMusic`: the lyric styles use the weights the chosen family has, so one-weight display faces get no synthetic bold.
- Treatments say what the video is made of (captures, rebuilt UI, generated images, code-drawn diagrams and type, 3D) and why the treatment fits, in the user's terms; the user can ask why or mix treatments. What the user already said (mood, references, a rejected look, a quality bar) binds every treatment.
- `meta.style.displayFont`, `ground` and `effects`, with BRIEF.md lines for display and body type, ground, effects and caption style.
- A video's own `src/videos/<slug>/Captions.tsx` replaces the base caption component.

### Changed

- Music videos: no default typeface (Bricolage Grotesque and its TTF left the template), extruded 3D refrain type is one option instead of the rule, the storyboard's Global section holds the treatment, and the 3D depth recipe applies only to 3D worlds.
- Narrated videos: `custom` is the default scene type; base types are parts used when they already look like the treatment, screenshot and screencast carry captures and tutorial steps.
- Base scenes stand on the background colour (`ground: plain`); the gradient mesh with grade, grain and vignette is `ground: mesh`. A camera other than `kenburns-in` or `kenburns-out` holds still.
- The theme template loads the treatment's fonts instead of Inter.
- Captions are built from the voice stage's Scribe word timings; whisper.cpp and `@remotion/install-whisper-cpp` are gone.
- Image generation runs in the main conversation, so the Codex route works in a run.
- The critic scores richness by the material of the treatment's world instead of counting depth layers.
- Brand profile sample values are never recommended; open keys stay empty.

### Removed

- The music look board (`LookBoard.tsx`, `<slug>-looks`): it showed every option as the same image, word and line under a different filter.
- `meta.style.look` from the narrated schema (it was never read).

### Fixed

- The director's parallel-builder section (it has no Agent tool).
- `musicDuck` is taken from the brief instead of a fixed 0.15.
- Diagram text splits on `→` or `->` as the component does.

## [0.6.0] - 2026-11-06

### Added

- Direction branch in the interview and the `direction` skill: Claude writes the default a generic run would make, sketches five treatments and keeps three that differ in world, device and form (one deliberately bold), each with idea, world, palette, type, a motion language in numbers and a signature scene; each is rendered as a style frame and the user picks. BRIEF.md gets a Direction section, scenes.json `meta.direction`.
- Style frames: `src/videos/<slug>/frames/<name>.tsx` (exporting `Frame`, `width`, `height`) is registered by gen-index as `<slug>-frame-<name>`, for direction stills and motion tests before a video has scenes.
- `custom` visualType: a scene without a base component, written for the video; gen-index fails until its component exists. The hook and the signature scene are always custom. `custom` is also accepted for entrance, camera and transitionIn.
- `scripts/fingerprint.mjs add|list`: a ledger of finished videos in the plugin data folder; new treatments must differ from the last ones, and the critic sees them.
- Layout check: `contact-sheet.mjs` appends `similar:` pairs of scenes that share a layout (24x24 grey thumbnails, colour ignored) and a `layouts:` count to `flags.txt`.
- Critic axes `specificity` and `variety` (ten axes now), with a template-tell checklist and a cross-video cap.
- `@remotion/effects` 4.0.537 in the project template, with `remotion-core` references/effects.md: all 80 effects grouped by what a world needs (material grounds, print looks, cut edges, in-scene reveals, projections, grades), how they compose on `Solid` and `Img`, and how to texture DOM type.

### Changed

- `motion-rules` keeps only the technical rules; the house style (one entrance set, five-layer background, Ken Burns and breathing everywhere) gave way to the motion language each video's brief sets. The `lib/motion` components are a parts bin used where the build plan says why.
- The build stage writes `research/build-plan.md` and checks it against the default reaches before writing code; scenes are written in the treatment's world.
- The script stage writes each scene in the treatment's world first and picks a base type only when its component can show it; narration is no longer bent to fit a type.
- The QA prompt passes `flags.txt` and the fingerprints to the critic.
- scene-manifest no longer points at the hello-world example as a model.
- The direction method was trial-run on three briefs and revised: an inventory of the subject's own nouns feeds the worlds, at least two of five sketches use a device or form written for the subject, the skill names no example materials (the trials copied them), and the bold option may not default to a print look, which all three trials did.

### Fixed

- Skill descriptions containing `: ` are quoted, so a strict YAML parser reads them (12 skills).

## [0.5.0] - 2026-11-06

### Changed

- Audio runs through the fal MCP and, for narration, optionally the ElevenLabs MCP instead of an ElevenLabs API key. `scripts/audio.mjs` replaces `scripts/elevenlabs.mjs`: `plan` prints each call still needed (narration, effects, music, lyric alignment) as one JSON line, Claude makes the call, `save` downloads the result, converts WAV to mp3 and writes the cache sidecar. It never calls a paid API itself.
- Narration providers, chosen in the interview: Gemini Flash TTS via fal (`google/gemini-3.8-flash-tts`, delivery directed in plain words), ElevenLabs v4 via fal (premade voices, audio tags), or the ElevenLabs MCP (own, library and designed voices). Word timings come from ElevenLabs Scribe v2 via fal for every provider.
- `meta.voice` is `{provider, model, voice, style, settings, wpm}`. New interview leaves TTS provider and voice style; a scene can override the delivery with a `Voice:` line in SCRIPT.md (`scene.voiceStyle`), which also resets its measured duration.
- Voice and sound stages run in the main conversation (the director cannot reach MCP tools); the run order is director (sync, capture, assets), audio here, director (captions, build). Each paid audio stage states its total cost and asks once.
- `brand/voice.json` uses the new voice keys.

### Removed

- The `elevenlabs_api_key` option, `ELEVENLABS_API_KEY` export and redaction, and the ElevenLabs guard hook (it also blocked harmless Bash commands that mentioned the script's name).
- `audio-elevenlabs` skill, replaced by the provider-neutral `audio` skill.

## [0.4.0] - 2026-10-22

### Added

- Sound library: `sfx/` with `soundlist.md` (id, file, length, description, use, prompt, settings, source), seeded with click, typing, six airy whooshes, a soft pop and a bright chime. `scripts/sfx-library.mjs list|use|save`. `SFX:` lines take `lib:<id>`; tutorial click and type sounds come from the library. The sound stage saves new generic effects back. The new option **Sound library folder** points it at the marketplace checkout so saved sounds can be committed; without it they go to the plugin data folder.
- `meta.sound.sfxVolume` (default 0.15) sets the volume of every sound effect and enters the render hash of scenes with sound.
- `elevenlabs.mjs check` (free key check), `voices` (free shared-library search with preview clips, and `--add` for the chosen voice) and `pace` (one paid sample that measures the voice's words per minute into `research/pace.json`; `meta.voice.wpm`). sync-script estimates scene lengths at the measured rate.
- Interview leaves: voice gender and age before any sample, pace, pronunciation of URLs and brand words, SFX volume; the size of existing files is checked during the interview.
- Music-video QA: after the build, `frames.sh` (now also for music videos) and the critic agent with the storyboard and `blocks.json`, at most three fix rounds through the block builders.
- `frames.sh` measures dark frame edges (`dark-edge:` in `flags.txt`) on every draft frame; the critic treats an exposed frame edge and unreadable lyric or headline text against its background as hard failures and caps richness when a named material does not read as itself.
- Remotion Studio runs in the background while a video is built (port 3000, or the next free port when the app uses it) and is stopped after the final render.
- `meta.assetScale` / `assets.json` `scale`: 1 only after the user accepts softer images from an image route that cannot reach 2x.

### Changed

- Only `setup`, `new` and `upgrade` are in the `/` menu. `new` asks which kind of video (narrated, app showcase or tutorial, lyric music video) and loads the stage skills itself; the stage skills are model-invoked with descriptions that match plain requests.
- `run` and the director stop on a hard failure and the main conversation asks the user one question, then resumes. The QA bar is the same everywhere: no hard failure, every axis at 8 or above, average at 8.5 or above.
- Music videos keep images in `videos/<slug>/assets.json`, named `<block>-<name>.png` or `shared-<name>.png`, and have no scenes.json. The render guard and gen-index skip music videos.
- Music video: song and lyrics are found in the project before asking; the flagship chorus is built in the first wave; rounds are reviewed as one contact sheet; review state lives in `progress/review.md`; a scripted lyric-font check; the final render is 1080p only (no 720p copy); WIP previews render at half size.
- Block builders check stills at the first, middle and last frame of every shot and at each camera move's extreme, plan plates against the whole camera move, keep text areas calm, compare progress stills by md5 and report in at most 25 lines.
- Assets: a size probe of the image route, image briefs with exact paths and no padding or resizing, the lead calls Codex directly, scratch files are removed from `public/img/`.
- The critic's capture-text rule applies only to text the scene focuses on; other app UI is incidental.
- The capture runs before gate 2, so failing selectors are fixed while the user is there. `setup` asks before scaffolding inside an existing app repo, never edits the host project's config unasked, reports videos a kit update broke, and checks the ElevenLabs key.
- ElevenLabs requests have timeouts, print their duration, and name the missing permission on a 401.

### Fixed

- `gen-index.mjs` crashed on a video whose scenes.json had no `meta.sound`, and registered several music videos although `lib/music` holds one config; it now registers one music video at a time (the slug argument, else the latest).
- The render guard blocked music-video renders because of a placeholder scenes.json.
- `frames.sh` measured brightness with the bundled ffmpeg's grey output, which is not full range: dark navy frames were flagged as near-black or "real black frame". Luma is now computed from RGB.

## [0.3.0] - 2026-10-20

### Added

- Showcase and tutorial videos of a running app. The interview gets a `kind` leaf (explainer, showcase, tutorial) and an App branch (seven branches); the `app` researcher job writes `research/app.md`; `videos/<slug>/app.json` says how to start and log in to the app. Tutorial style (cursor, highlight, maxZoom) is chosen from stills rendered by the `tutorial-probe` composition.
- `scripts/capture.mjs`: starts the app, logs in once, runs each scene's `Capture:` steps in Playwright Chromium and writes screenshots (device scale 2) or WebM recordings plus target boxes in `public/capture/`. New pipeline stage between sync-script and assets. `setup` installs Playwright Chromium.
- SCRIPT.md fields `Capture:` and `Steps:`; visualType `screencast`; asset layer `screencast`. A `screenshot` scene with steps becomes an animated walkthrough: cursor, click ripple, typed text, spotlight or outline highlight, callouts, numbered badges and zooms, anchored to spoken words.
- `lib/motion` components `Cursor`, `ClickRipple`, `Highlight`, `Callout`, `StepBadge`, `ZoomLayer`, `zoomFor`, `toScreen`.
- `elevenlabs.mjs tts` uses the with-timestamps endpoint (same cost) and writes `public/audio/<id>.words.json`; `sfx` also makes `ui-click.mp3` and `ui-type.mp3` when scenes click or type.
- `qa-critic` hard failures: overlay missing its target, capture text under `minTextPx` at the shown zoom, personal data or a hidden area visible.

- Project looks: `defineMusic({ looks })` and `PROJECT_LOOKS` in the template theme register a video's own looks from `src/videos/<slug>/looks/`. `getLook(id)` resolves project looks before the built-in ones, so `Plate`, `ShotCanvas`, refrain materials, the overlay and the look board use them. An unknown look id now throws with the known ids.
- Music video step 6, Custom pieces: before the storyboard the lead writes the video's shared looks, effects, fonts and components in `src/videos/<slug>/` and shows a still of each. The storyboard lists them under Custom pieces.

### Changed

- Narration regenerates once for existing videos because their `words.json` is missing.
- The kit is a base, not a limit. Look choice offers at most 2 built-in looks and at least one look written for the video. Block builders write their own block-only shaders, effects and components instead of settling for the nearest kit component; the kit and shared pieces stay read-only for them.
- Narrated build: custom scenes are written for the hook, key moments and CTA, with project components in `src/videos/<slug>/components/`. The `motion-rules` glow ban applies only under `effects: "restrained"`.
- `LookId` accepts project look ids; the templates use `getLook(id)` instead of `LOOKS[id]`.

## [0.2.1] - 2026-10-20

### Fixed

- Music video: lyrics without `[SECTION]` headers no longer turn the whole song into one block. Before alignment the lead converts other lyric shapes to headers (with the user's approval, sung lines untouched), and `music-blocks.mjs` fails when a line has no section.
- `elevenlabs.mjs align` refreshes section labels from `lyrics.txt` on a cache hit, so header edits after alignment take effect without a new API call.

## [0.2.0] - 2026-10-20

### Added

- Music-video looks (`lib/music/looks/`): riso, film, pixel, cel, neon, chrome, vhs, linocut, engraving, blueprint, ascii, paper, watercolor, comic, duotone. Each sets how image plates print, the refrain materials, the post stack, an optional screen pass over the 3D frame, an optional 2D overlay and the lyric shadow, on any project palette.
- `defineMusic({ look })`, `LOOK` in the template theme, `LookScope` (another look or palette for a subtree), `usePalette`, `useLyricShadow`.
- `<slug>-looks` look board composition for look-choice stills; `look` and `lookPalette` props on the per-block compositions.
- Plate prelude helpers `softBlur` and `kuwahara`; `outline` hull support in `Text3D`; `shadedMaterial` and `outlineMaterial` for light-independent refrain materials.
- `meta.style.look` in the scenes schema; the critic treats the look's texture as intended.

### Changed

- `HalftonePlate` is replaced by `Plate`, which prints in the current look (`dots` is now `density`). The riso halftone is the `riso` look and stays the default.
- `useRefrainMaterials()` and `ShotCanvas` follow the look; `ShotCanvas` `post` is optional and overrides the look's post defaults.
- Fame lyric style: sung and upcoming words at 60 % and 45 % paper.
- Critic: a line caught mid-fade is neither ghost text nor an empty beat; accent-coloured letters and props are not accent fills.

## [0.1.0] - 2026-10-20

### Added

- Initial plugin scaffold.
- setup and render skills, scene-manifest skill, scenes schema, gen-index / render-changed / validate-manifest scripts, base scenes, hello-world example.
- run skill and director agent: resumable pipeline from script sync to cuts.
- captions skill and `scripts/captions.mjs` (whisper.cpp through `@remotion/install-whisper-cpp`), burned in by Remotion; caption files are part of the render hash.
- cut skill: 9:16 and 1:1 compositions via `render-changed.mjs --cut tall|square`.
- brand skill and default brand profile templates.
- `VENDORED.md`, `vendor-licenses/`, `scripts/vendor-upstream.sh` and the upgrade skill.
- API keys as sensitive userConfig, exported by a mod (`hooks/register.mjs`) that also redacts keys from prompts and withholds Read/Grep results containing a configured key.
- Music mode: `music-video` skill, `block-builder` agent, `scripts/analyze-music.mjs`, `elevenlabs.mjs align` (forced alignment of a user-supplied lyrics.txt), `scripts/music-blocks.mjs` (blocks snapped to downbeats, stubs), `lib/music/` kit and `templates/music/` project skeleton.
- Critic: richness axis (eight axes), glow and bloom judged by `meta.style.effects`, hard failures for text at the frame edge or bottom margin, collisions, duplicated words, flat accent fills, flash rate, near-black frames, placeholder empties, ghost text, z-fighting and mixed lyric fonts; `frames.sh` writes `flags.txt` (flash and near-black runs over every frame, re-extracts near-black stills).
- Director process: parallel builder waves with disjoint files, progress stills sent as they land, look and font choices as rendered stills, WIP preview.
- Assets: parallel image generation with an optional Codex route, duplicate-image check in `validate-assets.mjs`, contact sheets from RGBA and greyscale PNGs.
- ElevenLabs guard asks before every paid call.
