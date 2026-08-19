import * as THREE from 'three';
import { Player } from './player.js?v=74';
import { harmoniseHair } from './hair.js?v=8';
import { Input } from './input.js';
import { Controller } from './controller.js?v=6';
import { CameraRig } from './cameraRig.js?v=6';
import { buildCityBoxes } from './cityBoxes.js?v=5';
import { buildCar, carBounds } from './cars.js?v=4';
import { makeVisitor, loadVisitorBase, loadGuestRig, STAFF_UNIFORM } from './crowd.js?v=18';
import { loadSpecies, placeAnimal, SPECIES } from './fauna.js?v=31';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

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
const kneelPromptGroup = document.getElementById('kneelPromptGroup');
const kneelDayPrompt = document.getElementById('kneelDayPrompt');
const kneelNightPrompt = document.getElementById('kneelNightPrompt');
const fadeEl = document.getElementById('fade');

// The sky palace sits at y=180 under the same near=0.25/far=2200 camera used
// at ground level; a linear depth buffer spends most of its precision near
// the camera, so coincident surfaces 200 units out flicker as you walk
// across them. main.js hit the same wall at city scale — same fix here.
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance', logarithmicDepthBuffer: true });
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

// The shadow frustum follows the player instead of covering the whole precinct:
// 2048² over a 110 m box is denser (≈19 texels/m) than 3072² over 220 m was
// (≈14), so the shadows are both sharper and cheaper to render.
const SUN_DIR = new THREE.Vector3(-80, 130, -70).normalize();
const SUN_DIST = 170;
const SHADOW_HALF = 55;
const sun = new THREE.DirectionalLight(0xfff5e6, 2.7);
sun.position.copy(SUN_DIR).multiplyScalar(SUN_DIST);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -SHADOW_HALF;
sun.shadow.camera.right = SHADOW_HALF;
sun.shadow.camera.top = SHADOW_HALF;
sun.shadow.camera.bottom = -SHADOW_HALF;
sun.shadow.camera.near = SUN_DIST - 90;
sun.shadow.camera.far = SUN_DIST + 130;
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.035;
sun.shadow.camera.updateProjectionMatrix();
scene.add(sun);
sun.target.position.set(0, 0, 30);
scene.add(sun.target);

// Re-centre the shadow box on the player, snapped to whole shadow texels so the
// shadow edges stop crawling as we walk.
const SHADOW_TEXEL = (SHADOW_HALF * 2) / sun.shadow.mapSize.x;
function updateSunShadow(focus) {
  if (!sun.visible) return;
  const fx = Math.round(focus.x / SHADOW_TEXEL) * SHADOW_TEXEL;
  const fz = Math.round(focus.z / SHADOW_TEXEL) * SHADOW_TEXEL;
  sun.target.position.set(fx, 0, fz);
  sun.position.set(fx, 0, fz).addScaledVector(SUN_DIR, SUN_DIST);
  sun.target.updateMatrixWorld();
}

// Cool silver-blue Moonlight for authentic Japanese night ambiance
const moon = new THREE.DirectionalLight(0x9bc8f5, 0.85);
moon.position.set(70, 130, 90);
moon.target.position.set(0, 4, 35);
scene.add(moon);
scene.add(moon.target);
moon.visible = false;

// ---------------------------------------------------------------------------
// Post-processing: HDR render target + bloom. The precinct is lit almost
// entirely by small emissive sources (candles, chōchin, sky lanterns,
// fireflies); bloom is what makes them read as light rather than as bright
// paint. Strength and threshold are re-tuned per time of day.
// ---------------------------------------------------------------------------
const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(
  window.innerWidth, window.innerHeight, { samples: 4, type: THREE.HalfFloatType }));
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight), 0.24, 0.6, 0.9);
composer.addPass(bloom);
composer.addPass(new OutputPass());

// ---------------------------------------------------------------------------
// Sky dome
//
// A flat background colour gives the precinct a dead white ceiling. This is a
// gradient from horizon to zenith with a glow around whichever luminary is up,
// so the sky reads as depth by day and as a moonlit dome at night. The horizon
// colour is kept in step with the fog so distant geometry dissolves into it.
// ---------------------------------------------------------------------------
const skyUniforms = {
  uHorizon: { value: new THREE.Color(0xd8e6ee) },
  uZenith: { value: new THREE.Color(0x6f9fd8) },
  uGlow: { value: new THREE.Color(0xfff0d0) },
  uGlowDir: { value: SUN_DIR.clone() },
  uGlowStrength: { value: 0.5 },
  uGlowTightness: { value: 12.0 },
};
const skyDome = new THREE.Mesh(
  new THREE.SphereGeometry(1700, 32, 18),
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

const DAY_SKY = {
  horizon: 0xdfe9f0, zenith: 0x5b8fd0, glow: 0xffeccc,
  dir: SUN_DIR.clone(), strength: 0.55, tightness: 9.0,
};
const NIGHT_SKY = {
  horizon: 0x0b1526, zenith: 0x02040c, glow: 0x8fb4e8,
  dir: new THREE.Vector3(70, 130, 90).normalize(), strength: 0.22, tightness: 26.0,
};
function applySky(s) {
  skyUniforms.uHorizon.value.setHex(s.horizon);
  skyUniforms.uZenith.value.setHex(s.zenith);
  skyUniforms.uGlow.value.setHex(s.glow);
  skyUniforms.uGlowDir.value.copy(s.dir);
  skyUniforms.uGlowStrength.value = s.strength;
  skyUniforms.uGlowTightness.value = s.tightness;
}
applySky(DAY_SKY);

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
// Repeats stay at 1×1 for everything that goes through worldUV() below: those
// materials get their tiling from the prop's real dimensions instead.
const woodDiff = tex('./textures/nature/wood_diff.jpg');
const woodN = ntex('./textures/nature/wood_n.jpg');
const woodR = tex('./textures/nature/wood_r.jpg');

const barkDiff = tex('./textures/nature/bark_diff.jpg');
const barkN = ntex('./textures/nature/bark_n.jpg');

const shingleDiff = tex('./textures/nature/shingle_diff.jpg');
const shingleN = ntex('./textures/nature/shingle_n.jpg');
const shingleRedDiff = tex('./textures/nature/shingle_red_diff.jpg');
const shingleRedN = ntex('./textures/nature/shingle_red_n.jpg');

const paverDiff = tex('./textures/nature/paver_diff.jpg');
const paverN = ntex('./textures/nature/paver_n.jpg');
const paverR = tex('./textures/nature/paver_r.jpg');

const dirtDiff = tex('./textures/nature/dirt_diff.jpg');
const dirtN = ntex('./textures/nature/dirt_n.jpg');

// The lawn and the car park are single fixed-size planes, so they carry their
// own explicit tiling rather than going through worldUV().
const grassDiff = tex('./textures/la/grass_diffuse.jpg', 4, 4);
const waterN = ntex('./textures/la/water_normal.jpg', 8, 8);

const asphaltA = tex('./textures/CP_Asphalt_A.webp', 40, 23);
const asphaltN = ntex('./textures/CP_Asphalt_N.webp', 40, 23);

// ---------------------------------------------------------------------------
// Procedural textures
//
// The bundled nature pack has no foliage sheet at all: foliage_diff.jpg and
// canopy_diff.jpg are both photographs of leaf litter lying on the ground,
// which is exactly why every canopy in the precinct read as a brown blob. The
// same goes for the washi panels, the rice-straw shimenawa and the raked
// karesansui gravel — none of them exist in the pack. They are painted onto a
// canvas here instead: no new files to ship, tileable by construction, and
// re-tintable per species.
// ---------------------------------------------------------------------------
function mulberry32(a) {
  return () => {
    a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function makeCanvas(size) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return c;
}

function canvasTexture(canvas, { srgb = true, rx = 1, ry = 1 } = {}) {
  const t = new THREE.CanvasTexture(canvas);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(rx, ry);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = maxAniso;
  return t;
}

// Sobel the luminance of a painted canvas into a tangent-space normal map, so
// each procedural surface gets relief that matches its own artwork instead of
// borrowing an unrelated one. Sampling wraps, so the result tiles like the
// source does.
function normalFromCanvas(src, strength = 2.0) {
  const size = src.width;
  const px = src.getContext('2d').getImageData(0, 0, size, size).data;
  const h = new Float32Array(size * size);
  for (let i = 0; i < size * size; i++) {
    h[i] = (px[i * 4] * 0.299 + px[i * 4 + 1] * 0.587 + px[i * 4 + 2] * 0.114) / 255;
  }
  const at = (x, y) => h[((y + size) % size) * size + ((x + size) % size)];
  const out = makeCanvas(size);
  const og = out.getContext('2d');
  const img = og.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const nx = -(at(x + 1, y) - at(x - 1, y)) * strength;
      const ny = -(at(x, y + 1) - at(x, y - 1)) * strength;
      const len = Math.hypot(nx, ny, 1);
      const i = (y * size + x) * 4;
      img.data[i] = (nx / len * 0.5 + 0.5) * 255;
      img.data[i + 1] = (ny / len * 0.5 + 0.5) * 255;
      img.data[i + 2] = (1 / len * 0.5 + 0.5) * 255;
      img.data[i + 3] = 255;
    }
  }
  og.putImageData(img, 0, 0);
  return out;
}

// Leaf silhouettes for alpha-tested cards. Ellipses on an opaque sheet
// wrapped a sphere and read as painted cloth; these are real blades with
// a transparent field so the crown silhouette is ragged.
function drawMapleLeaf(g, scale, fill, vein) {
  const lobes = [
    { a: -1.18, len: 0.64, w: 0.24 },
    { a: -0.58, len: 0.86, w: 0.20 },
    { a:  0.00, len: 1.00, w: 0.17 },
    { a:  0.58, len: 0.86, w: 0.20 },
    { a:  1.18, len: 0.64, w: 0.24 },
  ];
  const pt = (a, r) => [Math.sin(a) * scale * r, -Math.cos(a) * scale * r];
  g.beginPath();
  g.moveTo(0, scale * 0.14);
  for (let i = 0; i < lobes.length; i++) {
    const L = lobes[i];
    const [sx, sy] = pt(L.a - L.w, L.len * 0.40);
    const [tx, ty] = pt(L.a, L.len);
    const [ex, ey] = pt(L.a + L.w, L.len * 0.40);
    if (i > 0) {
      const mid = (lobes[i - 1].a + L.a) / 2;
      const [ix, iy] = pt(mid, 0.20);
      g.quadraticCurveTo(ix, iy, sx, sy);
    } else {
      g.lineTo(sx, sy);
    }
    g.quadraticCurveTo(
      Math.sin(L.a - L.w * 0.32) * scale * L.len * 0.78,
      -Math.cos(L.a - L.w * 0.32) * scale * L.len * 0.78,
      tx, ty);
    g.quadraticCurveTo(
      Math.sin(L.a + L.w * 0.32) * scale * L.len * 0.78,
      -Math.cos(L.a + L.w * 0.32) * scale * L.len * 0.78,
      ex, ey);
  }
  g.closePath();
  g.fillStyle = fill;
  g.fill();
  g.strokeStyle = vein;
  g.lineWidth = Math.max(1.1, scale * 0.034);
  g.lineCap = 'round';
  g.globalAlpha *= 0.5;
  g.beginPath();
  g.moveTo(0, scale * 0.12);
  g.lineTo(0, -scale * 0.82);
  g.stroke();
  for (const L of lobes) {
    if (L.a === 0) continue;
    g.beginPath();
    g.moveTo(0, scale * 0.04);
    g.lineTo(Math.sin(L.a) * scale * L.len * 0.7, -Math.cos(L.a) * scale * L.len * 0.7);
    g.stroke();
  }
  g.globalAlpha /= 0.5;
}

function drawPineTuft(g, scale, fill, vein) {
  g.strokeStyle = fill;
  g.lineCap = 'round';
  const n = 16;
  for (let i = 0; i < n; i++) {
    const a = -1.15 + (i / (n - 1)) * 2.3;
    const len = scale * (0.72 + (i % 3) * 0.12);
    g.lineWidth = Math.max(1.2, scale * 0.045);
    g.beginPath();
    g.moveTo(0, scale * 0.08);
    g.quadraticCurveTo(
      Math.sin(a) * scale * 0.28, -Math.cos(a) * scale * 0.35,
      Math.sin(a) * len, -Math.cos(a) * len);
    g.stroke();
  }
  g.fillStyle = vein;
  g.beginPath();
  g.ellipse(0, scale * 0.06, scale * 0.08, scale * 0.1, 0, 0, Math.PI * 2);
  g.fill();
}

function drawSakuraPetal(g, len, w, fill1, fill2) {
  g.save();
  const grad = g.createLinearGradient(0, 0, 0, -len);
  grad.addColorStop(0, fill1);
  grad.addColorStop(0.55, fill2);
  // A pure white tip drained the hue out of the canopy once a few hundred petals
  // overlapped; lightening the petal's own colour keeps the mass pink.
  grad.addColorStop(1, mixHex(fill2, '#ffffff', 0.6));
  g.fillStyle = grad;
  g.beginPath();
  g.moveTo(0, 0);
  g.bezierCurveTo(-w * 0.75, -len * 0.35, -w, -len * 0.82, -w * 0.35, -len);
  g.quadraticCurveTo(0, -len * 0.88, w * 0.35, -len);
  g.bezierCurveTo(w, -len * 0.82, w * 0.75, -len * 0.35, 0, 0);
  g.fill();
  g.restore();
}

function drawSakuraBlossom(g, scale, fillBase, fillEdge, centerColor = '#e2487a') {
  g.save();
  // Calyx / depth shadow at the blossom center
  g.fillStyle = 'rgba(90, 30, 42, 0.45)';
  g.beginPath();
  g.arc(0, 0, scale * 0.22, 0, Math.PI * 2);
  g.fill();

  // 5 notched petals
  const pLen = scale * 0.65;
  const pW = scale * 0.38;
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
    g.save();
    g.rotate(a);
    drawSakuraPetal(g, pLen, pW, fillBase, fillEdge);
    g.restore();
  }

  // Soft rosy central glow
  const gradCenter = g.createRadialGradient(0, 0, 0, 0, 0, scale * 0.28);
  gradCenter.addColorStop(0, centerColor);
  gradCenter.addColorStop(0.5, 'rgba(235, 70, 120, 0.65)');
  gradCenter.addColorStop(1, 'rgba(255, 180, 200, 0)');
  g.fillStyle = gradCenter;
  g.beginPath();
  g.arc(0, 0, scale * 0.28, 0, Math.PI * 2);
  g.fill();

  // Stamens and golden anther tips
  const stamenCount = 8;
  g.strokeStyle = 'rgba(215, 80, 115, 0.85)';
  g.lineWidth = Math.max(1, scale * 0.025);
  for (let s = 0; s < stamenCount; s++) {
    const sa = (s / stamenCount) * Math.PI * 2;
    const sl = scale * (0.13 + (s % 3) * 0.04);
    const sx = Math.cos(sa) * sl;
    const sy = Math.sin(sa) * sl;
    g.beginPath();
    g.moveTo(0, 0);
    g.lineTo(sx, sy);
    g.stroke();
    g.fillStyle = '#ffde59';
    g.beginPath();
    g.arc(sx, sy, Math.max(1.1, scale * 0.034), 0, Math.PI * 2);
    g.fill();
  }

  // Central pistil
  g.fillStyle = '#6e9828';
  g.beginPath();
  g.arc(0, 0, Math.max(1, scale * 0.038), 0, Math.PI * 2);
  g.fill();

  g.restore();
}

function drawBambooBlade(g, scale, fill, vein) {
  g.beginPath();
  g.moveTo(0, -scale);
  g.quadraticCurveTo(scale * 0.22, 0, 0, scale);
  g.quadraticCurveTo(-scale * 0.22, 0, 0, -scale);
  g.fillStyle = fill;
  g.fill();
  g.strokeStyle = vein;
  g.lineWidth = Math.max(1, scale * 0.03);
  g.globalAlpha *= 0.45;
  g.beginPath();
  g.moveTo(0, -scale * 0.9);
  g.lineTo(0, scale * 0.9);
  g.stroke();
  g.globalAlpha /= 0.45;
}

function drawLeafKind(g, kind, scale, fill, vein, fillEdge) {
  if (kind === 'pine') drawPineTuft(g, scale, fill, vein);
  else if (kind === 'sakura' || kind === 'sakuraWhite') drawSakuraBlossom(g, scale, fill, fillEdge || fill, vein);
  else if (kind === 'bamboo') drawBambooBlade(g, scale, fill, vein);
  else drawMapleLeaf(g, scale, fill, vein);
}

// Blend two hex colours. The shaded understorey tones are derived from the
// species palette this way rather than hand-listed a second time.
function mixHex(a, b, t) {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const ch = sh => Math.round((pa >> sh & 255) * (1 - t) + (pb >> sh & 255) * t);
  return `#${((1 << 24) | (ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).slice(1)}`;
}

// One card = a clump of blossoms/leaves. Two things stop a canopy of these from
// reading as stamped plates. The silhouette has to stop at a torn contour well
// inside the UV square, or every card shows its own rectangle; and the depth
// behind the blossoms has to be made of more blossoms, because alphaTest slices
// a soft gradient into a hard-edged disc — the plate artefact the old volume
// layer was meant to hide, and the one it actually produced.
function makeFoliageClump(kind, tones, vein, {
  size = 512, count = 38, seed = 7, scaleMin = 0.06, scaleMax = 0.13, spray = false,
} = {}) {
  const c = makeCanvas(size);
  const g = c.getContext('2d');
  const rnd = mulberry32(seed);
  g.clearRect(0, 0, size, size);
  const cx = size / 2, cy = spray ? size * 0.22 : size / 2;

  const stamp = (x, y, sc, rot, palette, alpha) => {
    g.save();
    g.translate(x, y);
    g.rotate(rot);
    g.globalAlpha = alpha;
    drawLeafKind(g, kind, sc,
      palette[(rnd() * palette.length) | 0], vein,
      palette[(rnd() * palette.length) | 0]);
    g.restore();
  };

  // Understorey: the same blades one size up, shaded, packed into the core.
  if (!spray) {
    // Shade toward a deeper tone of the species' own hue — a neutral grey here
    // turns the understorey muddy the moment it sits in the tree's shadow.
    const shade = kind === 'pine' ? '#0c1a0b' : kind === 'maple' ? '#4a1208' : '#c2547d';
    const backTones = tones.map(t => mixHex(t, shade, 0.5));
    const backCount = Math.round(count * 0.6);
    for (let i = 0; i < backCount; i++) {
      const ang = rnd() * Math.PI * 2;
      const rad = Math.pow(rnd(), 0.5) * size * 0.28;
      stamp(cx + Math.cos(ang) * rad, cy + Math.sin(ang) * rad,
        size * (scaleMin + rnd() * (scaleMax - scaleMin)) * 1.4,
        rnd() * Math.PI * 2, backTones, 1);
    }
  }

  // Crisp foreground floral/leaf detail layer
  for (let i = 0; i < count; i++) {
    const ang = spray ? (rnd() - 0.5) * 1.6 + Math.PI / 2 : rnd() * Math.PI * 2;
    const rad = Math.pow(rnd(), spray ? 0.45 : 0.52) * size * (spray ? 0.42 : 0.34);
    const x = cx + Math.cos(ang) * rad * (spray ? 0.55 : 1);
    const y = cy + Math.sin(ang) * rad;
    const sc = size * (scaleMin + rnd() * (scaleMax - scaleMin));
    const rot = spray ? ang + (rnd() - 0.5) * 0.35 : rnd() * Math.PI * 2;
    stamp(x, y, sc, rot, tones, 0.88 + rnd() * 0.12);
  }

  // Torn silhouette. The lobes accumulate on their own sheet so they add up
  // instead of erasing one another, then punch through the artwork in one pass.
  // Overlapping falloffs put the alphaTest cut on an irregular contour, so the
  // card ends in a ragged rim rather than at the edge of its own square.
  if (!spray) {
    const maskC = makeCanvas(size);
    const mg = maskC.getContext('2d');
    mg.globalCompositeOperation = 'lighter';
    const lobes = 7;
    for (let i = 0; i < lobes; i++) {
      const ang = (i / lobes) * Math.PI * 2 + rnd() * 1.5;
      const off = size * (0.06 + rnd() * 0.22);
      const lx = cx + Math.cos(ang) * off;
      const ly = cy + Math.sin(ang) * off;
      const lr = size * (0.11 + rnd() * 0.20);
      const grad = mg.createRadialGradient(lx, ly, 0, lx, ly, lr);
      grad.addColorStop(0, 'rgba(255,255,255,1)');
      grad.addColorStop(0.55, 'rgba(255,255,255,1)');
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      mg.fillStyle = grad;
      mg.beginPath();
      mg.arc(lx, ly, lr, 0, Math.PI * 2);
      mg.fill();
    }
    // Bite a couple of gaps out of the mass so daylight gets through it.
    mg.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 2; i++) {
      const ang = rnd() * Math.PI * 2;
      const off = size * (0.10 + rnd() * 0.18);
      const hx = cx + Math.cos(ang) * off;
      const hy = cy + Math.sin(ang) * off;
      const hr = size * (0.035 + rnd() * 0.04);
      const hole = mg.createRadialGradient(hx, hy, 0, hx, hy, hr);
      hole.addColorStop(0, 'rgba(0,0,0,1)');
      hole.addColorStop(0.6, 'rgba(0,0,0,1)');
      hole.addColorStop(1, 'rgba(0,0,0,0)');
      mg.fillStyle = hole;
      mg.beginPath();
      mg.arc(hx, hy, hr, 0, Math.PI * 2);
      mg.fill();
    }
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'destination-in';
    g.drawImage(maskC, 0, 0);
    g.globalCompositeOperation = 'source-over';

    // Loose blossoms scattered past the mask, drawn after it so they keep their
    // own outline. Without them the mask contour is what the eye reads, and a
    // crown of masked cards turns into a heap of soft round bubbles.
    const rimCount = Math.round(count * 0.3);
    for (let i = 0; i < rimCount; i++) {
      const ang = rnd() * Math.PI * 2;
      const rad = size * (0.27 + Math.pow(rnd(), 0.7) * 0.19);
      stamp(cx + Math.cos(ang) * rad, cy + Math.sin(ang) * rad,
        size * (scaleMin + rnd() * (scaleMax - scaleMin)) * 0.85,
        rnd() * Math.PI * 2, tones, 1);
    }
  }
  return c;
}

// A canopy built from one sheet repeats that sheet a few hundred times, and the
// eye picks the repeat out immediately. Several sheets per species, chosen per
// card, is what breaks the pattern up.
function foliageSheets(n, kind, tones, vein, opts = {}) {
  return Array.from({ length: n }, (_, i) =>
    canvasTexture(makeFoliageClump(kind, tones, vein, { ...opts, seed: (opts.seed ?? 7) + i * 101 })));
}

function foliageMats(texes, { alphaTest = 0.3, roughness = 0.78 } = {}) {
  return texes.map(map => new THREE.MeshStandardMaterial({
    color: 0xffffff, roughness, metalness: 0.0,
    map, alphaTest, alphaToCoverage: true,
    side: THREE.DoubleSide,
  }));
}

// Washi: long paper fibres caught in the pulp, plus a faint cloudiness.
function makeWashiCanvas({ size = 512, seed = 3 } = {}) {
  const c = makeCanvas(size);
  const g = c.getContext('2d');
  const rnd = mulberry32(seed);
  g.fillStyle = '#f7f3e8';
  g.fillRect(0, 0, size, size);
  for (let i = 0; i < 260; i++) {
    g.globalAlpha = 0.03 + rnd() * 0.05;
    g.fillStyle = rnd() < 0.5 ? '#ffffff' : '#ded5c0';
    const r = 30 + rnd() * 90;
    g.beginPath();
    g.ellipse(rnd() * size, rnd() * size, r, r * (0.5 + rnd()), rnd() * Math.PI, 0, Math.PI * 2);
    g.fill();
  }
  for (let i = 0; i < 900; i++) {
    const x = rnd() * size, y = rnd() * size;
    const len = 12 + rnd() * 48;
    const rot = rnd() * Math.PI;
    g.globalAlpha = 0.10 + rnd() * 0.22;
    g.strokeStyle = rnd() < 0.6 ? '#cdc2a6' : '#ffffff';
    g.lineWidth = 0.6 + rnd() * 1.0;
    g.save();
    g.translate(x, y);
    g.rotate(rot);
    g.beginPath();
    g.moveTo(-len / 2, 0);
    g.lineTo(len / 2, 0);
    g.stroke();
    g.restore();
  }
  g.globalAlpha = 1;
  return c;
}

// Shimenawa: two rice-straw strands laid up into a left-hand twist.
function makeRopeCanvas({ size = 512, seed = 11 } = {}) {
  const c = makeCanvas(size);
  const g = c.getContext('2d');
  const rnd = mulberry32(seed);
  g.fillStyle = '#8f7a4e';
  g.fillRect(0, 0, size, size);
  const strands = 5;
  for (let s = 0; s < strands; s++) {
    for (let k = 0; k < 90; k++) {
      const t = k / 90;
      const y = t * size;
      const x = ((s / strands + t * 0.62) % 1) * size;
      g.globalAlpha = 0.5 + rnd() * 0.4;
      g.strokeStyle = ['#cbb681', '#b7a068', '#a68e58', '#dcc994'][(rnd() * 4) | 0];
      g.lineWidth = size / strands * (0.5 + rnd() * 0.35);
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + size * 0.09, y + size / 90 + 2);
      g.stroke();
      g.beginPath();
      g.moveTo(x - size, y);
      g.lineTo(x - size + size * 0.09, y + size / 90 + 2);
      g.stroke();
    }
  }
  // Individual straws catching the light along the lay of the rope.
  for (let i = 0; i < 1500; i++) {
    const x = rnd() * size, y = rnd() * size;
    g.globalAlpha = 0.10 + rnd() * 0.3;
    g.strokeStyle = rnd() < 0.5 ? '#e3d3a4' : '#7d683f';
    g.lineWidth = 0.7;
    g.save();
    g.translate(x, y);
    g.rotate(1.05);
    g.beginPath();
    g.moveTo(-14, 0);
    g.lineTo(14, 0);
    g.stroke();
    g.restore();
  }
  g.globalAlpha = 1;
  return c;
}

// Karesansui: raked furrows in fine white gravel.
function makeRakedGravelCanvas({ size = 512, seed = 19 } = {}) {
  const c = makeCanvas(size);
  const g = c.getContext('2d');
  const rnd = mulberry32(seed);
  g.fillStyle = '#dedbd2';
  g.fillRect(0, 0, size, size);
  for (let i = 0; i < 60000; i++) {
    g.fillStyle = rnd() < 0.5 ? 'rgba(255,255,255,0.35)' : 'rgba(120,116,104,0.30)';
    g.fillRect(rnd() * size, rnd() * size, 1.6, 1.6);
  }
  const furrows = 8;
  for (let f = 0; f < furrows; f++) {
    const y = (f + 0.5) * size / furrows;
    const grad = g.createLinearGradient(0, y - size / furrows / 2, 0, y + size / furrows / 2);
    grad.addColorStop(0, 'rgba(90,86,76,0.34)');
    grad.addColorStop(0.42, 'rgba(255,255,255,0.30)');
    grad.addColorStop(0.6, 'rgba(255,255,255,0.22)');
    grad.addColorStop(1, 'rgba(90,86,76,0.34)');
    g.fillStyle = grad;
    g.fillRect(0, y - size / furrows / 2, size, size / furrows);
  }
  return c;
}

// Bamboo culm: waxy vertical striation broken by a node ring per tile.
function makeBambooCanvas({ size = 512, seed = 23 } = {}) {
  const c = makeCanvas(size);
  const g = c.getContext('2d');
  const rnd = mulberry32(seed);
  const grad = g.createLinearGradient(0, 0, size, 0);
  grad.addColorStop(0, '#4a6f2c');
  grad.addColorStop(0.35, '#86ab52');
  grad.addColorStop(0.6, '#9cbb63');
  grad.addColorStop(1, '#41631f');
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  for (let i = 0; i < 700; i++) {
    g.globalAlpha = 0.05 + rnd() * 0.14;
    g.strokeStyle = rnd() < 0.5 ? '#c6dc92' : '#3d5c1e';
    g.lineWidth = 0.8 + rnd() * 2.2;
    const x = rnd() * size;
    g.beginPath();
    g.moveTo(x, 0);
    g.lineTo(x, size);
    g.stroke();
  }
  g.globalAlpha = 1;
  // Node ring, with the pale collar the culm grows above each joint.
  g.fillStyle = '#6d8c38';
  g.fillRect(0, size - 16, size, 12);
  g.fillStyle = 'rgba(226,236,190,0.75)';
  g.fillRect(0, size - 22, size, 6);
  g.fillStyle = 'rgba(40,58,20,0.5)';
  g.fillRect(0, size - 4, size, 4);
  return c;
}

// Checkered Marble Plaza: alternating polished white marble and deep obsidian tiles
function makeCheckeredFloorCanvas({ size = 512, seed = 7, tiles = 8 } = {}) {
  const c = makeCanvas(size);
  const g = c.getContext('2d');
  const tileSize = size / tiles;
  const rnd = mulberry32(seed);
  for (let y = 0; y < tiles; y++) {
    for (let x = 0; x < tiles; x++) {
      const isWhite = (x + y) % 2 === 0;
      g.fillStyle = isWhite ? '#fcfbf7' : '#1e2428';
      g.fillRect(x * tileSize, y * tileSize, tileSize, tileSize);
      
      // Marble veining
      g.save();
      g.beginPath();
      g.rect(x * tileSize + 1, y * tileSize + 1, tileSize - 2, tileSize - 2);
      g.clip();
      
      const veins = isWhite ? 6 : 4;
      for (let v = 0; v < veins; v++) {
        g.strokeStyle = isWhite ? 'rgba(180, 175, 165, 0.25)' : 'rgba(255, 255, 255, 0.12)';
        g.lineWidth = 0.8 + rnd() * 1.5;
        g.beginPath();
        let vx = x * tileSize + rnd() * tileSize;
        let vy = y * tileSize + rnd() * tileSize;
        g.moveTo(vx, vy);
        for (let s = 0; s < 4; s++) {
          vx += (rnd() - 0.5) * tileSize * 0.6;
          vy += (rnd() - 0.5) * tileSize * 0.6;
          g.lineTo(vx, vy);
        }
        g.stroke();
      }
      
      // Tile bevel / border
      g.strokeStyle = isWhite ? 'rgba(140, 135, 125, 0.45)' : 'rgba(0, 0, 0, 0.6)';
      g.lineWidth = 2;
      g.strokeRect(x * tileSize + 1, y * tileSize + 1, tileSize - 2, tileSize - 2);
      
      // Specular rim
      g.strokeStyle = 'rgba(255, 255, 255, 0.35)';
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(x * tileSize + 2, (y + 1) * tileSize - 2);
      g.lineTo(x * tileSize + 2, y * tileSize + 2);
      g.lineTo((x + 1) * tileSize - 2, y * tileSize + 2);
      g.stroke();
      
      g.restore();
    }
  }
  return c;
}

// Gilded floor marble: the throne dais and the reflection-pool coping are flat
// walkable discs several metres across, close enough to the camera that a bare
// metal MeshStandardMaterial colour reads as an untextured plastic disc. Same
// veined-tile construction as the checkerboard plaza, one warm gold tone.
function makeGoldMarbleCanvas({ size = 512, seed = 41, tiles = 4 } = {}) {
  const c = makeCanvas(size);
  const g = c.getContext('2d');
  const tileSize = size / tiles;
  const rnd = mulberry32(seed);
  for (let y = 0; y < tiles; y++) {
    for (let x = 0; x < tiles; x++) {
      g.fillStyle = '#c89a3c';
      g.fillRect(x * tileSize, y * tileSize, tileSize, tileSize);
      g.save();
      g.beginPath();
      g.rect(x * tileSize + 1, y * tileSize + 1, tileSize - 2, tileSize - 2);
      g.clip();

      for (let v = 0; v < 5; v++) {
        g.strokeStyle = rnd() < 0.5 ? 'rgba(255, 235, 175, 0.4)' : 'rgba(110, 76, 16, 0.35)';
        g.lineWidth = 0.8 + rnd() * 1.6;
        g.beginPath();
        let vx = x * tileSize + rnd() * tileSize;
        let vy = y * tileSize + rnd() * tileSize;
        g.moveTo(vx, vy);
        for (let s = 0; s < 4; s++) {
          vx += (rnd() - 0.5) * tileSize * 0.65;
          vy += (rnd() - 0.5) * tileSize * 0.65;
          g.lineTo(vx, vy);
        }
        g.stroke();
      }
      for (let f = 0; f < 34; f++) {
        g.fillStyle = `rgba(255, 245, 210, ${0.15 + rnd() * 0.25})`;
        g.fillRect(x * tileSize + rnd() * tileSize, y * tileSize + rnd() * tileSize,
          1 + rnd() * 1.5, 1 + rnd() * 1.5);
      }
      g.strokeStyle = 'rgba(80, 55, 10, 0.55)';
      g.lineWidth = 2;
      g.strokeRect(x * tileSize + 1, y * tileSize + 1, tileSize - 2, tileSize - 2);
      g.restore();
    }
  }
  return c;
}

// Celestial carpets for the sky palace. Unlike every other surface here these
// are *not* run through worldUV: a rug is one composition, not a tiling, so it
// wants exactly one stamp. A cylinder cap's UVs are already a disc inscribed in
// 0..1 and a box's top face is already the full 0..1 square, so a round rug and
// a rectangular one can each take their whole design straight off the canvas.
function starSparkle(g, cx, cy, s, fill) {
  g.save();
  g.translate(cx, cy);
  g.fillStyle = fill;
  g.beginPath();
  g.moveTo(0, -s);
  g.quadraticCurveTo(s * 0.15, -s * 0.15, s, 0);
  g.quadraticCurveTo(s * 0.15, s * 0.15, 0, s);
  g.quadraticCurveTo(-s * 0.15, s * 0.15, -s, 0);
  g.quadraticCurveTo(-s * 0.15, -s * 0.15, 0, -s);
  g.fill();
  g.restore();
}

// Scattered pinpricks plus a few bright sparkles, over whatever ground the
// caller has already laid down. Shared by both rug designs so the two read as
// pieces of one set.
function paintStarField(g, rnd, x0, y0, w, h, density, maxSparkle) {
  const n = Math.round(w * h * density);
  for (let i = 0; i < n; i++) {
    const sx = x0 + rnd() * w, sy = y0 + rnd() * h;
    g.fillStyle = `rgba(255, 246, 214, ${0.18 + rnd() * 0.55})`;
    g.beginPath();
    g.arc(sx, sy, 0.5 + rnd() * 1.5, 0, Math.PI * 2);
    g.fill();
  }
  for (let i = 0; i < maxSparkle; i++) {
    starSparkle(g, x0 + rnd() * w, y0 + rnd() * h, 3 + rnd() * 5,
      `rgba(255, 236, 176, ${0.55 + rnd() * 0.4})`);
  }
}

// Round medallion rug: a mandala of lotus petals, concentric gold bands and a
// constellation wheel on a midnight ground.
function makeCelestialRugCanvas({ size = 512, seed = 61 } = {}) {
  const c = makeCanvas(size);
  const g = c.getContext('2d');
  const rnd = mulberry32(seed);
  const R = size / 2;

  // Deepest at the rim so the gilt centre lifts off the ground.
  const ground = g.createRadialGradient(R, R, size * 0.03, R, R, R);
  ground.addColorStop(0.00, '#33468f');
  ground.addColorStop(0.42, '#1c2a64');
  ground.addColorStop(0.82, '#111a44');
  ground.addColorStop(1.00, '#080d26');
  g.fillStyle = ground;
  g.fillRect(0, 0, size, size);

  paintStarField(g, rnd, 0, 0, size, size, 0.0016, 26);

  const ring = (r, w, stroke) => {
    g.strokeStyle = stroke;
    g.lineWidth = w;
    g.beginPath();
    g.arc(R, R, r, 0, Math.PI * 2);
    g.stroke();
  };

  // Outer selvedge and the woven gold border band.
  g.fillStyle = '#0a1030';
  g.beginPath();
  g.arc(R, R, R * 0.995, 0, Math.PI * 2);
  g.arc(R, R, R * 0.90, 0, Math.PI * 2, true);
  g.fill();
  ring(R * 0.945, R * 0.052, 'rgba(206, 160, 60, 0.55)');
  ring(R * 0.90, 3, '#e8c463');
  ring(R * 0.985, 3, '#e8c463');

  // Seigaiha wave crests running the border.
  for (let i = 0; i < 64; i++) {
    const a = (i / 64) * Math.PI * 2;
    const bx = R + Math.cos(a) * R * 0.943;
    const by = R + Math.sin(a) * R * 0.943;
    g.save();
    g.translate(bx, by);
    g.rotate(a + Math.PI / 2);
    g.strokeStyle = 'rgba(255, 226, 150, 0.75)';
    g.lineWidth = 1.6;
    for (let k = 1; k <= 3; k++) {
      g.beginPath();
      g.arc(0, R * 0.022, k * R * 0.011, Math.PI, 0);
      g.stroke();
    }
    g.restore();
  }

  // Constellation wheel: 12 anchor stars joined into a closed circuit, with
  // spurs, so the field reads as a chart rather than as random speckle.
  const anchors = [];
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 + rnd() * 0.22;
    const r = R * (0.55 + rnd() * 0.28);
    anchors.push({ x: R + Math.cos(a) * r, y: R + Math.sin(a) * r });
  }
  g.strokeStyle = 'rgba(228, 198, 128, 0.42)';
  g.lineWidth = 1.4;
  g.beginPath();
  anchors.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)));
  g.closePath();
  g.stroke();
  for (const p of anchors) {
    g.beginPath();
    g.moveTo(p.x, p.y);
    g.lineTo(R + (p.x - R) * 1.22, R + (p.y - R) * 1.22);
    g.stroke();
    starSparkle(g, p.x, p.y, 6.5, 'rgba(255, 242, 196, 0.95)');
  }

  // Lotus petal corona around the centre.
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    g.save();
    g.translate(R, R);
    g.rotate(a);
    const petal = g.createLinearGradient(0, -R * 0.14, 0, -R * 0.46);
    petal.addColorStop(0, 'rgba(233, 196, 108, 0.92)');
    petal.addColorStop(1, 'rgba(150, 112, 46, 0.30)');
    g.fillStyle = petal;
    g.beginPath();
    g.moveTo(0, -R * 0.14);
    g.quadraticCurveTo(R * 0.10, -R * 0.30, 0, -R * 0.47);
    g.quadraticCurveTo(-R * 0.10, -R * 0.30, 0, -R * 0.14);
    g.fill();
    g.strokeStyle = 'rgba(255, 232, 168, 0.7)';
    g.lineWidth = 1.2;
    g.stroke();
    g.restore();
  }

  ring(R * 0.50, 2.5, 'rgba(240, 206, 130, 0.85)');
  ring(R * 0.34, 2.0, 'rgba(240, 206, 130, 0.6)');

  // Central sun-disc with rays.
  const core = g.createRadialGradient(R, R, 2, R, R, R * 0.20);
  core.addColorStop(0, '#fff4cd');
  core.addColorStop(0.55, '#e6bd63');
  core.addColorStop(1, '#8a6321');
  g.fillStyle = core;
  g.beginPath();
  g.arc(R, R, R * 0.20, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = 'rgba(255, 240, 190, 0.8)';
  g.lineWidth = 1.8;
  for (let i = 0; i < 32; i++) {
    const a = (i / 32) * Math.PI * 2;
    g.beginPath();
    g.moveTo(R + Math.cos(a) * R * 0.21, R + Math.sin(a) * R * 0.21);
    g.lineTo(R + Math.cos(a) * R * (i % 2 ? 0.26 : 0.31), R + Math.sin(a) * R * (i % 2 ? 0.26 : 0.31));
    g.stroke();
  }
  // Waxing crescent bitten out of the sun's face. Kept small and half-veiled:
  // a wide opaque bite reads from standing height as a hole in the rug.
  g.globalCompositeOperation = 'source-atop';
  g.fillStyle = 'rgba(38, 52, 108, 0.55)';
  g.beginPath();
  g.arc(R - R * 0.075, R, R * 0.115, 0, Math.PI * 2);
  g.fill();
  g.globalCompositeOperation = 'source-over';

  return c;
}

// Rectangular rug: a key-fret border framing a constellation field. Runners are
// laid as a row of these squares, so the medallions repeat down their length
// the way a woven runner's do.
function makeCelestialPanelCanvas({ size = 512, seed = 83 } = {}) {
  const c = makeCanvas(size);
  const g = c.getContext('2d');
  const rnd = mulberry32(seed);

  const ground = g.createLinearGradient(0, 0, size, size);
  ground.addColorStop(0, '#1d2a63');
  ground.addColorStop(0.5, '#141d4c');
  ground.addColorStop(1, '#0d1436');
  g.fillStyle = ground;
  g.fillRect(0, 0, size, size);

  const b = size * 0.10;
  paintStarField(g, rnd, b, b, size - b * 2, size - b * 2, 0.0022, 14);

  // Border: a dark selvedge, a gold key-fret band, gold rules either side.
  g.fillStyle = '#0a1030';
  g.fillRect(0, 0, size, b);
  g.fillRect(0, size - b, size, b);
  g.fillRect(0, 0, b, size);
  g.fillRect(size - b, 0, b, size);

  g.strokeStyle = '#e8c463';
  g.lineWidth = 3;
  g.strokeRect(b * 0.28, b * 0.28, size - b * 0.56, size - b * 0.56);
  g.strokeRect(b, b, size - b * 2, size - b * 2);

  // Sayagata fret marching around the band, drawn once per edge and rotated.
  g.strokeStyle = 'rgba(255, 228, 154, 0.9)';
  g.lineWidth = 2.2;
  const fret = b * 0.44;
  for (let e = 0; e < 4; e++) {
    g.save();
    g.translate(size / 2, size / 2);
    g.rotate((e * Math.PI) / 2);
    g.translate(-size / 2, -size / 2);
    for (let px = b * 0.6; px < size - b * 0.6; px += fret * 1.6) {
      g.beginPath();
      g.moveTo(px, b * 0.64 - fret * 0.30);
      g.lineTo(px + fret * 0.62, b * 0.64 - fret * 0.30);
      g.lineTo(px + fret * 0.62, b * 0.64 + fret * 0.30);
      g.lineTo(px + fret * 1.24, b * 0.64 + fret * 0.30);
      g.stroke();
    }
    g.restore();
  }

  // Corner cloud (kumo) scrolls.
  for (let e = 0; e < 4; e++) {
    g.save();
    g.translate(size / 2, size / 2);
    g.rotate((e * Math.PI) / 2);
    g.translate(-size / 2, -size / 2);
    g.strokeStyle = 'rgba(226, 192, 122, 0.55)';
    g.lineWidth = 2.4;
    for (let k = 0; k < 3; k++) {
      const r = b * (0.7 + k * 0.42);
      g.beginPath();
      g.arc(b * 1.25, b * 1.25, r, Math.PI * 0.95, Math.PI * 1.85);
      g.stroke();
    }
    g.restore();
  }

  // Field: a constellation strung across the centre with a lozenge medallion.
  const m = size / 2, span = size * 0.30;
  g.save();
  g.translate(m, m);
  g.rotate(Math.PI / 4);
  g.strokeStyle = 'rgba(240, 206, 130, 0.85)';
  g.lineWidth = 2.6;
  g.strokeRect(-span * 0.62, -span * 0.62, span * 1.24, span * 1.24);
  g.strokeStyle = 'rgba(240, 206, 130, 0.45)';
  g.lineWidth = 1.6;
  g.strokeRect(-span * 0.78, -span * 0.78, span * 1.56, span * 1.56);
  g.restore();

  const chart = [];
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + 0.4;
    const r = span * (0.30 + rnd() * 0.52);
    chart.push({ x: m + Math.cos(a) * r, y: m + Math.sin(a) * r * 0.9 });
  }
  g.strokeStyle = 'rgba(232, 202, 134, 0.5)';
  g.lineWidth = 1.4;
  g.beginPath();
  chart.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)));
  g.stroke();
  for (const p of chart) starSparkle(g, p.x, p.y, 5.5, 'rgba(255, 242, 196, 0.95)');
  starSparkle(g, m, m, 13, 'rgba(255, 246, 210, 0.95)');

  return c;
}

// Seamless night vault for the inside of the domes. Tiles, unlike the two rugs:
// a sphere's UVs wrap, so this is a pattern rather than a composition.
function makeCelestialVaultCanvas({ size = 512, seed = 97 } = {}) {
  const c = makeCanvas(size);
  const g = c.getContext('2d');
  const rnd = mulberry32(seed);

  g.fillStyle = '#131c46';
  g.fillRect(0, 0, size, size);
  // Nebulous drift, kept off the seams so the tile stays continuous.
  for (let i = 0; i < 26; i++) {
    const nx = rnd() * size, ny = rnd() * size, nr = size * (0.06 + rnd() * 0.16);
    const neb = g.createRadialGradient(nx, ny, 0, nx, ny, nr);
    neb.addColorStop(0, `rgba(74, 96, 176, ${0.10 + rnd() * 0.12})`);
    neb.addColorStop(1, 'rgba(74, 96, 176, 0)');
    g.fillStyle = neb;
    g.fillRect(nx - nr, ny - nr, nr * 2, nr * 2);
  }

  paintStarField(g, rnd, 0, 0, size, size, 0.0034, 22);

  // Constellation strands. Wrapped with a modulo so a line leaving one edge
  // arrives back on the other, which is what keeps the seams invisible.
  g.strokeStyle = 'rgba(226, 198, 132, 0.34)';
  g.lineWidth = 1.3;
  for (let k = 0; k < 9; k++) {
    let px = rnd() * size, py = rnd() * size;
    for (let j = 0; j < 4; j++) {
      const qx = px + (rnd() - 0.5) * size * 0.3;
      const qy = py + (rnd() - 0.5) * size * 0.3;
      g.beginPath();
      g.moveTo(((px % size) + size) % size, ((py % size) + size) % size);
      g.lineTo(((qx % size) + size) % size, ((qy % size) + size) % size);
      g.stroke();
      starSparkle(g, ((qx % size) + size) % size, ((qy % size) + size) % size, 4.5,
        'rgba(255, 240, 190, 0.9)');
      px = qx; py = qy;
    }
  }
  return c;
}

const pineLeafTs = foliageSheets(2, 'pine',
  ['#1b3819', '#244820', '#2d5828', '#1a3318', '#3d6c34'], '#0f200e',
  { count: 46, seed: 5, scaleMin: 0.10, scaleMax: 0.18 });
const sakuraLeafTs = foliageSheets(3, 'sakura',
  ['#ff9dbf', '#ff86ad', '#ffb6d2', '#f97ba6', '#ffcede'], '#e85d88',
  { count: 88, seed: 13, scaleMin: 0.075, scaleMax: 0.14 });
const sakuraWhiteLeafTs = foliageSheets(3, 'sakuraWhite',
  ['#ffffff', '#fff5f8', '#f8edf2', '#fff0f4', '#ffffff'], '#df9bb4',
  { count: 88, seed: 17, scaleMin: 0.075, scaleMax: 0.14 });
const momijiLeafTs = foliageSheets(3, 'maple',
  ['#c92a2a', '#e03131', '#e8590c', '#f76707', '#a61e1e', '#d9480f'], '#491212',
  { count: 54, seed: 29, scaleMin: 0.085, scaleMax: 0.16 });
const bambooLeafC = makeFoliageClump('bamboo',
  ['#5f8f33', '#4d7a28', '#79a845', '#365c1e', '#6b9a3a'], '#2a4416',
  { count: 20, seed: 31, scaleMin: 0.10, scaleMax: 0.20, spray: true });

const bambooLeafT = canvasTexture(bambooLeafC);

const washiC = makeWashiCanvas();
const washiT = canvasTexture(washiC);
const washiN = canvasTexture(normalFromCanvas(washiC, 1.1), { srgb: false });

const ropeC = makeRopeCanvas();
const ropeT = canvasTexture(ropeC, { rx: 1, ry: 8 });
const ropeN = canvasTexture(normalFromCanvas(ropeC, 3.2), { srgb: false, rx: 1, ry: 8 });

const gravelC = makeRakedGravelCanvas();
const gravelT = canvasTexture(gravelC);
const gravelN = canvasTexture(normalFromCanvas(gravelC, 2.2), { srgb: false });

const bambooSkinC = makeBambooCanvas();
const bambooSkinT = canvasTexture(bambooSkinC);
const bambooSkinN = canvasTexture(normalFromCanvas(bambooSkinC, 2.0), { srgb: false });

const checkerC = makeCheckeredFloorCanvas();
const checkerT = canvasTexture(checkerC);
const checkerN = canvasTexture(normalFromCanvas(checkerC, 2.0), { srgb: false });

const goldMarbleC = makeGoldMarbleCanvas();
const goldMarbleT = canvasTexture(goldMarbleC);
const goldMarbleN = canvasTexture(normalFromCanvas(goldMarbleC, 1.6), { srgb: false });

const rugRoundC = makeCelestialRugCanvas();
const rugRoundT = canvasTexture(rugRoundC);
const rugRoundN = canvasTexture(normalFromCanvas(rugRoundC, 1.3), { srgb: false });

const rugPanelC = makeCelestialPanelCanvas();
const rugPanelT = canvasTexture(rugPanelC);
const rugPanelN = canvasTexture(normalFromCanvas(rugPanelC, 1.3), { srgb: false });

const vaultC = makeCelestialVaultCanvas();
const vaultT = canvasTexture(vaultC, { rx: 5, ry: 2 });
const vaultSmallT = canvasTexture(vaultC, { rx: 3, ry: 1 });

const M = {
  // Vermilion torii are lacquered, so the grain shows only as a faint relief
  // under a clear coat rather than as brown wood colour.
  // Vermilion torii are lacquered: the grain survives only as a faint relief
  // under the clear coat, so this takes the normal map but not the brown
  // diffuse that was dragging the red down into mud.
  toriiRed: new THREE.MeshPhysicalMaterial({
    color: 0xd93a29, roughness: 0.44, metalness: 0.0,
    clearcoat: 0.85, clearcoatRoughness: 0.18,
    normalMap: woodN, normalScale: new THREE.Vector2(0.3, 0.3),
  }),
  toriiBlack: new THREE.MeshStandardMaterial({
    color: 0x18191c, roughness: 0.45, metalness: 0.15,
  }),
  // Metalness stays at 0 on every dielectric here: a non-zero value on stone,
  // timber or tarmac only steals from the diffuse and leaves the surface
  // looking muddy.
  templeWood: new THREE.MeshStandardMaterial({
    color: 0x8a6242, roughness: 0.68, metalness: 0.0,
    map: woodDiff, normalMap: woodN, roughnessMap: woodR,
    normalScale: new THREE.Vector2(0.9, 0.9),
  }),
  templeWoodLight: new THREE.MeshStandardMaterial({
    color: 0xc09068, roughness: 0.58, metalness: 0.0,
    map: woodDiff, normalMap: woodN, roughnessMap: woodR,
    normalScale: new THREE.Vector2(0.9, 0.9),
  }),
  shingleDark: new THREE.MeshStandardMaterial({
    color: 0x4c565f, roughness: 0.78, metalness: 0.0,
    map: shingleDiff, normalMap: shingleN, normalScale: new THREE.Vector2(1.4, 1.4),
  }),
  shingleRed: new THREE.MeshStandardMaterial({
    color: 0xb03c2c, roughness: 0.7, metalness: 0.0,
    map: shingleRedDiff, normalMap: shingleRedN, normalScale: new THREE.Vector2(1.2, 1.2),
  }),
  stonePaver: new THREE.MeshStandardMaterial({
    color: 0xb2b7bb, roughness: 0.87, metalness: 0.0,
    map: paverDiff, normalMap: paverN, roughnessMap: paverR,
    normalScale: new THREE.Vector2(1.2, 1.2),
  }),
  stoneLantern: new THREE.MeshStandardMaterial({
    color: 0x9aa0a4, roughness: 0.9, metalness: 0.0,
    map: paverDiff, normalMap: paverN, normalScale: new THREE.Vector2(1.1, 1.1),
  }),
  zenGravel: new THREE.MeshStandardMaterial({
    color: 0xf0eee7, roughness: 0.96, metalness: 0.02,
    map: gravelT, normalMap: gravelN, normalScale: new THREE.Vector2(1.4, 1.4),
  }),
  mossGrass: new THREE.MeshStandardMaterial({
    color: 0x5d8047, roughness: 0.94, metalness: 0.0,
    map: grassDiff,
  }),
  water: new THREE.MeshPhysicalMaterial({
    color: 0x234a42, roughness: 0.08, metalness: 0.0,
    transmission: 0.75, ior: 1.333, thickness: 1.8,
    transparent: true, opacity: 0.88,
    normalMap: waterN, normalScale: new THREE.Vector2(0.4, 0.4),
  }),
  bridgeRed: new THREE.MeshPhysicalMaterial({
    color: 0xcf3324, roughness: 0.4, metalness: 0.0,
    clearcoat: 0.8, clearcoatRoughness: 0.2,
    normalMap: woodN, normalScale: new THREE.Vector2(0.35, 0.35),
  }),
  goldGiboshi: new THREE.MeshStandardMaterial({
    color: 0xe6b840, roughness: 0.22, metalness: 0.88,
  }),
  brassBell: new THREE.MeshStandardMaterial({
    color: 0xd4a034, roughness: 0.26, metalness: 0.82,
  }),
  shojiPaper: new THREE.MeshStandardMaterial({
    color: 0xf6f3ea, roughness: 0.92, metalness: 0.0,
    map: washiT, normalMap: washiN, normalScale: new THREE.Vector2(0.5, 0.5),
  }),
  shimenawa: new THREE.MeshStandardMaterial({
    color: 0xb59e6f, roughness: 0.95, metalness: 0.0,
    map: ropeT, normalMap: ropeN, normalScale: new THREE.Vector2(1.1, 1.1),
  }),
  shideWhite: new THREE.MeshStandardMaterial({
    color: 0xffffff, roughness: 0.85, metalness: 0.0,
    side: THREE.DoubleSide,
  }),
  lanternGlow: new THREE.MeshStandardMaterial({
    color: 0xfff3d0, emissive: 0xffaa44, emissiveIntensity: 2.4, roughness: 0.4,
  }),
  // The chandelier's own glass. lanternGlow is pitched for chōchin read from
  // across the precinct, and at its night value of 5.8 a hoop of them four
  // metres over your head sits so far above the bloom threshold that the whole
  // vault washes white. Same warmth, a third of the drive.
  chandelierGlow: new THREE.MeshStandardMaterial({
    color: 0xfff6df, emissive: 0xffb45c, emissiveIntensity: 0.9, roughness: 0.36,
  }),
  candleWax: new THREE.MeshStandardMaterial({
    color: 0xfaf6ea, roughness: 0.35, metalness: 0.05,
    emissive: 0x000000, emissiveIntensity: 0,
  }),
  candleFlame: new THREE.MeshBasicMaterial({
    color: 0xfffaaa,
  }),
  chochinPaper: new THREE.MeshStandardMaterial({
    color: 0xfff5e6, emissive: 0xff8822, emissiveIntensity: 2.8,
    roughness: 0.85, metalness: 0.0,
  }),
  chochinRed: new THREE.MeshStandardMaterial({
    color: 0xbb2015, emissive: 0x550a00, emissiveIntensity: 0.8,
    roughness: 0.6, metalness: 0.1,
  }),
  skyLanternPaper: new THREE.MeshStandardMaterial({
    color: 0xfffaea, emissive: 0xff8818, emissiveIntensity: 3.8,
    roughness: 0.75, metalness: 0.0, transparent: true, opacity: 0.94,
    side: THREE.DoubleSide,
  }),
  waterLanternWood: new THREE.MeshStandardMaterial({
    color: 0x4a2e1e, roughness: 0.8, metalness: 0.05,
  }),
  sakuraBlossom: foliageMats(sakuraLeafTs, { alphaTest: 0.4, roughness: 0.76 }),
  sakuraBlossomWhite: foliageMats(sakuraWhiteLeafTs, { alphaTest: 0.4, roughness: 0.76 }),
  pineFoliage: foliageMats(pineLeafTs, { alphaTest: 0.4, roughness: 0.84 }),
  momijiRed: foliageMats(momijiLeafTs, { alphaTest: 0.4, roughness: 0.78 }),
  bambooGreen: new THREE.MeshStandardMaterial({
    color: 0xdfe6cf, roughness: 0.42, metalness: 0.05,
    map: bambooSkinT, normalMap: bambooSkinN, normalScale: new THREE.Vector2(0.7, 0.7),
  }),
  bambooLeaf: new THREE.MeshStandardMaterial({
    color: 0xffffff, roughness: 0.88, metalness: 0.0,
    map: bambooLeafT, alphaTest: 0.34, alphaToCoverage: true,
    side: THREE.DoubleSide,
  }),
  treeTrunk: new THREE.MeshStandardMaterial({
    color: 0xd8c8b8, roughness: 0.82, metalness: 0.02,
    map: barkDiff, normalMap: barkN,
    normalScale: new THREE.Vector2(1.2, 1.2),
  }),
  asphalt: new THREE.MeshStandardMaterial({
    color: 0x646a72, roughness: 0.92, metalness: 0.0,
    map: asphaltA, normalMap: asphaltN,
  }),
  parkingLine: new THREE.MeshStandardMaterial({
    color: 0xffffff, roughness: 0.7, metalness: 0.05,
  }),
  pondBed: new THREE.MeshStandardMaterial({
    color: 0x4a4437, roughness: 0.96, metalness: 0.02,
    map: dirtDiff, normalMap: dirtN,
  }),
  checkerPlaza: new THREE.MeshStandardMaterial({
    color: 0xffffff, roughness: 0.22, metalness: 0.06,
    map: checkerT, normalMap: checkerN, normalScale: new THREE.Vector2(0.8, 0.8),
  }),
  palaceWhite: new THREE.MeshStandardMaterial({
    color: 0xfbf9f4, roughness: 0.38, metalness: 0.02,
  }),
  palaceGold: new THREE.MeshStandardMaterial({
    color: 0xf2c238, roughness: 0.22, metalness: 0.88,
  }),
  palaceGoldFloor: new THREE.MeshStandardMaterial({
    color: 0xffffff, roughness: 0.32, metalness: 0.5,
    map: goldMarbleT, normalMap: goldMarbleN, normalScale: new THREE.Vector2(0.6, 0.6),
  }),
  // Palace door leaves: keyaki lacquered near-black-brown, so the gold studs
  // and the pull rings are what the eye lands on rather than the timber.
  palaceDoorWood: new THREE.MeshPhysicalMaterial({
    color: 0x54291a, roughness: 0.38, metalness: 0.0,
    clearcoat: 0.72, clearcoatRoughness: 0.24,
    map: woodDiff, normalMap: woodN, normalScale: new THREE.Vector2(0.8, 0.8),
  }),
  // Round-window glazing. Emissive rather than transmissive: a transmission
  // pass for eight portholes costs a whole extra render target, and what the
  // panes have to do is read as lit from the side you are not on.
  palaceGlass: new THREE.MeshStandardMaterial({
    color: 0xfff6e4, roughness: 0.16, metalness: 0.0,
    emissive: 0xffd08c, emissiveIntensity: 0.5,
    transparent: true, opacity: 0.52, side: THREE.DoubleSide,
  }),
  // Ceiling shells hung inside the domes. A hemisphere's normals face outward,
  // so from under one you were looking straight through it at the sky — these
  // are the same shell flipped, and they turn the vault into a night sky.
  palaceVault: new THREE.MeshStandardMaterial({
    color: 0xffffff, roughness: 0.88, metalness: 0.06,
    emissive: 0x1a2350, emissiveIntensity: 0.5,
    map: vaultT, side: THREE.BackSide,
  }),
  palaceVaultSmall: new THREE.MeshStandardMaterial({
    color: 0xffffff, roughness: 0.88, metalness: 0.06,
    emissive: 0x1a2350, emissiveIntensity: 0.5,
    map: vaultSmallT, side: THREE.BackSide,
  }),
  carpetRound: new THREE.MeshStandardMaterial({
    color: 0xffffff, roughness: 0.94, metalness: 0.02,
    map: rugRoundT, normalMap: rugRoundN, normalScale: new THREE.Vector2(0.45, 0.45),
  }),
  carpetPanel: new THREE.MeshStandardMaterial({
    color: 0xffffff, roughness: 0.94, metalness: 0.02,
    map: rugPanelT, normalMap: rugPanelN, normalScale: new THREE.Vector2(0.45, 0.45),
  }),
  towerIvory: new THREE.MeshStandardMaterial({
    color: 0xf6f0e6, roughness: 0.52, metalness: 0.04,
    map: woodDiff, normalMap: woodN, normalScale: new THREE.Vector2(0.6, 0.6),
  }),
  cloudFluff: new THREE.MeshStandardMaterial({
    color: 0xffffff, roughness: 0.95, metalness: 0.0,
    transparent: true, opacity: 0.70, depthWrite: false,
    side: THREE.DoubleSide,
  }),
};

// ---------------------------------------------------------------------------
// World-scaled UVs
//
// Every prop in the precinct shares one unit cube (or unit cylinder) and is
// stretched to size by its instance matrix — so the 130 m sando slab and a 1 m
// lantern base were handed the same 0..1 UV span, and the stone texture smeared
// into metre-long "planks". Rebuild the UVs in the vertex shader from the
// instance's own dimensions, read straight off instanceMatrix so no extra
// attribute is needed, at a density given in texture tiles per metre.
//
// The unit cube's faces are axis-aligned, so choosing the projection plane from
// the vertex normal is exact rather than approximate, and it costs one texture
// sample — unlike triplanar blending, which would cost three.
// ---------------------------------------------------------------------------
function worldUV(mat, tilesPerMetre) {
  const d = tilesPerMetre.toFixed(4);
  mat.onBeforeCompile = shader => {
    shader.vertexShader = shader.vertexShader.replace(
      '#include <uv_vertex>',
      `#include <uv_vertex>
      vec3 wsz = vec3( 1.0 );
      #ifdef USE_INSTANCING
        wsz = vec3( length( instanceMatrix[ 0 ].xyz ),
                    length( instanceMatrix[ 1 ].xyz ),
                    length( instanceMatrix[ 2 ].xyz ) );
      #endif
      vec3 an = abs( normal );
      vec2 span = ( an.y > an.x && an.y > an.z ) ? wsz.xz
                : ( an.x > an.z ) ? wsz.zy
                : wsz.xy;
      // On a cylinder's flank u wraps the circumference, not the diameter.
      span.x *= mix( 1.0, 3.14159, step( 0.03, min( an.x, an.z ) ) );
      vec2 wUv = uv * span * ${d};
      #ifdef USE_MAP
        vMapUv = ( mapTransform * vec3( wUv, 1 ) ).xy;
      #endif
      #ifdef USE_NORMALMAP
        vNormalMapUv = ( normalMapTransform * vec3( wUv, 1 ) ).xy;
      #endif
      #ifdef USE_ROUGHNESSMAP
        vRoughnessMapUv = ( roughnessMapTransform * vec3( wUv, 1 ) ).xy;
      #endif
      #ifdef USE_METALNESSMAP
        vMetalnessMapUv = ( metalnessMapTransform * vec3( wUv, 1 ) ).xy;
      #endif
      #ifdef USE_EMISSIVEMAP
        vEmissiveMapUv = ( emissiveMapTransform * vec3( wUv, 1 ) ).xy;
      #endif`
    );
  };
  // The density is baked into the source, so variants must not share a program.
  mat.customProgramCacheKey = () => `worldUV${d}`;
  return mat;
}

// Densities read off the source images: cobbles ≈ 35 cm, wood planks ≈ 18 cm,
// shingle courses ≈ 12 cm, bark ≈ 1.5 m per tile.
worldUV(M.stonePaver, 0.29);
worldUV(M.stoneLantern, 0.55);
worldUV(M.templeWood, 0.42);
worldUV(M.templeWoodLight, 0.42);
worldUV(M.toriiRed, 0.34);
worldUV(M.bridgeRed, 0.4);
worldUV(M.shingleDark, 0.3);
worldUV(M.shingleRed, 0.3);
worldUV(M.zenGravel, 0.55);
worldUV(M.treeTrunk, 0.65);
worldUV(M.checkerPlaza, 0.125);
worldUV(M.palaceGoldFloor, 0.25);
worldUV(M.palaceDoorWood, 0.42);
// M.carpetRound / M.carpetPanel are deliberately left out: a rug is a single
// composition, and worldUV would tile it into wallpaper.
worldUV(M.towerIvory, 0.32);
// One node ring per tile, so the culms joint roughly every 40 cm.
worldUV(M.bambooGreen, 2.4);

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
        if (it.qw !== undefined) q.set(it.qx, it.qy, it.qz, it.qw);
        else {
          e.set(it.rx || 0, it.ry || 0, it.rz || 0, 'YXZ');
          q.setFromEuler(e);
        }
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
// A canopy built on a plain sphere reads as a balloon however well it is
// textured. Pushing the shell out along a handful of random lobes gives each
// crown a lopsided silhouette while keeping it a single cheap instance.
function makeCanopyGeometry(seed) {
  const geo = new THREE.SphereGeometry(0.5, 20, 14);
  const pos = geo.attributes.position;
  const rnd = mulberry32(seed);
  const lobes = [];
  for (let i = 0; i < 8; i++) {
    lobes.push({
      dir: new THREE.Vector3(rnd() * 2 - 1, rnd() * 2 - 1, rnd() * 2 - 1).normalize(),
      amp: 0.1 + rnd() * 0.2,
    });
  }
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const n = v.clone().normalize();
    let d = 0.9;
    for (const l of lobes) {
      const k = Math.max(0, n.dot(l.dir));
      d += l.amp * k * k;
    }
    v.multiplyScalar(d);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

const G = {
  box: new THREE.BoxGeometry(1, 1, 1),
  cyl: new THREE.CylinderGeometry(0.5, 0.5, 1, 16),
  cyl8: new THREE.CylinderGeometry(0.5, 0.5, 1, 8),
  taperCyl: new THREE.CylinderGeometry(0.38, 0.5, 1, 12),
  sphere: new THREE.SphereGeometry(0.5, 16, 12),
  cone: new THREE.ConeGeometry(0.5, 1, 16),
  dome: new THREE.SphereGeometry(0.5, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.5),
  invDome: new THREE.SphereGeometry(0.5, 24, 16, 0, Math.PI * 2, Math.PI * 0.5, Math.PI * 0.5),
  canopy: [makeCanopyGeometry(101), makeCanopyGeometry(202), makeCanopyGeometry(303)],
  card: new THREE.PlaneGeometry(1, 1),
  // Axis is +Z, so a ring lies flat in the XY plane: yaw alone aims it at a wall.
  // A torus scales its tube along with its radius, so window frames and pull
  // rings take `ring` while the metre-scale chandelier hoops take `hoop` —
  // ring's 0.15 tube ratio would put a half-metre doughnut on a 3 m circle.
  ring: new THREE.TorusGeometry(0.5, 0.075, 8, 28),
  hoop: new THREE.TorusGeometry(0.5, 0.018, 7, 44),
  // The 16-sided G.cyl reads as a polygon once a disc is several metres across,
  // which a rug is. Cap UVs stay a disc inscribed in 0..1 at any segment count,
  // so the medallion still lands centred.
  disc: new THREE.CylinderGeometry(0.5, 0.5, 1, 48),
};

// A wall with a porthole cut clean through it. Boxes cannot do this — four
// boxes around a square gap leave the corners open behind a round frame — so
// the panel is an extruded shape carrying a circular hole, built once at each
// size the palace needs and then instanced like any other piece.
function piercedWall(w, h, holeR, holeY = 0, t = 0.4) {
  const s = new THREE.Shape();
  s.moveTo(-w / 2, -h / 2);
  s.lineTo(w / 2, -h / 2);
  s.lineTo(w / 2, h / 2);
  s.lineTo(-w / 2, h / 2);
  s.closePath();
  const hole = new THREE.Path();
  hole.absarc(0, holeY, holeR, 0, Math.PI * 2, true);
  s.holes.push(hole);
  const geo = new THREE.ExtrudeGeometry(s, { depth: t, bevelEnabled: false, curveSegments: 20 });
  // Extrusion runs 0..t along +Z; centre it so the panel straddles its own wall line.
  geo.translate(0, 0, -t / 2);
  return geo;
}
let canopyPick = 0;
const nextCanopy = () => G.canopy[canopyPick++ % G.canopy.length];

// Leaf cards live in `scenery`, not `world`, so they never become collision
// AABBs. Crossed planes break the cloth shading a closed canopy sphere has.
const foliageCards = [];
function puffFoliage(mats, cx, cy, cz, rx, ry, rz, {
  seed = 1, count = 9, flatten = 0, cardScale = 0.55, pair = true,
} = {}) {
  const rnd = mulberry32(seed >>> 0);
  // Each card draws its own sheet and its own mirroring, so two neighbours never
  // show the same stamp in the same orientation.
  const pickMat = () => Array.isArray(mats) ? mats[(rnd() * mats.length) | 0] : mats;
  for (let i = 0; i < count; i++) {
    let dx, dy, dz, len;
    do {
      dx = rnd() * 2 - 1;
      dy = rnd() * 2 - 1;
      dz = rnd() * 2 - 1;
      len = Math.hypot(dx, dy, dz);
    } while (len < 0.12 || len > 1);
    dx = (dx / len) * rx * (0.12 + rnd() * 0.78);
    dy = (dy / len) * ry * (0.12 + rnd() * 0.78) * (1 - flatten * 0.82);
    dz = (dz / len) * rz * (0.12 + rnd() * 0.78);
    const yaw = Math.atan2(dx, dz) + (rnd() - 0.5) * 0.85;
    const pitch = flatten > 0.45
      ? -1.12 + (rnd() - 0.5) * 0.4
      : (rnd() - 0.5) * 0.95;
    const roll = (rnd() - 0.5) * 0.4;
    const cs = cardScale * (0.72 + rnd() * 0.5);
    const sx = Math.max(rx, rz) * cs;
    const sy = Math.max(ry, Math.max(rx, rz) * 0.7) * cs;
    const push = extraYaw => foliageCards.push({
      mat: pickMat(), x: cx + dx, y: cy + dy, z: cz + dz,
      sx: rnd() < 0.5 ? -sx : sx, sy, rx: pitch, ry: yaw + extraYaw, rz: roll,
    });
    push(0);
    if (pair) push(Math.PI / 2);
  }
}

function flushFoliageCards() {
  const byMat = new Map();
  for (const it of foliageCards) {
    (byMat.get(it.mat) ?? byMat.set(it.mat, []).get(it.mat)).push(it);
  }
  const m = new THREE.Matrix4(), q = new THREE.Quaternion();
  const e = new THREE.Euler(), s = new THREE.Vector3(), p = new THREE.Vector3();
  for (const [mat, items] of byMat) {
    const im = new THREE.InstancedMesh(G.card, mat, items.length);
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      p.set(it.x, it.y, it.z);
      e.set(it.rx || 0, it.ry || 0, it.rz || 0, 'YXZ');
      q.setFromEuler(e);
      s.set(it.sx, it.sy, 1);
      m.compose(p, q, s);
      im.setMatrixAt(i, m);
    }
    im.castShadow = true;
    im.receiveShadow = true;
    im.frustumCulled = false;
    im.instanceMatrix.needsUpdate = true;
    scenery.add(im);
  }
}

function seedAt(x, z, k = 0) {
  return (Math.abs(x * 173.1 + z * 97.7 + k * 31.3) * 1000 | 0) >>> 0;
}

function box(mat, x, y, z, sx, sy, sz, ry = 0, rx = 0, rz = 0, prop = false) {
  emit(G.box, mat, x, y, z, sx, sy, sz, rx, ry, rz, prop);
}
function cylinder(mat, x, y, z, radius, height, ry = 0, rx = 0, rz = 0, prop = false) {
  emit(G.cyl, mat, x, y, z, radius * 2, height, radius * 2, rx, ry, rz, prop);
}

const _branchDir = new THREE.Vector3();
const _branchUp = new THREE.Vector3(0, 1, 0);
const _branchQuat = new THREE.Quaternion();

function branch(mat, x1, y1, z1, x2, y2, z2, r1, r2, isProp = true) {
  const dx = x2 - x1, dy = y2 - y1, dz = z2 - z1;
  let len = Math.hypot(dx, dy, dz);
  if (len < 0.001) return;
  // A swapped axis (y used as z) turns a 1 m twig into a 50 m pole across
  // the precinct. Drop anything that long — real boughs stay under ~8 m.
  if (len > 8) return;
  const mx = (x1 + x2) * 0.5;
  const my = (y1 + y2) * 0.5;
  const mz = (z1 + z2) * 0.5;

  _branchDir.set(dx / len, dy / len, dz / len);
  _branchQuat.setFromUnitVectors(_branchUp, _branchDir);

  const d = r1 * 2;
  emit(G.taperCyl, mat, mx, my, mz, d, len, d, 0, 0, 0, isProp);
  const items = kits.get(mat).get(G.taperCyl).items;
  const last = items[items.length - 1];
  last.qx = _branchQuat.x;
  last.qy = _branchQuat.y;
  last.qz = _branchQuat.z;
  last.qw = _branchQuat.w;
}

function treeRootFlairs(mat, x, y, z, S, count = 5) {
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + 0.35;
    const rStart = 0.38 * S;
    const rEnd = 0.75 * S;
    const x1 = x + Math.cos(a) * rStart;
    const z1 = z + Math.sin(a) * rStart;
    const y1 = y + 0.55 * S;
    const x2 = x + Math.cos(a) * rEnd;
    const z2 = z + Math.sin(a) * rEnd;
    const y2 = y + 0.05 * S;
    branch(mat, x1, y1, z1, x2, y2, z2, 0.20 * S, 0.08 * S, true);
  }
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
const stoneLanternSpots = [];
function buildStoneLantern(x, y, z, scale = 1, ry = 0) {
  const S = scale;
  stoneLanternSpots.push({ x, y, z, scale: S, ry });
  // Stepped stone base (Kiso)
  box(M.stoneLantern, x, y + 0.12 * S, z, 1.0 * S, 0.24 * S, 1.0 * S, ry, 0, 0, true);
  box(M.stoneLantern, x, y + 0.32 * S, z, 0.8 * S, 0.20 * S, 0.8 * S, ry, 0, 0, true);
  // Column shaft (Sao)
  cylinder(M.stoneLantern, x, y + 1.05 * S, z, 0.24 * S, 1.3 * S, ry, 0, 0, true);
  // Middle platform (Chūdai) — candle sits on this
  box(M.stoneLantern, x, y + 1.8 * S, z, 0.95 * S, 0.22 * S, 0.95 * S, ry, 0, 0, true);
  // Light chamber (Hibukuro): corner posts + lintel, four faces open so the candle shows
  const hw = 0.30 * S;
  for (const dx of [-hw, hw]) {
    for (const dz of [-hw, hw]) {
      box(M.stoneLantern, x + dx, y + 2.22 * S, z + dz, 0.13 * S, 0.65 * S, 0.13 * S, ry, 0, 0, true);
    }
  }
  box(M.stoneLantern, x, y + 2.51 * S, z, 0.74 * S, 0.08 * S, 0.74 * S, ry, 0, 0, true);
  // Roof cap (Kasa) with flared corners
  box(M.stoneLantern, x, y + 2.67 * S, z, 1.2 * S, 0.28 * S, 1.2 * S, ry, 0, 0, true);
  box(M.stoneLantern, x, y + 2.87 * S, z, 0.8 * S, 0.16 * S, 0.8 * S, ry, 0, 0, true);
  // Jewel finial (Hōju)
  cylinder(M.stoneLantern, x, y + 3.09 * S, z, 0.16 * S, 0.32 * S, ry, 0, 0, true);
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
// Sacred axis layout (sando · pond · taiko-bashi)
// Shared by builders and groundFn so the walkable surface cannot drift.
// ---------------------------------------------------------------------------
const SANDO_X = 0;
const SANDO_W = 5.2;
const SANDO_Y = 0.12;
const SANDO_H = 0.22;
const SANDO_TOP = SANDO_Y + SANDO_H / 2;
const SANDO_AXIS_Z0 = -30;
const SANDO_AXIS_Z1 = 110;

// Zen garden — shared by the builder and groundFn so the raked bed stays
// walkable at the same height it is drawn.
const ZEN_X = 28;
const ZEN_Y = 0.15;
const ZEN_Z = 78;
const ZEN_W = 22;
const ZEN_D = 16;
const ZEN_SAND_H = 0.2;
const ZEN_SAND_Y = ZEN_Y + 0.1;
const ZEN_SAND_TOP = ZEN_SAND_Y + ZEN_SAND_H / 2;
const ZEN_SAND_HALF_W = (ZEN_W - 0.4) / 2;
const ZEN_SAND_HALF_D = (ZEN_D - 0.4) / 2;
const ZEN_DECK_Z = ZEN_Z + ZEN_D / 2 + 1.8;
const ZEN_DECK_TOP = ZEN_Y + 0.45 + 0.15;

const POND_Z = 32;
const POND_W = 36;
const POND_D = 26;
const POND_WATER_Y = 0.48;
const POND_Z0 = POND_Z - POND_D / 2;
const POND_Z1 = POND_Z + POND_D / 2;

const BRIDGE_X = 0;
const BRIDGE_Y = 0.45;
const BRIDGE_Z = 32;
const BRIDGE_SPAN = 16;
const BRIDGE_W = 3.8;
const BRIDGE_ARCH_H = 2.4;
const BRIDGE_Z0 = BRIDGE_Z - BRIDGE_SPAN / 2;
const BRIDGE_Z1 = BRIDGE_Z + BRIDGE_SPAN / 2;
const DECK_TOP = BRIDGE_Y + 0.09;

const LANDING_W = 5.6;
const LANDING_D = 2.7;
const STEP_D = 0.68;
const STEP0_TOP = SANDO_TOP + (DECK_TOP - SANDO_TOP) * 0.5;
const STEP1_TOP = DECK_TOP;

// South bank (parking side) then north bank (haiden), mirrored on POND_Z.
const SOUTH_STEP0_Z = 16.58;
const SOUTH_STEP1_Z = 17.26;
const SOUTH_LAND_Z = 18.85;
const SOUTH_WOOD_Z0 = 19.85;
const SANDO_SOUTH_Z1 = SOUTH_STEP0_Z - STEP_D / 2;

const NORTH_WOOD_Z1 = 44.15;
const NORTH_LAND_Z = 45.15;
const NORTH_STEP1_Z = 46.74;
const NORTH_STEP0_Z = 47.42;
const SANDO_NORTH_Z0 = NORTH_STEP0_Z + STEP_D / 2;

// Cosine drum: flat derivative at the arch ends, so the timber approaches meet it.
function crossingDeckY(z) {
  if (z < BRIDGE_Z0 || z > BRIDGE_Z1) return BRIDGE_Y;
  const t = ((z - BRIDGE_Z0) / BRIDGE_SPAN - 0.5) * 2;
  return BRIDGE_Y + BRIDGE_ARCH_H * 0.5 * (1 + Math.cos(Math.PI * t));
}
function crossingPitch(z) {
  if (z <= BRIDGE_Z0 || z >= BRIDGE_Z1) return 0;
  const t = ((z - BRIDGE_Z0) / BRIDGE_SPAN - 0.5) * 2;
  const dydz = -(BRIDGE_ARCH_H * Math.PI / BRIDGE_SPAN) * Math.sin(Math.PI * t);
  return Math.atan(dydz);
}
function crossingTop(z) {
  return crossingDeckY(z) + 0.09;
}

// ---------------------------------------------------------------------------
// 4. Arched Red Wooden Bridge (Taiko-bashi 太鼓橋)
// ---------------------------------------------------------------------------
function bridgeRails(x, py, pz, width, plankD, pitch, withGiboshi) {
  const leftX = x - width / 2 + 0.12;
  const rightX = x + width / 2 - 0.12;
  box(M.bridgeRed, leftX, py + 0.5, pz, 0.12, 0.85, 0.12, 0, pitch, 0, true);
  box(M.bridgeRed, rightX, py + 0.5, pz, 0.12, 0.85, 0.12, 0, pitch, 0, true);
  box(M.bridgeRed, leftX, py + 0.95, pz, 0.16, 0.12, plankD, 0, pitch, 0, true);
  box(M.bridgeRed, rightX, py + 0.95, pz, 0.16, 0.12, plankD, 0, pitch, 0, true);
  if (withGiboshi) {
    cylinder(M.goldGiboshi, leftX, py + 1.12, pz, 0.14, 0.22, 0, 0, 0, true);
    cylinder(M.goldGiboshi, rightX, py + 1.12, pz, 0.14, 0.22, 0, 0, 0, true);
  }
}

function buildStonePier(x, landZ, waterDir) {
  box(M.stoneLantern, x, 0.14, landZ, LANDING_W + 0.55, 0.62, LANDING_D + 0.28, 0, 0, 0, false);
  box(M.stonePaver, x, BRIDGE_Y, landZ, LANDING_W, 0.18, LANDING_D, 0, 0, 0, false);

  const cheekX = LANDING_W / 2 - 0.14;
  const cheekY = DECK_TOP + 0.26;
  box(M.stoneLantern, x - cheekX, cheekY, landZ, 0.28, 0.52, LANDING_D - 0.2, 0, 0, 0, true);
  box(M.stoneLantern, x + cheekX, cheekY, landZ, 0.28, 0.52, LANDING_D - 0.2, 0, 0, 0, true);

  // Short returns on the outer shoulders only — keep the sando width clear.
  const mouth = SANDO_W / 2 + 0.15;
  const capW = Math.max(0.2, cheekX - mouth);
  const capZ = landZ + waterDir * (LANDING_D / 2 - 0.12);
  const capY = DECK_TOP + 0.22;
  box(M.stoneLantern, x - (mouth + capW / 2), capY, capZ, capW, 0.44, 0.24, 0, 0, 0, true);
  box(M.stoneLantern, x + (mouth + capW / 2), capY, capZ, capW, 0.44, 0.24, 0, 0, 0, true);
  cylinder(M.goldGiboshi, x - cheekX, DECK_TOP + 0.58, capZ, 0.11, 0.18, 0, 0, 0, true);
  cylinder(M.goldGiboshi, x + cheekX, DECK_TOP + 0.58, capZ, 0.11, 0.18, 0, 0, 0, true);
}

function buildApproachSteps(x, step0Z, step1Z) {
  box(M.stonePaver, x, STEP0_TOP - 0.08, step0Z, SANDO_W, 0.16, STEP_D, 0, 0, 0, false);
  box(M.stonePaver, x, STEP1_TOP - 0.08, step1Z, SANDO_W + 0.14, 0.16, STEP_D, 0, 0, 0, false);
}

function buildTaikoBashi(x, y, z, span = 14, width = 3.6) {
  const woodZ0 = SOUTH_WOOD_Z0;
  const woodZ1 = NORTH_WOOD_Z1;
  const woodLen = woodZ1 - woodZ0;
  const n = 28;
  const plankD = woodLen / n + 0.08;

  const railZ0 = SOUTH_LAND_Z + LANDING_D / 2 + 0.25;
  const railZ1 = NORTH_LAND_Z - LANDING_D / 2 - 0.25;
  for (let i = 0; i <= n; i++) {
    const pz = woodZ0 + (i / n) * woodLen;
    const py = crossingDeckY(pz);
    const pitch = crossingPitch(pz);
    box(M.templeWood, x, py, pz, width, 0.18, plankD, 0, pitch, 0, false);
    if (pz > railZ0 && pz < railZ1) {
      bridgeRails(x, py, pz, width, plankD, pitch, i % 4 === 0);
    }
  }

  // Stone piers sit in the pond banks and receive the timber deck.
  buildStonePier(x, SOUTH_LAND_Z, +1);
  buildStonePier(x, NORTH_LAND_Z, -1);
  buildApproachSteps(x, SOUTH_STEP0_Z, SOUTH_STEP1_Z);
  buildApproachSteps(x, NORTH_STEP0_Z, NORTH_STEP1_Z);
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

  // Hanging Japanese Chōchin lanterns under the Haiden front eaves
  for (let i = -3.5; i <= 3.5; i += 1.0) {
    const cx = x + i * 1.8;
    const cy = y + 1.4 + H - 0.2;
    const cz = z - D / 2 - 0.25;
    cylinder(M.templeWood, cx, cy + 0.35, cz, 0.015, 0.7, 0, 0, 0, true);
    cylinder(M.chochinRed, cx, cy + 0.18, cz, 0.26, 0.08, 0, 0, 0, true);
    cylinder(M.chochinPaper, cx, cy - 0.15, cz, 0.28, 0.62, 0, 0, 0, true);
    cylinder(M.chochinRed, cx, cy - 0.48, cz, 0.26, 0.08, 0, 0, 0, true);
  }

  // Altar Candlesticks (Shokudai & Warisōsoku) flanking the Saisen-bako offering box
  for (const ox of [-1.8, -0.9, 0.9, 1.8]) {
    const cy = y + 1.45;
    const cz = z - D / 2 + 0.8;
    // Brass candlestick stand
    cylinder(M.brassBell, x + ox, cy + 0.15, cz, 0.08, 0.3, 0, 0, 0, true);
    cylinder(M.goldGiboshi, x + ox, cy + 0.32, cz, 0.14, 0.05, 0, 0, 0, true);
    // White wax candle
    cylinder(M.candleWax, x + ox, cy + 0.58, cz, 0.04, 0.48, 0, 0, 0, true);
    // Candle flame
    cylinder(M.candleFlame, x + ox, cy + 0.88, cz, 0.025, 0.14, 0, 0, 0, false);
  }

  // Altar prayer kneeling spot: "S'agenouiller et se relever le jour" / "S'agenouiller et se relever la nuit"
  furnitureInteractions.push({
    type: 'kneel',
    labelDay: "S'agenouiller et se relever le jour",
    labelNight: "S'agenouiller et se relever la nuit",
    label: "S'agenouiller devant l'autel",
    x: x, y: y + 0.15, z: z - D / 2 - 3.4,
    centerX: x, centerZ: z - D / 2 - 3.4,
    approachY: y + 0.15,
    yaw: 0, // facing north towards the altar
    halfWidth: 3.0, halfDepth: 1.8,
    triggerDistance: 2.2,
    occupied: false,
  });

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
  // Low dark cedar frame — visual coping only. A kit prop here is a 22 m
  // wall: resolveWalls has no "standing above" test, so the lawn around the
  // bed would shove you back (same trap as the pond bed).
  box(M.templeWood, x, y + 0.2, z - depth / 2, width + 0.4, 0.4, 0.4, 0, 0, 0, false);
  box(M.templeWood, x, y + 0.2, z + depth / 2, width + 0.4, 0.4, 0.4, 0, 0, 0, false);
  box(M.templeWood, x - width / 2, y + 0.2, z, 0.4, 0.4, depth + 0.4, 0, 0, 0, false);
  box(M.templeWood, x + width / 2, y + 0.2, z, 0.4, 0.4, depth + 0.4, 0, 0, 0, false);

  // Raked white sand bed — walkable park floor, not a prop wall.
  box(M.zenGravel, x, y + 0.1, z, width - 0.4, 0.2, depth - 0.4, 0, 0, 0, false);

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
  const bMat = M.treeTrunk;

  // Root flares anchoring trunk into the ground
  treeRootFlairs(bMat, x, y, z, S, 5);

  // Main Trunk (multi-segment continuous curved trunk tapering upwards)
  const p0 = [x, y, z];
  const p1 = [x + 0.08 * S, y + 1.2 * S, z - 0.05 * S];
  const p2 = [x - 0.06 * S, y + 2.4 * S, z + 0.07 * S];
  const p3 = [x + 0.03 * S, y + 3.5 * S, z + 0.02 * S];

  branch(bMat, p0[0], p0[1], p0[2], p1[0], p1[1], p1[2], 0.44 * S, 0.36 * S);
  branch(bMat, p1[0], p1[1], p1[2], p2[0], p2[1], p2[2], 0.36 * S, 0.29 * S);
  branch(bMat, p2[0], p2[1], p2[2], p3[0], p3[1], p3[2], 0.29 * S, 0.23 * S);

  // Major Boughs & Sub-branches
  // 1. East/North-East Bough (Sweeping outwards and upwards)
  const b1_1 = [x + 1.2 * S, y + 4.3 * S, z - 0.9 * S];
  const b1_2 = [x + 2.3 * S, y + 4.9 * S, z - 1.6 * S];
  const b1_3 = [x + 1.5 * S, y + 5.5 * S, z - 0.4 * S];
  const b1_4 = [x + 2.8 * S, y + 5.2 * S, z - 2.2 * S];
  branch(bMat, p3[0], p3[1], p3[2], b1_1[0], b1_1[1], b1_1[2], 0.22 * S, 0.16 * S);
  branch(bMat, b1_1[0], b1_1[1], b1_1[2], b1_2[0], b1_2[1], b1_2[2], 0.16 * S, 0.11 * S);
  branch(bMat, b1_1[0], b1_1[1], b1_1[2], b1_3[0], b1_3[1], b1_3[2], 0.14 * S, 0.09 * S);
  branch(bMat, b1_2[0], b1_2[1], b1_2[2], b1_4[0], b1_4[1], b1_4[2], 0.10 * S, 0.06 * S);

  // 2. West/South-West Bough (Sweeping low and wide)
  const b2_1 = [x - 1.3 * S, y + 4.1 * S, z + 0.9 * S];
  const b2_2 = [x - 2.4 * S, y + 4.6 * S, z + 1.5 * S];
  const b2_3 = [x - 1.7 * S, y + 5.2 * S, z + 0.2 * S];
  const b2_4 = [x - 3.0 * S, y + 4.8 * S, z + 1.9 * S];
  branch(bMat, p3[0], p3[1], p3[2], b2_1[0], b2_1[1], b2_1[2], 0.22 * S, 0.16 * S);
  branch(bMat, b2_1[0], b2_1[1], b2_1[2], b2_2[0], b2_2[1], b2_2[2], 0.16 * S, 0.11 * S);
  branch(bMat, b2_1[0], b2_1[1], b2_1[2], b2_3[0], b2_3[1], b2_3[2], 0.14 * S, 0.09 * S);
  branch(bMat, b2_2[0], b2_2[1], b2_2[2], b2_4[0], b2_4[1], b2_4[2], 0.10 * S, 0.06 * S);

  // 3. South-East Bough (Spreading sideways)
  const b3_1 = [x + 1.0 * S, y + 4.2 * S, z + 1.2 * S];
  const b3_2 = [x + 1.9 * S, y + 4.7 * S, z + 2.0 * S];
  const b3_3 = [x + 2.4 * S, y + 5.0 * S, z + 2.6 * S];
  branch(bMat, p3[0], p3[1], p3[2], b3_1[0], b3_1[1], b3_1[2], 0.19 * S, 0.14 * S);
  branch(bMat, b3_1[0], b3_1[1], b3_1[2], b3_2[0], b3_2[1], b3_2[2], 0.14 * S, 0.09 * S);
  branch(bMat, b3_2[0], b3_2[1], b3_2[2], b3_3[0], b3_3[1], b3_3[2], 0.09 * S, 0.06 * S);

  // 4. North-West Bough (Upper reach)
  const b4_1 = [x - 0.9 * S, y + 4.6 * S, z - 1.1 * S];
  const b4_2 = [x - 1.6 * S, y + 5.4 * S, z - 1.7 * S];
  const b4_3 = [x - 2.1 * S, y + 5.8 * S, z - 2.2 * S];
  branch(bMat, p3[0], p3[1], p3[2], b4_1[0], b4_1[1], b4_1[2], 0.18 * S, 0.13 * S);
  branch(bMat, b4_1[0], b4_1[1], b4_1[2], b4_2[0], b4_2[1], b4_2[2], 0.13 * S, 0.08 * S);
  branch(bMat, b4_2[0], b4_2[1], b4_2[2], b4_3[0], b4_3[1], b4_3[2], 0.08 * S, 0.05 * S);

  // 5. Central Crown Apex
  const b5_1 = [x + 0.1 * S, y + 4.8 * S, z + 0.1 * S];
  const b5_2 = [x - 0.2 * S, y + 5.8 * S, z + 0.3 * S];
  const b5_3 = [x + 0.2 * S, y + 6.6 * S, z - 0.1 * S];
  branch(bMat, p3[0], p3[1], p3[2], b5_1[0], b5_1[1], b5_1[2], 0.19 * S, 0.14 * S);
  branch(bMat, b5_1[0], b5_1[1], b5_1[2], b5_2[0], b5_2[1], b5_2[2], 0.14 * S, 0.09 * S);
  branch(bMat, b5_2[0], b5_2[1], b5_2[2], b5_3[0], b5_3[1], b5_3[2], 0.09 * S, 0.05 * S);

  // Blossom Cloud Clusters (Dense, lush, voluminous foliage puffs attached directly to branches)
  const clusters = [
    // Center & Apex
    { dx: 0, dy: 5.0, dz: 0, sx: 4.8, sy: 3.2, sz: 4.8, count: 18, cardScale: 0.72 },
    { dx: 0, dy: 6.3, dz: 0, sx: 4.0, sy: 2.8, sz: 4.0, count: 16, cardScale: 0.70 },
    // East / NE branch clusters
    { dx: 1.8, dy: 4.7, dz: -1.3, sx: 3.8, sy: 2.6, sz: 3.8, count: 16, cardScale: 0.68 },
    { dx: 2.6, dy: 5.1, dz: -1.9, sx: 3.4, sy: 2.4, sz: 3.4, count: 14, cardScale: 0.65 },
    { dx: 1.6, dy: 5.6, dz: -0.4, sx: 3.2, sy: 2.2, sz: 3.2, count: 14, cardScale: 0.65 },
    // West / SW branch clusters
    { dx: -1.8, dy: 4.4, dz: 1.2, sx: 3.8, sy: 2.6, sz: 3.8, count: 16, cardScale: 0.68 },
    { dx: -2.7, dy: 4.7, dz: 1.7, sx: 3.4, sy: 2.4, sz: 3.4, count: 14, cardScale: 0.65 },
    { dx: -1.8, dy: 5.3, dz: 0.2, sx: 3.2, sy: 2.2, sz: 3.2, count: 14, cardScale: 0.65 },
    // South-East
    { dx: 1.6, dy: 4.5, dz: 1.8, sx: 3.6, sy: 2.4, sz: 3.6, count: 15, cardScale: 0.66 },
    { dx: 2.3, dy: 4.9, dz: 2.4, sx: 3.0, sy: 2.2, sz: 3.0, count: 13, cardScale: 0.64 },
    // North-West
    { dx: -1.3, dy: 4.9, dz: -1.4, sx: 3.6, sy: 2.5, sz: 3.6, count: 15, cardScale: 0.66 },
    { dx: -1.9, dy: 5.6, dz: -2.0, sx: 3.0, sy: 2.2, sz: 3.0, count: 13, cardScale: 0.64 },
  ];

  clusters.forEach((c, i) => {
    puffFoliage(mat, x + c.dx * S, y + c.dy * S, z + c.dz * S,
      c.sx * S * 0.5, c.sy * S * 0.5, c.sz * S * 0.5,
      { seed: seedAt(x, z, i + 1), count: c.count, cardScale: c.cardScale });
  });
}

function buildJapanesePine(x, y, z, scale = 1) {
  const S = scale;
  const bMat = M.treeTrunk;

  // Root flares
  treeRootFlairs(bMat, x, y, z, S, 4);

  // Windswept, sinuous trunk
  const p0 = [x, y, z];
  const p1 = [x + 0.25 * S, y + 1.2 * S, z + 0.15 * S];
  const p2 = [x + 0.55 * S, y + 2.4 * S, z + 0.35 * S];
  const p3 = [x + 0.35 * S, y + 3.5 * S, z + 0.20 * S];
  const p4 = [x - 0.10 * S, y + 4.4 * S, z - 0.10 * S];

  branch(bMat, p0[0], p0[1], p0[2], p1[0], p1[1], p1[2], 0.45 * S, 0.38 * S);
  branch(bMat, p1[0], p1[1], p1[2], p2[0], p2[1], p2[2], 0.38 * S, 0.31 * S);
  branch(bMat, p2[0], p2[1], p2[2], p3[0], p3[1], p3[2], 0.31 * S, 0.24 * S);
  branch(bMat, p3[0], p3[1], p3[2], p4[0], p4[1], p4[2], 0.24 * S, 0.17 * S);

  // Lateral boughs supporting horizontal cloud pads (Niwaki style)
  // Low right bough
  const r1 = [x + 1.4 * S, y + 2.8 * S, z + 0.7 * S];
  const r2 = [x + 2.2 * S, y + 3.0 * S, z + 1.0 * S];
  branch(bMat, p2[0], p2[1], p2[2], r1[0], r1[1], r1[2], 0.20 * S, 0.13 * S);
  branch(bMat, r1[0], r1[1], r1[2], r2[0], r2[1], r2[2], 0.13 * S, 0.08 * S);

  // Mid left bough
  const l1 = [x - 0.9 * S, y + 3.7 * S, z - 0.3 * S];
  const l2 = [x - 1.8 * S, y + 3.8 * S, z - 0.6 * S];
  branch(bMat, p3[0], p3[1], p3[2], l1[0], l1[1], l1[2], 0.19 * S, 0.12 * S);
  branch(bMat, l1[0], l1[1], l1[2], l2[0], l2[1], l2[2], 0.12 * S, 0.07 * S);

  // Upper right bough
  const u1 = [x + 1.2 * S, y + 4.3 * S, z + 0.8 * S];
  const u2 = [x + 1.9 * S, y + 4.5 * S, z + 1.1 * S];
  branch(bMat, p4[0], p4[1], p4[2], u1[0], u1[1], u1[2], 0.16 * S, 0.10 * S);
  branch(bMat, u1[0], u1[1], u1[2], u2[0], u2[1], u2[2], 0.10 * S, 0.06 * S);

  // Apex bough
  const t1 = [x - 0.3 * S, y + 5.1 * S, z - 0.1 * S];
  branch(bMat, p4[0], p4[1], p4[2], t1[0], t1[1], t1[2], 0.15 * S, 0.08 * S);

  // Horizontal niwaki pine needle pads
  const pads = [
    { dx: 2.2, dy: 3.1, dz: 1.0, sx: 3.6, sy: 0.9, sz: 3.0 },
    { dx: -1.8, dy: 3.9, dz: -0.6, sx: 3.8, sy: 0.95, sz: 3.2 },
    { dx: 1.9, dy: 4.6, dz: 1.1, sx: 3.4, sy: 0.85, sz: 2.8 },
    { dx: -0.3, dy: 5.3, dz: -0.1, sx: 3.0, sy: 0.9, sz: 2.8 },
  ];
  pads.forEach((p, i) => {
    puffFoliage(M.pineFoliage, x + p.dx * S, y + p.dy * S, z + p.dz * S,
      p.sx * S * 0.5, p.sy * S * 0.5, p.sz * S * 0.5,
      { seed: seedAt(x, z, i + 20), count: 18, flatten: 0.82, cardScale: 0.75 });
  });
}

function buildMomijiMaple(x, y, z, scale = 1) {
  const S = scale;
  const bMat = M.treeTrunk;

  // Root flares
  treeRootFlairs(bMat, x, y, z, S, 4);

  // Delicate curving trunk with graceful arching stems
  const p0 = [x, y, z];
  const p1 = [x + 0.12 * S, y + 1.1 * S, z - 0.08 * S];
  const p2 = [x - 0.05 * S, y + 2.2 * S, z + 0.06 * S];
  const p3 = [x + 0.08 * S, y + 3.1 * S, z - 0.02 * S];

  branch(bMat, p0[0], p0[1], p0[2], p1[0], p1[1], p1[2], 0.32 * S, 0.25 * S);
  branch(bMat, p1[0], p1[1], p1[2], p2[0], p2[1], p2[2], 0.25 * S, 0.20 * S);
  branch(bMat, p2[0], p2[1], p2[2], p3[0], p3[1], p3[2], 0.20 * S, 0.15 * S);

  // Arching branches
  // Branch A
  const a1 = [x - 1.2 * S, y + 3.3 * S, z + 0.7 * S];
  const a2 = [x - 2.0 * S, y + 3.6 * S, z + 1.1 * S];
  branch(bMat, p2[0], p2[1], p2[2], a1[0], a1[1], a1[2], 0.16 * S, 0.10 * S);
  branch(bMat, a1[0], a1[1], a1[2], a2[0], a2[1], a2[2], 0.10 * S, 0.06 * S);

  // Branch B
  const b1 = [x + 1.3 * S, y + 3.5 * S, z - 0.8 * S];
  const b2 = [x + 2.1 * S, y + 3.8 * S, z - 1.2 * S];
  branch(bMat, p3[0], p3[1], p3[2], b1[0], b1[1], b1[2], 0.15 * S, 0.09 * S);
  branch(bMat, b1[0], b1[1], b1[2], b2[0], b2[1], b2[2], 0.09 * S, 0.05 * S);

  // Branch C (Crown)
  const c1 = [x - 0.2 * S, y + 4.1 * S, z + 0.1 * S];
  const c2 = [x + 0.1 * S, y + 4.7 * S, z - 0.1 * S];
  branch(bMat, p3[0], p3[1], p3[2], c1[0], c1[1], c1[2], 0.14 * S, 0.08 * S);
  branch(bMat, c1[0], c1[1], c1[2], c2[0], c2[1], c2[2], 0.08 * S, 0.05 * S);

  // Vibrant foliage clouds
  const clusters = [
    { dx: 0, dy: 4.2, dz: 0, sx: 3.8, sy: 2.4, sz: 3.8, count: 18, cardScale: 0.72 },
    { dx: -1.7, dy: 3.6, dz: 0.9, sx: 3.2, sy: 2.0, sz: 3.2, count: 16, cardScale: 0.70 },
    { dx: 1.8, dy: 3.8, dz: -1.0, sx: 3.4, sy: 2.1, sz: 3.4, count: 16, cardScale: 0.70 },
    { dx: 0.1, dy: 4.8, dz: -0.1, sx: 3.0, sy: 1.9, sz: 3.0, count: 14, cardScale: 0.68 },
  ];
  clusters.forEach((c, i) => {
    puffFoliage(M.momijiRed, x + c.dx * S, y + c.dy * S, z + c.dz * S,
      c.sx * S * 0.5, c.sy * S * 0.5, c.sz * S * 0.5,
      { seed: seedAt(x, z, i + 40), count: c.count, cardScale: c.cardScale });
  });
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
    const leafSeed = seedAt(bx, bz, 70);
    const lr = mulberry32(leafSeed);
    for (let k = 0; k < 6; k++) {
      const yaw = (k / 6) * Math.PI * 2 + lr() * 0.4;
      foliageCards.push({
        mat: M.bambooLeaf,
        x: bx + Math.cos(yaw) * 0.25,
        y: centerY + bh - 0.15 - lr() * 0.35,
        z: bz + Math.sin(yaw) * 0.25,
        sx: 0.55 + lr() * 0.25,
        sy: 1.15 + lr() * 0.35,
        rx: 0.85 + lr() * 0.35,
        ry: yaw,
        rz: (lr() - 0.5) * 0.25,
      });
    }
  }
}

// ---------------------------------------------------------------------------
// 10. Celestial Tower & Cloud Sanctuary (Tour Céleste & Palais Blanc des Nuages)
// ---------------------------------------------------------------------------
function buildSkyClouds(centerX, centerZ, altitude = 180, count = 22, radius = 42) {
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2 + (Math.sin(i * 3.7) * 0.35);
    const r = radius * (0.65 + (i % 4) * 0.18);
    const cx = centerX + Math.cos(angle) * r;
    const cz = centerZ + Math.sin(angle) * r;
    const cy = altitude - 6 + (Math.sin(i * 2.1) * 5);
    
    // Cluster of 4 overlapping cloud spheres
    for (let p = 0; p < 4; p++) {
      const px = cx + Math.cos(p * 1.5) * 5.5;
      const pz = cz + Math.sin(p * 1.5) * 5.5;
      const py = cy + (p % 2) * 1.8;
      const sx = 16 + (p % 3) * 5;
      const sy = 4.5 + (p % 2) * 2;
      const sz = 14 + ((p + 1) % 3) * 5;
      emit(G.sphere, M.cloudFluff, px, py, pz, sx, sy, sz, 0, p * 0.6, 0, false);
    }
  }
}

// The palace chandelier's real PointLight, kept out here so the day/night
// switch can reach it. Declared before the builder runs: a `let` further down
// the module would still be in its temporal dead zone when it is assigned.
let palaceChandelierLight = null;

function buildCelestialTowerAndSanctuary(x = 55, y = 0.15, z = 15) {
  const SUMMIT_Y = 180.0;
  const TOWER_R = 3.2;
  const PLATFORM_R = 26.0;

  // 1. Earth Plinth & Grand Approach Gateway
  // Octagonal base plinth
  cylinder(M.stonePaver, x, y + 0.3, z, 9.0, 0.6, 0, 0, 0, false);
  cylinder(M.stonePaver, x, y + 0.7, z, 7.5, 0.4, 0, 0, 0, false);
  
  // Decorative stone lanterns and incense braziers
  for (let a = 0; a < 8; a++) {
    const ang = (a / 8) * Math.PI * 2;
    const px = x + Math.cos(ang) * 8.2;
    const pz = z + Math.sin(ang) * 8.2;
    cylinder(M.stoneLantern, px, y + 1.2, pz, 0.45, 1.8, 0, 0, 0, true);
    cylinder(M.goldGiboshi, px, y + 2.2, pz, 0.25, 0.4, 0, 0, 0, false);
  }

  // Grand Entrance Torii Arch / Portal facing South
  cylinder(M.toriiRed, x - 3.2, y + 3.0, z + 7.5, 0.35, 5.0, 0, 0, 0, true);
  cylinder(M.toriiRed, x + 3.2, y + 3.0, z + 7.5, 0.35, 5.0, 0, 0, 0, true);
  box(M.toriiRed, x, y + 5.5, z + 7.5, 8.4, 0.4, 0.45, 0, 0, 0, true);
  box(M.toriiBlack, x, y + 6.0, z + 7.5, 9.2, 0.35, 0.6, 0, 0, 0, true);

  // 2. Tower Shaft (Rising from y + 0.8 to SUMMIT_Y - 5)
  const shaftH = SUMMIT_Y - y - 6;
  cylinder(M.towerIvory, x, y + shaftH / 2 + 0.8, z, TOWER_R, shaftH, 0, 0, 0, true);

  // 4 Fluted decorative pilasters along cardinal directions
  for (let i = 0; i < 4; i++) {
    const ang = (i / 4) * Math.PI * 2;
    const px = x + Math.cos(ang) * (TOWER_R + 0.15);
    const pz = z + Math.sin(ang) * (TOWER_R + 0.15);
    box(M.towerIvory, px, y + shaftH / 2 + 0.8, pz, 0.6, shaftH, 0.6, ang, 0, 0, true);
  }

  // Ornamental Golden Rings every 14 meters
  for (let hy = y + 14; hy < SUMMIT_Y - 10; hy += 14) {
    cylinder(M.palaceGold, x, hy, z, TOWER_R + 0.35, 0.6, 0, 0, 0, true);
    // 4 glowing lanterns around each ring
    for (let la = 0; la < 4; la++) {
      const lang = (la / 4) * Math.PI * 2 + (hy * 0.1);
      const lx = x + Math.cos(lang) * (TOWER_R + 0.6);
      const lz = z + Math.sin(lang) * (TOWER_R + 0.6);
      cylinder(M.lanternGlow, lx, hy, lz, 0.22, 0.45, 0, 0, 0, false);
    }
  }

  // Exterior Spiral Steps wrapping around the shaft for physical climbing
  const totalSteps = 120;
  for (let s = 0; s < totalSteps; s++) {
    const t = s / totalSteps;
    const sy = y + 1.2 + t * (SUMMIT_Y - 12);
    const sa = t * Math.PI * 18;
    const sx = x + Math.cos(sa) * (TOWER_R + 0.7);
    const sz = z + Math.sin(sa) * (TOWER_R + 0.7);
    box(M.stonePaver, sx, sy, sz, 1.6, 0.18, 0.75, -sa, 0, 0, false);
    box(M.palaceGold, sx + Math.cos(sa) * 0.8, sy + 0.5, sz + Math.sin(sa) * 0.8, 0.08, 0.9, 0.08, -sa, 0, 0, false);
  }

  // 3. Intermediate Cloud Pagoda / Mid-Way Rest Station (Altitude 85m)
  const MID_Y = 85.0;
  cylinder(M.templeWood, x, MID_Y - 0.5, z, 9.5, 0.8, 0, 0, 0, false);
  cylinder(M.shingleDark, x, MID_Y + 3.8, z, 10.5, 0.45, 0, 0, 0, false);
  // Red perimeter railing and bells
  for (let a = 0; a < 16; a++) {
    const ang = (a / 16) * Math.PI * 2;
    const px = x + Math.cos(ang) * 9.0;
    const pz = z + Math.sin(ang) * 9.0;
    cylinder(M.bridgeRed, px, MID_Y + 0.5, pz, 0.1, 1.0, 0, 0, 0, false);
    cylinder(M.brassBell, px, MID_Y + 3.5, pz, 0.08, 0.2, 0, 0, 0, false);
  }
  // Mid-way rest benches
  box(M.templeWoodLight, x + 4.5, MID_Y + 0.4, z, 2.4, 0.4, 0.8, 0, 0, 0, true);
  box(M.templeWoodLight, x - 4.5, MID_Y + 0.4, z, 2.4, 0.4, 0.8, 0, 0, 0, true);

  // 4. Summit Floating Sanctuary (Altitude 180m)
  // Inverted Hemisphere Bowl underneath
  emit(G.invDome, M.towerIvory, x, SUMMIT_Y - 0.2, z, PLATFORM_R * 2 + 1, 18, PLATFORM_R * 2 + 1, 0, 0, 0, false);
  // Gold lotus cantilever ribs supporting the bowl
  for (let r = 0; r < 8; r++) {
    const rang = (r / 8) * Math.PI * 2;
    const rx = x + Math.cos(rang) * 14.0;
    const rz = z + Math.sin(rang) * 14.0;
    box(M.palaceGold, rx, SUMMIT_Y - 6.0, rz, 1.2, 11.0, 1.2, rang, 0.35, 0, false);
  }

  // Main Checkerboard Plaza Floor (Sol en Damier - Top exactly at 180.20m)
  // A single cylinder: the box once stacked here duplicated the cylinder's own
  // top face exactly (same y, same 0.4 height, and fully inside its radius),
  // so the GPU depth test had two coincident faces to arbitrate on every
  // frame — the flicker underfoot walking across it.
  cylinder(M.checkerPlaza, x, SUMMIT_Y, z, PLATFORM_R, 0.4, 0, 0, 0, false);

  // Perimeter Golden Balustrade & Pillars — posts alone, ~5m apart, read as
  // lamp posts with the void wide open between them at 180m up. A connecting
  // rail turns them into an actual railing without boxing in the view.
  const balustradeCount = 28;
  let prevRailX = null, prevRailZ = null;
  for (let b = 0; b <= balustradeCount; b++) {
    const bang = (b / balustradeCount) * Math.PI * 2;
    const bx = x + Math.cos(bang) * (PLATFORM_R - 0.6);
    const bz = z + Math.sin(bang) * (PLATFORM_R - 0.6);
    if (b < balustradeCount) {
      cylinder(M.palaceWhite, bx, SUMMIT_Y + 0.7, bz, 0.35, 1.2, 0, 0, 0, true);
      cylinder(M.palaceGold, bx, SUMMIT_Y + 1.4, bz, 0.22, 0.3, 0, 0, 0, true);
      // Glowing orbs on lookout pillars
      if (b % 2 === 0) {
        cylinder(M.lanternGlow, bx, SUMMIT_Y + 1.7, bz, 0.18, 0.3, 0, 0, 0, false);
      }
    }
    if (prevRailX !== null) {
      branch(M.palaceGold, prevRailX, SUMMIT_Y + 1.5, prevRailZ, bx, SUMMIT_Y + 1.5, bz, 0.05, 0.05, true);
      branch(M.palaceWhite, prevRailX, SUMMIT_Y + 0.55, prevRailZ, bx, SUMMIT_Y + 0.55, bz, 0.045, 0.045, true);
    }
    prevRailX = bx; prevRailZ = bz;
  }

  // Sacred Reflection Pool at South Entrance of Plaza
  cylinder(M.palaceGoldFloor, x, SUMMIT_Y + 0.30, z + 16, 5.2, 0.35, 0, 0, 0, false);
  cylinder(M.water, x, SUMMIT_Y + 0.32, z + 16, 4.8, 0.2, 0, 0, 0, false);
  cylinder(M.goldGiboshi, x, SUMMIT_Y + 1.0, z + 16, 0.6, 1.2, 0, 0, 0, true);

  // 8 Sculpted Planters with Celestial Dwarf Trees around the plaza
  for (let p = 0; p < 8; p++) {
    const pang = (p / 8) * Math.PI * 2 + 0.4;
    const px = x + Math.cos(pang) * 20.5;
    const pz = z + Math.sin(pang) * 20.5;
    // Planter urn
    cylinder(M.palaceWhite, px, SUMMIT_Y + 0.6, pz, 1.1, 0.8, 0, 0, 0, true);
    cylinder(M.palaceGold, px, SUMMIT_Y + 1.05, pz, 1.2, 0.12, 0, 0, 0, true);
    // Miniature celestial sakura / bamboo
    if (p % 2 === 0) {
      cylinder(M.treeTrunk, px, SUMMIT_Y + 1.9, pz, 0.14, 1.8, 0, 0, 0, true);
      puffFoliage(M.sakuraBlossom, px, SUMMIT_Y + 2.9, pz, 1.8, 1.2, 1.8, { seed: p * 17, count: 12, cardScale: 0.6 });
    } else {
      cylinder(M.bambooGreen, px, SUMMIT_Y + 2.3, pz, 0.09, 2.6, 0, 0, 0, true);
      puffFoliage(M.bambooLeaf, px, SUMMIT_Y + 3.3, pz, 1.5, 1.5, 1.5, { seed: p * 23, count: 10, cardScale: 0.65 });
    }
  }

  // 5. The Rounded White Palace (Palais Blanc aux dômes - Accessible & Walkable!)
  const PALACE_Z = z - 8.0;

  // The plaza cylinder already *is* the hall floor. A white podium and a second
  // checker slab used to sit 5 mm over it; at y=180 those three coplanar tops
  // z-fought as you walked — same stacking that used to flicker the plaza
  // itself, which is why the plaza is a single cylinder now.

  // Floor plane the interior is dressed against: the plaza cylinder's top.
  const FLOOR_Y = SUMMIT_Y + 0.20;
  const ROT_R = 7.0;
  const WALL_T = 0.44;
  const WALL_H = 5.2;
  const WALL_Y = SUMMIT_Y + 2.7;   // wall centre — and the porthole centreline

  // Panels are extruded once per size and then instanced, so the ten bays of
  // the rotunda, the six of each wing and the two flanks of the south screen
  // cost three geometries between them.
  const rotPanelGeo = piercedWall(2.98, WALL_H, 0.62, 0, WALL_T);
  const wingPanelGeo = piercedWall(3.45, 4.1, 0.44, 0.05, 0.36);
  const screenPanelGeo = piercedWall(3.58, WALL_H, 0.60, 0, 0.40);

  // A porthole's furniture: gilt hoop, glazing, and the two crossed bars.
  // `ang` is the direction the wall faces, so its outward normal is
  // (cos ang, 0, sin ang). A torus points along its local +Z, which Ry sends to
  // (sin ry, 0, cos ry) — hence PI/2 - ang. A box's local +X goes to
  // (cos ry, 0, -sin ry), so yaw -ang puts local X on the normal and leaves
  // local Z running along the wall; the cylinder rides that same frame once rz
  // has tipped its axis off +Y onto local +X.
  const roundWindow = (px, py, pz, r, ang) => {
    emit(G.ring, M.palaceGold, px, py, pz, r * 2 + 0.08, r * 2 + 0.08, r * 2 + 0.08,
      0, Math.PI / 2 - ang, 0, false);
    cylinder(M.palaceGlass, px, py, pz, r * 0.97, 0.12, -ang, 0, -Math.PI / 2, false);
    box(M.palaceGold, px, py, pz, 0.07, 0.07, r * 1.94, -ang, 0, 0, false);
    box(M.palaceGold, px, py, pz, 0.07, r * 1.94, 0.07, -ang, 0, 0, false);
  };

  // --- Central Rotunda (Enclosed Hall, Radius 7.0m) ---
  //
  // The bays between the columns were handed (2.6, 5.0, 0.4) at a yaw of
  // -midAng, which lays their 2.6 m span along the *radius*: sixteen thin fins
  // pointing outward with 2.3 m of open sky between each pair, which is why the
  // hall had no walls to speak of. Under the 'YXZ' compose a yaw of -a sends
  // local X to the outward normal, so the tangent chord is local Z — the panel
  // geometry is built with its width on X and its thickness on Z instead, and
  // aimed with PI/2 - a.
  const rotSegments = 16;
  // Doorways: east (0), south (4), west (8) — each widened by dropping the bay
  // on either side of it, which leaves a 5.4 m opening under a 45° arc.
  const openCol = new Set([0, 4, 8]);
  const openBay = new Set([15, 0, 3, 4, 7, 8]);
  for (let s = 0; s < rotSegments; s++) {
    const ang = (s / rotSegments) * Math.PI * 2;
    if (!openCol.has(s)) {
      const wx = x + Math.cos(ang) * ROT_R;
      const wz = PALACE_Z + Math.sin(ang) * ROT_R;
      cylinder(M.palaceWhite, wx, SUMMIT_Y + 2.7, wz, 0.55, 5.4, 0, 0, 0, true);
      cylinder(M.palaceGold, wx, FLOOR_Y + 0.22, wz, 0.68, 0.44, 0, 0, 0, true);
      cylinder(M.palaceGold, wx, SUMMIT_Y + 5.2, wz, 0.65, 0.35, 0, 0, 0, false);
    }
    if (openBay.has(s)) continue;

    const midAng = ((s + 0.5) / rotSegments) * Math.PI * 2;
    const mx = x + Math.cos(midAng) * ROT_R;
    const mz = PALACE_Z + Math.sin(midAng) * ROT_R;
    emit(rotPanelGeo, M.palaceWhite, mx, WALL_Y, mz, 1, 1, 1, 0, Math.PI / 2 - midAng, 0, true);
    // Gilt skirting and frieze, so the bay reads as masonry rather than as a slab.
    box(M.palaceGold, mx, FLOOR_Y + 0.30, mz, WALL_T + 0.16, 0.60, 3.02, -midAng, 0, 0, true);
    box(M.palaceGold, mx, SUMMIT_Y + 5.10, mz, WALL_T + 0.16, 0.34, 3.02, -midAng, 0, 0, false);
    roundWindow(mx, WALL_Y, mz, 0.62, midAng);
  }

  // Grand Arched South Entrance Portal (clear opening ~5.4m under a 5.2m head)
  const DOOR_Z = PALACE_Z + 6.8;
  for (const side of [-1, 1]) {
    box(M.palaceWhite, x + side * 2.9, SUMMIT_Y + 2.7, DOOR_Z, 0.9, 5.4, 0.9, 0, 0, 0, true);
    box(M.palaceGold, x + side * 2.9, FLOOR_Y + 0.28, DOOR_Z, 1.1, 0.56, 1.1, 0, 0, 0, true);
    box(M.palaceGold, x + side * 2.9, SUMMIT_Y + 5.05, DOOR_Z, 1.1, 0.4, 1.1, 0, 0, 0, false);
  }
  box(M.palaceGold, x, SUMMIT_Y + 5.2, DOOR_Z, 6.8, 0.5, 1.2, 0, 0, 0, false);
  // Rounded Arch Hood atop the entrance
  emit(G.dome, M.palaceWhite, x, SUMMIT_Y + 5.2, DOOR_Z, 5.8, 2.8, 2.0, 0, 0, 0, false);

  // --- Noble-timber Doors, Thrown Open ---
  //
  // Two keyaki leaves on the jambs, swung ~70° so they stand almost along the
  // approach and leave 3.3 m of clear walking between their free edges. Each
  // leaf is built in its own frame: `dir` runs hinge → free edge, `nrm` is the
  // face it presents, and every stud and band is placed as hinge + dir·t + nrm·u.
  const DOOR_W = 2.25, DOOR_H = 4.3, DOOR_SWING = 1.22;
  const DOOR_Y = FLOOR_Y + DOOR_H / 2;
  // Timber sill across the threshold. Nine centimetres proud, well under the
  // half-metre the ground snap steps over, so it is trim and not a kerb.
  box(M.palaceDoorWood, x, FLOOR_Y + 0.09, DOOR_Z, 6.0, 0.18, 0.6, 0, 0, 0, false);
  for (const side of [-1, 1]) {
    const hingeX = x + side * 2.45;
    const yaw = side < 0 ? -DOOR_SWING : DOOR_SWING - Math.PI;
    const dx = Math.cos(yaw), dz = -Math.sin(yaw);   // local +X under Ry(yaw)
    const nx = Math.sin(yaw), nz = Math.cos(yaw);    // local +Z under Ry(yaw)
    const at = (t, u = 0) => [hingeX + dx * t + nx * u, DOOR_Z + dz * t + nz * u];

    const [lx, lz] = at(DOOR_W / 2);
    box(M.palaceDoorWood, lx, DOOR_Y, lz, DOOR_W, DOOR_H, 0.16, yaw, 0, 0, true);
    // Gilt stiles at the hinge and the free edge, and three cross rails.
    for (const t of [0.11, DOOR_W - 0.11]) {
      const [sx2, sz2] = at(t);
      box(M.palaceGold, sx2, DOOR_Y, sz2, 0.22, DOOR_H, 0.22, yaw, 0, 0, true);
    }
    for (const h of [0.28, DOOR_H / 2, DOOR_H - 0.28]) {
      box(M.palaceGold, lx, FLOOR_Y + h, lz, DOOR_W, 0.17, 0.22, yaw, 0, 0, true);
    }
    // Boss studs, four courses of three, on the face that shows from the plaza.
    for (let r = 0; r < 4; r++) {
      for (let cI = 0; cI < 3; cI++) {
        const [bx, bz] = at(0.5 + cI * 0.62, side * 0.1);
        cylinder(M.goldGiboshi, bx, FLOOR_Y + 0.85 + r * 0.85, bz, 0.11, 0.12,
          yaw - Math.PI / 2, 0, -Math.PI / 2, false);
      }
    }
    // Pull ring, lying flat on the leaf.
    const [px2, pz2] = at(DOOR_W - 0.45, side * 0.12);
    emit(G.ring, M.goldGiboshi, px2, FLOOR_Y + 1.95, pz2, 0.62, 0.62, 0.62, 0, yaw, 0, false);
  }
  // Kumiko transom filling the head of the portal above the open leaves.
  box(M.palaceDoorWood, x, FLOOR_Y + DOOR_H + 0.06, DOOR_Z, 5.4, 0.13, 0.32, 0, 0, 0, false);
  box(M.palaceDoorWood, x, SUMMIT_Y + 4.86, DOOR_Z, 5.4, 0.13, 0.32, 0, 0, 0, false);
  for (let i = 0; i <= 12; i++) {
    box(M.palaceGold, x - 2.55 + i * 0.425, FLOOR_Y + DOOR_H + 0.22, DOOR_Z,
      0.07, 0.42, 0.16, 0, 0, 0, false);
  }

  // Crescent Colonnade Portico on the Plaza (Welcoming Curved Entrance).
  // Bare columns ~1.8m apart left the sky showing clean through every gap —
  // the naked-pole look the shrine visit was flagged for. A close-packed row
  // of uprights between each pair reads as an actual wall, and a cornice
  // spanning column to column ties the row together, both without the
  // rotation math a flat panel would need to sit tangent to this radius.
  const crescentCols = [];
  for (let c = -3; c <= 3; c++) {
    if (Math.abs(c) < 1) continue; // Keep center wide open
    const ca = (c / 4) * 0.75;
    const cx = x + Math.sin(ca) * 9.5;
    const cz = PALACE_Z + Math.cos(ca) * 9.5;
    cylinder(M.palaceWhite, cx, SUMMIT_Y + 2.5, cz, 0.38, 4.6, 0, 0, 0, true);
    cylinder(M.palaceGold, cx, SUMMIT_Y + 4.7, cz, 0.48, 0.25, 0, 0, 0, true);
    crescentCols.push({ c, ca, x: cx, z: cz });
  }
  for (let i = 0; i < crescentCols.length - 1; i++) {
    const a = crescentCols[i], b = crescentCols[i + 1];
    if (b.c - a.c !== 1) continue; // straddles the open centre gap
    for (let t = 0.2; t < 0.99; t += 0.2) {
      const sa = a.ca + (b.ca - a.ca) * t;
      const sx = x + Math.sin(sa) * 9.5;
      const sz = PALACE_Z + Math.cos(sa) * 9.5;
      cylinder(M.palaceWhite, sx, SUMMIT_Y + 2.3, sz, 0.22, 4.2, 0, 0, 0, true);
    }
    branch(M.palaceGold, a.x, SUMMIT_Y + 4.7, a.z, b.x, SUMMIT_Y + 4.7, b.z, 0.16, 0.16, false);
  }

  // Vaulted Dome Ceiling atop Central Rotunda (High above at Y = 185.5m - Hollow Interior!)
  emit(G.dome, M.palaceWhite, x, SUMMIT_Y + 5.4, PALACE_Z, 14.4, 8.2, 14.4, 0, 0, 0, false);
  // Night-sky vault just inside it, plus gilt meridian ribs springing from the
  // wall head. Without the inner shell the hall looked up at bare sky: the outer
  // dome's normals point away, so it draws nothing at all from underneath.
  emit(G.dome, M.palaceVault, x, SUMMIT_Y + 5.32, PALACE_Z, 13.9, 7.9, 13.9, 0, 0, 0, false);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    for (let k = 0; k < 6; k++) {
      const t0 = k / 6, t1 = (k + 1) / 6;
      const p = tt => [
        x + Math.cos(a) * 6.9 * Math.cos(tt * Math.PI / 2),
        SUMMIT_Y + 5.32 + 3.9 * Math.sin(tt * Math.PI / 2),
        PALACE_Z + Math.sin(a) * 6.9 * Math.cos(tt * Math.PI / 2),
      ];
      const [ax, ay, az] = p(t0), [bx2, by2, bz2] = p(t1);
      branch(M.palaceGold, ax, ay, az, bx2, by2, bz2, 0.055, 0.055, false);
    }
  }
  // Golden Needle Spire atop Main Dome
  cylinder(M.palaceGold, x, SUMMIT_Y + 11.5, PALACE_Z, 0.35, 4.5, 0, 0, 0, false);
  cylinder(M.goldGiboshi, x, SUMMIT_Y + 14.0, PALACE_Z, 0.65, 0.9, 0, 0, 0, false);

  // --- Celestial Chandelier (Lustre) hanging in the Dome ---
  //
  // Two gilt hoops on chains, ringed with hanging lanterns around a luminous
  // core. The hoops take G.hoop rather than G.ring: a torus scales its tube
  // with its radius, and G.ring's 0.15 tube ratio would put a half-metre-thick
  // doughnut on a three-metre hoop.
  const CHAND_Y = SUMMIT_Y + 6.3;
  cylinder(M.palaceGold, x, SUMMIT_Y + 8.9, PALACE_Z, 0.10, 3.6, 0, 0, 0, false);
  emit(G.dome, M.palaceGold, x, SUMMIT_Y + 10.6, PALACE_Z, 1.7, 0.8, 1.7, 0, 0, 0, false);
  emit(G.hoop, M.palaceGold, x, CHAND_Y + 1.15, PALACE_Z, 3.6, 3.6, 3.6, Math.PI / 2, 0, 0, false);
  emit(G.hoop, M.palaceGold, x, CHAND_Y, PALACE_Z, 6.4, 6.4, 6.4, Math.PI / 2, 0, 0, false);

  const hangLantern = (hx, hy, hz, s) => {
    cylinder(M.palaceGold, hx, hy + 0.34 * s, hz, 0.035, 0.7 * s, 0, 0, 0, false);
    cylinder(M.palaceGold, hx, hy - 0.02 * s, hz, 0.20 * s, 0.10 * s, 0, 0, 0, false);
    cylinder(M.chandelierGlow, hx, hy - 0.30 * s, hz, 0.24 * s, 0.56 * s, 0, 0, 0, false);
    cylinder(M.goldGiboshi, hx, hy - 0.64 * s, hz, 0.11 * s, 0.20 * s, 0, 0, 0, false);
  };
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const hx = x + Math.cos(a) * 3.2, hz = PALACE_Z + Math.sin(a) * 3.2;
    hangLantern(hx, CHAND_Y - 0.12, hz, 1.0);
    // Chain up to the inner hoop, and a droplet under the rim.
    branch(M.palaceGold, hx, CHAND_Y + 0.22, hz,
      x + Math.cos(a) * 1.8, CHAND_Y + 1.15, PALACE_Z + Math.sin(a) * 1.8, 0.026, 0.026, false);
    emit(G.cone, M.chandelierGlow, x + Math.cos(a + 0.26) * 3.2, CHAND_Y - 0.34,
      PALACE_Z + Math.sin(a + 0.26) * 3.2, 0.22, 0.5, 0.22, Math.PI, 0, 0, false);
  }
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.5;
    hangLantern(x + Math.cos(a) * 1.8, CHAND_Y + 1.0, PALACE_Z + Math.sin(a) * 1.8, 0.78);
    branch(M.palaceGold, x + Math.cos(a) * 1.8, CHAND_Y + 1.38, PALACE_Z + Math.sin(a) * 1.8,
      x, SUMMIT_Y + 8.0, PALACE_Z, 0.026, 0.026, false);
  }
  // Luminous core in a gilt cage.
  emit(G.sphere, M.chandelierGlow, x, CHAND_Y + 0.35, PALACE_Z, 0.95, 0.95, 0.95, 0, 0, 0, false);
  emit(G.hoop, M.palaceGold, x, CHAND_Y + 0.35, PALACE_Z, 1.5, 1.5, 1.5, Math.PI / 2, 0, 0, false);
  emit(G.hoop, M.palaceGold, x, CHAND_Y + 0.35, PALACE_Z, 1.5, 1.5, 1.5, 0, 0, 0, false);
  emit(G.hoop, M.palaceGold, x, CHAND_Y + 0.35, PALACE_Z, 1.5, 1.5, 1.5, 0, Math.PI / 2, 0, false);
  cylinder(M.goldGiboshi, x, CHAND_Y - 0.55, PALACE_Z, 0.20, 0.55, 0, 0, 0, false);

  // The one real light inside: the emissive lanterns above only paint themselves,
  // and now that the rotunda has walls the sun no longer reaches the floor.
  palaceChandelierLight = new THREE.PointLight(0xffd9a4, 20, 32, 1.5);
  palaceChandelierLight.position.set(x, CHAND_Y - 0.9, PALACE_Z);
  scene.add(palaceChandelierLight);

  // --- Interior Partitions (Cloisons) ---
  //
  // Two screens across the round hall: a full-height wall that cuts off an
  // entrance vestibule behind the doors, and a low shoji partition that closes
  // the throne off as a sanctuary. Both leave a wide central opening, so the
  // axis from the door to the dais stays walkable end to end.
  const VEST_Z = PALACE_Z + 4.6;
  const VEST_HALF = Math.sqrt(ROT_R * ROT_R - 4.6 * 4.6);   // chord at that depth
  for (const side of [-1, 1]) {
    const bx = x + side * (1.7 + VEST_HALF) / 2;
    emit(screenPanelGeo, M.palaceWhite, bx, WALL_Y, VEST_Z, 1, 1, 1, 0, 0, 0, true);
    box(M.palaceGold, bx, FLOOR_Y + 0.30, VEST_Z, 3.6, 0.60, 0.56, 0, 0, 0, true);
    box(M.palaceGold, bx, SUMMIT_Y + 5.10, VEST_Z, 3.6, 0.34, 0.56, 0, 0, 0, false);
    roundWindow(bx, WALL_Y, VEST_Z, 0.60, Math.PI / 2);
    box(M.palaceGold, x + side * 1.7, WALL_Y, VEST_Z, 0.32, WALL_H, 0.56, 0, 0, 0, true);
  }
  // Head of the vestibule doorway: 3.4m wide, 3.6m clear.
  box(M.palaceWhite, x, SUMMIT_Y + 4.62, VEST_Z, 3.4, 1.36, 0.40, 0, 0, 0, false);
  box(M.palaceGold, x, SUMMIT_Y + 3.86, VEST_Z, 3.9, 0.28, 0.54, 0, 0, 0, false);

  const SANC_Z = PALACE_Z - 0.5;
  // Stops 4.6 m out leaving clear aisle to each wing
  const SANC_HALF = 4.6;
  for (const side of [-1, 1]) {
    const w = SANC_HALF - 2.1;
    const bx = x + side * (2.1 + SANC_HALF) / 2;
    box(M.palaceWhite, bx, FLOOR_Y + 0.55, SANC_Z, w, 1.10, 0.34, 0, 0, 0, true);
    box(M.palaceGold, bx, FLOOR_Y + 1.16, SANC_Z, w, 0.13, 0.44, 0, 0, 0, true);
    box(M.shojiPaper, bx, FLOOR_Y + 2.28, SANC_Z, w - 0.22, 2.10, 0.10, 0, 0, 0, true);
    box(M.palaceGold, bx, FLOOR_Y + 3.44, SANC_Z, w, 0.22, 0.46, 0, 0, 0, false);
    // Kumiko grid over the paper.
    const bars = Math.max(2, Math.round(w / 0.62));
    for (let i = 1; i < bars; i++) {
      box(M.palaceGold, bx - w / 2 + (w * i) / bars, FLOOR_Y + 2.28, SANC_Z,
        0.07, 2.10, 0.17, 0, 0, 0, false);
    }
    for (const h of [1.62, 2.28, 2.94]) {
      box(M.palaceGold, bx, FLOOR_Y + h, SANC_Z, w - 0.22, 0.06, 0.17, 0, 0, 0, false);
    }
    // Gilt posts on the sanctuary doorway's jamb and on the free end
    for (const px2 of [x + side * 2.1, x + side * SANC_HALF]) {
      cylinder(M.palaceGold, px2, FLOOR_Y + 1.78, SANC_Z, 0.17, 3.56, 0, 0, 0, true);
      cylinder(M.goldGiboshi, px2, FLOOR_Y + 3.72, SANC_Z, 0.23, 0.36, 0, 0, 0, false);
    }
  }

  // Interior Throne / Meditation Dais at North Rear of Hall.
  // Bottom is 2 cm into the plaza so this disc and the damier never share a plane.
  cylinder(M.palaceGoldFloor, x, SUMMIT_Y + 0.38, PALACE_Z - 3.2, 3.2, 0.4, 0, 0, 0, false);
  box(M.palaceWhite, x, SUMMIT_Y + 0.8, PALACE_Z - 3.2, 2.4, 0.45, 1.4, 0, 0, 0, true);
  cylinder(M.goldGiboshi, x - 1.6, SUMMIT_Y + 1.2, PALACE_Z - 3.2, 0.25, 0.8, 0, 0, 0, true);
  cylinder(M.goldGiboshi, x + 1.6, SUMMIT_Y + 1.2, PALACE_Z - 3.2, 0.25, 0.8, 0, 0, 0, true);

  // --- Celestial Carpets ---
  //
  // Twelve millimetres proud of the checker slab: clear of its top face so the
  // depth test never has to arbitrate, and far under the half-metre ledge the
  // ground snap steps onto, so a rug stays something you walk over.
  const RUG_T = 0.05;
  const rugY = FLOOR_Y + 0.012 - RUG_T / 2;
  const roundRug = (rx2, rz2, r, y0 = rugY) =>
    emit(G.disc, M.carpetRound, rx2, y0, rz2, r * 2, RUG_T, r * 2, 0, 0, 0, false);
  // A runner is a row of square stamps, the way a woven one repeats its medallion.
  const runnerRug = (rx2, rz2, w, d) => {
    const n = Math.max(1, Math.round(Math.max(w, d) / Math.min(w, d)));
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n - 0.5;
      if (w >= d) box(M.carpetPanel, rx2 + t * w, rugY, rz2, w / n, RUG_T, d, 0, 0, 0, false);
      else box(M.carpetPanel, rx2, rugY, rz2 + t * d, w, RUG_T, d / n, 0, 0, 0, false);
    }
  };

  runnerRug(x, PALACE_Z + 5.85, 4.6, 2.0);                       // vestibule
  roundRug(x, PALACE_Z + 2.55, 1.85);                            // hall, on axis
  roundRug(x, PALACE_Z - 3.2, 2.35, SUMMIT_Y + 0.612 - RUG_T / 2); // under the throne
  for (const side of [-1, 1]) {
    roundRug(x + side * 4.2, PALACE_Z + 2.55, 1.6);
    // Golden incense urns off the axis, one at each flanking medallion's centre.
    cylinder(M.palaceGold, x + side * 4.2, SUMMIT_Y + 0.7, PALACE_Z + 2.55, 0.65, 1.0, 0, 0, 0, true);
    cylinder(M.lanternGlow, x + side * 4.2, SUMMIT_Y + 1.3, PALACE_Z + 2.55, 0.35, 0.25, 0, 0, 0, false);
    runnerRug(x + side * 5.25, PALACE_Z, 3.6, 2.4);              // passage to the wing
  }

  // --- Flanking Wing Pavilions (Walkable Rooms, R = 4.2m) ---
  //
  // Same fix as the rotunda: the bays sit on the chords *between* the columns
  // with their width tangent, so the pavilion is a room and not a ring of posts.
  const WEST_X = x - 10.5;
  const EAST_X = x + 10.5;
  const buildWing = (WX, openIdx) => {
    for (let w = 0; w < 8; w++) {
      const wa = (w / 8) * Math.PI * 2;
      if (w !== openIdx) {
        const wx = WX + Math.cos(wa) * 4.2;
        const wz = PALACE_Z + Math.sin(wa) * 4.2;
        cylinder(M.palaceWhite, wx, SUMMIT_Y + 2.1, wz, 0.45, 4.2, 0, 0, 0, true);
        cylinder(M.palaceGold, wx, SUMMIT_Y + 4.15, wz, 0.55, 0.3, 0, 0, 0, true);
      }
      // Skip the two bays flanking the doorway, so the opening is a full 90°.
      if (w === openIdx || w === (openIdx + 7) % 8) continue;
      const ma = ((w + 0.5) / 8) * Math.PI * 2;
      const mx = WX + Math.cos(ma) * 4.2;
      const mz = PALACE_Z + Math.sin(ma) * 4.2;
      emit(wingPanelGeo, M.palaceWhite, mx, SUMMIT_Y + 2.05, mz, 1, 1, 1, 0, Math.PI / 2 - ma, 0, true);
      box(M.palaceGold, mx, FLOOR_Y + 0.26, mz, 0.5, 0.52, 3.5, -ma, 0, 0, true);
      box(M.palaceGold, mx, SUMMIT_Y + 3.94, mz, 0.5, 0.28, 3.5, -ma, 0, 0, false);
      roundWindow(mx, SUMMIT_Y + 2.1, mz, 0.44, ma);
    }
    emit(G.dome, M.palaceWhite, WX, SUMMIT_Y + 4.1, PALACE_Z, 8.8, 4.8, 8.8, 0, 0, 0, false);
    emit(G.dome, M.palaceVaultSmall, WX, SUMMIT_Y + 4.04, PALACE_Z, 8.4, 4.6, 8.4, 0, 0, 0, false);
    cylinder(M.palaceGold, WX, SUMMIT_Y + 7.4, PALACE_Z, 0.22, 2.2, 0, 0, 0, false);
    // Each wing keeps its own small chandelier under the cupola, hung clear of
    // head height: the cupola only springs at 184.1, so it cannot go much higher.
    cylinder(M.palaceGold, WX, SUMMIT_Y + 4.0, PALACE_Z, 0.07, 0.9, 0, 0, 0, false);
    emit(G.hoop, M.palaceGold, WX, SUMMIT_Y + 3.5, PALACE_Z, 2.3, 2.3, 2.3, Math.PI / 2, 0, 0, false);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      hangLantern(WX + Math.cos(a) * 1.15, SUMMIT_Y + 3.45, PALACE_Z + Math.sin(a) * 1.15, 0.62);
    }
    emit(G.sphere, M.chandelierGlow, WX, SUMMIT_Y + 3.6, PALACE_Z, 0.62, 0.62, 0.62, 0, 0, 0, false);
    roundRug(WX, PALACE_Z, 2.9);
  };
  buildWing(WEST_X, 0);   // doorway faces east, back to the rotunda
  buildWing(EAST_X, 4);   // doorway faces west

  // West Room Celestial Star Globe
  cylinder(M.palaceGold, WEST_X, SUMMIT_Y + 0.6, PALACE_Z, 0.8, 0.8, 0, 0, 0, true);
  cylinder(M.palaceGoldFloor, WEST_X, SUMMIT_Y + 1.05, PALACE_Z, 0.62, 0.16, 0, 0, 0, false);
  emit(G.sphere, M.chandelierGlow, WEST_X, SUMMIT_Y + 1.85, PALACE_Z, 1.5, 1.5, 1.5, 0, 0, 0, false);
  for (let i = 0; i < 3; i++) {
    emit(G.hoop, M.palaceGold, WEST_X, SUMMIT_Y + 1.85, PALACE_Z, 1.62, 1.62, 1.62,
      i === 0 ? Math.PI / 2 : 0, i === 2 ? Math.PI / 2 : 0, 0, false);
  }

  // East Room Celestial Water Font
  cylinder(M.palaceGold, EAST_X, SUMMIT_Y + 0.6, PALACE_Z, 1.2, 0.6, 0, 0, 0, true);
  cylinder(M.water, EAST_X, SUMMIT_Y + 0.85, PALACE_Z, 1.0, 0.15, 0, 0, 0, false);

  // Covered passages joining the rotunda to the wings
  for (const WX of [WEST_X, EAST_X]) {
    const px = (x + WX) / 2;
    box(M.palaceWhite, px, SUMMIT_Y + 4.2, PALACE_Z, 3.5, 0.4, 5.2, 0, 0, 0, false);
    box(M.palaceGold, px, SUMMIT_Y + 4.44, PALACE_Z, 3.7, 0.16, 5.4, 0, 0, 0, false);
    for (const side of [-1, 1]) {
      cylinder(M.palaceWhite, px, SUMMIT_Y + 2.0, PALACE_Z + side * 2.3, 0.3, 3.8, 0, 0, 0, true);
      cylinder(M.palaceGold, px, SUMMIT_Y + 3.95, PALACE_Z + side * 2.3, 0.38, 0.26, 0, 0, 0, true);
    }
  }

  // 6. Floating Cloud Layers in the Sky
  buildSkyClouds(x, z, SUMMIT_Y - 2, 22, 42);

  // 7. Register Interactive Climbing & Teleport Spots
  furnitureInteractions.push({
    type: 'towerAscent',
    label: "Escalader la Tour Céleste vers le Paradis  (E)",
    x: x, y: 1.2, z: z + 8.5,
    centerX: x, centerZ: z + 8.5,
    approachY: 0.85,
    yaw: 0,
    halfWidth: 3.5, halfDepth: 3.5,
    triggerDistance: 3.2,
    occupied: false,
  });

  furnitureInteractions.push({
    type: 'towerDescent',
    label: "Redescendre sur Terre au Sanctuaire  (E)",
    x: x, y: SUMMIT_Y + 0.7, z: z + 24.5,
    centerX: x, centerZ: z + 24.5,
    approachY: 180.20,
    yaw: Math.PI,
    halfWidth: 3.5, halfDepth: 3.5,
    triggerDistance: 3.2,
    occupied: false,
  });

  furnitureInteractions.push({
    type: 'sit',
    label: "Méditer dans le Palais Céleste  (E)",
    x: x, y: 181.1, z: PALACE_Z - 3.2,
    centerX: x, centerZ: PALACE_Z - 3.2,
    approachY: 180.20,
    yaw: Math.PI,
    halfWidth: 1.5, halfDepth: 1.5,
    triggerDistance: 1.5,
    occupied: false,
  });
}

// ---------------------------------------------------------------------------
// 11. Sakura Falling Petals Particle System
// ---------------------------------------------------------------------------
const PETAL_COUNT = 450;
const petalGeo = new THREE.PlaneGeometry(0.16, 0.20);
// Untextured, these quads read as pink confetti rectangles the moment one drifts
// close to the camera. Same petal the blossoms are built from, alpha-tested down
// to its own outline.
const petalT = canvasTexture((() => {
  const c = makeCanvas(64);
  const g = c.getContext('2d');
  g.translate(32, 58);
  drawSakuraPetal(g, 52, 24, '#ff9dbb', '#ffd0e0');
  return c;
})());
const petalMat = new THREE.MeshBasicMaterial({
  color: 0xffffff,
  map: petalT,
  side: THREE.DoubleSide,
  transparent: true,
  opacity: 0.92,
  alphaTest: 0.35,
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
  new THREE.PlaneGeometry(POND_W, POND_D, 32, 32),
  M.water
);
pondMesh.rotation.x = -Math.PI / 2;
pondMesh.position.set(0, POND_WATER_Y, POND_Z);
scenery.add(pondMesh);

// Pond bed is scenery only. As a kit prop it is a 38×28 m wall: resolveWalls
// has no "standing above" test, so anyone on the pier/bridge is shoved back.
{
  const pondBed = new THREE.Mesh(new THREE.BoxGeometry(38, 1.2, 28), M.pondBed);
  pondBed.position.set(0, -0.6, POND_Z);
  pondBed.receiveShadow = true;
  scenery.add(pondBed);
}
{
  const rimGap = LANDING_W / 2 + 0.1;
  const rimHalf = 19;
  const segW = rimHalf - rimGap;
  const segX = rimGap + segW / 2;
  box(M.stonePaver, -segX, 0.42, POND_Z0 - 0.5, segW, 0.4, 1.8, 0, 0, 0, true);
  box(M.stonePaver,  segX, 0.42, POND_Z0 - 0.5, segW, 0.4, 1.8, 0, 0, 0, true);
  box(M.stonePaver, -segX, 0.42, POND_Z1 + 0.5, segW, 0.4, 1.8, 0, 0, 0, true);
  box(M.stonePaver,  segX, 0.42, POND_Z1 + 0.5, segW, 0.4, 1.8, 0, 0, 0, true);
}
box(M.stonePaver, -18.5, 0.42, POND_Z, 1.8, 0.4, 28, 0, 0, 0, true);
box(M.stonePaver, 18.5, 0.42, POND_Z, 1.8, 0.4, 28, 0, 0, 0, true);

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
// The lawn is one 280×320 m plane: it needs its own tiling (≈2.8 m per tile),
// far denser than the moss caps that share M.mossGrass' texture.
const lawnGrass = grassDiff.clone();
lawnGrass.repeat.set(100, 114);
lawnGrass.needsUpdate = true;
const mainGround = new THREE.Mesh(
  new THREE.PlaneGeometry(280, 320),
  new THREE.MeshStandardMaterial({
    color: 0x5f7d46, roughness: 0.94, metalness: 0.02, map: lawnGrass,
  })
);
mainGround.rotation.x = -Math.PI / 2;
mainGround.position.set(0, 0, 50);
mainGround.receiveShadow = true;
scenery.add(mainGround);

// Sando split around the pond: the 140 m slab used to run underwater.
function sandoRun(z0, z1) {
  const z = (z0 + z1) / 2;
  const d = z1 - z0;
  box(M.stonePaver, SANDO_X, SANDO_Y, z, SANDO_W, SANDO_H, d, 0, 0, 0, false);
  // Ishidatami kerbs. Flagged as props they become a pair of 50–60 m walls
  // that trap you on the sando — you cannot step onto the lawn at all.
  box(M.stoneLantern, -2.9, 0.14, z, 0.5, 0.26, d, 0, 0, 0, false);
  box(M.stoneLantern, 2.9, 0.14, z, 0.5, 0.26, d, 0, 0, 0, false);
}
sandoRun(SANDO_AXIS_Z0, SANDO_SOUTH_Z1);
sandoRun(SANDO_NORTH_Z0, SANDO_AXIS_Z1);

// Double row of stone lanterns along the Sando
for (let z = -20; z <= 90; z += 9) {
  if (z > 16 && z < 50) continue; // pond + bridge crossing
  buildStoneLantern(-3.8, 0.15, z, 1.0, 0);
  buildStoneLantern(3.8, 0.15, z, 1.0, Math.PI);
}
buildStoneLantern(-3.8, 0.15, 48.2, 1.0, 0);
buildStoneLantern(3.8, 0.15, 48.2, 1.0, Math.PI);

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
buildTaikoBashi(BRIDGE_X, BRIDGE_Y, BRIDGE_Z, BRIDGE_SPAN, BRIDGE_W);

// Main Haiden Shrine Hall
buildMainShrine(0, 0.15, 95);

// Five-Story Pagoda
buildPagoda(-26, 0.15, 82);

// Zen Rock Garden
buildZenGarden(ZEN_X, ZEN_Y, ZEN_Z, ZEN_W, ZEN_D);

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
flushFoliageCards();

// Celestial Cloud Tower & White Palace Sanctuary (Ascension to Heaven)
buildCelestialTowerAndSanctuary(55, 0.15, 15);

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
// 15. Night Mode Scene Architecture (Lights, Candles, Sky Lanterns, Fireflies, Moon & Stars)
// ---------------------------------------------------------------------------
const nightGroup = new THREE.Group();
scene.add(nightGroup);
nightGroup.visible = false;

function makeGlowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 2, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255, 255, 255, 1)');
  grad.addColorStop(0.35, 'rgba(255, 220, 140, 0.75)');
  grad.addColorStop(0.70, 'rgba(255, 140, 30, 0.25)');
  grad.addColorStop(1, 'rgba(255, 80, 10, 0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const glowTex = makeGlowTexture();

function makeFireflyTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 1, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255, 255, 255, 1)');
  grad.addColorStop(0.3, 'rgba(230, 255, 100, 0.9)');
  grad.addColorStop(0.65, 'rgba(180, 255, 50, 0.35)');
  grad.addColorStop(1, 'rgba(120, 255, 20, 0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const fireflyTex = makeFireflyTexture();

// Starfield & Moon
const STAR_COUNT = 750;
const starGeo = new THREE.PlaneGeometry(0.55, 0.55);
const starMat = new THREE.MeshBasicMaterial({
  map: glowTex,
  color: 0xffffff,
  transparent: true,
  opacity: 0.85,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
  side: THREE.DoubleSide,
});
const starMesh = new THREE.InstancedMesh(starGeo, starMat, STAR_COUNT);
const starData = [];
{
  const _m = new THREE.Matrix4(), _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3();
  for (let i = 0; i < STAR_COUNT; i++) {
    const radius = 180 + Math.random() * 220;
    const phi = Math.random() * Math.PI * 0.44;
    const theta = Math.random() * Math.PI * 2;
    const x = radius * Math.sin(phi) * Math.cos(theta);
    const y = radius * Math.cos(phi) + 20;
    const z = radius * Math.sin(phi) * Math.sin(theta) + 40;
    const baseScale = 0.6 + Math.random() * 1.4;
    const twinkleSpeed = 1.2 + Math.random() * 3.5;
    const phase = Math.random() * Math.PI * 2;
    starData.push({ x, y, z, baseScale, twinkleSpeed, phase });

    _p.set(x, y, z);
    _s.set(baseScale, baseScale, baseScale);
    _m.compose(_p, _q, _s);
    starMesh.setMatrixAt(i, _m);
  }
  starMesh.instanceMatrix.needsUpdate = true;
  nightGroup.add(starMesh);
}

// Full Glowing Moon
{
  const moonMesh = new THREE.Mesh(
    new THREE.SphereGeometry(7.5, 24, 24),
    new THREE.MeshBasicMaterial({ color: 0xf4f9ff })
  );
  moonMesh.position.set(-65, 130, 240);
  nightGroup.add(moonMesh);

  const moonHalo = new THREE.Mesh(
    new THREE.PlaneGeometry(42, 42),
    new THREE.MeshBasicMaterial({
      map: glowTex,
      color: 0xb5d8ff,
      transparent: true,
      opacity: 0.6,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    })
  );
  moonHalo.position.copy(moonMesh.position);
  moonHalo.position.z -= 1.0;
  nightGroup.add(moonHalo);
}

// Strategic light sources throughout the Shrine Precinct.
//
// These are declared as *emitters*, not as real lights. The precinct wants ~31
// of them (22 lantern candles + 9 landmarks), but WebGL shades every fragment
// against every visible light in the scene: past roughly 16 the standard
// material shaders spill registers and the frame rate collapses — measured at
// 13 fps with all of them lit, against 60 with eight. So a fixed-size pool of
// real PointLights is re-targeted every frame onto the emitters that matter
// from where the camera stands. Keeping the pool size constant is what avoids
// a shader recompile storm: three.js rebuilds every program whenever the
// number of visible lights changes.
const NIGHT_POOL_SIZE = 8;
const nightEmitters = [];
function addNightLight(x, y, z, color, intensity, distance, decay = 1.8) {
  const e = {
    pos: new THREE.Vector3(x, y, z),
    color: new THREE.Color(color),
    base: intensity,
    intensity,
    distance,
    decay,
    key: 0,
    active: false,
  };
  nightEmitters.push(e);
  return e;
}

const nightPool = [];
for (let i = 0; i < NIGHT_POOL_SIZE; i++) {
  const light = new THREE.PointLight(0xffffff, 0, 10, 1.8);
  nightGroup.add(light);
  nightPool.push({ light, emitter: null, fade: 0 });
}

const _nightCam = new THREE.Vector3();
let nightSelectTimer = 0;
function updateNightLights(dt) {
  if (!nightGroup.visible) return;
  camera.getWorldPosition(_nightCam);

  nightSelectTimer -= dt;
  if (nightSelectTimer <= 0) {
    nightSelectTimer = 0.1;
    // Rank by signed distance to each source's sphere of influence, so a candle
    // you are standing next to outranks the pagoda floodlight until you get
    // near the pagoda. Sources beyond their own reach light nothing visible;
    // their additive glow sprites keep carrying them at a distance.
    for (const e of nightEmitters) e.key = e.pos.distanceTo(_nightCam) - e.distance * 1.15;
    nightEmitters.sort((a, b) => a.key - b.key);
    for (let i = 0; i < nightEmitters.length; i++) nightEmitters[i].active = i < NIGHT_POOL_SIZE;

    // Emitters that stay in range keep the slot they already hold, so only the
    // genuinely new ones have to fade in.
    const held = new Set();
    for (const slot of nightPool) {
      if (slot.emitter && slot.emitter.active) held.add(slot.emitter);
      else slot.emitter = null;
    }
    let next = 0;
    for (const slot of nightPool) {
      if (slot.emitter) continue;
      while (next < nightEmitters.length
        && (!nightEmitters[next].active || held.has(nightEmitters[next]))) next++;
      if (next >= nightEmitters.length) break;
      slot.emitter = nightEmitters[next];
      slot.fade = 0;
      held.add(nightEmitters[next]);
      next++;
    }
  }

  for (const slot of nightPool) {
    if (!slot.emitter) { slot.light.intensity = 0; continue; }
    slot.fade = Math.min(1, slot.fade + dt * 3.5);
    slot.light.position.copy(slot.emitter.pos);
    slot.light.color.copy(slot.emitter.color);
    slot.light.distance = slot.emitter.distance;
    slot.light.decay = slot.emitter.decay;
    slot.light.intensity = slot.emitter.intensity * slot.fade;
  }
}

// Stone lanterns: a candle in every hibukuro, lighting the sando warm and low.
const sandoCandleLights = [];
{
  const n = stoneLanternSpots.length;
  const discGeo = new THREE.PlaneGeometry(2.6, 2.6).rotateX(-Math.PI / 2);
  const discMat = new THREE.MeshBasicMaterial({
    map: glowTex,
    color: 0xb83a0e,
    transparent: true,
    opacity: 0.4,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const lanternDiscMesh = new THREE.InstancedMesh(discGeo, discMat, n);

  const dishMesh = new THREE.InstancedMesh(G.cyl, M.brassBell, n);
  const waxMesh = new THREE.InstancedMesh(G.cyl, M.candleWax, n);
  const flameGeo = new THREE.ConeGeometry(0.03, 0.14, 8);
  const flameMesh = new THREE.InstancedMesh(flameGeo, M.candleFlame, n);

  const haloGeo = new THREE.PlaneGeometry(0.62, 0.78);
  const haloMat = new THREE.MeshBasicMaterial({
    map: glowTex,
    color: 0xc44812,
    transparent: true,
    opacity: 0.7,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const haloMesh = new THREE.InstancedMesh(haloGeo, haloMat, n);

  const _m = new THREE.Matrix4(), _p = new THREE.Vector3();
  const _q = new THREE.Quaternion(), _s = new THREE.Vector3();
  const _qy = new THREE.Quaternion();
  stoneLanternSpots.forEach((sp, i) => {
    const S = sp.scale;
    const r = 3.1 * S;
    _p.set(sp.x, sp.y + 0.04, sp.z);
    _q.identity();
    _s.set(r, 1, r);
    _m.compose(_p, _q, _s);
    lanternDiscMesh.setMatrixAt(i, _m);

    // Brass dish on the chūdai
    _p.set(sp.x, sp.y + 1.96 * S, sp.z);
    _s.set(0.17 * S, 0.035 * S, 0.17 * S);
    _m.compose(_p, _q, _s);
    dishMesh.setMatrixAt(i, _m);

    // White wax
    _p.set(sp.x, sp.y + 2.12 * S, sp.z);
    _s.set(0.068 * S, 0.26 * S, 0.068 * S);
    _m.compose(_p, _q, _s);
    waxMesh.setMatrixAt(i, _m);

    // Flame
    _p.set(sp.x, sp.y + 2.30 * S, sp.z);
    _s.set(S, S, S);
    _m.compose(_p, _q, _s);
    flameMesh.setMatrixAt(i, _m);

    // Halo facing the sando so the flame reads from the path
    _qy.setFromAxisAngle(_p.set(0, 1, 0), sp.x > 0 ? -Math.PI / 2 : Math.PI / 2);
    _p.set(sp.x, sp.y + 2.32 * S, sp.z);
    _s.set(S, S, S);
    _m.compose(_p, _qy, _s);
    haloMesh.setMatrixAt(i, _m);

    const toward = sp.x > 0 ? -0.3 : 0.3;
    const emitter = addNightLight(
      sp.x + toward, sp.y + 2.28 * S, sp.z,
      0xb83a0e, 6.4, 9.2, 1.9
    );
    sandoCandleLights.push({
      emitter,
      base: 6.4,
      phase: i * 0.73,
      speed: 5.4 + (i % 5) * 0.85,
    });
  });
  lanternDiscMesh.instanceMatrix.needsUpdate = true;
  dishMesh.instanceMatrix.needsUpdate = true;
  waxMesh.instanceMatrix.needsUpdate = true;
  flameMesh.instanceMatrix.needsUpdate = true;
  haloMesh.instanceMatrix.needsUpdate = true;
  nightGroup.add(lanternDiscMesh, dishMesh, waxMesh, flameMesh, haloMesh);
}

// Altar & Saisen-bako warm radiance
addNightLight(0, 2.6, 88.5, 0xff8824, 24, 15);
addNightLight(0, 3.8, 92.0, 0xff9430, 20, 16);

// Chōzuya Water Pavilion
addNightLight(-9.5, 1.8, 12, 0xff9a40, 16, 12);

// Taiko-bashi Bridge Piers & Waters
addNightLight(0, 3.4, 24, 0xff7c20, 18, 14);
addNightLight(0, 3.4, 40, 0xff7c20, 18, 14);

// Five-Story Pagoda
addNightLight(-26, 2.8, 82, 0xff8c2c, 22, 18);

// Zen Rock Garden
addNightLight(28, 2.2, 87.8, 0xff9a38, 14, 12);

// Grand Torii Gate Dramatic Uplights
addNightLight(-3.6, 0.4, -22, 0xff3814, 28, 18);
addNightLight(3.6, 0.4, -22, 0xff3814, 28, 18);

// Sky Palace wing cupolas. The rotunda's own chandelier is a permanent light
// rather than a pooled emitter — it has to carry the walled hall by day too.
addNightLight(44.5, 183.1, 7, 0xffc884, 17, 13);
addNightLight(65.5, 183.1, 7, 0xffc884, 17, 13);

// ---------------------------------------------------------------------------
// Floating Sky Lanterns (Tōrō Nagashi / Bougies dans des petits cartons qui s'envolent)
// ---------------------------------------------------------------------------
const SKY_LANTERN_COUNT = 85;
const skyBoxGeo = new THREE.BoxGeometry(0.44, 0.62, 0.44);
const skyBoxMesh = new THREE.InstancedMesh(skyBoxGeo, M.skyLanternPaper, SKY_LANTERN_COUNT);

const skyFlameGeo = new THREE.SphereGeometry(0.12, 8, 8);
const skyFlameMesh = new THREE.InstancedMesh(skyFlameGeo, M.candleFlame, SKY_LANTERN_COUNT);

const skyHaloGeo = new THREE.PlaneGeometry(1.6, 1.6);
const skyHaloMat = new THREE.MeshBasicMaterial({
  map: glowTex,
  color: 0xff9922,
  transparent: true,
  opacity: 0.55,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
  side: THREE.DoubleSide,
});
const skyHaloMesh = new THREE.InstancedMesh(skyHaloGeo, skyHaloMat, SKY_LANTERN_COUNT);

const skyLanternData = [];
{
  const _m = new THREE.Matrix4(), _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3();
  for (let i = 0; i < SKY_LANTERN_COUNT; i++) {
    const x = (Math.random() - 0.5) * 140;
    const y = 1.0 + Math.random() * 56;
    const z = (Math.random() - 0.5) * 170 + 40;
    const speedY = 0.5 + Math.random() * 0.7;
    const speedX = 0.15 + (Math.random() - 0.5) * 0.4;
    const speedZ = 0.12 + (Math.random() - 0.5) * 0.35;
    const swayAmp = 0.08 + Math.random() * 0.14;
    const swayFreq = 1.0 + Math.random() * 1.6;
    const phase = Math.random() * Math.PI * 2;
    const rotY = Math.random() * Math.PI * 2;
    const rotSpeed = (Math.random() - 0.5) * 0.35;
    const scale = 0.85 + Math.random() * 0.45;

    skyLanternData.push({ x, y, z, speedY, speedX, speedZ, swayAmp, swayFreq, phase, rotY, rotSpeed, scale });

    _p.set(x, y, z);
    _e.set(0, rotY, 0);
    _q.setFromEuler(_e);
    _s.set(scale, scale, scale);
    _m.compose(_p, _q, _s);
    skyBoxMesh.setMatrixAt(i, _m);
    skyFlameMesh.setMatrixAt(i, _m);
    skyHaloMesh.setMatrixAt(i, _m);
  }
  skyBoxMesh.instanceMatrix.needsUpdate = true;
  skyFlameMesh.instanceMatrix.needsUpdate = true;
  skyHaloMesh.instanceMatrix.needsUpdate = true;
  nightGroup.add(skyBoxMesh, skyFlameMesh, skyHaloMesh);
}

function tickSkyLanterns(dt, t) {
  if (!nightGroup.visible) return;
  const _m = new THREE.Matrix4(), _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3();
  for (let i = 0; i < SKY_LANTERN_COUNT; i++) {
    const p = skyLanternData[i];
    p.y += p.speedY * dt;
    p.x += (p.speedX + Math.sin(t * p.swayFreq + p.phase) * p.swayAmp) * dt;
    p.z += (p.speedZ + Math.cos(t * p.swayFreq * 0.8 + p.phase) * p.swayAmp) * dt;
    p.rotY += p.rotSpeed * dt;

    if (p.y > 60) {
      p.y = 0.8 + Math.random() * 2.5;
      p.x = (Math.random() - 0.5) * 120;
      p.z = (Math.random() - 0.5) * 140 + 40;
    }

    _p.set(p.x, p.y, p.z);
    _e.set(Math.sin(t * p.swayFreq + p.phase) * 0.1, p.rotY, Math.cos(t * p.swayFreq + p.phase) * 0.1);
    _q.setFromEuler(_e);
    _s.set(p.scale, p.scale, p.scale);
    _m.compose(_p, _q, _s);
    skyBoxMesh.setMatrixAt(i, _m);
    skyFlameMesh.setMatrixAt(i, _m);

    // Halo faces camera roughly
    _s.set(p.scale * 1.5, p.scale * 1.5, p.scale * 1.5);
    _m.compose(_p, _q, _s);
    skyHaloMesh.setMatrixAt(i, _m);
  }
  skyBoxMesh.instanceMatrix.needsUpdate = true;
  skyFlameMesh.instanceMatrix.needsUpdate = true;
  skyHaloMesh.instanceMatrix.needsUpdate = true;
}

// ---------------------------------------------------------------------------
// Floating Water Lanterns on the Sacred Koi Pond (Shōrō Nagashi)
// ---------------------------------------------------------------------------
const WATER_LANTERN_COUNT = 18;
const waterBoxGeo = new THREE.BoxGeometry(0.38, 0.46, 0.38);
const waterBoxMesh = new THREE.InstancedMesh(waterBoxGeo, M.skyLanternPaper, WATER_LANTERN_COUNT);
const waterFloatGeo = new THREE.BoxGeometry(0.52, 0.06, 0.52);
const waterFloatMesh = new THREE.InstancedMesh(waterFloatGeo, M.waterLanternWood, WATER_LANTERN_COUNT);

const waterLanternData = [];
{
  const _m = new THREE.Matrix4(), _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(1, 1, 1);
  for (let i = 0; i < WATER_LANTERN_COUNT; i++) {
    const angle = (i / WATER_LANTERN_COUNT) * Math.PI * 2 + Math.random() * 0.3;
    const rx = 4.0 + Math.random() * 11.0;
    const rz = 3.0 + Math.random() * 7.5;
    const origX = (i % 2 === 0 ? 1 : -1) * rx;
    const origZ = POND_Z + Math.sin(angle) * rz;
    const phase = Math.random() * Math.PI * 2;
    const rotSpeed = (Math.random() - 0.5) * 0.2;
    waterLanternData.push({ origX, origZ, x: origX, z: origZ, phase, rotSpeed, rotY: Math.random() * Math.PI * 2 });

    _p.set(origX, POND_WATER_Y + 0.26, origZ);
    _m.compose(_p, _q, _s);
    waterBoxMesh.setMatrixAt(i, _m);

    _p.set(origX, POND_WATER_Y + 0.03, origZ);
    _m.compose(_p, _q, _s);
    waterFloatMesh.setMatrixAt(i, _m);
  }
  waterBoxMesh.instanceMatrix.needsUpdate = true;
  waterFloatMesh.instanceMatrix.needsUpdate = true;
  nightGroup.add(waterBoxMesh, waterFloatMesh);
}

function tickWaterLanterns(dt, t) {
  if (!nightGroup.visible) return;
  const _m = new THREE.Matrix4(), _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(1, 1, 1);
  for (let i = 0; i < WATER_LANTERN_COUNT; i++) {
    const p = waterLanternData[i];
    p.rotY += p.rotSpeed * dt;
    const curX = p.origX + Math.sin(t * 0.4 + p.phase) * 1.2;
    const curZ = p.origZ + Math.cos(t * 0.35 + p.phase) * 1.2;
    const curY = POND_WATER_Y + Math.sin(t * 1.6 + p.phase) * 0.015;

    _p.set(curX, curY + 0.26, curZ);
    _e.set(Math.sin(t * 1.5 + p.phase) * 0.04, p.rotY, Math.cos(t * 1.5 + p.phase) * 0.04);
    _q.setFromEuler(_e);
    _m.compose(_p, _q, _s);
    waterBoxMesh.setMatrixAt(i, _m);

    _p.set(curX, curY + 0.03, curZ);
    _m.compose(_p, _q, _s);
    waterFloatMesh.setMatrixAt(i, _m);
  }
  waterBoxMesh.instanceMatrix.needsUpdate = true;
  waterFloatMesh.instanceMatrix.needsUpdate = true;
}

// ---------------------------------------------------------------------------
// Fireflies Particle Swarm (Lucioles / Hotaru 蛍)
// ---------------------------------------------------------------------------
const FIREFLY_COUNT = 240;
const fireflyGeo = new THREE.PlaneGeometry(0.36, 0.36);
const fireflyMat = new THREE.MeshBasicMaterial({
  map: fireflyTex,
  color: 0xd4ff44,
  transparent: true,
  opacity: 0.95,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
  side: THREE.DoubleSide,
});
const fireflyMesh = new THREE.InstancedMesh(fireflyGeo, fireflyMat, FIREFLY_COUNT);
const fireflyData = [];
{
  const _m = new THREE.Matrix4(), _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3();
  const clusters = [
    { cx: 28, cy: 1.2, cz: 78, rx: 11, rz: 9, h: 3.5, weight: 0.25 },     // Zen garden
    { cx: 0, cy: 0.9, cz: 32, rx: 18, rz: 12, h: 3.0, weight: 0.25 },     // Sacred Koi pond
    { cx: -45, cy: 1.5, cz: 42, rx: 12, rz: 12, h: 5.5, weight: 0.18 },   // West Bamboo grove
    { cx: 45, cy: 1.5, cz: 45, rx: 12, rz: 12, h: 5.5, weight: 0.18 },    // East Bamboo grove
    { cx: 0, cy: 1.8, cz: 88, rx: 8, rz: 8, h: 3.2, weight: 0.14 },       // Haiden Altar steps
  ];

  for (let i = 0; i < FIREFLY_COUNT; i++) {
    const c = clusters[i % clusters.length];
    const angle = Math.random() * Math.PI * 2;
    const r = Math.sqrt(Math.random());
    const x = c.cx + Math.cos(angle) * (r * c.rx);
    const z = c.cz + Math.sin(angle) * (r * c.rz);
    const y = c.cy + Math.random() * c.h;
    const speed = 0.4 + Math.random() * 0.6;
    const blinkFreq = 1.8 + Math.random() * 3.2;
    const phase = Math.random() * Math.PI * 2;
    const baseScale = 0.75 + Math.random() * 0.55;
    const driftX = (Math.random() - 0.5) * 2;
    const driftZ = (Math.random() - 0.5) * 2;
    fireflyData.push({ x, y, z, origX: x, origY: y, origZ: z, speed, blinkFreq, phase, baseScale, driftX, driftZ });

    _p.set(x, y, z);
    _s.set(baseScale, baseScale, baseScale);
    _m.compose(_p, _q, _s);
    fireflyMesh.setMatrixAt(i, _m);
  }
  fireflyMesh.instanceMatrix.needsUpdate = true;
  nightGroup.add(fireflyMesh);
}

function tickFireflies(dt, t) {
  if (!nightGroup.visible) return;
  const _m = new THREE.Matrix4(), _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3();
  for (let i = 0; i < FIREFLY_COUNT; i++) {
    const f = fireflyData[i];
    const curX = f.origX + Math.sin(t * f.speed + f.phase) * 1.8 + Math.sin(t * 0.5 + f.driftX) * 0.8;
    const curY = f.origY + Math.sin(t * (f.speed * 1.3) + f.phase) * 0.6 + Math.cos(t * 0.8 + f.phase) * 0.3;
    const curZ = f.origZ + Math.cos(t * (f.speed * 0.9) + f.phase) * 1.8 + Math.cos(t * 0.4 + f.driftZ) * 0.8;

    // Bioluminescent pulsation
    const pulse = Math.pow(Math.max(0, Math.sin(t * f.blinkFreq + f.phase)), 4.0);
    const scale = f.baseScale * (0.08 + pulse * 1.35);

    _p.set(curX, Math.max(0.4, curY), curZ);
    _s.set(scale, scale, scale);
    _m.compose(_p, _q, _s);
    fireflyMesh.setMatrixAt(i, _m);
  }
  fireflyMesh.instanceMatrix.needsUpdate = true;
}

// ---------------------------------------------------------------------------
// Day & Night Cycle Management
// ---------------------------------------------------------------------------
function syncWorldTimeButtons(night) {
  document.querySelectorAll('.tt-btn').forEach(btn =>
    btn.classList.toggle('active', night ? btn.dataset.time === 'night' : btn.dataset.time === 'day'));
}

const DAY_LIGHT_STATE = {
  sky: 0xcfe0ea,
  fogColor: 0xd8e6ee,
  fogNear: 120,
  fogFar: 750,
  exposure: 1.05,
  hemi: { sky: 0xe4f2ff, ground: 0x7a8366, intensity: 0.85 },
  sun: { intensity: 2.7, visible: true },
  envIntensity: 0.65,
  lanternGlow: { emissive: 0xffaa44, emissiveIntensity: 2.4 },
  chandelierGlow: { emissive: 0xffb45c, emissiveIntensity: 0.9 },
  candleWax: { emissive: 0x000000, emissiveIntensity: 0 },
  water: { color: 0x234a42, roughness: 0.08, opacity: 0.88 },
  // Daylight only wants a whisper of bloom on the brightest speculars.
  bloom: { strength: 0.22, radius: 0.55, threshold: 0.92 },
};

const NIGHT_LIGHT_STATE = {
  sky: 0x050814,
  fogColor: 0x070e1c,
  fogNear: 45,
  fogFar: 580,
  exposure: 0.94,
  hemi: { sky: 0x182844, ground: 0x080c14, intensity: 0.45 },
  moon: { intensity: 0.85, visible: true },
  envIntensity: 0.20,
  lanternGlow: { emissive: 0xff8820, emissiveIntensity: 5.8 },
  chandelierGlow: { emissive: 0xffa049, emissiveIntensity: 1.25 },
  candleWax: { emissive: 0x5a1c08, emissiveIntensity: 0.55 },
  water: { color: 0x0c1e28, roughness: 0.04, opacity: 0.92 },
  // Flames, chōchin and fireflies should bleed into the air, but the threshold
  // stays above the lit shoji panels — catch those too and the haiden washes
  // out into a white slab at close range.
  bloom: { strength: 0.62, radius: 0.72, threshold: 0.75 },
};

function setShintoTime(night, smooth = false) {
  window.__nightMode = night;
  syncWorldTimeButtons(night);

  const applyState = () => {
    scene.background.setHex(night ? NIGHT_LIGHT_STATE.sky : DAY_LIGHT_STATE.sky);
    scene.fog.color.setHex(night ? NIGHT_LIGHT_STATE.fogColor : DAY_LIGHT_STATE.fogColor);
    scene.fog.near = night ? NIGHT_LIGHT_STATE.fogNear : DAY_LIGHT_STATE.fogNear;
    scene.fog.far = night ? NIGHT_LIGHT_STATE.fogFar : DAY_LIGHT_STATE.fogFar;
    renderer.toneMappingExposure = night ? NIGHT_LIGHT_STATE.exposure : DAY_LIGHT_STATE.exposure;

    sun.visible = !night;
    sun.intensity = night ? 0 : DAY_LIGHT_STATE.sun.intensity;
    moon.visible = night;
    moon.intensity = night ? NIGHT_LIGHT_STATE.moon.intensity : 0;

    hemi.color.setHex(night ? NIGHT_LIGHT_STATE.hemi.sky : DAY_LIGHT_STATE.hemi.sky);
    hemi.groundColor.setHex(night ? NIGHT_LIGHT_STATE.hemi.ground : DAY_LIGHT_STATE.hemi.ground);
    hemi.intensity = night ? NIGHT_LIGHT_STATE.hemi.intensity : DAY_LIGHT_STATE.hemi.intensity;
    scene.environmentIntensity = night ? NIGHT_LIGHT_STATE.envIntensity : DAY_LIGHT_STATE.envIntensity;

    // The palace chandelier stays lit around the clock — the hall is walled now
    // — but it has to carry the room outright once the sun is down.
    if (palaceChandelierLight) palaceChandelierLight.intensity = night ? 26 : 20;

    M.lanternGlow.emissive.setHex(night ? NIGHT_LIGHT_STATE.lanternGlow.emissive : DAY_LIGHT_STATE.lanternGlow.emissive);
    M.lanternGlow.emissiveIntensity = night ? NIGHT_LIGHT_STATE.lanternGlow.emissiveIntensity : DAY_LIGHT_STATE.lanternGlow.emissiveIntensity;
    M.chandelierGlow.emissive.setHex(night ? NIGHT_LIGHT_STATE.chandelierGlow.emissive : DAY_LIGHT_STATE.chandelierGlow.emissive);
    M.chandelierGlow.emissiveIntensity = night ? NIGHT_LIGHT_STATE.chandelierGlow.emissiveIntensity : DAY_LIGHT_STATE.chandelierGlow.emissiveIntensity;
    M.candleWax.emissive.setHex(night ? NIGHT_LIGHT_STATE.candleWax.emissive : DAY_LIGHT_STATE.candleWax.emissive);
    M.candleWax.emissiveIntensity = night ? NIGHT_LIGHT_STATE.candleWax.emissiveIntensity : DAY_LIGHT_STATE.candleWax.emissiveIntensity;
    M.shojiPaper.emissive = night ? new THREE.Color(0xff8833) : new THREE.Color(0x000000);
    M.shojiPaper.emissiveIntensity = night ? 0.35 : 0;
    M.water.color.setHex(night ? NIGHT_LIGHT_STATE.water.color : DAY_LIGHT_STATE.water.color);
    M.water.roughness = night ? NIGHT_LIGHT_STATE.water.roughness : DAY_LIGHT_STATE.water.roughness;

    applySky(night ? NIGHT_SKY : DAY_SKY);

    const b = night ? NIGHT_LIGHT_STATE.bloom : DAY_LIGHT_STATE.bloom;
    bloom.strength = b.strength;
    bloom.radius = b.radius;
    bloom.threshold = b.threshold;

    nightGroup.visible = night;
  };

  if (smooth && fadeEl) {
    fadeEl.style.opacity = '1';
    setTimeout(() => {
      applyState();
      fadeEl.style.opacity = '0';
    }, 280);
  } else {
    applyState();
  }
}

// ---------------------------------------------------------------------------
// 16. Flush Kits & Collision World
// ---------------------------------------------------------------------------
flushKits();

// Sky clouds are scenery, not architecture. Left in `world` each puff handed
// the collision pass a 30 m box whose top sits ~0.9 m above the summit plaza —
// over the half-metre the ground snap steps onto — so the north half of the
// palace, throne included, was walled off by fog. `scenery` is drawn but never
// swept for AABBs, which is where the leaf cards already live.
for (const im of [...world.children]) {
  if (im.material === M.cloudFluff) scenery.add(im);
}

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
  // Tee and trousers are the nagajuban under the kimono, so they are the
  // undyed silk white one shows at the collar — not a pink bib. The trousers
  // are pitched at the silk's own ground and left matt: no skirt keeps a
  // sprinting leg in for the whole stride, so what matters is that the moment
  // it does show it reads as the under-layer rather than as a white flash.
  if (n.includes('tshirt')) { m.map = null; m.color.set('#f7f2e8'); }
  else if (n.includes('pants')) {
    m.map = null;
    m.color.set('#e3d9c3');
    m.roughness = 0.92;
    m.metalness = 0;
  }
  else if (n.includes('hat') && !n.includes('that')) { m.map = null; m.color.set('#fff4b0'); }
  else if (n.includes('shoes')) { m.map = null; m.color.set('#e7dfcd'); }
  else if (n.includes('backpack')) { m.map = null; m.color.set('#ffe27a'); }
  m.needsUpdate = true;
  return m;
}

let player = null;
// Parking / lawn sit at 0.1. The sando, bridge, shrine deck and a few
// other slabs stand proud of that — a constant groundY left the feet
// buried in the raised central alley (and anywhere else the stone is higher).
const BASE_GROUND = 0.1;
function groundFn(x, z, yFrom, feetY) {
  const curY = feetY ?? (ctrl ? ctrl.pos.y : 0);

  // Celestial Tower & Cloud Sanctuary
  const TOWER_X = 55, TOWER_Z = 15;
  const distTower = Math.hypot(x - TOWER_X, z - TOWER_Z);

  // 1. Summit Floating Sanctuary (Altitude ~180m)
  if (curY > 120) {
    if (distTower <= 26.5) {
      // Throne dais inside the palace
      if (Math.hypot(x - TOWER_X, z - (TOWER_Z - 11.2)) <= 2.5) {
        return 180.50;
      }
      // Entire checkerboard plaza, esplanade, and palace interior
      return 180.20;
    }
  } else if (curY > 40 && curY <= 120) {
    // 2. Intermediate Cloud Pagoda Station (Altitude 85m)
    if (distTower <= 9.5) {
      return 85.0;
    }
  }

  // 3. Base Tower Plaza Plinth (Ground level)
  if (distTower <= 9.0) {
    return 0.85;
  }

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
  // Timber crossing (flat approaches + cosine drum)
  if (Math.abs(x - BRIDGE_X) <= BRIDGE_W / 2 &&
      z >= SOUTH_WOOD_Z0 && z <= NORTH_WOOD_Z1) {
    return crossingTop(z);
  }
  // Stone piers at the pond banks
  if (Math.abs(x - BRIDGE_X) <= LANDING_W / 2) {
    if (Math.abs(z - SOUTH_LAND_Z) <= LANDING_D / 2 ||
        Math.abs(z - NORTH_LAND_Z) <= LANDING_D / 2) {
      return DECK_TOP;
    }
  }
  // Two-step climb from the sando onto each pier
  if (Math.abs(x - SANDO_X) <= SANDO_W / 2 + 0.12) {
    if (Math.abs(z - SOUTH_STEP0_Z) <= STEP_D / 2 + 0.04 ||
        Math.abs(z - NORTH_STEP0_Z) <= STEP_D / 2 + 0.04) {
      return STEP0_TOP;
    }
    if (Math.abs(z - SOUTH_STEP1_Z) <= STEP_D / 2 + 0.04 ||
        Math.abs(z - NORTH_STEP1_Z) <= STEP_D / 2 + 0.04) {
      return STEP1_TOP;
    }
  }
  // Chōzuya paved floor — buildChozuya(-9.5, 0.15, 12)
  if (Math.abs(x + 9.5) <= 3 && Math.abs(z - 12) <= 2.5) return 0.45;
  // Zen garden viewing platform
  if (Math.abs(x - ZEN_X) <= 4 && Math.abs(z - ZEN_DECK_Z) <= 1.6) return ZEN_DECK_TOP;
  // Raked sand bed — walk across the lawn and onto the white park
  if (Math.abs(x - ZEN_X) <= ZEN_SAND_HALF_W && Math.abs(z - ZEN_Z) <= ZEN_SAND_HALF_D) {
    return ZEN_SAND_TOP;
  }
  // Split sando (does not cross the pond)
  if (Math.abs(x - SANDO_X) <= SANDO_W / 2 &&
      ((z >= SANDO_AXIS_Z0 && z <= SANDO_SOUTH_Z1) ||
       (z >= SANDO_NORTH_Z0 && z <= SANDO_AXIS_Z1))) {
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
let choosingFurniturePrompt = false;
let choosingKneelMode = false;
let kneelModeRequested = null;
let travelInProgress = false;
let releasedSpot = null;
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
  kneelModeRequested = null;
  const isKneel = spot?.type === 'kneel';
  const showSingle = Boolean(spot) && !isKneel;

  furniturePrompt.textContent = showSingle ? (spot.label || "S'asseoir") : '';
  furniturePrompt.classList.toggle('show', showSingle);
  furniturePrompt.setAttribute('aria-hidden', showSingle ? 'false' : 'true');

  if (kneelPromptGroup) {
    kneelPromptGroup.classList.toggle('show', isKneel);
    kneelPromptGroup.setAttribute('aria-hidden', isKneel ? 'false' : 'true');
  }

  const stealLock = (showSingle && !spot.keepLock) || isKneel;
  choosingFurniturePrompt = showSingle;
  choosingKneelMode = isKneel;

  if (stealLock) {
    if (document.pointerLockElement === renderer.domElement) document.exitPointerLock?.();
  } else if (started && !paused && !showSingle && !isKneel) {
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

function requestKneelMode(mode, event) {
  event?.stopPropagation();
  if (promptedFurniture?.type !== 'kneel') return;
  kneelModeRequested = mode;
  choosingKneelMode = false;
  requestGamePointerLock();
}
kneelDayPrompt?.addEventListener('click', event => requestKneelMode('day', event));
kneelNightPrompt?.addEventListener('click', event => requestKneelMode('night', event));

renderer.domElement.addEventListener('click', () => {
  if (started && !paused && !choosingFurniturePrompt && !choosingKneelMode
    && document.pointerLockElement !== renderer.domElement) {
    requestGamePointerLock();
  }
});

function enterFurnitureInteraction(spot, wakeMode = null) {
  setFurniturePrompt(null);
  activeFurnitureInteraction = {
    ...spot,
    source: spot,
    returnPosition: ctrl.pos.clone(),
    readyToExit: false,
    wakeMode,
  };
  ctrl.pos.set(spot.x, spot.y, spot.z);
  ctrl.prevY = spot.y;
  ctrl.vel.set(0, 0, 0);
  ctrl.mode = spot.type;
  ctrl.webOn = false;
  if (Number.isFinite(spot.yaw)) {
    input.yaw = spot.type === 'kneel' ? Math.PI : spot.yaw + Math.PI;
    input.pitch = spot.type === 'kneel' ? 0.05 : 0;
  }
}

function leaveFurnitureInteraction() {
  const interaction = activeFurnitureInteraction;
  if (!interaction) return;
  ctrl.pos.copy(interaction.returnPosition || parkingSpawnPoint);
  ctrl.prevY = ctrl.pos.y;
  ctrl.vel.set(0, 0, 0);
  ctrl.mode = 'ground';
  if (interaction.type === 'kneel' && interaction.wakeMode) {
    setShintoTime(interaction.wakeMode === 'night', true);
    const msg = document.getElementById('msg');
    if (msg) {
      msg.textContent = interaction.wakeMode === 'night'
        ? "Nuit sacrée — Les lanternes et bougies s'illuminent sous les étoiles"
        : "Aube sereine — Le sanctuaire s'éveille dans la lumière du matin";
      msg.style.opacity = '1';
      setTimeout(() => { if (msg) msg.style.opacity = '0'; }, 4000);
    }
  }
  releasedSpot = interaction.source;
  activeFurnitureInteraction = null;
  furnitureInteractionCooldown = 0.65;
}

function updateFurnitureInteraction(dt) {
  if (travelInProgress) return true;
  if (furnitureInteractionCooldown > 0) furnitureInteractionCooldown -= dt;
  if (activeFurnitureInteraction) {
    setFurniturePrompt(null);
    activeFurnitureInteraction.time = (activeFurnitureInteraction.time || 0) + dt;
    if (input.pressed('KeyR')) {
      if (activeFurnitureInteraction.type === 'kneel' && activeFurnitureInteraction.wakeMode) {
        setShintoTime(activeFurnitureInteraction.wakeMode === 'night', false);
      }
      activeFurnitureInteraction = null;
      furnitureInteractionCooldown = 0.65;
      ctrl.rescueTo(parkingSpawnPoint);
      return true;
    }
    const inputHeld = interactionExitKeys.some(code => input.down(code) || input.pressed(code)) || input.pressed('LMB');
    if (!inputHeld && activeFurnitureInteraction.time > 0.1) {
      activeFurnitureInteraction.readyToExit = true;
    }
    if (inputHeld && (activeFurnitureInteraction.readyToExit || activeFurnitureInteraction.time > 0.4)) {
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
    if (Math.abs(ctrl.pos.y - spot.approachY) > (spot.type === 'travel' ? 1.4 : (spot.type === 'towerAscent' || spot.type === 'towerDescent' ? 2.5 : (spot.type === 'kneel' ? 1.2 : 0.8)))) continue;
    const distance = distanceToFurniture(spot, ctrl.pos);
    if (distance < (spot.triggerDistance ?? 0.6) && distance < nearestDistance) {
      nearest = spot;
      nearestDistance = distance;
    }
  }
  setFurniturePrompt(nearest);
  if (nearest) {
    if (nearest.type === 'kneel') {
      if (kneelModeRequested) {
        const mode = kneelModeRequested;
        kneelModeRequested = null;
        enterFurnitureInteraction(nearest, mode);
        return true;
      }
    } else if (furnitureActionRequested || input.pressed('LMB') || input.pressed('KeyE')) {
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
      if (nearest.type === 'towerAscent') {
        setFurniturePrompt(null);
        if (fadeEl) {
          fadeEl.style.opacity = '1';
          setTimeout(() => {
            ctrl.rescueTo(new THREE.Vector3(55, 180.20, 24));
            input.yaw = Math.PI; // Face north towards the checkered plaza and white palace
            input.pitch = 0;
            const msg = document.getElementById('msg');
            if (msg) {
              msg.textContent = "Sanctuaire Céleste — Vous atteignez le Palais Blanc au-dessus des nuages";
              msg.style.opacity = '1';
              setTimeout(() => { if (msg) msg.style.opacity = '0'; }, 5000);
            }
            fadeEl.style.opacity = '0';
          }, 450);
        } else {
          ctrl.rescueTo(new THREE.Vector3(55, 180.20, 24));
        }
        furnitureInteractionCooldown = 1.0;
        return true;
      }
      if (nearest.type === 'towerDescent') {
        setFurniturePrompt(null);
        if (fadeEl) {
          fadeEl.style.opacity = '1';
          setTimeout(() => {
            ctrl.rescueTo(new THREE.Vector3(55, 0.85, 26));
            input.yaw = 0;
            input.pitch = 0;
            const msg = document.getElementById('msg');
            if (msg) {
              msg.textContent = "Sanctuaire Shinto — Vous voilà de retour sur Terre";
              msg.style.opacity = '1';
              setTimeout(() => { if (msg) msg.style.opacity = '0'; }, 5000);
            }
            fadeEl.style.opacity = '0';
          }, 450);
        } else {
          ctrl.rescueTo(new THREE.Vector3(55, 0.85, 26));
        }
        furnitureInteractionCooldown = 1.0;
        return true;
      }
      enterFurnitureInteraction(nearest);
    }
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
    // Phase 1 (0 to 3.2s): distant airliner over the Japanese countryside
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
  player.setOutfit({ hat: false, backpack: false, kimono: true });
  player.update({
    dt, mode: ctrl.mode, pos: ctrl.pos, vel: ctrl.vel,
    webOn: ctrl.webOn, webHand: ctrl.webHand, anchor: ctrl.anchor,
    ropeSlack: ctrl.webOn ? Math.max(0, ctrl.pos.distanceTo(ctrl.anchor) - ctrl.ropeLen) : 0,
    posture: activeFurnitureInteraction?.type,
    facingYaw: activeFurnitureInteraction?.yaw,
    floorY: activeFurnitureInteraction?.approachY,
  });
}

function tickSandoCandles(t) {
  if (!nightGroup.visible) return;
  for (const c of sandoCandleLights) {
    const flick = 0.84 + 0.16 * Math.sin(t * c.speed + c.phase)
      + 0.07 * Math.sin(t * c.speed * 2.15 + c.phase * 1.4);
    c.emitter.intensity = c.base * flick;
  }
}

function tickStarTwinkle(dt, t) {
  if (!nightGroup.visible) return;
  const _m = new THREE.Matrix4(), _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3();
  for (let i = 0; i < STAR_COUNT; i++) {
    const st = starData[i];
    const twinkle = 0.55 + 0.45 * Math.sin(t * st.twinkleSpeed + st.phase);
    const s = st.baseScale * twinkle;
    _p.set(st.x, st.y, st.z);
    _s.set(s, s, s);
    _m.compose(_p, _q, _s);
    starMesh.setMatrixAt(i, _m);
  }
  starMesh.instanceMatrix.needsUpdate = true;
}

// Both the shadow box and the night light pool are keyed off where the camera
// ends up this frame, so they are refreshed right before the draw.
function preRender(dt) {
  updateSunShadow(camera.position);
  updateNightLights(dt);
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

  // Animate night visual systems (Sky lanterns, water lanterns, fireflies, stars)
  if (nightGroup.visible) {
    tickSkyLanterns(dt, t);
    tickWaterLanterns(dt, t);
    tickFireflies(dt, t);
    tickStarTwinkle(dt, t);
    tickSandoCandles(t);
  }

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
    preRender(dt);
    composer.render();
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
  preRender(dt);
  composer.render();
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
  setShintoTime(window.__nightMode === true);
  resumePlay();
}
window.__startShinto = startShinto;
startBtn?.addEventListener('click', startShinto);
window.addEventListener('keydown', e => {
  if (!started && (e.code === 'Enter' || e.code === 'Space')) {
    startShinto();
  }
});

// If initial night mode set in query params
if (params.get('night') === '1' || window.__nightMode === true) {
  setShintoTime(true);
}

if (arrivedByFlight || window.__startRequested) {
  startShinto();
}

document.addEventListener('pointerlockchange', () => {
  const hasLock = document.pointerLockElement !== null;
  usedLock = usedLock || hasLock;
  if ((choosingFurniturePrompt || choosingKneelMode) && !hasLock) {
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
  composer.setSize(window.innerWidth, window.innerHeight);
  bloom.setSize(window.innerWidth, window.innerHeight);
});

window.__shinto = {
  THREE, scene, camera, renderer, composer, bloom, sun, world, ctrl, rig, input, player, spawnPoint,
  furnitureInteractions, setShintoTime, enterFurnitureInteraction, leaveFurnitureInteraction,
};
