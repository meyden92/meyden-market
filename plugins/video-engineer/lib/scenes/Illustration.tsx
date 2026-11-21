import { Img, staticFile } from "remotion";
import { Breathe, Reveal, entranceFrom } from "../motion";
import { BackgroundImages, OverlayImages, SceneShell, Stage, assetsOf, useKit } from "./kit";
import type { SceneProps } from "./types";

export const Illustration: React.FC<SceneProps> = ({ scene, meta, layout }) => {
  const { theme, type } = useKit(meta, layout);
  const subjects = assetsOf(scene, "subject");
  return (
    <SceneShell
      scene={scene}
      theme={theme}
      assets={
        <>
          <BackgroundImages scene={scene} theme={theme} />
          <OverlayImages scene={scene} />
        </>
      }
    >
      <Stage scene={scene} layout={layout} gap={Math.round(type.small * 0.6)}>
        {subjects.map((a, i) => (
          <Reveal key={a.file} theme={theme} index={i} from={entranceFrom(scene.motion.entrance)} style={{ flex: 1, minHeight: 0, width: "100%" }}>
            <Breathe phase={i * 0.5} style={{ width: "100%", height: "100%" }}>
              <Img src={staticFile(a.file.replace(/^public\//, ""))} style={{ width: "100%", height: "100%", objectFit: "contain" }} />
            </Breathe>
          </Reveal>
        ))}
        {scene.onScreen && (
          <Reveal theme={theme} index={subjects.length + 1}>
            <div style={{ fontSize: type.body, fontWeight: 600, textAlign: "center", maxWidth: "100%" }}>{scene.onScreen}</div>
          </Reveal>
        )}
      </Stage>
    </SceneShell>
  );
};
