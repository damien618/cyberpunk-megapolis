import * as THREE from 'three';
import { Player } from './player.js?v=49';
import { harmoniseHair } from './hair.js?v=8';
import { Input } from './input.js';
import { Controller } from './controller.js?v=6';
import { CameraRig } from './cameraRig.js?v=6';
import { buildCityBoxes } from './cityBoxes.js?v=5';
import { buildCar, carBounds } from './cars.js?v=4';
import { makeVisitor, loadVisitorBase, loadGuestRig, STAFF_UNIFORM } from './crowd.js?v=19';

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
const planePromptGroup = document.getElementById('planePromptGroup');
const planeDestLaPrompt = document.getElementById('planeDestLaPrompt');
const planeDestShintoPrompt = document.getElementById('planeDestShintoPrompt');
const fadeEl = document.getElementById('fade');

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

// Sky fill. Pulled down from 0.82: with the hall now taking real sun through
// its roof glazing, a strong ambient term is what flattens the result — the
// contrast between a lit patch of terrazzo and the shade beside it is the
// whole effect, and hemisphere light erases exactly that.
// The ground half is close to neutral now: hemisphere light hands its ground
// colour to every downward-facing surface, so a warm brown one tanned every
// ceiling and fascia soffit in the terminal.
const hemi = new THREE.HemisphereLight(0xdceaff, 0x8d8c88, 0.66);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff2dc, 2.6);
sun.position.set(-80, 140, 40);
sun.castShadow = true;
// The roof glazing turns this map into an interior light source, so its
// resolution now sets the quality of the patches on the hall floor rather than
// just the softness of an outdoor shadow. 3072 over the 185 m frustum is about
// 6 cm a texel, roughly a third of what it was.
sun.shadow.mapSize.set(3072, 3072);
sun.shadow.camera.left = -110;
sun.shadow.camera.right = 110;
sun.shadow.camera.top = 110;
sun.shadow.camera.bottom = -75;
sun.shadow.camera.near = 20;
sun.shadow.camera.far = 380;
sun.shadow.bias = -0.00035;
sun.shadow.normalBias = 0.028;
scene.add(sun);
sun.target.position.set(0, 0, 20);
scene.add(sun.target);
// Bounce. A single dim upward-facing light standing in for the light the
// terrazzo throws back at the ceiling and the undersides of the fascias;
// without it every soffit in the terminal is pure black.
const bounce = new THREE.DirectionalLight(0xffeedd, 0.42);
bounce.position.set(20, -40, -10);
bounce.target.position.set(0, 12, -20);
scene.add(bounce, bounce.target);

const loader = new THREE.TextureLoader();
const maxAniso = renderer.capabilities.getMaxAnisotropy();
const pmrem = new THREE.PMREMGenerator(renderer);
pmrem.compileEquirectangularShader();
loader.load('./data/env_equirect.png', t => {
  t.mapping = THREE.EquirectangularReflectionMapping;
  t.colorSpace = THREE.SRGBColorSpace;
  scene.environment = pmrem.fromEquirectangular(t).texture;
  scene.environmentIntensity = 0.68;
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
// Three declares one UV varying per map, each behind its own #ifdef, so this
// block is inert for whichever maps a given material does not carry.
const UV_ASSIGN = `
        #ifdef USE_MAP
          vMapUv = gUV;
        #endif
        #ifdef USE_NORMALMAP
          vNormalMapUv = gUV;
        #endif
        #ifdef USE_ROUGHNESSMAP
          vRoughnessMapUv = gUV;
        #endif
        #ifdef USE_METALNESSMAP
          vMetalnessMapUv = gUV;
        #endif`;

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
${UV_ASSIGN}
      }`,
    );
  };
  mat.customProgramCacheKey = () => 'wxz-air-' + metersPerTile;
  return mat;
}

// World-space triplanar UVs, for anything vertical. Every wall in the shell is
// one stretched box — the west wall is a single 24 m slab — so the box's own
// 0..1 UV smeared one stucco tile over six metres and the plaster read as grey
// mush from any distance. Picking the projection plane from the world normal
// instead keeps floor, wall and soffit all at the same real tile size, and
// costs one mat3 multiply in the vertex shader.
function worldTriUv(mat, metersPerTile = 2.4) {
  const s = 1 / metersPerTile;
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace(
      '#include <worldpos_vertex>',
      `#include <worldpos_vertex>
      { vec4 twp = vec4(transformed, 1.0);
        vec3 twn = objectNormal;
        #ifdef USE_INSTANCING
          twp = instanceMatrix * twp;
          twn = mat3(instanceMatrix) * twn;
        #endif
        twp = modelMatrix * twp;
        twn = normalize(mat3(modelMatrix) * twn);
        vec3 tax = abs(twn);
        vec2 gUV = (tax.y >= tax.x && tax.y >= tax.z) ? twp.xz
                 : (tax.x >= tax.z)                   ? vec2(twp.z, -twp.y)
                 :                                      vec2(twp.x, -twp.y);
        gUV *= ${s.toFixed(4)};
${UV_ASSIGN}
      }`,
    );
  };
  mat.customProgramCacheKey = () => 'wtri-air-' + metersPerTile;
  return mat;
}

// The texture pack ships Unity-style MS maps: metallic in RGB, smoothness in
// alpha. three.js wants roughness in .g and metalness in .b of a single map,
// so the channels get rebuilt once on a canvas as soon as the image decodes.
// This is the difference between a floor carrying one flat roughness number
// and one where the grout is matte while the tile itself catches the lights.
function msPack(url) {
  const c = Object.assign(document.createElement('canvas'), { width: 4, height: 4 });
  {
    // Stand-in until the decode lands: mid-rough, non-metal. Without it the
    // blank canvas reads as roughness 0 and every surface is a mirror for a
    // few frames.
    const ctx = c.getContext('2d');
    ctx.fillStyle = 'rgb(255,205,0)';
    ctx.fillRect(0, 0, 4, 4);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.NoColorSpace;
  t.anisotropy = maxAniso;
  const img = new Image();
  img.onload = () => {
    const w = img.naturalWidth, h = img.naturalHeight;
    c.width = w; c.height = h;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(0, 0, w, h);
    const p = d.data;
    for (let i = 0; i < p.length; i += 4) {
      const metal = p[i];
      const smooth = p[i + 3];
      p[i] = 255;
      p[i + 1] = 255 - smooth;   // roughness → .g
      p[i + 2] = metal;          // metalness → .b
      p[i + 3] = 255;
    }
    ctx.putImageData(d, 0, 0);
    t.needsUpdate = true;
  };
  img.onerror = () => console.warn('[airport] MS map missing', url);
  img.src = url;
  return t;
}
// Roughness only. The pack's metallic channel is near-zero even on the metal
// panels — they were authored to read as metal off the albedo — so taking
// metalness from the map would flatten every steel surface in the terminal.
function pbrRough(mat, msUrl, roughScale = 1.0) {
  mat.roughnessMap = msPack(msUrl);
  mat.roughness = roughScale;
  return mat;
}

// Terrazzo. Poured terrazzo is a dense aggregate of small chips, not the
// sparse confetti a first pass tends to produce: the chips have to be small
// and numerous enough that the floor reads as one stone tone at walking
// distance and only resolves into aggregate underfoot. Brass divider strips on
// a 1.2 m bay — the joints a real poured floor needs to control cracking —
// give the eye something to measure the hall's width against.
function makeTerrazzo() {
  const size = 1024;
  const c = Object.assign(document.createElement('canvas'), { width: size, height: size });
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#d6d0c6';
  ctx.fillRect(0, 0, size, size);
  // Large-scale mottling: pours never cure to one flat tone.
  for (let i = 0; i < 90; i++) {
    const g = ctx.createRadialGradient(
      Math.random() * size, Math.random() * size, 0,
      Math.random() * size, Math.random() * size, 90 + Math.random() * 160,
    );
    g.addColorStop(0, Math.random() < 0.5 ? 'rgba(255,252,246,0.16)' : 'rgba(120,112,102,0.13)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  }
  const chips = ['#bdb2a3', '#f0eae0', '#9c9286', '#6b6660', '#e2c6b1', '#aebdc6', '#8b7c6d', '#cfc6b6'];
  for (let i = 0; i < 9000; i++) {
    ctx.fillStyle = chips[(Math.random() * chips.length) | 0];
    ctx.globalAlpha = 0.3 + Math.random() * 0.45;
    const x = Math.random() * size, y = Math.random() * size;
    const r = 1.4 + Math.random() * 4.6;
    ctx.beginPath();
    ctx.ellipse(x, y, r, r * (0.45 + Math.random() * 0.5), Math.random() * 6, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  // Brass divider strips on the bay grid, with their own polished highlight.
  for (const p of [0, size / 2]) {
    ctx.fillStyle = '#9d8a5c';
    ctx.fillRect(p, 0, 3, size);
    ctx.fillRect(0, p, size, 3);
    ctx.fillStyle = 'rgba(255,240,200,0.5)';
    ctx.fillRect(p, 0, 1, size);
    ctx.fillRect(0, p, size, 1);
  }
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
  // Fit the string to the board rather than trusting one hard-coded size: a
  // long bilingual title at 78px runs off the canvas, and the sign then hangs
  // in the hall reading "ECK-IN · ENREGISTREME".
  const fitted = (text, px, weight, max) => {
    let size = px;
    do {
      ctx.font = `${weight} ${size}px sans-serif`;
      if (ctx.measureText(text).width <= max) break;
      size -= 2;
    } while (size > 12);
    return size;
  };
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 1024, 256);
  ctx.fillStyle = '#8ec8e0';
  ctx.fillRect(0, 0, 16, 256);
  ctx.fillStyle = fg;
  fitted(title, 78, 'bold', 940);
  ctx.textAlign = 'center';
  ctx.fillText(title, 520, sub ? 110 : 155);
  if (sub) {
    fitted(sub, 36, '', 940);
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

// ---------------------------------------------------------------------------
// Check-in signage. The fascia over a check-in row is what makes the row read
// as check-in and not as a bar: a continuous lit band carrying a desk number
// per position, the class of service, and the flight currently being worked.
// Drawing the whole run as one long strip keeps the bank to a single draw call
// instead of one per desk.
// ---------------------------------------------------------------------------
// `reverse` draws the panels right-to-left. A box maps its +X and -X faces
// with opposite U directions, so the two banks — one seen on each face — would
// otherwise number in opposite directions along the hall: 01 at the north end
// of the west wall but 08 at the south end of the east one.
function makeCheckinFascia(first, count, airline, accent, reverse = false) {
  const cw = 256;
  const c = Object.assign(document.createElement('canvas'), { width: cw * count, height: 192 });
  const ctx = c.getContext('2d');
  const flights = [
    ['AA 214', 'NEW YORK JFK'], ['BA 268', 'LONDON LHR'], ['AF  72', 'PARIS CDG'],
    ['JL  61', 'TOKYO HND'], ['LH 457', 'FRANKFURT'], ['QF  12', 'SYDNEY'],
    ['EK 216', 'DUBAI'], ['UA 441', 'CHICAGO ORD'],
  ];
  const classes = ['ECONOMY', 'ECONOMY', 'BAG DROP', 'PRIORITY', 'ECONOMY', 'BAG DROP', 'ECONOMY'];
  for (let i = 0; i < count; i++) {
    const x = (reverse ? count - 1 - i : i) * cw;
    ctx.fillStyle = '#0d1626';
    ctx.fillRect(x, 0, cw, 192);
    ctx.fillStyle = '#050a12';
    ctx.fillRect(x + cw - 4, 0, 4, 192);        // panel joint
    ctx.fillStyle = accent;
    ctx.fillRect(x, 0, cw - 4, 6);              // lit top reveal
    const no = String(first + i).padStart(2, '0');
    ctx.textAlign = 'left';
    ctx.fillStyle = '#f4f9fd';
    ctx.font = 'bold 92px sans-serif';
    ctx.fillText(no, x + 18, 108);
    ctx.fillStyle = accent;
    ctx.font = 'bold 26px sans-serif';
    ctx.fillText(classes[i % classes.length], x + 20, 148);
    const f = flights[i % flights.length];
    ctx.textAlign = 'right';
    ctx.fillStyle = '#9fd4e8';
    ctx.font = 'bold 34px monospace';
    ctx.fillText(f[0], x + cw - 22, 66);
    ctx.fillStyle = '#c8d8e4';
    ctx.font = '25px sans-serif';
    ctx.fillText(f[1], x + cw - 22, 102);
    ctx.fillStyle = '#5ec98a';
    ctx.font = 'bold 22px sans-serif';
    ctx.fillText(i % 4 === 3 ? 'CLOSING' : 'OPEN', x + cw - 22, 146);
    ctx.fillStyle = 'rgba(255,255,255,0.30)';
    ctx.font = 'bold 17px sans-serif';
    ctx.fillText(airline, x + cw - 22, 176);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = maxAniso;
  t.needsUpdate = true;
  return new THREE.MeshStandardMaterial({
    map: t, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: 0.85, roughness: 0.4,
  });
}

// The back wall of a check-in row is never bare plaster — it is a panelled
// system wall. The pattern has to be uniform in both axes, because it is
// mapped by world position: anything with a distinct band or a wordmark in it
// tiles into a stripe of repeated text across twenty metres of wall. Branding
// goes on discrete plates, one per desk, further down.
function makeCheckinBackWall() {
  return canvasTex(512, 512, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#eceef1');
    g.addColorStop(1, '#dee2e7');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    // Faint brushed grain, then the joints of a 1 m panel module.
    ctx.globalAlpha = 0.05;
    for (let i = 0; i < 900; i++) {
      ctx.fillStyle = i % 2 ? '#ffffff' : '#8d949c';
      ctx.fillRect(0, Math.random() * h, w, 1);
    }
    ctx.globalAlpha = 1;
    for (const p of [0, w / 2]) {
      ctx.fillStyle = 'rgba(112,122,134,0.5)';
      ctx.fillRect(p, 0, 3, h);
      ctx.fillRect(0, p, w, 3);
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.fillRect(p + 3, 0, 2, h);
      ctx.fillRect(0, p + 3, w, 2);
    }
  }, { wrap: true });
}
// One branding plate per desk, so the airline reads once a position instead of
// once every two metres.
function makeDeskPlate() {
  return canvasTex(512, 128, (ctx, w, h) => {
    ctx.fillStyle = '#12243a';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#8ec8e0';
    ctx.fillRect(0, 0, w, 5);
    ctx.fillStyle = '#eaf4fa';
    ctx.font = 'bold 46px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('PACIFIC GATE', w / 2, 66);
    ctx.fillStyle = '#7fb6cc';
    ctx.font = '24px sans-serif';
    ctx.fillText('CHECK-IN  ·  ENREGISTREMENT', w / 2, 102);
  });
}

// Vertical rubber flap strips over the belt hatch — the one detail that says
// "this hole swallows luggage" rather than "this hole is a hole".
function makeFlapTex() {
  return canvasTex(64, 256, (ctx, w, h) => {
    ctx.fillStyle = '#1a1c1e';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(255,255,255,0.07)';
    ctx.fillRect(2, 0, 3, h);
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(w - 6, 0, 6, h);
    ctx.fillStyle = '#c8a020';                          // hazard chevron near the lip
    for (let y = 8; y < 40; y += 14) ctx.fillRect(0, y, w, 6);
  }, { wrap: true });
}

// Self-service kiosk screen: the "scan your passport" step every hall has now.
function makeKioskScreen() {
  return canvasTex(512, 384, (ctx, w, h) => {
    ctx.fillStyle = '#0b1a2c';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#8ec8e0';
    ctx.fillRect(0, 0, w, 56);
    ctx.fillStyle = '#06121f';
    ctx.font = 'bold 30px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('SELF CHECK-IN', 20, 40);
    ctx.fillStyle = '#eaf4fa';
    ctx.font = 'bold 34px sans-serif';
    ctx.fillText('Scan your', 28, 122);
    ctx.fillText('passport', 28, 164);
    ctx.strokeStyle = '#8ec8e0';
    ctx.lineWidth = 4;
    ctx.strokeRect(28, 196, 200, 132);
    ctx.fillStyle = 'rgba(142,200,224,0.22)';
    ctx.fillRect(32, 200, 192, 124);
    ctx.fillStyle = '#5ec98a';
    ctx.fillRect(288, 214, 196, 56);
    ctx.fillStyle = '#052013';
    ctx.font = 'bold 28px sans-serif';
    ctx.fillText('CONTINUER', 300, 251);
    ctx.fillStyle = '#c8d8e4';
    ctx.font = '20px sans-serif';
    ctx.fillText('Bag tags printed here →', 288, 314);
  });
}

// Weighing-scale readout on the belt head.
function makeScaleReadout() {
  return canvasTex(256, 128, (ctx, w, h) => {
    ctx.fillStyle = '#0a0d10';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#6cf0a0';
    ctx.font = 'bold 62px monospace';
    ctx.textAlign = 'right';
    ctx.fillText('18.4', w - 54, 82);
    ctx.font = 'bold 26px monospace';
    ctx.fillText('kg', w - 12, 82);
    ctx.fillStyle = '#3a6a80';
    ctx.font = '18px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('MAX 23 kg', 14, 112);
  });
}

// Paper bag tag looped on a handle: white, printed, and the reason a checked
// bag looks checked.
function makeBagTagTex() {
  return canvasTex(64, 256, (ctx, w, h) => {
    ctx.fillStyle = '#f6f6f2';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#101010';
    for (let y = 12; y < 150; y += 5) ctx.fillRect(8, y, w - 16, Math.random() < 0.5 ? 2 : 3);
    ctx.fillStyle = '#c81828';
    ctx.fillRect(0, 158, w, 26);
    ctx.fillStyle = '#101010';
    ctx.font = 'bold 26px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('JFK', w / 2, 214);
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
function makeSafetyCardTex() {
  return canvasTex(256, 512, (ctx, w, h) => {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#c8102e';
    ctx.fillRect(0, 0, w, 56);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 20px sans-serif';
    ctx.fillText('PACIFIC A320', 16, 36);
    ctx.font = '11px sans-serif';
    ctx.fillText('SAFETY INFORMATION', 16, 49);
    
    // Safety pictograms
    ctx.fillStyle = '#1a3048';
    ctx.fillRect(14, 68, 108, 85);
    ctx.fillRect(134, 68, 108, 85);
    ctx.fillStyle = '#20a060';
    ctx.fillRect(14, 165, 228, 65);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 12px sans-serif';
    ctx.fillText('BRACE POSITION / SECURITE', 20, 202);
    
    ctx.fillStyle = '#e8edf4';
    ctx.fillRect(14, 240, 228, 110);
    ctx.fillStyle = '#d02020';
    ctx.fillRect(14, 360, 228, 135);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 13px sans-serif';
    ctx.fillText('LIFE VEST UNDER SEAT', 20, 425);
  });
}

function makeCabinCarpetTex() {
  return canvasTex(512, 512, (ctx, w, h) => {
    ctx.fillStyle = '#142036';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(70, 110, 160, 0.28)';
    ctx.lineWidth = 2;
    for (let x = -w; x < w * 2; x += 32) {
      ctx.beginPath();
      ctx.moveTo(x, 0); ctx.lineTo(x + h, h);
      ctx.moveTo(x, h); ctx.lineTo(x + h, 0);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(120, 160, 210, 0.15)';
    for (let i = 0; i < 400; i++) {
      ctx.fillRect((i * 137) % w, (i * 269) % h, 2, 2);
    }
  }, { wrap: true });
}

// Seat fabric. Flat dark navy read as black under the cabin's three point
// lights — a woven weft plus a sparse fleck gives the cushions something for
// the light to catch, so a row reads as upholstery rather than a solid block.
function makeSeatFabricTex() {
  return canvasTex(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#41608f';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(16, 26, 46, 0.55)';
    ctx.lineWidth = 1;
    for (let i = 0; i < w; i += 4) {
      ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, h); ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(120, 158, 210, 0.20)';
    for (let i = 2; i < h; i += 4) {
      ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(w, i); ctx.stroke();
    }
    ctx.fillStyle = 'rgba(150, 190, 240, 0.30)';
    for (let i = 0; i < 260; i++) ctx.fillRect((i * 71) % w, (i * 149) % h, 1, 1);
  }, { wrap: true });
}

function makeExitSignTex() {
  return canvasTex(512, 128, (ctx, w, h) => {
    ctx.fillStyle = '#0a6a3a';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 6;
    ctx.strokeRect(6, 6, w - 12, h - 12);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 52px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('EXIT  ↑  SORTIE', w / 2, 82);
  });
}

const postcardA = makePostcardTex();
const magazineA = makeMagazineTex();
const safetyCardA = makeSafetyCardTex();
const exitSignA = makeExitSignTex();

const M = {
  // Polished Terrazzo & Tiles with subtle gloss reflections
  // 2.4 m per tile puts the brass dividers on a 1.2 m bay — the spacing a
  // poured floor actually needs — and lands the chips at a believable 5–15 mm.
  terrazzo: worldXZUv(new THREE.MeshPhysicalMaterial({
    map: terrazzoA, roughness: 0.20, metalness: 0.08, clearcoat: 0.45, clearcoatRoughness: 0.1, color: 0xffffff,
  }), 2.4),
  tile: worldXZUv(pbrRough(new THREE.MeshPhysicalMaterial({
    map: tileA, normalMap: tileN, metalness: 0.08, clearcoat: 0.32, clearcoatRoughness: 0.1, color: 0xe8e4dc,
  }), './textures/CP_Ceramic_Tile_MS.webp'), 1.6),
  paver: worldXZUv(pbrRough(new THREE.MeshStandardMaterial({
    map: floorA, normalMap: floorN, metalness: 0.04, color: 0xd8d4cc,
  }), './textures/CP_Floor_Tiles_MS.webp'), 2.2),
  carpet: worldXZUv(new THREE.MeshStandardMaterial({
    map: carpetA, roughness: 0.96, metalness: 0.0, color: 0xffffff,
  }), 2.4),
  concrete: worldTriUv(pbrRough(new THREE.MeshStandardMaterial({
    map: concA, normalMap: concN, normalScale: new THREE.Vector2(0.7, 0.7),
    color: 0xc8c4bc, metalness: 0.02,
  }), './textures/CP_Concrete_01_MS.webp'), 3.2),
  // The shell's plaster. Triplanar, so a 24 m wall slab and a 4 m return get
  // the same tile size instead of the wall smearing one tile over six metres.
  plaster: worldTriUv(new THREE.MeshStandardMaterial({
    map: stuccoA, normalMap: stuccoN, normalScale: new THREE.Vector2(0.7, 0.7),
    color: 0xeeeae3, roughness: 0.86,
  }), 2.6),
  plasterWarm: worldTriUv(new THREE.MeshStandardMaterial({
    map: stuccoA, normalMap: stuccoN, color: 0xf4e8d8, roughness: 0.82,
  }), 2.6),
  secWall: worldTriUv(pbrRough(new THREE.MeshStandardMaterial({
    map: metalA, normalMap: metalN, color: 0xc8d8e4, metalness: 0.28,
  }), './textures/CP_Metal_Panel_MS.webp'), 2.0),
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
  signCheck: makeSign('CHECK-IN  ·  ENREGISTREMENT', 'DESKS 01–14  ·  BAGGAGE DROP'),
  signCheckW: makeSign('← CHECK-IN  01–07', 'DÉPÔT BAGAGES  ·  ALL AIRLINES'),
  signCheckE: makeSign('CHECK-IN  08–14  →', 'DÉPÔT BAGAGES  ·  ALL AIRLINES'),
  signKiosk: makeSign('SELF SERVICE', 'BORNES  ·  BAG TAGS', '#0d2a1e', '#e6fbf0'),
  signBhs: makeSign('BAGGAGE MAKE-UP', 'STAFF ONLY  ·  PERSONNEL AUTORISÉ', '#2a2210', '#f6ecd0'),
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
  ceiling: worldTriUv(new THREE.MeshStandardMaterial({
    map: stuccoA, normalMap: stuccoN, normalScale: new THREE.Vector2(0.25, 0.25),
    color: 0xf2f0ea, roughness: 0.74,
  }), 1.8),
  lightBar: new THREE.MeshStandardMaterial({
    color: 0xfff6e8, emissive: 0xffe8c4, emissiveIntensity: 1.6, roughness: 0.35,
  }),
  // Cove lighting: the strip that washes the top of a wall and turns a flat
  // grey plane into a gradient. Dimmer and cooler than the ceiling fixtures.
  coveLight: new THREE.MeshStandardMaterial({
    color: 0xfdf4e6, emissive: 0xffe6bc, emissiveIntensity: 1.05, roughness: 0.5,
  }),
  // --- Daylight ---
  // Roof glazing over the check-in hall. Its InstancedMesh has castShadow
  // cleared after the kits flush: three's shadow pass ignores transparency, so
  // left alone this pane would block the very sunlight it exists to admit.
  skylight: new THREE.MeshPhysicalMaterial({
    color: 0xdff0ff, roughness: 0.06, metalness: 0.0,
    transparent: true, opacity: 0.16, depthWrite: false,
    emissive: 0xcfe6ff, emissiveIntensity: 0.55, side: THREE.DoubleSide,
  }),

  // --- Check-in row: counters, belts and the wall they inject through ---
  // A check-in run is a system-furniture kit, not joinery, so it reads in
  // three materials: a light panel carcass, a dark solid-surface top and
  // stainless everywhere the luggage touches.
  chkPanel: worldTriUv(new THREE.MeshStandardMaterial({
    map: makeCheckinBackWall(), color: 0xffffff, roughness: 0.42, metalness: 0.08,
  }), 2.0),
  chkPlate: (() => {
    const t = makeDeskPlate();
    return new THREE.MeshStandardMaterial({
      map: t, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: 0.42, roughness: 0.35,
    });
  })(),
  chkCarcass: new THREE.MeshStandardMaterial({ color: 0xeef1f4, roughness: 0.36, metalness: 0.1 }),
  // The soffit over the counters is a lit ceiling, not a dark slab: it is what
  // separates a check-in row from a row of unlit joinery at the back of a hall.
  chkSoffit: new THREE.MeshStandardMaterial({
    color: 0xfdf8ef, emissive: 0xffeed2, emissiveIntensity: 0.62, roughness: 0.55,
  }),
  // Pale solid-surface top. A dark stone looks right in isolation, but the
  // belts and their beds are already dark, and the two together turned the
  // whole counter line into one black mass a metre off the floor.
  chkTop: new THREE.MeshPhysicalMaterial({
    color: 0xb9bec6, roughness: 0.24, metalness: 0.12, clearcoat: 0.7, clearcoatRoughness: 0.1,
  }),
  chkFasciaW: makeCheckinFascia(1, 7, 'PACIFIC GATE', '#8ec8e0', true),
  chkFasciaE: makeCheckinFascia(8, 7, 'PACIFIC GATE', '#8ec8e0'),
  // Stainless: scale decks, belt frames, hatch surrounds. Brushed, not chrome —
  // a mirror finish here would blow out under the fascia downlights.
  inox: new THREE.MeshStandardMaterial({ color: 0xdae0e6, roughness: 0.26, metalness: 0.8 }),
  inoxDull: new THREE.MeshStandardMaterial({ color: 0xa8b0b8, roughness: 0.45, metalness: 0.65 }),
  beltRubber: new THREE.MeshStandardMaterial({ color: 0x2b3034, roughness: 0.86, metalness: 0.05 }),
  flapRubber: new THREE.MeshStandardMaterial({
    map: makeFlapTex(), color: 0xffffff, roughness: 0.9, metalness: 0.04, side: THREE.DoubleSide,
  }),
  hatchVoid: new THREE.MeshBasicMaterial({ color: 0x05070a }),
  scaleReadout: (() => {
    const t = makeScaleReadout();
    return new THREE.MeshStandardMaterial({
      map: t, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: 1.2, roughness: 0.25,
    });
  })(),
  kioskScreen: (() => {
    const t = makeKioskScreen();
    return new THREE.MeshStandardMaterial({
      map: t, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: 1.15, roughness: 0.22,
    });
  })(),
  kioskBody: new THREE.MeshStandardMaterial({ color: 0x30373f, roughness: 0.42, metalness: 0.35 }),
  bagTag: new THREE.MeshStandardMaterial({
    map: makeBagTagTex(), color: 0xffffff, roughness: 0.75, side: THREE.DoubleSide,
  }),
  hazard: new THREE.MeshStandardMaterial({ color: 0xd8b02a, roughness: 0.6, metalness: 0.12 }),
  // Landside back-of-house: the baggage make-up hall the belts run into.
  bhsWall: worldTriUv(pbrRough(new THREE.MeshStandardMaterial({
    map: tex('./textures/CP_Wall_Panel_A.webp'), normalMap: ntex('./textures/CP_Wall_Panel_N.webp'),
    color: 0xb8bec4, metalness: 0.22,
  }), './textures/CP_Wall_Panel_MS.webp'), 3.0),
  shutter: new THREE.MeshStandardMaterial({
    map: tex('./textures/CP_Roller_Shutters_A.webp'), normalMap: ntex('./textures/CP_Roller_Shutters_N.webp'),
    color: 0xa8aeb4, roughness: 0.55, metalness: 0.4,
  }),
  cartCanvas: new THREE.MeshStandardMaterial({ color: 0x2f4256, roughness: 0.92 }),
  uld: new THREE.MeshStandardMaterial({ color: 0xa9b0b6, roughness: 0.42, metalness: 0.62 }),
  grass: new THREE.MeshStandardMaterial({ color: 0x6a8a52, roughness: 0.96 }),
  collider: new THREE.MeshBasicMaterial({ visible: false, colorWrite: false, depthWrite: false }),

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

  // --- Airliner Interior & Jetbridge Materials ---
  cabinCarpet: worldXZUv(new THREE.MeshStandardMaterial({
    map: makeCabinCarpetTex(), roughness: 0.92, metalness: 0.02,
  }), 1.8),
  seatNavy: new THREE.MeshStandardMaterial({
    map: makeSeatFabricTex(), roughness: 0.88, metalness: 0.0,
  }),
  // Back shell and armrest caps: the light grey moulding every cabin has. It is
  // what separates one seat from the next when the fabric goes dark.
  seatShell: new THREE.MeshStandardMaterial({
    color: 0x9aa4b2, roughness: 0.55, metalness: 0.08,
  }),
  seatHeadrest: new THREE.MeshStandardMaterial({
    color: 0x3d5478, roughness: 0.5, metalness: 0.1,
  }),
  // The paper antimacassar over the headrest — the brightest thing in the row,
  // and the reason a cabin photographs as stripes rather than as a dark mass.
  seatCover: new THREE.MeshStandardMaterial({
    color: 0xf2f4f7, roughness: 0.78, metalness: 0.0,
  }),
  seatBelt: new THREE.MeshStandardMaterial({
    color: 0xc8cdd4, roughness: 0.7, metalness: 0.05,
  }),
  cabinWall: new THREE.MeshStandardMaterial({
    color: 0xedf0f4, roughness: 0.65, metalness: 0.08,
  }),
  cabinCeiling: new THREE.MeshStandardMaterial({
    color: 0xf5f7fa, roughness: 0.55, metalness: 0.06,
  }),
  windowFrame: new THREE.MeshStandardMaterial({
    color: 0xd6dde6, roughness: 0.42, metalness: 0.12,
  }),
  safetyCardMat: new THREE.MeshStandardMaterial({
    map: safetyCardA, roughness: 0.35,
  }),
  exitSignMat: new THREE.MeshStandardMaterial({
    map: exitSignA, emissive: 0x10d060, emissiveMap: exitSignA, emissiveIntensity: 1.4, roughness: 0.2,
  }),
  trolleyAlum: new THREE.MeshStandardMaterial({
    color: 0xb8c2cc, roughness: 0.28, metalness: 0.85,
  }),
  trolleyRed: new THREE.MeshStandardMaterial({
    color: 0xb01828, roughness: 0.32, metalness: 0.4,
  }),
  bellowsBlack: new THREE.MeshStandardMaterial({
    color: 0x181a1c, roughness: 0.95, metalness: 0.1,
  }),
  hublotGlass: new THREE.MeshPhysicalMaterial({
    color: 0xc5daf0, roughness: 0.02, metalness: 0.0,
    transparent: true, opacity: 0.07, depthWrite: false,
    clearcoat: 1, clearcoatRoughness: 0.03, side: THREE.DoubleSide,
  }),
  jetbridgeGlass: new THREE.MeshPhysicalMaterial({
    color: 0xa8c8dc, roughness: 0.04, metalness: 0.02,
    transparent: true, opacity: 0.16, depthWrite: false,
    clearcoat: 0.8, clearcoatRoughness: 0.06, side: THREE.DoubleSide,
  }),
  seatIfe: new THREE.MeshStandardMaterial({
    color: 0x0c1016, roughness: 0.35, metalness: 0.35,
    emissive: 0x101820, emissiveIntensity: 0.35,
  }),
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
// Inverse of prop(), for the ankle-high parts of a prop: a plinth, a base
// plate, a foot. The controller makes prop AABBs solid at ANY height (the
// ground ray refuses to stand on props, so a low prop the player could step
// onto would drop them through it) — which turns a 3 cm stanchion base into
// a full-height wall, and worse, a square one, so the push-out picks whichever
// axis is shallowest and can cancel the walk direction outright. Emitted
// unflagged, the same shape falls under the STEP_H rule and is walked over.
function steppable(fn) {
  const outer = PROP;
  PROP = false;
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
// Two airbridges. Planes park on ±8 facing the glass (yaw π), so the
// starboard forward door — the dark decal at local (2, 6.9) — sits at
// planeX-2, z=planeZ-6.9. Lounge door and tube share tubeX; the cab
// reaches the last 0.85 m onto the skin.
const GATE_PLANE_X = [-14, 14];
// The plane used to park 26 m from the lounge glass wall (z=38), which put
// 18.5 m of jetbridge between the two doors — a jetway that long is not
// implausible on a real stand, but it made boarding a long walk down a
// featureless, repetitive tube (each of its 16 segments carries its own
// glass panel, so the far end read as a receding row of windows). Parked
// 6 m closer, the tube is a third shorter and still clears the nose by
// 5.75 m.
const GATE_PLANE_Z = 58;
const GATE_FUSE_R = 2;
const GATE_DOOR_LZ = 6.9;
const GATE_TUBE_OUT = 0.85;
const GATE_DOOR_Z = GATE_PLANE_Z - GATE_DOOR_LZ;
// Jetbridge tube span. Z0 is fixed to the lounge's own glass curtain wall
// (built separately, around z=38); Z1 tracks the door so the tube always
// ends just short of the cab, however close the plane is parked.
const GATE_TUBE_Z0 = 38.0;
const GATE_TUBE_Z1 = GATE_DOOR_Z - 0.6;
// Half-width of the L1 boarding opening. The skin cut-out, the interior wall
// cut-out and the collider gap all read it, so they cannot drift apart.
// The player's capsule is 0.84 m across, so a doorway only passes a band of
// centre positions 2*(HW - 0.42) wide. At the old 0.48 that band was 12 cm —
// and the bellows posts, planted at the very edge of the aperture, narrowed it
// further. Boarding was threading a needle.
const GATE_DOOR_HW = 0.65;
const GATE_PLANE_Y = 3.55;                             // datum of the parked planes
const GATE_CABIN_FLOOR_Y = GATE_PLANE_Y - 0.50;        // deck, and what groundFn returns
const GATE_SEAT_RISE = 0.445;                          // cushion top over the deck
const GATE_SEAT_TOP_Y = GATE_CABIN_FLOOR_Y + GATE_SEAT_RISE;
// Row spacing. player.js's seated pose solves purely for the feet landing
// flat on the floor at this seat's height — it has no notion of what's ahead
// of the knees — and on a 44.5 cm-high seat that plants the knee well forward.
// At the old 1.05 m pitch (already above real economy) the row ahead's
// backrest was closer than that reach: the sitter's own shin poked through
// the seatback in front. 1.25 m clears it with room to spare; the aft cabin
// has 4.45 m of empty floor past the last row to absorb the extra length.
const ROW_PITCH = 1.25;
const ROW0_Z = 4.50;
const gateRowZ = r => ROW0_Z - r * ROW_PITCH;
const gateDoorX = gx => gx - GATE_FUSE_R;
const gateTubeX = gx => gx - GATE_FUSE_R - GATE_TUBE_OUT;
const GATE_OPEN_HW = 1.05; // half-width of the lounge boarding opening
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
for (const gx of [...GATE_PLANE_X, -30])                    // gate lead-in lines
  slab(M.paintYellow, gx - 0.18, gx + 0.18, 40, 78, 0.005, 0.02);
slab(M.grass, -80, 26, 42, 210, -0.1, -0.02);
slab(M.grass, 56, 90, 32, 210, -0.1, -0.02);

// --- Runway Rubber Skid Marks (Touchdown Zone) ---
for (let sz = 46; sz < 94; sz += 5) {
  slab(M.rubberSkid, 39.4, 40.4, sz, sz + 3.6, 0.032, 0.046);
  slab(M.rubberSkid, 41.6, 42.6, sz, sz + 3.6, 0.032, 0.046);
}
// --- Apron Oil Stains & Parking Stop Bars ---
// The gate stands track the parked plane's own nose-stop line; the third
// stand at x=-30 has no gate of its own (REDWOOD sits further out at z=88
// as background scenery), so its marking stays where it always was.
for (const gx of GATE_PLANE_X) {
  slab(M.paintYellow, gx - 1.8, gx + 1.8, GATE_PLANE_Z - 0.2, GATE_PLANE_Z + 0.4, 0.01, 0.03); // T-stop bar
  shape(G.cyl, M.oilStain, gx, 0.015, GATE_PLANE_Z - 1.5, 3.2, 0.01, 3.2);                     // engine/APU drip zone
}
slab(M.paintYellow, -30 - 1.8, -30 + 1.8, 63.8, 64.4, 0.01, 0.03);
shape(G.cyl, M.oilStain, -30, 0.015, 62.5, 3.2, 0.01, 3.2);

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

// Hall side walls
slab(M.plaster, -24.2, -23.8, -32, -8, F, HALL_H);
slab(M.plaster, 23.8, 24.2, -32, -8, F, HALL_H);

// ---------------------------------------------------------------------------
// Hall roof. The old flat lid sealed the volume, so the only light reaching a
// 48 × 24 m room was a handful of point lights and the ambient term — which is
// why the walls read as one dead grey. Three north–south glazed strips replace
// bands of that lid with actual holes: the sun (from the west, ~60° up) drops
// through them onto the terrazzo about 5.5 m east of each strip, and those
// three moving bands of light are what give the hall its depth. The glass is
// its own material so its castShadow can be cleared once the kits flush.
// ---------------------------------------------------------------------------
const SKY_STRIPS = [-15, 0, 15];
const SKY_HW = 1.35;
{
  const edges = [-24.2];
  for (const sx of SKY_STRIPS) edges.push(sx - SKY_HW, sx + SKY_HW);
  edges.push(24.2);
  for (let i = 0; i < edges.length; i += 2)          // solid deck between strips
    slab(M.ceiling, edges[i], edges[i + 1], -32, -8, HALL_H, HALL_H + 0.2);
  for (const sx of SKY_STRIPS) {
    // Glazing sits a touch below the deck so the upstand kerb reads as a kerb.
    slab(M.skylight, sx - SKY_HW, sx + SKY_HW, -31.4, -8.6, HALL_H + 0.02, HALL_H + 0.1);
    // Kerb + end closures, so daylight does not leak past the strip's ends.
    slab(M.ceiling, sx - SKY_HW, sx + SKY_HW, -32, -31.4, HALL_H, HALL_H + 0.2);
    slab(M.ceiling, sx - SKY_HW, sx + SKY_HW, -8.6, -8, HALL_H, HALL_H + 0.2);
    for (const ex of [sx - SKY_HW, sx + SKY_HW]) {
      box(M.steel, ex, HALL_H + 0.34, -20, 0.14, 0.5, 22.8);      // upstand kerb
    }
    // Glazing bars every 2.4 m — the scale cue that makes the strip read as
    // glass rather than as a gap in the model.
    for (let gz = -30.6; gz <= -9.4; gz += 2.4)
      box(M.steel, sx, HALL_H + 0.14, gz, SKY_HW * 2, 0.12, 0.12);
    box(M.steel, sx, HALL_H + 0.14, -20, 0.12, 0.12, 22.6);
  }
}
// Exposed roof trusses under the deck: bottom chord, verticals, and the
// crossing purlins. A 9.5 m volume with nothing between the light bars and the
// lid has no sense of height at all.
for (const zRow of [-29, -25, -21, -17, -13, -9]) {
  box(M.steelDark, 0, HALL_H - 1.35, zRow, 47.6, 0.22, 0.34);      // bottom chord
  box(M.steelDark, 0, HALL_H - 0.28, zRow, 47.6, 0.16, 0.24);      // top chord
  for (let tx = -22; tx <= 22; tx += 2.75)
    box(M.steelDark, tx, HALL_H - 0.82, zRow, 0.1, 1.3, 0.16);     // web posts
}
for (const px of [-19.5, -10.5, -4.5, 4.5, 10.5, 19.5])
  box(M.steelDark, px, HALL_H - 1.55, -20, 0.16, 0.2, 23.4);       // purlins
// Ceiling fixtures, hung off the trusses and paired with real point lights so
// the emissive strip is not lying about what it does to the room.
for (const zRow of [-28, -23, -18, -13]) {
  for (let x = -19.5; x <= 19.5; x += 6.5) {
    box(M.lightBar, x, HALL_H - 1.62, zRow, 5.4, 0.1, 0.42);
    box(M.steelDark, x, HALL_H - 1.5, zRow, 5.5, 0.14, 0.52);
  }
}
for (const [x, z] of [[-16, -20], [16, -20], [-16, -12], [16, -12]]) {
  shape(G.cylBase, M.steel, x, F, z, 0.5, HALL_H, 0.5);
  shape(G.cyl, M.steelDark, x, HALL_H - 0.22, z, 0.72, 0.18, 0.72);
  shape(G.cyl, M.steelDark, x, F + 0.12, z, 0.68, 0.16, 0.68);
  shape(G.cyl, M.steelDark, x, HALL_H - 1.42, z, 0.9, 0.16, 0.9);  // truss capital
}

// ---------------------------------------------------------------------------
// Wall articulation. A 48 m plaster plane with nothing on it is the single
// biggest thing reading as "untextured box" in the hall, and no amount of
// texture work fixes it — what a real wall has is depth: a shadow gap at the
// floor, reveals at storey height, a cornice, and a cove that washes the top
// three metres so the plane is a gradient rather than a flat fill.
// ---------------------------------------------------------------------------
for (const d of [1, -1]) {                     // d = +1 west wall, -1 east wall
  const inner = -23.8 * d;                     // hall-side face of the wall
  const at = o => inner + d * o;               // o metres proud of that face
  // Band course at 6.2 m: a projecting plaster shelf with a dark reveal under
  // its nose, so the upper wall casts a real line across the lower one.
  slab(M.plaster, at(0), at(0.13), -31.9, -8.1, 6.2, 6.42);
  slab(M.steelDark, at(0), at(0.135), -31.9, -8.1, 6.12, 6.2);
  // Cornice + cove. The strip faces up and washes the last metre of plaster
  // and the ceiling edge; that gradient is what stops the wall reading flat.
  slab(M.plaster, at(0), at(0.40), -31.9, -8.1, HALL_H - 0.95, HALL_H - 0.72);
  slab(M.coveLight, at(0.06), at(0.32), -31.9, -8.1, HALL_H - 0.72, HALL_H - 0.66);
  slab(M.steelDark, at(0), at(0.42), -31.9, -8.1, HALL_H - 1.0, HALL_H - 0.95);
  // Pilasters on the structural bay, starting above the check-in fascia so
  // they articulate the empty upper wall without fouling the counters.
  for (let pz = -30.5; pz <= -9.5; pz += 3.5)
    box(M.plaster, at(0.14), (4.1 + HALL_H - 1.0) / 2, pz, 0.28, HALL_H - 5.1, 0.6);
}
// Hall identity: timber dado, cyan wayfinding rail, slat panels, travel ads
slab(M.wainscot, -24.05, -23.72, -31.6, -8.4, F, 1.28);
slab(M.wainscot, 23.72, 24.05, -31.6, -8.4, F, 1.28);
slab(M.accent, -24.08, -23.7, -31.6, -8.4, 2.22, 2.42);
slab(M.accent, 23.7, 24.08, -31.6, -8.4, 2.22, 2.42);
slab(M.steel, -24.08, -23.7, -31.6, -8.4, F, 0.08);
slab(M.steel, 23.7, 24.08, -31.6, -8.4, F, 0.08);
// The travel ads move up out of the check-in fascia's band and onto the piers
// between the two banks' signage, where they are still read from the floor.
box(M.posterTokyo, -23.44, 4.85, -28.75, 0.05, 2.1, 2.6);
box(M.posterParis, 23.44, 4.85, -28.75, 0.05, 2.1, 2.6);
box(M.posterNy, -23.44, 4.85, -11.25, 0.05, 2.1, 2.6);
box(M.posterSydney, 23.44, 4.85, -11.25, 0.05, 2.1, 2.6);
// CHECK-IN sign hung on the hall centreline, reading across both banks
box(M.signCheck, 0, 6.6, -20.5, 8.4, 1.35, 0.1);
box(M.steelDark, -3.6, 8.15, -20.5, 0.05, 1.75, 0.05);
box(M.steelDark, 3.6, 8.15, -20.5, 0.05, 1.75, 0.05);
// Bank-mouth signage, hung where each queue starts
box(M.signCheckW, -17.6, 4.6, -31.0, 5.2, 0.85, 0.08);
box(M.signCheckE, 17.6, 4.6, -31.0, 5.2, 0.85, 0.08);
// Clock over the security portal + roof-line PACIFIC GATE on the curb canopy
slab(M.wainscot, -24, -10.2, -8.05, -7.72, F, 1.28);
slab(M.wainscot, -3.8, 24, -8.05, -7.72, F, 1.28);
slab(M.accent, -24, -10.2, -8.05, -7.72, 2.22, 2.42);
slab(M.accent, -3.8, 24, -8.05, -7.72, 2.22, 2.42);
box(M.clock, -7, 5.2, -8.32, 0.9, 0.9, 0.06);
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
// FIDS bank east of the portal. It used to hang at z = -7.44 — the security
// side of a wall that spans -8.2..-7.8 — so the departures board the hall's
// two board-readers are posed in front of was buried inside the checkpoint.
// It belongs on the hall face, at -8.2 and proud of it.
box(M.steelDark, 9, 4.4, -8.31, 11.0, 3.4, 0.22);
box(M.screen, 9, 4.4, -8.45, 10.2, 3.0, 0.05);
// The rest of the north wall was twenty metres of blank plaster facing
// everyone who walked in. It gets the same articulation as the side walls,
// plus the terminal's own crest, so the hall has something to end on.
{
  const nz = -8.2;                                       // hall-side face
  const at = o => nz - o;                                // o metres into the hall
  slab(M.plaster, -23.9, -10.1, at(0.13), at(0), 6.2, 6.42);
  slab(M.plaster, -3.9, 23.9, at(0.13), at(0), 6.2, 6.42);
  slab(M.steelDark, -23.9, -10.1, at(0.135), at(0), 6.12, 6.2);
  slab(M.steelDark, -3.9, 23.9, at(0.135), at(0), 6.12, 6.2);
  slab(M.plaster, -23.9, 23.9, at(0.40), at(0), HALL_H - 0.95, HALL_H - 0.72);
  slab(M.coveLight, -23.9, 23.9, at(0.32), at(0.06), HALL_H - 0.72, HALL_H - 0.66);
  slab(M.steelDark, -23.9, 23.9, at(0.42), at(0), HALL_H - 1.0, HALL_H - 0.95);
  for (const px of [-21.5, -18, -14.5, 0.5, 4, 21.5])
    box(M.plaster, px, (4.1 + HALL_H - 1.0) / 2, at(0.14), 0.6, HALL_H - 5.1, 0.28);
  // Terminal crest west of the portal, and a wall clock at the far east end.
  box(M.steelDark, -16.2, 4.6, at(0.16), 6.6, 2.4, 0.18);
  box(M.accent, -16.2, 4.6, at(0.28), 6.2, 2.0, 0.06);
  box(M.signDept, -16.2, 4.6, at(0.34), 5.8, 1.1, 0.06);
  box(M.clock, 21.5, 5.6, at(0.2), 0.9, 0.9, 0.06);
}

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
slab(M.ceiling, -12, 12, -8, 2, SEC_H, SEC_H + 0.18);
box(M.lightBar, 0, SEC_H - 0.1, -6.4, 20, 0.08, 0.4);
box(M.lightBar, 0, SEC_H - 0.1, -3.2, 20, 0.08, 0.4);
box(M.lightBar, 0, SEC_H - 0.1, 0.4, 20, 0.08, 0.4);

// Concourse south wall. Café (x -24..-12) and shop (x 12..24) stay solid.
// The 8 m hole at x 2..10 let anyone walk from the hall aisle around the
// X-ray lanes and into the gates; the checkpoint face is now glass, with
// openings only on the three WTMD lanes.
slab(M.plaster, -24, -12, 1.8, 2.2, F, CONC_H);
slab(M.plaster, 12, 24, 1.8, 2.2, F, CONC_H);
slab(M.plaster, -12, 12, 1.8, 2.2, SEC_H, CONC_H);
box(M.signArrow, 0, 3.9, 2.34, 6.4, 0.95, 0.08);           // faces airside

{
  const lanes = [-7.5, -2.5, 2.5];
  const half = 0.70;
  const doorH = 2.28;
  const z0 = 1.62, z1 = 1.86;
  const zMid = (z0 + z1) / 2;
  const openings = lanes.map(lx => ({ x0: lx - half, x1: lx + half }));
  prop(() => {
    let cursor = -11.96;
    const solids = [];
    for (const o of openings) {
      if (o.x0 - cursor > 0.05) solids.push([cursor, o.x0]);
      cursor = o.x1;
    }
    if (11.96 - cursor > 0.05) solids.push([cursor, 11.96]);
    for (const [x0, x1] of solids) {
      slab(M.glass, x0, x1, z0, z1, F, SEC_H);
      slab(M.steelDark, x0, x1, z0 - 0.02, z1 + 0.02, F, 0.14);
      box(M.steelDark, (x0 + x1) / 2, 1.04, zMid, x1 - x0, 0.04, 0.07);
      const n = Math.max(0, Math.round((x1 - x0) / 2.0));
      for (let i = 1; i <= n; i++) {
        const mx = x0 + (i / (n + 1)) * (x1 - x0);
        box(M.steelDark, mx, SEC_H / 2, zMid, 0.06, SEC_H, 0.08);
      }
    }
    for (const o of openings) {
      slab(M.glass, o.x0, o.x1, z0, z1, doorH, SEC_H);
      box(M.steelDark, o.x0, doorH / 2, zMid, 0.10, doorH, 0.20);
      box(M.steelDark, o.x1, doorH / 2, zMid, 0.10, doorH, 0.20);
      box(M.steelDark, (o.x0 + o.x1) / 2, doorH, zMid, o.x1 - o.x0 + 0.10, 0.10, 0.20);
    }
  });
}

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

// North curtain wall: mullions + glass looking at the apron.
// Boarding openings sit on the jetway centreline (not the aircraft
// centreline) so the door, tube and fuselage door read as one corridor.
const gaps = GATE_PLANE_X.map(gx => {
  const tx = gateTubeX(gx);
  return { x0: tx - GATE_OPEN_HW, x1: tx + GATE_OPEN_HW, y1: 3.02 };
}).sort((a, b) => a.x0 - b.x0);

let sillCursor = -24.2;
for (const g of gaps) {
  if (g.x0 > sillCursor) slab(M.steel, sillCursor, g.x0, 37.85, 38.05, F, 0.18);
  sillCursor = g.x1;
}
if (sillCursor < 24.2) slab(M.steel, sillCursor, 24.2, 37.85, 38.05, F, 0.18);

slab(M.steel, -24.2, 24.2, 37.85, 38.05, CONC_H - 0.18, CONC_H);

for (let x = -24; x <= 24; x += 4) {
  if (gaps.some(g => x >= g.x0 - 0.25 && x <= g.x1 + 0.25)) continue;
  box(M.steel, x, CONC_H / 2, 37.95, 0.12, CONC_H, 0.14);
}

let cursor = -24;
for (const g of gaps) {
  if (g.x0 > cursor) slab(M.glass, cursor, g.x0, 37.88, 38.12, 0.18, CONC_H - 0.18);
  slab(M.glass, g.x0, g.x1, 37.88, 38.12, g.y1, CONC_H - 0.18); // transom
  cursor = g.x1;
}
if (cursor < 24) slab(M.glass, cursor, 24, 37.88, 38.12, 0.18, CONC_H - 0.18);

for (const gx of GATE_PLANE_X) {
  const tx = gateTubeX(gx);
  box(M.steelDark, tx - GATE_OPEN_HW, 1.51, 37.95, 0.18, 3.02, 0.32);
  box(M.steelDark, tx + GATE_OPEN_HW, 1.51, 37.95, 0.18, 3.02, 0.32);
  box(M.steelDark, tx, 3.08, 37.95, GATE_OPEN_HW * 2 + 0.18, 0.16, 0.32);
}

// Hall. Four lamps on the fixture grid rather than three for the whole volume,
// so the floor brightens under each run and falls off between them. The count
// stays small on purpose: this is a forward renderer and the scene already
// carries thirty-odd point lights, each one another iteration in every
// fragment shader that runs. The daylight through the roof does most of the
// work here, and the cove and the fascias are emissive geometry, which is free.
for (const lz of [-25, -15])
  for (const lx of [-13, 13]) {
    const l = new THREE.PointLight(0xfdf5e8, 1.7, 30, 2);
    l.position.set(lx, HALL_H - 2.3, lz);
    world.add(l);
  }
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
// CHECK-IN / BAGGAGE DROP — two linear banks, both backed onto a wall.
//
// This used to be four free-standing islands in the middle of the floor, each
// with three stub belts that ran two metres and stopped in mid-air. That is
// not how a bag gets checked: the whole point of the counter line is that it
// is the boundary between the public hall and the baggage system, so it has
// to sit against something a belt can go *through*. A bag dropped in the
// middle of a hall has nowhere to go.
//
// So the counters move to the hall's two long walls, seven positions a side,
// desks 01–07 west and 08–14 east — the classic linear (frontal) check-in
// arrangement. Per position, reading from the queue inward:
//
//   queue line → scale deck (proud of the counter, where you lift the bag) →
//   take-away belt → counter line, interrupted at the belt → agent aisle →
//   flap-curtained hatch in the back wall → baggage make-up hall outside.
//
// The hatch and the make-up hall behind it are the parts that make the rest
// legible: you can follow a suitcase from the passenger's hand to the point
// where the building swallows it.
// ---------------------------------------------------------------------------
const CHK_WALL = 23.8;      // hall-side face of the side walls
const CHK_PITCH = 2.6;      // one position: belt slot + counter module
const CHK_N = 7;            // positions per bank
const CHK_Z0 = -29.0;       // centre of the southernmost position
const CHK_SLOT = 1.10;      // belt slot width, measured along the wall
// A position runs z ∈ [c-1.3, c+1.3]: belt in the southern 1.1 m of it, then
// 1.5 m of counter. Splitting it this way is what lets the counter line be
// continuous to the eye while still being interrupted at every belt.
const chkZ = i => CHK_Z0 + i * CHK_PITCH;
const chkBeltZ = i => chkZ(i) - CHK_PITCH / 2 + CHK_SLOT / 2;   // c - 0.75
const chkDeskZ = i => chkZ(i) + CHK_SLOT / 2;                   // c + 0.55
const CHK_Z_S = chkZ(0) - CHK_PITCH / 2;                        // -30.3
const CHK_Z_N = chkZ(CHK_N - 1) + CHK_PITCH / 2;                // -12.1

// One bank. `d` is the direction from the wall into the hall: +1 for the west
// wall, -1 for the east. Everything is written as a distance proud of the wall
// face, so the two banks are one piece of code read in a mirror.
function checkInBank(d, fascia) {
  const wall = -CHK_WALL * d;
  const at = o => wall + d * o;
  // slab() wants ordered bounds and the mirror flips them, so span() sorts.
  const span = (a, b) => (d > 0 ? [at(a), at(b)] : [at(b), at(a)]);
  const xslab = (mat, a, b, za, zb, y0, y1) => {
    const [x0, x1] = span(a, b);
    slab(mat, x0, x1, za, zb, y0, y1);
  };
  const z0 = CHK_Z_S, z1 = CHK_Z_N;

  prop(() => {
    // --- Back wall lining, interrupted at every belt slot -------------------
    for (let i = 0; i <= CHK_N; i++) {
      const a = i === 0 ? z0 : chkBeltZ(i - 1) + CHK_SLOT / 2;
      const b = i === CHK_N ? z1 : chkBeltZ(i) - CHK_SLOT / 2;
      if (b - a > 0.05) xslab(M.chkPanel, 0, 0.22, a, b, F, 3.90);
    }
    // Lintel filling the wall above each hatch head.
    for (let i = 0; i < CHK_N; i++)
      xslab(M.chkPanel, 0, 0.22, chkBeltZ(i) - CHK_SLOT / 2, chkBeltZ(i) + CHK_SLOT / 2, 1.18, 3.90);
    xslab(M.steelDark, 0, 0.26, z0, z1, 3.90, 4.02);

    // --- Fascia: soffit cantilevered over the counters, sign band on its nose
    xslab(M.chkSoffit, 0.22, 2.55, z0, z1, 3.28, 3.40);
    box(fascia, at(2.62), 2.96, (z0 + z1) / 2, 0.14, 0.72, z1 - z0);
    xslab(M.steelDark, 2.50, 2.70, z0, z1, 3.32, 3.46);
    xslab(M.steelDark, 2.52, 2.68, z0, z1, 2.52, 2.60);
    // Downlights under the soffit. The counter line has to be the brightest
    // thing in the hall or nobody reads it as the place you go first.
    for (let lz = z0 + 1.3; lz < z1; lz += 2.6) {
      box(M.lightBar, at(1.5), 3.245, lz, 1.7, 0.05, 0.36);
      box(M.lightBar, at(2.36), 3.245, lz, 0.32, 0.05, 2.3);
    }
  });
  // Two lamps a bank. Emissive geometry paints a lit soffit but throws nothing
  // on the counters underneath, and the counters are the point of the room.
  for (const lz of [z0 + 4.5, z1 - 4.5]) {
    const l = new THREE.PointLight(0xfff2de, 1.35, 13, 2);
    l.position.set(at(1.7), 3.0, lz);
    world.add(l);
  }

  for (let i = 0; i < CHK_N; i++) {
    const mz = chkDeskZ(i);         // counter module centre
    const bz = chkBeltZ(i);         // belt slot centre
    const mLen = CHK_PITCH - CHK_SLOT;

    // --- Counter module ---------------------------------------------------
    prop(() => {
      box(M.steelDark, at(1.56), F + 0.06, mz, 0.68, 0.12, mLen);           // recessed plinth
      box(M.chkCarcass, at(1.55), F + 0.54, mz, 0.80, 0.84, mLen);          // carcass
      box(M.accent, at(1.955), F + 0.91, mz, 0.03, 0.05, mLen);             // lit reveal
      box(M.chkTop, at(1.52), F + 1.00, mz, 0.95, 0.08, mLen + 0.06);       // solid-surface top
      // The agent's kit, all of it turned toward the wall side: monitor on a
      // stalk, keyboard, and the two printers every desk has — boarding pass
      // and bag tag.
      box(M.steelDark, at(1.28), F + 1.28, mz + 0.24, 0.05, 0.48, 0.05);
      box(M.seatIfe, at(1.34), F + 1.44, mz + 0.24, 0.07, 0.32, 0.48);
      box(M.steelDark, at(1.60), F + 1.06, mz + 0.22, 0.30, 0.03, 0.42);
      box(M.chkCarcass, at(1.30), F + 1.14, mz - 0.36, 0.34, 0.20, 0.32);
      box(M.inox, at(1.30), F + 1.25, mz - 0.36, 0.30, 0.02, 0.26);
      box(M.chkCarcass, at(1.66), F + 1.12, mz - 0.44, 0.24, 0.16, 0.24);
      // Passenger side: card terminal on a short stalk.
      box(M.inox, at(2.00), F + 1.12, mz - 0.32, 0.04, 0.16, 0.04);
      box(M.steelDark, at(2.00), F + 1.25, mz - 0.32, 0.10, 0.14, 0.16);
      // Agent stool in the aisle behind the counter.
      shape(G.cylBase, M.steelDark, at(0.66), F, mz + 0.1, 0.36, 0.05, 0.36);
      shape(G.cylBase, M.inoxDull, at(0.66), F + 0.05, mz + 0.1, 0.07, 0.55, 0.07);
      shape(G.cyl, M.fabric, at(0.66), F + 0.64, mz + 0.1, 0.42, 0.1, 0.42);
      // Branding plate on the lining, at eye height for the queue, with the
      // accent reveal under it.
      box(M.chkPlate, at(0.24), F + 2.34, mz, 0.03, 0.30, 1.20);
      box(M.accent, at(0.25), F + 2.13, mz, 0.03, 0.05, 1.20);
    });

    // --- Belt slot: scale deck, take-away belt, hatch -----------------------
    prop(() => {
      // The belt runs from 2.50 m proud of the wall — half a metre in front
      // of the counter face, so a bag goes straight up onto it — back through
      // the counter line, across the agent aisle, and into the wall.
      const runMid = 1.26, runLen = 2.48;
      box(M.inoxDull, at(runMid), F + 0.16, bz, runLen, 0.28, 0.94);        // bed
      box(M.beltRubber, at(runMid), F + 0.315, bz, runLen, 0.05, 0.80);     // belt
      box(M.inox, at(runMid), F + 0.36, bz + 0.455, runLen, 0.12, 0.06);    // side guards
      box(M.inox, at(runMid), F + 0.36, bz - 0.455, runLen, 0.12, 0.06);
      for (const lz of [bz - 0.38, bz + 0.38])
        for (const lx of [0.35, 2.20])
          shape(G.cylBase, M.inoxDull, at(lx), F, lz, 0.07, 0.14, 0.07);
      // Weighing deck: the outer 0.9 m, its own stainless platform set a hair
      // proud of the belt, with the readout on a post beside it.
      box(M.inox, at(2.08), F + 0.335, bz, 0.86, 0.05, 0.86);
      box(M.steelDark, at(2.08), F + 0.29, bz, 0.92, 0.05, 0.92);
      shape(G.cylBase, M.inoxDull, at(2.42), F + 0.30, bz + 0.54, 0.06, 0.78, 0.06);
      box(M.scaleReadout, at(2.42), F + 1.12, bz + 0.54, 0.03, 0.11, 0.20);
      // Hazard edging on the lip. It is the one place in the terminal where a
      // moving machine meets the public, and it is always striped.
      box(M.hazard, at(2.515), F + 0.235, bz, 0.04, 0.16, 0.94);

      // --- The hatch through the wall ---
      box(M.hatchVoid, at(-0.14), F + 0.72, bz, 0.48, 0.84, 1.02);          // darkness beyond
      box(M.inox, at(0.14), F + 1.16, bz, 0.20, 0.14, 1.20);                // head
      for (const sz of [bz - 0.57, bz + 0.57])
        box(M.inox, at(0.14), F + 0.72, sz, 0.20, 1.02, 0.10);              // jambs
      // Rubber flap curtain, seven strips, each hung at a slightly different
      // angle so it reads as hanging rubber and not as a painted panel.
      for (let s = 0; s < 7; s++)
        box(M.flapRubber, at(0.22), F + 0.72, bz - 0.42 + s * 0.14,
          0.02, 0.78, 0.135, (s % 3 - 1) * 0.04);
      box(M.runwayLightAmber, at(0.30), F + 1.28, bz, 0.06, 0.06, 0.06);    // belt-running lamp
    });

    // Bags mid-transaction. On the scale deck rather than deep in the run:
    // that is where a bag actually sits while it is being weighed and tagged,
    // and it is the only part of the belt the queue can see over the counter.
    if (i % 3 !== 1) {
      prop(() => {
        const bm = [M.luggageRed, M.luggageTeal, M.luggageDark, M.bag2][i % 4];
        box(bm, at(2.08), F + 0.60, bz + 0.02, 0.34, 0.52, 0.66);
        box(M.steelDark, at(2.08), F + 0.89, bz + 0.02, 0.06, 0.07, 0.24);  // handle
        box(M.bagTag, at(2.03), F + 0.78, bz + 0.26, 0.005, 0.18, 0.10);    // paper tag
        // One already swallowed, half through the flaps.
        if (i % 2 === 0) box(M.luggageTeal, at(0.42), F + 0.56, bz, 0.44, 0.44, 0.58);
        if (i % 2 === 1) box(M.bag3, at(3.05), F + 0.28, bz - 0.66, 0.36, 0.56, 0.28);
      });
    }
  }

  // --- Queue: belt stanchions parallel to the counters --------------------
  prop(() => {
    const post = (x, z) => {
      shape(G.cylBase, M.steelDark, x, F, z, 0.30, 0.03, 0.30);
      shape(G.cylBase, M.inox, x, F + 0.03, z, 0.055, 0.92, 0.055);
      shape(G.cyl, M.steelDark, x, F + 0.93, z, 0.09, 0.09, 0.09);
    };
    const tape = (xa, za, xb, zb) => {
      const len = Math.hypot(xb - xa, zb - za);
      box(M.accent, (xa + xb) / 2, F + 0.86, (za + zb) / 2, len, 0.05, 0.03,
        Math.atan2(-(zb - za), xb - xa));
    };
    const laneA = at(3.30), laneB = at(5.00);
    const qz0 = z0 + 0.6, qz1 = z1 - 0.6;
    for (const lx of [laneA, laneB]) {
      let prev = null;
      for (let qz = qz0; qz <= qz1 + 0.01; qz += 2.9) {
        post(lx, qz);
        if (prev !== null) tape(lx, prev, lx, qz);
        prev = qz;
      }
    }
    // Queue entrance is at the south (qz0) under the sign; the fold at the north
    // end (qz1, deep in the hall) directs passengers forward to the counters.
    tape(laneA, qz1, laneB, qz1);
  });
  // Floor line telling the queue where to stop. Outside prop(): a 7 mm-tall
  // decal marked solid would be a wall the player cannot step over.
  const [lx0, lx1] = span(2.85, 3.00);
  slab(M.paintYellow, lx0, lx1, z0, z1, 0.041, 0.048);
}
checkInBank(1, M.chkFasciaW);
checkInBank(-1, M.chkFasciaE);

// Suitcases standing by queuing travelers in the check-in hall
prop(() => {
  // West bank queue suitcases
  suitcase(-19.25, F, -27.4, M.luggageTeal, 0.12);
  suitcase(-19.25, F, -21.8, M.luggageDark, -0.08);
  suitcase(-19.25, F, -16.2, M.luggageRed, 0.15);
  suitcase(-19.25, F, -13.4, M.luggageTeal, -0.1);
  // East bank queue suitcases
  suitcase(19.25, F, -27.4, M.luggageRed, -0.1);
  suitcase(19.25, F, -21.8, M.luggageTeal, 0.14);
  suitcase(19.25, F, -16.2, M.luggageDark, -0.05);
  suitcase(19.25, F, -13.4, M.luggageRed, 0.08);
});

// ---------------------------------------------------------------------------
// Self-service kiosks. With the counters gone from the middle of the hall the
// floor needed the thing that is genuinely free-standing in a modern
// departures hall: the bag-tag kiosk. Two clusters, clear of the central aisle
// so the walk from the doors to security still runs straight through.
// ---------------------------------------------------------------------------
function kiosk(x, z, ry) {
  prop(() => {
    frame(x, z, ry, () => {
      box(M.steelDark, 0, F + 0.04, 0, 0.62, 0.08, 0.52);
      box(M.kioskBody, 0, F + 0.58, 0, 0.52, 1.00, 0.42);
      box(M.kioskBody, 0, F + 1.16, -0.06, 0.56, 0.30, 0.50);
      box(M.kioskScreen, 0, F + 1.25, -0.22, 0.44, 0.30, 0.03, 0);
      box(M.inox, 0, F + 1.02, -0.24, 0.30, 0.03, 0.10);      // bag-tag slot
      box(M.accent, 0, F + 0.06, -0.22, 0.44, 0.03, 0.02);
    });
  });
}
for (const [kx, kry] of [[-8.6, 0], [8.6, 0]]) {
  for (let i = 0; i < 4; i++) {
    kiosk(kx - 1.65 + i * 1.1, -27.2, kry);
    kiosk(kx - 1.65 + i * 1.1, -22.6, kry);
  }
  box(M.signKiosk, kx, 3.2, -28.4, 3.4, 0.6, 0.06);
  // Hangers run all the way to the truss bottom chord. Stopped short they read
  // as two rods ending in mid-air with a sign dangling off them.
  for (const hx of [kx - 1.5, kx + 1.5])
    box(M.steelDark, hx, (3.5 + HALL_H - 1.35) / 2, -28.4, 0.05, HALL_H - 1.35 - 3.5, 0.05);
}

// ---------------------------------------------------------------------------
// BAGGAGE MAKE-UP HALL — the other side of the hatches.
//
// Fourteen belts now run through the check-in wall, and they have to arrive
// somewhere: a landside back-of-house shed against each flank of the terminal,
// with roller doors onto the apron and the make-up area's rolling stock parked
// outside it. Anyone who walks around the building sees the industrial end of
// the same system they just watched swallow a suitcase, which is what makes
// the hatch read as a hatch and not as a hole in a wall.
// ---------------------------------------------------------------------------
function baggageMakeUp(d) {                // d = +1 west flank, -1 east flank
  const inner = -24.2 * d;                 // outer face of the terminal wall
  const at = o => inner - d * o;           // o metres out from the terminal
  const H = 5.1;
  const z0 = -31.0, z1 = -11.0;
  const xs = (a, b) => (d > 0 ? [at(b), at(a)] : [at(a), at(b)]);
  const xslab = (mat, a, b, za, zb, y0, y1) => {
    const [p, q] = xs(a, b);
    slab(mat, p, q, za, zb, y0, y1);
  };
  prop(() => {
    xslab(M.bhsWall, 0, 10.4, z0, z0 + 0.35, F, H);          // south gable
    xslab(M.bhsWall, 0, 10.4, z1 - 0.35, z1, F, H);          // north gable
    xslab(M.bhsWall, 10.05, 10.4, z0, z1, F, H);             // outer wall
    xslab(M.concrete, 0, 10.4, z0, z1, H, H + 0.34);         // roof deck
    xslab(M.steelDark, -0.1, 10.7, z0 - 0.12, z1 + 0.12, H + 0.34, H + 0.46);
    // Roller shutter doors onto the service road, with their concrete aprons.
    for (const dz of [-27.0, -21.0, -15.0]) {
      xslab(M.steelDark, 10.28, 10.52, dz - 1.85, dz + 1.85, F, 4.25);
      xslab(M.shutter, 10.4, 10.56, dz - 1.7, dz + 1.7, 0.05, 4.1);
      xslab(M.hazard, 10.42, 10.58, dz - 1.85, dz + 1.85, 4.25, 4.42);
      box(M.paint, at(11.9), F + 0.02, dz, 3.0, 0.06, 4.6);
    }
    // Personnel door, a canopy over it, and the vents every plant room has.
    xslab(M.steelDark, 10.34, 10.5, -12.6, -11.6, F, 2.2);
    xslab(M.steel, 10.4, 12.0, -13.0, -11.2, 2.3, 2.42);
    for (let vz = -29.5; vz < -12; vz += 3.6)
      xslab(M.inoxDull, 10.42, 10.56, vz - 0.5, vz + 0.5, 4.5, 5.0);
    // Rooftop plant.
    for (const pz of [-26.5, -18.5]) {
      xslab(M.inoxDull, 2.2, 6.4, pz - 1.6, pz + 1.6, H + 0.46, H + 1.9);
      xslab(M.steelDark, 3.0, 5.6, pz - 1.0, pz + 1.0, H + 1.9, H + 2.05);
    }
  });
  box(M.signBhs, at(10.62), 3.3, -18.0, 0.08, 0.9, 5.0);
  // Dollies and containers waiting on the service road: canvas-topped baggage
  // carts in a train, two ULD containers, and the tug that pulls them.
  prop(() => {
    for (let i = 0; i < 5; i++) {
      const cz = -28.4 + i * 2.35;
      box(M.steelDark, at(13.6), F + 0.22, cz, 2.9, 0.16, 1.5);
      box(M.uld, at(13.6), F + 0.52, cz, 2.8, 0.46, 1.44);
      box(M.cartCanvas, at(13.6), F + 1.28, cz, 2.7, 1.06, 1.36);
      for (const wz of [cz - 0.55, cz + 0.55])
        for (const wx of [12.5, 14.7])
          shape(G.cyl, M.steelDark, at(wx), F + 0.14, wz, 0.28, 0.14, 0.28, { rz: Math.PI / 2 });
      if (i < 4) box(M.steelDark, at(13.6), F + 0.20, cz + 1.17, 0.12, 0.1, 0.85);
    }
    for (let i = 0; i < 2; i++) {
      const uz = -16.0 + i * 2.6;
      box(M.uld, at(13.8), F + 0.86, uz, 2.2, 1.72, 2.1);
      box(M.steelDark, at(13.8), F + 1.74, uz, 2.24, 0.1, 2.14);
      box(M.inoxDull, at(12.75), F + 0.86, uz, 0.08, 1.5, 1.8);
    }
    // Tug at the head of the train.
    box(M.paintYellow, at(13.6), F + 0.62, -31.4, 2.4, 0.72, 1.5);
    box(M.glass, at(13.9), F + 1.34, -31.4, 1.5, 0.72, 1.36);
    box(M.steelDark, at(13.6), F + 1.78, -31.4, 2.0, 0.12, 1.5);
    for (const wz of [-32.0, -30.8])
      for (const wx of [12.7, 14.5])
        shape(G.cyl, M.steelDark, at(wx), F + 0.3, wz, 0.6, 0.22, 0.6, { rz: Math.PI / 2 });
    // Safety bollards along the shed wall.
    for (let bz = -29; bz < -12; bz += 4.2) {
      shape(G.cylBase, M.hazard, at(11.2), F, bz, 0.2, 1.0, 0.2);
      shape(G.sphere, M.hazard, at(11.2), F + 1.0, bz, 0.2, 0.16, 0.2);
    }
  });
  // Service road hatching in front of the doors, and the yard's flood mast.
  slab(M.paintYellow, ...xs(11.4, 11.55), z0, z1, 0.001, 0.02);
  shape(G.cylBase, M.steelDark, at(16.5), F, -21.0, 0.3, 8.2, 0.3);
  box(M.steelDark, at(16.5), 8.35, -21.0, 1.9, 0.22, 0.7);
  box(M.lightBar, at(16.2), 8.2, -21.0, 1.5, 0.14, 0.5);
}
baggageMakeUp(1);
baggageMakeUp(-1);

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
  // Stanchions helper: heavy circular base, chrome post, belt housing.
  //
  // Collision footprints matter more than they look here, because the player
  // walks BETWEEN two of these lines. Body radius is 0.42, so each part stops
  // the player at 0.42 + its half-width:
  //   base 0.32 wide -> 0.58   post 0.065 -> 0.4525   cap 0.08 -> 0.46
  //   belt rail 0.10 wide -> 0.47
  // The rail is deliberately the WIDEST, so the player always meets the long
  // continuous box first and never reaches a post: a long box only ever pushes
  // perpendicular to itself, which slides you along the tape. The small square
  // parts push along whichever axis is shallowest, which — when that axis is
  // the way you are walking — cancels the walk speed every frame and reads as
  // the character refusing to move. The base is steppable() for the same
  // reason: at 3.5 cm it is a floor detail, not an obstacle.
  function stanchionPost(x, z) {
    steppable(() => shape(G.cylBase, M.steelDark, x, F, z, 0.32, 0.035, 0.32));
    shape(G.cylBase, M.steel, x, F + 0.035, z, 0.065, 0.90, 0.065);
    shape(G.cylBase, M.steelDark, x, F + 0.86, z, 0.08, 0.10, 0.08);
  }
  const BELT_W = 0.10;   // wider than every post part above — see note
  function stanchionLineX(x0, x1, z, postSpacing = 2.0) {
    const minX = Math.min(x0, x1), maxX = Math.max(x0, x1);
    const len = maxX - minX;
    if (len < 0.1) return;
    box(M.steelDark, (minX + maxX) / 2, F + 0.88, z, len, 0.045, BELT_W);
    const n = Math.max(2, Math.round(len / postSpacing) + 1);
    for (let i = 0; i < n; i++) {
      stanchionPost(minX + (i / (n - 1)) * len, z);
    }
  }
  function stanchionLineZ(x, z0, z1, postSpacing = 2.0) {
    const minZ = Math.min(z0, z1), maxZ = Math.max(z0, z1);
    const len = maxZ - minZ;
    if (len < 0.1) return;
    box(M.steelDark, x, F + 0.88, (minZ + maxZ) / 2, BELT_W, 0.045, len);
    const n = Math.max(2, Math.round(len / postSpacing) + 1);
    for (let i = 0; i < n; i++) {
      stanchionPost(x, minZ + (i / (n - 1)) * len);
    }
  }

  // Serpentine queue feeding the three screening lanes, running the full width
  // of the room the way a real checkpoint corral does: a short pen tucked in
  // one corner holds nobody and reads as a prop.
  //
  // Doorway is at z = -8.0; the aisle z = -7.6 to -5.9 stays clear so arrivals
  // can walk east along the room to the queue mouth at the far end.
  //   tape 1 (z = -5.9)  west wall → x = 9.4, mouth of the queue past its east end
  //   tape 2 (z = -4.2)  x = -9.4 → east wall, U-turn past its west end
  //   tape 3 (z = -2.5)  west wall → x = -8.4, stopping short of the Lane 1
  //                      WTMD arch (which spans x = -8.19 to -6.81) so the last
  //                      leg opens straight onto it instead of barring the way.
  // Flow: in at the east, west down lane A, U-turn at the west wall, east down
  // lane B, then out to whichever WTMD arch is free.
  //
  // Lanes are 1.7 m apart rather than the 1.4 m they used to be. With the belt
  // rail stopping a walker at 0.47 that leaves 0.76 m of side-to-side room for
  // the player's centre instead of 0.46 — the difference between a corridor
  // you can wander down and one you scrape along.
  //
  // Post spacing 3.4 m: the belt rail is one continuous collider whatever the
  // post count, so extra posts only cost broad-phase queries.
  // West boundary, closing the U-turn
  stanchionLineZ(-11.6, -5.9, -2.5, 1.7);
  // Tape 1 — south side, entry gap left at the east end (x > 9.4)
  stanchionLineX(-11.6, 9.4, -5.9, 3.4);
  // Tape 2 — middle divider, U-turn gap left at the west end (x < -9.4)
  stanchionLineX(-9.4, 11.6, -4.2, 3.4);
  // Tape 3 — north side, stops before the Lane 1 arch
  stanchionLineX(-11.6, -8.4, -2.5, 3.4);

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
  // Lane dividers on the screening line. The 2.4 m aisles between one
  // lane's X-ray and the next WTMD (and the west/east flanks) were a
  // walk-around that skipped the arch.
  {
    const lanes = [-7.5, -2.5, 2.5];
    const wtmdR = 0.69;
    const xrayL = lx => lx + 1.35 - 0.53;
    const xrayR = lx => lx + 1.35 + 0.53;
    const spans = [[-11.92, lanes[0] - wtmdR]];
    for (let i = 0; i < lanes.length; i++) {
      const lx = lanes[i];
      spans.push([lx + wtmdR, xrayL(lx)]);
      if (i + 1 < lanes.length) spans.push([xrayR(lx), lanes[i + 1] - wtmdR]);
    }
    spans.push([xrayR(lanes[lanes.length - 1]), 11.92]);
    const z0 = -1.08, z1 = -0.90;
    const zMid = (z0 + z1) / 2;
    for (const [x0, x1] of spans) {
      if (x1 - x0 < 0.04) continue;
      slab(M.glass, x0, x1, z0, z1, F, SEC_H);
      slab(M.steelDark, x0, x1, z0 - 0.02, z1 + 0.02, F, 0.14);
      box(M.steelDark, (x0 + x1) / 2, 1.04, zMid, x1 - x0, 0.04, 0.07);
      box(M.steelDark, x0, SEC_H / 2, zMid, 0.08, SEC_H, 0.10);
      box(M.steelDark, x1, SEC_H / 2, zMid, 0.08, SEC_H, 0.10);
      const n = Math.max(0, Math.round((x1 - x0) / 2.1));
      for (let i = 1; i <= n; i++) {
        const mx = x0 + (i / (n + 1)) * (x1 - x0);
        box(M.steelDark, mx, SEC_H / 2, zMid, 0.06, SEC_H, 0.08);
      }
    }
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
// Apron furniture: two walk-through jetways onto the parked planes, ground service
// Floors / ceilings stay out of prop() so the controller treats them as
// steppable slabs (prop floors eject the player from the corridor).
// ---------------------------------------------------------------------------
{
  const hw = GATE_OPEN_HW;
  const z0 = GATE_TUBE_Z0;
  const z1 = GATE_TUBE_Z1;
  // Segment count follows the shorter tube, so each ramp panel — and its
  // glass — stays close to its original ~1.15 m length instead of packing
  // more window-sized panels into less distance.
  const numSegs = Math.max(6, Math.round((z1 - z0) / 1.15));
  for (const gx of GATE_PLANE_X) {
    const tx = gateTubeX(gx);
    const dx = gateDoorX(gx);
    for (let i = 0; i < numSegs; i++) {
      const sz0 = z0 + (i / numSegs) * (z1 - z0);
      const sz1 = z0 + ((i + 1) / numSegs) * (z1 - z0);
      const szMid = (sz0 + sz1) / 2;
      const sLen = sz1 - sz0;
      const tMid = (szMid - z0) / (z1 - z0);
      const floorY = 0.05 + tMid * 3.00;
      const ceilY = floorY + 2.48;
      box(M.cabinCarpet, tx, floorY - 0.05, szMid, hw * 2 - 0.06, 0.10, sLen + 0.03);
      box(M.cabinCeiling, tx, ceilY + 0.05, szMid, hw * 2 - 0.06, 0.10, sLen + 0.03);
      box(M.lightBar, tx, ceilY - 0.03, szMid, 0.36, 0.03, sLen * 0.9);
    }
    // Cab deck stops short of the skin; the airliner's flush L1 plane covers
    // the last stride so the apron does not show between the player's feet.
    const cabZ0 = GATE_DOOR_Z - GATE_DOOR_HW - 0.20, cabZ1 = GATE_DOOR_Z + GATE_DOOR_HW + 0.20;
    const cabZMid = (cabZ0 + cabZ1) / 2;
    const cabLen = cabZ1 - cabZ0;
    // Stop the 10 cm slab on the tube side of the skin. Pushing it past dx
    // planted a vertical carpet face in L1 — the blue bar across the sill.
    const minX = tx - hw;
    const maxX = dx - 0.08;
    const cabW = maxX - minX;
    const cabXMid = (minX + maxX) / 2;
    box(M.cabinCarpet, cabXMid, 3.00, cabZMid, cabW, 0.10, cabLen);
    box(M.cabinCeiling, cabXMid, 5.52, cabZMid, cabW, 0.10, cabLen);
    box(M.lightBar, cabXMid, 5.45, cabZMid, 0.42, 0.03, cabLen * 0.85);

    // Support legs sit under the tube — not props, so they never occupy the aisle
    for (let i = 1; i < numSegs; i += 4) {
      const szMid = z0 + ((i + 0.5) / numSegs) * (z1 - z0);
      const tMid = (szMid - z0) / (z1 - z0);
      const floorY = 0.05 + tMid * 3.00;
      if (floorY < 0.7) continue;
      box(M.steelDark, tx - hw + 0.22, (floorY - 0.08) / 2, szMid, 0.22, floorY - 0.08, 0.22);
      box(M.steelDark, tx + hw - 0.22, (floorY - 0.08) / 2, szMid, 0.22, floorY - 0.08, 0.22);
    }
  }
}

prop(() => {
  const hw = GATE_OPEN_HW;
  const z0 = GATE_TUBE_Z0;
  const z1 = GATE_TUBE_Z1;
  // Segment count follows the shorter tube, so each ramp panel — and its
  // glass — stays close to its original ~1.15 m length instead of packing
  // more window-sized panels into less distance.
  const numSegs = Math.max(6, Math.round((z1 - z0) / 1.15));
  for (const gx of GATE_PLANE_X) {
    const tx = gateTubeX(gx);
    const dx = gateDoorX(gx);
    for (let i = 0; i < numSegs; i++) {
      const sz0 = z0 + (i / numSegs) * (z1 - z0);
      const sz1 = z0 + ((i + 1) / numSegs) * (z1 - z0);
      const szMid = (sz0 + sz1) / 2;
      const sLen = sz1 - sz0;
      const tMid = (szMid - z0) / (z1 - z0);
      const floorY = 0.05 + tMid * 3.00;
      const ceilY = floorY + 2.48;
      const wallH = ceilY - floorY;
      const wallMidY = (floorY + ceilY) / 2;
      for (const side of [-1, 1]) {
        // Drop the plane-side glass on the last bays — those panels sat
        // against L1 and read as cabin windows from inside the aircraft.
        const towardDoor = Math.sign(dx - tx) === side;
        if (towardDoor && i >= numSegs - 3) continue;
        const wx = tx + side * (hw - 0.05);
        box(M.steelDark, wx, floorY + 0.42, szMid, 0.09, 0.84, sLen);
        box(M.steelDark, wx, ceilY - 0.28, szMid, 0.09, 0.56, sLen);
        box(M.jetbridgeGlass, wx, floorY + 1.32, szMid, 0.035, 0.96, sLen - 0.06);
        box(M.steel, wx, wallMidY, sz0, 0.11, wallH, 0.10);
        box(M.steel, wx, floorY + 0.92, szMid, 0.05, 0.04, sLen); // handrail
      }
    }
    // The cab has to floor the whole aperture, or the last stride onto the
    // aircraft is taken over open air (groundFn holds the player up, but the
    // carpet stops short and you can see the apron between your feet).
    const cabZ0 = GATE_DOOR_Z - GATE_DOOR_HW - 0.20, cabZ1 = GATE_DOOR_Z + GATE_DOOR_HW + 0.20;
    const cabZMid = (cabZ0 + cabZ1) / 2;
    const cabLen = cabZ1 - cabZ0;
    const minX = Math.min(tx - hw, dx - 0.55);
    // Outer wall only on the long side — the cabin side stays open so the
    // player can step through L1.
    box(M.steelDark, minX + 0.05, 4.25, cabZMid, 0.10, 2.48, cabLen);
    box(M.jetbridgeGlass, minX + 0.08, 4.35, cabZMid, 0.03, 1.1, cabLen - 0.15);
    // End wall. Face one capsule radius past the door centreline (R=0.42 +
    // half the wall) so walking the tube stops square in the aperture.
    // Further forward the capsule overlaps the fuselage collider beside L1.
    const endX1 = dx - 0.12;
    const endZ = GATE_DOOR_Z + 0.47;
    box(M.steelDark, (minX + endX1) / 2, 4.25, endZ, endX1 - minX, 2.48, 0.10);
    // Accordion seals AROUND the aperture, clear of it.
    const bellowZ = GATE_DOOR_HW + 0.16;
    box(M.bellowsBlack, dx - 0.10, 4.18, GATE_DOOR_Z - bellowZ, 0.14, 2.22, 0.10);
    box(M.bellowsBlack, dx - 0.10, 4.18, GATE_DOOR_Z + bellowZ, 0.14, 2.22, 0.10);
    box(M.bellowsBlack, dx - 0.10, 5.28, GATE_DOOR_Z, 0.14, 0.14, bellowZ * 2);
  }
  // Baggage service equipment on the apron between and around stands
  frame(21.0, 52, 0.35, () => {
    box(M.steelDark, 0, 0.55, 0, 1.1, 0.5, 2.2);
    box(M.bag, 0, 1.0, -0.4, 0.8, 0.4, 0.8);
    box(M.bag2, 0, 1.0, 0.6, 0.8, 0.4, 0.8);
    box(M.steelDark, 0, 0.55, 3.0, 1.1, 0.5, 2.2);
    box(M.bag3, 0, 1.0, 3.0, 0.8, 0.4, 0.9);
  });
  frame(0.0, 50, 0.0, () => {
    box(M.paintYellow, 0, 0.6, 0, 1.2, 0.6, 3.4);
    box(M.steelDark, 0, 1.1, 1.2, 0.9, 0.35, 2.6);
  });
});

for (const gx of GATE_PLANE_X) {
  const tx = gateTubeX(gx);
  // Spaced as fractions of the ramp, not fixed metres — a shorter jetbridge
  // still gets three evenly-spread lamps instead of the last one landing
  // past the tube's own end.
  for (const t of [0.2, 0.5, 0.8]) {
    const z = GATE_TUBE_Z0 + t * (GATE_TUBE_Z1 - GATE_TUBE_Z0);
    roomLight(tx, 0.05 + t * 3.00 + 2.15, z, 0.85, 6.5);
  }
  roomLight(gateDoorX(gx), 5.05, GATE_DOOR_Z, 1.05, 5.5);
  // Cabin wash. Three dim lamps left the seat banks in silhouette — the fabric
  // never caught anything and a row read as one black block. Five, brighter and
  // reaching the full 23 m tube, put light on the cushions and the sidewalls.
  for (const dz of [-8, -1, 6]) roomLight(gx, 4.86, GATE_PLANE_Z + dz, 2.6, 13);
}

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

// Glass does not cast a shadow — but three's shadow pass writes depth for any
// mesh with castShadow set, transparency included, so the roof glazing would
// black out the hall it exists to light. Cleared here rather than in
// addInstancedPrimitive so the kit builder stays free of material special
// cases. Same for the hall's south facade and the lounge curtain wall: those
// are what the sun would otherwise be stopped by on the way in.
for (const im of world.children) {
  if (im.isInstancedMesh && (im.material === M.skylight || im.material === M.glass))
    im.castShadow = false;
}

// ---------------------------------------------------------------------------
// Airliners — A320-class proportions, with complete realistic walk-in interior
// ---------------------------------------------------------------------------
function buildAirliner(livery = 0xc8102e, name = 'PACIFIC', hasInterior = false, planePos = null) {
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

  // Fuselage cylinder — with a real L1 boarding cutout when the cabin is walk-in
  const doorZ = 6.9;
  const doorHalf = GATE_DOOR_HW;
  if (!hasInterior) {
    const fuse = new THREE.CylinderGeometry(2.0, 2.0, 28.5, 24);
    fuse.rotateX(Math.PI / 2);
    add(fuse, white, [0, 0, 0]);
  } else {
    // Open-ended, all three of them. A capped cylinder draws a solid disc at
    // each end, and the two either side of the door bay stood as full-height
    // walls straight across the cabin at row 1 — the aisle dead-ended there and
    // boarding meant walking through them.
    const aftLen = (doorZ - doorHalf) - (-14.25);
    const fwdLen = 14.25 - (doorZ + doorHalf);
    const fuseAft = new THREE.CylinderGeometry(2.0, 2.0, aftLen, 24, 1, true);
    fuseAft.rotateX(Math.PI / 2);
    add(fuseAft, white, [0, 0, -14.25 + aftLen / 2]);
    const fuseFwd = new THREE.CylinderGeometry(2.0, 2.0, fwdLen, 24, 1, true);
    fuseFwd.rotateX(Math.PI / 2);
    add(fuseFwd, white, [0, 0, 14.25 - fwdLen / 2]);
    // Door bay: a sector left out so the jetbridge opens into the cabin.
    // Cut from below floor (y = -0.50) up to door lintel (y = 1.60), matching
    // the full height and width of the L1 boarding entrance.
    const gap = 0.92;
    const bay = new THREE.CylinderGeometry(2.0, 2.0, doorHalf * 2, 24, 1, true,
      Math.PI / 2 + gap, Math.PI * 2 - gap * 2);
    bay.rotateX(Math.PI / 2);
    add(bay, white, [0, 0, doorZ]);
    // Cheeks of white skin either side of L1, so the vestibule reads as
    // fuselage rather than as the airbridge.
    add(new THREE.BoxGeometry(0.08, 2.4, 1.9), white, [1.98, 0.45, doorZ - doorHalf - 1.00]);
    add(new THREE.BoxGeometry(0.08, 2.4, 1.7), white, [1.98, 0.45, doorZ + doorHalf + 0.90]);
  }

  // Nose Ogive
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

  // Tailcone
  const tailc = new THREE.ConeGeometry(2.0, 6.4, 18);
  tailc.rotateX(-Math.PI / 2);
  add(tailc, white, [0, 0, -17.45]);
  add(new THREE.BoxGeometry(12.4, 0.55, 7.2), white, [0, -1.15, -0.6]);

  // Wings. A low-wing airliner carries its wing box UNDER the cabin floor, and
  // this one used to sit at mid-fuselage: the root ran 46 cm up through the
  // deck and laid two white slabs across the carpet and the aisle, right where
  // rows 6-9 should be. Dropped into the belly fairing (-1.13 … -0.58) so the
  // whole structure passes beneath the floor slab, which bottoms out at -0.60.
  // Proportioned so adjacent parked aircraft maintain clear stand separation.
  const wing = new THREE.BoxGeometry(1, 1, 1);
  add(wing, white, [4.5, -0.86, -0.6], [6.6, 0.32, 4.8], [0, 0.18, 0.03]);
  add(wing, white, [-4.5, -0.86, -0.6], [6.6, 0.32, 4.8], [0, -0.18, -0.03]);
  add(wing, white, [9.8, -0.78, -2.2], [6.0, 0.16, 2.8], [0, 0.26, 0.05]);
  add(wing, white, [-9.8, -0.78, -2.2], [6.0, 0.16, 2.8], [0, -0.28, -0.05]);

  // Winglets — seated on the outer panel's top edge
  add(new THREE.BoxGeometry(0.16, 1.6, 1.1), white, [12.6, 0.15, -3.6]);
  add(new THREE.BoxGeometry(0.16, 1.6, 1.1), white, [-12.6, 0.15, -3.6]);

  // Stabilizers & Vertical Fin
  add(new THREE.BoxGeometry(7.4, 0.18, 2.6), white, [0, 0.15, -17.6]);
  add(new THREE.BoxGeometry(0.28, 6.2, 3.6), paint, [0, 3.85, -16.6], null, [0, 0.12, 0]);
  add(new THREE.PlaneGeometry(1.4, 3.2), flash, [0.16, 4.1, -16.4], null, [0, Math.PI / 2, 0]);
  add(new THREE.PlaneGeometry(1.4, 3.2), flash, [-0.16, 4.1, -16.4], null, [0, -Math.PI / 2, 0]);

  // Stripe on the skin only — a box on the centreline went through the cabin.
  // On the starboard side, where L1 opens, the stripe still ran the full
  // 26 m uncut: the fuselage cylinder gets its door-shaped gap, but this was
  // a separate box that never inherited it, so it stood across the threshold
  // as a solid blue panel with nothing to collide against — the player just
  // walked through it. Split it around the same door span as the cylinder.
  if (hasInterior) {
    const sAft = (doorZ - doorHalf) - (-12.6);
    const sFwd = 13.4 - (doorZ + doorHalf);
    add(new THREE.BoxGeometry(0.05, 0.38, sAft), stripe, [2.02, -0.22, -12.6 + sAft / 2]);
    add(new THREE.BoxGeometry(0.05, 0.38, sFwd), stripe, [2.02, -0.22, 13.4 - sFwd / 2]);
  } else {
    add(new THREE.BoxGeometry(0.05, 0.38, 26), stripe, [2.02, -0.22, 0.4]);
  }
  add(new THREE.BoxGeometry(0.05, 0.38, 26), stripe, [-2.02, -0.22, 0.4]);
  add(new THREE.BoxGeometry(1.7, 0.5, 1.9), win, [0, 0.78, 16.55]); // Cockpit windscreen
  add(new THREE.PlaneGeometry(7.4, 0.85), decal, [2.03, -0.58, 1.6], null, [0, Math.PI / 2, 0]);
  add(new THREE.PlaneGeometry(7.4, 0.85), decal, [-2.03, -0.58, 1.6], null, [0, -Math.PI / 2, 0]);

  // Exterior Windows (hublots extérieurs)
  if (!hasInterior) {
    for (let i = 0; i < 18; i++) {
      if (i === 3 || i === 12) continue;
      const z = 10.4 - i * 1.18;
      add(new THREE.BoxGeometry(0.08, 0.28, 0.38), win, [1.99, 0.44, z]);
      add(new THREE.BoxGeometry(0.08, 0.28, 0.38), win, [-1.99, 0.44, z]);
    }
  }

  // Doors
  if (!hasInterior) {
    add(new THREE.BoxGeometry(0.06, 1.15, 0.7), dark, [2.0, 0.2, 6.9]);
    add(new THREE.BoxGeometry(0.06, 1.15, 0.7), dark, [-2.0, 0.2, 6.9]);
  } else {
    // Open Passenger Door L1 on starboard side (local x = 2.0, lz = 6.9) swung
    // open forward — parked clear of the 1.16 m opening rather than half across it
    add(new THREE.BoxGeometry(0.08, 1.95, 0.85), paint, [2.06, 0.20, 8.02], null, [0, 0.12, 0]);
    add(new THREE.BoxGeometry(0.06, 1.85, 0.75), M.cabinWall, [2.01, 0.20, 8.02], null, [0, 0.12, 0]);
    add(new THREE.BoxGeometry(0.02, 0.28, 0.18), M.glass, [2.02, 0.48, 8.02]);
    add(new THREE.BoxGeometry(0.12, 0.38, 0.65), dark, [1.95, -0.45, 8.02]); // Slide pack
    add(new THREE.BoxGeometry(0.04, 0.18, 0.04), M.steel, [1.98, 0.15, 7.72]); // Handle
    
    // Aft Door closed
    add(new THREE.BoxGeometry(0.06, 1.15, 0.7), dark, [-2.0, 0.2, 6.9]);
  }

  // Engines & Jet Exhaust — dropped with the wing so the nacelles still hang
  // under it instead of cutting through the spar, keeping ~0.7 m of apron
  // clearance under the fan cowl.
  for (const sx of [-1, 1]) {
    const eng = new THREE.CylinderGeometry(0.78, 0.92, 3.9, 16);
    eng.rotateX(Math.PI / 2);
    add(eng, grey, [sx * 5.2, -1.95, 0.35]);
    add(new THREE.CylinderGeometry(0.58, 0.58, 0.1, 16).rotateX(Math.PI / 2), intake, [sx * 5.2, -1.95, 2.28]);
    add(new THREE.CircleGeometry(0.56, 16), fan, [sx * 5.2, -1.95, 2.24], null, [0, 0, 0]);
    add(new THREE.TorusGeometry(0.84, 0.09, 8, 20), dark, [sx * 5.2, -1.95, 2.25]);
    add(new THREE.CylinderGeometry(0.62, 0.7, 0.45, 12).rotateX(Math.PI / 2), dark, [sx * 5.2, -1.95, -1.7]);
    add(new THREE.BoxGeometry(0.32, 0.9, 0.9), grey, [sx * 5.2, -1.30, 0.2]);   // pylon

    const thrust = new THREE.ConeGeometry(0.55, 3.2, 12);
    thrust.rotateX(-Math.PI / 2);
    add(thrust, M.thrustGlow, [sx * 5.2, -1.95, -3.6]);
  }

  // Aviation Lights
  add(new THREE.SphereGeometry(0.14, 8, 8), M.navRed, [-12.7, 0.15, -3.6]);
  add(new THREE.SphereGeometry(0.16, 8, 8), M.strobeWhite, [-12.7, 0.35, -3.6]);
  add(new THREE.SphereGeometry(0.14, 8, 8), M.navGreen, [12.7, 0.15, -3.6]);
  add(new THREE.SphereGeometry(0.16, 8, 8), M.strobeWhite, [12.7, 0.35, -3.6]);
  add(new THREE.SphereGeometry(0.16, 8, 8), M.strobeWhite, [0, 0.25, -20.65]);
  add(new THREE.SphereGeometry(0.18, 8, 8), M.beaconRed, [0, 2.08, 1.8]);
  add(new THREE.SphereGeometry(0.18, 8, 8), M.beaconRed, [0, -2.08, 1.8]);

  // Landing Gear
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

  // -------------------------------------------------------------------------
  // Walk-in cabin: punched hublots, 3-3 seats, clear centre aisle
  // -------------------------------------------------------------------------
  if (hasInterior) {
    const ROW_N = 12;
    const rowZ = gateRowZ;
    const WIN_HW = 0.21;
    const WIN_Y0 = 0.48;
    const WIN_Y1 = 0.98;
    const WALL_Y0 = -0.50;
    const FLOOR_Y = -0.50;
    // Centre of the seat cushion pad. Its top lands 0.445 m over the deck,
    // which is what an economy seat actually measures — at the 0.365 it used to
    // sit at, a seated passenger's shin was longer than the drop to the floor
    // and the leg fitter straightened the knee to compensate, laying everyone
    // out with their feet across the aisle.
    const SEAT_CUSHION_Y = FLOOR_Y + GATE_SEAT_RISE;
    const WALL_Y1 = 1.66;
    const DOOR_TOP = 1.58; // above the standing capsule (head ~1.20 local)
    const WALL_X = 1.86;
    const Z_AFT = -11.50;
    const Z_FWD = 11.20;

    // Deck at exactly -0.50: that is the height the seat legs, the sill and the
    // groundFn all assume. Centred on -0.50 instead, the carpet stood 5 cm proud
    // of it and the player walked shin-deep in the pile.
    // Deck split around L1: a single 3.68 m slab put its 10 cm starboard
    // face in the doorway. Vestibule volume stays on the aisle side; a
    // flush plane covers the sill so there is carpet underfoot and no bar.
    {
      const d0 = doorZ - doorHalf, d1 = doorZ + doorHalf;
      const aft0 = Z_AFT - 0.15, fwd1 = Z_FWD + 0.15;
      add(new THREE.BoxGeometry(3.68, 0.10, d0 - aft0), M.cabinCarpet, [0, -0.55, (aft0 + d0) / 2]);
      add(new THREE.BoxGeometry(3.68, 0.10, fwd1 - d1), M.cabinCarpet, [0, -0.55, (d1 + fwd1) / 2]);
      add(new THREE.BoxGeometry(2.90, 0.10, d1 - d0 + 0.10), M.cabinCarpet, [-0.39, -0.55, doorZ]);
      add(new THREE.PlaneGeometry(1.20, d1 - d0 + 0.28), M.cabinCarpet, [1.55, FLOOR_Y + 0.004, doorZ], null, [-Math.PI / 2, 0, 0]);
      add(new THREE.PlaneGeometry(0.28, 0.90), M.gold, [1.96, FLOOR_Y + 0.006, doorZ], null, [-Math.PI / 2, 0, 0]);
    }
    // Flat decals — a 2 cm box here sat in the player's shins.
    add(new THREE.PlaneGeometry(0.04, 23.2), M.taxiwayLightGreen, [0.38, FLOOR_Y + 0.003, 0], null, [-Math.PI / 2, 0, 0]);
    add(new THREE.PlaneGeometry(0.04, 23.2), M.taxiwayLightGreen, [-0.38, FLOOR_Y + 0.003, 0], null, [-Math.PI / 2, 0, 0]);

    add(new THREE.BoxGeometry(2.55, 0.07, 23.5), M.cabinCeiling, [0, 1.66, 0]);
    add(new THREE.BoxGeometry(0.38, 0.025, 23.4), M.lightBar, [0, 1.625, 0]);
    add(new THREE.BoxGeometry(0.05, 0.02, 23.4), M.accent, [1.18, 1.60, 0]);
    add(new THREE.BoxGeometry(0.05, 0.02, 23.4), M.accent, [-1.18, 1.60, 0]);

    const addWallSpan = (x, y0, y1, z0, z1) => {
      const len = z1 - z0;
      if (len < 0.04) return;
      add(new THREE.BoxGeometry(0.07, y1 - y0, len), M.cabinWall, [x, (y0 + y1) / 2, (z0 + z1) / 2]);
    };
    const buildSide = (side) => {
      const x = side * WALL_X;
      const holes = [];
      // No hublots in the L1 vestibule — that wall is fuselage lining.
      for (let r = 0; r < ROW_N; r++) {
        const z = rowZ(r);
        if (side > 0 && z > doorZ - 2.6) continue;
        holes.push({ z, hw: WIN_HW });
      }
      if (side > 0) holes.push({ z: doorZ, hw: doorHalf });
      holes.sort((a, b) => a.z - b.z);
      // Dado / sill — skip the door (goes to the floor)
      let cursor = Z_AFT;
      for (const h of holes) {
        const isDoor = side > 0 && Math.abs(h.z - doorZ) < 0.05;
        if (!isDoor) addWallSpan(x, WALL_Y0, WIN_Y0, cursor, h.z - h.hw);
        else addWallSpan(x, WALL_Y0, WALL_Y1, cursor, h.z - h.hw);
        cursor = h.z + h.hw;
      }
      addWallSpan(x, WALL_Y0, WIN_Y0, cursor, Z_FWD);
      // Window lintel — split around L1 so it does not cut the doorway at head height
      if (side > 0) {
        addWallSpan(x, WIN_Y1, WALL_Y1, Z_AFT, doorZ - doorHalf);
        addWallSpan(x, DOOR_TOP, WALL_Y1, doorZ - doorHalf, doorZ + doorHalf);
        addWallSpan(x, WIN_Y1, WALL_Y1, doorZ + doorHalf, Z_FWD);
      } else {
        addWallSpan(x, WIN_Y1, WALL_Y1, Z_AFT, Z_FWD);
      }
      cursor = Z_AFT;
      for (const h of holes) {
        const isDoor = side > 0 && Math.abs(h.z - doorZ) < 0.05;
        if (!isDoor) addWallSpan(x, WIN_Y0, WIN_Y1, cursor, h.z - h.hw);
        cursor = h.z + h.hw;
      }
      addWallSpan(x, WIN_Y0, WIN_Y1, cursor, Z_FWD);
    };
    buildSide(1);
    buildSide(-1);
    // Extra starboard lining around L1 so the jetbridge bays cannot peek in.
    add(new THREE.BoxGeometry(0.10, 2.16, 2.05), M.cabinWall, [WALL_X, 0.58, doorZ - doorHalf - 1.08]);
    add(new THREE.BoxGeometry(0.10, 2.16, 1.85), M.cabinWall, [WALL_X, 0.58, doorZ + doorHalf + 0.98]);
    add(new THREE.BoxGeometry(0.10, 0.18, doorHalf * 2 + 0.16), M.cabinWall, [WALL_X, DOOR_TOP + 0.08, doorZ]);

    // Bins sit under the ceiling (bottom ≈ 1.42 local / 4.97 m world) so a
    // standing player clears them. Starboard run is split around L1.
    {
      const binY = 1.54, binH = 0.22, binX = 1.32;
      const d0 = doorZ - doorHalf, d1 = doorZ + doorHalf;
      const aftLen = d0 - Z_AFT, fwdLen = Z_FWD - d1;
      add(new THREE.BoxGeometry(0.56, binH, aftLen), M.cabinWall, [binX, binY, Z_AFT + aftLen / 2], null, [0, 0, 0.05]);
      add(new THREE.BoxGeometry(0.56, binH, fwdLen), M.cabinWall, [binX, binY, d1 + fwdLen / 2], null, [0, 0, 0.05]);
      add(new THREE.BoxGeometry(0.56, binH, Z_FWD - Z_AFT), M.cabinWall, [-binX, binY, 0], null, [0, 0, -0.05]);
    }

    for (let r = 0; r < ROW_N; r++) {
      const zr = rowZ(r);
      add(new THREE.BoxGeometry(0.035, 0.06, 0.14), M.steel, [1.04, 1.52, zr]);
      add(new THREE.BoxGeometry(0.035, 0.06, 0.14), M.steel, [-1.04, 1.52, zr]);
      add(new THREE.BoxGeometry(0.10, 0.016, 0.10), M.lightBar, [1.28, 1.42, zr]);
      add(new THREE.BoxGeometry(0.10, 0.016, 0.10), M.lightBar, [-1.28, 1.42, zr]);

      // Hublot reveal + clear pane + exterior glass, aligned on the seat row
      for (const sx of [1, -1]) {
        if (sx > 0 && zr > doorZ - 2.6) continue;
        const midY = (WIN_Y0 + WIN_Y1) / 2;
        const winH = WIN_Y1 - WIN_Y0;
        add(new THREE.BoxGeometry(0.05, winH + 0.04, 0.04), M.windowFrame, [sx * 1.88, midY, zr - WIN_HW - 0.02]);
        add(new THREE.BoxGeometry(0.05, winH + 0.04, 0.04), M.windowFrame, [sx * 1.88, midY, zr + WIN_HW + 0.02]);
        add(new THREE.BoxGeometry(0.05, 0.04, WIN_HW * 2 + 0.04), M.windowFrame, [sx * 1.88, WIN_Y0 + 0.01, zr]);
        add(new THREE.BoxGeometry(0.05, 0.04, WIN_HW * 2 + 0.04), M.windowFrame, [sx * 1.88, WIN_Y1 - 0.01, zr]);
        add(new THREE.BoxGeometry(0.014, winH - 0.06, WIN_HW * 2 - 0.04), M.hublotGlass, [sx * 1.91, midY, zr]);
        add(new THREE.BoxGeometry(0.03, winH - 0.10, WIN_HW * 2 - 0.02), M.hublotGlass, [sx * 1.995, midY, zr]);
      }
    }

    add(new THREE.BoxGeometry(3.7, 2.2, 0.12), M.cabinWall, [0, 0.60, 11.2]);
    add(new THREE.BoxGeometry(0.88, 1.92, 0.14), M.steelDark, [0, 0.48, 11.2]);
    add(new THREE.BoxGeometry(0.12, 0.18, 0.16), M.gold, [0.34, 0.48, 11.14]);
    add(new THREE.PlaneGeometry(1.55, 0.32), decal, [0, 1.52, 11.12], null, [0, Math.PI, 0]);

    // Galley and lav stay against the sidewall — the old 1.18 m boxes ate the
    // aisle and read as a concrete block in the first rows.
    add(new THREE.BoxGeometry(0.68, 0.92, 1.70), M.trolleyAlum, [-1.50, -0.04, 9.40]);
    add(new THREE.BoxGeometry(0.68, 0.05, 1.70), M.steelDark, [-1.50, 0.44, 9.40]);
    add(new THREE.BoxGeometry(0.28, 0.86, 0.72), M.trolleyAlum, [-1.58, -0.07, 8.20]);
    add(new THREE.BoxGeometry(0.28, 0.86, 0.72), M.trolleyRed, [-1.28, -0.07, 8.20]);
    add(new THREE.BoxGeometry(0.28, 0.30, 0.38), M.steelDark, [-1.50, 0.64, 9.55]);
    add(new THREE.CylinderGeometry(0.055, 0.055, 0.12, 8), M.steel, [-1.50, 0.55, 9.30]);

    add(new THREE.PlaneGeometry(0.52, 0.16), M.exitSignMat, [1.78, 1.42, 6.9], null, [0, -Math.PI / 2, 0]);

    add(new THREE.BoxGeometry(3.7, 2.2, 0.12), M.cabinWall, [0, 0.60, -11.5]);
    add(new THREE.PlaneGeometry(0.52, 0.16), M.exitSignMat, [0, 1.42, -11.42]);

    const roundedPad = (w, d, thick, radius) => {
      const hw = w / 2, hd = d / 2;
      const rr = Math.min(radius, hw - 0.002, hd - 0.002);
      const sh = new THREE.Shape();
      sh.moveTo(-hw + rr, -hd);
      sh.lineTo(hw - rr, -hd);
      sh.quadraticCurveTo(hw, -hd, hw, -hd + rr);
      sh.lineTo(hw, hd - rr);
      sh.quadraticCurveTo(hw, hd, hw - rr, hd);
      sh.lineTo(-hw + rr, hd);
      sh.quadraticCurveTo(-hw, hd, -hw, hd - rr);
      sh.lineTo(-hw, -hd + rr);
      sh.quadraticCurveTo(-hw, -hd, -hw + rr, -hd);
      const g = new THREE.ExtrudeGeometry(sh, {
        depth: thick,
        bevelEnabled: true,
        bevelThickness: Math.min(0.013, thick * 0.38),
        bevelSize: Math.min(0.015, rr * 0.5),
        bevelSegments: 3,
        curveSegments: 8,
      });
      g.rotateX(-Math.PI / 2);
      // Extrusion depth lands at z ∈ [0, thick]; rotateX(-90°) carries that to
      // y ∈ [0, thick]. Centring it on the local origin takes -thick/2, not
      // +thick/2 — the sign that was here shifted every pad's true centre a
      // full `thick` above the y each add() call actually asked for, and
      // since every pad in this seat uses a different thickness, they drifted
      // out of registration with each other instead of drifting together:
      // the backrest shell floated clear of its own cushion and fabric.
      g.translate(0, -thick / 2, 0);
      g.computeVertexNormals();
      return g;
    };
    // roundedPad lays its second dimension flat along Z — right for a cushion
    // or a bolster, lying on the seat pan with depth running fore-aft. A
    // backrest is the opposite shape: upright, with its second dimension
    // running vertically and only a thin skin along Z. Feeding roundedPad's
    // (w, d, thick) as (width, height, thickness) — the way a BoxGeometry
    // call reads those three numbers — silently swapped them: a 0.58 m
    // backrest became 5.5 cm tall and 58 cm deep, standing out over the row
    // behind like a tray table instead of standing up behind the sitter.
    // roundedPanel keeps the same rounded-rect cross-section but extrudes it
    // upright to begin with, so (w, h, thick) means what it says.
    const roundedPanel = (w, h, thick, radius) => {
      const hw = w / 2, hh = h / 2;
      const rr = Math.min(radius, hw - 0.002, hh - 0.002);
      const sh = new THREE.Shape();
      sh.moveTo(-hw + rr, -hh);
      sh.lineTo(hw - rr, -hh);
      sh.quadraticCurveTo(hw, -hh, hw, -hh + rr);
      sh.lineTo(hw, hh - rr);
      sh.quadraticCurveTo(hw, hh, hw - rr, hh);
      sh.lineTo(-hw + rr, hh);
      sh.quadraticCurveTo(-hw, hh, -hw, hh - rr);
      sh.lineTo(-hw, -hh + rr);
      sh.quadraticCurveTo(-hw, -hh, -hw + rr, -hh);
      const g = new THREE.ExtrudeGeometry(sh, {
        depth: thick,
        bevelEnabled: true,
        bevelThickness: Math.min(0.013, thick * 0.38),
        bevelSize: Math.min(0.015, rr * 0.5),
        bevelSegments: 3,
        curveSegments: 8,
      });
      g.translate(0, 0, -thick / 2);   // centre the thin (Z) face on the local origin
      g.computeVertexNormals();
      return g;
    };
    // 2+2: a 3.7 m cabin cannot fit 3-across seats wide enough for these
    // characters. Two 64 cm chairs per side leave a walkable aisle.
    const SEAT_WIN = 1.48;
    const SEAT_PITCH = 0.74;
    const geoCushion = roundedPad(0.64, 0.48, 0.07, 0.09);
    const geoPan = roundedPad(0.66, 0.50, 0.03, 0.085);
    const geoLip = roundedPad(0.60, 0.12, 0.055, 0.055);
    const geoBack = roundedPanel(0.62, 0.60, 0.06, 0.08);
    const geoBackShell = roundedPanel(0.65, 0.64, 0.032, 0.08);
    const geoHead = roundedPanel(0.48, 0.16, 0.065, 0.07);
    const geoWing = roundedPanel(0.09, 0.15, 0.08, 0.035);
    const geoBolster = roundedPad(0.07, 0.40, 0.10, 0.03);
    const geoArm = new THREE.CylinderGeometry(0.018, 0.02, 0.36, 8);
    geoArm.rotateZ(Math.PI / 2);
    geoArm.rotateY(Math.PI / 2);

    for (let r = 0; r < ROW_N; r++) {
      const zr = rowZ(r);
      for (const sx of [1, -1]) {
        for (let s = 0; s < 2; s++) {
          const lx = sx * (SEAT_WIN - s * SEAT_PITCH);
          const cy = SEAT_CUSHION_Y;
          add(geoPan, M.seatShell, [lx, cy - 0.08, zr]);
          add(geoCushion, M.seatNavy, [lx, cy - 0.035, zr]);
          add(geoLip, M.seatNavy, [lx, cy - 0.01, zr + 0.19]);
          add(geoBolster, M.seatNavy, [lx - 0.26, cy + 0.025, zr - 0.02]);
          add(geoBolster, M.seatNavy, [lx + 0.26, cy + 0.025, zr - 0.02]);
          add(geoBackShell, M.seatShell, [lx, cy + 0.24, zr - 0.24], null, [-0.16, 0, 0]);
          add(geoBack, M.seatNavy, [lx, cy + 0.22, zr - 0.19], null, [-0.16, 0, 0]);
          add(geoHead, M.seatHeadrest, [lx, cy + 0.55, zr - 0.21], null, [-0.16, 0, 0]);
          add(geoWing, M.seatHeadrest, [lx - 0.22, cy + 0.54, zr - 0.19], null, [-0.16, 0, 0]);
          add(geoWing, M.seatHeadrest, [lx + 0.22, cy + 0.54, zr - 0.19], null, [-0.16, 0, 0]);
          add(new THREE.BoxGeometry(0.36, 0.12, 0.012), M.seatCover, [lx, cy + 0.57, zr - 0.155], null, [-0.16, 0, 0]);
          add(new THREE.BoxGeometry(0.36, 0.17, 0.01), M.seatIfe, [lx, cy + 0.28, zr - 0.262]);
          add(new THREE.BoxGeometry(0.38, 0.01, 0.018), M.seatShell, [lx, cy + 0.16, zr - 0.266]);
          add(new THREE.BoxGeometry(0.04, 0.018, 0.016), M.steel, [lx, cy + 0.18, zr - 0.27]);
          add(new THREE.BoxGeometry(0.40, 0.15, 0.025), M.seatNavy, [lx, cy - 0.01, zr - 0.255]);
          add(new THREE.PlaneGeometry(0.12, 0.15), M.safetyCardMat, [lx, cy + 0.02, zr - 0.272], null, [0, Math.PI, 0]);
          add(new THREE.BoxGeometry(0.18, 0.01, 0.045), M.seatBelt, [lx - 0.14, cy + 0.01, zr + 0.02]);
          add(new THREE.BoxGeometry(0.18, 0.01, 0.045), M.seatBelt, [lx + 0.14, cy + 0.01, zr + 0.02]);
          add(new THREE.BoxGeometry(0.09, 0.024, 0.05), M.steel, [lx, cy + 0.018, zr + 0.02]);
        }
        for (let s = 0; s < 3; s++) {
          const ax = sx * (1.82 - s * 0.68);
          add(geoArm, M.seatShell, [ax, SEAT_CUSHION_Y + 0.11, zr - 0.02]);
          add(new THREE.CylinderGeometry(0.016, 0.016, 0.09, 8), M.seatShell, [ax, SEAT_CUSHION_Y + 0.05, zr - 0.14]);
        }
        const legTop = SEAT_CUSHION_Y - 0.13;
        add(new THREE.CylinderGeometry(0.014, 0.016, legTop - FLOOR_Y, 8), M.steelDark, [sx * 1.42, (legTop + FLOOR_Y) / 2, zr]);
        add(new THREE.CylinderGeometry(0.014, 0.016, legTop - FLOOR_Y, 8), M.steelDark, [sx * 0.82, (legTop + FLOOR_Y) / 2, zr]);
        add(new THREE.BoxGeometry(0.78, 0.016, 0.035), M.steelDark, [sx * 1.12, FLOOR_Y + 0.006, zr]);
      }

      // Trigger sits in the aisle at this row. Seat-bank colliders keep the
      // player off the cushion, so a window-centred trigger could never fire.
      // keepLock: walking the aisle must not drop pointer-lock every row.
      if (planePos) {
        const { px, py, pz, pyaw } = planePos;
        const c = Math.cos(pyaw), s = Math.sin(pyaw);
        const sitY = py - 0.50 + GATE_SEAT_RISE - 0.045;
        const floorY = py - 0.50;
        const faceNose = Math.PI;
        const rowWz = pz - zr; // yaw π: world z = pz - local z
        for (const spec of [
          { lx: SEAT_WIN, label: r === 1
            ? "S'asseoir — hublot, vue passerelle  (E)" : `S'asseoir — hublot ${r + 1}A  (E)` },
          { lx: -SEAT_WIN, label: r === 1
            ? "S'asseoir — hublot, vue piste  (E)" : `S'asseoir — hublot ${r + 1}F, vue piste  (E)` },
        ]) {
          const wx = px + spec.lx * c + zr * s;
          const wz = pz - spec.lx * s + zr * c;
          furnitureInteractions.push({
            type: 'sit',
            x: wx, y: sitY, z: wz,
            centerX: px - spec.lx * 0.12, centerZ: rowWz,
            approachY: floorY,
            yaw: faceNose,
            halfWidth: 0.40, halfDepth: 0.36,
            triggerDistance: 0.14,
            keepLock: true,
            occupied: false,
            label: spec.label,
            isPlaneSeat: true,
          });
        }
      }
    }
  }

  root.userData.length = 38;
  return root;
}

const planes = [];
function placePlane(livery, x, y, z, yaw, name, hasInterior = false) {
  const p = buildAirliner(livery, name, hasInterior, hasInterior ? { px: x, py: y, pz: z, pyaw: yaw } : null);
  p.position.set(x, y, z);
  p.rotation.y = yaw;
  airside.add(p);
  planes.push(p);
  return p;
}
const parked = placePlane(0x1a4a8a, GATE_PLANE_X[1], GATE_PLANE_Y, GATE_PLANE_Z, Math.PI, 'PACIFIC', true);
placePlane(0x0a6a4a, GATE_PLANE_X[0], GATE_PLANE_Y, GATE_PLANE_Z, Math.PI, 'AERO NORD', true);
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
  // Cornea is mode 3 (clear shell). Without this it renders as an opaque
  // white ball and hides the iris.
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
// 12 m cells instead of the open-city default of 100: the terminal is a
// self-contained ~50x100 m interior, smaller than one default cell, so every
// broad-phase query was returning almost the whole map (~1500 of 3272 AABBs
// for a 3 m radius) instead of what's actually nearby.
const bw = buildCityBoxes(world, 12);
{
  // Invisible AABBs — never instanced into the scene (those drew as grey
  // slabs through the seats). Shell keeps the player in the tube; seat banks
  // block cutting through a row.
  const push = (x0, y0, z0, x1, y1, z1, prop = true) => {
    bw.add({ x0, y0, z0, x1, y1, z1, collide: true, tall: y1 - y0 > 9, prop });
  };
  const boxAt = (x, y, z, sx, sy, sz, prop = true) => {
    push(x - sx / 2, y - sy / 2, z - sz / 2, x + sx / 2, y + sy / 2, z + sz / 2, prop);
  };
  for (const gx of GATE_PLANE_X) {
    const xStar = gx - GATE_FUSE_R + 0.16;
    const xPort = gx + GATE_FUSE_R - 0.16;
    const zFwd = GATE_PLANE_Z - 11.15;
    const zAft = GATE_PLANE_Z + 11.45;
    const door0 = GATE_DOOR_Z - GATE_DOOR_HW - 0.22;
    const door1 = GATE_DOOR_Z + GATE_DOOR_HW + 0.22;
    boxAt(xPort, 4.15, (zFwd + zAft) / 2, 0.10, 2.2, zAft - zFwd);
    const aftLen = door0 - zFwd;
    const fwdLen = zAft - door1;
    if (aftLen > 0.3) boxAt(xStar, 4.15, zFwd + aftLen / 2, 0.10, 2.2, aftLen);
    if (fwdLen > 0.3) boxAt(xStar, 4.15, door1 + fwdLen / 2, 0.10, 2.2, fwdLen);
    boxAt(gx, 4.15, zFwd, 3.7, 2.2, 0.12);
    boxAt(gx, 4.15, zAft, 3.7, 2.2, 0.12);
    for (let r = 0; r < 12; r++) {
      const wz = GATE_PLANE_Z - gateRowZ(r);
      for (const sx of [1, -1]) {
        boxAt(gx - sx * 1.11, GATE_CABIN_FLOOR_Y + 0.52, wz, 1.38, 1.04, 0.52);
      }
    }
  }
}
let player = null;
function jetbridgeFloorY(z) {
  const t = THREE.MathUtils.clamp((z - (GATE_TUBE_Z0 - 0.2)) / (GATE_TUBE_Z1 - (GATE_TUBE_Z0 - 0.2)), 0, 1);
  return 0.05 + t * 3.00;
}
function onCabinDeck(gx, x, z) {
  const lx = gx - x;
  const lz = GATE_PLANE_Z - z;
  return Math.abs(lx) <= 1.90 && lz >= -11.40 && lz <= 11.15;
}
function onJetbridgeDeck(gx, x, z) {
  const tx = gateTubeX(gx);
  const dx = gateDoorX(gx);
  if (z >= GATE_TUBE_Z0 - 0.25 && z <= GATE_TUBE_Z1 + 0.05 && Math.abs(x - tx) <= 1.18) return true;
  if (z >= GATE_DOOR_Z - GATE_DOOR_HW - 0.35 && z <= GATE_DOOR_Z + GATE_DOOR_HW + 0.35) {
    const lo = Math.min(tx - 1.25, dx - 0.60);
    const hi = Math.max(tx + 0.50, dx + 0.80);
    if (x >= lo && x <= hi) return true;
  }
  return false;
}
function groundFn(x, z, yFrom, feetY) {
  for (const gx of GATE_PLANE_X) {
    if (onCabinDeck(gx, x, z)) return 3.05;
    if (onJetbridgeDeck(gx, x, z)) return jetbridgeFloorY(z);
  }
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
const arrivedFromJapan = params.get('arrival') === 'japan';
const spawnPoint = (arrivedFromLA || arrivedFromJapan)
  ? new THREE.Vector3(AIR_TRAVEL_CAR.x + 1.8, 1.4, AIR_TRAVEL_CAR.z + 0.6)
  : new THREE.Vector3(0, 1.4, -35.5);
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
  console.warn('[airport] player character load issue:', e);
}

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
// Pulled in from ±18: the check-in queue tapes now stand at ±18.8, and a
// walker tracking the old loop clipped straight through them.
const HALL_LOOP = [[-16.4, -28.6], [16.4, -28.6], [16.4, -11], [-16.4, -11]];
const HALL_AISLE = [[-1.4, -29], [1.4, -29], [1.4, -10], [-1.4, -10]];
const SEC_QUEUE = [
  [-7.0, -14.0], // Check-in hall: walking north towards security
  [-7.0, -8.5],  // Approaching portal under the SECURITY sign
  [-6.0, -6.6],  // Stepping through portal into the security vestibule
  [8.8, -6.5],   // East along the entry aisle, south of the first tape
  [10.5, -6.6],  // Round the east end of tape 1 into the queue mouth
  [10.5, -5.05], // Entering lane A, down its centreline
  [-10.5, -5.05],// The whole run west along lane A
  [-10.5, -3.35],// U-turn at the west wall, past the end of tape 2
  [-7.9, -3.35], // Back east along lane B
  [-7.9, -2.0],  // Leaving the corral past the end of tape 3
  [-7.5, -1.8],  // Lining up at Lane 1 metal detector
  [-7.5, -0.2],  // Walking under the metal detector arch!
  [-7.5, 1.2],   // Airside of the glass, still in the lane
  [-7.5, 5.0],   // Through the Lane 1 glass door into the concourse
  [-7.5, 14.0],  // Walking towards boarding gates
  [0.0, 18.0],   // Strolling near central lounge
  [-4.0, 14.0],  // Concourse west side
  [-7.5, 5.0],   // Returning to the Lane 1 door
  [-7.5, 1.2],   // Back through the glass
  [-7.5, -1.8],  // South through the metal detector
  [-5.0, -7.5],  // Exiting security back through portal into hall
];
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
    [SEC_QUEUE, 2, 1], [SEC_QUEUE, 56, 1],
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
    // Check-in agents, in the aisle between the counters and the back wall,
    // each turned to face the queue side of their own desk.
    { x: -23.05, z: chkDeskZ(0), ry: Math.PI / 2, staff: true },
    { x: -23.05, z: chkDeskZ(2), ry: Math.PI / 2, staff: true },
    { x: -23.05, z: chkDeskZ(4), ry: Math.PI / 2, staff: true },
    { x: -23.05, z: chkDeskZ(6), ry: Math.PI / 2, staff: true },
    { x: 23.05, z: chkDeskZ(1), ry: -Math.PI / 2, staff: true },
    { x: 23.05, z: chkDeskZ(3), ry: -Math.PI / 2, staff: true },
    { x: 23.05, z: chkDeskZ(5), ry: -Math.PI / 2, staff: true },
    { x: 23.05, z: chkDeskZ(6), ry: -Math.PI / 2, staff: true },

    // Passengers at the counter face, and queue extending all the way to the back of the hall
    // West bank (counters x = -21.4, queue x = -19.65):
    { x: -21.4, z: chkDeskZ(0) - 0.3, ry: -Math.PI / 2 },
    { x: -21.4, z: chkDeskZ(2) + 0.1, ry: -Math.PI / 2 },
    { x: -21.4, z: chkDeskZ(4) + 0.2, ry: -Math.PI / 2 },
    { x: -21.4, z: chkDeskZ(6) - 0.2, ry: -Math.PI / 2 },
    { x: -19.65, z: -27.6, ry: 0 },
    { x: -19.65, z: -24.8, ry: 0.1 },
    { x: -19.65, z: -22.0, ry: -0.06 },
    { x: -19.65, z: -19.2, ry: 0.08 },
    { x: -19.65, z: -16.4, ry: 0 },
    { x: -19.65, z: -13.6, ry: -0.1 },

    // East bank (counters x = 21.4, queue x = 19.65):
    { x: 21.4, z: chkDeskZ(1) - 0.2, ry: Math.PI / 2 },
    { x: 21.4, z: chkDeskZ(3) + 0.2, ry: Math.PI / 2 },
    { x: 21.4, z: chkDeskZ(5) + 0.3, ry: Math.PI / 2 },
    { x: 21.4, z: chkDeskZ(6) - 0.1, ry: Math.PI / 2 },
    { x: 19.65, z: -27.6, ry: 0 },
    { x: 19.65, z: -24.8, ry: -0.08 },
    { x: 19.65, z: -22.0, ry: 0.12 },
    { x: 19.65, z: -19.2, ry: -0.05 },
    { x: 19.65, z: -16.4, ry: 0.06 },
    { x: 19.65, z: -13.6, ry: 0 },
    // At the self-service kiosks, tagging their own bags
    { x: -9.6, z: -28.0, ry: 0 }, { x: -7.4, z: -23.4, ry: 0 },
    { x: 8.2, z: -28.0, ry: 0 }, { x: 9.9, z: -23.4, ry: 0 },
    // Passengers queuing in the security corral. Lane A (z = -5.05) walks
    // west, lane B (z = -3.35) walks back east, so the two rows face opposite
    // ways. Slight z-jitter keeps them off the exact centreline.
    { x: 7.6, z: -5.0, ry: -Math.PI / 2 },
    { x: 4.6, z: -5.15, ry: -Math.PI / 2 },
    { x: 2.2, z: -4.95, ry: -Math.PI / 2 },
    { x: -1.8, z: -5.1, ry: -Math.PI / 2 },
    { x: -5.4, z: -5.0, ry: -Math.PI / 2 },
    { x: -9.2, z: -5.1, ry: -Math.PI / 2 },
    { x: -10.4, z: -3.3, ry: Math.PI / 2 },
    { x: -9.0, z: -3.4, ry: Math.PI / 2 },
    // reading the departures board
    { x: 7, z: -10.6, ry: 0 }, { x: 10.4, z: -11.0, ry: 0.2 },
    // security officers
    { x: -0.5, z: 0.6, ry: Math.PI, staff: true },
    // at the queue mouth, facing the aisle the arrivals walk down
    { x: 10.4, z: -6.5, ry: -Math.PI / 2, staff: true },
    // café: barista behind the counter, customers at it
    { x: -22.5, z: 9, ry: Math.PI / 2, staff: true },
    { x: -20.2, z: 7.2, ry: -Math.PI / 2 }, { x: -20.2, z: 10.8, ry: -Math.PI / 2 },
    // shop: clerk at the till, browsers in the aisles
    { x: 13.4, z: 2.7, ry: 0, staff: true },
    { x: 16.4, z: 8.6, ry: Math.PI / 2 }, { x: 20.7, z: 11.6, ry: -Math.PI / 2 },
    // gate agents behind their desks
    { x: -14, z: 37.1, ry: Math.PI, staff: true },
    { x: 14, z: 37.1, ry: Math.PI, staff: true },
    // flight attendant welcoming passengers in the airplane galley
    { x: 12.8, z: GATE_DOOR_Z + 1.1, ry: 0.35, staff: true },
    // watching the planes at the glass
    { x: -4.5, z: 36.8, ry: 0 }, { x: 3.3, z: 36.7, ry: 0 }, { x: 10.6, z: 36.8, ry: 0.15 },
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
    v.group.position.set(x, z > 50 ? 3.05 : F, z);
    v.group.rotation.y = ry;
    crowd.add(v.group);
    statics.push(v);
  });
}

// ---------------------------------------------------------------------------
// Passengers already aboard.
//
// The guest rigs cannot sit: the seated pose writes thigh_l / calf_l and their
// Ready Player Me skeleton has neither, so the people in the cabin come off the
// pack's own two characters instead — the only bases makeVisitor can fold into
// a chair. Both cabins are dressed, and both are hidden together when the
// player is nowhere near the gates, which keeps 24 extra skinned meshes off the
// draw list for the 95% of the map where they cannot be seen.
// ---------------------------------------------------------------------------
const cabinPassengers = [];
const _v3seat = new THREE.Vector3();
const boneY = (g, name) => {
  const b = g.getObjectByName(name);
  return b ? _v3seat.setFromMatrixPosition(b.matrixWorld).y : Infinity;
};
const ballY = g => Math.min(boneY(g, 'ball_l'), boneY(g, 'ball_r'));
// How far the shoe hangs below the ball of the foot — measured per model,
// because the pack's two characters differ by 5 cm and the gap is the
// difference between standing on the deck and standing in it.
function soleDrop(g) {
  const ball = ballY(g);
  if (!Number.isFinite(ball)) return null;
  g.traverse(o => { if (o.isSkinnedMesh) o.boundingBox = null; });
  return Math.max(0, ball - new THREE.Box3().setFromObject(g).min.y);
}
// Swing the shin forward until the soles rest on the cabin floor. The seated
// pose holds the shin vertical, and on the taller half of the pack that buries
// the feet in the carpet.
//
// KNEE_OPEN is the difference from the zoo's version of this fit, which is free
// to straighten the leg all the way. A café terrace has room for that; a 1.05 m
// seat pitch does not, and letting the bisection run to a straight leg laid
// every passenger out with a foot across the aisle. The knee stops at roughly
// 60°, and whatever reach is still missing is taken by letting the soles sink
// under the deck — they are beneath the seat in front, where nobody sees them.
const KNEE_OPEN = -1.24;
function fitSeatedLegs(v, groundY) {
  const st = v.pose?.state, rest = v.pose?.rest;
  if (!st || !rest) return;
  const drop = soleDrop(v.group);
  if (drop === null) return;
  const soleAtKnee = knee => {
    st.knee = knee;
    st.ankle = rest.ankle - (knee - rest.knee);
    v.pose();
    v.group.updateMatrixWorld(true);
    return ballY(v.group) - drop;
  };
  const rested = soleAtKnee(rest.knee);
  if (rested > groundY + 0.005) {
    v.group.position.y -= Math.min(rested - groundY, 0.07);
    v.group.updateMatrixWorld(true);
    return;
  }
  let lo = rest.knee, hi = KNEE_OPEN;
  if (soleAtKnee(hi) < groundY) { soleAtKnee(hi); return; }
  for (let i = 0; i < 16; i++) {
    const mid = (lo + hi) / 2;
    if (soleAtKnee(mid) < groundY) lo = mid; else hi = mid;
  }
  soleAtKnee(hi);
}
function seatOn(v, x, cushionY, z, ry, floorY) {
  v.group.position.set(x, 0, z);
  v.group.rotation.y = ry;
  // The mixer has never run, so the skeleton is still in its bind pose and
  // every height read off it would be a few centimetres out on frame one.
  v.mixer.update(0);
  v.pose?.();
  v.group.updateMatrixWorld(true);
  const pelvis = v.group.getObjectByName('pelvis');
  if (!pelvis) return;
  v.group.position.y = cushionY + 0.07 - _v3seat.setFromMatrixPosition(pelvis.matrixWorld).y;
  v.group.updateMatrixWorld(true);
  fitSeatedLegs(v, floorY);
}

{
  const bases = [];
  // The player is always 'girl' on this map (see player.load('girl', ...)
  // above). Skip that same base here so no cabin passenger ends up wearing
  // the player's own face — man.glb is the only one of the two sit-capable
  // rigs left, and every seat still varies by clothing, skin and hair.
  for (const url of ['./chars/glb/man.glb']) {
    try { bases.push(await loadVisitorBase(url, girlMatFor)); }
    catch (e) { console.warn('[airport] cabin passenger model unavailable:', url, e); }
  }
  const walkClip = player?.actions.walk?.getClip();
  const idleClip = player?.actions.idle?.getClip();
  if (bases.length && walkClip) {
    // Seat map, in cabin-local coordinates. Window seats are left for the
    // player wherever possible — those are the ones the sit prompt offers — so
    // the load sits mostly in the middle and aisle columns, thinning out aft
    // the way a half-full flight does.
    // Nobody in the aisle column. Seated at 0.64 from the centreline, an aisle
    // passenger's outboard shin — splayed by the pose and swung forward by the
    // leg fit — crossed into the walkway, and the player walked through a knee
    // every second row. Window and middle only, which is also what a cabin
    // still boarding looks like.
    const SEAT_LX = [1.48, 0.74];         // window, aisle (2+2)
    const PLAN = [
      [0, 1, 1], [0, -1, 1], [1, 1, 1], [1, -1, 0], [2, 1, 0], [2, -1, 1],
      [3, 1, 1], [3, -1, 1], [4, -1, 1], [5, 1, 1], [5, -1, 0], [6, 1, 1],
      [7, -1, 1], [8, 1, 1], [9, -1, 1], [10, 1, 1],
    ];
    let n = 0;
    for (const gx of GATE_PLANE_X) {
      for (const [row, sx, col] of PLAN) {
        const lx = sx * SEAT_LX[col];
        const lz = gateRowZ(row);
        // Plane yaw is π, so cabin-local (lx, lz) lands at (gx - lx, planeZ - lz)
        // and "facing forward" (local +z) points at world -z.
        const wx = gx - lx;
        const wz = GATE_PLANE_Z - lz;
        // `still` with the idle clip, not the walk: held on a random walk frame
        // every passenger sat mid-stride, one arm swung out into the aisle.
        const v = makeVisitor(bases[n % bases.length], walkClip, rngCrowd,
          { seated: true, still: true, idleClip });
        crowd.add(v.group);
        seatOn(v, wx, GATE_SEAT_TOP_Y, wz, Math.PI, GATE_CABIN_FLOOR_Y);
        cabinPassengers.push({ v, gx, shown: true });
        // Tell the sit prompt this one is taken, so the player is never offered
        // a seat with somebody already in it.
        let best = null, bestD = Infinity;
        for (const spot of furnitureInteractions) {
          if (spot.type !== 'sit') continue;
          const d = Math.hypot(spot.x - wx, spot.z - wz);
          if (d < bestD) { bestD = d; best = spot; }
        }
        // 0.20, not 0.45: the prompt's anchor sits 0.10 inboard of the window
        // cushion but only 0.34 from the middle one, and a looser radius let a
        // middle-seat passenger book out the window seat beside them.
        if (best && bestD < 0.20) best.occupied = 'visitor';
        n++;
      }
    }
  }
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

let choosingPlaneDestination = false;
let flightTakeoffActive = false;
let flightTakeoffTimer = 0;
const FLIGHT_TAKEOFF_DURATION = 3.8;

function showPlanePrompt() {
  if (!planePromptGroup) return;
  choosingPlaneDestination = true;
  planePromptGroup.classList.add('show');
  planePromptGroup.setAttribute('aria-hidden', 'false');
  if (document.pointerLockElement === renderer.domElement) {
    document.exitPointerLock?.();
  }
}
function hidePlanePrompt() {
  if (!planePromptGroup) return;
  choosingPlaneDestination = false;
  planePromptGroup.classList.remove('show');
  planePromptGroup.setAttribute('aria-hidden', 'true');
  if (started && !paused) {
    requestGamePointerLock();
  }
}

function selectPlaneDestination(dest) {
  hidePlanePrompt();
  if (dest === 'la') {
    return;
  }
  if (dest === 'shinto') {
    startFlightTakeoff();
  }
}

planeDestLaPrompt?.addEventListener('click', event => {
  event.stopPropagation();
  selectPlaneDestination('la');
});
planeDestShintoPrompt?.addEventListener('click', event => {
  event.stopPropagation();
  selectPlaneDestination('shinto');
});

window.addEventListener('keydown', event => {
  if (choosingPlaneDestination) {
    if (event.key === '1' || event.code === 'Digit1' || event.code === 'Numpad1') {
      event.preventDefault();
      selectPlaneDestination('la');
    } else if (event.key === '2' || event.code === 'Digit2' || event.code === 'Numpad2') {
      event.preventDefault();
      selectPlaneDestination('shinto');
    }
  }
});

function startFlightTakeoff() {
  travelInProgress = true;
  flightTakeoffActive = true;
  flightTakeoffTimer = 0;
  if (document.pointerLockElement === renderer.domElement) {
    document.exitPointerLock?.();
  }
  takingOff.visible = true;
  takingOff.position.set(41, 3.55, 10);
  takingOff.rotation.set(0, 0, 0);
  parked.visible = false;
}

function updateFlightTakeoff(dt) {
  if (!flightTakeoffActive) return;
  flightTakeoffTimer += dt;
  const t = flightTakeoffTimer;
  const RW = 41;

  if (t < 1.3) {
    const u = t / 1.3;
    takingOff.position.set(RW, 3.55, 10 + u * 75);
    takingOff.rotation.set(0, 0, 0);
  } else {
    const u = (t - 1.3) / (FLIGHT_TAKEOFF_DURATION - 1.3);
    const climb = u * u;
    takingOff.position.set(RW, 3.55 + climb * 75, 85 + u * 230);
    takingOff.rotation.set(-0.14 - u * 0.12, 0, 0);
  }

  camera.position.set(-60, 26, 35);
  camera.lookAt(takingOff.position.x, takingOff.position.y + 4, takingOff.position.z);

  if (fadeEl && t > 2.8) {
    const fadeAlpha = Math.min(1, (t - 2.8) / 0.9);
    fadeEl.style.opacity = String(fadeAlpha);
  }

  if (t >= FLIGHT_TAKEOFF_DURATION) {
    flightTakeoffActive = false;
    location.href = 'index.html?map=shinto&arrival=flight';
  }
}

function enterFurnitureInteraction(spot) {
  setFurniturePrompt(null);
  if (spot.occupied !== 'visitor') spot.occupied = 'player';
  activeFurnitureInteraction = { ...spot, source: spot, returnPosition: ctrl.pos.clone(), readyToExit: false };
  ctrl.pos.set(spot.x, spot.y, spot.z);
  ctrl.prevY = spot.y;
  ctrl.vel.set(0, 0, 0);
  ctrl.mode = spot.type;
  ctrl.webOn = false;
  // Character yaw 0 faces +Z; camera yaw 0 looks −Z. Offset so the rig sits
  // behind the sitter looking the way they face.
  if (Number.isFinite(spot.yaw)) input.yaw = spot.yaw + Math.PI;

  if (spot.isPlaneSeat) {
    showPlanePrompt();
  }
}
function leaveFurnitureInteraction() {
  hidePlanePrompt();
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
  if (nearest && (furnitureActionRequested || input.pressed('LMB') || input.pressed('KeyE'))) {
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
  // The pack comes off at the door. It is 43 cm of luggage on a 3.7 m cabin
  // with a 50 cm aisle — it clipped every seat back she walked past, and nobody
  // keeps one on down the aisle anyway. setOutfit is keyed on its own state, so
  // calling it every frame costs a string compare.
  const aboard = GATE_PLANE_X.some(gx => onCabinDeck(gx, ctrl.pos.x, ctrl.pos.z));
  player.setOutfit({ hat: false, backpack: !aboard, longSleeves: false });
  player.update({
    dt, mode: ctrl.mode, pos: ctrl.pos, vel: ctrl.vel,
    webOn: ctrl.webOn, webHand: ctrl.webHand, anchor: ctrl.anchor,
    ropeSlack: ctrl.webOn ? Math.max(0, ctrl.pos.distanceTo(ctrl.anchor) - ctrl.ropeLen) : 0,
    posture: activeFurnitureInteraction?.type,
    facingYaw: activeFurnitureInteraction?.yaw,
    floorY: activeFurnitureInteraction?.approachY,
  });
}

// Terminal-wide crowd, so nearby zones (check-in, security, cafe, shop, gates,
// curb) all animate every frame regardless of which one the player is in.
// With the roster grown past ~70 skinned rigs that unconditional mixer cost
// was the slowdown: cull the way cabinPassengers already does below, just on
// plain distance instead of a gate check. Squared, XZ-only, one comparison.
const CROWD_CULL_R2 = 42 * 42;
function tickCrowd(dt) {
  const px = ctrl.pos.x, pz = ctrl.pos.z;
  for (const w of walkers) {
    const dx = w.group.position.x - px, dz = w.group.position.z - pz;
    const near = dx * dx + dz * dz < CROWD_CULL_R2;
    if (near !== w.group.visible) w.group.visible = near;
    if (!near) continue;
    w.s += w.speed * w.dir * dt;
    const len = w.len || 1;
    if (w.s > len) w.s -= len;
    if (w.s < 0) w.s += len;
    const at = atPath(w.path, w.s);
    w.group.position.set(at.x, F, at.z);
    w.group.rotation.y = at.yaw + (w.dir < 0 ? Math.PI : 0);
    w.mixer.update(dt);
  }
  for (const v of statics) {
    const dx = v.group.position.x - px, dz = v.group.position.z - pz;
    const near = dx * dx + dz * dz < CROWD_CULL_R2;
    if (near !== v.group.visible) v.group.visible = near;
    if (near) v.mixer.update(dt);
  }
  // Cabin passengers exist only for the aircraft you are actually at. Every
  // visitor runs with frustum culling off — a skinned bounding sphere from the
  // bind pose is wrong the moment the clip moves — so nothing else takes them
  // off the draw list, and the crowd is far and away the most expensive thing
  // in this view: with both cabins dressed it was over half the frame. The
  // cutoff is well inside the jetway, where the cabin is not yet in sight
  // through the door. `pose` runs after the mixer, which would otherwise stand
  // everyone up and walk them.
  for (const p of cabinPassengers) {
    const near = ctrl.pos.z > GATE_DOOR_Z - 7.1 && Math.abs(ctrl.pos.x - p.gx) < 7;
    if (near !== p.shown) {
      p.shown = near;
      p.v.group.visible = near;
    }
    if (!near) continue;
    p.v.mixer.update(dt);
    p.v.pose?.();
  }
}

function updateHud() {
  hudMode.textContent = ctrl.mode;
  hudSpeed.textContent = Math.round(ctrl.vel.length() * 3.6).toString();
  hudHeight.textContent = ctrl.pos.y.toFixed(1);
  document.documentElement.classList.toggle('is-seated', ctrl.mode === 'sit' || ctrl.mode === 'lie');
}

// ---------------------------------------------------------------------------
// Point-light budget.
//
// This is a forward renderer: every point light in the scene is evaluated in
// the fragment shader for every lit pixel, whether or not it can reach it. The
// terminal had accumulated 38 — drop-off canopy, hall, checkpoint, concourse,
// shop, two jetbridges, two cabins — and the cost of that turns out to be
// sharply non-linear. Benchmarked on this scene, one frame costs roughly:
//
//     20 lights  21 ms      28 lights  38 ms      38 lights  67 ms
//     24 lights  26 ms      33 lights  55 ms
//
// which is a shader falling off an occupancy cliff, not a per-light price. The
// map was already over that cliff before the check-in rebuild added five more.
//
// So each frame only the nearest LIGHT_BUDGET stay visible, ranked by the
// distance from the camera to the edge of each light's own falloff sphere.
// Nothing is lost: the ranges here run 5–30 m across a 250 m map, so the lamps
// that get switched off were contributing nothing to the picture — the two
// renders are indistinguishable.
//
// The budget is a fixed count rather than "however many are in range", because
// three keys its shader programs on the number of lights: a count that drifted
// with the player's position would recompile every material in the scene each
// time a lamp crossed the threshold.
// ---------------------------------------------------------------------------
const LIGHT_BUDGET = 20;
const lightRank = [];
scene.traverse(o => { if (o.isPointLight) lightRank.push({ light: o, key: 0 }); });
function updateLightBudget() {
  if (lightRank.length <= LIGHT_BUDGET) return;
  for (const e of lightRank) e.key = camera.position.distanceTo(e.light.position) - e.light.distance;
  lightRank.sort((a, b) => a.key - b.key);
  for (let i = 0; i < lightRank.length; i++) lightRank[i].light.visible = i < LIGHT_BUDGET;
}

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(0.033, clock.getDelta());
  const t = clock.elapsedTime;
  if (flightTakeoffActive) {
    updateFlightTakeoff(dt);
    tickAirportLights(t, dt);
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
    if (ctrl.pos.y < -60) ctrl.rescueTo(spawnPoint);
  }
  tickPlanes(t);
  tickAirportLights(t, dt);
  tickCrowd(dt);
  updateAvatar(dt);
  rig.update(dt, input, ctrl);
  updateHud();
  updateLightBudget();          // after rig.update: it reads the camera's final position
  renderer.render(scene, camera);
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
window.__startAirport = startAirport;
startBtn?.addEventListener('click', startAirport);
window.addEventListener('keydown', e => {
  if (!started && (e.code === 'Enter' || e.code === 'Space')) {
    startAirport();
  }
});
if (arrivedFromLA || arrivedFromJapan || window.__startRequested) {
  startAirport();
}

document.addEventListener('pointerlockchange', () => {
  const hasLock = document.pointerLockElement !== null;
  usedLock = usedLock || hasLock;
  if ((choosingFurniturePrompt || choosingPlaneDestination) && !hasLock) {
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

window.__airport = {
  THREE, scene, camera, renderer, world, crowd, ctrl, rig, input, player, spawnPoint,
  furnitureInteractions, planes, walkers, statics, towerRadar,
  enterFurnitureInteraction,
  get activeFurnitureInteraction() { return activeFurnitureInteraction; },
};
window.__villa = window.__airport;
