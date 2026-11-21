---
name: visual-qa
description: "Checking a three.js scene by running it and looking: start the dev server, capture frames with the session's browser tools, read console errors and live frame stats, and judge the frames against the request. Use after building or changing any 3D scene, when asked whether a scene looks right, to compare before and after, or to confirm a rendering fix."
---

# Visual QA for three.js scenes

## The loop

1. **Serve the page.** Use the project's dev script (`npm run dev`, or the script `package.json` names). For a single HTML file with an import map, `python3 -m http.server` in its folder; a `file://` URL cannot load modules. Run it in the background and read the URL from its output.
2. **Open it in a browser you can drive.** Take the first that this session has:
   1. Built-in browser tools (`mcp__Claude_Browser__*`): `preview_start` or `navigate`, then `computer` with `action: "screenshot"`, `read_console_messages`, `javascript_tool`.
   2. Claude in Chrome (`mcp__claude-in-chrome__*`) or a Playwright or Chrome DevTools MCP server.
   3. Playwright already installed in the project: a short script that opens the URL, waits, and saves a screenshot. Headless Chromium needs `--enable-unsafe-swiftshader` for WebGL and `--enable-unsafe-webgpu` for WebGPU; software rendering makes frame rates meaningless.

   With none of these, say so in the report and hand the user the URL and what to look for. Never report a scene as checked that you did not see.
3. **Wait for the scene.** Loading models and compiling shaders takes time; a frame captured early shows an empty canvas. Wait until the load finishes (a flag the app sets, the loading UI disappearing, or `window.__threeStats` reporting draw calls above zero), then capture.
4. **Capture the views that matter**: the default view, each state the request named (hover, open, night mode, after an interaction), and for animated scenes at least three frames spread over the motion. Resize once to a phone-sized viewport when the page is meant for phones.
5. **Read the console.** Any error fails the run. Read warnings too: three.js reports deprecated API, missing textures, shader compile failures and exceeded uniform limits there.
6. **Read the frame stats** ([below](#frame-stats)).
7. **Judge each frame** against [What to look for](#what-to-look-for), fix, and run the loop again from step 3. Compare with the previous capture after every fix so a repair in one place does not break another.

**Done when** the last capture was taken after the last edit, the console holds no error, and no frame shows a defect from the list below.

## Frame stats

`three-stats` reports what the renderer does per frame.

```bash
three-stats start     # starts the collector, prints the probe snippet
three-stats latest    # newest sample as JSON
```

Attach the probe where the renderer is created (the snippet is dev-only and silent when the collector is off), reload the page, then read `three-stats latest`: `fps`, `frameMs`, `worstFrameMs`, `calls` (draw calls), `triangles`, `geometries`, `textures`, `programs`, `backend`, canvas size and pixel ratio. The same sample is on `window.__threeStats` for `javascript_tool`. The probe sets `renderer.info.autoReset = false` and resets the counters itself each frame, so the counts cover shadow and post-processing passes. A background tab stops rendering; the page must be visible.

Leave the probe lines in place when the user works with the `/three-stats` pane; otherwise remove them when the work is finished.

Budgets for a scene meant to run on phones and laptops: under 200 draw calls, under 1 million triangles, frame time under 16.7 ms on the development machine with room to spare, `geometries` and `textures` flat while the scene idles. Growth while idle is a leak. Over budget, load `performance`.

## What to look for

- **Nothing or black**: empty canvas, black meshes, a canvas of zero size. Load `debugging`.
- **Framing**: the subject is cut off, tiny, off-centre without intent, or hidden behind another object; the horizon tilts; the camera sits inside geometry.
- **Light and color**: blown-out whites, crushed blacks, flat unlit look, washed-out or over-saturated textures (a color-space error), color banding in gradients.
- **Shadows**: missing where the light demands one, detached from the object (peter-panning), striped surfaces (shadow acne), hard clipped edge where the shadow camera ends, blocky edges.
- **Surfaces**: z-fighting flicker between coplanar faces, faces missing from one side, stretched or mirrored textures, visible seams, jagged edges with no antialiasing, moiré on fine patterns.
- **Transparency**: objects drawn in the wrong order, a transparent object hiding what is behind it.
- **Motion** (across frames): pops, objects sliding against the ground, animation that restarts or freezes, a stutter visible as a `worstFrameMs` far above `frameMs`.
- **Layout**: canvas not filling its container, a stretched aspect after resize, blurry rendering on a high-density screen (pixel ratio 1), overlay UI misaligned with the scene.
- **The request itself**: every element the user named is visible and recognisable, in the style they asked for.

## Reporting

State what was captured (views, viewport sizes), the console result, the frame stats, what was fixed during the loop, and anything that could not be checked (audio, XR sessions, real-device performance).
