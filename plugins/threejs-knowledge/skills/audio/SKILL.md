---
name: audio
description: "Sound in three.js scenes: the AudioListener, global and positional audio, distance falloff and directional cones, loading and reusing buffers, autoplay unlocking, audio-reactive visuals with AudioAnalyser, and drei's PositionalAudio for React Three Fiber. Use when a 3D scene needs sound effects, ambience, music, 3D spatial audio, or visuals that react to music."
---

# Audio

three.js audio wraps the Web Audio API: one `AudioListener` on the camera, `Audio` for sound that ignores position, `PositionalAudio` for sound that sits in the scene.

## Setup

```javascript
import * as THREE from "three";

const listener = new THREE.AudioListener();
camera.add(listener); // the camera must itself be in the scene graph or updated each frame

const loader = new THREE.AudioLoader();
const buffers = {
  music: await loader.loadAsync("audio/theme.mp3"),
  engine: await loader.loadAsync("audio/engine.ogg"),
};

// global: music, UI
const music = new THREE.Audio(listener);
music.setBuffer(buffers.music);
music.setLoop(true);
music.setVolume(0.4);

// positional: attached to the object that emits it
const engine = new THREE.PositionalAudio(listener);
engine.setBuffer(buffers.engine);
engine.setLoop(true);
engine.setRefDistance(2);      // full volume inside this distance
engine.setRolloffFactor(1.5);  // how fast it fades beyond it
engine.setDistanceModel("inverse");
car.add(engine);
```

## Unlocking playback

Browsers keep the audio context suspended until the user interacts with the page. Start sound from a click, tap or key handler:

```javascript
startButton.addEventListener("click", async () => {
  await listener.context.resume();
  music.play();
  engine.play();
}, { once: true });
```

A scene that should have sound from the start needs an explicit "Start" or "Enable sound" control. `play()` before the unlock logs a warning and stays silent.

## Positional sound

- **Distance models**: `inverse` (default, natural, never quite silent), `linear` (reaches silence at `setMaxDistance`), `exponential`. `refDistance` is the scale to tune first: set it to roughly the size of the emitter.
- **Cones**: `setDirectionalCone(innerAngle, outerAngle, outerGain)` in degrees makes a source directional (a speaker, a voice). The cone points along the object's local +Z.
- `PositionalAudioHelper` from `three/addons/helpers/PositionalAudioHelper.js` draws the cone while tuning.
- Positional sources are mono in effect: a stereo file is panned as a whole, so export effects as mono.
- The listener's position and orientation come from the camera's world matrix. A camera that is never rendered or never added to the scene gives no updates.

## One-shots and many sources

A playing `Audio` object cannot overlap itself. For repeated effects (footsteps, shots, impacts) keep a small pool of `PositionalAudio` objects that share one buffer, pick an idle one (`isPlaying === false`), move it to the event's position and play. Vary each shot slightly so repeats do not sound mechanical:

```javascript
shot.setPlaybackRate(0.94 + Math.random() * 0.12);
shot.setVolume(0.7 + Math.random() * 0.2);
if (shot.isPlaying) shot.stop();
shot.play();
```

Long music and ambience: stream through a media element instead of decoding the whole file: `music.setMediaElementSource(audioElement)`, and control playback on the element.

Fade with the gain parameter, not by stepping the volume per frame: `sound.gain.gain.linearRampToValueAtTime(0, listener.context.currentTime + 1.5)`.

## Audio-reactive visuals

```javascript
const analyser = new THREE.AudioAnalyser(music, 256); // fftSize; 128 frequency bins
// each frame
const level = analyser.getAverageFrequency() / 255;    // 0..1 overall energy
const bins = analyser.getFrequencyData();               // Uint8Array, low to high frequency
```

Smooth the values before driving visuals (`value += (target - value) * 0.15`) and drive scale, emissive intensity or a shader uniform. For a spectrum in a shader, upload `bins` as a `DataTexture` with `RedFormat` and set `needsUpdate` each frame. Bass sits in the first few bins; averaging bin ranges gives usable low, mid and high bands.

## React Three Fiber

```jsx
import { PositionalAudio } from "@react-three/drei";

<mesh>
  <PositionalAudio ref={sound} url="/audio/engine.ogg" distance={2} loop />
</mesh>
```

drei's `PositionalAudio` creates the listener on the camera and loads the file through `Suspense`; `distance` is the ref distance. Leave `autoplay` off and call `sound.current.play()` from a pointer handler, for the same unlock reason.

## Cleanup

Stop sounds and disconnect them when their object is removed (`sound.stop(); sound.disconnect()` when it has a source), and remove the listener from the camera when the scene is disposed. Decoded buffers are large (about 10 MB per minute of stereo); keep effects short and share buffers.

## Checking

Sound cannot be verified through screenshots. Check in the browser console that `listener.context.state` is `"running"` after the unlock click and that `sound.isPlaying` is true, and tell the user that loudness, falloff and mix were not heard.

## Common Mistakes

- `music.play()` at load → play inside a user-gesture handler after `listener.context.resume()`: the context starts suspended.
- `scene.add(listener)` → `camera.add(listener)`: the listener must follow the view.
- `new THREE.AudioLoader().load(url, ...)` once per sound instance → load once, share the buffer between instances.
- One `Audio` object replayed for overlapping effects → a pool: a playing instance cannot overlap itself.
- `refDistance` left at 1 in a scene measured in hundreds of units → set it to the emitter's size: the sound is inaudible a few metres away.
