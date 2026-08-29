// crowd.js — zoo visitors.
//
// Two rigs, same idea as the animals: each skeleton plays THE CLIPS THAT WERE
// AUTHORED FOR IT. The pack (girl.glb / man.glb) walks with the player's
// `pelvis` / `thigh_l` clip. A second, feminine guest (Ready Player Me armature
// + animation-library walk/idle) walks with `Hips` / `LeftUpLeg`. Mixing those
// clips across rigs is what left a T-pose; keeping them apart is what makes a
// different face actually walk.
//
// three.js will clone a SkinnedMesh happily enough, but the copy stays bound to
// the ORIGINAL skeleton: every clone then renders in whatever pose the first one
// is in, and animating one animates all of them. The addon that fixes this
// (SkeletonUtils) is not vendored here, and the fix is short enough to keep in
// the project rather than pull another file into vendor/ — walk the cloned
// graph, index the cloned bones by name, and rebind each cloned mesh to a fresh
// Skeleton built from those. The bone inverses describe the BIND pose, which
// the clone shares by definition, so they are reused as they are.
//
// Everything else here is variation. One model repeated eight times is a
// clone army, so each visitor gets its own copies of the pack's materials with
// the clothing recoloured, its own height, its own walking cadence and its own
// starting phase in the cycle.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

const dracoLoader = new DRACOLoader().setDecoderPath('./vendor/draco/');

export function cloneSkinned(source) {
  const clone = source.clone(true);
  // Object3D.clone does not duplicate bones: every clone would share the
  // template's Bone objects, so one clone's mixer would pose them all. Give
  // each clone its own skeleton, replacing bones in-place so that parents,
  // transforms and userData all survive.
  const replacements = new Map();
  clone.traverse(o => {
    if (!o.isBone || replacements.has(o)) return;
    const b = new THREE.Bone();
    b.name = o.name;
    b.position.copy(o.position);
    b.quaternion.copy(o.quaternion);
    b.scale.copy(o.scale);
    b.userData = { ...o.userData };
    replacements.set(o, b);
  });
  for (const [oldBone, newBone] of replacements) {
    const parent = oldBone.parent;
    if (!parent) continue;
    const at = parent.children.indexOf(oldBone);
    parent.remove(oldBone);
    if (at >= 0 && at <= parent.children.length) {
      parent.children.splice(at, 0, newBone);
      newBone.parent = parent;
    } else {
      parent.add(newBone);
    }
    for (const child of [...oldBone.children]) newBone.add(child);
  }
  const bonesByName = new Map();
  clone.traverse(o => { if (o.isBone) bonesByName.set(o.name, o); });

  // Object3D.clone walks the graph in the same order every time, so pairing the
  // skinned meshes by traversal order pairs them correctly without needing
  // names — which the pack does not always make unique.
  const src = [], dst = [];
  source.traverse(o => { if (o.isSkinnedMesh) src.push(o); });
  clone.traverse(o => { if (o.isSkinnedMesh) dst.push(o); });
  for (let i = 0; i < src.length; i++) {
    const from = src[i], to = dst[i];
    const bones = from.skeleton.bones.map(b => bonesByName.get(b.name) ?? b);
    to.bind(new THREE.Skeleton(bones, from.skeleton.boneInverses), from.bindMatrix);
  }
  return clone;
}

/**
 * Loads a base model for the crowd to be cloned from.
 *
 * The bases are loaded here rather than borrowed from the Player, because the
 * map's material factory builds fresh materials and does not carry the pack's
 * names across. Without the name there is nothing left to say which material is
 * the shirt and which the trousers, and every visitor came out wearing the
 * player's own outfit. The name is restored on the way past.
 */
export async function loadVisitorBase(url, matFactory) {
  const loader = new GLTFLoader().setDRACOLoader(dracoLoader);
  const gltf = await loader.loadAsync(url);
  gltf.scene.traverse(o => {
    if (!o.isMesh && !o.isSkinnedMesh) return;
    const list = Array.isArray(o.material) ? o.material : [o.material];
    const made = list.map(m => {
      const made = matFactory(m?.name);
      made.name = m?.name ?? '';
      return made;
    });
    o.material = Array.isArray(o.material) ? made : made[0];
  });
  return gltf.scene;
}

const GUEST_ROOT = /^(Hips|pelvis|Armature|RootNode|mixamorigHips|mixamorig:Hips)$/i;

/**
 * Keep hip bounce, drop authored travel. The guest walk advances 4 m on Z
 * over one cycle; the path already decides where she is, so that track would
 * slide her off the dirt.
 */
function pinRootXZ(clip) {
  const out = clip.clone();
  out.tracks = out.tracks.map(t => {
    if (!/\.position$/.test(t.name)) return t;
    const bone = t.name.slice(0, t.name.lastIndexOf('.'));
    if (!GUEST_ROOT.test(bone.split(/[:|/]/).pop())) return t;
    const n = t.clone();
    const x0 = n.values[0], z0 = n.values[2];
    for (let i = 0; i < n.values.length; i += 3) {
      n.values[i] = x0;
      n.values[i + 2] = z0;
    }
    return n;
  });
  return out;
}

function rootStride(clip) {
  let span = 0;
  for (const t of clip.tracks) {
    if (!/\.position$/.test(t.name)) continue;
    const bone = t.name.slice(0, t.name.lastIndexOf('.')).split(/[:|/]/).pop();
    if (!GUEST_ROOT.test(bone)) continue;
    let zMin = Infinity, zMax = -Infinity;
    for (let i = 2; i < t.values.length; i += 3) {
      const z = t.values[i];
      if (z < zMin) zMin = z;
      if (z > zMax) zMax = z;
    }
    if (zMax > zMin) span = Math.max(span, zMax - zMin);
  }
  return span;
}

function boneShort(name = '') {
  return name.split(/[:|/]/).pop().replace(/^mixamorig/i, '');
}

function bindClipTo(clip, root) {
  const names = new Set();
  const byShort = new Map();
  root.traverse(o => {
    if (!o.name) return;
    names.add(o.name);
    byShort.set(boneShort(o.name), o.name);
  });
  const out = clip.clone();
  out.tracks = out.tracks.map(t => {
    const dot = t.name.lastIndexOf('.');
    if (dot < 0) return t;
    const bone = t.name.slice(0, dot), prop = t.name.slice(dot + 1);
    if (names.has(bone)) return t;
    const short = boneShort(bone);
    const mapped = names.has(short) ? short : byShort.get(short);
    if (!mapped) return t;
    const n = t.clone();
    n.name = `${mapped}.${prop}`;
    return n;
  });
  return out;
}

function skinnedExtents(root) {
  root.updateMatrixWorld(true);
  const v = new THREE.Vector3();
  let minY = Infinity, maxY = -Infinity;
  root.traverse(o => {
    if (!o.isMesh && !o.isSkinnedMesh) return;
    const pos = o.geometry.attributes.position;
    if (!pos) return;
    for (let i = 0; i < pos.count; i++) {
      if (o.isSkinnedMesh && o.getVertexPosition) o.getVertexPosition(i, v);
      else v.fromBufferAttribute(pos, i);
      v.applyMatrix4(o.matrixWorld);
      if (v.y < minY) minY = v.y;
      if (v.y > maxY) maxY = v.y;
    }
  });
  return { minY, maxY, height: Math.max(maxY - minY, 1e-4) };
}

/**
 * The guest ships as one atlas. Bottom-left is the tank: white fabric plus a
 * "READY PLAYER ME" print that has no business in the park. Lift the ink to
 * fabric, then dye the shirt so two clones are not wearing the same top.
 */
function dressGuestAtlas(map, shirtHex) {
  const img = map?.image;
  if (!img) return map;
  const w = img.width || img.videoWidth, h = img.height || img.videoHeight;
  if (!w || !h) return map;
  const c = Object.assign(document.createElement('canvas'), { width: w, height: h });
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(0, 0, w, h);
  const p = data.data;
  const shirt = new THREE.Color(shirtHex);
  const x1 = w >> 1, y0 = h >> 1;
  for (let y = y0; y < h; y++) {
    for (let x = 0; x < x1; x++) {
      const i = (y * w + x) * 4;
      const r = p[i], g = p[i + 1], b = p[i + 2], a = p[i + 3];
      if (a < 16) continue;
      const lum = 0.3 * r + 0.59 * g + 0.11 * b;
      if (lum < 14) continue;
      const ink = lum < 72 && r < 96;
      const fabric = lum > 88;
      if (!ink && !fabric) continue;
      const k = (ink ? 220 : lum) / 255;
      p[i]     = Math.min(255, shirt.r * 255 * k);
      p[i + 1] = Math.min(255, shirt.g * 255 * k);
      p[i + 2] = Math.min(255, shirt.b * 255 * k);
    }
  }
  ctx.putImageData(data, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.flipY = map.flipY;
  t.wrapS = map.wrapS;
  t.wrapT = map.wrapT;
  t.anisotropy = map.anisotropy || 4;
  t.needsUpdate = true;
  return t;
}

/**
 * The masculine guest's atlas keeps the same layout but his polo is dark navy:
 * the light-fabric pass above would read it as "ink" and flatten every fold to
 * one tone. Dye it instead — keep each pixel's own luminance as the shading
 * and remap the hue, so the folds and the seams survive the recolour.
 */
export function dressGuestAtlasDark(map, shirtHex) {
  const img = map?.image;
  if (!img) return map;
  const w = img.width || img.videoWidth, h = img.height || img.videoHeight;
  if (!w || !h) return map;
  const c = Object.assign(document.createElement('canvas'), { width: w, height: h });
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(0, 0, w, h);
  const p = data.data;
  const shirt = new THREE.Color(shirtHex);
  const x1 = w >> 1, y0 = h >> 1;
  let sum = 0, n = 0;
  for (let y = y0; y < h; y++) {
    for (let x = 0; x < x1; x++) {
      const i = (y * w + x) * 4;
      if (p[i + 3] < 16) continue;
      sum += 0.3 * p[i] + 0.59 * p[i + 1] + 0.11 * p[i + 2];
      n++;
    }
  }
  const mean = Math.max(12, sum / Math.max(1, n));
  for (let y = y0; y < h; y++) {
    for (let x = 0; x < x1; x++) {
      const i = (y * w + x) * 4;
      if (p[i + 3] < 16) continue;
      const lum = 0.3 * p[i] + 0.59 * p[i + 1] + 0.11 * p[i + 2];
      const k = Math.min(1.45, 0.25 + 0.75 * (lum / mean));
      p[i]     = Math.min(255, shirt.r * 255 * k);
      p[i + 1] = Math.min(255, shirt.g * 255 * k);
      p[i + 2] = Math.min(255, shirt.b * 255 * k);
    }
  }
  ctx.putImageData(data, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.flipY = map.flipY;
  t.wrapS = map.wrapS;
  t.wrapT = map.wrapT;
  t.anisotropy = map.anisotropy || 4;
  t.needsUpdate = true;
  return t;
}

/**
 * A visitor who is not the pack: her own mesh, her own walk, her own idle,
 * scaled to a standing height in metres. Clips are loaded separately because
 * that is how the animation library ships them — same pattern as retargeting
 * a Mixamo walk onto a mesh that already has the matching bone names.
 */
export async function loadGuestRig({
  model, walk, idle, height = 1.68, recolor = 'atlas',
  walkClipName, idleClipName,
} = {}) {
  const loader = new GLTFLoader().setDRACOLoader(dracoLoader);
  const gltf = await loader.loadAsync(model);
  const walkGltf = walk && walk !== model ? await loader.loadAsync(walk) : gltf;
  const idleGltf = !idle || idle === model || idle === walk
    ? (idle === walk && walkGltf !== gltf ? walkGltf : gltf)
    : await loader.loadAsync(idle);
  const scene = gltf.scene;
  scene.traverse(o => {
    if (!o.isMesh && !o.isSkinnedMesh) return;
    const list = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
    for (const m of list) {
      if (m.map) m.map.colorSpace = THREE.SRGBColorSpace;
      m.metalness = Math.min(m.metalness ?? 0, 0.06);
      m.roughness = Math.max(m.roughness ?? 0.5, 0.58);
      m.envMapIntensity = 0.7;
    }
    o.castShadow = true;
    o.receiveShadow = true;
    o.frustumCulled = false;
  });
  const pick = (gltfSrc, name, fallback = 0) => {
    if (name) {
      const hit = gltfSrc.animations.find(c => c.name.toLowerCase() === String(name).toLowerCase());
      if (hit) return hit;
    }
    return gltfSrc.animations[fallback];
  };
  const rawWalk = pick(walkGltf, walkClipName, 0);
  const rawIdle = pick(idleGltf, idleClipName, 0);
  const stride = rootStride(rawWalk);
  const walkClip = bindClipTo(pinRootXZ(rawWalk), scene);
  const idleClip = bindClipTo(pinRootXZ(rawIdle), scene);
  const { height: measured } = skinnedExtents(scene);
  return { scene, walkClip, idleClip, kind: 'guest', recolor, measured, fitHeight: height, stride };
}

// The two characters do not name their clothing the same way. The girl has a
// TSHIRT; the man has a JACKET and a VEST, and nothing called a shirt at all —
// which is why the shopkeeper kept his camouflage top while his trousers went
// green: the trousers matched PANTS on both models and the shirt matched
// nothing on his. Both of the man's upper garments map to the same slot.
const PART_NAMES = ['hat', 'backpack', 'tshirt', 'jacket', 'vest', 'pants', 'shoes',
  'hair', 'eyeshadow', 'cornea', 'lashes', 'eyes', 'head', 'body'];
const PART_ALIASES = { jacket: 'tshirt', vest: 'tshirt', body: 'head' };
const partOf = (name = '') => {
  const hit = PART_NAMES.find(p => name.toLowerCase().includes(p));
  return hit ? (PART_ALIASES[hit] ?? hit) : null;
};
// What the shops' staff wear, so they are picked out of the crowd at a glance.
export const STAFF_UNIFORM = {
  shirt: 0xffffff,      // white, so the drawn stripe carries the colour
  pants: 0x2f5b32,
  shoes: 0x2a2a2e,
  stripes: true,
  hat: false,
};
// Day-out colours, deliberately warmer and more varied than the pack's own
// military palette — a zoo crowd on a sunny morning, not a patrol.
const PALETTE = {
  tshirt: [0xd0574a, 0x3f7fbe, 0xe6c058, 0x59a06a, 0xcf7fb0, 0xeeeae0,
    0x4a4f78, 0xe08a4a, 0x7db8c8, 0x8a5fa8],
  pants: [0x39415c, 0x6b6154, 0x2f3a44, 0x8a7f6d, 0x4a5b48, 0xb0a48c, 0x2b3550],
  shoes: [0xe8e6df, 0x2a2a2e, 0x6b4a34, 0x3f5f86],
  hat: [0xe4d9bd, 0xd0574a, 0x3f7fbe, 0x59a06a],
  backpack: [0x4a4f78, 0x8a5f3d, 0x59a06a, 0xd0574a],
};
// Hair is tinted rather than recoloured: the pack's texture carries the strand
// detail and the parting, and dropping it for a flat colour turns the head into
// a helmet. Multiplied over the map instead, which is what a hair dye does.
const HAIR = [0x2a1d15, 0x6b4526, 0xa87a3f, 0xd8b878, 0x8f3f28, 0x9a958f, 0x14100d,
  0xc45a2a, 0x3a2a48];
// Never the pack's un-tinted white: that is the player's own face, and a
// visitor wearing it is her twin. Stay either side of that tone instead.
const SKIN = [0xf0d9c4, 0xd6a882, 0xa9764f, 0xe8c9a8, 0x8a5c3a, 0xc48a6a, 0xdeb89a];
const EYES = [0x6b4a28, 0x3d5a34, 0x4a4540, 0x8a6a38, 0x2c1810, 0x5a6a78, 0x3a2a1c];

// A shirt with stripes on it, drawn rather than downloaded: eight bands in a
// tall thin canvas, tiled over whatever UVs the shirt happens to have. It will
// not line up with a seam, but at two metres it reads as striped, which is the
// whole job.
let stripeCache = null;
function stripeTexture(light = '#cfe3c2', dark = '#2f6b34') {
  if (stripeCache) return stripeCache;
  // Wide bands and no tiling. The pack's shirts are UV atlases, so a fine
  // stripe repeated three times over one lands a few pixels per band on the
  // torso island and reads as noise — which is what the first pass looked like.
  const c = Object.assign(document.createElement('canvas'), { width: 4, height: 64 });
  const ctx = c.getContext('2d');
  for (let i = 0; i < 8; i++) {
    ctx.fillStyle = i % 2 ? dark : light;
    ctx.fillRect(0, i * 8, 4, 8);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(1, 1);
  t.magFilter = THREE.NearestFilter;
  t.colorSpace = THREE.SRGBColorSpace;
  stripeCache = t;
  return t;
}

// The seated pose. The pack has no sitting clip, so an idle is played for the
// arms and spine and the leg chain is overwritten after it every frame — the
// same division of labour the player's own seated pose uses. Rotations are
// applied to the BIND pose rather than added to the clip's, or the idle's own
// stance comes through underneath and the knees drift apart over a few seconds.
// The knee and the ankle are held in mutable state rather than read from the
// constants: knee-to-sole on these characters is longer than a chair is high,
// so a shin left hanging vertically puts the feet through the floor. Whoever
// places the sitter measures its own seat and fits the leg to it — see
// `fitSeatedLegs` in main-ZOO.js.
const SEAT = { hip: 1.44, knee: -1.52, ankle: 0.12, spread: 0.09 };

// The girl mesh is the player's. Recolouring a t-shirt is not enough: from
// the front she is still the same face. Push the bind-pose vertices around
// so the jaw, cheeks, nose and brow are a different person, then the skin
// tint and the eyes do the rest.
function morphVisitorFace(mesh, rng) {
  const g = mesh.geometry.clone();
  const p = g.attributes.position;
  if (!p) return;
  g.computeBoundingBox();
  const bb = g.boundingBox;
  const cx = (bb.min.x + bb.max.x) * 0.5;
  const spanY = Math.max(1e-4, bb.max.y - bb.min.y);
  const spanX = Math.max(1e-4, bb.max.x - bb.min.x);
  const jaw = (rng() - 0.5) * 0.22;
  const cheek = (rng() - 0.5) * 0.18;
  const nose = (rng() - 0.5) * 0.16;
  const brow = (rng() - 0.5) * 0.12;
  const chin = (rng() - 0.5) * 0.10;
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const ny = (y - bb.min.y) / spanY;
    const nx = (x - cx) / spanX;
    if (ny < 0.48) {
      x += nx * spanX * jaw * (0.48 - ny);
      y += chin * 0.012 * (0.48 - ny);
    }
    if (ny > 0.32 && ny < 0.72) {
      const w = Math.sin((ny - 0.32) / 0.4 * Math.PI);
      x += nx * spanX * cheek * w;
    }
    if (Math.abs(nx) < 0.18 && ny > 0.42 && ny < 0.68) {
      z += nose * 0.035 * (1 - Math.abs(nx) / 0.18);
    }
    if (ny > 0.62 && ny < 0.84) y += brow * 0.018;
    p.setXYZ(i, x, y, z);
  }
  p.needsUpdate = true;
  g.computeVertexNormals();
  g.computeBoundingSphere();
  mesh.geometry = g;
}

// ---------------------------------------------------------------------------
// Rig-agnostic posing.
//
// Two skeleton conventions ship in this project. The pack (chars/glb) uses
// Unreal's names — pelvis / thigh_l / calf_l — and the Ready Player Me guests
// in glb/visitors use Mixamo's — Hips / LeftUpLeg / LeftLeg. Anything that
// poses a body has to speak both. Written for the pack alone, as seatedRig
// originally was, the guests can only ever walk, and every seated or lying
// figure in a map collapses onto the one pack rig — which is the PLAYER's rig,
// and the thing we most need the crowd not to look like.
//
// Poses are written in anatomical terms — flexion (bend forward), abduction
// (spread sideways) — and each rig says which of its own local axes those are.
// The pack's numbers below are the ones the seated pose was measured with, so
// its result is unchanged and the zoo and the airport are untouched.
// ---------------------------------------------------------------------------
const RIGS = {
  pack: {
    kind: 'pack',
    root: ['pelvis'], head: ['head'], spine: ['spine_01', 'spine_02', 'spine_03'],
    thigh: ['thigh_l', 'thigh_r'], calf: ['calf_l', 'calf_r'], foot: ['foot_l', 'foot_r'],
    upperarm: ['upperarm_l', 'upperarm_r'], lowerarm: ['lowerarm_l', 'lowerarm_r'],
    flex: 'z', abduct: 'y', flexSign: 1, abductSign: 1,
  },
  mixamo: {
    kind: 'mixamo',
    root: ['Hips'], head: ['Head'], spine: ['Spine', 'Spine1', 'Spine2'],
    thigh: ['LeftUpLeg', 'RightUpLeg'], calf: ['LeftLeg', 'RightLeg'],
    foot: ['LeftFoot', 'RightFoot'],
    upperarm: ['LeftArm', 'RightArm'], lowerarm: ['LeftForeArm', 'RightForeArm'],
    flex: 'x', abduct: 'z', flexSign: 1, abductSign: -1,
  },
};

// Exact name first, then a suffix match so `mixamorigLeftUpLeg` and
// `mixamorig:LeftUpLeg` resolve without listing every prefix a exporter invents.
function boneNamed(root, name) {
  const hit = root.getObjectByName(name);
  if (hit) return hit;
  let found = null;
  const want = name.toLowerCase();
  root.traverse(o => {
    if (found || !o.isBone) return;
    const n = o.name.toLowerCase().replace(/^mixamorig:?/, '');
    if (n === want) found = o;
  });
  return found;
}
export function rootBoneOf(root) {
  return boneNamed(root, 'pelvis') || boneNamed(root, 'Hips');
}
export function rigOf(root) {
  if (boneNamed(root, 'thigh_l')) return RIGS.pack;
  if (boneNamed(root, 'LeftUpLeg')) return RIGS.mixamo;
  return null;
}

const _q = new THREE.Quaternion();
const _e = new THREE.Euler(0, 0, 0, 'YXZ');
// One joint, from anatomical angles. `side` is +1 left, -1 right.
function setJoint(bone, rest, rig, flex, abduct = 0, side = 1) {
  if (!bone || !rest) return;
  _e.set(0, 0, 0, 'YXZ');
  _e[rig.flex] = flex * rig.flexSign;
  _e[rig.abduct] = abduct * side * rig.abductSign;
  bone.quaternion.copy(rest).multiply(_q.setFromEuler(_e));
}

// Grab a joint and remember the bind rotation. Poses are applied to the BIND
// pose rather than added to whatever the clip left, or the clip's own stance
// bleeds through and the limbs drift apart over a few seconds.
function grab(root, names) {
  const out = [];
  for (let i = 0; i < names.length; i++) {
    const b = boneNamed(root, names[i]);
    out.push(b ? { bone: b, rest: b.quaternion.clone(), side: i === 0 ? 1 : -1 } : null);
  }
  return out;
}
function limbs(root, rig) {
  return {
    thigh: grab(root, rig.thigh), calf: grab(root, rig.calf), foot: grab(root, rig.foot),
    upperarm: grab(root, rig.upperarm), lowerarm: grab(root, rig.lowerarm),
    spine: grab(root, rig.spine), head: grab(root, rig.head),
  };
}

// Seated on a chair or a bench: thighs forward, shins down. The knee and the
// ankle live in mutable state because knee-to-sole on these characters is
// longer than a chair is high — whoever places the sitter measures its own seat
// and fits the leg to it (see fitSeatedLegs in main-ZOO.js).
function seatedRig(group) {
  const rig = rigOf(group);
  if (!rig) return null;
  const L = limbs(group, rig);
  const apply = () => {
    for (const j of L.thigh) if (j) setJoint(j.bone, j.rest, rig, SEAT.hip, SEAT.spread, j.side);
    for (const j of L.calf) if (j) setJoint(j.bone, j.rest, rig, apply.state.knee);
    for (const j of L.foot) if (j) setJoint(j.bone, j.rest, rig, apply.state.ankle);
  };
  apply.state = { knee: SEAT.knee, ankle: SEAT.ankle };
  apply.rest = { knee: SEAT.knee, ankle: SEAT.ankle };
  apply.rig = rig;
  return apply;
}

// Sunbathing. The body is laid flat by the CALLER (rotating the group), so all
// this does is take the standing stance out of it: arms down by the sides, one
// knee loosely raised, head turned. A figure left in its idle stance and simply
// tipped over reads as a plank, which is the whole risk with a lying pose.
export function lyingRig(group, rng = Math.random) {
  const rig = rigOf(group);
  if (!rig) return null;
  const L = limbs(group, rig);
  const kneeUp = rng() < 0.45 ? 0.5 + rng() * 0.5 : 0;
  const armOut = 0.9 + rng() * 0.5;
  const bentSide = rng() < 0.5 ? 0 : 1;
  const apply = () => {
    L.thigh.forEach((j, i) => {
      if (j) setJoint(j.bone, j.rest, rig, i === bentSide ? kneeUp * 0.8 : 0.05,
        0.12 + (i === bentSide ? 0.14 : 0), j.side);
    });
    L.calf.forEach((j, i) => { if (j) setJoint(j.bone, j.rest, rig, i === bentSide ? -kneeUp * 1.7 : -0.06); });
    for (const j of L.upperarm) if (j) setJoint(j.bone, j.rest, rig, -0.1, armOut, j.side);
    for (const j of L.lowerarm) if (j) setJoint(j.bone, j.rest, rig, -0.25);
  };
  apply.rig = rig;
  return apply;
}

// Sitting on the ground, knees up or crossed — how people sit round a fire.
export function groundSitRig(group, rng = Math.random) {
  const rig = rigOf(group);
  if (!rig) return null;
  const L = limbs(group, rig);
  // Cross-legged, always: round a fire it is what people actually do, and the
  // wide knees are what make the silhouette read as sitting at all. A deeper
  // knee than this tucks the shins under the hips and buries them in the sand.
  const crossed = rng() < 0.5;
  const hip = crossed ? 1.28 : 1.16;
  const knee = crossed ? -2.0 : -1.75;
  const spread = crossed ? 0.98 : 0.8;
  const lean = 0.12 + rng() * 0.16;
  const apply = () => {
    for (const j of L.thigh) if (j) setJoint(j.bone, j.rest, rig, hip, spread, j.side);
    for (const j of L.calf) if (j) setJoint(j.bone, j.rest, rig, knee);
    for (const j of L.foot) if (j) setJoint(j.bone, j.rest, rig, 0.2);
    for (const j of L.upperarm) if (j) setJoint(j.bone, j.rest, rig, apply.state.arm, 0.22, j.side);
    for (const j of L.lowerarm) if (j) setJoint(j.bone, j.rest, rig, apply.state.forearm);
    const sp = L.spine[0];
    if (sp) setJoint(sp.bone, sp.rest, rig, -lean);
  };
  apply.state = { arm: 0.35, forearm: 0.7 };
  apply.rig = rig;
  return apply;
}

// A free pose: whatever the caller wants to hold, in anatomical terms. Used for
// the ball and paddle players, the skaters and the swimmers.
export function customRig(group) {
  const rig = rigOf(group);
  if (!rig) return null;
  const L = limbs(group, rig);
  const apply = () => {
    const s = apply.state;
    L.thigh.forEach((j, i) => { if (j) setJoint(j.bone, j.rest, rig, s.hip[i], s.spread, j.side); });
    L.calf.forEach((j, i) => { if (j) setJoint(j.bone, j.rest, rig, s.knee[i]); });
    L.foot.forEach(j => { if (j) setJoint(j.bone, j.rest, rig, s.ankle); });
    L.upperarm.forEach((j, i) => { if (j) setJoint(j.bone, j.rest, rig, s.arm[i], s.armOut[i], j.side); });
    L.lowerarm.forEach((j, i) => { if (j) setJoint(j.bone, j.rest, rig, s.forearm[i]); });
    const sp = L.spine[0];
    if (sp) setJoint(sp.bone, sp.rest, rig, s.lean);
  };
  apply.state = {
    hip: [0, 0], knee: [0, 0], spread: 0.06, ankle: 0,
    arm: [0, 0], armOut: [0, 0], forearm: [0, 0], lean: 0,
  };
  apply.rig = rig;
  return apply;
}

/**
 * One visitor: a rebound clone with its own materials, mixer and gait.
 * `rng` is passed in so a crowd can be reproducible between reloads.
 *
 * `uniform` forces the clothing instead of rolling it — the shops' staff all
 * wear the same thing, which is what makes them read as staff. `seated` swaps
 * the walk for an idle plus the pose above. `still` is for the people who are
 * placed rather than routed — the standing shopkeepers — who were playing the
 * walk on the spot and treading the same square metre for ever.
 */
export function makeVisitor(base, walkClip, rng,
  { uniform = null, seated = false, still = false, idleClip = null, guest = null } = {}) {
  const group = cloneSkinned(base);
  const isGuest = Boolean(guest) || Boolean(group.getObjectByName('Hips') && !group.getObjectByName('pelvis'));

  // The player's own wardrobe alternates hang off the same graph. They came
  // along with the clone, and two of them are visible in the zoo outfit — left
  // alone, every visitor would arrive in her cut-off denim and flip-flops.
  const extras = [];
  group.traverse(o => { if (o.name.startsWith('Wardrobe_')) extras.push(o); });
  for (const o of extras) o.parent?.remove(o);

  const pick = list => list[Math.floor(rng() * list.length)];
  const chosen = Object.fromEntries(
    Object.entries(PALETTE).map(([part, list]) => [part, pick(list)]));
  const hairColour = pick(HAIR);
  const skinTone = pick(SKIN);
  const eyeColour = pick(EYES);
  let isGirl = false;
  group.traverse(o => {
    const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
    if (mats.some(m => /survgirl/i.test(m?.name ?? ''))) isGirl = true;
  });
  // Three silhouettes off one head. The pack's hair is a single mesh — scalp and
  // ponytail together — so hiding it leaves a bald visitor; the cut is changed
  // by reshaping its geometry instead. 'cap' also puts a hat on, which is the
  // biggest change of outline available and the commonest thing in a zoo.
  // The player wears the long ponytail: visitors built from her mesh never do.
  const cut = rng();
  const style = isGirl ? (cut < 0.55 ? 'short' : 'cap')
    : (cut < 0.34 ? 'long' : cut < 0.68 ? 'short' : 'cap');
  const wearsHat = uniform ? uniform.hat === true : (style === 'cap' || rng() < 0.2);
  const wearsPack = uniform ? false : rng() < 0.32;
  if (uniform) {
    chosen.tshirt = uniform.shirt;
    chosen.pants = uniform.pants;
    chosen.shoes = uniform.shoes ?? chosen.shoes;
    if (uniform.hat !== undefined) chosen.hat = uniform.hatColour ?? chosen.hat;
  }

  group.traverse(o => {
    if (!o.isMesh && !o.isSkinnedMesh) return;
    const list = Array.isArray(o.material) ? o.material : [o.material];
    const made = list.map(m => {
      if (!m) return m;
      const c = m.clone();
      if (isGuest) {
        // RPM guests ship as one atlas — light fabric gets the ink-lift pass,
        // dark fabric gets the dye pass. Mixamo bodies (X Bot) are a single
        // tintable mesh: dressing an atlas region on those dyes the whole
        // person the shirt colour, which is how a clone army starts.
        if (guest?.recolor === 'atlas-dark' && c.map) c.map = dressGuestAtlasDark(c.map, chosen.tshirt);
        else if (guest?.recolor !== 'tint' && c.map) c.map = dressGuestAtlas(c.map, chosen.tshirt);
        else c.color.lerp(new THREE.Color(chosen.tshirt), 0.42);
        c.metalness = Math.min(c.metalness ?? 0, 0.06);
        c.roughness = Math.max(c.roughness ?? 0.5, 0.6);
        c.envMapIntensity = 0.7;
        c.needsUpdate = true;
        return c;
      }
      // setOutfit switches parts by flipping `visible` on the SHARED material,
      // and the zoo has the trousers and trainers switched off for the player.
      // The clones start from whatever state that left, so every part is turned
      // back on here and then dressed deliberately.
      c.visible = true;
      // The crowd is dressed from flat tints, not from the pack's own finish.
      // A packed metallic/smoothness map left over from the base model turns
      // those tints into a black mirror under the sun — it declares the whole
      // body a metal and kills the diffuse. Every visitor material is therefore
      // stripped back to a dielectric and given its colour, and only the
      // clothing maps are kept.
      c.metalnessMap = null;
      c.roughnessMap = null;
      c.metalness = 0;
      c.roughness = 0.85;
      c.envMapIntensity = 0.35;
      const part = partOf(m.name);
      if (part === 'hat') c.visible = wearsHat;
      else if (part === 'backpack') c.visible = wearsPack;
      if (part === 'hair') {
        c.color.setHex(hairColour);
        c.roughness = 0.72;
        c.needsUpdate = true;
      } else if (part === 'eyes') {
        c.color.setHex(eyeColour);
        c.needsUpdate = true;
      } else if (part === 'head') {
        // Skin (face, hands, arms): tint and keep matte so it never reads as a
        // silhouette against the plaza light. A little env lift keeps faces
        // readable under the terrace roof, where the sun never reaches.
        c.color.setHex(skinTone);
        c.metalness = 0;
        c.roughness = 0.88;
        c.envMapIntensity = 0.85;
        if (c.normalScale) c.normalScale.setScalar(0.55);
        c.needsUpdate = true;
      } else if (part && chosen[part] !== undefined) {
        // Staff shirts get the stripe; everything else is plain.
        c.map = (uniform?.stripes && part === 'tshirt') ? stripeTexture() : null;
        c.color.setHex(chosen[part]);
        c.roughness = Math.max(c.roughness, 0.82);
        c.metalness = Math.min(c.metalness, 0.04);
        // Dropping a map changes which shader program the material needs. A
        // clone starts out flagged as compiled, so without this it keeps the
        // one that samples the texture that is no longer there — which renders
        // black, whatever colour you just asked for.
        c.needsUpdate = true;
      } else {
        c.metalness = Math.min(c.metalness, 0.2);
        c.needsUpdate = true;
      }
      return c;
    });
    o.material = Array.isArray(o.material) ? made : made[0];
    if (isGirl && !isGuest && list.length > 0 && list.every(m => {
      const n = (m?.name ?? '').toLowerCase();
      return n.includes('head') && !n.includes('body');
    })) {
      morphVisitorFace(o, rng);
    }
    // The cut. Everything hanging below the nape is pulled back up towards it,
    // which turns the pack's ponytail into a bob or a crop without touching the
    // scalp — the only part of the mesh whose shape has to stay put.
    // `every`, not `some`: if the pack ever merges the hair into a mesh that
    // also carries the body, reshaping its geometry would deform the visitor,
    // not her haircut. In that case the colour and the cap still vary.
    if (!isGuest && style !== 'long' && list.length > 0 && list.every(m => partOf(m?.name) === 'hair')) {
      const g = o.geometry.clone();
      const p = g.attributes.position;
      g.computeBoundingBox();
      const nape = g.boundingBox.max.y - (g.boundingBox.max.y - g.boundingBox.min.y) * 0.34;
      const lift = style === 'cap' ? 0.18 : 0.42;
      for (let i = 0; i < p.count; i++) {
        const y = p.getY(i);
        if (y >= nape) continue;
        const t = nape - y;
        p.setXYZ(i, p.getX(i) * (0.86 + 0.14 * lift), nape - t * lift,
          p.getZ(i) * (0.86 + 0.14 * lift));
      }
      p.needsUpdate = true;
      g.computeVertexNormals();
      g.computeBoundingSphere();
      o.geometry = g;
    }
    o.castShadow = true;
    o.receiveShadow = true;
    // A skinned bounding sphere computed from the bind pose is wrong as soon as
    // the clip moves, and a visitor popping out at the screen edge is worse than
    // the cull is worth.
    o.frustumCulled = false;
  });

  // Height and build. The pack is scaled as a factor of its authored size; the
  // guest is measured and fitted to metres so a centimetre-exported GLB cannot
  // tower over the player. Uneven pack scale is kept small — it shears limbs.
  let height;
  if (isGuest) {
    const metres = (guest?.fitHeight ?? 1.68) + (rng() - 0.5) * 0.10;
    height = metres / (guest?.measured || 1.7);
    const build = 0.97 + rng() * 0.06;
    group.scale.setScalar(height * build);
  } else {
    height = 0.88 + rng() * 0.26;
    const build = 0.94 + rng() * 0.12;
    group.scale.set(height * build, height, height * build);
    const headBone = group.getObjectByName('head');
    if (headBone && isGirl) {
      const hs = 0.92 + rng() * 0.14;
      headBone.scale.multiplyScalar(hs);
    }
  }

  const mixer = new THREE.AnimationMixer(group);
  // The pack's walk carries its own forward travel on the pelvis. The path
  // decides where a visitor is, so that track goes: left in, they slide away
  // from the position they were placed at.
  // Someone standing at their door plays the idle if there is one: a walk held
  // on one frame is a mid-stride pose, and a shopkeeper frozen with one foot
  // forward reads as a mannequin rather than as a person waiting for custom.
  const clip = (still && idleClip ? idleClip : walkClip).clone();
  if (!isGuest) clip.tracks = clip.tracks.filter(t => t.name !== 'pelvis.position');
  const action = mixer.clipAction(clip);
  action.timeScale = seated ? 0.0001 : 0.88 + rng() * 0.3;
  action.time = still ? 0 : rng() * clip.duration;
  action.play();
  // Paused rather than removed: the mixer still writes the first frame every
  // update, so the pose holds instead of falling back to the bind stance.
  if (still) action.paused = true;
  // Both rigs can be posed now (see rigOf / setJoint above), so a guest is a
  // sitter like anyone else. This used to read "the guest does not have those
  // bones, so she is a walker, never a sitter" — which quietly forced every
  // seated figure in every map onto the pack rig, i.e. onto the player's body.
  const pose = seated ? seatedRig(group) : null;

  // Stride length scales with leg length, so the tallest visitors cover ground
  // fastest — otherwise the short ones look like they are running on the spot.
  // The guest walk already has a measured stride (metres of authored travel
  // over one cycle); using that instead of the pack's 1.05 factor keeps her
  // feet from skating.
  const pace = isGuest && guest?.stride
    ? guest.stride / Math.max(clip.duration, 0.01)
    : 1.05;
  return { group, mixer, pose, height,
    speed: still ? 0 : pace * height * action.timeScale };
}

/** How many distinct looks the variation above can produce, for the record. */
export function crowdVariety() {
  return PALETTE.tshirt.length * PALETTE.pants.length * HAIR.length * SKIN.length * 3;
}
