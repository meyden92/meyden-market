// Copied by the build skill to src/videos/<slug>/theme.ts. Build step 2 replaces the placeholder line below the imports with one loadFont() call per
// family in meta.style.font and meta.style.displayFont (import from "@remotion/google-fonts/<Family without spaces>", the
// weights from BRIEF.md's Type line). Colours come from meta.style.palette; change them in scenes.json, not here.
import { makeTheme } from "../../lib/motion";
import type { Manifest } from "../../lib/scenes";
import manifestJson from "../../../videos/__SLUG__/scenes.json";
__FONTS__

const { meta } = manifestJson as unknown as Manifest;

export const theme = makeTheme(meta.style);
