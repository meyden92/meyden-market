# Captions

Package: `@remotion/captions`, version equal to `remotion` (4.0.537).

## Caption type

```ts
type Caption = {
  text: string;
  startMs: number;
  endMs: number;
  timestampMs: number | null;
  confidence: number | null;
  pageBreakAfter?: boolean;
};
```

- One caption is usually one word or token. Keep the leading space in `text` (`' world'`); word splitting depends on it.
- Render caption text in an element with `white-space: pre` so spaces survive.

## parseSrt

```ts
import {parseSrt} from '@remotion/captions';
const {captions} = parseSrt({input: srtFileContents});
```

- `input` is the file text. `strict: true` (4.0.530+) rejects malformed or empty files instead of skipping bad cues; default `false`.
- Cues come back as captions with `confidence: 1` and `timestampMs` at the cue midpoint.
- Other helpers in the package: `parseVtt`, `serializeSrt`, `ensureMaxCharactersPerLine`.

## createTikTokStyleCaptions

```ts
import {createTikTokStyleCaptions} from '@remotion/captions';
const {pages} = createTikTokStyleCaptions({
  captions,
  combineTokensWithinMilliseconds: 1200,
});
```

- Higher `combineTokensWithinMilliseconds` puts more words on a page. Lower values approach word by word.
- A new page starts at the next caption whose text begins with a space once the page duration exceeds the value.
- `breakOnSilenceAfterMilliseconds` (4.0.514+) starts a new page after a gap of that length; `0` gives one page per word.
- Page shape: `{text, startMs, durationMs, tokens: [{text, fromMs, toMs, pageBreakAfter?}]}`.

## Rendering pages

```tsx
const {fps} = useVideoConfig();
const frame = useCurrentFrame();
const ms = (frame / fps) * 1000 + offsetMs;
const page = pages.find((p) => ms >= p.startMs && ms < p.startMs + p.durationMs);
```

- Highlight the active token with `ms >= t.fromMs && ms < t.toMs`.
- `offsetMs` is the start of the enclosing `<Sequence>` in ms, because `useCurrentFrame()` resets inside a Sequence.
- Alternative: render each page in `<Sequence from={Math.round(p.startMs / 1000 * fps)} durationInFrames={Math.max(1, Math.round(p.durationMs / 1000 * fps))}>` and compute token timing from the local frame minus `p.startMs`.
- Load caption JSON through `staticFile` + `fetch` inside `calculateMetadata` (pass it as a prop) or import it as a module. Do not fetch in `useEffect` without `delayRender`.

## Other sources

`@remotion/openai-whisper` (`openAiWhisperApiToCaptions`) and `@remotion/install-whisper-cpp` produce `Caption[]`. ElevenLabs timestamps must be mapped to this type by the caller.
