// Ballroom quartet instruments. Unique meshes, outside the collision world.
// Silhouettes are lathed and extruded rather than borrowed low-poly GLBs, so
// they take the same figured wood as the rest of the Edwardian room.

import * as THREE from 'three';

function canvasTex(W, H, draw, rx = 1, ry = 1, anisotropy = 4) {
  const c = Object.assign(document.createElement('canvas'), { width: W, height: H });
  draw(c.getContext('2d'), W, H);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(rx, ry);
  t.anisotropy = anisotropy;
  return t;
}

function paintSpruce(g, W, H) {
  let s = 90210 >>> 0;
  const rand = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  g.fillStyle = '#e4cfa0';
  g.fillRect(0, 0, W, H);
  for (let i = 0; i < 90; i++) {
    const x = (i / 90) * W + (rand() - 0.5) * 2.4;
    g.strokeStyle = rand() < 0.45 ? 'rgba(132,92,42,0.32)' : 'rgba(88,56,22,0.18)';
    g.lineWidth = 0.55 + rand() * 0.9;
    g.beginPath();
    g.moveTo(x, 0);
    g.bezierCurveTo(x + 2.2, H * 0.34, x - 2.4, H * 0.68, x + 1.1, H);
    g.stroke();
  }
}

function paintPearl(g, W, H) {
  let s = 777 >>> 0;
  const rand = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  const grd = g.createRadialGradient(W * 0.28, H * 0.24, 8, W * 0.5, H * 0.5, W * 0.72);
  grd.addColorStop(0, '#fbf6ee');
  grd.addColorStop(0.45, '#e4d0b0');
  grd.addColorStop(1, '#c4a078');
  g.fillStyle = grd;
  g.fillRect(0, 0, W, H);
  for (let i = 0; i < 2200; i++) {
    g.fillStyle = `rgba(255,252,245,${0.05 + rand() * 0.14})`;
    g.fillRect(rand() * W, rand() * H, 1.1 + rand(), 1.1 + rand());
  }
}

function paintIvory(g, W, H) {
  let s = 4141 >>> 0;
  const rand = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  g.fillStyle = '#f3eee2';
  g.fillRect(0, 0, W, H);
  for (let i = 0; i < 40; i++) {
    g.strokeStyle = `rgba(180,160,120,${0.08 + rand() * 0.1})`;
    g.beginPath();
    g.moveTo(rand() * W, 0);
    g.lineTo(rand() * W, H);
    g.stroke();
  }
}

function part(geo, mat) {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

// Half an outline, bottom to top, as cubic segments [c1, c2, end] in units of
// the half-width and the length. Violin proportions: upper bout 0.81 of the
// lower, waist 0.53, corners at 0.39 and 0.62 of the length. The bass keeps
// its viol ancestry in sloping shoulders.
function bowedOutline(width, length, bass = false) {
  const w = width / 2, L = length;
  const up = bass ? 0.74 : 0.81, waist = bass ? 0.58 : 0.53;
  const segs = [
    [[0.56, 0], [1.0, 0.07], [1.0, 0.22]],
    [[1.0, 0.31], [0.95, 0.37], [0.82, 0.39]],
    [[0.66, 0.40], [waist, 0.43], [waist, 0.50]],
    [[waist, 0.57], [0.60, 0.61], [0.72, 0.62]],
    [[0.82, 0.63], [up, 0.68], [up, bass ? 0.74 : 0.77]],
    bass ? [[up, 0.86], [0.30, 0.94], [0.12, 1.0]] : [[up, 0.89], [0.46, 1.0], [0.0, 1.0]],
  ];
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  for (const [a, b, c] of segs)
    s.bezierCurveTo(a[0] * w, a[1] * L, b[0] * w, b[1] * L, c[0] * w, c[1] * L);
  if (bass) s.lineTo(-0.12 * w, L);
  for (let i = segs.length - 1; i >= 0; i--) {
    const [a, b] = segs[i];
    const end = i > 0 ? segs[i - 1][2] : [0, 0];
    s.bezierCurveTo(-b[0] * w, b[1] * L, -a[0] * w, a[1] * L, -end[0] * w, end[1] * L);
  }
  return s;
}

// One f-hole: a slim stem, leaning in at the top, with a round eye at each
// end. `k` is the body length over a violin's.
function fHoleMesh(mat, x, y, side, k) {
  const g = new THREE.Group();
  const len = 0.062 * k;
  const stem = part(new THREE.BoxGeometry(0.0045 * k, len, 0.004 * k), mat);
  stem.rotation.z = -side * 0.14;
  const eye = new THREE.CylinderGeometry(0.0042 * k, 0.0042 * k, 0.004 * k, 12);
  const n1 = part(eye, mat);
  n1.rotation.x = Math.PI / 2;
  n1.position.set(-side * 0.006 * k, len / 2, 0);
  const n2 = part(eye, mat);
  n2.rotation.x = Math.PI / 2;
  n2.position.set(side * 0.006 * k, -len / 2, 0);
  const nick = part(new THREE.BoxGeometry(0.006 * k, 0.0014 * k, 0.004 * k), mat);
  nick.position.set(-side * 0.004 * k, 0, 0);
  g.add(stem, n1, n2, nick);
  g.position.set(x, y, 0);
  return g;
}

const UP = new THREE.Vector3(0, 1, 0);

// Where the strings are, in the instrument's frame, for whoever plays it.
export const BOWED = {
  violin: { bodyL: 0.355, bodyW: 0.208, thick: 0.058, neckL: 0.135, bridgeH: 0.032 },
  bass: { bodyL: 1.12, bodyW: 0.70, thick: 0.19, neckL: 0.46, bridgeH: 0.13 },
};

function makeBowed(kind, mats) {
  // Standing pose: +Y toward the scroll, +Z the belly, origin at the tail on
  // the back plate.
  const bass = kind === 'bass';
  const { bodyL, bodyW, thick, neckL, bridgeH } = BOWED[kind];
  const k = bodyL / BOWED.violin.bodyL;
  const group = new THREE.Group();
  group.name = kind;

  const plate = { depth: 0.004 * k, bevelEnabled: true, bevelThickness: 0.002 * k, bevelSize: 0.002 * k, bevelSegments: 2, curveSegments: 20 };
  const ribs = part(new THREE.ExtrudeGeometry(bowedOutline(bodyW * 0.985, bodyL * 0.99, bass),
    { depth: thick, bevelEnabled: false, curveSegments: 20 }), mats.varnish);
  ribs.position.y = bodyL * 0.005;
  const back = part(new THREE.ExtrudeGeometry(bowedOutline(bodyW, bodyL, bass), plate), mats.maple);
  back.position.z = -0.004 * k;
  const belly = part(new THREE.ExtrudeGeometry(bowedOutline(bodyW, bodyL, bass), plate), mats.top);
  belly.position.z = thick - 0.002 * k;
  group.add(ribs, back, belly);
  // The purfling: a dark line just inside the edge of the top.
  const purf = part(new THREE.ExtrudeGeometry(bowedOutline(bodyW * 0.955, bodyL * 0.965, bass),
    { depth: 0.0006, bevelEnabled: false, curveSegments: 20 }), mats.ebony);
  purf.position.set(0, bodyL * 0.0175, thick + 0.0021 * k);
  const inner = part(new THREE.ExtrudeGeometry(bowedOutline(bodyW * 0.94, bodyL * 0.952, bass),
    { depth: 0.0007, bevelEnabled: false, curveSegments: 20 }), mats.top);
  inner.position.set(0, bodyL * 0.024, thick + 0.0022 * k);
  group.add(purf, inner);

  const top = thick + 0.004 * k;
  const bridgeY = bodyL * 0.47;
  for (const side of [1, -1]) {
    const hole = fHoleMesh(mats.ebony, side * bodyW * 0.18, bridgeY, side, k);
    hole.position.z = top + 0.0005;
    group.add(hole);
  }

  // Bridge, tailpiece, and the saddle it hangs from.
  const bridge = part(new THREE.BoxGeometry(bodyW * 0.2, 0.004 * k, bridgeH), mats.maple);
  bridge.position.set(0, bridgeY, top + bridgeH / 2);
  group.add(bridge);
  const tailLen = bodyL * 0.30;
  const tail = part(new THREE.BoxGeometry(bodyW * 0.15, tailLen, 0.007 * k), mats.ebony);
  tail.position.set(0, bodyL * 0.035 + tailLen / 2, top + bridgeH * 0.32);
  tail.rotation.x = -Math.atan2(bridgeH * 0.3, tailLen);
  group.add(tail);

  // Neck and fingerboard. The board runs from the nut to 0.64 of the body,
  // standing proud of the top as far as the bridge lets it.
  const nutY = bodyL + neckL;
  const fbLen = nutY - bodyL * 0.64;
  const fbT = 0.006 * k;
  const fbTop = top + bridgeH * 0.66;
  const finger = part(new THREE.BoxGeometry(bodyW * (bass ? 0.13 : 0.17), fbLen, fbT), mats.ebony);
  finger.position.set(0, nutY - fbLen / 2, fbTop - fbT / 2);
  group.add(finger);
  const neckD = 0.02 * k;
  const neck = part(new THREE.BoxGeometry(bodyW * (bass ? 0.10 : 0.13), neckL + 0.012 * k, neckD), mats.varnish);
  neck.position.set(0, bodyL + neckL / 2, fbTop - fbT - neckD / 2);
  group.add(neck);

  // Pegbox raked back, the scroll, four pegs (brass machines on the bass).
  const pegL = 0.07 * k;
  const pegbox = part(new THREE.BoxGeometry(bodyW * 0.11, pegL, neckD * 1.1), mats.varnish);
  pegbox.position.set(0, nutY + pegL / 2, fbTop - fbT - neckD * 0.6);
  pegbox.rotation.x = -0.22;
  group.add(pegbox);
  const scrollR = 0.012 * k;
  const scroll = part(new THREE.TorusGeometry(scrollR, scrollR * 0.55, 8, 20, Math.PI * 1.7), mats.varnish);
  scroll.rotation.set(0, Math.PI / 2, 0.6);
  scroll.position.set(0, nutY + pegL + scrollR * 0.6, fbTop - fbT - neckD * 1.2);
  const boss = part(new THREE.SphereGeometry(scrollR * 0.55, 10, 8), mats.varnish);
  boss.position.copy(scroll.position);
  group.add(scroll, boss);
  for (let i = 0; i < 4; i++) {
    const peg = part(new THREE.CylinderGeometry(0.0035 * k, 0.0025 * k, 0.03 * k, 8), bass ? mats.chrome : mats.ebony);
    peg.rotation.z = Math.PI / 2;
    peg.position.set((i % 2 ? -1 : 1) * bodyW * 0.1, nutY + pegL * (0.25 + 0.5 * Math.floor(i / 2)), fbTop - fbT - neckD * 0.65);
    group.add(peg);
  }

  // Strings: tailpiece to bridge, then bridge to nut.
  const tailEnd = new THREE.Vector3(0, bodyL * 0.035 + tailLen, top + bridgeH * 0.5);
  const bridgeTop = new THREE.Vector3(0, bridgeY, top + bridgeH);
  const nut = new THREE.Vector3(0, nutY, fbTop + 0.0015 * k);
  const spread = [bodyW * 0.10, bodyW * 0.16, bodyW * 0.08];
  const _d = new THREE.Vector3();
  const r = 0.0005 * k;
  for (let i = 0; i < 4; i++) {
    const t = (i - 1.5) / 1.5;
    const pts = [tailEnd, bridgeTop, nut].map((p, j) => p.clone().setX(t * spread[j] / 2));
    for (let j = 0; j < 2; j++) {
      _d.subVectors(pts[j + 1], pts[j]);
      const str = part(new THREE.CylinderGeometry(r, r, _d.length(), 5), mats.string);
      str.position.addVectors(pts[j], pts[j + 1]).multiplyScalar(0.5);
      str.quaternion.setFromUnitVectors(UP, _d.normalize());
      group.add(str);
    }
  }

  if (bass) {
    const pin = part(new THREE.CylinderGeometry(0.008, 0.004, 0.40, 8), mats.chrome);
    pin.position.set(0, -0.19, thick * 0.5);
    group.add(pin);
  } else {
    const rest = part(new THREE.CylinderGeometry(0.03, 0.028, 0.012, 16), mats.ebony);
    rest.rotation.x = Math.PI / 2;
    rest.scale.set(1.2, 1, 0.8);
    rest.position.set(-0.035, 0.035, top + 0.012);
    group.add(rest);
  }
  group.userData.bridgeTop = bridgeTop.clone();
  group.userData.nut = nut.clone();

  return group;
}

function makeBow(mats, bass = false) {
  const g = new THREE.Group();
  g.name = bass ? 'bass-bow' : 'violin-bow';
  const len = bass ? 0.70 : 0.74;
  const stick = part(new THREE.CylinderGeometry(bass ? 0.006 : 0.0045, bass ? 0.004 : 0.0032, len, 8), mats.varnish);
  stick.rotation.z = Math.PI / 2;
  g.add(stick);
  const hair = part(new THREE.BoxGeometry(len * 0.92, 0.003, bass ? 0.012 : 0.008), mats.hair);
  hair.position.y = -0.01;
  g.add(hair);
  const frog = part(new THREE.BoxGeometry(0.028, 0.016, 0.014), mats.ebony);
  frog.position.set(-len * 0.46, -0.004, 0);
  g.add(frog);
  const tip = part(new THREE.BoxGeometry(0.018, 0.01, 0.01), mats.ebony);
  tip.position.set(len * 0.47, 0.002, 0);
  g.add(tip);
  return g;
}

// Where the pianist's hands go, in the piano group's frame: the origin is the
// floor under the middle of the bench and the pianist faces +Z, bass (+X) on
// the left hand. `wristY`/`wristZ` are the wrist over a key, not the key.
export const PIANO_HANDS = { wristY: 0.80, wristZ: 0.33, bass: [0.08, 0.46], treble: [-0.44, -0.06] };
const PIANO_BODY_Z = 0.65;

function makeGrandPiano(mats) {
  // The case is drawn in `body` with its tail toward -Z and turned round, so
  // the outline below (long straight bass side at -X) reads as it is written.
  const g = new THREE.Group();
  g.name = 'grand-piano';
  const body = new THREE.Group();
  body.rotation.y = Math.PI;
  body.position.z = PIANO_BODY_Z;
  g.add(body);

  const shape = new THREE.Shape();
  shape.moveTo(-0.74, 0);
  shape.lineTo(0.74, 0);
  shape.lineTo(0.74, 0.52);
  shape.bezierCurveTo(0.74, 1.12, 0.52, 1.58, 0.16, 2.02);
  shape.bezierCurveTo(0.00, 2.20, -0.18, 2.22, -0.32, 2.12);
  shape.bezierCurveTo(-0.62, 1.86, -0.74, 1.20, -0.74, 0.52);
  shape.closePath();
  const CASE_Y = 0.66, CASE_H = 0.32, TOP = CASE_Y + CASE_H;

  const rim = new THREE.ExtrudeGeometry(shape, {
    depth: CASE_H, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.01, bevelSegments: 1,
  });
  rim.rotateX(-Math.PI / 2);                       // shape +Y becomes -Z
  const caseMesh = part(rim, mats.piano);
  caseMesh.position.y = CASE_Y;
  body.add(caseMesh);

  // Inside, under the open lid: spruce soundboard, a gilt iron frame.
  const bed = new THREE.ExtrudeGeometry(shape, { depth: 0.03, bevelEnabled: false });
  bed.rotateX(-Math.PI / 2);
  const sound = part(bed, mats.spruce);
  sound.position.y = TOP - 0.03;
  sound.scale.set(0.985, 1, 0.99);
  body.add(sound);
  const frameGeo = new THREE.ShapeGeometry(shape, 24);
  frameGeo.rotateX(-Math.PI / 2);
  const frame = part(frameGeo, mats.cymbal);
  frame.scale.set(0.86, 1, 0.84);
  frame.position.set(0, TOP + 0.004, -0.14);
  body.add(frame);

  // The lid, hinged along the straight bass side and propped open on the
  // treble side — towards whoever the pianist has on the right.
  const lidGeo = new THREE.ExtrudeGeometry(shape, { depth: 0.025, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.004, bevelSegments: 1 });
  lidGeo.rotateX(-Math.PI / 2);
  lidGeo.translate(0.74, 0, 0);
  const lid = part(lidGeo, mats.piano);
  const LID_A = 0.62;
  lid.position.set(-0.74, TOP + 0.012, 0);
  lid.rotation.z = LID_A;
  body.add(lid);
  const propX = 0.28, propH = (propX + 0.74) * Math.tan(LID_A);
  const stick = part(new THREE.CylinderGeometry(0.011, 0.011, propH, 8), mats.piano);
  stick.position.set(propX, TOP + propH / 2, -1.0);
  body.add(stick);

  // Keybed, keys, cheeks and the fallboard. The keys stand proud of the case
  // front (z = 0) towards the pianist.
  const bedSlab = part(new THREE.BoxGeometry(1.48, 0.05, 0.26), mats.piano);
  bedSlab.position.set(0, 0.69, 0.12);
  body.add(bedSlab);
  const nWhite = 52, pitch = 0.02355, keyboardW = nWhite * pitch;
  const whites = new THREE.InstancedMesh(new THREE.BoxGeometry(pitch - 0.0014, 0.022, 0.15), mats.ivory, nWhite);
  whites.castShadow = true;
  const dummy = new THREE.Object3D();
  for (let i = 0; i < nWhite; i++) {
    dummy.position.set(-keyboardW / 2 + pitch * (i + 0.5), 0.727, 0.155);
    dummy.updateMatrix();
    whites.setMatrixAt(i, dummy.matrix);
  }
  body.add(whites);
  // A0 is the first white key: A# B | C C# D D# E | F F# G G# A A# B ...
  const blackAfter = [1, 0, 1, 1, 0, 1, 1];
  const blacks = [];
  for (let i = 0; i < nWhite - 1; i++)
    if (blackAfter[i % 7]) blacks.push(-keyboardW / 2 + pitch * (i + 1));
  const blackMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.012, 0.02, 0.092), mats.ebony, blacks.length);
  blackMesh.castShadow = true;
  blacks.forEach((x, i) => {
    dummy.position.set(x, 0.746, 0.126);
    dummy.updateMatrix();
    blackMesh.setMatrixAt(i, dummy.matrix);
  });
  body.add(blackMesh);
  for (const sx of [-1, 1]) {
    const cheek = part(new THREE.BoxGeometry(0.11, 0.1, 0.25), mats.piano);
    cheek.position.set(sx * (keyboardW / 2 + 0.06), 0.74, 0.115);
    body.add(cheek);
  }
  const fall = part(new THREE.BoxGeometry(keyboardW + 0.02, 0.11, 0.05), mats.piano);
  fall.position.set(0, 0.79, 0.055);
  body.add(fall);

  // Music desk on the case, leaning away from the pianist, with a score.
  const rack = part(new THREE.BoxGeometry(0.66, 0.26, 0.014), mats.piano);
  rack.position.set(0, TOP + 0.14, -0.2);
  rack.rotation.x = -0.26;
  body.add(rack);
  for (const dx of [-0.075, 0.075]) {
    const sheet = part(new THREE.BoxGeometry(0.15, 0.21, 0.002), mats.sheet);
    sheet.position.set(dx, TOP + 0.155, -0.19);
    sheet.rotation.set(-0.26, dx > 0 ? -0.05 : 0.05, 0);
    body.add(sheet);
  }

  // Two legs at the keyboard corners, one under the tail.
  for (const [x, z] of [[-0.62, -0.16], [0.62, -0.16], [-0.14, -1.78]]) {
    const leg = part(new THREE.CylinderGeometry(0.05, 0.034, CASE_Y, 12), mats.piano);
    leg.position.set(x, CASE_Y / 2, z);
    body.add(leg);
    const caster = part(new THREE.SphereGeometry(0.03, 8, 6), mats.chrome);
    caster.position.set(x, 0.03, z);
    body.add(caster);
  }

  // The pedal lyre under the front of the case, three brass pedals.
  for (const dx of [-0.07, 0.07]) {
    const post = part(new THREE.BoxGeometry(0.03, CASE_Y - 0.1, 0.03), mats.piano);
    post.position.set(dx, 0.1 + (CASE_Y - 0.1) / 2, -0.02);
    body.add(post);
  }
  const pedalBox = part(new THREE.BoxGeometry(0.30, 0.07, 0.10), mats.piano);
  pedalBox.position.set(0, 0.075, -0.02);
  body.add(pedalBox);
  for (const dx of [-0.07, 0, 0.07]) {
    const ped = part(new THREE.BoxGeometry(0.028, 0.012, 0.12), mats.cymbal);
    ped.position.set(dx, 0.06, 0.08);
    body.add(ped);
  }

  // The bench, at the origin.
  const bench = new THREE.Group();
  const seat = part(new THREE.BoxGeometry(0.74, 0.06, 0.34), mats.piano);
  seat.position.y = 0.42;
  const pad = part(new THREE.BoxGeometry(0.70, 0.05, 0.30), mats.leather);
  pad.position.y = 0.475;
  bench.add(seat, pad);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const leg = part(new THREE.CylinderGeometry(0.024, 0.018, 0.39, 8), mats.piano);
    leg.position.set(sx * 0.31, 0.195, sz * 0.13);
    bench.add(leg);
  }
  g.add(bench);
  g.userData.seatTop = 0.50;

  return g;
}

// Stick targets on the kit, in its own frame: origin the floor under the
// throne, the drummer facing +Z with the hi-hat (+X) on the left.
export const DRUM_HITS = {
  snare: new THREE.Vector3(0.10, 0.715, 0.38),
  hat: new THREE.Vector3(0.38, 0.985, 0.34),
  tom: new THREE.Vector3(0.11, 0.935, 0.58),
  floor: new THREE.Vector3(-0.40, 0.655, 0.36),
  ride: new THREE.Vector3(-0.40, 1.095, 0.54),
  crash: new THREE.Vector3(0.34, 1.31, 0.66),
};

function makeDrumKit(mats) {
  const g = new THREE.Group();
  g.name = 'drum-kit';

  function drum(r, depth, x, y, z, { kick = false, tilt = 0, legs = 0 } = {}) {
    const d = new THREE.Group();
    const shell = part(new THREE.CylinderGeometry(r, r, depth, 28, 1, true), mats.pearl);
    const headA = part(new THREE.CircleGeometry(r * 0.98, 28), mats.head);
    headA.rotation.x = -Math.PI / 2;
    headA.position.y = depth / 2;
    const headB = part(new THREE.CircleGeometry(r * 0.98, 28), kick ? mats.head : mats.ebony);
    headB.rotation.x = Math.PI / 2;
    headB.position.y = -depth / 2;
    const hoopA = part(new THREE.TorusGeometry(r, 0.011, 6, 28), kick ? mats.ebony : mats.chrome);
    hoopA.rotation.x = Math.PI / 2;
    hoopA.position.y = depth / 2;
    const hoopB = hoopA.clone();
    hoopB.position.y = -depth / 2;
    d.add(shell, headA, headB, hoopA, hoopB);
    // Tension lugs round the shell.
    const lugs = Math.round(r * 40);
    for (let i = 0; i < lugs; i++) {
      const a = (i / lugs) * Math.PI * 2;
      const lug = part(new THREE.BoxGeometry(0.014, depth * 0.5, 0.02), mats.chrome);
      lug.position.set(Math.cos(a) * (r + 0.008), 0, Math.sin(a) * (r + 0.008));
      lug.rotation.y = -a;
      d.add(lug);
    }
    d.position.set(x, y, z);
    d.rotation.x = kick ? Math.PI / 2 : tilt;
    g.add(d);
    for (let i = 0; i < legs; i++) {
      const a = (i / legs) * Math.PI * 2 + 0.5;
      const leg = part(new THREE.CylinderGeometry(0.009, 0.009, y, 6), mats.chrome);
      leg.position.set(x + Math.cos(a) * (r + 0.02), y / 2 - 0.02, z + Math.sin(a) * (r + 0.02));
      g.add(leg);
    }
    return d;
  }

  function stand(x, z, h) {
    const pole = part(new THREE.CylinderGeometry(0.011, 0.014, h, 8), mats.chrome);
    pole.position.set(x, h / 2, z);
    g.add(pole);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      const foot = part(new THREE.CylinderGeometry(0.008, 0.008, 0.30, 6), mats.chrome);
      foot.position.set(x + Math.cos(a) * 0.12, 0.08, z + Math.sin(a) * 0.12);
      foot.rotation.set(Math.sin(a) * 1.0, 0, -Math.cos(a) * 1.0);
      g.add(foot);
    }
  }

  function cym(r, x, y, z, tilt = 0.12, withStand = true) {
    const geo = new THREE.LatheGeometry([
      new THREE.Vector2(0.004, 0.024),
      new THREE.Vector2(r * 0.16, 0.022),
      new THREE.Vector2(r * 0.22, 0.010),
      new THREE.Vector2(r * 0.6, 0.004),
      new THREE.Vector2(r, 0),
    ], 32);
    const mesh = part(geo, mats.cymbal);
    mesh.material.side = THREE.DoubleSide;
    mesh.position.set(x, y, z);
    // Tipped towards the throne, so the drummer plays its near edge.
    mesh.rotation.set(-tilt * Math.sign(z || 1), 0, tilt * Math.sign(x) * 0.5);
    g.add(mesh);
    if (withStand) stand(x, z, y - 0.01);
    return mesh;
  }

  drum(0.26, 0.38, 0.0, 0.27, 0.78, { kick: true });
  const pedal = part(new THREE.BoxGeometry(0.08, 0.03, 0.24), mats.chrome);
  pedal.position.set(0.0, 0.03, 0.50);
  g.add(pedal);
  drum(0.17, 0.14, 0.12, 0.64, 0.42, { tilt: -0.12 });
  stand(0.12, 0.42, 0.57);
  drum(0.14, 0.14, 0.13, 0.86, 0.66, { tilt: -0.36 });
  drum(0.15, 0.15, -0.19, 0.86, 0.66, { tilt: -0.36 });
  drum(0.20, 0.34, -0.44, 0.47, 0.40, { legs: 3 });

  // Hi-hat: two plates face to face on the one stand, pedal below.
  cym(0.17, 0.44, 0.955, 0.36, 0);
  const upper = cym(0.17, 0.44, 0.985, 0.36, 0, false);
  upper.rotation.x = Math.PI;
  const hatPedal = part(new THREE.BoxGeometry(0.08, 0.03, 0.22), mats.chrome);
  hatPedal.position.set(0.40, 0.03, 0.26);
  g.add(hatPedal);
  cym(0.28, -0.52, 1.08, 0.72);        // ride
  cym(0.23, 0.42, 1.30, 0.80);         // crash

  // The throne, at the origin.
  const throne = part(new THREE.CylinderGeometry(0.18, 0.17, 0.08, 20), mats.leather);
  throne.position.set(0, 0.54, 0);
  const pole = part(new THREE.CylinderGeometry(0.02, 0.024, 0.50, 8), mats.chrome);
  pole.position.set(0, 0.25, 0);
  g.add(throne, pole);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    const foot = part(new THREE.CylinderGeometry(0.01, 0.01, 0.36, 6), mats.chrome);
    foot.position.set(Math.cos(a) * 0.14, 0.09, Math.sin(a) * 0.14);
    foot.rotation.set(Math.sin(a) * 1.05, 0, -Math.cos(a) * 1.05);
    g.add(foot);
  }
  g.userData.seatTop = 0.58;

  return g;
}

function makeDrumStick(mats) {
  const g = new THREE.Group();
  const shaft = part(new THREE.CylinderGeometry(0.007, 0.006, 0.40, 8), mats.maple);
  shaft.rotation.z = Math.PI / 2;
  const tip = part(new THREE.SphereGeometry(0.011, 8, 6), mats.maple);
  tip.position.x = 0.21;
  g.add(shaft, tip);
  return g;
}

export function createBandInstruments({ woodMap, woodNormal, anisotropy = 4 } = {}) {
  const spruceMap = canvasTex(256, 256, paintSpruce, 2, 2, anisotropy);
  const pearlMap = canvasTex(256, 256, paintPearl, 2, 2, anisotropy);
  const ivoryMap = canvasTex(128, 128, paintIvory, 1, 1, anisotropy);

  const mats = {
    spruce: new THREE.MeshPhysicalMaterial({
      map: spruceMap, color: 0xf0d7a4, roughness: 0.32, metalness: 0.02,
      clearcoat: 0.55, clearcoatRoughness: 0.22,
    }),
    // The tops are spruce under an amber-brown varnish, not bare wood.
    top: new THREE.MeshPhysicalMaterial({
      map: spruceMap, color: 0x9c5626, roughness: 0.3, metalness: 0.02,
      clearcoat: 0.8, clearcoatRoughness: 0.14,
    }),
    maple: new THREE.MeshPhysicalMaterial({
      map: woodMap, normalMap: woodNormal, color: 0xc48a48, roughness: 0.28,
      metalness: 0.04, clearcoat: 0.7, clearcoatRoughness: 0.18,
    }),
    varnish: new THREE.MeshPhysicalMaterial({
      map: woodMap, normalMap: woodNormal, color: 0x8a3a14, roughness: 0.24,
      metalness: 0.05, clearcoat: 0.85, clearcoatRoughness: 0.12,
    }),
    ebony: new THREE.MeshStandardMaterial({ color: 0x161210, roughness: 0.42, metalness: 0.04 }),
    string: new THREE.MeshStandardMaterial({ color: 0xd8c9a0, roughness: 0.28, metalness: 0.55 }),
    hair: new THREE.MeshStandardMaterial({ color: 0xece6d6, roughness: 0.7 }),
    chrome: new THREE.MeshStandardMaterial({ color: 0xd5dde4, roughness: 0.18, metalness: 0.86 }),
    piano: new THREE.MeshPhysicalMaterial({
      map: woodMap, normalMap: woodNormal, color: 0x120e0c, roughness: 0.22,
      metalness: 0.08, clearcoat: 0.9, clearcoatRoughness: 0.1,
    }),
    ivory: new THREE.MeshStandardMaterial({ map: ivoryMap, color: 0xf4efe4, roughness: 0.55 }),
    sheet: new THREE.MeshStandardMaterial({ color: 0xf7f2e6, roughness: 0.88 }),
    leather: new THREE.MeshStandardMaterial({ color: 0x1a1210, roughness: 0.5 }),
    pearl: new THREE.MeshPhysicalMaterial({
      map: pearlMap, color: 0xf0e2c8, roughness: 0.28, metalness: 0.12,
      clearcoat: 0.65, clearcoatRoughness: 0.2,
    }),
    head: new THREE.MeshStandardMaterial({ color: 0xf4efe6, roughness: 0.72 }),
    cymbal: new THREE.MeshStandardMaterial({
      color: 0xd4b056, roughness: 0.28, metalness: 0.72,
      emissive: 0x2a1c04, emissiveIntensity: 0.35,
    }),
  };

  return {
    violin: () => makeBowed('violin', mats),
    bass: () => makeBowed('bass', mats),
    bow: (bass = false) => makeBow(mats, bass),
    piano: () => makeGrandPiano(mats),
    drums: () => makeDrumKit(mats),
    stick: () => makeDrumStick(mats),
  };
}
