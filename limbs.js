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
// with a cross-section table carrying the grading — how thick the limb is at
// each height — and a set of warps carrying the landmarks the table cannot,
// because every point on one of its rings shares a single height and so comes
// out as a belt right round the limb. The landmarks are the kneecap and the
// grooves beside it, the two femoral condyles staggered high and low, the
// tibial tuberosity, the popliteal hollow and the hamstring cords above it,
// vastus medialis, both malleoli, the hollows beside the Achilles and the
// arch; then deltoid, olecranon, forearm swell and a cuff on the arm.
//
// Each is a single SkinnedMesh bound to the character's own skeleton, so it
// bends with every existing animation clip.
import * as THREE from 'three';

const RADIAL = 20;
const TOE_RADIAL = 10;   // a 6 mm toe does not need the leg's ring density
// The leg carries the finest landmarks on the body: the kneecap is 40 mm across
// and the grooves beside it 15 mm. At 20 segments a knee ring is 19 mm to a
// face, so the plate had barely two vertices to exist on and the grooves none —
// no depth of bump can draw a shape the ring has no room for. 32 brings a face
// down to 12 mm. The arms keep RADIAL; nothing on them is that small.
const LEG_RADIAL = 32;

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
//
// The leg rows (u < 2) are graded from measured circumferences rather than
// eyeballed radii, because the eye judges a leg by its silhouette and the
// silhouette is the circumference. Sliced, the first pass came out as a plain
// cone: 55 cm at the gluteal fold, then 45 / 37 / 33 / 33.5 / 19 down to the
// ankle. Only the top of it was right. Three separate things were wrong with
// the rest, and all three read as "too thin" in shorts:
//
//   - The knee measured 33.3 against a 33.5 calf. On a real leg the knee is the
//     WIDER of the two — the femoral condyles are the broadest bone in the limb
//     — so the leg had nothing at the joint and the thigh simply ran on into
//     the shin.
//   - The calf peaked 0.2 cm above the narrowest point below the knee. That is
//     not a calf, it is a straight taper with a rumour of one.
//   - The ankle came out at 18.9 against a 33.5 calf, a ratio of 0.56 where the
//     figure quoted everywhere for a woman is 0.63 — about 3 cm too narrow, and
//     the narrowest point of the whole leg is exactly where a stick silhouette
//     gives itself away.
//
// The column is now anchored on four measurements taken from adult female
// anthropometry, scaled to the slim build this character actually has, and the
// rows between them interpolate: upper thigh 55.5, mid thigh 47.6, knee 36.0,
// max calf 35.2, minimum ankle 22.1 — which puts knee/calf at 1.02, ankle/calf
// at 0.63 and mid-thigh/calf at 1.35, all inside the published ranges.
//
// Those are the table's own figures, and the knee is no longer one of them: the
// bony landmarks added below stand proud of the table and a tape measure catches
// them, so the FINISHED loft slices at 37.6 cm round the kneecap rather than
// 36.0. That is the right way round — a tape does go over the condyles — and it
// leaves knee/calf at 1.06, still inside the range. The sequence down the joint
// now reads 40.0 across the lower thigh, 36.6 at the waist above the kneecap,
// 37.6 at the kneecap itself and 33.4 at the narrowest point below it.
//
// Cross-sections are no longer near-circular either, because legs are not. The
// upper thigh is deeper than it is wide (glute and hamstring behind it), the
// knee is markedly wider than deep, the calf is deeper than wide and carries
// nearly all of that depth behind the bone, and the ankle goes back to deeper
// than wide because the Achilles stands off the back of it. Below the calf,
// `enA` squares the front off a little for the flat anteromedial face of the
// tibia — the one place on the leg where you feel bone straight under skin.
const LEG_PROFILE = [
  // u,    lat,    med,    ant,    post,   ex,   enA,  enP
  [0.00, 0.0871, 0.0830, 0.0840, 0.0989, 1.00, 1.00, 1.00],  // gluteal fold, 55.5 cm
  [0.12, 0.0855, 0.0822, 0.0832, 0.0915, 1.00, 1.00, 1.00],
  [0.28, 0.0816, 0.0793, 0.0800, 0.0825, 1.00, 1.00, 1.00],
  [0.46, 0.0773, 0.0750, 0.0750, 0.0758, 1.00, 1.00, 1.00],  // mid thigh, 47.6 cm
  [0.64, 0.0714, 0.0707, 0.0690, 0.0690, 1.00, 1.00, 1.00],  // where the shorts hem falls
  [0.80, 0.0652, 0.0665, 0.0633, 0.0621, 1.00, 1.00, 1.00],
  [0.90, 0.0618, 0.0650, 0.0604, 0.0559, 1.00, 1.00, 1.00],  // vastus medialis (see VASTUS)
  [1.00, 0.0605, 0.0624, 0.0582, 0.0477, 1.00, 1.00, 1.00],  // knee 36.0: wide, hollow behind
  [1.09, 0.0564, 0.0582, 0.0541, 0.0501, 1.00, 1.00, 1.00],  // condyles
  [1.20, 0.0534, 0.0539, 0.0483, 0.0569, 1.00, 1.00, 1.00],  // narrowest below the knee
  [1.26, 0.0546, 0.0536, 0.0455, 0.0649, 1.00, 1.00, 1.00],  // calf, outer head — sits higher
  [1.35, 0.0513, 0.0576, 0.0456, 0.0690, 1.00, 1.00, 1.00],  // calf, inner head — lower, fuller
  [1.45, 0.0501, 0.0557, 0.0438, 0.0664, 1.00, 0.95, 1.00],
  [1.60, 0.0458, 0.0482, 0.0402, 0.0558, 1.00, 0.93, 1.00],  // flat face of the tibia
  [1.75, 0.0391, 0.0403, 0.0361, 0.0457, 1.00, 0.95, 1.00],  // achilles taper
  [1.88, 0.0349, 0.0359, 0.0339, 0.0414, 1.00, 0.98, 1.00],
  [1.94, 0.0323, 0.0332, 0.0338, 0.0402, 1.00, 1.00, 1.00],  // waist, above the bones: 21.9 cm
  [2.00, 0.0337, 0.0351, 0.0329, 0.0401, 1.00, 1.00, 0.98],  // malleoli (see MALLEOLUS)
  [2.08, 0.0335, 0.0345, 0.0339, 0.0423, 0.98, 1.00, 0.92],
  [2.18, 0.0329, 0.0337, 0.0333, 0.0537, 0.92, 1.00, 0.74],  // achilles into the heel
  [2.30, 0.0311, 0.0317, 0.0380, 0.0700, 0.86, 1.00, 0.58],  // heel
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
  radial = RADIAL, anterior0 = null }, out) {
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
  // Seed for the parallel transport below. It only has to be non-parallel to
  // the first tangent: a limb starts vertical so +Z serves, but the sandal sole
  // sweeps horizontally along the foot and needs +Y instead, or the very first
  // reprojection collapses to zero and every ring after it is garbage.
  const anterior = anterior0 ? anterior0.clone().normalize() : new THREE.Vector3(0, 0, 1);
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
      if (warp) warp(u, cs, sn, p, scale, side3, anterior, c);
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
// way round instead of pinching on one side. Four slots is enough: the calf is
// already at zero by the time the toes start bending, so those two share one.
//
// The ankle blend used to run 1.86 → 2.00, which is a 6 cm band sitting entirely
// ABOVE the joint it is meant to bend at. Pointing the foot then folded the skin
// along the top of the shin rather than through the ankle, and put the whole
// crease above the bones — the fold you can see in the lying pose. It is now
// centred on the joint (u = 2.04) and a little wider, so the malleoli sit in the
// shared middle of it and stay with the shin as the foot swings, which is where
// they actually are: they are the ends of the tibia and fibula, not of the foot.
function legWeights(bone) {
  const ss = THREE.MathUtils.smoothstep;
  return u => {
    const pelvis = 0.4 * (1 - ss(u, 0, 0.22));   // the crotch stays with the hips
    const knee = ss(u, 0.84, 1.18);
    const ankle = ss(u, 1.90, 2.18);
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
// Where they go matters more than how big they are, and the first attempt put
// them at u = 1.90 and 1.96. Sliced afterwards, that landed both bumps a good
// 0.07 of a foot length ABOVE the joint — up the shin, with the ankle below them
// running dead straight at 0.23 of a foot length across from the bones all the
// way down to the heel. A real ankle does the opposite: it is narrowest ABOVE
// the malleoli and widest AT them, ~0.29 of a foot length across, before drawing
// back in to the heel. The bones now straddle u = 2, which is the joint itself,
// and the table above carries the waist that makes them read.
//
// `at` is where the bone sits on the chain (u counts down the leg, so the
// smaller number is the higher bone), `spread` its reach along it, `out` how far
// it stands off the shin, and `fwd` how much of it is carried onto the front of
// the ankle rather than the back.
const MALLEOLUS = {
  med: { at: 2.005, spread: 0.055, out: 0.0072, fwd: 0.34 },
  lat: { at: 2.075, spread: 0.058, out: 0.0084, fwd: -0.30 },
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

// The hollows either side of the Achilles. Above the heel the tendon stands
// proud as a flat band with a soft pit beside it on each side, and a swept tube
// has neither — it leaves one convex sweep running from the calf straight into
// the heel, which is the back view that reads as hose rather than ankle. Pulling
// the two back quarters of the ring inwards cuts the pits and what is left
// standing between them is the tendon. Strongest on the diagonal, fading out
// towards the tendon itself and towards the malleoli in front of it.
const ACHILLES = { at: 1.98, spread: 0.105, in: 0.0060 };

function achillesWarp(u, cs, sn, p, scale, side3) {
  if (sn >= 0) return;                                   // back of the ring only
  const along = Math.exp(-(((u - ACHILLES.at) / ACHILLES.spread) ** 2));
  if (along < 0.02) return;
  const round = Math.abs(cs) ** 0.7 * Math.abs(sn) ** 1.5;
  p.addScaledVector(side3, -Math.sign(cs) * ACHILLES.in * scale * along * round);
}

// The teardrop above the inner knee — the lower head of vastus medialis. On a
// standing leg it is the widest thing on the bottom third of the thigh, and it
// is on ONE SIDE, so the profile table can only chase it by inflating the whole
// ring. That is what used to round the lower thigh off into a cone: the table
// carried a little extra `med` at u = 0.90 and it came out as a slightly fatter
// tube rather than a muscle. Here it is a swell on the inner side, carried
// forward onto the front of the thigh and dying out before the knee, which is
// where it actually stops.
const VASTUS = { at: 0.875, spread: 0.105, out: 0.0058, fwd: 0.40 };

function vastusWarp(u, cs, sn, p, scale, side3) {
  if (cs >= 0) return;                                   // inner side only
  const along = Math.exp(-(((u - VASTUS.at) / VASTUS.spread) ** 2));
  if (along < 0.02) return;
  const round = Math.abs(cs) ** 1.4 * (1 + VASTUS.fwd * sn);
  p.addScaledVector(side3, -VASTUS.out * scale * along * round);
}

// ---------------------------------------------------------------------------
// The knee
// ---------------------------------------------------------------------------
//
// Everything below is quoted in millimetres, because that is the unit the
// anatomy is published in, and converted on the spot. Radii are already metres,
// so those are `× MM`. Distances ALONG the leg are not: `u` is a chain
// parameter, hip to ankle being u = 0..2 across LEG_SPAN, so a millimetre down
// the leg is `U_MM` of it — a shade over two thousandths.
const MM = 0.001;
const U_MM = 2 / (LEG_SPAN * 1000);
const clamp01 = x => THREE.MathUtils.clamp(x, 0, 1);

// A bump with a controllable shoulder, falling to 1/e at `half` either way.
// `hard = 1` is a plain gaussian, which is the right shape for a muscle belly.
// `hard = 2` squares it off into a plate with a defined edge, which is what a
// bone directly under skin looks like and what a gaussian can never give you.
const bump = (d, half, hard = 1) => Math.exp(-(((d / half) ** 2) ** hard));

// The kneecap. None of these landmarks can come out of the profile table, for
// the same reason the malleoli cannot: every point on a ring shares one `u`, so
// a bump entered there is a belt right round the joint, and half of what makes a
// knee is that it is NOT the same all the way round.
//
// The first version of this was one 4.4 mm gaussian with a 39 mm sigma. That is
// a bump 16 cm tall — mid-thigh to mid-shin — standing a third of a centimetre
// proud, and rendered it did exactly what those numbers say: the front of the
// joint came out within half a millimetre of the plain taper, so the leg had no
// knee on it at all. The thigh narrowed, the shin widened, and nothing happened
// in between.
//
// A real patella is a small, hard, flat thing: female series measure it about
// 40 mm across the base by 31–36 mm base to apex and 20 mm thick, and it is the
// shape of a rounded triangle standing on its point — widest along the top,
// narrowing to the apex where the ligament leaves it. So the plate is squared
// off rather than gaussian, it is sized to those numbers, it tapers downwards,
// and — the part that actually makes it read — the grooves either side of it are
// cut deep enough to leave it standing. Without those the front of the knee is
// convex all the way round and the eye has nothing to catch on.
const PATELLA = {
  at: 1.0 - 6 * U_MM,   // the centre rides a little above the joint pivot
  half: 17 * U_MM,      // 34 mm base to apex
  out: 7.6 * MM,
  wide: 0.33,           // 20 mm of arc on a 60 mm knee radius
  taper: 0.40,          // the apex ends up 60 % of the base's width
};

// The hollows flanking it, where the retinaculum falls away to the condyles.
// `at` is a position round the ring, not along the leg: just outside the plate's
// own edge. Depth matters more than the plate's height — 12 mm of step between
// the two is what draws the outline of the kneecap, and either half of it on its
// own is a smudge.
const PARAPATELLAR = { at: 0.55, half: 0.15, depth: 4.4 * MM };

// Above the joint the quadriceps bellies have finished and only tendon crosses
// it, so the leg pinches in before the condyles flare back out — thigh, waist,
// joint. That sequence is most of what says "knee" at a distance, before any of
// the small landmarks are resolvable at all.
//
// Sliced, the loft had the waist: 0.9 mm of it, on a leg 130 mm across, which is
// nothing. Worse, it made the lower thigh the widest part of the whole limb —
// 134 mm at u = 0.85 against 131 mm at the joint — so the leg was still a cone
// and the knee was still the place where the cone stopped narrowing. Taking 3 mm
// a side out of the waist and putting it back on the condyles below inverts that,
// which is the point. Weakest dead centre front, where the tendon itself stands.
const SUPRAPATELLAR = { at: 1.0 - 26 * U_MM, half: 21 * U_MM, in: 3.0 * MM, tendon: 0.45 };

// The patellar ligament and the tibial tuberosity it ends on: a 25 mm band
// running about 45 mm from the apex of the kneecap to the front of the tibia,
// and then the knob you can find on anybody. On a leg this slim the tuberosity
// is the last landmark before the shin goes flat, and it is the one that fixes
// where the knee ENDS — without it the joint fades out into the calf.
const LIGAMENT = { at: 1.0 + 34 * U_MM, half: 22 * U_MM, out: 2.6 * MM, wide: 0.19 };
const TUBEROSITY = { at: 1.0 + 56 * U_MM, half: 15 * U_MM, out: 4.0 * MM, wide: 0.24 };

// The femoral condyles and the head of the tibia beneath them — the pair of
// masses the kneecap sits between. The inner one is the larger and sits LOWER,
// the outer one is smaller and sits HIGHER: the same stagger as the malleoli,
// the other way up. That asymmetry is what stops a knee reading as a swelling,
// and it is exactly what a ring-symmetric table cannot produce. Both are carried
// round onto the BACK of the joint, which is where the condyles are widest.
const CONDYLE = {
  med: { at: 1.0 + 14 * U_MM, half: 22 * U_MM, out: 6.6 * MM, back: 0.30 },
  lat: { at: 1.0 - 2 * U_MM, half: 20 * U_MM, out: 4.6 * MM, back: 0.24 },
};

// The head of the fibula: outer side only, a good 30 mm below the joint line and
// set well back from it. Nothing else explains the small hard corner below the
// outside of the knee, and it is the landmark that tells the two sides apart at
// a glance from behind.
const FIBULA_HEAD = { at: 1.0 + 34 * U_MM, half: 13 * U_MM, out: 3.2 * MM, back: 0.55 };

// The back of the knee. The table already pulls `post` in at the joint, but a
// table can only cut a belt: the popliteal fossa is a diamond, with the
// hamstring tendons — semitendinosus and gracilis inside, biceps femoris outside
// — standing proud at its upper corners. The hollow alone reads as a dent; the
// hollow with two cords above it reads as the back of a knee.
const POPLITEAL = { at: 1.0 + 4 * U_MM, half: 26 * U_MM, in: 3.4 * MM, wide: 0.42 };
const HAMSTRING = { at: 1.0 - 26 * U_MM, half: 22 * U_MM, out: 3.0 * MM, atCs: 0.52, csHalf: 0.17 };

function patellaWarp(u, cs, sn, p, scale, anterior) {
  if (sn <= 0) return;                                   // front of the ring only
  let push = 0;

  const cap = bump(u - PATELLA.at, PATELLA.half, 2);
  if (cap > 0.02) {
    // Triangular: `down` is 0 at the base and 1 at the apex, and narrows the
    // plate on the way down.
    const down = clamp01((u - PATELLA.at) / PATELLA.half);
    push += cap * PATELLA.out * bump(cs, PATELLA.wide * (1 - PATELLA.taper * down), 2);
  }
  // The grooves run a little past the plate top and bottom, which is what gives
  // the kneecap a top edge as well as sides.
  const flank = bump(u - PATELLA.at, PATELLA.half * 1.25);
  if (flank > 0.02) {
    push -= flank * PARAPATELLAR.depth
      * bump(Math.abs(cs) - PARAPATELLAR.at, PARAPATELLAR.half);
  }

  const band = bump(u - LIGAMENT.at, LIGAMENT.half);
  if (band > 0.02) push += band * LIGAMENT.out * bump(cs, LIGAMENT.wide, 2);
  const knob = bump(u - TUBEROSITY.at, TUBEROSITY.half, 2);
  if (knob > 0.02) push += knob * TUBEROSITY.out * bump(cs, TUBEROSITY.wide, 2);

  // `sn ** 1.3` keeps all of it on the front and lets it die as the ring turns
  // towards the condyles, which have warps of their own below.
  if (push !== 0) p.addScaledVector(anterior, push * scale * sn ** 1.3);
}

function condyleWarp(u, cs, sn, p, scale, side3) {
  const bone = cs < 0 ? CONDYLE.med : CONDYLE.lat;       // cs < 0 is the inner side
  const along = bump(u - bone.at, bone.half);
  if (along < 0.02) return;
  const round = Math.abs(cs) ** 1.4 * (1 - bone.back * sn);
  p.addScaledVector(side3, Math.sign(cs) * bone.out * scale * along * round);
}

// Pulls the whole ring in, so unlike everything else here it moves the vertex
// towards the sweep's centre rather than along one axis.
function suprapatellarWarp(u, sn, p, scale, centre) {
  if (!centre) return;
  const along = bump(u - SUPRAPATELLAR.at, SUPRAPATELLAR.half);
  if (along < 0.02) return;
  const r = p.distanceTo(centre);
  if (r < 1e-6) return;
  const pull = SUPRAPATELLAR.in * scale * along
    * (1 - SUPRAPATELLAR.tendon * Math.max(sn, 0));
  p.lerp(centre, Math.min(pull / r, 1));
}

function fibulaWarp(u, cs, sn, p, scale, side3) {
  if (cs <= 0) return;                                   // outer side only
  const along = bump(u - FIBULA_HEAD.at, FIBULA_HEAD.half, 2);
  if (along < 0.02) return;
  const round = Math.abs(cs) ** 1.6 * (1 - FIBULA_HEAD.back * sn);
  p.addScaledVector(side3, FIBULA_HEAD.out * scale * along * round);
}

function poplitealWarp(u, cs, sn, p, scale, anterior) {
  if (sn >= 0) return;                                   // back of the ring only
  const deep = Math.abs(sn) ** 1.2;
  const fossa = bump(u - POPLITEAL.at, POPLITEAL.half);
  // Forwards on the back of the ring is inwards, so a positive push digs.
  if (fossa > 0.02) {
    p.addScaledVector(anterior,
      fossa * POPLITEAL.in * scale * bump(cs, POPLITEAL.wide, 2) * deep);
  }
  const cord = bump(u - HAMSTRING.at, HAMSTRING.half);
  if (cord > 0.02) {
    p.addScaledVector(anterior, -cord * HAMSTRING.out * scale
      * bump(Math.abs(cs) - HAMSTRING.atCs, HAMSTRING.csHalf) * deep);
  }
}

// The very top of the loft is not a measurement, it is a plug. It is inside the
// shorts in every outfit that shows the legs at all — the night pair's hem sits
// at u ≈ 0.48, the swim pair's at u ≈ 0.65 — and its only job up there is to
// stop you seeing into them from below.
//
// It was doing that job while standing PROUD of the trousers at the hip. The
// first ring carries gluteal-fold radii but the loft starts it at the head of
// the femur, a hand higher, where the body is far narrower front to back; the
// ring came through the seat of the shorts as two triangles of skin, which is
// what read as a tear. Raycast outwards against the shorts, ring by ring, the
// leg cleared the fabric by 14 mm at u = 0.25 and by MINUS 3.6 mm at u = 0.00.
// Pulling the top in by 9 mm and fading out by u = 0.30 buries it with room to
// spare, and costs nothing, because nothing above the hem is ever on screen.
const HIP_TUCK = { in: 0.0090, to: 0.30 };

function hipTuckWarp(u, p, scale, centre) {
  if (!centre || u >= HIP_TUCK.to) return;
  const fade = 1 - THREE.MathUtils.smoothstep(u, 0, HIP_TUCK.to);
  const r = p.distanceTo(centre);
  if (r < 1e-6) return;
  p.lerp(centre, Math.min((HIP_TUCK.in * scale * fade) / r, 1));
}

function legWarp(u, cs, sn, p, scale, side3, anterior, centre) {
  hipTuckWarp(u, p, scale, centre);
  vastusWarp(u, cs, sn, p, scale, side3);
  suprapatellarWarp(u, sn, p, scale, centre);
  patellaWarp(u, cs, sn, p, scale, anterior);
  condyleWarp(u, cs, sn, p, scale, side3);
  fibulaWarp(u, cs, sn, p, scale, side3);
  poplitealWarp(u, cs, sn, p, scale, anterior);
  archWarp(u, cs, sn, p, scale);
  malleoliWarp(u, cs, sn, p, scale, side3);
  achillesWarp(u, cs, sn, p, scale, side3);
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
      // Tight through 1.80–2.35: the ankle bones and the hollows beside the
      // tendon are only a couple of centimetres across, and at the old 4 cm step
      // each one got a ring and a half and came out as a facet.
      //
      // The joint band, 0.88–1.30, is tighter again — 8.5 mm rings. The kneecap
      // is only 34 mm from base to apex, and the 21 mm rings it used to sit on
      // gave it two: not enough to carry a plate WITH edges, which is the whole
      // point of it. The grooves beside it are narrower still.
      rings: ringParams(0, LEG_END, u => u < 0.80 ? 0.090
        : u < 0.88 ? 0.040 : u < 1.30 ? 0.019 : u < 1.50 ? 0.044
        : u < 1.78 ? 0.070 : u < 2.35 ? 0.026 : u < 3.05 ? 0.045 : 0.030),
      weights: legWeights(bone),
      lateral: Math.sign(hip.x) || 1,
      floorY: soleY,
      floorFrom: 2,
      warp: legWarp,
      radial: LEG_RADIAL,
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
// Flip-flops
// ---------------------------------------------------------------------------

// A thong sandal is a plate and a Y of strap, and the plate carries the whole
// read: get its plan wrong and it looks like a board taped under the foot. The
// outline below is a sandal LAST rather than the foot's own silhouette —
// rounded narrow heel, a waist pulled in under the arch, the widest point
// across the metatarsal heads, and a nose that closes well in front of the toes
// instead of stopping level with them. It is quoted in fractions of the
// finished foot length, measured forward from the back of the heel.
//
// The rig offers an ankle and a ball and nothing else, so the outline is pinned
// to the two landmarks every last is dimensioned from: the ankle stands a
// quarter of a foot length in front of the heel and the ball at 0.72 of it,
// which makes the rig's ankle-to-ball span 0.47 of a foot. That ratio is the
// only thing turning two bones into a whole sandal.
const SANDAL_ANKLE = 0.25;
const SANDAL_BALL = 0.72;
const SANDAL_END = 1.02;
// `lat`/`med` are the outer and inner edges. The sole is swept with its
// reference pointing DOWN (see `anterior0` below), so `ant` is the half
// thickness under the mid plane and `post` the half above it — symmetric here,
// so which is which only matters to the reader. The low exponents are what make
// the section a rounded rectangle, a plate with an eased edge, instead of the
// ellipse the leg tables want.
const SANDAL_PROFILE = [
  // s,    lat,    med,    ant,    post,   ex,   enA,  enP
  [0.00, 0.0540, 0.0540, 0.0200, 0.0200, 0.62, 0.45, 0.45],  // back of the heel
  [0.05, 0.1040, 0.1045, 0.0212, 0.0212, 0.55, 0.42, 0.42],
  [0.13, 0.1305, 0.1315, 0.0214, 0.0214, 0.50, 0.40, 0.40],  // heel seat
  [0.30, 0.1400, 0.1428, 0.0212, 0.0212, 0.50, 0.40, 0.40],
  [0.46, 0.1458, 0.1516, 0.0206, 0.0206, 0.50, 0.40, 0.40],  // waist, under the arch
  [0.62, 0.1760, 0.1838, 0.0200, 0.0200, 0.50, 0.40, 0.40],
  [0.74, 0.2018, 0.2082, 0.0192, 0.0192, 0.50, 0.40, 0.40],  // widest, across the ball
  [0.86, 0.1958, 0.1992, 0.0182, 0.0182, 0.52, 0.42, 0.42],
  [0.95, 0.1628, 0.1660, 0.0164, 0.0164, 0.58, 0.46, 0.46],
  [1.02, 0.0975, 0.1000, 0.0132, 0.0132, 0.70, 0.55, 0.55],  // nose, clear of the toes
];
// The Y: two bands from the sole edges at the waist, up over the instep, to a
// post between the big toe and the second. Round-ish in section on purpose — a
// band this thin reads the same from every angle, where a flat one would need a
// frame tracking the skin under it to stay flat against it.
const STRAP_PROFILE = [
  [0.00, 0.0355, 0.0355, 0.0130, 0.0130, 0.55, 0.55, 0.55],
  [1.00, 0.0300, 0.0300, 0.0114, 0.0114, 0.55, 0.55, 0.55],
];
const STRAP_RADIAL = 9;   // a 15 mm band does not need the sole's ring density
// Where the Y sits, all in foot lengths: the two sole anchors, the post, how
// far the post stands off the centreline — the cleft is on the big-toe side,
// not down the middle — and the instep the bands have to arch over.
//
// `apexRise` and `postTop` are the whole thing, and the first pass had both at
// about a third of what they need: 2.5 cm and 0.8 cm above the sole, against a
// dorsum that stands 5.5 cm proud at the instep and toes 1.6 cm tall at the
// cleft. Both bands ran INSIDE the foot for their whole length, so the sandal
// rendered as a sole with nothing holding it on. They now sit on the skin.
const STRAP = {
  anchor: 0.545, post: 0.792, postOff: 0.052, postTop: 0.150,
  apex: 0.686, apexRise: 0.272, apexIn: 0.62,
};

export function buildFlipFlops(root, material) {
  const rig = findRig(root, [...LEG_BONES('l'), ...LEG_BONES('r')]);
  if (!rig) return null;
  const { indexOf, pos } = restReader(rig);
  const out = { pos: [], tri: [], idx: [], wgt: [] };
  const ss = THREE.MathUtils.smoothstep;
  const DOWN = new THREE.Vector3(0, -1, 0);

  for (const side of ['l', 'r']) {
    const hip = pos(`thigh_${side}`);
    const ankle = pos(`foot_${side}`), ball = pos(`ball_${side}`);
    const lateral = Math.sign(hip.x) || 1;
    const stride = new THREE.Vector3(ball.x - ankle.x, 0, ball.z - ankle.z);
    const fwd = stride.clone().normalize();
    const L = ankle.distanceTo(ball);
    const FL = stride.length() / (SANDAL_BALL - SANDAL_ANKLE);
    const soleY = ball.y - 0.20 * L;
    // Top face a couple of millimetres inside the sole of the foot: the sandal
    // reads as taking the weight, and nothing sinks the toes into the plate.
    const midY = soleY - 0.0028;
    // Across the foot, away from the midline — the axis buildToes uses, so the
    // post lands in the same cleft the toes leave for it.
    const across = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), fwd).normalize();
    if (across.x * lateral < 0) across.negate();
    const heel = new THREE.Vector3(ankle.x, 0, ankle.z).addScaledVector(fwd, -SANDAL_ANKLE * FL);
    const at = (s, rise = 0) => heel.clone()
      .addScaledVector(fwd, s * FL).setY(midY + rise * FL);

    const bone = { foot: indexOf(`foot_${side}`), ball: indexOf(`ball_${side}`) };

    // ── the sole ──
    loft({
      // Toe spring, and a touch at the heel: a flip-flop moulds up at both ends,
      // and a dead-flat plate is the other half of what reads as a board.
      points: [at(0, 0.008), at(0.30), at(0.62), at(0.86, 0.004), at(0.95, 0.010),
        at(1.02, 0.026)],
      pathU: [0, 0.30, 0.62, 0.86, 0.95, 1.02],
      profile: SANDAL_PROFILE,
      scale: FL,
      rings: ringParams(0, 1.02, s => s < 0.10 ? 0.025 : s < 0.86 ? 0.055 : 0.030),
      weights: s => {
        // The plate bends where a real one does, at the ball.
        const t = ss(s, 0.58, 0.80);
        return { idx: [bone.foot, bone.ball, 0, 0], wgt: [1 - t, t, 0, 0] };
      },
      lateral,
      floorY: null,
      floorFrom: 0,
      radial: 18,
      anterior0: DOWN,
    }, out);

    // ── the Y ──
    const postHead = at(STRAP.post, STRAP.postTop)
      .addScaledVector(across, -STRAP.postOff * FL);
    const postFoot = at(STRAP.post, -0.006)
      .addScaledVector(across, -STRAP.postOff * FL);
    const strapWeights = u => {
      const t = ss(u, 0, 0.75);
      const foot = 0.42 * (1 - t);
      return { idx: [bone.foot, bone.ball, 0, 0], wgt: [foot, 1 - foot, 0, 0] };
    };
    for (const edge of [1, -1]) {
      const w = (edge > 0 ? SANDAL_PROFILE[4][1] : SANDAL_PROFILE[4][2]) - 0.012;
      const anchor = at(STRAP.anchor, 0.018).addScaledVector(across, edge * w * FL);
      const apex = at(STRAP.apex, STRAP.apexRise)
        .addScaledVector(across, edge * w * STRAP.apexIn * FL);
      loft({
        points: [anchor, apex, postHead],
        pathU: [0, 0.55, 1],
        profile: STRAP_PROFILE,
        scale: FL,
        rings: ringParams(0, 1, () => 0.085),
        weights: strapWeights,
        lateral,
        floorY: null,
        floorFrom: 0,
        radial: STRAP_RADIAL,
        anterior0: fwd,
      }, out);
    }
    // The post, buried in the plate at its foot.
    loft({
      points: [postFoot, postHead],
      pathU: [0, 1],
      profile: STRAP_PROFILE,
      scale: FL,
      rings: ringParams(0, 1, () => 0.25),
      weights: () => ({ idx: [bone.ball, bone.foot, 0, 0], wgt: [1, 0, 0, 0] }),
      lateral,
      floorY: null,
      floorFrom: 0,
      radial: STRAP_RADIAL,
      anterior0: fwd,
    }, out);
  }
  return finish(out, rig, material, 'Wardrobe_FlipFlops');
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
