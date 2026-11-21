import { Reveal } from "../motion";
import { SceneShell, Stage, surfaceStyle, useKit } from "./kit";
import { obj, str, strs } from "./data";
import type { SceneProps } from "./types";

// data: left and right ({ label, items: string[] }), winner ("left" | "right", default "right"), title
export const Comparison: React.FC<SceneProps> = ({ scene, meta, layout }) => {
  const { theme, type } = useKit(meta, layout);
  const sides = (["left", "right"] as const).map((k) => {
    const o = obj(scene.data, k);
    return { key: k, label: str(o, "label") ?? k, items: strs(o, "items") ?? [] };
  });
  const winner = str(scene.data, "winner") ?? "right";
  const title = str(scene.data, "title");
  const gap = Math.round(type.small * 0.8);
  return (
    <SceneShell scene={scene} theme={theme}>
      <Stage scene={scene} layout={layout} gap={gap} align="stretch">
        {title && (
          <Reveal theme={theme}>
            <div style={{ fontFamily: theme.fonts.display, fontSize: type.h1, fontWeight: 800, textAlign: "center", letterSpacing: "-0.02em" }}>{title}</div>
          </Reveal>
        )}
        <div style={{ display: "flex", flexDirection: layout === "wide" ? "row" : "column", gap, flex: layout === "wide" ? undefined : 1, minHeight: 0 }}>
          {sides.map((s, i) => (
            <Reveal key={s.key} theme={theme} index={i + 1} from={layout === "wide" ? (i === 0 ? "left" : "right") : "rise"} style={{ flex: 1, minWidth: 0 }}>
              <div style={{ ...surfaceStyle(theme, 24), height: "100%", boxSizing: "border-box", padding: `${gap}px ${gap * 1.3}px`, borderColor: winner === s.key ? theme.colors.primary : theme.colors.line }}>
                <div style={{ fontSize: type.h2, fontWeight: 800, marginBottom: gap * 0.6, color: winner === s.key ? theme.colors.primary : theme.colors.text }}>{s.label}</div>
                {s.items.map((it, j) => (
                  <Reveal key={j} theme={theme} index={i + 3 + j} feel="snappy">
                    <div style={{ fontSize: type.body, lineHeight: 1.25, padding: `${gap * 0.3}px 0`, color: theme.colors.text }}>{it}</div>
                  </Reveal>
                ))}
              </div>
            </Reveal>
          ))}
        </div>
      </Stage>
    </SceneShell>
  );
};
