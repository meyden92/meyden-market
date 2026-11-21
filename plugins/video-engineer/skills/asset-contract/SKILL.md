---
name: asset-contract
description: "The image asset contract for video-engineer: the style sheet rule, layers and what each needs (alpha, minimum size), file naming, the status lifecycle, how asset prompts are written, and how PNGs are validated. Use before writing asset prompts, generating or accepting images, or editing assets[] in scenes.json."
user-invocable: false
---

# Asset contract

Images are PNG files listed in `scenes[].assets[]` of `videos/<slug>/scenes.json`, or for a music video in `videos/<slug>/assets.json` (`{width, height, scale, assets: [...]}`, a music video has no scenes.json). Fields: `file`, `layer`, `prompt`, `scale` (optional), `status`, and in `assets.json` also `owner`.

## Style sheet rule

`meta.style.sheet` is prepended verbatim to every image prompt, separated by a blank line. It is the only place style words live (medium, line weight, palette, lighting, mood). Never paste it into an asset's `prompt` and never restate its words there.

## Layers

| Layer | Content | Alpha | Minimum size |
|---|---|---|---|
| background | full-canvas scene backdrop | not required | width >= scale x canvas width and height >= scale x canvas height |
| subject | one isolated object or figure | required | longer side >= scale x the shorter canvas side |
| overlay | isolated decoration (particles, frame, glow) | required | longer side >= scale x the shorter canvas side |
| screenshot | user capture or `capture.mjs` (device scale 2) | not checked | not checked |
| screencast | WebM recording from `capture.mjs` | not applicable | not checked |

Alpha means PNG color type 4 or 6, or a tRNS chunk.

## Scale

`scale` is the largest magnification the video applies to the image, from 1 to 2, default 1. An image shown still at canvas size needs 1; more pixels only cost time and money. Set it per asset when the prompt is written, from the scene's motion and the video's cuts, and take the largest that applies:

| The image | scale |
|---|---|
| shown still, wide only | 1 |
| camera push or zoom to z (1.2 = 20 % closer) | z |
| parallax layer travelling d of the canvas width | 1 + d |
| 16:9 background also used in a 9:16 cut (cover-fit) | 1.8 |
| 16:9 background also used in a 1:1 cut | 1 |

Multiply when they combine (a 1.2 push in a video with a 9:16 cut: 2, the cap). A narrated video writes it in SCRIPT.md as `(<layer>, <scale>x)`; a music video writes `scale` in `assets.json` from the storyboard's camera extremes. Example on a 1920x1080 canvas: a still background at scale 1 needs 1920x1080; with a 1.2 push, 2304x1296; a subject at scale 1 needs a side of 1080.

## Naming

`public/img/<sceneid>-<name>.png`. `<sceneid>` is the id of the scene that owns the asset (`s02`). In a music video the prefix is the owning block id or `shared` (`verse1-wanderer.png`, `shared-sky.png`), and the names are fixed in `assets.json` before any prompt is written. `<name>` is lowercase kebab-case: letters, digits, hyphens (`s02-bg.png`, `s02-hero-laptop.png`). The `public/` prefix is part of the stored path.

Screencast files are `public/video/<sceneid>-<name>.webm`, same name rule. The validator checks the WebM header and the name only.

## Status lifecycle

`pending` -> `delivered` -> `valid` or `invalid`.

- `pending`: no file yet, or its layer, prompt or scale changed. The prompt stage and `image-gen.mjs plan` work on these.
- `delivered`: the file exists and has not been validated. `image-gen.mjs save` and `capture.mjs` set it after writing a file.
- `valid` / `invalid`: set only by `validate-assets.mjs`. A missing file is reset to `pending`.

When the user drops files into `public/img/` by hand, run the check; the validator sets the status.

## Writing a prompt

- Describe the subject only: what is depicted, its pose or arrangement, the composition within the frame (centered, left third, empty lower third for a caption).
- No style words. The sheet supplies them.
- No text, letters, numbers, logos or UI labels in the image. Text is rendered by Remotion.
- Subject and overlay prompts describe one isolated element on a transparent background. Do not write a background, ground shadow or scene around it.
- Background prompts leave the area where on-screen text sits visually calm.
- One asset per prompt.
- When a shader prints the art in the render (a music-video look), ask for plain art: none of the look's own treatment words (halftone, riso, dots, pixel, linocut, watercolour, ...) in the prompt. The shader would print the treatment twice.
- Name only what the image shows. Generators add unrequested objects; look at every result.

## Validation

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/validate-assets.mjs" <slug>
```

It checks existence, real PNG structure, name, alpha, size per layer and that no two assets share a content hash (a generator can return another job's image), sets every status, writes `videos/<slug>/research/asset-report.md` and exits 1 when any asset fails.

## Generation limits

`image-gen.mjs plan` requests the asset's size rule rounded up to multiples of 16 from GPT Image 2.5 on fal (backgrounds in the canvas aspect, subjects and overlays square, transparent where the layer needs alpha). The model takes edges up to 3840 and at most 8,294,400 pixels, so a 1920x1080 canvas reaches scale 2 and a 4K canvas only scale 1. `plan` names any asset beyond that and requests nothing for it: lower its scale (a gentler camera move) or have the user deliver the file. Do not upscale, resize or relax the rule on your own.

## 3D text fonts

Extruded 3D text (`TextGeometry`) needs a static TTF. A variable font loads its default instance, which is the wrong weight. Keep the TTF in `public/fonts/` and load it once; 2D text uses `@remotion/google-fonts`.

Done when: every asset has a status, `validate-assets.mjs` exits 0, `asset-report.md` lists no failure, and each image was viewed and matches its prompt.
