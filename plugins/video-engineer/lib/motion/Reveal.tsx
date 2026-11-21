// upstream: haidrrrry/claude-remotion-skill examples/src/components/Motion.tsx @ 1dcbe5e3fc6cf970bd10d3cc05f0a8a5d19d0383 (MIT) — changes: theme import replaced by a theme prop, stagger index and from-direction added, delay in seconds, scene-exit wrapper (Exit) rewritten with fps-derived duration
import React from "react";
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { staggerFrames, type Theme } from "./theme";

export type RevealFrom = "rise" | "drop" | "left" | "right" | "pop";

// Start offset in px at a 1920 wide canvas, and start scale.
const FROM: Record<RevealFrom, { x: number; y: number; scale: number }> = {
  rise: { x: 0, y: 40, scale: 0.94 },
  drop: { x: 0, y: -40, scale: 0.94 },
  left: { x: -60, y: 0, scale: 0.96 },
  right: { x: 60, y: 0, scale: 0.96 },
  pop: { x: 0, y: 16, scale: 0.8 },
};

/** Maps a scene's motion.entrance string to a Reveal direction. Unknown values give "rise". */
export const entranceFrom = (entrance: string): RevealFrom =>
  (entrance in FROM ? entrance : "rise") as RevealFrom;

/**
 * Entrance that animates opacity, translate and scale together with spring().
 * Siblings pass their position as `index`; each one starts staggerFrames(fps) frames after the previous.
 */
export const Reveal: React.FC<{
  theme: Theme;
  /** Position among siblings. */
  index?: number;
  /** Extra delay in seconds before the first sibling starts. */
  delay?: number;
  from?: RevealFrom;
  /** "smooth" for large blocks, "snappy" for small UI. */
  feel?: "smooth" | "snappy" | "bouncy";
  children: React.ReactNode;
  style?: React.CSSProperties;
}> = ({ theme, index = 0, delay = 0, from = "rise", feel = "smooth", children, style }) => {
  const frame = useCurrentFrame();
  const { fps, width } = useVideoConfig();
  const k = width / 1920;
  const start = Math.round(delay * fps) + index * staggerFrames(fps);
  const p = spring({ frame: frame - start, fps, config: theme.spring[feel] });
  const f = FROM[from];
  return (
    <div
      style={{
        opacity: Math.min(1, p),
        transform: `translate(${interpolate(p, [0, 1], [f.x * k, 0])}px, ${interpolate(p, [0, 1], [f.y * k, 0])}px) scale(${interpolate(p, [0, 1], [f.scale, 1])})`,
        ...style,
      }}
    >
      {children}
    </div>
  );
};

/** Content exit over the last frames of the scene. Exits are faster than entrances (about 0.33 s). */
export const Exit: React.FC<{ theme: Theme; children: React.ReactNode }> = ({ theme, children }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames, height } = useVideoConfig();
  const span = Math.round(fps * 0.33);
  const end = durationInFrames - 2;
  const t = { easing: theme.ease.in, extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        opacity: interpolate(frame, [end - span, end], [1, 0], t),
        transform: `translateY(${interpolate(frame, [end - span, end], [0, -0.04 * height], t)}px)`,
      }}
    >
      {children}
    </div>
  );
};
