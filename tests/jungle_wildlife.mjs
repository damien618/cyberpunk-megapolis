// tests/jungle_wildlife.mjs — assertions for the wildlife system and its
// reference species, run under plain Chromium by tests/jungle_wildlife.py
// (no Node on this machine): python3 serve.py 8000 & then
// .venv/bin/python tests/jungle_wildlife.py
//
// Builds the cove's wildlife against a throwaway scene (with the real
// terrain's rocks) and holds it to what it claims: crabs only on the sand,
// off the path and the jetty, a colony round the rocks, the same layout on
// every load; asleep and undrawn far from the player; ALERT → FLEE → HIDDEN
// when approached and back out once the player has gone; the hidden left out
// of the draw; the crab shader compiling; and the frame cost.
import * as THREE from 'three';
import { createJungleWildlife } from '/jungleWildlife.js';
import { buildJungleTerrain } from '/jungleTerrain.js';
import { MOTION } from '/wildlifeMotion.js';
import { stepBoids, boidParams, boxBounds } from '/wildlifeBoids.js';
import { soilAt, SOIL, shoreAt, pathDistance, JETTY } from '/jungleLayout.js';

let failed = 0;
const check = (ok, msg) => { console.log((ok ? '  ok ' : 'FAIL ') + msg); if (!ok) failed++; };

const scene = new THREE.Scene();
let seed = 20260927 >>> 0;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
let rockInstances = 0;
const addInstanced = (g, m, items) => { rockInstances += items.length; return null; };
const terrain = buildJungleTerrain({ scene, addInstanced, rnd, maxAniso: 1 });
check(terrain.rockSpots.length === rockInstances,
  `terrain reports every rock it places (${terrain.rockSpots.length} / ${rockInstances})`);

let W = null;
try {
  W = createJungleWildlife({ scene, terrain });
  check(true, 'wildlife builds');
} catch (e) {
  check(false, 'wildlife builds: ' + e.stack);
}

if (W) {
  const { STATE } = W;
  const crab = W.debug.species.crab;
  const agents = crab.agents;
  check(scene.children.includes(W.group), 'group is on the scene, not the collision world');
  check(agents.length === 30, `30 crabs placed (${agents.length})`);

  // --- Habitat ------------------------------------------------------------
  const soils = agents.map(a => soilAt(a.home.x, a.home.z));
  check(soils.every(s => s === SOIL.SAND || s === SOIL.WET), 'every crab lives on sand or wet sand');
  const shore = agents.map(a => a.home.z - shoreAt(a.home.x));
  check(shore.every(d => d >= 1.5 && d <= 13), `all above the waterline, below the forest (${Math.min(...shore).toFixed(1)}..${Math.max(...shore).toFixed(1)} m)`);
  check(agents.every(a => pathDistance(a.home.x, a.home.z) >= 1.6), 'none on the path');
  const onJetty = agents.filter(a => Math.abs(a.home.x - JETTY.x) < JETTY.halfW + 1.2
    && a.home.z < JETTY.z0 + 1.2 && a.home.z > JETTY.z1 - 1.2);
  check(onJetty.length === 0, 'none under the jetty');
  const nearRock = agents.filter(a => terrain.rockSpots.some(r => Math.hypot(r.x - a.home.x, r.z - a.home.z) - r.r < 6));
  check(nearRock.length >= 15, `a colony round the rocks (${nearRock.length} / 30 within 6 m)`);

  // --- Determinism --------------------------------------------------------
  const W2 = createJungleWildlife({ scene: new THREE.Scene(), terrain });
  const same = W2.debug.species.crab.agents.every((a, i) => a.home.x === agents[i].home.x && a.home.z === agents[i].home.z);
  check(same, 'the same crabs in the same places on every load');

  // --- Sleep far away -----------------------------------------------------
  const P = new THREE.Vector3(0, 0, 400), V = new THREE.Vector3();
  const run = (secs, t0 = 0) => {
    let t = t0;
    for (let k = 0; k < secs * 30; k++) { t += 1 / 30; W.update(1 / 30, t, P, V); }
    return t;
  };
  let t = run(1);
  check(crab.mesh.count === 0 && W.stats.active === 0, 'nothing awake or drawn with the player far away');

  // --- Wandering ----------------------------------------------------------
  const a = agents[0];
  P.set(a.home.x + 15, 0, a.home.z);
  t = run(12, t);
  const wandered = agents.filter(b => b.awake && Math.hypot(b.x - b.home.x, b.z - b.home.z) > 0.1);
  check(wandered.length > 0, `calm crabs wander (${wandered.length} moved)`);
  check(agents.every(b => Number.isFinite(b.x) && Number.isFinite(b.y) && Number.isFinite(b.z)), 'no NaN positions');
  const strays = agents.filter(b => b.awake && Math.hypot(b.x - b.home.x, b.z - b.home.z) > crab.def.homeRange + 3);
  check(strays.length === 0, 'calm crabs stay by home (and above the swash)');
  check(crab.mesh.count === agents.filter(b => b.awake && b.sink < 1).length, 'drawn count = awake and not buried');

  // --- Fright -------------------------------------------------------------
  // Put the crab in a known calm state first, then walk up to it.
  a.state = STATE.IDLE; a.timer = 5; a.retreat = false; a.sink = 0;
  P.set(a.x + 2.5, 0, a.z + 0.5);
  const seen = new Set();
  let hiddenAt = -1;
  for (let k = 0; k < 30 * 8; k++) {
    t += 1 / 30; W.update(1 / 30, t, P, V);
    seen.add(a.state);
    if (a.state === STATE.HIDDEN && a.sink >= 1 && hiddenAt < 0) hiddenAt = k;
  }
  check(seen.has(STATE.ALERT), 'an approached crab freezes, claws up (ALERT)');
  check(seen.has(STATE.FLEE), 'then runs (FLEE)');
  check(hiddenAt >= 0, `then hides (HIDDEN, buried after ${(hiddenAt / 30).toFixed(1)} s)`);
  check(a.mood > 0 || a.state === STATE.HIDDEN, 'mood was raised for the claws');
  const buriedDrawn = crab.mesh.count === agents.filter(b => b.awake && b.sink < 1).length;
  check(buriedDrawn, 'a buried crab is left out of the draw');

  // --- Calm returns -------------------------------------------------------
  P.set(a.x + 16, 0, a.z);
  const seen2 = new Set();
  for (let k = 0; k < 30 * 25; k++) { t += 1 / 30; W.update(1 / 30, t, P, V); seen2.add(a.state); }
  check(seen2.has(STATE.EMERGE) && a.sink === 0, 'it comes back out once the player has gone');

  // --- Running scares from farther ----------------------------------------
  const b = agents.find(c => c !== a && c.state !== STATE.HIDDEN) || agents[1];
  b.state = STATE.IDLE; b.timer = 5; b.sink = 0; b.retreat = false;
  P.set(b.x + 5.5, 0, b.z);
  V.set(0, 0, 0);
  for (let k = 0; k < 6; k++) { t += 1 / 30; W.update(1 / 30, t, P, V); }
  const walkedPast = b.state === STATE.IDLE || b.state === STATE.MOVE;
  b.state = STATE.IDLE; b.timer = 5;
  V.set(5, 0, 0);
  for (let k = 0; k < 6; k++) { t += 1 / 30; W.update(1 / 30, t, P, V); }
  check(walkedPast && b.state === STATE.ALERT, 'at 5.5 m a walker is ignored, a runner is not');
  V.set(0, 0, 0);

  // --- Motions ------------------------------------------------------------
  let msg = '';
  try { MOTION.hop.step(); } catch (e) { msg = String(e.message); }
  check(/not implemented/.test(msg), 'undeclared motions fail loudly (' + msg.slice(0, 60) + '…)');

  // --- Shader -------------------------------------------------------------
  const errors = [];
  const origError = console.error;
  console.error = (...args) => { errors.push(args.join(' ')); origError(...args); };
  const renderer = new THREE.WebGLRenderer({ canvas: document.createElement('canvas') });
  renderer.setSize(64, 64);
  const cam = new THREE.PerspectiveCamera(50, 1, 0.05, 100);
  cam.position.set(a.x, a.y + 1, a.z + 1.2); cam.lookAt(a.x, a.y, a.z);
  const s2 = new THREE.Scene();
  s2.add(new THREE.AmbientLight(0xffffff, 1));
  s2.add(W.group);
  renderer.compile(s2, cam);
  renderer.render(s2, cam);
  console.error = origError;
  const prog = renderer.info.programs.find(p => p.cacheKey.includes('wildlife:crab'));
  check(!!prog && errors.length === 0, 'the crab shader compiles' + (errors.length ? ': ' + errors[0].slice(0, 300) : '')
    + (prog ? '' : ` (no program; count ${crab.mesh.count}, programs: ${renderer.info.programs.map(p => p.name).join(',')})`));
  renderer.dispose();

  // --- Cost ---------------------------------------------------------------
  P.set(0, 0, -8);   // mid-beach: a good share of the colony awake
  run(1, t);
  const t0 = performance.now();
  for (let k = 0; k < 300; k++) { t += 1 / 60; W.update(1 / 60, t, P, V); }
  const ms = (performance.now() - t0) / 300;
  check(ms < 0.4, `update costs ${ms.toFixed(3)} ms/frame with ${W.stats.active} awake`);
}


// --- Boids (pure; no species uses them yet) --------------------------------
{
  let bs = 7;
  const r = () => ((bs = (bs * 1664525 + 1013904223) >>> 0) / 4294967296);
  // A school of 20 in a pool-sized box, released in a clump.
  const box = { x: [-3, 3], y: [-1, 0], z: [-3, 3] };
  const fish = Array.from({ length: 20 }, () => ({
    x: (r() - 0.5), y: -0.5 + (r() - 0.5) * 0.2, z: (r() - 0.5),
    vx: r() - 0.5, vy: 0, vz: r() - 0.5,
  }));
  const P = boidParams({ sepDist: 0.5, viewDist: 2.5, maxSpeed: 1.2, minSpeed: 0.3 });
  const bounds = boxBounds(box, 0.3, 8);
  for (let k = 0; k < 600; k++) stepBoids(fish, P, 1 / 30, bounds);
  const inside = fish.every(f => f.x > box.x[0] - 0.3 && f.x < box.x[1] + 0.3
    && f.y > box.y[0] - 0.3 && f.y < box.y[1] + 0.3 && f.z > box.z[0] - 0.3 && f.z < box.z[1] + 0.3);
  check(inside, 'boids: the school stays inside its bounds');
  let dmin = Infinity;
  for (let i = 0; i < fish.length; i++) for (let j = i + 1; j < fish.length; j++)
    dmin = Math.min(dmin, Math.hypot(fish[i].x - fish[j].x, fish[i].y - fish[j].y, fish[i].z - fish[j].z));
  check(dmin > 0.15, `boids: separation holds (closest pair ${dmin.toFixed(2)} m)`);
  const c = fish.reduce((a, f) => ({ x: a.x + f.x / 20, y: a.y + f.y / 20, z: a.z + f.z / 20 }), { x: 0, y: 0, z: 0 });
  const spread = Math.max(...fish.map(f => Math.hypot(f.x - c.x, f.y - c.y, f.z - c.z)));
  check(spread < 4, `boids: cohesion keeps a school (spread ${spread.toFixed(2)} m)`);
  const sp = fish.map(f => Math.hypot(f.vx, f.vy, f.vz));
  check(sp.every(v => v >= P.minSpeed - 1e-6 && v <= P.maxSpeed + 1e-6), 'boids: speeds within [min, max]');
  check(fish.every(f => Number.isFinite(f.x + f.y + f.z + f.vx + f.vy + f.vz)), 'boids: no NaN');
  // A threat in the middle scatters them.
  const d0 = fish.reduce((a, f) => a + Math.hypot(f.x - c.x, f.z - c.z), 0) / 20;
  P.threat = { x: c.x, y: c.y, z: c.z }; P.fleeDist = 3;
  for (let k = 0; k < 20; k++) stepBoids(fish, P, 1 / 30, bounds);
  const d1 = fish.reduce((a, f) => a + Math.hypot(f.x - c.x, f.z - c.z), 0) / 20;
  check(d1 > d0 + 0.1, `boids: a threat scatters the school (${d0.toFixed(2)} → ${d1.toFixed(2)} m)`);
}

console.log(failed ? `\n${failed} FAILED` : '\nall passed');
globalThis.__jungleWildlifeFailed = failed;
