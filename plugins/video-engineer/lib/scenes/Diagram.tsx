import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { Reveal, staggerFrames } from "../motion";
import { SceneShell, Stage, useKit } from "./kit";
import { obj, str } from "./data";
import type { SceneProps } from "./types";

// data: title, nodes (string[] or {label, note}[]), edges ([from, to][] by node index; default is a chain)
type Node = { label: string; note?: string };

const readNodes = (scene: SceneProps["scene"]): Node[] => {
  const raw = scene.data?.nodes;
  if (Array.isArray(raw)) {
    return raw.map((n) => (typeof n === "string" ? { label: n } : { label: String(obj({ n }, "n")?.label ?? ""), note: str(obj({ n }, "n"), "note") }));
  }
  return scene.onScreen.split(/\s*(?:→|->|\n)\s*/).filter(Boolean).map((label) => ({ label }));
};

const readEdges = (scene: SceneProps["scene"], n: number): [number, number][] => {
  const raw = scene.data?.edges;
  if (Array.isArray(raw)) return raw.filter((e): e is [number, number] => Array.isArray(e) && e.length === 2);
  return Array.from({ length: Math.max(0, n - 1) }, (_, i) => [i, i + 1]);
};

export const Diagram: React.FC<SceneProps> = ({ scene, meta, layout }) => {
  const { theme, type, width, height, fps } = useKit(meta, layout);
  const frame = useCurrentFrame();
  useVideoConfig();
  const nodes = readNodes(scene);
  const edges = readEdges(scene, nodes.length);
  const title = str(scene.data, "title");

  const padX = (layout === "wide" ? 0.08 : layout === "tall" ? 0.07 : 0.08) * width;
  const areaW = width - 2 * padX;
  const areaH = height * (layout === "wide" ? 0.5 : layout === "tall" ? 0.4 : 0.5);
  const cols = layout === "tall" ? 1 : layout === "square" ? Math.min(3, nodes.length) : Math.min(4, nodes.length);
  const rows = Math.ceil(nodes.length / cols);
  const gapX = areaW * 0.07;
  const gapY = areaH * 0.14;
  const boxW = (areaW - gapX * (cols - 1)) / cols;
  const boxH = Math.min(type.body * 3.3, (areaH - gapY * (rows - 1)) / rows);
  // Snake order: row 1 runs right to left so consecutive nodes stay adjacent.
  const pos = nodes.map((_, i) => {
    const r = Math.floor(i / cols);
    const c = r % 2 === 0 ? i % cols : cols - 1 - (i % cols);
    return { x: c * (boxW + gapX), y: r * (boxH + gapY) };
  });
  const totalH = rows * boxH + (rows - 1) * gapY;
  const stagger = staggerFrames(fps);
  const nodeStart = (i: number) => i * stagger;

  const clip = (from: number, to: number) => {
    // Point on the border of node `from` toward node `to`, and on the border of `to` toward `from`.
    const a = { x: pos[from].x + boxW / 2, y: pos[from].y + boxH / 2 };
    const b = { x: pos[to].x + boxW / 2, y: pos[to].y + boxH / 2 };
    const dx = b.x - a.x, dy = b.y - a.y;
    const t = Math.min(dx === 0 ? Infinity : boxW / 2 / Math.abs(dx), dy === 0 ? Infinity : boxH / 2 / Math.abs(dy));
    const pad = type.small * 0.3;
    const len = Math.hypot(dx, dy);
    const u = { x: dx / len, y: dy / len };
    return {
      x1: a.x + dx * t + u.x * pad, y1: a.y + dy * t + u.y * pad,
      x2: b.x - dx * t - u.x * pad, y2: b.y - dy * t - u.y * pad,
    };
  };

  return (
    <SceneShell scene={scene} theme={theme}>
      <Stage scene={scene} layout={layout} gap={Math.round(type.small * 1.2)}>
        {title && (
          <Reveal theme={theme}>
            <div style={{ fontFamily: theme.fonts.display, fontSize: type.h1, fontWeight: 800, textAlign: "center", letterSpacing: "-0.02em" }}>{title}</div>
          </Reveal>
        )}
        <div style={{ position: "relative", width: areaW, height: totalH }}>
          <svg width={areaW} height={totalH} viewBox={`0 0 ${areaW} ${totalH}`} style={{ position: "absolute", inset: 0 }}>
            {edges.map(([from, to], k) => {
              if (!pos[from] || !pos[to]) return null;
              const { x1, y1, x2, y2 } = clip(from, to);
              const start = Math.max(nodeStart(from), nodeStart(to)) + stagger;
              const p = spring({ frame: frame - start, fps, config: theme.spring.smooth });
              const ex = x1 + (x2 - x1) * p, ey = y1 + (y2 - y1) * p;
              const ang = Math.atan2(y2 - y1, x2 - x1);
              const h = type.small * 0.4;
              return (
                <g key={k} opacity={interpolate(p, [0, 0.1], [0, 1], { extrapolateRight: "clamp" })}>
                  <line x1={x1} y1={y1} x2={ex} y2={ey} stroke={theme.colors.textDim} strokeWidth={Math.max(3, type.k * 4)} strokeLinecap="round" />
                  <polygon
                    points={[0, 1, 2].map((j) => {
                      const a = ang + (j === 0 ? 0 : j === 1 ? 2.5 : -2.5);
                      const r = j === 0 ? h * 1.2 : h;
                      return `${ex + Math.cos(a) * r},${ey + Math.sin(a) * r}`;
                    }).join(" ")}
                    fill={theme.colors.textDim}
                    opacity={p > 0.95 ? 1 : 0}
                  />
                </g>
              );
            })}
          </svg>
          {nodes.map((n, i) => (
            <Reveal key={i} theme={theme} index={i} from="pop" feel="snappy" style={{ position: "absolute", left: pos[i].x, top: pos[i].y, width: boxW, height: boxH }}>
              <div
                style={{
                  width: "100%", height: "100%", boxSizing: "border-box", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                  backgroundColor: theme.colors.surface, borderRadius: 20, textAlign: "center", padding: "0 16px",
                  border: `${Math.max(3, type.k * 4)}px solid ${i === nodes.length - 1 ? theme.colors.primary : theme.colors.line}`,
                }}
              >
                <div style={{ fontSize: type.small + (boxW > type.body * 8 ? 6 : 0), fontWeight: 700, lineHeight: 1.15 }}>{n.label}</div>
                {n.note && <div style={{ fontSize: type.small, color: theme.colors.textDim, lineHeight: 1.1 }}>{n.note}</div>}
              </div>
            </Reveal>
          ))}
        </div>
      </Stage>
    </SceneShell>
  );
};
