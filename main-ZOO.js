import * as THREE from 'three';
import { createShopProducts, shopSign, textileBump, beadboardTexture, rugTexture,
  posterTexture } from './zooShopProducts.js?v=3';
import { Player } from './player.js?v=49';
import { harmoniseHair } from './hair.js?v=8';
import { Input } from './input.js';
import { Controller } from './controller.js?v=7';
import { CameraRig } from './cameraRig.js?v=5';
import { buildCityBoxes } from './cityBoxes.js?v=4';
import { buildCar } from './cars.js?v=6-glb';
import { makeVisitor, loadVisitorBase, loadGuestRig, STAFF_UNIFORM } from './crowd.js?v=22';
import { loadSpecies, placeAnimal, SPECIES } from './fauna.js?v=31';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

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
// Packed straw, painted rather than photographed: there is no hay map in the
// nature set, and tinting the lawn yellow still reads as grass. Strokes wrap
// across the canvas edges so the tile does not flash a seam on a 2 m heap.
function makeHayAlbedo() {
  const size = 512;
  const c = Object.assign(document.createElement('canvas'), { width: size, height: size });
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#b89248';
  ctx.fillRect(0, 0, size, size);
  const wash = ctx.createLinearGradient(0, 0, size, size * 0.35);
  wash.addColorStop(0, 'rgba(232, 196, 110, 0.28)');
  wash.addColorStop(1, 'rgba(120, 88, 36, 0.22)');
  ctx.fillStyle = wash;
  ctx.fillRect(0, 0, size, size);
  const cols = ['#e8c878', '#d4b05c', '#c49a48', '#a87c38', '#8c6428', '#f0d490', '#b8863c', '#9a7030'];
  ctx.lineCap = 'round';
  for (let i = 0; i < 2400; i++) {
    const x = Math.random() * size, y = Math.random() * size;
    const ang = (Math.random() - 0.5) * 0.9 + (i % 5 === 0 ? 1.15 : 0.12);
    const len = 14 + Math.random() * 40;
    const x1 = x + Math.cos(ang) * len, y1 = y + Math.sin(ang) * len;
    ctx.strokeStyle = cols[i % cols.length];
    ctx.globalAlpha = 0.28 + Math.random() * 0.5;
    ctx.lineWidth = 0.55 + Math.random() * 1.4;
    for (const ox of [0, -size, size]) for (const oy of [0, -size, size]) {
      ctx.beginPath();
      ctx.moveTo(x + ox, y + oy);
      ctx.lineTo(x1 + ox, y1 + oy);
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(2.4, 2.4);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = maxAniso;
  t.needsUpdate = true;
  return t;
}
// A tuft of loose stalks, used as crossed cards so a hay pile has a ragged
// silhouette instead of a smooth baked potato.
function makeHayTuft() {
  const w = 256, h = 256;
  const c = Object.assign(document.createElement('canvas'), { width: w, height: h });
  const ctx = c.getContext('2d');
  const cols = ['#e8c878', '#d4b05c', '#c49a48', '#f0d490', '#a87c38', '#8c6428'];
  const cx = w * 0.5, base = h * 0.94;
  ctx.lineCap = 'round';
  for (let i = 0; i < 46; i++) {
    const spread = (Math.random() - 0.5) * 1.2;
    const len = h * (0.42 + Math.random() * 0.5);
    ctx.strokeStyle = cols[i % cols.length];
    ctx.globalAlpha = 0.5 + Math.random() * 0.45;
    ctx.lineWidth = 1.1 + Math.random() * 2.3;
    ctx.beginPath();
    ctx.moveTo(cx + (Math.random() - 0.5) * 30, base);
    ctx.quadraticCurveTo(
      cx + spread * w * 0.16 + (Math.random() - 0.5) * 18,
      base - len * 0.46,
      cx + spread * w * 0.4,
      base - len,
    );
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = maxAniso;
  t.needsUpdate = true;
  return t;
}
// A sprig of broadleaf foliage on one alpha-cut card: a few shoots fanning up
// out of the bottom edge, each carrying alternate ovate leaves. This is what
// gives a crown a leafy edge — a solid blob, however lumpy, always reads as a
// faceted rock at the silhouette, because that is exactly what it is.
// One card carries a whole CLUMP of leaves, filling a disc in the middle of the
// bitmap. The first pass drew a spray rising out of the bottom edge, which fills
// barely a third of its card: three hundred of those still left a crown looking
// like a green ball with leaves stuck on it, because two thirds of every card
// was empty. A clump covers its card, so cards overlap into a continuous canopy.
//
// Everything is drawn inside SAFE of the centre. Run the alpha off the edge of
// the bitmap and the card's own rectangle becomes the silhouette.
function makeSprigTex() {
  const size = 512, mid = size / 2, SAFE = 236;
  const c = Object.assign(document.createElement('canvas'), { width: size, height: size });
  const ctx = c.getContext('2d');
  const tones = ['#44602c', '#4d6a32', '#567539', '#608141', '#6b8e4a', '#779b55', '#85a964'];
  let seed = 11;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const leaf = (x, y, ang, len, wid, fill) => {
    const dx = Math.cos(ang), dy = Math.sin(ang);
    // Clip the blade rather than the card: a leaf that would cross the safe
    // radius is shortened until it does not.
    const tipR = Math.hypot(x + dx * len - mid, y + dy * len - mid);
    if (tipR > SAFE) len *= Math.max(0.2, (SAFE - 6) / tipR);
    const px = -dy * wid, py = dx * wid;
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + dx * len * 0.34 + px, y + dy * len * 0.34 + py,
      x + dx * len, y + dy * len);
    ctx.quadraticCurveTo(x + dx * len * 0.34 - px, y + dy * len * 0.34 - py, x, y);
    ctx.fill();
    ctx.strokeStyle = 'rgba(206, 224, 168, 0.3)';
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + dx * len * 0.78, y + dy * len * 0.78);
    ctx.stroke();
  };
  // A shoot radiating out of the middle of the card, blades set alternately
  // along it. Lit from the top of the card so a clump has a light side.
  const shoot = (x0, y0, ang, len, count, scale) => {
    ctx.strokeStyle = '#4a3d29';
    ctx.lineWidth = 2.0 * scale;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.quadraticCurveTo(x0 + Math.cos(ang) * len * 0.5, y0 + Math.sin(ang) * len * 0.5,
      x0 + Math.cos(ang) * len, y0 + Math.sin(ang) * len);
    ctx.stroke();
    for (let i = 0; i < count; i++) {
      const t = 0.1 + (i / count) * 0.92;
      const bx = x0 + Math.cos(ang) * len * t;
      const by = y0 + Math.sin(ang) * len * t;
      const side = i % 2 ? 1 : -1;
      const la = ang + side * (0.6 + rnd() * 0.45);
      const lit = Math.min(tones.length - 1,
        Math.round((1 - by / size) * 3.4 + rnd() * 2.6));
      leaf(bx, by, la, (44 + rnd() * 20) * scale, (16 + rnd() * 6) * scale, tones[lit]);
    }
    leaf(x0 + Math.cos(ang) * len, y0 + Math.sin(ang) * len, ang,
      (38 + rnd() * 14) * scale, 15 * scale, tones[tones.length - 2]);
  };
  // Shoots fan out in every direction from a loose centre, so the clump has no
  // stem end and can be laid on the crown at any roll without looking planted.
  const N = 16;
  for (let k = 0; k < N; k++) {
    const ang = (k / N) * 6.283185 + (rnd() - 0.5) * 0.34;
    const r0 = 18 + rnd() * 40;
    const x0 = mid + Math.cos(ang) * r0, y0 = mid + Math.sin(ang) * r0;
    shoot(x0, y0, ang, 78 + rnd() * 62, 4 + Math.floor(rnd() * 3), 1);
  }
  // Fill the middle, which the radial shoots leave thin, and add a second
  // smaller layer so the clump has depth rather than one flat ring of blades.
  for (let k = 0; k < 22; k++) {
    const ang = rnd() * 6.283185;
    const r0 = rnd() * 96;
    leaf(mid + Math.cos(ang) * r0, mid + Math.sin(ang) * r0, rnd() * 6.283185,
      40 + rnd() * 24, 15 + rnd() * 6, tones[Math.floor(rnd() * tones.length)]);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = maxAniso;
  t.needsUpdate = true;
  return t;
}
// Conifer version of the same clump: sprays of needles radiating from the
// middle of the card instead of leafy shoots.
function makeNeedleTex() {
  const size = 512, mid = size / 2, SAFE = 234;
  const c = Object.assign(document.createElement('canvas'), { width: size, height: size });
  const ctx = c.getContext('2d');
  const tones = ['#33482b', '#3b5331', '#445e38', '#4e6b40', '#597a49', '#658a55'];
  let seed = 29;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  ctx.lineCap = 'round';
  const spray = (x0, y0, ang, len, scale) => {
    ctx.strokeStyle = '#3a3122';
    ctx.lineWidth = 2.2 * scale;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x0 + Math.cos(ang) * len, y0 + Math.sin(ang) * len);
    ctx.stroke();
    const n = Math.round(18 * scale) + 6;
    for (let i = 0; i < n; i++) {
      const t = 0.06 + (i / n) * 0.94;
      const bx = x0 + Math.cos(ang) * len * t;
      const by = y0 + Math.sin(ang) * len * t;
      for (const side of [-1, 1]) {
        const na = ang + side * (0.8 + rnd() * 0.4);
        let nl = (20 + rnd() * 14) * scale * (1 - 0.3 * t);
        const tipR = Math.hypot(bx + Math.cos(na) * nl - mid, by + Math.sin(na) * nl - mid);
        if (tipR > SAFE) nl *= Math.max(0.2, (SAFE - 4) / tipR);
        ctx.strokeStyle = tones[Math.min(tones.length - 1,
          Math.round((1 - by / size) * 3.0 + rnd() * 2.6))];
        ctx.lineWidth = (1.9 + rnd() * 1.3) * scale;
        ctx.beginPath();
        ctx.moveTo(bx, by);
        ctx.lineTo(bx + Math.cos(na) * nl, by + Math.sin(na) * nl);
        ctx.stroke();
      }
    }
  };
  // Two rings of sprays of unequal length. One ring of equal ones draws a star,
  // which is what a conifer clump must not look like at arm's length.
  const N = 19;
  for (let k = 0; k < N; k++) {
    const ang = (k / N) * 6.283185 + (rnd() - 0.5) * 0.42;
    const r0 = 10 + rnd() * 34;
    spray(mid + Math.cos(ang) * r0, mid + Math.sin(ang) * r0, ang, 80 + rnd() * 88, 1);
  }
  for (let k = 0; k < 12; k++) {
    const ang = rnd() * 6.283185;
    const r0 = 20 + rnd() * 70;
    spray(mid + Math.cos(ang) * r0, mid + Math.sin(ang) * r0, ang + (rnd() - 0.5) * 1.2,
      48 + rnd() * 52, 0.8);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = maxAniso;
  t.needsUpdate = true;
  return t;
}
function withUV2(geometry) {
  if (!geometry.getAttribute('uv2') && geometry.getAttribute('uv')) {
    const uv = geometry.getAttribute('uv');
    geometry.setAttribute('uv2', new THREE.BufferAttribute(new Float32Array(uv.array), 2));
  }
  return geometry;
}
// Path slabs are stretched boxes; mesh UVs would smear the dirt along the
// length. Map albedo/normal/roughness from world XZ so every metre of path
// gets the same grain, regardless of how long the segment is.
function worldXZUv(mat, metersPerTile = 2.4) {
  const s = 1 / metersPerTile;
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace(
      '#include <worldpos_vertex>',
      `#include <worldpos_vertex>
      {
        vec4 wp = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          wp = instanceMatrix * wp;
        #endif
        wp = modelMatrix * wp;
        vec2 gUV = wp.xz * ${s.toFixed(4)};
        #ifdef USE_MAP
          vMapUv = gUV;
        #endif
        #ifdef USE_NORMALMAP
          vNormalMapUv = gUV;
        #endif
        #ifdef USE_ROUGHNESSMAP
          vRoughnessMapUv = gUV;
        #endif
      }`,
    );
  };
  mat.customProgramCacheKey = () => 'wxz-' + metersPerTile;
  return mat;
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
  // The crowd recolours skin, hair and clothing with flat tints (see crowd.js).
  // A packed metallic/smoothness map left in place turns those tints into a
  // black mirror under the sun: it declares the whole body a metal and kills
  // the diffuse. The zoo's people are dressed, not glossed, so the map is
  // dropped and the material's own constants carry the finish.
  if (rec.metalTex) {
    m.metalness = Math.min(rec.metallic ?? 0, 0.05);
    m.roughness = THREE.MathUtils.clamp(1 - (rec.smoothness ?? 0.25), 0.6, 1);
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
// Wood / bark / roof / canopy maps: Poly Haven CC0 (wooden_planks, pine_bark,
// roof_slates_02, roof_tiles_14) + ambientCG Plaster001 CC0. Leaf cards use a
// photoscan clump of leafy_grass.
// ---------------------------------------------------------------------------
const woodN = ntex('./textures/nature/wood_n.jpg', 3, 1);
const woodA = tex('./textures/nature/wood_diff.jpg', 3, 1);
const woodR = ntex('./textures/nature/wood_r.jpg', 3, 1);
const concN = ntex('./textures/CP_Concrete_01_N.webp', 4, 4);
const stoneN = ntex('./textures/CP_Brick_Wall_N.webp', 5, 3);
const brickA = tex('./textures/CP_Brick_Wall_A.webp', 5, 3);
const asphaltA = tex('./textures/CP_Asphalt_A.webp', 24, 24);
const asphaltN = ntex('./textures/CP_Asphalt_N.webp', 24, 24);
const lawnA = tex('./textures/la/grass_diffuse.jpg', 120, 120);
const waterN = ntex('./textures/la/water_normal.jpg', 8, 8);
const dirtA = tex('./textures/nature/dirt_diff.jpg');
const dirtN = ntex('./textures/nature/dirt_n.jpg');
const dirtR = ntex('./textures/nature/dirt_r.jpg');
const paverA = tex('./textures/nature/paver_diff.jpg');
const paverN = ntex('./textures/nature/paver_n.jpg');
const paverR = ntex('./textures/nature/paver_r.jpg');
const barkA = tex('./textures/nature/bark_diff.jpg', 1, 2);
const barkN = ntex('./textures/nature/bark_n.jpg', 1, 2);
const shingleA = tex('./textures/nature/shingle_diff.jpg', 4, 3);
const shingleN = ntex('./textures/nature/shingle_n.jpg', 4, 3);
const shingleRedA = tex('./textures/nature/shingle_red_diff.jpg', 4, 3);
const shingleRedN = ntex('./textures/nature/shingle_red_n.jpg', 4, 3);
const meadowA = tex('./textures/nature/foliage_diff.jpg', 18, 18);
const canopyA = tex('./textures/nature/canopy_leaf.jpg', 3.0, 3.0);
const canopyN = ntex('./textures/nature/foliage_n.jpg', 3.0, 3.0);
const hedgeA = tex('./textures/nature/canopy_leaf.jpg', 4.4, 4.4);
const hedgeN = ntex('./textures/nature/foliage_n.jpg', 4.4, 4.4);
const hayA = makeHayAlbedo();
const hayTuftA = makeHayTuft();
const sprigA = makeSprigTex();
const needleA = makeNeedleTex();

const M = {
  // Compacted earth: the visitor path. Warm, matte, and slightly redder than
  // the surrounding soil so the route reads at a distance from the ground alone.
  dirt: worldXZUv(new THREE.MeshStandardMaterial({
    map: dirtA, normalMap: dirtN, roughnessMap: dirtR,
    normalScale: new THREE.Vector2(1.05, 1.05),
    color: 0xe8d4b0, roughness: 1.0, metalness: 0.0,
  })),
  dirtEdge: worldXZUv(new THREE.MeshStandardMaterial({
    map: dirtA, normalMap: dirtN, roughnessMap: dirtR,
    normalScale: new THREE.Vector2(0.9, 0.9),
    color: 0xc4a078, roughness: 1.0,
  }), 2.8),
  plaza: worldXZUv(new THREE.MeshStandardMaterial({
    map: paverA, normalMap: paverN, roughnessMap: paverR,
    normalScale: new THREE.Vector2(1.15, 1.15),
    color: 0xf2eee6, roughness: 1.0, metalness: 0.0,
  }), 1.6),
  lawn: new THREE.MeshStandardMaterial({ map: lawnA, color: 0x93a86c, roughness: 0.99 }),
  meadow: new THREE.MeshStandardMaterial({
    map: meadowA, color: 0xc4b888, roughness: 0.99,
  }),
  hay: new THREE.MeshStandardMaterial({
    map: hayA, color: 0xf2e0a8, roughness: 1.0, metalness: 0.0,
  }),
  hayTuft: new THREE.MeshStandardMaterial({
    map: hayTuftA, color: 0xf0dc9c, roughness: 1.0, metalness: 0.0,
    alphaTest: 0.28, alphaToCoverage: true, side: THREE.DoubleSide,
  }),
  sand: new THREE.MeshStandardMaterial({ color: 0xcbb489, roughness: 0.99 }),
  sandFloor: worldXZUv(new THREE.MeshStandardMaterial({
    map: dirtA, normalMap: dirtN, roughnessMap: dirtR,
    normalScale: new THREE.Vector2(0.7, 0.7),
    color: 0xffe6b8, roughness: 1.0, metalness: 0.0,
  }), 2.2),
  bark: new THREE.MeshStandardMaterial({
    map: barkA, normalMap: barkN, normalScale: new THREE.Vector2(0.7, 0.7),
    color: 0xc4a888, roughness: 0.95,
  }),
  birch: new THREE.MeshStandardMaterial({
    map: woodA, normalMap: woodN, color: 0xe8e2d6, roughness: 0.9,
  }),
  barkDark: new THREE.MeshStandardMaterial({
    map: barkA, normalMap: barkN, normalScale: new THREE.Vector2(0.7, 0.7),
    color: 0x8a7358, roughness: 0.95,
  }),
  foliage: new THREE.MeshStandardMaterial({
    map: canopyA, normalMap: canopyN, normalScale: new THREE.Vector2(1.05, 1.05),
    color: 0xeef6dc, roughness: 0.9,
  }),
  foliageDark: new THREE.MeshStandardMaterial({
    map: canopyA, normalMap: canopyN, normalScale: new THREE.Vector2(1.1, 1.1),
    color: 0xb4c48c, roughness: 0.92,
  }),
  foliageLight: new THREE.MeshStandardMaterial({
    map: canopyA, normalMap: canopyN, normalScale: new THREE.Vector2(0.9, 0.9),
    color: 0xffffff, roughness: 0.88,
  }),
  hedge: new THREE.MeshStandardMaterial({
    map: hedgeA, normalMap: hedgeN, normalScale: new THREE.Vector2(1.15, 1.15),
    color: 0xd8e6b0, roughness: 0.93,
  }),
  // The solid mass under the leaf cards. Darker than the loose foliage
  // materials on purpose: what shows through the gaps between sprigs is the
  // shaded heart of the crown, and a bright ball behind a lace of leaves reads
  // as exactly that — a ball behind some leaves.
  crownMid: new THREE.MeshStandardMaterial({
    map: canopyA, normalMap: canopyN, normalScale: new THREE.Vector2(1.05, 1.05),
    color: 0x9db078, roughness: 0.94,
  }),
  crownDark: new THREE.MeshStandardMaterial({
    map: canopyA, normalMap: canopyN, normalScale: new THREE.Vector2(1.1, 1.1),
    color: 0x76895c, roughness: 0.95,
  }),
  conifer: new THREE.MeshStandardMaterial({
    map: canopyA, normalMap: canopyN, normalScale: new THREE.Vector2(1.1, 1.1),
    color: 0x3e5238, roughness: 0.96,
  }),
  crownLight: new THREE.MeshStandardMaterial({
    map: canopyA, normalMap: canopyN, normalScale: new THREE.Vector2(0.9, 0.9),
    color: 0xb8c890, roughness: 0.92,
  }),
  // Alpha-cut foliage cards. Three tints rather than a per-instance colour:
  // one draw call each, and the crown wants shade at the bottom and sun on top,
  // which three bands give you without touching the instance colour attribute.
  sprigSun: new THREE.MeshStandardMaterial({
    map: sprigA, color: 0xe6f0c4, roughness: 0.96, metalness: 0.0,
    alphaTest: 0.42, alphaToCoverage: true, side: THREE.DoubleSide,
  }),
  sprigMid: new THREE.MeshStandardMaterial({
    map: sprigA, color: 0xc2d29a, roughness: 0.96, metalness: 0.0,
    alphaTest: 0.42, alphaToCoverage: true, side: THREE.DoubleSide,
  }),
  sprigShade: new THREE.MeshStandardMaterial({
    map: sprigA, color: 0x94a874, roughness: 0.97, metalness: 0.0,
    alphaTest: 0.42, alphaToCoverage: true, side: THREE.DoubleSide,
  }),
  needleSun: new THREE.MeshStandardMaterial({
    map: needleA, color: 0xbccfa2, roughness: 0.96, metalness: 0.0,
    alphaTest: 0.4, alphaToCoverage: true, side: THREE.DoubleSide,
  }),
  needleShade: new THREE.MeshStandardMaterial({
    map: needleA, color: 0x84996e, roughness: 0.97, metalness: 0.0,
    alphaTest: 0.4, alphaToCoverage: true, side: THREE.DoubleSide,
  }),
  bamboo: new THREE.MeshStandardMaterial({ color: 0x8fa350, roughness: 0.9 }),
  timber: new THREE.MeshStandardMaterial({
    map: woodA, normalMap: woodN, roughnessMap: woodR,
    normalScale: new THREE.Vector2(0.55, 0.55),
    color: 0xd2b07a, roughness: 0.82, metalness: 0.02,
  }),
  // The chalet walls, once they have a door in them. A wall is one box, so
  // from inside you are looking at its back faces — single-sided, the shop
  // simply has no interior and you see the park straight through it.
  timberWall: new THREE.MeshStandardMaterial({
    map: woodA, normalMap: woodN, roughnessMap: woodR,
    normalScale: new THREE.Vector2(0.55, 0.55),
    color: 0xd2b07a, roughness: 0.82, metalness: 0.02, side: THREE.DoubleSide,
  }),
  timberWallDark: new THREE.MeshStandardMaterial({
    map: woodA, normalMap: woodN, roughnessMap: woodR,
    color: 0x8a5c38, roughness: 0.84, side: THREE.DoubleSide,
  }),
  plank: new THREE.MeshStandardMaterial({
    map: woodA, normalMap: woodN, color: 0xc49a68, roughness: 0.9,
  }),
  // The shop ceilings, seen from under a pendant lamp: boarded like the walls
  // rather than a flat brown lid, and darker than the lining so the lamp's
  // spill on it reads as light on a surface instead of a blown-out patch.
  ceilingIn: new THREE.MeshStandardMaterial({
    map: woodA, normalMap: woodN, normalScale: new THREE.Vector2(0.5, 0.5),
    color: 0x7c5c3e, roughness: 0.96,
  }),
  timberDark: new THREE.MeshStandardMaterial({
    map: woodA, normalMap: woodN, color: 0x8a5c38, roughness: 0.84,
  }),
  timberPale: new THREE.MeshStandardMaterial({
    map: woodA, normalMap: woodN, color: 0xe8c888, roughness: 0.8,
  }),
  shingle: new THREE.MeshStandardMaterial({
    map: shingleA, normalMap: shingleN, normalScale: new THREE.Vector2(0.8, 0.8),
    color: 0xc8c0b4, roughness: 0.9,
  }),
  shingleRed: new THREE.MeshStandardMaterial({
    map: shingleRedA, normalMap: shingleRedN, normalScale: new THREE.Vector2(0.8, 0.8),
    color: 0xd8c4b0, roughness: 0.88,
  }),
  stone: new THREE.MeshStandardMaterial({
    map: brickA, normalMap: stoneN, normalScale: new THREE.Vector2(0.45, 0.45),
    color: 0xd8d0c4, roughness: 0.93, metalness: 0.01,
  }),
  rock: new THREE.MeshStandardMaterial({ color: 0x8b8579, roughness: 0.97 }),
  rockWarm: new THREE.MeshStandardMaterial({ color: 0xa08a70, roughness: 0.96 }),
  concrete: new THREE.MeshStandardMaterial({
    normalMap: concN, normalScale: new THREE.Vector2(0.3, 0.3),
    color: 0xb9b3a8, roughness: 0.94, metalness: 0.02,
  }),
  steel: new THREE.MeshStandardMaterial({ color: 0x4a5158, roughness: 0.42, metalness: 0.72 }),
  // Shop appliances: brushed rather than mirrored. `steel` has nothing to
  // reflect indoors — there is no environment map on this world — so the
  // coffee machine and the gelato case came out as black slabs.
  applianceSteel: new THREE.MeshStandardMaterial({
    color: 0xb4b9bd, roughness: 0.34, metalness: 0.18,
  }),
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
  ceramicBlue: new THREE.MeshPhysicalMaterial({ color: 0x5f8f99, roughness: 0.34, clearcoat: 0.35 }),
  ceramicRed: new THREE.MeshPhysicalMaterial({ color: 0xb85d48, roughness: 0.36, clearcoat: 0.3 }),
  glassClear: new THREE.MeshPhysicalMaterial({
    color: 0xeaf6f3, roughness: 0.08, transmission: 0.35,
    transparent: true, opacity: 0.58, depthWrite: false, clearcoat: 1,
  }),
  bottleGreen: new THREE.MeshPhysicalMaterial({
    color: 0x3f725b, roughness: 0.18, transparent: true, opacity: 0.8, clearcoat: 0.8,
  }),
  labelCream: new THREE.MeshStandardMaterial({ color: 0xf2dfb9, roughness: 0.72 }),
  iceVanilla: new THREE.MeshStandardMaterial({ color: 0xf4dfb2, roughness: 0.68 }),
  iceBerry: new THREE.MeshStandardMaterial({ color: 0xd77986, roughness: 0.72 }),
  iceMint: new THREE.MeshStandardMaterial({ color: 0x92bea1, roughness: 0.72 }),
  waffle: new THREE.MeshStandardMaterial({ color: 0xc68b49, roughness: 0.88 }),
  paperBlue: new THREE.MeshStandardMaterial({ color: 0x477987, roughness: 0.84 }),
  paperOchre: new THREE.MeshStandardMaterial({ color: 0xd19a4b, roughness: 0.84 }),
  paperGreen: new THREE.MeshStandardMaterial({ color: 0x66865a, roughness: 0.84 }),
  poster: new THREE.MeshStandardMaterial({ color: 0xdfd3b6, roughness: 0.9 }),
  // Shelf lighting. Not a light: a strip under each shelf board that carries
  // its own emission, which is how a real display case reads lit from the
  // aisle without a point light per shelf.
  shelfGlow: new THREE.MeshStandardMaterial({
    color: 0xffe9c6, emissive: 0xffd9a0, emissiveIntensity: 1.15, roughness: 0.7,
  }),
  // Counter fronts and shelf ends: painted joinery, a shade off the lining so
  // the two planes separate under one lamp.
  paintSage: new THREE.MeshStandardMaterial({ color: 0x5d7261, roughness: 0.66 }),
  paintCream: new THREE.MeshStandardMaterial({ color: 0xdcd2bb, roughness: 0.7 }),
  collider: new THREE.MeshBasicMaterial({ visible: false }),
};

const world = new THREE.Group();
const shopProducts = createShopProducts(scene, maxAniso);
const shopFurBump = textileBump();
for (const mat of [M.plushBrown, M.plushPink, M.plushBlue, M.plushYellow, M.plushCream]) {
  mat.bumpMap = shopFurBump;
  mat.bumpScale = 0.018;
}
const shopShelf = new THREE.MeshStandardMaterial({
  map: woodA, normalMap: woodN, normalScale: new THREE.Vector2(0.5, 0.5),
  color: 0xcfb287, roughness: 0.7,
});
// The wall behind the shelves: boarded, not a painted slab. It is the largest
// surface in the room and it was the flattest.
const shopLiningMap = beadboardTexture(14);
const shopLining = new THREE.MeshStandardMaterial({
  map: shopLiningMap, bumpMap: shopLiningMap, bumpScale: 0.02,
  color: 0xf0e8d6, roughness: 0.86,
});
// Woven, with a border. `M.rug` is emitted as floor rather than as a prop, so
// this is the one shop surface the player actually stands on.
const rugMap = rugTexture();
// Both canvases are seen at grazing angles — the floor under your feet and a
// wall you stand a metre from — so they want the same filtering as the park's.
rugMap.anisotropy = shopLiningMap.anisotropy = maxAniso;
M.rug = new THREE.MeshStandardMaterial({
  map: rugMap, bumpMap: shopFurBump, bumpScale: 0.03,
  color: 0xffffff, roughness: 0.97,
});
const shopPosters = [0, 1, 2].map(i => new THREE.MeshStandardMaterial({
  map: posterTexture(i), roughness: 0.92,
}));
const souvenirSign = shopSign('LA BOUTIQUE DU ZOO', 'Peluches • Céramiques • Souvenirs');
const cafeSign = shopSign('LA PAUSE GOURMANDE', 'Café • Boissons fraîches • Glaces artisanales');
scene.add(world);
// Animated scenery. Outside `world` on purpose: nothing here is collidable and
// nothing here should ever be a candidate for the ground probe.
const fauna = new THREE.Group();
const crowd = new THREE.Group();
// Leaf cards. Outside `world` for the same reason the animals are: cityBoxes
// turns every InstancedMesh under `world` into collision AABBs, and ten
// thousand foliage quads would be ten thousand invisible boxes to walk into.
const foliageFX = new THREE.Group();
scene.add(fauna, crowd, foliageFX);

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

// One organic canopy, not a cluster of spheres. Vertices are displaced so the
// silhouette is lumpy, and the underside is flattened so the trunk reads as
// growing *into* the crown instead of a lollipop stick under a ball.
// IcosahedronGeometry comes back unindexed, so computeVertexNormals gives every
// triangle its own flat normal — which is why the crowns read as cut gemstones
// however lumpy the displacement was. Welding the seams first is what turns the
// shading smooth; the extra octaves then break the profile at a scale smaller
// than a facet, so the lumps stop lining up with the underlying icosahedron.
function lumpyCrown(seed, flatten = 0.12, lump = 0.14) {
  const g = mergeVertices(new THREE.IcosahedronGeometry(0.5, 3), 1e-5);
  const pos = g.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const n = 1
      + lump * Math.sin(v.x * 6.8 + seed * 2.1)
      + lump * 0.75 * Math.sin(v.z * 5.9 + seed * 1.4)
      + lump * 0.45 * Math.sin(v.y * 7.2 + v.x * 3.3 + seed)
      + lump * 0.34 * Math.sin(v.x * 13.1 + v.z * 9.7 + seed * 3.3)
      + lump * 0.22 * Math.sin(v.y * 17.4 + v.z * 12.6 + seed * 1.9);
    v.multiplyScalar(n);
    if (v.y < 0) v.y *= 1 - flatten;
    else v.y *= 0.88;
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  boxProjectUv(g, 1.4);
  return withUV2(g);
}
// A sphere's own UVs converge on its poles, so the leaf texture arrives at the
// top and bottom of a crown as vertical smears — the streaks that made a crown
// look brushed rather than leafy. Projecting each vertex down its dominant axis
// instead gives six flat patches: seams where the axes change, invisible inside
// foliage, and no compression anywhere.
function boxProjectUv(g, scale = 1) {
  const pos = g.attributes.position;
  const nrm = g.attributes.normal;
  const uv = g.attributes.uv;
  if (!uv) return g;
  for (let i = 0; i < pos.count; i++) {
    const px = pos.getX(i), py = pos.getY(i), pz = pos.getZ(i);
    const ax = Math.abs(nrm.getX(i)), ay = Math.abs(nrm.getY(i)), az = Math.abs(nrm.getZ(i));
    let u, v;
    if (ax >= ay && ax >= az) { u = pz; v = py; }
    else if (ay >= az) { u = px; v = pz; }
    else { u = px; v = py; }
    uv.setXY(i, u * scale + 0.5, v * scale + 0.5);
  }
  uv.needsUpdate = true;
  return g;
}
// A hay pile, not a bush: lumpy, sitting on the dirt, unit-sized so sx/sy/sz
// are the world extents. Two seeds so the aviary's pair are not twins.
function hayHeapGeom(seed) {
  const g = new THREE.IcosahedronGeometry(0.5, 3);
  const pos = g.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const n = 1
      + 0.17 * Math.sin(v.x * 7.1 + seed * 2.1)
      + 0.14 * Math.sin(v.z * 6.0 + seed * 1.4)
      + 0.10 * Math.sin(v.y * 8.4 + v.x * 3.6 + seed)
      + 0.07 * Math.sin(v.x * 14.8 + v.z * 11.2 + seed * 2.7);
    v.multiplyScalar(n);
    if (v.y < 0) v.y *= 0.16;
    else v.y *= 0.95;
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeBoundingBox();
  g.translate(0, -g.boundingBox.min.y, 0);
  g.computeBoundingBox();
  const { min, max } = g.boundingBox;
  g.scale(1 / Math.max(max.x - min.x, 1e-3), 1 / Math.max(max.y, 1e-3), 1 / Math.max(max.z - min.z, 1e-3));
  g.computeVertexNormals();
  g.computeBoundingBox();
  g.computeBoundingSphere();
  return withUV2(g);
}
// The pine's mass: a tiered profile rather than a straight cone, sampled finely
// enough that no vertex ring shows as a crease, and given a slight radial wobble
// so the rim is not a perfect circle of 16 straight chords.
function pineCrownGeom() {
  const pts = [];
  const STEPS = 26;
  for (let i = 0; i <= STEPS; i++) {
    const t = i / STEPS;
    // Base taper, plus a whorl ripple: real conifers step out at every branch
    // tier, and the steps are what keep the silhouette off a smooth cone.
    const taper = Math.pow(1 - t, 0.82);
    const whorl = 1 + 0.1 * Math.sin(t * Math.PI * 5.2 - 0.6);
    pts.push(new THREE.Vector2(Math.max(0, 0.5 * taper * whorl), t));
  }
  pts[0].x = 0.06;
  pts[pts.length - 1].x = 0;
  const g = new THREE.LatheGeometry(pts, 30);
  const pos = g.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const a = Math.atan2(v.z, v.x);
    const k = 1 + 0.09 * Math.sin(a * 7 + v.y * 9.3) + 0.05 * Math.sin(a * 13 - v.y * 5.1);
    pos.setXYZ(i, v.x * k, v.y, v.z * k);
  }
  g.computeVertexNormals();
  return withUV2(g);
}

const G = {
  box: withUV2(new THREE.BoxGeometry(1, 1, 1)),
  cyl: withUV2(new THREE.CylinderGeometry(0.5, 0.5, 1, 14)),
  cylBase: withUV2(new THREE.CylinderGeometry(0.5, 0.5, 1, 14).translate(0, 0.5, 0)),
  post: withUV2(new THREE.CylinderGeometry(0.5, 0.5, 1, 8).translate(0, 0.5, 0)),
  trunk: withUV2(new THREE.CylinderGeometry(0.32, 0.5, 1, 9).translate(0, 0.5, 0)),
  branch: withUV2(new THREE.CylinderGeometry(0.28, 0.5, 1, 8).translate(0, 0.5, 0)),
  sphere: withUV2(new THREE.SphereGeometry(0.5, 14, 10)),
  blob: withUV2(new THREE.IcosahedronGeometry(0.5, 2)),
  crown: withUV2(new THREE.SphereGeometry(0.5, 18, 14)),
  canopyA: lumpyCrown(1.15),
  canopyB: lumpyCrown(2.84),
  canopyC: lumpyCrown(4.61),
  pineCrown: pineCrownGeom(),
  bush: lumpyCrown(3.37, 0.58, 0.18),
  hayHeapA: hayHeapGeom(1.15),
  hayHeapB: hayHeapGeom(2.84),
  card: withUV2(new THREE.PlaneGeometry(1, 1)),
  // Card whose pivot is its bottom edge, so a sprig grows out along +Y.
  cardUp: withUV2(new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0)),
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

// ---------------------------------------------------------------------------
// Foliage cards. A separate kit from `emit`, because these go to foliageFX
// rather than to `world`, and because they need a full orientation: a card laid
// out with YXZ Euler angles ends up standing in a vertical plane whatever the
// yaw, so a crown clothed that way is a fan of edge-on shards. Each card gets a
// basis instead — +Y along the shoot, face turned towards the crown normal.
// ---------------------------------------------------------------------------
const leafKits = new Map();
const _frameQ = new THREE.Quaternion(), _localQ = new THREE.Quaternion();
const _yAxis = new THREE.Vector3(0, 1, 0);
const _cx = new THREE.Vector3(), _cy = new THREE.Vector3(), _cz = new THREE.Vector3();
const _cmat = new THREE.Matrix4(), _cq = new THREE.Quaternion();
function cardQuat(dir, face) {
  _cy.copy(dir).normalize();
  _cx.crossVectors(face, _cy);
  if (_cx.lengthSq() < 1e-8) _cx.crossVectors(_cy, _cz.set(0, 0, 1));
  _cx.normalize();
  _cz.crossVectors(_cx, _cy);
  _cmat.makeBasis(_cx, _cy, _cz);
  return _cq.setFromRotationMatrix(_cmat).toArray();
}
function leafCard(mat, x, y, z, w, h, q) {
  const c = Math.cos(FR), s = Math.sin(FR);
  let k = leafKits.get(mat);
  if (!k) leafKits.set(mat, (k = []));
  const qq = FR ? _frameQ.setFromAxisAngle(_yAxis, FR).multiply(_localQ.fromArray(q)).toArray() : q;
  k.push({ x: FX + x * c + z * s, y, z: FZ - x * s + z * c, w, h, q: qq });
}
function hash1(n) {
  const v = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return v - Math.floor(v);
}
const _fN = new THREE.Vector3(), _fT1 = new THREE.Vector3(), _fT2 = new THREE.Vector3();
const _fDir = new THREE.Vector3(), _fFace = new THREE.Vector3();
// Clothe an ellipsoidal crown in sprigs. The solid mass stays underneath — it
// is what casts the shadow and fills the interior — and the cards only have to
// make the edge of it leafy, which is the whole of the "too angular" problem.
function cloakCrown(x, y, z, sx, sy, sz, seed, tints, cardScale = 0.58, cover = 9) {
  const rx = sx * 0.5, ry = sy * 0.5, rz = sz * 0.5;
  const R = (rx + rz) * 0.5;
  const w0 = R * cardScale;
  // Cards needed follow from the crown's own surface: hand-picked counts leave
  // a big tree bald and a small shrub over-planted. `cover` is how many times
  // over the skin is clothed — a clump is not opaque, so it takes several.
  const count = Math.min(460, Math.max(18,
    Math.round(cover * 4 * Math.PI * R * R / (w0 * w0))));
  for (let i = 0; i < count; i++) {
    const up = 1 - 2 * (i + 0.5) / count;
    const angle = i * 2.399963 + seed * 1.7;      // golden angle: no seams, no clumps
    const ring = Math.sqrt(Math.max(0, 1 - up * up));
    _fN.set(Math.cos(angle) * ring, up, Math.sin(angle) * ring);
    const h = hash1(i * 5.3 + seed);
    // Three shells. Depth across the skin is the difference between a canopy
    // and a decal wrapped round a ball: the outer one carries the silhouette,
    // the inner ones show through the gaps as leaves rather than as green paint.
    const depth = [0.62, 0.82, 1.0][i % 3] + (h - 0.5) * 0.1;
    const ax = x + _fN.x * rx * depth;
    const ay = y + _fN.y * ry * depth;
    const az = z + _fN.z * rz * depth;
    _fT1.set(-Math.sin(angle), 0, Math.cos(angle));
    _fT2.crossVectors(_fN, _fT1).normalize();
    const th = hash1(i * 2.9 + seed) * 6.283185;
    _fDir.copy(_fN).multiplyScalar(0.5)
      .addScaledVector(_fT1, Math.cos(th) * 0.9)
      .addScaledVector(_fT2, Math.sin(th) * 0.9);
    _fDir.y -= 0.2;
    _fDir.normalize();
    // The face follows the crown normal only loosely. Following it exactly
    // paves the top of the crown with horizontal cards, invisible edge-on from
    // the ground, and the cap goes back to being a bare dome.
    const pole = Math.abs(up);
    const jit = 0.55 + 0.85 * pole;
    _fFace.copy(_fN).multiplyScalar(1 - 0.6 * pole)
      .addScaledVector(_fT1, (h - 0.5) * 2 * jit)
      .addScaledVector(_fT2, (hash1(i * 7.7 + seed) - 0.5) * 2 * jit).normalize();
    const w = w0 * (0.82 + 0.36 * h);
    // Shade at the bottom of the crown, sun on top, with enough overlap that
    // the bands do not show as three stripes.
    const lit = 0.5 + 0.5 * up + 0.5 * (h - 0.5);
    const mat = tints[Math.max(0, Math.min(tints.length - 1,
      Math.round(lit * (tints.length - 1))))];
    leafCard(mat, ax, ay, az, w, w, cardQuat(_fDir, _fFace));
  }
}
// Same, on a cone: the pine's sprays sit on the slanted flank and hang off the
// tiers, so the profile breaks into needles rather than ending on a lathe edge.
// A conifer is not a cone with needles glued on. It is a stack of WHORLS —
// rings of branches, each a flat spray that droops at its tip, with a gap of
// sky between one tier and the next. That gap is the whole silhouette: a solid
// cone has a straight edge, and no fringe of needles round the outside of one
// stops it reading as an ice-cream cone.
function pineWhorls(x, yBase, z, rBase, height, seed, tints) {
  const TIERS = 13;
  for (let t = 0; t < TIERS; t++) {
    // Never quite 1: a tier of zero radius is a bald leader poking out the top.
    const u = t / TIERS;                            // 0 at the skirt, ~0.92 at the spire
    const hz = hash1(t * 3.37 + seed);
    const ty = yBase + height * (0.02 + 0.95 * Math.pow(u, 1.04));
    // Tier radius, jittered: whorls of identical reach stack into a cone again.
    const rad = rBase * Math.pow(1 - u, 0.62) * (0.82 + 0.34 * hz);
    if (rad < 0.12) continue;
    const branches = Math.max(7, Math.round(rad * 7.5));
    const w0 = Math.max(0.26, rad * 0.44);
    for (let b = 0; b < branches; b++) {
      const hb = hash1(t * 17.1 + b * 5.9 + seed);
      const a = (b / branches) * 6.283185 + t * 1.71 + seed + (hb - 0.5) * 0.5;
      const reach = rad * (0.78 + 0.4 * hb);
      const per = Math.max(2, Math.round(reach / (w0 * 0.5)));
      for (let k = 0; k < per; k++) {
        const f = (k + 0.5) / per;                  // along the branch, 0 → tip
        const rr = reach * (0.16 + 0.84 * f);
        // Branches lift off the trunk and hang at the tip: that droop is what
        // turns a flat disc of foliage into a spruce skirt. Any deeper and the
        // outboard cards of every tier fall three tiers' worth, piling the whole
        // crown into a skirt round the ankles with a bare spike above it.
        const droop = rad * (0.12 - 0.3 * f * f);
        const ax = x + Math.cos(a) * rr;
        const az = z + Math.sin(a) * rr;
        const ay = ty + droop;
        _fN.set(Math.cos(a), 0, Math.sin(a));
        _fT1.set(-Math.sin(a), 0, Math.cos(a));
        _fDir.copy(_fN).addScaledVector(_fT1, (hb - 0.5) * 0.4);
        _fDir.y -= 0.28 + 0.9 * f;                  // the spray hangs harder outboard
        _fDir.normalize();
        // `face` is the card's NORMAL, not the side it leans towards. Aim it up,
        // as a conifer spray lying flat would suggest, and every card in the
        // whorl is edge-on from the ground: the tiers vanish and all that is
        // left is the solid cone. It leans out, with a little lift and enough
        // jitter that a tier is never a ring of coplanar plates.
        _fFace.copy(_fN).addScaledVector(_yAxis, 0.4)
          .addScaledVector(_fT1, (hash1(t * 7.3 + b * 2.1 + k + seed) - 0.5) * 1.15).normalize();
        const w = w0 * (0.8 + 0.36 * hash1(t * 4.1 + b * 9.7 + k * 3.3 + seed))
          * (1 - 0.28 * f);
        const mat = tints[(k + b) % 2 === 0 && f < 0.6 ? 0 : tints.length - 1];
        leafCard(mat, ax, ay, az, w, w, cardQuat(_fDir, _fFace));
      }
    }
  }
}
function flushLeafCards() {
  const m = new THREE.Matrix4(), q = new THREE.Quaternion();
  const sc = new THREE.Vector3(), p = new THREE.Vector3();
  for (const [mat, items] of leafKits) {
    if (!items.length) continue;
    const im = new THREE.InstancedMesh(G.card, mat, items.length);
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      p.set(it.x, it.y, it.z);
      q.fromArray(it.q);
      sc.set(it.w, it.h, 1);
      m.compose(p, q, sc);
      im.setMatrixAt(i, m);
    }
    im.instanceMatrix.needsUpdate = true;
    // Not a shadow caster: the solid crown underneath already casts the tree's
    // shadow, and alpha-testing ten thousand quads into the shadow map buys a
    // fringe nobody sees at the cost of a second full foliage pass.
    im.castShadow = false;
    im.receiveShadow = true;
    foliageFX.add(im);
  }
  leafKits.clear();
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
// A chalet stands on a plinth, so its floorboards are half a metre up — anyone
// placed INSIDE one stands on this, not on the paving outside. Written once and
// used both to lay the boards and to stand the staff on them, because the two
// were separately authored and disagreed: the ticket clerks were put at plaza
// height and stood buried to the knee in their own floor.
const CHALET_FLOOR_Y = 0.5;
const CHAIR_SEAT = 0.47;      // top of a chair's seat above whatever it stands on
const PARK_HALF = 122;        // flat inside this half-extent about PARK_MID
const PARK_MID = -46;
const GATE_Z = -3;            // the turnstile line
const KIOSK_Z = 9;            // ticket pavilion centre
// The guichet each pavilion actually staffs: the one nearer the car park, so
// you meet a clerk on the way in rather than after walking past the building.
const TICKET_DESK_Z = KIOSK_Z + 4.2;

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
  for (const x of [-19, 19]) for (const z of [1, 8, 15]) planter(x, z, 1.5);
  for (const x of [-23, 23]) { lampPost(x, 2, 5.2); lampPost(x, 13, 5.2); }
}

// ---------------------------------------------------------------------------
// Planting and street furniture
// ---------------------------------------------------------------------------
// Trees are a trunk, branches that grow out of that trunk, and ONE lumpy
// crown the branches disappear into. Separate spheres read as balls; a
// branch whose base is not on the trunk reads as floating wood.
// Everything planted has to START at the ground under it. These were all
// authored at y = 0, which is right inside the park because the park is flat —
// and wrong everywhere else, so on the rising ground outside the fence the
// trunks were buried and only the crowns cleared the hill: cones floating in
// the sky with nothing holding them up.
const groundAt = (x, z) => terrainHeight(x, z);

function pickCanopy(x, z) {
  const k = Math.abs(Math.sin(x * 12.9898 + z * 78.233));
  return k < 0.33 ? G.canopyA : k < 0.66 ? G.canopyB : G.canopyC;
}
// Cylinder is base-at-origin. Yaw then Z-lean grows the limb along +X, so the
// attach point is offset on the trunk in that same direction — the join is solid.
function limb(mat, tx, ty, tz, trunkR, az, lean, len, rad) {
  shape(G.branch, mat,
    tx + Math.cos(az) * trunkR, ty, tz - Math.sin(az) * trunkR,
    rad, len, rad, { ry: az, rz: lean });
}

function shadeTree(x, z, s = 1, mat = M.foliage) {
  prop(() => {
    const g = groundAt(x, z) - 0.15;
    const h = 7.6 * s;
    const j = Math.sin(x * 12.9898 + z * 78.233) * 0.5;
    const lean = j * 0.04;
    const trunkH = h * 0.76;
    const trunkW = 0.82 * s;
    shape(G.cylBase, M.bark, x, g, z, 1.1 * s, 0.36 * s, 1.1 * s);
    // Trunk runs into the heart of the crown — the canopy sits on the bole,
    // not on a pair of twigs spanning a gap.
    shape(G.trunk, M.bark, x, g, z, trunkW, trunkH, trunkW, { rz: lean });
    const az0 = j * 6.1;
    const tR = 0.28 * s;
    limb(M.bark, x, g + h * 0.58, z, tR, az0, 0.85, 1.55 * s, 0.46 * s);
    limb(M.bark, x, g + h * 0.63, z, tR * 0.9, az0 + 2.2, 0.92, 1.35 * s, 0.38 * s);
    limb(M.bark, x, g + h * 0.55, z, tR, az0 + 4.1, 0.78, 1.45 * s, 0.40 * s);
    const cw = 4.6 * s, ch = 3.8 * s, cd = 4.4 * s;
    const cy = g + h * 0.72;
    // The solid never reaches the silhouette any more. At full size it IS the
    // silhouette, and no amount of foliage stuck to a sphere stops a sphere
    // reading as a sphere — it just reads as a green ball with leaves on it.
    // Buried at two thirds, it is the shade inside the canopy and nothing else.
    shape(pickCanopy(x, z), mat === M.foliageDark ? M.crownDark : M.crownMid,
      x, cy, z, cw * 0.66, ch * 0.66, cd * 0.66, { ry: j * 3, rz: lean * 0.25 });
    const tints = mat === M.foliageDark
      ? [M.sprigShade, M.sprigShade, M.sprigMid]
      : [M.sprigShade, M.sprigMid, M.sprigSun];
    cloakCrown(x, cy, z, cw, ch, cd, x * 0.37 + z * 0.61, tints);
  });
}
function pine(x, z, s = 1) {
  prop(() => {
    const g = groundAt(x, z) - 0.15;
    const j = Math.sin(x * 45.164 + z * 21.9) * 0.5;
    const rB = 2.35 * s;                  // crown radius at the skirt
    const cH = 5.9 * s;                   // skirt to spire
    const cy = g + 1.1 * s;
    // The bole stops inside the lower whorls. Run it to the top and it is a bare
    // dark spike above the foliage, which is what a leader with no needles is.
    shape(G.trunk, M.barkDark, x, g, z, 0.34 * s, cy - g + cH * 0.42, 0.34 * s,
      { rz: j * 0.03 });
    // Inner cone: the dark between the tiers, and the shadow caster, at barely
    // a fifth of the crown's reach and near-black, so that where it does show
    // through it reads as the depth of the canopy and not as smooth green skin.
    shape(G.pineCrown, M.conifer, x, cy, z, rB * 0.3, cH * 0.7, rB * 0.3, { ry: j * 4 });
    pineWhorls(x, cy, z, rB, cH, x * 0.53 + z * 0.29, [M.needleShade, M.needleSun]);
  });
}
function birch(x, z, s = 1) {
  prop(() => {
    const g = groundAt(x, z) - 0.12;
    const j = Math.sin(x * 33.7 + z * 61.1) * 0.5;
    const h = (8.4 + j * 2.0) * s;
    const trunkH = h * 0.78;
    shape(G.trunk, M.birch, x, g, z, 0.40 * s, trunkH, 0.40 * s, { rz: j * 0.04 });
    const tR = 0.14 * s;
    const az = j * 2.4;
    limb(M.birch, x, g + h * 0.58, z, tR, az, 0.72, 1.25 * s, 0.22 * s);
    limb(M.birch, x, g + h * 0.62, z, tR, az + Math.PI * 0.82, 0.68, 1.15 * s, 0.20 * s);
    const cw = 3.6 * s, ch = 4.2 * s, cd = 3.4 * s;
    const cy = g + h * 0.74;
    shape(pickCanopy(x, z), M.crownLight,
      x, cy, z, cw * 0.62, ch * 0.62, cd * 0.62, { ry: j * 3, rz: j * 0.02 });
    cloakCrown(x, cy, z, cw, ch, cd, x * 0.71 + z * 0.19,
      [M.sprigMid, M.sprigSun, M.sprigSun], 0.54);
  });
}
function hayHeap(x, y, z, sx, sy, sz, seed) {
  shape(seed < 2 ? G.hayHeapA : G.hayHeapB, M.hay, x, y, z, sx, sy, sz, { ry: seed * 0.7 });
  const was = PROP;
  PROP = false;
  const n = 12;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + seed;
    const r = 0.26 + (i % 3) * 0.09;
    const tx = x + Math.cos(a) * sx * r;
    const tz = z + Math.sin(a) * sz * r;
    const ty = y + sy * (0.18 + (i % 4) * 0.14);
    const hs = 0.36 + (i % 3) * 0.12;
    const ws = 0.30 + (i % 2) * 0.1;
    shape(G.card, M.hayTuft, tx, ty, tz, ws, hs, 1, { ry: a });
    shape(G.card, M.hayTuft, tx, ty, tz, ws * 0.9, hs * 0.95, 1, { ry: a + Math.PI / 2 });
  }
  for (let i = 0; i < 7; i++) {
    const a = seed * 3.1 + i * 0.93;
    shape(G.box, M.hay,
      x + Math.cos(a) * sx * 0.16,
      y + sy * (0.52 + (i % 3) * 0.1),
      z + Math.sin(a) * sz * 0.16,
      0.016, 0.38 + (i % 3) * 0.1, 0.016,
      { ry: a, rx: 0.55 + (i % 4) * 0.28, rz: (i % 2) * 0.35 - 0.18 });
  }
  PROP = was;
}
function shrub(x, z, s = 1, mat = M.hedge) {
  prop(() => {
    const g = groundAt(x, z);
    const j = Math.sin(x * 91.3 + z * 17.7) * 0.5;
    const bw = (2.5 + j * 0.35) * s, bh = (1.7 + j * 0.2) * s, bd = (2.3 + j * 0.35) * s;
    shape(G.bush, mat === M.foliageDark ? M.crownDark : M.crownMid,
      x, g + 0.04, z, bw * 0.78, bh * 0.8, bd * 0.78, { ry: j * 6 });
    cloakCrown(x, g + 0.04 + bh * 0.10, z, bw, bh * 1.15, bd, x * 0.23 + z * 0.83,
      mat === M.foliageDark ? [M.sprigShade, M.sprigMid] : [M.sprigMid, M.sprigSun], 0.62);
  });
}
function hedgeRun(x0, x1, z0, z1, h = 1.2, skip = null) {
  prop(() => {
    runBoxes(M.collider, x0, z0, x1, z1, 0.7, 0, h * 0.85, 2.0, skip);
    const dx = x1 - x0, dz = z1 - z0;
    const len = Math.hypot(dx, dz);
    if (len < 0.2) return;
    const n = Math.max(1, Math.round(len / 0.85));
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      const cx = x0 + dx * t, cz = z0 + dz * t;
      if (skip?.(cx, cz)) continue;
      const j = Math.sin(cx * 8.1 + cz * 3.7) * 0.5;
      const hh = h * (0.92 + j * 0.12);
      shape(G.bush, M.hedge, cx, 0, cz, 1.35 + j * 0.18, hh, 1.25 + j * 0.12, { ry: j * 5 });
    }
  });
}
function planter(x, z, r = 1.4) {
  prop(() => {
    shape(G.cylBase, M.stone, x, 0, z, r * 2, 0.55, r * 2);
    shape(G.bush, M.crownLight, x, 0.62, z, r * 1.4, 0.85, r * 1.4);
    // Planters stand at eye level on the plaza, so a bare mound reads as
    // plastic next to the trees behind it.
    cloakCrown(x, 0.68, z, r * 1.8, 1.25, r * 1.8, x * 0.41 + z * 0.67,
      [M.sprigMid, M.sprigSun], 0.6);
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

// Close-boarded timber palisade: the park boundary. Post-and-rail is a
// stand-off, not a perimeter — it is what you lean on, and you can walk
// through it. This is the line you cannot. Only the turnstile gap is open.
function perimeterFence(x0, z0, x1, z1, { h = 2.55, step = 2.4 } = {}) {
  const dx = x1 - x0, dz = z1 - z0;
  const len = Math.hypot(dx, dz);
  if (len < 0.3) return;
  const ry = Math.atan2(dx, dz);
  runBoxes(M.collider, x0, z0, x1, z1, 0.32, 0, h, 2.0);
  prop(() => {
    const nPost = Math.max(2, Math.round(len / step));
    for (let i = 0; i <= nPost; i++) {
      const t = i / nPost;
      const x = x0 + dx * t, z = z0 + dz * t;
      const g = groundAt(x, z);
      shape(G.post, M.timberDark, x, g, z, 0.24, h + 0.22, 0.24);
    }
    const nPale = Math.max(1, Math.round(len / 0.15));
    const paleZ = (len / nPale) * 0.9;
    for (let i = 0; i < nPale; i++) {
      const t = (i + 0.5) / nPale;
      const x = x0 + dx * t, z = z0 + dz * t;
      const g = groundAt(x, z);
      box(i % 4 === 1 ? M.timberDark : M.timber,
        x, g + 0.1 + (h - 0.22) / 2, z, 0.05, h - 0.22, paleZ, ry);
    }
    runBoxes(M.timberDark, x0, z0, x1, z1, 0.14, h - 0.1, h + 0.05, 2.6);
    runBoxes(M.timberDark, x0, z0, x1, z1, 0.16, 0.0, 0.16, 2.6);
  });
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
  interior = null, openings = [], doorOpen = true } = {}) {
  const hw = w / 2, hd = d / 2;
  const DOOR_H = 2.4;
  const jamb = doorW / 2;
  box(M.stone, 0, 0.22, 0, w + 0.9, 0.44, d + 0.9);            // plinth
  // Log walls: courses rather than a slab, which is the whole look of a chalet.
  //
  // The front wall is CUT rather than drawn whole: the doorway, plus any
  // `openings` the caller asks for as [centreX, halfWidth, y0, y1]. Each course
  // is emitted as whatever spans survive subtracting the openings it runs
  // through, so an opening is a hole you can see through. The ticket windows
  // were glass hung on an unbroken wall before this, which is a painted-on
  // window: lighting the room behind them changed nothing, because there was
  // no room behind them.
  const courses = Math.round(h / 0.34);
  for (let i = 0; i < courses; i++) {
    const y = 0.44 + i * 0.34 + 0.17;
    const inset = (i % 2) * 0.04;
    let spans = [[-hw, hw]];
    const cut = (a, b) => {
      const kept = [];
      for (const [s, e] of spans) {
        if (a > s) kept.push([s, Math.min(a, e)]);
        if (b < e) kept.push([Math.max(b, s), e]);
      }
      spans = kept.filter(([s, e]) => e - s > 0.02);
    };
    if (y - 0.17 < 0.44 + DOOR_H) cut(-jamb, jamb);
    for (const [cx, chw, y0, y1] of openings) {
      if (y + 0.17 > y0 && y - 0.17 < y1) cut(cx - chw, cx + chw);
    }
    for (const [s, e] of spans) {
      box(M.timberWall, (s + e) / 2, y, -hd + inset, e - s, 0.33, 0.3);
    }
    box(M.timberWall, 0, y, hd - inset, w, 0.33, 0.3);
    box(M.timberWallDark, -hw + inset, y, 0, 0.3, 0.33, d);
    box(M.timberWallDark, hw - inset, y, 0, 0.3, 0.33, d);
  }
  const top = 0.44 + h;
  // Ceiling: the roof is a closed prism and its inside faces are backfaces, so
  // without this you stand in the shop and look at the sky.
  box(M.ceilingIn, 0, top - 0.08, 0, w, 0.16, d);
  box(M.plank, 0, CHALET_FLOOR_Y - 0.03, 0, w - 0.6, 0.06, d - 0.6);   // floorboards
  // Doorway: jambs, lintel, a threshold and the leaf.
  for (const sx of [-1, 1]) {
    box(M.timberDark, sx * (jamb + 0.09), 0.44 + DOOR_H / 2, -hd - 0.02, 0.18, DOOR_H, 0.46);
  }
  box(M.timberDark, 0, 0.44 + DOOR_H + 0.11, -hd - 0.02, doorW + 0.4, 0.22, 0.46);
  box(M.stone, 0, 0.45, -hd - 0.26, doorW + 0.4, 0.1, 0.6);
  if (doorOpen) {
    // Standing open against its own jamb, which is what says "come in".
    box(M.timber, -(jamb - 0.05), 0.44 + DOOR_H / 2, -hd - 0.5, 0.1, DOOR_H - 0.1, doorW * 0.9);
    box(M.brass, -(jamb - 0.05), 0.44 + 1.05, -hd - 0.5 - doorW * 0.4, 0.1, 0.1, 0.1);
  } else {
    // Shut, filling the opening in the wall plane. The leaf is a solid box like
    // any other, so this closes the doorway to the player as well as to the eye
    // — which is the point for a staff-only booth.
    box(M.timber, 0, 0.44 + DOOR_H / 2, -hd - 0.05, doorW * 0.98, DOOR_H - 0.06, 0.1);
    box(M.brass, jamb - 0.16, 0.44 + 1.05, -hd - 0.13, 0.1, 0.1, 0.1);
  }
  if (interior) interior({ hw, hd, top });
  for (let i = 0; i < windows; i++) {
    const x = -w * 0.32 + (w * 0.64 * i) / Math.max(1, windows - 1);
    if (Math.abs(x) < doorW * 0.7) continue;
    box(M.timberPale, x, 0.44 + 1.75, -hd - 0.08, 1.35, 1.15, 0.1);
    box(M.vivGlass, x, 0.44 + 1.75, -hd - 0.13, 1.15, 0.95, 0.06);
    box(M.timberDark, x, 0.44 + 1.16, -hd - 0.2, 1.5, 0.1, 0.28);   // sill
    prop(() => shape(G.bush, M.foliageLight, x, 0.44 + 1.15, -hd - 0.26, 1.15, 0.7, 0.7));
  }
  // Gable roof with a real overhang and exposed purlin ends.
  gableRoof(w, d, top, Math.max(1.7, d * 0.3), roof, 1.2);
  box(M.timberDark, 0, top - 0.06, 0, w + 2.6, 0.16, d + 2.4);   // fascia
  for (let i = -2; i <= 2; i++) {                                 // purlin ends
    box(M.timberDark, 0, top + 0.06, i * (d / 4.2), w + 2.9, 0.13, 0.15);
  }
  return top;
}

// Small products are assembled from the same instanced geometry as the park.
// Their layered silhouettes (neck + cap + label, cup + handle, cone + scoops)
// read as real merchandise while keeping the shop to a handful of draw calls.
function drinkBottle(x, base, z, mat = M.bottleGreen, s = 1) {
  shape(G.cylBase, mat, x, base, z, 0.16 * s, 0.42 * s, 0.16 * s);
  shape(G.cylBase, mat, x, base + 0.4 * s, z, 0.09 * s, 0.16 * s, 0.09 * s);
  shape(G.cylBase, M.brass, x, base + 0.55 * s, z, 0.095 * s, 0.045 * s, 0.095 * s);
  shape(G.cyl, M.labelCream, x, base + 0.25 * s, z - 0.082 * s, 0.17 * s, 0.15 * s, 0.02 * s,
    { rx: Math.PI / 2 });
}

function ceramicCup(x, base, z, mat = M.ceramic, s = 1, ry = 0) {
  const c = Math.cos(FR), sn = Math.sin(FR);
  shopProducts.place('cup_small_01', FX + x * c + z * sn, base,
    FZ - x * sn + z * c, FR + ry, 0.23 * s);
}

function iceCreamCone(x, base, z, scoops = [M.iceVanilla], s = 1) {
  shape(G.cone, M.waffle, x, base + 0.48 * s, z, 0.25 * s, 0.48 * s, 0.25 * s, { rx: Math.PI });
  scoops.slice(0, 2).forEach((mat, i) => {
    shape(G.sphere, mat, x + (i ? 0.03 : 0), base + (0.5 + i * 0.2) * s, z,
      0.3 * s, 0.27 * s, 0.3 * s);
  });
}

function foldedShirt(x, base, z, mat, s = 1) {
  box(mat, x, base + 0.07 * s, z, 0.46 * s, 0.14 * s, 0.34 * s);
  box(M.labelCream, x, base + 0.145 * s, z - 0.06 * s, 0.16 * s, 0.012 * s, 0.11 * s);
}

function souvenirPlate(x, base, z, mat = M.ceramicBlue, s = 1) {
  const c = Math.cos(FR), sn = Math.sin(FR);
  shopProducts.place('plate_large_circular_03', FX + x * c + z * sn, base,
    FZ - x * sn + z * c, FR, 0.34 * s, true);
  box(M.brass, x, base + 0.03, z + 0.02, 0.14 * s, 0.06, 0.12);
}

// One cafe table with two chairs, drawn from the floor it stands on. The zoo's
// restaurant had a counter, a rug and nothing to sit at: an empty hall with a
// till in it. Same build as the terrace tables outside, one size down and with
// a cloth, because indoors you see the table from a metre away.
function cafeTable(x, z, y0, ry = 0) {
  prop(() => {
    frame(x, z, ry, () => {
      shape(G.post, M.steelDark, 0, y0, 0, 0.11, 0.71, 0.11);
      shape(G.cylBase, M.steelDark, 0, y0, 0, 0.5, 0.04, 0.5);        // foot
      shape(G.cylBase, M.timberPale, 0, y0 + 0.71, 0, 1.15, 0.07, 1.15);
      shape(G.cylBase, M.fabricCream, 0, y0 + 0.78, 0, 0.62, 0.015, 0.62);
      shape(G.cylBase, M.ceramicBlue, 0, y0 + 0.79, 0, 0.12, 0.18, 0.12);
      shape(G.blob, M.foliage, 0, y0 + 0.95, 0, 0.17, 0.15, 0.17);    // posy
      shape(G.blob, M.iceBerry, 0, y0 + 1.0, 0.03, 0.08, 0.07, 0.08);
      for (const [cx, cz, cr] of [[-0.86, 0, Math.PI / 2], [0.86, 0, -Math.PI / 2]]) {
        frame(cx, cz, cr, () => {
          furnitureInteraction('sit', 0.4, 0.4, 0, y0 + CHAIR_SEAT - 0.01, y0);
          chairBody(y0);
        });
      }
    });
  });
}

// What you see once you are inside. Kept to the back of the room so the doorway
// stays clear, and flagged as prop so none of it is mistaken for floor.
//
// The room is built as four things, in the order you meet them: the floor you
// stand on, the back-bar you walk up to, the counter you are served at, and the
// walls and ceiling that close the other three in. Everything below is written
// off `hw`/`hd`/`top` so the same code fits the 17 m restaurant and the 6.4 m
// kiosk — the kiosk has 2.4 m of headroom, which is why the shelf count, the
// cornice and the interior sign are all clamped rather than fixed.
function shopInterior({ hw, hd, top }, kind) {
  const F = 0.5;                    // floorboard top
  const back = hd - 0.35;           // the shelving wall
  const T = i => F + 0.635 + i * 0.62;             // top of shelf i
  const ceiling = (top ?? F + 3.0) - 0.16;
  const HEAD = ceiling - F;                        // clear height of the room
  const shelves = HEAD > 2.6 ? 3 : 2;              // two of them in the kiosk
  const wide = hw > 5.0;                           // restaurant and gift shop
  const barW = hw * 1.72;                          // width of the back-bar
  const bays = wide ? 5 : 3;                       // uprights, ends included
  const bayW = barW / (bays - 1);
  const capY = Math.min(T(shelves - 1) + 0.72, ceiling - 0.14);   // cornice top
  const linY0 = F + 0.2, linY1 = capY - 0.07;      // the boarded lining
  // The counter runs along ONE side rather than across the whole room. A 9 m
  // slab a metre in front of the shelves is a barricade: it hides the bottom
  // shelf, it stops you reaching anything, and it is why the shop read as a
  // stockroom seen over a bar.
  const CW = hw * 0.92, CX = -hw * 0.46, CZ = hd - 1.55;
  const CTOP = F + 0.97;            // counter top surface

  // The rug is FLOOR, and it is emitted out here on purpose, where the
  // floorboards are: a prop AABB is solid at whatever height it sits at,
  // because the step-up shortcut that lets you walk onto a low box is skipped
  // for props. Flagged as one, four centimetres of rug is a wall across the
  // room — which is what shut all three shops.
  box(M.rug, 0, F + 0.02, -hd * 0.28, hw * 1.15, 0.04, hd * 0.9);
  prop(() => {
    // ---- ceiling ------------------------------------------------------
    // Beams across the span. A boarded lid with nothing crossing it takes the
    // lamp's spill as one flat wash, which is what blew the ceiling out.
    const beams = Math.max(2, Math.round(hw * 1.1));
    for (let i = 0; i < beams; i++) {
      box(M.timberDark, -hw + (i + 0.5) * (hw * 2 / beams), ceiling - 0.07, 0,
        0.15, 0.14, hd * 2 - 0.3);
    }

    // ---- back-bar -----------------------------------------------------
    box(M.timberDark, 0, F + 0.1, back - 0.02, barW, 0.2, 0.6);       // plinth
    box(shopLining, 0, (linY0 + linY1) / 2, back + 0.16, barW, linY1 - linY0, 0.05);
    for (let i = 0; i < bays; i++) {                                  // bay ends
      box(shopShelf, -barW / 2 + i * bayW, (linY0 + linY1) / 2, back - 0.05,
        0.07, linY1 - linY0, 0.62);
    }
    for (let i = 0; i < shelves; i++) {
      box(shopShelf, 0, T(i) - 0.035, back - 0.05, barW - 0.06, 0.07, 0.62);
      box(M.timberPale, 0, T(i) - 0.045, back - 0.345, barW - 0.06, 0.05, 0.03);
      // Strip light under each board. Not a light — an emissive sliver, which
      // is how a display case reads lit from the aisle without one point light
      // per shelf. It is also what puts a highlight on the merchandise.
      box(M.shelfGlow, 0, T(i) - 0.105, back - 0.30, barW - 0.55, 0.035, 0.05);
    }
    box(M.timberDark, 0, capY - 0.07, back - 0.02, barW + 0.14, 0.14, 0.74);  // cornice
    // The sign hangs on the cornice, not in mid-air over it. In the kiosk there
    // is no wall left above the shelving, and it used to be drawn straight
    // through the ice creams on the top shelf.
    const signY = Math.min(ceiling - 0.30, capY + 0.40);
    if (signY - 0.23 > capY + 0.02) {
      shape(G.card, kind === 'shop' ? souvenirSign : cafeSign, 0, signY,
        back - 0.12, Math.min(4.6, hw * 1.25), 0.46, 1, { ry: Math.PI });
    }

    // ---- counter ------------------------------------------------------
    box(M.timber, CX, F + 0.47, CZ, CW, 0.86, 0.72);                  // carcass
    box(kind === 'shop' ? M.paintSage : M.paintCream,
      CX, F + 0.52, CZ - 0.375, CW, 0.78, 0.04);                      // painted front
    for (let i = 0; i <= 3; i++) {                                    // stiles
      box(M.timberDark, CX - CW / 2 + i * (CW / 3), F + 0.52, CZ - 0.39,
        0.08, 0.78, 0.05);
    }
    box(M.timberDark, CX, F + 0.52, CZ - 0.40, CW, 0.07, 0.05);       // mid-rail
    box(M.timberDark, CX, F + 0.14, CZ - 0.36, CW, 0.16, 0.06);       // kick rail
    box(M.timberPale, CX, CTOP - 0.04, CZ - 0.03, CW + 0.18, 0.08, 0.86);  // top
    box(M.shelfGlow, CX, F + 0.90, CZ - 0.43, CW - 0.4, 0.03, 0.04);  // under-lip
    // A counter end you can walk round, rather than a wall meeting a wall.
    box(M.timber, CX + CW / 2 + 0.09, F + 0.47, CZ - 0.15, 0.18, 0.86, 0.42);

    // ---- lighting -----------------------------------------------------
    // Two point lights, as before — a third per shop is three more in every
    // fragment shader in the park. What changed is where they sit: the back one
    // was 28 units a metre off the lining and washed it to white paper, and the
    // room one sat ABOVE the lamp shade, which is what put the burnt patch on
    // the ceiling in every shop.
    roomLight(0, Math.min(capY - 0.3, ceiling - 0.45), back - 0.9, 9, hw * 2.2);
    // Clamped to the room: the kiosk's walls are 2.6 m and a pendant hung at
    // the chalets' height puts its cord through its own ceiling. The rim also
    // has to stay over head height (floor + 1.7), or the lamp is a prop you
    // walk into in the middle of your own shop.
    const shadeY = Math.min(F + 2.1, ceiling - 0.4);
    const cord = ceiling - shadeY - 0.34;
    const lamps = hw > 4.5 ? 3 : 1;
    for (let i = 0; i < lamps; i++) {
      const lx = lamps === 1 ? 0 : (i - 1) * hw * 0.6;
      if (cord > 0.05) {
        box(M.steelDark, lx, ceiling - cord / 2, -hd * 0.15, 0.045, cord, 0.045);
        box(M.brass, lx, ceiling - 0.16, -hd * 0.15, 0.12, 0.06, 0.12);  // rose
      }
      shape(G.cone, M.lampShade, lx, shadeY, -hd * 0.15, 0.62, 0.34, 0.62);
      shape(G.torus, M.brass, lx, shadeY + 0.03, -hd * 0.15, 0.66, 0.66, 0.05,
        { rx: Math.PI / 2 });                                          // rim
      shape(G.sphere, M.lampGlow, lx, shadeY + 0.1, -hd * 0.15, 0.15, 0.15, 0.15);
    }
    // A single lamp at the centre leaves both ends of the restaurant in the
    // dark — 17 m of room off one point light is a pool of light with furniture
    // around it. Wide rooms get one under each outer pendant instead.
    if (wide) {
      for (const sx of [-1, 1]) {
        roomLight(sx * hw * 0.55, shadeY - 0.12, -hd * 0.08, 6 + hw * 0.55, hw * 2.8);
      }
    } else {
      roomLight(0, shadeY - 0.12, -hd * 0.06, 8 + hw * 0.9, hw * 3.6);
    }

    // ---- walls --------------------------------------------------------
    // Greenery in the two corners the counter leaves empty — that, and the rug,
    // are what stop a room reading as unfinished. Potted properly now: a rim,
    // and soil you can see under the leaves.
    for (const sx of [-1, 1]) {
      const px = sx * (hw - 0.75);
      shape(G.cylBase, M.rockWarm, px, F, -hd + 1.0, 0.56, 0.5, 0.56);
      shape(G.cylBase, M.timberDark, px, F + 0.46, -hd + 1.0, 0.62, 0.07, 0.62);
      shape(G.cylBase, M.plushDark, px, F + 0.47, -hd + 1.0, 0.5, 0.04, 0.5);
      shape(G.bush, M.foliage, px, F + 0.5, -hd + 1.0, 1.05, 1.35, 1.05);
      shape(G.bush, M.foliageLight, px + sx * 0.12, F + 0.62, -hd + 0.85,
        0.66, 0.8, 0.66);
    }
    // Framed prints on the side walls, at the height a picture is actually
    // hung. The log courses stop 15 cm inside the half-width. The frames held a
    // blank card and a green smudge before this, which at eye level is the one
    // thing in the room you are guaranteed to look at.
    const pics = wide ? 2 : 1;
    for (const sx of [-1, 1]) {
      for (let i = 0; i < pics; i++) {
        const pz = pics === 1 ? -hd * 0.25 : -hd * 0.5 + i * hd * 0.72;
        box(M.timberDark, sx * (hw - 0.17), F + 1.62, pz, 0.06, 1.06, 0.86);
        box(M.paintCream, sx * (hw - 0.21), F + 1.62, pz, 0.03, 0.94, 0.74);
        shape(G.card, shopPosters[(i + (sx > 0 ? 1 : 0)) % shopPosters.length],
          sx * (hw - 0.23), F + 1.62, pz, 0.58, 0.8, 1, { ry: -sx * Math.PI / 2 });
      }
    }

    // ---- merchandise, bay by bay ---------------------------------------
    // A real shelf is grouped: a run of one thing, a gap, then a run of the
    // next. Twenty-two identical cups spread evenly across nine metres is a
    // wallpaper pattern, which is what all three shops had.
    const bayRun = (b, step, fn) => {
      const x0 = -barW / 2 + b * bayW + 0.26, x1 = x0 + bayW - 0.52;
      const n = Math.max(1, Math.round((x1 - x0) / step));
      const gap = (x1 - x0) / n;
      for (let i = 0; i < n; i++) fn(x0 + gap * (i + 0.5), i);
    };
    for (let b = 0; b < bays - 1; b++) {
      if (kind === 'shop') {
        // Plush low enough for children, textiles in the middle, ceramics and
        // small keepsakes at eye level — the order a gift shop actually racks.
        if (b % 3 === 1) {
          bayRun(b, 0.56, (x, i) => {                    // a crate of them
            plushBear(x, back - 0.07, T(0) + 0.16, 0.38, BEAR_FURS[(b + i) % 4],
              ((i % 3) - 1) * 0.3);
          });
          box(M.timber, -barW / 2 + b * bayW + bayW / 2, T(0) + 0.08, back - 0.08,
            bayW - 0.5, 0.16, 0.5);
          box(M.timberDark, -barW / 2 + b * bayW + bayW / 2, T(0) + 0.09,
            back - 0.33, bayW - 0.5, 0.14, 0.04);
        } else {
          bayRun(b, 0.62, (x, i) => {
            plushBear(x, back - 0.08, T(0), 0.44, BEAR_FURS[(b + i) % 4],
              ((i % 3) - 1) * 0.22);
          });
        }
        if (b % 2 === 0) {
          bayRun(b, 0.66, (x, i) => {                    // folded tees, stacked
            const tint = [M.paperBlue, M.paperOchre, M.paperGreen, M.fabricRed];
            for (let k = 0; k < 3; k++) {
              foldedShirt(x, T(1) + k * 0.145, back - 0.1, tint[(b + i + k) % 4], 1);
            }
          });
        } else {
          bayRun(b, 0.44, (x, i) => {
            if (i % 3 === 2) souvenirPlate(x, T(1), back - 0.1, M.ceramicBlue, 0.8);
            else ceramicCup(x, T(1), back - 0.12, i % 3 ? M.ceramicRed : M.ceramic, 0.95);
          });
        }
        if (shelves > 2) {
          bayRun(b, 0.46, (x, i) => {
            if ((b + i) % 3 === 0) {
              souvenirPlate(x, T(2), back - 0.08, i % 2 ? M.ceramicBlue : M.ceramicRed, 0.85);
            } else {
              ceramicCup(x, T(2), back - 0.08,
                (b + i) % 3 === 1 ? M.ceramic : M.ceramicBlue, 0.78);
            }
          });
        }
      } else {
        // Bottles low, cups and jars in the middle, the gelato range at eye
        // level — a cafe is legible from the door or it is a shed with a till.
        bayRun(b, 0.34, (x, i) => {
          drinkBottle(x, T(0), back - 0.06,
            (b + i) % 3 === 0 ? M.glassClear : M.bottleGreen, 0.82);
        });
        if (b % 2 === 0) {
          bayRun(b, 0.52, (x, i) => {                    // stacked cups
            const n = 2 + ((b + i) % 2);
            for (let k = 0; k < n; k++) {
              ceramicCup(x, T(1) + k * 0.1, back - 0.08,
                (i + k) % 3 === 0 ? M.ceramicRed : (i % 2 ? M.ceramicBlue : M.ceramic),
                0.72);
            }
          });
        } else {
          bayRun(b, 0.42, (x, i) => {                    // jars of syrup
            shape(G.cylBase, M.glassClear, x, T(1), back - 0.08, 0.19, 0.26, 0.19);
            shape(G.cylBase, i % 2 ? M.iceBerry : M.waffle, x, T(1) + 0.02,
              back - 0.08, 0.165, 0.17, 0.165);
            shape(G.cylBase, M.brass, x, T(1) + 0.26, back - 0.08, 0.2, 0.035, 0.2);
          });
        }
        if (shelves > 2) {
          const flavours = [M.iceVanilla, M.iceBerry, M.iceMint];
          bayRun(b, 0.62, (x, i) => {
            iceCreamCone(x, T(2), back - 0.1,
              [flavours[(b + i) % 3], flavours[(b + i + 1) % 3]], 0.72);
          });
        }
      }
    }

    // ---- what stands in the room ---------------------------------------
    if (kind === 'shop') {
      // Accessible display tables bring fine objects into the foreground.
      if (wide) for (const side of [-1, 1]) {
        const px = side * hw * 0.53, pz = -hd * 0.28;
        box(shopShelf, px, F + 0.88, pz, 2.15, 0.10, 0.85);
        box(M.timberDark, px, F + 0.83, pz - 0.42, 2.15, 0.1, 0.05);
        for (const dx of [-0.93, 0.93]) box(M.steelDark, px + dx, F + 0.43, pz, 0.07, 0.86, 0.7);
        box(M.timber, px, F + 0.2, pz, 1.9, 0.06, 0.62);            // under-shelf
        for (let i = 0; i < 5; i++) {
          souvenirPlate(px - 0.85 + i * 0.42, F + 0.94, pz + 0.18, M.ceramic, 1);
          ceramicCup(px - 0.85 + i * 0.42, F + 0.94, pz - 0.2, M.ceramic, 1);
        }
        for (let i = 0; i < 3; i++) {                               // stock below
          foldedShirt(px - 0.62 + i * 0.62, F + 0.23, pz, M.paperBlue, 1.05);
          foldedShirt(px - 0.62 + i * 0.62, F + 0.38, pz, M.paperOchre, 1.05);
        }
      }
      // A rail of tee-shirts against the far side wall: the one thing in a gift
      // shop that hangs rather than sits, and the room needs the vertical.
      if (wide) frame(hw - 0.95, hd - 3.4, 0, () => {
        box(M.steelDark, 0, F + 1.62, 0, 0.05, 0.05, 2.2);
        for (const sz of [-1.05, 1.05]) {
          box(M.steelDark, 0, F + 0.83, sz, 0.06, 1.62, 0.06);
          box(M.steelDark, 0, F + 0.03, sz, 0.5, 0.06, 0.5);
        }
        const tint = [M.paperBlue, M.paperOchre, M.paperGreen, M.fabricRed, M.ceramicBlue];
        for (let i = 0; i < 8; i++) {
          const tz = -0.91 + i * 0.26, mat = tint[i % tint.length];
          // Facing the room, not edge-on to it: the rail runs along the wall,
          // so a shirt's front is its -X face and its width is in Z.
          box(M.timberPale, 0, F + 1.56, tz, 0.03, 0.03, 0.28);      // hanger
          box(mat, -0.02, F + 1.24, tz, 0.06, 0.58, 0.34);           // body
          box(mat, -0.02, F + 1.44, tz, 0.06, 0.16, 0.54);           // sleeves
        }
      });
      // Till, a basket of plush by the door and a spinner of postcards.
      box(M.steelDark, CX + CW * 0.34, CTOP + 0.09, CZ - 0.06, 0.42, 0.16, 0.34);
      box(M.ceramic, CX + CW * 0.34, CTOP + 0.22, CZ - 0.13, 0.36, 0.12, 0.2, 0.4);
      box(M.paperOchre, CX - CW * 0.3, CTOP + 0.13, CZ, 0.5, 0.24, 0.36);  // gift boxes
      box(M.fabricRed, CX - CW * 0.3, CTOP + 0.27, CZ, 0.38, 0.05, 0.28);
      // Clear of the door: a basket a metre off the centre line is the first
      // thing you walk into coming in.
      const bx = hw * 0.45;
      shape(G.cylBase, M.timberPale, bx, F, -hd + 1.5, 0.9, 0.42, 0.9);
      shape(G.cylBase, M.timberDark, bx, F + 0.38, -hd + 1.5, 0.96, 0.07, 0.96);
      for (let i = 0; i < 4; i++) {
        plushBear(bx + (i % 2 ? 0.2 : -0.2), -hd + 1.5 + (i < 2 ? -0.18 : 0.18),
          F + 0.34, 0.34, BEAR_FURS[i], i * 1.1);
      }
      shape(G.post, M.steelDark, -hw * 0.62, F, -hd * 0.5, 0.09, 1.5, 0.09);
      shape(G.cylBase, M.steelDark, -hw * 0.62, F, -hd * 0.5, 0.5, 0.05, 0.5);
      for (let i = 0; i < 3; i++) {
        box(M.poster, -hw * 0.62, F + 1.15, -hd * 0.5, 0.5, 0.62, 0.04, i * (Math.PI / 3));
      }
      // Bunting: a cord across the room with pennants hanging off it.
      const cordY = ceiling - 0.22;
      box(M.timberDark, 0, cordY, -hd * 0.55, hw * 1.9, 0.03, 0.03);
      for (let i = 0; i < 11; i++) {
        shape(G.cone, BEAR_FURS[i % BEAR_FURS.length],
          -hw * 0.85 + i * (hw * 0.17), cordY, -hd * 0.55, 0.26, 0.3, 0.04,
          { rx: Math.PI });
      }
    } else {
      // Coffee machine and grinder ON the counter, where a barista reaches
      // them, and the menu over the shelving rather than across it.
      // Sized off the room: the kiosk is 6.4 m end to end, and a full-size
      // machine in it is a wardrobe on the counter.
      const mw = Math.min(0.86, hw * 0.24), mh = Math.min(0.58, hw * 0.17);
      const mx = CX + CW * 0.3;
      box(M.applianceSteel, mx, CTOP + mh / 2 + 0.01, CZ + 0.06, mw, mh, 0.5);
      box(M.steelDark, mx, CTOP + mh + 0.06, CZ + 0.06, mw + 0.06, 0.1, 0.54);
      box(M.chalkboard, mx, CTOP + mh * 0.72, CZ - 0.19, mw * 0.72, mh * 0.3, 0.06);
      for (const sx of [-0.18, 0.18]) {
        shape(G.cylBase, M.brass, mx + sx, CTOP + 0.02, CZ - 0.22, 0.06, 0.22, 0.06);
      }
      shape(G.cylBase, M.applianceSteel, mx + mw * 0.78, CTOP, CZ + 0.04,
        0.2, 0.42, 0.2);                                    // grinder
      for (let i = 0; i < 6; i++) {                          // takeaway cup stack
        ceramicCup(CX - CW * 0.36, CTOP + 0.02 + i * 0.1, CZ + 0.04, M.ceramic, 0.7);
      }
      // Cake stand under a dome, on the customer's side of the counter.
      shape(G.cylBase, M.timberPale, CX - CW * 0.12, CTOP, CZ - 0.12, 0.56, 0.06, 0.56);
      shape(G.cylBase, M.waffle, CX - CW * 0.12, CTOP + 0.06, CZ - 0.12, 0.42, 0.14, 0.42);
      shape(G.sphere, M.vivGlass, CX - CW * 0.12, CTOP + 0.09, CZ - 0.12, 0.6, 0.62, 0.6);
      if (ceiling - capY > 0.5) {
        // Over the shelving, above the till end of the counter. Framed in pale
        // timber: an unframed dark rectangle on a dark wall is not a board, it
        // is a hole, and the chalk lines on it read as litter.
        const boardY = Math.min(ceiling - 0.36, capY + 0.42);
        const bw = Math.min(3.0, hw * 0.62), bh = Math.min(0.8, ceiling - capY - 0.16);
        box(M.timberPale, hw * 0.5, boardY, back + 0.08, bw + 0.14, bh + 0.14, 0.05);
        box(M.chalkboard, hw * 0.5, boardY, back + 0.04, bw, bh, 0.05);
        for (let i = 0; i < 4; i++) {
          box(M.signPale, hw * 0.5 - bw * 0.12, boardY + bh * 0.28 - i * (bh * 0.19),
            back + 0.01, bw * (0.62 - i * 0.09), 0.026, 0.02);
        }
      }
      const tubs = [M.iceVanilla, M.iceBerry, M.iceMint, M.waffle];
      if (wide) {
        // Refrigerated gelato case, beside the counter rather than in front of
        // the shelving: it is the thing a visitor walks to first.
        const gx = hw * 0.42, gw = Math.min(2.2, hw * 0.52);
        box(M.applianceSteel, gx, F + 0.46, CZ, gw, 0.84, 0.74);
        box(M.steelDark, gx, F + 0.06, CZ, gw, 0.12, 0.66);
        box(M.timberPale, gx, F + 0.93, CZ, gw + 0.1, 0.07, 0.8);
        box(M.glassClear, gx, F + 1.18, CZ - 0.24, gw, 0.44, 0.05);
        box(M.glassClear, gx, F + 1.36, CZ + 0.02, gw, 0.06, 0.5);
        box(M.shelfGlow, gx, F + 1.36, CZ + 0.26, gw - 0.14, 0.04, 0.05);
        for (let i = 0; i < 5; i++) {
          const tx = gx - gw * 0.4 + i * (gw * 0.2);
          box(M.steelDark, tx, F + 1.0, CZ, gw * 0.17, 0.1, 0.6);
          box(tubs[i % 4], tx, F + 1.06, CZ, gw * 0.155, 0.06, 0.56);
          shape(G.cylBase, M.steel, tx, F + 1.08, CZ - 0.2, 0.07, 0.16, 0.07);
        }
      } else {
        // The kiosk is 6.4 m end to end. A floor-standing case beside a 3 m
        // counter leaves a slot to sidle down, so its gelato goes ON the
        // counter, under a hood, where a hatch-served kiosk keeps it anyway.
        const gx = CX + CW * 0.06, gw = CW * 0.5;
        box(M.applianceSteel, gx, CTOP + 0.1, CZ - 0.02, gw, 0.2, 0.56);
        for (let i = 0; i < 4; i++) {
          const tx = gx - gw * 0.36 + i * (gw * 0.24);
          box(M.steelDark, tx, CTOP + 0.18, CZ - 0.02, gw * 0.2, 0.08, 0.46);
          box(tubs[i % 4], tx, CTOP + 0.23, CZ - 0.02, gw * 0.18, 0.05, 0.42);
        }
        box(M.glassClear, gx, CTOP + 0.34, CZ - 0.3, gw, 0.3, 0.04);
        box(M.glassClear, gx, CTOP + 0.48, CZ - 0.04, gw, 0.05, 0.56);
        box(M.shelfGlow, gx, CTOP + 0.46, CZ + 0.22, gw - 0.12, 0.035, 0.05);
      }
      // Tables. The restaurant is a 17 m hall and it had nowhere to sit.
      if (hw > 6.5) {
        for (const [tx, tz, tr] of [[-6.4, -2.5, 0], [-3.2, -2.5, Math.PI / 2],
          [3.2, -2.5, Math.PI / 2], [6.4, -2.5, 0], [-6.4, -4.2, 0], [6.4, -4.2, 0]]) {
          cafeTable(tx, tz, F, tr);
        }
      }
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
    // TWO guichets, one either side of the door — not three. The middle one was
    // drawn straight over the doorway, so the pavilion wore a window frame round
    // its own entrance and the clerk stood in the door rather than at a counter.
    // GY0/GY1 are picked to land on whole log courses, so the wall breaks
    // cleanly at the frame instead of leaving a course-height sliver.
    const GY0 = 1.465, GY1 = 2.475, GHW = 1.07, GMID = (GY0 + GY1) / 2;
    const guichets = [-4.2, 4.2];
    const top = chalet(14, 7, {
      h: 3.3, roof: M.shingleRed, windows: 0, doorW: 1.4,
      openings: guichets.map(x => [x, GHW, GY0 + 0.04, GY1 - 0.04]),
      // Staff door, kept shut: a visitor buys a ticket AT the guichet, and an
      // open leaf both invited them inside and swung across the queue's path.
      doorOpen: false,
    });
    for (const x of guichets) {
      // A cased opening: head, sill and jambs lapping the hole the courses left,
      // with the glass set into it. This used to be a solid pale-timber panel
      // behind the glass, which is what made every guichet read as shuttered.
      box(M.timberPale, x, GY1, -3.6, (GHW + 0.09) * 2, 0.18, 0.14);   // head
      box(M.timberPale, x, GY0, -3.6, (GHW + 0.09) * 2, 0.18, 0.14);   // sill
      box(M.timberPale, x - (GHW + 0.05), GMID, -3.6, 0.1, GY1 - GY0, 0.14);
      box(M.timberPale, x + (GHW + 0.05), GMID, -3.6, 0.1, GY1 - GY0, 0.14);
      box(M.vivGlass, x, GMID, -3.67, GHW * 2, GY1 - GY0 - 0.06, 0.06);
      box(M.stone, x, 1.05, -3.8, 2.6, 0.16, 0.5);              // counter shelf
      box(M.signBoard, x, 2.9, -3.67, 2.5, 0.4, 0.1);           // CAISSE plate
    }
    // Two lamps, and neither where the first pass put its single one: that sat
    // BEHIND the clerk's head, so the face was backlit, fell to ambient alone
    // and read as a dark silhouette through the glass — worst on the darker
    // skin tones the crowd picks from. The key hangs just inside the staffed
    // window, above and in front of the clerk; the fill keeps the back of the
    // room off black so the other guichet is not a hole.
    roomLight(-side * 4.2, 2.9, -3.2, 9, 14);   // key, over the staffed counter
    roomLight(0, 3.1, 0.4, 5, 18);              // fill, mid-room
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
        shape(G.bush, M.foliageDark, cx - 1.0, SILL + 0.42, F + 1.5, 1.0, 0.85, 0.75);
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
    at(M.fabricRed, -0.075, 0.57, -0.23, 0.14, 0.085, 0.055, { rz: -0.3 });
    at(M.fabricRed, 0.075, 0.57, -0.23, 0.14, 0.085, 0.055, { rz: 0.3 });
    at(M.fabricRed, 0, 0.57, -0.25, 0.055, 0.065, 0.045);
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
    frame(x, z, ry, () => {
      furnitureInteraction('sit', 0.4, 0.4, 0, PLAZA_Y + CHAIR_SEAT - 0.01, PLAZA_Y);
      chairBody(PLAZA_Y);
    });
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
  // Kept small and tight: the pride wanders the whole paddock, and boulders
  // this size kept swallowing a lion that walked behind them.
  prop(() => {
    for (const [rx, rz, rs] of [[-80, -74, 2.4], [-76, -77, 1.8], [-83, -78, 1.4], [-78, -71, 1.1]]) {
      shape(G.rock, M.rockWarm, rx, 0.1, rz, rs, rs * 0.62, rs * 0.9, { ry: rs, rz: 0.12 });
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
const FOX = { x0: 62, x1: 94, z0: -86, z1: -58 };
function foxEnclosure() {
  const { x0, x1, z0, z1 } = FOX;
  slab(M.lawn, x0, x1, z0, z1, 0, 0.04);
  slab(M.sandFloor, x0 + 1.2, x1 - 1.2, z0 + 1.2, z1 - 1.2, 0.04, 0.07);
  // A fox climbs and digs, so the volume stays closed — but at three and a half
  // metres, not the eight a primate needed. The landscape is what changes: fallen
  // trunks, pale sand so the orange coats read, and scrub to disappear into.
  const H = 3.4;
  meshWall(x0, z0, x0, z1, H, {});
  meshWall(x1, z0, x1, z1, H, {});
  meshWall(x0, z0, x1, z0, H, {});
  meshWall(x0, z1, x1, z1, H, {});
  meshRoof(x0, z0, x1, z1, H);
  // Scrub stays on the edges so the foxes stay visible in the open centre —
  // a bush in the middle of a 30 m paddock just hid one of them.
  prop(() => {
    for (const [lx, lz, la] of [[70, -76, 0.6], [82, -68, 2.1], [76, -82, 1.2]]) {
      shape(G.post, M.barkDark, lx, 0.35, lz, 0.42, 5.2, 0.42, { rz: 1.52, ry: la });
      shape(G.bush, M.foliageDark, lx + 2.4, 0.4, lz + 1.2, 1.8, 0.95, 1.7);
    }
    for (const [bx, bz] of [[88, -76], [67, -66], [80, -80]]) {
      shape(G.blob, M.sandFloor, bx, 0, bz, 3.4, 1.2, 3.0);
      shape(G.sphere, M.barkDark, bx + 1.2, 0.35, bz - 1.7, 0.9, 0.8, 0.7);
    }
    for (const [sx, sz] of [[72, -63], [86, -63], [70, -84], [90, -70]]) {
      shape(G.bush, M.hedge, sx, 0, sz, 2.0, 1.15, 1.9);
    }
  });
  for (const [tx, tz] of [[66, -62], [91, -62], [66, -83], [91, -83]]) shrub(tx, tz, 1.0);
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
// and climbs — holds the foxes. Peafowl have the pasture and the crows the
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
  ['fox', FOX, 5, 0.42, 1, 0.07],
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
// x, z, facing, seated, floorY. The facings are the shop fronts' own outward
// normals, so each keeper is looking out at the plaza rather than at their own
// wall. `floorY` is what they STAND on and defaults to the paving: only the two
// ticket clerks are indoors, and a chalet's floor is half a metre above it.
const STAFF = [
  [-12.5, -45.6, 0, false],          // restaurant, standing by the door
  [9.6, -45.4, -0.22, true],         // gift shop, sitting on the chair outside
  [-1.2, -56.6, 0, false],           // kiosk, at the serving hatch
  // Behind the staffed guichet of each pavilion, a pace back from the counter so
  // the glass is between them and the queue rather than through their chest.
  [-12.2, TICKET_DESK_Z, Math.PI / 2, false, CHALET_FLOOR_Y],   // west ticket booth
  [12.2, TICKET_DESK_Z, -Math.PI / 2, false, CHALET_FLOOR_Y],   // east ticket booth
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
  // Mark the furniture spot a visitor is sitting on as taken. The player is
  // then refused it, which is what stops two people ending up in the same seat.
  const occupySeat = (x, z) => {
    let best = null, bestD = Infinity;
    for (const spot of furnitureInteractions) {
      const d = Math.hypot(spot.x - x, spot.z - z);
      if (d < bestD) { bestD = d; best = spot; }
    }
    if (best && bestD < 0.9) best.occupied = 'visitor';
  };
  STAFF.forEach(([x, z, ry, seated, floorY], i) => {
    // The two who stand — the restaurant's and the kiosk's — are placed on a
    // spot and never routed anywhere, so they are held still. Left on the walk
    // they marched on the same paving stone in front of their own door.
    const v = makeVisitor(bases[i % bases.length], walkClip, rngCrowd,
      { uniform: STAFF_UNIFORM, seated, still: !seated, idleClip });
    crowd.add(v.group);
    if (seated) {
      seatOn(v, x, SEAT_TOP, z, ry);
      occupySeat(x, z);
    } else {
      standOn(v, x, z, ry, floorY ?? terrainHeight(x, z) + PLAZA_Y);
    }
    statics.push(v);
  });
  CUSTOMERS.forEach(([x, z, ry], i) => {
    const v = makeVisitor(bases[(i + 1) % bases.length], walkClip, rngCrowd, { seated: true });
    crowd.add(v.group);
    seatOn(v, x, SEAT_TOP, z, ry);
    occupySeat(x, z);
    statics.push(v);
  });
}

async function populateCrowd(bases, walkClip, guests = []) {
  if ((!walkClip || !bases.length) && !guests.length) return;
  // Two guest women, spaced on the loop. The rest alternate man / pack girl
  // from a separate counter — `i % 2` used to pick both "guest vs pack" AND
  // which pack base, so every leftover slot landed on girl.glb and the men
  // disappeared.
  const GUEST_SLOTS = new Set([3, 8]);
  let packI = 0;
  CROWD_PLAN.forEach(([at, dir], i) => {
    const useGuest = guests.length && GUEST_SLOTS.has(i);
    let v;
    if (useGuest) {
      const g = guests[i % guests.length];
      v = makeVisitor(g.scene, g.walkClip, rngCrowd, { guest: g, idleClip: g.idleClip });
    } else if (walkClip && bases.length) {
      v = makeVisitor(bases[packI++ % bases.length], walkClip, rngCrowd);
    } else {
      return;
    }
    crowd.add(v.group);
    v.mixer.update(0);
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
    occupied: false,
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
shopProducts.finish();
lionExhibit();
zebraPaddock();
foxEnclosure();
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
  hayHeap(-70, 0.05, -40, 2.6, 1.05, 2.2, 1.15);
  hayHeap(-71.5, 0.05, -38.6, 2.2, 0.88, 1.9, 2.84);
  // Tied bales at the near edge — a yellow mound alone still reads as a rock;
  // a couple of rectangular bales are what a farmyard actually leaves there.
  box(M.hay, -68.7, 0.20, -39.4, 0.95, 0.38, 0.48, 0.18);
  box(M.hay, -68.5, 0.20, -38.7, 0.90, 0.36, 0.46, -0.12);
  box(M.hay, -68.6, 0.56, -39.05, 0.92, 0.36, 0.45, 0.06);
  box(M.timberDark, -68.7, 0.20, -39.4, 0.97, 0.025, 0.05, 0.18);
  box(M.timberDark, -68.5, 0.20, -38.7, 0.92, 0.025, 0.05, -0.12);
  box(M.timberDark, -68.6, 0.56, -39.05, 0.94, 0.025, 0.05, 0.06);
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

// Wayfinding at the junctions, and the perimeter fence. Three sides used to
// be a visitor rail that stopped at the car park, so you could walk around
// the turnstiles into the park. The palisade closes the rectangle; the only
// gap is the gate between the flanking walls.
fingerPost(3.9, -16.8, [0.9, 2.4, 4.0]);
fingerPost(3.5, -83.5, [0.2, 2.9]);
const PX0 = -118, PX1 = 118, PZ0 = -136, PZ1 = GATE_Z;
perimeterFence(PX0, PZ0, PX1, PZ0);
perimeterFence(PX0, PZ0, PX0, PZ1);
perimeterFence(PX1, PZ0, PX1, PZ1);
perimeterFence(PX0, PZ1, -30, PZ1);
perimeterFence(30, PZ1, PX1, PZ1);

// Woodland filling the ground between the loop and the perimeter, and inside
// the loop behind the hub.
const rand = (seed => () => (seed = (seed * 16807) % 2147483647) / 2147483647)(20260808);
// Footprints the scatter must not drop a tree into: the four enclosures and the
// reptile house all have barriers a trunk would grow straight through.
const KEEP_OUT = [
  [LION.x0 - 4, LION.x1 + 8, LION.z0 - 4, LION.z1 + 4],
  [ZEBRA.x0 - 4, ZEBRA.x1 + 4, ZEBRA.z0 - 4, ZEBRA.z1 + 8],
  [FOX.x0 - 8, FOX.x1 + 4, FOX.z0 - 4, FOX.z1 + 4],
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
// car across three bays: `buildCar` lays its sedan out along X (4.9 m) and only
// 1.9 m across Z, so at yaw 0 the car lies ACROSS the markings — it overlapped
// both neighbours. The bays are 2.55 m wide and 5 m deep, so the car is turned a
// quarter and taken down to the size of a car that fits one. Measuring also
// means the bays survived the switch from lofted bodies to the modelled ones.
const carProbe = buildCar('sedan', 0xffffff);
const carBox = new THREE.Box3().setFromObject(carProbe);
const carSize = carBox.getSize(new THREE.Vector3());
const CAR_SCALE = Math.min(1, (BAY_PITCH - 0.55) / carSize.z, (BAY_DEPTH - 0.1) / carSize.x);
const CAR_L = carSize.x * CAR_SCALE, CAR_W = carSize.z * CAR_SCALE;
const CAR_H = carSize.y * CAR_SCALE;

// The crossover car: the same SUV parked outside the L.A. villa's garage,
// reused here so a player recognises it on both sides of the trip. It gets a
// bay of its own, held out of the random population below so nothing else is
// ever parked over it — a bay close to the entrance, on the aisle nearest the
// plaza, so arriving from L.A. drops you somewhere you'd naturally walk past.
const ZOO_TRAVEL_ROW = BAY_ROWS[0];
const ZOO_TRAVEL_BAY_K = 15;
const laCarProbe = buildCar('suv', 0xf0ece6, { metallic: true, pearl: true });
const laCarBox = new THREE.Box3().setFromObject(laCarProbe);
const laCarSize = laCarBox.getSize(new THREE.Vector3());
const LA_CAR_SCALE = Math.min(1, (BAY_PITCH - 0.55) / laCarSize.z, (BAY_DEPTH - 0.1) / laCarSize.x);
const ZOO_TRAVEL_L = laCarSize.x * LA_CAR_SCALE, ZOO_TRAVEL_W = laCarSize.z * LA_CAR_SCALE;
const ZOO_TRAVEL_H = laCarSize.y * LA_CAR_SCALE;
const ZOO_TRAVEL_CAR = Object.freeze({
  x: BAY_X0 + (ZOO_TRAVEL_BAY_K + 0.5) * BAY_PITCH,
  z: ZOO_TRAVEL_ROW,
  yaw: Math.PI / 2,
  ground: 0.05 - laCarBox.min.y * LA_CAR_SCALE,
});

const parkedCars = [];
let carIndex = 0;
for (const row of BAY_ROWS) {
  for (let k = 0; k < BAY_COUNT; k++) {
    const x = BAY_X0 + (k + 0.5) * BAY_PITCH;
    if (Math.abs(x) < WALK_HALF) continue;
    if (row === ZOO_TRAVEL_ROW && k === ZOO_TRAVEL_BAY_K) continue;
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

const zooTravelCar = buildCar('suv', 0xf0ece6, { metallic: true, pearl: true });
zooTravelCar.scale.setScalar(LA_CAR_SCALE);
zooTravelCar.position.set(ZOO_TRAVEL_CAR.x, ZOO_TRAVEL_CAR.ground, ZOO_TRAVEL_CAR.z);
zooTravelCar.rotation.y = ZOO_TRAVEL_CAR.yaw;
zooTravelCar.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
world.add(zooTravelCar);
parkedCars.push(zooTravelCar);
prop(() => box(M.collider, ZOO_TRAVEL_CAR.x, 0.05 + ZOO_TRAVEL_H / 2, ZOO_TRAVEL_CAR.z,
  ZOO_TRAVEL_L, ZOO_TRAVEL_H, ZOO_TRAVEL_W, ZOO_TRAVEL_CAR.yaw));

const zooTravelInteraction = {
  type: 'travel',
  label: 'Voyager à la villa L.A.',
  x: ZOO_TRAVEL_CAR.x,
  y: ZOO_TRAVEL_CAR.ground,
  z: ZOO_TRAVEL_CAR.z,
  centerX: ZOO_TRAVEL_CAR.x,
  centerZ: ZOO_TRAVEL_CAR.z,
  approachY: ZOO_TRAVEL_CAR.ground + 0.5,
  yaw: ZOO_TRAVEL_CAR.yaw,
  halfWidth: ZOO_TRAVEL_L / 2,
  halfDepth: ZOO_TRAVEL_W / 2,
  triggerDistance: 1.25,
  occupied: false,
};

flushKits();
flushLeafCards();

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
const zooParams = new URLSearchParams(location.search);
const arrivedFromLA = zooParams.get('arrival') === 'la';
// The zoo has no day/night cycle of its own; it only carries the villa's
// choice through the trip so the return leg can hand it back unchanged.
const preservedLaNight = zooParams.get('laNight') === '1' ? '1' : '0';
const zooArrivalSide = ZOO_TRAVEL_W / 2 + 1.1;
const zooArrivalPoint = new THREE.Vector3(
  ZOO_TRAVEL_CAR.x + Math.sin(ZOO_TRAVEL_CAR.yaw) * zooArrivalSide,
  ZOO_TRAVEL_CAR.ground + 0.2,
  ZOO_TRAVEL_CAR.z + Math.cos(ZOO_TRAVEL_CAR.yaw) * zooArrivalSide,
);
// On the car park, a couple of bays back from the entrance and facing it —
// unless the trip started at the L.A. villa, in which case spawn by the car.
const spawnPoint = arrivedFromLA ? zooArrivalPoint.clone() : new THREE.Vector3(2.5, 1.4, 19);
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
// Pack man/girl share the player's walk clip. The guest woman brings her own
// walk and idle — a different face, a different skeleton, same height.
{
  const bases = [];
  for (const url of ['./chars/glb/man.glb', './chars/glb/girl.glb']) {
    try {
      bases.push(await loadVisitorBase(url, girlMatFor));
    } catch (e) {
      console.warn('[zoo] visitor model unavailable:', url, e);
    }
  }
  const guests = [];
  try {
    guests.push(await loadGuestRig({
      model: './glb/visitors/woman.glb?v=1',
      walk: './glb/visitors/walk.glb?v=1',
      idle: './glb/visitors/idle.glb?v=1',
      height: 1.68,
    }));
  } catch (e) {
    console.warn('[zoo] guest visitor unavailable', e);
  }
  await populateCrowd(bases, player.actions.walk?.getClip(), guests);
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
let travelInProgress = false;
let releasedSpot = null;
// True while the sit prompt is on screen: we drop pointer lock so the cursor
// can click the button, and pointerlockchange must not treat that as a pause.
let choosingFurniturePrompt = false;
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
  // Same contract as the villa's lie-choice UI: unlock for the clickable
  // prompt, then re-lock when it goes away — otherwise the mouse only steers
  // the camera and the button can never be hit.
  choosingFurniturePrompt = show;
  if (show) {
    if (document.pointerLockElement === renderer.domElement)
      document.exitPointerLock?.();
  } else if (started && !paused) {
    requestGamePointerLock();
  }
}
furniturePrompt.addEventListener('click', event => {
  event.stopPropagation();
  if (!promptedFurniture) return;
  furnitureActionRequested = true;
  // Re-lock from the click itself: browsers reject pointer lock outside a
  // user gesture, and enterFurnitureInteraction only runs on the next frame.
  choosingFurniturePrompt = false;
  requestGamePointerLock();
});
renderer.domElement.addEventListener('click', () => {
  // After walking away from a bench the unlock is not a user gesture, so the
  // first canvas click reclaims the mouse look.
  if (started && !paused && !choosingFurniturePrompt
    && document.pointerLockElement !== renderer.domElement) {
    requestGamePointerLock();
  }
});

function enterFurnitureInteraction(spot) {
  setFurniturePrompt(null);
  // Keep 'visitor' if an NPC already owns the seat; only mark player seats as
  // taken so leaveFurnitureInteraction can free them without unseating NPCs.
  if (spot.occupied !== 'visitor') spot.occupied = 'player';
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
  if (interaction.source.occupied === 'player') interaction.source.occupied = false;
  activeFurnitureInteraction = null;
  furnitureInteractionCooldown = 0.4;
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
  for (const spot of [zooTravelInteraction, ...furnitureInteractions]) {
    if (spot === releasedSpot) continue;
    if (spot.occupied) continue;
    if (Math.abs(ctrl.pos.y - spot.approachY) > (spot.type === 'travel' ? 1.25 : 0.75)) continue;
    const distance = distanceToFurniture(spot, ctrl.pos);
    if (distance < (spot.triggerDistance ?? 0.54) && distance < nearestDistance) {
      nearest = spot;
      nearestDistance = distance;
    }
  }
  setFurniturePrompt(nearest);
  if (nearest && (furnitureActionRequested || input.pressed('LMB'))) {
    furnitureActionRequested = false;
    if (nearest.type === 'travel') {
      travelInProgress = true;
      setFurniturePrompt(null);
      location.href = `index.html?map=la&arrival=zoo&night=${preservedLaNight}`;
      return true;
    }
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
  document.documentElement.classList.toggle('is-seated', ctrl.mode === 'sit' || ctrl.mode === 'lie');
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
if (arrivedFromLA) startZoo();

document.addEventListener('pointerlockchange', () => {
  usedLock = usedLock || document.pointerLockElement !== null;
  // Dropping the lock for the sit button is intentional — keep playing and
  // leave the overlay closed (mirrors main-LA.js choosingLieWakeMode).
  if (choosingFurniturePrompt && document.pointerLockElement === null) {
    paused = false;
    overlay.style.display = 'none';
    return;
  }
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
  zooTravelCar, zooTravelInteraction, zooArrivalPoint,
};
window.__zoo = hook;
window.__villa = hook;
