// kimono.js — shrine-visit wardrobe: a furisode-cut kimono lofted onto the
// Survivors girl rig. The pack has no robe mesh, so every piece is a skinned
// shell swept the same way as the lofted sleeves and legs, bound to whichever
// of the pack's per-mesh skeletons actually knows about those joints.
//
// Pieces, from the skin out:
//   robe    — neck to mid-thigh, on the t-shirt skeleton
//   skirt   — waist to ankle, on the trousers (the only skin that reaches the
//             calves). Weighted mostly to the pelvis so it stays one volume
//             rather than splitting into a pair of floral trousers.
//   sleeves — wide hanging sode on the arms skeleton
//   obi     — gold brocade sash + taiko musubi on the back
//   collar  — overlapping eri in cream over a pink date-eri
//
// The t-shirt and trousers stay on underneath as the nagajuban, so a gap in
// the loft never opens onto missing body skin.
import * as THREE from 'three';

const RADIAL = 24;
const SLEEVE_RADIAL = 18;
// Deep lacquer red. Any lighter and the slice of it visible inside the
// neckline stops reading as lining and turns into a pink bib.
const LINING = [0.34, 0.055, 0.085];
// One texture repeat in metres. The silk photograph holds roughly three
// peonies across, so 0.42 m puts a bloom at about 14 cm — the scale a
// furisode is actually printed at.
const TILE = 0.42;

// ---------------------------------------------------------------------------
// Shared loft helpers (same contract as limbs.js — kept here so the kimono
// can carry UVs and per-vertex weights without opening that file up).
// ---------------------------------------------------------------------------

function catmull(p0, p1, p2, p3, t) {
  const t2 = t * t, t3 = t2 * t;
  return 0.5 * (2 * p1 + (p2 - p0) * t
    + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2
    + (3 * p1 - 3 * p2 + p3 - p0) * t3);
}

function sampleProfile(table, u, out) {
  let k = 0;
  while (k < table.length - 2 && u > table[k + 1][0]) k++;
  const r1 = table[k], r2 = table[k + 1];
  const r0 = table[Math.max(k - 1, 0)], r3 = table[Math.min(k + 2, table.length - 1)];
  const t = THREE.MathUtils.clamp((u - r1[0]) / (r2[0] - r1[0] || 1), 0, 1);
  for (let c = 1; c < 5; c++) out[c - 1] = catmull(r0[c], r1[c], r2[c], r3[c], t);
  return out;
}

function ringParams(from, to, stepAt) {
  const us = [];
  for (let u = from; u < to; ) {
    us.push(u);
    u = Math.min(u + stepAt(u), to);
  }
  us.push(to);
  return us;
}

function mixBones(pairs) {
  const top = pairs.filter(p => p[1] > 1e-3).sort((a, b) => b[1] - a[1]).slice(0, 4);
  const sum = top.reduce((s, p) => s + p[1], 0) || 1;
  const idx = [0, 0, 0, 0], wgt = [0, 0, 0, 0];
  top.forEach((p, i) => { idx[i] = p[0]; wgt[i] = p[1] / sum; });
  return { idx, wgt };
}

function findRig(root, bones) {
  let found = null;
  root.traverse(o => {
    if (found || !o.isSkinnedMesh) return;
    const names = new Set(o.skeleton.bones.map(b => b.name));
    if (bones.every(b => names.has(b))) found = o;
  });
  return found;
}

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

function finish(out, rig, material, name) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(out.pos, 3));
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(out.idx, 4));
  g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(out.wgt, 4));
  if (out.uv.length) g.setAttribute('uv', new THREE.Float32BufferAttribute(out.uv, 2));
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
  mesh.castShadow = true;
  mesh.receiveShadow = rig.receiveShadow;
  mesh.frustumCulled = false;
  mesh.visible = false;
  rig.parent.add(mesh);
  return mesh;
}

function push(out, p, w, u, v) {
  out.pos.push(p.x, p.y, p.z);
  out.idx.push(w.idx[0], w.idx[1], w.idx[2], w.idx[3]);
  out.wgt.push(w.wgt[0], w.wgt[1], w.wgt[2], w.wgt[3]);
  out.uv.push(u, v);
}

/**
 * Closed tube with UVs and per-vertex weights. Seam sits on the back so the
 * floral wrap meets where the camera (third-person, behind) almost never looks.
 * `weights(u, cs, sn)` is sampled at every vertex — the skirt needs left/right
 * thigh splits that a ring-constant function cannot give.
 */
function loftShell({
  points, pathU, profile, rings, weights, radial = RADIAL,
  anterior0 = null, lateral = 1, warp = null,
  uvUScale = 1, uvVScale = 2.2, tile = null, caps = false,
}, out) {
  const path = new THREE.CatmullRomCurve3(points, false, 'centripetal');
  const segs = pathU.length - 1;
  const curveT = u => {
    let i = 0;
    while (i < segs - 1 && u > pathU[i + 1]) i++;
    const f = (u - pathU[i]) / (pathU[i + 1] - pathU[i] || 1);
    return (i + THREE.MathUtils.clamp(f, 0, 1)) / segs;
  };

  const base = out.pos.length / 3;
  const prof = new Array(4);
  const anterior = anterior0 ? anterior0.clone().normalize() : new THREE.Vector3(0, 0, 1);
  const tangent = new THREE.Vector3(), side3 = new THREE.Vector3(), p = new THREE.Vector3();
  const u0 = rings[0], u1 = rings[rings.length - 1];

  // radial + 1 so the last column duplicates the first at u = 1 and the
  // floral does not stretch across a 1/radial gap at the seam.
  const cols = radial + 1;

  // Ring centres up front: V wants the arc length walked so far, and cutting
  // the cloth to metres wants the mean radius before the first vertex lands.
  const centres = rings.map(u => path.getPoint(curveT(u)));
  const arc = [0];
  for (let i = 1; i < centres.length; i++) {
    arc.push(arc[i - 1] + centres[i].distanceTo(centres[i - 1]));
  }
  // `tile` is the width of one texture repeat in metres. Sizing U and V off
  // it independently keeps a peony round; the old fixed repeats stretched one
  // tile over a whole panel's girth and smeared the floral into streaks.
  if (tile) {
    const r = profile.reduce(
      (s, row) => s + (row[1] + row[2] + row[3] + row[4]) / 4, 0) / profile.length;
    uvUScale = (2 * Math.PI * r) / tile;
  }
  const firstCentre = centres[0], lastCentre = centres[centres.length - 1];

  rings.forEach((u, ri) => {
    const t = curveT(u);
    const c = centres[ri];
    path.getTangent(t, tangent).normalize();
    anterior.addScaledVector(tangent, -anterior.dot(tangent)).normalize();
    side3.crossVectors(anterior, tangent).normalize().multiplyScalar(lateral);

    const [lat, med, ant, post] = sampleProfile(profile, u, prof);
    const vUv = tile ? arc[ri] / tile : ((u - u0) / (u1 - u0 || 1)) * uvVScale;
    for (let j = 0; j < cols; j++) {
      // Start at the back (−Z) so the UV seam hides behind the body.
      const th = (j / radial) * Math.PI * 2 + Math.PI * 1.5;
      const cs = Math.cos(th), sn = Math.sin(th);
      const rl = cs >= 0 ? lat : med;
      const rv = sn >= 0 ? ant : post;
      p.copy(c)
        .addScaledVector(side3, rl * Math.sign(cs || 1) * Math.abs(cs))
        .addScaledVector(anterior, rv * Math.sign(sn || 1) * Math.abs(sn));
      if (warp) warp(u, cs, sn, p, side3, anterior, c);
      push(out, p, weights(u, cs, sn), (j / radial) * uvUScale, vUv);
    }
  });

  const tri = lateral > 0
    ? (a, b, c) => out.tri.push(a, b, c)
    : (a, b, c) => out.tri.push(a, c, b);
  for (let r = 0; r < rings.length - 1; r++) {
    const a = base + r * cols, b = a + cols;
    for (let j = 0; j < radial; j++) {
      tri(a + j, a + j + 1, b + j);
      tri(a + j + 1, b + j + 1, b + j);
    }
  }

  if (caps) {
    const capA = out.pos.length / 3;
    push(out, firstCentre, weights(rings[0], 0, 0), 0.5, 0);
    const capB = out.pos.length / 3;
    push(out, lastCentre, weights(rings[rings.length - 1], 0, 0), 0.5, 1);
    for (let j = 0; j < radial; j++) {
      tri(capA, base + j + 1, base + j);
      const last = base + (rings.length - 1) * cols;
      tri(capB, last + j, last + j + 1);
    }
  }
}

// ---------------------------------------------------------------------------
// Textures. A canvas swatch is up immediately; the photographed silk / brocade
// replace it the moment they decode, so a missing file still dresses her.
// ---------------------------------------------------------------------------

function canvasTex(size, paint) {
  const canvas = Object.assign(document.createElement('canvas'), { width: size, height: size });
  paint(canvas.getContext('2d'), size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  return tex;
}

function paintSilkFallback(ctx, n) {
  ctx.fillStyle = '#efe6d4';
  ctx.fillRect(0, 0, n, n);
  for (let i = 0; i < 18; i++) {
    const x = ((i * 137.5) % n), y = ((i * 97.3) % n);
    const r = 28 + (i % 5) * 8;
    for (const dx of [-n, 0, n]) for (const dy of [-n, 0, n]) {
      ctx.fillStyle = i % 3 === 0 ? '#d4788a' : '#c45a6a';
      ctx.beginPath();
      ctx.arc(x + dx, y + dy, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#8a9a6a';
      ctx.beginPath();
      ctx.ellipse(x + dx + r * 0.8, y + dy, r * 0.45, r * 0.22, 0.6, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function paintBrocadeFallback(ctx, n) {
  ctx.fillStyle = '#c9b06a';
  ctx.fillRect(0, 0, n, n);
  ctx.strokeStyle = '#8b1e2d';
  ctx.lineWidth = 10;
  const step = n / 6;
  for (let i = -6; i < 12; i++) {
    ctx.beginPath();
    ctx.moveTo(i * step, 0);
    ctx.lineTo(i * step + n, n);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(i * step, n);
    ctx.lineTo(i * step + n, 0);
    ctx.stroke();
  }
}

function loadTex(url, fallback) {
  const tex = fallback;
  new THREE.TextureLoader().load(url, loaded => {
    tex.image = loaded.image;
    tex.needsUpdate = true;
  });
  return tex;
}

function withLining(mat, rgb = LINING) {
  mat.side = THREE.DoubleSide;
  const key = `kimoLining${rgb.join('')}`;
  mat.onBeforeCompile = shader => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <color_fragment>',
      `#include <color_fragment>
       if (!gl_FrontFacing) diffuseColor.rgb = vec3(${rgb[0]}, ${rgb[1]}, ${rgb[2]});`
    );
  };
  mat.customProgramCacheKey = () => key;
  return mat;
}

function silkMaterial() {
  return withLining(new THREE.MeshStandardMaterial({
    map: loadTex('./textures/kimono/silk.jpg', canvasTex(512, paintSilkFallback)),
    color: 0xffffff,
    roughness: 0.48,
    metalness: 0.04,
  }));
}

function brocadeMaterial() {
  return new THREE.MeshStandardMaterial({
    map: loadTex('./textures/kimono/brocade.jpg', canvasTex(512, paintBrocadeFallback)),
    color: 0xffffff,
    roughness: 0.38,
    metalness: 0.22,
    side: THREE.DoubleSide,
  });
}

function solidMaterial(color, { rough = 0.55, metal = 0.04, lining = false } = {}) {
  const mat = new THREE.MeshStandardMaterial({
    color, roughness: rough, metalness: metal, side: THREE.DoubleSide,
  });
  return lining ? withLining(mat) : mat;
}

// ---------------------------------------------------------------------------
// Garment pieces
// ---------------------------------------------------------------------------

// A kimono binds the chest flat, so the front runs almost straight from the
// collarbone to the obi. It also has to clear the bust outright: cut closer,
// the body pushed through the shell and the nagajuban showed as a white patch
// in the middle of the floral.
const ROBE_PROFILE = [
  // u,    lat,    med,    ant,    post
  // Flares onto the shoulders within a few centimetres of the collar, the way
  // a kimono runs straight out from the neck. Reached gradually, the shell was
  // still inside the body at shoulder height and the tee showed over the top.
  [0.00, 0.114, 0.114, 0.098, 0.092],
  [0.04, 0.186, 0.186, 0.130, 0.114],
  [0.09, 0.228, 0.228, 0.156, 0.134],
  [0.20, 0.210, 0.210, 0.176, 0.136],
  [0.38, 0.178, 0.178, 0.170, 0.130],
  [0.55, 0.168, 0.168, 0.160, 0.128],
  // Below the obi the robe is swallowed by the skirt, so it has to stay
  // inside it — the old flare pushed the floral out through the skirt wall.
  [0.74, 0.168, 0.168, 0.132, 0.134],
  [1.00, 0.158, 0.158, 0.126, 0.128],
];

// A kimono is wrapped, not gathered — near enough a straight column, where
// the old profile flared into a Victorian ball gown. It keeps a few
// centimetres of taper the real garment does not have, because the hem is the
// only thing standing between a running stride and a leg out through the
// front, and it is roughly cylindrical rather than flattened front-to-back so
// the nagajuban underneath stays hidden.
// The hip row is set off the trousers underneath, which reach 0.247 there —
// anything tighter and the nagajuban surfaces as a pale stripe down the front
// of the floral, in the idle pose, every time.
// The camera sits behind the player, not in front of her, so post needs the
// same clearance as ant — a back-heavier stride (the leg swinging backward on
// push-off) put the trousers through the rear wall while the front stayed
// clean, the moment post trailed ant by even a centimetre.
const SKIRT_PROFILE = [
  [0.00, 0.192, 0.192, 0.194, 0.188],
  [0.18, 0.252, 0.252, 0.256, 0.256],
  [0.42, 0.258, 0.258, 0.260, 0.260],
  [0.68, 0.270, 0.270, 0.262, 0.262],
  [1.00, 0.286, 0.286, 0.268, 0.268],
];

// The whole sleeve, and the only piece on the arm. A furisode's hanging panel
// was once its own loft ridden on the spine, but the spine does not swing and
// the arm does: the moment she ran, the two came apart and she had a sleeve on
// each arm and a second pair hanging off her ribs. One tube bound to the arm
// can never do that.
//
// It reads as furisode by widening all the way down instead of hanging: with
// the arm at her side, a cone opening toward the wrist puts the bell of cloth
// exactly where the drape of a furisode falls.
const SLEEVE_PROFILE = [
  // Runs inboard of the shoulder joint to cap it. The robe leaves the neck as
  // a narrow ring, so nothing else covers the top of the deltoid, and cut at
  // the joint this let the nagajuban surface as a white epaulette.
  [-0.15, 0.096, 0.082, 0.090, 0.096],
  [0.00, 0.104, 0.088, 0.098, 0.106],
  [0.50, 0.128, 0.110, 0.118, 0.132],
  [1.00, 0.152, 0.130, 0.140, 0.158],
  [1.55, 0.178, 0.150, 0.162, 0.186],
  [1.92, 0.186, 0.156, 0.170, 0.194],
  // Drawn in at the wrist. Left open at full sleeve width, the cuff was a hoop
  // we looked straight down, and its red lining read as a plate on her hip.
  [2.08, 0.104, 0.092, 0.098, 0.108],
];

// Barely a scoop. The V of a kimono is drawn by the crossed collar lying on
// top of a closed robe, not by cutting the robe away underneath it — cut deep,
// all the opening did was show the robe's own red lining as a bib, because
// the collar bands run diagonally and cannot cover a gap that widens upward.
function necklineWarp(u, cs, sn, p) {
  if (u > 0.20 || sn < 0.15) return;
  const open = (1 - u / 0.20) * sn ** 1.35;
  p.y -= open * 0.018;
  p.z += open * 0.006;
}

function buildRobe(root, material) {
  const bones = ['neck_01', 'spine_03', 'spine_02', 'spine_01', 'pelvis', 'thigh_l', 'thigh_r'];
  const rig = findRig(root, bones);
  if (!rig) return null;
  const { indexOf, pos } = restReader(rig);
  const neck = pos('neck_01'), s3 = pos('spine_03'), s2 = pos('spine_02');
  const s1 = pos('spine_01'), pelvis = pos('pelvis');
  const hem = pelvis.clone();
  hem.y -= 0.30;
  const b = {
    neck: indexOf('neck_01'), s3: indexOf('spine_03'), s2: indexOf('spine_02'),
    s1: indexOf('spine_01'), pelvis: indexOf('pelvis'),
    tl: indexOf('thigh_l'), tr: indexOf('thigh_r'),
  };
  const ss = THREE.MathUtils.smoothstep;
  const weights = (u, cs) => {
    const left = ss(cs, -0.35, 0.35);
    return mixBones([
      [b.neck, 1 - ss(u, 0.00, 0.16)],
      [b.s3, ss(u, 0.00, 0.12) * (1 - ss(u, 0.18, 0.36))],
      [b.s2, ss(u, 0.18, 0.34) * (1 - ss(u, 0.40, 0.56))],
      [b.s1, ss(u, 0.40, 0.54) * (1 - ss(u, 0.58, 0.74))],
      [b.pelvis, ss(u, 0.56, 0.72) * (1 - ss(u, 0.82, 1.00) * 0.45)],
      [b.tl, ss(u, 0.78, 0.96) * left],
      [b.tr, ss(u, 0.78, 0.96) * (1 - left)],
    ]);
  };
  const out = { pos: [], tri: [], idx: [], wgt: [], uv: [] };
  loftShell({
    points: [neck.clone().setY(neck.y - 0.03), s3, s2, s1, pelvis, hem],
    pathU: [0, 0.16, 0.34, 0.54, 0.72, 1],
    profile: ROBE_PROFILE,
    rings: ringParams(0, 1, u => u < 0.12 ? 0.03 : 0.05),
    weights, warp: necklineWarp, tile: TILE,
  }, out);
  return finish(out, rig, material, 'Wardrobe_KimonoRobe');
}

function buildSkirt(root, material) {
  const bones = ['pelvis', 'spine_01', 'thigh_l', 'thigh_r', 'calf_l', 'calf_r'];
  const rig = findRig(root, bones);
  if (!rig) return null;
  const { indexOf, pos } = restReader(rig);
  const pelvis = pos('pelvis');
  const waist = pelvis.clone(); waist.y += 0.11;
  const hip = pelvis.clone(); hip.y -= 0.12;
  const knee = new THREE.Vector3(pelvis.x, 0.50, pelvis.z);
  const shin = new THREE.Vector3(pelvis.x, 0.26, pelvis.z);
  const hem = new THREE.Vector3(pelvis.x, 0.052, pelvis.z);
  const b = {
    pelvis: indexOf('pelvis'), s1: indexOf('spine_01'),
    tl: indexOf('thigh_l'), tr: indexOf('thigh_r'),
    cl: indexOf('calf_l'), cr: indexOf('calf_r'),
  };
  const ss = THREE.MathUtils.smoothstep;
  // Pelvis-dominant all the way down. The legs get a minority share so the hem
  // drifts with a stride instead of being speared by it, but not enough to tear
  // the skirt into a pair of floral trousers when she runs — which is what the
  // old two-thirds thigh weighting did the moment the profile stopped being a
  // bell wide enough to hide it.
  const weights = (u, cs) => {
    const left = ss(cs, -0.30, 0.30);
    // Only the flanks follow a leg. Front and back sit at cs ≈ 0, where `left`
    // is a half, so they used to take half of each calf — and the average of
    // two legs stood apart is the midline, which sucked the front and back of
    // the hem in against the shins and opened it onto the nagajuban.
    // Token shares only. Weighted any harder, the flanks get dragged from the
    // hem line onto the calves themselves — which is the collision it was
    // meant to prevent, not avoid. Clearance is the profile's job.
    const flank = Math.abs(cs);
    const thigh = ss(u, 0.22, 0.62) * 0.14 * flank;
    const calf = ss(u, 0.66, 0.98) * 0.06 * flank;
    return mixBones([
      [b.s1, (1 - ss(u, 0.00, 0.18)) * 0.35],
      [b.pelvis, 1 - thigh - calf],
      [b.tl, thigh * left],
      [b.tr, thigh * (1 - left)],
      [b.cl, calf * left],
      [b.cr, calf * (1 - left)],
    ]);
  };
  const out = { pos: [], tri: [], idx: [], wgt: [], uv: [] };
  loftShell({
    points: [waist, hip, knee, shin, hem],
    pathU: [0, 0.22, 0.52, 0.76, 1],
    profile: SKIRT_PROFILE,
    rings: ringParams(0, 1, () => 0.045),
    weights, tile: TILE,
  }, out);
  return finish(out, rig, material, 'Wardrobe_KimonoSkirt');
}

function buildSleeves(root, material) {
  const names = [];
  for (const s of ['l', 'r']) {
    names.push(`clavicle_${s}`, `upperarm_${s}`, `lowerarm_${s}`, `hand_${s}`);
  }
  const rig = findRig(root, names);
  if (!rig) return null;
  const { indexOf, pos } = restReader(rig);
  const out = { pos: [], tri: [], idx: [], wgt: [], uv: [] };
  const ss = THREE.MathUtils.smoothstep;

  for (const side of ['l', 'r']) {
    const shoulder = pos(`upperarm_${side}`);
    const elbow = pos(`lowerarm_${side}`);
    const wrist = pos(`hand_${side}`);
    const upper = shoulder.distanceTo(elbow);
    const outward = wrist.clone().sub(elbow).normalize();
    const inward = shoulder.clone().sub(elbow).normalize();
    const bone = {
      clav: indexOf(`clavicle_${side}`),
      up: indexOf(`upperarm_${side}`),
      low: indexOf(`lowerarm_${side}`),
      hand: indexOf(`hand_${side}`),
    };
    const weights = u => mixBones([
      [bone.clav, 0.40 * (1 - ss(u, -0.08, 0.12))],
      [bone.up, ss(u, -0.08, 0.10) * (1 - ss(u, 0.80, 1.18))],
      [bone.low, ss(u, 0.80, 1.18) * (1 - ss(u, 1.82, 2.04))],
      [bone.hand, ss(u, 1.82, 2.04)],
    ]);
    loftShell({
      points: [
        shoulder.clone().addScaledVector(inward, 0.15 * upper),
        shoulder,
        elbow,
        wrist,
        wrist.clone().addScaledVector(outward, 0.05),
      ],
      pathU: [-0.15, 0, 1, 2, 2.08],
      profile: SLEEVE_PROFILE,
      rings: ringParams(-0.15, 2.08, u => u < 0.2 ? 0.05 : 0.08),
      weights, radial: SLEEVE_RADIAL, tile: TILE,
      lateral: Math.sign(shoulder.x) || 1,
    }, out);
  }
  return finish(out, rig, material, 'Wardrobe_KimonoSleeves');
}

function buildBand(root, material, { y0, y1, radius, name, uvU = 2.4, uvV = 0.45, tile = null }) {
  const bones = ['pelvis', 'spine_01'];
  const rig = findRig(root, bones);
  if (!rig) return null;
  const { indexOf, pos } = restReader(rig);
  const pelvis = pos('pelvis');
  const mid = (y0 + y1) * 0.5;
  const top = new THREE.Vector3(pelvis.x, y1, pelvis.z);
  const cen = new THREE.Vector3(pelvis.x, mid, pelvis.z);
  const bot = new THREE.Vector3(pelvis.x, y0, pelvis.z);
  const b = { pelvis: indexOf('pelvis'), s1: indexOf('spine_01') };
  const profile = [
    [0, radius * 0.98, radius * 0.98, radius * 0.92, radius * 0.94],
    [0.5, radius, radius, radius * 0.94, radius * 0.96],
    [1, radius * 0.98, radius * 0.98, radius * 0.92, radius * 0.94],
  ];
  const ss = THREE.MathUtils.smoothstep;
  const weights = u => mixBones([
    [b.s1, 1 - ss(u, 0.15, 0.75)],
    [b.pelvis, ss(u, 0.15, 0.75)],
  ]);
  const out = { pos: [], tri: [], idx: [], wgt: [], uv: [] };
  loftShell({
    points: [top, cen, bot],
    pathU: [0, 0.5, 1],
    profile,
    rings: ringParams(0, 1, () => 0.12),
    weights, uvUScale: uvU, uvVScale: uvV, tile,
  }, out);
  return finish(out, rig, material, name);
}

function appendBox(out, origin, ox, oy, oz, w, h, d, bone, tile = 0.30) {
  const hx = w / 2, hy = h / 2, hz = d / 2;
  const c = [
    [-hx, -hy, -hz], [hx, -hy, -hz], [hx, hy, -hz], [-hx, hy, -hz],
    [-hx, -hy, hz], [hx, -hy, hz], [hx, hy, hz], [-hx, hy, hz],
  ];
  // Each face carries its own four vertices and its own pair of UV axes.
  // Sharing the eight corners left every side and top face with a constant U
  // or V, which dragged the brocade lattice out into stripes.
  const faces = [
    [[0, 1, 2, 3], 0, 1, w, h],
    [[5, 4, 7, 6], 0, 1, w, h],
    [[4, 0, 3, 7], 2, 1, d, h],
    [[1, 5, 6, 2], 2, 1, d, h],
    [[3, 2, 6, 7], 0, 2, w, d],
    [[4, 5, 1, 0], 0, 2, w, d],
  ];
  for (const [quad, ua, va, us, vs] of faces) {
    const base = out.pos.length / 3;
    for (const i of quad) {
      const p = c[i];
      out.pos.push(origin.x + ox + p[0], origin.y + oy + p[1], origin.z + oz + p[2]);
      out.idx.push(bone, 0, 0, 0);
      out.wgt.push(1, 0, 0, 0);
      out.uv.push((p[ua] + us / 2) / tile, (p[va] + vs / 2) / tile);
    }
    out.tri.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
}

function buildBow(root, material) {
  const rig = findRig(root, ['pelvis']);
  if (!rig) return null;
  const { indexOf, pos } = restReader(rig);
  const origin = pos('pelvis');
  const bone = indexOf('pelvis');
  const out = { pos: [], tri: [], idx: [], wgt: [], uv: [] };
  // Taiko musubi sits where the backpack was — behind the waist, a boxy
  // drum with two wings. All of it is 100 % pelvis: the sash does not
  // bend with the spine the way a shirt does.
  appendBox(out, origin, 0.000, 0.108, -0.216, 0.150, 0.170, 0.082, bone);
  appendBox(out, origin, -0.128, 0.106, -0.210, 0.108, 0.130, 0.050, bone);
  appendBox(out, origin, 0.128, 0.106, -0.210, 0.108, 0.130, 0.050, bone);
  appendBox(out, origin, 0.000, 0.108, -0.262, 0.062, 0.192, 0.030, bone);
  appendBox(out, origin, 0.000, -0.020, -0.198, 0.040, 0.190, 0.016, bone);
  return finish(out, rig, material, 'Wardrobe_KimonoBow');
}

function buildCollar(root, outerMat, innerMat) {
  const bones = ['neck_01', 'spine_03', 'spine_02', 'spine_01'];
  const rig = findRig(root, bones);
  if (!rig) return [];
  const { indexOf, pos } = restReader(rig);
  const b = {
    neck: indexOf('neck_01'), s3: indexOf('spine_03'),
    s2: indexOf('spine_02'), s1: indexOf('spine_01'),
  };
  const ss = THREE.MathUtils.smoothstep;
  const weights = t => mixBones([
    [b.neck, 1 - ss(t, 0.05, 0.28)],
    [b.s3, ss(t, 0.05, 0.25) * (1 - ss(t, 0.35, 0.58))],
    [b.s2, ss(t, 0.35, 0.55) * (1 - ss(t, 0.65, 0.88))],
    [b.s1, ss(t, 0.65, 0.88)],
  ]);

  // Ride the robe's own front surface. Hand-copied z values were how the
  // collar ended up buried inside the shell in the first place, and they go
  // stale the moment the robe's chest is recut.
  const spineU = [
    [pos('neck_01').y - 0.03, 0], [pos('spine_03').y, 0.16],
    [pos('spine_02').y, 0.34], [pos('spine_01').y, 0.54],
  ];
  const prof = new Array(4);
  const frontZ = y => {
    let u = spineU[spineU.length - 1][1];
    for (let i = 0; i < spineU.length - 1; i++) {
      const [ya, ua] = spineU[i], [yb, ub] = spineU[i + 1];
      if (y >= yb) {
        u = ua + THREE.MathUtils.clamp((ya - y) / (ya - yb || 1), 0, 1) * (ub - ua);
        break;
      }
    }
    return sampleProfile(ROBE_PROFILE, THREE.MathUtils.clamp(u, 0, 1), prof)[2];
  };

  const meshes = [];
  // The eri is the collar you see: a broad band of the kimono's own cream
  // silk. The date-eri is the same band cut wider and set behind it, so all
  // that shows is a centimetre of colour rimming the cream — sizing it as its
  // own narrower band instead just parked a pink bib on top of the chest.
  for (const [sign, mat, width, zPush, name] of [
    [1, innerMat, 0.080, 0.000, 'Wardrobe_KimonoDateEri'],
    [1, outerMat, 0.062, 0.008, 'Wardrobe_KimonoEriL'],
    [-1, outerMat, 0.062, 0.008, 'Wardrobe_KimonoEriR'],
  ]) {
    // Date-eri (pink) is both halves in one mesh; the cream eri is one side each.
    const sides = mat === innerMat ? [1, -1] : [sign];
    const out = { pos: [], tri: [], idx: [], wgt: [], uv: [] };
    for (const s of sides) {
      // The nape and the side of the neck sit above the robe's collar ring, so
      // those two keep hand-set z; everything from the shoulder down rides the
      // shell.
      const lift = 0.011 + zPush;
      const pts = [
        new THREE.Vector3(0.015 * s, 1.565, -0.055),
        new THREE.Vector3(0.058 * s, 1.545, -0.004),
        new THREE.Vector3(0.078 * s, 1.470, frontZ(1.470) + lift),
        new THREE.Vector3(0.064 * s, 1.360, frontZ(1.360) + lift),
        new THREE.Vector3(0.030 * s, 1.230, frontZ(1.230) + lift),
        new THREE.Vector3(0.008 * s, 1.145, frontZ(1.145) + lift),
      ];
      // Sampled off a curve rather than straight off the six control points.
      // The band twists a full quarter-turn as it comes round the neck, and
      // over six spans that arrives as a handful of folded shards.
      const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
      const STEPS = 28;
      const start = out.pos.length / 3;
      const _p = new THREE.Vector3(), _t = new THREE.Vector3();
      const normal = new THREE.Vector3(), side = new THREE.Vector3();
      for (let i = 0; i < STEPS; i++) {
        const t = i / (STEPS - 1);
        curve.getPoint(t, _p);
        curve.getTangent(t, _t).normalize();
        // Outward from the body axis, so the band lies on the torso and its
        // width runs across the collar rather than along it. The z term is
        // weighted over x because the path hugs the neck, where a raw radial
        // direction is dominated by whichever of the two happens to be larger.
        normal.set(_p.x * 0.35, 0, _p.z);
        if (normal.lengthSq() < 1e-9) normal.set(0, 0, 1); else normal.normalize();
        // normal × tang, not tang × normal: the quads wind off `side`, so the
        // other order turns the whole collar inside out and what faces the
        // camera is the lining.
        side.crossVectors(normal, _t);
        if (side.lengthSq() < 1e-9) side.set(1, 0, 0); else side.normalize();
        const w = weights(t);
        push(out, _p.clone().addScaledVector(side, width * 0.5), w, 0, t * 3);
        push(out, _p.clone().addScaledVector(side, -width * 0.5), w, 1, t * 3);
      }
      for (let i = 0; i < STEPS - 1; i++) {
        const a = start + i * 2;
        out.tri.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
    meshes.push(finish(out, rig, mat, name));
  }
  return meshes;
}

// ---------------------------------------------------------------------------

export function buildKimono(root) {
  const silk = silkMaterial();
  const brocade = brocadeMaterial();
  const pink = solidMaterial(0xe4b4ae, { rough: 0.52 });

  const cord = solidMaterial(0xb03040, { rough: 0.45 });
  // The collar is plain cloth, not more of the floral. A 7 cm band only ever
  // catches a sliver of the peony print, which arrives as smeared streaks.
  const cream = solidMaterial(0xf3ecdd, { rough: 0.5 });

  const parts = [];
  const robe = buildRobe(root, silk);
  const skirt = buildSkirt(root, silk);
  const sleeves = buildSleeves(root, silk);
  // A formal obi is a hand's span of brocade carried high, from the waist to
  // just under the bust — the narrow belt it used to be read as a bathrobe tie.
  const obi = buildBand(root, brocade, {
    y0: 0.985, y1: 1.212, radius: 0.197, name: 'Wardrobe_KimonoObi', tile: 0.30,
  });
  const obiage = buildBand(root, pink, {
    y0: 1.204, y1: 1.262, radius: 0.194, name: 'Wardrobe_KimonoObiage',
    uvU: 1, uvV: 0.2,
  });
  // Obijime: the cord tied across the obi that holds the whole knot shut.
  const obijime = buildBand(root, cord, {
    y0: 1.088, y1: 1.117, radius: 0.203, name: 'Wardrobe_KimonoObijime',
    uvU: 1, uvV: 0.2,
  });
  const bow = buildBow(root, brocade);
  const collar = buildCollar(root, cream, pink);
  for (const m of [robe, skirt, sleeves, obi, obiage, obijime, bow, ...collar]) {
    if (m) parts.push(m);
  }
  return parts;
}
