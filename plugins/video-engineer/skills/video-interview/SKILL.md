---
name: video-interview
description: "The video-engineer interview method: the fixed design tree for a video (root, eight branches, leaves), frontier order, the question format with a recommended answer and its source, evidence order, the decision log, roast mode, convergence and the two gates. Use when running or resuming the interview for /video-engineer:new, or when checking whether a decision log covers every leaf."
user-invocable: false
---

# Video interview

Interview the user until every leaf of the design tree below holds a decision. One question per turn, each with a recommended answer the user can accept with "ok". The tree is fixed: never add a branch, never skip one.

## The design tree

Root: **What job must this video do?** Ask it first, always, with a recommendation drawn from the direction text.

Top row (settles first):

| Branch | Leaves |
|---|---|
| **Job** | kind (explainer, showcase, tutorial; asked by `new` before the interview, logged here) · viewer (who, where they watch) · action after watching · promise (one sentence) |
| **Format** | platforms · canvas (16:9 1920x1080, 9:16 1080x1920, 1:1 1080x1080) · duration band (`meta.targetSec`) · fps · cuts (9:16, 1:1, none) · safe zones |
| **References** | per screenshot: what to take, what to reject · minimum text size (px) |

Bottom row (each branch opens only when the branch above it is settled):

| Branch | Depends on | Leaves |
|---|---|---|
| **Direction** | Job, References | treatments (three, with style frames, each saying what it is made of and why it fits) · chosen treatment · palette (hex, roles) · type (families, weights) · density · motion language · signature scene |
| **Story** | Job, Direction | hook · arc and sections with target seconds · CTA · scene count and pacing · on-screen text policy |
| **Voice and sound** | Format | language · TTS provider · voice gender and age · voice (picked from samples) · voice style · pace (measured) · pronunciation (URLs, extensions, acronyms, brand words) · tone words · music mood and energy curve · SFX density (none / cuts / rich) · SFX volume · captions on or off and their style |
| **App** | Job | app source (project path or URL) · start and readiness (command, URL) · access (test account or seed data, and where the values come from) · features and flows (ordered steps per feature, which scenes) · capture viewport and theme · what to hide |
| **Assets and constraints** | References | existing files used (brand, logos, screenshots; size checked) · image model and key · style sheet · deadline · budget cap per service · legal (logo use, music licence for ads or broadcast) |

The **frontier** is every open leaf whose branch is open: the root first, then top-row leaves, then the leaves of each bottom-row branch once its parent is settled. From the frontier, ask the most **load-bearing** leaf: the one whose answer reshapes the most others. Platform and duration band come before fps; language before TTS provider, provider before voice gender and age, and those before any voice sample; voice before voice style, style before pace; the chosen treatment before the arc (its device and form shape the story); arc before scene count.

One question may settle several leaves of one branch when a single recommendation covers them all ("1080x1920 · 30 fps · 30-45 s · Reels and Shorts"). Ask a leaf alone when the user is likely to disagree with it or when it reshapes the tree (platform, length, language, the promise).

## Facts are looked up, decisions are asked

A fact is something a file, a sub-agent or a skill can answer. Never put a fact to the user as a question. Facts come from:

- `research/brand.md`: brand palette, fonts, logos, voice id, and decisions from earlier BRIEF.md files.
- `research/references.md`: what each screenshot shows (layout, palette, type, density, motion, platform UI).
- `research/topic.md`: claims about the product or topic, with sources.
- `research/app.md`: the app's start command, port, routes, seed or fixture file paths and field names.
- the `platform-norms` skill: safe zones, duration bands, caption sizes, hook timing per platform.
- the session: whether the fal MCP and the ElevenLabs MCP tools are available.

When kind is explainer, log every App leaf as `n/a: no app shown`. For a showcase or tutorial, `app.md` supplies the facts; ask only decisions (which features, their order, what to hide, viewport and theme). Seed files are recorded by path and field name, never credential values.

A leaf answered entirely by a fact (safe zones once the platform is chosen, the brand palette when `brand.json` has one) is recorded with its source and shown in BRIEF.md, not asked. A lookup that is still running blocks only the leaves that need it; keep asking from the rest of the frontier. When `topic.md` lists a claim from the direction under "Not found", the user is the only source: put it to them inside the leaf that rests on it (usually Job / promise) and log where the fact comes from.

## Question format

```
❓ **<Branch>**: <the evidence that bears on it, then the question; options when there are several>

➡️ <recommended answer>: <its source, in one clause>.
```

Example:

```
❓ **Format**: Reels cut off at 90 s and your references are all 20-40 s. A 45 s hook video or the full 6-minute explainer?

➡️ 6 minutes: your direction text says "full walkthrough", and a 45 s cut can be derived later as its own script.
```

Draw each recommendation from the first source that has an answer, in this order, and name it:

1. the user's earlier briefs and brand profile (`research/brand.md`)
2. the reference analysis (`research/references.md`)
3. the `platform-norms` skill
4. general judgement ("judgement: ...")

## Visual choices as stills

When a leaf is a look or a type choice (palette and texture, lyric typeface, refrain treatment, a scene's style), do not describe options in words. Render the same frame in 2 or 3 options with the real fonts and colours, save the stills under `videos/<slug>/research/choices/`, show them with absolute paths, then ask with a recommendation. Record the chosen option and its still in `interview.md`. Do this before the question, not after.

References show craft (layout, density, timing, finish), not a style to copy. Take the craft; the look is chosen by the user.

## Direction leaves

Load the `direction` skill when the Direction branch opens and follow it: write `research/directions.md` (the default line and three treatments), render a style frame per treatment, then ask which treatment, with a recommendation. The chosen treatment settles palette, type, density, motion language and signature scene at once; ask any of them alone only when the user changes it ("treatment 2, but in our brand blue"). With a fixed brand palette or font, record it from `research/brand.md` and let the treatments differ on the other axes. A lyric music video runs this method inside the `music-video` skill (its step 5), with the direction skill's Lyric music video section.

**Tutorial style** is a look choice. Once `videos/<slug>/app.json` exists, run `capture.mjs <slug> --probe` and gen-index, then render each option (cursor arrow or dot, highlight spotlight or outline, maxZoom) with the palette, font and minTextPx already decided:

```
npx remotion still tutorial-probe videos/<slug>/research/choices/tutorial-<n>.png --frame=80 --props='{"capture":<contents of public/capture/probe.json>,"image":"public/img/probe.png","style":{"palette":[...],"font":"...","minTextPx":N,"tutorial":{"cursor":"arrow","highlight":"spotlight","maxZoom":2}}}'
```

The decision becomes `meta.style.tutorial`. Check maxZoom against `minTextPx` before recommending it: app text of `h` CSS px in a capture of viewport width `v` shows at `h x zoom x canvas width / v` px, so the text the scene focuses on (step targets, callout targets, text the narration reads) must reach `minTextPx` at the zoom used there. A 14 px label in a 1440 px viewport on a 1920 canvas needs a zoom of about 1.9 for 36 px.

## Voice and sound leaves

Voice leaves follow the `audio` skill (providers, samples, pace); load it before the first of them.

- **TTS provider** is asked with the options from the `audio` skill's provider table that the session can reach: Gemini Flash TTS (fal) for delivery directed in plain words, ElevenLabs v4 via fal for premade voices with audio tags, the ElevenLabs MCP for the user's own, library or designed voices. Recommend by language, tone and the voices the brand already uses (`research/brand.md`).
- **Voice gender and age** is asked before any voice is suggested or sampled ("young woman, soft" or "calm man in his forties"). Suggest only voices that match it.
- **Voice**: make 2 or 3 samples as the `audio` skill's Voice samples section says for the chosen provider (free previews on the ElevenLabs MCP; a short paid line per voice on fal, with the cost stated first), send them with absolute paths, and ask with a recommendation. The chosen voice name or id goes into the brief.
- **Voice style** is the delivery direction for the whole video ("calm and warm, slightly fast" for Gemini; `[calm]` for ElevenLabs). Recommend one from the tone words and references, render the sample line with it, and ask. Scenes that need another delivery are marked later in the script with `Voice:` lines.
- **Pace**: once voice and style are chosen, state the cost (one sample of 25-40 words plus its transcription) and, after a yes, measure it as the `audio` skill's Pace section says. Log the measured words per minute (source `measured: research/pace.json`). The script is written to this rate.
- **Pronunciation**: list every URL, file extension, acronym and brand word the narration will say, with the spoken form you recommend ("lunashare.app" → "lunashare dot app"). The user confirms or corrects the list; the script spells narration that way.
- **SFX volume**: recommend 0.15 (effects sit clearly under the voice); quieter (0.08-0.1) for calm briefs. Effects at 0.3 were too loud and too present under narration in an earlier video.

## Existing files

For each brand file, logo or screenshot the video will use, read its pixel size (the PNG header, or `npx remotion ffprobe`) while the interview runs. A file below the asset contract's size for its layer is raised now, inside the Assets leaf: deliver a larger file, accept it softer, or replace it with a vector rebuild. It is not left for the asset check after gate 2.

Honour answers downstream: a chosen option overrides the earlier plan, and the storyboard and script are updated before any build starts (a "loud bridge" choice once almost shipped as the dark version because the storyboard still described the dark one).

## Answers

- "ok", "yes", or silence on the recommendation: record the recommendation as the decision, source "accepted".
- Any other answer: record it, source "user".
- "you decide": choose, record the decision with its reason, source "you decide". It is a decision like any other and appears in BRIEF.md under Decisions.

After every answer, append the settled leaves to `videos/<slug>/research/interview.md` before asking the next question, then recompute the frontier: an answer can settle other leaves or make them moot (no music means no music mood). Record a moot leaf as "n/a: <reason>".

`research/interview.md` is the decision log. The BRIEF.md writer reads only this file and the research folder, so every decision lives there. Write one row per leaf, with the branch and leaf names exactly as in the tree; a looked-up value is copied as the source states it:

```markdown
# Interview: <slug>
Direction: <the direction text verbatim>
Mode: normal | roast

| Branch | Leaf | Decision | Source |
|---|---|---|---|
| Job | promise | One command sets up a typed config | accepted |
| Format | safe zones | 1080x1920: top 270, bottom 670, sides 65 px | looked up: platform-norms |
| Voice and sound | voice gender and age | calm man, around 40 | user |
| Voice and sound | TTS provider | Gemini Flash TTS via fal (google/gemini-3.8-flash-tts) | accepted |
| Voice and sound | voice | Charon | accepted: sample 2 of 3 |
| Voice and sound | voice style | calm and warm, slightly fast | user |
| Voice and sound | pace | 152 wpm | measured: research/pace.json |
```

## Roast mode

With `--roast`, lead every question with the strongest objection to the user's stated direction before the evidence: "your references are all talking-head reels; an animated explainer will not look like them." Then ask, then recommend. The tree, the log and the artefacts are the same.

## Convergence

The interview is done when the frontier is empty: every leaf has a row in `research/interview.md`. The question count follows from the tree, not from a target: a short with clear references usually takes 5-8 questions, a 6-minute explainer 15-25.

## The two gates

Ask each gate verbatim and wait for the answer.

1. After BRIEF.md is written and shown: `Shared understanding? Say go and I write the script.`
2. After SCRIPT.md and scenes.json are written and the scene table is shown: `Run the pipeline?`

An answer other than "go" or "yes" at a gate is a change request: apply it, show the result again, ask the same gate again. After "go" at gate 2, the pipeline asks nothing more except on a hard failure (see the `run` skill's Escalation). Anything else unclear downstream is resolved from the brief and logged in `research/decisions.md`.

Done when: every leaf of the tree has a row in `research/interview.md`, each with a decision and a source, and both gates were answered with go.
