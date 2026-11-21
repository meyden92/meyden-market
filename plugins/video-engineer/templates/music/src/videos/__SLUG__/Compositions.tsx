// Compositions of one music video: <slug> (full), <slug>-upto (preview up to the `upTo` prop), <slug>-<block> (one block with its audio slice,
// `look` prop for another look).
// Included in src/Root.tsx by gen-index.mjs.
import React from "react";
import { Composition, Folder } from "remotion";
import { Song, SongBlock } from "./Song";
import { BLOCKS, FPS, H, SLUG, TOTAL, W } from "./theme";

export const Compositions: React.FC = () => (
  <>
    <Composition id={SLUG} component={Song} durationInFrames={TOTAL} fps={FPS} width={W} height={H} defaultProps={{}} />
    <Composition
      id={`${SLUG}-upto`}
      component={Song}
      durationInFrames={TOTAL}
      fps={FPS}
      width={W}
      height={H}
      defaultProps={{ upTo: BLOCKS[0].id }}
      calculateMetadata={({ props }) => ({ durationInFrames: BLOCKS.find((b) => b.id === props.upTo)?.to ?? TOTAL })}
    />
    <Folder name={`${SLUG}-blocks`}>
      {BLOCKS.map((b) => (
        <Composition key={b.id} id={`${SLUG}-${b.id}`} component={SongBlock} durationInFrames={b.to - b.from} fps={FPS} width={W} height={H} defaultProps={{ id: b.id }} />
      ))}
    </Folder>
  </>
);
