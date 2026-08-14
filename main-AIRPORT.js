import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { Player } from './player.js?v=49';
import { harmoniseHair } from './hair.js?v=8';
import { Input } from './input.js';
import { Controller } from './controller.js?v=5';
import { CameraRig } from './cameraRig.js?v=5';
import { buildCityBoxes } from './cityBoxes.js?v=4';
import { buildCar, carBounds } from './cars.js?v=4';
import { makeVisitor, loadGuestRig, STAFF_UNIFORM } from './crowd.js?v=18';

// ---------------------------------------------------------------------------
// Heading to the airport — a linear terminal, laid out the way real ones are
// (curb → processors → airside), each zone fully walled with one way through:
//
//   drop-off curb → glass facade + sliding doors → CHECK-IN HALL (9.5 m high,
//   four islands, queue, FIDS) → one portal → SECURITY (low room, three lanes,
//   offset exit) → CONCOURSE: café unit west, souvenir shop east, then the
//   BOARDING LOUNGE on the curtain wall — gates A1–A3, jetways, and the apron
//   with planes parked, taxiing, landing and departing beyond the glass.
//
// Travelers are NOT the pack skeleton. Two guest rigs — the zoo's Ready Player
// Me woman, and the RPM masculine avatar (a different physique) — walk with
// the animation-library clips authored for their own Hips armature.
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
renderer.toneMappingExposure = 1.02;
renderer.outputColorSpace = THREE.SRGBColorSpace;
app.appendChild(renderer.domElement);

const SKY = 0xb7d2e8;
const scene = new THREE.Scene();
scene.background = new THREE.Color(SKY);
scene.fog = new THREE.Fog(0xc8d8e6, 200, 920);

const camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.25, 2200);
camera.position.set(0, 8, -20);

// Post-processing: Bloom for luminous screens, runway lights, illuminated signs and reflections
const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(
  window.innerWidth, window.innerHeight, { samples: 4, type: THREE.HalfFloatType }
));
composer.addPass(new RenderPass(scene, camera));
const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  0.48, // bloom strength: crisp natural glow on lights and emissive signage
  0.42, // bloom radius
  0.82  // bloom threshold: only emissives and specular highlights trigger bloom
);
composer.addPass(bloomPass);
composer.addPass(new OutputPass());

const hemi = new THREE.HemisphereLight(0xe8f2ff, 0x8a8478, 0.82);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff3e0, 2.15);
sun.position.set(-80, 140, 40);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -120;
sun.shadow.camera.right = 120;
sun.shadow.camera.top = 120;
sun.shadow.camera.bottom = -80;
sun.shadow.camera.near = 20;
sun.shadow.camera.far = 380;
sun.shadow.bias = -0.0005;
sun.shadow.normalBias = 0.04;
scene.add(sun);
sun.target.position.set(0, 0, 20);
scene.add(sun.target);

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
function worldXZUv(mat, metersPerTile = 2.4) {
  const s = 1 / metersPerTile;
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace(
      '#include <worldpos_vertex>',
      `#include <worldpos_vertex>
      { vec4 wp = vec4(transformed, 1.0);
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
      }`,
    );
  };
  mat.customProgramCacheKey = () => 'wxz-air-' + metersPerTile;
  return mat;
}

function makeTerrazzo() {
  const size = 512;
  const c = Object.assign(document.createElement('canvas'), { width: size, height: size });
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#d8d2c8';
  ctx.fillRect(0, 0, size, size);
  const chips = ['#c4b8a8', '#eee8de', '#9a9084', '#6a6560', '#e8c8b0', '#b0c0c8', '#8a7a6a'];
  for (let i = 0; i < 1400; i++) {
    ctx.fillStyle = chips[i % chips.length];
    ctx.globalAlpha = 0.35 + Math.random() * 0.5;
    const x = Math.random() * size, y = Math.random() * size;
    ctx.beginPath();
    ctx.ellipse(x, y, 3 + Math.random() * 9, 2 + Math.random() * 5, Math.random() * 6, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(4, 4);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = maxAniso;
  t.needsUpdate = true;
  return t;
}
function makeCarpet() {
  const size = 256;
  const c = Object.assign(document.createElement('canvas'), { width: size, height: size });
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#4c5c78';
  ctx.fillRect(0, 0, size, size);
  for (let y = 0; y < size; y += 3) {
    ctx.fillStyle = y % 6 ? '#586a88' : '#445470';
    ctx.fillRect(0, y, size, 2);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(8, 8);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = maxAniso;
  t.needsUpdate = true;
  return t;
}
function makeFids() {
  const c = Object.assign(document.createElement('canvas'), { width: 1024, height: 512 });
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#0b1220';
  ctx.fillRect(0, 0, 1024, 512);
  ctx.fillStyle = '#1a2a44';
  ctx.fillRect(0, 0, 1024, 48);
  ctx.fillStyle = '#8ec8e0';
  ctx.font = 'bold 22px sans-serif';
  ctx.fillText('PACIFIC GATE  ·  DEPARTURES', 28, 32);
  const rows = [
    ['AA 214', 'NEW YORK JFK', '10:40', 'A12', 'BOARDING'],
    ['BA 268', 'LONDON LHR', '11:05', 'B04', 'ON TIME'],
    ['AF  72', 'PARIS CDG', '11:20', 'A08', 'ON TIME'],
    ['JL  61', 'TOKYO HND', '11:55', 'C02', 'DELAYED'],
    ['UA 441', 'CHICAGO ORD', '12:10', 'B11', 'ON TIME'],
    ['LH 457', 'FRANKFURT', '12:35', 'A03', 'GATE OPEN'],
    ['QF  12', 'SYDNEY', '13:00', 'C07', 'ON TIME'],
    ['EK 216', 'DUBAI', '13:25', 'B02', 'ON TIME'],
  ];
  rows.forEach((r, i) => {
    ctx.fillStyle = i % 2 ? '#101828' : '#0d1628';
    ctx.fillRect(0, 56 + i * 54, 1024, 54);
    ctx.fillStyle = '#d8e6f0';
    ctx.font = '20px monospace';
    ctx.fillText(r[0], 28, 92 + i * 54);
    ctx.fillText(r[1], 200, 92 + i * 54);
    ctx.fillText(r[2], 560, 92 + i * 54);
    ctx.fillText(r[3], 700, 92 + i * 54);
    ctx.fillStyle = r[4] === 'DELAYED' ? '#e07050' : r[4] === 'BOARDING' ? '#6ad08a' : '#8ec8e0';
    ctx.fillText(r[4], 820, 92 + i * 54);
  });
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = maxAniso;
  t.needsUpdate = true;
  return t;
}

const concA = tex('./textures/CP_Concrete_01_A.webp', 6, 6);
const concN = ntex('./textures/CP_Concrete_01_N.webp', 6, 6);
const asphaltA = tex('./textures/CP_Asphalt_A.webp', 18, 18);
const asphaltN = ntex('./textures/CP_Asphalt_N.webp', 18, 18);
const woodA = tex('./textures/nature/wood_diff.jpg', 2, 2);
const woodN = ntex('./textures/nature/wood_n.jpg', 2, 2);
const tileA = tex('./textures/CP_Ceramic_Tile_A.webp', 10, 10);
const tileN = ntex('./textures/CP_Ceramic_Tile_N.webp', 10, 10);
const floorA = tex('./textures/CP_Floor_Tiles_A.webp', 8, 8);
const floorN = ntex('./textures/CP_Floor_Tiles_N.webp', 8, 8);
const stuccoA = tex('./textures/nature/stucco_diff.jpg', 4, 2);
const stuccoN = ntex('./textures/nature/stucco_n.jpg', 4, 2);
const metalA = tex('./textures/CP_Metal_Panel_A.webp', 3, 2);
const metalN = ntex('./textures/CP_Metal_Panel_N.webp', 3, 2);
const shopA = tex('./textures/CP_Glass_Showcase_A.webp', 2, 1);
const shopN = ntex('./textures/CP_Glass_Showcase_N.webp', 2, 1);
const terrazzoA = makeTerrazzo();
const carpetA = makeCarpet();
const fidsA = makeFids();
const vinylA = makeVinylFloor();
const slatA = makeSlatTex();
vinylA.repeat.set(1, 1);
slatA.repeat.set(4, 2);

function canvasTex(w, h, draw, { srgb = true, wrap = false } = {}) {
  const c = Object.assign(document.createElement('canvas'), { width: w, height: h });
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = maxAniso;
  if (wrap) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.needsUpdate = true;
  return t;
}
function makeTravelPoster({ city, tag, c0, c1, accent, motif }) {
  const t = canvasTex(1280, 768, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, c0);
    g.addColorStop(1, c1);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = accent;
    if (motif === 'sun') {
      ctx.beginPath();
      ctx.arc(w * 0.78, h * 0.38, 150, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,0.28)';
      ctx.beginPath();
      ctx.moveTo(w * 0.18, h * 0.82);
      ctx.lineTo(w * 0.48, h * 0.28);
      ctx.lineTo(w * 0.78, h * 0.82);
      ctx.fill();
    } else if (motif === 'tower') {
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      for (let i = 0; i < 18; i++) {
        const x = 40 + i * 70;
        const bh = 80 + ((i * 97) % 280);
        ctx.fillRect(x, h - 80 - bh, 48, bh);
      }
      ctx.fillStyle = accent;
      ctx.fillRect(w * 0.62, h * 0.18, 28, h * 0.62);
      ctx.fillRect(w * 0.58, h * 0.18, 80, 14);
    } else if (motif === 'shells') {
      ctx.strokeStyle = accent;
      ctx.lineWidth = 10;
      for (let i = 0; i < 5; i++) {
        ctx.beginPath();
        ctx.ellipse(220 + i * 160, h * 0.62, 70 + i * 8, 110, -0.4, Math.PI, 0);
        ctx.stroke();
      }
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.fillRect(0, h * 0.72, w, h * 0.28);
    } else if (motif === 'spire') {
      ctx.fillStyle = accent;
      ctx.beginPath();
      ctx.moveTo(w * 0.72, h * 0.12);
      ctx.lineTo(w * 0.78, h * 0.78);
      ctx.lineTo(w * 0.66, h * 0.78);
      ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      ctx.fillRect(0, h * 0.78, w, h * 0.22);
    } else {
      ctx.fillStyle = 'rgba(255,255,255,0.14)';
      ctx.beginPath();
      ctx.arc(w * 0.2, h * 0.2, 220, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = 'rgba(8,14,22,0.55)';
    ctx.fillRect(0, h - 210, w, 210);
    ctx.fillStyle = '#f4f7fb';
    ctx.font = 'bold 118px sans-serif';
    ctx.fillText(city, 56, h - 108);
    ctx.fillStyle = accent;
    ctx.font = '36px sans-serif';
    ctx.fillText(tag, 58, h - 52);
  });
  return new THREE.MeshStandardMaterial({
    map: t, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: 0.28, roughness: 0.48,
  });
}
function makeMenuBoard() {
  const t = canvasTex(1024, 512, (ctx, w, h) => {
    ctx.fillStyle = '#241810';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#c47858';
    ctx.fillRect(0, 0, w, 10);
    ctx.fillStyle = '#f6ead8';
    ctx.font = 'bold 42px sans-serif';
    ctx.fillText('GATE CAFÉ', 40, 64);
    ctx.font = '28px sans-serif';
    ctx.fillStyle = '#d8c4a8';
    const rows = [
      ['Espresso', '3.2'], ['Flat white', '4.4'], ['Iced latte', '4.8'],
      ['Croissant', '3.8'], ['Berry danish', '4.1'], ['Airport bun', '5.0'],
    ];
    rows.forEach((r, i) => {
      const y = 130 + i * 56;
      ctx.fillStyle = '#f0e0cc';
      ctx.fillText(r[0], 48, y);
      ctx.fillStyle = '#c47858';
      ctx.fillText(r[1], w - 140, y);
    });
  });
  return new THREE.MeshStandardMaterial({
    map: t, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: 0.22, roughness: 0.55,
  });
}
function makeClock() {
  const t = canvasTex(512, 512, (ctx, w) => {
    const c = w / 2;
    ctx.fillStyle = '#0e1620';
    ctx.beginPath(); ctx.arc(c, c, 240, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#8ec8e0'; ctx.lineWidth = 10;
    ctx.beginPath(); ctx.arc(c, c, 228, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = '#d8e6f0';
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2 - Math.PI / 2;
      ctx.beginPath();
      ctx.arc(c + Math.cos(a) * 190, c + Math.sin(a) * 190, i % 3 ? 5 : 9, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.strokeStyle = '#eef6fc'; ctx.lineWidth = 10; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(c, c); ctx.lineTo(c + 70, c + 20); ctx.stroke();
    ctx.lineWidth = 6;
    ctx.beginPath(); ctx.moveTo(c, c); ctx.lineTo(c - 20, c - 130); ctx.stroke();
    ctx.fillStyle = '#8ec8e0';
    ctx.beginPath(); ctx.arc(c, c, 10, 0, Math.PI * 2); ctx.fill();
  });
  return new THREE.MeshStandardMaterial({
    map: t, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: 0.35, roughness: 0.4,
  });
}
function makeVinylFloor() {
  return canvasTex(512, 512, (ctx, w, h) => {
    ctx.fillStyle = '#6a7a88';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(20,28,36,0.22)';
    ctx.lineWidth = 2;
    for (let i = 0; i <= 8; i++) {
      ctx.beginPath(); ctx.moveTo(i * 64, 0); ctx.lineTo(i * 64, h); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, i * 64); ctx.lineTo(w, i * 64); ctx.stroke();
    }
    ctx.fillStyle = 'rgba(255,255,255,0.04)';
    for (let i = 0; i < 80; i++) ctx.fillRect(Math.random() * w, Math.random() * h, 3, 2);
  }, { wrap: true });
}
function makeSlatTex() {
  return canvasTex(256, 512, (ctx, w, h) => {
    ctx.fillStyle = '#2a221c';
    ctx.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 18) {
      ctx.fillStyle = x % 36 ? '#8a6a48' : '#7a5c3c';
      ctx.fillRect(x + 1, 0, 15, h);
      ctx.fillStyle = 'rgba(255,220,180,0.08)';
      ctx.fillRect(x + 3, 0, 3, h);
    }
  }, { wrap: true });
}
function makeAirlineDecal(name, hex) {
  const col = '#' + hex.toString(16).padStart(6, '0');
  const t = canvasTex(1024, 180, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = col;
    ctx.font = 'bold 92px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(name, w / 2, h / 2 + 4);
  });
  return new THREE.MeshStandardMaterial({
    map: t, transparent: true, roughness: 0.35, metalness: 0.15,
    depthWrite: false,
  });
}
function makeTailFlash(hex) {
  const col = '#' + hex.toString(16).padStart(6, '0');
  const t = canvasTex(256, 512, (ctx, w, h) => {
    ctx.fillStyle = col;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#f4f6f8';
    ctx.beginPath();
    ctx.moveTo(40, 80);
    ctx.lineTo(210, 200);
    ctx.lineTo(40, 320);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = col;
    ctx.fillRect(40, 430, 176, 18);
  });
  return new THREE.MeshStandardMaterial({ map: t, roughness: 0.32, metalness: 0.28 });
}
function makeSign(title, sub = '', bg = '#102033', fg = '#eef6fc') {
  const c = Object.assign(document.createElement('canvas'), { width: 1024, height: 256 });
  const ctx = c.getContext('2d');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 1024, 256);
  ctx.fillStyle = '#8ec8e0';
  ctx.fillRect(0, 0, 16, 256);
  ctx.fillStyle = fg;
  ctx.font = 'bold 78px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(title, 520, sub ? 110 : 155);
  if (sub) {
    ctx.font = '36px sans-serif';
    ctx.fillStyle = '#8ec8e0';
    ctx.fillText(sub, 520, 175);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = maxAniso;
  t.needsUpdate = true;
  return new THREE.MeshStandardMaterial({
    map: t, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: 0.5, roughness: 0.42,
  });
}

function makePostcardTex() {
  return canvasTex(512, 512, (ctx, w, h) => {
    ctx.fillStyle = '#f8f4ee';
    ctx.fillRect(0, 0, w, h);
    const cols = ['#2c4870', '#b04030', '#2a7060', '#c07820', '#483060', '#206080'];
    const titles = ['TOKYO', 'PARIS', 'PACIFIC', 'NEW YORK', 'DUBAI', 'SYDNEY'];
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 2; col++) {
        const x = 18 + col * 248, y = 18 + row * 160;
        ctx.fillStyle = cols[(row * 2 + col) % cols.length];
        ctx.fillRect(x, y, 230, 144);
        ctx.fillStyle = 'rgba(255,255,255,0.2)';
        ctx.fillRect(x + 10, y + 10, 210, 80);
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 22px sans-serif';
        ctx.fillText(titles[(row * 2 + col) % titles.length], x + 18, y + 120);
        ctx.fillStyle = '#ffd080';
        ctx.font = '12px sans-serif';
        ctx.fillText('POSTCARD · SOUVENIR', x + 18, y + 136);
      }
    }
  });
}
function makeMagazineTex() {
  return canvasTex(256, 512, (ctx, w, h) => {
    ctx.fillStyle = '#10141c';
    ctx.fillRect(0, 0, w, h);
    const mags = [
      { title: 'VOYAGE', sub: 'WORLD TRAVEL 2026', c: '#e04030' },
      { title: 'AERO', sub: 'AVIATION TODAY', c: '#2080d0' },
      { title: 'STYLE', sub: 'DUTY FREE LUXE', c: '#d0a040' },
      { title: 'ESCAPE', sub: 'PACIFIC ISLANDS', c: '#20a060' },
    ];
    mags.forEach((m, i) => {
      const y = 12 + i * 124;
      ctx.fillStyle = '#1c2230';
      ctx.fillRect(10, y, w - 20, 114);
      ctx.fillStyle = m.c;
      ctx.fillRect(10, y, w - 20, 32);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 20px sans-serif';
      ctx.fillText(m.title, 20, y + 23);
      ctx.fillStyle = '#d0d8e8';
      ctx.font = '11px sans-serif';
      ctx.fillText(m.sub, 20, y + 54);
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.fillRect(20, y + 64, w - 40, 48);
    });
  });
}
const postcardA = makePostcardTex();
const magazineA = makeMagazineTex();

const M = {
  // Polished Terrazzo & Tiles with subtle gloss reflections
  terrazzo: worldXZUv(new THREE.MeshPhysicalMaterial({
    map: terrazzoA, roughness: 0.22, metalness: 0.08, clearcoat: 0.38, clearcoatRoughness: 0.12, color: 0xffffff,
  }), 1.7),
  tile: worldXZUv(new THREE.MeshPhysicalMaterial({
    map: tileA, normalMap: tileN, roughness: 0.24, metalness: 0.08, clearcoat: 0.32, clearcoatRoughness: 0.1, color: 0xe8e4dc,
  }), 1.6),
  paver: worldXZUv(new THREE.MeshStandardMaterial({
    map: floorA, normalMap: floorN, roughness: 0.55, metalness: 0.04, color: 0xd8d4cc,
  }), 2.2),
  carpet: worldXZUv(new THREE.MeshStandardMaterial({
    map: carpetA, roughness: 0.96, metalness: 0.0, color: 0xffffff,
  }), 2.4),
  concrete: worldXZUv(new THREE.MeshStandardMaterial({
    map: concA, normalMap: concN, normalScale: new THREE.Vector2(0.45, 0.45),
    color: 0xc8c4bc, roughness: 0.88, metalness: 0.02,
  }), 4),
  plaster: new THREE.MeshStandardMaterial({
    map: stuccoA, normalMap: stuccoN, color: 0xf2eee8, roughness: 0.82,
  }),
  plasterWarm: new THREE.MeshStandardMaterial({
    map: stuccoA, normalMap: stuccoN, color: 0xf4e8d8, roughness: 0.8,
  }),
  secWall: new THREE.MeshStandardMaterial({
    map: metalA, normalMap: metalN, color: 0xc8d8e4, roughness: 0.46, metalness: 0.28,
  }),
  secFloor: worldXZUv(new THREE.MeshStandardMaterial({
    map: vinylA, roughness: 0.55, metalness: 0.06, color: 0x9aafbe,
  }), 1.4),
  steel: new THREE.MeshStandardMaterial({
    map: metalA, normalMap: metalN, color: 0xb0b6bc, roughness: 0.32, metalness: 0.72,
  }),
  steelDark: new THREE.MeshStandardMaterial({ color: 0x2c3238, roughness: 0.38, metalness: 0.65 }),
  // Enhanced optical glass with transmission clearcoat
  glass: new THREE.MeshPhysicalMaterial({
    color: 0xb8d4e4, roughness: 0.03, metalness: 0.04,
    transparent: true, opacity: 0.24, depthWrite: false,
    clearcoat: 1.0, clearcoatRoughness: 0.04, side: THREE.DoubleSide,
  }),
  asphalt: worldXZUv(new THREE.MeshStandardMaterial({
    map: asphaltA, normalMap: asphaltN, color: 0x606060, roughness: 0.92,
  }), 8),
  paint: new THREE.MeshStandardMaterial({ color: 0xe8e4d4, roughness: 0.7 }),
  paintYellow: new THREE.MeshStandardMaterial({ color: 0xd8c45a, roughness: 0.55 }),
  desk: new THREE.MeshStandardMaterial({
    map: woodA, normalMap: woodN, color: 0xc8b49a, roughness: 0.55, metalness: 0.04,
  }),
  fabric: new THREE.MeshStandardMaterial({ color: 0x3d4e62, roughness: 0.94 }),
  fabricWarm: new THREE.MeshStandardMaterial({ color: 0xc47858, roughness: 0.93 }),
  cafeWood: new THREE.MeshStandardMaterial({
    map: woodA, normalMap: woodN, color: 0xb89870, roughness: 0.62,
  }),
  shop: new THREE.MeshStandardMaterial({
    map: shopA, normalMap: shopN, color: 0xd8e0e6, roughness: 0.35, metalness: 0.12,
  }),
  posterTokyo: makeTravelPoster({
    city: 'TOKYO', tag: 'JL 61  ·  DAILY  ·  PACIFIC GATE',
    c0: '#1a2040', c1: '#8a2030', accent: '#e07050', motif: 'sun',
  }),
  posterParis: makeTravelPoster({
    city: 'PARIS', tag: 'AF 72  ·  NONSTOP  ·  CDG',
    c0: '#3a2a58', c1: '#c4a070', accent: '#f0d8a0', motif: 'tower',
  }),
  posterNy: makeTravelPoster({
    city: 'NEW YORK', tag: 'AA 214  ·  JFK  ·  BOARDING',
    c0: '#102033', c1: '#1a4a8a', accent: '#8ec8e0', motif: 'tower',
  }),
  posterSydney: makeTravelPoster({
    city: 'SYDNEY', tag: 'QF 12  ·  SOUTH PACIFIC',
    c0: '#0a3a48', c1: '#4aa0b0', accent: '#e8f4f8', motif: 'shells',
  }),
  posterDubai: makeTravelPoster({
    city: 'DUBAI', tag: 'EK 216  ·  DUTY FREE HUB',
    c0: '#2a1a10', c1: '#c49040', accent: '#f4e0b0', motif: 'spire',
  }),
  menu: makeMenuBoard(),
  clock: makeClock(),
  slat: new THREE.MeshStandardMaterial({
    map: slatA, roughness: 0.72, metalness: 0.04, color: 0xffffff,
  }),
  wainscot: new THREE.MeshStandardMaterial({
    map: woodA, normalMap: woodN, color: 0xc8b49a, roughness: 0.62,
  }),
  accent: new THREE.MeshStandardMaterial({
    color: 0x8ec8e0, roughness: 0.35, metalness: 0.22, emissive: 0x8ec8e0, emissiveIntensity: 0.28,
  }),
  bottleAmber: new THREE.MeshStandardMaterial({ color: 0x8a4a18, roughness: 0.18, metalness: 0.42 }),
  bottleGreen: new THREE.MeshStandardMaterial({ color: 0x1a4a32, roughness: 0.2, metalness: 0.38 }),
  bottleClear: new THREE.MeshStandardMaterial({ color: 0xc8d8e0, roughness: 0.12, metalness: 0.28 }),
  bottleWine: new THREE.MeshStandardMaterial({ color: 0x5a1020, roughness: 0.22, metalness: 0.35 }),
  capGold: new THREE.MeshStandardMaterial({ color: 0xc4a060, roughness: 0.28, metalness: 0.72 }),
  capBlack: new THREE.MeshStandardMaterial({ color: 0x1a1c1e, roughness: 0.4, metalness: 0.35 }),
  shirt: new THREE.MeshStandardMaterial({ color: 0xf2eee6, roughness: 0.88 }),
  shirtBlue: new THREE.MeshStandardMaterial({ color: 0x3a5a78, roughness: 0.88 }),
  shirtRed: new THREE.MeshStandardMaterial({ color: 0x8a3030, roughness: 0.88 }),
  gold: new THREE.MeshStandardMaterial({ color: 0xd4b060, roughness: 0.3, metalness: 0.65 }),
  water: new THREE.MeshStandardMaterial({
    color: 0x4a7a92, roughness: 0.18, metalness: 0.35,
  }),
  hill: new THREE.MeshStandardMaterial({ color: 0x6a7a58, roughness: 0.96 }),
  tower: new THREE.MeshStandardMaterial({ color: 0x9aa4ae, roughness: 0.62, metalness: 0.12 }),
  towerDark: new THREE.MeshStandardMaterial({ color: 0x5a646e, roughness: 0.58, metalness: 0.18 }),
  towerGlass: new THREE.MeshStandardMaterial({
    color: 0x7a9ab0, roughness: 0.18, metalness: 0.35, emissive: 0x1a3040, emissiveIntensity: 0.22,
  }),
  bag: new THREE.MeshStandardMaterial({ color: 0x4a3a2a, roughness: 0.85 }),
  bag2: new THREE.MeshStandardMaterial({ color: 0x2a4a6a, roughness: 0.85 }),
  bag3: new THREE.MeshStandardMaterial({ color: 0x8a3030, roughness: 0.85 }),
  screen: new THREE.MeshStandardMaterial({
    map: fidsA, emissive: 0xffffff, emissiveMap: fidsA, emissiveIntensity: 1.1, roughness: 0.2,
  }),
  signCheck: makeSign('CHECK-IN', 'BAGGAGE DROP  ·  ISLANDS A–D'),
  signSec: makeSign('SECURITY  ↑', 'ALL GATES  ·  LIQUIDS & LAPTOPS OUT'),
  signGates: makeSign('GATES A1–A3', 'BOARDING LOUNGE'),
  signArrow: makeSign('GATES A1–A3  →', 'CAFÉ  ·  SHOPS  ·  LOUNGE'),
  signCafe: makeSign('GATE CAFÉ', 'COFFEE  ·  PASTRIES', '#2e1f14', '#f6ead8'),
  signShop: makeSign('DUTY FREE & SOUVENIRS', 'PERFUMES · GIFTS · SWEETS', '#221410', '#fceee2'),
  signDept: makeSign('DEPARTURES', 'PACIFIC GATE TERMINAL'),
  signGateA: makeSign('GATE A1', 'AA 214  ·  NEW YORK JFK  ·  BOARDING'),
  signGateB: makeSign('GATE A2', 'BA 268  ·  LONDON LHR  ·  ON TIME'),
  signGateC: makeSign('GATE A3', 'AF 72  ·  PARIS CDG  ·  ON TIME'),
  signWC: makeSign('WC', 'RESTROOMS'),
  ceiling: new THREE.MeshStandardMaterial({ color: 0xf2f0ea, roughness: 0.7 }),
  lightBar: new THREE.MeshStandardMaterial({
    color: 0xfff6e8, emissive: 0xffe8c4, emissiveIntensity: 1.6, roughness: 0.35,
  }),
  grass: new THREE.MeshStandardMaterial({ color: 0x6a8a52, roughness: 0.96 }),
  collider: new THREE.MeshBasicMaterial({ visible: false }),

  // --- Aerodrome Runway & Taxiway Lighting Materials (Bloom Enabled) ---
  runwayLightWhite: new THREE.MeshStandardMaterial({
    color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 2.8, roughness: 0.2,
  }),
  runwayLightAmber: new THREE.MeshStandardMaterial({
    color: 0xffaa33, emissive: 0xffaa33, emissiveIntensity: 2.6, roughness: 0.2,
  }),
  runwayLightGreen: new THREE.MeshStandardMaterial({
    color: 0x33ff66, emissive: 0x33ff66, emissiveIntensity: 2.8, roughness: 0.2,
  }),
  runwayLightRed: new THREE.MeshStandardMaterial({
    color: 0xff2222, emissive: 0xff2222, emissiveIntensity: 2.8, roughness: 0.2,
  }),
  taxiwayLightBlue: new THREE.MeshStandardMaterial({
    color: 0x3399ff, emissive: 0x2288ff, emissiveIntensity: 2.7, roughness: 0.2,
  }),
  taxiwayLightGreen: new THREE.MeshStandardMaterial({
    color: 0x22ee66, emissive: 0x22ee66, emissiveIntensity: 2.7, roughness: 0.2,
  }),
  papiWhite: new THREE.MeshStandardMaterial({
    color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 3.2, roughness: 0.15,
  }),
  papiRed: new THREE.MeshStandardMaterial({
    color: 0xff2222, emissive: 0xff1111, emissiveIntensity: 3.2, roughness: 0.15,
  }),

  // --- Tarmac Weathering Decals & Markings ---
  rubberSkid: new THREE.MeshStandardMaterial({
    color: 0x161616, roughness: 0.98, metalness: 0.02, transparent: true, opacity: 0.75, depthWrite: false,
  }),
  oilStain: new THREE.MeshStandardMaterial({
    color: 0x111114, roughness: 0.4, metalness: 0.4, transparent: true, opacity: 0.7, depthWrite: false,
  }),

  // --- Dynamic Aircraft Lighting Materials ---
  navRed: new THREE.MeshStandardMaterial({
    color: 0xff1020, emissive: 0xff1020, emissiveIntensity: 3.2, roughness: 0.2,
  }),
  navGreen: new THREE.MeshStandardMaterial({
    color: 0x10ff30, emissive: 0x10ff30, emissiveIntensity: 3.2, roughness: 0.2,
  }),
  strobeWhite: new THREE.MeshStandardMaterial({
    color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.0, roughness: 0.1,
  }),
  beaconRed: new THREE.MeshStandardMaterial({
    color: 0xff1818, emissive: 0xff1818, emissiveIntensity: 0.0, roughness: 0.1,
  }),
  thrustGlow: new THREE.MeshStandardMaterial({
    color: 0xff8833, emissive: 0xff6611, emissiveIntensity: 0.0, transparent: true, opacity: 0.0, depthWrite: false,
  }),

  // --- Luxury Souvenir Shop Materials (Warm, Inviting & Rich) ---
  shopWood: worldXZUv(new THREE.MeshStandardMaterial({
    map: woodA, normalMap: woodN, color: 0x8a5832, roughness: 0.42, metalness: 0.05,
  }), 1.5),
  shopWoodDark: new THREE.MeshStandardMaterial({
    map: woodA, normalMap: woodN, color: 0x3d2012, roughness: 0.45, metalness: 0.08,
  }),
  shopCarpet: worldXZUv(new THREE.MeshStandardMaterial({
    map: carpetA, color: 0x822424, roughness: 0.94, metalness: 0.0,
  }), 1.8),
  shopWarmWall: new THREE.MeshStandardMaterial({
    map: stuccoA, normalMap: stuccoN, color: 0xf6ede0, roughness: 0.78,
  }),
  shopGold: new THREE.MeshStandardMaterial({
    color: 0xd8b248, roughness: 0.28, metalness: 0.78,
  }),
  shopLightWarm: new THREE.MeshStandardMaterial({
    color: 0xffeed0, emissive: 0xffc860, emissiveIntensity: 1.8, roughness: 0.3,
  }),
  perfumeGlass: new THREE.MeshPhysicalMaterial({
    color: 0xf2f8ff, roughness: 0.06, metalness: 0.1, transparent: true, opacity: 0.65, clearcoat: 1.0,
  }),
  perfumeAmber: new THREE.MeshPhysicalMaterial({
    color: 0xda7820, roughness: 0.12, metalness: 0.25, clearcoat: 1.0,
  }),
  perfumeRose: new THREE.MeshPhysicalMaterial({
    color: 0xd84868, roughness: 0.12, metalness: 0.25, clearcoat: 1.0,
  }),
  chocGold: new THREE.MeshStandardMaterial({
    color: 0xdcb848, roughness: 0.26, metalness: 0.72,
  }),
  chocRed: new THREE.MeshStandardMaterial({
    color: 0x9e1a22, roughness: 0.38, metalness: 0.25,
  }),
  chocDark: new THREE.MeshStandardMaterial({
    color: 0x241610, roughness: 0.42, metalness: 0.15,
  }),
  plushBrown: new THREE.MeshStandardMaterial({
    color: 0x86502c, roughness: 0.98,
  }),
  plushRed: new THREE.MeshStandardMaterial({
    color: 0xbe1c2c, roughness: 0.95,
  }),
  plushBeige: new THREE.MeshStandardMaterial({
    color: 0xd6b896, roughness: 0.98,
  }),
  luggageRed: new THREE.MeshPhysicalMaterial({
    color: 0xb41c2c, roughness: 0.22, metalness: 0.35, clearcoat: 0.6,
  }),
  luggageTeal: new THREE.MeshPhysicalMaterial({
    color: 0x168294, roughness: 0.22, metalness: 0.35, clearcoat: 0.6,
  }),
  luggageDark: new THREE.MeshPhysicalMaterial({
    color: 0x202226, roughness: 0.28, metalness: 0.45, clearcoat: 0.5,
  }),
  postcardMat: new THREE.MeshStandardMaterial({
    map: postcardA, roughness: 0.35,
  }),
  magazineMat: new THREE.MeshStandardMaterial({
    map: magazineA, roughness: 0.35,
  }),
  signPerfume: makeSign('PERFUMES & BEAUTY', 'DUTY FREE LUXURY', '#24141c', '#fce8f0'),
  signChoc: makeSign('FINE CONFECTIONERY', 'SWISS CHOCOLATE & SWEETS', '#22150e', '#fcf2e4'),
  signGifts: makeSign('GIFTS & SOUVENIRS', 'PLUSH · TOYS · CRAFTS', '#142018', '#eaf6ee'),
};

const world = new THREE.Group();
scene.add(world);
const crowd = new THREE.Group();
const airside = new THREE.Group();
const scenery = new THREE.Group();
scene.add(crowd, airside, scenery);

{
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    vertexShader: `
      varying vec3 vDir;
      void main() {
        vDir = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      varying vec3 vDir;
      void main() {
        float h = normalize(vDir).y;
        vec3 zenith = vec3(0.42, 0.66, 0.88);
        vec3 horizon = vec3(0.86, 0.90, 0.94);
        vec3 glow = vec3(0.96, 0.88, 0.72);
        vec3 col = mix(horizon, zenith, smoothstep(-0.02, 0.58, h));
        col = mix(glow, col, smoothstep(-0.1, 0.14, h));
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(1400, 32, 16), skyMat);
  dome.frustumCulled = false;
  scenery.add(dome);
}

const G = {
  box: withUV2(new THREE.BoxGeometry(1, 1, 1)),
  cyl: withUV2(new THREE.CylinderGeometry(0.5, 0.5, 1, 16)),
  cylBase: withUV2(new THREE.CylinderGeometry(0.5, 0.5, 1, 16).translate(0, 0.5, 0)),
  sphere: withUV2(new THREE.SphereGeometry(0.5, 14, 10)),
  cone: withUV2(new THREE.ConeGeometry(0.5, 1, 14).translate(0, 0.5, 0)),
  card: withUV2(new THREE.PlaneGeometry(1, 1)),
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
function slab(mat, x0, x1, z0, z1, y0, y1) {
  box(mat, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2,
    Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0));
}
function roomLight(x, y, z, intensity, distance) {
  const c = Math.cos(FR), s = Math.sin(FR);
  const l = new THREE.PointLight(0xfff0d8, intensity, distance, 2);
  l.position.set(FX + x * c + z * s, y, FZ - x * s + z * c);
  world.add(l);
}

const F = 0;
const HALL_H = 9.5;   // check-in hall, the grand volume
const SEC_H = 4.0;    // security screening, deliberately low
const CONC_H = 6.4;   // airside concourse
const RETAIL_H = 3.4; // café / shop units under their own bulkhead
const furnitureInteractions = [];
function furnitureInteraction(type, halfWidth, halfDepth, anchorZ = 0, restY = F + 0.46, label) {
  const c = Math.cos(FR), s = Math.sin(FR);
  furnitureInteractions.push({
    type,
    x: FX + anchorZ * s, y: restY, z: FZ + anchorZ * c,
    centerX: FX, centerZ: FZ, approachY: F + 0.02, yaw: FR,
    halfWidth, halfDepth, occupied: false, label,
  });
}

// ---------------------------------------------------------------------------
// Ground. Zones follow the linear-terminal plan (curb → hall → security →
// concourse → apron), each with its own floor finish so the rooms read apart:
// terrazzo hall, tiled checkpoint, carpet airside, timber-paver retail units.
// ---------------------------------------------------------------------------
slab(M.asphalt, -80, 80, -72, -40, -0.12, 0.02);           // approach road
slab(M.paint, -30, 30, -40.5, -40, 0.02, 0.1);             // curb stone
slab(M.concrete, -30, 30, -40, -32, 0, 0.08);              // sidewalk
slab(M.terrazzo, -24, 24, -32, -8, 0, 0.04);               // check-in hall
slab(M.secFloor, -12, 12, -8, 2, 0, 0.045);                // security room
slab(M.carpet, -10, 10, 2, 16, 0, 0.05);                   // airside walkway
slab(M.carpet, -24, 24, 16, 38, 0, 0.05);                  // boarding lounge
slab(M.tile, -24, -10, 2, 16, 0, 0.05);                    // café floor
slab(M.tile, 10, 24, 2, 16, 0, 0.05);                      // shop floor
slab(M.concrete, -80, -24, -40, 38.2, -0.06, 0.0);         // landside aprons
slab(M.concrete, 24, 80, -40, 38.2, -0.06, 0.0);
slab(M.asphalt, -70, 70, 38.2, 210, -0.08, 0.0);           // apron + field
slab(M.asphalt, 28, 54, 30, 210, -0.06, 0.03);             // runway
slab(M.paint, 40.6, 41.4, 34, 200, 0.03, 0.045);           // centreline
for (let z = 40; z < 200; z += 18) {
  slab(M.paint, 29.2, 32.4, z, z + 2.2, 0.03, 0.045);
  slab(M.paint, 49.6, 52.8, z, z + 2.2, 0.03, 0.045);
}
slab(M.paintYellow, 27.7, 28.3, 32, 208, 0.03, 0.05);
slab(M.paintYellow, 53.7, 54.3, 32, 208, 0.03, 0.05);
for (const gx of [-8, 8, -30])                              // gate lead-in lines
  slab(M.paintYellow, gx - 0.18, gx + 0.18, 40, 78, 0.005, 0.02);
slab(M.grass, -80, 26, 42, 210, -0.1, -0.02);
slab(M.grass, 56, 90, 32, 210, -0.1, -0.02);

// --- Runway Rubber Skid Marks (Touchdown Zone) ---
for (let sz = 46; sz < 94; sz += 5) {
  slab(M.rubberSkid, 39.4, 40.4, sz, sz + 3.6, 0.032, 0.046);
  slab(M.rubberSkid, 41.6, 42.6, sz, sz + 3.6, 0.032, 0.046);
}
// --- Apron Oil Stains & Parking Stop Bars ---
for (const gx of [-8, 8, -30]) {
  slab(M.paintYellow, gx - 1.8, gx + 1.8, 63.8, 64.4, 0.01, 0.03); // T-stop bar
  shape(G.cyl, M.oilStain, gx, 0.015, 62.5, 3.2, 0.01, 3.2);       // engine/APU drip zone
}

// --- Aerodrome Runway & Taxiway Lighting Infrastructure ---
function elevatedRunwayLight(x, z, mat) {
  shape(G.cylBase, M.steelDark, x, 0.03, z, 0.12, 0.22, 0.12);
  shape(G.sphere, mat, x, 0.26, z, 0.18, 0.18, 0.18);
}
function flushCenterlineLight(x, z, mat) {
  shape(G.cylBase, mat, x, 0.035, z, 0.22, 0.04, 0.22);
}

// Elevated runway edge lights (White / Amber near rollout end)
for (let rz = 32; rz <= 208; rz += 11) {
  const edgeMat = rz > 165 ? M.runwayLightAmber : M.runwayLightWhite;
  elevatedRunwayLight(27.8, rz, edgeMat);
  elevatedRunwayLight(54.2, rz, edgeMat);
}
// Runway Threshold lights: Green at arrival threshold (z=32), Red at departure end (z=208)
for (let rx = 28.5; rx <= 53.5; rx += 2.1) {
  elevatedRunwayLight(rx, 32.0, M.runwayLightGreen);
  elevatedRunwayLight(rx, 208.0, M.runwayLightRed);
}
// Flush runway centerline lights (White)
for (let cz = 36; cz < 204; cz += 12) {
  flushCenterlineLight(41.0, cz, M.runwayLightWhite);
}
// Taxiway Edge Lights (Blue) along apron perimeter
for (let tx = -24; tx <= 24; tx += 4.5) {
  elevatedRunwayLight(tx, 38.6, M.taxiwayLightBlue);
}
for (let tz = 38.6; tz <= 78; tz += 6.5) {
  elevatedRunwayLight(-24.2, tz, M.taxiwayLightBlue);
  elevatedRunwayLight(24.2, tz, M.taxiwayLightBlue);
}
// Taxiway Centerline Guidance Lights (Green)
for (const tgx of [-8, 8]) {
  for (let tgz = 40; tgz <= 76; tgz += 5.5) {
    flushCenterlineLight(tgx, tgz, M.taxiwayLightGreen);
  }
}
// PAPI (Precision Approach Path Indicator) 4-unit light bar at touchdown zone
for (let pi = 0; pi < 4; pi++) {
  const papiX = 23.4 - pi * 1.0;
  shape(G.box, M.steelDark, papiX, 0.16, 62, 0.55, 0.32, 0.65);
  shape(G.sphere, pi < 2 ? M.papiWhite : M.papiRed, papiX, 0.28, 62, 0.24, 0.24, 0.24);
}

// Drop-off canopy over the sidewalk, lit from underneath
slab(M.steelDark, -20, 20, -40, -33.2, 5.3, 5.7);
for (const x of [-18, -6, 6, 18])
  shape(G.cylBase, M.steel, x, F + 0.08, -36.4, 0.24, 5.25, 0.24);
for (let x = -16; x <= 16; x += 8)
  box(M.lightBar, x, 5.26, -36.6, 5.2, 0.07, 0.45);
roomLight(0, 4.6, -36.5, 1.8, 18);
roomLight(-14, 4.6, -36.5, 1.2, 12);
roomLight(14, 4.6, -36.5, 1.2, 12);

// ---------------------------------------------------------------------------
// Terminal shell — every zone fully partitioned, in plan order.
//
//   south facade (glass + sliding doors, z=-32)
//   CHECK-IN HALL  x -24..24, z -32..-8, 9.5 m high
//   north hall wall, one portal x -10..-4 → SECURITY  x -12..12, z -8..2
//   security exits x 4..10 → CONCOURSE z 2..38 (café west, shop east, lounge)
//   north curtain wall on the apron, z=38
// ---------------------------------------------------------------------------

// South facade: full-height glazing, mullions every 4 m, central sliding doors
for (let x = -24; x <= 24; x += 4)
  if (Math.abs(x) > 3.2) box(M.steel, x, HALL_H / 2, -32, 0.16, HALL_H, 0.2);
slab(M.steel, -24, -3, -32.1, -31.9, 4.35, 4.6);           // transom
slab(M.steel, 3, 24, -32.1, -31.9, 4.35, 4.6);
slab(M.steel, -24, -3, -32.1, -31.9, F, 0.2);              // sill
slab(M.steel, 3, 24, -32.1, -31.9, F, 0.2);
slab(M.glass, -24, -3, -32.04, -31.96, 0.2, 9.3);
slab(M.glass, 3, 24, -32.04, -31.96, 0.2, 9.3);
slab(M.glass, -3, 3, -32.04, -31.96, 4.6, 9.3);            // above the doors
slab(M.plaster, -24.2, 24.2, -32.16, -31.84, 9.3, HALL_H); // top band
box(M.steel, -3, 2.3, -32, 0.26, 4.6, 0.3);                // door portal
box(M.steel, 3, 2.3, -32, 0.26, 4.6, 0.3);
box(M.steel, 0, 4.48, -32, 6.3, 0.28, 0.3);
box(M.glass, -4.6, 2.12, -31.68, 2.9, 4.2, 0.06);          // parked door leaves
box(M.glass, 4.6, 2.12, -31.68, 2.9, 4.2, 0.06);
box(M.signDept, 0, 7.0, -32.3, 8.6, 1.3, 0.08);            // fascia, street side

// Hall side walls, ceiling, columns
slab(M.plaster, -24.2, -23.8, -32, -8, F, HALL_H);
slab(M.plaster, 23.8, 24.2, -32, -8, F, HALL_H);
slab(M.ceiling, -24.2, 24.2, -32, -8, HALL_H, HALL_H + 0.2);
for (const zRow of [-20, -12])
  for (let x = -18; x <= 18; x += 6)
    box(M.lightBar, x, HALL_H - 0.12, zRow, 4.6, 0.09, 0.5);
for (const [x, z] of [[-16, -20], [16, -20], [-16, -12], [16, -12]]) {
  shape(G.cylBase, M.steel, x, F, z, 0.5, HALL_H, 0.5);
  shape(G.cyl, M.steelDark, x, HALL_H - 0.22, z, 0.72, 0.18, 0.72);
  shape(G.cyl, M.steelDark, x, F + 0.12, z, 0.68, 0.16, 0.68);
}
for (const zRow of [-26, -16])
  box(M.steelDark, 0, HALL_H - 0.08, zRow, 46, 0.12, 0.28);
// Hall identity: timber dado, cyan wayfinding rail, slat panels, travel ads
slab(M.wainscot, -24.05, -23.72, -31.6, -8.4, F, 1.28);
slab(M.wainscot, 23.72, 24.05, -31.6, -8.4, F, 1.28);
slab(M.accent, -24.08, -23.7, -31.6, -8.4, 2.22, 2.42);
slab(M.accent, 23.7, 24.08, -31.6, -8.4, 2.22, 2.42);
slab(M.steel, -24.08, -23.7, -31.6, -8.4, F, 0.08);
slab(M.steel, 23.7, 24.08, -31.6, -8.4, F, 0.08);
box(M.slat, -23.68, 3.4, -14.5, 0.08, 4.2, 4.4);
box(M.slat, 23.68, 3.4, -14.5, 0.08, 4.2, 4.4);
box(M.posterTokyo, -23.68, 4.55, -26.2, 0.05, 2.6, 4.2);
box(M.posterParis, 23.68, 4.55, -26.2, 0.05, 2.6, 4.2);
box(M.posterNy, -23.68, 4.55, -20.2, 0.05, 2.6, 4.2);
box(M.posterSydney, 23.68, 4.55, -20.2, 0.05, 2.6, 4.2);
// CHECK-IN sign hung over the islands
box(M.signCheck, 0, 6.4, -20.5, 6.2, 1.1, 0.08);
box(M.steelDark, -2.6, 8.2, -20.5, 0.05, 2.5, 0.05);
box(M.steelDark, 2.6, 8.2, -20.5, 0.05, 2.5, 0.05);
// Clock over the security portal + roof-line PACIFIC GATE on the curb canopy
slab(M.wainscot, -24, -10.2, -8.05, -7.72, F, 1.28);
slab(M.wainscot, -3.8, 24, -8.05, -7.72, F, 1.28);
slab(M.accent, -24, -10.2, -8.05, -7.72, 2.22, 2.42);
slab(M.accent, -3.8, 24, -8.05, -7.72, 2.22, 2.42);
box(M.clock, -7, 5.2, -8.32, 0.9, 0.9, 0.06);
box(M.posterParis, 17.4, 4.7, -7.72, 4.4, 2.5, 0.05);
box(M.signDept, 0, 6.55, -36.4, 10.4, 1.15, 0.12);

// Hall north wall: solid, one portal into security at x -10..-4
slab(M.plaster, -24, -10, -8.2, -7.8, F, HALL_H);
slab(M.plaster, -4, 24, -8.2, -7.8, F, HALL_H);
slab(M.plaster, -10, -4, -8.2, -7.8, 3.3, HALL_H);
// Dark portal so the opening reads against the plaster
box(M.steelDark, -10, 1.65, -8.0, 0.22, 3.3, 0.32);
box(M.steelDark, -4, 1.65, -8.0, 0.22, 3.3, 0.32);
box(M.steelDark, -7, 3.32, -8.0, 6.22, 0.18, 0.32);
slab(M.paintYellow, -10, -4, -8.12, -7.88, 0.04, 0.075);
box(M.signSec, -7, 3.95, -7.7, 5.2, 0.95, 0.08);
// FIDS bank on the wall east of the portal
box(M.steelDark, 9, 4.4, -7.58, 11.0, 3.4, 0.22);
box(M.screen, 9, 4.4, -7.44, 10.2, 3.0, 0.05);

// Security room: x -12..12, low ceiling; solid service blocks either side
slab(M.plaster, -24, -12, -8, 2, F, SEC_H);
slab(M.plaster, 12, 24, -8, 2, F, SEC_H);
slab(M.plaster, -24, -12, -8, 2, SEC_H, CONC_H);           // shell above blocks
slab(M.plaster, 12, 24, -8, 2, SEC_H, CONC_H);
// Inner lining — metal panels, not the hall's plaster
slab(M.secWall, -12.08, -11.72, -8, 2, F, SEC_H);
slab(M.secWall, 11.72, 12.08, -8, 2, F, SEC_H);
slab(M.secWall, -12, -10, -7.78, -7.52, F, SEC_H);          // hall wall, security face
slab(M.secWall, -4, 12, -7.78, -7.52, F, SEC_H);
slab(M.secWall, -12, 2, 1.52, 1.78, F, SEC_H);              // far wall of the checkpoint
slab(M.secWall, 10, 12, 1.52, 1.78, F, SEC_H);              // closes on the shop's west face
slab(M.ceiling, -12, 12, -8, 2, SEC_H, SEC_H + 0.18);
box(M.lightBar, 0, SEC_H - 0.1, -6.4, 20, 0.08, 0.4);
box(M.lightBar, 0, SEC_H - 0.1, -3.2, 20, 0.08, 0.4);
box(M.lightBar, 0, SEC_H - 0.1, 0.4, 20, 0.08, 0.4);

// Concourse south wall: exit from security (x 2..10). The shop starts at
// x=10, so the old 11.5 opening punched a hole through its south wall.
slab(M.plaster, -24, 2, 1.8, 2.2, F, CONC_H);
slab(M.plaster, 10, 24, 1.8, 2.2, F, CONC_H);
slab(M.plaster, 2, 10, 1.8, 2.2, 3.3, CONC_H);
box(M.signArrow, 6, 3.9, 2.34, 6.4, 0.95, 0.08);           // faces airside

// Concourse shell
slab(M.plaster, -24.2, -23.8, 2, 38, F, CONC_H);
slab(M.plaster, 23.8, 24.2, 2, 38, F, CONC_H);
slab(M.ceiling, -24.2, 24.2, 2, 38, CONC_H, CONC_H + 0.18);
for (const zRow of [8, 20, 27, 33])
  for (let x = -18; x <= 18; x += 9)
    box(M.lightBar, x, CONC_H - 0.1, zRow, 6.4, 0.08, 0.4);
// GATES sign at the mouth of the lounge
box(M.signGates, 0, 4.5, 16.8, 5.6, 0.95, 0.08);
box(M.steelDark, -2.4, 5.7, 16.8, 0.05, 1.5, 0.05);
box(M.steelDark, 2.4, 5.7, 16.8, 0.05, 1.5, 0.05);

// North curtain wall: mullions + glass looking at the apron
slab(M.steel, -24.2, 24.2, 37.85, 38.05, F, 0.18);         // sill
slab(M.steel, -24.2, 24.2, 37.85, 38.05, CONC_H - 0.18, CONC_H);
for (let x = -24; x <= 24; x += 4)
  box(M.steel, x, CONC_H / 2, 37.95, 0.12, CONC_H, 0.14);
slab(M.glass, -24, 24, 37.88, 38.12, 0.18, CONC_H - 0.18);
for (const gx of [-8, 8]) box(M.steelDark, gx, 1.3, 37.95, 1.7, 2.6, 0.3); // gate doors

roomLight(0, 7.2, -20, 2.6, 30);
roomLight(-14, 6.5, -13, 1.4, 18);
roomLight(14, 6.5, -13, 1.4, 18);
roomLight(-4, 3.4, -3, 2.2, 15);
roomLight(5, 3.4, -1, 1.8, 14);
{
  const l = new THREE.PointLight(0xd4e4ff, 2.1, 14, 2);
  l.position.set(-6.5, 3.15, -4.2);
  world.add(l);
}
roomLight(0, 4.8, 9, 1.7, 15);
roomLight(-17, 2.8, 9, 1.5, 11);
roomLight(17, 2.8, 9, 1.5, 11);
roomLight(-10, 5.2, 27, 1.9, 18);
roomLight(10, 5.2, 27, 1.9, 18);
roomLight(0, 5.2, 34, 1.8, 16);

// ---------------------------------------------------------------------------
// Check-in / baggage drop — four islands in two banks, queue in front
// ---------------------------------------------------------------------------
function checkInIsland(x, z) {
  prop(() => {
    frame(x, z, 0, () => {
      box(M.desk, 0, F + 0.55, 0, 7.2, 1.1, 1.15);
      box(M.steelDark, 0, F + 1.35, -0.4, 7.2, 0.5, 0.12);
      box(M.screen, 0, F + 1.55, -0.38, 2.4, 0.7, 0.04);
      for (const sx of [-2.4, 0, 2.4]) {
        box(M.steel, sx, F + 0.08, 0.85, 0.9, 0.12, 2.4);   // bag belt
        box(M.steelDark, sx, F + 0.22, 0.85, 0.82, 0.06, 2.2);
        box(M.bag, sx + 0.15, F + 0.38, 1.1, 0.42, 0.28, 0.55);
        box(M.bag2, sx - 0.18, F + 0.32, 1.55, 0.32, 0.22, 0.42);
      }
    });
  });
}
checkInIsland(-11, -24);
checkInIsland(11, -24);
checkInIsland(-11, -17);
checkInIsland(11, -17);

// Queue stanchions in front of each bank, tape between the posts
prop(() => {
  for (const bx of [-11, 11]) {
    for (let i = 0; i < 4; i++) {
      const px = bx - 3.3 + i * 2.2;
      shape(G.cylBase, M.steel, px, F, -27.4, 0.06, 0.95, 0.06);
      shape(G.cylBase, M.steel, px, F, -26.0, 0.06, 0.95, 0.06);
      if (i) {
        box(M.steelDark, px - 1.1, F + 0.9, -27.4, 2.2, 0.045, 0.045);
        box(M.steelDark, px - 1.1, F + 0.9, -26.0, 2.2, 0.045, 0.045);
      }
    }
  }
});

// Benches by the south glass + a rack of baggage trolleys by the doors
function bench(x, z, ry) {
  prop(() => {
    frame(x, z, ry, () => {
      furnitureInteraction('sit', 1.3, 0.3, 0, F + 0.48);
      box(M.cafeWood, 0, F + 0.46, 0, 2.8, 0.09, 0.62);
      box(M.steelDark, -1.2, F + 0.2, 0, 0.08, 0.4, 0.55);
      box(M.steelDark, 1.2, F + 0.2, 0, 0.08, 0.4, 0.55);
    });
  });
}
bench(-15, -29.8, 0);
bench(15, -29.8, 0);
bench(-20, -10.5, Math.PI);   // under the FIDS side of the hall
bench(20, -10.5, Math.PI);
prop(() => {
  for (let i = 0; i < 3; i++) {
    frame(-6.8, -30.2 - i * 0.55, 0, () => {
      box(M.steel, 0, F + 0.5, 0, 0.62, 1.0, 0.08);          // handle frame
      box(M.steel, 0, F + 0.18, 0.35, 0.6, 0.06, 0.75);      // tray
    });
  }
});

// ---------------------------------------------------------------------------
// Security screening — queue, three lanes (roller bed, x-ray tunnel, WTMD),
// recompose table by the exit. Flow runs south → north.
// ---------------------------------------------------------------------------
prop(() => {
  // zig-zag queue between the entry portal and the lanes
  for (let i = 0; i < 4; i++) {
    const px = -10 + i * 2.2;
    shape(G.cylBase, M.steel, px, F, -7.0, 0.06, 0.95, 0.06);
    shape(G.cylBase, M.steel, px, F, -4.2, 0.06, 0.95, 0.06);
    if (i) {
      box(M.steelDark, px - 1.1, F + 0.9, -7.0, 2.2, 0.045, 0.045);
      box(M.steelDark, px - 1.1, F + 0.9, -4.2, 2.2, 0.045, 0.045);
    }
  }
  for (const lx of [-7.5, -2.5, 2.5]) {
    box(M.steel, lx + 1.35, F + 0.42, -1.2, 0.72, 0.72, 3.4);      // belt base
    box(M.steelDark, lx + 1.35, F + 0.8, -1.2, 0.86, 0.07, 3.6);   // rollers
    box(M.paint, lx + 1.35, F + 1.28, -0.7, 1.06, 0.9, 1.35);      // x-ray tunnel
    box(M.steelDark, lx + 1.35, F + 1.28, -0.68, 0.9, 0.62, 1.37); // tunnel mouth
    box(M.bag3, lx + 1.35, F + 0.96, -2.4, 0.4, 0.24, 0.6);        // trays
    box(M.bag2, lx + 1.35, F + 0.95, 0.5, 0.36, 0.22, 0.5);
    box(M.paint, lx - 0.62, F + 1.05, -1.0, 0.14, 2.1, 0.5);       // WTMD arch
    box(M.paint, lx + 0.62, F + 1.05, -1.0, 0.14, 2.1, 0.5);
    box(M.steelDark, lx, F + 2.16, -1.0, 1.38, 0.12, 0.5);
  }
  // Recompose against the east wall, south of the exit — not in the aisle
  box(M.steel, 10.4, F + 0.72, -2.4, 2.2, 0.08, 0.9);
  box(M.steel, 10.4, F + 0.36, -2.4, 2.0, 0.64, 0.8);
  box(M.bag, 9.7, F + 0.95, -2.4, 0.42, 0.3, 0.55);
  box(M.bag3, 11.0, F + 0.92, -2.35, 0.38, 0.26, 0.5);
});

// ---------------------------------------------------------------------------
// GATE CAFÉ — a real walled unit, x -24..-10 / z 2..16, storefront on the
// walkway with its opening at z 6..12, its own bulkhead ceiling and lights.
// ---------------------------------------------------------------------------
slab(M.plasterWarm, -10.2, -9.8, 2, 6, F, RETAIL_H);
slab(M.plasterWarm, -10.2, -9.8, 12, 16, F, RETAIL_H);
slab(M.plasterWarm, -10.2, -9.8, 6, 12, 2.55, RETAIL_H);   // header over opening
slab(M.plasterWarm, -24, -10, 15.8, 16.2, F, RETAIL_H);    // north wall
slab(M.ceiling, -24, -10, 2, 16, RETAIL_H, RETAIL_H + 0.14);
for (const lz of [5.5, 12.5])
  box(M.lightBar, -17, RETAIL_H - 0.08, lz, 8, 0.07, 0.35);
box(M.signCafe, -9.66, 3.0, 9, 0.08, 0.8, 5.0);            // fascia over opening
slab(M.glass, -10.02, -9.98, 2.4, 5.7, 0.25, 2.4);         // storefront glazing
slab(M.glass, -10.02, -9.98, 12.3, 15.6, 0.25, 2.4);

function cafeChair(x, z, ry) {
  prop(() => {
    frame(x, z, ry, () => {
      furnitureInteraction('sit', 0.32, 0.32, 0, F + 0.48);
      box(M.cafeWood, 0, F + 0.46, 0, 0.5, 0.08, 0.5);
      box(M.cafeWood, 0, F + 0.78, -0.18, 0.48, 0.56, 0.07);
      for (const [dx, dz] of [[-0.18, -0.18], [0.18, -0.18], [-0.18, 0.18], [0.18, 0.18]])
        box(M.cafeWood, dx, F + 0.23, dz, 0.055, 0.46, 0.055);
    });
  });
}
prop(() => {
  box(M.cafeWood, -21.3, F + 0.6, 9, 1.3, 1.2, 7.6);       // service counter
  box(M.cafeWood, -23.5, F + 1.0, 9, 0.6, 2.0, 7.6);       // back bar
  box(M.menu, -23.15, 2.5, 9, 0.06, 1.15, 4.4);            // menu board
  box(M.steel, -21.3, F + 1.45, 6.8, 0.9, 0.5, 1.2);       // espresso machine
  box(M.steelDark, -21.3, F + 1.72, 6.55, 0.55, 0.18, 0.55);
  shape(G.cyl, M.steel, -21.55, F + 1.82, 6.55, 0.18, 0.22, 0.18);
  box(M.glass, -21.3, F + 1.5, 11.2, 0.8, 0.6, 1.4);       // pastry case
  box(M.fabricWarm, -21.55, F + 1.28, 10.7, 0.22, 0.08, 0.28);
  box(M.fabricWarm, -21.2, F + 1.3, 11.15, 0.26, 0.1, 0.22);
  box(M.shirt, -21.45, F + 1.29, 11.55, 0.2, 0.07, 0.24);
  for (const pz of [5, 9, 13]) {                            // pendants over the bar
    box(M.steelDark, -20.4, 2.9, pz, 0.04, 0.9, 0.04);
    shape(G.sphere, M.lightBar, -20.4, 2.4, pz, 0.3, 0.24, 0.3);
  }
});
function cafeTable(x, z) {
  prop(() => {
    shape(G.cyl, M.cafeWood, x, F + 0.74, z, 1.0, 0.06, 1.0);
    shape(G.cyl, M.steelDark, x, F + 0.37, z, 0.08, 0.74, 0.08);
    shape(G.cyl, M.steelDark, x, F + 0.03, z, 0.5, 0.06, 0.5);
  });
  cafeChair(x - 0.85, z, Math.PI / 2);
  cafeChair(x + 0.85, z, -Math.PI / 2);
}
cafeTable(-17.6, 4.8);
cafeTable(-13.6, 5.2);
cafeTable(-17.6, 9);
cafeTable(-13.6, 9.4);
cafeTable(-17.6, 13.2);
cafeTable(-13.6, 12.8);
prop(() => {
  for (const [x, z] of [[-17.6, 4.8], [-13.6, 9.4], [-17.6, 13.2]]) {
    shape(G.cyl, M.shirt, x + 0.16, F + 0.82, z + 0.1, 0.09, 0.08, 0.09);
    shape(G.cyl, M.shirt, x + 0.16, F + 0.88, z + 0.1, 0.07, 0.04, 0.07);
    shape(G.cyl, M.fabricWarm, x - 0.18, F + 0.8, z - 0.12, 0.14, 0.05, 0.1);
  }
});

// ---------------------------------------------------------------------------
// SOUVENIR SHOP (DUTY FREE) — Warm, rich and vibrant retail flagship unit,
// x 10..24 / z 2..16. Warm oak & mahogany paneling, gold trims, illuminated
// shelves, luxury perfumes, fine Swiss chocolates, plush mascots, rotary
// postcard racks, spinner suitcases, and warm ambient 2700K lighting.
// ---------------------------------------------------------------------------
slab(M.shopWarmWall, 9.8, 10.2, 2, 6, F, RETAIL_H);
slab(M.shopWarmWall, 9.8, 10.2, 12, 16, F, RETAIL_H);
slab(M.shopWoodDark, 9.8, 10.2, 6, 12, 2.55, RETAIL_H);   // luxury dark wood header
slab(M.shopWarmWall, 10, 24, 1.98, 2.16, F, RETAIL_H);     // south wall
slab(M.shopWarmWall, 10, 24, 15.8, 16.2, F, RETAIL_H);     // north wall
slab(M.ceiling, 10, 24, 2, 16, RETAIL_H, RETAIL_H + 0.14);

// Wooden slat wall paneling & luxury trims
box(M.slat, 17, RETAIL_H / 2, 15.72, 13.8, RETAIL_H - 0.2, 0.08);
box(M.slat, 23.72, RETAIL_H / 2, 9, 0.08, RETAIL_H - 0.2, 13.8);
box(M.shopGold, 17, 0.1, 15.72, 13.8, 0.08, 0.09);
box(M.shopGold, 23.72, 0.1, 9, 0.09, 0.08, 13.8);

// Luxury burgundy central aisle runner carpet
slab(M.shopCarpet, 11.5, 22.5, 4.2, 13.8, 0.05, 0.058);

// Warm ambient light bars & downlights
for (const lz of [5.2, 8.8, 12.8]) {
  box(M.shopLightWarm, 17, RETAIL_H - 0.08, lz, 9.5, 0.06, 0.28);
}
roomLight(13.5, 2.9, 5.5, 1.8, 12);
roomLight(20.5, 2.9, 5.5, 1.8, 12);
roomLight(13.5, 2.9, 12.5, 1.8, 12);
roomLight(20.5, 2.9, 12.5, 1.8, 12);

// Entrance illuminated fascia sign
box(M.signShop, 9.66, 3.0, 9, 0.08, 0.8, 5.0);

// Helper product builders
function perfumeBottle(x, y, z, matBody, matCap, h = 0.24, isRound = false) {
  if (isRound) shape(G.sphere, matBody, x, y + h * 0.45, z, 0.12, h * 0.8, 0.12);
  else box(matBody, x, y + h * 0.45, z, 0.11, h * 0.9, 0.11);
  shape(G.cyl, matCap, x, y + h + 0.03, z, 0.045, 0.06, 0.045);
}
function chocPyramid(x, y, z) {
  shape(G.cone, M.chocGold, x, y, z, 0.14, 0.22, 0.14);
}
function chocBox(x, y, z, mat, w = 0.28, h = 0.08, d = 0.18, ry = 0) {
  box(mat, x, y + h / 2, z, w, h, d, ry);
  box(M.shopGold, x, y + h / 2, z, w * 0.25, h + 0.005, d + 0.005, ry); // ribbon
}
function teddyBear(x, y, z, ry = 0) {
  frame(x, z, ry, () => {
    shape(G.sphere, M.plushBrown, 0, y + 0.16, 0, 0.22, 0.24, 0.20);
    shape(G.sphere, M.plushBrown, 0, y + 0.32, 0, 0.20, 0.19, 0.18);
    shape(G.sphere, M.plushBeige, 0, y + 0.30, 0.08, 0.11, 0.09, 0.08);
    shape(G.sphere, M.capBlack, 0, y + 0.32, 0.12, 0.035, 0.03, 0.03);
    shape(G.sphere, M.plushBrown, -0.07, y + 0.40, 0, 0.07, 0.07, 0.04);
    shape(G.sphere, M.plushBrown, 0.07, y + 0.40, 0, 0.07, 0.07, 0.04);
    shape(G.sphere, M.plushBeige, -0.07, y + 0.40, 0.02, 0.04, 0.04, 0.02);
    shape(G.sphere, M.plushBeige, 0.07, y + 0.40, 0.02, 0.04, 0.04, 0.02);
    shape(G.cyl, M.plushRed, 0, y + 0.23, 0, 0.18, 0.05, 0.18);
    shape(G.sphere, M.plushBrown, -0.12, y + 0.17, 0.04, 0.08, 0.14, 0.08);
    shape(G.sphere, M.plushBrown, 0.12, y + 0.17, 0.04, 0.08, 0.14, 0.08);
    shape(G.sphere, M.plushBrown, -0.08, y + 0.06, 0.09, 0.09, 0.08, 0.12);
    shape(G.sphere, M.plushBrown, 0.08, y + 0.06, 0.09, 0.09, 0.08, 0.12);
  });
}
function suitcase(x, y, z, mat, ry = 0) {
  frame(x, z, ry, () => {
    box(mat, 0, y + 0.36, 0, 0.32, 0.56, 0.42);
    box(M.steelDark, 0, y + 0.36, 0, 0.325, 0.57, 0.04);
    box(M.shopGold, 0, y + 0.50, 0.14, 0.06, 0.04, 0.03);
    for (const [wx, wz] of [[-0.11, -0.15], [0.11, -0.15], [-0.11, 0.15], [0.11, 0.15]]) {
      shape(G.cyl, M.steelDark, wx, y + 0.04, wz, 0.05, 0.08, 0.05);
    }
    box(M.steelDark, 0, y + 0.68, 0, 0.16, 0.10, 0.03);
  });
}
function snowGlobe(x, y, z) {
  shape(G.cyl, M.shopGold, x, y, z, 0.14, 0.08, 0.14);
  shape(G.sphere, M.perfumeGlass, x, y + 0.14, z, 0.18, 0.18, 0.18);
  shape(G.cone, M.gold, x, y + 0.12, z, 0.08, 0.14, 0.08);
}
function souvenirMug(x, y, z, mat) {
  shape(G.cyl, mat, x, y + 0.08, z, 0.11, 0.16, 0.11);
  box(mat, x + 0.07, y + 0.08, z, 0.04, 0.10, 0.06);
}

// --- Entrance Showcase Display Windows ---
for (const wz of [4, 14]) {
  box(M.shopWoodDark, 10.3, F + 0.45, wz, 0.32, 0.9, 3.2);
  box(M.glass, 10.32, F + 1.7, wz, 0.1, 1.6, 3.0);
  box(M.shopLightWarm, 10.28, F + 0.92, wz, 0.22, 0.04, 2.8);
  box(M.shopGold, 10.3, F + 0.91, wz, 0.34, 0.03, 3.2);
}
prop(() => {
  // Left window showcase: Perfumes & Gold Chocolates
  perfumeBottle(10.28, F + 0.96, 3.1, M.perfumeAmber, M.capGold, 0.26);
  perfumeBottle(10.28, F + 0.96, 3.5, M.perfumeRose, M.shopGold, 0.24, true);
  chocPyramid(10.28, F + 0.96, 4.0);
  chocBox(10.28, F + 0.96, 4.5, M.chocRed, 0.32, 0.09, 0.2);
  snowGlobe(10.28, F + 0.96, 5.0);

  // Right window showcase: Teddy Mascot & Luxe Treats
  teddyBear(10.28, F + 0.96, 12.8, Math.PI / 2);
  chocBox(10.28, F + 0.96, 13.5, M.chocGold, 0.3, 0.08, 0.18);
  perfumeBottle(10.28, F + 0.96, 14.1, M.perfumeGlass, M.capBlack, 0.28);
  chocPyramid(10.28, F + 0.96, 14.7);
  snowGlobe(10.28, F + 0.96, 15.2);
});

// --- Zone 1 & 2: North Wall Luxury Duty-Free Wall Units ---
prop(() => {
  // Zone 1: Perfumes & Cosmetics (x: 10.8..16.8, z: 15.4)
  box(M.shopWoodDark, 13.8, F + 1.25, 15.46, 5.8, 2.5, 0.35);
  box(M.signPerfume, 13.8, F + 2.65, 15.3, 5.2, 0.48, 0.06);
  for (const sy of [0.55, 1.15, 1.75]) {
    box(M.shopWood, 13.8, F + sy, 15.3, 5.6, 0.04, 0.3);
    box(M.shopLightWarm, 13.8, F + sy + 0.01, 15.42, 5.4, 0.02, 0.06); // under-shelf LED
  }
  const perfumeMats = [M.perfumeAmber, M.perfumeRose, M.perfumeGlass, M.bottleAmber];
  for (let i = 0; i < 6; i++) {
    const px = 11.6 + i * 0.88;
    perfumeBottle(px, F + 0.58, 15.25, perfumeMats[i % 4], M.capGold, 0.24 + (i % 2) * 0.04);
    perfumeBottle(px, F + 1.18, 15.25, perfumeMats[(i + 1) % 4], M.capBlack, 0.22, i % 2 === 0);
    perfumeBottle(px, F + 1.78, 15.25, perfumeMats[(i + 2) % 4], M.shopGold, 0.25);
  }

  // Zone 2: Fine Chocolates & Sweets (x: 17.2..23.4, z: 15.4)
  box(M.shopWoodDark, 20.3, F + 1.25, 15.46, 5.8, 2.5, 0.35);
  box(M.signChoc, 20.3, F + 2.65, 15.3, 5.2, 0.48, 0.06);
  for (const sy of [0.55, 1.15, 1.75]) {
    box(M.shopWood, 20.3, F + sy, 15.3, 5.6, 0.04, 0.3);
    box(M.shopLightWarm, 20.3, F + sy + 0.01, 15.42, 5.4, 0.02, 0.06);
  }
  for (let i = 0; i < 6; i++) {
    const cx = 18.0 + i * 0.92;
    chocBox(cx, F + 0.58, 15.25, [M.chocRed, M.chocGold, M.chocDark][i % 3], 0.36, 0.09, 0.22);
    if (i % 2 === 0) chocPyramid(cx, F + 1.18, 15.25);
    else chocBox(cx, F + 1.18, 15.25, M.chocGold, 0.32, 0.08, 0.2);
    chocBox(cx, F + 1.78, 15.25, [M.chocDark, M.chocRed, M.chocGold][(i + 1) % 3], 0.34, 0.08, 0.2);
  }
});

// --- Zone 3: East Wall - Mascots, Plush Toys, Mugs & Souvenirs ---
prop(() => {
  box(M.shopWoodDark, 23.55, F + 1.25, 9.0, 0.35, 2.5, 11.2);
  box(M.signGifts, 23.36, F + 2.65, 9.0, 0.06, 0.48, 6.2);
  for (const sy of [0.52, 1.05, 1.62, 2.15]) {
    box(M.shopWood, 23.38, F + sy, 9.0, 0.3, 0.04, 10.8);
    box(M.shopLightWarm, 23.5, F + sy + 0.01, 9.0, 0.06, 0.02, 10.4);
  }
  // Shelf 1 & 2: Teddy Bears & Mugs
  for (let i = 0; i < 7; i++) {
    const sz = 4.4 + i * 1.5;
    if (i % 2 === 0) teddyBear(23.28, F + 0.56, sz, -Math.PI / 2);
    else souvenirMug(23.28, F + 0.56, sz, [M.shirtRed, M.shirtBlue, M.gold][i % 3]);
    
    if (i % 2 !== 0) teddyBear(23.28, F + 1.09, sz, -Math.PI / 2);
    else snowGlobe(23.28, F + 1.09, sz);

    souvenirMug(23.28, F + 1.66, sz, [M.shirtBlue, M.gold, M.shirtRed][i % 3]);
    box([M.shirt, M.shirtBlue, M.shirtRed][i % 3], 23.28, F + 2.22, sz, 0.24, 0.07, 0.32);
  }
});

// --- Zone 4: Central Island 1 - Rotary Postcard & Travel Magazine Stand ---
prop(() => {
  const rx = 14.2, rz = 8.5;
  shape(G.cylBase, M.steelDark, rx, F, rz, 0.45, 0.45, 0.45);
  shape(G.cyl, M.shopGold, rx, F + 0.48, rz, 0.08, 0.9, 0.08);
  // Postcards 4-sided rotary display
  box(M.postcardMat, rx, F + 1.15, rz + 0.22, 0.52, 0.72, 0.04);
  box(M.postcardMat, rx, F + 1.15, rz - 0.22, 0.52, 0.72, 0.04);
  box(M.postcardMat, rx + 0.22, F + 1.15, rz, 0.04, 0.72, 0.52);
  box(M.postcardMat, rx - 0.22, F + 1.15, rz, 0.04, 0.72, 0.52);
  // Top Magazine rack tier
  box(M.magazineMat, rx, F + 1.68, rz + 0.18, 0.44, 0.38, 0.04);
  box(M.magazineMat, rx, F + 1.68, rz - 0.18, 0.44, 0.38, 0.04);
  shape(G.cone, M.shopGold, rx, F + 1.95, rz, 0.22, 0.22, 0.22);
});

// --- Zone 5: Central Island 2 - Hard-Shell Spinner Suitcases & Travel Gear ---
prop(() => {
  const sx = 18.8, sz = 8.5;
  // Wooden presentation dais with gold kickplate
  box(M.shopWood, sx, F + 0.12, sz, 2.6, 0.24, 4.4);
  box(M.shopGold, sx, F + 0.24, sz, 2.64, 0.03, 4.44);

  // Stacks of premium luggage
  suitcase(sx - 0.65, F + 0.24, sz - 1.2, M.luggageRed, 0.1);
  suitcase(sx + 0.65, F + 0.24, sz - 1.2, M.luggageTeal, -0.15);
  suitcase(sx - 0.65, F + 0.24, sz + 0.2, M.luggageDark, 0.05);
  suitcase(sx + 0.65, F + 0.24, sz + 0.2, M.luggageRed, 0.2);
  suitcase(sx, F + 0.24, sz + 1.3, M.luggageTeal, Math.PI / 2);

  // Travel neck pillows (U-shaped toruses)
  shape(G.cone, M.fabric, sx - 0.5, F + 0.95, sz - 1.2, 0.2, 0.12, 0.2);
  shape(G.cone, M.fabricWarm, sx + 0.5, F + 0.95, sz + 0.2, 0.2, 0.12, 0.2);
});

// --- Zone 6: Cashier Counter Upgrade ---
prop(() => {
  // Main counter in warm wood with mahogany top & gold base
  box(M.shopWoodDark, 13.4, F + 0.54, 3.6, 2.8, 1.08, 1.1);
  box(M.desk, 13.4, F + 1.1, 3.6, 2.86, 0.06, 1.16);
  box(M.shopGold, 13.4, F + 0.06, 3.6, 2.84, 0.12, 1.14);

  // Dual POS terminals
  box(M.screen, 12.8, F + 1.32, 3.6, 0.44, 0.32, 0.04);
  box(M.screen, 14.0, F + 1.32, 3.6, 0.44, 0.32, 0.04);
  box(M.steelDark, 13.4, F + 1.16, 3.4, 0.22, 0.08, 0.32); // scanner

  // Impulse buy candy display on counter front
  box(M.chocRed, 12.4, F + 1.16, 3.85, 0.22, 0.06, 0.14);
  box(M.chocGold, 14.4, F + 1.16, 3.85, 0.22, 0.06, 0.14);

  // Warm brass pendant lamps above checkout
  for (const py of [-0.6, 0.6]) {
    box(M.shopGold, 13.4 + py, 2.8, 3.6, 0.02, 0.7, 0.02);
    shape(G.cone, M.shopGold, 13.4 + py, 2.45, 3.6, 0.28, 0.18, 0.28);
    shape(G.sphere, M.shopLightWarm, 13.4 + py, 2.38, 3.6, 0.14, 0.14, 0.14);
  }
});

// --- Elegant Indoor Greenery in Brass Planters ---
function shopPlant(x, z) {
  prop(() => {
    shape(G.cylBase, M.shopGold, x, F, z, 0.42, 0.62, 0.42);
    shape(G.sphere, M.hill, x, F + 0.75, z, 0.55, 0.5, 0.55);
    shape(G.sphere, M.grass, x + 0.08, F + 0.95, z - 0.06, 0.45, 0.42, 0.45);
    shape(G.sphere, M.grass, x - 0.08, F + 0.92, z + 0.08, 0.42, 0.38, 0.42);
  });
}
shopPlant(22.8, 2.8);
shopPlant(22.8, 15.0);
shopPlant(10.8, 15.0);

// Walkway greenery + bins between the two units
function plant(x, z) {
  prop(() => {
    shape(G.cyl, M.steelDark, x, F + 0.28, z, 0.62, 0.56, 0.62);
    shape(G.sphere, M.hill, x, F + 0.95, z, 0.85, 0.7, 0.85);
    shape(G.sphere, M.grass, x + 0.18, F + 1.2, z - 0.12, 0.7, 0.62, 0.7);
    shape(G.sphere, M.grass, x - 0.16, F + 1.15, z + 0.16, 0.58, 0.55, 0.58);
  });
}
plant(-9, 3.2);
plant(9, 17);
plant(-9, 17);
plant(-14, 18.4);
plant(14, 18.4);
plant(-21, 18.4);
plant(21, 18.4);
prop(() => {
  for (const [bx, bz] of [[9, 3.2], [-6, 18.6], [6, 18.6], [22.5, 20]])
    shape(G.cyl, M.steelDark, bx, F + 0.35, bz, 0.42, 0.7, 0.42);
});

// ---------------------------------------------------------------------------
// BOARDING LOUNGE — back-to-back seat banks facing the glass, gate desks,
// FIDS, restrooms and vending along the walls.
// ---------------------------------------------------------------------------
function loungeChair(x, z, ry) {
  prop(() => {
    frame(x, z, ry, () => {
      // Sit forward of centre so the posed knees clear the lip; recess the
      // plinth so the calves hang in air instead of through the cushion
      // (same layout as the villa armchair).
      furnitureInteraction('sit', 0.28, 0.28, 0.12, F + 0.48);
      box(M.fabric, 0, F + 0.20, -0.12, 0.58, 0.14, 0.40);
      box(M.fabric, 0, F + 0.40, -0.08, 0.54, 0.10, 0.44);
      box(M.fabric, 0, F + 0.64, -0.30, 0.58, 0.44, 0.14);
      box(M.steelDark, -0.26, F + 0.16, -0.10, 0.05, 0.32, 0.40);
      box(M.steelDark, 0.26, F + 0.16, -0.10, 0.05, 0.32, 0.40);
    });
  });
}
for (const [rowZ, ry] of [[24.7, Math.PI], [25.6, 0], [29.2, Math.PI], [30.1, 0]]) {
  for (let i = 0; i < 7; i++) {
    loungeChair(-17.3 + i * 1.6, rowZ, ry);   // west bank
    loungeChair(7.7 + i * 1.6, rowZ, ry);     // east bank
  }
}
for (const [rowZ, ry] of [[29.2, Math.PI], [30.1, 0]]) {
  for (let i = 0; i < 7; i++) loungeChair(-4.8 + i * 1.6, rowZ, ry);  // centre bank
}
// left-behind cabin bags near the seats
prop(() => {
  box(M.bag, -12.4, F + 0.3, 26.6, 0.42, 0.6, 0.28);
  box(M.bag3, 10.6, F + 0.28, 24.0, 0.4, 0.55, 0.26);
  box(M.bag2, 16.2, F + 0.26, 30.9, 0.38, 0.5, 0.26);
});

// Gate desks with their gate signs
prop(() => {
  const gates = [[-14, M.signGateA], [0, M.signGateB], [14, M.signGateC]];
  for (const [x, sign] of gates) {
    box(M.desk, x, F + 0.55, 36.2, 3.4, 1.1, 0.9);
    box(M.steelDark, x, F + 1.4, 36.55, 3.4, 0.55, 0.1);
    box(sign, x, 4.4, 35.6, 4.0, 0.8, 0.08);
    box(M.steelDark, x - 1.7, 5.4, 35.6, 0.05, 1.2, 0.05);
    box(M.steelDark, x + 1.7, 5.4, 35.6, 0.05, 1.2, 0.05);
  }
});
// Lounge FIDS on the east wall
box(M.steelDark, 23.62, 3.1, 26, 0.2, 2.5, 7.6);
box(M.screen, 23.48, 3.1, 26, 0.06, 2.3, 7.2);
box(M.posterDubai, -23.68, 3.4, 27.4, 0.06, 2.2, 3.4);
box(M.slat, -23.68, 2.2, 32.4, 0.08, 3.6, 4.6);
// Restrooms on the west wall
box(M.signWC, -23.6, 3.0, 21, 0.08, 0.7, 2.6);
box(M.steelDark, -23.72, 1.05, 20.2, 0.12, 2.1, 0.9);
box(M.steelDark, -23.72, 1.05, 21.8, 0.12, 2.1, 0.9);
// Vending machines by the shop's back wall
prop(() => {
  for (const vz of [18.6, 20.2]) {
    box(M.steelDark, 23.35, F + 0.95, vz, 0.8, 1.9, 1.1);
    box(M.glass, 22.92, F + 1.05, vz, 0.06, 1.3, 0.9);
  }
});

// ---------------------------------------------------------------------------
// Apron furniture: two jetways onto the parked planes, ground service
// ---------------------------------------------------------------------------
prop(() => {
  // Dock on the aircraft's port side (world −X when the plane faces the
  // terminal). The tube leaves the glass, jogs aside, then runs beside the
  // fuselage so it never occupies the nose on the centreline.
  for (const gx of [-8, 8]) {
    const dock = gx - 2.8;
    box(M.steel, gx, 3.35, 39.2, 1.6, 1.9, 1.6);            // hood at the gate
    box(M.steel, (gx + dock) / 2, 3.35, 41.6, Math.abs(gx - dock) + 1.4, 1.8, 3.2);
    box(M.steel, dock, 3.35, 47.4, 1.45, 1.8, 10.0);        // tube along the side
    box(M.steel, dock, 3.4, 53.0, 1.8, 2.0, 2.2);           // cab at the forward door
    box(M.steelDark, gx, 1.55, 39.6, 0.28, 3.1, 0.28);
    box(M.steelDark, dock, 1.55, 51.4, 0.28, 3.1, 0.28);
  }
  // baggage cart train + loader near gate A2
  frame(14.5, 50, 0.4, () => {
    box(M.steelDark, 0, 0.55, 0, 1.1, 0.5, 2.2);
    box(M.bag, 0, 1.0, -0.4, 0.8, 0.4, 0.8);
    box(M.bag2, 0, 1.0, 0.6, 0.8, 0.4, 0.8);
    box(M.steelDark, 0, 0.55, 3.0, 1.1, 0.5, 2.2);
    box(M.bag3, 0, 1.0, 3.0, 0.8, 0.4, 0.9);
  });
  frame(-14.5, 48, -0.3, () => {                      // belt loader
    box(M.paintYellow, 0, 0.6, 0, 1.2, 0.6, 3.4);
    box(M.steelDark, 0, 1.1, 1.2, 0.9, 0.35, 2.6);
  });
});

// Control tower + hangar — landmarks on the field, not sky-box flats
box(M.tower, 66, 12, 118, 5.2, 24, 5.2);
box(M.steelDark, 66, 24.6, 118, 8.4, 1.4, 8.4);
box(M.towerGlass, 66, 27.2, 118, 9.2, 3.8, 9.2);
box(M.steelDark, 66, 29.3, 118, 9.6, 0.35, 9.6);
box(M.steel, 66, 32.4, 118, 0.22, 6.2, 0.22);
box(M.bag3, 66, 35.6, 118, 0.45, 0.45, 0.45);
box(M.towerDark, -62, 6, 96, 28, 12, 18);
box(M.steelDark, -62, 12.3, 96, 30, 0.5, 20);
box(M.towerGlass, -62, 7.2, 86.8, 18, 3.2, 0.12);

// Animated Control Tower Radar & Hazard Beacon
const towerRadar = new THREE.Group();
towerRadar.position.set(66, 35.8, 118);
{
  const dish = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.2, 0.35, 16, 1, false, 0, Math.PI), M.steel);
  dish.rotation.z = Math.PI / 2;
  towerRadar.add(dish);
  const feed = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 1.3), M.steelDark);
  feed.position.set(0, 0, 0.75);
  towerRadar.add(feed);
  const topBeacon = new THREE.Mesh(new THREE.SphereGeometry(0.24, 8, 8), M.runwayLightRed);
  topBeacon.position.set(0, 0.75, 0);
  towerRadar.add(topBeacon);
}
scenery.add(towerRadar);

flushKits();

// ---------------------------------------------------------------------------
// Airliners — A320-class proportions, built so they read at the glass rather
// than as a mismatched download. White body, coloured tail, CFM-style pods.
// Equipped with realistic navigation, strobe, beacon and exhaust lighting.
// ---------------------------------------------------------------------------
function buildAirliner(livery = 0xc8102e, name = 'PACIFIC') {
  const root = new THREE.Group();
  const white = new THREE.MeshStandardMaterial({ color: 0xf4f6f8, roughness: 0.22, metalness: 0.42 });
  const paint = new THREE.MeshStandardMaterial({ color: livery, roughness: 0.28, metalness: 0.3 });
  const stripe = new THREE.MeshStandardMaterial({ color: livery, roughness: 0.3, metalness: 0.28 });
  const grey = new THREE.MeshStandardMaterial({ color: 0xa8b0b8, roughness: 0.38, metalness: 0.55 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x1a2026, roughness: 0.3, metalness: 0.58 });
  const intake = new THREE.MeshStandardMaterial({ color: 0x0c1014, roughness: 0.55, metalness: 0.2 });
  const rubber = new THREE.MeshStandardMaterial({ color: 0x141618, roughness: 0.9, metalness: 0.05 });
  const fan = new THREE.MeshStandardMaterial({ color: 0x6a7480, roughness: 0.28, metalness: 0.62 });
  const win = new THREE.MeshStandardMaterial({
    color: 0x152030, roughness: 0.08, metalness: 0.65, emissive: 0x0c1828, emissiveIntensity: 0.4,
  });
  const decal = makeAirlineDecal(name, livery);
  const flash = makeTailFlash(livery);
  const add = (geo, mat, pos, scale, rot) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(...pos);
    if (scale) m.scale.set(...scale);
    if (rot) m.rotation.set(...rot);
    m.castShadow = true;
    m.receiveShadow = true;
    root.add(m);
    return m;
  };
  const fuse = new THREE.CylinderGeometry(2.0, 2.0, 28.5, 24);
  fuse.rotateX(Math.PI / 2);
  add(fuse, white, [0, 0, 0]);
  {
    const R = 2, L = 6.2, pts = [];
    for (let i = 0; i <= 14; i++) {
      const t = i / 14;
      pts.push(new THREE.Vector2(R * Math.pow(1 - t, 0.58), t * L));
    }
    const ogive = new THREE.LatheGeometry(pts, 24);
    ogive.rotateX(Math.PI / 2);
    add(ogive, white, [0, 0, 14.25]);
  }
  const tailc = new THREE.ConeGeometry(2.0, 6.4, 18);
  tailc.rotateX(-Math.PI / 2);
  add(tailc, white, [0, 0, -17.45]);
  add(new THREE.BoxGeometry(12.4, 0.55, 7.2), white, [0, -0.85, -0.6]);
  const wing = new THREE.BoxGeometry(1, 1, 1);
  add(wing, white, [5.4, -0.28, -0.6], [8.6, 0.32, 5.4], [0, 0.18, 0.03]);
  add(wing, white, [-5.4, -0.28, -0.6], [8.6, 0.32, 5.4], [0, -0.18, -0.03]);
  add(wing, white, [12.6, -0.38, -2.6], [8.2, 0.16, 3.4], [0, 0.28, 0.05]);
  add(wing, white, [-12.6, -0.38, -2.6], [8.2, 0.16, 3.4], [0, -0.28, -0.05]);
  add(new THREE.BoxGeometry(0.16, 1.7, 1.2), white, [16.6, 0.55, -4.6]);
  add(new THREE.BoxGeometry(0.16, 1.7, 1.2), white, [-16.6, 0.55, -4.6]);
  add(new THREE.BoxGeometry(7.4, 0.18, 2.6), white, [0, 0.15, -17.6]);
  add(new THREE.BoxGeometry(0.28, 6.2, 3.6), paint, [0, 3.85, -16.6], null, [0, 0.12, 0]);
  add(new THREE.PlaneGeometry(1.4, 3.2), flash, [0.16, 4.1, -16.4], null, [0, Math.PI / 2, 0]);
  add(new THREE.PlaneGeometry(1.4, 3.2), flash, [-0.16, 4.1, -16.4], null, [0, -Math.PI / 2, 0]);
  add(new THREE.BoxGeometry(0.16, 0.38, 26), stripe, [0, -0.22, 0.4]);
  for (let i = 0; i < 18; i++) {
    if (i === 3 || i === 12) continue;
    const z = 10.4 - i * 1.18;
    add(new THREE.BoxGeometry(0.08, 0.28, 0.38), win, [1.99, 0.44, z]);
    add(new THREE.BoxGeometry(0.08, 0.28, 0.38), win, [-1.99, 0.44, z]);
  }
  add(new THREE.BoxGeometry(0.06, 1.15, 0.7), dark, [2.0, 0.2, 6.9]);
  add(new THREE.BoxGeometry(0.06, 1.15, 0.7), dark, [-2.0, 0.2, 6.9]);
  add(new THREE.BoxGeometry(1.7, 0.5, 1.9), win, [0, 0.78, 16.55]);
  add(new THREE.PlaneGeometry(7.4, 0.85), decal, [2.03, -0.58, 1.6], null, [0, Math.PI / 2, 0]);
  add(new THREE.PlaneGeometry(7.4, 0.85), decal, [-2.03, -0.58, 1.6], null, [0, -Math.PI / 2, 0]);

  // Engines & Jet Exhaust
  for (const sx of [-1, 1]) {
    const eng = new THREE.CylinderGeometry(0.78, 0.92, 3.9, 16);
    eng.rotateX(Math.PI / 2);
    add(eng, grey, [sx * 6.2, -1.55, 0.35]);
    add(new THREE.CylinderGeometry(0.58, 0.58, 0.1, 16).rotateX(Math.PI / 2), intake, [sx * 6.2, -1.55, 2.28]);
    add(new THREE.CircleGeometry(0.56, 16), fan, [sx * 6.2, -1.55, 2.24], null, [0, 0, 0]);
    add(new THREE.TorusGeometry(0.84, 0.09, 8, 20), dark, [sx * 6.2, -1.55, 2.25]);
    add(new THREE.CylinderGeometry(0.62, 0.7, 0.45, 12).rotateX(Math.PI / 2), dark, [sx * 6.2, -1.55, -1.7]);
    add(new THREE.BoxGeometry(0.32, 1.25, 0.9), grey, [sx * 6.2, -0.78, 0.2]);

    // Translucent jet thrust cone behind engine
    const thrust = new THREE.ConeGeometry(0.55, 3.2, 12);
    thrust.rotateX(-Math.PI / 2);
    add(thrust, M.thrustGlow, [sx * 6.2, -1.55, -3.6]);
  }

  // --- Regulated Aviation Navigation, Strobe & Beacon Lights ---
  // Port / Left Wingtip: Red Nav + White Strobe
  add(new THREE.SphereGeometry(0.14, 8, 8), M.navRed, [-16.7, 0.55, -4.6]);
  add(new THREE.SphereGeometry(0.16, 8, 8), M.strobeWhite, [-16.7, 0.75, -4.6]);

  // Starboard / Right Wingtip: Green Nav + White Strobe
  add(new THREE.SphereGeometry(0.14, 8, 8), M.navGreen, [16.7, 0.55, -4.6]);
  add(new THREE.SphereGeometry(0.16, 8, 8), M.strobeWhite, [16.7, 0.75, -4.6]);

  // Tailcone white strobe
  add(new THREE.SphereGeometry(0.16, 8, 8), M.strobeWhite, [0, 0.25, -20.65]);

  // Anti-collision Red Beacons (Fuselage Top & Belly)
  add(new THREE.SphereGeometry(0.18, 8, 8), M.beaconRed, [0, 2.08, 1.8]);
  add(new THREE.SphereGeometry(0.18, 8, 8), M.beaconRed, [0, -2.08, 1.8]);

  const wheel = new THREE.CylinderGeometry(0.36, 0.36, 0.16, 14);
  wheel.rotateZ(Math.PI / 2);
  add(new THREE.BoxGeometry(0.14, 1.55, 0.14), dark, [0, -2.45, 9.2]);
  add(wheel, rubber, [-0.55, -3.28, 9.2]);
  add(wheel, rubber, [0.55, -3.28, 9.2]);
  add(new THREE.BoxGeometry(0.12, 1.35, 0.12), dark, [-1.15, -2.3, -5.4]);
  add(new THREE.BoxGeometry(0.12, 1.35, 0.12), dark, [1.15, -2.3, -5.4]);
  add(wheel, rubber, [-1.55, -3.05, -5.4]);
  add(wheel, rubber, [-0.75, -3.05, -5.4]);
  add(wheel, rubber, [0.75, -3.05, -5.4]);
  add(wheel, rubber, [1.55, -3.05, -5.4]);
  root.userData.length = 38;
  return root;
}

const planes = [];
function placePlane(livery, x, y, z, yaw, name) {
  const p = buildAirliner(livery, name);
  p.position.set(x, y, z);
  p.rotation.y = yaw;
  airside.add(p);
  planes.push(p);
  return p;
}
const parked = placePlane(0x1a4a8a, 8, 3.55, 64, Math.PI - 0.22, 'PACIFIC');
placePlane(0x0a6a4a, -8, 3.55, 64, Math.PI + 0.22, 'AERO NORD');
placePlane(0x8a2030, -30, 3.55, 88, Math.PI * 0.78, 'REDWOOD');
const takingOff = placePlane(0xc8102e, 41, 3.55, 40, 0, 'CRIMSON');
const landing = placePlane(0x0a6a4a, 41, 28, 190, Math.PI, 'AERO NORD');

{
  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(780, 48),
    new THREE.MeshStandardMaterial({ color: 0x6a7a52, roughness: 0.98 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.22;
  ground.receiveShadow = true;
  scenery.add(ground);

  const water = new THREE.Mesh(
    new THREE.CircleGeometry(260, 32),
    M.water,
  );
  water.rotation.x = -Math.PI / 2;
  water.position.set(210, -0.16, 160);
  scenery.add(water);

  const hillGeo = new THREE.SphereGeometry(1, 10, 8);
  for (const [x, z, sx, sy, sz] of [
    [-340, 420, 120, 18, 70], [-260, 510, 90, 14, 55], [40, 560, 140, 16, 60],
    [220, 500, 100, 13, 50], [-80, 580, 110, 15, 55], [160, 620, 80, 12, 40],
  ]) {
    const h = new THREE.Mesh(hillGeo, M.hill);
    h.position.set(x, sy * 0.15, z);
    h.scale.set(sx, sy, sz);
    scenery.add(h);
  }

  const towerMat = [M.tower, M.towerDark];
  // Keep the extended runway (x ≈ 20..70) empty so arrivals/departures
  // never fly through, or stack on, the skyline.
  const downtown = [
    [-160, 520, 18, 58, 16], [-120, 545, 14, 76, 14], [-88, 530, 16, 48, 18],
    [-200, 555, 12, 64, 12], [130, 535, 20, 42, 16], [168, 550, 15, 70, 14],
    [210, 525, 18, 36, 16], [250, 560, 14, 62, 13], [-240, 540, 11, 50, 11],
    [300, 548, 13, 44, 12],
  ];
  for (const [x, z, w, h, d] of downtown) {
    const shaft = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), towerMat[(Math.abs(x) >> 3) % 2]);
    shaft.position.set(x, h / 2, z);
    scenery.add(shaft);
    const cap = new THREE.Mesh(new THREE.BoxGeometry(w * 0.7, 2.4, d * 0.7), M.steelDark);
    cap.position.set(x, h + 0.8, z);
    scenery.add(cap);
    const pane = new THREE.Mesh(new THREE.BoxGeometry(w * 0.92, h * 0.72, 0.2), M.towerGlass);
    pane.position.set(x, h * 0.52, z - d / 2 - 0.05);
    scenery.add(pane);
  }

  const cloudFiles = [
    './textures/CP_Cloud_01.webp',
    './textures/CP_Cloud_02.webp',
    './textures/CP_Cloud_03.webp',
  ];
  const cloudSlots = [
    [-220, 110, 40, 160, 50], [80, 95, -80, 180, 55], [260, 120, 90, 200, 60],
    [-80, 140, 220, 170, 48], [180, 105, 260, 190, 52], [-300, 90, 160, 150, 44],
    [40, 160, 340, 220, 58], [-160, 125, -140, 170, 46],
  ];
  cloudFiles.forEach((url, i) => {
    const t = loader.load(url);
    t.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.MeshBasicMaterial({
      map: t, alphaMap: t, transparent: true, depthWrite: false,
      opacity: 0.82, fog: true, color: 0xffffff,
    });
    for (let k = 0; k < 3; k++) {
      const slot = cloudSlots[(i * 3 + k) % cloudSlots.length];
      const m = new THREE.Mesh(new THREE.PlaneGeometry(slot[3], slot[4]), mat);
      m.position.set(slot[0] + k * 30, slot[1] + k * 8, slot[2] - k * 20);
      m.lookAt(0, 40, 20);
      scenery.add(m);
    }
  });
}

function tickAirportLights(t, dt) {
  // Strobe: dual-pulse flash every 1.25s
  const sPhase = t % 1.25;
  const isStrobe = (sPhase < 0.05 || (sPhase > 0.12 && sPhase < 0.17));
  M.strobeWhite.emissiveIntensity = isStrobe ? 4.5 : 0.0;

  // Anti-collision Red Beacon: pulsing sine wave
  const beaconVal = Math.pow(Math.max(0, Math.sin(t * Math.PI * 1.5)), 4);
  M.beaconRed.emissiveIntensity = beaconVal * 3.5;

  // Control tower radar antenna rotation
  if (towerRadar) {
    towerRadar.rotation.y += dt * 1.6;
  }
}

function tickPlanes(t) {
  // One runway, one occupant.
  const RW = 41;
  const p = (t % 36) / 36;

  if (p < 0.46) {
    const u = p / 0.46;
    takingOff.visible = true;
    landing.visible = false;
    landing.position.set(RW, 80, 700);

    // Thrust glow during takeoff roll and climb
    M.thrustGlow.emissiveIntensity = 3.2;
    M.thrustGlow.opacity = 0.72;

    if (u < 0.36) {
      takingOff.position.set(RW, 3.55, 28 + (u / 0.36) * 95);
      takingOff.rotation.set(0, 0, 0);
    } else {
      const c = (u - 0.36) / 0.64;
      takingOff.position.set(RW, 3.55 + c * 85, 123 + c * 170);
      takingOff.rotation.set(-0.16 - c * 0.1, 0, 0);
    }
    return;
  }

  // Idle engine thrust on landing/rollout
  M.thrustGlow.emissiveIntensity = 0.0;
  M.thrustGlow.opacity = 0.0;

  takingOff.visible = false;
  takingOff.position.set(RW, 3.55, -80);
  landing.visible = true;
  const u = (p - 0.46) / 0.54;
  if (u < 0.64) {
    const c = u / 0.64;
    landing.position.set(RW, 58 - c * 54.45, 320 - c * 240);
    landing.rotation.set(0.1 * (1 - c), Math.PI, 0);
  } else {
    const c = (u - 0.64) / 0.36;
    landing.position.set(RW, 3.55, 80 - c * 48);
    landing.rotation.set(0, Math.PI, 0);
  }
}

// ---------------------------------------------------------------------------
// Character materials (California girl, same as the villa)
// ---------------------------------------------------------------------------
const CHAR_MATS = await fetch('./chars/data/materials.json').then(r => r.json());
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
  const n = name.toLowerCase();
  if (n.includes('tshirt')) { m.map = null; m.color.set('#fdfdf7'); }
  else if (n.includes('pants')) { m.map = null; m.color.set('#ffd43b'); }
  else if (n.includes('hat')) { m.map = null; m.color.set('#fff4b0'); }
  else if (n.includes('shoes')) { m.map = null; m.color.set('#fffef8'); }
  else if (n.includes('backpack')) { m.map = null; m.color.set('#ffe27a'); }
  m.needsUpdate = true;
  return m;
}

// ---------------------------------------------------------------------------
// Travel car at the curb
// ---------------------------------------------------------------------------
const AIR_TRAVEL_CAR = Object.freeze({
  type: 'suv', x: -10, z: -44.5, yaw: Math.PI / 2, ground: 0.12,
});
const airTravelCar = buildCar(AIR_TRAVEL_CAR.type, 0xb8bec6, { metallic: false });
airTravelCar.position.set(AIR_TRAVEL_CAR.x, AIR_TRAVEL_CAR.ground, AIR_TRAVEL_CAR.z);
airTravelCar.rotation.y = AIR_TRAVEL_CAR.yaw;
airTravelCar.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
world.add(airTravelCar);
const airTravelBounds = carBounds(AIR_TRAVEL_CAR.type);
const airTravelInteraction = {
  type: 'travel',
  label: 'Voyager à la villa L.A.',
  x: AIR_TRAVEL_CAR.x, y: AIR_TRAVEL_CAR.ground, z: AIR_TRAVEL_CAR.z,
  centerX: AIR_TRAVEL_CAR.x, centerZ: AIR_TRAVEL_CAR.z,
  approachY: AIR_TRAVEL_CAR.ground + 0.5,
  yaw: AIR_TRAVEL_CAR.yaw,
  halfWidth: airTravelBounds.length / 2,
  halfDepth: airTravelBounds.width / 2,
  triggerDistance: 1.25,
  occupied: false,
};

// ---------------------------------------------------------------------------
// Collision / controller
// ---------------------------------------------------------------------------
const bw = buildCityBoxes(world);
let player = null;
function groundFn(x, z, yFrom, feetY) {
  if (z > 38.2) return 0.0;    // apron
  if (z > 2) return 0.05;      // concourse (carpet / pavers)
  if (z > -32) return 0.04;    // hall + security
  if (z > -40) return 0.08;    // sidewalk
  return 0.02;                 // road
}
const rays = { ray: new THREE.Raycaster(), tmp: new THREE.Vector3() };
function castFn(origin, dir, far) {
  rays.ray.set(origin, dir);
  rays.ray.far = far;
  const hit = rays.ray.intersectObjects(world.children, true)[0];
  if (!hit) return null;
  return { point: hit.point, normal: hit.face?.normal ?? new THREE.Vector3(0, 1, 0), distance: hit.distance };
}
const ctrl = new Controller(bw, groundFn, castFn, {
  onReset: () => ctrl.rescueTo(spawnPoint),
  onLand: impact => { if (player) player.onLand(impact); },
});

const params = new URLSearchParams(location.search);
const arrivedFromLA = params.get('arrival') === 'la';
const spawnPoint = arrivedFromLA
  ? new THREE.Vector3(AIR_TRAVEL_CAR.x + 1.8, 1.4, AIR_TRAVEL_CAR.z + 0.6)
  : new THREE.Vector3(0, 1.4, -35.5);
ctrl.rescueTo(spawnPoint);

const rig = new CameraRig(camera, bw);
const input = new Input(renderer.domElement);
function requestGamePointerLock() {
  try { renderer.domElement.requestPointerLock?.()?.catch?.(() => {}); } catch (_) {}
}
input.yaw = Math.PI;

player = new Player(scene);
await player.load('girl', girlMatFor);
player.addWardrobePart('hairCrown', harmoniseHair(player, {
  scalp: await charImage(CHAR_MATS.MAT_SurvGirl_Head.tex),
  strands: await charImage(CHAR_MATS.MAT_SurvGirl_Hair.tex),
  strandsAO: await charImage(CHAR_MATS.MAT_SurvGirl_Hair.aoTex),
}));

// ---------------------------------------------------------------------------
// Travelers — guest rigs only
// ---------------------------------------------------------------------------
const rngCrowd = (() => {
  let s = 7;
  return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
})();
const walkers = [];
const statics = [];

function pathLen(pts) {
  let n = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    n += Math.hypot(b[0] - a[0], b[1] - a[1]);
  }
  return n;
}
function atPath(pts, d) {
  const closed = pts.closed !== false;
  const last = closed ? pts.length : pts.length - 1;
  let left = d;
  for (let i = 0; i < last; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    const seg = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1e-4;
    if (left <= seg) {
      const t = left / seg;
      return {
        x: a[0] + (b[0] - a[0]) * t,
        z: a[1] + (b[1] - a[1]) * t,
        yaw: Math.atan2(b[0] - a[0], b[1] - a[1]),
      };
    }
    left -= seg;
  }
  const a = pts[pts.length - 2], b = pts[pts.length - 1];
  return { x: b[0], z: b[1], yaw: Math.atan2(b[0] - a[0], b[1] - a[1]) };
}

// Loops sized to the new plan: nothing crosses a wall, everything keeps clear
// of the queue posts, columns, seats and counters.
const CURB_PATH = [[-14, -37.6], [14, -37.6], [14, -34.4], [-14, -34.4]];
const HALL_LOOP = [[-18, -28.6], [18, -28.6], [18, -11], [-18, -11]];
const HALL_AISLE = [[-1.4, -29], [1.4, -29], [1.4, -10], [-1.4, -10]];
const SEC_QUEUE = [[-9.5, -6.3], [-1.5, -6.3], [-1.5, -4.9], [-9.5, -4.9]];
const WALKWAY = [[-7, 4.5], [7, 4.5], [7, 18.5], [-7, 18.5]];
const LOUNGE_LOOP = [[-15, 19.6], [15, 19.6], [15, 22.6], [-15, 22.6]];
const GATE_PATH = [[-16, 33.2], [16, 33.2], [16, 34.4], [-16, 34.4]];

{
  const guests = [];
  try {
    guests.push(await loadGuestRig({
      model: './glb/visitors/woman.glb?v=1',
      walk: './glb/visitors/walk.glb?v=1',
      idle: './glb/visitors/idle.glb?v=1',
      height: 1.68,
      recolor: 'atlas',
    }));
  } catch (e) { console.warn('[airport] woman rig', e); }
  try {
    guests.push(await loadGuestRig({
      model: './glb/visitors/man.glb?v=1',
      walk: './glb/visitors/walk_m.glb?v=1',
      idle: './glb/visitors/idle_m.glb?v=1',
      height: 1.8,
      recolor: 'atlas-dark',
    }));
  } catch (e) { console.warn('[airport] man rig', e); }

  const routes = [
    [CURB_PATH, 2, 1], [CURB_PATH, 26, -1],
    [HALL_LOOP, 0, 1], [HALL_LOOP, 30, -1], [HALL_LOOP, 58, 1],
    [HALL_AISLE, 3, 1], [HALL_AISLE, 20, -1],
    [SEC_QUEUE, 2, 1],
    [WALKWAY, 4, 1], [WALKWAY, 20, -1], [WALKWAY, 36, 1],
    [LOUNGE_LOOP, 5, 1], [LOUNGE_LOOP, 30, -1], [LOUNGE_LOOP, 50, 1],
    [GATE_PATH, 2, 1], [GATE_PATH, 30, -1],
  ];
  routes.forEach(([path, at, dir], i) => {
    if (!guests.length) return;
    const g = guests[i % guests.length];
    const v = makeVisitor(g.scene, g.walkClip, rngCrowd, { guest: g, idleClip: g.idleClip });
    crowd.add(v.group);
    v.mixer.update(0);
    walkers.push({ ...v, path, s: at, dir, len: pathLen(path) });
  });

  // Placed people. `staff: true` puts them in the white uniform top so the
  // check-in agents, screeners, barista, shopkeeper and gate agents read as
  // staff at a glance.
  const stands = [
    // check-in agents, standing in the belt gaps behind each desk
    { x: -12.2, z: -22.4, ry: Math.PI, staff: true },
    { x: 12.2, z: -22.4, ry: Math.PI, staff: true },
    { x: -9.8, z: -15.4, ry: Math.PI, staff: true },
    { x: 9.8, z: -15.4, ry: Math.PI, staff: true },
    // passengers queuing at the desks
    { x: -11, z: -25.4, ry: 0 }, { x: -9.6, z: -25.9, ry: 0.3 },
    { x: 11, z: -25.4, ry: 0 }, { x: 12.4, z: -25.9, ry: -0.2 },
    { x: -11, z: -18.6, ry: 0 }, { x: 11, z: -18.6, ry: 0 },
    // reading the departures board
    { x: 7, z: -10.6, ry: 0 }, { x: 10.4, z: -11.0, ry: 0.2 },
    // security officers
    { x: -0.5, z: 0.6, ry: Math.PI, staff: true },
    { x: 9.6, z: -5.4, ry: Math.PI, staff: true },
    // café: barista behind the counter, customers at it
    { x: -22.5, z: 9, ry: Math.PI / 2, staff: true },
    { x: -20.2, z: 7.2, ry: -Math.PI / 2 }, { x: -20.2, z: 10.8, ry: -Math.PI / 2 },
    // shop: clerk at the till, browsers in the aisles
    { x: 13.4, z: 2.7, ry: 0, staff: true },
    { x: 16.4, z: 8.6, ry: Math.PI / 2 }, { x: 20.7, z: 11.6, ry: -Math.PI / 2 },
    // gate agents behind their desks
    { x: -14, z: 37.1, ry: Math.PI, staff: true },
    { x: 0, z: 37.1, ry: Math.PI, staff: true },
    // watching the planes at the glass
    { x: -4.5, z: 36.8, ry: 0 }, { x: 5.2, z: 36.7, ry: 0 }, { x: 10.6, z: 36.8, ry: 0.15 },
    // at the curb
    { x: 6, z: -34.6, ry: Math.PI }, { x: -13, z: -35.2, ry: 0.4 },
  ];
  stands.forEach(({ x, z, ry, staff }, i) => {
    if (!guests.length) return;
    const g = guests[i % guests.length];
    const v = makeVisitor(g.scene, g.walkClip, rngCrowd, {
      guest: g, idleClip: g.idleClip, still: true,
      uniform: staff ? STAFF_UNIFORM : null,
    });
    v.group.position.set(x, F, z);
    v.group.rotation.y = ry;
    crowd.add(v.group);
    statics.push(v);
  });
}

// ---------------------------------------------------------------------------
// Interaction
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
  choosingFurniturePrompt = show;
  if (show) {
    if (document.pointerLockElement === renderer.domElement) document.exitPointerLock?.();
  } else if (started && !paused) {
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
  if (spot.occupied !== 'visitor') spot.occupied = 'player';
  activeFurnitureInteraction = { ...spot, source: spot, returnPosition: ctrl.pos.clone(), readyToExit: false };
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
  for (const spot of [airTravelInteraction, ...furnitureInteractions]) {
    if (spot === releasedSpot || spot.occupied) continue;
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
      location.href = 'index.html?map=la&arrival=airport';
      return true;
    }
    enterFurnitureInteraction(nearest);
  }
  return activeFurnitureInteraction !== null;
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

function tickCrowd(dt) {
  for (const w of walkers) {
    w.s += w.speed * w.dir * dt;
    const len = w.len || 1;
    if (w.s > len) w.s -= len;
    if (w.s < 0) w.s += len;
    const at = atPath(w.path, w.s);
    w.group.position.set(at.x, F, at.z);
    w.group.rotation.y = at.yaw + (w.dir < 0 ? Math.PI : 0);
    w.mixer.update(dt);
  }
  for (const v of statics) v.mixer.update(dt);
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
    forward.set(-Math.sin(input.yaw) * cp, Math.sin(input.pitch), -Math.cos(input.yaw) * cp).normalize();
    const locked = updateFurnitureInteraction(dt);
    if (!locked) {
      ctrl.update(dt, input, input.yaw, forward);
      updateFurnitureInteraction(0);
    }
    if (ctrl.pos.y < -60) ctrl.rescueTo(spawnPoint);
  }
  tickPlanes(t);
  tickAirportLights(t, dt);
  tickCrowd(dt);
  updateAvatar(dt);
  rig.update(dt, input, ctrl);
  updateHud();
  composer.render();
  input.endFrame();
}
animate();

function resumePlay() {
  overlay.style.display = 'none';
  paused = false;
  requestGamePointerLock();
}
function startAirport() {
  if (started) { resumePlay(); return; }
  setFurniturePrompt(null);
  started = true;
  resumePlay();
}
startBtn.addEventListener('click', startAirport);
if (arrivedFromLA) startAirport();

document.addEventListener('pointerlockchange', () => {
  usedLock = usedLock || document.pointerLockElement !== null;
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
  composer.setSize(window.innerWidth, window.innerHeight);
});

window.__airport = {
  THREE, scene, camera, renderer, composer, world, crowd, ctrl, rig, input, player, spawnPoint,
  furnitureInteractions, planes, walkers, statics, towerRadar,
  get activeFurnitureInteraction() { return activeFurnitureInteraction; },
};
window.__villa = window.__airport;
