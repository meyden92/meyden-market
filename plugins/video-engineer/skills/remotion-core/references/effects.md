# Effects

`@remotion/effects` 4.0.537 (in the project template) applies pixel effects to canvas-based components through an `effects` prop. Verified by rendering a still with `Solid`, `Img`, `paper`, `duotone` and `roughenEdges` headless. Docs: https://www.remotion.dev/docs/effects (append `.md` for markdown).

## Usage

```tsx
import { Img, Solid, staticFile } from "remotion";
import { paper } from "@remotion/effects/paper";
import { duotone } from "@remotion/effects/duotone";
import { roughenEdges } from "@remotion/effects/roughen-edges";

<Solid width={width} height={height} color={theme.colors.bg} effects={[paper({ amount: 0.8, colorFront: groundShade, colorBack: groundTint, seed: 12 })]} />
<Img src={staticFile("img/s02-subject.png")} effects={[duotone({ darkColor: ink, lightColor: accent }), roughenEdges({ border: 18, seed: 4 })]} />
```

- Effects work only on canvas components: `Solid` (a sized colour plane, from `remotion`), `Img`, `CanvasImage`, `AnimatedImage`, `Gif`, `Video` from `@remotion/media`, `RemotionRiveCanvas`, and `@remotion/shapes` components.
- Each effect is its own entry point: `@remotion/effects/<kebab-name>`, exporting a camelCase function. Effects apply in array order.
- Parameters are in `node_modules/@remotion/effects/dist/<kebab-name>.d.ts`, each documented with its range and default. Read that file before using an effect; do not guess parameter names.
- Animate a parameter from the frame (`interpolate(frame, ...)`) for effects with a progress value (`evolve`, `tear`, `page-turn`, `light-leak`, `pixel-dissolve`). Pass a fixed `seed` wherever one exists, so every render matches.
- `Solid` takes `style` like a `div` (`position: "absolute"` to layer it, `opacity`). An effect draws over the component's own pixels: on a flat `Solid`, an effect that samples brightness (`halftone`) gives an even pattern, so give it a gradient or an image to sample, or use the even pattern as a texture on purpose. `paper` defaults to blue-grey `colorFront` and white `colorBack`; set both to tints of the ground colour, or the ground turns grey.
- DOM text takes no effects. To print, rough or texture type, layer a canvas texture over it with `mixBlendMode` (`multiply` on light grounds, `screen` on dark), or draw the type into an image first.
- Under `meta.style.effects` `restrained`, `glow`, `light-leak`, `shine` and `starburst` count as glow and are not used.

## By what they make

| A world needs | Effects |
|---|---|
| a material ground or surface | `paper`, `burlap`, `flannel`, `speckle`, `noise`, `white-noise`, `fractal-noise`, `emboss`, `bevel-alpha`, `pattern`, `tile`, `checkerboard`, `linear-gradient` |
| a print or reproduction look | `halftone`, `halftone-linear-gradient`, `duotone`, `dot-grid`, `lines`, `contour-lines`, `liquid-contours`, `gridlines`, `scanlines`, `pixelate`, `tv-signal-off`, `thermal-vision` |
| a cut, torn or hand-made edge | `roughen-edges`, `tear`, `outline`, `drop-shadow`, `shrinkwrap` |
| a reveal or seam inside a scene | `evolve`, `page-turn`, `tear`, `pixel-dissolve`, `venetian-blinds`, `linear-progressive-blur`, `radial-progressive-blur`, `linear-progressive-pixelate`, `radial-progressive-pixelate`, `zoom-blur` |
| a bent or projected surface | `cylinder`, `sphere`, `fisheye`, `barrel-distortion`, `corner-pin`, `wave`, `waves`, `zigzag`, `turbulent-displace`, `noise-displacement`, `skew`, `mirror` |
| a grade or optical finish | `blur`, `brightness`, `grayscale`, `invert`, `color-correction`, `levels`, `lut`, `white-balance`, `exposure`, `contrast`, `saturation`, `vibrance`, `hue`, `tint`, `linear-gradient-tint`, `shadows-highlights`, `lens-blur`, `region-blur`, `chromatic-aberration`, `vignette` |
| compositing and placement inside the chain | `color-key` (removes a colour), `scale`, `translate` |
| light (only with `effects: allowed`) | `glow`, `light-leak`, `light-trail`, `shine`, `starburst`, `rings` |

An effect is part of the treatment's world when the world names what it does; an effect that only decorates is removed, as with any other effect (`motion-rules`, Restraint).
