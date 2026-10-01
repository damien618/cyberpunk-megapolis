// wildlifeSoarer.js — the cove's two soaring birds besides the eagle: the
// western gull (Larus occidentalis), white with a slate back and black
// wingtips, wheeling low along the shore; and the common raven (Corvus
// corax), all black, a pair riding the updraft off the cliff. Both are
// `glide` species (the eagle's motion), so — like wildlifeLizard.js's two
// lizards — they share one model builder, one GLSL and no hooks: a palette
// and a set of proportions each.
//
// Model: ~200 triangles each, flat-shaded, vertex-coloured, one merged
// geometry. Local frame: +Z is the front (bill), +X its right, y = 0 the
// belly — the air is a bird's ground. Part ids read by SOARER_GLSL: 0 body,
// 1 head + bill, 3 eyes, 4 tail, 5/6 wings left/right.
import * as THREE from 'three';
import { creaturePart, limbGeometry, mergeCreatureParts } from './wildlife.js?v=20261001-pass6';

const GULL_COL = {
  body: 0xf2f1ec, belly: 0xe6e5e0, head: 0xf6f5f0,
  mantle: 0x4f5459,      // the western gull's dark slate back
  wing: 0x5a5f65,        // and upper wing
  hand: 0x5a5f65,        // the hand, grey as the arm…
  tip: 0x17171a,         // …to its black tip
  tail: 0xf0efea,
  bill: 0xe8c23a,        // yellow
  eye: 0x101010,
};
const RAVEN_COL = {
  body: 0x18181d, belly: 0x111114, head: 0x1b1b21,
  mantle: 0x1d1d24,      // a blue-black sheen on the back
  wing: 0x1a1a20,
  hand: 0x121216,
  tip: 0x121216,
  tail: 0x151519,
  bill: 0x0c0c0e,
  eye: 0x050505,
};

// Proportions, metres before the definition's scale.
const Dims = {
  //        body half-sizes       head  bill: from z, to z, base, tip   inner wing: width, chord  hand: width, chord, sweep  tail
  gull:  { bx: 0.068, by: 0.066, bz: 0.2, hr: 0.044, b0: 0.235, b1: 0.31, bw0: 0.017, bw1: 0.009,
           iw: 0.3, ic: 0.14, hw: 0.34, hc: 0.085, sweep: 0.3, tip: 0.14, tail: 'square', tl: 0.12, tw: 0.12 },
  raven: { bx: 0.072, by: 0.072, bz: 0.21, hr: 0.046, b0: 0.23, b1: 0.305, bw0: 0.03, bw1: 0.012,
           iw: 0.27, ic: 0.17, hw: 0.28, hc: 0.13, sweep: 0.14, tip: 0, tail: 'wedge', tl: 0.17, tw: 0.15 },
};

// ---------------------------------------------------------------------------
// Model.
// ---------------------------------------------------------------------------
function build(C, d) {
  const parts = [];
  const part = (g, id, color, bottom, pivot) =>
    parts.push(creaturePart(g, { part: id, pivot, color, bottomColor: bottom }));

  // Body, and the darker mantle laid over its back.
  const body = new THREE.SphereGeometry(1, 7, 5);
  body.scale(d.bx, d.by, d.bz).translate(0, d.by, 0);
  part(body, 0, C.body, C.belly);
  const mantle = new THREE.SphereGeometry(1, 6, 3, 0, Math.PI * 2, 0, Math.PI / 2);
  mantle.scale(d.bx * 0.86, d.by * 0.55, d.bz * 0.8).translate(0, d.by * 1.25, -0.01);
  part(mantle, 0, C.mantle, C.mantle);

  // Head and bill (part 1, about the neck).
  const neck = [0, d.by * 1.3, d.bz * 0.75];
  const head = new THREE.SphereGeometry(d.hr, 6, 5);
  head.scale(1, 0.95, 1.15).translate(0, d.by * 1.45, d.bz * 0.98);
  part(head, 1, C.head, C.head, neck);
  part(limbGeometry([0, d.by * 1.42, d.b0], [0, d.by * 1.3, d.b1], d.bw0, d.bw1), 1, C.bill, C.bill, neck);
  for (const s of [-1, 1]) {
    part(new THREE.BoxGeometry(0.009, 0.009, 0.009).translate(s * d.hr * 0.72, d.by * 1.55, d.bz * 1.05),
      3, C.eye, C.eye, neck);
  }

  // Wings: the inner blade from the shoulder and the hand swept back from
  // its end, pivoted at the shoulder (parts 5 and 6).
  for (const s of [-1, 1]) {
    const id = s < 0 ? 5 : 6, pivot = [s * d.bx, d.by * 1.25, 0.03];
    const x0 = d.bx * 0.9;
    part(new THREE.BoxGeometry(d.iw, 0.012, d.ic).translate(s * (x0 + d.iw / 2), d.by * 1.25, 0.0),
      id, C.wing, C.belly, pivot);
    // The hand in two lengths: grey, then the black tip (d.tip of it).
    const hand = (from, len, color) => part(new THREE.BoxGeometry(len, 0.01, d.hc)
      .translate(s * (from + len / 2), 0, 0).rotateY(s * d.sweep).rotateZ(s * 0.05)
      .translate(s * (x0 + d.iw - 0.02), d.by * 1.27, -0.01),
      id, color, color, pivot);
    hand(0, d.hw - d.tip, C.hand);
    if (d.tip > 0) hand(d.hw - d.tip, d.tip, C.tip);
  }

  // Tail (part 4): a gull's square fan, a raven's wedge.
  const rump = [0, d.by * 1.05, -d.bz * 0.9];
  let tail;
  if (d.tail === 'wedge') {
    tail = new THREE.CylinderGeometry(d.tw / 2, d.tw / 2, 0.01, 4);
    tail.scale(1, 1, d.tl / d.tw).translate(0, 0, -d.tl / 2);
  } else {
    tail = new THREE.BoxGeometry(d.tw, 0.01, d.tl).translate(0, 0, -d.tl / 2);
  }
  tail.translate(...rump);
  part(tail, 4, C.tail, C.tail, rump);

  return { geometry: mergeCreatureParts(parts) };
}
export const buildGull = () => build(GULL_COL, Dims.gull);
export const buildRaven = () => build(RAVEN_COL, Dims.raven);

// ---------------------------------------------------------------------------
// Animation, in the vertex shader (see makeCreatureMaterial for the inputs).
// aAnim: x idle phase, y gait 0..1, z mood 0..1, w stride (rad).
// The bank is the glide motion's a.roll, applied to the whole instance.
// ---------------------------------------------------------------------------
export const SOARER_GLSL = `
  float side = aPivot.x > 0.0 ? 1.0 : -1.0;
  if (aPart > 4.5) {
    // Wings: held out on the soar, a slight dihedral, and every so often
    // a burst of deep beats (env) to climb back up the wind.
    float env = pow(max(0.0, sin(uTime * 0.37 + aAnim.x * 1.9)), 3.0);
    float beat = sin(uTime * 7.5 + aAnim.x) * 0.55 * env;
    transformed = wlRotZ(transformed, aPivot, side * (0.06 + beat));
  } else if (aPart > 3.5 && aPart < 4.5) {
    // Tail: twisted a little to steer, slowly.
    transformed = wlRotZ(transformed, aPivot, sin(uTime * 0.6 + aAnim.x) * 0.12);
  } else if (aPart > 0.5 && aPart < 1.5) {
    // Head: a slow look down and about.
    transformed = wlRotY(transformed, aPivot, sin(uTime * 0.5 + aAnim.x) * 0.35);
  }
`;

// ---------------------------------------------------------------------------
// The species definitions. Every key is documented in WILDLIFE.md; anything
// left out takes wildlife.js's DEFAULTS, and a map may override any of it.
// `fly` is the glide motion's circle, band, drift and bank knobs.
// ---------------------------------------------------------------------------
export const GULL = {
  id: 'gull',
  motion: 'glide',
  count: 4,
  habitat: {
    // Over the shore: the surf, the beach, the first of the water.
    test: (x, z, layout) => { const d = layout.shoreDistance(x, z); return d > -14 && d < 6; },
  },
  spacing: 10,
  homeRange: 22,                     // the centre wanders along the shore
  activeRadius: 120,
  fear: { radius: 0 },
  speed: { walk: 5, flee: 9, turn: 2 },
  strideRate: 2,
  body: {
    alignToGround: false,
    // Life size: a 1.4 m span.
    scale: [0.95, 1.05],
  },
  // Low, tight, quick circles over the surf, banked hard.
  fly: { circleR: [7, 12], low: 5, high: 10, drift: 0.5, recenter: [14, 30], bank: 2.6 },
  timings: { idle: [0.2, 0.6], move: [20, 40], alert: 0 },
  continuous: true,
  build: buildGull,
  animGLSL: SOARER_GLSL,
  tint(rng, c) { const k = 0.94 + rng() * 0.08; c.setRGB(k, k, k); },
  needs: ['shoreDistance'],
};

export const RAVEN = {
  ...GULL,
  id: 'raven',
  count: 2,
  habitat: {
    // The high ground, as the eagle's: the cliff and the ridge flanks.
    test: (x, z, layout) => layout.terrainHeight(x, z) >= 8,
  },
  spacing: 6,                        // a pair, flying together
  homeRange: 18,
  activeRadius: 160,
  speed: { walk: 5.5, flee: 9, turn: 2 },
  body: { alignToGround: false, scale: [1.0, 1.1] },   // life size: 1.2–1.35 m span
  // Over the cliff's updraft: higher, wider, the circles crossing.
  fly: { circleR: [8, 13], low: 10, high: 20, drift: 0.35, recenter: [18, 36], bank: 2.4 },
  build: buildRaven,
  tint(rng, c) { const k = 0.9 + rng() * 0.2; c.setRGB(k, k, k * 1.04); },
  needs: [],
};
