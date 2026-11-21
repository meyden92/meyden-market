// Copied by the music build to src/videos/<slug>/theme.ts (replace __SLUG__). Palette, images and lyric styles come from
// STORYBOARD.md; data comes from videos/<slug>/blocks.json (music-blocks.mjs), research/song.json and research/alignment.json.
import { staticFile } from "remotion";
import { BlockDef, defineMusic, Look, LookId, LyricStyle, SongAnalysis, Alignment } from "../../lib/music";
import blocksJson from "../../../videos/__SLUG__/blocks.json";
import songJson from "../../../videos/__SLUG__/research/song.json";
import alignmentJson from "../../../videos/__SLUG__/research/alignment.json";

export const SLUG = "__SLUG__";
export const W = 1920;
export const H = 1080;
export const FPS = blocksJson.fps;
export const TOTAL = blocksJson.total;
export const BLOCKS = blocksJson.blocks as BlockDef[];
export type BlockId = string;
export const block = (id: BlockId) => BLOCKS.find((b) => b.id === id)!;

/** This video's own looks, one file each in ./looks/<id>.ts (same contract as lib/music/looks), keyed by id. */
export const PROJECT_LOOKS: Record<string, Look> = {};
/** How plates print and the post stack: "plain" (no treatment), a key of PROJECT_LOOKS, or a built-in finish the treatment names (riso, film, pixel, cel, neon, chrome, vhs, linocut, engraving, blueprint, ascii, paper, watercolor, comic, duotone). */
export const LOOK: LookId = "plain";
/** ink: darkest (backgrounds, 3D sides). paper: lightest (lyrics, paper). accent: main print colour. pop: second accent. From the chosen treatment. */
export const C = { ink: "#0A0A0C", paper: "#F2EFE8", accent: "#FF2B3A", pop: "#C6FF1A" };

/** Image names, one per file public/img/<name>.png. Add every image a block uses. */
export const IMAGES: string[] = [];

/** Lyric style per block id (default "flat"): flat | fame | feed | sticker | scene. */
export const LYRIC_STYLES: Record<string, LyricStyle> = {};
/** Per-block LyricLayer options: reflect (water reflection), shade (0..1 bottom gradient on bright shots). */
export const LYRIC_OPTS: Record<string, { reflect?: boolean; shade?: number }> = {};

defineMusic({
  fps: FPS,
  width: W,
  height: H,
  songSrc: staticFile(`audio/${SLUG}.mp3`),
  song: songJson as unknown as SongAnalysis,
  alignment: alignmentJson as unknown as Alignment,
  blocks: BLOCKS,
  palette: C,
  look: LOOK,
  looks: PROJECT_LOOKS,
  // lyricFont: the treatment's lyric typeface, e.g. loadFont() from @remotion/google-fonts/<Family>, set in step 6.
  // font3d: staticFile("fonts/<Family>-<weight>.ttf"), only when the treatment extrudes type (scripts/font-ttf.mjs).
  images: IMAGES,
  lyricStyles: LYRIC_STYLES,
  // refrainWords: ["words", "of", "the", "refrain"],
  // highlightWords: [],
  // chips: {},
});
