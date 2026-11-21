---
name: brand
description: Create or edit the brand profile of a video-engineer Remotion project (brand/brand.json and brand/voice.json) and explain how it feeds new videos. Use when the user wants to set or change the brand colours, fonts, logo or default voice for their videos.
user-invocable: false
---

# Brand

Run from the Remotion project root. A brand profile is two JSON files in `brand/`, plus a logo if the brand has one. The interview (`new`) reads them first and recommends their values instead of asking.

The format follows the brand profile of digitalsamba/claude-code-video-toolkit (`brands/<name>/brand.json` and `voice.json`). Only the keys below are used. Defaults: `${CLAUDE_PLUGIN_ROOT}/templates/brand/default/`.

## Create

1. If `brand/brand.json` exists, ask whether to edit it. Otherwise copy `${CLAUDE_PLUGIN_ROOT}/templates/brand/default/brand.json` and `voice.json` to `brand/` for their keys; their values are samples and leave the files only as the user's own answers replace them.
2. Ask the user, one question at a time with a recommended answer, only what they have not already given: brand name, primary colour and background (hex), font family (a Google Font, so the build can load it), logo file, TTS provider and voice (chosen from samples as the `audio` skill says), voice style, language, tone words, music mood. Take colours and fonts from the brand's own site, screenshots or files the user points to; recommend from those, never from the sample values. A key the user leaves open is written empty, so later videos choose it per treatment.
3. Write the answers into the two files. Keep every key of the default; change values only.
4. Check: every colour in `colors` is a 6-digit hex, `fonts.primary` starts with a Google Font family name, `typography.label.size` is 36 or more, `voice.json` has a `voice` (an empty one is allowed; the interview then picks one per video). Copy a supplied logo to `brand/logo.png`.

## Keys

`brand.json`
- `colors`: `primary`, `primaryLight`, `bgDark`, `bgLight`, `textDark`, `textMedium`, `textLight`, `divider`.
- `fonts.primary` (CSS stack, first family is the Google Font), `fonts.mono`.
- `typography`: `h1`, `h2`, `h3`, `body`, `label`, each `{size, weight}`; sizes are px on a 1920-wide canvas.
- `spacing`, `borderRadius`: reference values for custom scenes.
- `mode`: `dark` or `light`; picks the background colour.
- `styleSheet`: the image style sheet, one paragraph, no text in images.
- `assets.logo`: path relative to the project root.

`voice.json`: `provider`, `model`, `voice`, `style`, `settings`, `lang`, `tone`, `music`.

## How it feeds a video

| Brand key | Target in scenes.json |
|---|---|
| `mode` selects `colors.bgDark` or `colors.bgLight` as first entry; then `primary`, `primaryLight`, and the contrasting text colour | `meta.style.palette` (first entry is the background; see `motion-rules`) |
| first family of `fonts.primary` | `meta.style.font` |
| `typography.label.size` | `meta.style.minTextPx` |
| `styleSheet` | `meta.style.sheet` |
| `voice.provider`, `model`, `voice`, `style`, `settings` | `meta.voice.provider`, `model`, `voice`, `style`, `settings` |
| `voice.lang` | `meta.lang` |
| `voice.music` | `meta.sound.musicPrompt` |

The interview copies these values into BRIEF.md (Visual system, Voice, Sound) and the script stage writes them into `meta`. After the gate, scenes.json is the source of truth; editing `brand/` later changes only videos created afterwards. To restyle an existing video, edit its `meta` and run the `run` skill for the slug.

Done when: `brand/brand.json` and `brand/voice.json` exist, pass the check in step 4, and the report lists the `meta` values they will produce.
