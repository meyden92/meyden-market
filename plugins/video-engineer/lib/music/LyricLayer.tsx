// LyricLayer: data-driven lyric overlay in one typeface (F.lyric). Styles per block come from config.lyricStyles:
// flat (free text, the look's lyric shadow), fame (whole line, current word lit), feed (typed with cursor), sticker (diegetic paper), scene (block draws its own).
import React from "react";
import { AbsoluteFill, interpolate, spring } from "remotion";
import { LyricStyle, music } from "./config";
import { F } from "./fonts";
import { activeLines, cleanWord, isRefrainLine, Line, Word } from "./lyrics";
import { drift } from "./three";
import { useT } from "./audio";
import { useLyricShadow, usePalette } from "./looks";

/** Bottom of any text stays at least this far above the frame edge (px at 1080p). */
const SAFE_BOTTOM = 96;
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

const pop = (t: number, start: number, frames = 4) => spring({ frame: (t - start) * music().fps, fps: music().fps, config: { damping: 11, stiffness: 260, mass: 0.5 }, durationInFrames: frames * 2 });
const fade = (hex: string, a: number) => `color-mix(in srgb, ${hex} ${a * 100}%, transparent)`;

/** Split a line into two halves at punctuation near the middle (for stacked stickers). */
const halves = (words: Word[]): Word[][] => {
  const ws = words.filter((w) => !w.adlib);
  if (ws.length <= 3) return [ws];
  let best = Math.ceil(ws.length / 2);
  let score = Infinity;
  ws.forEach((w, i) => {
    if (i === 0 || i === ws.length - 1) return;
    const punct = /[,?–—-]$/.test(w.text) ? -2.5 : 0;
    const s = Math.abs(i + 1 - ws.length / 2) + punct;
    if (s < score) {
      score = s;
      best = i + 1;
    }
  });
  return [ws.slice(0, best), ws.slice(best)];
};

const outFade = (t: number, l: Line) => interpolate(t, [l.show[1] - 0.12, l.show[1]], [1, 0], clamp);

/** Paper sticker, tilted, word-by-word pop. The only boxed style: use where a sticker exists in the world. */
const StickerLine: React.FC<{ l: Line; t: number }> = ({ l, t }) => {
  const shadow = useLyricShadow();
  const { highlightWords = [], fps } = music();
  const P = usePalette();
  if (l.adlib) {
    const o = interpolate(t, [l.start, l.start + 0.15], [0, 1], clamp) * outFade(t, l);
    return <div style={{ position: "absolute", left: 120, bottom: SAFE_BOTTOM, fontFamily: F.lyric, fontWeight: F.regular, fontSize: 30, color: fade(P.paper, 0.75), opacity: o, letterSpacing: 0.5, textShadow: shadow }}>{l.text}</div>;
  }
  const parts = halves(l.words);
  const f = t * fps;
  return (
    <div style={{ position: "absolute", left: 110 + drift(f, 4, 6), bottom: SAFE_BOTTOM + 74 + drift(f, 9, 5), transform: `rotate(${-2.2 + drift(f, 2, 0.6)}deg)`, transformOrigin: "left bottom", opacity: outFade(t, l) }}>
      {parts.map((ws, pi) => (
        <div key={pi} style={{ display: "flex", marginTop: pi ? 10 : 0, marginLeft: pi * 18 }}>
          <div style={{ background: P.paper, borderRadius: 22, padding: "10px 26px 14px", display: "flex", gap: 14, boxShadow: "0 10px 30px rgba(0,0,0,0.45)", transform: `scale(${interpolate(pop(t, ws[0].start), [0, 1], [0.85, 1])})`, transformOrigin: "left center", opacity: t >= ws[0].start - 0.06 ? 1 : 0 }}>
            {ws.map((w, wi) => {
              const s = pop(t, w.start);
              const on = t >= w.start - 0.04;
              const hot = highlightWords.some((a) => cleanWord(w.text).startsWith(cleanWord(a)));
              return (
                <span key={wi} style={{ fontFamily: F.lyric, fontWeight: F.bold, fontSize: 58, lineHeight: 1.05, color: hot ? P.accent : P.ink, transform: `scale(${on ? interpolate(s, [0, 1], [0.6, 1]) : 0.6})`, display: on ? "inline-block" : "none", transformOrigin: "center 70%" }}>
                  {w.text}
                </span>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
};

/** Typed word by word over its sung duration, block cursor; ad-libs are left to the world. */
const FeedLine: React.FC<{ l: Line; t: number }> = ({ l, t }) => {
  const shadow = useLyricShadow();
  const { paper } = usePalette();
  if (l.adlib) return null;
  const ws = l.words.filter((w) => !w.adlib);
  let txt = "";
  ws.forEach((w, i) => {
    const n = w.text.length;
    const k = Math.floor(interpolate(t, [w.start, Math.min(w.end, w.start + n * 0.06)], [0, n], clamp));
    if (t >= w.start) txt += (i ? " " : "") + w.text.slice(0, k);
  });
  const blink = Math.floor(t * 3.7) % 2 === 0;
  return (
    <div style={{ position: "absolute", left: 110, bottom: SAFE_BOTTOM + 40, width: 900, fontFamily: F.lyric, fontWeight: F.regular, fontSize: 48, lineHeight: 1.25, color: paper, opacity: outFade(t, l), textShadow: shadow }}>
      {txt}
      <span style={{ display: "inline-block", width: 24, height: 48, marginLeft: 6, verticalAlign: "-8px", background: paper, opacity: blink ? 1 : 0.15 }} />
    </div>
  );
};

/** ExtraBold support lines, word-by-word drop-in, sharp; optional chip next to a word; optional water reflection. */
const FlatLine: React.FC<{ l: Line; t: number; reflect?: boolean }> = ({ l, t, reflect }) => {
  const shadow = useLyricShadow();
  const { chips = {}, chipFont = "monospace", fps } = music();
  const P = usePalette();
  if (l.adlib || isRefrainLine(l)) return null;
  const ws = l.words.filter((w) => !w.adlib);
  const row = (mirror: boolean) => (
    <div style={{ display: "flex", flexWrap: "wrap", columnGap: 22, justifyContent: "center", alignItems: "center", padding: "0 110px" }}>
      {ws.map((w, i) => {
        const dt = (t - w.start) * fps;
        const on = dt >= -1;
        const k = interpolate(dt, [-1, 4], [0, 1], clamp);
        const chip = chips[cleanWord(w.text)];
        return (
          <React.Fragment key={i}>
            <span style={{ fontFamily: F.lyric, fontWeight: F.bold, fontSize: ws.length > 6 ? 70 : 84, color: P.paper, display: "inline-block", opacity: on ? k : 0, transform: `translateY(${interpolate(k, [0, 1], [-30, 0])}px)`, textShadow: mirror ? "none" : shadow }}>{w.text}</span>
            {chip && on && !mirror ? (
              <span style={{ fontFamily: chipFont, fontWeight: 700, fontSize: 34, color: P.ink, background: P.pop, borderRadius: 14, padding: "4px 14px", transform: `scale(${pop(t, w.start + 0.05)})` }}>{chip}</span>
            ) : null}
          </React.Fragment>
        );
      })}
    </div>
  );
  const f = t * fps;
  return (
    <div style={{ position: "absolute", left: 0, right: 0, bottom: reflect ? SAFE_BOTTOM + 90 : SAFE_BOTTOM, opacity: outFade(t, l) }}>
      {row(false)}
      {reflect ? (
        <div style={{ position: "absolute", left: 0, right: 0, top: "100%", transform: `scaleY(-0.7) skewX(${Math.sin(f * 0.21) * 4}deg)`, transformOrigin: "top", opacity: 0.32, filter: "blur(2px)", marginTop: 4, maskImage: "linear-gradient(to top, rgba(0,0,0,0.9), transparent)" }}>{row(true)}</div>
      ) : null}
    </div>
  );
};

/** Semibold whole line, current word lit; sung and upcoming words stay readable at 60% / 45% paper. */
const FameLine: React.FC<{ l: Line; t: number }> = ({ l, t }) => {
  const shadow = useLyricShadow();
  const { paper } = usePalette();
  return (
    <div style={{ position: "absolute", left: 160, right: 160, bottom: SAFE_BOTTOM + 24, textAlign: "center", fontFamily: F.lyric, fontWeight: F.medium, fontSize: 70, lineHeight: 1.12, opacity: outFade(t, l) * interpolate(t, [l.start - 0.06, l.start + 0.1], [0, 1], clamp) }}>
      {l.words.map((w, i) => {
        const now = t >= w.start && t < w.end + 0.15;
        const past = t >= w.end + 0.15;
        return (
          <span key={i} style={{ color: now ? paper : past ? fade(paper, 0.6) : fade(paper, 0.45), textShadow: now ? `0 0 24px ${fade(paper, 0.45)}, ${shadow}` : shadow }}>
            {w.text}{" "}
          </span>
        );
      })}
    </div>
  );
};

/**
 * Renders every line whose display window covers the current time, in the style of the line's own block.
 * It draws the block plus the next block's early lines, so a pickup shows over the outgoing block.
 * `shade` (0..1) adds a soft dark gradient at the bottom for bright shots.
 */
export const LyricLayer: React.FC<{ block: string; reflect?: boolean; shade?: number }> = ({ block, reflect, shade = 0 }) => {
  const t = useT();
  const { blocks, lyricStyles = {} } = music();
  const i = blocks.findIndex((b) => b.id === block);
  const ids = [block, blocks[i + 1]?.id].filter(Boolean) as string[];
  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      {shade > 0 ? <AbsoluteFill style={{ background: `linear-gradient(to top, rgba(0,0,0,${0.55 * shade}), transparent 38%)` }} /> : null}
      {ids.flatMap((id) =>
        activeLines(id, t).map((l) => {
          const st: LyricStyle = lyricStyles[id] ?? "flat";
          if (st === "sticker") return <StickerLine key={l.idx} l={l} t={t} />;
          if (st === "feed") return <FeedLine key={l.idx} l={l} t={t} />;
          if (st === "flat") return <FlatLine key={l.idx} l={l} t={t} reflect={reflect && id === block} />;
          if (st === "fame") return <FameLine key={l.idx} l={l} t={t} />;
          return null;
        }),
      )}
    </AbsoluteFill>
  );
};
