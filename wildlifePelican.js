// wildlifePelican.js — the cove's brown pelicans (Pelecanus occidentalis):
// a file of five cruising the open sea beyond the wade barrier, wings held
// on the long glides between slow flaps, the leader breaking off now and
// then into a plunge the whole line follows down. A species module for
// wildlife.js (WILDLIFE.md walks through the shape via wildlifeCrab.js) —
// the roster's planned "brown pelicans", the first `flock` species: the
// motion (the leader's loop, the file on its trail, the cascade dive) lives
// in wildlifeMotion.js; this file's one hook is the fish's never-idle tick.
//
// Behaviour: nothing here uses the engine's fear — the wade barrier keeps
// the player out of their sky, so the flock is never frightened and never
// lands. The tick only ever hands an IDLE back to MOVE.
//
// Model: ~180 triangles, flat-shaded, vertex-coloured, one merged geometry.
// Local frame: +Z is the front (bill, eyes), +X its right, y = 0 the belly —
// the air is a bird's ground. Part ids read by PELICAN_GLSL: 0 body,
// 1 neck + head, 2 bill + pouch, 3 eyes, 4 tail, 5/6 wings.
import * as THREE from 'three';
import { creaturePart, limbGeometry, mergeCreatureParts } from './wildlife.js?v=20261001-pass1';

const COL = {
  back: 0x4a3a2c,        // dark brown-grey of the back and mantle
  wing: 0x40332a,        // the long wings, a shade darker
  under: 0x2a221b,       // baked underside — the black-brown belly
  neck: 0x6e4a30,        // the chestnut hindneck
  head: 0xd9cfae,        // the pale yellow-white head
  bill: 0x9a9484,        // the long grey-ivory mandible
  pouch: 0x8a5a4a,       // the dusky gular pouch
  tail: 0x38302a,
  eye: 0x14100c,
};

// ---------------------------------------------------------------------------
// Model.
// ---------------------------------------------------------------------------
export function buildPelican() {
  const parts = [];
  const part = (g, id, color, bottom, pivot) =>
    parts.push(creaturePart(g, { part: id, pivot, color, bottomColor: bottom }));

  // Body: a fusiform ellipsoid, six-sided so the facets read as feathers,
  // its belly resting on y = 0.
  const body = new THREE.SphereGeometry(1, 6, 4);
  body.scale(0.085, 0.1, 0.26).translate(0, 0.115, -0.01);
  part(body, 0, COL.back, COL.under);

  // The neck up and forward, then the pale head (part 1: the GLSL turns it
  // a little on the glide).
  part(limbGeometry([0, 0.17, 0.2], [0, 0.26, 0.32], 0.045, 0.036), 1, COL.neck, COL.under);
  part(new THREE.BoxGeometry(0.055, 0.05, 0.095).translate(0, 0.265, 0.365), 1, COL.head, COL.head);

  // The bill: a long thin upper mandible and, slung tight under it, the
  // pouch — a deep short wedge from the base to near the tip (part 2).
  part(limbGeometry([0, 0.262, 0.4], [0, 0.248, 0.62], 0.016, 0.009), 2, COL.bill, COL.bill);
  part(limbGeometry([0, 0.244, 0.42], [0, 0.2, 0.55], 0.044, 0.016), 2, COL.pouch, COL.pouch);

  for (const s of [-1, 1]) {
    part(new THREE.BoxGeometry(0.011, 0.011, 0.011).translate(s * 0.024, 0.278, 0.375),
      3, COL.eye, COL.eye);
    // The wings: a broad inner blade and a swept outer one per side,
    // pivoted at the shoulder so the GLSL can beat, hold or fold the pair
    // (parts 5 and 6). The tip boxes lean back — a pelican's long wing.
    const id = s < 0 ? 5 : 6, pivot = [s * 0.075, 0.17, 0.03];
    part(new THREE.BoxGeometry(0.3, 0.011, 0.15).translate(s * 0.225, 0.175, -0.01),
      id, COL.wing, COL.under, pivot);
    part(new THREE.BoxGeometry(0.27, 0.009, 0.095)
      .rotateY(s * 0.3).rotateZ(s * 0.04)
      .translate(s * 0.49, 0.185, -0.05),
      id, COL.wing, COL.under, pivot);
  }

  // Tail: a short wedge sloping down off the rump (part 4).
  part(new THREE.BoxGeometry(0.085, 0.014, 0.13).rotateX(-0.12).translate(0, 0.125, -0.3),
    4, COL.tail, COL.tail);

  return { geometry: mergeCreatureParts(parts) };
}

// ---------------------------------------------------------------------------
// Animation, in the vertex shader (see makeCreatureMaterial for the inputs).
// aAnim: x idle phase, y gait 0..1, z mood 0..1, w stride (rad).
// ---------------------------------------------------------------------------
export const PELICAN_GLSL = `
  float gait = aAnim.y;
  // The plunge read: gait only reaches 1 when the flight speeds into the
  // dive — the whole body pitches onto its nose and the wings sweep back
  // into the fold.
  float fold = smoothstep(0.88, 1.0, gait);
  float side = aPivot.x > 0.0 ? 1.0 : -1.0;
  if (aPart > 4.5) {
    // The wings: slow deep beats in bursts (env), wings held out gliding
    // between them; folded back hard through the plunge.
    float env = max(0.0, sin(uTime * 0.55 + aAnim.x));
    float beat = sin(uTime * 6.5 + aAnim.x) * (0.05 + 0.5 * env * env);
    transformed = wlRotZ(transformed, aPivot, side * (0.05 + beat) * (1.0 - fold));
    transformed = wlRotY(transformed, aPivot, side * fold * 0.85);
  } else if (aPart > 0.5 && aPart < 1.5) {
    // Neck and head: a slow look round on the glide, steady in the dive.
    transformed = wlRotY(transformed, aPivot, sin(uTime * 0.7 + aAnim.x) * 0.2 * (1.0 - fold));
  }
  // Whole body: onto the nose through the plunge; a breath of bob otherwise.
  transformed = wlRotX(transformed, vec3(0.0, 0.12, 0.0),
    fold * 0.62 + sin(uTime * 1.1 + aAnim.x) * 0.025);
`;

// ---------------------------------------------------------------------------
// Behaviour hooks (the flock motion does the rest).
// ---------------------------------------------------------------------------
// Keep them flying: the moment the machine would idle a pelican, hand it
// straight back to MOVE — a fresh wander target inside its home water and a
// fresh timer (the flock motion ignores targets; the boids follow the
// leader's trail). This is the species' whole hook set.
function tick(a, sp, ctx, dt, api) {
  const S = ctx.STATE;
  if (a.state === S.IDLE) {
    api.defaultWander(a, sp);
    a.state = S.MOVE;
    a.timer = sp.rng.range(sp.def.timings.move);
  }
  return false;   // let the machine run on into MOVE this same frame
}

// ---------------------------------------------------------------------------
// The species definition. Every key is documented in WILDLIFE.md; anything
// left out takes wildlife.js's DEFAULTS, and a map may override any of it.
// `fly` is the flock motion's loop, band and plunge knobs (documented there).
// ---------------------------------------------------------------------------
export const PELICAN = {
  id: 'pelican',
  motion: 'flock',
  count: 5,
  habitat: {
    // Wherever the sea's water is — the one thing the keys cannot say.
    test: (x, z, layout) => {
      const w = layout.waterAt ? layout.waterAt(x, z) : null;
      return !!w && w.kind === 'sea';
    },
  },
  spacing: 8,
  homeRange: 6,                     // the tick's retargets; the boids ignore it
  activeRadius: 110,                // the show is visible from the whole beach
  fear: { radius: 0 },              // not frightened: the wade barrier keeps
                                    // the player out of their sky
  speed: { walk: 5.5, flee: 14, turn: 1.6 },   // slow plané; gait ~0.6 at
                                               // cruise, 1 in the plunge and
                                               // the catch-up burst
  strideRate: 18,
  body: {
    yawOffset: 0, alignToGround: false,
    // Roughly one and a half times life size: the file has to read from the
    // beach, forty or fifty metres off the flock.
    lift: 0, sinkDepth: 0, sinkTime: 0.4, scale: [1.1, 1.4],
  },
  fly: { loopX: 30, loopZ: 11, low: 3.2, high: 5.2, delay: 1.15, diveEvery: [16, 34], diveDur: 6.5 },
  timings: { idle: [0.2, 0.6], move: [8, 16], alert: 0 },
  build: buildPelican,
  animGLSL: PELICAN_GLSL,
  // Individual variation: a little lighter or darker, a breath warmer or
  // greyer (the instance colour multiplies the vertex colours).
  tint(rng, c) {
    const k = 0.85 + rng() * 0.3, w = (rng() - 0.5) * 0.08;
    c.setRGB(k * (1 + w * 0.4), k * (1 + w * 0.2), k * (1 - w));
  },
  hooks: { tick },
};