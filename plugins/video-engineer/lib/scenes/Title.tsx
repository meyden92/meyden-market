import { Reveal, WordReveal, entranceFrom } from "../motion";
import { BackgroundImages, SceneShell, Stage, fitSize, useKit } from "./kit";
import { str } from "./data";
import type { SceneProps } from "./types";

export const Title: React.FC<SceneProps> = ({ scene, meta, layout }) => {
  const { theme, type, width } = useKit(meta, layout);
  const size = fitSize(scene.onScreen, [type.hero, type.h1, type.h2], width * 0.84, 3);
  const kicker = str(scene.data, "kicker");
  const subtitle = str(scene.data, "subtitle");
  return (
    <SceneShell scene={scene} theme={theme} assets={<BackgroundImages scene={scene} theme={theme} scrim={0.55} />}>
      <Stage scene={scene} layout={layout} gap={Math.round(type.small * 0.6)}>
        {kicker && (
          <Reveal theme={theme} from={entranceFrom(scene.motion.entrance)}>
            <div style={{ fontSize: type.small, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", color: theme.colors.primary }}>{kicker}</div>
          </Reveal>
        )}
        <WordReveal
          theme={theme}
          text={scene.onScreen}
          delay={kicker ? 0.15 : 0}
          style={{ fontFamily: theme.fonts.display, fontSize: size, fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1.08, textAlign: "center" }}
        />
        {subtitle && (
          <Reveal theme={theme} delay={0.45}>
            <div style={{ fontSize: type.body, color: theme.colors.textDim, textAlign: "center" }}>{subtitle}</div>
          </Reveal>
        )}
      </Stage>
    </SceneShell>
  );
};
