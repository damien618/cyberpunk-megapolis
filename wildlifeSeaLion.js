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
// Model: ~380 triangles, flat-shaded, vertex-coloured, one merged geometry.
// Local frame: +Z is the front (muzzle, eyes), +X its right, y = 0 the
// belly — the rock top and the sea surface are both a sea lion's ground.
// Part ids read by SEA_LION_GLSL: 0 torso, 1 neck + head + muzzle, 3 eyes + ears,
// 5/6 fore flippers, 10/11 hind flippers, 12 tail.
import * as THREE from 'three';
import { creaturePart, limbGeometry, mergeCreatureParts } from './wildlife.js?v=20261001-sealion1';
import { amphibiousFloor, amphibiousBodyY, amphFloor } from './wildlifeMotion.js?v=20261001-sealion1';

const COL = {
  coat: 0x5b4130,        // the wet chocolate coat
  back: 0x4a3426,        // darker along the spine
  chest: 0x6e5039,       // the paler chest and throat
  under: 0x35261b,       // baked underside — the darker, wet belly
  muzzle: 0x8b6d52,      // the short pale muzzle
  nose: 0x1a1310,
  flipper: 0x2a1e16,     // the leathery flippers, near-black
  eye: 0x0b0806,
};

// ---------------------------------------------------------------------------
// Model. Hauled out, a sea lion is not a lump: the chest stands propped on
// two long fore flippers, the neck rises long and supple, the small head
// carries a pointed muzzle and two nubs of ears, and the body tapers away
// to hind flippers turned forward under the hips. That silhouette is what
// tells it from a seal, or from a turtle, at fifty metres.
// ---------------------------------------------------------------------------
export function buildSeaLion() {
  const parts = [];
  const part = (g, id, color, bottom, pivot) =>
    parts.push(creaturePart(g, { part: id, pivot, color, bottomColor: bottom }));
  const blob = (sx, sy, sz, x, y, z, id, color, bottom, pivot, seg = [7, 5]) => {
    const g = new THREE.SphereGeometry(1, seg[0], seg[1]);
    g.scale(sx, sy, sz).translate(x, y, z);
    part(g, id, color, bottom, pivot);
  };

  // Torso: a long spindle tapering to the hips, belly on y = 0, a darker
  // saddle along the spine; the chest rises in front of it, propped.
  blob(0.17, 0.16, 0.6, 0, 0.16, -0.16, 0, COL.coat, COL.under);
  blob(0.12, 0.08, 0.5, 0, 0.255, -0.16, 0, COL.back, COL.coat, undefined, [6, 4]);
  blob(0.16, 0.2, 0.22, 0, 0.27, 0.27, 0, COL.chest, COL.under);

  // Neck: long, rising from the chest (part 1 — the GLSL lowers it into the
  // swim and turns it while the animal loafs); the head on top, small and
  // long, the muzzle pointed, the ears two nubs.
  const neck = [0, 0.36, 0.36];
  part(limbGeometry([0, 0.33, 0.33], [0, 0.6, 0.47], 0.14, 0.095), 1, COL.coat, COL.chest, neck);
  blob(0.062, 0.062, 0.085, 0, 0.635, 0.5, 1, COL.coat, COL.chest, neck, [6, 4]);
  part(limbGeometry([0, 0.625, 0.56], [0, 0.6, 0.66], 0.065, 0.034), 1, COL.muzzle, COL.muzzle, neck);
  part(new THREE.BoxGeometry(0.03, 0.022, 0.02).translate(0, 0.603, 0.665), 1, COL.nose, COL.nose, neck);

  for (const s of [-1, 1]) {
    // Eyes and ears ride the neck's pivot too (part 3, turned with part 1).
    part(new THREE.BoxGeometry(0.018, 0.018, 0.018).translate(s * 0.045, 0.655, 0.545), 3, COL.eye, COL.eye, neck);
    part(new THREE.BoxGeometry(0.014, 0.024, 0.012).rotateZ(s * 0.4).translate(s * 0.05, 0.69, 0.48), 3, COL.back, COL.back, neck);
    // Fore flippers: from the shoulder down to the rock, the long blade
    // splayed out and forward — the props the chest stands on (5, 6).
    const id = s < 0 ? 5 : 6, sh = [s * 0.12, 0.25, 0.3];
    part(limbGeometry(sh, [s * 0.2, 0.03, 0.4], 0.075, 0.05), id, COL.coat, COL.under, sh);
    part(new THREE.BoxGeometry(0.1, 0.014, 0.24).rotateY(s * 0.55).translate(s * 0.27, 0.012, 0.47),
      id, COL.flipper, COL.flipper, sh);
    // Hind flippers: turned forward under the hips, the webbed blades
    // splayed on the rock (10, 11); in the swim they trail and beat.
    const hip = [s * 0.07, 0.07, -0.66];
    part(limbGeometry(hip, [s * 0.13, 0.015, -0.78], 0.06, 0.035), 10 + (s < 0 ? 0 : 1), COL.coat, COL.under, hip);
    part(new THREE.BoxGeometry(0.11, 0.012, 0.18).rotateY(-s * 0.35).translate(s * 0.17, 0.008, -0.86),
      10 + (s < 0 ? 0 : 1), COL.flipper, COL.flipper, hip);
  }
  // The short tail, between the hind flippers (part 12).
  part(limbGeometry([0, 0.07, -0.72], [0, 0.04, -0.82], 0.04, 0.015), 12, COL.flipper, COL.flipper);

  return { geometry: mergeCreatureParts(parts) };
}

// ---------------------------------------------------------------------------
// Animation, in the vertex shader (see makeCreatureMaterial for the inputs).
// aAnim: x idle phase, y gait 0..1, z mood 0..1, w stride (rad).
// ---------------------------------------------------------------------------
export const SEA_LION_GLSL = `
  float gait = aAnim.y, mood = aAnim.z, stride = aAnim.w;
  float side = aPivot.x > 0.0 ? 1.0 : -1.0;
  // Two gaits: the crawl ashore reads gait ~0.35 (0.55 m/s of a 2.4 flee),
  // the swim ~0.9 (dive.swim × the crawl) — told apart here.
  float swim = smoothstep(0.55, 0.8, gait);
  float crawl = smoothstep(0.05, 0.25, gait) * (1.0 - swim);
  // The neck: up and looking about while it loafs (now and then the head
  // thrown back in a bark), laid forward along the water in the swim.
  float scan = sin(uTime * 0.45 + aAnim.x * 2.0);
  float bark = pow(max(0.0, sin(uTime * 0.31 + aAnim.x * 5.0)), 24.0);
  float neckX = 0.75 * swim + 0.15 * crawl - (0.45 * bark) * (1.0 - swim) + sin(uTime * 0.9 + aAnim.x) * 0.05 * (1.0 - swim);
  float neckY = scan * 0.5 * (1.0 - swim);
  if (aPart < 0.5) {
    // Torso: the breath while it lies; in the swim the body's wave runs
    // back to the hips (a sea lion drives with its fore flippers, the rest
    // follows), and the chest lowers to swim flat.
    float wave = sin(stride - transformed.z * 3.0) * 0.04 * swim * smoothstep(0.3, -0.6, transformed.z);
    transformed.y += wave + sin(uTime * 1.6 + aAnim.x) * 0.006 * (1.0 - swim);
    transformed = wlRotX(transformed, vec3(0.0, 0.16, -0.1), 0.18 * swim * smoothstep(-0.1, 0.3, transformed.z));
  } else if (aPart < 3.5) {
    transformed = wlRotX(transformed, aPivot, neckX);
    transformed = wlRotY(transformed, aPivot, neckY);
  }
  if (aPart > 4.5 && aPart < 6.5) {
    // Fore flippers: propping ashore, a lazy lift of one now and then (the
    // scratch); swept back and beating together in the swim — the stroke
    // that drives a sea lion through the water.
    float scratch = pow(max(0.0, sin(uTime * 0.7 + aAnim.x + side * 2.0)), 6.0) * 0.6 * (1.0 - swim) * (1.0 - crawl);
    float step = sin(stride + (side > 0.0 ? 0.0 : 3.14159)) * 0.4 * crawl;
    float beat = sin(stride) * 0.45 * swim;
    transformed = wlRotX(transformed, aPivot, -scratch - step + 0.75 * swim);
    transformed = wlRotZ(transformed, aPivot, side * (beat - 0.15 * swim));
  } else if (aPart > 9.5 && aPart < 11.5) {
    // Hind flippers: forward under the hips ashore, trailed and steering in
    // the swim.
    transformed = wlRotX(transformed, aPivot, -0.5 * swim + sin(stride + 1.2) * 0.25 * swim);
  } else if (aPart > 11.5) {
    transformed = wlRotX(transformed, aPivot, sin(stride + 2.4) * 0.3 * swim);
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
const ASHORE = 0.6;        // amphFloor.k from which the body is up on the rock
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
  a.y = amphibiousBodyY(a.x, a.z, L, ctx.t, sp.def.dive);
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
    const th = sp.rng() * Math.PI * 2, r = s.r * (0.1 + sp.rng() * 0.3);   // on the crown
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
  a.y = amphibiousBodyY(a.x, a.z, L, ctx.t, sp.def.dive);
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
    // …and up on the rock itself, not on its bounding circle's water: the
    // amphibious floor's own measure of how far up a rock the point is.
    test: (x, z, layout) => {
      amphibiousFloor(x, z, layout, 0);
      return amphFloor.k > 0.6;
    },
  },
  spacing: 1.4,                     // a colony lies close, never on one another
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
    sinkDepth: 1.35, sinkTime: 1.6, scale: [1.05, 1.4],   // 1.7–2.3 m, cows to bulls
  },
  dive: { swim: 2.4, anchors: 'haulouts' },   // the swim: walk * 2.4 ≈ 1.3 m/s
  timings: { idle: [6, 16], move: [4, 10], alert: 0 },
  build: buildSeaLion,
  animGLSL: SEA_LION_GLSL,
  // Individual variation: a little lighter or darker, a breath warmer or
  // greyer — the darkest read as the bulls (the instance colour multiplies
  // the vertex colours).
  // A colony: the bulls a deep chocolate, the cows and the young paler and
  // tawny (about two in three) — the instance colour multiplies the coat.
  tint(rng, c) {
    if (rng() < 0.35) { const k = 0.72 + rng() * 0.12; c.setRGB(k, k * 0.96, k * 0.92); }
    else { const k = 1.12 + rng() * 0.22; c.setRGB(k * 1.08, k, k * 0.82); }
  },
  // The wet coat's sheen.
  roughness: 0.42,
  metalness: 0.08,
  needs: ['spots.haulouts'],
  hooks: { tick, pickWander, emergeAt },
};
