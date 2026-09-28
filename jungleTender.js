// jungleTender.js — the little wooden water-taxi moored along the jetty's
// east flank, and everything that makes it read as one: a lofted hull with a
// raked stem and a broad transom, a plank deck, passenger benches, a helm
// console, an outboard on the transom, an awning on wooden posts, fenders
// and the mooring lines up to the jetty's pilings.
//
// SHAPE: three 1-D curves shared by everything — halfBeam(t), deckYAt(t),
// bottomYAt(t) for the station t in [0 = transom, 1 = stem tip] — so the
// hull loft, the fenders, the cleats and the awning posts all sit on the
// same surface and nothing floats a hand's width off the planking. The hull
// is one BufferGeometry (16 stations x 18 ring points + transom cap, the
// main-BEACH.js loft pattern) with the paint baked into vertex colours:
// antifouling below the waterline, a white boot stripe, turquoise topsides
// worn to bare wood at the bow, natural wood for the cap rail, the rub
// strake and the deck planks.
//
// FLOATING: the group's origin is the design waterline. update(t, dt) asks
// the map's ocean (waterHeightAt — see the note in jungleOcean.js) plus a
// small lee swell of its own at four points of the hull (stem, transom,
// each side), takes the heave from their mean and pitch/roll from the
// fore-aft and cross differences, and follows them on damped springs.
import * as THREE from 'three';
import { JETTY, SEA_Y } from './jungleLayout.js';

// Per-map tuning, overlay-able section by section (jungleOcean's contract).
export const TENDER_PRESET = {
  topside: 0x2cb4a6,    // the turquoise paint
  antifoul: 0x8a4434,   // brick red below the waterline
  boot: 0xf1ead9,       // the white boot stripe (and the transom, classic)
  wearWood: 0x9c7d58,   // bare wood where the paint gave up
  strake: 0x6f5638,     // the rub strake, darker wood
  deck: 0xb08a5e,       // warm plank, deck and benches
  deckDark: 0x8f6c46,   // alternate planks
  frame: 0x5e4a36,      // posts, pedestal, cleats — the piling brown
  canvas: 0xece5d2,     // awning cream
  engine: 0x39424b,     // outboard anthracite
  fender: 0x2a4a66,     // navy fenders
  rope: 0xcdb08b,
  red: 0xd9503c,        // the ring buoy's bands
};

// Hull table. t: 0 = transom, 1 = stem tip; z runs +LOA/2 aft, -LOA/2 fwd.
const LOA = 6.4, BEAM = 2.1;
const clamp01 = v => (v < 0 ? 0 : v > 1 ? 1 : v);
const sstep = v => { v = clamp01(v); return v * v * (3 - 2 * v); };

function halfBeam(t) {
  // Broad aft, fullest just forward of midship, a long fine entrance that
  // keeps a sliver of stem width so the loft stays manifold.
  const nose = Math.pow(Math.cos(clamp01((t - 0.42) / 0.58) * Math.PI * 0.5), 0.85);
  const aft = Math.min(1, 0.96 + 0.04 * Math.sin(clamp01(t / 0.42) * Math.PI * 0.5));
  return 0.5 * BEAM * aft * (0.055 + 0.945 * nose);
}
function deckYAt(t) { return 0.62 + 0.30 * Math.pow(t, 2.4); }  // sheer rise
function bottomYAt(t) {
  if (t < 0.12) return -0.18 - 0.16 * sstep(t / 0.12);          // raked transom run
  if (t <= 0.88) return -0.34;                                  // full draft amidships
  return -0.34 + 0.52 * sstep((t - 0.88) / 0.12);               // the stem cuts up
}
const BOX = new THREE.BoxGeometry(1, 1, 1);

// The hull is an OPEN boat: one closed cross-section per station, wound
// starboard rail -> down the outside -> keel -> port rail -> across the cap
// rail -> down the inside (the ceiling) -> across the sole -> up the
// starboard ceiling -> back over the cap rail. The sole sits above the
// design waterline (SOLE_Y) — below it, the sea plane would show through
// the cockpit. At the transom station and from the foredeck forward the
// sole is lifted to the rail, so the loft itself closes the cockpit: the
// transom board and the foredeck's bulkhead are just steep spans between
// two close stations. Hard corners (rail edges, the sole's chines) carry a
// duplicated vertex so computeVertexNormals does not smear light across
// them, and the paint changes crisply there.
//
// The paint is chosen per vertex by its ROLE in the ring (a height test can
// never work — the ring only has vertices where the profile changes): the
// cap rail is dark wood, the topsides turquoise in two bands, a darker rub
// strake between them, the boot stripe white, everything below antifouling,
// the ceiling bare wood, and the sole planks alternate by station.
const SOLE_Y = 0.15, SKIN = 0.045;
const STATIONS = [0, 0.015];                    // transom board, then the cockpit
for (let i = 1; i <= 13; i++) STATIONS.push(i / 16);
STATIONS.push(0.84, 0.855, 0.9, 0.95, 1);       // bulkhead, then the foredeck
const DECKED = t => t < 0.01 || t > 0.85;       // sole raised flush with the rail

function makeHullGeo(P) {
  const pos = [], col = [], ind = [];
  const cTop = new THREE.Color(P.topside), cFoul = new THREE.Color(P.antifoul),
    cBoot = new THREE.Color(P.boot), cWear = new THREE.Color(P.wearWood),
    cStrake = new THREE.Color(P.strake), cDeck = new THREE.Color(P.deck),
    cDeckD = new THREE.Color(P.deckDark), cRail = new THREE.Color(P.frame),
    tmp = new THREE.Color();
  const jitter = i => {          // hand-painted variation, deterministic
    const n = Math.sin(i * 12.9898) * 43758.5453;
    return 1 + ((n - Math.floor(n)) - 0.5) * 0.07;
  };

  let ring = 0;
  const rings = [];
  STATIONS.forEach((t, iz) => {
    const w = halfBeam(t), yDeck = deckYAt(t), yBot = bottomYAt(t), d = yDeck - yBot;
    const yBoot = yBot + 0.28 * d;      // the boot stripe rides the hull, so
    const yPaint = yBoot + 0.18;        // the bands never fold at the stem
    const outer = [                     // starboard half, rail to keel
      [w * 1.00, yDeck],
      [w * 0.99, yDeck - 0.07],
      [w * 0.98, yDeck - d * 0.42],
      [w * 0.92, yPaint],
      [w * 0.80, yBoot],
      [w * 0.55, yBot + d * 0.12],
      [w * 0.17, yBot + 0.02],
      [0, yBot],
    ];
    // Half-breadth of the outside at height y: the ceiling is laid a skin
    // inside it, so the planking never shows through from within.
    const outerX = y => {
      for (let k = 1; k < outer.length; k++) {
        const [x0, y0] = outer[k - 1], [x1, y1] = outer[k];
        if (y <= y0 && y >= y1) return x0 + (x1 - x0) * (y0 - y) / (y0 - y1 || 1);
      }
      return 0;
    };
    const skin = Math.min(SKIN, w * 0.3);
    const ySole = DECKED(t) ? yDeck : Math.max(SOLE_Y, yBot + d * 0.12 + skin);
    const inner = [0, 0.3, 0.65, 1].map(s => {
      const y = yDeck + (ySole - yDeck) * s;
      return [Math.max(0, outerX(y) - skin * (1 + 0.6 * s)), y];
    });
    const plank = Math.round(t * 16) % 2 ? cDeckD : cDeck;
    const topside = () => {
      const wear = 0.55 * sstep((t - 0.72) / 0.28) + 0.30 * (1 - sstep(t / 0.10));
      return tmp.copy(cTop).lerp(cWear, Math.min(0.6, Math.max(0, wear))).clone();
    };
    const outerCol = [topside(), topside(), cStrake, topside(), cBoot, cFoul, cFoul, cFoul];
    const rs = [];                      // [x, y, colour] round the section
    const push = (x, y, c) => rs.push([x, y, c]);
    for (let k = 0; k < 8; k++) push(outer[k][0], outer[k][1], outerCol[k]);
    for (let k = 6; k >= 0; k--) push(-outer[k][0], outer[k][1], outerCol[k]);
    push(-w, yDeck, cRail);                                    // port cap rail
    push(-inner[0][0], inner[0][1], cRail);
    for (let s = 0; s < 4; s++) push(-inner[s][0], inner[s][1], DECKED(t) ? plank : cWear);
    push(-inner[3][0], ySole, plank);                          // port chine
    push(0, ySole, plank);
    push(inner[3][0], ySole, plank);                           // starboard chine
    for (let s = 3; s >= 0; s--) push(inner[s][0], inner[s][1], DECKED(t) ? plank : cWear);
    push(inner[0][0], inner[0][1], cRail);                     // starboard cap rail
    push(w, yDeck, cRail);
    ring = rs.length;
    const z = (0.5 - t) * LOA;          // transom +Z, stem -Z (bow faces the sea)
    rs.forEach(([x, y, c], k) => {
      pos.push(x, y, z);
      const j = jitter(iz * ring + k);
      col.push(c.r * j, c.g * j, c.b * j);
    });
    rings.push(rs.map(([x, y]) => [x, y, z]));
  });

  // Stations run stern->bow over decreasing z; with the ring wound from the
  // starboard rail down to the keel and back over the cockpit, this quad
  // winding keeps the normals out of the wood — outboard on the planking,
  // into the cockpit on the ceiling, up on the sole and the rail.
  for (let iz = 0; iz < STATIONS.length - 1; iz++) {
    const r0 = iz * ring, r1 = (iz + 1) * ring;
    for (let k = 0; k < ring; k++) {
      const kn = (k + 1) % ring;
      ind.push(r0 + k, r1 + kn, r1 + k);
      ind.push(r0 + k, r0 + kn, r1 + kn);
    }
  }
  // End caps, own vertices so their normals stay flat: the white transom
  // facing aft (+Z), and the sliver of stem facing forward (-Z). Both end
  // stations are decked, so each section is star-shaped about its centre.
  const cap = (rs, colour, aft) => {
    const c0 = pos.length / 3;
    const yMid = (rs[0][1] + rs[7][1]) / 2;
    pos.push(0, yMid, rs[0][2]);
    col.push(colour.r, colour.g, colour.b);
    for (const [x, y, z] of rs) { pos.push(x, y, z); col.push(colour.r, colour.g, colour.b); }
    for (let k = 0; k < ring; k++) {
      const a = c0 + 1 + k, b = c0 + 1 + (k + 1) % ring;
      if (aft) ind.push(c0, b, a); else ind.push(c0, a, b);
    }
  };
  cap(rings[0], cBoot, true);
  cap(rings[rings.length - 1], cWear, false);

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(ind);
  g.computeVertexNormals();
  return g;
}

// The awning: a flat grid with a sine sag in both directions — a stretched
// tarp, not a board (same spirit as main-BEACH.js's billowing sails).
function makeCanopyGeo(w, l, sag) {
  const gg = new THREE.PlaneGeometry(w, l, 8, 10);
  gg.rotateX(-Math.PI / 2);                      // lie flat, normal +Y
  const p = gg.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const u = p.getX(i) / w + 0.5, v = p.getZ(i) / l + 0.5;
    p.setY(i, p.getY(i) - sag * Math.sin(u * Math.PI) * Math.sin(v * Math.PI));
  }
  gg.computeVertexNormals();
  return gg;
}

export function createJungleTender({ scene, ocean, preset }) {
  const P = { ...TENDER_PRESET, ...preset };
  const BASE_YAW = 0.09;                         // a boat never sits square
  const group = new THREE.Group();
  group.rotation.order = 'YXZ';                  // yaw first, then wave angles
  group.position.set(JETTY.x + JETTY.halfW + 1.5, SEA_Y, JETTY.z1 + 4);
  group.rotation.y = BASE_YAW;

  const matHull = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55 });
  const matWood = new THREE.MeshStandardMaterial({ color: P.deck, roughness: 0.85 });
  const matFrame = new THREE.MeshStandardMaterial({ color: P.frame, roughness: 0.95 });
  const matCanvas = new THREE.MeshStandardMaterial({ color: P.canvas, roughness: 0.9, side: THREE.DoubleSide });
  const matEngine = new THREE.MeshStandardMaterial({ color: P.engine, roughness: 0.6, metalness: 0.25 });
  const matAccent = new THREE.MeshStandardMaterial({ color: P.topside, roughness: 0.5 });
  const matFender = new THREE.MeshStandardMaterial({ color: P.fender, roughness: 0.8 });
  const matRope = new THREE.MeshStandardMaterial({ color: P.rope, roughness: 1 });
  const matWhite = new THREE.MeshStandardMaterial({ color: P.boot, roughness: 0.7 });
  const matRed = new THREE.MeshStandardMaterial({ color: P.red, roughness: 0.7 });

  const box = (mat, sx, sy, sz, x, y, z, parent = group) => {
    const m = new THREE.Mesh(BOX, mat);
    m.scale.set(sx, sy, sz); m.position.set(x, y, z);
    parent.add(m);
    return m;
  };

  // --- Hull and deck furniture ---------------------------------------------
  group.add(new THREE.Mesh(makeHullGeo(P), matHull));

  // Passenger benches: plank seat on four legs standing on the sole, the
  // seat a hand below the rail as in any open launch.
  const SEAT_Y = 0.5;
  for (const z of [-0.55, 0.75]) {
    box(matWood, 1.55, 0.06, 0.34, 0, SEAT_Y, z);
    const legH = SEAT_Y - 0.03 - SOLE_Y;
    for (const [lx, lz] of [[-0.68, -0.1], [0.68, -0.1], [-0.68, 0.1], [0.68, 0.1]]) {
      box(matFrame, 0.07, legH, 0.07, lx, SOLE_Y + legH / 2, z + lz);
    }
  }

  // Helm console aft of the aft bench: pedestal from the sole, head, wheel.
  box(matFrame, 0.09, 0.92, 0.09, 0, SOLE_Y + 0.46, 2.0);
  box(matFrame, 0.46, 0.34, 0.4, 0, 1.24, 2.02);
  const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.022, 6, 14), matWood);
  wheel.position.set(0, 1.28, 1.8);
  wheel.rotation.x = -0.55;
  group.add(wheel);

  // Cleats the mooring lines lead from: on the foredeck, and on the
  // transom board's top.
  const BOW_CLEAT = new THREE.Vector3(-0.24, deckYAt(0.5 + 2.55 / LOA) + 0.02, -2.55);
  const STERN_CLEAT = new THREE.Vector3(-0.5, deckYAt(0) + 0.02, 3.15);
  box(matFrame, 0.2, 0.04, 0.07, BOW_CLEAT.x, BOW_CLEAT.y, BOW_CLEAT.z);
  box(matFrame, 0.2, 0.04, 0.05, STERN_CLEAT.x, STERN_CLEAT.y, STERN_CLEAT.z);

  // --- Outboard on the transom ----------------------------------------------
  const motor = new THREE.Group();
  box(matEngine, 0.26, 0.16, 0.1, 0, 0.4, 3.24, motor);      // transom clamp
  box(matEngine, 0.42, 0.26, 0.38, 0, 0.78, 3.4, motor);     // cowl body
  const cowlTop = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.19, 0.42, 10), matEngine);
  cowlTop.rotation.z = Math.PI / 2;                          // axis along X
  cowlTop.position.set(0, 0.9, 3.4);
  motor.add(cowlTop);
  box(matAccent, 0.44, 0.07, 0.4, 0, 0.72, 3.4, motor);      // hull-colour band
  box(matEngine, 0.08, 0.84, 0.08, 0, 0.06, 3.42, motor);    // shaft
  box(matEngine, 0.03, 0.16, 0.24, 0, -0.4, 3.45, motor);    // skeg
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.05, 8), matEngine);
  hub.rotation.x = Math.PI / 2;
  hub.position.set(0, -0.28, 3.47);
  motor.add(hub);
  for (let b = 0; b < 3; b++) {                              // propeller blades
    const a = b * Math.PI * 2 / 3;
    const blade = new THREE.Mesh(BOX, matEngine);
    blade.scale.set(0.016, 0.15, 0.05);
    blade.position.set(Math.sin(a) * 0.1, -0.28 + Math.cos(a) * 0.1, 3.47);
    blade.rotation.z = -a;
    motor.add(blade);
  }
  motor.rotation.x = -0.08;                                  // slight rake
  group.add(motor);

  // --- Awning on wooden posts ------------------------------------------------
  for (const [x, z] of [[-0.62, -1.5], [0.62, -1.5], [-0.62, 1.45], [0.62, 1.45]]) {
    const h = 1.9 - SOLE_Y;                    // each post stands on the sole
    box(matFrame, 0.09, h, 0.09, x, 1.9 - h / 2, z);
    const tie = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.016, 5, 10), matRope);
    tie.rotation.x = Math.PI / 2;              // a loop around the post
    tie.position.set(x, 1.82, z);
    group.add(tie);
  }
  const canopy = new THREE.Mesh(makeCanopyGeo(1.8, 3.6, 0.09), matCanvas);
  canopy.position.set(0, 1.9, -0.03);
  group.add(canopy);

  // Ring buoy hung on the aft port post, where the jetty sees it.
  const buoy = new THREE.Group();              // built facing +Z, turned after
  buoy.add(new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.085, 7, 16), matWhite));
  for (let b = 0; b < 4; b++) {
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.096, 6, 6, Math.PI / 4.6), matRed);
    band.rotation.z = b * Math.PI / 2 + Math.PI / 4;
    buoy.add(band);
  }
  buoy.rotation.y = Math.PI / 2;
  buoy.position.set(-0.75, 1.3, 1.45);
  group.add(buoy);

  // --- Fenders and mooring lines ---------------------------------------------
  // The jetty lies on the port side (-X). Fenders just off the planking,
  // each on its own pendant from the gunwale.
  for (const z of [1.9, 0.1, -1.6]) {
    const t = 0.5 - z / LOA;
    const x = -(halfBeam(t) + 0.16);
    const fender = new THREE.Mesh(new THREE.CapsuleGeometry(0.11, 0.26, 3, 8), matFender);
    fender.position.set(x, 0.1, z);
    group.add(fender);
    const top = deckYAt(t) - 0.02, len = top - 0.34;
    box(matRope, 0.022, len, 0.022, x, 0.34 + len / 2, z);
  }

  // Bow and stern lines to the jetty's east pilings (the jetty builds them
  // on a 3.2 m rhythm from z0-1). Anchored in LOCAL space: at this mooring
  // the boat moves centimetres at most, far less than the slack drawn.
  const c0 = Math.cos(BASE_YAW), s0 = Math.sin(BASE_YAW);
  const pilingX = JETTY.x + (JETTY.halfW - 0.15);
  const mooring = (cleat, pz, sag) => {
    const dx = pilingX - group.position.x, dz = pz - group.position.z;
    const end = new THREE.Vector3(dx * c0 - dz * s0, 1.62, dx * s0 + dz * c0);
    const mid = cleat.clone().add(end).multiplyScalar(0.5);
    mid.y -= sag;
    const curve = new THREE.CatmullRomCurve3([cleat, mid, end]);
    group.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 12, 0.024, 5), matRope));
  };
  mooring(BOW_CLEAT, JETTY.z0 - 1 - 8 * 3.2, 0.1);
  mooring(STERN_CLEAT, JETTY.z0 - 1 - 6 * 3.2, 0.18);

  group.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  scene.add(group);

  // --- Floating on the map's own sea -----------------------------------------
  // The mooring sits in the lee of the bank, where the ocean's swell is
  // damped almost to nothing (jungleLayout's calm) — the real surface alone
  // leaves the boat frozen. Real sheltered water still breathes: a long,
  // low swell refracted round the point and a little cross-chop. Both are
  // stated here as a small travelling wave field ADDED to the ocean, and
  // sampled at the same four points of the hull, so heave, pitch and roll
  // all come from one wave passing under the boat (bow lifts, then the
  // stern, the roll lagging) instead of three unrelated sines.
  const heightAt = (ocean && ocean.waterHeightAt)
    ? (x, z, t) => ocean.waterHeightAt(x, z, t)
    : () => SEA_Y;
  // Travelling shoreward (+Z) from the open sea, deep-water dispersion.
  const LEE_SWELL = [
    { a: 0.034, len: 22, dir: 0.21, ph: 0.0 },   // the long swell
    { a: 0.016, len: 11, dir: -0.85, ph: 1.9 },  // its refracted echo
    { a: 0.010, len: 5.5, dir: 0.96, ph: 4.1 },  // cross-chop, mostly roll
  ].map(w => {
    const k = 2 * Math.PI / w.len;
    return { ...w, k, om: Math.sqrt(9.81 * k), dx: Math.sin(w.dir), dz: Math.cos(w.dir) };
  });
  const leeAt = (x, z, t) => {
    let h = 0;
    for (const w of LEE_SWELL) h += w.a * Math.sin(w.k * (x * w.dx + z * w.dz) - w.om * t + w.ph);
    return h;
  };
  const seaAt = (x, z, t) => heightAt(x, z, t) + leeAt(x, z, t);

  const ARM_Z = 2.3, ARM_X = 0.95;               // sample arms, inside the WL

  function targetsAt(t) {
    const yaw = BASE_YAW + Math.sin(t * 0.21) * 0.012   // swinging on the lines
      + Math.sin(t * 0.5) * 0.004;
    const c = Math.cos(yaw), s = Math.sin(yaw);
    const px = group.position.x, pz = group.position.z;
    const hBow = seaAt(px - ARM_Z * s, pz - ARM_Z * c, t);
    const hStern = seaAt(px + ARM_Z * s, pz + ARM_Z * c, t);
    const hPort = seaAt(px - ARM_X * c, pz + ARM_X * s, t);
    const hStbd = seaAt(px + ARM_X * c, pz - ARM_X * s, t);
    return {
      yaw,
      heave: (hBow + hStern + hPort + hStbd) / 4,
      pitch: Math.atan2(hBow - hStern, ARM_Z * 2),      // bow rises with its wave
      roll: Math.atan2(hStbd - hPort, ARM_X * 2),       // so does the starboard side
    };
  }

  // Each degree of freedom is a damped spring toward the wave's pose, not a
  // plain ease: a hull has inertia, so it lags the wave, carries through a
  // crest and settles back with a hint of overshoot. Natural periods are
  // those of a 6 m launch — the roll the slowest and least damped, which is
  // what makes a moored boat look alive.
  const DOF = {
    heave: { T: 1.6, zeta: 0.45 },
    pitch: { T: 2.0, zeta: 0.35 },
    roll: { T: 2.6, zeta: 0.22 },
  };
  const cur = {}, vel = {};
  for (const key in DOF) { cur[key] = 0; vel[key] = 0; }

  function update(t, dt) {
    const g = targetsAt(t);
    if (!(dt > 0) || dt > 0.5) {                 // first frame or a long stall:
      for (const key in DOF) { cur[key] = g[key]; vel[key] = 0; }   // snap
    } else {
      const n = Math.ceil(dt / 0.02), h = dt / n; // substeps keep it stable
      for (const key in DOF) {
        const om = 2 * Math.PI / DOF[key].T, z = DOF[key].zeta;
        for (let i = 0; i < n; i++) {
          vel[key] += (om * om * (g[key] - cur[key]) - 2 * z * om * vel[key]) * h;
          cur[key] += vel[key] * h;
        }
      }
    }
    group.position.y = SEA_Y + cur.heave;
    group.rotation.set(cur.pitch, g.yaw, cur.roll);
  }
  update(0, 0);                                  // snap to the rest pose

  return { group, update, seaAt };
}
