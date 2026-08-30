import * as THREE from 'three';
import { Player } from './player.js?v=74';
import { harmoniseHair } from './hair.js?v=8';
import { Input } from './input.js';
import { Controller } from './controller.js?v=7';
import { CameraRig } from './cameraRig.js?v=7';
import { buildCityBoxes } from './cityBoxes.js?v=5';
import { buildCar, carBounds } from './cars.js?v=4';
import { cloneSkinned, makeVisitor, loadGuestRig, groundSitRig, lyingRig, customRig, rootBoneOf } from './crowd.js?v=57';

// ---------------------------------------------------------------------------
// Aller à la plage de L.A. — Phase 1: the ground you walk on.
//
// Where the zoo is a LOOP and the villa is a PLAN, a beach is BANDS. Everything
// is a strip running along X, and the whole map is read by walking -Z:
//
//   car park  →  corniche (promenade)  →  seawall + steps  →  dry sand
//             →  wet sand / wash  →  shallows  →  open water
//
// Bands are why this map is cheap to build and cheap to extend: every prop in
// phases 2 and 3 belongs to exactly one band, at one known height, so a shop
// goes on the promenade and a parasol goes on the sand without either of them
// needing to know anything about the other.
//
// Two things are load-bearing for the phases that follow:
//
// 1. THE SEA IS WADEABLE, NOT SWIMMABLE. The sea floor keeps descending, but an
//    invisible barrier (see WADE_Z) stops the player at roughly waist depth.
//    This is deliberately the villa pool's contract — "you wade, you don't
//    drown" — because the alternative is a swim state in controller.js, which
//    all five other maps share and none of them would want. NPC swimmers in
//    phase 3 are scenery and can float well past the barrier.
//
// 2. TIME IS THREE STATES, NOT A BOOLEAN. The villa and the shrine each toggle
//    day/night with two frozen tables; the beach needs `sunset` between them
//    (it is the whole point of a west-facing beach), so TIME_STATES is keyed
//    instead of paired and setBeachTime takes a name. The sun sits over the
//    WATER at -Z, so "fin de journée" puts it low on the horizon out to sea.
//
// Phase 1 deliberately ships no props and no people: it is the terrain, the
// water, the three lighting states, the drive in from the villa, and nothing
// else. Everything is instanced through the same kit the villa uses, because
// cityBoxes.js derives the collision world from the InstancedMeshes parented
// to `world`.
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

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xc8dcea, 190, 900);

const camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.25, 3000);
camera.position.set(0, 8, 40);

const world = new THREE.Group();
scene.add(world);

// ---------------------------------------------------------------------------
// Sun. The shadow frustum follows the player rather than covering the bay —
// the same trick the shrine uses, and far more necessary here: the playable
// sand alone is 300 m across, and a shadow map stretched over that would be
// mush.
// ---------------------------------------------------------------------------
const SUN_DIST = 190;
const SHADOW_HALF = 58;
const sun = new THREE.DirectionalLight(0xfff4e2, 2.6);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -SHADOW_HALF;
sun.shadow.camera.right = SHADOW_HALF;
sun.shadow.camera.top = SHADOW_HALF;
sun.shadow.camera.bottom = -SHADOW_HALF;
sun.shadow.camera.near = SUN_DIST - 100;
sun.shadow.camera.far = SUN_DIST + 150;
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.038;
sun.shadow.camera.updateProjectionMatrix();
scene.add(sun);
sun.target.position.set(0, 0, 0);
scene.add(sun.target);

// The current state's sun direction, refreshed by setBeachTime.
const sunDir = new THREE.Vector3(-70, 130, 60).normalize();
const SHADOW_TEXEL = (SHADOW_HALF * 2) / sun.shadow.mapSize.x;
function updateSunShadow(focus) {
  if (!sun.visible) return;
  // Snap to whole shadow texels so the shadow edges stop crawling as we walk.
  const fx = Math.round(focus.x / SHADOW_TEXEL) * SHADOW_TEXEL;
  const fz = Math.round(focus.z / SHADOW_TEXEL) * SHADOW_TEXEL;
  sun.target.position.set(fx, 0, fz);
  sun.position.set(fx, 0, fz).addScaledVector(sunDir, SUN_DIST);
  sun.target.updateMatrixWorld();
}

const moon = new THREE.DirectionalLight(0x9fc4f2, 0);
moon.position.set(60, 120, -80);
moon.target.position.set(0, 0, -20);
scene.add(moon);
scene.add(moon.target);

const hemi = new THREE.HemisphereLight(0xdcecff, 0xbba884, 0.85);
scene.add(hemi);

// ---------------------------------------------------------------------------
// Sky dome. A flat background colour cannot do a sunset, and the sunset is the
// reason this map has three time states — so the gradient and its glow lobe
// (pointed at whichever luminary is up) are here from phase 1.
// ---------------------------------------------------------------------------
const skyUniforms = {
  uHorizon: { value: new THREE.Color(0xdfeaf2) },
  uZenith: { value: new THREE.Color(0x5b90d2) },
  uGlow: { value: new THREE.Color(0xffeccc) },
  uGlowDir: { value: sunDir.clone() },
  uGlowStrength: { value: 0.5 },
  uGlowTightness: { value: 10.0 },
};
const skyDome = new THREE.Mesh(
  new THREE.SphereGeometry(2200, 32, 18),
  new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: skyUniforms,
    vertexShader: `
      varying vec3 vDir;
      void main() {
        vDir = normalize( position );
        gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
      }`,
    fragmentShader: `
      uniform vec3 uHorizon, uZenith, uGlow, uGlowDir;
      uniform float uGlowStrength, uGlowTightness;
      varying vec3 vDir;
      void main() {
        vec3 d = normalize( vDir );
        float h = clamp( d.y * 0.5 + 0.5, 0.0, 1.0 );
        vec3 col = mix( uHorizon, uZenith, pow( smoothstep( 0.5, 1.0, h ), 0.8 ) );
        float g = pow( max( dot( d, normalize( uGlowDir ) ), 0.0 ), uGlowTightness );
        col += uGlow * g * uGlowStrength;
        gl_FragColor = vec4( col, 1.0 );
      }`,
  })
);
skyDome.frustumCulled = false;
skyDome.renderOrder = -1;
scene.add(skyDome);

const loader = new THREE.TextureLoader();
const maxAniso = renderer.capabilities.getMaxAnisotropy();
const pmrem = new THREE.PMREMGenerator(renderer);
pmrem.compileEquirectangularShader();

loader.load('./data/env_equirect.png', t => {
  t.mapping = THREE.EquirectangularReflectionMapping;
  t.colorSpace = THREE.SRGBColorSpace;
  scene.environment = pmrem.fromEquirectangular(t).texture;
  scene.environmentIntensity = 0.5;
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
// Character materials. The pack ships a camouflage survival outfit; the beach
// wants none of it, so the maps are dropped on the clothing and the colours
// driven directly — the same move the zoo makes, including its reason for
// throwing away the packed metallic/smoothness map: it declares bare skin a
// metal, and under a low sun over the water that turns the avatar into a black
// mirror. Swimwear itself is built in player.js (`swim: true`).
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
function tintBeachStyle(mat, name) {
  const n = name.toLowerCase();
  if (n.includes('tshirt')) {
    mat.map = null;
    mat.color.set('#f6f1e4');       // loose white cotton over the swimsuit
    mat.roughness = 0.9;
    mat.metalness = 0.01;
  } else if (n.includes('pants')) {
    mat.map = null;
    mat.color.set('#e6d3b4');       // sand-coloured linen shorts
    mat.roughness = 0.92;
    mat.metalness = 0;
  } else if (n.includes('shoes')) {
    mat.map = null;
    mat.color.set('#c8624f');       // flip-flops
    mat.roughness = 0.7;
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
  tintBeachStyle(m, name);
  return m;
}

// ---------------------------------------------------------------------------
// Sand. No sand texture ships with the project and a flat beige plane reads as
// cardboard, so it is generated the way the villa generates its rugs: grain
// written into a canvas, then a normal map derived from that same height field
// by central difference. Two scales are baked in — fine grain you see at your
// feet, and a long wind ripple you see across the whole beach.
// ---------------------------------------------------------------------------
function makeSandMaps() {
  const size = 512;
  const c = Object.assign(document.createElement('canvas'), { width: size, height: size });
  const ctx = c.getContext('2d');
  const height = new Float32Array(size * size);
  const img = ctx.createImageData(size, size);
  const px = img.data;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // Wind ripple: long, shallow, and never quite straight. The frequencies
      // are whole numbers of cycles across the tile — an arbitrary frequency
      // does not meet itself at the wrap, and a 900 m beach then shows the
      // seam as a visible grid every 15 m.
      const TAU = Math.PI * 2;
      const ripple = Math.sin(TAU * 6 * x / size + Math.sin(TAU * 2 * y / size) * 2.4) * 0.5 + 0.5;
      // Grain: deterministic hash so the tile is identical every run.
      const g1 = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
      const grain = g1 - Math.floor(g1);
      const shell = grain > 0.9975 ? 0.5 : 0;   // the odd bleached fragment
      const h = ripple * 0.11 + grain * 0.06 + shell;
      height[y * size + x] = h;
      const k = 0.86 + h * 0.42;
      const i = (y * size + x) * 4;
      px[i] = Math.min(255, 231 * k);
      px[i + 1] = Math.min(255, 212 * k);
      px[i + 2] = Math.min(255, 174 * k);
      px[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);

  const nc = Object.assign(document.createElement('canvas'), { width: size, height: size });
  const nctx = nc.getContext('2d');
  const nd = nctx.createImageData(size, size);
  const np = nd.data;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const xm = height[y * size + (x === 0 ? size - 1 : x - 1)];
      const xp = height[y * size + (x === size - 1 ? 0 : x + 1)];
      const ym = height[(y === 0 ? size - 1 : y - 1) * size + x];
      const yp = height[(y === size - 1 ? 0 : y + 1) * size + x];
      let nx = (xm - xp) * 9, ny = (ym - yp) * 9;
      const len = Math.hypot(nx, ny, 1) || 1;
      const i = (y * size + x) * 4;
      np[i] = (nx / len * 0.5 + 0.5) * 255;
      np[i + 1] = (ny / len * 0.5 + 0.5) * 255;
      np[i + 2] = (1 / len * 0.5 + 0.5) * 255;
      np[i + 3] = 255;
    }
  }
  nctx.putImageData(nd, 0, 0);

  const albedo = new THREE.CanvasTexture(c);
  albedo.wrapS = albedo.wrapT = THREE.RepeatWrapping;
  albedo.repeat.set(60, 60);
  albedo.colorSpace = THREE.SRGBColorSpace;
  albedo.anisotropy = maxAniso;
  const normal = new THREE.CanvasTexture(nc);
  normal.wrapS = normal.wrapT = THREE.RepeatWrapping;
  normal.repeat.set(60, 60);
  normal.anisotropy = maxAniso;
  return { albedo, normal };
}
const sandMaps = makeSandMaps();

// ---------------------------------------------------------------------------
// Foliage cards. Vegetation lives or dies on its SILHOUETTE, and a blob has
// none — a green ellipsoid on a dune reads as a bubble however it is shaded.
// These are drawn on canvas with a cut alpha so the leaf edges are real.
// ---------------------------------------------------------------------------
function makeFrondTexture() {
  const S = 256;
  const c = Object.assign(document.createElement('canvas'), { width: S, height: S });
  const g = c.getContext('2d');
  const cx = S / 2;
  // Leaflets in opposed pairs up a central rib, shortening and drooping more
  // toward the tip — which is what makes a palm frond a frond and not a spike.
  for (let i = 0; i < 26; i++) {
    const t = i / 25;
    const y = S - 10 - t * (S - 26);
    const len = Math.sin(Math.PI * (0.2 + t * 0.8)) * (S * 0.30) * (1 - t * 0.4);
    const droop = 9 + t * 26;
    for (const dir of [-1, 1]) {
      g.beginPath();
      g.moveTo(cx, y);
      g.quadraticCurveTo(cx + dir * len * 0.62, y - 5, cx + dir * len, y + droop);
      g.quadraticCurveTo(cx + dir * len * 0.5, y + 9, cx, y + 8);
      g.closePath();
      const k = 0.68 + ((i + (dir > 0 ? 1 : 0)) % 3) * 0.12;
      g.fillStyle = `rgb(${Math.round(78 * k)},${Math.round(140 * k)},${Math.round(64 * k)})`;
      g.fill();
    }
  }
  g.strokeStyle = '#77863f';
  g.lineWidth = 5;
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(cx, S - 4);
  g.lineTo(cx, 14);
  g.stroke();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = maxAniso;
  return t;
}
// A ragged clump of coastal scrub leaves, for the bushes on the bluffs.
function makeBushTexture() {
  const S = 256;
  const c = Object.assign(document.createElement('canvas'), { width: S, height: S });
  const g = c.getContext('2d');
  let s = 7771;
  const r = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let i = 0; i < 90; i++) {
    const a = r() * Math.PI * 2;
    const rad = Math.pow(r(), 0.6) * S * 0.42;
    const x = S / 2 + Math.cos(a) * rad;
    const y = S * 0.62 + Math.sin(a) * rad * 0.7;
    const w = 9 + r() * 15;
    const k = 0.6 + r() * 0.5;
    g.save();
    g.translate(x, y);
    g.rotate(r() * Math.PI);
    g.beginPath();
    g.ellipse(0, 0, w, w * (0.32 + r() * 0.3), 0, 0, Math.PI * 2);
    g.fillStyle = `rgb(${Math.round(104 * k)},${Math.round(122 * k)},${Math.round(66 * k)})`;
    g.fill();
    g.restore();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = maxAniso;
  return t;
}

// Irregular, FACETED boulders. A smoothed icosahedron scaled flat is a bubble;
// jittering the shell and shading it flat is what makes it read as stone. The
// jitter is hashed off each vertex's own position because the geometry is
// non-indexed — a per-index random would tear the corners apart.
function makeRockGeo(salt) {
  const g = new THREE.IcosahedronGeometry(0.5, 1);
  const p = g.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const k = Math.sin(
      Math.round(v.x * 800) * 12.9898 +
      Math.round(v.y * 800) * 78.233 +
      Math.round(v.z * 800) * 37.719 + salt) * 43758.5453;
    v.multiplyScalar(0.72 + (k - Math.floor(k)) * 0.56);
    v.y *= 0.78;                     // boulders sit, they do not float
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return withUV2(g);
}

// Surfboard / skate deck: a real outline, extruded, not a box with a picture
// stuck on. Venice racks are a row of these silhouettes.
function makeBoardGeo(kind) {
  const s = new THREE.Shape();
  if (kind === 'surf') {
    const L = 1.12, W = 0.255;
    s.moveTo(0, L);
    s.bezierCurveTo(W * 0.5, L - 0.04, W, L * 0.42, W, 0.04);
    s.lineTo(W * 0.8, -L * 0.7);
    s.lineTo(W * 0.38, -L);
    s.lineTo(0, -L - 0.02);
    s.lineTo(-W * 0.38, -L);
    s.lineTo(-W * 0.8, -L * 0.7);
    s.lineTo(-W, 0.04);
    s.bezierCurveTo(-W, L * 0.42, -W * 0.5, L - 0.04, 0, L);
  } else {
    const L = 0.40, W = 0.098;
    s.moveTo(0, L);
    s.bezierCurveTo(W, L - 0.01, W, L * 0.55, W, 0);
    s.bezierCurveTo(W, -L * 0.55, W, -L + 0.01, 0, -L);
    s.bezierCurveTo(-W, -L + 0.01, -W, -L * 0.55, -W, 0);
    s.bezierCurveTo(-W, L * 0.55, -W, L - 0.01, 0, L);
  }
  const g = new THREE.ExtrudeGeometry(s, {
    depth: kind === 'surf' ? 0.052 : 0.036,
    bevelEnabled: true,
    bevelThickness: 0.007,
    bevelSize: 0.006,
    bevelSegments: 1,
    curveSegments: 14,
  });
  g.center();
  g.computeVertexNormals();
  return withUV2(g);
}

// ---------------------------------------------------------------------------
// Boat Geometries — Hydrodynamic hulls, 3D billowing sails, and superstructures.
// ---------------------------------------------------------------------------
function makeSailboatHullGeo() {
  const g = new THREE.BufferGeometry();
  const Nz = 16, ringSize = 12;
  const pos = [], uvs = [], ind = [];

  for (let iz = 0; iz <= Nz; iz++) {
    const t = iz / Nz;
    const z = -0.5 + t * 1.0;
    let w;
    if (t < 0.6) {
      w = 0.5 * (0.75 + 0.25 * Math.sin(t / 0.6 * Math.PI * 0.5));
    } else {
      const u = (t - 0.6) / 0.4;
      w = 0.5 * Math.cos(u * Math.PI * 0.5);
    }
    const yDeck = 0.15 + 0.10 * Math.pow(t - 0.3, 2);
    let yBot = t < 0.9 ? -0.22 * Math.sin(t * Math.PI * 0.85) : -0.05 * (1.0 - t) / 0.1;
    if (t === 0) yBot = -0.08;
    const depth = yDeck - yBot;

    const profile = [
      [+w * 0.5, yDeck],
      [+w * 0.5 * 0.95, yDeck - depth * 0.35],
      [+w * 0.5 * 0.70, yDeck - depth * 0.75],
      [+w * 0.5 * 0.20, yBot + 0.02],
      [0.0, yBot],
      [-w * 0.5 * 0.20, yBot + 0.02],
      [-w * 0.5 * 0.70, yDeck - depth * 0.75],
      [-w * 0.5 * 0.95, yDeck - depth * 0.35],
      [-w * 0.5, yDeck],
      [-w * 0.5 * 0.5, yDeck + 0.015],
      [0.0, yDeck + 0.025],
      [+w * 0.5 * 0.5, yDeck + 0.015],
    ];

    for (let k = 0; k < ringSize; k++) {
      pos.push(profile[k][0], profile[k][1], z);
      uvs.push(k / (ringSize - 1), t);
    }
  }

  for (let iz = 0; iz < Nz; iz++) {
    const r0 = iz * ringSize;
    const r1 = (iz + 1) * ringSize;
    for (let k = 0; k < ringSize; k++) {
      const kNext = (k + 1) % ringSize;
      ind.push(r0 + k, r1 + k, r1 + kNext);
      ind.push(r0 + k, r1 + kNext, r0 + kNext);
    }
  }

  // Stern transom cap (t=0, ring 0)
  const sternCenter = pos.length / 3;
  pos.push(0.0, 0.05, -0.5);
  uvs.push(0.5, 0.0);
  for (let k = 0; k < ringSize; k++) {
    const kNext = (k + 1) % ringSize;
    ind.push(sternCenter, kNext, k);
  }

  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(ind);
  g.computeVertexNormals();
  return withUV2(g);
}

function makeYachtHullGeo() {
  const g = new THREE.BufferGeometry();
  const Nz = 16, ringSize = 12;
  const pos = [], uvs = [], ind = [];

  for (let iz = 0; iz <= Nz; iz++) {
    const t = iz / Nz;
    const z = -0.5 + t * 1.0;
    let w;
    if (t < 0.3) {
      w = 0.5 * 0.88;
    } else if (t < 0.7) {
      w = 0.5 * 0.95;
    } else {
      const u = (t - 0.7) / 0.3;
      w = 0.5 * 0.95 * Math.cos(u * Math.PI * 0.5);
    }
    const yDeck = 0.16 + 0.08 * Math.pow(t, 1.5);
    const yChine = yDeck - 0.12;
    let yBot = t < 0.95 ? -0.16 * Math.sin(t * Math.PI * 0.9) : 0.0;
    if (t < 0.1) yBot = -0.06;
    const depth = yDeck - yBot;

    const profile = [
      [+w * 0.5, yDeck],
      [+w * 0.5 * 0.92, yChine],
      [+w * 0.5 * 0.60, yBot + 0.04],
      [+w * 0.5 * 0.15, yBot + 0.01],
      [0.0, yBot],
      [-w * 0.5 * 0.15, yBot + 0.01],
      [-w * 0.5 * 0.60, yBot + 0.04],
      [-w * 0.5 * 0.92, yChine],
      [-w * 0.5, yDeck],
      [-w * 0.5 * 0.5, yDeck + 0.01],
      [0.0, yDeck + 0.018],
      [+w * 0.5 * 0.5, yDeck + 0.01],
    ];

    for (let k = 0; k < ringSize; k++) {
      pos.push(profile[k][0], profile[k][1], z);
      uvs.push(k / (ringSize - 1), t);
    }
  }

  for (let iz = 0; iz < Nz; iz++) {
    const r0 = iz * ringSize;
    const r1 = (iz + 1) * ringSize;
    for (let k = 0; k < ringSize; k++) {
      const kNext = (k + 1) % ringSize;
      ind.push(r0 + k, r1 + k, r1 + kNext);
      ind.push(r0 + k, r1 + kNext, r0 + kNext);
    }
  }

  // Stern transom cap
  const sternCenter = pos.length / 3;
  pos.push(0.0, 0.05, -0.5);
  uvs.push(0.5, 0.0);
  for (let k = 0; k < ringSize; k++) {
    const kNext = (k + 1) % ringSize;
    ind.push(sternCenter, kNext, k);
  }

  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(ind);
  g.computeVertexNormals();
  return withUV2(g);
}

function makeMainsailGeo(camber = 0.06) {
  const g = new THREE.BufferGeometry();
  const Ny = 12, Nu = 10;
  const L_boom = 0.45;
  const pos = [], uvs = [], ind = [];

  for (let iy = 0; iy <= Ny; iy++) {
    const v = iy / Ny;
    const y = v * 1.0;
    const zLeech = -L_boom * Math.pow(1.0 - v, 0.82);
    for (let iu = 0; iu <= Nu; iu++) {
      const u = iu / Nu;
      const z = zLeech * u;
      const x = Math.sin(u * Math.PI) * camber * Math.sin((1.0 - v) * Math.PI * 0.85 + 0.15);
      pos.push(x, y, z);
      uvs.push(u, v);
    }
  }

  for (let iy = 0; iy < Ny; iy++) {
    for (let iu = 0; iu < Nu; iu++) {
      const p00 = iy * (Nu + 1) + iu;
      const p01 = p00 + 1;
      const p10 = (iy + 1) * (Nu + 1) + iu;
      const p11 = p10 + 1;
      ind.push(p00, p10, p11);
      ind.push(p00, p11, p01);
    }
  }

  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(ind);
  g.computeVertexNormals();
  return withUV2(g);
}

function makeJibGeo(camber = 0.05) {
  const g = new THREE.BufferGeometry();
  const Ny = 12, Nu = 10;
  const tack = [0, 0.02, 0.45];
  const head = [0, 0.88, 0.03];
  const clew = [0, 0.10, 0.06];
  const pos = [], uvs = [], ind = [];

  for (let iy = 0; iy <= Ny; iy++) {
    const v = iy / Ny;
    const luffY = tack[1] + (head[1] - tack[1]) * v;
    const luffZ = tack[2] + (head[2] - tack[2]) * v;
    const leechY = clew[1] + (head[1] - clew[1]) * v;
    const leechZ = clew[2] + (head[2] - clew[2]) * v;

    for (let iu = 0; iu <= Nu; iu++) {
      const u = iu / Nu;
      const py = luffY + (leechY - luffY) * u;
      const pz = luffZ + (leechZ - luffZ) * u;
      const px = Math.sin(u * Math.PI) * camber * (1.0 - v * 0.7);
      pos.push(px, py, pz);
      uvs.push(u, v);
    }
  }

  for (let iy = 0; iy < Ny; iy++) {
    for (let iu = 0; iu < Nu; iu++) {
      const p00 = iy * (Nu + 1) + iu;
      const p01 = p00 + 1;
      const p10 = (iy + 1) * (Nu + 1) + iu;
      const p11 = p10 + 1;
      ind.push(p00, p10, p11);
      ind.push(p00, p11, p01);
    }
  }

  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(ind);
  g.computeVertexNormals();
  return withUV2(g);
}

function makeYachtCabinGeo() {
  const s = new THREE.Shape();
  s.moveTo(-0.28, 0);
  s.lineTo(0.25, 0);
  s.lineTo(0.12, 0.16);
  s.lineTo(-0.22, 0.16);
  s.lineTo(-0.28, 0.08);
  s.closePath();

  const g = new THREE.ExtrudeGeometry(s, {
    depth: 0.28,
    bevelEnabled: true,
    bevelThickness: 0.015,
    bevelSize: 0.015,
    bevelSegments: 2,
  });
  g.center();
  g.rotateY(Math.PI / 2);
  g.computeVertexNormals();
  return withUV2(g);
}

function makeRadarArchGeo() {
  const s = new THREE.Shape();
  s.moveTo(-0.06, 0);
  s.lineTo(0.04, 0);
  s.lineTo(0.02, 0.14);
  s.lineTo(-0.06, 0.14);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, {
    depth: 0.26,
    bevelEnabled: true,
    bevelThickness: 0.008,
    bevelSize: 0.008,
    bevelSegments: 1,
  });
  g.center();
  g.rotateY(Math.PI / 2);
  g.computeVertexNormals();
  return withUV2(g);
}

function makeBowRailGeo() {
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.12, 0, -0.2),
    new THREE.Vector3(-0.09, 0.04, 0.05),
    new THREE.Vector3(0, 0.05, 0.25),
    new THREE.Vector3(0.09, 0.04, 0.05),
    new THREE.Vector3(0.12, 0, -0.2),
  ]);
  const g = new THREE.TubeGeometry(curve, 16, 0.006, 6, false);
  g.computeVertexNormals();
  return withUV2(g);
}

// Soft radial sprite — the wash foam and, later, the bonfire glow.
function makeGlowTexture() {
  const c = Object.assign(document.createElement('canvas'), { width: 128, height: 128 });
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

function makeVolleyballTexture() {
  const S = 256;
  const c = Object.assign(document.createElement('canvas'), { width: S, height: S });
  const g = c.getContext('2d');

  // Crisp white leather base
  g.fillStyle = '#f8f7f0';
  g.fillRect(0, 0, S, S);

  // Official beach volleyball curved tri-color panel swirls (royal blue, golden yellow, white)
  const drawBand = (color, cy, ry, angle) => {
    g.save();
    g.fillStyle = color;
    g.beginPath();
    g.ellipse(S / 2, cy, S * 0.48, ry, angle, 0, Math.PI * 2);
    g.fill();
    g.restore();
  };

  drawBand('#194db4', S * 0.28, S * 0.16, 0.38);
  drawBand('#f6b800', S * 0.44, S * 0.15, -0.38);
  drawBand('#194db4', S * 0.72, S * 0.16, 0.38);
  drawBand('#f6b800', S * 0.88, S * 0.15, -0.38);

  // Soft seam grooves between panels
  g.strokeStyle = '#5a6472';
  g.lineWidth = 2.0;
  for (let i = 0; i <= 4; i++) {
    const y = i * (S / 4);
    g.beginPath();
    g.moveTo(0, y);
    g.bezierCurveTo(S * 0.35, y + 16, S * 0.65, y - 16, S, y);
    g.stroke();
  }
  for (let i = 1; i <= 3; i++) {
    const x = i * (S / 4);
    g.beginPath();
    g.moveTo(x, 0);
    g.bezierCurveTo(x + 16, S * 0.35, x - 16, S * 0.65, x, S);
    g.stroke();
  }

  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const waterN = ntex('./textures/la/water_normal.jpg', 22, 14);
const sidewalkA = tex('./textures/CP_Sidewalk_A.webp', 26, 3);
const sidewalkN = ntex('./textures/CP_Sidewalk_N.webp', 26, 3);
const concreteA = tex('./textures/CP_Concrete_01_A.webp', 10, 2);
const concreteN = ntex('./textures/CP_Concrete_01_N.webp', 10, 2);
const asphaltA = tex('./textures/CP_Asphalt_A.webp', 22, 6);
const asphaltN = ntex('./textures/CP_Asphalt_N.webp', 22, 6);
const woodA = tex('./textures/nature/wood_diff.jpg', 3, 1);
const woodN = ntex('./textures/nature/wood_n.jpg', 3, 1);
const barkA = tex('./textures/nature/bark_diff.jpg', 2, 3);
const barkN = ntex('./textures/nature/bark_n.jpg', 2, 3);

const M = {
  sand: new THREE.MeshStandardMaterial({
    map: sandMaps.albedo, normalMap: sandMaps.normal,
    normalScale: new THREE.Vector2(0.8, 0.8),
    color: 0xffffff, roughness: 0.97, metalness: 0,
    // The whole beach is one mesh: vertex colour is what separates white sand
    // from the scrub on the bluffs without a second material.
    vertexColors: true,
  }),
  // The wash zone: the same grain, soaked. Darker, and glossy enough to throw a
  // low sun straight back at the camera — which is most of what sells a sunset.
  wetSand: new THREE.MeshStandardMaterial({
    map: sandMaps.albedo, normalMap: sandMaps.normal,
    normalScale: new THREE.Vector2(0.35, 0.35),
    color: 0x9c8a6a, roughness: 0.34, metalness: 0,
    // Vertex alpha is what lets the band fade out instead of ending on a hard
    // brown edge — see conformedStrip.
    vertexColors: true, transparent: true, depthWrite: false,
  }),
  // Sun-bleached, not city concrete: these maps are dark enough on their own
  // that at full strength the seawall reads as a black band against the sand.
  promenade: new THREE.MeshStandardMaterial({
    map: sidewalkA, normalMap: sidewalkN, color: 0xfff8ea, roughness: 0.9, metalness: 0,
  }),
  // Normal map but NO albedo map. The seawall's only visible face is vertical,
  // so it catches a glancing fraction of a high sun; multiply that by a city
  // concrete albedo and it renders as a black band across a white beach. A
  // flat sun-bleached tint keeps the relief and loses the soot.
  seawall: new THREE.MeshStandardMaterial({
    normalMap: concreteN, color: 0xe9e1cf, roughness: 0.92, metalness: 0,
  }),
  kerb: new THREE.MeshStandardMaterial({ color: 0xcfc8b8, roughness: 0.88 }),
  asphalt: new THREE.MeshStandardMaterial({
    map: asphaltA, normalMap: asphaltN, color: 0x8e8b86, roughness: 0.95, metalness: 0,
  }),
  paint: new THREE.MeshStandardMaterial({ color: 0xe8e4d2, roughness: 0.7 }),

  // --- Timber: the pier, the towers, the decking -------------------------
  deckWood: new THREE.MeshStandardMaterial({
    map: woodA, normalMap: woodN, color: 0xcbb08c, roughness: 0.88, metalness: 0,
  }),
  piling: new THREE.MeshStandardMaterial({
    map: woodA, normalMap: woodN, color: 0x6f5a45, roughness: 0.95, metalness: 0,
  }),
  // Lifeguard red — the one colour on this beach that has to read from 200 m.
  guardRed: new THREE.MeshStandardMaterial({ color: 0xd8362a, roughness: 0.62 }),
  guardWhite: new THREE.MeshStandardMaterial({ color: 0xf4f1e8, roughness: 0.66 }),
  guardBlue: new THREE.MeshStandardMaterial({ color: 0x2f6f9c, roughness: 0.62 }),

  // --- Planting ------------------------------------------------------------
  bark: new THREE.MeshStandardMaterial({
    map: barkA, normalMap: barkN, color: 0xa08b6d, roughness: 0.95,
  }),
  // Cut-alpha cards, not solids. alphaTest rather than transparency so they
  // still write depth and sort correctly against each other in a crown.
  frondCard: new THREE.MeshStandardMaterial({
    map: makeFrondTexture(), alphaTest: 0.42, side: THREE.DoubleSide,
    roughness: 0.86, metalness: 0,
  }),
  frondCardDry: new THREE.MeshStandardMaterial({
    map: makeFrondTexture(), alphaTest: 0.42, side: THREE.DoubleSide,
    roughness: 0.9, metalness: 0, color: 0xc4a862,
  }),
  bushCard: new THREE.MeshStandardMaterial({
    map: makeBushTexture(), alphaTest: 0.38, side: THREE.DoubleSide,
    roughness: 0.93, metalness: 0,
  }),
  frondDry: new THREE.MeshStandardMaterial({ color: 0x8a7c46, roughness: 0.9 }),
  scrub: new THREE.MeshStandardMaterial({ color: 0x5e6b40, roughness: 0.95, flatShading: true }),
  duneGrass: new THREE.MeshStandardMaterial({
    color: 0x9aa060, roughness: 0.93, side: THREE.DoubleSide, flatShading: true,
  }),

  // --- Shops ---------------------------------------------------------------
  kiosk: new THREE.MeshStandardMaterial({ color: 0xf2ece0, roughness: 0.8 }),
  kioskTrim: new THREE.MeshStandardMaterial({ color: 0x50748c, roughness: 0.7 }),
  counter: new THREE.MeshStandardMaterial({
    map: woodA, normalMap: woodN, color: 0xb8926a, roughness: 0.8,
  }),
  // Powder-coated, not chrome. At metalness 0.85 a metal has almost no diffuse
  // and lives entirely off reflections, so under this map's modest environment
  // intensity every post, mast and frame rendered near-black against the sand.
  // Salt-coast ironmongery is painted anyway.
  steel: new THREE.MeshStandardMaterial({ color: 0xcdd3d8, roughness: 0.48, metalness: 0.28 }),
  black: new THREE.MeshStandardMaterial({ color: 0x1c1e22, roughness: 0.5 }),
  concreteSlab: new THREE.MeshStandardMaterial({ color: 0xd6cfbe, roughness: 0.94 }),
  // The colonnade: columns, capitals and voussoirs. Kept a shade off the
  // painted stucco so the arcade reads as the structure it is.
  arcade: new THREE.MeshStandardMaterial({ color: 0xf0e7d4, roughness: 0.88 }),
  // Emissive so the lamps still read as lamps at night without each one
  // costing a real light — see the night budget note in the villa.
  lampGlass: new THREE.MeshStandardMaterial({
    color: 0xfff4d2, emissive: 0x000000, emissiveIntensity: 1, roughness: 0.3,
  }),
  glassPane: new THREE.MeshStandardMaterial({
    color: 0xbfd8e2, roughness: 0.08, metalness: 0, transparent: true, opacity: 0.34,
  }),

  // --- Fabric. A fixed palette rather than a colour per shop: the awnings and
  // the parasols are most of the instance count on this map, and one material
  // per hue would break every one of them out into its own draw call. --------
  fabricWhite: new THREE.MeshStandardMaterial({ color: 0xf6f2e6, roughness: 0.86, side: THREE.DoubleSide }),
  fabricRed: new THREE.MeshStandardMaterial({ color: 0xd9463f, roughness: 0.86, side: THREE.DoubleSide }),
  fabricBlue: new THREE.MeshStandardMaterial({ color: 0x2f86b4, roughness: 0.86, side: THREE.DoubleSide }),
  fabricYellow: new THREE.MeshStandardMaterial({ color: 0xe8b23c, roughness: 0.86, side: THREE.DoubleSide }),
  fabricGreen: new THREE.MeshStandardMaterial({ color: 0x3f9c78, roughness: 0.86, side: THREE.DoubleSide }),
  fabricPink: new THREE.MeshStandardMaterial({ color: 0xe07ba0, roughness: 0.86, side: THREE.DoubleSide }),
  fabricNavy: new THREE.MeshStandardMaterial({ color: 0x1e2a44, roughness: 0.86, side: THREE.DoubleSide }),
  fabricBlack: new THREE.MeshStandardMaterial({ color: 0x161616, roughness: 0.86, side: THREE.DoubleSide }),
  fabricOrange: new THREE.MeshStandardMaterial({ color: 0xe07030, roughness: 0.86, side: THREE.DoubleSide }),
  mannequin: new THREE.MeshStandardMaterial({ color: 0xc8a882, roughness: 0.7 }),
  lensDark: new THREE.MeshStandardMaterial({
    color: 0x1a2430, roughness: 0.08, metalness: 0.4, transparent: true, opacity: 0.62,
  }),
  lensGold: new THREE.MeshStandardMaterial({
    color: 0xc88820, roughness: 0.12, metalness: 0.55, transparent: true, opacity: 0.7,
  }),
  crust: new THREE.MeshStandardMaterial({ color: 0xc48a3a, roughness: 0.92 }),
  cheese: new THREE.MeshStandardMaterial({ color: 0xf0c24a, roughness: 0.7 }),
  pepperoni: new THREE.MeshStandardMaterial({ color: 0xb03028, roughness: 0.7 }),
  vinyl: new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.35, metalness: 0.15 }),
  paper: new THREE.MeshStandardMaterial({ color: 0xf3ead4, roughness: 0.9 }),
  chrome: new THREE.MeshStandardMaterial({ color: 0xd5dce8, roughness: 0.28, metalness: 0.52 }),
  shopWarm: new THREE.MeshStandardMaterial({
    color: 0xffe2b0, emissive: 0xffc878, emissiveIntensity: 0.35, roughness: 0.6,
  }),

  // --- Boats ---------------------------------------------------------------
  hullWhite: new THREE.MeshStandardMaterial({ color: 0xf5f5ef, roughness: 0.25, metalness: 0.08 }),
  hullNavy: new THREE.MeshStandardMaterial({ color: 0x16263b, roughness: 0.28, metalness: 0.12 }),
  hullDark: new THREE.MeshStandardMaterial({ color: 0x1e2734, roughness: 0.35, metalness: 0.15 }),
  hullTeak: new THREE.MeshStandardMaterial({
    map: woodA, normalMap: woodN, color: 0xba9268, roughness: 0.75,
  }),
  hullBlack: new THREE.MeshStandardMaterial({ color: 0x14161a, roughness: 0.5 }),
  sail: new THREE.MeshStandardMaterial({
    color: 0xfbf9f4, roughness: 0.8, side: THREE.DoubleSide,
  }),
  sailStripe: new THREE.MeshStandardMaterial({
    color: 0xd9382c, roughness: 0.72, side: THREE.DoubleSide,
  }),
  sailBlue: new THREE.MeshStandardMaterial({
    color: 0x2262a2, roughness: 0.72, side: THREE.DoubleSide,
  }),
  yachtGlass: new THREE.MeshStandardMaterial({
    color: 0x0e1822, roughness: 0.05, metalness: 0.85, transparent: true, opacity: 0.82,
  }),
  cushionNavy: new THREE.MeshStandardMaterial({ color: 0x1e3654, roughness: 0.82 }),
  cushionWhite: new THREE.MeshStandardMaterial({ color: 0xeeebe2, roughness: 0.82 }),
  navRed: new THREE.MeshStandardMaterial({
    color: 0xff3333, emissive: 0xff1111, emissiveIntensity: 2.2, roughness: 0.4,
  }),
  navGreen: new THREE.MeshStandardMaterial({
    color: 0x00e676, emissive: 0x00cc55, emissiveIntensity: 2.2, roughness: 0.4,
  }),
  navWhite: new THREE.MeshStandardMaterial({
    color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 2.2, roughness: 0.4,
  }),
  volleyball: new THREE.MeshStandardMaterial({
    map: makeVolleyballTexture(), roughness: 0.55, metalness: 0.05,
  }),
  paddleBall: new THREE.MeshStandardMaterial({
    color: 0xf2e432, roughness: 0.75,
  }),
  // Flat-shaded so every facet catches the sun differently — that, and three
  // tones alternating, is what turns a row of identical grey balls into scree.
  rock: new THREE.MeshStandardMaterial({ color: 0x9a9187, roughness: 0.96, flatShading: true }),
  rockWarm: new THREE.MeshStandardMaterial({ color: 0xa8977f, roughness: 0.97, flatShading: true }),
  rockDark: new THREE.MeshStandardMaterial({ color: 0x76706a, roughness: 0.94, flatShading: true }),
  // Invisible: colliders and the wade barrier's visible-nothing.
  collider: new THREE.MeshBasicMaterial({ visible: false }),
};

// ---------------------------------------------------------------------------
// Instancing kit — the villa's vocabulary, unchanged. cityBoxes.js reads the
// InstancedMeshes under `world`, so anything the player must collide with goes
// through emit()/flushKits() rather than straight into the scene.
// ---------------------------------------------------------------------------
function addInstancedPrimitive(geometry, material, items, propFlags) {
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
  if (propFlags?.some(Boolean)) im.userData.prop = propFlags;
  world.add(im);
  return im;
}

const G = {
  box: withUV2(new THREE.BoxGeometry(1, 1, 1)),
  cyl: withUV2(new THREE.CylinderGeometry(0.5, 0.5, 1, 16)),
  cylBase: withUV2(new THREE.CylinderGeometry(0.5, 0.5, 1, 16).translate(0, 0.5, 0)),
  sphere: withUV2(new THREE.SphereGeometry(0.5, 14, 10)),
  card: withUV2(new THREE.PlaneGeometry(1, 1)),
  cone: withUV2(new THREE.ConeGeometry(0.5, 1, 14).translate(0, 0.5, 0)),
  // Umbrella canopies want facets, not a smooth cone — a beach parasol is
  // eight panels over eight ribs.
  canopy: withUV2(new THREE.ConeGeometry(0.5, 1, 8).translate(0, 0.5, 0)),
  // Hoist at the origin, flying +X. Used as the pennant on the one free
  // parasol the player can lie under.
  pennant: withUV2((() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([
      0, 0.42, 0,  1.65, 0, 0,  0, -0.42, 0,
    ], 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute([
      0, 0, 1,  0, 0, 1,  0, 0, 1,
    ], 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 1, 1, 0.5, 0, 0], 2));
    g.setIndex([0, 1, 2]);
    return g;
  })()),
  trunk: withUV2(new THREE.CylinderGeometry(0.34, 0.5, 1, 9).translate(0, 0.5, 0)),
  // Half a capsule on its side: every boat hull on this map.
  hull: withUV2(new THREE.SphereGeometry(0.5, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2)
    .rotateX(Math.PI)),
  sailHull: makeSailboatHullGeo(),
  yachtHull: makeYachtHullGeo(),
  mainsail: makeMainsailGeo(0.06),
  jib: makeJibGeo(0.05),
  yachtCabin: makeYachtCabinGeo(),
  radarArch: makeRadarArchGeo(),
  bowRail: makeBowRailGeo(),
  radome: withUV2(new THREE.SphereGeometry(0.5, 12, 8).scale(1, 0.65, 1)),
  disc: withUV2(new THREE.CylinderGeometry(0.5, 0.5, 1, 20)),
  // Grows upward from its base rather than from its centre, so a frond or a
  // leaf card can be pinned where it actually joins the plant.
  blade: withUV2(new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0)),
  surf: makeBoardGeo('surf'),
  skate: makeBoardGeo('skate'),
  lens: withUV2(new THREE.CylinderGeometry(0.5, 0.5, 1, 12).rotateX(Math.PI / 2)),
  // Three boulders, so a scree slope is not one shape repeated.
  rockA: makeRockGeo(0),
  rockB: makeRockGeo(31.7),
  rockC: makeRockGeo(88.1),
};
const ROCKS = [G.rockA, G.rockB, G.rockC];

// Deterministic scatter. The beach must lay itself out identically on every
// load or two screenshots of the "same" view are not comparable, and a bug
// that shows up in one of them cannot be chased in the other. Declared up here
// because the headlands are scattered too, and they are built before the props.
let seed = 20260826 >>> 0;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
const pick = arr => arr[Math.floor(rnd() * arr.length) % arr.length];

const kits = new Map();
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
// Scenery you walk AROUND rather than ON — see the villa's note. Nothing in
// phase 1 needs it yet, but the parasols and coolers of phase 2 will.
let PROP = false;
function prop(fn) {
  const outer = PROP;
  PROP = true;
  fn();
  PROP = outer;
}
function box(mat, x, y, z, sx, sy, sz, ry = 0) {
  const c = Math.cos(FR), s = Math.sin(FR);
  emit(G.box, mat, {
    x: FX + x * c + z * s, y: y + LIFT, z: FZ - x * s + z * c,
    sx, sy, sz, ry: FR + ry,
  });
}
function shape(geo, mat, x, y, z, sx, sy, sz, rot = {}) {
  const c = Math.cos(FR), s = Math.sin(FR);
  emit(geo, mat, {
    x: FX + x * c + z * s, y: y + LIFT, z: FZ - x * s + z * c,
    sx, sy, sz, ry: FR + (rot.ry || 0), rx: rot.rx || 0, rz: rot.rz || 0,
  });
}
function slab(mat, x0, x1, z0, z1, y0, y1) {
  box(mat, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2,
    Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0));
}

// cityBoxes marks any AABB whose footprint exceeds 80 m as NON-COLLIDING. That
// rule is there for the city map's merged districts, and it applies silently to
// anything long — so a 220 m seawall, being one box, was a wall the player
// walked straight through, and the pier's 160 m handrails did not exist. This
// map is built out of long runs, so anything that has to stop the player gets
// chopped into lengths the rule will honour. Floors do not need it (the ground
// probe rays real geometry and never consults the AABBs), but they cost little.
function longSlab(mat, x0, x1, z0, z1, y0, y1, maxSpan = 64) {
  const alongX = Math.abs(x1 - x0) >= Math.abs(z1 - z0);
  const span = alongX ? Math.abs(x1 - x0) : Math.abs(z1 - z0);
  const n = Math.max(1, Math.ceil(span / maxSpan));
  if (n === 1) return slab(mat, x0, x1, z0, z1, y0, y1);
  const a0 = alongX ? Math.min(x0, x1) : Math.min(z0, z1);
  const step = span / n;
  for (let i = 0; i < n; i++) {
    const p = a0 + i * step, q = a0 + (i + 1) * step;
    if (alongX) slab(mat, p, q, z0, z1, y0, y1);
    else slab(mat, x0, x1, p, q, y0, y1);
  }
}

// ---------------------------------------------------------------------------
// Plan constants (metres). Sea is -Z, inland is +Z, so walking -Z walks you
// from the car park into the water. Every band boundary is named because
// phases 2 and 3 place their props against these and nothing else.
// ---------------------------------------------------------------------------
const SEA_Y = 0;              // mean water level — the datum for the whole map
const PROM_Y = 3.2;           // promenade deck, one seawall above the sand
const SUBBASE = 0.45;         // how far the made ground sits below the finished
                              // deck — the thickness the built slabs occupy
const SAND_TOP = 1.55;        // sand at the foot of the seawall

const SEAWALL_Z0 = 27.6;      // sea face of the seawall
const SEAWALL_Z1 = 30.4;      // inland face
const PROM_Z1 = 54;           // inland edge of the promenade. Deep enough to
                              // carry the shop terrace AND leave a walk in
                              // front of it — at 46 the buildings were founded
                              // across the car-park kerb.
const PARK_Z1 = 84;           // back of the car park

const SHORE_Z = -46;          // mean waterline
const SHELF_Z = -96;          // foot of the wading shelf
const SHELF_Y = -3.4;
const WADE_Z = -68;           // invisible barrier — water is ~0.95 m here

const PIER_X = -78;           // pier centre line
const PIER_HALF = 7;          // pier half width
const PIER_Y = 4.0;           // pier deck level, a little above the promenade
const PIER_Z0 = 40;           // inland end (on the promenade)
const PIER_Z1 = -132;         // seaward end
// Anything scattered on the beach or along the walk has to keep out of the
// pier's footprint. A parasol seeded under it put its canopy up through the
// deck and walled the pier off half way along.
const clearOfPier = x => Math.abs(x - PIER_X) > PIER_HALF + 2.5;

// Ferris wheel at the +X end of Ocean Front Walk, past the last shop. The
// terrace finishes at x ≈ 52.5; the wheel stands in the open beyond it so
// walking the shops puts the circle dead ahead. It faces the sea (spins in
// XY about Z) the way the Pacific Wheel does — from the sand you see the
// full disc, from the walk you arrive at its boarding side.
const FERRIS_X = 70;
const FERRIS_Z = 38.2;
const FERRIS_R = 12.2;
const FERRIS_N = 16;              // gondolas around the rim
const FERRIS_HUB_Y = PROM_Y + FERRIS_R + 1.55;
const FERRIS_WEST = FERRIS_X - FERRIS_R - 6;
const FERRIS_EAST = FERRIS_X + FERRIS_R + 6;
const clearOfFerris = (x, z) =>
  Math.abs(x - FERRIS_X) > FERRIS_R + 5.5 || Math.abs(z - FERRIS_Z) > 8;

const BEACH_HALF_W = 150;     // sand runs ±150 m before the headlands close in
const PROM_HALF_W = 110;      // built promenade is shorter than the sand

// ---------------------------------------------------------------------------
// Terrain. Analytic, because groundFn evaluates it directly rather than raying
// the mesh — the villa's note explains why (an 80 000-triangle ground plane
// costs more per ray than the entire rest of the map).
// ---------------------------------------------------------------------------
// The waterline is not a ruled line — the bay bows in and out along its length.
// Nothing else needs to know the shape: the wet band and the foam find the
// water by HEIGHT rather than by Z (see shoreAlpha), so they follow whatever
// this does for free.
function shoreAt(x) {
  return SHORE_Z + Math.sin(x * 0.0163) * 5.5 + Math.cos(x * 0.0071) * 3.5;
}

// How much of a bluff we are on, 0 on the open beach to 1 up the headland.
// Pulled out of terrainHeight because the terrain's VERTEX COLOURS need the
// same number: the whole beach is one mesh with one sand material, so tinting
// the bluffs is the only way to stop them reading as more dunes. Damped
// offshore so they do not surface again as islands out at the fog line.
function headlandAt(x, z) {
  const head = THREE.MathUtils.smoothstep(Math.abs(x), BEACH_HALF_W, BEACH_HALF_W + 34);
  if (head <= 0.001) return 0;
  return head * (1 - THREE.MathUtils.smoothstep(-z, 60, 190));
}

function terrainHeight(x, z) {
  let y;
  const shore = shoreAt(x);
  if (z >= SEAWALL_Z0) {
    // Made ground, and deliberately the SUB-BASE rather than the finished
    // level: the promenade deck and the car park asphalt are built slabs laid
    // on top of this, so the terrain has to sit under them. Returning PROM_Y
    // here instead buries both and parks the cars on sand.
    y = PROM_Y - SUBBASE;
  } else if (z >= shore) {
    // Dry sand. Real beaches are concave — steeper at the berm below the wall,
    // flattening as they reach the water — so the profile is eased, not linear.
    const t = (z - shore) / (SEAWALL_Z0 - shore);
    y = SEA_Y + (SAND_TOP - SEA_Y) * (t * t * 0.55 + t * 0.45);
  } else {
    // Sea floor: a gentle wading shelf that steepens past the swimmers.
    const t = THREE.MathUtils.clamp((shore - z) / (shore - SHELF_Z), 0, 1);
    y = SEA_Y + (SHELF_Y - SEA_Y) * (t * 0.35 + t * t * 0.65);
    // Past the shelf the bed keeps falling away so the far water reads deep.
    if (z < SHELF_Z) y += (z - SHELF_Z) * 0.09;
  }

  // Headlands close the bay left and right: they stop the sand running to the
  // horizon, and they stop the player walking out of the map sideways. Damped
  // offshore so they do not surface again as islands out at the fog line.
  const hf = headlandAt(x, z);
  if (hf > 0.001) {
    y += hf * 34;
    // Gullies and shoulders. Without this the bluff is a perfectly smooth
    // ramp, and no amount of rock scattered over a smooth ramp stops it
    // reading as a dune with things sitting on it.
    y += hf * (Math.sin(x * 0.045) * 2.6 + Math.cos(z * 0.038) * 2.2
      + Math.sin((x * 0.9 - z) * 0.021) * 3.4);
  }

  // Dune roll — sand is never a plane. Damped by HEIGHT ABOVE WATER rather
  // than by distance from the shore: keyed to z it pushed troughs below sea
  // level near the waterline, and the sea plane surfaced through them as
  // angular puddles scattered over the dry sand.
  const dry = THREE.MathUtils.smoothstep(y, SEA_Y + 0.2, SEA_Y + 1.1)
            * (1 - THREE.MathUtils.smoothstep(z, SEAWALL_Z0 - 12, SEAWALL_Z0));
  if (dry > 0.001) {
    y += (Math.sin(x * 0.061) * 0.34 + Math.cos(z * 0.088) * 0.2
        + Math.sin((x + z) * 0.037) * 0.16) * dry;
  }
  return y;
}

const terrain = new THREE.Mesh(
  withUV2(new THREE.PlaneGeometry(900, 900, 220, 220)),
  M.sand
);
{
  const pos = terrain.geometry.getAttribute('position');
  const col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    // The plane is built in XY then rotated, so its local Y is world -Z.
    const wx = pos.getX(i), wz = -pos.getY(i);
    pos.setZ(i, terrainHeight(wx, wz));
    // Tint the bluffs off the sand's white: dry scrub over rock, not beach.
    const t = THREE.MathUtils.smoothstep(headlandAt(wx, wz), 0.04, 0.46);
    col[i * 3] = THREE.MathUtils.lerp(1, 0.58, t);
    col[i * 3 + 1] = THREE.MathUtils.lerp(1, 0.55, t);
    col[i * 3 + 2] = THREE.MathUtils.lerp(1, 0.42, t);
  }
  terrain.geometry.setAttribute('color', new THREE.BufferAttribute(col, 3));
  terrain.geometry.computeVertexNormals();
  terrain.rotation.x = -Math.PI / 2;
  terrain.receiveShadow = true;
  world.add(terrain);
}

// A strip of geometry laid ON the sand and following it. `alphaFor` receives
// each vertex's SIGNED DISTANCE UP THE BEACH from the waterline, which is how
// the wet band and the foam stay glued to a shore that bows along the bay.
// Height above water was the obvious measure and the wrong one: this beach
// climbs about 2 cm per metre, so a band defined as "under 60 cm" is forty
// metres wide and runs off the end of its own geometry with a hard edge.
function conformedStrip(mat, x0, x1, z0, z1, lift, segX, segZ, alphaFor, floatOnWater) {
  const g = withUV2(new THREE.PlaneGeometry(x1 - x0, z1 - z0, segX, segZ));
  const pos = g.getAttribute('position');
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  const colors = alphaFor ? new Float32Array(pos.count * 4) : null;
  const aD = new Float32Array(pos.count);
  const aX = new Float32Array(pos.count);
  for (let i = 0; i < pos.count; i++) {
    const wx = cx + pos.getX(i);
    const wz = cz - pos.getY(i);
    // Foam has to ride the WATER once it is past the waterline. Following the
    // bed instead put the breaking lines half a metre under the surface, where
    // the sea plane's depth write hid them completely — which is why the surf
    // kept looking invisible however far its opacity was pushed up.
    const bed = terrainHeight(wx, wz);
    const h = floatOnWater ? Math.max(bed, SEA_Y) : bed;
    pos.setZ(i, h + lift);
    aD[i] = wz - shoreAt(wx);
    aX[i] = wx;
    if (colors) {
      colors[i * 4] = colors[i * 4 + 1] = colors[i * 4 + 2] = 1;
      colors[i * 4 + 3] = alphaFor(aD[i]);
    }
  }
  // The surf shaders need to know, per vertex, how far up the beach it is and
  // where along the bay — the swash is driven from those two numbers alone.
  g.setAttribute('aD', new THREE.BufferAttribute(aD, 1));
  g.setAttribute('aX', new THREE.BufferAttribute(aX, 1));
  if (colors) g.setAttribute('color', new THREE.BufferAttribute(colors, 4));
  g.computeVertexNormals();
  const mesh = new THREE.Mesh(g, mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(cx, 0, cz);
  mesh.receiveShadow = true;
  return mesh;
}

// Wet sand: the band the wash has just left, opaque at the water and gone by
// the time the sand is half a metre clear of it. Added to `scene`, not
// `world` — it is a skin on ground that already collides, and giving
// cityBoxes a second AABB at the same height would only slow the ground probe.
// `d` is metres up the beach from the water: soaked for the first few metres,
// dry by ten. Capped below 1 so the dry sand always shows through and the
// band tints the beach rather than replacing it.
// The alpha here is only a base wetness — how far up the sand is actually
// dark is decided per frame by the swash's high-water mark (see uHigh below).
const wetBand = conformedStrip(
  M.wetSand, -BEACH_HALF_W, BEACH_HALF_W, -70, -14, 0.035, 130, 50,
  () => 0.85,
);
scene.add(wetBand);

// ---------------------------------------------------------------------------
// The corniche — seawall, steps, promenade deck, car park.
// ---------------------------------------------------------------------------

// Seawall: a solid mass from below the sand up to deck level. Solid is the
// point — it is what stops you strolling up off the beach anywhere except at
// the steps, which is what gives the promenade its own edge. The sea face is
// cut at every flight (and the ramp): leave it running through and the wall's
// AABB is a 4 m face sitting on the last tread, so the controller reads a wall
// one step short of the deck the same way the capping course used to.
const STAIRS = [-62, 0, 62];
const STAIR_HALF = 3.4;
const RAMP_X0 = 30, RAMP_X1 = 38;
{
  const gaps = STAIRS.map(sx => [sx - STAIR_HALF - 0.05, sx + STAIR_HALF + 0.05])
    .concat([[RAMP_X0 - 0.05, RAMP_X1 + 0.05]])
    .sort((p, q) => p[0] - q[0]);
  let cx = -PROM_HALF_W;
  for (const [g0, g1] of gaps) {
    if (g0 > cx) {
      longSlab(M.seawall, cx, g0, SEAWALL_Z0, SEAWALL_Z1, SAND_TOP - 2.4, PROM_Y);
    }
    // Behind the treads the wall still has thickness, so the promenade does
    // not open a hole you can walk through. The treads themselves end at
    // SEAWALL_Z0 + 0.1; overlap them so the landing is continuous.
    longSlab(M.seawall, g0, g1, SEAWALL_Z0 + 0.08, SEAWALL_Z1, SAND_TOP - 2.4, PROM_Y);
    cx = Math.max(cx, g1);
  }
  if (cx < PROM_HALF_W) {
    longSlab(M.seawall, cx, PROM_HALF_W, SEAWALL_Z0, SEAWALL_Z1, SAND_TOP - 2.4, PROM_Y);
  }
}

// Capping course, proud of the face — the ledge people sit on. It STOPS at
// every opening, and that is not cosmetic: run through, this 14 cm lip sat
// 53 cm above the last tread, and 53 cm is over the controller's 50 cm
// step-up. The controller therefore read it as a wall and pushed the player
// back one step short of the top, so not one of the three flights could be
// climbed. A capping course does not run across a staircase in life either.
{
  const gaps = STAIRS.map(sx => [sx - STAIR_HALF - 0.25, sx + STAIR_HALF + 0.25])
    .concat([[RAMP_X0 - 0.25, RAMP_X1 + 0.25]])
    .sort((p, q) => p[0] - q[0]);
  let cx = -PROM_HALF_W;
  for (const [g0, g1] of gaps) {
    if (g0 > cx) {
      longSlab(M.kerb, cx, g0, SEAWALL_Z0 - 0.18, SEAWALL_Z1 + 0.18, PROM_Y, PROM_Y + 0.14);
    }
    cx = Math.max(cx, g1);
  }
  if (cx < PROM_HALF_W) {
    longSlab(M.kerb, cx, PROM_HALF_W, SEAWALL_Z0 - 0.18, SEAWALL_Z1 + 0.18, PROM_Y, PROM_Y + 0.14);
  }
}

// Eight treads per flight, each well under the 50 cm step-up. Five treads
// made a 43 cm riser — climbable once the controller stopped treating the
// face as a wall, but still a hop, and where the sand sat low the first
// riser used to overshoot 50 cm and refuse to be entered at all. Start the
// flight below its own patch of sand so the bottom tread is a kerb, not a
// wall. Treads are deeper than the capsule radius so a foot actually fits.
const STAIR_N = 8;
const STAIR_TREAD = 0.70;
for (const sx of STAIRS) {
  const nose = SEAWALL_Z0 - STAIR_N * STAIR_TREAD;
  const base = terrainHeight(sx, nose) - 0.12;
  const rise = (PROM_Y - base) / STAIR_N;
  for (let i = 0; i < STAIR_N; i++) {
    const top = base + (i + 1) * rise;
    const z0 = SEAWALL_Z0 - (STAIR_N - i) * STAIR_TREAD;
    slab(M.seawall, sx - STAIR_HALF, sx + STAIR_HALF, z0, SEAWALL_Z0 + 0.1, base - 1.6, top);
  }
}
// One ramp, because a promenade with only steps has no skaters on it and phase
// 3 wants skaters. 1:12, run out onto the sand.
{
  const rx0 = RAMP_X0, rx1 = RAMP_X1;
  const steps = 14;
  for (let i = 0; i < steps; i++) {
    const t0 = i / steps, t1 = (i + 1) / steps;
    const z0 = SEAWALL_Z0 - 20 * (1 - t0);
    const z1 = SEAWALL_Z0 - 20 * (1 - t1);
    const top = SAND_TOP + (PROM_Y - SAND_TOP) * t1;
    slab(M.seawall, rx0, rx1, z1, z0 + 0.05, SAND_TOP - 1.4, top);
  }
}

// Promenade deck. Poured onto the sub-base, so it reaches below it — a slab
// whose underside floats is a slab you can see under from the steps.
longSlab(M.promenade, -PROM_HALF_W, PROM_HALF_W, SEAWALL_Z1, PROM_Z1, PROM_Y - SUBBASE - 0.2, PROM_Y);

// Car park behind it, one kerb lower, and the kerb between the two.
longSlab(M.asphalt, -PROM_HALF_W, PROM_HALF_W, PROM_Z1, PARK_Z1, PROM_Y - SUBBASE - 0.2, PROM_Y - 0.06);
longSlab(M.kerb, -PROM_HALF_W, PROM_HALF_W, PROM_Z1 - 0.16, PROM_Z1, PROM_Y - SUBBASE - 0.2, PROM_Y + 0.02);
// Bay markings — two rows, nose to nose.
for (let i = -11; i <= 11; i++) {
  slab(M.paint, i * 2.6 - 0.06, i * 2.6 + 0.06, PROM_Z1 + 2, PROM_Z1 + 7, PROM_Y - 0.05, PROM_Y - 0.035);
  slab(M.paint, i * 2.6 - 0.06, i * 2.6 + 0.06, PROM_Z1 + 13, PROM_Z1 + 18, PROM_Y - 0.05, PROM_Y - 0.035);
}

// ---------------------------------------------------------------------------
// The travel car. Same contract as the villa's: park it, give it a collider,
// and hang a `travel` interaction off it. From the beach there is exactly one
// destination — back to the villa — so the prompt group carries one row.
// ---------------------------------------------------------------------------
const parkedCars = [];
function parkCar(type, color, x, z, ry, ground, opts) {
  const mesh = buildCar(type, color, opts);
  mesh.position.set(x, ground, z);
  mesh.rotation.y = ry;
  world.add(mesh);
  parkedCars.push(mesh);
  const b = carBounds(type);
  frame(x, z, ry, () => box(M.collider, 0, ground + b.height / 2, 0, b.length, b.height, b.width));
  return mesh;
}

const BEACH_TRAVEL_CAR = Object.freeze({
  type: 'suv', x: -6.0, z: 56.5, yaw: Math.PI / 2, ground: PROM_Y - 0.06,
});
const beachTravelCar = parkCar(
  BEACH_TRAVEL_CAR.type, 0xb8bec6, BEACH_TRAVEL_CAR.x, BEACH_TRAVEL_CAR.z,
  BEACH_TRAVEL_CAR.yaw, BEACH_TRAVEL_CAR.ground, { metallic: false },
);
const beachTravelBounds = carBounds(BEACH_TRAVEL_CAR.type);
const beachTravelInteraction = {
  type: 'travel',
  x: BEACH_TRAVEL_CAR.x,
  y: BEACH_TRAVEL_CAR.ground,
  z: BEACH_TRAVEL_CAR.z,
  centerX: BEACH_TRAVEL_CAR.x,
  centerZ: BEACH_TRAVEL_CAR.z,
  approachY: BEACH_TRAVEL_CAR.ground + 0.5,
  yaw: BEACH_TRAVEL_CAR.yaw,
  halfWidth: beachTravelBounds.length / 2,
  halfDepth: beachTravelBounds.width / 2,
  triggerDistance: 1.25,
};

// A couple of parked cars for company.
parkCar('coupe', 0x1b2b4d, 8.5, 56.5, Math.PI / 2, PROM_Y - 0.06);
parkCar('coupe', 0xb03a2e, 21, 56.5, Math.PI / 2, PROM_Y - 0.06);

// ===========================================================================
// PHASE 2 — the beach furnished.
//
// Every prop belongs to exactly one band, which is what makes this cheap: a
// kiosk knows only the promenade's height, a parasol knows only the sand's.
// Nothing here needs to know about anything else here.
// ===========================================================================

// Drop a group onto whatever the ground is doing at (x, z). Everything on the
// sand needs this — the beach rolls, and a prop authored around its own origin
// and planted at a fixed height either floats or sinks into the dunes.
function onGround(x, z, ry, fn) {
  const prev = LIFT;
  LIFT = terrainHeight(x, z);
  frame(x, z, ry, fn);
  LIFT = prev;
}
// Same, at a known height: the promenade, or the pier deck.
function atY(y, x, z, ry, fn) {
  const prev = LIFT;
  LIFT = y;
  frame(x, z, ry, fn);
  LIFT = prev;
}
const onDeck = (x, z, ry, fn) => atY(PROM_Y, x, z, ry, fn);

const FABRICS = [M.fabricRed, M.fabricBlue, M.fabricYellow, M.fabricGreen, M.fabricPink];

// ---------------------------------------------------------------------------
// Palms. Not marked as props: a palm's collision volume is mostly crown, and
// the crown sits eight metres up where nobody walks — the trunk's own box is
// what you actually bump into, and that comes for free.
// ---------------------------------------------------------------------------
function palm(h) {
  shape(G.trunk, M.bark, 0, 0, 0, 0.42, h, 0.42, { ry: rnd() * 3, rz: (rnd() - 0.5) * 0.09 });
  // Fronds are CARDS with a cut alpha, not cones. A cone is a spike, and
  // twelve spikes on a pole is an agave — which is what these trees were.
  const n = 11;
  for (let i = 0; i < n; i++) {
    const spin = (i / n) * Math.PI * 2 + rnd() * 0.32;
    // Real fronds arch over and hang; upright cards read as a star.
    const tilt = 0.86 + ((i % 3) * 0.33);
    shape(G.blade, i % 8 === 0 ? M.frondCardDry : M.frondCard,
      0, h - 0.25, 0, 2.5 + rnd() * 0.5, 3.5 + (i % 2) * 0.7, 1,
      { ry: spin, rx: tilt });
  }
  // Dead skirt hanging under the crown — a palm is never a clean lollipop.
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + 0.4;
    shape(G.blade, M.frondCardDry, 0, h - 0.45, 0, 1.5, 1.9, 1,
      { ry: a, rx: 2.55 });
  }
}

// ---------------------------------------------------------------------------
// Dune planting. Marram grass and low scrub — the two things that actually
// grow on a coastal bluff, and the two things whose absence made the headlands
// read as bare desert with pebbles rolled onto it.
// ---------------------------------------------------------------------------
function duneGrass(s) {
  for (let i = 0; i < 15; i++) {
    const a = (i / 11) * Math.PI * 2 + rnd() * 0.8;
    const r = rnd() * s * 0.2;
    shape(G.blade, M.duneGrass, Math.cos(a) * r, 0, Math.sin(a) * r,
      s * (0.1 + rnd() * 0.07), s * (0.75 + rnd() * 0.6), 1,
      { ry: a + rnd(), rx: 0.16 + rnd() * 0.42 });
  }
}
// Dressing the bluffs: scree, marram grass and low scrub, all of it in
// CLUSTERS. An even scatter reads as polka dots however good the individual
// rock is — real scree collects in gullies and real scrub grows in patches.
// Boulder centres go at or just under the surface so they emerge from the
// slope; sitting them proud is what made them look like beads on a dune.
function scree(x, z, s) {
  const g = terrainHeight(x, z);
  shape(pick(ROCKS), pick([M.rock, M.rockWarm, M.rockDark]),
    x, g - s * 0.16, z,
    s * (0.85 + rnd() * 0.5), s * (0.45 + rnd() * 0.3), s * (0.8 + rnd() * 0.45),
    { ry: rnd() * 3, rz: (rnd() - 0.5) * 0.34, rx: (rnd() - 0.5) * 0.24 });
}
for (const side of [-1, 1]) {
  for (let c = 0; c < 34; c++) {
    const ccx = side * (BEACH_HALF_W - 8 + rnd() * 62);
    const ccz = -84 + rnd() * 220;
    if (terrainHeight(ccx, ccz) < SEA_Y + 0.5) continue;
    const kind = rnd();
    const n = 5 + Math.floor(rnd() * 8);
    const spread = 5 + rnd() * 11;
    for (let i = 0; i < n; i++) {
      const a = rnd() * Math.PI * 2;
      const r = Math.pow(rnd(), 0.65) * spread;
      const x = ccx + Math.cos(a) * r;
      const z = ccz + Math.sin(a) * r;
      if (terrainHeight(x, z) < SEA_Y + 0.25) continue;
      if (kind < 0.42) {
        scree(x, z, 1.5 + rnd() * 5.0);
        // Gravel shed off the big ones, which is what ties them to the ground.
        if (rnd() < 0.6) scree(x + (rnd() - 0.5) * 4, z + (rnd() - 0.5) * 4, 0.6 + rnd() * 1.1);
      } else if (kind < 0.76) {
        onGround(x, z, 0, () => duneGrass(1.7 + rnd() * 2.0));
      } else {
        onGround(x, z, 0, () => coastalBush(2.4 + rnd() * 3.4));
      }
    }
  }
  // A continuous apron of boulders where the bluff meets the water — the toe
  // is always the rockiest part, and it is what the pier looks out at.
  for (let i = 0; i < 40; i++) {
    const x = side * (BEACH_HALF_W - 14 + rnd() * 30);
    const z = -72 + rnd() * 60;
    if (terrainHeight(x, z) < SEA_Y - 1.2) continue;
    scree(x, z, 1.4 + rnd() * 5.4);
  }
}

function coastalBush(s) {
  // A woody core, then leaf cards fanned around it. The core alone is the blob
  // we are trying to get rid of, so it stays small and mostly hidden.
  for (let i = 0; i < 3; i++) {
    const a = rnd() * Math.PI * 2;
    const r = rnd() * s * 0.16;
    shape(pick(ROCKS), M.scrub, Math.cos(a) * r, s * 0.2, Math.sin(a) * r,
      s * 0.55, s * 0.4, s * 0.55, { ry: rnd() * 3 });
  }
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + rnd() * 0.5;
    const r = s * (0.1 + rnd() * 0.16);
    shape(G.blade, M.bushCard, Math.cos(a) * r, s * 0.05, Math.sin(a) * r,
      s * (0.7 + rnd() * 0.4), s * (0.55 + rnd() * 0.35), 1,
      { ry: a + Math.PI / 2, rx: -0.1 + rnd() * 0.3 });
  }
}

// ---------------------------------------------------------------------------
// Promenade furniture.
// ---------------------------------------------------------------------------
function bench() {
  for (const dx of [-0.78, 0.78]) {
    box(M.kioskTrim, dx, 0.22, 0, 0.1, 0.44, 0.62);
    box(M.kioskTrim, dx, 0.56, -0.26, 0.1, 0.56, 0.09);
  }
  for (let i = 0; i < 4; i++) box(M.deckWood, 0, 0.46, -0.21 + i * 0.15, 1.9, 0.06, 0.12);
  for (let i = 0; i < 3; i++) box(M.deckWood, 0, 0.62 + i * 0.17, -0.29, 1.9, 0.12, 0.06);
}
function bin() {
  shape(G.cylBase, M.kioskTrim, 0, 0, 0, 0.5, 0.86, 0.5);
  shape(G.cyl, M.black, 0, 0.9, 0, 0.54, 0.08, 0.54);
}
// Promenade lamp. Doubles as the only web anchor on the corniche, which is why
// it is a real mast rather than a bollard.
function lampPost(h = 5.2) {
  shape(G.cylBase, M.steel, 0, 0, 0, 0.16, h, 0.16);
  shape(G.cyl, M.steel, 0, h, 0, 0.2, 0.08, 0.2);
  for (const dx of [-0.56, 0.56]) {
    box(M.steel, dx, h + 0.05, 0, 0.62, 0.07, 0.07);
    shape(G.sphere, M.lampGlass, dx, h - 0.06, 0, 0.3, 0.32, 0.3);
  }
}
// Beach shower: what you actually find at the foot of every set of steps.
function shower() {
  shape(G.cylBase, M.steel, 0, 0, 0, 0.14, 2.5, 0.14);
  box(M.steel, 0, 2.42, 0.3, 0.1, 0.1, 0.62);
  shape(G.cyl, M.steel, 0, 2.32, 0.58, 0.3, 0.08, 0.3);
  shape(G.disc, M.concreteSlab, 0, 0.02, 0.3, 2.2, 0.06, 2.2);
}

// ---------------------------------------------------------------------------
// Ocean Front Walk. Researched rather than invented, because the row of tidy
// detached huts this replaced was a European seafront, not an L.A. one. What
// the real strip is:
//
//   * ONE continuous two-storey terrace, party wall to party wall
//   * an Italianate ARCADE at street level — round arches on columns with
//     capitals. That colonnade is the surviving signature of Abbot Kinney's
//     1905 "Venice of America"; the Windward Avenue arcade is Los Angeles
//     Historic-Cultural Monument #532
//   * names PAINTED ON THE FASCIA, flush, in the shop's own colours — nobody
//     on that boardwalk hangs a tidy panel out over the walk
//   * murals straight onto the upper storey, whole facades painted bold
//   * stock spilling out under the arches: tee racks, sunglasses spinners
//   * independent vendor stalls under pop-up canopies out on the walk itself,
//     which is where the artists and jewellers actually trade
//
// The trades are the ones on that strip: tattoo and piercing, surf and skate,
// sunglasses "2 for $10", tees "3 for $10", henna, pizza by the slice,
// vintage, souvenirs.
// ---------------------------------------------------------------------------
const SHOP_Z = 44.0;              // front face of the terrace
// Skate lane. Palms sit at z=33.2; the pop-up tents (3 m deep) sit around
// z=36. The lane has to be inland of the tent backs, not through them.
const SKATE_Z = 40.9;
const SHOP_D = 7.2;               // depth of the block
const ARC_D = 2.4;                // depth of the arcade in front of the glass
// Where the stools are, shared by the shop fittings AND by the people sitting
// on them. The sitters used to carry their own hand-tuned Z and ended up 1.6 m
// in front of the stools, sitting on thin air. `dz` is relative to `zf` inside
// the shop frame; `top` is the seat surface above the promenade.
const STOOL = {
  henna: { dz: -0.95, top: 0.70, xs: [-1.6, 0, 1.6] },
  pizza: { dz: -1.25, top: 0.795, xs: [-2.5, 2.5] },
};
// zf is -SHOP_D/2 + 0.45 and the frame origin is SHOP_Z + SHOP_D/2, so the two
// halves of the depth cancel and a stool lands here:
const stoolZ = dz => SHOP_Z + 0.45 + dz;
const GF = 5.4;                   // underside of the fascia. A round arch over
                                  // a 4 m bay crowns 2 m above its springing,
                                  // so a 3.7 m ground floor buried the whole
                                  // colonnade inside its own soffit. These
                                  // arcades are double height in life too.
const FASCIA = 1.0;               // painted name band
const UF = 3.1;                   // upper storey
const PARAPET = 0.55;

// Beach paint: saturated and warm. The first pass put the names on dark navy
// plaques, which is municipal signage on an English pier — nothing on Ocean
// Front Walk is that colour and nothing on it is that tidy.
const PALETTE = [
  '#f0e4c8',  // bleached cream
  '#2fa08f',  // turquoise
  '#e0533c',  // vermilion
  '#f2b12e',  // sunflower
  '#4d95c8',  // sky (a beach blue, not a navy)
  '#c060a0',  // orchid
];
const STUCCO = PALETTE.map(c => new THREE.MeshStandardMaterial({
  color: new THREE.Color(c), roughness: 0.9,
}));

// `ink` is the lettering. There is no background colour because there is no
// background: the name is painted straight onto the unit's own paint.
const SHOPS = [
  { w: 12.5, label: 'VENICE TATTOO',        kind: 'tattoo',   c: 5, ink: '#2a1430' },
  { w: 10.5, label: 'SUNGLASSES 2 FOR $10', kind: 'shades',   c: 1, ink: '#fff6df' },
  { w: 13.0, label: 'T-SHIRTS 3 FOR $10',   kind: 'tees',     c: 2, ink: '#fff2c8' },
  { w: 12.0, label: 'SURF + SKATE',         kind: 'surf',     c: 4, ink: '#fffaf0' },
  { w: 10.0, label: 'HENNA & PIERCING',     kind: 'henna',    c: 3, ink: '#5e2a10' },
  { w: 12.5, label: 'PIZZA BY THE SLICE',   kind: 'pizza',    c: 0, ink: '#c62828' },
  { w: 11.0, label: 'BOARDWALK VINTAGE',    kind: 'vintage',  c: 5, ink: '#fff4e2' },
  { w: 11.5, label: 'VENICE SOUVENIRS',     kind: 'souvenir', c: 2, ink: '#fff0c4' },
];

// A mural, painted straight onto the upper storey. Venice's walls are its
// best-known surface, and a blank stucco band above the arcade is the one
// thing that would have given the whole terrace away as a model.
function makeMuralTexture(salt) {
  const W = 1280, H = 256;
  const c = Object.assign(document.createElement('canvas'), { width: W, height: H });
  const g = c.getContext('2d');
  let sd = (salt * 2654435761) >>> 0;
  const r = () => ((sd = (sd * 1664525 + 1013904223) >>> 0) / 4294967296);
  const PAL = [
    ['#f4a23c', '#e2543f', '#2f8fa8', '#f2e2c0', '#243a52'],
    ['#57b9a6', '#f0d05a', '#e0603f', '#2a3f52', '#f6f0dc'],
    ['#8a5fb0', '#f27a9a', '#f4cf5e', '#2c8fb5', '#1e2438'],
  ][salt % 3];
  g.fillStyle = PAL[4];
  g.fillRect(0, 0, W, H);
  // A sun low over bands of water — the motif every beach mural comes back to.
  const sunX = 120 + r() * 1040, sunY = H * (0.34 + r() * 0.2), sunR = 40 + r() * 34;
  g.fillStyle = PAL[1];
  g.beginPath();
  g.arc(sunX, sunY, sunR, 0, Math.PI * 2);
  g.fill();
  for (let i = 0; i < 9; i++) {
    g.fillStyle = i % 2 ? PAL[0] : PAL[3];
    g.globalAlpha = 0.75 - i * 0.05;
    g.fillRect(0, sunY + sunR * 0.3 + i * 11, W, 7);
  }
  g.globalAlpha = 1;
  // Big loose strokes over the top, the way a wall actually gets painted.
  for (let i = 0; i < 7; i++) {
    g.strokeStyle = PAL[Math.floor(r() * 4)];
    g.lineWidth = 7 + r() * 22;
    g.lineCap = 'round';
    g.beginPath();
    const x0 = r() * W, y0 = r() * H;
    g.moveTo(x0, y0);
    g.bezierCurveTo(x0 + (r() - 0.5) * 260, y0 + (r() - 0.5) * 190,
      x0 + (r() - 0.5) * 260, y0 + (r() - 0.5) * 190,
      x0 + (r() - 0.5) * 320, y0 + (r() - 0.5) * 200);
    g.stroke();
  }
  for (let i = 0; i < 22; i++) {
    g.fillStyle = PAL[Math.floor(r() * 5)];
    g.globalAlpha = 0.5 + r() * 0.5;
    const w = 12 + r() * 46;
    g.fillRect(r() * W, r() * H, w, w * (0.25 + r() * 0.5));
  }
  g.globalAlpha = 1;
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = maxAniso;
  return t;
}
const MURALS = [0, 1, 2, 3, 4].map(i => new THREE.MeshStandardMaterial({
  map: makeMuralTexture(i), roughness: 0.94, metalness: 0,
}));

// Merchandise prints. Ocean Front Walk's stock is GRAPHIC: Venice / California
// tees, painted boards, tattoo flash, 3-for-$10 piles. A flat colour card
// cannot carry a slogan, so these are canvases the same way the fascia is.
function canvasMat(W, H, draw, opts = {}) {
  const c = Object.assign(document.createElement('canvas'), { width: W, height: H });
  draw(c.getContext('2d'), W, H);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = maxAniso;
  return new THREE.MeshStandardMaterial({
    map: t, roughness: opts.roughness ?? 0.82, metalness: 0,
    side: opts.side ?? THREE.DoubleSide,
    transparent: !!opts.transparent, alphaTest: opts.alphaTest ?? 0,
  });
}
function paintText(g, text, x, y, px, fill, stroke) {
  g.font = `bold ${px}px "Arial Black", Impact, sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  if (stroke) { g.lineWidth = Math.max(2, px * 0.08); g.strokeStyle = stroke; g.strokeText(text, x, y); }
  g.fillStyle = fill;
  g.fillText(text, x, y);
}

const TEE_MATS = [
  canvasMat(256, 320, (g, W, H) => {
    g.fillStyle = '#151515'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#2a8f7a';
    g.beginPath(); g.moveTo(W * 0.5, 48); g.lineTo(W * 0.38, 150); g.lineTo(W * 0.62, 150); g.fill();
    g.fillStyle = '#1e6e5c';
    g.beginPath(); g.ellipse(W * 0.5, 168, 54, 22, 0, 0, Math.PI * 2); g.fill();
    paintText(g, 'VENICE', W / 2, 214, 36, '#f4ead0');
    paintText(g, 'BEACH', W / 2, 252, 32, '#f4ead0');
    paintText(g, 'CALIFORNIA', W / 2, 286, 14, '#e8b23c');
  }),
  canvasMat(256, 320, (g, W, H) => {
    g.fillStyle = '#f4efe4'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#e07030';
    g.beginPath(); g.arc(W / 2, 120, 52, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#4d95c8';
    for (let i = 0; i < 5; i++) g.fillRect(0, 150 + i * 16, W, 8);
    paintText(g, 'VENICE', W / 2, 250, 34, '#1e2a44');
  }),
  canvasMat(256, 320, (g, W, H) => {
    g.fillStyle = '#c42c28'; g.fillRect(0, 0, W, H);
    paintText(g, 'CALI', W / 2, 120, 64, '#fff6df', '#7a1814');
    paintText(g, 'FORNIA', W / 2, 178, 40, '#fff6df', '#7a1814');
    paintText(g, 'est. 1905', W / 2, 240, 18, '#f2b12e');
  }),
  canvasMat(256, 320, (g, W, H) => {
    g.fillStyle = '#1e4a78'; g.fillRect(0, 0, W, H);
    g.strokeStyle = '#7ec8e8'; g.lineWidth = 6;
    g.beginPath(); g.moveTo(20, 160); g.quadraticCurveTo(80, 80, 140, 150);
    g.quadraticCurveTo(190, 210, 240, 120); g.stroke();
    paintText(g, 'SURF', W / 2, 240, 42, '#f4ead0');
    paintText(g, '+ SKATE', W / 2, 278, 22, '#e8b23c');
  }),
  canvasMat(256, 320, (g, W, H) => {
    g.fillStyle = '#1a1a1a'; g.fillRect(0, 0, W, H);
    paintText(g, 'MUSCLE', W / 2, 130, 32, '#f4ead0');
    paintText(g, 'BEACH', W / 2, 175, 40, '#e0533c');
    g.fillStyle = '#f4ead0'; g.fillRect(40, 210, W - 80, 4);
    paintText(g, 'VENICE  CA', W / 2, 250, 16, '#f2b12e');
  }),
  canvasMat(256, 320, (g, W, H) => {
    g.fillStyle = '#e8b23c'; g.fillRect(0, 0, W, H);
    paintText(g, '3 FOR', W / 2, 120, 36, '#1e2a44');
    paintText(g, '$10', W / 2, 185, 72, '#c42c28');
    paintText(g, 'TEES', W / 2, 250, 28, '#1e2a44');
  }),
];

const BOARD_MATS = [
  canvasMat(128, 512, (g, W, H) => {
    g.fillStyle = '#f4ead0'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#e0533c'; g.fillRect(0, 0, W, H * 0.22);
    g.fillStyle = '#f2b12e'; g.fillRect(0, H * 0.22, W, H * 0.16);
    g.fillStyle = '#2fa08f'; g.fillRect(0, H * 0.38, W, H * 0.28);
    g.fillStyle = '#4d95c8'; g.fillRect(0, H * 0.66, W, H * 0.34);
    paintText(g, 'VENICE', W / 2, H * 0.52, 22, '#fff6df');
  }),
  canvasMat(128, 512, (g, W, H) => {
    g.fillStyle = '#1e2a44'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#e07030';
    g.beginPath(); g.arc(W / 2, H * 0.28, 36, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#4d95c8'; g.fillRect(0, H * 0.5, W, H * 0.5);
    paintText(g, 'PACIFIC', W / 2, H * 0.72, 16, '#f4ead0');
  }),
  canvasMat(128, 512, (g, W, H) => {
    g.fillStyle = '#c42c28'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#151515'; g.fillRect(W * 0.38, 0, W * 0.24, H);
    paintText(g, 'DOGTOWN', W / 2, H * 0.5, 14, '#f4ead0');
  }),
  canvasMat(128, 512, (g, W, H) => {
    g.fillStyle = '#2fa08f'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#f4ead0';
    for (let i = 0; i < 8; i++) g.fillRect(0, 40 + i * 58, W, 8);
    paintText(g, 'MOLLUSK', W / 2, H * 0.55, 14, '#1e2a44');
  }),
];

const DECK_MATS = [
  canvasMat(256, 80, (g, W, H) => {
    g.fillStyle = '#1a1a1a'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#e0533c'; g.fillRect(20, 10, 80, H - 20);
    paintText(g, 'VENICE', W * 0.62, H / 2, 22, '#f4ead0');
  }),
  canvasMat(256, 80, (g, W, H) => {
    g.fillStyle = '#4d95c8'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#f2b12e';
    for (let i = 0; i < 6; i++) g.fillRect(i * 44, 0, 16, H);
  }),
  canvasMat(256, 80, (g, W, H) => {
    g.fillStyle = '#2fa08f'; g.fillRect(0, 0, W, H);
    paintText(g, 'BOARDWALK', W / 2, H / 2, 18, '#fff6df');
  }),
  canvasMat(256, 80, (g, W, H) => {
    g.fillStyle = '#c060a0'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#151515'; g.beginPath(); g.arc(W * 0.3, H / 2, 18, 0, Math.PI * 2); g.fill();
    paintText(g, 'SKATE', W * 0.68, H / 2, 20, '#f4ead0');
  }),
];

const FLASH_MAT = canvasMat(512, 640, (g, W, H) => {
  g.fillStyle = '#f3ead4'; g.fillRect(0, 0, W, H);
  g.fillStyle = '#1a1a1a';
  g.font = 'bold 22px Impact, sans-serif';
  g.textAlign = 'center';
  g.fillText('FLASH', W / 2, 28);
  const icons = (x, y, kind) => {
    g.save(); g.translate(x, y); g.strokeStyle = '#1a1a1a'; g.fillStyle = '#1a1a1a'; g.lineWidth = 3;
    if (kind === 0) { // swallow
      g.beginPath(); g.moveTo(-18, 4); g.lineTo(0, -16); g.lineTo(18, 4); g.lineTo(0, -4); g.closePath(); g.fill();
    } else if (kind === 1) { // heart
      g.beginPath(); g.moveTo(0, 14); g.bezierCurveTo(-22, -2, -12, -20, 0, -8);
      g.bezierCurveTo(12, -20, 22, -2, 0, 14); g.fill();
    } else if (kind === 2) { // star
      g.beginPath();
      for (let i = 0; i < 5; i++) {
        const a = -Math.PI / 2 + i * Math.PI * 2 / 5, b = a + Math.PI / 5;
        g.lineTo(Math.cos(a) * 16, Math.sin(a) * 16);
        g.lineTo(Math.cos(b) * 7, Math.sin(b) * 7);
      }
      g.closePath(); g.fill();
    } else if (kind === 3) { // dagger
      g.fillRect(-3, -16, 6, 22); g.beginPath(); g.moveTo(-6, 6); g.lineTo(0, 18); g.lineTo(6, 6); g.fill();
      g.fillRect(-10, -4, 20, 4);
    } else { // rose-ish
      g.beginPath(); g.arc(0, -4, 12, 0, Math.PI * 2); g.fill();
      g.fillRect(-2, 6, 4, 12);
    }
    g.restore();
  };
  let k = 0;
  for (let row = 0; row < 4; row++)
    for (let col = 0; col < 3; col++)
      icons(70 + col * 150, 90 + row * 130, (k++) % 5);
}, { side: THREE.DoubleSide, roughness: 0.9 });

const PIZZA_MAT = canvasMat(256, 256, (g, W, H) => {
  g.fillStyle = '#c48a3a';
  g.beginPath(); g.arc(W / 2, H / 2, 120, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#d44c28';
  g.beginPath(); g.arc(W / 2, H / 2, 100, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#f0c24a';
  g.beginPath(); g.arc(W / 2, H / 2, 92, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#b03028';
  for (const [x, y] of [[90, 80], [150, 90], [80, 150], [160, 155], [120, 120], [100, 180], [170, 120]]) {
    g.beginPath(); g.arc(x, y, 14, 0, Math.PI * 2); g.fill();
  }
});

const POST_MATS = [0, 1, 2, 3].map(i => canvasMat(160, 220, (g, W, H) => {
  const skies = ['#4d95c8', '#e07030', '#2fa08f', '#c060a0'];
  g.fillStyle = skies[i]; g.fillRect(0, 0, W, H * 0.62);
  g.fillStyle = '#f2b12e';
  g.beginPath(); g.arc(W * 0.7, H * 0.28, 22, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#e8d4a8'; g.fillRect(0, H * 0.62, W, H * 0.38);
  g.fillStyle = '#2fa08f'; g.fillRect(0, H * 0.58, W, 10);
  paintText(g, 'VENICE', W / 2, H * 0.78, 18, '#1e2a44');
  paintText(g, 'BEACH', W / 2, H * 0.88, 16, '#c42c28');
}, { side: THREE.DoubleSide }));

const HENNA_MAT = canvasMat(256, 320, (g, W, H) => {
  g.fillStyle = '#f3ead4'; g.fillRect(0, 0, W, H);
  g.strokeStyle = '#5e2a10'; g.lineWidth = 2;
  for (let i = 0; i < 6; i++) {
    g.beginPath();
    g.arc(W / 2, 50 + i * 44, 18 + (i % 3) * 8, 0, Math.PI * 1.6);
    g.stroke();
  }
  paintText(g, 'HENNA', W / 2, H - 24, 18, '#5e2a10');
}, { side: THREE.DoubleSide });

const PRICE_TEES = canvasMat(256, 128, (g, W, H) => {
  g.fillStyle = '#e0533c'; g.fillRect(0, 0, W, H);
  paintText(g, '3 FOR $10', W / 2, H / 2, 36, '#fff6df');
});
const PRICE_SHADES = canvasMat(256, 128, (g, W, H) => {
  g.fillStyle = '#2fa08f'; g.fillRect(0, 0, W, H);
  paintText(g, '2 FOR $10', W / 2, H / 2, 32, '#fff6df');
});
const PRICE_PIZZA = canvasMat(256, 128, (g, W, H) => {
  g.fillStyle = '#c42c28'; g.fillRect(0, 0, W, H);
  paintText(g, 'SLICE $4', W / 2, H / 2, 34, '#fff6df');
});
const PRICE_WHEEL = canvasMat(256, 128, (g, W, H) => {
  g.fillStyle = '#d8362a'; g.fillRect(0, 0, W, H);
  paintText(g, 'RIDE $8', W / 2, H / 2, 36, '#fff6df');
});

let merchSeed = 90291 >>> 0;
const mrnd = () => ((merchSeed = (merchSeed * 1664525 + 1013904223) >>> 0) / 4294967296);
const mpick = arr => arr[Math.floor(mrnd() * arr.length) % arr.length];

const shopSpinners = [];
const SHOP_FRONT = []; // { x, kind, w, label } — world X of each unit, for the crowd

// The shop's name, PAINTED on its fascia: a texture sitting flush against the
// band that is already part of the building, not a panel hung in front of it.
function fasciaSign(x, y, z, w, h, label, paint, ink) {
  const W = 1024, H = 128;
  const c = Object.assign(document.createElement('canvas'), { width: W, height: H });
  const g = c.getContext('2d');
  // The background IS the wall colour, so the plane has no visible edge and
  // the name reads as paint rather than as a panel screwed to the building.
  g.fillStyle = paint;
  g.fillRect(0, 0, W, H);
  g.fillStyle = ink;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  // Fill the band. Signwriting on that strip is as big as the strip allows.
  let px = 104;
  do {
    g.font = `bold ${px}px "Arial Black", Impact, sans-serif`;
    if (g.measureText(label).width <= W - 46) break;
    px -= 3;
  } while (px > 26);
  // Letter by letter, with a little wander off the baseline and off vertical:
  // these are painted by hand with a brush, and perfectly set type is the
  // other half of why the first version looked machine-made.
  let sd = 0;
  for (let i = 0; i < label.length; i++) sd += label.charCodeAt(i) * (i + 7);
  const jit = () => {
    sd = (sd * 1664525 + 1013904223) >>> 0;
    return sd / 4294967296 - 0.5;
  };
  const total = g.measureText(label).width;
  let cx = (W - total) / 2;
  for (const ch of label) {
    const cw = g.measureText(ch).width;
    g.save();
    g.translate(cx + cw / 2, H / 2 + 4 + jit() * 5);
    g.rotate(jit() * 0.05);
    g.fillText(ch, 0, 0);
    g.restore();
    cx += cw;
  }
  // Sun-blistered paint and a few dribbles under the letters.
  for (let i = 0; i < 260; i++) {
    g.globalAlpha = 0.04 + Math.abs(jit()) * 0.16;
    g.fillStyle = i % 3 ? paint : ink;
    g.fillRect((jit() + 0.5) * W, (jit() + 0.5) * H, 2 + Math.abs(jit()) * 14, 1 + Math.abs(jit()) * 4);
  }
  g.globalAlpha = 1;
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = maxAniso;
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(w, h),
    new THREE.MeshStandardMaterial({ map: t, roughness: 0.92 }),
  );
  m.position.set(x, y, z);
  m.rotation.y = Math.PI;                  // face the sea
  scene.add(m);
  return m;
}

// One round-arched bay of the colonnade. Voussoirs are laid tangentially round
// the semicircle — a stack of axis-aligned boxes gives a staircase, not an arch.
function roundArch(cx, span, springY, z, ring = 0.42, depth = 0.62) {
  const r = span / 2;
  const N = 11;
  for (let i = 0; i < N; i++) {
    const a0 = (i / N) * Math.PI, a1 = ((i + 1) / N) * Math.PI;
    const am = (a0 + a1) / 2;
    shape(G.box, M.arcade,
      cx + Math.cos(am) * r, springY + Math.sin(am) * r, z,
      r * (a1 - a0) * 1.14, ring, depth, { rz: am + Math.PI / 2 });
  }
}
function column(cx, z, h) {
  shape(G.cyl, M.arcade, cx, 0.14, z, 0.62, 0.28, 0.62);          // base
  shape(G.cyl, M.arcade, cx, h / 2 + 0.28, z, 0.46, h - 0.56, 0.46);
  shape(G.box, M.arcade, cx, h - 0.16, z, 0.78, 0.34, 0.78);      // capital
  shape(G.box, M.arcade, cx, h + 0.06, z, 0.9, 0.14, 0.9);        // abacus
}

// What is actually out on the walk in front of each trade. Venice dumps its
// stock UNDER THE ARCHES: pipe racks of slogan tees, spinning sunglass trees,
// boards on end, flash sheets in the window. A shop that only has a painted
// name and an empty arcade is a facade, not a store.
function hangingTee(mat, x, y, z) {
  const face = Math.PI;
  // Wire hanger, then a shirt with THICKNESS and sleeves that drop — a card
  // with two tabs was a paper cut-out, not a garment.
  shape(G.cyl, M.chrome, x, y + 0.36, z, 0.012, 0.1, 0.012);
  shape(G.cyl, M.chrome, x, y + 0.31, z, 0.2, 0.008, 0.2, { rx: Math.PI / 2 });
  box(mat, x, y - 0.02, z, 0.38, 0.52, 0.055, face);
  shape(G.box, mat, x - 0.24, y + 0.12, z, 0.16, 0.2, 0.045, { rz: 0.55, ry: face });
  shape(G.box, mat, x + 0.24, y + 0.12, z, 0.16, 0.2, 0.045, { rz: -0.55, ry: face });
  shape(G.cyl, mat, x, y + 0.24, z, 0.09, 0.04, 0.06, { rx: Math.PI / 2 });
}
function pipeRack(cx, z, width, count) {
  prop(() => {
    box(M.chrome, cx, 2.02, z, width, 0.035, 0.035);
    box(M.chrome, cx - width / 2 + 0.03, 1.05, z, 0.04, 2.05, 0.04);
    box(M.chrome, cx + width / 2 - 0.03, 1.05, z, 0.04, 2.05, 0.04);
    box(M.chrome, cx, 0.04, z, width - 0.1, 0.04, 0.22);
  });
  for (let i = 0; i < count; i++) {
    const tx = cx - width / 2 + 0.26 + i * ((width - 0.52) / Math.max(1, count - 1));
    hangingTee(mpick(TEE_MATS), tx, 1.58, z);
  }
}
function foldedStack(x, y, z) {
  for (let i = 0; i < 6; i++)
    box(mpick(TEE_MATS), x + (mrnd() - 0.5) * 0.03, y + i * 0.038, z, 0.4, 0.034, 0.3,
      (mrnd() - 0.5) * 0.12);
}
function mannequin(x, z, shirt) {
  prop(() => {
    shape(G.cylBase, M.black, x, 0, z, 0.32, 0.06, 0.32);
    shape(G.cyl, M.chrome, x, 0.38, z, 0.05, 0.7, 0.05);
    box(M.mannequin, x, 0.85, z, 0.28, 0.18, 0.16);           // hips
    box(M.mannequin, x, 1.18, z, 0.3, 0.5, 0.16);             // torso
    box(M.mannequin, x, 1.48, z, 0.38, 0.08, 0.12);            // shoulders
    shape(G.cyl, M.mannequin, x, 1.58, z, 0.07, 0.12, 0.07);   // neck
    shape(G.sphere, M.mannequin, x, 1.74, z, 0.18, 0.22, 0.2);
    shape(G.cyl, M.mannequin, x - 0.22, 1.22, z, 0.06, 0.42, 0.06, { rz: 0.18 });
    shape(G.cyl, M.mannequin, x + 0.22, 1.22, z, 0.06, 0.42, 0.06, { rz: -0.18 });
    hangingTee(shirt, x, 1.22, z - 0.1);
  });
}
function hat(mat, x, y, z) {
  shape(G.disc, mat, x, y, z, 0.4, 0.025, 0.4);
  shape(G.cyl, mat, x, y + 0.09, z, 0.2, 0.12, 0.2);
  shape(G.disc, mat, x, y + 0.155, z, 0.2, 0.02, 0.2);
}
function surfboard(mat, x, y, z, lean = 0) {
  shape(G.surf, mat, x, y + 1.16, z, 1, 1, 1, { rz: lean });
  box(M.black, x, y + 0.22, z + 0.05, 0.055, 0.2, 0.11);
}
function skateComplete(mat, x, y, z) {
  shape(G.skate, mat, x, y, z, 1, 1, 1, { rx: Math.PI / 2 });
  for (const dx of [-0.22, 0.22]) {
    box(M.chrome, x + dx, y - 0.028, z, 0.07, 0.03, 0.16);
    for (const s of [-1, 1])
      shape(G.cyl, M.black, x + dx, y - 0.055, z + s * 0.08, 0.048, 0.04, 0.048, { rz: Math.PI / 2 });
  }
}
function sunglassPair(x, y, z, ry, lens) {
  shape(G.lens, lens, x - 0.055, y, z, 0.1, 0.03, 0.08, { ry });
  shape(G.lens, lens, x + 0.055, y, z, 0.1, 0.03, 0.08, { ry });
  box(M.black, x, y, z, 0.04, 0.018, 0.03, ry);
  box(M.black, x - 0.11, y, z + 0.04, 0.08, 0.012, 0.012, ry);
  box(M.black, x + 0.11, y, z + 0.04, 0.08, 0.012, 0.012, ry);
}
function addMesh(parent, geo, mat, x, y, z, sx, sy, sz, rot = {}) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.scale.set(sx, sy, sz);
  if (rot.rx) m.rotation.x = rot.rx;
  if (rot.ry) m.rotation.y = rot.ry;
  if (rot.rz) m.rotation.z = rot.rz;
  m.castShadow = true;
  parent.add(m);
  return m;
}
function spinnerRack(lx, lz) {
  const g = new THREE.Group();
  g.position.set(FX + lx, LIFT, FZ + lz);
  scene.add(g);
  addMesh(g, G.cylBase, M.black, 0, 0, 0, 0.28, 0.06, 0.28);
  addMesh(g, G.cyl, M.chrome, 0, 0.85, 0, 0.045, 1.7, 0.045);
  const ring = new THREE.Group();
  ring.position.y = 0.42;
  g.add(ring);
  for (let tier = 0; tier < 4; tier++) {
    const n = 8;
    const r = 0.32 + (tier % 2) * 0.04;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + tier * 0.2;
      const pair = new THREE.Group();
      pair.position.set(Math.cos(a) * r, tier * 0.28, Math.sin(a) * r);
      pair.rotation.y = a + Math.PI / 2;
      addMesh(pair, G.lens, i % 2 ? M.lensDark : M.lensGold, -0.05, 0, 0, 0.09, 0.025, 0.07);
      addMesh(pair, G.lens, i % 2 ? M.lensDark : M.lensGold, 0.05, 0, 0, 0.09, 0.025, 0.07);
      addMesh(pair, G.box, M.black, 0, 0, 0, 0.035, 0.016, 0.025);
      ring.add(pair);
    }
  }
  shopSpinners.push(ring);
}
function pizzaPie(x, y, z, s = 0.55) {
  shape(G.disc, M.crust, x, y, z, s * 1.06, 0.035, s * 1.06);
  shape(G.disc, PIZZA_MAT, x, y + 0.022, z, s, 0.03, s);
}
function pizzaSlice(x, y, z, ry) {
  shape(G.cone, M.crust, x, y, z, 0.26, 0.04, 0.4, { rx: Math.PI / 2, ry });
  shape(G.cone, M.cheese, x, y + 0.025, z, 0.2, 0.025, 0.32, { rx: Math.PI / 2, ry });
  shape(G.disc, M.pepperoni, x + 0.04, y + 0.04, z + 0.02, 0.07, 0.015, 0.07);
}
function vinylDisc(x, y, z) {
  shape(G.disc, M.vinyl, x, y, z, 0.3, 0.016, 0.3);
  shape(G.disc, mpick(POST_MATS), x, y + 0.01, z, 0.1, 0.008, 0.1);
  shape(G.cyl, M.chrome, x, y + 0.012, z, 0.018, 0.01, 0.018);
}
function displayTable(x, y, z, w, d, h = 0.78) {
  prop(() => {
    box(M.deckWood, x, y + h, z, w, 0.05, d);
    box(M.chrome, x, y + h - 0.04, z, w - 0.04, 0.03, d - 0.04);
    for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]])
      shape(G.cylBase, M.chrome, x + dx * (w / 2 - 0.06), y, z + dz * (d / 2 - 0.06),
        0.04, h - 0.02, 0.04);
  });
}

function shopStock(kind, w) {
  const zf = -SHOP_D / 2 + 0.45;         // out under the arches, on the walk
  const zg = -SHOP_D / 2 + ARC_D - 0.15; // at the opening, still in the bay
  const zi = 0.4;                        // deep in the shop, seen through the opening

  if (kind === 'tees') {
    pipeRack(-w * 0.28, zf, 2.7, 8);
    pipeRack(w * 0.28, zf, 2.7, 8);
    pipeRack(0, zg + 0.15, 3.4, 9);
    mannequin(-w * 0.42, zf - 0.55, TEE_MATS[0]);
    mannequin(w * 0.42, zf - 0.55, TEE_MATS[1]);
    for (let i = 0; i < 4; i++) foldedStack(-w / 2 + 1.8 + i * ((w - 3.6) / 3), 0.55, zg);
    // Interior wall of hanging tees, visible through the opening.
    for (let row = 0; row < 2; row++)
      for (let i = 0; i < 10; i++)
        hangingTee(mpick(TEE_MATS), -w / 2 + 1.4 + i * ((w - 2.8) / 9), 1.3 + row * 0.85, zi);
    shape(G.card, PRICE_TEES, 0, 2.35, zf - 0.05, 1.1, 0.38, 1, { ry: Math.PI });
  } else if (kind === 'shades') {
    spinnerRack(-w * 0.22, zf);
    spinnerRack(w * 0.22, zf);
    displayTable(0, 0, zg, w - 2.4, 0.72, 0.92);
    for (let i = 0; i < 14; i++)
      sunglassPair(-w / 2 + 1.5 + i * ((w - 3) / 13), 1.06, zg - 0.2, 0,
        i % 2 ? M.lensDark : M.lensGold);
    // Hat wall — every Venice sunglass stall also sells $5 lids.
    for (let i = 0; i < 8; i++)
      hat(mpick([M.fabricWhite, M.fabricRed, M.fabricNavy, M.fabricYellow, M.fabricBlack]),
        -w / 2 + 1.6 + i * ((w - 3.2) / 7), 1.7, zg + 0.15);
    for (let i = 0; i < 6; i++)
      hat(mpick([M.fabricWhite, M.fabricNavy, M.fabricBlack]),
        -w / 2 + 2.0 + i * ((w - 4) / 5), 1.35, zi);
    shape(G.card, PRICE_SHADES, 0, 2.3, zf - 0.1, 1.1, 0.38, 1, { ry: Math.PI });
  } else if (kind === 'surf') {
    // Shortboards on end in a rack, the signature of Boardwalk Skate & Surf.
    prop(() => {
      box(M.steel, 0, 0.08, zf + 0.15, w - 1.8, 0.1, 0.55);
      box(M.steel, 0, 1.15, zf + 0.15, w - 1.8, 0.05, 0.05);
    });
    for (let i = 0; i < 9; i++) {
      const bx = -w / 2 + 1.15 + i * ((w - 2.3) / 8);
      surfboard(BOARD_MATS[i % BOARD_MATS.length], bx, 0.12, zf + 0.15, (i - 4) * 0.035);
    }
    // Complete skateboards on a low bench out front, decks hung on the wall.
    displayTable(0, 0, zf - 0.15, 2.4, 0.7, 0.42);
    for (let i = 0; i < 3; i++)
      skateComplete(DECK_MATS[i % DECK_MATS.length], -0.7 + i * 0.7, 0.48, zf - 0.15);
    for (let i = 0; i < 5; i++)
      shape(G.skate, DECK_MATS[i % DECK_MATS.length],
        -w * 0.3 + i * (w * 0.15), 1.62, zf, 1, 1, 1);
    // Wetsuits hanging inside.
    for (let i = 0; i < 4; i++)
      hangingTee(mpick([M.fabricBlack, M.fabricNavy]), -1.6 + i * 1.05, 1.45, zi);
  } else if (kind === 'tattoo') {
    // Dark parlour: blacked-out interior, flash on the walls, a chair.
    box(M.black, 0, 1.7, zi + 0.8, w - 1.2, 3.4, 0.2);
    box(M.shopWarm, 0, 3.4, 0.2, w - 2.4, 0.08, 3.0);
    for (let i = 0; i < 6; i++)
      shape(G.card, FLASH_MAT, -w / 2 + 1.8 + i * ((w - 3.6) / 5), 1.85, zg - 0.02, 0.7, 0.9, 1, { ry: Math.PI });
    for (let i = 0; i < 4; i++)
      shape(G.card, FLASH_MAT, -w * 0.32 + i * (w * 0.2), 1.8, zi + 0.7, 0.8, 1.05, 1, { ry: Math.PI });
    displayTable(0, 0, zf + 0.2, 2.2, 0.7, 0.9);
    prop(() => {
      shape(G.cylBase, M.steel, 0.9, 0, zg + 0.4, 0.08, 0.46, 0.08);
      box(M.black, 0.9, 0.55, zg + 0.4, 0.55, 0.1, 0.55);
      box(M.black, 0.9, 0.85, zg + 0.62, 0.5, 0.5, 0.08);
    });
    box(M.black, -1.1, 1.15, zf + 0.2, 0.08, 2.2, 0.08);
    shape(G.sphere, M.shopWarm, -1.1, 2.35, zf + 0.2, 0.16, 0.16, 0.16);
  } else if (kind === 'henna') {
    displayTable(0, 0, zf + 0.1, w - 3.2, 0.8, 0.86);
    for (let i = 0; i < 3; i++)
      prop(() => {
        shape(G.cylBase, M.steel, STOOL.henna.xs[i], 0, zf + STOOL.henna.dz, 0.08, 0.62, 0.08);
        shape(G.cyl, M.deckWood, STOOL.henna.xs[i], 0.66, zf + STOOL.henna.dz, 0.58, 0.08, 0.58);
      });
    for (let i = 0; i < 6; i++)
      shape(G.card, HENNA_MAT, -w / 2 + 1.8 + i * ((w - 3.6) / 5), 1.75, zg, 0.42, 0.55, 1, { ry: Math.PI });
    // Henna cones on the trestle.
    for (let i = 0; i < 5; i++)
      shape(G.cone, M.paper, -0.8 + i * 0.4, 1.0, zf + 0.1, 0.07, 0.16, 0.07);
    for (let i = 0; i < 4; i++)
      shape(G.card, HENNA_MAT, -1.2 + i * 0.8, 1.5, zi, 0.5, 0.7, 1, { ry: Math.PI });
  } else if (kind === 'pizza') {
    displayTable(0, 0, zg, w - 2.2, 0.82, 0.92);
    box(M.chrome, 0, 1.22, zg, w - 2.15, 0.03, 0.84);
    box(M.glassPane, 0, 1.4, zg - 0.4, w - 2.35, 0.42, 0.03);
    box(M.shopWarm, 0, 0.98, zg, w - 2.5, 0.03, 0.5);
    for (let i = 0; i < 4; i++)
      pizzaPie(-w / 2 + 2.2 + i * ((w - 4.4) / 3), 1.12, zg, 0.48);
    for (let i = 0; i < 3; i++)
      pizzaSlice(-0.7 + i * 0.7, 1.14, zg - 0.22, (i - 1) * 0.4);
    // Soda fridge.
    box(M.steel, w / 2 - 1.6, 1.0, zg + 0.5, 0.7, 2.0, 0.6);
    box(M.glassPane, w / 2 - 1.6, 1.15, zg + 0.18, 0.6, 1.5, 0.04);
    for (let i = 0; i < 2; i++)
      prop(() => {
        shape(G.cylBase, M.steel, STOOL.pizza.xs[i], 0, zf + STOOL.pizza.dz, 0.08, 0.72, 0.08);
        shape(G.disc, M.deckWood, STOOL.pizza.xs[i], 0.76, zf + STOOL.pizza.dz, 1.05, 0.07, 1.05);
      });
    pizzaPie(STOOL.pizza.xs[0], 0.84, zf + STOOL.pizza.dz, 0.36);
    shape(G.card, PRICE_PIZZA, 0, 2.15, zg - 0.5, 1.2, 0.4, 1, { ry: Math.PI });
  } else if (kind === 'vintage') {
    pipeRack(-w * 0.26, zf, 2.5, 7);
    pipeRack(w * 0.26, zf, 2.5, 7);
    for (let i = 0; i < 5; i++)
      hat(mpick([M.fabricWhite, M.frondDry, M.fabricNavy, M.fabricRed]),
        -w / 2 + 1.6 + i * ((w - 3.2) / 4), 1.55, zg);
    // Vinyl crate and posters — Boardwalk Vintage's actual mix.
    box(M.deckWood, 0, 0.35, zf - 0.35, 1.4, 0.7, 0.55);
    for (let i = 0; i < 8; i++)
      box(mpick(POST_MATS), -0.5 + i * 0.14, 0.72, zf - 0.35, 0.02, 0.32, 0.32);
    for (let i = 0; i < 4; i++)
      shape(G.card, mpick(POST_MATS), -w * 0.3 + i * (w * 0.2), 1.7, zi, 0.55, 0.78, 1, { ry: Math.PI });
    vinylDisc(-0.35, 0.78, zf - 0.5);
    vinylDisc(0.35, 0.78, zf - 0.2);
  } else {
    // Souvenirs: snow globes, postcards, stacked trinkets, a "VENICE" magnet wall.
    for (let sh = 0; sh < 3; sh++)
      for (let i = 0; i < 8; i++) {
        const px = -w / 2 + 1.4 + i * ((w - 2.8) / 7);
        shape(G.sphere, mpick(FABRICS), px, 0.95 + sh * 0.55, zg, 0.16, 0.16, 0.16);
        shape(G.cyl, M.glassPane, px, 1.08 + sh * 0.55, zg, 0.18, 0.22, 0.18);
      }
    for (let i = 0; i < 10; i++)
      shape(G.card, mpick(POST_MATS), -w * 0.38 + (i % 5) * 0.32, 1.15 + Math.floor(i / 5) * 0.42, zf,
        0.22, 0.3, 1, { rx: -0.2, ry: Math.PI });
    shape(G.cylBase, M.black, -w * 0.1, 0, zf, 0.14, 1.15, 0.14);
    for (let i = 0; i < 8; i++)
      shape(G.card, mpick(POST_MATS), -w * 0.1 + Math.cos(i) * 0.28, 0.7 + (i % 4) * 0.28,
        zf + Math.sin(i) * 0.28, 0.18, 0.26, 1);
    // Letter magnets / "VENICE" block on the counter.
    box(M.counter, w * 0.28, 0.45, zf + 0.2, 2.2, 0.9, 0.55);
    const letters = 'VENICE';
    for (let i = 0; i < letters.length; i++)
      box(mpick([M.fabricRed, M.fabricYellow, M.fabricBlue, M.fabricWhite]),
        w * 0.28 - 0.75 + i * 0.26, 1.02, zf + 0.2, 0.22, 0.22, 0.08);
  }
}

// One unit of the terrace.
function shopUnit(s, muralMat) {
  const w = s.w, D = SHOP_D;
  const stucco = STUCCO[s.c];
  const zFront = -D / 2;
  const zGlass = -D / 2 + ARC_D;
  const H = GF + FASCIA + UF;

  // Shell.
  box(stucco, 0, (GF + FASCIA + UF) / 2, D / 2 - 0.15, w, H, 0.3);          // back
  for (const dx of [-w / 2 + 0.15, w / 2 - 0.15])
    box(stucco, dx, H / 2, 0, 0.3, H, D);                                    // party walls
  // Shopfront: an OPENING, not a sealed wall. Venice dumps its stock onto
  // the walk and you see into the shop — a glass decal on a blank wall is
  // what made the first pass read as a facade.
  const winW = Math.max(2.8, w - 2.6), winH = 3.15, winY = 1.9;
  box(stucco, 0, 0.4, zGlass, w - 0.6, 0.8, 0.28);                          // bulkhead
  box(stucco, -w / 2 + 0.75, winY, zGlass, 1.5, winH + 0.15, 0.28);          // jambs
  box(stucco,  w / 2 - 0.75, winY, zGlass, 1.5, winH + 0.15, 0.28);
  box(stucco, 0, winY + winH * 0.5 + 0.15, zGlass, w - 0.6, 1.05, 0.28);    // lintel
  box(M.deckWood, 0, 0.04, 0.5, w - 0.9, 0.08, D - 1.4);                    // interior floor
  box(M.shopWarm, 0, GF - 0.2, 0.3, w - 2.0, 0.06, D - 2.2);                // interior glow
  // Arcade: piers at the bay ends, arches between.
  const bays = Math.max(2, Math.round(w / 4.2));
  const span = (w - 0.9) / bays;
  const springY = GF - 0.4 - span / 2;      // crown lands just under the soffit
  for (let i = 0; i <= bays; i++)
    column(-w / 2 + 0.45 + i * span, zFront + 0.55, springY);
  for (let i = 0; i < bays; i++)
    roundArch(-w / 2 + 0.45 + span * (i + 0.5), span, springY, zFront + 0.55);
  // Soffit + the fascia the name is painted on.
  box(stucco, 0, GF - 0.04, zFront + 1.2, w, 0.28, 2.6);
  box(stucco, 0, GF + FASCIA / 2, zFront + 0.18, w, FASCIA, 0.42);
  // Upper storey: mural bay, windows, parapet.
  box(stucco, 0, GF + FASCIA + UF / 2, zFront + 0.12, w, UF, 0.3);
  if (muralMat) box(muralMat, 0, GF + FASCIA + UF / 2 + 0.1, zFront - 0.05, w - 1.0, UF - 0.9, 0.06);
  for (let i = 0; i < 2; i++) {
    const wx = -w / 4 + i * (w / 2);
    box(M.glassPane, wx, GF + FASCIA + UF - 1.0, zFront - 0.06, 1.1, 1.3, 0.06);
    box(stucco, wx, GF + FASCIA + UF - 0.28, zFront - 0.1, 1.4, 0.14, 0.16);
  }
  box(stucco, 0, H + PARAPET / 2, zFront + 0.12, w, PARAPET, 0.34);
  box(M.arcade, 0, H + PARAPET, zFront + 0.1, w + 0.1, 0.16, 0.5);
  shopStock(s.kind, w);
}

// Lay the terrace out as one continuous run, party wall to party wall.
{
  // A cross-alley through the terrace, on the line of the travel car: without
  // it the block walls the car park off from the walk and you have to hike
  // round 45 m of shopfront to reach your own car. Venice has these too.
  const ALLEY = 12;
  const total = SHOPS.reduce((a, s) => a + s.w, 0) + ALLEY;
  let cx = -total / 2;
  SHOPS.forEach((s, i) => {
    const x = cx + s.w / 2;
    cx += s.w + (i === 2 ? ALLEY : 0);
    onDeck(x, SHOP_Z + SHOP_D / 2, 0, () =>
      shopUnit(s, i % 3 === 1 ? null : MURALS[i % MURALS.length]));
    fasciaSign(x, PROM_Y + GF + FASCIA / 2, SHOP_Z - 0.18,
      s.w - 0.15, FASCIA, s.label, PALETTE[s.c], s.ink);
    SHOP_FRONT.push({ x, kind: s.kind, w: s.w, label: s.label });
  });
}

// Independent vendor stalls out on the walk itself — the artists, jewellers
// and incense sellers who are as much the strip as the shops behind them.
function vendorStall(canopy) {
  prop(() => {
    for (const [dx, dz] of [[-1.5, -1.2], [1.5, -1.2], [-1.5, 1.2], [1.5, 1.2]])
      shape(G.cylBase, M.steel, dx, 0, dz, 0.07, 2.35, 0.07);
    box(M.deckWood, 0, 0.74, 0, 3.0, 0.08, 1.5);           // trestle
    box(M.fabricWhite, 0, 0.4, 0.1, 3.0, 0.66, 1.3);       // cloth to the ground
  });
  box(canopy, 0, 2.42, 0, 3.6, 0.1, 2.9);
  shape(G.canopy, canopy, 0, 2.46, 0, 3.6, 0.5, 2.9);
  // Framed work leaning at the back, small goods laid out on the trestle.
  for (let i = 0; i < 5; i++)
    shape(G.card, MURALS[i % MURALS.length], -1.1 + i * 0.55, 1.28, 0.62,
      0.5, 0.64, 1, { rx: -0.16 });
  for (let i = 0; i < 8; i++)
    box(pick(FABRICS), -1.25 + i * 0.36, 0.82, -0.3, 0.26, 0.08, 0.4);
}
const VENDOR_STALLS = [
  [-58, 36.2], [-41, 35.8], [-25, 36.3], [-8, 35.9],
  [9, 36.3], [24, 35.8], [40, 36.2], [55, 35.9],
];
for (const [vx, vz] of VENDOR_STALLS) {
  if (!clearOfFerris(vx, vz)) continue;
  onDeck(vx, vz, Math.PI, () => vendorStall(pick(FABRICS)));
}


// Palms, benches, bins and lamps down the seaward edge of the walk.
for (let i = -9; i <= 9; i++) {
  const x = i * 11.5;
  if (!clearOfPier(x)) continue;      // the pier ramp comes through here
  if (!clearOfFerris(x, 33.2)) continue;
  onDeck(x, 33.2, 0, () => palm(8.4 + rnd() * 2.6));
  if (i % 2 === 0 && clearOfFerris(x + 5.6, 34.6))
    onDeck(x + 5.6, 34.6, 0, () => prop(bench));
  if (i % 3 === 0 && clearOfFerris(x + 3.0, 32.2))
    onDeck(x + 3.0, 32.2, 0, () => prop(() => lampPost(5.4)));
  if (i % 4 === 0 && clearOfFerris(x - 4.2, 34.8))
    onDeck(x - 4.2, 34.8, 0, () => prop(bin));
}
// Showers at the head of each flight of steps.
for (const sx of [-62, 0, 62]) onGround(sx + 6.5, 24, Math.PI, () => prop(shower));

// A painted lane down the middle of the walk: this is where the skaters go in
// phase 3, and it wants to be visible before they are on it.
for (let i = -46; i <= 46; i++) {
  const x0 = i * 2.4, x1 = i * 2.4 + 1.4;
  if (x1 > FERRIS_WEST && x0 < FERRIS_EAST) continue;
  const z = SKATE_Z;
  slab(M.paint, x0, x1, z - 0.07, z + 0.07, PROM_Y, PROM_Y + 0.015);
}

// ---------------------------------------------------------------------------
// Pacific Wheel. A carnival Ferris wheel at the east end of the shop terrace.
// Static ironmongery (A-frame, platform, booth, fence) goes through emit() so
// it collides; the rim, spokes and gondolas are a Group on `scene` because
// they have to rotate every frame and must never become a floor.
//
// Gondolas hang from the rim and COUNTER-ROTATE so their floor stays level —
// parenting them to the wheel without that leaves every car on its side at
// the three and nine o'clock. Boarding is a sit on the lowest empty car.
// ---------------------------------------------------------------------------
const FERRIS_BULB_COLS = [0xff5a4a, 0xffd15a, 0x5ec8ff, 0xff7ec8, 0xffffff];
const ferrisBulbMats = FERRIS_BULB_COLS.map(c => new THREE.MeshStandardMaterial({
  color: c, emissive: c, emissiveIntensity: 0.35, roughness: 0.35, metalness: 0.1,
}));
const FERRIS_PAINT = [
  new THREE.MeshStandardMaterial({ color: 0xd8362a, roughness: 0.55, metalness: 0.08 }),
  new THREE.MeshStandardMaterial({ color: 0xe8b23c, roughness: 0.55, metalness: 0.08 }),
  new THREE.MeshStandardMaterial({ color: 0x2f86b4, roughness: 0.55, metalness: 0.08 }),
  new THREE.MeshStandardMaterial({ color: 0xe07ba0, roughness: 0.55, metalness: 0.08 }),
  new THREE.MeshStandardMaterial({ color: 0x3f9c78, roughness: 0.55, metalness: 0.08 }),
  new THREE.MeshStandardMaterial({ color: 0xf6f2e6, roughness: 0.55, metalness: 0.08 }),
];
const ferrisSteel = new THREE.MeshStandardMaterial({
  color: 0xb7bec6, roughness: 0.42, metalness: 0.32,
});
const ferrisSteelDark = new THREE.MeshStandardMaterial({
  color: 0x2a3038, roughness: 0.48, metalness: 0.28,
});

const ferris = {
  root: null,
  wheel: null,
  gondolas: [],
  speed: 0.195,            // rad/s — a full turn in ~32 s
  ride: null,              // { gondola, startAngle, traveled, readyToExit }
  seat: new THREE.Object3D(),
  _seatWorld: new THREE.Vector3(),
  _seatQuat: new THREE.Quaternion(),
  _seatEuler: new THREE.Euler(0, 0, 0, 'YXZ'),
  _prevPos: new THREE.Vector3(),
};

{
  const HX = FERRIS_X, HZ = FERRIS_Z;
  const SIDE = 2.45;       // A-frame offset along the axle, outside the rims
  const SPREAD = 8.6;      // A-frame foot spacing in X

  // Boarding deck. A wooden pad on the promenade so the lowest gondola
  // meets a surface of its own, not the painted skate lane.
  slab(M.deckWood, HX - 6.4, HX + 6.4, HZ - 5.2, HZ + 3.4, PROM_Y, PROM_Y + 0.07);

  // Footings only. The full A-frame is drawn on the spinning group's static
  // root (see below) so it cannot become a camera occluder or a floor at
  // hub height — either would yank the ride camera into the cabin.
  prop(() => {
    for (const sz of [-SIDE, SIDE]) {
      for (const sx of [-1, 1]) {
        shape(G.cyl, M.steel,
          HX + sx * SPREAD / 2, PROM_Y + 1.05, HZ + sz,
          0.55, 2.1, 0.55);
      }
    }
  });

  // Ticket booth on the shop-street approach, west of the fenced pad so it
  // is the last thing you pass before the wheel and does not sit under a car.
  // Built as a hollow shell with an OPEN serving hatch: a filled box plus a
  // glass decal on the front read as a shuttered kiosk, which is what it was.
  onDeck(54.2, 36.2, 0, () => {
    const BW = 3.4, BD = 2.5, BH = 2.7, t = 0.12;
    const winW = 2.15, winH = 1.18, sillH = 0.92;
    const zF = -BD / 2;
    const jamb = (BW - winW) / 2;
    const lintelH = BH - sillH - winH;

    box(M.deckWood, 0, 0.03, 0, BW - 0.16, 0.06, BD - 0.16);
    box(M.kiosk, 0, BH / 2, BD / 2 - t / 2, BW, BH, t);                 // back
    box(M.kiosk, -BW / 2 + t / 2, BH / 2, 0, t, BH, BD);                // west wall
    box(M.kiosk, 0, sillH / 2, zF + t / 2, BW, sillH, t);               // bulkhead
    box(M.kiosk, -BW / 2 + jamb / 2, sillH + winH / 2, zF + t / 2, jamb, winH, t);
    box(M.kiosk,  BW / 2 - jamb / 2, sillH + winH / 2, zF + t / 2, jamb, winH, t);
    box(M.kiosk, 0, sillH + winH + lintelH / 2, zF + t / 2, BW, lintelH, t);

    // East wall: a staff door onto the wheel pad, so the seller is not
    // trapped behind the hatch. Split around the opening rather than
    // painting a door on a sealed wall.
    const doorW = 0.86, doorH = 2.05, doorZ0 = 0.12, doorZ1 = 0.12 + doorW;
    const xE0 = BW / 2 - t, xE1 = BW / 2;
    slab(M.kiosk, xE0, xE1, -BD / 2, doorZ0, 0, BH);
    slab(M.kiosk, xE0, xE1, doorZ1, BD / 2, 0, BH);
    slab(M.kiosk, xE0, xE1, doorZ0, doorZ1, doorH, BH);
    // Closed in the frame — a swung leaf sat in the middle of the opening.
    box(M.deckWood, (xE0 + xE1) / 2, doorH / 2, (doorZ0 + doorZ1) / 2,
      t + 0.02, doorH - 0.03, doorW - 0.04);
    box(M.steel, xE1 + 0.03, 1.02, doorZ1 - 0.14, 0.04, 0.10, 0.10);

    // Roof plate stays ON TOP of the box — it must not hang past the fascia
    // or it hides the name from the walk. The wrap-around kioskTrim band is
    // gone: that was the blue bar sitting in front of PACIFIC WHEEL.
    box(M.fabricRed, 0, BH + 0.08, 0.04, BW + 0.28, 0.12, BD + 0.08);
    // Front valance, proud of the wall: this is the name band.
    box(M.fabricRed, 0, BH - 0.12, zF - 0.10, BW + 0.16, 0.44, 0.10);

    // Counter proud of the hatch — the ledge you lean on to buy a ticket.
    box(M.counter, 0, sillH + 0.06, zF - 0.22, winW + 0.18, 0.10, 0.58);
    box(M.counter, 0, sillH - 0.02, -0.12, winW + 0.22, 0.08, 1.15);

    // Shutter rolled UP into a housing over the opening, with a short drop
    // of slats so it still reads as a shutter rather than a missing wall.
    box(M.steel, 0, sillH + winH + 0.11, zF - 0.09, winW + 0.28, 0.18, 0.24);
    box(M.steel, 0, sillH + winH - 0.05, zF - 0.05, winW + 0.06, 0.10, 0.08);
    for (const dx of [-winW / 2 - 0.04, winW / 2 + 0.04])
      box(M.steel, dx, sillH + winH / 2, zF - 0.02, 0.05, winH, 0.05);

    prop(() => {
      box(M.black, 0.55, sillH + 0.18, 0.18, 0.36, 0.22, 0.28);         // till
      box(M.fabricRed, -0.55, sillH + 0.14, 0.22, 0.32, 0.10, 0.22);     // ticket pad
      box(M.fabricYellow, -0.55, sillH + 0.22, 0.22, 0.28, 0.06, 0.18);
      shape(G.card, PRICE_WHEEL, 0, 1.88, BD / 2 - t - 0.03, 1.2, 0.42, 1, { ry: Math.PI });
      shape(G.cylBase, M.steel, -0.7, 0, -1.7, 0.08, 0.62, 0.08);
      shape(G.cyl, M.deckWood, -0.7, 0.64, -1.7, 0.5, 0.08, 0.5);
    });
  });
  fasciaSign(54.2, PROM_Y + 2.58, 36.2 - 1.46,
    3.3, 0.40, 'PACIFIC WHEEL', '#d8362a', '#fff6df');

  // Queue fence around the wheel, with a boarding gap on the seaward face
  // and another on the west (shop-street) approach.
  const fence = (x0, x1, z0, z1) => {
    prop(() => {
      longSlab(M.steel, x0, x1, z0, z1, PROM_Y + 0.95, PROM_Y + 1.05, 24);
      longSlab(M.steel, x0, x1, z0, z1, PROM_Y + 0.48, PROM_Y + 0.56, 24);
    });
  };
  fence(HX - 6.5, HX + 6.5, HZ + 3.35, HZ + 3.47);           // inland
  fence(HX + 6.38, HX + 6.5, HZ - 5.2, HZ + 3.4);             // east
  // West side is the shop-street approach — left open so you walk onto the
  // pad. A short stub inland keeps the fence reading as a pen, not a wall.
  fence(HX - 6.5, HX - 6.38, HZ + 1.6, HZ + 3.4);
  fence(HX - 6.5, HX - 1.8, HZ - 5.32, HZ - 5.2);             // seaward, left of boarding
  fence(HX + 1.8, HX + 6.5, HZ - 5.32, HZ - 5.2);             // seaward, right of boarding
}

function addFerrisMesh(parent, geo, mat, x, y, z, sx, sy, sz, rot = {}) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.scale.set(sx, sy, sz);
  if (rot.rx) m.rotation.x = rot.rx;
  if (rot.ry) m.rotation.y = rot.ry;
  if (rot.rz) m.rotation.z = rot.rz;
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

function buildGondola(cabin, index) {
  const paint = FERRIS_PAINT[index % FERRIS_PAINT.length];
  const trim = ferrisSteelDark;
  // Floor and a shallow tub so the car reads as a car, not a floating bench.
  addFerrisMesh(cabin, G.box, paint, 0, 0.04, 0, 1.72, 0.08, 1.12);
  addFerrisMesh(cabin, G.box, trim, 0, 0.22, 0, 1.68, 0.28, 1.08);
  // Sides.
  addFerrisMesh(cabin, G.box, paint, -0.84, 0.55, 0, 0.07, 0.95, 1.12);
  addFerrisMesh(cabin, G.box, paint, 0.84, 0.55, 0, 0.07, 0.95, 1.12);
  // Safety rails, seaward and inland.
  addFerrisMesh(cabin, G.box, trim, 0, 0.62, 0.54, 1.66, 0.08, 0.06);
  addFerrisMesh(cabin, G.box, trim, 0, 0.62, -0.54, 1.66, 0.08, 0.06);
  addFerrisMesh(cabin, G.box, ferrisSteel, 0, 0.78, 0.38, 1.5, 0.05, 0.05);
  // Bench: sitters face the sea (−Z). Backrest on the inland edge.
  addFerrisMesh(cabin, G.box, M.deckWood, 0, 0.44, 0.12, 1.5, 0.09, 0.42);
  addFerrisMesh(cabin, G.box, paint, 0, 0.72, 0.30, 1.5, 0.48, 0.07);
  // Roof and corner posts.
  for (const [px, pz] of [[-0.78, -0.48], [0.78, -0.48], [-0.78, 0.48], [0.78, 0.48]])
    addFerrisMesh(cabin, G.cyl, trim, px, 1.05, pz, 0.05, 1.12, 0.05);
  addFerrisMesh(cabin, G.box, paint, 0, 1.62, 0, 1.86, 0.07, 1.24);
  addFerrisMesh(cabin, G.box, trim, 0, 1.68, 0, 1.7, 0.05, 0.2);
  // Hang bar up to the hitch.
  addFerrisMesh(cabin, G.cyl, ferrisSteel, 0, 1.95, 0, 0.07, 0.7, 0.07);
}

{
  const R = FERRIS_R, HY = FERRIS_HUB_Y;
  const root = new THREE.Group();
  root.position.set(FERRIS_X, HY, FERRIS_Z);
  scene.add(root);
  ferris.root = root;

  // A-frame. Lives on the root (scene, not world) so it is visible from the
  // sand but is never an AABB the ride camera can collide with.
  {
    const SIDE = 2.45, SPREAD = 8.6;
    const HY = FERRIS_HUB_Y;
    const legLen = Math.hypot(SPREAD, HY - PROM_Y);
    const legTilt = Math.atan2(SPREAD, HY - PROM_Y);
    for (const sz of [-SIDE, SIDE]) {
      for (const sx of [-1, 1]) {
        addFerrisMesh(root, G.cyl, ferrisSteel,
          sx * SPREAD / 2, (PROM_Y - HY) / 2, sz,
          0.42, legLen, 0.42, { rz: -sx * legTilt });
      }
      addFerrisMesh(root, G.box, ferrisSteel,
        0, (PROM_Y - HY) * 0.58, sz, SPREAD * 0.72, 0.16, 0.16);
    }
    addFerrisMesh(root, G.cyl, ferrisSteel, 0, 0, 0, 0.55, SIDE * 2 + 0.8, 0.55,
      { rx: Math.PI / 2 });
  }

  // Hub caps, static on the root so they don't spin with the cars.
  for (const sz of [-1.35, 1.35]) {
    addFerrisMesh(root, G.cyl, ferrisSteelDark, 0, 0, sz, 1.7, 0.28, 1.7, { rx: Math.PI / 2 });
    addFerrisMesh(root, G.cyl, FERRIS_PAINT[0], 0, 0, sz + Math.sign(sz) * 0.16, 1.15, 0.12, 1.15,
      { rx: Math.PI / 2 });
  }

  const wheel = new THREE.Group();
  root.add(wheel);
  ferris.wheel = wheel;

  const rimTorus = withUV2(new THREE.TorusGeometry(R, 0.13, 8, 64));
  const rimOuter = withUV2(new THREE.TorusGeometry(R + 0.42, 0.07, 6, 64));
  for (const sz of [-1.05, 1.05]) {
    addFerrisMesh(wheel, rimTorus, ferrisSteel, 0, 0, sz, 1, 1, 1);
    addFerrisMesh(wheel, rimOuter, FERRIS_PAINT[0], 0, 0, sz, 1, 1, 1);
  }
  // Spokes: two rings, one on each rim, plus a few chords so it is a wheel
  // and not a bicycle.
  for (const sz of [-1.05, 1.05]) {
    for (let i = 0; i < FERRIS_N; i++) {
      const a = (i / FERRIS_N) * Math.PI * 2;
      addFerrisMesh(wheel, G.cyl, ferrisSteel,
        Math.cos(a) * R * 0.5, Math.sin(a) * R * 0.5, sz,
        0.11, R, 0.11, { rz: a - Math.PI / 2 });
    }
  }
  // Inner ring, the thing that makes a Ferris wheel look like one at a distance.
  const innerTorus = withUV2(new THREE.TorusGeometry(R * 0.42, 0.08, 6, 40));
  for (const sz of [-1.05, 1.05])
    addFerrisMesh(wheel, innerTorus, ferrisSteel, 0, 0, sz, 1, 1, 1);
  // Cross-ties between the two rims.
  for (let i = 0; i < FERRIS_N; i++) {
    const a = (i / FERRIS_N) * Math.PI * 2;
    addFerrisMesh(wheel, G.cyl, ferrisSteelDark,
      Math.cos(a) * R, Math.sin(a) * R, 0,
      0.09, 2.1, 0.09, { rx: Math.PI / 2 });
  }

  // Coloured bulbs around the outer ring — the night silhouette.
  for (let i = 0; i < 48; i++) {
    const a = (i / 48) * Math.PI * 2;
    const mat = ferrisBulbMats[i % ferrisBulbMats.length];
    addFerrisMesh(wheel, G.sphere, mat,
      Math.cos(a) * (R + 0.42), Math.sin(a) * (R + 0.42), 1.18,
      0.18, 0.18, 0.18);
    addFerrisMesh(wheel, G.sphere, mat,
      Math.cos(a) * (R + 0.42), Math.sin(a) * (R + 0.42), -1.18,
      0.18, 0.18, 0.18);
  }

  // Gondolas. Hitch rides the rim; keeper undoes the wheel's rotation so the
  // cabin floor stays world-level. Empty slots (every 4th) are where the
  // player boards.
  const emptySlots = new Set([0, 4, 8, 12]);
  for (let i = 0; i < FERRIS_N; i++) {
    const a = (i / FERRIS_N) * Math.PI * 2 - Math.PI / 2;
    const hitch = new THREE.Group();
    hitch.position.set(Math.cos(a) * R, Math.sin(a) * R, 0);
    wheel.add(hitch);
    const keeper = new THREE.Group();
    hitch.add(keeper);
    addFerrisMesh(keeper, G.cyl, ferrisSteelDark, 0, -0.35, 0, 0.08, 0.7, 0.08);
    addFerrisMesh(keeper, G.sphere, ferrisSteel, 0, 0, 0, 0.22, 0.22, 0.22);
    const cabin = new THREE.Group();
    cabin.position.y = -1.55;
    keeper.add(cabin);
    buildGondola(cabin, i);
    const seat = new THREE.Object3D();
    seat.position.set(0, 0.46, 0.08);
    cabin.add(seat);
    ferris.gondolas.push({
      i, hitch, keeper, cabin, seat,
      empty: emptySlots.has(i),
      occupiedByPlayer: false,
    });
  }
}

// ---------------------------------------------------------------------------
// Lifeguard tower. Rebuilt from what these actually are: L.A. County describes
// its towers as mini midcentury-modern stilt houses, and the details that make
// one are all functional — WIDE EAVES and a WINDOW RAKED outward to kill glare
// off the water, a fold-down flap that closes over that window, a ramp with a
// bucket at its foot to rinse sand off, and a numbered front.
//
// The first version was a sealed white box with a glass decal stuck on the
// outside: no opening, no interior, nowhere for a lifeguard to be. The whole
// point of the thing is that it is open to the sea.
//
// Note on prop(): the deck and the ramp are deliberately NOT props, because a
// prop is scenery the ground ray refuses to stand on — which would have made
// the ramp unclimbable and the deck unusable.
// ---------------------------------------------------------------------------
const TOWER_NUMS = [1, 2, 3, 4].map(n => {
  const c = Object.assign(document.createElement('canvas'), { width: 128, height: 128 });
  const g = c.getContext('2d');
  g.fillStyle = '#f4f1e8';
  g.fillRect(0, 0, 128, 128);
  g.fillStyle = '#d8362a';
  g.font = 'bold 92px "Arial Black", Impact, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(String(n), 64, 70);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = maxAniso;
  return new THREE.MeshStandardMaterial({ map: t, roughness: 0.9 });
});

function lifeguardTower(n) {
  const LEG = 2.5;                 // deck height above the sand
  const W = 3.6, D = 3.2;          // cabin plan
  const WALL = 2.15;
  const F = LEG;                   // interior floor == deck top
  const t = 0.12;
  const RUN = 5.0, STEPS = 12;
  const rampZ = f => 2.95 + RUN * (1 - f);   // meets the deck's back edge

  // Deck sized from the PLAYER, not from the cabin. The controller's body
  // radius is 0.42, so any gap it has to walk through needs 0.84 m before it
  // even starts to bind. The first deck left 0.55 m down each side and 0.30 m
  // behind the cabin, so you could reach the top of the ramp and then had
  // nowhere to go but off the edge.
  const DKX = 3.05, DKZ = 2.85;      // deck half-width, half-depth
  const RX = 2.9, RZ = 2.75;         // railing lines, ~1.05 m clear of the walls

  prop(() => {
    for (const [dx, dz] of [[-2.5, -2.3], [2.5, -2.3], [-2.5, 2.3], [2.5, 2.3]])
      box(M.piling, dx, LEG / 2, dz, 0.22, LEG, 0.22);
    for (const dz of [-2.3, 2.3])
      shape(G.box, M.piling, 0, LEG * 0.52, dz, 5.6, 0.1, 0.1, { rz: 0.42 });
    for (const dx of [-2.5, 2.5])
      shape(G.box, M.piling, dx, LEG * 0.52, 0, 0.1, 0.1, 5.2, { rx: 0.44 });
  });

  // Deck. Walkable, so not a prop — it wraps the cabin as the working
  // platform the guard actually stands on.
  box(M.deckWood, 0, F - 0.09, 0, DKX * 2, 0.18, DKZ * 2);

  // Ramp up the LAND side. 21 cm per tread, well inside the controller's
  // step-up, so it can simply be walked.
  for (let i = 1; i <= STEPS; i++) {
    const f = i / STEPS;
    box(M.deckWood, 0, F * f - 0.07, rampZ(f), 1.7, 0.14, RUN / STEPS + 0.14);
  }
  const rampTilt = Math.atan2(F, RUN);
  for (const dx of [-0.88, 0.88]) {
    shape(G.box, M.piling, dx, F * 0.5 - 0.24, rampZ(0.5), 0.1, 0.18, RUN * 1.06, { rx: rampTilt });
    shape(G.box, M.piling, dx, F * 0.5 + 0.74, rampZ(0.5), 0.08, 0.1, RUN * 1.06, { rx: rampTilt });
    for (let i = 0; i < 3; i++) {
      const f = 0.25 + i * 0.28;
      box(M.piling, dx, F * f + 0.42, rampZ(f), 0.08, 0.95, 0.08);
    }
  }

  // --- Cabin, hollow -------------------------------------------------------
  for (const dx of [-W / 2 + t / 2, W / 2 - t / 2])
    box(M.guardWhite, dx, F + WALL / 2, 0, t, WALL, D);
  // Back wall with a door standing open.
  const doorW = 1.0;
  slab(M.guardWhite, -W / 2, -doorW / 2, D / 2 - t, D / 2, F, F + WALL);
  slab(M.guardWhite, doorW / 2, W / 2, D / 2 - t, D / 2, F, F + WALL);
  slab(M.guardWhite, -doorW / 2, doorW / 2, D / 2 - t, D / 2, F + 2.02, F + WALL);
  // Hung on the left jamb and opening INWARD. Swung outward it crossed the
  // deck railing and its leading edge hung over the back edge of the deck —
  // there is only 30 cm of deck behind the cabin, and a 95 cm leaf needs 95.
  {
    const swing = -1.45;                          // radians, into the room
    const hx = -doorW / 2, hz = D / 2 - t;
    shape(G.box, M.guardBlue,
      hx + (doorW / 2) * Math.cos(swing), F + 1.02, hz + (doorW / 2) * Math.sin(swing),
      doorW - 0.04, 2.0, 0.05, { ry: -swing });
    shape(G.box, M.steel,
      hx + (doorW - 0.16) * Math.cos(swing), F + 1.02, hz + (doorW - 0.16) * Math.sin(swing),
      0.1, 0.1, 0.1, { ry: -swing });            // handle
  }
  // Front: a sill, and open above it. This is the whole idea of the building.
  slab(M.guardWhite, -W / 2, W / 2, -D / 2, -D / 2 + t, F, F + 0.82);
  box(TOWER_NUMS[n % TOWER_NUMS.length], 0, F + 0.44, -D / 2 - 0.04, 0.62, 0.62, 0.05);
  // Window raked out over the sill so the sky, not the water's glare, is what
  // it reflects.
  shape(G.box, M.glassPane, 0, F + 1.52, -D / 2 - 0.17, W - 0.3, 1.4, 0.05, { rx: -0.3 });
  for (const dx of [-W / 2 + 0.24, 0, W / 2 - 0.24])
    shape(G.box, M.guardRed, dx, F + 1.52, -D / 2 - 0.19, 0.07, 1.45, 0.07, { rx: -0.3 });
  // The fold-down flap is left off: sitting proud of the eave it read as a
  // second roof plate, and the wide eave is already doing the shading the flap
  // exists for. What stays are the hinges it would fold from.
  for (const dx of [-W / 2 + 0.5, W / 2 - 0.5])
    box(M.steel, dx, F + WALL + 0.02, -D / 2 - 0.02, 0.16, 0.1, 0.12);
  // Wide eaves, and the red band round the cabin.
  box(M.guardWhite, 0, F + WALL + 0.1, -0.3, W + 1.5, 0.18, D + 1.4);
  box(M.guardRed, 0, F + WALL + 0.24, -0.3, W + 1.2, 0.1, D + 1.1);
  // Trim band round the OUTSIDE only, as four strips. Built as a filled box
  // at the cabin's plan size it was a solid slab straight through the middle
  // of a room that is deliberately open at the front — from the beach you saw
  // it cutting the cabin in half behind the window.
  const bY = F + 0.92, bH = 0.1, o = 0.035;
  slab(M.guardRed, -W / 2 - o, W / 2 + o, -D / 2 - o, -D / 2 + o, bY - bH, bY + bH);
  // Broken either side of the doorway: run through, it was a bar across the
  // only way in, at 92 cm — above the controller's step-up, so it physically
  // sealed the cabin as well as looking wrong.
  slab(M.guardRed, -W / 2 - o, -doorW / 2, D / 2 - o, D / 2 + o, bY - bH, bY + bH);
  slab(M.guardRed, doorW / 2, W / 2 + o, D / 2 - o, D / 2 + o, bY - bH, bY + bH);
  slab(M.guardRed, -W / 2 - o, -W / 2 + o, -D / 2, D / 2, bY - bH, bY + bH);
  slab(M.guardRed, W / 2 - o, W / 2 + o, -D / 2, D / 2, bY - bH, bY + bH);

  // --- Somewhere to be -----------------------------------------------------
  prop(() => {
    box(M.deckWood, 0, F + 0.74, -D / 2 + 0.62, W - 0.55, 0.08, 0.8);      // desk ledge
    shape(G.cylBase, M.steel, 1.0, F, 0.55, 0.09, 0.6, 0.09);              // stool
    shape(G.cyl, M.guardBlue, 1.0, F + 0.63, 0.55, 0.6, 0.1, 0.6);
    box(M.guardWhite, -1.25, F + 0.3, 0.95, 0.7, 0.6, 0.5);                // kit box
    box(M.guardRed, -1.25, F + 0.62, 0.95, 0.72, 0.06, 0.52);
  });
  // Rescue can on the sill, binoculars and a radio on the ledge.
  shape(G.cyl, M.guardRed, -1.05, F + 0.98, -D / 2 + 0.42, 0.6, 0.2, 0.22, { rz: 1.57 });
  box(M.black, 0.45, F + 0.85, -D / 2 + 0.62, 0.26, 0.13, 0.16);
  box(M.black, -0.3, F + 0.84, -D / 2 + 0.66, 0.1, 0.12, 0.07);

  // --- Deck railing, open where the ramp lands -----------------------------
  // Posts stand ON the deck: at F + 0.52 with a 0.9 height they began 7 cm
  // above it and the whole railing hung in mid-air.
  const rY = F + 0.45, rT0 = F + 0.86, rT1 = F + 0.94;
  const post = (x, z) => box(M.piling, x, rY, z, 0.08, 0.9, 0.08);
  slab(M.piling, -RX - 0.05, RX + 0.05, -RZ - 0.05, -RZ + 0.05, rT0, rT1);   // sea side
  for (let x = -RX; x <= RX + 0.01; x += 1.16) post(x, -RZ);
  for (const dx of [-RX, RX]) {                                              // sides
    slab(M.piling, dx - 0.05, dx + 0.05, -RZ, RZ, rT0, rT1);
    for (let z = -RZ + 0.6; z < RZ; z += 1.1) post(dx, z);
  }
  // Back, broken open where the ramp lands.
  for (const [x0, x1] of [[-RX - 0.05, -1.15], [1.15, RX + 0.05]]) {
    slab(M.piling, x0, x1, RZ - 0.05, RZ + 0.05, rT0, rT1);
    post((x0 + x1) / 2, RZ);
    post(x0 < 0 ? x1 : x0, RZ);
  }

  // Flag, and the bucket that lives at the foot of every ramp.
  shape(G.cylBase, M.steel, -1.6, F + WALL + 0.2, 1.3, 0.06, 2.5, 0.06);
  shape(G.card, n % 2 ? M.guardRed : M.fabricYellow,
    -1.2, F + WALL + 2.15, 1.3, 1.1, 0.7, 1, { ry: Math.PI / 2 });
  prop(() => shape(G.cylBase, M.guardBlue, 0.65, 0, rampZ(0) + 0.7, 0.34, 0.4, 0.34));
}

const TOWERS = [[-96, -22], [-34, -26], [26, -24], [88, -20]];
TOWERS.forEach(([x, z], i) => onGround(x, z, 0, () => lifeguardTower(i)));

// ---------------------------------------------------------------------------
// The sand itself: parasols, towels, coolers, and one volleyball court.
// ---------------------------------------------------------------------------
function parasol(fabric, tilt) {
  const lean = Math.sin(tilt) * -1.9;
  shape(G.cylBase, M.deckWood, 0, 0, 0, 0.08, 3.3, 0.08, { rz: tilt });
  // A beach parasol is a shallow CONE, not a disc: at 60 cm of rise over a 5 m
  // span it read as a dinner plate floating on a stick.
  shape(G.canopy, fabric, lean, 2.0, 0, 4.7, 1.25, 4.7, { rz: tilt });
  // Scalloped white edge, a hand's width proud of the panels.
  shape(G.canopy, M.fabricWhite, lean, 1.94, 0, 4.88, 0.34, 4.88, { rz: tilt });
  // Canopy and edge are NOT props. Their volume sits above head height, and
  // making a 5 m disc solid would hang an invisible ceiling over the beach.
  shape(G.sphere, M.deckWood, lean, 3.24, 0, 0.17, 0.2, 0.17, { rz: tilt });
}
// Marker flags for the free shaded towel. MeshBasic so they stay readable at
// night and from the unlit back face; the vane billboards toward the camera
// so a thin pennant is never seen edge-on from the promenade.
const FLAG_CLOTH = new THREE.MeshBasicMaterial({
  color: 0xff2a12, side: THREE.DoubleSide, fog: true,
});
const FLAG_BAND = new THREE.MeshBasicMaterial({
  color: 0xfff4e6, side: THREE.DoubleSide, fog: true,
});
let beachLieFlag = null;
function makeFlagVane(mastH, pennantScale) {
  const root = new THREE.Group();
  const mast = new THREE.Mesh(G.cylBase, M.steel);
  mast.scale.set(0.05, mastH, 0.05);
  mast.castShadow = true;
  const ball = new THREE.Mesh(G.sphere, M.steel);
  ball.position.y = mastH;
  ball.scale.set(0.13, 0.13, 0.13);
  const vane = new THREE.Group();
  vane.position.y = mastH * 0.62;
  const cloth = new THREE.Mesh(G.pennant, FLAG_CLOTH);
  cloth.scale.setScalar(pennantScale);
  const band = new THREE.Mesh(G.card, FLAG_BAND);
  band.scale.set(0.14, 0.84 * pennantScale, 1);
  band.position.set(0.07, 0, 0.01);
  vane.add(cloth, band);
  root.add(mast, ball, vane);
  root.frustumCulled = false;
  return { root, vane };
}
function addParasolFlag(gx, gz, pyaw, tilt) {
  const gy = terrainHeight(gx, gz);
  const lean = Math.sin(tilt) * -1.9;
  const c = Math.cos(pyaw), s = Math.sin(pyaw);
  const flag = makeFlagVane(1.85, 1.35);
  // Sit the mast on the finial, not inside the cone, so it reads against the sky.
  flag.root.position.set(gx + lean * c, gy + 3.40, gz - lean * s);
  scene.add(flag.root);
  return flag;
}
function addTowelPin(tx, tz, yaw) {
  const gy = terrainHeight(tx, tz);
  const c = Math.cos(yaw), s = Math.sin(yaw);
  // Pillow corner, off the lying body.
  const lx = 0.58, lz = -1.02;
  const pin = makeFlagVane(1.35, 0.55);
  pin.root.position.set(tx + lx * c + lz * s, gy, tz - lx * s + lz * c);
  scene.add(pin.root);
  return pin;
}
function towel(fabric) {
  prop(() => box(fabric, 0, 0.03, 0, 1.0, 0.06, 2.1));
  box(M.fabricWhite, 0, 0.09, -0.78, 0.44, 0.1, 0.32);   // rolled-up sweater as a pillow
}
// Towel box is 6 cm thick, centred at y = 0.03, so the cloth top is 6 cm
// above the sand. Used to seat a sunbather ON the towel rather than in it.
const TOWEL_TOP = 0.06;
function cooler() {
  prop(() => {
    box(M.guardWhite, 0, 0.2, 0, 0.66, 0.4, 0.44);
    box(M.guardBlue, 0, 0.42, 0, 0.7, 0.06, 0.48);
  });
}
// Clusters, not a grid: people on a beach sit in groups, and an even spread
// reads as parking bays.
const PITCHES = [];
// Afternoon sun from TIME_STATES.day. The table is declared with the lighting
// later, but shade has to be laid now, with the towels. West-facing beach, so
// the shadow of a 2 m canopy falls about a metre east and a little inland.
const DAY_SUN = new THREE.Vector3(-80, 155, -20).normalize();
const CANOPY_R = 2.35;
const CANOPY_H = 2.0;
function canopyShadeCenter(canopyX, canopyZ) {
  return {
    x: canopyX - CANOPY_H * DAY_SUN.x / DAY_SUN.y,
    z: canopyZ - CANOPY_H * DAY_SUN.z / DAY_SUN.y,
  };
}
function inCanopyShade(tx, tz, canopyX, canopyZ) {
  const s = canopyShadeCenter(canopyX, canopyZ);
  return Math.hypot(tx - s.x, tz - s.z) <= CANOPY_R * 0.78;
}

const shadedPitches = [];
for (let g = 0; g < 22; g++) {
  const gx = -128 + rnd() * 256;
  const gz = -34 + rnd() * 48;
  if (Math.abs(gx) > BEACH_HALF_W - 14) continue;
  if (!clearOfPier(gx)) continue;
  const fabric = pick(FABRICS);
  const tilt = (rnd() - 0.5) * 0.24;
  const pyaw = rnd() * 6.3;
  const lean = Math.sin(tilt) * -1.9;
  onGround(gx, gz, pyaw, () => parasol(fabric, tilt));
  const pc = Math.cos(pyaw), ps = Math.sin(pyaw);
  const canopyX = gx + lean * pc;
  const canopyZ = gz - lean * ps;
  const shade = canopyShadeCenter(canopyX, canopyZ);
  const towels = 1 + Math.floor(rnd() * 3);
  for (let t = 0; t < towels; t++) {
    let tx, tz, a;
    if (t === 0) {
      // First towel of the group goes in the afternoon shade, just off the
      // pole so the mast is not in the middle of the back.
      tx = shade.x;
      tz = shade.z;
      const dx = tx - gx, dz = tz - gz;
      const d = Math.hypot(dx, dz);
      if (d < 1.15) {
        const ux = d > 0.08 ? dx / d : 0;
        const uz = d > 0.08 ? dz / d : 1;
        tx = gx + ux * 1.15;
        tz = gz + uz * 1.15;
      }
      a = Math.atan2(tz - gz, tx - gx);
    } else {
      a = rnd() * Math.PI * 2;
      const r = 1.9 + rnd() * 1.5;
      tx = gx + Math.cos(a) * r;
      tz = gz + Math.sin(a) * r;
    }
    if (!clearOfPier(tx)) continue;
    if (Math.abs(tx) > BEACH_HALF_W - 14) continue;
    const yaw = a + Math.PI / 2;
    onGround(tx, tz, yaw, () => towel(pick(FABRICS)));
    const pitch = [tx, tz, yaw];
    PITCHES.push(pitch);
    if (inCanopyShade(tx, tz, canopyX, canopyZ)) {
      shadedPitches.push({ pitch, gx, gz, pyaw, tilt });
    }
  }
  if (rnd() > 0.45) onGround(gx + 1.6, gz + 1.9, rnd() * 3, cooler);
}

// One free towel, in the shade, marked with a pennant so you can find it from
// the promenade. Prefer the middle of the bay, at the foot of the centre
// stairs — that is the shot you walk into.
let reservedPitch = null;
let beachLieInteraction = null;
{
  let best = null, bestScore = Infinity;
  for (const c of shadedPitches) {
    const [tx, tz] = c.pitch;
    const score = Math.hypot(tx, tz - 6);
    if (score < bestScore) { bestScore = score; best = c; }
  }
  if (best) {
    reservedPitch = best.pitch;
    const [tx, tz, yaw] = best.pitch;
    const gy = terrainHeight(tx, tz);
    const topFlag = addParasolFlag(best.gx, best.gz, best.pyaw, best.tilt);
    const pinFlag = addTowelPin(tx, tz, yaw);
    beachLieFlag = { top: topFlag, pin: pinFlag };
    // The pack rig's origin is the standing feet. Tipped onto its back that
    // puts the pelvis on the rolled sweater (local −Z) and floats the whole
    // body 8 cm over the cloth. Slide the rest point toward the foot of the
    // towel so the hips land on the yellow mat and the head at the pillow —
    // the same shift the sunbathers already use (`body.position.z = 0.82`).
    const lieAlong = 0.90;
    const sy = Math.sin(yaw), cy = Math.cos(yaw);
    beachLieInteraction = {
      type: 'lie',
      x: tx + lieAlong * sy,
      y: gy + TOWEL_TOP,
      z: tz + lieAlong * cy,
      centerX: tx,
      centerZ: tz,
      approachY: gy,
      yaw,
      halfWidth: 0.5,
      halfDepth: 1.05,
      triggerDistance: 0.95,
      label: "S'allonger",
    };
  }
}

// Volleyball court — poles, net and a taped-out rectangle.
{
  const cx = 60, cz = -12;
  for (const dx of [-4.6, 4.6]) {
    onGround(cx + dx, cz, 0, () => prop(() => shape(G.cylBase, M.steel, 0, 0, 0, 0.11, 2.5, 0.11)));
  }
  const gy = (terrainHeight(cx - 4.6, cz) + terrainHeight(cx + 4.6, cz)) / 2;
  const net = new THREE.Mesh(
    new THREE.PlaneGeometry(9.2, 1.0),
    new THREE.MeshBasicMaterial({ color: 0x1d1f22, transparent: true, opacity: 0.42,
      side: THREE.DoubleSide, depthWrite: false }),
  );
  net.position.set(cx, gy + 1.85, cz);
  scene.add(net);
  for (let i = 0; i < 4; i++) {
    const [ax, az] = [[-8, -9], [8, -9], [8, 9], [-8, 9]][i];
    const [bx, bz] = [[8, -9], [8, 9], [-8, 9], [-8, -9]][i];
    const mx = cx + (ax + bx) / 2, mz = cz + (az + bz) / 2;
    onGround(mx, mz, 0, () => box(M.fabricWhite, 0, 0.02,
      0, Math.abs(bx - ax) || 0.12, 0.04, Math.abs(bz - az) || 0.12));
  }
}

// ---------------------------------------------------------------------------
// The pier. Structurally the most important thing on the map: a beach is flat,
// and without this the web-swing physics has nothing above head height to
// anchor to for three hundred metres in any direction.
// ---------------------------------------------------------------------------
{
  // Ramp up from the promenade — 8 %, which a skater can take.
  const rampSteps = 12;
  for (let i = 0; i < rampSteps; i++) {
    const t0 = i / rampSteps, t1 = (i + 1) / rampSteps;
    const z0 = PIER_Z0 - 10 * t0, z1 = PIER_Z0 - 10 * t1;
    slab(M.deckWood, PIER_X - PIER_HALF, PIER_X + PIER_HALF, z1, z0 + 0.05,
      PROM_Y - 0.6, PROM_Y + (PIER_Y - PROM_Y) * t1);
  }
  // Deck.
  longSlab(M.deckWood, PIER_X - PIER_HALF, PIER_X + PIER_HALF, PIER_Z1, PIER_Z0 - 10,
    PIER_Y - 0.34, PIER_Y);
  // Pilings in pairs, all the way down to whatever the bed is doing.
  for (let z = PIER_Z0 - 12; z > PIER_Z1; z -= 8.5) {
    for (const dx of [-PIER_HALF + 1.4, PIER_HALF - 1.4]) {
      const px = PIER_X + dx;
      const bed = terrainHeight(px, z);
      box(M.piling, px, (bed + PIER_Y - 0.34) / 2, z, 0.46, PIER_Y - 0.34 - bed, 0.46);
    }
    // Cross-brace under the deck.
    box(M.piling, PIER_X, PIER_Y - 0.52, z, PIER_HALF * 2 - 2.2, 0.26, 0.26);
  }
  // Railings both sides, plus lamps.
  for (const dx of [-PIER_HALF + 0.35, PIER_HALF - 0.35]) {
    const px = PIER_X + dx;
    longSlab(M.piling, px - 0.07, px + 0.07, PIER_Z1, PIER_Z0 - 10, PIER_Y + 0.92, PIER_Y + 1.04);
    longSlab(M.piling, px - 0.05, px + 0.05, PIER_Z1, PIER_Z0 - 10, PIER_Y + 0.5, PIER_Y + 0.58);
    for (let z = PIER_Z0 - 12; z > PIER_Z1; z -= 3.2)
      box(M.piling, px, PIER_Y + 0.5, z, 0.11, 1.0, 0.11);
  }
  for (let z = PIER_Z0 - 22; z > PIER_Z1 + 8; z -= 22) {
    atY(PIER_Y, PIER_X - PIER_HALF + 1.1, z, 0, () => prop(() => lampPost(4.4)));
    atY(PIER_Y, PIER_X + PIER_HALF - 1.1, z, 0, () => prop(() => lampPost(4.4)));
  }
  // Pavilion at the head — the thing you walk out to.
  const HZ = PIER_Z1 + 16;
  atY(PIER_Y, PIER_X, HZ, 0, () => {
    prop(() => {
      for (const [dx, dz] of [[-5, -5], [5, -5], [-5, 5], [5, 5]])
        box(M.piling, dx, 1.6, dz, 0.28, 3.2, 0.28);
      box(M.deckWood, 0, 3.32, 0, 12, 0.24, 12);
    });
    shape(G.cone, M.guardRed, 0, 3.44, 0, 15, 2.6, 15);
  });
  // Benches out on the head, back to back, facing along the bay.
  for (const dz of [-4.6, 4.6])
    atY(PIER_Y, PIER_X, HZ + dz, dz > 0 ? 0 : Math.PI, () => prop(bench));
  // A wider deck around the pavilion so it is a place, not a corridor.
  slab(M.deckWood, PIER_X - 11, PIER_X + 11, HZ - 8, HZ + 8, PIER_Y - 0.34, PIER_Y);
  for (const dx of [-11, 11]) {
    slab(M.piling, PIER_X + dx - 0.07, PIER_X + dx + 0.07, HZ - 8, HZ + 8,
      PIER_Y + 0.92, PIER_Y + 1.04);
  }
}

// ---------------------------------------------------------------------------
// Offshore. Read only as silhouettes, which is exactly what they are for —
// they give the horizon a scale, and at sunset they are the thing in front of
// the sun.
// ---------------------------------------------------------------------------
function sailboat(len, opts = {}) {
  const hullMat = opts.navy ? M.hullNavy : M.hullWhite;
  // Sleek hydrodynamic monohull
  shape(G.sailHull, hullMat, 0, 0, 0, len * 0.32, len * 0.22, len);
  // Underwater antifouling waterline stripe
  shape(G.sailHull, M.hullDark, 0, -len * 0.035, 0, len * 0.325, len * 0.08, len * 1.005);
  // Teak deck cockpit well
  box(M.hullTeak, 0, len * 0.038, -len * 0.16, len * 0.20, len * 0.015, len * 0.36);
  // Low-profile coachroof / deckhouse
  box(hullMat, 0, len * 0.052, len * 0.08, len * 0.18, len * 0.038, len * 0.38);
  // Smoked ribbon windows on coachroof
  box(M.yachtGlass, 0, len * 0.055, len * 0.08, len * 0.188, len * 0.022, len * 0.34);
  // Mast
  shape(G.cylBase, M.steel, 0, len * 0.04, len * 0.06, len * 0.018, len * 1.22, len * 0.018);
  // Spreaders (cross-trees)
  box(M.steel, 0, len * 0.52, len * 0.06, len * 0.14, len * 0.010, len * 0.012);
  box(M.steel, 0, len * 0.82, len * 0.06, len * 0.10, len * 0.008, len * 0.010);
  // Boom extending aft
  shape(G.cylBase, M.steel, 0, len * 0.16, 0.06, len * 0.014, len * 0.46, len * 0.014, { rx: Math.PI / 2 });
  // Mainsail (aerodynamic billowing curve)
  shape(G.mainsail, opts.stripe ? M.sailStripe : M.sail, 0, len * 0.16, 0.06, len * 0.95, len * 1.02, len * 0.95);
  // Jib / Genoa (headsail)
  shape(G.jib, M.sail, 0, len * 0.04, 0, len * 0.95, len * 1.02, len * 0.95);
  // Forestay and backstay wires
  shape(G.cylBase, M.steel, 0, len * 0.05, len * 0.45, len * 0.005, len * 1.30, len * 0.005, { rx: -0.34 });
  shape(G.cylBase, M.steel, 0, len * 0.05, -len * 0.46, len * 0.005, len * 1.35, len * 0.005, { rx: 0.38 });
  // Bow pulpit rail
  shape(G.bowRail, M.chrome, 0, len * 0.045, len * 0.34, len * 0.9, len * 0.8, len * 0.9);
  // Cockpit helm wheel
  shape(G.lens, M.chrome, 0, len * 0.07, -len * 0.30, len * 0.06, len * 0.06, len * 0.015);
  // Navigation lights (port red, starboard green, masthead white)
  box(M.navRed, -len * 0.12, len * 0.05, len * 0.16, 0.08, 0.05, 0.08);
  box(M.navGreen, len * 0.12, len * 0.05, len * 0.16, 0.08, 0.05, 0.08);
  box(M.navWhite, 0, len * 1.25, len * 0.06, 0.06, 0.06, 0.06);
}

function motorYacht(len, opts = {}) {
  const hullMat = opts.navy ? M.hullNavy : M.hullWhite;
  // Sleek deep-V hull
  shape(G.yachtHull, hullMat, 0, 0, 0, len * 0.34, len * 0.22, len);
  // Bootstripe / dark hull bottom
  shape(G.yachtHull, M.hullDark, 0, -len * 0.032, 0, len * 0.344, len * 0.08, len * 1.005);
  // Teak swim platform at transom
  box(M.hullTeak, 0, len * 0.022, -len * 0.46, len * 0.28, len * 0.015, len * 0.10);
  // Teak aft cockpit deck
  box(M.hullTeak, 0, len * 0.038, -len * 0.28, len * 0.24, len * 0.015, len * 0.20);
  // Main aerodynamic salon superstructure
  shape(G.yachtCabin, M.hullWhite, 0, len * 0.055, -len * 0.02, len * 0.86, len * 0.86, len * 0.86);
  // Smoked panoramic window band
  box(M.yachtGlass, 0, len * 0.075, len * 0.02, len * 0.25, len * 0.045, len * 0.42);
  // Upper flybridge deck / lounge
  box(M.hullWhite, 0, len * 0.155, -len * 0.06, len * 0.20, len * 0.022, len * 0.32);
  // Flybridge wind deflector
  box(M.yachtGlass, 0, len * 0.178, len * 0.06, len * 0.18, len * 0.035, len * 0.04);
  // Hardtop roof over flybridge
  box(M.hullWhite, 0, len * 0.225, -len * 0.08, len * 0.18, len * 0.016, len * 0.26);
  // Hardtop support pillars (stainless steel)
  box(M.chrome, -len * 0.08, len * 0.185, -len * 0.04, 0.05, len * 0.07, 0.05);
  box(M.chrome, len * 0.08, len * 0.185, -len * 0.04, 0.05, len * 0.07, 0.05);
  box(M.chrome, -len * 0.08, len * 0.185, -len * 0.16, 0.05, len * 0.07, 0.05);
  box(M.chrome, len * 0.08, len * 0.185, -len * 0.16, 0.05, len * 0.07, 0.05);
  // Radar arch on hardtop
  shape(G.radarArch, M.hullWhite, 0, len * 0.23, -len * 0.14, len * 0.65, len * 0.65, len * 0.65);
  // Satellite radomes
  shape(G.radome, M.hullWhite, -len * 0.05, len * 0.28, -len * 0.14, len * 0.045, len * 0.035, len * 0.045);
  shape(G.radome, M.hullWhite, len * 0.05, len * 0.28, -len * 0.14, len * 0.045, len * 0.035, len * 0.045);
  // VHF antenna
  shape(G.cylBase, M.chrome, len * 0.07, len * 0.24, -len * 0.16, 0.015, len * 0.24, 0.015, { rx: -0.15 });
  // Foredeck sun cushions
  box(opts.navy ? M.cushionWhite : M.cushionNavy, 0, len * 0.065, len * 0.25, len * 0.13, len * 0.02, len * 0.16);
  // Bow pulpit rail
  shape(G.bowRail, M.chrome, 0, len * 0.055, len * 0.36, len * 0.95, len * 0.85, len * 0.95);
  // Navigation lights
  box(M.navRed, -len * 0.14, len * 0.11, len * 0.15, 0.08, 0.05, 0.08);
  box(M.navGreen, len * 0.14, len * 0.11, len * 0.15, 0.08, 0.05, 0.08);
  box(M.navWhite, 0, len * 0.31, -len * 0.14, 0.06, 0.06, 0.06);
}

function sportCruiser(len) {
  // Sleek open sport yacht / day boat
  shape(G.yachtHull, M.hullNavy, 0, 0, 0, len * 0.33, len * 0.20, len);
  shape(G.yachtHull, M.hullWhite, 0, len * 0.01, 0, len * 0.32, len * 0.12, len * 0.98);
  // Teak cockpit & swim platform
  box(M.hullTeak, 0, len * 0.025, -len * 0.15, len * 0.24, len * 0.015, len * 0.55);
  // Low raked sports windshield
  box(M.yachtGlass, 0, len * 0.085, len * 0.08, len * 0.24, len * 0.06, len * 0.12, 0.25);
  // Swept-back radar arch
  shape(G.radarArch, M.hullWhite, 0, len * 0.07, -len * 0.12, len * 0.8, len * 0.8, len * 0.8);
  // Radome
  shape(G.radome, M.hullWhite, 0, len * 0.21, -len * 0.12, len * 0.05, len * 0.035, len * 0.05);
  // Aft sun lounger pad
  box(M.cushionWhite, 0, len * 0.048, -len * 0.30, len * 0.20, len * 0.025, len * 0.18);
  // Bow rail
  shape(G.bowRail, M.chrome, 0, len * 0.05, len * 0.34, len * 0.85, len * 0.75, len * 0.85);
  // Nav lights
  box(M.navRed, -len * 0.13, len * 0.08, len * 0.10, 0.08, 0.05, 0.08);
  box(M.navGreen, len * 0.13, len * 0.08, len * 0.10, 0.08, 0.05, 0.08);
  box(M.navWhite, 0, len * 0.22, -len * 0.12, 0.06, 0.06, 0.06);
}

const BOATS = [
  [-160, -205, 0.65, 'sail', 11],
  [45, -232, -0.45, 'superSail', 14],
  [132, -182, 1.85, 'motor', 15],
  [-28, -305, 0.35, 'motorNavy', 18],
  [210, -265, -1.15, 'sail', 10],
  [-238, -248, 2.35, 'sport', 12],
  [90, -355, 0.85, 'superSail', 13],
  [-88, -172, 1.15, 'sport', 10],
  [172, -322, -0.75, 'motor', 16],
  [-192, -342, 0.45, 'sail', 12],
];
for (const [bx, bz, ry, kind, len] of BOATS) {
  const prev = LIFT;
  LIFT = SEA_Y - len * 0.042;    // sit them naturally at the waterline
  frame(bx, bz, ry, () => {
    if (kind === 'sail') sailboat(len);
    else if (kind === 'superSail') sailboat(len, { stripe: true, navy: true });
    else if (kind === 'motor') motorYacht(len);
    else if (kind === 'motorNavy') motorYacht(len, { navy: true });
    else if (kind === 'sport') sportCruiser(len);
  });
  LIFT = prev;
}

flushKits();

// ---------------------------------------------------------------------------
// Water. Added straight to `scene`: the sea must not collide (the wade barrier
// below does that job at one known Z) and it must not be a floor.
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Water. Three separate things, all driven from one swash model so they can
// never disagree with each other:
//
//   1. SWELL on the open sea — vertex displacement on the GPU, flattened to
//      nothing as it reaches the shallows so it cannot poke through the sand.
//   2. SWASH on the sand — the run-up and drain-back. This is the thing that
//      makes a beach look alive, and it is asymmetric: the water rushes up in
//      about a fifth of the cycle and takes the rest of it to drain away.
//   3. The WET MARK left behind, which dries back far more slowly than the
//      water retreats — which is why a beach always has a dark band well above
//      where the water currently is.
//
// The swash position is computed once per frame in JS and handed to both the
// foam and the wet sand as a uniform, rather than being written twice in GLSL
// where the two copies would drift apart.
// ---------------------------------------------------------------------------
const SWASH = { edge: 0, high: 0, period: 6.4 };
function updateSwash(t, dt) {
  const cyc = Math.floor(t / SWASH.period);
  const ph = t / SWASH.period - cyc;
  // No two runs reach the same place — sets arrive in groups. Hashed off the
  // cycle number so a given second always looks the same.
  const h = Math.abs(Math.sin(cyc * 12.9898) * 43758.5453) % 1;
  const reach = 3.0 + h * 5.6;
  const e = ph < 0.22
    ? THREE.MathUtils.smoothstep(ph, 0, 0.22)
    : 1 - THREE.MathUtils.smoothstep(ph, 0.22, 1);
  SWASH.edge = -1.6 + e * reach;
  SWASH.high = Math.max(SWASH.edge, SWASH.high - dt * 0.5);
}

// Mottled cloud for breaking up the foam. Drawn nine times per blob so the
// tile wraps — a seam in this reads as a hard line running out to sea.
function makeFoamTexture() {
  const S = 256;
  const c = Object.assign(document.createElement('canvas'), { width: S, height: S });
  const g = c.getContext('2d');
  g.fillStyle = '#000';
  g.fillRect(0, 0, S, S);
  g.globalCompositeOperation = 'lighter';
  let sd = 24680;
  const r = () => ((sd = (sd * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let i = 0; i < 150; i++) {
    const x = r() * S, y = r() * S, rad = 5 + r() * 20, k = 0.35 + r() * 0.5;
    for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) {
      const gr = g.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, rad);
      gr.addColorStop(0, `rgba(255,255,255,${k})`);
      gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr;
      g.beginPath();
      g.arc(x + ox, y + oy, rad, 0, Math.PI * 2);
      g.fill();
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = maxAniso;
  return t;
}

const wetUniforms = { uHigh: { value: 0 } };
M.wetSand.onBeforeCompile = sh => {
  sh.uniforms.uHigh = wetUniforms.uHigh;
  sh.vertexShader = sh.vertexShader
    .replace('#include <common>', `#include <common>
      attribute float aD; attribute float aX;
      varying float vD; varying float vX;`)
    .replace('#include <begin_vertex>', `#include <begin_vertex>
      vD = aD; vX = aX;`);
  sh.fragmentShader = sh.fragmentShader
    .replace('#include <common>', `#include <common>
      uniform float uHigh;
      varying float vD; varying float vX;`)
    .replace('vec4 diffuseColor = vec4( diffuse, opacity );', `
      vec4 diffuseColor = vec4( diffuse, opacity );
      float hi = uHigh + sin(vX * 0.037) * 1.7 + sin(vX * 0.0136 + 2.1) * 2.5;
      diffuseColor.a *= 1.0 - smoothstep(hi - 1.2, hi + 3.0, vD);`);
};

const seaUniforms = {
  uTime: { value: 0 },
  uSwell: { value: 1 },
  uShallow: { value: new THREE.Color(0x74d2d4) },
};
const seaMat = new THREE.MeshPhysicalMaterial({
  color: 0x2d7fa8,
  roughness: 0.16,
  metalness: 0,
  transparent: true,
  opacity: 0.86,
  normalMap: waterN,
  normalScale: new THREE.Vector2(0.5, 0.5),
  clearcoat: 0.9,
  clearcoatRoughness: 0.12,
});
// Swell on the GPU. The plane is rotated -90° about X, so its local +Z is
// world +Y: displacing `transformed.z` raises the water. Normals are derived
// analytically from the same wave sum, because a displaced surface with its
// original flat normal is still lit like a mirror.
seaMat.onBeforeCompile = sh => {
  sh.uniforms.uTime = seaUniforms.uTime;
  sh.uniforms.uSwell = seaUniforms.uSwell;
  sh.uniforms.uShallow = seaUniforms.uShallow;
  sh.vertexShader = sh.vertexShader
    .replace('#include <common>', `#include <common>
      uniform float uTime;
      uniform float uSwell;
      varying float vWz;
      float seaH(vec2 p, float t, out vec2 grad) {
        float h = 0.0;
        grad = vec2(0.0);
        float k1 = 0.085, a1 = 0.46, s1 = 1.05;
        float p1 = p.y * k1 + t * s1;
        h += sin(p1) * a1;  grad.y += cos(p1) * a1 * k1;
        float k2 = 0.052, a2 = 0.32, s2 = 0.72;
        float p2 = (p.y * 0.96 + p.x * 0.28) * k2 - t * s2;
        h += sin(p2) * a2;
        grad.y += cos(p2) * a2 * k2 * 0.96;
        grad.x += cos(p2) * a2 * k2 * 0.28;
        float k3 = 0.24, a3 = 0.09, s3 = 2.1;
        float p3 = (p.y + p.x * 0.5) * k3 + t * s3;
        h += sin(p3) * a3;
        grad.y += cos(p3) * a3 * k3;
        grad.x += cos(p3) * a3 * k3 * 0.5;
        return h;
      }`)
    .replace('#include <begin_vertex>', `#include <begin_vertex>
      vec2 wpos = (modelMatrix * vec4(position, 1.0)).xz;
      vWz = wpos.y;
      vec2 sGrad;
      float sH = seaH(wpos, uTime, sGrad);
      // Flatten into the shallows: at full height the swell lifted the sheet
      // above the sand and flooded the beach, and dropped it below the bed on
      // the trough so you saw straight through the water into the ground.
      float deep = 1.0 - smoothstep(-104.0, -58.0, wpos.y);
      float amp = deep * uSwell;
      transformed.z += sH * amp;
      sGrad *= amp;`)
    .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
      {
        vec2 g2;
        vec2 wp2 = (modelMatrix * vec4(position, 1.0)).xz;
        seaH(wp2, uTime, g2);
        float dp = 1.0 - smoothstep(-104.0, -58.0, wp2.y);
        g2 *= dp * uSwell;
        objectNormal = normalize(vec3(-g2.x, g2.y, 1.0));
      }`);
  sh.fragmentShader = sh.fragmentShader
    .replace('#include <common>', `#include <common>
      varying float vWz;
      uniform vec3 uShallow;`)
    .replace('vec4 diffuseColor = vec4( diffuse, opacity );', `
      vec4 diffuseColor = vec4( diffuse, opacity );
      // Shallows read pale TURQUOISE, not transparent. Fading the alpha out
      // instead simply revealed the sand of the sea bed, and since that bed is
      // the same bright sand as the beach the whole bay turned into more
      // beach. Shallow water is pale because of what it scatters back.
      float dep = clamp((-46.0 - vWz) / 34.0, 0.0, 1.0);
      diffuseColor.rgb = mix(uShallow, diffuseColor.rgb, dep);
      diffuseColor.a *= mix(0.66, 1.0, dep);`);
};
// 200 x 140 segments: the swell's shortest component is a 26 m wave, and at
// one segment per 9 m that still resolves. One segment, as it was, cannot
// displace at all.
const sea = new THREE.Mesh(new THREE.PlaneGeometry(1800, 1200, 200, 140), seaMat);
sea.rotation.x = -Math.PI / 2;
// Reaches well inland of the waterline so the shore edge is where the sand
// rises through it, not where the mesh happens to stop — and far enough to
// still cover the bay where shoreAt bows the water furthest up the beach.
sea.position.set(0, SEA_Y, SHORE_Z + 26 - 600);
sea.receiveShadow = false;
scene.add(sea);

// The wash. Everything about where it is comes from uEdge; the texture only
// breaks it up so it reads as surf rather than as a painted stripe.
const foamTex = makeFoamTexture();
const foamUniforms = {
  uTime: { value: 0 },
  uEdge: { value: 0 },
  uMap: { value: foamTex },
  uColor: { value: new THREE.Color(0xf2fbff) },
  uOpacity: { value: 0.5 },
};
const foamMat = new THREE.ShaderMaterial({
  uniforms: foamUniforms,
  transparent: true,
  depthWrite: false,
  blending: THREE.NormalBlending,
  vertexShader: `
    attribute float aD;
    attribute float aX;
    varying float vD;
    varying float vX;
    varying vec2 vUv;
    void main() {
      vD = aD; vX = aX; vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: `
    uniform float uTime, uEdge, uOpacity;
    uniform sampler2D uMap;
    uniform vec3 uColor;
    varying float vD;
    varying float vX;
    varying vec2 vUv;
    void main() {
      // A run-up does not arrive along three hundred metres of bay at once.
      float edge = uEdge + sin(vX * 0.037) * 1.7 + sin(vX * 0.0136 + 2.1) * 2.5;
      float d = vD;
      float lead  = 1.0 - smoothstep(0.0, 1.8, abs(d - edge));      // the edge itself
      float sheet = (1.0 - smoothstep(edge - 0.3, edge + 0.6, d))
                  * smoothstep(-11.0, -1.5, d) * 0.16;              // draining behind it
      // Where the small waves are breaking. Two lines a few metres apart, as
      // a calm shore break usually is, and they travel in as the swell does.
      float bl1 = -14.0 + sin(uTime * 0.52 + vX * 0.045) * 2.8;
      float bl2 = -25.0 + sin(uTime * 0.38 + vX * 0.031 + 1.4) * 3.4;
      float brk = (1.0 - smoothstep(0.0, 2.4, abs(d - bl1))) * 0.42
                + (1.0 - smoothstep(0.0, 2.8, abs(d - bl2))) * 0.24;
      float a = clamp(lead * 1.0 + sheet + brk, 0.0, 1.0);
      float n = texture2D(uMap, vUv * vec2(60.0, 2.5)
                + vec2(uTime * 0.013, uTime * 0.05)).r;
      a *= 0.55 + 0.45 * n;
      if (a < 0.01) discard;
      gl_FragColor = vec4(uColor, a * uOpacity);
    }`,
});
const foam = conformedStrip(
  foamMat, -BEACH_HALF_W, BEACH_HALF_W, -78, -14, 0.09, 220, 70, null, true,
);
foam.renderOrder = 2;
scene.add(foam);

// ---------------------------------------------------------------------------
// Collision world, ground probe, controller.
// ---------------------------------------------------------------------------
const rays = {
  ray: new THREE.Raycaster(),
  tmpNormal: new THREE.Vector3(),
  tempMatrix: new THREE.Matrix4(),
  normalMatrix: new THREE.Matrix3(),
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
  if (Math.abs(x) < 440 && Math.abs(z) < 440) {
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

// The wade barrier. This is the whole of the "you wade, you don't drown"
// contract: an invisible wall across the bay at the depth where the water
// reaches the waist. It is registered straight with cityBoxes rather than
// built as geometry because there is nothing to draw — and `prop: true` marks
// it solid at every height, so the ground probe can never treat its top as a
// floor and stand the player on the open sea.
// It is cut into three so the PIER can cross it: a single wall spanning the
// bay at deck height would stop you dead half way along the pier. Either side
// of the pier corridor the wall is full height; inside the corridor it stops
// below the deck, so you may walk out over the water but not step off into it.
const PIER_GAP0 = PIER_X - PIER_HALF - 1.5;
const PIER_GAP1 = PIER_X + PIER_HALF + 1.5;
for (const [x0, x1, y1] of [
  [-420, PIER_GAP0, 9],
  [PIER_GAP0, PIER_GAP1, PIER_Y - 1.4],
  [PIER_GAP1, 420, 9],
]) {
  bw.add({
    x0, y0: -12, z0: WADE_Z - 1.2, x1, y1, z1: WADE_Z,
    collide: true, tall: false, prop: true,
  });
}

let player = null;
const ctrl = new Controller(bw, groundFn, castFn, {
  onReset: () => ctrl.rescueTo(spawnPoint),
  onLand: impact => { if (player) player.onLand(impact); },
});

const travelParams = new URLSearchParams(location.search);
const arrivedFromTravel = travelParams.get('arrival') === 'la';
const arrivalSide = beachTravelBounds.width / 2 + 1.1;
const beachArrivalPoint = new THREE.Vector3(
  BEACH_TRAVEL_CAR.x + Math.sin(BEACH_TRAVEL_CAR.yaw) * arrivalSide,
  BEACH_TRAVEL_CAR.ground + 0.2,
  BEACH_TRAVEL_CAR.z + Math.cos(BEACH_TRAVEL_CAR.yaw) * arrivalSide,
);
// Cold start puts you on the promenade at the top of the middle steps, facing
// the water — the shot the map is built around.
const spawnPoint = arrivedFromTravel
  ? beachArrivalPoint.clone()
  : new THREE.Vector3(0, PROM_Y + 1.4, 34);
ctrl.rescueTo(spawnPoint);

const rig = new CameraRig(camera, bw);
const input = new Input(renderer.domElement);
function requestGamePointerLock() {
  try {
    const pending = renderer.domElement.requestPointerLock?.();
    pending?.catch?.(() => {});
  } catch (_) {
    // Embedded previews may refuse pointer lock; keyboard play still works.
  }
}

// ---------------------------------------------------------------------------
// Time of day. Three states, so this is keyed rather than the day/night pair
// the villa and the shrine use. Sunset is the reason: on a west-facing beach
// the sun goes down over the WATER (-Z), and that one fact drives the sun
// direction, the sky glow, the fog colour and the sheen on the wet sand.
// ---------------------------------------------------------------------------
const TIME_STATES = {
  day: {
    // Afternoon on a west-facing beach: the sun has crossed to the seaward
    // side, so the seawall's sea face is lit. Keeping it inland left that face
    // — the one every shot from the sand looks straight at — in full shadow.
    sunDir: new THREE.Vector3(-80, 155, -20).normalize(),
    sun: { color: 0xfff4e2, intensity: 2.6, visible: true },
    moon: 0,
    // Dry sand is a huge bounce card; a beach has far more fill than a street.
    hemi: { sky: 0xdcecff, ground: 0xd8c4a2, intensity: 1.15 },
    sky: { horizon: 0xdfeaf2, zenith: 0x5b90d2, glow: 0xffeccc, strength: 0.5, tightness: 10 },
    fog: { color: 0xc8dcea, near: 190, far: 900 },
    exposure: 0.98,
    env: 0.5,
    sea: { color: 0x2d7fa8, roughness: 0.16, opacity: 0.86 },
    wetSand: 0x9c8a6a,
    shallow: 0x74d2d4,
    foam: 0.72,
    lamp: 0,
  },
  // Golden hour: the sun sits on the horizon straight out to sea, so it rakes
  // the whole beach lengthwise and every wet surface throws it back.
  sunset: {
    sunDir: new THREE.Vector3(-18, 14, -100).normalize(),
    sun: { color: 0xffb264, intensity: 3.1, visible: true },
    moon: 0,
    hemi: { sky: 0xffd2a0, ground: 0x8a6a52, intensity: 0.8 },
    // A loose glow lobe at this strength swallows half the sky and reads as a
    // detonation rather than a sunset; the disc wants to be tight and the
    // colour wants to spread through the horizon band instead.
    sky: { horizon: 0xff9d5c, zenith: 0x2a3f7a, glow: 0xfff0b4, strength: 0.95, tightness: 15 },
    fog: { color: 0xe8a06c, near: 150, far: 780 },
    exposure: 1.06,
    env: 0.34,
    sea: { color: 0x46708c, roughness: 0.1, opacity: 0.88 },
    wetSand: 0xb08a6a,
    shallow: 0xe0b48e,
    foam: 0.78,
    lamp: 0.6,
  },
  night: {
    sunDir: new THREE.Vector3(60, 120, -80).normalize(),
    sun: { color: 0x9fc4f2, intensity: 0, visible: false },
    moon: 0.9,
    hemi: { sky: 0x2a3f5c, ground: 0x14161c, intensity: 0.3 },
    // Not quite black: a pure void overhead reads as a missing skybox, and the
    // horizon needs to sit close enough to the fog that the sea does not end
    // on a hard line.
    sky: { horizon: 0x14243c, zenith: 0x070c1c, glow: 0x9fc4f2, strength: 0.3, tightness: 22 },
    fog: { color: 0x101c2e, near: 100, far: 620 },
    exposure: 1.02,
    env: 0.16,
    sea: { color: 0x0e2740, roughness: 0.08, opacity: 0.9 },
    wetSand: 0x3a4250,
    shallow: 0x2c5570,
    foam: 0.42,
    lamp: 2.6,
  },
};

let beachTime = 'day';
function setBeachTime(name) {
  const s = TIME_STATES[name] ?? TIME_STATES.day;
  beachTime = TIME_STATES[name] ? name : 'day';

  sunDir.copy(s.sunDir);
  sun.color.setHex(s.sun.color);
  sun.intensity = s.sun.intensity;
  sun.visible = s.sun.visible;
  moon.intensity = s.moon;
  moon.visible = s.moon > 0;

  hemi.color.setHex(s.hemi.sky);
  hemi.groundColor.setHex(s.hemi.ground);
  hemi.intensity = s.hemi.intensity;

  skyUniforms.uHorizon.value.setHex(s.sky.horizon);
  skyUniforms.uZenith.value.setHex(s.sky.zenith);
  skyUniforms.uGlow.value.setHex(s.sky.glow);
  skyUniforms.uGlowDir.value.copy(s.sunDir);
  skyUniforms.uGlowStrength.value = s.sky.strength;
  skyUniforms.uGlowTightness.value = s.sky.tightness;

  scene.fog.color.setHex(s.fog.color);
  scene.fog.near = s.fog.near;
  scene.fog.far = s.fog.far;
  renderer.toneMappingExposure = s.exposure;
  scene.environmentIntensity = s.env;

  seaMat.color.setHex(s.sea.color);
  seaMat.roughness = s.sea.roughness;
  seaMat.opacity = s.sea.opacity;
  M.wetSand.color.setHex(s.wetSand);
  seaUniforms.uShallow.value.setHex(s.shallow);
  foamUniforms.uOpacity.value = s.foam;
  // The promenade and pier lamps: emissive glass rather than real lights, so
  // a hundred of them cost nothing. Only the sky decides whether they are on.
  M.lampGlass.emissive.setHex(s.lamp > 0 ? 0xffe9b0 : 0x000000);
  M.lampGlass.emissiveIntensity = s.lamp;
  // Carnival bulbs stay faintly on in daylight (they are painted glass) and
  // take over the silhouette after dark.
  for (const m of ferrisBulbMats)
    m.emissiveIntensity = s.lamp > 0 ? 1.2 + s.lamp * 0.55 : 0.32;
  M.shopWarm.emissiveIntensity = s.lamp > 0 ? 0.85 + s.lamp * 0.25 : 0.35;

  updateSunShadow(ctrl.pos);
  // Kept in sync for anything that reads the shared night flag (the avatar's
  // sleeves, and the villa's own toggle when we travel back).
  window.__nightMode = beachTime === 'night';
  window.__beachTime = beachTime;
  setPeopleForTime(beachTime === 'night');
  syncTimeButtons();
}

function syncTimeButtons() {
  document.querySelectorAll('.tt-btn').forEach(btn =>
    btn.classList.toggle('active', btn.dataset.time === beachTime));
}
document.querySelectorAll('.tt-btn').forEach(btn => {
  btn.addEventListener('click', () => setBeachTime(btn.dataset.time));
});

// ---------------------------------------------------------------------------
// Avatar.
// ---------------------------------------------------------------------------
player = new Player(scene);
await player.load('girl', girlMatFor);
// The pack's hairstyle only works under the cap, and the beach takes the cap
// off — so the crown is rebuilt and both halves put on the same colour.
player.addWardrobePart('hairCrown', harmoniseHair(player, {
  scalp: await charImage(CHAR_MATS?.MAT_SurvGirl_Head?.tex || 'survgirl_head_diff.webp'),
  strands: await charImage(CHAR_MATS?.MAT_SurvGirl_Hair?.tex || 'survgirl_hair_diff.webp'),
  strandsAO: await charImage(CHAR_MATS?.MAT_SurvGirl_Hair?.aoTex || 'survgirl_hair_ao.webp'),
}));


// ===========================================================================
// PHASE 3 — the people.
//
// Every one of them is a Ready Player Me guest from glb/visitors, NEVER the
// pack rig: the player is `girl` from chars/glb, and a crowd built from that
// base is a crowd wearing the player's own face. The airport already made this
// choice for its cabin; the zoo did not, which is what gave it away.
//
// Posing them at all needed crowd.js taught to read both skeleton conventions
// (see rigOf / setJoint there) — before that the guests could only walk, and
// every seated or lying figure would have had to be the player's body again.
// ===========================================================================
const beachPeople = [];      // { group, mixer, pose, kind, ... } — ticked below
const nightPeople = [];      // shown only after dark
const dayPeople = [];        // hidden after dark (the swimmers)

// The Ready Player Me guests ship BAREFOOT: one mesh, one 1024 atlas, no shoe
// geometry and nothing in the texture to tint. Measured, their foot is 0.127 of
// body height — if anything SMALLER than life (~0.15) — so the problem was
// never the size. It is that a bare low-poly foot at this scale reads as a pale
// slab. A shoe hull parented to the foot bone follows every pose for free.
const SHOE_GEO = new THREE.SphereGeometry(0.5, 10, 7);
const SHOE_MATS = [0xf2f0e8, 0x232833, 0x2f5d8a, 0xd8514a, 0xe8dcc4, 0x3c6b4a]
  .map(c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.72, metalness: 0 }));
const _toeDir = new THREE.Vector3();
const _shoeUp = new THREE.Vector3(0, 1, 0);
function addFootwear(body) {
  const mat = pick(SHOE_MATS);
  for (const [fn, tn] of [['LeftFoot', 'LeftToeBase'], ['RightFoot', 'RightToeBase'],
                          ['foot_l', 'ball_l'], ['foot_r', 'ball_r']]) {
    const foot = body.getObjectByName(fn), toe = body.getObjectByName(tn);
    if (!foot || !toe) continue;
    const len = toe.position.length();     // ankle -> ball, in the foot's own units
    if (!(len > 1e-4)) continue;
    _toeDir.copy(toe.position).normalize();
    const shoe = new THREE.Mesh(SHOE_GEO, mat);
    // Long axis down the foot, whatever the bone's own frame happens to be.
    shoe.quaternion.setFromUnitVectors(_shoeUp, _toeDir);
    shoe.position.copy(_toeDir).multiplyScalar(len * 0.60);
    shoe.scale.set(len * 0.74, len * 1.55, len * 0.74);
    shoe.castShadow = true;
    foot.add(shoe);
  }
}

function guestVisitor(g, opts = {}) {
  const v = makeVisitor(g.scene, g.walkClip, rnd, {
    guest: g, idleClip: g.idleClip, look: 'beach', ...opts,
  });
  if (!opts.barefoot && !opts.authoredBody) addFootwear(v.group);
  return v;
}

// Sunbathers (and anyone else built through poseHolder) are barefoot. The RPM
// mesh's calves and feet are jeans plus a shoe last; hideAuthoredLowerLegs
// collapses that geometry and buildBareLowerLegs lofts anatomical legs onto
// the same Mixamo skeleton.

// A figure that holds a pose instead of walking. The mixer still writes frame
// zero every update, so the pose is re-applied AFTER it — which is also what
// lets these breathe rather than standing like statuary.
// Sit a posed body down by its HIPS. A folded pose leaves the root bone at
// standing height, so placing the group on the sand leaves the figure hovering
// a leg's length above it — which is exactly what the fire circle did.
// Stand a posed figure on a surface by its SOLES.
//
// Same trap as the hips above, one joint further down: bending the knees lifts
// the FEET, because the root bone does not move. A skater whose group origin
// sits on the board therefore floats above it by however much the crouch
// shortens the legs — measured at 7-10 cm here, which is exactly the gap you
// could see under the boards. The ball players were 6 cm up for the same
// reason.
//
// `ankleH` is measured ONCE in the unposed stance, where the soles are on the
// group origin by definition, so it is this figure's own ankle height at this
// figure's own scale. After that one pass per frame is exact: moving
// body.position.y moves the feet one for one.
const FOOT_BONES = ['foot_l', 'foot_r', 'LeftFoot', 'RightFoot',
  'LeftToeBase', 'RightToeBase', 'LeftToe_End', 'RightToe_End'];
const SOLE_ABOVE_BONE = 0.02;
const _footV = new THREE.Vector3();
const _originV = new THREE.Vector3();
const _hold = new THREE.Vector3();
function measureAnkle(rec) {
  const body = rec.body || rec.group;
  rec.feet = FOOT_BONES.map(n => body.getObjectByName(n)).filter(Boolean);
  if (!rec.feet.length) return rec;
  rec.group.updateMatrixWorld(true);
  body.getWorldPosition(_originV);
  let m = Infinity;
  for (const f of rec.feet) { f.getWorldPosition(_footV); m = Math.min(m, _footV.y); }
  if (isFinite(m)) rec.ankleH = m - _originV.y;
  return rec;
}
function standSolesOn(p, targetY) {
  if (!p.feet || !p.feet.length || p.ankleH === undefined || !p.body) return;
  p.group.updateMatrixWorld(true);
  let m = Infinity;
  for (const f of p.feet) { f.getWorldPosition(_footV); m = Math.min(m, _footV.y); }
  if (!isFinite(m)) return;
  p.body.position.y += targetY - (m - p.ankleH);
}
// Mixamo hip-flex throws the feet FORWARD (character +Z = board WIDTH). A
// Y-only plant left them hovering beside the deck. Each frame: reset the
// body, pose, then slide it so the foot cluster sits on the board.
function plantSkateFeet(p) {
  const body = p.body, bones = p.feet;
  if (!body || !bones || !bones.length) return;
  body.position.set(0, 0, 0);
  p.group.updateMatrixWorld(true);
  let cx = 0, cz = 0, minY = Infinity, n = 0;
  for (const f of bones) {
    f.getWorldPosition(_footV);
    p.group.worldToLocal(_hold.copy(_footV));
    cx += _hold.x;
    cz += _hold.z;
    if (_hold.y < minY) minY = _hold.y;
    n++;
  }
  if (!n || !isFinite(minY)) return;
  body.position.set(
    -cx / n,
    (p.deckTop + SOLE_ABOVE_BONE) - minY,
    -cz / n);
}

const _hipV = new THREE.Vector3();
const _lieScale = new THREE.Vector3();
// A Mixamo laid on its back maps bind -Z (the back of the mesh) onto world Y.
// Anchor the pelvis centre one half-body thickness above the cloth. Measuring
// the whole posed AABB is wrong here: an open hand can be lower than the back,
// making the hand touch the towel while the torso floats in the air.
function liftOntoTowel(p, clothTop = TOWEL_TOP, clearance = 0.02) {
  const hips = rootBoneOf(p.body);
  if (!hips) return;
  p.group.updateMatrixWorld(true);
  hips.getWorldPosition(_hipV);
  p.body.getWorldScale(_lieScale);
  const halfBodyDepth = 0.085 * Math.max(_lieScale.x, _lieScale.z);
  const pelvisTarget = p.group.position.y + clothTop + clearance + halfBodyDepth;
  p.body.position.y += pelvisTarget - _hipV.y;
}

function dropToHips(p, groundY, hipY) {
  const hips = rootBoneOf(p.body);
  if (!hips) return;
  p.group.updateMatrixWorld(true);
  hips.getWorldPosition(_hipV);
  p.group.position.y += (groundY + hipY) - _hipV.y;
}

function poseHolder(g, poseFor, place, extra = {}) {
  const v = guestVisitor(g, { barefoot: true, still: true, ...extra });
  const pose = poseFor(v.group);
  if (!pose) return null;
  const holder = new THREE.Group();
  holder.add(v.group);
  scene.add(holder);
  place(holder, v.group);
  v.mixer.update(0);
  const rec = { group: holder, body: v.group, mixer: v.mixer, pose, phase: rnd() * 6.28 };
  measureAnkle(rec);          // bind stance: soles are on the origin here
  pose();
  return rec;
}

try {
  const guests = [];
  for (const [model, walk, idle, h, rc] of [
    ['woman.glb', 'walk.glb', 'idle.glb', 1.68, 'atlas'],
    ['man.glb', 'walk_m.glb', 'idle_m.glb', 1.80, 'atlas-dark'],
  ]) {
    try {
      guests.push(await loadGuestRig({
        model: `./glb/visitors/${model}?v=1`,
        walk: `./glb/visitors/${walk}?v=1`,
        idle: `./glb/visitors/${idle}?v=1`,
        height: h, recolor: rc,
      }));
    } catch (e) { console.warn('[beach] guest rig', model, e); }
  }
  const G = i => guests[i % guests.length];


  if (guests.length) {
    // --- The corniche: people walking it, in both directions ---------------
    // Pedestrian lanes:
    // 31.4: seaward walk (between seawall and palms/benches line at 33.2-34.6)
    // 38.8 & 39.6: central promenade (between marquee vendor stalls ending at z=37.5 and skate lane at z=40.9)
    // 42.4: shopfront stroll (between skate lane at 40.9 and boutique arcades at 44.0)
    const WALK_Z = [31.4, 38.8, 39.6, 42.4];
    for (let i = 0; i < 20; i++) {
      const v = guestVisitor(G(i));
      const dir = i % 2 ? 1 : -1;
      const baseZ = WALK_Z[i % WALK_Z.length];
      const zOffset = baseZ === 31.4 ? (rnd() - 0.5) * 0.4 : (rnd() - 0.5) * 0.5;
      const z = baseZ + zOffset;
      let wx = -100 + rnd() * 200;
      if (wx > FERRIS_WEST && wx < FERRIS_EAST) wx = dir > 0 ? FERRIS_EAST : FERRIS_WEST;
      v.group.position.set(wx, PROM_Y, z);
      v.group.rotation.y = dir > 0 ? Math.PI / 2 : -Math.PI / 2;
      scene.add(v.group);
      beachPeople.push({ ...v, kind: 'walk', dir, z, speed: v.speed * (0.85 + rnd() * 0.4) });
    }

    // --- Shopkeepers and browsers. Keepers IDLE in the arch (the clip is
    // what makes them breathe). Customers WALK the front of the unit, slow,
    // turning at each end — a frozen "looking" pose was a mannequin.
    SHOP_FRONT.forEach((s, si) => {
      const keeper = guestVisitor(G(si), { playIdle: true });
      keeper.group.position.set(s.x + (si % 2 ? -1.15 : 1.15), PROM_Y, SHOP_Z - 0.7);
      keeper.group.rotation.y = Math.PI;
      scene.add(keeper.group);
      beachPeople.push({
        ...keeper, kind: 'tend',
        baseYaw: Math.PI, phase: rnd() * 6.28,
      });
      const nBrowse = s.kind === 'pizza' || s.kind === 'tees' || s.kind === 'surf' ? 2 : 1;
      for (let b = 0; b < nBrowse; b++) {
        const v = guestVisitor(G(si + b + 3));
        const x0 = s.x - s.w * 0.38, x1 = s.x + s.w * 0.38;
        const z = SHOP_Z - 1.2 - b * 0.35;
        const dir = b % 2 ? -1 : 1;
        const gait = 0.4 + rnd() * 0.22;
        v.group.position.set(x0 + rnd() * (x1 - x0), PROM_Y, z);
        v.group.rotation.y = dir > 0 ? Math.PI / 2 : -Math.PI / 2;
        scene.add(v.group);
        beachPeople.push({
          ...v, kind: 'shopWalk', x0, x1, z, dir, gait,
          speed: v.speed * gait,
        });
      }
      if (s.kind === 'pizza') {
        STOOL.pizza.xs.forEach((dx, k) => {
          const v = guestVisitor(G(si + 5 + k), { seated: true });
          const holder = new THREE.Group();
          holder.add(v.group);
          holder.position.set(s.x + dx, PROM_Y, stoolZ(STOOL.pizza.dz));
          holder.rotation.y = dx > 0 ? -0.32 : 0.32;   // half-turned to the counter
          scene.add(holder);
          v.mixer.update(0);
          v.pose?.();
          const p = { group: holder, body: v.group, mixer: v.mixer, pose: v.pose,
            kind: 'sit', phase: rnd() * 6.28 };
          dropToHips(p, PROM_Y + STOOL.pizza.top, 0.13);
          beachPeople.push(p);
        });
      }
      if (s.kind === 'henna') {
        const v = guestVisitor(G(si + 2), { seated: true });
        const holder = new THREE.Group();
        holder.add(v.group);
        holder.position.set(s.x + STOOL.henna.xs[1], PROM_Y, stoolZ(STOOL.henna.dz));
        holder.rotation.y = 0;                 // facing the henna table behind
        scene.add(holder);
        v.mixer.update(0);
        v.pose?.();
        const p = { group: holder, body: v.group, mixer: v.mixer, pose: v.pose,
          kind: 'sit', phase: rnd() * 6.28 };
        dropToHips(p, PROM_Y + STOOL.henna.top, 0.13);
        beachPeople.push(p);
      }
    });

    // Ticket seller in the Pacific Wheel booth, facing the hatch.
    {
      const keeper = guestVisitor(G(11), { playIdle: true });
      keeper.group.position.set(54.2, PROM_Y, 36.55);
      keeper.group.rotation.y = Math.PI;
      scene.add(keeper.group);
      beachPeople.push({
        ...keeper, kind: 'tend',
        baseYaw: Math.PI, phase: rnd() * 6.28,
      });
    }

    // --- Sunbathers, one per towel already on the sand ---------------------
    // PITCHES was recorded when the towels were laid so the two cannot drift
    // apart; a sunbather beside her towel is worse than no sunbather.
    const lying = guests.length
      ? PITCHES.filter(p => p !== reservedPitch && rnd() < 0.62).slice(0, 26)
      : [];
    for (let i = 0; i < lying.length; i++) {
      const [tx, tz, tyaw] = lying[i];
      const p = poseHolder(G(i), lyingRig,
        (holder, body) => {
        holder.position.set(tx, terrainHeight(tx, tz), tz);
        holder.rotation.y = tyaw;
        // Tipped onto her back: the model stands up +Y and faces +Z, so a
        // quarter turn about X lays it down with the face to the sky.
        body.rotation.x = -Math.PI / 2;
        body.position.set(0, 0.04, 0.82);
      });
      if (p) {
        p.kind = 'lie';
        const s = p.pose.state;
        if (s.armOut) {
          s._out0 = s.armOut[0];
          s._out1 = s.armOut[1];
          s._f0 = s.forearm[0];
          s._head = s.headTurn;
        }
        liftOntoTowel(p);
        beachPeople.push(p);
      }
    }

    // --- In the water. Waders stand chest-deep; nobody swims after dark. ----
    for (let i = 0; i < 12; i++) {
      const wx = -110 + rnd() * 220;
      if (!clearOfPier(wx)) continue;
      const wz = shoreAt(wx) - (6 + rnd() * 16);
      const bed = terrainHeight(wx, wz);
      const p = poseHolder(G(i), customRig, (holder, body) => {
        holder.position.set(wx, bed, wz);
        holder.rotation.y = Math.PI + (rnd() - 0.5) * 1.6;
        body.position.y = 0;
      });
      if (!p) continue;
      // Mixamo: flex X brings the arm forward/up out of the water. Negative
      // flex on this rig buried the arms in the torso.
      p.pose.state.arm = [0.55 + rnd() * 0.25, 0.5 + rnd() * 0.25];
      p.pose.state.armOut = [0.4, 0.38];
      p.pose.state.forearm = [0.55, 0.6];
      p.pose.state.lean = 0.12;
      p.pose.state.hip = [0.15, 0.2];
      p.pose.state.knee = [-0.25, -0.3];
      p.pose();
      p.kind = 'wade';
      p.bed = bed;
      p.d = wz - shoreAt(wx);
      beachPeople.push(p);
      dayPeople.push(p.group);
    }

    // --- Ball and paddle: PAIRS that face each other and share one clock ----
    // 1. Center Court Volleyball: Match played directly across the net at (60, -12)
    // 2. Open Sand Volleyball: Casual beach rally
    // 3. Open Sand Beach Volleyball 2
    // 4. Beach Paddle / Frescobol: Wooden bats & fast yellow ball
    const GAMES = [
      { a: [60, -16.0], b: [60, -8.0], paddle: false, arc: 2.2, period: 3.2, radius: 0.13 },
      { a: [46, -6.0], b: [54, -6.0], paddle: false, arc: 1.6, period: 2.8, radius: 0.13 },
      { a: [72, -18.0], b: [80, -18.0], paddle: false, arc: 1.7, period: 2.9, radius: 0.13 },
      { a: [-22, -12.0], b: [-14, -12.0], paddle: true, arc: 0.65, period: 1.9, radius: 0.055 },
    ];
    GAMES.forEach((g, gi) => {
      const dx = g.b[0] - g.a[0], dz = g.b[1] - g.a[1];
      const dist = Math.hypot(dx, dz) || 1;
      const nx = dx / dist, nz = dz / dist;
      const phase = rnd() * 6.28;
      const made = [];

      // Forward reach offset in front of player for contact (forearms in bump, racket in paddle)
      const reachDist = g.paddle ? 0.58 : 0.52;
      const reachH = g.paddle ? 1.22 : 1.08;

      const PA = new THREE.Vector3(
        g.a[0] + nx * reachDist,
        terrainHeight(g.a[0], g.a[1]) + reachH,
        g.a[1] + nz * reachDist
      );
      const PB = new THREE.Vector3(
        g.b[0] - nx * reachDist,
        terrainHeight(g.b[0], g.b[1]) + reachH,
        g.b[1] - nz * reachDist
      );

      [g.a, g.b].forEach(([px, pz], side) => {
        const p = poseHolder(G(gi * 2 + side), customRig, holder => {
          holder.position.set(px, terrainHeight(px, pz), pz);
          // Face the other player directly across the baseline
          holder.rotation.y = side === 0 ? Math.atan2(dx, dz) : Math.atan2(-dx, -dz);
        });
        if (!p) return;
        p.pose.state.spread = 0.18;
        p.pose.state.hip = [0.40, 0.36];
        p.pose.state.knee = [-0.58, -0.52];
        p.pose.state.ankle = 0.12;
        p.pose.state.lean = 0.10;
        if (g.paddle) {
          p.pose.state.arm = [0.85, 1.15];
          p.pose.state.armOut = [0.22, -0.35];
          p.pose.state.forearm = [0.45, 0.7];
        } else {
          // Ready bump platform: hands held together in front of the body
          p.pose.state.arm = [1.38, 1.36];
          p.pose.state.armOut = [-0.30, -0.28];
          p.pose.state.forearm = [0.36, 0.38];
        }
        p.pose();
        p.kind = 'player';
        p.side = side;
        p.phase = phase;
        p.paddle = g.paddle;
        p.sandY = terrainHeight(px, pz);
        made.push(p);
        beachPeople.push(p);
        if (g.paddle) {
          const bat = new THREE.Group();
          const face = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.025, 14),
            new THREE.MeshStandardMaterial({ color: 0xe0d2b4, roughness: 0.7 }));
          face.rotation.x = Math.PI / 2;
          const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.026, 0.16, 8),
            new THREE.MeshStandardMaterial({ color: 0x6b4a2a, roughness: 0.7 }));
          grip.position.y = -0.16;
          bat.add(face, grip);
          let hand = null;
          p.body.traverse(o => {
            if (!hand && o.isBone && /RightHand$/.test(o.name)) hand = o;
          });
          if (hand) {
            bat.position.set(0.02, 0.1, 0.01);
            bat.rotation.set(1.15, 0.15, 0.35);
            hand.add(bat);
          } else {
            bat.position.set(-0.34, 1.28, 0.28);
            bat.rotation.set(0, 0, -0.5);
            p.group.add(bat);
          }
        }
      });
      if (made.length !== 2) return;
      const ball = new THREE.Mesh(
        new THREE.SphereGeometry(g.radius, g.paddle ? 10 : 20, g.paddle ? 8 : 14),
        g.paddle ? M.paddleBall : M.volleyball
      );
      ball.castShadow = true;
      scene.add(ball);
      beachPeople.push({
        kind: 'rally', group: ball, PA, PB, phase,
        arc: g.arc, period: g.period, paddle: g.paddle,
        A: made[0], B: made[1],
      });
    });

    // --- Skaters on the painted lane ---------------------------------------
    // Stance is SIDEWAYS to travel: board along world X, rider faces the
    // shops (or the sea). Facing along X with the board across the lane is
    // what made them look like they were being slid on their side.
    // still:true so idle does not fight the pump pose.
    for (let i = 0; i < 5; i++) {
      const dir = i % 2 ? 1 : -1;
      const v = guestVisitor(G(i), { still: true });
      const pose = customRig(v.group);
      if (!pose) continue;
      let sx = -90 + rnd() * 180;
      if (sx > FERRIS_WEST && sx < FERRIS_EAST) sx = dir > 0 ? FERRIS_EAST : FERRIS_WEST;
      const faceYaw = i % 3 === 0 ? Math.PI : 0;
      const holder = new THREE.Group();
      holder.position.set(sx, PROM_Y, SKATE_Z);
      holder.rotation.y = faceYaw;
      v.group.position.y = 0.075;
      holder.add(v.group);
      scene.add(holder);
      const goofy = rnd() < 0.45;
      const rec = measureAnkle({ group: holder, body: v.group });
      pose.state.spread = -0.18;
      pose.state.ankle = 0.04;
      pose.state.hip = [0.36, 0.34];
      pose.state.knee = [-0.55, -0.50];
      pose();
      const deck = new THREE.Mesh(new THREE.BoxGeometry(0.84, 0.04, 0.21),
        new THREE.MeshStandardMaterial({
          color: pick([0xd8362a, 0x2f86b4, 0xe8b23c, 0x1e2a44]), roughness: 0.55,
        }));
      deck.position.set(0, 0.055, 0);
      deck.castShadow = true;
      holder.add(deck);
      for (const dx of [-0.24, 0.24]) {
        const truck = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.025, 0.15),
          new THREE.MeshStandardMaterial({ color: 0xcdd3d8, roughness: 0.4, metalness: 0.35 }));
        truck.position.set(dx, 0.035, 0);
        holder.add(truck);
        for (const s of [-1, 1]) {
          const wh = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.036, 8),
            new THREE.MeshStandardMaterial({ color: 0x1c1e22, roughness: 0.5 }));
          wh.rotation.x = Math.PI / 2;
          wh.position.set(dx, 0.028, s * 0.078);
          holder.add(wh);
        }
      }
      beachPeople.push({
        group: holder, body: v.group, mixer: v.mixer, pose,
        kind: 'skate', dir, faceYaw, speed: 3.6 + rnd() * 2.0,
        goofy, crouch: 0.5 + rnd() * 0.22, phase: rnd() * 6.28,
        feet: rec.feet, ankleH: rec.ankleH, deckTop: 0.075,
      });
    }

    // --- Ferris wheel: people sitting in the gondolas ----------------------
    // Empty cars are left for the player (see emptySlots above). Everyone
    // else is a guest in a seated pose, parented to the cabin so they ride
    // with it. dropToHips against the bench, not the promenade: the group is
    // in the cabin's frame and the seat is 46 cm off that floor.
    for (const car of ferris.gondolas) {
      if (car.empty) continue;
      const n = rnd() < 0.45 ? 2 : 1;
      const xs = n === 2 ? [-0.34, 0.34] : [rnd() < 0.5 ? -0.28 : 0.28];
      for (let s = 0; s < n; s++) {
        const v = guestVisitor(G(car.i + s + 3), { still: true, seated: true });
        if (!v.pose) continue;
        const holder = new THREE.Group();
        holder.add(v.group);
        car.cabin.add(holder);
        holder.position.set(xs[s], 0, 0.1);
        holder.rotation.y = Math.PI;     // face the sea
        v.mixer.update(0);
        v.pose();
        holder.updateMatrixWorld(true);
        const hips = rootBoneOf(v.group);
        if (hips) {
          hips.getWorldPosition(_hipV);
          const target = new THREE.Vector3(xs[s], 0.46, 0.1);
          car.cabin.localToWorld(target);
          holder.position.y += (target.y + 0.13) - _hipV.y;
        }
        beachPeople.push({
          group: holder, body: v.group, mixer: v.mixer, pose: v.pose,
          kind: 'sit', phase: rnd() * 6.28,
        });
      }
    }

    // --- After dark: fires, and people sitting round them ------------------
    const FIRES = [[-70, -18], [-8, -22], [58, -16]];
    for (let f = 0; f < FIRES.length; f++) {
      const [fx, fz] = FIRES[f];
      const fy = terrainHeight(fx, fz);
      const ring = new THREE.Group();
      ring.position.set(fx, fy, fz);
      scene.add(ring);
      nightPeople.push(ring);
      // Stones, logs, embers.
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2;
        const st = new THREE.Mesh(pick(ROCKS), M.rockDark);
        st.position.set(Math.cos(a) * 1.05, 0.05, Math.sin(a) * 1.05);
        st.scale.set(0.5, 0.32, 0.44);
        st.rotation.y = a;
        ring.add(st);
      }
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2 + 0.4;
        const log = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 0.95, 6), M.piling);
        log.position.set(Math.cos(a) * 0.24, 0.24, Math.sin(a) * 0.24);
        log.rotation.set(1.15, a, 0);
        ring.add(log);
      }
      const emberMat = new THREE.MeshStandardMaterial({
        color: 0xff7a2a, emissive: 0xff5510, emissiveIntensity: 2.4, roughness: 0.8,
      });
      const ember = new THREE.Mesh(new THREE.SphereGeometry(0.34, 10, 8), emberMat);
      ember.position.y = 0.2;
      ember.scale.y = 0.55;
      ring.add(ember);
      const flame = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.9, 8).translate(0, 0.45, 0),
        new THREE.MeshBasicMaterial({ color: 0xffb055, transparent: true, opacity: 0.75,
          depthWrite: false, blending: THREE.AdditiveBlending }));
      flame.position.y = 0.24;
      ring.add(flame);
      const light = new THREE.PointLight(0xff8a3a, 26, 16, 2);
      light.position.y = 0.9;
      ring.add(light);
      beachPeople.push({ kind: 'fire', group: ring, flame, light, emberMat, phase: rnd() * 6.28 });

      // Four or five people round it, one of them with a guitar. G(0) only:
      // man.glb's own authored leg skin (not just the bare-leg loft laid over
      // it) tears under this much hip flex on either the thigh or the calf —
      // checked with the loft off, the pose still shreds his trouser mesh into
      // the same knife-thin blade, so the defect is in his rig, not in ours.
      // woman.glb holds at every hip/knee/spread pairing tried here, so she is
      // the only guest sat down at a fire until his rig is fixed at the source.
      const n = 4 + Math.floor(rnd() * 2);
      const guitarist = Math.floor(rnd() * n);
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + rnd() * 0.3;
        const r = 1.9 + rnd() * 0.5;
        const px = fx + Math.cos(a) * r, pz = fz + Math.sin(a) * r;
        const p = poseHolder(G(0), grp => groundSitRig(grp, rnd), holder => {
          holder.position.set(px, terrainHeight(px, pz), pz);
          holder.rotation.y = Math.atan2(fx - px, fz - pz);   // face the fire
        });
        if (!p) continue;
        p.kind = 'sit';
        // 20 cm, not 37: legs out along the sand put the hip joint barely a
        // hand above it, and the old seat height left them sitting on air.
        dropToHips(p, terrainHeight(px, pz), 0.20);
        scene.add(p.group);
        nightPeople.push(p.group);
        beachPeople.push(p);
        if (i === guitarist) {
          // Held across the lap, neck out to the left.
          const gtr = new THREE.Group();
          const body = new THREE.Mesh(new THREE.SphereGeometry(0.19, 12, 9),
            new THREE.MeshStandardMaterial({ color: 0xc98a45, roughness: 0.5 }));
          body.scale.set(1, 1.25, 0.42);
          const neck = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.62, 0.04),
            new THREE.MeshStandardMaterial({ color: 0x5a3a20, roughness: 0.6 }));
          neck.position.y = 0.44;
          const hole = new THREE.Mesh(new THREE.CircleGeometry(0.06, 12),
            new THREE.MeshBasicMaterial({ color: 0x2a1a10 }));
          hole.position.set(0, 0.03, 0.081);
          gtr.add(body, neck, hole);
          gtr.rotation.set(0.2, 0, -1.05);
          gtr.position.set(0.1, 0.62, 0.22);
          p.group.add(gtr);
          p.pose.state.arm = [0.9, 0.2];
          p.pose.state.forearm = [1.5, 1.25];
          p.pose();
          p.kind = 'play';
        }
      }
    }
  }
  console.info('[beach] crowd:', beachPeople.length, 'actors from', guests.length, 'guest rigs');
} catch (e) {
  console.warn('[beach] crowd unavailable', e);
}

// Everything the crowd does per frame. Walkers are the only ones that travel;
// the rest hold a pose and are given just enough motion not to read as statues.
function tickPeople(dt, t) {
  for (const p of beachPeople) {
    switch (p.kind) {
      case 'walk': {
        p.group.position.x += p.speed * p.dir * dt;
        if (p.group.position.x > FERRIS_WEST && p.group.position.x < FERRIS_EAST)
          p.group.position.x = p.dir > 0 ? FERRIS_EAST : FERRIS_WEST;
        if (p.group.position.x > 108) p.group.position.x = -108;
        if (p.group.position.x < -108) p.group.position.x = 108;

        // Dynamic obstacle avoidance around vendor stalls (marquee tents)
        let curZ = p.z;
        for (const [vx, vz] of VENDOR_STALLS) {
          const dx = p.group.position.x - vx;
          const dz = curZ - vz;
          if (Math.abs(dx) < 2.5 && Math.abs(dz) < 1.7) {
            curZ = vz + (dz >= 0 ? 1.75 : -1.75);
          }
        }
        p.group.position.z = curZ;

        p.mixer.update(dt);
        break;
      }
      case 'skate': {
        p.group.position.x += p.speed * p.dir * dt;
        p.group.position.z = SKATE_Z;
        if (p.group.position.x > FERRIS_WEST && p.group.position.x < FERRIS_EAST)
          p.group.position.x = p.dir > 0 ? FERRIS_EAST : FERRIS_WEST;
        if (p.group.position.x > 100) p.group.position.x = -100;
        if (p.group.position.x < -100) p.group.position.x = 100;
        p.mixer.update(0);
        // Both feet stay on the deck. A scripted "push foot on the ground"
        // without IK slid through the board and read as a seizure. Weight
        // shifts, knees bounce, arms counter-balance — a carve, not a walk.
        const pump = Math.sin(t * 1.65 + p.phase);
        const carve = Math.sin(t * 0.7 + p.phase * 0.5);
        const lead = p.goofy ? 1 : 0, back = p.goofy ? 0 : 1;
        const c = p.crouch;
        p.pose.state.hip[lead] = 0.38 + c * 0.08 + pump * 0.04;
        p.pose.state.knee[lead] = -0.58 - c * 0.08 + pump * 0.06;
        p.pose.state.hip[back] = 0.34 + c * 0.06 - pump * 0.05;
        p.pose.state.knee[back] = -0.52 - c * 0.06 - pump * 0.08;
        // Mixamo abduct SIGN: positive spread CROSSES the feet into the
        // middle of the board. Negative pushes them out onto the trucks.
        p.pose.state.spread = -0.18;
        p.pose.state.ankle = 0.04;
        p.pose.state.lean = 0.14 + c * 0.05 + carve * 0.04;
        p.pose.state.arm = [0.22 + carve * 0.08, 0.2 - carve * 0.08];
        p.pose.state.armOut = [0.48 + pump * 0.1, 0.46 - pump * 0.1];
        p.pose.state.forearm = [0.42, 0.4];
        p.pose();
        plantSkateFeet(p);
        p.group.rotation.z = carve * 0.07;
        break;
      }
      case 'lie': {
        p.mixer.update(0);
        const s = p.pose.state;
        const b = Math.sin(t * 0.65 + p.phase);
        const h = Math.sin(t * 0.32 + p.phase * 0.7);
        if (s.armOut) {
          s.armOut[0] = s._out0 + b * 0.05;
          s.armOut[1] = s._out1 - b * 0.04;
          s.headTurn = s._head + h * 0.14;
          s.forearm[0] = s._f0 + b * 0.06;
        }
        p.pose();
        const breath = 1 + Math.sin(t * 0.85 + p.phase) * 0.014;
        // After -90 X, local Z is world Y (into the towel). Breathing on Z
        // pushed them back under the cloth; breathe across the chest instead.
        p.body.scale.y = breath;
        p.body.scale.x = 1 + Math.sin(t * 0.85 + p.phase) * 0.008;
        p.body.scale.z = 1;
        break;
      }
      case 'wade': {
        p.mixer.update(0);
        const w = Math.sin(t * 1.05 + p.phase);
        p.pose.state.arm[0] = 0.6 + w * 0.14;
        p.pose.state.arm[1] = 0.55 - w * 0.12;
        p.pose.state.armOut[0] = 0.4 + w * 0.06;
        p.pose.state.armOut[1] = 0.38 - w * 0.05;
        p.pose();
        p.group.position.y = p.bed + Math.sin(t * 0.9 + p.phase) * 0.07;
        p.group.rotation.z = Math.sin(t * 0.7 + p.phase) * 0.04;
        break;
      }
      case 'player': {
        // Rally writes the pose after this; mixer only so the idle rest holds.
        p.mixer.update(0);
        break;
      }
      case 'rally': {
        const T = p.period || 3.0;
        const tCyc = (t + p.phase) % T;
        const tNorm = tCyc / T; // 0 to 1
        const isAtoB = tNorm < 0.5;
        const u = isAtoB ? (tNorm / 0.5) : ((tNorm - 0.5) / 0.5); // 0 to 1 flight progress
        const pFrom = isAtoB ? p.PA : p.PB;
        const pTo = isAtoB ? p.PB : p.PA;

        // True ballistic parabolic trajectory
        const bx = pFrom.x + (pTo.x - pFrom.x) * u;
        const bz = pFrom.z + (pTo.z - pFrom.z) * u;
        const by = (1 - u) * pFrom.y + u * pTo.y + 4.0 * p.arc * u * (1.0 - u);
        p.group.position.set(bx, by, bz);

        // Continuous rotational spin in flight
        p.group.rotation.x += dt * 4.8 * (isAtoB ? 1 : -1);
        p.group.rotation.y += dt * 2.2;

        // Dynamic player bump / manchette and anticipation
        const dtA = Math.min(tNorm, 1.0 - tNorm);
        const hitA = dtA < 0.16 ? Math.cos((dtA / 0.16) * (Math.PI / 2)) : 0;
        const prepA = tNorm > 0.80 ? Math.sin((tNorm - 0.80) / 0.20 * Math.PI) : 0;

        const dtB = Math.abs(tNorm - 0.5);
        const hitB = dtB < 0.16 ? Math.cos((dtB / 0.16) * (Math.PI / 2)) : 0;
        const prepB = (tNorm > 0.30 && tNorm < 0.50) ? Math.sin((tNorm - 0.30) / 0.20 * Math.PI) : 0;

        for (const q of [p.A, p.B]) {
          const hit = q.side === 0 ? hitA : hitB;
          const prep = q.side === 0 ? prepA : prepB;

          if (q.paddle) {
            q.pose.state.arm[0] = 0.85 + hit * 0.12;
            q.pose.state.arm[1] = 1.15 - hit * 0.60;
            q.pose.state.armOut = [0.22 - hit * 0.05, -0.35 - hit * 0.60];
            q.pose.state.forearm = [0.45, 0.70 - hit * 0.48];
            q.pose.state.lean = 0.04 + prep * 0.06 - hit * 0.14;
            q.pose.state.hip = [0.42 - hit * 0.16, 0.38 - hit * 0.12];
            q.pose.state.knee = [-0.62 + hit * 0.28, -0.55 + hit * 0.22];
            if (q.sandY != null) q.group.position.y = q.sandY + hit * 0.14;
          } else {
            // Volleyball: crouch prep -> explosive upward push through legs & forearms
            q.pose.state.knee = [-0.58 - prep * 0.16 + hit * 0.28, -0.52 - prep * 0.16 + hit * 0.28];
            q.pose.state.hip = [0.40 + prep * 0.12 - hit * 0.18, 0.36 + prep * 0.12 - hit * 0.18];
            q.pose.state.spread = 0.18;
            q.pose.state.ankle = 0.12;

            // Arms: ready low platform -> locked tight manchette lifting through the ball
            q.pose.state.arm[0] = 1.38 - hit * 0.42;
            q.pose.state.arm[1] = 1.36 - hit * 0.42;
            q.pose.state.armOut = [-0.30 - hit * 0.14, -0.28 - hit * 0.14];
            q.pose.state.forearm = [0.36 - hit * 0.16, 0.38 - hit * 0.16];
            q.pose.state.lean = 0.12 + prep * 0.08 - hit * 0.18;

            if (q.sandY != null) q.group.position.y = q.sandY - prep * 0.05 + hit * 0.12;
          }

          q.mixer.update(0);
          q.pose();
          standSolesOn(q, q.group.position.y);
        }
        break;
      }
      case 'tend': {
        p.mixer.update(dt);
        p.group.rotation.y = p.baseYaw + Math.sin(t * 0.38 + p.phase) * 0.22;
        break;
      }
      case 'shopWalk': {
        p.group.position.x += p.speed * p.dir * dt;
        if (p.group.position.x > p.x1) {
          p.dir = -1;
          p.group.rotation.y = -Math.PI / 2;
          p.group.position.x = p.x1;
        } else if (p.group.position.x < p.x0) {
          p.dir = 1;
          p.group.rotation.y = Math.PI / 2;
          p.group.position.x = p.x0;
        }
        p.mixer.update(dt * (p.gait || 0.5));
        break;
      }
      case 'sit':
      case 'play': {
        p.mixer.update(dt);
        if (p.kind === 'play') {
          p.pose.state.forearm = 1.5 + Math.sin(t * 3.1 + p.phase) * 0.28;
        } else {
          p.pose.state.arm = 0.35 + Math.sin(t * 0.8 + p.phase) * 0.05;
        }
        p.pose();
        break;
      }
      case 'fire': {
        const f = 0.75 + Math.sin(t * 8.1 + p.phase) * 0.12 + Math.sin(t * 3.3) * 0.08;
        p.flame.scale.set(0.9 + f * 0.2, f * 1.2, 0.9 + f * 0.2);
        p.flame.material.opacity = 0.55 + f * 0.3;
        p.light.intensity = 20 + f * 14;
        p.emberMat.emissiveIntensity = 1.8 + f * 1.2;
        break;
      }
    }
  }
}

// Swimmers go in only by day; the fires and their circles only after dark.
function setPeopleForTime(night) {
  for (const g of nightPeople) g.visible = night;
  for (const g of dayPeople) g.visible = !night;
}

const forward = new THREE.Vector3();
const _stillVel = new THREE.Vector3();
const clock = new THREE.Clock();
let started = false, usedLock = false, paused = false;
let travelDestinationRequested = null;
let choosingPrompt = false;
let travelInProgress = false;
let actionPrompt = null;           // { kind, label }
let ferrisActionRequested = false;
let ferrisCooldown = 0;
let lieActionRequested = false;
let activeFurnitureInteraction = null;
let furnitureCooldown = 0;
let releasedSpot = null;
const RELEASE_RADIUS = 1.6;
const interactionExitKeys = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space', 'KeyE'];

// ---------------------------------------------------------------------------
// Shared action prompt. Travel home and boarding the wheel both use the one
// furniture button; pointer lock drops while it is up so the click can land.
// ---------------------------------------------------------------------------
function setActionPrompt(next) {
  const key = next ? `${next.kind}|${next.label}` : '';
  const prev = actionPrompt ? `${actionPrompt.kind}|${actionPrompt.label}` : '';
  if (key === prev) return;
  actionPrompt = next;
  choosingPrompt = Boolean(next);
  furniturePrompt.textContent = next?.label ?? '';
  furniturePrompt.classList.toggle('show', Boolean(next));
  furniturePrompt.setAttribute('aria-hidden', next ? 'false' : 'true');
  if (next) {
    if (document.pointerLockElement === renderer.domElement) document.exitPointerLock?.();
  } else if (started && !paused) {
    requestGamePointerLock();
  }
}

furniturePrompt.addEventListener('click', event => {
  event.stopPropagation();
  if (!actionPrompt || travelInProgress) return;
  if (actionPrompt.kind === 'travel') travelDestinationRequested = 'la';
  else if (actionPrompt.kind === 'lie') lieActionRequested = true;
  else if (actionPrompt.kind === 'ferris') {
    ferrisActionRequested = true;
    const car = ferrisBottomCar();
    if (car && !ferris.ride) boardFerris(car);
  } else if (actionPrompt.kind === 'ferris-exit') {
    ferrisActionRequested = true;
    if (ferris.ride) leaveFerris();
  }
  choosingPrompt = false;
  requestGamePointerLock();
});
renderer.domElement.addEventListener('click', () => {
  // After walking away the unlock is not a user gesture, so the first canvas
  // click is what reclaims mouse look.
  if (started && !paused && !choosingPrompt && !input.locked) requestGamePointerLock();
});

function distanceToFurniture(spot, position) {
  const dx = position.x - spot.centerX;
  const dz = position.z - spot.centerZ;
  const c = Math.cos(spot.yaw), s = Math.sin(spot.yaw);
  const localX = dx * c - dz * s;
  const localZ = dx * s + dz * c;
  const ox = Math.max(0, Math.abs(localX) - spot.halfWidth);
  const oz = Math.max(0, Math.abs(localZ) - spot.halfDepth);
  return Math.hypot(ox, oz);
}

function nearTravelCar() {
  const spot = beachTravelInteraction;
  if (Math.abs(ctrl.pos.y - spot.approachY) > 1.25) return false;
  return distanceToFurniture(spot, ctrl.pos) <= spot.triggerDistance;
}

function nearLieSpot() {
  const spot = beachLieInteraction;
  if (!spot || furnitureCooldown > 0 || ctrl.mode !== 'ground') return false;
  if (releasedSpot === spot) return false;
  if (Math.abs(ctrl.pos.y - spot.approachY) > 0.9) return false;
  return distanceToFurniture(spot, ctrl.pos) <= spot.triggerDistance;
}

function enterLie() {
  const spot = beachLieInteraction;
  if (!spot) return;
  setActionPrompt(null);
  activeFurnitureInteraction = {
    ...spot,
    source: spot,
    returnPosition: ctrl.pos.clone(),
    readyToExit: false,
  };
  ctrl.pos.set(spot.x, spot.y, spot.z);
  ctrl.prevY = spot.y;
  ctrl.vel.set(0, 0, 0);
  ctrl.mode = 'lie';
  ctrl.webOn = false;
  lieActionRequested = false;
  if (Number.isFinite(spot.yaw)) {
    input.yaw = spot.yaw + Math.PI;
    if (player) player.yaw = spot.yaw;
  }
}

function leaveLie() {
  const interaction = activeFurnitureInteraction;
  if (!interaction) return;
  ctrl.pos.copy(interaction.returnPosition);
  ctrl.prevY = ctrl.pos.y;
  ctrl.vel.set(0, 0, 0);
  ctrl.mode = 'ground';
  releasedSpot = interaction.source;
  activeFurnitureInteraction = null;
  furnitureCooldown = 0.65;
  setActionPrompt(null);
}

function updateLieInteraction(dt) {
  furnitureCooldown = Math.max(0, furnitureCooldown - dt);
  if (releasedSpot && distanceToFurniture(releasedSpot, ctrl.pos) > RELEASE_RADIUS)
    releasedSpot = null;
  if (!activeFurnitureInteraction) return false;

  setActionPrompt(null);
  if (input.pressed('KeyR')) {
    activeFurnitureInteraction = null;
    furnitureCooldown = 0.65;
    ctrl.rescueTo(spawnPoint);
    return true;
  }
  const held = interactionExitKeys.some(k => input.down(k));
  if (!held) activeFurnitureInteraction.readyToExit = true;
  if (held && activeFurnitureInteraction.readyToExit) {
    leaveLie();
    return false;
  }
  return true;
}

function nearFerrisBoard() {
  if (ferris.ride || ferrisCooldown > 0 || ctrl.mode !== 'ground') return false;
  if (Math.abs(ctrl.pos.y - PROM_Y) > 1.2) return false;
  return Math.abs(ctrl.pos.x - FERRIS_X) < 6.6 && Math.abs(ctrl.pos.z - FERRIS_Z) < 5.6;
}

// A gondola is boardable when it is empty and hanging near the bottom of
// the circle. sin(angle) is the hitch's Y in wheel space; -1 is six o'clock.
function ferrisBottomCar() {
  let best = null, bestSin = 1;
  for (const car of ferris.gondolas) {
    if (!car.empty || car.occupiedByPlayer) continue;
    const a = Math.atan2(car.hitch.position.y, car.hitch.position.x) + ferris.wheel.rotation.z;
    const s = Math.sin(a);
    if (s < bestSin) { bestSin = s; best = car; }
  }
  return bestSin < -0.72 ? best : null;
}

function tickFerris(dt, t) {
  if (!ferris.wheel) return;
  // Slow the wheel a little when someone is waiting on the platform so a
  // car actually spends a beat at the bottom instead of sweeping past.
  const waiting = !ferris.ride && nearFerrisBoard();
  const omega = waiting ? 0.055 : ferris.speed;
  ferris.wheel.rotation.z += omega * dt;
  ferris.wheel.updateMatrixWorld(true);
  const undo = -ferris.wheel.rotation.z;
  for (const car of ferris.gondolas) {
    // Undo the wheel so the cabin floor stays world-level, then a little
    // pendulum on top of that so the cars are hanging, not welded.
    car.keeper.rotation.z = undo + Math.sin(t * 0.9 + car.i * 0.7) * 0.025;
  }
  const night = beachTime !== 'day';
  const pulse = night ? 0.75 + 0.25 * Math.sin(t * 3.4) : 1;
  for (let i = 0; i < ferrisBulbMats.length; i++) {
    const base = night ? 1.6 + TIME_STATES[beachTime].lamp * 0.4 : 0.32;
    ferrisBulbMats[i].emissiveIntensity = base * (0.82 + 0.18 * Math.sin(t * 4.2 + i));
    if (!night) ferrisBulbMats[i].emissiveIntensity *= pulse;
  }
}

function boardFerris(car) {
  car.occupiedByPlayer = true;
  car.seat.getWorldPosition(ferris._seatWorld);
  ferris.ride = {
    gondola: car,
    startAngle: ferris.wheel.rotation.z,
    traveled: 0,
    readyToExit: false,
    returnPos: ctrl.pos.clone(),
  };
  ctrl.pos.copy(ferris._seatWorld);
  ctrl.prevY = ctrl.pos.y;
  ferris._prevPos.copy(ferris._seatWorld);
  ctrl.vel.set(0, 0, 0);
  ctrl.webOn = false;
  ctrl.mode = 'ride';
  ferrisActionRequested = false;
  setActionPrompt(null);
}

function leaveFerris() {
  const ride = ferris.ride;
  if (!ride) return;
  ride.gondola.occupiedByPlayer = false;
  const back = ride.returnPos;
  ctrl.pos.set(back.x, PROM_Y + 0.08, Math.min(back.z, FERRIS_Z - 3.6));
  ctrl.prevY = ctrl.pos.y;
  ctrl.vel.set(0, 0, 0);
  ctrl.mode = 'ground';
  ferris.ride = null;
  ferrisCooldown = 1.35;
  setActionPrompt(null);
}

function updateFerrisRide(dt, allowExit = true) {
  const ride = ferris.ride;
  if (!ride) return false;
  ride.traveled += Math.abs(ferris.speed) * dt;
  ride.gondola.seat.getWorldPosition(ferris._seatWorld);
  ride.gondola.seat.getWorldQuaternion(ferris._seatQuat);
  if (dt > 1e-4) {
    ctrl.vel.subVectors(ferris._seatWorld, ferris._prevPos).divideScalar(dt);
    const sp = ctrl.vel.length();
    if (sp > 8) ctrl.vel.multiplyScalar(8 / sp);
  }
  ferris._prevPos.copy(ferris._seatWorld);
  ctrl.pos.copy(ferris._seatWorld);
  ctrl.prevY = ctrl.pos.y;
  ferris._seatEuler.setFromQuaternion(ferris._seatQuat, 'YXZ');

  if (!allowExit) return true;

  if (input.pressed('KeyR')) {
    leaveFerris();
    ctrl.rescueTo(spawnPoint);
    return true;
  }

  const atBottom = Math.sin(
    Math.atan2(ride.gondola.hitch.position.y, ride.gondola.hitch.position.x)
    + ferris.wheel.rotation.z) < -0.78;
  const canExit = ride.traveled > Math.PI * 1.35 && atBottom;
  if (canExit) setActionPrompt({ kind: 'ferris-exit', label: 'Descendre' });
  else setActionPrompt(null);

  const exitHeld = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space', 'KeyE'].some(k => input.down(k));
  if (!exitHeld) ride.readyToExit = true;
  if (canExit && (ferrisActionRequested || (exitHeld && ride.readyToExit) || input.pressed('LMB'))) {
    ferrisActionRequested = false;
    leaveFerris();
    return false;
  }
  ferrisActionRequested = false;
  return true;
}

function updateTravel(dt) {
  ferrisCooldown = Math.max(0, ferrisCooldown - dt);
  if (travelInProgress || ferris.ride) return;
  const nearCar = nearTravelCar();
  const nearWheel = nearFerrisBoard();
  const carReady = ferrisBottomCar();

  if (nearCar) {
    setActionPrompt({ kind: 'travel', label: 'Retourner à la villa' });
    if (travelDestinationRequested === 'la') {
      travelInProgress = true;
      // Hand the villa back the time of day — driving home from a night beach
      // and arriving in daylight would be absurd. The villa only understands
      // day/night, so golden hour arrives home as day: the sun has not set yet.
      const night = beachTime === 'night' ? '1' : '0';
      location.href = `index.html?map=la&arrival=beach&night=${night}`;
    }
    return;
  }
  travelDestinationRequested = null;

  const wantAction = ferrisActionRequested || lieActionRequested
    || input.pressed('LMB') || input.pressed('KeyE');
  if (nearWheel && carReady) {
    setActionPrompt({ kind: 'ferris', label: 'Monter dans la grande roue' });
    if (wantAction) boardFerris(carReady);
    return;
  }
  if (nearWheel) {
    setActionPrompt({ kind: 'ferris', label: 'Attendez la nacelle…' });
    return;
  }
  ferrisActionRequested = false;

  if (nearLieSpot()) {
    setActionPrompt({ kind: 'lie', label: "S'allonger" });
    if (wantAction) enterLie();
    lieActionRequested = false;
    return;
  }
  lieActionRequested = false;
  setActionPrompt(null);
}

// ---------------------------------------------------------------------------
function updateAvatarOutfit() {
  if (!player) return;
  const { z } = ctrl.pos;
  const isNight = beachTime === 'night';
  // Below the seawall you are on the beach, and on the beach you are in
  // swimwear. Above it you are on a public promenade, and you are not.
  const onSand = z < SEAWALL_Z0;
  if (onSand) {
    player.setOutfit({
      hat: false, backpack: false, pants: false, shoes: false,
      longSleeves: isNight, swim: true,
    });
  } else {
    player.setOutfit({ hat: !isNight, backpack: false, longSleeves: isNight });
  }
}

function updateAvatar(dt) {
  if (!player) return;
  updateAvatarOutfit();
  const riding = Boolean(ferris.ride);
  const lying = ctrl.mode === 'lie';
  player.update({
    dt,
    mode: riding ? 'sit' : ctrl.mode,
    pos: ctrl.pos,
    vel: (riding || lying) ? _stillVel : ctrl.vel,
    webOn: lying ? false : ctrl.webOn,
    webHand: ctrl.webHand,
    anchor: ctrl.anchor,
    ropeSlack: ctrl.webOn && !lying ? Math.max(0, ctrl.pos.distanceTo(ctrl.anchor) - ctrl.ropeLen) : 0,
    posture: riding ? 'sit' : lying ? 'lie' : undefined,
    facingYaw: riding ? ferris._seatEuler.y + Math.PI
      : lying ? activeFurnitureInteraction?.yaw
      : undefined,
    floorY: riding ? ctrl.pos.y - 0.42 : undefined,
  });
}

function updateHud() {
  hudMode.textContent = ctrl.mode;
  hudSpeed.textContent = Math.round(ctrl.vel.length() * 3.6).toString();
  hudHeight.textContent = ctrl.pos.y.toFixed(1);
  document.documentElement.classList.toggle('is-seated',
    ctrl.mode === 'sit' || ctrl.mode === 'lie' || ctrl.mode === 'ride');
}

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(0.033, clock.getDelta());
  const t = clock.elapsedTime;
  tickFerris(dt, t);
  for (const ring of shopSpinners) ring.rotation.y += 0.55 * dt;
  // Follow the car even while the overlay is up, or a pause would leave the
  // avatar hanging in the air as the wheel kept turning underneath.
  const riding = updateFerrisRide(dt, started && !paused);

  if (started && !paused) {
    input.updateLook(dt);
    const cp = Math.cos(input.pitch);
    forward.set(-Math.sin(input.yaw) * cp, Math.sin(input.pitch), -Math.cos(input.yaw) * cp).normalize();
    if (!riding) {
      const lying = updateLieInteraction(dt);
      if (!lying) {
        ctrl.update(dt, input, input.yaw, forward);
        if (ctrl.pos.y < -60) ctrl.rescueTo(spawnPoint);
        updateTravel(dt);
      }
    }
  }
  // Two normal-map layers drifting at different rates: one swell rolling in,
  // one chop crossing it. One layer alone reads as a moving photograph.
  // Fine detail on the water still comes from the scrolling normal map; the
  // swell itself is geometry now.
  waterN.offset.x = t * 0.006;
  waterN.offset.y = -t * 0.022;
  seaMat.opacity = TIME_STATES[beachTime].sea.opacity + Math.sin(t * 0.9) * 0.02;
  seaUniforms.uTime.value = t;
  updateSwash(t, dt);
  foamUniforms.uTime.value = t;
  foamUniforms.uEdge.value = SWASH.edge;
  wetUniforms.uHigh.value = SWASH.high;

  // Keep the sky centred on the camera so its horizon never slides past us.
  skyDome.position.copy(camera.position);

  tickPeople(dt, t);
  if (beachLieFlag) {
    const flutter = Math.sin(t * 3.4) * 0.14;
    for (const part of [beachLieFlag.top, beachLieFlag.pin]) {
      const p = part.root.position;
      part.vane.rotation.y = Math.atan2(camera.position.x - p.x, camera.position.z - p.z);
      part.vane.rotation.z = flutter;
    }
  }
  updateSunShadow(ctrl.pos);
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

function startBeach() {
  if (started) {
    resumePlay();
    return;
  }
  try {
    // The villa hands the time of day over on the drive down (`time=`); after
    // that the toggle in this map's briefing owns it.
    setBeachTime(travelParams.get('time')
      ?? window.__beachTime
      ?? (window.__nightMode === true ? 'night' : 'day'));
  } catch (e) {
    window.__beachTimeError = e.stack || e.message;
    console.error('[time mode]', e);
  }
  setActionPrompt(null);
  started = true;
  resumePlay();
}

window.__startBeach = startBeach;
startBtn?.addEventListener('click', startBeach);
if (arrivedFromTravel || window.__startRequested) startBeach();

document.addEventListener('pointerlockchange', () => {
  usedLock = usedLock || document.pointerLockElement !== null;
  // Dropping the lock so a prompt button can be clicked is intentional —
  // keep playing and leave the overlay closed. Same while on the wheel:
  // the Descendre button has to be clickable, and a failed lock must not
  // freeze the car in the sky.
  if ((choosingPrompt || ferris.ride || ctrl.mode === 'lie') && document.pointerLockElement === null) {
    paused = false;
    overlay.style.display = 'none';
    return;
  }
  if (!usedLock) return;
  paused = !input.locked;
  if (paused) setActionPrompt(null);
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
  THREE, scene, camera, renderer, world, ctrl, rig, input, player, spawnPoint,
  terrainHeight, shoreAt, setBeachTime, TIME_STATES, SWASH, seaUniforms,
  beachTravelCar, beachTravelInteraction, beachArrivalPoint,
  SEA_Y, PROM_Y, SAND_TOP, SHORE_Z, WADE_Z, BEACH_HALF_W,
  PIER_X, PIER_Y, PIER_HALF, PIER_Z1, TOWERS,
  FERRIS_X, FERRIS_Z, FERRIS_R, ferris,
  // Where phase 3 puts its sunbathers: one entry per towel already on the
  // sand, as [x, z, yaw]. Laid down here so the towels and the people on them
  // cannot drift apart.
  PITCHES, reservedPitch, beachLieInteraction, beachLieFlag,
  enterLie, leaveLie, beachPeople,
  get beachTime() { return beachTime; },
};
window.__beach = hook;
window.__villa = hook;
