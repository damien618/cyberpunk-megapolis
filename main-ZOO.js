import * as THREE from 'three';
import { Player } from './player.js?v=46';
import { harmoniseHair } from './hair.js?v=8';
import { Input } from './input.js';
import { Controller } from './controller.js?v=5';
import { CameraRig } from './cameraRig.js?v=4';
import { buildCityBoxes } from './cityBoxes.js?v=4';
import { buildCar } from './cars.js?v=4';
import { makeVisitor, loadVisitorBase, STAFF_UNIFORM } from './crowd.js?v=10';
import { loadSpecies, placeAnimal, SPECIES } from './fauna.js?v=19';

// ---------------------------------------------------------------------------
// A Trip to the Zoo — a small regional park, laid out the way zoo master plans
// actually are rather than as a field with animals dotted about it:
//
//   car park → entry plaza → ticket pavilion → turnstiles
//   ONE dirt loop, walked in either direction, that returns you to the gate
//   exhibits CLUSTERED on the outside of the loop, never on both sides at once
//   a guest-services hub in the middle of the loop, reachable by two spurs
//
// The loop-with-a-hub is the standard: it guarantees you pass every exhibit
// without backtracking, it puts food and shops within a minute of anywhere in
// the park, and the two spurs across the middle are the "braid" that lets a
// tired family cut the circuit in half. Exhibits sit outside the loop so their
// barriers only ever face the path on one side — visitors on the far side of an
// enclosure would need a second, duplicated barrier line and a service road
// they can't be allowed onto.
//
// Barriers are per species, and none of them is a cage with a door onto the
// path: the lions and bears are behind a stone plinth carrying laminated glass,
// with a stand-off rail keeping visitors off the glass; the monkeys are in a
// full mesh volume because primates climb anything with a top edge; the snakes
// are indoors in glazed vivaria; the parrots are in a walk-past mesh aviary.
//
// Everything static is instanced (see flushKits) because cityBoxes.js derives
// the collision world from the InstancedMeshes parented to `world`. The animals
// and the visitors are NOT: they animate, they are scenery you look at rather
// than walk into, and keeping them out of `world` keeps the ground probe fast.
// ---------------------------------------------------------------------------

const app = document.getElementById('app');
const overlay = document.getElementById('overlay');
const startBtn = document.getElementById('startBtn');
const hudMode = document.getElementById('mode');
const hudSpeed = document.getElementById('speed');
const hudHeight = document.getElementById('height');
const furniturePrompt = document.getElementById('furniturePrompt');

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.7));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.98;
renderer.outputColorSpace = THREE.SRGBColorSpace;
app.appendChild(renderer.domElement);

const SKY = 0xbcd6ea;
const scene = new THREE.Scene();
scene.background = new THREE.Color(SKY);
scene.fog = new THREE.Fog(0xd2e2ee, 190, 900);

const camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.25, 2200);
camera.position.set(0, 8, 40);

const hemi = new THREE.HemisphereLight(0xdfeeff, 0x7f8464, 0.9);
scene.add(hemi);

// Mid-morning: high enough that the enclosures are not in their own shadow,
// low enough that the chalet roofs still read as roofs.
const sun = new THREE.DirectionalLight(0xfff4e2, 2.3);
sun.position.set(-70, 150, 90);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -130;
sun.shadow.camera.right = 130;
sun.shadow.camera.top = 130;
sun.shadow.camera.bottom = -130;
sun.shadow.camera.near = 30;
sun.shadow.camera.far = 420;
sun.shadow.bias = -0.0006;
sun.shadow.normalBias = 0.05;
scene.add(sun);
sun.target.position.set(0, 0, -48);
scene.add(sun.target);

const loader = new THREE.TextureLoader();
const maxAniso = renderer.capabilities.getMaxAnisotropy();
const pmrem = new THREE.PMREMGenerator(renderer);
pmrem.compileEquirectangularShader();

loader.load('./data/env_equirect.png', t => {
  t.mapping = THREE.EquirectangularReflectionMapping;
  t.colorSpace = THREE.SRGBColorSpace;
  scene.environment = pmrem.fromEquirectangular(t).texture;
  scene.environmentIntensity = 0.45;
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
function withUV2(geometry) {
  if (!geometry.getAttribute('uv2') && geometry.getAttribute('uv')) {
    const uv = geometry.getAttribute('uv');
    geometry.setAttribute('uv2', new THREE.BufferAttribute(new Float32Array(uv.array), 2));
  }
  return geometry;
}

// ---------------------------------------------------------------------------
// Character materials — same pack as the villa, dressed for a day out: fitted
// black tee, and the trousers/trainers retired in favour of the cut-off denim
// and flip-flops the wardrobe builds (see player.js / limbs.js).
// ---------------------------------------------------------------------------
const CHAR_MATS = await fetch('./chars/data/materials.json').then(r => r.json());
const charTexCache = {};
const charMSCache = {};
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
      const metal = px[i], smooth = px[i + 3];
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
// The pack's albedo for the tee and the trousers is a camouflage print, and
// none of this outfit has anything on it at all, so the maps go and the colours
// are driven directly. The layering is what carries it: a pale pink tee, the
// red knit tank over it (built in player.js, because it needs the sleeves cut
// off first), and loose off-white trousers over bare feet in flip-flops.
function tintZooStyle(mat, name) {
  const n = name.toLowerCase();
  if (n.includes('tshirt')) {
    mat.map = null;
    mat.color.set('#f2b9c6');       // pale pink, worn under the tank
    mat.roughness = 0.86;
    mat.metalness = 0.01;
  } else if (n.includes('pants')) {
    mat.map = null;
    mat.color.set('#efeae0');       // off-white cotton, not paper white
    mat.roughness = 0.93;
    mat.metalness = 0.0;
  } else if (n.includes('shoes')) {
    mat.map = null;
    mat.color.set('#1a1a1e');
    mat.roughness = 0.62;
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
  tintZooStyle(m, name);
  return m;
}

// ---------------------------------------------------------------------------
// Material palette — timber, compacted earth, stone, mesh, glass, foliage.
// ---------------------------------------------------------------------------
const woodN = ntex('./textures/CP_Trim_Sheet_N.webp', 3, 1);
const concN = ntex('./textures/CP_Concrete_01_N.webp', 4, 4);
const stoneN = ntex('./textures/CP_Brick_Wall_N.webp', 5, 3);
const asphaltA = tex('./textures/CP_Asphalt_A.webp', 24, 24);
const asphaltN = ntex('./textures/CP_Asphalt_N.webp', 24, 24);
const lawnA = tex('./textures/la/grass_diffuse.jpg', 120, 120);
const waterN = ntex('./textures/la/water_normal.jpg', 8, 8);
const gravelN = ntex('./textures/CP_Concrete_03_N.webp', 8, 8);

const M = {
  // Compacted earth: the visitor path. Warm, matte, and slightly redder than
  // the surrounding soil so the route reads at a distance from the ground alone.
  dirt: new THREE.MeshStandardMaterial({
    normalMap: gravelN, normalScale: new THREE.Vector2(0.5, 0.5),
    color: 0xa8825a, roughness: 0.99, metalness: 0.0,
  }),
  dirtEdge: new THREE.MeshStandardMaterial({ color: 0x8d6a46, roughness: 0.99 }),
  plaza: new THREE.MeshStandardMaterial({
    normalMap: concN, normalScale: new THREE.Vector2(0.3, 0.3),
    color: 0xc6bda9, roughness: 0.93, metalness: 0.01,
  }),
  lawn: new THREE.MeshStandardMaterial({ map: lawnA, color: 0x93a86c, roughness: 0.99 }),
  meadow: new THREE.MeshStandardMaterial({ color: 0xa8a071, roughness: 0.99 }),
  sand: new THREE.MeshStandardMaterial({ color: 0xcbb489, roughness: 0.99 }),
  bark: new THREE.MeshStandardMaterial({ color: 0x7c6448, roughness: 0.95 }),
  birch: new THREE.MeshStandardMaterial({ color: 0xd8d2c4, roughness: 0.9 }),
  barkDark: new THREE.MeshStandardMaterial({ color: 0x574636, roughness: 0.95 }),
  foliage: new THREE.MeshStandardMaterial({ color: 0x4f7f42, roughness: 0.97 }),
  foliageDark: new THREE.MeshStandardMaterial({ color: 0x39632f, roughness: 0.97 }),
  foliageLight: new THREE.MeshStandardMaterial({ color: 0x6d9a52, roughness: 0.97 }),
  hedge: new THREE.MeshStandardMaterial({ color: 0x41682f, roughness: 0.98 }),
  bamboo: new THREE.MeshStandardMaterial({ color: 0x8fa350, roughness: 0.9 }),
  timber: new THREE.MeshStandardMaterial({
    normalMap: woodN, normalScale: new THREE.Vector2(0.35, 0.35),
    color: 0xa9763f, roughness: 0.82, metalness: 0.02,
  }),
  // The chalet walls, once they have a door in them. A wall is one box, so
  // from inside you are looking at its back faces — single-sided, the shop
  // simply has no interior and you see the park straight through it.
  timberWall: new THREE.MeshStandardMaterial({
    normalMap: woodN, normalScale: new THREE.Vector2(0.35, 0.35),
    color: 0xa9763f, roughness: 0.82, metalness: 0.02, side: THREE.DoubleSide,
  }),
  timberWallDark: new THREE.MeshStandardMaterial({
    color: 0x6f4a2a, roughness: 0.84, side: THREE.DoubleSide,
  }),
  plank: new THREE.MeshStandardMaterial({ color: 0x9a7448, roughness: 0.9 }),
  ceilingIn: new THREE.MeshStandardMaterial({ color: 0x8a6a48, roughness: 0.95 }),
  timberDark: new THREE.MeshStandardMaterial({ color: 0x6f4a2a, roughness: 0.84 }),
  timberPale: new THREE.MeshStandardMaterial({ color: 0xd0a468, roughness: 0.8 }),
  shingle: new THREE.MeshStandardMaterial({ color: 0x584235, roughness: 0.9 }),
  shingleRed: new THREE.MeshStandardMaterial({ color: 0x8e4a35, roughness: 0.88 }),
  stone: new THREE.MeshStandardMaterial({
    normalMap: stoneN, normalScale: new THREE.Vector2(0.32, 0.32),
    color: 0xc0b9ab, roughness: 0.93, metalness: 0.01,
  }),
  rock: new THREE.MeshStandardMaterial({ color: 0x8b8579, roughness: 0.97 }),
  rockWarm: new THREE.MeshStandardMaterial({ color: 0xa08a70, roughness: 0.96 }),
  concrete: new THREE.MeshStandardMaterial({
    normalMap: concN, normalScale: new THREE.Vector2(0.3, 0.3),
    color: 0xb9b3a8, roughness: 0.94, metalness: 0.02,
  }),
  steel: new THREE.MeshStandardMaterial({ color: 0x4a5158, roughness: 0.42, metalness: 0.72 }),
  steelDark: new THREE.MeshStandardMaterial({ color: 0x2b3036, roughness: 0.46, metalness: 0.66 }),
  // Barrier glass: laminated and thick, so it is greener and less clear than a
  // window. Kept single-pass alpha — a refraction pass on 40 m of glazing is
  // not worth the frame time here.
  barrierGlass: new THREE.MeshPhysicalMaterial({
    color: 0x9fc4bd, roughness: 0.06, metalness: 0.0,
    transparent: true, opacity: 0.2, depthWrite: false,
    clearcoat: 1, clearcoatRoughness: 0.05, side: THREE.DoubleSide,
  }),
  vivGlass: new THREE.MeshPhysicalMaterial({
    color: 0xb6cfd6, roughness: 0.05, metalness: 0.0,
    transparent: true, opacity: 0.1, depthWrite: false,
    clearcoat: 1, clearcoatRoughness: 0.04, side: THREE.DoubleSide,
  }),
  // A vivarium is lit from inside and a reptile house is dark: without its own
  // light the glass is a black rectangle and the snake behind it does not
  // exist. Emissive rather than a real lamp — four point lights on a building
  // nobody enters is not worth the fragment cost.
  vivBack: new THREE.MeshStandardMaterial({
    color: 0xd6c095, emissive: 0xffe3ad, emissiveIntensity: 0.75, roughness: 0.92,
  }),
  water: new THREE.MeshPhysicalMaterial({
    color: 0x4b7f8e, roughness: 0.08, metalness: 0.0,
    transparent: true, opacity: 0.82, clearcoat: 1, clearcoatRoughness: 0.06,
    normalMap: waterN, normalScale: new THREE.Vector2(0.5, 0.5),
  }),
  asphalt: new THREE.MeshStandardMaterial({
    map: asphaltA, normalMap: asphaltN, color: 0x83868a, roughness: 0.97, metalness: 0.01,
  }),
  paintLine: new THREE.MeshStandardMaterial({ color: 0xe8e2cf, roughness: 0.8 }),
  signBoard: new THREE.MeshStandardMaterial({ color: 0x1d4a3a, roughness: 0.72 }),
  signPale: new THREE.MeshStandardMaterial({ color: 0xf2e7cd, roughness: 0.78 }),
  brass: new THREE.MeshStandardMaterial({ color: 0xb08a3c, roughness: 0.38, metalness: 0.7 }),
  fabricRed: new THREE.MeshStandardMaterial({ color: 0xb64a3a, roughness: 0.92 }),
  fabricCream: new THREE.MeshStandardMaterial({ color: 0xe8dcc2, roughness: 0.92 }),
  // Toy fur. Fully rough and slightly desaturated: a plush toy has no highlight
  // on it at all, and the first pass read as painted balls partly because it did.
  plushPink: new THREE.MeshStandardMaterial({ color: 0xc98a94, roughness: 1.0 }),
  plushBlue: new THREE.MeshStandardMaterial({ color: 0x7898b4, roughness: 1.0 }),
  plushYellow: new THREE.MeshStandardMaterial({ color: 0xd0a962, roughness: 1.0 }),
  plushBrown: new THREE.MeshStandardMaterial({ color: 0x9a6f4a, roughness: 1.0 }),
  // Muzzle, inner ears and paw pads, then the eyes and the nose. The pale patch
  // is what makes a bear a bear rather than a snowman: it is where the face is.
  plushCream: new THREE.MeshStandardMaterial({ color: 0xe6d6bb, roughness: 1.0 }),
  plushDark: new THREE.MeshStandardMaterial({ color: 0x261d18, roughness: 0.55 }),
  // Shop fittings. The shades and the bulbs carry their own emission so a lamp
  // still looks lit from outside the one point light's reach — three shops, one
  // light each, and the pendants either side of it read off these instead.
  lampShade: new THREE.MeshStandardMaterial({
    color: 0xe9d7b4, emissive: 0xffcf8e, emissiveIntensity: 0.35, roughness: 0.8,
    side: THREE.DoubleSide,
  }),
  lampGlow: new THREE.MeshStandardMaterial({
    color: 0xfff2d4, emissive: 0xffdca4, emissiveIntensity: 1.6, roughness: 0.6,
  }),
  // Slate, not a hole in the wall: pure black in an unlit corner is the mistake
  // the vivarium glass made, and a board reads as slate mainly by being paler
  // than the shadow it hangs in.
  chalkboard: new THREE.MeshStandardMaterial({ color: 0x37453d, roughness: 0.9 }),
  ceramic: new THREE.MeshStandardMaterial({ color: 0xece7de, roughness: 0.38 }),
  rug: new THREE.MeshStandardMaterial({ color: 0x8d4a3c, roughness: 0.96 }),
  poster: new THREE.MeshStandardMaterial({ color: 0xdfd3b6, roughness: 0.9 }),
  collider: new THREE.MeshBasicMaterial({ visible: false }),
};

const world = new THREE.Group();
scene.add(world);
// Animated scenery. Outside `world` on purpose: nothing here is collidable and
// nothing here should ever be a candidate for the ground probe.
const fauna = new THREE.Group();
const crowd = new THREE.Group();
scene.add(fauna, crowd);

// ---------------------------------------------------------------------------
// Instancing kit (same contract as the villa: everything static goes through
// `emit`, and flushKits turns each geometry+material pair into one draw call)
// ---------------------------------------------------------------------------
function addInstancedPrimitive(geometry, material, items, propFlags) {
  if (!items.length) return null;
  const im = new THREE.InstancedMesh(geometry, material, items.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion();
  const e = new THREE.Euler(), s = new THREE.Vector3(), p = new THREE.Vector3();
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
  if (propFlags?.some(Boolean)) im.userData.prop = propFlags;
  world.add(im);
  return im;
}

const G = {
  box: withUV2(new THREE.BoxGeometry(1, 1, 1)),
  cyl: withUV2(new THREE.CylinderGeometry(0.5, 0.5, 1, 14)),
  cylBase: withUV2(new THREE.CylinderGeometry(0.5, 0.5, 1, 14).translate(0, 0.5, 0)),
  post: withUV2(new THREE.CylinderGeometry(0.5, 0.5, 1, 8).translate(0, 0.5, 0)),
  trunk: withUV2(new THREE.CylinderGeometry(0.32, 0.5, 1, 9).translate(0, 0.5, 0)),
  sphere: withUV2(new THREE.SphereGeometry(0.5, 14, 10)),
  blob: withUV2(new THREE.IcosahedronGeometry(0.5, 1)),
  rock: withUV2(new THREE.DodecahedronGeometry(0.5, 0)),
  cone: withUV2(new THREE.ConeGeometry(0.5, 1, 12).translate(0, 0.5, 0)),
  frond: withUV2(new THREE.ConeGeometry(0.5, 1, 4).translate(0, 0.5, 0)),
  // Gable roof: a 3-sided prism with its axis laid along local Z, so local Z is
  // the ridge and the triangle stands upright in XY. Extents after the two
  // rotations are x +/-0.433 (the span), y -0.25..+0.5 (the rise) and z +/-0.5.
  gable: withUV2(new THREE.CylinderGeometry(0.5, 0.5, 1, 3, 1)
    .rotateX(Math.PI / 2).rotateZ(Math.PI)),
  torus: withUV2(new THREE.TorusGeometry(0.4, 0.1, 8, 18)),
};

const kits = new Map();
let PROP = false;
function emit(geo, mat, item) {
  const key = `${geo.uuid}|${mat.uuid}`;
  let k = kits.get(key);
  if (!k) kits.set(key, (k = { geo, mat, items: [], propFlags: [] }));
  k.items.push(item);
  k.propFlags.push(PROP);
}
function flushKits() {
  for (const k of kits.values()) addInstancedPrimitive(k.geo, k.mat, k.items, k.propFlags);
  kits.clear();
}
function prop(fn) {
  const outer = PROP;
  PROP = true;
  fn();
  PROP = outer;
}

let FX = 0, FZ = 0, FR = 0;
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
  emit(G.box, mat, { x: FX + x * c + z * s, y, z: FZ - x * s + z * c, sx, sy, sz, ry: FR + ry });
}
function shape(geo, mat, x, y, z, sx, sy, sz, rot = {}) {
  const c = Math.cos(FR), s = Math.sin(FR);
  emit(geo, mat, {
    x: FX + x * c + z * s, y, z: FZ - x * s + z * c,
    sx, sy, sz, ry: FR + (rot.ry || 0), rx: rot.rx || 0, rz: rot.rz || 0,
  });
}
// A real light, placed in the frame's coordinates like everything else. Only
// the three shop interiors get one: they are closed boxes the sun cannot reach,
// and the hemisphere alone leaves them the brown gloom they were.
function roomLight(x, y, z, intensity, distance) {
  const c = Math.cos(FR), s = Math.sin(FR);
  const l = new THREE.PointLight(0xffd9a8, intensity, distance, 2);
  l.position.set(FX + x * c + z * s, y, FZ - x * s + z * c);
  world.add(l);
  return l;
}

// A pitched roof over a w x d footprint, sitting on eaves at `eaves`. The yaw
// turns the prism's ridge onto the building's long axis, and the y offset puts
// the eaves where they were asked for rather than the prism's own centre.
function gableRoof(w, d, eaves, rise, mat, oh = 1.1) {
  shape(G.gable, mat, 0, eaves + rise / 3, 0,
    (d + oh * 2) / 0.866, rise / 0.75, w + oh * 2, { ry: Math.PI / 2 });
}
// A long box laid on a bearing is fine to LOOK at and a disaster to collide
// with. cityBoxes.js derives ONE axis-aligned box per instance, which is tight
// only when the yaw is a multiple of 90 degrees — the villa is orthogonal, so
// it never met this. Here a 24 m hedge on a diagonal became a 24 x 5 m solid
// block lying across the path beside it: the invisible wall on the entry spur.
// Emitting a run as short chunks bounds the error to the CHUNK length instead
// of the run length, which for a 2 m chunk is centimetres.
function runBoxes(mat, x0, z0, x1, z1, w, y0, y1, step = 2.2, skip = null) {
  const dx = x1 - x0, dz = z1 - z0;
  const len = Math.hypot(dx, dz);
  if (len < 1e-4) return;
  const n = Math.max(1, Math.round(len / step));
  const ry = Math.atan2(dx, dz);
  const seg = len / n;
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    const cx = x0 + dx * t, cz = z0 + dz * t;
    if (skip?.(cx, cz)) continue;
    box(mat, cx, (y0 + y1) / 2, cz, w, y1 - y0, seg + 0.05, ry);
  }
}

// Distance from a point to the nearest of a set of runs. Used twice: to keep
// the loop's hedge from growing across the spurs that cross it, and to keep the
// woodland from planting itself on a viewing line.
function nearRuns(x, z, clear, runs) {
  for (const [a, b] of runs) {
    const dx = b[0] - a[0], dz = b[1] - a[1];
    const len2 = dx * dx + dz * dz || 1;
    const t = THREE.MathUtils.clamp(((x - a[0]) * dx + (z - a[1]) * dz) / len2, 0, 1);
    if (Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t) < clear) return true;
  }
  return false;
}
function slab(mat, x0, x1, z0, z1, y0, y1) {
  box(mat, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2,
    Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0));
}

// ---------------------------------------------------------------------------
// Site plan (metres). Ground is 0 across the whole park; the land only starts
// moving beyond the perimeter, where it becomes the wooded ridge you see over
// the fence.
// ---------------------------------------------------------------------------
const PATH_Y = 0.09;          // the dirt is a shallow slab, not a decal
const PLAZA_Y = 0.08;         // the hub's paving, likewise
const CHAIR_SEAT = 0.47;      // top of a chair's seat above whatever it stands on
const PARK_HALF = 122;        // flat inside this half-extent about PARK_MID
const PARK_MID = -46;
const GATE_Z = -3;            // the turnstile line
const KIOSK_Z = 9;            // ticket pavilion centre

// The bears keep a real pool, so the terrain carries one basin. The mesh takes
// its vertices from terrainHeight, and groundFn evaluates the same function, so
// cutting the hole here cuts it in the geometry and in the collision at once.
const BASINS = [
  { x0: -14, x1: 8, z0: -119, z1: -106, y: -1.25, rim: 2.2 },
];
function basinMask(x, z, b) {
  const d = Math.max(Math.max(b.x0 - x, x - b.x1), Math.max(b.z0 - z, z - b.z1));
  return 1 - THREE.MathUtils.smoothstep(d, -b.rim, 0);
}
function terrainHeight(x, z) {
  const d = Math.max(Math.abs(x), Math.abs(z - PARK_MID));
  const out = THREE.MathUtils.smoothstep(d, PARK_HALF, PARK_HALF + 90);
  let h = out * (7 + 5.5 * Math.sin(x * 0.019) * Math.cos(z * 0.016) + 2.5 * Math.sin(z * 0.031));
  for (const b of BASINS) h = THREE.MathUtils.lerp(h, Math.min(h, b.y), basinMask(x, z, b));
  return h;
}

// The visitor loop. Authored as waypoints rather than an ellipse: a zoo path
// bends around what it passes, and a perfect ring reads as a running track.
const LOOP = [
  [0, -13], [24, -17], [43, -27], [55, -43], [56, -61],
  [46, -77], [26, -87], [2, -91], [-22, -88], [-43, -79],
  [-56, -63], [-59, -45], [-51, -28], [-30, -18], [-12, -13],
];
const PATH_W = 7.2;
// The two spurs across the middle — the "braid". They are what make the hub
// reachable without walking half the loop for a sandwich.
const SPURS = [
  [[0, -13], [0, -37]],
  [[2, -91], [1, -66]],
];
// Viewing bays: short stubs off the loop up to a barrier the loop itself does
// not run along. Without them the monkeys, the parrots and the reptile house
// are all glimpsed from fifteen metres away across a lawn.
const BAYS = [
  [[56, -60], [60.5, -66]],
  [[53, -39], [62.5, -37]],
  [[-55, -36], [-62.5, -36]],
];

// ---------------------------------------------------------------------------
// Ground surfaces
// ---------------------------------------------------------------------------
function pathRun(a, b, w, mat = M.dirt) {
  const dx = b[0] - a[0], dz = b[1] - a[1];
  const len = Math.hypot(dx, dz);
  if (len < 0.01) return;
  // Overlap by most of the width at each end so the corners of the polyline
  // close up instead of leaving wedges of lawn on the inside of every bend.
  box(mat, (a[0] + b[0]) / 2, PATH_Y / 2, (a[1] + b[1]) / 2,
    w, PATH_Y, len + w * 0.92, Math.atan2(dx, dz));
}
function loopEach(fn) {
  for (let i = 0; i < LOOP.length; i++) fn(LOOP[i], LOOP[(i + 1) % LOOP.length], i);
}

// Car park: bays either side of a central aisle, kerbed planting islands, and
// the bays angled the way a real one is so the aisle can stay narrow.
const PARK_Z0 = 16, PARK_Z1 = 56;
// The bay grid, in one place. The markings are painted from it and the cars are
// parked on it: when the two were written out separately, the cars ended up in
// the aisles and across the lines, and nothing in the code said they disagreed.
// 2.55 x 5.0 m is the standard bay, and the rows are named by their centre.
const BAY_PITCH = 2.55, BAY_X0 = -33, BAY_COUNT = 26, BAY_DEPTH = 5.0;
const BAY_ROWS = [23.0, 35.0, 47.0];
function carPark() {
  slab(M.asphalt, -36, 36, PARK_Z0, PARK_Z1, 0, 0.05);
  // bay markings: a line between every pair of bays, and the head of the row
  for (const z of BAY_ROWS) {
    for (let i = 0; i <= BAY_COUNT; i++) {
      box(M.paintLine, BAY_X0 + i * BAY_PITCH, 0.055, z, 0.12, 0.012, BAY_DEPTH);
    }
    box(M.paintLine, 0, 0.055, z + BAY_DEPTH / 2, 66, 0.012, 0.12);
  }
  // kerbed islands with a tree apiece, between the bay rows
  for (const z of [28.6, 40.6, 52.6]) {
    slab(M.concrete, -34, 34, z - 0.9, z + 0.9, 0.05, 0.19);
    slab(M.lawn, -33.4, 33.4, z - 0.7, z + 0.7, 0.19, 0.21);
    for (let i = -2; i <= 2; i++) shadeTree(i * 13.5, z, 0.9 + (i % 2) * 0.1);
  }
  // perimeter hedge and the entrance cut through it
  hedgeRun(-40, -24, PARK_Z0 - 1.4, PARK_Z0 - 1.4, 1.1);
  hedgeRun(24, 40, PARK_Z0 - 1.4, PARK_Z0 - 1.4, 1.1);
  hedgeRun(-40, -40, PARK_Z0 - 1.4, PARK_Z1 + 2, 1.1);
  hedgeRun(40, 40, PARK_Z0 - 1.4, PARK_Z1 + 2, 1.1);
  for (const x of [-30, -10, 10, 30]) for (const z of [22, 34, 46]) lampPost(x, z, 5.2);
}

function forecourt() {
  // Paved arrival plaza between the car park and the pavilion.
  slab(M.plaza, -26, 26, GATE_Z - 1.2, PARK_Z0 - 1.2, 0, 0.07);
  // A band of paler paving leading the eye from the car park to the arch.
  slab(M.signPale, -5.5, 5.5, GATE_Z, PARK_Z0 - 1.4, 0.07, 0.08);
  for (const x of [-19, 19]) for (const z of [1, 8, 15]) planter(x, z, 1.5);
  for (const x of [-23, 23]) { lampPost(x, 2, 5.2); lampPost(x, 13, 5.2); }
}

// ---------------------------------------------------------------------------
// Planting and street furniture
// ---------------------------------------------------------------------------
// A broadleaf. The crown starts at two thirds of the height and is barely wider
// than it is tall: the first pass hung a crown three times the trunk's width at
// half the trunk's height, which is a lollipop, not a tree.
// Everything planted has to START at the ground under it. These were all
// authored at y = 0, which is right inside the park because the park is flat —
// and wrong everywhere else, so on the rising ground outside the fence the
// trunks were buried and only the crowns cleared the hill: cones floating in
// the sky with nothing holding them up.
const groundAt = (x, z) => terrainHeight(x, z);

function shadeTree(x, z, s = 1, mat = M.foliage) {
  prop(() => {
    const g = groundAt(x, z) - 0.15;
    const h = 7.6 * s;
    // A little per-tree drift, keyed off the position so it is stable between
    // reloads: a row of identical trees is its own kind of unreal.
    const j = Math.sin(x * 12.9898 + z * 78.233) * 0.5;
    const lean = j * 0.06;
    shape(G.trunk, M.bark, x, g, z, 0.34 * s, h * 0.64, 0.34 * s, { rz: lean });
    shape(G.blob, mat, x + j * 0.5, g + h * 0.78, z - j * 0.4, 3.5 * s, 3.0 * s, 3.4 * s,
      { ry: j * 3 });
    shape(G.blob, mat, x - 1.15 * s, g + h * 0.66, z + 0.85 * s, 2.5 * s, 2.0 * s, 2.4 * s,
      { ry: j });
    shape(G.blob, M.foliageDark, x + 1.05 * s, g + h * 0.91, z - 0.7 * s,
      2.1 * s, 1.7 * s, 2.0 * s, { ry: -j * 2 });
    shape(G.blob, mat, x + 0.5 * s, g + h * 0.58, z - 1.2 * s, 1.9 * s, 1.5 * s, 1.8 * s);
  });
}
// A conifer is a tapering STACK, widest low down, with the trunk showing under
// the first whorl — not two cones balanced on a stick.
function pine(x, z, s = 1) {
  prop(() => {
    const g = groundAt(x, z) - 0.15;
    const j = Math.sin(x * 45.164 + z * 21.9) * 0.5;
    shape(G.trunk, M.barkDark, x, g, z, 0.34 * s, 3.0 * s, 0.34 * s);
    const tiers = [[1.5, 4.6, 3.2], [3.3, 3.7, 2.9], [5.1, 2.8, 2.6], [6.7, 1.8, 2.2]];
    for (const [y, r, hh] of tiers) {
      shape(G.cone, M.foliageDark, x, g + (y + j * 0.2) * s, z,
        r * s, hh * s, r * s, { ry: j * 4 });
    }
  });
}
// A birch: pale slender trunk that FORKS low, and a light open crown. It is the
// counterpoint the planting needed — every other tree here is a heavy dark mass,
// and a park reads as planted rather than grown when everything in it is the
// same tree at three sizes.
function birch(x, z, s = 1) {
  prop(() => {
    const g = groundAt(x, z) - 0.12;
    const j = Math.sin(x * 33.7 + z * 61.1) * 0.5;
    const h = (8.4 + j * 2.0) * s;
    shape(G.trunk, M.birch, x, g, z, 0.24 * s, h * 0.5, 0.24 * s, { rz: j * 0.05 });
    for (const fork of [-1, 1]) {
      const lean = 0.16 * fork + j * 0.05;
      shape(G.trunk, M.birch, x + fork * 0.18 * s, g + h * 0.46, z,
        0.15 * s, h * 0.5, 0.15 * s, { rz: lean });
      const tx = x + fork * (0.18 + Math.sin(lean) * h * 0.5) * s;
      for (let i = 0; i < 3; i++) {
        shape(G.blob, i ? M.foliageLight : M.foliage,
          tx + (i - 1) * 1.1 * s, g + h * (0.78 + i * 0.07), z + (j + i - 1) * 0.9 * s,
          (2.4 - i * 0.35) * s, (1.9 - i * 0.3) * s, (2.3 - i * 0.35) * s, { ry: j * 4 + i });
      }
    }
  });
}
// Understorey. Nothing tall, and it goes where a park actually plants it: at the
// foot of the trees and along the barrier lines, so the ground between the path
// and the fence is not bare lawn.
function shrub(x, z, s = 1, mat = M.hedge) {
  prop(() => {
    const g = groundAt(x, z);
    const j = Math.sin(x * 91.3 + z * 17.7) * 0.5;
    shape(G.blob, mat, x, g, z, (2.1 + j) * s, (1.3 + j * 0.4) * s, (1.9 + j) * s, { ry: j * 6 });
    shape(G.blob, M.foliageDark, x + 0.7 * s, g, z - 0.5 * s,
      (1.4 + j * 0.6) * s, (0.9 + j * 0.3) * s, (1.3 + j * 0.6) * s, { ry: -j * 4 });
  });
}
function hedgeRun(x0, x1, z0, z1, h = 1.2, skip = null) {
  prop(() => runBoxes(M.hedge, x0, z0, x1, z1, 0.9, 0, h, 2.0, skip));
}
function planter(x, z, r = 1.4) {
  prop(() => {
    shape(G.cylBase, M.stone, x, 0, z, r * 2, 0.55, r * 2);
    shape(G.blob, M.foliageLight, x, 0.62, z, r * 1.7, 0.9, r * 1.7);
    shape(G.blob, M.foliage, x + r * 0.4, 0.78, z - r * 0.3, r * 1.1, 0.7, r * 1.1);
  });
}
function lampPost(x, z, h = 4.6) {
  prop(() => {
    shape(G.cylBase, M.steelDark, x, 0, z, 0.34, 0.3, 0.34);
    shape(G.post, M.steelDark, x, 0.25, z, 0.13, h, 0.13);
    shape(G.box, M.signPale, x, h + 0.28, z, 0.42, 0.2, 0.42);
  });
}
function bin(x, z, ry = 0, y0 = PATH_Y) {
  prop(() => {
    frame(x, z, ry, () => {
      shape(G.cylBase, M.timberDark, 0, y0, 0, 0.62, 0.9, 0.62);
      shape(G.cylBase, M.steelDark, 0, y0 + 0.9, 0, 0.66, 0.09, 0.66);
    });
  });
}
// A park bench you can actually sit on — the seat is registered with the
// interaction table so it behaves like the villa's armchairs. `y0` is the
// surface it stands on: the path slab for most of them, the hub's paving for
// the four on the plaza. Built from the buildings' datum instead, the frame
// sank 9 cm and took the seat down with it, and a seat that low is what sent
// the sitter's thighs up — see the floor the interaction is given below.
function bench(x, z, ry, y0 = PATH_Y) {
  prop(() => {
    frame(x, z, ry, () => {
      furnitureInteraction('sit', 0.9, 0.42, 0, y0 + 0.47, y0);
      for (const sx of [-0.78, 0.78]) {
        box(M.steelDark, sx, y0 + 0.21, 0.02, 0.09, 0.42, 0.62);
        box(M.steelDark, sx, y0 + 0.62, -0.24, 0.08, 0.5, 0.1);
      }
      for (let i = 0; i < 4; i++) {
        box(M.timber, 0, y0 + 0.45, -0.24 + i * 0.16, 1.9, 0.06, 0.13);
      }
      for (let i = 0; i < 3; i++) {
        box(M.timber, 0, y0 + 0.62 + i * 0.16, -0.28, 1.9, 0.13, 0.06);
      }
    });
  });
}
// Interpretation sign: the leaning board every exhibit rail carries.
function exhibitSign(x, z, ry, label = M.signBoard) {
  prop(() => {
    frame(x, z, ry, () => {
      for (const sx of [-0.62, 0.62]) shape(G.post, M.timberDark, sx, 0, 0, 0.11, 0.95, 0.11);
      box(label, 0, 1.02, 0.06, 1.5, 0.72, 0.07, 0);
      box(M.signPale, 0, 1.02, 0.02, 1.34, 0.58, 0.05, 0);
    });
  });
}
// Fingerpost at the path junctions.
function fingerPost(x, z, arms) {
  prop(() => {
    shape(G.post, M.timberDark, x, 0, z, 0.17, 3.1, 0.17);
    arms.forEach((ry, i) => {
      frame(x, z, ry, () => box(M.signBoard, 0.85, 2.85 - i * 0.36, 0, 1.5, 0.26, 0.06));
    });
  });
}

// ---------------------------------------------------------------------------
// Barriers. Nothing here is a cage with a door onto the path: each is the
// standard for its species, and each is drawn as a run between two points so an
// enclosure is a list of edges rather than a special case.
// ---------------------------------------------------------------------------

// Post-and-rail: the stand-off that keeps visitors a metre back from the real
// barrier. It is not what holds the animal — but it is read as if it were, so
// each run goes the full length of its viewing face. Stopping three or four
// metres short of the corner, which is what these did, leaves a rail ending in
// mid-air beside an enclosure that is perfectly well closed behind it.
function railRun(x0, z0, x1, z1, { h = 1.1, step = 2.3 } = {}) {
  const dx = x1 - x0, dz = z1 - z0;
  const len = Math.hypot(dx, dz);
  const ry = Math.atan2(dx, dz);
  const n = Math.max(2, Math.round(len / step));
  prop(() => {
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      shape(G.post, M.timberDark, x0 + dx * t, 0, z0 + dz * t, 0.15, h, 0.15);
    }
    for (const y of [h * 0.55, h * 0.94]) {
      runBoxes(M.timber, x0, z0, x1, z1, 0.09, y - 0.065, y + 0.065, 2.4);
    }
  });
}
// Glass-topped plinth: stone base carrying laminated panels in steel mullions.
// This is the one holding the lions and the bears in.
function glassBarrier(x0, z0, x1, z1, { plinth = 0.85, glass = 3.0, step = 2.6 } = {}) {
  const dx = x1 - x0, dz = z1 - z0;
  const len = Math.hypot(dx, dz);
  const ry = Math.atan2(dx, dz);   // mullions only: the panels go through runBoxes
  runBoxes(M.stone, x0, z0, x1, z1, 0.62, 0, plinth, 3.0);
  runBoxes(M.concrete, x0, z0, x1, z1, 0.72, plinth, plinth + 0.1, 3.0);
  runBoxes(M.barrierGlass, x0, z0, x1, z1, 0.1, plinth + 0.1, plinth + 0.1 + glass, 3.0);
  runBoxes(M.steel, x0, z0, x1, z1, 0.22, plinth + 0.05 + glass, plinth + 0.19 + glass, 3.0);
  const n = Math.max(2, Math.round(len / step));
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    box(M.steel, x0 + dx * t, plinth + 0.1 + glass / 2, z0 + dz * t, 0.16, glass, 0.16, ry);
  }
}
// Post-and-rail with mesh infill: the standard for hoofstock. Deer jump, so the
// line is high; alpacas do not, so theirs is lower. Neither wants glass — you
// stand at the rail and they come to you, which is half the point of a paddock.
function stockFence(x0, z0, x1, z1, { h = 2.4, rails = 4, step = 2.6, mesh = true } = {}) {
  const dx = x1 - x0, dz = z1 - z0;
  const len = Math.hypot(dx, dz);
  const n = Math.max(2, Math.round(len / step));
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    shape(G.post, M.timberDark, x0 + dx * t, 0, z0 + dz * t, 0.19, h + 0.12, 0.19);
  }
  for (let r = 0; r < rails; r++) {
    const y = 0.42 + (h - 0.55) * (r / Math.max(1, rails - 1));
    runBoxes(M.timber, x0, z0, x1, z1, 0.1, y - 0.06, y + 0.06, 2.6);
  }
  if (mesh) runBoxes(meshMat, x0, z0, x1, z1, 0.05, 0.15, h, 3.0);
}

// Mesh volume: what primates and birds need, because both climb or fly out of
// anything with an open top. Drawn as a frame plus a translucent screen — a
// real wire grid would be tens of thousands of instances for no gain at
// gameplay distance.
// Two grades. A visitor looks through ONE wall but the camera looks through the
// near wall, the roof and the far wall at once, and at any opacity that reads
// as mesh on its own those three multiply into a thunderstorm. The screen is
// therefore barely there and the frame does the describing; the roof is fainter
// still, because it is the layer the sky has to survive.
const meshMat = new THREE.MeshStandardMaterial({
  color: 0x9aa4ad, roughness: 0.62, metalness: 0.42,
  transparent: true, opacity: 0.13, side: THREE.DoubleSide,
});
const meshRoofMat = new THREE.MeshStandardMaterial({
  color: 0xa8b2bb, roughness: 0.62, metalness: 0.42,
  transparent: true, opacity: 0.07, side: THREE.DoubleSide, depthWrite: false,
});
function meshWall(x0, z0, x1, z1, h, { step = 3.2, screen = true } = {}) {
  const dx = x1 - x0, dz = z1 - z0;
  const len = Math.hypot(dx, dz);
  runBoxes(M.steelDark, x0, z0, x1, z1, 0.4, 0, 0.36, 3.2);              // ground beam
  if (screen) runBoxes(meshMat, x0, z0, x1, z1, 0.06, 0.36, 0.36 + h, 3.2);
  runBoxes(M.steelDark, x0, z0, x1, z1, 0.22, 0.27 + h, 0.45 + h, 3.2);  // head rail
  const n = Math.max(2, Math.round(len / step));
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    shape(G.post, M.steelDark, x0 + dx * t, 0.2, z0 + dz * t, 0.2, h + 0.2, 0.2);
  }
}
function meshRoof(x0, z0, x1, z1, h) {
  box(meshRoofMat, (x0 + x1) / 2, h + 0.36, (z0 + z1) / 2,
    Math.abs(x1 - x0), 0.06, Math.abs(z1 - z0));
  for (let x = x0 + 4; x < x1; x += 6) {
    box(M.steelDark, x, h + 0.42, (z0 + z1) / 2, 0.14, 0.14, Math.abs(z1 - z0));
  }
}

// ---------------------------------------------------------------------------
// Buildings
// ---------------------------------------------------------------------------

// A chalet: stacked-log walls, a deep gable, exposed purlins and a stone base.
// `front` is the wall the doors and windows go in, on local -Z.
// `doorW` is now a real opening, not a panel painted on the wall: the front
// courses stop either side of it and resume over the head, so you can walk in.
// That means the walls are seen from inside, hence M.timberWall — and it means
// the shop needs a ceiling, or you look up through the roof prism's back faces
// at the sky.
function chalet(w, d, { h = 3.5, roof = M.shingle, windows = 3, doorW = 1.8,
  interior = null } = {}) {
  const hw = w / 2, hd = d / 2;
  const DOOR_H = 2.4;
  const jamb = doorW / 2;
  box(M.stone, 0, 0.22, 0, w + 0.9, 0.44, d + 0.9);            // plinth
  // Log walls: courses rather than a slab, which is the whole look of a chalet.
  const courses = Math.round(h / 0.34);
  for (let i = 0; i < courses; i++) {
    const y = 0.44 + i * 0.34 + 0.17;
    const inset = (i % 2) * 0.04;
    if (y - 0.17 >= 0.44 + DOOR_H) {
      box(M.timberWall, 0, y, -hd + inset, w, 0.33, 0.3);      // over the head
    } else {
      const seg = hw - jamb;
      box(M.timberWall, -(jamb + seg / 2), y, -hd + inset, seg, 0.33, 0.3);
      box(M.timberWall, jamb + seg / 2, y, -hd + inset, seg, 0.33, 0.3);
    }
    box(M.timberWall, 0, y, hd - inset, w, 0.33, 0.3);
    box(M.timberWallDark, -hw + inset, y, 0, 0.3, 0.33, d);
    box(M.timberWallDark, hw - inset, y, 0, 0.3, 0.33, d);
  }
  const top = 0.44 + h;
  // Ceiling: the roof is a closed prism and its inside faces are backfaces, so
  // without this you stand in the shop and look at the sky.
  box(M.ceilingIn, 0, top - 0.08, 0, w, 0.16, d);
  box(M.plank, 0, 0.47, 0, w - 0.6, 0.06, d - 0.6);            // floorboards
  // Doorway: jambs, lintel, a threshold and one leaf standing open.
  for (const sx of [-1, 1]) {
    box(M.timberDark, sx * (jamb + 0.09), 0.44 + DOOR_H / 2, -hd - 0.02, 0.18, DOOR_H, 0.46);
  }
  box(M.timberDark, 0, 0.44 + DOOR_H + 0.11, -hd - 0.02, doorW + 0.4, 0.22, 0.46);
  box(M.stone, 0, 0.45, -hd - 0.26, doorW + 0.4, 0.1, 0.6);
  box(M.timber, -(jamb - 0.05), 0.44 + DOOR_H / 2, -hd - 0.5, 0.1, DOOR_H - 0.1, doorW * 0.9);
  box(M.brass, -(jamb - 0.05), 0.44 + 1.05, -hd - 0.5 - doorW * 0.4, 0.1, 0.1, 0.1);
  if (interior) interior({ hw, hd, top });
  for (let i = 0; i < windows; i++) {
    const x = -w * 0.32 + (w * 0.64 * i) / Math.max(1, windows - 1);
    if (Math.abs(x) < doorW * 0.7) continue;
    box(M.timberPale, x, 0.44 + 1.75, -hd - 0.08, 1.35, 1.15, 0.1);
    box(M.vivGlass, x, 0.44 + 1.75, -hd - 0.13, 1.15, 0.95, 0.06);
    box(M.timberDark, x, 0.44 + 1.16, -hd - 0.2, 1.5, 0.1, 0.28);   // sill
    prop(() => shape(G.blob, M.foliageLight, x, 0.44 + 1.32, -hd - 0.26, 1.1, 0.4, 0.5));
  }
  // Gable roof with a real overhang and exposed purlin ends.
  gableRoof(w, d, top, Math.max(1.7, d * 0.3), roof, 1.2);
  box(M.timberDark, 0, top - 0.06, 0, w + 2.6, 0.16, d + 2.4);   // fascia
  for (let i = -2; i <= 2; i++) {                                 // purlin ends
    box(M.timberDark, 0, top + 0.06, i * (d / 4.2), w + 2.9, 0.13, 0.15);
  }
  return top;
}

// What you see once you are inside. Kept to the back of the room so the doorway
// stays clear, and flagged as prop so none of it is mistaken for floor.
//
// A counter, three bare shelves and nothing else was a stockroom with a till in
// it — you walk in, there is no light, no floor, nothing on the walls and
// nothing overhead, and you walk straight back out. What a real shop interior
// carries, and what is built below: light of its own, something underfoot,
// something at eye level on the side walls, and greenery in the dead corners.
function shopInterior({ hw, hd, top }, kind) {
  const F = 0.5;                    // floorboard top
  const back = hd - 0.35;           // the shelving wall
  const T = i => F + 0.635 + i * 0.62;             // top of shelf i
  const ceiling = (top ?? F + 3.0) - 0.16;
  // The rug is FLOOR, and it is emitted out here on purpose, where the
  // floorboards are: a prop AABB is solid at whatever height it sits at,
  // because the step-up shortcut that lets you walk onto a low box is skipped
  // for props. Flagged as one, four centimetres of rug is a wall across the
  // room — which is what shut all three shops.
  box(M.rug, 0, F + 0.02, -hd * 0.3, hw * 1.1, 0.04, hd * 0.85);
  prop(() => {
    box(M.timber, 0, F + 0.5, hd - 1.4, hw * 1.5, 1.0, 0.7);          // counter
    box(M.timberPale, 0, F + 1.02, hd - 1.4, hw * 1.5 + 0.1, 0.06, 0.8);
    for (let i = 0; i < 3; i++) {                                     // back shelves
      box(M.plank, 0, F + 0.6 + i * 0.62, back, hw * 1.7, 0.07, 0.5);
    }

    // Pendant lamps on cords, and one point light between them doing the work
    // of all three. The shades are emissive, so they still read as lit from the
    // far corner where the light itself has fallen off.
    const lamps = hw > 4.5 ? 3 : 1;
    // Clamped to the room: the kiosk's walls are 2.6 m and a pendant hung at
    // the chalets' height puts its cord through its own ceiling. The rim also
    // has to stay over head height (floor + 1.7), or the lamp is a prop you
    // walk into in the middle of your own shop.
    const shadeY = Math.min(F + 2.1, ceiling - 0.4);
    const cord = ceiling - shadeY - 0.34;
    for (let i = 0; i < lamps; i++) {
      const lx = lamps === 1 ? 0 : (i - 1) * hw * 0.6;
      if (cord > 0.05) {
        box(M.steelDark, lx, ceiling - cord / 2, -hd * 0.15, 0.05, cord, 0.05);
      }
      shape(G.cone, M.lampShade, lx, shadeY, -hd * 0.15, 0.62, 0.34, 0.62);
      shape(G.sphere, M.lampGlow, lx, shadeY + 0.1, -hd * 0.15, 0.17, 0.17, 0.17);
    }
    roomLight(0, shadeY + 0.25, -hd * 0.1, 7 + hw * 1.2, hw * 3.4);

    // Greenery in the two corners the counter leaves empty — that, and the rug
    // above, are what stop a room reading as unfinished.
    for (const sx of [-1, 1]) {
      const px = sx * (hw - 0.75);
      shape(G.cylBase, M.rockWarm, px, F, -hd + 1.0, 0.58, 0.52, 0.58);
      shape(G.blob, M.foliage, px, F + 0.6, -hd + 1.0, 0.95, 1.0, 0.95);
      shape(G.blob, M.foliageDark, px, F + 1.0, -hd + 1.0, 0.7, 0.66, 0.7);
    }
    // Framed prints on the side walls, at the height a picture is actually
    // hung. The log courses stop 15 cm inside the half-width.
    for (const sx of [-1, 1]) {
      for (let i = 0; i < 2; i++) {
        const pz = -hd * 0.5 + i * hd * 0.72;
        box(M.timberDark, sx * (hw - 0.19), F + 1.6, pz, 0.05, 0.78, 1.0);
        box(M.poster, sx * (hw - 0.23), F + 1.6, pz, 0.03, 0.6, 0.82);
        shape(G.blob, M.foliageDark, sx * (hw - 0.26), F + 1.5, pz, 0.02, 0.34, 0.46);
      }
    }

    if (kind === 'shop') {
      // The stock, sitting on all three back shelves and facing the door. Six
      // spread over eleven metres of shelving read as a shop being emptied.
      for (let i = 0; i < 24; i++) {
        const row = Math.floor(i / 8), col = i % 8;
        plushBear(-hw * 0.77 + col * (hw * 0.22), back, T(row), 0.34,
          BEAR_FURS[(col + row) % BEAR_FURS.length], ((col % 3) - 1) * 0.2);
      }
      // Till, a spinner of postcards by the door, and bunting overhead.
      box(M.steelDark, -hw * 0.5, F + 1.13, hd - 1.55, 0.42, 0.16, 0.34);
      box(M.ceramic, -hw * 0.5, F + 1.26, hd - 1.62, 0.36, 0.12, 0.2, 0.4);
      shape(G.post, M.steelDark, hw * 0.62, F, -hd * 0.55, 0.09, 1.5, 0.09);
      for (let i = 0; i < 3; i++) {
        box(M.poster, hw * 0.62, F + 1.15, -hd * 0.55, 0.5, 0.62, 0.04,
          i * (Math.PI / 3));
      }
      // Bunting: a cord across the room with pennants hanging off it. Flat
      // squares stuck to the ceiling was the first pass, and they read as
      // sticky notes.
      const cordY = ceiling - 0.22;
      box(M.timberDark, 0, cordY, -hd * 0.55, hw * 1.9, 0.03, 0.03);
      for (let i = 0; i < 11; i++) {
        shape(G.cone, BEAR_FURS[i % BEAR_FURS.length],
          -hw * 0.85 + i * (hw * 0.17), cordY, -hd * 0.55, 0.26, 0.3, 0.04,
          { rx: Math.PI });
      }
    } else {
      for (let i = 0; i < 8; i++) {                                   // stock
        box(i % 2 ? M.fabricCream : M.fabricRed,
          -hw * 0.7 + i * (hw * 0.2), F + 0.76, back, 0.28, 0.26, 0.3);
      }
      box(M.steel, hw * 0.55, F + 0.6, hd - 1.4, 0.9, 1.2, 0.6);      // coffee machine
      // Menu board over the shelves, cups and jars on them, and a cake under a
      // dome on the counter — a cafe is its menu and its crockery. The board
      // only goes up where there is wall left above the shelving: in the kiosk
      // there are 50 cm between the top shelf and the ceiling, and it would sit
      // across both.
      if (ceiling - T(2) > 0.9) {
        const boardY = T(2) + 0.55;
        box(M.chalkboard, -hw * 0.35, boardY, back + 0.12, hw * 0.9, 0.86, 0.06);
        for (let i = 0; i < 5; i++) {
          box(M.signPale, -hw * 0.47, boardY + 0.28 - i * 0.15, back + 0.08,
            hw * 0.4 - i * 0.06, 0.028, 0.02);
        }
      }
      for (let i = 0; i < 9; i++) {
        const px = -hw * 0.8 + i * (hw * 0.2);
        shape(G.cyl, M.ceramic, px, T(1) + 0.09, back, 0.17, 0.18, 0.17);
        if (i % 2) shape(G.cyl, M.brass, px + 0.24, T(2) + 0.13, back, 0.15, 0.26, 0.15);
      }
      shape(G.cylBase, M.timberPale, -hw * 0.62, F + 1.05, hd - 1.4, 0.62, 0.06, 0.62);
      shape(G.sphere, M.vivGlass, -hw * 0.62, F + 1.11, hd - 1.4, 0.6, 0.66, 0.6);
      shape(G.cyl, M.fabricCream, -hw * 0.62, F + 1.2, hd - 1.4, 0.36, 0.18, 0.36);
    }
  });
}

// The billetterie. TWO pavilions, flanking the walk rather than one sitting
// across it — the first pass put a 26 m building on the only route from the car
// park to the gate, which is a wall with a roof on it. Two of them turned to
// face each other give the queue somewhere to stand, keep the axis clear, and
// frame the arch, which is what an entrance plaza is for.
function ticketPavilion(side) {
  // side = -1 west, +1 east. `frame` sends local -Z (the window face) to the
  // heading (-sin ry, -cos ry), so a yaw of side*90 deg is what turns each
  // pavilion's counter onto the centre line rather than out to the field.
  frame(side * 15, KIOSK_Z, side * Math.PI / 2, () => {
    const top = chalet(14, 7, { h: 3.3, roof: M.shingleRed, windows: 0, doorW: 1.4 });
    for (const x of [-4.2, 0, 4.2]) {
      box(M.timberPale, x, 1.9, -3.6, 2.4, 1.5, 0.14);
      box(M.vivGlass, x, 1.95, -3.67, 2.15, 1.2, 0.06);
      box(M.stone, x, 1.05, -3.8, 2.6, 0.16, 0.5);              // counter shelf
      box(M.signBoard, x, 2.9, -3.67, 2.5, 0.4, 0.1);           // CAISSE plate
    }
    // Canopy on posts: shade for the queue, and the depth that makes this read
    // as a pavilion rather than a shed.
    box(M.timberDark, 0, 3.4, -5.8, 15, 0.22, 4.6);
    box(M.shingleRed, 0, 3.56, -5.8, 15.4, 0.16, 4.8);
    for (const x of [-6, 0, 6]) shape(G.post, M.timberDark, x, 0, -7.8, 0.26, 3.4, 0.26);
    box(M.signBoard, 0, top + 0.8, -3.7, 8.4, 1.3, 0.2);
    box(M.signPale, 0, top + 0.8, -3.82, 7.6, 0.85, 0.1);
    planter(-7.4, -6.8, 1.2);
    planter(7.4, -6.8, 1.2);
    bin(6.4, -8.6, 0);
  });
}

// The turnstile line. Wide enough to read as an entrance, closed enough that
// there is one way in.
function entryGates() {
  const z = GATE_Z;
  // Flanking walls out to the perimeter.
  slab(M.stone, -30, -6.5, z - 0.5, z + 0.5, 0, 2.5);
  slab(M.stone, 6.5, 30, z - 0.5, z + 0.5, 0, 2.5);
  box(M.timberDark, -18.25, 2.62, z, 23.5, 0.26, 1.0);
  box(M.timberDark, 18.25, 2.62, z, 23.5, 0.26, 1.0);
  // Entrance arch over the turnstiles.
  for (const x of [-6.2, 6.2]) {
    shape(G.post, M.timberDark, x, 0, z, 0.75, 5.6, 0.75);
    shape(G.cylBase, M.stone, x, 0, z, 1.15, 0.6, 1.15);
  }
  box(M.timberDark, 0, 5.7, z, 14.6, 0.5, 1.1);
  box(M.signBoard, 0, 6.35, z, 12.4, 1.2, 0.34);
  box(M.signPale, 0, 6.35, z - 0.2, 11.4, 0.78, 0.16);
  frame(0, z, 0, () => gableRoof(15, 1.6, 6.95, 1.2, M.shingleRed, 0.4));
  // Four turnstiles in pairs, with a WIDE accessible lane down the middle. The
  // first pass put a drum on the centre line, so walking straight at the
  // entrance walked straight into it — every zoo keeps one lane clear for
  // pushchairs and chairs, and it is also the lane a player aims for.
  for (const x of [-5.0, -2.6, 2.6, 5.0]) {
    shape(G.cylBase, M.steelDark, x, 0, z, 0.5, 1.05, 0.5);
    for (let i = 0; i < 3; i++) {
      box(M.steel, x, 0.95, z, 1.4, 0.09, 0.09, (i * Math.PI * 2) / 3 + x);
    }
  }
  for (const x of [-6.2, -3.8, -1.5, 1.5, 3.8, 6.2]) {
    box(M.steel, x, 0.55, z, 0.1, 1.1, 3.2);
  }
  // The gate leaf for that lane, parked open against its post: read as a gate,
  // collide as nothing in the lane itself.
  box(M.steel, -1.5, 0.55, z + 1.5, 0.1, 1.05, 1.4);
  shape(G.post, M.steelDark, -1.5, 0, z + 2.1, 0.16, 1.15, 0.16);
}

// Reptile house: the snakes. A masonry building you walk up to, with the
// vivaria lit behind glass in its front wall — the barrier IS the exhibit here.
function farmBarn(x, z, ry) {
  frame(x, z, ry, () => {
    const { w, d } = BARN, H = 4.2;
    const F = -d / 2;               // the front plane, facing the path
    const T = 0.5;                  // wall thickness
    // Openings in the front wall: four vivaria and the door between them. The
    // first pass built the house as one solid box and hung the glass on its
    // face, which is why every vivarium was a black rectangle — there was no
    // recess behind the glass for anything to be IN. The wall is therefore
    // built as piers between the openings, with a lit chamber 2 m deep behind.
    const VIV = [[-8, 1.5], [-4.4, 1.5], [4.4, 1.5], [8, 1.5]];
    const DOOR = [0, 1.3];
    const SILL = 0.78, HEAD = 3.05, DOOR_H = 2.5;

    slab(M.concrete, -w / 2 - 0.6, w / 2 + 0.6, F - 0.6, d / 2 + 0.6, 0, 0.3);
    slab(M.stone, -w / 2, w / 2, d / 2 - T, d / 2, 0, H);              // back
    slab(M.stone, -w / 2, -w / 2 + T, F, d / 2, 0, H);                 // west
    slab(M.stone, w / 2 - T, w / 2, F, d / 2, 0, H);                   // east
    // Front wall: piers, then the band over every opening, then sills.
    let cursor = -w / 2;
    for (const [cx, hw] of [...VIV, DOOR].sort((a, b) => a[0] - b[0])) {
      slab(M.stone, cursor, cx - hw, F, F + T, 0, H);
      cursor = cx + hw;
    }
    slab(M.stone, cursor, w / 2, F, F + T, 0, H);
    slab(M.stone, -w / 2, w / 2, F, F + T, HEAD, H);
    for (const [cx, hw] of VIV) slab(M.stone, cx - hw, cx + hw, F, F + T, 0, SILL);
    slab(M.stone, DOOR[0] - DOOR[1], DOOR[0] + DOOR[1], F, F + T, DOOR_H, HEAD);
    // The chamber the vivaria are let into: lit back panel and ceiling, so the
    // glass has something behind it and the snakes are actually visible.
    slab(M.vivBack, -w / 2 + T, w / 2 - T, F + 2.0, F + 2.2, 0, HEAD);
    slab(M.vivBack, -w / 2 + T, w / 2 - T, F + T, F + 2.0, HEAD - 0.14, HEAD);
    slab(M.stone, -w / 2 + T, w / 2 - T, F + 2.2, d / 2 - T, 0, H);    // back of house
    gableRoof(w, d, H, 1.7, M.shingle, 0.9);
    box(M.timberDark, 0, H - 0.06, 0, w + 2.0, 0.18, d + 1.8);         // fascia
    box(M.timberDark, 0, H - 0.24, F - 0.02, w, 0.4, 0.14);            // eaves band

    // Each vivarium: floor, planting, then glass in a four-bar frame. A filled
    // rectangle of steel over the opening is what the frame used to be, and it
    // was the black rectangle in every screenshot.
    for (const [cx, hw] of VIV) {
      box(M.sand, cx, SILL + 0.1, F + 1.2, hw * 2 - 0.1, 0.2, 1.5);
      prop(() => {
        shape(G.blob, M.foliageDark, cx - 1.0, SILL + 0.42, F + 1.5, 0.9, 0.7, 0.6);
        shape(G.post, M.barkDark, cx + 0.95, SILL + 0.2, F + 1.5, 0.14, 1.3, 0.14, { rz: 0.4 });
        shape(G.rock, M.rockWarm, cx + 0.15, SILL + 0.3, F + 1.7, 0.7, 0.4, 0.5, { ry: cx });
      });
      // A Dutch door: bottom leaf shut, top leaf open. It is the single detail
      // that says stable rather than shed, and it leaves the stall visible.
      const midY = (SILL + HEAD) / 2, h = HEAD - SILL;
      box(M.timber, cx, SILL + 0.55, F + 0.14, hw * 2 - 0.1, 1.1, 0.09);
      box(M.timberDark, cx, SILL + 0.55, F + 0.10, hw * 2 - 0.1, 0.12, 0.05);
      box(M.timberDark, cx + hw - 0.22, midY + 0.35, F - 0.02, 0.36, 1.5, 0.08);  // open leaf
      for (const [bx, by, bw, bh] of [
        [cx, SILL + 0.02, hw * 2, 0.09], [cx, HEAD - 0.05, hw * 2, 0.1],
        [cx - hw + 0.05, midY, 0.1, h], [cx + hw - 0.05, midY, 0.1, h],
      ]) box(M.timberDark, bx, by, F + 0.14, bw, bh, 0.11);
    }
    // Entrance reveal and the name board over it.
    box(M.timberDark, 0, DOOR_H / 2, F + 0.06, DOOR[1] * 2 + 0.3, DOOR_H, 0.18);
    box(M.signBoard, 0, HEAD + 0.55, F - 0.14, 5.4, 0.85, 0.16);
    box(M.signPale, 0, HEAD + 0.55, F - 0.24, 4.8, 0.5, 0.08);
  });
}

// A teddy bear, sitting. What the shop had before was a big sphere with a small
// sphere on it and two smaller ones for ears, which reads as a snowman: the
// things that say BEAR at two metres are the pale muzzle patch, ears standing
// off the side of the head rather than on top of it, and stubby legs out in
// front. Sixteen ellipsoids, all off the one instanced sphere.
//
// (x, z) is where it sits, `base` the surface under it, `s` its sitting height
// in metres, and everything below is written in units of `s` with the face
// looking down local -Z.
const BEAR_FURS = [M.plushBrown, M.plushPink, M.plushBlue, M.plushYellow];
function plushBear(x, z, base, s, fur, ry = 0) {
  frame(x, z, ry, () => {
    const at = (mat, px, py, pz, dx, dy, dz, rot) =>
      shape(G.sphere, mat, px * s, base + py * s, pz * s, dx * s, dy * s, dz * s, rot);
    at(fur, 0, 0.29, 0.02, 0.56, 0.52, 0.50);                     // belly
    at(fur, 0, 0.52, -0.02, 0.46, 0.38, 0.42);                    // chest
    at(M.plushCream, 0, 0.33, -0.21, 0.30, 0.30, 0.16);           // tummy patch
    at(fur, 0, 0.76, 0, 0.46, 0.44, 0.44);                        // head
    at(M.plushCream, 0, 0.71, -0.18, 0.25, 0.20, 0.20);           // muzzle
    at(M.plushDark, 0, 0.74, -0.28, 0.09, 0.07, 0.07);            // nose
    for (const sx of [-1, 1]) {
      at(M.plushDark, sx * 0.10, 0.82, -0.19, 0.06, 0.06, 0.06);  // eye
      at(fur, sx * 0.19, 0.94, 0.01, 0.20, 0.20, 0.11);           // ear
      at(M.plushCream, sx * 0.19, 0.94, -0.04, 0.11, 0.11, 0.07);
      // Arms off the shoulder, angled out at the wrist: a seam-sewn toy arm
      // hangs at about 25 degrees, and straight down looks like a doll.
      at(fur, sx * 0.27, 0.46, -0.06, 0.18, 0.34, 0.20, { rz: sx * 0.42 });
      at(M.plushCream, sx * 0.31, 0.30, -0.10, 0.15, 0.14, 0.15); // paw
      at(fur, sx * 0.15, 0.14, -0.20, 0.26, 0.24, 0.44);          // leg
      at(fur, sx * 0.15, 0.13, -0.40, 0.23, 0.22, 0.17);          // foot
      at(M.plushCream, sx * 0.15, 0.13, -0.47, 0.15, 0.15, 0.06); // sole pad
    }
  });
}

// The stand they sit on: plinth, two ends, a backboard and two shelves. One
// either side of the shop door — the row this replaces was spread evenly across
// the whole shop front, which parked three bears squarely in the doorway.
function plushStand(x, z, ry, seed = 0) {
  prop(() => {
    frame(x, z, ry, () => {
      const Y = PLAZA_Y;
      box(M.timberDark, 0, Y + 0.05, 0, 1.7, 0.1, 0.66);          // plinth
      for (const sx of [-0.81, 0.81]) box(M.timber, sx, Y + 0.62, 0, 0.07, 1.15, 0.6);
      box(M.timber, 0, Y + 0.62, 0.29, 1.7, 1.15, 0.05);          // backboard
      for (let sh = 0; sh < 2; sh++) {
        const top = Y + 0.5 + sh * 0.56;
        box(M.timberPale, 0, top - 0.03, 0, 1.66, 0.06, 0.6);     // shelf
        for (let i = 0; i < 3; i++) {
          plushBear(-0.54 + i * 0.54, -0.04, top, 0.4,
            BEAR_FURS[(seed + i + sh * 3) % BEAR_FURS.length], (i - 1) * 0.24);
        }
      }
    });
  });
}

// The guest-services hub in the middle of the loop: restaurant, terrace, shop.
function hubPlaza() {
  slab(M.plaza, -26, 26, -64, -36, 0, PLAZA_Y);
  // Restaurant chalet, its terrace facing the south spur so you see it on the
  // way in rather than on the way out.
  frame(-12.5, -52, Math.PI, () => {
    chalet(17, 10.5, { h: 3.6, roof: M.shingleRed, windows: 4, doorW: 2.6,
      interior: b => shopInterior(b, 'cafe') });
    box(M.signBoard, 0, 5.3, -5.5, 7.4, 1.0, 0.22);
    box(M.signPale, 0, 5.3, -5.66, 6.6, 0.6, 0.1);
    // Covered terrace: pergola on posts with a canvas top.
    box(M.timberDark, 0, 3.1, -8.6, 17.5, 0.2, 6.4);
    box(M.fabricCream, 0, 3.24, -8.6, 17, 0.1, 6.0);
    for (const px of [-8, 0, 8]) shape(G.post, M.timberDark, px, 0, -11.5, 0.24, 3.1, 0.24);
    for (let i = -2; i <= 2; i++) terraceTable(i * 3.4, -8.8);
  });
  // Gift shop: plush toys in the window, which is the only way a shop reads as
  // a toy shop from outside.
  frame(13, -50.5, Math.PI - 0.22, () => {
    chalet(13, 9, { h: 3.4, roof: M.shingle, windows: 3, doorW: 2.4,
      interior: b => shopInterior(b, 'shop') });
    box(M.signBoard, 0, 5.05, -4.7, 6.2, 0.95, 0.22);
    box(M.signPale, 0, 5.05, -4.86, 5.5, 0.55, 0.1);
    // Two display stands under the eaves, one either side of the door. Each
    // stops 1.2 m short of the jamb, which leaves the doorway and its approach
    // open from the plaza to the threshold — and room beside the right-hand one
    // for the keeper's chair.
    plushStand(-3.45, -5.2, 0, 0);
    plushStand(3.45, -5.2, 0, 2);
  });
  // Kiosk, benches and shade between the two chalets.
  frame(1, -60, Math.PI, () => {
    chalet(6.4, 4.6, { h: 2.6, roof: M.shingleRed, windows: 0, doorW: 1.6,
      interior: b => shopInterior(b, 'cafe') });
    // Serving hatch beside the door, which is what a kiosk is for.
    box(M.timberPale, 2.0, 1.75, -2.35, 2.2, 1.1, 0.12);
    box(M.stone, 2.0, 1.16, -2.55, 2.6, 0.14, 0.55);
    box(M.timberDark, 2.0, 2.5, -2.5, 2.6, 0.5, 0.7);
  });
  for (const [bx, bz, br] of [[-3, -41, 0], [5, -41, 0], [-22, -46, 1.3], [21, -60, -1.9]]) {
    bench(bx, bz, br, PLAZA_Y);
  }
  plainChair(9.6, -45.4, -0.22);        // the gift shop keeper sits outside
  bin(-6.5, -41.5, 0, PLAZA_Y);
  bin(8.5, -41.5, 0, PLAZA_Y);
  for (const [tx, tz] of [[-24, -62], [23, -63], [-25, -38], [24, -40]]) shadeTree(tx, tz, 1.05);
  fingerPost(4.6, -38.5, [0.5, 2.2, 3.8]);
}

// One chair, drawn from the floor it stands on. `y0` is that floor: everything
// in the hub sits on the paving slab, and a chair built from the buildings'
// datum instead has its legs 8 cm into the stone.
function chairBody(y0) {
  box(M.timber, 0, y0 + CHAIR_SEAT - 0.03, 0, 0.5, 0.06, 0.5);
  box(M.timber, 0, y0 + 0.7, -0.22, 0.5, 0.48, 0.06);
  for (const [lx, lz] of [[-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2], [0.2, 0.2]]) {
    shape(G.post, M.timberDark, lx, y0, lz, 0.06, CHAIR_SEAT - 0.03, 0.06);
  }
}

// A chair on its own, for the shopkeeper who sits outside his door.
function plainChair(x, z, ry) {
  prop(() => {
    frame(x, z, ry, () => chairBody(PLAZA_Y));
  });
}
function terraceTable(x, z) {
  prop(() => {
    frame(x, z, 0, () => {
      shape(G.post, M.steelDark, 0, PLAZA_Y, 0, 0.12, 0.72, 0.12);
      shape(G.cylBase, M.timberPale, 0, PLAZA_Y + 0.72, 0, 1.5, 0.08, 1.5);
      for (const [cx, cz, cr] of [[-1.0, 0, 1.57], [1.0, 0, -1.57]]) {
        frame(cx, cz, cr, () => {
          furnitureInteraction('sit', 0.4, 0.4, 0, PLAZA_Y + CHAIR_SEAT - 0.01, PLAZA_Y);
          chairBody(PLAZA_Y);
        });
      }
    });
  });
}

// ---------------------------------------------------------------------------
// Exhibits. Each is: a habitat floor, the barrier line facing the path, the
// landscape inside it, a stand-off rail and a sign — in that order, because
// that is the order a visitor meets them.
// ---------------------------------------------------------------------------

// Lions: a dry savanna paddock behind a glass plinth, with the kopje (rock
// outcrop) placed where the pride will be seen against the sky from the path.
const LION = { x0: -100, x1: -64, z0: -92, z1: -58 };
function lionExhibit() {
  const { x0, x1, z0, z1 } = LION;
  slab(M.meadow, x0, x1, z0, z1, 0, 0.04);
  slab(M.sand, -92, -74, -82, -68, 0.04, 0.07);
  // The loop only runs down the east side, so that is the only edge that gets
  // glass. The other three are back-of-house: a solid wall with nothing to see
  // over it, which is also what stops you looking straight through the park.
  // Corner to corner, not inset: two metres short at each end is a two-metre
  // hole a wolf walks through, and it is the first thing you see from the path.
  glassBarrier(x1, z0, x1, z1, { plinth: 0.9, glass: 3.2 });
  slab(M.stone, x0, x0 + 0.7, z0, z1, 0, 4.2);
  slab(M.stone, x0, x1, z0, z0 + 0.7, 0, 4.2);
  slab(M.stone, x0, x1, z1 - 0.7, z1, 0, 4.2);
  // Kopje, placed so the pride is seen against the sky from the viewing line.
  prop(() => {
    for (const [rx, rz, rs] of [[-80, -74, 5.2], [-76, -77, 3.8], [-83, -78, 3.0], [-78, -71, 2.4]]) {
      shape(G.rock, M.rockWarm, rx, 0.2, rz, rs, rs * 0.62, rs * 0.9, { ry: rs, rz: 0.12 });
    }
    shape(G.trunk, M.barkDark, -92, 0, -66, 0.7, 3.4, 0.7);      // dead tree
    for (let i = 0; i < 4; i++) {
      shape(G.post, M.barkDark, -92, 3.0, -66, 0.16, 3.0, 0.16, { rz: 0.7 - i * 0.35, ry: i * 1.6 });
    }
  });
  for (let i = 0; i < 5; i++) shadeTree(x0 + 4 + i * 3, z0 + 4 + (i % 3) * 5, 0.8, M.foliageDark);
  railRun(x1 + 1.8, z0, x1 + 1.8, z1, {});
  exhibitSign(x1 + 2.9, -70, Math.PI / 2);
  exhibitSign(x1 + 2.9, -82, Math.PI / 2);
  bench(x1 + 3.9, -76, -Math.PI / 2);
}

// Bears: rockwork, a real pool cut into the terrain, and the same glass line.
const ZEBRA = { x0: -30, x1: 26, z0: -124, z1: -98 };
function zebraPaddock() {
  const { x0, x1, z0, z1 } = ZEBRA;
  slab(M.lawn, x0, x1, z0, z1, 0, 0.04);
  stockFence(x0, z1, x1, z1, { h: 2.5, rails: 4 });   // deer jump
  slab(M.stone, x0, x0 + 0.7, z0, z1, 0, 4.4);
  slab(M.stone, x1 - 0.7, x1, z0, z1, 0, 4.4);
  slab(M.stone, x0, x1, z0, z0 + 0.7, 0, 4.4);
  // Pool coping around the basin the terrain carries.
  const b = BASINS[0];
  slab(M.rock, b.x0 - 1.1, b.x1 + 1.1, b.z0 - 1.1, b.z0, -0.1, 0.16);
  slab(M.rock, b.x0 - 1.1, b.x1 + 1.1, b.z1, b.z1 + 1.1, -0.1, 0.16);
  slab(M.rock, b.x0 - 1.1, b.x0, b.z0, b.z1, -0.1, 0.16);
  slab(M.rock, b.x1, b.x1 + 1.1, b.z0, b.z1, -0.1, 0.16);
  // Rockwork bank at the back, where a bear climbs and is seen doing it.
  prop(() => {
    for (const [rx, rz, rs, rh] of [
      [-16, -120, 7.0, 4.4], [-6, -122, 5.6, 3.4], [5, -120, 6.4, 3.9],
      [14, -122, 4.6, 2.8], [-21, -114, 4.2, 2.4],
    ]) {
      shape(G.rock, M.rock, rx, 0.1, rz, rs, rh, rs * 0.85, { ry: rs, rz: 0.1 });
    }
    // Dead standing trunks among the rocks: upright — a log leaning at sixty
    // degrees off the vertical would not stay up on its own.
    shape(G.post, M.barkDark, -3, 0.2, -111, 0.5, 6.4, 0.5, { ry: 0.4 });
    shape(G.post, M.barkDark, 11, 0.2, -114, 0.45, 5.2, 0.45, { ry: -0.6 });
  });
  for (const [tx, tz] of [[-26, -121], [21, -120], [-25, -104], [22, -105]]) pine(tx, tz, 1.15);
  railRun(x0, z1 + 1.9, x1, z1 + 1.9, {});
  exhibitSign(-9, z1 + 3.0, 0);
  exhibitSign(9, z1 + 3.0, 0);
  bench(-18, z1 + 3.8, Math.PI);
  bench(17, z1 + 3.8, Math.PI);
  bin(0, z1 + 3.6, 0);
}

// Monkeys: a full mesh volume. Primates climb anything with a top edge, so a
// moat and a glass wall are not enough — the roof is the barrier.
const KOMODO = { x0: 62, x1: 94, z0: -86, z1: -58 };
function komodoEnclosure() {
  const { x0, x1, z0, z1 } = KOMODO;
  slab(M.lawn, x0, x1, z0, z1, 0, 0.04);
  slab(M.dirtEdge, x0 + 4, x1 - 4, z0 + 4, z1 - 4, 0.04, 0.06);
  // A fox climbs and digs, so the volume stays closed — but at three and a half
  // metres, not the eight a primate needed. The landscape is what changes: fallen
  // trunks, earth banks with burrow mouths, and scrub to disappear into.
  const H = 3.4;
  meshWall(x0, z0, x0, z1, H, {});
  meshWall(x1, z0, x1, z1, H, {});
  meshWall(x0, z0, x1, z0, H, {});
  meshWall(x0, z1, x1, z1, H, {});
  meshRoof(x0, z0, x1, z1, H);
  prop(() => {
    for (const [lx, lz, la] of [[70, -76, 0.6], [82, -68, 2.1], [76, -82, 1.2]]) {
      shape(G.post, M.barkDark, lx, 0.35, lz, 0.42, 5.2, 0.42, { rz: 1.52, ry: la });
      shape(G.blob, M.foliageDark, lx + 2.4, 0.4, lz + 1.2, 2.2, 0.9, 2.0);
    }
    for (const [bx, bz] of [[88, -76], [67, -66], [80, -80]]) {
      shape(G.blob, M.dirtEdge, bx, 0, bz, 4.4, 1.5, 3.8);      // earth bank
      shape(G.sphere, M.barkDark, bx + 1.2, 0.35, bz - 1.7, 0.9, 0.8, 0.7);  // burrow
    }
    for (const [sx, sz] of [[72, -63], [86, -63], [70, -84], [90, -70], [78, -73]]) {
      shape(G.blob, M.hedge, sx, 0, sz, 2.6, 1.3, 2.4);
    }
  });
  for (const [tx, tz] of [[66, -62], [91, -62], [66, -83], [91, -83]]) shrub(tx, tz, 1.3);
  railRun(x0 - 1.9, z0, x0 - 1.9, z1, {});
  exhibitSign(x0 - 3.0, -68, -Math.PI / 2);
  exhibitSign(x0 - 3.0, -78, -Math.PI / 2);
  bench(x0 - 3.9, -73, Math.PI / 2);
}

// Parrots: a walk-past aviary. Same mesh volume as the monkeys, planted denser
// and hung with perches at eye level so the birds are actually visible.
const PEAFOWL = { x0: 64, x1: 94, z0: -52, z1: -24 };
const FARM = { x0: -74, x1: -62, z0: -46, z1: -22 };
// The reptile house stands a quarter turn round, so its 22 m front runs along
// z and forms the farmyard's west side. The footprint is shared with the fence
// that closes the yard either side of it.
const BARN = { x: -80, z: -34, w: 22, d: 12 };
function peafowlPaddock() {
  const { x0, x1, z0, z1 } = PEAFOWL;
  slab(M.lawn, x0, x1, z0, z1, 0, 0.04);
  // Alpacas need a fence they can see through and a shelter to stand under,
  // not a cage: they neither climb nor jump, and the whole exhibit is that you
  // can stand at the rail with one looking back at you.
  stockFence(x0, z0, x0, z1, { h: 1.5, rails: 3 });
  stockFence(x1, z0, x1, z1, { h: 1.5, rails: 3, mesh: false });
  stockFence(x0, z0, x1, z0, { h: 1.5, rails: 3, mesh: false });
  stockFence(x0, z1, x1, z1, { h: 1.5, rails: 3, mesh: false });
  // Three-sided field shelter, open to the viewing side.
  frame(84, -38, Math.PI / 2, () => {
    slab(M.timber, -5, 5, 1.6, 2.0, 0, 2.6);
    slab(M.timber, -5, -4.6, -2.0, 2.0, 0, 2.6);
    slab(M.timber, 4.6, 5, -2.0, 2.0, 0, 2.6);
    gableRoof(10, 4.4, 2.6, 0.9, M.shingle, 0.7);
    prop(() => {
      box(M.timber, 0, 0.45, -1.5, 3.0, 0.9, 0.7);            // hay feeder
      box(M.signPale, 0, 0.95, -1.5, 2.7, 0.24, 0.6);
    });
  });
  // Pasture: shade trees the herd can stand under, and nothing else. The perch
  // trees and the rail across the viewing face went with the parrots.
  for (const [tx, tz, ts] of [[72, -33, 1.1], [82, -44, 1.2], [89, -30, 0.95]]) {
    shadeTree(tx, tz, ts);
  }
  for (const [sx, sz] of [[68, -28], [90, -48], [76, -50]]) shrub(sx, sz, 1.0);
  for (const [tx, tz] of [[68, -50], [91, -50], [68, -27], [91, -27]]) birch(tx, tz, 1.0);
  railRun(x0 - 1.9, z0, x0 - 1.9, z1, {});
  exhibitSign(x0 - 3.0, -33, -Math.PI / 2);
  exhibitSign(x0 - 3.0, -44, -Math.PI / 2);
  bench(x0 - 3.9, -38, Math.PI / 2);
}

// ---------------------------------------------------------------------------
// Animals.
//
// Real textured models now — see fauna.js. What used to be here was a bestiary
// of blobs: correctly proportioned, but a lion built from six ellipsoids is a
// lion only if you already know that is what you are looking at. After that it
// was a flat-shaded low-poly pack, which read as toys.
//
// The park is finally the zoo the enclosures were drawn for: the kopje behind
// glass was always meant to have a pride on it, the big paddock with the pool
// takes the zebras, and the closed mesh volume — built for something that digs
// and climbs — holds the komodos. Peafowl have the pasture and the crows the
// farmyard.
const animals = [];
const HERDS = [
  // species, enclosure rect, how many, how tightly they group, and how many of
  // the count are young. A paddock of identically sized adults is the other
  // half of why these read wrong beside a person — there is nothing in it to
  // give the scale away, and one calf at two thirds the height does.
  // The last figure is the floor of the enclosure: every one of them lays its
  // own grass or dirt over the terrain, and an animal put on the terrain itself
  // stands four to six centimetres inside it.
  ['lion', LION, 3, 0.55, 1, 0.04],
  ['zebra', ZEBRA, 6, 0.62, 2, 0.04],
  ['peacock', PEAFOWL, 5, 0.5, 0, 0.04],
  ['komodo', KOMODO, 2, 0.45, 0, 0.06],
  ['crow', FARM, 4, 0.42, 0, 0.05],
];

// Perch tops in the aviary, handed to the crows so a flight ends on a bar and
// not in the air beside it. Kept in one place with the aviary itself.
const CROW_PERCHES = [
  { x: -66, y: 2.1 + 0.05, z: -26 }, { x: -71, y: 3.0 + 0.05, z: -31 },
  { x: -66, y: 2.5 + 0.05, z: -37 }, { x: -71, y: 1.6 + 0.05, z: -43 },
];

async function populate(rng) {
  const loaded = await loadSpecies(Object.keys(SPECIES));
  for (const [name, rect, count, spread, young = 0, floor = 0] of HERDS) {
    const species = loaded[name];
    if (!species) continue;
    const cx = (rect.x0 + rect.x1) / 2, cz = (rect.z0 + rect.z1) / 2;
    const rx = (rect.x1 - rect.x0) / 2 - 5, rz = (rect.z1 - rect.z0) / 2 - 5;
    // A basin inside the enclosure is a hole, not a floor: the zebra paddock
    // carries the pool, and an animal that wanders in stands a metre down.
    const avoid = BASINS.find(b => b.x0 > rect.x0 && b.x1 < rect.x1
      && b.z0 > rect.z0 && b.z1 < rect.z1) ?? null;
    const inPool = (px, pz) => avoid
      && px > avoid.x0 - 1.5 && px < avoid.x1 + 1.5
      && pz > avoid.z0 - 1.5 && pz < avoid.z1 + 1.5;
    let last = null;
    for (let i = 0; i < count; i++) {
      // Scattered rather than gridded, and kept off the barrier line so nothing
      // ever stands with half of itself through the fence. The young of the
      // herd come last and stay within a couple of metres of the adult in
      // front of them, because that is where a calf is.
      const calf = i >= count - young;
      let x = 0, z = 0;
      for (let tries = 0; tries < 8; tries++) {
        x = calf && last ? last.x + (rng() * 2 - 1) * 2.2
          : cx + (rng() * 2 - 1) * rx * spread * 2;
        z = calf && last ? last.z + (rng() * 2 - 1) * 2.2
          : cz + (rng() * 2 - 1) * rz * spread * 2;
        if (!inPool(x, z)) break;
      }
      last = { x, z };
      const a = placeAnimal(species, {
        x, y: terrainHeight(x, z) + floor, z, ry: rng() * Math.PI * 2, rng,
        size: calf ? 0.62 + rng() * 0.1 : 1,
        // Where it may wander, and what it walks on. Inset from the barrier so
        // nothing ever noses through its own fence.
        roam: { x0: rect.x0 + 3, x1: rect.x1 - 3, z0: rect.z0 + 3, z1: rect.z1 - 3 },
        ground: (gx, gz) => terrainHeight(gx, gz) + floor,
        avoid,
        // Only the aviary birds take these; everyone else ignores them.
        perches: name === 'crow' ? CROW_PERCHES : null,
      });
      if (!a) continue;
      fauna.add(a.group);
      animals.push(a);
    }
  }
}

// Visitors are real rigged copies of the pack's own characters — see crowd.js
// for the rebinding, which is the only interesting part. What lives here is the
// route: a walker is a distance along the loop plus a side of it, so it keeps a
// constant speed through the corners and the two directions pass each other
// properly instead of walking the crown of the path.
const walkers = [];
const rngCrowd = (seed => () => (seed = (seed * 48271) % 2147483647) / 2147483647)(90210);

const LOOP_LEN = [];
let loopTotal = 0;
loopEach((a, b) => {
  LOOP_LEN.push(loopTotal);
  loopTotal += Math.hypot(b[0] - a[0], b[1] - a[1]);
});
function loopAt(s) {
  const d = ((s % loopTotal) + loopTotal) % loopTotal;
  let i = LOOP_LEN.length - 1;
  while (i > 0 && LOOP_LEN[i] > d) i--;
  const a = LOOP[i], b = LOOP[(i + 1) % LOOP.length];
  const seg = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const t = seg > 0 ? (d - LOOP_LEN[i]) / seg : 0;
  return {
    x: a[0] + (b[0] - a[0]) * t,
    z: a[1] + (b[1] - a[1]) * t,
    yaw: Math.atan2(b[0] - a[0], b[1] - a[1]),
  };
}
// Where each visitor starts on the loop and which way round they walk. Spread
// so that no two ever have to avoid each other — there is no avoidance here,
// and two people walking through one another is worse than an empty path.
const CROWD_PLAN = [
  [8, 1], [17, -1], [24, 1], [95, 1], [107, -1],
  [178, -1], [190, 1], [255, 1], [298, -1], [330, 1],
];

// Fixed people: the three shopkeepers and the customers at the terrace. They
// are the same clones the walkers are, standing still — a shop with nobody in
// it reads as scenery, and a terrace of empty chairs reads as closed.
const statics = [];
// x, z, facing, seated. The facings are the shop fronts' own outward normals,
// so each keeper is looking out at the plaza rather than at their own wall.
const STAFF = [
  [-12.5, -45.6, 0, false],          // restaurant, standing by the door
  [9.6, -45.4, -0.22, true],         // gift shop, sitting on the chair outside
  [-1.2, -56.6, 0, false],           // kiosk, at the serving hatch
];
// The terrace chairs, taken from the same arithmetic that placed them: tables
// at local x = i*3.4 in the restaurant's frame, a chair a metre either side.
const CUSTOMERS = [
  [-4.7, -43.2, 4.712], [-10.1, -43.2, 1.571],
  [-14.9, -43.2, 4.712], [-20.3, -43.2, 1.571],
];
// Both the chairs and the people on them stand on the paving, not on the datum
// the buildings are drawn from — the slab is 8 cm proud of it.
const SEAT_TOP = PLAZA_Y + CHAIR_SEAT;
// How far a sitter may settle into the cushion when the legs are too SHORT to
// reach the floor at any knee angle. The pack's two characters are not the same
// size, so the chair that one pair of feet goes through is one the other pair
// can dangle over.
const SIT_SINK = 0.07;

const _v3 = new THREE.Vector3();
const boneY = (g, name) => {
  const b = g.getObjectByName(name);
  return b ? _v3.setFromMatrixPosition(b.matrixWorld).y : Infinity;
};
const ballY = g => Math.min(boneY(g, 'ball_l'), boneY(g, 'ball_r'));
// How far the shoe hangs below the ball of the foot, measured on this model
// rather than assumed: it is 3.8 cm on one of the pack's characters and 8.6 on
// the other, which is the difference between standing on the floor and standing
// in it. One skinned bounds pass each, at load.
function soleDrop(g) {
  const ball = ballY(g);
  if (!Number.isFinite(ball)) return null;
  g.traverse(o => { if (o.isSkinnedMesh) o.boundingBox = null; });
  return Math.max(0, ball - new THREE.Box3().setFromObject(g).min.y);
}

// Fit the legs to the seat. The taller of the two characters is 1.85 m and a
// chair is 0.47 m high, so the knee-to-sole is the longer of the two: held with
// the shin vertical — which is what the seated pose does on its own — the feet
// end up 13 cm under the paving, which is where the gift shop's keeper had his.
// The shin is swung forward until the soles rest on the ground, the way anyone
// tall actually sits on a low chair. Bisection rather than a formula: the sole
// travels on an arc, the foot is not a point, and this runs five times at load.
//
// If the legs cannot reach even hanging straight down, no angle will do it and
// the whole body is let into the cushion instead, up to SIT_SINK.
function fitSeatedLegs(v, groundY) {
  const st = v.pose?.state, rest = v.pose?.rest;
  if (!st || !rest) return;
  const drop = soleDrop(v.group);
  if (drop === null) return;                             // no feet to stand on
  const soleAtKnee = knee => {
    st.knee = knee;
    st.ankle = rest.ankle - (knee - rest.knee);
    v.pose();
    v.group.updateMatrixWorld(true);
    return ballY(v.group) - drop;
  };
  const rested = soleAtKnee(rest.knee);
  if (rested > groundY + 0.005) {
    v.group.position.y -= Math.min(rested - groundY, SIT_SINK);
    v.group.updateMatrixWorld(true);
    return;
  }
  let lo = rest.knee, hi = 0;                            // hi = leg straight out
  if (soleAtKnee(hi) < groundY) { soleAtKnee(rest.knee); return; }
  for (let i = 0; i < 16; i++) {
    const mid = (lo + hi) / 2;
    if (soleAtKnee(mid) < groundY) lo = mid; else hi = mid;
  }
  soleAtKnee(hi);
}

// Stand someone ON a surface rather than at it: placing the group's origin at
// ground level buries whatever of the shoe hangs below the model's own root,
// which is a centimetre or so on both of these characters.
function standOn(v, x, z, ry, groundY) {
  v.group.position.set(x, groundY, z);
  v.group.rotation.y = ry;
  v.mixer.update(0);
  v.group.updateMatrixWorld(true);
  v.group.traverse(o => { if (o.isSkinnedMesh) o.boundingBox = null; });
  const min = new THREE.Box3().setFromObject(v.group).min.y;
  if (Number.isFinite(min)) v.group.position.y += groundY - min;
}

function seatOn(v, x, y, z, ry, groundY = PLAZA_Y) {
  v.group.position.set(x, 0, z);
  v.group.rotation.y = ry;
  // Evaluate the clip before measuring anything. The mixer has never run at
  // this point, so the skeleton is still in its bind pose, and every height
  // read off it is a few centimetres out by the first frame.
  v.mixer.update(0);
  v.pose?.();
  v.group.updateMatrixWorld(true);
  const pelvis = v.group.getObjectByName('pelvis');
  if (!pelvis) return;
  // Drop the whole body until the pelvis lands just over the cushion. The pose
  // only rotates the legs, so the pelvis sits at its standing height above the
  // group either way and one measurement does for both.
  const py = new THREE.Vector3().setFromMatrixPosition(pelvis.matrixWorld).y;
  v.group.position.y = y + 0.07 - py;
  v.group.updateMatrixWorld(true);
  fitSeatedLegs(v, groundY);
}

async function populateStaff(bases, walkClip, idleClip) {
  if (!walkClip || !bases.length) return;
  STAFF.forEach(([x, z, ry, seated], i) => {
    // The two who stand — the restaurant's and the kiosk's — are placed on a
    // spot and never routed anywhere, so they are held still. Left on the walk
    // they marched on the same paving stone in front of their own door.
    const v = makeVisitor(bases[i % bases.length], walkClip, rngCrowd,
      { uniform: STAFF_UNIFORM, seated, still: !seated, idleClip });
    crowd.add(v.group);
    if (seated) seatOn(v, x, SEAT_TOP, z, ry);
    else standOn(v, x, z, ry, terrainHeight(x, z) + PLAZA_Y);
    statics.push(v);
  });
  CUSTOMERS.forEach(([x, z, ry], i) => {
    const v = makeVisitor(bases[(i + 1) % bases.length], walkClip, rngCrowd, { seated: true });
    crowd.add(v.group);
    seatOn(v, x, SEAT_TOP, z, ry);
    statics.push(v);
  });
}

async function populateCrowd(bases, walkClip) {
  if (!walkClip || !bases.length) return;
  CROWD_PLAN.forEach(([at, dir], i) => {
    const base = bases[i % bases.length];
    const v = makeVisitor(base, walkClip, rngCrowd);
    crowd.add(v.group);
    walkers.push({
      ...v,
      s: at,
      dir,
      side: dir * (1.6 + rngCrowd() * 0.7),
    });
  });
}

// ---------------------------------------------------------------------------
// Build the park
// ---------------------------------------------------------------------------
const furnitureInteractions = [];
// `floorY` is the ground in front of the seat, not a constant: the seated pose
// spans the gap between the two, so a seat that reports the wrong floor is a
// seat the legs are solved for at the wrong height. Left at the villa's 0.11
// for the zoo's paving, every bench read 9 cm lower than it is.
function furnitureInteraction(type, halfWidth, halfDepth, anchorZ = 0, restY = 0.5,
  floorY = PATH_Y) {
  const c = Math.cos(FR), s = Math.sin(FR);
  furnitureInteractions.push({
    type,
    x: FX + anchorZ * s,
    y: restY,
    z: FZ + anchorZ * c,
    centerX: FX,
    centerZ: FZ,
    approachY: floorY,
    yaw: FR,
    halfWidth,
    halfDepth,
  });
}

carPark();
forecourt();
ticketPavilion(-1);
ticketPavilion(1);
entryGates();

// The loop, its spurs, and the fence and planting that line them.
loopEach((a, b) => pathRun(a, b, PATH_W));
for (const [a, b] of SPURS) pathRun(a, b, 5.6);
for (const [a, b] of BAYS) pathRun(a, b, 5.0);
pathRun([0, GATE_Z + 0.6], [0, -13], 9.0);
loopEach((a, b, i) => {
  // Hedge on the inside of the loop, which is the hub side and has nothing to
  // see; the exhibits provide their own barrier on the outside.
  const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2;
  const inward = Math.hypot(mx, mz - PARK_MID);
  if (inward < 1) return;
  const nx = -(mx) / inward, nz = -(mz - PARK_MID) / inward;
  if (i % 2 === 0) {
    hedgeRun(a[0] + nx * 5.2, b[0] + nx * 5.2, a[1] + nz * 5.2, b[1] + nz * 5.2, 1.0,
      (hx, hz) => nearRuns(hx, hz, 5.4, [...SPURS, ...BAYS]));
  }
});

hubPlaza();
lionExhibit();
zebraPaddock();
komodoEnclosure();
peafowlPaddock();
farmBarn(BARN.x, BARN.z, -Math.PI / 2);
// Farmyard paddock between the barn and the path, fenced low so you can lean on
// it — this is the corner a zoo lets you get close in.
//
// The west side is the barn's own front wall, which is why there is no fence
// along it — but the barn is two metres shorter than the paddock, so the run
// has to be closed at both ends or the yard is open at the corners. The other
// three sides go corner to corner for the same reason.
// The crows get a real aviary instead of a low stock fence: a walk-past mesh
// volume, tall enough to fly in, with the barn closing the west side as before.
// The perches are what they fly between — a bird on the ground in an aviary is
// a bird that has forgotten the point of it.
const AVIARY_H = 4.2;
slab(M.dirtEdge, FARM.x0, FARM.x1, FARM.z0, FARM.z1, 0, 0.05);
meshWall(FARM.x1, FARM.z0, FARM.x1, FARM.z1, AVIARY_H, {});
meshWall(FARM.x0, FARM.z0, FARM.x1, FARM.z0, AVIARY_H, {});
meshWall(FARM.x0, FARM.z1, FARM.x1, FARM.z1, AVIARY_H, {});
meshWall(FARM.x0, FARM.z0, FARM.x0, BARN.z - BARN.w / 2, AVIARY_H, {});
meshWall(FARM.x0, BARN.z + BARN.w / 2, FARM.x0, FARM.z1, AVIARY_H, {});
meshRoof(FARM.x0, FARM.z0, FARM.x1, FARM.z1, AVIARY_H);
prop(() => {
  box(M.timber, -68, 0.42, -30, 2.4, 0.84, 0.8);          // water trough
  box(M.water, -68, 0.72, -30, 2.1, 0.12, 0.55);
  shape(G.blob, M.signPale, -70, 0.05, -40, 2.6, 1.1, 2.2);   // straw bale heap
  shape(G.blob, M.signPale, -71.5, 0.05, -38.6, 2.2, 0.9, 1.9);
  // Perches: horizontal bars on two uprights, at staggered heights so the
  // flight from one to the next is a real flight, not a hop.
  for (const [px, pz, ph, pw] of [
    [-66, -26, 2.1, 2.6], [-71, -31, 3.0, 2.2], [-66, -37, 2.5, 2.4],
    [-71, -43, 1.6, 2.6],
  ]) {
    shape(G.post, M.barkDark, px - pw / 2, 0.05, pz, 0.09, ph, 0.09);
    shape(G.post, M.barkDark, px + pw / 2, 0.05, pz, 0.09, ph, 0.09);
    shape(G.post, M.barkDark, px, ph + 0.02, pz, pw + 0.3, 0.09, 0.09, { rz: Math.PI / 2 });
  }
});
exhibitSign(-63.4, -32, Math.PI / 2);
exhibitSign(-63.4, -40, Math.PI / 2);
// Outside the mesh, on the path side: the aviary screen is at x = -62, so a
// bench at -62.5 stood inside the cage.
bench(-60.8, -36, -Math.PI / 2);

// Wayfinding at the junctions, and the perimeter fence.
fingerPost(3.9, -16.8, [0.9, 2.4, 4.0]);
fingerPost(3.5, -83.5, [0.2, 2.9]);
railRun(-118, -136, 118, -136, { h: 2.0, step: 3.4 });
railRun(-118, -136, -118, 58, { h: 2.0, step: 3.4 });
railRun(118, -136, 118, 58, { h: 2.0, step: 3.4 });

// Woodland filling the ground between the loop and the perimeter, and inside
// the loop behind the hub.
const rand = (seed => () => (seed = (seed * 16807) % 2147483647) / 2147483647)(20260808);
// Footprints the scatter must not drop a tree into: the four enclosures and the
// reptile house all have barriers a trunk would grow straight through.
const KEEP_OUT = [
  [LION.x0 - 4, LION.x1 + 8, LION.z0 - 4, LION.z1 + 4],
  [ZEBRA.x0 - 4, ZEBRA.x1 + 4, ZEBRA.z0 - 4, ZEBRA.z1 + 8],
  [KOMODO.x0 - 8, KOMODO.x1 + 4, KOMODO.z0 - 4, KOMODO.z1 + 4],
  [PEAFOWL.x0 - 8, PEAFOWL.x1 + 4, PEAFOWL.z0 - 4, PEAFOWL.z1 + 4],
  [-86, -60, -46, -22],
];
// …and off the routes. A trunk between the visitor and the glass is the one
// thing that undoes an exhibit, and the first pass planted one squarely in
// front of the bears.
const ROUTES = [
  ...LOOP.map((a, i) => [a, LOOP[(i + 1) % LOOP.length]]), ...SPURS, ...BAYS,
];
const blocked = (x, z) => KEEP_OUT.some(([a, b, c, d]) => x > a && x < b && z > c && z < d)
  || nearRuns(x, z, 12, ROUTES);
for (let i = 0; i < 190; i++) {
  const a = rand() * Math.PI * 2;
  const r = 74 + rand() * 44;
  const x = Math.cos(a) * r;
  const z = PARK_MID + Math.sin(a) * r * 0.86;
  if (Math.abs(x) > 116 || z > 12 || z < -134 || blocked(x, z)) continue;
  if (rand() < 0.4) pine(x, z, 0.9 + rand() * 0.5);
  else shadeTree(x, z, 0.9 + rand() * 0.5, rand() < 0.5 ? M.foliage : M.foliageDark);
}
// Understorey along the routes. Planted from the same seeded generator as the
// woodland so it is stable between reloads, and kept a clear two metres off the
// path edge — a shrub you walk into is worse than a lawn you do not.
for (let i = 0; i < 150; i++) {
  const a = rand() * Math.PI * 2;
  const r = 30 + rand() * 62;
  const x = Math.cos(a) * r;
  const z = PARK_MID + Math.sin(a) * r * 0.9;
  if (Math.abs(x) > 112 || z > 6 || z < -130) continue;
  if (KEEP_OUT.some(([p0, p1, q0, q1]) => x > p0 && x < p1 && z > q0 && z < q1)) continue;
  if (nearRuns(x, z, 5.6, ROUTES)) continue;              // off the path edge
  if (!nearRuns(x, z, 16, ROUTES)) continue;              // but still beside it
  if (rand() < 0.22) birch(x, z, 0.85 + rand() * 0.35);
  else shrub(x, z, 0.7 + rand() * 0.7, rand() < 0.4 ? M.foliageDark : M.hedge);
}
for (let i = 0; i < 30; i++) {
  const a = rand() * Math.PI * 2;
  const r = 10 + rand() * 18;
  const x = Math.cos(a) * r, z = PARK_MID - 26 + Math.sin(a) * r * 0.7;
  if (blocked(x, z) || (Math.abs(x) < 27 && z > -66 && z < -34)) continue;   // clear of the hub
  shadeTree(x, z, 0.85 + rand() * 0.4);
}

// Cars in the car park, as real lofted meshes plus an invisible collider box so
// the AABB world knows about them.
//
// They go in the bays the markings are painted from — the same BAY_* constants,
// so a car cannot land between two lines. The previous arithmetic scattered
// them on rows 30.2 and 42.2, which are the driving aisles, and those rows run
// straight through the kerbed islands at 28.6 and 40.6.
//
// The paved route from the car park to the turnstiles is 11 m wide; no bay in
// front of it gets a car, so you can walk off the asphalt without squeezing
// between bumpers.
const WALK_HALF = 6.2;
const CAR_COLORS = [0xb8483c, 0x2f4f7a, 0xe8e4dc, 0x2b2f33, 0x6b8f5a, 0xc9a23f];

// The model is measured rather than assumed, because assuming is what put every
// car across three bays: `buildCar` lofts its sedan 5.59 m along X and 2.22 m
// along Z, so at yaw 0 the car lies ACROSS the markings — it overlapped both
// neighbours by three metres. The bays are 2.55 m wide and 5 m deep, so the car
// is turned a quarter and taken down to the size of a car that fits one.
const carProbe = buildCar('sedan', 0xffffff);
const carBox = new THREE.Box3().setFromObject(carProbe);
const carSize = carBox.getSize(new THREE.Vector3());
const CAR_SCALE = Math.min(1, (BAY_PITCH - 0.55) / carSize.z, (BAY_DEPTH - 0.1) / carSize.x);
const CAR_L = carSize.x * CAR_SCALE, CAR_W = carSize.z * CAR_SCALE;
const CAR_H = carSize.y * CAR_SCALE;

const parkedCars = [];
let carIndex = 0;
for (const row of BAY_ROWS) {
  for (let k = 0; k < BAY_COUNT; k++) {
    const x = BAY_X0 + (k + 0.5) * BAY_PITCH;
    if (Math.abs(x) < WALK_HALF) continue;
    // A car park is never full, and every car here is its own mesh rather than
    // an instance: filling a third of the bays is what a mid-morning zoo looks
    // like and keeps the draw calls where they were.
    if (rand() > 0.30) continue;
    // Nose to the kerb, which is north of every row here; one in four has
    // reversed in, which is what a real row of cars looks like. The quarter
    // turn is what puts the length of the car down the bay instead of across it.
    const facing = Math.PI / 2 + (rand() < 0.25 ? Math.PI : 0);
    const mesh = buildCar('sedan', CAR_COLORS[carIndex++ % CAR_COLORS.length]);
    mesh.scale.setScalar(CAR_SCALE);
    mesh.position.set(x, 0.05 - carBox.min.y * CAR_SCALE, row);
    mesh.rotation.y = facing;
    mesh.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    world.add(mesh);
    parkedCars.push(mesh);
    prop(() => box(M.collider, x, 0.05 + CAR_H / 2, row, CAR_L, CAR_H, CAR_W, facing));
  }
}

flushKits();

// ---------------------------------------------------------------------------
// Terrain and water. The mesh takes its vertices from terrainHeight so the
// analytic ground probe and the visible ground can never disagree.
// ---------------------------------------------------------------------------
const terrainGeo = new THREE.PlaneGeometry(520, 520, 190, 190);
terrainGeo.rotateX(-Math.PI / 2);
{
  const p = terrainGeo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    p.setY(i, terrainHeight(p.getX(i), p.getZ(i) + PARK_MID));
  }
  p.needsUpdate = true;
  terrainGeo.computeVertexNormals();
}
const terrain = new THREE.Mesh(terrainGeo, M.lawn);
terrain.position.z = PARK_MID;
terrain.receiveShadow = true;
world.add(terrain);

const bearPool = new THREE.Mesh(
  new THREE.PlaneGeometry(BASINS[0].x1 - BASINS[0].x0 + 1.6, BASINS[0].z1 - BASINS[0].z0 + 1.6)
    .rotateX(-Math.PI / 2),
  M.water,
);
bearPool.position.set(
  (BASINS[0].x0 + BASINS[0].x1) / 2, BASINS[0].y + 0.78, (BASINS[0].z0 + BASINS[0].z1) / 2);
bearPool.receiveShadow = true;
scene.add(bearPool);

// ---------------------------------------------------------------------------
// Rays, ground probe, controller
// ---------------------------------------------------------------------------
const rays = {
  ray: new THREE.Raycaster(),
  tempMatrix: new THREE.Matrix4(),
  normalMatrix: new THREE.Matrix3(),
  tmpNormal: new THREE.Vector3(),
};
const down = new THREE.Vector3(0, -1, 0);
const _origin = new THREE.Vector3();

let rayTargets = null, rayTargetCount = -1;
function targets() {
  if (rayTargetCount !== world.children.length) {
    rayTargets = world.children.filter(o => o !== terrain);
    rayTargetCount = world.children.length;
  }
  return rayTargets;
}

function castFn(origin, dir, far) {
  rays.ray.set(origin, dir);
  rays.ray.far = far;
  const hit = rays.ray.intersectObjects(targets(), true)[0];
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

const GROUND_REACH = 160;
function groundFn(x, z, yFrom, feetY, prevY = feetY) {
  const cap = Math.max(feetY + 0.75, prevY + 0.3);
  let best = null;
  // Terrain as a candidate rather than a ray hit: 72 000 triangles with no
  // acceleration structure would cost more than the whole rest of the map.
  if (Math.abs(x) < 250 && Math.abs(z - PARK_MID) < 250) {
    const th = terrainHeight(x, z);
    if (th <= cap && th <= yFrom && th >= yFrom - GROUND_REACH) best = th;
  }
  rays.ray.set(_origin.set(x, yFrom, z), down);
  rays.ray.far = GROUND_REACH;
  for (const h of rays.ray.intersectObjects(targets(), true)) {
    if (h.object.userData.prop?.[h.instanceId]) continue;
    if (h.point.y <= cap) {
      if (best === null || h.point.y > best) best = h.point.y;
      break;
    }
  }
  return best === null ? null : best + 0.02;
}

const bw = buildCityBoxes(world);
let player = null;
const ctrl = new Controller(bw, groundFn, castFn, {
  onReset: () => ctrl.rescueTo(spawnPoint),
  onLand: impact => { if (player) player.onLand(impact); },
});
// On the car park, a couple of bays back from the entrance and facing it.
const spawnPoint = new THREE.Vector3(2.5, 1.4, 19);
ctrl.rescueTo(spawnPoint);

const rig = new CameraRig(camera, bw);
const input = new Input(renderer.domElement);
function requestGamePointerLock() {
  try {
    renderer.domElement.requestPointerLock?.()?.catch?.(() => {});
  } catch (_) {
    // Embedded previews may refuse pointer lock; keyboard play still works.
  }
}
input.yaw = Math.PI;   // looking up the plaza at the ticket windows

player = new Player(scene);
await player.load('girl', girlMatFor);
player.addWardrobePart('hairCrown', harmoniseHair(player, {
  scalp: await charImage(CHAR_MATS.MAT_SurvGirl_Head.tex),
  strands: await charImage(CHAR_MATS.MAT_SurvGirl_Hair.tex),
  strandsAO: await charImage(CHAR_MATS.MAT_SurvGirl_Hair.aoTex),
}));

// The crowd is cloned off the loaded characters, so it can only be built now.
// The second base costs one more GLB; a park where every visitor is the same
// woman is not a crowd. If it fails to load the park simply gets one base.
{
  // Both bases are loaded fresh rather than cloned off the player: the crowd
  // needs the pack's material NAMES to dress itself, and the player's copies
  // have lost them. Two models is the minimum that reads as a crowd.
  const bases = [];
  for (const url of ['./chars/glb/girl.glb', './chars/glb/man.glb']) {
    try {
      bases.push(await loadVisitorBase(url, girlMatFor));
    } catch (e) {
      console.warn('[zoo] visitor model unavailable:', url, e);
    }
  }
  await populateCrowd(bases, player.actions.walk?.getClip());
  await populateStaff(bases, player.actions.walk?.getClip(),
    player.actions.idle?.getClip());
}
await populate(rngCrowd);

// ---------------------------------------------------------------------------
// Interaction (benches and terrace chairs), lifted from the villa's contract
// ---------------------------------------------------------------------------
const forward = new THREE.Vector3();
const clock = new THREE.Clock();
let started = false, usedLock = false, paused = false;
let activeFurnitureInteraction = null;
let furnitureInteractionCooldown = 0;
let promptedFurniture = null;
let furnitureActionRequested = false;
let releasedSpot = null;
const RELEASE_RADIUS = 1.1;
const interactionExitKeys = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space', 'KeyE'];
const interactionInputHeld = () => interactionExitKeys.some(code => input.down(code));

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
}
furniturePrompt.addEventListener('click', event => {
  event.stopPropagation();
  if (promptedFurniture) furnitureActionRequested = true;
});

function enterFurnitureInteraction(spot) {
  setFurniturePrompt(null);
  activeFurnitureInteraction = {
    ...spot, source: spot, returnPosition: ctrl.pos.clone(), readyToExit: false,
  };
  ctrl.pos.set(spot.x, spot.y, spot.z);
  ctrl.prevY = spot.y;
  ctrl.vel.set(0, 0, 0);
  ctrl.mode = spot.type;
  ctrl.webOn = false;
}
function leaveFurnitureInteraction() {
  const interaction = activeFurnitureInteraction;
  if (!interaction) return;
  ctrl.pos.copy(interaction.returnPosition);
  ctrl.prevY = ctrl.pos.y;
  ctrl.vel.set(0, 0, 0);
  ctrl.mode = 'ground';
  releasedSpot = interaction.source;
  activeFurnitureInteraction = null;
  furnitureInteractionCooldown = 0.4;
}

function updateFurnitureInteraction(dt) {
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
  for (const spot of furnitureInteractions) {
    if (spot === releasedSpot) continue;
    if (Math.abs(ctrl.pos.y - spot.approachY) > 0.75) continue;
    const distance = distanceToFurniture(spot, ctrl.pos);
    if (distance < 0.54 && distance < nearestDistance) {
      nearest = spot;
      nearestDistance = distance;
    }
  }
  setFurniturePrompt(nearest);
  if (nearest && (furnitureActionRequested || input.pressed('LMB'))) {
    furnitureActionRequested = false;
    enterFurnitureInteraction(nearest);
  }
  return activeFurnitureInteraction !== null;
}

// One outfit for the whole map: cut-off denim, fitted black tee, flip-flops.
function updateAvatar(dt) {
  if (!player) return;
  player.setOutfit({ hat: false, backpack: false, shoes: false, zoo: true });
  player.update({
    dt,
    mode: ctrl.mode,
    pos: ctrl.pos,
    vel: ctrl.vel,
    webOn: ctrl.webOn,
    webHand: ctrl.webHand,
    anchor: ctrl.anchor,
    ropeSlack: ctrl.webOn ? Math.max(0, ctrl.pos.distanceTo(ctrl.anchor) - ctrl.ropeLen) : 0,
    posture: activeFurnitureInteraction?.type,
    facingYaw: activeFurnitureInteraction?.yaw,
    floorY: activeFurnitureInteraction?.approachY,
  });
}

// ---------------------------------------------------------------------------
// Animation
// ---------------------------------------------------------------------------
// The mixer first, then the motion in fauna.js on top of it: the clips these
// models ship with move a head by a centimetre over six seconds, so what makes
// the paddock look alive is written in code and has to have the last word.
function tickFauna(dt, t) {
  for (const a of animals) {
    a.mixer?.update(dt);
    a.motion?.(t, dt);
  }
}

function tickStatics(dt) {
  for (const v of statics) {
    v.mixer.update(dt);
    v.pose?.();          // after the mixer: the pose overrides what it wrote
  }
}

function tickCrowd(dt) {
  for (const w of walkers) {
    w.s += w.speed * w.dir * dt;
    const at = loopAt(w.s);
    // Offset to one side of the centreline: nobody walks the crown of a path,
    // and it is what lets the two directions pass rather than collide.
    const nx = Math.cos(at.yaw), nz = -Math.sin(at.yaw);
    const x = at.x + nx * w.side, z = at.z + nz * w.side;
    w.group.position.set(x, terrainHeight(x, z) + PATH_Y, z);
    // The pack's characters face +Z in their own space, not -Z: `at.yaw` is
    // already the heading for a walker going with the loop, and it is the one
    // going against it that needs turning round. Backwards is what the whole
    // crowd was doing with these two the other way about.
    w.group.rotation.y = at.yaw + (w.dir < 0 ? Math.PI : 0);
    w.mixer.update(dt);
  }
}

function updateHud() {
  hudMode.textContent = ctrl.mode;
  hudSpeed.textContent = Math.round(ctrl.vel.length() * 3.6).toString();
  hudHeight.textContent = ctrl.pos.y.toFixed(1);
}

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(0.033, clock.getDelta());
  const t = clock.elapsedTime;

  if (started && !paused) {
    input.updateLook(dt);
    const cp = Math.cos(input.pitch);
    forward.set(-Math.sin(input.yaw) * cp, Math.sin(input.pitch), -Math.cos(input.yaw) * cp)
      .normalize();
    const locked = updateFurnitureInteraction(dt);
    if (!locked) {
      ctrl.update(dt, input, input.yaw, forward);
      updateFurnitureInteraction(0);
    }
    if (ctrl.pos.y < -60) ctrl.rescueTo(spawnPoint);
  }

  waterN.offset.x = t * 0.014;
  waterN.offset.y = -t * 0.009;
  M.water.opacity = 0.8 + Math.sin(t * 1.2) * 0.03;

  tickFauna(dt, t);
  tickCrowd(dt);
  tickStatics(dt);
  updateAvatar(dt);
  rig.update(dt, input, ctrl);
  updateHud();
  renderer.render(scene, camera);
  input.endFrame();
}
animate();

function startZoo() {
  if (started) return;
  overlay.style.display = 'none';
  setFurniturePrompt(null);
  started = true;
  paused = false;
  requestGamePointerLock();
}
startBtn.addEventListener('click', startZoo);

document.addEventListener('pointerlockchange', () => {
  usedLock = usedLock || document.pointerLockElement !== null;
  if (!usedLock) return;
  paused = !input.locked;
  if (paused) setFurniturePrompt(null);
  overlay.style.display = paused ? 'flex' : 'none';
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// Inspection hook. Named `__villa` as well so the shared capture tooling that
// frames the L.A. map works here without knowing which world it is in.
const hook = {
  THREE, scene, camera, renderer, world, fauna, crowd, ctrl, rig, input, player, spawnPoint,
  furnitureInteractions, enterFurnitureInteraction, leaveFurnitureInteraction,
  updateFurnitureInteraction, animals, walkers, statics, LOOP, loopAt, terrainHeight,
  get activeFurnitureInteraction() { return activeFurnitureInteraction; },
};
window.__zoo = hook;
window.__villa = hook;
