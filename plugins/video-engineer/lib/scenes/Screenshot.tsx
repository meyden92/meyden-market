import { Img } from "remotion";
import { Reveal } from "../motion";
import { KenBurns, cameraFrom } from "../motion";
import { SceneShell, Stage, assetsOf, surfaceStyle, useKit } from "./kit";
import { str } from "./data";
import { TutorialScene, stepsOf } from "./Tutorial";
import { assetUrl } from "./SceneAudio";
import type { SceneProps } from "./types";

// data: url (address shown in the frame header), steps (tutorial steps over a captured screenshot)
export const Screenshot: React.FC<SceneProps> = ({ scene, meta, layout, tutorial }) => {
  const { theme, type } = useKit(meta, layout);
  const shots = assetsOf(scene, "screenshot");
  const url = str(scene.data, "url");
  if (stepsOf(scene).length)
    return (
      <TutorialScene
        scene={scene}
        meta={meta}
        layout={layout}
        input={tutorial}
        url={url}
        media={<Img src={assetUrl(shots[0].file)} style={{ width: "100%", height: "100%", display: "block" }} />}
      />
    );
  return (
    <SceneShell scene={scene} theme={theme}>
      <Stage scene={scene} layout={layout} gap={Math.round(type.small * 0.7)}>
        {shots.slice(0, 1).map((a) => (
          <Reveal key={a.file} theme={theme} from="pop" style={{ ...surfaceStyle(theme, 24), overflow: "hidden", flex: 1, minHeight: 0, width: "100%", display: "flex", flexDirection: "column" }}>
            {url && (
              <div style={{ fontSize: theme.minTextPx, padding: `${type.small * 0.35}px ${type.small}px`, color: theme.colors.textDim, borderBottom: `2px solid ${theme.colors.line}`, fontFamily: theme.fonts.mono }}>{url}</div>
            )}
            <div style={{ position: "relative", flex: 1, minHeight: 0, overflow: "hidden", backgroundColor: theme.colors.bgAlt }}>
              <KenBurns theme={theme} src={a.file} camera={cameraFrom(scene.motion.camera)} fit="contain" zoom={1.05} />
            </div>
          </Reveal>
        ))}
        {scene.onScreen && (
          <Reveal theme={theme} index={2}>
            <div style={{ fontSize: type.body, fontWeight: 600, textAlign: "center" }}>{scene.onScreen}</div>
          </Reveal>
        )}
      </Stage>
    </SceneShell>
  );
};
