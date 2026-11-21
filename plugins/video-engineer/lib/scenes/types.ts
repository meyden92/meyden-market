export type Layout = "wide" | "tall" | "square";

export type VisualType =
  | "title" | "illustration" | "layered" | "diagram" | "counter" | "list"
  | "code" | "terminal" | "screenshot" | "screencast" | "comparison" | "quote" | "cta" | "custom";

/** The treatment chosen in the interview (BRIEF.md Direction); signature is the scene id of the signature moment. */
/** madeOf: the sources the frames come from (captures, rebuilt UI, generated images, code-drawn diagrams and type, 3D). */
export type Direction = { name: string; idea: string; world: string; madeOf?: string; device: string; form: string; motion: string; signature: string };

export type Asset = {
  file: string;
  layer: "background" | "subject" | "overlay" | "screenshot" | "screencast";
  prompt: string;
  /** Largest magnification the video applies to the image (1 to 2, default 1); sets the size rule (asset-contract). */
  scale?: number;
  status: "pending" | "delivered" | "valid" | "invalid";
};

export type Scene = {
  id: string;
  section: string;
  narration: string;
  /** Delivery direction for this scene only (SCRIPT.md `Voice:`); overrides meta.voice.style. */
  voiceStyle?: string;
  onScreen: string;
  visualType: VisualType;
  motion: { entrance: string; camera: string; transitionIn: string };
  assets: Asset[];
  audio: { file: string; durationSec: number | null };
  sfx: { at: number; prompt: string; file: string }[];
  /** Optional structured content for list, counter, code, terminal, comparison, diagram, quote and cta scenes. Keys are documented in the scene-manifest skill. */
  data?: Record<string, unknown>;
  /** App capture for screenshot and screencast scenes, from the SCRIPT.md `Capture:` line. Run by capture.mjs. */
  capture?: Capture;
  captions: boolean;
  hash: string;
  qa: { score: number | null; issues: string[] };
};

export type Meta = {
  title: string;
  lang: string;
  width: number;
  height: number;
  fps: number;
  tailFrames?: number;
  targetSec: [number, number];
  direction?: Direction;
  /** font: body family; displayFont: headline family (default font); ground: "plain" (default) or "mesh" (gradient mesh, grade, grain, vignette); effects: "allowed" when glow, bloom or colour split belong to the treatment. */
  style: { sheet: string; palette: string[]; font: string; displayFont?: string; minTextPx: number; ground?: "plain" | "mesh"; effects?: "restrained" | "allowed"; tutorial?: TutorialStyle };
  /** model: fal endpoint id or ElevenLabs model id; style: delivery direction; wpm: measured words per minute (audio.mjs pace). */
  voice: { provider: "fal" | "elevenlabs-mcp"; model: string; voice: string; style: string; settings?: Record<string, unknown>; wpm?: number };
  /** sfxVolume: volume of every sound effect, 0 to 1 (default 0.15). */
  sound: { musicPrompt: string; musicDuck: number; sfxDensity: "none" | "cuts" | "rich"; sfxVolume?: number };
  cuts: ("9:16" | "1:1")[];
};

export type Manifest = { meta: Meta; scenes: Scene[] };

/** Look of the tutorial overlays, chosen from stills in the interview. */
export type TutorialStyle = { cursor: "arrow" | "dot"; highlight: "spotlight" | "outline"; maxZoom: number };

/** One browser action run by capture.mjs. Exactly one action key per step. */
export type CaptureStep = {
  goto?: string;
  click?: string;
  fill?: string;
  value?: string | { env: string } | { file: string; match: string };
  type?: string;
  text?: string;
  hover?: string;
  press?: string;
  scroll?: string;
  wait?: number | string;
  /** Names the element the action acted on; its box is recorded as a target. */
  as?: string;
};

export type Capture = {
  /** Asset name: public/img/<id>-<shot>.png, or public/video/<id>-<shot>.webm when record is true. */
  shot: string;
  record: boolean;
  steps: CaptureStep[];
  /** Target name to selector; boxes are measured after the last step. */
  targets: Record<string, string>;
};

export type Box = { x: number; y: number; w: number; h: number };

/** public/capture/<id>.json, written by capture.mjs. Boxes are in pixels of the captured image or video. */
export type CaptureData = {
  width: number;
  height: number;
  /** Screencast only: seconds of the recording before the first step, and its length after that point. */
  startSec?: number;
  durationSec?: number;
  targets: Record<string, Box>;
  /** Text style of each target, so typed text drawn over a screenshot matches the app. fontPx is in capture pixels. */
  styles: Record<string, { fontPx: number; color: string; background: string }>;
  /** Screencast only: what the recorded steps did, in seconds from startSec. */
  events: { t: number; action: "move" | "click" | "type"; target: string; box: Box; text?: string }[];
};

/** Spoken word timing from the voice stage (public/audio/<id>.words.json), seconds from scene start. */
export type Word = { text: string; start: number; end: number };

/** Per-scene inputs for the tutorial overlays, passed by the generated index. */
export type TutorialInput = {
  words?: Word[];
  capture?: CaptureData;
  /** UI sound files from the sound stage; absent when they were not generated. */
  sfx?: { click?: string; type?: string };
};

export type SceneProps = { scene: Scene; meta: Meta; layout: Layout; tutorial?: TutorialInput };
