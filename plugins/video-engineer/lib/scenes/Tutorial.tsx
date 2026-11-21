import React from "react";
import { Audio, Sequence, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { Callout, ClickRipple, Cursor, Highlight, Reveal, StepBadge, ZoomLayer, mixCam, rectToScreen, restCam, toScreen, zoomFor } from "../motion";
import type { Cam, Rect, Theme } from "../motion";
import { SceneShell, Stage, stagePadding, surfaceStyle, useKit } from "./kit";
import { assetUrl, useSfxVolume } from "./SceneAudio";
import type { Box, CaptureData, Layout, Meta, Scene, TutorialInput, TutorialStyle, Word } from "./types";

/** One entry of scene.data.steps. `at` is seconds into the scene or a spoken word (n-th occurrence, default 1). */
export type Step = {
  at: number | { word: string; n?: number };
  action: "move" | "click" | "type" | "highlight" | "zoom" | "unzoom" | "callout" | "badge" | "clear";
  target?: string;
  text?: string;
};

const norm = (w: string) => w.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");

/** Seconds into the scene for a step. A word that is not spoken throws, so a typo fails the render instead of drifting. */
export const stepSec = (at: Step["at"], words: Word[] | undefined, sceneId: string) => {
  if (typeof at === "number") return at;
  const want = norm(at.word);
  const hits = (words ?? []).filter((w) => norm(w.text) === want);
  const hit = hits[(at.n ?? 1) - 1];
  if (!hit) throw new Error(`scene ${sceneId}: step word "${at.word}"${at.n ? ` #${at.n}` : ""} is not in the narration timing`);
  return hit.start;
};

export const stepsOf = (scene: Scene): Step[] => (Array.isArray(scene.data?.steps) ? (scene.data!.steps as Step[]) : []);

export type Timed = { frame: number; action: Step["action"]; target?: string; box?: Box; text?: string };

const SEC = { move: 0.6, zoom: 0.7, fade: 0.3, ripple: 0.4, typeCps: 14 };

/**
 * The tutorial layer over a captured screenshot or recording: camera zooms, cursor, clicks, typing,
 * highlights, callouts and step badges, timed to the narration.
 *
 * `w` x `h` is the size the media is drawn at; capture boxes are scaled from capture pixels to it.
 * `recorded` lists the move, click and type moments of a screencast (already in scene frames).
 */
export const TutorialStage: React.FC<{
  scene: Scene;
  theme: Theme;
  style: TutorialStyle;
  capture: CaptureData;
  input: TutorialInput | undefined;
  w: number;
  h: number;
  textPx: number;
  /** In tall and square layouts the camera follows every targeted step, because the capture is drawn small there. */
  follow: boolean;
  recorded?: Timed[];
  /** Box of a target at a frame; screencasts look up the recording first. */
  boxAt?: (target: string, frame: number) => Box | undefined;
  children: React.ReactNode;
}> = ({ scene, theme, style, capture, input, w, h, textPx, follow, recorded = [], boxAt, children }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const k = w / capture.width;
  const toView = (b: Box): Rect => ({ x: b.x * k, y: b.y * k, w: b.w * k, h: b.h * k });
  const box = (target: string, f: number) => {
    const b = boxAt?.(target, f) ?? capture.targets[target];
    if (!b) throw new Error(`scene ${scene.id}: no capture box for target "${target}"`);
    return b;
  };

  const timed: Timed[] = [
    ...stepsOf(scene).map((st) => {
      const f = Math.round(stepSec(st.at, input?.words, scene.id) * fps);
      return { frame: f, action: st.action, target: st.target, text: st.text, box: st.target ? box(st.target, f) : undefined };
    }),
    ...recorded,
  ].sort((a, b) => a.frame - b.frame);

  // Camera: each zoom or unzoom eases from the previous camera, starting a little before its word.
  const moves = (x: Timed) => x.action === "zoom" || x.action === "unzoom" || (follow && x.box !== undefined && x.action !== "badge");
  let cam: Cam = restCam(w, h);
  for (const t of timed.filter(moves)) {
    const start = t.frame - Math.round(0.25 * fps);
    if (frame < start) break;
    const to = t.action === "unzoom" ? restCam(w, h) : zoomFor(toView(t.box!), w, h, style.maxZoom);
    const p = interpolate(frame, [start, start + Math.round(SEC.zoom * fps)], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: theme.ease.inOut });
    cam = mixCam(cam, to, p);
  }
  const screenRect = (b: Box) => rectToScreen(cam, w, h, toView(b));

  // Cursor: travels to each move, click or type target and arrives on its frame.
  const pointer = timed.filter((x) => x.action === "move" || x.action === "click" || x.action === "type");
  let cursor: { x: number; y: number; opacity: number; press: number } | null = null;
  if (pointer.length) {
    const centre = (b: Box) => {
      const r = toView(b);
      return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
    };
    let pos = { x: w * 0.82, y: h * 0.86 };
    const appear = pointer[0].frame - Math.round((SEC.move + SEC.fade) * fps);
    let prevArrive = appear;
    for (const t of pointer) {
      const to = centre(t.box!);
      const leave = Math.max(prevArrive, t.frame - Math.round(SEC.move * fps));
      if (frame < leave) break;
      const p = interpolate(frame, [leave, t.frame], [0, 1], { extrapolateRight: "clamp", easing: theme.ease.inOut });
      pos = { x: pos.x + (to.x - pos.x) * p, y: pos.y + (to.y - pos.y) * p };
      prevArrive = t.frame;
    }
    const s = toScreen(cam, w, h, pos.x, pos.y);
    const lastClick = [...pointer].reverse().find((t) => t.action === "click" && t.frame <= frame);
    const press = lastClick ? interpolate(frame - lastClick.frame, [0, 3, 8], [1, 1, 0], { extrapolateRight: "clamp" }) : 0;
    cursor = { ...s, opacity: interpolate(frame, [appear, appear + Math.round(SEC.fade * fps)], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }), press };
  }

  // Highlight and callout: each lasts until the next one of its kind or a clear.
  const span = (kind: Step["action"]) =>
    timed
      .filter((t) => t.action === kind)
      .map((t) => {
        const end = timed.find((n) => n.frame > t.frame && (n.action === kind || n.action === "clear"))?.frame ?? durationInFrames + Math.round(SEC.fade * fps);
        return { ...t, end };
      });
  const fade = (start: number, end: number) =>
    Math.min(
      interpolate(frame, [start, start + Math.round(SEC.fade * fps)], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
      interpolate(frame, [end - Math.round(SEC.fade * fps), end], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
    );
  const pad = textPx * 0.4;
  const cursorSize = textPx * 1.2;
  const clicks = timed.filter((t) => t.action === "click");
  const sfxVolume = useSfxVolume();
  // Typed text is drawn for screenshot steps only; a recording already shows it.
  const typing = timed.filter((t) => t.action === "type" && t.text !== undefined && !recorded.includes(t));
  const typeFrames = (text: string | undefined) => Math.max(1, Math.round((text === undefined ? 1.5 : text.length / SEC.typeCps) * fps));

  return (
    <>
      <ZoomLayer cam={cam} w={w} h={h}>
        {children}
      </ZoomLayer>
      {span("highlight").map((t) => (
        <Highlight key={`h${t.frame}`} theme={theme} kind={style.highlight} rect={screenRect(t.box!)} pad={pad} progress={fade(t.frame, t.end)} />
      ))}
      {typing.map((t) => {
        const r = screenRect(t.box!);
        const n = Math.floor(interpolate(frame, [t.frame, t.frame + typeFrames(t.text!)], [0, t.text!.length], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }));
        if (frame < t.frame) return null;
        const caret = Math.floor((frame / fps) * 2) % 2 === 0;
        // Drawn in the input's own font size, colour and background, so it covers the placeholder and reads as the app.
        const look = capture.styles[t.target!];
        if (!look) throw new Error(`scene ${scene.id}: no text style captured for target "${t.target}"; run the capture stage again`);
        const inset = Math.max(2, r.h * 0.06);
        return (
          <div
            key={`t${t.frame}`}
            style={{
              position: "absolute",
              left: r.x + inset,
              top: r.y + inset,
              width: r.w - inset * 2,
              height: r.h - inset * 2,
              boxSizing: "border-box",
              paddingLeft: r.h * 0.22,
              display: "flex",
              alignItems: "center",
              overflow: "hidden",
              borderRadius: inset * 2,
              backgroundColor: look.background,
              color: look.color,
              fontSize: look.fontPx * k * cam.z,
              whiteSpace: "pre",
            }}
          >
            {t.text!.slice(0, n)}
            <span style={{ opacity: caret ? 1 : 0 }}>|</span>
          </div>
        );
      })}
      {timed
        .filter((t) => t.action === "badge")
        .map((t, i) => (
          <StepBadge
            key={`b${t.frame}`}
            theme={theme}
            n={i + 1}
            rect={screenRect(t.box!)}
            size={textPx}
            progress={interpolate(frame, [t.frame, t.frame + Math.round(SEC.fade * fps)], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: theme.ease.out })}
          />
        ))}
      {span("callout").map((t) => (
        <Callout key={`c${t.frame}`} theme={theme} text={t.text ?? ""} rect={screenRect(t.box!)} bounds={{ w, h }} size={textPx} progress={fade(t.frame, t.end)} />
      ))}
      {clicks.map((t) => {
        const r = screenRect(t.box!);
        return (
          <ClickRipple
            key={`r${t.frame}`}
            theme={theme}
            x={r.x + r.w / 2}
            y={r.y + r.h / 2}
            size={cursorSize * 1.6}
            progress={interpolate(frame, [t.frame, t.frame + Math.round(SEC.ripple * fps)], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })}
          />
        );
      })}
      {cursor && <Cursor theme={theme} kind={style.cursor} x={cursor.x} y={cursor.y} size={cursorSize} opacity={cursor.opacity} press={cursor.press} />}
      {input?.sfx?.click &&
        clicks.map((t) => (
          <Sequence key={`sc${t.frame}`} from={t.frame} layout="none">
            <Audio src={assetUrl(input.sfx!.click!)} volume={sfxVolume} />
          </Sequence>
        ))}
      {input?.sfx?.type &&
        timed
          .filter((t) => t.action === "type")
          .map((t) => (
            <Sequence key={`st${t.frame}`} from={t.frame} durationInFrames={typeFrames(t.text)} layout="none">
              <Audio src={assetUrl(input.sfx!.type!)} volume={sfxVolume} />
            </Sequence>
          ))}
    </>
  );
};

/** Size of a captured screen fitted into `avail` (the stage minus address bar and on-screen line), keeping its aspect ratio. */
export const fitCapture = (capture: CaptureData, avail: { w: number; h: number }) => {
  const k = Math.min(avail.w / capture.width, avail.h / capture.height);
  return { w: Math.round(capture.width * k), h: Math.round(capture.height * k) };
};

/**
 * Base layout of a tutorial scene: the capture in a framed surface with an optional address bar,
 * the tutorial layer over it, and the on-screen line below. Used by screenshot (with steps) and screencast.
 */
export const TutorialScene: React.FC<{
  scene: Scene;
  meta: Meta;
  layout: Layout;
  input: TutorialInput | undefined;
  url?: string;
  recorded?: Timed[];
  boxAt?: (target: string, frame: number) => Box | undefined;
  media: React.ReactNode;
}> = ({ scene, meta, layout, input, url, recorded, boxAt, media }) => {
  const { theme, type, width, height } = useKit(meta, layout);
  const capture = input?.capture;
  if (!capture) throw new Error(`scene ${scene.id}: no capture data; run the capture stage and gen-index`);
  if (!meta.style.tutorial) throw new Error(`scene ${scene.id}: meta.style.tutorial is not set`);
  const p = stagePadding(layout, width, height, scene.captions);
  const gap = Math.round(type.small * 0.7);
  const barPx = url ? Math.round(theme.minTextPx * 1.3 + type.small * 0.7 + 2) : 0;
  const linePx = scene.onScreen ? Math.round(type.body * 1.4) + gap : 0;
  const { w, h } = fitCapture(capture, { w: width - p.left - p.right, h: height - p.top - p.bottom - barPx - linePx });
  return (
    <SceneShell scene={scene} theme={theme}>
      <Stage scene={scene} layout={layout} gap={gap}>
        <Reveal theme={theme} from="pop" style={{ ...surfaceStyle(theme, 24), overflow: "hidden", width: w, display: "flex", flexDirection: "column" }}>
          {url && (
            <div style={{ height: barPx, boxSizing: "border-box", fontSize: theme.minTextPx, padding: `${type.small * 0.35}px ${type.small}px`, color: theme.colors.textDim, borderBottom: `2px solid ${theme.colors.line}`, fontFamily: theme.fonts.mono }}>
              {url}
            </div>
          )}
          <div style={{ position: "relative", width: w, height: h, overflow: "hidden", backgroundColor: theme.colors.bgAlt }}>
            <TutorialStage scene={scene} theme={theme} style={meta.style.tutorial} capture={capture} input={input} w={w} h={h} textPx={type.small} follow={layout !== "wide"} recorded={recorded} boxAt={boxAt}>
              {media}
            </TutorialStage>
          </div>
        </Reveal>
        {scene.onScreen && (
          <Reveal theme={theme} index={2}>
            <div style={{ fontSize: type.body, fontWeight: 600, textAlign: "center" }}>{scene.onScreen}</div>
          </Reveal>
        )}
      </Stage>
    </SceneShell>
  );
};
