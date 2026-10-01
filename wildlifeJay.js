// wildlifeJay.js — the island scrub-jay (Aphelocoma insularis), the bird
// found on Santa Cruz Island and nowhere else: bright blue head, wings and
// long tail, a grey-brown back, pale below with a blue necklace. On the
// forest floor it hops in short bounds, stops, cocks its tail, tilts its
// head at the litter; pressed, it bounds for the nearest bush and is gone
// into it, and hops back out once you have passed. A species module for
// wildlife.js (WILDLIFE.md walks through the shape via wildlifeCrab.js) —
// the second `hop` species, after the tree frogs.
//
// Model: ~330 triangles, flat-shaded, vertex-coloured, one merged geometry.
// Local frame: +Z is the front (bill), +X its right, y = 0 the ground.
// Part ids read by JAY_GLSL: 0 body, 1 head + bill + throat, 4 wings,
// 5 tail, 10/11 legs.
import * as THREE from 'three';
import { creaturePart, limbGeometry, mergeCreatureParts } from './wildlife.js?v=20261001-pass8';

const COL = {
  blue: 0x2c5fae,        // head, wings and tail
  blueDeep: 0x214a8c,    // the flight feathers, a shade deeper
  back: 0x7b6f63,        // the grey-brown mantle
  belly: 0xc8c3ba,       // pale grey underparts
  throat: 0xe6e2da,      // the whitish throat over the blue necklace
  bill: 0x141210,
  leg: 0x1e1b18,
  eye: 0x0b0a09,
};

// ---------------------------------------------------------------------------
// Model.
// ---------------------------------------------------------------------------
export function buildJay() {
  const parts = [];
  const part = (g, id, color, bottom, pivot) =>
    parts.push(creaturePart(g, { part: id, pivot, color, bottomColor: bottom }));
  const blob = (sx, sy, sz, x, y, z, id, color, bottom, pivot, seg = [6, 4]) => {
    const g = new THREE.SphereGeometry(1, seg[0], seg[1]);
    g.scale(sx, sy, sz).translate(x, y, z);
    part(g, id, color, bottom, pivot);
  };

  // Body: grey-brown above, pale below, held a little nose-up.
  blob(0.042, 0.042, 0.075, 0, 0.078, -0.005, 0, COL.back, COL.belly, undefined, [7, 5]);
  blob(0.038, 0.032, 0.062, 0, 0.066, 0.006, 0, COL.belly, COL.belly);

  // Head: blue crown and face, a whitish throat with the blue necklace
  // under it, a stout black bill (part 1, about the neck).
  const neck = [0, 0.1, 0.05];
  blob(0.028, 0.027, 0.032, 0, 0.118, 0.066, 1, COL.blue, COL.blue, neck);
  blob(0.02, 0.016, 0.018, 0, 0.1, 0.078, 1, COL.throat, COL.throat, neck, [5, 3]);
  blob(0.024, 0.009, 0.012, 0, 0.088, 0.07, 1, COL.blue, COL.blue, neck, [5, 3]);
  part(limbGeometry([0, 0.117, 0.094], [0, 0.11, 0.13], 0.012, 0.006), 1, COL.bill, COL.bill, neck);
  for (const s of [-1, 1]) {
    part(new THREE.BoxGeometry(0.007, 0.007, 0.007).translate(s * 0.022, 0.124, 0.08), 1, COL.eye, COL.eye, neck);
  }

  // Wings: blue, folded along the flanks inside the body's outline, the
  // deeper flight feathers at their tail end (part 4: flicked open on a
  // bound).
  for (const s of [-1, 1]) {
    const pivot = [s * 0.03, 0.095, 0.03];
    blob(0.012, 0.026, 0.052, s * 0.034, 0.084, -0.008, 4, COL.blue, COL.belly, pivot, [5, 3]);
    blob(0.008, 0.012, 0.03, s * 0.026, 0.09, -0.056, 4, COL.blueDeep, COL.blueDeep, pivot, [5, 3]);
  }

  // The long blue tail, off the rump (part 5: cocked and flicked).
  const rump = [0, 0.08, -0.07];
  part(new THREE.BoxGeometry(0.038, 0.012, 0.145).translate(0, 0, -0.072).rotateX(-0.18).translate(...rump),
    5, COL.blue, COL.blueDeep, rump);

  // Legs: dark, set under the middle (10, 11).
  for (const s of [-1, 1]) {
    const hip = [s * 0.014, 0.044, 0.0];
    part(limbGeometry(hip, [s * 0.015, 0.004, 0.006], 0.007, 0.005), s < 0 ? 10 : 11, COL.leg, COL.leg, hip);
    part(limbGeometry([s * 0.015, 0.003, -0.006], [s * 0.015, 0.002, 0.024], 0.008, 0.004),
      s < 0 ? 10 : 11, COL.leg, COL.leg, hip);
  }
  return { geometry: mergeCreatureParts(parts) };
}

// ---------------------------------------------------------------------------
// Animation, in the vertex shader (see makeCreatureMaterial for the inputs).
// aAnim: x idle phase, y gait 0..1, z mood 0..1 (alarm), w stride (rad).
// The hop motion advances stride about half a turn per bound and sets gait
// from the bound's horizontal speed.
// ---------------------------------------------------------------------------
export const JAY_GLSL = `
  float gait = aAnim.y, mood = aAnim.z;
  float side = aPivot.x > 0.0 ? 1.0 : -1.0;
  float air = smoothstep(0.05, 0.3, gait);
  if (aPart > 9.5) {
    // Legs: tucked up under the body in the air.
    transformed = wlRotX(transformed, aPivot, -0.9 * air);
  } else if (aPart > 4.5 && aPart < 5.5) {
    // Tail: cocked and flicked while it stands — a jay's restless signal —
    // trailed on the bound, raised high when alarmed.
    float flick = pow(max(0.0, sin(uTime * 2.3 + aAnim.x)), 6.0) * 0.5;
    transformed = wlRotX(transformed, aPivot, -(flick * (1.0 - air) + 0.35 * mood) + 0.15 * air);
  } else if (aPart > 3.5 && aPart < 4.5) {
    // Wings: a flick open on each bound.
    transformed = wlRotZ(transformed, aPivot, side * 0.7 * air);
  } else if (aPart > 0.5 && aPart < 1.5) {
    // Head: tilts at the litter, a peck now and then; up and still when
    // alarmed.
    float tilt = sin(uTime * 0.8 + aAnim.x * 2.3) * 0.35;
    float peck = pow(max(0.0, sin(uTime * 1.7 + aAnim.x)), 8.0) * 0.9;
    float calm = (1.0 - air) * (1.0 - mood);
    transformed = wlRotZ(transformed, aPivot, tilt * calm);
    transformed = wlRotX(transformed, aPivot, peck * calm - 0.15 * mood);
  }
`;

// ---------------------------------------------------------------------------
// Behaviour hooks (the hop motion does the rest).
// ---------------------------------------------------------------------------
const BUSH_REACH = 7;      // m: a bush within this is a refuge

// Into the nearest bush whose way is clear of the player, well in, where
// the HIDDEN sink takes it out of sight; none in reach, bound straight away.
function fleeTarget(a, sp, ctx, api) {
  const bush = api.refugeAt(a, ctx.layout.spots.bushes, BUSH_REACH, 0.3);
  if (bush) api.setTarget(a, sp, bush.x, bush.z);
  else api.defaultFlee(a, sp);
}

// ---------------------------------------------------------------------------
// The species definition. Every key is documented in WILDLIFE.md; anything
// left out takes wildlife.js's DEFAULTS, and a map may override any of it.
// ---------------------------------------------------------------------------
export const JAY = {
  id: 'jay',
  motion: 'hop',
  count: 5,
  habitat: {
    soils: ['FOREST', 'DIRT'],
    slope: [0, 0.5],
    avoid: { path: 1.0 },
    near: { bushes: 4, share: 1 },   // never far from cover
  },
  spacing: 5,
  homeRange: 4,
  activeRadius: 32,
  fear: { radius: 4, runRadius: 7, calmDistance: 10, hideFor: [5, 12] },
  speed: { walk: 1.2, flee: 2.6, turn: 9 },
  strideRate: 5,                     // about half a turn per bound
  body: {
    alignToGround: true,
    // Life size and a little over (a real one is 30–33 cm, bill to tail).
    // HIDDEN: it ducks into the bush and is gone.
    sinkDepth: 0.12, sinkTime: 0.3, scale: [1.05, 1.2],
  },
  timings: { idle: [1, 4], move: [0.8, 2.5], alert: 0.3 },
  build: buildJay,
  animGLSL: JAY_GLSL,
  tint(rng, c) {
    const k = 0.9 + rng() * 0.2;
    c.setRGB(k, k, k * (0.97 + rng() * 0.06));
  },
  needs: ['spots.bushes'],
  hooks: { fleeTarget },
};
