import React from "react";
import { interpolate } from "remotion";
import { alpha, type Theme } from "./theme";

export type Rect = { x: number; y: number; w: number; h: number };

/**
 * Marks a rect on screen. "spotlight" dims everything outside it, "outline" draws a ring around it.
 * `progress` 0..1 fades it in and out. Shadows stay neutral black.
 */
export const Highlight: React.FC<{ theme: Theme; kind: "spotlight" | "outline"; rect: Rect; pad: number; progress: number }> = ({
  theme,
  kind,
  rect,
  pad,
  progress,
}) => {
  if (progress <= 0) return null;
  const radius = pad * 1.2;
  const ring = Math.max(3, pad * 0.35);
  return (
    <div
      style={{
        position: "absolute",
        left: rect.x - pad,
        top: rect.y - pad,
        width: rect.w + pad * 2,
        height: rect.h + pad * 2,
        borderRadius: radius,
        border: `${ring}px solid ${theme.colors.primary}`,
        boxShadow: kind === "spotlight" ? `0 0 0 9999px rgba(0,0,0,${0.55 * progress})` : undefined,
        opacity: kind === "outline" ? progress : 1,
        transform: `scale(${interpolate(progress, [0, 1], [1.06, 1])})`,
      }}
    />
  );
};

/**
 * Label pointing at a rect: below it when there is room inside the bounds, else above.
 * Kept inside `bounds` horizontally. `size` is the font size in px (never below minTextPx).
 */
export const Callout: React.FC<{ theme: Theme; text: string; rect: Rect; bounds: { w: number; h: number }; size: number; progress: number }> = ({
  theme,
  text,
  rect,
  bounds,
  size,
  progress,
}) => {
  if (progress <= 0) return null;
  const gap = size * 0.7;
  const padX = size * 0.7;
  const padY = size * 0.4;
  const height = size * 1.3 + padY * 2;
  const width = Math.min(bounds.w * 0.8, text.length * size * 0.56 + padX * 2);
  const below = rect.y + rect.h + gap + height <= bounds.h;
  const top = below ? rect.y + rect.h + gap : rect.y - gap - height;
  const cx = rect.x + rect.w / 2;
  const left = Math.min(Math.max(cx - width / 2, size * 0.5), bounds.w - width - size * 0.5);
  const arrow = size * 0.45;
  return (
    <div
      style={{
        position: "absolute",
        left,
        top,
        width,
        opacity: progress,
        transform: `translateY(${interpolate(progress, [0, 1], [below ? -gap * 0.5 : gap * 0.5, 0])}px)`,
      }}
    >
      <div
        style={{
          position: "absolute",
          left: Math.min(Math.max(cx - left - arrow, arrow), width - arrow * 3),
          top: below ? -arrow + 1 : undefined,
          bottom: below ? undefined : -arrow + 1,
          width: 0,
          height: 0,
          borderLeft: `${arrow}px solid transparent`,
          borderRight: `${arrow}px solid transparent`,
          [below ? "borderBottom" : "borderTop"]: `${arrow}px solid ${theme.colors.primary}`,
        }}
      />
      <div
        style={{
          backgroundColor: theme.colors.primary,
          color: theme.colors.onPrimary,
          fontSize: size,
          fontWeight: 700,
          lineHeight: 1.3,
          padding: `${padY}px ${padX}px`,
          borderRadius: size * 0.5,
          boxShadow: "0 18px 36px -16px rgba(0,0,0,0.55)",
          textAlign: "center",
        }}
      >
        {text}
      </div>
    </div>
  );
};

/** Numbered step marker on the top-left corner of a rect. */
export const StepBadge: React.FC<{ theme: Theme; n: number; rect: Rect; size: number; progress: number }> = ({ theme, n, rect, size, progress }) => {
  if (progress <= 0) return null;
  const d = size * 1.7;
  return (
    <div
      style={{
        position: "absolute",
        left: rect.x - d / 2,
        top: rect.y - d / 2,
        width: d,
        height: d,
        borderRadius: "50%",
        backgroundColor: theme.colors.accent,
        color: theme.colors.onPrimary,
        border: `${Math.max(2, size * 0.12)}px solid ${alpha(theme.colors.bg, 0.9)}`,
        fontSize: size,
        fontWeight: 800,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        transform: `scale(${progress})`,
      }}
    >
      {n}
    </div>
  );
};
