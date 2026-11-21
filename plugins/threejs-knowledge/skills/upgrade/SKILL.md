---
name: upgrade
description: "Brings the threejs-knowledge plugin's skills and outdated-API lint rules up to the newest three.js release. Use when the user asks to refresh, update or re-verify the three.js skills, or after a new three.js release."
disable-model-invocation: true
---

# Refresh the skills for a new three.js release

Run from a checkout of the marketplace that holds this plugin; the installed copy in the plugin cache is replaced on every update. `${CLAUDE_SKILL_DIR}/../..` is the plugin root.

1. **Find the gap.** The release the skills target is `SKILLS_TARGET` in `scripts/threelib.py`. The newest release is `npm view three version`. Stop here when they match.
2. **Read what changed.** Fetch the three.js migration guide (`https://github.com/mrdoob/three.js/wiki/Migration-Guide`) and the release notes for each release after the target. List every rename, removal, deprecation and behaviour change with its release number. Do the same for React Three Fiber, drei, `@react-three/rapier`, `@dimforge/rapier3d-compat` and `@react-three/xr` when their major or minor version moved.
3. **Install the new release** in a scratch folder (`npm install three@latest` and the packages above). This is the ground truth: grep `node_modules/three/src` and `node_modules/three/examples/jsm` to confirm each listed change, and to confirm any name a skill uses still exists.
4. **Update the skills.** For each change, edit every `skills/*/SKILL.md` that shows the old API: the examples, the prose, and a new line in that skill's Common Mistakes in the form `` `old` → `new`: reason with the release number ``. Update the "Targets" or "Checked against" line at the top of each skill.
5. **Update the lint rules.** For each rename, removal or deprecation that a regular expression can detect in one line of source, add a rule to `scripts/rules.json`: `id`, `since` (the release where the old form became wrong), `pattern`, `fix`. A rule must not match current, correct code: run `three-check` over `node_modules/three/examples/jsm` of the new release and remove or narrow any rule that fires there.
6. **Set the target.** Change `SKILLS_TARGET` in `scripts/threelib.py`.
7. **Run the examples.** For every skill whose examples changed, run one of them in the scratch folder and check it with the `visual-qa` loop.
8. **Release.** Bump `version` in `.claude-plugin/plugin.json`, add a CHANGELOG entry naming the three.js release, and run `claude plugin validate --strict` on the plugin.

**Done when** every change from step 2 is reflected in a skill or deliberately skipped with a stated reason, `three-check` is silent on the new release's own examples, and the validator passes.
