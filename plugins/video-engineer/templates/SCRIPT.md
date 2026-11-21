# <Title>

<!-- One "## sNN · <section>" block per scene, in playback order. Narration first, then the field lines.
     Edit freely, then ask Claude to update the video; the run resyncs scenes.json with scripts/sync-script.mjs.
     Format rules: video-engineer brief-and-script skill. -->

## s01 · <section>

<Narration as plain prose: one idea, 8-20 s at the voice's measured rate (19-46 words at 140 wpm).>

Type: <one of: title illustration layered diagram counter list code terminal screenshot screencast comparison quote cta custom>
On screen: <what the viewer sees: data, labels, UI or code; never the narration restated>
Motion: <entrance> · <camera> · <transitionIn>
Voice: <optional: delivery for this scene only, replacing the video's voice style>
Data: <optional JSON object with the visualType's data keys, on one line>
Capture: <app scenes only, one-line JSON: {"shot":"<kebab>","record":false,"steps":[...],"targets":{"<name>":"<selector>"}}>
Steps:
- "<spoken word>": <move|click|type|highlight|zoom|unzoom|callout|badge|clear> <target> ["<text>"]
Assets:
- s01-<name>.png (<background|subject|overlay|screenshot>[, <scale>x when camera or cuts magnify it]): <subject-only prompt, no style words>
SFX:
- <seconds into the scene>: <short sound prompt>
