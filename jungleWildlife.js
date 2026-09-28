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
// Roster (Channel Islands fauna; only the crab is in so far):
//   crab       sand & wet sand, colonies round the beach rocks   wildlifeCrab.js
//   planned:   island fox, side-blotched & alligator lizards, king snake or
//              rattlesnake, tree frogs, dragonflies, pool fish, pelicans,
//              hummingbirds, bald eagle, sea lions — see WILDLIFE.md.
import * as L from './jungleLayout.js';   // bare, like every element module
import { createWildlife, spotIndex } from './wildlife.js?v=20260928-wild1';
import { CRAB } from './wildlifeCrab.js?v=20260928-wild1';

// The swash's edge along the beach, as the foam shader draws it
// (jungleOcean's foam: uEdge plus two slow sines in x) — so a crab backs up
// from the water you see, not from a straight line.
function swashEdge(ocean, x) {
  const e = ocean ? ocean.swash.edge : 0;
  return e + Math.sin(x * 0.047) * 1.1 + Math.sin(x * 0.017 + 2.1) * 1.6;
}

export function jungleWildlifeLayout({ ocean = null, terrain = null } = {}) {
  const rocks = spotIndex(terrain?.rockSpots || [], 8);
  const J = L.JETTY;
  return {
    terrainHeight: L.terrainHeight,
    terrainSlope: L.terrainSlope,
    terrainNormal: L.terrainNormal,
    soilAt: L.soilAt,
    SOIL: L.SOIL,
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
    },
    spots: { rocks },
  };
}

// `species` overrides the roster (the tests pass a small one).
export function createJungleWildlife({ scene, ocean, terrain, species } = {}) {
  const layout = jungleWildlifeLayout({ ocean, terrain });
  return createWildlife({
    scene, layout, seed: 'jungle',
    species: species || [
      // Beach only: sampling the whole valley for them would waste the tries.
      { def: CRAB, count: 30, habitat: { ...CRAB.habitat, region: { x: [-78, 78], z: [-32, L.SAND_END] } } },
    ],
  });
}
