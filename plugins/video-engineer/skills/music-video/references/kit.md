# Music kit and template

Kit: `src/lib/music/` in the project (copied from `${CLAUDE_PLUGIN_ROOT}/lib/music/`). Read-only for block builders.

| Module | Exports |
|---|---|
| config | `defineMusic(cfg)` in `theme.ts`: `fps, width, height, songSrc, song, alignment, blocks, palette {ink, paper, accent, pop}`, optional `look, lyricFont, lyricWeights, fonts, font3d, images, lyricStyles, refrainWords, highlightWords, chips, chipFont` |
| audio | `TimeOffset`, `useAbsFrame`, `useT` (absolute song seconds), `songSrc`, `at`, `smooth`, `integral`, `since`, `pulse`, `beatPulse`, `downbeatPulse`, `onsetHit`, `beatIndex`, `downbeatIndex`, `downbeatsIn`, `vocalOnsetsIn`, `lowHits`, `sectionStartIn` |
| lyrics | `allLines`, `linesOf`, `activeLines`, `wordsOf`, `wordStarts`, `findWord`, `lastAt`, `isRefrainLine`, `isAdlib`, `cleanWord` |
| LyricLayer | `<LyricLayer block reflect? shade?>`; style per block from `lyricStyles[blockId]`: `scene`, `sticker`, `feed`, `flat` (default) or `fame`; `sticker` only as a diegetic sticker; `scene` means the block renders its own lyrics; the look's lyric shadow; one font `F.lyric` (the config's `lyricFont`, no default; more only through the config's `fonts`) |
| looks | `LOOKS` (built-in), `getLook(id)` (project looks first), `LookId`, `LookScope {look, palette?}` (another look or palette for a subtree), `useLook`, `usePalette`, `useLyricShadow`, `useRefrainMaterials()`, `LookOverlay`, `SOFT_SHADOW`, `shadedMaterial`, `outlineMaterial` |
| plate | `<Plate map width aspect? density? jitter? gain? blackout? opacity? pool? crop? params? look?>` prints an image plate in the current look; `makePlateMaterial` for custom meshes |
| text3d | `<Text3D {...useRefrainMaterials()} text size depth pose? outlineWidth?>`, `LetterPose`; the look gives `front`, `side` and an optional `outline` hull; `font3d` is a static TTF (`scripts/font-ttf.mjs`) |
| poster | `<PosterWord lines from to lineAt? width? gap? centerY?>` |
| three | `ShotCanvas {bg, fog, post?}` (post defaults and screen pass come from the look; `post` overrides `bloom, bloomThreshold, ca, focus, focusRange, noise, vignette, jitter`), `useCameraRig`, `drift`, `RingBand`, `Dust`, `Card` |
| fx | `Burst`, `Flakes`, `Grain` |
| textures | `canvasTex`, `rnd`, `stickerTexture`, `blobTexture` |
| fonts | `useAssetsReady` (holds `delayRender` until fonts and images are ready), `F`, `IMG`, `imgEl` |

Template: `${CLAUDE_PLUGIN_ROOT}/templates/music/` holds `remotion.config.ts`, `src/videos/__SLUG__/` (`Song.tsx`, `Compositions.tsx`, `theme.ts`, `blocks/Pending.tsx`) and `videos/__SLUG__/STORYBOARD.md`. Compositions: `<slug>` (full), `<slug>-upto` (WIP preview, duration from the `upTo` prop), folder `<slug>-blocks` with `<slug>-<blockId>` per block (props `look` and `lookPalette` render the block in another look). `music-blocks.mjs --stubs` writes the block stubs and `worlds.ts`. Block code lives in `blocks/<Block>.tsx` plus an optional `blocks/<block>/` folder for its sub-files. A block renders in local frames; absolute time comes from `useT()`.

## Looks

A look is the video's finish, not its idea: the treatment from step 5 decides the world, the lyric staging and the type. One look per video, set as `LOOK` in `theme.ts`: `plain` (the default: plates print unchanged, refrain lit by the scene, no post stack or overlay), a project look (see Project looks), or a kit look from the table below when the treatment's world is that medium. A look decides how plates print, the refrain materials, the post stack, an optional full-frame screen pass, an optional 2D overlay above the lyrics and the lyric shadow. Blocks get all of it by using `Plate`, `ShotCanvas`, `useRefrainMaterials()` and `LookOverlay` (already in `Song.tsx`); colours and effects beyond it come only from the custom pieces the storyboard lists. Every look runs on any palette; `getLook(id).palette` is its suggestion when the project has none. `effects` "allowed" means glow, bloom or colour split are part of the look.

| id | Look | effects | Plate art (the shader adds the treatment) |
|---|---|---|---|
| plain | No treatment: images, 3D and type appear as the video's own pieces make them. | restrained | Art made in the treatment's own world and medium; the plate prints it unchanged. |
| riso | Riso halftone: Two-ink risograph print: accent and paper-white halftone dots on ink-black, slight misregistration, press grain. | restrained | Plain art lit with strong value contrast; no halftone, riso or dots in the prompt (the shader prints them). Accent-dominant colour reads as accent ink. |
| film | 35 mm film: Photographic: split-toned grade, red halation around highlights, moving grain, gate flicker, soft vignette. | allowed | Photographic plates: real-looking scenes and people with natural light, a clear light source and deep shadows. No grain or film effects in the prompt. |
| pixel | 8-bit pixel: Retro game screen: the whole frame snapped to big pixels, ordered-dithered to a few colours per channel, pulled toward the palette. | restrained | Plain art with big simple shapes, strong silhouettes and clear light and dark areas; fine detail is lost at the pixel size. No pixel art in the prompt. |
| cel | Cel / anime: Hand-painted anime cels: three flat tone bands per colour, tinted shadows, ink outlines, outlined refrain type. | restrained | Plain, clearly lit illustration or photo with readable shapes and clean silhouettes; the shader flattens tones and draws the outlines. No anime style or outlines in the prompt. |
| neon | Neon noir: Night city in dark ink: image edges drawn as glowing accent and pop neon tubes with a soft halo, strong bloom, neon-sign refrain type. | allowed | Plain art with clear outlines and readable shapes, ideally a night scene with a few bright lights; the shader draws the tubes from the edges. No neon or glow in the prompt. |
| chrome | Y2K chrome: Y2K chrome: silver high-contrast plates with an iridescent accent-to-pop sheen, streak highlights and mirror-chrome refrain type. | allowed | Plain art with clear shapes, strong silhouettes and smooth value gradients; the shader embosses it into metal. No chrome or metal in the prompt. |
| vhs | VHS tape: Camcorder tape: sharp luma with smeared, washed chroma, jittering lines, a rolling tracking band, RGB offset, head-switch noise, scanlines. | allowed | Plain, everyday footage-like art with clear light and dark areas and some saturated colour; no VHS, glitch or scanlines in the prompt. |
| linocut | Linocut: Two-block relief print on cream paper: carved ink grooves that follow tone, strong outlines, flat blotchy accent colour under the mid tones. | restrained | Plain art with strong value contrast, clear shapes and bold silhouettes; mid tones become flat accent blotches, fine detail is lost to the grooves. No linocut, woodcut or print style in the prompt. |
| engraving | Engraving: Banknote etching on ivory paper: fine wavy hatching that thickens with shadow, cross-hatch in the deep tones, pale accent wash in the mids. | restrained | Plain art with clear light, mid and deep tones and readable contours; the shader turns tone into hatch lines. No engraving, etching, banknote or line-art style in the prompt. |
| blueprint | Blueprint: Technical drawing on a blue sheet: paper-white contour lines, fine grid with major lines, light tone hatch, small annotation crosses. | restrained | Plain art with clear shapes and strong edges (architecture, objects, figures with clean silhouettes read best); the shader draws the lines and grid. No blueprint, grid or line-drawing style in the prompt. |
| ascii | ASCII terminal: Everything drawn as phosphor text in the accent colour on a dark terminal: monospace glyphs picked by brightness, a few flipping each frame, faint scanlines. | allowed | Plain art with strong value contrast and big readable shapes; faces and silhouettes survive best. No ASCII, text or terminal look in the prompt. |
| paper | Cut paper: Layered paper craft: objects cut from five layers of coloured paper, wobbly scissor edges, soft drop shadows, paper rims and fibre. | restrained | Plain art with large clear shapes and a clean light-to-dark structure; fine detail is lost in the five layers. No paper, collage or shadows in the prompt. |
| watercolor | Watercolour: Wet wash painting on cold-press paper: soft wobbling colour, bare paper in the lights, pooled pigment edges, granulation. | restrained | Plain art with soft colour fields and clear value structure; light skies and highlights stay empty paper. No watercolour, paint or paper texture in the prompt. |
| comic | Comic / pop art: Ben-Day pop art: palette-flat colour, accent and pop dot screens in the mid tones, solid ink shadows, thick ink outlines. | restrained | Plain, clearly lit art with readable shapes and strong value contrast; no halftone, comic or outline effects in the prompt (the shader prints them). |
| duotone | Duotone poster: Graphic poster duotone: ink to accent to paper with a few pop highlights, fine grain, flat refrain type. | restrained | Plain art with clear shapes and strong light-dark separation; colour does not matter (the shader maps luminance to the palette). |

## Project looks

A video can have its own look. Write it in `src/videos/<slug>/looks/<id>.ts` as a `Look` (contract in `src/lib/music/looks/types.ts`), add it to `PROJECT_LOOKS` in `theme.ts` under its `id`, and set `LOOK` to that id. `getLook(id)` checks project looks before the built-in ones, so `Plate`, `ShotCanvas`, `useRefrainMaterials()`, `LookOverlay`, and the lyric layer all use it. Start from `src/lib/music/looks/plain.ts` or the built-in look nearest the treatment and change it: the plate shader gets the helpers in `looks/glsl.ts` (`tex`, `blur`, `softBlur`, `luma`, `edge`, `hash`, `vnoise`, `fbm`, `rampAt`, `rampStep`), refrain materials come from `shadedMaterial` or `outlineMaterial`, the overlay is any deterministic React layer. A look written for one video stays in that video; it moves into the plugin only when the user asks for it.

## Custom pieces

Everything else a video needs beyond the kit (particles, sparkle or sticker layers, shader backgrounds, transitions, lyric treatments, 3D props, extra fonts) lives in `src/videos/<slug>/`: shared pieces in `fx/` and loaded fonts in `fonts.ts`, block-only pieces in `blocks/<block>/`. Never put them in `src/lib/`; setup overwrites it. Extra fonts go through `defineMusic({ fonts })`; a different lyric face through `lyricFont`, with a matching static TTF as `font3d`.

## One music video per project index

`lib/music` keeps one global `defineMusic()` config, so `src/Root.tsx` registers one music video at a time. `gen-index.mjs <slug>` registers that slug's compositions; without a slug it takes the music video whose `blocks.json` changed last, and it names the ones it left out. To work on another music video in the same project, run `gen-index.mjs <other-slug>`. Narrated videos are unaffected.

## Plate coverage

A plate (or any plane that forms the set) must fill the camera's view over the whole camera move. For a perspective camera at distance `d` from the plate with vertical field of view `fov`, the visible height is `2 * d * tan(fov / 2)` and the width is that times the aspect. Take the largest view over the move (its start, end and widest turn or crane, including any `drift` or rig shake), add about 10 %, and size and centre the plate on that rectangle. A camera that turns or cranes sees past a plate sized for the mid-point view: that is the black band at a frame edge.
