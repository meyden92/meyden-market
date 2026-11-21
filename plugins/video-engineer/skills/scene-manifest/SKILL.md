---
name: scene-manifest
description: The scenes.json contract every video-engineer stage reads and writes, covering fields, the visualType set and custom scenes, the direction, style sheet rule, hash rule, scene id naming, and which stage owns which field. Use before reading or editing videos/<slug>/scenes.json.
user-invocable: false
---

# scenes.json contract

`videos/<slug>/scenes.json` is the only machine state of a video. The schema is `${CLAUDE_PLUGIN_ROOT}/templates/scenes.schema.json`; read it for field names, types and enums.

## Rules

- Asset, audio and sfx paths are relative to the Remotion project root and start with `public/`. Components load them with `staticFile(path without the public/ prefix)`.
- `visualType` is one of 13 base types (title, illustration, layered, diagram, counter, list, code, terminal, screenshot, screencast, comparison, quote, cta), each with a base component, or `custom`, which has none: its component is written for the video, and gen-index fails until it exists.
- `meta.direction` (`name`, `idea`, `world`, `device`, `form`, `motion`, `signature`) is the treatment chosen in the interview (`direction` skill). The critic judges the video against it.
- `meta.style.sheet` is prepended verbatim to every image prompt and is the only place style words live. `palette`, `font` (body), `displayFont` (headlines, default `font`), `minTextPx`, `ground` (`plain` default, or `mesh` for the gradient mesh with grade, grain and vignette behind base scenes) and `effects` (`restrained` default, or `allowed`) feed the Remotion scene components and the critic.
- Scene ids are `s` plus two or three digits (`s07`). The custom component for a scene lives at `src/videos/<slug>/scenes/<Id>.tsx` where `<Id>` is the id with the first letter uppercased (`S07`) and exports a component of the same name taking `{ scene, meta, layout }`. Without that file the base component for the visualType is used.
- Optional: `assets[].scale` (largest magnification of the image, 1 to 2, default 1; see `asset-contract`), `meta.voice.wpm` (words per minute measured for the chosen voice by `audio.mjs pace`; the script is written to it), `meta.voice.settings` (extra provider inputs such as `stability`; see the `audio` skill), `scene.voiceStyle` (delivery for one scene, from its SCRIPT.md `Voice:` line), `meta.sound.sfxVolume` (volume of every sound effect, 0 to 1, default 0.15).
- `audio.durationSec` is measured from the audio file, never guessed. Scene frames are `Math.round(durationSec * fps) + (meta.tailFrames ?? 12)`.
- `hash` is written by `render-changed.mjs` only: sha256 over narration, onScreen, motion, asset/audio/sfx file hashes, audio duration, the capture json, the word timings and the UI sounds of tutorial scenes, `meta.style.tutorial`, the scene's TSX file when it exists, the render-relevant meta (size, fps, tail, style), and `meta.sound.sfxVolume` for scenes that play a sound effect. A scene is re-rendered when its hash differs from `videos/<slug>/out/scenes/<id>.hash`. Do not edit it by hand.
- Preserve existing fields when editing. Change only what the task needs.

## scene.data

`data` is an optional object on a scene. The base components read the keys below; unknown keys are ignored. When a key is missing the component falls back to `onScreen`.

| visualType | Keys |
|---|---|
| title | `kicker`, `subtitle` |
| illustration | none; shows the first asset with Ken Burns and `onScreen` as caption |
| layered | none; shows up to three assets with parallax and `onScreen` as caption |
| counter | `value` (number), `from`, `decimals`, `prefix`, `suffix`, `label`, `locale` |
| list | `title`, `items` (string[]) |
| quote | `quote` (default `onScreen`), `author`, `role` |
| cta | `action` (button text), `url` |
| diagram | `title`, `nodes` (string[] or `{label, note}[]`), `edges` (`[from, to][]` by node index; default is a chain). Without `nodes`, `onScreen` split on `->` or newlines |
| code | `code`, `file` |
| terminal | `lines` (string[]; a line starting with `$ ` is a command), `title` |
| screenshot | `url` (address shown in the frame header), `steps` (tutorial steps; needs `capture` with `record: false`); the image is the first asset |
| screencast | `url`, `steps` (highlight, zoom, unzoom, callout, badge, clear only); needs `capture` with `record: true`; the video is the first asset |
| comparison | `left` and `right` (`{label, items: string[]}`), `winner` (`left` or `right`, default `right`), `title` |

## scene.capture and tutorial steps

`scene.capture` (screenshot and screencast scenes) is `{shot, record, steps, targets}`, written from the SCRIPT.md `Capture:` line. `capture.mjs` runs it and measures the boxes.

- `shot`: kebab name; the asset is `public/img/<id>-<shot>.png` or, with `record: true`, `public/video/<id>-<shot>.webm`. sync-script adds the asset.
- `steps`: browser actions, exactly one of `goto` (path), `click`, `fill` (+ `value`), `type` (+ `text`, typed visibly), `hover`, `press` (key), `scroll` (selector), `wait` (ms or selector). Optional `as` names the element for recorded events.
- `value` is a literal (non-secret only), `{"env":"VAR"}`, or `{"file":"<path relative to app cwd>","match":"<regex with one group>"}`.
- `targets`: name to CSS selector; boxes and text styles (font size, colour, background) are measured after the last step into `public/capture/<id>.json`.

`scene.data.steps` is the tutorial: `{at, action, target?, text?}`. `at` is seconds into the scene or `{"word":"<spoken word>","n":<occurrence>}`, which resolves to the start of that spoken word from `public/audio/<id>.words.json`; an unknown word fails the render. Actions: move, click, type, highlight, zoom, unzoom, callout, badge, clear. `callout` and `type` need `text`; `unzoom` and `clear` take no target; other targets name a capture target or an `as`. In a screencast, move, click and type come from the recording and are rejected as steps. Steps need `meta.style.tutorial` = `{cursor: "arrow"|"dot", highlight: "spotlight"|"outline", maxZoom: <number >= 1>}`.

## app.json

`videos/<slug>/app.json` tells `capture.mjs` how to reach the app. Written during the interview from the App leaves.

```json
{ "cwd": "/abs/path/to/app", "start": "npm run dev", "url": "http://localhost:5173", "readyTimeoutSec": 120,
  "viewport": { "width": 1440, "height": 900 }, "colorScheme": "light",
  "login": [ /* capture steps, run once */ ], "hide": ["<css selector>"] }
```

`cwd` and `start` are omitted when the app already runs or is a staging URL the user named. Hosts are local dev hosts or a staging host the user named. Credentials never appear as literals in app.json or SCRIPT.md: use `{"env":"VAR"}` or a seed-file `{"file","match"}` value.

## Who writes what

| Field | Written by |
|---|---|
| meta, scenes (except below) | interview / script stage |
| assets[].status | asset intake; capture.mjs sets `delivered` |
| capture, data.steps | script stage |
| public/capture/*, public/audio/<id>.words.json | capture stage; voice stage |
| audio.durationSec | voice stage |
| sfx[].file, music | sound stage |
| qa | QA stage |
| hash | render-changed.mjs |

## Validate

Run from the Remotion project root:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/validate-manifest.mjs" <slug>
```

It lists every violation with its JSON path and exits 1 on failure. Validate after every edit to scenes.json.

Done when: validate-manifest exits 0 for the slug.
