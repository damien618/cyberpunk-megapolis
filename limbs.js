// limbs.js — procedural limbs for the wardrobe: bare legs and feet for the
// poolside outfit, long sleeves for the evening one.
//
// The Survivors girl skin only models hands, arms and the upper chest, and the
// pack has no long-sleeved top at all. Both wardrobe extras used to be faked
// with primitives — the legs were a recoloured copy of the trousers ending in a
// squashed sphere per foot, the sleeves two bare cylinders butted together at
// the elbow — which is exactly what they looked like.
//
// Both are now lofted the same way: a closed tube swept along a bone chain,
// with a cross-section table giving it real anatomy (patella and popliteal
// hollow at the knee, gastrocnemius sitting lower on the inner side, malleoli,
// arch, flat sole, tapered toes; deltoid, olecranon, forearm swell and a cuff
// on the arm). Each is a single SkinnedMesh bound to the character's own
// skeleton, so it bends with every existing animation clip.
import * as THREE from 'three';

const RADIAL = 20;
const TOE_RADIAL = 10;   // a 6 mm toe does not need the leg's ring density

// ---------------------------------------------------------------------------
// Cross-section tables. Radii are in metres, measured against the reference
// span noted with each table and rescaled to whatever skeleton is loaded.
// `lat`/`med` are the outer and inner sides, `ant`/`post` the front and back —
// on the leg those become the top of the foot and the sole once the loft turns
// the corner at the ankle. `ex`/`enA`/`enP` are super-ellipse exponents: 1 is a
// plain ellipse, lower values square the section off, which is what flattens
// the sole without creasing the edge where it wraps up into the sides.
// ---------------------------------------------------------------------------

// Chain parameter: 0 hip, 1 knee, 2 ankle, 3 ball of the foot. The table stops
// at the metatarsal heads: carrying one tube on to the toe tip is what made the
// foot read as a blunt slipper, so the five toes are lofted separately (see
// TOES / buildToes) and butt into the pad this table closes on.
const LEG_PROFILE = [
  // u,    lat,    med,    ant,    post,   ex,   enA,  enP
  [0.00, 0.0860, 0.0820, 0.0840, 0.0980, 1.00, 1.00, 1.00],  // gluteal fold
  [0.12, 0.0838, 0.0806, 0.0820, 0.0895, 1.00, 1.00, 1.00],
  [0.28, 0.0792, 0.0772, 0.0775, 0.0798, 1.00, 1.00, 1.00],
  [0.46, 0.0728, 0.0716, 0.0708, 0.0718, 1.00, 1.00, 1.00],  // mid thigh
  [0.64, 0.0664, 0.0662, 0.0642, 0.0642, 1.00, 1.00, 1.00],
  [0.80, 0.0602, 0.0612, 0.0580, 0.0570, 1.00, 1.00, 1.00],
  [0.90, 0.0562, 0.0584, 0.0552, 0.0512, 1.00, 1.00, 1.00],  // vastus medialis
  [1.00, 0.0540, 0.0552, 0.0562, 0.0462, 1.00, 1.00, 1.00],  // patella / hollow
  [1.09, 0.0518, 0.0530, 0.0518, 0.0478, 1.00, 1.00, 1.00],
  [1.20, 0.0505, 0.0510, 0.0455, 0.0555, 1.00, 1.00, 1.00],
  [1.28, 0.0512, 0.0525, 0.0435, 0.0645, 1.00, 1.00, 1.00],  // calf, outer head
  [1.36, 0.0505, 0.0538, 0.0425, 0.0660, 1.00, 1.00, 1.00],  // calf, inner head
  [1.45, 0.0487, 0.0530, 0.0412, 0.0635, 1.00, 1.00, 1.00],
  [1.60, 0.0442, 0.0455, 0.0382, 0.0540, 1.00, 1.00, 1.00],
  [1.75, 0.0380, 0.0384, 0.0340, 0.0432, 1.00, 1.00, 1.00],  // achilles taper
  [1.88, 0.0320, 0.0326, 0.0300, 0.0350, 1.00, 1.00, 1.00],
  [1.96, 0.0292, 0.0302, 0.0282, 0.0300, 1.00, 1.00, 1.00],  // malleoli
  [2.00, 0.0290, 0.0300, 0.0282, 0.0312, 1.00, 1.00, 0.98],
  [2.08, 0.0298, 0.0304, 0.0300, 0.0356, 0.98, 1.00, 0.92],  // achilles
  [2.18, 0.0316, 0.0318, 0.0342, 0.0530, 0.92, 1.00, 0.76],
  [2.30, 0.0348, 0.0348, 0.0400, 0.0640, 0.84, 1.00, 0.52],  // heel
  [2.45, 0.0362, 0.0364, 0.0420, 0.0500, 0.78, 1.00, 0.42],
  [2.62, 0.0380, 0.0392, 0.0400, 0.0330, 0.72, 1.00, 0.36],  // instep / arch
  [2.80, 0.0410, 0.0432, 0.0350, 0.0302, 0.70, 0.98, 0.34],
  [3.00, 0.0432, 0.0462, 0.0292, 0.0300, 0.70, 0.94, 0.32],  // ball, wider inside
  [3.07, 0.0396, 0.0424, 0.0206, 0.0262, 0.70, 0.92, 0.34],
  [3.12, 0.0286, 0.0306, 0.0104, 0.0158, 0.78, 0.90, 0.44],  // pad rolls into the toes
];
const LEG_SPAN = 0.8955;   // hip to ankle on the reference rig
const LEG_END = 3.12;

// One row per toe, hallux first: offset across the forefoot (medial negative),
// radius, length past the metatarsal head, and splay in radians — the big toe
// angles in and the little one out, which is what stops the five reading as a
// comb. Lengths give the usual stepped toe line: the second is the longest,
// then it falls away sharply to the fifth. All lengths are in units of the
// ankle-to-ball span, so they follow whatever foot the rig actually has.
const TOES = [
  // across, radius, length, splay
  [-0.222, 0.088, 0.47, -0.045],
  [-0.082, 0.070, 0.51, -0.008],
  [0.038, 0.064, 0.45, 0.014],
  [0.144, 0.058, 0.37, 0.034],
  [0.234, 0.050, 0.27, 0.060],
];
// Toe cross-section, u = 0 at the buried root to 1 at the tip. Radii are
// fractions of the toe's own radius. `ant` starts at more than twice that: a
// round tube leaves the toes hanging off the pad like fingers out of a mitten,
// where a real toe is a tall box at the knuckle that only rounds off near the
// nail. `ex` below 1 squares the sides so neighbours meet along a cleft instead
// of touching at one point, and `enP` keeps the pads flat on the ground.
const TOE_PROFILE = [
  // u,    lat,  med,  ant,  post,  ex,   enA,  enP
  [0.00, 1.08, 1.08, 2.55, 1.00, 0.72, 0.95, 0.58],
  [0.26, 1.04, 1.04, 1.70, 0.99, 0.74, 0.95, 0.58],
  [0.55, 1.00, 1.00, 1.22, 0.94, 0.78, 0.96, 0.62],  // interphalangeal knuckle
  [0.78, 0.95, 0.95, 0.98, 0.88, 0.84, 0.98, 0.68],
  [0.92, 0.82, 0.82, 0.80, 0.74, 0.92, 1.00, 0.80],
  [1.00, 0.36, 0.36, 0.34, 0.30, 1.00, 1.00, 1.00],  // pulp of the tip
];

// Chain parameter: 0 shoulder, 1 elbow, 2 wrist. Starts above the shoulder so
// the opening is buried in the torso, and ends just past the wrist on a cuff.
//
// Sized as a fitted knit sleeve. The obvious move — inflate it until it
// swallows the t-shirt's short sleeve — gives puffed, leg-of-mutton shoulders,
// because the short sleeve is not a tube: measured off its own skin weights it
// runs 68 mm out to the side but essentially nothing towards the torso, since
// that side is the armhole. A circle drawn round its widest point balloons
// four centimetres into the armpit.
//
// So `lat` tracks the short sleeve's outer edge (68 mm at the deltoid, 49 mm by
// its hem) and `med` stays tucked inside the chest. Where the armhole flares
// past this, the t-shirt simply shows through — both are the same white, so
// the overlap costs nothing and the silhouette stays the one the short-sleeved
// version already reads correctly.
const SLEEVE_PROFILE = [
  // u,     lat,    med,    ant,    post,   ex,   enA,  enP
  [-0.10, 0.0480, 0.0400, 0.0450, 0.0470, 1.00, 1.00, 1.00],  // buried opening
  [-0.04, 0.0600, 0.0430, 0.0532, 0.0558, 1.00, 1.00, 1.00],  // shoulder seam
  [0.00, 0.0685, 0.0450, 0.0600, 0.0605, 1.00, 1.00, 1.00],   // deltoid
  [0.10, 0.0672, 0.0470, 0.0640, 0.0630, 1.00, 1.00, 1.00],
  [0.20, 0.0635, 0.0520, 0.0650, 0.0640, 1.00, 1.00, 1.00],
  [0.30, 0.0575, 0.0545, 0.0620, 0.0610, 1.00, 1.00, 1.00],
  [0.42, 0.0535, 0.0530, 0.0570, 0.0545, 1.00, 1.00, 1.00],
  [0.55, 0.0522, 0.0524, 0.0545, 0.0520, 1.00, 1.00, 1.00],
  [0.70, 0.0512, 0.0518, 0.0530, 0.0508, 1.00, 1.00, 1.00],   // short hem ends
  [0.85, 0.0480, 0.0484, 0.0490, 0.0478, 1.00, 1.00, 1.00],
  [0.94, 0.0462, 0.0464, 0.0464, 0.0468, 1.00, 1.00, 1.00],
  [1.00, 0.0456, 0.0456, 0.0448, 0.0486, 1.00, 1.00, 1.00],   // olecranon
  [1.08, 0.0452, 0.0452, 0.0450, 0.0476, 1.00, 1.00, 1.00],   // fabric bunching
  [1.20, 0.0446, 0.0446, 0.0452, 0.0442, 1.00, 1.00, 1.00],
  [1.32, 0.0440, 0.0440, 0.0448, 0.0428, 1.00, 1.00, 1.00],   // flexor swell
  [1.50, 0.0414, 0.0414, 0.0418, 0.0400, 1.00, 1.00, 1.00],
  [1.68, 0.0366, 0.0366, 0.0364, 0.0356, 1.00, 1.00, 1.00],
  [1.85, 0.0308, 0.0308, 0.0302, 0.0300, 1.00, 1.00, 1.00],
  [1.96, 0.0278, 0.0278, 0.0270, 0.0270, 1.00, 1.00, 1.00],
  [2.00, 0.0272, 0.0272, 0.0264, 0.0264, 1.00, 1.00, 1.00],   // wrist
  [2.03, 0.0288, 0.0288, 0.0280, 0.0280, 1.00, 1.00, 1.00],   // cuff lip
  [2.06, 0.0240, 0.0240, 0.0234, 0.0234, 1.00, 1.00, 1.00],
];
const SLEEVE_SPAN = 0.5537;   // shoulder to wrist on the reference rig

// ---------------------------------------------------------------------------
// Loft core
// ---------------------------------------------------------------------------

function catmull(p0, p1, p2, p3, t) {
  const t2 = t * t, t3 = t2 * t;
  return 0.5 * (2 * p1 + (p2 - p0) * t
    + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2
    + (3 * p1 - 3 * p2 + p3 - p0) * t3);
}

// Smooth (C1) sample of a profile table, so the silhouette has no banding.
function sampleProfile(table, u, out) {
  let k = 0;
  while (k < table.length - 2 && u > table[k + 1][0]) k++;
  const r1 = table[k], r2 = table[k + 1];
  const r0 = table[Math.max(k - 1, 0)], r3 = table[Math.min(k + 2, table.length - 1)];
  const t = THREE.MathUtils.clamp((u - r1[0]) / (r2[0] - r1[0]), 0, 1);
  for (let c = 1; c < 8; c++) out[c - 1] = catmull(r0[c], r1[c], r2[c], r3[c], t);
  return out;
}

// Ring positions along the chain, packed where the shape changes fastest.
function ringParams(from, to, stepAt) {
  const us = [];
  for (let u = from; u < to; ) {
    us.push(u);
    u = Math.min(u + stepAt(u), to);
  }
  us.push(to);
  return us;
}

/**
 * Sweeps one closed tube and appends it to the shared attribute arrays.
 *
 * `lateral` mirrors the frame for the right-hand limb, which also reverses the
 * winding — hence the flip on triangle emission rather than a normals fixup.
 */
function loft({ points, pathU, profile, scale, rings, weights, lateral, floorY, floorFrom, warp,
  radial = RADIAL }, out) {
  const path = new THREE.CatmullRomCurve3(points, false, 'centripetal');
  const segs = pathU.length - 1;
  const curveT = u => {
    let i = 0;
    while (i < segs - 1 && u > pathU[i + 1]) i++;
    const f = (u - pathU[i]) / (pathU[i + 1] - pathU[i]);
    return (i + THREE.MathUtils.clamp(f, 0, 1)) / segs;
  };

  const base = out.pos.length / 3;
  const prof = new Array(7);
  const anterior = new THREE.Vector3(0, 0, 1);
  const tangent = new THREE.Vector3(), side3 = new THREE.Vector3(), p = new THREE.Vector3();
  let firstCentre = null, lastCentre = null;

  for (const u of rings) {
    const t = curveT(u);
    const c = path.getPoint(t);
    path.getTangent(t, tangent).normalize();
    // Parallel transport: reproject the previous anterior reference rather than
    // rebuild it, so the frame does not spin as the loft turns at the ankle.
    anterior.addScaledVector(tangent, -anterior.dot(tangent)).normalize();
    side3.crossVectors(anterior, tangent).normalize().multiplyScalar(lateral);
    if (!firstCentre) firstCentre = c.clone();
    lastCentre = c.clone();

    const [lat, med, ant, post, ex, enA, enP] = sampleProfile(profile, u, prof);
    const w = weights(u);
    for (let j = 0; j < radial; j++) {
      const th = (j / radial) * Math.PI * 2;
      const cs = Math.cos(th), sn = Math.sin(th);
      const rl = cs >= 0 ? lat : med;
      const rv = sn >= 0 ? ant : post;
      const en = sn >= 0 ? enA : enP;
      p.copy(c)
        .addScaledVector(side3, rl * Math.sign(cs) * Math.abs(cs) ** ex * scale)
        .addScaledVector(anterior, rv * Math.sign(sn) * Math.abs(sn) ** en * scale);
      // Soft floor: presses the underside of the foot flat at ground level
      // without creasing the edge where the sole wraps up into the sides.
      if (floorY !== null && u >= floorFrom) {
        const d = p.y - floorY;
        p.y = floorY + 0.5 * (d + Math.sqrt(d * d + 2.5e-5));
      }
      if (warp) warp(u, cs, sn, p, scale);
      pushVertex(out, p, w);
    }
  }

  // Caps. Both are buried — the first inside the shorts or the torso, the last
  // inside the toe tip or the hand.
  const capA = out.pos.length / 3;
  pushVertex(out, firstCentre, weights(rings[0]));
  const capB = out.pos.length / 3;
  pushVertex(out, lastCentre, weights(rings[rings.length - 1]));

  const tri = lateral > 0
    ? (a, b, c) => out.tri.push(a, b, c)
    : (a, b, c) => out.tri.push(a, c, b);
  const last = base + (rings.length - 1) * radial;
  for (let j = 0; j < radial; j++) {
    const j2 = (j + 1) % radial;
    for (let r = 0; r < rings.length - 1; r++) {
      const a = base + r * radial, b = a + radial;
      tri(a + j, a + j2, b + j);
      tri(a + j2, b + j2, b + j);
    }
    tri(capA, base + j2, base + j);
    tri(capB, last + j, last + j2);
  }
}

function pushVertex(out, p, w) {
  out.pos.push(p.x, p.y, p.z);
  out.idx.push(w.idx[0], w.idx[1], w.idx[2], w.idx[3]);
  out.wgt.push(w.wgt[0], w.wgt[1], w.wgt[2], w.wgt[3]);
}

function finish(out, rig, material, name) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(out.pos, 3));
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(out.idx, 4));
  g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(out.wgt, 4));
  g.setIndex(out.tri);
  g.computeVertexNormals();
  g.computeBoundingSphere();

  const mesh = new THREE.SkinnedMesh(g, material);
  mesh.name = name;
  mesh.position.copy(rig.position);
  mesh.quaternion.copy(rig.quaternion);
  mesh.scale.copy(rig.scale);
  mesh.bindMode = rig.bindMode;
  mesh.bind(rig.skeleton, rig.bindMatrix);
  mesh.bindMatrixInverse.copy(rig.bindMatrixInverse);
  mesh.castShadow = rig.castShadow;
  mesh.receiveShadow = rig.receiveShadow;
  mesh.frustumCulled = false;
  mesh.visible = false;
  rig.parent.add(mesh);
  return mesh;
}

/**
 * Picks a skinned mesh whose skeleton carries every bone we need. GLTFLoader
 * gives each mesh its own Skeleton holding only the joints it is weighted to,
 * so the trousers know about the legs and the arms mesh about the arms — but
 * neither knows about both.
 */
function findRig(root, bones) {
  let found = null;
  root.traverse(o => {
    if (found || !o.isSkinnedMesh) return;
    const names = new Set(o.skeleton.bones.map(b => b.name));
    if (bones.every(b => names.has(b))) found = o;
  });
  return found;
}

// Rest-pose bone positions, in the geometry space the rig's vertices live in.
function restReader(rig) {
  const toLocal = new THREE.Matrix4().copy(rig.bindMatrix).invert();
  const indexOf = name => rig.skeleton.bones.findIndex(b => b.name === name);
  return {
    indexOf,
    pos: name => new THREE.Vector3().setFromMatrixPosition(
      new THREE.Matrix4().copy(rig.skeleton.boneInverses[indexOf(name)])
        .invert().premultiply(toLocal)),
  };
}

// ---------------------------------------------------------------------------
// Bare legs and feet
// ---------------------------------------------------------------------------

const LEG_BONES = side => ['pelvis', `thigh_${side}`, `calf_${side}`, `foot_${side}`, `ball_${side}`];

// Influences for a whole cross-section. Deriving them from `u` alone — rather
// than per vertex — is what makes the knee and the ankle shear evenly all the
// way round instead of pinching on one side. The ankle blend is over by u = 2,
// so the heel is pure foot and never drags on the calf. Four slots is enough:
// the calf is already at zero by the time the toes start bending, so those two
// share one.
function legWeights(bone) {
  const ss = THREE.MathUtils.smoothstep;
  return u => {
    const pelvis = 0.4 * (1 - ss(u, 0, 0.22));   // the crotch stays with the hips
    const knee = ss(u, 0.84, 1.18);
    const ankle = ss(u, 1.86, 2.00);
    const toes = 0.9 * ss(u, 2.80, 3.32);
    const leg = 1 - pelvis;
    const lower = leg * knee * ankle;
    const swap = toes > 0;
    return {
      idx: [bone.pelvis, bone.thigh, swap ? bone.ball : bone.calf, bone.foot],
      wgt: [pelvis, leg * (1 - knee), swap ? lower * toes : leg * knee * (1 - ankle),
        lower * (1 - toes)],
    };
  };
}

// The medial longitudinal arch: the inner edge of the sole lifts clear of the
// ground between the heel and the ball. The flat soft floor above cannot do
// this on its own — it is symmetric — and without it a bare foot reads as a
// slipper.
function archWarp(u, cs, sn, p, scale) {
  if (sn >= 0 || cs >= 0) return;                       // inner half of the sole only
  const ss = THREE.MathUtils.smoothstep;
  const span = ss(u, 2.40, 2.64) * (1 - ss(u, 2.86, 3.02));
  p.y += 0.020 * scale * span * -cs * -sn;
}

export function buildBareLegs(root, material) {
  const rig = findRig(root, [...LEG_BONES('l'), ...LEG_BONES('r')]);
  if (!rig) return null;
  const { indexOf, pos } = restReader(rig);
  const out = { pos: [], tri: [], idx: [], wgt: [] };

  for (const side of ['l', 'r']) {
    const hip = pos(`thigh_${side}`), knee = pos(`calf_${side}`);
    const ankle = pos(`foot_${side}`), ball = pos(`ball_${side}`);
    // Foot frame: the toes give the walking direction, and the ball bone sits
    // about a fifth of a foot length above the sole.
    const fwd = new THREE.Vector3(ball.x - ankle.x, 0, ball.z - ankle.z).normalize();
    const L = ankle.distanceTo(ball);
    const soleY = ball.y - 0.20 * L;
    const flatBall = new THREE.Vector3(ball.x, 0, ball.z);
    const along = (from, f, y) => from.clone().addScaledVector(fwd, f * L).setY(y);
    const bone = {
      pelvis: indexOf('pelvis'), thigh: indexOf(`thigh_${side}`),
      calf: indexOf(`calf_${side}`), foot: indexOf(`foot_${side}`),
      ball: indexOf(`ball_${side}`),
    };
    loft({
      points: [
        hip, knee, ankle,
        along(ankle, 0.10, ankle.y - 0.33 * L),   // rounds the back of the heel
        along(ankle, 0.42, soleY + 0.22 * L),     // arch
        along(flatBall, 0, soleY + 0.22 * L),
        along(flatBall, 0.05, soleY + 0.175 * L),
        along(flatBall, 0.10, soleY + 0.128 * L),   // pad stops at the toe roots
      ],
      pathU: [0, 1, 2, 2.30, 2.62, 3.0, 3.07, LEG_END],
      profile: LEG_PROFILE,
      scale: hip.distanceTo(ankle) / LEG_SPAN,
      rings: ringParams(0, LEG_END, u => u < 0.72 ? 0.090
        : u < 1.30 ? 0.048 : u < 1.78 ? 0.070 : u < 2.10 ? 0.040 : u < 3.05 ? 0.045 : 0.030),
      weights: legWeights(bone),
      lateral: Math.sign(hip.x) || 1,
      floorY: soleY,
      floorFrom: 2,
      warp: archWarp,
    }, out);
    buildToes({ out, bone, fwd, hip, flatBall, soleY, L });
  }
  return finish(out, rig, material, 'Wardrobe_BareLegs');
}

// Five short tubes fanning out of the forefoot pad. Each is skinned to the same
// ball/foot pair the pad ends on, so they follow the existing clips without any
// extra joints — a curled-toe clip would need real phalanges, but nothing in
// the traversal set curls them.
function buildToes({ out, bone, fwd, hip, flatBall, soleY, L }) {
  const lateral = Math.sign(hip.x) || 1;
  // Across the foot, pointing away from the midline, whatever way the rig's
  // forefoot happens to face.
  const across = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), fwd).normalize();
  if (across.x * lateral < 0) across.negate();
  const dir = new THREE.Vector3();
  const ss = THREE.MathUtils.smoothstep;

  for (const [offset, radius, length, splay] of TOES) {
    const r = radius * L;
    dir.copy(fwd).applyAxisAngle(new THREE.Vector3(0, 1, 0), splay * lateral).normalize();
    // Root sits back inside the pad so the seam never opens up, and the toe
    // rides at its own radius above the sole so the soft floor flattens the pad
    // rather than sinking it.
    const root = flatBall.clone()
      .addScaledVector(across, offset * L)
      .addScaledVector(dir, -0.22 * L)
      .setY(soleY + r);
    loft({
      points: [
        root,
        root.clone().addScaledVector(dir, (0.22 + length * 0.55) * L),
        root.clone().addScaledVector(dir, (0.22 + length) * L),
      ],
      pathU: [0, 0.55, 1],
      profile: TOE_PROFILE,
      scale: r,
      rings: ringParams(0, 1, u => u < 0.55 ? 0.18 : 0.07),
      weights: u => {
        const t = ss(u, 0, 0.40);
        return { idx: [bone.ball, bone.foot, 0, 0], wgt: [0.5 + 0.5 * t, 0.5 - 0.5 * t, 0, 0] };
      },
      lateral,
      floorY: soleY,
      floorFrom: 0,
      radial: TOE_RADIAL,
    }, out);
  }
}

// ---------------------------------------------------------------------------
// Long sleeves
// ---------------------------------------------------------------------------

const ARM_BONES = side => [`clavicle_${side}`, `upperarm_${side}`, `lowerarm_${side}`, `hand_${side}`];

function sleeveWeights(bone) {
  const ss = THREE.MathUtils.smoothstep;
  return u => {
    const shoulder = 0.45 * (1 - ss(u, -0.10, 0.10));   // shoulder seam sits on the torso
    const elbow = ss(u, 0.82, 1.20);
    const cuff = 0.55 * ss(u, 1.86, 2.06);
    const arm = 1 - shoulder;
    const fore = arm * elbow;
    return {
      idx: [bone.clavicle, bone.upperarm, bone.lowerarm, bone.hand],
      wgt: [shoulder, arm * (1 - elbow), fore * (1 - cuff), fore * cuff],
    };
  };
}

export function buildSleeves(root, material) {
  const rig = findRig(root, [...ARM_BONES('l'), ...ARM_BONES('r')]);
  if (!rig) return null;
  const { indexOf, pos } = restReader(rig);
  const out = { pos: [], tri: [], idx: [], wgt: [] };

  for (const side of ['l', 'r']) {
    const shoulder = pos(`upperarm_${side}`);
    const elbow = pos(`lowerarm_${side}`);
    const wrist = pos(`hand_${side}`);
    const upper = shoulder.distanceTo(elbow), fore = elbow.distanceTo(wrist);
    const shoulderUp = shoulder.clone().sub(elbow).normalize();
    const outward = wrist.clone().sub(elbow).normalize();
    const bone = {
      clavicle: indexOf(`clavicle_${side}`), upperarm: indexOf(`upperarm_${side}`),
      lowerarm: indexOf(`lowerarm_${side}`), hand: indexOf(`hand_${side}`),
    };
    loft({
      points: [
        shoulder.clone().addScaledVector(shoulderUp, 0.10 * upper),   // inside the torso
        shoulder,
        elbow,
        wrist,
        wrist.clone().addScaledVector(outward, 0.06 * fore),          // cuff
      ],
      pathU: [-0.10, 0, 1, 2, 2.06],
      profile: SLEEVE_PROFILE,
      scale: shoulder.distanceTo(wrist) / SLEEVE_SPAN,
      rings: ringParams(-0.10, 2.06, u => u < 0.20 ? 0.050
        : u < 0.85 ? 0.075 : u < 1.25 ? 0.045 : u < 1.85 ? 0.070 : 0.030),
      weights: sleeveWeights(bone),
      lateral: Math.sign(shoulder.x) || 1,
      floorY: null,
      floorFrom: 0,
    }, out);
  }
  return finish(out, rig, material, 'Wardrobe_Sleeves');
}

// ---------------------------------------------------------------------------
// Nightdress skirt
// ---------------------------------------------------------------------------

// The pack's torso IS the t-shirt — hide it and the body has a hole from the
// collarbone to the hips — so the nightdress reuses that mesh for its bodice
// and only the skirt below the hem has to be built.
//
// This one is not a tube. The nightdress is worn lying down and nowhere else —
// the villa swaps it in when she gets onto a bed and takes it off when she gets
// up — and an ellipse swept off the hips reads as a lampshade: it stands clear
// of the legs the whole way round, and it closes on a flat lid the shins come
// out of. Cloth on a body on its back does something much more specific. It is
// held up only by what is under it and lies on the sheet everywhere else, so
// each ring here is a drape curve rather than a section: a plateau carried over
// the supports beneath it, sagging where they part, falling away outside them.
// The supports themselves open up down the length — one hip-wide mound at the
// waist becoming two thigh-wide ones by the hem — and that is what puts the
// valley between the legs and spills the hem flat onto the bed.
//
// Authored in the bind pose, where +Z is the body's front: the way she faces,
// and therefore up once she is on her back.

// What is under the cloth. Widths are in units of the rig's own half hip span
// and heights in units of its hip-to-knee drop, so the skirt follows whatever
// skeleton ships. `sep` is how far apart the two supports sit either side of
// the ring's centreline, `cx` where that centreline is, `rx` the half-width of
// one support, `crest` how high it stands off the sheet and `wide` how far the
// cloth reaches across it.
//
// The supports are the legs as they *lie*, not as they are bound, and these are
// read off the posed girl ring by ring rather than guessed. Two stations were
// never enough for that. Below the hip the body stops being a pelvis and
// becomes two legs within a single ring — 5 cm of daylight between them one
// ring down — while everything after that changes slowly and almost linearly
// all the way to the knee. Lerping one against the other made the transition
// far too slow: eight rings down the model still had a single pelvis-wide mound
// crested on the centreline, while the real thighs sat at ±1 half-span either
// side of it and walked straight out through the flanks of the cloth.
//
// `cx` is the one that cannot be symmetric. Lying down she does not only spread
// her legs, she lets the whole lower half fall to one side: hips 21.4 cm apart
// centred under the pelvis, knees 25.8 cm apart but centred 4 cm to the left of
// it. Supports set symmetrically about the pelvis therefore miss BOTH knees by
// 4 cm — one inboard, one outboard. So the centreline drifts with the legs, in
// signed half hip spans, and `sep` stays symmetric about that.
//
// `under` is how far the leg is off the mattress, and it is not a detail: she
// is not lying flat. She rests on the sheet at the hips and her legs climb away
// from it, 3 cm of daylight beneath them at the top of the thigh and 8 cm by
// the knee. A skirt is a tube, so its back panel has to go up into that gap and
// pass under each thigh. Left as a flat panel on the mattress the cloth ran 8 cm
// BELOW the leg it was supposed to be wrapping, and the garment simply stopped
// where it met the bed instead of continuing round.
//
// `rx` is the one that has to be measured rather than eyeballed, because it is
// what separates the two legs. Ray-cast across each ring of the posed girl, a
// thigh is 15.5 cm wide just under the crotch and 10.8 cm at the hem — half
// spans of 0.75 and 0.51. Carrying the ease inside `rx` instead (0.94 and 0.70,
// which is what these read before) inflates each support by nearly 4 cm: the
// two of them then overlap on the centreline, the valley between the legs
// closes to 1.9 cm, and the pair fuses into one 42 cm dome with a flat top.
// That is the slab the skirt used to be — no legs readable under it, and the
// fall starting 4 cm outboard of the leg it was supposed to be leaving, which
// is the hard straight edge that stood up out of the bed. Ease is now a
// separate offset (`SKIRT_EASE`) so widening the cloth cannot close the gap.
const SKIRT_PELVIS = { wide: 1.58, sep: 0.00, cx: 0.00, rx: 1.80, crest: 0.452, under: 0.000 };
const SKIRT_THIGH = { wide: 2.00, sep: 1.03, cx: 0.00, rx: 0.75, crest: 0.449, under: 0.065 };
const SKIRT_KNEE = { wide: 2.00, sep: 1.19, cx: 0.36, rx: 0.51, crest: 0.409, under: 0.178 };
// The datum `crest` and `under` are measured from. Nothing rests on it — it is
// only the zero the leg sections are quoted against — so it stays a single
// plane whatever the bedding under it does.
const SKIRT_BED = -0.270;
// The bedding, which is a different thing and is NOT one plane. She lies with
// her back on the duvet, and the beds lay a throw across their foot end 2.5 cm
// proud of it — so the cloth pools on the duvet from the hip to mid thigh and
// on the throw from there to the hem. Pinning the whole pool to the throw
// left the top third of the skirt hanging 3.4 cm above the duvet it was
// supposed to be lying on: the hem stopped in mid-air beside her hip instead
// of reaching the bed, which is the edge that read as cloth driven into the
// mattress rather than folded onto it. `SKIRT_DUVET` lands on her own back
// plane — she is the one thing guaranteed to be touching the bedding — and
// `SKIRT_THROW` steps up over the throw across the rings that cross its edge.
const SKIRT_DUVET = -0.324;   // the plane her back rests on
const SKIRT_THROW = 0.055;    // the throw laid over it, in drops (2.5 cm)
const SKIRT_THROW_AT = [0.33, 0.43];   // where the skirt crosses the throw edge
const SKIRT_SHEET = 0.010;    // cloth pool over the bedding, in drops
// Ease: how far the cloth stands off the body, as one offset applied to the
// support in every direction. Held here rather than inside `rx` so that
// loosening the fit can only lift the cloth off a leg — never widen a leg into
// its neighbour, which is what closed the valley when the two were conflated.
// A centimetre is about a slip's worth: enough that the drape reads as cloth
// over her rather than a cast of her, and little enough that both thighs stay
// separately readable under it all the way to the hem.
const SKIRT_EASE = 0.022;     // in drops, ≈ 1 cm
//
// A leg is a cylinder lying on a mattress, and that is not the same silhouette
// as half an ellipse. Its top runs from 2R on the axis down to R at its widest
// point, and only THEN does it fall away — so the cloth stays high out to the
// full width of the leg. Taken as `crest·√(1-d²)` the cloth instead dived to
// 0.7R while the leg surface was still at R, and the thigh came through it
// along a horizontal line the whole length of the skirt. `crest` is the height
// on the axis, i.e. 2R, and the profile below rebuilds the cylinder from it.
//
// Where the cloth leaves the leg — at its widest point, height R, tangent
// vertical — it is holding nothing and simply falls. `FOLD` is how far out it
// lands, as a fraction of that height, and `POOL` how much then lies out flat
// on the sheet. Without them the cloth ran in one straight facet from the leg
// to a pinned edge, which is the vertical arc that looked driven into the
// mattress instead of folded onto it.
//
// Both are small on purpose, and this is the difference between a nightdress
// and a bedsheet. A bias-cut slip is drafted hips/4 + 3/8" at the hip and
// hips/4 + 1" at the hem: the hem is 1.6% wider than the hips, over the whole
// garment. There is essentially no flare in one. Everything it does it does by
// clinging — it takes the shape of what is under it and breaks into a few soft
// folds — so the cloth has to land beside the thigh, not spread out around her.
// At 0.85 and 0.30 it reached 11 cm past each leg and lay there, which is
// several times the entire ease of the real garment, and read as a sheet
// thrown over her however well the fold itself was shaped.
//
// `POOL` is measured from where the fall lands, so it only means what it says
// once the fall starts at the real edge of the leg. It does now, and 1 cm of
// pool past it was not enough cloth to read as resting on anything: the hem
// touched the bed on a line and stood straight back up. Just under 3 cm lets
// the hem lie down beside each thigh — which is the whole of what the garment
// does at the bed — and is still a third of what read as a bedsheet.
const SKIRT_FOLD = 0.40;      // fall-out, in units of the height it falls from
const SKIRT_POOL = 0.25;      // cloth lying flat past the fold, in half hip spans
// Cling, again: a slip sits ON the thigh, and the deep sink between the legs is
// the single thing that reads as two legs under silk instead of one draped
// mass. The old sag bridged that gap nearly flat.
const SKIRT_SLACK = 0.024;    // how far the silk floats off whatever carries it
const SKIRT_SAG = 0.012;      // slack per sample, i.e. how far a span gives up
const SKIRT_GATHER = 0.013;   // depth of the soft folds, in hip-to-knee drops
const SKIRT_FOLD_PITCH = 0.9; // and how far apart they run, in half hip spans
const SKIRT_PASSES = 400;     // enough for the drape to settle across a ring
const SKIRT_RINGS = 15;
// Even: half the loop is the drape, half the sheet. The fold is only 6 cm of
// the span, so at 44 the whole fall got two samples and read as a crease in
// sheet metal however well it was shaped.
const SKIRT_RADIAL = 96;
// calf_l is in the list only so findRig picks a mesh that reaches past the hip:
// the t-shirt knows about the pelvis and the thighs but stops there, and the
// hem is measured off the knee.
const SKIRT_BONES = ['pelvis', 'thigh_l', 'thigh_r', 'calf_l'];

/**
 * Settles one ring of cloth onto whatever is underneath it.
 *
 * `floor` is the body-and-sheet silhouette sampled across the ring; the cloth
 * starts lying on it and is then pulled up towards the straight line between
 * its neighbours, over and over. That is a taut string over obstacles: it wraps
 * whatever it touches, leaves in a straight span wherever the body drops away
 * beneath it, and never passes through anything. `sag` is the slack it keeps
 * per sample, which is what turns the span between the two thighs into a
 * shallow catenary rather than a drum-tight bridge — silk gives, but it does
 * not pour into a 10 cm gap.
 *
 * The ends are pinned: that is the hem lying out on the sheet.
 */
function settleDrape(floor, sag) {
  const z = floor.slice();
  for (let pass = 0; pass < SKIRT_PASSES; pass++) {
    for (let i = 1; i < z.length - 1; i++) {
      const taut = 0.5 * (z[i - 1] + z[i + 1]) - sag;
      if (taut > z[i]) z[i] = taut;
    }
  }
  return z;
}

/**
 * The same string, read the other way up: the skirt's back panel.
 *
 * This one is not lying on anything — it is the underside of a tube. Samples
 * touching a thigh stay pinned to that underside profile; only the unsupported
 * spans between and outside the legs relax down towards their neighbours. The
 * mattress is the lower limit and the two outer ends remain on it. Without the
 * contact pins the relaxation also lowered the cloth beneath both thighs, so
 * almost the entire back panel disappeared into the bed.
 */
function settleUnder(cap, contact, bed, sag) {
  const z = cap.slice();
  for (let pass = 0; pass < SKIRT_PASSES; pass++) {
    for (let i = 1; i < z.length - 1; i++) {
      if (contact[i]) continue;
      const taut = 0.5 * (z[i - 1] + z[i + 1]) - sag;
      if (taut < z[i]) z[i] = taut;
      if (z[i] < bed) z[i] = bed;
    }
  }
  return z;
}

export function buildNightSkirt(root, material) {
  const rig = findRig(root, SKIRT_BONES);
  if (!rig) return null;
  const { indexOf, pos } = restReader(rig);
  const pelvis = pos('pelvis');
  const thighL = pos('thigh_l'), thighR = pos('thigh_r');
  // The hem is measured down the leg rather than assumed, so it sits at the
  // same place on any rig the pack ships.
  const knee = pos('calf_l');
  const drop = thighL.y - knee.y;
  const hipHalf = Math.abs(thighL.x - thighR.x) / 2;
  // Signed, so `cx` below drifts towards the left thigh whichever way the rig
  // happens to lay its X out.
  const hipSigned = (thighL.x - thighR.x) / 2;
  const axisX = (thighL.x + thighR.x) / 2, axisZ = (thighL.z + thighR.z) / 2;
  const waistY = pelvis.y + 0.09;          // buried under the bodice
  // Just above the knee, which is what SKIRT_KNEE describes: its `sep` of 1.19
  // half-hip-spans is the gap between the legs where the CALVES start, not
  // where the thighs are. At 0.62 the hem landed 17 cm up the thigh wearing a
  // section cut for the knee — too wide for where it sat, and cut off square.
  const hemY = thighL.y - 0.95 * drop;
  const out = { pos: [], tri: [], idx: [], wgt: [] };
  const ss = THREE.MathUtils.smoothstep;
  const mix = (a, b, t) => a + (b - a) * t;

  // How far the back of the body reaches behind the rig, in this same
  // geometry space: the plane backReach() rests on the duvet. The hard-coded
  // bed depth below is only a guess at that plane, so the sheet is clamped to
  // never go under it.
  let backZ = Infinity;
  const skin = rig.geometry.attributes.position;
  for (let i = 0; i < skin.count; i++) backZ = Math.min(backZ, skin.getZ(i));

  // Every vertex rides the pelvis alone. The drape is authored over the legs
  // as they already LIE (see the supports above), so weighting the cloth to
  // the thighs re-applied the lying leg roll on top of the authored one: the
  // hem swung with the thighs, stretching the span between the legs into a
  // torn sheet and dragging the underside through the mattress. The lying
  // pose never animates the legs, so a skirt rigid on the pelvis keeps the
  // authored fit exactly.
  const weights = () => ({
    idx: [indexOf('pelvis'), 0, 0, 0],
    wgt: [1, 0, 0, 0],
  });

  const p = new THREE.Vector3();
  const half = SKIRT_RADIAL / 2;
  const base = out.pos.length / 3;
  const floor = new Array(half);
  const ceil = new Array(half);
  const underContact = new Array(half);
  let waistMid = 0;
  for (let r = 0; r < SKIRT_RINGS; r++) {
    const k = r / (SKIRT_RINGS - 1);
    // Pelvis handing over to two legs: fast, because it happens inside one
    // ring, and finished by the first ring clear of the bodice. Then thigh to
    // knee: slow and linear, which is how the legs themselves taper.
    const e = ss(k, 0.07, 0.22);
    const t = THREE.MathUtils.clamp((k - 0.21) / 0.79, 0, 1);
    const station = key => mix(SKIRT_PELVIS[key], mix(SKIRT_THIGH[key], SKIRT_KNEE[key], t), e);

    // Ease inflates the support in every direction at once — wider, higher,
    // and lower — so the cloth stands the same centimetre off the leg all the
    // way round it instead of only across the top.
    const ease = drop * SKIRT_EASE;
    const sep = hipHalf * station('sep');
    const rx = hipHalf * station('rx') + ease;
    // Centreline of this ring: under the pelvis at the waist, following the
    // legs where they have fallen by the knee.
    const cx = axisX + hipSigned * station('cx');
    // The datum the leg sections are quoted against, never above the back that
    // rests on the bed.
    const zBed = Math.max(axisZ + drop * SKIRT_BED, backZ);
    // …and the bedding the CLOTH pools on, which is a step, not a plane: the
    // duvet under her hips and the throw over it from mid thigh down.
    const zBedding = Math.max(axisZ + drop * SKIRT_DUVET, backZ)
      + drop * SKIRT_THROW * ss(k, SKIRT_THROW_AT[0], SKIRT_THROW_AT[1]);
    const zSheet = zBedding + drop * SKIRT_SHEET;
    const slack = drop * SKIRT_SLACK * ss(k, 0, 0.35);
    const y = mix(waistY, hemY, k);
    // The leg as a section: its underside `lift` off the sheet, its top at
    // `peak`, so its axis sits midway and its vertical radius is half the
    // difference. Both surfaces come off the same ellipse, which is what keeps
    // the tube closed around it.
    const peak = drop * station('crest') + ease;
    const lift = drop * station('under') - ease;
    const axisH = 0.5 * (peak + lift), ry = 0.5 * (peak - lift);
    // Where the cloth parts company with the leg: its widest point, tangent
    // already vertical. Everything outside this is the fold.
    const shed = sep + rx, shoulder = axisH;
    const foldOut = SKIRT_FOLD * shoulder;
    // A hem is a free edge, so the last few centimetres draw in instead of
    // ending on a square corner. But the cloth has to reach past the fold and
    // still have something left to lie out on the sheet, whatever the authored
    // width says — pinning its edge any closer is what stood the fall up into
    // a wall and drove it into the mattress.
    const wide = Math.max(
      hipHalf * station('wide') * (1 - 0.17 * ss(k, 0.84, 1)),
      shed + foldOut + hipHalf * SKIRT_POOL);
    const xAt = j => wide * (1 - 2 * j / (half - 1));

    // Sample what is under this ring. Three regions, and only the first is
    // something the cloth rests ON:
    //
    //   over a leg      the cylinder, R·(1 + √(1-d²)) off the sheet
    //   between them    the sheet, which the settle then bridges into a valley
    //   outside them    nothing — the fold, which is not settled at all
    //
    // The fold has to be built rather than settled because settleDrape pulls
    // samples UP towards their neighbours. Given a pinned outer edge it drew
    // the fall as one straight span from the leg to the pin, and a straight
    // span off a body 20 cm above a mattress is a wall. Cloth with nothing
    // under it does the opposite: it leaves the leg on the vertical tangent it
    // was already following, curves out as it loses height, and lands flat.
    // `(1-u)²` is that in one line — steep where it leaves, tangent to the
    // sheet where it arrives — and past the fold it simply lies there.
    for (let j = 0; j < half; j++) {
      const ax = Math.abs(xAt(j));
      const d = Math.abs(ax - sep) / rx;
      const bulge = d < 1 ? ry * Math.sqrt(1 - d * d) : 0;
      underContact[j] = d < 1;
      if (underContact[j]) {
        floor[j] = zBed + axisH + bulge;
        ceil[j] = zBed + axisH - bulge;
        continue;
      }
      ceil[j] = zBed + peak;                                 // no leg: nothing in the way
      if (ax < sep) { floor[j] = zSheet; continue; }         // the valley between the legs
      const u = Math.min(1, (ax - shed) / foldOut);
      floor[j] = zSheet + (zBed + shoulder - zSheet) * (1 - u) ** 2;
    }
    floor[0] = floor[half - 1] = zSheet;
    ceil[0] = ceil[half - 1] = zSheet;
    underContact[0] = underContact[half - 1] = true;
    const cloth = settleDrape(floor, drop * SKIRT_SAG);
    // The settle is for spans held up at both ends. Outside the outermost leg
    // nothing holds the cloth up, so the fold stands as built.
    for (let j = 0; j < half; j++) if (Math.abs(xAt(j)) > shed) cloth[j] = floor[j];
    // The back panel stays wrapped immediately beneath both thighs while its
    // three unsupported spans droop towards the sheet. This is the half that
    // makes it a skirt rather than something laid over her.
    // The back panel is not draped under gravity like the front — it is a tube
    // wall trapped between the thighs and the mattress.  Using the full SKIRT_SAG
    // here caused every free span to sag by 8+ cm on 12 samples, which drove the
    // entire back panel to zBed and left only the mattress visible from below.
    // At 3 % of the front sag the catenary between the under-thigh pins forms
    // correctly: the valley holds at ≈ lift height (2 cm) and the fold outside
    // each thigh ramps smoothly down to the sheet.
    const back = settleUnder(ceil, underContact, zSheet, drop * SKIRT_SAG * 0.03);
    // Front and back are one tube and cannot trade places. Keep the underside
    // behind the front rather than lifting the visible valley to meet it. The
    // tiny separation avoids coplanar faces while tapering to zero at the side
    // edges where the two halves join.
    for (let j = 0; j < half; j++) {
      const separation = drop * 0.002 * (1 - (Math.abs(xAt(j)) / wide) ** 4);
      back[j] = Math.max(zSheet, Math.min(back[j], cloth[j] - separation));
    }
    if (r === 0) waistMid = (cloth[half >> 1] + zSheet) / 2;

    for (let j = 0; j < SKIRT_RADIAL; j++) {
      // First half of the loop draws the drape, from one side across to the
      // other; the second half comes back along the panel underneath her, over
      // the same stations in reverse so the two close on the identical edge.
      const onCloth = j < half;
      const jj = onCloth ? j : SKIRT_RADIAL - 1 - j;
      const x = xAt(jj);
      // Soft folds. Bias silk never lies as one smooth developable surface —
      // the whole reason the cut is used is that it takes the shape under it
      // and breaks whatever is left over into a few gathers — and a skirt
      // without them reads as sheeting however well its silhouette is shaped.
      //
      // They ride on how little the cloth is being carried: none at all along
      // the crest over a thigh, where it is pulled tight over something, and
      // deepest in the valley and down the fall, where it is holding its own
      // weight. Pitch is an absolute length rather than a fraction of the ring,
      // so the folds run straight down the skirt instead of splaying with it,
      // and they only ever stand proud — a gather that cut inwards would put
      // the cloth back inside the leg.
      const free = onCloth
        ? 1 - Math.min(1, (cloth[jj] - zBed) / Math.max(peak, 1e-6)) : 0;
      const gather = drop * SKIRT_GATHER * free
        * (0.5 - 0.5 * Math.cos(2 * Math.PI * x / (hipHalf * SKIRT_FOLD_PITCH)));
      // The float is held across the whole span and only let go near the edge,
      // where the hem has to meet the sheet rather than hover over it. The back
      // panel gets none of it: it is pressed between her and the mattress.
      p.set(cx + x, y,
        onCloth ? cloth[jj] + gather + slack * (1 - (Math.abs(x) / wide) ** 3)
          : back[jj]);
      pushVertex(out, p, weights());
    }
  }

  // The waist is capped because it is buried in the bodice. The hem is not: it
  // is the opening the legs come out of, and a lid there is what made the old
  // skirt read as a bucket.
  const cap = out.pos.length / 3;
  pushVertex(out, p.set(axisX, waistY, waistMid), weights());
  for (let j = 0; j < SKIRT_RADIAL; j++) {
    const j2 = (j + 1) % SKIRT_RADIAL;
    for (let r = 0; r < SKIRT_RINGS - 1; r++) {
      const a = base + r * SKIRT_RADIAL, b = a + SKIRT_RADIAL;
      out.tri.push(a + j, b + j, a + j2);
      out.tri.push(a + j2, b + j, b + j2);
    }
    out.tri.push(cap, base + j, base + j2);
  }
  return finish(out, rig, material, 'Wardrobe_NightSkirt');
}
