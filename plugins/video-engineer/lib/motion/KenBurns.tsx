// upstream: haidrrrry/claude-remotion-skill remotion-motion-graphics/references/motion-patterns.md (section 8) @ 1dcbe5e3fc6cf970bd10d3cc05f0a8a5d19d0383 (MIT) — changes: component takes a src or children, zoom direction and pan from motion.camera, pan scaled to the canvas, theme prop, asset path via staticFile with the public/ prefix stripped, a camera other than kenburns-in or kenburns-out holds still
import React from "react";
import { Img, interpolate, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import type { Theme } from "./theme";

export type Camera = "in" | "out" | "none";

/** Maps a scene's motion.camera string to a Camera: "kenburns-in", "kenburns-out", anything else (none, custom) holds still. */
export const cameraFrom = (camera: string): Camera => (camera === "kenburns-in" ? "in" : camera === "kenburns-out" ? "out" : "none");

/** Slow scale and pan over the whole scene, when the scene's camera asks for it. Wraps a src image or any children. */
export const KenBurns: React.FC<{
  theme: Theme;
  src?: string;
  camera?: Camera;
  /** Final scale (zoom in) or start scale (zoom out). */
  zoom?: number;
  fit?: "cover" | "contain";
  children?: React.ReactNode;
  style?: React.CSSProperties;
}> = ({ theme, src, camera = "in", zoom = 1.08, fit = "cover", children, style }) => {
  const frame = useCurrentFrame();
  const { durationInFrames, width } = useVideoConfig();
  const [from, to] = camera === "out" ? [zoom, 1] : camera === "in" ? [1, zoom] : [1, 1];
  const o = { easing: theme.ease.inOut } as const;
  const scale = interpolate(frame, [0, durationInFrames], [from, to], o);
  const pan = interpolate(frame, [0, durationInFrames], camera === "none" ? [0, 0] : [0, -0.013 * width], o);
  return (
    <div style={{ position: "absolute", inset: 0, transform: `scale(${scale}) translateX(${pan}px)`, ...style }}>
      {src ? (
        <Img src={staticFile(src.replace(/^public\//, ""))} style={{ width: "100%", height: "100%", objectFit: fit }} />
      ) : (
        children
      )}
    </div>
  );
};
