import { Breathe, Counter as CounterNumber, Reveal } from "../motion";
import { BackgroundImages, SceneShell, Stage, fitSize, useKit } from "./kit";
import { num, str } from "./data";
import type { SceneProps } from "./types";

// data: value (number), from, decimals, prefix, suffix, label, locale
export const Counter: React.FC<SceneProps> = ({ scene, meta, layout }) => {
  const { theme, type, width } = useKit(meta, layout);
  const value = num(scene.data, "value");
  const label = str(scene.data, "label") ?? (value === undefined ? "" : scene.onScreen);
  const text = value === undefined ? scene.onScreen : label;
  const bigSize = Math.round(type.hero * 1.7);
  return (
    <SceneShell scene={scene} theme={theme} assets={<BackgroundImages scene={scene} theme={theme} scrim={0.55} />}>
      <Stage scene={scene} layout={layout} gap={Math.round(type.small * 0.5)}>
        {value !== undefined && (
          <Reveal theme={theme} from="pop">
            <Breathe>
              <CounterNumber
                value={value}
                from={num(scene.data, "from")}
                decimals={num(scene.data, "decimals") ?? 0}
                prefix={str(scene.data, "prefix")}
                suffix={str(scene.data, "suffix")}
                locale={str(scene.data, "locale") ?? meta.lang}
                delay={0.1}
                style={{ fontFamily: theme.fonts.display, fontSize: bigSize, fontWeight: 800, lineHeight: 1, letterSpacing: "-0.03em", color: theme.colors.primary }}
              />
            </Breathe>
          </Reveal>
        )}
        {text && (
          <Reveal theme={theme} index={2}>
            <div style={{ fontSize: value === undefined ? fitSize(text, [type.hero, type.h1, type.h2], width * 0.84, 3) : type.h2, fontWeight: value === undefined ? 800 : 600, textAlign: "center", color: value === undefined ? theme.colors.text : theme.colors.textDim }}>
              {text}
            </div>
          </Reveal>
        )}
      </Stage>
    </SceneShell>
  );
};
