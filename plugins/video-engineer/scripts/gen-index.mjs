#!/usr/bin/env node
// Writes src/videos/<slug>/index.tsx for every videos/*/scenes.json and src/Root.tsx.
// Music videos (videos/*/blocks.json with src/videos/<slug>/Compositions.tsx) are added to Root.tsx as they are, one at a
// time (the slug argument, else the latest); their folders are never read as narrated videos, even with a scenes.json.
// public/capture/probe.json (capture.mjs --probe) adds the tutorial-probe composition for the interview's style stills.
// Style frames: every src/videos/<slug>/frames/<name>.tsx exporting `Frame`, `width` and `height` (optional `fps`,
// `durationInFrames`) becomes the composition <slug>-frame-<name>, for direction stills and motion tests before a video
// has scenes.
// Run with cwd = the Remotion project root. Usage: gen-index.mjs [<slug>]
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const fail = (msg) => {
  console.error(`gen-index: ${msg}`);
  process.exit(1);
};

if (!existsSync("videos")) fail("no videos/ directory; run from the Remotion project root");
const slugs = readdirSync("videos", { withFileTypes: true })
  .filter((d) => d.isDirectory() && existsSync(join("videos", d.name, "scenes.json")) && !existsSync(join("videos", d.name, "blocks.json")))
  .map((d) => d.name)
  .sort();
// lib/music holds one global defineMusic() config, so only one music video can be registered at a time:
// the slug argument when it is a music video, else the one whose blocks.json changed last.
const allMusic = readdirSync("videos", { withFileTypes: true })
  .filter((d) => d.isDirectory() && existsSync(join("videos", d.name, "blocks.json")) && existsSync(join("src", "videos", d.name, "Compositions.tsx")))
  .map((d) => d.name)
  .sort((x, y) => statSync(join("videos", y, "blocks.json")).mtimeMs - statSync(join("videos", x, "blocks.json")).mtimeMs);
const wanted = process.argv[2];
const musicSlugs = allMusic.includes(wanted) ? [wanted] : allMusic.slice(0, 1);
const musicLeftOut = allMusic.filter((m) => !musicSlugs.includes(m));
const probe = existsSync(join("public", "capture", "probe.json"));
const styleFrames = existsSync(join("src", "videos"))
  ? readdirSync(join("src", "videos"), { withFileTypes: true })
      .filter((d) => d.isDirectory() && existsSync(join("src", "videos", d.name, "frames")))
      .flatMap((d) =>
        readdirSync(join("src", "videos", d.name, "frames"))
          .filter((f) => /^[A-Za-z0-9-]+\.tsx$/.test(f))
          .sort()
          .map((f) => ({ slug: d.name, name: f.replace(/\.tsx$/, "") })),
      )
  : [];
if (slugs.length === 0 && musicSlugs.length === 0 && !probe && styleFrames.length === 0) fail("no videos/*/scenes.json, music video or tutorial probe found");

const cap = (id) => id[0].toUpperCase() + id.slice(1);
const manifests = {};

for (const slug of slugs) {
  const manifest = JSON.parse(readFileSync(join("videos", slug, "scenes.json"), "utf8"));
  manifests[slug] = manifest;
  const missing = manifest.scenes.filter((s) => s.audio.durationSec == null);
  if (missing.length) fail(`${slug}: audio.durationSec is null for ${missing.map((s) => s.id).join(", ")}; run the voice stage first`);

  const custom = manifest.scenes.filter((s) => existsSync(join("src", "videos", slug, "scenes", `${cap(s.id)}.tsx`)));
  const unbuilt = manifest.scenes.filter((s) => s.visualType === "custom" && !custom.includes(s)).map((s) => `src/videos/${slug}/scenes/${cap(s.id)}.tsx`);
  if (unbuilt.length) fail(`${slug}: custom scenes have no component yet: ${unbuilt.join(", ")}; write them in the build stage`);
  const themeImport = existsSync(join("src", "videos", slug, "theme.ts")) ? 'import "./theme";' : "";
  const withCaptions = manifest.scenes.filter((s) => s.captions && existsSync(join("videos", slug, "captions", `${s.id}.json`)));
  const captionImports = withCaptions.map((s) => `import captions_${s.id} from "../../../videos/${slug}/captions/${s.id}.json";`).join("\n");
  const ownCaptions = existsSync(join("src", "videos", slug, "Captions.tsx"));
  const captionsFor = (s) => (withCaptions.includes(s) ? `captions_${s.id} as unknown as CaptionData[]` : "undefined");

  // Tutorial inputs: word timings for steps, capture boxes, and the UI sounds when the sound stage made them.
  const wordsFile = (s) => join("public", "audio", `${s.id}.words.json`);
  const captureFile = (s) => join("public", "capture", `${s.id}.json`);
  const steps = (s) => (Array.isArray(s.data?.steps) ? s.data.steps : []);
  for (const s of manifest.scenes) {
    if (s.capture && !existsSync(captureFile(s))) fail(`${slug}: ${captureFile(s)} missing; run the capture stage first`);
    if (steps(s).some((st) => typeof st.at === "object") && !existsSync(wordsFile(s)))
      fail(`${slug}: ${wordsFile(s)} missing; run the voice stage first`);
  }
  const withWords = manifest.scenes.filter((s) => steps(s).length && existsSync(wordsFile(s)));
  const withCapture = manifest.scenes.filter((s) => s.capture);
  const ui = (name) => ((manifest.meta.sound?.sfxDensity ?? "none") !== "none" && existsSync(join("public", "sfx", `ui-${name}.mp3`)) ? `public/sfx/ui-${name}.mp3` : undefined);
  const uiSfx = JSON.stringify({ click: ui("click"), type: ui("type") });
  const tutorialImports = [
    ...withWords.map((s) => `import words_${s.id} from "../../../public/audio/${s.id}.words.json";`),
    ...withCapture.map((s) => `import capture_${s.id} from "../../../public/capture/${s.id}.json";`),
  ].join("\n");
  const tutorialFor = (s) =>
    withWords.includes(s) || withCapture.includes(s)
      ? `{ words: ${withWords.includes(s) ? `words_${s.id} as Word[]` : "undefined"}, capture: ${withCapture.includes(s) ? `capture_${s.id} as CaptureData` : "undefined"}, sfx: uiSfx }`
      : "undefined";
  const imports = custom.map((s) => `import { ${cap(s.id)} } from "./scenes/${cap(s.id)}";`).join("\n");
  const components = manifest.scenes
    .map((s) => (custom.includes(s) ? cap(s.id) : `baseScenes.${s.visualType}`))
    .join(", ");

  const code = `// Generated by gen-index.mjs. Do not edit.
import type React from "react";
import { AbsoluteFill, Series } from "remotion";
import type { Caption as CaptionData } from "@remotion/captions";
import { ${ownCaptions ? "" : "SceneCaptions, "}SfxVolume, baseScenes } from "../../lib/scenes";
${ownCaptions ? 'import { SceneCaptions } from "./Captions";' : ""}
import type { CaptureData, Layout, Manifest, SceneProps, TutorialInput, Word } from "../../lib/scenes";
import manifestJson from "../../../videos/${slug}/scenes.json";
${themeImport}
${imports}
${captionImports}
${tutorialImports}

const manifest = manifestJson as unknown as Manifest;
export const meta = manifest.meta;

const components: React.FC<SceneProps>[] = [${components}];
const captionData: (CaptionData[] | undefined)[] = [${manifest.scenes.map(captionsFor).join(", ")}];
const uiSfx: TutorialInput["sfx"] = ${uiSfx};
const tutorialData: (TutorialInput | undefined)[] = [${manifest.scenes.map(tutorialFor).join(", ")}];
const tail = meta.tailFrames ?? 12;
const sfxVolume = meta.sound.sfxVolume ?? 0.15;

export const entries = manifest.scenes.map((scene, i) => {
  if (scene.audio.durationSec == null) throw new Error(\`scene \${scene.id}: audio.durationSec is null\`);
  return { scene, Component: components[i], captions: captionData[i], tutorial: tutorialData[i], frames: Math.round(scene.audio.durationSec * meta.fps) + tail };
});

export const totalFrames = entries.reduce((sum, e) => sum + e.frames, 0);

export const SceneView: React.FC<{ index: number; layout: Layout }> = ({ index, layout }) => {
  const { scene, Component, captions, tutorial } = entries[index];
  return (
    <SfxVolume.Provider value={sfxVolume}>
      <AbsoluteFill>
        <Component scene={scene} meta={meta} layout={layout} tutorial={tutorial} />
        <SceneCaptions scene={scene} meta={meta} layout={layout} captions={captions} />
      </AbsoluteFill>
    </SfxVolume.Provider>
  );
};

export const FullVideo: React.FC<{ layout: Layout }> = ({ layout }) => (
  <SfxVolume.Provider value={sfxVolume}>
    <AbsoluteFill>
      <Series>
        {entries.map(({ scene, Component, captions, tutorial, frames }) => (
          <Series.Sequence key={scene.id} durationInFrames={frames}>
            <Component scene={scene} meta={meta} layout={layout} tutorial={tutorial} />
            <SceneCaptions scene={scene} meta={meta} layout={layout} captions={captions} />
          </Series.Sequence>
        ))}
      </Series>
    </AbsoluteFill>
  </SfxVolume.Provider>
);
`;
  mkdirSync(join("src", "videos", slug), { recursive: true });
  writeFileSync(join("src", "videos", slug, "index.tsx"), code);
}

const importLines = [
  ...slugs.map((slug, i) => `import * as v${i} from "./videos/${slug}";`),
  ...musicSlugs.map((slug, i) => `import { Compositions as M${i} } from "./videos/${slug}/Compositions";`),
  ...styleFrames.map((f, i) => `import * as F${i} from "./videos/${f.slug}/frames/${f.name}";`),
].join("\n");
const blocks = slugs
  .map((slug, i) => {
    const v = `v${i}`;
    const sceneComps = manifests[slug].scenes
      .map(
        (s, j) => `      <Composition
        id="${slug}-${s.id}"
        component={${v}.SceneView}
        durationInFrames={${v}.entries[${j}].frames}
        fps={${v}.meta.fps}
        width={${v}.meta.width}
        height={${v}.meta.height}
        defaultProps={{ index: ${j}, layout: "wide" as const }}
      />`,
      )
      .join("\n");
    const full = (id, layout, w, h) => `    <Composition
      id="${id}"
      component={${v}.FullVideo}
      durationInFrames={${v}.totalFrames}
      fps={${v}.meta.fps}
      width={${w}}
      height={${h}}
      defaultProps={{ layout: "${layout}" as const }}
    />`;
    return `    <Folder name="${slug}-scenes">
${sceneComps}
    </Folder>
${full(slug, "wide", `${v}.meta.width`, `${v}.meta.height`)}
${full(`${slug}-tall`, "tall", 1080, 1920)}
${full(`${slug}-square`, "square", 1080, 1080)}`;
  })
  .concat(musicSlugs.map((_, i) => `    <M${i} />`))
  .concat(
    styleFrames.length
      ? [`    <Folder name="style-frames">
${styleFrames
  .map(
    (f, i) => `      <Composition
        id="${f.slug}-frame-${f.name}"
        component={F${i}.Frame}
        durationInFrames={(F${i} as { durationInFrames?: number }).durationInFrames ?? 90}
        fps={(F${i} as { fps?: number }).fps ?? 30}
        width={F${i}.width}
        height={F${i}.height}
      />`,
  )
  .join("\n")}
    </Folder>`]
      : [],
  )
  .concat(
    probe
      ? [`    <Composition
      id="tutorial-probe"
      component={TutorialProbe}
      durationInFrames={90}
      fps={30}
      width={1920}
      height={1080}
      defaultProps={{ capture: probeCapture as CaptureData, image: "public/img/probe.png", style: probeStyle }}
    />`]
      : [],
  )
  .join("\n");
const probeImports = probe
  ? `import { TutorialProbe } from "./lib/scenes";
import type { CaptureData } from "./lib/scenes";
import probeCapture from "../public/capture/probe.json";

// Overridden per still with --props; see the video-interview skill.
const probeStyle = { palette: ["#0F172A", "#38BDF8", "#F8FAFC"], font: "Inter", minTextPx: 36, tutorial: { cursor: "arrow" as const, highlight: "spotlight" as const, maxZoom: 2 } };`
  : "";

writeFileSync(
  join("src", "Root.tsx"),
  `// Generated by gen-index.mjs. Do not edit.
import { Composition, Folder } from "remotion";
${importLines}
${probeImports}

export const RemotionRoot: React.FC = () => (
  <>
${blocks}
  </>
);
`,
);

console.log(`gen-index: wrote src/Root.tsx, ${slugs.length} video index file(s): ${slugs.join(", ") || "-"}; music: ${musicSlugs.join(", ") || "-"}${musicLeftOut.length ? ` (not registered, one music video at a time: ${musicLeftOut.join(", ")}; pass its slug to switch)` : ""}${probe ? "; tutorial-probe" : ""}${styleFrames.length ? `; style frames: ${styleFrames.map((f) => `${f.slug}-frame-${f.name}`).join(", ")}` : ""}`);
