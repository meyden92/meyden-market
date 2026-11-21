# Changelog

All notable changes to threejs-knowledge.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
versions follow [semver](https://semver.org).

## [0.1.0] - 2026-11-15

### Added

- 13 topic skills for three.js r186: fundamentals, geometry, materials, lighting, textures, animation, loaders, shaders, postprocessing, interaction, performance, react-three-fiber, asset-pipeline.
- Workflow and topic skills: build, visual-qa, debugging, physics, world-generation, asset-generation, xr, audio, upgrade.
- Agents: scene-builder, shader-artist, asset-engineer, performance-auditor, visual-critic.
- SessionStart hook that reports the project's three.js stack and points Claude at the build skill.
- PostToolUse hook and `three-check` executable that flag outdated three.js API (26 rules, gated by the installed release).
- `three-stats` executable with a page probe, and the `/three-stats` pane showing live frame stats.
