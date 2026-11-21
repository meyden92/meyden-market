# Critic seam test

Five-scene 1920x1080 fixture (frames are 50 % drafts) with three planted defects, listed in `expected.json`: text under `minTextPx` (s02), two elements entering at once (s03), an empty beat over 1.5 s (s04). The fixture is flat on purpose, so its axes fail (richness in particular); only the hard failures are asserted. `meta.style.effects` is absent, so effects are restrained.

Run: dispatch the `video-engineer:critic` agent with a prompt that holds only the absolute paths of `contact.png`, `contact.txt`, `flags.txt`, every file in `frames/`, and `scenes.json` from this directory, plus the instruction to return the JSON object. Pass when `hardFailures` names exactly the three entries of `expected.json` (same scene, frame and rule) and nothing else.
