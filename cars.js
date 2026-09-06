// cars.js — road cars for the villa, beach, airport and zoo maps.
//
// The bodies come from the CC0 low-poly car pack by Quaternius (see
// glb/cars/CREDITS.md). They replace a procedural loft: a dozen superellipse
// cross-sections per car, which produced bulbous 50s silhouettes with a fifth
// of every tyre buried in the sheet metal and no greenhouse you could read.
// Pushing those tables into looking like a modern car is a losing game — a
// modelled body gets there in one step, for 3 000 triangles.
//
// The pack ships flat-shaded meshes with named material slots and separate
// wheel nodes, so everything the game needs is layered on at load: per-car
// paint, tinted glass, emissive optics that switch to night, and wheels
// re-pivoted onto their own axles so they can actually turn.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// ---------------------------------------------------------------------------
// Shared materials (paint is per-car, everything else is shared)
// ---------------------------------------------------------------------------
// Metallic-flake roughness: three multiplies material.roughness by this, so the
// low-contrast noise breaks up the clearcoat highlight instead of dulling it.
const flakeMap = (() => {
  const c = Object.assign(document.createElement('canvas'), { width: 96, height: 96 });
  const g = c.getContext('2d');
  g.fillStyle = '#b4b4b4';
  g.fillRect(0, 0, 96, 96);
  for (let i = 0; i < 2600; i++) {
    g.fillStyle = `rgba(255,255,255,${0.05 + Math.random() * 0.12})`;
    g.fillRect(Math.random() * 96, Math.random() * 96, 1, 1);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(5, 5);
  return t;
})();

const MAT = {
  // Tinted US privacy glass: dense enough to read as a surface from outside,
  // open enough that the cabin still shows through.
  glass: new THREE.MeshPhysicalMaterial({
    color: 0x2c3640, roughness: 0.06, metalness: 0.15,
    transparent: true, opacity: 0.9, clearcoat: 1, clearcoatRoughness: 0.04,
    envMapIntensity: 0.55,
  }),
  tyre: new THREE.MeshStandardMaterial({ color: 0x14161a, roughness: 0.92, metalness: 0.0 }),
  // The pack shares one "Grey" slot between the alloy faces and the bumper
  // inserts and plates, so this has to read as both: satin, not a mirror.
  alloy: new THREE.MeshStandardMaterial({ color: 0xc3c8ce, roughness: 0.46, metalness: 0.55 }),
  // Daylight scene: the lens is mostly a dark reflective optic and only the
  // filament reads as lit. Pushing it harder just clips under ACES.
  headlight: new THREE.MeshPhysicalMaterial({
    color: 0xd7e2ee, roughness: 0.08, metalness: 0.3,
    clearcoat: 1, clearcoatRoughness: 0.03, emissive: 0x2b3a4a, emissiveIntensity: 0.5,
  }),
  taillight: new THREE.MeshStandardMaterial({
    color: 0x6a1010, emissive: 0xb81810, emissiveIntensity: 0.85, roughness: 0.28,
  }),
};

function paintMaterial(color, { metallic = true, pearl = false } = {}) {
  return new THREE.MeshPhysicalMaterial({
    color,
    roughnessMap: flakeMap,
    roughness: pearl ? 0.26 : metallic ? 0.36 : 0.44,
    metalness: pearl ? 0.22 : metallic ? 0.55 : 0.08,
    clearcoat: 1.0,
    clearcoatRoughness: pearl ? 0.028 : 0.045,
    envMapIntensity: pearl ? 1.5 : 1.25,
  });
}

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------
// The pack models face +Z and are drawn wider than a real car for the stylised
// look. `squash` narrows them back towards production proportions; `scale`
// brings them up from ~4 m to the real thing.
const TYPES = {
  coupe: { file: 'coupe.glb', scale: 1.16, squash: 0.90 },
  sedan: { file: 'sedan.glb', scale: 1.17, squash: 0.90 },
  suv: { file: 'suv.glb', scale: 1.10, squash: 0.88 },
};

// Material slots in the pack, by name. Anything not listed here is bodywork and
// takes the car's own paint.
const SLOTS = {
  Windows: 'glass',
  Headlights: 'headlight',
  WhiteLights: 'headlight',
  TailLights: 'taillight',
  Black: 'tyre',
  Grey: 'alloy',
};

const loader = new GLTFLoader();
const TEMPLATES = {};

for (const [type, cfg] of Object.entries(TYPES)) {
  // Resolved against this module, not the document: the maps live at the root
  // but tooling pages elsewhere in the tree import cars.js too.
  const gltf = await loader.loadAsync(new URL(`./glb/cars/${cfg.file}`, import.meta.url).href);
  const model = gltf.scene;

  let wheelRadius = 0;
  model.traverse(o => {
    if (!o.isMesh) return;
    o.castShadow = true;
    o.receiveShadow = true;
    const slot = SLOTS[o.material?.name];
    if (slot) o.material = MAT[slot];
    else o.userData.body = true;

    // Wheels arrive with their pivot at the model origin, so spinning a node
    // as-is swings the wheel around the middle of the car. Move the geometry
    // onto its own centre and put that centre back on the node.
    if (/Wheel/i.test(o.name)) {
      o.geometry.computeBoundingBox();
      const box = o.geometry.boundingBox;
      const c = box.getCenter(new THREE.Vector3());
      o.geometry.translate(-c.x, -c.y, -c.z);
      o.position.add(c);
      o.userData.wheel = true;
      wheelRadius = Math.max(wheelRadius, (box.getSize(new THREE.Vector3()).y / 2) * cfg.scale);
    }
  });

  // +X forward for the game, sitting on the road surface.
  const pivot = new THREE.Group();
  pivot.rotation.y = Math.PI / 2;
  pivot.scale.set(cfg.scale * cfg.squash, cfg.scale, cfg.scale);
  pivot.add(model);
  const box = new THREE.Box3().setFromObject(pivot);
  pivot.position.y = -box.min.y;
  const size = box.getSize(new THREE.Vector3());

  TEMPLATES[type] = {
    pivot,
    wheelRadius: wheelRadius || 0.34,
    bounds: { length: size.x, width: size.z, height: size.y },
  };
}

/**
 * Build a car. `type` is 'coupe' | 'sedan' | 'suv'. The group's origin sits on
 * the road surface with +X forward, and its `wheels` roll via `rollCars`.
 */
export function buildCar(type = 'coupe', color = 0x1d222a, { metallic = true, pearl = false } = {}) {
  const tpl = TEMPLATES[type];
  if (!tpl) throw new Error(`unknown car type: ${type}`);
  const car = new THREE.Group();
  const body = tpl.pivot.clone(true);
  car.add(body);

  // clone() shares materials, so the paint has to be re-assigned per car.
  const paint = paintMaterial(color, { metallic, pearl });
  const wheels = [];
  body.traverse(o => {
    if (!o.isMesh) return;
    if (o.userData.body) o.material = paint;
    if (o.userData.wheel) wheels.push(o);
  });

  car.wheels = wheels;
  car.wheelRadius = tpl.wheelRadius;
  return car;
}

/** Overall size in metres — the maps use it to size the collision proxy. */
export function carBounds(type) {
  const tpl = TEMPLATES[type];
  if (!tpl) throw new Error(`unknown car type: ${type}`);
  return { ...tpl.bounds };
}

/** Roll every wheel by the distance its car travelled this frame. */
export function rollCars(cars, dt) {
  for (const c of cars) {
    const d = (c.speed * dt) / c.mesh.wheelRadius;
    // The pack's wheels spin about the model's own X, and the +X-forward turn
    // lives on the parent pivot, so this stays the wheel's local axis.
    for (const w of c.mesh.wheels) w.rotation.x -= d;
  }
}

/**
 * Night mode (villa map): make the optics actually shine — headlamps warm and
 * bright, taillights hot red. Materials are shared across all cars, so one call
 * covers the fleet. The villa may restore the daylight values after a sleep
 * interaction through setCarLightsDay().
 */
export function setCarLightsNight() {
  MAT.headlight.emissive.set(0xffe9c4);
  MAT.headlight.emissiveIntensity = 2.6;
  MAT.taillight.emissive.set(0xff2015);
  MAT.taillight.emissiveIntensity = 3.0;
}

/** Restore the shared optics used by the daylight scene. */
export function setCarLightsDay() {
  MAT.headlight.emissive.set(0x2b3a4a);
  MAT.headlight.emissiveIntensity = 0.5;
  MAT.taillight.emissive.set(0xb81810);
  MAT.taillight.emissiveIntensity = 0.85;
}
