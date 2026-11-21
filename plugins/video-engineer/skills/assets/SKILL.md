---
name: assets
description: "Image asset stage for a video-engineer video: writes paste-ready image prompts, generates the PNGs, or validates delivered images against the asset contract. Use when the user asks to generate, regenerate, replace or check the images of a video, or has dropped images into public/img/."
user-invocable: false
---

# Assets

Work from the Remotion project root. The step is `prompts`, `check` or `generate`, for one `<slug>`. If the slug is not clear, use the only directory under `videos/` or ask which one. Rules for layers, naming and status: `asset-contract` skill. A narrated video lists its assets in `scenes.json`; a music video in `assets.json` (same fields plus `owner`).

## prompts

Write `videos/<slug>/research/asset-prompts.md`. Start with one line giving the canvas size and the style sheet. Then one block per asset with layer not `screenshot`, in scene (or block) order:

````
## <file>

- Scene: <id>
- Layer: <layer>
- Required size: <the asset's size rule from asset-contract, e.g. at least 1920x1080 at scale 1>
- Transparent background: yes | no

```text
<meta.style.sheet>

<asset.prompt>
```
````

The text block is the sheet, a blank line, then the prompt, so it can be pasted into ChatGPT or Nano Banana unchanged. For transparent assets add nothing to the prompt; the "Transparent background" line tells the user which setting to use. Finish by telling the user to save each PNG at the listed path, then run `check`.

## generate

Run in the main conversation; the fal MCP calls are not available to subagents. Without the fal MCP, run `prompts` and stop.

1. `node "${CLAUDE_PLUGIN_ROOT}/scripts/image-gen.mjs" plan <slug>` (add `--scene <id>` for one scene or block, `--force` to regenerate delivered assets). It prints one JSON line per image: `file`, `endpoint_id` and `input`, with the size taken from the asset's size rule. A non-zero exit names assets whose rule the model cannot reach: report them and stop.
2. Price the lines (`get_pricing` for the endpoint), state the count and total, and ask once. Stop on a no and run `prompts` instead.
3. Submit all lines in one `submit_jobs` call (`endpoint_id` and `input` exactly as printed), then `wait_for_jobs`. For each result run `node "${CLAUDE_PLUGIN_ROOT}/scripts/image-gen.mjs" save <slug> <file> --url <images[0].url>`. A failed job is reported, not resubmitted in a loop.
4. Verify every image before use (generators have returned an image from another job and have added objects the prompt did not ask for): open it and confirm it shows what its prompt describes. Regenerate a failing image once (`plan --scene <id> --force`, that image's line only); if it fails again, report it.
5. Run the `check` steps.

If a shader prints the art in the render (a music-video look: halftone, pixel, linocut, watercolour, ...), prompt for plain art without that treatment and follow the look's art note in `music-video/references/kit.md`; otherwise the treatment prints twice.

## check

1. Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/validate-assets.mjs" <slug>`.
2. Exit 0: report the valid count.
3. Exit 1: report each failure from the output (missing file, no alpha, too small, name) with the file path, and the fix: regenerate or replace the file at that path. Stop. Do not edit statuses, scales or the rule to make it pass, and do not pad, resize or upscale an image.

Done when: `prompts` produced `asset-prompts.md` with one block per non-screenshot asset; `generate` and `check` ended with `validate-assets.mjs` exit 0 or a reported list of failing assets, and every generated image was viewed.
