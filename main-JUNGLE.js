import * as THREE from 'three';
import { Player } from './player.js?v=20260906-seam-fix';
import { harmoniseHair } from './hair.js?v=8';
import { Input } from './input.js';
import { Controller } from './controller.js?v=7';
import { CameraRig } from './cameraRig.js?v=7';
import { buildCityBoxes } from './cityBoxes.js?v=5';
import {
  terrainHeight, canopyAt, boundaryWalls, SEA_Y, SPAWN, TENDER_SPOT, JETTY,
  POOL, FALLS, SAND_END, WADE_Z,
} from './jungleLayout.js';   // no ?v: the element modules import it bare, and
                                  // two URLs would be two module instances
import { buildJungleTerrain } from './jungleTerrain.js?v=20260930-amph1';
import { createJungleOcean } from './jungleOcean.js?v=20260927-ocean3';
import { createJungleWaterfall } from './jungleWaterfall.js?v=20260927-falls8';
import { buildJungleVegetation } from './jungleVegetation.js?v=20260930-veg3';
import { createJungleTender } from './jungleTender.js?v=20260928-tender3';
import { createJungleLiner } from './jungleLiner.js?v=20260928-liner1';
import { createJungleWildlife } from './jungleWildlife.js?v=20261001-pass9';

// ---------------------------------------------------------------------------
// Promenade tropicale — la cascade. SKELETON.
//
// The cove on the island the liner sails past in main-CRUISE.js: you come
// ashore by the ship's tender at a little jetty, cross the sand, and follow a
// path up through the rainforest to a waterfall dropping into a plunge pool.
// The tender at the jetty takes you back aboard.
//
// This file is the shell every world has (renderer, light, player,
// controller, camera, HUD, loop) plus the few built things that are not
// "an element": the jetty and the liner at anchor. The tender outgrew its
// box-hull sketch and moved to its own module. The elements each live in
// their own module so they can be iterated on separately:
//
//   jungleLayout.js      the plan — pure functions of (x, z), node-testable
//   jungleTerrain.js     ground mesh, path ribbon, rocks
//   jungleOcean.js       swell, lagoon colour, swash foam
//   jungleWaterfall.js   falls, pool, mist, stream
//   jungleVegetation.js  palms, giants, ferns, broad leaves, lianas
//   jungleTender.js      the moored water-taxi — hull, awning, moorings
//   jungleLiner.js       the cruise ship at anchor on the horizon
//   jungleWildlife.js    the animals (engine: wildlife.js — see WILDLIFE.md)
//
// Contracts inherited from the L.A. beach: the sea is WADEABLE, not
// swimmable (wade barrier at WADE_Z); the ground probe evaluates the
// analytic terrain rather than raying the mesh; anything that must stop the
// player is an AABB under 80 m long.
// ---------------------------------------------------------------------------

const app = document.getElementById('app');
const overlay = document.getElementById('overlay');
const startBtn = document.getElementById('startBtn');
const hudMode = document.getElementById('mode');
const hudSpeed = document.getElementById('speed');
const hudHeight = document.getElementById('height');
const tenderPromptGroup = document.getElementById('tenderPromptGroup');
const tenderYesPrompt = document.getElementById('tenderYesPrompt');
const tenderNoPrompt = document.getElementById('tenderNoPrompt');

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
// 1.5 rather than the beach's 1.7: this map pushes far more alpha-tested
// leaves, and on a Retina MacBook Air fill rate is what runs out first.
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.outputColorSpace = THREE.SRGBColorSpace;
app.appendChild(renderer.domElement);
const maxAniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());

const scene = new THREE.Scene();
// Fog is blended between two states by how far under the canopy the player
// is: clear and blue on the sand, close and green in the forest.
const FOG = {
  // Far enough that the open sea keeps its blue to the horizon: at 120–760
  // the water past the reef was fogged to a grey band. The forest half is
  // tight on purpose: under the canopy the air itself should feel green and
  // close, and the depth comes from the fog eating the far trunks.
  beach: { color: new THREE.Color(0xcfe2ea), near: 220, far: 1500 },
  forest: { color: new THREE.Color(0x93ad8c), near: 11, far: 160 },
};
scene.fog = new THREE.Fog(FOG.beach.color.clone(), FOG.beach.near, FOG.beach.far);

const camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.25, 2600);

// Only InstancedMeshes under `world` become collision boxes (cityBoxes).
const world = new THREE.Group();
scene.add(world);

// ---------------------------------------------------------------------------
// Light. One shadow-casting sun whose frustum follows the player — the whole
// valley in one shadow map would be mush — and a hemisphere fill that turns
// green under the canopy.
// ---------------------------------------------------------------------------
const SUN_DIST = 170;
const SHADOW_HALF = 42;
const sunDir = new THREE.Vector3(-55, 120, -70).normalize();   // high, over the sea
const sun = new THREE.DirectionalLight(0xfff0d4, 2.7);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, {
  left: -SHADOW_HALF, right: SHADOW_HALF, top: SHADOW_HALF, bottom: -SHADOW_HALF,
  near: SUN_DIST - 90, far: SUN_DIST + 110,
});
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.04;
sun.shadow.camera.updateProjectionMatrix();
scene.add(sun, sun.target);
const SHADOW_TEXEL = (SHADOW_HALF * 2) / sun.shadow.mapSize.x;
function updateSunShadow(focus) {
  const fx = Math.round(focus.x / SHADOW_TEXEL) * SHADOW_TEXEL;
  const fz = Math.round(focus.z / SHADOW_TEXEL) * SHADOW_TEXEL;
  sun.target.position.set(fx, focus.y, fz);
  sun.position.set(fx, focus.y, fz).addScaledVector(sunDir, SUN_DIST);
  sun.target.updateMatrixWorld();
}

const HEMI = {
  beach: { sky: new THREE.Color(0xdcecff), ground: new THREE.Color(0xc8b48c), intensity: 1.1 },
  forest: { sky: new THREE.Color(0xc4dcb4), ground: new THREE.Color(0x44541f), intensity: 0.92 },
};
const hemi = new THREE.HemisphereLight(0xdcecff, 0xc8b48c, 1.1);
scene.add(hemi);

// Sky dome — the beach's gradient with a glow lobe around the sun.
const skyUniforms = {
  uHorizon: { value: new THREE.Color(0xe2eef2) },
  uZenith: { value: new THREE.Color(0x4f8fd6) },
  uGlow: { value: new THREE.Color(0xfff0cc) },
  uGlowDir: { value: sunDir.clone() },
  uGlowStrength: { value: 0.45 },
  uGlowTightness: { value: 12.0 },
};
const skyDome = new THREE.Mesh(
  new THREE.SphereGeometry(2200, 32, 18),
  new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false, uniforms: skyUniforms,
    vertexShader: `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      uniform vec3 uHorizon, uZenith, uGlow, uGlowDir;
      uniform float uGlowStrength, uGlowTightness;
      varying vec3 vDir;
      void main() {
        vec3 d = normalize(vDir);
        float h = clamp(d.y * 0.5 + 0.5, 0.0, 1.0);
        vec3 col = mix(uHorizon, uZenith, pow(smoothstep(0.5, 1.0, h), 0.8));
        col += uGlow * pow(max(dot(d, normalize(uGlowDir)), 0.0), uGlowTightness) * uGlowStrength;
        gl_FragColor = vec4(col, 1.0);
      }`,
  }),
);
skyDome.frustumCulled = false;
skyDome.renderOrder = -1;
scene.add(skyDome);

const loader = new THREE.TextureLoader();
const pmrem = new THREE.PMREMGenerator(renderer);
loader.load('./data/env_equirect.png', t => {
  t.mapping = THREE.EquirectangularReflectionMapping;
  t.colorSpace = THREE.SRGBColorSpace;
  scene.environment = pmrem.fromEquirectangular(t).texture;
  scene.environmentIntensity = 0.45;
  t.dispose();
});
const waterNormal = loader.load('./textures/la/water_normal.jpg');
waterNormal.wrapS = waterNormal.wrapT = THREE.RepeatWrapping;
waterNormal.repeat.set(22, 14);
waterNormal.anisotropy = maxAniso;

// ---------------------------------------------------------------------------
// Deterministic scatter, so two loads lay the island out identically and two
// screenshots of the "same" view are comparable.
// ---------------------------------------------------------------------------
let seed = 20260927 >>> 0;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);

// Instancing into the collision world. `prop: true` is scenery you walk
// around, never on (see cityBoxes).
const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler();
const _p = new THREE.Vector3(), _s = new THREE.Vector3();
function addInstanced(geometry, material, items, { prop = false, parent = world, shadow = true } = {}) {
  if (!items.length) return null;
  const im = new THREE.InstancedMesh(geometry, material, items.length);
  items.forEach((it, i) => {
    _p.set(it.x, it.y, it.z);
    _q.setFromEuler(_e.set(it.rx || 0, it.ry || 0, it.rz || 0, 'YXZ'));
    _s.set(it.sx ?? 1, it.sy ?? 1, it.sz ?? 1);
    im.setMatrixAt(i, _m4.compose(_p, _q, _s));
  });
  im.instanceMatrix.needsUpdate = true;
  im.computeBoundingSphere();
  im.castShadow = shadow;
  im.receiveShadow = true;
  if (prop) im.userData.prop = items.map(() => true);
  parent.add(im);
  return im;
}

// ---------------------------------------------------------------------------
// The elements.
// ---------------------------------------------------------------------------
const terrain = buildJungleTerrain({ scene, addInstanced, rnd, maxAniso });
// skyUniforms: the sea's fresnel reflection reads the very dome overhead, so
// a change of sky hours changes the water's answer with it.
const ocean = createJungleOcean({ scene, waterNormal, maxAniso, skyUniforms });
const falls = createJungleWaterfall({ scene, waterNormal });
const vegetation = buildJungleVegetation({ scene, rnd, maxAniso });
// Its own seeded RNGs, so the shared rnd() above is not drawn from: adding
// an animal never moves a rock or a palm. The vegetation goes with it: its
// flower tufts are the hummingbirds' anchors and habitat.
const wildlife = createJungleWildlife({ scene, ocean, terrain, vegetation });

// ---------------------------------------------------------------------------
// The jetty: a plank deck on pilings, walkable, from the sand out to where
// the tender can come alongside.
// ---------------------------------------------------------------------------
const BOX = new THREE.BoxGeometry(1, 1, 1);
// The deck's planking: the shared PBR deck boards (as on the L.A. beach
// boardwalk), laid ACROSS the jetty. One tile holds 15 boards; its length is
// picked so each deck half holds a whole number of tiles, so the boards run
// on unbroken across the seam between the two instanced halves.
const DECK_HALF = (JETTY.z0 - JETTY.z1) / 2;
const DECK_TILE = DECK_HALF / Math.round(DECK_HALF / 2.3);
const deckTex = (url, srgb) => {
  const t = loader.load(url);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = maxAniso;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
};
// A unit box whose UVs are metres / DECK_TILE for the deck's own scale
// (every half is the same size), each face mapped so the grain runs along
// the boards: across on the top, lengthwise on the fascia.
function makeDeckGeo(sx, sy, sz) {
  const g = new THREE.BoxGeometry(1, 1, 1);
  const p = g.attributes.position, n = g.attributes.normal, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i) * sx, y = p.getY(i) * sy, z = p.getZ(i) * sz;
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i));
    if (ay > 0.5) uv.setXY(i, x / DECK_TILE, z / DECK_TILE);
    else if (ax > 0.5) uv.setXY(i, z / DECK_TILE, y / DECK_TILE);
    else uv.setXY(i, x / DECK_TILE, y / DECK_TILE);
  }
  return g.scale(sx, sy, sz);
}
const M = {
  plank: new THREE.MeshStandardMaterial({
    map: deckTex('./textures/nature/wood_diff.jpg', true),
    normalMap: deckTex('./textures/nature/wood_n.jpg'),
    roughnessMap: deckTex('./textures/nature/wood_r.jpg'),
    normalScale: new THREE.Vector2(0.9, 0.9),
    color: 0xd6bf9f, roughness: 1, metalness: 0,   // sun- and salt-bleached
  }),
  piling: new THREE.MeshStandardMaterial({ color: 0x5e4a36, roughness: 0.95 }),
};
{
  const deck = [], posts = [];
  const len = JETTY.z0 - JETTY.z1;
  // Deck in two lengths, each well under cityBoxes' 80 m limit.
  for (let k = 0; k < 2; k++) {
    const za = JETTY.z0 - (len * k) / 2, zb = JETTY.z0 - (len * (k + 1)) / 2;
    deck.push({ x: JETTY.x, y: JETTY.deckY - 0.12, z: (za + zb) / 2,
      sx: 1, sy: 1, sz: 1 });            // the size is baked into the geometry
  }
  // Pilings on a 3.2 m rhythm (the tender's mooring lines count on it),
  // plus a pair at the very head to carry the stringer.
  const pileZ = [];
  for (let z = JETTY.z0 - 1; z > JETTY.z1 - 0.1; z -= 3.2) pileZ.push(z);
  pileZ.push(JETTY.z1 + 0.1);
  for (const z of pileZ) {
    for (const s of [-1, 1]) {
      const x = JETTY.x + s * (JETTY.halfW - 0.15);
      const bed = terrainHeight(x, z);
      posts.push({ x, y: (bed - 0.4 + JETTY.deckY + 0.9) / 2, z, sx: 0.22,
        sy: JETTY.deckY + 0.9 - bed + 0.4, sz: 0.22 });
    }
  }
  addInstanced(makeDeckGeo(JETTY.halfW * 2, 0.24, DECK_HALF + 0.02), M.plank, deck);
  // A stringer across the head, so walking to the end stops you there
  // rather than stepping you off into the lagoon. It spans the two head
  // pilings (it used to hang in the air 1.3 m past the last pair). The
  // tender lies along the east side, which stays open.
  posts.push({ x: JETTY.x, y: JETTY.deckY + 0.45, z: JETTY.z1 + 0.1,
    sx: 2 * (JETTY.halfW - 0.15) + 0.22, sy: 0.12, sz: 0.14 });
  addInstanced(BOX, M.piling, posts, { prop: true });
}

// The water-taxi moored at the jetty head — its own module, since it is a
// whole boat now: lofted hull, benches, awning, outboard, moorings. It
// floats on the ocean's surface (scenery: it bobs, so it is on `scene`, not
// in the collision world) and update() samples the real water at four
// points of the hull, heave from the mean, pitch and roll from the diffs.
const tenderCtl = createJungleTender({ scene, ocean });
const tender = tenderCtl.group;

// The liner at anchor off the cove, so the island and the ship see each
// other — the same ship as main-CRUISE.js, modelled for 600 m away.
const liner = createJungleLiner({
  scene, position: new THREE.Vector3(-150, SEA_Y, -620), yaw: 0.18 + Math.PI / 2,
}).group;

// ---------------------------------------------------------------------------
// Collision world, ground probe, controller.
// ---------------------------------------------------------------------------
const bw = buildCityBoxes(world, 25);
for (const w of boundaryWalls()) {
  bw.add({ x0: w.x0, x1: w.x1, y0: w.y0, y1: w.y1, z0: Math.min(w.z0, w.z1), z1: Math.max(w.z0, w.z1),
    collide: true, tall: false, prop: true, wall: true });
}
for (const c of vegetation.colliders) {
  bw.add({ ...c, collide: true, prop: true, tall: c.tall, veg: true });
}

const rays = {
  ray: new THREE.Raycaster(),
  tmpNormal: new THREE.Vector3(),
  tempMatrix: new THREE.Matrix4(),
  normalMatrix: new THREE.Matrix3(),
};
const down = new THREE.Vector3(0, -1, 0);
const _origin = new THREE.Vector3();
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

const GROUND_REACH = 160;
function groundFn(x, z, yFrom, feetY, prevY = feetY) {
  const cap = Math.max(feetY + 0.75, prevY + 0.3);
  let best = null;
  const th = terrainHeight(x, z);
  if (th <= cap && th <= yFrom && th >= yFrom - GROUND_REACH) best = th;
  rays.ray.set(_origin.set(x, yFrom, z), down);
  rays.ray.far = GROUND_REACH;
  for (const h of rays.ray.intersectObjects(world.children, true)) {
    if (h.object.userData.prop?.[h.instanceId]) continue;
    if (h.point.y <= cap) {
      if (best === null || h.point.y > best) best = h.point.y;
      break;
    }
  }
  return best === null ? null : best + 0.02;
}

let player = null;
const ctrl = new Controller(bw, groundFn, castFn, {
  onReset: () => ctrl.rescueTo(spawnPoint),
  onLand: impact => { if (player) player.onLand(impact); },
});

const travelParams = new URLSearchParams(location.search);
// Coming ashore from the liner puts you on the jetty by the tender; a cold
// start from the menu puts you on the sand at the foot of the path.
const arrivedFromCruise = travelParams.get('arrival') === 'cruise';
const arrival = arrivedFromCruise ? TENDER_SPOT : SPAWN;
const arrivalY = arrivedFromCruise ? JETTY.deckY : terrainHeight(arrival.x, arrival.z);
const spawnPoint = new THREE.Vector3(arrival.x, arrivalY + 1.0, arrival.z);
ctrl.rescueTo(spawnPoint);

const rig = new CameraRig(camera, bw);
const input = new Input(renderer.domElement);
input.yaw = arrival.yaw;
function requestGamePointerLock() {
  try { renderer.domElement.requestPointerLock?.()?.catch?.(() => {}); } catch (_) {}
}

// ---------------------------------------------------------------------------
// Avatar. Hiking clothes over the pack's survival outfit: white tee, khaki
// shorts, trail shoes — the maps are dropped so the colours read.
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
function tintJungleStyle(mat, name) {
  const n = name.toLowerCase();
  if (n.includes('tshirt')) {
    mat.map = null; mat.color.set('#f4f1e8'); mat.roughness = 0.9; mat.metalness = 0.01;
  } else if (n.includes('pants')) {
    mat.map = null; mat.color.set('#b7a47c'); mat.roughness = 0.92; mat.metalness = 0;
  } else if (n.includes('shoes')) {
    mat.map = null; mat.color.set('#6b5a44'); mat.roughness = 0.8;
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
  if (name.toLowerCase().includes('tshirt')) m.side = THREE.DoubleSide;
  tintJungleStyle(m, name);
  return m;
}

// Not on the critical path: the island is playable before the avatar lands.
const loadingPlayer = new Player(scene);
const playerReady = loadingPlayer.load('girl', girlMatFor, undefined, { deferAnimations: true })
  .then(async () => {
    player = loadingPlayer;
    const [scalp, strands, strandsAO] = await Promise.all([
      charImage(CHAR_MATS?.MAT_SurvGirl_Head?.tex || 'survgirl_head_diff.webp'),
      charImage(CHAR_MATS?.MAT_SurvGirl_Hair?.tex || 'survgirl_hair_diff.webp'),
      charImage(CHAR_MATS?.MAT_SurvGirl_Hair?.aoTex || 'survgirl_hair_ao.webp'),
    ]);
    player.addWardrobePart('hairCrown', harmoniseHair(player, { scalp, strands, strandsAO }));
    return player;
  })
  .catch(err => { console.warn('[jungle] player load issue:', err); return null; });

const _stillVel = new THREE.Vector3();
function updateAvatar(dt) {
  if (!player) return;
  // On the sand you go barefoot in swimwear; up the path, hiking kit.
  const onSand = ctrl.pos.z < SAND_END - 2;
  player.setOutfit(onSand
    ? { hat: false, backpack: false, pants: false, shoes: false, longSleeves: false, swim: true }
    : { hat: true, backpack: true, longSleeves: false });
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

// ---------------------------------------------------------------------------
// Back aboard: the tender's question. A prompt GROUP (two answers, "oui"
// leaves the map), like the beach's cruise seller.
// ---------------------------------------------------------------------------
let started = false, usedLock = false, paused = false;
let tenderAskOpen = false;
let tenderDeclined = false;     // "non" — cleared by walking away from the head
let leaving = false;

const fade = document.createElement('div');
Object.assign(fade.style, {
  position: 'fixed', inset: '0', background: '#05070c', zIndex: '20',
  opacity: '0', pointerEvents: 'none', transition: 'opacity .55s ease',
});
document.body.appendChild(fade);

function atTender() {
  return Math.abs(ctrl.pos.x - TENDER_SPOT.x) < JETTY.halfW + 0.4
    && Math.abs(ctrl.pos.z - TENDER_SPOT.z) < 3.2
    && Math.abs(ctrl.pos.y - JETTY.deckY) < 1.2;
}
function setTenderAsk(show) {
  if (show === tenderAskOpen) return;
  tenderAskOpen = show;
  tenderPromptGroup?.classList.toggle('show', show);
  tenderPromptGroup?.setAttribute('aria-hidden', show ? 'false' : 'true');
  if (show) {
    if (document.pointerLockElement === renderer.domElement) document.exitPointerLock?.();
  } else if (started && !paused && !leaving) {
    requestGamePointerLock();
  }
}
function updatePrompts() {
  if (leaving) return;
  const here = atTender();
  if (!here) tenderDeclined = false;
  // Arriving by tender lands you right here: wait until you have stepped off
  // before asking whether you want to go straight back.
  setTenderAsk(here && !tenderDeclined && started && !paused);
}
tenderYesPrompt?.addEventListener('click', e => {
  e.stopPropagation();
  setTenderAsk(false);
  leaving = true;
  fade.style.opacity = '1';
  setTimeout(() => { location.href = 'index.html?map=cruise&arrival=jungle'; }, 650);
});
tenderNoPrompt?.addEventListener('click', e => {
  e.stopPropagation();
  tenderDeclined = true;
  setTenderAsk(false);
});
if (arrivedFromCruise) tenderDeclined = true;

renderer.domElement.addEventListener('click', () => {
  if (started && !paused && !tenderAskOpen && !input.locked) requestGamePointerLock();
});

// ---------------------------------------------------------------------------
// Atmosphere: fog and fill follow how deep under the canopy the player is.
// ---------------------------------------------------------------------------
function updateAtmosphere() {
  const k = canopyAt(ctrl.pos.z);
  scene.fog.color.copy(FOG.beach.color).lerp(FOG.forest.color, k);
  scene.fog.near = THREE.MathUtils.lerp(FOG.beach.near, FOG.forest.near, k);
  scene.fog.far = THREE.MathUtils.lerp(FOG.beach.far, FOG.forest.far, k);
  hemi.color.copy(HEMI.beach.sky).lerp(HEMI.forest.sky, k);
  hemi.groundColor.copy(HEMI.beach.ground).lerp(HEMI.forest.ground, k);
  hemi.intensity = THREE.MathUtils.lerp(HEMI.beach.intensity, HEMI.forest.intensity, k);
}

// ---------------------------------------------------------------------------
// Loop.
// ---------------------------------------------------------------------------
const clock = new THREE.Clock();
const forward = new THREE.Vector3();
function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(0.033, clock.getDelta());
  const t = clock.elapsedTime;

  if (started && !paused && !leaving) {
    input.updateLook(dt);
    const cp = Math.cos(input.pitch);
    forward.set(-Math.sin(input.yaw) * cp, Math.sin(input.pitch), -Math.cos(input.yaw) * cp).normalize();
    ctrl.update(dt, input, input.yaw, forward);
    if (ctrl.pos.y < -40) ctrl.rescueTo(spawnPoint);
    updatePrompts();
  }

  ocean.update(t);
  falls.update(t);
  terrain.update(t);   // the ground's canopy dapple keeps wandering
  tenderCtl.update(t, dt);   // the taxi rides the same sea the shader draws
  skyDome.position.copy(camera.position);
  updateAtmosphere();
  updateSunShadow(ctrl.pos);
  updateAvatar(dt);
  rig.update(dt, input, ctrl);
  vegetation.update(camera.position, dt);
  wildlife.update(dt, t, ctrl.pos, ctrl.vel);
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
function startJungle() {
  if (started) { resumePlay(); return; }
  started = true;
  resumePlay();
}
window.__startJungle = startJungle;
startBtn?.addEventListener('click', startJungle);
if (arrivedFromCruise || window.__startRequested) startJungle();

document.addEventListener('pointerlockchange', () => {
  usedLock = usedLock || document.pointerLockElement !== null;
  // Dropping the lock so the tender's buttons can be clicked is intentional.
  if ((tenderAskOpen || leaving) && document.pointerLockElement === null) {
    paused = false;
    overlay.style.display = 'none';
    return;
  }
  if (!usedLock) return;
  paused = !input.locked;
  if (paused) setTenderAsk(false);
  overlay.style.display = paused ? 'flex' : 'none';
});

function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  falls.resize(window.innerHeight * renderer.getPixelRatio());
}
window.addEventListener('resize', onResize);
onResize();

// Inspection hook for the headless capture tooling. Also `__villa`, like the
// other worlds, so the shared framing scripts work unchanged.
const hook = {
  THREE, scene, camera, renderer, world, ctrl, rig, input, spawnPoint, bw,
  terrainHeight, ocean, falls, vegetation, terrain, tender, tenderCtl, liner, wildlife,
  SEA_Y, SPAWN, TENDER_SPOT, JETTY, POOL, FALLS, WADE_Z,
  get player() { return player; },
  playerReady,
};
window.__jungle = hook;
window.__villa = hook;
