import { createContext, useContext } from "react";
import { Audio, Sequence, staticFile, useVideoConfig } from "remotion";
import type { Scene } from "./types";

export const assetUrl = (path: string) => staticFile(path.replace(/^public\//, ""));

/** Volume of every sound effect (scene sfx and tutorial UI sounds), from meta.sound.sfxVolume. Set by the generated index. */
export const SfxVolume = createContext(0.15);
export const useSfxVolume = () => useContext(SfxVolume);

// Narration and sfx for one scene. Music is muxed after the scene renders.
export const SceneAudio: React.FC<{ scene: Scene }> = ({ scene }) => {
  const { fps } = useVideoConfig();
  const volume = useSfxVolume();
  return (
    <>
      <Audio src={assetUrl(scene.audio.file)} />
      {scene.sfx.map((s) => (
        <Sequence key={s.file} from={Math.round(s.at * fps)}>
          <Audio src={assetUrl(s.file)} volume={volume} />
        </Sequence>
      ))}
    </>
  );
};
