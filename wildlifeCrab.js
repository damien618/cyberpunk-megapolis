// wildlifeCrab.js — the striped shore crab (Pachygrapsus crassipes) of the
// Channel Islands' beaches: dark olive carapace, rust-red claws, eyes on
// stalks. THE REFERENCE SPECIES for wildlife.js — WILDLIFE.md walks through
// this file section by section; copy its shape for the next animal.
//
// Behaviour: scuttles sideways in short bursts between pauses, picks at the
// sand with its claws, backs up the beach ahead of each run of the swash;
// when you come close it freezes with its claws up, then runs sideways for
// the nearest refuge — under a rock, into the water, or failing both, into
// the sand where it stands — and comes back out once you have gone.
//
// Model: ~380 triangles, flat-shaded, vertex-coloured, one merged geometry.
// Local frame: +Z is the front (eyes, claws), +X its right, y = 0 the ground.
// Part ids read by CRAB_GLSL: 0 body, 2 claws, 3 eyes, 10–13 legs front→back.
import * as THREE from 'three';
import { creaturePart, limbGeometry, mergeCreatureParts, swashTick } from './wildlife.js?v=20261001-pass9';

const COL = {
  shell: 0x44522c,       // olive, darkening to the rim
  shellTop: 0x56663a,    // the raised centre catches the light: the "stripes"
  under: 0x24241a,       // baked underside — seats it on the sand
  leg: 0x3a4426,
  legTip: 0x5c5a38,
  claw: 0xa2402a,        // rust red
  finger: 0xd07a58,
  arm: 0x6a4228,
  eye: 0x141414,
  stalk: 0x2e2d22,
};

// ---------------------------------------------------------------------------
// Model.
// ---------------------------------------------------------------------------
export function buildCrab() {
  const parts = [];
  const body = (g, color, bottom = COL.under) =>
    parts.push(creaturePart(g, { part: 0, color, bottomColor: bottom }));

  // Carapace: a hexagonal slab, a flat edge to the front, wider than long,
  // with a smaller raised plate on top so the facets read as a shell.
  const shell = new THREE.CylinderGeometry(0.036, 0.044, 0.026, 6);
  shell.rotateY(Math.PI / 6).scale(1.2, 1, 0.85).translate(0, 0.05, 0);
  body(shell, COL.shell);
  const plate = new THREE.CylinderGeometry(0.026, 0.035, 0.009, 6);
  plate.rotateY(Math.PI / 6).scale(1.2, 1, 0.85).translate(0, 0.067, -0.002);
  body(plate, COL.shellTop, COL.shell);

  for (const s of [-1, 1]) {
    // Eyes on stalks, at the front corners.
    const eBase = [s * 0.018, 0.06, 0.03];
    parts.push(creaturePart(limbGeometry(eBase, [s * 0.022, 0.08, 0.036], 0.007),
      { part: 3, pivot: eBase, color: COL.stalk }));
    parts.push(creaturePart(new THREE.BoxGeometry(0.011, 0.011, 0.011).translate(s * 0.022, 0.083, 0.037),
      { part: 3, pivot: eBase, color: COL.eye }));

    // Claws: arm out and forward from the shoulder, then the rust-red hand
    // turned back in front of the face.
    const sh = [s * 0.042, 0.05, 0.026];
    const elbow = [s * 0.064, 0.046, 0.058];
    const wrist = [s * 0.054, 0.046, 0.084];
    const tip = [s * 0.028, 0.046, 0.104];
    parts.push(creaturePart(limbGeometry(sh, elbow, 0.011), { part: 2, pivot: sh, color: COL.arm, bottomColor: COL.under }));
    parts.push(creaturePart(limbGeometry(elbow, wrist, 0.012), { part: 2, pivot: sh, color: COL.arm, bottomColor: COL.under }));
    parts.push(creaturePart(limbGeometry(wrist, tip, 0.019, 0.014), { part: 2, pivot: sh, color: COL.claw }));
    // The movable finger, pale, set a little above the hand: a pincer.
    parts.push(creaturePart(limbGeometry([s * 0.052, 0.055, 0.086], [s * 0.03, 0.054, 0.106], 0.007),
      { part: 2, pivot: sh, color: COL.finger }));

    // Four walking legs a side, splayed fan-wise: a femur rising to the knee
    // and a shin dropping to the sand.
    const hipZ = [0.024, 0.009, -0.006, -0.021];
    const fan = [0.55, 0.15, -0.3, -0.75];
    for (let i = 0; i < 4; i++) {
      const hip = [s * 0.046, 0.046, hipZ[i]];
      const dx = s * Math.cos(fan[i]), dz = Math.sin(fan[i]);
      const knee = [hip[0] + dx * 0.036, 0.068, hip[2] + dz * 0.036];
      const foot = [hip[0] + dx * 0.074, 0.002, hip[2] + dz * 0.074];
      // Flattened segments, as a grapsid's legs are.
      parts.push(creaturePart(limbGeometry(hip, knee, 0.013, 0.008), { part: 10 + i, pivot: hip, color: COL.leg, bottomColor: COL.under }));
      parts.push(creaturePart(limbGeometry(knee, foot, 0.009, 0.007), { part: 10 + i, pivot: hip, color: COL.legTip, bottomColor: COL.leg }));
    }
  }
  return { geometry: mergeCreatureParts(parts) };
}

// ---------------------------------------------------------------------------
// Animation, in the vertex shader (see makeCreatureMaterial for the inputs).
// aAnim: x idle phase, y gait 0..1, z mood 0..1 (alarm), w stride (rad).
// ---------------------------------------------------------------------------
export const CRAB_GLSL = `
  float gait = aAnim.y, mood = aAnim.z, stride = aAnim.w;
  float side = aPivot.x > 0.0 ? 1.0 : -1.0;
  if (aPart > 9.5) {
    // Legs: an alternating gait — neighbours in antiphase, and the two
    // sides opposed — each leg lifting its tip (about the body's long axis)
    // and sweeping a little fore and aft. At rest, a slow twitch.
    float leg = aPart - 10.0;
    float p = stride + leg * 3.14159 + (side > 0.0 ? 1.5708 : 0.0);
    float lift = max(0.0, sin(p)) * 0.6 * gait;
    float twitch = sin(uTime * 2.3 + aAnim.x + leg * 1.7) * 0.05 * (1.0 - gait);
    transformed = wlRotZ(transformed, aPivot, side * (lift + twitch));
    transformed = wlRotY(transformed, aPivot, cos(p) * 0.22 * gait);
  } else if (aPart > 1.5 && aPart < 2.5) {
    // Claws: calm, they pick at the sand in turn; alarmed, up and open.
    float feed = max(0.0, sin(uTime * 1.9 + aAnim.x + side * 1.3)) * 0.4 * (1.0 - mood) * (1.0 - gait);
    transformed = wlRotX(transformed, aPivot, feed - 0.95 * mood);
    transformed = wlRotY(transformed, aPivot, side * 0.4 * mood);
  } else if (aPart > 2.5 && aPart < 3.5) {
    // Eyes stand up when alarmed.
    transformed = wlRotX(transformed, aPivot, -0.35 * mood);
  }
  // The body bobs with the stride.
  transformed.y += abs(sin(stride)) * 0.004 * gait;
`;

// ---------------------------------------------------------------------------
// Behaviour hooks (the manager's defaults cover everything else).
// ---------------------------------------------------------------------------
const WATER_REACH = 8;     // m: farther than this, the sea is no refuge
const ROCK_REACH = 5;      // m: a rock within this is

// The nearest refuge that does not mean running at the player: under a
// rock, into the sea, or — neither in reach — a short dash and dig in.
function fleeTarget(a, sp, ctx, api) {
  const L = ctx.layout;
  let bx = 0, bz = 0, best = Infinity;
  // Under its lee edge, a third of the way in: the rock hides the dig (the
  // obstacle stops the crab at the stone's foot, where it sinks).
  const rock = api.refugeAt(a, L.spots.rocks, ROCK_REACH, 0.35);
  if (rock) { best = Math.hypot(rock.x - a.x, rock.z - a.z); bx = rock.x; bz = rock.z; }
  const ax = a.x - ctx.px, az = a.z - ctx.pz, al = Math.hypot(ax, az) || 1;
  const x = a.x + ax / al * 0.8, z = L.waterlineZ(x) - 0.7;
  const run = Math.hypot(x - a.x, z - a.z);
  if (run < WATER_REACH && api.clearOfPlayer(a, x, z) && run < best) { best = run; bx = x; bz = z; }
  if (best === Infinity) { bx = a.x + ax / al * 2.5; bz = a.z + az / al * 2.5; }
  api.setTarget(a, sp, bx, bz);
}

// ---------------------------------------------------------------------------
// The species definition. Every key is documented in WILDLIFE.md; anything
// left out takes wildlife.js's DEFAULTS, and a map may override any of it.
// ---------------------------------------------------------------------------
export const CRAB = {
  id: 'crab',
  motion: 'ground',
  count: 30,
  habitat: {
    soils: ['SAND', 'WET'],
    shore: [1.5, 13],               // above the mean waterline, below the forest
    slope: [0, 0.3],
    avoid: { path: 1.6, jetty: 1.2, stream: 1.2 },
    near: { rocks: 6, share: 0.55 },  // a colony round each rock pile
  },
  spacing: 0.8,
  homeRange: 3,
  activeRadius: 38,                 // a 35 cm crab is a couple of pixels past this
  fear: { radius: 3.5, runRadius: 6.5, calmDistance: 11, hideFor: [7, 18] },
  speed: { walk: 0.3, flee: 1.5, turn: 7 },
  strideRate: 38,                   // rad of leg cycle per metre covered
  body: {
    yawOffset: Math.PI / 2, sideways: true, alignToGround: true,
    // About twice life size, legs spread (a real one is a 5 cm shell, some
    // 10 cm across the legs): at life size it is a speck on the sand at the
    // camera's distance, at three times it rivals the beach stones.
    lift: 0, sinkDepth: 0.2, sinkTime: 0.45, scale: [0.7, 1.0],
  },
  timings: { idle: [1.2, 5], move: [0.8, 2.5], alert: 0.35 },
  build: buildCrab,
  animGLSL: CRAB_GLSL,
  // Individual variation: a little lighter or darker, a little greener or
  // browner (the instance colour multiplies the vertex colours).
  tint(rng, c) {
    const k = 0.82 + rng() * 0.36, h = (rng() - 0.5) * 0.16;
    c.setRGB(k * (1 + h), k, k * (1 - h));
  },
  needs: ['waterlineZ'],
  // Keep ahead of the swash: a crab caught below the water's edge while calm
  // hurries a metre or two up the beach before anything else.
  hooks: { tick: swashTick({ margin: 0.3, up: [1.2, 2.7], speedK: 0.6 }), fleeTarget },
};
