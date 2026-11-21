// upstream: haidrrrry/claude-remotion-skill remotion-motion-graphics/references/motion-patterns.md (section 9) @ 1dcbe5e3fc6cf970bd10d3cc05f0a8a5d19d0383 (MIT) — changes: component with prefix, suffix, decimals and a start value, delay in seconds, tabular numerals with locale formatting
import React from "react";
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";

/** Animated number. Tabular numerals keep the layout from jittering while digits change. */
export const Counter: React.FC<{
  value: number;
  from?: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  /** Delay in seconds. */
  delay?: number;
  locale?: string;
  style?: React.CSSProperties;
}> = ({ value, from = 0, decimals = 0, prefix = "", suffix = "", delay = 0, locale = "en-US", style }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = spring({ frame: frame - Math.round(delay * fps), fps, config: { damping: 30, stiffness: 60 } });
  const n = interpolate(p, [0, 1], [from, value]);
  const text = n.toLocaleString(locale, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  return (
    <span style={{ fontVariantNumeric: "tabular-nums", ...style }}>
      {prefix}
      {text}
      {suffix}
    </span>
  );
};
