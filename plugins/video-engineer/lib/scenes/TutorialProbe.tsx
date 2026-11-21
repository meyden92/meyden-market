import React, { useMemo } from "react";
import { AbsoluteFill, Img, useVideoConfig } from "remotion";
import { makeTheme } from "../motion";
import type { Style } from "../motion";
import { assetUrl } from "./SceneAudio";
import { TutorialStage, fitCapture } from "./Tutorial";
import type { CaptureData, Scene, TutorialStyle } from "./types";

/**
 * The tutorial-probe composition: the app's start page (capture.mjs --probe) with one click, highlight,
 * callout and zoom, so the interview can show tutorial styles as stills. Render frame 80 per style with --props.
 */
export const TutorialProbe: React.FC<{ capture: CaptureData; image: string; style: Omit<Style, "sheet"> & { tutorial: TutorialStyle } }> = ({ capture, image, style }) => {
  const { width, height } = useVideoConfig();
  const theme = useMemo(() => makeTheme({ ...style, sheet: "" }), [style]);
  const type = theme.type("wide", width);
  const { w, h } = fitCapture(capture, { w: width * 0.84, h: height * 0.84 });
  const [first, second] = Object.keys(capture.targets);
  const steps = [
    ...(second ? [{ at: 0.5, action: "badge", target: second }] : []),
    { at: 0.9, action: "click", target: first },
    { at: 1.2, action: "highlight", target: first },
    { at: 1.5, action: "callout", target: first, text: "Start here" },
    { at: 1.8, action: "zoom", target: first },
  ];
  const scene = { id: "probe", data: { steps } } as unknown as Scene;
  return (
    <AbsoluteFill style={{ backgroundColor: theme.colors.bg, fontFamily: theme.fonts.body, alignItems: "center", justifyContent: "center" }}>
      <div style={{ position: "relative", width: w, height: h, overflow: "hidden", borderRadius: 24, border: `2px solid ${theme.colors.line}` }}>
        <TutorialStage scene={scene} theme={theme} style={style.tutorial} capture={capture} input={undefined} w={w} h={h} textPx={type.small} follow={false}>
          <Img src={assetUrl(image)} style={{ width: "100%", height: "100%", display: "block" }} />
        </TutorialStage>
      </div>
    </AbsoluteFill>
  );
};
