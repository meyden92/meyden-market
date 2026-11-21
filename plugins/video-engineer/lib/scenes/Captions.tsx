import React from "react";
import type { Caption as CaptionData } from "@remotion/captions";
import { Caption } from "../motion";
import { useKit } from "./kit";
import type { Layout, Meta, Scene } from "./types";

/** Burned-in captions for one scene. Renders nothing unless scene.captions is true and caption data exists. */
export const SceneCaptions: React.FC<{ scene: Scene; meta: Meta; layout: Layout; captions?: CaptionData[] }> = ({
  scene,
  meta,
  layout,
  captions,
}) => {
  const { theme } = useKit(meta, layout);
  if (!scene.captions || !captions || captions.length === 0) return null;
  return <Caption theme={theme} layout={layout} captions={captions} />;
};
