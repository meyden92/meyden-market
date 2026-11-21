// Project configuration for the music kit: song data, blocks, palette, fonts, images. Set once by defineMusic().
// Every other module in lib/music reads it lazily, so a project calls defineMusic() before the first frame renders.

import type { Look, LookId } from "./looks";

export type Ev = { t: number; frame: number; strength?: number };
/** Output of scripts/analyze-music.mjs. */
export type SongAnalysis = {
  duration: number;
  fps: number;
  step: number;
  beats: Ev[];
  downbeats: Ev[];
  onsets: Ev[];
  vocalOnsets: Ev[];
  energy: number[];
  bands: { low: number[]; mid: number[]; high: number[] };
  sections: { label: string; start: number; end: number }[];
};
export type RawLine = { section: string | null; text: string; start: number; end: number; words: { text: string; start: number; end: number }[] };
/** Output of `audio.mjs save <slug> align`. */
export type Alignment = { lines: RawLine[] };
/** One entry of blocks.json (scripts/music-blocks.mjs): frame range in absolute song frames. */
export type BlockDef = { id: string; section: string | null; from: number; to: number };

/** "scene": the block world renders its own lyrics. "sticker": diegetic paper sticker. "feed": typed with a cursor. "flat": free text with a soft shadow. "fame": whole line, current word lit. */
export type LyricStyle = "scene" | "sticker" | "feed" | "flat" | "fame";

export type MusicConfig = {
  fps: number;
  width: number;
  height: number;
  /** URL of the song, e.g. staticFile("audio/song.mp3"). */
  songSrc: string;
  song: SongAnalysis;
  alignment: Alignment;
  blocks: BlockDef[];
  /** ink: darkest colour (backgrounds, sides). paper: lightest (text, paper). accent: main print colour. pop: second accent (chips, highlights). */
  palette: { ink: string; paper: string; accent: string; pop: string };
  /** Visual style of the whole video: a built-in look (lib/music/looks) or a key of `looks`. Default "plain" (no treatment). */
  look?: LookId;
  /** The project's own looks (src/videos/<slug>/looks/), by id; each `id` field equals its key. Checked before the built-in looks. */
  looks?: Record<string, Look>;
  /** Lyric typeface chosen with the video's treatment: the return value of a @remotion/google-fonts loadFont() (or @remotion/fonts for a local file). No default; F.lyric throws until it is set. */
  lyricFont?: { fontFamily: string; waitUntilDone: () => Promise<unknown> };
  /** Weights the lyric styles use for regular, medium and bold text: the weights the lyric family has. Default [500, 600, 800]; a one-weight family gives the same number three times. */
  lyricWeights?: [number, number, number];
  /** Other fonts (loadFont() results) to wait for before the first frame. */
  fonts?: { waitUntilDone: () => Promise<unknown> }[];
  /** Static TTF for extruded 3D type, as a staticFile() URL. It must be the same family and weight as the lyric font. */
  font3d?: string;
  /** Image names; each is public/img/<name>.png, decoded into IMG[name] before the first frame. */
  images?: string[];
  /** Lyric style per block id; blocks not listed use "flat". */
  lyricStyles?: Record<string, LyricStyle>;
  /** Words (any case, no punctuation) that make up the refrain; lines made only of these are left to the block's own 3D type. */
  refrainWords?: string[];
  /** Words the sticker style prints in the accent colour (prefix match). */
  highlightWords?: string[];
  /** Word -> chip text, shown next to the word in the flat style (e.g. a clock time). */
  chips?: Record<string, string>;
  /** Font family of chips. Default: monospace. */
  chipFont?: string;
};

let current: MusicConfig | null = null;
export const setConfig = (c: MusicConfig) => {
  current = c;
};
export const music = (): MusicConfig => {
  if (!current) throw new Error("lib/music: call defineMusic() before using the kit");
  return current;
};
