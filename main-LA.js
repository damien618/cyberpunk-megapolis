import * as THREE from 'three';
import { Player } from './player.js?v=4';
import { Input } from './input.js';
import { Controller } from './controller.js?v=3';
import { CameraRig } from './cameraRig.js?v=3';
import { buildCityBoxes } from './cityBoxes.js?v=3';
import { buildCar, carBounds, rollCars, setCarLightsNight } from './cars.js?v=2';

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
  // Double-sided so the inside of the sink bowls reads as brushed steel.
  steelIn: new THREE.MeshStandardMaterial({
    color: 0xc4ccd3, roughness: 0.3, metalness: 0.72, side: THREE.DoubleSide
  }),
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
  tower: new THREE.MeshStandardMaterial({ color: 0xa9bccb, roughness: 0.52, metalness: 0.24 }),
  towerDark: new THREE.MeshStandardMaterial({ color: 0x5b6b7c, roughness: 0.42, metalness: 0.38 }),
  towerTrim: new THREE.MeshStandardMaterial({ color: 0x6f7b88, roughness: 0.44, metalness: 0.46 }),
  lobbyGlass: new THREE.MeshStandardMaterial({ color: 0x2f3c48, roughness: 0.14, metalness: 0.42 }),
  towerGlass: new THREE.MeshPhysicalMaterial({
    color: 0x9fc5df, roughness: 0.1, metalness: 0.0,
    transparent: true, opacity: 0.24, depthWrite: false,
    clearcoat: 1, clearcoatRoughness: 0.08, side: THREE.DoubleSide
  }),
  towerGlassShadow: new THREE.MeshPhysicalMaterial({
    color: 0x4f6478, roughness: 0.2, metalness: 0.0,
    transparent: true, opacity: 0.34, depthWrite: false,
    clearcoat: 0.7, clearcoatRoughness: 0.14, side: THREE.DoubleSide
  }),
  towerGlassLit: new THREE.MeshPhysicalMaterial({
    color: 0xd8e6f4, roughness: 0.14, metalness: 0.0,
    emissive: 0xb7d2ff, emissiveIntensity: 0.26,
    transparent: true, opacity: 0.28, depthWrite: false,
    clearcoat: 1, clearcoatRoughness: 0.08, side: THREE.DoubleSide
  }),
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
  // Open-top tapered square tube: with a 45° yaw the section is axis-aligned,
  // 1×1 at the rim and 0.7×0.7 at the base — the kitchen sink bowls.
  bowl: withUV2(new THREE.CylinderGeometry(0.70711, 0.49497, 1, 4, 1, true).translate(0, 0.5, 0)),
  // Half torus in the XY plane — the gooseneck bend of the kitchen faucets.
  arc: withUV2(new THREE.TorusGeometry(0.14, 0.017, 10, 20, Math.PI)),
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
const URBAN_Y = -41;   // downtown district sits on a flat urban plate
function terrainHeight(x, z) {
  const drop = THREE.MathUtils.smoothstep(-z, 26, 96);          // canyon on -Z
  const side = THREE.MathUtils.smoothstep(Math.abs(x), 48, 140); // ridges left/right
  let h = -drop * 38 - side * 9;
  const rough = drop + side;
  if (rough > 0.001) {
    h += (Math.sin(x * 0.021) * 2.4 + Math.cos(z * 0.017) * 2.0 + Math.sin((x + z) * 0.011) * 1.6) * rough;
  }
  // flatten the far basin so the skyline stands on streets, not on a lawn
  const urban = THREE.MathUtils.smoothstep(-z, 250, 310);
  return THREE.MathUtils.lerp(h, URBAN_Y, urban);
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
// Slab with a rectangular hole, emitted as four boxes (back/front strips span
// the full width, left/right fill the gaps beside the hole). Used to cut the
// countertop and the cabinet top around the sink so the bowls show real depth.
function holedTop(mat, cx, cy, cz, w, h, d, hcx, hcz, hw, hd) {
  const x0 = cx - w / 2, z0 = cz - d / 2;
  const hx0 = hcx - hw / 2, hx1 = hcx + hw / 2, hz0 = hcz - hd / 2, hz1 = hcz + hd / 2;
  box(mat, cx, cy, (z0 + hz0) / 2, w, h, hz0 - z0);            // back strip
  box(mat, cx, cy, (hz1 + z0 + d) / 2, w, h, z0 + d - hz1);    // front strip
  box(mat, (x0 + hx0) / 2, cy, hcz, hx0 - x0, h, hd);          // left
  box(mat, (hx1 + x0 + w) / 2, cy, hcz, x0 + w - hx1, h, hd);  // right
}
// Inset double-bowl sink. The counter and cabinet are cut by the caller around
// a 0.96×0.54 opening, so the tapered steel bowls genuinely descend below the
// countertop. `top` is the counter surface height; the faucet deck is at -Z.
function detailedKitchenSink(x, z, top, { drainer = false, faucetOffsetX = 0.02 } = {}) {
  const HW = 0.96, HD = 0.54;                                    // cutout size
  // Slim topmount flange framing the cutout.
  box(M.steel, x, top + 0.003, z - HD / 2 - 0.014, HW + 0.056, 0.006, 0.028);
  box(M.steel, x, top + 0.003, z + HD / 2 + 0.014, HW + 0.056, 0.006, 0.028);
  box(M.steel, x - HW / 2 - 0.014, top + 0.003, z, 0.028, 0.006, HD - 0.028);
  box(M.steel, x + HW / 2 + 0.014, top + 0.003, z, 0.028, 0.006, HD - 0.028);
  // Dark reveal just inside the cutout — the undermount shadow gap.
  box(M.black, x, top - 0.008, z - HD / 2 + 0.03, HW, 0.016, 0.06);
  box(M.black, x, top - 0.008, z + HD / 2 - 0.03, HW, 0.016, 0.06);
  box(M.black, x - HW / 2 + 0.03, top - 0.008, z, 0.06, 0.016, HD - 0.12);
  box(M.black, x + HW / 2 - 0.03, top - 0.008, z, 0.06, 0.016, HD - 0.12);
  for (const bx of [-0.23, 0.23]) {
    const cx = x + bx;
    shape(G.bowl, M.steelIn, cx, top - 0.19, z, 0.42, 0.19, 0.46, { ry: Math.PI / 4 }); // tapered bowl
    box(M.steelIn, cx, top - 0.187, z, 0.28, 0.004, 0.3);      // bowl floor
    shape(G.cyl, M.steel, cx, top - 0.1848, z, 0.09, 0.0016, 0.09);  // drain flange
    shape(G.cyl, M.black, cx, top - 0.1838, z, 0.07, 0.0016, 0.07);  // drain hole
    box(M.black, cx, top - 0.045, z - 0.215, 0.1, 0.012, 0.004);     // overflow slot
  }
  // Welded full-height divider between the bowls + steel floor for the
  // widening gap below it (the bowls taper inward).
  box(M.steel, x, top - 0.08, z, 0.05, 0.16, 0.38);
  box(M.steelIn, x, top - 0.17, z, 0.17, 0.02, 0.3);
  if (drainer) {
    for (let i = 0; i < 6; i++) {                                // grooves milled in the counter
      const dz = -0.175 + i * 0.07;
      box(M.marbleDark, x + 0.66, top + 0.0012, z + dz, 0.22, 0.0016, 0.012);
    }
  }
  // Gooseneck mixer on the deck behind the cutout.
  const fx = x + faucetOffsetX, fz = z - HD / 2 - 0.045;
  shape(G.cylBase, M.bronze, fx, top, fz, 0.05, 0.012, 0.05);          // escutcheon
  shape(G.cylBase, M.bronze, fx, top + 0.012, fz, 0.042, 0.2, 0.042);  // riser
  shape(G.arc, M.bronze, fx, top + 0.212, fz + 0.14, 1, 1, 1, { ry: Math.PI / 2 }); // bend
  shape(G.cyl, M.bronze, fx, top + 0.177, fz + 0.28, 0.034, 0.07, 0.034); // spout
  shape(G.cyl, M.black, fx, top + 0.14, fz + 0.28, 0.03, 0.008, 0.03);    // aerator
  shape(G.cyl, M.bronze, fx + 0.03, top + 0.1, fz, 0.034, 0.024, 0.034, { rz: Math.PI / 2 }); // mixer hub
  box(M.bronze, fx + 0.042, top + 0.14, fz, 0.012, 0.08, 0.02);        // lever
}
// Base cabinets + counter run of `len` along local X, `depth` along local Z.
function counterRun(len, depth = 0.66, { uppers = 0, sink = false, cooktop = false } = {}) {
  if (sink) {
    // Cabinet + marble top are cut around the sink so the bowls read as real depth.
    box(M.cabinet, 0, F + 0.375, 0, len, 0.65, depth);           // below the bowls
    holedTop(M.cabinet, 0, F + 0.765, 0, len, 0.13, depth, 0, 0, 0.96, 0.54);
    holedTop(M.marble, 0, F + 0.87, 0, len + 0.04, 0.06, depth + 0.04, 0, 0, 0.96, 0.54);
    detailedKitchenSink(0, 0, F + 0.9, { drainer: true, faucetOffsetX: 0.02 });
  } else {
    box(M.cabinet, 0, F + 0.44, 0, len, 0.78, depth);
    box(M.marble, 0, F + 0.87, 0, len + 0.04, 0.06, depth + 0.04);
  }
  box(M.bronze, 0, F + 0.06, depth / 2 - 0.05, len, 0.12, 0.06);
  const n = Math.max(1, Math.round(len / 0.8));
  for (let i = 1; i < n; i++) box(M.bronze, -len / 2 + (len * i) / n, F + 0.44, depth / 2 + 0.01, 0.015, 0.68, 0.015);
  if (cooktop) box(M.black, 0, F + 0.905, 0, 0.86, 0.02, 0.5);
  if (uppers > 0) {
    box(M.cabinet, 0, F + 2.05, -depth / 2 + 0.19, uppers, 0.72, 0.38);
    box(M.marbleDark, 0, F + 1.32, -depth / 2 + 0.02, uppers, 0.82, 0.04);   // backsplash
  }
}
function kitchenIsland(len, wid) {
  box(M.walnut, 0, F + 0.375, 0, wid, 0.65, len);                // below the bowls
  holedTop(M.walnut, 0, F + 0.765, 0, wid, 0.13, len, 0.08, 1.3, 0.96, 0.54);
  box(M.bronze, 0, F + 0.06, 0, wid - 0.1, 0.12, len - 0.1);
  holedTop(M.marble, 0, F + 0.9, 0, wid + 0.5, 0.08, len + 0.1, 0.08, 1.3, 0.96, 0.54);
  // Sink at the east end of the island so the middle stays clear: the flipped
  // frame puts the faucet deck on the end, facing the cooking aisle.
  frame(0.08, 1.3, Math.PI, () =>
    detailedKitchenSink(0, 0, F + 0.94, { drainer: false, faucetOffsetX: 0.02 }));
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
const parkedCars = [];
function parkCar(type, color, x, z, ry, ground, opts) {
  const mesh = buildCar(type, color, opts);
  mesh.position.set(x, ground, z);
  mesh.rotation.y = ry;
  world.add(mesh);
  parkedCars.push(mesh);
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
// Bar stools line the island's south long side (great-room side); the old row
// ran along Z at x=8.5 and two of them clipped through the island cabinet.
for (let i = 0; i < 4; i++) frame(7.9 + i * 1.05, -3.55, 0, () => stool());
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
frame(2.6, 10.5, -Math.PI / 2, () => {
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

const STREET_NEIGHBORS = [
  [-72, 104, 26, 20, 7.5], [-30, 106, 22, 18, 6.5], [18, 104, 24, 20, 8.5],
  [64, 102, 26, 18, 7.0], [110, 106, 22, 20, 6.8], [-118, 104, 24, 18, 7.4],
];
for (const [x, z, w, d, h] of STREET_NEIGHBORS) {
  slab(M.neighbor, x - w / 2, x + w / 2, z - d / 2, z + d / 2, 0, h);
  slab(M.stuccoWarm, x - w / 2 - 0.5, x + w / 2 + 0.5, z - d / 2 - 0.5, z + d / 2 + 0.5, h, h + 0.4);
  slab(M.glass, x - w / 2 + 1, x + w / 2 - 1, z - d / 2 - 0.06, z - d / 2 + 0.06, 1.2, h - 1.2);
  hedge(x - w / 2, x + w / 2, z - d / 2 - 5, z - d / 2 - 3.6, 1.6);
}
// Hillside estates below the ridge — extra swing anchors
const HILLSIDE_ESTATES = [
  [-58, -46, 20, 16, 8], [56, -52, 22, 16, 8], [-86, -74, 24, 18, 9], [78, -80, 20, 18, 9],
];
for (const [x, z, w, d, h] of HILLSIDE_ESTATES) {
  const g = terrainHeight(x, z);
  slab(M.neighbor, x - w / 2, x + w / 2, z - d / 2, z + d / 2, g - 8, g + h);
  slab(M.stuccoWarm, x - w / 2 - 0.5, x + w / 2 + 0.5, z - d / 2 - 0.5, z + d / 2 + 0.5, g + h, g + h + 0.4);
  slab(M.glass, x - w / 2 + 1.5, x + w / 2 - 1.5, z + d / 2 - 0.06, z + d / 2 + 0.06, g + 1, g + h - 1);
  slab(M.glass, x - w / 2 + 1.5, x + w / 2 - 1.5, z - d / 2 - 0.06, z - d / 2 + 0.06, g + 1, g + h - 1);
  slab(M.poolTile, x - 7, x + 7, z + d / 2 + 3, z + d / 2 + 9, g - 0.6, g + 0.1);
  slab(M.deck, x - 10, x + 10, z + d / 2, z + d / 2 + 12, g - 3, g - 0.6);
}
// Downtown far away in the marine layer — LA/SF financial-district towers
// standing on an asphalt street grid (terrain is flattened under the district).
slab(M.asphalt, -230, 210, -434, -312, URBAN_Y - 0.5, URBAN_Y + 0.1);
// sidewalk / avenue bands breaking up the asphalt
for (const zz of [-330, -362, -396]) slab(M.concrete, -230, 210, zz - 3.2, zz + 3.2, URBAN_Y - 0.4, URBAN_Y + 0.16);
for (const xx of [-130, -58, -24, 42, 76, 110]) slab(M.concrete, xx - 3, xx + 3, -434, -312, URBAN_Y - 0.4, URBAN_Y + 0.15);

function litRatio(x, z, row, col) {
  const v = Math.sin(x * 0.17 + z * 0.11 + row * 1.71 + col * 2.37) * 43758.5453;
  return v - Math.floor(v);
}
function facadeWindowsX(x0, x1, zFace, dir, y0, y1, rows, cols, xSeed, zSeed) {
  const mx = 0.55, my = 0.5;
  const paneZ0 = zFace - 0.03, paneZ1 = zFace + 0.03;
  const spanX = x1 - x0 - mx * 2;
  const spanY = y1 - y0 - my * 2;
  if (spanX < 1.2 || spanY < 2.2) return;
  const stepX = spanX / cols;
  const stepY = spanY / rows;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (litRatio(xSeed, zSeed, r, c) < 0.1) continue;
      const wx0 = x0 + mx + c * stepX + 0.12;
      const wx1 = x0 + mx + (c + 1) * stepX - 0.12;
      const wy0 = y0 + my + r * stepY + 0.1;
      const wy1 = y0 + my + (r + 1) * stepY - 0.1;
      if (wx1 - wx0 < 0.22 || wy1 - wy0 < 0.28) continue;
      const lit = litRatio(xSeed * 0.7, zSeed * 1.1, r + 11, c + 7) > 0.84;
      slab(lit ? M.towerGlassLit : M.towerGlass, wx0, wx1, paneZ0, paneZ1, wy0, wy1);
      const sh0 = wy1 - (wy1 - wy0) * 0.38;
      slab(M.towerGlassShadow, wx0, wx1, paneZ0 + dir * 0.01, paneZ1 + dir * 0.01, sh0, wy1 - 0.02);
    }
  }
  for (let c = 1; c < cols; c++) {
    const sx = x0 + mx + c * stepX;
    slab(M.towerTrim, sx - 0.06, sx + 0.06, zFace - 0.09, zFace + 0.09, y0 + 0.2, y1 - 0.2);
  }
}
function facadeWindowsZ(z0, z1, xFace, dir, y0, y1, rows, cols, xSeed, zSeed) {
  const mz = 0.55, my = 0.5;
  const paneX0 = xFace - 0.03, paneX1 = xFace + 0.03;
  const spanZ = z1 - z0 - mz * 2;
  const spanY = y1 - y0 - my * 2;
  if (spanZ < 1.2 || spanY < 2.2) return;
  const stepZ = spanZ / cols;
  const stepY = spanY / rows;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (litRatio(xSeed, zSeed, r + 3, c + 5) < 0.1) continue;
      const wz0 = z0 + mz + c * stepZ + 0.12;
      const wz1 = z0 + mz + (c + 1) * stepZ - 0.12;
      const wy0 = y0 + my + r * stepY + 0.1;
      const wy1 = y0 + my + (r + 1) * stepY - 0.1;
      if (wz1 - wz0 < 0.22 || wy1 - wy0 < 0.28) continue;
      const lit = litRatio(xSeed * 1.2, zSeed * 0.8, r + 17, c + 2) > 0.84;
      slab(lit ? M.towerGlassLit : M.towerGlass, paneX0, paneX1, wz0, wz1, wy0, wy1);
      const sh0 = wy1 - (wy1 - wy0) * 0.38;
      slab(M.towerGlassShadow, paneX0 + dir * 0.01, paneX1 + dir * 0.01, wz0, wz1, sh0, wy1 - 0.02);
    }
  }
  for (let c = 1; c < cols; c++) {
    const sz = z0 + mz + c * stepZ;
    slab(M.towerTrim, xFace - 0.09, xFace + 0.09, sz - 0.06, sz + 0.06, y0 + 0.2, y1 - 0.2);
  }
}
// Window grid on all four faces of a shaft volume, ~3.4 m floor pitch.
function shaftWindows(x0, x1, z0, z1, y0, y1, sx, sz) {
  const rows = Math.max(4, Math.round((y1 - y0) / 3.4));
  const colsX = Math.max(3, Math.round((x1 - x0) / 2.9));
  const colsZ = Math.max(3, Math.round((z1 - z0) / 2.9));
  facadeWindowsX(x0, x1, z0 + 0.03, -1, y0, y1, rows, colsX, sx, sz);
  facadeWindowsX(x0, x1, z1 - 0.03, 1, y0, y1, rows, colsX, sx + 19, sz - 13);
  facadeWindowsZ(z0, z1, x0 + 0.03, -1, y0, y1, rows, colsZ, sx - 11, sz + 7);
  facadeWindowsZ(z0, z1, x1 - 0.03, 1, y0, y1, rows, colsZ, sx + 5, sz + 23);
}
function downtownTower(x, z, w, d, h, style, dark) {
  const g = terrainHeight(x, z);
  const yTop = g + h;
  const x0 = x - w / 2, x1 = x + w / 2, z0 = z - d / 2, z1 = z + d / 2;
  const shaft = dark ? M.towerDark : M.tower;

  // paved forecourt instead of a bare podium cube
  slab(M.concrete, x0 - 5.5, x1 + 5.5, z0 - 5.5, z1 + 5.5, g - 0.45, g + 0.18);

  // massing: single shaft, or classic FiDi setback (lower block + inset upper)
  let pTop = 0;   // parapet inset
  if (style === 'setback') {
    const mid = g + h * 0.62, ins = 1.8;
    slab(shaft, x0, x1, z0, z1, g, mid);
    shaftWindows(x0, x1, z0, z1, g + 6, mid - 0.8, x, z);
    slab(M.towerTrim, x0 - 0.15, x1 + 0.15, z0 - 0.15, z1 + 0.15, mid, mid + 0.5);   // setback cornice
    slab(shaft, x0 + ins, x1 - ins, z0 + ins, z1 - ins, mid + 0.5, yTop);
    shaftWindows(x0 + ins, x1 - ins, z0 + ins, z1 - ins, mid + 1.3, yTop - 1, x + 31, z + 17);
    pTop = ins;
  } else {
    slab(shaft, x0, x1, z0, z1, g, yTop);
    shaftWindows(x0, x1, z0, z1, g + 6, yTop - 1, x, z);
  }

  // double-height glass lobby wrapped around the base + entrance canopy
  slab(M.lobbyGlass, x0 - 0.15, x1 + 0.15, z0 - 0.15, z1 + 0.15, g + 0.15, g + 5.0);
  slab(M.towerTrim, x0 - 0.7, x1 + 0.7, z0 - 0.7, z1 + 0.7, g + 5.0, g + 5.45);

  // parapet + rooftop mechanical penthouse
  slab(M.towerTrim, x0 + pTop - 0.12, x1 - pTop + 0.12, z0 + pTop - 0.12, z1 - pTop + 0.12, yTop, yTop + 0.7);
  slab(M.towerDark, x - 3.4, x + 3.4, z - 2.5, z + 2.5, yTop + 0.7, yTop + 3.0);
  if (style === 'crown' || style === 'spire') {
    slab(M.towerTrim, x - 0.9, x + 0.9, z - 0.9, z + 0.9, yTop + 3.0, yTop + 10);
  }
  if (style === 'spire') {
    slab(M.towerTrim, x - 0.2, x + 0.2, z - 0.2, z + 0.2, yTop + 10, yTop + 19);
  }

  // strong verticals common on West Coast business towers (Downtown LA / FiDi)
  const finTop = style === 'setback' ? g + h * 0.62 : yTop + 0.4;
  for (const [fx, fz, sx, sz] of [
    [x0 + 0.22, z, 0.18, z1 - z0 - 0.7],
    [x1 - 0.22, z, 0.18, z1 - z0 - 0.7],
    [x, z0 + 0.22, x1 - x0 - 0.7, 0.18],
    [x, z1 - 0.22, x1 - x0 - 0.7, 0.18],
  ]) {
    slab(M.towerTrim, fx - sx / 2, fx + sx / 2, fz - sz / 2, fz + sz / 2, g + 5.45, finTop);
  }
}
const DOWNTOWN_TOWERS = [
  [-40, -340, 22, 20, 82, 'setback', false],
  [-8, -352, 26, 24, 104, 'crown', true],
  [26, -336, 20, 18, 68, 'box', false],
  [58, -358, 24, 22, 90, 'setback', true],
  [-74, -348, 20, 18, 64, 'box', true],
  [92, -342, 22, 20, 76, 'setback', false],
  [10, -390, 28, 26, 118, 'spire', false],
  [-110, -366, 24, 22, 72, 'box', false],
  [128, -374, 26, 24, 86, 'crown', true],
  [-150, -352, 22, 20, 66, 'setback', false],
];
for (const [x, z, w, d, h, style, dark] of DOWNTOWN_TOWERS) downtownTower(x, z, w, d, h, style, dark);

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
const interiorLights = [];
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
  interiorLights.push(l);
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
// Night mode — applied on demand when user starts with "Night" selected
// ---------------------------------------------------------------------------
// Performance: every PointLight is evaluated per fragment by the forward
// renderer, and the first night version added 44 of them (~53 total) — the
// game crawled. The night look is now mostly FAKE light: emissive glow heads
// and additive ground pools drawn as a couple of InstancedMeshes, with real
// point lights only where they genuinely shape the scene (pool, spa, terrace
// corners, driveway spine, car headlights). The sun's shadow pass is also
// switched off. Everything here is night-only; day mode never runs this code.
let nightFx = null;   // per-frame night animation handles (beacon pulse)

// soft radial sprite shared by the fake ground light pools and the moon halo
function makeGlowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 2, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.4, 'rgba(255,255,255,0.42)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function enableNightMode() {
  // Sky & atmosphere — fog reaches past downtown (~400 m from the pool) so
  // the lit skyline stays visible instead of sinking into black haze
  scene.background = new THREE.Color(0x04070e);
  scene.fog = new THREE.Fog(0x07101e, 60, 750);
  renderer.toneMappingExposure = 0.50;
  renderer.shadowMap.enabled = false;

  // Sun below horizon, hemisphere → near-black cool ambient. castShadow off:
  // a dark sun still re-rendered the 2048² shadow map every frame for nothing.
  sun.intensity = 0;
  sun.castShadow = false;
  sun.visible = false;
  hemi.color.set(0x0d1828);
  hemi.groundColor.set(0x050608);
  hemi.intensity = 0.07;
  scene.environmentIntensity = 0.05;

  // Interior rooms — warm glow through windows
  for (const l of interiorLights) l.intensity *= 3.8;

  // Fire pit — more vivid against the dark
  fireLight.color.set(0xff6010);
  fireLight.distance = 22;

  // ── Fake-lamp infrastructure ─────────────────────────────────────────────
  // glow heads (small bright spheres) + ground pools (additive gradient
  // discs), collected as spot lists then drawn as one InstancedMesh each.
  const glowTex = makeGlowTexture();
  const headSpots = [];   // [x, y, z, scale] — G.sphere is r=0.5: scale = 2r
  const discSpots = [];   // [x, y, z, radius] — bright warm pool under a lamp
  const wideSpots = [];   // street-lamp pools: wider, fainter
  const drivewayLights = [];
  const poolLights = [];
  const lamp = (x, y, z, headR, discY, discR) => {
    headSpots.push([x, y, z, headR * 2]);
    discSpots.push([x, discY, z, discR]);
  };
  const _gm = new THREE.Matrix4();
  const addGlow = (spots, mat, geo) => {
    const im = new THREE.InstancedMesh(geo, mat, spots.length);
    spots.forEach(([x, y, z, s], i) => {
      _gm.makeScale(s, s, s).setPosition(x, y, z);
      im.setMatrixAt(i, _gm);
    });
    im.instanceMatrix.needsUpdate = true;
    scene.add(im);
    return im;
  };
  const discGeo = new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2);

  // ── Entry court & driveway bollards: fake glow + 4 real spine lights ────
  for (const [x, z] of [
    [-3.2, 19.6], [3.2, 19.6],
    [-3.2, 16.4], [3.2, 16.4],
    [-8.0, 22.0], [8.0, 22.0],
    [-12.0, 23.0], [12.0, 23.0],
    [-4.0, 30.0], [4.0, 30.0],
    [-4.0, 42.0], [4.0, 42.0],
    [-4.0, 54.0], [4.0, 54.0],
  ]) lamp(x, FLOOR + 0.09, z, 0.09, FLOOR + 0.04, 2.3);
  for (const z of [19.6, 30, 42, 54]) {
    const l = new THREE.PointLight(0xffec9a, 26, 17, 2);
    l.position.set(0, FLOOR + 1.7, z);
    scene.add(l);
    drivewayLights.push(l);
  }

  // ── Infinity pool — underwater LED strip (teal), 2 diagonal real lights ──
  const poolCx = (PLX0 + PLX1) / 2;   // −1
  const poolCz = (PLZ0 + PLZ1) / 2;   // −21
  for (const [ox, oz] of [[-3.5, -2.5], [3.5, 2.5]]) {
    const l = new THREE.PointLight(0x00cce0, 58, 18, 1.5);
    l.position.set(poolCx + ox, WATER_Y - 0.15, poolCz + oz);
    scene.add(l);
    poolLights.push(l);
  }
  // Spa underwater glow
  {
    const l = new THREE.PointLight(0x00b8d8, 30, 10, 1.5);
    l.position.set((SPA_X0 + SPA_X1) / 2, SPA_RIM - 0.2, (SPA_Z0 + SPA_Z1) / 2);
    scene.add(l);
    poolLights.push(l);
  }

  // ── Poolside & terrace: fake bollards, real light at the far corners only ──
  for (const [x, z] of [
    [PLX0 - 1.1, PLZ0 - 0.8], [PLX1 + 1.1, PLZ0 - 0.8],
    [PLX0 - 1.1, PLZ1 + 0.5], [PLX1 + 1.1, PLZ1 + 0.5],
    [(PLX0 + PLX1) / 2, PLZ0 - 1.4],  // infinity-edge centre
    [-16, -22], [16, -22],              // terrace far corners
    [-14.5, -18], [14.5, -18],          // pergola area
  ]) lamp(x, FLOOR + 0.08, z, 0.08, FLOOR + 0.04, 2.1);
  for (const [x, z] of [[-16, -22], [16, -22]]) {
    const l = new THREE.PointLight(0xffd580, 20, 13, 2);
    l.position.set(x, FLOOR + 1.0, z);
    scene.add(l);
    poolLights.push(l);
  }

  // ── Street lamps along the road below — poles + fake heads, no real lights ──
  const poleX = [-160, -114, -68, -22, 24, 70, 116, 162];
  const poles = new THREE.InstancedMesh(G.cyl,
    new THREE.MeshStandardMaterial({ color: 0x23262b, roughness: 0.6, metalness: 0.5 }),
    poleX.length);
  poleX.forEach((x, i) => {
    _gm.makeScale(0.14, 5.2, 0.14).setPosition(x, 2.6, 64.9);
    poles.setMatrixAt(i, _gm);
    headSpots.push([x, 5.3, 64.9, 0.34]);
    wideSpots.push([x, 0.06, 64.9, 5.2]);
  });
  poles.instanceMatrix.needsUpdate = true;
  scene.add(poles);

  // flush the fake lamps (3 draw calls total)
  addGlow(headSpots, new THREE.MeshBasicMaterial({ color: 0xffe2ae }), G.sphere);
  addGlow(discSpots, new THREE.MeshBasicMaterial({
    map: glowTex, color: 0xffc684, transparent: true, opacity: 0.5,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }), discGeo);
  addGlow(wideSpots, new THREE.MeshBasicMaterial({
    map: glowTex, color: 0xffb670, transparent: true, opacity: 0.28,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }), discGeo);

  // ── Background buildings: classic lit windows (zero real lights) ────────
  const winSpots = [];   // [x, y, z, ry, sx, sy, warmCoolMix]
  // hillside estates across the canyon — windows on both faces
  for (const [x, z, w, d] of HILLSIDE_ESTATES) {
    const g = terrainHeight(x, z);
    for (const face of [1, -1]) {
      for (let r = 0; r < 2; r++) {
        for (let c = 0, n = Math.floor((w - 3) / 3); c < n; c++) {
          if (litRatio(x * face, z, r + 5, c + 3) < 0.45) continue;
          winSpots.push([
            x - w / 2 + 2 + c * 3, g + 2.1 + r * 3.1, z + face * (d / 2 + 0.08),
            face > 0 ? 0 : Math.PI, 1.7, 1.4, litRatio(x, z, r, c),
          ]);
        }
      }
    }
  }
  // across-the-street neighbours — facade facing the villa
  for (const [x, z, w, d] of STREET_NEIGHBORS) {
    for (let r = 0; r < 2; r++) {
      for (let c = 0, n = Math.floor((w - 2) / 3); c < n; c++) {
        if (litRatio(x, z, r + 9, c + 1) < 0.42) continue;
        winSpots.push([
          x - w / 2 + 1.5 + c * 3, 2.0 + r * 2.6, z - d / 2 - 0.08,
          Math.PI, 1.6, 1.3, litRatio(x, z, r + 4, c + 8),
        ]);
      }
    }
  }
  {
    const winIm = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: 0xffffff }),
      winSpots.length);
    const q = new THREE.Quaternion(), e = new THREE.Euler();
    const v = new THREE.Vector3(), s = new THREE.Vector3(), m4 = new THREE.Matrix4();
    const warm = new THREE.Color(0xffc27a), cool = new THREE.Color(0xcfe0ff), cc = new THREE.Color();
    winSpots.forEach(([x, y, z, ry, sx, sy, t], i) => {
      q.setFromEuler(e.set(0, ry, 0));
      m4.compose(v.set(x, y, z), q, s.set(sx, sy, 1));
      winIm.setMatrixAt(i, m4);
      winIm.setColorAt(i, cc.lerpColors(warm, cool, t));
    });
    winIm.instanceMatrix.needsUpdate = true;
    winIm.instanceColor.needsUpdate = true;
    scene.add(winIm);
  }

  // ── Downtown towers — lit windows punch through the marine layer ────────
  M.towerGlassLit.emissiveIntensity = 5.2;
  M.towerGlassLit.emissive.set(0xffe090);
  M.towerGlassLit.color.set(0xffebcc);
  M.towerGlassLit.fog = false;            // haze must not swallow lit windows
  M.towerGlassLit.needsUpdate = true;
  M.lobbyGlass.emissive.set(0xffc98a);    // glowing tower lobbies at street level
  M.lobbyGlass.emissiveIntensity = 1.1;

  // rooftop aviation beacons (red pulse driven in animate())
  const beaconMat = new THREE.MeshBasicMaterial({
    color: 0xff2a1e, transparent: true, opacity: 1, fog: false,
  });
  const beacons = new THREE.InstancedMesh(G.sphere, beaconMat, DOWNTOWN_TOWERS.length);
  DOWNTOWN_TOWERS.forEach(([x, z, , , h, style], i) => {
    const yTop = terrainHeight(x, z) + h;
    const y = style === 'spire' ? yTop + 19.4 : style === 'crown' ? yTop + 10.3 : yTop + 3.4;
    _gm.makeScale(3.2, 3.2, 3.2).setPosition(x, y, z);
    beacons.setMatrixAt(i, _gm);
  });
  beacons.instanceMatrix.needsUpdate = true;
  scene.add(beacons);
  // ── Stars — two point layers (dim field + brighter heroes) ──────────────
  for (const [count, size, color, opacity] of [
    [1100, 1.5, 0xbfccff, 0.75],
    [220, 2.6, 0xffffff, 0.95],
  ]) {
    const posArr = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const az = Math.random() * Math.PI * 2;
      const el = Math.asin(0.06 + Math.random() * 0.94);   // keep off the horizon
      posArr[i * 3] = Math.cos(el) * Math.cos(az) * 860;
      posArr[i * 3 + 1] = Math.sin(el) * 860;
      posArr[i * 3 + 2] = Math.cos(el) * Math.sin(az) * 860;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(posArr, 3));
    const p = new THREE.Points(g, new THREE.PointsMaterial({
      color, size, sizeAttenuation: false, transparent: true, opacity,
      fog: false, depthWrite: false,
    }));
    p.frustumCulled = false;
    scene.add(p);
  }

  // ── Moon — canvas-textured disc + additive halo, high over the canyon ───
  {
    const mc = document.createElement('canvas');
    mc.width = mc.height = 256;
    const mg = mc.getContext('2d');
    const mgrad = mg.createRadialGradient(108, 100, 10, 128, 128, 126);
    mgrad.addColorStop(0, '#fdfdf4');
    mgrad.addColorStop(0.75, '#e8e9d8');
    mgrad.addColorStop(1, '#c9cbba');
    mg.fillStyle = mgrad;
    mg.beginPath(); mg.arc(128, 128, 126, 0, Math.PI * 2); mg.fill();
    mg.fillStyle = 'rgba(148,152,140,0.35)';   // maria blotches
    for (const [bx, by, br] of [[96, 92, 26], [150, 120, 32], [118, 160, 22], [168, 84, 16], [86, 140, 14]]) {
      mg.beginPath(); mg.arc(bx, by, br, 0, Math.PI * 2); mg.fill();
    }
    const moonTex = new THREE.CanvasTexture(mc);
    moonTex.colorSpace = THREE.SRGBColorSpace;
    const moon = new THREE.Mesh(
      new THREE.CircleGeometry(30, 48),
      new THREE.MeshBasicMaterial({ map: moonTex, transparent: true, fog: false }));
    moon.position.set(-390, 410, -780);
    moon.lookAt(0, 40, 0);
    scene.add(moon);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTex, color: 0x9fb4e8, transparent: true, opacity: 0.5,
      blending: THREE.AdditiveBlending, fog: false, depthWrite: false,
    }));
    halo.scale.setScalar(190);
    halo.position.copy(moon.position);
    scene.add(halo);
  }

  // ── Car headlights: real lights sweeping the road; hot taillight lenses ──
  setCarLightsNight();

  // Parked cars have their lights off (engines cut) — clone the shared
  // emissive materials so only the traffic fleet stays lit.
  for (const mesh of parkedCars) {
    mesh.traverse(child => {
      if (!child.isMesh) return;
      const mats = Array.isArray(child.material) ? child.material : [child.material];
      const replaced = mats.map(m => {
        if (!m || !(m.emissiveIntensity > 0.05)) return m;
        const c = m.clone();
        c.emissiveIntensity = 0;
        return c;
      });
      child.material = Array.isArray(child.material) ? replaced : replaced[0];
    });
  }

  // Only the two cars nearest the player cast real light. Every vehicle keeps
  // its emissive lenses, so the fleet looks identical while distant headlights
  // no longer enter every material's fragment-light loop.
  const trafficHeadLights = [];
  for (let i = 0; i < 2; i++) {
    const hl = new THREE.PointLight(0xfff5e0, 120, 34, 1.8);
    scene.add(hl);
    trafficHeadLights.push(hl);
  }
  nightFx = { beaconMat, drivewayLights, poolLights, trafficHeadLights, lightZone: '' };
  updateNightLightBudget();
}

function updateNightLightBudget() {
  if (!nightFx) return;
  // Real lights only shape nearby surfaces. The fake emissive heads and light
  // pools remain visible everywhere, so switching sides does not remove detail.
  const lightZone = ctrl.pos.z < 2 ? 'pool' : 'cars';
  if (lightZone === nightFx.lightZone) return;
  nightFx.lightZone = lightZone;
  const poolSide = lightZone === 'pool';
  for (const light of nightFx.poolLights) light.visible = poolSide;
  for (const light of nightFx.drivewayLights) light.visible = !poolSide;
  for (const light of nightFx.trafficHeadLights) light.visible = !poolSide;
  fireLight.visible = poolSide;
}

function updateTrafficHeadlights() {
  if (!nightFx || nightFx.lightZone !== 'cars') return;
  let nearest = null, second = null;
  let nearestD2 = Infinity, secondD2 = Infinity;
  for (const car of traffic) {
    const dx = car.mesh.position.x - ctrl.pos.x;
    const dz = car.mesh.position.z - ctrl.pos.z;
    const distance2 = dx * dx + dz * dz;
    if (distance2 < nearestD2) {
      second = nearest;
      secondD2 = nearestD2;
      nearest = car;
      nearestD2 = distance2;
    } else if (distance2 < secondD2) {
      second = car;
      secondD2 = distance2;
    }
  }
  [nearest, second].forEach((car, i) => {
    const light = nightFx.trafficHeadLights[i];
    light.position.set(car.mesh.position.x + car.dir * 2.5, 0.85, car.mesh.position.z);
  });
}

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

function updateAvatarOutfit() {
  if (!player) return;
  const { x, z } = ctrl.pos;
  const isNight = window.__nightMode === true;
  const isInsideVilla = x > VX0 && x < VX1 && z > VZ0 && z < VZ1;
  const isPoolSide = x > -42 && x < 42 && z < VZ0 && z > -34;

  if (isPoolSide) {
    player.setOutfit({
      hat: false,
      backpack: false,
      pants: false,
      shoes: false,
      longSleeves: isNight,
      swim: true,
    });
  } else if (isInsideVilla) {
    player.setOutfit({
      hat: false,
      backpack: false,
      longSleeves: isNight,
    });
  } else {
    player.setOutfit({
      hat: !isNight,
      longSleeves: isNight,
    });
  }
}

function updateAvatar(dt) {
  if (!player) return;
  updateAvatarOutfit();
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

  // Night only: pulse the downtown aviation beacons and keep only the local
  // pool-side or car-side real-light group active.
  if (nightFx) {
    nightFx.beaconMat.opacity = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * 2.3));
    updateNightLightBudget();
  }

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
  updateTrafficHeadlights();

  updateAvatar(dt);
  rig.update(dt, input, ctrl);
  updateHud();
  renderer.render(scene, camera);
  input.endFrame();
}
animate();

startBtn.addEventListener('click', () => {
  if (window.__nightMode) {
    try {
      enableNightMode();
    } catch (e) {
      window.__nightModeError = e.stack || e.message;
      console.error('[night mode]', e);
    }
  }
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
window.__villa = {
  THREE, scene, camera, renderer, world, ctrl, rig, input, player, spawnPoint, updateAvatarOutfit
};
