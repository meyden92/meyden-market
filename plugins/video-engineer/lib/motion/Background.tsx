import React from "react";
import { AbsoluteFill } from "remotion";
import { BgMesh, Grade, Grain, Vignette } from "./Layers";
import type { Theme } from "./theme";

/**
 * Bottom to top: mesh, assets, graphics, grade, grain and vignette when theme.ground is "mesh"; assets and graphics
 * alone on the background colour when it is "plain". `assets` holds images and footage, `children` holds type and drawn graphics.
 */
export const Background: React.FC<{ theme: Theme; assets?: React.ReactNode; children?: React.ReactNode }> = ({
  theme,
  assets,
  children,
}) => (
  <AbsoluteFill>
    {theme.ground === "mesh" && <BgMesh theme={theme} />}
    {assets}
    {children}
    {theme.ground === "mesh" && (
      <>
        <Grade theme={theme} />
        <Grain theme={theme} />
        <Vignette />
      </>
    )}
  </AbsoluteFill>
);
