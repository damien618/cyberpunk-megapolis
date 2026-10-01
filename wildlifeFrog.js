// wildlifeFrog.js — the Pacific tree frog (Pseudacris regilla) of the
// Channel Islands' streams: small, green or brown, big gold eyes. On the
// wet rock ring round the pool, under the falls. Modeled on
// wildlifeCrab.js's shape — WILDLIFE.md is the how-to.
//
// Behaviour: sits still between short hops of 0.3–1 m; the male's throat
// sac pulses when calm. When you come close it freezes flat for a beat,
// then hops for the nearest fresh water — the pool, or the stream below
// it — and stays under until you have gone, when it hops back out.
//
// Model: ~370 triangles, flat-shaded, vertex-coloured, one merged geometry.
// Local frame: +Z is the front (snout, eyes), +X its right, y = 0 the ground.
// Part ids read by FROG_GLSL: 0 body, 1 throat sac, 2 eyes, 10–11 forelegs,
// 12–13 hind legs.
import * as THREE from 'three';
import { creaturePart, limbGeometry, mergeCreatureParts } from './wildlife.js?v=20261001-pass1';

const COL = {
  back: 0x5c8f3e,        // rainette green (tint swings individuals brown)
  backTop: 0x74a854,     // the raised back ridge catches the light
  under: 0x2f3a22,       // baked underside — seats it on the wet rock
  belly: 0xcfc9a0,       // the cream throat
  leg: 0x4a6e30,
  legTip: 0x5d7c3a,
  eye: 0xd0a437,         // gold, dark-pupilled — a tree frog's give-away
  pupil: 0x141414,
};

// ---------------------------------------------------------------------------
// Model.
// ---------------------------------------------------------------------------
export function buildFrog() {
  const parts = [];
  const body = (g, color, bottom = COL.under) =>
    parts.push(creaturePart(g, { part: 0, color, bottomColor: bottom }));

  // Torso: a squat dome, longer than wide, sitting on the ground.
  const torso = new THREE.SphereGeometry(0.05, 8, 5);
  torso.scale(0.95, 0.72, 1.15).translate(0, 0.042, -0.004);
  body(torso, COL.back);
  // The back's low keel — reads as the rainette's light dorsal stripe.
  body(new THREE.BoxGeometry(0.014, 0.010, 0.062).translate(0, 0.077, 0.002),
    COL.backTop, COL.back);
  // The pointed snout, raised a little off the ground.
  body(new THREE.BoxGeometry(0.024, 0.018, 0.030).translate(0, 0.044, 0.048),
    COL.back);

  for (const s of [-1, 1]) {
    // Big bulging gold eyes on the head's top corners, dark pupils forward.
    const eBase = [s * 0.020, 0.060, 0.042];
    parts.push(creaturePart(new THREE.SphereGeometry(0.014, 5, 3).translate(s * 0.020, 0.069, 0.044),
      { part: 2, pivot: eBase, color: COL.eye, bottomColor: COL.eye }));
    parts.push(creaturePart(new THREE.BoxGeometry(0.008, 0.008, 0.008).translate(s * 0.023, 0.074, 0.053),
      { part: 2, pivot: eBase, color: COL.pupil }));

    // Forelegs: thin, out of the flank, feet planted ahead of the snout's
    // base and pointing forward.
    const sh = [s * 0.028, 0.030, 0.030];
    parts.push(creaturePart(limbGeometry(sh, [s * 0.037, 0.013, 0.042], 0.008, 0.006),
      { part: 10, pivot: sh, color: COL.leg, bottomColor: COL.under }));
    parts.push(creaturePart(limbGeometry([s * 0.037, 0.013, 0.042], [s * 0.034, 0.005, 0.056], 0.006, 0.005),
      { part: 10, pivot: sh, color: COL.leg, bottomColor: COL.under }));
    parts.push(creaturePart(new THREE.BoxGeometry(0.017, 0.005, 0.020).translate(s * 0.033, 0.003, 0.061),
      { part: 10, pivot: sh, color: COL.legTip, bottomColor: COL.under }));

    // Hind legs, the folded Z that gives a frog its silhouette: thigh up
    // and back, shin down, then the long foot folded alongside the body.
    const hip = [s * 0.031, 0.034, -0.022];
    parts.push(creaturePart(limbGeometry(hip, [s * 0.050, 0.064, -0.038], 0.012, 0.009),
      { part: 12, pivot: hip, color: COL.leg, bottomColor: COL.under }));
    parts.push(creaturePart(limbGeometry([s * 0.050, 0.064, -0.038], [s * 0.044, 0.030, -0.058], 0.009, 0.007),
      { part: 12, pivot: hip, color: COL.leg, bottomColor: COL.under }));
    parts.push(creaturePart(limbGeometry([s * 0.044, 0.030, -0.058], [s * 0.037, 0.006, -0.016], 0.006, 0.010),
      { part: 12, pivot: hip, color: COL.legTip, bottomColor: COL.leg }));
    parts.push(creaturePart(new THREE.BoxGeometry(0.018, 0.005, 0.022).translate(s * 0.036, 0.004, -0.008),
      { part: 12, pivot: hip, color: COL.legTip, bottomColor: COL.under }));
  }

  // The vocal sac under the snout — FROG_GLSL pulses it when the male calls.
  parts.push(creaturePart(new THREE.BoxGeometry(0.022, 0.009, 0.022).translate(0, 0.023, 0.038),
    { part: 1, pivot: [0, 0.030, 0.038], color: COL.belly, bottomColor: COL.under }));

  return { geometry: mergeCreatureParts(parts) };
}
// ---------------------------------------------------------------------------
// Animation, in the vertex shader (see makeCreatureMaterial for the inputs).
// aAnim: x idle phase, y gait 0..1, z mood 0..1 (alarm), w stride (rad).
// ---------------------------------------------------------------------------
export const FROG_GLSL = `
  float gait = aAnim.y, mood = aAnim.z, stride = aAnim.w;
  float side = aPivot.x > 0.0 ? 1.0 : -1.0;
  if (aPart > 11.5) {
    // Hind legs: one sweep per hop — stride climbs about half a turn each
    // leap, so sin² gives a single push, back and down off the rock, then
    // the fold returns. Alarmed, the legs fold further: a frightened frog
    // is a flat frog.
    float kick = sin(stride) * sin(stride) * gait;
    transformed = wlRotX(transformed, aPivot, -0.55 * kick - 0.35 * mood);
  } else if (aPart > 9.5) {
    // Forelegs brace the landing and prop the stare when alarmed.
    float brace = max(0.0, sin(stride + 1.3)) * 0.35 * gait;
    transformed = wlRotX(transformed, aPivot, brace - 0.25 * mood);
  } else if (aPart > 1.5 && aPart < 2.5) {
    // Eyes rise off the head when alarmed.
    transformed = wlRotX(transformed, aPivot, -0.3 * mood);
  }
  // The throat sac pulses when a calm male calls.
  if (aPart > 0.5 && aPart < 1.5) {
    transformed.y += max(0.0, sin(uTime * 5.1 + aAnim.x * 3.7))
      * 0.005 * (1.0 - gait) * (1.0 - mood);
  }
  // The body breathes, and flattens toward the rock when alarmed.
  if (aPart < 0.5) {
    transformed.y += sin(uTime * 2.3 + aAnim.x) * 0.0022 * (1.0 - gait);
    transformed.y -= 0.008 * mood;
  }
`;

// ---------------------------------------------------------------------------
// Behaviour hooks (the manager's defaults cover everything else).
// ---------------------------------------------------------------------------
// The nearest fresh water that does not mean leaping at the player: sample
// the directions away from them (straight, and a glancing cone either side)
// at a hop-chain's reach, and take the first that is pool or stream. Failing
// both, a short dash away and sink where it lands.
const FLEE_CONE = [0, 0.7, -0.7];   // rad either side of straight away
const FLEE_LOOK = [1.6, 3, 4.5];    // m

function fleeTarget(a, sp, ctx, api) {
  const L = ctx.layout;
  let ax = a.x - ctx.px, az = a.z - ctx.pz;
  const al = Math.hypot(ax, az) || 1;
  ax /= al; az /= al;
  const base = Math.atan2(ax, az);
  for (const spread of FLEE_CONE) {
    const h = base + spread, sx = Math.sin(h), cz = Math.cos(h);
    for (const d of FLEE_LOOK) {
      const x = a.x + sx * d, z = a.z + cz * d;
      const w = L.waterAt ? L.waterAt(x, z) : null;
      if (w && (w.kind === 'pool' || w.kind === 'stream')) {
        api.setTarget(a, sp, x, z);
        return;
      }
    }
  }
  api.setTarget(a, sp, a.x + ax * 2.5, a.z + az * 2.5);
}

// ---------------------------------------------------------------------------
// The species definition. Every key is documented in WILDLIFE.md; anything
// left out takes wildlife.js's DEFAULTS, and a map may override any of it.
// ---------------------------------------------------------------------------
export const FROG = {
  id: 'frog',
  motion: 'hop',
  count: 8,
  habitat: {
    soils: ['WET', 'ROCK'],         // the wet rock ring; SHALLOW is the water
    slope: [0, 0.6],                // rocks can lean
    within: { pool: 2 },            // round the pool, under the falls
    avoid: { path: 1.2 },           // the path's last bend arrives here
  },
  spacing: 1.2,
  homeRange: 2.5,
  activeRadius: 30,                 // a 4 cm frog is a couple of pixels past this
  fear: { radius: 2.5, runRadius: 4.5, calmDistance: 9, hideFor: [6, 14] },
  speed: { walk: 0.5, flee: 1.5, turn: 8 },
  strideRate: 5,                    // about half a turn of kick per leap
  body: {
    yawOffset: 0, alignToGround: true,
    // Twice to three times life size (a real one is 3–4 cm).
    lift: 0, sinkDepth: 0.16, sinkTime: 0.35, scale: [0.9, 1.3],
  },
  timings: { idle: [2, 6], move: [0.6, 1.4], alert: 0.25 },
  build: buildFrog,
  animGLSL: FROG_GLSL,
  // Individual variation: some green, some brown, a little lighter or darker
  // (the instance colour multiplies the vertex colours).
  tint(rng, c) {
    const k = 0.85 + rng() * 0.3, b = rng();   // b: 0 green → 1 brown
    c.setRGB(k * (1 + 0.28 * b), k * (1 - 0.10 * b), k * (1 - 0.28 * b));
  },
  hooks: { fleeTarget },
};
