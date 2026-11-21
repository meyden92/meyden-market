// Look registry. A project picks one look in defineMusic({ look }), from the built-in LOOKS or its own defineMusic({ looks });
// LookScope overrides look and palette for a subtree. Plate, ShotCanvas, useRefrainMaterials, LookOverlay, PosterWord and the lyric layer follow the scope.
import React, { createContext, useContext, useMemo } from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { music } from "../config";
import type { Look, Palette } from "./types";
import { ascii } from "./ascii";
import { blueprint } from "./blueprint";
import { cel } from "./cel";
import { chrome } from "./chrome";
import { comic } from "./comic";
import { duotone } from "./duotone";
import { engraving } from "./engraving";
import { film } from "./film";
import { linocut } from "./linocut";
import { neon } from "./neon";
import { paper } from "./paper";
import { pixel } from "./pixel";
import { plain } from "./plain";
import { riso } from "./riso";
import { vhs } from "./vhs";
import { watercolor } from "./watercolor";

export const LOOKS = { plain, riso, film, pixel, cel, neon, chrome, vhs, linocut, engraving, blueprint, ascii, paper, watercolor, comic, duotone } satisfies Record<string, Look>;
/** A built-in look id or the key of a project look in defineMusic({ looks }). */
export type LookId = keyof typeof LOOKS | (string & {});

/** The look registered under `id`: the project's own looks first, then the built-in ones. */
export const getLook = (id: LookId): Look => {
  const look = music().looks?.[id] ?? (LOOKS as Record<string, Look>)[id];
  if (!look) throw new Error(`lib/music: unknown look "${id}"; built-in: ${Object.keys(LOOKS).join(", ")}; project: ${Object.keys(music().looks ?? {}).join(", ") || "none"}`);
  return look;
};

const LookContext = createContext<{ look: LookId; palette?: Palette } | null>(null);
/** Renders its subtree in another look, and optionally another palette, than the project's. */
export const LookScope: React.FC<{ look: LookId; palette?: Palette; children: React.ReactNode }> = ({ look, palette, children }) =>
  React.createElement(LookContext.Provider, { value: { look, palette } }, children);
/** The look in effect here: LookScope, else defineMusic({ look }), else plain. */
export const useLook = (): Look => getLook(useContext(LookContext)?.look ?? music().look ?? "plain");
/** The palette in effect here: LookScope, else defineMusic({ palette }). */
export const usePalette = (): Palette => useContext(LookContext)?.palette ?? music().palette;

/** CSS text-shadow for free lyric text in the current look and palette. */
export const useLyricShadow = () => {
  const look = useLook();
  const palette = usePalette();
  return typeof look.lyricShadow === "function" ? look.lyricShadow(palette) : look.lyricShadow;
};

/** Refrain materials of the current look (`front`, `side`, optional `outline`), for Text3D. */
export const useRefrainMaterials = () => {
  const look = useLook();
  const palette = usePalette();
  return useMemo(() => look.refrain(palette), [look, palette]);
};

/** The look's 2D layer (scanlines, paper, grain). Place it last, above the lyric layer. */
export const LookOverlay: React.FC = () => {
  const look = useLook();
  const frame = useCurrentFrame();
  const palette = usePalette();
  const { width, height } = music();
  if (!look.overlay) return null;
  return React.createElement(AbsoluteFill, { style: { pointerEvents: "none" } }, React.createElement(look.overlay, { frame, palette, width, height }));
};

export { SOFT_SHADOW } from "./shadow";
export type { Look, Palette, RefrainMaterials, Uniform } from "./types";
export { outlineMaterial, paletteEnvTexture, paletteUniforms, shadedMaterial } from "./materials";
