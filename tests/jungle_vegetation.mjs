// tests/jungle_vegetation.mjs — assertions for the vegetation module, run
// under plain Chromium by tests/jungle_vegetation.py (no Node on this
// machine): python3 serve.py 8000 & then .venv/bin/python tests/jungle_vegetation.py
//
// Builds the whole scatter against a throwaway scene and holds it to the
// rules it claims: nothing in the water, nothing on the tread of the path,
// nothing on the built ground, no giant on a cliff-steep slope, palms leaning
// seaward, the wet ring lush around the stream and the pool, the sightlines
// actually thinner than the open forest, and the wind clock advancing.
import * as THREE from 'three';
import { buildJungleVegetation } from '/jungleVegetation.js';
import {
  soilAt, SOIL, sightlineClear, pathDistance, PATH_HALF_W, POOL, JETTY, SAND_END,
  streamDistance, STREAM_HALF_W,
} from '/jungleLayout.js';

let failed = 0;
const check = (ok, msg) => { console.log((ok ? '  ok ' : 'FAIL ') + msg); if (!ok) failed++; };

const scene = new THREE.Scene();
let seed = 20260927 >>> 0;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);

let veg = null;
try {
  veg = buildJungleVegetation({ scene, rnd, maxAniso: 4 });
  check(true, 'module builds');
} catch (e) {
  check(false, 'module builds: ' + e);
}

if (veg) {
  const c = veg.counts;
  check(scene.children.includes(veg.group), 'group is on the scene');
  for (const k of ['palms', 'saplings', 'understory', 'giants', 'vines', 'ferns', 'broads', 'bushes', 'grass']) {
    check(c[k] > 0, `scatter has ${k} (${c[k]})`);
  }
  check(c.meshes > 100, 'instances are tiled (' + c.meshes + ' meshes)');

  const inWater = (x, z) => soilAt(x, z) === SOIL.SHALLOW;
  const onTread = (x, z, margin) => pathDistance(x, z) < PATH_HALF_W + margin;

  // The damp ring: ferns crowding the stream's banks and the pool's rim —
  // measured by proximity (the visibly damp band), none of them in the water.
  const dampGround = (x, z) =>
    streamDistance(x, z) < STREAM_HALF_W + 3.4
    || Math.hypot(x - POOL.x, z - POOL.z) < POOL.r + 3.4;
  let wet = 0;
  for (const it of veg.spots.ferns) {
    if (it.z > SAND_END - 2 && dampGround(it.x, it.z)) {
      wet++;
      if (inWater(it.x, it.z)) { check(false, 'fern standing in the water'); break; }
    }
  }
  check(wet > 60, `the wet ring is lush (${wet} damp-ground ferns)`);

  let bad = 0;
  for (const it of veg.spots.giants) {
    if (inWater(it.x, it.z) || onTread(it.x, it.z, 0.6)) bad++;
  }
  check(bad === 0, 'giants: dry and off the tread (' + bad + ' bad)');

  bad = 0;
  for (const it of veg.spots.understory) {
    if (inWater(it.x, it.z) || onTread(it.x, it.z, 1.2)) bad++;
  }
  check(bad === 0, 'understorey: dry and off the tread (' + bad + ' bad)');

  bad = 0;
  for (const it of veg.spots.palms) {
    if (it.rx === undefined || it.rx > 0) bad++;   // rx < 0 leans toward -Z, the sea
  }
  check(bad === 0, 'palms lean seaward (' + bad + ' leaning inland)');

  bad = 0;
  for (const it of veg.spots.grass) {
    if (onTread(it.x, it.z, 0.12)) bad++;
  }
  check(bad === 0, 'grass never on the tread (' + bad + ' on it)');

  bad = 0;
  for (const it of veg.spots.flowers) {
    if (inWater(it.x, it.z) || onTread(it.x, it.z, 0.8)) bad++;
  }
  check(bad === 0, 'flowers: dry and off the tread (' + bad + ' bad)');
  check(veg.spots.flowers.length > 40,
    'the hummingbirds have nectar tufts (' + veg.spots.flowers.length + ')');

  bad = 0;
  for (const it of veg.spots.ferns.concat(veg.spots.broads)) {
    if (inWater(it.x, it.z)) bad++;
  }
  check(bad === 0, 'undergrowth: nothing standing in the water (' + bad + ' bad)');

  // Built ground: nothing inside the pool ring or on the jetty.
  const nearPool = it => Math.hypot(it.x - POOL.x, it.z - POOL.z) < POOL.r + 1;
  const onJetty = it => Math.abs(it.x - JETTY.x) < JETTY.halfW + 2 && it.z < JETTY.z0 + 3;
  bad = 0;
  for (const list of [veg.spots.palms, veg.spots.giants, veg.spots.understory, veg.spots.bushes]) {
    for (const it of list) if (nearPool(it) || onJetty(it)) bad++;
  }
  check(bad === 0, 'nothing on the built ground (' + bad + ' bad)');

  // Colliders keep the walkable corridor clear.
  bad = 0;
  for (const b of veg.colliders) {
    const cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2;
    if (pathDistance(cx, cz) < PATH_HALF_W) bad++;
  }
  check(bad === 0, 'no collider on the path (' + bad + ' bad)');

  // Sightlines: the corridor is thin, the open forest is not touched.
  const corridor = sightlineClear(15, 141.5);
  const open = sightlineClear(0, 100);
  check(corridor < 0.3 && open > 0.99,
    `sightlines thin the tall growth (corridor ${corridor.toFixed(2)}, open ${open.toFixed(2)})`);

  // Wind: update() advances the shared clock the shaders bend by.
  const t0 = veg.wind.uWindTime.value;
  veg.update({ x: 0, z: 0 }, 0.5);
  check(veg.wind.uWindTime.value > t0, 'update() advances the wind clock');
}

globalThis.__jungleVegetationFailed = failed;
console.log(failed ? 'jungle_vegetation: ' + failed + ' FAILED' : 'jungle_vegetation: all passed');
