import type React from "react";
import { Code } from "./Code";
import { Comparison } from "./Comparison";
import { Counter } from "./Counter";
import { Cta } from "./Cta";
import { Diagram } from "./Diagram";
import { Illustration } from "./Illustration";
import { Layered } from "./Layered";
import { List } from "./List";
import { Quote } from "./Quote";
import { Screencast } from "./Screencast";
import { Screenshot } from "./Screenshot";
import { Terminal } from "./Terminal";
import { Title } from "./Title";
import type { SceneProps, VisualType } from "./types";

export { SceneCaptions } from "./Captions";
export { SfxVolume } from "./SceneAudio";
export { TutorialProbe } from "./TutorialProbe";
export type { CaptureData, Direction, Layout, Manifest, Meta, Scene, SceneProps, TutorialInput, VisualType, Word } from "./types";

/** One base component per visualType; a `custom` scene has none and is always written for its video. */
export const baseScenes: Record<Exclude<VisualType, "custom">, React.FC<SceneProps>> = {
  title: Title,
  illustration: Illustration,
  layered: Layered,
  diagram: Diagram,
  counter: Counter,
  list: List,
  code: Code,
  terminal: Terminal,
  screenshot: Screenshot,
  screencast: Screencast,
  comparison: Comparison,
  quote: Quote,
  cta: Cta,
};
