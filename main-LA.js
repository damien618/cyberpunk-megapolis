import * as THREE from 'three';
import { Player } from './player.js?v=3';
import { Input } from './input.js';
import { Controller } from './controller.js?v=3';
import { CameraRig } from './cameraRig.js?v=3';
import { buildCityBoxes } from './cityBoxes.js?v=3';

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
renderer.toneMappingExposure = 1.08;
renderer.outputColorSpace = THREE.SRGBColorSpace;
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xb5d4ef);
scene.fog = new THREE.Fog(0xb5d4ef, 95, 540);

const camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.25, 2000);
camera.position.set(0, 8, 28);

const hemi = new THREE.HemisphereLight(0xe8f2ff, 0x6f6b62, 1.05);
scene.add(hemi);

const sun = new THREE.DirectionalLight(0xfff3dd, 1.35);
sun.position.set(85, 130, 65);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -170;
sun.shadow.camera.right = 170;
sun.shadow.camera.top = 170;
sun.shadow.camera.bottom = -170;
sun.shadow.camera.near = 10;
sun.shadow.camera.far = 380;
scene.add(sun);

const loader = new THREE.TextureLoader();
const maxAniso = renderer.capabilities.getMaxAnisotropy();
const pmrem = new THREE.PMREMGenerator(renderer);
pmrem.compileEquirectangularShader();

loader.load('./data/env_equirect.png', tex => {
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  const env = pmrem.fromEquirectangular(tex).texture;
  scene.environment = env;
  scene.environmentIntensity = 0.78;
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

const stuccoMap = tex('./textures/CP_Concrete_03_A.webp', 7, 4);
const stuccoN = ntex('./textures/CP_Concrete_03_N.webp', 7, 4);
const stoneMap = tex('./textures/CP_Floor_Tiles_A.webp', 14, 8);
const stoneN = ntex('./textures/CP_Floor_Tiles_N.webp', 14, 8);
const stoneAO = ntex('./textures/CP_Floor_Tiles_AO.webp', 14, 8);
const deckMap = tex('./textures/CP_Sidewalk_A.webp', 10, 6);
const deckN = ntex('./textures/CP_Sidewalk_N.webp', 10, 6);
const roofMap = tex('./textures/CP_Column_Concrete_A.webp', 12, 8);
const roofN = ntex('./textures/CP_Column_Concrete_N.webp', 12, 8);
const poolMap = tex('./textures/CP_Ceramic_Tile_A.webp', 9, 7);
const poolN = ntex('./textures/CP_Ceramic_Tile_N.webp', 9, 7);
const poolAO = ntex('./textures/CP_Ceramic_Tile_AO.webp', 9, 7);
const woodMap = tex('./textures/CP_Trim_Sheet_A.webp', 6, 2);
const woodN = ntex('./textures/CP_Trim_Sheet_N.webp', 6, 2);
const metalMap = tex('./textures/CP_Metal_Panel_A.webp', 5, 4);
const metalN = ntex('./textures/CP_Metal_Panel_N.webp', 5, 4);
const glassMap = tex('./textures/CP_Windows_01_A.webp', 3, 1.5);
const glassE = tex('./textures/CP_Windows_01_E.webp', 3, 1.5);
const lawnMap = tex('./textures/la/grass_diffuse.jpg', 20, 20);
const waterN = ntex('./textures/la/water_normal.jpg', 8, 5);

const matWall = new THREE.MeshStandardMaterial({
  map: stuccoMap,
  normalMap: stuccoN,
  normalScale: new THREE.Vector2(0.92, 0.92),
  roughness: 0.78,
  metalness: 0.04
});
const matFloor = new THREE.MeshStandardMaterial({
  map: stoneMap,
  normalMap: stoneN,
  aoMap: stoneAO,
  aoMapIntensity: 0.45,
  normalScale: new THREE.Vector2(0.5, 0.5),
  roughness: 0.56,
  metalness: 0.03
});
const matDeck = new THREE.MeshStandardMaterial({
  map: deckMap,
  normalMap: deckN,
  normalScale: new THREE.Vector2(0.44, 0.44),
  roughness: 0.62,
  metalness: 0.04
});
const matRoof = new THREE.MeshStandardMaterial({
  map: roofMap,
  normalMap: roofN,
  normalScale: new THREE.Vector2(0.6, 0.6),
  roughness: 0.74,
  metalness: 0.12
});
const matPool = new THREE.MeshStandardMaterial({
  map: poolMap,
  normalMap: poolN,
  aoMap: poolAO,
  aoMapIntensity: 0.52,
  normalScale: new THREE.Vector2(0.55, 0.55),
  roughness: 0.34,
  metalness: 0.12
});
const matWood = new THREE.MeshStandardMaterial({
  map: woodMap,
  normalMap: woodN,
  normalScale: new THREE.Vector2(0.48, 0.48),
  roughness: 0.66,
  metalness: 0.05
});
const matMetal = new THREE.MeshStandardMaterial({
  map: metalMap,
  normalMap: metalN,
  normalScale: new THREE.Vector2(0.4, 0.4),
  roughness: 0.42,
  metalness: 0.42
});
const matGlass = new THREE.MeshPhysicalMaterial({
  map: glassMap,
  emissiveMap: glassE,
  emissive: new THREE.Color(0x7cb0ff),
  emissiveIntensity: 0.3,
  color: 0xe5f7ff,
  roughness: 0.06,
  transmission: 0.94,
  transparent: true,
  opacity: 0.7,
  thickness: 0.45,
  ior: 1.46,
  metalness: 0.05
});
const matPalmTrunk = new THREE.MeshStandardMaterial({ color: 0x7a5337, roughness: 0.9, metalness: 0.05 });
const matPalmLeaf = new THREE.MeshStandardMaterial({ color: 0x3f8d58, roughness: 0.8, metalness: 0.02 });
const matPlanter = new THREE.MeshStandardMaterial({ color: 0x353943, roughness: 0.58, metalness: 0.34 });
const matConcreteDark = new THREE.MeshStandardMaterial({
  map: deckMap, normalMap: deckN, normalScale: new THREE.Vector2(0.3, 0.3), roughness: 0.84, metalness: 0.02, color: 0x9198a4
});
const matFabricWhite = new THREE.MeshStandardMaterial({ color: 0xf6f6f2, roughness: 0.88, metalness: 0.02 });
const matScreenFrame = new THREE.MeshStandardMaterial({ color: 0x111216, roughness: 0.38, metalness: 0.62 });
const matAppliance = new THREE.MeshStandardMaterial({ color: 0xe6ebef, roughness: 0.34, metalness: 0.55 });
const matAsphalt = new THREE.MeshStandardMaterial({ color: 0x2b3036, roughness: 0.95, metalness: 0.01 });
const matRoadLine = new THREE.MeshStandardMaterial({ color: 0xf8f2c9, roughness: 0.5, metalness: 0.02 });
const matBuilding = new THREE.MeshStandardMaterial({
  map: stuccoMap, normalMap: stuccoN, normalScale: new THREE.Vector2(0.45, 0.45), roughness: 0.8, metalness: 0.05, color: 0x9ba5b4
});

const world = new THREE.Group();
scene.add(world);

function addInstancedPrimitive(geometry, material, items) {
  const im = new THREE.InstancedMesh(geometry, material, items.length);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const p = new THREE.Vector3();
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    p.set(it.x, it.y, it.z);
    q.setFromEuler(new THREE.Euler(0, it.ry || 0, 0));
    s.set(it.sx || 1, it.sy || 1, it.sz || 1);
    m.compose(p, q, s);
    im.setMatrixAt(i, m);
  }
  im.castShadow = true;
  im.receiveShadow = true;
  im.instanceMatrix.needsUpdate = true;
  world.add(im);
  return im;
}

// Terrain
const terrain = new THREE.Mesh(
  withUV2(new THREE.PlaneGeometry(700, 700, 140, 140)),
  new THREE.MeshStandardMaterial({ map: lawnMap, roughness: 0.96, metalness: 0.01 })
);
const terrainPos = terrain.geometry.getAttribute('position');
for (let i = 0; i < terrainPos.count; i++) {
  const x = terrainPos.getX(i);
  const z = terrainPos.getZ(i);
  const r = Math.hypot(x, z);
  const ring = Math.max(0, (r - 120) / 250);
  const h = Math.sin(x * 0.03) * 1.1 + Math.cos(z * 0.025) * 0.9 + Math.sin((x + z) * 0.018) * 1.5;
  terrainPos.setY(i, ring * h);
}
terrain.geometry.computeVertexNormals();
terrain.rotation.x = -Math.PI / 2;
terrain.receiveShadow = true;
world.add(terrain);
const safeGround = new THREE.Mesh(
  withUV2(new THREE.PlaneGeometry(920, 920, 1, 1)),
  new THREE.MeshStandardMaterial({ map: deckMap, normalMap: deckN, roughness: 0.86, metalness: 0.02, color: 0x8e949e })
);
safeGround.rotation.x = -Math.PI / 2;
safeGround.position.y = 0.015;
safeGround.receiveShadow = true;
world.add(safeGround);

// Villa body
const boxGeo = withUV2(new THREE.BoxGeometry(1, 1, 1));
addInstancedPrimitive(boxGeo, matFloor, [
  { x: 0, y: 0.35, z: 0, sx: 56, sy: 0.7, sz: 34 },
  { x: 0, y: 0.8, z: -13.4, sx: 40, sy: 0.5, sz: 8 },
  { x: 0, y: 0.8, z: 13.4, sx: 52, sy: 0.5, sz: 6 },
  { x: -15.5, y: 0.7, z: -1.2, sx: 11, sy: 0.42, sz: 9 },
  { x: 15.5, y: 0.7, z: -1.2, sx: 11, sy: 0.42, sz: 9 },
  { x: 0, y: 0.7, z: -3.8, sx: 9, sy: 0.42, sz: 7 }
]);

addInstancedPrimitive(boxGeo, matWall, [
  { x: -22.2, y: 4.5, z: 0, sx: 1.1, sy: 9, sz: 29 },
  { x: 22.2, y: 4.5, z: 0, sx: 1.1, sy: 9, sz: 29 },
  { x: 0, y: 4.5, z: -15.1, sx: 44, sy: 9, sz: 1.2 },
  { x: -10.4, y: 4.5, z: 15.1, sx: 14, sy: 9, sz: 1.2 },
  { x: 10.4, y: 4.5, z: 15.1, sx: 14, sy: 9, sz: 1.2 },
  { x: 0, y: 8.9, z: -6, sx: 18, sy: 6, sz: 14 },
  { x: -7.8, y: 8.2, z: 2.8, sx: 5, sy: 4.6, sz: 6.8 },
  { x: 7.8, y: 8.2, z: 2.8, sx: 5, sy: 4.6, sz: 6.8 },
  { x: 0, y: 12.05, z: -6, sx: 23, sy: 0.7, sz: 18 },
  { x: 0, y: 12.85, z: -6, sx: 31, sy: 0.9, sz: 20 },
  { x: -17.8, y: 4.1, z: -8, sx: 0.5, sy: 8.2, sz: 7.8 },
  { x: 17.8, y: 4.1, z: -8, sx: 0.5, sy: 8.2, sz: 7.8 }
]);

addInstancedPrimitive(boxGeo, matRoof, [
  { x: 0, y: 9.3, z: -6, sx: 20, sy: 0.35, sz: 15.5 },
  { x: -12, y: 9.35, z: 0, sx: 0.6, sy: 9.2, sz: 18 },
  { x: 12, y: 9.35, z: 0, sx: 0.6, sy: 9.2, sz: 18 },
  { x: 0, y: 13.3, z: -6, sx: 32, sy: 0.35, sz: 21 },
  { x: 0, y: 7.4, z: 15.5, sx: 26, sy: 0.35, sz: 3.2 }
]);

addInstancedPrimitive(boxGeo, matWood, [
  { x: -8.8, y: 6.8, z: 13.9, sx: 0.5, sy: 4.2, sz: 0.5 },
  { x: -4.4, y: 6.8, z: 13.9, sx: 0.5, sy: 4.2, sz: 0.5 },
  { x: 0, y: 6.8, z: 13.9, sx: 0.5, sy: 4.2, sz: 0.5 },
  { x: 4.4, y: 6.8, z: 13.9, sx: 0.5, sy: 4.2, sz: 0.5 },
  { x: 8.8, y: 6.8, z: 13.9, sx: 0.5, sy: 4.2, sz: 0.5 },
  { x: 0, y: 9.2, z: 13.9, sx: 20, sy: 0.36, sz: 0.56 }
]);

const pergolaSlats = [];
for (let i = -9; i <= 9; i++) pergolaSlats.push({ x: i, y: 9.35, z: 13.9, sx: 0.24, sy: 0.18, sz: 3.8 });
addInstancedPrimitive(boxGeo, matWood, pergolaSlats);

// Front access stairs
const steps = [];
for (let i = 0; i < 6; i++) {
  steps.push({
    x: 0,
    y: 0.58 - i * 0.2,
    z: 17.2 + i * 0.85,
    sx: 9.4 - i * 0.15,
    sy: 0.2,
    sz: 1.2
  });
}
addInstancedPrimitive(boxGeo, matDeck, steps);

// Side retaining walls and driveway
addInstancedPrimitive(boxGeo, matConcreteDark, [
  { x: -33, y: 2.2, z: 5, sx: 2.1, sy: 4.2, sz: 38 },
  { x: 33, y: 2.2, z: 5, sx: 2.1, sy: 4.2, sz: 38 },
  { x: 0, y: 0.28, z: 34, sx: 38, sy: 0.56, sz: 28 }
]);

// Pool, deck and coping
addInstancedPrimitive(boxGeo, matPool, [
  { x: 0, y: -2.3, z: 9.2, sx: 16.2, sy: 0.7, sz: 7.6 },
  { x: -8.4, y: -1.4, z: 9.2, sx: 0.6, sy: 2.4, sz: 7.6 },
  { x: 8.4, y: -1.4, z: 9.2, sx: 0.6, sy: 2.4, sz: 7.6 },
  { x: 0, y: -1.4, z: 5.2, sx: 16.8, sy: 2.4, sz: 0.6 },
  { x: 0, y: -1.4, z: 13.2, sx: 16.8, sy: 2.4, sz: 0.6 },
  { x: -10.2, y: -0.7, z: 9.2, sx: 2.8, sy: 1.1, sz: 2.8 }    // spa basin
]);

addInstancedPrimitive(boxGeo, matDeck, [
  { x: 0, y: 0.95, z: 9.2, sx: 17.8, sy: 0.35, sz: 9.0 },
  { x: -18.4, y: 0.95, z: 9.2, sx: 10.5, sy: 0.35, sz: 11.5 },
  { x: 18.4, y: 0.95, z: 9.2, sx: 10.5, sy: 0.35, sz: 11.5 },
  { x: 0, y: 0.95, z: 19.2, sx: 30, sy: 0.35, sz: 10.5 },
  { x: 0, y: 0.78, z: 28.5, sx: 32, sy: 0.35, sz: 12.4 },   // bridge terrace to backyard
  { x: 0, y: 0.62, z: 58, sx: 66, sy: 0.35, sz: 42 }         // rear garden plate
]);

addInstancedPrimitive(boxGeo, matMetal, [
  { x: -16.2, y: 1.35, z: 19, sx: 4, sy: 0.7, sz: 1.6 },
  { x: -12.2, y: 1.35, z: 19, sx: 4, sy: 0.7, sz: 1.6 },
  { x: 12.2, y: 1.35, z: 19, sx: 4, sy: 0.7, sz: 1.6 },
  { x: 16.2, y: 1.35, z: 19, sx: 4, sy: 0.7, sz: 1.6 }
]);

// Glass walls and railings
addInstancedPrimitive(boxGeo, matGlass, [
  { x: -7.8, y: 4.8, z: 15.0, sx: 6.6, sy: 6.3, sz: 0.14 },
  { x: 7.8, y: 4.8, z: 15.0, sx: 6.6, sy: 6.3, sz: 0.14 },
  { x: -16.0, y: 4.8, z: 6.0, sx: 0.14, sy: 6.3, sz: 8.2 },
  { x: 16.0, y: 4.8, z: 6.0, sx: 0.14, sy: 6.3, sz: 8.2 },
  { x: 0, y: 10.6, z: 2.2, sx: 18.6, sy: 2.2, sz: 0.14 },
  { x: -8.2, y: 2.1, z: 4.9, sx: 0.1, sy: 1.9, sz: 7.6 },
  { x: 8.2, y: 2.1, z: 4.9, sx: 0.1, sy: 1.9, sz: 7.6 },
  { x: 0, y: 2.1, z: 1.1, sx: 16.2, sy: 1.9, sz: 0.1 }
]);

// Outdoor furniture: sunbeds + pergola table
addInstancedPrimitive(boxGeo, matWood, [
  { x: -16.2, y: 1.06, z: 19.2, sx: 3.7, sy: 0.15, sz: 1.35 },
  { x: -12.2, y: 1.06, z: 19.2, sx: 3.7, sy: 0.15, sz: 1.35 },
  { x: 12.2, y: 1.06, z: 19.2, sx: 3.7, sy: 0.15, sz: 1.35 },
  { x: 16.2, y: 1.06, z: 19.2, sx: 3.7, sy: 0.15, sz: 1.35 },
  { x: 0, y: 1.22, z: 13.4, sx: 4.2, sy: 0.18, sz: 1.8 },
  { x: 0, y: 1.9, z: 13.4, sx: 0.26, sy: 1.2, sz: 0.26 }
]);

// Planters
const planterGeo = withUV2(new THREE.CylinderGeometry(1.1, 1.2, 1.2, 18));
addInstancedPrimitive(planterGeo, matPlanter, [
  { x: -20.4, y: 1.5, z: -12.4 },
  { x: 20.4, y: 1.5, z: -12.4 },
  { x: -24.6, y: 1.5, z: 12.8 },
  { x: 24.6, y: 1.5, z: 12.8 }
]);
const bushGeo = withUV2(new THREE.IcosahedronGeometry(1.45, 2));
addInstancedPrimitive(bushGeo, matPalmLeaf, [
  { x: -20.4, y: 2.7, z: -12.4 },
  { x: 20.4, y: 2.7, z: -12.4 },
  { x: -24.6, y: 2.7, z: 12.8 },
  { x: 24.6, y: 2.7, z: 12.8 }
]);

// Palm trees
const trunkGeo = withUV2(new THREE.CylinderGeometry(0.26, 0.42, 9.5, 10));
addInstancedPrimitive(trunkGeo, matPalmTrunk, [
  { x: -26, y: 5.1, z: 16, ry: 0.16 },
  { x: -21, y: 5.1, z: 22, ry: -0.12 },
  { x: 25, y: 5.1, z: 17, ry: -0.18 },
  { x: 30, y: 5.1, z: 10, ry: 0.2 },
  { x: -32, y: 5.1, z: -18, ry: 0.15 },
  { x: 34, y: 5.1, z: -20, ry: -0.08 }
]);
const leafGeo = withUV2(new THREE.ConeGeometry(3.2, 6.5, 8, 1, true));
addInstancedPrimitive(leafGeo, matPalmLeaf, [
  { x: -26, y: 11.8, z: 16, sx: 1.2, sy: 1, sz: 1.2 },
  { x: -21, y: 11.8, z: 22, sx: 1.2, sy: 1, sz: 1.2 },
  { x: 25, y: 11.8, z: 17, sx: 1.2, sy: 1, sz: 1.2 },
  { x: 30, y: 11.8, z: 10, sx: 1.2, sy: 1, sz: 1.2 },
  { x: -32, y: 11.8, z: -18, sx: 1.2, sy: 1, sz: 1.2 },
  { x: 34, y: 11.8, z: -20, sx: 1.2, sy: 1, sz: 1.2 }
]);

// Skyline around the villa for better swing anchors
addInstancedPrimitive(boxGeo, matWall, [
  { x: -94, y: 19, z: -60, sx: 18, sy: 38, sz: 18 },
  { x: -76, y: 15, z: 56, sx: 13, sy: 30, sz: 16 },
  { x: -52, y: 22, z: -110, sx: 18, sy: 44, sz: 16 },
  { x: 80, y: 24, z: 86, sx: 22, sy: 48, sz: 20 },
  { x: 118, y: 17, z: -28, sx: 20, sy: 34, sz: 14 },
  { x: 60, y: 21, z: -98, sx: 16, sy: 42, sz: 16 },
  { x: 0, y: 20, z: 118, sx: 26, sy: 40, sz: 14 }
]);
addInstancedPrimitive(boxGeo, matGlass, [
  { x: -94, y: 31.5, z: -60, sx: 18.2, sy: 0.3, sz: 18.2 },
  { x: 80, y: 35.5, z: 86, sx: 22.2, sy: 0.3, sz: 20.2 },
  { x: 0, y: 30.5, z: 118, sx: 26.2, sy: 0.3, sz: 14.2 }
]);

// Structural podiums so distant masses are grounded (no floating blocks).
addInstancedPrimitive(boxGeo, matConcreteDark, [
  { x: 0, y: -1.8, z: 0, sx: 58, sy: 3.6, sz: 36 },
  { x: 0, y: -2.3, z: 42, sx: 68, sy: 4.6, sz: 48 },
  { x: -94, y: -2.6, z: -60, sx: 18.4, sy: 5.2, sz: 18.4 },
  { x: -76, y: -2.2, z: 56, sx: 13.4, sy: 4.4, sz: 16.4 },
  { x: -52, y: -2.8, z: -110, sx: 18.4, sy: 5.6, sz: 16.4 },
  { x: 80, y: -3.1, z: 86, sx: 22.4, sy: 6.2, sz: 20.4 },
  { x: 118, y: -2.2, z: -28, sx: 20.4, sy: 4.4, sz: 14.4 },
  { x: 60, y: -2.7, z: -98, sx: 16.4, sy: 5.4, sz: 16.4 },
  { x: 0, y: -2.6, z: 118, sx: 26.4, sy: 5.2, sz: 14.4 }
]);

// Realistic plan inspired by modern LA open-floor villas:
// central entry/foyer, rear open living toward pool, kitchen wing right, bedroom wing left.
addInstancedPrimitive(boxGeo, matWall, [
  { x: -6.8, y: 2.05, z: -0.8, sx: 0.3, sy: 4.1, sz: 20.6 }, // left partition
  { x: 7.4, y: 2.05, z: -0.8, sx: 0.3, sy: 4.1, sz: 20.6 },  // right partition
  { x: -14.5, y: 2.05, z: 0.0, sx: 8.2, sy: 4.1, sz: 0.3 },  // bedroom hall wall
  { x: 14.8, y: 2.05, z: 0.2, sx: 7.2, sy: 4.1, sz: 0.3 },   // kitchen hall wall
  { x: 0.2, y: 2.05, z: 6.0, sx: 14.4, sy: 4.1, sz: 0.3 },   // foyer divider
  { x: -14.0, y: 2.05, z: -8.5, sx: 0.3, sy: 4.1, sz: 10.0 },// bedroom closure
  { x: 14.4, y: 2.05, z: -7.8, sx: 0.3, sy: 4.1, sz: 10.8 }  // kitchen closure
]);

// Living room (rear center): sofas face TV on north wall, no entry obstruction.
addInstancedPrimitive(boxGeo, matFabricWhite, [
  { x: -2.8, y: 1.05, z: -7.2, sx: 3.8, sy: 0.5, sz: 1.5 },
  { x: -2.8, y: 1.5, z: -8.2, sx: 3.8, sy: 0.45, sz: 0.55 },
  { x: -4.85, y: 1.5, z: -7.2, sx: 0.55, sy: 0.45, sz: 1.5 },
  { x: 2.8, y: 1.05, z: -7.2, sx: 3.8, sy: 0.5, sz: 1.5 },
  { x: 2.8, y: 1.5, z: -8.2, sx: 3.8, sy: 0.45, sz: 0.55 },
  { x: 4.85, y: 1.5, z: -7.2, sx: 0.55, sy: 0.45, sz: 1.5 }
]);
addInstancedPrimitive(boxGeo, matWood, [
  { x: 0, y: 0.88, z: -7.0, sx: 3.4, sy: 0.2, sz: 1.45 },
  { x: 0, y: 0.56, z: -7.0, sx: 0.2, sy: 0.64, sz: 0.2 }
]);

// TV wall and screen (north wall, opposite sofas).
addInstancedPrimitive(boxGeo, matConcreteDark, [
  { x: 0, y: 2.1, z: -14.35, sx: 12.6, sy: 4.2, sz: 0.28 }
]);
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
  emissiveIntensity: 0.8,
  roughness: 0.12,
  metalness: 0.02,
});
const tvFrame = new THREE.Mesh(withUV2(new THREE.BoxGeometry(6.2, 3.6, 0.16)), matScreenFrame);
tvFrame.position.set(0, 2.45, -14.05);
tvFrame.castShadow = true;
tvFrame.receiveShadow = true;
world.add(tvFrame);
const tvScreen = new THREE.Mesh(withUV2(new THREE.PlaneGeometry(5.7, 3.1)), tvMat);
tvScreen.position.set(0, 2.45, -13.95);
tvScreen.rotation.y = Math.PI;
world.add(tvScreen);

// Kitchen (right wing): fridge, counters and dining table.
addInstancedPrimitive(boxGeo, matAppliance, [
  { x: 12.6, y: 2.0, z: -11.8, sx: 1.7, sy: 4.0, sz: 1.8 },
  { x: 10.2, y: 1.35, z: -12.2, sx: 5.2, sy: 1.3, sz: 1.7 },
  { x: 8.8, y: 1.35, z: -9.3, sx: 1.7, sy: 1.3, sz: 5.4 }
]);
addInstancedPrimitive(boxGeo, matWood, [
  { x: 10.4, y: 1.33, z: -4.7, sx: 4.5, sy: 0.2, sz: 2.2 },
  { x: 8.8, y: 0.82, z: -5.4, sx: 0.18, sy: 1.1, sz: 0.18 },
  { x: 12.0, y: 0.82, z: -5.4, sx: 0.18, sy: 1.1, sz: 0.18 },
  { x: 8.8, y: 0.82, z: -4.0, sx: 0.18, sy: 1.1, sz: 0.18 },
  { x: 12.0, y: 0.82, z: -4.0, sx: 0.18, sy: 1.1, sz: 0.18 }
]);
addInstancedPrimitive(boxGeo, matFabricWhite, [
  { x: 9.1, y: 0.98, z: -7.1, sx: 0.95, sy: 1.0, sz: 0.95 },
  { x: 11.7, y: 0.98, z: -7.1, sx: 0.95, sy: 1.0, sz: 0.95 },
  { x: 9.1, y: 0.98, z: -2.3, sx: 0.95, sy: 1.0, sz: 0.95 },
  { x: 11.7, y: 0.98, z: -2.3, sx: 0.95, sy: 1.0, sz: 0.95 }
]);

// Bedroom (left wing): luxury king bed.
addInstancedPrimitive(boxGeo, matFabricWhite, [
  { x: -10.8, y: 1.0, z: -6.0, sx: 6.2, sy: 0.7, sz: 6.8 },
  { x: -10.8, y: 1.55, z: -2.4, sx: 6.4, sy: 1.4, sz: 0.55 },
  { x: -12.4, y: 1.24, z: -9.0, sx: 2.2, sy: 0.48, sz: 1.6 },
  { x: -9.1, y: 1.24, z: -9.0, sx: 2.2, sy: 0.48, sz: 1.6 }
]);
addInstancedPrimitive(boxGeo, matWood, [
  { x: -14.6, y: 1.0, z: -6.0, sx: 1.2, sy: 1.1, sz: 1.0 },
  { x: -6.9, y: 1.0, z: -6.0, sx: 1.2, sy: 1.1, sz: 1.0 }
]);

// Larger outdoor pool in backyard.
addInstancedPrimitive(boxGeo, matPool, [
  { x: 0, y: -2.4, z: 42, sx: 21.8, sy: 0.8, sz: 10.6 },
  { x: -11.3, y: -1.4, z: 42, sx: 0.7, sy: 2.7, sz: 10.6 },
  { x: 11.3, y: -1.4, z: 42, sx: 0.7, sy: 2.7, sz: 10.6 },
  { x: 0, y: -1.4, z: 36.3, sx: 22.6, sy: 2.7, sz: 0.7 },
  { x: 0, y: -1.4, z: 47.7, sx: 22.6, sy: 2.7, sz: 0.7 }
]);
addInstancedPrimitive(boxGeo, matDeck, [
  { x: 0, y: 0.95, z: 42, sx: 24, sy: 0.35, sz: 12.8 },
  { x: -18, y: 0.95, z: 42, sx: 12, sy: 0.35, sz: 16 },
  { x: 18, y: 0.95, z: 42, sx: 12, sy: 0.35, sz: 16 }
]);

// Additional palms around villa + pool area.
const extraPalmTrunks = [];
const extraPalmLeaves = [];
for (let i = 0; i < 10; i++) {
  const a = (i / 10) * Math.PI * 2;
  const r = 52 + (i % 3) * 6;
  const x = Math.cos(a) * r;
  const z = Math.sin(a) * r + 12;
  extraPalmTrunks.push({ x, y: 4.9, z, ry: a * 0.2, sx: 1, sy: 1.1, sz: 1 });
  extraPalmLeaves.push({ x, y: 12.4, z, sx: 1.25, sy: 1.06, sz: 1.25 });
}
addInstancedPrimitive(trunkGeo, matPalmTrunk, extraPalmTrunks);
addInstancedPrimitive(leafGeo, matPalmLeaf, extraPalmLeaves);

// Outside road and district buildings.
const road = new THREE.Mesh(withUV2(new THREE.PlaneGeometry(360, 28)), matAsphalt);
road.rotation.x = -Math.PI / 2;
road.position.set(0, 0.03, 88);
road.receiveShadow = true;
world.add(road);
addInstancedPrimitive(boxGeo, matRoadLine, [
  { x: -120, y: 0.05, z: 88, sx: 8, sy: 0.02, sz: 0.35 },
  { x: -100, y: 0.05, z: 88, sx: 8, sy: 0.02, sz: 0.35 },
  { x: -80, y: 0.05, z: 88, sx: 8, sy: 0.02, sz: 0.35 },
  { x: -60, y: 0.05, z: 88, sx: 8, sy: 0.02, sz: 0.35 },
  { x: -40, y: 0.05, z: 88, sx: 8, sy: 0.02, sz: 0.35 },
  { x: -20, y: 0.05, z: 88, sx: 8, sy: 0.02, sz: 0.35 },
  { x: 0, y: 0.05, z: 88, sx: 8, sy: 0.02, sz: 0.35 },
  { x: 20, y: 0.05, z: 88, sx: 8, sy: 0.02, sz: 0.35 },
  { x: 40, y: 0.05, z: 88, sx: 8, sy: 0.02, sz: 0.35 },
  { x: 60, y: 0.05, z: 88, sx: 8, sy: 0.02, sz: 0.35 },
  { x: 80, y: 0.05, z: 88, sx: 8, sy: 0.02, sz: 0.35 },
  { x: 100, y: 0.05, z: 88, sx: 8, sy: 0.02, sz: 0.35 },
  { x: 120, y: 0.05, z: 88, sx: 8, sy: 0.02, sz: 0.35 }
]);
addInstancedPrimitive(boxGeo, matBuilding, [
  { x: -150, y: 20, z: 134, sx: 22, sy: 40, sz: 20 },
  { x: -116, y: 24, z: 140, sx: 20, sy: 48, sz: 18 },
  { x: -82, y: 18, z: 132, sx: 18, sy: 36, sz: 18 },
  { x: -46, y: 23, z: 142, sx: 24, sy: 46, sz: 20 },
  { x: -8, y: 21, z: 134, sx: 18, sy: 42, sz: 16 },
  { x: 30, y: 26, z: 148, sx: 22, sy: 52, sz: 18 },
  { x: 68, y: 20, z: 136, sx: 20, sy: 40, sz: 18 },
  { x: 104, y: 25, z: 144, sx: 24, sy: 50, sz: 22 },
  { x: 140, y: 19, z: 130, sx: 18, sy: 38, sz: 18 }
]);

// Stylized water surface
const waterGeo = withUV2(new THREE.PlaneGeometry(15.8, 7.2, 120, 60));
const waterMat = new THREE.MeshPhysicalMaterial({
  color: 0x48c5ff,
  transparent: true,
  opacity: 0.72,
  transmission: 0.86,
  roughness: 0.06,
  metalness: 0.08,
  thickness: 1.2,
  ior: 1.33,
  normalMap: waterN,
  normalScale: new THREE.Vector2(0.25, 0.25),
  clearcoat: 1,
  clearcoatRoughness: 0.12
});
const water = new THREE.Mesh(waterGeo, waterMat);
water.rotation.x = -Math.PI / 2;
water.position.set(0, -0.74, 9.2);
water.receiveShadow = true;
scene.add(water);

const water2 = new THREE.Mesh(withUV2(new THREE.PlaneGeometry(21.2, 10.0, 120, 60)), waterMat.clone());
water2.rotation.x = -Math.PI / 2;
water2.position.set(0, -0.74, 42);
water2.receiveShadow = true;
scene.add(water2);

// Road traffic (outside the villa garden).
function buildCar(color = 0xff4444) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(withUV2(new THREE.BoxGeometry(3.1, 0.9, 1.6)),
    new THREE.MeshStandardMaterial({ color, roughness: 0.36, metalness: 0.56 }));
  body.position.y = 0.75;
  body.castShadow = true;
  body.receiveShadow = true;
  g.add(body);
  const cabin = new THREE.Mesh(withUV2(new THREE.BoxGeometry(1.6, 0.75, 1.35)),
    new THREE.MeshStandardMaterial({ color: 0x9fc1e8, roughness: 0.06, metalness: 0.1, transparent: true, opacity: 0.8 }));
  cabin.position.set(-0.1, 1.3, 0);
  g.add(cabin);
  return g;
}
const traffic = [
  { mesh: buildCar(0xff6b6b), x: -160, z: 84, speed: 14.5, dir: 1 },
  { mesh: buildCar(0x5fb8ff), x: -40, z: 84, speed: 11.2, dir: 1 },
  { mesh: buildCar(0x7eff89), x: 80, z: 84, speed: 13.4, dir: 1 },
  { mesh: buildCar(0xfdd663), x: 160, z: 92, speed: 12.3, dir: -1 },
  { mesh: buildCar(0xc18cff), x: 20, z: 92, speed: 10.4, dir: -1 },
  { mesh: buildCar(0xffffff), x: -120, z: 92, speed: 15.3, dir: -1 },
];
for (const c of traffic) {
  c.mesh.position.set(c.x, 0, c.z);
  c.mesh.rotation.y = c.dir > 0 ? 0 : Math.PI;
  scene.add(c.mesh);
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
  rays.ray.far = 120;
  const hits = rays.ray.intersectObjects(world.children, true);
  for (const h of hits) {
    if (h.point.y <= feetY + 0.75) return h.point.y + 0.02;
  }
  // Safety support outside authored geometry to prevent void-falls in white gaps.
  if (Math.abs(x) < 430 && Math.abs(z) < 430) return 0.02;
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
const spawnPoint = new THREE.Vector3(0, 2.6, 24);
ctrl.rescueTo(spawnPoint);

const rig = new CameraRig(camera, bw);
const input = new Input(renderer.domElement);

player = new Player(scene);
await player.load('girl', girlMatFor);

const forward = new THREE.Vector3();
const clock = new THREE.Clock();

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

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(0.033, clock.getDelta());

  if (input.locked) {
    const cp = Math.cos(input.pitch);
    forward.set(-Math.sin(input.yaw) * cp, Math.sin(input.pitch), -Math.cos(input.yaw) * cp).normalize();
    ctrl.update(dt, input, input.yaw, forward);
    if (ctrl.pos.y < -25) ctrl.rescueTo(spawnPoint);
  }

  const t = clock.elapsedTime;
  // TV: lightweight animated wildlife report.
  tvCtx.fillStyle = '#8ec3ff';
  tvCtx.fillRect(0, 0, tvCanvas.width, tvCanvas.height);
  tvCtx.fillStyle = '#6ea25f';
  tvCtx.fillRect(0, tvCanvas.height * 0.55, tvCanvas.width, tvCanvas.height * 0.45);
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

  waterN.offset.x = t * 0.02;
  waterN.offset.y = -t * 0.012;
  water.material.opacity = 0.7 + Math.sin(t * 1.8) * 0.04;
  water2.material.normalMap.offset.x = t * 0.018;
  water2.material.normalMap.offset.y = -t * 0.01;
  water2.material.opacity = 0.68 + Math.sin(t * 1.4) * 0.05;
  matGlass.emissiveIntensity = 0.24 + Math.sin(t * 0.6) * 0.08;

  for (const c of traffic) {
    c.mesh.position.x += c.speed * c.dir * dt;
    if (c.dir > 0 && c.mesh.position.x > 185) c.mesh.position.x = -185;
    if (c.dir < 0 && c.mesh.position.x < -185) c.mesh.position.x = 185;
  }

  updateAvatar(dt);
  rig.update(dt, input, ctrl);
  updateHud();
  renderer.render(scene, camera);
  input.endFrame();
}
animate();

startBtn.addEventListener('click', () => {
  overlay.style.display = 'none';
  renderer.domElement.requestPointerLock();
});

document.addEventListener('pointerlockchange', () => {
  if (!input.locked) overlay.style.display = 'flex';
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
