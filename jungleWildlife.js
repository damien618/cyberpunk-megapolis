// jungleWildlife.js — who lives in the cove, and where. The map side of the
// wildlife system (wildlife.js is the engine, WILDLIFE.md the guide): this
// file adapts jungleLayout, the ocean and the terrain's rocks to the LAYOUT
// the manager asks its questions through, and lists the species with the
// cove's own counts and habitats.
//
// The village maps will write their own xxxWildlife.js the same way — their
// layout, their `keepOffBuilt`, their roster — and reuse the species modules
// unchanged.
//
// Roster (Channel Islands fauna; the crab, the two lizards, the fox, the
// snake, the tree frogs, the pool fish, the dragonflies, the hummingbirds
// and the pelicans are in):
//   crab       sand & wet sand, colonies round the beach rocks   wildlifeCrab.js
//   lizards    up-valley by the rocks, with the alligator lizard wildlifeLizard.js
//   fox        the undergrowth's island fox, three of them       wildlifeFox.js
//   snake      the forest floor's kingsnake, two, black & cream  wildlifeSnake.js
//   frogs      the wet rock ring round the pool, eight           wildlifeFrog.js
//   fish       the pool's silver school, fourteen — the first    wildlifeFish.js
//              `school` species
//   dragonflies the pool's blue emperors, six, over the water    wildlifeDragonfly.js
//              and the foot of the falls — the first `flyFree` species
//   hummingbirds the clearings' Allen's hummingbirds, eight, at  wildlifeHummingbird.js
//              the flowers — the second `flyFree` species
//   pelicans   the open sea's brown file, five, beyond the wade  wildlifePelican.js
//              barrier — the first `flock` species
//   eagle      the ridge's bald eagle, one, on slow banked     wildlifeEagle.js
//              circles over the high ground — the first
//              `glide` species
//   sea lions  the haul-outs' California sea lions, six, on     wildlifeSeaLion.js
//              the offshore rocks — the first `amphibious`
//              species
import * as L from './jungleLayout.js';   // bare, like every element module
import { createWildlife, spotIndex } from './wildlife.js?v=20260930-amph1';
import { CRAB } from './wildlifeCrab.js?v=20260928-wild1';
import { LIZARD, ALLIGATOR } from './wildlifeLizard.js?v=20260928-wild1';
import { FOX } from './wildlifeFox.js?v=20260928-fox1';
import { SNAKE } from './wildlifeSnake.js?v=20260929-snake1';
import { FROG } from './wildlifeFrog.js?v=20260929-frog1';
import { FISH } from './wildlifeFish.js?v=20260929-fish1';
import { DRAGONFLY } from './wildlifeDragonfly.js?v=20260930-fly1';
import { HUMMINGBIRD } from './wildlifeHummingbird.js?v=20260930-hum1';
import { PELICAN } from './wildlifePelican.js?v=20260930-pel1';
import { EAGLE } from './wildlifeEagle.js?v=20260930-glide1';
import { SEA_LION } from './wildlifeSeaLion.js?v=20260930-amph1';

// The swash's edge along the beach, as the foam shader draws it
// (jungleOcean's foam: uEdge plus two slow sines in x) — so a crab backs up
// from the water you see, not from a straight line.
function swashEdge(ocean, x) {
  const e = ocean ? ocean.swash.edge : 0;
  return e + Math.sin(x * 0.047) * 1.1 + Math.sin(x * 0.017 + 2.1) * 1.6;
}

export function jungleWildlifeLayout({ ocean = null, terrain = null, vegetation = null } = {}) {
  const rocks = spotIndex(terrain?.rockSpots || [], 8);
  // The offshore haul-outs (jungleTerrain's sea-rock scatter): the sea
  // lions' habitat and the anchor their motion sits on. Empty without the
  // terrain — like the flowers, a roster entry that needs them just finds
  // no homes, not an error.
  const haulouts = spotIndex(terrain?.hauloutSpots || [], 8);
  // The nectar tufts (jungleVegetation's flower scatter): the hummingbirds'
  // anchors (`spots.flowers`) and habitat (`distances.flowers` for `near`).
  // Empty without the vegetation — the tests sample the wildlife alone — so
  // a roster entry that needs them just finds no homes, not an error.
  const flowers = spotIndex(vegetation?.spots?.flowers || [], 4);
  const J = L.JETTY;
  return {
    terrainHeight: L.terrainHeight,
    terrainSlope: L.terrainSlope,
    terrainNormal: L.terrainNormal,
    soilAt: L.soilAt,
    SOIL: L.SOIL,
    // How thick the forest is, 0..1 — the island fox's fleeTarget reads it
    // (the one layout name the fox asked to add; see WILDLIFE.md).
    forestDensity: L.forestDensity,
    bounds: { x: [-L.PLAY_HALF_W + 2, L.PLAY_HALF_W - 2], z: [L.WADE_Z, L.CLIFF_Z] },
    shoreDistance: (x, z) => z - L.shoreAt(x),
    waterlineZ: x => L.shoreAt(x) + swashEdge(ocean, x),
    // The live sea surface, for whatever floats or swims at sea.
    seaHeightAt: ocean ? ocean.waterHeightAt : () => L.SEA_Y,
    waterAt(x, z) {
      if (z < L.shoreAt(x)) return { kind: 'sea', y: L.SEA_Y };
      if (Math.hypot(x - L.POOL.x, z - L.POOL.z) < L.POOL.r - 0.5
        && L.terrainHeight(x, z) < L.POOL.waterY) return { kind: 'pool', y: L.POOL.waterY };
      if (L.streamDistance(x, z) < L.STREAM_HALF_W) return { kind: 'stream', y: L.streamWaterY(z) };
      return null;
    },
    distances: {
      path: L.pathDistance,
      stream: L.streamDistance,
      pool: (x, z) => Math.hypot(x - L.POOL.x, z - L.POOL.z) - L.POOL.r,
      jetty: (x, z) => Math.hypot(
        Math.max(Math.abs(x - J.x) - J.halfW, 0),
        Math.max(z - J.z0, J.z1 - z, 0)),
      rocks: (x, z) => rocks.nearest(x, z, 16).d,
      flowers: (x, z) => flowers.nearest(x, z, 12).d,
      haulouts: (x, z) => haulouts.nearest(x, z, 40).d,
    },
    spots: { rocks, flowers, haulouts },
  };
}

// `species` overrides the roster (the tests pass a small one).
export function createJungleWildlife({ scene, ocean, terrain, vegetation, species } = {}) {
  const layout = jungleWildlifeLayout({ ocean, terrain, vegetation });
  return createWildlife({
    scene, layout, seed: 'jungle',
    species: species || [
      // Beach only: sampling the whole valley for them would waste the tries.
      { def: CRAB, count: 30, habitat: { ...CRAB.habitat, region: { x: [-78, 78], z: [-32, L.SAND_END] } } },
      // Up-valley, against the rocks: the path's boulders, the headlands',
      // the cliff foot. Off the sand — that is the crabs' beach.
      { def: LIZARD, count: 10, habitat: { ...LIZARD.habitat, region: { x: [-78, 78], z: [L.SAND_END, L.CLIFF_Z + 8] } } },
      { def: ALLIGATOR, count: 3, habitat: { ...ALLIGATOR.habitat, region: { x: [-78, 78], z: [L.SAND_END, L.CLIFF_Z + 8] } } },
      // The undergrowth, in the lizards' region: FOREST/DIRT soils keep it
      // off the beach; the path, stream and pool margins do the rest.
      { def: FOX, count: 3, habitat: { ...FOX.habitat, region: { x: [-78, 78], z: [L.SAND_END, L.CLIFF_Z + 8] } } },
      // The forest floor, with the fox: FOREST soil only, off the path —
      // slow, shy, and it stops rather than flees when you come close.
      { def: SNAKE, count: 2, habitat: { ...SNAKE.habitat, region: { x: [-78, 78], z: [L.SAND_END, L.CLIFF_Z + 8] } } },
      // The wet rock ring round the pool, under the falls: WET/ROCK keeps
      // them off the water itself, the path's last bend off their ring.
      // Approached, they hop into the pool and stay under till you have gone.
      { def: FROG, count: 8, habitat: { ...FROG.habitat, region: { x: [L.POOL.x - 16, L.POOL.x + 16], z: [L.POOL.z - 14, L.CLIFF_Z + 4] } } },
      // The pool itself: the silver school. The water test in FISH.habitat
      // picks the homes; the region keeps the sampling tries inside the bowl.
      // The wading player scatters them (the boids' threat), they close again
      // behind the wake.
      { def: FISH, count: 14, habitat: { ...FISH.habitat, region: { x: [L.POOL.x - 13, L.POOL.x + 13], z: [L.POOL.z - 13, L.POOL.z + 13] } } },
      // Over the pool and the foot of the falls: the planned-roster
      // dragonflies, the first `flyFree` species. They hang on a
      // figure-of-eight, dart in zigzags a band above the water, and skip
      // aside when you come close. The within-pool habitat picks their
      // anchors; the region keeps the sampling tries by the falls.
      { def: DRAGONFLY, count: 6, habitat: { ...DRAGONFLY.habitat, region: { x: [L.POOL.x - 14, L.POOL.x + 14], z: [L.POOL.z - 14, L.CLIFF_Z + 6] } } },
      // Through the undergrowth's clearings and along its edges: the
      // planned-roster hummingbirds, the second `flyFree` species. They hang
      // at a bloom, then dart to the nearest tuft — the vegetation's flowers
      // are both their habitat (`near: { flowers: 4 }`) and the anchors their
      // tick picks. Skittish, back at once (hideFor is null). The region
      // keeps the sampling tries inland, where the blooms are.
      { def: HUMMINGBIRD, count: 8, habitat: { ...HUMMINGBIRD.habitat, region: { x: [-78, 78], z: [L.SAND_END, L.CLIFF_Z + 6] } } },
      // Over the open sea, beyond the wade barrier: the planned-roster
      // brown pelicans, the first `flock` species. The leader rides a slow
      // loop over the cove, the file streams out behind it a body apart,
      // and every so often it folds into a plunge the whole line follows
      // down. Not frightened — the barrier keeps you out of their sky. The
      // region keeps the sampling tries offshore, over the water.
      { def: PELICAN, count: 5, habitat: { ...PELICAN.habitat, region: { x: [-70, 70], z: [-76, -44] } } },
      // Over the high ground — the ridge flanks and the top of the cliff: the
      // planned-roster bald eagle, the first `glide` species. It rides slow
      // banked circles round a centre that drifts on the wind, now and then
      // gliding on to a fresh circle the other way. Not frightened — you are
      // a hundred and fifty metres under it. The 12 m test picks the homes;
      // the region keeps the sampling tries inland, where the ridges are.
      { def: EAGLE, count: 1, habitat: { ...EAGLE.habitat, region: { x: [-78, 78], z: [L.SAND_END, L.CLIFF_Z] } } },
      // On the offshore haul-outs: the planned-roster California sea lions,
      // the first `amphibious` species. They loaf on the rock tops, slide
      // off to swim and dive, and surface again nearby — the wade barrier
      // keeps you at the show's distance, so nothing here is frightened.
      // The within-haulout habitat picks their homes; the region keeps the
      // sampling tries offshore, where the rocks are.
      { def: SEA_LION, count: 6, habitat: { ...SEA_LION.habitat, region: { x: [-45, 45], z: [-70, -38] } } },
    ],
  });
}
