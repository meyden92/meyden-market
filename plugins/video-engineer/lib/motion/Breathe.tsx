// upstream: haidrrrry/claude-remotion-skill remotion-motion-graphics/references/motion-patterns.md (section 12) @ 1dcbe5e3fc6cf970bd10d3cc05f0a8a5d19d0383 (MIT) — changes: wrapper component, period in seconds, amplitude props, phase offset for siblings
import React from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";

/** Idle micro-motion for anything on screen longer than about 2 s: small scale pulse plus float. */
export const Breathe: React.FC<{
  /** Seconds per cycle. */
  period?: number;
  /** Scale amplitude, 0.015 = 1.5 percent. */
  scale?: number;
  /** Vertical float in px at 1920 wide. */
  float?: number;
  /** Offset siblings so they do not pulse together. */
  phase?: number;
  children: React.ReactNode;
  style?: React.CSSProperties;
}> = ({ period = 4, scale = 0.015, float = 3, phase = 0, children, style }) => {
  const frame = useCurrentFrame();
  const { fps, width } = useVideoConfig();
  const a = (2 * Math.PI * (frame / fps + phase)) / period;
  return (
    <div style={{ transform: `translateY(${Math.sin(a * 0.75) * float * (width / 1920)}px) scale(${1 + Math.sin(a) * scale})`, ...style }}>
      {children}
    </div>
  );
};
