// cruiseGrandStair.js — the aft grand stair, promenade deck → pool deck.
//
// Modelled on the liner grand stair as it was actually built (Titanic's forward
// stair, Oceania Marina's Lalique double stair, the flared atrium stairs of the
// Celebrity Solstice class), then adjusted for the one thing they never had to
// survive: weather. This stair is OUTSIDE, on the aft deck.
//
//   • Two flights and a half landing. 7.5 m in one flight is a ladder; every
//     grand stair breaks at mid-height, and 42 risers of 17.9 cm on 30 cm
//     goings is what a person climbs without thinking about it.
//   • Wide at the foot, drawn in as it rises. The strings FLARE outward over
//     the first ten treads (Titanic's stringers were "curved or flared to allow
//     the stair width to shrink") and the two bottom steps are CURTAIL steps,
//     rounded round the newels. Every tread has a slightly bowed nosing.
//   • White marble — honed, not polished. Polished stone on an open deck is
//     a skating rink in the first shower, so the treads are matt and carry a
//     bronze anti-slip nosing strip, as exterior stone stairs on ships do.
//   • "Chandeliers" in the French sense: bronze CANDELABRA on the bottom
//     newels (Titanic's D-deck stair ended on an electrically lit gilt
//     candelabra), sealed frosted globes. A crystal chandelier hanging over an
//     open deck at sea is not a thing anyone builds, so there isn't one.
//   • Turned bronze balusters at ≈11 cm clear (guard rule for passenger
//     areas), a varnished hardwood handrail 1 m above the nosings.
//
// Visual only. The caller emits the walkable treads and the solid strings as
// invisible collision boxes from the same layout: curved treads have no
// honest AABB, and a plain Group under `world` is ignored by cityBoxes.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const STRING_T = 0.32;     // closed marble string, thickness
const STRING_UP = 0.30;    // string top above the nosing line
const RAIL_UP = 1.0;       // handrail centre above the nosing line
const BOW = 0.08;          // sagitta of a tread's bowed nosing

export function grandStairLayout({ deckY, topY, zTop }) {
  const N = 42, LAND = 21;                 // risers; riser 21 steps onto the landing
  const rise = (topY - deckY) / N;
  const going = 0.30, landing = 2.4;
  const zLand1 = zTop - (N - LAND - 1) * going;   // riser 22, foot of the upper flight
  const zLand0 = zLand1 - landing;                // riser 21, front of the landing
  const z1 = zLand0 - (LAND - 1) * going;         // riser 1
  const LOWER = 3.0, UPPER = 2.5, FLARE = 1.4;
  const nosingZ = k => k > N - 1 ? zTop
    : k <= LAND ? z1 + (k - 1) * going : zLand1 + (k - LAND - 1) * going;
  // Inner face of the strings: flared at the foot of each flight.
  const halfWidth = z => {
    if (z <= zLand0) { const t = Math.max(0, 1 - (z - z1) / 3.0); return LOWER + FLARE * t * t; }
    if (z <= zLand1) return LOWER;
    const t = Math.max(0, 1 - (z - zLand1) / 2.0);
    return UPPER + (LOWER - UPPER) * t * t;
  };
  // The nosing line, flat across the landing.
  const pitchY = z => deckY + (z <= zLand0
    ? rise * (1 + (z - z1) / going)
    : Math.max(LAND * rise, rise * (LAND + 1 + (z - zLand1) / going)));
  // Curtail steps 1 and 2 curl concentrically round the newel.
  const newelZ = z1 + 0.62;
  const newelX = halfWidth(newelZ) + STRING_T / 2;
  const curtail = { 1: 0.62, 2: 0.32 };
  return { N, LAND, rise, going, deckY, topY, zTop, z1, zLand0, zLand1, upperHalf: UPPER,
    nosingZ, halfWidth, pitchY, newelZ, newelX, curtail, STRING_T, STRING_UP, RAIL_UP };
}

// Tread k's core half width: into the string, or out to the newel for a curtail.
export function treadHalf(L, k) {
  return L.curtail[k] ? L.newelX : L.halfWidth(L.nosingZ(k)) + 0.04;
}

function marbleTexture() {
  const S = 1024;
  const c = Object.assign(document.createElement('canvas'), { width: S, height: S });
  const g = c.getContext('2d');
  let seed = 9127;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  // Everything is drawn nine times so the tile wraps without a seam.
  const wrapped = fn => {
    for (const dx of [-S, 0, S]) for (const dy of [-S, 0, S]) {
      g.save(); g.translate(dx, dy); fn(); g.restore();
    }
  };
  g.fillStyle = '#f3f1ec';
  g.fillRect(0, 0, S, S);
  // Soft grey clouding in the body of the stone.
  for (let i = 0; i < 70; i++) {
    const x = rnd() * S, y = rnd() * S, r = 60 + rnd() * 220, a = 0.03 + rnd() * 0.05;
    wrapped(() => {
      const grd = g.createRadialGradient(x, y, 0, x, y, r);
      grd.addColorStop(0, `rgba(190,186,180,${a})`);
      grd.addColorStop(1, 'rgba(190,186,180,0)');
      g.fillStyle = grd;
      g.fillRect(x - r, y - r, 2 * r, 2 * r);
    });
  }
  // Veins: a random walk on a shared diagonal drift, a faint halo round a
  // sharper core, with hairline branches. Warm grey, Carrara rather than
  // Calacatta — gold veining reads as dirt at this scale.
  const vein = (x, y, ang, len, width, alpha) => {
    const pts = [[x, y]];
    for (let s = 0; s < len; s += 7) {
      ang += (rnd() - 0.5) * 0.35;
      x += Math.cos(ang) * 7; y += Math.sin(ang) * 7;
      pts.push([x, y]);
    }
    wrapped(() => {
      g.beginPath();
      g.moveTo(pts[0][0], pts[0][1]);
      for (const p of pts) g.lineTo(p[0], p[1]);
      g.lineCap = 'round'; g.lineJoin = 'round';
      g.strokeStyle = `rgba(150,144,136,${alpha * 0.22})`; g.lineWidth = width * 5; g.stroke();
      g.strokeStyle = `rgba(128,122,116,${alpha})`; g.lineWidth = width; g.stroke();
    });
    return pts;
  };
  for (let i = 0; i < 9; i++) {
    const pts = vein(rnd() * S, rnd() * S, 0.55 + (rnd() - 0.5) * 0.5,
      500 + rnd() * 900, 0.9 + rnd() * 1.4, 0.20 + rnd() * 0.18);
    for (let b = 0; b < 4; b++) {
      const p = pts[Math.floor(rnd() * pts.length)];
      vein(p[0], p[1], 0.55 + (rnd() - 0.5) * 2.2, 80 + rnd() * 260, 0.6, 0.18 + rnd() * 0.12);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(0.42, 0.42);              // UVs are in metres: one tile ≈ 2.4 m
  t.anisotropy = 8;
  return t;
}

// An indexed strip between two point rows, normals smoothed along the run,
// wound to face `outward` (tested on the first quad). Returned non-indexed so
// it merges with the extrusions.
function ribbon(rowA, rowB, uvA, uvB, outward) {
  const pos = [], uv = [], idx = [];
  for (let i = 0; i < rowA.length; i++) {
    pos.push(...rowA[i], ...rowB[i]);
    uv.push(...uvA[i], ...uvB[i]);
  }
  for (let i = 0; i < rowA.length - 1; i++) {
    const a = 2 * i, b = a + 1, c = a + 2, d = a + 3;
    idx.push(a, c, b, b, c, d);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const n = geo.getAttribute('normal');
  if (n.getX(0) * outward[0] + n.getY(0) * outward[1] + n.getZ(0) * outward[2] < 0) {
    for (let i = 0; i < idx.length; i += 3) [idx[i + 1], idx[i + 2]] = [idx[i + 2], idx[i + 1]];
    geo.setIndex(idx);
    geo.computeVertexNormals();
  }
  return geo.toNonIndexed();
}

export function buildGrandStair(L, { bulb }) {
  const group = new THREE.Group();
  group.name = 'aft-grand-stair';
  const marble = new THREE.MeshStandardMaterial({
    map: marbleTexture(), color: 0xffffff, roughness: 0.42, metalness: 0,
  });
  const bronze = new THREE.MeshStandardMaterial({
    color: 0xb38b4d, roughness: 0.34, metalness: 0.86,
  });
  const handrailWood = new THREE.MeshStandardMaterial({
    color: 0x5a2f1c, roughness: 0.32, metalness: 0,
  });
  const marbleParts = [], bronzeParts = [], bulbParts = [];
  const place = (list, geo, x, y, z, ry = 0) => {
    const m = new THREE.Matrix4().makeRotationY(ry).setPosition(x, y, z);
    list.push(geo.clone().applyMatrix4(m));
  };

  // --- Treads -------------------------------------------------------------
  // Each tread is a solid extrusion from the deck to its own top: the stack
  // reads as one carved mass from the side, and only each nosing shows.
  const base = L.deckY - 0.02, BEV = 0.012;
  for (let k = 1; k < L.N; k++) {
    const zf = L.nosingZ(k);
    const hw = treadHalf(L, k);
    const R = L.curtail[k];
    const zb = Math.max(L.nosingZ(k + 1) + 0.06, R ? L.newelZ + R : -Infinity);
    // Shape space is (x, -z): extruding along +Z then rotating -90° about X
    // stands it up with shape y → world -z.
    const s = new THREE.Shape();
    s.moveTo(-hw, -zf);
    s.quadraticCurveTo(0, -(zf - 2 * BOW), hw, -zf);
    if (R) s.absarc(hw, -L.newelZ, R, Math.PI / 2, -Math.PI / 2, true);
    // A curtail's back edge is exactly newelZ + R (zb takes the max), so the
    // arcs meet the straight runs without a doubled vertex.
    if (!R) s.lineTo(hw, -zb);
    s.lineTo(-hw, -zb);
    if (R) s.absarc(-hw, -L.newelZ, R, 1.5 * Math.PI, 0.5 * Math.PI, true);
    s.closePath();
    const top = L.deckY + k * L.rise;
    const geo = new THREE.ExtrudeGeometry(s, {
      depth: top - base - 2 * BEV, curveSegments: 18,
      bevelEnabled: true, bevelThickness: BEV, bevelSize: BEV, bevelSegments: 2,
    });
    geo.rotateX(-Math.PI / 2);
    geo.translate(0, base + BEV, 0);
    marbleParts.push(geo);

    // Bronze anti-slip nosing insert, following the bow.
    if (k !== L.LAND) {
      const a = hw - (R ? 0 : 0.12), n = 14, front = [], back = [];
      for (let i = 0; i <= n; i++) {
        const x = -a + (2 * a * i) / n;
        const bow = BOW * (1 - (x / hw) ** 2);
        front.push([x, -(zf - bow + 0.035)]);
        back.push([x, -(zf - bow + 0.075)]);
      }
      const strip = new THREE.Shape(front.map(([x, y]) => new THREE.Vector2(x, y))
        .concat(back.reverse().map(([x, y]) => new THREE.Vector2(x, y))));
      const sg = new THREE.ExtrudeGeometry(strip, { depth: 0.004, bevelEnabled: false });
      sg.rotateX(-Math.PI / 2);
      sg.translate(0, top - 0.001, 0);
      bronzeParts.push(sg);
    }
  }

  // --- Strings --------------------------------------------------------------
  // Closed marble strings from the deck to 30 cm above the nosings, following
  // the flare. Sampled densely and smoothed so the curve does not facet.
  const zs = [];
  for (let z = L.newelZ; z < L.zTop; z += 0.12) zs.push(z);
  zs.push(L.zTop);
  for (const side of [-1, 1]) {
    const inB = [], inT = [], outB = [], outT = [], uvB = [], uvT = [];
    let run = 0;
    zs.forEach((z, i) => {
      const xi = side * L.halfWidth(z), xo = side * (L.halfWidth(z) + STRING_T);
      const yT = L.pitchY(z) + STRING_UP;
      if (i) run += Math.hypot(zs[i] - zs[i - 1], L.halfWidth(zs[i]) - L.halfWidth(zs[i - 1]));
      inB.push([xi, base, z]); inT.push([xi, yT, z]);
      outB.push([xo, base, z]); outT.push([xo, yT, z]);
      uvB.push([run, base]); uvT.push([run, yT]);
    });
    marbleParts.push(ribbon(outB, outT, uvB, uvT, [side, 0, 0]));
    marbleParts.push(ribbon(inB, inT, uvB, uvT, [-side, 0, 0]));
    marbleParts.push(ribbon(inT, outT,
      zs.map((z, i) => [uvT[i][0], 0]), zs.map((z, i) => [uvT[i][0], STRING_T]), [0, 1, 0]));
    // Finished end where the string meets the pool deck.
    const e = zs.length - 1;
    marbleParts.push(ribbon([inB[e], outB[e]], [inT[e], outT[e]],
      [[0, base], [STRING_T, base]], [[0, inT[e][1]], [STRING_T, inT[e][1]]], [0, 0, 1]));
  }

  // --- Balusters and handrail ----------------------------------------------
  const balusterGeo = new THREE.LatheGeometry([
    [0.20, 0.00], [0.20, 0.05], [0.13, 0.09], [0.13, 0.14], [0.17, 0.20],
    [0.10, 0.30], [0.075, 0.44], [0.115, 0.56], [0.15, 0.68], [0.13, 0.80],
    [0.085, 0.86], [0.085, 0.92], [0.16, 0.96], [0.16, 1.00], [0.0, 1.00],
  ].map(([r, y]) => new THREE.Vector2(r, y)), 10);
  const balH = RAIL_UP - STRING_UP - 0.03;
  const balusters = [];
  const midX = z => L.halfWidth(z) + STRING_T / 2;
  for (const side of [-1, 1]) {
    // Walk the string at 13 cm along the slope: 6–7 cm turned bronze, so the
    // clear gap stays near 11 cm.
    let z = L.newelZ + 0.42, acc = 0, prev = null;
    for (; z < L.zTop - 0.25; z += 0.01) {
      const p = new THREE.Vector3(side * midX(z), L.pitchY(z) + STRING_UP, z);
      if (prev) acc += p.distanceTo(prev);
      prev = p;
      if (!acc || acc >= 0.13) { balusters.push(p); acc = 0; }
    }
  }
  const balMesh = new THREE.InstancedMesh(balusterGeo, bronze, balusters.length);
  const m4 = new THREE.Matrix4();
  balusters.forEach((p, i) => {
    m4.makeScale(0.32, balH, 0.32).setPosition(p);
    balMesh.setMatrixAt(i, m4);
  });
  balMesh.castShadow = true;
  balMesh.computeBoundingSphere();
  group.add(balMesh);

  const railMeshes = [];
  for (const side of [-1, 1]) {
    const pts = [];
    for (let z = L.newelZ + 0.30; z <= L.zTop - 0.18; z += 0.3)
      pts.push(new THREE.Vector3(side * midX(z), L.pitchY(z) + RAIL_UP, z));
    const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
    const tube = new THREE.TubeGeometry(curve, pts.length * 4, 0.042, 10, false);
    railMeshes.push(tube);
    // A bronze ball where the rail starts, just above the candelabrum plinth.
    place(bronzeParts, new THREE.SphereGeometry(0.06, 14, 10), pts[0].x, pts[0].y, pts[0].z);
  }
  const rail = new THREE.Mesh(mergeGeometries(railMeshes), handrailWood);
  rail.castShadow = true;
  group.add(rail);

  // --- Newels and candelabra -----------------------------------------------
  // The bottom newels are round marble pedestals standing on the curtail of
  // step 2, each carrying a five-light bronze candelabrum.
  const pedestal = new THREE.LatheGeometry([
    [0.30, 0], [0.30, 0.08], [0.26, 0.12], [0.235, 0.18], [0.235, 0.84],
    [0.27, 0.88], [0.30, 0.94], [0.30, 1.0], [0, 1.0],
  ].map(([r, y]) => new THREE.Vector2(r, y)), 28);
  const vase = new THREE.LatheGeometry([
    [0.16, 0], [0.16, 0.03], [0.09, 0.06], [0.12, 0.12], [0.07, 0.20],
    [0.045, 0.24], [0, 0.24],
  ].map(([r, y]) => new THREE.Vector2(r, y)), 16);
  const ARM_R = 0.19;
  // Lower half-torus, shifted so it leaves the stem at x = 0 and turns up at
  // x = 2R: the S of a candelabrum arm.
  const arm = new THREE.TorusGeometry(ARM_R, 0.018, 6, 14, Math.PI)
    .rotateZ(Math.PI).translate(ARM_R, 0, 0);
  const cup = new THREE.CylinderGeometry(0.045, 0.03, 0.07, 12);
  const globe = new THREE.SphereGeometry(0.085, 16, 12);
  const candelabrum = (x, y, z) => {
    place(marbleParts, pedestal, x, y, z);
    const y0 = y + 1.0;
    place(bronzeParts, vase, x, y0, z);
    const stemH = 1.05;
    place(bronzeParts, new THREE.CylinderGeometry(0.03, 0.04, stemH, 10).translate(0, stemH / 2, 0),
      x, y0 + 0.2, z);
    const ya = y0 + 0.2 + stemH - 0.22;
    for (let i = 0; i < 4; i++) {
      const ry = Math.PI / 4 + (i * Math.PI) / 2;
      place(bronzeParts, arm, x, ya, z, ry);
      const ax = x + Math.cos(ry) * 2 * ARM_R, az = z - Math.sin(ry) * 2 * ARM_R;
      place(bronzeParts, cup, ax, ya + 0.035, az);
      place(bulbParts, globe, ax, ya + 0.15, az);
    }
    place(bronzeParts, cup, x, y0 + 0.2 + stemH + 0.03, z);
    place(bulbParts, new THREE.SphereGeometry(0.105, 16, 12), x, y0 + 0.2 + stemH + 0.16, z);
  };
  for (const side of [-1, 1])
    candelabrum(side * L.newelX, L.deckY + 2 * L.rise, L.newelZ);

  // Single-globe bronze lamp standards on the strings at the landing and at
  // the head of the stair, where the pool deck rail picks up.
  const lampStandard = (x, z) => {
    const y = L.pitchY(z) + STRING_UP;
    const h = RAIL_UP - STRING_UP + 0.38;
    place(bronzeParts, new THREE.CylinderGeometry(0.06, 0.075, h, 12).translate(0, h / 2, 0), x, y, z);
    place(bronzeParts, cup, x, y + h + 0.03, z);
    place(bulbParts, new THREE.SphereGeometry(0.11, 16, 12), x, y + h + 0.17, z);
  };
  for (const side of [-1, 1]) {
    lampStandard(side * midX(L.zLand0 + 0.6), L.zLand0 + 0.6);
    lampStandard(side * midX(L.zLand1 - 0.6), L.zLand1 - 0.6);
    lampStandard(side * midX(L.zTop - 0.18), L.zTop - 0.18);
  }

  // Lathes and primitives are indexed, extrusions are not: merge them flat.
  const merged = parts => mergeGeometries(parts.map(g => g.index ? g.toNonIndexed() : g));
  const marbleMesh = new THREE.Mesh(merged(marbleParts), marble);
  marbleMesh.castShadow = marbleMesh.receiveShadow = true;
  const bronzeMesh = new THREE.Mesh(merged(bronzeParts), bronze);
  bronzeMesh.castShadow = true;
  const bulbMesh = new THREE.Mesh(merged(bulbParts), bulb);
  group.add(marbleMesh, bronzeMesh, bulbMesh);
  return group;
}
