// wildlifeButterfly.js — monarchs (Danaus plexippus), the orange-and-black
// butterflies of the island's clearings: a lazy, jinking flutter from bloom
// to bloom, wings clapped high over the back at each stroke, a pause to sip
// with the wings half open. A species module for wildlife.js (WILDLIFE.md
// walks through the shape via wildlifeCrab.js) — the third `flyFree`
// species, after the dragonflies and the hummingbirds: same motion, slower
// darts, wider jinks, and the hummingbirds' trap-line over the flowers
// (wildlife.js's spotWander).
//
// Model: ~140 triangles, flat-shaded, vertex-coloured, one merged geometry.
// Each wing is two flat prisms — a thin black one, and an orange one a
// little smaller but thicker — so the black margin shows round the orange
// from above and below alike, without z-fighting. Local frame: +Z is the
// front (head), +X its right, y = 0 the body's underside. Part ids read by
// BUTTERFLY_GLSL: 0 body, 2 antennae, 3 fore wings, 4 hind wings.
import * as THREE from 'three';
import { creaturePart, limbGeometry, mergeCreatureParts, spotWander } from './wildlife.js?v=20261001-pass8';

const COL = {
  body: 0x1a1512,
  orange: 0xe07a1c,      // the monarch's orange
  black: 0x17120f,       // its veins and margins
  antenna: 0x1a1512,
};

// ---------------------------------------------------------------------------
// Model.
// ---------------------------------------------------------------------------
export function buildButterfly() {
  const parts = [];
  const part = (g, id, color, pivot) =>
    parts.push(creaturePart(g, { part: id, pivot, color, bottomColor: color }));

  // Body: a slim dark thorax and abdomen, a bead of a head.
  part(limbGeometry([0, 0.006, -0.026], [0, 0.007, 0.012], 0.006, 0.005), 0, COL.body);
  part(new THREE.BoxGeometry(0.007, 0.007, 0.007).translate(0, 0.008, 0.016), 0, COL.body);
  // Antennae: two fine whips forward and up (part 2).
  for (const s of [-1, 1]) {
    part(limbGeometry([s * 0.002, 0.01, 0.018], [s * 0.009, 0.02, 0.036], 0.0015), 2, COL.antenna, [0, 0.01, 0.018]);
  }

  // A wing: a flat prism of `sides` sides (3 for the pointed fore wing, 5
  // for the rounded hind), radius r, centred at (cx, cz) and turned by rot;
  // black and thin, then orange, thicker and 78 % of the size.
  const wing = (s, id, sides, r, cx, cz, rot, root) => {
    for (const [col, k, h] of [[COL.black, 1, 0.0012], [COL.orange, 0.78, 0.0024]]) {
      const g = new THREE.CylinderGeometry(r * k, r * k, h, sides);
      g.rotateY(rot).scale(1, 1, 0.8).translate(s * cx, 0.007, cz);
      part(g, id, col, root);
    }
  };
  for (const s of [-1, 1]) {
    const root = [s * 0.003, 0.007, 0.0];
    wing(s, 3, 3, 0.03, 0.03, 0.01, s * 0.5, root);       // fore: long, pointed, swept
    wing(s, 4, 5, 0.022, 0.022, -0.014, 0.3, root);       // hind: rounded, behind
  }
  return { geometry: mergeCreatureParts(parts) };
}

// ---------------------------------------------------------------------------
// Animation, in the vertex shader (see makeCreatureMaterial for the inputs).
// aAnim: x idle phase, y gait 0..1, z mood 0..1 (alarm), w stride (rad).
// ---------------------------------------------------------------------------
export const BUTTERFLY_GLSL = `
  float gait = aAnim.y, mood = aAnim.z;
  float side = aPivot.x > 0.0 ? 1.0 : -1.0;
  // The stroke: wings clapped nearly shut over the back, then swept down
  // just past level — quicker in flight and alarm; at a bloom, a slow
  // open-and-close while it sips. The hind pair lags a hair.
  float rate = mix(5.0, 11.0, max(gait, mood));
  float lag = aPart > 3.5 ? -0.35 : 0.0;
  float st = 0.5 + 0.5 * sin(uTime * rate + aAnim.x + lag);
  float open = mix(0.15, 1.35, st) * mix(0.55, 1.0, max(gait, mood));
  if (aPart > 2.5 && aPart < 4.5) {
    transformed = wlRotZ(transformed, aPivot, side * (open - 0.2));
  } else if (aPart > 1.5 && aPart < 2.5) {
    transformed = wlRotX(transformed, aPivot, sin(uTime * 2.0 + aAnim.x) * 0.15);
  }
  // Each downstroke lifts the body: the flutter's bob.
  transformed.y += (1.0 - st) * 0.008 * max(gait, 0.4);
`;

// ---------------------------------------------------------------------------
// The species definition. Every key is documented in WILDLIFE.md; anything
// left out takes wildlife.js's DEFAULTS, and a map may override any of it.
// `fly` is the flyFree motion's band-and-zigzag knobs (documented there).
// ---------------------------------------------------------------------------
export const BUTTERFLY = {
  id: 'butterfly',
  motion: 'flyFree',
  count: 10,
  habitat: {
    // In the open undergrowth by the flowers — the same tufts the
    // hummingbirds work.
    soils: ['FOREST', 'DIRT', 'WET'],
    near: { flowers: 5, share: 1 },
  },
  spacing: 1.5,
  homeRange: 6,
  activeRadius: 26,
  fear: { radius: 1.8, runRadius: 3.5, calmDistance: 6, hideFor: null },
  speed: { walk: 1.1, flee: 2.4, turn: 7 },
  strideRate: 20,                    // the wings run on uTime
  body: {
    alignToGround: false,
    // About one and a half times life size (a real one spans 9–10 cm).
    scale: [1.6, 1.9],
  },
  // A lazy flutter: low, slow darts with wide jinks, long sips at a bloom.
  fly: { low: 0.3, high: 1.7, hover: [0.8, 2.4], hoverR: 0.1, hoverRate: 0.9, zigzag: 0.5, zigFreq: 6, climb: 2 },
  timings: { idle: [0.2, 0.5], move: [2, 5], alert: 0.1 },
  continuous: true,
  build: buildButterfly,
  animGLSL: BUTTERFLY_GLSL,
  // Some deeper, some paler orange (the instance colour multiplies).
  tint(rng, c) {
    const k = 0.88 + rng() * 0.24, w = (rng() - 0.5) * 0.12;
    c.setRGB(k * (1 + w * 0.3), k * (1 - w * 0.2), k * (1 - w));
  },
  needs: ['spots.flowers'],
  hooks: { pickWander: spotWander('flowers', { reach: 6, jitter: 0.5 }) },
};
