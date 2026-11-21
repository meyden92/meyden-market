import { Reveal } from "../motion";
import { BackgroundImages, SceneShell, Stage, fitSize, useKit } from "./kit";
import { str } from "./data";
import type { SceneProps } from "./types";

// data: quote (default onScreen), author, role
export const Quote: React.FC<SceneProps> = ({ scene, meta, layout }) => {
  const { theme, type, width } = useKit(meta, layout);
  const quote = str(scene.data, "quote") ?? scene.onScreen;
  const author = str(scene.data, "author");
  const role = str(scene.data, "role");
  const size = fitSize(quote, [type.h1, type.h2, type.body], width * 0.8, 6);
  return (
    <SceneShell scene={scene} theme={theme} assets={<BackgroundImages scene={scene} theme={theme} scrim={0.6} />}>
      <Stage scene={scene} layout={layout} gap={Math.round(type.small * 0.5)}>
        <Reveal theme={theme} from="pop">
          <div style={{ fontFamily: theme.fonts.display, fontSize: type.hero * 1.4, lineHeight: 0.8, height: type.hero * 0.7, fontWeight: 800, color: theme.colors.primary }}>{"“"}</div>
        </Reveal>
        <Reveal theme={theme} index={1}>
          <div style={{ fontFamily: theme.fonts.display, fontSize: size, fontWeight: 700, lineHeight: 1.2, textAlign: "center", letterSpacing: "-0.01em" }}>{quote}</div>
        </Reveal>
        {author && (
          <Reveal theme={theme} index={3}>
            <div style={{ fontSize: type.body, textAlign: "center", color: theme.colors.textDim }}>
              <span style={{ color: theme.colors.text, fontWeight: 600 }}>{author}</span>
              {role ? `, ${role}` : ""}
            </div>
          </Reveal>
        )}
      </Stage>
    </SceneShell>
  );
};
