// The Look contract: one visual style for a whole music video (plates, refrain type, post stack, screen pass, 2D overlay).
import type React from "react";
import type * as THREE from "three";
import type { PostProps } from "../three";

export type Palette = { ink: string; paper: string; accent: string; pop: string };
export type Uniform = number | [number, number] | [number, number, number];
/** Text3D materials: `front` faces, `side` (sides and bevel), optional `outline` (inverted hull drawn behind each letter). */
export type RefrainMaterials = { front: THREE.Material; side: THREE.Material; outline?: THREE.Material };

export type Look = {
  id: string;
  label: string;
  /** What the frame looks like, one sentence. */
  summary: string;
  /** How to prompt plate art for this look (the shader adds the treatment; the art stays plain). */
  art: string;
  /** Suggested palette when the project has none yet. */
  palette: Palette;
  /** Default of meta.style.effects for the critic: "allowed" when the look glows, blooms or splits colour on purpose. */
  effects: "restrained" | "allowed";
  /** Rows of the look's screen (dots, pixels, lines, glyphs) across the plate height. */
  density: number;
  /** Width / height of one screen cell. Default 1. */
  cellAspect?: number;
  /** GLSL defining `vec4 plate(vec2 uv)`: linear rgb and coverage alpha. Uses PLATE_PRELUDE helpers and `params`. */
  plate: string;
  /** Look-specific plate uniforms with defaults (float, vec2, vec3); a Plate overrides them with `params`. */
  params?: Record<string, Uniform>;
  /** Extra sampler2D uniforms for the plate shader, created once. */
  textures?: () => Record<string, THREE.Texture>;
  /** Refrain type materials in the project palette. */
  refrain: (p: Palette) => RefrainMaterials;
  /** Post stack defaults; a ShotCanvas `post` prop overrides single values. */
  post: PostProps;
  /** GLSL `void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor)` run over the whole 3D frame. */
  screen?: string;
  screenParams?: Record<string, Uniform>;
  /** Give reflective materials a palette-coloured studio environment. */
  environment?: boolean;
  /** 2D layer drawn over the lyrics (scanlines, paper, grain). Deterministic in `frame`. */
  overlay?: React.FC<{ frame: number; palette: Palette; width: number; height: number }>;
  /** CSS text-shadow for free lyric text, or a function of the palette that returns one. */
  lyricShadow: string | ((p: Palette) => string);
};
