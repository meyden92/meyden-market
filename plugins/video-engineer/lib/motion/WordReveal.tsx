// upstream: haidrrrry/claude-remotion-skill examples/src/components/Motion.tsx @ 1dcbe5e3fc6cf970bd10d3cc05f0a8a5d19d0383 (MIT) — changes: theme prop, glow text-shadow on the hero word removed (colour only), per-word delay defaults to the fps-derived stagger, delay in seconds
import React from "react";
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { staggerFrames, type Theme } from "./theme";

/** Word-by-word reveal. The optional hero word takes the primary colour. */
export const WordReveal: React.FC<{
  theme: Theme;
  text: string;
  /** Delay in seconds. */
  delay?: number;
  heroWord?: string;
  style?: React.CSSProperties;
}> = ({ theme, text, delay = 0, heroWord, style }) => {
  const frame = useCurrentFrame();
  const { fps, width } = useVideoConfig();
  const per = Math.max(3, staggerFrames(fps) - 1);
  const gap = Math.round(width * 0.012) + 8;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", columnGap: gap, rowGap: Math.round(gap / 2), justifyContent: "center", ...style }}>
      {text.split(/\s+/).filter(Boolean).map((word, i) => {
        const p = spring({ frame: frame - Math.round(delay * fps) - i * per, fps, config: theme.spring.snappy });
        return (
          <span
            key={i}
            style={{
              display: "inline-block",
              opacity: Math.min(1, p),
              transform: `translateY(${interpolate(p, [0, 1], [30, 0])}px) scale(${interpolate(p, [0, 1], [0.96, 1])})`,
              color: heroWord !== undefined && word === heroWord ? theme.colors.primary : undefined,
            }}
          >
            {word}
          </span>
        );
      })}
    </div>
  );
};
