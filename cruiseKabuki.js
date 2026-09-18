// cruiseKabuki.js — the piece the ship's theatre plays.
//
// Renjishi (連獅子), the lion dance: a parent shishi with a white mane and a
// child with a red one, on a matsubame stage — the painted pine that says a
// kabuki piece has borrowed a noh setting — with the nagauta ensemble sitting
// in rows on a scarlet dais behind them. It is chosen over a play with
// dialogue for one reason: everything it says, it says with the body and the
// mane, so it survives being watched from the back of a 15 m house with no
// subtitles and no voices.
//
// The performers are built here rather than loaded. A kabuki lion is a
// costume with a wig on it: the only skin an audience ever sees is a face
// painted flat white and two hands painted the same, so a figure assembled
// out of its own costume is not a compromise — it is how the thing is made.
// It also buys the choreography: a bought rig comes with a walk and an idle
// and nothing that holds a mie, and a mie held wrong is the whole point
// missed. The audience out in the house is the opposite case and is loaded
// from the Mixamo guests in main-CRUISE.js, because those are people.
//
// The dance is cued to the recording, not to a wall clock: tools/
// make_kabuki_score.py lays the piece out in jo-ha-kyu and prints the same
// seconds that CUES carries here, so the mane flies on the drum.
import * as THREE from 'three';

// Seconds into the recording. Mirrored from tools/make_kabuki_score.py.
export const CUES = {
  ki: 0,        // the clappers call the house in
  maku: 5.4,    // the striped curtain is walked open
  jo: 11,       // ozatsuma: the lions are discovered, still
  ha: 36,       // the dance
  mie1: 84,     // first mie
  ha2: 89,      // it resumes, quicker
  kyu: 132,     // accelerando
  kegurui: 148, // down onto one knee for the mane-shaking
  mie2: 160,    // the great mie
  coda: 167,
  end: 182,
};

const UP = new THREE.Vector3(0, 1, 0);
const _v = new THREE.Vector3(), _w = new THREE.Vector3();

// ---------------------------------------------------------------------------
// Painted surfaces. Same contract as the rest of the arts rooms: one canvas
// each, drawn once, and the tile is the texture.
// ---------------------------------------------------------------------------
function canvas(S, draw) {
  const c = document.createElement('canvas');
  c.width = c.height = S;
  draw(c.getContext('2d'), S);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

// A tiny deterministic PRNG, so the pine is the same pine every launch.
function prng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

// The matsubame itself: a single old pine on a ground of cedar boards. A
// noh backdrop is a PAINTING of a tree, not a tree — flat, ink-drawn, with
// the gold in the ground rather than in the foliage.
function drawMatsubame(g, S) {
  const r = prng(77);
  const W = S, H = S * 0.42;                     // drawn 1:2.4, the plane's ratio
  g.fillStyle = '#c6a468';
  g.fillRect(0, 0, W, S);
  // Cedar boarding, with the grain running up.
  for (let x = 0; x < W; x += S / 26) {
    const k = 0.9 + r() * 0.2;
    const grd = g.createLinearGradient(x, 0, x + S / 26, 0);
    grd.addColorStop(0, `rgba(96,66,32,${0.20 * k})`);
    grd.addColorStop(0.18, 'rgba(210,176,120,0.10)');
    grd.addColorStop(1, `rgba(120,84,42,${0.14 * k})`);
    g.fillStyle = grd;
    g.fillRect(x, 0, S / 26, S);
    for (let y = 0; y < S; y += 6 + r() * 26) {
      g.strokeStyle = `rgba(104,72,36,${0.05 + r() * 0.07})`;
      g.lineWidth = 0.6 + r();
      g.beginPath();
      g.moveTo(x + r() * S / 26, y);
      g.bezierCurveTo(x + r() * S / 26, y + 30, x + r() * S / 26, y + 60,
        x + r() * S / 26, y + 90);
      g.stroke();
    }
  }
  // A wash of age over the lower half, and the gold that catches the float.
  const wash = g.createLinearGradient(0, 0, 0, S);
  wash.addColorStop(0, 'rgba(255,232,178,0.28)');
  wash.addColorStop(0.55, 'rgba(198,158,96,0.06)');
  wash.addColorStop(1, 'rgba(84,56,26,0.26)');
  g.fillStyle = wash;
  g.fillRect(0, 0, W, S);

  // The pine. Trunk from the lower left, leaning right, then the cloud-cut
  // foliage masses an ink painter actually puts down: flat, layered, dark.
  const baseX = W * 0.30, baseY = S * 0.99;
  const limb = (x0, y0, x1, y1, w0, w1, seg = 14) => {
    for (let i = 0; i < seg; i++) {
      const u0 = i / seg, u1 = (i + 1) / seg;
      const bend = (u, sx) => [
        x0 + (x1 - x0) * u + Math.sin(u * 3.1 + sx) * w0 * 1.6,
        y0 + (y1 - y0) * u,
      ];
      const [ax, ay] = bend(u0, x0), [bx, by] = bend(u1, x0);
      g.strokeStyle = `rgba(${44 + r() * 20 | 0},${30 + r() * 14 | 0},${20 + r() * 10 | 0},0.92)`;
      g.lineWidth = w0 + (w1 - w0) * u0;
      g.lineCap = 'round';
      g.beginPath(); g.moveTo(ax, ay); g.lineTo(bx, by); g.stroke();
      // Pine bark reads as plates, drawn as flecks along the edge.
      if (r() < 0.6) {
        g.fillStyle = 'rgba(28,18,12,0.5)';
        g.fillRect(ax - g.lineWidth / 2 + r() * g.lineWidth, ay, 2 + r() * 5, 3 + r() * 7);
      }
    }
  };
  limb(baseX, baseY, W * 0.46, S * 0.34, S * 0.055, S * 0.022, 20);
  limb(W * 0.44, S * 0.46, W * 0.14, S * 0.30, S * 0.026, S * 0.008, 14);
  limb(W * 0.45, S * 0.40, W * 0.78, S * 0.26, S * 0.03, S * 0.009, 18);
  limb(W * 0.47, S * 0.32, W * 0.62, S * 0.13, S * 0.018, S * 0.006, 12);
  limb(W * 0.33, S * 0.86, W * 0.10, S * 0.74, S * 0.02, S * 0.006, 10);

  const needles = (cx, cy, rad, shade) => {
    // The mass first, as a cloud of flat blobs...
    for (let k = 0; k < 90; k++) {
      const a = r() * 6.28, d = Math.sqrt(r()) * rad;
      const x = cx + Math.cos(a) * d, y = cy + Math.sin(a) * d * 0.62;
      g.fillStyle = shade[Math.floor(r() * shade.length)];
      g.beginPath();
      g.ellipse(x, y, rad * (0.14 + r() * 0.16), rad * (0.09 + r() * 0.1),
        a, 0, 6.28);
      g.fill();
    }
    // ...then the needles themselves along the underside, in fans.
    for (let k = 0; k < 120; k++) {
      const a = r() * 6.28, d = Math.sqrt(r()) * rad;
      const x = cx + Math.cos(a) * d, y = cy + Math.sin(a) * d * 0.62;
      const dir = r() * 6.28, len = rad * (0.06 + r() * 0.1);
      g.strokeStyle = `rgba(22,${52 + r() * 34 | 0},34,${0.35 + r() * 0.4})`;
      g.lineWidth = 0.8 + r() * 0.9;
      for (let n = -2; n <= 2; n++) {
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(x + Math.cos(dir + n * 0.2) * len, y + Math.sin(dir + n * 0.2) * len);
        g.stroke();
      }
    }
  };
  const dark = ['rgba(18,46,30,0.85)', 'rgba(24,58,36,0.8)', 'rgba(14,38,24,0.9)'];
  const lit = ['rgba(46,88,52,0.7)', 'rgba(62,104,60,0.6)', 'rgba(32,70,42,0.8)'];
  needles(W * 0.17, S * 0.29, S * 0.14, dark);
  needles(W * 0.47, S * 0.13, S * 0.17, lit);
  needles(W * 0.76, S * 0.24, S * 0.15, dark);
  needles(W * 0.62, S * 0.06, S * 0.11, lit);
  needles(W * 0.09, S * 0.72, S * 0.09, dark);
  return H;
}

// The bamboo panels that flank a matsubame stage.
function drawTakebame(g, S) {
  const r = prng(311);
  g.fillStyle = '#bf9c62';
  g.fillRect(0, 0, S, S);
  const wash = g.createLinearGradient(0, 0, 0, S);
  wash.addColorStop(0, 'rgba(255,230,174,0.24)');
  wash.addColorStop(1, 'rgba(78,52,24,0.28)');
  g.fillStyle = wash;
  g.fillRect(0, 0, S, S);
  for (let k = 0; k < 5; k++) {
    const x = S * (0.12 + k * 0.19) + r() * S * 0.03;
    const w = S * (0.022 + r() * 0.016);
    g.fillStyle = `rgba(${40 + r() * 20 | 0},${72 + r() * 26 | 0},${40 + r() * 16 | 0},0.86)`;
    g.fillRect(x, 0, w, S);
    g.strokeStyle = 'rgba(16,36,20,0.55)';
    g.lineWidth = 1.6;
    for (let y = S * (0.04 + r() * 0.1); y < S; y += S * (0.13 + r() * 0.05)) {
      g.beginPath(); g.moveTo(x - 1, y); g.lineTo(x + w + 1, y); g.stroke();
    }
    // A leaf or two off each culm.
    for (let n = 0; n < 4; n++) {
      const y = r() * S;
      const dir = r() < 0.5 ? -1 : 1;
      g.fillStyle = 'rgba(30,66,36,0.7)';
      g.beginPath();
      g.moveTo(x + w / 2, y);
      g.quadraticCurveTo(x + dir * S * 0.07, y - S * 0.05, x + dir * S * 0.13, y - S * 0.02);
      g.quadraticCurveTo(x + dir * S * 0.07, y + S * 0.01, x + w / 2, y);
      g.fill();
    }
  }
  return S;
}

// The joshiki-maku: the three-stripe curtain every kabuki house hangs, in
// black, persimmon and a green that is closer to moss than to grass.
function drawMaku(g, S) {
  const bands = ['#171310', '#8d3a16', '#1d3b22'];
  const n = 12;
  for (let i = 0; i < n; i++) {
    g.fillStyle = bands[i % 3];
    g.fillRect(i * S / n, 0, S / n + 1, S);
    // Cotton, not satin: a vertical weave streak keeps it from reading as
    // a flat swatch under the float.
    for (let k = 0; k < 40; k++) {
      g.fillStyle = `rgba(255,255,255,${0.012 + Math.random() * 0.02})`;
      g.fillRect(i * S / n + Math.random() * S / n, 0, 1, S);
    }
  }
  const sh = g.createLinearGradient(0, 0, 0, S);
  sh.addColorStop(0, 'rgba(0,0,0,0.30)');
  sh.addColorStop(0.35, 'rgba(255,240,210,0.07)');
  sh.addColorStop(1, 'rgba(0,0,0,0.42)');
  g.fillStyle = sh;
  g.fillRect(0, 0, S, S);
  return S;
}

// Brocade for the lions' karaori: a gold karakusa scroll over a ground.
function drawKaraori(g, S, ground, scroll) {
  g.fillStyle = ground;
  g.fillRect(0, 0, S, S);
  const r = prng(1204);
  g.strokeStyle = scroll;
  g.lineCap = 'round';
  for (let k = 0; k < 16; k++) {
    const cx = r() * S, cy = r() * S, rad = S * (0.06 + r() * 0.09);
    g.lineWidth = S * 0.012;
    g.beginPath();
    for (let i = 0; i <= 26; i++) {
      const a = i / 26 * 5.6, rr = rad * (1 - i / 34);
      const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr;
      i ? g.lineTo(x, y) : g.moveTo(x, y);
    }
    g.stroke();
    // The peony head the scroll runs out of.
    g.fillStyle = scroll;
    for (let p = 0; p < 6; p++) {
      const a = p / 6 * 6.28;
      g.beginPath();
      g.ellipse(cx + Math.cos(a) * rad * 0.16, cy + Math.sin(a) * rad * 0.16,
        rad * 0.15, rad * 0.09, a, 0, 6.28);
      g.fill();
    }
  }
  // Warp sheen, so the metal thread catches the float.
  for (let y = 0; y < S; y += 3) {
    g.fillStyle = `rgba(255,236,180,${0.03 + r() * 0.05})`;
    g.fillRect(0, y, S, 1);
  }
  return S;
}

// The face. Flat white oshiroi, kumadori in red drawn up from the brows and
// out from the eyes, black brows, a small mouth. Drawn head-on: the plate it
// goes on is the front of the head and nothing else.
function drawShishiFace(g, S, kuma) {
  g.clearRect(0, 0, S, S);
  const cx = S / 2;
  // Oshiroi. Never pure white — it is lead-white over skin and it warms.
  const skin = g.createRadialGradient(cx, S * 0.44, S * 0.08, cx, S * 0.5, S * 0.52);
  skin.addColorStop(0, '#fdfbf5');
  skin.addColorStop(0.7, '#f6efe1');
  skin.addColorStop(1, '#e6d9c4');
  g.fillStyle = skin;
  g.beginPath();
  g.ellipse(cx, S * 0.5, S * 0.34, S * 0.45, 0, 0, 6.28);
  g.fill();

  // Kumadori: three strokes each side, wide at the cheekbone, drawn with the
  // finger so each one is soft on its outer edge.
  const stroke = (x0, y0, x1, y1, w, alpha) => {
    const grd = g.createLinearGradient(x0, y0, x1 + w, y1);
    grd.addColorStop(0, `rgba(${kuma},${alpha})`);
    grd.addColorStop(0.55, `rgba(${kuma},${alpha * 0.75})`);
    grd.addColorStop(1, `rgba(${kuma},0)`);
    g.strokeStyle = grd;
    g.lineWidth = w;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(x0, y0);
    g.quadraticCurveTo((x0 + x1) / 2 + (x1 - x0) * 0.3, (y0 + y1) / 2, x1, y1);
    g.stroke();
  };
  for (const s of [-1, 1]) {
    stroke(cx + s * S * 0.055, S * 0.40, cx + s * S * 0.30, S * 0.20, S * 0.045, 0.85);
    stroke(cx + s * S * 0.10, S * 0.47, cx + s * S * 0.31, S * 0.40, S * 0.05, 0.78);
    stroke(cx + s * S * 0.10, S * 0.56, cx + s * S * 0.27, S * 0.62, S * 0.04, 0.6);
    stroke(cx + s * S * 0.07, S * 0.70, cx + s * S * 0.20, S * 0.76, S * 0.03, 0.45);
  }
  stroke(cx - S * 0.02, S * 0.30, cx - S * 0.04, S * 0.12, S * 0.035, 0.6);
  stroke(cx + S * 0.02, S * 0.30, cx + S * 0.04, S * 0.12, S * 0.035, 0.6);

  // Brows: two thick ink strokes, raked up.
  g.fillStyle = '#14100e';
  for (const s of [-1, 1]) {
    g.save();
    g.translate(cx + s * S * 0.14, S * 0.365);
    g.rotate(s * -0.42);
    g.beginPath();
    g.ellipse(0, 0, S * 0.10, S * 0.028, 0, 0, 6.28);
    g.fill();
    g.restore();
  }
  // Eyes, glaring: the upper lid is drawn hard, the lower one lifted.
  for (const s of [-1, 1]) {
    g.save();
    g.translate(cx + s * S * 0.135, S * 0.455);
    g.rotate(s * -0.24);
    g.fillStyle = '#fffdf7';
    g.beginPath(); g.ellipse(0, 0, S * 0.072, S * 0.034, 0, 0, 6.28); g.fill();
    g.fillStyle = '#20160f';
    g.beginPath(); g.ellipse(-s * S * 0.008, 0, S * 0.030, S * 0.030, 0, 0, 6.28); g.fill();
    g.fillStyle = '#000';
    g.beginPath(); g.ellipse(-s * S * 0.008, 0, S * 0.014, S * 0.016, 0, 0, 6.28); g.fill();
    g.strokeStyle = '#14100e';
    g.lineWidth = S * 0.012;
    g.beginPath();
    g.ellipse(0, 0, S * 0.074, S * 0.036, 0, Math.PI * 1.04, Math.PI * 1.98);
    g.stroke();
    g.restore();
  }
  // Nose, a shadow only, and the small red mouth.
  g.strokeStyle = 'rgba(180,140,110,0.5)';
  g.lineWidth = S * 0.012;
  g.beginPath();
  g.moveTo(cx - S * 0.012, S * 0.50); g.lineTo(cx - S * 0.03, S * 0.60);
  g.stroke();
  g.fillStyle = '#9c1620';
  g.beginPath();
  g.ellipse(cx, S * 0.685, S * 0.055, S * 0.030, 0, 0, 6.28);
  g.fill();
  g.fillStyle = 'rgba(255,255,255,0.35)';
  g.beginPath();
  g.ellipse(cx - S * 0.015, S * 0.678, S * 0.018, S * 0.008, 0, 0, 6.28);
  g.fill();
  return S;
}

// ---------------------------------------------------------------------------
// The figures. A shishi is a jointed armature wearing the costume that makes
// its silhouette; the armature itself is never seen.
// ---------------------------------------------------------------------------
function joint(parent, x, y, z) {
  const o = new THREE.Object3D();
  o.position.set(x, y, z);
  parent.add(o);
  return o;
}

function part(parent, geo, mat, x, y, z, sx, sy, sz, rx = 0, ry = 0, rz = 0) {
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(x, y, z);
  mesh.scale.set(sx, sy, sz);
  mesh.rotation.set(rx, ry, rz);
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  parent.add(mesh);
  return mesh;
}

// ---------------------------------------------------------------------------
export function createKabukiShow({ stage, rnd = Math.random, quality = 1 } = {}) {
  const group = new THREE.Group();
  const lights = [];
  const SY = stage.y, PZ = stage.front, BZ = stage.back, OW = stage.halfWidth;

  // ---- Shared geometry and materials --------------------------------------
  const G = {
    box: new THREE.BoxGeometry(1, 1, 1),
    plane: new THREE.PlaneGeometry(1, 1),
    sphere: new THREE.SphereGeometry(1, 16, 12),
    cyl: new THREE.CylinderGeometry(1, 1, 1, 14),
    // Open, double-sided and flared: a kimono skirt and a hakama leg are
    // both a tube that widens downward, and the inside of one is visible
    // the moment a knee comes up.
    cone: new THREE.CylinderGeometry(0.66, 1, 1, 18, 1, true),
    disc: new THREE.CircleGeometry(1, 20),
  };
  const silkWhite = canvas(256, (g, S) => drawKaraori(g, S, '#efe7d6', 'rgba(198,154,58,0.85)'));
  const silkRed = canvas(256, (g, S) => drawKaraori(g, S, '#8e1424', 'rgba(224,186,86,0.9)'));
  const silkBlack = canvas(256, (g, S) => drawKaraori(g, S, '#1a1720', 'rgba(150,118,54,0.55)'));
  const M = {
    faceWhite: new THREE.MeshStandardMaterial({
      map: canvas(256, (g, S) => drawShishiFace(g, S, '176,26,34')),
      transparent: true, roughness: 0.62, side: THREE.DoubleSide,
    }),
    faceRed: new THREE.MeshStandardMaterial({
      map: canvas(256, (g, S) => drawShishiFace(g, S, '198,42,26')),
      transparent: true, roughness: 0.62, side: THREE.DoubleSide,
    }),
    // Oshiroi goes on the neck and the hands too, so all the skin matches.
    oshiroi: new THREE.MeshStandardMaterial({ color: 0xf6efe1, roughness: 0.66 }),
    karaoriWhite: new THREE.MeshStandardMaterial({
      map: silkWhite, roughness: 0.52, metalness: 0.12, side: THREE.DoubleSide }),
    karaoriRed: new THREE.MeshStandardMaterial({
      map: silkRed, roughness: 0.5, metalness: 0.14, side: THREE.DoubleSide }),
    karaoriBlack: new THREE.MeshStandardMaterial({
      map: silkBlack, roughness: 0.6, metalness: 0.08, side: THREE.DoubleSide }),
    gold: new THREE.MeshStandardMaterial({
      color: 0xd8ad52, roughness: 0.34, metalness: 0.55,
      emissive: 0x2d1d06, emissiveIntensity: 0.4,
    }),
    hakama: new THREE.MeshStandardMaterial({
      color: 0x2a2d52, roughness: 0.78, side: THREE.DoubleSide }),
    crimson: new THREE.MeshStandardMaterial({ color: 0x8c1220, roughness: 0.8 }),
    maneWhite: new THREE.MeshStandardMaterial({
      color: 0xf4f0e4, roughness: 0.55, side: THREE.DoubleSide,
      emissive: 0x3a3730, emissiveIntensity: 0.35,
    }),
    maneRed: new THREE.MeshStandardMaterial({
      color: 0xb0212a, roughness: 0.58, side: THREE.DoubleSide,
      emissive: 0x33070a, emissiveIntensity: 0.4,
    }),
    hair: new THREE.MeshStandardMaterial({ color: 0x14121a, roughness: 0.42 }),
    tabi: new THREE.MeshStandardMaterial({ color: 0xf2ece0, roughness: 0.8 }),
    wood: new THREE.MeshStandardMaterial({ color: 0x5b3a20, roughness: 0.64 }),
    skin: new THREE.MeshStandardMaterial({ color: 0xd8b593, roughness: 0.74 }),
    mosen: new THREE.MeshStandardMaterial({ color: 0x9d1020, roughness: 0.92 }),
    ivory: new THREE.MeshStandardMaterial({ color: 0xe8ddc4, roughness: 0.7 }),
  };

  // =========================================================================
  // The set
  // =========================================================================
  const set = new THREE.Group();
  group.add(set);

  // Matsubame: the pine, on the back wall, in front of the house's own
  // painted backcloth. Drawn 1:2.4, so the plane is 14 x 5.83 cut down to
  // the 3.6 m of height there actually is — the texture is sampled over the
  // top 42 % of the canvas, which is where the tree was drawn.
  const matsuMap = canvas(1024, drawMatsubame);
  matsuMap.repeat.set(1, 0.42);
  matsuMap.offset.set(0, 0.58);
  matsuMap.wrapS = matsuMap.wrapT = THREE.ClampToEdgeWrapping;
  const matsu = new THREE.Mesh(new THREE.PlaneGeometry(15, 3.62), new THREE.MeshStandardMaterial({
    map: matsuMap, roughness: 0.86,
  }));
  matsu.position.set(0, SY + 1.81, BZ + 0.5);
  set.add(matsu);
  // The bamboo panels down the sides, angled in like a noh stage's.
  const takeMap = canvas(512, drawTakebame);
  for (const sx of [-1, 1]) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 3.62),
      new THREE.MeshStandardMaterial({ map: takeMap, roughness: 0.86 }));
    p.position.set(sx * 6.4, SY + 1.81, BZ + 1.9);
    p.rotation.y = -sx * 0.5;
    set.add(p);
  }

  // The hinadan: two scarlet-covered tiers the ensemble sits on, upstage.
  const DAIS_Z1 = BZ + 0.62, DAIS_Z0 = DAIS_Z1 + 2.5;
  const tier = (z0, z1, top) => {
    part(set, G.box, M.mosen, 0, SY + top / 2, (z0 + z1) / 2, 9.4, top, z1 - z0);
    // A black lacquer edge, which is what stops a red box reading as a box.
    part(set, G.box, M.karaoriBlack, 0, SY + top - 0.03, z1 - 0.005,
      9.4, 0.1, 0.06);
  };
  tier(DAIS_Z1, DAIS_Z1 + 1.25, 0.72);          // upper: the shamisen row
  tier(DAIS_Z1 + 1.25, DAIS_Z0, 0.34);          // lower: the hayashi
  // Gold-leaf screens standing behind the top row.
  for (let i = -2; i <= 2; i++)
    part(set, G.box, M.gold, i * 1.9, SY + 0.72 + 0.62, DAIS_Z1 - 0.04, 1.8, 1.24, 0.06);

  // Two stage lanterns, hung inside the opening.
  for (const sx of [-1, 1]) {
    const l = part(set, G.cyl, M.ivory, sx * 4.4, SY + 2.95, PZ - 1.1,
      0.24, 0.5, 0.24);
    l.material = new THREE.MeshStandardMaterial({
      color: 0xf3e2b4, roughness: 0.8, emissive: 0xd8a24c, emissiveIntensity: 0.9,
    });
    for (let k = 0; k < 5; k++)
      part(set, G.cyl, M.hair, sx * 4.4, SY + 2.72 + k * 0.115, PZ - 1.1,
        0.253, 0.016, 0.253);
    part(set, G.cyl, M.hair, sx * 4.4, SY + 3.22, PZ - 1.1, 0.12, 0.08, 0.12);
  }

  // The tsuke board and the two clappers, on the floor at stage right where
  // the kyogen-kata kneels. Small, and the reason the mie has a sound.
  part(set, G.box, M.wood, OW - 0.55, SY + 0.03, PZ - 0.7, 0.42, 0.06, 0.62);

  // ---- The joshiki-maku ---------------------------------------------------
  // Hung a little upstage of the proscenium, so once it has been walked off
  // to stage left the flank wall hides it: a curtain that parks in view is
  // worse than no curtain.
  const MAKU_W = 2 * OW + 0.4, MAKU_H = stage.top - SY + 0.1;
  const makuMap = canvas(512, drawMaku);
  makuMap.repeat.set(3.4, 1);
  const maku = new THREE.Mesh(new THREE.PlaneGeometry(MAKU_W, MAKU_H, 24, 1),
    new THREE.MeshStandardMaterial({ map: makuMap, roughness: 0.94, side: THREE.DoubleSide }));
  maku.position.set(0, SY + MAKU_H / 2, PZ - 0.34);
  group.add(maku);
  const makuRail = part(group, G.box, M.hair, 0, SY + MAKU_H + 0.04, PZ - 0.34,
    MAKU_W + 0.3, 0.07, 0.07);
  const makuBase = maku.geometry.attributes.position.array.slice();
  // Walked open by hand, so the cloth gathers: the curtain does not slide
  // flat, it bunches against the leading edge as the man carries it off.
  function setMaku(open) {
    const pos = maku.geometry.attributes.position;
    const shut = 1 - open;
    for (let i = 0; i < pos.count; i++) {
      const x0 = makuBase[i * 3], y0 = makuBase[i * 3 + 1];
      const u = (x0 + MAKU_W / 2) / MAKU_W;        // 0 at stage right
      // The whole cloth ends up bunched against the leading edge, which has
      // walked `open` of the way across: what is left of the opening is
      // covered by the cloth compressed into `shut` of its own width.
      const x = -MAKU_W / 2 + open * MAKU_W + u * MAKU_W * shut;
      // Folds. Always a little, since the cloth hangs loose; a lot while it
      // is being carried, and deepest at the trailing edge that is dragging.
      const fold = 0.05 + 0.55 * open * (1 - u);
      pos.setXYZ(i, x, y0 - open * (1 - u) * 0.05,
        Math.sin(u * 26 / Math.max(shut, 0.06)) * fold * 0.4);
    }
    pos.needsUpdate = true;
    maku.geometry.computeVertexNormals();
    maku.visible = open < 0.995;
  }

  // ---- Stage light --------------------------------------------------------
  // Kabuki is played in a bright, even, frontal light — there is no darkness
  // in it and no follow spot. Four lamps across the opening, plus one warm
  // one washing the pine so the backdrop is not a black board.
  const stageLamps = [];
  for (const [x, y, z, i, d] of [
    [-3.4, SY + 3.3, PZ - 0.6, 0, 13],
    [3.4, SY + 3.3, PZ - 0.6, 0, 13],
    [0, SY + 2.1, PZ - 1.0, 0, 11],
    [0, SY + 3.1, BZ + 2.4, 0, 12],
  ]) {
    const l = new THREE.PointLight(0xffe9c4, i, d, 2);
    l.position.set(x, y, z);
    stageLamps.push(l);
    lights.push(l);
  }
  // The float, from below: the one light in a theatre that comes up at you,
  // and the reason a painted face reads at all from the back of the house.
  const floatLight = new THREE.PointLight(0xffd9a0, 0, 9, 2);
  floatLight.position.set(0, SY + 0.35, PZ - 1.35);
  lights.push(floatLight);

  // =========================================================================
  // A shishi
  // =========================================================================
  function buildShishi({ x, z, yaw, mane, silk, face, height = 1.0 }) {
    const root = new THREE.Group();
    root.position.set(x, SY, z);
    root.rotation.y = yaw;
    root.scale.setScalar(height);
    group.add(root);

    const J = {};
    J.pelvis = joint(root, 0, 0.94, 0);
    J.spine = joint(J.pelvis, 0, 0.17, 0);
    J.chest = joint(J.spine, 0, 0.20, 0);
    J.neck = joint(J.chest, 0, 0.21, 0);
    J.head = joint(J.neck, 0, 0.11, 0);
    J.armL = joint(J.chest, 0.20, 0.12, 0);
    J.armR = joint(J.chest, -0.20, 0.12, 0);
    J.elbowL = joint(J.armL, 0, -0.30, 0);
    J.elbowR = joint(J.armR, 0, -0.30, 0);
    J.legL = joint(J.pelvis, 0.12, -0.05, 0);
    J.legR = joint(J.pelvis, -0.12, -0.05, 0);
    J.kneeL = joint(J.legL, 0, -0.44, 0);
    J.kneeR = joint(J.legR, 0, -0.44, 0);

    const silkMat = silk === 'red' ? M.karaoriRed : M.karaoriWhite;

    // Legs. A hakama is a divided skirt, not trousers: each leg is a wide
    // flared tube and the two of them together read as one volume, which is
    // why the first pass — two 17 cm pipes — looked like pyjamas.
    for (const s of [1, -1]) {
      const hip = s > 0 ? J.legL : J.legR, knee = s > 0 ? J.kneeL : J.kneeR;
      part(hip, G.cone, M.hakama, 0, -0.24, 0, 0.20, 0.48, 0.20);
      part(knee, G.cone, M.hakama, 0, -0.22, 0, 0.24, 0.48, 0.23);
      part(knee, G.box, M.tabi, 0, -0.45, 0.06, 0.135, 0.075, 0.26);
    }

    // The body. Three volumes and no more: the kimono's skirt below the obi,
    // ONE cone from the obi to the shoulder, and the shoulder itself. Built
    // out of five stacked cones it stepped at every join and read as a stack
    // of white boxes with a head on top.
    part(J.pelvis, G.cone, silkMat, 0, -0.17, 0, 0.30, 0.52, 0.26);   // hem
    part(J.spine, G.cone, silkMat, 0, 0.13, 0, 0.295, 0.62, 0.255, 0, 0, Math.PI);
    part(J.chest, G.cyl, silkMat, 0, 0.15, 0, 0.295, 0.13, 0.255);    // shoulder
    part(J.pelvis, G.box, M.gold, 0, 0.055, 0, 0.44, 0.17, 0.29);     // obi
    part(J.pelvis, G.box, M.gold, 0, 0.06, -0.18, 0.24, 0.24, 0.13);  // musubi
    // A karaori is bordered, and the border at the hem is what stops the
    // silk reading as a painted box.
    part(J.pelvis, G.cyl, M.gold, 0, -0.42, 0, 0.302, 0.05, 0.262);
    // The collar: two boards crossed at the throat, white over the silk.
    for (const s of [1, -1])
      part(J.chest, G.box, M.ivory, s * 0.05, 0.16, 0.125, 0.085, 0.30, 0.05,
        0, 0, s * 0.30);

    // Arms. The sode is the part that is seen, and a sleeve HANGS: hung off
    // the upper arm it turned with it and read as a plank held out sideways.
    // It belongs to the chest, at the shoulder, and only leans as the arm
    // opens — which is what the cloth over a raised arm actually does.
    const sodes = [];
    for (const s of [1, -1]) {
      const sh = s > 0 ? J.armL : J.armR, el = s > 0 ? J.elbowL : J.elbowR;
      part(sh, G.cyl, silkMat, 0, -0.15, 0, 0.085, 0.32, 0.085);
      part(el, G.cyl, silkMat, 0, -0.14, 0, 0.072, 0.30, 0.072);
      part(el, G.sphere, M.oshiroi, 0, -0.30, 0.01, 0.062, 0.085, 0.05);
      const hinge = joint(J.chest, s * 0.185, 0.17, 0);
      const sode = part(hinge, G.box, silkMat, s * 0.045, -0.27, 0.0, 0.25, 0.56, 0.26);
      part(hinge, G.box, M.gold, s * 0.045, -0.54, 0.0, 0.252, 0.05, 0.262);
      sodes.push(hinge);
    }

    // The head. Small in the hand, large on the stage: the mane is what the
    // house sees, and the face is the bright spot inside it.
    part(J.head, G.sphere, M.oshiroi, 0, 0.01, 0, 0.125, 0.145, 0.125);
    const plate = part(J.head, G.plane, face === 'red' ? M.faceRed : M.faceWhite,
      0, 0.015, 0.122, 0.25, 0.29, 1);
    plate.renderOrder = 2;
    part(J.neck, G.cyl, M.oshiroi, 0, 0.03, -0.01, 0.058, 0.15, 0.052);
    // Wig: the black under-wig, and the gold crown the mane springs from.
    part(J.head, G.sphere, M.hair, 0, 0.035, -0.03, 0.138, 0.14, 0.138);
    part(J.head, G.cyl, M.gold, 0, 0.125, -0.01, 0.10, 0.055, 0.10);

    // ---- The mane -----------------------------------------------------------
    // Twenty-odd strands hung off the crown, each a chain of points carried
    // by the head and pulled down: the kegurui is the whole climax of the
    // piece, and it is the only thing in the theatre that has to be
    // simulated rather than posed. One geometry for the lot, rebuilt each
    // frame from the point chain.
    const STRANDS = Math.max(20, Math.round(46 * quality));
    const LINKS = 6;
    const strands = [];
    const anchor = new THREE.Object3D();
    J.head.add(anchor);
    // Three ranks, not two. Hung as a single ring at one radius the strands
    // stood apart from one another and read as paper streamers off a maypole:
    // a mane is a MASS, so it takes an inner fall, an outer one shingled over
    // it, and a short fringe round the face to close the gap at the temples.
    // The face is the one thing that must not be covered: it is the only
    // bright, legible object on the whole figure, and the first pass hung
    // hair straight down over it. FRONT is the angle of the face, and no
    // strand is rooted inside GAP of it — the hair parts at the temples, the
    // way it is dressed on a real katsura.
    const FRONT = Math.PI * 0.5, GAP = 0.66;
    const RANKS = [
      { n: 0.40, rad: 0.10, len: 1.26, w: 0.155, drop: -0.58, fall: true, y: 0.11 },
      { n: 0.35, rad: 0.155, len: 1.08, w: 0.175, drop: -0.50, fall: true, y: 0.075 },
      { n: 0.25, rad: 0.12, len: 0.34, w: 0.095, drop: -0.95, fall: false, y: 0.095 },
    ];
    let made = 0;
    for (let r = 0; r < RANKS.length; r++) {
      const K = RANKS[r];
      const count = r === RANKS.length - 1 ? STRANDS - made : Math.round(STRANDS * K.n);
      for (let i = 0; i < count; i++, made++) {
        const u = count > 1 ? i / (count - 1) : 0.5;
        // The two long falls sweep from one temple round the back to the
        // other; the fringe is two short clusters at the temples themselves.
        const a = K.fall
          ? FRONT + GAP + u * (2 * Math.PI - 2 * GAP) + r * 0.14
          : FRONT + (i % 2 ? 1 : -1) * (GAP * 0.78 + Math.floor(i / 2) / count * 1.1);
        strands.push({
          // Where on the crown it is rooted, in the head's own frame.
          root: new THREE.Vector3(Math.cos(a) * K.rad, K.y, Math.sin(a) * K.rad * 0.92 - 0.02),
          // The direction it hangs when everything is still. It FANS: the
          // hair springs out of the crown before it falls, which is what
          // gives a shishi a head twice the width of its face.
          rest: new THREE.Vector3(Math.cos(a) * 0.95, K.drop, Math.sin(a) * 0.95).normalize(),
          // ...and the way OUT of the head at that point, which is the axis
          // the ribbon is flattened across. Taken from the root offset it
          // was straight up for anything near the crown, so every one of
          // those strands ended up edge-on to the house and invisible.
          radial: new THREE.Vector3(Math.cos(a), 0, Math.sin(a)),
          len: K.len * (0.86 + rnd() * 0.28),
          width: K.w * (0.82 + rnd() * 0.36),
          p: Array.from({ length: LINKS + 1 }, () => new THREE.Vector3()),
          v: Array.from({ length: LINKS + 1 }, () => new THREE.Vector3()),
          seeded: false,
        });
      }
    }
    const verts = STRANDS * (LINKS + 1) * 2;
    const maneGeo = new THREE.BufferGeometry();
    maneGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(verts * 3), 3));
    maneGeo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(verts * 3), 3));
    const idx = [];
    for (let s = 0; s < STRANDS; s++) {
      const base = s * (LINKS + 1) * 2;
      for (let k = 0; k < LINKS; k++) {
        const a0 = base + k * 2, b0 = a0 + 1, a1 = a0 + 2, b1 = a0 + 3;
        idx.push(a0, b0, a1, b0, b1, a1);
      }
    }
    maneGeo.setIndex(idx);
    const maneMesh = new THREE.Mesh(maneGeo, mane === 'red' ? M.maneRed : M.maneWhite);
    maneMesh.frustumCulled = false;
    group.add(maneMesh);

    const _rootW = new THREE.Vector3(), _restW = new THREE.Vector3();
    const _side = new THREE.Vector3(), _dir = new THREE.Vector3();
    const _out = new THREE.Vector3();
    const pos = maneGeo.attributes.position.array;
    const nrm = maneGeo.attributes.normal.array;

    function tickMane(dt) {
      // From the ROOT, not the anchor: nothing else updates the figure's
      // matrices before the renderer does, so an anchor-only update reads
      // last frame's parent — and in a headless capture, which never
      // renders between steps, it reads the identity and hangs the whole
      // mane at the world origin.
      root.updateMatrixWorld(true);
      const mw = anchor.matrixWorld;
      const damp = Math.exp(-dt * 3.4);
      let w = 0;
      for (const st of strands) {
        _rootW.copy(st.root).applyMatrix4(mw);
        _restW.copy(st.rest).transformDirection(mw);
        const seg = st.len / LINKS;
        if (!st.seeded) {
          for (let k = 0; k <= LINKS; k++)
            st.p[k].copy(_rootW).addScaledVector(_restW, seg * k);
          st.seeded = true;
        }
        st.p[0].copy(_rootW);
        st.v[0].set(0, 0, 0);
        for (let k = 1; k <= LINKS; k++) {
          const p = st.p[k], v = st.v[k];
          // Gravity, plus a pull back toward the way the strand hangs: real
          // lion hair is stiff, and a pure pendulum turned it into rope.
          //
          // The stiffness falls off fast down the chain. Held equally the
          // whole strand stayed dead straight along its rest direction and
          // the mane came out as a spiked sunburst: what it should do is
          // spring OUT of the crown at the root and then fall, so only the
          // first link or two really holds the fan.
          v.y -= 9.0 * dt;
          _v.copy(st.p[k - 1]).addScaledVector(_restW, seg).sub(p);
          v.addScaledVector(_v, (44 / (1 + (k - 1) * 2.6)) * dt);
          v.multiplyScalar(damp);
          p.addScaledVector(v, dt);
          // Hold the link length exactly, or the mane stretches on a fast
          // head turn and the whole thing reads as string.
          _v.copy(p).sub(st.p[k - 1]);
          const d = _v.length() || 1e-6;
          p.copy(st.p[k - 1]).addScaledVector(_v, seg / d);
        }
        // Ribbon: each point gets two vertices, spread across the strand's
        // own side, and the width tapers to a point at the tip.
        // The strand's own outward direction, which is perpendicular to it
        // whatever it is doing: crossing with world up gave nothing at all
        // for a strand hanging straight down, which is most of them.
        _out.copy(st.radial).transformDirection(mw);
        for (let k = 0; k <= LINKS; k++) {
          _dir.copy(st.p[Math.min(k + 1, LINKS)]).sub(st.p[Math.max(k - 1, 0)]);
          if (_dir.lengthSq() < 1e-9) _dir.copy(_restW);
          _dir.normalize();
          _side.copy(_dir).cross(_out);
          if (_side.lengthSq() < 1e-6) _side.copy(_dir).cross(UP);
          if (_side.lengthSq() < 1e-6) _side.set(1, 0, 0);
          // Hair thins toward the tip but does not come to a needle: tapered
          // all the way to zero each strand read as a spike.
          _side.normalize().multiplyScalar(st.width * (1 - 0.55 * k / LINKS) * 0.5);
          for (const s of [-1, 1]) {
            pos[w] = st.p[k].x + _side.x * s;
            pos[w + 1] = st.p[k].y + _side.y * s;
            pos[w + 2] = st.p[k].z + _side.z * s;
            _w.copy(_side).cross(_dir).normalize();
            nrm[w] = _w.x; nrm[w + 1] = _w.y; nrm[w + 2] = _w.z;
            w += 3;
          }
        }
      }
      maneGeo.attributes.position.needsUpdate = true;
      maneGeo.attributes.normal.needsUpdate = true;
    }

    return { root, J, tickMane, maneMesh, plate, sodes };
  }

  // =========================================================================
  // The ensemble: nagauta singers and shamisen above, the hayashi below.
  // Seated in the formal kneel, so there are no legs to solve.
  // =========================================================================
  function buildMusician({ x, z, seatY, kind, robe }) {
    const root = new THREE.Group();
    root.position.set(x, seatY, z);
    root.rotation.y = Math.PI;                     // facing the house
    group.add(root);
    const robeMat = robe === 'black' ? M.karaoriBlack : M.karaoriRed;
    const body = joint(root, 0, 0.30, 0);
    // Seiza: the kimono is a cone on the floor and the knees are inside it.
    part(root, G.cone, robeMat, 0, 0.16, 0.02, 0.34, 0.34, 0.30);
    part(root, G.disc, robeMat, 0, 0.005, 0.02, 0.34, 0.30, 1, -Math.PI / 2);
    part(body, G.box, robeMat, 0, 0.04, 0, 0.42, 0.40, 0.26);
    part(body, G.box, M.gold, 0, -0.10, 0, 0.44, 0.10, 0.27);
    for (const s of [1, -1])
      part(body, G.box, M.ivory, s * 0.045, 0.14, 0.115, 0.075, 0.24, 0.04,
        0, 0, s * 0.28);
    const head = joint(body, 0, 0.30, 0);
    part(head, G.sphere, M.skin, 0, 0, 0, 0.095, 0.115, 0.095);
    part(head, G.sphere, M.hair, 0, 0.025, -0.015, 0.104, 0.10, 0.105);
    part(head, G.cyl, M.hair, 0, 0.085, -0.08, 0.032, 0.09, 0.032, 0.6);  // chonmage
    const armL = joint(body, 0.20, 0.13, 0), armR = joint(body, -0.20, 0.13, 0);
    for (const [j, s] of [[armL, 1], [armR, -1]]) {
      part(j, G.box, robeMat, 0, -0.13, 0, 0.17, 0.30, 0.18);
      part(j, G.box, robeMat, s * 0.02, -0.24, 0, 0.21, 0.36, 0.24);
      part(j, G.sphere, M.skin, 0, -0.34, 0.03, 0.05, 0.07, 0.045);
    }
    const inst = new THREE.Group();
    if (kind === 'shamisen') {
      // Held across the body, neck up over the left shoulder.
      body.add(inst);
      inst.position.set(0.02, 0.06, 0.16);
      inst.rotation.set(-0.22, 0, -0.62);
      part(inst, G.box, M.ivory, 0, 0, 0, 0.21, 0.21, 0.075);      // do
      part(inst, G.box, M.wood, 0, 0, 0.041, 0.22, 0.22, 0.012);
      part(inst, G.box, M.wood, 0, 0.44, 0, 0.032, 0.70, 0.038);   // sao
      part(inst, G.box, M.ivory, 0, 0.82, 0, 0.042, 0.10, 0.05);   // tenjin
      for (let k = 0; k < 3; k++)
        part(inst, G.box, M.wood, 0.035, 0.80 - k * 0.035, 0, 0.055, 0.012, 0.012);
      part(inst, G.box, M.ivory, -0.02, 0.10, 0.05, 0.10, 0.13, 0.014,
        0.2, 0, 0.5);                                              // bachi
    } else if (kind === 'tsuzumi') {
      // On the shoulder, one hand under it.
      body.add(inst);
      inst.position.set(0.16, 0.30, 0.04);
      inst.rotation.set(0, 0, -0.5);
      part(inst, G.cyl, M.wood, 0, 0, 0, 0.055, 0.22, 0.055);
      for (const s of [1, -1])
        part(inst, G.cyl, M.ivory, 0, s * 0.11, 0, 0.10, 0.02, 0.10);
      for (let k = 0; k < 6; k++)
        part(inst, G.box, M.crimson, Math.cos(k) * 0.05, 0, Math.sin(k) * 0.05,
          0.012, 0.22, 0.012);
    } else if (kind === 'fue') {
      body.add(inst);
      inst.position.set(0, 0.28, 0.12);
      inst.rotation.set(0, 0, 1.35);
      part(inst, G.cyl, M.wood, 0, 0, 0, 0.014, 0.40, 0.014);
      part(inst, G.cyl, M.crimson, 0, 0.14, 0, 0.016, 0.03, 0.016);
    }
    return { root, body, head, armL, armR, inst, kind };
  }

  // ---- Cast ---------------------------------------------------------------
  const DAIS_TOP = SY + 0.72, DAIS_LOW = SY + 0.34;
  const troupe = [];
  // Upper tier: four shamisen and two singers, the way a nagauta row sits.
  for (let i = 0; i < 6; i++)
    troupe.push(buildMusician({
      x: (i - 2.5) * 1.42, z: DAIS_Z1 + 0.62, seatY: DAIS_TOP,
      kind: i === 0 || i === 5 ? 'utai' : 'shamisen', robe: 'black',
    }));
  // Lower tier: the hayashi — two hand drums and the flute.
  for (let i = 0; i < 3; i++)
    troupe.push(buildMusician({
      x: (i - 1) * 1.7, z: DAIS_Z1 + 1.85, seatY: DAIS_LOW,
      kind: i === 1 ? 'fue' : 'tsuzumi', robe: 'red',
    }));

  // The white mane goes over the crimson karaori and the red one over the
  // white: a white mane on a white costume disappeared into it at fifteen
  // metres, which is the distance the whole room watches from.
  const oya = buildShishi({                       // the parent: white mane
    x: -1.45, z: PZ - 2.6, yaw: 0.16, mane: 'white', silk: 'red',
    face: 'white', height: 1.03,
  });
  const ko = buildShishi({                        // the child: red
    x: 1.55, z: PZ - 2.3, yaw: -0.14, mane: 'red', silk: 'white',
    face: 'red', height: 0.86,
  });
  const lions = [oya, ko];

  // The koken, in black, kneeling at the edge where he belongs.
  const koken = buildMusician({
    x: -(OW - 0.7), z: PZ - 0.9, seatY: SY, kind: null, robe: 'black',
  });
  koken.root.rotation.y = Math.PI * 0.62;

  // =========================================================================
  // Choreography.
  //
  // A kabuki dance is a chain of held shapes with a travel between them, so
  // that is exactly how it is written: a table of poses against the seconds
  // in the recording, eased from one to the next, with the tempo of the ease
  // set per key — a mie snaps, a turn does not. Numbers are radians, and
  // `crouch` is how far the koshi drops, which is the one thing that makes a
  // body read as Japanese dance rather than as ballet.
  // =========================================================================
  const REST = {
    crouch: 0.16, lean: 0.04, twist: 0, sideLean: 0,
    head: 0, headYaw: 0, headRoll: 0,
    // `armOut` swings the arm away from the body, `armLift` brings it
    // forward. They were summed onto one axis to begin with, which put both
    // arms straight out sideways in every mie and read as a scarecrow.
    armLift: [0.15, 0.15], armOut: [0.24, 0.24], elbow: [1.05, 1.05],
    legOut: [0.20, 0.20], knee: [0.32, 0.32], step: 0,
    x: 0, z: 0, yaw: 0,
  };
  const P = (o) => ({ ...REST, ...o });

  // Shapes used more than once.
  const KNEEL = { crouch: 0.62, knee: [1.15, 1.15], legOut: [0.30, 0.30], lean: 0.16,
    armOut: [0.16, 0.16], armLift: [0.25, 0.25], elbow: [1.25, 1.25] };
  // A mie is asymmetric on purpose: one arm reaches, the other closes on the
  // chest, the weight goes onto the far foot and the head turns against the
  // shoulders. Symmetry is the one thing it is never allowed to be.
  const MIE_R = {
    crouch: 0.30, twist: -0.26, sideLean: 0.10, lean: 0.05,
    armLift: [0.30, 0.20], armOut: [0.22, 1.12], elbow: [1.5, 0.22],
    legOut: [0.40, 0.22], knee: [0.55, 0.28], headYaw: -0.24, headRoll: 0.18,
  };
  const MIE_L = {
    crouch: 0.30, twist: 0.26, sideLean: -0.10, lean: 0.05,
    armLift: [0.20, 0.30], armOut: [1.12, 0.22], elbow: [0.22, 1.5],
    legOut: [0.22, 0.40], knee: [0.28, 0.55], headYaw: 0.24, headRoll: -0.18,
  };
  const OPEN = {
    crouch: 0.24, armLift: [0.30, 0.30], armOut: [0.72, 0.72],
    elbow: [0.62, 0.62], lean: -0.02,
  };
  const SWEEP_R = {
    crouch: 0.26, twist: -0.20, armLift: [0.55, 0.28], armOut: [0.20, 0.92],
    elbow: [1.35, 0.45], headYaw: -0.18, legOut: [0.32, 0.20],
  };
  const SWEEP_L = {
    crouch: 0.26, twist: 0.20, armLift: [0.28, 0.55], armOut: [0.92, 0.20],
    elbow: [0.45, 1.35], headYaw: 0.18, legOut: [0.20, 0.32],
  };

  // Each key: [time, pose, ease]. `ease` 0 is a snap, 1 a long carry.
  function makeScore(side, scale) {
    const s = side;                                // +1 stage left, -1 right
    const at = (t, pose, ease = 0.6) => [t, P(pose), ease];
    return [
      // Discovered kneeling behind the curtain, heads down.
      at(0, { ...KNEEL, head: 0.55, x: s * 1.0, z: -0.4 }, 1),
      at(CUES.maku, { ...KNEEL, head: 0.5, x: s * 1.0, z: -0.4 }, 1),
      // The ozatsuma: the head comes up, then the body, very slowly.
      at(CUES.jo + 2, { ...KNEEL, head: 0.12, x: s * 1.0, z: -0.4 }, 1),
      at(CUES.jo + 8, { ...KNEEL, head: -0.06, headYaw: -s * 0.3, x: s * 1.0, z: -0.4 }, 1),
      at(CUES.jo + 15, { crouch: 0.40, knee: [0.7, 0.7], lean: 0.1, x: s * 1.1, z: -0.2 }, 1),
      at(CUES.jo + 21, { ...OPEN, x: s * 1.3, z: 0.1, yaw: -s * 0.2 }, 1),
      // The dance. Alternating sweeps with a travel across the boards.
      at(CUES.ha + 2, { ...SWEEP_R, x: s * 1.8, z: 0.2, yaw: -0.25 }, 0.5),
      at(CUES.ha + 8, { ...SWEEP_L, x: s * 0.7, z: 0.5, yaw: 0.3 }, 0.5),
      at(CUES.ha + 14, { ...OPEN, x: s * 2.2, z: 0.0, yaw: -0.4 }, 0.5),
      at(CUES.ha + 20, { ...SWEEP_R, x: s * 2.6, z: -0.3, yaw: -0.1 }, 0.5),
      at(CUES.ha + 26, { ...SWEEP_L, x: s * 1.2, z: -0.6, yaw: 0.45 }, 0.5),
      at(CUES.ha + 32, { ...OPEN, x: s * 0.6, z: 0.3, yaw: 0.1 }, 0.5),
      at(CUES.ha + 38, { ...SWEEP_R, x: s * 1.9, z: 0.6, yaw: -0.3 }, 0.5),
      at(CUES.ha + 44, { crouch: 0.42, armLift: [0.45, 0.45], armOut: [0.42, 0.42],
        elbow: [1.0, 1.0], x: s * 1.5, z: 0.8, yaw: 0 }, 0.4),
      // Mie. It arrives on the beat and it does not move for four seconds.
      at(CUES.mie1 - 0.25, { ...(s > 0 ? MIE_R : MIE_L), x: s * 1.5, z: 0.9 }, 0),
      at(CUES.mie1 + 3.6, { ...(s > 0 ? MIE_R : MIE_L), x: s * 1.5, z: 0.9 }, 1),
      // And on, quicker, circling one another.
      at(CUES.ha2 + 3, { ...SWEEP_L, x: s * 0.4, z: 0.2, yaw: s * 0.5 }, 0.45),
      at(CUES.ha2 + 9, { ...OPEN, x: -s * 0.9, z: 0.6, yaw: s * 0.9 }, 0.45),
      at(CUES.ha2 + 15, { ...SWEEP_R, x: -s * 1.6, z: 0.1, yaw: s * 0.3 }, 0.45),
      at(CUES.ha2 + 21, { ...SWEEP_L, x: -s * 1.0, z: -0.5, yaw: -s * 0.4 }, 0.45),
      at(CUES.ha2 + 27, { ...OPEN, x: s * 0.8, z: -0.3, yaw: -s * 0.2 }, 0.45),
      at(CUES.ha2 + 33, { ...SWEEP_R, x: s * 1.7, z: 0.3, yaw: 0 }, 0.45),
      at(CUES.ha2 + 39, { ...OPEN, x: s * 1.2, z: 0.7, yaw: 0 }, 0.4),
      // Kyu: harder, lower, and then down onto one knee for the kegurui.
      at(CUES.kyu + 4, { ...SWEEP_L, crouch: 0.36, x: s * 2.0, z: 0.4, yaw: -s * 0.2 }, 0.3),
      at(CUES.kyu + 8, { ...SWEEP_R, crouch: 0.36, x: s * 0.9, z: 0.1, yaw: s * 0.2 }, 0.3),
      at(CUES.kyu + 12, { ...OPEN, crouch: 0.34, x: s * 1.9, z: 0.5, yaw: 0 }, 0.3),
      at(CUES.kegurui - 2, { crouch: 0.55, knee: [0.95, 0.5], legOut: [0.34, 0.26],
        armLift: [0.30, 0.30], armOut: [0.56, 0.56], elbow: [0.9, 0.9],
        lean: 0.22, head: 0.3, x: s * 1.5, z: 0.75, yaw: 0 }, 0.5),
      // The mane-shaking itself: the body is almost still and the HEAD does
      // all the work — that is what `kegurui` means and it is why the
      // rotation of the neck is driven separately, below.
      at(CUES.kegurui + 1, { crouch: 0.66, knee: [1.1, 0.55], legOut: [0.44, 0.32],
        armLift: [0.2, 0.2], armOut: [0.85, 0.85], elbow: [0.5, 0.5],
        lean: 0.30, x: s * 1.5, z: 0.75 }, 0.6),
      at(CUES.mie2 - 0.3, { crouch: 0.62, knee: [1.05, 0.5], legOut: [0.44, 0.32],
        armLift: [0.15, 0.15], armOut: [0.9, 0.9], elbow: [0.42, 0.42],
        lean: 0.26, x: s * 1.5, z: 0.75 }, 0.1),
      // The great mie, square to the house.
      at(CUES.mie2, { ...(s > 0 ? MIE_R : MIE_L), crouch: 0.36,
        x: s * 1.35, z: 1.0, yaw: 0 }, 0),
      at(CUES.mie2 + 5.5, { ...(s > 0 ? MIE_R : MIE_L), crouch: 0.36,
        x: s * 1.35, z: 1.0, yaw: 0 }, 1),
      // Coda: they stand, turn out, and hold.
      at(CUES.coda + 4, { ...OPEN, crouch: 0.18, x: s * 1.5, z: 0.8, yaw: -s * 0.1 }, 0.8),
      at(CUES.coda + 9, { crouch: 0.24, armLift: [0.32, 0.32], armOut: [0.40, 0.40],
        elbow: [0.95, 0.95], head: 0.1, x: s * 1.4, z: 0.9, yaw: 0 }, 0.8),
      at(CUES.end, { ...KNEEL, head: 0.45, x: s * 1.2, z: 0.4 }, 1),
    ].map(([t, pose, ease]) => [t, pose, ease, scale]);
  }
  const scores = [makeScore(-1, 1.03), makeScore(1, 0.86)];

  const lerp = (a, b, u) => a + (b - a) * u;
  const smoothstep = u => u * u * (3 - 2 * u);
  function samplePose(score, t) {
    let i = 0;
    while (i < score.length - 2 && score[i + 1][0] <= t) i++;
    const [t0, a, ease] = score[i], [t1, b] = score[Math.min(i + 1, score.length - 1)];
    let u = t1 > t0 ? (t - t0) / (t1 - t0) : 1;
    u = Math.max(0, Math.min(1, u));
    // `ease` 0 snaps into the shape in the first fifth of the interval and
    // holds it; 1 carries all the way across. A mie is the former.
    u = ease < 0.15 ? smoothstep(Math.min(1, u / 0.12))
      : smoothstep(u) ** (0.6 + ease * 0.9);
    const out = {};
    for (const k of Object.keys(REST)) {
      const va = a[k], vb = b[k];
      out[k] = Array.isArray(va)
        ? va.map((x, n) => lerp(x, vb[n], u))
        : lerp(va, vb, u);
    }
    return out;
  }

  // The base position each lion's `x`/`z` is measured from.
  const HOME = { x: 0, z: PZ - 3.1 };

  function applyPose(lion, pose, t, wild) {
    const { J, root } = lion;
    root.position.x = HOME.x + pose.x;
    root.position.z = HOME.z + pose.z;
    root.rotation.y = pose.yaw;
    // Breath, and a stamp of the supporting foot on the beat — a shishi is
    // never quite still even inside a held shape.
    const breathe = Math.sin(t * 1.4) * 0.012;
    J.pelvis.position.y = 0.94 - pose.crouch * 0.42 + breathe;
    J.pelvis.rotation.set(0, 0, 0);
    J.spine.rotation.set(pose.lean * 0.5 + breathe, pose.twist * 0.35, pose.sideLean * 0.5);
    J.chest.rotation.set(pose.lean * 0.5, pose.twist * 0.65, pose.sideLean * 0.5);
    J.neck.rotation.set(pose.head * 0.4 + wild.pitch * 0.35, pose.headYaw * 0.4 + wild.yaw * 0.35,
      pose.headRoll * 0.4 + wild.roll * 0.35);
    J.head.rotation.set(pose.head * 0.6 + wild.pitch * 0.65, pose.headYaw * 0.6 + wild.yaw * 0.65,
      pose.headRoll * 0.6 + wild.roll * 0.65);
    for (let s = 0; s < 2; s++) {
      const sign = s === 0 ? 1 : -1;                  // 0 = their left
      const arm = s === 0 ? J.armL : J.armR;
      const elb = s === 0 ? J.elbowL : J.elbowR;
      arm.rotation.set(-pose.armLift[s], 0, sign * pose.armOut[s]);
      elb.rotation.set(-pose.elbow[s], 0, 0);
      // The cloth leans after the arm, about half as far.
      lion.sodes[s].rotation.set(-pose.armLift[s] * 0.35, 0, sign * pose.armOut[s] * 0.55);
      const leg = s === 0 ? J.legL : J.legR;
      const knee = s === 0 ? J.kneeL : J.kneeR;
      leg.rotation.set(-pose.knee[s] * 0.55, 0, sign * pose.legOut[s]);
      knee.rotation.set(pose.knee[s] * 1.1, 0, 0);
    }
  }

  // ---- The head's own part ------------------------------------------------
  // Out of the kegurui the neck draws a circle, and the mane follows it half
  // a beat late. Anything less than a full rotation looks like a nod.
  function wildHead(t, showT, phase) {
    const out = { pitch: 0, yaw: 0, roll: 0 };
    if (showT > CUES.kegurui && showT < CUES.mie2 - 0.3) {
      const u = Math.min(1, (showT - CUES.kegurui) / 6);
      const hz = 0.55 + 0.55 * u;
      const a = (showT - CUES.kegurui) * hz * 6.2832 + phase;
      const amp = 0.85 * u;
      out.yaw = Math.sin(a) * amp;
      out.roll = Math.cos(a) * amp * 0.85;
      out.pitch = 0.25 + Math.cos(a * 2) * 0.18 * u;
    } else if (showT > CUES.mie1 - 0.3 && showT < CUES.mie1 + 1.4) {
      // The head-roll that ends a mie: one slow circle, then the glare.
      const u = Math.max(0, Math.min(1, (showT - CUES.mie1 + 0.3) / 1.1));
      const a = u * 6.2832;
      out.yaw = Math.sin(a) * 0.45 * (1 - u);
      out.roll = (Math.cos(a) - 1) * 0.3 * (1 - u);
    } else if (showT > CUES.mie2 && showT < CUES.mie2 + 1.6) {
      const u = Math.max(0, Math.min(1, (showT - CUES.mie2) / 1.2));
      const a = u * 6.2832;
      out.yaw = Math.sin(a) * 0.6 * (1 - u);
      out.roll = (Math.cos(a) - 1) * 0.35 * (1 - u);
    } else {
      out.pitch = Math.sin(t * 0.7 + phase) * 0.035;
      out.yaw = Math.sin(t * 0.43 + phase * 2) * 0.05;
    }
    return out;
  }

  // ---- The ensemble plays -------------------------------------------------
  const BEAT = 60 / 76;
  function tickTroupe(t, showT) {
    for (let i = 0; i < troupe.length; i++) {
      const p = troupe[i], ph = i * 1.37;
      const playing = showT > CUES.jo - 1 && showT < CUES.end - 3;
      const b = showT / (showT > CUES.kyu ? BEAT * 0.79 : BEAT);
      const sway = playing ? 0.05 : 0.02;
      p.body.rotation.x = 0.04 + Math.sin(t * 1.1 + ph) * sway * 0.4;
      p.body.rotation.y = Math.sin(t * 0.6 + ph) * sway;
      p.head.rotation.x = -0.06 + Math.sin(t * 0.9 + ph) * 0.05;
      p.head.rotation.y = Math.sin(t * 0.5 + ph * 1.7) * 0.10;
      if (!playing) continue;
      if (p.kind === 'shamisen') {
        // The right arm strikes on the beat, the left hand stays on the neck.
        const beat = Math.pow(Math.max(0, Math.cos(Math.PI * b + ph * 0.2)), 6);
        p.armR.rotation.x = -0.35 - beat * 0.5;
        p.armR.rotation.z = -0.55 + beat * 0.22;
        p.armL.rotation.x = -0.55;
        p.armL.rotation.z = 0.85 + Math.sin(t * 2.2 + ph) * 0.06;
      } else if (p.kind === 'tsuzumi') {
        const beat = Math.pow(Math.max(0, Math.cos(Math.PI * b * 0.5 + ph)), 8);
        p.armR.rotation.x = -0.9 - beat * 0.55;
        p.armR.rotation.z = -0.35;
        p.armL.rotation.set(-0.35, 0, 0.95);
      } else if (p.kind === 'fue') {
        p.armL.rotation.set(-1.15, 0, 0.55);
        p.armR.rotation.set(-1.25, 0, -0.75);
        p.head.rotation.y = 0.22 + Math.sin(t * 0.8) * 0.05;
      } else {                                   // the two singers
        const phrase = Math.max(0, Math.sin(showT * 0.55 + ph));
        p.head.rotation.x = -0.06 - phrase * 0.12;
        p.armL.rotation.set(-0.15, 0, 0.35);
        p.armR.rotation.set(-0.15, 0, -0.35);
      }
    }
  }

  // =========================================================================
  // The show itself
  // =========================================================================
  set.visible = false;
  maku.visible = false;
  makuRail.visible = false;
  for (const l of lions) { l.root.visible = false; l.maneMesh.visible = false; }
  for (const p of troupe) p.root.visible = false;
  koken.root.visible = false;
  group.visible = false;

  let running = false, showT = 0;

  function setVisible(on) {
    group.visible = on;
    set.visible = on;
    for (const l of lions) { l.root.visible = on; l.maneMesh.visible = on; }
    for (const p of troupe) p.root.visible = on;
    koken.root.visible = on;
    if (!on) for (const l of stageLamps) l.intensity = 0;
    if (!on) floatLight.intensity = 0;
  }

  return {
    group,
    lights,
    CUES,
    get running() { return running; },
    get showTime() { return showT; },
    start() {
      running = true;
      setVisible(true);
      setMaku(0);
      showT = 0;
    },
    stop() {
      running = false;
      setVisible(false);
    },
    /**
     * @param dt     frame time
     * @param t      wall clock, for the things that never stop breathing
     * @param cueT   where the recording is, in seconds — the dance is cued
     *               to the music, so this is the authority, not `dt`.
     */
    update(dt, t, cueT) {
      if (!running) return;
      showT = cueT;
      const step = Math.min(0.05, Math.max(0.001, dt));

      // The curtain: walked off to stage left over four seconds, then back
      // across at the very end so the loop starts closed again.
      let open = 0;
      if (showT >= CUES.maku) open = Math.min(1, (showT - CUES.maku) / 4.2);
      if (showT > CUES.end - 4.5) open = Math.max(0, (CUES.end - showT) / 4.5);
      setMaku(open);

      // Light. The float comes up under the curtain and the lamps follow it
      // as the cloth clears the opening.
      const up = Math.min(1, Math.max(0, (showT - CUES.maku + 1.5) / 3.5))
        * Math.min(1, Math.max(0, (CUES.end - showT) / 3));
      const surge = showT > CUES.mie2 && showT < CUES.mie2 + 4 ? 0.22 : 0;
      stageLamps[0].intensity = (24 + surge * 40) * up;
      stageLamps[1].intensity = (24 + surge * 40) * up;
      stageLamps[2].intensity = 15 * up;
      stageLamps[3].intensity = 13 * up;
      floatLight.intensity = 11 * up;

      for (let i = 0; i < lions.length; i++) {
        const lion = lions[i];
        const pose = samplePose(scores[i], showT);
        applyPose(lion, pose, t, wildHead(t, showT, i * 2.1));
        lion.tickMane(step);
      }
      tickTroupe(t, showT);
    },
    /** Where a spectator should be looking. */
    focus: new THREE.Vector3(0, SY + 1.35, PZ - 2.6),
  };
}
