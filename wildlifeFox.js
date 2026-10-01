// wildlifeFox.js — the island fox (Urocyon littoralis) of the cove's
// undergrowth: cat-sized, grey over the back, rust on the flanks and legs, a
// cream throat, and a thick tail with a black tip. A species module for
// wildlife.js (WILDLIFE.md walks through the shape via wildlifeCrab.js); the
// quadruped animation follows wildlifeLizard.js. The planned-roster line
// asked for exactly one thing this file adds: a `fleeTarget` toward the
// densest forest, read through the layout adapter's `forestDensity`.
//
// Behaviour: prowls the forest floor in short unhurried legs between long
// stands, nose down, sniffing the litter; when you come within about five
// metres it freezes a beat, looking at you, then trots away — it never
// hides, there is no burrow — toward the thickest cover it can reach without
// passing you, and picks its wandering back up once you have drifted past
// calmDistance.
//
// Model: ~360 triangles (the guide allows ~800 for 2–3 individuals),
// flat-shaded, vertex-coloured, one merged geometry. Local frame: +Z is the
// front (nose), +X its right, y = 0 the ground. Part ids read by FOX_GLSL:
// 0 trunk (and throat), 1 head (and eyes, nose), 2 ears, 10–11 legs
// front/rear, 20–24 tail sections root→tip (24 is the black tip).
import * as THREE from 'three';
import { creaturePart, limbGeometry, mergeCreatureParts } from './wildlife.js?v=20261001-pass5';

const COL = {
  back: 0x8a857e,        // grizzled grey of the saddle
  rust: 0xa4572e,        // cinnamon-rust flanks and belly
  rustDeep: 0x5e341d,    // the baked under-edge of the rust
  throat: 0xe6dfcc,      // cream throat and chest
  under: 0x39301f,       // baked underside — seats it without a shadow
  head: 0x96603a,        // rusty head, pale jaw underneath
  ear: 0x8a4f2a,
  eye: 0x141210,
  nose: 0x1e1815,
  leg: 0x9c5a30,
  legTip: 0x6a3d22,
  tailRust: 0x9c5f36,
  tailTip: 0x23201d,     // the black tip
};

// Proportions, in metres, at about 1.3× life size (the island fox is
// cat-sized, the one species here that reads at that size). Trunk rides
// clear of the ground on canid legs; the tail carried low and thick.
const D = {
  bodyLen: 0.34, rNeck: 0.042, rHip: 0.056, bodyY: 0.15,
  headLen: 0.115, headY: 0.166,
  tailLen: 0.062, tailR: [0.042, 0.04, 0.036, 0.03, 0.02, 0.009],
  tailY0: 0.148, tailZ0: -0.155, tailDrop: 0.012,
  legHip: [[0.026, 0.115], [0.03, -0.115]],
  legKnee: [[0.036, 0.08, 0.12], [0.04, 0.08, -0.12]],
  legFoot: [[0.034, 0.128], [0.038, -0.13]],
};

// ---------------------------------------------------------------------------
// Model.
// ---------------------------------------------------------------------------
export function buildFox() {
  const parts = [];
  const body = (g, color, bottom = COL.under) =>
    parts.push(creaturePart(g, { part: 0, color, bottomColor: bottom }));

  // Trunk, two shells deep: a grey saddle riding high and narrow over a rust
  // body a shade lower — the rust's upper facet stands proud of the saddle's
  // lower one, so the flank reads rust up to about half height and grey over
  // the back, with rust shoulders peeking past the saddle from above.
  const saddle = new THREE.CylinderGeometry(D.rNeck * 0.98, D.rHip, 0.31, 6)
    .rotateX(Math.PI / 2).scale(1, 1.05, 1).translate(0, D.bodyY + 0.02, -0.012);
  body(saddle, COL.back);
  const flank = new THREE.CylinderGeometry(D.rNeck, D.rHip, D.bodyLen * 0.995, 6)
    .rotateX(Math.PI / 2).translate(0, D.bodyY - 0.006, 0);
  body(flank, COL.rust, COL.rustDeep);

  // Cream throat and chest: a small plate laid on the chest's front face.
  const throat = new THREE.CylinderGeometry(0.016, 0.024, 0.014, 6)
    .rotateX(Math.PI / 2)
    .translate(0, D.bodyY - 0.03, D.bodyLen / 2 - 0.002);
  body(throat, COL.throat, COL.throat);

  // Head: a flat-sided wedge, wider than tall, with a dark nose at the tip
  // and a small dark eye each side. Eyes and nose share the head's part and
  // pivot, so the look-around and the sniff carry them.
  const headPivot = [0, D.headY, D.bodyLen / 2 - 0.004];
  const head = new THREE.CylinderGeometry(0.014, 0.03, D.headLen, 4)
    .rotateX(Math.PI / 2).scale(1.15, 0.92, 1)
    .translate(0, D.headY, D.bodyLen / 2 + D.headLen / 2 - 0.006);
  parts.push(creaturePart(head, { part: 1, pivot: headPivot, color: COL.head, bottomColor: COL.under }));
  parts.push(creaturePart(new THREE.BoxGeometry(0.013, 0.011, 0.012)
    .translate(0, D.headY - 0.002, D.bodyLen / 2 + D.headLen - 0.008),
    { part: 1, pivot: headPivot, color: COL.nose }));
  for (const s of [-1, 1]) {
    parts.push(creaturePart(new THREE.BoxGeometry(0.008, 0.007, 0.01)
      .translate(s * 0.021, D.headY + 0.007, D.bodyLen / 2 + D.headLen * 0.42),
      { part: 1, pivot: headPivot, color: COL.eye }));
  }

  // Ears: tall triangles, their own pivots so the GLSL can twitch them calm
  // and pin them back alarmed.
  for (const s of [-1, 1]) {
    const ear = new THREE.ConeGeometry(0.017, 0.055, 4)
      .rotateZ(-s * 0.14).rotateX(-0.08)
      .translate(s * 0.018, D.headY + 0.042, D.bodyLen / 2 + 0.013);
    parts.push(creaturePart(ear,
      { part: 2, pivot: [s * 0.016, D.headY + 0.016, D.bodyLen / 2 + 0.014], color: COL.ear }));
  }

  // Four legs, two segments each — the front pair part 10, the rear pair 11;
  // the GLSL trots them in diagonal pairs. Rust, darkening to the paw.
  for (const s of [-1, 1]) for (let i = 0; i < 2; i++) {
    const hip = [s * D.legHip[i][0], D.bodyY - 0.012, D.legHip[i][1]];
    const knee = [s * D.legKnee[i][0], D.legKnee[i][1], D.legKnee[i][2]];
    const foot = [s * D.legFoot[i][0], 0.005, D.legFoot[i][1]];
    parts.push(creaturePart(limbGeometry(hip, knee, 0.015, 0.011),
      { part: 10 + i, pivot: hip, color: COL.leg, bottomColor: COL.under }));
    parts.push(creaturePart(limbGeometry(knee, foot, 0.01, 0.007),
      { part: 10 + i, pivot: hip, color: COL.legTip, bottomColor: COL.leg }));
  }

  // The bushy tail: five ever-thinner sections, each hinged at its root so
  // the GLSL can send a wave down the line, carried low; the last one is
  // the black tip.
  let z = D.tailZ0, y = D.tailY0;
  for (let i = 0; i < 5; i++) {
    const seg = new THREE.CylinderGeometry(D.tailR[i + 1], D.tailR[i], D.tailLen, 6)
      .rotateX(-Math.PI / 2).translate(0, y, z - D.tailLen / 2);
    parts.push(creaturePart(seg, {
      part: 20 + i, pivot: [0, y, z],
      color: i < 2 ? COL.back : i < 4 ? COL.tailRust : COL.tailTip,
      bottomColor: i < 4 ? COL.under : COL.tailTip,
    }));
    z -= D.tailLen; y -= D.tailDrop;
  }
  return { geometry: mergeCreatureParts(parts) };
}

// ---------------------------------------------------------------------------
// Animation, in the vertex shader (see makeCreatureMaterial for the inputs).
// aAnim: x idle phase, y gait 0..1, z mood 0..1 (alarm), w stride (rad).
// ---------------------------------------------------------------------------
export const FOX_GLSL = `
  float gait = aAnim.y, mood = aAnim.z, stride = aAnim.w;
  float side = aPivot.x > 0.0 ? 1.0 : -1.0;
  if (aPart > 19.5) {
    // The tail: a slow easy carry at rest, a travelling wave in the trot,
    // the root lifting a touch off the ground when it moves out.
    float seg = aPart - 20.0;
    float sway = sin(uTime * 1.5 + aAnim.x - seg * 1.1) * 0.12 * (1.0 - gait);
    float run = sin(stride - seg * 1.35) * 0.26 * gait;
    transformed = wlRotY(transformed, aPivot, sway + run);
    transformed.y += seg * 0.005 * gait;
  } else if (aPart > 9.5) {
    // Legs: the diagonal trot — each front leg with the far hind leg — with
    // a longer sweep than the lizard's, the stride of an animal that covers
    // ground. At rest, a faint weight-shift.
    // (The swing grows as the root of the gait: a calm walk still reaches,
    // the bolt reaches all the way.)
    float ph = stride + ((side > 0.0) == (aPart < 10.5) ? 3.14159 : 0.0);
    float reach = sqrt(gait);
    float lift = max(0.0, sin(ph)) * 0.6 * reach;
    float shift = sin(uTime * 1.9 + aAnim.x + (aPart - 10.0) * 2.2) * 0.03 * (1.0 - gait);
    transformed = wlRotZ(transformed, aPivot, side * (lift + shift));
    transformed = wlRotY(transformed, aPivot, cos(ph) * 0.3 * reach);
  } else if (aPart > 1.5) {
    // Ears: a lazy twitch when calm; pinned back a touch when alarmed.
    float tw = sin(uTime * 2.9 + aAnim.x * 1.7 + side * 2.4);
    transformed = wlRotZ(transformed, aPivot,
      side * (0.05 * max(0.0, tw) * (1.0 - gait) * (1.0 - mood) - 0.28 * mood));
  } else if (aPart > 0.5) {
    // Head: it looks about while calm and holds on you when alarmed — and,
    // standing idle, it dips to the litter to sniff every so often, quick
    // small bobs of the nose.
    float look = sin(uTime * 0.21 + aAnim.x * 1.37);
    float win = fract(uTime * 0.11 + aAnim.x);
    float sniff = max(smoothstep(0.9, 0.96, win), 1.0 - smoothstep(0.24, 0.3, win));
    float dip = sniff * 0.62 * (1.0 - mood) * (1.0 - gait);
    dip *= 1.0 + 0.16 * sin(uTime * 7.3);
    transformed = wlRotY(transformed, aPivot,
      sign(look) * pow(abs(look), 3.0) * (0.5 - 0.28 * mood) * (1.0 - sniff));
    transformed = wlRotX(transformed, aPivot, dip - 0.1 * mood);
  }
  // Breathing while still; a small bob with the stride.
  transformed.y += (1.0 - gait) * 0.004 * sin(uTime * 2.5 + aAnim.x)
    + abs(sin(stride)) * 0.005 * gait;
`;

// ---------------------------------------------------------------------------
// Behaviour hooks (the manager's defaults cover everything else — a fox
// wanders, alarms and calms by the book, and `fear.hideFor: null` ends its
// flights in IDLE, never HIDDEN).
// ---------------------------------------------------------------------------
const FLEE_RUN = 1.1;      // × runRadius: how far a flight aims
const FLEE_ARC = [-1.1, -0.73, -0.37, 0, 0.37, 0.73, 1.1];   // rad off straight-away

// A fox has no burrow: it trots off into the thickest undergrowth it can
// reach without passing you. Scan the arc away from the player and keep the
// point with the densest forest — the adapter's `forestDensity`, the one
// name this species asked the layout to add — with straight-away winning
// ties and stream banks penalised. Runs once per alarm, never per frame.
function fleeTarget(a, sp, ctx, api) {
  const L = ctx.layout;
  const p = api.fleeScan(a, {
    angles: FLEE_ARC, dists: [sp.def.fear.runRadius * FLEE_RUN],
    score: (x, z, off) => {
      if (!api.clearOfPlayer(a, x, z, 0.4)) return -Infinity;
      let s = L.forestDensity ? L.forestDensity(x, z) - Math.abs(off) * 0.05 : -Math.abs(off);
      if (L.distances.stream) s += Math.min(0, L.distances.stream(x, z) - 1.2) * 0.3;
      return s;
    },
  });
  if (p) api.setTarget(a, sp, p.x, p.z);
  else api.defaultFlee(a, sp);
}

// ---------------------------------------------------------------------------
// The species definition. Every key is documented in WILDLIFE.md; anything
// left out takes wildlife.js's DEFAULTS, and a map may override any of it.
// ---------------------------------------------------------------------------
export const FOX = {
  id: 'fox',
  motion: 'ground',
  count: 3,
  habitat: {
    soils: ['FOREST', 'DIRT'],
    slope: [0, 0.4],
    avoid: { path: 1.5, stream: 1.5, pool: 1.5 },
  },
  spacing: 4,
  homeRange: 6,
  activeRadius: 42,                 // cat-sized: readable a little past the default
  fear: { radius: 5, runRadius: 7.5, calmDistance: 13, hideFor: null },
  // A walk while calm; startled, a bolt — an island fox outruns you over a
  // few metres before it slows into the undergrowth.
  speed: { walk: 0.7, flee: 4.2, turn: 6 },
  strideRate: 26,                   // rad of leg cycle per metre, walking
  strideStretch: 3,                 // the gallop's stride: four walking ones
  body: {
    alignToGround: true,
    // No sideways, no burrowing: it faces where it goes and never sinks.
    scale: [1.1, 1.35],
  },
  timings: { idle: [2.5, 7], move: [1.5, 4], alert: 0.5 },
  build: buildFox,
  animGLSL: FOX_GLSL,
  // Individual variation: a little lighter or darker, a little warmer or
  // cooler grey (the instance colour multiplies the vertex colours).
  tint(rng, c) {
    const k = 0.86 + rng() * 0.28, w = (rng() - 0.5) * 0.14;
    c.setRGB(k * (1 + w), k, k * (1 - w * 0.8));
  },
  hooks: { fleeTarget },
};

