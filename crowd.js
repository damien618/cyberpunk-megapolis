// crowd.js — zoo visitors built from the character pack's own rigged models
// rather than from primitives.
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

function seatedRig(group) {
  const legs = [];
  for (const side of ['l', 'r']) {
    const thigh = group.getObjectByName(`thigh_${side}`);
    const calf = group.getObjectByName(`calf_${side}`);
    const foot = group.getObjectByName(`foot_${side}`);
    if (!thigh || !calf) continue;
    legs.push({
      side: side === 'l' ? 1 : -1, thigh, calf, foot,
      rest: {
        thigh: thigh.quaternion.clone(),
        calf: calf.quaternion.clone(),
        foot: foot ? foot.quaternion.clone() : null,
      },
    });
  }
  const e = new THREE.Euler();
  const q = new THREE.Quaternion();
  const apply = () => {
    for (const l of legs) {
      e.set(0, l.side * SEAT.spread, SEAT.hip, 'YXZ');
      l.thigh.quaternion.copy(l.rest.thigh).multiply(q.setFromEuler(e));
      e.set(0, 0, apply.state.knee, 'YXZ');
      l.calf.quaternion.copy(l.rest.calf).multiply(q.setFromEuler(e));
      if (l.foot) {
        e.set(0, 0, apply.state.ankle, 'YXZ');
        l.foot.quaternion.copy(l.rest.foot).multiply(q.setFromEuler(e));
      }
    }
  };
  // Straightening the knee swings the shin forward; the ankle turns back by as
  // much so the sole stays flat on the floor instead of pointing at it.
  apply.state = { knee: SEAT.knee, ankle: SEAT.ankle };
  apply.rest = { knee: SEAT.knee, ankle: SEAT.ankle };
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
  { uniform = null, seated = false, still = false, idleClip = null } = {}) {
  const group = cloneSkinned(base);

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
    if (isGirl && list.length > 0 && list.every(m => {
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
    if (style !== 'long' && list.length > 0 && list.every(m => partOf(m?.name) === 'hair')) {
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

  // Height and build. The build is deliberately small — a group scaled unevenly
  // shears the limbs as the bones rotate under it, and six per cent is as far as
  // that goes before a swinging arm starts to wobble.
  const height = 0.88 + rng() * 0.26;
  const build = 0.94 + rng() * 0.12;
  group.scale.set(height * build, height, height * build);
  const headBone = group.getObjectByName('head');
  if (headBone && isGirl) {
    const hs = 0.92 + rng() * 0.14;
    headBone.scale.multiplyScalar(hs);
  }

  const mixer = new THREE.AnimationMixer(group);
  // The pack's walk carries its own forward travel on the pelvis. The path
  // decides where a visitor is, so that track goes: left in, they slide away
  // from the position they were placed at.
  // Someone standing at their door plays the idle if there is one: a walk held
  // on one frame is a mid-stride pose, and a shopkeeper frozen with one foot
  // forward reads as a mannequin rather than as a person waiting for custom.
  const clip = (still && idleClip ? idleClip : walkClip).clone();
  clip.tracks = clip.tracks.filter(t => t.name !== 'pelvis.position');
  const action = mixer.clipAction(clip);
  action.timeScale = seated ? 0.0001 : 0.88 + rng() * 0.3;
  action.time = still ? 0 : rng() * clip.duration;
  action.play();
  // Paused rather than removed: the mixer still writes the first frame every
  // update, so the pose holds instead of falling back to the bind stance.
  if (still) action.paused = true;
  const pose = seated ? seatedRig(group) : null;

  // Stride length scales with leg length, so the tallest visitors cover ground
  // fastest — otherwise the short ones look like they are running on the spot.
  return { group, mixer, pose, height,
    speed: still ? 0 : 1.05 * height * action.timeScale };
}

/** How many distinct looks the variation above can produce, for the record. */
export function crowdVariety() {
  return PALETTE.tshirt.length * PALETTE.pants.length * HAIR.length * SKIN.length * 3;
}
