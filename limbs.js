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

// ---------------------------------------------------------------------------
// Cross-section tables. Radii are in metres, measured against the reference
// span noted with each table and rescaled to whatever skeleton is loaded.
// `lat`/`med` are the outer and inner sides, `ant`/`post` the front and back —
// on the leg those become the top of the foot and the sole once the loft turns
// the corner at the ankle. `ex`/`enA`/`enP` are super-ellipse exponents: 1 is a
// plain ellipse, lower values square the section off, which is what flattens
// the sole without creasing the edge where it wraps up into the sides.
// ---------------------------------------------------------------------------

// Chain parameter: 0 hip, 1 knee, 2 ankle, 3 ball of the foot, 3.5 toe tip.
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
  [3.15, 0.0430, 0.0458, 0.0258, 0.0296, 0.70, 0.90, 0.32],
  [3.28, 0.0418, 0.0444, 0.0224, 0.0288, 0.72, 0.88, 0.34],  // toes stay blunt
  [3.38, 0.0388, 0.0410, 0.0192, 0.0272, 0.74, 0.86, 0.38],
  [3.45, 0.0322, 0.0338, 0.0154, 0.0236, 0.78, 0.84, 0.46],
  [3.50, 0.0150, 0.0156, 0.0080, 0.0132, 0.86, 0.86, 0.62],  // tip
];
const LEG_SPAN = 0.8955;   // hip to ankle on the reference rig

// Chain parameter: 0 shoulder, 1 elbow, 2 wrist. Starts above the shoulder so
// the opening is buried in the torso, and ends just past the wrist on a cuff.
//
// Down to the elbow these radii are the t-shirt's own short sleeve plus about
// 5 mm of clearance (measured off its skin weights: 79 mm at the shoulder,
// hem at u = 0.66). Undercutting it is what made the long sleeve read as a
// separate tube bolted onto the shirt — it has to swallow the short sleeve,
// not slide underneath it.
const SLEEVE_PROFILE = [
  // u,     lat,    med,    ant,    post,   ex,   enA,  enP
  [-0.10, 0.0620, 0.0610, 0.0600, 0.0620, 1.00, 1.00, 1.00],  // buried opening
  [-0.04, 0.0740, 0.0726, 0.0710, 0.0736, 1.00, 1.00, 1.00],  // shoulder seam
  [0.00, 0.0828, 0.0812, 0.0792, 0.0822, 1.00, 1.00, 1.00],   // deltoid
  [0.10, 0.0845, 0.0828, 0.0808, 0.0840, 1.00, 1.00, 1.00],
  [0.20, 0.0840, 0.0824, 0.0806, 0.0836, 1.00, 1.00, 1.00],
  [0.30, 0.0810, 0.0794, 0.0778, 0.0806, 1.00, 1.00, 1.00],
  [0.42, 0.0744, 0.0730, 0.0722, 0.0740, 1.00, 1.00, 1.00],
  [0.55, 0.0692, 0.0680, 0.0678, 0.0686, 1.00, 1.00, 1.00],
  [0.70, 0.0650, 0.0640, 0.0636, 0.0646, 1.00, 1.00, 1.00],   // past the short hem
  [0.85, 0.0568, 0.0560, 0.0554, 0.0566, 1.00, 1.00, 1.00],
  [0.94, 0.0518, 0.0512, 0.0504, 0.0522, 1.00, 1.00, 1.00],
  [1.00, 0.0508, 0.0502, 0.0488, 0.0532, 1.00, 1.00, 1.00],   // olecranon
  [1.08, 0.0506, 0.0500, 0.0492, 0.0520, 1.00, 1.00, 1.00],   // fabric bunching
  [1.20, 0.0498, 0.0494, 0.0498, 0.0486, 1.00, 1.00, 1.00],
  [1.32, 0.0488, 0.0486, 0.0492, 0.0472, 1.00, 1.00, 1.00],   // flexor swell
  [1.48, 0.0458, 0.0456, 0.0460, 0.0442, 1.00, 1.00, 1.00],
  [1.65, 0.0408, 0.0406, 0.0406, 0.0396, 1.00, 1.00, 1.00],
  [1.82, 0.0348, 0.0348, 0.0342, 0.0338, 1.00, 1.00, 1.00],
  [1.94, 0.0310, 0.0310, 0.0302, 0.0300, 1.00, 1.00, 1.00],
  [2.00, 0.0300, 0.0300, 0.0290, 0.0290, 1.00, 1.00, 1.00],   // wrist
  [2.03, 0.0316, 0.0316, 0.0306, 0.0306, 1.00, 1.00, 1.00],   // cuff lip
  [2.06, 0.0264, 0.0264, 0.0256, 0.0256, 1.00, 1.00, 1.00],
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
function loft({ points, pathU, profile, scale, rings, weights, lateral, floorY, floorFrom, warp }, out) {
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
    for (let j = 0; j < RADIAL; j++) {
      const th = (j / RADIAL) * Math.PI * 2;
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
  const last = base + (rings.length - 1) * RADIAL;
  for (let j = 0; j < RADIAL; j++) {
    const j2 = (j + 1) % RADIAL;
    for (let r = 0; r < rings.length - 1; r++) {
      const a = base + r * RADIAL, b = a + RADIAL;
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
        along(flatBall, 0.30, soleY + 0.20 * L),
        along(flatBall, 0.50, soleY + 0.17 * L),
      ],
      pathU: [0, 1, 2, 2.30, 2.62, 3.0, 3.28, 3.5],
      profile: LEG_PROFILE,
      scale: hip.distanceTo(ankle) / LEG_SPAN,
      rings: ringParams(0, 3.5, u => u < 0.72 ? 0.090
        : u < 1.30 ? 0.048 : u < 1.78 ? 0.070 : u < 2.10 ? 0.040 : u < 3.05 ? 0.045 : 0.035),
      weights: legWeights(bone),
      lateral: Math.sign(hip.x) || 1,
      floorY: soleY,
      floorFrom: 2,
      warp: archWarp,
    }, out);
  }
  return finish(out, rig, material, 'Wardrobe_BareLegs');
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
