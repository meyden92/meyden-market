import { useCurrentFrame, useVideoConfig } from "remotion";
import { Reveal } from "../motion";
import { SceneShell, Stage, surfaceStyle, useKit } from "./kit";
import { lines, str, strs } from "./data";
import type { SceneProps } from "./types";

// data: lines (string[]; a line starting with "$ " is a command, others are output), title
export const Terminal: React.FC<SceneProps> = ({ scene, meta, layout }) => {
  const { theme, type, width, height } = useKit(meta, layout);
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const rows = strs(scene.data, "lines") ?? lines(scene.onScreen);
  const title = str(scene.data, "title");
  const longest = Math.max(...rows.map((r) => r.length), 1);
  const innerW = width * 0.84 - type.small * 2;
  const innerH = height * (layout === "wide" ? 0.52 : layout === "tall" ? 0.38 : 0.5);
  const size = Math.max(theme.minTextPx, Math.floor(Math.min(innerW / (longest * 0.62), innerH / (rows.length * 1.45), type.body + 8)));
  const cursorOn = Math.floor((frame / fps) * 2) % 2 === 0;
  return (
    <SceneShell scene={scene} theme={theme}>
      <Stage scene={scene} layout={layout} align="stretch">
        <Reveal theme={theme} style={{ ...surfaceStyle(theme, 24), overflow: "hidden" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14, padding: `${type.small * 0.4}px ${type.small}px`, borderBottom: `2px solid ${theme.colors.line}` }}>
            {[0, 1, 2].map((d) => (
              <div key={d} style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: theme.colors.line }} />
            ))}
            {title && <div style={{ marginLeft: 12, fontSize: theme.minTextPx, color: theme.colors.textDim, fontFamily: theme.fonts.mono }}>{title}</div>}
          </div>
          <div style={{ padding: `${type.small * 0.6}px ${type.small}px`, fontFamily: theme.fonts.mono, fontSize: size, lineHeight: 1.45 }}>
            {rows.map((row, i) => {
              const cmd = row.startsWith("$ ");
              return (
                <Reveal key={i} theme={theme} index={i} delay={0.2} from="left" feel="snappy">
                  <div style={{ whiteSpace: "pre-wrap", wordBreak: "break-all", color: cmd ? theme.colors.text : theme.colors.textDim, minHeight: size * 1.45 }}>
                    {cmd && <span style={{ color: theme.colors.primary }}>{"$ "}</span>}
                    {cmd ? row.slice(2) : row}
                    {i === rows.length - 1 && <span style={{ opacity: cursorOn ? 1 : 0, color: theme.colors.text }}>{"█"}</span>}
                  </div>
                </Reveal>
              );
            })}
          </div>
        </Reveal>
      </Stage>
    </SceneShell>
  );
};
