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

const PART_NAMES = ['hat', 'backpack', 'tshirt', 'pants', 'shoes', 'hair', 'head'];
const partOf = (name = '') => {
  const n = name.toLowerCase();
  return PART_NAMES.find(p => n.includes(p)) || null;
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
const HAIR = [0x2a1d15, 0x6b4526, 0xa87a3f, 0xd8b878, 0x8f3f28, 0x9a958f, 0x14100d];
// Skin likewise: a gentle multiply either side of the pack's own tone.
const SKIN = [0xffffff, 0xf0d9c4, 0xd6a882, 0xa9764f, 0xe8c9a8, 0x8a5c3a];

/**
 * One visitor: a rebound clone with its own materials, mixer and gait.
 * `rng` is passed in so a crowd can be reproducible between reloads.
 */
export function makeVisitor(base, walkClip, rng) {
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
  // Three silhouettes off one head. The pack's hair is a single mesh — scalp and
  // ponytail together — so hiding it leaves a bald visitor; the cut is changed
  // by reshaping its geometry instead. 'cap' also puts a hat on, which is the
  // biggest change of outline available and the commonest thing in a zoo.
  const cut = rng();
  const style = cut < 0.34 ? 'long' : cut < 0.68 ? 'short' : 'cap';
  const wearsHat = style === 'cap' || rng() < 0.2;
  const wearsPack = rng() < 0.32;

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
      const part = partOf(m.name);
      if (part === 'hat') c.visible = wearsHat;
      else if (part === 'backpack') c.visible = wearsPack;
      if (part === 'hair') {
        c.color.setHex(hairColour);
        c.needsUpdate = true;
      } else if (part === 'head') {
        c.color.setHex(skinTone);
        c.needsUpdate = true;
      } else if (part && chosen[part] !== undefined) {
        c.map = null;                       // the pack's albedo is camouflage
        c.color.setHex(chosen[part]);
        c.roughness = Math.max(c.roughness, 0.82);
        c.metalness = Math.min(c.metalness, 0.04);
        // Dropping a map changes which shader program the material needs. A
        // clone starts out flagged as compiled, so without this it keeps the
        // one that samples the texture that is no longer there — which renders
        // black, whatever colour you just asked for.
        c.needsUpdate = true;
      }
      return c;
    });
    o.material = Array.isArray(o.material) ? made : made[0];
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

  const mixer = new THREE.AnimationMixer(group);
  // The pack's walk carries its own forward travel on the pelvis. The path
  // decides where a visitor is, so that track goes: left in, they slide away
  // from the position they were placed at.
  const clip = walkClip.clone();
  clip.tracks = clip.tracks.filter(t => t.name !== 'pelvis.position');
  const action = mixer.clipAction(clip);
  action.timeScale = 0.88 + rng() * 0.3;
  action.time = rng() * clip.duration;
  action.play();

  // Stride length scales with leg length, so the tallest visitors cover ground
  // fastest — otherwise the short ones look like they are running on the spot.
  return { group, mixer, height, speed: 1.05 * height * action.timeScale };
}

/** How many distinct looks the variation above can produce, for the record. */
export function crowdVariety() {
  return PALETTE.tshirt.length * PALETTE.pants.length * HAIR.length * SKIN.length * 3;
}
