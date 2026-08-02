// player.js — character visual layer: Survivors skin + animation state mapping
// driven by the Controller, plus the bezier web rope. All physics lives in
// controller.js (adapted from the web-slinger reference).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { buildBareLegs, buildSleeves } from './limbs.js?v=7';

const dracoLoader = new DRACOLoader().setDecoderPath('./vendor/draco/');

// Keep only rotation tracks (+ pelvis position): scale tracks and the other
// constant rest-offset position tracks fight the rig.
function cleanClip(clip) {
  clip.tracks = clip.tracks.filter(tr => {
    const dot = tr.name.lastIndexOf('.');
    const bone = tr.name.slice(0, dot), prop = tr.name.slice(dot + 1);
    if (prop === 'scale') return false;
    if (prop === 'position' && bone !== 'pelvis') return false;
    return true;
  });
  return clip;
}

const TRAVERSAL_CLIPS = {
  idle: 'Movement_Idle',
  walk: 'Movement_Walk_Forward',
  run: 'Movement_Run_Forward',
  jumpRun: 'Movement_Jump_fromRun_toRun',
  jumpLoop: 'Movement_Jump_InPlace_Loop',
  landSoft: 'Movement_Jump_InPlace_Landing',
  landRoll: 'Movement_Landing_Roll_toRun',
  fall: 'BarSwing_ForwardAcross_SwingJump_FallingLoop',
  swing: 'BarSwing_ForwardAcross_SwingLoop',
  swingJump: 'BarSwing_ForwardAcross_SwingJump',
};
const STRIP_PELVIS_POS = new Set(['swing', 'fall', 'jumpLoop', 'landRoll']);

const CLOTHING_PARTS = {
  hat: 'hat',
  backpack: 'backpack',
  tshirt: 'tshirt',
  pants: 'pants',
  shoes: 'shoes',
};

function clothingPart(materialName = '') {
  const name = materialName.toLowerCase();
  return Object.keys(CLOTHING_PARTS).find(part => name.includes(part)) || null;
}

// Clips a geometry to the half-space y >= minY, splitting the triangles that
// straddle the plane. Keeping or dropping whole triangles on a centroid test is
// much simpler but leaves the cut in saw teeth, which on the shorts reads as a
// torn hem rather than a sewn one.
function croppedGeometry(geometry, minY) {
  const attributes = Object.entries(geometry.attributes);
  const position = geometry.attributes.position;
  const skinIndex = geometry.attributes.skinIndex;
  const skinWeight = geometry.attributes.skinWeight;
  const source = geometry.index
    ? Array.from(geometry.index.array)
    : Array.from({ length: position.count }, (_, i) => i);

  const out = Object.fromEntries(attributes.map(([name]) => [name, []]));
  const emitted = new Map();
  const triangles = [];
  let count = 0;

  const emit = vertex => {
    const key = `o${vertex}`;
    if (emitted.has(key)) return emitted.get(key);
    for (const [name, attribute] of attributes) {
      for (let c = 0; c < attribute.itemSize; c++) {
        out[name].push(attribute.getComponent(vertex, c));
      }
    }
    emitted.set(key, count);
    return count++;
  };

  const emitCut = (a, b) => {
    const key = a < b ? `c${a},${b}` : `c${b},${a}`;
    if (emitted.has(key)) return emitted.get(key);
    const t = (minY - position.getY(a)) / (position.getY(b) - position.getY(a));
    for (const [name, attribute] of attributes) {
      if (attribute === skinIndex || attribute === skinWeight) continue;
      for (let c = 0; c < attribute.itemSize; c++) {
        const va = attribute.getComponent(a, c), vb = attribute.getComponent(b, c);
        out[name].push(va + (vb - va) * t);
      }
    }
    // Bone ids are labels, not quantities: merge the two influence sets by
    // weight and keep the four strongest rather than averaging the indices.
    if (skinIndex) {
      const blend = new Map();
      for (const [vertex, share] of [[a, 1 - t], [b, t]]) {
        for (let c = 0; c < 4; c++) {
          const weight = skinWeight.getComponent(vertex, c) * share;
          if (weight <= 0) continue;
          const bone = skinIndex.getComponent(vertex, c);
          blend.set(bone, (blend.get(bone) ?? 0) + weight);
        }
      }
      const top = [...blend].sort((p, q) => q[1] - p[1]).slice(0, 4);
      const total = top.reduce((sum, [, w]) => sum + w, 0) || 1;
      for (let c = 0; c < 4; c++) {
        out.skinIndex.push(top[c] ? top[c][0] : 0);
        out.skinWeight.push(top[c] ? top[c][1] / total : 0);
      }
    }
    emitted.set(key, count);
    return count++;
  };

  for (let i = 0; i < source.length; i += 3) {
    const v = [source[i], source[i + 1], source[i + 2]];
    const inside = v.map(k => position.getY(k) >= minY);
    const kept = inside.filter(Boolean).length;
    if (kept === 0) continue;
    if (kept === 3) { triangles.push(...v.map(emit)); continue; }
    // Sutherland-Hodgman against the single plane: a triangle or a quad out.
    const poly = [];
    for (let e = 0; e < 3; e++) {
      const next = (e + 1) % 3;
      if (inside[e]) poly.push(emit(v[e]));
      if (inside[e] !== inside[next]) poly.push(emitCut(v[e], v[next]));
    }
    for (let f = 2; f < poly.length; f++) triangles.push(poly[0], poly[f - 1], poly[f]);
  }

  const cropped = new THREE.BufferGeometry();
  for (const [name, attribute] of attributes) {
    const Attribute = attribute === skinIndex
      ? THREE.Uint16BufferAttribute : THREE.Float32BufferAttribute;
    cropped.setAttribute(name, new Attribute(out[name], attribute.itemSize));
  }
  cropped.setIndex(triangles);
  cropped.computeBoundingSphere();
  return cropped;
}

export class Player {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.mixer = null;
    this.actions = {};
    this.cur = null;
    this.yaw = Math.PI;
    this.bones = {};
    this.landTimer = 0;
    this.clothing = Object.fromEntries(
      Object.values(CLOTHING_PARTS).map(part => [part, { materials: [], mesh: null }])
    );
    this.wardrobe = null;
    this.outfitKey = '';

    // web rope: 6-segment cylinder chain (bezier with slack sag)
    this.webGroup = new THREE.Group();
    this.webGroup.visible = false;
    scene.add(this.webGroup);
    this.webMat = new THREE.MeshStandardMaterial({
      color: 0xeaeae6, roughness: 0.5, metalness: 0,
      emissive: 0x555552, emissiveIntensity: 0.5,
    });
    this.webSegs = [];
    for (let i = 0; i < 6; i++) {
      const seg = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 1, 5), this.webMat);
      this.webGroup.add(seg);
      this.webSegs.push(seg);
    }
  }

  async load(gender, matFactory, manager) {
    const loader = new GLTFLoader(manager || undefined).setDRACOLoader(dracoLoader);
    const gltf = await loader.loadAsync(`./chars/glb/${gender}.glb`);
    this.model = gltf.scene;
    this.model.traverse(o => {
      if (o.isMesh || o.isSkinnedMesh) {
        const sourceMaterials = Array.isArray(o.material) ? o.material : [o.material];
        const materials = sourceMaterials.map(material => matFactory(material?.name));
        o.material = Array.isArray(o.material) ? materials : materials[0];
        sourceMaterials.forEach((material, index) => {
          const part = clothingPart(material?.name);
          if (part) {
            this.clothing[part].materials.push(materials[index]);
            if (o.isSkinnedMesh && !this.clothing[part].mesh) this.clothing[part].mesh = o;
          }
          if (material?.name?.toLowerCase().includes('body')) {
            if (!this.bodyMaterial) this.bodyMaterial = materials[index];
            // The bare-arm skin, kept apart so long sleeves can retire it: it
            // is weighted to the twist bones the sleeve ignores, so left on it
            // punches through the cloth as the elbow rotates. Everything of it
            // that is not sleeve-covered is under the t-shirt anyway.
            const skeleton = o.isSkinnedMesh ? o.skeleton.bones.map(b => b.name) : [];
            if (skeleton.includes('upperarm_l') && skeleton.includes('hand_l')) this.armsMesh = o;
          }
        });
        o.frustumCulled = false;
      }
      if (o.isBone) this.bones[o.name] = o;
    });
    this.group.add(this.model);
    this.createWardrobeAlternates();
    this.setOutfit();
    this.mixer = new THREE.AnimationMixer(this.model);

    const clips = {};
    for (const [key, file] of Object.entries(TRAVERSAL_CLIPS)) {
      const g = await loader.loadAsync(`./chars/anims/${file}.glb`);
      const clip = g.animations[0];
      if (!clip) { console.warn('no anim in', file); continue; }
      cleanClip(clip);
      if (STRIP_PELVIS_POS.has(key))
        clip.tracks = clip.tracks.filter(t => t.name !== 'pelvis.position');
      clips[key] = clip;
    }
    // sprint = the run clip at a higher tempo. The pack has no UE4-native
    // sprint; the MovementAnimsetPro one is on a Mixamo rig whose joint
    // frames don't match this skeleton — a name-only track remap tilts and
    // deforms the body (true retargeting needs bind-pose deltas).
    if (clips.run) {
      const c = clips.run.clone();
      c.name = 'SprintFromRun';
      clips.sprint = c;
    }
    for (const [key, clip] of Object.entries(clips)) {
      const a = this.mixer.clipAction(clip);
      a.clampWhenFinished = true;
      if (key === 'sprint') a.timeScale = 1.3;   // 11 m/s stride cadence -> ~14 m/s
      this.actions[key] = a;
    }
    this.play('idle', 0);
  }

  createSkinnedClone(source, geometry, material, name) {
    if (!source) return null;
    const clone = new THREE.SkinnedMesh(geometry, material);
    clone.name = name;
    clone.position.copy(source.position);
    clone.quaternion.copy(source.quaternion);
    clone.scale.copy(source.scale);
    clone.bindMode = source.bindMode;
    clone.bind(source.skeleton, source.bindMatrix);
    clone.bindMatrixInverse.copy(source.bindMatrixInverse);
    clone.castShadow = source.castShadow;
    clone.receiveShadow = source.receiveShadow;
    clone.frustumCulled = false;
    clone.visible = false;
    source.parent.add(clone);
    return clone;
  }

  createWardrobeAlternates() {
    const tshirtMaterial = new THREE.MeshStandardMaterial({
      color: 0xfdfdf7,
      roughness: 0.82,
      metalness: 0.02,
    });
    // Skin tone sampled off the pack's own body albedo, so the bare legs read
    // as the same person as the bare arms.
    const skinMaterial = new THREE.MeshStandardMaterial({
      color: 0xd3a189,
      roughness: 0.66,
      metalness: 0,
    });
    // Double-sided: the shorts are an open-hemmed crop, and you can see up
    // inside them from below once the legs no longer plug the hole.
    const swimMaterial = new THREE.MeshStandardMaterial({
      color: 0x168fb0,
      roughness: 0.76,
      metalness: 0.01,
      side: THREE.DoubleSide,
    });

    const sleeves = buildSleeves(this.model, tshirtMaterial);
    const swimLegs = buildBareLegs(this.model, skinMaterial);

    const pants = this.clothing.pants.mesh;
    const swimShorts = pants
      ? this.createSkinnedClone(
        pants,
        croppedGeometry(pants.geometry, 0.68),
        swimMaterial,
        'Wardrobe_SwimShorts'
      )
      : null;
    // No inflation here: the 1.2% the shorts used to be scaled by existed only
    // to break the z-fight with the recoloured trousers that stood in for legs.
    // The lofted legs are well inside the trouser silhouette, and the scale was
    // riding the hem a centimetre up the thigh.

    this.wardrobe = { sleeves, swimLegs, swimShorts };
  }

  setPartVisible(part, visible) {
    for (const material of this.clothing[part]?.materials ?? []) material.visible = visible;
  }

  setOutfit(options = {}) {
    const outfit = {
      hat: options.hat !== false,
      backpack: options.backpack !== false,
      tshirt: options.tshirt !== false,
      pants: options.pants !== false,
      shoes: options.shoes !== false,
      longSleeves: options.longSleeves === true,
      swim: options.swim === true,
    };
    const key = JSON.stringify(outfit);
    if (key === this.outfitKey || !this.wardrobe) return;
    this.outfitKey = key;

    this.setPartVisible('hat', outfit.hat);
    this.setPartVisible('backpack', outfit.backpack);
    this.setPartVisible('tshirt', outfit.tshirt);
    this.setPartVisible('pants', outfit.pants && !outfit.swim);
    this.setPartVisible('shoes', outfit.shoes && !outfit.swim);
    if (this.wardrobe.sleeves) this.wardrobe.sleeves.visible = outfit.longSleeves;
    if (this.armsMesh) this.armsMesh.visible = !outfit.longSleeves;
    if (this.wardrobe.swimLegs) this.wardrobe.swimLegs.visible = outfit.swim;
    if (this.wardrobe.swimShorts) this.wardrobe.swimShorts.visible = outfit.swim;
  }

  play(key, fade = 0.25, loop = true) {
    const a = this.actions[key];
    if (!a || this.cur === a) return;
    a.reset();
    a.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
    if (this.cur && fade > 0) this.cur.crossFadeTo(a, fade, false);
    a.play();
    this.cur = a;
  }

  onLand(impact) {
    if (impact > 15) {
      this.play('landRoll', 0.08, false);
      this.landTimer = 1.15;
    } else if (impact > 5) {
      this.play('landSoft', 0.1, false);
      this.landTimer = 0.45;
    }
  }

  // ---------- visual update driven by controller ----------
  update(ctx) {
    const { dt, mode, pos, vel } = ctx;
    this.group.position.copy(pos);

    // facing: along horizontal velocity (smoothed)
    const hsp = Math.hypot(vel.x, vel.z);
    if (hsp > 1.2) {
      const target = Math.atan2(vel.x, vel.z);
      let d = (target - this.yaw) % (Math.PI * 2);
      if (d > Math.PI) d -= Math.PI * 2;
      if (d < -Math.PI) d += Math.PI * 2;
      this.yaw += d * Math.min(1, dt * 10);
    }
    this.group.rotation.y = this.yaw;

    // animation mapping
    if (this.landTimer > 0) {
      this.landTimer -= dt;
    } else if (mode === 'ground') {
      this.play(hsp < 0.6 ? 'idle' : hsp < 6 ? 'walk' : hsp < 11 ? 'run' : 'sprint');
    } else if (mode === 'air') {
      this.play(vel.y > 1.5 ? 'jumpLoop' : 'fall', 0.3);
    } else if (mode === 'swing') {
      this.play('swing', 0.2);
    } else {
      this.play('fall', 0.3);   // wallrun / zip
    }
    this.mixer.update(dt);

    // web rope
    this.updateWeb(ctx);
  }

  updateWeb(ctx) {
    this.webGroup.visible = !!ctx.webOn;
    if (!ctx.webOn) return;
    const handName = ctx.webHand === 'L' ? 'hand_l' : 'hand_r';
    const hand = this.bones[handName] || this.model;
    const from = new THREE.Vector3();
    hand.getWorldPosition(from);
    const to = ctx.anchor;
    const slack = ctx.ropeSlack ?? 0;
    const mid = new THREE.Vector3().addVectors(from, to).multiplyScalar(0.5);
    mid.y -= 0.6 + slack * 14;              // catenary-ish sag
    // quadratic bezier through 7 points
    const pts = [];
    for (let i = 0; i <= 6; i++) {
      const t = i / 6, u = 1 - t;
      pts.push(new THREE.Vector3(
        u * u * from.x + 2 * u * t * mid.x + t * t * to.x,
        u * u * from.y + 2 * u * t * mid.y + t * t * to.y,
        u * u * from.z + 2 * u * t * mid.z + t * t * to.z));
    }
    const up = new THREE.Vector3(0, 1, 0);
    for (let i = 0; i < 6; i++) {
      const a = pts[i], b = pts[i + 1];
      const dir = new THREE.Vector3().subVectors(b, a);
      const len = Math.max(dir.length(), 1e-4);
      const seg = this.webSegs[i];
      seg.position.copy(a).addScaledVector(dir, 0.5);
      seg.quaternion.setFromUnitVectors(up, dir.multiplyScalar(1 / len));
      seg.scale.set(1, len, 1);
      seg.visible = true;
    }
  }
}
