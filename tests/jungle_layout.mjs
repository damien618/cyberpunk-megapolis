// Numeric checks on jungleLayout.js — run with `node tests/jungle_layout.mjs`,
// or in a browser (tests/jungle_layout.py imports it through the dev server).
// These are the contracts the rest of the map leans on; each failure here is
// a bug you would otherwise only find by walking into it.
import {
  terrainHeight, shoreAt, pathDistance, PATH, PATH_LEN, PATH_HALF_W, POOL, FALLS,
  JETTY, WADE_Z, SEA_Y, SAND_END, cliffZ, CLIFF_FOOT, streamX, streamWaterY,
  STREAM_Z0, STREAM_HALF_W, boundaryWalls, SPAWN, TENDER_SPOT, PLAY_HALF_W, forestDensity,
} from '../jungleLayout.js';

let failed = 0;
function check(name, ok, detail = '') {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`);
  if (!ok) failed++;
}

// 1. The path: walkable slope, dry, and clear of the stream.
{
  let maxSlope = 0, maxStep = 0, minAbove = Infinity, minToStream = Infinity;
  for (let i = 1; i < PATH.length; i++) {
    const [x0, z0] = PATH[i - 1], [x1, z1] = PATH[i];
    const run = Math.hypot(x1 - x0, z1 - z0);
    const rise = Math.abs(terrainHeight(x1, z1) - terrainHeight(x0, z0));
    maxSlope = Math.max(maxSlope, rise / run);
    maxStep = Math.max(maxStep, rise);
    if (z1 > shoreAt(x1) + 2) minAbove = Math.min(minAbove, terrainHeight(x1, z1) - SEA_Y);
    if (z1 < STREAM_Z0) minToStream = Math.min(minToStream, Math.abs(x1 - streamX(z1)));
  }
  check('path slope ≤ 12 %', maxSlope <= 0.12, `${(maxSlope * 100).toFixed(1)} %`);
  check('path is dry', minAbove > 0.15, `${minAbove.toFixed(2)} m above sea`);
  check('path clear of stream', minToStream > PATH_HALF_W + STREAM_HALF_W + 3,
    `${minToStream.toFixed(1)} m`);
  check('path length ~150–220 m', PATH_LEN.at(-1) > 150 && PATH_LEN.at(-1) < 220,
    `${PATH_LEN.at(-1).toFixed(0)} m`);
  // Cross-slope: the path must not tilt sideways.
  let maxCross = 0;
  for (let i = 1; i < PATH.length - 1; i++) {
    const [x, z] = PATH[i];
    const dx = PATH[i + 1][0] - PATH[i - 1][0], dz = PATH[i + 1][1] - PATH[i - 1][1];
    const l = Math.hypot(dx, dz), nx = -dz / l * PATH_HALF_W, nz = dx / l * PATH_HALF_W;
    const c = Math.abs(terrainHeight(x + nx, z + nz) - terrainHeight(x - nx, z - nz)) / (2 * PATH_HALF_W);
    maxCross = Math.max(maxCross, c);
  }
  check('path cross-slope ≤ 10 %', maxCross <= 0.10, `${(maxCross * 100).toFixed(1)} %`);
}

// 2. The pool holds water: rim above the surface all round, floor below it.
{
  let minRim = Infinity;
  for (let a = 0; a < Math.PI * 2; a += 0.1) {
    const x = POOL.x + Math.cos(a) * (POOL.r + 1.5), z = POOL.z + Math.sin(a) * (POOL.r + 1.5);
    if (Math.abs(x - streamX(z)) < STREAM_HALF_W + 3 && z < STREAM_Z0 + 3) continue;  // the outlet
    minRim = Math.min(minRim, terrainHeight(x, z));
  }
  const floor = terrainHeight(POOL.x, POOL.z);
  check('pool rim above water', minRim > POOL.waterY + 0.1, `rim ${minRim.toFixed(2)} vs ${POOL.waterY}`);
  check('pool is wadeable (0.5–1.2 m)', POOL.waterY - floor > 0.5 && POOL.waterY - floor < 1.2,
    `${(POOL.waterY - floor).toFixed(2)} m`);
}

// 3. The falls: lip on the plateau, landing inside the pool.
{
  const lipGround = terrainHeight(FALLS.x, FALLS.z);
  check('falls lip sits on the plateau', Math.abs(lipGround - FALLS.topY) < 1.5,
    `ground ${lipGround.toFixed(1)} vs lip ${FALLS.topY}`);
  const drop = FALLS.topY - POOL.waterY;
  check('falls drop 15–25 m', drop > 15 && drop < 25, `${drop.toFixed(1)} m`);
  const land = cliffZ(FALLS.x) - CLIFF_FOOT;
  check('cliff foot is inside the pool', Math.hypot(FALLS.x - POOL.x, land - POOL.z) < POOL.r,
    `foot at z=${land.toFixed(1)}`);
}

// 4. The jetty: first step up from the sand under STEP_H, deck above water.
{
  const rootSand = terrainHeight(JETTY.x, JETTY.z0);
  check('jetty root step ≤ 0.5 m', JETTY.deckY - rootSand <= 0.5 && JETTY.deckY >= rootSand,
    `${(JETTY.deckY - rootSand).toFixed(2)} m`);
  check('jetty head over water', terrainHeight(JETTY.x, JETTY.z1) < SEA_Y - 0.3,
    `bed ${terrainHeight(JETTY.x, JETTY.z1).toFixed(2)}`);
  check('jetty ends before the wade barrier', JETTY.z1 > WADE_Z + 1);
}

// 5. The wade barrier stands in wadeable water right across the cove.
{
  let lo = Infinity, hi = -Infinity;
  for (let x = -PLAY_HALF_W + 16; x <= PLAY_HALF_W - 16; x += 4) {
    const d = SEA_Y - terrainHeight(x, WADE_Z);
    lo = Math.min(lo, d); hi = Math.max(hi, d);
  }
  check('water at the barrier 0.5–1.4 m', lo > 0.5 && hi < 1.4, `${lo.toFixed(2)}–${hi.toFixed(2)} m`);
}

// 6. The stream runs downhill and leaves the pool at its level.
{
  let rises = 0;
  for (let z = STREAM_Z0; z > shoreAt(streamX(z)); z -= 1)
    if (streamWaterY(z - 1) > streamWaterY(z) + 0.02) rises++;
  check('stream never runs uphill', rises === 0, `${rises} rises`);
}

// 7. Collision walls respect cityBoxes' 80 m rule.
{
  const long = boundaryWalls().filter(w => Math.max(w.x1 - w.x0, w.z1 - w.z0) > 80);
  check('no wall longer than 80 m', long.length === 0, `${long.length} too long`);
}

// 8. Arrivals are on dry ground, and the spawn is not in the trees.
for (const [name, s] of [['spawn', SPAWN], ['tender spot', TENDER_SPOT]]) {
  const onJetty = Math.abs(s.x - JETTY.x) < JETTY.halfW && s.z < JETTY.z0 && s.z > JETTY.z1;
  const y = onJetty ? JETTY.deckY : terrainHeight(s.x, s.z);
  check(`${name} is dry`, y > SEA_Y + 0.1, `${y.toFixed(2)} m`);
}
check('spawn is in the open', forestDensity(SPAWN.x, SPAWN.z) < 0.05);
check('forest is dense mid-map', forestDensity(-40, 80) > 0.9);

// 9. Beach profile sanity.
check('sand top meets forest', Math.abs(terrainHeight(0, SAND_END) - terrainHeight(0, SAND_END + 0.5)) < 0.2);

console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed');
globalThis.__jungleLayoutFailed = failed;
if (failed && typeof process !== 'undefined') process.exit(1);
