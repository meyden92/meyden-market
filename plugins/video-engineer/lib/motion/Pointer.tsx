import React from "react";
import { interpolate } from "remotion";
import { alpha, type Theme } from "./theme";

/** Mouse cursor drawn at (x, y), its tip on the point. `press` 0..1 shrinks it during a click. */
export const Cursor: React.FC<{ theme: Theme; kind: "arrow" | "dot"; x: number; y: number; size: number; opacity?: number; press?: number }> = ({
  theme,
  kind,
  x,
  y,
  size,
  opacity = 1,
  press = 0,
}) => {
  const scale = 1 - 0.15 * press;
  if (kind === "dot")
    return (
      <div
        style={{
          position: "absolute",
          left: x - size / 2,
          top: y - size / 2,
          width: size,
          height: size,
          borderRadius: "50%",
          backgroundColor: alpha(theme.colors.text, 0.55),
          border: `${Math.max(2, size * 0.12)}px solid ${theme.colors.bg}`,
          boxShadow: "0 6px 14px rgba(0,0,0,0.35)",
          opacity,
          transform: `scale(${scale})`,
        }}
      />
    );
  return (
    <svg
      width={size}
      height={size * 1.4}
      viewBox="0 0 20 28"
      style={{ position: "absolute", left: x, top: y, opacity, transform: `scale(${scale})`, transformOrigin: "0 0", filter: "drop-shadow(0 4px 6px rgba(0,0,0,0.35))" }}
    >
      <path d="M1 1 L1 22 L6.5 17 L10.5 26 L14 24.5 L10 16 L17.5 16 Z" fill="#FFFFFF" stroke="#111111" strokeWidth={1.6} strokeLinejoin="round" />
    </svg>
  );
};

/** Expanding ring for a click, `progress` 0..1 over about 0.4 s. */
export const ClickRipple: React.FC<{ theme: Theme; x: number; y: number; size: number; progress: number }> = ({ theme, x, y, size, progress }) => {
  if (progress <= 0 || progress >= 1) return null;
  const r = interpolate(progress, [0, 1], [size * 0.2, size], { easing: theme.ease.out });
  return (
    <div
      style={{
        position: "absolute",
        left: x - r,
        top: y - r,
        width: r * 2,
        height: r * 2,
        borderRadius: "50%",
        border: `${Math.max(3, size * 0.08)}px solid ${theme.colors.primary}`,
        opacity: 1 - progress,
      }}
    />
  );
};
