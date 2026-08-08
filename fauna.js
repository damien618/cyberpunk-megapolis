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
import { cloneSkinned } from './crowd.js?v=4';

const dracoLoader = new DRACOLoader().setDecoderPath('./vendor/draco/');

// `withers` is the shoulder height the model is scaled to, in metres, which is
// the measurement every field guide quotes and the only one that reads at
// exhibit range: get it wrong and a fox is a wolf.
export const SPECIES = {
  deer: { file: 'deer.glb', withers: 1.22 },
  alpaca: { file: 'alpaca.glb', withers: 1.00 },
  fox: { file: 'fox.glb', withers: 0.40 },
  shiba: { file: 'shiba.glb', withers: 0.40 },
  wolf: { file: 'wolf.glb', withers: 0.80 },
};

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
      // Scale from the model's own height rather than a guessed constant: the
      // pack is authored around 1 unit and the species differ.
      const box = new THREE.Box3().setFromObject(root);
      const height = Math.max(box.max.y - box.min.y, 1e-4);
      out[name] = {
        root,
        clips: gltf.animations,
        scale: spec.withers / height,
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
  group.traverse(o => {
    if (!o.isMesh && !o.isSkinnedMesh) return;
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
