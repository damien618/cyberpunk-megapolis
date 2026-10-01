// wildlifeSandpiper.js — sanderlings (Calidris alba), the little grey-and-
// white sandpipers that work the swash of every Channel Islands beach: a
// loose flock running down the wet sand behind each retreating wave,
// probing where it left, and racing back up ahead of the next. A species
// module for wildlife.js (WILDLIFE.md walks through the shape via
// wildlifeCrab.js).
//
// Behaviour: wildlife.js's swashTick (the crab's, with a tighter margin)
// sends a bird caught by the water scurrying up the beach; its pickWander
// picks the next probe just above the live waterline, so between the two
// the flock chases the swash down and is chased back up. Pecking is the
// IDLE pose. Approached, it runs off along the sand and resumes (no hiding).
//
// Model: ~300 triangles, flat-shaded, vertex-coloured, one merged geometry.
// Local frame: +Z is the front (bill), +X its right, y = 0 the ground.
// Part ids read by SANDPIPER_GLSL: 0 body, 1 head + bill, 4 folded wings,
// 10/11 legs left/right.
import * as THREE from 'three';
import { creaturePart, limbGeometry, mergeCreatureParts, swashTick } from './wildlife.js?v=20261001-pass8';

const COL = {
  back: 0xc2bdb3,        // pale grey back, finely scaled
  belly: 0xf3f1ea,       // white underparts
  wing: 0x8e887e,        // the folded wing, a shade darker
  shoulder: 0x3e3a35,    // the dark shoulder patch
  primary: 0x26231f,     // black wingtips
  head: 0xd8d4ca,
  bill: 0x161412,
  leg: 0x1a1816,
  eye: 0x0c0b0a,
};

// ---------------------------------------------------------------------------
// Model.
// ---------------------------------------------------------------------------
export function buildSandpiper() {
  const parts = [];
  const part = (g, id, color, bottom, pivot) =>
    parts.push(creaturePart(g, { part: id, pivot, color, bottomColor: bottom }));

  // Body: a plump teardrop low on short legs, pale grey above; a white
  // belly slung under it shows on the lower flanks and below.
  const body = new THREE.SphereGeometry(1, 7, 5);
  body.scale(0.04, 0.03, 0.074).translate(0, 0.066, -0.004);
  part(body, 0, COL.back, COL.belly);
  const belly = new THREE.SphereGeometry(1, 7, 4);
  belly.scale(0.043, 0.029, 0.068).translate(0, 0.054, 0.004);
  part(belly, 0, COL.belly, COL.belly);

  // Head on a short neck, the black bill straight and as long as the head
  // (part 1: it bobs and probes about the neck).
  const neck = [0, 0.08, 0.05];
  const head = new THREE.SphereGeometry(0.02, 6, 5);
  head.scale(1, 0.95, 1.1).translate(0, 0.094, 0.068);
  part(head, 1, COL.head, COL.belly, neck);
  part(limbGeometry([0, 0.09, 0.086], [0, 0.083, 0.12], 0.006, 0.0045), 1, COL.bill, COL.bill, neck);
  for (const s of [-1, 1]) {
    part(new THREE.BoxGeometry(0.0045, 0.0045, 0.0045).translate(s * 0.0175, 0.099, 0.076), 1, COL.eye, COL.eye, neck);
  }

  // The folded wing is the grey body itself; on it, the dark shoulder spot
  // and the black primaries, slim, crossing over the rump (part 4: they
  // flick when it runs off).
  const blob = (sx, sy, sz, x, y, z, color, bottom, pivot) => {
    const g = new THREE.SphereGeometry(1, 5, 3);
    g.scale(sx, sy, sz).translate(x, y, z);
    part(g, 4, color, bottom, pivot);
  };
  for (const s of [-1, 1]) {
    const pivot = [s * 0.03, 0.08, 0.03];
    blob(0.006, 0.009, 0.012, s * 0.036, 0.074, 0.024, COL.shoulder, COL.shoulder, pivot);
    blob(0.006, 0.004, 0.026, s * 0.009, 0.09, -0.058, COL.primary, COL.primary, pivot);
  }
  // A short tail between the wingtips.
  part(new THREE.BoxGeometry(0.022, 0.007, 0.032).rotateX(-0.1).translate(0, 0.074, -0.08), 0, COL.wing, COL.belly);

  // Legs: black, short, set well back; the feet a stub forward (10, 11).
  for (const s of [-1, 1]) {
    const hip = [s * 0.013, 0.036, -0.004];
    part(limbGeometry(hip, [s * 0.014, 0.003, 0.004], 0.006, 0.005), s < 0 ? 10 : 11, COL.leg, COL.leg, hip);
    part(limbGeometry([s * 0.014, 0.003, -0.004], [s * 0.014, 0.002, 0.02], 0.007, 0.003),
      s < 0 ? 10 : 11, COL.leg, COL.leg, hip);
  }
  return { geometry: mergeCreatureParts(parts) };
}

// ---------------------------------------------------------------------------
// Animation, in the vertex shader (see makeCreatureMaterial for the inputs).
// aAnim: x idle phase, y gait 0..1, z mood 0..1 (alarm), w stride (rad).
// ---------------------------------------------------------------------------
export const SANDPIPER_GLSL = `
  float gait = aAnim.y, mood = aAnim.z, stride = aAnim.w;
  float side = aPivot.x > 0.0 ? 1.0 : -1.0;
  if (aPart > 9.5) {
    // Legs: the clockwork scurry — a blur of short steps, left and right
    // in antiphase, sweeping fore and aft about the hip.
    float ph = stride + (aPart > 10.5 ? 3.14159 : 0.0);
    transformed = wlRotX(transformed, aPivot, sin(ph) * 0.75 * gait);
  } else if (aPart > 3.5 && aPart < 4.5) {
    // Wings: still, folded — a nervous flick when alarmed.
    float flick = max(0.0, sin(uTime * 17.0 + aAnim.x)) * 0.25 * mood;
    transformed = wlRotZ(transformed, aPivot, side * flick);
  } else if (aPart > 0.5 && aPart < 1.5) {
    // Head: standing, it probes — quick stabs of the bill into the wet
    // sand, in bursts; running, it is held level, a little bob.
    float burst = smoothstep(0.2, 0.6, sin(uTime * 0.9 + aAnim.x * 3.1));
    float stab = max(0.0, sin(uTime * 13.0 + aAnim.x)) * 1.05 * burst * (1.0 - gait) * (1.0 - mood);
    transformed = wlRotX(transformed, aPivot, stab + 0.08 * gait);
  }
  // The body pitches down a little with each probe, and bobs on the run.
  transformed.y += abs(sin(stride)) * 0.004 * gait;
`;

// ---------------------------------------------------------------------------
// Behaviour hooks.
// ---------------------------------------------------------------------------
// The next probe: a short run along the beach to just above the live
// waterline — the strip the last wave wetted. Off the habitat (the jetty,
// the stream mouth), the default wander instead.
function pickWander(a, sp, ctx, api) {
  const L = ctx.layout, rng = sp.rng, H = sp.def.homeRange;
  const x = Math.max(a.home.x - H, Math.min(a.home.x + H, a.x + (rng() - 0.5) * 2.6));
  const z = L.waterlineZ(x) + 0.15 + rng() * 0.9;
  if (api.habitatOk(sp, x, z)) api.setTarget(a, sp, x, z);
  else api.defaultWander(a, sp);
}

// ---------------------------------------------------------------------------
// The species definition. Every key is documented in WILDLIFE.md; anything
// left out takes wildlife.js's DEFAULTS, and a map may override any of it.
// ---------------------------------------------------------------------------
export const SANDPIPER = {
  id: 'sandpiper',
  motion: 'ground',
  count: 9,
  habitat: {
    soils: ['WET', 'SAND'],
    shore: [-0.5, 5],                // the swash zone and just above it
    slope: [0, 0.3],
    avoid: { path: 1.5, jetty: 1.5, stream: 1.5 },
  },
  spacing: 0.5,
  homeRange: 6,                      // a stretch of beach the flock works
  activeRadius: 40,
  fear: { radius: 3.2, runRadius: 6, calmDistance: 8, hideFor: null },
  speed: { walk: 0.9, flee: 2.6, turn: 10 },
  strideRate: 60,                    // a blur of little steps
  body: {
    alignToGround: true,
    // About one and a half times life size (a real one is 20 cm, bill to
    // tail): 27–31 cm here, a match for the crabs it runs among.
    scale: [1.35, 1.55],
  },
  timings: { idle: [0.3, 1.2], move: [0.4, 1.4], alert: 0.15 },
  build: buildSandpiper,
  animGLSL: SANDPIPER_GLSL,
  tint(rng, c) {
    const k = 0.92 + rng() * 0.14;
    c.setRGB(k, k, k * (0.98 + rng() * 0.03));
  },
  needs: ['waterlineZ'],
  hooks: {
    // Caught by the water, it races up the beach — the crab's habit, quicker.
    tick: swashTick({ margin: 0, up: [0.7, 1.5], speedK: 0.8, jitter: 0.5 }),
    pickWander,
  },
};
