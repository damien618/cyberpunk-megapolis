import { JUNGLE_RESORT_GATE, JUNGLE_RESORT_ARRIVAL, islandTime } from './islandGeography.js';
import { createIslandTravel, createIslandSign, createIslandPath, pathDistanceTo } from './islandTravel.js';
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
import { buildJungleTerrain } from './jungleTerrain.js?v=20261001-night1';
import { createJungleOcean } from './jungleOcean.js?v=20261001-night1';
import { createJungleWaterfall } from './jungleWaterfall.js?v=20261001-night1';
import { buildJungleVegetation } from './jungleVegetation.js?v=20260930-veg3';
import { createJungleTender } from './jungleTender.js?v=20260928-tender3';
import { createJungleLiner } from './jungleLiner.js?v=20261001-night1';
import { createJungleWildlife } from './jungleWildlife.js?v=20261001-night1';
import { createJungleFireflies } from './jungleFireflies.js?v=20261001-night1';
import { createJungleCampfire } from './jungleCampfire.js?v=20261001-cloth1';
import { createBlanket } from './jungleBlanket.js?v=20261001-cloth1';

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
const furniturePrompt = document.getElementById('furniturePrompt');
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
const FOG_DAY = {
  // Far enough that the open sea keeps its blue to the horizon: at 120–760
  // the water past the reef was fogged to a grey band. The forest half is
  // tight on purpose: under the canopy the air itself should feel green and
  // close, and the depth comes from the fog eating the far trunks.
  beach: { color: new THREE.Color(0xcfe2ea), near: 220, far: 1500 },
  forest: { color: new THREE.Color(0x93ad8c), near: 11, far: 160 },
};
// After dark the open beach keeps a long, blue-black view out to the liner's
// lights; the forest closes in, nearly black-green.
const FOG_NIGHT = {
  beach: { color: new THREE.Color(0x0b1724), near: 120, far: 1300 },
  forest: { color: new THREE.Color(0x0a1716), near: 10, far: 120 },
};
let FOG = FOG_DAY;
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

const HEMI_DAY = {
  beach: { sky: new THREE.Color(0xdcecff), ground: new THREE.Color(0xc8b48c), intensity: 1.1 },
  forest: { sky: new THREE.Color(0xc4dcb4), ground: new THREE.Color(0x44541f), intensity: 0.92 },
};
// Night fill: a moonlit blue on the sand, and under the trees a little more
// than physics would allow — "dark" must still be walkable.
const HEMI_NIGHT = {
  beach: { sky: new THREE.Color(0x2e4766), ground: new THREE.Color(0x1a1e24), intensity: 0.55 },
  forest: { sky: new THREE.Color(0x6a9496), ground: new THREE.Color(0x2a3a2a), intensity: 1.3 },
};
let HEMI = HEMI_DAY;
const hemi = new THREE.HemisphereLight(0xdcecff, 0xc8b48c, 1.1);
scene.add(hemi);

// Night fill: the forest floor is dark litter in the canopy's shadow even by
// day, and under a moon no hemisphere fill brings it back without greying
// the whole sky. So a soft, cool light rides 3 m over the player — the
// game's convention for "your eyes have adjusted" — and fades in with the
// canopy: walkable ground round you, the far trees left to the fireflies.
const nightFill = new THREE.PointLight(0x9cc4d4, 0, 18, 1.3);
nightFill.visible = false;
scene.add(nightFill);
const NIGHT_FILL = { beach: 0.6, forest: 7 };

// Sky dome — the beach's gradient with a glow lobe around the sun.
const skyUniforms = {
  uHorizon: { value: new THREE.Color(0xe2eef2) },
  uZenith: { value: new THREE.Color(0x4f8fd6) },
  uGlow: { value: new THREE.Color(0xfff0cc) },
  uGlowDir: { value: sunDir.clone() },
  uGlowStrength: { value: 0.45 },
  uGlowTightness: { value: 12.0 },
  uDisc: { value: 0 },          // the moon's disc, night only
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
      uniform float uGlowStrength, uGlowTightness, uDisc;
      varying vec3 vDir;
      void main() {
        vec3 d = normalize(vDir);
        float h = clamp(d.y * 0.5 + 0.5, 0.0, 1.0);
        vec3 col = mix(uHorizon, uZenith, pow(smoothstep(0.5, 1.0, h), 0.8));
        float cg = max(dot(d, normalize(uGlowDir)), 0.0);
        col += uGlow * pow(cg, uGlowTightness) * uGlowStrength;
        col += vec3(1.0, 0.97, 0.9) * smoothstep(0.99955, 0.9998, cg) * uDisc;
        gl_FragColor = vec4(col, 1.0);
      }`,
  }),
);
skyDome.frustumCulled = false;
skyDome.renderOrder = -1;
scene.add(skyDome);

// Stars for the night, as on the liner: one Points cloud on the dome,
// upper hemisphere only (stars under the horizon are stars in the sea).
const stars = (() => {
  const N = 1100;
  const pos = new Float32Array(N * 3);
  let s = 7654321 >>> 0;
  const r = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let i = 0; i < N; i++) {
    const u = r() * 2 - 1, th = r() * Math.PI * 2;
    const y = Math.abs(u) * 0.92 + 0.06;
    const rad = Math.sqrt(Math.max(0, 1 - y * y));
    pos.set([Math.cos(th) * rad * 2000, y * 2000, Math.sin(th) * rad * 2000], i * 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const p = new THREE.Points(g, new THREE.PointsMaterial({
    color: 0xf2f6ff, size: 5, sizeAttenuation: true, fog: false,
    transparent: true, opacity: 0.85, depthWrite: false,
  }));
  p.frustumCulled = false;
  p.renderOrder = -1;
  p.visible = false;
  scene.add(p);
  return p;
})();

// The campfire's place on the sand: wanted west of the path's foot, between
// the spawn and the jetty, and moved to the nearest spot with room round it —
// no palm trunk through the logs, whatever the vegetation scatter does.
const CAMPFIRE_WANTED = { x: -21, z: 3 };
function placeCampfire(colliders) {
  const clearance = (x, z) => {
    let d = Infinity;
    for (const c of colliders) {
      const dx = Math.max(c.x0 - x, 0, x - c.x1), dz = Math.max(c.z0 - z, 0, z - c.z1);
      d = Math.min(d, Math.hypot(dx, dz));
    }
    return d;
  };
  let best = null;
  for (let r = 0; r <= 12; r += 0.5) {
    for (let a = 0; a < 24; a++) {
      const x = CAMPFIRE_WANTED.x + Math.cos(a / 24 * Math.PI * 2) * r;
      const z = CAMPFIRE_WANTED.z + Math.sin(a / 24 * Math.PI * 2) * r;
      if (z < -6 || z > SAND_END - 5) continue;           // dry sand, short of the trees
      if (Math.abs(x - JETTY.x) < 6) continue;           // off the jetty's approach
      if (clearance(x, z) >= 4.2) { best = { x, z }; break; }
      if (r === 0) break;
    }
    if (best) break;
  }
  return best ?? CAMPFIRE_WANTED;
}

const loader = new THREE.TextureLoader();
const pmrem = new THREE.PMREMGenerator(renderer);
let envIntensity = 0.45;          // the hour's, kept for when the map lands
loader.load('./data/env_equirect.png', t => {
  t.mapping = THREE.EquirectangularReflectionMapping;
  t.colorSpace = THREE.SRGBColorSpace;
  scene.environment = pmrem.fromEquirectangular(t).texture;
  scene.environmentIntensity = envIntensity;
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
const resortPathPoints = [[-16, 22], [-25, 20], [-34, 18]];
const vegetation = buildJungleVegetation({ scene, rnd, maxAniso, rules: {
  keepOffBuilt: (x, z) => !(Math.abs(x - JETTY.x) < JETTY.halfW + 2 && z < JETTY.z0 + 3)
    && Math.hypot(x - POOL.x, z - POOL.z) >= POOL.r + 1
    && pathDistanceTo(resortPathPoints, x, z) > 1.7,
} });
createIslandPath(scene, resortPathPoints, terrainHeight);
createIslandSign(scene, { ...JUNGLE_RESORT_GATE, y: terrainHeight(JUNGLE_RESORT_GATE.x, JUNGLE_RESORT_GATE.z), label: '← Village touristique' });
// Its own seeded RNGs, so the shared rnd() above is not drawn from: adding
// an animal never moves a rock or a palm. The vegetation goes with it: its
// flower tufts are the hummingbirds' anchors and habitat.
const wildlife = createJungleWildlife({ scene, ocean, terrain, vegetation });
// Night only: fireflies along the path and the stream, and a campfire on the
// sand with a log to sit on.
const fireflies = createJungleFireflies({ scene });
const CAMPFIRE = placeCampfire(vegetation.colliders);
const campfire = createJungleCampfire({ scene, terrainHeight, x: CAMPFIRE.x, z: CAMPFIRE.z });
const blanket = createBlanket(scene);

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

// A hurricane lantern hung on the head's west piling, so the tender's stop is
// findable after dark. By day it is an unlit glass box; by night its bulb
// glows and one short-range light (no shadow) washes the last planks.
const jettyLantern = (() => {
  const g = new THREE.Group();
  const px = JETTY.x - (JETTY.halfW - 0.15), pz = JETTY.z1 + 0.1;
  g.position.set(px, JETTY.deckY + 0.9, pz);
  const metal = new THREE.MeshStandardMaterial({ color: 0x2c2c2a, roughness: 0.6, metalness: 0.5 });
  const glass = new THREE.MeshStandardMaterial({
    color: 0xfff1d0, roughness: 0.2, emissive: 0xffc070, emissiveIntensity: 0,
  });
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.12, 0.07, 10), metal);
  cap.position.y = 0.36;
  const bulb = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.2, 10), glass);
  bulb.position.y = 0.22;
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.05, 10), metal);
  base.position.y = 0.1;
  const hook = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.1, 0.02), metal);
  hook.position.y = 0.05;
  g.add(cap, bulb, base, hook);
  const light = new THREE.PointLight(0xffb866, 0, 9, 2);
  light.position.y = 0.22;
  light.visible = false;
  g.add(light);
  scene.add(g);
  return {
    setNight(on) {
      glass.emissiveIntensity = on ? 2.4 : 0;
      light.visible = on;
      light.intensity = on ? 3.2 : 0;
    },
  };
})();

// The water-taxi moored at the jetty head — its own module, since it is a
// whole boat now: lofted hull, benches, awning, outboard, moorings. It
// floats on the ocean's surface (scenery: it bobs, so it is on `scene`, not
// in the collision world) and update() samples the real water at four
// points of the hull, heave from the mean, pitch and roll from the diffs.
const tenderCtl = createJungleTender({ scene, ocean });
const tender = tenderCtl.group;

// The liner at anchor off the cove, so the island and the ship see each
// other — the same ship as main-CRUISE.js, modelled for 600 m away.
const linerCtl = createJungleLiner({
  scene, position: new THREE.Vector3(-150, SEA_Y, -620), yaw: 0.18 + Math.PI / 2,
});
const liner = linerCtl.group;

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
const arrivedFromResort = travelParams.get('arrival') === 'resort';
const arrival = arrivedFromCruise ? TENDER_SPOT : arrivedFromResort ? JUNGLE_RESORT_ARRIVAL : SPAWN;
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
  // On the sand you go barefoot in swimwear; up the path, hiking kit. After
  // dark it is long sleeves everywhere, and no sun hat.
  const onSand = ctrl.pos.z < SAND_END - 2;
  const night = jungleTime === 'night';
  player.setOutfit(night
    ? { hat: false, backpack: true, longSleeves: true }
    : onSand
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
    posture: seated ? 'sit' : undefined,
    facingYaw: seated ? campfire.seat.yaw : undefined,
    floorY: seated ? campfire.seat.floorY : undefined,
    // Hands closed on the blanket's edges at the breastbone.
    seatPose: seated ? fireSeatPose() : undefined,
  });
  if (seated) blanket.fit(player, dt, clock.elapsedTime);
}

// Wrist targets in world space, in front of the chest, a hand's width apart.
let _firePose = null;
function fireSeatPose() {
  if (_firePose) return _firePose;
  const st = campfire.seat;
  const fwd = new THREE.Vector3(Math.sin(st.yaw), 0, Math.cos(st.yaw));
  const side = new THREE.Vector3(fwd.z, 0, -fwd.x);
  // At the breastbone: seated, her shoulders are ~1.16 m off the sand and
  // the sternum ~0.18 m below them, a hand's depth in front of the chest.
  const chest = new THREE.Vector3(st.x, st.floorY + 0.98, st.z).addScaledVector(fwd, 0.06);
  _firePose = {
    handKey: 'blanketHold2',
    hands: {
      l: chest.clone().addScaledVector(side, 0.065),
      r: chest.clone().addScaledVector(side, -0.065),
    },
  };
  return _firePose;
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
  // The hour goes back aboard with you: a night ashore is a night on deck.
  setTimeout(() => { location.href = `index.html?map=cruise&arrival=jungle&time=${jungleTime}`; }, 650);
});
tenderNoPrompt?.addEventListener('click', e => {
  e.stopPropagation();
  tenderDeclined = true;
  setTenderAsk(false);
});
if (arrivedFromCruise) tenderDeclined = true;

renderer.domElement.addEventListener('click', () => {
  if (started && !paused && !tenderAskOpen && !seatPromptOpen && !input.locked) requestGamePointerLock();
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
  if (nightFill.visible) {
    nightFill.position.set(ctrl.pos.x, ctrl.pos.y + 3, ctrl.pos.z);
    nightFill.intensity = THREE.MathUtils.lerp(NIGHT_FILL.beach, NIGHT_FILL.forest, k);
  }
}

// ---------------------------------------------------------------------------
// Time of day. Two states, like the liner the island is seen from — the
// liner hands its hour over in the URL (`time=`), and the menu through
// window.__nightMode. Night is moonlight over the sea: the moon stands low
// in the south over the water, so its path runs up the lagoon to the beach;
// the liner is lit from inside; fireflies under the trees; the campfire on
// the sand. The diurnal animals sleep.
// ---------------------------------------------------------------------------
const TIME_STATES = {
  day: {
    sunDir: sunDir.clone(),
    sun: { color: 0xfff0d4, intensity: 2.7 },
    sky: { horizon: 0xe2eef2, zenith: 0x4f8fd6, glow: 0xfff0cc, strength: 0.45, tightness: 12, disc: 0 },
    exposure: 1.0, env: 0.45, fog: FOG_DAY, hemi: HEMI_DAY, stars: false,
  },
  night: {
    sunDir: new THREE.Vector3(-30, 42, -100).normalize(),
    sun: { color: 0x9dbbe6, intensity: 0.55 },
    sky: { horizon: 0x13233a, zenith: 0x03070f, glow: 0xb8cdea, strength: 0.42, tightness: 70, disc: 1.4 },
    exposure: 1.12, env: 0.1, fog: FOG_NIGHT, hemi: HEMI_NIGHT, stars: true,
  },
};
let jungleTime = 'day';
let islandTravelTime = islandTime(travelParams.get('time'));
function setJungleTime(name) {
  islandTravelTime = islandTime(name);
  const st = TIME_STATES[name] ?? TIME_STATES.day;
  jungleTime = TIME_STATES[name] ? name : 'day';
  const night = jungleTime === 'night';
  sunDir.copy(st.sunDir);
  sun.color.setHex(st.sun.color);
  sun.intensity = st.sun.intensity;
  skyUniforms.uHorizon.value.setHex(st.sky.horizon);
  skyUniforms.uZenith.value.setHex(st.sky.zenith);
  skyUniforms.uGlow.value.setHex(st.sky.glow);
  skyUniforms.uGlowDir.value.copy(st.sunDir);
  skyUniforms.uGlowStrength.value = st.sky.strength;
  skyUniforms.uGlowTightness.value = st.sky.tightness;
  skyUniforms.uDisc.value = st.sky.disc;
  stars.visible = st.stars;
  renderer.toneMappingExposure = st.exposure;
  scene.environmentIntensity = st.env;
  envIntensity = st.env;
  FOG = st.fog;
  HEMI = st.hemi;
  ocean.setNight(night);
  falls.setNight(night);
  terrain.setNight(night);
  linerCtl.setNight(night);
  wildlife.setNight(night);
  fireflies.setNight(night);
  campfire.setNight(night);
  jettyLantern.setNight(night);
  nightFill.visible = night;
  if (night && !campfireSolid) {
    campfireSolid = true;
    for (const c of campfire.colliders) bw.add({ ...c, collide: true, prop: true, tall: false });
  }
  updateAtmosphere();
  updateSunShadow(ctrl.pos);
  window.__nightMode = night;
  window.__jungleTime = jungleTime;
}
let campfireSolid = false;

// ---------------------------------------------------------------------------
// By the fire. Night only: walk up to the inland log and the prompt offers a
// seat. Seated, she faces the fire and the sea with a blanket round her
// shoulders, holding it closed; the camera comes in low behind her. Any
// movement key, Space or E gets her back up where she was standing.
// ---------------------------------------------------------------------------
const SEAT_REACH = 1.3;
const FIRE_CAMERA = { distance: 2.5, lookHeight: 0.85 };
let seated = null;              // { returnPos, time, ready }
let seatPromptOpen = false, seatDeclined = false;
const SEAT_EXIT_KEYS = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space', 'KeyE'];

function nearSeat() {
  if (jungleTime !== 'night' || ctrl.mode !== 'ground') return false;
  const st = campfire.seat;
  // From behind or the ends of the log: the fire side is the fire.
  return Math.hypot(ctrl.pos.x - st.x, ctrl.pos.z - (st.z + 0.6)) < SEAT_REACH + 0.6;
}
function setSeatPrompt(show) {
  if (show === seatPromptOpen || !furniturePrompt) return;
  seatPromptOpen = show;
  furniturePrompt.textContent = show ? "S'asseoir près du feu  (E)" : '';
  furniturePrompt.classList.toggle('show', show);
  furniturePrompt.setAttribute('aria-hidden', show ? 'false' : 'true');
  // As on the other maps: the prompt frees the mouse so it can be clicked
  // (a locked pointer kept turning the camera instead), and walking away
  // takes the game back.
  if (show) {
    if (document.pointerLockElement === renderer.domElement) document.exitPointerLock?.();
  } else if (started && !paused && !leaving && !seated) {
    requestGamePointerLock();
  }
}
furniturePrompt?.addEventListener('click', e => {
  if (!seatPromptOpen) return;
  e.stopPropagation();
  sitByFire();
  requestGamePointerLock();
});
// A click anywhere on the view while the prompt is up sits down too.
renderer.domElement.addEventListener('click', () => {
  if (seatPromptOpen && !seated) { sitByFire(); requestGamePointerLock(); }
});
function sitByFire() {
  setSeatPrompt(false);
  const st = campfire.seat;
  seated = { returnPos: ctrl.pos.clone(), time: 0, ready: false };
  ctrl.pos.set(st.x, st.y, st.z);
  ctrl.prevY = st.y;
  ctrl.vel.set(0, 0, 0);
  ctrl.mode = 'sit';
  ctrl.webOn = false;
  ctrl.furnitureCamera = FIRE_CAMERA;
  input.yaw = st.yaw + Math.PI;     // the camera behind her, looking where she does
  input.pitch = -0.12;
  rig.initialized = false;          // a clean cut to the seat, no slide across the sand
  // The hem rests on the log and the sand.
  blanket.show(true, { capsules: [st.log], floorY: st.floorY });
}
function standFromFire() {
  if (!seated) return;
  ctrl.pos.copy(seated.returnPos);
  ctrl.prevY = ctrl.pos.y;
  ctrl.vel.set(0, 0, 0);
  ctrl.mode = 'ground';
  ctrl.furnitureCamera = null;
  seated = null;
  seatDeclined = true;             // no prompt again until she walks off
  rig.initialized = false;
  blanket.show(false);
}
// Returns true while seated: the controller must not move her.
function updateFireSeat(dt) {
  if (seated) {
    seated.time += dt;
    const held = SEAT_EXIT_KEYS.some(c => input.down(c) || input.pressed(c));
    if (!held && seated.time > 0.1) seated.ready = true;
    if (held && (seated.ready || seated.time > 0.4)) standFromFire();
    return !!seated;
  }
  const near = nearSeat();
  if (!near) seatDeclined = false;
  setSeatPrompt(near && !seatDeclined && !tenderAskOpen);
  if (seatPromptOpen && input.pressed('KeyE')) { sitByFire(); return true; }
  return false;
}

const resortTravel = createIslandTravel({gate:JUNGLE_RESORT_GATE,map:'resort',arrival:'jungle',getTime:()=>islandTravelTime,onLeave:()=>{leaving=true;}});
const resortAction=document.createElement('button');resortAction.id='jungleResortAction';resortAction.className='resort-action';resortAction.textContent='E · Village touristique';resortAction.hidden=true;document.body.appendChild(resortAction);
resortAction.addEventListener('click',()=>{if(started&&!paused&&!leaving&&!seated)resortTravel.go();});
function updateResortTravel(){const active=!seated&&!tenderAskOpen&&!leaving&&resortTravel.near(ctrl.pos);resortAction.hidden=!active;if(active&&input.pressed('KeyE')){resortTravel.go();return true;}return false;}

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
    if (!updateResortTravel() && !updateFireSeat(dt)) ctrl.update(dt, input, input.yaw, forward);
    if (ctrl.pos.y < -40) ctrl.rescueTo(spawnPoint);
    updatePrompts();
  }

  ocean.update(t);
  falls.update(t);
  fireflies.update(t);
  campfire.update(t);
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
  // The hour is read when you step ashore, not when the module loads: the
  // menu's day/night toggle is set after the map has started loading.
  setJungleTime(travelParams.get('time')
    ?? (window.__nightMode === true ? 'night' : 'day'));
  resumePlay();
}
window.__startJungle = startJungle;
startBtn?.addEventListener('click', startJungle);
if (arrivedFromCruise || arrivedFromResort || window.__startRequested) startJungle();

document.addEventListener('pointerlockchange', () => {
  usedLock = usedLock || document.pointerLockElement !== null;
  // Dropping the lock so the tender's buttons can be clicked is intentional.
  if ((tenderAskOpen || seatPromptOpen || leaving) && document.pointerLockElement === null) {
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
  fireflies.resize(window.innerHeight * renderer.getPixelRatio());
  campfire.resize(window.innerHeight * renderer.getPixelRatio());
}
window.addEventListener('resize', onResize);
onResize();

// Inspection hook for the headless capture tooling. Also `__villa`, like the
// other worlds, so the shared framing scripts work unchanged.
const hook = {
  THREE, scene, camera, renderer, world, ctrl, rig, input, spawnPoint, bw,
  terrainHeight, ocean, falls, vegetation, terrain, tender, tenderCtl, liner, wildlife,
  fireflies, campfire, blanket, setJungleTime, updateAtmosphere, nightFill, sitByFire, standFromFire,
  resortTravel, resortAction, resortPathPoints,
  get islandTravelTime() { return islandTravelTime; },
  get jungleTime() { return jungleTime; }, get seated() { return seated; },
  SEA_Y, SPAWN, TENDER_SPOT, JETTY, POOL, FALLS, WADE_Z,
  get player() { return player; },
  playerReady,
};
window.__jungle = hook;
window.__villa = hook;
