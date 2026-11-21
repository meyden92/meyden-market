// Font and image loading for the music kit: F.lyric (the one lyric typeface), FONT3D, IMG textures, useAssetsReady.
// Everything is requested by defineMusic() and awaited before the first frame so headless renders never see a half-loaded asset.
import { useEffect, useState } from "react";
import * as THREE from "three";
import { cancelRender, staticFile, useDelayRender } from "remotion";
import { Font } from "three/examples/jsm/loaders/FontLoader.js";
import { TTFLoader } from "three/examples/jsm/loaders/TTFLoader.js";
import { music } from "./config";

/** Font families. Lyrics use F.lyric everywhere; variety comes from weight, size, colour and animation, not from other typefaces. */
export const F = {
  get lyric() {
    const font = music().lyricFont;
    if (!font) throw new Error("lib/music: set lyricFont in theme.ts (the treatment's lyric typeface) before rendering lyrics");
    return font.fontFamily;
  },
  /** Lyric weights from config.lyricWeights: regular, medium, bold. */
  get regular() {
    return (music().lyricWeights ?? [500, 600, 800])[0];
  },
  get medium() {
    return (music().lyricWeights ?? [500, 600, 800])[1];
  },
  get bold() {
    return (music().lyricWeights ?? [500, 600, 800])[2];
  },
};

/** Outlines for extruded 3D type. TextGeometry needs glyph paths, and a variable font would give its default instance, so this is a static TTF. */
export const FONT3D: { font: Font | null } = { font: null };

/** Image textures by name, decoded before any shot mounts. Filled by defineMusic(). */
export const IMG: Record<string, THREE.Texture> = {};
/** Raw decoded image (for canvas compositing). */
export const imgEl = (n: string) => IMG[n].image as HTMLImageElement;

let all: Promise<unknown> = Promise.resolve();

export const loadAssets = () => {
  const c = music();
  const waits: Promise<unknown>[] = [...(c.lyricFont ? [c.lyricFont] : []), ...(c.fonts ?? [])].map((f) => f.waitUntilDone());
  if (c.font3d)
    waits.push(
      fetch(c.font3d)
        .then((r) => r.arrayBuffer())
        .then((buf) => {
          FONT3D.font = new Font(new TTFLoader().parse(buf) as any);
        }),
    );
  for (const n of c.images ?? []) {
    const t = new THREE.Texture();
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    IMG[n] = t;
    waits.push(
      new Promise<void>((res, rej) => {
        new THREE.ImageLoader().load(
          staticFile(`img/${n}.png`),
          (img) => {
            t.image = img;
            t.needsUpdate = true;
            res();
          },
          undefined,
          () => rej(new Error(`image public/img/${n}.png failed to load`)),
        );
      }),
    );
  }
  all = Promise.all(waits);
};

/** Holds the render until fonts, 3D outlines and image textures are ready. */
export const useAssetsReady = () => {
  const { delayRender, continueRender } = useDelayRender();
  const [ready, setReady] = useState(false);
  const [handle] = useState(() => delayRender("fonts and image textures"));
  useEffect(() => {
    all.then(
      () => {
        setReady(true);
        continueRender(handle);
      },
      (e) => cancelRender(e),
    );
  }, [continueRender, handle]);
  return ready;
};
