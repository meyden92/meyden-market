---
name: run
description: "Run the whole production pipeline of a narrated, showcase or tutorial video-engineer video after the interview: sync script, app capture, assets, voice, sound, captions, build, QA, render, cuts. Resumable; re-running skips finished stages. Use after both gates of /video-engineer:new, or when the user asks to continue, resume, update or finish a video after editing SCRIPT.md."
user-invocable: false
---

# Run

Run from the Remotion project root. `<slug>` is the argument; if missing and `videos/` holds one project, use it. Needs `videos/<slug>/BRIEF.md`, `SCRIPT.md` and `scenes.json` from the `new` interview. The run asks the user nothing except the cost confirmation of the audio stage and on a hard failure from the table below (see Escalation).

Each stage is an existing skill or script. Do the work through the `video-engineer:director` agent so this context stays small, except image generation and the audio stage: they call MCP tools or skills that must run in the conversation that owns the video, so they run here. Its prompt contains the slug, the absolute project root, the absolute plugin root `${CLAUDE_PLUGIN_ROOT}`, the plugin data folder `${CLAUDE_PLUGIN_DATA}` and the stage list. The critic is dispatched here, not by the director, because subagents cannot start subagents.

## Music videos

A project with `blocks.json` (a song and `lyrics.txt`) instead of `SCRIPT.md` is a music video. Do not use the order below; load the `music-video` skill and follow it (scaffold from `templates/music/`, compositions `<slug>`, `<slug>-upto`, `<slug>-<blockId>`). It is interactive (the user chooses looks, approves paid calls and reviews stills), so the "asks the user nothing" rule above does not apply to it.

## Process rules

- Visual choices are tested on rendered stills (2 or 3 options, same frame) before building.
- On request, render a WIP preview.
- Studio stays open while the video is being built and fixed, so the user can preview in real time (see Studio).

## Order

1. **Short-circuit.** If `out/final.mp4` is newer than `SCRIPT.md` and `scenes.json`, and each cut in `meta.cuts` has its file (`final-9x16.mp4`, `final-1x1.mp4`) newer than `final.mp4`, report that everything is current and stop.
2. **Phase A, director:**
   1. `sync-script`: only if `SCRIPT.md` is newer than `scenes.json`: `node "${CLAUDE_PLUGIN_ROOT}/scripts/sync-script.mjs" <slug>`. It keeps durations of scenes whose narration did not change.
   2. `capture`: only when a scene has `capture`: `node "${CLAUDE_PLUGIN_ROOT}/scripts/capture.mjs" <slug>` (reuses unchanged scenes; log in `research/app.log`). It sets the capture assets to `delivered`.
   3. `assets`: `prompts` (always, it is cheap).
3. **Images, here:** when a scene has a pending asset, run the `assets` skill's `generate` step (through the fal MCP; without it, or when the user declines the cost, the user delivers the images from `research/asset-prompts.md`), then `check`.
4. **Audio, here:** load the `audio` skill, then:
   1. `voice` skill: `audio.mjs plan` skips scenes whose mp3, words file and hash are unchanged; measuring then fills `audio.durationSec`.
   2. `sound` skill: skip when no scene has `sfx` entries, no scene clicks or types (steps or recorded), or `sfxDensity` is `none`, and `meta.sound.musicPrompt` is empty.
5. **Phase A2, director:**
   1. `captions`: skip when no scene has `captions: true`; the script skips scenes whose audio did not change.
   2. `build`.
6. **QA, here:** skip when `out/qa-passed` exists and nothing under `SCRIPT.md`, `public/` or `src/videos/<slug>/` is newer than it (`find ... -newer`). Otherwise loop at most 3 rounds, following the `qa` skill, with one change: the critic dispatch and the `scenes.json` write are done here; the fixes are done by the director (prompt: slug, paths and the critic JSON, "apply the fixes"). On a pass, `touch videos/<slug>/out/qa-passed`.
7. **Phase B, director:** `render` (incremental by hash), then one `cut` per entry of `meta.cuts` (`9:16` and `1:1`).
8. **Stop Studio** (see Studio), and record the finished video for the next one's direction: `node "${CLAUDE_PLUGIN_ROOT}/scripts/fingerprint.mjs" add <slug> --data "${CLAUDE_PLUGIN_DATA}"`.
9. Report: stages run and skipped, QA score and rounds, output paths and durations, entries added to `research/decisions.md`, and the music licence note if the brief names ads or broadcast.

## Hard failures

| Stage | Stops when |
|---|---|
| assets check | a referenced file is missing, a subject layer has no alpha, or an image is under its size rule. Without the fal MCP the images are delivered by hand: stop and point to `research/asset-prompts.md` |
| capture | the app does not answer, a selector is not visible within 15 s, a target has no box, a `hide` selector is still visible, or an env var or seed match is missing. Fix `app.json` or the `Capture:` line in SCRIPT.md |
| voice | total outside `meta.targetSec`, any scene under 4 s, a failed generation, the user declining the cost, or the fal MCP (or the ElevenLabs MCP for that provider) not connected |
| build | typecheck fails after 2 fix rounds |
| qa | the bar of the `qa` skill is not met after 3 fix rounds (any hard failure, an axis under 8, or an average under 8.5) |
| render | ffmpeg error |

Asset prompts, sound and cuts never stop the run; failures there are logged in `decisions.md`.

## Escalation

A hard failure ends the director's phase (or the audio stage) with a report. Here, in the main conversation, put it to the user as one question with a recommended answer (AskUserQuestion), for example: shorten the script or widen `targetSec`; ship without the music bed; deliver the images by hand; render despite the failed QA bar. Apply the answer (an edit to SCRIPT.md, a `meta` change, a line in `decisions.md` for an accepted failure) and resume the run from the failed stage. The director itself never asks.

## Studio

Before Phase A2's `build`, start Remotion Studio in the background from this conversation, not from the director (a subagent's background process ends with it): `npx remotion studio --port <port> --no-open`, with port 3000, or the next free port from 3001 when 3000 is taken or `app.json`'s `url` uses it (the captured app owns that port). Write the port and PID to `videos/<slug>/out/studio.txt` and tell the user the URL once. Reuse a Studio that is already running for this project. After the final render and cuts, stop it (`kill <PID>`) and delete `studio.txt`, so the port is free again. Leave the renderer port unpinned: `remotion render` and `still` pick a free port themselves, and a pinned port breaks parallel still renders.

## Resume

Fix the cause (deliver the images, edit `SCRIPT.md`, add the key) and ask to continue the video, in the same or a new session; the `run` skill picks up the slug. Every stage is idempotent: sync runs only for a newer `SCRIPT.md`, voice and sound and captions skip finished files, render skips scenes whose hash is unchanged, QA is skipped while `out/qa-passed` is current. State lives in the files of `videos/<slug>/`, nothing in the conversation.

Done when: `out/final.mp4` and every cut in `meta.cuts` exist and are current, or the report names the hard failure and what to fix.
