import { Freeze, OffthreadVideo, useCurrentFrame, useVideoConfig } from "remotion";
import { assetsOf } from "./kit";
import { str } from "./data";
import { TutorialScene, type Timed } from "./Tutorial";
import { assetUrl } from "./SceneAudio";
import type { SceneProps } from "./types";

// data: url (address shown in the frame header), steps (highlight, zoom, unzoom, callout, badge, clear)
// Plays the recorded capture from its first step. A recording longer than the scene plays faster (up to 2x);
// a shorter one holds its last frame. Cursor, clicks and typing come from the recording's events.
export const Screencast: React.FC<SceneProps> = ({ scene, meta, layout, tutorial }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const capture = tutorial?.capture;
  if (capture?.startSec === undefined || capture.durationSec === undefined)
    throw new Error(`scene ${scene.id}: the capture has no recording times; run the capture stage`);
  const rate = Math.min(2, Math.max(1, capture.durationSec / (durationInFrames / fps)));
  const toFrame = (t: number) => Math.round((t / rate) * fps);
  const lastFrame = Math.max(0, toFrame(capture.durationSec) - 1);
  const recorded: Timed[] = capture.events.map((e) => ({ frame: toFrame(e.t), action: e.action, box: e.box, text: e.text }));
  // A target's box is where the recording last saw it; targets never acted on use the box after the last step.
  const boxAt = (target: string, f: number) => [...capture.events].reverse().find((e) => e.target === target && toFrame(e.t) <= f)?.box;
  return (
    <TutorialScene
      scene={scene}
      meta={meta}
      layout={layout}
      input={tutorial}
      url={str(scene.data, "url")}
      recorded={recorded}
      boxAt={boxAt}
      media={
        <Freeze frame={lastFrame} active={frame > lastFrame}>
          <OffthreadVideo
            src={assetUrl(assetsOf(scene, "screencast")[0].file)}
            trimBefore={Math.round(capture.startSec * fps)}
            playbackRate={rate}
            muted
            style={{ width: "100%", height: "100%", display: "block" }}
          />
        </Freeze>
      }
    />
  );
};
