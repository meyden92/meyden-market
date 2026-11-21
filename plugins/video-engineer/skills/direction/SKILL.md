---
name: direction
description: The video-engineer Direction method, which gives every video (narrated or lyric music video) a look and motion language of its own, covering three divergent treatments, the device and form catalogs, the default reaches to design against, the motion language in numbers, style frames, and the fingerprint ledger of earlier videos. Use when the interview reaches the Direction branch, when writing or checking BRIEF.md's Direction section, and when building or judging a scene against it.
user-invocable: false
---

# Direction

A video built from the plugin's examples and base components looks like every other video the plugin made. The Direction branch prevents that by construction: three treatments that differ on purpose, rendered as style frames, one chosen by the user, then carried by every later stage. The plugin's examples, `lib/` components and earlier videos are never a source for a treatment; the subject, the brand and the user's references are.

## Inputs

Read before writing anything: `research/topic.md` (the subject's materials, vernacular, objects, numbers), `research/brand.md`, `research/references.md`, the Job, Format and References rows of `research/interview.md`, and the last videos: `node "${CLAUDE_PLUGIN_ROOT}/scripts/fingerprint.mjs" list --data "${CLAUDE_PLUGIN_DATA}"`. A file that does not exist yet is skipped; name it at the top of `directions.md`.

## Treatments

Write `videos/<slug>/research/directions.md`:

1. **Default.** A table with one row per compared axis (World, Made of, Device, Form, Palette, Type, Motion, Signature, Density and pace) holding what a generic run of this plugin would make for this brief: typically a dark ground with a mesh gradient, a centred headline that rises in, Ken Burns stills, fade transitions, a list scene, a CTA card. This is the baseline the treatments leave.
2. **Inventory.** List at least ten nouns from the subject's own world, taken from `topic.md`, the brief and the brand: the objects, materials, places, tools, rituals, documents and numbers the people in it touch every day. Worlds, devices and signature moments come from this list, not from habit.
3. **Sketch five** one-line treatments; at least two of them use a device or form you write for this subject instead of a table row. What the user already said binds every sketch: the mood, the references, a look they rejected, a medium or a quality bar they asked for ("real 3D", "show our actual app"). A sketch that contradicts it is dropped, and the bold one is bold within it. Keep the **three that differ most**: no two kept treatments share a world, a device or a form. One is the subject done excellently in the expected way; one is the bold one you would not pick first, bold in the subject's own terms.
4. **Write each kept treatment** with every axis:

| Axis | What it fixes |
|---|---|
| Name | two to four words |
| Idea | the one visual idea only this subject carries. Test: cover the logo; if a competitor could ship the video unchanged, sharpen it |
| Why it fits | two sentences in the user's own terms: why this treatment suits their video, its viewer and its job |
| World | the medium and material the video is made of, from the inventory, and how that material behaves when it moves. Many surfaces can be made in code (`remotion-core` references/effects.md) |
| Made of | the sources the frames come from, mixed as the video needs: captures of the real product (screenshots, screen recordings), its UI rebuilt in code, generated images, drawing, diagrams, data and type made in code, 3D, effects |
| Device | how the story is told, written for the subject or from the device table |
| Form | how scenes connect, written for the subject or from the form table |
| Palette | 4 to 6 hex with roles (ground, text, accent, support); with a fixed brand palette, keep its colours and vary their roles and proportions |
| Type | Google Font families and how type behaves (lands still, types on, is stamped, is cut out) |
| Motion | the motion language in numbers (see Motion language) |
| Signature | the one scene where boldness is spent, and what happens there |
| Density and pace | how full a frame is; cut rhythm |

5. **Check against the default and the ledger.** Compare on the nine axes of the Default table; an axis the brand fixes (palette, type) is left out of both checks, and all nine count when nothing is fixed. Each treatment differs from the Default on at least four of the remaining axes, and from each of the last three fingerprints on at least half of world, device, form, palette, type and transitions that can be compared. Compare with the fingerprints that exist: fewer than three are compared as they are, a `null` direction field cannot be compared, and an empty ledger skips this half of the check (say so). Revise until both hold, and note under each treatment what changed.

### Made of, by job

What a video is made of follows its job, and the treatments differ in the mix:

- A site or app explainer, showcase or tutorial shows the real product, because the viewer must recognise it: captures and recordings, the UI rebuilt and animated in code where a capture cannot move the way the story needs, motion that points at what matters.
- A topic explainer or presentation shows the idea: diagrams and data that build, illustration, kinetic type, objects from the subject's world.
- A teaser or promo shows the thing at its best: material, scale, light, 3D.

### Device table

| Device | Tells the story by |
|---|---|
| Result first | opening on the finished outcome, then rewinding to how |
| One object | a single object that travels through every scene and changes role |
| A day | a moment in someone's day where the problem shows up and goes away |
| Type carries it | words as the main actor: they build, break, stack and reorder |
| A number lands | one figure that every scene builds towards or explains |
| Before and after | the same frame shown twice, broken and fixed |
| The UI is the world | the product's interface blown up into a landscape the camera moves through |
| A growing map | a diagram, map or board that gains one piece per scene |

### Form table

| Form | Scenes connect by |
|---|---|
| Object chain | each scene is born from an element of the previous one |
| One take | a continuous camera move with no cuts |
| Beat montage | hard cuts on the beat, short shots |
| Endless zoom | every scene sits inside a detail of the last |
| Peel | layers lift away to reveal the next scene beneath |
| Page | a printed or scrolling surface that turns or moves on |
| Split | two halves that answer each other, then merge |

The rows are the most common answers, which makes them the nearest generic ones; a device or form written for the subject beats the nearest row.

## Motion language

Write it as numbers, never adjectives:

- **Ease by role.** Arrivals ease out hard (`Easing.out(Easing.exp)` or `Easing.out(Easing.poly(4))` in Remotion), exits ease in and take 40 to 50 % of the arrival time, camera moves and colour floods ease in and out. One spring damping ratio per video: 1.0 (no overshoot), 0.7 to 0.85 (a slight settle) or 0.4 to 0.6 (a visible bounce). Opacity and colour never overshoot.
- **Timing.** Arrival duration in frames, the stagger unit (letters 1 frame, words 2 to 4, list items 2 to 3 at 30 fps), the hold after a move lands.
- **The current.** One dominant direction of travel for the whole video; other directions are reserved and carry meaning (up reveals, a move towards the camera arrives).
- **Seams.** How a scene leaves decides how the next arrives: same axis, same direction, cut mid-move. Name the transition family (carried object, match cut, colour flood, whip, iris from a click, hard cut) and use 3 to 5 kinds per video, each with a visible cause.
- **Titles.** Pick the title entrance for this video (per-word blur-in, grey to ink, per-letter, slot roll, behind the subject, stamped) and vary it within the video; a landed title holds still.

## Default reaches

These are what an unguided run reaches for. Each one is allowed only where BRIEF.md's Direction asks for it; otherwise build the alternative.

| Default reach | Build instead |
|---|---|
| every scene entering the same way (fade and rise) | entrances by role and scene, from the motion language |
| idle elements breathing or floating | stillness after a move lands; motion only with a cause |
| everything centred | a composition per scene: focal point, alignment, scale contrast |
| a mesh gradient with grain and vignette as the ground, whatever the world | a ground made of the world's material (texture that is the material's own is the world, not this reach) |
| Ken Burns on every still | camera moves only where a beat needs one |
| dark void with glow, purple-blue gradients, glass cards | the treatment's own palette and surfaces |
| three cards in a row, a bullet list as the picture | show the thing itself |
| type on a plain fill as the whole frame | type set into the world, or the world without type |
| the same transition at every cut | the seams of the motion language |
| a riso, halftone or overprint poster as the bold option | bold in the subject's own terms: its scale, its time, its objects; a print look only when the subject is printed matter |
| a generated image per shot with a filter over it as the whole look | a world built from the treatment's material; a finish only where the world is that medium |
| an extruded metal 3D word for every refrain | the refrain as the treatment's device stages it |
| one grotesque sans for every lyric | a typeface from the song's world |
| lyrics as a caption at the bottom of every shot | lyrics placed where the device puts them in the world; a caption as one shot type among others |

## Style frames

Before the Direction question, render one still per treatment of the same moment (the hook or the signature scene) with the real fonts and colours:

1. Write `src/videos/<slug>/frames/direction-<n>.tsx` exporting `Frame`, `width` and `height` (the canvas from the Format branch). A style frame may be static. One that animates also exports `durationInFrames` (the default is 90 at 30 fps). Load fonts as `remotion-core` references/fonts-and-assets.md says. Write it by hand for this treatment; base components from `src/lib/scenes` would make every option look alike.
2. Content the brief does not supply (file names, prices, list items) is plausible and plain, never presented as a product fact; list it under the treatment as placeholder.
3. `mkdir -p videos/<slug>/research/choices`, run `node "${CLAUDE_PLUGIN_ROOT}/scripts/gen-index.mjs"` (it also clears stale entries from `src/Root.tsx`), then `npx remotion still <slug>-frame-direction-<n> videos/<slug>/research/choices/direction-<n>.png --frame=<0 for a static frame, else a frame after the arrival and inside durationInFrames>`.
4. Look at each still and fix what is broken or unreadable before showing it.
5. Send the stills with absolute paths, each with its name, one-line idea, what it is made of and why it fits, and ask in the interview's question format with a recommendation. The user may ask why, or mix treatments ("the world of 1 with the type of 3"); answer from the treatments and re-render the mix before logging it. After the choice, a short motion test of the signature moment may follow in the same folder (`frames/motion-test.tsx` with a `durationInFrames`), rendered with `npx remotion render`.

## Lyric music video

The `music-video` skill runs this method at its step 5. Everything above holds, with these changes:

- **Inputs.** `lyrics.txt`, `research/song.json` (tempo, sections, energy), the song's own notes in the user's files (genre, tags, artist), `research/interview.md`, the references and the fingerprint list. There is no `topic.md`.
- **Inventory** from the lyrics and the song's world: the objects, places, characters, rituals and materials the words name or imply, and the world of the people who sing along (a night-bus breakup song: ticket stubs, fogged windows, the route map, the driver's mirror, sodium streetlights).
- **Axes.**
  - Device: how the lyrics live in the world: who or what carries the words (a surface they are written, printed or lit on, an object that shows them, a figure who sings them), and what the refrain becomes.
  - Form: how blocks connect.
  - Type: one lyric family for every lyric, chosen from the song's world (a Google Font, or a local file the user supplies; one weight is fine), and the refrain's treatment.
  - Motion: the music mapping in numbers: what moves on downbeats, the low band and vocal onsets, the cut rhythm per section energy.
  - Signature: the block where boldness is spent (usually the first chorus or the drop) and what happens there.
  - Finish: `plain`, or a kit look from the `music-video` skill's `references/kit.md` only when the world is that medium (film footage, an engraving, a risograph); one finish for the video.
- **Default table** for a lyric video: World, a generated image per shot printed through a shader look; Device, lyrics as a bottom caption with a soft shadow and the refrain as an extruded metal 3D word; Form, hard cuts with a slow camera drift on each image; Palette, the look's suggested palette; Type, a grotesque sans for every lyric; Motion, dust particles, a slow dolly and a beat pulse; Signature, the refrain word rising in 3D; Density and pace, one image, one word, one line.
- **Style frames.** One frame per treatment of the same moment: a refrain line of the first chorus, with the real lyric font and the words staged as the device says. Write each frame by hand; kit modules (`ShotCanvas`, `Plate`, `Text3D`) may serve as parts, never as one composition shared by the three frames, and the treatments share nothing but the lyric line. A frame may use generated images made in its own treatment's world (step 8 of `music-video` for the route and the cost question), and needs them when the user asked for a rendered or photographic quality code alone cannot reach; a world made in code needs none. Render 3D frames with `--gl=angle`.
- **Carrying it.** The storyboard's Global Direction block holds the chosen treatment verbatim with its style frame path and the Default line it departs from. `videos/<slug>/research/direction.json` holds `{"name", "idea", "world", "madeOf", "device", "form", "motion", "signature", "palette": ["#RRGGBB", ...], "font"}`; the fingerprint script reads it for a music video.

## Carrying it

- BRIEF.md's Direction section holds the chosen treatment verbatim, its style frame path, and the Default line it departs from.
- `meta.direction` in scenes.json holds `name`, `idea`, `world`, `madeOf`, `device`, `form`, `motion` (the motion language in one line of numbers) and `signature` (the scene id).
- After the final render, record the video (a narrated video from `scenes.json`, a music video from `research/direction.json`): `node "${CLAUDE_PLUGIN_ROOT}/scripts/fingerprint.mjs" add <slug> --data "${CLAUDE_PLUGIN_DATA}"`.

Done when: `research/directions.md` has the Default table, the inventory and three treatments that pass the check in step 5, each treatment has a rendered style frame in `research/choices/`, and the user's choice is logged in `research/interview.md` with its still.
