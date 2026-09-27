// Numeric checks on the ocean's pure maths — open in a browser served by
// serve.py (no Node on this machine): tests/jungle_ocean.py runs it in
// headless Chromium, the same way tests/jungle_layout.py does. These are the
// contracts the sea and anything that floats on it lean on: the wave table
// stays bounded and continuous, the swell dies where the water is too thin,
// the shader twins stay in lockstep with the JS they were generated from,
// and the wet band keeps covering the swash's biggest run.
//
// Only THREE-free modules are imported, so the numbers also run under plain
// node if one ever turns up: `node tests/jungle_ocean.mjs`.
import {
  OCEAN_PRESET, resolvePreset, resolveWaves, seaScaleAt, swellHeightAt, waterHeightAt, gerstnerGLSL,
} from '../oceanSurface.js';
import { terrainHeight, shoreAt, terrainMasks, SEA_Y, SEA_BED_GLSL, WADE_Z } from '../jungleLayout.js';

let failed = 0;
function check(name, ok, detail = '') {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`);
  if (!ok) failed++;
}
const fmt = v => (typeof v === 'number' ? v.toFixed(3) : v);

// 1. The wave table: a lagoon's sea, bounded and continuous.
{
  const P = OCEAN_PRESET;
  const ampSum = P.waves.reduce((s, w) => s + w.amp * P.waveScale, 0);
  let worst = 0, worstStep = 0;
  for (let x = -200; x <= 200; x += 37) {
    for (let z = -400; z <= -10; z += 41) {
      for (let t = 0; t < 60; t += 1.7) {
        const h = swellHeightAt(x, z, t, P, 1);
        worst = Math.max(worst, Math.abs(h));
        const h2 = swellHeightAt(x, z, t + 1 / 60, P, 1);
        worstStep = Math.max(worstStep, Math.abs(h2 - h));
      }
    }
  }
  // Slope bound: each sine rises at most amp·omega per second.
  const slope = resolveWaves(P).reduce((s, w) => s + w.amp * P.waveScale * w.omega, 0);
  check('swell is a lagoon (≤ 0.8 m)', ampSum <= 0.8, `${ampSum.toFixed(2)} m crest sum`);
  check('swell bounded', worst <= ampSum * 1.001, `max |h| ${worst.toFixed(3)} vs ${ampSum.toFixed(3)}`);
  check('swell continuous', worstStep <= slope / 60 * 1.01 + 1e-9, `max step ${worstStep.toFixed(4)}`);
}

// 2. Shoaling: full swell offshore, a little more on the shallows, gone
// where the water is too thin to carry a wave.
{
  const P = OCEAN_PRESET;
  check('full swell offshore', Math.abs(seaScaleAt(P.deepRef + 4, P) - 1) < 1e-9,
    fmt(seaScaleAt(P.deepRef + 4, P)));
  check('shoal peak near breaking', seaScaleAt(P.breakDepth, P) <= P.shoalPeak + 1e-9
    && seaScaleAt(P.breakDepth, P) > 1, fmt(seaScaleAt(P.breakDepth, P)));
  check('swell gone in thin water', seaScaleAt(0, P) === 0 && seaScaleAt(P.dieDepth, P) === 0,
    `${fmt(seaScaleAt(0, P))}, ${fmt(seaScaleAt(P.dieDepth, P))}`);
  let mono = true;
  for (let d = 0.01; d < P.breakDepth; d += 0.05) mono &&= seaScaleAt(d, P) >= seaScaleAt(d - 0.01, P) - 1e-12;
  check('rising toward breaking is monotone', mono);
}

// 3. waterHeightAt: flat on the dry sand, riding a modest swell at the wade
// barrier, bounded offshore.
{
  const P = OCEAN_PRESET;
  const depthAt = (x, z) => SEA_Y - terrainHeight(x, z);
  const at = (x, z, t) => waterHeightAt(x, z, t, { seaY: SEA_Y, depthAt, preset: P });
  let dryOK = true;
  for (let x = -60; x <= 60; x += 11) {
    const z = shoreAt(x) + 3;                 // dry sand, inland of the runup
    for (let t = 0; t < 30; t += 1.3) dryOK &&= at(x, z, t) === SEA_Y;
  }
  check('surface is flat on the dry sand', dryOK);
  let barrierMax = 0;
  for (let x = -64; x <= 64; x += 8)
    for (let t = 0; t < 40; t += 0.9)
      barrierMax = Math.max(barrierMax, Math.abs(at(x, WADE_Z, t) - SEA_Y));
  check('wadeable swell at the barrier (≤ 0.35 m)', barrierMax <= 0.35,
    `${barrierMax.toFixed(3)} m`);
  let offshoreMax = 0;
  for (let x = -150; x <= 150; x += 25)
    for (let t = 0; t < 40; t += 1.1)
      offshoreMax = Math.max(offshoreMax, Math.abs(at(x, -160, t) - SEA_Y));
  const ampSum = P.waves.reduce((s, w) => s + w.amp, 0) * P.waveScale * P.shoalPeak;
  check('offshore swell bounded', offshoreMax <= ampSum * 1.001, `${offshoreMax.toFixed(3)} m`);
}

// 4. The shader twins stay in lockstep with the numbers they were baked
// from — the sea you see and the sea you feel cannot drift apart.
{
  const glsl = gerstnerGLSL(OCEAN_PRESET);
  check('gerstner GLSL reads the wave scale', glsl.includes('uWaveScale'));
  let sync = true, miss = '';
  for (const [i, w] of resolveWaves(OCEAN_PRESET).entries()) {
    for (const v of [w.k, w.omega]) {
      if (!glsl.includes(v.toFixed(6))) { sync = false; miss = `wave ${i} lost ${v.toFixed(6)}`; }
    }
  }
  check('gerstner GLSL carries every wave constant', sync, miss);

  check('bed GLSL carries the layout constants',
    SEA_BED_GLSL.includes('-22.0')        // SHORE_Z
    && SEA_BED_GLSL.includes('0.034') && SEA_BED_GLSL.includes('0.0011875')
    && SEA_BED_GLSL.includes('60.0') && SEA_BED_GLSL.includes('0.12')
    && SEA_BED_GLSL.includes('shoreDist') && SEA_BED_GLSL.includes('bedHeight'));
  // The JS side of that twin: the sea-bed branch of terrainHeight is still
  // the formula the GLSL bakes. If this fails, update SEA_BED_GLSL too.
  const bedRef = (x, z) => {
    const d = shoreAt(x) - z;
    let y = SEA_Y - (d * 0.034 + (d / 40) ** 2 * 1.9);
    if (d > 60) y -= (d - 60) * 0.12;
    return y;
  };
  let drift = 0;
  for (let x = -60; x <= 60; x += 7)
    for (let d = 9; d <= 95; d += 6)
      drift = Math.max(drift, Math.abs(bedRef(x, shoreAt(x) - d) - terrainHeight(x, shoreAt(x) - d)));
  check('sea-bed formula unchanged (GLSL twin valid)', drift < 1e-9, `drift ${drift.toExponential(1)}`);

  // Depth sign: water where it should be, land where it should be.
  let sign = true;
  for (let x = -60; x <= 60; x += 11) {
    sign &&= SEA_Y - terrainHeight(x, shoreAt(x) - 12) > 0.4;   // ~0.58 m at this run
    sign &&= SEA_Y - terrainHeight(x, shoreAt(x) + 4) < 0;      // swash shelf is above the sea
  }
  check('depth is positive offshore, negative on the beach', sign);
}

// 5. The wet band covers the swash's biggest run and dries past it.
{
  const P = OCEAN_PRESET;
  const top = P.swash.base + P.swash.reachMax;
  check('wet band covers the biggest swash run', top <= 7,
    `edge reaches ${top.toFixed(1)} m inland`);
  const wet = d => terrainMasks(10, shoreAt(10) + d).wet;
  check('sand saturated at the waterline', wet(0.8) >= 0.99, fmt(wet(0.8)));
  check('sand still wet under the common runup', wet(4.5) >= 0.25, fmt(wet(4.5)));
  check('sand dries past the band', wet(9) < 0.1, fmt(wet(9)));
}

// 6. A per-map preset really re-tunes the sea (the village maps' hook).
{
  const P = resolvePreset({ waveScale: 0.4, colors: { shallow: 0x88ffcc } });
  check('preset overrides ride on the defaults',
    P.waveScale === 0.4 && P.colors.shallow === 0x88ffcc && P.colors.deep === OCEAN_PRESET.colors.deep
    && P.swash.period === OCEAN_PRESET.swash.period && P.waves === OCEAN_PRESET.waves);
  let smaller = true;
  for (let t = 0; t < 20; t += 0.7)
    smaller &&= Math.abs(swellHeightAt(30, -120, t, P, 1)) <= OCEAN_PRESET.waveScale * 0.41;
  check('calmer sea with a smaller waveScale', smaller);
}

console.log(failed ? `${failed} check(s) failed` : 'all checks passed');
globalThis.__jungleOceanFailed = failed;

