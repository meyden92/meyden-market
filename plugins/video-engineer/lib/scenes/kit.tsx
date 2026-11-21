import React, { useMemo } from "react";
import { AbsoluteFill, Img, staticFile, useVideoConfig } from "remotion";
import { Background, Exit, KenBurns, alpha, cameraFrom, makeTheme } from "../motion";
import type { Theme, TypeScale } from "../motion";
import { TransitionIn } from "../transitions";
import { SceneAudio, assetUrl } from "./SceneAudio";
import type { Asset, Layout, Meta, Scene } from "./types";

export const useKit = (meta: Meta, layout: Layout) => {
  const { width, height, fps } = useVideoConfig();
  const theme = useMemo(() => makeTheme(meta.style), [meta.style]);
  const type = theme.type(layout, width);
  return { theme, type, width, height, fps };
};

/** Content padding in px. Reserves room for burned-in captions where they sit in each layout. */
export const stagePadding = (layout: Layout, width: number, height: number, captions: boolean) => {
  const [top, bottom, x] =
    layout === "wide"
      ? [0.09, captions ? 0.24 : 0.09, 0.08]
      : layout === "tall"
        ? [0.11, captions ? 0.4 : 0.14, 0.07]
        : [0.08, captions ? 0.26 : 0.08, 0.08];
  return { top: top * height, bottom: bottom * height, left: x * width, right: x * width };
};

/** Content area. Centres its children; `gap` is in px (never em next to large type). */
export const Stage: React.FC<{
  scene: Scene;
  layout: Layout;
  gap?: number;
  align?: "center" | "stretch" | "start";
  direction?: "column" | "row";
  children: React.ReactNode;
}> = ({ scene, layout, gap = 0, align = "center", direction = "column", children }) => {
  const { width, height } = useVideoConfig();
  const p = stagePadding(layout, width, height, scene.captions);
  return (
    <AbsoluteFill
      style={{
        padding: `${p.top}px ${p.right}px ${p.bottom}px ${p.left}px`,
        display: "flex",
        flexDirection: direction,
        justifyContent: "center",
        alignItems: align === "start" ? "flex-start" : align,
        gap,
      }}
    >
      {children}
    </AbsoluteFill>
  );
};

/** Picks the first size from `sizes` (largest first) whose estimated line count fits `maxLines`. */
export const fitSize = (text: string, sizes: number[], boxWidth: number, maxLines: number) => {
  for (const s of sizes) {
    const perLine = Math.max(1, Math.floor(boxWidth / (s * 0.52)));
    const wrapped = text.split("\n").reduce((n, l) => n + Math.max(1, Math.ceil(l.length / perLine)), 0);
    if (wrapped <= maxLines) return s;
  }
  return sizes[sizes.length - 1];
};

export const assetsOf = (scene: Scene, layer: Asset["layer"]) => scene.assets.filter((a) => a.layer === layer);

/** Background-layer images (Ken Burns only when the scene's camera asks for it), plus a scrim so text on top stays legible. */
export const BackgroundImages: React.FC<{ scene: Scene; theme: Theme; scrim?: number }> = ({ scene, theme, scrim = 0 }) => {
  const bg = assetsOf(scene, "background");
  if (bg.length === 0) return null;
  return (
    <>
      {bg.map((a) => (
        <KenBurns key={a.file} theme={theme} src={a.file} camera={cameraFrom(scene.motion.camera)} />
      ))}
      {scrim > 0 && <AbsoluteFill style={{ backgroundColor: alpha(theme.colors.bg, scrim) }} />}
    </>
  );
};

export const OverlayImages: React.FC<{ scene: Scene }> = ({ scene }) => (
  <>
    {assetsOf(scene, "overlay").map((a) => (
      <Img key={a.file} src={staticFile(a.file.replace(/^public\//, ""))} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
    ))}
  </>
);

export { assetUrl };

/**
 * Frame shared by every base scene: in-scene transition, background (plain or mesh, meta.style.ground), content with exit,
 * narration and sfx outside the transition.
 */
export const SceneShell: React.FC<{
  scene: Scene;
  theme: Theme;
  assets?: React.ReactNode;
  children: React.ReactNode;
}> = ({ scene, theme, assets, children }) => (
  <AbsoluteFill style={{ backgroundColor: theme.colors.bg, fontFamily: theme.fonts.body, color: theme.colors.text }}>
    <TransitionIn name={scene.motion.transitionIn} background={theme.colors.bg}>
      <Background theme={theme} assets={assets}>
        <Exit theme={theme}>{children}</Exit>
      </Background>
    </TransitionIn>
    <SceneAudio scene={scene} />
  </AbsoluteFill>
);

/** Rounded surface used by cards, code blocks and terminals. Shadow is neutral black, never coloured. */
export const surfaceStyle = (theme: Theme, radius: number): React.CSSProperties => ({
  backgroundColor: theme.colors.surface,
  border: `2px solid ${theme.colors.line}`,
  borderRadius: radius,
  boxShadow: "0 30px 60px -24px rgba(0,0,0,0.55)",
});

export type { TypeScale };
