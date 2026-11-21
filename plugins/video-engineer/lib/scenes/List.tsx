import { Reveal } from "../motion";
import { BackgroundImages, SceneShell, Stage, surfaceStyle, useKit } from "./kit";
import { lines, str, strs } from "./data";
import type { SceneProps } from "./types";

// data: title (string), items (string[] or {text}[])
export const List: React.FC<SceneProps> = ({ scene, meta, layout }) => {
  const { theme, type } = useKit(meta, layout);
  const items = strs(scene.data, "items") ?? lines(scene.onScreen);
  const title = str(scene.data, "title") ?? (scene.data?.items ? scene.onScreen : undefined);
  const gap = Math.round(type.small * 0.45);
  const columns = layout === "wide" && items.length > 4 ? 2 : 1;
  return (
    <SceneShell scene={scene} theme={theme} assets={<BackgroundImages scene={scene} theme={theme} scrim={0.6} />}>
      <Stage scene={scene} layout={layout} gap={gap * 1.5} align="stretch">
        {title && (
          <Reveal theme={theme}>
            <div style={{ fontFamily: theme.fonts.display, fontSize: type.h1, fontWeight: 800, letterSpacing: "-0.02em", lineHeight: 1.1 }}>{title}</div>
          </Reveal>
        )}
        <div style={{ display: "grid", gridTemplateColumns: `repeat(${columns}, 1fr)`, gap }}>
          {items.map((text, i) => (
            <Reveal key={i} theme={theme} index={i + 1} from="left" feel="snappy">
              <div style={{ ...surfaceStyle(theme, 20), display: "flex", alignItems: "center", gap: gap * 1.2, padding: `${gap}px ${gap * 1.4}px` }}>
                <div style={{ fontSize: type.body, fontWeight: 800, minWidth: type.body * 1.1, color: i === items.length - 1 ? theme.colors.primary : theme.colors.textDim, fontVariantNumeric: "tabular-nums" }}>
                  {String(i + 1).padStart(2, "0")}
                </div>
                <div style={{ fontSize: type.body, fontWeight: 600, lineHeight: 1.2 }}>{text}</div>
              </div>
            </Reveal>
          ))}
        </div>
      </Stage>
    </SceneShell>
  );
};
