import * as THREE from 'three';
import { Player } from './player.js?v=49';
import { harmoniseHair } from './hair.js?v=8';
import { Input } from './input.js';
import { Controller } from './controller.js?v=5';
import { CameraRig } from './cameraRig.js?v=6';
import { buildCityBoxes } from './cityBoxes.js?v=5';
import { buildCar, carBounds } from './cars.js?v=4';
import { makeVisitor, loadVisitorBase, loadGuestRig, STAFF_UNIFORM } from './crowd.js?v=18';
import { loadSpecies, placeAnimal, SPECIES } from './fauna.js?v=31';

// ---------------------------------------------------------------------------
// Visit to a Shinto shrine (Japan) — an authentic Japanese sacred precinct
// and tranquil Zen garden:
//
//   parking lot → Grand Vermilion Torii Gate (大鳥居)
//   → Stone lantern-lined Sando approach (参道)
//   → Chōzuya purification pavilion (手水舎) & Sacred Koi Pond (神池)
//   → Arched red Taiko-bashi bridge (太鼓橋)
//   → Main Shrine Hall (Haiden / Honden 拝殿・本殿) with Shimenawa & Suzu bells
//   → Five-story Pagoda (五重塔) & Zen rock garden (枯山水)
//   → Bamboo grove (竹林), blooming Sakura (桜) with drifting petal particles,
//     and ancient sculpted pines (松).
// ---------------------------------------------------------------------------

const app = document.getElementById('app');
const overlay = document.getElementById('overlay');
const startBtn = document.getElementById('startBtn');
const hudMode = document.getElementById('mode');
const hudSpeed = document.getElementById('speed');
const hudHeight = document.getElementById('height');
const furniturePrompt = document.getElementById('furniturePrompt');
const fadeEl = document.getElementById('fade');

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.7));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.outputColorSpace = THREE.SRGBColorSpace;
app.appendChild(renderer.domElement);

const SKY = 0xcfe0ea;
const scene = new THREE.Scene();
scene.background = new THREE.Color(SKY);
scene.fog = new THREE.Fog(0xd8e6ee, 120, 750);

const camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.25, 2200);
camera.position.set(0, 8, -50);

const hemi = new THREE.HemisphereLight(0xe4f2ff, 0x7a8366, 0.85);
scene.add(hemi);

const sun = new THREE.DirectionalLight(0xfff5e6, 2.7);
sun.position.set(-80, 130, -70);
sun.castShadow = true;
sun.shadow.mapSize.set(3072, 3072);
sun.shadow.camera.left = -110;
sun.shadow.camera.right = 110;
sun.shadow.camera.top = 110;
sun.shadow.camera.bottom = -110;
sun.shadow.camera.near = 20;
sun.shadow.camera.far = 380;
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.035;
scene.add(sun);
sun.target.position.set(0, 4, 30);
scene.add(sun.target);

const loader = new THREE.TextureLoader();
const maxAniso = renderer.capabilities.getMaxAnisotropy();
const pmrem = new THREE.PMREMGenerator(renderer);
pmrem.compileEquirectangularShader();

loader.load('./data/env_equirect.png', t => {
  t.mapping = THREE.EquirectangularReflectionMapping;
  t.colorSpace = THREE.SRGBColorSpace;
  scene.environment = pmrem.fromEquirectangular(t).texture;
  scene.environmentIntensity = 0.65;
  t.dispose();
});

function tex(url, rx = 1, ry = 1) {
  const t = loader.load(url);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(rx, ry);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = maxAniso;
  return t;
}
function ntex(url, rx = 1, ry = 1) {
  const t = loader.load(url);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(rx, ry);
  t.anisotropy = maxAniso;
  return t;
}

// ---------------------------------------------------------------------------
// Textures & Material Library
// ---------------------------------------------------------------------------
const woodDiff = tex('./textures/nature/wood_diff.jpg', 2, 6);
const woodN = ntex('./textures/nature/wood_n.jpg', 2, 6);
const woodR = tex('./textures/nature/wood_r.jpg', 2, 6);

const barkDiff = tex('./textures/nature/bark_diff.jpg', 1, 4);
const barkN = ntex('./textures/nature/bark_n.jpg', 1, 4);

const shingleDiff = tex('./textures/nature/shingle_diff.jpg', 6, 6);
const shingleN = ntex('./textures/nature/shingle_n.jpg', 6, 6);
const shingleRedDiff = tex('./textures/nature/shingle_red_diff.jpg', 4, 4);
const shingleRedN = ntex('./textures/nature/shingle_red_n.jpg', 4, 4);

const paverDiff = tex('./textures/nature/paver_diff.jpg', 12, 12);
const paverN = ntex('./textures/nature/paver_n.jpg', 12, 12);
const paverR = tex('./textures/nature/paver_r.jpg', 12, 12);

const dirtDiff = tex('./textures/nature/dirt_diff.jpg', 10, 10);
const dirtN = ntex('./textures/nature/dirt_n.jpg', 10, 10);

const grassDiff = tex('./textures/la/grass_diffuse.jpg', 16, 16);
const waterN = ntex('./textures/la/water_normal.jpg', 8, 8);

const foliageDiff = tex('./textures/nature/foliage_diff.jpg', 4, 4);
const foliageN = ntex('./textures/nature/foliage_n.jpg', 4, 4);

const asphaltA = tex('./textures/CP_Asphalt_A.webp', 12, 12);
const asphaltN = ntex('./textures/CP_Asphalt_N.webp', 12, 12);

const M = {
  toriiRed: new THREE.MeshStandardMaterial({
    color: 0xd63426, roughness: 0.38, metalness: 0.05,
    map: woodDiff, normalMap: woodN, normalScale: new THREE.Vector2(0.35, 0.35),
  }),
  toriiBlack: new THREE.MeshStandardMaterial({
    color: 0x18191c, roughness: 0.45, metalness: 0.15,
  }),
  templeWood: new THREE.MeshStandardMaterial({
    color: 0x5a3d2c, roughness: 0.65, metalness: 0.05,
    map: woodDiff, normalMap: woodN, roughnessMap: woodR,
  }),
  templeWoodLight: new THREE.MeshStandardMaterial({
    color: 0x9a6b4a, roughness: 0.55, metalness: 0.04,
    map: woodDiff, normalMap: woodN, roughnessMap: woodR,
  }),
  shingleDark: new THREE.MeshStandardMaterial({
    color: 0x2c333a, roughness: 0.72, metalness: 0.1,
    map: shingleDiff, normalMap: shingleN, normalScale: new THREE.Vector2(0.8, 0.8),
  }),
  shingleRed: new THREE.MeshStandardMaterial({
    color: 0xa83428, roughness: 0.68, metalness: 0.08,
    map: shingleRedDiff, normalMap: shingleRedN,
  }),
  stonePaver: new THREE.MeshStandardMaterial({
    color: 0x9fa4a8, roughness: 0.85, metalness: 0.05,
    map: paverDiff, normalMap: paverN, roughnessMap: paverR,
  }),
  stoneLantern: new THREE.MeshStandardMaterial({
    color: 0x8a9094, roughness: 0.9, metalness: 0.04,
    map: paverDiff, normalMap: paverN,
  }),
  zenGravel: new THREE.MeshStandardMaterial({
    color: 0xdedcd6, roughness: 0.95, metalness: 0.02,
    map: dirtDiff, normalMap: dirtN,
  }),
  mossGrass: new THREE.MeshStandardMaterial({
    color: 0x587842, roughness: 0.92, metalness: 0.02,
    map: grassDiff,
  }),
  water: new THREE.MeshPhysicalMaterial({
    color: 0x234a42, roughness: 0.08, metalness: 0.1,
    transmission: 0.75, ior: 1.333, thickness: 1.8,
    transparent: true, opacity: 0.88,
    normalMap: waterN, normalScale: new THREE.Vector2(0.4, 0.4),
  }),
  bridgeRed: new THREE.MeshStandardMaterial({
    color: 0xcc2a1f, roughness: 0.32, metalness: 0.08,
    map: woodDiff, normalMap: woodN,
  }),
  goldGiboshi: new THREE.MeshStandardMaterial({
    color: 0xe6b840, roughness: 0.22, metalness: 0.88,
  }),
  brassBell: new THREE.MeshStandardMaterial({
    color: 0xd4a034, roughness: 0.26, metalness: 0.82,
  }),
  shojiPaper: new THREE.MeshStandardMaterial({
    color: 0xf6f3ea, roughness: 0.92, metalness: 0.0,
  }),
  shimenawa: new THREE.MeshStandardMaterial({
    color: 0xb59e6f, roughness: 0.95, metalness: 0.0,
  }),
  shideWhite: new THREE.MeshStandardMaterial({
    color: 0xffffff, roughness: 0.85, metalness: 0.0,
    side: THREE.DoubleSide,
  }),
  lanternGlow: new THREE.MeshStandardMaterial({
    color: 0xfff3d0, emissive: 0xffaa44, emissiveIntensity: 2.4, roughness: 0.4,
  }),
  sakuraBlossom: new THREE.MeshStandardMaterial({
    color: 0xffc4d8, roughness: 0.75, metalness: 0.0,
    map: foliageDiff, normalMap: foliageN,
    side: THREE.DoubleSide,
  }),
  sakuraBlossomWhite: new THREE.MeshStandardMaterial({
    color: 0xffe8f0, roughness: 0.75, metalness: 0.0,
    map: foliageDiff, normalMap: foliageN,
    side: THREE.DoubleSide,
  }),
  pineFoliage: new THREE.MeshStandardMaterial({
    color: 0x2a4e32, roughness: 0.82, metalness: 0.0,
    map: foliageDiff, normalMap: foliageN,
  }),
  momijiRed: new THREE.MeshStandardMaterial({
    color: 0xc22b18, roughness: 0.78, metalness: 0.0,
    map: foliageDiff, normalMap: foliageN,
    side: THREE.DoubleSide,
  }),
  bambooGreen: new THREE.MeshStandardMaterial({
    color: 0x4f7d36, roughness: 0.48, metalness: 0.08,
  }),
  treeTrunk: new THREE.MeshStandardMaterial({
    color: 0x4e3828, roughness: 0.88, metalness: 0.05,
    map: barkDiff, normalMap: barkN,
  }),
  asphalt: new THREE.MeshStandardMaterial({
    color: 0x32353b, roughness: 0.86, metalness: 0.12,
    map: asphaltA, normalMap: asphaltN,
  }),
  parkingLine: new THREE.MeshStandardMaterial({
    color: 0xffffff, roughness: 0.7, metalness: 0.05,
  }),
};

// ---------------------------------------------------------------------------
// Groups & Instancing Kit
// ---------------------------------------------------------------------------
const world = new THREE.Group();
const scenery = new THREE.Group();
const fauna = new THREE.Group();
const crowd = new THREE.Group();
scene.add(world, scenery, fauna, crowd);

const furnitureInteractions = [];

const kits = new Map();
function emit(geo, mat, x, y, z, sx = 1, sy = 1, sz = 1, rx = 0, ry = 0, rz = 0, isProp = false) {
  let list = kits.get(mat);
  if (!list) kits.set(mat, list = new Map());
  let arr = list.get(geo);
  if (!arr) list.set(geo, arr = { items: [], props: [] });
  arr.items.push({ x, y, z, sx, sy, sz, rx, ry, rz });
  arr.props.push(isProp);
}

function flushKits() {
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(), p = new THREE.Vector3();
  for (const [mat, geos] of kits) {
    for (const [geo, data] of geos) {
      const im = new THREE.InstancedMesh(geo, mat, data.items.length);
      for (let i = 0; i < data.items.length; i++) {
        const it = data.items[i];
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
      if (data.props.some(Boolean)) im.userData.prop = data.props;
      world.add(im);
    }
  }
}

// ---------------------------------------------------------------------------
// Shared Geometries
// ---------------------------------------------------------------------------
const G = {
  box: new THREE.BoxGeometry(1, 1, 1),
  cyl: new THREE.CylinderGeometry(0.5, 0.5, 1, 16),
  cyl8: new THREE.CylinderGeometry(0.5, 0.5, 1, 8),
  sphere: new THREE.SphereGeometry(0.5, 16, 12),
  cone: new THREE.ConeGeometry(0.5, 1, 16),
};

function box(mat, x, y, z, sx, sy, sz, ry = 0, rx = 0, rz = 0, prop = false) {
  emit(G.box, mat, x, y, z, sx, sy, sz, rx, ry, rz, prop);
}
function cylinder(mat, x, y, z, radius, height, ry = 0, rx = 0, rz = 0, prop = false) {
  emit(G.cyl, mat, x, y, z, radius * 2, height, radius * 2, rx, ry, rz, prop);
}

// ---------------------------------------------------------------------------
// 1. Grand Torii Gate (大鳥居)
// ---------------------------------------------------------------------------
function buildTorii(x, y, z, scale = 1, ry = 0) {
  const S = scale;
  const H = 8.5 * S;
  const W = 9.0 * S;
  const colR = 0.42 * S;
  const halfW = W / 2;

  // Base stone plinths (Kamebara)
  cylinder(M.stoneLantern, x - halfW * 0.72, y + 0.35 * S, z, colR * 1.6, 0.7 * S, ry, 0, 0, true);
  cylinder(M.stoneLantern, x + halfW * 0.72, y + 0.35 * S, z, colR * 1.6, 0.7 * S, ry, 0, 0, true);

  // Black copper base cuffs (Nemaki)
  cylinder(M.toriiBlack, x - halfW * 0.72, y + 0.85 * S, z, colR * 1.15, 0.4 * S, ry, 0, 0, true);
  cylinder(M.toriiBlack, x + halfW * 0.72, y + 0.85 * S, z, colR * 1.15, 0.4 * S, ry, 0, 0, true);

  // Main vertical pillars (Hashira)
  cylinder(M.toriiRed, x - halfW * 0.72, y + H * 0.5, z, colR, H, ry, 0, -0.02, true);
  cylinder(M.toriiRed, x + halfW * 0.72, y + H * 0.5, z, colR, H, ry, 0, 0.02, true);

  // Tie-beam (Nuki) passing through
  box(M.toriiRed, x, y + H * 0.74, z, W * 1.12, 0.38 * S, 0.44 * S, ry, 0, 0, true);
  // Wedges on Nuki ends (Kusabi)
  box(M.toriiBlack, x - halfW * 0.72 - 0.28 * S, y + H * 0.74, z, 0.08 * S, 0.52 * S, 0.48 * S, ry, 0, 0, true);
  box(M.toriiBlack, x + halfW * 0.72 + 0.28 * S, y + H * 0.74, z, 0.08 * S, 0.52 * S, 0.48 * S, ry, 0, 0, true);

  // Sub-lintel (Shimaki)
  box(M.toriiRed, x, y + H * 0.94, z, W * 1.18, 0.36 * S, 0.62 * S, ry, 0, 0, true);

  // Curved upper lintel (Kasagi) with upturned ends
  box(M.toriiRed, x, y + H * 1.01, z, W * 1.28, 0.42 * S, 0.72 * S, ry, 0, 0, true);
  // Kasagi black top cover & gold tips
  box(M.toriiBlack, x, y + H * 1.05, z, W * 1.30, 0.12 * S, 0.76 * S, ry, 0, 0, true);
  box(M.goldGiboshi, x - (W * 1.30) / 2 + 0.15 * S, y + H * 1.05, z, 0.32 * S, 0.16 * S, 0.78 * S, ry, 0, 0, true);
  box(M.goldGiboshi, x + (W * 1.30) / 2 - 0.15 * S, y + H * 1.05, z, 0.32 * S, 0.16 * S, 0.78 * S, ry, 0, 0, true);

  // Central vertical plaque tablet (Gakuzuka)
  box(M.toriiBlack, x, y + H * 0.84, z, 0.9 * S, 1.2 * S, 0.14 * S, ry, 0, 0, true);
  box(M.goldGiboshi, x, y + H * 0.84, z + 0.08 * S, 0.7 * S, 0.95 * S, 0.02 * S, ry, 0, 0, true);
}

// ---------------------------------------------------------------------------
// 2. Stone Lantern (Kasuga Tōrō 石灯籠)
// ---------------------------------------------------------------------------
function buildStoneLantern(x, y, z, scale = 1, ry = 0) {
  const S = scale;
  // Stepped stone base (Kiso)
  box(M.stoneLantern, x, y + 0.12 * S, z, 1.0 * S, 0.24 * S, 1.0 * S, ry, 0, 0, true);
  box(M.stoneLantern, x, y + 0.32 * S, z, 0.8 * S, 0.20 * S, 0.8 * S, ry, 0, 0, true);
  // Column shaft (Sao)
  cylinder(M.stoneLantern, x, y + 1.05 * S, z, 0.24 * S, 1.3 * S, ry, 0, 0, true);
  // Middle platform (Chūdai)
  box(M.stoneLantern, x, y + 1.8 * S, z, 0.95 * S, 0.22 * S, 0.95 * S, ry, 0, 0, true);
  // Light chamber (Hibukuro) with glowing window
  box(M.stoneLantern, x, y + 2.25 * S, z, 0.7 * S, 0.65 * S, 0.7 * S, ry, 0, 0, true);
  box(M.lanternGlow, x, y + 2.25 * S, z, 0.52 * S, 0.48 * S, 0.52 * S, ry, 0, 0, false);
  // Roof cap (Kasa) with flared corners
  box(M.stoneLantern, x, y + 2.7 * S, z, 1.2 * S, 0.28 * S, 1.2 * S, ry, 0, 0, true);
  box(M.stoneLantern, x, y + 2.9 * S, z, 0.8 * S, 0.16 * S, 0.8 * S, ry, 0, 0, true);
  // Jewel finial (Hōju)
  cylinder(M.stoneLantern, x, y + 3.12 * S, z, 0.16 * S, 0.32 * S, ry, 0, 0, true);
}

// ---------------------------------------------------------------------------
// 3. Chōzuya Water Purification Pavilion (手水舎)
// ---------------------------------------------------------------------------
function buildChozuya(x, y, z) {
  // Stone paved floor (walkable — not a prop wall)
  box(M.stonePaver, x, y + 0.15, z, 6.0, 0.3, 5.0, 0, 0, 0, false);

  // 4 Timber pillars
  const px = 2.4, pz = 1.9, colH = 3.6;
  for (const dx of [-px, px]) {
    for (const dz of [-pz, pz]) {
      cylinder(M.stoneLantern, x + dx, y + 0.4, z + dz, 0.35, 0.5, 0, 0, 0, true);
      cylinder(M.templeWood, x + dx, y + 0.4 + colH / 2, z + dz, 0.22, colH, 0, 0, 0, true);
    }
  }

  // Crossbeams
  box(M.templeWood, x, y + 0.4 + colH - 0.2, z - pz, px * 2 + 0.8, 0.35, 0.35, 0, 0, 0, true);
  box(M.templeWood, x, y + 0.4 + colH - 0.2, z + pz, px * 2 + 0.8, 0.35, 0.35, 0, 0, 0, true);
  box(M.templeWood, x - px, y + 0.4 + colH - 0.2, z, 0.35, 0.35, pz * 2 + 0.8, 0, 0, 0, true);
  box(M.templeWood, x + px, y + 0.4 + colH - 0.2, z, 0.35, 0.35, pz * 2 + 0.8, 0, 0, 0, true);

  // Curved Gabled Roof
  const roofY = y + 0.4 + colH + 0.6;
  box(M.shingleDark, x, roofY, z, 6.8, 0.35, 5.8, 0, 0, 0, true);
  box(M.shingleDark, x, roofY + 0.5, z, 5.2, 0.4, 4.4, 0, 0, 0, true);
  box(M.templeWood, x, roofY + 0.9, z, 4.0, 0.3, 0.4, 0, 0, 0, true);

  // Carved natural stone basin (Tsukubai / Chōzubachi)
  box(M.stoneLantern, x, y + 0.7, z, 2.2, 0.8, 1.4, 0, 0, 0, true);
  // Clear water in basin
  box(M.water, x, y + 1.05, z, 1.8, 0.12, 1.05, 0, 0, 0, false);

  // Bamboo water spout & resting bamboo rack
  cylinder(M.bambooGreen, x - 1.2, y + 1.4, z, 0.06, 0.9, 0, 0, 0.3, true);
  box(M.bambooGreen, x, y + 1.15, z, 1.9, 0.04, 0.4, 0, 0, 0, true);
  // Bamboo ladles (Hishaku)
  for (let i = -0.5; i <= 0.5; i += 0.5) {
    cylinder(M.templeWoodLight, x + i, y + 1.2, z, 0.015, 0.6, 0, Math.PI / 2, 0, true);
    cylinder(M.templeWoodLight, x + i, y + 1.23, z - 0.28, 0.06, 0.08, 0, 0, 0, true);
  }
}

// ---------------------------------------------------------------------------
// 4. Arched Red Wooden Bridge (Taiko-bashi 太鼓橋)
// ---------------------------------------------------------------------------
function buildTaikoBashi(x, y, z, span = 14, width = 3.6) {
  const steps = 18;
  const halfSpan = span / 2;
  const archHeight = 2.4;

  for (let i = 0; i <= steps; i++) {
    const u = i / steps;
    const t = (u - 0.5) * 2; // -1 to 1
    const pz = z - halfSpan + u * span;
    const py = y + (1 - t * t) * archHeight;
    const pitch = -t * 0.34;

    // Plank deck (walkable — not a prop wall)
    box(M.templeWood, x, py, pz, width, 0.18, span / steps + 0.08, 0, pitch, 0, false);

    // Left and right red lacquer railings & balustrades
    const leftX = x - width / 2 + 0.12;
    const rightX = x + width / 2 - 0.12;

    box(M.bridgeRed, leftX, py + 0.5, pz, 0.12, 0.85, 0.12, 0, pitch, 0, true);
    box(M.bridgeRed, rightX, py + 0.5, pz, 0.12, 0.85, 0.12, 0, pitch, 0, true);

    // Handrails
    box(M.bridgeRed, leftX, py + 0.95, pz, 0.16, 0.12, span / steps + 0.1, 0, pitch, 0, true);
    box(M.bridgeRed, rightX, py + 0.95, pz, 0.16, 0.12, span / steps + 0.1, 0, pitch, 0, true);

    // Golden giboshi finials on posts
    if (i % 4 === 0) {
      cylinder(M.goldGiboshi, leftX, py + 1.12, pz, 0.14, 0.22, 0, 0, 0, true);
      cylinder(M.goldGiboshi, rightX, py + 1.12, pz, 0.14, 0.22, 0, 0, 0, true);
    }
  }

  // Stone abutments at bridge ends
  box(M.stonePaver, x, y + 0.2, z - halfSpan - 0.8, width + 0.8, 0.6, 1.8, 0, 0, 0, true);
  box(M.stonePaver, x, y + 0.2, z + halfSpan + 0.8, width + 0.8, 0.6, 1.8, 0, 0, 0, true);
}

// ---------------------------------------------------------------------------
// 5. Main Shrine Hall (Haiden / Honden 拝殿・本殿)
// ---------------------------------------------------------------------------
function buildMainShrine(x, y, z) {
  const W = 18.0, D = 14.0, H = 5.8;

  // Elevated Stone Foundation
  box(M.stoneLantern, x, y + 0.6, z, W + 3.0, 1.2, D + 3.0, 0, 0, 0, true);

  // Wooden Veranda Deck (Engawa) — walkable floor, not a prop wall
  box(M.templeWood, x, y + 1.3, z, W + 2.0, 0.25, D + 2.0, 0, 0, 0, false);

  // Entrance staircase (Steps)
  for (let i = 0; i < 5; i++) {
    box(M.templeWood, x, y + 0.2 + i * 0.24, z - D / 2 - 1.2 - (4 - i) * 0.45, 6.0, 0.26, 0.55, 0, 0, 0, false);
  }

  // Colonnade of dark wooden Hinoki pillars
  const colsX = 6, colsZ = 4;
  for (let ix = 0; ix <= colsX; ix++) {
    for (let iz = 0; iz <= colsZ; iz++) {
      const cx = x - W / 2 + (ix / colsX) * W;
      const cz = z - D / 2 + (iz / colsZ) * D;
      cylinder(M.templeWood, cx, y + 1.4 + H / 2, cz, 0.28, H, 0, 0, 0, true);
    }
  }

  // Crossbeams and bracket complexes
  box(M.templeWood, x, y + 1.4 + H - 0.2, z - D / 2, W + 1.2, 0.45, 0.45, 0, 0, 0, true);
  box(M.templeWood, x, y + 1.4 + H - 0.2, z + D / 2, W + 1.2, 0.45, 0.45, 0, 0, 0, true);
  box(M.templeWood, x - W / 2, y + 1.4 + H - 0.2, z, 0.45, 0.45, D + 1.2, 0, 0, 0, true);
  box(M.templeWood, x + W / 2, y + 1.4 + H - 0.2, z, 0.45, 0.45, D + 1.2, 0, 0, 0, true);

  // Shoji lattice walls
  box(M.shojiPaper, x - W / 2 + 0.2, y + 1.4 + H / 2 - 0.2, z, 0.08, H - 0.8, D - 1.2, 0, 0, 0, true);
  box(M.shojiPaper, x + W / 2 - 0.2, y + 1.4 + H / 2 - 0.2, z, 0.08, H - 0.8, D - 1.2, 0, 0, 0, true);
  box(M.shojiPaper, x, y + 1.4 + H / 2 - 0.2, z + D / 2 - 0.2, W - 1.2, H - 0.8, 0.08, 0, 0, 0, true);
  box(M.shojiPaper, x - W / 2 + 2.8, y + 1.4 + H / 2 - 0.2, z - D / 2 + 0.2, 4.4, H - 0.8, 0.08, 0, 0, 0, true);
  box(M.shojiPaper, x + W / 2 - 2.8, y + 1.4 + H / 2 - 0.2, z - D / 2 + 0.2, 4.4, H - 0.8, 0.08, 0, 0, 0, true);

  // Traditional curved Irimoya-zukuri Roof
  const roofBaseY = y + 1.4 + H + 0.4;
  box(M.shingleDark, x, roofBaseY, z, W + 4.8, 0.6, D + 4.8, 0, 0, 0, true);
  box(M.shingleDark, x, roofBaseY + 0.8, z, W + 2.6, 0.8, D + 2.6, 0, 0, 0, true);
  box(M.shingleDark, x, roofBaseY + 1.8, z, W * 0.72, 1.2, D * 0.72, 0, 0, 0, true);

  // Ridge decorations: Chigi & Katsuogi
  const ridgeY = roofBaseY + 2.6;
  box(M.goldGiboshi, x - W * 0.32, ridgeY + 0.6, z, 0.18, 1.6, 0.18, 0, 0, 0.45, true);
  box(M.goldGiboshi, x - W * 0.32, ridgeY + 0.6, z, 0.18, 1.6, 0.18, 0, 0, -0.45, true);
  box(M.goldGiboshi, x + W * 0.32, ridgeY + 0.6, z, 0.18, 1.6, 0.18, 0, 0, 0.45, true);
  box(M.goldGiboshi, x + W * 0.32, ridgeY + 0.6, z, 0.18, 1.6, 0.18, 0, 0, -0.45, true);

  for (let k = -3; k <= 3; k++) {
    cylinder(M.goldGiboshi, x + k * (W * 0.08), ridgeY + 0.15, z, 0.22, 1.8, 0, Math.PI / 2, 0, true);
  }

  // Sacred Braided Straw Rope (Shimenawa 注連縄) above portal
  cylinder(M.shimenawa, x, y + 1.4 + H - 0.4, z - D / 2 - 0.3, 0.26, 6.4, 0, 0, Math.PI / 2, true);
  // Hanging white zigzag streamers (Shide 紙垂)
  for (let s = -2.2; s <= 2.2; s += 1.1) {
    box(M.shideWhite, x + s, y + 1.4 + H - 0.9, z - D / 2 - 0.35, 0.28, 0.75, 0.02, 0, 0, 0.15, true);
  }

  // Brass shrine bells (Suzu) and ceremonial cords
  for (const bx of [-1.2, 1.2]) {
    cylinder(M.toriiRed, x + bx, y + 1.4 + H - 1.2, z - D / 2 - 0.4, 0.06, 1.8, 0, 0, 0, true);
    cylinder(M.brassBell, x + bx, y + 1.4 + H - 0.7, z - D / 2 - 0.4, 0.32, 0.45, 0, 0, 0, true);
  }

  // Wooden coin offering box (Saisen-bako 賽銭箱)
  box(M.templeWoodLight, x, y + 1.9, z - D / 2 + 0.8, 2.6, 0.9, 1.4, 0, 0, 0, true);
  box(M.goldGiboshi, x, y + 2.38, z - D / 2 + 0.8, 2.4, 0.04, 1.2, 0, 0, 0, true);

  // Veranda benches for player to sit & meditate
  furnitureInteractions.push({
    type: 'sit',
    label: "S'asseoir sur la terrasse du temple  (E)",
    x: x - 4.5, y: y + 1.75, z: z - D / 2 + 0.3,
    centerX: x - 4.5, centerZ: z - D / 2 + 0.3,
    approachY: y + 1.45,
    yaw: 0,
    halfWidth: 1.2, halfDepth: 0.6,
    triggerDistance: 0.6,
    occupied: false,
  });
  furnitureInteractions.push({
    type: 'sit',
    label: "S'asseoir sur la terrasse du temple  (E)",
    x: x + 4.5, y: y + 1.75, z: z - D / 2 + 0.3,
    centerX: x + 4.5, centerZ: z - D / 2 + 0.3,
    approachY: y + 1.45,
    yaw: 0,
    halfWidth: 1.2, halfDepth: 0.6,
    triggerDistance: 0.6,
    occupied: false,
  });
}

// ---------------------------------------------------------------------------
// 6. Five-Story Pagoda (五重塔 Gojū-no-tō)
// ---------------------------------------------------------------------------
function buildPagoda(x, y, z) {
  const tiers = 5;
  let curY = y;
  let baseW = 8.5;

  // Stone base
  box(M.stoneLantern, x, curY + 0.6, z, baseW + 1.8, 1.2, baseW + 1.8, 0, 0, 0, true);
  curY += 1.2;

  for (let t = 0; t < tiers; t++) {
    const tierScale = 1.0 - t * 0.1;
    const tw = baseW * tierScale;
    const th = 3.6;

    // Wooden tier chamber & pillars
    box(M.templeWood, x, curY + th / 2, z, tw * 0.75, th, tw * 0.75, 0, 0, 0, true);
    // Railing
    box(M.bridgeRed, x, curY + 0.45, z, tw * 0.95, 0.7, tw * 0.95, 0, 0, 0, true);

    // Flared tiled roof eaves
    box(M.shingleDark, x, curY + th + 0.25, z, tw * 1.32, 0.45, tw * 1.32, 0, 0, 0, true);
    box(M.shingleDark, x, curY + th + 0.6, z, tw * 1.05, 0.35, tw * 1.05, 0, 0, 0, true);

    // Corner wind bells (Fūtaku)
    const corner = (tw * 1.32) / 2;
    for (const cx of [-corner, corner]) {
      for (const cz of [-corner, corner]) {
        cylinder(M.brassBell, x + cx, curY + th + 0.05, z + cz, 0.08, 0.18, 0, 0, 0, false);
      }
    }

    curY += th + 0.8;
  }

  // Bronze Spire Finial (Sōrin 相輪)
  cylinder(M.brassBell, x, curY + 3.0, z, 0.16, 6.0, 0, 0, 0, true);
  for (let r = 0; r < 9; r++) {
    cylinder(M.brassBell, x, curY + 1.2 + r * 0.45, z, 0.55 - r * 0.02, 0.12, 0, 0, 0, true);
  }
  // Sacred Flaming Jewel (Hōju)
  cylinder(M.goldGiboshi, x, curY + 5.8, z, 0.35, 0.55, 0, 0, 0, true);
}

// ---------------------------------------------------------------------------
// 7. Zen Rock Garden (枯山水 Karesansui)
// ---------------------------------------------------------------------------
function buildZenGarden(x, y, z, width = 24, depth = 18) {
  // Low dark cedar frame border
  box(M.templeWood, x, y + 0.2, z - depth / 2, width + 0.4, 0.4, 0.4, 0, 0, 0, true);
  box(M.templeWood, x, y + 0.2, z + depth / 2, width + 0.4, 0.4, 0.4, 0, 0, 0, true);
  box(M.templeWood, x - width / 2, y + 0.2, z, 0.4, 0.4, depth + 0.4, 0, 0, 0, true);
  box(M.templeWood, x + width / 2, y + 0.2, z, 0.4, 0.4, depth + 0.4, 0, 0, 0, true);

  // Raked white sand bed
  box(M.zenGravel, x, y + 0.1, z, width - 0.4, 0.2, depth - 0.4, 0, 0, 0, true);

  // Traditional stone arrangements with moss bases
  const rockPlacements = [
    { dx: -4, dz: -2, sx: 2.2, sy: 2.8, sz: 1.8, ry: 0.4 },
    { dx: -2.2, dz: -1.2, sx: 1.4, sy: 1.6, sz: 1.2, ry: -0.6 },
    { dx: -5.4, dz: -2.8, sx: 1.2, sy: 1.3, sz: 1.1, ry: 0.8 },
    { dx: 5, dz: 3, sx: 2.6, sy: 1.9, sz: 2.2, ry: 1.1 },
    { dx: 6.8, dz: 4.2, sx: 1.5, sy: 1.2, sz: 1.3, ry: -0.3 },
  ];

  for (const rp of rockPlacements) {
    cylinder(M.mossGrass, x + rp.dx, y + 0.15, z + rp.dz, (rp.sx + rp.sz) * 0.7, 0.15, 0, 0, 0, true);
    box(M.stoneLantern, x + rp.dx, y + rp.sy / 2 + 0.1, z + rp.dz, rp.sx, rp.sy, rp.sz, rp.ry, 0.1, 0, true);
  }

  // Wooden viewing platform with cedar bench (walkable)
  box(M.templeWood, x, y + 0.45, z + depth / 2 + 1.8, 8.0, 0.3, 3.2, 0, 0, 0, false);
  box(M.templeWoodLight, x, y + 0.85, z + depth / 2 + 2.2, 5.0, 0.5, 0.7, 0, 0, 0, true);

  furnitureInteractions.push({
    type: 'sit',
    label: "S'asseoir et contempler le jardin zen  (E)",
    x, y: y + 1.1, z: z + depth / 2 + 2.2,
    centerX: x, centerZ: z + depth / 2 + 2.2,
    approachY: y + 0.5,
    yaw: Math.PI,
    halfWidth: 1.8, halfDepth: 0.6,
    triggerDistance: 0.6,
    occupied: false,
  });
}

// ---------------------------------------------------------------------------
// 8. Ema Prayer Votive Plaque Rack (絵馬掛け)
// ---------------------------------------------------------------------------
function buildEmaRack(x, y, z, ry = 0) {
  // Timber frame with gabled roof
  box(M.templeWood, x - 2.0, y + 1.5, z, 0.22, 3.0, 0.22, ry, 0, 0, true);
  box(M.templeWood, x + 2.0, y + 1.5, z, 0.22, 3.0, 0.22, ry, 0, 0, true);
  box(M.templeWood, x, y + 2.9, z, 4.4, 0.22, 0.22, ry, 0, 0, true);
  box(M.shingleDark, x, y + 3.2, z, 4.8, 0.25, 1.2, ry, 0, 0, true);

  // Horizontal rails & hanging Ema wooden plaques
  for (let r = 0; r < 4; r++) {
    const rY = y + 0.8 + r * 0.55;
    box(M.templeWood, x, rY, z, 4.0, 0.06, 0.06, ry, 0, 0, true);
    for (let e = -1.6; e <= 1.6; e += 0.45) {
      box(M.templeWoodLight, x + e, rY - 0.16, z + 0.04, 0.24, 0.18, 0.02, ry, 0, (Math.random() - 0.5) * 0.15, true);
    }
  }
}

// ---------------------------------------------------------------------------
// 9. Flora: Sakura, Japanese Pines, Maples & Bamboo
// ---------------------------------------------------------------------------
function buildSakuraTree(x, y, z, scale = 1, isWhite = false) {
  const S = scale;
  const mat = isWhite ? M.sakuraBlossomWhite : M.sakuraBlossom;

  // Twisted dark trunk
  cylinder(M.treeTrunk, x, y + 2.0 * S, z, 0.35 * S, 4.0 * S, 0.2, 0.08, -0.05, true);
  cylinder(M.treeTrunk, x - 0.4 * S, y + 3.8 * S, z + 0.3 * S, 0.22 * S, 2.6 * S, 0.8, -0.25, 0.2, true);
  cylinder(M.treeTrunk, x + 0.5 * S, y + 3.9 * S, z - 0.4 * S, 0.22 * S, 2.6 * S, -0.6, 0.2, -0.2, true);

  // Soft lush blossom canopy clusters
  const clusters = [
    { dx: 0, dy: 4.8, dz: 0, sx: 4.8, sy: 2.8, sz: 4.8 },
    { dx: -1.6, dy: 4.2, dz: 1.2, sx: 3.4, sy: 2.4, sz: 3.4 },
    { dx: 1.8, dy: 4.4, dz: -1.4, sx: 3.6, sy: 2.5, sz: 3.6 },
    { dx: 1.2, dy: 4.1, dz: 1.6, sx: 3.2, sy: 2.2, sz: 3.2 },
    { dx: -1.4, dy: 4.3, dz: -1.5, sx: 3.2, sy: 2.2, sz: 3.2 },
    { dx: 0, dy: 6.0, dz: 0, sx: 3.6, sy: 2.2, sz: 3.6 },
  ];

  for (const c of clusters) {
    emit(G.sphere, mat, x + c.dx * S, y + c.dy * S, z + c.dz * S, c.sx * S, c.sy * S, c.sz * S, 0, 0, 0, false);
  }
}

function buildJapanesePine(x, y, z, scale = 1) {
  const S = scale;
  // Windswept trunk
  cylinder(M.treeTrunk, x, y + 1.8 * S, z, 0.38 * S, 3.6 * S, 0, 0.15, 0.12, true);
  cylinder(M.treeTrunk, x + 0.6 * S, y + 3.4 * S, z + 0.5 * S, 0.25 * S, 2.4 * S, 0.5, -0.2, 0.35, true);

  // Horizontal cloud-like pine needle pads
  const pads = [
    { dx: 0.8, dy: 3.0, dz: 0.6, sx: 3.4, sy: 0.8, sz: 2.8 },
    { dx: -1.2, dy: 3.8, dz: -0.4, sx: 3.6, sy: 0.85, sz: 3.0 },
    { dx: 1.6, dy: 4.4, dz: 1.2, sx: 3.2, sy: 0.75, sz: 2.6 },
    { dx: 0.2, dy: 5.2, dz: 0.2, sx: 2.8, sy: 0.8, sz: 2.6 },
  ];
  for (const p of pads) {
    emit(G.sphere, M.pineFoliage, x + p.dx * S, y + p.dy * S, z + p.dz * S, p.sx * S, p.sy * S, p.sz * S, 0, 0, 0, false);
  }
}

function buildMomijiMaple(x, y, z, scale = 1) {
  const S = scale;
  cylinder(M.treeTrunk, x, y + 1.6 * S, z, 0.26 * S, 3.2 * S, 0.3, 0.1, -0.1, true);
  const clusters = [
    { dx: 0, dy: 3.6, dz: 0, sx: 3.6, sy: 2.2, sz: 3.6 },
    { dx: -1.2, dy: 3.2, dz: 0.8, sx: 2.6, sy: 1.8, sz: 2.6 },
    { dx: 1.3, dy: 3.4, dz: -0.9, sx: 2.8, sy: 1.8, sz: 2.8 },
  ];
  for (const c of clusters) {
    emit(G.sphere, M.momijiRed, x + c.dx * S, y + c.dy * S, z + c.dz * S, c.sx * S, c.sy * S, c.sz * S, 0, 0, 0, false);
  }
}

function buildBambooGrove(centerX, centerY, centerZ, count = 25, radius = 6) {
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2 + Math.random() * 0.4;
    const r = Math.sqrt(Math.random()) * radius;
    const bx = centerX + Math.cos(angle) * r;
    const bz = centerZ + Math.sin(angle) * r;
    const bh = 8.0 + Math.random() * 4.5;
    const tilt = (Math.random() - 0.5) * 0.06;

    cylinder(M.bambooGreen, bx, centerY + bh / 2, bz, 0.08, bh, 0, tilt, tilt, true);
    emit(G.sphere, M.bambooGreen, bx, centerY + bh - 0.4, bz, 1.4, 2.2, 1.4, 0, 0, 0, false);
  }
}

// ---------------------------------------------------------------------------
// 10. Sakura Falling Petals Particle System
// ---------------------------------------------------------------------------
const PETAL_COUNT = 450;
const petalGeo = new THREE.PlaneGeometry(0.14, 0.22);
const petalMat = new THREE.MeshBasicMaterial({
  color: 0xffbccc,
  side: THREE.DoubleSide,
  transparent: true,
  opacity: 0.82,
  depthWrite: false,
});
const petalMesh = new THREE.InstancedMesh(petalGeo, petalMat, PETAL_COUNT);
const petalData = [];
{
  const _m = new THREE.Matrix4(), _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(1, 1, 1);
  for (let i = 0; i < PETAL_COUNT; i++) {
    const x = (Math.random() - 0.5) * 140;
    const y = Math.random() * 26 + 1;
    const z = (Math.random() - 0.5) * 160 + 20;
    const speedY = 0.6 + Math.random() * 0.8;
    const speedX = 0.4 + Math.random() * 0.6;
    const rotSpeed = (Math.random() - 0.5) * 2.5;
    petalData.push({ x, y, z, speedY, speedX, rotSpeed, rot: Math.random() * Math.PI * 2 });

    _p.set(x, y, z);
    _e.set(Math.random(), Math.random(), Math.random());
    _q.setFromEuler(_e);
    _m.compose(_p, _q, _s);
    petalMesh.setMatrixAt(i, _m);
  }
  petalMesh.instanceMatrix.needsUpdate = true;
  scenery.add(petalMesh);
}

function tickSakuraPetals(dt) {
  const _m = new THREE.Matrix4(), _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(1, 1, 1);
  for (let i = 0; i < PETAL_COUNT; i++) {
    const p = petalData[i];
    p.y -= p.speedY * dt;
    p.x += (p.speedX + Math.sin(p.y * 0.4 + i) * 0.5) * dt;
    p.z += Math.cos(p.y * 0.3 + i) * 0.4 * dt;
    p.rot += p.rotSpeed * dt;

    if (p.y < 0.1) {
      p.y = 22 + Math.random() * 6;
      p.x = (Math.random() - 0.5) * 140;
      p.z = (Math.random() - 0.5) * 160 + 20;
    }

    _p.set(p.x, p.y, p.z);
    _e.set(Math.sin(p.rot), p.rot, Math.cos(p.rot * 0.7));
    _q.setFromEuler(_e);
    _m.compose(_p, _q, _s);
    petalMesh.setMatrixAt(i, _m);
  }
  petalMesh.instanceMatrix.needsUpdate = true;
}

// ---------------------------------------------------------------------------
// 11. Sacred Koi Pond (神池)
// ---------------------------------------------------------------------------
const pondMesh = new THREE.Mesh(
  new THREE.PlaneGeometry(36, 26, 32, 32),
  M.water
);
pondMesh.rotation.x = -Math.PI / 2;
pondMesh.position.set(0, 0.48, 32);
scenery.add(pondMesh);

// Pond bed & stone borders
box(M.stoneLantern, 0, -0.6, 32, 38, 1.2, 28, 0, 0, 0, true);
box(M.stonePaver, 0, 0.42, 32 - 13.5, 38, 0.4, 1.8, 0, 0, 0, true);
box(M.stonePaver, 0, 0.42, 32 + 13.5, 38, 0.4, 1.8, 0, 0, 0, true);
box(M.stonePaver, -18.5, 0.42, 32, 1.8, 0.4, 28, 0, 0, 0, true);
box(M.stonePaver, 18.5, 0.42, 32, 1.8, 0.4, 28, 0, 0, 0, true);

// Stepping stones and water lily pads
const lilyMat = new THREE.MeshStandardMaterial({ color: 0x366838, roughness: 0.6 });
const lotusFlowerMat = new THREE.MeshStandardMaterial({ color: 0xff88aa, roughness: 0.5 });
for (let l = 0; l < 24; l++) {
  const lx = (Math.random() - 0.5) * 30;
  const lz = 32 + (Math.random() - 0.5) * 20;
  if (Math.abs(lx) < 2.8) continue; // Keep under the bridge clear
  cylinder(lilyMat, lx, 0.51, lz, 0.4 + Math.random() * 0.35, 0.02, Math.random() * Math.PI, 0, 0, false);
  if (l % 3 === 0) {
    cylinder(lotusFlowerMat, lx, 0.56, lz, 0.18, 0.12, 0, 0, 0, false);
  }
}

// ---------------------------------------------------------------------------
// 12. Main Ground, Sando Path & Parking Lot
// ---------------------------------------------------------------------------
// Main garden lawn terrain
const mainGround = new THREE.Mesh(
  new THREE.PlaneGeometry(280, 320),
  M.mossGrass
);
mainGround.rotation.x = -Math.PI / 2;
mainGround.position.set(0, 0, 50);
mainGround.receiveShadow = true;
scenery.add(mainGround);

// Sando Slate Approach Path (from Torii to Haiden).
// Not a prop: a 140 m slab is a floor, and groundFn stands the player on SANDO_TOP.
const SANDO_X = 0, SANDO_Z = 40, SANDO_W = 5.2, SANDO_D = 140;
const SANDO_Y = 0.12, SANDO_H = 0.22;
const SANDO_TOP = SANDO_Y + SANDO_H / 2;
box(M.stonePaver, SANDO_X, SANDO_Y, SANDO_Z, SANDO_W, SANDO_H, SANDO_D, 0, 0, 0, false);
// Flanking dark stone borders
box(M.stoneLantern, -2.9, 0.14, 40, 0.5, 0.26, 140, 0, 0, 0, true);
box(M.stoneLantern, 2.9, 0.14, 40, 0.5, 0.26, 140, 0, 0, 0, true);

// Double row of stone lanterns along the Sando
for (let z = -20; z <= 90; z += 9) {
  if (z > 24 && z < 42) continue; // bridge zone
  buildStoneLantern(-3.8, 0.15, z, 1.0, 0);
  buildStoneLantern(3.8, 0.15, z, 1.0, Math.PI);
}

// Parking lot (Z: -100 to -24). Perpendicular stalls: dividers run along Z
// (stall depth), 4.2 m apart on X. buildCar is +X-forward, so yaw π/2 puts
// the length down the stall, toward the torii.
const PARK_BAY_PITCH = 4.2;
const PARK_BAY_DEPTH = 6.0;
const PARK_BAY_Z = -50;
const PARK_LINE_I0 = -5;
const PARK_YAW = Math.PI / 2;
const parkingGround = new THREE.Mesh(
  new THREE.PlaneGeometry(160, 90),
  M.asphalt
);
parkingGround.rotation.x = -Math.PI / 2;
parkingGround.position.set(0, 0.05, -65);
parkingGround.receiveShadow = true;
scenery.add(parkingGround);

for (let i = PARK_LINE_I0; i <= 5; i++) {
  box(M.parkingLine, i * PARK_BAY_PITCH, 0.08, PARK_BAY_Z, 0.15, 0.02, PARK_BAY_DEPTH, 0, 0, 0, false);
}

function parkBayX(k) {
  return (PARK_LINE_I0 + k + 0.5) * PARK_BAY_PITCH;
}

// ---------------------------------------------------------------------------
// 13. Assemble the Shinto Shrine Complex
// ---------------------------------------------------------------------------
// Grand Entrance Torii
buildTorii(0, 0.1, -22, 1.15, 0);

// Chōzuya Purification Pavilion
buildChozuya(-9.5, 0.15, 12);

// Taiko-bashi Arched Red Bridge across pond
buildTaikoBashi(0, 0.45, 32, 16, 3.8);

// Main Haiden Shrine Hall
buildMainShrine(0, 0.15, 95);

// Five-Story Pagoda
buildPagoda(-26, 0.15, 82);

// Zen Rock Garden
buildZenGarden(28, 0.15, 78, 22, 16);

// Ema rack
buildEmaRack(8.5, 0.15, 65, -0.4);

// Flora Placement
// Sakura trees flanking Sando, pond and shrine
buildSakuraTree(-12, 0.1, -10, 1.1);
buildSakuraTree(12, 0.1, -12, 1.15);
buildSakuraTree(-14, 0.1, 8, 1.2, true);
buildSakuraTree(14, 0.1, 14, 1.1);
buildSakuraTree(-16, 0.1, 48, 1.25);
buildSakuraTree(16, 0.1, 52, 1.2, true);
buildSakuraTree(-38, 0.1, 92, 1.3);
buildSakuraTree(38, 0.1, 96, 1.25);
buildSakuraTree(-18, 0.1, 115, 1.2);
buildSakuraTree(18, 0.1, 115, 1.15, true);

// Japanese Black Pines
buildJapanesePine(-10, 0.1, 26, 1.2);
buildJapanesePine(10, 0.1, 38, 1.15);
buildJapanesePine(-32, 0.1, 65, 1.3);
buildJapanesePine(36, 0.1, 62, 1.25);

// Autumn Maples (Momiji)
buildMomijiMaple(-8, 0.1, 44, 1.0);
buildMomijiMaple(8, 0.1, 22, 1.1);
buildMomijiMaple(-20, 0.1, 75, 1.15);
buildMomijiMaple(20, 0.1, 72, 1.1);

// Dense Bamboo Groves
buildBambooGrove(-48, 0.1, 40, 35, 12);
buildBambooGrove(48, 0.1, 45, 35, 12);
buildBambooGrove(-45, 0.1, 100, 30, 10);
buildBambooGrove(45, 0.1, 100, 30, 10);
buildBambooGrove(0, 0.1, 135, 45, 16);

// ---------------------------------------------------------------------------
// 14. Vehicles & Return Car on Parking Lot
// ---------------------------------------------------------------------------
// Arrival cinematic mesh only — never left parked on the lot. The shrine is
// far from the airport, so no airliner belongs on this asphalt.
function buildSimpleAirliner() {
  const g = new THREE.Group();
  // Fuselage
  const fuse = new THREE.Mesh(new THREE.CylinderGeometry(2.0, 2.0, 34, 24), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.35 }));
  fuse.rotation.x = Math.PI / 2;
  fuse.position.y = 3.5;
  g.add(fuse);
  // Nose
  const nose = new THREE.Mesh(new THREE.SphereGeometry(2.0, 24, 16), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.35 }));
  nose.position.set(0, 3.5, -17);
  g.add(nose);
  // Wings
  const wing = new THREE.Mesh(new THREE.BoxGeometry(32, 0.4, 5.5), new THREE.MeshStandardMaterial({ color: 0xe0e5ec, roughness: 0.4 }));
  wing.position.set(0, 3.0, 0);
  g.add(wing);
  // Tail fin
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.4, 5.2, 4.0), new THREE.MeshStandardMaterial({ color: 0xc8102e, roughness: 0.35 }));
  tail.position.set(0, 6.0, 15);
  g.add(tail);
  return g;
}

// Parked scenery cars — one per stall, centred between the painted dividers.
// Bays 4–5 (around x = 0) stay empty so the walk toward the torii is clear.
const car1 = buildCar('sedan', 0xe8eef5, { metallic: true });
car1.position.set(parkBayX(1), 0.1, PARK_BAY_Z);
car1.rotation.y = PARK_YAW;
world.add(car1);

const car2 = buildCar('suv', 0x1e242c, { metallic: false });
car2.position.set(parkBayX(2), 0.1, PARK_BAY_Z);
car2.rotation.y = PARK_YAW;
world.add(car2);

const car3 = buildCar('coupe', 0xb82828, { metallic: true });
car3.position.set(parkBayX(7), 0.1, PARK_BAY_Z);
car3.rotation.y = PARK_YAW;
world.add(car3);

// Turn off headlights, DRLs and taillights of all parked scenery cars
function turnOffCarLights(car) {
  car.traverse(child => {
    if (child.isMesh && child.material) {
      if (Array.isArray(child.material)) {
        child.material = child.material.map(m => {
          const cloned = m.clone();
          if (cloned.emissive) {
            cloned.emissive.set(0x000000);
            cloned.emissiveIntensity = 0;
          }
          return cloned;
        });
      } else {
        const cloned = child.material.clone();
        if (cloned.emissive) {
          cloned.emissive.set(0x000000);
          cloned.emissiveIntensity = 0;
        }
        child.material = cloned;
      }
    }
  });
}
turnOffCarLights(car1);
turnOffCarLights(car2);
turnOffCarLights(car3);

// The Interactive Return Car ("Retour à LA")
const RETURN_CAR_X = parkBayX(8);
const RETURN_CAR_Y = 0.1;
const RETURN_CAR_Z = PARK_BAY_Z;
const RETURN_CAR_YAW = PARK_YAW;

const returnCar = buildCar('sedan', 0x223c58, { metallic: true });
returnCar.position.set(RETURN_CAR_X, RETURN_CAR_Y, RETURN_CAR_Z);
returnCar.rotation.y = RETURN_CAR_YAW;
world.add(returnCar);

// Keep returnCar's headlights, DRL and taillights bright and powered
returnCar.traverse(child => {
  if (child.isMesh && child.material) {
    if (Array.isArray(child.material)) {
      child.material = child.material.map(m => m.clone());
    } else {
      child.material = child.material.clone();
      if (child.material.emissive) {
        child.material.emissiveIntensity = Math.max(1.6, child.material.emissiveIntensity || 1.6);
      }
    }
  }
});

// Hazard Indicator (clignotants / warning) lights on returnCar
const indicatorMat = new THREE.MeshStandardMaterial({
  color: 0xffaa22,
  emissive: 0xff7700,
  emissiveIntensity: 4.0,
  roughness: 0.15,
  metalness: 0.1,
});

// Front turn signals (left & right)
const geomFrontInd = new THREE.BoxGeometry(0.10, 0.07, 0.22);
const indFL = new THREE.Mesh(geomFrontInd, indicatorMat);
indFL.position.set(2.46, 0.79, 0.68);
returnCar.add(indFL);

const indFR = new THREE.Mesh(geomFrontInd, indicatorMat);
indFR.position.set(2.46, 0.79, -0.68);
returnCar.add(indFR);

// Rear turn signals (left & right)
const geomRearInd = new THREE.BoxGeometry(0.10, 0.07, 0.22);
const indRL = new THREE.Mesh(geomRearInd, indicatorMat);
indRL.position.set(-2.50, 0.88, 0.70);
returnCar.add(indRL);

const indRR = new THREE.Mesh(geomRearInd, indicatorMat);
indRR.position.set(-2.50, 0.88, -0.70);
returnCar.add(indRR);

// Side mirror repeater indicators
const geomMirrorInd = new THREE.BoxGeometry(0.12, 0.035, 0.045);
const indML = new THREE.Mesh(geomMirrorInd, indicatorMat);
indML.position.set(0.72, 1.09, 1.02);
returnCar.add(indML);

const indMR = new THREE.Mesh(geomMirrorInd, indicatorMat);
indMR.position.set(0.72, 1.09, -1.02);
returnCar.add(indMR);

// Flashing amber point lights for realistic reflection and parking lot cast
const hazardLightF = new THREE.PointLight(0xff9900, 2.5, 9.0, 1.8);
hazardLightF.position.set(2.6, 0.82, 0);
returnCar.add(hazardLightF);

const hazardLightR = new THREE.PointLight(0xff7700, 2.5, 9.0, 1.8);
hazardLightR.position.set(-2.6, 0.90, 0);
returnCar.add(hazardLightR);

// Subtle pulsing ground waypoint ring around the return car
const returnCarRingMat = new THREE.MeshBasicMaterial({
  color: 0x5fd7ff,
  transparent: true,
  opacity: 0.35,
  side: THREE.DoubleSide,
});
const returnCarRing = new THREE.Mesh(new THREE.RingGeometry(2.4, 2.7, 36), returnCarRingMat);
returnCarRing.rotation.x = -Math.PI / 2;
returnCarRing.position.set(RETURN_CAR_X, 0.12, RETURN_CAR_Z);
world.add(returnCarRing);

const returnCarBounds = carBounds('sedan');
const returnCarInteraction = {
  type: 'travel',
  label: 'Retour à LA',
  x: RETURN_CAR_X, y: RETURN_CAR_Y, z: RETURN_CAR_Z,
  centerX: RETURN_CAR_X, centerZ: RETURN_CAR_Z,
  approachY: RETURN_CAR_Y + 0.5,
  yaw: RETURN_CAR_YAW,
  halfWidth: returnCarBounds.length / 2,
  halfDepth: returnCarBounds.width / 2,
  triggerDistance: 1.4,
  occupied: false,
};

// ---------------------------------------------------------------------------
// 15. Flush Kits & Collision World
// ---------------------------------------------------------------------------
flushKits();

const bw = buildCityBoxes(world);
// Add collision boxes for key bounds and structures
{
  const push = (x0, y0, z0, x1, y1, z1, prop = true) => {
    bw.add({ x0, y0, z0, x1, y1, z1, collide: true, tall: y1 - y0 > 9, prop });
  };
  // Outer perimeter barriers
  push(-80, 0, -110, 80, 6, -100);
  push(-80, 0, 150, 80, 6, 160);
  push(-90, 0, -110, -75, 6, 160);
  push(75, 0, -110, 90, 6, 160);
}

// ---------------------------------------------------------------------------
// 16. Fauna & Crowd (Kitsune fox, crows, cat, visitors)
// ---------------------------------------------------------------------------
try {
  loadSpecies(['fox', 'crow', 'cat']).then(faunaSpecies => {
    // Sacred Kitsune foxes guarding the Haiden entrance
    if (faunaSpecies.fox) {
      placeAnimal(faunaSpecies.fox, -4.2, 0.8, 88, 0.4, fauna, { clip: 'Survey' });
      placeAnimal(faunaSpecies.fox, 4.2, 0.8, 88, -0.4, fauna, { clip: 'Survey' });
    }
    // Crows perched on the Grand Torii and Pagoda
    if (faunaSpecies.crow) {
      placeAnimal(faunaSpecies.crow, -2.8, 9.8, -22, 0.3, fauna, { clip: 'Idle' });
      placeAnimal(faunaSpecies.crow, 2.8, 9.8, -22, -0.3, fauna, { clip: 'Idle' });
    }
    // Temple cat resting on the Haiden Engawa deck
    if (faunaSpecies.cat) {
      placeAnimal(faunaSpecies.cat, -6.5, 1.45, 93, Math.PI * 0.6, fauna);
    }
  }).catch(e => console.warn('[shinto] fauna load issue:', e));
} catch (e) {
  console.warn('[shinto] fauna init issue:', e);
}

// ---------------------------------------------------------------------------
// 17. Character Materials & Player
// ---------------------------------------------------------------------------
const CHAR_MATS = await fetch('./chars/data/materials.json').then(r => r.json()).catch(() => ({}));
const charTexCache = {};
const charTexFile = file => file.replace(/\.(tga|psd|tif|png)$/i, '.webp');
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
const charImgCache = {};
function charImage(file) {
  const key = charTexFile(file);
  if (!charImgCache[key]) {
    charImgCache[key] = new Promise(resolve => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = './chars/textures/' + encodeURIComponent(key);
    });
  }
  return charImgCache[key];
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
  m.metalness = Math.min(rec.metallic ?? 0, 0.08);
  m.roughness = THREE.MathUtils.clamp(1 - (rec.smoothness ?? 0.25), 0.55, 1);
  if (rec.mode === 1) {
    m.alphaTest = rec.cutoff ?? 0.5;
    m.alphaToCoverage = true;
    m.side = THREE.DoubleSide;
  } else if (rec.mode >= 2) {
    m.transparent = true;
    m.opacity = Math.max(rec.color[3] ?? 1, rec.mode >= 3 ? 0.05 : 0.32);
    m.depthWrite = rec.mode < 3;
    m.side = THREE.DoubleSide;
    if (rec.mode >= 3) { m.roughness = 0.06; m.metalness = 0; }
  }
  const n = name.toLowerCase();
  if (n.includes('tshirt')) { m.map = null; m.color.set('#fdfdf7'); }
  else if (n.includes('pants')) { m.map = null; m.color.set('#ffd43b'); }
  else if (n.includes('hat') && !n.includes('that')) { m.map = null; m.color.set('#fff4b0'); }
  else if (n.includes('shoes')) { m.map = null; m.color.set('#fffef8'); }
  else if (n.includes('backpack')) { m.map = null; m.color.set('#ffe27a'); }
  m.needsUpdate = true;
  return m;
}

let player = null;
// Parking / lawn sit at 0.1. The sando, bridge, shrine deck and a few
// other slabs stand proud of that — a constant groundY left the feet
// buried in the raised central alley (and anywhere else the stone is higher).
const BASE_GROUND = 0.1;
function groundFn(x, z) {
  // Main shrine deck & stairs — buildMainShrine(0, 0.15, 95)
  {
    const sx = 0, sy = 0.15, sz = 95, W = 18, D = 14;
    if (Math.abs(x - sx) <= (W + 2) / 2 && Math.abs(z - sz) <= (D + 2) / 2) {
      return sy + 1.3 + 0.125;
    }
    if (Math.abs(x - sx) <= 3.1) {
      for (let i = 4; i >= 0; i--) {
        const stepZ = sz - D / 2 - 1.2 - (4 - i) * 0.45;
        if (Math.abs(z - stepZ) <= 0.32) return sy + 0.2 + i * 0.24 + 0.13;
      }
    }
  }
  // Taiko-bashi deck — buildTaikoBashi(0, 0.45, 32, 16, 3.8)
  {
    const bx = 0, by = 0.45, bz = 32, span = 16, width = 3.8, archH = 2.4;
    if (Math.abs(x - bx) <= width / 2 && z >= bz - span / 2 && z <= bz + span / 2) {
      const t = ((z - (bz - span / 2)) / span - 0.5) * 2;
      return by + (1 - t * t) * archH + 0.09;
    }
  }
  // Chōzuya paved floor — buildChozuya(-9.5, 0.15, 12)
  if (Math.abs(x + 9.5) <= 3 && Math.abs(z - 12) <= 2.5) return 0.45;
  // Zen garden viewing platform — buildZenGarden(28, 0.15, 78, 22, 16)
  if (Math.abs(x - 28) <= 4 && Math.abs(z - 87.8) <= 1.6) return 0.75;
  // Central sando (and its overlap with the parking at the torii)
  if (Math.abs(x - SANDO_X) <= SANDO_W / 2 &&
      z >= SANDO_Z - SANDO_D / 2 && z <= SANDO_Z + SANDO_D / 2) {
    return SANDO_TOP;
  }
  return BASE_GROUND;
}
const castFn = () => false;

const ctrl = new Controller(bw, groundFn, castFn, {
  onReset: () => ctrl.rescueTo(spawnPoint),
  onLand: impact => { if (player) player.onLand(impact); },
});

const params = new URLSearchParams(location.search);
const arrivedByFlight = params.get('arrival') === 'flight';

// Default spawn on the parking lot facing the Grand Torii Gate
const parkingSpawnPoint = new THREE.Vector3(0, 1.4, -42);
const spawnPoint = parkingSpawnPoint.clone();
ctrl.rescueTo(spawnPoint);

const rig = new CameraRig(camera, bw);
const input = new Input(renderer.domElement);
function requestGamePointerLock() {
  try { renderer.domElement.requestPointerLock?.()?.catch?.(() => {}); } catch (_) {}
}
input.yaw = Math.PI;

try {
  player = new Player(scene);
  await player.load('girl', girlMatFor);
  player.addWardrobePart('hairCrown', harmoniseHair(player, {
    scalp: await charImage(CHAR_MATS?.MAT_SurvGirl_Head?.tex || 'survgirl_head_diff.webp'),
    strands: await charImage(CHAR_MATS?.MAT_SurvGirl_Hair?.tex || 'survgirl_hair_diff.webp'),
    strandsAO: await charImage(CHAR_MATS?.MAT_SurvGirl_Hair?.aoTex || 'survgirl_hair_ao.webp'),
  }));
} catch (e) {
  console.warn('[shinto] player load issue:', e);
}

// ---------------------------------------------------------------------------
// 18. Interaction & Travel Handling
// ---------------------------------------------------------------------------
const forward = new THREE.Vector3();
const clock = new THREE.Clock();
let started = false, usedLock = false, paused = false;
let activeFurnitureInteraction = null;
let furnitureInteractionCooldown = 0;
let promptedFurniture = null;
let furnitureActionRequested = false;
let travelInProgress = false;
let releasedSpot = null;
let choosingFurniturePrompt = false;
const RELEASE_RADIUS = 1.2;
const interactionExitKeys = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space', 'KeyE'];
const interactionInputHeld = () => interactionExitKeys.some(code => input.down(code));

// In-flight landing cutscene state
let flightLandingActive = arrivedByFlight;
let flightLandingTimer = 0;
const FLIGHT_LANDING_DURATION = 4.2;

// Landing airliner mesh for cutscene
const landingPlane = buildSimpleAirliner();
landingPlane.visible = arrivedByFlight;
scene.add(landingPlane);

function distanceToFurniture(spot, position) {
  const dx = position.x - spot.centerX;
  const dz = position.z - spot.centerZ;
  const c = Math.cos(spot.yaw), s = Math.sin(spot.yaw);
  const localX = dx * c - dz * s;
  const localZ = dx * s + dz * c;
  return Math.hypot(
    Math.max(0, Math.abs(localX) - spot.halfWidth),
    Math.max(0, Math.abs(localZ) - spot.halfDepth));
}

function setFurniturePrompt(spot) {
  if (promptedFurniture === spot) return;
  promptedFurniture = spot;
  furnitureActionRequested = false;
  const show = Boolean(spot);
  furniturePrompt.textContent = show ? (spot.label || "S'asseoir") : '';
  furniturePrompt.classList.toggle('show', show);
  furniturePrompt.setAttribute('aria-hidden', show ? 'false' : 'true');
  const stealLock = show && !spot.keepLock;
  choosingFurniturePrompt = stealLock;
  if (stealLock) {
    if (document.pointerLockElement === renderer.domElement) document.exitPointerLock?.();
  } else if (started && !paused && !show) {
    requestGamePointerLock();
  }
}

furniturePrompt.addEventListener('click', event => {
  event.stopPropagation();
  if (!promptedFurniture) return;
  furnitureActionRequested = true;
  choosingFurniturePrompt = false;
  requestGamePointerLock();
});

renderer.domElement.addEventListener('click', () => {
  if (started && !paused && !choosingFurniturePrompt
    && document.pointerLockElement !== renderer.domElement) {
    requestGamePointerLock();
  }
});

function enterFurnitureInteraction(spot) {
  setFurniturePrompt(null);
  activeFurnitureInteraction = { ...spot, source: spot, returnPosition: parkingSpawnPoint.clone(), readyToExit: false };
  ctrl.pos.set(spot.x, spot.y, spot.z);
  ctrl.prevY = spot.y;
  ctrl.vel.set(0, 0, 0);
  ctrl.mode = spot.type;
  ctrl.webOn = false;
  if (Number.isFinite(spot.yaw)) input.yaw = spot.yaw + Math.PI;
}

function leaveFurnitureInteraction() {
  const interaction = activeFurnitureInteraction;
  if (!interaction) return;
  ctrl.pos.copy(interaction.returnPosition || parkingSpawnPoint);
  ctrl.prevY = ctrl.pos.y;
  ctrl.vel.set(0, 0, 0);
  ctrl.mode = 'ground';
  releasedSpot = interaction.source;
  activeFurnitureInteraction = null;
  furnitureInteractionCooldown = 0.5;
}

function updateFurnitureInteraction(dt) {
  if (travelInProgress) return true;
  if (furnitureInteractionCooldown > 0) furnitureInteractionCooldown -= dt;
  if (activeFurnitureInteraction) {
    const held = interactionInputHeld();
    if (!held) activeFurnitureInteraction.readyToExit = true;
    if (held && activeFurnitureInteraction.readyToExit) {
      leaveFurnitureInteraction();
      return false;
    }
    return true;
  }
  if (releasedSpot && distanceToFurniture(releasedSpot, ctrl.pos) > RELEASE_RADIUS) releasedSpot = null;
  if (furnitureInteractionCooldown > 0 || ctrl.mode !== 'ground') {
    setFurniturePrompt(null);
    return false;
  }
  let nearest = null, nearestDistance = Infinity;
  for (const spot of [returnCarInteraction, ...furnitureInteractions]) {
    if (spot === releasedSpot || spot.occupied) continue;
    if (Math.abs(ctrl.pos.y - spot.approachY) > (spot.type === 'travel' ? 1.4 : 0.8)) continue;
    const distance = distanceToFurniture(spot, ctrl.pos);
    if (distance < (spot.triggerDistance ?? 0.6) && distance < nearestDistance) {
      nearest = spot;
      nearestDistance = distance;
    }
  }
  setFurniturePrompt(nearest);
  if (nearest && (furnitureActionRequested || input.pressed('LMB') || input.pressed('KeyE'))) {
    furnitureActionRequested = false;
    if (nearest.type === 'travel') {
      travelInProgress = true;
      setFurniturePrompt(null);
      if (fadeEl) fadeEl.style.opacity = '1';
      setTimeout(() => {
        location.href = 'index.html?map=airport&arrival=japan';
      }, 400);
      return true;
    }
    enterFurnitureInteraction(nearest);
  }
  return activeFurnitureInteraction !== null;
}

// ---------------------------------------------------------------------------
// 19. Flight Landing Cutscene Animation
// ---------------------------------------------------------------------------
function updateFlightLanding(dt) {
  if (!flightLandingActive) return;
  flightLandingTimer += dt;
  const t = flightLandingTimer;

  if (t < 3.2) {
    // Phase 1 (0 to 3.2s): distant airliner over the Japanese countryside —
    // it never reaches the shrine parking, which is far from the airport.
    const u = t / 3.2;
    const descent = 1 - u;
    landingPlane.position.set(-80, 18 + descent * descent * 50, -320 + u * 80);
    landingPlane.rotation.set(descent * 0.12, 0, 0);

    camera.position.set(40, 22, -12);
    camera.lookAt(landingPlane.position.x, landingPlane.position.y + 4, landingPlane.position.z);

    if (fadeEl && t < 0.8) {
      fadeEl.style.opacity = String(1 - t / 0.8);
    }
  } else {
    flightLandingActive = false;
    landingPlane.visible = false;
    ctrl.rescueTo(parkingSpawnPoint);

    const msg = document.getElementById('msg');
    if (msg) {
      msg.textContent = 'Arrivée au temple — le grand torii est devant vous';
      msg.style.opacity = '1';
      setTimeout(() => { if (msg) msg.style.opacity = '0'; }, 3500);
    }
  }
}

// ---------------------------------------------------------------------------
// 20. Game Loop & HUD
// ---------------------------------------------------------------------------
function updateHud() {
  if (hudMode) hudMode.textContent = ctrl.mode;
  if (hudSpeed) hudSpeed.textContent = (ctrl.vel.length() * 3.6).toFixed(0);
  if (hudHeight) hudHeight.textContent = Math.max(0, ctrl.pos.y).toFixed(1);
}

function updateAvatar(dt) {
  if (!player) return;
  player.setOutfit({ hat: false, backpack: true, longSleeves: false });
  player.update({
    dt, mode: ctrl.mode, pos: ctrl.pos, vel: ctrl.vel,
    webOn: ctrl.webOn, webHand: ctrl.webHand, anchor: ctrl.anchor,
    ropeSlack: ctrl.webOn ? Math.max(0, ctrl.pos.distanceTo(ctrl.anchor) - ctrl.ropeLen) : 0,
    posture: activeFurnitureInteraction?.type,
    facingYaw: activeFurnitureInteraction?.yaw,
    floorY: activeFurnitureInteraction?.approachY,
  });
}

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(0.033, clock.getDelta());
  const t = clock.elapsedTime;

  // Animate water normal map ripples
  waterN.offset.x = t * 0.012;
  waterN.offset.y = -t * 0.008;

  // Animate falling sakura petals
  tickSakuraPetals(dt);

  // Animate blinking hazard lights (clignotants) and beacon on the return car
  const hazardOn = (t % 0.85) < 0.45;
  if (indicatorMat) {
    indicatorMat.emissiveIntensity = hazardOn ? 4.2 : 0.04;
    indicatorMat.color.setHex(hazardOn ? 0xffaa22 : 0x331800);
  }
  if (hazardLightF) hazardLightF.intensity = hazardOn ? 2.5 : 0;
  if (hazardLightR) hazardLightR.intensity = hazardOn ? 2.5 : 0;
  if (returnCarRingMat) returnCarRingMat.opacity = 0.22 + 0.15 * Math.sin(t * 3.8);

  if (flightLandingActive) {
    updateFlightLanding(dt);
    renderer.render(scene, camera);
    input.endFrame();
    return;
  }

  if (started && !paused) {
    input.updateLook(dt);
    const cp = Math.cos(input.pitch);
    forward.set(-Math.sin(input.yaw) * cp, Math.sin(input.pitch), -Math.cos(input.yaw) * cp).normalize();
    const locked = updateFurnitureInteraction(dt);
    if (!locked) {
      ctrl.update(dt, input, input.yaw, forward);
      updateFurnitureInteraction(0);
    }
    if (ctrl.pos.y < -60) ctrl.rescueTo(parkingSpawnPoint);
  }

  updateAvatar(dt);
  rig.update(dt, input, ctrl);
  updateHud();
  renderer.render(scene, camera);
  input.endFrame();
}
animate();

function resumePlay() {
  overlay.style.display = 'none';
  paused = false;
  requestGamePointerLock();
}
function startShinto() {
  if (started) { resumePlay(); return; }
  setFurniturePrompt(null);
  started = true;
  resumePlay();
}
window.__startShinto = startShinto;
startBtn?.addEventListener('click', startShinto);
window.addEventListener('keydown', e => {
  if (!started && (e.code === 'Enter' || e.code === 'Space')) {
    startShinto();
  }
});

if (arrivedByFlight || window.__startRequested) {
  startShinto();
}

document.addEventListener('pointerlockchange', () => {
  const hasLock = document.pointerLockElement !== null;
  usedLock = usedLock || hasLock;
  if (choosingFurniturePrompt && !hasLock) {
    paused = false;
    overlay.style.display = 'none';
    return;
  }
  if (!started) return;
  if (usedLock && !hasLock) {
    paused = true;
    setFurniturePrompt(null);
    overlay.style.display = 'flex';
  } else if (hasLock) {
    paused = false;
    overlay.style.display = 'none';
  }
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

window.__shinto = {
  THREE, scene, camera, renderer, world, ctrl, rig, input, player, spawnPoint,
  furnitureInteractions,
};
