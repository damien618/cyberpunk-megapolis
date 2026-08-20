// fauna.js — the park's animals.
//
// The models are real, textured animals rather than the flat-shaded low-poly
// pack that was here before, and they do not come from one source, so nothing
// below may assume a shared rig, a shared clip name or even a skeleton:
//
//   lion           skinned WildMesh demo: Idle / Walk / WalkSlow clips (in-place).
//   fox            Khronos sample: Survey / Walk / Run, orange coat that reads
//                  at the glass (the komodo it replaced was a dark silhouette).
//   zebra          skinned, 32 bones, one Idle clip.
//   peacock, crow  skinned, Rigify rigs, their own Idle clips.
//
// Each species therefore declares what it is: which file, which measurement it
// is scaled by, and which clips are worth standing in front of.
//
// Cloning goes through crowd.js: three.js copies a SkinnedMesh still bound to
// the skeleton it came from, so every clone would otherwise play the first
// one's animation in the first one's pose. On the rigless models it is an
// ordinary deep clone.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { cloneSkinned } from './crowd.js?v=19';

const dracoLoader = new DRACOLoader().setDecoderPath('./vendor/draco/');

/**
 * The lion albedo is a flat mid-brown that reads almost black under the
 * paddock glass.  Lift the midtones, warm the shadows a little, and leave the
 * highlights alone so the coat still has shape.
 */
function enhanceLionAlbedo(tex) {
  if (!tex?.image || tex.userData.lionWarmed) return tex;
  const img = tex.image;
  const w = img.width || img.videoWidth, h = img.height || img.videoHeight;
  if (!w || !h) return tex;
  const c = Object.assign(document.createElement('canvas'), { width: w, height: h });
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0);
  const d = ctx.getImageData(0, 0, w, h);
  const px = d.data;
  for (let i = 0; i < px.length; i += 4) {
    let r = px[i], g = px[i + 1], b = px[i + 2];
    // Skip the mouth island (saturated red) so gums stay gums.
    if (r > 140 && g < 90 && b < 90) continue;
    const lum = 0.3 * r + 0.59 * g + 0.11 * b;
    const lift = lum < 40 ? 1.55 : lum < 110 ? 1.35 : 1.12;
    r = Math.min(255, r * lift * 1.08 + 18);
    g = Math.min(255, g * lift * 0.98 + 10);
    b = Math.min(255, b * lift * 0.72 + 4);
    px[i] = r; px[i + 1] = g; px[i + 2] = b;
  }
  ctx.putImageData(d, 0, 0);
  const warmed = new THREE.CanvasTexture(c);
  warmed.flipY = tex.flipY;
  warmed.colorSpace = THREE.SRGBColorSpace;
  warmed.wrapS = tex.wrapS;
  warmed.wrapT = tex.wrapT;
  warmed.userData.lionWarmed = true;
  return warmed;
}

/**
 * `fit` is [what to measure, how big it is in metres]:
 *
 *   withers  the ridge over the shoulder — what a field guide quotes for a
 *            hoofed animal or a big cat, and the only measurement that reads
 *            at exhibit range. Measured on the model, not guessed: see below.
 *   height   the top of the standing animal. For birds, that is the figure.
 *   length   the longest horizontal extent, for an animal that is mostly
 *            horizontal and whose shoulder means nothing — the komodo.
 *
 * lion standing height ~1.4 (mane) · plains zebra withers 1.3-1.4 · red fox
 * ~0.7 to the ears · Indian peafowl 1.0-1.2 · carrion crow 0.4-0.5
 */
export const SPECIES = {
  // Prefer *-IP clips: in-place, so locomotion comes from our roam code and
  // the feet do not skate against a root-motion track.
  // Fit by overall standing height (mane included): a withers-only 1.1 m read
  // as a large dog beside the ~1.7 m visitors. 1.42 m to the top of the mane
  // matches a big male next to a person at the glass.
  lion: {
    file: 'lion.glb', fit: ['height', 1.42],
    rest: ['Idle_00-IP', 'A_Idle_00', 'Idle_01-IP', 'A_Idle_01', 'Idle_02-IP'],
    walk: ['WalkSlow-IP', 'Walk-IP', 'WalkSlow', 'Walk'],
    // Lions do not pivot on a point when a new destination falls behind them.
    // They keep stepping, shed speed and describe an arc.  These values keep
    // that turn broad enough to read at exhibit distance while preserving the
    // unhurried walk of a cat that is not hunting.
    locomotion: {
      steering: 'curved', speed: [0.62, 0.88], turnRate: 0.48,
      turnAccel: 1.05, accel: 0.55, brake: 0.85,
      rest: [6, 16], bout: [10, 22], stop: 0.7,
    },
  },
  zebra: { file: 'zebra.glb', fit: ['withers', 1.35], rest: ['Idle_Armature'] },
  // Red fox: Survey is the looking-around idle, Walk is the gait. Sized a
  // little over a wild fox so five of them fill a 30 m paddock at the glass.
  fox: {
    file: 'fox.glb', fit: ['height', 0.72],
    rest: ['Survey'], walk: ['Walk'],
    locomotion: {
      steering: 'curved', speed: [0.78, 1.15], turnRate: 1.35,
      turnAccel: 2.1, accel: 1.35, brake: 1.7,
      rest: [3, 9], bout: [7, 16], stop: 0.5,
    },
  },
  peacock: { file: 'peacock.glb', fit: ['height', 1.10], rest: ['Idle'] },
  // The crow's one clip is a flight that lands: it hovers for the first two
  // seconds, comes down over the next two, and is perched from 4.2 s to the
  // end. Only the perched run is kept, or every crow in the farmyard spends a
  // third of its time hanging a metre over the straw.
  crow: {
    file: 'crow.glb', fit: ['height', 0.44],
    rest: ['rig|rigAction'], window: [4.4, 9.1],
    // The aviary birds fly between perches instead of wandering the ground:
    // `fly` is [min height, max height] of a cruise between perches.
    fly: [1.4, 3.6],
  },
};

/** The pack exports each clip twice, once bare and once armature-qualified. */
function findClip(clips, name) {
  return clips.find(c => c.name === name)
    || clips.find(c => c.name.endsWith(`|${name}`))
    || null;
}

/** First matching clip name that exists in the pack. */
function pickClip(clips, names) {
  for (const n of names ?? []) {
    const c = findClip(clips, n);
    if (c) return c;
  }
  return null;
}

/**
 * Drop translation tracks on the armature root only so roam position is ours.
 * Keep pelvis / hip bounce — that is part of the authored gait.
 */
function stripRootMotion(clip) {
  const out = clip.clone();
  out.tracks = out.tracks.filter(t => {
    if (!/\.position$/.test(t.name)) return true;
    const bone = t.name.split('.')[0].split('|').pop();
    return !/^(_?root(joint)?|rigroot|armature|rootnode)$/i.test(bone);
  });
  out.resetDuration();
  return out;
}

// Exporters suffix bone names with their index — `Shoulders_23`, `FrontLeg.R_3`
// — and the two rigs here spell the joint `FrontShoulder.L` and `Shoulders`.
// Matching on the word rather than the name is what lets one measurement serve
// both, and the front shoulder wins over the back one where a rig has both.
function findBone(root, word) {
  let hit = null;
  root.traverse(o => {
    if (!o.isBone || hit) return;
    const name = o.name.toLowerCase();
    if (name.includes(word) && !name.includes('back')) hit = o;
  });
  if (!hit) root.traverse(o => { if (o.isBone && !hit && o.name.toLowerCase().includes(word)) hit = o; });
  return hit;
}

// Every vertex of the model in world space, skinning included. `Box3` alone
// would do for the extents, but the withers needs the vertices themselves, and
// both have to see the SAME pose — see `measure` below.
function eachVertex(root, fn) {
  const v = new THREE.Vector3();
  root.traverse(o => {
    if (!o.isMesh && !o.isSkinnedMesh) return;
    const pos = o.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      if (o.isSkinnedMesh && o.getVertexPosition) o.getVertexPosition(i, v);
      else v.fromBufferAttribute(pos, i);
      fn(v.applyMatrix4(o.matrixWorld));
    }
  });
}

// The withers is the ridge over the shoulder. Measuring the model's TOTAL
// height and calling it that is what left the old pack short beside a person:
// the top of a standing model is an ear, an antler, or the top of the head.
// The shoulder joint is found by name and the withers is the highest skin in a
// slice of body around it.
function withersHeight(root, box) {
  const shoulder = findBone(root, 'shoulder')
    || findBone(root, 'chest')
    || findBone(root, 'collarbone')
    || findBone(root, 'spine3')
    || findBone(root, 'spine2');
  if (!shoulder) return null;
  const at = new THREE.Vector3().setFromMatrixPosition(shoulder.matrixWorld);
  // The body runs along whichever horizontal axis is longer; the slice is a
  // fraction of that length either side of the joint.
  const alongZ = (box.max.z - box.min.z) >= (box.max.x - box.min.x);
  const span = (alongZ ? box.max.z - box.min.z : box.max.x - box.min.x) * 0.12;
  const centre = alongZ ? at.z : at.x;
  let top = -Infinity;
  eachVertex(root, v => {
    if (Math.abs((alongZ ? v.z : v.x) - centre) <= span && v.y > top) top = v.y;
  });
  return top > box.min.y ? top - box.min.y : null;
}

/**
 * What one model unit is worth, from the measurement the species declares —
 * and how far the model's own origin sits above or below its feet, which is
 * nowhere near zero on a pack assembled from five sources.
 *
 * Measured on the POSED model, never the bind pose. The zebra's stance is
 * 0.94 m below its bind pose and holds there for the whole clip, so a foot
 * offset taken before the mixer ran buried it to the hocks; the peacock stood
 * 30 cm into the lawn for the same reason.
 */
function measure(root, [what, metres]) {
  root.updateMatrixWorld(true);
  root.traverse(o => { if (o.isSkinnedMesh) o.boundingBox = null; });
  const box = new THREE.Box3();
  eachVertex(root, v => box.expandByPoint(v));
  const height = Math.max(box.max.y - box.min.y, 1e-4);
  let measured = height;
  if (what === 'length') {
    measured = Math.max(box.max.x - box.min.x, box.max.z - box.min.z, 1e-4);
  } else if (what === 'withers') {
    measured = withersHeight(root, box) ?? height;
  }
  return { scale: metres / measured, foot: box.min.y };
}

export async function loadSpecies(names) {
  const loader = new GLTFLoader().setDRACOLoader(dracoLoader);
  const out = {};
  for (const name of names) {
    const spec = SPECIES[name];
    if (!spec) continue;
    try {
      const gltf = await loader.loadAsync(`./glb/animals/${spec.file}?v=30`);
      const root = gltf.scene;
      let resting = (spec.rest ?? [])
        .map(n => findClip(gltf.animations, n)).filter(Boolean);
      // One walk clip is enough; prefer the first name that resolves.
      let walking = [];
      const walkClip = pickClip(gltf.animations, spec.walk);
      if (walkClip) walking = [stripRootMotion(walkClip)];
      // Idle clips used for roam also drop root translation so a rest pose
      // cannot drift the animal across the paddock.
      if (walking.length && resting.length) {
        resting = resting.map(stripRootMotion);
      }
      if (spec.window) {
        const [t0, t1] = spec.window;
        resting = resting.map(c => {
          const cut = THREE.AnimationUtils.subclip(
            c.clone(), `${c.name}_kept`, Math.round(t0 * 30), Math.round(t1 * 30), 30);
          cut.resetDuration();
          return cut;
        });
      }
      // Put the template into the pose its clones will hold before measuring
      // it. The clones get their own mixers straight after and drive it from
      // there; this is only so the tape measure meets the animal standing up.
      let posed = null;
      if (resting.length) {
        posed = new THREE.AnimationMixer(root);
        posed.clipAction(resting[0]).play();
        posed.setTime(0);
      }
      const spec2 = measure(root, spec.fit);
      // The lowest the feet get anywhere in the clip, not just on its first
      // frame: a perched bird rocks a few centimetres, and the ground is not
      // going to move out of its way.
      if (posed) {
        const dur = resting[0].duration;
        for (let i = 1; i < 6; i++) {
          posed.setTime((dur * i) / 6);
          spec2.foot = Math.min(spec2.foot, measure(root, spec.fit).foot);
        }
        posed.setTime(0);
      }
      // `fitMetres` is the species' own size in metres, which is what a stride
      // is measured against — a crow does not take a zebra's step.
      out[name] = {
        root, clips: gltf.animations, resting, walking, fitMetres: spec.fit[1],
        flex: spec.flex ?? null, rig: spec.rig ?? null, fly: spec.fly ?? null,
        locomotion: spec.locomotion ?? null,
        ...spec2,
      };
    } catch (e) {
      console.warn('[zoo] animal model unavailable:', spec.file, e);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Motion
//
// The clips these models ship with are idles in the strictest sense: over six
// seconds the zebra's head travels 1.7 cm, the peacock's tail 0.1 mm, and the
// lion and the komodo have no skeleton left at all. At exhibit distance that is
// a photograph. So the animals are driven from here instead — posed from their
// own rest pose every frame, AFTER the mixer has written the clip, which is why
// nothing accumulates and nothing fights the clip underneath.
// ---------------------------------------------------------------------------

// Rigify ships four bones for every joint that deforms — ORG-, MCH-, VIS-,
// tweak- and the DEF- one that actually moves skin. Drive anything else and
// the model does not move; drive the controls and it moves twice.
const CONTROL = /(_end$|_end_|\bend\b|ik|pole|target|wgt|vis[_-]|mch-|org-|tweak)/i;

function usableBones(root) {
  const all = [];
  root.traverse(o => { if (o.isBone && !CONTROL.test(o.name)) all.push(o); });
  const def = all.filter(b => /^def-/i.test(b.name));
  return def.length >= 4 ? def : all;
}

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const AXES = [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1)];

/**
 * Which way, in this bone's OWN local space, does a positive rotation swing its
 * child forwards? Every pack orients its joints differently and guessing an
 * axis gives you a leg that swings sideways, so it is measured: rotate the bone
 * a little about each axis in turn and keep whichever moves the child furthest
 * along the body's forward line.
 */
function swingAxis(bone, forward) {
  const child = bone.children.find(c => c.isBone);
  if (!child) return null;
  const rest = bone.quaternion.clone();
  bone.updateWorldMatrix(true, true);
  const base = _v.setFromMatrixPosition(child.matrixWorld).clone();
  let best = null;
  for (const axis of AXES) {
    for (const sign of [1, -1]) {
      bone.quaternion.copy(rest).multiply(_q.setFromAxisAngle(axis, sign * 0.35));
      bone.updateWorldMatrix(false, true);
      const moved = _v2.setFromMatrixPosition(child.matrixWorld).sub(base).dot(forward);
      if (!best || moved > best.moved) best = { axis, sign, moved };
    }
  }
  bone.quaternion.copy(rest);
  bone.updateWorldMatrix(false, true);
  return best && best.moved > 1e-5 ? best : null;
}

// ---------------------------------------------------------------------------
// Quadruped walk — feline lateral-sequence gait
//
// The lion mesh is frozen mid-stride (its animation was stripped), so a large
// hip swing on top of that bind pose reads as a stick-figure toy.  Cats also
// walk with a high duty factor and a short, quiet step.  These curves stay
// modest, ease both ends of the swing, and leave room for a per-leg stance
// bias that cancels the mid-stride asymmetry of the auto-rig.
// ---------------------------------------------------------------------------
const _smooth = t => t * t * (3 - 2 * t);
const QUAD_DUTY = 0.70;

/** Phase offset in [0, 1) for a lateral-sequence walk. */
function quadWalkPhase(leg) {
  if (!leg.front && leg.left) return 0.00;   // LH
  if (leg.front && leg.left) return 0.22;    // LF — slight couplet lag, feline
  if (!leg.front && !leg.left) return 0.50;  // RH
  return 0.72;                              // RF
}

/**
 * Hip pitch through one cycle. Stance retracts slowly; swing returns with a
 * soft ease so neither toe-off nor touchdown snaps.
 */
function quadHipSwing(u, amp) {
  if (u < QUAD_DUTY) {
    const t = u / QUAD_DUTY;
    // Slight ease at both ends of stance — a paw that plants does not reverse
    // direction instantly.
    const e = _smooth(t);
    return amp * (1 - 2 * e);
  }
  const t = _smooth((u - QUAD_DUTY) / (1 - QUAD_DUTY));
  return amp * (-1 + 2 * t);
}

/** Knee: tiny mid-stance give, then a rounded mid-swing lift. */
function quadKneeBend(u, amp) {
  if (u < QUAD_DUTY) {
    const t = u / QUAD_DUTY;
    return amp * 0.06 * Math.sin(t * Math.PI);
  }
  const t = (u - QUAD_DUTY) / (1 - QUAD_DUTY);
  const lift = Math.sin(t * Math.PI);
  return amp * lift * lift * (0.55 + 0.25 * lift);
}

/** Smooth contribution of one planted paw to lateral body support. */
function quadSupport(u) {
  if (u >= QUAD_DUTY) return 0;
  const blend = 0.10;
  const touch = _smooth(Math.min(1, u / blend));
  const lift = _smooth(Math.min(1, (QUAD_DUTY - u) / blend));
  return touch * lift;
}

/**
 * The auto-rigged lion is bound in a mid-stride pose: one foreleg reaches, the
 * opposite trails.  Measuring how far each foot sits ahead of its hip along
 * the body and biasing that reach toward the pair average cancels the worst of
 * the asymmetry before the walk cycle is applied.
 */
function neutralizeStrideBias(legs, forward) {
  if (!forward || legs.length < 2) return;
  const byPair = [
    legs.filter(l => l.front),
    legs.filter(l => !l.front),
  ];
  for (const pair of byPair) {
    if (pair.length !== 2) continue;
    const reaches = pair.map(leg => {
      const hip = _v.setFromMatrixPosition(leg.bone.matrixWorld).clone();
      const toeBone = leg.lower ?? leg.bone;
      const toe = _v2.setFromMatrixPosition(toeBone.matrixWorld).clone();
      const len = Math.max(0.08, hip.distanceTo(toe));
      return { leg, reach: toe.sub(hip).dot(forward) / len };
    });
    const avg = (reaches[0].reach + reaches[1].reach) * 0.5;
    for (const { leg, reach } of reaches) {
      // Small-angle correction about the swing axis toward the pair mean.
      leg.stanceBias = THREE.MathUtils.clamp((avg - reach) * 0.55, -0.22, 0.22);
    }
  }
  for (const leg of legs) {
    if (leg.stanceBias === undefined) leg.stanceBias = 0;
  }
}

/**
 * Bending a model that has no bones.
 *
 * The lion and the komodo lost their skeletons with the baked animation, and
 * re-importing that is 148 MB of download for six of animation. A monitor
 * lizard spends its day still anyway — what says "alive" is the tail and the
 * head — and both can be done in the vertex shader for nothing: no skeleton, no
 * per-frame CPU, no extra byte on the wire. The weighting that a rig would
 * store per vertex becomes a formula over the vertex's own position.
 *
 * Which axis is which is measured, never assumed: the model's own transform
 * says which local axis points up, the bounding box says which of the other two
 * runs along the body, and the taper says which end of THAT is the tail — a
 * lizard's tail comes to a point and its head does not.
 */
function flexAxes(mesh) {
  const geo = mesh.geometry;
  geo.computeBoundingBox();
  const bb = geo.boundingBox;
  const size = new THREE.Vector3();
  bb.getSize(size);
  const q = new THREE.Quaternion();
  mesh.getWorldQuaternion(q).invert();
  const up = new THREE.Vector3(0, 1, 0).applyQuaternion(q);
  const upIdx = [0, 1, 2].reduce(
    (best, i) => (Math.abs(up.getComponent(i)) > Math.abs(up.getComponent(best)) ? i : best), 0);
  const rest = [0, 1, 2].filter(i => i !== upIdx);
  const bodyIdx = size.getComponent(rest[0]) >= size.getComponent(rest[1]) ? rest[0] : rest[1];
  const latIdx = rest.find(i => i !== bodyIdx);

  // Taper: how far the skin sits from the spine, in slices along the body. The
  // thin end is the tail.
  const pos = geo.attributes.position;
  const lo = bb.min.getComponent(bodyIdx), hi = bb.max.getComponent(bodyIdx);
  const span = Math.max(hi - lo, 1e-6);
  const BINS = 16;
  const girth = new Float32Array(BINS);
  const mid = (bb.min.getComponent(latIdx) + bb.max.getComponent(latIdx)) / 2;
  for (let i = 0; i < pos.count; i++) {
    const b = Math.min(BINS - 1,
      Math.floor(((pos.getComponent(i, bodyIdx) - lo) / span) * BINS));
    const r = Math.abs(pos.getComponent(i, latIdx) - mid);
    if (r > girth[b]) girth[b] = r;
  }
  const tailAtMax = girth[BINS - 1] < girth[0];
  return {
    axis: ['x', 'y', 'z'][bodyIdx],
    lat: ['x', 'y', 'z'][latIdx],
    up: ['x', 'y', 'z'][upIdx],
    lo, hi, span, mid, tailAtMax,
  };
}

/**
 * Patches a material to sway the tail and turn the head. `uniforms` is shared
 * across every material of one animal so a single write drives the lot.
 */
function flexMaterial(material, ax, cfg, uniforms) {
  const s = ax.tailAtMax
    ? `clamp((transformed.${ax.axis} - ${(ax.lo + ax.span * 0.45).toFixed(4)}) / ${(ax.span * 0.55).toFixed(4)}, 0.0, 1.0)`
    : `clamp((${(ax.hi - ax.span * 0.45).toFixed(4)} - transformed.${ax.axis}) / ${(ax.span * 0.55).toFixed(4)}, 0.0, 1.0)`;
  const h = ax.tailAtMax
    ? `clamp((${(ax.lo + ax.span * 0.22).toFixed(4)} - transformed.${ax.axis}) / ${(ax.span * 0.22).toFixed(4)}, 0.0, 1.0)`
    : `clamp((transformed.${ax.axis} - ${(ax.hi - ax.span * 0.22).toFixed(4)}) / ${(ax.span * 0.22).toFixed(4)}, 0.0, 1.0)`;
  material.onBeforeCompile = shader => {
    shader.uniforms.uFlexTime = uniforms.time;
    shader.uniforms.uFlexHead = uniforms.head;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>',
        '#include <common>\nuniform float uFlexTime;\nuniform float uFlexHead;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        {
          float tailT = ${s};
          transformed.${ax.lat} += sin(uFlexTime - tailT * 3.4) * tailT * tailT
            * ${(ax.span * cfg.tail).toFixed(4)};
          float headT = ${h};
          float a = uFlexHead * headT;
          float ca = cos(a), sa = sin(a);
          vec2 rel = vec2(transformed.${ax.axis} - ${((ax.lo + ax.hi) / 2).toFixed(4)},
                          transformed.${ax.lat} - ${ax.mid.toFixed(4)});
          transformed.${ax.axis} = rel.x * ca - rel.y * sa + ${((ax.lo + ax.hi) / 2).toFixed(4)};
          transformed.${ax.lat} = rel.x * sa + rel.y * ca + ${ax.mid.toFixed(4)};
        }`);
  };
  // Two animals with different phases must not share one compiled program.
  material.customProgramCacheKey = () => `flex${ax.axis}${ax.lat}${cfg.tail}`;
  material.needsUpdate = true;
}

// ---------------------------------------------------------------------------
// Building a skeleton for a model that never had one
//
// The lion is one mesh of 19,337 vertices — head, legs and tail all in it — and
// its animation was thrown away with the baked morphs. Rather than re-import
// 35 MB for a walk cycle, the rig is derived from the geometry itself: cut the
// mesh into a body, a head, a tail and four legs, hang a bone in each, and bind
// the whole thing as a SkinnedMesh. Nothing is downloaded and the result feeds
// straight into the walking code above, which asks only for bones with the
// right names.
//
// Where this can go wrong is the seams. A vertex on the flank just above a
// shoulder is partly the leg's and partly the body's, and if that hand-over is
// abrupt the flank creases when the leg swings. Hence the wide, smooth bands
// below, and modest swing amplitudes on top of them.
// ---------------------------------------------------------------------------

const AXIS_NAME = ['x', 'y', 'z'];
const smoothstep = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a || 1e-6)));
  return t * t * (3 - 2 * t);
};

/** Body/up/side axes in the mesh's own space, and which end carries the tail. */
function meshFrame(mesh) {
  const geo = mesh.geometry;
  geo.computeBoundingBox();
  const bb = geo.boundingBox;
  const size = new THREE.Vector3();
  bb.getSize(size);
  const q = new THREE.Quaternion();
  mesh.getWorldQuaternion(q).invert();
  const upv = new THREE.Vector3(0, 1, 0).applyQuaternion(q);
  const ui = [0, 1, 2].reduce(
    (b, i) => (Math.abs(upv.getComponent(i)) > Math.abs(upv.getComponent(b)) ? i : b), 0);
  const rest = [0, 1, 2].filter(i => i !== ui);
  const bi = size.getComponent(rest[0]) >= size.getComponent(rest[1]) ? rest[0] : rest[1];
  const si = rest.find(i => i !== bi);
  // The tail is the thin end: slice the body and compare how far the skin sits
  // from the spine in each slice.
  const pos = geo.attributes.position;
  const lo = bb.min.getComponent(bi), span = Math.max(size.getComponent(bi), 1e-6);
  const mid = (bb.min.getComponent(si) + bb.max.getComponent(si)) / 2;
  const BINS = 20;
  const girth = new Float32Array(BINS);
  for (let i = 0; i < pos.count; i++) {
    const b = Math.min(BINS - 1, Math.floor(((pos.getComponent(i, bi) - lo) / span) * BINS));
    const r = Math.abs(pos.getComponent(i, si) - mid);
    if (r > girth[b]) girth[b] = r;
  }
  const headAtMax = girth[BINS - 1] > girth[0];
  return {
    bi, si, ui, b: AXIS_NAME[bi], s: AXIS_NAME[si], u: AXIS_NAME[ui],
    bb, size, mid, headAtMax,
    upSign: Math.sign(upv.getComponent(ui)) || 1,
  };
}

/**
 * Four legs, found by clustering the vertices of the lower body rather than by
 * splitting it down the middle: this lion is frozen mid-stride, one foreleg
 * reaching well past the centre line, and a plane cut hands half of it to the
 * wrong leg.
 */
function legClusters(samples, frame) {
  const { bb, bi, si } = frame;
  const seeds = [
    [bb.min.getComponent(bi) + frame.size.getComponent(bi) * 0.25, bb.min.getComponent(si)],
    [bb.min.getComponent(bi) + frame.size.getComponent(bi) * 0.25, bb.max.getComponent(si)],
    [bb.max.getComponent(bi) - frame.size.getComponent(bi) * 0.25, bb.min.getComponent(si)],
    [bb.max.getComponent(bi) - frame.size.getComponent(bi) * 0.25, bb.max.getComponent(si)],
  ].map(c => c.slice());
  const owner = new Int8Array(samples.length / 2);
  for (let pass = 0; pass < 12; pass++) {
    const sum = seeds.map(() => [0, 0, 0]);
    for (let i = 0; i < owner.length; i++) {
      const b = samples[i * 2], s = samples[i * 2 + 1];
      let best = 0, bestD = Infinity;
      for (let c = 0; c < 4; c++) {
        const d = (b - seeds[c][0]) ** 2 + (s - seeds[c][1]) ** 2;
        if (d < bestD) { bestD = d; best = c; }
      }
      owner[i] = best;
      sum[best][0] += b; sum[best][1] += s; sum[best][2]++;
    }
    for (let c = 0; c < 4; c++) {
      if (sum[c][2] > 0) { seeds[c][0] = sum[c][0] / sum[c][2]; seeds[c][1] = sum[c][1] / sum[c][2]; }
    }
  }
  return { seeds, owner };
}

/**
 * Cuts the model up, hangs bones in it and returns a SkinnedMesh in its place.
 * The satellite meshes — this lion carries eighteen whiskers and four eyes as
 * separate objects — are parented to the head bone, or the face stays behind
 * when the head turns.
 */
function autoRigQuadruped(group) {
  let body = null;
  group.traverse(o => {
    if (!o.isMesh || o.isSkinnedMesh) return;
    if (!body || o.geometry.attributes.position.count > body.geometry.attributes.position.count) {
      body = o;
    }
  });
  if (!body || body.geometry.attributes.position.count < 500) return null;
  group.updateWorldMatrix(true, true);

  const f = meshFrame(body);
  const geo = body.geometry;
  const pos = geo.attributes.position;
  const height = f.size.getComponent(f.ui);
  const length = f.size.getComponent(f.bi);
  const floor = f.upSign > 0 ? f.bb.min.getComponent(f.ui) : f.bb.max.getComponent(f.ui);
  const hOf = i => (pos.getComponent(i, f.ui) - floor) * f.upSign;      // 0 at the paws
  const front = f.headAtMax ? 1 : -1;
  const bOf = i => (pos.getComponent(i, f.bi) - f.bb.min.getComponent(f.bi)) / length;
  const nose = f.headAtMax ? 1 : 0;

  // Zones, as fractions of the animal. The bands are deliberately wide: the
  // wider the hand-over, the less a swinging leg creases the flank.
  const LEG_TOP = 0.46, LEG_BAND = 0.13;
  const HEAD_AT = 0.80, HEAD_BAND = 0.09;
  const TAIL_AT = 0.14, TAIL_BAND = 0.05;

  const legSamples = [];
  const legIndex = [];
  for (let i = 0; i < pos.count; i++) {
    if (hOf(i) < LEG_TOP * height) {
      legSamples.push(pos.getComponent(i, f.bi), pos.getComponent(i, f.si));
      legIndex.push(i);
    }
  }
  if (legIndex.length < 200) return null;
  const { seeds, owner } = legClusters(legSamples, f);

  // Name each cluster from where it sits: toward the nose is a foreleg, and the
  // side is whichever way its centre lies off the spine.
  const legs = seeds.map((c, i) => {
    const isFront = front > 0 ? c[0] > (f.bb.min.getComponent(f.bi) + length / 2)
      : c[0] < (f.bb.min.getComponent(f.bi) + length / 2);
    return {
      cluster: i, b: c[0], s: c[1],
      name: `${isFront ? 'Front' : 'Back'}${c[1] < f.mid ? 'L' : 'R'}`,
    };
  });

  const bones = [];
  const at = (bv, sv, hv) => {
    const v = new THREE.Vector3();
    v.setComponent(f.bi, bv);
    v.setComponent(f.si, sv);
    v.setComponent(f.ui, floor + hv * f.upSign);
    return v;
  };

  const centre = at((f.bb.min.getComponent(f.bi) + f.bb.max.getComponent(f.bi)) / 2,
    f.mid, height * 0.55);
  const root = new THREE.Bone();
  root.name = 'Body';
  root.position.copy(centre);
  bones.push(root);

  const headPt = at(f.bb.min.getComponent(f.bi) + length * (nose ? HEAD_AT : 1 - HEAD_AT),
    f.mid, height * 0.78);
  const neckPt = at(f.bb.min.getComponent(f.bi) + length * (nose ? HEAD_AT - 0.08 : 1 - HEAD_AT + 0.08),
    f.mid, height * 0.72);
  const neck = new THREE.Bone();
  neck.name = 'Neck';
  neck.position.copy(neckPt).sub(centre);
  root.add(neck);
  bones.push(neck);
  const head = new THREE.Bone();
  head.name = 'Head';
  head.position.copy(headPt).sub(neckPt);
  neck.add(head);
  bones.push(head);

  const tailPt = at(f.bb.min.getComponent(f.bi) + length * (nose ? TAIL_AT : 1 - TAIL_AT),
    f.mid, height * 0.62);
  const tailTip = at(f.bb.min.getComponent(f.bi) + length * (nose ? TAIL_AT * 0.35 : 1 - TAIL_AT * 0.35),
    f.mid, height * 0.58);
  const tail = new THREE.Bone();
  tail.name = 'Tail1';
  tail.position.copy(tailPt).sub(centre);
  root.add(tail);
  bones.push(tail);
  const tail2 = new THREE.Bone();
  tail2.name = 'Tail2';
  tail2.position.copy(tailTip).sub(tailPt);
  tail.add(tail2);
  bones.push(tail2);

  const legBones = legs.map(leg => {
    const hip = at(leg.b, leg.s, height * LEG_TOP);
    const upper = new THREE.Bone();
    upper.name = `${leg.name.startsWith('Front') ? 'Front' : 'Back'}UpLeg.${leg.name.endsWith('L') ? 'L' : 'R'}`;
    upper.position.copy(hip).sub(centre);
    root.add(upper);
    const lower = new THREE.Bone();
    lower.name = upper.name.replace('UpLeg', 'LowLeg');
    lower.position.copy(at(leg.b, leg.s, height * LEG_TOP * 0.45)).sub(hip);
    upper.add(lower);
    bones.push(upper, lower);
    return { upper, lower };
  });

  // Weights: every vertex belongs to the body, and hands over to a leg, the
  // head or the tail across a band rather than at a line.
  const idx = new Uint16Array(pos.count * 4);
  const wgt = new Float32Array(pos.count * 4);
  const boneOf = new Map(bones.map((b, i) => [b, i]));
  for (let i = 0; i < pos.count; i++) {
    const h = hOf(i), bfrac = bOf(i);
    let other = null, w = 0;
    const nose01 = nose ? bfrac : 1 - bfrac;
    if (nose01 > HEAD_AT - HEAD_BAND) {
      other = head;
      w = smoothstep(HEAD_AT - HEAD_BAND, HEAD_AT + HEAD_BAND, nose01) * smoothstep(
        LEG_TOP * 0.6 * height, LEG_TOP * height, h);
    } else if (nose01 < TAIL_AT + TAIL_BAND && h > LEG_TOP * height * 0.9
      && Math.abs(pos.getComponent(i, f.si) - f.mid) < f.size.getComponent(f.si) * 0.22) {
      // Thin as well as far back, or the whole rump swings with the tail.
      other = tail;
      w = smoothstep(TAIL_AT + TAIL_BAND, TAIL_AT - TAIL_BAND, nose01);
    }
    if (!other && h < (LEG_TOP + LEG_BAND) * height) {
      // nearest leg cluster, by the same measure the clustering used
      let best = 0, bestD = Infinity;
      for (let c = 0; c < 4; c++) {
        const d = (pos.getComponent(i, f.bi) - seeds[c][0]) ** 2
          + (pos.getComponent(i, f.si) - seeds[c][1]) ** 2;
        if (d < bestD) { bestD = d; best = c; }
      }
      other = legBones[best].upper;
      w = smoothstep((LEG_TOP + LEG_BAND) * height, (LEG_TOP - LEG_BAND) * height, h);
      // the shin takes over from the knee down
      const knee = LEG_TOP * 0.45 * height;
      if (h < knee) {
        const kw = smoothstep(knee, knee * 0.45, h);
        idx[i * 4 + 2] = boneOf.get(legBones[best].lower);
        wgt[i * 4 + 2] = w * kw;
        w *= 1 - kw;
      }
    }
    idx[i * 4] = 0;                       // the body, always
    wgt[i * 4] = 1 - w - wgt[i * 4 + 2];
    if (other) { idx[i * 4 + 1] = boneOf.get(other); wgt[i * 4 + 1] = w; }
  }
  geo.setAttribute('skinIndex', new THREE.BufferAttribute(idx, 4));
  geo.setAttribute('skinWeight', new THREE.BufferAttribute(wgt, 4));

  const skinned = new THREE.SkinnedMesh(geo, body.material);
  skinned.name = body.name;
  skinned.position.copy(body.position);
  skinned.quaternion.copy(body.quaternion);
  skinned.scale.copy(body.scale);
  skinned.castShadow = skinned.receiveShadow = true;
  skinned.frustumCulled = false;
  const parent = body.parent;
  parent.add(skinned);
  parent.remove(body);
  skinned.add(root);
  skinned.updateWorldMatrix(true, true);
  skinned.bind(new THREE.Skeleton(bones));

  // The whiskers and the eyes are their own objects; hang them off the head or
  // the face is left behind the moment it turns.
  const strays = [];
  group.traverse(o => { if (o.isMesh && !o.isSkinnedMesh) strays.push(o); });
  const m = new THREE.Matrix4();
  for (const s of strays) {
    s.updateWorldMatrix(true, false);
    m.copy(head.matrixWorld).invert().multiply(s.matrixWorld);
    m.decompose(s.position, s.quaternion, s.scale);
    head.add(s);
  }
  return skinned;
}

/** Head, neck, tail and the leg chains, whatever this pack calls them. */
function findParts(group) {
  const bones = usableBones(group);
  const pick = re => bones.find(b => re.test(b.name)) ?? null;
  const parts = {
    head: pick(/head|skull/i),
    neck: bones.filter(b => /neck/i.test(b.name)).slice(0, 2),
    tail: bones.filter(b => /tail/i.test(b.name)).slice(0, 4),
    legs: [],
  };
  // Facing: the head is at the front. Without one there is nothing to walk with.
  group.updateWorldMatrix(true, true);
  const hips = pick(/hip|pelvis|body|torso|spine/i) ?? bones[0];
  let forward = null;
  if (parts.head && hips) {
    forward = _v.setFromMatrixPosition(parts.head.matrixWorld)
      .sub(_v2.setFromMatrixPosition(hips.matrixWorld));
    forward.y = 0;
    forward = forward.lengthSq() > 1e-6 ? forward.normalize().clone() : null;
  }
  parts.forward = forward;
  if (!forward) return parts;

  for (const b of bones) {
    const n = b.name.toLowerCase();
    // WildMesh lions use RigLFLeg1 / RigRBLeg1; older packs use thigh / upleg.
    if (!/(upleg|upperleg|thigh|[lr][fb]leg1)/.test(n)) continue;
    const lower = b.children.find(c => c.isBone && /(leg2|leg3|low|shin|calf)/i.test(c.name))
      ?? b.children.find(c => c.isBone);
    const left = /(lb|lf|left)/.test(n) && !/(rb|rf|right)/.test(n);
    const front = /(front|fore|lf|rf)/.test(n);
    const swing = swingAxis(b, forward);
    if (!swing) continue;
    parts.legs.push({
      bone: b, lower, left, front, swing,
      lowerSwing: lower ? swingAxis(lower, forward) : null,
      rest: b.quaternion.clone(),
      restLower: lower ? lower.quaternion.clone() : null,
    });
  }
  return parts;
}

/**
 * One animal, standing where it is put and playing a resting clip.
 * `rng` keeps a herd reproducible between reloads. `roam` and `ground`, when
 * given, let it walk its own enclosure.
 */
export function placeAnimal(species, {
  x, y = 0, z, ry = 0, rng = Math.random, size = 1, roam = null, ground = null,
  avoid = null, perches = null,
}) {
  if (!species) return null;
  const group = cloneSkinned(species.root);
  group.rotation.y = ry;
  // A skeleton cut out of the mesh, for the species that lost theirs. Done
  // before the materials are cloned below so the new SkinnedMesh is dressed
  // with everything else.
  if (species.rig === 'quadruped') autoRigQuadruped(group);
  // Individuals differ; a herd of identical animals reads as a decal.
  const scale = species.scale * size * (0.92 + rng() * 0.16);
  group.scale.setScalar(scale);
  // `y` is the ground, so the model's own origin has to be taken out of it.
  group.position.set(x, y - species.foot * scale, z);
  // A few per cent of warm or cool on each individual's own copies of the
  // materials. Textured coats need far less of it than the old flat ones did.
  const tint = new THREE.Color(
    1 + (rng() - 0.5) * 0.07, 1 + (rng() - 0.5) * 0.05, 1 + (rng() - 0.5) * 0.06);
  // Auto-rigged lions used to need a tawny lift; the skinned WildMesh coat
  // already reads under the paddock glass, so leave its maps alone.
  const lionCoat = species.rig === 'quadruped'
    ? new THREE.Color(1.45, 1.22, 0.88) : null;
  group.traverse(o => {
    if (!o.isMesh && !o.isSkinnedMesh) return;
    const list = Array.isArray(o.material) ? o.material : [o.material];
    const made = list.map(m => {
      if (!m) return m;
      const c = m.clone();
      c.color?.multiply(tint);
      if (c.roughness !== undefined) c.roughness = Math.max(c.roughness, 0.62);
      if (c.metalness !== undefined) c.metalness = Math.min(c.metalness, 0.05);
      if (lionCoat && c.color) {
        c.color.multiply(lionCoat);
        c.metalness = 0;
        c.roughness = Math.max(c.roughness ?? 0.7, 0.82);
        c.envMapIntensity = 0.95;
        if (c.map) {
          c.map = enhanceLionAlbedo(c.map);
          c.map.colorSpace = THREE.SRGBColorSpace;
        }
        if (c.emissive) {
          c.emissive.setHex(0x4a3218);
          c.emissiveIntensity = 0.12;
        }
        c.needsUpdate = true;
      }
      // Komodos ship with many near-black flat parts; lift dark fragments toward
      // a dusty olive so they read as lizards, not dark slugs, at exhibit range.
      // Identified by flex (boneless bend) rather than object identity — the
      // loaded species record is a fresh object, not SPECIES.komodo itself.
      if (species.flex && c.color) {
        const olive = new THREE.Color(0x7a8a6a);
        const lum = c.color.r * 0.3 + c.color.g * 0.59 + c.color.b * 0.11;
        c.color.lerp(olive, lum < 0.15 ? 0.72 : 0.32);
        c.roughness = Math.max(c.roughness ?? 0, 0.84);
        c.metalness = 0;
      }
      return c;
    });
    o.material = Array.isArray(o.material) ? made : made[0];
    o.castShadow = true;
    o.receiveShadow = true;
    o.frustumCulled = false;
  });

  const useAnimGait = Boolean(species.walking?.length && species.resting?.length);
  const idleClip = species.resting.length
    ? species.resting[Math.floor(rng() * species.resting.length)] : null;
  const walkClip = useAnimGait ? species.walking[0] : null;
  let mixer = null;
  let idleAction = null;
  let walkAction = null;
  if (useAnimGait && idleClip && walkClip) {
    mixer = new THREE.AnimationMixer(group);
    idleAction = mixer.clipAction(idleClip);
    walkAction = mixer.clipAction(walkClip);
    idleAction.setEffectiveWeight(1);
    walkAction.setEffectiveWeight(0);
    idleAction.play();
    walkAction.play();
    idleAction.time = rng() * idleClip.duration;
    walkAction.time = rng() * walkClip.duration;
    idleAction.timeScale = 0.85 + rng() * 0.3;
  } else if (idleClip) {
    mixer = new THREE.AnimationMixer(group);
    idleAction = mixer.clipAction(idleClip);
    idleAction.timeScale = 0.8 + rng() * 0.4;
    idleAction.time = rng() * idleClip.duration;
    idleAction.play();
  }

  const parts = findParts(group);
  group.updateWorldMatrix(true, true);
  if (species.rig === 'quadruped') neutralizeStrideBias(parts.legs, parts.forward);
  const phase = rng() * Math.PI * 2;
  const rate = 0.5 + rng() * 0.25;
  const baseY = y - species.foot * scale;

  // Boneless species bend in their own shader. Done after the materials are
  // cloned above, so each animal carries its own phase.
  let flex = null;
  if (species.flex) {
    group.updateWorldMatrix(true, true);
    let first = null;
    group.traverse(o => { if (!first && (o.isMesh || o.isSkinnedMesh)) first = o; });
    if (first) {
      const ax = flexAxes(first);
      flex = { time: { value: phase }, head: { value: 0 } };
      group.traverse(o => {
        if (!o.isMesh && !o.isSkinnedMesh) return;
        for (const m of (Array.isArray(o.material) ? o.material : [o.material])) {
          if (m) flexMaterial(m, ax, species.flex, flex);
        }
      });
    }
  }

  // Which way is up, and which way is sideways, in the local space of a bone we
  // are about to turn. Turning about a guessed axis is what makes a head roll
  // instead of look, and every one of these rigs orients its joints its own way.
  const axesOf = bone => {
    const pq = new THREE.Quaternion();
    (bone.parent ?? bone).getWorldQuaternion(pq).invert();
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(pq).normalize();
    const side = parts.forward
      ? new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), parts.forward)
        .normalize().applyQuaternion(pq).normalize()
      : new THREE.Vector3(1, 0, 0);
    return { up, side, rest: bone.quaternion.clone() };
  };
  const head = parts.head ? axesOf(parts.head) : null;
  const neck = parts.neck.map(axesOf);
  const tail = parts.tail.map(axesOf);

  // Wandering. An animal that never leaves its spot is a statue with a pulse,
  // so each one alternates between standing about and walking somewhere else in
  // its own enclosure. Clip-driven species bring their own walk cycle; others
  // get a procedural gait driven by distance travelled so the feet do not skate.
  const canWalk = Boolean(roam && ground && (useAnimGait || parts.legs.length >= 2));
  const naturalSteering = species.locomotion?.steering === 'curved';
  // The auto-rigged lion's geometry reads backwards: meshFrame picks the wrong
  // end as the head, so `parts.forward` points at the tail and it walks away
  // from where it faces. Flipping the offset 180° sends it forwards without
  // touching the genuinely rigged species (zebra, birds), whose forward is
  // already correct — and the turn-home logic is offset-agnostic, so the
  // half-turn at each stop still applies to it too.
  const facingFlip = species.rig === 'quadruped' ? Math.PI : 0;
  const facingOffset = parts.forward
    ? ry - Math.atan2(parts.forward.x, parts.forward.z) + facingFlip : 0;
  const speedRange = species.locomotion?.speed ?? [0.30, 0.52];
  const speed = (speedRange[0] + rng() * (speedRange[1] - speedRange[0]))
    * (naturalSteering ? Math.max(0.72, Math.sqrt(size)) : Math.max(0.55, size));
  // A stride is a leg, not a height: a peacock is as tall as a spaniel and
  // steps a fifth as far. Measured off the animal's own leg so every species
  // gets it right without a table.
  const legSpan = (() => {
    const leg = parts.legs[0];
    if (!leg) return 1;
    const top = _v.setFromMatrixPosition(leg.bone.matrixWorld);
    const toe = _v2.setFromMatrixPosition((leg.lower ?? leg.bone).matrixWorld);
    return Math.max(0.12, top.distanceTo(toe) * 2);
  })();
  const stride = Math.max(0.22, legSpan * (species.rig === 'quadruped' ? 1.15 : 1.5));
  // Auto-rigged cats walk more slowly and with a shorter, quieter step — large
  // swings on a mid-stride bind pose are what made them look like toys.
  const isQuad = parts.legs.length >= 4
    && parts.legs.some(l => l.front) && parts.legs.some(l => !l.front);
  const walkSpeed = naturalSteering ? speed * 0.92 : (isQuad ? speed * 0.65 : speed);
  let mode = 'rest';
  const randomRange = (range, fallback) => range
    ? range[0] + rng() * (range[1] - range[0]) : fallback();
  let timer = randomRange(species.locomotion?.rest, () => 2 + rng() * 9);
  let gait = rng() * Math.PI * 2;
  let walkW = 0;            // smoothed 0..1 so starts/stops ease instead of snap
  let target = null;
  let turnBy = 0;
  let moveSpeed = 0;
  let yawRate = 0;
  const inset = 3;
  // Rest pose of the whole group, so body pitch/roll can ease back to zero.
  const restPitch = group.rotation.x;
  const restRoll = group.rotation.z;

  // Reaching a target (or the water's edge) ends the walk with a turn of
  // about 180 degrees over the start of the rest: the animal comes away from
  // whatever it just walked into, and the next leg starts facing open ground
  // instead of the fence it stopped at.
  const faceAway = () => {
    if (naturalSteering) return;
    turnBy = Math.PI * (rng() < 0.5 ? -1 : 1) + (rng() - 0.5) * 0.6;
  };

  // The paddock's pool is cut a metre and a quarter into the terrain, and an
  // animal that walks over the rim goes down with it — from the path you see a
  // zebra lying in an empty basin. The hole is simply not somewhere to walk.
  const inHole = (px, pz) => avoid
    && px > avoid.x0 - 1 && px < avoid.x1 + 1 && pz > avoid.z0 - 1 && pz < avoid.z1 + 1;

  const wrapAngle = a => {
    let d = (a + Math.PI) % (Math.PI * 2) - Math.PI;
    if (d < -Math.PI) d += Math.PI * 2;
    return d;
  };
  const approach = (value, wanted, amount) => value
    + THREE.MathUtils.clamp(wanted - value, -amount, amount);

  // A destination chosen anywhere in the rectangle is very often behind the
  // animal.  Biasing candidates toward its current heading creates connected
  // walking arcs; inward points still win near a boundary, where a turn is
  // necessary.  The slight distance preference prevents nervous short pacing.
  const chooseCurvedTarget = () => {
    const minX = roam.x0 + inset, maxX = roam.x1 - inset;
    const minZ = roam.z0 + inset, maxZ = roam.z1 - inset;
    const heading = group.rotation.y - facingOffset;
    const preferred = Math.min(11, Math.hypot(maxX - minX, maxZ - minZ) * 0.38);
    let best = null;
    for (let i = 0; i < 18; i++) {
      const px = minX + rng() * Math.max(0.1, maxX - minX);
      const pz = minZ + rng() * Math.max(0.1, maxZ - minZ);
      if (inHole(px, pz)) continue;
      const dx = px - group.position.x, dz = pz - group.position.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 3.5) continue;
      const turn = Math.abs(wrapAngle(Math.atan2(dx, dz) - heading));
      const score = turn * 1.35 + Math.abs(dist - preferred) * 0.075 + rng() * 0.18;
      if (!best || score < best.score) best = { x: px, z: pz, score };
    }
    return best ?? { x: (minX + maxX) / 2, z: (minZ + maxZ) / 2 };
  };

  // A bird with a `fly` range does not wander the ground: it holds on a perch,
  // then flies to another — take-off, a cruise between the perches, and a
  // landing. The perch tops are handed in from the enclosure that built them.
  const canFly = Boolean(species.fly && perches && perches.length >= 2);
  let flight = null;
  if (canFly) {
    flight = { mode: 'perch', timer: 2 + rng() * 6, from: null, to: null, u: 0, dur: 1 };
  }

  const motion = (t, dt) => {
    const s = t * rate + phase;
    let walking = 0;

    if (canFly) {
      const f = flight;
      if (f.mode === 'perch') {
        f.timer -= dt;
        // Crouch and look about; the odd wing shuffle keeps it from being a
        // statue between flights.
        group.rotation.z = Math.sin(s * 2.2) * 0.03;
        if (f.timer <= 0) {
          const here = f.to ?? { x: group.position.x, z: group.position.z };
          const others = perches.filter(p =>
            Math.hypot(p.x - here.x, p.z - here.z) > 1.2);
          const next = others[Math.floor(rng() * others.length)] ?? perches[0];
          f.from = {
            x: group.position.x, y: group.position.y, z: group.position.z,
          };
          f.to = next;
          const dy = next.y - f.from.y;
          const dist = Math.hypot(next.x - f.from.x, next.z - f.from.z);
          f.dur = Math.max(0.8, dist / (2.2 + rng() * 0.8) + Math.abs(dy) * 0.35);
          f.u = 0;
          f.mode = 'fly';
          group.rotation.z = 0;
        }
      } else {
        // In the air: face the target, climb away then ease down onto it, with
        // a shallow arc so the flight is not a straight slide on a rail.
        f.u = Math.min(1, f.u + dt / f.dur);
        const u = f.u;
        const ease = u * u * (3 - 2 * u);
        const nx = f.from.x + (f.to.x - f.from.x) * ease;
        const nz = f.from.z + (f.to.z - f.from.z) * ease;
        const baseYf = f.from.y + (f.to.y - f.from.y) * ease;
        const arc = Math.sin(u * Math.PI) * (0.55 + 0.45 * Math.abs(f.to.y - f.from.y));
        const yaw = Math.atan2(f.to.x - f.from.x, f.to.z - f.from.z);
        let d = ((yaw - group.rotation.y + Math.PI) % (Math.PI * 2)) - Math.PI;
        if (d < -Math.PI) d += Math.PI * 2;
        group.rotation.y += d * Math.min(1, dt * 4);
        group.position.set(nx, baseYf + arc, nz);
        // Bank into the turn and flap: the body pitches on climb, levels in
        // the cruise, and flares on the way down.
        group.rotation.x = -Math.cos(u * Math.PI) * 0.22
          + (u > 0.8 ? (u - 0.8) * 1.4 : 0);
        walking = 1;                              // wings working, legs tucked
        gait += dt * 9;
        if (f.u >= 1) {
          f.mode = 'perch';
          f.timer = 3 + rng() * 9;
          group.rotation.x = 0;
          group.position.set(f.to.x, f.to.y, f.to.z);
        }
      }
      // Perched, it still breathes and looks about; in the air the wing cycle
      // below (walkW) drives the flap instead of the idle weight-shift.
      walkW += (walking - walkW) * Math.min(1, dt * 6);
    } else if (canWalk) {
      timer -= dt;
      if (mode === 'rest' && naturalSteering) {
        // Finish the last trace of angular/linear momentum without changing
        // heading.  A resting lion looks around with its neck, not its whole
        // body rotating like a display figurine.
        yawRate = approach(yawRate, 0, (species.locomotion.turnAccel ?? 1) * dt);
        moveSpeed = approach(moveSpeed, 0, (species.locomotion.brake ?? 1) * dt);
      } else if (mode === 'rest' && turnBy) {
        // The turn home: a turn takes at most the first couple of seconds of
        // the rest, so a long pause is not one slow spin.
        const step = Math.min(dt * 1.2, Math.abs(turnBy)) * Math.sign(turnBy);
        group.rotation.y += step;
        turnBy -= step;
        if (Math.abs(turnBy) < 1e-3) turnBy = 0;
      }
      if (mode === 'rest' && timer <= 0) {
        mode = 'walk';
        timer = randomRange(species.locomotion?.bout, () => 6 + rng() * 14);
        if (naturalSteering) {
          target = chooseCurvedTarget();
        } else {
          for (let tries = 0; tries < 8; tries++) {
            target = {
              x: roam.x0 + inset + rng() * Math.max(0.1, roam.x1 - roam.x0 - inset * 2),
              z: roam.z0 + inset + rng() * Math.max(0.1, roam.z1 - roam.z0 - inset * 2),
            };
            if (!inHole(target.x, target.z)) break;
          }
        }
      }
      if (mode === 'walk') {
        const dx = target.x - group.position.x, dz = target.z - group.position.z;
        const dist = Math.hypot(dx, dz);
        if (naturalSteering) {
          const cfg = species.locomotion;
          const stop = cfg.stop ?? 0.65;
          const wantsStop = dist < stop || timer <= 0;
          if (wantsStop && moveSpeed < 0.055) {
            mode = 'rest';
            timer = randomRange(cfg.rest, () => 4 + rng() * 12);
            target = null;
            moveSpeed = 0;
          } else {
            // Steering has angular inertia and forward motion.  Even a target
            // directly behind becomes a compact walking arc, never a pivot.
            const heading = group.rotation.y - facingOffset;
            const bearing = Math.atan2(dx, dz);
            const d = wrapAngle(bearing - heading);
            const maxTurn = cfg.turnRate ?? 0.52;
            const wantedYawRate = THREE.MathUtils.clamp(d * 0.9, -maxTurn, maxTurn);
            yawRate = approach(yawRate, wantedYawRate, (cfg.turnAccel ?? 1.15) * dt);
            group.rotation.y += yawRate * dt;

            const curve = Math.min(1, Math.abs(yawRate) / Math.max(maxTurn, 1e-4));
            const arrival = wantsStop ? 0 : THREE.MathUtils.smoothstep(dist, stop, stop + 2.4);
            let wantedSpeed = walkSpeed * (1 - curve * 0.38) * arrival;
            if (Math.abs(d) > 1.35) wantedSpeed *= 0.58;
            const change = wantedSpeed > moveSpeed ? (cfg.accel ?? 0.72) : (cfg.brake ?? 0.95);
            moveSpeed = approach(moveSpeed, wantedSpeed, change * dt);

            const h = group.rotation.y - facingOffset;
            const go = moveSpeed * dt;
            const nx = group.position.x + Math.sin(h) * go;
            const nz = group.position.z + Math.cos(h) * go;
            const outside = nx < roam.x0 + inset || nx > roam.x1 - inset
              || nz < roam.z0 + inset || nz > roam.z1 - inset;
            if (inHole(nx, nz) || outside) {
              // Redirect inward and keep the paws stepping during the turn.
              target = chooseCurvedTarget();
              moveSpeed *= 0.72;
            } else {
              group.position.x = nx;
              group.position.z = nz;
              gait += (go / stride) * Math.PI * 2 * 0.85;
            }
            walking = THREE.MathUtils.clamp(moveSpeed / Math.max(walkSpeed * 0.42, 1e-4), 0, 1);
          }
        } else if (dist < 0.7 || timer <= 0) {
          mode = 'rest';
          timer = 4 + rng() * 12;
          faceAway();
        } else {
          // Turn onto the bearing first, then walk it: a quadruped that
          // sidesteps to its target reads as a chess piece.
          const want = Math.atan2(dx, dz) + facingOffset;
          let d = ((want - group.rotation.y + Math.PI) % (Math.PI * 2)) - Math.PI;
          if (d < -Math.PI) d += Math.PI * 2;
          const turn = Math.min(Math.abs(d), dt * 1.1) * Math.sign(d);
          group.rotation.y += turn;
          const go = Math.abs(d) < 0.5 ? walkSpeed * dt : walkSpeed * dt * 0.22;
          const h = group.rotation.y - facingOffset;
          const nx = group.position.x + Math.sin(h) * go;
          const nz = group.position.z + Math.cos(h) * go;
          if (inHole(nx, nz)) {
            mode = 'rest';                       // turned up at the water's edge
            timer = 3 + rng() * 8;
            faceAway();
          } else {
            group.position.x = nx;
            group.position.z = nz;
            // Quadrupeds advance the cycle a little slower than distance alone
            // suggests, so each footfall reads instead of blurring into a buzz.
            const gaitScale = isQuad ? 0.85 : 1;
            gait += (go / stride) * Math.PI * 2 * gaitScale;
            walking = Math.abs(d) < 0.55 ? 1 : 0.35;
          }
        }
      }
      // Ease the walk weight so a start or stop is not a hard cut on the legs.
      walkW += (walking - walkW) * Math.min(1, dt * (walking > walkW ? 2.4 : 1.6));
      const bob = useAnimGait
        ? 0
        : isQuad
          ? Math.sin(gait * 2) * (naturalSteering ? 0.006 : 0.012) * walkW * walkW
          : Math.abs(Math.sin(gait)) * 0.012 * walkW;
      group.position.y = ground(group.position.x, group.position.z)
        - species.foot * scale + bob;
    } else {
      walkW += (0 - walkW) * Math.min(1, dt * 2);
    }

    // Clip-driven gait: crossfade idle ↔ walk and let the mixer own the bones.
    if (useAnimGait && idleAction && walkAction) {
      const w = _smooth(walkW);
      idleAction.setEffectiveWeight(1 - w);
      walkAction.setEffectiveWeight(w);
      // Match footfall rate to roam speed so steps do not skate.
      const pace = walkSpeed > 1e-4 ? moveSpeed / walkSpeed : 0;
      walkAction.timeScale = THREE.MathUtils.clamp(0.55 + pace * 0.65, 0.45, 1.25);
    }

    // Legs. Birds keep the old alternating sine; quadrupeds without a walk clip
    // get a lateral-sequence walk with separate stance and swing.
    if (!useAnimGait && isQuad) {
      // Keep the hip arc small: the mesh is already mid-stride, and cats take
      // quiet steps.  naturalSteering (lions) is the softer of the two.
      const amp = (naturalSteering ? 0.16 : 0.22) * _smooth(walkW);
      const cycle01 = ((gait / (Math.PI * 2)) % 1 + 1) % 1;
      let support = 0;
      for (const leg of parts.legs) {
        // Subtracting the touchdown offset gives the declared lateral order:
        // LH, LF, RH, RF. Adding it silently reverses that sequence.
        const u = (cycle01 - quadWalkPhase(leg) + 1) % 1;
        // Hind limbs drive more of the push; forelimbs reach a little less.
        const limbAmp = amp * (leg.front ? 0.82 : 1.0);
        const hip = quadHipSwing(u, limbAmp) + (leg.stanceBias ?? 0) * (0.35 + 0.65 * (1 - walkW));
        leg.bone.quaternion.copy(leg.rest)
          .multiply(_q.setFromAxisAngle(leg.swing.axis, leg.swing.sign * hip));
        if (leg.lower && leg.lowerSwing) {
          const bend = quadKneeBend(u, limbAmp * 0.85);
          leg.lower.quaternion.copy(leg.restLower)
            .multiply(_q.setFromAxisAngle(leg.lowerSwing.axis, -leg.lowerSwing.sign * bend));
        }
        // Weight on the ground during stance feeds the body roll below.
        support += (leg.left ? 1 : -1) * quadSupport(u);
      }
      // Soft body rock: pitch follows the gait, roll follows which side is
      // carrying weight. Kept small — anything bigger reads as a cartoon.
      const pitch = Math.sin(gait * 2) * (naturalSteering ? 0.018 : 0.028) * walkW;
      const roll = THREE.MathUtils.clamp(support * 0.008, -0.025, 0.025) * walkW
        + Math.sin(gait) * 0.006 * walkW
        - (naturalSteering ? yawRate * 0.03 * walkW : 0);
      group.rotation.x = restPitch + pitch;
      group.rotation.z = restRoll + roll;
    } else if (!useAnimGait) {
      const amp = walkW ? 0.34 * walkW : 0.03;
      const cycle = walkW > 0.05 ? gait : s * 0.6;
      for (const leg of parts.legs) {
        const ph = cycle + (leg.front === leg.left ? 0 : Math.PI);
        leg.bone.quaternion.copy(leg.rest)
          .multiply(_q.setFromAxisAngle(leg.swing.axis, leg.swing.sign * Math.sin(ph) * amp));
        if (leg.lower && leg.lowerSwing) {
          const bend = Math.max(0, Math.sin(ph + 1.9)) * amp * 0.9;
          leg.lower.quaternion.copy(leg.restLower)
            .multiply(_q.setFromAxisAngle(leg.lowerSwing.axis, -leg.lowerSwing.sign * bend));
        }
      }
      // Do not touch group.rotation.x/z here: flying birds bank and shuffle on
      // those axes, and a reset would flatten every flap.
    }

    // Head / neck / tail overlays fight the authored clips — skip them when
    // the mixer is driving the skeleton.
    if (!useAnimGait) {
    // Head, neck and tail. Grazing when it stands, level and steady when it
    // walks — an animal on the move does not swing its head about. The walk
    // weight eases these too, so a stop does not snap the neck upright.
    const idle = 1 - walkW;
    const graze = idle * Math.max(0, Math.sin(s * 0.22)) ** 3;
    const turnLook = naturalSteering
      ? THREE.MathUtils.clamp(yawRate / Math.max(species.locomotion.turnRate, 1e-4), -1, 1)
        * 0.14 * walkW
      : 0;
    if (head) {
      head.rest && parts.head.quaternion.copy(head.rest)
        .multiply(_q.setFromAxisAngle(head.up, Math.sin(s * 0.7) * 0.30 * idle + turnLook))
        .multiply(_q.setFromAxisAngle(head.side,
          graze * 0.55 + Math.sin(s * 1.9) * 0.05
          + Math.sin(gait) * 0.04 * walkW));
    }
    neck.forEach((n, i) => {
      parts.neck[i].quaternion.copy(n.rest)
        .multiply(_q.setFromAxisAngle(n.up, Math.sin(s * 0.5 + i) * 0.12 * idle))
        .multiply(_q.setFromAxisAngle(n.side, graze * 0.42));
    });
    tail.forEach((n, i) => {
      // Counter-sway with the gait while walking; idle swish when standing.
      const wag = naturalSteering && walkW > 0.1
        ? Math.sin(s * 0.7 - i * 0.55) * 0.075
          + Math.sin(gait - i * 0.7) * 0.035
          - THREE.MathUtils.clamp(yawRate / Math.max(species.locomotion.turnRate, 1e-4), -1, 1)
            * (0.08 + i * 0.025)
        : walkW > 0.1
          ? Math.sin(gait * 2 - i * 0.7) * (0.22 + 0.06 * walkW)
        : Math.sin(s * 2.1 - i * 0.6) * 0.16;
      parts.tail[i].quaternion.copy(n.rest)
        .multiply(_q.setFromAxisAngle(n.up, wag));
    });
    }

    // The rigless pair have nothing to pose, so they breathe instead: the ribs
    // swell, and the whole animal drifts a couple of degrees. It is the only
    // motion available without the 147 MB of baked mesh copies that came off
    // these two files.
    if (!parts.legs.length) {
      const b = Math.sin(t * rate * 1.6 + phase);
      group.scale.set(scale * (1 + b * 0.022), scale * (1 + b * 0.014), scale);
      group.rotation.y = ry + Math.sin(t * rate * 0.23 + phase) * 0.06;
      group.position.y = baseY;
    }
    if (flex) {
      flex.time.value = t * (species.flex.rate ?? 1) * 2 + phase;
      // The head turns on its own clock, far slower than the tail, and rests
      // straight ahead most of the time — a lizard looks, then holds.
      const look = Math.sin(t * 0.17 + phase);
      flex.head.value = Math.sign(look) * Math.abs(look) ** 3 * species.flex.head;
    }
  };

  return { group, mixer, motion };
}
