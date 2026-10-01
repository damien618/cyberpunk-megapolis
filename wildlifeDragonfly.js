// wildlifeDragonfly.js — the pool's dragonflies: a handful of blue emperors
// patrolling the plunge pool and the foot of the falls. Modeled on
// wildlifeCrab.js's shape — WILDLIFE.md is the how-to, and this is the
// roster's planned "dragonflies": the first `flyFree` species (the stub's
// brief in wildlifeMotion.js, implemented).
//
// Behaviour: hang at an anchor on a small figure-of-eight, wings never
// stopping, then dart off in fast sideways zigzags to the next anchor,
// skimming a band of 0.35–2.2 m above the water or the ground. Your coming
// close buys one hard zigzag sideways — then it comes straight back. Its one
// hook is a tick that never lets the machine land it, the fish's trick: a
// dragonfly at rest is a dead dragonfly.
//
// Model: ~250 triangles, flat-shaded, vertex-coloured, one merged geometry.
// Local frame: +Z is the front (eyes, head), +X its right, y ≈ 0 the belly
// line — the air is a dragonfly's ground. The "membrane" of the wings is a
// near-white vertex colour, not an alpha: one opaque material per species is
// the system's rule (one instanced draw), and a pale plate beating at ~9 Hz
// reads as a wing.
// Part ids read by DRAGONFLY_GLSL: 0 thorax (+ its dorsal plate), 1 abdomen,
// 2 head + eyes, 3 fore wings, 4 hind wings.
import * as THREE from 'three';
import { creaturePart, mergeCreatureParts } from './wildlife.js?v=20261001-pass6';

const COL = {
  thorax: 0x2e8ba8,      // the emperor's turquoise
  thoraxTop: 0x3aa3bf,   // the lighter dorsal plate catches the light
  under: 0x1a2e36,       // baked underside — seats it against the water
  abd: 0x2478a0,         // abdomen blue
  ring: 0x16323c,        // the dark rings between the segments
  head: 0x1d6b82,
  eye: 0x22423e,         // the great wrap-around eyes, dark green-grey
  wing: 0xe9f3f5,        // the membrane: pale, near-white
};

// ---------------------------------------------------------------------------
// Model.
// ---------------------------------------------------------------------------
export function buildDragonfly() {
  const parts = [];
  const body = (g, color, bottom = COL.under) =>
    parts.push(creaturePart(g, { part: 0, color, bottomColor: bottom }));

  // Thorax: a six-sided blob tilted a touch nose-up, with a lighter plate
  // over the shoulders (the crab's raised-plate trick).
  const thorax = new THREE.SphereGeometry(0.02, 6, 4);
  thorax.rotateX(0.18).scale(0.8, 0.85, 1.25).translate(0, 0.02, 0.004);
  body(thorax, COL.thorax);
  const plate = new THREE.SphereGeometry(0.014, 6, 3);
  plate.rotateX(0.18).scale(0.75, 0.5, 1.1).translate(0, 0.031, 0.002);
  body(plate, COL.thoraxTop, COL.thorax);

  // Abdomen: three tapering open cylinders trailing back and drooping a
  // hair, the dark rings read as a darker middle segment (part 1, pivoted
  // at the thorax joint so the GLSL can carry it).
  const seg = (z0, len, r0, r1, tilt, color) => {
    const g = new THREE.CylinderGeometry(r0, r1, len, 6, 1, true);
    g.rotateX(Math.PI / 2);            // +Z out of the front, thicker end first
    g.translate(0, 0, -len / 2);       // hang it back from its joint
    g.rotateX(tilt);                   // the droop, about the joint
    g.translate(0, 0.02, z0);
    parts.push(creaturePart(g, { part: 1, pivot: [0, 0.02, z0], color, bottomColor: COL.ring }));
  };
  seg(-0.016, 0.031, 0.0068, 0.0056, -0.015, COL.abd);
  seg(-0.046, 0.028, 0.0056, 0.0046, -0.045, COL.ring);
  seg(-0.073, 0.026, 0.0046, 0.003, -0.08, COL.abd);

  // Head: a small ball with two great eyes nearly meeting over it (part 2).
  const head = new THREE.SphereGeometry(0.0095, 6, 4);
  head.translate(0, 0.022, 0.032);
  parts.push(creaturePart(head, { part: 2, color: COL.head, bottomColor: COL.under }));
  for (const s of [-1, 1]) {
    const eye = new THREE.SphereGeometry(0.0075, 6, 4);
    eye.scale(0.75, 1.05, 1.15).translate(s * 0.0072, 0.025, 0.034);
    parts.push(creaturePart(eye, { part: 2, pivot: [0, 0.022, 0.032], color: COL.eye, bottomColor: COL.eye }));
  }

  // Wings: four thin plates laid out flat from the thorax's shoulders — an
  // anisoptere carries them spread even in the hover — the fore pair longer
  // and set clearly ahead of the hind, a gap of wing between the pairs so
  // all four read. Each pivots at its root (parts 3 and 4).
  // Each is a thin slab (seen from above and below alike), its length out
  // across the body: the span, root to tip, is a little over the body's
  // length, the fore pair longer and narrower than the hind.
  const wing = (s, fore) => {
    const l = fore ? 0.07 : 0.064, w = fore ? 0.016 : 0.02;
    const zc = fore ? 0.012 : -0.012;
    const g = new THREE.BoxGeometry(l, 0.0015, w);
    g.translate(s * (0.011 + l / 2), 0.026, zc);
    parts.push(creaturePart(g, { part: fore ? 3 : 4, pivot: [s * 0.011, 0.026, zc], color: COL.wing, bottomColor: COL.wing }));
  };
  for (const s of [-1, 1]) { wing(s, true); wing(s, false); }

  return { geometry: mergeCreatureParts(parts) };
}

// ---------------------------------------------------------------------------
// Animation, in the vertex shader (see makeCreatureMaterial for the inputs).
// aAnim: x idle phase, y gait 0..1, z mood 0..1 (alarm), w stride (rad).
// ---------------------------------------------------------------------------
export const DRAGONFLY_GLSL = `
  float gait = aAnim.y, mood = aAnim.z;
  // The four wings beat about their roots, near enough in phase — an
  // anisoptere's stroke, the hind pair lagging a fraction — each side
  // swung by its own sign of the root, so they rise and fall together.
  // The clock is uTime, not stride: the wings never stop, least of all
  // hanging in the hover. Alarmed, the stroke deepens.
  float side = aPivot.x > 0.0 ? 1.0 : -1.0;
  if (aPart > 2.5 && aPart < 4.5) {
    float hind = aPart > 3.5 ? -0.7 : 0.0;
    float beat = sin(uTime * 55.0 + aAnim.x + hind);
    transformed = wlRotZ(transformed, aPivot, side * beat * (0.55 + 0.16 * mood));
  } else if (aPart > 0.5 && aPart < 1.5) {
    // Abdomen: carried up a touch in the hover, dipped into the darts,
    // swaying slowly at rest.
    float sway = sin(uTime * 1.4 + aAnim.x) * 0.06 * (1.0 - gait);
    transformed = wlRotX(transformed, aPivot, 0.16 * (1.0 - gait) - 0.1 * gait + sway);
  } else if (aPart > 1.5 && aPart < 2.5) {
    // Head: a slow look round while it hangs, steady when it flies.
    transformed = wlRotY(transformed, aPivot, sin(uTime * 0.9 + aAnim.x) * 0.3 * (1.0 - gait));
  }
  // Whole body: pitch into the darts, an alarmed shiver, the hover bob —
  // one rigid rotation about the thorax, so every part keeps its joint.
  transformed = wlRotX(transformed, vec3(0.0, 0.02, 0.004),
    0.2 * gait + sin(uTime * 38.0) * 0.025 * mood);
  transformed.y += sin(uTime * 2.1 + aAnim.x) * 0.006 * (1.0 - gait);
`;

// ---------------------------------------------------------------------------
// Behaviour: no hooks. `continuous: true` keeps it moving — the moment the
// machine would idle it, it is handed straight back to MOVE — and the
// flyFree motion owns where it actually goes.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// The species definition. Every key is documented in WILDLIFE.md; anything
// left out takes wildlife.js's DEFAULTS, and a map may override any of it.
// `fly` is the flyFree motion's band-and-zigzag knobs (documented there).
// ---------------------------------------------------------------------------
export const DRAGONFLY = {
  id: 'dragonfly',
  motion: 'flyFree',
  count: 6,
  habitat: {
    // Over the pool and the foot of the falls — the planned-roster line's
    // `within: { pool: 6 }`: the water and its rim, on the wing above it.
    within: { pool: 6 },
    // Never an anchor on the cliff's face: its eight would graze the rock.
    slope: [0, 0.8],
  },
  spacing: 2.5,
  homeRange: 3.5,
  activeRadius: 30,                 // a 19 cm dragonfly is a couple of pixels past this
  fear: { radius: 2.5, runRadius: 4.5, calmDistance: 8, hideFor: null },
  speed: { walk: 2.6, flee: 4.5, turn: 10 },   // quick darts; a real one doubles this
  strideRate: 70,                   // the body's stride read; the wings run on uTime
  body: {
    yawOffset: 0, alignToGround: false,
    lift: 0, sinkDepth: 0, sinkTime: 0.3, scale: [0.8, 0.95],
  },
  fly: { low: 0.35, high: 2.2, hover: [0.6, 1.8], hoverR: 0.2, hoverRate: 1.3, zigzag: 0.38, zigFreq: 9, climb: 2.6 },
  timings: { idle: [0.2, 0.5], move: [2.5, 5], alert: 0.25 },
  build: buildDragonfly,
  animGLSL: DRAGONFLY_GLSL,
  metalness: 0.25,                  // the emperor's gloss, picked up by makeCreatureMaterial
  roughness: 0.5,
  // Individual variation: a little lighter or darker, a breath bluer or more
  // teal (the instance colour multiplies the vertex colours).
  tint(rng, c) {
    const k = 0.85 + rng() * 0.3, b = (rng() - 0.5) * 0.14;
    c.setRGB(k * (1 - b * 0.4), k * (1 + b * 0.2), k * (1 + b));
  },
  continuous: true,
};
