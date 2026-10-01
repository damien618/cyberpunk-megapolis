// tests/jungle_wildlife.mjs — assertions for the wildlife system and its
// reference species, run under plain Chromium by tests/jungle_wildlife.py
// (no Node on this machine): python3 serve.py 8000 & then
// .venv/bin/python tests/jungle_wildlife.py
//
// Builds the cove's wildlife against a throwaway scene (with the real
// terrain's rocks and the real vegetation's flower tufts) and holds it to
// what it claims: crabs only on the sand, off the path and the jetty, a
// colony round the rocks, the same layout on every load; asleep and undrawn
// far from the player; ALERT → FLEE → HIDDEN when approached and back out
// once the player has gone; the hidden left out of the draw; the crab shader
// compiling; the lizards by their rocks, the frogs by their pool, the
// dragonflies over the water and the hummingbirds by their flowers, all with
// the same discipline; and the frame cost.
import * as THREE from 'three';
import { createJungleWildlife, jungleWildlifeLayout } from '/jungleWildlife.js';
import { buildJungleTerrain } from '/jungleTerrain.js';
import { buildJungleVegetation } from '/jungleVegetation.js';
import { MOTION } from '/wildlifeMotion.js';
import { createWildlife, spotIndex } from '/wildlife.js';
import { CRAB } from '/wildlifeCrab.js';
import { FOX } from '/wildlifeFox.js';
import { LIZARD } from '/wildlifeLizard.js';
import { JAY } from '/wildlifeJay.js';
import { BUTTERFLY } from '/wildlifeButterfly.js';
import { HUMMINGBIRD } from '/wildlifeHummingbird.js';
import { PELICAN } from '/wildlifePelican.js';
import { SANDPIPER } from '/wildlifeSandpiper.js';
import { FROG } from '/wildlifeFrog.js';
import { GULL } from '/wildlifeSoarer.js';
import { stepBoids, boidParams, boxBounds } from '/wildlifeBoids.js';
import { soilAt, SOIL, shoreAt, pathDistance, streamDistance, JETTY, SAND_END, forestDensity, POOL, terrainHeight } from '/jungleLayout.js';

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

// The vegetation too, into a throwaway scene: its flower tufts are the
// hummingbirds' anchors and habitat (only the scatter's spot lists are read).
const veg = buildJungleVegetation({ scene: new THREE.Scene(), rnd, maxAniso: 1 });
check(veg.spots.flowers.length > 40,
  `the vegetation scatters nectar tufts (${veg.spots.flowers.length})`);

let W = null;
try {
  W = createJungleWildlife({ scene, terrain, vegetation: veg });
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
  const W2 = createJungleWildlife({ scene: new THREE.Scene(), terrain, vegetation: veg });
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
  // hop, flyFree, glide and amphibious are implemented now (the frogs', the
  // dragonflies', the eagle's, the sea lions'), and every declared motion
  // takes the (agent, species, dt, ctx, speed) contract.
  check(MOTION.hop.step.length === 5, 'the frogs\' hop motion is implemented');
  check(MOTION.flyFree.step.length === 5, 'the dragonflies\' flyFree motion is implemented');
  check(MOTION.glide.step.length === 5, 'the eagle\'s glide motion is implemented');
  check(MOTION.amphibious.step.length === 5, 'the sea lions\' amphibious motion is implemented');
  check(Object.values(MOTION).every(m => m && m.step && m.step.length === 5),
    'every declared motion implements the step contract');

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

  // --- Lizards ---------------------------------------------------------------
  // The side-blotched and the alligator, up-valley by the rocks: same rules
  // as the crabs, different soil.
  const liz = W.debug.species.lizard, gat = W.debug.species.lizardAlligator;
  if (liz && gat) {
    check(liz.agents.length === 10, `10 lizards placed (${liz.agents.length})`);
    check(gat.agents.length === 3, `3 alligator lizards placed (${gat.agents.length})`);
    const lSoils = liz.agents.map(b => soilAt(b.home.x, b.home.z));
    check(lSoils.every(s => s === SOIL.DIRT || s === SOIL.FOREST || s === SOIL.ROCK),
      'every lizard lives on dirt, forest floor or rock');
    check(liz.agents.every(b => pathDistance(b.home.x, b.home.z) >= 1.5),
      'none of them on the path');
    const lNear = liz.agents.filter(b =>
      terrain.rockSpots.some(r => Math.hypot(r.x - b.home.x, r.z - b.home.z) - r.r < 5));
    check(lNear.length >= 6, `a loose colony round the rocks (${lNear.length} / 10 within 5 m)`);
    const sameL = W2.debug.species.lizard.agents.every((b, i) =>
      b.home.x === liz.agents[i].home.x && b.home.z === liz.agents[i].home.z);
    check(sameL, 'the same lizards in the same places on every load');

    // Walk up to one: freeze, dart, hide.
    const la = liz.agents[0];
    la.state = STATE.IDLE; la.timer = 5; la.sink = 0;
    P.set(la.x + 2, 0, la.z + 0.3);
    const seenL = new Set();
    for (let k = 0; k < 30 * 8; k++) { t += 1 / 30; W.update(1 / 30, t, P, V); seenL.add(la.state); }
    check(seenL.has(STATE.ALERT), 'an approached lizard freezes (ALERT)');
    check(seenL.has(STATE.FLEE), 'then darts (FLEE)');
    check(seenL.has(STATE.HIDDEN), 'then hides (HIDDEN)');

    // The two lizard shaders compile.
    const errors2 = [];
    console.error = (...args) => { errors2.push(args.join(' ')); origError(...args); };
    const renderer2 = new THREE.WebGLRenderer({ canvas: document.createElement('canvas') });
    renderer2.setSize(64, 64);
    const cam2 = new THREE.PerspectiveCamera(50, 1, 0.05, 100);
    cam2.position.set(la.x, la.y + 1, la.z + 1.2); cam2.lookAt(la.x, la.y, la.z);
    const s3 = new THREE.Scene();
    s3.add(new THREE.AmbientLight(0xffffff, 1));
    s3.add(W.group);
    renderer2.compile(s3, cam2);
    renderer2.render(s3, cam2);
    console.error = origError;
    const progs = renderer2.info.programs.map(p => p.cacheKey);
    check(errors2.length === 0 && progs.some(k => k.includes('wildlife:lizard'))
      && progs.some(k => k.includes('wildlife:lizardAlligator')),
      'the lizard shaders compile' + (errors2.length ? ': ' + errors2[0].slice(0, 300) : ''));
    renderer2.dispose();

    // Frame cost with the lizards awake (they live where the player walks).
    P.set(la.x, 0, la.z);
    run(1, t);
    const t1 = performance.now();
    for (let k = 0; k < 300; k++) { t += 1 / 60; W.update(1 / 60, t, P, V); }
    const ms2 = (performance.now() - t1) / 300;
    check(ms2 < 0.5, `update costs ${ms2.toFixed(3)} ms/frame with the lizards awake`);
  }
}


// --- Fox ---------------------------------------------------------------------
// The island fox, in the undergrowth: the same discipline as the lizards,
// bolder — it never hides, it trots toward the densest forest it can reach
// without passing you, and picks its wandering back up when you have gone.
const fox = W && W.debug.species.fox;
if (fox) {
  const S = W.STATE;
  const P = new THREE.Vector3(), V = new THREE.Vector3();
  let t = 0;
  check(fox.agents.length === 3, `3 foxes placed (${fox.agents.length})`);
  check(fox.agents.every(b => {
    const s = soilAt(b.home.x, b.home.z);
    return s === SOIL.DIRT || s === SOIL.FOREST;
  }), 'every fox lives on dirt or forest floor');
  check(fox.agents.every(b => pathDistance(b.home.x, b.home.z) >= 1.5
    && streamDistance(b.home.x, b.home.z) >= 1.5),
    'none on the path or in the stream');
  check(fox.agents.every(b => b.home.z >= SAND_END), 'none down on the beach');
  const W3 = createJungleWildlife({ scene: new THREE.Scene(), terrain, vegetation: veg });
  const sameFox = W3.debug.species.fox.agents.every((b, i) =>
    b.home.x === fox.agents[i].home.x && b.home.z === fox.agents[i].home.z);
  check(sameFox, 'the same foxes in the same places on every load');

  // Walk up to one: a beat of ALERT, a trot away toward thicker forest —
  // and never a HIDDEN: a fox has no burrow.
  const fa = fox.agents[0];
  fa.state = S.IDLE; fa.timer = 5;
  P.set(fa.x + 2.5, 0, fa.z + 0.5);
  const seenFox = new Set();
  let fled = null;
  for (let k = 0; k < 30 * 10 && !(fled && fa.state !== S.FLEE); k++) {
    t += 1 / 30; W.update(1 / 30, t, P, V);
    seenFox.add(fa.state);
    if (fa.state === S.FLEE && !fled)
      fled = { from: { x: fa.x, z: fa.z }, to: { x: fa.tx, z: fa.tz } };
  }
  check(seenFox.has(S.ALERT), 'an approached fox freezes, looking at you (ALERT)');
  check(seenFox.has(S.FLEE), 'then trots off (FLEE)');
  check(!seenFox.has(S.HIDDEN), 'a fox never hides (no HIDDEN)');
  if (fled) {
    const ax = fled.from.x - P.x, az = fled.from.z - P.z;
    const tx = fled.to.x - fled.from.x, tz = fled.to.z - fled.from.z;
    const away = (tx * ax + tz * az) / (Math.hypot(tx, tz) * (Math.hypot(ax, az) || 1));
    check(away > 0.35, `the flight heads away from you, not past you (${away.toFixed(2)})`);
    check(forestDensity(fled.to.x, fled.to.z) >= forestDensity(fled.from.x, fled.from.z) - 0.2,
      'the flight aims no thinner into the forest than where it started');
  }

  // Once you have drifted past calmDistance it picks its wandering back up.
  P.set(fa.x + 16, 0, fa.z);
  const seenCalm = new Set();
  for (let k = 0; k < 30 * 14; k++) { t += 1 / 30; W.update(1 / 30, t, P, V); seenCalm.add(fa.state); }
  check(seenCalm.has(S.IDLE) || seenCalm.has(S.MOVE),
    'it wanders again once you have gone');
  check(!seenCalm.has(S.HIDDEN) && !seenCalm.has(S.EMERGE),
    'no hide-and-emerge detour either');

  // The fox shader compiles.
  const errorsF = [];
  const origErrorF = console.error;
  console.error = (...args) => { errorsF.push(args.join(' ')); origErrorF(...args); };
  const rendererF = new THREE.WebGLRenderer({ canvas: document.createElement('canvas') });
  rendererF.setSize(64, 64);
  const camF = new THREE.PerspectiveCamera(50, 1, 0.05, 100);
  camF.position.set(fa.home.x, fa.y + 1, fa.home.z + 1.2); camF.lookAt(fa.home.x, fa.y, fa.home.z);
  const sF = new THREE.Scene();
  sF.add(new THREE.AmbientLight(0xffffff, 1));
  sF.add(W.group);
  rendererF.compile(sF, camF);
  rendererF.render(sF, camF);
  console.error = origErrorF;
  const progsF = rendererF.info.programs.map(p => p.cacheKey);
  check(errorsF.length === 0 && progsF.some(k => k.includes('wildlife:fox')),
    'the fox shader compiles' + (errorsF.length ? ': ' + errorsF[0].slice(0, 300) : ''));
  rendererF.dispose();

  // Frame cost with the foxes awake.
  const tF1 = performance.now();
  for (let k = 0; k < 300; k++) { t += 1 / 60; W.update(1 / 60, t, P, V); }
  const msF = (performance.now() - tF1) / 300;
  check(msF < 0.5, `update costs ${msF.toFixed(3)} ms/frame with the foxes awake`);
}


// --- Snake -------------------------------------------------------------------
// The California kingsnake, in the forest: the same discipline as the fox —
// FOREST soil only, off the path, the same two snakes on every load — and
// the one behaviour that is its own: approached, it stops. No HIDDEN, no run
// to speak of; it holds where it stands until you have gone.
const snake = W && W.debug.species.snake;
if (snake) {
  const S = W.STATE;
  const P = new THREE.Vector3(), V = new THREE.Vector3();
  let t = 0;
  check(snake.agents.length === 2, `2 kingsnakes placed (${snake.agents.length})`);
  check(snake.agents.every(b => soilAt(b.home.x, b.home.z) === SOIL.FOREST),
    'every snake lives on forest floor');
  check(snake.agents.every(b => pathDistance(b.home.x, b.home.z) >= 2),
    'none of them on the path');
  check(snake.agents.every(b => b.home.z >= SAND_END), 'none down on the beach');
  check(snake.agents.length < 2
    || Math.hypot(snake.agents[0].home.x - snake.agents[1].home.x,
      snake.agents[0].home.z - snake.agents[1].home.z) >= 4,
    'the two of them live apart');
  const W4 = createJungleWildlife({ scene: new THREE.Scene(), terrain, vegetation: veg });
  const sameSnake = W4.debug.species.snake.agents.every((b, i) =>
    b.home.x === snake.agents[i].home.x && b.home.z === snake.agents[i].home.z);
  check(sameSnake, 'the same snakes in the same places on every load');

  // Walk up to one: it stops where it stands — a beat of ALERT, a "flight"
  // that ends at its own feet, then stillness until you are gone.
  const sa = snake.agents[0];
  sa.state = S.IDLE; sa.timer = 5;
  P.set(sa.x + 2, 0, sa.z + 0.3);
  const seenS = new Set();
  const x0 = sa.x, z0 = sa.z;
  for (let k = 0; k < 30 * 10; k++) {
    t += 1 / 30; W.update(1 / 30, t, P, V);
    seenS.add(sa.state);
  }
  check(seenS.has(S.ALERT), 'an approached snake stops (ALERT)');
  check(seenS.has(S.FLEE), 'its flight is entered');
  check(!seenS.has(S.HIDDEN) && !seenS.has(S.EMERGE), 'a snake never hides');
  const drift = Math.hypot(sa.x - x0, sa.z - z0);
  check(drift < 0.1, `it holds where it stands (${drift.toFixed(3)} m of drift)`);
  check(sa.mood > 0, 'mood was raised — the body wave stills');
  check(snake.mesh.count === snake.agents.filter(b => b.awake).length,
    'drawn count = awake (a frozen snake is still drawn)');

  // Once you have drifted past fear.radius it picks its wandering back up.
  P.set(sa.x + 16, 0, sa.z);
  const seenCalmS = new Set();
  for (let k = 0; k < 30 * 16; k++) {
    t += 1 / 30; W.update(1 / 30, t, P, V); seenCalmS.add(sa.state);
  }
  check(seenCalmS.has(S.MOVE), 'it wanders again once you have gone');

  // The snake shader compiles.
  const errorsS = [];
  const origErrorS = console.error;
  console.error = (...args) => { errorsS.push(args.join(' ')); origErrorS(...args); };
  const rendererS = new THREE.WebGLRenderer({ canvas: document.createElement('canvas') });
  rendererS.setSize(64, 64);
  const camS = new THREE.PerspectiveCamera(50, 1, 0.05, 100);
  camS.position.set(sa.x, sa.y + 1, sa.z + 1.2); camS.lookAt(sa.x, sa.y, sa.z);
  const sS = new THREE.Scene();
  sS.add(new THREE.AmbientLight(0xffffff, 1));
  sS.add(W.group);
  rendererS.compile(sS, camS);
  rendererS.render(sS, camS);
  console.error = origErrorS;
  const progsS = rendererS.info.programs.map(p => p.cacheKey);
  check(errorsS.length === 0 && progsS.some(k => k.includes('wildlife:snake')),
    'the snake shader compiles' + (errorsS.length ? ': ' + errorsS[0].slice(0, 300) : ''));
  rendererS.dispose();

  // Frame cost with the snakes awake.
  const tS1 = performance.now();
  for (let k = 0; k < 300; k++) { t += 1 / 60; W.update(1 / 60, t, P, V); }
  const msS = (performance.now() - tS1) / 300;
  check(msS < 0.5, `update costs ${msS.toFixed(3)} ms/frame with the snakes awake`);
}


// --- Frogs -------------------------------------------------------------------
// The Pacific tree frogs on the wet rock ring round the pool: the same
// discipline as the others — the ring only, off the path, the same eight on
// every load — and the one behaviour of their own: approached, they hop for
// the pool and stay under it until you have gone.
const frog = W && W.debug.species.frog;
if (frog) {
  const S = W.STATE;
  const P = new THREE.Vector3(), V = new THREE.Vector3();
  let t = 0;
  check(frog.agents.length === 8, `8 tree frogs placed (${frog.agents.length})`);
  const byPool = b => Math.hypot(b.home.x - POOL.x, b.home.z - POOL.z) - POOL.r <= 2;
  const byStream = b => streamDistance(b.home.x, b.home.z) < 1.8 + 2.5;
  check(frog.agents.every(b => byPool(b) || byStream(b)),
    'every frog lives within 2 m of the pool or on the stream\'s banks');
  check(frog.agents.filter(byPool).length >= 5 && frog.agents.some(b => !byPool(b)),
    `most round the pool, a few down the stream (${frog.agents.filter(byPool).length} / 8 by the pool)`);
  check(frog.agents.filter(byPool).every(b => {
    const s = soilAt(b.home.x, b.home.z);
    return s === SOIL.WET || s === SOIL.ROCK;
  }), 'the pool\'s frogs on wet ground or rock');
  const LF = jungleWildlifeLayout({ terrain, vegetation: veg });
  check(frog.agents.every(b => !LF.waterAt(b.home.x, b.home.z)), 'none in the water');
  check(frog.agents.every(b => pathDistance(b.home.x, b.home.z) >= 1.2), 'none of them on the path');
  const W5 = createJungleWildlife({ scene: new THREE.Scene(), terrain, vegetation: veg });
  const sameFrogs = W5.debug.species.frog.agents.every((b, i) =>
    b.home.x === frog.agents[i].home.x && b.home.z === frog.agents[i].home.z);
  check(sameFrogs, 'the same frogs in the same places on every load');

  // The hop: a calm frog crosses ground in leaps and lands on the terrain.
  const fa = frog.agents[0];
  P.set(fa.x + 12, 0, fa.z + 12);
  fa.state = S.MOVE; fa.timer = 6; fa.sink = 0; fa.hopPhase = 2;
  fa.tx = fa.home.x + 1.5; fa.tz = fa.home.z + 0.4;
  let hops = 0, wasAir = false, badLanding = false, nan = false;
  for (let k = 0; k < 30 * 6 && fa.state === S.MOVE; k++) {
    t += 1 / 30; W.update(1 / 30, t, P, V);
    if (fa.hopPhase === 1) wasAir = true;
    else if (wasAir && fa.hopPhase === 2) {
      hops++; wasAir = false;
      if (Math.abs(fa.y - terrainHeight(fa.x, fa.z)) > 0.02) badLanding = true;
    }
    if (!Number.isFinite(fa.x + fa.y + fa.z)) { nan = true; break; }
  }
  check(hops >= 2 && !badLanding && !nan, `hop: ${hops} chained leap(s), each landing on the terrain, no NaN`);

  // Fright: approached from the path side, the way out is the pool.
  fa.state = S.IDLE; fa.timer = 5; fa.sink = 0; fa.hopPhase = 2;
  const toPool = Math.atan2(POOL.x - fa.x, POOL.z - fa.z);
  P.set(fa.x - Math.sin(toPool) * 1.8, 0, fa.z - Math.cos(toPool) * 1.8);
  const seenF = new Set();
  let hidAt = -1, inPool = false;
  for (let k = 0; k < 30 * 10; k++) {
    t += 1 / 30; W.update(1 / 30, t, P, V);
    seenF.add(fa.state);
    if (fa.state === S.HIDDEN && fa.sink >= 1 && hidAt < 0) hidAt = k;
    if (fa.hopPhase === 2 && Math.hypot(fa.x - POOL.x, fa.z - POOL.z) < POOL.r) inPool = true;
  }
  check(seenF.has(S.ALERT) && seenF.has(S.FLEE), 'an approached frog freezes flat, then hops for it');
  check(inPool, 'the flight hops INTO the pool');
  check(hidAt >= 0, `then stays under (HIDDEN, sunk after ${(hidAt / 30).toFixed(1)} s)`);
  check(frog.mesh.count === frog.agents.filter(b => b.awake && b.sink < 1).length,
    'the sunken frog is left out of the draw');

  // Calm returns: past calmDistance it hops back out and wanders the ring.
  P.set(fa.x + 16, 0, fa.z);
  const seenCalmF = new Set();
  let underF = 0;
  for (let k = 0; k < 30 * 22; k++) {
    t += 1 / 30; W.update(1 / 30, t, P, V); seenCalmF.add(fa.state);
    // Drawn, in the pool, below its surface: surfacing through the bed.
    if (fa.state !== S.HIDDEN && fa.sink < 1 && Math.hypot(fa.x - POOL.x, fa.z - POOL.z) < POOL.r + 2.2
      && fa.y < POOL.waterY - 0.03) underF++;
  }
  check(seenCalmF.has(S.EMERGE) && fa.sink === 0, 'it hops back out of the pool once you have gone');
  check(underF === 0, `it surfaces on the bank, never shown under the water (${underF} frames)`);

  // The frog shader compiles.
  const errorsFr = [];
  const origErrorFr = console.error;
  console.error = (...args) => { errorsFr.push(args.join(' ')); origErrorFr(...args); };
  const rendererFr = new THREE.WebGLRenderer({ canvas: document.createElement('canvas') });
  rendererFr.setSize(64, 64);
  const camFr = new THREE.PerspectiveCamera(50, 1, 0.05, 100);
  camFr.position.set(fa.x, fa.y + 1, fa.z + 1.2); camFr.lookAt(fa.x, fa.y, fa.z);
  const sFr = new THREE.Scene();
  sFr.add(new THREE.AmbientLight(0xffffff, 1));
  sFr.add(W.group);
  rendererFr.compile(sFr, camFr);
  rendererFr.render(sFr, camFr);
  console.error = origErrorFr;
  const progsFr = rendererFr.info.programs.map(p => p.cacheKey);
  check(errorsFr.length === 0 && progsFr.some(k => k.includes('wildlife:frog')),
    'the frog shader compiles' + (errorsFr.length ? ': ' + errorsFr[0].slice(0, 300) : ''));
  rendererFr.dispose();

  // Frame cost with the frogs awake.
  const tFr1 = performance.now();
  for (let k = 0; k < 300; k++) { t += 1 / 60; W.update(1 / 60, t, P, V); }
  const msFr = (performance.now() - tFr1) / 300;
  check(msFr < 0.5, `update costs ${msFr.toFixed(3)} ms/frame with the frogs awake`);
}


// --- Fish --------------------------------------------------------------------
// The pool's silver school: the first `school` species. All of them live in
// the pool's water, the school holds together at mid-depth, scatters from
// the player who wades in and closes again once they are out — and it never
// stops swimming.
const fish = W && W.debug.species.fish;
if (fish) {
  const P = new THREE.Vector3(), V = new THREE.Vector3();
  let t = 0;
  const inPool = (x, z) => Math.hypot(x - POOL.x, z - POOL.z) < POOL.r + 2.2
    && terrainHeight(x, z) < POOL.waterY - 0.3;
  const spread = bs => {   // farthest fish from the school's centroid
    const c = bs.reduce((s, b) => ({ x: s.x + b.x / bs.length, z: s.z + b.z / bs.length }), { x: 0, z: 0 });
    return Math.max(...bs.map(b => Math.hypot(b.x - c.x, b.z - c.z)));
  };
  check(fish.agents.length === 14, `14 fish placed (${fish.agents.length})`);
  check(fish.agents.every(b => inPool(b.home.x, b.home.z)), 'every fish lives in the pool\'s water');
  const W6 = createJungleWildlife({ scene: new THREE.Scene(), terrain, vegetation: veg });
  check(W6.debug.species.fish.agents.every((b, i) =>
    b.home.x === fish.agents[i].home.x && b.home.z === fish.agents[i].home.z),
    'the same fish in the same places on every load');

  // Swimming: by the pool the whole school is awake, up off the bed, under
  // the surface, together, moving, and drawn.
  P.set(POOL.x - 6, 0, POOL.z - 6);
  for (let k = 0; k < 30 * 6; k++) { t += 1 / 30; W.update(1 / 30, t, P, V); }
  const swim = fish.agents.filter(b => b.awake);
  check(swim.length === 14, `the whole school is awake by the pool (${swim.length})`);
  check(swim.every(b => b.y > terrainHeight(b.x, b.z) + 0.04 && b.y < POOL.waterY - 0.03),
    'the school swims between the bed and the surface');
  const sp0 = spread(swim);
  check(sp0 < 6, `the school holds together (spread ${sp0.toFixed(2)} m)`);
  check(swim.every(b => b.state === W.STATE.MOVE), 'no fish ever idles — the tick keeps them swimming');
  const moving = swim.filter(b => b.speed > 0.1).length;
  check(moving >= 12, `the school is moving (${moving} / 14 over 0.1 m/s)`);
  check(fish.mesh.count === 14, 'the whole school is drawn (one instanced draw)');

  // A player wading in scatters them; wading out lets them close up again.
  P.set(POOL.x - 2, 0, POOL.z - 2);
  for (let k = 0; k < 30 * 4; k++) { t += 1 / 30; W.update(1 / 30, t, P, V); }
  let dNear = 0;
  for (const b of swim) dNear += Math.hypot(b.x - P.x, b.z - P.z);
  dNear /= swim.length;
  check(dNear > 2.0, `the wading player clears the water around them (mean ${dNear.toFixed(2)} m)`);
  P.set(POOL.x - 16, 0, POOL.z - 12);
  for (let k = 0; k < 30 * 6; k++) { t += 1 / 30; W.update(1 / 30, t, P, V); }
  const sp1 = spread(swim);
  check(sp1 < 6, `the school closes again once they have gone (spread ${sp1.toFixed(2)} m)`);
  check(swim.every(b => Math.hypot(b.x - POOL.x, b.z - POOL.z) < POOL.r),
    'nobody beached themselves in all that');

  // The fish shader compiles.
  const errorsFi = [];
  const origErrorFi = console.error;
  console.error = (...args) => { errorsFi.push(args.join(' ')); origErrorFi(...args); };
  const rendererFi = new THREE.WebGLRenderer({ canvas: document.createElement('canvas') });
  rendererFi.setSize(64, 64);
  const camFi = new THREE.PerspectiveCamera(50, 1, 0.05, 100);
  camFi.position.set(swim[0].x, POOL.waterY + 1.2, swim[0].z + 1.4);
  camFi.lookAt(swim[0].x, swim[0].y, swim[0].z);
  const sFi = new THREE.Scene();
  sFi.add(new THREE.AmbientLight(0xffffff, 1));
  sFi.add(W.group);
  rendererFi.compile(sFi, camFi);
  rendererFi.render(sFi, camFi);
  console.error = origErrorFi;
  const progsFi = rendererFi.info.programs.map(p => p.cacheKey);
  check(errorsFi.length === 0 && progsFi.some(k => k.includes('wildlife:fish')),
    'the fish shader compiles' + (errorsFi.length ? ': ' + errorsFi[0].slice(0, 300) : ''));
  rendererFi.dispose();

  // Frame cost with the whole school awake.
  P.set(POOL.x - 6, 0, POOL.z - 6);
  const tFi = performance.now();
  for (let k = 0; k < 300; k++) { t += 1 / 30; W.update(1 / 30, t, P, V); }
  const msFi = (performance.now() - tFi) / 300;
  check(msFi < 0.5, `update costs ${msFi.toFixed(3)} ms/frame with the school awake`);
}


// --- Dragonflies --------------------------------------------------------------
// The pool's blue emperors: the first `flyFree` species. All of them live
// within 6 m of the pool, never land, hang on figure-of-eights between fast
// zigzag darts, ride their band above the water or the ground — and are back
// on patrol one hard sidestep after you walk in.
const dfly = W && W.debug.species.dragonfly;
if (dfly) {
  const S = W.STATE;
  const P = new THREE.Vector3(), V = new THREE.Vector3();
  let t = 0;
  // The surface the band rides over: the pool's water where it is water,
  // the terrain everywhere else (the narrow stream reads close enough).
  const over = (x, z) => (Math.hypot(x - POOL.x, z - POOL.z) < POOL.r - 0.5
    && terrainHeight(x, z) < POOL.waterY) ? POOL.waterY : terrainHeight(x, z);
  check(dfly.agents.length === 6, `6 dragonflies placed (${dfly.agents.length})`);
  check(dfly.agents.every(b => Math.hypot(b.home.x - POOL.x, b.home.z - POOL.z) - POOL.r <= 6
    || streamDistance(b.home.x, b.home.z) < 2.5),
    'every dragonfly lives within 6 m of the pool or over the stream');
  const W7 = createJungleWildlife({ scene: new THREE.Scene(), terrain, vegetation: veg });
  check(W7.debug.species.dragonfly.agents.every((b, i) =>
    b.home.x === dfly.agents[i].home.x && b.home.z === dfly.agents[i].home.z),
    'the same dragonflies in the same places on every load');

  // The flight: by the pool they are all awake, airborne, in their band
  // (below it only while the spawn climb catches up), and alternating
  // hovers — a hang of half a second and more — with fast zigzag darts.
  P.set(POOL.x - 5, 0, POOL.z - 5);
  const da = dfly.agents[0];
  let hoverRun = 0, sawHover = false, sawDart = false, bandBreak = 0, nan = false;
  let idleRun = 0, maxIdleRun = 0, path = 0, lx = da.x, lz = da.z;
  for (let k = 0; k < 30 * 24; k++) {
    t += 1 / 30; W.update(1 / 30, t, P, V);
    if (da.state === S.IDLE) { idleRun++; maxIdleRun = Math.max(maxIdleRun, idleRun); }
    else idleRun = 0;
    const surf = over(da.x, da.z);
    if (k > 45 && (da.y < surf - 0.25 || da.y > surf + 2.6)) bandBreak++;
    if (da.speed < 0.55) { hoverRun++; if (hoverRun >= 15) sawHover = true; } else hoverRun = 0;
    if (da.speed > 1.0) sawDart = true;
    path += Math.hypot(da.x - lx, da.z - lz); lx = da.x; lz = da.z;
    if (!Number.isFinite(da.x + da.y + da.z)) { nan = true; break; }
  }
  check(maxIdleRun <= 1, `the tick never lands one (an IDLE of ${maxIdleRun} frame at most)`);
  check(bandBreak === 0, `the flight stays on its band (${bandBreak} breaks)`);
  check(sawHover, 'it hangs at its anchors (hovers of half a second and more)');
  check(sawDart, 'and darts between them at over 1 m/s');
  check(path > 12, `it covers ground (${path.toFixed(1)} m in 24 s)`);
  check(!nan, 'no NaN positions');

  // Fright: walk within fear.radius — a beat of ALERT, a hard FLEE, then it
  // hangs again nearby (hideFor is null: a dragonfly never hides).
  da.state = S.MOVE; da.timer = 5;
  P.set(da.x + 1.8, 0, da.z);
  const seenD = new Set();
  for (let k = 0; k < 30 * 8; k++) { t += 1 / 30; W.update(1 / 30, t, P, V); seenD.add(da.state); }
  check(seenD.has(S.ALERT) && seenD.has(S.FLEE), 'an approached dragonfly skips aside (ALERT, then FLEE)');
  check(!seenD.has(S.HIDDEN), 'a dragonfly never hides');
  P.set(da.x + 16, 0, da.z);
  let backToWork = false;
  for (let k = 0; k < 30 * 12 && !backToWork; k++) {
    t += 1 / 30; W.update(1 / 30, t, P, V);
    if (da.state === S.MOVE && da.speed > 1.0) backToWork = true;
  }
  check(backToWork, 'it is back on patrol once you have gone');

  // The dragonfly shader compiles.
  const errorsD = [];
  const origErrorD = console.error;
  console.error = (...args) => { errorsD.push(args.join(' ')); origErrorD(...args); };
  const rendererD = new THREE.WebGLRenderer({ canvas: document.createElement('canvas') });
  rendererD.setSize(64, 64);
  const camD = new THREE.PerspectiveCamera(50, 1, 0.05, 100);
  camD.position.set(da.x, da.y + 0.8, da.z + 1.1); camD.lookAt(da.x, da.y, da.z);
  const sD = new THREE.Scene();
  sD.add(new THREE.AmbientLight(0xffffff, 1));
  sD.add(W.group);
  rendererD.compile(sD, camD);
  rendererD.render(sD, camD);
  console.error = origErrorD;
  const progsD = rendererD.info.programs.map(p => p.cacheKey);
  check(errorsD.length === 0 && progsD.some(k => k.includes('wildlife:dragonfly')),
    'the dragonfly shader compiles' + (errorsD.length ? ': ' + errorsD[0].slice(0, 300) : ''));
  rendererD.dispose();

  // Frame cost with the patrol awake.
  P.set(POOL.x - 5, 0, POOL.z - 5);
  const tD1 = performance.now();
  for (let k = 0; k < 300; k++) { t += 1 / 60; W.update(1 / 60, t, P, V); }
  const msD = (performance.now() - tD1) / 300;
  check(msD < 0.5, `update costs ${msD.toFixed(3)} ms/frame with the patrol awake`);
}


// --- Boids (pure; the fish's school motion drives them) ----------------------
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

// --- Hummingbirds -----------------------------------------------------------
// The clearings' Allen's hummingbirds: the second `flyFree` species. All of
// them live within 4 m of a flower tuft, never land, hang at a bloom between
// fast darts, ride their band above the ground — and are back at the nectar
// one hard sidestep after you walk in.
const hb = W && W.debug.species.hummingbird;
if (hb) {
  const S = W.STATE;
  const P = new THREE.Vector3(), V = new THREE.Vector3();
  let t = 0;
  const tufts = veg.spots.flowers;
  check(hb.agents.length === 8, `8 hummingbirds placed (${hb.agents.length})`);
  check(hb.agents.every(b => tufts.some(f => Math.hypot(b.home.x - f.x, b.home.z - f.z) - f.r <= 4)),
    'every hummingbird lives within 4 m of a flower tuft');
  const W8 = createJungleWildlife({ scene: new THREE.Scene(), terrain, vegetation: veg });
  check(W8.debug.species.hummingbird.agents.every((b, i) =>
    b.home.x === hb.agents[i].home.x && b.home.z === hb.agents[i].home.z),
    'the same hummingbirds in the same places on every load');

  // The flight: by the flowers they are all awake, airborne, in their band,
  // alternating hangs at a bloom with fast darts.
  const da = hb.agents[0];
  P.set(da.home.x + 5, 0, da.home.z + 5);
  let hoverRun = 0, sawHover = false, sawDart = false, bandBreak = 0, nan = false;
  let idleRun = 0, maxIdleRun = 0, path = 0, lx = da.x, lz = da.z;
  for (let k = 0; k < 30 * 24; k++) {
    t += 1 / 30; W.update(1 / 30, t, P, V);
    if (da.state === S.IDLE) { idleRun++; maxIdleRun = Math.max(maxIdleRun, idleRun); }
    else idleRun = 0;
    const surf = terrainHeight(da.x, da.z);
    if (k > 60 && (da.y < surf - 0.25 || da.y > surf + 1.7)) bandBreak++;
    if (da.speed < 0.55) { hoverRun++; if (hoverRun >= 15) sawHover = true; } else hoverRun = 0;
    if (da.speed > 1.0) sawDart = true;
    path += Math.hypot(da.x - lx, da.z - lz); lx = da.x; lz = da.z;
    if (!Number.isFinite(da.x + da.y + da.z)) { nan = true; break; }
  }
  check(maxIdleRun <= 1, `the tick never lands one (an IDLE of ${maxIdleRun} frame at most)`);
  check(bandBreak === 0, `the flight stays on its band (${bandBreak} breaks)`);
  check(sawHover, 'it hangs at the blooms (hovers of half a second and more)');
  check(sawDart, 'and darts between them at over 1 m/s');
  check(path > 12, `it covers ground (${path.toFixed(1)} m in 24 s)`);
  check(!nan, 'no NaN positions');

  // Fright: walk within fear.radius — a beat of ALERT, a hard FLEE, then it
  // hangs again nearby (hideFor is null: a hummingbird never hides).
  da.state = S.MOVE; da.timer = 5;
  P.set(da.x + 1.8, 0, da.z);
  const seenH = new Set();
  for (let k = 0; k < 30 * 8; k++) { t += 1 / 30; W.update(1 / 30, t, P, V); seenH.add(da.state); }
  check(seenH.has(S.ALERT) && seenH.has(S.FLEE), 'an approached hummingbird skips aside (ALERT, then FLEE)');
  check(!seenH.has(S.HIDDEN), 'a hummingbird never hides');
  P.set(da.x + 16, 0, da.z);
  let backToNectar = false;
  for (let k = 0; k < 30 * 12 && !backToNectar; k++) {
    t += 1 / 30; W.update(1 / 30, t, P, V);
    if (da.state === S.MOVE && da.speed > 1.0) backToNectar = true;
  }
  check(backToNectar, 'it is back at the nectar once you have gone');

  // The hummingbird shader compiles.
  const errorsH = [];
  const origErrorH = console.error;
  console.error = (...args) => { errorsH.push(args.join(' ')); origErrorH(...args); };
  const rendererH = new THREE.WebGLRenderer({ canvas: document.createElement('canvas') });
  rendererH.setSize(64, 64);
  const camH = new THREE.PerspectiveCamera(50, 1, 0.05, 100);
  camH.position.set(da.x, da.y + 0.8, da.z + 1.1); camH.lookAt(da.x, da.y, da.z);
  const sH = new THREE.Scene();
  sH.add(new THREE.AmbientLight(0xffffff, 1));
  sH.add(W.group);
  rendererH.compile(sH, camH);
  rendererH.render(sH, camH);
  console.error = origErrorH;
  const progsH = rendererH.info.programs.map(p => p.cacheKey);
  check(errorsH.length === 0 && progsH.some(k => k.includes('wildlife:hummingbird')),
    'the hummingbird shader compiles' + (errorsH.length ? ': ' + errorsH[0].slice(0, 300) : ''));
  rendererH.dispose();

  // Frame cost with the patrol awake.
  P.set(da.home.x + 5, 0, da.home.z + 5);
  const tH1 = performance.now();
  for (let k = 0; k < 300; k++) { t += 1 / 60; W.update(1 / 60, t, P, V); }
  const msH = (performance.now() - tH1) / 300;
  check(msH < 0.5, `update costs ${msH.toFixed(3)} ms/frame with the patrol awake`);
}

// --- Pelicans -----------------------------------------------------------------
// The open sea's brown file: the first `flock` species. All five live over
// water beyond the wade barrier, hold a file behind their leader a few
// metres above the sea, never idle, never fear — and every so often the
// leader folds into a plunge the whole line follows down.
const pel = W && W.debug.species.pelican;
if (pel) {
  const PP = new THREE.Vector3(), VV = new THREE.Vector3();
  let tp = 0;
  check(pel.agents.length === 5, `5 pelicans placed (${pel.agents.length})`);
  check(pel.agents.every(b => b.home.z < shoreAt(b.home.x)), 'every pelican lives over the sea');
  const W8 = createJungleWildlife({ scene: new THREE.Scene(), terrain, vegetation: veg });
  check(W8.debug.species.pelican.agents.every((b, i) =>
    b.home.x === pel.agents[i].home.x && b.home.z === pel.agents[i].home.z),
    'the same pelicans in the same places on every load');

  // The flight: from the beach the whole line is awake and airborne — a
  // band above the sea (flat SEA_Y here: no ocean in the harness) —
  // streaming behind the leader and never idling. Fifty seconds sees a
  // plunge: the leader under a metre of the surface, wings folded (gait 1).
  PP.set(0, 0, -6);
  const lead = pel.agents[0];
  let idleRun = 0, maxIdleRun = 0, bandBreak = 0, nan = false, awakeAll = false;
  let maxGap = 0, sawDive = false, minLeadY = Infinity, maxGait = 0;
  for (let k = 0; k < 30 * 50; k++) {
    tp += 1 / 30; W.update(1 / 30, tp, PP, VV);
    let all = true;
    for (const b of pel.agents) {
      if (!b.awake) all = false;
      if (b.state === W.STATE.IDLE) { idleRun++; maxIdleRun = Math.max(maxIdleRun, idleRun); }
      else idleRun = 0;
      if (k > 90 && (b.y < 0.15 || b.y > 6.5)) bandBreak++;
      if (!Number.isFinite(b.x + b.y + b.z)) nan = true;
    }
    if (all) awakeAll = true;
    if (nan) break;
    let gap = 0;
    for (const b of pel.agents) gap = Math.max(gap, Math.hypot(b.x - lead.x, b.z - lead.z));
    if (k > 90) maxGap = Math.max(maxGap, gap);
    if (lead.y < 1.0) sawDive = true;
    minLeadY = Math.min(minLeadY, lead.y);
    maxGait = Math.max(maxGait, lead.gait);
  }
  check(awakeAll, 'the whole line is awake from the beach');
  check(maxIdleRun <= 1, `the tick never idles one (an IDLE of ${maxIdleRun} frame at most)`);
  check(bandBreak === 0, `the line holds its band above the sea (${bandBreak} breaks)`);
  check(maxGap < 14, `the file stays a file (max gap ${maxGap.toFixed(1)} m)`);
  check(sawDive, `the leader plunges (lowest ${minLeadY.toFixed(2)} m in 50 s)`);
  check(maxGait > 0.95, `the plunge folds the wings (gait ${maxGait.toFixed(2)})`);
  check(pel.agents.every(b => b.z < -38), 'nobody crossed the wade barrier in all that');
  check(!nan, 'no NaN positions');

  // The pelican shader compiles.
  const errorsP = [];
  const origErrorP = console.error;
  console.error = (...args) => { errorsP.push(args.join(' ')); origErrorP(...args); };
  const rendererP = new THREE.WebGLRenderer({ canvas: document.createElement('canvas') });
  rendererP.setSize(64, 64);
  const camP = new THREE.PerspectiveCamera(50, 1, 0.05, 300);
  camP.position.set(lead.x, lead.y + 2, lead.z + 3); camP.lookAt(lead.x, lead.y, lead.z);
  const sP = new THREE.Scene();
  sP.add(new THREE.AmbientLight(0xffffff, 1));
  sP.add(W.group);
  rendererP.compile(sP, camP);
  rendererP.render(sP, camP);
  console.error = origErrorP;
  const progsP = rendererP.info.programs.map(p => p.cacheKey);
  check(errorsP.length === 0 && progsP.some(k => k.includes('wildlife:pelican')),
    'the pelican shader compiles' + (errorsP.length ? ': ' + errorsP[0].slice(0, 300) : ''));
  rendererP.dispose();

  // The one-draw rule, and the frame cost with the whole line awake.
  check(pel.mesh.count === 5, 'the whole line is drawn (one instanced draw)');
  const tP1 = performance.now();
  for (let k = 0; k < 300; k++) { tp += 1 / 30; W.update(1 / 30, tp, PP, VV); }
  const msP = (performance.now() - tP1) / 300;
  check(msP < 0.5, `update costs ${msP.toFixed(3)} ms/frame with the line awake`);
}


// --- Bald eagle ----------------------------------------------------------------
// The ridge's bald eagle: the first `glide` species. One bird over the high
// ground, riding slow banked circles round a centre that drifts on the wind,
// now and then gliding on to a fresh circle the other way round — never
// landing, never hiding, never idling, awake from anywhere in the cove.
const eag = W && W.debug.species.eagle;
if (eag) {
  const S = W.STATE;
  const P = new THREE.Vector3(), V = new THREE.Vector3();
  let t = 0;
  check(eag.agents.length === 1, `1 eagle placed (${eag.agents.length})`);
  check(eag.agents.every(b => terrainHeight(b.home.x, b.home.z) >= 12),
    'the eagle lives over the high ground (12 m and more)');
  const W9 = createJungleWildlife({ scene: new THREE.Scene(), terrain, vegetation: veg });
  check(W9.debug.species.eagle.agents.every((b, i) =>
    b.home.x === eag.agents[i].home.x && b.home.z === eag.agents[i].home.z),
    'the same eagle in the same place on every load');

  // The flight: from the valley floor it is awake, airborne on its band well
  // above the ridge line, leaning into its circles at a steady soaring pace.
  const ea = eag.agents[0];
  P.set(-8, 0, -4); V.set(0, 0, 0);
  let idleRun = 0, maxIdleRun = 0, bandBreak = 0, nan = false, awake = false;
  let rollSeen = 0, speedMin = Infinity, speedMax = 0, alt = 0, flown = 0;
  let lx = ea.x, lz = ea.z;
  for (let k = 0; k < 30 * 40; k++) {
    t += 1 / 30; W.update(1 / 30, t, P, V);
    if (ea.awake) awake = true;
    if (ea.state === S.IDLE) { idleRun++; maxIdleRun = Math.max(maxIdleRun, idleRun); }
    else idleRun = 0;
    const surf = terrainHeight(ea.x, ea.z);
    if (k > 60 && ea.y < surf + 14) bandBreak++;
    rollSeen = Math.max(rollSeen, Math.abs(ea.roll || 0));
    if (ea.speed > 0.1) {
      speedMin = Math.min(speedMin, ea.speed);
      speedMax = Math.max(speedMax, ea.speed);
    }
    alt = Math.max(alt, ea.y - surf);
    flown += Math.hypot(ea.x - lx, ea.z - lz); lx = ea.x; lz = ea.z;
    if (!Number.isFinite(ea.x + ea.y + ea.z)) { nan = true; break; }
  }
  check(awake, 'the eagle is awake from the valley floor');
  // It flies past the near tier (> 25 m), so it thinks one frame in 4 and an
  // IDLE can only ever be seen inside one skip window — the tick flips it at
  // the very next think. An IDLE longer than that would mean a landed bird.
  check(maxIdleRun <= 4, `the tick never lands it (an IDLE of ${maxIdleRun} frames, one skip window, at most)`);
  check(bandBreak === 0, `it rides its band above the ground (${bandBreak} breaks)`);
  check(rollSeen > 0.25, `it banks into its circles (roll up to ${rollSeen.toFixed(2)} rad)`);
  check(Number.isFinite(speedMin) && speedMin > 2.5 && speedMax < 7,
    `it soars at a steady pace (${speedMin.toFixed(1)}–${speedMax.toFixed(1)} m/s)`);
  check(alt > 15, `it keeps its height (${alt.toFixed(0)} m above the ground at best)`);
  check(flown > 150, `it covers ground (${flown.toFixed(0)} m in 40 s)`);
  check(!nan, 'no NaN positions');

  // The eagle shader compiles.
  const errorsE = [];
  const origErrorE = console.error;
  console.error = (...args) => { errorsE.push(args.join(' ')); origErrorE(...args); };
  const rendererE = new THREE.WebGLRenderer({ canvas: document.createElement('canvas') });
  rendererE.setSize(64, 64);
  const camE = new THREE.PerspectiveCamera(50, 1, 0.05, 300);
  camE.position.set(ea.x, ea.y + 1.5, ea.z + 2.5); camE.lookAt(ea.x, ea.y, ea.z);
  const sE = new THREE.Scene();
  sE.add(new THREE.AmbientLight(0xffffff, 1));
  sE.add(W.group);
  rendererE.compile(sE, camE);
  rendererE.render(sE, camE);
  console.error = origErrorE;
  const progsE = rendererE.info.programs.map(p => p.cacheKey);
  check(errorsE.length === 0 && progsE.some(k => k.includes('wildlife:eagle')),
    'the eagle shader compiles' + (errorsE.length ? ': ' + errorsE[0].slice(0, 300) : ''));
  rendererE.dispose();

  // The one-draw rule, and the frame cost with the eagle awake.
  check(eag.mesh.count === 1, 'the eagle is drawn (one instanced draw)');
  const tE1 = performance.now();
  for (let k = 0; k < 300; k++) { t += 1 / 30; W.update(1 / 30, t, P, V); }
  const msE = (performance.now() - tE1) / 300;
  check(msE < 0.5, `update costs ${msE.toFixed(3)} ms/frame with the eagle awake`);

  // --- Sea lions -----------------------------------------------------------
  // The offshore haul-outs: six loafing, sliding, diving, returning sea
  // lions. The wade barrier keeps the player at the show's distance, so
  // fear never fires — the dive is the species' own: a slide off the rock,
  // HIDDEN under the swell (out of the draw at full sink), an EMERGE
  // somewhere nearby, then the swim home.
  const sea = W.debug.species.seaLion;
  if (sea) {
    check(sea.agents.length === 6, `6 sea lions placed (${sea.agents.length})`);
    const onHaul = sea.agents.filter(b =>
      terrain.hauloutSpots.some(s => Math.hypot(s.x - b.home.x, s.z - b.home.z) - s.r < 0.45));
    check(onHaul.length === 6, `every sea lion lives on a haul-out (${onHaul.length} / 6)`);

    const W9 = createJungleWildlife({ scene: new THREE.Scene(), terrain, vegetation: veg });
    check(W9.debug.species.seaLion.agents.every((b, i) =>
      b.home.x === sea.agents[i].home.x && b.home.z === sea.agents[i].home.z),
      'the same sea lions in the same places on every load');

    // A minute and a quarter of a sea lion watched from the beach: it mixes
    // rock and water, dives, surfaces again, and stays out at sea.
    const sl = sea.agents[0];
    P.set(0, 0, -8); V.set(0, 0, 0);
    const statesL = new Set();
    let sawRockL = false, sawWaterL = false, sawDiveL = false, sawEmergeL = false, nanL = false;
    let minZL = Infinity, flownL = 0, lxL = sl.x, lzL = sl.z;
    // The floor regression: inside a spot the nearest() distance is signed
    // (negative), so an unclamped rock blend would dive the body THROUGH the
    // rock and under the sea exactly when it is ashore. The walkable tops sit
    // at 0.5–1.1, so anything below 0.4 inside a spot is the blend diving.
    let minRockYL = Infinity;
    for (let k = 0; k < 30 * 75; k++) {
      t += 1 / 30; W.update(1 / 30, t, P, V);
      statesL.add(sl.state);
      if (sl.state === S.HIDDEN) sawDiveL = true;
      if (sl.state === S.EMERGE) sawEmergeL = true;
      if (sl.z < -40) sawWaterL = true;   // off the rocks, out at sea
      if (terrain.hauloutSpots.some(s => Math.hypot(s.x - sl.x, s.z - sl.z) - s.r < 0.3)) sawRockL = true;
      if (terrain.hauloutSpots.some(s => Math.hypot(s.x - sl.x, s.z - sl.z) - s.r < 0))
        minRockYL = Math.min(minRockYL, sl.y);
      minZL = Math.min(minZL, sl.z);
      flownL += Math.hypot(sl.x - lxL, sl.z - lzL); lxL = sl.x; lzL = sl.z;
      if (!Number.isFinite(sl.x + sl.y + sl.z)) { nanL = true; break; }
    }
    check(sawRockL && sawWaterL, 'it mixes rock and water');
    check(sawDiveL, 'it dives (HIDDEN under the swell)');
    check(sawEmergeL, 'it surfaces again (EMERGE)');
    check(flownL > 10, `it covers ground (${flownL.toFixed(1)} m in 75 s)`);
    check(minZL > -70, `it stays inside its water (${minZL.toFixed(1)} m out at most)`);
    check(!nanL, 'no NaN positions');
    check(minRockYL > 0.4,
      `it holds the rock's top while ashore (${minRockYL === Infinity ? 'never ashore' : minRockYL.toFixed(2)} at worst)`);

    // The sea lion shader compiles.
    const errorsL = [];
    const origErrorL = console.error;
    console.error = (...args) => { errorsL.push(args.join(' ')); origErrorL(...args); };
    const rendererL = new THREE.WebGLRenderer({ canvas: document.createElement('canvas') });
    rendererL.setSize(64, 64);
    const camL = new THREE.PerspectiveCamera(50, 1, 0.05, 100);
    camL.position.set(sl.x, sl.y + 1.2, sl.z + 2); camL.lookAt(sl.x, sl.y, sl.z);
    const sL = new THREE.Scene();
    sL.add(new THREE.AmbientLight(0xffffff, 1));
    sL.add(W.group);
    rendererL.compile(sL, camL);
    rendererL.render(sL, camL);
    console.error = origErrorL;
    const progsL = rendererL.info.programs.map(p => p.cacheKey);
    check(errorsL.length === 0 && progsL.some(k => k.includes('wildlife:seaLion')),
      'the sea lion shader compiles' + (errorsL.length ? ': ' + errorsL[0].slice(0, 300) : ''));
    rendererL.dispose();

    // The frame cost with the colony awake (the player on the beach).
    P.set(0, 0, -8);
    const tL1 = performance.now();
    for (let k = 0; k < 300; k++) { t += 1 / 30; W.update(1 / 30, t, P, V); }
    const msL = (performance.now() - tL1) / 300;
    check(msL < 0.5, `update costs ${msL.toFixed(3)} ms/frame with the colony awake`);
  }
}

// --- Sanderlings ----------------------------------------------------------------
// The swash's flock: on the wet sand by the water, working the strip just
// above the waterline — down and up with it — and never long under it.
{
  const W = createJungleWildlife({ scene: new THREE.Scene(), terrain, vegetation: veg });
  const LS = jungleWildlifeLayout({ terrain, vegetation: veg });
  const sd = W.debug.species.sandpiper, ag = sd.agents;
  check(ag.length === 9, `9 sanderlings placed (${ag.length})`);
  check(ag.every(a => { const d = LS.shoreDistance(a.home.x, a.home.z); return d >= -0.5 && d <= 5; }),
    'every sanderling lives in the swash zone');
  const P = new THREE.Vector3(ag[0].home.x + 14, 0, ag[0].home.z + 6), V = new THREE.Vector3();
  let t = 0, inBand = 0, under = 0, n = 0, path = 0;
  const last = ag.map(a => [a.x, a.z]);
  for (let k = 0; k < 30 * 40; k++) {
    t += 1 / 30; W.update(1 / 30, t, P, V);
    ag.forEach((a, i) => {
      if (!a.awake) return;
      const d = a.z - LS.waterlineZ(a.x);
      n++; if (d > -0.3 && d < 2.6) inBand++; if (d < -0.3) under++;
      path += Math.hypot(a.x - last[i][0], a.z - last[i][1]); last[i] = [a.x, a.z];
    });
  }
  check(n > 0 && inBand / n > 0.85, `they work the strip by the water (${(100 * inBand / n).toFixed(0)}% of the time within 2.6 m of it)`);
  check(under / n < 0.02, `and never stand in the sea (${(100 * under / n).toFixed(1)}% under)`);
  check(path / ag.length > 8, `busy: ${(path / ag.length).toFixed(1)} m each in 40 s`);
}

// --- Monarchs ---------------------------------------------------------------
{
  const W = createJungleWildlife({ scene: new THREE.Scene(), terrain, vegetation: veg });
  const LB = jungleWildlifeLayout({ terrain, vegetation: veg });
  const ag = W.debug.species.butterfly.agents;
  check(ag.length === 10, `10 monarchs placed (${ag.length})`);
  check(ag.every(a => LB.distances.flowers(a.home.x, a.home.z) <= 5), 'every monarch lives within 5 m of a flower tuft');
  const P = new THREE.Vector3(ag[0].home.x + 8, 0, ag[0].home.z), V = new THREE.Vector3();
  let t = 0, low = 0, n = 0, atBloom = 0;
  for (let k = 0; k < 30 * 30; k++) {
    t += 1 / 30; W.update(1 / 30, t, P, V);
    for (const a of ag) {
      if (!a.awake) continue;
      n++;
      if (a.y < terrainHeight(a.x, a.z) + 0.03) low++;
      if (a.flyPhase === 0 && LB.distances.flowers(a.x, a.z) < 0.8) atBloom++;
    }
  }
  check(n > 0 && low === 0, `they fly over the ground, never through it (${low} frames low)`);
  check(atBloom / n > 0.2, `and sip at the blooms (${(100 * atBloom / n).toFixed(0)}% of the time hovering at one)`);
}

// --- Scrub-jays --------------------------------------------------------------
// By the bushes; approached, a bound for cover and gone into it (HIDDEN),
// back out once the player has passed.
{
  const W = createJungleWildlife({ scene: new THREE.Scene(), terrain, vegetation: veg });
  const LJ = jungleWildlifeLayout({ terrain, vegetation: veg });
  const S = W.STATE, ag = W.debug.species.jay.agents;
  check(ag.length === 5, `5 scrub-jays placed (${ag.length})`);
  check(ag.every(a => LJ.distances.bushes(a.home.x, a.home.z) <= 4), 'every jay lives within 4 m of a bush');
  const a = ag[0], P = new THREE.Vector3(a.x + 12, 0, a.z), V = new THREE.Vector3();
  let t = 0;
  for (let k = 0; k < 30 * 4; k++) { t += 1 / 30; W.update(1 / 30, t, P, V); }
  P.set(a.x + 2.5, 0, a.z);
  const seen = new Set();
  for (let k = 0; k < 30 * 6; k++) { t += 1 / 30; W.update(1 / 30, t, P, V); seen.add(a.state); }
  check(seen.has(S.FLEE) && seen.has(S.HIDDEN), 'an approached jay bounds off and ducks into cover (FLEE, HIDDEN)');
  check(LJ.distances.bushes(a.x, a.z) < 0.5, `into a bush (${LJ.distances.bushes(a.x, a.z).toFixed(2)} m from its edge)`);
  P.set(a.x + 20, 0, a.z);
  const back = new Set();
  for (let k = 0; k < 30 * 16; k++) { t += 1 / 30; W.update(1 / 30, t, P, V); back.add(a.state); }
  check(back.has(S.EMERGE) && a.sink === 0, 'and hops back out once you have gone');
}

// --- Gulls and ravens -----------------------------------------------------------
// Two glide species from one module: gulls low over the shore, the raven
// pair higher over the cliff.
{
  const W = createJungleWildlife({ scene: new THREE.Scene(), terrain, vegetation: veg });
  const LG = jungleWildlifeLayout({ terrain, vegetation: veg });
  const gulls = W.debug.species.gull.agents, ravens = W.debug.species.raven.agents;
  check(gulls.length === 4 && ravens.length === 2, `4 gulls and 2 ravens placed (${gulls.length}, ${ravens.length})`);
  const P = new THREE.Vector3(0, 0, 0), V = new THREE.Vector3();
  let t = 0, gAlt = [], rAlt = [], gShore = 0, n = 0;
  for (let k = 0; k < 30 * 40; k++) {
    t += 1 / 30; W.update(1 / 30, t, P, V);
    for (const a of gulls) {
      const w = LG.waterAt(a.x, a.z);
      gAlt.push(a.y - (w ? w.y : terrainHeight(a.x, a.z)));
      n++; if (Math.abs(LG.shoreDistance(a.x, a.z)) < 40) gShore++;
    }
    for (const a of ravens) rAlt.push(a.y - terrainHeight(a.x, a.z));
  }
  const mean = v => v.reduce((s, x) => s + x, 0) / v.length;
  check(mean(gAlt) > 4 && mean(gAlt) < 12 && Math.min(...gAlt) > 2,
    `gulls fly low (${mean(gAlt).toFixed(1)} m mean, ${Math.min(...gAlt).toFixed(1)} m lowest)`);
  check(gShore / n > 0.9, `gulls keep to the shore (${(100 * gShore / n).toFixed(0)}% within 40 m of it)`);
  check(mean(rAlt) > 8 && Math.min(...rAlt) > 3, `ravens ride higher (${mean(rAlt).toFixed(1)} m mean above the ground)`);
}

// --- Dolphins -------------------------------------------------------------------
// The pod: over the open sea, beyond the haul-outs; each leaps clear in
// its own rhythm, nose up out of the water and down into it.
{
  const W = createJungleWildlife({ scene: new THREE.Scene(), terrain, vegetation: veg });
  const LD = jungleWildlifeLayout({ terrain, vegetation: veg });
  const ag = W.debug.species.dolphin.agents;
  check(ag.length === 5, `5 dolphins placed (${ag.length})`);
  const P = new THREE.Vector3(0, 0, -20), V = new THREE.Vector3();
  let t = 0, n = 0, out = 0, sea = 0, inshore = 0, up = 0, down = 0, spread = 0;
  for (let k = 0; k < 30 * 30; k++) {
    t += 1 / 30; W.update(1 / 30, t, P, V);
    for (const a of ag) {
      n++;
      const w = LD.waterAt(a.x, a.z);
      if (w && w.kind === 'sea') sea++;
      if (w && a.y > w.y + 0.2) out++;
      if (a.z > -72) inshore++;
      if (a.pitch > 0.3) up++; if (a.pitch < -0.3) down++;
    }
    const cx = ag.reduce((s, a) => s + a.x, 0) / 5, cz = ag.reduce((s, a) => s + a.z, 0) / 5;
    spread = Math.max(spread, ...ag.map(a => Math.hypot(a.x - cx, a.z - cz)));
  }
  check(sea === n && inshore === 0, `always over the open sea, beyond the haul-outs (${inshore} frames inshore)`);
  check(out / n > 0.08 && out / n < 0.4, `each breaks the surface in turn (${(100 * out / n).toFixed(0)}% of the time clear of it)`);
  check(up > 0 && down > 0, 'nose up out of the water, nose down into it');
  check(spread < 12, `the pod swims together (${spread.toFixed(1)} m from its centre at most)`);
}

// --- A village that is not the cove -------------------------------------------
// The engine and the species are map-agnostic: a made-up village — flat
// ground, a street, four houses (their walls as obstacles, their floors
// kept off by keepOffBuilt), planters, hedges, a few stones, no sea — runs
// the land species unchanged, leaves the sea's off with a warning instead
// of throwing, and its walkers frighten animals as the player does.
{
  const HOUSES = [[-12, -10], [12, -10], [-12, 10], [12, 10]].map(([x, z]) => ({ x, z, hw: 4, hd: 3 }));
  const inHouse = (x, z, m = 0) => HOUSES.some(h => Math.abs(x - h.x) < h.hw + m && Math.abs(z - h.z) < h.hd + m);
  const walls = [];
  for (const h of HOUSES) {
    for (let u = -h.hw; u <= h.hw; u += 0.9) { walls.push({ x: h.x + u, z: h.z - h.hd, r: 0.5 }, { x: h.x + u, z: h.z + h.hd, r: 0.5 }); }
    for (let v = -h.hd; v <= h.hd; v += 0.9) { walls.push({ x: h.x - h.hw, z: h.z + v, r: 0.5 }, { x: h.x + h.hw, z: h.z + v, r: 0.5 }); }
  }
  const pts = (n, f) => Array.from({ length: n }, (_, i) => f(i));
  const flowers = spotIndex(pts(24, i => ({ x: -24 + (i % 12) * 4.2, z: i < 12 ? -2.6 : 2.6, r: 0.3 })), 4);
  const bushes = spotIndex(pts(16, i => ({ x: -26 + i * 3.5, z: i % 2 ? 19 : -19, r: 0.8 })), 6);
  const stones = spotIndex(pts(8, i => ({ x: -21 + i * 6, z: i % 2 ? 24 : -24, r: 0.4 })), 8);
  const village = {
    terrainHeight: () => 2, terrainSlope: () => 0, terrainNormal: () => ({ x: 0, y: 1, z: 0 }),
    SOIL: { DIRT: 0, FOREST: 1 }, soilAt: (x, z) => (Math.abs(z) > 16 ? 1 : 0),
    bounds: { x: [-28, 28], z: [-28, 28] },
    keepOffBuilt: (x, z) => !inHouse(x, z, 0.8),
    distances: {
      path: (x, z) => Math.abs(z) - 1.5,
      flowers: (x, z) => flowers.nearest(x, z, 12).d,
      bushes: (x, z) => bushes.nearest(x, z, 12).d,
      rocks: (x, z) => stones.nearest(x, z, 16).d,
    },
    spots: { flowers, bushes, rocks: stones },
    obstacles: spotIndex(walls, 8),
  };
  const warn = console.warn; let warned = 0; console.warn = () => { warned++; };
  let V9 = null;
  try {
    V9 = createWildlife({ scene: new THREE.Scene(), layout: village, seed: 'village', species: [
      { def: CRAB }, { def: PELICAN }, { def: SANDPIPER }, { def: FROG }, { def: GULL },
      { def: FOX, count: 2 }, { def: LIZARD, count: 4 }, { def: JAY, count: 3 },
      { def: BUTTERFLY, count: 6 }, { def: HUMMINGBIRD, count: 3 },
    ] });
  } catch (e) { check(false, 'the village builds: ' + e.message); }
  console.warn = warn;
  if (V9) {
    check(true, 'the village builds');
    const off = Object.keys(V9.skipped).sort().join(',');
    check(off === 'crab,frog,gull,pelican,sandpiper' && warned === 5,
      `the sea's species are left off with a warning (${off})`);
    const land = ['fox', 'lizard', 'jay', 'butterfly', 'hummingbird'];
    check(land.every(id => V9.counts[id] > 0), `the land species live there (${land.map(id => id + ' ' + V9.counts[id]).join(', ')})`);
    // The player well clear of it (but near enough to keep it awake); a
    // walker comes down the street past a lizard.
    const liz = V9.debug.species.lizard.agents[0];
    const P = new THREE.Vector3(liz.x, 0, liz.z + (liz.z > 0 ? -14 : 14)), V = new THREE.Vector3();
    const walker = { x: liz.x - 8, z: liz.z, speed: 1.3 };
    let t = 0, inside = 0, nan = false; const seen = new Set();
    for (let k = 0; k < 30 * 30; k++) {
      t += 1 / 30;
      walker.x = Math.min(liz.home.x + 6, walker.x + 1.3 / 30);
      V9.update(1 / 30, t, P, V, [walker]);
      seen.add(liz.state);
      for (const sp of Object.values(V9.debug.species)) for (const a of sp.agents) {
        if (!Number.isFinite(a.x + a.y + a.z)) nan = true;
        if (sp.motion.walks && inHouse(a.x, a.z)) inside++;
      }
    }
    check(!nan, 'no NaN in the village');
    check(inside === 0, `no animal ever inside a house (${inside} frames)`);
    check(seen.has(V9.STATE.FLEE), 'a walker frightens a lizard as the player would');
  }
}

// --- Roster-wide invariants -------------------------------------------------
// Held for EVERY species on the roster, the ones to come included: walk a
// player in circles round one of its homes (close enough to scare it, far
// enough to let it settle) and watch every drawn individual frame to frame.
{
  const W = createJungleWildlife({ scene: new THREE.Scene(), terrain, vegetation: veg });
  const LO = jungleWildlifeLayout({ terrain, vegetation: veg });
  const P = new THREE.Vector3(), V = new THREE.Vector3();
  const inside = (a) => LO.obstacles.nearest(a.x, a.z, 0).d < 0;
  check(LO.obstacles.spots.length > 300, `the layout lists the cove's obstacles (${LO.obstacles.spots.length} rocks and trunks)`);
  for (const sp of Object.values(W.debug.species)) {
    const id = sp.def.id, ag = sp.agents;
    if (!ag.length) { check(false, `${id}: no homes found`); continue; }
    const walks = !!sp.motion.walks;
    let calm = 0, calmIn = 0;
    if (walks) check(ag.every(a => LO.obstacles.nearest(a.home.x, a.home.z, 0).d >= 0),
      `${id}: no home inside a rock or a trunk`);
    const h = ag[0].home;
    // The fastest a body may honestly cover in a frame: its flight, with
    // room for a boids burst or a zigzag swing, at 30 fps.
    const lim = (Math.max(sp.def.speed.flee, sp.def.speed.walk) * 1.5 + 2) / 30 + 0.15;
    let t = 0, worst = 0, nan = false, why = '';
    const last = new Map();
    for (let k = 0; k < 30 * 40; k++) {
      t += 1 / 30;
      const th = t * 0.2;
      P.set(h.x + Math.sin(th) * 6, 0, h.z + Math.cos(th) * 6);
      V.set(Math.cos(th) * 1.2, 0, -Math.sin(th) * 1.2);
      W.update(1 / 30, t, P, V);
      for (const a of ag) {
        if (!Number.isFinite(a.x + a.y + a.z)) nan = true;
        if (walks && a.awake && (a.state === W.STATE.IDLE || a.state === W.STATE.MOVE)) { calm++; if (inside(a)) calmIn++; }
        const drawn = a.awake && a.sink < 1;
        const l = last.get(a.i);
        if (drawn && l) {
          // Past the near tier a non-smooth body moves four frames at once.
          const tier = !sp.motion.smooth && a.dist > 25 ? 4 : 1;
          const d = Math.hypot(a.x - l[0], a.y - l[1], a.z - l[2]) / tier;
          if (d > worst) { worst = d; why = `#${a.i} frame ${k} ${W.STATE_NAME[l[3]]}→${W.STATE_NAME[a.state]}, ${a.dist.toFixed(1)} m off`; }
        }
        if (drawn) last.set(a.i, [a.x, a.y, a.z, a.state]); else last.delete(a.i);
      }
    }
    check(!nan, `${id}: no NaN in 40 s round a home`);
    if (walks) check(calmIn === 0, `${id}: never walks through a rock or a trunk (${calmIn} / ${calm} calm frames inside)`);
    check(worst <= lim, `${id}: no jump — at most ${worst.toFixed(2)} m in a frame (limit ${lim.toFixed(2)})${worst > lim ? ': ' + why : ''}`);

    // Seen from afar (most of its activeRadius away): a group wakes and
    // sleeps whole, and a smooth motion moves every frame — no 15 Hz judder.
    const M = sp.motion, far = sp.def.activeRadius * 0.85;
    if (M.group || M.smooth) {
      let split = 0, still = 0, seen = 0;
      const prev = new Map();
      // From where the animals are now (a school drifts off its homes).
      const cx = ag.reduce((s, a) => s + a.x, 0) / ag.length, cz = ag.reduce((s, a) => s + a.z, 0) / ag.length;
      for (let k = 0; k < 30 * 12; k++) {
        t += 1 / 30;
        P.set(cx + far, 0, cz); V.set(0, 0, 0);
        W.update(1 / 30, t, P, V);
        const awake = ag.filter(a => a.awake).length;
        if (M.group && awake !== 0 && awake !== ag.length) split++;
        for (const a of ag) {
          const l = prev.get(a.i);
          if (a.awake && a.sink < 1 && l) { seen++; if (l[0] === a.x && l[1] === a.y && l[2] === a.z) still++; }
          prev.set(a.i, [a.x, a.y, a.z]);
        }
      }
      if (M.group) check(split === 0, `${id}: the group wakes and sleeps whole (${split} split frames at ${far.toFixed(0)} m)`);
      if (M.smooth) check(seen > 0 && still / seen < 0.05,
        `${id}: moves every frame from ${far.toFixed(0)} m (${seen ? (100 * still / seen).toFixed(0) : '–'}% still frames)`);
    }
  }
}

console.log(failed ? `\n${failed} FAILED` : '\nall passed');
globalThis.__jungleWildlifeFailed = failed;
