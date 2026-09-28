// jungleTerrain.js — the ground of the tropical cove: one heightfield mesh
// painted from the layout's surface masks (the same masks soilAt reads, so
// the paint and the logic cannot disagree), a procedural detail texture the
// shader picks per surface, the promenade path laid on it as a ribbon, and
// faceted rocks dressing the cliff, the headlands and the beach.
//
// Heights come from jungleLayout.js and nowhere else. The ground probe in
// main-JUNGLE.js evaluates the same terrainHeight() directly rather than
// raying this mesh, so the mesh is for looking at: it lives on `scene`, not
// on `world`, and never enters the collision world.
import * as THREE from 'three';
import {
  terrainHeight, terrainMasks, shoreAt, pathDistance, PATH, PATH_LEN, PATH_HALF_W, SAND_END,
  cliffZ, CLIFF_FOOT, CLIFF_LIP, ridgeAt, streamDistance, STREAM_HALF_W, POOL,
  FALLS, FALLS_HALF_W, clearOfFalls, PLAY_HALF_W, smoothstep,
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

// A detail texture: four procedural channels in one 512² RGBA tile —
// R undergrowth speckle, G rock striation, B sand ripples, A broad macro
// blotches — all generated, nothing loaded, all tileable (the fbm blends
// four shifted samples by bilinear weights so the result wraps).
function makeDetailTexture(maxAniso) {
  const S = 512;
  const c = Object.assign(document.createElement('canvas'), { width: S, height: S });
  const g = c.getContext('2d');
  const img = g.createImageData(S, S);
  const hash = (x, y) => {
    const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
    return s - Math.floor(s);
  };
  const vnoise = (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    return hash(xi, yi) * (1 - u) * (1 - v) + hash(xi + 1, yi) * u * (1 - v)
      + hash(xi, yi + 1) * (1 - u) * v + hash(xi + 1, yi + 1) * u * v;
  };
  const oct = (x, y, n) => {
    let a = 0.5, s = 0;
    for (let o = 0; o < n; o++) { s += a * vnoise(x, y); x *= 2.03; y *= 2.11; a *= 0.5; }
    return s;
  };
  // fbm made periodic over the whole tile.
  const fbm4 = (x, y, n) => {
    const fx = x / S, fy = y / S;
    return (oct(x, y, n) * (1 - fx) * (1 - fy) + oct(x - S, y, n) * fx * (1 - fy)
      + oct(x, y - S, n) * (1 - fx) * fy + oct(x - S, y - S, n) * fx * fy);
  };
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const i = (y * S + x) * 4;
      const macro = fbm4(x, y, 3);
      // R: clustered dark speckle the litter layer breaks up with.
      const speck = hash(x * 3.7 + 0.5, y * 3.1 + 1.5);
      img.data[i] = 255 * (speck < 0.16 + macro * 0.3 ? 0.25 + speck * 2 : 0.85 + 0.15 * speck);
      // G and B: bands and ripples, warped by an edge-windowed field so the
      // tile still wraps.
      const win = Math.sin(Math.PI * x / S) * Math.sin(Math.PI * y / S);
      const warp = (fbm4(x, y, 3) - 0.5) * 2 * win;
      img.data[i + 1] = 255 * (0.5 + 0.5 * Math.sin((y / S) * Math.PI * 2 * 9 + warp * 5));
      img.data[i + 2] = 255 * (0.5 + 0.5 * Math.sin(((x + y) * 0.71 / S) * Math.PI * 2 * 6 + warp * 6));
      // A: broad blotches for macro variation.
      img.data[i + 3] = 255 * macro;
    }
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.NoColorSpace;
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

// The paint, from the layout's surface masks — the very masks soilAt reads,
// so what the ground looks like and what the game says it is cannot drift
// apart. `maskOut` (a 4-slot scratch) receives the weights the shader needs:
// forest floor, rock, path dirt, wet.
function terrainPaint(x, z, h, slope, out, maskOut) {
  const m = terrainMasks(x, z, { h, slope });
  let r = 0, g = 0, b = 0;
  const add = (col, k) => { r += col.r * k; g += col.g * k; b += col.b * k; };
  add(C.seabed, m.seabed);
  add(C.sand, m.sand);
  add(C.litter, m.litter);
  add(C.moss, m.moss);
  // Rock picks its tone by altitude: pale strata high, damp dark low.
  add(h > 20 ? C.rock : C.darkRock, m.rock);
  // Bare dirt on the path, under the ribbon, mostly replacing the floor.
  add(C.dirt, m.dirt * 0.85);
  out.setRGB(r, g, b);
  // Wet overlay: mud on the forest floor, darker wet sand on the beach.
  const floorW = m.litter + m.moss;
  if (m.wet > 0) {
    _c.copy(floorW > m.sand ? C.darkRock : C.wetSand);
    out.lerp(_c, m.wet * (floorW > m.sand ? 0.55 : 0.9));
  }
  // Shallow water reads sandy through its film.
  if (m.seabed > 0) out.lerp(C.wetSand, smoothstep(z - shoreAt(x), -4, 0) * 0.6);
  maskOut[0] = floorW; maskOut[1] = m.rock; maskOut[2] = m.dirt; maskOut[3] = m.wet;
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
  const detail = makeDetailTexture(maxAniso);
  const w = TERRAIN_X[1] - TERRAIN_X[0], d = TERRAIN_Z[1] - TERRAIN_Z[0];
  const geo = new THREE.PlaneGeometry(w, d, Math.round(w / CELL), Math.round(d / CELL));
  geo.rotateX(-Math.PI / 2);
  geo.translate((TERRAIN_X[0] + TERRAIN_X[1]) / 2, 0, (TERRAIN_Z[0] + TERRAIN_Z[1]) / 2);
  const pos = geo.getAttribute('position');
  const col = new Float32Array(pos.count * 3);
  const mask = new Float32Array(pos.count * 4);
  const out = new THREE.Color();
  const m4 = [0, 0, 0, 0];
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const h = terrainHeight(x, z);
    pos.setY(i, h);
    const slope = Math.hypot(terrainHeight(x + 1, z) - terrainHeight(x - 1, z),
      terrainHeight(x, z + 1) - terrainHeight(x, z - 1)) / 2;
    terrainPaint(x, z, h, slope, out, m4);
    col[i * 3] = out.r; col[i * 3 + 1] = out.g; col[i * 3 + 2] = out.b;
    mask[i * 4] = m4[0]; mask[i * 4 + 1] = m4[1]; mask[i * 4 + 2] = m4[2]; mask[i * 4 + 3] = m4[3];
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('aMask', new THREE.BufferAttribute(mask, 4));
  const uv = geo.getAttribute('uv');
  for (let i = 0; i < uv.count; i++) uv.setXY(i, pos.getX(i) / 3, pos.getZ(i) / 3);
  geo.computeVertexNormals();
  // Canopy dapple: the clock the shader below wanders pools of light by.
  // update(t) advances it — the only per-frame cost of the ground's light.
  const dappleTime = { value: 0 };
  const groundMat = new THREE.MeshStandardMaterial({
    vertexColors: true, map: grain, roughness: 0.96, metalness: 0,
  });
  // Micro detail, picked per surface by the vertex masks: speckle in the
  // litter, striation on the rock, ripples in the sand, broad blotches
  // everywhere; wet ground darkens and glosses. One extra texture fetch.
  groundMat.onBeforeCompile = sh => {
    sh.uniforms.uDetail = { value: detail };
    sh.uniforms.uDappleTime = dappleTime;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 aMask;\nvarying vec4 vMask;\nvarying vec2 vGroundUv;\nvarying vec3 vGroundPos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvMask = aMask;\nvGroundUv = uv;\nvGroundPos = (modelMatrix * vec4(position, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
uniform sampler2D uDetail;
uniform float uDappleTime;
varying vec4 vMask;
varying vec2 vGroundUv;
varying vec3 vGroundPos;`)
      .replace('#include <map_fragment>', `#include <map_fragment>
vec4 det = texture2D(uDetail, vGroundUv * 0.35);
// Broad blotches modulate value, not hue.
diffuseColor.rgb *= 0.84 + 0.32 * det.a;
// Speckle in the litter, striation on the rock, ripple in the sand.
diffuseColor.rgb *= mix(1.0, 0.72 + 0.56 * det.r, vMask.x);
// Rock strata are laid in a VERTICAL projection — along the face, up the
// height — so they read as horizontal beds on the cliff. Sampled with the
// top-down ground UV they stretched into long vertical streaks down every
// steep face, like corrugated sheet.
float strata = texture2D(uDetail, vec2((vGroundPos.x + vGroundPos.z) * 0.06, vGroundPos.y * 0.11)).g;
diffuseColor.rgb *= mix(1.0, 0.62 + 0.76 * strata, vMask.y);
diffuseColor.rgb *= mix(1.0, 0.88 + 0.24 * det.b, vMask.z);
// Wet ground darkens.
diffuseColor.rgb *= mix(1.0, 0.66, vMask.w);
// Canopy dapple: slow pools of light wandering over the forest floor —
// sunlight through the moving leaves, read through the paint's own forest
// mask (vMask.x) so it never touches the beach, the path or the bare rock.
float dapple = smoothstep(0.12, 0.9,
  sin(vGroundPos.x * 0.47 + uDappleTime * 0.31) * cos(vGroundPos.z * 0.43 - uDappleTime * 0.23) * 0.72
  + sin((vGroundPos.x + vGroundPos.z) * 0.23 - uDappleTime * 0.17) * 0.28 + 0.2);
diffuseColor.rgb *= 1.0 + dapple * vMask.x * 0.55;`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
roughnessFactor = clamp(roughnessFactor * (1.0 - 0.35 * vMask.w), 0.05, 1.0);`);
  };
  const terrain = new THREE.Mesh(geo, groundMat);
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
  // Every rock's footprint, for whatever wants to shelter by one (the
  // wildlife's crabs, later lizards and sea lions).
  const rockSpots = [];
  const put = (x, y, z, s, squash = 0.8) => {
    const gi = Math.floor(rnd() * 3), mi = Math.floor(rnd() * 3);
    const it = {
      x, y, z, sx: s * (0.8 + rnd() * 0.5), sy: s * squash * (0.7 + rnd() * 0.6),
      sz: s * (0.8 + rnd() * 0.5), ry: rnd() * Math.PI * 2, rx: (rnd() - 0.5) * 0.4,
    };
    // Bounding radius of the jittered shell (vertices reach 0.5 × 1.28).
    const r = Math.max(it.sx, it.sy, it.sz) * 0.64;
    // Nothing through or in front of the falling sheet. The draw from rnd()
    // is spent either way, so dropping a rock does not reshuffle the rest.
    if (!clearOfFalls(x, y, z, r)) return;
    buckets[gi][mi].push(it);
    rockSpots.push({ x, y, z, r });
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
  // Framing the falls: two big shoulders either side of the slot, stood
  // just outside the sheet's spread at its foot so they frame it rather
  // than swallow its edges.
  for (const s of [-1, 1]) {
    const x = FALLS.x + s * (FALLS_HALF_W + 4.6);
    for (let y = POOL.waterY - 1; y < FALLS.topY; y += 4.5)
      put(x + (rnd() - 0.5), y, cliffZ(x) + 0.5 + rnd(), 4.5 + rnd() * 2, 1.0);
  }
  // Behind the curtain: smaller boulders set into the face, seen through the
  // water. Without them clearing the sheet's path left a bare, striped wall.
  // Each one is centred on the face (bisected from the analytic ground) and
  // clearOfFalls drops any that would reach the sheet.
  const faceZ = (x, y) => {
    let lo = FALLS.z - 8, hi = FALLS.z + 1;
    for (let i = 0; i < 16; i++) {
      const m = (lo + hi) / 2;
      if (terrainHeight(x, m) > y) hi = m; else lo = m;
    }
    return (lo + hi) / 2;
  };
  // Sunk well into the wall so only their caps show — a rock surface, not a
  // grid of pebbles — and staggered row to row.
  let row = 0;
  for (let y = POOL.waterY + 0.6; y < FALLS.topY - 1; y += 2.4, row++) {
    for (let dx = -FALLS_HALF_W - 1.5 + (row % 2) * 1.4; dx <= FALLS_HALF_W + 1.5; dx += 2.8) {
      const x = FALLS.x + dx + (rnd() - 0.5) * 1.2;
      const size = 2.4 + rnd() * 1.4;
      put(x, y + (rnd() - 0.5) * 0.8, faceZ(x, y) + size * 0.55, size, 0.85);
    }
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

  return { terrain, path, grain, rockSpots, update(t) { dappleTime.value = t; } };
}
