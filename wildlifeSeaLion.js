// wildlifeSeaLion.js — the cove's California sea lions (Zalophus
// californianus): dark brown bulls and cows hauled out on the offshore
// rocks, some loafing on the tops, some sliding off to swim and dive and
// surfacing again nearby. A species module for wildlife.js (WILDLIFE.md
// walks through the shape via wildlifeCrab.js) — the roster's planned
// "California sea lions", the first `amphibious` species: the motion (the
// crawl on the haul-outs' tops, the surface swim between them) lives in
// wildlifeMotion.js; the dive is the species' own tick running the swim off
// the rock through the manager's own HIDDEN (sink) and EMERGE (surface
// again nearby).
//
// Behaviour: nothing here uses the engine's fear — the wade barrier keeps
// the player forty metres from the rocks, so fear.radius is 0 and the
// loaf-dive-surface cycle is a decision of the tick, phased per individual
// off the species' RNG. a.dive carries the phase, like the frog's a.hopPhase:
//   0  loafing; a.diveT counts down to the next slide
//   1  bound for the water (a MOVE the tick set up)
//   2  under (HIDDEN), then surfaced and swimming home (post-EMERGE MOVE)
//
// Model: ~330 triangles, flat-shaded, vertex-coloured, one merged geometry.
// Local frame: +Z is the front (muzzle, eyes), +X its right, y = 0 the
// belly — the rock top and the sea surface are both a sea lion's ground.
// Part ids read by SEA_LION_GLSL: 0 torso, 1 neck + head + muzzle, 3 eyes,
// 5/6 fore flippers, 10/11 hind flippers, 12 tail.
import * as THREE from 'three';
import { creaturePart, limbGeometry, mergeCreatureParts } from './wildlife.js?v=20261001-pass2';
import { amphibiousFloor, amphFloor } from './wildlifeMotion.js?v=20261001-pass2';

const COL = {
  coat: 0x4a3626,        // the dark brown coat, dull on the flanks
  crown: 0x5f4630,       // the crest, palest on the bulls
  under: 0x2c2016,       // baked underside — the darker, wet belly
  muzzle: 0x74604b,      // the bull's pale muzzle, in the skull's line
  flipper: 0x36281c,     // the leathery flippers, near-black
  eye: 0x14100c,
};

// ---------------------------------------------------------------------------
// Model.
// ---------------------------------------------------------------------------
export function buildSeaLion() {
  const parts = [];
  const part = (g, id, color, bottom, pivot) =>
    parts.push(creaturePart(g, { part: id, pivot, color, bottomColor: bottom }));

  // Torso: a fusiform ellipsoid, chest-forward, belly resting on y = 0, plus
  // the heavy shoulders that read as a bull hauled out.
  const torso = new THREE.SphereGeometry(1, 7, 5);
  torso.scale(0.185, 0.215, 0.6).translate(0, 0.23, -0.06);
  part(torso, 0, COL.coat, COL.under);
  const chest = new THREE.SphereGeometry(1, 6, 4);
  chest.scale(0.165, 0.2, 0.27).translate(0, 0.23, 0.27);
  part(chest, 0, COL.crown, COL.under);

  // The thick neck up and forward, then the small skull and the pale muzzle
  // (part 1: the GLSL lifts and scans it while the animal loafs). The muzzle
  // sits in the skull's line — a sea lion's short face, not a snout.
  part(limbGeometry([0, 0.3, 0.42], [0, 0.4, 0.56], 0.115, 0.095), 1, COL.coat, COL.under);
  part(new THREE.BoxGeometry(0.095, 0.075, 0.11).translate(0, 0.425, 0.615), 1, COL.crown, COL.coat);
  part(new THREE.BoxGeometry(0.042, 0.04, 0.06).translate(0, 0.43, 0.68), 1, COL.muzzle, COL.muzzle);

  for (const s of [-1, 1]) {
    // The eyes ride the neck's own pivot (the GLSL turns part 1, and a fixed
    // eye would float off a turned head), sunk into the skull's top so they
    // read without floating.
    part(new THREE.BoxGeometry(0.014, 0.014, 0.014).translate(s * 0.028, 0.443, 0.63),
      3, COL.eye, COL.eye, [0, 0.3, 0.42]);
    // The fore flippers: long, flat blades hugging the flanks, angled back —
    // the GLSL scratches (ashore) and rows (swimming) with them (parts 5/6).
    const id = s < 0 ? 5 : 6, pivot = [s * 0.12, 0.26, 0.34];
    part(new THREE.BoxGeometry(0.045, 0.012, 0.27)
      .rotateY(s * 0.28).rotateZ(s * 0.1).translate(s * 0.15, 0.155, 0.18),
      id, COL.flipper, COL.under, pivot);
    // The hind flippers, folded back along the body — the swim's main beat.
    const hip = [s * 0.07, 0.09, -0.55];
    part(limbGeometry(hip, [s * 0.13, 0.02, -0.68], 0.05, 0.03),
      10 + (s < 0 ? 0 : 1), COL.flipper, COL.under, hip);
  }
  // The short tail, between the hind flippers (part 12: a beat behind them).
  part(limbGeometry([0, 0.11, -0.58], [0, 0.05, -0.7], 0.045, 0.018),
    12, COL.flipper, COL.flipper);

  return { geometry: mergeCreatureParts(parts) };
}

// ---------------------------------------------------------------------------
// Animation, in the vertex shader (see makeCreatureMaterial for the inputs).
// aAnim: x idle phase, y gait 0..1, z mood 0..1 (alarm), w stride (rad).
// ---------------------------------------------------------------------------
export const SEA_LION_GLSL = `
  float gait = aAnim.y, mood = aAnim.z, stride = aAnim.w;
  float side = aPivot.x > 0.0 ? 1.0 : -1.0;
  // The neck turn, shared by the head and the eyes (same pivot).
  float scan = sin(uTime * 0.5 + aAnim.x * 2.0);
  float neckLift = mix(0.3 + scan * 0.22, 0.1, min(gait, 1.0)) * (1.0 - mood * 0.4);
  float neckYaw = scan * 0.35 * (1.0 - gait);
  if (aPart < 0.5) {
    // Torso: the swim's body wave reads at the hindquarters (a sea lion
    // swims by vertical undulation); at rest, the slow breath of the coat.
    float wave = sin(stride - transformed.z * 2.4)
      * 0.05 * gait * smoothstep(0.4, -0.55, transformed.z);
    transformed.y += wave + sin(uTime * 1.8 + aAnim.x) * 0.008 * (1.0 - gait);
  } else if (aPart < 1.5) {
    // Neck and head: lifted and scanning while the animal loafs, low and
    // steady once it is moving — the bull's posture at the haul-out.
    transformed = wlRotX(transformed, aPivot, neckLift);
    transformed = wlRotY(transformed, aPivot, neckYaw);
  } else if (aPart > 2.5 && aPart < 3.5) {
    transformed = wlRotX(transformed, aPivot, neckLift);
    transformed = wlRotY(transformed, aPivot, neckYaw);
  }
  if (aPart > 4.5 && aPart < 6.5) {
    // Fore flippers: the crawl's scratch-and-prop, each in turn, the blade
    // kept against the flank; rowing oars, opposed, in the swim.
    float scratch = max(0.0, sin(uTime * 1.7 + aAnim.x + side * 1.3)) * 0.3 * (1.0 - gait);
    float row = sin(stride + (side > 0.0 ? 0.0 : 3.14159)) * 0.45 * gait;
    transformed = wlRotX(transformed, aPivot, row - scratch - 0.12);
    transformed = wlRotZ(transformed, aPivot, side * (0.08 + row * 0.3));
  } else if (aPart > 9.5 && aPart < 11.5) {
    // Hind flippers: streamed ashore, sculling together in the swim.
    float stream = 0.3 * (1.0 - gait);
    transformed = wlRotX(transformed, aPivot, sin(stride + 1.2) * 0.5 * gait + stream);
  } else if (aPart > 11.5) {
    // Tail: a quarter turn behind the hind flippers' beat.
    transformed = wlRotX(transformed, aPivot, sin(stride + 2.4) * 0.5 * gait);
  }
`;

// ---------------------------------------------------------------------------
// Behaviour hooks (the manager's fear never fires — radius 0 — so the whole
// loaf-dive-surface cycle is this file's). The floor and "ashore?" are the
// amphibious motion's own answer (amphibiousFloor), so the step and the dive
// never disagree about where the rock ends.
//
// Nothing here knows the cove: the water it may use is its habitat's
// sampling region (the roster sets it — the cove's keeps it out past the
// wade barrier), and "off the rock" means away from the player.
// ---------------------------------------------------------------------------
const ASHORE = 0.95;       // amphFloor.k from which the body is on a top
const MARGIN = 4;          // m: kept inside the region's edges
const anchorsOf = sp => (sp.def.dive && sp.def.dive.anchors) || 'haulouts';

// A point of open water round rock s, between r0 and r1 from its centre,
// biased away from the player and kept inside the region. Module scratch.
const _w = { x: 0, z: 0 };
function openWater(sp, ctx, s, r0, r1) {
  const L = ctx.layout, rng = sp.rng, reg = sp.def.habitat.region;
  const away = Math.atan2(s.x - ctx.px, s.z - ctx.pz);
  for (let k = 0; k < 8; k++) {
    const th = away + (rng() - 0.5) * 2.2, r = r0 + rng() * (r1 - r0);
    let x = s.x + Math.sin(th) * r, z = s.z + Math.cos(th) * r;
    if (reg) {
      x = Math.min(reg.x[1] - MARGIN, Math.max(reg.x[0] + MARGIN, x));
      z = Math.min(reg.z[1] - MARGIN, Math.max(reg.z[0] + MARGIN, z));
    }
    _w.x = x; _w.z = z;
    amphibiousFloor(x, z, L, ctx.t, anchorsOf(sp));
    if (amphFloor.k === 0) return _w;
  }
  return _w;   // the last try: a skirt at worst, never land
}

// The dive. Loafing ashore, the timer runs out: bound for the water just
// off the rock (dive 1); once that walk ends in the sea, HIDDEN — the body
// sinks by the manager's own sink, and at full sink the draw leaves it out.
// The machine's EMERGE (the hook below surfaces it nearby) hands it back to
// MOVE, swimming for the rock: the cycle closes (dive 2 → 0) and the next
// slide is re-phased. Never takes the frame — the machine runs on.
function tick(a, sp, ctx, dt, api, threat) {
  const S = ctx.STATE, L = ctx.layout;
  a.y = amphibiousFloor(a.x, a.z, L, ctx.t, anchorsOf(sp));
  const ashore = amphFloor.k > ASHORE;
  if (a.dive === undefined) { a.dive = 0; a.diveT = 8 + sp.rng() * 22; }

  if (a.dive === 0) {
    if (a.state === S.IDLE && ashore) {
      a.diveT -= dt;
      if (a.diveT <= 0) {
        const s = L.spots[anchorsOf(sp)].nearest(a.x, a.z, 40).spot;
        if (s) {
          const w = openWater(sp, ctx, s, s.r + 2.5, s.r + 6.5);
          api.setTarget(a, sp, w.x, w.z);
          a.state = S.MOVE;
          a.timer = sp.rng.range(sp.def.timings.move);
          a.dive = 1;
        }
      }
    }
  } else if (a.dive === 1) {
    if (a.state === S.IDLE && !ashore) {
      // In the water and stopped: under it goes.
      a.state = S.HIDDEN;
      a.timer = sp.rng.range(sp.def.fear.hideFor);
      a.dive = 2;
    } else if (a.state === S.IDLE && ashore) {
      // Never made it off — phase the next try.
      a.dive = 0;
      a.diveT = 2 + sp.rng() * 5;
    }
  } else if (a.dive === 2 && a.state === S.MOVE) {
    // Surfaced after EMERGE, swimming for the rock: the dive is done.
    a.dive = 0;
    a.diveT = 14 + sp.rng() * 30;
  }
  return false;
}

// IDLE → MOVE: ashore, a stroll across the rock toward its far side; in the
// water, a lazy circle a little outside the rock's skirt. The dive's own
// slide is the tick's, not this.
function pickWander(a, sp, ctx, api) {
  const L = ctx.layout;
  const rocks = L.spots[anchorsOf(sp)];
  const s = rocks ? rocks.nearest(a.x, a.z, 40).spot : null;
  if (!s) { api.defaultWander(a, sp); return; }
  amphibiousFloor(a.x, a.z, L, ctx.t, anchorsOf(sp));
  if (amphFloor.k > ASHORE) {
    const th = sp.rng() * Math.PI * 2, r = s.r * (0.15 + sp.rng() * 0.55);
    api.setTarget(a, sp, s.x + Math.sin(th) * r, s.z + Math.cos(th) * r);
  } else {
    const w = openWater(sp, ctx, s, s.r + 1.2, s.r + 4.7);
    api.setTarget(a, sp, w.x, w.z);
  }
}

// EMERGE: surface somewhere else nearby, in open water off the rock, while
// the body is still under (sink 1: the draw leaves it out, so the
// reposition never shows).
function emergeAt(a, sp, ctx, api) {
  const L = ctx.layout;
  const rocks = L.spots[anchorsOf(sp)];
  const s = (rocks && rocks.nearest(a.x, a.z, 40).spot) || { x: a.x, z: a.z, r: 2 };
  const w = openWater(sp, ctx, s, s.r + 1.5, s.r + 6.5);
  a.x = w.x; a.z = w.z;
  a.y = amphibiousFloor(a.x, a.z, L, ctx.t, anchorsOf(sp));
  a.heading = Math.atan2(s.x - a.x, s.z - a.z);
  a.tx = a.x; a.tz = a.z;
}

// ---------------------------------------------------------------------------
// The species definition. Every key is documented in WILDLIFE.md; anything
// left out takes wildlife.js's DEFAULTS, and a map may override any of it.
// `dive` is the amphibious motion's knob (documented there).
// ---------------------------------------------------------------------------
export const SEA_LION = {
  id: 'seaLion',
  motion: 'amphibious',
  count: 6,
  habitat: {
    // On a haul-out: within the rock's own radius of one — the keys read the
    // adapter's haulouts distance, which the spots' radii shape.
    within: { haulouts: 0.4 },
  },
  spacing: 2.2,
  homeRange: 8,                     // rock to water and back
  activeRadius: 95,                 // the show reads from the whole beach
  fear: {
    // Not frightened: the wade barrier keeps the player at the show's
    // distance. hideFor is the dive's length, calmDistance the surface-again
    // condition the HIDDEN state asks.
    radius: 0, calmDistance: 10, hideFor: [6, 14],
  },
  speed: { walk: 0.55, flee: 2.4, turn: 2.6 },   // the crawl; the swim rides
                                                 // dive.swim times it
  strideRate: 7,                    // the body wave: about a beat a second
  body: {
    yawOffset: 0, alignToGround: false,
    // Roughly one and a half times life size: the colony reads from the
    // beach, fifty metres off the rocks.
    lift: 0,
    // HIDDEN: a body-length under, and the draw leaves it out; EMERGE reads
    // as the surfacing.
    sinkDepth: 1.35, sinkTime: 1.6, scale: [1.15, 1.5],
  },
  dive: { swim: 2.4, anchors: 'haulouts' },   // the swim: walk * 2.4 ≈ 1.3 m/s
  timings: { idle: [6, 16], move: [4, 10], alert: 0 },
  build: buildSeaLion,
  animGLSL: SEA_LION_GLSL,
  // Individual variation: a little lighter or darker, a breath warmer or
  // greyer — the darkest read as the bulls (the instance colour multiplies
  // the vertex colours).
  tint(rng, c) {
    const k = 0.78 + rng() * 0.44, w = (rng() - 0.5) * 0.1;
    c.setRGB(k * (1 + w * 0.5), k * (1 + w * 0.1), k * (1 - w * 0.6));
  },
  hooks: { tick, pickWander, emergeAt },
};
