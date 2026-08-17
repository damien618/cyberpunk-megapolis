// player.js — character visual layer: Survivors skin + animation state mapping
// driven by the Controller, plus the bezier web rope. All physics lives in
// controller.js (adapted from the web-slinger reference).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { buildBareLegs, buildFlipFlops, buildSleeves } from './limbs.js?v=38';
import { buildKimono } from './kimono.js?v=25';

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

// Held poses — supine and seated — build off the rest pose rather than off the
// clip underneath. The whole leg chain is reset, twist bones included, or the
// clip keeps shearing the knee it thinks is still bearing weight.
const POSE_LEG_JOINTS = ['thigh', 'thigh_twist_01', 'calf', 'calf_twist_01', 'foot', 'ball'];
// The trunk is reset too. A standing idle keeps the pelvis rotating and sliding
// under a swaying spine, which on a supine body twists the hips out of line —
// the two sockets end up several centimetres apart front-to-back, and no amount
// of hip levelling can straighten legs hanging off a crooked pelvis.
const POSE_TRUNK_JOINTS = ['pelvis', 'spine_01', 'spine_02', 'spine_03'];
const POSE_HEAD_JOINTS = ['neck_01', 'head'];
const ARM_JOINT_RE =
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
const LYING_ANKLE_DROP = THREE.MathUtils.degToRad(-38);
const LYING_HIP_SPREAD = THREE.MathUtils.degToRad(5);
const LYING_LEG_ROLL = THREE.MathUtils.degToRad(13);
const HIP_LEVEL_PROBE = 0.2;   // test swing used to calibrate the hip levelling
// Hip levelling lays each leg in the body's own plane, which puts the ankle at
// the same depth as the hip socket. That is still not the bed. backReach()
// rests the deepest point of the silhouette on the bedding, and on a body lying
// on its back that point is the buttocks — so everything shallower than the
// hips is left in the air, the calves by 5 cm and the heels by 8. That is the
// leg that reads as hovering over the mattress however well the back is placed.
// A real leg closes the gap by hanging: the hip is a ball joint, and the leg
// swings down off it until the heel finds the bed. Solved rather than tabulated,
// exactly like the levelling above — swing by a test angle, watch how far the
// heel drops, take the angle that lands it.
const HEEL_DROP_PROBE = 0.05;   // test swing used to calibrate the heel drop
// The bed it has to find is not the plane the interaction quotes. That one is
// the duvet her back rests on, and the beds lay a throw across their foot end
// 2.5 cm proud of it — which is what her heels actually come down on.
const LYING_FOOT_RISE = 0.025;
// Hems, in the trousers' own geometry space: the thigh runs from 0.98 at the
// hip to 0.52 at the knee, so the night pair lands at mid thigh and the swim
// pair a third of the way further down.
const NIGHT_SHORTS_HEM = 0.76;
const SWIM_SHORTS_HEM = 0.68;
// Cut-off denim for the zoo: the shortest of the three, a third of the way down
// the thigh. Anything higher and the crop runs into the crotch geometry, where
// the trousers stop being two tubes and there is no hem line left to sew.
const DENIM_SHORTS_HEM = 0.83;
// The sleeveless cut, as a fraction of the shirt's own half-width. The pack's
// tee reaches its widest at the cuff, so a little under three quarters of that
// lands the cut on the shoulder seam where an armhole belongs.
const VEST_ARMHOLE = 0.72;
// The tank is the OUTERMOST layer at the waist: it hangs over the trouser
// waistband, so it has to clear the trousers' own standoff and not just the
// t-shirt's surface. At 6 mm it cleared the tee and z-fought the trousers into
// a ragged red-and-white edge across the hip.
const VEST_STANDOFF = 0.019;
// 14 mm, not the shorts' 3 mm. These trousers cover the knee, and the knee is
// where the leg carries its bony landmarks — the kneecap and the condyles stand
// proud of the profile table by about 4 mm on their own. It also happens to be
// right for the garment: the reference pair is loose, and a trouser skin-tight
// over a patella is not a trouser.
const TROUSER_STANDOFF = 0.014;
// A garment sits ON the body, not in it, and this pair was authored as trousers
// around a leg that no longer exists. With the lofted legs graded up to real
// circumferences the fabric cleared the thigh by 2.3 mm just above the hem —
// inside the margin a walk cycle moves things by, so the leg was one stride
// away from coming through. Pushing the shell out along its own normals gives
// the standoff back without moving the hem line; a uniform scale, which is what
// used to be here, rides the hem up the thigh instead, which is why it went.
//
// Strongest at the cut and gone a hand above it. That is how a real pair sits —
// loose where it hangs free, pulled in at the waistband — and leaving the
// waistband where it is keeps it from lifting through the shirt tucked over it.
const FABRIC_STANDOFF = 0.0032;
const FABRIC_FADE = 0.16;

// Seated. A chair hands over two heights — the seat its cushion carries her on,
// and the floor its legs stand on — and between them they settle the whole pose:
// the hips have to end up just over the one and the soles down on the other. The
// old pose knew about neither. It dropped the body a hard-coded 43 cm and bent
// the hip and the knee 80° each, which on the armchair buried the thighs 7 cm
// into the cushion and left them coming out of it — the legs you could see being
// swallowed. Both angles are solved off the two heights now, so a taller seat
// simply slopes the thighs down a little more rather than sinking them.
//
// The datum is the sitting flesh, not the hip joint. The joint lives inside the
// pelvis; 7.5 cm of rise put the ischium and the thigh mesh in the cushion even
// when restY matched the seat top. Measured off the skin at load, then checked
// once on the first sit in case the standing sample missed the contact patch.
//
// Axes as for the supine pose: on the thigh Z is hip flexion and Y abduction.
const SEAT_HIP_RISE = 0.16;    // fallback: hip joint over the seat, flesh included
const SEAT_FLESH_CLEAR = 0.012; // keep the underside on the cushion, not in it
// Feet a little ahead of the knees rather than tucked under them, which is where
// they go on any seat that is not exactly the right height — and none of these
// are, the armchair standing a good 6 cm over her own knee.
const SEAT_SHIN_LEAN = THREE.MathUtils.degToRad(-12);
// Hips a hand's width toward the backrest so the thighs rest on the planks
// instead of hanging past the front edge (which is what put the calves through
// the seat). Local −Z is behind the avatar, where the backrest is.
const SEAT_BACK = -0.16;
// The bind pose already leaves the seated knees a natural hand's width apart.
// Adding a mirrored local-Y rotation here looks symmetric on paper, but these
// two thigh bones do not share mirrored local axes: it lifts and pulls one knee
// inward while pushing the other outward. Keeping the authored lateral stance
// gives matching knee and foot heights after the front/back levelling below.
const SEAT_LEAN = THREE.MathUtils.degToRad(-5);   // settled back, not at attention
const SEAT_FALLBACK_HEIGHT = 0.45;   // if a seat forgets to say how high it is
const SEAT_FLEX_PROBE = 0.05;        // test swing used to correct the hip flexion
// Wrists, in the avatar's own space: palms down on the thighs. It is the one
// place a hand can rest that works on a dining chair and an armchair alike, and
// the arms had no pose at all before — they were left to the standing idle,
// which hangs them straight down, through the seat of the one and the arms of
// the other.
// Placed off the seated thigh rather than guessed: hip at y 0.977, flexed 85°,
// so mid thigh is at y 0.957 and z 0.217, and the thigh is 72 mm through — put
// the wrist a hand's thickness over the top of that.
const SEATED_HAND_TARGETS = {
  l: new THREE.Vector3(0.127, 1.049, 0.217),
  r: new THREE.Vector3(-0.127, 1.049, 0.217),
};
const KNEELING_HAND_TARGETS = {
  l: new THREE.Vector3(0.118, 1.025, 0.195),
  r: new THREE.Vector3(-0.118, 1.025, 0.195),
};

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

// Clips a geometry to a half-space, splitting the triangles that straddle the
// plane. Keeping or dropping whole triangles on a centroid test is much simpler
// but leaves the cut in saw teeth, which on the shorts reads as a torn hem
// rather than a sewn one.
//
// `axis`/`keep` generalise what began as a horizontal hem: the shorts cut the
// trousers at y >= at, and the vest cuts the t-shirt twice on x to take its
// sleeves off. `standoff` is the hem's own lift off the skin and means nothing
// on a vertical cut, so it is opt-out.
function croppedGeometry(geometry, at, { axis = 'y', keep = 1, standoff = true } = {}) {
  const minY = at;
  const COMP = { x: 0, y: 1, z: 2 }[axis];
  const compOf = i => geometry.attributes.position.getComponent(i, COMP);
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
    const t = (at - compOf(a)) / (compOf(b) - compOf(a) || 1e-9);
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
    const inside = v.map(k => (compOf(k) - at) * keep >= 0);
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
  return standoff ? withStandoff(cropped, minY) : cropped;
}

// Pushes a whole shell out along its own normals — the layered-garment version
// of withStandoff, which fades with height and is meant for a hem. A vest worn
// over a t-shirt needs the same clearance everywhere or the shirt beneath it
// pokes through wherever the two happen to agree.
function inflatedGeometry(geometry, amount) {
  const position = geometry.attributes.position;
  const normal = geometry.attributes.normal;
  if (!normal) return geometry;
  for (let i = 0; i < position.count; i++) {
    position.setXYZ(i,
      position.getX(i) + normal.getX(i) * amount,
      position.getY(i) + normal.getY(i) * amount,
      position.getZ(i) + normal.getZ(i) * amount);
  }
  position.needsUpdate = true;
  geometry.computeBoundingSphere();
  return geometry;
}

// Lifts a cropped garment off the skin along its own normals, fading out with
// height above the hem. See FABRIC_STANDOFF.
function withStandoff(geometry, minY) {
  const position = geometry.attributes.position;
  const normal = geometry.attributes.normal;
  if (normal) {
    for (let i = 0; i < position.count; i++) {
      const fade = 1 - THREE.MathUtils.smoothstep(position.getY(i), minY, minY + FABRIC_FADE);
      if (fade <= 0) continue;
      const lift = FABRIC_STANDOFF * fade;
      position.setXYZ(i,
        position.getX(i) + normal.getX(i) * lift,
        position.getY(i) + normal.getY(i) * lift,
        position.getZ(i) + normal.getZ(i) * lift);
    }
    position.needsUpdate = true;
  }
  geometry.computeBoundingSphere();
  return geometry;
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
    this.heldArmPose = null;
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
    this.seatHipRise = SEAT_HIP_RISE;

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
    // Rest pose, captured before a single clip has touched the rig. A held
    // posture has to undo whatever the idle is doing to the legs, and a delta
    // applied on top of an animated bone would drift with it.
    this.restRotation = new Map(
      Object.entries(this.bones).map(([name, bone]) => [name, bone.quaternion.clone()])
    );
    this.armJoints = Object.keys(this.bones).filter(name => ARM_JOINT_RE.test(name));
    this.restPelvis = this.bones.pelvis?.position.clone() ?? null;
    // …and, from the same untouched pose, the two segment lengths and the two
    // heights the seated pose is solved from. Read off the rig rather than
    // tabulated, so a re-rig carries them.
    this.poseRoot.updateMatrixWorld(true);
    const at = name => this.bones[name]
      ? this.poseRoot.worldToLocal(this.bones[name].getWorldPosition(new THREE.Vector3()))
      : null;
    const restHip = at('thigh_l'), restKnee = at('calf_l'), restAnkle = at('foot_l');
    this.restHipY = restHip ? restHip.y : 0.98;
    this.restAnkleY = restAnkle ? restAnkle.y : 0.09;    // sole to ankle, standing
    // How far each segment carries the body DOWN when it hangs, which is not its
    // length: the pack is bound mid-stance and the knee sits 6 cm outboard of the
    // hip, so the thigh spans 460 mm but only drops 456. Solving the seated leg
    // on the lengths left the soles 2 cm over the floor.
    this.thighDrop = restHip && restKnee ? restHip.y - restKnee.y : 0.456;
    this.shinDrop = restKnee && restAnkle ? restKnee.y - restAnkle.y : 0.430;
    this.createWardrobeAlternates();
    this.setOutfit();
    this.seatHipRise = this.measureSeatHipRise();
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

    // Washed-silk dusty rose: the L.A. sleep set. Low roughness with a trace of
    // metalness is what reads as satin under the villa's warm bounce without
    // tipping over into metal. Champagne was the first choice and it blew out to
    // the same white as the bedding it is lying on.
    const silkMaterial = new THREE.MeshStandardMaterial({
      color: 0xc98d86,
      roughness: 0.44,
      metalness: 0.03,
      side: THREE.DoubleSide,
    });

    // Cut-off denim. Indigo twill is rough and almost matte — the swim pair's
    // 0.76 already reads as tech fabric, and denim wants to be flatter still.
    // Single-sided, unlike the other two: this crop is short enough that the
    // open hem faces the thigh filling it rather than the camera.
    const denimMaterial = new THREE.MeshStandardMaterial({
      color: 0x3f5f86,
      roughness: 0.93,
      metalness: 0.0,
      side: THREE.DoubleSide,
    });
    // Moulded rubber: dark, matte, a little sheen off the top of the sole.
    // Fine-gauge knit: matte, and a shade deeper than a printed red so it does
    // not flare out under the sun next to the pale trousers.
    // Loose off-white cotton — not paper white, which under a midday sun reads
    // as a blown-out hole rather than as cloth.
    const cottonMaterial = new THREE.MeshStandardMaterial({
      color: 0xefeae0,
      roughness: 0.94,
      metalness: 0.0,
    });
    const knitMaterial = new THREE.MeshStandardMaterial({
      color: 0xb0231f,
      roughness: 0.88,
      metalness: 0.0,
      side: THREE.DoubleSide,
    });
    const rubberMaterial = new THREE.MeshStandardMaterial({
      color: 0x1a1a1e,
      roughness: 0.62,
      metalness: 0.02,
    });

    const sleeves = buildSleeves(this.model, tshirtMaterial);
    const swimLegs = buildBareLegs(this.model, skinMaterial);
    const flipFlops = buildFlipFlops(this.model, rubberMaterial);

    const pants = this.clothing.pants.mesh;
    const swimShorts = pants
      ? this.createSkinnedClone(
        pants,
        croppedGeometry(pants.geometry, SWIM_SHORTS_HEM),
        swimMaterial,
        'Wardrobe_SwimShorts'
      )
      : null;
    // No inflation here: the 1.2% the shorts used to be scaled by existed only
    // to break the z-fight with the recoloured trousers that stood in for legs.
    // The lofted legs are well inside the trouser silhouette, and the scale was
    // riding the hem a centimetre up the thigh.

    // Top of the sleep set: the t-shirt geometry again, in silk. Cheaper and
    // better-fitting than lofting a torso, and it covers the shoulders — which
    // matters, because the skin under the shirt does not exist.
    const tshirt = this.clothing.tshirt.mesh;
    const nightTop = tshirt
      ? this.createSkinnedClone(tshirt, tshirt.geometry, silkMaterial, 'Wardrobe_NightTop')
      : null;
    // Red knit tank worn OVER the tee: the t-shirt shell again with its sleeves
    // cut off on two vertical planes, then inflated so the tee reads underneath
    // it at the shoulder and the armhole instead of fighting it for the same
    // surface. The armhole is taken from the shirt's own width rather than
    // guessed, because the pack's shirt is the only thing that knows how far
    // out its sleeves go.
    // The trousers are the pack's own mesh and the lofted legs live inside them,
    // but only just: graded for shorts, the calves clear the fabric by a couple
    // of millimetres and come through at the shin. The zoo therefore wears its
    // own copy, pushed out along its normals like the cropped garments are. The
    // original stays untouched for the villa, which has no legs under it.
    const zooTrousers = pants
      ? this.createSkinnedClone(
        pants,
        inflatedGeometry(pants.geometry.clone(), TROUSER_STANDOFF),
        cottonMaterial,
        'Wardrobe_ZooTrousers'
      )
      : null;

    let vest = null;
    if (tshirt) {
      tshirt.geometry.computeBoundingBox();
      const bb = tshirt.geometry.boundingBox;
      const armhole = Math.max(Math.abs(bb.min.x), Math.abs(bb.max.x)) * VEST_ARMHOLE;
      const shell = croppedGeometry(
        croppedGeometry(tshirt.geometry, armhole, { axis: 'x', keep: -1, standoff: false }),
        -armhole, { axis: 'x', keep: 1, standoff: false });
      vest = this.createSkinnedClone(
        tshirt, inflatedGeometry(shell, VEST_STANDOFF), knitMaterial, 'Wardrobe_Vest');
    }
    // …and the bottom half, the same crop as the swim pair but cut longer, on
    // the thigh. What used to be here was a skirt: a drape solved once over the
    // legs as they lie, then pinned to the pelvis so the animation could not
    // pull it out of shape. Nothing kept it on the body — on the bed it stood
    // out of her hip as a flat panel, and every correction to the drape moved
    // the fault somewhere else, because a garment authored in one pose has no
    // way of knowing about any other. A cropped trouser is skinned to the same
    // legs it covers, so it fits in every pose the pack has, this one included.
    const nightShorts = pants
      ? this.createSkinnedClone(
        pants,
        croppedGeometry(pants.geometry, NIGHT_SHORTS_HEM),
        silkMaterial,
        'Wardrobe_NightShorts'
      )
      : null;
    const denimShorts = pants
      ? this.createSkinnedClone(
        pants,
        croppedGeometry(pants.geometry, DENIM_SHORTS_HEM),
        denimMaterial,
        'Wardrobe_DenimShorts'
      )
      : null;

    let kimonoParts = [];
    try { kimonoParts = buildKimono(this.model) ?? []; }
    catch (err) { console.warn('[wardrobe] kimono', err); }

    this.wardrobe = {
      sleeves, swimLegs, swimShorts, nightTop, nightShorts,
      denimShorts, flipFlops, vest, zooTrousers, hairCrown: null,
      kimonoParts,
    };
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
      zoo: options.zoo === true,
      kimono: options.kimono === true,
    };
    const key = JSON.stringify(outfit);
    if (key === this.outfitKey || !this.wardrobe) return;
    this.outfitKey = key;
    this.outfit = outfit;

    // Three sets put the lofted legs on: the swim pair, the sleep set — which
    // replaces the whole outfit, silk top and all, because nobody sleeps in a
    // backpack — and the zoo's, which keeps the trousers and only needs the legs
    // for the bare feet coming out from under them.
    const legs = outfit.swim || outfit.night || outfit.zoo;
    const noTrousers = outfit.swim || outfit.night;
    const dressed = !outfit.night && !outfit.zoo && !outfit.kimono;
    const hat = outfit.hat && dressed;
    this.setPartVisible('hat', hat);
    this.setPartVisible('backpack', outfit.backpack && dressed);
    // Kimono keeps the tee and trousers on as the nagajuban: the lofted
    // robe sits over them, and they plug any hole the shells leave at the
    // collar or the stride.
    this.setPartVisible('tshirt', (outfit.tshirt && !outfit.night) || outfit.kimono);
    this.setPartVisible('pants', (outfit.pants && !noTrousers && !outfit.zoo) || outfit.kimono);
    this.setPartVisible('shoes', outfit.shoes && !legs);
    if (this.wardrobe.sleeves) this.wardrobe.sleeves.visible = outfit.longSleeves && dressed;
    if (this.armsMesh) this.armsMesh.visible = !((outfit.longSleeves && dressed) || outfit.kimono);
    if (this.wardrobe.swimLegs) this.wardrobe.swimLegs.visible = legs;
    if (this.wardrobe.swimShorts) this.wardrobe.swimShorts.visible = outfit.swim && dressed;
    if (this.wardrobe.nightTop) this.wardrobe.nightTop.visible = outfit.night;
    if (this.wardrobe.nightShorts) this.wardrobe.nightShorts.visible = outfit.night;
    if (this.wardrobe.denimShorts) this.wardrobe.denimShorts.visible = false;
    if (this.wardrobe.zooTrousers) this.wardrobe.zooTrousers.visible = outfit.zoo;
    if (this.wardrobe.vest) this.wardrobe.vest.visible = outfit.zoo;
    if (this.wardrobe.flipFlops) this.wardrobe.flipFlops.visible = outfit.zoo;
    for (const mesh of this.wardrobe.kimonoParts ?? []) {
      if (mesh) mesh.visible = outfit.kimono;
    }
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

  applySeatedPose(floorY) {
    // How high the seat stands over the floor in front of it. The body is hung
    // off the seat — the pose root drops until the hip is seatHipRise above
    // it, because the group is already parked ON the seat — and the leg then
    // has to span from there down to the floor.
    const seat = Number.isFinite(floorY)
      ? this.group.position.y - floorY : SEAT_FALLBACK_HEIGHT;
    this.placeSeated(seat);
    if (!this._seatCalibrated) {
      this.poseRoot.updateMatrixWorld(true);
      const extra = this.seatContactLift();
      if (extra > 0.004) {
        this.seatHipRise += extra;
        this._seatFlex = null;
        this.placeSeated(seat);
      }
      this._seatCalibrated = true;
    }
  }

  placeSeated(seat) {
    const flex = this.seatFlex(seat);
    this.resetHeldPose();
    this.poseSeatedLegs(flex);
    this.bones.spine_01?.rotateZ(SEAT_LEAN);
    this.applyHeldArmPose('seated', SEATED_HAND_TARGETS);
    this.poseRoot.position.y = this.seatHipRise - this.restHipY;
    this.poseRoot.position.z = SEAT_BACK;
  }

  // Standing bind: how far below the hip joint the sitting contact patch hangs.
  // That drop is what has to stand over the cushion, or the pose parks the
  // joint on the seat and the mesh goes through it.
  measureSeatHipRise() {
    const v = new THREE.Vector3();
    let minY = this.restHipY;
    this.poseRoot.updateMatrixWorld(true);
    this.model.traverse(mesh => {
      if (!mesh.isSkinnedMesh) return;
      const pos = mesh.geometry.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        mesh.getVertexPosition(i, v);
        this.poseRoot.worldToLocal(v);
        if (v.y > this.restHipY - 0.02 || v.y < this.restHipY - 0.28) continue;
        if (v.z > 0.06 || Math.abs(v.x) > 0.18) continue;
        if (v.y < minY) minY = v.y;
      }
    });
    const drop = this.restHipY - minY;
    return THREE.MathUtils.clamp(drop + SEAT_FLESH_CLEAR, 0.12, 0.22);
  }

  // After the seated pose is up: how far the underside still sits below the
  // seat (group.y). Only the contact patch — hips and thighs, not the feet.
  seatContactLift() {
    const v = new THREE.Vector3();
    const local = new THREE.Vector3();
    let minY = Infinity;
    this.model.traverse(mesh => {
      if (!mesh.isSkinnedMesh) return;
      const pos = mesh.geometry.attributes.position;
      const step = Math.max(1, (pos.count / 400) | 0);
      for (let i = 0; i < pos.count; i += step) {
        mesh.getVertexPosition(i, v);
        local.copy(v);
        this.group.worldToLocal(local);
        if (local.z < -0.06 || local.z > 0.36) continue;
        if (Math.abs(local.x) > 0.20) continue;
        if (local.y > 0.20 || local.y < -0.22) continue;
        if (local.y < minY) minY = local.y;
      }
    });
    if (!Number.isFinite(minY)) return 0;
    return Math.max(0, SEAT_FLESH_CLEAR - minY);
  }

  // Same flexion on both thighs. hipLevelling() is for the supine pose — it
  // zeroes mid-stance reach so both legs hang in the body's plane — and on a
  // chair it left one shin twisted out (the foot pointing sideways). The
  // authored rest stance already carries a natural knee gap; do not add to it.
  poseSeatedLegs(flex) {
    for (const side of ['l', 'r']) {
      this.bones[`thigh_${side}`]?.rotateZ(flex);
      // The knee takes the thigh back off again and leaves the shin on its lean;
      // the ankle then takes the lean off too, so the sole finishes flat on the
      // floor instead of at whatever angle the clip underneath left it.
      this.bones[`calf_${side}`]?.rotateZ(SEAT_SHIN_LEAN - flex);
      this.bones[`foot_${side}`]?.rotateZ(-SEAT_SHIN_LEAN);
    }
  }

  // Hip flexion that lands the soles on the floor, for a seat standing `seat`
  // above it.
  //
  // The closed form below is only the opening guess. A leg is not the flat
  // two-link diagram it assumes — the pack is bound mid-stance, with each knee
  // already a little outboard of the hip — and taken on its own it left the feet
  // a good 2 cm over the floor. Two corrections off the ankle the pose actually
  // produces take that out. Cached per seat height; the villa has two.
  seatFlex(seat) {
    const rise = this.seatHipRise;
    if (this._seatFlex?.seat === seat && this._seatFlex.rise === rise) return this._seatFlex.flex;
    let flex = Math.acos(THREE.MathUtils.clamp(
      (seat + rise - this.shinDrop * Math.cos(SEAT_SHIN_LEAN) - this.restAnkleY)
      / this.thighDrop, -1, 1));
    const ankle = this.bones.foot_l;
    if (ankle) {
      // Soles down means the ankle stands its own standing height over the floor,
      // and the hip a fixed rise over the seat: that fixes the drop between them.
      const want = seat + rise - this.restAnkleY;
      const scratch = new THREE.Vector3();
      const dropAt = f => {
        this.resetHeldPose();
        this.poseSeatedLegs(f);
        this.poseRoot.updateMatrixWorld(true);
        return this.restHipY - this.poseRoot.worldToLocal(ankle.getWorldPosition(scratch)).y;
      };
      for (let pass = 0; pass < 2; pass++) {
        const now = dropAt(flex);
        const nudged = dropAt(flex + SEAT_FLEX_PROBE);
        if (nudged === now) break;
        flex += SEAT_FLEX_PROBE * (want - now) / (nudged - now);
      }
    }
    this._seatFlex = { seat, rise, flex };
    return flex;
  }

  // Trunk, head and both legs back to the bind pose, which is what a held pose
  // is built on top of. Without it the clip still playing underneath sways the
  // spine and keeps one leg swung out of the stance it was captured in.
  resetHeldPose() {
    for (const joint of [...POSE_TRUNK_JOINTS, ...POSE_HEAD_JOINTS]) {
      const bone = this.bones[joint];
      const rest = this.restRotation?.get(joint);
      if (bone && rest) bone.quaternion.copy(rest);
    }
    if (this.restPelvis) this.bones.pelvis.position.copy(this.restPelvis);
    for (const side of ['l', 'r']) {
      for (const joint of POSE_LEG_JOINTS) {
        const bone = this.bones[`${joint}_${side}`];
        const rest = this.restRotation?.get(`${joint}_${side}`);
        if (bone && rest) bone.quaternion.copy(rest);
      }
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

  // Both held poses want the same thing from the arms: solve them onto a pair of
  // hand targets once, keep the answer, and re-apply it over whatever the clip
  // underneath is doing. `key` is only there so the supine and the seated
  // answers do not share a cache.
  applyHeldArmPose(key, targets) {
    this.heldArmPose ??= {};
    if (!this.heldArmPose[key]) {
      for (const joint of this.armJoints) {
        this.bones[joint].quaternion.copy(this.restRotation.get(joint));
      }
      this.poseRoot.updateMatrixWorld(true);
      for (const side of ['l', 'r']) this.solveRestingArm(side, targets[side]);
      this.heldArmPose[key] = new Map(
        this.armJoints.map(joint => [joint, this.bones[joint].quaternion.clone()])
      );
    }
    for (const [joint, rotation] of this.heldArmPose[key]) {
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

  // The vertices of one leg below the knee, on the mesh the night outfit
  // actually shows. The trousers are the wrong thing to measure the heel
  // against: they are hidden here, and the lofted legs they used to stand in for
  // sit a good 3 cm inside them — resting the trouser on the bed still leaves
  // the leg you can see hanging over it.
  heelVertices(side) {
    if (!this._heelVertices) {
      this._heelVertices = { l: [], r: [] };
      const mesh = this.wardrobe?.swimLegs;
      const index = mesh?.geometry.attributes.skinIndex;
      const weight = mesh?.geometry.attributes.skinWeight;
      for (let i = 0; index && i < index.count; i++) {
        let bone = -1, most = 0;
        for (let c = 0; c < 4; c++) {
          const w = weight.getComponent(i, c);
          if (w > most) { most = w; bone = index.getComponent(i, c); }
        }
        const below = /^(?:calf|foot|ball)_([lr])$/.exec(mesh.skeleton.bones[bone]?.name ?? '');
        if (below) this._heelVertices[below[1]].push(i);
      }
    }
    return this._heelVertices[side];
  }

  // How far the lowest of them is off the bedding, in metres. The group sits on
  // the rest height the furniture handed over, so its own Y is the bed.
  heelHeight(side) {
    const mesh = this.wardrobe.swimLegs;
    const v = new THREE.Vector3();
    let min = Infinity;
    this.group.updateMatrixWorld(true);
    for (const i of this.heelVertices(side)) {
      mesh.getVertexPosition(i, v);
      mesh.localToWorld(v);
      if (v.y < min) min = v.y;
    }
    return min - this.group.position.y - LYING_FOOT_RISE;
  }

  // Per-side hip extension that hangs the leg until its heel reaches the bed.
  // See HEEL_DROP_PROBE. Measured against the finished lying pose, so it has to
  // be solved from inside applyLyingPose and not before it.
  heelDrop() {
    if (!this._heelDrop) {
      this._heelDrop = { l: 0, r: 0 };
      for (const side of ['l', 'r']) {
        const thigh = this.bones[`thigh_${side}`];
        if (!thigh || !this.heelVertices(side).length) continue;
        const rest = thigh.quaternion.clone();
        // Re-solved off its own answer a couple of times, which the levelling
        // does not have to do. The lowest point below the knee is the heel while
        // the leg is up and the toe once it is down, so the first solve is
        // reading one landmark and landing another, and on its own it drove the
        // shin a good 3 cm into the bedding.
        let angle = 0;
        for (let pass = 0; pass < 3; pass++) {
          thigh.quaternion.copy(rest);
          thigh.rotateZ(angle);
          const before = this.heelHeight(side);
          thigh.rotateZ(HEEL_DROP_PROBE);
          const after = this.heelHeight(side);
          if (after === before) break;
          angle -= HEEL_DROP_PROBE * before / (after - before);
        }
        thigh.quaternion.copy(rest);
        this._heelDrop[side] = angle;
      }
      this.group.updateMatrixWorld(true);
    }
    return this._heelDrop;
  }

  applyLyingPose() {
    this.poseRoot.rotation.x = -Math.PI / 2;
    this.poseRoot.position.y = this.backReach();
    // The clip underneath is a STANDING idle: weight on one leg, the other knee
    // bent with its heel off the floor. Tipped onto its back that reads as a
    // foot hovering over the mattress, so the leg chain goes back to the rest
    // pose first, then gets levelled and relaxed.
    this.resetHeldPose();
    const level = this.hipLevelling();
    for (const side of ['l', 'r']) {
      const mirror = side === 'l' ? 1 : -1;
      const thigh = this.bones[`thigh_${side}`];
      thigh?.rotateZ(level[side]);
      thigh?.rotateY(-LYING_HIP_SPREAD * mirror);
      thigh?.rotateX(LYING_LEG_ROLL * mirror);
      this.bones[`foot_${side}`]?.rotateZ(LYING_ANKLE_DROP);
    }
    // Last, because it is solved against everything above it: the legs hang off
    // the hips until the heels are on the bedding instead of over it.
    const heel = this.heelDrop();
    for (const side of ['l', 'r']) this.bones[`thigh_${side}`]?.rotateZ(heel[side]);
    this.applyHeldArmPose('lying', LYING_HAND_TARGETS);
  }

  applyKneelingPose(floorY) {
    this.resetHeldPose();
    for (const side of ['l', 'r']) {
      this.bones[`thigh_${side}`]?.rotateZ(1.52);
      this.bones[`calf_${side}`]?.rotateZ(-2.48);
      this.bones[`foot_${side}`]?.rotateZ(-0.82);
    }
    this.bones.spine_01?.rotateZ(THREE.MathUtils.degToRad(8));
    this.bones.neck_01?.rotateZ(THREE.MathUtils.degToRad(10));
    this.bones.head?.rotateZ(THREE.MathUtils.degToRad(6));
    this.applyHeldArmPose('kneeling', KNEELING_HAND_TARGETS);
    this.poseRoot.position.y = -0.52;
    this.poseRoot.position.z = -0.06;
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
    if (posture === 'sit' || posture === 'lie' || posture === 'kneel') {
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
    this.setEyesClosed(posture === 'lie' || posture === 'kneel');
    if (posture === 'sit') {
      this.applySeatedPose(ctx.floorY);
    } else if (posture === 'lie') {
      this.applyLyingPose();
    } else if (posture === 'kneel') {
      this.applyKneelingPose(ctx.floorY);
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
