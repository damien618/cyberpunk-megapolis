// jungleVegetation.js — coconut palms, rainforest giants, ferns, broad-leaved
// understorey plants and hanging lianas, every one of them an InstancedMesh.
//
// Three rules shape this file:
//
// 1. Each plant is ONE merged geometry (a whole fern clump, a whole palm
//    crown) instanced many times — not one instance per leaf. That keeps the
//    instance counts in the hundreds and the draw calls per species small.
// 2. Instances are bucketed into TILE-metre tiles, one InstancedMesh per
//    species per tile, so the camera frustum culls tile by tile and the small
//    undergrowth can be switched off beyond UNDERGROWTH_FAR (the fog hides
//    the edge). update(cameraPos) does that, a few times a second.
// 3. Nothing here is on `world`. cityBoxes would turn every fern into a wall
//    and every leaf into a camera occluder. The trunks that must stop you are
//    returned as `colliders` for main-JUNGLE.js to register; the canopy
//    trunks are tall, so the web has something to swing from.
//
// Leaves are cut-alpha canvas cards (alphaTest, not blending, so they still
// write depth), cupped so they never collapse to a line edge-on.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  terrainHeight, forestDensity, shoreAt, cliffZ, ridgeAt, pathDistance, PATH,
  PATH_HALF_W, SAND_END, PLAY_HALF_W, POOL, JETTY, smoothstep,
} from './jungleLayout.js';

const TILE = 40;
const UNDERGROWTH_FAR = 75;

// ---------------------------------------------------------------------------
// Leaf textures.
// ---------------------------------------------------------------------------
function canvas(w, h, draw, maxAniso) {
  const c = Object.assign(document.createElement('canvas'), { width: w, height: h });
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = maxAniso;
  return t;
}
const rgb = (r, g, b, k = 1) => `rgb(${Math.round(r * k)},${Math.round(g * k)},${Math.round(b * k)})`;

// Coconut frond: opposed leaflets up a rib, drooping toward the tip.
function frondTexture(a) {
  return canvas(256, 256, (g, S) => {
    const cx = S / 2;
    for (let i = 0; i < 28; i++) {
      const t = i / 27, y = S - 10 - t * (S - 24);
      const len = Math.sin(Math.PI * (0.18 + t * 0.82)) * S * 0.34 * (1 - t * 0.35);
      const droop = 10 + t * 28;
      for (const dir of [-1, 1]) {
        g.beginPath();
        g.moveTo(cx, y);
        g.quadraticCurveTo(cx + dir * len * 0.6, y - 4, cx + dir * len, y + droop);
        g.quadraticCurveTo(cx + dir * len * 0.5, y + 8, cx, y + 7);
        g.closePath();
        g.fillStyle = rgb(70, 132, 52, 0.7 + ((i + (dir > 0 ? 1 : 0)) % 3) * 0.12);
        g.fill();
      }
    }
    g.strokeStyle = '#8a8a44'; g.lineWidth = 5; g.lineCap = 'round';
    g.beginPath(); g.moveTo(cx, S - 4); g.lineTo(cx, 12); g.stroke();
  }, a);
}

// Fern frond: finer, denser pinnae, tapering to a point.
function fernTexture(a) {
  return canvas(128, 256, (g, W, H) => {
    const cx = W / 2;
    for (let i = 0; i < 30; i++) {
      const t = i / 29, y = H - 8 - t * (H - 16);
      const len = Math.sin(Math.PI * Math.min(1, 0.15 + t)) * W * 0.44 * (1 - t * 0.7);
      for (const dir of [-1, 1]) {
        g.beginPath();
        g.ellipse(cx + dir * len * 0.5, y - 2, len * 0.5, 3.2, dir * -0.35, 0, Math.PI * 2);
        g.fillStyle = rgb(62, 124, 44, 0.75 + (i % 4) * 0.08);
        g.fill();
      }
    }
    g.strokeStyle = '#4e6a2a'; g.lineWidth = 2.4;
    g.beginPath(); g.moveTo(cx, H); g.lineTo(cx, 6); g.stroke();
  }, a);
}

// Broad leaf (banana / heliconia): one blade, midrib, parallel veins, and a
// few NARROW tears cut after the veins are painted.
function broadLeafTexture(a) {
  return canvas(128, 256, (g, W, H) => {
    const cx = W / 2;
    g.beginPath();
    g.moveTo(cx, H - 2);
    g.bezierCurveTo(cx + W * 0.62, H * 0.78, cx + W * 0.5, H * 0.12, cx, 2);
    g.bezierCurveTo(cx - W * 0.5, H * 0.12, cx - W * 0.62, H * 0.78, cx, H - 2);
    const grd = g.createLinearGradient(0, 0, W, 0);
    grd.addColorStop(0, '#2f6a26'); grd.addColorStop(0.5, '#4f9a38'); grd.addColorStop(1, '#2f6a26');
    g.fillStyle = grd;
    g.fill();
    g.save();
    g.clip();
    g.strokeStyle = 'rgba(190,220,120,0.35)'; g.lineWidth = 1;
    for (let y = 16; y < H - 10; y += 7) {
      g.beginPath(); g.moveTo(cx, y); g.lineTo(0, y - 22); g.moveTo(cx, y); g.lineTo(W, y - 22); g.stroke();
    }
    g.restore();
    g.strokeStyle = '#a8c070'; g.lineWidth = 3;
    g.beginPath(); g.moveTo(cx, H); g.lineTo(cx, 6); g.stroke();
    // Tears, from the margin toward the rib, following the veins.
    g.globalCompositeOperation = 'destination-out';
    g.lineWidth = 2.2;
    for (const [side, y] of [[1, 70], [-1, 104], [1, 150], [-1, 180], [1, 205]]) {
      g.beginPath();
      g.moveTo(cx + side * W * 0.5, y - 22);
      g.lineTo(cx + side * W * 0.12, y);
      g.stroke();
    }
    g.globalCompositeOperation = 'source-over';
  }, a);
}

// Liana: a twisting stem with small alternating leaves.
function vineTexture(a) {
  return canvas(64, 512, (g, W, H) => {
    const cx = W / 2;
    g.strokeStyle = '#5a4a2c'; g.lineWidth = 4;
    g.beginPath();
    for (let y = 0; y <= H; y += 8) g.lineTo(cx + Math.sin(y * 0.05) * 6, y);
    g.stroke();
    for (let y = 10; y < H; y += 17) {
      const side = (y / 17) % 2 < 1 ? 1 : -1;
      const x = cx + Math.sin(y * 0.05) * 6;
      g.beginPath();
      g.ellipse(x + side * 10, y + 4, 9, 5, side * 0.6, 0, Math.PI * 2);
      g.fillStyle = rgb(58, 110, 40, 0.8 + (y % 3) * 0.1);
      g.fill();
    }
  }, a);
}

function leafMaterial(map, color = 0xffffff) {
  const m = new THREE.MeshStandardMaterial({
    map, color, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.78,
  });
  return m;
}
// Shadow casters with cut-out leaves need their own depth material, or the
// shadow is the card's rectangle.
function leafDepth(map) {
  return new THREE.MeshDepthMaterial({
    depthPacking: THREE.RGBADepthPacking, map, alphaTest: 0.5, side: THREE.DoubleSide,
  });
}

// ---------------------------------------------------------------------------
// Geometry. A "leaf" is a cupped blade growing from the origin: `len` along
// its axis, tilted `tilt` from vertical, sagging `droop` at the tip, spun
// `spin` about Y. Several are merged into one plant.
// ---------------------------------------------------------------------------
function leaf({ w, len, tilt, droop = 0, spin = 0, cup = 0.12, y0 = 0, segY = 5 }) {
  const g = new THREE.PlaneGeometry(1, 1, 2, segY);
  const p = g.getAttribute('position');
  for (let i = 0; i < p.count; i++) {
    const u = p.getX(i) * 2;                 // -1 … 1 across
    const v = p.getY(i) + 0.5;               //  0 … 1 along
    const along = v * len;
    const lateral = u * w * 0.5;
    const back = -(cup * w) * u * u - 0.05 * len * v * v * 0.3;
    const x = lateral;
    const y = y0 + along * Math.cos(tilt) - droop * v * v + back * Math.sin(tilt);
    const z = along * Math.sin(tilt) + back * Math.cos(tilt);
    p.setXYZ(i, x * Math.cos(spin) + z * Math.sin(spin), y, -x * Math.sin(spin) + z * Math.cos(spin));
  }
  g.computeVertexNormals();
  return g;
}

function palmCrownGeo() {
  const parts = [];
  const n = 11;
  for (let i = 0; i < n; i++) {
    parts.push(leaf({
      w: 2.4, len: 4.2 + (i % 3) * 0.4, tilt: 1.05 + (i % 3) * 0.25, droop: 1.6 + (i % 2) * 0.6,
      spin: (i / n) * Math.PI * 2 + (i % 2) * 0.2, cup: 0.18,
    }));
  }
  return mergeGeometries(parts);
}

// A trunk that curves: a tapered cylinder whose axis bends toward local -Z
// with height. The top is at (0, 1, -BEND) in unit space.
const PALM_BEND = 0.45;   // in units of the trunk's girth scale (×1.1)
function palmTrunkGeo() {
  const g = new THREE.CylinderGeometry(0.17, 0.24, 1, 8, 10).translate(0, 0.5, 0);
  const p = g.getAttribute('position');
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    p.setZ(i, p.getZ(i) - PALM_BEND * y * y);
  }
  g.computeVertexNormals();
  return g;
}

function fernGeo() {
  const parts = [];
  const n = 9;
  for (let i = 0; i < n; i++) {
    parts.push(leaf({
      w: 0.5, len: 1.1 + (i % 3) * 0.2, tilt: 0.7 + (i % 3) * 0.25, droop: 0.35,
      spin: (i / n) * Math.PI * 2 + (i % 2) * 0.3, cup: 0.15, segY: 3,
    }));
  }
  return mergeGeometries(parts);
}

// Broad-leaved plant: leaves held up on stalks, arching out.
function broadPlantGeo() {
  const parts = [];
  const n = 6;
  for (let i = 0; i < n; i++) {
    const spin = (i / n) * Math.PI * 2 + (i % 2) * 0.4;
    const tilt = 0.45 + (i % 3) * 0.2;
    parts.push(leaf({ w: 0.75, len: 1.9, tilt: tilt + 0.3, droop: 0.5, spin, cup: 0.1, y0: 0.7 }));
    // Petiole as a thin card.
    parts.push(leaf({ w: 0.05, len: 0.8, tilt: tilt * 0.6, spin, cup: 0, segY: 1 }));
  }
  return mergeGeometries(parts);
}

// Rainforest giant's crown: a few faceted lobes. Solid, so it shades the
// floor below without an alpha depth pass.
function crownLobeGeo() {
  const g = new THREE.IcosahedronGeometry(1, 1);
  const p = g.getAttribute('position');
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const k = Math.sin(Math.round(v.x * 700) * 12.99 + Math.round(v.y * 700) * 78.23
      + Math.round(v.z * 700) * 37.72) * 43758.5453;
    v.multiplyScalar(0.8 + (k - Math.floor(k)) * 0.35);
    v.y *= 0.55;
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}

// ---------------------------------------------------------------------------
// Tiled instancing.
// ---------------------------------------------------------------------------
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler();
const _p = new THREE.Vector3(), _s = new THREE.Vector3();
function matrixOf(it) {
  _p.set(it.x, it.y, it.z);
  _e.set(it.rx || 0, it.ry || 0, it.rz || 0, 'YXZ');
  _q.setFromEuler(_e);
  _s.set(it.sx ?? it.s ?? 1, it.sy ?? it.s ?? 1, it.sz ?? it.s ?? 1);
  return _m.compose(_p, _q, _s);
}

function tiled(group, name, geo, mat, items, { cast = false, depth = null, far = Infinity, tint = null, tile = TILE } = {}) {
  const tiles = new Map();
  for (const it of items) {
    const k = `${Math.floor(it.x / tile)},${Math.floor(it.z / tile)}`;
    (tiles.get(k) ?? tiles.set(k, []).get(k)).push(it);
  }
  const meshes = [];
  const col = new THREE.Color();
  for (const [k, list] of tiles) {
    const im = new THREE.InstancedMesh(geo, mat, list.length);
    list.forEach((it, i) => {
      im.setMatrixAt(i, matrixOf(it));
      if (tint) im.setColorAt(i, col.setHSL(tint.h + (it.hue ?? 0), tint.s, tint.l + (it.light ?? 0)));
    });
    im.instanceMatrix.needsUpdate = true;
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
    im.computeBoundingSphere();
    im.castShadow = cast;
    im.receiveShadow = true;
    if (depth) im.customDepthMaterial = depth;
    im.name = `${name}@${k}`;
    im.userData.far = far;
    group.add(im);
    meshes.push(im);
  }
  return meshes;
}

// ---------------------------------------------------------------------------
// Scatter.
// ---------------------------------------------------------------------------
// Low-frequency clumping: plants grow in patches, never as an even scatter.
function clump(x, z, salt) {
  return 0.5 + 0.5 * Math.sin(x * 0.083 + salt + Math.sin(z * 0.061 + salt * 2) * 2.1)
    * Math.cos(z * 0.074 - salt + Math.sin(x * 0.05) * 1.7);
}

function jittered(rnd, x0, x1, z0, z1, cell, keep) {
  const out = [];
  for (let z = z0; z < z1; z += cell) for (let x = x0; x < x1; x += cell) {
    const px = x + rnd() * cell, pz = z + rnd() * cell;
    const r = rnd();
    if (keep(px, pz, r)) out.push([px, pz]);
  }
  return out;
}

// Keep plants off the jetty and out of the pool.
function clearOfBuilt(x, z) {
  if (Math.abs(x - JETTY.x) < JETTY.halfW + 2 && z < JETTY.z0 + 3) return false;
  if (Math.hypot(x - POOL.x, z - POOL.z) < POOL.r + 1) return false;
  return true;
}

export function buildJungleVegetation({ scene, rnd, maxAniso = 4 }) {
  const group = new THREE.Group();
  group.name = 'jungle_vegetation';
  scene.add(group);
  const colliders = [];
  const meshes = [];

  const tex = {
    frond: frondTexture(maxAniso), fern: fernTexture(maxAniso),
    broad: broadLeafTexture(maxAniso), vine: vineTexture(maxAniso),
  };
  const mat = {
    frond: leafMaterial(tex.frond),
    fern: leafMaterial(tex.fern),
    broad: leafMaterial(tex.broad),
    vine: leafMaterial(tex.vine),
    palmBark: new THREE.MeshStandardMaterial({ color: 0x8a7458, roughness: 0.95 }),
    bark: new THREE.MeshStandardMaterial({ color: 0x6b5d4a, roughness: 0.95 }),
    crown: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, flatShading: true }),
  };
  const geo = {
    palmTrunk: palmTrunkGeo(), palmCrown: palmCrownGeo(),
    fern: fernGeo(), broad: broadPlantGeo(),
    trunk: new THREE.CylinderGeometry(0.32, 0.55, 1, 8).translate(0, 0.5, 0),
    lobe: crownLobeGeo(),
    vine: new THREE.PlaneGeometry(0.5, 1, 1, 4).translate(0, -0.5, 0),
  };

  // --- Coconut palms: along the back of the beach and the forest edge,
  // leaning out toward the light over the sand.
  const palmTrunks = [], palmCrowns = [];
  const palmSpots = jittered(rnd, -PLAY_HALF_W + 6, PLAY_HALF_W - 6, -12, SAND_END + 22, 6.5, (x, z, r) => {
    const d = z - shoreAt(x);
    if (d < 7 || !clearOfBuilt(x, z)) return false;
    if (pathDistance(x, z) < PATH_HALF_W + 1.5) return false;
    if (ridgeAt(x) > 0.3) return false;
    const band = smoothstep(d, 7, 12) * (1 - smoothstep(z, SAND_END + 8, SAND_END + 22));
    return r < band * (0.25 + 0.5 * clump(x, z, 1.3));
  });
  // A few palms scattered through the forest too — the island's signature.
  palmSpots.push(...jittered(rnd, -70, 70, SAND_END + 20, 130, 22, (x, z, r) =>
    r < 0.35 * forestDensity(x, z)));
  const top = new THREE.Vector3();
  for (const [x, z] of palmSpots) {
    const h = 8 + rnd() * 6;
    // Local -Z is the way the trunk bends and leans; ry ≈ 0 points that
    // seaward, give or take.
    const ry = (rnd() - 0.5) * 1.6;
    const lean = -(0.08 + rnd() * 0.22);
    const y = terrainHeight(x, z) - 0.2;
    const trunk = { x, y, z, sx: 1.1, sy: h, sz: 1.1, ry, rx: lean };
    palmTrunks.push(trunk);
    // The crown sits on the bent, leaning top, found through the same matrix.
    top.set(0, 1, -PALM_BEND).applyMatrix4(matrixOf(trunk));
    palmCrowns.push({ x: top.x, y: top.y - 0.1, z: top.z, s: 1.25 + rnd() * 0.35, ry: rnd() * 6.28,
      rx: (rnd() - 0.5) * 0.15, hue: (rnd() - 0.5) * 0.04, light: (rnd() - 0.5) * 0.08 });
    colliders.push({ x0: x - 0.3, x1: x + 0.3, z0: z - 0.3, z1: z + 0.3, y0: y, y1: y + 3, tall: false });
  }
  meshes.push(...tiled(group, 'palmTrunk', geo.palmTrunk, mat.palmBark, palmTrunks, { cast: true }));
  meshes.push(...tiled(group, 'palmCrown', geo.palmCrown, mat.frond, palmCrowns,
    { cast: true, depth: leafDepth(tex.frond), tint: { h: 0, s: 0, l: 1 } }));

  // --- Rainforest giants: in the valley, on the ridges and on the plateau
  // above the falls (the skyline you see from the beach).
  const trees = [];
  const valleySpots = jittered(rnd, -PLAY_HALF_W - 30, PLAY_HALF_W + 30, SAND_END + 4, 160, 10, (x, z, r) =>
    r < forestDensity(x, z) * (0.35 + 0.45 * clump(x, z, 4.1))
      || (ridgeAt(x) > 0.4 && z < cliffZ(x) - 3 && z > -20 && r < 0.4));
  // The skyline above the falls. Always on screen from the valley, never
  // close, so it goes in big tiles: fewer draw calls, nothing to cull.
  const backdropSpots = jittered(rnd, -200, 200, 150, 300, 13, (x, z, r) =>
    z > cliffZ(x) + 5 && r < 0.55);
  const trunks = [], lobes = [], vines = [];
  const backTrunks = [], backLobes = [];
  for (const [x, z, backdrop] of [
    ...valleySpots.map(([x, z]) => [x, z, false]),
    ...backdropSpots.map(([x, z]) => [x, z, true]),
  ]) {
    const trunkList = backdrop ? backTrunks : trunks;
    const lobeList = backdrop ? backLobes : lobes;
    const y = terrainHeight(x, z);
    const h = 14 + rnd() * 12;
    const girth = 1.2 + rnd() * 0.9;
    trunkList.push({ x, y: y - 0.3, z, sx: girth, sy: h, sz: girth, ry: rnd() * 6.28 });
    const R = 4 + rnd() * 3.5;
    const nL = 3 + Math.floor(rnd() * 3);
    for (let i = 0; i < nL; i++) {
      const a = (i / nL) * Math.PI * 2 + rnd();
      const off = i === 0 ? 0 : R * (0.45 + rnd() * 0.35);
      lobeList.push({
        x: x + Math.cos(a) * off, y: y + h + (rnd() - 0.3) * 2.5, z: z + Math.sin(a) * off,
        sx: R * (0.8 + rnd() * 0.4), sy: R * (0.8 + rnd() * 0.4), sz: R * (0.8 + rnd() * 0.4),
        ry: rnd() * 6.28, hue: (rnd() - 0.5) * 0.05, light: (rnd() - 0.5) * 0.07,
      });
    }
    // Lianas hanging from the crown's rim — only in the walkable valley,
    // where someone can see them.
    if (Math.abs(x) < PLAY_HALF_W && z < 150) {
      const nV = Math.floor(rnd() * 4);
      for (let i = 0; i < nV; i++) {
        const a = rnd() * Math.PI * 2, off = R * (0.4 + rnd() * 0.5);
        const vx = x + Math.cos(a) * off, vz = z + Math.sin(a) * off;
        const ground = terrainHeight(vx, vz);
        const top = y + h - 0.5;
        const len = (top - ground) * (0.45 + rnd() * 0.5);
        if (pathDistance(vx, vz) < PATH_HALF_W + 0.3 && top - len < ground + 2.2) continue;
        vines.push({ x: vx, y: top, z: vz, sx: 1, sy: len, sz: 1, ry: rnd() * 6.28 });
        vines.push({ x: vx, y: top, z: vz, sx: 1, sy: len, sz: 1, ry: rnd() * 6.28 + Math.PI / 2 });
      }
    }
    if (Math.abs(x) < PLAY_HALF_W + 2) {
      colliders.push({ x0: x - girth * 0.4, x1: x + girth * 0.4, z0: z - girth * 0.4,
        z1: z + girth * 0.4, y0: y - 0.3, y1: y + h, tall: true });
    }
  }
  meshes.push(...tiled(group, 'trunk', geo.trunk, mat.bark, trunks, { cast: true }));
  meshes.push(...tiled(group, 'crown', geo.lobe, mat.crown, lobes,
    { cast: true, tint: { h: 0.27, s: 0.42, l: 0.24 } }));
  meshes.push(...tiled(group, 'backTrunk', geo.trunk, mat.bark, backTrunks, { tile: 200 }));
  meshes.push(...tiled(group, 'backCrown', geo.lobe, mat.crown, backLobes,
    { tile: 200, tint: { h: 0.27, s: 0.42, l: 0.24 } }));
  meshes.push(...tiled(group, 'vine', geo.vine, mat.vine, vines, { far: UNDERGROWTH_FAR }));

  // --- Undergrowth: ferns and broad-leaved plants, in patches, thinning out
  // toward the path so it stays a path, and densest at the forest edge.
  const ferns = jittered(rnd, -PLAY_HALF_W - 10, PLAY_HALF_W + 10, SAND_END - 4, 156, 3.2, (x, z, r) =>
    clearOfBuilt(x, z) && r < forestDensity(x, z) * (0.2 + 0.7 * clump(x, z, 7.7)))
    .map(([x, z]) => ({ x, y: terrainHeight(x, z) - 0.05, z, s: 0.8 + rnd() * 0.9,
      ry: rnd() * 6.28, hue: (rnd() - 0.5) * 0.06, light: (rnd() - 0.5) * 0.1 }));
  meshes.push(...tiled(group, 'fern', geo.fern, mat.fern, ferns,
    { far: UNDERGROWTH_FAR, tint: { h: 0, s: 0, l: 1 } }));

  const broads = jittered(rnd, -PLAY_HALF_W - 10, PLAY_HALF_W + 10, SAND_END - 2, 156, 4.6, (x, z, r) =>
    clearOfBuilt(x, z) && r < forestDensity(x, z) * (0.1 + 0.55 * clump(x, z, 2.9)))
    .map(([x, z]) => ({ x, y: terrainHeight(x, z) - 0.05, z, s: 0.9 + rnd() * 0.8,
      ry: rnd() * 6.28, hue: (rnd() - 0.5) * 0.05, light: (rnd() - 0.5) * 0.08 }));
  meshes.push(...tiled(group, 'broad', geo.broad, mat.broad, broads,
    { far: UNDERGROWTH_FAR, tint: { h: 0, s: 0, l: 1 } }));

  // Distance culling of the undergrowth tiles, by tile centre.
  const culled = meshes.filter(m => Number.isFinite(m.userData.far));
  let acc = 1;
  function update(camPos, dt) {
    acc += dt;
    if (acc < 0.25) return;
    acc = 0;
    for (const m of culled) {
      const c = m.boundingSphere.center;
      m.visible = Math.hypot(c.x - camPos.x, c.z - camPos.z) - m.boundingSphere.radius < m.userData.far;
    }
  }

  const counts = {
    palms: palmTrunks.length, giants: trunks.length + backTrunks.length,
    lobes: lobes.length + backLobes.length,
    vines: vines.length, ferns: ferns.length, broads: broads.length, meshes: meshes.length,
  };
  return { group, colliders, update, counts };
}
