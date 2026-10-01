// wildlifeLizard.js — the lizards of the cove's rocks: the side-blotched
// lizard (Uta stansburiana), small, grey-brown with a row of dark blotches
// low on each flank, and the brown, longer alligator lizard (Elgaria
// multicarinata), its short legs barely clearing the ground. Both spend most
// of the day sunning at a rock's edge, dart a few steps, freeze; when you
// come close they break for the nearest rock and flatten into its lee — or,
// none in reach, dash and vanish where they stand.
//
// First species after the reference crab: the shape copies wildlifeCrab.js
// (WILDLIFE.md walks through it) and both lizards share one model builder,
// one animation GLSL and two behaviour hooks.
//
// Model: ~290 triangles each, flat-shaded, vertex-coloured, one merged
// geometry. Local frame: +Z is the front (head), +X its right, y = 0 the
// ground. Part ids read by LIZARD_GLSL: 0 body (and flank blotches), 1 head
// (and eyes), 10–11 legs front/rear, 20–23 tail sections root→tip.
import * as THREE from 'three';
import { creaturePart, limbGeometry, mergeCreatureParts } from './wildlife.js?v=20261001-pass4';

// Palettes. The side-blotched is grey-brown, paler on the flanks where its
// dark blotches sit; the alligator is a plainer brown, banded rather than
// blotched (the same prims, duller and darker).
const COL = {
  back: 0x6a5f4e,        // grey-brown
  flank: 0x847765,       // paler sides — where the blotches read
  blotch: 0x2f2a21,      // the dark side blotches
  under: 0x241f19,       // baked underside — seats it without a shadow
  head: 0x77695a,
  eye: 0x131110,
  leg: 0x574c3d,
  legTip: 0x6e6250,
};
const GATOR = {
  back: 0x6e5638,        // warm brown
  flank: 0x8a6f4c,
  blotch: 0x3a2c1b,      // dark cross-bands, read as blotches at this size
  under: 0x262016,
  head: 0x775f3e,
  eye: 0x131110,
  leg: 0x5a472f,
  legTip: 0x70593a,
};

// Proportions, in metres, at about twice life size (a real side-blotched is
// a 5 cm body plus tail — a twig with eyes at the camera's distance). The
// trunk rides low, almost on the ground, on short legs splayed under it:
// knees below the hips, like a lizard, not above, like a bug.
const Dims = {
  lizard: {
    bodyLen: 0.11, rNeck: 0.022, rHip: 0.03, bodyY: 0.031,
    headLen: 0.06, headY: 0.038, headW: 1,
    blotchZ: [0.026, -0.004, -0.034],
    tailLen: 0.036, tailR: [0.026, 0.02, 0.0145, 0.009, 0.0035],
    legHip: [[0.02, 0.04], [0.022, -0.037]],
    legKnee: [[0.042, 0.016, 0.043], [0.046, 0.016, -0.04]],
    legFoot: [[0.044, 0.046], [0.049, -0.044]],
  },
  gator: {
    bodyLen: 0.15, rNeck: 0.023, rHip: 0.03, bodyY: 0.028,
    headLen: 0.075, headY: 0.033, headW: 1.08,
    blotchZ: [0.03, 0, -0.03],
    tailLen: 0.045, tailR: [0.027, 0.022, 0.016, 0.0105, 0.004],
    legHip: [[0.018, 0.055], [0.02, -0.05]],
    legKnee: [[0.031, 0.014, 0.057], [0.033, 0.014, -0.052]],
    legFoot: [[0.032, 0.059], [0.034, -0.056]],
  },
};

// ---------------------------------------------------------------------------
// Model.
// ---------------------------------------------------------------------------
function build(pal, d) {
  const parts = [];
  const body = (g, color, bottom = pal.under) =>
    parts.push(creaturePart(g, { part: 0, color, bottomColor: bottom }));

  // Trunk: a hexagonal log — flat back, flat belly, widest at the side
  // seams — narrow at the neck, widest over the hips, riding low on short
  // splayed legs.
  body(new THREE.CylinderGeometry(d.rNeck, d.rHip, d.bodyLen, 6)
    .rotateX(Math.PI / 2).rotateZ(Math.PI / 6).translate(0, d.bodyY, 0), pal.back);

  // The dark flank blotches: small diamonds lying on the upper facet of each
  // flank, nearly flush — a row of dark marks, not teeth past the silhouette.
  for (const s of [-1, 1]) for (const z of d.blotchZ) {
    const blot = new THREE.ConeGeometry(0.009, 0.004, 4).rotateZ(-s * Math.PI / 6)
      .scale(1, 1, 1.35)
      .translate(s * d.rHip * 0.45, d.bodyY + d.rHip * 0.72, z);
    body(blot, pal.blotch, pal.blotch);
  }

  // Head: a flat-sided wedge, a ridge down its nose like the back's, with a
  // small dark eye each side. Eyes share the head's part and pivot, so the
  // look-around carries them.
  const headPivot = [0, d.headY, d.bodyLen / 2 - 0.003];
  const head = new THREE.CylinderGeometry(0.006, 0.024 * d.headW, d.headLen, 4)
    .rotateX(Math.PI / 2).scale(1.15, 0.85, 1)
    .translate(0, d.headY, d.bodyLen / 2 + d.headLen / 2 - 0.004);
  parts.push(creaturePart(head, { part: 1, pivot: headPivot, color: pal.head, bottomColor: pal.under }));
  for (const s of [-1, 1]) {
    parts.push(creaturePart(new THREE.BoxGeometry(0.006, 0.005, 0.009)
      .translate(s * 0.015, d.headY + 0.004, d.bodyLen / 2 + d.headLen * 0.48),
      { part: 1, pivot: headPivot, color: pal.eye }));
  }

  // Tail: four ever-thinner sections, each hinged at its root so the GLSL
  // can send a wave down the line. Faintly banded, carried just above the
  // back's line so it reads behind the body.
  let z = -d.bodyLen / 2 + 0.004, y = d.bodyY + 0.002;
  for (let i = 0; i < 4; i++) {
    const seg = new THREE.CylinderGeometry(d.tailR[i + 1], d.tailR[i], d.tailLen, 5)
      .rotateX(-Math.PI / 2).translate(0, y, z - d.tailLen / 2);
    parts.push(creaturePart(seg, {
      part: 20 + i, pivot: [0, y, z],
      color: i % 2 ? pal.flank : pal.back, bottomColor: pal.under,
    }));
    z -= d.tailLen; y -= 0.002;
  }

  // Four splayed legs — the alligator's barely clear the ground. Front pair
  // is part 10, rear pair 11; the GLSL trots them in diagonal pairs.
  for (const s of [-1, 1]) for (let i = 0; i < 2; i++) {
    const hip = [s * d.legHip[i][0], d.bodyY, d.legHip[i][1]];
    const knee = [s * d.legKnee[i][0], d.legKnee[i][1], d.legKnee[i][2]];
    const foot = [s * d.legFoot[i][0], 0.002, d.legFoot[i][1]];
    parts.push(creaturePart(limbGeometry(hip, knee, 0.009, 0.007),
      { part: 10 + i, pivot: hip, color: pal.leg, bottomColor: pal.under }));
    parts.push(creaturePart(limbGeometry(knee, foot, 0.006, 0.005),
      { part: 10 + i, pivot: hip, color: pal.legTip, bottomColor: pal.leg }));
  }
  return { geometry: mergeCreatureParts(parts) };
}

export const buildLizard = () => build(COL, Dims.lizard);
export const buildAlligator = () => build(GATOR, Dims.gator);

// ---------------------------------------------------------------------------
// Animation, in the vertex shader (see makeCreatureMaterial for the inputs).
// aAnim: x idle phase, y gait 0..1, z mood 0..1 (alarm), w stride (rad).
// ---------------------------------------------------------------------------
export const LIZARD_GLSL = `
  float gait = aAnim.y, mood = aAnim.z, stride = aAnim.w;
  float side = aPivot.x > 0.0 ? 1.0 : -1.0;
  if (aPart > 19.5) {
    // Tail: a wave that grows toward the tip — a slow sway at rest, a fast
    // travelling wave in a run.
    float seg = aPart - 20.0;
    float sway = sin(uTime * 1.6 + aAnim.x - seg * 1.2) * 0.09 * (1.0 - gait);
    float run = sin(stride - seg * 1.5) * 0.32 * gait;
    transformed = wlRotY(transformed, aPivot, sway + run);
  } else if (aPart > 9.5) {
    // Legs: a diagonal trot — each front leg with the far rear leg — each
    // leg lifting its tip and sweeping a little fore and aft. At rest, a
    // slow twitch.
    float ph = stride + ((side > 0.0) == (aPart < 10.5) ? 3.14159 : 0.0);
    float lift = max(0.0, sin(ph)) * 0.5 * gait;
    float twitch = sin(uTime * 2.2 + aAnim.x + (aPart - 10.0) * 2.1) * 0.05 * (1.0 - gait);
    transformed = wlRotZ(transformed, aPivot, side * (lift + twitch));
    transformed = wlRotY(transformed, aPivot, cos(ph) * 0.3 * gait);
  } else if (aPart > 0.5) {
    // Head: it looks about while calm, holds still while it watches you,
    // and the snout comes up when alarmed.
    float look = sin(uTime * 0.19 + aAnim.x * 1.31);
    transformed = wlRotY(transformed, aPivot, sign(look) * pow(abs(look), 3.0) * (0.55 - 0.35 * mood));
    transformed = wlRotX(transformed, aPivot, -0.3 * mood);
  }
  // Breathing while still; a small bob with the stride.
  transformed.y += (1.0 - gait) * 0.0035 * sin(uTime * 2.7 + aAnim.x)
    + abs(sin(stride)) * 0.004 * gait;
`;

// ---------------------------------------------------------------------------
// Behaviour hooks (the manager's defaults cover everything else).
// ---------------------------------------------------------------------------
const ROCK_REACH = 5;      // m: a rock within this is a refuge
const BASK_REACH = 3.5;    // m: and, closer, a place to sun

// About a third of the wanderings end at the near flank of a rock: basking
// in the sun. The rest is the default wander inside the home range.
function pickWander(a, sp, ctx, api) {
  if (sp.rng() < 0.35) {
    const rock = ctx.layout.spots.rocks?.nearest(a.x, a.z, BASK_REACH).spot;
    if (rock) {
      const dx = a.x - rock.x, dz = a.z - rock.z, d = Math.hypot(dx, dz) || 1;
      // At the stone's foot, a hand's width clear of it.
      const r = rock.r + 0.12;
      api.setTarget(a, sp, rock.x + dx / d * r, rock.z + dz / d * r);
      return;
    }
  }
  api.defaultWander(a, sp);
}

// The nearest rock that does not mean running at the player: into its lee,
// halfway to its heart — the stone stands between the lizard and you — or,
// none in reach, a short dash and flatten where it stands.
function fleeTarget(a, sp, ctx, api) {
  const rock = api.refugeAt(a, ctx.layout.spots.rocks, ROCK_REACH, 0.5);
  if (rock) api.setTarget(a, sp, rock.x, rock.z);
  else api.defaultFlee(a, sp);
}

// ---------------------------------------------------------------------------
// The species definition. Every key is documented in WILDLIFE.md; anything
// left out takes wildlife.js's DEFAULTS, and a map may override any of it.
// ---------------------------------------------------------------------------
export const LIZARD = {
  id: 'lizard',
  motion: 'ground',
  count: 10,
  habitat: {
    soils: ['DIRT', 'FOREST', 'ROCK'],
    slope: [0, 0.55],
    avoid: { path: 1.5 },
    near: { rocks: 5, share: 0.6 },   // a loose colony round each boulder
  },
  spacing: 1.2,
  homeRange: 2.5,
  activeRadius: 30,                 // a 30 cm lizard is a few pixels past this
  fear: { radius: 2.5, runRadius: 5.5, calmDistance: 9, hideFor: [6, 14] },
  speed: { walk: 0.35, flee: 2.2, turn: 8 },
  strideRate: 34,                   // rad of leg cycle per metre covered
  body: {
    alignToGround: true,
    // Quick to vanish: it slips flat against the ground or under its rock
    // rather than burrowing like the crab.
    sinkDepth: 0.09, sinkTime: 0.22, scale: [0.9, 1.3],
  },
  timings: { idle: [3, 9], move: [0.6, 1.6], alert: 0.25 },
  build: buildLizard,
  animGLSL: LIZARD_GLSL,
  // Individual variation: a little lighter or darker, warmer or cooler grey.
  tint(rng, c) {
    const k = 0.8 + rng() * 0.4, w = (rng() - 0.5) * 0.14;
    c.setRGB(k * (1 + w), k, k * (1 - w * 0.7));
  },
  hooks: { pickWander, fleeTarget },
};

// The alligator lizard: same bones, stretched — a longer trunk and tail on
// legs that barely clear the ground, dressed browner. Slower in everything:
// it stalks rather than darts, and hides longer.
export const ALLIGATOR = {
  ...LIZARD,
  id: 'lizardAlligator',
  count: 3,
  build: buildAlligator,
  fear: { radius: 3, runRadius: 6, calmDistance: 10, hideFor: [8, 18] },
  speed: { walk: 0.22, flee: 1.3, turn: 6 },
  strideRate: 26,
  body: { ...LIZARD.body, sinkDepth: 0.1, sinkTime: 0.26, scale: [1.3, 1.7] },
  timings: { idle: [4, 12], move: [1, 2.5], alert: 0.4 },
};