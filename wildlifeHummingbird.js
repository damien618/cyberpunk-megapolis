// wildlifeHummingbird.js — Allen's hummingbird (Selasphorus sasin) of the
// cove's clearings and forest edge: minuscule, emerald above, cinnamon-rufous
// on the belly and tail, a long straight bill. A species module for
// wildlife.js (WILDLIFE.md walks through the shape via wildlifeCrab.js) —
// the roster's planned "hummingbirds", the second `flyFree` species: the
// motion (hover at an anchor, fast darts to the next, inside an altitude
// band) was written for the dragonfly and needs nothing new.
//
// Behaviour: hangs at a bloom — body pitched up on its breast, bill down
// into the flower, wings a blur — then darts off to the nearest tuft when
// the hover runs out. Skittish but back at once: one hard dash sideways at
// your coming, and straight back to the nectar (hideFor is null — a
// hummingbird never hides). Its one hook is the dragonfly's trick, pointed
// at the flowers: a tick that never lets the machine land one, and picks
// the nearest tuft (layout.spots.flowers, the vegetation's scatter) as the
// next anchor.
//
// Model: ~130 triangles, flat-shaded, vertex-coloured, one merged geometry.
// Local frame: +Z is the front (bill), +X its right, y ≈ 0 the belly line —
// the air is a hummingbird's ground. Part ids read by HUMMINGBIRD_GLSL:
// 0 torso, 1 head + throat + bill, 3 tail, 4 wings.
import * as THREE from 'three';
import { creaturePart, mergeCreatureParts } from './wildlife.js?v=20261001-pass2';

const COL = {
  back: 0x2f9e5f,        // the emerald of the crown and back
  under: 0x8a4426,       // baked underside — seats it against the leaves
  head: 0x2c8f56,        // the head, a shade duller than the back
  throat: 0xb0542e,      // the male's bronze-copper gorget
  bill: 0x161616,        // the long straight needle
  tail: 0xc26034,        // the rufous tail
  tailTip: 0x6a3520,     // its dark underside (baked shadow)
  wing: 0xa9764e,        // the dusky blur of the beat
};

// ---------------------------------------------------------------------------
// Model.
// ---------------------------------------------------------------------------
export function buildHummingbird() {
  const parts = [];
  const body = (g, color, bottom = COL.under) =>
    parts.push(creaturePart(g, { part: 0, color, bottomColor: bottom }));

  // Torso: a small six-sided blob, nose up a hair — the hover posture is
  // pitched well past this, at the flower, in the GLSL. Faces turned down
  // take the cinnamon belly (Allen's rufous flanks), the rest the emerald.
  const torso = new THREE.SphereGeometry(0.016, 6, 4);
  torso.rotateX(-0.1).scale(0.75, 0.8, 1.3).translate(0, 0.018, 0.002);
  body(torso, COL.back, 0xc4653a);

  // Head: a small ball with the copper gorget wrapped under the front, and
  // the bill — the long straight needle that reads "hummingbird" at any
  // distance. All one part, hinged at the neck so the GLSL can look round.
  const neck = [0, 0.024, 0.012];
  const head = new THREE.SphereGeometry(0.0095, 6, 4);
  head.translate(0, 0.031, 0.024);
  parts.push(creaturePart(head, { part: 1, pivot: neck, color: COL.head, bottomColor: COL.under }));
  const throat = new THREE.SphereGeometry(0.0068, 6, 3);
  throat.scale(1, 0.8, 0.9).translate(0, 0.0275, 0.031);
  parts.push(creaturePart(throat, { part: 1, pivot: neck, color: COL.throat, bottomColor: COL.throat }));
  const bill = new THREE.CylinderGeometry(0.0011, 0.0027, 0.034, 5, 1, true);
  bill.rotateX(Math.PI / 2).translate(0, 0.0315, 0.055);
  parts.push(creaturePart(bill, { part: 1, pivot: neck, color: COL.bill, bottomColor: COL.bill }));

  // Tail: a flattened fan carrying back and a little down, rufous with the
  // dark underside (the baked shadow that keeps it from floating).
  const tail = new THREE.CylinderGeometry(0.0035, 0.011, 0.03, 4, 1, true);
  tail.scale(1.25, 1, 0.35).rotateX(-Math.PI / 2 - 0.3).translate(0, 0.02, -0.03);
  parts.push(creaturePart(tail, { part: 3, pivot: [0, 0.022, -0.018], color: COL.tail, bottomColor: COL.tailTip }));

  // Wings: one pair of long, narrow blades off the shoulders — unlike the
  // dragonfly's four — hinged at the root for the GLSL's blur of a stroke.
  // The blade tapers and sweeps like the feather it stands in for: pinched
  // at the root, widest at the mid, a point at the tip — no plank read.
  const wingBlade = (s) => {
    const P = [                              // the outline, root → tip
      [0.002, -0.003], [0.026, 0.004], [0.05, -0.006], [0.026, -0.008], [0.002, -0.005],
    ].map(([x, z]) => [s * x, 0, z]);
    const idx = s > 0 ? [0, 1, 2, 0, 2, 3, 0, 3, 4] : [0, 2, 1, 0, 3, 2, 0, 4, 3];
    const v = new Float32Array(idx.length * 3);
    idx.forEach((pi, i) => { v[i * 3] = P[pi][0]; v[i * 3 + 1] = P[pi][1]; v[i * 3 + 2] = P[pi][2]; });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(v, 3));
    g.computeVertexNormals();
    g.translate(s * 0.006, 0.028, 0.002);
    return g;
  };
  const wing = (s) => {
    parts.push(creaturePart(wingBlade(s), { part: 4, pivot: [s * 0.006, 0.028, 0.002], color: COL.wing, bottomColor: COL.wing }));
  };
  wing(-1); wing(1);

  return { geometry: mergeCreatureParts(parts) };
}

// ---------------------------------------------------------------------------
// Animation, in the vertex shader (see makeCreatureMaterial for the inputs).
// aAnim: x idle phase, y gait 0..1, z mood 0..1 (alarm), w stride (rad).
// ---------------------------------------------------------------------------
export const HUMMINGBIRD_GLSL = `
  float gait = aAnim.y, mood = aAnim.z;
  // The wings: one pair, beating about the shoulder on the clock (uTime, not
  // stride — they never stop, least of all hanging at the bloom), the stroke
  // huge and deepening with alarm. The quarter-turn of pitch as the wing
  // sweeps is the figure-of-eight read.
  float side = aPivot.x > 0.0 ? 1.0 : -1.0;
  if (aPart > 3.5) {
    float beat = sin(uTime * 52.0 + aAnim.x);
    transformed = wlRotZ(transformed, aPivot, side * beat * (0.85 + 0.25 * mood));
    transformed = wlRotX(transformed, aPivot, side * cos(uTime * 52.0 + aAnim.x) * 0.18);
  } else if (aPart > 0.5 && aPart < 1.5) {
    // Head: a slow look round while it hangs at the flower, steady on the
    // darts — the bill reads where the head points.
    transformed = wlRotY(transformed, aPivot, sin(uTime * 0.9 + aAnim.x) * 0.35 * (1.0 - gait));
  } else if (aPart > 2.5 && aPart < 3.5) {
    // Tail: cocked a touch in the hover, pressed level and fanned into the
    // dash when alarmed.
    transformed = wlRotX(transformed, aPivot, 0.25 * (1.0 - gait) - 0.15 * mood);
  }
  // Whole body: the hummingbird's hang — up on its breast, bill down into
  // the flower — levelling out for the darts; an alarmed shiver; the bob.
  // One rigid rotation about the torso, so every part keeps its joint.
  transformed = wlRotX(transformed, vec3(0.0, 0.018, 0.002),
    0.5 * (1.0 - gait) - 0.12 * gait + sin(uTime * 38.0) * 0.03 * mood);
  transformed.y += sin(uTime * 2.1 + aAnim.x) * 0.005 * (1.0 - gait);
`;

// ---------------------------------------------------------------------------
// Behaviour hooks (the flyFree motion does the rest).
// ---------------------------------------------------------------------------
// How far a tuft may sit from the bird it feeds — the reach the tick asks
// the flower index over. Beyond it, the default wander takes the frame.
const FLOWER_REACH = 4.5;

// Keep them airborne and on the nectar: the moment the machine would land
// one, hand it straight back to MOVE — the next bloom as the target, a fresh
// timer. (This is the species' whole hook set; the flyFree motion owns
// where the flight actually goes.) The stop is sided at random and a little
// short of the tuft's centre, so two birds rarely queue on one bloom.
// The round is a trap-line: a tuft farther than homeRange from home is
// passed over for the nearest tuft at home, so a day of darts works the
// bird's own flowers instead of walking it across the valley.
function tick(a, sp, ctx, dt, api) {
  const S = ctx.STATE;
  if (a.state === S.IDLE) {
    const F = ctx.layout.spots.flowers;
    let f = F?.nearest(a.x, a.z, FLOWER_REACH).spot;
    if (f && Math.hypot(f.x - a.home.x, f.z - a.home.z) > sp.def.homeRange)
      f = F.nearest(a.home.x, a.home.z, FLOWER_REACH).spot;
    if (f) api.setTarget(a, sp, f.x + (sp.rng() - 0.5) * 0.7, f.z + (sp.rng() - 0.5) * 0.7);
    else api.defaultWander(a, sp);
    a.state = S.MOVE;
    a.timer = sp.rng.range(sp.def.timings.move);
    // A stale hover can expire this same frame (the motion would report
    // "arrived" and bounce the machine straight back to IDLE for another
    // pause). Re-arm the dart, so the flight leaves for the bloom at once.
    a.flyPhase = 1; a.dartOn = false;
  }
  return false;   // let the machine run on into MOVE this same frame
}

// ---------------------------------------------------------------------------
// The species definition. Every key is documented in WILDLIFE.md; anything
// left out takes wildlife.js's DEFAULTS, and a map may override any of it.
// `fly` is the flyFree motion's band-and-zigzag knobs (documented there).
// ---------------------------------------------------------------------------
export const HUMMINGBIRD = {
  id: 'hummingbird',
  motion: 'flyFree',
  count: 8,
  habitat: {
    // Through the undergrowth, by the flowers: the tufts are forest-edge and
    // clearing plants, so FOREST/DIRT off the path is where the blooms are.
    // `near` is the roster's "by flowers": every home within 4 m of a tuft
    // (the adapter's `spots.flowers` / `distances.flowers`).
    soils: ['FOREST', 'DIRT'],
    avoid: { path: 1.2 },
    near: { flowers: 4, share: 1 },
  },
  spacing: 3,
  homeRange: 4,
  activeRadius: 26,                 // an 11 cm bird is a couple of pixels past this
  fear: { radius: 2.8, runRadius: 5, calmDistance: 9, hideFor: null },
  speed: { walk: 2.4, flee: 4.2, turn: 11 },
  strideRate: 80,                   // the body's stride read; the wings run on uTime
  body: {
    yawOffset: 0, alignToGround: false,
    // Roughly twice life size (a real Allen's is 8 cm bill to tail): at
    // life size it is a speck past the chase camera.
    lift: 0, sinkDepth: 0, sinkTime: 0.25, scale: [1.15, 1.5],
  },
  fly: { low: 0.45, high: 1.3, hover: [0.8, 2.2], hoverR: 0.12, hoverRate: 1.8, zigzag: 0.22, zigFreq: 11, climb: 3.2 },
  timings: { idle: [0.2, 0.5], move: [1.5, 3.5], alert: 0.2 },
  build: buildHummingbird,
  animGLSL: HUMMINGBIRD_GLSL,
  metalness: 0.3,                   // the gorget's iridescence, picked up by makeCreatureMaterial
  roughness: 0.45,
  // Individual variation: a little lighter or darker, a breath greener or
  // warmer (the instance colour multiplies the vertex colours).
  tint(rng, c) {
    const k = 0.85 + rng() * 0.3, g = (rng() - 0.5) * 0.12;
    c.setRGB(k * (1 - g * 0.4), k * (1 + g), k * (1 - g * 0.6));
  },
  hooks: { tick },
};