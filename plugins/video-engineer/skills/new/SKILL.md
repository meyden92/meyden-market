---
name: new
description: Start a new video. Asks what kind of video it is (narrated explainer or promo, app showcase or tutorial, lyric music video), then runs the matching interview and pipeline, loading the stage skills itself.
argument-hint: "[direction] [--roast]"
disable-model-invocation: true
---

# New video

Work from the Remotion project root. The argument is the direction text (may be empty); `--roast` switches the interview to roast mode. The user starts here and nowhere else: every later stage is a skill you load yourself (`run`, `music-video`, `voice`, `sound`, `render`, ...). Never tell the user to type another `/video-engineer:` command.

## Who does what

You run the interview here, in the main conversation, because only the main conversation can talk to the user. Facts come from `researcher` agents running in the background, so the screenshots, brand files and web pages are read in their contexts and reach you only as the text files in `research/`. When the interview converges, the `interviewer` agent writes BRIEF.md and, after gate 1, SCRIPT.md and scenes.json, working from the decision log and the research folder alone. That keeps the drafting out of this conversation and proves the files carry every decision: anything missing from the log comes back as an open leaf instead of being filled from memory. After gate 2 the pipeline works from the three artefacts only, so nothing said in the interview leaks into the build.

## Steps

1. **Project check.** `src/lib/scenes/index.ts` must exist. If not, tell the user to run `/video-engineer:setup` and stop.

2. **Kind.** Ask with AskUserQuestion, recommending the kind the direction text points to:
   - **Narrated video**: explainer, promo or teaser with voice-over, built from scenes.
   - **App showcase or tutorial**: a narrated video that shows a running app (Playwright capture, cursor, callouts).
   - **Lyric music video**: a song plus its lyrics, cut to the beat.

   Without direction text, ask for one sentence of direction in the same turn. A lyric music video continues at step 3, then loads the `music-video` skill and follows it from its step 1; the rest of this list does not apply. The other two kinds continue at step 3 and record the kind as the Job / kind leaf.

3. **Slug.** Derive a kebab-case slug of two to five words from the direction, at most 40 characters (`cli-config-explainer`). If `videos/<slug>/` exists, append `-2`, `-3`, ... Create `videos/<slug>/research/refs/`.

4. **Preflight.** Check which MCP tools this session has: the fal MCP (`run_model`) is needed for every narrated video and every music video (voice or alignment, word timings, effects, music); the ElevenLabs MCP (`creative_generate_speech`) is optional and adds the user's own ElevenLabs voices. Name a missing fal MCP in your first question, with its setup page from the `audio` skill, so it is connected before the run, not during it.

5. **References.** Collect reference images: paths named in the direction text, and image files the user attached as paths. Copy each into `research/refs/`. Images pasted into the chat have no file; analyse those yourself by the `reference-analysis` skill and write their blocks into `research/references.md`.

6. **Dispatch researchers** before the first interview question, all in the background, each with the project root (absolute), the slug and its job:
   - `references`, with the absolute paths in `research/refs/` (skip when there are none, and record References leaves from the user's answers instead).
   - `brand`.
   - `topic`, with the direction text verbatim.
   - `app`, with the direction text verbatim, for a showcase or tutorial.

7. **Start the decision log.** Write `research/interview.md` with the header from the `video-interview` skill (direction verbatim, kind, mode).

8. **Interview.** Load the `video-interview` skill and run it: the root question first, then the frontier, one question per turn, each answer logged before the next question. Read each research file when its researcher reports and use it for the leaves that waited on it.

   **app.json.** When the App leaves for source, start and access are settled, write `videos/<slug>/app.json`: `cwd`, `start`, `url`, `readyTimeoutSec`, `viewport`, `colorScheme`, `login` and `hide` (see the `scene-manifest` skill). `cwd` and `start` are omitted when the app already runs or is a staging URL the user named. Credentials come from `{"env":"VAR"}` or `{"file":"<path relative to cwd>","match":"<regex with one group>"}` values, never literals. Then run `node "${CLAUDE_PLUGIN_ROOT}/scripts/capture.mjs" <slug> --probe` (it logs in and checks every `hide` selector) and gen-index so the interview can render the tutorial style stills. A probe failure is fixed in `app.json` now, with the user present.

9. **BRIEF.md.** When the frontier is empty, dispatch the `interviewer` agent in the foreground with job `brief`, the project root, the slug and the plugin root `${CLAUDE_PLUGIN_ROOT}`. If it replies `OPEN:`, ask those leaves, log the answers, and dispatch again.

10. **Gate 1.** Show BRIEF.md and ask: `Shared understanding? Say go and I write the script.` Apply requested changes to BRIEF.md and to the matching rows of `research/interview.md`, show it again, and ask again until the answer is go.

11. **SCRIPT.md and scenes.json.** Dispatch the `interviewer` agent with job `script`, the project root, the slug and the plugin root.

12. **Capture check.** For a showcase or tutorial, run `node "${CLAUDE_PLUGIN_ROOT}/scripts/capture.mjs" <slug>` now (free, reuses unchanged scenes). A failing step selector or target is fixed in SCRIPT.md's `Capture:` or `Steps:` lines (then `sync-script.mjs <slug>`), not left for the run.

13. **Gate 2.** Show the scene table the interviewer returned and ask: `Run the pipeline?` For a requested change, edit SCRIPT.md, run `node "${CLAUDE_PLUGIN_ROOT}/scripts/sync-script.mjs" <slug>`, show the new table, and ask again until the answer is go.

14. **Run.** Load the `run` skill and follow it for the slug. The run asks the user only on a hard failure (see its Escalation section).

Done when: BRIEF.md, SCRIPT.md, research/interview.md and scenes.json exist for the slug, `node "${CLAUDE_PLUGIN_ROOT}/scripts/validate-manifest.mjs" <slug>` exits 0, `app.json` exists and the capture check passed for a showcase or tutorial, both gates were answered with go, and the `run` skill was started. For a music video: the `music-video` skill was loaded for the slug.
