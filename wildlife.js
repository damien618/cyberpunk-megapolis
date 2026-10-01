// wildlife.js — the island's animals: one generic manager that any map can
// populate with any species. The how-to for adding a species is WILDLIFE.md;
// wildlifeCrab.js is the reference species. (Not to be confused with
// fauna.js, the zoo's skinned GLB animals — a different system.)
//
// This module owns no map and no species. A map hands it:
//
//   layout   an adapter over the map's ground and water (see LAYOUT below),
//            so the same species can live on the cove, the villages or
//            anywhere else that answers the same questions;
//   species  a list of { def, ...overrides } — `def` is the object a
//            wildlifeXxx.js module exports, the overrides are per-map
//            (count, habitat, fear…), merged one level deep.
//
// and calls update(dt, t, playerPos, playerVel) once a frame.
//
// Five rules shape this file:
//
// 1. ONE InstancedMesh per species. The visible agents are packed at the
//    front of its buffers and `count` is set to how many there are, so a
//    hidden or distant animal costs the GPU nothing. One draw call each.
// 2. No skeleton. A species' geometry carries a part id (aPart) and a joint
//    (aPivot) per vertex; the manager writes a vec4 per instance (aAnim:
//    idle phase, gait, mood, stride) and the species' own GLSL swings the
//    parts about their joints in the vertex shader (makeCreatureMaterial).
// 3. Only what is near is alive. Beyond `activeRadius` of the player an
//    agent is frozen and not drawn; past NEAR_TIER it thinks one frame in
//    four. No physics, no raycasts — only the layout's analytic functions.
// 4. Nothing here goes on the map's `world`: cityBoxes would turn every crab
//    into a wall and a camera occluder (jungleVegetation's rule 3).
// 5. Each species draws from its OWN seeded RNG, hashed from the map seed
//    and its id. Adding a species never reshuffles another, and the map's
//    shared rnd() — which lays out the rocks and the plants — is untouched.
//
// LAYOUT — what a map's adapter provides (jungleWildlife.js is the example):
//
//   terrainHeight(x, z), terrainSlope(x, z), terrainNormal(x, z) → {x,y,z}
//   soilAt(x, z), SOIL          the map's soil enum, matched by NAME in habitats
//   shoreDistance(x, z)         signed metres above the sea's mean waterline
//   waterlineZ(x)               where the water's edge is RIGHT NOW (swash)
//   waterAt(x, z)               → { kind: 'sea'|'pool'|'stream', y } or null
//   distances: { name: (x, z) → metres }   e.g. path, stream, jetty, rocks
//   spots:     { name: spotIndex }         e.g. rocks, later flowers
//   bounds:    { x: [a, b], z: [a, b] }    the default sampling box
//   keepOffBuilt(x, z) → bool   optional, as in jungleVegetation's rules
//
// A species only ever reads the layout through these names, so a map that
// lacks one (no sea inland) simply leaves it out and the species that need
// it are not put on that map.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { MOTION, wrapAngle } from './wildlifeMotion.js?v=20260930-amph1';

// ---------------------------------------------------------------------------
// States. Every species runs the same machine and opts out of what it does
// not do: a zero `timings.alert` skips ALERT, a missing `fear.hideFor`
// means FLEE ends in IDLE rather than HIDDEN.
//
//   IDLE ⇄ MOVE            wandering inside homeRange of its home
//   → ALERT → FLEE         the player came within fear.radius (runRadius if
//                          running): freeze a beat, then run for a refuge
//   → HIDDEN → EMERGE      in the refuge (burrow, water, under a rock);
//                          out again after hideFor, once the player is
//                          past calmDistance, then back toward home
// ---------------------------------------------------------------------------
export const STATE = { IDLE: 0, MOVE: 1, ALERT: 2, FLEE: 3, HIDDEN: 4, EMERGE: 5 };
export const STATE_NAME = Object.keys(STATE);

const NEAR_TIER = 25;          // m: inside, every frame; outside, 1 frame in 4
const RUN_SPEED = 3.0;         // m/s of the player that counts as running
const FLEE_MAX = 6;            // s: a flight that has not arrived hides where it is

// ---------------------------------------------------------------------------
// Small pure helpers, exported for the species modules and the tests.
// ---------------------------------------------------------------------------
export function hashSeed(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619) >>> 0;
  return h;
}
// mulberry32: tiny, fast, good enough for scatter and coin flips.
export function makeRng(seed) {
  let a = seed >>> 0;
  const rng = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  rng.range = ([a0, a1]) => a0 + rng() * (a1 - a0);
  return rng;
}
export { wrapAngle };

// A grid over a list of { x, z, r } spots (rocks, flowers, perches…) so
// "the nearest one" is cheap enough to ask at runtime.
export function spotIndex(spots, cell = 8) {
  const grid = new Map();
  const key = (i, j) => i * 73856093 ^ j * 19349663;
  for (const s of spots) {
    const k = key(Math.floor(s.x / cell), Math.floor(s.z / cell));
    if (!grid.has(k)) grid.set(k, []);
    grid.get(k).push(s);
  }
  const hit = { spot: null, d: Infinity };
  return {
    spots,
    // Nearest spot SURFACE (distance to centre minus r) within maxR, or
    // { spot: null, d: Infinity }. Returns a shared object: copy what you keep.
    nearest(x, z, maxR = cell) {
      hit.spot = null; hit.d = Infinity;
      const n = Math.ceil(maxR / cell);
      const ci = Math.floor(x / cell), cj = Math.floor(z / cell);
      for (let i = ci - n; i <= ci + n; i++) {
        for (let j = cj - n; j <= cj + n; j++) {
          const list = grid.get(key(i, j));
          if (!list) continue;
          for (const s of list) {
            const d = Math.hypot(s.x - x, s.z - z) - (s.r || 0);
            if (d < hit.d && d <= maxR) { hit.d = d; hit.spot = s; }
          }
        }
      }
      return hit;
    },
  };
}

// ---------------------------------------------------------------------------
// Habitat: the declarative "where may this animal live". Every key is
// optional; all present keys must pass.
//
//   region:  { x: [a, b], z: [a, b] }   sampling box (default layout.bounds)
//   soils:   ['SAND', 'WET']            names from layout.SOIL
//   slope:   [min, max]                 tangent (0 flat, 1 = 45°)
//   height:  [min, max]                 altitude of the ground, metres
//   shore:   [min, max]                 layout.shoreDistance, metres
//   avoid:   { path: 1.5, jetty: 1 }    stay this far from layout.distances.*
//   within:  { rocks: 20 }              stay this close to layout.distances.*
//   near:    { rocks: 6, share: 0.6 }   this SHARE of the homes lies within
//                                       the distance (the rest anywhere)
//   test:    (x, z, layout) → bool      anything the keys cannot say
// ---------------------------------------------------------------------------
export function habitatTest(h, L, x, z) {
  if (L.keepOffBuilt && !L.keepOffBuilt(x, z)) return false;
  if (h.shore) {
    const d = L.shoreDistance(x, z);
    if (d < h.shore[0] || d > h.shore[1]) return false;
  }
  if (h.avoid) for (const k in h.avoid) if (L.distances[k](x, z) < h.avoid[k]) return false;
  if (h.within) for (const k in h.within) if (L.distances[k](x, z) > h.within[k]) return false;
  if (h.height) {
    const y = L.terrainHeight(x, z);
    if (y < h.height[0] || y > h.height[1]) return false;
  }
  if (h.slope) {
    const s = L.terrainSlope(x, z);
    if (s < h.slope[0] || s > h.slope[1]) return false;
  }
  if (h.soils) {
    const s = L.soilAt(x, z);
    if (!h.soils.some(n => L.SOIL[n] === s)) return false;
  }
  if (h.test && !h.test(x, z, L)) return false;
  return true;
}

// Rejection-sample `count` homes. The costly keys (soil, slope) run last in
// habitatTest, so most rejects are cheap.
export function sampleHomes(h, L, rng, count, { spacing = 0 } = {}) {
  const reg = h.region || L.bounds;
  const homes = [];
  const nearKey = h.near && Object.keys(h.near).find(k => k !== 'share');
  const nearCount = nearKey ? Math.round(count * (h.near.share ?? 1)) : 0;
  for (let tries = 0; homes.length < count && tries < count * 600; tries++) {
    const x = rng.range(reg.x), z = rng.range(reg.z);
    if (homes.length < nearCount && L.distances[nearKey](x, z) > h.near[nearKey]) continue;
    if (spacing > 0 && homes.some(p => Math.hypot(p.x - x, p.z - z) < spacing)) continue;
    if (!habitatTest(h, L, x, z)) continue;
    homes.push({ x, z });
  }
  return homes;
}

// ---------------------------------------------------------------------------
// Geometry helpers for procedural species: every piece carries a colour, a
// part id and a joint, and the pieces are merged into one geometry.
// ---------------------------------------------------------------------------
// Tag a geometry as one part of a creature. Drops UVs (nothing is textured)
// and goes non-indexed, so flat shading gets a crisp facet per face.
export function creaturePart(geo, { part = 0, pivot = [0, 0, 0], color = 0xffffff, bottomColor = null } = {}) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  g.deleteAttribute('uv');
  const n = g.attributes.position.count;
  const col = new Float32Array(n * 3), prt = new Float32Array(n), piv = new Float32Array(n * 3);
  const top = new THREE.Color(color), bot = new THREE.Color(bottomColor ?? color);
  const nrm = g.attributes.normal;
  for (let i = 0; i < n; i++) {
    // Faces turned to the ground take the bottom colour: a baked underside
    // that seats small animals without a shadow pass.
    const c = nrm && nrm.getY(i) < -0.5 ? bot : top;
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    prt[i] = part;
    piv[i * 3] = pivot[0]; piv[i * 3 + 1] = pivot[1]; piv[i * 3 + 2] = pivot[2];
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('aPart', new THREE.BufferAttribute(prt, 1));
  g.setAttribute('aPivot', new THREE.BufferAttribute(piv, 3));
  return g;
}

// A box of square section `t` running from point a to point b (a limb).
const _la = new THREE.Vector3(), _lb = new THREE.Vector3(), _lm = new THREE.Matrix4();
export function limbGeometry(a, b, t, t2 = t) {
  _la.fromArray(a); _lb.fromArray(b);
  const len = _la.distanceTo(_lb);
  const g = new THREE.BoxGeometry(t, t2, len);
  g.translate(0, 0, len / 2);
  _lm.lookAt(_la, _lb, Math.abs(_lb.y - _la.y) > len * 0.99 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0));
  // lookAt aims -Z at the target for cameras; flip so +Z runs a → b.
  _lm.multiply(new THREE.Matrix4().makeRotationY(Math.PI));
  _lm.setPosition(_la);
  return g.applyMatrix4(_lm);
}

export function mergeCreatureParts(parts) {
  const g = mergeGeometries(parts);
  g.computeBoundingSphere();
  g.computeBoundingBox();
  return g;
}

// ---------------------------------------------------------------------------
// The creature material: MeshStandardMaterial, flat-shaded, vertex-coloured
// (like the rocks), with the species' GLSL spliced in after begin_vertex.
// The snippet sees `transformed` (object space, before the instance matrix)
// and may read:
//   uniform float uTime;   attribute float aPart;  attribute vec3 aPivot;
//   attribute vec4 aAnim;  // x idle phase, y gait 0..1, z mood 0..1, w stride (rad)
//   vec3 wlRotX/Y/Z(vec3 p, vec3 pivot, float angle)   rotate about a joint
// Normals need no care: flat shading derives them per face in the fragment
// shader, so a swung leg lights correctly.
// ---------------------------------------------------------------------------
const WL_TIME = { value: 0 };
const WL_HEAD = `
  uniform float uTime;
  attribute float aPart;
  attribute vec3 aPivot;
  attribute vec4 aAnim;
  vec3 wlRotX(vec3 p, vec3 o, float a) { p -= o; float c = cos(a), s = sin(a);
    return o + vec3(p.x, c * p.y - s * p.z, s * p.y + c * p.z); }
  vec3 wlRotY(vec3 p, vec3 o, float a) { p -= o; float c = cos(a), s = sin(a);
    return o + vec3(c * p.x + s * p.z, p.y, -s * p.x + c * p.z); }
  vec3 wlRotZ(vec3 p, vec3 o, float a) { p -= o; float c = cos(a), s = sin(a);
    return o + vec3(c * p.x - s * p.y, s * p.x + c * p.y, p.z); }
`;
export function makeCreatureMaterial({ id, animGLSL = '', roughness = 0.8, metalness = 0 }) {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness, metalness });
  mat.onBeforeCompile = sh => {
    sh.uniforms.uTime = WL_TIME;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\n' + WL_HEAD)
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n{\n' + animGLSL + '\n}\n');
  };
  mat.customProgramCacheKey = () => 'wildlife:' + id;
  return mat;
}

// ---------------------------------------------------------------------------
// Species definition defaults. A species module spreads over these; the map
// overrides spread over the species (one level deep for the objects).
// ---------------------------------------------------------------------------
const DEFAULTS = {
  motion: 'ground',
  count: 10,
  habitat: {},
  homeRange: 4,
  activeRadius: 40,
  fear: { radius: 4, runRadius: 7, calmDistance: 12, hideFor: null },
  speed: { walk: 0.5, flee: 2, turn: 6 },
  body: { yawOffset: 0, sideways: false, alignToGround: true, lift: 0, sinkDepth: 0, sinkTime: 0.4, scale: [1, 1] },
  timings: { idle: [2, 5], move: [1, 3], alert: 0 },
  tint: null,             // (rng, color) → void: per-instance colour variation
  hooks: {},
  castShadow: false,
};
const MERGED = ['habitat', 'fear', 'speed', 'body', 'timings', 'hooks'];
export function resolveSpecies(def, over = {}) {
  const s = { ...DEFAULTS, ...def, ...over };
  for (const k of MERGED) s[k] = { ...DEFAULTS[k], ...(def[k] || {}), ...(over[k] || {}) };
  return s;
}

// ---------------------------------------------------------------------------
// The manager.
// ---------------------------------------------------------------------------
export function createWildlife({ scene, layout: L, species = [], seed = 'map' }) {
  const group = new THREE.Group();
  group.name = 'wildlife';
  scene.add(group);

  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _qa = new THREE.Quaternion();
  const _p = new THREE.Vector3(), _s = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);
  const _fwd = new THREE.Vector3(0, 0, 1);
  const _n = new THREE.Vector3(), _c = new THREE.Color();

  const runtimes = species.map(entry => {
    const def = resolveSpecies(entry.def, entry);
    const motion = MOTION[def.motion];
    if (!motion) throw new Error(`[wildlife] ${def.id}: unknown motion "${def.motion}"`);
    const rng = makeRng(hashSeed(seed + ':' + def.id));
    const sp = { def, motion, rng, frame: 0, visible: 0, active: 0 };
    def.hooks.init?.(sp, L);

    const homes = sampleHomes(def.habitat, L, rng, def.count, { spacing: def.spacing || 0 });
    sp.agents = homes.map((h, i) => {
      const a = {
        i, home: h, x: h.x, z: h.z, y: L.terrainHeight(h.x, h.z),
        heading: rng() * Math.PI * 2, yaw: 0, side: 1, speed: 0,
        tx: h.x, tz: h.z, state: STATE.IDLE, timer: rng.range(def.timings.idle),
        acc: 0, sink: 0, gait: 0, mood: 0, stride: rng() * 6.283, phase: rng() * 6.283,
        scale: rng.range(def.body.scale), nx: 0, ny: 1, nz: 0, normalAge: 99,
        dist: Infinity, color: new THREE.Color(1, 1, 1), awake: false,
      };
      a.yaw = a.heading + def.body.yawOffset;
      def.tint?.(rng, a.color);
      return a;
    });

    const { geometry } = def.build();
    const n = Math.max(1, sp.agents.length);
    const anim = new THREE.InstancedBufferAttribute(new Float32Array(n * 4), 4);
    anim.setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute('aAnim', anim);
    const mesh = new THREE.InstancedMesh(geometry, makeCreatureMaterial(def), n);
    mesh.name = 'wildlife_' + def.id;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.setColorAt(0, _c.set(1, 1, 1));
    mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    mesh.count = 0;
    mesh.castShadow = def.castShadow;
    mesh.receiveShadow = true;
    group.add(mesh);
    Object.assign(sp, { mesh, anim });
    return sp;
  });

  // -------------------------------------------------------------------------
  // Behaviour.
  // -------------------------------------------------------------------------
  const ctx = { t: 0, px: 0, pz: 0, pSpeed: 0, layout: L, STATE };

  // Default wander: a point inside homeRange, re-drawn until it is in the
  // habitat (a few tries — the home itself is always a valid fallback).
  function defaultWander(a, sp) {
    const { def, rng } = sp;
    for (let k = 0; k < 6; k++) {
      const r = def.homeRange * Math.sqrt(rng()), th = rng() * Math.PI * 2;
      const x = a.home.x + Math.cos(th) * r, z = a.home.z + Math.sin(th) * r;
      if (habitatTest(def.habitat, L, x, z)) return setTarget(a, sp, x, z);
    }
    return setTarget(a, sp, a.home.x, a.home.z);
  }
  // Default flight: straight away from the player, a few metres.
  function defaultFlee(a, sp) {
    const dx = a.x - ctx.px, dz = a.z - ctx.pz, l = Math.hypot(dx, dz) || 1;
    const run = sp.def.fear.runRadius * 0.8;
    return setTarget(a, sp, a.x + dx / l * run, a.z + dz / l * run);
  }
  // Point the agent at a target. A sideways walker (crab) picks the side
  // that turns its body least, so it changes direction without spinning.
  function setTarget(a, sp, x, z) {
    a.tx = x; a.tz = z;
    const b = sp.def.body;
    if (b.sideways) {
      const h = Math.atan2(x - a.x, z - a.z);
      a.heading = h;
      a.side = Math.abs(wrapAngle(h + b.yawOffset - a.yaw)) <= Math.abs(wrapAngle(h - b.yawOffset - a.yaw)) ? 1 : -1;
    }
    return true;
  }
  const api = { setTarget, defaultWander, defaultFlee };

  function enter(a, sp, state, timer = 0) {
    a.state = state; a.timer = timer; a.speed = 0;
  }

  function think(a, sp, dt) {
    const { def, rng } = sp;
    const H = def.hooks;
    const threat = def.fear.radius > 0
      && a.dist < (ctx.pSpeed > RUN_SPEED ? def.fear.runRadius : def.fear.radius);
    a.timer -= dt;
    // A species may take the frame over (the crab steps back from the swash).
    if (H.tick && H.tick(a, sp, ctx, dt, api, threat)) return;

    switch (a.state) {
      case STATE.IDLE:
        if (threat) { startAlarm(a, sp); break; }
        if (a.timer <= 0) {
          (H.pickWander || defaultWander)(a, sp, ctx, api);
          enter(a, sp, STATE.MOVE, rng.range(def.timings.move));
        }
        break;
      case STATE.MOVE:
        if (threat) { startAlarm(a, sp); break; }
        if (sp.motion.step(a, sp, dt, ctx, def.speed.walk) || a.timer <= 0) {
          enter(a, sp, STATE.IDLE, rng.range(def.timings.idle));
        }
        break;
      case STATE.ALERT: {
        // Face the threat — claws, jaws or eyes toward it.
        const want = Math.atan2(ctx.px - a.x, ctx.pz - a.z);
        a.yaw += wrapAngle(want - a.yaw) * Math.min(1, dt * def.speed.turn);
        if (a.timer <= 0) startFlight(a, sp);
        break;
      }
      case STATE.FLEE:
        if (sp.motion.step(a, sp, dt, ctx, def.speed.flee) || a.timer <= 0) {
          if (def.fear.hideFor) {
            (H.hideAt || (() => {}))(a, sp, ctx, api);
            enter(a, sp, STATE.HIDDEN, rng.range(def.fear.hideFor));
          } else {
            enter(a, sp, STATE.IDLE, rng.range(def.timings.idle));
          }
        }
        break;
      case STATE.HIDDEN:
        a.sink = Math.min(1, a.sink + dt / def.body.sinkTime);
        if (a.timer <= 0 && a.dist > def.fear.calmDistance) {
          (H.emergeAt || (() => {}))(a, sp, ctx, api);
          enter(a, sp, STATE.EMERGE);
        }
        break;
      case STATE.EMERGE:
        a.sink = Math.max(0, a.sink - dt / def.body.sinkTime);
        if (a.sink <= 0) {
          setTarget(a, sp, a.home.x, a.home.z);     // home, then wander on
          enter(a, sp, STATE.MOVE, def.homeRange * 3 / Math.max(def.speed.walk, 0.01));
        }
        break;
    }
  }
  function startAlarm(a, sp) {
    if (sp.def.timings.alert > 0) enter(a, sp, STATE.ALERT, sp.def.timings.alert);
    else startFlight(a, sp);
  }
  function startFlight(a, sp) {
    (sp.def.hooks.fleeTarget || defaultFlee)(a, sp, ctx, api);
    enter(a, sp, STATE.FLEE, FLEE_MAX);
  }

  // Gait and mood ease toward what the state asks, so legs spin up and
  // claws rise rather than snapping.
  function animate(a, sp, dt) {
    const f = sp.def.speed.flee || 1;
    const gaitWant = a.state === STATE.MOVE || a.state === STATE.FLEE ? a.speed / f : 0;
    a.gait += (Math.min(1, gaitWant * 1.6) - a.gait) * Math.min(1, dt * 8);
    const moodWant = a.state === STATE.ALERT || a.state === STATE.FLEE ? 1 : 0;
    a.mood += (moodWant - a.mood) * Math.min(1, dt * 6);
    a.stride += a.speed * dt * (sp.def.strideRate || 40);
  }

  // Normal of the ground under an agent, re-sampled at most 5 times a
  // second and only for species that tilt with the ground.
  function groundNormal(a, sp, dt) {
    a.normalAge += dt;
    if (!sp.def.body.alignToGround || a.normalAge < 0.2) return;
    a.normalAge = 0;
    const n = L.terrainNormal(a.x, a.z);
    a.nx = n.x; a.ny = n.y; a.nz = n.z;
  }

  // -------------------------------------------------------------------------
  // Instances.
  // -------------------------------------------------------------------------
  function writeInstances(sp) {
    const { mesh, anim, def } = sp;
    let k = 0;
    for (const a of sp.agents) {
      if (!a.awake || a.sink >= 1) continue;
      _p.set(a.x, a.y + def.body.lift - a.sink * def.body.sinkDepth, a.z);
      _q.setFromAxisAngle(_up, a.yaw);
      // A flyer's bank: a roll about the body's own forward axis, written by
      // the glide motion. Only a species that sets a.roll pays for this —
      // for everyone else the field is undefined and the branch never runs.
      if (a.roll) {
        _qa.setFromAxisAngle(_fwd, a.roll);
        _q.multiply(_qa);
      }
      if (def.body.alignToGround) {
        _qa.setFromUnitVectors(_up, _n.set(a.nx, a.ny, a.nz));
        _q.premultiply(_qa);
      }
      _s.setScalar(a.scale);
      mesh.setMatrixAt(k, _m.compose(_p, _q, _s));
      mesh.setColorAt(k, a.color);
      anim.setXYZW(k, a.phase, a.gait, a.mood, a.stride);
      k++;
    }
    mesh.count = k;
    sp.visible = k;
    if (k) {
      mesh.instanceMatrix.needsUpdate = true;
      mesh.instanceColor.needsUpdate = true;
      anim.needsUpdate = true;
      mesh.computeBoundingSphere();
    }
  }

  // -------------------------------------------------------------------------
  // Per frame.
  // -------------------------------------------------------------------------
  const stats = { ms: 0, active: 0, visible: 0, species: {} };
  function update(dt, t, playerPos, playerVel) {
    const t0 = performance.now();
    WL_TIME.value = t;
    ctx.t = t; ctx.px = playerPos.x; ctx.pz = playerPos.z;
    ctx.pSpeed = playerVel ? Math.hypot(playerVel.x, playerVel.z) : 0;
    stats.active = 0; stats.visible = 0;
    for (const sp of runtimes) {
      sp.frame++;
      sp.active = 0;
      const R = sp.def.activeRadius;
      for (const a of sp.agents) {
        a.dist = Math.hypot(a.x - ctx.px, a.z - ctx.pz);
        // Asleep beyond activeRadius — measured from home too, so an animal
        // that wandered to the edge does not flicker.
        a.awake = a.dist < R;
        if (!a.awake) { a.acc = 0; continue; }
        sp.active++;
        a.acc += dt;
        if (a.dist > NEAR_TIER && (sp.frame + a.i) % 4 !== 0) continue;
        const step = Math.min(a.acc, 0.15);
        a.acc = 0;
        think(a, sp, step);
        animate(a, sp, step);
        groundNormal(a, sp, step);
      }
      writeInstances(sp);
      stats.active += sp.active;
      stats.visible += sp.visible;
      stats.species[sp.def.id] = { active: sp.active, visible: sp.visible, total: sp.agents.length };
    }
    const ms = performance.now() - t0;
    stats.ms += (ms - stats.ms) * 0.1;
  }

  const counts = Object.fromEntries(runtimes.map(sp => [sp.def.id, sp.agents.length]));
  return {
    group, update, stats, counts, STATE, STATE_NAME,
    // For the tests and the capture tooling: every agent, by species id.
    debug: { species: Object.fromEntries(runtimes.map(sp => [sp.def.id, sp])) },
  };
}
