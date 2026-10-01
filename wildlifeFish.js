// wildlifeFish.js — the pool's silver fish: a loose school of small
// silver-sided minnows holding in the plunge pool under the falls. Modeled
// on wildlifeCrab.js's shape — WILDLIFE.md is the how-to, and this is the
// roster's planned "silver fish": the first `school` species (the stub's
// brief in wildlifeMotion.js, implemented).
//
// Behaviour: the school cruises the pool's middle depth as one body —
// wildlifeBoids in 3-D, bounded by the waterline, the bed and the surface.
// Nothing here uses the engine's fear: a school scatters as a group, so the
// wading player is simply the boids' threat — the fish part around them and
// close again behind their wake. Their one hook is a tick that never lets
// the state machine idle them: a fish that stops moving is a dead fish.
//
// Model: ~150 triangles, flat-shaded, vertex-coloured, one merged geometry.
// Local frame: +Z is the front (snout, eyes), +X its right, y = 0 the belly —
// the water is a fish's ground. The instance sits with its belly at the
// boid's height, so the school reads at the depth it swims at.
// Part ids read by FISH_GLSL: 0 body + back cap, 1 tail fin, 2 dorsal fin,
// 3 pectoral fins, 4 eyes.
import * as THREE from 'three';
import { creaturePart, mergeCreatureParts } from './wildlife.js?v=20261001-pass3';

const COL = {
  top: 0xd0dce2,         // the bright silver of the flanks and body
  back: 0x6a8090,        // the darker spine stripe you see from above
  belly: 0xf0f4f7,       // baked underside — pale, like a minnow's
  fin: 0xaebfc9,
  eye: 0x101418,
};

// ---------------------------------------------------------------------------
// Model.
// ---------------------------------------------------------------------------
export function buildFish() {
  const parts = [];
  const body = (g, color, bottom = COL.belly) =>
    parts.push(creaturePart(g, { part: 0, color, bottomColor: bottom }));

  // Torso: a fusiform ellipsoid, six-sided so the facets read as scales.
  const torso = new THREE.SphereGeometry(0.024, 6, 4);
  torso.scale(0.4, 0.66, 2.9).translate(0, 0.016, 0.006);
  body(torso, COL.top);

  // The darker back: a second, narrower shell over the torso — it peeks
  // along the spine as a tapering darker cap, the countershading you read
  // from the bank above the pool. (The crab's raised-plate trick, but one
  // that tapers with the body instead of floating a box over it.)
  const back = new THREE.SphereGeometry(0.024, 6, 4);
  back.scale(0.27, 0.62, 2.55).translate(0, 0.0175, 0.008);
  body(back, COL.back, COL.top);

  // Forked caudal fin: two blades joined at the tail root, one tilted up and
  // back, one down and back — a V from the side, one swept blade from above.
  // Both pivoted at the root (part 1) so the beat swings the whole fork.
  const tailPivot = [0, 0.016, -0.062];
  for (const s of [-1, 1]) {
    const lobe = new THREE.BoxGeometry(0.003, 0.022, 0.018);
    lobe.rotateX(s * -0.55).rotateY(-0.55)
      .translate(0.003, 0.016 + s * 0.0094, -0.062 - 0.0049);
    parts.push(creaturePart(lobe, { part: 1, pivot: tailPivot, color: COL.fin, bottomColor: COL.fin }));
  }

  // Dorsal fin: modest, set back at mid-body, swept with the back (part 2).
  const dor = new THREE.BoxGeometry(0.003, 0.011, 0.02);
  dor.rotateX(0.45).translate(0, 0.03, -0.012);
  parts.push(creaturePart(dor, { part: 2, pivot: [0, 0.026, -0.006], color: COL.fin, bottomColor: COL.fin }));

  for (const s of [-1, 1]) {
    // Pectoral fins: small plates low on the flanks, angled back, pivoted
    // at the body so they can fold (part 3).
    const pec = new THREE.BoxGeometry(0.008, 0.0022, 0.01);
    pec.rotateY(s * -0.7).rotateZ(s * 0.35).translate(s * 0.0092, 0.0075, 0.03);
    parts.push(creaturePart(pec, { part: 3, pivot: [s * 0.0075, 0.01, 0.028], color: COL.fin, bottomColor: COL.fin }));

    // Eyes (part 4), on the side of the head, not on top of it.
    parts.push(creaturePart(new THREE.BoxGeometry(0.005, 0.005, 0.005).translate(s * 0.0076, 0.0195, 0.052),
      { part: 4, pivot: [s * 0.0076, 0.0195, 0.052], color: COL.eye, bottomColor: COL.eye }));
  }
  return { geometry: mergeCreatureParts(parts) };
}

// ---------------------------------------------------------------------------
// Animation, in the vertex shader (see makeCreatureMaterial for the inputs).
// aAnim: x idle phase, y gait 0..1, z mood 0..1 (alarm), w stride (rad).
// ---------------------------------------------------------------------------
export const FISH_GLSL = `
  float gait = aAnim.y, mood = aAnim.z, stride = aAnim.w;
  if (aPart > 0.5 && aPart < 1.5) {
    // Tail: the beat — a slow flick at rest, a full scull at speed.
    transformed = wlRotY(transformed, aPivot, sin(stride - 0.9) * (0.55 * gait + 0.09 + 0.22 * mood));
  } else if (aPart > 1.5 && aPart < 2.5) {
    // Dorsal: a touch higher when alarmed, drooped at rest.
    transformed = wlRotX(transformed, aPivot, -0.28 * mood + 0.14 * (1.0 - gait));
  } else if (aPart > 2.5 && aPart < 3.5) {
    // Pectorals: an idle flutter, folded into the flank at speed.
    float side = aPivot.x > 0.0 ? 1.0 : -1.0;
    float flap = sin(uTime * 3.3 + aAnim.x + side * 1.7) * 0.28 * (1.0 - gait);
    transformed = wlRotZ(transformed, aPivot, side * (flap + 0.25 * gait + 0.3 * mood));
  }
  // Body: a wave that travels tailward — head steady, growing to the tail —
  // riding on every part, fins included. Plus the idle sway of a held fish.
  float amp = (0.13 * gait + 0.022 + 0.05 * mood) * (0.45 - transformed.z * 3.2);
  transformed = wlRotY(transformed, vec3(0.0, 0.0, transformed.z), sin(stride - transformed.z * 24.0) * amp);
  transformed.y += sin(uTime * 1.7 + aAnim.x) * 0.0012;
`;

// ---------------------------------------------------------------------------
// Behaviour: no hooks. `continuous: true` keeps it moving — the moment the
// machine would idle it, it is handed straight back to MOVE — and the
// school motion owns where it actually goes.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// The species definition. Every key is documented in WILDLIFE.md; anything
// left out takes wildlife.js's DEFAULTS, and a map may override any of it.
// ---------------------------------------------------------------------------
export const FISH = {
  id: 'fish',
  motion: 'school',
  count: 14,
  habitat: {
    // Wherever the pool's water is — the one thing the keys cannot say.
    test: (x, z, layout) => {
      // …and deep enough to swim in: not the drawn surface's thin fringe.
      const w = layout.waterAt ? layout.waterAt(x, z) : null;
      return !!w && w.kind === 'pool' && w.y - layout.terrainHeight(x, z) > 0.3;
    },
  },
  spacing: 0.5,
  homeRange: 2.5,                   // the tick's retargets; the boids ignore it
  activeRadius: 30,                 // a 7 cm fish is a couple of pixels past this
  fear: { radius: 0 },              // the school never "alarms": the wading
                                    // player is the boids' threat, and the
                                    // scatter is the whole school's, at once
  speed: { walk: 0.45, flee: 1.2, turn: 5 },  // cruise / scatter (gait scales on flee)
  strideRate: 110,                  // a minnow's tail: ~7 beats a second at cruise
  body: {
    yawOffset: 0, alignToGround: false,
    lift: 0, sinkDepth: 0, sinkTime: 0.4, scale: [0.9, 1.3],
  },
  timings: { idle: [0.2, 0.6], move: [4, 9], alert: 0 },
  build: buildFish,
  animGLSL: FISH_GLSL,
  metalness: 0.45,                  // the silver: picked up by makeCreatureMaterial
  roughness: 0.35,
  // Individual variation: a little brighter or duller, a breath bluer or
  // warmer (the instance colour multiplies the vertex colours).
  tint(rng, c) {
    const k = 0.86 + rng() * 0.28, b = (rng() - 0.5) * 0.1;
    c.setRGB(k * (1 + b), k * (1 + b * 0.4), k * (1 - b * 0.6));
  },
  continuous: true,
  needs: ['waterAt'],
};