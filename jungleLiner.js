// jungleLiner.js — the liner at anchor off the cove: the SAME ship you
// walk in main-CRUISE.js, seen from the island at ~600 m. Her plan and
// livery are copied from there (190 m, 34 m beam, navy topsides with a gold
// cheatline over red boot-topping, the white house, the pool deck, the raked
// navy funnel with its gold band and black top), so stepping off the tender
// you recognise the ship you left.
//
// DISTANCE RULES: at 600 m a metre is about a pixel. Detail that is smaller
// than that is carried by TEXTURES, never geometry — mipmaps average a
// window row into a soft band, whereas a hundred tiny boxes would shimmer.
// So: hull portholes are an emissive dot texture on the hull (glass catching
// the sky reads as a pale dot on navy, which a multiplying map can't make),
// house windows a tiling bay texture with UVs baked in metres, and only the
// things that change the SILHOUETTE are modelled: sheer and raked stem,
// stepped decks, bridge wings, funnel, mast, lifeboats.
//
// Local frame as in main-CRUISE.js: bow at +Z, stern at -Z, sea at y = 0.
import * as THREE from 'three';

const SHIP_L2 = 95, BEAM2 = 17;          // half length, half beam
const DECK_Y = 8.0;                      // promenade deck
const POOL_Y = 15.5;                     // pool deck walking surface
const SUP_X2 = 13, SUP_Z0 = -60, SUP_Z1 = 62;   // the house
const POOL_X2 = 15, POOL_Z0 = -66, POOL_Z1 = 62;
const HULL_BOT = -3.2;                   // deep enough: the sea hides the rest
const DECK_H = 2.8;                      // one deck, floor to floor
const BAY = 4.0;                         // one window bay along the side

const clamp01 = v => (v < 0 ? 0 : v > 1 ? 1 : v);
const sstep = v => { v = clamp01(v); return v * v * (3 - 2 * v); };

// main-CRUISE.js's halfBeam: parallel-sided over most of her length, a long
// fine entry, a blunt cruiser stern.
function halfBeam(z) {
  const t = z / SHIP_L2;
  if (t > 0.52) { const u = (t - 0.52) / 0.48; return BEAM2 * Math.max(0.06, 1 - u * u * 0.96); }
  if (t < -0.74) { const u = (-t - 0.74) / 0.26; return BEAM2 * Math.max(0.44, 1 - u * u * 0.58); }
  return BEAM2;
}
const sheerY = z => DECK_Y + 2.2 * Math.pow(clamp01((z / SHIP_L2 - 0.3) / 0.7), 2);  // rises to the bow

// --- Textures -----------------------------------------------------------------
function canvasTex(w, h, draw, { srgb = true, clampT = false } = {}) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = clampT ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

// One window bay of the house (BAY wide, DECK_H tall, floor at the bottom):
// white plating, a tall tinted pane with a mullion, and the dark line of the
// balcony divider — enough that rows of them read as a cruise ship's cliffs
// of cabins.
const bayTex = () => canvasTex(128, 96, (g, w, h) => {
  g.fillStyle = '#f4efe4'; g.fillRect(0, 0, w, h);
  const top = h * (1 - 2.35 / DECK_H), bot = h * (1 - 0.75 / DECK_H);
  const grad = g.createLinearGradient(0, top, 0, bot);
  grad.addColorStop(0, '#5f7f99'); grad.addColorStop(1, '#2d4458');   // sky in the glass
  g.fillStyle = grad; g.fillRect(w * 0.07, top, w * 0.86, bot - top);
  g.fillStyle = '#e9e3d6'; g.fillRect(w * 0.49, top, w * 0.02, bot - top);  // mullion
  g.fillStyle = '#c9c2b4'; g.fillRect(0, bot, w, h * 0.04);                 // balcony rail
  g.fillStyle = '#b8b1a3'; g.fillRect(0, 0, w * 0.02, h);                   // divider
});

// The bridge: one continuous band of raked, dark glass.
const bridgeTex = () => canvasTex(64, 96, (g, w, h) => {
  g.fillStyle = '#f4efe4'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#1e2c38'; g.fillRect(0, h * 0.18, w, h * 0.46);
  g.fillStyle = '#34495b'; g.fillRect(0, h * 0.18, w, h * 0.08);
  g.fillStyle = '#10181f'; g.fillRect(w * 0.48, h * 0.18, w * 0.04, h * 0.46);
});

// Hull portholes, as EMISSIVE dots: v spans y in [0, DECK_Y], u one metre
// per 2 m pitch. Two rows; black elsewhere, and clamped in v so nothing
// leaks onto the boot-topping or the deck.
const portTex = () => canvasTex(32, 256, (g, w, h) => {
  g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#fff';
  for (const y of [3.0, 5.2]) {
    g.beginPath();
    g.arc(w / 2, h * (1 - y / DECK_Y), w * 0.2, 0, Math.PI * 2);
    g.fill();
  }
}, { srgb: false, clampT: true });

// --- Geometry -----------------------------------------------------------------
// The hull loft: closed sections from the transom to the stem, paint by band
// with duplicated vertices at each band edge so the colours stay crisp. The
// stem RAKES: below the sheer, the ring's points are pulled aft the lower
// they sit, so the bow overhangs its waterline like a real liner's.
function makeHullGeo() {
  const navy = new THREE.Color(0x24557f), gold = new THREE.Color(0xb8913f),
    red = new THREE.Color(0xa8362f), deck = new THREE.Color(0xd9cdb6);
  const Z = [];
  for (let z = -SHIP_L2; z < 40; z += 5) Z.push(z);
  for (let z = 40; z <= SHIP_L2 + 1e-6; z += 2.5) Z.push(z);
  const pos = [], col = [], uv = [], ind = [];
  let ring = 0;
  Z.forEach(z => {
    const hb = halfBeam(z), yTop = sheerY(z);
    const bow = sstep((z / SHIP_L2 - 0.72) / 0.28);
    const hbW = hb * (1 - 0.3 * bow);                  // flare: fuller at the rail
    const side = [                                      // starboard, top down
      [hb, yTop, navy], [hb, 6.8, navy], [hb, 6.8, gold], [hb, 6.4, gold],
      [hb, 6.4, navy], [hb * (0.97 + 0.03 * (1 - bow)), 0.5, navy],
      [hbW, 0.5, red], [hbW * 0.96, -1.6, red], [hbW * 0.75, HULL_BOT, red],
      [0, HULL_BOT - 0.2, red],
    ];
    const rs = side.slice();
    for (let k = side.length - 2; k >= 0; k--) rs.push([-side[k][0], side[k][1], side[k][2]]);
    rs.push([-hb, yTop, deck], [0, yTop + 0.3, deck], [hb, yTop, deck]);   // cambered deck
    ring = rs.length;
    for (const [x, y, c] of rs) {
      const rake = 9 * bow * clamp01((yTop - y) / (yTop - HULL_BOT));
      const zz = z - rake;
      pos.push(x, y, zz);
      col.push(c.r, c.g, c.b);
      uv.push(zz / 2, y / DECK_Y);
    }
  });
  for (let i = 0; i < Z.length - 1; i++) {
    const r0 = i * ring, r1 = (i + 1) * ring;
    for (let k = 0; k < ring; k++) {
      const kn = (k + 1) % ring;
      // Stations run stern -> bow over INCREASING z: the opposite winding
      // of jungleTender's loft, for outward normals.
      ind.push(r0 + k, r1 + k, r1 + kn);
      ind.push(r0 + k, r1 + kn, r0 + kn);
    }
  }
  // The transom: a flat navy cap facing aft, on its own vertices.
  const c0 = pos.length / 3;
  pos.push(0, 3, -SHIP_L2); col.push(navy.r, navy.g, navy.b); uv.push(0, -1);
  for (let k = 0; k < ring; k++) {
    pos.push(pos[k * 3], pos[k * 3 + 1], pos[k * 3 + 2]);
    col.push(navy.r, navy.g, navy.b); uv.push(0, -1);
  }
  for (let k = 0; k < ring; k++) ind.push(c0, c0 + 1 + k, c0 + 1 + (k + 1) % ring);

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(ind);
  g.computeVertexNormals();
  return g;
}

// A box with its UVs in world metres of the SHIP: u along the face in bays,
// v in decks counted from the promenade deck, so every block's window rows
// line up with its neighbours' and sit on the real deck levels.
function deckhouse(cx, y0, cz, sx, sy, sz, uScale = BAY) {
  const g = new THREE.BoxGeometry(sx, sy, sz);
  const p = g.attributes.position, n = g.attributes.normal, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i) + cx, y = p.getY(i) + y0 + sy / 2, z = p.getZ(i) + cz;
    const v = (y - DECK_Y) / DECK_H;
    if (Math.abs(n.getX(i)) > 0.5) uv.setXY(i, z / uScale, v);
    else if (Math.abs(n.getZ(i)) > 0.5) uv.setXY(i, x / uScale, v);
    else uv.setXY(i, 0.02, 0.02);                 // roofs: plain white plating
  }
  g.translate(cx, y0 + sy / 2, cz);
  return g;
}

export function createJungleLiner({ scene, position, yaw }) {
  const group = new THREE.Group();

  const white = new THREE.MeshStandardMaterial({ color: 0xf2ece0, roughness: 0.7, metalness: 0.04 });
  const cabins = new THREE.MeshStandardMaterial({ map: bayTex(), roughness: 0.62, metalness: 0.05 });
  const bridge = new THREE.MeshStandardMaterial({ map: bridgeTex(), roughness: 0.5, metalness: 0.05 });
  const hullMat = new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 0.5, metalness: 0.06,
    emissive: 0xb8cde0, emissiveMap: portTex(), emissiveIntensity: 0.55,
  });
  const navy = new THREE.MeshStandardMaterial({ color: 0x24557f, roughness: 0.5, metalness: 0.06 });
  const gold = new THREE.MeshStandardMaterial({ color: 0xb8913f, roughness: 0.72, metalness: 0.2 });
  const black = new THREE.MeshStandardMaterial({ color: 0x1b1e24, roughness: 0.5 });
  const orange = new THREE.MeshStandardMaterial({ color: 0xf07a22, roughness: 0.6 });
  const steel = new THREE.MeshStandardMaterial({ color: 0xcdd3d8, roughness: 0.42, metalness: 0.35 });

  const add = (geo, mat) => { const m = new THREE.Mesh(geo, mat); group.add(m); return m; };

  // Hull.
  add(makeHullGeo(), hullMat);

  // The house: two and a half decks of cabins on the promenade deck, from
  // just abaft the bow to the stern terraces.
  add(deckhouse(0, DECK_Y, (SUP_Z0 + SUP_Z1) / 2, SUP_X2 * 2, POOL_Y - 0.4 - DECK_Y, SUP_Z1 - SUP_Z0), cabins);
  // Stern terraces: the aft end steps down a deck at a time, the cruise
  // ship's signature.
  add(deckhouse(0, DECK_Y, -69, SUP_X2 * 2 - 2, DECK_H, 18), cabins);
  // Pool deck: a slab overhanging the house by two metres a side.
  add(deckhouse(0, POOL_Y - 0.4, (POOL_Z0 + POOL_Z1) / 2, POOL_X2 * 2, 0.4, POOL_Z1 - POOL_Z0), white);
  // Glass windbreak round the pool deck: a pale band, the lido's railing.
  add(deckhouse(0, POOL_Y, (POOL_Z0 + POOL_Z1) / 2, POOL_X2 * 2 - 0.3, 1.1, POOL_Z1 - POOL_Z0 - 0.3),
    new THREE.MeshStandardMaterial({ color: 0xbcd3dc, roughness: 0.2, metalness: 0.1, transparent: true, opacity: 0.45, depthWrite: false }));

  // Forward: the bridge block, two decks over the pool deck, and the
  // navigating bridge on top with its wings reaching the ship's sides.
  add(deckhouse(0, POOL_Y, 49, 22, DECK_H * 1.6, 22), cabins);
  add(deckhouse(0, POOL_Y + DECK_H * 1.6, 54, BEAM2 * 2, DECK_H, 7, 3), bridge);
  add(deckhouse(0, POOL_Y + DECK_H * 2.6, 52, 20, 0.5, 12), white);          // the monkey island
  // Aft of the funnel, a low observation lounge.
  add(deckhouse(0, POOL_Y, -50, 20, DECK_H, 14), cabins);

  // Mast on the bridge top: pole, yard, radar.
  const mz = 49, my = POOL_Y + DECK_H * 2.6 + 0.5;
  const pole = add(new THREE.CylinderGeometry(0.25, 0.45, 9, 8), white);
  pole.position.set(0, my + 4.5, mz); pole.rotation.x = -0.08;
  const yard = add(new THREE.BoxGeometry(7, 0.3, 0.3), white);
  yard.position.set(0, my + 6.5, mz - 0.5);
  const radar = add(new THREE.BoxGeometry(4.5, 0.35, 0.6), steel);
  radar.position.set(0, my + 1.4, mz + 3);

  // The funnel, as on the ship: oval, raked aft, navy / gold / black.
  const fz = -30;
  const funnelGeo = new THREE.CylinderGeometry(0.42, 0.5, 1, 24);
  const funnel = (mat, y, dz, sx, sy, sz) => {
    const m = add(funnelGeo, mat);
    m.position.set(0, y, fz + dz); m.scale.set(sx, sy, sz); m.rotation.x = -0.10;
  };
  funnel(navy, POOL_Y + 5.5, 0, 11.0, 11.0, 7.0);
  funnel(gold, POOL_Y + 9.6, 0.45, 11.3, 1.7, 7.2);
  funnel(black, POOL_Y + 11.0, 0.6, 11.0, 1.2, 7.0);

  // Lifeboats hung along both sides under the pool deck's overhang, bright
  // orange, the one colour that carries across a bay.
  const boatGeo = new THREE.CapsuleGeometry(1.3, 6.5, 3, 10);
  boatGeo.rotateX(Math.PI / 2);
  boatGeo.scale(1, 0.85, 1);
  const roofGeo = new THREE.BoxGeometry(2.2, 0.35, 6.5);
  for (const s of [-1, 1]) {
    for (let z = -42; z <= 44; z += 10.75) {
      const b = add(boatGeo, orange);
      b.position.set(s * (SUP_X2 + 1.5), 11.4, z);
      const r = add(roofGeo, white);
      r.position.set(s * (SUP_X2 + 1.5), 12.5, z);
    }
  }

  // Far scenery: never in the shadow map's reach, never worth a shadow pass.
  group.traverse(o => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });
  group.position.copy(position);
  group.rotation.y = yaw;
  scene.add(group);
  return { group };
}
