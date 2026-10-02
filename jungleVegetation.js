// jungleVegetation.js — the island's plants: coconut palms leaning over the
// beach, rainforest giants in two statures, saplings, ferns in two kinds,
// broad-leaved plants in two kinds (banana and split leaf), bushes, grass
// tufts and hanging lianas, every one of them an InstancedMesh.
//
// REUSABLE AT ISLAND SCALE, like the ocean and the falls: this module owns no
// map. It asks a `layout` for the ground (defaulting to jungleLayout) and
// takes `rules` (a keepOffBuilt hook plus per-species density knobs). The
// village maps will pass their own layout and rules that keep plants off the
// built ground; nothing here changes.
//
// Three rules shape this file:
//
// 1. Each plant is ONE merged geometry (a whole fern clump, a whole palm
//    crown) instanced many times — not one instance per leaf. That keeps the
//    instance counts in the hundreds and the draw calls per species small.
// 2. Instances are bucketed into TILE-metre tiles, one InstancedMesh per
//    species per tile, so the camera frustum culls tile by tile and the small
//    undergrowth can be switched off beyond UNDERGROWTH_FAR (the fog hides
//    the edge). update() does that, a few times a second.
// 3. Nothing here is on `world`. cityBoxes would turn every fern into a wall
//    and every leaf into a camera occluder. The trunks that must stop you are
//    returned as `colliders` for main-JUNGLE.js to register; the canopy
//    trunks are tall, so the web has something to swing from.
//
// Leaves are cut-alpha canvas cards (alphaTest, not blending, so they still
// write depth), cupped so they never collapse to a line edge-on.
//
// Wind: the foliage bends in the VERTEX SHADER (makeLeafMaterial /
// makeSolidMaterial). One shared time uniform; the phase comes from the
// instance's world offset (free), the amplitude from the vertex's distance to
// the plant's base, squared so roots stay planted. update() only advances the
// clock and re-culls — no CPU per leaf or per instance.
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import * as jungleLayout from './jungleLayout.js';

const TILE = 52;
const UNDERGROWTH_FAR = 72;
const LOD_CROWN = { dist: 4 };   // tile sphere within this → detail-2 crowns (tiles are 52 m)

// ---------------------------------------------------------------------------
// Leaf textures.
// ---------------------------------------------------------------------------
function canvas(w, h, draw, maxAniso) {
  const c = Object.assign(document.createElement('canvas'), { width: w, height: h });
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = maxAniso;
  return t;
}
const rgb = (r, g, b, k = 1) => `rgb(${Math.round(r * k)},${Math.round(g * k)},${Math.round(b * k)})`;

// Coconut frond: opposed leaflets up a rib, drooping toward the tip.
function frondTexture(a) {
  return canvas(256, 256, (g, S) => {
    const cx = S / 2;
    for (let i = 0; i < 28; i++) {
      const t = i / 27, y = S - 10 - t * (S - 24);
      const len = Math.sin(Math.PI * (0.18 + t * 0.82)) * S * 0.34 * (1 - t * 0.35);
      const droop = 10 + t * 28;
      for (const dir of [-1, 1]) {
        g.beginPath();
        g.moveTo(cx, y);
        g.quadraticCurveTo(cx + dir * len * 0.6, y - 4, cx + dir * len, y + droop);
        g.quadraticCurveTo(cx + dir * len * 0.5, y + 8, cx, y + 7);
        g.closePath();
        g.fillStyle = rgb(70, 132, 52, 0.7 + ((i + (dir > 0 ? 1 : 0)) % 3) * 0.12);
        g.fill();
      }
    }
    g.strokeStyle = '#8a8a44'; g.lineWidth = 5; g.lineCap = 'round';
    g.beginPath(); g.moveTo(cx, S - 4); g.lineTo(cx, 12); g.stroke();
  }, a);
}

// Fern frond: finer, denser pinnae, tapering to a point.
function fernTexture(a) {
  return canvas(128, 256, (g, W, H) => {
    const cx = W / 2;
    for (let i = 0; i < 30; i++) {
      const t = i / 29, y = H - 8 - t * (H - 16);
      const len = Math.sin(Math.PI * Math.min(1, 0.15 + t)) * W * 0.44 * (1 - t * 0.7);
      for (const dir of [-1, 1]) {
        g.beginPath();
        g.ellipse(cx + dir * len * 0.5, y - 2, len * 0.5, 3.2, dir * -0.35, 0, Math.PI * 2);
        g.fillStyle = rgb(62, 124, 44, 0.75 + (i % 4) * 0.08);
        g.fill();
      }
    }
    g.strokeStyle = '#4e6a2a'; g.lineWidth = 2.4;
    g.beginPath(); g.moveTo(cx, H); g.lineTo(cx, 6); g.stroke();
  }, a);
}

// Upright fern (sword fern): a stiffer, paler rosette — the second fern kind,
// so two plants side by side never read as copies.
function fernUprightTexture(a) {
  return canvas(128, 256, (g, W, H) => {
    const cx = W / 2;
    for (let i = 0; i < 26; i++) {
      const t = i / 25, y = H - 6 - t * (H - 14);
      const len = Math.sin(Math.PI * Math.min(1, 0.12 + t)) * W * 0.3 * (1 - t * 0.55);
      for (const dir of [-1, 1]) {
        g.beginPath();
        g.ellipse(cx + dir * len * 0.5, y, len * 0.46, 2.6, dir * -0.5, 0, Math.PI * 2);
        g.fillStyle = rgb(88, 148, 58, 0.7 + (i % 3) * 0.1);
        g.fill();
      }
    }
    g.strokeStyle = '#5d7a34'; g.lineWidth = 3;
    g.beginPath(); g.moveTo(cx, H); g.lineTo(cx, 4); g.stroke();
  }, a);
}

// Broad leaf (banana / heliconia): one blade, midrib, parallel veins, and a
// few NARROW tears cut after the veins are painted.
function broadLeafTexture(a) {
  return canvas(128, 256, (g, W, H) => {
    const cx = W / 2;
    g.beginPath();
    g.moveTo(cx, H - 2);
    g.bezierCurveTo(cx + W * 0.62, H * 0.78, cx + W * 0.5, H * 0.12, cx, 2);
    g.bezierCurveTo(cx - W * 0.5, H * 0.12, cx - W * 0.62, H * 0.78, cx, H - 2);
    const grd = g.createLinearGradient(0, 0, W, 0);
    grd.addColorStop(0, '#2f6a26'); grd.addColorStop(0.5, '#4f9a38'); grd.addColorStop(1, '#2f6a26');
    g.fillStyle = grd;
    g.fill();
    g.save();
    g.clip();
    g.strokeStyle = 'rgba(190,220,120,0.35)'; g.lineWidth = 1;
    for (let y = 16; y < H - 10; y += 7) {
      g.beginPath(); g.moveTo(cx, y); g.lineTo(0, y - 22); g.moveTo(cx, y); g.lineTo(W, y - 22); g.stroke();
    }
    g.restore();
    g.strokeStyle = '#a8c070'; g.lineWidth = 3;
    g.beginPath(); g.moveTo(cx, H); g.lineTo(cx, 6); g.stroke();
    // Tears, from the margin toward the rib, following the veins.
    g.globalCompositeOperation = 'destination-out';
    g.lineWidth = 2.2;
    for (const [side, y] of [[1, 70], [-1, 104], [1, 150], [-1, 180], [1, 205]]) {
      g.beginPath();
      g.moveTo(cx + side * W * 0.5, y - 22);
      g.lineTo(cx + side * W * 0.12, y);
      g.stroke();
    }
    g.globalCompositeOperation = 'source-over';
  }, a);
}

// Split leaf (monstera): broader, bluer green, with deep RADIAL slits cut
// through the margin and a couple of oval holes — unmistakable next to the
// banana, which is why the two split the broad-leaved scatter.
function monsteraTexture(a) {
  return canvas(160, 256, (g, W, H) => {
    const cx = W / 2;
    g.beginPath();
    g.moveTo(cx, H - 2);
    g.bezierCurveTo(cx + W * 0.72, H * 0.72, cx + W * 0.55, H * 0.1, cx, 2);
    g.bezierCurveTo(cx - W * 0.55, H * 0.1, cx - W * 0.72, H * 0.72, cx, H - 2);
    const grd = g.createLinearGradient(0, 0, W, 0);
    grd.addColorStop(0, '#245c33'); grd.addColorStop(0.5, '#3f8a4a'); grd.addColorStop(1, '#245c33');
    g.fillStyle = grd;
    g.fill();
    g.globalCompositeOperation = 'destination-out';
    g.lineWidth = 5;
    for (const [side, y, k] of [[1, 66, 0.95], [-1, 92, 0.9], [1, 122, 1], [-1, 150, 0.85], [1, 178, 0.8], [-1, 202, 0.7]]) {
      g.beginPath();
      g.moveTo(cx + side * W * 0.55, y - 26);
      g.quadraticCurveTo(cx + side * W * 0.3, y - 8, cx + side * W * 0.1 * k, y);
      g.stroke();
    }
    for (const [side, y] of [[1, 104], [-1, 132]]) {
      g.beginPath();
      g.ellipse(cx + side * W * 0.16, y, 5, 9, side * 0.4, 0, Math.PI * 2);
      g.fill();
    }
    g.globalCompositeOperation = 'source-over';
    g.strokeStyle = 'rgba(200,230,140,0.3)'; g.lineWidth = 1;
    g.beginPath(); g.moveTo(cx, H - 4); g.lineTo(cx, 6); g.stroke();
  }, a);
}

// Liana: a twisting stem with small alternating leaves.
function vineTexture(a) {
  return canvas(64, 512, (g, W, H) => {
    const cx = W / 2;
    g.strokeStyle = '#5a4a2c'; g.lineWidth = 4;
    g.beginPath();
    for (let y = 0; y <= H; y += 8) g.lineTo(cx + Math.sin(y * 0.05) * 6, y);
    g.stroke();
    for (let y = 10; y < H; y += 17) {
      const side = (y / 17) % 2 < 1 ? 1 : -1;
      const x = cx + Math.sin(y * 0.05) * 6;
      g.beginPath();
      g.ellipse(x + side * 10, y + 4, 9, 5, side * 0.6, 0, Math.PI * 2);
      g.fillStyle = rgb(58, 110, 40, 0.8 + (y % 3) * 0.1);
      g.fill();
    }
  }, a);
}

// ---------------------------------------------------------------------------
// Materials. The foliage bends in the vertex shader; cut-out cards also shade
// their underside darker (a leaf seen from below is not the leaf seen from
// above). One shared wind uniform pair; each material carries its own
// amplitude as its own uniform, so programs stay shareable per amplitude.
// ---------------------------------------------------------------------------
const WIND = {
  uWindTime: { value: 0 },
  uWindDir: { value: new THREE.Vector2(0.82, 0.57).normalize() },   // trade wind, off the sea
};

const WIND_CHUNK = `
  #ifdef USE_INSTANCING
    float wRad = length(transformed.xz) + abs(transformed.y);
    float wPh = uWindTime * 1.9 + (instanceMatrix[3][0] + instanceMatrix[3][2]) * 0.14;
    float gust = 0.62 + 0.38 * sin(uWindTime * 0.37 + instanceMatrix[3][0] * 0.017);
    float wK = wRad * wRad * uWindAmp * gust;
    transformed.xz += uWindDir * (sin(wPh) * 0.62 + sin(wPh * 2.17 + 1.4) * 0.27) * wK;
    transformed.y -= wK * 0.16;
  #endif`;

function applyWind(mat, amp, underside = false) {
  mat.onBeforeCompile = sh => {
    sh.uniforms.uWindTime = WIND.uWindTime;
    sh.uniforms.uWindDir = WIND.uWindDir;
    sh.uniforms.uWindAmp = { value: amp };
    sh.vertexShader = 'uniform float uWindTime;\nuniform vec2 uWindDir;\nuniform float uWindAmp;\n'
      + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n' + WIND_CHUNK);
    if (underside) {
      sh.fragmentShader = sh.fragmentShader.replace('#include <color_fragment>',
        '#include <color_fragment>\n  if (!gl_FrontFacing) diffuseColor.rgb *= 0.74;');
    }
  };
  // The patched fragment shader differs by `underside` but the closure's
  // source does not — key the program cache on what actually changed.
  mat.customProgramCacheKey = () => 'vegwind:' + amp + (underside ? ':u' : '');
  return mat;
}

function makeLeafMaterial(map, amp) {
  return applyWind(new THREE.MeshStandardMaterial({
    map, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.78,
  }), amp, true);
}
// Shadow casters with cut-out leaves need their own depth material, or the
// shadow is the card's rectangle.
function leafDepth(map) {
  return new THREE.MeshDepthMaterial({
    depthPacking: THREE.RGBADepthPacking, map, alphaTest: 0.5, side: THREE.DoubleSide,
  });
}
// Solid foliage (crowns, bushes): smooth-shaded, with leaf clumps painted in
// the fragment shader from a world-space noise — darker hollows, lit tips and
// a bump through screen derivatives. No UVs, so no seams on the blob, and the
// clumps never stretch with the instance's scale.
const FOLIAGE_BUMP_VERT = `
  #ifdef USE_INSTANCING
    vFolPos = (modelMatrix * instanceMatrix * vec4(position, 1.0)).xyz;
  #else
    vFolPos = (modelMatrix * vec4(position, 1.0)).xyz;
  #endif`;
const FOLIAGE_BUMP_FRAG_HEAD = `
varying vec3 vFolPos;
float folHash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float folNoise(vec3 x) { vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(folHash(i), folHash(i + vec3(1,0,0)), f.x), mix(folHash(i + vec3(0,1,0)), folHash(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(folHash(i + vec3(0,0,1)), folHash(i + vec3(1,0,1)), f.x), mix(folHash(i + vec3(0,1,1)), folHash(i + vec3(1,1,1)), f.x), f.y), f.z); }
float folLeaves(vec3 p) {
  float n = folNoise(p * 1.1) * 0.55 + folNoise(p * 2.9 + 7.3) * 0.3 + folNoise(p * 7.7 + 3.1) * 0.15;
  return smoothstep(0.25, 0.8, n);
}`;
function makeSolidMaterial({ rough = 0.9 } = {}, amp) {
  const mat = applyWind(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: rough }), amp);
  const windPatch = mat.onBeforeCompile;
  mat.onBeforeCompile = sh => {
    windPatch(sh);
    sh.vertexShader = 'varying vec3 vFolPos;\n' + sh.vertexShader
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>' + FOLIAGE_BUMP_VERT);
    sh.fragmentShader = FOLIAGE_BUMP_FRAG_HEAD + "\n" + sh.fragmentShader
      .replace('#include <color_fragment>', `#include <color_fragment>
  float folH = folLeaves(vFolPos);
  diffuseColor.rgb *= mix(0.55, 1.25, folH);`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
  {
    // Bump from the leaf-clump height (cf. three's perturbNormalArb).
    vec3 vSigmaX = dFdx(-vViewPosition), vSigmaY = dFdy(-vViewPosition);
    vec3 R1 = cross(vSigmaY, normal), R2 = cross(normal, vSigmaX);
    float fDet = dot(vSigmaX, R1) * faceDirection;
    float bump = 0.9 / (1.0 + 0.02 * length(vViewPosition));
    vec2 dH = vec2(dFdx(folH), dFdy(folH)) * bump;
    vec3 vGrad = sign(fDet) * (dH.x * R1 + dH.y * R2);
    normal = normalize(abs(fDet) * normal - vGrad);
  }`);
  };
  mat.customProgramCacheKey = () => 'vegsolid:' + amp;
  return mat;
}

// Bark: vertical fissures and a mossy foot, painted once. The trunk's UVs run
// once round and once up, so the tall scale only lengthens the fissures.
function barkTexture(a) {
  const t = canvas(128, 512, (g, W, H) => {
    g.fillStyle = rgb(118, 104, 88); g.fillRect(0, 0, W, H);
    let s = 7; const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 70; i++) {
      const x = r() * W, w = 1 + r() * 3.5, k = 0.45 + r() * 0.35;
      g.fillStyle = rgb(118, 104, 88, k);
      g.fillRect(x, 0, w, H);
      if (x + w > W) g.fillRect(x - W, 0, w, H);   // wraps round the trunk
    }
    for (let i = 0; i < 260; i++) {
      g.fillStyle = r() < 0.5 ? 'rgba(160,150,130,0.35)' : 'rgba(40,34,28,0.35)';
      g.fillRect(r() * W, r() * H, 2 + r() * 6, 1 + r() * 3);
    }
    const moss = g.createLinearGradient(0, H, 0, H * 0.72);
    moss.addColorStop(0, 'rgba(62,84,40,0.85)'); moss.addColorStop(1, 'rgba(62,84,40,0)');
    g.fillStyle = moss; g.fillRect(0, H * 0.72, W, H * 0.28);
  }, a);
  t.wrapS = THREE.RepeatWrapping;
  return t;
}

// A rainforest trunk: tapered, with a buttress flare at the foot.
function trunkGeo() {
  // Three rings, bunched at the foot where the flare needs them.
  const g = new THREE.CylinderGeometry(0.3, 0.5, 1, 8, 3, true).translate(0, 0.5, 0);
  const p = g.getAttribute('position');
  const RING_Y = [0, 0.05, 0.14, 1];
  for (let i = 0; i < p.count; i++) {
    const y = RING_Y[Math.round(p.getY(i) * 3)];
    const r = 0.5 - 0.2 * y, r0 = Math.hypot(p.getX(i), p.getZ(i));
    p.setXYZ(i, p.getX(i) * r / r0, y, p.getZ(i) * r / r0);
    const a = Math.atan2(p.getZ(i), p.getX(i));
    const flare = 1 + Math.max(0, 1 - y / 0.12) ** 2 * (0.6 + 0.35 * Math.cos(a * 5));
    p.setX(i, p.getX(i) * flare); p.setZ(i, p.getZ(i) * flare);
  }
  g.computeVertexNormals();
  return g;
}

// ---------------------------------------------------------------------------
// Geometry. A "leaf" is a cupped blade growing from the origin: `len` along
// its axis, tilted `tilt` from vertical, sagging `droop` at the tip, spun
// `spin` about Y. Several are merged into one plant.
// ---------------------------------------------------------------------------
function leaf({ w, len, tilt, droop = 0, spin = 0, cup = 0.12, y0 = 0, segY = 5 }) {
  const g = new THREE.PlaneGeometry(1, 1, 2, segY);
  const p = g.getAttribute('position');
  for (let i = 0; i < p.count; i++) {
    const u = p.getX(i) * 2;                 // -1 … 1 across
    const v = p.getY(i) + 0.5;               //  0 … 1 along
    const along = v * len;
    const lateral = u * w * 0.5;
    const back = -(cup * w) * u * u - 0.05 * len * v * v * 0.3;
    const x = lateral;
    const y = y0 + along * Math.cos(tilt) - droop * v * v + back * Math.sin(tilt);
    const z = along * Math.sin(tilt) + back * Math.cos(tilt);
    p.setXYZ(i, x * Math.cos(spin) + z * Math.sin(spin), y, -x * Math.sin(spin) + z * Math.cos(spin));
  }
  g.computeVertexNormals();
  return g;
}

function palmCrownGeo() {
  const parts = [];
  const n = 11;
  for (let i = 0; i < n; i++) {
    parts.push(leaf({
      w: 2.4, len: 4.2 + (i % 3) * 0.4, tilt: 1.05 + (i % 3) * 0.25, droop: 1.6 + (i % 2) * 0.6,
      spin: (i / n) * Math.PI * 2 + (i % 2) * 0.2, cup: 0.18,
    }));
  }
  return mergeGeometries(parts);
}

// A trunk that curves: a tapered cylinder whose axis bends toward local -Z
// with height. The top is at (0, 1, -BEND) in unit space.
const PALM_BEND = 0.45;   // in units of the trunk's girth scale (×1.1)
function palmTrunkGeo() {
  const g = new THREE.CylinderGeometry(0.17, 0.24, 1, 8, 10).translate(0, 0.5, 0);
  const p = g.getAttribute('position');
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    p.setZ(i, p.getZ(i) - PALM_BEND * y * y);
  }
  g.computeVertexNormals();
  return g;
}

function fernGeo() {
  const parts = [];
  const n = 9;
  for (let i = 0; i < n; i++) {
    parts.push(leaf({
      w: 0.5, len: 1.1 + (i % 3) * 0.2, tilt: 0.7 + (i % 3) * 0.25, droop: 0.35,
      spin: (i / n) * Math.PI * 2 + (i % 2) * 0.3, cup: 0.15, segY: 3,
    }));
  }
  return mergeGeometries(parts);
}

// Upright fern (sword fern): fewer, stiffer blades standing more vertically —
// the second fern kind.
function fernUprightGeo() {
  const parts = [];
  const n = 7;
  for (let i = 0; i < n; i++) {
    parts.push(leaf({
      w: 0.34, len: 1.15 + (i % 3) * 0.25, tilt: 0.22 + (i % 3) * 0.22, droop: 0.18,
      spin: (i / n) * Math.PI * 2 + (i % 2) * 0.4, cup: 0.1, segY: 3,
    }));
  }
  return mergeGeometries(parts);
}

// Broad-leaved plant (banana): leaves held up on stalks, arching out.
function broadPlantGeo() {
  const parts = [];
  const n = 6;
  for (let i = 0; i < n; i++) {
    const spin = (i / n) * Math.PI * 2 + (i % 2) * 0.4;
    const tilt = 0.45 + (i % 3) * 0.2;
    parts.push(leaf({ w: 0.75, len: 1.9, tilt: tilt + 0.3, droop: 0.5, spin, cup: 0.1, y0: 0.7 }));
    // Petiole as a thin card.
    parts.push(leaf({ w: 0.05, len: 0.8, tilt: tilt * 0.6, spin, cup: 0, segY: 1 }));
  }
  return mergeGeometries(parts);
}

// Split-leaved plant (monstera): five wide blades held LOW, arching almost
// horizontally — it hugs the damp ground the bananas stand above.
function monsteraGeo() {
  const parts = [];
  const n = 5;
  for (let i = 0; i < n; i++) {
    const spin = (i / n) * Math.PI * 2 + (i % 2) * 0.5;
    parts.push(leaf({
      w: 1.05, len: 1.55, tilt: 0.85 + (i % 2) * 0.18, droop: 0.55, spin, cup: 0.16, y0: 0.5,
    }));
    parts.push(leaf({ w: 0.06, len: 0.7, tilt: 0.5, spin, cup: 0, segY: 1 }));
  }
  return mergeGeometries(parts);
}

// Rainforest giant's crown lobe: a lumpy blob. Solid, so it shades the
// floor below without an alpha depth pass. Welded and smooth-shaded — the
// leafy relief comes from the material's world-space bump (foliageBump), not
// from facets. `detail` 2 near the eye, 1 for the backdrop and the bushes.
function crownLobeGeo(detail = 2) {
  let g = new THREE.IcosahedronGeometry(1, detail);
  g.deleteAttribute('normal'); g.deleteAttribute('uv');
  g = mergeVertices(g);
  const p = g.getAttribute('position');
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const k = Math.sin(v.x * 3.1 + 1.7) * Math.sin(v.y * 2.7 + 0.4) * Math.sin(v.z * 3.3 + 2.1)
      + 0.5 * Math.sin(v.x * 5.3 - v.z * 4.1 + v.y * 2.3);
    v.multiplyScalar(0.94 + k * 0.1);
    v.y *= 0.55;
    // A flatter, slightly tucked underside: crowns are lit from above.
    if (v.y < 0) v.y *= 0.8;
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}

// A bush: two squashed crown lobes — solid, cheap, casts a real shadow, and
// gives the mid layer of the forest somewhere to be.
function bushGeo() {
  const a = crownLobeGeo(1); a.scale(1, 0.62, 1); a.translate(0, 0.3, 0);
  const b = crownLobeGeo(1); b.scale(0.66, 0.5, 0.66); b.translate(0.3, 0.55, -0.18);
  return mergeGeometries([a, b]);
}

// A tuft of grass: plain green blades (no texture, no alpha) fanning from the
// base. Cheap enough to scatter by the thousand.
function grassTuftGeo() {
  const parts = [];
  const n = 6;
  for (let i = 0; i < n; i++) {
    parts.push(leaf({
      w: 0.05, len: 0.34 + (i % 4) * 0.09, tilt: 0.16 + (i % 3) * 0.17, droop: 0.12,
      spin: (i / n) * Math.PI * 2 + (i % 2) * 0.35, cup: 0.08, segY: 2,
    }));
  }
  return mergeGeometries(parts);
}

// A nectar tuft: three tubular blooms nodding from the top of a thin stem —
// the shape a hummingbird works. Vertex colours carry the split the instance
// tint cannot: green for the stem, near-white for the blooms (the tint is
// multiplied over them, so the blooms take the warm hue and the stem just
// darkens under it). ~40 triangles; scattered by the hundred.
function flowerGeo() {
  const paint = (g, r, gr, b) => {
    const n = g.attributes.position.count, c = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { c[i * 3] = r; c[i * 3 + 1] = gr; c[i * 3 + 2] = b; }
    g.setAttribute('color', new THREE.BufferAttribute(c, 3));
    return g;
  };
  const parts = [paint(
    new THREE.CylinderGeometry(0.004, 0.007, 0.3, 5, 1, true).translate(0, 0.15, 0),
    0.24, 0.38, 0.18)];
  for (let i = 0; i < 3; i++) {
    const tube = new THREE.CylinderGeometry(0.02, 0.011, 0.08, 5, 1, true);
    tube.translate(0, 0.04, 0);          // pivot at the stem top
    tube.rotateX(0.95);                  // nodding outward
    tube.rotateY((i / 3) * Math.PI * 2 + 0.5);
    tube.translate(0, 0.285, 0);
    parts.push(paint(tube, 1, 0.93, 0.9));
  }
  return mergeGeometries(parts);
}

// ---------------------------------------------------------------------------
// Tiled instancing.
// ---------------------------------------------------------------------------
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler();
const _p = new THREE.Vector3(), _s = new THREE.Vector3();
function matrixOf(it) {
  _p.set(it.x, it.y, it.z);
  _e.set(it.rx || 0, it.ry || 0, it.rz || 0, 'YXZ');
  _q.setFromEuler(_e);
  _s.set(it.sx ?? it.s ?? 1, it.sy ?? it.s ?? 1, it.sz ?? it.s ?? 1);
  return _m.compose(_p, _q, _s);
}

function tiled(group, name, geo, mat, items, { cast = false, depth = null, far = Infinity, tint = null, tile = TILE, lod = null } = {}) {
  const tiles = new Map();
  for (const it of items) {
    const k = `${Math.floor(it.x / tile)},${Math.floor(it.z / tile)}`;
    (tiles.get(k) ?? tiles.set(k, []).get(k)).push(it);
  }
  const meshes = [];
  const col = new THREE.Color();
  for (const [k, list] of tiles) {
    const im = new THREE.InstancedMesh(geo, mat, list.length);
    list.forEach((it, i) => {
      im.setMatrixAt(i, matrixOf(it));
      if (tint) im.setColorAt(i, col.setHSL(tint.h + (it.hue ?? 0), tint.s, tint.l + (it.light ?? 0)));
    });
    im.instanceMatrix.needsUpdate = true;
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
    im.computeBoundingSphere();
    im.castShadow = cast;
    im.receiveShadow = true;
    if (depth) im.customDepthMaterial = depth;
    im.name = `${name}@${k}`;
    im.userData.far = far;
    im.userData.lod = lod;
    group.add(im);
    meshes.push(im);
  }
  return meshes;
}

// ---------------------------------------------------------------------------
// Scatter.
// ---------------------------------------------------------------------------
// Low-frequency clumping: plants grow in patches, never as an even scatter.
function clump(x, z, salt) {
  return 0.5 + 0.5 * Math.sin(x * 0.083 + salt + Math.sin(z * 0.061 + salt * 2) * 2.1)
    * Math.cos(z * 0.074 - salt + Math.sin(x * 0.05) * 1.7);
}

function jittered(rnd, x0, x1, z0, z1, cell, keep) {
  const out = [];
  for (let z = z0; z < z1; z += cell) for (let x = x0; x < x1; x += cell) {
    const px = x + rnd() * cell, pz = z + rnd() * cell;
    const r = rnd();
    if (keep(px, pz, r)) out.push([px, pz]);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Build.
// ---------------------------------------------------------------------------
export function buildJungleVegetation({ scene, rnd, maxAniso = 4, layout, rules } = {}) {
  if (rules?.region) return buildGardenVegetation({ scene, rnd, maxAniso, layout, rules });
  const L = { ...jungleLayout, ...(layout || {}) };
  const {
    terrainHeight, terrainSlope, soilAt, SOIL, forestDensity,
    shoreAt, cliffZ, ridgeAt, pathDistance, PATH_HALF_W, SAND_END, PLAY_HALF_W, smoothstep,
    streamDistance, STREAM_HALF_W,
  } = L;

  // The scatter rules. A map retunes these: the villages pass a keepOffBuilt
  // that also clears their plazas and gardens, and pull densities down where
  // people walk. Everything else — soil, slope, altitude, distance to water,
  // the sightlines — comes from the layout, so the rules stay small.
  const R = {
    densities: {
      palms: 1, giants: 1, understory: 0.9, saplings: 1, ferns: 1,
      broads: 1, bushes: 1, grass: 1, vines: 1,
    },
    // The cove keeps plants off the jetty and out of the pool bowl.
    keepOffBuilt: (x, z) => {
      if (Math.abs(x - L.JETTY.x) < L.JETTY.halfW + 2 && z < L.JETTY.z0 + 3) return false;
      if (Math.hypot(x - L.POOL.x, z - L.POOL.z) < L.POOL.r + 1) return false;
      return true;
    },
    ...(rules || {}),
  };
  const dens = k => (R.densities[k] ?? 1);

  const group = new THREE.Group();
  group.name = 'jungle_vegetation';
  scene.add(group);
  const colliders = [];
  const meshes = [];

  const tex = {
    frond: frondTexture(maxAniso), fern: fernTexture(maxAniso), fernUp: fernUprightTexture(maxAniso),
    broad: broadLeafTexture(maxAniso), monstera: monsteraTexture(maxAniso), vine: vineTexture(maxAniso),
  };
  const mat = {
    frond: makeLeafMaterial(tex.frond, 0.022),
    fern: makeLeafMaterial(tex.fern, 0.04),
    fernUp: makeLeafMaterial(tex.fernUp, 0.03),
    broad: makeLeafMaterial(tex.broad, 0.03),
    monstera: makeLeafMaterial(tex.monstera, 0.026),
    vine: makeLeafMaterial(tex.vine, 0.012),
    palmBark: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95 }),
    bark: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, map: barkTexture(maxAniso) }),
    crown: makeSolidMaterial({}, 0.012),
    bush: makeSolidMaterial({ rough: 0.92 }, 0.02),
    grass: applyWind(new THREE.MeshStandardMaterial({
      color: 0xffffff, side: THREE.DoubleSide, roughness: 0.85,
    }), 0.06),
    // The nectar tuft: vertex-coloured (green stems, near-white blooms), the
    // warm instance tint laid over both — see flowerGeo.
    flower: applyWind(new THREE.MeshStandardMaterial({
      color: 0xffffff, vertexColors: true, side: THREE.DoubleSide, roughness: 0.85,
    }), 0.02),
  };
  const geo = {
    palmTrunk: palmTrunkGeo(), palmCrown: palmCrownGeo(),
    fern: fernGeo(), fernUp: fernUprightGeo(),
    broad: broadPlantGeo(), monstera: monsteraGeo(),
    trunk: trunkGeo(), lobeFar: crownLobeGeo(1),
    trunkFar: new THREE.CylinderGeometry(0.3, 0.5, 1, 7, 1, true).translate(0, 0.5, 0),
    lobe: crownLobeGeo(), bush: bushGeo(), grass: grassTuftGeo(),
    flower: flowerGeo(),
    vine: new THREE.PlaneGeometry(0.5, 1, 1, 4).translate(0, -0.5, 0),
  };

  // --- Coconut palms: a band along the back of the beach and the forest
  // edge, leaning out toward the light over the sand; a few more scattered
  // through the forest (the island's signature). Three presentations —
  // upright, leaning seaward, twisting aside — so no two crowns match.
  const palmTrunks = [], palmCrowns = [];
  const palmSpots = jittered(rnd, -PLAY_HALF_W + 6, PLAY_HALF_W - 6, -12, SAND_END + 22, 6.5, (x, z, r) => {
    const d = z - shoreAt(x);
    if (d < 7 || !R.keepOffBuilt(x, z)) return false;
    if (pathDistance(x, z) < PATH_HALF_W + 1.5) return false;
    if (ridgeAt(x) > 0.3) return false;
    if (terrainSlope(x, z) > 0.6) return false;   // not on the talus or a scarp
    const band = smoothstep(d, 7, 12) * (1 - smoothstep(z, SAND_END + 8, SAND_END + 22));
    return r < band * (0.25 + 0.5 * clump(x, z, 1.3)) * dens('palms');
  });
  palmSpots.push(...jittered(rnd, -70, 70, SAND_END + 20, 130, 22, (x, z, r) =>
    r < 0.35 * forestDensity(x, z) * dens('palms') && terrainSlope(x, z) < 0.7));
  const top = new THREE.Vector3();
  for (const [x, z] of palmSpots) {
    const h = 8 + rnd() * 6;
    const kind = rnd();
    // Local -Z is the way the trunk bends and leans; ry ≈ 0 points that
    // seaward, give or take.
    const ry = (rnd() - 0.5) * 1.4;
    const rx = kind < 0.55 ? -(0.1 + rnd() * 0.24)        // leaning over the sand
      : kind < 0.8 ? -(0.02 + rnd() * 0.06)               // standing up
      : -(0.06 + rnd() * 0.1);                            // a little of both
    const rz = kind >= 0.8 ? (rnd() - 0.5) * 0.3 : 0;
    const y = terrainHeight(x, z) - 0.2;
    const trunk = { x, y, z, sx: 1.1, sy: h, sz: 1.1, ry, rx, rz,
      hue: (rnd() - 0.5) * 0.02, light: (rnd() - 0.5) * 0.08 };
    palmTrunks.push(trunk);
    // The crown sits on the bent, leaning top, found through the same matrix.
    top.set(0, 1, -PALM_BEND).applyMatrix4(matrixOf(trunk));
    palmCrowns.push({ x: top.x, y: top.y - 0.1, z: top.z, s: 1.25 + rnd() * 0.35, ry: rnd() * 6.28,
      rx: (rnd() - 0.5) * 0.15, rz: (rnd() - 0.5) * 0.1,
      hue: (rnd() - 0.5) * 0.05, light: (rnd() - 0.5) * 0.1 });
    colliders.push({ x0: x - 0.3, x1: x + 0.3, z0: z - 0.3, z1: z + 0.3, y0: y, y1: y + 3, tall: false });
  }

  // --- Saplings: the palms' children — small rosettes of the same fronds —
  // filling the forest's mid-ground wherever the giants let light through.
  const saplings = jittered(rnd, -PLAY_HALF_W - 10, PLAY_HALF_W + 10, SAND_END + 2, 148, 5.2, (x, z, r) =>
    R.keepOffBuilt(x, z) && soilAt(x, z) === SOIL.FOREST && terrainSlope(x, z) < 0.75
    && pathDistance(x, z) > PATH_HALF_W + 1
    && r < forestDensity(x, z) * (0.16 + 0.4 * clump(x, z, 9.1)) * dens('saplings'))
    .map(([x, z]) => ({ x, y: terrainHeight(x, z) - 0.03, z, s: 0.1 + rnd() * 0.12,
      ry: rnd() * 6.28, hue: (rnd() - 0.5) * 0.05, light: (rnd() - 0.5) * 0.1 }));

  // --- Rainforest giants in two statures: an understorey of 6–9 m trees that
  // fills the mid-distance below the dominants, and the 14–26 m giants of the
  // valley, the ridges and the skyline above the falls. The valley's
  // dominants wear one of two crown morphologies — the old ball of lobes, or
  // a wider, flatter disc of smaller ones — so no two silhouettes repeat.
  const understory = [], understoryLobes = [];
  jittered(rnd, -PLAY_HALF_W - 10, PLAY_HALF_W + 10, SAND_END + 6, 148, 8, (x, z, r) => {
    if (!R.keepOffBuilt(x, z) || soilAt(x, z) !== SOIL.FOREST || terrainSlope(x, z) > 0.8
      || pathDistance(x, z) <= PATH_HALF_W + 1.2
      || r >= forestDensity(x, z) * (0.3 + 0.4 * clump(x, z, 6.3)) * dens('understory')) return;
    const y = terrainHeight(x, z);
    const h = 6 + rnd() * 3.5, girth = 0.7 + rnd() * 0.4;
    understory.push({ x, y: y - 0.2, z, sx: girth, sy: h, sz: girth, ry: rnd() * 6.28,
      hue: (rnd() - 0.5) * 0.02, light: (rnd() - 0.5) * 0.07 });
    const Rc = 2.4 + rnd() * 1.6, nL = 2 + Math.floor(rnd() * 2);
    for (let i = 0; i < nL; i++) {
      const off = i === 0 ? 0 : Rc * (0.4 + rnd() * 0.3);
      understoryLobes.push({
        x: x + Math.cos(i * 2.4) * off, y: y + h - 0.4 + (rnd() - 0.5), z: z + Math.sin(i * 2.4) * off,
        sx: Rc * (0.85 + rnd() * 0.3), sy: Rc * (0.5 + rnd() * 0.25), sz: Rc * (0.85 + rnd() * 0.3),
        ry: rnd() * 6.28, hue: (rnd() - 0.5) * 0.05, light: (rnd() - 0.5) * 0.08,
      });
    }
    colliders.push({ x0: x - girth * 0.4, x1: x + girth * 0.4, z0: z - girth * 0.4,
      z1: z + girth * 0.4, y0: y - 0.3, y1: y + h, tall: false });
  });

  const valleySpots = jittered(rnd, -PLAY_HALF_W - 30, PLAY_HALF_W + 30, SAND_END + 4, 160, 10, (x, z, r) =>
    (r < forestDensity(x, z) * (0.35 + 0.45 * clump(x, z, 4.1)) * dens('giants')
      || (ridgeAt(x) > 0.4 && z < cliffZ(x) - 3 && z > -20 && r < 0.4))
    && terrainSlope(x, z) < 0.9);
  // The skyline above the falls. Always on screen from the valley, never
  // close, so it goes in big tiles: fewer draw calls, nothing to cull.
  const backdropSpots = jittered(rnd, -200, 200, 150, 300, 13, (x, z, r) =>
    z > cliffZ(x) + 5 && r < 0.55 && terrainSlope(x, z) < 1.1);
  const trunks = [], lobes = [], vines = [];
  const backTrunks = [], backLobes = [];
  for (const [x, z, backdrop] of [
    ...valleySpots.map(([x, z]) => [x, z, false]),
    ...backdropSpots.map(([x, z]) => [x, z, true]),
  ]) {
    const trunkList = backdrop ? backTrunks : trunks;
    const lobeList = backdrop ? backLobes : lobes;
    const y = terrainHeight(x, z);
    const h = 14 + rnd() * 12;
    const girth = 1.2 + rnd() * 0.9;
    trunkList.push({ x, y: y - 0.3, z, sx: girth, sy: h, sz: girth, ry: rnd() * 6.28,
      hue: (rnd() - 0.5) * 0.02, light: (rnd() - 0.5) * 0.06 });
    const disc = !backdrop && rnd() < 0.4;
    const Rc = (4 + rnd() * 3.5) * (disc ? 1.3 : 1);
    const nL = disc ? 5 + Math.floor(rnd() * 3) : 3 + Math.floor(rnd() * 3);
    for (let i = 0; i < nL; i++) {
      const a = (i / nL) * Math.PI * 2 + rnd();
      const off = i === 0 ? 0 : Rc * (disc ? 0.62 + rnd() * 0.3 : 0.45 + rnd() * 0.35);
      lobeList.push({
        x: x + Math.cos(a) * off,
        y: y + h + (disc ? (rnd() - 0.7) * 1.6 : (rnd() - 0.3) * 2.5),
        z: z + Math.sin(a) * off,
        sx: Rc * (0.8 + rnd() * 0.4), sy: Rc * (disc ? 0.42 + rnd() * 0.2 : 0.8 + rnd() * 0.4),
        sz: Rc * (0.8 + rnd() * 0.4),
        ry: rnd() * 6.28, hue: (rnd() - 0.5) * 0.05, light: (rnd() - 0.5) * 0.07,
      });
    }
    // Lianas hanging from the crown's rim — only in the walkable valley,
    // where someone can see them.
    if (Math.abs(x) < PLAY_HALF_W && z < 150) {
      const nV = Math.floor(rnd() * 4);
      for (let i = 0; i < nV; i++) {
        const a = rnd() * Math.PI * 2, off = Rc * (0.4 + rnd() * 0.5);
        const vx = x + Math.cos(a) * off, vz = z + Math.sin(a) * off;
        const ground = terrainHeight(vx, vz);
        const top2 = y + h - 0.5;
        const len = (top2 - ground) * (0.45 + rnd() * 0.5);
        if (pathDistance(vx, vz) < PATH_HALF_W + 0.3 && top2 - len < ground + 2.2) continue;
        vines.push({ x: vx, y: top2, z: vz, sx: 1, sy: len, sz: 1, ry: rnd() * 6.28 });
        vines.push({ x: vx, y: top2, z: vz, sx: 1, sy: len, sz: 1, ry: rnd() * 6.28 + Math.PI / 2 });
      }
    }
    if (Math.abs(x) < PLAY_HALF_W + 2) {
      colliders.push({ x0: x - girth * 0.4, x1: x + girth * 0.4, z0: z - girth * 0.4,
        z1: z + girth * 0.4, y0: y - 0.3, y1: y + h, tall: true });
    }
  }

  // --- Undergrowth: the two ferns and the two broad-leaved plants, in
  // patches, densest where the ground stays WET — the stream banks and the
  // pool rim, where the old scatter kept a bare ring — and thinning toward
  // the path so it stays a path. The wet ring is lush on its own terms
  // (forestDensity is ~0 there by design), but only inland: the beach's wet
  // sand is the swash's business, not the ferns'.
  const fernsAll = [];
  const pushFern = (x, z, s0, s1) => fernsAll.push({
    x, y: terrainHeight(x, z) - 0.05 - terrainSlope(x, z) * 0.2, z,
    s: s0 + rnd() * (s1 - s0), ry: rnd() * 6.28,
    hue: (rnd() - 0.5) * 0.06, light: (rnd() - 0.5) * 0.1,
  });
  // Damp ground by the layout's own measures: the stream's banks and the
  // pool's rim (SOIL.WET's 0.5 threshold is narrower than the visibly damp
  // band, so the ring is measured, not read off the mask).
  const damp = (x, z) =>
    streamDistance(x, z) < STREAM_HALF_W + 2.8
    || Math.hypot(x - L.POOL.x, z - L.POOL.z) < L.POOL.r + 2.8;
  jittered(rnd, -PLAY_HALF_W - 10, PLAY_HALF_W + 10, SAND_END - 4, 156, 2.7, (x, z, r) => {
    if (!R.keepOffBuilt(x, z) || terrainSlope(x, z) > 1.0) return;
    const soil = soilAt(x, z);
    if (soil === SOIL.SHALLOW || soil === SOIL.ROCK) return;
    if (damp(x, z) && z > L.SAND_END - 2) {
      if (r < (0.62 + 0.3 * clump(x, z, 7.7)) * dens('ferns')) pushFern(x, z, 1.1, 2.2);
    } else if (soil === SOIL.FOREST
      && pathDistance(x, z) > PATH_HALF_W + 0.6
      && r < forestDensity(x, z) * (0.2 + 0.7 * clump(x, z, 7.7)) * dens('ferns')) {
      pushFern(x, z, 0.8, 1.7);
    }
  });
  const ferns = [], fernsUp = [];
  for (const it of fernsAll) (rnd() < 0.42 ? fernsUp : ferns).push(it);

  const broadsAll = [];
  const pushBroad = (x, z, s0, s1) => broadsAll.push({
    x, y: terrainHeight(x, z) - 0.05 - terrainSlope(x, z) * 0.2, z,
    s: s0 + rnd() * (s1 - s0), ry: rnd() * 6.28,
    hue: (rnd() - 0.5) * 0.05, light: (rnd() - 0.5) * 0.08,
  });
  jittered(rnd, -PLAY_HALF_W - 10, PLAY_HALF_W + 10, SAND_END - 2, 156, 4.6, (x, z, r) => {
    if (!R.keepOffBuilt(x, z) || terrainSlope(x, z) > 1.0) return;
    const soil = soilAt(x, z);
    if (soil === SOIL.SHALLOW || soil === SOIL.ROCK) return;
    if (damp(x, z) && z > L.SAND_END - 2) {
      if (r < (0.46 + 0.38 * clump(x, z, 2.9)) * dens('broads')) pushBroad(x, z, 1.0, 1.9);
    } else if (soil === SOIL.FOREST
      && pathDistance(x, z) > PATH_HALF_W + 0.6
      && r < forestDensity(x, z) * (0.1 + 0.55 * clump(x, z, 2.9)) * dens('broads')) {
      pushBroad(x, z, 0.9, 1.7);
    }
  });
  const broads = [], monsteras = [];
  for (const it of broadsAll) (rnd() < 0.45 ? monsteras : broads).push(it);

  // --- Bushes: solid squashed lobes edging the forest and spotting the
  // clearings — the mid layer the eye had nowhere to rest on.
  const bushes = jittered(rnd, -PLAY_HALF_W - 8, PLAY_HALF_W + 8, SAND_END - 2, 152, 5.5, (x, z, r) => {
    if (!R.keepOffBuilt(x, z) || terrainSlope(x, z) > 0.7) return false;
    if (pathDistance(x, z) <= PATH_HALF_W + 1.2) return false;
    const soil = soilAt(x, z);
    if (soil !== SOIL.FOREST && soil !== SOIL.WET) return false;
    return r < forestDensity(x, z) * (0.22 + 0.45 * clump(x, z, 2.2)) * dens('bushes');
  }).map(([x, z]) => ({ x, y: terrainHeight(x, z) - 0.1, z, s: 0.65 + rnd() * 0.75,
    ry: rnd() * 6.28, hue: (rnd() - 0.5) * 0.04, light: (rnd() - 0.5) * 0.09 }));

  // --- Grass: plain-green tufts dressing the open ground — the path's
  // shoulders, the clearings, the damp ring, the back of the beach. The tread
  // itself stays bare: the tufts start just off it, fade out within three
  // metres, and leave the dense undergrowth to close the seam.
  const grass = jittered(rnd, -PLAY_HALF_W - 6, PLAY_HALF_W + 6, -18, 152, 2.0, (x, z, r) => {
    if (!R.keepOffBuilt(x, z) || terrainSlope(x, z) > 0.8) return false;
    const soil = soilAt(x, z);
    if (soil === SOIL.SHALLOW || soil === SOIL.ROCK) return false;
    const pd = pathDistance(x, z);
    if (pd < PATH_HALF_W + 0.12) return false;   // the tread stays a tread
    const d = z - shoreAt(x);
    const back = smoothstep(d, 6, 10) * (1 - smoothstep(z, SAND_END + 2, SAND_END + 10)) * 0.3;
    const edge = smoothstep(pd, PATH_HALF_W + 0.12, PATH_HALF_W + 0.9)
      * (1 - smoothstep(pd, PATH_HALF_W + 0.9, PATH_HALF_W + 2.6)) * 0.7;
    const clearing = (1 - smoothstep(forestDensity(x, z), 0.15, 0.55)) * 0.38
      * (0.4 + 0.6 * clump(x, z, 5.5));
    const wetK = soil === SOIL.WET && z > L.SAND_END - 2 ? 0.5 : 0;
    return r < Math.max(edge, clearing, wetK, back) * dens('grass');
  }).map(([x, z]) => ({ x, y: terrainHeight(x, z) - 0.03, z, s: 0.7 + rnd() * 0.9,
    ry: rnd() * 6.28, hue: (rnd() - 0.5) * 0.05, light: (rnd() - 0.5) * 0.12 }));

  // --- Flowers: tubular nectar blooms in the clearings and along the
  // forest edge — what the hummingbirds (wildlifeHummingbird.js) work.
  // Seeded LAST of the scatters so every rnd() draw above keeps its place:
  // adding a plant must not move another.
  const flowers = jittered(rnd, -PLAY_HALF_W - 6, PLAY_HALF_W + 6, SAND_END - 4, 152, 2.3, (x, z, r) => {
    if (!R.keepOffBuilt(x, z) || terrainSlope(x, z) > 0.8) return false;
    const soil = soilAt(x, z);
    if (soil !== SOIL.FOREST && soil !== SOIL.DIRT) return false;
    if (pathDistance(x, z) < PATH_HALF_W + 0.8) return false;
    return r < (0.07 + 0.2 * clump(x, z, 9.1)) * dens('flowers')
      * (0.3 + 0.7 * forestDensity(x, z));
  }).map(([x, z]) => ({ x, y: terrainHeight(x, z) - 0.02, z, s: 0.9 + rnd() * 0.8,
    ry: rnd() * 6.28, hue: (rnd() - 0.5) * 0.05, light: (rnd() - 0.5) * 0.1 }));
  // The tufts' footprints, for the wildlife adapter's `spots.flowers` — the
  // hummingbirds' anchors and habitat (`near`).
  const flowerSpots = flowers.map(f => ({ x: f.x, y: f.y, z: f.z, r: 0.4 * f.s }));

  meshes.push(...tiled(group, 'palmTrunk', geo.palmTrunk, mat.palmBark, palmTrunks,
    { cast: true, tint: { h: 0.08, s: 0.26, l: 0.36 } }));
  meshes.push(...tiled(group, 'palmCrown', geo.palmCrown, mat.frond, palmCrowns,
    { cast: true, depth: leafDepth(tex.frond), tint: { h: 0, s: 0, l: 1 } }));
  meshes.push(...tiled(group, 'sapling', geo.palmCrown, mat.frond, saplings,
    { far: UNDERGROWTH_FAR, tint: { h: 0, s: 0, l: 1 } }));
  meshes.push(...tiled(group, 'understory', geo.trunk, mat.bark, understory,
    { cast: true, tint: { h: 0.08, s: 0.12, l: 0.62 } }));
  meshes.push(...tiled(group, 'understoryCrown', geo.lobe, mat.crown, understoryLobes,
    { cast: true, lod: LOD_CROWN, tint: { h: 0.27, s: 0.42, l: 0.24 } }));
  meshes.push(...tiled(group, 'trunk', geo.trunk, mat.bark, trunks,
    { cast: true, tint: { h: 0.08, s: 0.12, l: 0.62 } }));
  meshes.push(...tiled(group, 'crown', geo.lobe, mat.crown, lobes,
    { cast: true, lod: LOD_CROWN, tint: { h: 0.27, s: 0.42, l: 0.24 } }));
  meshes.push(...tiled(group, 'backTrunk', geo.trunkFar, mat.bark, backTrunks,
    { tile: 200, tint: { h: 0.08, s: 0.12, l: 0.62 } }));
  meshes.push(...tiled(group, 'backCrown', geo.lobeFar, mat.crown, backLobes,
    { tile: 200, tint: { h: 0.27, s: 0.42, l: 0.24 } }));
  meshes.push(...tiled(group, 'vine', geo.vine, mat.vine, vines, { far: UNDERGROWTH_FAR }));
  meshes.push(...tiled(group, 'fern', geo.fern, mat.fern, ferns,
    { far: UNDERGROWTH_FAR, tint: { h: 0, s: 0, l: 1 } }));
  meshes.push(...tiled(group, 'fernUp', geo.fernUp, mat.fernUp, fernsUp,
    { far: UNDERGROWTH_FAR, tint: { h: 0, s: 0, l: 1 } }));
  meshes.push(...tiled(group, 'broad', geo.broad, mat.broad, broads,
    { far: UNDERGROWTH_FAR, tint: { h: 0, s: 0, l: 1 } }));
  meshes.push(...tiled(group, 'monstera', geo.monstera, mat.monstera, monsteras,
    { far: UNDERGROWTH_FAR, tint: { h: 0, s: 0, l: 1 } }));
  meshes.push(...tiled(group, 'bush', geo.bush, mat.bush, bushes,
    { cast: true, tint: { h: 0.29, s: 0.4, l: 0.2 } }));
  meshes.push(...tiled(group, 'grass', geo.grass, mat.grass, grass,
    { far: UNDERGROWTH_FAR, tint: { h: 0.26, s: 0.45, l: 0.3 } }));
  meshes.push(...tiled(group, 'flower', geo.flower, mat.flower, flowers,
    { far: UNDERGROWTH_FAR, tint: { h: 0.99, s: 0.7, l: 0.62 } }));

  // Distance culling of the undergrowth tiles, by tile centre — and the
  // wind's clock, which is the only per-frame CPU the plants cost.
  const culled = meshes.filter(m => Number.isFinite(m.userData.far) || m.userData.lod);
  let acc = 1;
  function update(camPos, dt) {
    WIND.uWindTime.value += dt;
    acc += dt;
    if (acc < 0.25) return;
    acc = 0;
    for (const m of culled) {
      const c = m.boundingSphere.center;
      const d = Math.hypot(c.x - camPos.x, c.z - camPos.z) - m.boundingSphere.radius;
      m.visible = d < m.userData.far;
      // Crowns trade their fine blob for the coarse one out of close view.
      if (m.userData.lod) m.geometry = d < m.userData.lod.dist ? geo.lobe : geo.lobeFar;
    }
  }

  const counts = {
    palms: palmTrunks.length, saplings: saplings.length, understory: understory.length,
    giants: trunks.length + backTrunks.length,
    lobes: lobes.length + understoryLobes.length + backLobes.length,
    vines: vines.length, ferns: fernsAll.length,
    broads: broadsAll.length, bushes: bushes.length, grass: grass.length,
    flowers: flowers.length, meshes: meshes.length,
  };
  // The scatter's raw positions, for the tests to hold the rules to.
  const spots = {
    palms: palmTrunks, saplings, understory, giants: trunks,
    ferns: fernsAll, broads: broadsAll, bushes, grass,
    flowers: flowerSpots,
  };
  return { group, colliders, update, counts, spots, wind: WIND };
}









// The same island plant geometries and wind materials with configurable garden bounds.
function buildGardenVegetation({scene,rnd,maxAniso,layout:L,rules:R}) {
  const group=new THREE.Group();scene.add(group);const meshes=[],colliders=[],spots={palms:[],bushes:[],broads:[]};
  const region=R.region, palms=[],crowns=[],bushes=[],broads=[],ferns=[];
  const plant=(x,z,h,ry,rx=-.12)=> {
    const y=L.terrainHeight(x,z)-.15,it={x,y,z,sx:1.05,sy:h,sz:1.05,ry,rx};palms.push(it);
    const top=new THREE.Vector3(0,1,-PALM_BEND).applyMatrix4(matrixOf(it));crowns.push({x:top.x,y:top.y-.1,z:top.z,s:1.35,ry:ry+1});
    colliders.push({x0:x-.35,x1:x+.35,z0:z-.35,z1:z+.35,y0:y,y1:y+3,tall:false});spots.palms.push(it);
  };
  for(const it of R.explicitPalms||[])plant(it.x,it.z,it.h,it.ry,it.rx);
  for(let x=region.x0;x<region.x1;x+=9)for(let z=region.z0;z<region.z1;z+=8){
    const px=x+rnd()*6,pz=z+rnd()*5;
    if(!R.keepOffBuilt(px,pz)||L.terrainHeight(px,pz)<.5)continue;
    const border=pz<30||pz>72;
    if(rnd()<(border?.75:.2))plant(px,pz,8+rnd()*5,(rnd()-.5)*1.1,-.08-rnd()*.22);
    else if(rnd()<.45){const it={x:px,y:L.terrainHeight(px,pz),z:pz,s:1.0+rnd(),ry:rnd()*6.28};broads.push(it);spots.broads.push(it);}
    else {const it={x:px,y:L.terrainHeight(px,pz),z:pz,s:1+rnd()*1.1,ry:rnd()*6.28};bushes.push(it);spots.bushes.push(it);}
  }
  for(let x=region.x0;x<region.x1;x+=4)for(let z=30;z<region.z1;z+=5){const px=x+rnd()*2,pz=z+rnd()*2;if(R.keepOffBuilt(px,pz)&&rnd()<.25)ferns.push({x:px,y:L.terrainHeight(px,pz),z:pz,s:.65+rnd()*.5,ry:rnd()*6.28});}
  for(const z of R.beds||[])for(let x=region.x0+8;x<region.x1-8;x+=2.8){
    if(!R.keepOffBuilt(x,z))continue;
    const it={x,y:L.terrainHeight(x,z),z,s:.65+rnd()*.2,ry:rnd()*6.28};bushes.push(it);spots.bushes.push(it);
  }
  const map=frondTexture(maxAniso),fm=makeLeafMaterial(map,.022),depth=leafDepth(map);
  meshes.push(...tiled(group,'garden_palm_trunk',palmTrunkGeo(),new THREE.MeshStandardMaterial({color:0xffffff,roughness:1}),palms,{cast:true,tile:64,tint:{h:.09,s:.22,l:.29}}));
  meshes.push(...tiled(group,'garden_palm_crown',palmCrownGeo(),fm,crowns,{cast:true,depth,tile:64,tint:{h:.24,s:.55,l:.32}}));
  meshes.push(...tiled(group,'garden_bush',R.shrubs?.geometry??bushGeo(),R.shrubs?.material??makeSolidMaterial({},.02),bushes,{cast:false,tile:64,tint:{h:.28,s:.52,l:R.shrubs ? .31 : .24},far:110}));
  if(R.shrubs)meshes.push(...tiled(group,'garden_bush_leaves',R.shrubs.leavesGeometry,R.shrubs.leavesMaterial,bushes,{cast:false,tile:64,tint:{h:.28,s:.52,l:.31},far:110}));
  const bm=broadLeafTexture(maxAniso),bmat=makeLeafMaterial(bm,.03);
  meshes.push(...tiled(group,'garden_broad',broadPlantGeo(),bmat,broads,{depth:leafDepth(bm),tile:64,tint:{h:.27,s:.5,l:.32},far:100}));
  const fernMap=fernTexture(maxAniso);
  meshes.push(...tiled(group,'garden_fern',fernGeo(),makeLeafMaterial(fernMap,.03),ferns,{depth:leafDepth(fernMap),tile:64,tint:{h:.27,s:.5,l:.3},far:85}));
  const cameraGround=new THREE.Vector3();function update(camera,dt=0){WIND.uWindTime.value+=dt;cameraGround.set(camera.x,0,camera.z);for(const im of meshes){const d=im.boundingSphere.center.distanceTo(cameraGround);im.visible=d<im.userData.far+im.boundingSphere.radius;}}
  return {group,colliders,spots,counts:{palms:palms.length,bushes:bushes.length,broads:broads.length,ferns:ferns.length},update};
}
