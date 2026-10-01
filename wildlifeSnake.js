// wildlifeSnake.js — the California kingsnake (Lampropeltis getula
// californiae) of the cove's forest floor: black and cream-white rings down
// close to a metre of slow undulation. A species module for wildlife.js
// (WILDLIFE.md walks through the shape via wildlifeCrab.js); the segmented
// body-wave follows the tail sections of wildlifeLizard.js. The planned-
// roster line asked nothing new of the engine — the shared `ground` motion
// already names snakes — and this file adds exactly one hook: a `fleeTarget`
// that does not flee.
//
// Behaviour: crosses the litter in long unhurried pushes between long
// stillnesses; when you come within about two and a half metres it stops —
// mid-move or mid-rest, wherever it is — and holds flat and still, facing
// you, until you have drifted back out. It never runs and never burrows:
// being overlooked is its shelter.
//
// Model: ~230 triangles, flat-shaded, vertex-coloured, one merged geometry.
// Local frame: +Z is the front (head), +X its right, y = 0 the ground.
// Part ids read by SNAKE_GLSL: 1 head (and eyes), 20–27 body sections
// neck→tail, dressed in alternating black and cream rings.
import * as THREE from 'three';
import { creaturePart, mergeCreatureParts } from './wildlife.js?v=20261001-pass4';

const COL = {
  black: 0x1c1b19,       // the black rings
  underBlack: 0x11100e,  // their baked underside
  cream: 0xd8d2c4,       // the cream-white rings
  underCream: 0x8f887a,  // their belly, dimmed
  head: 0x26231f,        // the dark head, a shade over the black
  eye: 0x0d0c0b,
};

// Proportions, in metres, at about 1.1× life size (a big kingsnake is close
// to a metre — unlike the crab, it needs no magnifying). Eight hexagonal
// sections, each hinged at its root so the GLSL can send a wave down the
// line; bellies pressed into the litter.
const D = {
  n: 8,
  len: 0.098,             // section length → 0.78 m of body
  r: [0.018, 0.023, 0.026, 0.027, 0.025, 0.021, 0.016, 0.011, 0.0055],
  headLen: 0.064, headY: 0.015,
};

// ---------------------------------------------------------------------------
// Model.
// ---------------------------------------------------------------------------
export function buildSnake() {
  const parts = [];
  const z0 = (D.n * D.len) / 2;                 // the neck; body centred on 0

  // Body: eight ever-thinner hexagonal sections, neck to tail, each with its
  // own part id and hinged at its front end. The rings: black where the
  // section index is even, cream where it is odd.
  for (let i = 0; i < D.n; i++) {
    const z = z0 - i * D.len;
    const y = D.r[i] * 0.85;                    // belly pressed into the litter
    const seg = new THREE.CylinderGeometry(D.r[i], D.r[i + 1], D.len, 6)
      .rotateX(Math.PI / 2)                     // along +Z, thinner behind
      .rotateZ(Math.PI / 6)                     // flat back and belly
      .translate(0, y, z - D.len / 2);
    const cream = i % 2 === 1;
    parts.push(creaturePart(seg, {
      part: 20 + i, pivot: [0, y, z],
      color: cream ? COL.cream : COL.black,
      bottomColor: cream ? COL.underCream : COL.underBlack,
    }));
  }

  // Head: a flat-sided wedge wider than the neck, with a small dark eye
  // each side. Eyes share the head's part and pivot, so the look-around
  // carries them.
  const headPivot = [0, D.headY, z0 - 0.004];
  const head = new THREE.CylinderGeometry(0.01, 0.022, D.headLen, 4)
    .rotateX(Math.PI / 2).scale(1.35, 0.75, 1)
    .translate(0, D.headY, z0 + D.headLen / 2 - 0.004);
  parts.push(creaturePart(head, { part: 1, pivot: headPivot, color: COL.head }));
  for (const s of [-1, 1]) {
    parts.push(creaturePart(new THREE.BoxGeometry(0.006, 0.005, 0.009)
      .translate(s * 0.016, D.headY + 0.004, z0 + D.headLen * 0.55),
      { part: 1, pivot: headPivot, color: COL.eye }));
  }
  return { geometry: mergeCreatureParts(parts) };
}

// ---------------------------------------------------------------------------
// Animation, in the vertex shader (see makeCreatureMaterial for the inputs).
// aAnim: x idle phase, y gait 0..1, z mood 0..1 (alarm), w stride (rad).
// ---------------------------------------------------------------------------
export const SNAKE_GLSL = `
  float gait = aAnim.y, mood = aAnim.z, stride = aAnim.w;
  if (aPart > 19.5) {
    // The body: a slow wave travelling head to tail — the walk — and a
    // fainter sway at rest, tasting the air. Both die away as it watches
    // you: a kingsnake's shelter is not being seen to move.
    float seg = aPart - 20.0;
    float still = 1.0 - 0.85 * mood;
    float walk = sin(stride - seg * 1.3) * (0.22 + seg * 0.015) * gait;
    float sway = sin(uTime * 1.1 + aAnim.x - seg * 0.9) * 0.05 * (1.0 - gait);
    transformed = wlRotY(transformed, aPivot, (walk + sway) * still);
  } else if (aPart > 0.5) {
    // The head: rides the wave a touch, looks about when calm, presses flat
    // and stops when it watches you.
    float still = 1.0 - 0.85 * mood;
    float look = sin(uTime * 0.23 + aAnim.x * 1.31);
    float yaw = sin(stride * 0.55) * 0.14 * gait
      + sign(look) * pow(abs(look), 3.0) * 0.3 * (1.0 - gait);
    transformed = wlRotY(transformed, aPivot, yaw * still);
    transformed = wlRotX(transformed, aPivot, 0.25 * mood);
  }
`;

// ---------------------------------------------------------------------------
// Behaviour hooks (the manager's defaults cover everything else).
// ---------------------------------------------------------------------------
// Not a flight: the kingsnake's move is to stop being seen to move. A target
// at its own feet ends the FLEE where it stands, so it holds — riding ALERT,
// flat and still, facing you — until you are past fear.radius again.
function fleeTarget(a, sp, ctx, api) {
  api.setTarget(a, sp, a.x, a.z);
}

// ---------------------------------------------------------------------------
// The species definition. Every key is documented in WILDLIFE.md; anything
// left out takes wildlife.js's DEFAULTS, and a map may override any of it.
// ---------------------------------------------------------------------------
export const SNAKE = {
  id: 'snake',
  motion: 'ground',
  count: 2,
  habitat: {
    soils: ['FOREST'],
    slope: [0, 0.45],
    avoid: { path: 2 },
  },
  spacing: 4,                       // the two of them live apart
  homeRange: 3,
  activeRadius: 30,                 // a metre of snake, low to the ground
  fear: { radius: 2.5, runRadius: 4, calmDistance: 8, hideFor: null },
  speed: { walk: 0.18, flee: 0.4, turn: 2.5 },
  strideRate: 12,                   // rad of body wave per metre covered
  body: {
    alignToGround: true,
    lift: 0, scale: [1, 1.25],
  },
  timings: { idle: [4, 10], move: [1.5, 3.5], alert: 0.9 },
  build: buildSnake,
  animGLSL: SNAKE_GLSL,
  // Individual variation: a little lighter or darker, warmer or cooler.
  tint(rng, c) {
    const k = 0.85 + rng() * 0.3, w = (rng() - 0.5) * 0.1;
    c.setRGB(k * (1 + w), k, k * (1 - w));
  },
  hooks: { fleeTarget },
};