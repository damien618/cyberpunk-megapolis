// player.js — character visual layer: Survivors skin + animation state mapping
// driven by the Controller, plus the bezier web rope. All physics lives in
// controller.js (adapted from the web-slinger reference).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { buildBareLegs, buildFlipFlops, buildSleeves } from './limbs.js?v=45';
import { buildKimono } from './kimono.js?v=27';

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
// Hugging the toy to her chest: the forearms cross in a loose X over its front
// (one over its chest, one over its belly), each hand cupping the far side.
// Hands sit just above the toy's front: any lower and the forearms pass under
// it. And they stay high: reach much further down the torso and the arm runs
// out of bend, the elbow collapses onto the shoulder-hand line and the sleeves
// vanish inside her belly.
const PLUSH_HAND_TARGETS = {
  l: new THREE.Vector3(-0.05, 1.22, 0.245),
  r: new THREE.Vector3(0.05, 1.13, 0.235),
};
// Left alone, each hand carries straight on along its forearm and stands up
// off the toy like a paw raised to wave. Lay the fingers across the plush
// instead, curving down over its far side, palms resting on it.
PLUSH_HAND_TARGETS.aim = {
  l: new THREE.Vector3(-0.9, 0.05, -0.2),
  r: new THREE.Vector3(0.9, 0.05, -0.3),
};
PLUSH_HAND_TARGETS.palm = new THREE.Vector3(0, 0, -1);
const PLUSH_HEAD_TURN = 0.35;
const HAND_CURL = 0.35;
// Elbows out to the sides, not back: a backward pole sinks them into the torso.
const PLUSH_ARM_POLE = new THREE.Vector3(1, -0.25, -0.1);
// Where the toy rests in pose-root space: on her sternum, head under her chin.
const PLUSH_REST = new THREE.Vector3(0, 1.25, 0.15);

// Small soft Pikachu, built from inexpensive rounded meshes so the toy stays
// attached to the character and follows the whole reclining pose.
function makeSleepPlush() {
  const toy = new THREE.Group();
  toy.scale.setScalar(0.6);
  // Lying on her chest, head nestled toward her chin, face tipped toward the
  // foot of the bed so it peeks over her crossed arms from the camera there.
  toy.position.copy(PLUSH_REST);
  toy.rotation.set(0.45, 0, 0.12);
  const yellow = new THREE.MeshStandardMaterial({ color: 0xffda32, roughness: 0.96 });
  const black = new THREE.MeshStandardMaterial({ color: 0x26222b, roughness: 0.96 });
  const red = new THREE.MeshStandardMaterial({ color: 0xf45455, roughness: 0.96 });
  const brown = new THREE.MeshStandardMaterial({ color: 0x955328, roughness: 0.96 });
  const white = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.96 });
  const ball = (material, x, y, z, sx, sy, sz) => {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 10), material);
    mesh.position.set(x, y, z);
    mesh.scale.set(sx, sy, sz);
    toy.add(mesh);
    return mesh;
  };
  ball(yellow, 0, -0.035, 0, 0.115, 0.14, 0.075);
  ball(yellow, 0, 0.115, 0.005, 0.13, 0.12, 0.09);
  for (const side of [-1, 1]) {
    const ear = ball(yellow, side * 0.087, 0.305, 0, 0.037, 0.13, 0.028);
    ear.rotation.z = -side * 0.28;
    const tip = ball(black, side * 0.119, 0.408, 0, 0.036, 0.047, 0.029);
    tip.rotation.z = -side * 0.28;
    ball(yellow, side * 0.115, -0.025, 0.055, 0.041, 0.075, 0.042);
    ball(yellow, side * 0.065, -0.165, 0.02, 0.051, 0.04, 0.055);
    ball(black, side * 0.055, 0.145, 0.087, 0.013, 0.018, 0.01);
    ball(white, side * 0.052, 0.152, 0.096, 0.004, 0.005, 0.003);
    ball(red, side * 0.096, 0.073, 0.075, 0.034, 0.027, 0.009);
  }
  ball(black, 0, 0.097, 0.099, 0.012, 0.008, 0.007);
  // A short stepped lightning-bolt tail remains legible from the bed camera.
  const tail = new THREE.Group();
  const segment = (x, y, length, width, angle, material) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, length, 0.025), material);
    mesh.position.set(x, y, -0.055);
    mesh.rotation.z = angle;
    tail.add(mesh);
  };
  segment(-0.14, -0.09, 0.14, 0.038, -0.55, brown);
  segment(-0.22, -0.03, 0.17, 0.061, 0.7, yellow);
  segment(-0.27, 0.06, 0.16, 0.077, -0.5, yellow);
  toy.add(tail);
  toy.visible = false;
  return toy;
}
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
// Pyjama bottoms stop at the ankle bone, not on the foot. The pack's trousers
// run down to y = 0.113, a couple of centimetres above the sole, and their hem
// then sits across the ankle: the cloth's own dark underside shows in the gap,
// the foot reads as a pale block hung under a dark band, and from the front —
// where a splayed foot is foreshortened to almost nothing — that block looks
// like a heel pointing at the camera. Cropping to the ankle bone puts the whole
// foot in clear view and the leg fills the hem.
const PYJAMA_ANKLE_HEM = 0.175;
// Slippers: the pack's shoe last, pushed out a few millimetres and dressed in
// the pyjama's own fleece.
const PYJAMA_SLIPPER_LOFT = 0.005;
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
// `axis` also takes a function (x, y, z, index) → scalar, and then the cut is
// that field's `at` level set rather than a plane. The swimsuit needs both
// kinds it allows: the scooped back is a seam that runs down and aft at once
// while stepping over the straps, which no plane describes, and the armhole is
// cut on the vertex's own arm weight, which is not a function of position at
// all. The seam vertices are placed by interpolating the field linearly along
// each straddling edge — exact for a plane, exact for a skin weight, and close
// enough for a gently curved field at this mesh's density.
function croppedGeometry(geometry, at, { axis = 'y', keep = 1, standoff = true } = {}) {
  const minY = at;
  const position0 = geometry.attributes.position;
  const compOf = typeof axis === 'function'
    ? i => axis(position0.getX(i), position0.getY(i), position0.getZ(i), i)
    : (COMP => i => position0.getComponent(i, COMP))({ x: 0, y: 1, z: 2 }[axis]);
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

// ---------------------------------------------------------------------------
// Knitted fabric: one height field, three maps
// ---------------------------------------------------------------------------
// The first pyjama was flat colour on smooth shells and read as white tubing.
// What a soft garment needs is relief: the loops of the knit have to catch the
// light. So the pattern is authored once as a height field and then expressed
// three ways — as shading, as a tangent-space normal map, and as a roughness
// variation — which is what makes the same geometry read as cloth.
const KNIT_TILE = 256;
// Loops across one tile. With the tile pinned to 5.8 cm below, 14 of them puts
// a loop at about 4 mm — the gauge of a brushed jersey. The first pass ran at
// 9 mm and read as hand crochet on a character this size.
const KNIT_LOOPS = 14;
// Physical size of one tile. Everything else is derived from it.
const KNIT_TILE_M = 0.058;

/**
 * Replaces a garment shell's UVs with a body-axis cylindrical projection: the
 * coordinate wraps around the torso (or around each leg), runs up it, and is
 * expressed in metres, so one repeat setting fits every piece.
 *
 * The pack's own unwrap is right for the photographic camo it was made for,
 * but its islands are rotated and unevenly scaled — measured against the
 * model's vertical, the trousers' u axis still carries 0.48 of it against
 * 0.81 for v — so a stripe drawn on it runs diagonally down the legs and at a
 * different gauge on every panel. A projection built from the positions
 * themselves puts every stripe truly vertical and every loop at one size.
 *
 * `splitLegs` projects each leg around its own axis rather than the body's,
 * which is what keeps a stripe running down a trouser instead of wrapping
 * across the crotch; the axis is measured off the calves rather than tabulated,
 * so it survives a re-rig. The wrap is mirrored (|angle| / π), so the texture
 * closes at the front seam and at the back without a visible join — and a
 * mirrored stripe is what a garment cut symmetrically looks like anyway.
 */
// Mean |x| over the bottom quarter of a pair of trousers: down there the two
// legs are well separated, so each one's own axis is unambiguous. Measured
// rather than tabulated, so it survives a re-rig.
function legAxisX(geometry) {
  const position = geometry.attributes.position;
  geometry.computeBoundingBox();
  const { min, max } = geometry.boundingBox;
  const cut = min.y + (max.y - min.y) * 0.25;
  let sum = 0, n = 0;
  for (let i = 0; i < position.count; i++) {
    if (position.getY(i) > cut) continue;
    sum += Math.abs(position.getX(i));
    n++;
  }
  return n ? sum / n : 0;
}

/**
 * Draws a pair of trousers in towards each leg's own axis, the pull growing
 * towards the hem. The pack's trousers are cut with a combat silhouette and
 * read as baggy on a sleep set, where the line should taper. Nothing moves
 * above `from`, so the seat and the waistband keep their shape, and the pull
 * is capped at a fraction of the distance to the axis so a narrow ankle can
 * never be turned inside out.
 */
function taperedLegs(geometry, { from = 0.58, to = 0.0, amount = 0.02 } = {}) {
  const axisX = legAxisX(geometry);
  const position = geometry.attributes.position;
  const { min, max } = geometry.boundingBox;
  const span = (max.y - min.y) || 1;
  for (let i = 0; i < position.count; i++) {
    const y = position.getY(i);
    const k = THREE.MathUtils.clamp((from - (y - min.y) / span) / (from - to), 0, 1);
    if (k <= 0) continue;
    const x = position.getX(i), z = position.getZ(i);
    const dx = x - Math.sign(x || 1) * axisX;
    const d = Math.hypot(dx, z);
    if (d < 1e-4) continue;
    const pull = Math.min(amount * k, d * 0.4);
    position.setXYZ(i, x - (dx / d) * pull, y, z - (z / d) * pull);
  }
  position.needsUpdate = true;
  geometry.computeBoundingSphere();
  return geometry;
}

/**
 * Takes the combat cut out of the back of the pack trousers. Its seat is
 * deliberately very loose in the bind pose; once both thighs turn through a
 * right angle that spare cloth fans out behind the pelvis like a separate
 * body. Keep the waistband and the legs untouched and draw only the rear half
 * of the upper seat towards the body. This is a bind-space tailoring change,
 * so it follows the same skinning as the original cloth in every pose.
 */
function tailoredTrouserSeat(geometry, amount = 0.065) {
  geometry.computeBoundingBox();
  const position = geometry.attributes.position;
  const { min, max } = geometry.boundingBox;
  const span = (max.y - min.y) || 1;
  for (let i = 0; i < position.count; i++) {
    const y = position.getY(i), z = position.getZ(i);
    const h = (y - min.y) / span;
    if (h < 0.55 || z >= -0.035) continue;
    // Full correction around the seat, feathered to zero at the waistband and
    // above the thighs so neither seam changes shape.
    const lower = THREE.MathUtils.smoothstep(h, 0.55, 0.72);
    const upper = 1 - THREE.MathUtils.smoothstep(h, 0.91, 1.0);
    const rear = THREE.MathUtils.smoothstep(-z, 0.035, 0.20);
    position.setZ(i, z + amount * lower * upper * rear);
  }
  position.needsUpdate = true;
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

/**
 * Tucks the top of a lofted sleeve in towards its own arm's axis.
 *
 * The loft starts inside the torso by design, but its cap ring is cut to clear
 * the pack's tee, and the pyjama top is that tee's shell — so the two surfaces
 * cross right on top of the shoulder and leave a visible step there. Pulling
 * the cap in buries the crossing under the body of the top instead. Only the
 * cap moves, so the shoulder line and the whole of the arm below it are
 * untouched. Each arm is pulled towards its own centre, measured off the cap
 * itself, because the two are one geometry.
 */
function tuckedSleeveCap(geometry, { above = 0.84, amount = 0.011 } = {}) {
  const position = geometry.attributes.position;
  geometry.computeBoundingBox();
  const { min, max } = geometry.boundingBox;
  const span = (max.y - min.y) || 1;
  const sums = { '-1': { x: 0, z: 0, n: 0 }, 1: { x: 0, z: 0, n: 0 } };
  for (let i = 0; i < position.count; i++) {
    if ((position.getY(i) - min.y) / span < above) continue;
    const side = Math.sign(position.getX(i) || 1);
    sums[side].x += position.getX(i);
    sums[side].z += position.getZ(i);
    sums[side].n++;
  }
  for (let i = 0; i < position.count; i++) {
    const y = position.getY(i);
    const k = THREE.MathUtils.clamp(((y - min.y) / span - above) / (1 - above), 0, 1);
    if (k <= 0) continue;
    const side = Math.sign(position.getX(i) || 1);
    const centre = sums[side];
    if (!centre.n) continue;
    const dx = position.getX(i) - centre.x / centre.n;
    const dz = position.getZ(i) - centre.z / centre.n;
    const d = Math.hypot(dx, dz);
    if (d < 1e-4) continue;
    const pull = Math.min(amount * k, d * 0.4);
    position.setXYZ(i, position.getX(i) - (dx / d) * pull, y, position.getZ(i) - (dz / d) * pull);
  }
  position.needsUpdate = true;
  geometry.computeBoundingSphere();
  return geometry;
}

/**
 * The button placket: the strip of doubled cloth down the centre front of a
 * pyjama top, in the piping colour. Painted from each vertex's own angle
 * around the body and blended into whatever bandedGeometry already laid down,
 * because the weave tiles seventeen times across the garment — a strip drawn
 * into the texture would repeat all the way round it.
 */
function plackedGeometry(geometry, colour, { halfWidth = 0.026, radius = 0.155, upTo = 0.93 } = {}) {
  const position = geometry.attributes.position;
  const colours = geometry.attributes.color;
  if (!colours) return geometry;
  geometry.computeBoundingBox();
  const { min, max } = geometry.boundingBox;
  const span = (max.y - min.y) || 1;
  const trim = new THREE.Color(colour);
  const tmp = new THREE.Color();
  for (let i = 0; i < position.count; i++) {
    const f = (position.getY(i) - min.y) / span;
    if (f > upTo) continue;                       // stop under the collar band
    // Arc length from the centre front, so the strip keeps one width whatever
    // the body does underneath it.
    const arc = Math.abs(Math.atan2(position.getX(i), position.getZ(i))) * radius;
    const k = (1 - THREE.MathUtils.smoothstep(arc, halfWidth, halfWidth + 0.012))
      * (1 - THREE.MathUtils.smoothstep(f, upTo - 0.05, upTo));
    if (k <= 0.001) continue;
    tmp.fromBufferAttribute(colours, i).lerp(trim, k);
    colours.setXYZ(i, tmp.r, tmp.g, tmp.b);
  }
  colours.needsUpdate = true;
  return geometry;
}

function cylindricalGarmentUv(geometry, { radius = 0.15, splitLegs = false } = {}) {
  const position = geometry.attributes.position;
  const axisX = splitLegs ? legAxisX(geometry) : 0;
  const uv = new Float32Array(position.count * 2);
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i), y = position.getY(i), z = position.getZ(i);
    const centre = axisX ? Math.sign(x || 1) * axisX : 0;
    uv[i * 2] = Math.abs(Math.atan2(x - centre, z)) * radius;   // metres around
    uv[i * 2 + 1] = y;                                          // metres up
  }
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geometry;
}

function knitHeightField(size, seed) {
  let state = seed >>> 0;
  const rnd = () => (state = (state * 1664525 + 1013904223) >>> 0) / 4294967296;
  // Fibre haze under the loops: a coarse value-noise lattice, sampled with
  // wrap-around so the tile stays seamless.
  const coarse = 16;
  const lattice = new Float32Array(coarse * coarse);
  for (let i = 0; i < lattice.length; i++) lattice[i] = rnd();
  const haze = (fx, fy) => {
    const x0 = Math.floor(fx), y0 = Math.floor(fy);
    const tx = fx - x0, ty = fy - y0;
    const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
    const at = (x, y) => lattice[((y % coarse) + coarse) % coarse * coarse
      + ((x % coarse) + coarse) % coarse];
    return (at(x0, y0) * (1 - sx) + at(x0 + 1, y0) * sx) * (1 - sy)
      + (at(x0, y0 + 1) * (1 - sx) + at(x0 + 1, y0 + 1) * sx) * sy;
  };

  const field = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size, v = y / size;
      // Staggered courses, the way a jersey is actually knitted: every other
      // row is offset by half a loop.
      const row = Math.floor(v * KNIT_LOOPS);
      const cx = (u * KNIT_LOOPS + (row % 2) * 0.5) % 1 - 0.5;
      const cy = (v * KNIT_LOOPS) % 1 - 0.5;
      const loop = Math.exp(-(cx * cx * 17 + cy * cy * 27));
      // Brushed nap: on flannel the fibre is combed along the grain, so this
      // noise varies four times faster across the cloth than along it. Both
      // multipliers stay whole numbers or the lattice stops wrapping and the
      // tile grows a seam. It is what separates a napped pyjama from a flat
      // jersey, and it is most of the trousers' surface.
      const nap = haze(u * coarse * 3, v * coarse);
      // The nap is deliberately faint. At a quarter of this weight it already
      // reads as brushing; at the weight the first pass gave it, the combed
      // fibre lined up into ribs and the whole set came out as corduroy with
      // the stripes lost inside it.
      field[y * size + x] = loop * 0.5 + haze(u * coarse, v * coarse) * 0.3
        + nap * 0.09 + (rnd() - 0.5) * 0.06;
    }
  }
  return field;
}

function fieldTexture(size, field, paint, { srgb = true } = {}) {
  const canvas = Object.assign(document.createElement('canvas'), { width: size, height: size });
  const ctx = canvas.getContext('2d');
  const image = ctx.createImageData(size, size);
  paint(image.data, field, size);
  ctx.putImageData(image, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  // A normal or roughness map is data, not colour, and must stay linear.
  if (srgb) texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

/**
 * The three maps of one knit, built from a single height field.
 *
 * Returns neutral-toned maps: the garment's colour comes from the vertex
 * colours painted by bandedGeometry, so one weave can serve a cream pyjama and
 * its darker ribbed cuffs without a second texture.
 */
function knitMaps(seed) {
  const size = KNIT_TILE;
  const field = knitHeightField(size, seed);
  const at = (x, y) => field[((y % size) + size) % size * size + ((x % size) + size) % size];

  // Plain brushed flannel. A woven stripe lived here and had to go: drawn on
  // the cylindrical projection it converged wherever the projection did — down
  // the inside of each leg, around the seat — and the set read as a web. The
  // cues that actually say "pyjama" are the contrast piping and the front
  // placket, and those are geometry, so they do not distort.
  const map = fieldTexture(size, field, (data, f, n) => {
    for (let i = 0; i < n * n; i++) {
      // Near-white ground: the weave only modulates, it does not tint. A map
      // carrying the cloth colour as well would multiply with the vertex
      // colour and sink the garment two stops.
      const l = 0.84 + f[i] * 0.18;
      data[i * 4] = Math.min(255, l * 255);
      data[i * 4 + 1] = Math.min(255, l * 250);   // a touch warm in the valleys
      data[i * 4 + 2] = Math.min(255, l * 244);
      data[i * 4 + 3] = 255;
    }
  });

  const normalMap = fieldTexture(size, field, (data, f, n) => {
    const strength = 5.5;
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const dx = (at(x + 1, y) - at(x - 1, y)) * strength;
        const dy = (at(x, y - 1) - at(x, y + 1)) * strength;   // +Y up, canvas y down
        const len = Math.hypot(dx, dy, 1);
        const i = (y * n + x) * 4;
        data[i] = (-dx / len * 0.5 + 0.5) * 255;
        data[i + 1] = (-dy / len * 0.5 + 0.5) * 255;
        data[i + 2] = (1 / len * 0.5 + 0.5) * 255;
        data[i + 3] = 255;
      }
    }
  }, { srgb: false });

  // Roughness rides in the green channel. The crowns of the loops are polished
  // by wear and the valleys between them stay fuzzy, which is the difference
  // between knitwear and a matte plastic shell.
  const roughnessMap = fieldTexture(size, field, (data, f, n) => {
    for (let i = 0; i < n * n; i++) {
      const r = Math.min(255, (0.99 - f[i] * 0.22) * 255);
      data[i * 4] = r; data[i * 4 + 1] = r; data[i * 4 + 2] = r; data[i * 4 + 3] = 255;
    }
  }, { srgb: false });

  return { map, normalMap, roughnessMap };
}

// Inflates only the bottom of a garment, the standoff ramping to nothing by
// `toFrac` of the shell's own height. A top worn over trousers has to clear
// the trousers' standoff at the waist — the same reason the zoo vest is pushed
// out further than they are — but inflating a whole t-shirt shell also pushes
// its short sleeve out through the lofted long sleeve that is meant to hide it.
function hemInflatedGeometry(geometry, amount, fromFrac = 0.18, toFrac = 0.52) {
  const position = geometry.attributes.position;
  const normal = geometry.attributes.normal;
  if (!normal) return geometry;
  geometry.computeBoundingBox();
  const { min, max } = geometry.boundingBox;
  const span = Math.max(max.y - min.y, 1e-6);
  for (let i = 0; i < position.count; i++) {
    const t = (position.getY(i) - min.y) / span;
    const k = THREE.MathUtils.clamp((toFrac - t) / (toFrac - fromFrac), 0, 1);
    if (k <= 0) continue;
    position.setXYZ(i,
      position.getX(i) + normal.getX(i) * amount * k,
      position.getY(i) + normal.getY(i) * amount * k,
      position.getZ(i) + normal.getZ(i) * amount * k);
  }
  position.needsUpdate = true;
  geometry.computeBoundingSphere();
  return geometry;
}

// The girl's source tee has a long, loose rear hem. Bent at the hips it does
// not drape; its pelvis weights rotate the whole lower panel into a rigid fan
// behind the chair. Fit only that rear-lower quadrant and lift its very bottom
// edge under the trouser waistband. The front placket and side silhouette stay
// unchanged, as do all vertices above the waist.
function fittedShirtRear(geometry, depth = 0.055, lift = 0.025) {
  geometry.computeBoundingBox();
  const position = geometry.attributes.position;
  const { min, max } = geometry.boundingBox;
  const span = Math.max(max.y - min.y, 1e-6);
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i), y = position.getY(i), z = position.getZ(i);
    const h = (y - min.y) / span;
    if (h > 0.55 || z >= -0.025) continue;
    const hem = 1 - THREE.MathUtils.smoothstep(h, 0.16, 0.55);
    const rear = THREE.MathUtils.smoothstep(-z, 0.025, 0.18);
    const k = hem * rear;
    position.setXYZ(i, x, y + lift * k, z + depth * k);
  }
  position.needsUpdate = true;
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

// Paints horizontal bands across a garment as vertex colours, each positioned
// by fraction of the geometry's own (post-crop) height rather than an absolute
// Y — so a band stays put on the hem it was measured against regardless of
// where that hem sits on the body. Needs a material with vertexColors: true;
// the base colour is baked in here rather than left to material.color so the
// same geometry cannot silently pick up the wrong garment's tint later.
// Bands are laid down in order, each over the last, so a later one wins where
// they overlap. Pass `bounds` to measure the fractions against something other
// than this geometry — the swimsuit hands in the whole t-shirt's extent, so
// that cutting an armhole or a deeper back out of the shell does not slide the
// stripes up it.
function bandedGeometry(geometry, baseColor, bands, bounds = null) {
  geometry.computeBoundingBox();
  const { min, max } = bounds ?? geometry.boundingBox;
  const span = (max.y - min.y) || 1;
  const position = geometry.attributes.position;
  const base = new THREE.Color(baseColor);
  const palette = bands.map(band => new THREE.Color(band.color));
  const colors = new Float32Array(position.count * 3);
  const tmp = new THREE.Color();
  for (let i = 0; i < position.count; i++) {
    const f = (position.getY(i) - min.y) / span;
    tmp.copy(base);
    bands.forEach(({ t0, t1, feather = 0.05 }, b) => {
      const rise = THREE.MathUtils.smoothstep(f, t0 - feather, t0);
      const fall = 1 - THREE.MathUtils.smoothstep(f, t1, t1 + feather);
      tmp.lerp(palette[b], Math.min(rise, fall));
    });
    colors[i * 3] = tmp.r; colors[i * 3 + 1] = tmp.g; colors[i * 3 + 2] = tmp.b;
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geometry;
}

// How much of a vertex is bound to the arm rather than the body: the sum of
// its skin weights on the arm chain. This is what tells a sleeve from a torso.
// Every geometric attempt at that boundary failed on the same fact — the parts
// overlap in every coordinate. A short sleeve's underside droops below the
// armpit, so it is lower than the shoulder and further from the arm's axis
// than the ribs are, and both a plane square to the arm and a cylinder about
// it end up either leaving a band of fabric hanging under the arm or slicing
// the flank of the suit off down to the hem. The rig already knows: the
// fabric over the arm rides the arm bones. Cutting on that puts the seam
// exactly where the deltoid meets the shoulder, which is where an armhole is,
// and it is the same boundary the bare-arm mesh under it is weighted to.
// Takes the geometry separately from the bones because the cropped copies keep
// their skin attributes, so the same question can be asked of a piece already
// cut out of the shirt.
function armWeight(bones, geometry) {
  const arm = new Set(bones
    .map((bone, index) => (/(upperarm|lowerarm|forearm|hand)/i.test(bone.name) ? index : -1))
    .filter(index => index >= 0));
  const skinIndex = geometry.attributes.skinIndex;
  const skinWeight = geometry.attributes.skinWeight;
  if (!arm.size || !skinIndex || !skinWeight) return null;
  return vertex => {
    let bound = 0;
    for (let c = 0; c < 4; c++) {
      if (arm.has(skinIndex.getComponent(vertex, c))) bound += skinWeight.getComponent(vertex, c);
    }
    return bound;
  };
}

// How far out the bare skin reaches, as a coarse cylindrical height map about
// the torso's axis: max radius per (height, bearing) cell over whatever body
// meshes are handed in. huggedGeometry uses it as a floor so a garment pulled
// onto the body stops at the body instead of sinking through it. Cells the
// skin does not reach are -Infinity and impose nothing, which is most of this
// torso — the pack has skin for the head, the neck and décolleté, the arms and
// the hands, and nothing at all between the collarbones and the hips.
const BODY_FLOOR_ROWS = 0.01;      // metres of height per cell
const BODY_FLOOR_COLS = 32;        // bearings around the axis
function bodyRadialFloor(meshes, axisZ) {
  const cells = new Map();
  const cell = (y, bearing) => `${Math.round(y / BODY_FLOOR_ROWS)}:${bearing}`;
  const bearingOf = (x, z) => Math.round(
    (Math.atan2(z, x) + Math.PI) / (2 * Math.PI) * BODY_FLOOR_COLS) % BODY_FLOOR_COLS;
  for (const mesh of meshes) {
    const position = mesh?.geometry?.attributes?.position;
    if (!position) continue;
    for (let i = 0; i < position.count; i++) {
      const x = position.getX(i), y = position.getY(i), z = position.getZ(i) - axisZ;
      const key = cell(y, bearingOf(x, z));
      const radius = Math.hypot(x, z);
      if (radius > (cells.get(key) ?? -Infinity)) cells.set(key, radius);
    }
  }
  // Read a cell and its neighbours, so a garment vertex between two cells is
  // held out by the taller of them rather than dropping into the gap.
  return (y, x, z) => {
    const bearing = bearingOf(x, z);
    let floor = -Infinity;
    for (let dy = -1; dy <= 1; dy++) {
      for (let db = -1; db <= 1; db++) {
        const key = cell(y + dy * BODY_FLOOR_ROWS, (bearing + db + BODY_FLOOR_COLS) % BODY_FLOOR_COLS);
        floor = Math.max(floor, cells.get(key) ?? -Infinity);
      }
    }
    return floor;
  };
}

// Where a bone sits in the geometry's own space, from the skeleton's bind
// matrices rather than the live pose: the wardrobe is cut from bind-pose
// geometry and has to measure against bind-pose bones.
function boneRestPoint(mesh, name) {
  const index = mesh?.skeleton?.bones?.findIndex(bone => bone.name === name) ?? -1;
  if (index < 0) return null;
  return new THREE.Vector3().setFromMatrixPosition(
    new THREE.Matrix4().copy(mesh.skeleton.boneInverses[index]).invert());
}

// The pack's own arm as a coarse cylindrical map about the upperarm's axis:
// max radius per (step along the arm, bearing about it). bodyRadialFloor asks
// how far out the skin is at a height on the torso; this asks the same about a
// limb, which is what the shoulder needs — over the deltoid the torso's own
// vertical axis runs nearly along the surface, so nothing measured against it
// says anything useful up there.
const ARM_FIELD_STEP = 0.02;    // metres along the arm per row
const ARM_FIELD_COLS = 16;      // bearings about its axis
const ARM_FIELD_REACH = 0.15;   // radius past which a vertex is the OTHER arm
function armSurfaceField(mesh, origin, dir) {
  const position = mesh?.geometry?.attributes?.position;
  if (!position) return null;
  const seed = Math.abs(dir.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
  const u = new THREE.Vector3().crossVectors(seed, dir).normalize();
  const v = new THREE.Vector3().crossVectors(dir, u).normalize();
  const bearingOf = (a, b) => (Math.round(
    (Math.atan2(b, a) + Math.PI) / (2 * Math.PI) * ARM_FIELD_COLS) % ARM_FIELD_COLS
    + ARM_FIELD_COLS) % ARM_FIELD_COLS;

  const rows = new Map();
  let first = Infinity, last = -Infinity;
  const point = new THREE.Vector3();
  for (let i = 0; i < position.count; i++) {
    point.fromBufferAttribute(position, i).sub(origin);
    const t = point.dot(dir);
    const a = point.dot(u), b = point.dot(v);
    const radius = Math.hypot(a, b);
    if (radius > ARM_FIELD_REACH) continue;   // the other arm, on the same mesh
    const row = Math.round(t / ARM_FIELD_STEP);
    if (!rows.has(row)) rows.set(row, new Array(ARM_FIELD_COLS).fill(-Infinity));
    const cells = rows.get(row);
    const bearing = bearingOf(a, b);
    if (radius > cells[bearing]) cells[bearing] = radius;
    first = Math.min(first, row);
    last = Math.max(last, row);
  }
  if (!rows.size) return null;

  // Fill in from the nearest bearing that has a sample: a 700-vertex arm
  // leaves holes in a 16-way bin, and a lookup that fell into one would
  // collapse that patch of the cap onto the bone.
  const table = [];
  for (let row = first; row <= last; row++) {
    const cells = rows.get(row) ?? table[table.length - 1]?.slice() ?? null;
    if (!cells) continue;
    for (let c = 0; c < ARM_FIELD_COLS; c++) {
      if (cells[c] > -Infinity) continue;
      for (let d = 1; d <= ARM_FIELD_COLS / 2; d++) {
        const near = Math.max(
          cells[(c + d) % ARM_FIELD_COLS],
          cells[(c - d + ARM_FIELD_COLS) % ARM_FIELD_COLS]);
        if (near > -Infinity) { cells[c] = near; break; }
      }
    }
    table.push(cells);
  }

  // Past either end the end row's profile stands: above the top ring that IS
  // the shoulder, carrying the arm's own girth up over the joint.
  //
  // The cell's own value, not the largest of it and its neighbours: reading a
  // neighbour overstates the radius wherever the arm tapers, and a shell told
  // the arm is fatter than it is comes back out through the skin as a flap.
  // Understating it only buries the shell deeper under a surface that is
  // already covering it.
  return (t, radial) => {
    const row = THREE.MathUtils.clamp(Math.round(t / ARM_FIELD_STEP) - first, 0, table.length - 1);
    return table[row][bearingOf(radial.dot(u), radial.dot(v))];
  };
}

// Shrinks a shell onto the arm it is skinned to: each vertex moves straight in
// toward the nearer upperarm's axis until it sits `inset` under that arm's own
// surface. Inward only — a vertex already under the skin is left alone. This is
// huggedGeometry's move about a limb instead of the torso, and the direction is
// the whole point: the sleeve stands off the arm all round, so pulling it to
// the torso's vertical axis (which is what the first fix for the shoulder did)
// slides it sideways across the deltoid rather than down onto it, and it comes
// out as a pale flap beside the arm instead of skin on it.
// `offsetBy` is where the vertex is wanted relative to that surface, in metres
// — positive outside it, negative under it — and `strengthBy` how much of the
// way there to go. Both take the vertex index, because the armhole needs them
// to vary along the seam: the garment's edge lands just outside the arm, the
// flesh cap leaves that same edge and dives under the skin a centimetre later,
// and the two are then the two ends of one funnel rather than two rims a
// centimetre apart with daylight between them.
function huggedToArm(geometry, sides, offsetBy = 0, strengthBy = null, renormalize = false) {
  const position = geometry.attributes.position;
  const offsetOf = typeof offsetBy === 'function' ? offsetBy : () => offsetBy;
  const point = new THREE.Vector3();
  const radial = new THREE.Vector3();
  for (let i = 0; i < position.count; i++) {
    point.fromBufferAttribute(position, i);
    const side = sides.find(s => s.sign * point.x >= 0) ?? sides[0];
    radial.copy(point).sub(side.origin);
    const t = radial.dot(side.dir);
    radial.addScaledVector(side.dir, -t);
    const radius = radial.length();
    if (radius < 1e-4) continue;
    const skin = side.field(t, radial);
    if (!(skin > -Infinity)) continue;
    const strength = strengthBy ? strengthBy(i) : 1;
    if (strength <= 0) continue;
    const target = radius - (radius - (skin + offsetOf(i))) * strength;
    if (radius <= target || target <= 0) continue;
    radial.multiplyScalar(target / radius);
    point.copy(side.origin).addScaledVector(side.dir, t).add(radial);
    position.setXYZ(i, point.x, point.y, point.z);
  }
  position.needsUpdate = true;
  if (renormalize) geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

// Takes a loose garment onto the body: every vertex moves straight in toward
// the torso's own vertical axis. A t-shirt hangs a centimetre or so off the
// ribs and that is exactly what makes the swimsuit built from one read as a
// t-shirt — the give at the waist, the sleeve standing off the arm. Radial is
// the right direction for it (a normal-wise shrink folds in on itself wherever
// the surface is concave, which is how the old flesh liner ended up surfacing
// through the black at the armpit), and it also means a second copy pulled in
// further is strictly inside the first, everywhere, which is what lets the
// skin of the scooped back sit behind the suit and stay there.
// `fade` is [outLow, inLow, inHigh, outHigh] in Y: full shrink between the two
// inner heights, none past the outer two, so the hem keeps its overlap with
// the briefs. `floor`, from bodyRadialFloor, is what stops the pull where the
// pack does have skin — the décolleté piece runs from the collarbones to the
// jaw, and an unclamped pull put the whole front of the suit behind it and
// left a flesh bib across the chest.
// `weightBy`, when given, scales the pull per vertex on top of the height
// taper — the skin's overhang into the armhole uses it to bury itself under
// the arm without dragging the rest of the piece in with it.
function huggedGeometry(geometry, amount, axisZ, fade, floor = null, clearance = 0, weightBy = null) {
  const position = geometry.attributes.position;
  const [outLow, inLow, inHigh, outHigh] = fade;
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i), y = position.getY(i), z = position.getZ(i) - axisZ;
    const radius = Math.hypot(x, z);
    if (radius < 1e-4) continue;
    const taper = Math.min(
      THREE.MathUtils.smoothstep(y, outLow, inLow),
      1 - THREE.MathUtils.smoothstep(y, inHigh, outHigh))
      * (weightBy ? weightBy(i) : 1);
    let pull = Math.min(amount * taper, radius * 0.5);
    if (floor) {
      const skin = floor(y, x, z);
      if (skin > -Infinity) pull = Math.min(pull, Math.max(0, radius - skin - clearance));
    }
    position.setXYZ(i, x - (x / radius) * pull, y, z + axisZ - (z / radius) * pull);
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
    this.sleepPlush = makeSleepPlush();
    this.poseRoot.add(this.sleepPlush);
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
    this.bodySkinMeshes = [];
    this.decolleteMesh = null;
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

  async load(gender, matFactory, manager, { deferAnimations = false } = {}) {
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
            if (part === 'tshirt') materials[index].side = THREE.DoubleSide;
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
            // Every bare-skin piece, for the swimsuit's fit: it is pulled onto
            // the body and has to stop where the body is, and the pack's skin
            // comes in several meshes — the décolleté one between the
            // collarbones and the jaw is the one the suit runs into.
            if (o.isSkinnedMesh && !this.bodySkinMeshes.includes(o)) this.bodySkinMeshes.push(o);
            // The bare-arm skin, kept apart so long sleeves can retire it: it
            // is weighted to the twist bones the sleeve ignores, so left on it
            // punches through the cloth as the elbow rotates. Everything of it
            // that is not sleeve-covered is under the t-shirt anyway.
            const skeleton = o.isSkinnedMesh ? o.skeleton.bones.map(b => b.name) : [];
            if (skeleton.includes('upperarm_l') && skeleton.includes('hand_l')) this.armsMesh = o;
            if (o.isSkinnedMesh && o.name.includes('Parts07')) this.decolleteMesh = o;
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
    // Prevent inner skin poke-through during animation strides.
    // The décolleté mesh extends deep into the chest below the collar (Y < 1.50),
    // and the arms mesh extends up into the shoulder and armpit inside the sleeve (Y > 1.34).
    // In motion, bone rotations swing these covered skin vertices outside the clothing fabric.
    if (this.decolleteMesh) {
      this.decolleteMesh.geometry = croppedGeometry(
        this.decolleteMesh.geometry, 1.50, { axis: 'y', keep: 1, standoff: false }
      );
    }
    if (this.armsMesh) {
      this.armsMesh.geometry = croppedGeometry(
        this.armsMesh.geometry, 1.34, { axis: 'y', keep: -1, standoff: false }
      );
    }
    if (this.clothing.tshirt.mesh) {
      const mats = Array.isArray(this.clothing.tshirt.mesh.material)
        ? this.clothing.tshirt.mesh.material
        : [this.clothing.tshirt.mesh.material];
      mats.forEach(m => { if (m) m.side = THREE.DoubleSide; });
    }
    this.setOutfit();
    this.seatHipRise = this.measureSeatHipRise();
    this.mixer = new THREE.AnimationMixer(this.model);

    const loadAnimations = async () => {
      // These files are independent. Loading them one after another made a
      // cold start pay ten network/decode round trips before showing a map.
      const loaded = await Promise.all(Object.entries(TRAVERSAL_CLIPS).map(async ([key, file]) => {
        const g = await loader.loadAsync(`./chars/anims/${file}.glb`);
        const clip = g.animations[0];
        if (!clip) { console.warn('no anim in', file); return [key, null]; }
        cleanClip(clip);
        if (STRIP_PELVIS_POS.has(key))
          clip.tracks = clip.tracks.filter(t => t.name !== 'pelvis.position');
        return [key, clip];
      }));
      const clips = Object.fromEntries(loaded.filter(([, clip]) => clip));
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
    };
    if (deferAnimations) {
      // Start the independent requests now, but do not keep the importing map
      // waiting for their decode before it can publish its start function.
      this.animationsReady = loadAnimations();
      this.animationsReady.catch(error => console.warn('[player] animations', error));
    } else {
      this.animationsReady = loadAnimations();
      await this.animationsReady;
    }
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
      side: THREE.DoubleSide,
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

    // --- Level 07 bedroom sleep set: brushed-jersey pyjamas -----------------
    // Warm ivory with a breath of pink in it. Not the tee's near-white: the
    // apartment's cove lighting is pink, paper white clips under it, and a
    // white top would read as the street t-shirt recoloured rather than as a
    // change of clothes.
    const PYJAMA_CLOTH = 0xe6c6c4;
    // The trousers a shade deeper than the top. A matching set really is one
    // colour, but on a model the separation comes from the hem shadow, and a
    // single tone fused the two pieces into one bodysuit from across the room.
    const PYJAMA_CLOTH_LOWER = 0xdbb8b7;
    // Ivory contrast piping at the collar, the placket, the cuffs, the waist
    // and the ankles — the finish every cosy flannel set in the reference
    // shares, and the thing that reads as "pyjama" at any distance. It runs
    // lighter than the cloth, not darker: a darker band reads as wear.
    const PYJAMA_PIPING = 0xfffaf2;
    const pyjamaKnit = knitMaps(20913);
    /**
     * One knit material per piece. They cannot share a material because the
     * repeat lives on the texture, and the sleeves' loft hands back a 0..1
     * wrap while the two shells are projected in metres. `metresU`/`metresV`
     * is how much fabric that piece's 0..1 UV square covers — 1 for anything
     * already projected in metres.
     */
    const pyjamaKnitMaterial = (metresU, metresV = metresU) => {
      const maps = {};
      for (const [slot, source] of Object.entries(pyjamaKnit)) {
        const texture = source.clone();
        texture.needsUpdate = true;
        texture.repeat.set(metresU / KNIT_TILE_M, metresV / KNIT_TILE_M);
        maps[slot] = texture;
      }
      return new THREE.MeshStandardMaterial({
        ...maps,
        color: 0xffffff,          // the cloth colour rides in the vertex colours
        vertexColors: true,
        // Brushed jersey: matte, but the normal map needs somewhere to show, so
        // this sits under the 0.97 a flat fleece wanted and lets the roughness
        // map carve the rest.
        roughness: 0.88,
        metalness: 0.0,
        normalScale: new THREE.Vector2(0.85, 0.85),
        side: THREE.DoubleSide,
      });
    };

    // Long sleeves and full-length trousers, which is exactly what separates a
    // pyjama from the silk sleep set above. The top is the tee shell pushed out
    // at the hem only, by more than the trousers' own standoff below: left flush
    // it sank under the inflated waistband and showed a bright wedge of its
    // inside face at the hip. The ramp is back to zero well under the armpit,
    // because a shell inflated all over puts the tee's short sleeve out through
    // the lofted long sleeve that covers it.
    const pyjamaTop = tshirt
      ? this.createSkinnedClone(
        tshirt,
        bandedGeometry(
          cylindricalGarmentUv(
            fittedShirtRear(
              hemInflatedGeometry(tshirt.geometry.clone(), VEST_STANDOFF),
            ),
            { radius: 0.155 },
          ),
          PYJAMA_CLOTH,
          [
            { t0: 0.938, t1: 1.0, color: PYJAMA_PIPING, feather: 0.016 },  // collar
            { t0: 0.0, t1: 0.05, color: PYJAMA_PIPING, feather: 0.018 },   // hem
          ],
        ),
        pyjamaKnitMaterial(1),
        'Wardrobe_PyjamaTop'
      )
      : null;
    if (pyjamaTop) plackedGeometry(pyjamaTop.geometry, PYJAMA_PIPING, { radius: 0.155, halfWidth: 0.033 });

    const pyjamaSleeves = buildSleeves(this.model, pyjamaKnitMaterial(0.13, 0.55));
    if (pyjamaSleeves) {
      // buildSleeves names every pair it makes 'Wardrobe_Sleeves'; this one has
      // to be tellable from the tee's pair when reading the scene graph.
      pyjamaSleeves.name = 'Wardrobe_PyjamaSleeves';
      tuckedSleeveCap(pyjamaSleeves.geometry);
      // The loft runs shoulder-down in the bind pose, so the wrist really is
      // the bottom of its bounding box and the cuff can be banded by height
      // like the rest of the set. Both arms are one geometry and share that
      // extent, so one band does the pair.
      bandedGeometry(pyjamaSleeves.geometry, PYJAMA_CLOTH,
        [{ t0: 0.0, t1: 0.07, color: PYJAMA_PIPING, feather: 0.025 }]);
    }

    // Plush slippers, worn with the set.
    //
    // They also settle the bare foot: the rig is driven from the pelvis, so the
    // idle's knee bend pushes the feet DOWN rather than lowering the hips, and
    // the lofted foot ends up two to three centimetres under the floor. The
    // floor then cuts the toes off and what is left reads as a stump — which is
    // what made the bare foot look like it was on backwards from the front.
    // A slipper puts a plush upper over the whole of that, so what meets the
    // floor is a sole, which is what a sole is for.
    //
    // Built on the pack's own shoe. Cutting the bare foot off below the ankle
    // and inflating it was the obvious route and it failed: the foot carries
    // five separately lofted toes, and pushing them out along their normals
    // makes neighbours cross, which showed as a thin blade of geometry sticking
    // out of each toe box. The shoe is a single closed last — no toes to
    // intersect — already skinned to the same bones and already fitted.
    const packShoes = this.clothing.shoes.mesh;
    const pyjamaSlippers = packShoes
      ? this.createSkinnedClone(
        packShoes,
        bandedGeometry(
          // A few millimetres out, so the lofted bare foot inside — graded to a
          // real circumference, unlike the pack's own — stays under it.
          inflatedGeometry(packShoes.geometry.clone(), PYJAMA_SLIPPER_LOFT),
          PYJAMA_CLOTH_LOWER,
          [
            { t0: 0.78, t1: 1.0, color: PYJAMA_PIPING, feather: 0.07 },  // fleece collar
            { t0: 0.0, t1: 0.14, color: 0xc9a59d, feather: 0.05 },       // sole
          ],
        ),
        pyjamaKnitMaterial(0.9),
        'Wardrobe_PyjamaSlippers'
      )
      : null;

    // The trousers take the zoo's standoff for the zoo's reason: the lofted
    // bare legs are underneath — they are what puts bare feet under the hem —
    // and the pack's trousers only clear the knee by a couple of millimetres.
    const pyjamaPants = pants
      ? this.createSkinnedClone(
        pants,
        bandedGeometry(
          cylindricalGarmentUv(
            // Tapered first, then projected, so the coordinates describe the
            // surface the cloth ends up on. The taper starts BELOW the knee and
            // the standoff stays at its full value: the kneecap and the
            // condyles stand about 4 mm proud of the lofted leg's profile on
            // their own, and a first pass that slimmed from mid-thigh with a
            // 10 mm standoff put bare skin through both knees. Everything a
            // baggy trouser shows is in the calf and the ankle anyway.
            taperedLegs(
              tailoredTrouserSeat(inflatedGeometry(
                croppedGeometry(pants.geometry, PYJAMA_ANKLE_HEM),
                TROUSER_STANDOFF,
              )),
              // Fractions are of the shell's own height, and cropping the hem
              // at the ankle raised its floor — 0.4 used to land below the knee
              // and now lands on it, which pulled the cloth inside the lofted
              // leg and put a patch of bare skin through the trouser.
              { from: 0.30, amount: 0.028 },
            ),
            { radius: 0.105, splitLegs: true },
          ),
          PYJAMA_CLOTH_LOWER,
          [
            { t0: 0.928, t1: 1.0, color: PYJAMA_PIPING, feather: 0.014 },  // waistband
            { t0: 0.0, t1: 0.055, color: PYJAMA_PIPING, feather: 0.016 },  // ankle hems
          ],
        ),
        pyjamaKnitMaterial(1),
        'Wardrobe_PyjamaPants'
      )
      : null;

    // --- Black One-Piece Swimsuit (Maillot de bain une pièce noir) ----------
    const blackSwimMaterial = new THREE.MeshStandardMaterial({
      color: 0x0f0f12,
      roughness: 0.28,
      metalness: 0.12,
      side: THREE.DoubleSide,
    });

    // A dark red band above the hip, running the full ring of the shell —
    // the classic lifeguard-suit accent. Painted as vertex colour on the
    // TOP piece, not the shorts below it: the shell's own hem is what a
    // front-on view actually shows at hip height (its lowest reach, ≈ y
    // 0.974, is only 3 mm under the hip joint, so it covers the shorts'
    // waistband from every angle a camera on this ship can reach). A band
    // painted on the shorts therefore hid under the shell from the front and
    // only showed from directly behind — and read as trim on a pair of
    // shorts peeking out under a plain top, not as part of the swimsuit.
    // Binning this mesh's vertices by angle round the torso put the shell's
    // hem between y 0.974 (front) and 1.027 (the high side); anything above
    // 1.03 is inside the shell everywhere on the ring, so the band sits
    // there — just above the hip line, on the piece the eye reads as "the
    // swimsuit".
    const swimStripeMaterial = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      vertexColors: true,
      roughness: 0.28,
      metalness: 0.12,
      side: THREE.DoubleSide,
    });

    // Flesh for the scooped back to open onto. The body's roughness, not the
    // lofted legs' 0.66: the pack's own arm is right beside it at the shoulder
    // and a glossier back reads as a different material from two feet away.
    const swimBackSkinMaterial = new THREE.MeshStandardMaterial({
      color: 0xd3a189,
      roughness: this.bodyMaterial?.roughness ?? 0.92,
      metalness: 0,
      side: THREE.DoubleSide,
    });

    let swimsuitTop = null;
    let swimsuitBack = null;
    let swimsuitArms = null;
    // The shell is still cut out of the t-shirt — it is the only garment in the
    // pack skinned to this torso — but nothing else about it is the tee any
    // more. Three things had to change together, because fixing any one of them
    // alone showed up the other two:
    //
    // 1. THE ARMHOLE. It used to be a vertical plane at 0.72 of the half-width,
    //    which is not where an armhole is. It left the sleeve's cap on as a
    //    loose tube of fabric standing off the arm, and once the back opened
    //    you looked straight down the inside of it: the black hole over the
    //    upper arm. It is cut on the vertex's own arm weight now, at the
    //    deltoid's crease — see armWeight, which also records why none of the
    //    geometric versions of this seam survived contact with the mesh.
    // 2. THE FIT. A t-shirt hangs off the body and a swimsuit does not. Every
    //    piece is pulled in toward the torso's axis by SWIMSUIT_HUG, which is
    //    what turns the silhouette from "black tee" into "maillot".
    // 3. THE BACK SKIN. The pack has no torso, only arms, so the scoop needs a
    //    back painted in. It is the same shell pulled in a few millimetres
    //    further — and because both are pulled along the same radial, it is
    //    inside the suit everywhere by construction. The previous liner was
    //    offset along the surface normals instead, and an eighth of the tee's
    //    normals point inward (the armpit and the underside of the sleeve are
    //    concave), which is how it used to surface through the black.
    const SWIMSUIT_HUG = 0.012;
    const SWIMSUIT_SKIN_GAP = 0.004;   // suit thickness: how far the skin sits inside it
    const SWIMSUIT_CLEARANCE = 0.006;  // how far the suit stays off the pack's own skin
    // Where the armhole seam falls on the weight ramp from body to arm. Half is
    // the deltoid's own crease; lower cuts a wider opening, higher leaves a cap.
    const ARMHOLE_WEIGHT = 0.5;
    // The skin under the suit takes the SAME armhole, exactly. Letting it run
    // even a little further onto the arm — the first attempt at closing the
    // gap at the shoulder, before it turned out the gap was between the suit's
    // hugged flank and the arm and the skin's job was to be a whole ring —
    // stood it off the deltoid as a pale flap. The weight ramp across the
    // shoulder is gradual, so a fifth of a step in it is centimetres of
    // geometry, and pulling that back in does not help: the pull runs to the
    // torso's vertical axis, so over the top of the arm it slides the skin
    // sideways rather than into it. Cut on the same line the skin cannot get
    // out, and the four millimetres it sits inside show as a rim of flesh
    // inside the armhole, which is what an armhole looks like.
    const ARMHOLE_SKIN_OVERHANG = 0;
    // How far under the arm's own surface the shoulder cap sits: enough that
    // the two never trade places on a curve, little enough that the step where
    // the cap takes over from the arm mesh is not a visible ledge.
    const ARM_CAP_INSET = 0.003;
    // How far down the arm the cap runs, along the upperarm's axis. It only has
    // to reach past the arm mesh's top ring — about 8 cm down — with enough
    // overlap to hide the join. Kept to the sleeve's full length instead, the
    // far end of it fights the arm: the profile it is shrunk onto is 16 bearings
    // wide and reads the local maximum, so on the taper below the deltoid the
    // cap lands a millimetre proud of the skin and shows as a flap of it.
    const ARM_CAP_REACH = 0.18;
    // How far past the seam the cap takes to land on the arm, in the same arm
    // weight the seam is cut on. Not zero: at the seam itself the cap has to BE
    // the garment's edge, out on the shirt's surface, or the two are concentric
    // rims a centimetre apart and the slot between them is a hole you see the
    // sea through — which is what was left of this bug once the top of the arm
    // had skin on it at all.
    const ARM_CAP_LAND = 0.18;
    const SWIMSUIT_STRIPE = [0.09, 0.20];
    // The pink runs the ring at strap height: over both shoulders and straight
    // across the upper chest between them. Both stripes are measured against
    // the whole tee, not the cut shell, so re-cutting either opening does not
    // slide them.
    const SWIMSUIT_SHOULDER = [0.79, 0.90];
    // Scooped back: normalised height plus a lean toward the back, above
    // SCOOP_AT, and only between the straps. The bound on x is the whole point.
    // The first cut of this leaned on an x² term to lift the seam off the
    // shoulders instead, which works while the strap is the width of a t-shirt
    // sleeve and shreds it the moment the armhole narrows it — a seam wandering
    // across a strap six centimetres wide, on a mesh this coarse, comes out as
    // a row of holes. Held off the strap by a hard bound, the opening is a
    // clean U and the strap is bounded only by seams that are meant to touch
    // it: the armhole outside, the neckline in front.
    const SCOOP_LEAN = 0.55;    // how much of the cut is "aft" rather than "up"
    const SCOOP_AT = 0.898;
    const SCOOP_STRAP = 0.115;  // half-width of the opening: the straps' inner edge
    // …and it has to be told it is a BACK. The lean keeps it off the chest but
    // not off the neckline, where the front of the collar comes back to the
    // body's own axis and so scores the same as the nape: without this the
    // opening ate the front of the neck too and the skin behind it came
    // through as a bib.
    const SCOOP_BEHIND = 0.02;  // opening starts this far aft of the shoulder line
    // Where the hug is allowed to bite, in Y: the bare torso only. It is out
    // by the hem, which would otherwise let the briefs out from under the
    // suit, and out again by the collarbones — above that is the pack's
    // décolleté mesh, and the tee is only a few millimetres clear of it, so
    // any pull at all there puts the suit behind skin. That was the flesh bib
    // across the chest, and clamping the pull against a map of the skin only
    // turned it into a rash of speckles wherever the map read a millimetre
    // low. Below the collarbones there is no skin at all — the pack has none
    // between there and the hips — so the pull is free, and that is the half
    // of the torso the silhouette is read from anyway.
    const HUG_FADE = [0.99, 1.08, 1.32, 1.42];
    const HUG_ALWAYS = [-1e3, -1e3, 1e3, 1e3];   // no fade: the skin's own offset
    if (tshirt) {
      tshirt.geometry.computeBoundingBox();
      const bb = tshirt.geometry.boundingBox;
      const spanY = (bb.max.y - bb.min.y) || 1;
      const halfDepth = Math.max(Math.abs(bb.min.z), Math.abs(bb.max.z)) || 1;
      const axisZ = 0.5 * (bb.min.z + bb.max.z);

      const scoop = (x, y, z) => Math.min(
        (y - bb.min.y) / spanY
        - SCOOP_LEAN * ((z - axisZ) / halfDepth)
        - SCOOP_AT,
        SCOOP_STRAP - Math.abs(x),
        axisZ - SCOOP_BEHIND - z);

      // Positive inside the sleeve, so `keep: -1` takes the sleeve off.
      const bones = tshirt.skeleton?.bones ?? [];
      const bound = armWeight(bones, tshirt.geometry);
      const sleeve = bound && ((x, y, z, vertex) => bound(vertex) - ARMHOLE_WEIGHT);

      // The sleeve comes off both pieces; only the suit gets the back scooped
      // out of it, because the skin's whole job is to be there where the suit
      // is not. The skin keeps its armhole a little further out than the suit
      // does — a seam cut in exactly the same place leaves the shell's hollow
      // interior showing in the gap between the suit's edge and the arm, which
      // from behind the shoulder is a dark slot where the deltoid should be.
      // The overhang is under the arm mesh, and pulled in behind it, so it
      // plugs the slot without ever being the surface you see.
      const armholed = (at = 0) => (sleeve
        ? croppedGeometry(tshirt.geometry, at, { axis: sleeve, keep: -1, standoff: false })
        : croppedGeometry(tshirt.geometry, bb.max.y + 1, { axis: 'y', keep: -1, standoff: false }));

      // Everything of the pack's own skin that the suit can reach: the
      // décolleté piece and the neck are the ones that matter, the arms and
      // hands cost nothing to include and keep the seam honest at the armhole.
      const skinFloor = bodyRadialFloor([this.headMesh, ...this.bodySkinMeshes], axisZ);

      // The arm, measured: origin and axis of each upperarm plus that arm's own
      // radius per step and bearing about it. Everything the armhole does is
      // said against this rather than the torso's vertical axis, which over the
      // deltoid runs nearly along the surface and so says nothing useful there.
      const armSides = ['l', 'r'].map(side => {
        const from = boneRestPoint(tshirt, `upperarm_${side}`);
        const to = boneRestPoint(tshirt, `lowerarm_${side}`);
        if (!from || !to) return null;
        const dir = to.clone().sub(from).normalize();
        const field = armSurfaceField(this.armsMesh, from, dir);
        return field && { origin: from, dir, field, sign: Math.sign(from.x) || 1 };
      }).filter(Boolean);
      const onArm = sleeve && armSides.length;

      // Distance down the nearer arm's own axis, for the cap's lower hem.
      const alongArm = (x, y, z) => {
        const side = armSides.find(s => s.sign * x >= 0) ?? armSides[0];
        return new THREE.Vector3(x, y, z).sub(side.origin).dot(side.dir);
      };

      // The torso hug lets go at the armhole and the arm takes over. Pulling
      // toward the torso's vertical axis is the right move over the ribs and
      // the wrong one at the seam: there it runs sideways INTO the arm, and a
      // centimetre of it buries the suit's edge inside the deltoid, where it
      // comes back out as a black band painted round the upper arm. Simply
      // stopping the pull is not enough either — the seam is cut on the shirt's
      // own sleeve, which stands a centimetre off the arm all round, so the
      // edge then rings the arm without touching it and the armhole is a pale
      // porthole onto the liner. So the last of the pull is handed over: from
      // ARM_HUG_START on, each piece closes on the ARM instead, and lands
      // where it belongs relative to that arm's surface.
      const ARM_HUG_START = 0.30;
      const SUIT_ARM_CLEARANCE = 0.002;   // the suit's edge, just off the skin
      const LINER_ARM_INSET = -0.002;     // the liner, just under it
      const weightsOf = geometry => armWeight(bones, geometry);
      const towardTorso = bound => bound && (i => 1 - THREE.MathUtils.smoothstep(
        bound(i), ARM_HUG_START, ARMHOLE_WEIGHT));
      const towardArm = bound => bound && (i => THREE.MathUtils.smoothstep(
        bound(i), ARM_HUG_START, ARMHOLE_WEIGHT));

      const suitShell = croppedGeometry(armholed(), 0, { axis: scoop, keep: -1, standoff: false });
      const linerShell = armholed(ARMHOLE_SKIN_OVERHANG);
      const suitBound = weightsOf(suitShell);
      const linerBound = weightsOf(linerShell);

      const onto = (shell, bound, offset) => (onArm
        ? huggedToArm(shell, armSides, offset, towardArm(bound))
        : shell);

      swimsuitTop = this.createSkinnedClone(
        tshirt,
        bandedGeometry(
          onto(huggedGeometry(
            suitShell,
            SWIMSUIT_HUG, axisZ, HUG_FADE, skinFloor, SWIMSUIT_CLEARANCE,
            towardTorso(suitBound)), suitBound, SUIT_ARM_CLEARANCE),
          0x0f0f12,
          [
            { color: 0x6e0f16, t0: SWIMSUIT_STRIPE[0], t1: SWIMSUIT_STRIPE[1], feather: 0.02 },
            { color: 0xe0559a, t0: SWIMSUIT_SHOULDER[0], t1: SWIMSUIT_SHOULDER[1], feather: 0.018 },
          ],
          bb
        ),
        swimStripeMaterial,
        'Wardrobe_SwimsuitTop');

      // The skin under the suit: the same shell with the scoop NOT taken out
      // of it, which is what shows through the scooped back.
      //
      // It is the whole ring, not just the back. Cut off at the front it left
      // a slot open all the way round each armhole — the suit's seam sits on
      // the t-shirt's surface and the arm's skin is a centimetre inside that,
      // so between the two you saw daylight from anywhere in front. Carried
      // round the front the skin bridges that centimetre; everywhere it is not
      // needed it is a flesh liner a few millimetres inside an opaque suit,
      // which costs a few hundred triangles and is never seen.
      //
      // It takes the suit's own hug first and then a second pull of its
      // thickness, and that second one is deliberately NOT faded. Fading it
      // like the first made the two coincide everywhere the hug had tapered
      // out — the shoulders and the upper back, which is precisely where the
      // skin is meant to show through — and two identical surfaces in the same
      // place come out as a staircase of z-fighting.
      swimsuitBack = this.createSkinnedClone(
        tshirt,
        onto(huggedGeometry(
          huggedGeometry(
            linerShell,
            SWIMSUIT_HUG, axisZ, HUG_FADE, skinFloor, SWIMSUIT_CLEARANCE,
            towardTorso(linerBound)),
          SWIMSUIT_SKIN_GAP, axisZ, HUG_ALWAYS), linerBound, LINER_ARM_INSET),
        swimBackSkinMaterial, 'Wardrobe_SwimsuitBack');

      // The deltoid cap: skin for the shoulder the armhole opens onto. The
      // pack's arm mesh stops about 8 cm down the upperarm — under the shirt it
      // ships with, the sleeve covers everything above that — so cutting the
      // sleeve off at the armhole leaves the top of the arm as a hole with the
      // sky behind it. The cap is that discarded sleeve, kept as flesh and
      // shrunk onto the arm: buried under the skin wherever the arm mesh
      // reaches, and carrying the arm's own girth up over the joint where it
      // does not. It shares the suit's seam exactly — same field, same level,
      // opposite side — so the two meet with nothing between them.
      if (onArm) {
        // `sleeve` already subtracts ARMHOLE_WEIGHT: its zero contour is
        // the suit's armhole, and the cap must keep the opposite side.
        const capShell = croppedGeometry(
          croppedGeometry(tshirt.geometry, 0,
            { axis: sleeve, keep: 1, standoff: false }),
          ARM_CAP_REACH, { axis: alongArm, keep: -1, standoff: false });
        const capBound = weightsOf(capShell);
        // It starts where the suit's edge ends — same clearance off the arm at
        // the seam — and is under the skin ARM_CAP_LAND of weight later.
        const capOffset = capBound && (i => THREE.MathUtils.lerp(
          SUIT_ARM_CLEARANCE, -ARM_CAP_INSET,
          THREE.MathUtils.smoothstep(capBound(i), ARMHOLE_WEIGHT, ARMHOLE_WEIGHT + ARM_CAP_LAND)));
        swimsuitArms = this.createSkinnedClone(
          tshirt,
          huggedToArm(capShell, armSides, capOffset ?? -ARM_CAP_INSET, null, true),
          swimBackSkinMaterial, 'Wardrobe_SwimsuitArms');
      }
    }

    const SWIMSUIT_HEM = 0.81;
    const swimsuitBottom = pants
      ? this.createSkinnedClone(
        pants,
        croppedGeometry(pants.geometry, SWIMSUIT_HEM),
        blackSwimMaterial,
        'Wardrobe_SwimsuitBottom'
      )
      : null;

    const casinoTopMaterial = new THREE.MeshStandardMaterial({
      color: 0x18181c,
      roughness: 0.32,
      metalness: 0.08,
      side: THREE.DoubleSide,
    });
    const casinoPantsMaterial = new THREE.MeshStandardMaterial({
      color: 0x121318,
      roughness: 0.48,
      metalness: 0.04,
      side: THREE.DoubleSide,
    });
    const casinoShoesMaterial = new THREE.MeshStandardMaterial({
      color: 0x0c0c10,
      roughness: 0.15,
      metalness: 0.22,
    });
    const casinoGoldMaterial = new THREE.MeshStandardMaterial({
      color: 0xe8c063,
      roughness: 0.22,
      metalness: 0.85,
    });
    const casinoGemMaterial = new THREE.MeshStandardMaterial({
      color: 0x00e676,
      roughness: 0.1,
      metalness: 0.1,
      emissive: 0x005522,
      emissiveIntensity: 0.4,
    });

    const casinoSleeves = buildSleeves(this.model, casinoTopMaterial);
    const casinoTop = tshirt
      ? this.createSkinnedClone(tshirt, tshirt.geometry, casinoTopMaterial, 'Wardrobe_CasinoTop')
      : null;
    const casinoPants = pants
      ? this.createSkinnedClone(pants, pants.geometry, casinoPantsMaterial, 'Wardrobe_CasinoPants')
      : null;
    const shoes = this.clothing.shoes.mesh;
    const casinoShoes = shoes
      ? this.createSkinnedClone(shoes, shoes.geometry, casinoShoesMaterial, 'Wardrobe_CasinoShoes')
      : null;

    const casinoJewelryGroup = new THREE.Group();
    casinoJewelryGroup.name = 'Wardrobe_CasinoJewelry';
    if (this.bones.neck_01) {
      const chokerGeo = new THREE.TorusGeometry(0.085, 0.007, 8, 24);
      chokerGeo.rotateX(Math.PI / 2);
      const choker = new THREE.Mesh(chokerGeo, casinoGoldMaterial);
      choker.position.set(0, 0.02, 0.01);
      const gemGeo = new THREE.SphereGeometry(0.016, 8, 8);
      gemGeo.scale(1, 1.4, 0.8);
      const gem = new THREE.Mesh(gemGeo, casinoGemMaterial);
      gem.position.set(0, -0.015, 0.09);
      choker.add(gem);
      const gemMount = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.006, 8), casinoGoldMaterial);
      gemMount.position.set(0, -0.005, 0.088);
      choker.add(gemMount);
      this.bones.neck_01.add(choker);
      casinoJewelryGroup.userData.choker = choker;
    }
    if (this.bones.lowerarm_l) {
      const bangleGeo = new THREE.TorusGeometry(0.042, 0.006, 8, 20);
      bangleGeo.rotateX(Math.PI / 2);
      const bangle = new THREE.Mesh(bangleGeo, casinoGoldMaterial);
      bangle.position.set(0, -0.18, 0);
      this.bones.lowerarm_l.add(bangle);
      casinoJewelryGroup.userData.bangle = bangle;
    }

    const casinoLooseHairGroup = new THREE.Group();
    casinoLooseHairGroup.name = 'Wardrobe_CasinoLooseHair';
    casinoLooseHairGroup.visible = false;
    if (this.bones.head) {
      // Une mèche est mate et sombre, avec juste ce qu'il faut de violet pour
      // répondre aux mèches teintes de l'atlas. L'émissif fort et le métal qu'il y
      // avait ici allumaient les rubans de l'intérieur: à côté des cartes de
      // cheveux du pack, qui ne renvoient que la lumière de la salle, ça ne lisait
      // pas comme des cheveux mais comme du plastique.
      const lockMat = new THREE.MeshStandardMaterial({
        color: 0x2a1630,
        emissive: 0x4a1170,
        emissiveIntensity: 0.12,
        roughness: 0.78,
        metalness: 0,
        side: THREE.DoubleSide,
      });

      function buildHairRibbon(pts, widthTop = 0.032, widthBot = 0.012, segs = 8) {
        const curve = new THREE.CatmullRomCurve3(pts);
        const curvePts = curve.getPoints(segs);
        const pos = [], uv = [], idx = [];
        for (let i = 0; i <= segs; i++) {
          const p = curvePts[i];
          const u = i / segs;
          const w = widthTop * (1 - u) + widthBot * u;
          const tan = i < segs ? curvePts[i + 1].clone().sub(p).normalize() : curvePts[i].clone().sub(curvePts[i - 1]).normalize();
          let binorm = new THREE.Vector3(-tan.z, 0, tan.x).normalize();
          if (binorm.lengthSq() < 0.1) binorm.set(1, 0, 0);

          pos.push(p.x - binorm.x * w, p.y, p.z - binorm.z * w);
          uv.push(0, u);
          pos.push(p.x + binorm.x * w, p.y, p.z + binorm.z * w);
          uv.push(1, u);

          if (i < segs) {
            const a = i * 2, b = i * 2 + 1, c = (i + 1) * 2, d = (i + 1) * 2 + 1;
            idx.push(a, b, c, b, d, c);
          }
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
        geo.setIndex(idx);
        geo.computeVertexNormals();
        return new THREE.Mesh(geo, lockMat);
      }

      // Les points sont en mètres, depuis l'origine de l'os `head` — qui est en bas
      // du crâne, à hauteur de mâchoire, pas au sommet: le haut du crâne est vers
      // y = +0.20, la tempe vers +0.11, la mâchoire vers 0, la clavicule vers -0.18.
      // Les mèches partaient d'y = +0.05 et descendaient à -0.22, c'est-à-dire de la
      // pommette au milieu du buste, en travers du visage.
      //
      // Deux choses les font lire comme des cheveux plutôt que comme des rubans
      // pendus. Le premier point est haut ET rentré contre le crâne, sous les cartes
      // de la coiffure: une mèche part de la masse, elle ne commence pas en l'air à
      // côté de l'oreille. Et la pointe se ferme presque complètement — un ruban qui
      // s'arrête net sur 8 mm de large se voit, une mèche s'effile.

      // Mèche avant gauche: naît au-dessus de l'oreille, passe devant, tombe à l'épaule
      casinoLooseHairGroup.add(buildHairRibbon([
        new THREE.Vector3(-0.062, 0.150, -0.005),
        new THREE.Vector3(-0.078, 0.060, 0.028),
        new THREE.Vector3(-0.084, -0.045, 0.050),
        new THREE.Vector3(-0.078, -0.155, 0.048),
      ], 0.010, 0.0012));

      // Mèche avant droite
      casinoLooseHairGroup.add(buildHairRibbon([
        new THREE.Vector3(0.062, 0.150, -0.005),
        new THREE.Vector3(0.078, 0.060, 0.028),
        new THREE.Vector3(0.084, -0.045, 0.050),
        new THREE.Vector3(0.078, -0.155, 0.048),
      ], 0.010, 0.0012));

      // Mèches latérales, en arrière de l'oreille, tombant vers l'épaule
      casinoLooseHairGroup.add(buildHairRibbon([
        new THREE.Vector3(-0.058, 0.160, -0.035),
        new THREE.Vector3(-0.086, 0.045, -0.028),
        new THREE.Vector3(-0.096, -0.070, -0.008),
      ], 0.009, 0.0010));

      casinoLooseHairGroup.add(buildHairRibbon([
        new THREE.Vector3(0.058, 0.160, -0.035),
        new THREE.Vector3(0.086, 0.045, -0.028),
        new THREE.Vector3(0.096, -0.070, -0.008),
      ], 0.009, 0.0010));

      // Les courbes ci-dessus sont écrites dans le repère du personnage: Y vers le
      // haut, -Y le long de la joue, +Z devant. L'os `head` ne travaille pas dans
      // ce repère — c'est un rig à axe d'os, son +X local sort du crâne et son +Y
      // regarde devant — donc telles quelles les mèches sortaient à plat sur les
      // côtés du visage au lieu de tomber. On oriente le groupe pour annuler
      // l'écart entre les deux repères: dedans, Y est de nouveau la verticale.
      this.model.updateMatrixWorld(true);
      const headQuaternion = this.bones.head.getWorldQuaternion(new THREE.Quaternion());
      const modelQuaternion = this.model.getWorldQuaternion(new THREE.Quaternion());
      casinoLooseHairGroup.quaternion.copy(headQuaternion.invert().multiply(modelQuaternion));
      this.bones.head.add(casinoLooseHairGroup);
    }

    let kimonoParts = [];
    try { kimonoParts = buildKimono(this.model) ?? []; }
    catch (err) { console.warn('[wardrobe] kimono', err); }

    this.wardrobe = {
      sleeves, swimLegs, swimShorts, nightTop, nightShorts,
      pyjamaTop, pyjamaSleeves, pyjamaPants, pyjamaSlippers,
      denimShorts, flipFlops, vest, zooTrousers, hairCrown: null,
      swimsuitTop, swimsuitBottom, swimsuitBack, swimsuitArms,
      kimonoParts,
      casinoTop, casinoPants, casinoShoes, casinoSleeves, casinoJewelry: casinoJewelryGroup,
      casinoLooseHair: casinoLooseHairGroup,
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
      swimsuit: options.swimsuit === true,
      night: options.night === true,
      pyjama: options.pyjama === true,
      zoo: options.zoo === true,
      kimono: options.kimono === true,
      casino: options.casino === true,
    };
    const key = JSON.stringify(outfit);
    if (key === this.outfitKey || !this.wardrobe) return;
    this.outfitKey = key;
    this.outfit = outfit;

    // Three sets put the lofted legs on: the swim pair, the sleep set — which
    // replaces the whole outfit, silk top and all, because nobody sleeps in a
    // backpack — and the zoo's, which keeps the trousers and only needs the legs
    // for the bare feet coming out from under them.
    const legs = outfit.swim || outfit.night || outfit.zoo || outfit.swimsuit || outfit.pyjama;
    const noTrousers = outfit.swim || outfit.night || outfit.swimsuit;
    const isSpecial = outfit.night || outfit.zoo || outfit.kimono || outfit.casino
      || outfit.swimsuit || outfit.pyjama;
    const dressed = !isSpecial;
    const hat = outfit.hat && dressed;
    this.setPartVisible('hat', hat);
    this.setPartVisible('backpack', outfit.backpack && dressed);
    // The kimono supplies its own robe and collar. The crew-neck tee protrudes
    // above that neckline at the nape and shoulders, so hide it with this outfit.
    this.setPartVisible('tshirt', outfit.tshirt && !outfit.night && !outfit.casino && !outfit.swimsuit && !outfit.kimono && !outfit.pyjama);
    this.setPartVisible('pants', (outfit.pants && !noTrousers && !outfit.zoo && !outfit.casino && !outfit.pyjama) || outfit.kimono);
    this.setPartVisible('shoes', outfit.shoes && !legs && !outfit.casino);
    if (this.wardrobe.sleeves) this.wardrobe.sleeves.visible = outfit.longSleeves && dressed;
    if (this.armsMesh) this.armsMesh.visible = !((outfit.longSleeves && dressed) || outfit.kimono || outfit.pyjama || (outfit.casino && this.wardrobe.casinoSleeves));
    if (this.wardrobe.swimLegs) this.wardrobe.swimLegs.visible = legs;
    if (this.wardrobe.swimShorts) this.wardrobe.swimShorts.visible = outfit.swim && !outfit.swimsuit && dressed;
    if (this.wardrobe.swimsuitTop) this.wardrobe.swimsuitTop.visible = outfit.swimsuit;
    if (this.wardrobe.swimsuitBottom) this.wardrobe.swimsuitBottom.visible = outfit.swimsuit;
    if (this.wardrobe.swimsuitBack) this.wardrobe.swimsuitBack.visible = outfit.swimsuit;
    if (this.wardrobe.swimsuitArms) this.wardrobe.swimsuitArms.visible = outfit.swimsuit;
    if (this.wardrobe.nightTop) this.wardrobe.nightTop.visible = outfit.night;
    if (this.wardrobe.nightShorts) this.wardrobe.nightShorts.visible = outfit.night;
    if (this.wardrobe.pyjamaTop) this.wardrobe.pyjamaTop.visible = outfit.pyjama;
    if (this.wardrobe.pyjamaSleeves) this.wardrobe.pyjamaSleeves.visible = outfit.pyjama;
    if (this.wardrobe.pyjamaPants) this.wardrobe.pyjamaPants.visible = outfit.pyjama;
    if (this.wardrobe.pyjamaSlippers) this.wardrobe.pyjamaSlippers.visible = outfit.pyjama;
    if (this.wardrobe.denimShorts) this.wardrobe.denimShorts.visible = false;
    if (this.wardrobe.zooTrousers) this.wardrobe.zooTrousers.visible = outfit.zoo;
    if (this.wardrobe.vest) this.wardrobe.vest.visible = outfit.zoo;
    if (this.wardrobe.flipFlops) this.wardrobe.flipFlops.visible = outfit.zoo;
    for (const mesh of this.wardrobe.kimonoParts ?? []) {
      if (mesh) mesh.visible = outfit.kimono;
    }
    if (this.wardrobe.casinoTop) this.wardrobe.casinoTop.visible = outfit.casino;
    if (this.wardrobe.casinoPants) this.wardrobe.casinoPants.visible = outfit.casino;
    if (this.wardrobe.casinoShoes) this.wardrobe.casinoShoes.visible = outfit.casino;
    if (this.wardrobe.casinoSleeves) this.wardrobe.casinoSleeves.visible = outfit.casino;
    if (this.wardrobe.casinoJewelry) {
      if (this.wardrobe.casinoJewelry.userData.choker)
        this.wardrobe.casinoJewelry.userData.choker.visible = outfit.casino;
      if (this.wardrobe.casinoJewelry.userData.bangle)
        this.wardrobe.casinoJewelry.userData.bangle.visible = outfit.casino;
    }

    // Casino Hairstyle: mèches violettes & cheveux détachés
    if (this.casinoHairTex && this.hairMaterial) {
      this.hairMaterial.map = outfit.casino ? this.casinoHairTex : this.normalHairTex;
      this.hairMaterial.needsUpdate = true;
    }
    if (this.wardrobe?.hairCrown && this.casinoCrownTex) {
      this.wardrobe.hairCrown.material.map = outfit.casino ? this.casinoCrownTex : this.normalCrownTex;
      this.wardrobe.hairCrown.material.needsUpdate = true;
    }
    if (this.bones.ponytail_01) {
      if (outfit.casino) {
        // Détache les cheveux. Le pack ne livre qu'une coiffure, une queue de cheval,
        // et la moitié de son maillage — 4099 sommets sur ponytail_02/03/04 — est la
        // queue elle-même. Ce qui fait lire « attaché » n'est pas la longueur, c'est
        // que cette masse est resserrée en un seul faisceau: on la détache en la
        // laissant retomber et en l'étalant, pas en déplaçant quoi que ce soit.
        //
        // Ce qui suppose de savoir ce que chaque axe fait vraiment ici, parce que les
        // trois font des choses différentes et qu'aucune n'est celle qu'on croit. Le
        // rig est à axe d'os: chaque os porte le suivant le long de son propre +X, donc
        // X est la PORTÉE de la chaîne — le grossir allonge la queue en pique, c'est
        // lui qui l'envoyait au plafond. Les cartes de cheveux, elles, tombent selon Y:
        // Y est donc la LONGUEUR de la chevelure (à 4.8 elle descend à la hanche comme
        // une cape). Reste Z, le seul qui écarte les cartes: c'est lui qui porte le
        // VOLUME, et donc le passage du faisceau à la masse libre.
        //
        // Deux fois trois, X reste à 1, Y donne juste ce que des cheveux dénoués
        // gagnent en longueur, Z fait le reste — le plus large à la nuque, là où
        // l'élastique serrait, et se referme vers les pointes.
        //
        // Enfin la rotation de repos n'est PAS touchée: c'est elle (euler ~(-3.1, 0,
        // -2.2) sur le premier os) qui couche la chevelure dans le dos, et l'écraser
        // par des angles absolus réalignait la chaîne sur l'axe du crâne — soit, ce +X
        // de l'os `head` qui pointe vers le ciel, la mèche verticale du bug.
        const CASINO_HAIR_DOWN = [
          // os              portée, longueur, volume
          ['ponytail_01', [1.0, 1.30, 3.4]],
          ['ponytail_02', [1.0, 1.40, 4.0]],
          ['ponytail_03', [1.0, 1.30, 3.6]],
          ['ponytail_04', [1.0, 1.12, 2.6]],
        ];
        const composed = [1, 1, 1];
        for (const [name, scale] of CASINO_HAIR_DOWN) {
          const bone = this.bones[name];
          if (!bone) continue;
          bone.scale.set(
            scale[0] / composed[0], scale[1] / composed[1], scale[2] / composed[2]);
          for (let c = 0; c < 3; c++) composed[c] = scale[c];
          const rest = this.restRotation?.get(name);
          if (rest) bone.quaternion.copy(rest);
        }
      } else {
        // Queue de cheval attachée normale
        this.bones.ponytail_01.scale.set(1, 1, 1);
        const r1 = this.restRotation?.get('ponytail_01');
        if (r1) this.bones.ponytail_01.quaternion.copy(r1);
        if (this.bones.ponytail_02) {
          this.bones.ponytail_02.scale.set(1, 1, 1);
          const r2 = this.restRotation?.get('ponytail_02');
          if (r2) this.bones.ponytail_02.quaternion.copy(r2);
        }
        if (this.bones.ponytail_03) {
          this.bones.ponytail_03.scale.set(1, 1, 1);
          const r3 = this.restRotation?.get('ponytail_03');
          if (r3) this.bones.ponytail_03.quaternion.copy(r3);
        }
        if (this.bones.ponytail_04) {
          this.bones.ponytail_04.scale.set(1, 1, 1);
          const r4 = this.restRotation?.get('ponytail_04');
          if (r4) this.bones.ponytail_04.quaternion.copy(r4);
        }
      }
    }
    if (this.wardrobe?.casinoLooseHair) {
      this.wardrobe.casinoLooseHair.visible = outfit.casino;
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

  applySeatedPose(floorY, pose = null) {
    // How high the seat stands over the floor in front of it. The body is hung
    // off the seat — the pose root drops until the hip is seatHipRise above
    // it, because the group is already parked ON the seat — and the leg then
    // has to span from there down to the floor.
    const seat = Number.isFinite(floorY)
      ? this.group.position.y - floorY : SEAT_FALLBACK_HEIGHT;
    this.placeSeated(seat, pose);
    // A seat that states its own hip rise has nothing left to calibrate: the
    // measure-then-lift pass below only exists for the ones that don't.
    if (!this._seatCalibrated && !(pose?.hipRise > 0)) {
      this.poseRoot.updateMatrixWorld(true);
      const extra = this.seatContactLift();
      if (extra > 0.004) {
        this.seatHipRise += extra;
        this._seatFlex = null;
        this.placeSeated(seat, pose);
      }
      this._seatCalibrated = true;
    }
  }

  // `pose` is the seat's own idea of how it is sat on, and every field is
  // optional — a dining chair hands over nothing and gets the default lounge
  // pose. A desk is not a lounge seat in any of these respects, and every one
  // of them is a property of the FURNITURE, not of the avatar:
  //   hipRise  how far the hip joint clears the cushion, when the seat would
  //            rather say so than have the pose measure it off the flesh
  //   back     how far the hips sit back from the anchor (default SEAT_BACK)
  //   lean     trunk pitch about the spine's own Z, whose sign is the OPPOSITE
  //            of the thigh's: negative carries the shoulders forward
  //   hands    wrist targets in WORLD space — a keyboard is a point in the
  //            room, not on the body, so it cannot be a body-local offset
  //   shinLean where the feet go relative to the knees. Its sign is the same
  //            trap as the lean's: SEAT_SHIN_LEAN is -12 deg and tucks the
  //            feet BEHIND the knees, which over a caster base parks a heel on
  //            a wheel. Positive carries them forward, under the desk
  //   elbowPole where the elbows swing to; mirrored in x for the right arm
  //   handKey  cache slot for the arm solve, one per distinct pair of targets
  placeSeated(seat, pose = null) {
    const rise = pose?.hipRise > 0 ? pose.hipRise : this.seatHipRise;
    const shinLean = pose?.shinLean ?? SEAT_SHIN_LEAN;
    const flex = this.seatFlex(seat, rise, shinLean);
    this.resetHeldPose();
    this.poseSeatedLegs(flex, shinLean);
    this.bones.spine_01?.rotateZ(pose?.lean ?? SEAT_LEAN);
    // The body is parked BEFORE the arms are solved. With hands on the thighs
    // that ordering is free — the targets ride along — but a keyboard target
    // stays where it is while the body moves, so the reach has to be worked
    // out from where the body finally sits.
    this.poseRoot.position.y = rise - this.restHipY;
    this.poseRoot.position.z = pose?.back ?? SEAT_BACK;
    if (pose?.hands) {
      this.poseRoot.updateMatrixWorld(true);
      this.applyHeldArmPose(pose.handKey ?? 'seatedReach', {
        l: this.poseRoot.worldToLocal(pose.hands.l.clone()),
        r: this.poseRoot.worldToLocal(pose.hands.r.clone()),
      }, pose.elbowPole);
    } else {
      this.applyHeldArmPose('seated', SEATED_HAND_TARGETS);
    }
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
  poseSeatedLegs(flex, shinLean = SEAT_SHIN_LEAN) {
    for (const side of ['l', 'r']) {
      this.bones[`thigh_${side}`]?.rotateZ(flex);
      // The knee takes the thigh back off again and leaves the shin on its lean;
      // the ankle then takes the lean off too, so the sole finishes flat on the
      // floor instead of at whatever angle the clip underneath left it.
      this.bones[`calf_${side}`]?.rotateZ(shinLean - flex);
      this.bones[`foot_${side}`]?.rotateZ(-shinLean);
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
  seatFlex(seat, rise = this.seatHipRise, shinLean = SEAT_SHIN_LEAN) {
    if (this._seatFlex?.seat === seat && this._seatFlex.rise === rise
      && this._seatFlex.shinLean === shinLean) return this._seatFlex.flex;
    let flex = Math.acos(THREE.MathUtils.clamp(
      (seat + rise - this.shinDrop * Math.cos(shinLean) - this.restAnkleY)
      / this.thighDrop, -1, 1));
    const ankle = this.bones.foot_l;
    if (ankle) {
      // Soles down means the ankle stands its own standing height over the floor,
      // and the hip a fixed rise over the seat: that fixes the drop between them.
      const want = seat + rise - this.restAnkleY;
      const scratch = new THREE.Vector3();
      const dropAt = f => {
        this.resetHeldPose();
        this.poseSeatedLegs(f, shinLean);
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
    this._seatFlex = { seat, rise, shinLean, flex };
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

  // `poleLocal` steers the elbow: the solver keeps the hand on the target and
  // swings the elbow around the shoulder-to-wrist line, so the pole is the
  // direction that line is pushed away from. The default sends it straight out
  // sideways, which is right for a hand dropped onto a thigh and badly wrong
  // for one sent forward onto a table — there it splays the elbows out level
  // with the shoulders. Pass a downward pole for those.
  solveRestingArm(side, targetLocal, poleLocal = null) {
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
    const pole = (poleLocal ? poleLocal.clone() : new THREE.Vector3(side === 'l' ? 1 : -1, 0, 0))
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

  // Turn the hand about the wrist so the fingers run along `aimLocal` and the
  // palm faces `palmLocal` (both pose-root directions).
  aimRestingHand(side, aimLocal, palmLocal) {
    const hand = this.bones[`hand_${side}`];
    const middle = this.bones[`middle_01_${side}`];
    const index = this.bones[`index_01_${side}`];
    const pinky = this.bones[`pinky_01_${side}`];
    if (!hand || !middle || !index || !pinky) return;
    const toWorld = v => v.clone().transformDirection(this.poseRoot.matrixWorld);
    const at = bone => bone.getWorldPosition(new THREE.Vector3());
    const handWorld = new THREE.Quaternion();

    const aim = toWorld(aimLocal);
    const fingers = at(middle).sub(at(hand)).normalize();
    hand.getWorldQuaternion(handWorld);
    this.setBoneWorldQuaternion(hand,
      new THREE.Quaternion().setFromUnitVectors(fingers, aim).multiply(handWorld));
    this.poseRoot.updateMatrixWorld(true);

    // Palm normal from the knuckle line; mirrored between the two hands.
    const across = at(index).sub(at(pinky));
    const palm = new THREE.Vector3().crossVectors(aim, across)
      .multiplyScalar(side === 'l' ? 1 : -1);
    const want = toWorld(palmLocal);
    palm.addScaledVector(aim, -palm.dot(aim)).normalize();
    want.addScaledVector(aim, -want.dot(aim)).normalize();
    hand.getWorldQuaternion(handWorld);
    this.setBoneWorldQuaternion(hand,
      new THREE.Quaternion().setFromUnitVectors(palm, want).multiply(handWorld));
    // Fingers loosely curled round the toy rather than splayed flat.
    for (const finger of ['index', 'middle', 'ring', 'pinky']) {
      for (const joint of ['01', '02', '03']) {
        this.bones[`${finger}_${joint}_${side}`]?.rotateZ(HAND_CURL);
      }
    }
    this.poseRoot.updateMatrixWorld(true);
  }

  // Both held poses want the same thing from the arms: solve them onto a pair of
  // hand targets once, keep the answer, and re-apply it over whatever the clip
  // underneath is doing. `key` is only there so the supine and the seated
  // answers do not share a cache.
  applyHeldArmPose(key, targets, pole = null) {
    this.heldArmPose ??= {};
    if (!this.heldArmPose[key]) {
      for (const joint of this.armJoints) {
        this.bones[joint].quaternion.copy(this.restRotation.get(joint));
      }
      this.poseRoot.updateMatrixWorld(true);
      // One pole for the pair, mirrored for the right arm — same convention as
      // the default, which sends each elbow out its own side.
      for (const side of ['l', 'r']) {
        this.solveRestingArm(side, targets[side], pole
          ? new THREE.Vector3(side === 'l' ? pole.x : -pole.x, pole.y, pole.z)
          : null);
        if (targets.aim) this.aimRestingHand(side, targets.aim[side], targets.palm);
      }
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

  applyLyingPose(withPlush = false) {
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
    this.applyHeldArmPose(withPlush ? 'lyingPlush' : 'lying',
      withPlush ? PLUSH_HAND_TARGETS : LYING_HAND_TARGETS,
      withPlush ? PLUSH_ARM_POLE : null);
    if (withPlush) {
      // Asleep, the face rolls a little to one side, cheek toward the toy.
      this.bones.neck_01?.rotateX(PLUSH_HEAD_TURN * 0.4);
      this.bones.head?.rotateX(PLUSH_HEAD_TURN * 0.6);
    }
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

  // The furisode's skirt is a fixed tube around the pelvis (kimono.js keeps it
  // one volume rather than splitting into floral trousers), so a leg swung out
  // at the pack's normal walk/run amplitude punches its shin straight through
  // the hem every stride. Pulling the thigh and calf back most of the way
  // toward their bind pose after the clip has run shortens the stride into a
  // shuffle that stays inside the skirt without touching the clips themselves.
  dampKimonoStride() {
    // A fixed fraction of the clip's own swing (the first cut of this) still
    // scaled with it: sprint drives the calf past 1 rad, and 40% of that is
    // still enough to clear the skirt's rear wall, which is where it kept
    // showing up — the camera sits behind her, not in front. Capping the
    // absolute angle instead holds the same small shuffle at every speed.
    const maxAngle = 0.12;
    for (const name of ['thigh_l', 'thigh_r', 'calf_l', 'calf_r']) {
      const bone = this.bones[name];
      const rest = this.restRotation.get(name);
      if (!bone || !rest) continue;
      const angle = bone.quaternion.angleTo(rest);
      if (angle > maxAngle) bone.quaternion.slerp(rest, 1 - maxAngle / angle);
    }
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
    if (this.outfit?.kimono && posture !== 'sit' && posture !== 'lie' && posture !== 'kneel') {
      this.dampKimonoStride();
    }
    this.setEyesClosed(posture === 'lie' || posture === 'kneel');
    if (this.wardrobe?.pyjamaSlippers)
      this.wardrobe.pyjamaSlippers.visible = this.outfit?.pyjama === true && posture !== 'lie';
    this.sleepPlush.visible = posture === 'lie' && ctx.sleepPlush === true;
    if (posture === 'sit') {
      this.applySeatedPose(ctx.floorY, ctx.seatPose);
    } else if (posture === 'lie') {
      this.applyLyingPose(this.sleepPlush.visible);
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
