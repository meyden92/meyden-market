// plain: no treatment. Plates print the image as it is, refrain type is lit by the scene, no post stack, screen pass or overlay.
// The default look: the video's world comes from its treatment and its own pieces, not from a filter.
import * as THREE from "three";
import { SOFT_SHADOW } from "./shadow";
import type { Look } from "./types";

const plate = /* glsl */ `
vec4 plate(vec2 uv) {
  return vec4(tex(uv).rgb * gain, 1.0);
}`;

export const plain: Look = {
  id: "plain",
  label: "Plain",
  summary: "No treatment: images, 3D and type appear as the video's own pieces make them.",
  art: "Art made in the treatment's own world and medium; the plate prints it unchanged.",
  palette: { ink: "#101010", paper: "#F4F1EA", accent: "#D9482B", pop: "#2B6CD9" },
  effects: "restrained",
  density: 600,
  plate,
  refrain: (p) => ({
    front: new THREE.MeshStandardMaterial({ color: p.paper, roughness: 0.6 }),
    side: new THREE.MeshStandardMaterial({ color: p.ink, roughness: 0.8 }),
  }),
  post: { bloom: 0, bloomThreshold: 1, ca: 0, noise: 0, vignette: 0 },
  lyricShadow: SOFT_SHADOW,
};
