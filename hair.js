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
//   1. recolourStrands — runs the atlas through the shared brown ramp, and
//      bakes in the AO map the material could not use.
//   2. buildCrown — lifts the painted-hair region of the head mesh off the
//      skull to give the crown real thickness and a soft edge at the hairline,
//      wearing its own copy of the head albedo through that same ramp. Both
//      halves of the hair coming off one ramp is what makes them one colour.
//   3. tuckToScalp — draws the top band of cards in under that crown, so the
//      ring of tabs is buried instead of sticking out through it.
import * as THREE from 'three';

// One brown ramp, and both halves of the hair are run through it. That is the
// whole point: the two sheets carry the same hair in wildly different registers
// — the atlas sits between luminance 37 and 108, the painted scalp between 3
// and 40, a bit over two stops darker — so anything short of putting both on
// one ramp leaves the ponytail and the crown a different colour. Matching their
// working ranges onto shared endpoints is a histogram match; the shading either
// side of it then comes from the geometry, which is where it belongs.
const HAIR_ROOT = [13, 9, 6];
const HAIR_TIP = [96, 72, 52];
const RAMP_GAMMA = 1.05;
// The ramp's input register is the strand atlas's own working span, so the
// atlas feeds it raw. The scalp has to be brought onto that register first, and
// how matters: simply stretching its 3-to-40 span across the ramp does land the
// two on the same value, but it also blows its local contrast up threefold and
// the crown comes out looking brushed. So the alignment is a shift, not a
// stretch — offset puts the scalp's median (16) on the atlas's (73), and the
// gain only gives back the contrast the ramp itself takes out at that point
// (its slope there is 0.72, and 1/0.72 = 1.4), leaving the painted parting and
// root shadows reading at exactly the strength the artist gave them.
const RAMP_RANGE = [25, 120];
const SCALP_ALIGN = { gain: 1.4, offset: 45 };
const AO_DEPTH = 0.75;     // how much of the hair AO is baked into the albedo
const HAIR_ROUGHNESS = 0.78;

// Albedo darker than this is painted hair rather than skin. The scalp sits at
// least a stop under the darkest skin on the sheet, so the threshold has a lot
// of room either side; the eyebrows and lashes fall under it too and are thrown
// out by the flood fill, not by the threshold.
const SCALP_LUMA = 0.22;
// ...and the ramp is released back to the painted pixels over this span, so the
// hairline keeps the gradient into skin the artist painted instead of ending on
// a hard brown edge across the forehead.
const SCALP_SKIN = 0.34;
// An unmasked island smaller than this share of the head is a hole in the hair,
// not a piece of face. The real gap between the two is enormous — the pinholes
// run to a few dozen vertices against the face's several thousand.
const SCALP_HOLE = 0.05;

// Every length below is a fraction of the head's own chin-to-crown height, so
// they rescale to whatever skeleton the pack ships.
const SKULL_DROP = 0.29;    // skull centre, measured down from the crown
const CROWN_LIFT = 0.045;   // hair thickness over the crown
const CROWN_BAND = 0.113;   // the distance inside the hairline it ramps up over
const CROWN_RIM = 0.003;    // ...and what is left of it at the hairline itself
const CROWN_SINK = 0.006;   // how far the ring past the hairline is buried
const CROWN_RADIAL = 0.45;  // how much skull radial is mixed into the lift
const TUCK_PULL = 0.098;    // how far the top of the card mass is drawn in
const TUCK_LIP = 0.023;     // the pull is full this far above the top card...
const TUCK_BAND = 0.230;    // ...and has faded out this far below it
const TUCK_REACH = 0.64;    // cards further out than this are the ponytail

/**
 * Runs a sheet through the hair ramp and hands back a texture.
 *
 * The recolour is a lookup on luminance, which is all either sheet holds worth
 * keeping: the atlas is literally greyscale, and the scalp's colour is the one
 * thing that has to go. Every shape survives it — the strand silhouettes and
 * the soft tips live in the alpha, which is untouched.
 *
 * `align` brings a sheet onto the ramp's register before the lookup. `ao` folds
 * in an occlusion sheet: the pack ships one for the hair and the material asks
 * for it, but the pack's meshes have no second UV set, so three drops it on the
 * floor and the cards are left with no root shadow. `keepAbove` releases the
 * ramp back to the original pixels as they get brighter — measured on the raw
 * luminance, so it still finds the hairline after an alignment — which is how
 * the painted hairline is allowed to keep fading into skin.
 */
function rampToHair(source, { align = null, ao = null, keepAbove = null } = {}) {
  const width = source.width, height = source.height;
  const canvas = Object.assign(document.createElement('canvas'), { width, height });
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(source, 0, 0);
  const image = ctx.getImageData(0, 0, width, height);
  const px = image.data;
  const shade = ao && readPixels(ao, width, height);
  const [lo, hi] = RAMP_RANGE;
  const gain = align?.gain ?? 1, offset = align?.offset ?? 0;

  for (let i = 0; i < px.length; i += 4) {
    const luma = px[i] * 0.3 + px[i + 1] * 0.59 + px[i + 2] * 0.11;
    const level = luma * gain + offset;
    const t = Math.pow(THREE.MathUtils.clamp((level - lo) / (hi - lo), 0, 1), RAMP_GAMMA);
    const lit = shade ? 1 - AO_DEPTH + AO_DEPTH * (shade[i] / 255) : 1;
    const hair = keepAbove ? 1 - THREE.MathUtils.smoothstep(luma, keepAbove[0], keepAbove[1]) : 1;
    for (let c = 0; c < 3; c++) {
      const ramped = (HAIR_ROOT[c] + (HAIR_TIP[c] - HAIR_ROOT[c]) * t) * lit;
      px[i + c] = px[i + c] + (ramped - px[i + c]) * hair;
    }
  }
  ctx.putImageData(image, 0, 0);

  const texture = new THREE.CanvasTexture(canvas);
  texture.flipY = false;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

function recolourStrands(material, atlas, ao) {
  const texture = rampToHair(atlas, { ao });
  texture.anisotropy = material.map?.anisotropy ?? 1;
  material.map = texture;
  material.aoMap = null;                 // now baked into the albedo above
  material.color.setRGB(1, 1, 1);
  // The pack authors hair as metal with a 0.57 smoothness, which is what put a
  // cold sheen on the cards and helped them read as grey satin rather than as
  // hair. Hair is a dielectric; the sheen it does have comes off the roughness.
  material.metalness = 0;
  material.roughness = HAIR_ROUGHNESS;
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
 *
 * Then the holes in it are closed. A handful of painted strand highlights come
 * in brighter than the threshold, and each one the fill steps around is a
 * pinhole in the shell that lets the raw head show through — which is visible,
 * because the raw head is the two stops of dark this whole file exists to get
 * rid of. Anything unmasked that cannot be walked to from the chin is enclosed
 * by hair, and small enough not to be an eye socket, so it is hair.
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

  const seen = new Uint8Array(position.count);
  const limit = position.count * SCALP_HOLE;
  for (let i = 0; i < position.count; i++) {
    if (mask[i] || seen[i]) continue;
    const island = [i];
    seen[i] = 1;
    for (let head = 0; head < island.length; head++) {
      for (const j of adjacent[island[head]]) {
        if (mask[j] || seen[j]) continue;
        seen[j] = 1;
        island.push(j);
      }
    }
    // The face is one such island and dwarfs the cap; the cap keeps it, and any
    // eye socket or mouth bag that ever came through disconnected, out of the
    // mask. What is left under it is a highlight the threshold tripped over.
    if (island.length <= limit) for (const j of island) mask[j] = 1;
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
 * so it wears the hair the artist already painted, parting and all — and can
 * reuse the head's skin weights verbatim. What it does not keep is the artist's
 * value: that sheet is painted two stops under the strand atlas, and the crown
 * gets its own copy run through the ramp so the two agree.
 */
function buildCrown(head, scalp, headHeight, centre) {
  const geometry = head.geometry;
  if (!geometry.index) return null;
  const { mask, adjacent } = paintedHairMask(geometry, scalp);
  const depth = depthInside(geometry, mask, adjacent);
  const source = geometry.attributes;
  const index = geometry.index.array;

  const emitted = new Int32Array(source.position.count).fill(-1);
  const position = [], normal = [], uv = [], skinIndex = [], skinWeight = [], triangles = [];
  const p = new THREE.Vector3(), lift = new THREE.Vector3(), radial = new THREE.Vector3();
  const rim = CROWN_RIM * headHeight, reach = CROWN_LIFT * headHeight;
  const band = CROWN_BAND * headHeight, sink = CROWN_SINK * headHeight;

  // The shell is carried one ring of vertices past the mask and that ring is
  // pushed *into* the head. Stopping on the mask itself cuts the hairline along
  // whole triangles, and the head is coarse enough there that it came out as a
  // visible staircase over the temple. Straddling the boundary instead puts the
  // edge where the offset crosses zero, which is somewhere across a triangle
  // rather than around it — and leaves the hair growing out of the skin the way
  // it should, rather than landing on top of it.
  const emit = i => {
    if (emitted[i] >= 0) return emitted[i];
    p.fromBufferAttribute(source.position, i);
    lift.fromBufferAttribute(source.normal, i).normalize();
    radial.copy(p).sub(centre).normalize();
    lift.lerp(radial, CROWN_RADIAL).normalize();
    p.addScaledVector(lift, mask[i]
      ? rim + reach * THREE.MathUtils.smoothstep(depth[i], 0, band)
      : -sink);
    position.push(p.x, p.y, p.z);
    // Shade off the direction the shell was pushed along, not off the shell.
    // Normals rebuilt from the displaced triangles pick up the thickness ramp
    // as if it were relief: where the lift climbs away from the hairline the
    // facets tilt back, turn away from the sun and go black, and two of those
    // sat right above the forehead. The skull's own smooth field is what a
    // 12 mm offset of the skull should shade like anyway.
    normal.push(lift.x, lift.y, lift.z);
    uv.push(source.uv.getX(i), source.uv.getY(i));
    for (let c = 0; c < 4; c++) {
      skinIndex.push(source.skinIndex.getComponent(i, c));
      skinWeight.push(source.skinWeight.getComponent(i, c));
    }
    return (emitted[i] = position.length / 3 - 1);
  };
  for (let t = 0; t < index.length; t += 3) {
    const a = index[t], b = index[t + 1], c = index[t + 2];
    if (mask[a] || mask[b] || mask[c]) triangles.push(emit(a), emit(b), emit(c));
  }
  if (!triangles.length) return null;

  const shell = new THREE.BufferGeometry();
  shell.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
  shell.setAttribute('normal', new THREE.Float32BufferAttribute(normal, 3));
  shell.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  shell.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndex, 4));
  shell.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeight, 4));
  shell.setIndex(triangles);
  shell.computeBoundingSphere();

  // The head's own material — so the crown keeps its normal map and shades as
  // one piece with the skin it grows out of — on the ramped albedo, and minus
  // the packed metal/roughness map, which is authored for skin and lays a wet
  // highlight across the top of the head.
  const material = head.material.clone();
  material.map = rampToHair(scalp, {
    align: SCALP_ALIGN,
    keepAbove: [SCALP_LUMA * 255, SCALP_SKIN * 255],
  });
  material.map.anisotropy = head.material.map?.anisotropy ?? 1;
  material.metalnessMap = null;
  material.roughnessMap = null;
  material.metalness = 0;
  material.roughness = HAIR_ROUGHNESS;

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
