import * as THREE from 'three';
import { Player } from './player.js?v=3';
import { Input } from './input.js';
import { Controller } from './controller.js?v=3';
import { CameraRig } from './cameraRig.js?v=3';
import { buildCityBoxes } from './cityBoxes.js?v=3';
import { buildCar, carBounds, rollCars } from './cars.js?v=1';

// ---------------------------------------------------------------------------
// Villa LA — single-storey modern California estate, laid out like the hillside
// rentals it is modelled on (Bel-Air / Hollywood Hills listings):
//
//   street → gate → driveway → motor court → garage
//   entry court (reflecting pool) → foyer
//   great room (living + dining) fully glazed onto the pool terrace
//   open kitchen + island + pantry/laundry on the east side
//   private west wing: master suite (bath + dressing) and guest bedroom
//   terrace: infinity pool, spa, loungers, pergola dining, fire pit, BBQ
//
// Everything static is instanced (see flushKits) because cityBoxes.js derives
// the collision world from the InstancedMeshes parented to `world`.
// ---------------------------------------------------------------------------

const app = document.getElementById('app');
const overlay = document.getElementById('overlay');
const startBtn = document.getElementById('startBtn');
const hudMode = document.getElementById('mode');
const hudSpeed = document.getElementById('speed');
const hudHeight = document.getElementById('height');

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.7));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.96;
renderer.outputColorSpace = THREE.SRGBColorSpace;
app.appendChild(renderer.domElement);

const SKY = 0xa8cbe8;
const scene = new THREE.Scene();
scene.background = new THREE.Color(SKY);
scene.fog = new THREE.Fog(0xc3d8ea, 160, 780);

const camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.25, 2000);
camera.position.set(0, 8, 28);

const hemi = new THREE.HemisphereLight(0xdcecff, 0x8b8272, 0.85);
scene.add(hemi);

// Late-afternoon sun coming over the west ridge.
const sun = new THREE.DirectionalLight(0xfff0d8, 2.4);
sun.position.set(-95, 120, 70);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -80;
sun.shadow.camera.right = 80;
sun.shadow.camera.top = 80;
sun.shadow.camera.bottom = -80;
sun.shadow.camera.near = 20;
sun.shadow.camera.far = 320;
sun.shadow.bias = -0.0006;
sun.shadow.normalBias = 0.045;
scene.add(sun);
sun.target.position.set(0, 0, -6);
scene.add(sun.target);

const loader = new THREE.TextureLoader();
const maxAniso = renderer.capabilities.getMaxAnisotropy();
const pmrem = new THREE.PMREMGenerator(renderer);
pmrem.compileEquirectangularShader();

loader.load('./data/env_equirect.png', tex => {
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  const env = pmrem.fromEquirectangular(tex).texture;
  scene.environment = env;
  scene.environmentIntensity = 0.45;
  tex.dispose();
});

function tex(url, repeatX = 1, repeatY = 1) {
  const t = loader.load(url);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeatX, repeatY);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = maxAniso;
  return t;
}
function ntex(url, repeatX = 1, repeatY = 1) {
  const t = loader.load(url);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeatX, repeatY);
  t.anisotropy = maxAniso;
  return t;
}
function withUV2(geometry) {
  if (!geometry.getAttribute('uv2') && geometry.getAttribute('uv')) {
    const uv = geometry.getAttribute('uv');
    geometry.setAttribute('uv2', new THREE.BufferAttribute(new Float32Array(uv.array), 2));
  }
  return geometry;
}

// Female character materials from the existing game pack, with a brighter
// California-style palette for clothing/accessories.
const CHAR_MATS = await fetch('./chars/data/materials.json').then(r => r.json());
const charTexCache = {};
const charMSCache = {};
function charTexFile(file) {
  return file.replace(/\.(tga|psd|tif|png)$/i, '.webp');
}
function charTexture(file, srgb = true) {
  const key = charTexFile(file) + (srgb ? '' : '#lin');
  if (!charTexCache[key]) {
    const t = new THREE.TextureLoader().load('./chars/textures/' + encodeURIComponent(charTexFile(file)));
    t.flipY = false;
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.LinearSRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = maxAniso;
    charTexCache[key] = t;
  }
  return charTexCache[key];
}
function charPackMetalRough(file, onReady) {
  const key = charTexFile(file);
  if (charMSCache[key]) return onReady(charMSCache[key]);
  const img = new Image();
  img.onload = () => {
    const c = Object.assign(document.createElement('canvas'), { width: img.width, height: img.height });
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(0, 0, c.width, c.height);
    const px = d.data;
    for (let i = 0; i < px.length; i += 4) {
      const metal = px[i];
      const smooth = px[i + 3];
      px[i + 1] = 255 - smooth;
      px[i + 2] = metal;
      px[i] = 0;
      px[i + 3] = 255;
    }
    ctx.putImageData(d, 0, 0);
    const t = new THREE.CanvasTexture(c);
    t.flipY = false;
    t.colorSpace = THREE.LinearSRGBColorSpace;
    charMSCache[key] = t;
    onReady(t);
  };
  img.src = './chars/textures/' + encodeURIComponent(key);
}
function tintCaliforniaStyle(mat, name) {
  const n = name.toLowerCase();
  // Force a bright outfit: plain white t-shirt + plain yellow pants.
  // We drop camouflage-like albedo maps on these parts to avoid dark/military look.
  if (n.includes('tshirt')) {
    mat.map = null;
    mat.color.set('#fdfdf7');
    mat.roughness = 0.82;
    mat.metalness = 0.02;
  } else if (n.includes('pants')) {
    mat.map = null;
    mat.color.set('#ffd43b');
    mat.roughness = 0.76;
    mat.metalness = 0.03;
  } else if (n.includes('hat')) {
    mat.map = null;
    mat.color.set('#fff4b0');
    mat.roughness = 0.8;
    mat.metalness = 0.02;
  } else if (n.includes('shoes')) {
    mat.map = null;
    mat.color.set('#fffef8');
    mat.roughness = 0.74;
    mat.metalness = 0.04;
  } else if (n.includes('backpack')) {
    mat.map = null;
    mat.color.set('#ffe27a');
    mat.roughness = 0.78;
    mat.metalness = 0.03;
  }
  mat.needsUpdate = true;
}
function girlMatFor(name) {
  const rec = CHAR_MATS[name];
  if (!rec) return new THREE.MeshStandardMaterial({ color: 0xff00ff });
  const m = new THREE.MeshStandardMaterial();
  m.color.setRGB(rec.color[0], rec.color[1], rec.color[2]);
  if (rec.tex) m.map = charTexture(rec.tex, true);
  if (rec.normalTex) {
    m.normalMap = charTexture(rec.normalTex, false);
    m.normalScale.setScalar(rec.bumpScale ?? 1);
  }
  if (rec.aoTex) m.aoMap = charTexture(rec.aoTex, false);
  if (rec.metalTex) {
    m.metalness = 1;
    m.roughness = 1;
    charPackMetalRough(rec.metalTex, t => {
      m.metalnessMap = t;
      m.roughnessMap = t;
      m.needsUpdate = true;
    });
  } else {
    m.metalness = Math.min(rec.metallic ?? 0, 0.35);
    m.roughness = THREE.MathUtils.clamp(1 - (rec.smoothness ?? 0.25), 0.28, 1);
  }
  if (rec.mode === 1) {
    m.alphaTest = rec.cutoff ?? 0.5;
    m.alphaToCoverage = true;
  } else if (rec.mode >= 2) {
    m.transparent = true;
    m.opacity = Math.max(rec.color[3] ?? 1, rec.mode >= 3 ? 0.04 : 0.32);
    m.depthWrite = rec.mode < 3;
  }
  tintCaliforniaStyle(m, name);
  return m;
}

// ---------------------------------------------------------------------------
// Material palette — warm stucco, travertine, oak, bronze, clear glass.
// Big architectural surfaces get maps; small props stay flat-coloured so the
// texture scale never looks wrong on a 40 cm object.
// ---------------------------------------------------------------------------
const stuccoN = ntex('./textures/CP_Concrete_03_N.webp', 5, 2);
const travN = ntex('./textures/CP_Floor_Tiles_N.webp', 6, 6);
const deckN = ntex('./textures/CP_Sidewalk_N.webp', 8, 8);
const tileN = ntex('./textures/CP_Ceramic_Tile_N.webp', 6, 4);
const woodN = ntex('./textures/CP_Trim_Sheet_N.webp', 3, 1);
const concN = ntex('./textures/CP_Concrete_01_N.webp', 4, 4);
const asphaltA = tex('./textures/CP_Asphalt_A.webp', 40, 3);
const asphaltN = ntex('./textures/CP_Asphalt_N.webp', 40, 3);
const lawnA = tex('./textures/la/grass_diffuse.jpg', 60, 60);
const waterN = ntex('./textures/la/water_normal.jpg', 6, 3);

// The cyberpunk texture pack is dark and full of coloured trim strips, so the
// villa keeps the normal maps for relief and drives colour itself — that is
// what makes white stucco and travertine read as such under the LA sun.
const M = {
  stucco: new THREE.MeshStandardMaterial({
    normalMap: stuccoN, normalScale: new THREE.Vector2(0.35, 0.35),
    color: 0xf7f2e9, roughness: 0.92, metalness: 0.01
  }),
  stuccoWarm: new THREE.MeshStandardMaterial({
    normalMap: stuccoN, normalScale: new THREE.Vector2(0.35, 0.35),
    color: 0xe4d7c2, roughness: 0.93, metalness: 0.01
  }),
  plaster: new THREE.MeshStandardMaterial({ color: 0xf8f5ee, roughness: 0.95, metalness: 0.01 }),
  plasterWarm: new THREE.MeshStandardMaterial({ color: 0xe9dfd0, roughness: 0.94, metalness: 0.01 }),
  ceiling: new THREE.MeshStandardMaterial({ color: 0xfcfaf5, roughness: 0.97, metalness: 0.0 }),
  travertine: new THREE.MeshStandardMaterial({
    normalMap: travN, normalScale: new THREE.Vector2(0.25, 0.25),
    color: 0xdccfb8, roughness: 0.62, metalness: 0.02
  }),
  // Indoors the same stone is honed: almost no relief, warmer and less glary.
  floorInt: new THREE.MeshStandardMaterial({
    normalMap: travN, normalScale: new THREE.Vector2(0.05, 0.05),
    color: 0xd7c9b2, roughness: 0.5, metalness: 0.02
  }),
  deck: new THREE.MeshStandardMaterial({
    normalMap: deckN, normalScale: new THREE.Vector2(0.3, 0.3),
    color: 0xe0d5c2, roughness: 0.75, metalness: 0.02
  }),
  paver: new THREE.MeshStandardMaterial({
    normalMap: deckN, normalScale: new THREE.Vector2(0.35, 0.35),
    color: 0xc9c0b1, roughness: 0.85, metalness: 0.02
  }),
  concrete: new THREE.MeshStandardMaterial({
    normalMap: concN, normalScale: new THREE.Vector2(0.3, 0.3),
    color: 0xcac4b9, roughness: 0.92, metalness: 0.02
  }),
  poolTile: new THREE.MeshStandardMaterial({
    normalMap: tileN, normalScale: new THREE.Vector2(0.3, 0.3),
    color: 0x86ccdf, roughness: 0.22, metalness: 0.06
  }),
  oak: new THREE.MeshStandardMaterial({
    normalMap: woodN, normalScale: new THREE.Vector2(0.3, 0.3),
    color: 0xbb9a70, roughness: 0.7, metalness: 0.03
  }),
  teak: new THREE.MeshStandardMaterial({ color: 0xa9784a, roughness: 0.72, metalness: 0.03 }),
  walnut: new THREE.MeshStandardMaterial({ color: 0x6b4a31, roughness: 0.55, metalness: 0.04 }),
  marble: new THREE.MeshStandardMaterial({ color: 0xf4f2ee, roughness: 0.16, metalness: 0.02 }),
  marbleDark: new THREE.MeshStandardMaterial({ color: 0x3b3f45, roughness: 0.2, metalness: 0.05 }),
  cabinet: new THREE.MeshStandardMaterial({ color: 0xeceae4, roughness: 0.42, metalness: 0.03 }),
  steel: new THREE.MeshStandardMaterial({ color: 0xd3d8dd, roughness: 0.28, metalness: 0.78 }),
  bronze: new THREE.MeshStandardMaterial({ color: 0x2e2c29, roughness: 0.36, metalness: 0.75 }),
  black: new THREE.MeshStandardMaterial({ color: 0x15171b, roughness: 0.42, metalness: 0.25 }),
  linen: new THREE.MeshStandardMaterial({ color: 0xf7f4ec, roughness: 0.93, metalness: 0.01 }),
  fabric: new THREE.MeshStandardMaterial({ color: 0xe3dbcc, roughness: 0.92, metalness: 0.01 }),
  fabricWarm: new THREE.MeshStandardMaterial({ color: 0xc07d55, roughness: 0.93, metalness: 0.01 }),
  fabricOlive: new THREE.MeshStandardMaterial({ color: 0x87907a, roughness: 0.93, metalness: 0.01 }),
  rug: new THREE.MeshStandardMaterial({ color: 0xb9a689, roughness: 0.98, metalness: 0.0 }),
  rugDark: new THREE.MeshStandardMaterial({ color: 0x6f6558, roughness: 0.98, metalness: 0.0 }),
  // Plain alpha glass rather than transmission: the villa has a lot of glazing
  // and a refraction pass on every pane is not worth the frame time here.
  glass: new THREE.MeshPhysicalMaterial({
    color: 0xa9cfe4, roughness: 0.04, metalness: 0.0,
    transparent: true, opacity: 0.15, depthWrite: false,
    clearcoat: 1, clearcoatRoughness: 0.04, side: THREE.DoubleSide
  }),
  tubWater: new THREE.MeshPhysicalMaterial({
    color: 0x9ed3e4, roughness: 0.05, metalness: 0.0,
    transparent: true, opacity: 0.55, clearcoat: 1, clearcoatRoughness: 0.05
  }),
  // Fake mirror: no reflection pass here, so this is a pale pearlescent panel.
  // A smooth pure metal would sample the environment only and read as black
  // indoors, which is exactly what the old 0.95-metalness version did.
  mirror: new THREE.MeshStandardMaterial({
    color: 0xb9c8d6, roughness: 0.09, metalness: 0.35, envMapIntensity: 2.4
  }),
  lawn: new THREE.MeshStandardMaterial({ map: lawnA, color: 0x9fb076, roughness: 0.98, metalness: 0.0 }),
  hedge: new THREE.MeshStandardMaterial({ color: 0x4a6b3c, roughness: 0.97, metalness: 0.0 }),
  foliage: new THREE.MeshStandardMaterial({ color: 0x5b8a4a, roughness: 0.95, metalness: 0.0 }),
  foliageOlive: new THREE.MeshStandardMaterial({ color: 0x86976f, roughness: 0.95, metalness: 0.0 }),
  foliageDark: new THREE.MeshStandardMaterial({ color: 0x3f5f3a, roughness: 0.96, metalness: 0.0 }),
  bark: new THREE.MeshStandardMaterial({ color: 0x8a7458, roughness: 0.94, metalness: 0.02 }),
  barkDark: new THREE.MeshStandardMaterial({ color: 0x5f4c3a, roughness: 0.94, metalness: 0.02 }),
  terracotta: new THREE.MeshStandardMaterial({ color: 0xb4643f, roughness: 0.85, metalness: 0.02 }),
  gravel: new THREE.MeshStandardMaterial({
    normalMap: concN, color: 0xd8caae, roughness: 0.99, metalness: 0.0
  }),
  asphalt: new THREE.MeshStandardMaterial({
    map: asphaltA, normalMap: asphaltN, color: 0x8b8d90, roughness: 0.96, metalness: 0.01
  }),
  roadLine: new THREE.MeshStandardMaterial({ color: 0xe8dfae, roughness: 0.7, metalness: 0.01 }),
  neighbor: new THREE.MeshStandardMaterial({
    normalMap: stuccoN, color: 0xe6ddcd, roughness: 0.92, metalness: 0.02
  }),
  tower: new THREE.MeshStandardMaterial({ color: 0xa9bccb, roughness: 0.55, metalness: 0.2 }),
  ember: new THREE.MeshStandardMaterial({
    color: 0xff8b3d, emissive: 0xff6a1a, emissiveIntensity: 2.4, roughness: 0.7
  }),
  lampShade: new THREE.MeshStandardMaterial({
    color: 0xfff6e2, emissive: 0xffe6b8, emissiveIntensity: 0.85, roughness: 0.85
  }),
  // Invisible proxy: cars are lofted meshes, but cityBoxes only derives AABBs
  // from InstancedMeshes, so each parked car also emits one box through the kit.
  // An invisible material is skipped by the shadow pass too, so it casts none.
  collider: new THREE.MeshBasicMaterial({ visible: false }),
};

const world = new THREE.Group();
scene.add(world);

// ---------------------------------------------------------------------------
// Instancing kit
// ---------------------------------------------------------------------------
function addInstancedPrimitive(geometry, material, items) {
  if (!items.length) return null;
  const im = new THREE.InstancedMesh(geometry, material, items.length);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const s = new THREE.Vector3();
  const p = new THREE.Vector3();
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    p.set(it.x, it.y, it.z);
    e.set(it.rx || 0, it.ry || 0, it.rz || 0, 'YXZ');
    q.setFromEuler(e);
    s.set(it.sx ?? 1, it.sy ?? 1, it.sz ?? 1);
    m.compose(p, q, s);
    im.setMatrixAt(i, m);
  }
  im.castShadow = true;
  im.receiveShadow = true;
  im.instanceMatrix.needsUpdate = true;
  world.add(im);
  return im;
}

const G = {
  box: withUV2(new THREE.BoxGeometry(1, 1, 1)),
  cyl: withUV2(new THREE.CylinderGeometry(0.5, 0.5, 1, 16)),
  cylBase: withUV2(new THREE.CylinderGeometry(0.5, 0.5, 1, 16).translate(0, 0.5, 0)),
  trunk: withUV2(new THREE.CylinderGeometry(0.34, 0.5, 1, 9).translate(0, 0.5, 0)),
  sphere: withUV2(new THREE.SphereGeometry(0.5, 14, 10)),
  blob: withUV2(new THREE.IcosahedronGeometry(0.5, 1)),
  cone: withUV2(new THREE.ConeGeometry(0.5, 1, 12).translate(0, 0.5, 0)),
  frond: withUV2(new THREE.ConeGeometry(0.22, 1, 4).translate(0, 0.5, 0)),
};

const kits = new Map();
function kit(geo, mat) {
  const key = `${geo.uuid}|${mat.uuid}`;
  let k = kits.get(key);
  if (!k) kits.set(key, (k = { geo, mat, items: [] }));
  return k.items;
}
function flushKits() {
  for (const k of kits.values()) addInstancedPrimitive(k.geo, k.mat, k.items);
  kits.clear();
}

// Local placement frame so furniture can be authored around its own origin and
// then dropped anywhere with a yaw. Frames compose, so a chair can be placed
// relative to the table it belongs to. LIFT drops a group onto the terrain.
let FX = 0, FZ = 0, FR = 0, LIFT = 0;
function frame(x, z, ry, fn) {
  const px = FX, pz = FZ, pr = FR;
  const c = Math.cos(pr), s = Math.sin(pr);
  FX = px + x * c + z * s;
  FZ = pz - x * s + z * c;
  FR = pr + ry;
  fn();
  FX = px; FZ = pz; FR = pr;
}
function box(mat, x, y, z, sx, sy, sz, ry = 0) {
  const c = Math.cos(FR), s = Math.sin(FR);
  kit(G.box, mat).push({
    x: FX + x * c + z * s, y: y + LIFT, z: FZ - x * s + z * c,
    sx, sy, sz, ry: FR + ry
  });
}
function shape(geo, mat, x, y, z, sx, sy, sz, rot = {}) {
  const c = Math.cos(FR), s = Math.sin(FR);
  kit(geo, mat).push({
    x: FX + x * c + z * s, y: y + LIFT, z: FZ - x * s + z * c,
    sx, sy, sz, ry: FR + (rot.ry || 0), rx: rot.rx || 0, rz: rot.rz || 0
  });
}
// Axis-aligned volume from world bounds — the workhorse for architecture.
function slab(mat, x0, x1, z0, z1, y0, y1) {
  box(mat, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2,
    Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0));
}

// ---------------------------------------------------------------------------
// Plan constants (metres). Ground = 0, the whole house sits on a 45 cm pad so
// the interior floor and the pool terrace are flush — indoor/outdoor living.
// ---------------------------------------------------------------------------
const FLOOR = 0.45;
const WALL_H = 3.35;
const CEIL = FLOOR + WALL_H;        // 3.80 — standard ceiling
const GR_CEIL = 5.05;               // great room raised ceiling
const DOOR_TOP = 2.3;
const EXT_T = 0.34;
const INT_T = 0.2;

const VX0 = -16, VX1 = 16, VZ0 = -12, VZ1 = 12;         // villa outer footprint
const WX0 = VX0 + EXT_T / 2, WX1 = VX1 - EXT_T / 2;     // exterior wall centrelines
const WZ0 = VZ0 + EXT_T / 2, WZ1 = VZ1 - EXT_T / 2;

const PX_W = -9.6;    // great room  ↔ private west wing
const PX_F = -3.4;    // foyer       ↔ hallway
const PX_E = 3.4;     // foyer       ↔ powder room
const PX_K = 6.6;     // great room  ↔ kitchen
const PZ_S = 6.5;     // living band ↔ service/entry band
const PZ_MB = -2.1;   // master bedroom ↔ bath + dressing
const PZ_B2 = 2.4;    // bath/dressing  ↔ guest bedroom
const PX_BATH = -12.1;

// Terrace / pool
const TX0 = -19, TX1 = 19, TZ0 = -25.6;
const PLX0 = -8, PLX1 = 6, PLZ0 = -24, PLZ1 = -18;
const POOL_BOTTOM = -0.85;   // ~1.25 m of water: you wade, you don't drown
const WATER_Y = 0.40;
const SPA_X0 = 6.9, SPA_X1 = 10.3, SPA_Z0 = -21.4, SPA_Z1 = -18.0;
const SPA_RIM = 0.98;

// ---------------------------------------------------------------------------
// Terrain — flat building platform, canyon dropping away on the view side.
// ---------------------------------------------------------------------------
function terrainHeight(x, z) {
  const drop = THREE.MathUtils.smoothstep(-z, 26, 96);          // canyon on -Z
  const side = THREE.MathUtils.smoothstep(Math.abs(x), 48, 140); // ridges left/right
  let h = -drop * 38 - side * 9;
  const rough = drop + side;
  if (rough > 0.001) {
    h += (Math.sin(x * 0.021) * 2.4 + Math.cos(z * 0.017) * 2.0 + Math.sin((x + z) * 0.011) * 1.6) * rough;
  }
  return h;
}

const terrain = new THREE.Mesh(
  withUV2(new THREE.PlaneGeometry(900, 900, 200, 200)),
  M.lawn
);
{
  const pos = terrain.geometry.getAttribute('position');
  for (let i = 0; i < pos.count; i++) {
    // plane is built in XY then rotated, so its local Y is world -Z
    pos.setZ(i, terrainHeight(pos.getX(i), -pos.getY(i)));
  }
  terrain.geometry.computeVertexNormals();
  terrain.rotation.x = -Math.PI / 2;
  terrain.receiveShadow = true;
  world.add(terrain);
}

// ---------------------------------------------------------------------------
// Walls with real openings (doors, windows, sliders).
// ---------------------------------------------------------------------------
function buildWall(mat, axis, fixed, a0, a1, o = {}) {
  const t = o.t ?? EXT_T;
  const base = o.base ?? FLOOR;
  const h = o.h ?? WALL_H;
  const top = base + h;
  const seg = (p, q, y0, y1) => {
    if (q - p < 0.001 || y1 - y0 < 0.001) return;
    if (axis === 'x') slab(mat, p, q, fixed - t / 2, fixed + t / 2, y0, y1);
    else slab(mat, fixed - t / 2, fixed + t / 2, p, q, y0, y1);
  };
  const pane = (p, q, y0, y1) => {
    if (axis === 'x') slab(M.glass, p, q, fixed - 0.03, fixed + 0.03, y0, y1);
    else slab(M.glass, fixed - 0.03, fixed + 0.03, p, q, y0, y1);
  };
  const ops = (o.openings ?? []).slice().sort((p, q) => p.a - q.a);
  let cursor = a0;
  for (const op of ops) {
    const s = op.a - op.w / 2, e = op.a + op.w / 2;
    seg(cursor, s, base, top);
    const sill = base + (op.sill ?? 0);
    const head = base + (op.top ?? DOOR_TOP);
    seg(s, e, base, sill);
    seg(s, e, head, top);
    if (op.glass !== false && (op.sill ?? 0) > 0) pane(s + 0.04, e - 0.04, sill + 0.03, head - 0.03);
    cursor = e;
  }
  seg(cursor, a1, base, top);
}
const wallX = (mat, z, x0, x1, o) => buildWall(mat, 'x', z, x0, x1, o);
const wallZ = (mat, x, z0, z1, o) => buildWall(mat, 'z', x, z0, z1, o);

// Floor-to-ceiling glazing with bronze mullions; `gaps` stay physically open
// so the player can walk through (sliders parked open).
function curtainWall(axis, fixed, a0, a1, y0, y1, gaps = []) {
  const span = a1 - a0;
  const n = Math.max(1, Math.round(span / 2.9));
  const step = span / n;
  const inGap = v => gaps.some(g => v > g[0] && v < g[1]);
  const put = (mat, p, q, ya, yb, thick) => {
    if (axis === 'x') slab(mat, p, q, fixed - thick / 2, fixed + thick / 2, ya, yb);
    else slab(mat, fixed - thick / 2, fixed + thick / 2, p, q, ya, yb);
  };
  for (let i = 0; i < n; i++) {
    const p = a0 + i * step, q = p + step;
    if (inGap((p + q) / 2)) continue;
    put(M.glass, p + 0.05, q - 0.05, y0 + 0.06, y1 - 0.12, 0.05);
  }
  for (let i = 0; i <= n; i++) {
    const c = a0 + i * step;
    if (i > 0 && i < n && inGap(c)) continue;
    put(M.bronze, c - 0.06, c + 0.06, y0, y1, 0.16);
  }
  put(M.bronze, a0, a1, y1 - 0.12, y1, 0.18);       // head track
  put(M.bronze, a0, a1, y0, y0 + 0.06, 0.18);       // floor track
}

// ---------------------------------------------------------------------------
// Site: pads, terrace, entry court, motor court, driveway
// ---------------------------------------------------------------------------
// House pad + interior sub-floor
slab(M.concrete, VX0 - 0.6, VX1 + 0.6, VZ0 - 0.6, VZ1 + 0.6, -1.1, FLOOR - 0.06);

// Room floor finishes (top 6 cm)
const FIN = FLOOR - 0.06;
slab(M.floorInt, PX_W, VX1, VZ0, VZ1, FIN, FLOOR);            // great room, kitchen, foyer band
slab(M.oak, VX0, PX_W, VZ0, PZ_MB, FIN, FLOOR);               // master bedroom
slab(M.oak, VX0, PX_W, PZ_B2, VZ1, FIN, FLOOR);               // guest bedroom
slab(M.marble, VX0, PX_BATH, PZ_MB, PZ_B2, FIN, FLOOR);       // master bath
slab(M.oak, PX_BATH, PX_W, PZ_MB, PZ_B2, FIN, FLOOR);         // dressing

// Terrace deck: strips around the pool so the basin stays hollow
slab(M.deck, TX0, TX1, PLZ1, VZ0, -1.0, FLOOR);               // house side
slab(M.deck, TX0, PLX0, TZ0, PLZ1, -1.0, FLOOR);              // west of pool
slab(M.deck, PLX1, TX1, TZ0, PLZ1, -1.0, FLOOR);              // east of pool
slab(M.deck, PLX0, PLX1, TZ0, PLZ0 - 0.9, -1.0, FLOOR);       // infinity-edge walkway

// Entry court (left hollow where the reflecting pool sits) + steps down to
// the motor court
slab(M.travertine, -8, 4.2, VZ1, 20, -0.6, FLOOR);
slab(M.travertine, 7.6, 8, VZ1, 20, -0.6, FLOOR);
slab(M.travertine, 4.2, 7.6, VZ1, 13.2, -0.6, FLOOR);
slab(M.travertine, 4.2, 7.6, 19.2, 20, -0.6, FLOOR);
slab(M.travertine, -8, 8, 20, 20.7, -0.6, FLOOR - 0.15);
slab(M.travertine, -8, 8, 20.7, 21.4, -0.6, FLOOR - 0.3);
slab(M.paver, -14, 30, 21.4, 33, -0.5, 0.15);
slab(M.paver, 8, 30, 16, 21.4, -0.5, 0.15);
slab(M.paver, 11, 19, 33, 63.5, -0.5, 0.12);                  // driveway

// Gravel beds framing the entry walk
slab(M.gravel, -13.5, -8.2, VZ1, 20.5, -0.2, 0.2);
slab(M.gravel, 8.2, 13.5, VZ1, 16, -0.2, 0.2);

// ---------------------------------------------------------------------------
// Villa shell
// ---------------------------------------------------------------------------
// Front (street side) — pivot entry door left open, punched windows elsewhere
wallX(M.stucco, WZ1, WX0, WX1, {
  openings: [
    { a: 0, w: 1.9, top: 2.75, glass: false },
    { a: -12.6, w: 4.2, sill: 0.95, top: 2.7 },
    { a: -6.4, w: 1.6, sill: 1.5, top: 2.6 },
    { a: 5.0, w: 1.1, sill: 1.5, top: 2.5 },
    { a: 13.0, w: 2.2, sill: 1.2, top: 2.6 },
  ]
});
// Rear — kitchen wall with a picture window, everything else is glazed
wallX(M.stucco, WZ0, PX_K, WX1, {
  openings: [{ a: 13.2, w: 3.6, sill: 1.35, top: 2.75 }]
});
curtainWall('x', WZ0, WX0, PX_W, FLOOR, CEIL);                       // master suite
curtainWall('x', WZ0, PX_W, PX_K, FLOOR, GR_CEIL, [[-3.7, -0.5]]);   // great room + open slider
// West flank
wallZ(M.stucco, WX0, WZ0, WZ1, {
  openings: [
    { a: -7.6, w: 3.6, sill: 0.95, top: 2.8 },
    { a: 1.6, w: 1.4, sill: 1.5, top: 2.6 },
    { a: 7.2, w: 3.0, sill: 0.95, top: 2.7 },
  ]
});
// East flank — window over the kitchen sink plus a service door to the side yard.
// No opening in the laundry: the built-in wardrobe is flush against this wall.
wallZ(M.stucco, WX1, WZ0, WZ1, {
  openings: [
    { a: -1.5, w: 3.4, sill: 1.05, top: 2.6 },
    { a: 5.2, w: 1.1, top: 2.3, glass: false },
  ]
});

// Interior partitions
wallZ(M.plaster, PX_W, WZ0, 9.0, {
  t: INT_T, openings: [{ a: -5.5, w: 1.9, top: 2.45, glass: false }, { a: 7.6, w: 1.4, top: 2.3, glass: false }]
});
wallX(M.plaster, PZ_S, PX_W, PX_F, { t: INT_T });
wallZ(M.plaster, PX_F, PZ_S, WZ1, { t: INT_T, openings: [{ a: 7.9, w: 2.0, top: 2.45, glass: false }] });
wallZ(M.plaster, PX_E, PZ_S, WZ1, { t: INT_T, openings: [{ a: 8.6, w: 0.95, top: 2.15, glass: false }] });
wallZ(M.plaster, PX_K, PZ_S, WZ1, { t: INT_T });
wallX(M.plaster, PZ_S, PX_E, WX1, { t: INT_T, openings: [{ a: 8.8, w: 1.4, top: 2.3, glass: false }] });
wallZ(M.plasterWarm, PX_K, WZ0, -7.4, { t: INT_T });                  // kitchen anchor fin
wallX(M.plaster, PZ_MB, WX0, PX_W, {
  t: INT_T, openings: [{ a: -13.9, w: 0.95, top: 2.15, glass: false }, { a: -10.7, w: 1.3, top: 2.3, glass: false }]
});
wallZ(M.plaster, PX_BATH, PZ_MB, PZ_B2, { t: INT_T });
wallX(M.plaster, PZ_B2, WX0, PX_W, { t: INT_T });

// Ceilings: standard height everywhere, raised volume over the great room
slab(M.ceiling, VX0, PX_W - 0.1, VZ0, VZ1, CEIL, CEIL + 0.32);
slab(M.ceiling, PX_K + 0.1, VX1, VZ0, VZ1, CEIL, CEIL + 0.32);
slab(M.ceiling, PX_W - 0.1, PX_K + 0.1, PZ_S, VZ1, CEIL, CEIL + 0.32);
slab(M.ceiling, PX_W - 0.1, PX_K + 0.1, VZ0, PZ_S, GR_CEIL, GR_CEIL + 0.34);
// Clerestory band lighting the great room from above
slab(M.glass, PX_W - 0.13, PX_W - 0.05, VZ0, PZ_S, CEIL + 0.32, GR_CEIL);
slab(M.glass, PX_K + 0.05, PX_K + 0.13, VZ0, PZ_S, CEIL + 0.32, GR_CEIL);
slab(M.glass, PX_W - 0.1, PX_K + 0.1, PZ_S - 0.04, PZ_S + 0.04, CEIL + 0.32, GR_CEIL);

// Roof: low flat roof wrapping around the raised great-room volume
const GRX0 = PX_W - 0.16, GRX1 = PX_K + 0.16, GRZ1 = PZ_S + 0.16;
const RY0 = CEIL + 0.32, RY1 = CEIL + 0.5, PARA = CEIL + 1.0;
slab(M.stuccoWarm, VX0 - 0.35, GRX0, VZ0 - 0.35, VZ1 + 0.35, RY0, RY1);
slab(M.stuccoWarm, GRX1, VX1 + 0.35, VZ0 - 0.35, VZ1 + 0.35, RY0, RY1);
slab(M.stuccoWarm, GRX0, GRX1, GRZ1, VZ1 + 0.35, RY0, RY1);
slab(M.stucco, VX0 - 0.35, GRX0, VZ0 - 0.35, VZ0 + 0.05, RY1, PARA);       // rear parapet, west
slab(M.stucco, GRX1, VX1 + 0.35, VZ0 - 0.35, VZ0 + 0.05, RY1, PARA);       // rear parapet, east
slab(M.stucco, VX0 - 0.35, VX1 + 0.35, VZ1 - 0.05, VZ1 + 0.35, RY1, PARA); // street parapet
slab(M.stucco, VX0 - 0.35, VX0 + 0.05, VZ0, VZ1, RY1, PARA);
slab(M.stucco, VX1 - 0.05, VX1 + 0.35, VZ0, VZ1, RY1, PARA);
// Raised great-room roof + its own parapet
slab(M.stuccoWarm, GRX0, GRX1, VZ0 - 0.4, GRZ1, GR_CEIL + 0.34, GR_CEIL + 0.54);
slab(M.stucco, GRX0, GRX1, VZ0 - 0.4, VZ0 - 0.1, GR_CEIL + 0.54, GR_CEIL + 1.0);
slab(M.stucco, GRX0, GRX1, GRZ1 - 0.3, GRZ1, GR_CEIL + 0.54, GR_CEIL + 1.0);
slab(M.stucco, GRX0, GRX0 + 0.3, VZ0 - 0.4, GRZ1, GR_CEIL + 0.54, GR_CEIL + 1.0);
slab(M.stucco, GRX1 - 0.3, GRX1, VZ0 - 0.4, GRZ1, GR_CEIL + 0.54, GR_CEIL + 1.0);

// Rear brise-soleil over the terrace: teak slats on a steel frame
slab(M.bronze, PX_W - 0.4, PX_K + 0.4, VZ0 - 3.9, VZ0 - 3.66, 3.95, 4.22);
slab(M.bronze, PX_W - 0.4, PX_K + 0.4, VZ0 - 0.24, VZ0, 3.95, 4.22);
for (let x = PX_W - 0.3; x < PX_K + 0.3; x += 0.46)
  slab(M.teak, x, x + 0.16, VZ0 - 3.9, VZ0, 4.05, 4.3);
slab(M.bronze, -9.05, -8.75, -15.55, -15.25, FLOOR, 3.95);
slab(M.bronze, 5.95, 6.25, -15.55, -15.25, FLOOR, 3.95);

// Entry canopy + house number
slab(M.stuccoWarm, -3.2, 3.2, VZ1, VZ1 + 2.6, 3.2, 3.5);
slab(M.stucco, -3.05, -2.75, VZ1 + 2.2, VZ1 + 2.5, FLOOR, 3.2);
slab(M.stucco, 2.75, 3.05, VZ1 + 2.2, VZ1 + 2.5, FLOOR, 3.2);
slab(M.bronze, 8.6, 9.9, VZ1 - 0.02, VZ1 + 0.04, 1.9, 2.2);   // house number plate

// Teak slat screen beside the entry, and planters along the front elevation
for (let x = 1.7; x < 3.7; x += 0.28)
  slab(M.teak, x, x + 0.14, VZ1 + 0.02, VZ1 + 0.16, FLOOR, 3.15);
for (let x = -3.7; x < -1.7; x += 0.28)
  slab(M.teak, x, x + 0.14, VZ1 + 0.02, VZ1 + 0.16, FLOOR, 3.15);
slab(M.hedge, -13.4, -8.4, VZ1 + 0.4, VZ1 + 1.4, 0.2, 1.05);
slab(M.hedge, 8.4, 13.4, VZ1 + 0.4, VZ1 + 1.4, 0.2, 1.05);

// ---------------------------------------------------------------------------
// Furniture kit
// ---------------------------------------------------------------------------
const F = FLOOR; // shorthand: everything indoors sits on the finished floor

function rug(w, d, mat = M.rug) {
  box(mat, 0, F + 0.012, 0, w, 0.024, d);
}
function sofa(len, { depth = 0.95, mat = M.fabric, cushion = M.fabricWarm, arms = true } = {}) {
  box(mat, 0, F + 0.18, 0, len, 0.36, depth);                        // base
  box(mat, 0, F + 0.46, 0, len - 0.1, 0.2, depth - 0.1);             // seat
  box(mat, 0, F + 0.66, -depth / 2 + 0.16, len, 0.72, 0.28);         // backrest
  if (arms) {
    box(mat, -len / 2 + 0.14, F + 0.5, 0.02, 0.28, 0.64, depth - 0.06);
    box(mat, len / 2 - 0.14, F + 0.5, 0.02, 0.28, 0.64, depth - 0.06);
  }
  const n = Math.max(2, Math.round(len / 1.1));
  for (let i = 0; i < n; i++) {
    const x = -len / 2 + len * (i + 0.5) / n;
    box(cushion, x, F + 0.72, -depth / 2 + 0.34, 0.44, 0.42, 0.14, 0.12);
  }
}
function armchair(mat = M.fabricOlive) {
  box(mat, 0, F + 0.2, 0, 0.92, 0.4, 0.9);
  box(mat, 0, F + 0.46, 0, 0.84, 0.14, 0.82);
  box(mat, 0, F + 0.64, -0.36, 0.92, 0.62, 0.18);
  box(mat, -0.4, F + 0.5, 0, 0.14, 0.5, 0.86);
  box(mat, 0.4, F + 0.5, 0, 0.14, 0.5, 0.86);
  for (const [dx, dz] of [[-0.36, -0.34], [0.36, -0.34], [-0.36, 0.34], [0.36, 0.34]])
    shape(G.cylBase, M.walnut, dx, F, dz, 0.07, 0.2, 0.07);
}
function lowTable(w, d, mat = M.walnut) {
  box(mat, 0, F + 0.4, 0, w, 0.07, d);
  box(mat, 0, F + 0.19, 0, w - 0.5, 0.36, d - 0.4);
}
function diningTable(w, d, mat = M.walnut) {
  box(mat, 0, F + 0.74, 0, w, 0.08, d);
  box(mat, 0, F + 0.36, 0, w - 1.1, 0.7, 0.14);
  box(mat, -w / 2 + 0.45, F + 0.36, 0, 0.12, 0.7, d - 0.2);
  box(mat, w / 2 - 0.45, F + 0.36, 0, 0.12, 0.7, d - 0.2);
}
function chair(mat = M.fabric, wood = M.walnut) {
  box(mat, 0, F + 0.45, 0, 0.5, 0.09, 0.5);
  box(mat, 0, F + 0.72, -0.21, 0.46, 0.48, 0.08);
  for (const [dx, dz] of [[-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2], [0.2, 0.2]])
    box(wood, dx, F + 0.22, dz, 0.05, 0.44, 0.05);
}
function stool(h = 0.72) {
  shape(G.cyl, M.fabricWarm, 0, F + h, 0, 0.36, 0.1, 0.36);
  shape(G.cylBase, M.bronze, 0, F, 0, 0.07, h, 0.07);
  shape(G.cyl, M.bronze, 0, F + 0.02, 0, 0.4, 0.04, 0.4);
  shape(G.cyl, M.bronze, 0, F + 0.24, 0, 0.3, 0.04, 0.3);
}
function bed(w, l, { linen = M.linen, throwMat = M.fabricWarm } = {}) {
  box(M.walnut, 0, F + 0.16, 0, w, 0.32, l);                         // base
  box(linen, 0, F + 0.46, 0, w - 0.06, 0.3, l - 0.06);               // mattress
  box(linen, 0, F + 0.63, 0.1, w - 0.02, 0.06, l - 0.9);             // duvet
  box(throwMat, 0, F + 0.65, l / 2 - 0.55, w - 0.02, 0.07, 0.9);     // throw
  box(M.fabric, 0, F + 0.78, -l / 2 - 0.1, w + 0.5, 1.15, 0.2);      // upholstered headboard
  box(M.walnut, 0, F + 0.12, -l / 2 - 0.1, w + 0.5, 0.24, 0.22);
  for (const dx of [-w / 4 - 0.06, w / 4 + 0.06])
    box(M.linen, dx, F + 0.72, -l / 2 + 0.38, w / 2 - 0.16, 0.16, 0.44);
}
function nightstand() {
  box(M.walnut, 0, F + 0.26, 0, 0.55, 0.52, 0.45);
  box(M.marble, 0, F + 0.54, 0, 0.6, 0.04, 0.5);
  shape(G.cylBase, M.bronze, 0, F + 0.56, 0, 0.05, 0.3, 0.05);
  shape(G.cyl, M.lampShade, 0, F + 0.95, 0, 0.28, 0.3, 0.28);
}
// Panelled wardrobe: real carcass (top/back/kick/dividers), slab doors with
// vertical bronze pulls, cornice on top. Bays listed in `open` have no door and
// show their interior: shelf with folded stacks, rail with clothes on hangers.
function wardrobe(w, d = 0.62, h = 2.35, { open = [] } = {}) {
  const n = Math.max(2, Math.round(w / 0.84));
  const bw = w / n, t = 0.03;
  box(M.cabinet, 0, F + h - t / 2, 0, w, t, d);                       // top
  box(M.cabinet, 0, F + 0.1, 0, w, 0.04, d);                          // bottom shelf
  box(M.cabinet, 0, F + 0.045, -0.03, w, 0.09, d - 0.06);             // recessed kick
  box(M.cabinet, 0, F + h / 2, -d / 2 + t / 2, w, h, t);              // back
  for (let i = 0; i <= n; i++)
    box(M.cabinet, -w / 2 + i * bw, F + h / 2, 0, t, h, d);           // sides + dividers
  box(M.cabinet, 0, F + h + 0.035, 0, w + 0.08, 0.07, d + 0.06);      // cornice
  const cloth = [M.linen, M.fabric, M.fabricOlive, M.fabricWarm];
  for (let i = 0; i < n; i++) {
    const cx = -w / 2 + bw * (i + 0.5);
    if (!open.includes(i)) {                                          // closed bay: door + pull
      box(M.cabinet, cx, F + h / 2 + 0.03, d / 2 + 0.015, bw - 0.04, h - 0.18, t);
      box(M.bronze, cx + bw / 2 - 0.09, F + 1.05, d / 2 + 0.04, 0.02, 0.4, 0.025);
      continue;
    }
    box(M.cabinet, cx, F + h - 0.42, 0, bw - t, t, d - 0.08);         // shelf
    box(M.linen, cx - 0.13, F + h - 0.33, 0, 0.3, 0.16, 0.32);        // folded stacks
    box(M.fabricWarm, cx + 0.15, F + h - 0.35, 0, 0.26, 0.12, 0.3);
    shape(G.cyl, M.bronze, cx, F + h - 0.62, 0, bw - 0.1, 0.025, 0.025, { rz: Math.PI / 2 }); // rail
    const k = Math.max(2, Math.floor(bw / 0.22));
    for (let j = 0; j < k; j++) {                                     // hangers + garments
      const gx = cx - (bw - 0.24) / 2 + (j * (bw - 0.24)) / (k - 1);
      box(M.bronze, gx, F + h - 0.65, 0, 0.02, 0.07, 0.02);           // hook
      box(M.bronze, gx, F + h - 0.68, 0, 0.3, 0.015, 0.02);           // hanger bar
      box(cloth[(i + j) % cloth.length], gx, F + h - 1.16, 0.03, 0.3, 0.95, 0.24, j % 2 ? 0.06 : -0.04);
    }
  }
}
function vase(h, r, mat, y0 = F) {
  shape(G.sphere, mat, 0, y0 + h * 0.3, 0, r * 2, h * 0.6, r * 2);          // belly
  shape(G.cylBase, mat, 0, y0 + h * 0.52, 0, r * 0.85, h * 0.48, r * 0.85); // neck
  shape(G.cyl, mat, 0, y0 + h, 0, r * 1.15, 0.03, r * 1.15);                // rim
}
function dresser(w = 1.7) {
  box(M.walnut, 0, F + 0.42, 0, w, 0.84, 0.5);
  box(M.marble, 0, F + 0.86, 0, w + 0.06, 0.04, 0.54);
  for (let i = 0; i < 3; i++)
    box(M.bronze, -w / 2 + w * (i + 0.5) / 3, F + 0.5, 0.27, 0.32, 0.03, 0.03);
}
// Base cabinets + counter run of `len` along local X, `depth` along local Z.
function counterRun(len, depth = 0.66, { uppers = 0, sink = false, cooktop = false } = {}) {
  box(M.cabinet, 0, F + 0.44, 0, len, 0.78, depth);
  box(M.bronze, 0, F + 0.06, depth / 2 - 0.05, len, 0.12, 0.06);
  box(M.marble, 0, F + 0.87, 0, len + 0.04, 0.06, depth + 0.04);
  const n = Math.max(1, Math.round(len / 0.8));
  for (let i = 1; i < n; i++) box(M.bronze, -len / 2 + (len * i) / n, F + 0.44, depth / 2 + 0.01, 0.015, 0.68, 0.015);
  if (sink) {
    box(M.steel, 0, F + 0.84, 0, 0.78, 0.06, 0.44);
    shape(G.cylBase, M.bronze, 0, F + 0.9, -0.2, 0.035, 0.34, 0.035);
    box(M.bronze, 0, F + 1.22, -0.11, 0.04, 0.04, 0.22);
  }
  if (cooktop) box(M.black, 0, F + 0.905, 0, 0.86, 0.02, 0.5);
  if (uppers > 0) {
    box(M.cabinet, 0, F + 2.05, -depth / 2 + 0.19, uppers, 0.72, 0.38);
    box(M.marbleDark, 0, F + 1.32, -depth / 2 + 0.02, uppers, 0.82, 0.04);   // backsplash
  }
}
function kitchenIsland(len, wid) {
  box(M.walnut, 0, F + 0.44, 0, wid, 0.78, len);
  box(M.bronze, 0, F + 0.06, 0, wid - 0.1, 0.12, len - 0.1);
  box(M.marble, 0, F + 0.9, 0, wid + 0.5, 0.08, len + 0.1);
  box(M.steel, 0.1, F + 0.9, 0.5, 0.5, 0.03, 0.8);
  shape(G.cylBase, M.bronze, 0.1, F + 0.94, 0.95, 0.035, 0.36, 0.035);
  box(M.bronze, 0.1, F + 1.28, 0.82, 0.04, 0.04, 0.28);
  box(M.fabricWarm, -0.1, F + 0.96, -0.9, 0.4, 0.05, 0.62);                  // fruit board
  shape(G.sphere, M.foliage, -0.1, F + 1.03, -0.9, 0.16, 0.14, 0.16);
}
function fridge(w = 1.8, h = 2.25) {
  box(M.steel, 0, F + h / 2, 0, w, h, 0.75);
  box(M.bronze, 0, F + h / 2, 0.39, 0.03, h - 0.4, 0.03);
}
function ovenStack() {
  box(M.cabinet, 0, F + 1.12, 0, 0.9, 2.24, 0.72);
  box(M.black, 0, F + 1.0, 0.37, 0.76, 0.6, 0.03);
  box(M.black, 0, F + 1.68, 0.37, 0.76, 0.5, 0.03);
  box(M.steel, 0, F + 0.72, 0.38, 0.8, 0.05, 0.04);
}
function hood() {
  box(M.steel, 0, F + 2.05, 0, 1.5, 0.35, 0.66);
  box(M.steel, 0, F + 2.6, -0.16, 0.6, 0.8, 0.34);
}
function pendant(x, y, z, r = 0.2) {
  box(M.bronze, x, y + 0.5, z, 0.03, 1.0, 0.03);
  shape(G.cone, M.lampShade, x, y + 0.24, z, r * 2, -0.34, r * 2);
}
// Bathroom kit. Every fixture is authored with its back against a wall on -Z,
// so a frame() yaw is all that is needed to hang it on any wall of a room.
function vanity(w, { basins = w > 1.5 ? 2 : 1, sconces = true } = {}) {
  // Floating walnut cabinet, marble counter, vessel basin(s), round mirror(s)
  const D = 0.58;
  box(M.walnut, 0, F + 0.38, 0, w, 0.44, D);                         // floating cabinet
  for (let i = 0; i < basins; i++)                                   // recessed drawer pulls
    box(M.bronze, (basins === 1 ? 0 : -w / 4 + (w / 2) * i), F + 0.38, D / 2 + 0.01,
      w / basins - 0.16, 0.015, 0.02);
  box(M.marble, 0, F + 0.63, 0, w + 0.08, 0.06, D + 0.06);           // counter slab
  box(M.marble, 0, F + 0.73, -D / 2 - 0.02, w + 0.08, 0.14, 0.03);   // upstand
  for (let i = 0; i < basins; i++) {
    const x = basins === 1 ? 0 : -w / 4 + (w / 2) * i;
    // Vessel basin, wider at the rim, with a dark drain well inside
    shape(G.trunk, M.marble, x, F + 0.82, 0.02, 0.46, 0.16, 0.40, { rx: Math.PI });
    shape(G.cyl, M.marbleDark, x, F + 0.79, 0.02, 0.38, 0.02, 0.33);
    // Wall tap: riser, spout arm over the basin, lever handle
    shape(G.cylBase, M.bronze, x, F + 0.66, -0.22, 0.045, 0.26, 0.045);
    box(M.bronze, x, F + 0.9, -0.1, 0.045, 0.045, 0.26);
    box(M.bronze, x - 0.15, F + 0.86, -0.22, 0.14, 0.03, 0.03);
    // Round mirror in a slim bronze rim
    shape(G.cyl, M.bronze, x, F + 1.62, -0.29, 0.7, 0.02, 0.7, { rx: Math.PI / 2 });
    shape(G.cyl, M.mirror, x, F + 1.62, -0.27, 0.64, 0.02, 0.64, { rx: Math.PI / 2 });
  }
  if (sconces) for (const dx of [-1, 1]) {
    const x = dx * (w / 2 + 0.13);
    box(M.bronze, x, F + 1.62, -0.28, 0.09, 0.09, 0.04);
    shape(G.cyl, M.lampShade, x, F + 1.62, -0.2, 0.09, 0.3, 0.09);
  }
}
function wc() {
  // Wall-hung bowl on a concealed-cistern duct panel with a flush plate
  box(M.cabinet, 0, F + 0.55, -0.32, 0.66, 1.1, 0.2);                // duct panel
  box(M.marble, 0, F + 1.12, -0.32, 0.72, 0.04, 0.26);               // shelf cap
  box(M.steel, 0, F + 0.92, -0.21, 0.22, 0.15, 0.02);                // flush plate
  box(M.cabinet, 0, F + 0.32, -0.16, 0.28, 0.16, 0.14);              // bowl-to-wall spur
  shape(G.trunk, M.cabinet, 0, F + 0.41, 0.03, 0.38, 0.23, 0.5, { rx: Math.PI });
  shape(G.cyl, M.cabinet, 0, F + 0.43, 0.03, 0.4, 0.05, 0.52);       // rim
  shape(G.cyl, M.linen, 0, F + 0.465, 0.03, 0.385, 0.03, 0.5);       // seat
  shape(G.cyl, M.cabinet, 0, F + 0.49, 0.02, 0.375, 0.02, 0.49);     // lid
  box(M.bronze, 0.44, F + 0.72, -0.24, 0.03, 0.03, 0.18);            // paper holder arm
  shape(G.cyl, M.linen, 0.44, F + 0.72, -0.16, 0.12, 0.11, 0.12, { rx: Math.PI / 2 });
}
function bathtub(len = 1.78, wid = 0.86) {
  // Freestanding oval soaker on a low plinth, floor filler at the tap end
  shape(G.cyl, M.cabinet, 0, F + 0.07, 0, len - 0.55, 0.14, wid - 0.3);  // plinth
  shape(G.cyl, M.cabinet, 0, F + 0.35, 0, len, 0.44, wid);              // shell, rim at 0.57
  shape(G.cyl, M.tubWater, 0, F + 0.585, 0, len - 0.26, 0.03, wid - 0.26); // water inside the rim
  shape(G.cyl, M.bronze, 0, F + 0.6, 0, 0.09, 0.02, 0.09);              // overflow plate
  const fx = -len / 2 - 0.26;
  shape(G.cyl, M.bronze, fx, F + 0.03, 0, 0.18, 0.06, 0.18);            // filler base
  shape(G.cylBase, M.bronze, fx, F, 0, 0.05, 1.02, 0.05);               // filler column
  box(M.bronze, fx + 0.16, F + 1.0, 0, 0.36, 0.05, 0.05);               // spout over the rim
  box(M.bronze, fx, F + 0.84, 0.14, 0.04, 0.04, 0.16);                  // handle
  box(M.fabric, 0, F + 0.47, -wid / 2 - 0.01, 0.36, 0.28, 0.07);        // towel over the rim
}
function shower(w, d) {
  // Walk-in: walls on -X and -Z, fixed glass screens on +X and +Z
  box(M.marble, 0, F + 0.02, 0, w, 0.04, d);                           // flush tray
  box(M.steel, 0, F + 0.045, -d / 2 + 0.22, w - 0.5, 0.012, 0.06);     // linear drain
  box(M.glass, w / 2, F + 1.15, 0, 0.03, 2.3, d);
  box(M.glass, 0, F + 1.15, d / 2, w, 2.3, 0.03);
  box(M.bronze, w / 2, F + 1.15, d / 2, 0.05, 2.3, 0.05);              // corner post
  box(M.bronze, w / 2, F + 2.32, 0, 0.05, 0.05, d);                    // head rails
  box(M.bronze, 0, F + 2.32, d / 2, w, 0.05, 0.05);
  // Wall-arm rain head plus a thermostatic bar and hand shower below it
  box(M.bronze, 0, F + 2.25, -d / 2 + 0.28, 0.05, 0.05, 0.5);
  shape(G.cyl, M.steel, 0, F + 2.2, -d / 2 + 0.5, 0.34, 0.04, 0.34);
  box(M.bronze, -w / 2 + 0.35, F + 1.15, -d / 2 + 0.06, 0.05, 0.05, 0.06);
  box(M.bronze, -w / 2 + 0.35, F + 1.42, -d / 2 + 0.07, 0.04, 0.6, 0.04);
  shape(G.cyl, M.steel, -w / 2 + 0.35, F + 1.6, -d / 2 + 0.13, 0.07, 0.16, 0.07, { rx: 0.3 });
}
// Teak towel ladder standing against a wall on -Z, hung with rolled towels
function towelLadder(h = 1.7) {
  for (const dx of [-0.24, 0.24]) box(M.teak, dx, F + h / 2, -0.05, 0.05, h, 0.05);
  for (let i = 0; i < 4; i++) {
    const y = F + 0.45 + i * 0.38;
    box(M.teak, 0, y, -0.05, 0.5, 0.05, 0.05);
    if (i < 3) box(M.fabric, 0, y - 0.16, 0.02, 0.42, 0.3, 0.09);
  }
}
function lounger() {
  box(M.teak, 0, F + 0.32, 0, 0.78, 0.1, 2.0);
  box(M.linen, 0, F + 0.42, 0.12, 0.72, 0.12, 1.7);
  box(M.linen, 0, F + 0.62, -0.82, 0.72, 0.12, 0.7, 0);
  box(M.teak, 0, F + 0.58, -0.86, 0.78, 0.1, 0.72);
  for (const dz of [-0.8, 0.8]) {
    box(M.teak, -0.34, F + 0.14, dz, 0.08, 0.36, 0.08);
    box(M.teak, 0.34, F + 0.14, dz, 0.08, 0.36, 0.08);
  }
  box(M.fabricWarm, 0, F + 0.52, -0.5, 0.44, 0.1, 0.34);
}
function parasol() {
  shape(G.cylBase, M.teak, 0, F, 0, 0.07, 2.5, 0.07);
  shape(G.cone, M.linen, 0, F + 2.15, 0, 5.4, 0.55, 5.4);
  shape(G.cyl, M.concrete, 0, F + 0.06, 0, 0.7, 0.12, 0.7);
}
function outdoorSofa(len) {
  box(M.teak, 0, F + 0.2, 0, len, 0.4, 0.95);
  box(M.linen, 0, F + 0.46, 0.04, len - 0.12, 0.16, 0.86);
  box(M.linen, 0, F + 0.66, -0.36, len - 0.12, 0.44, 0.2);
  const n = Math.max(2, Math.round(len / 1.2));
  for (let i = 0; i < n; i++)
    box(M.fabricOlive, -len / 2 + len * (i + 0.5) / n, F + 0.7, -0.22, 0.4, 0.38, 0.14, 0.1);
}
function firePit() {
  box(M.concrete, 0, F + 0.22, 0, 1.7, 0.44, 1.7);
  box(M.marbleDark, 0, F + 0.46, 0, 1.8, 0.06, 1.8);
  box(M.black, 0, F + 0.5, 0, 0.9, 0.06, 0.9);
  box(M.ember, 0, F + 0.55, 0, 0.7, 0.07, 0.7);
}
function bbqCounter(len) {
  box(M.stuccoWarm, 0, F + 0.45, 0, len, 0.9, 0.72);
  box(M.marbleDark, 0, F + 0.93, 0, len + 0.12, 0.08, 0.84);
  box(M.steel, -len / 4, F + 0.98, 0, 1.2, 0.12, 0.66);
  box(M.black, -len / 4, F + 1.06, -0.02, 1.1, 0.06, 0.56);
  box(M.steel, len / 4, F + 0.45, 0.37, 0.7, 0.7, 0.04);
}
function outdoorDining(w, d) {
  box(M.teak, 0, F + 0.74, 0, w, 0.08, d);
  for (const [dx, dz] of [[-w / 2 + 0.35, -d / 2 + 0.3], [w / 2 - 0.35, -d / 2 + 0.3], [-w / 2 + 0.35, d / 2 - 0.3], [w / 2 - 0.35, d / 2 - 0.3]])
    box(M.teak, dx, F + 0.36, dz, 0.1, 0.68, 0.1);
}
function pergola(w, d, h = 2.9) {
  for (const [dx, dz] of [[-w / 2, -d / 2], [w / 2, -d / 2], [-w / 2, d / 2], [w / 2, d / 2]])
    box(M.teak, dx, F + h / 2, dz, 0.18, h, 0.18);
  box(M.teak, 0, F + h + 0.09, -d / 2, w + 0.4, 0.18, 0.16);
  box(M.teak, 0, F + h + 0.09, d / 2, w + 0.4, 0.18, 0.16);
  const n = Math.round(w / 0.42);
  for (let i = 0; i <= n; i++)
    box(M.teak, -w / 2 + (w * i) / n, F + h + 0.24, 0, 0.09, 0.14, d + 0.5);
}
function planter(size, h = 0.7, plant = M.foliage) {
  box(M.concrete, 0, F + h / 2, 0, size, h, size);
  box(M.gravel, 0, F + h + 0.02, 0, size - 0.14, 0.06, size - 0.14);
  shape(G.blob, plant, 0, F + h + 0.42, 0, size * 0.9, size * 0.8, size * 0.9);
}
function palm(h = 9) {
  shape(G.trunk, M.bark, 0, 0, 0, 0.44, h, 0.44, { ry: Math.random() * 3 });
  const n = 9;
  for (let i = 0; i < n; i++) {
    const spin = (i / n) * Math.PI * 2 + Math.random() * 0.2;
    const tilt = 1.05 + ((i % 3) * 0.16);
    shape(G.frond, M.foliage, 0, h - 0.15, 0, 1.5, 3.3 + (i % 2) * 0.5, 1.5, { ry: spin, rx: tilt });
  }
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    shape(G.sphere, M.foliageOlive, Math.cos(a) * 0.35, h - 0.35, Math.sin(a) * 0.35, 0.3, 0.3, 0.3);
  }
}
function oliveTree(h = 4.2) {
  shape(G.trunk, M.barkDark, 0, 0, 0, 0.5, h * 0.55, 0.5);
  for (const [dx, dy, dz, s] of [[0, h * 0.72, 0, 3.2], [-1.1, h * 0.6, 0.5, 2.2], [1.0, h * 0.62, -0.6, 2.4], [0.3, h * 0.85, 0.6, 1.9]])
    shape(G.blob, M.foliageOlive, dx, dy, dz, s, s * 0.8, s);
}
function cypress(h = 7) {
  shape(G.cone, M.foliageDark, 0, 0, 0, 1.5, h, 1.5);
}
function agave() {
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    shape(G.cone, M.foliageOlive, 0, 0.05, 0, 0.34, 1.1, 0.34, { ry: a, rx: 0.85 });
  }
}
function hedge(x0, x1, z0, z1, h = 1.5) {
  slab(M.hedge, x0, x1, z0, z1, 0, h);
  const along = Math.abs(x1 - x0) > Math.abs(z1 - z0);
  const len = along ? x1 - x0 : z1 - z0;
  const n = Math.max(1, Math.round(Math.abs(len) / 1.3));
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    const x = along ? x0 + len * t : (x0 + x1) / 2;
    const z = along ? (z0 + z1) / 2 : z0 + len * t;
    shape(G.blob, M.hedge, x, h - 0.05, z, 1.35, 0.55, Math.abs(along ? z1 - z0 : x1 - x0) * 0.95);
  }
}
// A parked car is a real lofted mesh in `world` (so the player can raycast onto
// its roof) plus one invisible kit box so the AABB collider still sees it.
function parkCar(type, color, x, z, ry, ground, opts) {
  const mesh = buildCar(type, color, opts);
  mesh.position.set(x, ground, z);
  mesh.rotation.y = ry;
  world.add(mesh);
  const b = carBounds(type);
  frame(x, z, ry, () => box(M.collider, 0, ground + b.height / 2, 0, b.length, b.height, b.width));
}

// ---------------------------------------------------------------------------
// Interior — great room (living + dining)
// ---------------------------------------------------------------------------
// Media wall against the private-wing partition, TV faces east into the room
slab(M.plasterWarm, PX_W + 0.1, PX_W + 0.28, -10.6, -4.4, FLOOR, CEIL);
slab(M.marbleDark, PX_W + 0.28, PX_W + 0.42, -9.6, -5.4, FLOOR + 0.35, FLOOR + 0.95);
frame(PX_W + 0.78, -7.5, 0, () => {
  box(M.walnut, 0, F + 0.28, 0, 0.5, 0.56, 3.2);
  box(M.ember, -0.2, F + 0.62, 0, 0.1, 0.14, 3.0);   // linear fireplace
});
// Oak slat ceiling over the living zone, under the raised volume
for (let x = PX_W + 0.2; x < PX_K - 0.2; x += 0.55)
  slab(M.oak, x, x + 0.26, VZ0 + 0.2, -2.6, GR_CEIL - 0.16, GR_CEIL - 0.02);
slab(M.oak, PX_W + 0.1, PX_K - 0.1, -2.75, -2.6, GR_CEIL - 0.2, GR_CEIL - 0.02);
slab(M.oak, PX_W + 0.1, PX_K - 0.1, VZ0 + 0.05, VZ0 + 0.2, GR_CEIL - 0.2, GR_CEIL - 0.02);

// Artwork on the kitchen fin wall + a ficus by the glass
slab(M.walnut, PX_K - 0.16, PX_K - 0.11, -10.6, -8.2, FLOOR + 1.1, FLOOR + 2.5);
slab(M.fabricWarm, PX_K - 0.14, PX_K - 0.12, -10.5, -8.3, FLOOR + 1.2, FLOOR + 2.4);
frame(5.2, -10.7, 0, () => {
  shape(G.cyl, M.terracotta, 0, F + 0.34, 0, 0.74, 0.68, 0.74);
  shape(G.trunk, M.barkDark, 0, F + 0.6, 0, 0.2, 1.1, 0.2);
  for (const [dx, dy, dz, s] of [[0, 2.1, 0, 1.7], [-0.5, 1.75, 0.3, 1.1], [0.45, 1.85, -0.25, 1.2]])
    shape(G.blob, M.foliage, dx, F + dy, dz, s, s * 0.85, s);
});

frame(-4.6, -7.6, -Math.PI / 2, () => {
  sofa(4.6, { depth: 1.05 });
});
frame(-6.6, -10.0, 0, () => sofa(2.4, { depth: 0.95, mat: M.fabricOlive, cushion: M.linen, arms: false }));
frame(-5.6, -5.3, Math.PI, () => armchair());
frame(-7.6, -5.3, Math.PI, () => armchair());
frame(-6.6, -7.6, 0, () => lowTable(1.5, 0.85));
frame(-6.2, -7.6, 0, () => rug(5.4, 6.6, M.rug));
frame(-4.3, -4.9, 0, () => {
  shape(G.cylBase, M.bronze, 0, F, 0, 0.06, 1.5, 0.06);
  shape(G.cone, M.lampShade, 0, F + 1.5, 0, 0.5, 0.4, 0.5);
});
frame(-8.4, -11.2, 0, () => planter(0.7, 0.55, M.foliage));

// Dining: table for eight between the kitchen and the foyer
frame(1.6, -1.4, 0, () => {
  rug(4.4, 3.2, M.rugDark);
  diningTable(2.9, 1.15);
  for (let i = 0; i < 3; i++) {
    frame(-0.95 + i * 0.95, -0.95, 0, () => chair());
    frame(-0.95 + i * 0.95, 0.95, Math.PI, () => chair());
  }
  frame(-1.85, 0, Math.PI / 2, () => chair());
  frame(1.85, 0, -Math.PI / 2, () => chair());
});
pendant(0.7, 2.85, -1.4, 0.22);
pendant(1.6, 2.85, -1.4, 0.22);
pendant(2.5, 2.85, -1.4, 0.22);
frame(5.6, -5.6, 0, () => planter(0.9, 0.75, M.foliageOlive));
frame(-8.6, 5.4, 0, () => dresser(2.0));

// ---------------------------------------------------------------------------
// Kitchen
// ---------------------------------------------------------------------------
frame(11.2, WZ0 + 0.5, 0, () => counterRun(6.2, 0.68, { uppers: 3.6, cooktop: true }));
frame(11.2, WZ0 + 0.62, 0, () => hood());
frame(14.9, -8.6, -Math.PI / 2, () => fridge(1.9));
frame(14.9, -6.2, -Math.PI / 2, () => ovenStack());
frame(15.0, -1.6, -Math.PI / 2, () => counterRun(4.8, 0.66, { sink: true }));
frame(9.6, -4.6, Math.PI / 2, () => kitchenIsland(4.2, 1.25));
for (let i = 0; i < 4; i++) frame(8.5, -6.2 + i * 1.05, 0, () => stool());
pendant(9.6, 2.75, -6.0, 0.18);
pendant(9.6, 2.75, -4.6, 0.18);
pendant(9.6, 2.75, -3.2, 0.18);
frame(8.2, 3.4, 0, () => planter(0.8, 0.7, M.foliage));
// Breakfast nook by the east window
frame(13.4, 3.2, 0, () => {
  rug(2.6, 2.6, M.rugDark);
  box(M.walnut, 0, F + 0.74, 0, 1.3, 0.07, 1.3);
  shape(G.cylBase, M.bronze, 0, F, 0, 0.14, 0.74, 0.14);
  shape(G.cyl, M.bronze, 0, F + 0.03, 0, 0.6, 0.06, 0.6);
  frame(-0.95, 0, Math.PI / 2, () => chair());
  frame(0.95, 0, -Math.PI / 2, () => chair());
});

// Pantry / laundry
frame(8.1, 9.0, Math.PI / 2, () => counterRun(3.6, 0.6, {}));
// Decorative vases on the counter, near the window end
frame(8.1, 9.0, Math.PI / 2, () => {
  frame(-1.3, 0, 0, () => vase(0.44, 0.11, M.terracotta, F + 0.9));
  frame(-0.92, 0, 0, () => vase(0.3, 0.09, M.marbleDark, F + 0.9));
  frame(-0.6, 0, 0, () => vase(0.52, 0.08, M.bronze, F + 0.9));
});
// Front-loading washer + dryer against the north wall, marble folding counter on top
frame(11.2, 6.98, 0, () => {
  for (const mx of [-0.37, 0.37]) {
    box(M.steel, mx, F + 0.44, 0, 0.7, 0.88, 0.66);                            // body
    box(M.black, mx, F + 0.8, 0.335, 0.66, 0.12, 0.02);                        // control panel
    box(M.mirror, mx + 0.13, F + 0.8, 0.346, 0.18, 0.06, 0.012);               // display
    shape(G.cyl, M.steel, mx - 0.19, F + 0.8, 0.35, 0.08, 0.05, 0.08, { rx: Math.PI / 2 }); // programme knob
    shape(G.cyl, M.steel, mx, F + 0.45, 0.335, 0.56, 0.03, 0.56, { rx: Math.PI / 2 });      // door rim
    shape(G.cyl, M.black, mx, F + 0.45, 0.352, 0.44, 0.04, 0.44, { rx: Math.PI / 2 });      // porthole glass
  }
  box(M.marble, 0, F + 0.925, 0, 1.6, 0.05, 0.74);
});
// Built-in wardrobe flush to the east wall, two centre bays open with clothes
frame(15.38, 9.4, -Math.PI / 2, () => wardrobe(4.2, 0.55, 2.4, { open: [1, 2] }));

// ---------------------------------------------------------------------------
// Guest bath (x 3.5 → 6.5, z 6.6 → 11.66). Door on the west wall at z 8.6, a
// high window on the street facade at x 5.0. Laid out the way these rooms are
// done in the hills: soaker under the window, walk-in shower and WC tucked in
// the back corners, double vanity on the long blank wall.
// ---------------------------------------------------------------------------
{
  const BX0 = PX_E + INT_T / 2, BX1 = PX_K - INT_T / 2;   // 3.5 → 6.5
  const BZ0 = PZ_S + INT_T / 2, BZ1 = WZ1 - EXT_T / 2;    // 6.6 → 11.66
  // Marble floor over the poured slab, and stone on the wet walls
  slab(M.marble, BX0, BX1, BZ0, BZ1, FIN, FLOOR + 0.004);
  slab(M.marble, 4.85, BX1, BZ0, BZ0 + 0.02, FLOOR, FLOOR + 2.4);        // shower, south
  slab(M.marble, BX1 - 0.02, BX1, BZ0, 8.05, FLOOR, FLOOR + 2.4);        // shower, east
  slab(M.marbleDark, BX1 - 0.03, BX1 - 0.02, 6.95, 7.75, FLOOR + 1.35, FLOOR + 1.9);
  slab(M.bronze, BX1 - 0.09, BX1 - 0.02, 6.95, 7.75, FLOOR + 1.6, FLOOR + 1.63);  // niche shelf
  slab(M.marble, BX1 - 0.02, BX1, 8.6, 10.8, FLOOR, FLOOR + 2.2);        // vanity wall
  slab(M.marble, 3.85, 6.05, BZ1 - 0.02, BZ1, FLOOR, FLOOR + 1.9);       // wainscot under the window

  frame(5.675, 7.325, -Math.PI / 2, () => shower(1.45, 1.65));
  frame(4.15, 7.05, 0, () => wc());
  frame(6.15, 9.7, -Math.PI / 2, () => vanity(1.6));
  frame(4.95, 10.95, 0, () => {
    bathtub();
    box(M.rug, 0.1, F + 0.014, -0.85, 1.2, 0.028, 0.7);                 // bath mat
    shape(G.cyl, M.marble, -1.1, F + 0.25, -0.55, 0.36, 0.5, 0.36);     // stool
    box(M.fabric, -1.1, F + 0.54, -0.55, 0.3, 0.08, 0.26);
  });
  frame(3.62, 9.55, Math.PI / 2, () => towelLadder());
  // Toiletries on the counter and a fern in the corner by the window
  frame(6.0, 9.7, -Math.PI / 2, () => {
    shape(G.cylBase, M.glass, -0.62, F + 0.66, 0, 0.07, 0.19, 0.07);
    shape(G.cylBase, M.linen, -0.5, F + 0.66, 0.04, 0.06, 0.13, 0.06);
    shape(G.cylBase, M.bronze, 0.6, F + 0.66, 0.02, 0.08, 0.11, 0.08);
  });
  frame(6.2, 11.35, 0, () => {
    shape(G.cyl, M.terracotta, 0, F + 0.22, 0, 0.42, 0.44, 0.42);
    shape(G.blob, M.foliage, 0, F + 0.66, 0, 0.8, 0.7, 0.8);
  });
  pendant(4.95, 3.0, 10.95, 0.16);
}

// Foyer
frame(-2.6, 9.6, Math.PI / 2, () => {
  box(M.walnut, 0, F + 0.42, 0, 1.9, 0.12, 0.42);
  box(M.walnut, -0.85, F + 0.18, 0, 0.1, 0.36, 0.38);
  box(M.walnut, 0.85, F + 0.18, 0, 0.1, 0.36, 0.38);
  box(M.mirror, 0, F + 1.5, -0.24, 1.5, 1.3, 0.04);
  shape(G.cyl, M.marble, -0.5, F + 0.62, 0, 0.34, 0.28, 0.34);
  shape(G.blob, M.foliage, -0.5, F + 0.95, 0, 0.7, 0.6, 0.7);
});
frame(2.6, 9.6, -Math.PI / 2, () => {
  box(M.teak, 0, F + 0.44, 0, 1.5, 0.1, 0.4);
  box(M.teak, -0.6, F + 0.2, 0, 0.1, 0.4, 0.36);
  box(M.teak, 0.6, F + 0.2, 0, 0.1, 0.4, 0.36);
  box(M.fabricWarm, 0, F + 0.52, 0, 1.3, 0.08, 0.34);
});
frame(0, 8.4, 0, () => rug(2.6, 1.6, M.rugDark));
pendant(0, 3.05, 9.8, 0.26);

// Hallway runner + a chair against the living-band partition, clear of the door
frame(-6.5, 7.8, 0, () => rug(5.0, 1.2, M.rugDark));
frame(-9.2, 8.65, Math.PI / 2, () => chair());
// Modern-art canvas on the east partition, facing the front window
slab(M.walnut, -3.56, -3.5, 10.2, 11.8, FLOOR + 1.0, FLOOR + 2.2);
slab(M.linen, -3.555, -3.505, 10.3, 11.7, FLOOR + 1.1, FLOOR + 2.1);
slab(M.terracotta, -3.56, -3.5, 10.5, 11.0, FLOOR + 1.3, FLOOR + 1.9);
slab(M.fabricOlive, -3.56, -3.5, 11.1, 11.55, FLOOR + 1.5, FLOOR + 2.0);
slab(M.black, -3.56, -3.5, 10.6, 11.4, FLOOR + 1.15, FLOOR + 1.28);

// ---------------------------------------------------------------------------
// Master suite
// ---------------------------------------------------------------------------
frame(-12.6, -5.4, 0, () => {
  rug(4.6, 4.0, M.rug);
  frame(0, 0.7, Math.PI, () => bed(2.0, 2.1));
});
frame(-14.4, -2.9, 0, () => nightstand());
frame(-10.8, -2.9, 0, () => nightstand());
frame(-12.6, -8.0, 0, () => {
  box(M.teak, 0, F + 0.24, 0, 1.6, 0.12, 0.45);
  box(M.teak, -0.7, F + 0.11, 0, 0.1, 0.22, 0.4);
  box(M.teak, 0.7, F + 0.11, 0, 0.1, 0.22, 0.4);
  box(M.fabricOlive, 0, F + 0.33, 0, 1.5, 0.08, 0.4);
});
frame(-14.6, -10.2, 0.6, () => armchair(M.fabric));
frame(-13.4, -10.6, 0, () => {
  shape(G.cyl, M.terracotta, 0, F + 0.3, 0, 0.6, 0.6, 0.6);
  shape(G.blob, M.foliage, 0, F + 0.95, 0, 1.1, 1.1, 1.1);
});
frame(-10.05, -9.4, -Math.PI / 2, () => dresser(1.6));

// Master bath: soaker under the west window, double vanity beside it on the
// same wall, shower boxed into the north-east corner, WC on the south wall.
frame(-15.32, 1.35, -Math.PI / 2, () => bathtub());
frame(-15.5, -0.75, Math.PI / 2, () => vanity(1.8));
frame(-13.05, 1.65, Math.PI, () => shower(1.7, 1.3));
frame(-12.75, -1.55, 0, () => wc());
frame(-14.3, 2.0, 0, () => {
  shape(G.cyl, M.terracotta, 0, F + 0.24, 0, 0.46, 0.48, 0.46);
  shape(G.blob, M.foliage, 0, F + 0.72, 0, 0.85, 0.75, 0.85);
});
// Dressing
frame(-11.9, -0.3, Math.PI / 2, () => wardrobe(3.8, 0.6));
frame(-10.0, 1.2, -Math.PI / 2, () => wardrobe(2.0, 0.6));
frame(-11.1, -1.2, 0, () => {
  box(M.walnut, 0, F + 0.42, 0, 1.3, 0.84, 0.7);
  box(M.marble, 0, F + 0.87, 0, 1.4, 0.06, 0.78);
});

// ---------------------------------------------------------------------------
// Guest bedroom
// ---------------------------------------------------------------------------
frame(-12.6, 8.4, 0, () => {
  rug(4.2, 3.6, M.rug);
  frame(0, 1.2, Math.PI, () => bed(1.7, 2.0, { throwMat: M.fabricOlive }));
});
frame(-14.3, 6.0, 0, () => nightstand());
frame(-10.9, 6.0, 0, () => nightstand());
frame(-10.3, 10.2, -Math.PI / 2, () => wardrobe(2.6));
frame(-13.9, 4.0, Math.PI / 2, () => {
  box(M.walnut, 0, F + 0.74, 0, 1.5, 0.07, 0.6);
  box(M.walnut, -0.68, F + 0.36, 0, 0.08, 0.7, 0.55);
  box(M.walnut, 0.68, F + 0.36, 0, 0.08, 0.7, 0.55);
  frame(0, 0.75, Math.PI, () => chair());
});

// ---------------------------------------------------------------------------
// Pool, spa and terrace
// ---------------------------------------------------------------------------
// Tiled basin: floor plus a lining inside each deck face, so the shell is
// watertight and the deck slabs keep their clean travertine edge.
slab(M.poolTile, PLX0, PLX1, PLZ0, PLZ1, POOL_BOTTOM - 0.2, POOL_BOTTOM);
slab(M.poolTile, PLX0, PLX0 + 0.12, PLZ0, PLZ1, POOL_BOTTOM, FLOOR);
slab(M.poolTile, PLX1 - 0.12, PLX1, PLZ0, PLZ1, POOL_BOTTOM, FLOOR);
slab(M.poolTile, PLX0, PLX1, PLZ1 - 0.12, PLZ1, POOL_BOTTOM, FLOOR);
slab(M.poolTile, PLX0, PLX1, PLZ0 - 0.16, PLZ0, POOL_BOTTOM, WATER_Y);   // infinity edge
// Catch basin under the spill
slab(M.concrete, PLX0, PLX1, PLZ0 - 0.9, PLZ0 - 0.16, -0.55, 0.02);
// Coping on the three deck sides
slab(M.travertine, PLX0 - 0.45, PLX0, PLZ0 - 0.45, PLZ1 + 0.45, FLOOR, FLOOR + 0.04);
slab(M.travertine, PLX1, PLX1 + 0.45, PLZ0 - 0.45, PLZ1 + 0.45, FLOOR, FLOOR + 0.04);
slab(M.travertine, PLX0 - 0.45, PLX1 + 0.45, PLZ1, PLZ1 + 0.45, FLOOR, FLOOR + 0.04);
// Bench steps at the shallow west end — each riser stays under the 50 cm
// step-up the controller allows, so you can walk out of the pool.
const STEPS = [[1.55, 0.02], [1.0, -0.42]];
for (const [w, top] of STEPS)
  slab(M.poolTile, PLX0 + 0.12, PLX0 + 0.12 + w, PLZ0 + 0.7, PLZ1 - 0.7, POOL_BOTTOM, top);
// Spa: raised shell that spills into the pool
slab(M.travertine, SPA_X0, SPA_X1, SPA_Z0, SPA_Z0 + 0.35, FLOOR, SPA_RIM);
slab(M.travertine, SPA_X0, SPA_X1, SPA_Z1 - 0.35, SPA_Z1, FLOOR, SPA_RIM);
slab(M.travertine, SPA_X0, SPA_X0 + 0.35, SPA_Z0, SPA_Z1, FLOOR, SPA_RIM);
slab(M.travertine, SPA_X1 - 0.35, SPA_X1, SPA_Z0, SPA_Z1, FLOOR, SPA_RIM);
slab(M.poolTile, SPA_X0 + 0.3, SPA_X1 - 0.3, SPA_Z0 + 0.3, SPA_Z1 - 0.3, FLOOR, FLOOR + 0.08);
slab(M.poolTile, PLX1, SPA_X0 + 0.06, SPA_Z0 + 1.1, SPA_Z0 + 2.0, SPA_RIM - 0.34, SPA_RIM - 0.26);

// Glass guardrail along the drop
for (let x = TX0; x < TX1; x += 2.4) {
  slab(M.glass, x + 0.06, x + 2.34, TZ0 - 0.06, TZ0 + 0.02, FLOOR, FLOOR + 1.1);
  slab(M.bronze, x - 0.04, x + 0.06, TZ0 - 0.08, TZ0 + 0.04, FLOOR, FLOOR + 1.16);
}
slab(M.bronze, TX0, TX1, TZ0 - 0.09, TZ0 + 0.05, FLOOR + 1.1, FLOOR + 1.18);

// Terrace furniture
for (const [x, z] of [[12.4, -19.6], [12.4, -22.6], [15.2, -19.6], [15.2, -22.6]])
  frame(x, z, -Math.PI / 2, () => lounger());
frame(13.8, -21.1, 0, () => parasol());
frame(17.2, -19.6, 0, () => {
  shape(G.cyl, M.teak, 0, F + 0.22, 0, 0.5, 0.44, 0.5);
});
frame(-14.6, -15.6, 0, () => {
  pergola(7.4, 4.4);
  outdoorDining(3.0, 1.2);
  for (let i = 0; i < 3; i++) {
    frame(-1.0 + i, -1.0, 0, () => chair(M.linen, M.teak));
    frame(-1.0 + i, 1.0, Math.PI, () => chair(M.linen, M.teak));
  }
});
frame(-14.2, -22.0, 0, () => {
  firePit();
  frame(0, 2.1, Math.PI, () => outdoorSofa(3.2));
  frame(-2.3, 0, Math.PI / 2, () => outdoorSofa(2.2));
  frame(2.3, 0, -Math.PI / 2, () => outdoorSofa(2.2));
});
frame(10.5, -13.6, Math.PI, () => bbqCounter(4.4));
for (let i = 0; i < 3; i++) frame(9.4 + i * 1.1, -14.9, Math.PI, () => stool(0.68));
frame(2.0, -16.2, 0, () => {
  box(M.teak, 0, F + 0.24, 0, 2.2, 0.12, 0.5);   // towel bench by the pool
  box(M.teak, -0.95, F + 0.11, 0, 0.12, 0.22, 0.45);
  box(M.teak, 0.95, F + 0.11, 0, 0.12, 0.22, 0.45);
  box(M.linen, -0.5, F + 0.36, 0, 0.5, 0.14, 0.4);
  box(M.linen, 0.4, F + 0.36, 0, 0.5, 0.14, 0.4);
});
// Outdoor shower screen against the east end of the terrace
slab(M.stuccoWarm, 17.3, 17.9, -14.4, -11.9, FLOOR, FLOOR + 2.4);
slab(M.steel, 17.0, 17.35, -13.4, -13.05, FLOOR + 2.1, FLOOR + 2.2);
slab(M.travertine, 16.4, 17.3, -13.9, -12.4, FLOOR, FLOOR + 0.05);
for (const [x, z] of [[-17.6, -13.2], [17.6, -23.4], [-17.4, -25.0]])
  frame(x, z, 0, () => planter(1.1, 0.85, M.foliageOlive));
// Pair of planters flanking the entry path
for (const x of [-7.0, 7.0]) frame(x, VZ1 + 1.0, 0, () => planter(0.9, 0.75, M.foliageOlive));

// ---------------------------------------------------------------------------
// Garage + motor court
// ---------------------------------------------------------------------------
slab(M.stucco, 18, 30, 4, 16, 0.15, 3.9);
slab(M.stuccoWarm, 17.7, 30.3, 3.7, 16.3, 3.9, 4.15);
slab(M.bronze, 19.2, 23.4, 15.86, 16.06, 0.15, 3.05);
slab(M.bronze, 24.6, 28.8, 15.86, 16.06, 0.15, 3.05);
for (let i = 0; i < 6; i++) {
  slab(M.stuccoWarm, 19.2, 23.4, 15.9, 16.02, 0.4 + i * 0.44, 0.46 + i * 0.44);
  slab(M.stuccoWarm, 24.6, 28.8, 15.9, 16.02, 0.4 + i * 0.44, 0.46 + i * 0.44);
}
parkCar('coupe', 0x1b2b4d, 4.5, 26.5, Math.PI / 2, 0.15);
parkCar('suv', 0xb8bec6, -6.0, 27.5, Math.PI / 2 + 0.25, 0.15, { metallic: false });

// Entry reflecting pool + stepping stones
slab(M.marbleDark, 4.2, 7.6, 13.2, 19.2, -0.6, FLOOR - 0.3);
slab(M.travertine, 4.2, 4.35, 13.2, 19.2, FLOOR - 0.3, FLOOR);
slab(M.travertine, 7.45, 7.6, 13.2, 19.2, FLOOR - 0.3, FLOOR);
slab(M.travertine, 4.2, 7.6, 13.2, 13.35, FLOOR - 0.3, FLOOR);
slab(M.travertine, 4.2, 7.6, 19.05, 19.2, FLOOR - 0.3, FLOOR);
for (let i = 0; i < 4; i++)
  slab(M.travertine, 4.7, 6.1, 13.8 + i * 1.35, 14.9 + i * 1.35, FLOOR - 0.3, FLOOR - 0.04);

// ---------------------------------------------------------------------------
// Landscape — nothing is planted inside the built footprints.
// ---------------------------------------------------------------------------
const NO_PLANT = [
  [VX0 - 0.9, VX1 + 0.9, VZ0 - 4.6, VZ1 + 3.2],   // villa + canopies
  [TX0 - 0.6, TX1 + 0.6, TZ0 - 1.2, VZ0],         // terrace + pool
  [-14.2, 14.2, VZ1, 21.8],                       // entry court
  [-14.6, 30.6, 15.6, 33.4],                      // motor court
  [17.4, 30.6, 3.4, 16.6],                        // garage
  [10.4, 19.6, 32.6, 63.8],                       // driveway
  [-400, 400, 62.6, 84],                          // street corridor
];
function isFree(x, z, r = 1.4) {
  for (const [x0, x1, z0, z1] of NO_PLANT)
    if (x > x0 - r && x < x1 + r && z > z0 - r && z < z1 + r) return false;
  return true;
}
// Plants only ever land on free ground, sitting on the terrain height —
// no more trees sprouting through the roof or the pool deck.
function plant(x, z, fn, r = 1.4) {
  if (!isFree(x, z, r)) return false;
  const prev = LIFT;
  LIFT = terrainHeight(x, z);
  frame(x, z, 0, fn);
  LIFT = prev;
  return true;
}

// Signature palms: tall enough to double as swing anchors
const PALMS = [
  [-23, -8, 11], [-25, 4, 9.5], [-23, 16, 12], [23, 8, 10.5], [25, -4, 12.5],
  [-27, -20, 13], [27, -20, 11.5], [-30, 28, 12], [34, 30, 10.5],
  [-34, -2, 14], [35, 14, 13], [-22, 36, 11], [24, 40, 9.5], [-28, 48, 12.5],
  [26, 52, 11], [-38, 20, 13.5], [38, -12, 12], [-16, 56, 10], [24, 58, 12],
  [-33, -30, 12.5], [33, -34, 11], [-12, 44, 10.5], [6, 50, 12],
];
for (const [x, z, h] of PALMS) plant(x, z, () => palm(h), 2.2);
// Street palms, both kerbs
for (let i = -6; i <= 6; i++) {
  plant(i * 16 - 4, 59.2, () => palm(11 + Math.abs(i % 3)), 1.6);
  plant(i * 16 + 4, 87, () => palm(10 + Math.abs((i + 1) % 3)), 1.6);
}
// Olives, cypresses, agaves
for (const [x, z] of [[-27, -12], [-30, 8], [27, 2], [30, 22], [-24, 42], [26, 40], [-33, 33], [33, -26]])
  plant(x, z, () => oliveTree(4.4 + ((x + z) % 3) * 0.4), 2.6);
for (const [x, z] of [[-16.5, 22.5], [16.5, 22.5], [-16.5, 26], [16.5, 26], [-11, 34], [-11, 40], [-11, 46]])
  plant(x, z, () => cypress(6.5), 1.6);
for (let i = 0; i < 26; i++) {
  const a = i * 2.399, r = 22 + (i % 7) * 4.5;
  plant(Math.cos(a) * r, Math.sin(a) * r + 6, () => agave(), 1.2);
}
// Boundary hedges + walls
hedge(-42, 10.6, 62.2, 63.6, 1.9);
hedge(19.4, 42, 62.2, 63.6, 1.9);
hedge(-42, -40.5, -24, 62, 2.1);
hedge(40.5, 42, -24, 62, 2.1);
hedge(-19.4, -14.6, 20.4, 21.6, 0.9);
hedge(14.6, 19.4, 20.4, 21.6, 0.9);
hedge(-19.6, -18.2, -25.4, -12, 0.85);
hedge(18.2, 19.6, -25.4, -12, 0.85);
// Gate piers + leaves (left open)
slab(M.stucco, 9.4, 10.6, 62.0, 63.8, 0, 2.6);
slab(M.stucco, 19.4, 20.6, 62.0, 63.8, 0, 2.6);
slab(M.bronze, 10.6, 11.4, 62.7, 63.1, 0.2, 2.3);
slab(M.bronze, 18.6, 19.4, 62.7, 63.1, 0.2, 2.3);
slab(M.black, 9.2, 10.8, 61.9, 63.9, 2.6, 2.75);
slab(M.black, 19.2, 20.8, 61.9, 63.9, 2.6, 2.75);

// Garden lighting bollards, set back in the gravel beds
for (let i = 0; i < 3; i++) {
  const z = 14.4 + i * 2.6;
  for (const x of [-9.6, 9.6]) {
    slab(M.bronze, x - 0.05, x + 0.05, z - 0.05, z + 0.05, 0.2, 0.62);
    slab(M.lampShade, x - 0.08, x + 0.08, z - 0.08, z + 0.08, 0.62, 0.7);
  }
}

// ---------------------------------------------------------------------------
// Street, neighbours and the downtown skyline in the haze
// ---------------------------------------------------------------------------
slab(M.asphalt, -400, 400, 66, 80, -0.1, 0.02);
slab(M.concrete, -400, 400, 63.6, 66, -0.1, 0.16);
slab(M.concrete, -400, 400, 80, 82.4, -0.1, 0.16);
for (let i = -24; i <= 24; i++) slab(M.roadLine, i * 8 - 2, i * 8 + 2, 72.8, 73.2, 0.02, 0.04);

for (const [x, z, w, d, h] of [
  [-72, 104, 26, 20, 7.5], [-30, 106, 22, 18, 6.5], [18, 104, 24, 20, 8.5],
  [64, 102, 26, 18, 7.0], [110, 106, 22, 20, 6.8], [-118, 104, 24, 18, 7.4],
]) {
  slab(M.neighbor, x - w / 2, x + w / 2, z - d / 2, z + d / 2, 0, h);
  slab(M.stuccoWarm, x - w / 2 - 0.5, x + w / 2 + 0.5, z - d / 2 - 0.5, z + d / 2 + 0.5, h, h + 0.4);
  slab(M.glass, x - w / 2 + 1, x + w / 2 - 1, z - d / 2 - 0.06, z - d / 2 + 0.06, 1.2, h - 1.2);
  hedge(x - w / 2, x + w / 2, z - d / 2 - 5, z - d / 2 - 3.6, 1.6);
}
// Hillside estates below the ridge — extra swing anchors
for (const [x, z, w, d, h] of [
  [-58, -46, 20, 16, 8], [56, -52, 22, 16, 8], [-86, -74, 24, 18, 9], [78, -80, 20, 18, 9],
]) {
  const g = terrainHeight(x, z);
  slab(M.neighbor, x - w / 2, x + w / 2, z - d / 2, z + d / 2, g - 8, g + h);
  slab(M.stuccoWarm, x - w / 2 - 0.5, x + w / 2 + 0.5, z - d / 2 - 0.5, z + d / 2 + 0.5, g + h, g + h + 0.4);
  slab(M.glass, x - w / 2 + 1.5, x + w / 2 - 1.5, z + d / 2 - 0.06, z + d / 2 + 0.06, g + 1, g + h - 1);
  slab(M.glass, x - w / 2 + 1.5, x + w / 2 - 1.5, z - d / 2 - 0.06, z - d / 2 + 0.06, g + 1, g + h - 1);
  slab(M.poolTile, x - 7, x + 7, z + d / 2 + 3, z + d / 2 + 9, g - 0.6, g + 0.1);
  slab(M.deck, x - 10, x + 10, z + d / 2, z + d / 2 + 12, g - 3, g - 0.6);
}
// Downtown far away in the marine layer
for (const [x, z, w, h] of [
  [-40, -340, 20, 76], [-8, -352, 24, 98], [26, -336, 18, 62], [58, -358, 22, 84],
  [-74, -348, 18, 58], [92, -342, 20, 70], [10, -390, 26, 112], [-110, -366, 22, 66],
  [128, -374, 24, 80], [-150, -352, 20, 60],
]) {
  const g = terrainHeight(x, z);
  slab(M.tower, x - w / 2, x + w / 2, z - w / 2, z + w / 2, g - 10, g + h);
  slab(M.glass, x - w / 2 + 1, x + w / 2 - 1, z - w / 2 - 0.1, z - w / 2 + 0.1, g + 6, g + h - 6);
}

flushKits();

// ---------------------------------------------------------------------------
// Water surfaces (non-colliding, added straight to the scene)
// ---------------------------------------------------------------------------
const waterMat = new THREE.MeshPhysicalMaterial({
  color: 0x2ba6d6,
  transparent: true,
  opacity: 0.74,
  roughness: 0.06,
  metalness: 0.04,
  normalMap: waterN,
  normalScale: new THREE.Vector2(0.22, 0.22),
  clearcoat: 1,
  clearcoatRoughness: 0.06,
});
const poolWater = new THREE.Mesh(
  withUV2(new THREE.PlaneGeometry(PLX1 - PLX0 - 0.02, PLZ1 - PLZ0 - 0.02, 60, 30)),
  waterMat
);
poolWater.rotation.x = -Math.PI / 2;
poolWater.position.set((PLX0 + PLX1) / 2, WATER_Y, (PLZ0 + PLZ1) / 2);
poolWater.receiveShadow = true;
scene.add(poolWater);

const spaWater = new THREE.Mesh(
  withUV2(new THREE.PlaneGeometry(SPA_X1 - SPA_X0 - 0.7, SPA_Z1 - SPA_Z0 - 0.7, 20, 20)),
  waterMat.clone()
);
spaWater.rotation.x = -Math.PI / 2;
spaWater.position.set((SPA_X0 + SPA_X1) / 2, SPA_RIM - 0.14, (SPA_Z0 + SPA_Z1) / 2);
scene.add(spaWater);

const entryWater = new THREE.Mesh(withUV2(new THREE.PlaneGeometry(3.0, 5.6, 20, 30)), waterMat.clone());
entryWater.rotation.x = -Math.PI / 2;
entryWater.position.set(5.9, FLOOR - 0.16, 16.2);
scene.add(entryWater);

// Sheet of water spilling over the infinity edge
const spill = new THREE.Mesh(
  new THREE.PlaneGeometry(PLX1 - PLX0, 0.6),
  new THREE.MeshPhysicalMaterial({
    color: 0xcdeef8, transparent: true, opacity: 0.5, roughness: 0.1,
    clearcoat: 1, side: THREE.DoubleSide, depthWrite: false
  })
);
spill.position.set((PLX0 + PLX1) / 2, WATER_Y - 0.28, PLZ0 - 0.16);
scene.add(spill);

// ---------------------------------------------------------------------------
// Living-room TV (animated) — mounted on the media wall, facing the sofas
// ---------------------------------------------------------------------------
const tvCanvas = document.createElement('canvas');
tvCanvas.width = 1024;
tvCanvas.height = 512;
const tvCtx = tvCanvas.getContext('2d');
const tvTex = new THREE.CanvasTexture(tvCanvas);
tvTex.colorSpace = THREE.SRGBColorSpace;
tvTex.anisotropy = maxAniso;
const tvMat = new THREE.MeshStandardMaterial({
  map: tvTex,
  emissiveMap: tvTex,
  emissive: new THREE.Color(0xffffff),
  emissiveIntensity: 0.85,
  roughness: 0.12,
  metalness: 0.02,
});
const tvFrame = new THREE.Mesh(withUV2(new THREE.BoxGeometry(0.08, 1.5, 2.6)), M.black);
tvFrame.position.set(PX_W + 0.48, FLOOR + 1.85, -7.5);
tvFrame.castShadow = true;
tvFrame.receiveShadow = true;
world.add(tvFrame);
const tvScreen = new THREE.Mesh(withUV2(new THREE.PlaneGeometry(2.44, 1.36)), tvMat);
tvScreen.position.set(PX_W + 0.53, FLOOR + 1.85, -7.5);
tvScreen.rotation.y = Math.PI / 2;
world.add(tvScreen);

// ---------------------------------------------------------------------------
// Interior lighting — the roof is closed, so the rooms need fill light
// ---------------------------------------------------------------------------
for (const [x, y, z, intensity, color] of [
  [-4.5, 3.2, -7.0, 70, 0xffe9c9],   // living
  [2.0, 2.8, -1.4, 55, 0xffeed6],    // dining
  [10.5, 2.7, -5.5, 55, 0xfff0dc],   // kitchen
  [0.0, 3.0, 9.6, 34, 0xffe6c0],     // foyer
  [-12.6, 3.1, -6.0, 45, 0xffe4bc],  // master
  [-12.6, 3.1, 8.4, 34, 0xffe4bc],   // guest room
  [5.0, 3.0, 9.6, 30, 0xfff1de],     // guest bath
  [-14.0, 3.0, 0.3, 30, 0xfff1de],   // master bath
]) {
  const l = new THREE.PointLight(color, intensity, 18, 2);
  l.position.set(x, y, z);
  scene.add(l);
}
// Warm glow from the fire pit
const fireLight = new THREE.PointLight(0xff7a2a, 12, 14, 2);
fireLight.position.set(-14.2, FLOOR + 0.9, -22.0);
scene.add(fireLight);

// ---------------------------------------------------------------------------
// Traffic on the street
// ---------------------------------------------------------------------------
const traffic = [
  { mesh: buildCar('coupe', 0xa8231c), x: -180, z: 69.5, speed: 15.5, dir: 1 },
  { mesh: buildCar('suv', 0x1b1d21, { metallic: false }), x: -60, z: 69.5, speed: 11.0, dir: 1 },
  { mesh: buildCar('sedan', 0xeae7e0, { metallic: false }), x: 70, z: 69.5, speed: 12.6, dir: 1 },
  { mesh: buildCar('sedan', 0x27303e), x: 170, z: 76.5, speed: 12.0, dir: -1 },
  { mesh: buildCar('coupe', 0x93a0ad), x: 30, z: 76.5, speed: 13.8, dir: -1 },
  { mesh: buildCar('suv', 0x5f6b57), x: -110, z: 76.5, speed: 11.4, dir: -1 },
];
for (const c of traffic) {
  c.mesh.position.set(c.x, 0.02, c.z);
  c.mesh.rotation.y = c.dir > 0 ? 0 : Math.PI;
  scene.add(c.mesh);
}

// ---------------------------------------------------------------------------
// Engine hookup
// ---------------------------------------------------------------------------
const rays = {
  ray: new THREE.Raycaster(),
  tempMatrix: new THREE.Matrix4(),
  normalMatrix: new THREE.Matrix3(),
  tmpNormal: new THREE.Vector3(),
};
const down = new THREE.Vector3(0, -1, 0);

function castFn(origin, dir, far) {
  rays.ray.set(origin, dir);
  rays.ray.far = far;
  const hit = rays.ray.intersectObjects(world.children, true)[0];
  if (!hit) return null;
  let normal = null;
  if (hit.face?.normal) {
    rays.tmpNormal.copy(hit.face.normal);
    if (hit.object.isInstancedMesh && hit.instanceId !== undefined) {
      hit.object.getMatrixAt(hit.instanceId, rays.tempMatrix);
      rays.tempMatrix.premultiply(hit.object.matrixWorld);
      rays.normalMatrix.getNormalMatrix(rays.tempMatrix);
      rays.tmpNormal.applyMatrix3(rays.normalMatrix).normalize();
    } else {
      rays.tmpNormal.transformDirection(hit.object.matrixWorld).normalize();
    }
    normal = rays.tmpNormal.clone();
  }
  return { point: hit.point.clone(), normal, distance: hit.distance };
}

function groundFn(x, z, yFrom, feetY) {
  rays.ray.set(new THREE.Vector3(x, yFrom, z), down);
  rays.ray.far = 160;
  const hits = rays.ray.intersectObjects(world.children, true);
  // The site terrain runs flat under the whole property, so it has to be
  // ignored over the pool — otherwise you walk on an invisible floor at water
  // level instead of stepping down into the basin.
  const overPool = x > PLX0 && x < PLX1 && z > PLZ0 && z < PLZ1;
  for (const h of hits) {
    if (overPool && h.object === terrain) continue;
    if (h.point.y <= feetY + 0.75) return h.point.y + 0.02;
  }
  // Fall back to the analytic terrain so nobody walks on invisible ground.
  if (Math.abs(x) < 440 && Math.abs(z) < 440) return terrainHeight(x, z) + 0.02;
  return null;
}

const bw = buildCityBoxes(world);
let player = null;
const ctrl = new Controller(bw, groundFn, castFn, {
  onReset: () => {
    ctrl.rescueTo(spawnPoint);
  },
  onLand: impact => {
    if (player) player.onLand(impact);
  },
});
// Spawn on the entry walk, facing the front door.
const spawnPoint = new THREE.Vector3(0, FLOOR + 1.4, 18.5);
ctrl.rescueTo(spawnPoint);

const rig = new CameraRig(camera, bw);
const input = new Input(renderer.domElement);

player = new Player(scene);
await player.load('girl', girlMatFor);

const forward = new THREE.Vector3();
const clock = new THREE.Clock();
// game logic must not depend on pointer lock (headless/automated preview can't lock):
// `started` drives ctrl.update unconditionally; `paused` only engages once a real
// lock has actually been used and then dropped (e.g. Escape), so a normal desktop
// player still gets the expected pause-on-unlock behaviour.
let started = false, usedLock = false, paused = false;

function updateAvatar(dt) {
  if (!player) return;
  player.update({
    dt,
    mode: ctrl.mode,
    pos: ctrl.pos,
    vel: ctrl.vel,
    webOn: ctrl.webOn,
    webHand: ctrl.webHand,
    anchor: ctrl.anchor,
    ropeSlack: ctrl.webOn ? Math.max(0, ctrl.pos.distanceTo(ctrl.anchor) - ctrl.ropeLen) : 0,
  });
}

function updateHud() {
  hudMode.textContent = ctrl.mode;
  hudSpeed.textContent = Math.round(ctrl.vel.length() * 3.6).toString();
  hudHeight.textContent = ctrl.pos.y.toFixed(1);
}

function drawTv(t) {
  const w = tvCanvas.width, h = tvCanvas.height;
  tvCtx.fillStyle = '#8ec3ff';
  tvCtx.fillRect(0, 0, w, h);
  tvCtx.fillStyle = '#6ea25f';
  tvCtx.fillRect(0, h * 0.55, w, h * 0.45);
  tvCtx.fillStyle = '#ffffff';
  tvCtx.font = 'bold 46px Arial';
  tvCtx.fillText('DOCUMENTAIRE ANIMALIER', 180, 68);
  tvCtx.font = '30px Arial';
  tvCtx.fillText('Savane en direct', 42, 112);
  const animalX = 220 + Math.sin(t * 0.7) * 170;
  tvCtx.fillStyle = '#50361f';
  tvCtx.fillRect(animalX, 298, 210, 62);
  tvCtx.fillRect(animalX + 42, 256, 66, 64);
  tvCtx.fillRect(animalX + 178, 238, 42, 84);
  tvCtx.fillStyle = '#2f1d12';
  tvCtx.fillRect(animalX + 12, 358, 18, 70);
  tvCtx.fillRect(animalX + 62, 358, 18, 70);
  tvCtx.fillRect(animalX + 130, 358, 18, 70);
  tvCtx.fillRect(animalX + 182, 358, 18, 70);
  tvCtx.fillStyle = '#f7e9c8';
  tvCtx.beginPath();
  tvCtx.arc(animalX + 202, 250, 13, 0, Math.PI * 2);
  tvCtx.fill();
  tvTex.needsUpdate = true;
}

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(0.033, clock.getDelta());

  if (started && !paused) {
    input.updateLook(dt);
    const cp = Math.cos(input.pitch);
    forward.set(-Math.sin(input.yaw) * cp, Math.sin(input.pitch), -Math.cos(input.yaw) * cp).normalize();
    ctrl.update(dt, input, input.yaw, forward);
    if (ctrl.pos.y < -60) ctrl.rescueTo(spawnPoint);
  }

  const t = clock.elapsedTime;
  drawTv(t);

  waterN.offset.x = t * 0.016;
  waterN.offset.y = -t * 0.01;
  poolWater.material.opacity = 0.76 + Math.sin(t * 1.3) * 0.03;
  spaWater.position.y = SPA_RIM - 0.14 + Math.sin(t * 1.9) * 0.008;
  spill.material.opacity = 0.4 + Math.sin(t * 2.6) * 0.06;
  fireLight.intensity = 11 + Math.sin(t * 7.3) * 2.4 + Math.sin(t * 2.1) * 1.5;

  for (const c of traffic) {
    c.mesh.position.x += c.speed * c.dir * dt;
    if (c.dir > 0 && c.mesh.position.x > 200) c.mesh.position.x = -200;
    if (c.dir < 0 && c.mesh.position.x < -200) c.mesh.position.x = 200;
  }
  rollCars(traffic, dt);

  updateAvatar(dt);
  rig.update(dt, input, ctrl);
  updateHud();
  renderer.render(scene, camera);
  input.endFrame();
}
animate();

startBtn.addEventListener('click', () => {
  overlay.style.display = 'none';
  started = true;
  paused = false;
  renderer.domElement.requestPointerLock();
});

document.addEventListener('pointerlockchange', () => {
  usedLock = usedLock || document.pointerLockElement !== null;
  if (!usedLock) return;
  paused = !input.locked;
  overlay.style.display = paused ? 'flex' : 'none';
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// Inspection hook: lets tooling (and the console) frame the villa for shots.
window.__villa = { THREE, scene, camera, renderer, world, ctrl, rig, input, spawnPoint };
