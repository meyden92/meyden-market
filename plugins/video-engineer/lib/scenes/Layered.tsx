import { Img, staticFile } from "remotion";
import { Parallax, Reveal } from "../motion";
import { SceneShell, Stage, assetsOf, useKit } from "./kit";
import type { SceneProps } from "./types";

const full = { width: "100%", height: "100%" } as const;

export const Layered: React.FC<SceneProps> = ({ scene, meta, layout }) => {
  const { theme, type } = useKit(meta, layout);
  const img = (file: string, fit: "cover" | "contain") => (
    <Img key={file} src={staticFile(file.replace(/^public\//, ""))} style={{ ...full, objectFit: fit }} />
  );
  const layers = [
    ...assetsOf(scene, "background").map((a) => ({ node: img(a.file, "cover"), depth: 0.3 })),
    ...assetsOf(scene, "subject").map((a) => ({
      node: (
        <Stage scene={scene} layout={layout}>
          <Reveal theme={theme} from="rise" style={{ width: "100%", height: "100%" }}>{img(a.file, "contain")}</Reveal>
        </Stage>
      ),
      depth: 0.7,
    })),
    ...assetsOf(scene, "overlay").map((a) => ({ node: img(a.file, "cover"), depth: 1.4 })),
  ];
  return (
    <SceneShell scene={scene} theme={theme} assets={<Parallax theme={theme} layers={layers} axis={layout === "tall" ? "y" : "x"} />}>
      {scene.onScreen && (
        <Stage scene={scene} layout={layout}>
          <div style={{ flex: 1 }} />
          <Reveal theme={theme} delay={0.3}>
            <div style={{ fontSize: type.body, fontWeight: 700, textAlign: "center" }}>{scene.onScreen}</div>
          </Reveal>
        </Stage>
      )}
    </SceneShell>
  );
};
