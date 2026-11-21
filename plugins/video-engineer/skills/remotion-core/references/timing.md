# Timing patterns

All snippets: Remotion 4.0.537.

## Fade in and out of an element

```tsx
const frame = useCurrentFrame();
const {durationInFrames} = useVideoConfig();
const opacity = interpolate(
  frame,
  [0, 12, durationInFrames - 12, durationInFrames],
  [0, 1, 1, 0],
  {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'},
);
```

Inside a `<Sequence>`, `durationInFrames` from `useVideoConfig()` is the sequence's local end.

## Easing

```tsx
import {Easing, interpolate} from 'remotion';
interpolate(frame, [0, 30], [0, 100], {
  easing: Easing.bezier(0.16, 1, 0.3, 1),
  extrapolateLeft: 'clamp',
  extrapolateRight: 'clamp',
});
```

- Per-segment easing: pass an array of length `inputRange.length - 1`.
- `Easing.step1` holds the previous value until the next keyframe (use for strings and booleans).
- `outputType: 'scale'` and `output: 'perceptual-scale'` exist for scale values (4.0.490+/4.0.526+).
- `posterize: n` updates the value every n frames (stepped motion).
- A single-value `inputRange`/`outputRange` returns that value (4.0.469+).

## Spring

```tsx
const {fps} = useVideoConfig();
const enter = spring({frame, fps, delay: 6, config: {damping: 200}});
const bounce = spring({frame, fps, config: {damping: 10, stiffness: 120}});
const fixed = spring({frame, fps, durationInFrames: 40, durationRestThreshold: 0.001});
```

- Map a spring to a range with `interpolate(enter, [0, 1], [40, 0])`.
- Staggering: `delay: i * 4` per item.
- Exit: `1 - spring(...)`, or `spring({..., reverse: true})`.

## Sequence timing

```tsx
<Sequence from={0} durationInFrames={90} premountFor={30}><A /></Sequence>
<Sequence from={90} durationInFrames={60} premountFor={30}><B /></Sequence>
```

- Inside `B`, frame 0 is composition frame 90.
- Overlap two scenes by letting the second `from` be less than the first's end.
- `Series` equivalent: sequential `Series.Sequence` entries. `offset={-10}` overlaps the previous by 10 frames. Only the last may use `durationInFrames={Infinity}`.

## Audio and video trimming (4.0.537 names)

```tsx
<Html5Audio src={staticFile('audio/vo.mp3')} trimBefore={30} durationInFrames={150} />
<OffthreadVideo src={staticFile('clips/a.mp4')} trimBefore={60} durationInFrames={90} muted />
```

- `trimBefore`: source frames removed from the start. `durationInFrames`: source frames played after that.
- Old names `startFrom` and `endAt` still run but cannot be mixed with the new ones. `trimAfter` is deprecated in favour of `durationInFrames`.
- Place delayed audio by wrapping it: `<Sequence from={45}><Html5Audio ... /></Sequence>`.

## Audio fade

```tsx
const frame = useCurrentFrame();
const volume = interpolate(frame, [0, 15, 120, 135], [0, 1, 1, 0], {
  extrapolateLeft: 'clamp',
  extrapolateRight: 'clamp',
});
<Html5Audio src={staticFile('audio/music.mp3')} volume={volume} />
```

Here `frame` is relative to the enclosing Sequence. `volume` above 1 is allowed (since 4.0.279).

## Seconds to frames

Frames are integers: `Math.round(seconds * fps)`. Scene length from measured audio: `Math.round(durationSec * fps) + tailFrames`.

## calculateMetadata for length

```tsx
const calculateMetadata: CalculateMetadataFunction<Props> = ({props}) => ({
  durationInFrames: Math.round(props.durationSec * 30),
  fps: 30,
});
```
