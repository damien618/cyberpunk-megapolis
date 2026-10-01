// wildlifeEagle.js — the ridges' bald eagle (Haliaeetus leucocephalus): the
// white head and tail, the dark brown body, riding slow banked circles high
// over the side ridges and the cliff, now and then a long glide to a fresh
// circle the other way round. A species module for wildlife.js (WILDLIFE.md
// walks through the shape via wildlifeCrab.js) — the roster's planned "bald
// eagle", the first `glide` species: the motion (the drifting centre, the
// bank, the re-centre glide) lives in wildlifeMotion.js; this file's one
// hook is the pelican's never-idle tick.
//
// Behaviour: nothing here uses the engine's fear — it soars far above you,
// so it is never frightened and never lands. The tick only ever hands an
// IDLE back to MOVE.
//
// Model: ~290 triangles, flat-shaded, vertex-coloured, one merged geometry.
// Local frame: +Z is the front (bill, eyes), +X its right, y = 0 the belly —
// the air is a bird's ground. Part ids read by EAGLE_GLSL: 0 body,
// 1 neck + head, 2 bill, 3 eyes, 4 tail, 5/6 wings.
import * as THREE from 'three';
import { creaturePart, limbGeometry, mergeCreatureParts } from './wildlife.js?v=20261001-pass6';

const COL = {
  body: 0x3b2a1b,        // the dark brown of the body and mantle
  wing: 0x322418,        // the long broad wings, a shade darker
  tip: 0x241a11,         // the fingered primaries at the wing's end
  under: 0x1e150e,       // baked underside — seats it against the sky's floor
  head: 0xece5d2,        // the white head and neck — the species' mark
  tail: 0xe4ddc8,        // the white tail fan
  bill: 0xd9a437,        // the heavy yellow bill
  eye: 0x17110b,
};

// ---------------------------------------------------------------------------
// Model.
// ---------------------------------------------------------------------------
export function buildEagle() {
  const parts = [];
  const part = (g, id, color, bottom, pivot) =>
    parts.push(creaturePart(g, { part: id, pivot, color, bottomColor: bottom }));

  // Body: a fusiform ellipsoid, six-sided so the facets read as feathers,
  // its belly resting on y = 0.
  const body = new THREE.SphereGeometry(1, 6, 4);
  body.scale(0.075, 0.095, 0.23).translate(0, 0.1, -0.01);
  part(body, 0, COL.body, COL.under);

  // The neck up and forward, then the white head — the reason for the name
  // (part 1: the GLSL turns it slowly, scanning the ground below).
  part(limbGeometry([0, 0.14, 0.15], [0, 0.21, 0.24], 0.048, 0.038), 1, COL.head, COL.head);
  part(new THREE.BoxGeometry(0.052, 0.048, 0.09).translate(0, 0.222, 0.275), 1, COL.head, COL.head);

  // The bill: a heavy yellow upper mandible with the hooked tip bent down
  // over it (part 2).
  part(limbGeometry([0, 0.228, 0.31], [0, 0.216, 0.395], 0.015, 0.007), 2, COL.bill, COL.bill);
  part(limbGeometry([0, 0.217, 0.39], [0, 0.199, 0.407], 0.008, 0.004), 2, COL.bill, COL.bill);

  for (const s of [-1, 1]) {
    part(new THREE.BoxGeometry(0.01, 0.01, 0.01).translate(s * 0.024, 0.237, 0.283),
      3, COL.eye, COL.eye);
    // The wings: a broad inner blade, a swept outer one and the spread
    // "fingers" of primaries at the end — a soaring eagle's hand. All one
    // part per side (5 and 6), pivoted at the shoulder so the GLSL holds
    // them out flat, a shallow dihedral, and bursts into slow beats.
    const id = s < 0 ? 5 : 6, pivot = [s * 0.07, 0.155, 0.02];
    part(new THREE.BoxGeometry(0.38, 0.012, 0.19).translate(s * 0.24, 0.16, 0.015),
      id, COL.wing, COL.under, pivot);
    part(new THREE.BoxGeometry(0.34, 0.01, 0.13)
      .rotateY(s * 0.3).rotateZ(s * 0.03)
      .translate(s * 0.55, 0.165, -0.035),
      id, COL.wing, COL.under, pivot);
    for (let f = 0; f < 3; f++) {
      part(new THREE.BoxGeometry(0.16, 0.008, 0.05)
        .rotateY(s * (0.5 + f * 0.22)).rotateZ(s * 0.05)
        .translate(s * (0.67 + f * 0.035), 0.166, -0.05 - f * 0.035),
        id, COL.tip, COL.under, pivot);
    }
  }

  // The tail: the white fan — a centre blade and two spread sides, kept low
  // and narrow so it reads as a fan, not a plate (part 4).
  part(new THREE.BoxGeometry(0.11, 0.011, 0.17).rotateX(-0.14).translate(0, 0.105, -0.28),
    4, COL.tail, COL.tail);
  for (const s of [-1, 1]) {
    part(new THREE.BoxGeometry(0.05, 0.01, 0.15)
      .rotateY(s * 0.28).rotateX(-0.14)
      .translate(s * 0.052, 0.103, -0.27),
      4, COL.tail, COL.tail);
  }

  return { geometry: mergeCreatureParts(parts) };
}

// ---------------------------------------------------------------------------
// Animation, in the vertex shader (see makeCreatureMaterial for the inputs).
// aAnim: x idle phase, y gait 0..1, z mood 0..1, w stride (rad).
// The bank itself is NOT here: it is the engine's a.roll, the whole instance
// leaning into the turn.
// ---------------------------------------------------------------------------
export const EAGLE_GLSL = `
  float side = aPivot.x > 0.0 ? 1.0 : -1.0;
  if (aPart > 4.5) {
    // The wings: held out flat with a shallow dihedral; rare, slow, shallow
    // flap bursts — an eagle soars, it does not row.
    float env = max(0.0, sin(uTime * 0.21 + aAnim.x));
    float beat = sin(uTime * 3.1 + aAnim.x) * 0.15 * env * env;
    transformed = wlRotZ(transformed, aPivot, side * (0.055 + beat));
  } else if (aPart > 0.5 && aPart < 1.5) {
    // The white head: a slow scan of the ground below.
    transformed = wlRotY(transformed, aPivot, sin(uTime * 0.5 + aAnim.x * 2.7) * 0.35);
  } else if (aPart > 3.5 && aPart < 4.5) {
    // The white tail: a slow breathe with the air.
    transformed = wlRotX(transformed, aPivot, sin(uTime * 0.8 + aAnim.x) * 0.05);
  }
  // Whole body: a slow breath of pitch.
  transformed = wlRotX(transformed, vec3(0.0, 0.1, 0.0),
    sin(uTime * 0.9 + aAnim.x) * 0.03);
`;

// ---------------------------------------------------------------------------
// Behaviour: no hooks. `continuous: true` keeps it moving — the moment the
// machine would idle it, it is handed straight back to MOVE — and the
// glide motion owns where it actually goes.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// The species definition. Every key is documented in WILDLIFE.md; anything
// left out takes wildlife.js's DEFAULTS, and a map may override any of it.
// `fly` is the glide motion's circle, band, drift and bank knobs (documented
// there).
// ---------------------------------------------------------------------------
export const EAGLE = {
  id: 'eagle',
  motion: 'glide',
  count: 1,
  habitat: {
    // The high ground — the ridge flanks and the top of the cliff. The keys
    // cannot say "altitude", so a test does (the pelican's `test` shape).
    test: (x, z, layout) => layout.terrainHeight(x, z) >= 12,
  },
  spacing: 40,
  homeRange: 26,                    // the circle's centre drifts and
                                    // re-centres inside this
  activeRadius: 220,                // the show reads from anywhere in the cove;
                                    // wide enough that its first swing onto
                                    // the circle never puts it to sleep
  fear: { radius: 0 },              // not frightened: it soars far above you
  speed: { walk: 4.5, flee: 9, turn: 0.9 },     // the soaring pace; gait 0.5
  strideRate: 2,                    // no legs to speak of; the GLSL ignores it
  body: {
    yawOffset: 0, alignToGround: false,
    // About life size — a 2.1–2.4 m span, a big female's — so it sits
    // right beside the pelicans; it reads from the beach as a dark cross.
    lift: 0, sinkDepth: 0, sinkTime: 0.4, scale: [1.3, 1.5],
  },
  fly: { circleR: [11, 16], low: 18, high: 32, drift: 0.18, recenter: [38, 80], bank: 2.2 },
  timings: { idle: [0.2, 0.6], move: [24, 48], alert: 0 },
  build: buildEagle,
  animGLSL: EAGLE_GLSL,
  // Individual variation: a little lighter or darker, a breath warmer or
  // greyer (the instance colour multiplies the vertex colours).
  tint(rng, c) {
    const k = 0.88 + rng() * 0.22, w = (rng() - 0.5) * 0.06;
    c.setRGB(k * (1 + w * 0.5), k * (1 + w * 0.2), k * (1 - w));
  },
  continuous: true,
};