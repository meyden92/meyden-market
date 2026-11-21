---
name: motion-rules
description: Motion rules for video-engineer scene components, covering the technical rules every frame keeps, how a scene follows its video's motion language from BRIEF.md, restraint, transitions, and the lib/motion parts bin with when each part fits. Load before writing or editing any scene component, theme.ts or animation.
user-invocable: false
---

# Motion rules

Components live in `src/lib/motion/` of the Remotion project and import from `../../lib/motion`. Load `remotion-core` for API details and the `direction` skill for the motion language and the default reaches.

## The motion language comes from the brief

Each video has its own motion language, chosen in the interview and written in numbers under BRIEF.md's Visual system (`Motion language`) and in `meta.direction.motion`: ease by role, spring tier, arrival frames, stagger, holds, the current (one dominant direction), the transition family and the title entrance. A scene's motion is built from those numbers. Where the brief and a habit disagree, the brief wins; where the brief is silent, choose what serves the treatment's world (how its material behaves when it moves) and log the choice in `research/decisions.md`.

## Technical rules

<!-- upstream: haidrrrry/claude-remotion-skill remotion-motion-graphics/SKILL.md @ 1dcbe5e3fc6cf970bd10d3cc05f0a8a5d19d0383 (MIT) — changes: reduced to the technical rules (eased and clamped interpolation, fps-derived timing, one theme, OffthreadVideo, render-and-look loop); the house-style rules (fixed entrances, five-layer stack, Ken Burns and breathing everywhere) replaced by the per-video motion language -->

Every frame keeps these, whatever the treatment:

- Every `interpolate` has an easing curve and clamps both sides; arrivals and settles use `spring()` or an eased curve from the motion language. Linear motion only for constant loops the world calls for (a turning gear, a ticker).
- All timing derives from `fps` from `useVideoConfig()`. Convert seconds with `sec(seconds, fps)`. No magic frame numbers.
- One theme. Colours, type sizes, springs and easings come from `makeTheme(meta.style)` or from the video's own `src/videos/<slug>/theme.ts`. A hex colour or easing written inline in a component is a theme value that was skipped.
- Siblings arrive in sequence, offset by the motion language's stagger; two elements never start their arrival on the same frame.
- Exits are shorter than arrivals (40 to 50 % of the arrival time).
- Text is at least `meta.style.minTextPx`. Use `theme.type(layout, width)`.
- On-screen text never restates the narration. It shows data, labels, UI and code.
- Video assets use `<OffthreadVideo>`.
- A frame renders the same every time: no `Math.random` (use `random(seed)`), no CSS transitions or animations, no `Date.now`.
- Render, look at the frames, fix, render again: the `qa` skill runs that loop.

## Lyric and 3D rules

- One lyric typeface for the whole video; vary weight, size, colour, animation and layout instead. Diegetic UI (HUD, counters, hashtags, tickers, status bars) may keep its own fonts.
- Free lyric text sits on the picture with a soft dark shadow, not in a caption box. A container is allowed only where it is diegetic (a story sticker, a typed post field).
- Unlit and past lyric words stay at 40 % brightness or more and must read on the background colour.
- At most 3 full-frame white flashes per second.
- 3D: synchronous postprocessing composer, textures decoded before the first WebGL frame, `--gl=angle`, z offset and `renderOrder` against z-fighting, static TTF for `TextGeometry`, fit text to measured width. Details in `remotion-core`.

## Restraint

`meta.style.effects` is `restrained` (or absent) for most narrated videos. With `allowed` (a loud, flashy or glossy brief), glow, neon, bloom and coloured light are part of the style; keep them bounded and off the text. A music video sets glow and bloom by its look and custom pieces in the storyboard (`music-video` skill).

- Under `restrained`: no glow, neon, outer shadows tinted with the accent, or bloom. Depth comes from the world's surfaces, borders and soft neutral shadows.
- One accent colour per frame draws the eye. The rest is text and neutral surfaces.
- Holds are part of the design: a move lands, the frame holds still, the next move starts. Motion has a cause.
- Boldness is spent in the signature scene (`meta.direction.signature`); the scenes around it stay quieter so it reads.
- An effect that carries no meaning is removed: if removing it changes nothing, it goes.

## Parts bin

`src/lib/motion` holds tested parts. They are ingredients, not a house style: use one when the motion language asks for what it does, and write the move yourself when it does not. A scene built only from these parts usually looks like every other video the plugin made, so the hook, the signature scene and every `custom` scene get motion written for this video.

| Part | Fits when |
|---|---|
| `Reveal`, `Exit` | an element arrives or leaves by translate, scale and opacity. Props `index` (stagger slot), `delay` (seconds), `from` (rise, drop, left, right, pop), `feel` (smooth, snappy, bouncy). |
| `WordReveal` | a headline lands word by word; `heroWord` marks one word in the accent colour. |
| `KenBurns` | a still needs a slow camera move for its beat. `camera` is in, out or none; `fit` is cover or contain. |
| `Parallax` | layered depth is part of the treatment's world. Pass `layers` with a `depth` each; deeper layers move less. |
| `Counter` | a number counts up. Tabular figures, `prefix`, `suffix`, `decimals`. |
| `Breathe` | the world itself has idle life and the brief asks for it. |
| `Background`, `BgMesh`, `Grade`, `Grain`, `Vignette` | the treatment's ground is a mesh gradient with grade and grain. A ground made of the world's material is written for the video instead. |
| `Cursor`, `ClickRipple` | tutorial scenes: the pointer travelling to each target (arrives on the spoken word) and the ripple on a click. `kind` is `arrow` or `dot` from `meta.style.tutorial`. |
| `Highlight` | marking the element being discussed: `spotlight` dims outside, `outline` rings it. Lasts until the next highlight or clear. |
| `Callout`, `StepBadge` | a short label next to a target (until the next callout or clear); a numbered badge for a sequence. |
| `ZoomLayer`, `zoomFor`, `toScreen` | camera over a capture. `zoomFor` frames a target at about 80 % up to `maxZoom`; draw overlays outside the layer with `toScreen` so they keep their size. In tall and square layouts the tutorial camera follows every targeted step on its own. |
| `Caption` | burned-in captions. Placement follows `layout`: lower third in wide, large in the safe zone in tall, centred low in square. Frame-deterministic. |

Beyond the bin, `@remotion/effects` gives canvas components materials, print looks, cut edges, in-scene reveals and grades (`remotion-core`, references/effects.md).

Tutorial pacing: one step per spoken beat, at most one zoom per scene idea, and `unzoom` before moving to a far target.

Helpers: `makeTheme`, `sec`, `staggerFrames`, `mix`, `alpha`, `cameraFrom`, `entranceFrom`.

## Transitions

Scenes render as separate compositions and are concatenated, so scenes cannot overlap. A seam is built from both sides: the leaving scene's last move and the arriving scene's first move share axis, direction and speed (the `direction` skill's seam rule). `TransitionIn` from `src/lib/transitions` plays the entering half of a presentation over the first 0.4 s against the background colour; fade, slide, wipe and seven custom presentations (checkerboard, clockWipe, glitch, lightLeak, pixelate, rgbSplit, zoomBlur) are available. A seam the motion language describes and none of these play (a carried object, a match cut, a colour flood) is written in the two scenes' components, with `custom` as their `transitionIn`.

Done when: the component keeps every technical rule, its motion follows the brief's motion language, and every part from the bin it uses is there because the motion language asks for what that part does.
