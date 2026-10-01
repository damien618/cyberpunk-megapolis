// wildlifeDolphin.js — short-beaked common dolphins (Delphinus delphis), a
// pod of them travelling the open water beyond the haul-outs, each breaking
// the surface in its own rhythm in a low, quick arc — the channel's most
// common sight from the boat, and from the beach on a calm day. A species
// module for wildlife.js (WILDLIFE.md walks through the shape via
// wildlifeCrab.js) — the first `porpoise` species: the pod's loop, the
// slots and the leaps live in wildlifeMotion.js; no hooks.
//
// Model: ~260 triangles, flat-shaded, vertex-coloured, one merged geometry.
// Local frame: +Z is the front (beak), +X its right, y = 0 the body's
// axis — the sea is its ground. Part ids read by DOLPHIN_GLSL: 0 body,
// 1 tail stock + flukes, 2 flippers.
import * as THREE from 'three';
import { creaturePart, limbGeometry, mergeCreatureParts } from './wildlife.js?v=20261001-pass8';

const COL = {
  back: 0x353b43,        // the dark cape
  flank: 0x8a8e93,       // grey flanks
  patch: 0xb9a77a,       // the tawny forward half of the hourglass
  belly: 0xe2dfd8,       // white below
  beak: 0x2d3238,
  eye: 0x0c0d0f,
};

// ---------------------------------------------------------------------------
// Model.
// ---------------------------------------------------------------------------
export function buildDolphin() {
  const parts = [];
  const part = (g, id, color, bottom, pivot) =>
    parts.push(creaturePart(g, { part: id, pivot, color, bottomColor: bottom }));
  const blob = (sx, sy, sz, x, y, z, id, color, bottom, seg = [8, 6]) => {
    const g = new THREE.SphereGeometry(1, seg[0], seg[1]);
    g.scale(sx, sy, sz).translate(x, y, z);
    part(g, id, color, bottom);
  };

  // Body: the dark cape over a grey spindle, the tawny flank patch ahead,
  // the white belly under it all.
  blob(0.19, 0.19, 0.74, 0, 0, 0, 0, COL.flank, COL.belly);
  blob(0.178, 0.14, 0.7, 0, 0.068, -0.02, 0, COL.back, COL.flank, [8, 4]);
  blob(0.18, 0.1, 0.3, 0, -0.02, 0.28, 0, COL.patch, COL.belly, [7, 4]);
  blob(0.16, 0.12, 0.62, 0, -0.07, 0.02, 0, COL.belly, COL.belly, [8, 4]);
  // The beak and the eyes.
  part(limbGeometry([0, -0.01, 0.68], [0, -0.03, 0.92], 0.075, 0.035), 0, COL.beak, COL.belly);
  for (const s of [-1, 1]) {
    part(new THREE.BoxGeometry(0.02, 0.02, 0.02).translate(s * 0.125, 0.02, 0.56), 0, COL.eye, COL.eye);
  }
  // The dorsal fin: a triangle (a three-sided prism, thin across) turned
  // so its apex points up and back — the falcate fin, raked.
  const fin = new THREE.CylinderGeometry(0.16, 0.16, 0.03, 3);
  fin.rotateZ(Math.PI / 2).rotateX(-2.07).translate(0, 0.17, -0.06);
  part(fin, 0, COL.back, COL.back);

  // The tail stock and the flukes, beating about the stock's root (1).
  const root = [0, 0, -0.55];
  part(limbGeometry([0, 0.01, -0.5], [0, 0.03, -0.98], 0.17, 0.06), 1, COL.back, COL.flank, root);
  for (const s of [-1, 1]) {
    part(new THREE.BoxGeometry(0.26, 0.022, 0.12).rotateY(s * 0.45).translate(s * 0.12, 0.03, -1.03),
      1, COL.back, COL.flank, root);
  }
  // The flippers, swept back and down (2).
  for (const s of [-1, 1]) {
    const sh = [s * 0.14, -0.08, 0.33];
    part(limbGeometry(sh, [s * 0.3, -0.17, 0.17], 0.09, 0.02), 2, COL.back, COL.flank, sh);
  }
  return { geometry: mergeCreatureParts(parts) };
}

// ---------------------------------------------------------------------------
// Animation, in the vertex shader (see makeCreatureMaterial for the inputs).
// aAnim: x idle phase, y gait 0..1, z mood 0..1, w stride (rad). The arc's
// pitch is the motion's a.pitch, applied to the whole instance.
// ---------------------------------------------------------------------------
export const DOLPHIN_GLSL = `
  float side = aPivot.x > 0.0 ? 1.0 : -1.0;
  if (aPart > 0.5 && aPart < 1.5) {
    // The flukes: the up-and-down stroke from the tail stock.
    transformed = wlRotX(transformed, aPivot, sin(uTime * 4.2 + aAnim.x) * 0.32);
  } else if (aPart > 1.5) {
    // The flippers: held out, trimming a little.
    transformed = wlRotZ(transformed, aPivot, side * sin(uTime * 1.3 + aAnim.x) * 0.12);
  } else {
    // The body: the stroke's ripple runs forward a little way.
    transformed.y += sin(uTime * 4.2 + aAnim.x + transformed.z * 2.0) * 0.015 * smoothstep(0.2, -0.5, transformed.z);
  }
`;

// ---------------------------------------------------------------------------
// The species definition. Every key is documented in WILDLIFE.md; anything
// left out takes wildlife.js's DEFAULTS, and a map may override any of it.
// `swim` is the porpoise motion's loop and leap knobs (documented there).
// ---------------------------------------------------------------------------
export const DOLPHIN = {
  id: 'dolphin',
  motion: 'porpoise',
  count: 5,
  habitat: {
    // The open sea — the one thing the keys cannot say.
    test: (x, z, layout) => {
      const w = layout.waterAt ? layout.waterAt(x, z) : null;
      return !!w && w.kind === 'sea';
    },
  },
  spacing: 4,
  homeRange: 10,
  activeRadius: 150,
  fear: { radius: 0 },
  speed: { walk: 4.2, flee: 8, turn: 3 },
  strideRate: 2,
  body: {
    alignToGround: false,
    // Life size: 2.0–2.3 m, beak to flukes.
    scale: [1.0, 1.12],
  },
  swim: { loopX: 42, loopZ: 10, period: [2.4, 3.6], leap: 0.3, height: 1.55, depth: 0.7, spread: 1.7 },
  timings: { idle: [0.2, 0.5], move: [20, 40], alert: 0 },
  continuous: true,
  build: buildDolphin,
  animGLSL: DOLPHIN_GLSL,
  tint(rng, c) { const k = 0.9 + rng() * 0.18; c.setRGB(k, k, k); },
  needs: ['waterAt'],
};
