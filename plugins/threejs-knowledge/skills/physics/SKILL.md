---
name: physics
description: "Physics for three.js scenes with Rapier: rigid bodies, colliders, fixed-step simulation synced to meshes, collision events, sensors, raycasts, joints, character controllers, and @react-three/rapier components. Use when objects must fall, collide, bounce, stack, be pushed or thrown, when a player or vehicle needs to move on terrain, or when adding hit detection or triggers to a 3D scene."
---

# Physics with Rapier

Checked against `@dimforge/rapier3d-compat` 0.21 and `@react-three/rapier` 2.2. Confirm a signature in the package's `.d.ts` files when the installed version differs.

Use Rapier for rigid-body simulation. For overlap tests alone (pick-ups, simple walls) three's own `Box3`, `Sphere`, `Raycaster` or the `Octree` and `Capsule` addons cost less than a physics engine.

## Vanilla three.js

`rapier3d-compat` embeds its WASM and needs one `await RAPIER.init()` before any other call.

```javascript
import * as THREE from "three";
import RAPIER from "@dimforge/rapier3d-compat";

await RAPIER.init();
const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
const STEP = 1 / 60;
world.timestep = STEP;

// static ground: a collider with no body
world.createCollider(RAPIER.ColliderDesc.cuboid(10, 0.1, 10).setTranslation(0, -0.1, 0));

// dynamic box: body + collider + mesh
const pairs = []; // { body, mesh }
function addBox(mesh, halfExtent) {
  const body = world.createRigidBody(
    RAPIER.RigidBodyDesc.dynamic().setTranslation(mesh.position.x, mesh.position.y, mesh.position.z),
  );
  world.createCollider(
    RAPIER.ColliderDesc.cuboid(halfExtent, halfExtent, halfExtent).setRestitution(0.3).setFriction(0.8),
    body,
  );
  pairs.push({ body, mesh });
}

let accumulator = 0;
function updatePhysics(delta) {
  accumulator += Math.min(delta, 0.1); // a stalled tab must not trigger hundreds of steps
  while (accumulator >= STEP) {
    world.step();
    accumulator -= STEP;
  }
  for (const { body, mesh } of pairs) {
    mesh.position.copy(body.translation());
    mesh.quaternion.copy(body.rotation());
  }
}
```

Call `updatePhysics(timer.getDelta())` each frame before `renderer.render`. The fixed step keeps the simulation identical at every frame rate; stepping once per rendered frame makes objects move faster on a 120 Hz screen.

- Collider sizes are **half extents** and radii: `cuboid(hx, hy, hz)`, `ball(r)`, `capsule(halfHeight, r)`, `cylinder(halfHeight, r)`.
- Units are metres, kilograms, seconds. A scene built at another scale gets floaty or jittery motion; scale the scene, or scale gravity to match.
- Body types: `dynamic()` moved by forces, `fixed()` never moves, `kinematicPositionBased()` moved by code with `setNextKinematicTranslation` and pushes dynamic bodies, `kinematicVelocityBased()` moved by a velocity you set.
- Move a dynamic body with `applyImpulse`, `addForce` or `setLinvel` (each takes a `wakeUp` flag). Writing `setTranslation` every frame teleports it and breaks collisions.
- Collider shape cost, cheapest first: ball, capsule, cuboid, `convexHull(points)`, `trimesh(vertices, indices)`. A trimesh belongs on fixed bodies; a dynamic body takes a convex hull or a compound of primitives.
- Terrain: `ColliderDesc.heightfield(nrows, ncols, heights, scale)` with `(nrows + 1) * (ncols + 1)` heights in column-major order.
- Fast small objects tunnel through thin walls: `RigidBodyDesc.dynamic().setCcdEnabled(true)`.
- Removing an object: `world.removeRigidBody(body)` (its colliders go with it) and drop the pair. Rapier objects live in WASM memory, so call `world.free()` when the scene is torn down.

### Events, sensors, raycasts

```javascript
const events = new RAPIER.EventQueue(true);
const collider = world.createCollider(
  RAPIER.ColliderDesc.ball(0.5).setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),
  body,
);
world.step(events);
events.drainCollisionEvents((handle1, handle2, started) => {
  // map handles to game objects with your own Map<handle, object>
});
```

A sensor (`ColliderDesc.ball(1).setSensor(true)`) reports overlaps through the same queue and pushes nothing. A raycast: `world.castRay(new RAPIER.Ray(origin, direction), maxDistance, true)` returns the hit collider and its time of impact, or `null`.

### Character controller

A capsule on a kinematic position-based body, moved through the controller so it slides along walls, climbs steps and sticks to slopes:

```javascript
const controller = world.createCharacterController(0.01); // skin gap
controller.enableAutostep(0.4, 0.2, true);
controller.enableSnapToGround(0.3);
controller.setMaxSlopeClimbAngle((45 * Math.PI) / 180);

// each fixed step, with `wanted` = input velocity * STEP plus gravity
controller.computeColliderMovement(capsuleCollider, wanted);
const move = controller.computedMovement();
const position = body.translation();
body.setNextKinematicTranslation({ x: position.x + move.x, y: position.y + move.y, z: position.z + move.z });
const grounded = controller.computedGrounded();
```

Keep vertical velocity yourself: add gravity each step, zero it when `grounded`, set it positive to jump.

### Debug view

`world.debugRender()` returns `{ vertices, colors }` for a `LineSegments` geometry (colors have four components per vertex). Three also ships `RapierHelper` in `three/addons/helpers/RapierHelper.js`. Draw it whenever a collider and its mesh disagree.

## React Three Fiber

```jsx
import { Physics, RigidBody, CuboidCollider } from "@react-three/rapier";

<Canvas>
  <Suspense fallback={null}>
    <Physics gravity={[0, -9.81, 0]} debug={false}>
      <RigidBody colliders="cuboid" restitution={0.3}>
        <mesh><boxGeometry /><meshStandardMaterial /></mesh>
      </RigidBody>
      <RigidBody type="fixed">
        <CuboidCollider args={[10, 0.1, 10]} position={[0, -0.1, 0]} />
      </RigidBody>
    </Physics>
  </Suspense>
</Canvas>
```

- `<Physics>` loads the WASM lazily, so it sits inside `Suspense`. It steps at a fixed 1/60 s and interpolates (`timeStep`, `interpolate`); `debug` draws every collider.
- `colliders` on `RigidBody` (or on `Physics` as the default) generates a collider from the child meshes: `"cuboid"`, `"ball"`, `"hull"`, `"trimesh"`, or `false` to place collider components by hand.
- `type`: `"dynamic"`, `"fixed"`, `"kinematicPosition"`, `"kinematicVelocity"`.
- A `ref` on `RigidBody` is the Rapier body: `ref.current.applyImpulse({ x: 0, y: 5, z: 0 }, true)`.
- Events as props: `onCollisionEnter`, `onCollisionExit`, `onIntersectionEnter`, `onIntersectionExit` (sensors: `<CuboidCollider sensor />`), `onContactForce`.
- Position a body through the `position` and `rotation` props of `RigidBody`, not of the mesh inside it; after mount, move it through the body API.
- Many identical bodies: `InstancedRigidBodies` around an `instancedMesh`.
- Joints: `useFixedJoint`, `useSphericalJoint`, `useRevoluteJoint`, `usePrismaticJoint`, `useRopeJoint`, `useSpringJoint`, each taking two body refs and anchor parameters.
- Code that must run in step with the simulation: `useBeforePhysicsStep` and `useAfterPhysicsStep`; the world itself comes from `useRapier()`.

## Common Mistakes

- `ColliderDesc.cuboid(width, height, depth)` → `ColliderDesc.cuboid(width / 2, height / 2, depth / 2)`: sizes are half extents, so full sizes make every collider twice as large as its mesh.
- `world.step()` once per frame → an accumulator with a fixed `world.timestep`: simulation speed otherwise follows the display refresh rate.
- `mesh.position.set(...)` on a simulated object → move the body: the next sync overwrites the mesh.
- `ColliderDesc.trimesh(...)` on a dynamic body → `convexHull` or primitives: trimesh bodies have no volume and pass through each other.
- `new RAPIER.World(...)` before `await RAPIER.init()` → init first: the compat build throws on any call before its WASM is ready.
- A physics body scaled through its mesh → size the collider: Rapier ignores three.js scale.

## See Also

- `interaction` for raycasting against meshes and camera controls.
- `animation` when a character's animated mesh rides on a physics capsule.
- `performance` when the simulation dominates the frame: fewer and simpler colliders, sleeping bodies, physics in a worker.
