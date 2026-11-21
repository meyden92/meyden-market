import { Breathe, Reveal } from "../motion";
import { BackgroundImages, SceneShell, Stage, fitSize, useKit } from "./kit";
import { str } from "./data";
import type { SceneProps } from "./types";

// data: action (button text), url (string shown below the button)
export const Cta: React.FC<SceneProps> = ({ scene, meta, layout }) => {
  const { theme, type, width } = useKit(meta, layout);
  const action = str(scene.data, "action");
  const url = str(scene.data, "url");
  const size = fitSize(scene.onScreen, [type.hero, type.h1, type.h2], width * 0.84, 3);
  return (
    <SceneShell scene={scene} theme={theme} assets={<BackgroundImages scene={scene} theme={theme} scrim={0.55} />}>
      <Stage scene={scene} layout={layout} gap={Math.round(type.small * 1.1)}>
        <Reveal theme={theme}>
          <div style={{ fontFamily: theme.fonts.display, fontSize: size, fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1.08, textAlign: "center" }}>{scene.onScreen}</div>
        </Reveal>
        {action && (
          <Reveal theme={theme} index={2} from="pop" feel="bouncy">
            <Breathe period={3}>
              <div style={{ backgroundColor: theme.colors.primary, color: theme.colors.onPrimary, fontSize: type.body, fontWeight: 700, padding: `${Math.round(type.body * 0.45)}px ${Math.round(type.body * 1.2)}px`, borderRadius: 999 }}>
                {action}
              </div>
            </Breathe>
          </Reveal>
        )}
        {url && (
          <Reveal theme={theme} index={4}>
            <div style={{ fontSize: type.body, color: theme.colors.textDim, fontFamily: theme.fonts.mono }}>{url}</div>
          </Reveal>
        )}
      </Stage>
    </SceneShell>
  );
};
