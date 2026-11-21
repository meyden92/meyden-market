// upstream: haidrrrry/claude-remotion-skill examples/src/components/Layers.tsx @ 1dcbe5e3fc6cf970bd10d3cc05f0a8a5d19d0383 (MIT) — changes: theme prop, mesh blob sizes scale with the canvas and use the palette, glow-free, grain blend mode follows light/dark theme, vignette strength from theme
import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { alpha, type Theme } from "./theme";

/** Layer 1: background mesh, never a flat solid. */
export const BgMesh: React.FC<{ theme: Theme }> = ({ theme }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const m = Math.max(width, height);
  const t = frame / fps;
  const d1 = Math.sin(t * 0.55) * 0.035 * m;
  const d2 = Math.cos(t * 0.43) * 0.03 * m;
  const { bg, primary, accent } = theme.colors;
  return (
    <AbsoluteFill style={{ background: bg }}>
      <div
        style={{
          position: "absolute",
          width: m * 0.75,
          height: m * 0.75,
          borderRadius: "50%",
          top: -m * 0.28,
          left: -m * 0.18 + d1,
          filter: `blur(${m * 0.03}px)`,
          background: `radial-gradient(circle, ${alpha(primary, 0.2)}, transparent 62%)`,
        }}
      />
      <div
        style={{
          position: "absolute",
          width: m * 0.6,
          height: m * 0.6,
          borderRadius: "50%",
          bottom: -m * 0.26,
          right: -m * 0.16 - d2,
          filter: `blur(${m * 0.04}px)`,
          background: `radial-gradient(circle, ${alpha(accent, 0.14)}, transparent 65%)`,
        }}
      />
    </AbsoluteFill>
  );
};

/** Layer 4: colour grade above content, below grain. */
export const Grade: React.FC<{ theme: Theme }> = ({ theme }) => (
  <AbsoluteFill style={{ pointerEvents: "none" }}>
    <AbsoluteFill
      style={{ backgroundColor: theme.colors.primary, mixBlendMode: "soft-light", opacity: theme.dark ? 0.18 : 0.12 }}
    />
    <AbsoluteFill
      style={{ background: "linear-gradient(180deg, rgba(0,0,0,0.10), transparent 28%, transparent 72%, rgba(0,0,0,0.2))" }}
    />
  </AbsoluteFill>
);

/** Layer 5a: procedural grain with film flicker. */
export const Grain: React.FC<{ theme: Theme }> = ({ theme }) => {
  const frame = useCurrentFrame();
  const noise = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='220' height='220'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/%3E%3C/filter%3E%3Crect width='220' height='220' filter='url(%23n)' opacity='0.5'/%3E%3C/svg%3E")`;
  return (
    <AbsoluteFill
      style={{
        pointerEvents: "none",
        backgroundImage: noise,
        backgroundSize: "220px",
        backgroundPosition: `${(frame * 7) % 220}px ${(frame * 13) % 220}px`,
        opacity: 0.05,
        mixBlendMode: theme.dark ? "overlay" : "multiply",
      }}
    />
  );
};

/** Layer 5b: vignette, topmost. */
export const Vignette: React.FC = () => (
  <AbsoluteFill
    style={{
      pointerEvents: "none",
      background: "radial-gradient(ellipse at center, transparent 56%, rgba(0,0,0,0.22) 100%)",
    }}
  />
);
