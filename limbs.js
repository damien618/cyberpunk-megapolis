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
//
// The foot rows (u ≥ 2) are quoted against the finished foot length, because
// that is the unit every anatomy and shoe-last reference uses. Measured on the
// loft it was 0.30 of its length across the heel, 0.36 across the waist and 0.41
// across the ball — a plank that widens gently from end to end. A foot is not
// that shape: it is roughly 0.25 across the heel, pulls IN to about 0.29 at the
// waist, and only then flares to 0.385 at the ball. That waist is most of what
// separates a foot from a slipper, and it was simply missing.
//
// The other half of it is thickness. The top of the foot sat 0.30 of a foot
// length above the ground at the ball — nearly 7 cm on a 22 cm foot, which is
// almost as deep as the heel — where a real forefoot is about 0.155. The `ant`
// column and the path heights in buildBareLegs both come down for that, and the
// soft floor keeps the sole flat underneath while they do.
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
  [1.96, 0.0288, 0.0300, 0.0278, 0.0298, 1.00, 1.00, 1.00],  // malleoli (see MALLEOLUS)
  [2.00, 0.0284, 0.0296, 0.0276, 0.0310, 1.00, 1.00, 0.98],
  [2.08, 0.0288, 0.0296, 0.0292, 0.0356, 0.98, 1.00, 0.92],  // achilles
  [2.18, 0.0296, 0.0300, 0.0330, 0.0540, 0.92, 1.00, 0.74],
  [2.30, 0.0306, 0.0308, 0.0380, 0.0700, 0.86, 1.00, 0.58],  // heel
  [2.45, 0.0322, 0.0328, 0.0370, 0.0470, 0.80, 1.00, 0.44],
  [2.62, 0.0348, 0.0366, 0.0348, 0.0330, 0.74, 1.00, 0.36],  // waist / instep
  [2.80, 0.0400, 0.0430, 0.0300, 0.0300, 0.72, 0.98, 0.34],
  [3.00, 0.0452, 0.0486, 0.0240, 0.0288, 0.70, 0.94, 0.32],  // ball, wider inside
  [3.07, 0.0438, 0.0470, 0.0170, 0.0210, 0.70, 0.92, 0.40],
  [3.12, 0.0420, 0.0450, 0.0128, 0.0172, 0.78, 0.92, 0.52],  // webbing across the toe roots
  [3.18, 0.0390, 0.0418, 0.0106, 0.0150, 0.84, 0.96, 0.62],
  [3.22, 0.0356, 0.0384, 0.0092, 0.0132, 0.90, 0.98, 0.72],  // low forefoot apron
];
const LEG_SPAN = 0.8955;   // hip to ankle on the reference rig
const LEG_END = 3.22;

// One row per toe, hallux first: offset across the forefoot (medial negative),
// radius, length past the metatarsal head, splay in radians, and how far the tip
// drops in units of the toe's own radius. All lengths are in units of the
// ankle-to-ball span, so they follow whatever foot the rig actually has.
//
// The toe line is the whole game here, and it was flat. Measured on the loft,
// the five tips landed within 7 % of each other and the LONGEST was the second —
// five equal stubs across a square end, which is what reads as a comb of
// sausages rather than a foot. A foot ends on a strong oblique: the hallux
// furthest forward, the fifth roughly 0.16 of the foot's length behind it, and
// the three between them stepping back almost evenly. `length` places each tip
// at a measured fraction of the finished foot — 1.00, 0.985, 0.945, 0.895 and
// 0.835 of it, counted from the back of the heel.
//
// Size follows the same rule the drawing books give: the big toe is about twice
// the second, and the fifth is barely half of it. And they are not parallel to
// the ground. The hallux lies flat and can even sweep up a little at the tip;
// every other toe bends down towards the sole, more so the further out it sits,
// until the fifth is curled onto the ground — hence the negative `curl` on the
// first row and a rising one after it.
const TOES = [
  // across, radius, length, splay,  curl
  [-0.232, 0.092, 0.450, -0.020, -0.35],   // hallux
  [-0.086, 0.062, 0.424, 0.004, 0.55],
  [0.034, 0.056, 0.354, 0.016, 0.75],
  [0.138, 0.050, 0.267, 0.034, 0.95],
  [0.226, 0.043, 0.162, 0.058, 1.20],      // fifth, tucked inside the widest point
];
// Toe cross-section, u = 0 at the buried root to 1 at the tip. Radii are
// fractions of the toe's own radius. The root is only a little taller than the
// pad: making it more than twice the radius produced five upright fingers when
// the sole faced the camera. `ex` below 1 gently squares the sides so adjacent
// toes share a shallow cleft, and `enP` keeps their pads flat on the ground.
const TOE_PROFILE = [
  // u,    lat,  med,  ant,  post,  ex,   enA,  enP
  [0.00, 1.08, 1.08, 1.35, 1.00, 0.76, 0.96, 0.62],
  [0.26, 1.05, 1.05, 1.28, 0.98, 0.78, 0.96, 0.62],
  [0.55, 1.00, 1.00, 1.14, 0.92, 0.82, 0.98, 0.66],  // interphalangeal knuckle
  [0.78, 0.93, 0.93, 0.96, 0.84, 0.88, 1.00, 0.72],
  [0.92, 0.78, 0.78, 0.76, 0.68, 0.94, 1.00, 0.84],
  [1.00, 0.48, 0.48, 0.44, 0.40, 1.00, 1.00, 1.00],  // rounded pulp of the tip
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
      if (warp) warp(u, cs, sn, p, scale, side3, anterior);
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

// The two ankle bones, and they are not a pair: the inner one sits HIGHER and
// further forward, the outer one lower and further back. That asymmetry is the
// single landmark that tells an ankle from a length of pipe, and the profile
// table cannot produce it — both sides of a ring share one `u`, so a bump put
// there comes out level on both sides. They are placed along the sweep instead,
// as a gaussian in `u` pushed out along the ring's own lateral axis.
//
// `at` is where the bone sits on the chain (u = 2 is the joint itself, and u
// counts down the leg, so the smaller number is the higher bone), `spread` its
// reach along it, `out` how far it stands off the shin, and `fwd` how much of it
// is carried onto the front of the ankle rather than the back.
const MALLEOLUS = {
  med: { at: 1.902, spread: 0.052, out: 0.0078, fwd: 0.34 },
  lat: { at: 1.958, spread: 0.056, out: 0.0090, fwd: -0.30 },
};

function malleoliWarp(u, cs, sn, p, scale, side3) {
  const bone = cs < 0 ? MALLEOLUS.med : MALLEOLUS.lat;   // cs < 0 is the inner side
  const along = Math.exp(-(((u - bone.at) / bone.spread) ** 2));
  if (along < 0.02) return;
  // Only the half of the ring facing that side, and biased round it front or
  // back. `**1.5` keeps the bump off the front and back of the joint, where an
  // ankle is flat.
  const round = Math.abs(cs) ** 1.5 * (1 + bone.fwd * sn);
  p.addScaledVector(side3, Math.sign(cs) * bone.out * scale * along * round);
}

function footWarp(u, cs, sn, p, scale, side3) {
  archWarp(u, cs, sn, p, scale);
  malleoliWarp(u, cs, sn, p, scale, side3);
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
        along(ankle, 0.02, ankle.y - 0.36 * L),   // rounds the back of the heel
        along(ankle, 0.42, soleY + 0.13 * L),     // arch
        along(flatBall, 0, soleY + 0.10 * L),
        along(flatBall, 0.05, soleY + 0.082 * L),
        along(flatBall, 0.10, soleY + 0.068 * L),   // low webbing joins the toe roots
        along(flatBall, 0.16, soleY + 0.058 * L),
        along(flatBall, 0.20, soleY + 0.054 * L),   // apron hides the finger-like bases
      ],
      pathU: [0, 1, 2, 2.30, 2.62, 3.0, 3.07, 3.12, 3.18, LEG_END],
      profile: LEG_PROFILE,
      scale: hip.distanceTo(ankle) / LEG_SPAN,
      // Tight through 1.80–2.10: the two ankle bones are only a couple of
      // centimetres across, and at the old 4 cm step each one got a ring and a
      // half and came out as a facet.
      rings: ringParams(0, LEG_END, u => u < 0.72 ? 0.090
        : u < 1.30 ? 0.048 : u < 1.78 ? 0.070 : u < 2.10 ? 0.026 : u < 3.05 ? 0.045 : 0.030),
      weights: legWeights(bone),
      lateral: Math.sign(hip.x) || 1,
      floorY: soleY,
      floorFrom: 2,
      warp: footWarp,
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

  for (const [offset, radius, length, splay, curl] of TOES) {
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
        root.clone().addScaledVector(dir, (0.22 + length * 0.55) * L).setY(root.y - 0.30 * curl * r),
        root.clone().addScaledVector(dir, (0.22 + length) * L).setY(root.y - curl * r),
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
