// upstream: haidrrrry/claude-remotion-skill remotion-motion-graphics/assets/theme.ts @ 1dcbe5e3fc6cf970bd10d3cc05f0a8a5d19d0383 (MIT) — changes: colours derived from meta.style.palette instead of fixed values, glow colour removed, sizes derived from minTextPx and layout, google-font loading moved to the per-video theme.ts, display font and ground from meta.style
import { Easing } from "remotion";
import type { Layout } from "../scenes/types";

type Rgb = [number, number, number];

const toRgb = (hex: string): Rgb => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

const toHex = ([r, g, b]: Rgb) =>
  `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`;

const luminance = (hex: string) => {
  const [r, g, b] = toRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

/** Linear mix of two hex colours; t = 0 gives a, t = 1 gives b. */
export const mix = (a: string, b: string, t: number) => {
  const [ra, rb] = [toRgb(a), toRgb(b)];
  return toHex([0, 1, 2].map((i) => ra[i] + (rb[i] - ra[i]) * t) as Rgb);
};

/** Hex colour with alpha, as an 8-digit hex string. */
export const alpha = (hex: string, a: number) =>
  `${hex}${Math.round(Math.min(1, Math.max(0, a)) * 255).toString(16).padStart(2, "0")}`;

export type Style = { sheet: string; palette: string[]; font: string; displayFont?: string; minTextPx: number; ground?: "plain" | "mesh" };

export type TypeScale = {
  hero: number;
  h1: number;
  h2: number;
  body: number;
  small: number;
  /** Multiplier from the 1920 (wide) or 1080 (tall, square) reference width to the canvas width. */
  k: number;
};

export const makeTheme = (style: Style) => {
  const { palette, font, minTextPx } = style;
  const displayFont = style.displayFont ?? font;
  const bg = palette[0];
  const rest = palette.slice(1);
  // Text is the palette colour with the most contrast against the background.
  const text = [...rest].sort((a, b) => contrast(b, bg) - contrast(a, bg))[0] ?? (luminance(bg) > 0.5 ? "#111111" : "#F5F5F5");
  const hues = rest.filter((c) => c !== text);
  const primary = hues[0] ?? text;
  const accent = hues[1] ?? primary;
  const dark = luminance(bg) < 0.4;

  return {
    dark,
    colors: {
      bg,
      bgAlt: mix(bg, text, 0.07),
      surface: mix(bg, text, 0.1),
      line: mix(bg, text, 0.22),
      text,
      textDim: mix(text, bg, 0.35),
      primary,
      accent,
      onPrimary: contrast(primary, bg) > contrast(primary, text) ? bg : text,
    },
    fonts: {
      display: `${displayFont}, system-ui, sans-serif`,
      body: `${font}, system-ui, sans-serif`,
      mono: "ui-monospace, Menlo, Consolas, monospace",
    },
    minTextPx,
    /** "plain": the background colour only. "mesh": gradient mesh, grade, grain and vignette (Background). */
    ground: style.ground ?? "plain",
    ease: {
      out: Easing.bezier(0.16, 1, 0.3, 1),
      inOut: Easing.bezier(0.83, 0, 0.17, 1),
      in: Easing.bezier(0.7, 0, 0.84, 0),
    },
    spring: {
      snappy: { damping: 14, stiffness: 160, mass: 0.6 },
      smooth: { damping: 20, stiffness: 90, mass: 1 },
      bouncy: { damping: 11, stiffness: 170, mass: 0.7 },
    },
    /** Type sizes in px for a layout and canvas width. Every size is at least minTextPx. */
    type: (layout: Layout, width: number): TypeScale => {
      const k = width / (layout === "wide" ? 1920 : 1080);
      const px = (base: number) => Math.max(minTextPx, Math.round(base * k));
      return layout === "wide"
        ? { hero: px(120), h1: px(84), h2: px(60), body: px(48), small: px(minTextPx), k }
        : { hero: px(104), h1: px(76), h2: px(58), body: px(46), small: px(minTextPx), k };
    },
  };
};

export type Theme = ReturnType<typeof makeTheme>;

/** Number of frames for a duration given in seconds. */
export const sec = (seconds: number, fps: number) => Math.round(seconds * fps);

/** Frame offset between siblings: 3-6 frames, about 0.14 s. */
export const staggerFrames = (fps: number) => Math.min(6, Math.max(3, Math.round(fps * 0.14)));
