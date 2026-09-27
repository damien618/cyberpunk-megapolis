// jungleTerrain.js — the ground of the tropical cove: one heightfield mesh
// painted with vertex colours, the promenade path laid on it as a ribbon, and
// faceted rocks dressing the cliff, the headlands and the beach.
//
// Heights come from jungleLayout.js and nowhere else. The ground probe in
// main-JUNGLE.js evaluates the same terrainHeight() directly rather than
// raying this mesh, so the mesh is for looking at: it lives on `scene`, not
// on `world`, and never enters the collision world.
import * as THREE from 'three';
import {
  terrainHeight, shoreAt, pathDistance, PATH, PATH_LEN, PATH_HALF_W, SAND_END,
  cliffZ, CLIFF_FOOT, CLIFF_LIP, ridgeAt, streamDistance, STREAM_HALF_W, POOL,
  FALLS, PLAY_HALF_W, smoothstep,
} from './jungleLayout.js';

const TERRAIN_X = [-240, 240];
const TERRAIN_Z = [-170, 350];
const CELL = 2.5;

const C = {
  sand: new THREE.Color(0xe9d7ae),
  wetSand: new THREE.Color(0x9d8a68),
  litter: new THREE.Color(0x5a4630),
  moss: new THREE.Color(0x3f5226),
  rock: new THREE.Color(0x5b5650),
  darkRock: new THREE.Color(0x3a3733),
  dirt: new THREE.Color(0x7a5c3c),
  seabed: new THREE.Color(0xcdbb8e),
};

// Grain for every surface: per-pixel noise plus a few soft blotches. Pure
// per-pixel randomness tiles by construction, and the blotches are drawn
// nine times so they wrap too.
function makeGrainTexture(maxAniso) {
  const S = 256;
  const c = Object.assign(document.createElement('canvas'), { width: S, height: S });
  const g = c.getContext('2d');
  const img = g.createImageData(S, S);
  let sd = 90210;
  const r = () => ((sd = (sd * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let i = 0; i < S * S; i++) {
    const v = 200 + r() * 55;
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  for (let i = 0; i < 40; i++) {
    const x = r() * S, y = r() * S, rad = 6 + r() * 26, k = 0.05 + r() * 0.1;
    for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) {
      const gr = g.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, rad);
      gr.addColorStop(0, `rgba(0,0,0,${k})`);
      gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr;
      g.fillRect(x + ox - rad, y + oy - rad, rad * 2, rad * 2);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = maxAniso;
  return t;
}

// Irregular, flat-shaded boulders — the beach's recipe: jitter hashed off the
// vertex POSITION (the geometry is non-indexed), squashed so they sit.
function makeRockGeo(salt) {
  const g = new THREE.IcosahedronGeometry(0.5, 1);
  const p = g.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const k = Math.sin(Math.round(v.x * 800) * 12.9898 + Math.round(v.y * 800) * 78.233
      + Math.round(v.z * 800) * 37.719 + salt) * 43758.5453;
    v.multiplyScalar(0.72 + (k - Math.floor(k)) * 0.56);
    v.y *= 0.8;
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}

function terrainColor(x, z, h, slope, out) {
  const shore = shoreAt(x);
  const d = z - shore;
  if (d < 0) {
    out.copy(C.seabed).lerp(C.wetSand, smoothstep(d, -4, 0) * 0.6);
  } else {
    out.copy(C.sand).lerp(C.wetSand, 1 - smoothstep(d, 1.5, 6));
  }
  // Sand gives way to leaf litter over the forest edge, mottled with moss.
  const forest = smoothstep(z, SAND_END - 6, SAND_END + 10);
  if (forest > 0) {
    const mottle = 0.5 + 0.5 * Math.sin(x * 0.21 + Math.cos(z * 0.17) * 2.3);
    _c.copy(C.litter).lerp(C.moss, mottle * 0.7);
    out.lerp(_c, forest);
  }
  // Wet margins: the stream banks and the pool's rim.
  const wet = Math.max(
    1 - smoothstep(streamDistance(x, z), STREAM_HALF_W, STREAM_HALF_W + 2.5),
    1 - smoothstep(Math.hypot(x - POOL.x, z - POOL.z), POOL.r, POOL.r + 3),
  ) * forest;
  if (wet > 0) out.lerp(C.darkRock, wet * 0.55);
  // Bare dirt on the path, under the ribbon, so its edges blend.
  const p = 1 - smoothstep(pathDistance(x, z), PATH_HALF_W - 0.2, PATH_HALF_W + 1.6);
  if (p > 0) out.lerp(C.dirt, p * 0.8 * forest);
  // Rock wherever the ground is steep: the cliff, the ridges' shoulders.
  const rock = smoothstep(slope, 0.55, 1.1);
  if (rock > 0) out.lerp(h > 20 ? C.rock : C.darkRock, rock);
  return out;
}
const _c = new THREE.Color();

// The path as its own strip, five vertices across so it conforms to the
// ground. Edge vertices take the forest floor's colour: a soft edge without
// the sorting problems of a transparent ribbon.
function buildPathRibbon(grain) {
  const ACROSS = 5;
  const n = PATH.length;
  const pos = new Float32Array(n * ACROSS * 3);
  const col = new Float32Array(n * ACROSS * 3);
  const uv = new Float32Array(n * ACROSS * 2);
  const tmp = new THREE.Color();
  for (let i = 0; i < n; i++) {
    const a = PATH[Math.max(0, i - 1)], b = PATH[Math.min(n - 1, i + 1)];
    const dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1;
    const nx = -dz / l, nz = dx / l;
    for (let k = 0; k < ACROSS; k++) {
      const s = (k / (ACROSS - 1)) * 2 - 1;          // -1 … 1 across
      const w = PATH_HALF_W + 0.35;
      const x = PATH[i][0] + nx * s * w, z = PATH[i][1] + nz * s * w;
      const j = i * ACROSS + k;
      pos[j * 3] = x; pos[j * 3 + 1] = terrainHeight(x, z) + 0.05; pos[j * 3 + 2] = z;
      const edge = Math.abs(s) > 0.99;
      tmp.copy(C.dirt).lerp(C.litter, edge ? 0.75 : 0.08 * Math.abs(s));
      col[j * 3] = tmp.r; col[j * 3 + 1] = tmp.g; col[j * 3 + 2] = tmp.b;
      uv[j * 2] = s * w / 2.5; uv[j * 2 + 1] = PATH_LEN[i] / 2.5;
    }
  }
  const idx = [];
  for (let i = 0; i < n - 1; i++) for (let k = 0; k < ACROSS - 1; k++) {
    const a = i * ACROSS + k, b = a + 1, c = a + ACROSS, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  const mesh = new THREE.Mesh(g, new THREE.MeshStandardMaterial({
    vertexColors: true, map: grain, roughness: 1,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  }));
  mesh.receiveShadow = true;
  return mesh;
}

export function buildJungleTerrain({ scene, addInstanced, rnd, maxAniso = 4 }) {
  const grain = makeGrainTexture(maxAniso);
  const w = TERRAIN_X[1] - TERRAIN_X[0], d = TERRAIN_Z[1] - TERRAIN_Z[0];
  const geo = new THREE.PlaneGeometry(w, d, Math.round(w / CELL), Math.round(d / CELL));
  geo.rotateX(-Math.PI / 2);
  geo.translate((TERRAIN_X[0] + TERRAIN_X[1]) / 2, 0, (TERRAIN_Z[0] + TERRAIN_Z[1]) / 2);
  const pos = geo.getAttribute('position');
  const col = new Float32Array(pos.count * 3);
  const out = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const h = terrainHeight(x, z);
    pos.setY(i, h);
    const slope = Math.hypot(terrainHeight(x + 1, z) - terrainHeight(x - 1, z),
      terrainHeight(x, z + 1) - terrainHeight(x, z - 1)) / 2;
    terrainColor(x, z, h, slope, out);
    col[i * 3] = out.r; col[i * 3 + 1] = out.g; col[i * 3 + 2] = out.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const uv = geo.getAttribute('uv');
  for (let i = 0; i < uv.count; i++) uv.setXY(i, pos.getX(i) / 3, pos.getZ(i) / 3);
  geo.computeVertexNormals();
  const terrain = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
    vertexColors: true, map: grain, roughness: 0.96, metalness: 0,
  }));
  terrain.receiveShadow = true;
  terrain.name = 'jungle_terrain';
  scene.add(terrain);

  const path = buildPathRibbon(grain);
  path.name = 'jungle_path';
  scene.add(path);

  // Rocks. Cliff and headlands first, then a few boulders on the beach and
  // along the path. All `prop` (walked around, never stood on).
  const rockGeos = [makeRockGeo(0), makeRockGeo(31.7), makeRockGeo(88.1)];
  const rockMats = [0x57524b, 0x4a4641, 0x625c52].map(c =>
    new THREE.MeshStandardMaterial({ color: c, roughness: 0.92, flatShading: true }));
  const buckets = rockGeos.map(() => rockMats.map(() => []));
  const put = (x, y, z, s, squash = 0.8) => {
    const gi = Math.floor(rnd() * 3), mi = Math.floor(rnd() * 3);
    buckets[gi][mi].push({
      x, y, z, sx: s * (0.8 + rnd() * 0.5), sy: s * squash * (0.7 + rnd() * 0.6),
      sz: s * (0.8 + rnd() * 0.5), ry: rnd() * Math.PI * 2, rx: (rnd() - 0.5) * 0.4,
    });
  };
  // The cliff face: stacked boulders from the foot to the lip, leaving the
  // falls' own slot clear.
  for (let x = -130; x <= 130; x += 3.2) {
    if (Math.abs(x - FALLS.x) < FALLS.width * 0.5 + 2) continue;
    const cz = cliffZ(x);
    for (let k = 0; k < 3; k++) {
      const z = cz - CLIFF_FOOT + rnd() * (CLIFF_FOOT + CLIFF_LIP);
      put(x + (rnd() - 0.5) * 2, terrainHeight(x, z) - 1.5, z, 4 + rnd() * 5, 1.1);
    }
  }
  // Framing the falls: two big shoulders either side of the slot.
  for (const s of [-1, 1]) {
    const x = FALLS.x + s * (FALLS.width * 0.5 + 2.2);
    for (let y = POOL.waterY - 1; y < FALLS.topY; y += 4.5)
      put(x + (rnd() - 0.5), y, cliffZ(x) + 0.5 + rnd(), 4.5 + rnd() * 2, 1.0);
  }
  // Headlands and ridge shoulders.
  for (let i = 0; i < 160; i++) {
    const side = rnd() < 0.5 ? -1 : 1;
    const x = side * (PLAY_HALF_W - 6 + rnd() * 40);
    const z = -50 + rnd() * 200;
    if (ridgeAt(x) < 0.15) continue;
    put(x, terrainHeight(x, z) - 0.6, z, 2 + rnd() * 4);
  }
  // Beach boulders, in a few clusters near the horns of the cove.
  for (const [cx, cz] of [[-62, -12], [58, -8], [70, -26], [-70, -30]]) {
    for (let i = 0; i < 7; i++) {
      const x = cx + (rnd() - 0.5) * 12, z = cz + (rnd() - 0.5) * 10;
      put(x, terrainHeight(x, z) - 0.25, z, 0.8 + rnd() * 2.2);
    }
  }
  // A few mossy boulders beside the path, the way a trail finds them.
  for (let i = 8; i < PATH.length - 4; i += 11) {
    const [px, pz] = PATH[i];
    const s = rnd() < 0.5 ? -1 : 1;
    const x = px + s * (PATH_HALF_W + 1.8 + rnd() * 2), z = pz + (rnd() - 0.5) * 3;
    put(x, terrainHeight(x, z) - 0.3, z, 1 + rnd() * 1.4);
  }
  buckets.forEach((row, gi) => row.forEach((items, mi) =>
    addInstanced(rockGeos[gi], rockMats[mi], items, { prop: true })));

  return { terrain, path, grain };
}
