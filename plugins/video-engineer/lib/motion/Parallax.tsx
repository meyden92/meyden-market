// upstream: haidrrrry/claude-remotion-skill remotion-motion-graphics/references/motion-patterns.md (section 13) @ 1dcbe5e3fc6cf970bd10d3cc05f0a8a5d19d0383 (MIT) — changes: layers array with depth factors, travel as a fraction of the canvas, horizontal in wide and vertical in tall, theme prop
import React from "react";
import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import type { Theme } from "./theme";

/**
 * Layered depth driven by the frame. Each layer moves `depth` times the base travel:
 * 0.3 for the background, 0.6 for the middle, 1 or more for the foreground.
 */
export const Parallax: React.FC<{
  theme: Theme;
  layers: { node: React.ReactNode; depth: number }[];
  /** Base travel as a fraction of the canvas width (wide, square) or height (tall). */
  travel?: number;
  axis?: "x" | "y";
}> = ({ theme, layers, travel = 0.06, axis = "x" }) => {
  const frame = useCurrentFrame();
  const { durationInFrames, width, height } = useVideoConfig();
  const base = travel * (axis === "x" ? width : height);
  const t = interpolate(frame, [0, durationInFrames], [0, -base], { easing: theme.ease.inOut });
  return (
    <>
      {layers.map((l, i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            inset: 0,
            // Overscan so the shifted layer never shows an edge.
            transform: `translate(${axis === "x" ? t * l.depth : 0}px, ${axis === "y" ? t * l.depth : 0}px) scale(1.12)`,
          }}
        >
          {l.node}
        </div>
      ))}
    </>
  );
};
