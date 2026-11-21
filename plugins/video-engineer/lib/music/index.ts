// Music-video kit: defineMusic() once per project, then the audio, lyric, 3D and type components below.
// Blocks import from here; the project theme (src/song/theme.ts) calls defineMusic().
import { loadAssets } from "./fonts";
import { MusicConfig, setConfig } from "./config";

/** Registers the project's song data, blocks, palette, fonts and images. Call once, before anything renders. */
export const defineMusic = (cfg: MusicConfig) => {
  setConfig(cfg);
  loadAssets();
};

export * from "./audio";
export * from "./config";
export * from "./fonts";
export * from "./fx";
export * from "./LyricLayer";
export * from "./looks";
export * from "./lyrics";
export * from "./plate";
export * from "./poster";
export * from "./text3d";
export * from "./textures";
export * from "./three";
