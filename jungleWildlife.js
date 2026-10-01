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
// Roster (Channel Islands fauna), by zone:
//   beach        crabs round the rocks, sanderlings in the swash  wildlifeCrab.js, wildlifeSandpiper.js
//   undergrowth  lizards by the rocks, fox, kingsnake,          wildlifeLizard.js, wildlifeFox.js,
//                scrub-jays by the bushes, hummingbirds and     wildlifeSnake.js, wildlifeJay.js,
//                monarchs at the flowers                        wildlifeHummingbird.js,
//                                                               wildlifeButterfly.js
//   waterfall    tree frogs, the pool's fish, dragonflies —     wildlifeFrog.js, wildlifeFish.js,
//                frogs and dragonflies also down the stream     wildlifeDragonfly.js
//   sky          the bald eagle over the ridges, ravens over    wildlifeEagle.js, wildlifeSoarer.js
//                the cliff, gulls along the shore
//   offshore     brown pelicans, sea lions on the haul-outs,    wildlifePelican.js, wildlifeSeaLion.js,
//                a dolphin pod beyond them                      wildlifeDolphin.js
import * as L from './jungleLayout.js';   // bare, like every element module
import { createWildlife, spotIndex } from './wildlife.js?v=20261001-pass9';
import { CRAB } from './wildlifeCrab.js?v=20261001-pass9';
import { LIZARD, ALLIGATOR } from './wildlifeLizard.js?v=20261001-pass9';
import { FOX } from './wildlifeFox.js?v=20261001-pass9';
import { SNAKE } from './wildlifeSnake.js?v=20261001-pass9';
import { FROG } from './wildlifeFrog.js?v=20261001-pass9';
import { FISH } from './wildlifeFish.js?v=20261001-pass9';
import { DRAGONFLY } from './wildlifeDragonfly.js?v=20261001-pass9';
import { HUMMINGBIRD } from './wildlifeHummingbird.js?v=20261001-pass9';
import { PELICAN } from './wildlifePelican.js?v=20261001-pass9';
import { EAGLE } from './wildlifeEagle.js?v=20261001-pass9';
import { SEA_LION } from './wildlifeSeaLion.js?v=20261001-pass9';
import { SANDPIPER } from './wildlifeSandpiper.js?v=20261001-pass9';
import { BUTTERFLY } from './wildlifeButterfly.js?v=20261001-pass9';
import { JAY } from './wildlifeJay.js?v=20261001-pass9';
import { GULL, RAVEN } from './wildlifeSoarer.js?v=20261001-pass9';
import { DOLPHIN } from './wildlifeDolphin.js?v=20261001-pass9';

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
  // The bushes (jungleVegetation's scatter, s its size): cover a bird
  // ducks into — the scrub-jay's refuge and habitat.
  const bushes = spotIndex((vegetation?.spots?.bushes || []).map(b => ({ x: b.x, z: b.z, r: 0.8 * b.s })), 6);
  // What a walker never walks through: every rock's footprint where it meets
  // the ground (rockSpots carry the shell's bounding radius about its centre,
  // which may sit below the surface; 0.8 of that sphere's cut at the ground
  // is the jittered shell's typical reach), and the trunks' colliders.
  const solid = [];
  for (const s of terrain?.rockSpots || []) {
    const h = L.terrainHeight(s.x, s.z) - s.y;
    if (h >= s.r) continue;                         // buried: nothing shows
    const r = Math.sqrt(s.r * s.r - h * h) * 0.8;
    if (r > 0.12) solid.push({ x: s.x, z: s.z, r });
  }
  for (const c of vegetation?.colliders || []) {
    solid.push({ x: 0.5 * (c.x0 + c.x1), z: 0.5 * (c.z0 + c.z1), r: 0.5 * Math.max(c.x1 - c.x0, c.z1 - c.z0) });
  }
  const obstacles = spotIndex(solid, 8);
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
      // The pool's water as it is drawn: the surface reaches r + 2.2
      // (jungleWaterfall's disc), wherever the bowl lies below it.
      if (Math.hypot(x - L.POOL.x, z - L.POOL.z) < L.POOL.r + 2.2
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
      bushes: (x, z) => bushes.nearest(x, z, 12).d,
      haulouts: (x, z) => haulouts.nearest(x, z, 40).d,
    },
    spots: { rocks, flowers, haulouts, bushes },
    obstacles,
  };
}

// The valley's width, a little in from the side walls: the inland regions.
const WIDE = [-L.PLAY_HALF_W + 2, L.PLAY_HALF_W - 2];

// `species` overrides the roster (the tests pass a small one).
export function createJungleWildlife({ scene, ocean, terrain, vegetation, species } = {}) {
  const layout = jungleWildlifeLayout({ ocean, terrain, vegetation });
  return createWildlife({
    scene, layout, seed: 'jungle',
    species: species || [
      // Beach only: sampling the whole valley for them would waste the tries.
      { def: CRAB, count: 30, habitat: { ...CRAB.habitat, region: { x: WIDE, z: [-32, L.SAND_END] } } },
      // The swash: a loose flock of sanderlings on one stretch of the beach,
      // west of the spawn, chasing each wave down and racing the next up.
      { def: SANDPIPER, count: 9, habitat: { ...SANDPIPER.habitat, region: { x: [-36, -12], z: [-32, L.SAND_END] } } },
      // Up-valley, against the rocks: the path's boulders, the headlands',
      // the cliff foot. Off the sand — that is the crabs' beach.
      { def: LIZARD, count: 10, habitat: { ...LIZARD.habitat, region: { x: WIDE, z: [L.SAND_END, L.CLIFF_Z + 8] } } },
      { def: ALLIGATOR, count: 3, habitat: { ...ALLIGATOR.habitat, region: { x: WIDE, z: [L.SAND_END, L.CLIFF_Z + 8] } } },
      // The undergrowth, in the lizards' region: FOREST/DIRT soils keep it
      // off the beach; the path, stream and pool margins do the rest.
      { def: FOX, count: 3, habitat: { ...FOX.habitat, region: { x: WIDE, z: [L.SAND_END, L.CLIFF_Z + 8] } } },
      // The forest floor, with the fox: FOREST soil only, off the path —
      // slow, shy, and it stops rather than flees when you come close.
      { def: SNAKE, count: 2, habitat: { ...SNAKE.habitat, region: { x: WIDE, z: [L.SAND_END, L.CLIFF_Z + 8] } } },
      // The wet rock ring round the pool, under the falls — and, for a few,
      // the stream's banks down the valley, so the frogs' hop-and-plop is
      // met on the walk up too. Approached, they hop into the water and stay
      // under till you have gone.
      { def: FROG, count: 8, habitat: {
        // The species' own pool-only keys are dropped (null): the test says
        // pool or stream instead.
        within: null, soils: null,
        slope: FROG.habitat.slope, avoid: FROG.habitat.avoid,
        near: { pool: 2, share: 0.6 },
        test: (x, z, Y) => {
          if (Y.waterAt(x, z)) return false;
          if (Y.distances.pool(x, z) < 2) return Y.soilAt(x, z) === Y.SOIL.WET || Y.soilAt(x, z) === Y.SOIL.ROCK;
          const st = Y.distances.stream(x, z);
          return st > L.STREAM_HALF_W + 0.2 && st < L.STREAM_HALF_W + 2.5;
        },
        region: { x: WIDE, z: [L.SAND_END + 6, L.CLIFF_Z + 4] },
      } },
      // The pool itself: the silver school. The water test in FISH.habitat
      // picks the homes; the region keeps the sampling tries inside the bowl.
      // The wading player scatters them (the boids' threat), they close again
      // behind the wake.
      { def: FISH, count: 14, habitat: { ...FISH.habitat, region: { x: [L.POOL.x - 13, L.POOL.x + 13], z: [L.POOL.z - 13, L.POOL.z + 13] } } },
      // Over the pool and the foot of the falls, and a few patrolling the
      // stream: they hang on a figure-of-eight, dart in zigzags a band above
      // the water, and skip aside when you come close.
      { def: DRAGONFLY, count: 6, habitat: {
        within: null,
        slope: DRAGONFLY.habitat.slope,
        near: { pool: 6, share: 0.6 },
        // By the pool at the water's own level (not up on the cliff top), or
        // over the stream.
        test: (x, z, Y) => (Y.distances.pool(x, z) < 6 && Y.terrainHeight(x, z) < L.POOL.waterY + 1.5)
          || Y.distances.stream(x, z) < 2.5,
        region: { x: WIDE, z: [L.SAND_END + 6, L.CLIFF_Z + 6] },
      } },
      // Through the undergrowth's clearings and along its edges: the
      // planned-roster hummingbirds, the second `flyFree` species. They hang
      // at a bloom, then dart to the nearest tuft — the vegetation's flowers
      // are both their habitat (`near: { flowers: 4 }`) and the anchors their
      // tick picks. Skittish, back at once (hideFor is null). The region
      // keeps the sampling tries inland, where the blooms are.
      { def: HUMMINGBIRD, count: 8, habitat: { ...HUMMINGBIRD.habitat, region: { x: WIDE, z: [L.SAND_END, L.CLIFF_Z + 6] } } },
      // The island scrub-jay — Santa Cruz's own — bounding over the forest
      // floor by the bushes it ducks into when you come close.
      { def: JAY, count: 5, habitat: { ...JAY.habitat, region: { x: WIDE, z: [L.SAND_END + 4, L.CLIFF_Z] } } },
      // Monarchs at the same blooms: a lazy, jinking flutter from tuft to
      // tuft through the undergrowth's clearings.
      { def: BUTTERFLY, count: 10, habitat: { ...BUTTERFLY.habitat, region: { x: WIDE, z: [L.SAND_END, L.CLIFF_Z + 6] } } },
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
      { def: EAGLE, count: 1, habitat: { ...EAGLE.habitat, region: { x: WIDE, z: [L.SAND_END, L.CLIFF_Z] } } },
      // Western gulls wheeling low along the shore, over the surf and the
      // sand — the beach's own sky.
      { def: GULL, count: 4, habitat: { ...GULL.habitat, region: { x: WIDE, z: [-44, L.SAND_END] } } },
      // A pair of ravens on the cliff's updraft, over the falls.
      { def: RAVEN, count: 2, habitat: { ...RAVEN.habitat, region: { x: WIDE, z: [100, L.CLIFF_Z] } } },
      // On the offshore haul-outs: the planned-roster California sea lions,
      // the first `amphibious` species. They loaf on the rock tops, slide
      // off to swim and dive, and surface again nearby — the wade barrier
      // keeps you at the show's distance, so nothing here is frightened.
      // The within-haulout habitat picks their homes; the region keeps the
      // sampling tries offshore, where the rocks are.
      { def: SEA_LION, count: 6, habitat: { ...SEA_LION.habitat, region: { x: [-45, 45], z: [-70, -38] } } },
      // A pod of common dolphins travelling the channel beyond the rocks,
      // breaking the surface each in its own rhythm.
      { def: DOLPHIN, count: 5, habitat: { ...DOLPHIN.habitat, region: { x: [-60, 60], z: [-112, -84] } } },
    ],
  });
}
