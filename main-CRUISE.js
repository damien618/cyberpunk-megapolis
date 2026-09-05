import * as THREE from 'three';
import { Player } from './player.js?v=89';
import { harmoniseHair } from './hair.js?v=11';
import { Input } from './input.js';
import { Controller } from './controller.js?v=10';
import { CameraRig } from './cameraRig.js?v=7';
import { buildCityBoxes } from './cityBoxes.js?v=6';
import { loadGuestRig, makeVisitor, rootBoneOf } from './crowd.js?v=57';
import { buildDesertedIsland, createMarineFauna, updateMarineLife } from './marineLife.js?v=1';

console.log('[cruise] starting module evaluation');

// ---------------------------------------------------------------------------
// Croisière de luxe — the ship you board from the ticket office at the end of
// Ocean Front Walk (see the CRUISE_* block in main-BEACH.js).
//
// The beach is BANDS and the villa is a PLAN; a ship is a STACK, and the whole
// map is read by going UP:
//
//   hull / waterline  →  promenade deck (open, wraps the house)
//                     →  lower accommodation deck, stairs from the atrium
//                     →  the house: casino · atrium · gallery · ballroom
//                     →  pool deck (open, on the roof of the house)
//
// Three things are load-bearing:
//
// 1. THE SHIP DOES NOT MOVE. Everything the player stands on is a static
//    InstancedMesh under `world`, because that is what cityBoxes.js turns into
//    the collision world and what groundFn rays. A ship that pitched and rolled
//    would have to move its own floor every frame, and the controller — shared
//    with five other maps — has no contract for a moving floor. The sense of
//    being underway comes from the SEA instead: normals scrolling astern, a
//    bow wave, and a wake fanning out behind. Nothing the player touches moves.
//
// 2. THERE IS NO TERRAIN. groundFn on every other map falls back to an analytic
//    height when no geometry is hit; here a miss means you are over open water,
//    so it returns null and you fall. The railings are real colliding boxes and
//    are what actually keep you aboard; the fall is the backstop, and the
//    animate loop rescues anyone who finds a way past them.
//
// 3. THE WAY OUT IS THE BED. There is no travel car and no gangway you can walk
//    down — the ship is at sea. Cabin 214's bed carries a three-answer prompt,
//    and one of those answers is the only line in this file that leaves the map.
// ---------------------------------------------------------------------------

const app = document.getElementById('app');
const overlay = document.getElementById('overlay');
const startBtn = document.getElementById('startBtn');
const hudMode = document.getElementById('mode');
const hudSpeed = document.getElementById('speed');
const hudHeight = document.getElementById('height');
const furniturePrompt = document.getElementById('furniturePrompt');
const cabinPromptGroup = document.getElementById('cabinPromptGroup');
const cabinBeachPrompt = document.getElementById('cabinBeachPrompt');
const cabinDayPrompt = document.getElementById('cabinDayPrompt');
const cabinNightPrompt = document.getElementById('cabinNightPrompt');

const renderer = new THREE.WebGLRenderer({
  antialias: true,
  powerPreference: 'high-performance',
  logarithmicDepthBuffer: true,
  preserveDrawingBuffer: true,
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.7));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.outputColorSpace = THREE.SRGBColorSpace;
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xbcd6e6);
scene.fog = new THREE.Fog(0xbcd6e6, 260, 1700);

const camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.25, 6000);
camera.position.set(0, 14, 40);

const world = new THREE.Group();
scene.add(world);

// ---------------------------------------------------------------------------
// Sun. The frustum follows the player, as on the beach — the ship alone is
// 190 m long and a shadow map stretched over that plus the sea is mush.
// ---------------------------------------------------------------------------
const SUN_DIST = 220;
const SHADOW_HALF = 54;
const sun = new THREE.DirectionalLight(0xfff4e2, 2.5);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -SHADOW_HALF;
sun.shadow.camera.right = SHADOW_HALF;
sun.shadow.camera.top = SHADOW_HALF;
sun.shadow.camera.bottom = -SHADOW_HALF;
sun.shadow.camera.near = SUN_DIST - 120;
sun.shadow.camera.far = SUN_DIST + 180;
// This map is one enormous flat surface after another — 190 m of deck, then
// another 130 m of deck on top of it — and a flat plane the size of the shadow
// frustum is exactly where acne shows. At 0.04 the promenade was striped with
// blue bands 2.5 m apart, which read as gaps between the deck planks with the
// sea showing through.
sun.shadow.bias = -0.0006;
sun.shadow.normalBias = 0.11;
sun.shadow.camera.updateProjectionMatrix();
scene.add(sun);
sun.target.position.set(0, 0, 0);
scene.add(sun.target);

const sunDir = new THREE.Vector3(-70, 140, 60).normalize();
const SHADOW_TEXEL = (SHADOW_HALF * 2) / sun.shadow.mapSize.x;
function updateSunShadow(focus) {
  if (!sun.visible) return;
  const fx = Math.round(focus.x / SHADOW_TEXEL) * SHADOW_TEXEL;
  const fz = Math.round(focus.z / SHADOW_TEXEL) * SHADOW_TEXEL;
  sun.target.position.set(fx, 0, fz);
  sun.position.set(fx, 0, fz).addScaledVector(sunDir, SUN_DIST);
  sun.target.updateMatrixWorld();
}

const moon = new THREE.DirectionalLight(0x9fc4f2, 0);
moon.position.set(80, 150, -100);
moon.target.position.set(0, 0, 0);
scene.add(moon);
scene.add(moon.target);

const hemi = new THREE.HemisphereLight(0xdcecff, 0x25506e, 0.9);
scene.add(hemi);

// ---------------------------------------------------------------------------
// Sky dome. Same shader as the beach: a gradient with one glow lobe pointed at
// whichever luminary is up. At sea it does more work than anywhere else — half
// of every shot is sky, and the other half is sky reflected.
// ---------------------------------------------------------------------------
const skyUniforms = {
  uHorizon: { value: new THREE.Color(0xdfeaf2) },
  uZenith: { value: new THREE.Color(0x4a83cc) },
  uGlow: { value: new THREE.Color(0xffeccc) },
  uGlowDir: { value: sunDir.clone() },
  uGlowStrength: { value: 0.5 },
  uGlowTightness: { value: 10.0 },
};
const skyDome = new THREE.Mesh(
  new THREE.SphereGeometry(3000, 32, 18),
  new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthTest: false,
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

// Stars, for the night state. One Points cloud on the dome, hidden by day.
const stars = (() => {
  const N = 900;
  const pos = new Float32Array(N * 3);
  let s = 7654321 >>> 0;
  const r = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let i = 0; i < N; i++) {
    // Upper hemisphere only — stars under the horizon are stars in the sea.
    const u = r() * 2 - 1, th = r() * Math.PI * 2;
    const y = Math.abs(u) * 0.92 + 0.06;
    const rad = Math.sqrt(Math.max(0, 1 - y * y));
    pos.set([Math.cos(th) * rad * 2600, y * 2600, Math.sin(th) * rad * 2600], i * 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const p = new THREE.Points(g, new THREE.PointsMaterial({
    color: 0xf2f6ff, size: 7, sizeAttenuation: true, fog: false,
    transparent: true, opacity: 0.9, depthWrite: false,
  }));
  p.frustumCulled = false;
  p.renderOrder = -1;
  p.visible = false;
  scene.add(p);
  return p;
})();

const loader = new THREE.TextureLoader();
const maxAniso = renderer.capabilities.getMaxAnisotropy();
const pmrem = new THREE.PMREMGenerator(renderer);
pmrem.compileEquirectangularShader();

loader.load('./data/env_equirect.png', t => {
  t.mapping = THREE.EquirectangularReflectionMapping;
  t.colorSpace = THREE.SRGBColorSpace;
  scene.environment = pmrem.fromEquirectangular(t).texture;
  scene.environmentIntensity = 0.55;
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
// Character materials. Same treatment the beach gives them, minus the beach:
// aboard ship she is dressed, so the clothing keeps its maps and only the
// packed metallic/smoothness is thrown away (it calls bare skin a metal, and
// under a low sun over water that renders the avatar as a black mirror).
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
// Evening wear. A cruise passenger in a camouflage survival vest is the one
// thing that would give the whole map away, so the packed outfit's maps are
// dropped on the clothing and the colours driven directly.
function tintCruiseStyle(mat, name) {
  const n = name.toLowerCase();
  if (n.includes('tshirt')) {
    mat.map = null;
    mat.color.set('#f7f2e8');          // silk blouse
    mat.roughness = 0.62;
    mat.metalness = 0.02;
  } else if (n.includes('pants')) {
    mat.map = null;
    mat.color.set('#1b2740');          // navy evening trousers
    mat.roughness = 0.86;
    mat.metalness = 0;
  } else if (n.includes('shoes')) {
    mat.map = null;
    mat.color.set('#2a2119');
    mat.roughness = 0.44;
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
  tintCruiseStyle(m, name);
  return m;
}

// ---------------------------------------------------------------------------
// Canvas textures. Almost every surface aboard is a PATTERN — carpet, parquet,
// baize, the funnel's band — and a pattern drawn into a canvas costs one
// texture and no file, which is why the interiors are built this way rather
// than out of the city pack's concrete.
// ---------------------------------------------------------------------------
function canvasTex(W, H, draw, rx = 1, ry = 1) {
  const c = Object.assign(document.createElement('canvas'), { width: W, height: H });
  draw(c.getContext('2d'), W, H);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(rx, ry);
  t.anisotropy = maxAniso;
  return t;
}
function canvasMat(W, H, draw, opts = {}) {
  const c = Object.assign(document.createElement('canvas'), { width: W, height: H });
  draw(c.getContext('2d'), W, H);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = maxAniso;
  return new THREE.MeshStandardMaterial({
    map: t, roughness: opts.roughness ?? 0.82, metalness: opts.metalness ?? 0,
    side: opts.side ?? THREE.DoubleSide,
    emissive: opts.emissive !== undefined ? new THREE.Color(opts.emissive) : new THREE.Color(0x000000),
    emissiveMap: opts.emissive !== undefined ? t : null,
    emissiveIntensity: opts.emissiveIntensity ?? 0,
    transparent: !!opts.transparent, alphaTest: opts.alphaTest ?? 0,
  });
}
function paintText(g, text, x, y, px, fill, stroke) {
  const maxWidth = x * 2 - px * 0.6;
  g.font = `bold ${px}px "Arial Black", Impact, sans-serif`;
  const w = g.measureText(text).width;
  if (w > maxWidth) { px *= maxWidth / w; g.font = `bold ${px}px "Arial Black", Impact, sans-serif`; }
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  if (stroke) { g.lineWidth = Math.max(2, px * 0.08); g.strokeStyle = stroke; g.strokeText(text, x, y); }
  g.fillStyle = fill;
  g.fillText(text, x, y);
}

// Deterministic scatter, for the same reason the beach has one: two loads of
// this map have to be the same map or two screenshots are not comparable.
let seed = 20260831 >>> 0;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
const pick = arr => arr[Math.floor(rnd() * arr.length) % arr.length];

const woodA = tex('./textures/nature/wood_diff.jpg', 3, 1);
const woodN = ntex('./textures/nature/wood_n.jpg', 3, 1);
const palmBarkA = tex('./textures/nature/bark_diff.jpg', 2, 4);
const palmBarkN = ntex('./textures/nature/bark_n.jpg', 2, 4);
const waterN = ntex('./textures/la/water_normal.jpg', 60, 60);
const concreteN = ntex('./textures/CP_Concrete_01_N.webp', 8, 2);

// Teak: the deck of every liner ever built. Planks with darker caulking lines,
// because a flat brown slab 190 m long reads as cardboard from the first step.
//
// The planks are drawn as VERTICAL bands. On a box's top face U maps to world
// X and V to world Z, so vertical bands lay the planks fore-and-aft — which is
// the way a deck is actually laid, and the way that makes the ship look long.
// Drawn as horizontal bands they ran athwartships and the promenade read as a
// boardwalk.
const teakTex = canvasTex(1024, 1024, (g, W, H) => {
  let state = 731;
  const random = () => ((state = (state * 1664525 + 1013904223) >>> 0) / 4294967296);
  const colors = ['#ae895e', '#b7966c', '#c0a079', '#b18e65', '#bda078', '#ac8a62', '#c3a580', '#b99a70'];
  for (let i = 0; i < 8; i++) {
    const x = i * 128;
    g.fillStyle = colors[i]; g.fillRect(x, 0, 128, H);
    for (let k = 0; k < 200; k++) {
      const gx = x + 4 + random() * 120;
      g.strokeStyle = k % 3 ? `rgba(72,44,23,${0.03 + random() * 0.10})` : 'rgba(255,238,202,0.16)';
      g.lineWidth = 0.5 + random();
      g.beginPath(); g.moveTo(gx, 0);
      for (let y = 0; y <= H; y += 32)
        g.lineTo(gx + Math.sin(y * 0.009 + k) * 1.8, y);
      g.stroke();
    }
    // Narrow caulking and staggered end joints; the tile covers 1.44 × 4 m.
    g.fillStyle = '#554b3b'; g.fillRect(x, 0, 2.5, H);
    g.fillStyle = 'rgba(244,223,185,0.4)'; g.fillRect(x + 3, 0, 1, H);
    const joint = ((i * 3) % 8) * 128;
    g.fillStyle = '#665543'; g.fillRect(x, joint, 128, 2);
  }
});
const teakRelief = teakTex.clone();
teakRelief.colorSpace = THREE.NoColorSpace;
teakRelief.needsUpdate = true;

// Ballroom parquet, laid as a chequer of alternating grain.
const parquetTex = canvasTex(256, 256, (g, W, H) => {
  const S = W / 4;
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      const light = (i + j) % 2 === 0;
      g.fillStyle = light ? '#d2ab74' : '#8a5a33';
      g.fillRect(i * S, j * S, S, S);
      g.strokeStyle = 'rgba(60,36,16,0.35)';
      g.lineWidth = 1;
      for (let k = 1; k < 5; k++) {
        g.beginPath();
        if (light) { g.moveTo(i * S, j * S + k * S / 5); g.lineTo(i * S + S, j * S + k * S / 5); }
        else { g.moveTo(i * S + k * S / 5, j * S); g.lineTo(i * S + k * S / 5, j * S + S); }
        g.stroke();
      }
    }
  }
}, 6, 8);

// Ballroom Axminster. The Edwardian saloon carpet the tables stand on: a deep
// crimson ground, a gold medallion in every repeat, and a strapwork of gold
// scroll between them. Repeated 7×13 over a 26 × 44 m room, which puts a
// medallion about every 1.8 m: at 5×9 they were 2.5 m across and the floor
// read as a row of dinner plates rather than as a woven carpet.
const ballCarpetTex = canvasTex(512, 512, (g, W, H) => {
  g.fillStyle = '#4a0d18';
  g.fillRect(0, 0, W, H);
  // A woven tooth over the whole ground, so the crimson is a pile and not paint.
  let state = 20477;
  const random = () => ((state = (state * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let i = 0; i < 5200; i++) {
    const x = random() * W, y = random() * H;
    g.fillStyle = random() < 0.5 ? 'rgba(28,4,10,0.30)' : 'rgba(122,32,48,0.26)';
    g.fillRect(x, y, 2.4, 2.4);
  }
  const S = W / 2;
  const petal = (cx, cy, r, n, phase, fill) => {
    g.fillStyle = fill;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + phase;
      g.beginPath();
      g.ellipse(cx + Math.cos(a) * r, cy + Math.sin(a) * r, r * 0.52, r * 0.28, a, 0, Math.PI * 2);
      g.fill();
    }
  };
  for (let i = 0; i < 2; i++) {
    for (let j = 0; j < 2; j++) {
      const cx = (i + 0.5) * S, cy = (j + 0.5) * S;
      // The medallion: a navy cartouche under a gold rosette.
      const rg = g.createRadialGradient(cx, cy, 6, cx, cy, S * 0.42);
      rg.addColorStop(0, '#6d1526');
      rg.addColorStop(0.62, '#3d0b16');
      rg.addColorStop(1, '#4a0d18');
      g.fillStyle = rg;
      g.beginPath(); g.arc(cx, cy, S * 0.42, 0, Math.PI * 2); g.fill();
      petal(cx, cy, S * 0.27, 8, 0, 'rgba(178,136,52,0.34)');
      petal(cx, cy, S * 0.16, 6, 0.5, 'rgba(208,168,84,0.5)');
      g.fillStyle = 'rgba(228,192,110,0.75)';
      g.beginPath(); g.arc(cx, cy, S * 0.055, 0, Math.PI * 2); g.fill();
      g.strokeStyle = 'rgba(206,164,72,0.5)';
      g.lineWidth = 2.4;
      g.beginPath(); g.arc(cx, cy, S * 0.38, 0, Math.PI * 2); g.stroke();
      g.strokeStyle = 'rgba(206,164,72,0.28)';
      g.lineWidth = 1.4;
      g.beginPath(); g.arc(cx, cy, S * 0.44, 0, Math.PI * 2); g.stroke();
      // Corner scroll, filling the space between four medallions.
      g.strokeStyle = 'rgba(178,140,60,0.26)';
      g.lineWidth = 2;
      for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        g.beginPath();
        g.arc(cx + sx * S * 0.5, cy + sy * S * 0.5, S * 0.17, 0, Math.PI * 2);
        g.stroke();
      }
    }
  }
}, 7, 13);

// Leaded amber glass for the dome and the alcove lights: a lattice of came
// over warm cathedral glass. Drawn once and used emissive, so the dome reads
// as lit from above at every hour instead of as a painted ceiling.
const leadedGlassTex = canvasTex(256, 256, (g, W, H) => {
  g.fillStyle = '#f0cd88';
  g.fillRect(0, 0, W, H);
  for (let i = 0; i < 240; i++) {
    const x = (i * 37) % W, y = (i * 91) % H;
    g.fillStyle = i % 3 ? 'rgba(255,242,206,0.30)' : 'rgba(214,158,74,0.26)';
    g.fillRect(x, y, 22, 22);
  }
  g.strokeStyle = 'rgba(96,72,34,0.72)';
  g.lineWidth = 3;
  for (let k = 0; k <= 8; k++) {
    g.beginPath(); g.moveTo(k * W / 8, 0); g.lineTo(k * W / 8, H); g.stroke();
    g.beginPath(); g.moveTo(0, k * H / 8); g.lineTo(W, k * H / 8); g.stroke();
  }
  g.strokeStyle = 'rgba(96,72,34,0.45)';
  g.lineWidth = 2;
  for (let k = -8; k <= 8; k++) {
    g.beginPath(); g.moveTo(k * W / 8, 0); g.lineTo(k * W / 8 + W, H); g.stroke();
    g.beginPath(); g.moveTo(k * W / 8, H); g.lineTo(k * W / 8 + W, 0); g.stroke();
  }
}, 3, 3);

// Casino carpet: opulent rich burgundy damask with art-deco gold flourishes (Casino Royale style)
const casinoCarpetTex = canvasTex(512, 512, (g, W, H) => {
  g.fillStyle = '#320612';
  g.fillRect(0, 0, W, H);
  const S = W / 4;
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      const cx = (i + 0.5) * S, cy = (j + 0.5) * S;
      const rg = g.createRadialGradient(cx, cy, 4, cx, cy, S * 0.48);
      rg.addColorStop(0, '#560e22');
      rg.addColorStop(0.7, '#3e0818');
      rg.addColorStop(1, '#28040f');
      g.fillStyle = rg;
      g.beginPath();
      g.arc(cx, cy, S * 0.46, 0, Math.PI * 2);
      g.fill();

      g.strokeStyle = 'rgba(218, 165, 32, 0.45)';
      g.lineWidth = 2.2;
      g.beginPath();
      g.arc(cx, cy, S * 0.38, 0, Math.PI * 2);
      g.stroke();

      g.strokeStyle = 'rgba(218, 165, 32, 0.28)';
      g.lineWidth = 1.4;
      g.beginPath();
      g.arc(cx, cy, S * 0.26, 0, Math.PI * 2);
      g.stroke();

      g.fillStyle = 'rgba(230, 185, 75, 0.6)';
      g.beginPath();
      g.moveTo(cx, cy - 14);
      g.lineTo(cx + 4, cy - 4);
      g.lineTo(cx + 14, cy);
      g.lineTo(cx + 4, cy + 4);
      g.lineTo(cx, cy + 14);
      g.lineTo(cx - 4, cy + 4);
      g.lineTo(cx - 14, cy);
      g.lineTo(cx - 4, cy - 4);
      g.closePath();
      g.fill();

      g.strokeStyle = 'rgba(218, 165, 32, 0.18)';
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(i * S, j * S);
      g.lineTo((i + 1) * S, (j + 1) * S);
      g.moveTo((i + 1) * S, j * S);
      g.lineTo(i * S, (j + 1) * S);
      g.stroke();
    }
  }
}, 8, 14);

// European roulette layout felt texture
const rouletteFeltTex = canvasTex(512, 256, (g, W, H) => {
  g.fillStyle = '#0f4827';
  g.fillRect(0, 0, W, H);
  g.strokeStyle = '#e5c158';
  g.lineWidth = 3;
  g.strokeRect(8, 8, W - 16, H - 16);
  g.lineWidth = 1.5;
  g.strokeRect(12, 12, W - 24, H - 24);

  const gx0 = 70, gy0 = 20, gw = 420, gh = 150;
  const colW = gw / 12, rowH = gh / 3;

  g.fillStyle = '#166e37';
  g.fillRect(18, gy0, gx0 - 22, gh);
  g.strokeStyle = '#e5c158';
  g.lineWidth = 2;
  g.strokeRect(18, gy0, gx0 - 22, gh);
  g.fillStyle = '#ffffff';
  g.font = 'bold 28px "Georgia", serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('0', (18 + gx0 - 4) / 2, gy0 + gh / 2);

  const redNums = new Set([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36]);
  for (let c = 0; c < 12; c++) {
    for (let r = 0; r < 3; r++) {
      const num = c * 3 + (3 - r);
      const isRed = redNums.has(num);
      const bx = gx0 + c * colW, by = gy0 + r * rowH;
      g.fillStyle = isRed ? '#9e1818' : '#141416';
      g.fillRect(bx + 1, by + 1, colW - 2, rowH - 2);
      g.strokeStyle = '#e5c158';
      g.lineWidth = 1.5;
      g.strokeRect(bx, by, colW, rowH);
      g.fillStyle = '#ffffff';
      g.font = 'bold 15px "Georgia", serif';
      g.fillText(num.toString(), bx + colW / 2, by + rowH / 2);
    }
  }

  const by0 = gy0 + gh + 6;
  const dozW = gw / 3;
  const dozens = ['1st 12', '2nd 12', '3rd 12'];
  for (let i = 0; i < 3; i++) {
    const dx = gx0 + i * dozW;
    g.fillStyle = '#0a3a1f';
    g.fillRect(dx + 1, by0, dozW - 2, 28);
    g.strokeStyle = '#e5c158';
    g.strokeRect(dx, by0, dozW, 28);
    g.fillStyle = '#e5c158';
    g.font = 'bold 13px "Georgia", serif';
    g.fillText(dozens[i], dx + dozW / 2, by0 + 14);
  }

  const oy0 = by0 + 32;
  const outW = gw / 6;
  const outs = ['1-18', 'EVEN', '♦ RED', '♣ BLK', 'ODD', '19-36'];
  for (let i = 0; i < 6; i++) {
    const ox = gx0 + i * outW;
    g.fillStyle = i === 2 ? '#8a1616' : i === 3 ? '#161618' : '#0a3a1f';
    g.fillRect(ox + 1, oy0, outW - 2, 24);
    g.strokeStyle = '#e5c158';
    g.strokeRect(ox, oy0, outW, 24);
    g.fillStyle = i === 2 ? '#ffc2c2' : '#e5c158';
    g.font = 'bold 11px "Georgia", serif';
    g.fillText(outs[i], ox + outW / 2, oy0 + 12);
  }
});

// Dynamic canvas for animated slot machine reels & flashing lights
const slotReelCanvas = Object.assign(document.createElement('canvas'), { width: 512, height: 256 });
const slotReelCtx = slotReelCanvas.getContext('2d');
const slotReelTex = new THREE.CanvasTexture(slotReelCanvas);
slotReelTex.colorSpace = THREE.SRGBColorSpace;
const slotScreenMat = new THREE.MeshStandardMaterial({
  map: slotReelTex,
  emissive: 0xffffff,
  emissiveMap: slotReelTex,
  emissiveIntensity: 0.95,
  roughness: 0.25,
});

const slotIcons = ['🍒', '7️⃣', '💎', '👑', '🔔', '💰', '⭐', '🍇'];
let lastSlotUpdate = 0;
function updateSlotScreens(t) {
  if (t - lastSlotUpdate < 0.055) return;
  if (typeof ctrl !== 'undefined' && ctrl?.pos && (ctrl.pos.z < CASINO_Z[0] - 10 || ctrl.pos.z > CASINO_Z[1] + 10)) return;
  lastSlotUpdate = t;
  const g = slotReelCtx;
  const W = 512, H = 256;
  g.fillStyle = '#06070a';
  g.fillRect(0, 0, W, H);

  // Flashing rainbow/gold border chase LEDs
  const ledCount = 28;
  for (let i = 0; i < ledCount; i++) {
    const hue = ((i / ledCount) + t * 0.9) % 1;
    g.fillStyle = `hsl(${Math.floor(hue * 360)}, 100%, 65%)`;
    const bx = (i / ledCount) * (W - 16) + 8;
    g.beginPath();
    g.arc(bx, 8, 4, 0, Math.PI * 2);
    g.arc(bx, H - 8, 4, 0, Math.PI * 2);
    g.fill();
  }

  // 3 Spinning Reels
  const rw = 120, rh = 176, ry = 28;
  for (let r = 0; r < 3; r++) {
    const rx = 40 + r * 150;
    g.fillStyle = '#101118';
    g.fillRect(rx, ry, rw, rh);
    g.strokeStyle = '#d4af37';
    g.lineWidth = 3;
    g.strokeRect(rx, ry, rw, rh);

    const speed = [2.2, 3.0, 3.8][r];
    const scroll = (t * speed) % slotIcons.length;
    const baseIdx = Math.floor(scroll);
    const frac = scroll - baseIdx;

    g.save();
    g.beginPath();
    g.rect(rx, ry, rw, rh);
    g.clip();

    for (let offset = -1; offset <= 2; offset++) {
      const iconIdx = (baseIdx + offset + slotIcons.length) % slotIcons.length;
      const sy = ry + rh / 2 + (offset - frac) * 58;
      g.font = '36px "Segoe UI Emoji", "Apple Color Emoji", sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(slotIcons[iconIdx], rx + rw / 2, sy);
    }
    g.restore();

    g.strokeStyle = 'rgba(255, 50, 50, 0.45)';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(rx, ry + rh / 2);
    g.lineTo(rx + rw, ry + rh / 2);
    g.stroke();
  }

  const pulse = Math.sin(t * 7) > 0;
  g.fillStyle = pulse ? '#ffd700' : '#ff3344';
  g.font = 'bold 16px "Impact", sans-serif';
  g.textAlign = 'center';
  g.fillText('★ 777 JACKPOT $1,000,000 ★', W / 2, 226);

  slotReelTex.needsUpdate = true;
}

// Cabin carpet: quiet, because the suite is the one room that has to feel
// like somewhere you would actually sleep.
const cabinCarpetTex = canvasTex(128, 128, (g, W, H) => {
  g.fillStyle = '#3f4f63';
  g.fillRect(0, 0, W, H);
  for (let i = 0; i < 900; i++) {
    g.fillStyle = `rgba(${180 + Math.random() * 50},${190 + Math.random() * 40},${200 + Math.random() * 40},${Math.random() * 0.09})`;
    g.fillRect(Math.random() * W, Math.random() * H, 2, 2);
  }
}, 6, 8);

// The corridor runner. Its two gold stripes are drawn at fixed U, so on the
// corridor's floor slab they run fore-and-aft down the middle of the ship —
// which is what a runner does. Repeat is 1 across (one runner, not six) and 6
// along, so the medallions march away from you down the coursive.
const corridorCarpetTex = canvasTex(128, 256, (g, W, H) => {
  g.fillStyle = '#2f4257';
  g.fillRect(0, 0, W, H);
  g.fillStyle = '#8d6f3a';
  g.fillRect(W * 0.14, 0, W * 0.07, H);
  g.fillRect(W * 0.79, 0, W * 0.07, H);
  for (let j = 0; j < 8; j++) {
    g.fillStyle = 'rgba(200,168,96,0.22)';
    g.beginPath();
    g.arc(W / 2, (j + 0.5) * H / 8, 16, 0, Math.PI * 2);
    g.fill();
  }
}, 1, 6);
console.log('[cruise] textures initialized');

const M = {
  // --- Hull and structure --------------------------------------------------
  // Topsides. A liner's navy is nearly black in a photograph and ACTUALLY
  // black in a render: at 0x12314f with a little metalness the whole hull went
  // to a silhouette and the ship read as a barge. Lifted and de-metalled until
  // it holds its colour under a high sun.
  hullNavy: new THREE.MeshStandardMaterial({ color: 0x24557f, roughness: 0.5, metalness: 0.06 }),
  hullBoot: new THREE.MeshStandardMaterial({ color: 0xa8362f, roughness: 0.6 }),  // boot-topping
  hullBelow: new THREE.MeshStandardMaterial({ color: 0x8a2b2b, roughness: 0.72 }),
  white: new THREE.MeshStandardMaterial({
    normalMap: concreteN, normalScale: new THREE.Vector2(0.25, 0.25),
    color: 0xf2ece0, roughness: 0.72, metalness: 0.04,
  }),
  cream: new THREE.MeshStandardMaterial({ color: 0xe8dcc4, roughness: 0.8 }),
  teak: new THREE.MeshStandardMaterial({ map: teakTex, bumpMap: teakRelief, bumpScale: 0.008, roughness: 0.82, metalness: 0 }),
  benchWood: new THREE.MeshStandardMaterial({ map: woodA, normalMap: woodN,
    normalScale: new THREE.Vector2(0.18, 0.18), color: 0xcba77a, roughness: 0.54 }),
  benchMetal: new THREE.MeshStandardMaterial({ color: 0x465760, roughness: 0.42, metalness: 0.55 }),
  steel: new THREE.MeshStandardMaterial({ color: 0xcdd3d8, roughness: 0.42, metalness: 0.35 }),
  brass: new THREE.MeshStandardMaterial({ color: 0xd8ae5c, roughness: 0.32, metalness: 0.62 }),
  black: new THREE.MeshStandardMaterial({ color: 0x1b1e24, roughness: 0.5 }),
  darkWood: new THREE.MeshStandardMaterial({
    map: woodA, normalMap: woodN, color: 0x6a4526, roughness: 0.72,
  }),
  midWood: new THREE.MeshStandardMaterial({
    map: woodA, normalMap: woodN, color: 0xb08453, roughness: 0.76,
  }),
  mahoganyGloss: new THREE.MeshStandardMaterial({
    map: woodA, normalMap: woodN, color: 0x3d1b0d, roughness: 0.38, metalness: 0.05,
  }),
  // Ship's glass. Not a mirror: at high metalness under this map's environment
  // every window went black and the superstructure read as a burnt-out hulk.
  // Ship's glass. Not a mirror, and after dark not a hole either: the emissive
  // is what makes the house read as LIT FROM INSIDE when you are out on the
  // promenade at night, which is the whole silhouette of a liner at sea.
  glass: new THREE.MeshStandardMaterial({
    color: 0x9fc4d8, roughness: 0.08, metalness: 0.1,
    emissive: 0xffd98a, emissiveIntensity: 0,
    transparent: true, opacity: 0.30, depthWrite: false,
  }),

  // --- Soft furnishing -----------------------------------------------------
  parquet: new THREE.MeshStandardMaterial({ map: parquetTex, roughness: 0.42, metalness: 0.03 }),
  casinoCarpet: new THREE.MeshStandardMaterial({ map: casinoCarpetTex, roughness: 0.95 }),
  cabinCarpet: new THREE.MeshStandardMaterial({ map: cabinCarpetTex, roughness: 0.96 }),
  corridorCarpet: new THREE.MeshStandardMaterial({ map: corridorCarpetTex, roughness: 0.95 }),
  baize: new THREE.MeshStandardMaterial({ color: 0x14603c, roughness: 0.93 }),
  palmLeaf: new THREE.MeshStandardMaterial({
    color: 0x245d32, roughness: 0.88, side: THREE.DoubleSide,
  }),
  palmLeafLight: new THREE.MeshStandardMaterial({
    color: 0x3f7d43, roughness: 0.9, side: THREE.DoubleSide,
  }),
  palmTrunk: new THREE.MeshStandardMaterial({
    map: palmBarkA, normalMap: palmBarkN, color: 0x8b6844, roughness: 0.96,
  }),
  potCeramic: new THREE.MeshStandardMaterial({
    color: 0xb8aaa0, roughness: 0.32, metalness: 0.03,
  }),
  potRim: new THREE.MeshStandardMaterial({
    color: 0xd1c6bc, roughness: 0.25, metalness: 0.04,
  }),
  potSoil: new THREE.MeshStandardMaterial({ color: 0x24170f, roughness: 1 }),
  rouletteFelt: new THREE.MeshStandardMaterial({ map: rouletteFeltTex, roughness: 0.92 }),
  velvetRed: new THREE.MeshStandardMaterial({ color: 0x7a1f2c, roughness: 0.9 }),
  velvetGold: new THREE.MeshStandardMaterial({ color: 0xb8913f, roughness: 0.72, metalness: 0.2 }),
  linen: new THREE.MeshStandardMaterial({ color: 0xf6f1e4, roughness: 0.92 }),
  duvet: new THREE.MeshStandardMaterial({ color: 0xf2ece0, roughness: 0.94 }),
  pillow: new THREE.MeshStandardMaterial({ color: 0xfbf7ee, roughness: 0.95 }),
  bedRunner: new THREE.MeshStandardMaterial({ color: 0x1d3d5c, roughness: 0.82 }),
  towel: new THREE.MeshStandardMaterial({ color: 0xf4f0e6, roughness: 0.95 }),
  cushionTeal: new THREE.MeshStandardMaterial({ color: 0x2c6b78, roughness: 0.88 }),
  leatherBurgundy: new THREE.MeshStandardMaterial({ color: 0x4a121c, roughness: 0.48, metalness: 0.06 }),
  leatherBlack: new THREE.MeshStandardMaterial({ color: 0x18181c, roughness: 0.45, metalness: 0.05 }),

  // --- Casino Royale gaming tokens, plaques & bar glassware ----------------
  goldPlaque: new THREE.MeshStandardMaterial({ color: 0xe5c158, roughness: 0.22, metalness: 0.82 }),
  rubyPlaque: new THREE.MeshStandardMaterial({ color: 0xd91438, roughness: 0.2, metalness: 0.1, transparent: true, opacity: 0.85 }),
  emeraldPlaque: new THREE.MeshStandardMaterial({ color: 0x10b981, roughness: 0.2, metalness: 0.1, transparent: true, opacity: 0.85 }),
  blackChip: new THREE.MeshStandardMaterial({ color: 0x18181c, roughness: 0.58 }),
  blueChip: new THREE.MeshStandardMaterial({ color: 0x1d4ed8, roughness: 0.58 }),
  greenChip: new THREE.MeshStandardMaterial({ color: 0x059669, roughness: 0.58 }),
  redChip: new THREE.MeshStandardMaterial({ color: 0xdc2626, roughness: 0.58 }),
  amberBottle: new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.82, emissive: 0x78350f, emissiveIntensity: 0.4 }),
  emeraldBottle: new THREE.MeshStandardMaterial({ color: 0x059669, roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.82, emissive: 0x064e3b, emissiveIntensity: 0.4 }),
  rubyBottle: new THREE.MeshStandardMaterial({ color: 0xbe123c, roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.82, emissive: 0x881337, emissiveIntensity: 0.4 }),
  sapphireBottle: new THREE.MeshStandardMaterial({ color: 0x2563eb, roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.82, emissive: 0x1e3a8a, emissiveIntensity: 0.4 }),
  crystalGlass: new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.06, metalness: 0.2, transparent: true, opacity: 0.55 }),
  champagneGold: new THREE.MeshStandardMaterial({ color: 0xfde047, roughness: 0.25, metalness: 0.75 }),
  goldTrim: new THREE.MeshStandardMaterial({ color: 0xd4af37, roughness: 0.26, metalness: 0.78 }),

  // --- Lit things ----------------------------------------------------------
  lamp: new THREE.MeshStandardMaterial({
    color: 0xfff0cc, emissive: 0xffdf9e, emissiveIntensity: 0.9, roughness: 0.4,
  }),
  warmLamp: new THREE.MeshStandardMaterial({
    color: 0xffedd5, emissive: 0xffaa44, emissiveIntensity: 1.5, roughness: 0.3,
  }),
  warmLampBright: new THREE.MeshStandardMaterial({
    color: 0xfffaf0, emissive: 0xffc870, emissiveIntensity: 2.2, roughness: 0.2,
  }),
  neonPink: new THREE.MeshStandardMaterial({
    color: 0xff5fbf, emissive: 0xff4fb0, emissiveIntensity: 1.6, roughness: 0.4,
  }),
  neonCyan: new THREE.MeshStandardMaterial({
    color: 0x5fe8ff, emissive: 0x4fd8ff, emissiveIntensity: 1.6, roughness: 0.4,
  }),

  // --- Pool ----------------------------------------------------------------
  poolTile: new THREE.MeshStandardMaterial({ color: 0x2aa6c4, roughness: 0.24, metalness: 0.05 }),
  poolCoping: new THREE.MeshStandardMaterial({ color: 0xeae2d2, roughness: 0.7 }),

  // --- Safety equipment ----------------------------------------------------
  // The orange is deliberately warm and slightly desaturated: it stays
  // legible in daylight without becoming a pair of flat neon blobs.
  boatOrange: new THREE.MeshStandardMaterial({ color: 0xe76528, roughness: 0.56, metalness: 0.02 }),
  boatOrangeLight: new THREE.MeshStandardMaterial({ color: 0xffa45a, roughness: 0.48, metalness: 0.01 }),
  boatWindow: new THREE.MeshStandardMaterial({
    color: 0x173b55, roughness: 0.16, metalness: 0.18,
    emissive: 0x061522, emissiveIntensity: 0.22,
  }),
  boatRubber: new THREE.MeshStandardMaterial({ color: 0x20262d, roughness: 0.78 }),
  boatRope: new THREE.MeshStandardMaterial({ color: 0x5a4030, roughness: 0.94 }),

  // --- The ballroom, Edwardian ---------------------------------------------
  // Carved oak, cream plaster and water-gilt bronze: the three materials the
  // whole room is made of, and the reason it reads as 1912 rather than as the
  // casino with the lights turned up. The oaks are the shared wood maps under
  // three different stains, so the panelling, the chairs and the stage all
  // came out of the same tree.
  oakDark: new THREE.MeshStandardMaterial({
    map: woodA, normalMap: woodN, normalScale: new THREE.Vector2(0.4, 0.4),
    color: 0x53341c, roughness: 0.52, metalness: 0.03,
  }),
  oakMid: new THREE.MeshStandardMaterial({
    map: woodA, normalMap: woodN, normalScale: new THREE.Vector2(0.35, 0.35),
    color: 0x7d5228, roughness: 0.5, metalness: 0.03,
  }),
  oakPale: new THREE.MeshStandardMaterial({
    map: woodA, normalMap: woodN, normalScale: new THREE.Vector2(0.3, 0.3),
    color: 0xa9793f, roughness: 0.48, metalness: 0.03,
  }),
  // Plaster, not the hull's white: warmer, flatter, and with none of the
  // concrete normal map — under a chandelier that map read as stucco render.
  plasterCream: new THREE.MeshStandardMaterial({
    color: 0xe8dabb, roughness: 0.88, emissive: 0x30230f, emissiveIntensity: 1,
  }),
  plasterShade: new THREE.MeshStandardMaterial({
    color: 0xd2bf9b, roughness: 0.9, emissive: 0x2a1d0c, emissiveIntensity: 1,
  }),
  // Gilding. Two of them, because real gilt bronze has a burnished face and a
  // shadowed one, and a single flat gold turns every moulding into a stripe.
  // Gilding. Metalness is deliberately LOW for gold: this map's environment
  // intensity is 0.55 by day and 0.14 at night, and a metal with nothing to
  // reflect renders as dark grey — at 0.85 every gilt bead, capital and rib in
  // the ballroom came out the colour of lead. Half-metal plus a warm emissive
  // is what actually reads as water gilding under candlelight.
  gilt: new THREE.MeshStandardMaterial({
    color: 0xcaa338, roughness: 0.34, metalness: 0.45,
    emissive: 0x2b1e06, emissiveIntensity: 1,
  }),
  giltPale: new THREE.MeshStandardMaterial({
    color: 0xedd89e, roughness: 0.3, metalness: 0.38,
    emissive: 0x33280c, emissiveIntensity: 1,
  }),
  ballCarpet: new THREE.MeshStandardMaterial({ map: ballCarpetTex, roughness: 0.96 }),
  velvetCrimson: new THREE.MeshStandardMaterial({ color: 0x5d1421, roughness: 0.94 }),
  velvetCrimsonDeep: new THREE.MeshStandardMaterial({ color: 0x3a0b13, roughness: 0.95 }),
  leatherGreen: new THREE.MeshStandardMaterial({ color: 0x1d4433, roughness: 0.46, metalness: 0.05 }),
  silverPlate: new THREE.MeshStandardMaterial({ color: 0xdde2e8, roughness: 0.2, metalness: 0.82 }),
  // Candle light. Held at a fixed intensity rather than joining M.lamp on the
  // day/night dimmer: the point of this room is that the candles are lit at
  // noon, with the drapes half drawn over the sea.
  candleWax: new THREE.MeshStandardMaterial({ color: 0xf5ead2, roughness: 0.72 }),
  // A silk sconce shade with a candle inside it. Given the plaster's colour it
  // read as a paper cup: a shade is lit from WITHIN, so it carries its own
  // warm emissive or it is just a cone.
  silkShade: new THREE.MeshStandardMaterial({
    color: 0xf4dcae, roughness: 0.62, emissive: 0xb06a18, emissiveIntensity: 0.75,
    side: THREE.DoubleSide,
  }),
  // Table linen under candlelight, not laundry: M.linen at 0xf6f1e4 made every
  // cloth in the room a white drum.
  clothIvory: new THREE.MeshStandardMaterial({ color: 0xe8dcc0, roughness: 0.93 }),
  candleFlame: new THREE.MeshStandardMaterial({
    color: 0xfff3d0, emissive: 0xffb545, emissiveIntensity: 2.6, roughness: 0.3,
  }),
  // The dome and the alcove lights. DoubleSide because you stand UNDER the
  // dome and look up at its inner face; front faces only and the ceiling
  // simply had a hole in it.
  // The same glass hung across the window band, where it has the sea behind it
  // rather than a ceiling: transparent enough to keep the horizon, warm enough
  // that what arrives is candle-coloured. depthWrite off for the reason
  // M.glass has it off — a transparent panel that writes depth punches a hole
  // in the sea behind it.
  leadedWindow: new THREE.MeshStandardMaterial({
    map: leadedGlassTex, emissiveMap: leadedGlassTex,
    emissive: 0xffffff, emissiveIntensity: 0.22,
    roughness: 0.3, metalness: 0.04, side: THREE.DoubleSide,
    transparent: true, opacity: 0.88, depthWrite: false,
  }),
  leadedGlass: new THREE.MeshStandardMaterial({
    map: leadedGlassTex, emissiveMap: leadedGlassTex,
    emissive: 0xffffff, emissiveIntensity: 0.85,
    roughness: 0.35, metalness: 0.05, side: THREE.DoubleSide,
  }),
};

// ---------------------------------------------------------------------------
// Instancing kit — the villa's vocabulary, unchanged across all six maps.
// Anything the player must collide with goes through emit()/flushKits(), which
// is what puts it under `world` where cityBoxes.js can find it.
// ---------------------------------------------------------------------------
const G = {
  box: withUV2(new THREE.BoxGeometry(1, 1, 1)),
  cyl: withUV2(new THREE.CylinderGeometry(0.5, 0.5, 1, 16)),
  cylBase: withUV2(new THREE.CylinderGeometry(0.5, 0.5, 1, 16).translate(0, 0.5, 0)),
  cyl32: withUV2(new THREE.CylinderGeometry(0.5, 0.5, 1, 32)),
  sphere: withUV2(new THREE.SphereGeometry(0.5, 16, 12)),
  card: withUV2(new THREE.PlaneGeometry(1, 1)),
  cone: withUV2(new THREE.ConeGeometry(0.5, 1, 16).translate(0, 0.5, 0)),
  canopy: withUV2(new THREE.ConeGeometry(0.5, 1, 8).translate(0, 0.5, 0)),
  torus: withUV2(new THREE.TorusGeometry(0.5, 0.08, 8, 24).rotateX(Math.PI / 2)),
  // Half a capsule on its side: the lifeboats, and the model in the office.
  hull: withUV2(new THREE.SphereGeometry(0.5, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2)
    .rotateX(Math.PI)),
  // A whole capsule on its side: the enclosed lifeboats. Rounded at both
  // ends, so bow-on down the promenade it still reads as a boat instead of
  // the flat-cut plank a stacked hull-plus-lid shows from that angle.
  lifeboat: withUV2(new THREE.CapsuleGeometry(0.5, 1, 4, 12).rotateX(Math.PI / 2)),
  // Low rounded cabin laid over the hull. Keeping it as a second primitive
  // gives the boat a readable shoulder and leaves room for the side windows,
  // rather than turning the whole rescue craft into one orange blob.
  lifeboatCabin: withUV2(new THREE.CapsuleGeometry(0.5, 1.1, 4, 12).rotateX(Math.PI / 2)),
  // A funnel is not a cylinder — it rakes aft and is oval in plan.
  funnel: withUV2(new THREE.CylinderGeometry(0.42, 0.5, 1, 20)),
};

// A tapered, gently arched palm frond. The segmented silhouette catches light
// like a real leaf and avoids the intersecting rectangular cards used before.
function palmFrondGeometry() {
  const segments = 10;
  const positions = [], uvs = [], indices = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const width = 0.02 + 0.16 * Math.pow(Math.sin(Math.PI * t), 0.7);
    const y = 0.15 * Math.sin(Math.PI * t) - 0.34 * t * t;
    for (const side of [-1, 1]) {
      positions.push(side * width, y, t);
      uvs.push(side < 0 ? 0 : 1, t);
    }
    if (i < segments) {
      const a = i * 2, b = a + 1, c = a + 2, d = a + 3;
      indices.push(a, c, b, b, c, d);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return withUV2(geo);
}
G.palmFrond = palmFrondGeometry();
G.palmTrunk = withUV2(new THREE.CylinderGeometry(0.36, 0.5, 1, 14).translate(0, 0.5, 0));
G.plantPot = withUV2(new THREE.CylinderGeometry(0.43, 0.34, 1, 32));

// --- The ballroom's own primitives -------------------------------------------
// An upper hemisphere, used for the saloon dome. Hung under the deckhead and
// seen from below — which is why the material it takes is DoubleSide.
G.domeUp = withUV2(new THREE.SphereGeometry(0.5, 28, 12, 0, Math.PI * 2, 0, Math.PI / 2));
// A thin gilt ring: chandelier tiers, dome ribs, jardinière bands.
G.ring = withUV2(new THREE.TorusGeometry(0.5, 0.035, 6, 32).rotateX(Math.PI / 2));
// A cut-crystal drop. An octahedron catches a chandelier's light in facets the
// way a sphere never does, and costs eight triangles to do it.
G.crystalDrop = withUV2(new THREE.OctahedronGeometry(0.5));
// A turned baluster, lathed from a profile rather than stacked out of boxes:
// the entrance balustrade has 40 of them and stacked they were 200 instances.
G.baluster = withUV2(new THREE.LatheGeometry([
  [0.20, 0.00], [0.20, 0.05], [0.13, 0.09], [0.13, 0.14], [0.17, 0.20],
  [0.10, 0.30], [0.075, 0.44], [0.115, 0.56], [0.15, 0.68], [0.13, 0.80],
  [0.085, 0.86], [0.085, 0.92], [0.16, 0.96], [0.16, 1.00], [0.0, 1.00],
].map(([r, y]) => new THREE.Vector2(r, y)), 14));
// A shallow flute-and-fillet column shaft. Twenty sides reads as fluting from
// three metres away, which is as close as anyone gets to these.
G.columnShaft = withUV2(new THREE.CylinderGeometry(0.5, 0.53, 1, 20).translate(0, 0.5, 0));

// Project deck UVs in metres, so seams align across differently sized slabs.
M.teak.onBeforeCompile = shader => {
  shader.vertexShader = shader.vertexShader.replace('#include <uv_vertex>', `
    #include <uv_vertex>
    vec4 deckPosition = vec4(position, 1.0);
    #ifdef USE_INSTANCING
      deckPosition = instanceMatrix * deckPosition;
    #endif
    deckPosition = modelMatrix * deckPosition;
    vMapUv = deckPosition.xz / vec2(1.44, 4.0);
    vBumpMapUv = vMapUv;
  `);
};
M.teak.customProgramCacheKey = () => 'teak-world-metres-v1';

// Rounded timber with bevels measured in metres, shared by all bench instances.
function benchTimber(width, height, length) {
  const r = 0.012;
  const outline = new THREE.Shape();
  outline.moveTo(-width / 2 + r, -height / 2 + r);
  outline.lineTo(width / 2 - r, -height / 2 + r);
  outline.lineTo(width / 2 - r, height / 2 - r);
  outline.lineTo(-width / 2 + r, height / 2 - r);
  outline.closePath();
  const geo = new THREE.ExtrudeGeometry(outline, { depth: length - 2 * r,
    bevelEnabled: true, bevelThickness: r, bevelSize: r, bevelSegments: 3, steps: 1 });
  geo.translate(0, 0, -length / 2 + r);
  return withUV2(geo);
}
const benchSeatSlat = benchTimber(0.095, 0.055, 2.2);
const benchBackSlat = benchTimber(0.055, 0.10, 2.2);
const benchArm = benchTimber(0.57, 0.055, 0.075);

const kits = new Map();
function emit(geo, mat, item) {
  const key = `${geo.uuid}|${mat.uuid}`;
  let k = kits.get(key);
  if (!k) kits.set(key, (k = { geo, mat, items: [], propFlags: [], groundOnlyFlags: [] }));
  k.items.push(item);
  k.propFlags.push(PROP);
  k.groundOnlyFlags.push(GROUND_ONLY);
}
function addInstancedPrimitive(geometry, material, items, propFlags, groundOnlyFlags) {
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
  im.castShadow = !material.transparent;
  im.receiveShadow = true;
  im.instanceMatrix.needsUpdate = true;
  if (propFlags?.some(Boolean)) im.userData.prop = propFlags;
  if (groundOnlyFlags?.some(Boolean)) im.userData.groundOnly = groundOnlyFlags;
  world.add(im);
  return im;
}
function flushKits() {
  for (const k of kits.values())
    addInstancedPrimitive(k.geo, k.mat, k.items, k.propFlags, k.groundOnlyFlags);
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
// Scenery you walk AROUND rather than ON. Every table, chair, slot machine and
// lounger is a prop: without the flag the ground probe stands the player on the
// roulette table the moment she brushes past it.
let PROP = false, GROUND_ONLY = false;
function prop(fn) {
  const outer = PROP;
  PROP = true;
  fn();
  PROP = outer;
}
// Walkable geometry that supplies a floor but must not push the player's
// horizontal capsule. Used by stairs: their stacked boxes otherwise overlap
// the capsule from behind and shove it over several treads during descent.
function groundOnly(fn) {
  const outer = GROUND_ONLY;
  GROUND_ONLY = true;
  fn();
  GROUND_ONLY = outer;
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
// cityBoxes marks any AABB whose footprint exceeds 80 m as NON-COLLIDING —
// a rule written for the city's merged districts that applies silently to
// anything long. This ship is 190 m of long runs, so every wall, rail and
// bulwark that has to stop the player is chopped into lengths it will honour.
function longSlab(mat, x0, x1, z0, z1, y0, y1, maxSpan = 40) {
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
function atY(y, x, z, ry, fn) {
  const prev = LIFT;
  LIFT = y;
  frame(x, z, ry, fn);
  LIFT = prev;
}

// ---------------------------------------------------------------------------
// Plan constants (metres). The ship runs along Z: bow at +Z, stern at -Z, and
// she is making way toward +Z, which is why the wake streams astern and the
// sea's normals scroll the other way.
// ---------------------------------------------------------------------------
const SEA_Y = 0;
const HULL_BOTTOM = -7.6;
const DECK_Y = 8.0;             // promenade deck — the deck you arrive on
const SUP_H = 5.6;              // clear height inside the house
const CEIL_Y = DECK_Y + SUP_H;  // the rooms' ceiling
// The pool deck does NOT sit straight on the ceiling. It stands 1.9 m above it,
// and that void is where the swimming pool actually lives: cut into the deck,
// its basin hangs down into the space between the two. Laid on the ceiling
// slab instead (the first version, at CEIL_Y + 0.6) there was nowhere for the
// basin to go, so the pool was a puddle painted on a solid deck and the tiled
// floor was buried inside the deckhead.
const POOL_Y = CEIL_Y + 1.9;    // pool deck walking surface

const SHIP_L2 = 95;             // half length
const BEAM2 = 17;               // half beam amidships
const SUP_X2 = 13;              // the house, half width
const SUP_Z0 = -60, SUP_Z1 = 62;
const POOL_X2 = 15;             // pool deck overhangs the house by 2 m a side
const POOL_Z0 = -66, POOL_Z1 = 62;

const WALL_T = 0.34;            // bulkhead thickness
const DOOR_W = 2.4;
const DOOR_H = 2.5;

// Rooms, fore to aft. Every one of them is a Z band across the full width of
// the house, which is how these ships are actually laid out and what keeps the
// interior legible: you always know which way the bow is.
const CASINO_Z = [SUP_Z0, -12];
const ATRIUM_Z = [-12, 2];
const CABIN_Z = [2, 18];
const BALL_Z = [18, SUP_Z1];
// Dedicated accommodation deck, inspired by Cunard's separated cabin decks.
// https://www.cunard.com/content/dam/cunard/inventory-assets/ships/QM/9/deck-plans-qm2-feb24.pdf
const CABIN_Y = 3.8;
const CABIN_EXTENSION_Z = 34;
const CABIN_CEIL_Y = DECK_Y - 0.22;
const CABIN_STAIR = { x0: -9, x1: -5, z0: -4, z1: 6.5, steps: 24 };
// The opening stops at the atrium wall. The lower treads continue beneath
// the restored gallery floor, with clearance under its underside.
const CABIN_OPENING = { ...CABIN_STAIR, z1: ATRIUM_Z[1] - WALL_T / 2 };

// Cut the same stairwell out of the structural deck and its floor finishes.
function stairwellSlab(mat, x0, x1, z0, z1, y0, y1) {
  const s = CABIN_OPENING;
  const a = Math.max(z0, s.z0), b = Math.min(z1, s.z1);
  if (a >= b) return longSlab(mat, x0, x1, z0, z1, y0, y1);
  if (z0 < a) longSlab(mat, x0, x1, z0, a, y0, y1);
  if (b < z1) longSlab(mat, x0, x1, b, z1, y0, y1);
  longSlab(mat, x0, s.x0, a, b, y0, y1);
  longSlab(mat, s.x1, x1, a, b, y0, y1);
}

// Cabin 214 — the starboard suite, and the way off this ship.
const CAB_X0 = 3.0, CAB_X1 = SUP_X2 - WALL_T;
const CAB_Z0 = 4.0, CAB_Z1 = 16.0;
const BED_X = 8.4, BED_Z = 11.6;         // centre of the mattress
const BED_W = 2.0, BED_L = 2.2;          // across the ship, along the ship
const BED_TOP = CABIN_Y + 0.66;          // the surface you lie on

// The hull's half beam at a given station. A liner is parallel-sided over most
// of her length and only fines off at the ends: taper the whole hull and she
// reads as a canoe, which is what the first pass looked like from the pool deck.
function halfBeam(z) {
  const t = z / SHIP_L2;
  if (t > 0.52) {                      // bow — long, fine entry
    const u = (t - 0.52) / 0.48;
    return BEAM2 * Math.max(0.06, 1 - u * u * 0.96);
  }
  if (t < -0.74) {                     // stern — blunt, a transom not a point
    const u = (-t - 0.74) / 0.26;
    return BEAM2 * Math.max(0.44, 1 - u * u * 0.58);
  }
  return BEAM2;
}

// ---------------------------------------------------------------------------
// Hull and the promenade deck.
//
// Built as transverse STATIONS — one box per station gap, each as wide as
// halfBeam says — rather than as one tapered mesh. That is not a shortcut: the
// collision world is a set of AABBs, so a smooth tapered hull would collide as
// its own bounding box and the player would walk on thin air out past the bow.
// Stations give the deck edge a real staircase of boxes that follows the sheer.
// ---------------------------------------------------------------------------
const STATION = 2.5;

// The stations are NOT evenly spaced. Amidships the beam is constant and a
// 2.5 m box is invisible, but over the last 20 m of the bow halfBeam loses
// 1.7 m per station — and at that rate the deck edge, built as Z-aligned
// boxes, read from the foredeck as a flight of white steps with a cross-wall
// closing each one. So the edge line is sampled where it actually bends:
// quarter stations where it turns fastest, half stations through the
// shoulders, full stations along the parallel middle body.
const EDGE = [];
{
  let z = -SHIP_L2;
  while (z < SHIP_L2 - 1e-6) {
    EDGE.push({ z, hb: halfBeam(z) });
    const slope = Math.abs(halfBeam(z + 0.4) - halfBeam(z - 0.4)) / 0.8;
    const step = slope > 0.35 ? STATION / 4 : slope > 0.10 ? STATION / 2 : STATION;
    z = Math.min(z + step, SHIP_L2);
  }
  EDGE.push({ z: SHIP_L2, hb: halfBeam(SHIP_L2) });
}

// Sheer: the deck EDGE lifts toward the bow, the way a real hull does. It is
// the difference between a ship and a barge — but it is carried by the hull
// side, the bulwark and the rail only, NOT by the deck you walk on.
//
// The walking surface stays dead flat at DECK_Y across the whole ship. Given
// the sheer, it did not: by z = 35 the teak stood 22 cm proud of the flat
// floor finishes laid inside the house, and by the ballroom's forward end it
// stood 64 cm proud — so the parquet, the casino carpet and cabin 214's
// carpet were all buried and the forward half of the interior was bare deck
// planking. Sheer is read off the RAIL LINE in profile anyway, which is
// exactly what this still gives.
const sheerAt = (z) => Math.max(0, z / SHIP_L2) ** 2 * 1.6;

// Bulwark: the solid coaming round the deck edge. One ANGLED panel per station
// gap, yawed to that gap's heading and laid nose to tail along the edge line,
// so the joint between two panels IS the line and needs no riser to plug it.
// Panels squared off to Z instead left an open notch at every joint wherever
// the beam changed — sea and sky showing through the ship's own side, and a
// gap a person could walk out through — which the old cross-walls closed at
// the price of the stepped look.
//
// A panel is thickened inboard by the beam its own length loses, so its inner
// face still reaches the teak of the narrower end: the deck and hull below are
// Z-aligned boxes as wide as that narrower end, and without the extra
// thickness a slot of daylight opened between deck and bulwark at the bow.
// It starts at the DECK, not at the sheered edge, for the same reason. This is
// the thing that actually keeps the player aboard, so it is emitted, not a prop.
function bulwarkPanel(a, b) {
  const dx = b.hb - a.hb, dz = b.z - a.z;
  const L = Math.hypot(dx, dz);
  const ry = Math.atan2(dx, dz);
  const T = 0.55 + Math.abs(dx);
  const cx = (a.hb + b.hb) / 2 - (dz / L) * (T / 2);   // inboard normal: (-dz, dx) / L
  const cz = (a.z + b.z) / 2 + (dx / L) * (T / 2);
  const y0 = DECK_Y - 0.22, y1 = DECK_Y + sheerAt((a.z + b.z) / 2) + 1.15;
  box(M.white, cx, (y0 + y1) / 2, cz, T, y1 - y0, L + 0.08, ry);
  box(M.white, -cx, (y0 + y1) / 2, cz, T, y1 - y0, L + 0.08, -ry);
}

for (let i = 0; i < EDGE.length - 1; i++) {
  const a = EDGE[i], b = EDGE[i + 1];
  const z = a.z, z1 = b.z;
  // The solid part of a station is only as wide as its NARROWER end, so hull
  // and teak both stay inboard of the angled bulwark that caps them. Taking
  // the mid-station beam instead left the deck poking out past the bulwark
  // over open water at the forward end of every station up the bow.
  const hb = Math.min(a.hb, b.hb);
  if (hb < 0.4) continue;

  // Topsides, waterline to the UNDERSIDE of the teak. This is a full-width
  // block — the hull is solid, not a shell — so if its top shares DECK_Y with
  // the teak, the two coplanar faces z-fight and the promenade flickers navy
  // through the planks. Stop the hull at the teak's bottom; the sheer is
  // carried by the bulwark above instead, which is where the eye reads it.
  // Hollow the accommodation volume; retain the hull sides and lower floor.
  const ca = Math.max(z, -5), cb = Math.min(z1, CABIN_EXTENSION_Z);
  if (ca < cb) {
    if (z < ca) slab(M.hullNavy, -hb, hb, z, ca, 1.1, DECK_Y - 0.22);
    if (cb < z1) slab(M.hullNavy, -hb, hb, cb, z1, 1.1, DECK_Y - 0.22);
    slab(M.hullNavy, -hb, hb, ca, cb, 1.1, CABIN_Y - 0.22);
    slab(M.hullNavy, -hb, -SUP_X2, ca, cb, CABIN_Y - 0.22, DECK_Y - 0.22);
    slab(M.hullNavy, SUP_X2, hb, ca, cb, CABIN_Y - 0.22, DECK_Y - 0.22);
  } else slab(M.hullNavy, -hb, hb, z, z1, 1.1, DECK_Y - 0.22);
  // Boot-topping, the band at the waterline.
  slab(M.hullBoot, -hb - 0.02, hb + 0.02, z, z1, 0.2, 1.1);
  // Below the water: never seen from the deck, but seen from the pool deck
  // looking down through the swell, and its absence read as a floating box.
  slab(M.hullBelow, -hb * 0.94, hb * 0.94, z, z1, HULL_BOTTOM, 0.2);

  // The deck you walk on. Teak, laid flat over the whole plan; the house is
  // built on top of it, so this runs right through under the rooms and their
  // own floor finishes sit 2 cm proud of it.
  stairwellSlab(M.teak, -hb + 0.55, hb - 0.55, z, z1, DECK_Y - 0.22, DECK_Y);

  bulwarkPanel(a, b);
}

// Stem. The forwardmost station still ends in a flat face a couple of metres
// wide, and the two side bulwarks stop short of each other across it — an
// opening at the very bow you could walk straight out of.
{
  const hb = halfBeam(SHIP_L2);
  slab(M.white, -hb, hb, SHIP_L2 - 0.55, SHIP_L2,
    DECK_Y - 0.22, DECK_Y + sheerAt(SHIP_L2) + 1.15);
  slab(M.hullNavy, -hb, hb, SHIP_L2, SHIP_L2 + 0.8, 1.1, DECK_Y - 0.22);
}

// Transom: cap the stern so the stations do not read as a stack of slices
// when you walk to the rail and look over.
slab(M.hullNavy, -halfBeam(-SHIP_L2), halfBeam(-SHIP_L2), -SHIP_L2 - 1.2, -SHIP_L2,
  0.2, DECK_Y);
slab(M.white, -halfBeam(-SHIP_L2), halfBeam(-SHIP_L2), -SHIP_L2 - 1.2, -SHIP_L2,
  DECK_Y, DECK_Y + 1.15);

// Bow flare — the topsides swelling outboard as they rise, which is what makes
// a bow read as a bow rather than as a wedge. Emitted as two SIDE bands, not as
// one full-width slab: full width it roofed the whole foredeck a metre above
// the deck, and walking forward meant climbing an invisible step onto it.
// The bands ride the same edge line as the bulwark above them. Laid Z-aligned
// they stood a metre proud of it at the forward end of every station, and the
// bow carried a row of navy shelves you could see from the rail.
const FLARE_Z0 = SHIP_L2 - 22;
for (let i = 0; i < EDGE.length - 1; i++) {
  const a = EDGE[i], b = EDGE[i + 1];
  if (a.z < FLARE_Z0) continue;
  const dx = b.hb - a.hb, dz = b.z - a.z;
  const L = Math.hypot(dx, dz);
  const ry = Math.atan2(dx, dz);
  const zc = (a.z + b.z) / 2;
  const bot = DECK_Y - 2.6 + Math.min(1, (zc - FLARE_Z0) / 22) * 1.6;
  const top = DECK_Y + (zc / SHIP_L2) ** 2 * 1.6;
  // 0.5 m band, hung outboard of the line: outboard normal is (dz, -dx) / L.
  const cx = (a.hb + b.hb) / 2 + (dz / L) * 0.25;
  const cz = zc - (dx / L) * 0.25;
  for (const sx of [-1, 1])
    box(M.hullNavy, sx * cx, (bot + top) / 2, cz, 0.5, top - bot, L + 0.08, sx * ry);
}
prop(() => {
  // Anchors, in their hawse pipes.
  for (const sx of [-1, 1]) {
    shape(G.cyl, M.black, sx * (halfBeam(78) - 0.3), DECK_Y - 3.2, 78,
      1.5, 0.35, 1.5, { rx: Math.PI / 2 });
    box(M.steel, sx * (halfBeam(78) - 0.55), DECK_Y - 3.2, 78, 0.35, 1.5, 1.1);
  }
});

// The ship's name, on both bows and across the transom.
function shipName(x, y, z, w, h, ry, label) {
  const W = 1024, H = 128;
  const c = Object.assign(document.createElement('canvas'), { width: W, height: H });
  const g = c.getContext('2d');
  g.clearRect(0, 0, W, H);
  let px = 108;
  do {
    g.font = `bold ${px}px "Times New Roman", Georgia, serif`;
    if (g.measureText(label).width <= W - 40) break;
    px -= 3;
  } while (px > 20);
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = '#e8c063';
  g.fillText(label, W / 2, H / 2 + 4);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = maxAniso;
  const mat = new THREE.MeshStandardMaterial({
    map: t, transparent: true, alphaTest: 0.12, roughness: 0.42, metalness: 0.4,
    side: THREE.DoubleSide,
  });
  prop(() => shape(G.card, mat, x, y, z, w, h, 1, { ry }));
}
shipName(-halfBeam(72) - 0.1, DECK_Y - 2.2, 72, 11, 1.25, -Math.PI / 2, 'PACIFIC EMPRESS');
shipName(halfBeam(72) + 0.1, DECK_Y - 2.2, 72, 11, 1.25, Math.PI / 2, 'PACIFIC EMPRESS');
shipName(0, DECK_Y - 2.4, -SHIP_L2 - 1.3, 13, 1.4, Math.PI, 'PACIFIC EMPRESS');

// ---------------------------------------------------------------------------
// Railings. The bulwark stops you; the rail on top of it is what makes the
// deck read as a deck. Emitted (not props) so the two together are a wall the
// controller genuinely cannot be pushed through at speed.
// ---------------------------------------------------------------------------
// Every part of a rail is a PROP. `prop` in cityBoxes does not mean "does not
// collide" — it means "solid at any height, and never a floor", which is
// exactly a handrail. Emitted plain, the 12 cm top rail became a walkable
// surface 1.05 m above the deck, and the ground probe stood the player on the
// rail of the pool deck instead of letting her reach the top of the stair.
function railRun(x0, x1, z0, z1, y, h = 1.05) {
  const alongX = Math.abs(x1 - x0) >= Math.abs(z1 - z0);
  const t = 0.07;
  prop(() => {
    longSlab(M.steel, x0 - t, x1 + t, z0 - t, z1 + t, y + h - 0.06, y + h + 0.06);
    longSlab(M.steel, x0 - t, x1 + t, z0 - t, z1 + t, y + h * 0.55 - 0.04, y + h * 0.55 + 0.04);
    const span = alongX ? Math.abs(x1 - x0) : Math.abs(z1 - z0);
    const n = Math.max(2, Math.round(span / 2.1));
    for (let i = 0; i <= n; i++) {
      const u = i / n;
      shape(G.cylBase, M.steel, x0 + (x1 - x0) * u, y, z0 + (z1 - z0) * u,
        0.09, h, 0.09);
    }
  });
}

// One length of rail between two points on the deck-edge line: top rail, mid
// rail and stanchions, all yawed to the segment's own heading. `acc` is the
// distance already walked along the line, so the stanchions keep a constant
// 2.1 m pitch across segments of any length instead of one post per station —
// at quarter stations that would have been a picket fence round the bow.
const RAIL_POST = 2.1;
function railSpan(ax, az, bx, bz, y, h, acc) {
  const dx = bx - ax, dz = bz - az;
  const L = Math.hypot(dx, dz);
  if (L < 1e-4) return;
  const ry = Math.atan2(dx, dz);
  const t = 0.07;
  prop(() => {
    box(M.steel, (ax + bx) / 2, y + h - 0.06, (az + bz) / 2, 2 * t, 0.12, L + 2 * t, ry);
    box(M.steel, (ax + bx) / 2, y + h * 0.55, (az + bz) / 2, 2 * t, 0.08, L + 2 * t, ry);
    for (let d = Math.ceil(acc / RAIL_POST - 1e-6) * RAIL_POST; d <= acc + L + 1e-6; d += RAIL_POST) {
      const u = (d - acc) / L;
      shape(G.cylBase, M.steel, ax + dx * u, y, az + dz * u, 0.09, h, 0.09);
    }
  });
}

// Rail along both sides of the promenade deck, laid on the SAME edge line as
// the bulwark under it: one span per station gap, yawed to that gap's heading,
// each span sharing its endpoints with its neighbours so the rail reads as one
// continuous line from stern to stem. Built from Z-aligned runs per station it
// did not: toward the bow, where the line turns and the sheer climbs fastest,
// the rail sat flat while the bulwark beneath it stepped inboard every 2.5 m,
// so the runs stood apart as separate fence panels with the corners of the
// bulwark showing between them.
const RAIL_INSET = 0.28;
let railAcc = 0;
for (let i = 0; i < EDGE.length - 1; i++) {
  const a = EDGE[i], b = EDGE[i + 1];
  if (Math.min(a.hb, b.hb) < 1.0) continue;
  const y = DECK_Y + sheerAt((a.z + b.z) / 2) + 1.15;
  railSpan(a.hb - RAIL_INSET, a.z, b.hb - RAIL_INSET, b.z, y, 0.62, railAcc);
  railSpan(-(a.hb - RAIL_INSET), a.z, -(b.hb - RAIL_INSET), b.z, y, 0.62, railAcc);
  railAcc += Math.hypot(b.hb - a.hb, b.z - a.z);
}
// Across the stem, closing the two side rails into each other.
{
  const hb = halfBeam(SHIP_L2) - RAIL_INSET;
  railSpan(-hb, SHIP_L2 - 0.28, hb, SHIP_L2 - 0.28,
    DECK_Y + sheerAt(SHIP_L2) + 1.15, 0.62, 0);
}
railRun(-halfBeam(-SHIP_L2) + 0.3, halfBeam(-SHIP_L2) - 0.3, -SHIP_L2 - 0.6, -SHIP_L2 - 0.6,
  DECK_Y + 1.15, 0.62);

// ---------------------------------------------------------------------------
// Wall builder. Every interior wall on this ship has holes in it, and a wall
// with a hole is the one thing the box kit cannot express directly — so it is
// expressed here once: solid runs between the openings, plus a lintel over
// each. The alternative (a sealed wall with a door painted on it) is what the
// ticket booth on the beach started as, and it read as a shuttered kiosk.
//
// `holes` are [a0, a1] pairs along the wall's own run, with an optional third
// entry for the head height (default DOOR_H).
// ---------------------------------------------------------------------------
function wallWithHoles(mat, along, fixed, t, a0, a1, y0, y1, holes = []) {
  const put = (p, q, yA, yB) => {
    if (q - p < 0.01 || yB - yA < 0.01) return;
    if (along === 'x') longSlab(mat, p, q, fixed - t / 2, fixed + t / 2, yA, yB);
    else longSlab(mat, fixed - t / 2, fixed + t / 2, p, q, yA, yB);
  };
  const sorted = holes
    .map(h => [Math.max(a0, h[0]), Math.min(a1, h[1]), h[2] ?? DOOR_H])
    .filter(h => h[1] > h[0])
    .sort((p, q) => p[0] - q[0]);
  let cur = a0;
  for (const [h0, h1, top] of sorted) {
    put(cur, h0, y0, y1);
    put(h0, h1, y0 + top, y1);        // lintel over the opening
    cur = Math.max(cur, h1);
  }
  put(cur, a1, y0, y1);
}

// A window band: glass in the hole, with mullions. Called after the wall has
// been built with the band left open.
function windowBand(along, fixed, a0, a1, yA, yB, step = 3.2) {
  const put = (p, q, mat, t) => {
    if (along === 'x') longSlab(mat, p, q, fixed - t / 2, fixed + t / 2, yA, yB);
    else longSlab(mat, fixed - t / 2, fixed + t / 2, p, q, yA, yB);
  };
  put(a0, a1, M.glass, 0.10);
  prop(() => {
    for (let p = a0; p <= a1 + 0.01; p += step) {
      const q = Math.min(p, a1);
      if (along === 'x') box(M.white, q, (yA + yB) / 2, fixed, 0.14, yB - yA, 0.22);
      else box(M.white, fixed, (yA + yB) / 2, q, 0.22, yB - yA, 0.14);
    }
    // Sill and head. Thin bands at the two edges — running a solid the full
    // height of the opening, which is what this was, simply boarded the
    // window up again in white.
    for (const y of [yA, yB]) {
      if (along === 'x') longSlab(M.white, a0, a1, fixed - 0.13, fixed + 0.13, y - 0.07, y + 0.07);
      else longSlab(M.white, fixed - 0.13, fixed + 0.13, a0, a1, y - 0.07, y + 0.07);
    }
  });
}

// ---------------------------------------------------------------------------
// The house — the superstructure that carries the four rooms.
// ---------------------------------------------------------------------------
{
  const y0 = DECK_Y;
  // The shell runs to the POOL DECK, not to the ceiling: above the rooms there
  // is a 1.9 m void carrying the pool, and a shell that stopped at CEIL_Y left
  // that void open to the weather all the way round the ship.
  //
  // It stops just UNDER the pool deck's walking surface, not level with it.
  // Taken all the way to POOL_Y the shell's top face was exactly coplanar with
  // the teak, and since the shell is 34 cm thick and 120 m long that put a
  // 34 cm z-fighting band down BOTH sides of the pool deck and across both
  // ends — the white stripes that flickered as you walked the sun deck. The
  // deck slab is 0.3 m thick (POOL_Y - 0.3 → POOL_Y), so ending 12 cm down
  // still buries the shell 18 cm into it: the void stays sealed, and no face
  // of the shell reaches the surface you walk on.
  const y1 = POOL_Y - 0.12;
  const sillA = y0 + 1.15, sillB = y0 + 3.7;      // the window band, both sides

  // Side walls, with the window band left open and the two atrium doors cut in.
  for (const sx of [-1, 1]) {
    const x = sx * SUP_X2;
    // Below the windows — solid, except at the atrium doors.
    wallWithHoles(M.white, 'z', x, WALL_T, SUP_Z0, SUP_Z1, y0, sillA,
      [[-8, -8 + DOOR_W, DOOR_H]]);
    // Above the windows.
    wallWithHoles(M.white, 'z', x, WALL_T, SUP_Z0, SUP_Z1, sillB, y1, []);
    // The window band itself, broken at the bulkheads and at the door. The
    // gaps have to meet the door's JAMBS exactly: left slack either side, the
    // band stopped short and opened a 40 cm slot of nothing from the sill up
    // to the head, on both sides of every doorway.
    for (const [a, b] of [[SUP_Z0 + 0.4, -12.4], [-11.6, -8.0], [-5.6, 1.6],
                          [2.4, 17.6], [18.4, SUP_Z1 - 0.4]])
      windowBand('z', x, a, b, sillA, sillB);
    // Over the atrium opening — and ONLY over it. The band's sill sits at 9.15
    // and the door head at 10.5, so the wall between those two heights is the
    // top half of the DOORWAY, not something to fill in: boarding it made the
    // opening 1.15 m tall and the player walked into it and stopped.
    longSlab(M.white, x - WALL_T / 2, x + WALL_T / 2, -8, -8 + DOOR_W, y0 + DOOR_H, sillB);
  }

  // Fore and aft end walls of the house, with the window band cut open.
  for (const z of [SUP_Z0, SUP_Z1]) {
    wallWithHoles(M.white, 'x', z, WALL_T, -SUP_X2, SUP_X2, y0, sillA, []);
    wallWithHoles(M.white, 'x', z, WALL_T, -SUP_X2, SUP_X2, sillB, y1, []);
    windowBand('x', z, -SUP_X2 + 0.5, SUP_X2 - 0.5, sillA, sillB);
  }

  // Transverse bulkheads between the rooms, each with a doorway on the
  // centreline. Wide ones: these are the public routes fore and aft, and a
  // 90 cm door in the middle of a 26 m room reads as a fire escape.
  for (const z of [CASINO_Z[1], ATRIUM_Z[1], CABIN_Z[1]]) {
    wallWithHoles(M.cream, 'x', z, WALL_T, -SUP_X2, SUP_X2, y0, CEIL_Y,
      [[-2.6, 2.6, 3.0]]);
  }

  // The deckhead: the ceiling of every room. A thin slab, NOT a solid fill up
  // to the pool deck — the void above it is where the pool's basin hangs.
  longSlab(M.cream, -SUP_X2, SUP_X2, SUP_Z0, SUP_Z1, CEIL_Y, CEIL_Y + 0.35);
}

// ---------------------------------------------------------------------------
// Room 1 — the CASINO, aft. Luxurious, subdued "ambiance feutrée" (Casino Royale).
// Rich velvet draperies, coffered mahogany ceiling, opulent chandeliers,
// animated spinning roulette wheels, dynamic slot machines, high stakes VIP poker,
// and grand mahogany & brass bar lounge.
// ---------------------------------------------------------------------------
const casinoNeon = [];
const rouletteRotors = [];
const casinoLights = [];
console.log('[cruise] casino room start');
{
  const [z0, z1] = CASINO_Z;
  const F = DECK_Y + 0.02;
  longSlab(M.casinoCarpet, -SUP_X2 + WALL_T, SUP_X2 - WALL_T, z0 + WALL_T, z1 - WALL_T,
    DECK_Y, F);

  // Ambiance feutrée: Rich crimson velvet draperies covering the window bands
  // completely to shut out daylight and create an intimate, cozy, luxury Monte Carlo setting.
  prop(() => {
    for (const sx of [-1, 1]) {
      const x = sx * (SUP_X2 - 0.35);
      box(M.velvetRed, x, DECK_Y + 2.45, (z0 + z1) / 2, 0.25, 2.7, Math.abs(z1 - z0) - 1.0);
      box(M.goldTrim, sx * (SUP_X2 - 0.38), DECK_Y + 3.75, (z0 + z1) / 2, 0.32, 0.24, Math.abs(z1 - z0) - 0.8);
      for (let z = z0 + 4; z < z1 - 2; z += 5.5) {
        box(M.darkWood, sx * (SUP_X2 - 0.45), DECK_Y + 2.0, z, 0.42, 4.0, 0.6);
        box(M.goldTrim, sx * (SUP_X2 - 0.5), DECK_Y + 0.8, z, 0.46, 0.08, 0.64);
        box(M.goldTrim, sx * (SUP_X2 - 0.5), DECK_Y + 3.4, z, 0.46, 0.08, 0.64);
        shape(G.cylBase, M.brass, sx * (SUP_X2 - 0.7), DECK_Y + 2.2, z, 0.08, 0.25, 0.08);
        shape(G.cyl, M.warmLamp, sx * (SUP_X2 - 0.72), DECK_Y + 2.38, z - 0.14, 0.14, 0.24, 0.14);
        shape(G.cyl, M.warmLamp, sx * (SUP_X2 - 0.72), DECK_Y + 2.38, z + 0.14, 0.14, 0.24, 0.14);
      }
    }
    // Aft wall (z0): solid wainscoting across width behind the bar
    box(M.darkWood, 0, DECK_Y + 0.55, z0 + WALL_T + 0.1, SUP_X2 * 2 - 1.5, 1.1, 0.15);
    box(M.goldTrim, 0, DECK_Y + 1.12, z0 + WALL_T + 0.1, SUP_X2 * 2 - 1.4, 0.06, 0.18);

    // Forward wall (z1): wainscoting on flanks only, leaving the central doorway [-2.6, 2.6] wide open
    const doorHalfW = 2.6;
    const flankW = (SUP_X2 - 0.75) - doorHalfW;
    const flankX = (doorHalfW + (SUP_X2 - 0.75)) / 2;
    for (const sx of [-1, 1]) {
      box(M.darkWood, sx * flankX, DECK_Y + 0.55, z1 - WALL_T - 0.1, flankW, 1.1, 0.15);
      box(M.goldTrim, sx * flankX, DECK_Y + 1.12, z1 - WALL_T - 0.1, flankW, 0.06, 0.18);

      // Grand Casino Royale doorway architrave flanking the opening
      box(M.darkWood, sx * (doorHalfW + 0.12), DECK_Y + 1.5, z1 - WALL_T - 0.08, 0.24, 3.0, 0.20);
      box(M.goldTrim, sx * (doorHalfW + 0.12), DECK_Y + 1.5, z1 - WALL_T - 0.06, 0.06, 3.0, 0.24);
    }
    box(M.darkWood, 0, DECK_Y + 3.08, z1 - WALL_T - 0.08, doorHalfW * 2 + 0.48, 0.16, 0.20);
    box(M.goldTrim, 0, DECK_Y + 3.0, z1 - WALL_T - 0.06, doorHalfW * 2 + 0.48, 0.04, 0.24);
  });

  // Doorway threshold between Atrium and Casino (not a prop: walkable floor)
  longSlab(M.casinoCarpet, -2.6, 2.6, z1 - WALL_T, z1, DECK_Y, F);
  longSlab(M.parquet, -2.6, 2.6, z1, z1 + WALL_T, DECK_Y, F);
  box(M.brass, 0, F + 0.005, z1, 5.2, 0.01, 0.14);

  function addCasinoLight(x, y, z, color = 0xffcc77, intensity = 22, dist = 18) {
    const pl = new THREE.PointLight(color, intensity, dist, 1.0);
    pl.position.set(x, y, z);
    scene.add(pl);
    casinoLights.push(pl);
  }

  function chandelier(cx, cz, cy = CEIL_Y - 0.1) {
    prop(() => {
      shape(G.cyl, M.brass, cx, cy - 0.2, cz, 0.12, 0.4, 0.12);
      shape(G.cyl32, M.brass, cx, cy - 0.45, cz, 2.2, 0.08, 2.2);
      shape(G.cyl32, M.goldTrim, cx, cy - 0.85, cz, 1.4, 0.06, 1.4);
      for (let i = 0; i < 14; i++) {
        const a = (i / 14) * Math.PI * 2;
        shape(G.cyl, M.warmLampBright, cx + Math.cos(a) * 1.0, cy - 0.52, cz + Math.sin(a) * 1.0,
          0.09, 0.18, 0.09);
      }
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2 + 0.3;
        shape(G.cyl, M.warmLampBright, cx + Math.cos(a) * 0.6, cy - 0.88, cz + Math.sin(a) * 0.6,
          0.08, 0.16, 0.08);
      }
      for (let i = 0; i < 20; i++) {
        const a = (i / 20) * Math.PI * 2;
        const rad = 0.4 + (i % 3) * 0.25;
        shape(G.cyl, M.crystalGlass, cx + Math.cos(a) * rad, cy - 0.65 - (i % 4) * 0.08, cz + Math.sin(a) * rad,
          0.04, 0.22, 0.04);
      }
    });
  }

  // 4 Master Casino PointLights for smooth performance and optimal ambiance
  addCasinoLight(0, DECK_Y + 3.4, z0 + 14.5, 0xffd98a, 24, 20); // Roulette gaming tables
  addCasinoLight(0, DECK_Y + 3.4, z0 + 25.0, 0xffd98a, 24, 18); // Salon Privé VIP Poker
  addCasinoLight(0, DECK_Y + 3.4, z0 + 35.0, 0xffd98a, 24, 20); // Blackjack & Baccarat tables

  // -------------------------------------------------------------------------
  // 1. Live 3D European Roulette Tables with spinning rotors & orbiting balls
  // -------------------------------------------------------------------------
  for (const sx of [-1, 1]) {
    const cx = sx * 6.4, cz = z0 + 14.5;
    prop(() => {
      // Table base & green baize felt
      box(M.darkWood, cx, DECK_Y + 0.44, cz, 3.4, 0.88, 5.2);
      box(M.mahoganyGloss, cx, DECK_Y + 0.90, cz, 3.6, 0.06, 5.4);
      box(M.leatherBurgundy, cx, DECK_Y + 0.93, cz, 3.7, 0.08, 5.5);
      shape(G.card, M.rouletteFelt, cx, DECK_Y + 0.95, cz - 0.45, 3.0, 3.8, 1, { rx: -Math.PI / 2 });

      // Wheel base cylinder
      shape(G.cyl, M.darkWood, cx, DECK_Y + 0.96, cz + 1.6, 1.25, 0.12, 1.25);
      shape(G.cyl, M.brass, cx, DECK_Y + 0.98, cz + 1.6, 1.28, 0.04, 1.28);
    });

    // 3D Spinning Roulette Rotor Assembly
    const rotorGroup = new THREE.Group();
    rotorGroup.position.set(cx, DECK_Y + 1.02, cz + 1.6);
    const coneGeo = new THREE.ConeGeometry(0.56, 0.08, 37);
    coneGeo.rotateX(Math.PI);
    const rotorMesh = new THREE.Mesh(coneGeo, M.brass);
    rotorGroup.add(rotorMesh);

    // 37 pocket facets (alternating red/black + green 0)
    for (let p = 0; p < 37; p++) {
      const pa = (p / 37) * Math.PI * 2;
      const pmat = p === 0 ? M.feltGreen : (p % 2 === 0 ? M.rubyBottle : M.black);
      const pocket = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.02, 0.09), pmat);
      pocket.position.set(Math.cos(pa) * 0.50, 0.02, Math.sin(pa) * 0.50);
      pocket.rotation.y = -pa;
      rotorGroup.add(pocket);
    }
    // Center brass turret
    const turret = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.10, 0.14, 16), M.brass);
    turret.position.y = 0.07;
    rotorGroup.add(turret);
    const cross1 = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.02, 0.03), M.goldTrim);
    cross1.position.y = 0.14;
    rotorGroup.add(cross1);
    const cross2 = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.02, 0.24), M.goldTrim);
    cross2.position.y = 0.14;
    rotorGroup.add(cross2);

    scene.add(rotorGroup);

    // Orbiting ivory ball
    const ballMesh = new THREE.Mesh(new THREE.SphereGeometry(0.022, 12, 12), M.linen);
    ballMesh.position.set(0.48, 0.08, 0);
    rotorGroup.add(ballMesh);

    rouletteRotors.push({
      rotor: rotorGroup,
      ball: ballMesh,
      speed: 0.75 + sx * 0.2,
      ballSpeed: 2.8 + sx * 0.4,
      ballRadius: 0.48,
      ballAngle: Math.random() * Math.PI * 2,
    });

    // Casino chips stacks, croupier rake, champagne flutes
    prop(() => {
      const chipColors = [M.rubyPlaque, M.emeraldPlaque, M.goldPlaque, M.blueChip, M.redChip];
      for (let s = 0; s < 6; s++) {
        const mat = chipColors[s % chipColors.length];
        shape(G.cyl, mat, cx - 0.8 + (s % 3) * 0.35, DECK_Y + 0.99, cz + 0.3 + Math.floor(s / 3) * 0.3,
          0.16, 0.08 + (s % 4) * 0.04, 0.16);
      }
      // Croupier rake
      box(M.darkWood, cx + 0.7, DECK_Y + 0.98, cz + 0.8, 0.04, 0.03, 1.4);
      box(M.brass, cx + 0.7, DECK_Y + 0.98, cz + 0.1, 0.28, 0.04, 0.06);
      // Crystal flutes
      shape(G.cyl, M.crystalGlass, cx + 1.2, DECK_Y + 1.05, cz - 1.2, 0.08, 0.18, 0.08);
      shape(G.cyl, M.crystalGlass, cx + 1.2, DECK_Y + 1.05, cz - 0.9, 0.08, 0.18, 0.08);
    });

    chandelier(cx, cz);
  }

  // -------------------------------------------------------------------------
  // 2. High Stakes VIP James Bond Texas Hold'em Poker Table (Salon Privé)
  // -------------------------------------------------------------------------
  {
    const px = 0, pz = z0 + 25.0;
    prop(() => {
      // Grand oval poker table with burgundy padded armrest
      box(M.darkWood, px, DECK_Y + 0.44, pz, 4.2, 0.88, 2.6);
      box(M.mahoganyGloss, px, DECK_Y + 0.90, pz, 4.4, 0.06, 2.8);
      box(M.leatherBurgundy, px, DECK_Y + 0.94, pz, 4.6, 0.08, 3.0);
      box(M.baize, px, DECK_Y + 0.96, pz, 3.8, 0.02, 2.2);

      // Dealt cards in the center (Royal Flush in Spades)
      for (let i = 0; i < 5; i++) {
        box(M.goldTrim, px - 0.6 + i * 0.30, DECK_Y + 0.975, pz, 0.18, 0.005, 0.25);
      }

      // Rectangular Montenegro high-value plaques ($100k Ruby, $500k Emerald, $1M Gold)
      box(M.rubyPlaque, px - 1.1, DECK_Y + 0.985, pz + 0.45, 0.32, 0.03, 0.20);
      box(M.rubyPlaque, px - 1.1, DECK_Y + 1.015, pz + 0.45, 0.32, 0.03, 0.20);
      box(M.emeraldPlaque, px - 0.6, DECK_Y + 0.985, pz + 0.50, 0.32, 0.03, 0.20);
      box(M.emeraldPlaque, px - 0.6, DECK_Y + 1.015, pz + 0.50, 0.32, 0.03, 0.20);
      box(M.goldPlaque, px + 0.7, DECK_Y + 0.985, pz + 0.45, 0.34, 0.04, 0.22);
      box(M.goldPlaque, px + 0.7, DECK_Y + 1.025, pz + 0.45, 0.34, 0.04, 0.22);

      // Chips stacks and Vesper Martini glasses
      for (let s = 0; s < 4; s++) {
        shape(G.cyl, M.goldPlaque, px + 1.1 + (s % 2) * 0.25, DECK_Y + 1.02, pz - 0.4 + Math.floor(s / 2) * 0.25,
          0.16, 0.12, 0.16);
      }
      // Vesper Martinis with olives
      shape(G.cyl, M.crystalGlass, px - 1.4, DECK_Y + 1.06, pz - 0.6, 0.14, 0.20, 0.14);
      shape(G.cyl, M.crystalGlass, px + 1.4, DECK_Y + 1.06, pz + 0.6, 0.14, 0.20, 0.14);

      // VIP Leather Armchairs
      for (const ox of [-1.8, -0.9, 0, 0.9, 1.8]) {
        box(M.leatherBurgundy, px + ox, DECK_Y + 0.42, pz + 1.8, 0.68, 0.52, 0.68);
        box(M.darkWood, px + ox, DECK_Y + 0.82, pz + 2.1, 0.68, 0.68, 0.14);
        box(M.leatherBurgundy, px + ox, DECK_Y + 0.42, pz - 1.8, 0.68, 0.52, 0.68);
        box(M.darkWood, px + ox, DECK_Y + 0.82, pz - 2.1, 0.68, 0.68, 0.14);
      }

      // VIP Brass Stanchions and Crimson Velvet Ropes delimiting Salon Privé
      for (const sx of [-3.2, 3.2]) {
        for (const sz of [-2.4, 2.4]) {
          shape(G.cylBase, M.brass, px + sx, DECK_Y, pz + sz, 0.28, 0.95, 0.28);
          shape(G.sphere, M.brass, px + sx, DECK_Y + 0.98, pz + sz, 0.16, 0.16, 0.16);
        }
        box(M.velvetRed, px + sx, DECK_Y + 0.72, pz, 0.08, 0.08, 4.6);
      }
    });

    chandelier(px, pz);
  }

  // -------------------------------------------------------------------------
  // 3. Blackjack & Baccarat Gaming Tables
  // -------------------------------------------------------------------------
  for (const sx of [-1, 1]) {
    const cx = sx * 6.8, cz = z0 + 35.0;
    prop(() => {
      box(M.darkWood, cx, DECK_Y + 0.44, cz, 3.8, 0.88, 2.4);
      box(M.mahoganyGloss, cx, DECK_Y + 0.90, cz, 4.0, 0.06, 2.6);
      box(M.leatherBurgundy, cx, DECK_Y + 0.93, cz, 4.1, 0.08, 2.7);
      box(M.baize, cx, DECK_Y + 0.95, cz, 3.6, 0.02, 2.2);

      // Card shoe & discard rack
      box(M.black, cx + 1.2, DECK_Y + 1.04, cz + 0.4, 0.25, 0.16, 0.42);
      box(M.crystalGlass, cx + 1.2, DECK_Y + 1.04, cz - 0.4, 0.22, 0.14, 0.32);

      // Betting spots & chip stacks
      for (let b = 0; b < 5; b++) {
        const bx = cx - 1.2 + b * 0.60;
        shape(G.cyl, M.goldPlaque, bx, DECK_Y + 0.99, cz - 0.3, 0.14, 0.06, 0.14);
      }

      // Bar stools for players
      for (let b = 0; b < 5; b++) {
        const bx = cx - 1.2 + b * 0.60;
        shape(G.cylBase, M.brass, bx, DECK_Y, cz - 1.6, 0.10, 0.68, 0.10);
        shape(G.cyl, M.velvetRed, bx, DECK_Y + 0.72, cz - 1.6, 0.42, 0.14, 0.42);
      }
    });

    chandelier(cx, cz);
  }

  // -------------------------------------------------------------------------
  // 4. Dynamic Animated Slot Machine Banks
  // -------------------------------------------------------------------------
  function slotBank(bx, bz, ry, count = 6) {
    prop(() => {
      box(M.darkWood, bx, DECK_Y + 0.18, bz, count * 0.84 + 0.2, 0.36, 1.1, { ry });
      for (let i = 0; i < count; i++) {
        const off = (i - (count - 1) / 2) * 0.84;
        const x = bx + Math.cos(ry) * off;
        const z = bz - Math.sin(ry) * off;

        // Gloss black cabinet with beveled gold border
        box(M.black, x, DECK_Y + 1.05, z, 0.76, 1.38, 0.72, { ry });
        box(M.goldTrim, x, DECK_Y + 1.05, z, 0.78, 1.40, 0.04, { ry });
        box(M.goldTrim, x, DECK_Y + 1.74, z, 0.74, 0.06, 0.68, { ry });

        // Screen plane
        shape(G.card, slotScreenMat, x, DECK_Y + 1.12, z + (ry > 0 ? 0.37 : -0.37), 0.72, 0.54, 1, { ry });

        // Pull lever with red ball knob
        shape(G.cyl, M.brass, x + (ry > 0 ? 0 : 0.40), DECK_Y + 1.15, z + (ry > 0 ? 0.40 : 0), 0.03, 0.42, 0.03, { ry, rz: 0.25 });
        shape(G.sphere, M.rubyBottle, x + (ry > 0 ? 0 : 0.48), DECK_Y + 1.34, z + (ry > 0 ? 0.48 : 0), 0.08, 0.08, 0.08);

        // Stool in front
        const sx = x + Math.sin(ry) * 1.0;
        const sz = z + Math.cos(ry) * 1.0;
        shape(G.cylBase, M.brass, sx, DECK_Y, sz, 0.09, 0.64, 0.09);
        shape(G.cyl, M.velvetRed, sx, DECK_Y + 0.68, sz, 0.38, 0.12, 0.38);
      }
    });
  }
  for (let i = 0; i < 3; i++) {
    slotBank(-10.6, z0 + 8 + i * 11, Math.PI / 2, 6);
    slotBank(10.6, z0 + 8 + i * 11, -Math.PI / 2, 6);
  }

  // -------------------------------------------------------------------------
  // 5. THE GRAND CASINO ROYALE BAR & LUXURY LOUNGE
  // -------------------------------------------------------------------------
  {
    const backZ = z0 + 1.2;  // -58.8 against aft wall
    const barZ = z0 + 3.6;   // -56.4 counter position
    const stoolZ = z0 + 5.0; // -55.0 stools in front

    prop(() => {
      // Back-bar dark mahogany backboard with gold trim
      box(M.darkWood, 0, DECK_Y + 1.8, backZ, 14.0, 3.6, 0.35);
      box(M.goldTrim, 0, DECK_Y + 3.6, backZ + 0.18, 14.2, 0.08, 0.08);
      box(M.goldTrim, 0, DECK_Y + 0.04, backZ + 0.18, 14.2, 0.08, 0.08);

      // 3 Illuminated glass bottle shelves
      const bottleMats = [M.amberBottle, M.emeraldBottle, M.rubyBottle, M.sapphireBottle, M.champagneGold];
      for (let s = 0; s < 3; s++) {
        const sy = DECK_Y + 1.1 + s * 0.62;
        box(M.crystalGlass, 0, sy, backZ + 0.28, 13.4, 0.03, 0.30);
        box(M.warmLampBright, 0, sy - 0.02, backZ + 0.28, 13.2, 0.02, 0.24);

        for (let i = 0; i < 18; i++) {
          const bx = -5.8 + i * 0.68 + (s % 2) * 0.34;
          const mat = bottleMats[(i + s * 3) % bottleMats.length];
          shape(G.cyl, mat, bx, sy + 0.20, backZ + 0.28, 0.11, 0.38, 0.11);
        }
      }

      // Bar counter (mahogany base + black marble top + brass moldings)
      box(M.darkWood, 0, DECK_Y + 0.56, barZ, 14.0, 1.12, 1.0);
      box(M.black, 0, DECK_Y + 1.15, barZ + 0.05, 14.2, 0.08, 1.2);
      box(M.brass, 0, DECK_Y + 1.18, barZ + 0.62, 14.3, 0.06, 0.14);
      box(M.brass, 0, DECK_Y + 0.18, barZ + 0.66, 14.2, 0.06, 0.06);

      // On-counter: silver cocktail shakers & Dom Pérignon champagne bucket
      shape(G.cyl, M.steel, -2.5, DECK_Y + 1.32, barZ, 0.13, 0.32, 0.13);
      shape(G.cyl, M.steel, 2.5, DECK_Y + 1.32, barZ, 0.13, 0.32, 0.13);
      shape(G.cyl, M.steel, 0, DECK_Y + 1.32, barZ, 0.28, 0.26, 0.28);
      shape(G.cyl, M.champagneGold, 0, DECK_Y + 1.48, barZ, 0.12, 0.35, 0.12, { rz: 0.2 });

      // Crystal cocktail glasses on counter
      for (let i = 0; i < 7; i++) {
        shape(G.cyl, M.crystalGlass, -4.5 + i * 1.5, DECK_Y + 1.25, barZ + 0.2, 0.09, 0.14, 0.09);
      }

      // 9 Red velvet and brass bar stools in front of counter
      for (let i = 0; i < 9; i++) {
        shape(G.cylBase, M.brass, -6.0 + i * 1.5, DECK_Y, stoolZ, 0.12, 0.74, 0.12);
        shape(G.cyl, M.velvetRed, -6.0 + i * 1.5, DECK_Y + 0.78, stoolZ, 0.46, 0.16, 0.46);
      }

      // Side Lounge corners (Chesterfield tufted red velvet sofas & cocktail tables)
      for (const lx of [-9.5, 9.5]) {
        box(M.velvetRed, lx, DECK_Y + 0.32, barZ + 0.6, 2.8, 0.48, 1.2);
        box(M.velvetRed, lx, DECK_Y + 0.75, barZ - 0.05, 2.8, 0.60, 0.25);
        box(M.mahoganyGloss, lx, DECK_Y + 0.38, barZ + 2.0, 1.6, 0.08, 1.0);
        shape(G.cylBase, M.brass, lx - 0.6, DECK_Y, barZ + 2.0, 0.08, 0.36, 0.08);
        shape(G.cylBase, M.brass, lx + 0.6, DECK_Y, barZ + 2.0, 0.08, 0.36, 0.08);
        shape(G.cyl, M.amberBottle, lx, DECK_Y + 0.52, barZ + 2.0, 0.15, 0.25, 0.15);
      }
    });

    // Master High-Resolution CASINO ROYALE Sign (Mounted high on back-bar facing +Z into room)
    const sign = canvasMat(1024, 256, (g, W, H) => {
      const bg = g.createLinearGradient(0, 0, W, H);
      bg.addColorStop(0, '#060305');
      bg.addColorStop(0.5, '#160812');
      bg.addColorStop(1, '#060305');
      g.fillStyle = bg;
      g.fillRect(0, 0, W, H);

      g.strokeStyle = '#d4af37';
      g.lineWidth = 5;
      g.strokeRect(12, 12, W - 24, H - 24);
      g.strokeStyle = '#fff0b5';
      g.lineWidth = 1.5;
      g.strokeRect(18, 18, W - 36, H - 36);

      g.font = '22px "Georgia", serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillStyle = '#f3dd9e';
      g.fillText('♠   ♥   ♦   ♣', W / 2, 48);

      const goldGrad = g.createLinearGradient(0, 75, 0, 150);
      goldGrad.addColorStop(0, '#ffffff');
      goldGrad.addColorStop(0.3, '#fff4cc');
      goldGrad.addColorStop(0.6, '#e8c063');
      goldGrad.addColorStop(1, '#9e7208');

      g.shadowColor = 'rgba(232, 192, 99, 0.95)';
      g.shadowBlur = 20;
      g.font = 'bold 54px "Cinzel", "Times New Roman", "Playfair Display", serif';
      g.fillStyle = goldGrad;
      g.fillText('CASINO ROYALE', W / 2, 116);
      g.shadowBlur = 0;

      g.font = '600 20px "Geist Mono", "Century Gothic", sans-serif';
      g.fillStyle = '#fdf4d7';
      g.fillText('· SALON PRIVÉ & GRAND LUXE ·', W / 2, 180);

      g.strokeStyle = '#e8c063';
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(W / 2 - 220, 210);
      g.lineTo(W / 2 + 220, 210);
      g.stroke();
    }, { emissive: 0xffffff, emissiveIntensity: 1.5, roughness: 0.25 });
    casinoNeon.push(sign);
    prop(() => shape(G.card, sign, 0, DECK_Y + 3.25, backZ + 0.20, 7.6, 1.9, 1));

    chandelier(-3.5, barZ);
    chandelier(3.5, barZ);
    addCasinoLight(0, DECK_Y + 2.8, barZ, 0xffd280, 24, 18);
  }

  // Coffered dark mahogany ceiling beams across the room
  prop(() => {
    for (let z = z0 + 5; z < z1 - 2; z += 6.0) {
      box(M.darkWood, 0, CEIL_Y - 0.12, z, SUP_X2 * 2 - 1.2, 0.22, 0.35);
      box(M.goldTrim, 0, CEIL_Y - 0.23, z, SUP_X2 * 2 - 1.2, 0.04, 0.12);
    }
    for (const x of [-6.4, 0, 6.4]) {
      box(M.darkWood, x, CEIL_Y - 0.12, (z0 + z1) / 2, 0.35, 0.22, Math.abs(z1 - z0) - 1.2);
    }
    for (const sx of [-1, 1]) {
      for (let z = z0 + 3; z < z1 - 2; z += 8) {
        box(M.warmLampBright, sx * 11.9, CEIL_Y - 0.35, z, 0.1, 0.1, 6.4);
      }
    }
  });
}
console.log('[cruise] casino room done');

// ---------------------------------------------------------------------------
// Room 2 — the ATRIUM, amidships. The room you arrive in: doors port and
// starboard onto the promenade deck, reception, and the way fore and aft.
// ---------------------------------------------------------------------------
{
  const [z0, z1] = ATRIUM_Z;
  const F = DECK_Y + 0.02;
  stairwellSlab(M.parquet, -SUP_X2 + WALL_T, SUP_X2 - WALL_T, z0 + WALL_T, z1 - WALL_T,
    DECK_Y, F);
  // A compass rose inlaid in the floor — the one thing that tells you where
  // amidships is once you are inside and have lost the horizon.
  //
  // NOT a prop, and this is the trap the whole map fell into once: `prop` in
  // cityBoxes means "solid at ANY height", because the step-up shortcut must
  // not lift the player onto the furniture. Applied to a 2 cm floor inlay that
  // makes it a full-height wall — this rose was a 5 m bollard across the
  // atrium, and you could not walk forward out of the lobby. Anything laid
  // FLAT ON a floor is part of that floor and is emitted plain.
  shape(G.cyl32, M.darkWood, 0, F + 0.005, -5, 5.4, 0.02, 5.4);
  shape(G.cyl32, M.brass, 0, F + 0.012, -5, 4.6, 0.02, 4.6);
  // Points of the compass. Slim and reaching only to the brass ring: at 3 m
  // long and 0.8 wide, set at radius 1.6, they overhung the rose by half their
  // length and the whole thing read as a ceiling fan lying on the floor.
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const len = i % 2 ? 1.5 : 2.2;
    box(i % 2 ? M.cream : M.hullNavy,
      Math.sin(a) * len / 2, F + 0.02, -5 + Math.cos(a) * len / 2,
      i % 2 ? 0.18 : 0.30, 0.02, len, a);
  }

  prop(() => {
    // Reception desk, against the forward bulkhead.
    box(M.darkWood, 6.5, DECK_Y + 0.55, 0.6, 5.4, 1.1, 0.9);
    box(M.brass, 6.5, DECK_Y + 1.13, 0.6, 5.6, 0.06, 1.1);
    box(M.lamp, 6.5, DECK_Y + 1.2, 0.55, 0.24, 0.1, 0.24);
    // Key rack behind it.
    box(M.midWood, 6.5, DECK_Y + 2.2, 1.35, 5.0, 1.8, 0.14);
    for (let i = 0; i < 24; i++)
      shape(G.cyl, M.brass, 4.4 + (i % 12) * 0.38, DECK_Y + 2.55 - Math.floor(i / 12) * 0.55,
        1.25, 0.05, 0.18, 0.05);

    // Sofas and a low table, in the middle of the lobby.
    for (const [sx, sz, ry] of [[4.5, -2.4, 0], [4.5, -7.6, Math.PI]]) {
      atY(0, sx, sz, ry, () => {
        box(M.velvetRed, 0, DECK_Y + 0.28, 0, 3.0, 0.42, 0.95);
        box(M.velvetRed, 0, DECK_Y + 0.68, 0.42, 3.0, 0.55, 0.22);
        for (let i = 0; i < 3; i++)
          box(M.cushionTeal, -0.9 + i * 0.9, DECK_Y + 0.56, 0.22, 0.5, 0.16, 0.5);
      });
    }
    box(M.darkWood, 4.5, DECK_Y + 0.42, -5, 1.8, 0.1, 1.1);
    for (const dx of [-0.7, 0.7]) for (const dz of [-0.4, 0.4])
      shape(G.cylBase, M.brass, 4.5 + dx, DECK_Y, -5 + dz, 0.07, 0.42, 0.07);

    // Potted palms, because every liner lobby has them.
    for (const [px, pz] of [[-11, -3], [-11, -9.5], [11, -3], [11, -9.5]]) {
      // Tapered ceramic planter, raised rim and visible soil.
      shape(G.plantPot, M.potCeramic, px, DECK_Y + 0.36, pz, 1.05, 0.72, 1.05);
      shape(G.torus, M.potRim, px, DECK_Y + 0.72, pz, 1.0, 0.18, 1.0);
      shape(G.cyl, M.potSoil, px, DECK_Y + 0.705, pz, 0.82, 0.035, 0.82);

      // The trunk is built in tapered sections. Small offsets and collar rings
      // give it an organic lean and the scars left by old fronds.
      const trunkBase = DECK_Y + 0.72;
      const trunkSegments = 5;
      for (let i = 0; i < trunkSegments; i++) {
        const t = i / trunkSegments;
        const x = px + Math.sin(i * 0.8) * 0.025;
        const z = pz + Math.cos(i * 0.7) * 0.018;
        const radius = 0.24 - t * 0.07;
        shape(G.palmTrunk, M.palmTrunk, x, trunkBase + i * 0.25, z,
          radius, 0.27, radius);
        if (i > 0)
          shape(G.torus, M.palmTrunk, x, trunkBase + i * 0.25, z,
            radius * 1.05, 0.55, radius * 1.05);
      }

      const crownY = trunkBase + trunkSegments * 0.25;
      shape(G.sphere, M.palmTrunk, px, crownY - 0.03, pz, 0.30, 0.22, 0.30);

      // Two irregular crowns: broad mature leaves outside, younger upright
      // leaves within. Every frond curves and droops along its own length.
      for (let i = 0; i < 14; i++) {
        const a = (i / 14) * Math.PI * 2 + (i % 2) * 0.11;
        const length = 1.25 + (i % 4) * 0.11;
        shape(G.palmFrond, i % 3 ? M.palmLeaf : M.palmLeafLight,
          px, crownY + (i % 2) * 0.055, pz,
          1.0, 1.0, length, { ry: a, rz: (i % 3 - 1) * 0.06 });
      }
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + 0.25;
        shape(G.palmFrond, M.palmLeafLight, px, crownY + 0.04, pz,
          0.72, 1.35, 0.82, { ry: a, rx: -0.38 });
      }
    }
  });

  // A chandelier over the rose, and downlights round the edge.
  prop(() => {
    shape(G.cyl, M.brass, 0, CEIL_Y - 0.18, -5, 0.1, 0.36, 0.1);
    shape(G.cyl32, M.brass, 0, CEIL_Y - 0.5, -5, 2.6, 0.1, 2.6);
    shape(G.cyl32, M.brass, 0, CEIL_Y - 0.95, -5, 1.7, 0.08, 1.7);
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2;
      shape(G.sphere, M.lamp, Math.sin(a) * 1.3, CEIL_Y - 0.55, -5 + Math.cos(a) * 1.3,
        0.2, 0.28, 0.2);
      shape(G.sphere, M.lamp, Math.sin(a) * 0.85, CEIL_Y - 1.0, -5 + Math.cos(a) * 0.85,
        0.16, 0.22, 0.16);
    }
    for (let z = z0 + 3; z < z1 - 1; z += 4)
      for (const x of [-9.5, 9.5]) box(M.lamp, x, CEIL_Y - 0.1, z, 0.9, 0.08, 0.9);
  });

  // Signs over the two inner doorways, so the player knows which way is which
  // before walking the length of the ship to find out.
  const wayfind = (label, z, ry) => {
    const m = canvasMat(512, 96, (g, W, H) => {
      g.fillStyle = '#12314f';
      g.fillRect(0, 0, W, H);
      paintText(g, label, W / 2, H / 2, 38, '#e8c063');
    }, { emissive: 0xffffff, emissiveIntensity: 0.35 });
    prop(() => shape(G.card, m, 0, DECK_Y + 3.35, z, 3.8, 0.68, 1, { ry }));
  };
  wayfind('◄ CASINO ROYALE', z0 + 0.4, 0);
  wayfind('SALLE DE BAL ►', z1 - 0.4, Math.PI);
}

// ---------------------------------------------------------------------------
// Room 3 — the CABIN DECK. A corridor down the centreline with the suites off
// it. Cabin 214, to starboard, is the only one that opens: it is the way home,
// and a corridor of doors that all open is a corridor of empty boxes.
// ---------------------------------------------------------------------------
{
  const DECK_Y = CABIN_Y;
  const CEIL_Y = CABIN_CEIL_Y;
  const [z0, z1] = CABIN_Z;
  const F = DECK_Y + 0.02;
  const COR = 3.0;                    // corridor half width

  longSlab(M.corridorCarpet, -COR, COR, z0 + WALL_T, z1 - WALL_T, DECK_Y, F);

  // Corridor walls, with the suite doors cut into them. Starboard carries one
  // opening — 214 — and it is a real hole; the others are leaves in a frame.
  wallWithHoles(M.cream, 'z', COR, WALL_T, z0 + WALL_T, z1 - WALL_T, DECK_Y, CEIL_Y,
    [[5.0, 6.2, DOOR_H]]);
  wallWithHoles(M.cream, 'z', -COR, WALL_T, z0 + WALL_T, z1 - WALL_T, DECK_Y, CEIL_Y,
    [[7.0, 9.0, 3.0]]);

  // The port suites and the rest of starboard: sealed, with doors painted in
  // as joinery. Frame, leaf, handle, number plate.
  function cabinDoor(x, z, ry, number) {
    atY(0, x, z, ry, () => prop(() => {
      box(M.midWood, 0, DECK_Y + DOOR_H / 2, 0, 1.26, DOOR_H + 0.12, 0.09);
      box(M.darkWood, 0, DECK_Y + DOOR_H / 2, -0.05, 1.1, DOOR_H - 0.06, 0.06);
      for (const y of [0.62, 1.65]) {
        box(M.brass, 0, DECK_Y + y, -0.087, 0.88, 0.74, 0.012);
        box(M.midWood, 0, DECK_Y + y, -0.097, 0.82, 0.68, 0.018);
      }
      shape(G.cyl, M.brass, 0.42, DECK_Y + 1.02, -0.11, 0.06, 0.16, 0.06,
        { rz: Math.PI / 2 });
      const plate = canvasMat(128, 64, (g, W, H) => {
        g.fillStyle = '#c9a24a';
        g.fillRect(0, 0, W, H);
        paintText(g, number, W / 2, H / 2, 40, '#2a1c08');
      }, { roughness: 0.35, metalness: 0.5 });
      shape(G.card, plate, 0, DECK_Y + 2.22, -0.11, 0.44, 0.22, 1, { ry: Math.PI });
    }));
  }
  // Keep only the doors that sit on a usable corridor wall. The former 219 and
  // 221 leaves were against the return wall, so they read as decorative bars
  // with no room behind them and have been removed.
  cabinDoor(-COR + WALL_T / 2 + 0.06, 4.4, -Math.PI / 2, '215');
  cabinDoor(COR - WALL_T / 2 - 0.06, z0 + 12.2, Math.PI / 2, '216');
  cabinDoor(COR - WALL_T / 2 - 0.06, z0 + 7.5, Math.PI / 2, '218');

  // Second accommodation room beyond the landing, with four cabins per side.
  longSlab(M.corridorCarpet, -9, -5, 18, CABIN_EXTENSION_Z, DECK_Y, F);
  for (const x of [-9, -5])
    wallWithHoles(M.cream, 'z', x, WALL_T, 18, CABIN_EXTENSION_Z, DECK_Y, CEIL_Y, []);
  for (let i = 0; i < 4; i++) {
    const z = 20 + i * 3.6;
    cabinDoor(-9 + WALL_T / 2 + 0.06, z, -Math.PI / 2, `${223 + i * 2}`);
    cabinDoor(-5 - WALL_T / 2 - 0.06, z, Math.PI / 2, `${222 + i * 2}`);
    // Separate cabin volumes behind the closed doors.
    for (const [a, b] of [[-SUP_X2, -9], [-5, SUP_X2]])
      wallWithHoles(M.cream, 'x', z + 1.7, WALL_T, a, b, DECK_Y, CEIL_Y, []);
    prop(() => box(M.lamp, -7, CEIL_Y - 0.1, z, 1.4, 0.07, 0.5));
  }

  // 214's own doorway: architrave and an open leaf swung back into the suite,
  // so the opening reads as a door standing open, not as a missing wall.
  prop(() => {
    box(M.midWood, COR, DECK_Y + DOOR_H + 0.06, 5.6, 0.36, 0.12, 1.35);
    for (const dz of [5.0, 6.2])
      box(M.midWood, COR, DECK_Y + DOOR_H / 2, dz, 0.36, DOOR_H, 0.09);
    box(M.darkWood, COR + 0.55, DECK_Y + DOOR_H / 2, 6.72, 0.06, DOOR_H - 0.06, 1.1);
    const plate = canvasMat(128, 64, (g, W, H) => {
      g.fillStyle = '#c9a24a';
      g.fillRect(0, 0, W, H);
      paintText(g, '214', W / 2, H / 2, 40, '#2a1c08');
    }, { roughness: 0.35, metalness: 0.5 });
    shape(G.card, plate, COR - 0.19, DECK_Y + 1.95, 4.7, 0.44, 0.22, 1, { ry: -Math.PI / 2 });
  });

  // Ceiling lights; keep the door leaves and the stair landing unobstructed.
  prop(() => {
    for (let z = z0 + 2; z < z1 - 1; z += 3.2) {
      box(M.lamp, 0, CEIL_Y - 0.09, z, 1.4, 0.07, 0.5);
    }
  });

  // ---- Cabin 214 ---------------------------------------------------------
  longSlab(M.cabinCarpet, CAB_X0, CAB_X1, CAB_Z0, CAB_Z1, DECK_Y, F);
  // Fore and aft walls of the suite (the corridor wall is already up, and the
  // hull side is the house's own starboard wall).
  wallWithHoles(M.cream, 'x', CAB_Z0, WALL_T, CAB_X0, CAB_X1, DECK_Y, CEIL_Y, []);
  wallWithHoles(M.cream, 'x', CAB_Z1, WALL_T, CAB_X0, CAB_X1, DECK_Y, CEIL_Y, []);

  prop(() => {
    // The bed. Base, mattress, duvet, a runner across the foot, two pillows
    // and a padded headboard against the forward bulkhead.
    box(M.darkWood, BED_X, DECK_Y + 0.22, BED_Z, BED_W + 0.16, 0.44, BED_L + 0.16);
    box(M.linen, BED_X, DECK_Y + 0.55, BED_Z, BED_W, 0.24, BED_L);
    box(M.duvet, BED_X, BED_TOP - 0.02, BED_Z - 0.15, BED_W + 0.06, 0.14, BED_L - 0.3);
    box(M.bedRunner, BED_X, BED_TOP + 0.02, BED_Z - BED_L / 2 + 0.35, BED_W + 0.08, 0.08, 0.62);
    for (const dx of [-0.46, 0.46])
      box(M.pillow, BED_X + dx, BED_TOP + 0.08, BED_Z + BED_L / 2 - 0.34, 0.82, 0.18, 0.5);
    box(M.velvetGold, BED_X, DECK_Y + 1.15, BED_Z + BED_L / 2 + 0.16, BED_W + 0.3, 1.5, 0.14);

    // Nightstands and their lamps, one either side of the headboard.
    for (const dx of [-1.35, 1.35]) {
      box(M.darkWood, BED_X + dx, DECK_Y + 0.28, BED_Z + BED_L / 2 - 0.25, 0.6, 0.56, 0.6);
      shape(G.cylBase, M.brass, BED_X + dx, DECK_Y + 0.56, BED_Z + BED_L / 2 - 0.25,
        0.07, 0.34, 0.07);
      shape(G.cone, M.lamp, BED_X + dx, DECK_Y + 0.88, BED_Z + BED_L / 2 - 0.25,
        0.46, 0.36, 0.46);
    }

    // Wardrobe against the corridor wall, and a luggage bench at the foot.
    box(M.darkWood, CAB_X0 + 0.42, DECK_Y + 1.15, 13.2, 0.7, 2.3, 2.6);
    for (const dz of [12.6, 13.8])
      shape(G.cyl, M.brass, CAB_X0 + 0.79, DECK_Y + 1.15, dz, 0.05, 0.12, 0.05,
        { rz: Math.PI / 2 });
    box(M.midWood, BED_X, DECK_Y + 0.24, BED_Z - BED_L / 2 - 0.75, 1.7, 0.48, 0.55);

    // Desk and chair under the window; a mirror over the desk.
    box(M.darkWood, CAB_X1 - 0.55, DECK_Y + 0.72, 6.4, 0.75, 0.08, 2.4);
    for (const dz of [5.4, 7.4])
      box(M.darkWood, CAB_X1 - 0.55, DECK_Y + 0.36, dz, 0.7, 0.72, 0.08);
    box(M.velvetRed, CAB_X1 - 1.35, DECK_Y + 0.44, 6.4, 0.5, 0.1, 0.5);
    box(M.darkWood, CAB_X1 - 1.58, DECK_Y + 0.75, 6.4, 0.08, 0.72, 0.5);
    shape(G.card, M.glass, CAB_X1 - 0.16, DECK_Y + 1.6, 6.4, 1.6, 1.1, 1, { ry: -Math.PI / 2 });

    // An armchair and a low table by the window, facing out.
    box(M.velvetRed, CAB_X1 - 1.6, DECK_Y + 0.3, 9.6, 0.9, 0.44, 0.9);
    box(M.velvetRed, CAB_X1 - 1.25, DECK_Y + 0.72, 9.6, 0.2, 0.56, 0.9);
    box(M.darkWood, CAB_X1 - 2.7, DECK_Y + 0.36, 9.6, 0.6, 0.07, 0.6);

    // Ceiling light.
    box(M.lamp, BED_X, CEIL_Y - 0.09, 9.4, 1.2, 0.07, 1.2);
  });
  // The rug goes down OUTSIDE prop(): it is 1 cm of floor, and as a prop it
  // would be a wall between the door and the bed.
  box(M.cushionTeal, BED_X + 0.4, F + 0.004, BED_Z - 2.2, 3.2, 0.01, 2.2);

  // This lower-deck suite is enclosed by its own outer bulkhead.
}

// Public gallery above the former cabin corridor; accommodation stays below.
{
  stairwellSlab(M.parquet, -SUP_X2 + WALL_T, SUP_X2 - WALL_T,
    CABIN_Z[0], CABIN_Z[1], DECK_Y, DECK_Y + 0.02);
  for (const x of [-10.5, 10.5]) for (const z of [10, 15]) {
    prop(() => {
      box(M.velvetRed, x, DECK_Y + 0.35, z, 1.4, 0.5, 1.5);
      box(M.darkWood, x, DECK_Y + 0.8, z + 0.65, 1.4, 0.7, 0.16);
    });
  }
  for (const z of [5, 11, 16])
    prop(() => box(M.lamp, 0, CEIL_Y - 0.1, z, 1.8, 0.08, 0.7));

  // Enclosed lower deck, including a side landing off the cabin corridor.
  longSlab(M.cabinCarpet, -SUP_X2, SUP_X2, -5, CABIN_EXTENSION_Z, CABIN_Y - 0.22, CABIN_Y);
  for (const x of [-SUP_X2, SUP_X2])
    wallWithHoles(M.cream, 'z', x, WALL_T, -5, CABIN_EXTENSION_Z, CABIN_Y, CABIN_CEIL_Y, []);
  for (const z of [-5, CABIN_EXTENSION_Z])
    wallWithHoles(M.cream, 'x', z, WALL_T, -SUP_X2, SUP_X2, CABIN_Y, CABIN_CEIL_Y, []);
  wallWithHoles(M.cream, 'x', 18, WALL_T, -SUP_X2, SUP_X2, CABIN_Y, CABIN_CEIL_Y,
    [[-9, -5, 3.0]]);
  // Close the corridor's aft end: access is through the stair landing at z=8.
  wallWithHoles(M.cream, 'x', 2.2, WALL_T, -3, 3, CABIN_Y, CABIN_CEIL_Y, []);
  prop(() => {
    for (const z of [8, 12]) box(M.lamp, -7, CABIN_CEIL_Y - 0.1, z, 1.2, 0.07, 0.6);
  });

  const s = CABIN_STAIR;
  const rise = (DECK_Y - CABIN_Y) / s.steps;
  const tread = (s.z1 - s.z0) / s.steps;
  groundOnly(() => {
    for (let i = 0; i < s.steps; i++) {
      const z = s.z0 + i * tread;
      const top = DECK_Y - i * rise;
      slab(M.midWood, s.x0, s.x1, z, z + tread + 0.015, CABIN_Y - 0.1, top);
      slab(M.brass, s.x0, s.x1, z + tread - 0.035, z + tread, top, top + 0.012);
    }
  });
  // Guard the opening at the upper level and provide stepped handrails below.
  prop(() => {
    for (const x of [s.x0 - 0.06, s.x1 + 0.06]) {
      box(M.brass, x, DECK_Y + 1.05, (s.z0 + CABIN_OPENING.z1) / 2,
        0.08, 0.08, CABIN_OPENING.z1 - s.z0);
      for (let i = 0; i <= s.steps; i += 2) {
        const z = s.z0 + i * tread;
        const y = DECK_Y - i * rise;
        if (z < CABIN_OPENING.z1)
          box(M.brass, x, DECK_Y + 0.52, z, 0.06, 1.04, 0.06);
        box(M.brass, x, y + 0.5, z, 0.06, 1.0, 0.06);
        if (i < s.steps) box(M.brass, x, y + 1, z + tread, 0.08, 0.08, tread * 2.15);
      }
    }
    // The existing atrium wall closes this end of the upper opening.
  });
  const sign = (label, x, y, z, ry = Math.PI) => {
    const mat = canvasMat(768, 128, (g, W, H) => {
      g.fillStyle = '#12314f'; g.fillRect(0, 0, W, H);
      paintText(g, label, W / 2, H / 2, 40, '#e8c063');
    }, { emissive: 0xffffff, emissiveIntensity: 0.35, side: THREE.FrontSide });
    prop(() => shape(G.card, mat, x, y, z, 3.8, 0.64, 1, { ry }));
  };
  sign('↓ CABINES · PONT INFÉRIEUR', -7, DECK_Y + 2.8, -3.9);
  sign('← CABINES 214–218', -7, CABIN_Y + 2.6, 9.6);
  sign('CABINES 222–229 ↑', -7, CABIN_Y + 3.35, 17.75);
  sign('↑ CABINES 214–218', -3.2, CABIN_Y + 3.35, 8, -Math.PI / 2);
  sign('ATRIUM · ESCALIER ↑', -7, CABIN_Y + 3.35, 18.25, 0);
  sign('↑ ATRIUM · SALLE DE BAL', -7, CABIN_Y + 2.7, 6.8, 0);
}

// ---------------------------------------------------------------------------
// Room 4 — the BALLROOM, forward. The biggest volume aboard, and the only one
// built around a single view: you come through the door at the aft end and the
// whole room runs away from you to the band on the stage.
//
// It is an EDWARDIAN saloon, not a modern function room: carved oak below the
// chair rail, cream plaster above it, water-gilt bronze on every moulding, and
// a leaded dome over the dance floor. The reference is the Olympic-class first
// class dining saloon and the grand staircase that led down into it.
//
// Ambiance FEUTRÉE. That is a lighting decision before it is a decorating one,
// and it is made three times over:
//   · the crimson velvet portières are drawn across the outer third of every
//     window bay, so daylight arrives as slots between drapes rather than as a
//     wall of sea. The room is candlelit at noon, which is the whole point.
//   · nothing in here uses M.lamp, which the day/night dimmer takes down to
//     0.16 by day. The candles, the sconces and the dome burn at a fixed warm
//     intensity, and only the five PointLights are trimmed between day and
//     night — and only from 0.6 to 1.0, never off.
//   · every emissive is warm amber against crimson and gilt. There is no white
//     light anywhere in the room.
// ---------------------------------------------------------------------------
const ballLights = [];
{
  const [z0, z1] = BALL_Z;                  // 18 → 62
  const F = DECK_Y + 0.02;
  const IX = SUP_X2 - WALL_T / 2;           // 12.83 — inner face of the side wall
  const LX = IX - 0.13;                     // where the oak lining stands
  const FX = 7.8;                           // dance floor, half width
  const FZ0 = z0 + 10, FZ1 = z0 + 30;       // 28 → 48
  const DOME_Z = (FZ0 + FZ1) / 2;           // 38
  const DOME_R = 4.9;
  const SZ = z0 + 36;                       // 54 — stage centre
  const COL_X = 8.7;                        // the arcade, both sides
  const TBL_X = 10.9;                       // the ring of dining tables
  const SILL_A = DECK_Y + 1.15, SILL_B = DECK_Y + 3.7;   // the house's window band

  function addBallLight(x, y, z, color, intensity, dist) {
    const pl = new THREE.PointLight(color, intensity, dist, 1.0);
    pl.position.set(x, y, z);
    pl.userData.base = intensity;
    scene.add(pl);
    ballLights.push(pl);
  }

  // -------------------------------------------------------------------------
  // The floor. Axminster over the whole room, a parquet dance floor laid into
  // the middle of it, and a compass medallion inlaid at the centre of that.
  //
  // The carpet reaches the WALL FACE, not the old -SUP_X2 + WALL_T: stopped
  // 17 cm short it left a band of bare promenade teak showing round the whole
  // room, under the very skirting that was meant to sit on it.
  // -------------------------------------------------------------------------
  longSlab(M.ballCarpet, -IX, IX, z0 + WALL_T / 2, z1 - WALL_T / 2, DECK_Y, F);
  longSlab(M.parquet, -FX, FX, FZ0, FZ1, F, F + 0.02);

  // The medallion, laid as flat discs. Emitted PLAIN, never as a prop: the
  // atrium's compass rose learned this the hard way — a 1 cm inlay marked
  // `prop` is a full-height bollard standing in the middle of the dance floor.
  {
    const rings = [
      [5.9, M.gilt], [5.72, M.oakDark], [4.1, M.gilt], [3.94, M.oakPale],
      [1.7, M.gilt], [1.54, M.oakDark],
    ];
    rings.forEach(([r, m], i) => {
      shape(G.cyl32, m, 0, F + 0.022 + i * 0.0016, DOME_Z, r * 2, 0.006, r * 2);
    });
    // Sixteen inlaid rays between the two outer bands, and a gilt star at the
    // hub, so the medallion reads as marquetry and not as a target.
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      shape(G.box, i % 2 ? M.oakPale : M.gilt,
        Math.sin(a) * 2.82, F + 0.032, DOME_Z + Math.cos(a) * 2.82,
        0.30, 0.006, 2.2, { ry: a });
    }
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
      shape(G.box, M.gilt, Math.sin(a) * 0.72, F + 0.034, DOME_Z + Math.cos(a) * 0.72,
        0.16, 0.006, 1.4, { ry: a });
    }
  }

  // Gilt edging round the dance floor, so it reads as inlaid rather than laid
  // on. Plain, for the same reason as the medallion.
  for (const sx of [-FX - 0.09, FX + 0.09])
    box(M.gilt, sx, F + 0.03, (FZ0 + FZ1) / 2, 0.18, 0.026, FZ1 - FZ0 + 0.18);
  for (const sz of [FZ0 - 0.09, FZ1 + 0.09])
    box(M.gilt, 0, F + 0.03, sz, FX * 2 + 0.18, 0.026, 0.18);

  // The threshold under the aft door, carrying the carpet through the opening.
  longSlab(M.ballCarpet, -2.6, 2.6, z0 - WALL_T / 2, z0 + WALL_T / 2, DECK_Y, F);
  box(M.gilt, 0, F + 0.006, z0, 5.2, 0.012, 0.16);

  // -------------------------------------------------------------------------
  // The side walls, lined port and starboard. Built as discrete bays between
  // pilasters rather than as one long textured run: a 43 m box stretches any
  // map into stripes, and the casino's per-bay loop is the idiom that works.
  // -------------------------------------------------------------------------
  const PIER_Z = [];
  for (let z = z0 + 3.2; z < z1 - 2.4; z += 6.4) PIER_Z.push(z);

  prop(() => {
    for (const sx of [-1, 1]) {
      const x = sx * LX;

      // Skirting, dado field and chair rail — the oak wainscot, deck to sill.
      longSlab(M.oakDark, x - 0.13, x + 0.13, z0 + 0.2, z1 - 0.2, DECK_Y, DECK_Y + 0.22);
      longSlab(M.oakMid, x - 0.10, x + 0.10, z0 + 0.2, z1 - 0.2, DECK_Y + 0.22, SILL_A - 0.16);
      longSlab(M.oakDark, x - 0.15, x + 0.15, z0 + 0.2, z1 - 0.2, SILL_A - 0.16, SILL_A - 0.02);
      longSlab(M.gilt, x - 0.17, x + 0.17, z0 + 0.2, z1 - 0.2, SILL_A - 0.05, SILL_A - 0.015);

      // Raised panels in the dado, one every 1.6 m, with a gilt bead round
      // each. Two boxes and a frame is a fielded panel from across a room.
      for (let z = z0 + 1.4; z < z1 - 1.4; z += 1.6) {
        shape(G.box, M.oakPale, x - sx * 0.055, DECK_Y + 0.62, z, 0.06, 0.66, 1.16);
        shape(G.box, M.gilt, x - sx * 0.075, DECK_Y + 0.62, z, 0.02, 0.74, 1.26);
      }

      // Pilasters: carved oak below the sill, fluted plaster above it, with a
      // gilt capital under the entablature. They land on the mullions of the
      // house's own window band, so drape and glass share a rhythm.
      for (const z of PIER_Z) {
        shape(G.box, M.oakDark, x - sx * 0.06, DECK_Y + 0.58, z, 0.30, 1.16, 0.72);
        shape(G.columnShaft, M.plasterCream, x - sx * 0.10, SILL_A - 0.02, z,
          0.56, DECK_Y + 4.34 - SILL_A, 0.34);
        shape(G.ring, M.gilt, x - sx * 0.10, DECK_Y + 4.30, z, 0.62, 1.4, 0.40);
        shape(G.cone, M.gilt, x - sx * 0.10, DECK_Y + 4.66, z, 0.72, 0.30, 0.46,
          { rx: Math.PI });
        shape(G.box, M.gilt, x - sx * 0.10, DECK_Y + 4.73, z, 0.34, 0.12, 0.80);
      }

      // Entablature and frieze, above the window head. The frieze is plaster,
      // the two beads are gilt, and the cornice is the oak the room started in.
      longSlab(M.oakDark, x - 0.16, x + 0.16, z0 + 0.2, z1 - 0.2,
        DECK_Y + 4.36, DECK_Y + 4.80);
      longSlab(M.gilt, x - 0.19, x + 0.19, z0 + 0.2, z1 - 0.2,
        DECK_Y + 4.80, DECK_Y + 4.86);
      longSlab(M.plasterCream, x - 0.12, x + 0.12, z0 + 0.2, z1 - 0.2,
        DECK_Y + 4.86, CEIL_Y - 0.30);
      longSlab(M.gilt, x - 0.16, x + 0.16, z0 + 0.2, z1 - 0.2,
        CEIL_Y - 0.30, CEIL_Y - 0.24);
      longSlab(M.plasterShade, x - 0.22, x + 0.22, z0 + 0.2, z1 - 0.2,
        CEIL_Y - 0.24, CEIL_Y - 0.02);

      // Rosettes in the frieze, between the pilasters.
      for (const z of PIER_Z) {
        for (const dz of [-3.2, 3.2]) {
          if (z + dz < z0 + 1 || z + dz > z1 - 1) continue;
          shape(G.cyl, M.gilt, x - sx * 0.13, DECK_Y + 5.15, z + dz, 0.34, 0.06, 0.34,
            { rx: Math.PI / 2 });
          shape(G.sphere, M.giltPale, x - sx * 0.16, DECK_Y + 5.15, z + dz, 0.13, 0.13, 0.13);
        }
      }

      // -----------------------------------------------------------------
      // The portières. Crimson velvet hung at every pier and drawn across
      // the OUTER THIRD of each bay — which is what makes the room feutrée
      // rather than dark. Drawn right across, the sea disappears and the
      // ballroom becomes a windowless box; left open, the window band is a
      // 43 m light box and no candle in here reads at all.
      // -----------------------------------------------------------------
      const dropTop = SILL_B + 0.42, dropBot = DECK_Y + 0.25;
      const dropY = (dropTop + dropBot) / 2, dropH = dropTop - dropBot;
      for (const z of PIER_Z) {
        for (const dz of [-2.35, 2.35]) {
          // The fall itself, plus a narrower dark fold behind its leading
          // edge: two boxes is the cheapest thing that reads as gathered
          // cloth instead of as a painted board.
          shape(G.box, M.velvetCrimson, x - sx * 0.20, dropY, z + dz, 0.26, dropH, 1.35);
          shape(G.box, M.velvetCrimsonDeep, x - sx * 0.30, dropY, z + dz + Math.sign(dz) * 0.52,
            0.20, dropH, 0.34);
          shape(G.box, M.velvetCrimsonDeep, x - sx * 0.30, dropY, z + dz - Math.sign(dz) * 0.55,
            0.18, dropH, 0.22);
          // Silk rope and tassel, gathering the fall at hip height.
          shape(G.ring, M.giltPale, x - sx * 0.22, DECK_Y + 1.5, z + dz, 0.44, 2.2, 0.44);
          shape(G.cone, M.giltPale, x - sx * 0.30, DECK_Y + 1.32, z + dz, 0.13, 0.24, 0.13);
        }
      }
      // A continuous swagged pelmet over the whole band, with a gilt cornice
      // and a bullion fringe under it.
      longSlab(M.velvetCrimsonDeep, x - 0.34, x + 0.34, z0 + 0.6, z1 - 0.6,
        SILL_B + 0.10, SILL_B + 0.62);
      longSlab(M.gilt, x - 0.38, x + 0.38, z0 + 0.6, z1 - 0.6,
        SILL_B + 0.62, SILL_B + 0.72);
      for (let z = z0 + 1.0; z < z1 - 1.0; z += 0.9) {
        shape(G.sphere, M.velvetCrimson, x - sx * 0.30, SILL_B + 0.10, z, 0.9, 0.44, 0.9);
        shape(G.cone, M.giltPale, x - sx * 0.30, SILL_B - 0.06, z, 0.09, 0.18, 0.09);
      }

      // A leaded amber screen hung inboard of the house's own window band —
      // the single biggest thing that makes this room feutrée. Left as clear
      // glass the band is a 43 m light box: at noon the sea washed the whole
      // saloon out to white and not one of the candles read. Behind coloured
      // came the horizon is still there, and it arrives the colour of the
      // candles instead of against them.
      longSlab(M.leadedWindow, x - sx * 0.08 - 0.03, x - sx * 0.08 + 0.03,
        z0 + 0.5, z1 - 0.5, SILL_A + 0.02, SILL_B - 0.02);
      // The came is carried onto the room side as gilt glazing bars, so the
      // screen reads as a window and not as a sheet of amber film.
      for (let z = z0 + 1.0; z < z1 - 0.9; z += 1.55)
        shape(G.box, M.gilt, x - sx * 0.13, (SILL_A + SILL_B) / 2, z,
          0.06, SILL_B - SILL_A, 0.07);
      for (const y of [SILL_A + 0.02, (SILL_A + SILL_B) / 2, SILL_B - 0.02])
        longSlab(M.gilt, x - sx * 0.13 - 0.03, x - sx * 0.13 + 0.03,
          z0 + 0.6, z1 - 0.6, y - 0.035, y + 0.035);

      // Sconces on the pilasters: a gilt bracket carrying two candles under a
      // pleated silk shade. These, not the chandeliers, are what light the
      // faces of the people standing at the tables.
      for (const z of PIER_Z) {
        shape(G.box, M.gilt, x - sx * 0.26, DECK_Y + 2.55, z, 0.16, 0.62, 0.14);
        shape(G.sphere, M.giltPale, x - sx * 0.26, DECK_Y + 2.88, z, 0.20, 0.20, 0.20);
        for (const dz of [-0.26, 0.26]) {
          shape(G.cyl, M.gilt, x - sx * 0.34, DECK_Y + 2.90, z + dz, 0.09, 0.30, 0.09);
          shape(G.cyl, M.candleWax, x - sx * 0.34, DECK_Y + 3.14, z + dz, 0.065, 0.22, 0.065);
          shape(G.cone, M.candleFlame, x - sx * 0.34, DECK_Y + 3.24, z + dz, 0.065, 0.14, 0.065);
          shape(G.canopy, M.silkShade, x - sx * 0.34, DECK_Y + 3.19, z + dz, 0.28, 0.24, 0.28);
        }
      }
    }

    // The FORWARD end wall carries the same band, and the stage is only 15 m
    // of a 26 m beam — so outboard of the proscenium the sea came through in
    // a bright slot on both quarters. Screen it with the same leaded glass.
    longSlab(M.leadedWindow, -SUP_X2 + 0.6, SUP_X2 - 0.6,
      z1 - WALL_T / 2 - 0.12, z1 - WALL_T / 2 - 0.06, SILL_A + 0.02, SILL_B - 0.02);
    for (let x = -SUP_X2 + 1.0; x < SUP_X2 - 0.9; x += 1.55)
      shape(G.box, M.gilt, x, (SILL_A + SILL_B) / 2, z1 - WALL_T / 2 - 0.17,
        0.07, SILL_B - SILL_A, 0.06);
  });

  // -------------------------------------------------------------------------
  // The aft wall — what you see when you turn round on the dance floor. Oak
  // panelling either side of the door, and over it the carved clock panel:
  // Honour and Glory Crowning Time, which is the one piece of joinery anybody
  // recognises from these ships.
  // -------------------------------------------------------------------------
  {
    const wz = z0 + WALL_T / 2 + 0.09;
    const clockPanel = canvasMat(768, 512, (g, W, H) => {
      // Oak ground with a vertical grain, so the carving sits IN something.
      g.fillStyle = '#4a2f18';
      g.fillRect(0, 0, W, H);
      let state = 9311;
      const random = () => ((state = (state * 1664525 + 1013904223) >>> 0) / 4294967296);
      for (let i = 0; i < 500; i++) {
        const x = random() * W;
        g.strokeStyle = random() < 0.5 ? 'rgba(28,16,7,0.35)' : 'rgba(126,88,44,0.28)';
        g.lineWidth = 0.7 + random() * 1.8;
        g.beginPath(); g.moveTo(x, 0);
        for (let y = 0; y <= H; y += 40) g.lineTo(x + Math.sin(y * 0.01 + i) * 3, y);
        g.stroke();
      }
      // A carved arch round the whole panel.
      g.strokeStyle = '#c8a24a';
      g.lineWidth = 7;
      g.beginPath();
      g.moveTo(26, H - 20); g.lineTo(26, 190);
      g.quadraticCurveTo(W / 2, -66, W - 26, 190);
      g.lineTo(W - 26, H - 20);
      g.stroke();
      g.strokeStyle = 'rgba(214,176,92,0.5)';
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(46, H - 20); g.lineTo(46, 200);
      g.quadraticCurveTo(W / 2, -32, W - 46, 200);
      g.lineTo(W - 46, H - 20);
      g.stroke();
      // The two allegorical figures, flanking. Drawn as draped silhouettes in
      // a paler oak — the carving is read by its OUTLINE at this distance, and
      // any attempt at a face at 768 px is a smudge.
      const figure = (cx, lean) => {
        g.save();
        g.translate(cx, 0);
        g.rotate(lean);
        g.fillStyle = '#a3743c';
        g.beginPath();
        g.moveTo(0, 128);
        g.bezierCurveTo(-34, 176, -46, 320, -34, H - 26);
        g.lineTo(36, H - 26);
        g.bezierCurveTo(46, 320, 34, 178, 0, 128);
        g.fill();
        g.fillStyle = '#bb8b4d';
        g.beginPath(); g.arc(1, 104, 21, 0, Math.PI * 2); g.fill();
        // An arm reaching in toward the dial.
        g.strokeStyle = '#a3743c';
        g.lineWidth = 14;
        g.lineCap = 'round';
        g.beginPath(); g.moveTo(4, 156); g.lineTo(56, 196); g.stroke();
        // Folds in the drapery.
        g.strokeStyle = 'rgba(58,34,14,0.45)';
        g.lineWidth = 3;
        for (let k = -2; k <= 2; k++) {
          g.beginPath();
          g.moveTo(k * 11, 200);
          g.quadraticCurveTo(k * 15, 330, k * 10, H - 30);
          g.stroke();
        }
        g.restore();
      };
      figure(126, 0.07);
      g.save(); g.translate(W, 0); g.scale(-1, 1); figure(126, 0.07); g.restore();
      // The dial.
      const cx = W / 2, cy = 250, r = 112;
      g.fillStyle = '#2b1a0c';
      g.beginPath(); g.arc(cx, cy, r + 20, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#d8b45c';
      g.beginPath(); g.arc(cx, cy, r + 14, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#f3e7cd';
      g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.fill();
      g.strokeStyle = '#5a4222';
      g.lineWidth = 4;
      g.beginPath(); g.arc(cx, cy, r - 10, 0, Math.PI * 2); g.stroke();
      g.fillStyle = '#3a2a14';
      g.font = 'bold 21px Georgia, "Times New Roman", serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      const numerals = ['XII', 'I', 'II', 'III', 'IIII', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI'];
      numerals.forEach((n, i) => {
        const a = (i / 12) * Math.PI * 2 - Math.PI / 2;
        g.fillText(n, cx + Math.cos(a) * (r - 24), cy + Math.sin(a) * (r - 24));
      });
      // Hands at ten past ten — the hour every clock face is drawn at.
      g.strokeStyle = '#241708';
      g.lineWidth = 9; g.lineCap = 'round';
      g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx - 48, cy - 34); g.stroke();
      g.lineWidth = 6;
      g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + 62, cy - 44); g.stroke();
      g.fillStyle = '#241708';
      g.beginPath(); g.arc(cx, cy, 9, 0, Math.PI * 2); g.fill();
      // The legend, cut into the rail below.
      g.fillStyle = '#d9b768';
      g.font = 'bold 34px Georgia, "Times New Roman", serif';
      g.fillText('HONOUR AND GLORY', cx, H - 78);
      g.font = 'bold 28px Georgia, "Times New Roman", serif';
      g.fillText('CROWNING TIME', cx, H - 40);
    }, { roughness: 0.5, emissive: 0x150c04, emissiveIntensity: 0.35 });

    prop(() => {
      // Panelling either side of the doorway, matched to the side walls.
      for (const sx of [-1, 1]) {
        const w = (IX - 0.4) - 2.9;
        const cx = sx * (2.9 + w / 2);
        box(M.oakDark, cx, DECK_Y + 0.11, wz, w, 0.22, 0.26);
        box(M.oakMid, cx, DECK_Y + 1.45, wz, w, 2.46, 0.20);
        box(M.oakDark, cx, DECK_Y + 2.76, wz, w, 0.18, 0.28);
        box(M.gilt, cx, DECK_Y + 2.86, wz, w, 0.05, 0.32);
        for (let i = 0; i < 3; i++) {
          const px = sx * (3.5 + i * (w - 1.4) / 2.6);
          box(M.oakPale, px, DECK_Y + 1.5, wz + 0.09, 1.1, 2.0, 0.05);
          box(M.gilt, px, DECK_Y + 1.5, wz + 0.11, 1.22, 2.12, 0.02);
        }
        // Sideboard: carved oak, marble top, silver service on it.
        const bz = z0 + 1.5;
        const bx = sx * 8.2;
        box(M.oakDark, bx, DECK_Y + 0.45, bz, 3.4, 0.9, 0.7);
        box(M.plasterShade, bx, DECK_Y + 0.93, bz, 3.6, 0.08, 0.82);
        for (const dx of [-1.1, 0, 1.1]) {
          shape(G.cyl, M.silverPlate, bx + dx, DECK_Y + 1.06, bz, 0.34, 0.18, 0.34);
          shape(G.cyl, M.silverPlate, bx + dx, DECK_Y + 1.18, bz, 0.13, 0.12, 0.13);
        }
        shape(G.cyl, M.silverPlate, bx - 1.5, DECK_Y + 1.14, bz, 0.20, 0.34, 0.20);
        shape(G.cyl, M.silverPlate, bx + 1.5, DECK_Y + 1.14, bz, 0.20, 0.34, 0.20);
      }
      // The clock panel over the door, in an oak surround.
      // The board is 3:2, because the CANVAS is 768 × 512 and a card stretches
      // its map to whatever shape you give it: hung on the 6.2 × 2.5 surround
      // this started as, the two carved figures came out 70 % too wide and the
      // clock face was an ellipse.
      box(M.oakDark, 0, DECK_Y + 4.15, wz + 0.02, 4.35, 2.95, 0.22);
      box(M.gilt, 0, DECK_Y + 4.15, wz + 0.10, 4.10, 2.76, 0.06);
      shape(G.card, clockPanel, 0, DECK_Y + 4.15, wz + 0.16, 3.75, 2.5, 1);
      // Panelling either side of the board, carrying the oak across the wall.
      // It starts ABOVE the dado's top rail: run down to the same height as
      // the lower panelling it sits on, the two sheets are coplanar and the
      // whole aft wall z-fights and reads as one flat blaze of pale wood.
      for (const sx of [-1, 1]) {
        box(M.oakDark, sx * 4.95, DECK_Y + 4.25, wz + 0.05, 4.9, 2.36, 0.14);
        for (const dx of [-1.15, 1.15]) {
          box(M.oakMid, sx * 4.95 + dx, DECK_Y + 4.25, wz + 0.12, 1.9, 1.86, 0.04);
          box(M.gilt, sx * 4.95 + dx, DECK_Y + 4.25, wz + 0.14, 2.05, 2.0, 0.02);
        }
      }
      // A broken pediment over it, and two candles standing on the cornice.
      box(M.oakDark, 0, DECK_Y + 5.42, wz + 0.02, 20.0, 0.20, 0.34);
      box(M.gilt, 0, DECK_Y + 5.53, wz + 0.02, 20.2, 0.06, 0.40);
      for (const dx of [-2.85, 2.85]) {
        shape(G.cyl, M.gilt, dx, DECK_Y + 5.60, wz - 0.06, 0.24, 0.16, 0.24);
        shape(G.cyl, M.candleWax, dx, DECK_Y + 5.78, wz - 0.06, 0.09, 0.30, 0.09);
        shape(G.cone, M.candleFlame, dx, DECK_Y + 5.92, wz - 0.06, 0.08, 0.16, 0.08);
      }
    });
  }

  // -------------------------------------------------------------------------
  // The entrance wings — two curved balustrades flanking the door, standing
  // where the grand staircase would land. They are outboard of the 2.6 m
  // doorway on both sides, so the walk in from the cabins is never blocked.
  // -------------------------------------------------------------------------
  prop(() => {
    for (const sx of [-1, 1]) {
      const bz = z0 + 2.9;
      const a0 = 3.3, a1 = 6.9;
      // Handrail and base rail.
      box(M.oakDark, sx * (a0 + a1) / 2, DECK_Y + 0.98, bz, a1 - a0, 0.13, 0.28);
      box(M.gilt, sx * (a0 + a1) / 2, DECK_Y + 1.06, bz, a1 - a0 + 0.1, 0.04, 0.34);
      box(M.oakDark, sx * (a0 + a1) / 2, DECK_Y + 0.09, bz, a1 - a0, 0.18, 0.30);
      // Turned balusters between them.
      for (let t = a0 + 0.28; t < a1 - 0.1; t += 0.34)
        shape(G.baluster, M.oakPale, sx * t, DECK_Y + 0.18, bz, 0.62, 0.76, 0.62);
      // Newels, with the gilt cherub lamp on the inboard one — the single
      // most photographed object on these ships.
      for (const [t, cherub] of [[a0 - 0.14, true], [a1 + 0.14, false]]) {
        box(M.oakDark, sx * t, DECK_Y + 0.56, bz, 0.34, 1.12, 0.34);
        box(M.gilt, sx * t, DECK_Y + 1.14, bz, 0.40, 0.08, 0.40);
        if (!cherub) {
          shape(G.cone, M.oakDark, sx * t, DECK_Y + 1.18, bz, 0.30, 0.34, 0.30);
          continue;
        }
        // A small draped figure holding a torchère overhead.
        shape(G.cyl, M.gilt, sx * t, DECK_Y + 1.20, bz, 0.28, 0.12, 0.28);
        shape(G.cone, M.gilt, sx * t, DECK_Y + 1.26, bz, 0.30, 0.46, 0.30, { rx: Math.PI });
        shape(G.sphere, M.gilt, sx * t, DECK_Y + 1.52, bz, 0.26, 0.34, 0.22);
        shape(G.sphere, M.giltPale, sx * t, DECK_Y + 1.78, bz, 0.17, 0.19, 0.17);
        // Two wings, and the arm holding the light.
        for (const w of [-1, 1])
          shape(G.card, M.gilt, sx * t + w * 0.20, DECK_Y + 1.62, bz - 0.06, 0.34, 0.46, 1,
            { ry: w * 0.5 });
        shape(G.cyl, M.gilt, sx * t, DECK_Y + 2.00, bz, 0.07, 0.42, 0.07);
        shape(G.sphere, M.candleFlame, sx * t, DECK_Y + 2.28, bz, 0.24, 0.30, 0.24);
        addBallLight(sx * t, DECK_Y + 2.4, bz, 0xffb055, 6, 9);
      }
    }
  });

  // -------------------------------------------------------------------------
  // The arcade. Eight columns, four a side, standing just outboard of the
  // dance floor and carrying a plaster architrave up to the deckhead. They are
  // what gives a 43 m room a middle, and they frame the dome.
  // -------------------------------------------------------------------------
  const COL_Z = [z0 + 8, z0 + 15, z0 + 22, z0 + 29];
  prop(() => {
    for (const sx of [-1, 1]) {
      const x = sx * COL_X;
      for (const cz of COL_Z) {
        box(M.oakDark, x, DECK_Y + 0.11, cz, 0.98, 0.22, 0.98);
        box(M.gilt, x, DECK_Y + 0.24, cz, 0.88, 0.05, 0.88);
        shape(G.columnShaft, M.plasterCream, x, DECK_Y + 0.27, cz, 0.66, 4.05, 0.66);
        shape(G.ring, M.gilt, x, DECK_Y + 4.28, cz, 0.74, 1.6, 0.74);
        shape(G.cone, M.gilt, x, DECK_Y + 4.70, cz, 0.98, 0.40, 0.98, { rx: Math.PI });
        box(M.gilt, x, DECK_Y + 4.79, cz, 1.06, 0.14, 1.06);
        // Acanthus volutes at the four corners of the capital.
        for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]])
          shape(G.sphere, M.giltPale, x + dx * 0.40, DECK_Y + 4.62, cz + dz * 0.40,
            0.26, 0.22, 0.26);
        // The shaft carried on up to the deckhead behind the architrave.
        box(M.plasterCream, x, (DECK_Y + 4.86 + CEIL_Y) / 2, cz,
          0.56, CEIL_Y - DECK_Y - 4.86, 0.56);
      }
      // The architrave the columns carry, running the length of the arcade.
      const a0 = COL_Z[0] - 0.6, a1 = COL_Z[COL_Z.length - 1] + 0.6;
      longSlab(M.plasterCream, x - 0.30, x + 0.30, a0, a1, DECK_Y + 4.86, DECK_Y + 5.34);
      longSlab(M.gilt, x - 0.34, x + 0.34, a0, a1, DECK_Y + 5.34, DECK_Y + 5.42);
      longSlab(M.plasterShade, x - 0.22, x + 0.22, a0, a1, DECK_Y + 5.42, CEIL_Y - 0.02);
      // Gilt drops between the capitals, so the arcade reads as bays.
      for (let i = 0; i < COL_Z.length - 1; i++) {
        const mz = (COL_Z[i] + COL_Z[i + 1]) / 2;
        shape(G.cyl, M.gilt, x, DECK_Y + 5.02, mz, 0.46, 0.10, 0.46, { rx: Math.PI / 2 });
        shape(G.sphere, M.giltPale, x - sx * 0.16, DECK_Y + 5.02, mz, 0.20, 0.20, 0.20);
      }
    }
  });

  // -------------------------------------------------------------------------
  // The deckhead: a coffered plaster ceiling with gilt ribs, and the leaded
  // dome over the dance floor.
  //
  // The dome hangs BELOW the deckhead rather than sitting in a hole cut
  // through it. The house's ceiling slab is 35 cm of solid plaster with the
  // pool deck's void over it — opening a well through both would have put the
  // sun deck's teak in the ceiling of the ballroom. Hung, it reads exactly the
  // same from the only place anybody sees it: standing under it.
  // -------------------------------------------------------------------------
  prop(() => {
    longSlab(M.plasterCream, -IX, IX, z0 + 0.2, z1 - 0.2, CEIL_Y - 0.06, CEIL_Y);

    const inDome = z => Math.abs(z - DOME_Z) < DOME_R + 0.5;
    // Transverse ribs.
    for (let z = z0 + 3.6; z < z1 - 3; z += 4.6) {
      if (inDome(z)) continue;
      box(M.plasterShade, 0, CEIL_Y - 0.17, z, IX * 2 - 0.6, 0.22, 0.42);
      box(M.gilt, 0, CEIL_Y - 0.29, z, IX * 2 - 0.6, 0.05, 0.18);
    }
    // Longitudinal ribs. The inner pair break for the dome; the outer pair
    // clear it and run the length of the room.
    for (const x of [-9.0, 9.0]) {
      box(M.plasterShade, x, CEIL_Y - 0.17, (z0 + z1) / 2, 0.42, 0.22, z1 - z0 - 1.2);
      box(M.gilt, x, CEIL_Y - 0.29, (z0 + z1) / 2, 0.18, 0.05, z1 - z0 - 1.2);
    }
    for (const x of [-4.4, 4.4]) {
      for (const [a, b] of [[z0 + 0.6, DOME_Z - DOME_R - 0.5], [DOME_Z + DOME_R + 0.5, z1 - 0.6]]) {
        box(M.plasterShade, x, CEIL_Y - 0.17, (a + b) / 2, 0.42, 0.22, b - a);
        box(M.gilt, x, CEIL_Y - 0.29, (a + b) / 2, 0.18, 0.05, b - a);
      }
    }
    // Rosettes in the coffers.
    for (let z = z0 + 5.9; z < z1 - 3; z += 4.6) {
      if (inDome(z)) continue;
      for (const x of [-11, -6.7, 0, 6.7, 11]) {
        if (x === 0 && inDome(z)) continue;
        shape(G.cyl32, M.plasterShade, x, CEIL_Y - 0.13, z, 1.1, 0.09, 1.1);
        shape(G.ring, M.gilt, x, CEIL_Y - 0.19, z, 0.9, 1.8, 0.9);
        shape(G.sphere, M.candleFlame, x, CEIL_Y - 0.24, z, 0.24, 0.20, 0.24);
      }
    }

    // --- the dome ---------------------------------------------------------
    const base = CEIL_Y - 1.58, rise = 1.44;
    // The curb the dome springs from is an ANNULUS, built out of tori. Laid as
    // a G.cyl32 disc — which is what it was — it is a solid plaster lid 11.7 m
    // across hung under the dome, and the dome behind it is invisible: from
    // the dance floor the ceiling had a flat grey plate where the glass should
    // have been, and nothing about the material was wrong.
    shape(G.torus, M.plasterCream, 0, base - 0.11, DOME_Z, 11.7, 4.2, 11.7);
    shape(G.torus, M.plasterShade, 0, base - 0.24, DOME_Z, 12.9, 2.6, 12.9);
    shape(G.ring, M.gilt, 0, base - 0.26, DOME_Z, 11.1, 3.6, 11.1);
    shape(G.ring, M.gilt, 0, base + 0.02, DOME_Z, DOME_R * 2, 3.0, DOME_R * 2);
    // The glass itself. G.domeUp is HALF a unit sphere, so it stands 0.5 tall
    // in its own space: the scale that gives it a rise of `rise` is 2 × rise.
    shape(G.domeUp, M.leadedGlass, 0, base, DOME_Z, DOME_R * 2, rise * 2, DOME_R * 2);
    // Gilt ribs following the curve, and two hoops across them.
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      const r0 = 0.55, r1 = DOME_R - 0.12;
      const y0 = base + rise - 0.20, y1 = base + 0.10;
      const L = Math.hypot(r1 - r0, y0 - y1);
      shape(G.box, M.gilt,
        Math.sin(a) * (r0 + r1) / 2, (y0 + y1) / 2, DOME_Z + Math.cos(a) * (r0 + r1) / 2,
        0.075, 0.075, L, { ry: a, rx: Math.atan2(y0 - y1, r1 - r0) });
    }
    for (const [rr, yy] of [[DOME_R * 0.82, base + 0.52], [DOME_R * 0.5, base + 1.02]])
      shape(G.ring, M.gilt, 0, yy, DOME_Z, rr * 2, 2.2, rr * 2);
    // The oculus boss, and the cove of little lamps hidden behind the curb.
    shape(G.cyl32, M.gilt, 0, base + rise - 0.12, DOME_Z, 1.1, 0.14, 1.1);
    shape(G.sphere, M.candleFlame, 0, base + rise - 0.24, DOME_Z, 0.66, 0.44, 0.66);
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      shape(G.sphere, M.candleFlame, Math.sin(a) * (DOME_R + 0.22), base + 0.06,
        DOME_Z + Math.cos(a) * (DOME_R + 0.22), 0.18, 0.14, 0.18);
    }
  });
  addBallLight(0, DECK_Y + 4.2, DOME_Z, 0xffc477, 26, 24);

  // -------------------------------------------------------------------------
  // Crystal chandeliers. Gilt bronze, three tiers of candles, and cut-glass
  // drops swagged between them — the fitting that makes the difference
  // between a saloon and a function room.
  // -------------------------------------------------------------------------
  function chandelier(cx, cz, s = 1) {
    prop(() => {
      const top = CEIL_Y - 0.06;
      shape(G.cyl, M.gilt, cx, top - 0.28 * s, cz, 0.14 * s, 0.56 * s, 0.14 * s);
      shape(G.cone, M.gilt, cx, top - 0.60 * s, cz, 1.05 * s, 0.34 * s, 1.05 * s,
        { rx: Math.PI });
      const tiers = [[1.85, 0.95, 12], [1.30, 1.42, 9], [0.76, 1.86, 6]];
      for (const [rad, drop, n] of tiers) {
        const r = rad * s, y = top - drop * s;
        shape(G.ring, M.gilt, cx, y, cz, r * 2, 2.6 * s, r * 2);
        shape(G.ring, M.giltPale, cx, y - 0.09 * s, cz, r * 1.86, 1.8 * s, r * 1.86);
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2 + (n % 2) * 0.2;
          const px = cx + Math.sin(a) * r, pz = cz + Math.cos(a) * r;
          // Scrolled arm, socket, candle, flame.
          shape(G.cyl, M.gilt, (cx + px) / 2, y + 0.16 * s, (cz + pz) / 2,
            0.05 * s, r, 0.05 * s, { ry: a, rx: Math.PI / 2 });
          shape(G.cyl, M.gilt, px, y + 0.14 * s, pz, 0.14 * s, 0.14 * s, 0.14 * s);
          shape(G.cyl, M.candleWax, px, y + 0.36 * s, pz, 0.075 * s, 0.34 * s, 0.075 * s);
          shape(G.cone, M.candleFlame, px, y + 0.56 * s, pz, 0.08 * s, 0.18 * s, 0.08 * s);
          // A crystal drop hung under every candle.
          shape(G.crystalDrop, M.crystalGlass, px, y - 0.17 * s, pz,
            0.085 * s, 0.20 * s, 0.085 * s);
        }
        // The swag: drops falling in a curve between one arm and the next.
        for (let i = 0; i < n * 5; i++) {
          const a = (i / (n * 5)) * Math.PI * 2;
          const k = (i % 5) - 2;
          shape(G.crystalDrop, M.crystalGlass,
            cx + Math.sin(a) * r * 1.04, y - (0.13 + Math.abs(k) * 0.075) * s,
            cz + Math.cos(a) * r * 1.04, 0.062 * s, 0.15 * s, 0.062 * s, { ry: a });
        }
      }
      // The stem the tiers are threaded on, and the finial under them.
      shape(G.cyl, M.gilt, cx, top - 1.36 * s, cz, 0.10 * s, 1.56 * s, 0.10 * s);
      shape(G.sphere, M.crystalGlass, cx, top - 2.12 * s, cz, 0.34 * s, 0.34 * s, 0.34 * s);
      shape(G.crystalDrop, M.crystalGlass, cx, top - 2.40 * s, cz,
        0.20 * s, 0.40 * s, 0.20 * s);
      shape(G.sphere, M.candleFlame, cx, top - 2.10 * s, cz, 0.30 * s, 0.30 * s, 0.30 * s);
    });
  }
  // A PAIR at the aft end rather than one on the centreline: a single
  // chandelier there hangs exactly between the door and the clock panel, and
  // the one thing anybody walks in to look at was behind two tiers of candles.
  for (const sx of [-1, 1]) chandelier(sx * 4.6, z0 + 5.6, 0.88);
  chandelier(0, z0 + 33.0, 1.15);
  for (const sx of [-1, 1]) {
    chandelier(sx * TBL_X, z0 + 11.5, 0.52);
    chandelier(sx * TBL_X, z0 + 25.5, 0.52);
  }
  addBallLight(0, DECK_Y + 3.7, z0 + 7.4, 0xffb964, 17, 20);
  addBallLight(0, DECK_Y + 3.6, z0 + 33.0, 0xffb964, 20, 18);

  // -------------------------------------------------------------------------
  // The stage, forward, raised two steps under a carved proscenium.
  // -------------------------------------------------------------------------
  {
    box(M.oakDark, 0, DECK_Y + 0.3, SZ, 15.0, 0.6, 8.0);
    box(M.oakPale, 0, DECK_Y + 0.62, SZ, 14.6, 0.04, 7.6);
    for (let i = 0; i < 2; i++)
      box(M.oakDark, 0, DECK_Y + 0.1 + i * 0.2, SZ - 4.2 - (2 - i) * 0.4, 6.0, 0.2, 0.4);
    prop(() => {
      // The stage front, panelled and gilt-beaded like the dado.
      box(M.oakMid, 0, DECK_Y + 0.32, SZ - 4.02, 15.0, 0.5, 0.1);
      box(M.gilt, 0, DECK_Y + 0.58, SZ - 4.04, 15.0, 0.05, 0.16);
      for (let i = -6; i <= 6; i++)
        box(M.gilt, i * 1.1, DECK_Y + 0.32, SZ - 4.08, 0.05, 0.34, 0.06);
      // Footlights along the front edge, shielded by a gilt hood.
      for (let i = -6; i <= 6; i++)
        shape(G.sphere, M.candleFlame, i * 1.1, DECK_Y + 0.66, SZ - 3.9, 0.16, 0.14, 0.16);
      box(M.gilt, 0, DECK_Y + 0.78, SZ - 3.98, 14.4, 0.10, 0.22);

      // The backcloth and the swagged curtain: crimson velvet, gathered into
      // folds and tied back at both sides with a gold rope.
      box(M.velvetCrimsonDeep, 0, DECK_Y + 3.2, SZ + 3.7, 14.6, 5.2, 0.3);
      for (let i = 0; i < 20; i++)
        box(M.velvetCrimson, -6.9 + i * 0.73, DECK_Y + 3.2, SZ + 3.44,
          0.40, 5.2, 0.24);
      for (const sx of [-1, 1]) {
        box(M.velvetCrimson, sx * 5.4, DECK_Y + 3.0, SZ + 3.1, 2.3, 5.6, 0.5);
        box(M.velvetCrimsonDeep, sx * 6.4, DECK_Y + 3.0, SZ + 2.95, 0.7, 5.6, 0.4);
        shape(G.ring, M.giltPale, sx * 5.4, DECK_Y + 2.3, SZ + 2.9, 2.6, 3.0, 0.9);
        shape(G.cone, M.giltPale, sx * 4.4, DECK_Y + 2.05, SZ + 2.85, 0.2, 0.38, 0.2);
      }
      // The pelmet across the top, with a bullion fringe.
      box(M.velvetCrimsonDeep, 0, DECK_Y + 5.05, SZ + 3.0, 15.0, 0.9, 0.42);
      for (let i = 0; i < 22; i++)
        shape(G.cone, M.giltPale, -7.0 + i * 0.667, DECK_Y + 4.52, SZ + 2.86,
          0.13, 0.26, 0.13);

      // The proscenium: carved oak jambs with gilt capitals, and a cartouche
      // on the arch over the middle of the opening.
      for (const sx of [-1, 1]) {
        box(M.oakDark, sx * 7.35, DECK_Y + 2.7, SZ - 0.2, 0.62, 5.4, 0.62);
        box(M.gilt, sx * 7.35, DECK_Y + 0.16, SZ - 0.2, 0.76, 0.14, 0.76);
        box(M.gilt, sx * 7.35, DECK_Y + 5.42, SZ - 0.2, 0.80, 0.16, 0.80);
        shape(G.cone, M.gilt, sx * 7.35, DECK_Y + 5.40, SZ - 0.2, 0.72, 0.32, 0.72,
          { rx: Math.PI });
        for (let k = 0; k < 4; k++) {
          box(M.oakPale, sx * 7.35, DECK_Y + 1.2 + k * 1.05, SZ - 0.52, 0.44, 0.82, 0.05);
          box(M.gilt, sx * 7.35, DECK_Y + 1.2 + k * 1.05, SZ - 0.54, 0.52, 0.90, 0.02);
        }
      }
      box(M.oakDark, 0, DECK_Y + 5.6, SZ - 0.2, 15.6, 0.5, 0.62);
      box(M.gilt, 0, DECK_Y + 5.86, SZ - 0.2, 15.8, 0.08, 0.7);
      shape(G.cyl32, M.gilt, 0, DECK_Y + 5.6, SZ - 0.54, 1.5, 0.12, 1.5, { rx: Math.PI / 2 });
      shape(G.sphere, M.giltPale, 0, DECK_Y + 5.6, SZ - 0.60, 0.9, 0.9, 0.4);
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        shape(G.cone, M.gilt, Math.cos(a) * 0.95, DECK_Y + 5.6 + Math.sin(a) * 0.95,
          SZ - 0.56, 0.2, 0.42, 0.2, { rz: -a + Math.PI / 2, rx: Math.PI / 2 });
      }

      // The band. A grand piano with its lid up, a double bass, a drum kit and
      // brass on stands — the Wallace Hartley line-up.
      box(M.mahoganyGloss, -3.6, DECK_Y + 0.95, SZ + 0.4, 2.6, 0.3, 1.9);
      shape(G.cyl, M.mahoganyGloss, -4.5, DECK_Y + 0.95, SZ - 0.3, 1.5, 0.3, 1.5);
      shape(G.box, M.mahoganyGloss, -3.6, DECK_Y + 1.52, SZ + 0.66, 2.5, 1.2, 0.10,
        { rx: -0.52 });
      for (const dx of [-4.5, -2.6, -3.6])
        shape(G.cylBase, M.mahoganyGloss, dx, DECK_Y + 0.62, SZ + 0.4, 0.09, 0.2, 0.09);
      box(M.linen, -3.6, DECK_Y + 0.98, SZ - 0.62, 1.3, 0.04, 0.16);
      box(M.oakDark, -3.6, DECK_Y + 0.45, SZ - 1.15, 0.9, 0.1, 0.4);
      for (const dx of [-3.95, -3.25])
        shape(G.cylBase, M.oakDark, dx, DECK_Y + 0.62, SZ - 1.15, 0.06, 0.45, 0.06);

      shape(G.hull, M.oakMid, 2.4, DECK_Y + 1.5, SZ + 0.6, 0.8, 1.5, 0.5, { rx: -0.18 });
      shape(G.cylBase, M.oakDark, 2.4, DECK_Y + 1.9, SZ + 0.75, 0.07, 1.0, 0.07);
      shape(G.cyl, M.linen, 4.8, DECK_Y + 1.0, SZ + 1.0, 1.0, 0.7, 1.0);
      for (const [dx, dz, r] of [[4.0, 0.2, 0.32], [5.4, 0.2, 0.28], [6.2, 0.9, 0.4]]) {
        shape(G.cyl, M.gilt, dx, DECK_Y + 1.5, SZ + dz, r, 0.04, r);
        shape(G.cylBase, M.steel, dx, DECK_Y + 0.62, SZ + dz, 0.05, 0.88, 0.05);
      }
      // Two music stands and a cello case leaning at the back.
      for (const dx of [0.2, 1.4]) {
        shape(G.cylBase, M.black, dx, DECK_Y + 0.62, SZ - 1.4, 0.05, 1.05, 0.05);
        shape(G.box, M.black, dx, DECK_Y + 1.74, SZ - 1.4, 0.5, 0.36, 0.04, { rx: -0.5 });
      }
      shape(G.hull, M.oakDark, -6.2, DECK_Y + 1.4, SZ + 2.2, 0.7, 1.6, 0.35, { rz: 0.24 });
    });
    addBallLight(0, DECK_Y + 3.4, SZ - 1.0, 0xffb055, 18, 16);
  }

  // -------------------------------------------------------------------------
  // The tables: cloth to the ground, a silver candelabra, roses, and carved
  // oak chairs with green leather seats.
  // -------------------------------------------------------------------------
  function ballTable(cx, cz, seats = 6) {
    prop(() => {
      shape(G.cyl, M.velvetCrimsonDeep, cx, DECK_Y + 0.13, cz, 1.56, 0.26, 1.56);
      shape(G.cyl, M.clothIvory, cx, DECK_Y + 0.50, cz, 1.5, 0.52, 1.5);
      shape(G.cyl, M.clothIvory, cx, DECK_Y + 0.77, cz, 1.62, 0.05, 1.62);
      shape(G.ring, M.gilt, cx, DECK_Y + 0.72, cz, 1.60, 2.6, 1.60);
      shape(G.cyl, M.velvetCrimson, cx, DECK_Y + 0.80, cz, 1.02, 0.02, 1.02);
      // A three-branch silver candelabra, and a low bowl of roses at its foot.
      shape(G.cyl, M.silverPlate, cx, DECK_Y + 0.84, cz, 0.30, 0.06, 0.30);
      shape(G.cyl, M.silverPlate, cx, DECK_Y + 1.02, cz, 0.06, 0.36, 0.06);
      shape(G.cyl, M.silverPlate, cx, DECK_Y + 1.20, cz, 0.62, 0.04, 0.62);
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2;
        const px = cx + Math.sin(a) * 0.28, pz = cz + Math.cos(a) * 0.28;
        shape(G.cyl, M.silverPlate, px, DECK_Y + 1.24, pz, 0.13, 0.06, 0.13);
        shape(G.cyl, M.candleWax, px, DECK_Y + 1.42, pz, 0.055, 0.32, 0.055);
        shape(G.cone, M.candleFlame, px, DECK_Y + 1.60, pz, 0.06, 0.15, 0.06);
      }
      shape(G.cyl, M.candleWax, cx, DECK_Y + 1.42, cz, 0.055, 0.32, 0.055);
      shape(G.cone, M.candleFlame, cx, DECK_Y + 1.60, cz, 0.06, 0.15, 0.06);
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2 + 0.4;
        shape(G.sphere, M.velvetCrimson, cx + Math.sin(a) * 0.22, DECK_Y + 0.90,
          cz + Math.cos(a) * 0.22, 0.13, 0.13, 0.13);
      }

      for (let i = 0; i < seats; i++) {
        const a = (i / seats) * Math.PI * 2;
        const x = cx + Math.sin(a) * 1.36, z = cz + Math.cos(a) * 1.36;
        // Carved oak chair: seat, four turned legs, a shaped back with a
        // pierced splat, and a green leather squab.
        box(M.oakDark, x, DECK_Y + 0.44, z, 0.52, 0.07, 0.52, -a);
        box(M.leatherGreen, x, DECK_Y + 0.49, z, 0.46, 0.05, 0.46, -a);
        for (let k = 0; k < 4; k++) {
          const b = (k / 4) * Math.PI * 2 + 0.7 - a;
          shape(G.cylBase, M.oakDark, x + Math.sin(b) * 0.20, DECK_Y, z + Math.cos(b) * 0.20,
            0.05, 0.44, 0.05);
        }
        const bx = x - Math.sin(a) * 0.24, bz = z - Math.cos(a) * 0.24;
        for (const w of [-0.21, 0.21])
          box(M.oakDark, bx + Math.cos(a) * w, DECK_Y + 0.78, bz - Math.sin(a) * w,
            0.07, 0.66, 0.07, -a);
        box(M.oakMid, bx, DECK_Y + 0.82, bz, 0.24, 0.52, 0.05, -a);
        box(M.oakDark, bx, DECK_Y + 1.10, bz, 0.52, 0.10, 0.08, -a);
        box(M.gilt, bx, DECK_Y + 1.16, bz, 0.52, 0.03, 0.09, -a);
        // The cover laid at each place: plate, side plate, glass, silver.
        const rx = cx + Math.sin(a) * 0.86, rz = cz + Math.cos(a) * 0.86;
        shape(G.cyl, M.linen, rx, DECK_Y + 0.82, rz, 0.26, 0.02, 0.26);
        shape(G.cyl, M.gilt, rx, DECK_Y + 0.83, rz, 0.27, 0.008, 0.27);
        shape(G.cyl, M.crystalGlass, rx - Math.sin(a) * 0.02 + Math.cos(a) * 0.20,
          DECK_Y + 0.90, rz - Math.cos(a) * 0.02 - Math.sin(a) * 0.20, 0.09, 0.20, 0.09);
        for (const w of [-0.19, 0.19])
          box(M.silverPlate, rx + Math.cos(a) * w, DECK_Y + 0.815, rz - Math.sin(a) * w,
            0.03, 0.01, 0.20, -a);
        shape(G.cyl, M.linen, rx + Math.cos(a) * 0.30, DECK_Y + 0.82,
          rz - Math.sin(a) * 0.30, 0.15, 0.02, 0.15);
      }
    });
  }
  for (const sx of [-1, 1])
    for (const tz of [z0 + 4.5, z0 + 11.5, z0 + 18.5, z0 + 25.5])
      ballTable(sx * TBL_X, tz);

  // -------------------------------------------------------------------------
  // Palms in brass jardinières, in the corners and either side of the stage —
  // the Edwardian answer to an empty corner, and what breaks the hard line
  // where two panelled walls meet.
  // -------------------------------------------------------------------------
  prop(() => {
    for (const [px, pz] of [
      [-11.6, z0 + 8.4], [11.6, z0 + 8.4],
      [-11.6, z0 + 30.5], [11.6, z0 + 30.5],
      [-6.6, SZ - 4.6], [6.6, SZ - 4.6],
    ]) {
      // The jardinière: a gilt-banded brass pot on a turned oak stand.
      shape(G.cylBase, M.oakDark, px, DECK_Y, pz, 0.62, 0.34, 0.62);
      shape(G.plantPot, M.brass, px, DECK_Y + 0.72, pz, 1.15, 0.78, 1.15);
      shape(G.ring, M.gilt, px, DECK_Y + 1.02, pz, 1.06, 2.0, 1.06);
      shape(G.ring, M.gilt, px, DECK_Y + 0.44, pz, 0.84, 2.0, 0.84);
      shape(G.cyl, M.potSoil, px, DECK_Y + 1.08, pz, 0.98, 0.06, 0.98);

      const trunkBase = DECK_Y + 1.06;
      for (let i = 0; i < 5; i++) {
        const tx = px + Math.sin(i * 0.8) * 0.03, tz = pz + Math.cos(i * 0.7) * 0.02;
        const radius = 0.19 - i * 0.012;
        shape(G.palmTrunk, M.palmTrunk, tx, trunkBase + i * 0.22, tz, radius, 0.24, radius);
      }
      const crownY = trunkBase + 5 * 0.22;
      shape(G.sphere, M.palmTrunk, px, crownY - 0.03, pz, 0.24, 0.18, 0.24);
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2 + (i % 2) * 0.13;
        shape(G.palmFrond, i % 3 ? M.palmLeaf : M.palmLeafLight,
          px, crownY + (i % 2) * 0.05, pz, 0.95, 0.95, 1.15 + (i % 4) * 0.09,
          { ry: a, rz: (i % 3 - 1) * 0.07 });
      }
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2 + 0.3;
        shape(G.palmFrond, M.palmLeafLight, px, crownY + 0.05, pz,
          0.66, 1.25, 0.76, { ry: a, rx: -0.4 });
      }
    }
  });
}

// ---------------------------------------------------------------------------
// The aft stair — the only way between the promenade deck and the pool deck.
// Two flights with a landing, climbing the aft face of the house, and the pool
// deck is cantilevered aft over it on four columns to give the top a landing.
// ---------------------------------------------------------------------------
const STAIR_W = 4.4;
{
  const rise = (POOL_Y - DECK_Y) / 20;      // 20 treads over 7.5 m
  const tread = 0.62;
  const zBottom = -78;
  groundOnly(() => {
    for (let i = 0; i < 20; i++) {
      const z0 = zBottom + i * tread;
      const top = DECK_Y + (i + 1) * rise;
      // Each tread reaches back under the one before it so the flight is solid
      // to the ground probe rather than 20 floating slabs.
      slab(M.teak, -STAIR_W / 2, STAIR_W / 2, z0, z0 + tread + 0.06, DECK_Y - 0.4, top);
    }
  });
  // The top tread finishes at z ≈ -65.6, which is already under the pool
  // deck's aft cantilever (POOL_Z0 = -66) — so the flight lands straight on
  // it and needs no landing slab of its own.
  // Handrails up both sides of the flight, raked with it.
  prop(() => {
    for (const sx of [-1, 1]) {
      for (let i = 0; i <= 20; i += 2) {
        const z = zBottom + i * tread;
        shape(G.cylBase, M.steel, sx * (STAIR_W / 2 + 0.1), DECK_Y + i * rise, z,
          0.08, 1.0, 0.08);
      }
      for (let i = 0; i < 20; i++) {
        const z = zBottom + i * tread;
        box(M.steel, sx * (STAIR_W / 2 + 0.1), DECK_Y + i * rise + 1.0, z + tread / 2,
          0.09, 0.09, tread * 1.3, 0);
      }
    }
  });
  // The four columns carrying the cantilever.
  prop(() => {
    for (const cx of [-11, 11]) for (const cz of [-62.5, -65.5])
      shape(G.cylBase, M.white, cx, DECK_Y, cz, 0.55, POOL_Y - DECK_Y, 0.55);
  });
}

// ---------------------------------------------------------------------------
// The POOL DECK — the roof of the house, and the only open deck with anything
// on it. Laid out fore to aft: observation deck, pool bar, the pool itself,
// the funnel, and a sun deck at the stern.
// ---------------------------------------------------------------------------
const POOL_X0 = -6, POOL_X1 = 6, POOL_Z_A = -8, POOL_Z_B = 10;
const POOL_FLOOR = POOL_Y - 1.25;      // ≈ 1 m of water — a lido pool, not a tank
const POOL_WATER = POOL_Y - 0.28;
{
  // The deck itself, laid AROUND the pool basin: four slabs, because a slab
  // with a hole in it is four slabs, and a single slab under the basin would
  // be a floor at deck level across the top of the water.
  longSlab(M.teak, -POOL_X2, POOL_X0, POOL_Z0, POOL_Z1, POOL_Y - 0.3, POOL_Y);
  longSlab(M.teak, POOL_X1, POOL_X2, POOL_Z0, POOL_Z1, POOL_Y - 0.3, POOL_Y);
  longSlab(M.teak, POOL_X0, POOL_X1, POOL_Z0, POOL_Z_A, POOL_Y - 0.3, POOL_Y);
  longSlab(M.teak, POOL_X0, POOL_X1, POOL_Z_B, POOL_Z1, POOL_Y - 0.3, POOL_Y);

  // The basin: tiled floor, tiled sides, and a coping round the rim.
  slab(M.poolTile, POOL_X0, POOL_X1, POOL_Z_A, POOL_Z_B, POOL_FLOOR - 0.25, POOL_FLOOR);
  // Basin walls: port and starboard (full length), forward (full width),
  // and aft broken around the wide walk-in stairs (-2.2 to 2.2)
  for (const sx of [[POOL_X0 - 0.3, POOL_X0], [POOL_X1, POOL_X1 + 0.3]])
    slab(M.poolTile, sx[0], sx[1], POOL_Z_A, POOL_Z_B, POOL_FLOOR, POOL_Y);
  slab(M.poolTile, POOL_X0 - 0.3, POOL_X1 + 0.3, POOL_Z_B, POOL_Z_B + 0.3, POOL_FLOOR, POOL_Y);
  slab(M.poolTile, POOL_X0 - 0.3, -2.2, POOL_Z_A - 0.3, POOL_Z_A, POOL_FLOOR, POOL_Y);
  slab(M.poolTile, 2.2, POOL_X1 + 0.3, POOL_Z_A - 0.3, POOL_Z_A, POOL_FLOOR, POOL_Y);

  // Coping around the rim — broken across the stairs so the entrance is clear
  prop(() => {
    for (const sx of [POOL_X0 - 0.15, POOL_X1 + 0.15])
      box(M.poolCoping, sx, POOL_Y + 0.04, (POOL_Z_A + POOL_Z_B) / 2,
        0.6, 0.08, POOL_Z_B - POOL_Z_A + 1.2);
    box(M.poolCoping, 0, POOL_Y + 0.04, POOL_Z_B + 0.15, POOL_X1 - POOL_X0 + 1.2, 0.08, 0.6);
    const aftLeftW = -2.2 - (POOL_X0 - 0.45);
    box(M.poolCoping, (POOL_X0 - 0.45 + -2.2) / 2, POOL_Y + 0.04, POOL_Z_A - 0.15, aftLeftW, 0.08, 0.6);
    const aftRightW = (POOL_X1 + 0.45) - 2.2;
    box(M.poolCoping, (2.2 + POOL_X1 + 0.45) / 2, POOL_Y + 0.04, POOL_Z_A - 0.15, aftRightW, 0.08, 0.6);
  });

  // Steps down into the pool: 5 progressive 0.25 m steps (< 0.3 m ground-snap limit)
  // allowing the player to walk smoothly down into the water and right back up.
  const STEPS_COUNT = 5;
  const poolStepRise = (POOL_Y - POOL_FLOOR) / STEPS_COUNT;
  const poolStepRun = 0.45;
  for (let i = 0; i < STEPS_COUNT; i++) {
    const zEnd = POOL_Z_A + (STEPS_COUNT - i) * poolStepRun;
    const top = POOL_FLOOR + (i + 1) * poolStepRise;
    slab(M.poolTile, -2.2, 2.2, POOL_Z_A, zEnd, POOL_FLOOR, top);
  }

  // Stainless steel pool handrails flanking the stairs on both sides
  prop(() => {
    const postTopY = POOL_Y + 0.90;
    const postBotY = POOL_Y + 0.25;
    const zTop = POOL_Z_A - 0.15;
    const zBot = POOL_Z_A + 2.0;
    const dz = zBot - zTop;
    const dy = postBotY - postTopY;
    const railL = Math.hypot(dz, dy);
    const railRx = Math.atan2(-dz, -dy);
    const zMid = (zTop + zBot) / 2;
    const yMid = (postTopY + postBotY) / 2;

    for (const sx of [-2.35, 2.35]) {
      // Upper stanchion (on deck coping edge)
      shape(G.cyl, M.steel, sx, POOL_Y + 0.015, zTop, 0.15, 0.03, 0.15);
      shape(G.cylBase, M.steel, sx, POOL_Y, zTop, 0.07, 0.90, 0.07);
      shape(G.sphere, M.steel, sx, postTopY, zTop, 0.08, 0.08, 0.08);

      // Lower stanchion (anchored on step 4 in the pool)
      const stepY = POOL_FLOOR + poolStepRise;
      const lowerH = postBotY - stepY;
      shape(G.cyl, M.steel, sx, stepY + 0.015, zBot, 0.15, 0.03, 0.15);
      shape(G.cylBase, M.steel, sx, stepY, zBot, 0.07, lowerH, 0.07);
      shape(G.sphere, M.steel, sx, postBotY, zBot, 0.08, 0.08, 0.08);

      // Sloped handrail & mid-rail
      shape(G.cyl, M.steel, sx, yMid, zMid, 0.07, railL, 0.07, { rx: railRx });
      shape(G.cyl, M.steel, sx, yMid - 0.32, zMid, 0.05, railL, 0.05, { rx: railRx });
    }
  });

  // Loungers, in ranks down both sides of the pool. Every one is a prop: a
  // rank of them at deck level would carpet the pool deck in false floor.
  function lounger(cx, cz, ry, hasTowel) {
    atY(0, cx, cz, ry, () => prop(() => {
      const pad = hasTowel ? M.towel : M.cushionTeal;
      const head = hasTowel ? M.cushionTeal : M.pillow;
      for (const dx of [-0.32, 0.32]) {
        shape(G.cylBase, M.steel, dx, POOL_Y, -0.7, 0.05, 0.34, 0.05);
        shape(G.cylBase, M.steel, dx, POOL_Y, 0.7, 0.05, 0.34, 0.05);
      }
      box(M.white, 0, POOL_Y + 0.36, 0, 0.78, 0.06, 1.9);
      box(pad, 0, POOL_Y + 0.43, 0.05, 0.72, 0.08, 1.7);
      // Head pillow on the pad. box() has no rx, so a raised back here
      // was a second slab floating 35 cm up.
      box(head, 0, POOL_Y + 0.51, -0.62, 0.56, 0.10, 0.36);
    }));
  }
  for (let i = 0; i < 7; i++) {
    lounger(-8.6, -7 + i * 2.6, Math.PI / 2, i % 3 === 0);
    lounger(8.6, -7 + i * 2.6, -Math.PI / 2, i % 3 === 1);
  }
  // Parasols between every second pair.
  prop(() => {
    for (const sx of [-11.4, 11.4]) for (let i = 0; i < 4; i++) {
      const z = -6 + i * 4.4;
      shape(G.cyl, M.steel, sx, POOL_Y + 0.06, z, 0.5, 0.12, 0.5);
      shape(G.cylBase, M.steel, sx, POOL_Y, z, 0.07, 2.5, 0.07);
      // G.canopy grows UP from its base, so a parasol is a positive cone
      // standing on its rim. A negative Y scale flips the winding and renders
      // the canopy inside out — from underneath, which is where you stand.
      shape(G.canopy, i % 2 ? M.hullBoot : M.hullNavy, sx, POOL_Y + 1.92, z,
        3.2, 0.66, 3.2);
    }
  });

  // Pool bar, forward of the pool, under a canopy.
  {
    const bz = 20;
    prop(() => {
      shape(G.cyl, M.midWood, 0, POOL_Y + 0.56, bz, 8.0, 1.12, 5.0);
      shape(G.cyl, M.teak, 0, POOL_Y + 1.16, bz, 8.4, 0.1, 5.3);
      box(M.midWood, 0, POOL_Y + 1.2, bz + 2.0, 5.0, 2.4, 0.4);
      for (let i = 0; i < 18; i++)
        shape(G.cyl, i % 3 === 0 ? M.velvetGold : i % 3 === 1 ? M.poolTile : M.hullBoot,
          -2.2 + i * 0.26, POOL_Y + 1.7, bz + 1.8, 0.12, 0.4, 0.12);
      for (let i = 0; i < 7; i++) {
        const a = -1.0 + i * 0.33;
        shape(G.cylBase, M.steel, Math.sin(a) * 4.6, POOL_Y, bz - Math.cos(a) * 3.0,
          0.1, 0.76, 0.1);
        shape(G.cyl, M.towel, Math.sin(a) * 4.6, POOL_Y + 0.8, bz - Math.cos(a) * 3.0,
          0.46, 0.14, 0.46);
      }
      // Thatch canopy on four posts.
      for (const [px, pz] of [[-4.4, bz - 3.4], [4.4, bz - 3.4], [-4.4, bz + 2.6], [4.4, bz + 2.6]])
        shape(G.cylBase, M.midWood, px, POOL_Y, pz, 0.14, 3.2, 0.14);
      shape(G.canopy, M.cream, 0, POOL_Y + 2.7, bz - 0.4, 12.5, 1.5, 9.0);
    });
    const sign = canvasMat(512, 128, (g, W, H) => {
      g.fillStyle = '#0d3550';
      g.fillRect(0, 0, W, H);
      paintText(g, 'LIDO BAR', W / 2, H / 2, 64, '#ffd98a');
    }, { emissive: 0xffffff, emissiveIntensity: 0.5 });
    prop(() => shape(G.card, sign, 0, POOL_Y + 2.9, bz + 1.78, 4.6, 1.15, 1));
  }

  // The funnel, aft of the pool: navy with the line's gold band and a black
  // top. It rakes aft, which is most of what makes a funnel look fast.
  {
    const fz = -30;
    shape(G.funnel, M.hullNavy, 0, POOL_Y + 5.5, fz, 11.0, 11.0, 7.0, { rx: -0.10 });
    shape(G.funnel, M.velvetGold, 0, POOL_Y + 9.6, fz + 0.45, 11.3, 1.7, 7.2, { rx: -0.10 });
    shape(G.funnel, M.black, 0, POOL_Y + 11.0, fz + 0.6, 11.0, 1.2, 7.0, { rx: -0.10 });
    shape(G.cyl, M.black, 0, POOL_Y + 11.5, fz + 0.65, 9.6, 0.3, 6.0, { rx: -0.10 });
    prop(() => {
      // Whistle and the platform round the base.
      for (const dx of [-1.2, 1.2])
        shape(G.cyl, M.brass, dx, POOL_Y + 10.4, fz - 3.0, 0.5, 1.3, 0.5);
      box(M.steel, 0, POOL_Y + 0.4, fz, 13.0, 0.16, 9.0);
    });
    railRun(-6.5, 6.5, fz - 4.5, fz - 4.5, POOL_Y + 0.48, 1.0);
    railRun(-6.5, 6.5, fz + 4.5, fz + 4.5, POOL_Y + 0.48, 1.0);
  }

  // Sun deck aft of the funnel, and the observation deck forward.
  for (let i = 0; i < 6; i++) {
    lounger(-9.5 + (i % 3) * 3.2, -46 - Math.floor(i / 3) * 2.8, 0, i % 2 === 0);
    lounger(4.5 + (i % 3) * 3.2, -46 - Math.floor(i / 3) * 2.8, 0, i % 2 === 1);
  }
  // A shuffleboard court painted on the sun deck. Paint, so it is emitted as
  // floor rather than as a prop — see the atrium's compass rose. Like that
  // rose it is sunk 5 mm INTO the deck rather than floated above it: paint
  // laid flat on a floor wants to overlap the floor, never to hover over it
  // with a hairline of air between.
  for (let i = 0; i < 6; i++)
    box(M.linen, 0, POOL_Y + 0.005, -54 + i * 1.6, 3.2, 0.02, 0.08);
  box(M.hullBoot, 0, POOL_Y + 0.005, -55.6, 3.2, 0.02, 0.1);
  prop(() => {
    // Benches and telescopes on the observation deck.
    for (const bx of [-9, 0, 9]) {
      box(M.teak, bx, POOL_Y + 0.44, 46, 2.4, 0.09, 0.55);
      for (const dx of [-1.0, 1.0]) box(M.steel, bx + dx, POOL_Y + 0.22, 46, 0.1, 0.44, 0.5);
      box(M.teak, bx, POOL_Y + 0.75, 46.3, 2.4, 0.55, 0.09);
    }
    for (const tx of [-6, 6]) {
      shape(G.cylBase, M.steel, tx, POOL_Y, 56, 0.12, 1.3, 0.12);
      shape(G.cyl, M.black, tx, POOL_Y + 1.45, 56, 0.22, 0.9, 0.22, { rx: 1.1 });
    }
  });

  // Railings all round the pool deck. The aft run is BROKEN over the head of
  // the stair: run through, it was a fence across the top step and the pool
  // deck could not be reached at all.
  railRun(-POOL_X2, POOL_X2, POOL_Z1, POOL_Z1, POOL_Y);
  railRun(-POOL_X2, -STAIR_W / 2 - 0.3, POOL_Z0, POOL_Z0, POOL_Y);
  railRun(STAIR_W / 2 + 0.3, POOL_X2, POOL_Z0, POOL_Z0, POOL_Y);
  railRun(-POOL_X2, -POOL_X2, POOL_Z0, POOL_Z1, POOL_Y);
  railRun(POOL_X2, POOL_X2, POOL_Z0, POOL_Z1, POOL_Y);

  prop(() => {
    for (const sx of [-1, 1])
      for (let i = 0; i < 26; i++) {
        const z = -10 + i * 1.4;
        shape(G.sphere, M.lamp, sx * (5.5 + Math.sin(i * 0.7) * 0.5),
          POOL_Y + 3.4 + Math.sin(i * 0.5) * 0.2, z, 0.13, 0.13, 0.13);
      }
    // The masts the lights are strung from.
    for (const [mx, mz] of [[-6, -11], [6, -11], [-6, 25], [6, 25]])
      shape(G.cylBase, M.steel, mx, POOL_Y, mz, 0.11, 3.6, 0.11);
  });
}

// Bridge, forward on the pool deck: the one part of the ship the player can
// see into but not enter, which is exactly its status in life.
{
  const bz = SUP_Z1 - 4;
  slab(M.white, -12, 12, bz - 4, bz + 4, POOL_Y, POOL_Y + 3.4);
  prop(() => {
    box(M.glass, 0, POOL_Y + 2.4, bz - 4.1, 22.4, 1.5, 0.2);
    for (const sx of [-1, 1]) box(M.glass, sx * 12.1, POOL_Y + 2.4, bz, 0.2, 1.5, 7.4);
    // Bridge wings, out over the ship's side.
    for (const sx of [-1, 1]) box(M.white, sx * 14, POOL_Y + 0.2, bz, 4.4, 0.4, 3.4);
  });
  for (const sx of [-1, 1]) railRun(sx * 12, sx * 16, bz - 1.7, bz - 1.7, POOL_Y + 0.4, 1.0);
  // The mast, over the bridge.
  prop(() => {
    shape(G.cylBase, M.white, 0, POOL_Y + 3.4, bz, 0.4, 9.0, 0.4);
    box(M.white, 0, POOL_Y + 8.6, bz, 5.4, 0.16, 0.16);
    shape(G.sphere, M.lamp, 0, POOL_Y + 12.6, bz, 0.3, 0.3, 0.3);
  });
}

// Lifeboats, in davits along both sides. They are the single most recognisable
// thing on a liner's profile, so each one gets enough construction detail to
// read as safety equipment rather than an orange hanging prop: a tapered
// capsule hull, a raised enclosed cabin, a dark window band, white markings,
// a life ring, a navigation lamp and a proper cradle suspended from angled
// davits. They sit outboard of the promenade rail and above head height, so
// they frame the walk instead of blocking it with a low orange ceiling.
prop(() => {
  for (const sx of [-1, 1]) {
    for (let i = 0; i < 6; i++) {
      const z = -44 + i * 18;
      const x = sx * (SUP_X2 + 3.35);
      const y = DECK_Y + 4.72;

      // Hull and low rounded cabin. The cabin is offset upward so the lower
      // orange shoulder remains visible from the promenade and from the sea.
      shape(G.lifeboat, M.boatOrange, x, y, z, 1.82, 0.86, 2.48);
      shape(G.lifeboatCabin, M.boatOrangeLight, x, y + 0.34, z, 1.48, 0.36, 1.58);

      // Three side windows with narrow orange mullions between them. A small
      // forward pane makes the bow readable when looking down the deck.
      for (const wx of [-0.78, 0, 0.78]) {
        for (const side of [-1, 1])
          box(M.boatWindow, x + side * 0.79, y + 0.36, z + wx,
            0.045, 0.19, 0.48);
      }
      box(M.boatWindow, x, y + 0.38, z + 1.28, 0.82, 0.19, 0.05);

      // SOLAS-style banding and roof marker. The side bands are kept clear of
      // the rounded ends so the hull still tapers naturally at bow and stern.
      for (const side of [-1, 1])
        box(M.white, x + side * 0.86, y - 0.02, z, 0.055, 0.11, 2.05);
      box(M.white, x, y + 0.72, z, 0.20, 0.055, 2.55);
      box(M.boatRubber, x, y - 0.36, z - 1.18, 0.55, 0.15, 0.28);

      // A highly visible life ring and the small roof beacon give the craft
      // scale and make the safety function obvious from the player camera.
      for (const side of [-1, 1]) {
        shape(G.torus, M.white, x + side * 0.94, y + 0.03, z - 0.28,
          0.25, 0.25, 0.25, { rz: side * Math.PI / 2 });
        shape(G.cyl, M.boatOrange, x + side * 0.94, y + 0.03, z - 0.28,
          0.12, 0.07, 0.12, { rz: side * Math.PI / 2 });
      }
      shape(G.sphere, M.warmLampBright, x, y + 0.83, z + 0.15, 0.10, 0.10, 0.10);

      // Steel cradle under the hull, plus an L-shaped davit bracket from the
      // house side: a short post at the roofline, then a level arm out to
      // the boat. Square, not a diagonal boom, so it reads as a fitting
      // bolted to the ship rather than a stray pole. The rope hangs from
      // the outboard end and stays visually separate from the boat body.
      for (const dz of [-1.65, 1.65]) {
        box(M.steel, x, y - 0.47, z + dz, 1.35, 0.12, 0.12);
        box(M.steel, x, y - 0.26, z + dz, 0.12, 0.38, 0.12);
        const baseX = sx * (SUP_X2 + 0.35);
        const topX = x;
        const armY = y + 0.92;
        shape(G.cylBase, M.steel, baseX, CEIL_Y - 0.3, z + dz,
          0.10, armY - (CEIL_Y - 0.3), 0.10);
        box(M.steel, (baseX + topX) / 2, armY, z + dz, Math.abs(topX - baseX), 0.12, 0.12);
        shape(G.cyl, M.boatRope, topX, y + 0.31, z + dz,
          0.025, 1.18, 0.025);
      }
      // Small mounting shoes visually anchor the pod to the ship instead of
      // leaving it floating in front of the superstructure.
      for (const side of [-1, 1]) {
        box(M.steel, x + side * 0.66, y - 0.54, z - 1.15, 0.16, 0.14, 0.42);
        box(M.steel, x + side * 0.66, y - 0.54, z + 1.15, 0.16, 0.14, 0.42);
      }
    }
  }
});

// Deck furniture on the promenade: benches against the house, with the
// backrests inboard so passengers sit facing the hull and the sea.
prop(() => {
  for (const sx of [-1, 1])
    for (let z = -50; z < 55; z += 13) {
      if (Math.abs(z + 8) < 6) continue;               // keep the doorways clear
      const cx = sx * (SUP_X2 + 1.1);
      for (let i = 0; i < 5; i++)
        shape(benchSeatSlat, M.benchWood, cx + sx * (i - 2) * 0.108,
          DECK_Y + 0.46, z, 1, 1, 1);
      for (let i = 0; i < 4; i++)
        shape(benchBackSlat, M.benchWood, cx - sx * (0.27 + i * 0.022),
          DECK_Y + 0.59 + i * 0.115, z, 1, 1, 1, { rz: sx * 0.18 });
      for (const dz of [-0.87, 0.87]) {
        box(M.benchMetal, cx, DECK_Y + 0.40, z + dz, 0.53, 0.055, 0.065);
        for (const dx of [-0.21, 0.21]) {
          box(M.benchMetal, cx + sx * dx, DECK_Y + 0.20, z + dz, 0.055, 0.40, 0.065);
          box(M.benchMetal, cx + sx * dx, DECK_Y + 0.018, z + dz, 0.12, 0.035, 0.13);
        }
        shape(G.box, M.benchMetal, cx - sx * 0.32, DECK_Y + 0.70, z + dz,
          0.045, 0.58, 0.055, { rz: sx * 0.18 });
        box(M.benchMetal, cx + sx * 0.16, DECK_Y + 0.57, z + dz, 0.04, 0.24, 0.04);
        shape(benchArm, M.benchWood, cx - sx * 0.025, DECK_Y + 0.71, z + dz, 1, 1, 1);
      }
    }
});
{
  // Gangway signs at the starboard atrium door.
  //
  // A 4.2 m banner across the 2.4 m opening was cut by the lintel ("CO"/"UM").
  // Splitting the two words onto the side windows then reversed the phrase
  // from the lobby (turning 180° swaps left and right). Negative scale on a
  // FrontSide plane reversed the winding, so the face was culled and ATRIUM
  // vanished. Each plaque now carries the FULL phrase, positive scale, one
  // FrontSide card per face.
  const signY = DECK_Y + 3.1;
  const doorZ = -8 + DOOR_W / 2;
  const mk = (W, H, lines, px) => canvasMat(W, H, (g, w, h) => {
    g.fillStyle = '#12314f';
    g.fillRect(0, 0, w, h);
    g.strokeStyle = '#e8c063';
    g.lineWidth = Math.max(6, h * 0.04);
    g.strokeRect(10, 10, w - 20, h - 20);
    for (let i = 0; i < lines.length; i++)
      paintText(g, lines[i], w / 2, h * (i + 1) / (lines.length + 1), px, '#e8c063');
  }, { emissive: 0xffffff, emissiveIntensity: 0.3, side: THREE.FrontSide });
  const lineMat = mk(768, 128, ['COUPÉE · ATRIUM'], 48);
  const stackMat = mk(512, 256, ['COUPÉE', 'ATRIUM'], 64);
  const put = (mat, x, z, w, h, ry) =>
    shape(G.card, mat, x, signY, z, w, h, 1, { ry });
  prop(() => {
    // Lintel — stacked, so the order is the same from promenade and lobby.
    put(stackMat, SUP_X2 + 0.20, doorZ, DOOR_W - 0.25, 0.88, Math.PI / 2);
    put(stackMat, SUP_X2 - 0.20, doorZ, DOOR_W - 0.25, 0.88, -Math.PI / 2);
    // Each window pane beside the door: the whole phrase, not one word.
    for (const z of [-10.0, -4.0]) {
      put(lineMat, SUP_X2 + 0.20, z, 2.15, 0.72, Math.PI / 2);
      put(lineMat, SUP_X2 - 0.20, z, 2.15, 0.72, -Math.PI / 2);
    }
  });
}

flushKits();
console.log('[cruise] flushKits completed');

// ---------------------------------------------------------------------------
// The sea. One big plane on `scene` (never `world`: the sea must not collide,
// and it must never become a floor). The ship is static, so ALL of the sense
// of making way lives here — the normals scroll astern, and the wake is drawn
// as foam quads that ride with the hull.
// ---------------------------------------------------------------------------
const seaMat = new THREE.MeshStandardMaterial({
  color: 0x1f6d96, roughness: 0.14, metalness: 0.28,
  normalMap: waterN, normalScale: new THREE.Vector2(0.55, 0.55),
  transparent: true, opacity: 0.94,
});
const seaUniforms = { uTime: { value: 0 } };
seaMat.onBeforeCompile = shader => {
  shader.uniforms.uTime = seaUniforms.uTime;
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', `#include <common>
      uniform float uTime;`)
    .replace('#include <begin_vertex>', `#include <begin_vertex>
      // A long swell crossed by a shorter one. Geometry, not a normal map:
      // from the pool deck the horizon has to actually undulate, and a flat
      // plane with a moving normal reads as wet lino from up there.
      float sw = sin( position.x * 0.014 + uTime * 0.55 ) * 1.5
               + sin( position.y * 0.021 - uTime * 0.78 ) * 0.9
               + sin( ( position.x + position.y ) * 0.037 + uTime * 1.1 ) * 0.35;
      transformed.z += sw;`);
};
const sea = new THREE.Mesh(new THREE.PlaneGeometry(6000, 6000, 240, 240), seaMat);
sea.rotation.x = -Math.PI / 2;
sea.position.y = SEA_Y;
sea.receiveShadow = false;
scene.add(sea);

// Wake and bow wave. Additive foam cards that sit just over the water: the
// bow throws two diverging crests, the stern drags a widening band astern.
const foamTex = (() => {
  const c = Object.assign(document.createElement('canvas'), { width: 256, height: 256 });
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(128, 128, 10, 128, 128, 128);
  grad.addColorStop(0, 'rgba(255,255,255,0.95)');
  grad.addColorStop(0.55, 'rgba(235,248,255,0.35)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 500; i++) {
    g.fillStyle = `rgba(255,255,255,${Math.random() * 0.5})`;
    g.fillRect(Math.random() * 256, Math.random() * 256, 2 + Math.random() * 5, 2);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
})();
const wakeMat = new THREE.MeshBasicMaterial({
  map: foamTex, transparent: true, opacity: 0.5, depthWrite: false,
  blending: THREE.AdditiveBlending, fog: true,
});
const wakeParts = [];
{
  // Two diverging bow crests.
  for (const sx of [-1, 1]) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(9, 120), wakeMat);
    m.rotation.x = -Math.PI / 2;
    m.rotation.z = sx * 0.16;
    m.position.set(sx * 26, SEA_Y + 0.25, 24);
    scene.add(m);
    wakeParts.push(m);
  }
  // Foam running down each side, at the waterline.
  for (const sx of [-1, 1]) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(4.5, 180), wakeMat);
    m.rotation.x = -Math.PI / 2;
    m.position.set(sx * (BEAM2 + 1.6), SEA_Y + 0.3, 0);
    scene.add(m);
    wakeParts.push(m);
  }
  // The wake astern, widening as it goes.
  const stern = new THREE.Mesh(new THREE.PlaneGeometry(46, 340), wakeMat);
  stern.rotation.x = -Math.PI / 2;
  stern.position.set(0, SEA_Y + 0.28, -270);
  scene.add(stern);
  wakeParts.push(stern);
}

// A pair of gulls following the ship, and a distant island off the beam —
// without something out there the sea reads as a shader, not a place.
//
// A gull is a body + a wing, not a lozenge with a stick through it: the old
// wing was a bare rectangle, which face-on to the camera reads as the thin
// grey bar it visibly was. The wing below is a swept, tapered shape (root
// wide, tip narrow and raked back) so it silhouettes as a wing from every
// angle the flap passes through, and its outer third is tinted toward
// charcoal — the dark primary-tip marking that is most of what makes a gull
// read as a gull rather than a paper airplane.
function buildGullWingGeometry() {
  const shape = new THREE.Shape();
  shape.moveTo(0, 0.16);
  shape.quadraticCurveTo(0.7, 0.32, 1.35, 0.24);
  shape.quadraticCurveTo(2.0, 0.14, 2.4, -0.08);
  shape.lineTo(1.75, -0.2);
  shape.quadraticCurveTo(0.9, -0.16, 0.15, -0.08);
  shape.lineTo(0, 0.16);
  const geo = new THREE.ShapeGeometry(shape);
  const pos = geo.attributes.position;
  const white = new THREE.Color(0xf2f0e9);
  const tip = new THREE.Color(0x2c2c30);
  const colors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const t = THREE.MathUtils.smoothstep(pos.getX(i), 1.25, 2.35);
    const c = white.clone().lerp(tip, t);
    colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geo;
}
const gullWingGeo = buildGullWingGeometry();
const gullWingMat = new THREE.MeshStandardMaterial({
  color: 0xffffff, vertexColors: true, roughness: 0.85, side: THREE.DoubleSide,
});
const gullBodyMat = new THREE.MeshStandardMaterial({ color: 0xf4f2ec, roughness: 0.8 });
const gullBeakMat = new THREE.MeshStandardMaterial({ color: 0xe0a53c, roughness: 0.5 });
const gulls = [];
for (let i = 0; i < 5; i++) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 6), gullBodyMat);
  body.scale.set(0.62, 0.55, 1.55);
  g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 6), gullBodyMat);
  head.position.set(0, 0.08, 0.52);
  g.add(head);
  const beak = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.24, 6), gullBeakMat);
  beak.rotation.x = Math.PI / 2;
  beak.position.set(0, 0.06, 0.74);
  g.add(beak);
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.6, 4), gullBodyMat);
  tail.rotation.x = -Math.PI / 2;
  tail.scale.set(1, 0.28, 1);
  tail.position.z = -0.68;
  g.add(tail);
  for (const sx of [-1, 1]) {
    const w = new THREE.Mesh(gullWingGeo, gullWingMat);
    w.scale.x = sx;
    w.position.x = sx * 0.16;
    g.add(w);
    g.userData[sx > 0 ? 'wR' : 'wL'] = w;
  }
  g.position.set((rnd() - 0.5) * 70, 26 + rnd() * 16, -60 - rnd() * 60);
  g.rotation.y = (rnd() - 0.5) * 0.6;
  scene.add(g);
  gulls.push({ g, phase: rnd() * 6.28, speed: 0.6 + rnd() * 0.5 });
}
// ---------------------------------------------------------------------------
// Deserted mountainous island off the port beam, and lively oceanic fauna
// (jumping dolphins and breaching orcas with dynamic splashes & foam).
// ---------------------------------------------------------------------------
const islandData = buildDesertedIsland(scene);
const marineFauna = createMarineFauna(scene);


// ---------------------------------------------------------------------------
// Collision world, ground probe, controller.
//
// groundFn has NO analytic fallback — see the note at the top of the file. A
// miss means open water, and open water is not a floor.
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
    rayTargets = world.children.slice();
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

const GROUND_REACH = 60;
function groundFn(x, z, yFrom, feetY, prevY = feetY) {
  const cap = Math.max(feetY + 0.75, prevY + 0.3);
  let best = null;
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
ctrl.speedMult = 1.25;

const travelParams = new URLSearchParams(location.search);
// You arrive at the starboard door, on the promenade deck, facing inboard —
// which is the shot the whole map is laid out around: the house on your left,
// the sea on your right, and the lifeboats overhead.
const spawnPoint = new THREE.Vector3(SUP_X2 + 2.6, DECK_Y + 0.3, -6.6);
ctrl.rescueTo(spawnPoint);

const rig = new CameraRig(camera, bw);
const input = new Input(renderer.domElement);
input.yaw = Math.PI / 2;             // looking inboard, at the atrium door
function requestGamePointerLock() {
  try {
    const pending = renderer.domElement.requestPointerLock?.();
    pending?.catch?.(() => {});
  } catch (_) {}
}

// ---------------------------------------------------------------------------
// Time of day. Two states — the beach has three because a west-facing beach is
// about its sunset; a ship at sea is about being lit from inside after dark.
// Night is where this map earns its keep: every window, chandelier, neon and
// string light comes on at once.
// ---------------------------------------------------------------------------
const TIME_STATES = {
  day: {
    sunDir: new THREE.Vector3(-70, 150, 40).normalize(),
    sun: { color: 0xfff4e2, intensity: 2.5, visible: true },
    moon: 0,
    // The "ground" here is the sea, so the bounce genuinely is blue — but at
    // full saturation every shadow on the ship turned navy and the shaded half
    // of the deck looked like open water.
    hemi: { sky: 0xdcecff, ground: 0x6f93aa, intensity: 0.95 },
    sky: { horizon: 0xdfeaf2, zenith: 0x4a83cc, glow: 0xffeccc, strength: 0.5, tightness: 10 },
    fog: { color: 0xbcd6e6, near: 260, far: 1700 },
    exposure: 1.0,
    env: 0.55,
    sea: { color: 0x1f6d96, roughness: 0.14, opacity: 0.94 },
    wake: 0.5,
    lamp: 0.16,       // the fittings are on, but daylight swamps them
    neon: 0.35,
    glow: 0,
    stars: false,
  },
  night: {
    sunDir: new THREE.Vector3(70, 130, -60).normalize(),
    sun: { color: 0x9fc4f2, intensity: 0, visible: false },
    moon: 0.85,
    // A shade more fill than the sky alone would give. The rooms have no real
    // lights in them — every fitting is emissive geometry, which lights itself
    // and nothing else — so at 0.26 the roulette tables and the ballroom
    // chairs were black cut-outs under a glowing chandelier.
    hemi: { sky: 0x2c4260, ground: 0x121c26, intensity: 0.44 },
    sky: { horizon: 0x101d31, zenith: 0x050a16, glow: 0x9fc4f2, strength: 0.34, tightness: 20 },
    fog: { color: 0x0c1622, near: 160, far: 1200 },
    exposure: 1.06,
    env: 0.14,
    sea: { color: 0x0a2135, roughness: 0.07, opacity: 0.95 },
    wake: 0.32,
    lamp: 1.5,
    neon: 2.1,
    glow: 1.25,
    stars: true,
  },
};

let cruiseTime = 'day';
function setCruiseTime(name) {
  const s = TIME_STATES[name] ?? TIME_STATES.day;
  cruiseTime = TIME_STATES[name] ? name : 'day';

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
  stars.visible = s.stars;

  scene.fog.color.setHex(s.fog.color);
  scene.fog.near = s.fog.near;
  scene.fog.far = s.fog.far;
  scene.background.copy(scene.fog.color);
  renderer.toneMappingExposure = s.exposure;
  scene.environmentIntensity = s.env;

  seaMat.color.setHex(s.sea.color);
  seaMat.roughness = s.sea.roughness;
  seaMat.opacity = s.sea.opacity;
  wakeMat.opacity = s.wake;

  M.lamp.emissiveIntensity = s.lamp;
  M.neonPink.emissiveIntensity = s.neon;
  M.neonCyan.emissiveIntensity = s.neon;
  M.glass.emissiveIntensity = s.glow;
  M.glass.opacity = cruiseTime === 'night' ? 0.55 : 0.30;
  for (const m of casinoNeon) m.emissiveIntensity = s.neon * 0.85;
  // The ballroom is feutrée at every hour, so its lamps are TRIMMED, never
  // switched: the candles and the dome are fixed emissives that ignore the
  // day/night dimmer entirely, and only these five point lights move — and
  // only from 0.6 to 1.0. Put on M.lamp with everything else, the whole room
  // went out at dawn and the dance floor was lit by the sea through a gap in
  // the drapes.
  for (const l of ballLights) l.intensity = l.userData.base * (cruiseTime === 'night' ? 1 : 0.6);
  // The leaded screens are a BACKLIT panel, not a window: after dark the sea
  // behind them is black and the glass has to carry its own light, and by day
  // it has to sit over M.glass, which the same dimmer drives to a bright warm
  // sheet for the benefit of anyone out on the promenade. At a flat 0.3 the
  // ship's own glass burned straight through the amber and the fore end of
  // the ballroom had two white slots in it at both hours.
  M.leadedWindow.emissiveIntensity = cruiseTime === 'night' ? 0.62 : 0.22;

  updateSunShadow(ctrl.pos);
  window.__nightMode = cruiseTime === 'night';
  window.__cruiseTime = cruiseTime;
  syncTimeButtons();
}

function syncTimeButtons() {
  document.querySelectorAll('.tt-btn').forEach(btn =>
    btn.classList.toggle('active', btn.dataset.time === cruiseTime));
}
document.querySelectorAll('.tt-btn').forEach(btn => {
  btn.addEventListener('click', () => setCruiseTime(btn.dataset.time));
});

const people = [];
const hook = {
  THREE, scene, camera, renderer, world, ctrl, rig, input, spawnPoint, bw,
  setCruiseTime, TIME_STATES, seaUniforms,
  DECK_Y, POOL_Y, CEIL_Y, SHIP_L2, BEAM2, SUP_X2, SUP_Z0, SUP_Z1,
  CASINO_Z, ATRIUM_Z, CABIN_Z, BALL_Z, CABIN_Y, CABIN_STAIR,
  get BED_SPOT() { return typeof BED_SPOT !== 'undefined' ? BED_SPOT : null; },
  get BED_X() { return typeof BED_X !== 'undefined' ? BED_X : null; },
  get BED_Z() { return typeof BED_Z !== 'undefined' ? BED_Z : null; },
  get BED_TOP() { return typeof BED_TOP !== 'undefined' ? BED_TOP : null; },
  nearBed: (...a) => nearBed(...a),
  lieDown: (...a) => lieDown(...a),
  updateLie: (...a) => updateLie(...a),
  POOL_X0, POOL_X1, POOL_Z_A, POOL_Z_B, POOL_FLOOR,
  people,
  halfBeam,
  get player() { return player; },
  get cruiseTime() { return cruiseTime; },
  get lieState() { return typeof lieState !== 'undefined' ? lieState : null; },
  get cabinAskOpen() { return typeof cabinAskOpen !== 'undefined' ? cabinAskOpen : false; },
  islandData,
  marineFauna,
};
window.__cruise = hook;
window.__villa = hook;
console.log('[cruise] hook set on window early');

// ---------------------------------------------------------------------------
console.log('[cruise] loading player...');
try {
  player = new Player(scene);
  await player.load('girl', girlMatFor);
  player.addWardrobePart('hairCrown', harmoniseHair(player, {
    scalp: await charImage(CHAR_MATS?.MAT_SurvGirl_Head?.tex || 'survgirl_head_diff.webp'),
    strands: await charImage(CHAR_MATS?.MAT_SurvGirl_Hair?.tex || 'survgirl_hair_diff.webp'),
    strandsAO: await charImage(CHAR_MATS?.MAT_SurvGirl_Hair?.aoTex || 'survgirl_hair_ao.webp'),
  }));
  console.log('[cruise] player loaded successfully');
} catch (err) {
  console.error('[cruise] player load error:', err);
}

// ---------------------------------------------------------------------------
// Passengers. Ready Player Me guests, never the pack rig — a crowd built from
// the player's own base is a crowd wearing the player's face.
// ---------------------------------------------------------------------------
try {
  const guests = [];
  for (const [model, walk, idle, h, rc] of [
    ['woman.glb', 'walk.glb', 'idle.glb', 1.68, 'atlas'],
    ['man.glb', 'walk_m.glb', 'idle_m.glb', 1.80, 'atlas-dark'],
  ]) {
    try {
      console.log('[cruise] loading guest rig:', model);
      guests.push(await loadGuestRig({
        model: `./glb/visitors/${model}?v=1`,
        walk: `./glb/visitors/${walk}?v=1`,
        idle: `./glb/visitors/${idle}?v=1`,
        height: h, recolor: rc,
      }));
      console.log('[cruise] loaded guest rig:', model);
    } catch (e) { console.warn('[cruise] guest rig', model, e); }
  }
  console.log('[cruise] all guests loaded, count:', guests.length);
  const Gg = i => guests[i % guests.length];
  const visitor = (i, opts = {}) => makeVisitor(Gg(i).scene, Gg(i).walkClip, rnd, {
    guest: Gg(i), idleClip: Gg(i).idleClip, look: 'beach', ...opts,
  });

  if (guests.length) {
    // Someone standing still, wherever you put them.
    const stand = (i, x, y, z, yaw, opts = {}) => {
      const v = visitor(i, { playIdle: true, ...opts });
      v.group.position.set(x, y, z);
      v.group.rotation.y = yaw;
      scene.add(v.group);
      people.push({ ...v, kind: 'idle', baseYaw: yaw, phase: rnd() * 6.28 });
      return v;
    };
    // Someone walking a beat, back and forth along Z.
    const patrol = (i, x, y, z0, z1, yaw, opts = {}) => {
      const v = visitor(i, opts);
      v.group.position.set(x, y, z0);
      v.group.rotation.y = yaw;
      scene.add(v.group);
      people.push({
        ...v, kind: 'patrol', x, z0, z1, dir: 1,
        speed: v.speed * (0.7 + rnd() * 0.3),
      });
    };

    // Promenade deck, both sides.
    patrol(0, SUP_X2 + 2.2, DECK_Y, -40, 40, 0);
    patrol(1, SUP_X2 + 2.6, DECK_Y, 30, -30, Math.PI);
    patrol(2, -(SUP_X2 + 2.2), DECK_Y, -34, 36, 0);
    patrol(3, -(SUP_X2 + 2.6), DECK_Y, 42, -20, Math.PI);
    stand(4, SUP_X2 + 3.0, DECK_Y, 52, Math.PI / 2);      // at the rail, forward
    stand(5, -(SUP_X2 + 3.0), DECK_Y, -52, -Math.PI / 2);

    // =========================================================================
    // Casino Royale: Staff (croupiers, dealers, barmen) & Players / Guests
    // =========================================================================
    const casinoStaff = { look: null, uniform: { shirt: 0x16161c, pants: 0x121216, shoes: 0x08080a, hat: false } };
    const casinoGuest = { look: null };
    let npcIdx = 6;

    // 1. Port Roulette Table (cx = -6.4, cz = z0 + 14.5)
    // Croupier standing cleanly behind the wheel at z0 + 17.8 (outside table geometry)
    stand(npcIdx++, -6.4, DECK_Y, CASINO_Z[0] + 17.8, Math.PI, casinoStaff);
    stand(npcIdx++, -5.2, DECK_Y, CASINO_Z[0] + 11.2, 0, casinoGuest);
    stand(npcIdx++, -7.6, DECK_Y, CASINO_Z[0] + 11.2, 0, casinoGuest);
    stand(npcIdx++, -8.8, DECK_Y, CASINO_Z[0] + 14.5, Math.PI / 2, casinoGuest);
    stand(npcIdx++, -4.0, DECK_Y, CASINO_Z[0] + 15.0, -Math.PI / 2, casinoGuest);

    // 2. Starboard Roulette Table (cx = 6.4, cz = z0 + 14.5)
    // Croupier standing cleanly behind the wheel at z0 + 17.8
    stand(npcIdx++, 6.4, DECK_Y, CASINO_Z[0] + 17.8, Math.PI, casinoStaff);
    stand(npcIdx++, 5.2, DECK_Y, CASINO_Z[0] + 11.2, 0, casinoGuest);
    stand(npcIdx++, 7.6, DECK_Y, CASINO_Z[0] + 11.2, 0, casinoGuest);
    stand(npcIdx++, 4.0, DECK_Y, CASINO_Z[0] + 14.5, Math.PI / 2, casinoGuest);
    stand(npcIdx++, 8.8, DECK_Y, CASINO_Z[0] + 15.0, -Math.PI / 2, casinoGuest);

    // 3. Salon Privé VIP High Stakes Poker Table (px = 0, pz = z0 + 25.0)
    stand(npcIdx++, 0, DECK_Y, CASINO_Z[0] + 26.8, Math.PI, casinoStaff); // VIP Dealer
    stand(npcIdx++, -1.4, DECK_Y, CASINO_Z[0] + 23.2, 0.2, casinoGuest);
    stand(npcIdx++, 0, DECK_Y, CASINO_Z[0] + 23.0, 0, casinoGuest);
    stand(npcIdx++, 1.4, DECK_Y, CASINO_Z[0] + 23.2, -0.2, casinoGuest);
    stand(npcIdx++, -3.5, DECK_Y, CASINO_Z[0] + 25.0, Math.PI / 2, casinoGuest);
    stand(npcIdx++, 3.5, DECK_Y, CASINO_Z[0] + 25.0, -Math.PI / 2, casinoGuest);

    // 4. Blackjack & Baccarat Tables (cz = z0 + 35.0)
    // Port Blackjack: Dealer & Players
    stand(npcIdx++, -6.8, DECK_Y, CASINO_Z[0] + 36.8, Math.PI, casinoStaff);
    stand(npcIdx++, -7.8, DECK_Y, CASINO_Z[0] + 33.2, 0, casinoGuest);
    stand(npcIdx++, -6.8, DECK_Y, CASINO_Z[0] + 33.0, 0, casinoGuest);
    stand(npcIdx++, -5.8, DECK_Y, CASINO_Z[0] + 33.2, 0, casinoGuest);

    // Starboard Blackjack: Dealer & Players
    stand(npcIdx++, 6.8, DECK_Y, CASINO_Z[0] + 36.8, Math.PI, casinoStaff);
    stand(npcIdx++, 5.8, DECK_Y, CASINO_Z[0] + 33.2, 0, casinoGuest);
    stand(npcIdx++, 6.8, DECK_Y, CASINO_Z[0] + 33.0, 0, casinoGuest);
    stand(npcIdx++, 7.8, DECK_Y, CASINO_Z[0] + 33.2, 0, casinoGuest);

    // 5. Slot Machine Banks
    stand(npcIdx++, -9.6, DECK_Y, CASINO_Z[0] + 8.0, -Math.PI / 2, casinoGuest);
    stand(npcIdx++, -9.6, DECK_Y, CASINO_Z[0] + 19.0, -Math.PI / 2, casinoGuest);
    stand(npcIdx++, -9.6, DECK_Y, CASINO_Z[0] + 30.0, -Math.PI / 2, casinoGuest);
    stand(npcIdx++, 9.6, DECK_Y, CASINO_Z[0] + 8.0, Math.PI / 2, casinoGuest);
    stand(npcIdx++, 9.6, DECK_Y, CASINO_Z[0] + 19.0, Math.PI / 2, casinoGuest);
    stand(npcIdx++, 9.6, DECK_Y, CASINO_Z[0] + 30.0, Math.PI / 2, casinoGuest);

    // 6. Grand Casino Royale Bar & Lounge
    stand(npcIdx++, -1.6, DECK_Y, CASINO_Z[0] + 2.3, 0, casinoStaff); // Barman 1
    stand(npcIdx++, 1.6, DECK_Y, CASINO_Z[0] + 2.3, 0, casinoStaff);  // Barman 2
    stand(npcIdx++, -3.0, DECK_Y, CASINO_Z[0] + 5.0, Math.PI, casinoGuest);
    stand(npcIdx++, 0.0, DECK_Y, CASINO_Z[0] + 5.0, Math.PI, casinoGuest);
    stand(npcIdx++, 3.0, DECK_Y, CASINO_Z[0] + 5.0, Math.PI, casinoGuest);
    stand(npcIdx++, -9.5, DECK_Y, CASINO_Z[0] + 4.2, 0.4, casinoGuest);
    stand(npcIdx++, 9.5, DECK_Y, CASINO_Z[0] + 4.2, -0.4, casinoGuest);

    // 7. Casino Floor Patrolling server & walker
    patrol(npcIdx++, -2.2, DECK_Y, CASINO_Z[0] + 10, CASINO_Z[0] + 38, 0, casinoStaff);
    patrol(npcIdx++, 2.2, DECK_Y, CASINO_Z[0] + 38, CASINO_Z[0] + 12, Math.PI, casinoGuest);

    // =========================================================================
    // The ballroom, dressed for dinner. The room is Edwardian, so the crowd in
    // it is too: white tie on the men, evening gowns on the women, and the
    // band in the same black as the stewards. `uniform` with the same colour
    // for shirt and trousers is how a floor-length gown is made out of a rig
    // that only knows about a top and a bottom.
    // =========================================================================
    const tails = { look: null, uniform: { shirt: 0xf2ece0, pants: 0x14141a, shoes: 0x0a0a0c, hat: false } };
    const steward = { look: null, uniform: { shirt: 0x16161c, pants: 0x121216, shoes: 0x08080a, hat: false } };
    const gown = c => ({ look: null, uniform: { shirt: c, pants: c, shoes: 0x2a1a1e, hat: false } });
    const gownCrimson = gown(0x6d1626);
    const gownIvory = gown(0xe6dcc2);
    const gownEmerald = gown(0x1d4433);
    const gownMidnight = gown(0x1e2a52);

    const B0 = BALL_Z[0];
    // Two couples out on the parquet, under the dome.
    stand(npcIdx++, -1.6, DECK_Y + 0.02, B0 + 18.4, 0.5, tails);
    stand(npcIdx++, -0.5, DECK_Y + 0.02, B0 + 19.1, Math.PI + 0.5, gownCrimson);
    stand(npcIdx++, 2.6, DECK_Y + 0.02, B0 + 21.4, -0.9, tails);
    stand(npcIdx++, 3.5, DECK_Y + 0.02, B0 + 22.3, Math.PI - 0.9, gownIvory);
    // A third couple further aft, and someone watching from the floor edge.
    stand(npcIdx++, -3.4, DECK_Y + 0.02, B0 + 13.6, 2.4, tails);
    stand(npcIdx++, -4.2, DECK_Y + 0.02, B0 + 14.4, 2.4 + Math.PI, gownEmerald);
    stand(npcIdx++, 6.9, DECK_Y, B0 + 16.0, -Math.PI / 2, gownMidnight);

    // At the tables, port and starboard.
    stand(npcIdx++, -9.6, DECK_Y, B0 + 4.5, Math.PI / 2, tails);
    stand(npcIdx++, -10.9, DECK_Y, B0 + 3.2, 0, gownIvory);
    stand(npcIdx++, -9.6, DECK_Y, B0 + 11.5, Math.PI / 2, gownCrimson);
    stand(npcIdx++, -12.1, DECK_Y, B0 + 18.5, -Math.PI / 2, tails);
    stand(npcIdx++, 9.6, DECK_Y, B0 + 11.5, -Math.PI / 2, tails);
    stand(npcIdx++, 10.9, DECK_Y, B0 + 10.2, Math.PI, gownEmerald);
    stand(npcIdx++, 9.6, DECK_Y, B0 + 25.5, -Math.PI / 2, gownMidnight);
    stand(npcIdx++, 12.1, DECK_Y, B0 + 4.5, Math.PI / 2, tails);

    // Two people at the balustrade by the door, looking down the room.
    stand(npcIdx++, -5.1, DECK_Y, B0 + 2.1, 0, gownIvory);
    stand(npcIdx++, 5.1, DECK_Y, B0 + 2.1, 0.3, tails);

    // The band, on the stage. The stage deck is DECK_Y + 0.64.
    stand(npcIdx++, -3.6, DECK_Y + 0.64, B0 + 34.8, Math.PI, steward);   // at the piano
    stand(npcIdx++, 2.4, DECK_Y + 0.64, B0 + 36.4, Math.PI, steward);    // double bass
    stand(npcIdx++, 0.6, DECK_Y + 0.64, B0 + 35.2, Math.PI, steward);    // violin, front
    stand(npcIdx++, 5.2, DECK_Y + 0.64, B0 + 37.4, Math.PI, steward);    // drums

    // Stewards working the room, fore and aft down the port and starboard
    // aisles — the aisles are clear of the arcade at |x| = 12.
    patrol(npcIdx++, -12.0, DECK_Y, B0 + 4, B0 + 30, 0, steward);
    patrol(npcIdx++, 12.0, DECK_Y, B0 + 30, B0 + 4, Math.PI, steward);

    // Atrium: the purser behind the desk, and someone waiting.
    stand(npcIdx++, 6.5, DECK_Y, 1.5, Math.PI);
    stand(npcIdx++, 4.5, DECK_Y, -4.0, Math.PI / 2);

    // Pool deck.
    stand(npcIdx++, 0, POOL_Y, 16.6, 0);                          // barman at the Lido
    stand(npcIdx++, -3.0, POOL_Y, 16.0, Math.PI);
    stand(npcIdx++, 7.2, POOL_Y, -1.0, -Math.PI / 2);
    patrol(npcIdx++, 11.5, POOL_Y, -20, 30, 0);
  }
} catch (e) {
  console.warn('[cruise] people', e);
}
console.log('[cruise] people placed, total:', people.length);

function tickPeople(dt) {
  const pPos = ctrl?.pos;
  for (const p of people) {
    if (pPos && p.group.position.distanceTo(pPos) > 55) continue;
    switch (p.kind) {
      case 'patrol': {
        const g = p.group;
        g.position.z += p.speed * p.dir * dt;
        const lo = Math.min(p.z0, p.z1), hi = Math.max(p.z0, p.z1);
        if (g.position.z > hi) { g.position.z = hi; p.dir = -1; g.rotation.y = Math.PI; }
        if (g.position.z < lo) { g.position.z = lo; p.dir = 1; g.rotation.y = 0; }
        p.mixer.update(dt);
        break;
      }
      default:
        p.mixer.update(dt);
        break;
    }
  }
}

// ---------------------------------------------------------------------------
// Cabin 214's bed — the way off this ship, and the only prompt in the map.
//
// Three answers, and they are three different KINDS of thing: one leaves for
// another world, two set the clock and stay. They share one lie-down because
// the lie-down is the answer to all three — you get into the bed either way,
// and what changes is what is there when you get out.
// ---------------------------------------------------------------------------
const BED_SPOT = {
  // Where the controller is parked while lying. Shifted toward the FOOT of the
  // bed for the same reason the beach's towel is: the pack rig's origin is the
  // standing feet, so tipping it onto its back puts the pelvis behind the
  // origin and floats the body off the duvet.
  x: BED_X,
  y: BED_TOP,
  z: BED_Z - 0.55,
  centerX: BED_X,
  centerZ: BED_Z,
  approachY: CABIN_Y,
  yaw: Math.PI,                    // head at +Z, against the headboard
  halfWidth: BED_W / 2,
  halfDepth: BED_L / 2,
  // Generous, because the bed is the only way off the ship and the approach is
  // pinched: the luggage bench closes the foot and the nightstands close the
  // head, so at 1.15 the prompt only armed from the port side and a player who
  // walked up to the end of the bed was told nothing at all.
  triggerDistance: 1.5,
};

let started = false, usedLock = false, paused = false;
let cabinAskOpen = false;
let lieState = null;               // { choice, phase, t, returnPos }
let bedCooldown = 0;
let leavingShip = false;
const _stillVel = new THREE.Vector3();
const forward = new THREE.Vector3();
const clock = new THREE.Clock();

// A fade plate, built here rather than in index.html: the shared #fade is
// gated off for every world engine, and this is the only world that needs one.
const fade = document.createElement('div');
Object.assign(fade.style, {
  position: 'fixed', inset: '0', background: '#05070c', zIndex: '20',
  opacity: '0', pointerEvents: 'none', transition: 'opacity .55s ease',
});
document.body.appendChild(fade);

function distanceToSpot(spot, position) {
  const dx = position.x - spot.centerX;
  const dz = position.z - spot.centerZ;
  const c = Math.cos(spot.yaw), s = Math.sin(spot.yaw);
  const localX = dx * c - dz * s;
  const localZ = dx * s + dz * c;
  const ox = Math.max(0, Math.abs(localX) - spot.halfWidth);
  const oz = Math.max(0, Math.abs(localZ) - spot.halfDepth);
  return Math.hypot(ox, oz);
}

function nearBed() {
  if (lieState || bedCooldown > 0 || ctrl.mode !== 'ground') return false;
  if (Math.abs(ctrl.pos.y - CABIN_Y) > 1.1) return false;
  return distanceToSpot(BED_SPOT, ctrl.pos) <= BED_SPOT.triggerDistance;
}

function setCabinAsk(show) {
  if (show === cabinAskOpen) return;
  cabinAskOpen = show;
  cabinPromptGroup?.classList.toggle('show', show);
  cabinPromptGroup?.setAttribute('aria-hidden', show ? 'false' : 'true');
  if (show) {
    if (document.pointerLockElement === renderer.domElement) document.exitPointerLock?.();
  } else if (started && !paused && !leavingShip) {
    requestGamePointerLock();
  }
}

function lieDown(choice) {
  if (lieState || leavingShip) return;
  setCabinAsk(false);
  lieState = {
    choice,
    phase: 'settling',
    t: 0,
    returnPos: ctrl.pos.clone(),
  };
  ctrl.pos.set(BED_SPOT.x, BED_SPOT.y, BED_SPOT.z);
  ctrl.prevY = BED_SPOT.y;
  ctrl.vel.set(0, 0, 0);
  ctrl.webOn = false;
  ctrl.mode = 'lie';
  input.yaw = BED_SPOT.yaw + Math.PI;
  if (player) player.yaw = BED_SPOT.yaw;
}

cabinBeachPrompt?.addEventListener('click', e => { e.stopPropagation(); lieDown('beach'); });
cabinDayPrompt?.addEventListener('click', e => { e.stopPropagation(); lieDown('day'); });
cabinNightPrompt?.addEventListener('click', e => { e.stopPropagation(); lieDown('night'); });

// The lie-down runs as a little state machine rather than a chain of timeouts,
// so that pausing the game pauses it too and nothing fires into a dead scene.
function updateLie(dt) {
  if (!lieState) return false;
  lieState.t += dt;
  if (lieState.phase === 'settling') {
    // A beat lying there before anything happens — cutting to black the
    // instant the button is clicked reads as a page load, not as sleeping.
    if (lieState.t > 1.1) {
      lieState.phase = 'fading';
      lieState.t = 0;
      fade.style.opacity = '1';
    }
    return true;
  }
  if (lieState.phase === 'fading') {
    if (lieState.t > 0.75) {
      if (lieState.choice === 'beach') {
        leavingShip = true;
        // Back to the beach, at the car park, with the clock we went to bed on.
        location.href = `index.html?map=beach&arrival=cruise&time=${cruiseTime}`;
        return true;
      }
      setCruiseTime(lieState.choice);
      lieState.phase = 'waking';
      lieState.t = 0;
      fade.style.opacity = '0';
    }
    return true;
  }
  // waking: stand up beside the bed, on the side the door is on.
  if (lieState.t > 0.8) {
    ctrl.pos.set(BED_X - BED_W / 2 - 0.75, CABIN_Y + 0.2, BED_Z - 0.4);
    ctrl.prevY = ctrl.pos.y;
    ctrl.vel.set(0, 0, 0);
    ctrl.mode = 'ground';
    lieState = null;
    bedCooldown = 1.2;
    return false;
  }
  return true;
}

function updatePrompts(dt) {
  bedCooldown = Math.max(0, bedCooldown - dt);
  if (lieState || leavingShip) return;
  setCabinAsk(nearBed());
}

renderer.domElement.addEventListener('click', () => {
  if (started && !paused && !cabinAskOpen && !input.locked) requestGamePointerLock();
});

// ---------------------------------------------------------------------------
function updateAvatar(dt) {
  if (!player) return;
  const lying = ctrl.mode === 'lie';
  // Black one-piece swimsuit on the upper deck (pool deck & pool), chic dress in casino, cruise attire elsewhere.
  const onUpperDeck = ctrl.pos.y >= POOL_Y - 1.5;
  const inCasino = !onUpperDeck && ctrl.pos.z >= CASINO_Z[0] - 0.5 && ctrl.pos.z <= CASINO_Z[1] + 0.5
    && Math.abs(ctrl.pos.x) <= SUP_X2 && ctrl.pos.y >= DECK_Y - 0.5 && ctrl.pos.y <= DECK_Y + SUP_H;

  player.setOutfit(onUpperDeck
    ? { hat: false, backpack: false, pants: false, shoes: false, longSleeves: false, swimsuit: true }
    : inCasino
    ? { hat: false, backpack: false, casino: true }
    : { hat: false, backpack: false, longSleeves: cruiseTime === 'night' });
  player.update({
    dt,
    mode: ctrl.mode,
    pos: ctrl.pos,
    vel: lying ? _stillVel : ctrl.vel,
    webOn: false,
    webHand: ctrl.webHand,
    anchor: ctrl.anchor,
    ropeSlack: 0,
    posture: lying ? 'lie' : undefined,
    facingYaw: lying ? BED_SPOT.yaw : undefined,
  });
}

function updateHud() {
  hudMode.textContent = ctrl.mode;
  hudSpeed.textContent = Math.round(ctrl.vel.length() * 3.6).toString();
  hudHeight.textContent = ctrl.pos.y.toFixed(1);
  document.documentElement.classList.toggle('is-seated',
    ctrl.mode === 'sit' || ctrl.mode === 'lie');
}

// The pool's water. On `scene`, like the sea, so it is never a floor — you
// wade in it, and the basin's tiled bottom is what you actually stand on.
const poolWater = new THREE.Mesh(
  new THREE.PlaneGeometry(POOL_X1 - POOL_X0 - 0.1, POOL_Z_B - POOL_Z_A - 0.1, 24, 32),
  new THREE.MeshStandardMaterial({
    color: 0x39c2dc, roughness: 0.06, metalness: 0.2,
    normalMap: waterN, normalScale: new THREE.Vector2(0.3, 0.3),
    transparent: true, opacity: 0.72,
  }),
);
poolWater.material.normalMap = waterN.clone();
poolWater.material.normalMap.repeat.set(3, 4);
poolWater.material.normalMap.needsUpdate = true;
poolWater.rotation.x = -Math.PI / 2;
poolWater.position.set((POOL_X0 + POOL_X1) / 2, POOL_WATER, (POOL_Z_A + POOL_Z_B) / 2);
scene.add(poolWater);

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(0.033, clock.getDelta());
  const t = clock.elapsedTime;

  if (started && !paused) {
    input.updateLook(dt);
    const cp = Math.cos(input.pitch);
    forward.set(-Math.sin(input.yaw) * cp, Math.sin(input.pitch), -Math.cos(input.yaw) * cp)
      .normalize();
    const lying = updateLie(dt);
    if (!lying) {
      ctrl.update(dt, input, input.yaw, forward);
      // Over the side. The rails are what keep you aboard; this is the
      // backstop for anyone who gets past them.
      if (ctrl.pos.y < SEA_Y + 1.5) ctrl.rescueTo(spawnPoint);
      updatePrompts(dt);
    }
  }

  // Live casino animations: spinning roulette wheels and scrolling slot reels
  for (let i = 0; i < rouletteRotors.length; i++) {
    const r = rouletteRotors[i];
    r.rotor.rotation.y += dt * r.speed;
    r.ballAngle -= dt * r.ballSpeed;
    r.ball.position.x = Math.cos(r.ballAngle) * r.ballRadius;
    r.ball.position.z = Math.sin(r.ballAngle) * r.ballRadius;
    r.ball.position.y = 0.08 + Math.sin(t * 12 + i) * 0.003;
  }
  updateSlotScreens(t);

  // Making way. The sea scrolls astern under a ship that never moves.
  seaUniforms.uTime.value = t;
  waterN.offset.y = -t * 0.045;
  waterN.offset.x = Math.sin(t * 0.07) * 0.01;
  poolWater.material.normalMap.offset.y = t * 0.02;
  poolWater.position.y = POOL_WATER + Math.sin(t * 1.3) * 0.012;
  for (let i = 0; i < wakeParts.length; i++) {
    const m = wakeParts[i];
    m.material.opacity = TIME_STATES[cruiseTime].wake
      * (0.82 + 0.18 * Math.sin(t * 1.7 + i));
  }
  for (const gu of gulls) {
    const g = gu.g;
    g.position.z += gu.speed * 6 * dt;
    if (g.position.z > 120) g.position.z = -160;
    g.position.y += Math.sin(t * 0.6 + gu.phase) * 0.03;
    const flap = Math.sin(t * 5.5 + gu.phase) * 0.5;
    if (g.userData.wL) g.userData.wL.rotation.z = -flap;
    if (g.userData.wR) g.userData.wR.rotation.z = flap;
  }
  updateMarineLife(dt, t, marineFauna, islandData);

  tickPeople(dt);
  updateSunShadow(ctrl.pos);
  updateAvatar(dt);
  rig.update(dt, input, ctrl);
  // Keep the sea and the sky centred on the camera: both are finite, and the
  // player can walk 190 m along the ship. After the rig so the dome sits on
  // this frame's camera, not last frame's — a 3000 m sphere one tick behind
  // the third-person camera was clipping a black wedge out of the sky.
  sea.position.x = camera.position.x;
  sea.position.z = camera.position.z;
  skyDome.position.copy(camera.position);
  stars.position.copy(camera.position);
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

function startCruise() {
  if (started) {
    resumePlay();
    return;
  }
  try {
    // The ticket office hands the clock over on embarkation (`time=`); after
    // that the toggle in the briefing, and the bed, own it.
    setCruiseTime(travelParams.get('time')
      ?? window.__cruiseTime
      ?? (window.__nightMode === true ? 'night' : 'day'));
  } catch (e) {
    window.__cruiseTimeError = e.stack || e.message;
    console.error('[time mode]', e);
  }
  setCabinAsk(false);
  started = true;
  resumePlay();
}

window.__startCruise = startCruise;
startBtn?.addEventListener('click', startCruise);
if (travelParams.get('arrival') || window.__startRequested) startCruise();

document.addEventListener('pointerlockchange', () => {
  usedLock = usedLock || document.pointerLockElement !== null;
  // Dropping the lock so a prompt button can be clicked is intentional, and so
  // is dropping it while lying down: a failed lock must not freeze the player
  // in the bed with the overlay up and no way to answer.
  if ((cabinAskOpen || ctrl.mode === 'lie') && document.pointerLockElement === null) {
    paused = false;
    overlay.style.display = 'none';
    return;
  }
  if (!usedLock) return;
  paused = !input.locked;
  if (paused) setCabinAsk(false);
  overlay.style.display = paused ? 'flex' : 'none';
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
