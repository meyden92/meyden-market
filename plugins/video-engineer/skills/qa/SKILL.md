---
name: qa
description: "Run the critic-gated QA loop for a narrated video-engineer video: render the 50 % draft, extract frames and a contact sheet, have the critic agent score them, write the result into scenes.json, fix only the failing scenes and re-check, at most three rounds. Use when the user asks to check, review or QA a draft, and before every final render."
user-invocable: false
---

# QA gate

Run from the Remotion project root. `<slug>` is the folder name under `videos/`; if the user gave none and `videos/` holds one project, use it. The bar is fixed: no hard failure, every axis at 8 or above, average at 8.5 or above. Never lower it, never edit the critic's output to pass.

Each round:

1. Regenerate the index so the draft shows current scene files: `node "${CLAUDE_PLUGIN_ROOT}/scripts/gen-index.mjs" <slug>`. Stop if it fails (a null `audio.durationSec` means the voice stage has not run).
2. Extract: `sh "${CLAUDE_PLUGIN_ROOT}/scripts/frames.sh" <slug>`. It renders `videos/<slug>/out/qa/draft.mp4` at 50 % and writes `out/qa/frames/`, `out/qa/contact.png`, `out/qa/contact.txt` and `out/qa/flags.txt`. A near-black extracted frame is extracted a second time, and both results are written to `flags.txt`; a bright second extraction is an extraction flake, a dark one is a real black frame. `flags.txt` also lists white-flash bursts and near-black runs measured on every draft frame, and `similar:` pairs of scenes that share a layout.
3. Write the earlier videos for the critic: `node "${CLAUDE_PLUGIN_ROOT}/scripts/fingerprint.mjs" list --data "${CLAUDE_PLUGIN_DATA}" > videos/<slug>/out/qa/fingerprints.txt`. Dispatch the `video-engineer:critic` agent. Its prompt contains only the absolute paths of `videos/<slug>/out/qa/contact.png`, `contact.txt`, `flags.txt`, `fingerprints.txt`, every file in `out/qa/frames/` and `videos/<slug>/scenes.json`, and the instruction to return the JSON object. Do not pass code, BRIEF.md, SCRIPT.md, your own opinion of the video, or the previous round's result.
4. Parse the reply as JSON. If it is not valid JSON or lacks `score`, `axes` (ten keys), `hardFailures` or `issues`, dispatch the critic once more with the same prompt; a second invalid reply stops the run with a report.
5. Write into `scenes.json`: every scene's `qa.score` is the critic's `score`; every scene's `qa.issues` is the list of `fix` strings for that scene (hard failures first, each prefixed with its rule); scenes without issues get `[]`. Edit with `node -e` and keep the rest of the file unchanged.
6. Pass when `hardFailures` is empty, every axis is at least 8 and `score` is at least 8.5. Then stop the loop.
7. On fail, fix only the scenes named in `issues` and `hardFailures`. Change that scene's custom file `src/videos/<slug>/scenes/<Id>.tsx` or its `scene.data` in `scenes.json`; do not touch other scenes, narration or audio. If a fix needs a custom scene file that does not exist yet, write it in the treatment's world (`build` skill, step 4) and re-run `gen-index.mjs`. Start the next round.

After the third failing round, stop. Report the last critic JSON, which scenes still fail and why, and what you changed in each round. Do not start a fourth round and do not relax any threshold.

Done when: the critic returned a pass and `qa.score` and `qa.issues` are written for every scene, or three rounds failed and the report names the remaining failures.
