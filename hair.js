// hair.js — makes the pack's ponytail hairstyle hold up with the cap off.
//
// SK_SurvGirl_Hairstyle_Ponytail_Hat02 is authored to be worn under Hat02. It
// has no crown at all: the cards stop dead in a flat ring 6 cm below the top of
// the skull, because everything above that line is the cap's job, and the head
// albedo paints a scalp in underneath so the gap never shows. Take the cap off
// and you get a smooth painted skullcap with a row of cardboard tabs around it.
//
// The colours do not agree either. The hair atlas is pure greyscale — mean
// (76, 76, 76), chroma 0.02 — and the material tints it with white, so the
// cards render light grey. The scalp painted into the head albedo is a
// near-black warm brown, mean (23, 17, 12). Same head, brown on top and grey
// below, which is exactly what it looked like.
//
// Three passes, in this order because each depends on the last:
//   1. recolourStrands — bakes the atlas through a brown ramp keyed to the
//      painted scalp, and bakes in the AO map the material could not use.
//   2. buildCrown — lifts the painted-hair region of the head mesh off the
//      skull to give the crown real thickness and a soft edge at the hairline.
//   3. tuckToScalp — draws the top band of cards in under that crown, so the
//      ring of tabs is buried instead of sticking out through it.
import * as THREE from 'three';

// The ramp the greyscale atlas is run through. The ends are taken off the
// painted scalp's own range: roots land on its median (#0d0906) and lit strands
// stop short of its brightest texels, so the ponytail reads a shade lighter
// than the crown the way real hair does, without drifting back towards grey.
const STRAND_ROOT = [13, 9, 6];
const STRAND_TIP = [90, 67, 48];
const RAMP_LO = 25;        // atlas luminance that maps to ROOT...
const RAMP_HI = 120;       // ...and to TIP. The atlas spans roughly 25 to 122.
const RAMP_GAMMA = 1.05;
const AO_DEPTH = 0.75;     // how much of the hair AO is baked into the albedo
const STRAND_ROUGHNESS = 0.78;

// Albedo darker than this is painted hair rather than skin. The scalp sits at
// least a stop under the darkest skin on the sheet, so the threshold has a lot
// of room either side; the eyebrows and lashes fall under it too and are thrown
// out by the flood fill, not by the threshold.
const SCALP_LUMA = 0.22;

// Every length below is a fraction of the head's own chin-to-crown height, so
// they rescale to whatever skeleton the pack ships.
const SKULL_DROP = 0.29;    // skull centre, measured down from the crown
const CROWN_LIFT = 0.045;   // hair thickness over the crown
const CROWN_BAND = 0.113;   // the distance inside the hairline it ramps up over
const CROWN_RIM = 0.003;    // ...and what is left of it at the hairline itself
const CROWN_RADIAL = 0.45;  // how much skull radial is mixed into the lift
const TUCK_PULL = 0.098;    // how far the top of the card mass is drawn in
const TUCK_LIP = 0.023;     // the pull is full this far above the top card...
const TUCK_BAND = 0.230;    // ...and has faded out this far below it
const TUCK_REACH = 0.64;    // cards further out than this are the ponytail

/**
 * Repaints the hair atlas as brown and hands back a texture to replace the
 * material's map with. The atlas carries the strand shapes in its alpha and
 * nothing but luminance in its RGB, so the recolour is a lookup on luminance:
 * the shapes, the soft tips and the alpha cutout all survive untouched.
 *
 * The AO map is folded in here as well. The pack ships one and the material
 * asks for it, but the pack's meshes have no second UV set, so three drops it
 * on the floor — without it the cards have no root shadow and read flat.
 */
function recolourStrands(material, atlas, ao) {
  const width = atlas.width, height = atlas.height;
  const canvas = Object.assign(document.createElement('canvas'), { width, height });
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(atlas, 0, 0);
  const image = ctx.getImageData(0, 0, width, height);
  const px = image.data;
  const shade = ao && readPixels(ao, width, height);

  for (let i = 0; i < px.length; i += 4) {
    const luma = px[i] * 0.3 + px[i + 1] * 0.59 + px[i + 2] * 0.11;
    const t = Math.pow(THREE.MathUtils.clamp((luma - RAMP_LO) / (RAMP_HI - RAMP_LO), 0, 1), RAMP_GAMMA);
    const lit = shade ? 1 - AO_DEPTH + AO_DEPTH * (shade[i] / 255) : 1;
    for (let c = 0; c < 3; c++) {
      px[i + c] = (STRAND_ROOT[c] + (STRAND_TIP[c] - STRAND_ROOT[c]) * t) * lit;
    }
  }
  ctx.putImageData(image, 0, 0);

  const texture = new THREE.CanvasTexture(canvas);
  texture.flipY = false;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = material.map?.anisotropy ?? 1;
  material.map = texture;
  material.aoMap = null;                 // now baked into the albedo above
  material.color.setRGB(1, 1, 1);
  // The pack authors hair as metal with a 0.57 smoothness, which is what put a
  // cold sheen on the cards and helped them read as grey satin rather than as
  // hair. Hair is a dielectric; the sheen it does have comes off the roughness.
  material.metalness = 0;
  material.roughness = STRAND_ROUGHNESS;
  material.needsUpdate = true;
}

function readPixels(image, width, height) {
  const canvas = Object.assign(document.createElement('canvas'), { width, height });
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(image, 0, 0, width, height);
  return ctx.getImageData(0, 0, width, height).data;
}

// Vertex neighbours, with the UV seams sewn back up. The head is split along
// its seams into duplicate vertices that share a position but no triangle, and
// the flood fill below has to cross them or it stops at the parting.
function neighbours(geometry) {
  const position = geometry.attributes.position;
  const index = geometry.index.array;
  const adjacent = Array.from({ length: position.count }, () => []);
  const link = (a, b) => { adjacent[a].push(b); adjacent[b].push(a); };
  for (let t = 0; t < index.length; t += 3) {
    const a = index[t], b = index[t + 1], c = index[t + 2];
    link(a, b); link(b, c); link(c, a);
  }
  const welded = new Map();
  for (let i = 0; i < position.count; i++) {
    const key = `${Math.round(position.getX(i) * 1e5)},`
      + `${Math.round(position.getY(i) * 1e5)},${Math.round(position.getZ(i) * 1e5)}`;
    const seam = welded.get(key);
    if (seam === undefined) welded.set(key, i);
    else link(seam, i);
  }
  return adjacent;
}

/**
 * The head vertices the albedo paints hair on, as a mask.
 *
 * A luminance test alone also catches the eyebrows, the lashes and the mouth,
 * so the mask is the dark patch *connected to the crown* rather than every dark
 * texel: one flood fill out of the highest dark vertex, which reaches the whole
 * scalp, both sideburns and the nape, and nothing on the face.
 */
function paintedHairMask(geometry, scalp) {
  const uv = geometry.attributes.uv, position = geometry.attributes.position;
  const { width, height } = scalp;
  const px = readPixels(scalp, width, height);
  const dark = new Uint8Array(position.count);
  for (let i = 0; i < position.count; i++) {
    const x = THREE.MathUtils.clamp(Math.round(uv.getX(i) * (width - 1)), 0, width - 1);
    const y = THREE.MathUtils.clamp(Math.round(uv.getY(i) * (height - 1)), 0, height - 1);
    const o = (y * width + x) * 4;
    dark[i] = (px[o] * 0.3 + px[o + 1] * 0.59 + px[o + 2] * 0.11) / 255 < SCALP_LUMA ? 1 : 0;
  }

  const adjacent = neighbours(geometry);
  let seed = -1, top = -Infinity;
  for (let i = 0; i < position.count; i++) {
    if (dark[i] && position.getY(i) > top) { top = position.getY(i); seed = i; }
  }
  const mask = new Uint8Array(position.count);
  if (seed < 0) return { mask, adjacent };
  const stack = [seed];
  mask[seed] = 1;
  while (stack.length) {
    for (const j of adjacent[stack.pop()]) if (dark[j] && !mask[j]) { mask[j] = 1; stack.push(j); }
  }
  return { mask, adjacent };
}

// Distance from the edge of the mask, walked along the mesh. Used to fade the
// crown's thickness out to nothing at the hairline: an even offset would leave
// a step all the way round where the shell lifts off the skin.
function depthInside(geometry, mask, adjacent) {
  const position = geometry.attributes.position;
  const depth = new Float32Array(position.count).fill(Infinity);
  const queue = [];
  for (let i = 0; i < position.count; i++) {
    if (!mask[i]) continue;
    if (adjacent[i].some(j => !mask[j])) { depth[i] = 0; queue.push(i); }
  }
  const a = new THREE.Vector3(), b = new THREE.Vector3();
  // Dial's algorithm would be tidier, but the region is ~500 vertices and this
  // settles in a handful of sweeps.
  for (let head = 0; head < queue.length; head++) {
    const i = queue[head];
    a.fromBufferAttribute(position, i);
    for (const j of adjacent[i]) {
      if (!mask[j]) continue;
      b.fromBufferAttribute(position, j);
      const step = depth[i] + a.distanceTo(b);
      if (step < depth[j] - 1e-6) { depth[j] = step; queue.push(j); }
    }
  }
  return depth;
}

/**
 * The crown: the painted-hair region of the head mesh, lifted off the skull.
 *
 * Copying the head rather than fitting a dome to it means the shell lands on
 * the pack's own hairline, sideburns and nape for free, keeps the head's UVs —
 * so it is shaded by the hair the artist already painted, at the artist's
 * colour — and can reuse the head's skin weights verbatim.
 */
function buildCrown(head, scalp, headHeight, centre) {
  const geometry = head.geometry;
  if (!geometry.index) return null;
  const { mask, adjacent } = paintedHairMask(geometry, scalp);
  const depth = depthInside(geometry, mask, adjacent);
  const source = geometry.attributes;
  const index = geometry.index.array;

  const emitted = new Int32Array(source.position.count).fill(-1);
  const position = [], uv = [], skinIndex = [], skinWeight = [], triangles = [];
  const p = new THREE.Vector3(), lift = new THREE.Vector3(), radial = new THREE.Vector3();
  const rim = CROWN_RIM * headHeight, reach = CROWN_LIFT * headHeight;
  const band = CROWN_BAND * headHeight;

  const emit = i => {
    if (emitted[i] >= 0) return emitted[i];
    p.fromBufferAttribute(source.position, i);
    lift.fromBufferAttribute(source.normal, i).normalize();
    radial.copy(p).sub(centre).normalize();
    lift.lerp(radial, CROWN_RADIAL).normalize();
    p.addScaledVector(lift, rim + reach * THREE.MathUtils.smoothstep(depth[i], 0, band));
    position.push(p.x, p.y, p.z);
    uv.push(source.uv.getX(i), source.uv.getY(i));
    for (let c = 0; c < 4; c++) {
      skinIndex.push(source.skinIndex.getComponent(i, c));
      skinWeight.push(source.skinWeight.getComponent(i, c));
    }
    return (emitted[i] = position.length / 3 - 1);
  };
  for (let t = 0; t < index.length; t += 3) {
    const a = index[t], b = index[t + 1], c = index[t + 2];
    if (mask[a] && mask[b] && mask[c]) triangles.push(emit(a), emit(b), emit(c));
  }
  if (!triangles.length) return null;

  const shell = new THREE.BufferGeometry();
  shell.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
  shell.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  shell.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndex, 4));
  shell.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeight, 4));
  shell.setIndex(triangles);
  shell.computeVertexNormals();
  shell.computeBoundingSphere();

  // The head's own material, minus its packed metal/roughness map: that map is
  // authored for skin and puts a wet highlight across the top of the head.
  const material = head.material.clone();
  material.metalnessMap = null;
  material.roughnessMap = null;
  material.metalness = 0;
  material.roughness = 0.62;

  const mesh = new THREE.SkinnedMesh(shell, material);
  mesh.name = 'Wardrobe_HairCrown';
  mesh.position.copy(head.position);
  mesh.quaternion.copy(head.quaternion);
  mesh.scale.copy(head.scale);
  mesh.bindMode = head.bindMode;
  mesh.bind(head.skeleton, head.bindMatrix);
  mesh.bindMatrixInverse.copy(head.bindMatrixInverse);
  mesh.castShadow = head.castShadow;
  mesh.receiveShadow = head.receiveShadow;
  mesh.frustumCulled = false;
  mesh.visible = false;
  head.parent.add(mesh);
  return mesh;
}

/**
 * Draws the top of the card mass in towards the skull.
 *
 * The cards were cut off level with the cap's brim, so their top edge is a ring
 * of flat quads all ending at the same height and standing a good centimetre
 * proud of the skull — further out than the crown above, which is why they
 * showed through it as a band of tabs. Pulling that edge in tucks it under the
 * crown and, incidentally, is how the hair should sit anyway: swept tight to
 * the head on its way to a ponytail. The pull fades out well before the free
 * hair, and the ponytail itself is out past TUCK_REACH and never moves.
 *
 * The normals are left alone. They are authored to shade the cards as one
 * volume rather than as separate ribbons, and the displacement here is small
 * and smooth enough that they stay true.
 */
function tuckToScalp(hair, headHeight, centre) {
  const position = hair.geometry.attributes.position;
  const box = new THREE.Box3().setFromBufferAttribute(position);
  const top = box.max.y;
  const from = top - TUCK_BAND * headHeight, to = top + TUCK_LIP * headHeight;
  const pull = TUCK_PULL * headHeight, reach = TUCK_REACH * headHeight;
  const p = new THREE.Vector3(), radial = new THREE.Vector3();

  for (let i = 0; i < position.count; i++) {
    p.fromBufferAttribute(position, i);
    const depth = THREE.MathUtils.smoothstep(p.y, from, to);
    if (depth <= 0) continue;
    radial.copy(p).sub(centre);
    const distance = radial.length();
    if (distance > reach || distance < 1e-6) continue;
    p.addScaledVector(radial.divideScalar(distance), -pull * depth);
    position.setXYZ(i, p.x, p.y, p.z);
  }
  position.needsUpdate = true;
  hair.geometry.computeBoundingSphere();
}

/**
 * Runs the passes over a loaded Player. `images` carries the already decoded
 * pack bitmaps — `scalp` is the head albedo, `strands` and `strandsAO` the hair
 * atlas and its occlusion — because none of this can be done through a
 * THREE.Texture, only through the pixels behind it.
 *
 * Returns the crown mesh, which the caller registers as a wardrobe part so it
 * shows exactly when the cap does not.
 */
export function harmoniseHair(player, images) {
  const { headMesh, hairMesh, hairMaterial } = player;
  if (!headMesh || !hairMesh) return null;

  if (hairMaterial && images.strands) {
    recolourStrands(hairMaterial, images.strands, images.strandsAO);
  }
  if (!images.scalp) return null;

  const box = new THREE.Box3().setFromBufferAttribute(headMesh.geometry.attributes.position);
  const headHeight = box.max.y - box.min.y;
  // Centre of the skull, not of the head: the box runs down to the chin, and
  // everything here is measured off the ball the hair sits on.
  const centre = box.getCenter(new THREE.Vector3()).setY(box.max.y - SKULL_DROP * headHeight);

  const crown = buildCrown(headMesh, images.scalp, headHeight, centre);
  tuckToScalp(hairMesh, headHeight, centre);
  return crown;
}
