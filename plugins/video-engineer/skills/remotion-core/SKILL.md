---
name: remotion-core
description: Compact Remotion 4.0.537 API reference for writing scene components, compositions, timing, media, fonts, captions and render commands. Load before writing or editing any Remotion code.
user-invocable: false
---

# Remotion core

Verified against remotion.dev/docs and the installed 4.0.537 packages. Long material is in `references/`.

## Compositions

- Entry file (`src/index.ts`) only calls `registerRoot(RemotionRoot)`, once. `RemotionRoot` returns `<Composition>` elements inside a fragment.
- `<Composition id component durationInFrames fps width height defaultProps calculateMetadata schema />`. `id` allows letters, numbers and hyphens only. Pass `component` or `lazyComponent` (default export), never both.
- `defaultProps` must be JSON-serializable (`Date`, `Map`, `Set`, `staticFile()` also work). Type props with `type`, not `interface`.
- `calculateMetadata({defaultProps, props, abortSignal, compositionId, isRendering})` may be async and returns any of `durationInFrames`, `fps`, `width`, `height`, `props`, `defaultOutName`, `defaultCodec`. Returned values override the `<Composition>` props. Use it to derive duration from audio length or fetched data.
- `useCurrentFrame()` returns the frame, 0-based. `useVideoConfig()` returns `{width, height, fps, durationInFrames, id, props, defaultProps}`. Inside a `<Sequence>`, `durationInFrames` is the sequence's local end.

## interpolate

```tsx
interpolate(frame, [0, 20], [0, 1], {
  extrapolateLeft: 'clamp',
  extrapolateRight: 'clamp',
  easing: Easing.out(Easing.cubic),
});
```

- Always pass both `extrapolate*: 'clamp'`. The default is `extend`, which runs past the output range.
- `inputRange` and `outputRange` have equal length. `easing` is one function or an array with one entry per segment.
- Strings and booleans cannot blend: use `Easing.step1` per segment.
- Timing patterns: `references/timing.md`.

## spring

```tsx
spring({frame, fps, delay: 10, durationInFrames: 30, config: {damping: 200}});
```

- Defaults: `from 0`, `to 1`, `mass 1`, `damping 10`, `stiffness 100`, `overshootClamping false`.
- `damping: 200` gives no bounce. Lower damping or higher stiffness gives more bounce.
- `durationInFrames` stretches the curve to that length. `delay` is in frames. `reverse` flips it.
- Pass `frame - startFrame` or use `delay`; do not pass a negative frame.

## Sequence and Series

- `<Sequence from durationInFrames name premountFor layout>`. Children see `useCurrentFrame()` starting at 0 at `from`. Nested sequences add up.
- `layout` defaults to `"absolute-fill"`; `"none"` removes the wrapper (then no `style`).
- `premountFor` (frames) mounts early so images, video and fonts load before the start. Set it on every sequence that holds media. Studio default is 2 s since 4.0.535; the Player default is 0.
- `<Series><Series.Sequence durationInFrames offset premountFor>`. Every sequence except the last needs a finite positive integer `durationInFrames`. Negative `offset` overlaps the previous sequence.
- `<AbsoluteFill>` is an absolute `div`, full size, `display: flex; flex-direction: column`. Inline `style` beats `className`.

## Assets and media

- Files live in `public/` next to the `package.json` that depends on `remotion`. `staticFile('img/a.png')` takes the path without `public/`. Do not pre-encode the filename.
- Images: `<Img>` from `remotion` (waits for load, retries `maxRetries` default 2). Never a bare `<img>`.
- Video: `<OffthreadVideo src={staticFile(...)} trimBefore={n} durationInFrames={n} volume muted playbackRate />`. Do not use `<Video>` or `<Html5Video>` from `remotion` and do not use `<Video>` from `@remotion/media`; this plugin standardises on `OffthreadVideo`.
- Audio: `<Html5Audio src volume trimBefore durationInFrames loop playbackRate />` imported from `remotion`. `Audio` is still exported but `Html5Audio` is the documented name since the rename. `<Audio>` from `@remotion/media` exists; this plugin does not use it.
- Trim naming in 4.0.537: `startFrom` and `endAt` are renamed to `trimBefore` and `trimAfter` (4.0.319) and cannot be combined with the new names. `trimAfter` is itself deprecated: use `durationInFrames` (4.0.530), counted in source frames from `trimBefore`.
- Volume: a number, or `interpolate(frame, ...)` computed in the component. The `(frame) => number` callback form still works but the docs no longer recommend it.
- Fade in/out example and trimming: `references/timing.md`.

## Fonts

- Google fonts: import the per-font module, call `loadFont` once per style with explicit `weights` and `subsets`, use the returned `fontFamily`. The loader blocks the render until the font is ready.
- Local fonts: file in `public/`, `loadFont` from `@remotion/fonts` or a manual `FontFace` wrapped in `delayRender`/`continueRender`.
- Details and snippets: `references/fonts-and-assets.md`.

## Captions

- `Caption` from `@remotion/captions`: `{text, startMs, endMs, timestampMs, confidence, pageBreakAfter?}`. Keep the leading space in `text`. Render with `white-space: pre`.
- `parseSrt({input})` returns `{captions}`. `createTikTokStyleCaptions({captions, combineTokensWithinMilliseconds})` returns `{pages}`.
- Details: `references/captions.md`.

## Render

```bash
npx remotion render src/index.ts <id> out/<id>.mp4 --codec h264 --crf 18
npx remotion still src/index.ts <id> out/f.png --frame=45
npx remotion ffprobe file.mp4
```

- Flags, frame ranges, props, ffmpeg limits: `references/render-cli.md`. The bundled ffmpeg has no `tile`, `overlay`, `drawtext`, `pad`, `select`, `afade` or `mov_text`, reads no AIFF and writes no `s16le`/`f32le`.

## Effects

`@remotion/effects` puts pixel effects (paper, halftone, duotone, torn and roughened edges, page turns, reveals, projections, grades) on canvas components. Read `references/effects.md` before giving a world a material, a print look, a cut edge or an in-scene reveal, and before using any effect.

## Three.js (`@remotion/three`)

- Render with `--gl=angle`. `@react-three/postprocessing` `EffectComposer` produced blank frames headless; build the `postprocessing` composer synchronously in the canvas setup and render it each frame.
- Decode textures and load fonts before the first WebGL frame: hold a `delayRender` until every image is decoded and every font is parsed. A texture that is not ready draws black or stale.
- Coplanar faces z-fight (a phone body front face against its screen draws black blocks): offset one by a small z and set `renderOrder`; transparent layers set `depthWrite={false}`.
- `TextGeometry` needs a static TTF, not a variable font (a variable font gives the default weight). Re-measure the text and re-fit its size whenever the font changes; a wider font crops fixed-size text.
- Fit text to its measured width and line count; keep the bottom of any text at least 90 px above the frame edge.
- One-off all-black stills happen; render the frame again before blaming the code.

## Determinism

A frame must depend only on the frame number and props. Rendering runs on several tabs that share no state.

- Drive every animation from `useCurrentFrame()`. No CSS `transition`, CSS `animation`/keyframes, or animation libraries that run on their own clock. The docs flag animations that run independently of the frame as breaking renders.
- No `Math.random()`. Use `random('seed-' + i)` from `remotion` (same seed, same value on every tab).
- No state-driven animation: `setTimeout`, `setInterval`, or `useEffect` that changes values over time. `Date.now()` and `new Date()` return different values per tab; read time from the frame.
- Async data or assets: `useDelayRender()` gives `delayRender(label)`, `continueRender(handle)`, `cancelRender(err)`. Create the handle in `useState(() => delayRender(...))`, never at module level. Default timeout 30 s. Prefer `calculateMetadata` for fetches. Always clear or cancel on error.
- Do not measure text (`measureText`, `fitText`) before fonts load.
- Docs advise against CSS `background-image` and `mask-image`; use `<Img>` elements.
- Components must not depend on frames rendering in order.
- Pitfall: `em` in `gap`, `margin` and `padding` resolves against the font size of the element that sets the property, not its children. A `gap: 0.5em` on a container with a large `fontSize` (or inherited from the parent) spaces children by that size, whatever the children's own font size. Use px, or set `fontSize` on the element that owns the `gap`.

Done when: every Remotion API used in the scene file appears in this reference or the cited doc page, trim props use the 4.0.537 names, and each determinism item above was checked against the file.
