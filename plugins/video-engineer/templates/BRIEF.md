# <Title>

## Job
Kind: <explainer, showcase or tutorial>
<One sentence: who watches, where, and what they do after watching.>

## Audience
<Who they are, what they already know, what they care about.>

## Promise
<The one claim the video makes, in one sentence.>

## Format
<width>x<height> · <fps> fps · <min>:<ss>-<max>:<ss> · <platforms> · cuts: <9:16, 1:1 or none>
Safe zones: <px margins from the platform-norms skill for each canvas>

## References
<Per screenshot: file, what we take, what we reject. Details: research/references.md>

## Direction
Treatment: <name> · style frame <research/choices/direction-<n>.png>
Idea: <the one visual idea only this subject carries>
World: <medium and material, and how it moves>
Made of: <the sources the frames come from: captures, rebuilt UI, generated images, code-drawn diagrams and type, 3D, effects>
Device: <how the story is told>
Form: <how scenes connect>
Signature: <scene id and what happens there>
Departs from: <the Default line from research/directions.md>

## Visual system
Palette: <#RRGGBB list with roles, ground first>
Type: <display family> / <body family>, weights <list>, minimum <px> on the main canvas
Density: <low / medium / high, with what it means here>
Ground: <what the background is made of; "mesh" only for a gradient mesh with grain and vignette>
Effects: <restrained, or allowed when glow, bloom or colour split belong to the treatment>
Motion language: <ease by role, spring tier, arrival frames, stagger, holds, the current, transition family, title entrance>
Do not: <list>

## Structure
<hook (target s) → section (target s) → ... → CTA (target s); the seconds add up to the Format band>

## Voice
Language: <BCP 47 tag, e.g. en-US>
Voice: <provider (fal or elevenlabs-mcp)> · model <fal endpoint id or ElevenLabs model id> · voice <name or id> · <gender and age the user asked for> · settings <JSON, or "none">
Voice style: <delivery direction for the whole video, e.g. "calm and warm, slightly fast" (Gemini) or "[calm]" (ElevenLabs)>
Pace: <words per minute measured with this voice (research/pace.json)>
Pronunciation: <how the voice says URLs, extensions, acronyms and brand words, written as spoken ("lunashare.app" → "lunashare dot app"), or "none">
Tone: <three to five words>
On-screen text: <policy: what text appears, never the narration restated>
Captions: <on or off; style from the treatment: position per layout, words at once, how the spoken word is marked, type, plate or none>

## Sound
Music: <mood, energy curve across the structure, music prompt>
Music duck: <0-1>
SFX density: <none / cuts / rich, with what that means here>
SFX volume: <0-1, default 0.15; how present the effects are under the voice>
Library sounds: <library ids used (lib:<id>), or "none fit">

## App
<Showcase or tutorial: "none: no app shown" for an explainer.>
Source: <project path or URL>
Start: <command and ready URL, or "already running">
Access: <test account or seed data, and the env var or seed file the values come from; never the values>
Flows: <ordered steps per feature, with the scene that shows each>
Capture: <viewport, color scheme>
Hide: <areas and selectors that must not be visible>
Tutorial style: <cursor, highlight, maxZoom and the chosen still in research/choices/>

## Assets
Existing: <paths of brand files, logos, screenshots that are used>
Generated: <what gets generated per layer>
Image model: <model, or "manual: prompts only">
Style sheet: <the verbatim meta.style.sheet string>

## Constraints
Deadline: <date or none>
Budget: <cap per service, e.g. fal spend for voice, effects and music, image API spend>
Platforms: <where it is published>
Legal: <logo use, music licence for ads or broadcast, third-party screenshots>

## Decisions
<Every leaf settled by "you decide" or by an accepted recommendation, one line each: leaf: decision (reason or source)>
