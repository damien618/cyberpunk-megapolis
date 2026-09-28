# Wildlife: adding an animal to the island

The island's animals run on one generic system. A species is **one module** that exports a definition. A map lists the species it wants in **one roster file**. The engine handles placement, behaviour, activation near the player, instancing and animation.

The reference species is the shore crab, `wildlifeCrab.js`. Copy its shape.

| File | Role |
|---|---|
| `wildlife.js` | Engine. It holds the agent pool, the state machine, habitat sampling, activation near the player, one InstancedMesh per species, and the creature material (GLSL splice). It is map-agnostic. |
| `wildlifeMotion.js` | Locomotion kinds (`ground`, `hop`, `flyFree`, …). Each unimplemented kind has a brief of what it should do. |
| `wildlifeBoids.js` | Pure boids (no THREE), for schools and flocks. |
| `wildlifeCrab.js` | Reference species: model, animation GLSL, behaviour hooks, definition. |
| `jungleWildlife.js` | The cove's roster, plus the **layout adapter** (ground, water, rocks). |
| `tests/jungle_wildlife.{mjs,py}` | Habitat, determinism, states, draw count, shader, cost and boids checks. |
| `tests/wildlife_preview.py` | Renders one species alone on flat ground (idle, moving, alarmed) in about 15 s, without booting a map. |

## Budget

The map has these limits (MacBook Air M3 8 GB). The baseline in September 2026 was 81–163 draw calls and 0.3–0.6 M triangles, at 60 fps in every view.

The **whole roster** must stay within:
- **+12 draw calls** at most, which is about 1 per species;
- **25 k triangles** visible;
- **0.6 ms** CPU in `wildlife.update`.

The crabs use +1 draw call, about 3 k triangles and 0.02–0.04 ms. Keep each species' model at **400 triangles or fewer** (a fox or a pelican can go to about 800 if there are only 2 or 3 of them). Leave `castShadow` off for small animals, and bake a dark underside instead (`bottomColor`).

## Checklist: adding a species

1. **Create `wildlifeXxx.js`**, copied from `wildlifeCrab.js`. It exports `buildXxx()`, `XXX_GLSL` and the `XXX` definition.
2. **Build the model** from primitives, with `creaturePart` and `limbGeometry`, and merge it with `mergeCreatureParts`:
   - the local frame is **+Z front**, +X right, and **y = 0 the ground**;
   - tag each piece with a part id and its joint (the pivot).
3. **Check it** with `.venv/bin/python tests/wildlife_preview.py wildlifeXxx.js XXX scratch/xxx.png` (add `--top` for a view from above). Read the PNG.
4. **Pick the motion.** If the one you need is still a stub in `wildlifeMotion.js`, implement it there, following its brief and the contract at the top of the file.
5. **Write the habitat**, then the hooks, but only where the defaults are wrong.
6. **Add it to the map's roster** (`jungleWildlife.js`), with a `region` so sampling does not waste tries across the whole valley. If it needs a layout name that does not exist yet (flowers, offshore rocks), add that name to the adapter; do not change `jungleLayout.js`.
7. **Test and measure:**
   - add checks to `tests/jungle_wildlife.mjs`: habitat, states, draw count;
   - run it together with `jungle_vegetation.py` and `jungle_layout.py`;
   - capture it in the map;
   - do one headed perf pass (see Verification).
8. **Bump the `?v=` tag** of every module you changed, in the file that imports it. For the map shell, the tag is in `index.html`.

## The definition

Anything you leave out takes the value in `DEFAULTS` (in `wildlife.js`). A map entry `{ def, ...overrides }` is merged over the definition, one level deep for `habitat`, `fear`, `speed`, `body`, `timings` and `hooks`.

| Key | Meaning (crab value) |
|---|---|
| `id` | Unique name. It seeds the species' RNG and keys the shader program (`'crab'`). |
| `motion` | `ground` \| `hop` \| `flyFree` \| `glide` \| `flock` \| `school` \| `amphibious` |
| `count` | How many (30). The map may override it. |
| `habitat` | Where it can live (see below). |
| `spacing` | Minimum distance between homes, in metres (0.8). |
| `homeRange` | Radius it wanders in around its home (3). |
| `activeRadius` | Beyond this distance from the player, it is frozen and not drawn (38). |
| `fear` | `radius` walking, `runRadius` when the player runs (> 3 m/s), `calmDistance` before coming back out, `hideFor` `[min,max]` seconds, or `null` to never hide. |
| `speed` | `walk`, `flee` (m/s), `turn` (rad/s). |
| `strideRate` | Radians of leg cycle per metre covered (38). |
| `body` | `yawOffset` + `sideways` (a crab walks along its ±X), `alignToGround`, `lift`, `sinkDepth`/`sinkTime` (burrowing), `scale` `[min,max]`. |
| `timings` | `idle` `[min,max]`, `move` `[min,max]`, `alert` in seconds (0 skips ALERT). |
| `build` | `() → { geometry }`, the merged creature geometry. |
| `animGLSL` | Vertex-shader body (see Animation). |
| `tint(rng, color)` | Per-individual colour, multiplied over the vertex colours. |
| `hooks` | `init`, `tick`, `pickWander`, `fleeTarget`, `hideAt`, `emergeAt` (see States). |
| `castShadow` | `false` for small animals. |

### Habitat

Every key is optional, and all present keys must pass. The engine checks the cheap keys first.

```js
habitat: {
  region: { x: [-78, 78], z: [-32, 12] },   // sampling box (default: layout.bounds)
  soils:  ['SAND', 'WET'],                 // names of layout.SOIL
  slope:  [0, 0.3],                        // tangent: 0 flat, 1 = 45°
  height: [min, max],                      // ground altitude
  shore:  [1.5, 13],                       // layout.shoreDistance: metres above the sea's waterline
  avoid:  { path: 1.6, jetty: 1.2 },       // at least this far from layout.distances.*
  within: { pool: 4 },                     // at most this far from layout.distances.*
  near:   { rocks: 6, share: 0.55 },       // this share of homes is within 6 m of a rock
  test:   (x, z, layout) => true,          // anything the keys cannot express
}
```

The cove's soils are `SHALLOW, WET, SAND, DIRT, FOREST, ROCK` (`jungleLayout.soilAt`). Its distances are `path, stream, pool, jetty, rocks`.

## States and hooks

```
IDLE ⇄ MOVE                 wander inside homeRange
→ ALERT → FLEE              the player came within fear.radius (runRadius if running)
→ HIDDEN → EMERGE → MOVE    safe in its refuge, then back out once the player is past calmDistance
```

A flight that has not arrived after 6 s ends where it is. Every hook gets `(a, sp, ctx, api)`:
- `a` is the agent (`x, y, z, yaw, heading, tx, tz, state, timer, home, sink, gait, mood, …`);
- `sp.def` and `sp.rng` are the species definition and its RNG;
- `ctx` holds `t, px, pz, pSpeed, layout, STATE`;
- `api` holds `setTarget(a, sp, x, z)`, `defaultWander`, `defaultFlee`.

| Hook | When it runs | Default |
|---|---|---|
| `init(sp, layout)` | Once, before sampling. | none |
| `tick(a, sp, ctx, dt, api, threat)` | Every think, before the machine runs. Return `true` to take the frame. | none |
| `pickWander` | IDLE → MOVE | A habitat-valid point within `homeRange`. |
| `fleeTarget` | ALERT → FLEE | Straight away from the player. |
| `hideAt` / `emergeAt` | Entering HIDDEN / EMERGE | Stays where it is. |

The crab uses two of them. `tick` backs it up the beach ahead of each run of the swash. `fleeTarget` picks the nearest refuge that is not toward the player: under a rock, into the sea, or else a short dash before digging in.

## Animation (no skeleton)

`build()` tags every vertex with two values:
- `aPart` (float): the part id, e.g. crab 0 body, 2 claws, 3 eyes, 10–13 legs;
- `aPivot` (vec3): the joint the part swings about.

The engine writes `aAnim` (vec4) per instance:

| Component | Meaning |
|---|---|
| x | Idle phase (random per individual) |
| y | Gait, 0..1 (speed / flee speed) |
| z | Mood, 0..1 (1 in ALERT and FLEE) |
| w | Stride in radians (advances with the distance covered, so feet do not slide) |

Your `animGLSL` runs after `begin_vertex`. It edits `transformed` (object space) and can use `uTime` and `wlRotX/Y/Z(p, pivot, angle)`.

Normals need no work, because flat shading derives them per face. Some examples:
- a snake's undulation is `transformed.x += sin(transformed.z * k - aAnim.w) * a`;
- wings are `wlRotZ` about the shoulder, with `sin(uTime * rate + aAnim.x)`.

## Motions: status and briefs

| Motion | Species | Status |
|---|---|---|
| `ground` | crab, fox, lizards, snake | **implemented** |
| `hop` | tree frogs | stub: ballistic hops; fleeing means a hop into `layout.waterAt` (the pool) |
| `flyFree` | dragonflies, hummingbirds | stub: hover at anchors, darting zigzags, altitude band |
| `glide` | bald eagle | stub: banked circles around a drifting centre |
| `flock` | brown pelicans | stub: follow-the-leader line through `wildlifeBoids` |
| `school` | pool fish | stub: 3-D `wildlifeBoids` between bed and surface (`boxBounds` or a custom bound) |
| `amphibious` | sea lions | stub: `ground` on haul-out rocks, surface swim (`layout.seaHeightAt`), dives |

## Planned roster (Channel Islands)

| Species | Motion | Habitat, from layout | Still needed |
|---|---|---|---|
| Island fox (2–3, cat-sized, grey back, rust flanks) | ground | `soils: ['FOREST','DIRT']`, `avoid: { stream }`, bold (`fear.radius` about 5, no hiding; trots off into dense forest) | a `fleeTarget` toward high `forestDensity` |
| Side-blotched lizard, alligator lizard | ground (fast darts, long idles) | `within: { rocks: 1.5 }`, soil ROCK or next to it | none (rock spots exist) |
| King snake / rattlesnake (1–2) | ground + body-wave GLSL | `soils: ['FOREST']`, `avoid: { path: 2 }`, slow and shy | none |
| Tree frogs | hop | wet rocks round the pool: `within: { pool: 2 }`, `soils: ['WET','ROCK']` | the `hop` motion |
| Dragonflies | flyFree | over the pool and stream: `within: { pool: 6 }` | the `flyFree` motion |
| Silver fish | school | inside the pool (`waterAt(x,z).kind === 'pool'`) | the `school` motion |
| Brown pelicans | flock | over the sea, beyond the wade barrier; not frightened | the `flock` motion and a loop path |
| Hummingbirds | flyFree | by flowers | a `flowers` spot list, from `jungleVegetation`'s `spots` |
| Bald eagle (1) | glide | above the ridge and cliff; not frightened | the `glide` motion |
| California sea lions | amphibious | offshore rocks | haul-out rocks offshore (in their module or in `jungleTerrain`), plus the `amphibious` motion |

## Rules that bite

- **Import `jungleLayout.js` bare** (no `?v=`). Two URLs make two module instances.
- **Nothing goes on `world`**, or cityBoxes would turn animals into walls and camera occluders. The engine adds its group to `scene`.
- **Never use the map's shared `rnd()`.** Each species has its own seeded RNG, so adding one never moves a rock or a palm.
- **Species sit on the analytic terrain, with no raycasts.** In the forest, `terrainHeight` walks the path polyline, and `soilAt` costs about 6 heights. Use them for sampling and hooks, not per vertex.
- **Life size can be too small.** A 5 cm crab is a speck from the chase camera, 5 m behind the player. The crab is modelled at about 2.5× life size.
- **`camera.fov` cannot zoom a capture.** The camera rig resets it every frame. Place the player instead (`ctrl.rescueTo`, then wait about 7 s for the rig to settle).

## Verification

```sh
python3 serve.py 8000 &                          # if it is not already up
.venv/bin/python tests/jungle_wildlife.py        # engine, crabs, boids
.venv/bin/python tests/jungle_vegetation.py      # non-regression
.venv/bin/python tests/jungle_layout.py
.venv/bin/python tests/wildlife_preview.py wildlifeXxx.js XXX scratch/xxx.png
```

**Performance pass.** Run Playwright headed with `.venv/bin/python` (`headless=False`, the real GPU); headless is SwiftShader, which is useless for fps.
- Place the player at spawn (-8,-4), on the beach (10,-8), mid-forest (-14,60) and at the pool (8,128).
- Average `renderer.info.render.calls` and `.triangles` over 4 s.
- Read `__jungle.wildlife.stats`: `ms`, `active`, `visible`, and the same per species.
- Compare with the budget above.
