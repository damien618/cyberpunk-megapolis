# Wildlife: adding an animal to a map

The island's animals run on one generic system. A species is **one module** that exports a definition. A map lists the species it wants in **one roster file**, beside a **layout adapter** that answers the engine's questions about its ground and water. The engine handles placement, behaviour, activation near the player, instancing and animation.

The reference species is the shore crab, `wildlifeCrab.js`. Copy its shape.

## Files

| File | Role |
|---|---|
| `wildlife.js` | Engine, map-agnostic: the agent pool, the state machine, habitat sampling, activation, obstacles, one InstancedMesh per species, the creature material (GLSL splice), and the shared behaviours (`swashTick`, `spotWander`). |
| `wildlifeMotion.js` | Locomotion kinds: `ground`, `hop`, `flyFree`, `glide`, `flock`, `school`, `porpoise`, `amphibious`. |
| `wildlifeBoids.js` | Pure boids (no THREE), for the school and the flock. |
| `wildlifeCrab.js` | **Reference species** — shore crab: `swashTick`, and a flight to a rock or the sea. |
| `wildlifeSandpiper.js` | Sanderlings working the swash: `swashTick` + a `pickWander` by the live waterline. |
| `wildlifeLizard.js` | Side-blotched and alligator lizards: two definitions over one builder; bask by rocks, flee under them (`api.refugeAt`). |
| `wildlifeFox.js` | Island fox: bolts into the thickest forest (`api.fleeScan` over `forestDensity`). |
| `wildlifeSnake.js` | Kingsnake: a body-wave; freezes instead of fleeing. |
| `wildlifeJay.js` | Island scrub-jay: hops on the forest floor, ducks into a bush (`api.refugeAt` over `spots.bushes`). |
| `wildlifeFrog.js` | Tree frogs: hop, flee into the water (`api.fleeScan`), surface on the bank. |
| `wildlifeFish.js` | The pool's school (`school`). |
| `wildlifeDragonfly.js` | Blue emperors over the pool and the stream (`flyFree`). |
| `wildlifeHummingbird.js` | Allen's hummingbirds at the flowers (`flyFree` + `spotWander`). |
| `wildlifeButterfly.js` | Monarchs at the same flowers (`flyFree` + `spotWander`). |
| `wildlifeEagle.js` | The bald eagle over the ridges (`glide`). |
| `wildlifeSoarer.js` | Western gulls along the shore and a raven pair over the cliff: two `glide` definitions over one builder. |
| `wildlifePelican.js` | Brown pelicans in a file over the sea (`flock`). |
| `wildlifeDolphin.js` | A common-dolphin pod offshore (`porpoise`). |
| `wildlifeSeaLion.js` | Sea lions on the haul-outs (`amphibious`); the dive runs through the engine's HIDDEN/EMERGE. |
| `jungleWildlife.js` | The cove's **layout adapter** and **roster**. |
| `tests/jungle_wildlife.{mjs,py}` | Per-species checks, the roster-wide invariants (below), and a made-up village. |
| `tests/jungle_wildlife_perf.py` | Headed pass in the running map: each view measured with the animals shown and hidden. |
| `tests/wildlife_preview.py` | One species alone on flat ground (idle, moving, alarmed), in about 15 s, without the map. |
| `tests/wildlife_gallery.py` | Close-ups of species where they live, in the running map, by a free camera. |

## Budget

The map has these limits (MacBook Air M3 8 GB). The baseline in September 2026 was 81–163 draw calls and 0.3–0.6 M triangles, at 60 fps in every view.

The budget is per **view**, not per species: each species is one draw call, but only where it is awake and on screen, so a roster grows by zones. In any view, the animals together must stay within:
- **+6 draw calls** (measured October 2026 with 18 species: +3 to +6; the pool is at the limit, so put nothing new there);
- **25 k triangles** (measured: at most +7 k);
- **0.6 ms** of `wildlife.update` in the running map (measured: 0.17–0.51 ms; 0.14 ms isolated at the pool, the busiest view), and no fps lost (60 everywhere).

Keep each model at **400 triangles or fewer**. Leave `castShadow` off, and bake a dark underside instead (`bottomColor`). The costliest call is `terrainHeight` near the path (it walks the polyline): a motion that needs the ground several times in a frame should ask once and reuse it.

## Scale and speed

One rule, so the species sit together credibly: **small animals at about twice life size** (readable from the chase camera 5 m back), **large ones at life size**, and the real ranking kept. The cove's sizes: frog 9–12 cm < dragonfly 11–13 < hummingbird 15–18 < crab ~20 cm across the legs < sanderling 27–31 < jay 33–38 < lizard 28–40 < alligator lizard 52–67 < fox 0.8–1.0 m ≈ snake < gull 1.4 m span < raven 1.2–1.35 < sea lion 1.6–2.1 m ≈ dolphin 2.0–2.3 < pelican 2.0–2.3 m span ≈ eagle 2.1–2.4. Check a new species against this list before tuning anything else.

Speeds follow life, slowed a little where the eye needs it: a startled fox bolts at 4.2 m/s, a dragonfly darts at 2.6, a pelican cruises at 5.5.

## Checklist: adding a species

1. **Create `wildlifeXxx.js`**, copied from `wildlifeCrab.js`. It exports `buildXxx()`, `XXX_GLSL` and the `XXX` definition. A close relative of an existing species (a second lizard, a raven beside the gull) goes in the same module, over the same builder.
2. **Build the model** from primitives, with `creaturePart` and `limbGeometry`, and merge it with `mergeCreatureParts`:
   - the local frame is **+Z front**, +X right, and **y = 0 the ground** (the belly for a flyer, the axis for a swimmer);
   - tag each piece with a part id and its joint (the pivot);
   - wings and fins are **thin boxes or prisms**, not planes: a plane is invisible from below.
3. **Check it** with `.venv/bin/python tests/wildlife_preview.py wildlifeXxx.js XXX scratch/xxx.png` (add `--top` for a view from above), and against the scale list. Read the PNG.
4. **Pick the motion.** Use an existing one if it fits; a new kind goes in `wildlifeMotion.js`, following the contract at the top of that file.
5. **Write the habitat, then the hooks**, but only where the defaults are wrong. Use the shared behaviours and `api` helpers before writing your own (see States and hooks). Declare in `needs` every layout name your hooks read.
6. **Add it to the map's roster** (`jungleWildlife.js`), with a `region` so sampling does not waste tries. A layout name that does not exist yet (flowers, bushes, offshore rocks) is added to the adapter; do not change `jungleLayout.js`.
7. **Test and measure:**
   - the **roster-wide invariants** already hold your species to no NaN, no jump, no walking through rocks or trunks, whole groups, smooth flight — run them;
   - add the checks only your species needs (its habitat, its signature behaviour);
   - run `jungle_vegetation.py` and `jungle_layout.py` too;
   - look at it in the map (`wildlife_gallery.py xxx`);
   - do one headed perf pass and compare with the budget.
8. **Bump the `?v=` tags.** Every species imports `wildlife.js`: when the engine changes, retag **every** species and its import in `jungleWildlife.js`, or an old cached species keeps a second engine instance (and a frozen `uTime`). Then `jungleWildlife.js` in `main-JUNGLE.js`, and `main-JUNGLE.js` in `index.html`.

## The definition

Anything you leave out takes the value in `DEFAULTS` (in `wildlife.js`). A map entry `{ def, ...overrides }` is merged over the definition, one level deep for `habitat`, `fear`, `speed`, `body`, `timings` and `hooks`. To drop one of the species' habitat keys in a map, set it to `null` (the cove's frogs: `within: null`, then a `test` that says pool or stream).

| Key | Meaning (crab value) |
|---|---|
| `id` | Unique name. It seeds the species' RNG and keys the shader program (`'crab'`). |
| `motion` | `ground` \| `hop` \| `flyFree` \| `glide` \| `flock` \| `school` \| `porpoise` \| `amphibious` |
| `count` | How many (30). The map may override it. |
| `habitat` | Where it can live (see below). |
| `spacing` | Minimum distance between homes, in metres (0.8). |
| `homeRange` | Radius it wanders in around its home (3). |
| `activeRadius` | Beyond this distance from the player, it is frozen and not drawn (38). |
| `fear` | `radius` walking, `runRadius` when the threat runs (> 3 m/s), `calmDistance` before coming back out, `hideFor` `[min,max]` seconds, or `null` to never hide. `radius: 0` never frightens. |
| `speed` | `walk`, `flee` (m/s), `turn` (rad/s). |
| `strideRate` | Radians of leg cycle per metre covered (38). |
| `strideStretch` | How much the stride lengthens at full gait: the cycle per metre is divided by `1 + strideStretch × gait` (0; the fox's 3). |
| `body` | `yawOffset` + `sideways` (a crab walks along its ±X), `alignToGround`, `lift`, `sinkDepth`/`sinkTime` (burrowing, diving, ducking into cover), `scale` `[min,max]`, `radius` (the clearance a walker keeps from obstacles; default from the model's footprint). |
| `timings` | `idle` `[min,max]`, `move` `[min,max]`, `alert` in seconds (0 skips ALERT). |
| `continuous` | `true`: never idles — the moment the machine would stop it, it picks its next wander and moves on, the same frame (fish, flyers, the dolphin pod). |
| `needs` | Layout names the species cannot do without (`'waterlineZ'`, `'spots.flowers'`). A map that lacks one leaves the species off, with a warning. |
| `fly` / `swim` / `dive` | The motion's own knobs (band, loop, leap…), documented at each motion in `wildlifeMotion.js`. |
| `build` | `() → { geometry }`, the merged creature geometry. |
| `animGLSL` | Vertex-shader body (see Animation). |
| `tint(rng, color)` | Per-individual colour, multiplied over the vertex colours. |
| `metalness`, `roughness` | The material's (fish 0.45 / 0.35); default matte. |
| `hooks` | `init`, `tick`, `pickWander`, `fleeTarget`, `hideAt`, `emergeAt` (see States). |
| `castShadow` | `false`. |

### Habitat

Every key is optional, and all present keys must pass. The engine checks the cheap keys first.

```js
habitat: {
  region: { x: [-78, 78], z: [-32, 12] },   // sampling box (default: layout.bounds)
  soils:  ['SAND', 'WET'],                 // names of layout.SOIL (a whitelist)
  slope:  [0, 0.3],                        // tangent: 0 flat, 1 = 45°
  height: [min, max],                      // ground altitude
  shore:  [1.5, 13],                       // layout.shoreDistance: metres above the sea's waterline
  avoid:  { path: 1.6, jetty: 1.2 },       // at least this far from layout.distances.*
  within: { pool: 4 },                     // at most this far from layout.distances.*
  near:   { rocks: 6, share: 0.55 },       // this share of homes is within 6 m of a rock
  test:   (x, z, layout) => true,          // anything the keys cannot express
}
```

- An `avoid` of a feature the map lacks is simply met (no stream on a village square). `soils` needs only one of its names on the map. `within`, `near` and `needs` are hard requirements: a map without them leaves the species off.
- Walkers (`ground`, `hop`) also get `clear`, set by the engine: homes and wander targets keep the body's radius out of every obstacle.

The cove's soils are `SHALLOW, WET, SAND, DIRT, FOREST, ROCK` (`jungleLayout.soilAt`). Its distances are `path, stream, pool, jetty, rocks, flowers, bushes, haulouts`.

## States and hooks

```
IDLE ⇄ MOVE                 wander inside homeRange (continuous: straight back to MOVE)
→ ALERT → FLEE              a threat came within fear.radius (runRadius if it runs)
→ HIDDEN → EMERGE → MOVE    safe in its refuge, then back out once the threat is past calmDistance
```

A flight that has not arrived after 6 s ends where it is. Every hook gets `(a, sp, ctx, api)`:
- `a` is the agent (`x, y, z, yaw, heading, tx, tz, state, timer, home, sink, gait, mood, …`);
- `sp.def` and `sp.rng` are the species definition and its RNG;
- `ctx` holds `t, px, pz, pSpeed, layout, STATE`. While an animal thinks, `px, pz, pSpeed` are **the nearest threat**: the player, or one of the map's walkers (see Maps);
- `api` holds:
  - `setTarget(a, sp, x, z)`, `defaultWander`, `defaultFlee`;
  - `habitatOk(sp, x, z)`: is this a place it may be?
  - `clearOfPlayer(a, x, z, minCos)`: is the way there clear of the threat?
  - `refugeAt(a, spots, reach, depth)`: the nearest spot (rock, bush…) whose way is clear, `depth` of its radius in — a walker stops at an obstacle's foot;
  - `fleeScan(a, { angles, dists, score })`: the best point on the ways away from the threat.

| Hook | When it runs | Default |
|---|---|---|
| `init(sp, layout)` | Once, before sampling. | none |
| `tick(a, sp, ctx, dt, api, threat)` | Every think, before the machine runs. Return `true` to take the frame. | none |
| `pickWander` | IDLE → MOVE | A habitat-valid point within `homeRange`. |
| `fleeTarget` | ALERT → FLEE | Straight away from the threat. |
| `hideAt` / `emergeAt` | Entering HIDDEN / EMERGE | Stays where it is. |

**Shared behaviours** (factories in `wildlife.js`, plugged in as hooks):
- `swashTick({ margin, up, speedK })`: keep ahead of the swash (crab, sanderlings);
- `spotWander(name, { reach, jitter })`: a trap-line over `layout.spots[name]` (hummingbirds and monarchs at the flowers).

A behaviour a second species needs moves up into one of these, or into `api`; it is not copied.

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

Your `animGLSL` runs after `begin_vertex`. It edits `transformed` (object space) and can use `uTime` and `wlRotX/Y/Z(p, pivot, angle)`. Normals need no work: flat shading derives them per face. A motion may also set `a.roll` (a bank about the body's forward axis: the glide) and `a.pitch` (nose up positive: the porpoise); the engine applies both to the whole instance.

## Motions

| Motion | Flags | Species | What it does |
|---|---|---|---|
| `ground` | walks | crab, sanderlings, lizards, fox, snake | Steers at `speed.turn` on the terrain; slides round obstacles. |
| `hop` | walks | frogs, jays | Ballistic bounds of 0.3–1 m; a landing in an obstacle slides to its rim. |
| `flyFree` | smooth | dragonflies, hummingbirds, monarchs | Figure-of-eight hovers at anchors, zigzag darts between, in a band above the water or the ground. A target the machine changes mid-flight restarts the dart from where the body is. |
| `glide` | smooth, init | eagle, gulls, ravens | Banked circles round a drifting centre, now and then a glide to a fresh circle (joined at its rim); looks ahead over the ground. |
| `flock` | smooth, group, init | pelicans | The leader's oval over the sea, the file on its trail (boids), the plunge. |
| `school` | smooth, group, init | fish | 3-D boids between the bed and the surface of water deep enough to swim in. |
| `porpoise` | smooth, group, init | dolphins | A pod on an oval, each at its slot, leaping on its own clock, pitched along the arc. |
| `amphibious` | — | sea lions | Crawl on the haul-outs' tops, swim between, one continuous floor across neighbouring rocks. |

Flags (see the contract in `wildlifeMotion.js`): **walks** keeps the species out of `layout.obstacles`; **smooth** steps it every frame at any distance (past 25 m the rest think one frame in four); **group** wakes and sleeps the whole species together; **init** places the agents on their path at creation, so the first frame is not a jump.

## The layout adapter

What a map's adapter provides (`jungleWildlife.js` is the example). A species reads the map only through these names.

| Name | Meaning |
|---|---|
| `terrainHeight`, `terrainSlope`, `terrainNormal` | The analytic ground. |
| `soilAt(x, z)`, `SOIL` | The soil enum, matched by name in habitats. |
| `bounds` | The default sampling box. |
| `keepOffBuilt(x, z)` | Optional: `false` where nothing may live (inside houses). |
| `obstacles` | Optional `spotIndex` of solid circles `{ x, z, r }` at ground level: rock footprints, trunks, walls (a wall is a chain of circles). |
| `distances` | `{ name: (x, z) → metres }`. |
| `spots` | `{ name: spotIndex }`: rocks, flowers, bushes, haulouts… |
| `shoreDistance`, `waterlineZ`, `waterAt`, `seaHeightAt` | Water, where the map has it. `waterAt` answers with the water **as drawn**. |

## Roster of the cove, by zone

| Zone | Species (count) |
|---|---|
| Beach | crabs (30) round the rocks, sanderlings (9) in the swash |
| Undergrowth | lizards (10 + 3) by the rocks, fox (3), kingsnakes (2), scrub-jays (5) by the bushes, hummingbirds (8) and monarchs (10) at the flowers |
| Waterfall and stream | frogs (8), dragonflies (6) — most at the pool, a few down the stream — fish (14) in the pool |
| Sky | the eagle (1) over the ridges, a raven pair (2) over the cliff, gulls (4) along the shore |
| Offshore | pelicans (5), sea lions (6) on the haul-outs, a dolphin pod (5) beyond them |

## Other maps (the villages)

A new map writes its own `xxxWildlife.js`: an adapter and a roster. The species modules are reused unchanged.
- Leave out what the map does not have. A species that needs it (`needs`, `within`, `near`) is left off with a warning; an `avoid` of it is met.
- Walls and houses: `keepOffBuilt` for the floors, `obstacles` (chains of circles) for the walls.
- **Walkers frighten animals too.** Pass them each frame: `wildlife.update(dt, t, playerPos, playerVel, walkers)`, with `walkers` an array of `{ x, z, speed }`. Each animal reacts to the nearest.
- Tame or curious animals (a dog, chickens) need no engine change: `fear.radius: 0`, and a `pickWander` that heads for `ctx.px, ctx.pz` when they are near.
- The made-up village in `tests/jungle_wildlife.mjs` is the dry run: copy its adapter as a starting point.

## Rules that bite

- **Import `jungleLayout.js` bare** (no `?v=`). Two URLs make two module instances.
- **Nothing goes on `world`**, or cityBoxes would turn animals into walls and camera occluders. The engine adds its group to `scene`.
- **Never use the map's shared `rnd()`.** Each species has its own seeded RNG, so adding one never moves a rock or a palm.
- **Species sit on the analytic terrain, with no raycasts.** Use `terrainHeight` and `soilAt` for sampling and hooks, not per vertex.
- **Rock spots carry a bounding radius about a centre that may be buried.** The adapter's obstacles use the footprint where the rock meets the ground; use those for anything that must not enter a rock.
- **A habitat override merges.** A map's `habitat` keeps the species' keys unless set to `null`.
- **A flyer's target can change mid-flight** (a fresh wander, a flight). A motion that walks a planned path must notice, and replan from where the body is.
- **`camera.fov` cannot zoom a capture.** The camera rig resets it every frame. `wildlife_gallery.py` swaps the rig out for its free camera; otherwise place the player (`ctrl.rescueTo`, then wait about 7 s).

## Verification

```sh
python3 serve.py 8000 &                            # if it is not already up
.venv/bin/python tests/jungle_wildlife.py          # species, invariants, village
.venv/bin/python tests/jungle_vegetation.py        # non-regression
.venv/bin/python tests/jungle_layout.py
.venv/bin/python tests/wildlife_preview.py wildlifeXxx.js XXX scratch/xxx.png
.venv/bin/python tests/wildlife_gallery.py xxx     # in the map, headed
.venv/bin/python tests/jungle_wildlife_perf.py     # headed, ~1.5 min
```

The perf pass needs `headless=False` and the project `.venv`: headless is SwiftShader, which is useless for fps.
