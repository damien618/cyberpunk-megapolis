// player.js — character visual layer: Survivors skin + animation state mapping
// driven by the Controller, plus the bezier web rope. All physics lives in
// controller.js (adapted from the web-slinger reference).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { buildBareLegs, buildSleeves, buildNightSkirt } from './limbs.js?v=28';

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

// Supine pose. The whole leg chain is reset, twist bones included, or the clip
// keeps shearing the knee it thinks is still bearing weight.
const LYING_LEG_JOINTS = ['thigh', 'thigh_twist_01', 'calf', 'calf_twist_01', 'foot', 'ball'];
// The trunk is reset too. A standing idle keeps the pelvis rotating and sliding
// under a swaying spine, which on a supine body twists the hips out of line —
// the two sockets end up several centimetres apart front-to-back, and no amount
// of hip levelling can straighten legs hanging off a crooked pelvis.
const LYING_TRUNK_JOINTS = ['pelvis', 'spine_01', 'spine_02', 'spine_03'];
const LYING_HEAD_JOINTS = ['neck_01', 'head'];
const LYING_ARM_RE =
  /^(clavicle|upperarm(?:_twist_\d+)?|lowerarm(?:_twist_\d+)?|hand|thumb_\d+|index_\d+|middle_\d+|ring_\d+|pinky_\d+)_[lr]$/;
const LYING_HAND_TARGETS = {
  l: new THREE.Vector3(0.025, 1.22, 0.14),
  r: new THREE.Vector3(-0.035, 1.14, 0.15),
};
const EYE_BLINK_TARGET = 26;
// Three small offsets off the rest pose then take the legs off attention and
// into how a body actually settles on its back: ankles relaxed into plantar
// flexion, heels a little apart, and the legs rolled out so the toes fall
// outward. Axes measured against this rig — on the thigh, Y abducts, X rolls
// along the leg and Z is hip flexion.
const LYING_ANKLE_DROP = THREE.MathUtils.degToRad(-22);
const LYING_HIP_SPREAD = THREE.MathUtils.degToRad(5);
const LYING_LEG_ROLL = THREE.MathUtils.degToRad(13);
const HIP_LEVEL_PROBE = 0.2;   // test swing used to calibrate the hip levelling

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
    this.poseRoot = new THREE.Group();
    this.group.add(this.poseRoot);
    this.mixer = null;
    this.actions = {};
    this.cur = null;
    this.yaw = Math.PI;
    this.bones = {};
    this.faceMeshes = [];
    this.eyesClosed = null;
    this.lyingArmPose = null;
    this.landTimer = 0;
    this.clothing = Object.fromEntries(
      Object.values(CLOTHING_PARTS).map(part => [part, { materials: [], mesh: null }])
    );
    this.headMesh = null;
    this.hairMesh = null;
    this.hairMaterial = null;
    this.wardrobe = null;
    this.outfit = null;
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
        if (o.morphTargetInfluences?.length > EYE_BLINK_TARGET) this.faceMeshes.push(o);
        const sourceMaterials = Array.isArray(o.material) ? o.material : [o.material];
        const materials = sourceMaterials.map(material => matFactory(material?.name));
        o.material = Array.isArray(o.material) ? materials : materials[0];
        sourceMaterials.forEach((material, index) => {
          const part = clothingPart(material?.name);
          if (part) {
            this.clothing[part].materials.push(materials[index]);
            if (o.isSkinnedMesh && !this.clothing[part].mesh) this.clothing[part].mesh = o;
          }
          // Head and hair are kept by hand: hair.js rebuilds the hairstyle for
          // the hatless outfits and needs both meshes, and neither is a
          // clothing part that setPartVisible would ever hide.
          const name = material?.name?.toLowerCase() ?? '';
          if (o.isSkinnedMesh && name.includes('hair') && !this.hairMesh) {
            this.hairMesh = o;
            this.hairMaterial = materials[index];
          }
          if (o.isSkinnedMesh && name.includes('head') && !this.headMesh) this.headMesh = o;
          if (name.includes('body')) {
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
    this.poseRoot.add(this.model);
    // Rest pose, captured before a single clip has touched the rig. The lying
    // posture has to undo whatever the idle is doing to the legs, and a delta
    // applied on top of an animated bone would drift with it.
    this.restRotation = new Map(
      Object.entries(this.bones).map(([name, bone]) => [name, bone.quaternion.clone()])
    );
    this.lyingArmJoints = Object.keys(this.bones).filter(name => LYING_ARM_RE.test(name));
    this.restPelvis = this.bones.pelvis?.position.clone() ?? null;
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

    // Washed-silk dusty rose: the L.A. slip nightdress. Low roughness with a
    // trace of metalness is what reads as satin under the villa's warm bounce
    // without tipping over into metal. Champagne was the first choice and it
    // blew out to the same white as the bedding it is lying on.
    const silkMaterial = new THREE.MeshStandardMaterial({
      color: 0xc98d86,
      roughness: 0.44,
      metalness: 0.03,
      side: THREE.DoubleSide,
    });

    const sleeves = buildSleeves(this.model, tshirtMaterial);
    const swimLegs = buildBareLegs(this.model, skinMaterial);
    const nightSkirt = buildNightSkirt(this.model, silkMaterial);

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

    // Bodice of the nightdress: the t-shirt geometry again, in silk. Cheaper
    // and better-fitting than lofting a torso, and it covers the shoulders —
    // which matters, because the skin under the shirt does not exist.
    const tshirt = this.clothing.tshirt.mesh;
    const nightTop = tshirt
      ? this.createSkinnedClone(tshirt, tshirt.geometry, silkMaterial, 'Wardrobe_NightTop')
      : null;

    this.wardrobe = { sleeves, swimLegs, swimShorts, nightTop, nightSkirt, hairCrown: null };
  }

  /**
   * A wardrobe piece that could not be ready at load time. The hair crown is
   * cut out of the head albedo's own pixels, and a THREE.Texture hands those
   * over whenever the image behind it happens to decode — so it arrives late
   * and has to be given the outfit that is already on.
   */
  addWardrobePart(part, mesh) {
    if (!mesh || !this.wardrobe) return;
    this.wardrobe[part] = mesh;
    const outfit = this.outfit;
    this.outfitKey = '';
    if (outfit) this.setOutfit(outfit);
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
      night: options.night === true,
    };
    const key = JSON.stringify(outfit);
    if (key === this.outfitKey || !this.wardrobe) return;
    this.outfitKey = key;
    this.outfit = outfit;

    // The nightdress replaces the whole outfit: silk bodice, silk skirt, bare
    // legs and bare feet. Nobody sleeps in a backpack.
    const bare = outfit.swim || outfit.night;
    const hat = outfit.hat && !outfit.night;
    this.setPartVisible('hat', hat);
    this.setPartVisible('backpack', outfit.backpack && !outfit.night);
    this.setPartVisible('tshirt', outfit.tshirt && !outfit.night);
    this.setPartVisible('pants', outfit.pants && !bare);
    this.setPartVisible('shoes', outfit.shoes && !bare);
    if (this.wardrobe.sleeves) this.wardrobe.sleeves.visible = outfit.longSleeves && !outfit.night;
    if (this.armsMesh) this.armsMesh.visible = !outfit.longSleeves || outfit.night;
    if (this.wardrobe.swimLegs) this.wardrobe.swimLegs.visible = bare;
    if (this.wardrobe.swimShorts) this.wardrobe.swimShorts.visible = outfit.swim && !outfit.night;
    if (this.wardrobe.nightTop) this.wardrobe.nightTop.visible = outfit.night;
    if (this.wardrobe.nightSkirt) this.wardrobe.nightSkirt.visible = outfit.night;
    // Strictly the cap's understudy. The crown stands a centimetre off the
    // skull, which is inside Hat02 — worn together, it punches through the cap.
    if (this.wardrobe.hairCrown) this.wardrobe.hairCrown.visible = !hat;
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

  applySeatedPose() {
    this.poseRoot.position.y = -0.43;
    for (const side of ['l', 'r']) {
      this.bones[`thigh_${side}`]?.rotateZ(THREE.MathUtils.degToRad(80));
      this.bones[`calf_${side}`]?.rotateZ(THREE.MathUtils.degToRad(-80));
    }
  }

  setEyesClosed(closed) {
    if (this.eyesClosed === closed) return;
    const weight = closed ? 1 : 0;
    for (const mesh of this.faceMeshes) mesh.morphTargetInfluences[EYE_BLINK_TARGET] = weight;
    this.eyesClosed = closed;
  }

  setBoneWorldQuaternion(bone, worldQuaternion) {
    const parentWorld = new THREE.Quaternion();
    bone.parent.getWorldQuaternion(parentWorld);
    bone.quaternion.copy(parentWorld.invert().multiply(worldQuaternion));
  }

  solveRestingArm(side, targetLocal) {
    const upper = this.bones[`upperarm_${side}`];
    const lower = this.bones[`lowerarm_${side}`];
    const hand = this.bones[`hand_${side}`];
    if (!upper || !lower || !hand) return;

    const shoulder = new THREE.Vector3();
    const elbow = new THREE.Vector3();
    const wrist = new THREE.Vector3();
    upper.getWorldPosition(shoulder);
    lower.getWorldPosition(elbow);
    hand.getWorldPosition(wrist);

    const upperLength = shoulder.distanceTo(elbow);
    const lowerLength = elbow.distanceTo(wrist);
    const target = this.poseRoot.localToWorld(targetLocal.clone());
    const direction = target.clone().sub(shoulder);
    const distance = THREE.MathUtils.clamp(
      direction.length(),
      Math.abs(upperLength - lowerLength) + 1e-4,
      upperLength + lowerLength - 1e-4
    );
    direction.normalize();
    target.copy(shoulder).addScaledVector(direction, distance);

    const along = (upperLength ** 2 - lowerLength ** 2 + distance ** 2) / (2 * distance);
    const outward = Math.sqrt(Math.max(0, upperLength ** 2 - along ** 2));
    const pole = new THREE.Vector3(side === 'l' ? 1 : -1, 0, 0)
      .transformDirection(this.poseRoot.matrixWorld);
    pole.addScaledVector(direction, -pole.dot(direction)).normalize();
    const desiredElbow = shoulder.clone()
      .addScaledVector(direction, along)
      .addScaledVector(pole, outward);

    const upperWorld = new THREE.Quaternion();
    upper.getWorldQuaternion(upperWorld);
    const upperDelta = new THREE.Quaternion().setFromUnitVectors(
      elbow.clone().sub(shoulder).normalize(),
      desiredElbow.clone().sub(shoulder).normalize()
    );
    this.setBoneWorldQuaternion(upper, upperDelta.multiply(upperWorld));
    this.poseRoot.updateMatrixWorld(true);

    lower.getWorldPosition(elbow);
    hand.getWorldPosition(wrist);
    const lowerWorld = new THREE.Quaternion();
    lower.getWorldQuaternion(lowerWorld);
    const lowerDelta = new THREE.Quaternion().setFromUnitVectors(
      wrist.sub(elbow).normalize(),
      target.sub(elbow).normalize()
    );
    this.setBoneWorldQuaternion(lower, lowerDelta.multiply(lowerWorld));
    this.poseRoot.updateMatrixWorld(true);
  }

  applyLyingArmPose() {
    if (!this.lyingArmPose) {
      for (const joint of this.lyingArmJoints) {
        this.bones[joint].quaternion.copy(this.restRotation.get(joint));
      }
      this.poseRoot.updateMatrixWorld(true);
      for (const side of ['l', 'r']) this.solveRestingArm(side, LYING_HAND_TARGETS[side]);
      this.lyingArmPose = new Map(
        this.lyingArmJoints.map(joint => [joint, this.bones[joint].quaternion.clone()])
      );
    }
    for (const [joint, rotation] of this.lyingArmPose) {
      this.bones[joint].quaternion.copy(rotation);
    }
  }

  // Lying tips the avatar a quarter turn about X, which maps its local +Z (the
  // back-to-front axis) onto world +Y — so the body hangs BELOW the pose root
  // by however far its back reaches, and parking the root on the mattress
  // buries it.
  //
  // Measured off the torso and the legs in the BIND pose, which is what
  // actually comes to rest on a mattress. The whole silhouette is the wrong
  // reference: the backpack juts 43 cm out behind, and setOutfit retires it by
  // hiding its materials while the mesh stays `visible`, so it would float the
  // avatar a foot and a half over the bed. The posed skin is the wrong moment:
  // the first lie-down happens straight out of a walk cycle, with one leg
  // still swung back.
  backReach() {
    if (this._backReach === undefined) {
      const v = new THREE.Vector3();
      let min = 0;
      this.poseRoot.updateMatrixWorld(true);
      for (const part of ['tshirt', 'pants']) {
        const mesh = this.clothing[part]?.mesh;
        if (!mesh) continue;
        const position = mesh.geometry.attributes.position;
        for (let i = 0; i < position.count; i++) {
          v.fromBufferAttribute(position, i);
          mesh.localToWorld(v);
          this.poseRoot.worldToLocal(v);
          if (v.z < min) min = v.z;
        }
      }
      this._backReach = -min;
    }
    return this._backReach;
  }

  // Per-side hip swing that brings each leg into the body's own plane, i.e.
  // straight down. The pack is not bound in a symmetric A-pose — it is bound
  // mid-stance, with the left leg a good 8 cm ahead of the right — so simply
  // restoring the rest pose still leaves one leg hanging over the mattress.
  //
  // Calibrated rather than tabulated: swing the thigh by a known test angle,
  // watch how far the toe travels front-to-back, and solve for the angle that
  // zeroes it. Survives a re-rig, and costs one measurement per session.
  hipLevelling() {
    if (!this._hipLevel) {
      this._hipLevel = {};
      const hip = new THREE.Vector3(), ankle = new THREE.Vector3();
      for (const side of ['l', 'r']) {
        const thigh = this.bones[`thigh_${side}`], foot = this.bones[`foot_${side}`];
        this._hipLevel[side] = 0;
        if (!thigh || !foot) continue;
        const rest = thigh.quaternion.clone();
        // Front-to-back reach of hip to ANKLE, in the avatar's own frame: the
        // pose root's local +Z is the direction the body faces. Measured to the
        // ankle and not the toe — the ball of the foot sits a hand's length
        // ahead of the shin by construction, and levelling on it swings the
        // whole leg backwards to compensate.
        const reach = () => {
          this.poseRoot.updateMatrixWorld(true);
          hip.setFromMatrixPosition(thigh.matrixWorld);
          ankle.setFromMatrixPosition(foot.matrixWorld);
          this.poseRoot.worldToLocal(hip);
          this.poseRoot.worldToLocal(ankle);
          return ankle.z - hip.z;
        };
        const before = reach();
        thigh.rotateZ(HIP_LEVEL_PROBE);
        const after = reach();
        thigh.quaternion.copy(rest);
        if (after !== before) this._hipLevel[side] = -HIP_LEVEL_PROBE * before / (after - before);
      }
      this.poseRoot.updateMatrixWorld(true);
    }
    return this._hipLevel;
  }

  applyLyingPose() {
    this.poseRoot.rotation.x = -Math.PI / 2;
    this.poseRoot.position.y = this.backReach();
    // The clip underneath is a STANDING idle: weight on one leg, the other knee
    // bent with its heel off the floor. Tipped onto its back that reads as a
    // foot hovering over the mattress, so the leg chain goes back to the rest
    // pose first, then gets levelled and relaxed.
    for (const joint of LYING_TRUNK_JOINTS) {
      const bone = this.bones[joint];
      const rest = this.restRotation?.get(joint);
      if (bone && rest) bone.quaternion.copy(rest);
    }
    for (const joint of LYING_HEAD_JOINTS) {
      const bone = this.bones[joint];
      const rest = this.restRotation?.get(joint);
      if (bone && rest) bone.quaternion.copy(rest);
    }
    if (this.restPelvis) this.bones.pelvis.position.copy(this.restPelvis);
    for (const side of ['l', 'r']) {
      for (const joint of LYING_LEG_JOINTS) {
        const bone = this.bones[`${joint}_${side}`];
        const rest = this.restRotation?.get(`${joint}_${side}`);
        if (bone && rest) bone.quaternion.copy(rest);
      }
    }
    const level = this.hipLevelling();
    for (const side of ['l', 'r']) {
      const mirror = side === 'l' ? 1 : -1;
      const thigh = this.bones[`thigh_${side}`];
      thigh?.rotateZ(level[side]);
      thigh?.rotateY(-LYING_HIP_SPREAD * mirror);
      thigh?.rotateX(LYING_LEG_ROLL * mirror);
      this.bones[`foot_${side}`]?.rotateZ(LYING_ANKLE_DROP);
    }
    this.applyLyingArmPose();
  }

  // ---------- visual update driven by controller ----------
  update(ctx) {
    const { dt, mode, pos, vel, posture, facingYaw } = ctx;
    this.group.position.copy(pos);
    this.poseRoot.position.set(0, 0, 0);
    this.poseRoot.rotation.set(0, 0, 0);

    // facing: along horizontal velocity (smoothed)
    const hsp = Math.hypot(vel.x, vel.z);
    if (Number.isFinite(facingYaw)) {
      this.yaw = facingYaw;
    } else if (hsp > 1.2) {
      const target = Math.atan2(vel.x, vel.z);
      let d = (target - this.yaw) % (Math.PI * 2);
      if (d > Math.PI) d -= Math.PI * 2;
      if (d < -Math.PI) d += Math.PI * 2;
      this.yaw += d * Math.min(1, dt * 10);
    }
    this.group.rotation.y = this.yaw;

    // animation mapping
    if (posture === 'sit' || posture === 'lie') {
      this.landTimer = 0;
      this.play('idle', 0.2);
    } else if (this.landTimer > 0) {
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
    this.setEyesClosed(posture === 'lie');
    if (posture === 'sit') {
      this.applySeatedPose();
    } else if (posture === 'lie') {
      this.applyLyingPose();
    }

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
