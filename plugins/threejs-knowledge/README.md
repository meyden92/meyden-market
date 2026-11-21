# threejs-knowledge

Makes Claude Code build, debug and optimize three.js scenes on its own. In a three.js project you state the goal; Claude loads the skills it needs, hands parts to specialist agents, and checks the result in a browser.

## Install

```bash
/plugin install threejs-knowledge@meyden
```

Needs Claude Code 2.1.323 or later and `python3` on the PATH (hooks and executables, standard library only).

## How it works

1. **Session start.** A hook reads `package.json` and HTML import maps. In a three.js project it tells Claude the installed three release, React Three Fiber and related packages, the renderer in use, and to load the `build` skill for 3D work. In other projects it prints nothing.
2. **`build` skill.** Picks the renderer for new projects, loads the topic skills the task needs, dispatches agents for separable parts, and requires a visual check before reporting done.
3. **After every edit.** A hook scans the text Claude just wrote for outdated three.js API (26 rules, gated by the installed release) and returns the replacement.
4. **Visual check.** The `visual-qa` skill runs the page, captures frames with the browser tools the session has, reads the console and frame stats, and judges the frames. The `visual-critic` agent gives an independent verdict on looks.

## Skills

Topic knowledge for three.js r186, each with WebGPU/TSL coverage and a list of outdated patterns:

`fundamentals`, `geometry`, `materials`, `lighting`, `textures`, `animation`, `loaders`, `shaders`, `postprocessing`, `interaction`, `performance`, `react-three-fiber`, `asset-pipeline`

Workflows and further topics:

| Skill | Covers |
| :-- | :-- |
| `build` | Entry point: stack, renderer choice, skill and agent routing, verification |
| `visual-qa` | Run, capture, console, frame stats, what to look for |
| `debugging` | Black screen, wrong colors, shadow artefacts, flicker, context loss |
| `physics` | Rapier, vanilla and `@react-three/rapier` |
| `world-generation` | Seeded terrain, regions, scattering, chunks, camera paths |
| `asset-generation` | CC0 libraries, AI 3D through a fal MCP server, Blender MCP |
| `xr` | WebXR sessions, controllers, AR hit test, `@react-three/xr` |
| `audio` | Positional audio, unlocking, pooling, audio-reactive visuals |
| `upgrade` | `/threejs-knowledge:upgrade` refreshes skills and lint rules for a new three.js release (user-invoked) |

## Agents

| Agent | Role |
| :-- | :-- |
| `scene-builder` | Scene structure, cameras, lights, geometry, controls |
| `shader-artist` | TSL and GLSL materials, post-processing |
| `asset-engineer` | Model and texture optimization, loaders, animation clips |
| `performance-auditor` | Measures and ranks fixes; edits nothing |
| `visual-critic` | Scores screenshots against the brief; reads only the frames |

## Executables

| Command | Does |
| :-- | :-- |
| `three-check [path ...]` | Lists outdated three.js API in source files; exit 1 on findings |
| `three-stats start` | Starts the frame-stats collector on `127.0.0.1:47186` and prints the probe snippet |
| `three-stats latest` | Newest sample as JSON: fps, frame time, draw calls, triangles, geometries, textures |
| `three-stats snippet` / `stop` / `serve` | Probe lines; stop the collector; run it in the foreground |

The collector exits after 30 minutes without a sample. `THREE_STATS_PORT` changes the port for the executable; the pane reads the default port.

## Frame-stats pane

`/three-stats` starts the collector and opens a pane with the live numbers of the page that has the probe attached. Values past the budget (16.7 ms, 200 draw calls, 1 million triangles) are drawn in the warning color. Panes draw in the terminal and the desktop app.

The mod's hooks and calls, as `claude plugin validate` reports them:

```
hooks: session.start, command.run{command=three-stats}, ui.render{component=Pane}
calls: $.clock.every, $.command.register, $.http.fetch, $.process.run, $.state.get, $.state.set, $.ui.open, $.ui.panes, $.ui.resolve
```

## Optional connections

- A browser Claude can drive (the desktop app's built-in browser, Claude in Chrome, or a Playwright MCP server) for the visual check. Without one Claude says the scene was not looked at.
- A fal MCP server for AI-generated 3D models, and a Blender MCP server for modelling and export. `asset-generation` uses them when present.
