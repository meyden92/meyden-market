---
name: brief-and-script
description: How video-engineer writes BRIEF.md and SCRIPT.md from the interview's decision log, and creates scenes.json from them, covering the BRIEF headings, the SCRIPT.md scene block format, scene splitting (8-20 s at the voice's measured words per minute, one idea each), choosing a base visualType or a custom scene, on-screen text, assets per layer, SFX placement per density, motion values, and the meta JSON for sync-script --init. Use when drafting or revising BRIEF.md or SCRIPT.md, or writing scenes.json for a new video.
user-invocable: false
---

# BRIEF.md and SCRIPT.md

Both files live in `videos/<slug>/` under the Remotion project root. They are written from `research/interview.md` (the decision log) and the other files in `research/`, and from nothing else: a second session holding only these files must reach the same result.

## BRIEF.md

Copy `${CLAUDE_PLUGIN_ROOT}/templates/BRIEF.md` and replace every `<...>` placeholder. The headings are fixed and parsed by later stages; keep their names and order.

- Every heading carries content from the decision log. A leaf recorded "n/a" is written as "none" with its reason.
- **Format** states the canvas, fps, the duration band as min:ss-max:ss, the platforms, the cuts, and the safe-zone margins in px from the `platform-norms` skill.
- **References** has one line per screenshot: file, take, reject, and a link to `research/references.md`.
- **Direction** carries the chosen treatment from `research/directions.md` verbatim, its style frame and the Default line it departs from (`direction` skill).
- **Visual system** palette entries are `#RRGGBB`, background first, from the chosen treatment; Motion language is the treatment's, in numbers. When the look differs by scene, record one style choice per scene (look, type, motion intensity) as chosen by the user; a later choice replaces the earlier one everywhere in BRIEF.md and SCRIPT.md.
- **App** is "none: no app shown" for an explainer. For a showcase or tutorial it carries the App leaves from the log and the tutorial style; `videos/<slug>/app.json` carries the same source, start, URL, viewport and hide values. Credentials are named by env var or seed file, never written.
- **Voice** carries the provider, model, voice, the voice's gender and age, the voice style, the measured pace from `research/pace.json` and the Pronunciation list; **Sound** carries the effect volume and the library sounds chosen.
- **Structure** lists every section with target seconds; the seconds add up to a value inside the Format band.
- **Assets** carries the style sheet verbatim. It describes medium, line weight, palette, lighting and mood, and is the only place style words live (see the `asset-contract` skill).
- **Decisions** has one line per leaf whose source is "you decide" or "accepted": `<leaf>: <decision> (<reason or source>)`.

## SCRIPT.md

Start from `${CLAUDE_PLUGIN_ROOT}/templates/SCRIPT.md`. One block per scene, in playback order:

```markdown
## s03 · setup

Run one command and the tool writes a typed config next to your code. Nothing to copy from the docs, nothing to keep in sync by hand.

Type: terminal
On screen: init command, three green check lines
Motion: rise · none · slide
Data: {"title": "zsh", "lines": ["$ npx confgen init", "✔ config.ts written", "✔ types generated", "✔ ready"]}
Assets:
- s03-bg.png (background): empty dark desk surface seen from above, calm upper half
SFX:
- 0: short soft whoosh
- 2.5: single mechanical key click
```

| Line | Required | Value |
|---|---|---|
| `## sNN · <section>` | yes | id `s01`, `s02`, ... in order; section is a kebab-case name from BRIEF.md Structure |
| narration | yes | plain prose before the field lines; paragraphs separated by a blank line |
| `Type:` | yes | one visualType from the list below, `custom` for a scene written from scratch |
| `On screen:` | yes | what the viewer sees; may be empty for a pure illustration |
| `Motion:` | yes | `<entrance> · <camera> · <transitionIn>` |
| `Voice:` | no | delivery for this scene only, in the provider's form (`audio` skill); replaces the video's voice style |
| `Data:` | no | one-line JSON object with the visualType's keys |
| `Capture:` | app scenes | one-line JSON `{"shot":"<kebab>","record":false,"steps":[...],"targets":{"<name>":"<selector>"}}` |
| `Steps:` | no | `- "<spoken word>"[#n]: <action> [<target>] ["<text>"]` or `- <seconds>: ...` lines below it |
| `Assets:` | no | `- <id>-<name>.png (<layer>[, <scale>x]): <prompt>` lines below it; the file lands in `public/img/` |
| `SFX:` | no | `- <seconds into the scene>: <prompt>` lines below it |
| `Captions:` | no | `on` (default) or `off` |

Narration is written for the ear: short sentences, numbers as the voice should say them, no markdown, no stage directions. Delivery goes in a `Voice:` line, and only on scenes whose delivery differs from the video's voice style (a punchier hook, a quieter turn, a warmer CTA).

### Splitting into scenes

- One idea per scene. A scene that needs "and" to describe its point is two scenes.
- The speaking rate `wpm` is `research/pace.json` (measured with the chosen voice in the interview); 140 only when it is missing, and then say so. Words per scene: 8-20 s at that rate (`8 x wpm / 60` to `20 x wpm / 60`; 19-46 words at 140).
- Total words: about `targetSec midpoint x wpm / 60` (45 s at 140 → about 105 words, 6 min → about 840). Scene count follows: total seconds / 12 is a good first split.
- Spell URLs, file extensions, acronyms and brand words the way the voice must say them, as the brief's Pronunciation list gives them (`lunashare dot app`, not `lunashare.app`); on-screen text keeps the written form.
- Each section from BRIEF.md Structure gets its target seconds, within 10 %. The hook is the first scene: its first sentence lands inside the platform's hook time (`platform-norms`), and the promise is stated by the end of the scene.
- The last scene is the CTA from the brief.

### Choosing visualType

Every scene is written in the treatment's world first (BRIEF.md Direction), from what the video is made of, then typed:

- `custom` is the default. `On screen:` describes the picture and its motion in the world's terms ("the config strip is cut from the docs page and lands in the editor"), and the build stage writes the scene from scratch.
- `screenshot` and `screencast` when the scene shows the captured app with its `Capture:` and `Steps:`; `code` and `terminal` when plain code or a shell on screen is the picture the treatment wants.
- The other base types (title, illustration, layered, diagram, counter, list, comparison, quote, cta) only when that base component already looks like the treatment; they are parts, not the plan.

The narration decides what a scene shows; the type follows it, never the reverse.

The `Data:` keys per base type are listed under `scene.data` in the `scene-manifest` skill. Every key is optional; leave out what the brief does not supply. Keys come from the base components in `${CLAUDE_PLUGIN_ROOT}/lib/scenes/<Type>.tsx`. Without `Data:`, the component reads `On screen:` (list and terminal split it on `;` or newlines; diagram splits on `→` or `->`). A `custom` scene may carry any `Data:` its component will read.

### App scenes

`Capture:` steps and `Steps:` lines are specified in the `scene-manifest` skill (`scene.capture`, `scene.data.steps`). Rules for writing them:

- Choose `screencast` when motion inside the app is the point (drag, animation, live typing results); otherwise `screenshot` with `Steps:`, which is cheaper and crisper.
- A tutorial has one step-goal per scene.
- A screenshot shows one state of the app. To show what a click changes, capture the after-state in the next scene or use a screencast; typed text is drawn in the input's own font, colour and background.
- Anchor each step to a word the narration speaks (`"Save"`, `"Save"#2` for the second occurrence). The narration names what is clicked, so the word exists.
- In a screencast, `Steps:` holds only highlight, zoom, unzoom, callout, badge and clear; move, click and type come from the recording.
- `Steps:` targets are names from `Capture:` `targets` or `as`; credentials and personal data appear in no step.

### On-screen text

On-screen text shows data, labels, UI and code. It never restates the narration: when the voice says "setup takes one command", the screen shows the command. Every on-screen word must be legible at `meta.style.minTextPx`; prefer fewer words to smaller text.

### Assets

Name files `<sceneid>-<kebab-name>.png`. Write prompts by the `asset-contract` skill: subject only, no style words, no text in the image. Add `, <scale>x` after the layer when the scene's `Motion:` camera or the video's cuts magnify the image (`asset-contract`, Scale); a still image at canvas size takes none.

| Type | Assets |
|---|---|
| illustration | one background, one subject |
| layered | one background, one or two subjects, optional overlay |
| screenshot | one `screenshot` layer pointing at the user's capture, copied to `public/img/<id>-<name>.png`; with `Capture:` the asset is added by sync-script and not listed |
| screencast | none listed; `Capture:` with `record: true` adds the `screencast` layer |
| custom | what the scene's picture needs in the treatment's world (a texture, a subject, a prop), or none when it is drawn in code |
| all others | none, or one background in the treatment's world when the brief's density calls for it |

List only files the BRIEF.md Assets section covers. Reuse a brand file by copying it to `public/img/<id>-<name>.png` and naming it here.

### SFX

Place effects from `meta.sound.sfxDensity`:

- `none`: no `SFX:` lines.
- `cuts`: one short effect at `0` in every scene after the first (whoosh, tick, soft hit).
- `rich`: the cut effects plus one effect per key on-screen event (a counter landing, a check mark, a key press). Place it at the second the narration reaches that event: word index / wpm x 60.

Prompts are short and concrete ("single mechanical key click"), never music. Before writing a prompt, read the sound library (`node "${CLAUDE_PLUGIN_ROOT}/scripts/sfx-library.mjs" list --data "${CLAUDE_PLUGIN_DATA}/sfx"`); where a library sound fits the moment and the brief's sound mood, write `lib:<id>` instead of a prompt (`- 0: lib:whoosh-soft-airy-2`) and vary variants across consecutive cuts. Library sounds cost nothing.

### Motion

| Field | Values |
|---|---|
| entrance | `rise`, `drop`, `left`, `right`, `pop`, or `custom` |
| camera | `kenburns-in`, `kenburns-out`, `none`, or `custom` |
| transitionIn | `fade`, `slide`, `wipe`, `glitch`, `rgbSplit`, `zoomBlur`, `lightLeak`, `clockWipe`, `pixelate`, `checkerboard`, `cut`, `none`, or `custom` |

The named values are what the base components can play. Take each scene's values from BRIEF.md's Motion language: entrances by role and by scene, a camera move only where the beat needs one, and seams from its transition family (3 to 5 kinds across the video, each with a visible cause). `custom` means the scene's component plays a move written for it (a carried object, a match cut, a colour flood); say which in `On screen:`.

## scenes.json

On the first write, run from the Remotion project root with the meta object on stdin:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/sync-script.mjs" <slug> --init <<'EOF'
{
  "title": "<BRIEF.md title>",
  "lang": "<Voice language>",
  "width": 1080, "height": 1920, "fps": 30,
  "targetSec": [<min s>, <max s>],
  "direction": { "name": "<Treatment name>", "idea": "<Idea>", "world": "<World>", "madeOf": "<Made of>", "device": "<Device>", "form": "<Form>", "motion": "<Motion language, one line>", "signature": "<signature scene id>" },
  "style": { "sheet": "<Assets style sheet, verbatim>", "palette": ["#RRGGBB", "..."], "font": "<Type body family>", "displayFont": "<Type display family; omit when the same>", "minTextPx": <px>, "ground": "plain|mesh", "effects": "restrained|allowed", "tutorial": { "cursor": "arrow|dot", "highlight": "spotlight|outline", "maxZoom": <number >= 1> } },
  "voice": { "provider": "fal|elevenlabs-mcp", "model": "<Voice model>", "voice": "<Voice name or id>", "style": "<Voice style>", "settings": { <Voice settings, omit the key when none> }, "wpm": <research/pace.json wpm> },
  "sound": { "musicPrompt": "<Sound music prompt>", "musicDuck": <Sound music duck>, "sfxDensity": "none|cuts|rich", "sfxVolume": <Sound effect volume, default 0.15> },
  "cuts": ["9:16", "1:1"]
}
EOF
```

Every meta value comes from BRIEF.md, except `voice.wpm`, which comes from `research/pace.json` (omit it when the file is missing). `cuts` lists the extra cuts besides the main canvas (`[]` for none). `minTextPx` is the Visual system minimum. `ground` is `mesh` only when the Visual system's Ground asks for a gradient mesh with grain and vignette; `effects` is `allowed` only when its Effects line says glow, bloom or colour split belong to the treatment. `tutorial` is present only when a scene has `Steps:`; it comes from the App heading's tutorial style.

After any later SCRIPT.md edit, run the same script without `--init`. It keeps `audio.durationSec` for scenes whose narration did not change, keeps `hash` and `qa` for scenes whose script block did not change, keeps each asset's status while its file, layer, prompt and scale are unchanged, adds new scenes, drops removed ones, and leaves meta untouched. SCRIPT.md is the source for every scene field it carries; edit scenes there, not in scenes.json.

The script validates the result and restores the previous file on failure. Its output ends with the scene table (id, section, type, words, estimated seconds) and the estimated total.

Done when: BRIEF.md has every heading filled with no `<...>` left; sync-script exited 0; its table flags no scene outside 8-20 s; and the estimated total sits inside `meta.targetSec`.
