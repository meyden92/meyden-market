import React from "react";
import type { Rect } from "./Highlight";

/** Camera over a w x h view: scale z, centred on (cx, cy) in view px. */
export type Cam = { z: number; cx: number; cy: number };

export const restCam = (w: number, h: number): Cam => ({ z: 1, cx: w / 2, cy: h / 2 });

/**
 * Camera that frames `rect` at about 80 % of the view, between 1 and `maxZoom`,
 * with the centre clamped so the view never shows past the edges of the content.
 */
export const zoomFor = (rect: Rect, w: number, h: number, maxZoom: number): Cam => {
  const z = Math.min(maxZoom, Math.max(1, Math.min((w * 0.8) / rect.w, (h * 0.8) / rect.h)));
  const clamp = (v: number, size: number) => Math.min(Math.max(v, size / (2 * z)), size - size / (2 * z));
  return { z, cx: clamp(rect.x + rect.w / 2, w), cy: clamp(rect.y + rect.h / 2, h) };
};

/** Linear blend of two cameras; pass an eased t. */
export const mixCam = (a: Cam, b: Cam, t: number): Cam => ({ z: a.z + (b.z - a.z) * t, cx: a.cx + (b.cx - a.cx) * t, cy: a.cy + (b.cy - a.cy) * t });

/** Maps a view point to the screen under a camera. */
export const toScreen = (cam: Cam, w: number, h: number, x: number, y: number) => ({ x: (x - cam.cx) * cam.z + w / 2, y: (y - cam.cy) * cam.z + h / 2 });

export const rectToScreen = (cam: Cam, w: number, h: number, r: Rect): Rect => {
  const p = toScreen(cam, w, h, r.x, r.y);
  return { x: p.x, y: p.y, w: r.w * cam.z, h: r.h * cam.z };
};

/** Content under a camera. Overlays are drawn outside it in screen space with toScreen, so they keep their size. */
export const ZoomLayer: React.FC<{ cam: Cam; w: number; h: number; children: React.ReactNode }> = ({ cam, w, h, children }) => (
  <div
    style={{
      position: "absolute",
      left: 0,
      top: 0,
      width: w,
      height: h,
      transformOrigin: "0 0",
      transform: `translate(${w / 2 - cam.cx * cam.z}px, ${h / 2 - cam.cy * cam.z}px) scale(${cam.z})`,
    }}
  >
    {children}
  </div>
);
