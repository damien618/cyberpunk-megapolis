// player.js — character visual layer: Survivors skin + animation state mapping
// driven by the Controller, plus the bezier web rope. All physics lives in
// controller.js (adapted from the web-slinger reference).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

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

function croppedGeometry(geometry, minY) {
  const cropped = geometry.clone();
  const position = cropped.getAttribute('position');
  const source = cropped.index
    ? Array.from(cropped.index.array)
    : Array.from({ length: position.count }, (_, i) => i);
  const kept = [];

  for (let i = 0; i < source.length; i += 3) {
    const a = source[i], b = source[i + 1], c = source[i + 2];
    const centroidY = (position.getY(a) + position.getY(b) + position.getY(c)) / 3;
    if (centroidY >= minY) kept.push(a, b, c);
  }

  cropped.setIndex(kept);
  cropped.clearGroups();
  cropped.addGroup(0, kept.length, 0);
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
          if (material?.name?.toLowerCase().includes('body') && !this.bodyMaterial) {
            this.bodyMaterial = materials[index];
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

  createBoneCover(startName, endName, radiusStart, radiusEnd, material) {
    const start = this.bones[startName], end = this.bones[endName];
    if (!start || !end) return null;
    const direction = end.position.clone();
    const length = direction.length();
    const geometry = new THREE.CylinderGeometry(radiusEnd, radiusStart, length * 1.04, 12, 2);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.copy(direction).multiplyScalar(0.5);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
    mesh.castShadow = true;
    mesh.frustumCulled = false;
    mesh.visible = false;
    start.add(mesh);
    return mesh;
  }

  createBareFoot(footName, ballName, material) {
    const foot = this.bones[footName], ball = this.bones[ballName];
    if (!foot || !ball) return null;
    const direction = ball.position.clone();
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), material);
    mesh.position.copy(direction).multiplyScalar(0.72);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.clone().normalize());
    mesh.scale.set(0.058, direction.length() * 0.82, 0.052);
    mesh.castShadow = true;
    mesh.frustumCulled = false;
    mesh.visible = false;
    foot.add(mesh);
    return mesh;
  }

  createWardrobeAlternates() {
    const tshirtMaterial = new THREE.MeshStandardMaterial({
      color: 0xfdfdf7,
      roughness: 0.82,
      metalness: 0.02,
    });
    const skinMaterial = new THREE.MeshStandardMaterial({
      color: 0xd49375,
      roughness: 0.88,
      metalness: 0,
    });
    const swimMaterial = new THREE.MeshStandardMaterial({
      color: 0x168fb0,
      roughness: 0.76,
      metalness: 0.01,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });

    const sleeves = [
      this.createBoneCover('upperarm_l', 'lowerarm_l', 0.076, 0.064, tshirtMaterial),
      this.createBoneCover('lowerarm_l', 'hand_l', 0.066, 0.049, tshirtMaterial),
      this.createBoneCover('upperarm_r', 'lowerarm_r', 0.076, 0.064, tshirtMaterial),
      this.createBoneCover('lowerarm_r', 'hand_r', 0.066, 0.049, tshirtMaterial),
    ].filter(Boolean);

    const pants = this.clothing.pants.mesh;
    const swimLegs = pants
      ? this.createSkinnedClone(pants, pants.geometry.clone(), skinMaterial, 'Wardrobe_BareLegs')
      : null;
    const swimShorts = pants
      ? this.createSkinnedClone(
        pants,
        croppedGeometry(pants.geometry, 0.68),
        swimMaterial,
        'Wardrobe_SwimShorts'
      )
      : null;
    if (swimShorts) swimShorts.scale.multiplyScalar(1.012);

    const bareFeet = [
      this.createBareFoot('foot_l', 'ball_l', skinMaterial),
      this.createBareFoot('foot_r', 'ball_r', skinMaterial),
    ].filter(Boolean);

    this.wardrobe = { sleeves, swimLegs, swimShorts, bareFeet };
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
    for (const sleeve of this.wardrobe.sleeves) sleeve.visible = outfit.longSleeves;
    if (this.wardrobe.swimLegs) this.wardrobe.swimLegs.visible = outfit.swim;
    if (this.wardrobe.swimShorts) this.wardrobe.swimShorts.visible = outfit.swim;
    for (const foot of this.wardrobe.bareFeet) foot.visible = outfit.swim;
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
