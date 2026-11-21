# Render CLI

Run from the Remotion project root. `npx remotion` resolves the local `@remotion/cli` 4.0.537.

## render

```bash
npx remotion render src/index.ts <composition-id> out/video.mp4 \
  --codec h264 --crf 18 --concurrency 4 --overwrite
```

Syntax: `render <entry-point|serve-url>? <composition-id> <output-location>`. If the id is omitted the CLI prompts; if the output is omitted it writes to `out/`.

| Flag | Notes |
|---|---|
| `--codec` | h264 (default), h265, av1, prores, mp3, and others. AV1 unavailable on Linux ARM64 GNU. |
| `--crf` | Lower is higher quality, min 0. Not with `--video-bitrate` or hardware acceleration. |
| `--frames` | List `0,30,60` produces an image sequence; ranges `0-99,150-199` are joined into one video. Inclusive. |
| `--concurrency` | Parallel render workers. |
| `--props` | Inline JSON or a JSON file path. Inline JSON fails in Windows shells; use a file. |
| `--overwrite` | On by default; `--overwrite=false` to keep an existing file. |
| `--scale` | Output size multiplier, >0 and <=16. |
| `--jpeg-quality` | 0-100, ignored for PNG frames. |
| `--muted` | No audio. |
| `--log` | error, warn, info (default), verbose. |
| `--public-dir` | Alternate public directory. |
| `--audio-codec`, `--sequence` | Audio codec; write an image sequence. |
| `--every-nth-frame` | GIF only. |

Input props passed with `--props` reach `calculateMetadata` as `props`.

## still

```bash
npx remotion still src/index.ts <composition-id> out/frame.png --frame=45
```

- Syntax: `still <entry|serve-url>? [<composition-id>] [<output-location>]`.
- `--frame=N` selects the frame (0-based, local to the composition). One frame per call; use `render --frames` for several.
- Other flags: `--props`, `--image-format`, `--jpeg-quality`, `--scale`, `--overwrite`, `--timeout` (ms for `delayRender`, default 30000), `--public-dir`, `--log`.
- `--ffmpeg-executable` and `--ffprobe-executable` were removed in 4.0.

## ffmpeg and ffprobe

```bash
npx remotion ffmpeg -i input.mp4 output.wav
npx remotion ffprobe public/clips/a.mp4
```

- Both ship with Remotion (FFmpeg 7.1 line). No system install needed.
- The binaries only support codecs Remotion supports: H.264, H.265, VP8, VP9, ProRes. Inputs in other codecs may fail to decode.
- The bundled build lacks the filters `tile`, `overlay`, `drawtext`, `pad`, `select`, `afade` and the `mov_text` encoder. It cannot read AIFF (convert to WAV elsewhere first) and cannot write `s16le` or `f32le` raw output. Do the work in Remotion, or with another tool, when a command needs one of these.
- Measure brightness from `format=rgb24` and compute luma yourself (0.299 R + 0.587 G + 0.114 B). `format=gray` from this build is not full range: a 1x1 grey pass reads a navy `#0F172A` frame as 8 instead of 23, so it looks near-black.
- Three.js scenes: render with `--gl=angle`. See the Three.js section in `SKILL.md`.

## Studio

`npx remotion studio src/index.ts` opens the preview. Compositions appear by `id`.

- `--port=N` overrides `Config.setStudioPort(N)` in `remotion.config.ts`; `--no-open` (or `Config.setShouldOpenBrowser(false)`) keeps it from opening a browser.
- `render`, `still` and `compositions` take the port from `--port`, then `Config.setRendererPort`, else they pick a free port in 3000-3100. A pinned renderer port that is taken is a fatal error, so leave it unpinned when stills render in parallel.

## Output size

`--scale` must give whole pixels: `--scale=0.6667` on 1080 gives 720.036 and fails. Render a smaller size from a composition of that size, or use a scale that divides evenly (0.5 on 1080).

## Timeouts and failures

- A frame fails when a `delayRender` handle is not cleared in 30 s. Raise with `--timeout` or fix the cause; the error message includes the `delayRender` label.
- Render each composition by id; the id must match `<Composition id>` exactly.
