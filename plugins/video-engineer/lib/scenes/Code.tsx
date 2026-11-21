import { Reveal } from "../motion";
import type { Theme } from "../motion";
import { SceneShell, Stage, surfaceStyle, useKit } from "./kit";
import { str } from "./data";
import type { SceneProps } from "./types";

// data: code (string), file (header label), highlight (1-based line numbers)
const KEYWORDS = /^(const|let|var|function|return|if|else|for|while|import|from|export|default|class|new|await|async|def|in|of|true|false|null|undefined|type|interface|fn|pub|use|struct|impl)$/;

const colorize = (line: string, theme: Theme) => {
  const comment = line.match(/^(.*?)(\/\/.*|^\s*#.*)$/);
  const [code, tail] = comment ? [comment[1], comment[2]] : [line, ""];
  const parts = code.split(/("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`[^`]*`|\b[A-Za-z_]\w*\b|\b\d+(?:\.\d+)?\b)/);
  return (
    <>
      {parts.map((p, i) => {
        const color = /^["'`]/.test(p) || /^\d/.test(p) ? theme.colors.accent : KEYWORDS.test(p) ? theme.colors.primary : undefined;
        return color ? <span key={i} style={{ color }}>{p}</span> : p;
      })}
      {tail && <span style={{ color: theme.colors.textDim }}>{tail}</span>}
    </>
  );
};

export const Code: React.FC<SceneProps> = ({ scene, meta, layout }) => {
  const { theme, type, width, height } = useKit(meta, layout);
  const code = (str(scene.data, "code") ?? scene.onScreen).replace(/\t/g, "  ").replace(/\n$/, "");
  const file = str(scene.data, "file");
  const highlight = Array.isArray(scene.data?.highlight) ? (scene.data!.highlight as number[]) : [];
  const rows = code.split("\n");
  const longest = Math.max(...rows.map((r) => r.length), 1);
  const innerW = width * (layout === "wide" ? 0.84 : 0.86) - type.small * 2;
  const innerH = height * (layout === "wide" ? 0.58 : layout === "tall" ? 0.4 : 0.54);
  // Largest size that fits both ways, never below minTextPx.
  const fit = Math.min(innerW / (longest * 0.62), innerH / (rows.length * 1.45), type.body + 8);
  const size = Math.max(theme.minTextPx, Math.floor(fit));
  return (
    <SceneShell scene={scene} theme={theme}>
      <Stage scene={scene} layout={layout} align="stretch">
        <Reveal theme={theme} style={{ ...surfaceStyle(theme, 24), overflow: "hidden" }}>
          {file && (
            <div style={{ fontSize: theme.minTextPx, padding: `${type.small * 0.4}px ${type.small}px`, color: theme.colors.textDim, borderBottom: `2px solid ${theme.colors.line}`, fontFamily: theme.fonts.mono }}>{file}</div>
          )}
          <div style={{ padding: `${type.small * 0.6}px ${type.small}px`, fontFamily: theme.fonts.mono, fontSize: size, lineHeight: 1.45 }}>
            {rows.map((row, i) => (
              <Reveal key={i} theme={theme} index={i} delay={0.2} from="left" feel="snappy">
                <div style={{ whiteSpace: "pre-wrap", wordBreak: "break-all", backgroundColor: highlight.includes(i + 1) ? theme.colors.bgAlt : undefined, margin: `0 -${type.small}px`, padding: `0 ${type.small}px`, minHeight: size * 1.45 }}>
                  {colorize(row, theme)}
                </div>
              </Reveal>
            ))}
          </div>
        </Reveal>
      </Stage>
    </SceneShell>
  );
};
