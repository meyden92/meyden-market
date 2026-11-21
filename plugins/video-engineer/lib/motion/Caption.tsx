// upstream: haidrrrry/claude-remotion-skill remotion-motion-graphics/references/motion-patterns.md (section 17) @ 1dcbe5e3fc6cf970bd10d3cc05f0a8a5d19d0383 (MIT) — changes: full component with per-layout placement (wide lower-third, tall large in the safe zone, square centered-low), frame-deterministic page lookup, page entrance by spring, glow-free neutral shadow
import React, { useMemo } from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { createTikTokStyleCaptions, type Caption as CaptionData } from "@remotion/captions";
import type { Layout } from "../scenes/types";
import { alpha, type Theme } from "./theme";

/**
 * Burned-in captions from a @remotion/captions Caption[] (milliseconds relative to the start of this
 * composition, shifted by offsetMs). Everything derives from the frame; no CSS transitions.
 * The active word takes the primary colour.
 */
export const Caption: React.FC<{
  theme: Theme;
  layout: Layout;
  captions: CaptionData[];
  /** Added to the playback time before lookup, for captions timed against a longer track. */
  offsetMs?: number;
  /** Words closer together than this share a page. Shorter gives 2-4 words per page. */
  combineMs?: number;
}> = ({ theme, layout, captions, offsetMs = 0, combineMs = 900 }) => {
  const frame = useCurrentFrame();
  const { fps, width } = useVideoConfig();
  const { pages } = useMemo(
    () => createTikTokStyleCaptions({ captions, combineTokensWithinMilliseconds: combineMs }),
    [captions, combineMs],
  );
  const nowMs = (frame / fps) * 1000 + offsetMs;
  const index = pages.findIndex((p) => nowMs >= p.startMs && nowMs < p.startMs + p.durationMs);
  if (index < 0) return null;
  const page = pages[index];

  const k = width / (layout === "wide" ? 1920 : 1080);
  const min = theme.minTextPx;
  const enter = spring({
    frame: frame - Math.round((page.startMs - offsetMs) / 1000 * fps),
    fps,
    config: theme.spring.snappy,
  });

  const place: Record<Layout, { box: React.CSSProperties; size: number; plate: boolean }> = {
    // Lower third: bottom-left, narrower than the canvas.
    wide: {
      box: { left: "6%", bottom: "9%", maxWidth: "62%", textAlign: "left" },
      size: Math.max(min, Math.round(46 * k)),
      plate: true,
    },
    // Large, centred, inside the middle 75 percent so platform UI does not cover it.
    tall: {
      box: { left: "8%", right: "8%", top: "60%", textAlign: "center" },
      size: Math.max(Math.round(min * 1.6), Math.round(78 * k)),
      plate: false,
    },
    square: {
      box: { left: "8%", right: "8%", bottom: "12%", textAlign: "center" },
      size: Math.max(min, Math.round(54 * k)),
      plate: true,
    },
  };
  const { box, size, plate } = place[layout];

  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      <div
        style={{
          position: "absolute",
          ...box,
          opacity: Math.min(1, enter),
          transform: `translateY(${interpolate(enter, [0, 1], [16, 0])}px) scale(${interpolate(enter, [0, 1], [0.96, 1])})`,
        }}
      >
        <span
          style={{
            display: "inline-block",
            fontFamily: theme.fonts.display,
            fontSize: size,
            fontWeight: layout === "tall" ? 800 : 600,
            lineHeight: 1.2,
            color: theme.colors.text,
            padding: plate ? `${Math.round(size * 0.22)}px ${Math.round(size * 0.42)}px` : 0,
            borderRadius: Math.round(size * 0.3),
            backgroundColor: plate ? alpha(theme.colors.bg, 0.78) : undefined,
            textShadow: plate ? undefined : "0 4px 24px rgba(0,0,0,0.65)",
            whiteSpace: "pre-wrap",
          }}
        >
          {page.tokens.map((t, i) => (
            <span
              key={i}
              style={{ color: nowMs >= t.fromMs && nowMs < t.toMs ? theme.colors.primary : undefined }}
            >
              {t.text}
            </span>
          ))}
        </span>
      </div>
    </AbsoluteFill>
  );
};
