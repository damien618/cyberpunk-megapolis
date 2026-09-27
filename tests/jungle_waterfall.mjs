// tests/jungle_waterfall.mjs — assertions for the waterfall module, run
// under plain Chromium by tests/jungle_waterfall.py (no Node on this
// machine): python3 serve.py 8000 & then .venv/bin/python tests/jungle_waterfall.py
//
// Builds the whole module against a throwaway scene and holds it to the
// layout: the sheet must fall clear of the ground AND of the rocks the
// terrain stacks on the cliff (the bug that hid it once), the crest
// feed must ride the notch's bed, the pool's GLSL twin must carry the
// layout's bowl numbers, and the preset must actually reach the uniforms.
import * as THREE from 'three';
import { createJungleWaterfall, CASCADE_PRESET } from '/jungleWaterfall.js';
import { FALLS, POOL, terrainHeight, STREAM_Z0, streamX, streamWaterY } from '/jungleLayout.js';
import { buildJungleTerrain } from '/jungleTerrain.js';

let failed = 0;
const check = (ok, msg) => { console.log((ok ? '  ok ' : 'FAIL ') + msg); if (!ok) failed++; };

const scene = new THREE.Scene();
const waterNormal = new THREE.DataTexture(
  new Uint8Array([128, 128, 255, 255]), 1, 1);
waterNormal.needsUpdate = true;

let falls = null;
try {
  falls = createJungleWaterfall({ scene, waterNormal });
  check(true, 'module builds');
} catch (e) {
  check(false, 'module builds: ' + e);
}

if (falls) {
  // Shape: every part present and on the scene (the capture tooling asks
  // for them by name).
  for (const key of ['crest', 'falls', 'pool', 'foam', 'splash', 'mist',
    'stream', 'impact', 'audioAnchor', 'spec', 'preset']) {
    check(falls[key] !== undefined, 'exposes ' + key);
  }
  check(scene.children.includes(falls.falls)
    && scene.children.includes(falls.crest)
    && scene.children.includes(falls.audioAnchor), 'parts are on the scene');

  // The sheet falls CLEAR: never inside the ground, and no boulder the
  // terrain actually places sits through it or in front of it. (The first
  // refinement hugged the face 6 cm off the terrain, passed the test that
  // only asked the terrain, and vanished behind the rocks stacked on it.)
  const pos = falls.falls.geometry.getAttribute('position');
  let underGround = 0;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    if (y < POOL.waterY + 0.2) continue;
    if (terrainHeight(x, z) > y + 0.05) underGround++;
  }
  check(underGround === 0, 'sheet never inside the ground (' + underGround + ' vertices)');

  const rocks = [];
  let seed = 7;
  buildJungleTerrain({
    scene: new THREE.Scene(), maxAniso: 1,
    rnd: () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296),
    addInstanced: (geo, mat, items) => { rocks.push(...items); },
  });
  const near = rocks.filter(r => Math.abs(r.x - FALLS.x) < 20 && Math.abs(r.z - FALLS.z) < 15);
  let hidden = 0;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    if (y < POOL.waterY + 0.3) continue;
    for (const r of near) {
      const R = Math.max(r.sx, r.sy, r.sz) * 0.64;
      // Inside the rock, or behind it as seen from the pool (in front = -Z).
      if (Math.hypot(x - r.x, y - r.y) < R && z > r.z - R) { hidden++; break; }
    }
  }
  check(near.length > 10, 'the cliff around the falls is still dressed (' + near.length + ' rocks)');
  check(hidden === 0, 'no rock through or in front of the sheet (' + hidden + ' vertices hidden)');

  // The impact stays where the ballistic sheet lands (the face blend eases
  // out at the waterline), so the foam disc has not moved with the hug.
  const drop = terrainHeight(FALLS.x, FALLS.z) + 0.12 - POOL.waterY;
  const zBall = FALLS.z - 0.2 - 2.3 * Math.sqrt(2 * drop / 9.8);
  check(Math.abs(falls.impact.z - zBall) < 0.05, 'impact stays at the sheet landing');
  check(Math.abs(falls.impact.x - FALLS.x) < 1e-6, 'impact under the lip');

  // The crest feed rides the notch's bed just behind the lip.
  const cp = falls.crest.geometry.getAttribute('position');
  let crestRows = 0, crestBad = 0, crestZmin = 1e9;
  for (let i = 0; i < cp.count; i += 4) {
    const x = cp.getX(i), y = cp.getY(i), z = cp.getZ(i);
    crestRows++;
    crestZmin = Math.min(crestZmin, z);
    const gap = y - terrainHeight(x, z);
    if (gap < 0.0 || gap > 0.3) crestBad++;
  }
  check(crestRows >= 5 && crestBad === 0,
    'crest sheet rides the notch bed (' + crestBad + '/' + crestRows + ' off)');
  check(crestZmin > FALLS.z, 'crest stays behind the lip');

  // The pool's surface knows the whole bed under it — outlet channel
  // included — and the stream leaves at the pool's level. (A GLSL twin of
  // the bowl alone left the channel out: the water stopped short of the
  // outlet and a dry bar of ground showed between pool and stream.)
  const pg = falls.pool.geometry, pgp = pg.getAttribute('position'), pab = pg.getAttribute('aBed');
  let bedOff = 0;
  for (let i = 0; i < pgp.count; i += 7) {
    if (Math.abs(pab.getX(i) - terrainHeight(pgp.getX(i), pgp.getZ(i))) > 1e-4) bedOff++;
  }
  check(pab && bedOff === 0, 'pool surface reads the real bed (' + bedOff + ' off)');
  check(falls.pool.material.depthWrite === false
    && falls.pool.renderOrder > falls.stream.renderOrder,
    'pool surface does not hide the stream head under it');
  // Overlap: where the pool starts to fade (r + 1.5 from its centre) the
  // stream ribbon must already be at full strength — at least 1 m along it.
  {
    const sp = falls.stream.geometry.getAttribute('position');
    const zHead = sp.getZ(1);                        // first row, near centre
    const pr = Math.hypot(streamX(zHead) - POOL.x, zHead - POOL.z);
    check(pr < POOL.r + 1.5 - 1.0,
      'stream is opaque before the pool fades (head ' + pr.toFixed(1) + ' m from centre)');
  }
  // The stream is the pool's water: lit like it, and knowing its own bed so
  // its edges are the banks. Its normals face up.
  {
    const sg = falls.stream.geometry, sab = sg.getAttribute('aBed'), sp2 = sg.getAttribute('position');
    let off = 0;
    for (let i = 0; i < sp2.count; i += 5) {
      if (Math.abs(sab.getX(i) - terrainHeight(sp2.getX(i), sp2.getZ(i))) > 1e-4) off++;
    }
    check(falls.stream.material.isMeshStandardMaterial, 'stream is lit like the pool');
    check(off === 0, 'stream reads the real bed (' + off + ' off)');
    let banksDry = 0, wetMid = 0, rows = 0;
    const across = 9;
    for (let i = 0; i + across <= sp2.count; i += across) {
      rows++;
      // Outermost vertices sit on the banks, above the water: no water drawn.
      if (sp2.getY(i) - sab.getX(i) < 0 && sp2.getY(i + across - 1) - sab.getX(i + across - 1) < 0) banksDry++;
      if (sp2.getY(i + 4) - sab.getX(i + 4) > 0.1) wetMid++;
    }
    check(banksDry > rows * 0.8, 'stream edges end on the banks (' + banksDry + '/' + rows + ' rows)');
    check(wetMid > rows * 0.9, 'water down the middle of the channel (' + wetMid + '/' + rows + ')');
    check(sg.getAttribute('normal').getY(0) > 0.9, 'stream faces up');
  }
  // One fresh water: pool and stream share the ramp, and the pool's surface
  // drifts toward the outlet (its axis points from the centre to the mouth).
  {
    const pu = falls.poolUniforms;
    check(pu.uShallowCol.value.getHex() === CASCADE_PRESET.freshShallow
      && pu.uDeepCol.value.getHex() === CASCADE_PRESET.freshDeep, 'pool wears the fresh-water ramp');
    const ax = pu.uAxis.value, o = pu.uOutlet.value;
    const toMouth = Math.hypot(o.x - POOL.x, o.y - POOL.z);
    check(Math.abs(ax.length() - 1) < 1e-6
      && Math.abs(ax.x - (o.x - POOL.x) / toMouth) < 1e-6
      && Math.abs(ax.y - (o.y - POOL.z) / toMouth) < 1e-6, 'pool drift points at the outlet');
    check(Math.abs(o.x - streamX(STREAM_Z0)) < 1e-6 && Math.abs(o.y - STREAM_Z0) < 1e-6,
      'the outlet is where the stream leaves');
  }
  let dryGap = 0;
  for (let t = 0; t <= 1; t += 0.05) {
    // From the pool centre out along the outlet to where the stream is full.
    const z = POOL.z + (STREAM_Z0 - 2 - POOL.z) * t;
    const x = POOL.x + (streamX(STREAM_Z0) - POOL.x) * t;
    if (terrainHeight(x, z) > POOL.waterY - 0.05) dryGap++;
  }
  check(dryGap === 0, 'no dry ground between pool and stream (' + dryGap + ' samples)');
  check(POOL.waterY - streamWaterY(STREAM_Z0) < 0.08,
    'stream leaves at the pool level (' + (POOL.waterY - streamWaterY(STREAM_Z0)).toFixed(2) + ' m below)');

  // Per-frame API: update drives every clock, resize scales the sprites.
  falls.update(0); falls.update(7.5); falls.update(1234.5); falls.resize(800);
  falls.update(3.25);
  check(Math.abs(falls.falls.material.uniforms.uTime.value - 3.25) < 1e-5,
    'update drives the sheet clock');
  check(Math.abs(falls.poolUniforms.uTime.value - 3.25) < 1e-5,
    'update drives the pool clock');
  check(falls.mist.material.uniforms.uScale.value === 800 * 0.45,
    'resize scales the mist sprites');
  check(falls.splash.material.uniforms.uScale.value === 800 * 0.45,
    'resize scales the splash sprites');

  // Defaults: full mist keeps all its particles; the audio anchor hangs
  // above the impact where the PositionalAudio will sit.
  check(falls.mist.geometry.drawRange.count === 280, 'default mist keeps all particles');
  check(Math.abs(falls.audioAnchor.position.y - (POOL.waterY + 2.5)) < 1e-5,
    'audio anchor above the impact');
  check(CASCADE_PRESET.flow === 1 && CASCADE_PRESET.mist === 1,
    'preset defaults are neutral');

  // A preset actually reaches the uniforms and the draw ranges.
  const lazy = createJungleWaterfall({
    scene: new THREE.Scene(), waterNormal,
    preset: { flow: 0.5, mist: 0.4, ripples: 0.25, splash: 0.3, foam: 0.6 },
  });
  check(Math.abs(lazy.falls.material.uniforms.uFlow.value - 0.5) < 1e-5,
    'preset.flow reaches the sheet');
  check(Math.abs(lazy.crest.material.uniforms.uFlow.value - 0.5) < 1e-5,
    'preset.flow reaches the crest feed');
  check(lazy.mist.geometry.drawRange.count === Math.round(280 * 0.4),
    'preset.mist scales the mist draw range');
  check(Math.abs(lazy.mist.material.uniforms.uIntensity.value - 0.4) < 1e-5,
    'preset.mist reaches the mist alpha');
  check(Math.abs(lazy.poolUniforms.uRipples.value - 0.25) < 1e-5,
    'preset.ripples reaches the pool');
  check(Math.abs(lazy.foam.material.uniforms.uStrength.value - 0.6) < 1e-5,
    'preset.foam reaches the impact disc');
  check(Math.abs(lazy.splash.material.uniforms.uStrength.value - 0.3) < 1e-5,
    'preset.splash reaches the droplets');
}

globalThis.__jungleWaterfallFailed = failed;
console.log(failed ? 'jungle_waterfall: ' + failed + ' FAILED' : 'jungle_waterfall: all passed');

