// fauna.js — the park's animals.
//
// These are real rigged models rather than the primitives that stood in for
// them: Quaternius's animal pack, public domain (CC0), fetched from Poly Pizza
// and committed under glb/animals. Each is one skinned mesh of a few thousand
// triangles with no textures at all — flat materials and vertex colour — and
// each carries about two dozen clips, of which a zoo only ever needs the quiet
// ones: Idle, Idle_2, the head-low variants, Eating and Walk.
//
// The species are the ones the pack actually has. It contains no lion, bear,
// primate, snake or parrot, so the exhibits are a temperate wildlife park and a
// farm corner instead of a tropical zoo.
//
// Cloning goes through crowd.js: three.js copies a SkinnedMesh still bound to
// the skeleton it came from, so every clone would otherwise play the first
// one's animation in the first one's pose.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { cloneSkinned } from './crowd.js?v=9';

const dracoLoader = new DRACOLoader().setDecoderPath('./vendor/draco/');

// `withers` is the shoulder height the model is scaled to, in metres, which is
// the measurement every field guide quotes and the only one that reads at
// exhibit range: get it wrong and a fox is a wolf. Mid-range adults, so that a
// herd with young in it averages out about right.
//
// red deer 1.1-1.3 · alpaca 0.81-0.99 · red fox 0.35-0.40 · shiba 0.37-0.42 ·
// grey wolf 0.66-0.81
export const SPECIES = {
  deer: { file: 'deer.glb', withers: 1.20 },
  alpaca: { file: 'alpaca.glb', withers: 0.95 },
  fox: { file: 'fox.glb', withers: 0.38 },
  shiba: { file: 'shiba.glb', withers: 0.39 },
  wolf: { file: 'wolf.glb', withers: 0.78 },
};

// The withers is the ridge over the shoulder. Measuring the model's TOTAL
// height and calling it that is what left every animal short beside a person:
// the top of a standing model is an ear, an antler or — on the alpaca, whose
// neck is vertical — the top of the head, 26 % above the shoulder. Scaled that
// way the alpacas stood 0.79 m at the shoulder instead of 0.95.
//
// The pack rigs all five species identically, so the shoulder joint is found by
// name and the withers is the highest skin in a slice of body around it. One
// pass over a few thousand bind-pose vertices per species, at load.
function withersHeight(root) {
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  const fallback = Math.max(box.max.y - box.min.y, 1e-4);
  const shoulder = root.getObjectByName('FrontShoulderL')
    ?? root.getObjectByName('FrontShoulderR');
  if (!shoulder) return fallback;
  const at = new THREE.Vector3().setFromMatrixPosition(shoulder.matrixWorld);
  // The body runs along Z on every model in the pack; the slice is a fraction
  // of that length either side of the joint.
  const span = (box.max.z - box.min.z) * 0.12;
  const v = new THREE.Vector3();
  let top = -Infinity;
  root.traverse(o => {
    if (!o.isMesh && !o.isSkinnedMesh) return;
    const pos = o.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
      if (Math.abs(v.z - at.z) <= span && v.y > top) top = v.y;
    }
  });
  return top > box.min.y ? top - box.min.y : fallback;
}

// Clips worth standing in front of. `Walk` is kept separate: an animal that
// walks has to be given somewhere to walk to, which the caller decides.
const RESTING = ['Idle', 'Idle_2', 'Idle_2_HeadLow', 'Idle_Headlow', 'Eating'];

/** The pack exports each clip twice, once bare and once armature-qualified. */
function findClip(clips, name) {
  return clips.find(c => c.name === name)
    || clips.find(c => c.name.endsWith(`|${name}`))
    || null;
}

export async function loadSpecies(names) {
  const loader = new GLTFLoader().setDRACOLoader(dracoLoader);
  const out = {};
  for (const name of names) {
    const spec = SPECIES[name];
    if (!spec) continue;
    try {
      const gltf = await loader.loadAsync(`./glb/animals/${spec.file}`);
      const root = gltf.scene;
      // Scale from the model's own withers rather than a guessed constant: the
      // pack is authored around 1 unit and the species differ.
      out[name] = {
        root,
        clips: gltf.animations,
        scale: spec.withers / withersHeight(root),
        resting: RESTING.map(n => findClip(gltf.animations, n)).filter(Boolean),
        walk: findClip(gltf.animations, 'Walk'),
      };
    } catch (e) {
      console.warn('[zoo] animal model unavailable:', spec.file, e);
    }
  }
  return out;
}

/**
 * One animal, standing where it is put and playing a resting clip.
 * `rng` keeps a herd reproducible between reloads.
 */
export function placeAnimal(species, { x, y = 0, z, ry = 0, rng = Math.random, size = 1 }) {
  if (!species) return null;
  const group = cloneSkinned(species.root);
  group.position.set(x, y, z);
  group.rotation.y = ry;
  // Individuals differ; a herd of identical animals reads as a decal.
  group.scale.setScalar(species.scale * size * (0.92 + rng() * 0.16));
  // The pack's models carry no textures, so without this every deer in the
  // paddock is the same flat brown down to the last channel. Each one gets its
  // own copies of the materials, tinted a few per cent warm or cool and taken
  // fully matte — fur has no highlight on it, and the pack's default gives one.
  const tint = new THREE.Color(
    1 + (rng() - 0.5) * 0.16, 1 + (rng() - 0.5) * 0.1, 1 + (rng() - 0.5) * 0.12);
  group.traverse(o => {
    if (!o.isMesh && !o.isSkinnedMesh) return;
    const list = Array.isArray(o.material) ? o.material : [o.material];
    const made = list.map(m => {
      if (!m) return m;
      const c = m.clone();
      c.color?.multiply(tint);
      if (c.roughness !== undefined) c.roughness = Math.max(c.roughness, 0.88);
      if (c.metalness !== undefined) c.metalness = Math.min(c.metalness, 0.02);
      return c;
    });
    o.material = Array.isArray(o.material) ? made : made[0];
    o.castShadow = true;
    o.receiveShadow = true;
    o.frustumCulled = false;
  });

  const mixer = new THREE.AnimationMixer(group);
  const pool = species.resting.length ? species.resting : species.clips.slice(0, 1);
  const clip = pool[Math.floor(rng() * pool.length)];
  if (clip) {
    const action = mixer.clipAction(clip);
    action.timeScale = 0.8 + rng() * 0.4;
    action.time = rng() * clip.duration;   // nothing in a paddock is in step
    action.play();
  }
  return { group, mixer };
}
