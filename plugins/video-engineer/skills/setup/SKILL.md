---
name: setup
description: "Scaffold or verify a Remotion project for video-engineer in the current directory: project files, plugin-owned scene library, dependencies, node and bundled ffmpeg checks, Playwright Chromium for app capture, API key presence."
argument-hint: ""
disable-model-invocation: true
---

# Set up a Remotion project

Work in the current directory. It becomes the Remotion project root.

When the current directory already holds another project (a `package.json` that is not this template's, or source folders of an app), ask before scaffolding: a subfolder such as `video/` (recommended, keeps the app's tooling apart) or this directory. Never edit the host project's own files (`biome.json`, `tsconfig.json`, `.dockerignore`, lint or CI config) to accommodate the video project without asking first; name the file and the change.

1. Check `node --version` is 18 or newer. Stop and report if not.
2. Copy `${CLAUDE_PLUGIN_ROOT}/templates/project/` into the current directory without overwriting. For each file that already exists, keep it and list it as a conflict in the final report (compare content; identical files are not conflicts). Dotfiles such as `.gitignore` are part of the template.
3. Copy `${CLAUDE_PLUGIN_ROOT}/lib/` into `src/lib/`, overwriting (this includes the music kit `src/lib/music/`). This directory is owned by the plugin; local edits are lost on every setup run. Say so in the report. When `src/videos/` already holds videos, run `npx tsc --noEmit` after step 4 and list each error in `src/videos/<slug>/` as a video the kit update broke, with the file and message; do not fix them unasked.
4. Run `npm install`.
5. Run `npx remotion ffmpeg -version` and `npx remotion ffprobe -version`. Both must succeed. Video-engineer uses only these bundled binaries.
6. Run `npx playwright install chromium`. The capture stage of showcase and tutorial videos uses it to start and screenshot the app (a download of about 150 MB, cached per machine). A failure here is reported and does not stop setup; videos without an app capture do not need it.
7. Report whether the fal MCP (`run_model`) and the ElevenLabs MCP (`creative_generate_speech`) are available in this session. fal is required for images, voice, word timings, sound effects, music and lyric alignment; when it is missing, point to its setup page (https://fal.ai/docs/documentation/setting-up/mcp/claude-code). The ElevenLabs MCP is optional (the user's own ElevenLabs voices).

Report one line per check (Playwright Chromium installed or not) plus the list of conflicts, and end with: start a video with `/video-engineer:new`.

Done when: node, ffmpeg and ffprobe checks pass, `node_modules` exists, `src/lib/scenes/index.ts` and `src/lib/music/index.ts` exist, and the report lists conflicts and MCP status.
