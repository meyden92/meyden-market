// Song composition: blocks in sequence with the full song audio. Each block renders in local frames; TimeOffset gives absolute song time.
// The look overlay sits above the lyrics; SongBlock can render a block in another look.
import React from "react";
import { AbsoluteFill, Audio, Series } from "remotion";
import { getLook, LookId, LookOverlay, LookScope, LyricLayer, songSrc, TimeOffset, useAssetsReady } from "../../lib/music";
import { BLOCKS, block, BlockId, C, LYRIC_OPTS } from "./theme";
import { WORLDS } from "./worlds";

const BlockBody: React.FC<{ id: BlockId }> = ({ id }) => {
  const World = WORLDS[id];
  return (
    <TimeOffset.Provider value={block(id).from}>
      <AbsoluteFill style={{ background: C.ink }}>
        <World />
        <LyricLayer block={id} {...LYRIC_OPTS[id]} />
        <LookOverlay />
      </AbsoluteFill>
    </TimeOffset.Provider>
  );
};

/**
 * One block on its own, with the song audio trimmed to the block range. `look` renders it in another look,
 * `lookPalette` with that look's suggested palette instead of the project's.
 */
export const SongBlock: React.FC<{ id: BlockId; look?: LookId; lookPalette?: boolean }> = ({ id, look, lookPalette }) => {
  const ready = useAssetsReady();
  const body = ready ? <BlockBody id={id} /> : null;
  return (
    <AbsoluteFill style={{ background: C.ink }}>
      <Audio src={songSrc()} trimBefore={block(id).from} />
      {look ? <LookScope look={look} palette={lookPalette ? getLook(look).palette : undefined}>{body}</LookScope> : body}
    </AbsoluteFill>
  );
};

/** All blocks in sequence with the full song. `upTo` stops after that block id (wave previews). */
export const Song: React.FC<{ upTo?: BlockId }> = ({ upTo }) => {
  const ready = useAssetsReady();
  const last = upTo ? BLOCKS.findIndex((b) => b.id === upTo) : BLOCKS.length - 1;
  return (
    <AbsoluteFill style={{ background: C.ink }}>
      <Audio src={songSrc()} />
      {ready ? (
        <Series>
          {BLOCKS.slice(0, last + 1).map((b) => (
            <Series.Sequence key={b.id} durationInFrames={b.to - b.from} name={b.id}>
              <BlockBody id={b.id} />
            </Series.Sequence>
          ))}
        </Series>
      ) : null}
    </AbsoluteFill>
  );
};
