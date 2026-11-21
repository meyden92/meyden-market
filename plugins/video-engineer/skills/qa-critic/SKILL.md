---
name: qa-critic
description: The video-engineer QA rubric, covering ten scored axes, the hard-failure list, the pass rule, how to read a frame set and contact sheet, and the JSON contract the critic returns. Use when reviewing draft frames or interpreting a critic result.
user-invocable: false
---

<!-- upstream: Liamrjohnston/remotion-motion-graphics-skill skills/motion-graphics/references/visual-critic.md @ b860c7921f2220b9e2a84e815ba0ae7b10858f08 (MIT) — changes: eight motion-graphics axes replaced by ten long-form axes incl. richness, specificity and variety, hard-failure list rewritten for narrated Remotion videos (kept: neon/glow ban, essential content unreadable, major dead space; added: minTextPx, cut-off, simultaneous entrances, empty-beat timing; neon/glow ban made style-dependent; text-edge, collision, duplicate-word, flat accent fill, flash, near-black, placeholder, ghost, geometry, z-fight, typeface-family rules), pass rule kept (every score >= 8, average >= 8.5, no hard failure), critic output reshaped to the JSON below -->

# QA critic rubric

The critic did not build the video. It judges visible evidence only: the frames, the contact sheet, `flags.txt`, `fingerprints.txt` and `scenes.json` (a music video: `STORYBOARD.md` and `blocks.json` instead). It never reads `src/`. A clean but generic result is not a pass reason; a defect it cannot point to in a named frame is not a failure reason.

## Inputs

- `videos/<slug>/out/qa/frames/t<seconds>-<id>.png`: one frame every 2 s plus the first and last frame of every scene (a music video: plus the middle frame of every block). The seconds are the position in the full video; the id is the scene (or block) the frame belongs to.
- `videos/<slug>/out/qa/contact.png` and `contact.txt`: all frames tiled in time order, tile index drawn in each tile's top-left corner, `contact.txt` maps index to frame file, scene and time.
- `videos/<slug>/out/qa/flags.txt`: facts measured on every frame of the draft, which sampled stills cannot show: `flash:` lines (more than 3 full-frame white flashes within 1 s), `near-black:` lines (runs of frames with mean luma <= 10 of 255), `dark-edge:` lines (an outer strip of the frame near-black for 3 or more frames while the centre is lit: a plate or plane edge, a black band on a camera move, an empty void at the frame edge), `extract:` lines (a still that came out near-black and was extracted a second time; "extraction flake" means the second still is bright and the black was an artifact, "real black frame" means it is black in the video).
  `similar:` lines name pairs of scenes whose middle frames share a layout (colour ignored), and `layouts:` says how many scenes have a layout of their own.
- `videos/<slug>/out/qa/fingerprints.txt`: one JSON line per earlier video (direction, palette, font, visual types, entrances, transitions), newest last; "no earlier videos recorded" when there are none.
- `videos/<slug>/scenes.json`: `meta.direction` (the chosen treatment: idea, world, device, form, motion language, signature scene), `meta.style` (palette, font, optional `displayFont`, `minTextPx`, optional `effects`), scene ids, `visualType` and `motion` per scene, `onScreen` text, `audio.durationSec`.
- A music video has no scenes.json. `STORYBOARD.md` gives the same facts in its Global section (Direction, palette, finish, effects, lyric typeface, `minTextPx`, custom pieces, materials) and per block the shots (what we see); `blocks.json` gives block ids and frame ranges. Read every mention of `meta.style` below as that Global section, and `onScreen` as the shot lists.

## Reading the frames

- The draft is rendered at 50 %. Any size or distance you estimate from a frame (text height, element width, margin) is half the real size: double it before comparing with `meta.style.minTextPx` or a pixel margin, which are in full-resolution pixels. Full-resolution height is `meta.height`; a frame is half of that. For a canvas other than 1080 px high, scale the 90 px bottom margin by `meta.height / 1080`.
- Use the contact sheet to judge sequence: pacing, shot variety, continuity between neighbouring tiles, long runs of near-identical tiles. Open the single frames to judge detail: text size, cut-off edges, overlaps, colours, contrast. Tiles are scaled down further and hide small text.
- Time between frames comes from the seconds in the file names. Two consecutive frames that show nothing but background and are more than 1.5 s apart are an empty beat. First and last frames of a scene may be mid-transition; a single mostly-empty boundary frame between two content frames is not an empty beat. A lyric line caught mid-fade (in or out) in one frame is a transition, not ghost text and not an empty beat; judge its legibility in the neighbouring frames.
- Compare colours with `meta.style.palette`.
- Look: a music video's Finish (the storyboard's Global section) names a print or film treatment (riso, film, pixel, cel, neon, chrome, vhs, linocut, engraving, blueprint, ascii, paper, watercolor, comic, duotone, or a project look); `plain` adds none. Its texture is intended and is not a defect: halftone or Ben-Day dots, pixel grid and dither, scanlines and tape noise, hatch or carved lines, glyph grids, paper fibre, posterised layers, grain. It is still judged where it costs legibility (a lyric or a face that cannot be read) and against `minTextPx`. Colours outside the palette that the look itself produces (an image's own hues in film, vhs, cel, paper or watercolour) are not brand faults; colours, glow or texture of another look are.
- Effects: `meta.style.effects` is `"restrained"` or `"allowed"`; absent means `"restrained"`. Under `"restrained"`, anything outside the palette that reads as light, bloom or a coloured shadow is glow. Under `"allowed"`, glow, bloom, coloured light, lens flare and gradient washes are legitimate and are scored for discipline instead (see motion_restraint and legibility).
- Lyric text is the sung or spoken words shown as type (captions, stamps, 3D or poster words). Diegetic UI (phone screens, HUD, counters, hashtags, tickers, status bars, stickers that belong to the scene) is not lyric text.
- `contact.txt` and file names carry the position; two different scenes can show different sets, one scene held across many consecutive frames is a long hold.

## Axes (integers 1 to 10)

- legibility: every text element is at or above `minTextPx`, has clear contrast against its background, and stays on screen long enough to read. Lyric legibility: lyric words not yet sung and already sung stay readable (roughly 40 % brightness or more against their background; mid-grey on a red or grey ground scores low). Where effects are allowed: bloom or glow does not wash out or thin the text.
- pacing: scene length matches the content; no scene drags on identical frames, none is crammed; the rhythm across the contact sheet varies where the content does. Shot variety: successive shots differ in subject, framing and UI. In music videos, the same set, subject and framing held across 4 or more consecutive sampled frames (8 s) of a long section caps this axis at 5, unless the music visibly drops and the stillness is deliberate.
- continuity: neighbouring scenes share style, position logic and palette; no unexplained jump in layout, scale or colour.
- overlap: elements do not collide, cover each other's text or fight for the same space.
- empty_beats: no stretch of the video shows only background; every moment carries content that matches the scene. Base light level: between hits the frame keeps a readable base light (a dark shot is not near-black), and a drop may dim the frame but not blank it.
- brand_fidelity: palette, font and style sheet from `meta.style` are followed; no foreign colours, fonts or invented marks. Palette discipline: the accent colour appears on accents (words, rules, markers), not as large fills; no more colours than the palette plus its tints and shades.
- motion_restraint: one element moves at a time, motion has a visible cause, and nothing decorative competes with the content. Where effects are allowed: chromatic aberration is low and never smears or doubles letters, there are no ghost trails or reflections of text, bloom is bounded.
- richness: how much the frame is worth looking at, in the treatment's own world (`meta.direction.world`; a music video: the storyboard's Direction block). The world's material is present and detailed (paper has fibre and print, a UI has real content and states, a 3D set has lit surfaces, a diagram has real data); something moves or is lit with a cause; no placeholder-looking empties. Anchors, judged per scene and as the mean across the contact sheet:
  - 3: bare text or flat shapes on a plain or gradient fill that belongs to no world. Fixture frames are at this level.
  - 5: the world is named but thin: one element of it on a generic ground, or the same frame repeated with new words.
  - 8: the world is fully there: its material and detail fill the frame, a clear focal point, and a cause for every move or light.
  - 10: all of 8, plus a deliberate focal hierarchy and detail that rewards a second look.
  Rate a scene 8 or more only when you can name what in that frame is made of the world's material.
  In a music video, a material the storyboard's Materials list names (water, fire, glass, sky, skin) must read as that material in the frame; one that reads as something else (a regular ripple grid for water, a flat colour wash for fire) caps richness at 6 for that block, with the fix in `issues`.

- specificity: how much the video belongs to its own treatment and subject. Judge against `meta.direction` (a music video: the storyboard's Direction block, finish and custom pieces): the world's material is visible, the idea carries the scenes, the signature scene is recognisably the idea and the boldest moment. Test: with the logo covered, could another product ship these frames unchanged? Anchors:
  - 3: the template look (a gradient or mesh ground, a centred headline rising in, Ken Burns stills, cards) with nothing of the direction's world.
  - 5: palette and type follow the brief, but most frames could belong to any video.
  - 8: the world's material and the idea show in most scenes; the signature scene could only be this video.
  - 10: every frame could only be this video.
  Without `meta.direction`, judge against the style sheet and the topic in `onScreen`.
- variety: whether scenes differ where their content differs. Count the template tells, each visible across scenes: the same entrance in every scene, the same composition repeated (centred headline over the same ground), every still slowly zooming, the same transition at every cut, idle breathing or floating everywhere, a run of `similar:` pairs in `flags.txt`. Neighbouring scenes that share composition and entrance score 6 at most; two or more tells, 5 at most. Across videos: when `fingerprints.txt` shows an earlier video with the same world or device and the same palette family and transitions, this axis is 6 at most, and `issues` names which axis to move. A deliberate repeat the direction names (a refrain, a recurring frame) is not a tell.

## Hard failures

Any one forces a fail whatever the scores are. Name the frame and what is visible.

- text under `meta.style.minTextPx` (after doubling the draft size). Applies to lyric, headline, caption and any text the viewer must read to follow the video; incidental diegetic UI (phone chrome, handles, counters, tickers, notification labels, HUD) is exempt as long as it is not needed to follow the story
- lyric, headline or caption text crossing the frame edge (a diegetic scrolling ticker or marquee that runs off the edge is exempt), or a key subject cut off by it (backgrounds, particles and decorative props that bleed out are not this; elements covering each other are scored on the overlap axis)
- lyric or headline text whose bottom lies within 90 px of the frame bottom (45 px in the 50 % draft; scaled with `meta.height`)
- text colliding with other text or with a key subject (text printed over a face, product or other focal object so that either is hard to read)
- the same words visible twice at once (a sticker or pop word repeating the caption in the same frame)
- a flat full-frame fill in the accent colour (the accent is for accents; a full-frame background in a non-accent palette colour is fine; letters, props and lit faces in an accent colour are not fills)
- more than 3 full-frame white flashes in 1 s: reported by a `flash:` line in `flags.txt`; sampled stills cannot show it, so never claim it from stills alone
- an unintended near-black or blank frame: a `near-black:` line in `flags.txt` or an `extract:` line ending "real black frame", or a near-black frame between content frames in the set. A frame that shows only the palette background (for example navy) is an empty beat, not a near-black frame. Fades from or to black at the very start or end of the video, and a black beat that `scenes.json` names, are intended. An `extract:` line ending "extraction flake" is not a defect
- a placeholder-looking empty container: a blank card, tile, feed cell, phone screen or panel that looks unfinished (flat black, grey or white box with nothing in it)
- mirrored or ghost copies of headline or lyric text (reflection in a floor, a faint second copy offset behind the word); a single copy at low opacity during its fade is not a ghost copy
- letters intersecting geometry (a letter passing through the floor, a wall or another object)
- z-fighting artifacts: black or flickering blocks, stripes or shimmer on a surface where two faces share a plane
- lyric text in more than one typeface family within the video, compared across frames (differences of weight, size, colour and animation are fine; diegetic UI is excluded)
- two elements entering at once (both caught mid-entrance in the same frame, or entering in the same frames)
- an empty beat over 1.5 s
- an exposed frame edge: a `dark-edge:` line in `flags.txt` that is not a fade the storyboard or `scenes.json` names, or a frame where a plate, a plane or the set ends inside the frame (a black band, a hard edge to empty space, a void at the top or side during a camera move)
- lyric or headline text that cannot be read against what is behind it in a frame: busy particles, stars, snow or texture behind the letters, or a background of nearly the same brightness
- a cursor, highlight or callout that misses its target in a tutorial frame (the overlay is not on the element the step names)
- capture text the scene puts in focus (the target of a step, callout, highlight or zoom, or text the narration reads out) below `meta.style.minTextPx` at the zoom shown in the frame. The rest of a captured app UI (menus, sidebars, table cells, labels around the focus) is incidental and exempt; it is scored on legibility only where the narration depends on it
- personal data, or an area listed in `app.json` `hide`, visible in a capture
- with `meta.style.effects` absent or `"restrained"`: neon, glow, bloom, coloured light or shadow, gradient orb or wash, glassmorphism. With `"allowed"` this is not a hard failure; it is scored, see above

## Pass rule

Pass means no hard failure, every axis at 8 or above, and an average of 8.5 or above. The spec's bar is every axis at 8; the average of 8.5 is Liamrjohnston's added bar and is kept. The critic never lowers either, and no one else does either: a caller that wants a pass changes the video.

## Output contract

One JSON object, nothing else:

```
{"score": 8.6,
 "axes": {"legibility": 9, "pacing": 8, "continuity": 9, "overlap": 9, "empty_beats": 8, "brand_fidelity": 9, "motion_restraint": 9, "richness": 8, "specificity": 8, "variety": 9},
 "hardFailures": [{"scene": "s02", "frame": "t6.00-s02.png", "rule": "text under minTextPx", "evidence": "caption is 12 px tall in the draft, 24 px real, minTextPx is 36"}],
 "issues": [{"scene": "s02", "fix": "raise the caption to at least 36 px"}]}
```

- `score` is the mean of the ten axes, one decimal.
- `hardFailures` is empty when there are none. Every entry carries the scene id, the frame file name (`flags.txt` for measured rules), the rule from the list above and the visible or measured evidence.
- `issues` lists one concrete fix per problem, per scene: every hard failure gets one, and so does every axis below 8. A scene id only; the critic does not name code or files.
- Axes below 8 without a hard failure still fail the video; put the reason in `issues`.
