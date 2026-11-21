# Fonts and assets

## public/ and staticFile

- `public/` sits next to the `package.json` that depends on `remotion`.
- `staticFile('img/logo.png')` returns a URL (hashed path). Pass the path relative to `public/`. A leading slash is accepted.
- Since v4.0 the filename is passed through `encodeURIComponent`. Do not encode it yourself.
- Works with `<Img>`, `<Html5Audio>`, `<OffthreadVideo>`, `fetch`, `FontFace`.
- `staticFile()` is accepted in `defaultProps` and `calculateMetadata` props.
- Use `<Img>` rather than `<img>`: it holds the frame until the image loads and retries failures (`maxRetries`, default 2). After a final failure it calls `cancelRender` unless you handle `onImageError` (4.0.526+).
- Avoid CSS `background-image` and `mask-image` (flagged by the flickering docs).

## Google Fonts

```tsx
import {loadFont} from '@remotion/google-fonts/Inter';

const {fontFamily} = loadFont('normal', {
  weights: ['400', '700'],
  subsets: ['latin'],
});
// style={{fontFamily}}
```

- One import per font, from `@remotion/google-fonts/<FontName>`; `fontFamily` is also exported from the same module.
- Call `loadFont` once per style (`normal`, `italic`) you use. In 4.x `weights` and `subsets` are optional, in 5.0 required; always pass them. Loading all weights and subsets makes many requests (warning above 20; `ignoreTooManyRequestsWarning: true` silences it, 4.0.283+).
- The loader holds the render until the font is ready. `waitUntilDone()` returns a promise (4.0.135+).
- Call `loadFont` at module level of a file the scene imports, or inside the component body. Do not call it conditionally.
- Several fonts: load them in one module and export a `waitForFonts()` helper that awaits each `waitUntilDone()`.
- Package version must equal the Remotion version (`4.0.537`).

## Local fonts with @remotion/fonts

```tsx
import {loadFont} from '@remotion/fonts';
import {staticFile} from 'remotion';

loadFont({
  family: 'Brand',
  url: staticFile('fonts/Brand-Bold.woff2'),
  weight: '700',
});
```

Available since 4.0.164. Then use `fontFamily: 'Brand'`.

## Manual FontFace

```tsx
import {continueRender, delayRender, staticFile} from 'remotion';

const handle = delayRender('font Brand');
new FontFace('Brand', `url(${staticFile('fonts/Brand-Bold.woff2')})`, {weight: '700'})
  .load()
  .then((face) => {
    document.fonts.add(face);
    continueRender(handle);
  })
  .catch((err) => cancelRender(err));
```

The docs example only logs the error, which can hang the render until the 30 s timeout. Call `cancelRender(err)` (or `continueRender`) on failure. Create the handle inside a component with `useState(() => delayRender(...))` or at the top of a one-off load function, not repeatedly.

## Text measurement

`measureText`, `fitText` and `fillTextBox` must run after the font is loaded, otherwise they measure the fallback font.

## Local file checks

Run from the Remotion project root:

```bash
npx remotion ffprobe public/clips/a.mp4
```
