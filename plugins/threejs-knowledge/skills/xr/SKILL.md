---
name: xr
description: "WebXR with three.js: VR and AR sessions, controllers and hands, teleport and locomotion, AR hit testing and anchors, and @react-three/xr for React Three Fiber. Use when a 3D scene should run in a headset (Quest, Vision Pro), as phone AR, or when adding VR or AR mode, controller input, hand tracking or room-scale interaction."
---

# WebXR

Checked against three r187 and `@react-three/xr` 6.6. WebXR needs HTTPS (localhost is exempt) and a user gesture to start a session.

## Vanilla three.js

```javascript
import * as THREE from "three";
import { XRButton } from "three/addons/webxr/XRButton.js";
import { XRControllerModelFactory } from "three/addons/webxr/XRControllerModelFactory.js";

renderer.xr.enabled = true;
document.body.appendChild(XRButton.createButton(renderer, { optionalFeatures: ["hand-tracking", "local-floor"] }));

renderer.setAnimationLoop((time, frame) => {
  // frame is the XRFrame while a session runs, otherwise undefined
  renderer.render(scene, camera);
});
```

- The loop must be `renderer.setAnimationLoop`. `requestAnimationFrame` does not fire inside a headset session.
- `XRButton` offers VR or AR, whichever the device supports; `VRButton` and `ARButton` offer one. The second argument is the session init: `requiredFeatures` and `optionalFeatures` such as `local-floor`, `bounded-floor`, `hand-tracking`, `hit-test`, `anchors`, `plane-detection`, `dom-overlay`.
- In a session the headset drives the camera. Move the player by moving a rig: put the camera in a `Group`, add the group to the scene, and translate or rotate the group for teleport and smooth locomotion.
- One unit is one metre and the floor is `y = 0` with the `local-floor` reference space (the default). Build at real scale: a 1.7 m eye height, objects to grab between 0.8 and 1.4 m.
- AR: create the renderer with `alpha: true`, leave `scene.background` unset, and the camera feed shows through.

### Controllers and hands

```javascript
const factory = new XRControllerModelFactory();
for (const index of [0, 1]) {
  const ray = renderer.xr.getController(index); // target-ray space: aim and select
  ray.addEventListener("selectstart", onSelectStart);
  ray.addEventListener("selectend", onSelectEnd);
  ray.addEventListener("connected", (event) => { ray.userData.handedness = event.data.handedness; });
  rig.add(ray);

  const grip = renderer.xr.getControllerGrip(index); // grip space: where the hand holds it
  grip.add(factory.createControllerModel(grip));
  rig.add(grip);
}
```

Events on the ray object: `selectstart`, `selectend`, `select` (trigger or pinch), `squeezestart`, `squeezeend`, `squeeze` (grip button), `connected`, `disconnected`. Pick with a `Raycaster` built from the ray object's world matrix. Thumbsticks and buttons come from `session.inputSources[i].gamepad` each frame. Hands: `renderer.xr.getHand(index)` with `XRHandModelFactory`. Add controllers and hands to the rig so they move with the player.

### AR hit test

Request `hit-test`, then once the session starts get a source from the viewer space and read it each frame:

```javascript
const session = renderer.xr.getSession();
const viewerSpace = await session.requestReferenceSpace("viewer");
const hitTestSource = await session.requestHitTestSource({ space: viewerSpace });

// in the loop
const hits = frame.getHitTestResults(hitTestSource);
if (hits.length > 0) {
  const pose = hits[0].getPose(renderer.xr.getReferenceSpace());
  reticle.matrix.fromArray(pose.transform.matrix); // reticle.matrixAutoUpdate = false
}
```

## React Three Fiber

```jsx
import { Canvas } from "@react-three/fiber";
import { XR, XROrigin, TeleportTarget, createXRStore } from "@react-three/xr";

const store = createXRStore({ hand: { teleportPointer: true }, controller: { teleportPointer: true } });

export function App() {
  const [position, setPosition] = useState(new THREE.Vector3());
  return (
    <>
      <button onClick={() => store.enterVR()}>Enter VR</button>
      <Canvas>
        <XR store={store}>
          <XROrigin position={position} />
          <TeleportTarget onTeleport={setPosition}>
            <mesh rotation-x={-Math.PI / 2}><planeGeometry args={[20, 20]} /><meshStandardMaterial /></mesh>
          </TeleportTarget>
        </XR>
      </Canvas>
    </>
  );
}
```

- `createXRStore()` lives outside the component tree; `store.enterVR()`, `store.enterAR()` or `store.enterXR(mode)` must run inside a click handler.
- Controllers, hands and their pointers render by default; the store options turn each off or swap it.
- Pointer events work in XR unchanged: `onClick`, `onPointerDown`, `onPointerMove` on meshes fire for controller rays, hand pinches and touch.
- `XROrigin` is the rig. Move it for locomotion; `useXRControllerLocomotion` drives it from the thumbsticks.
- AR: `useXRHitTest` and `XRHitTest` for surface placement, `XRDomOverlay` for HTML over the camera feed, `useXRSessionModeSupported("immersive-ar")` to show the button only where it works.
- On localhost in a desktop browser the store emulates a headset (`emulate` option), which is how to exercise XR code without a device.

## Performance in a headset

A headset renders two views at 72 to 120 Hz, so the frame budget is 8 to 13 ms for twice the pixels. Missing it causes discomfort, not just stutter.

- Under 100 draw calls and a few hundred thousand triangles on standalone headsets; instancing and merged static geometry matter more than anywhere else.
- No full-screen post-processing on standalone headsets. Bake lighting, use one shadow-casting light at most.
- `renderer.xr.setFoveation(1)` lowers resolution at the edges; `renderer.xr.setFramebufferScaleFactor(value)` trades sharpness for speed and must be set before the session starts.
- Never move the camera against the user's head motion. Teleport and snap turns are comfortable; smooth artificial motion needs to be optional.

## Testing

A desktop browser cannot enter a real session. Use the `@react-three/xr` emulator or the Immersive Web Emulator extension, check the non-XR view with the `visual-qa` loop, and tell the user plainly that comfort, scale and frame rate were not checked on a device.

## Common Mistakes

- `requestAnimationFrame(animate)` → `renderer.setAnimationLoop(animate)`: the window callback stops inside a session.
- `camera.position.set(0, 1.6, 3)` to move the player in VR → move the rig group: the headset pose overwrites the camera transform every frame.
- `scene.add(controller)` while the player rig moves → `rig.add(controller)`: controllers are tracked relative to the rig.
- `store.enterVR()` in an effect → in a click handler: session requests need a user gesture.
- Scene modelled in centimetres or arbitrary units → metres: XR shows the world at real scale.
