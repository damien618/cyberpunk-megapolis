// turtle-hermit.js — "Vénérable Ermite Tortue", the sage waiting on the
// celestial plaza. An original character in the martial-arts-hermit tradition:
// the shell, hawaiian shorts, lapels, staff, glasses and beard are all built here from primitives
// and procedural canvas textures, so nothing is lifted from an existing work.
//
// Two things carry the realism, and both are cheap:
//   - the face keeps its own texture. Only the clothing quadrant of the guest
//     atlas is dyed (dressGuestAtlasDark), the way every other guest in the
//     city is dressed. Tinting the whole material is what used to paint his
//     skin traffic-cone orange.
//   - the beard is alpha-cut hair cards, not solid cones. Tapered strips with
//     a strand texture read as hair from any angle; a cone only ever reads as
//     a cone.
import * as THREE from "three";
import { loadGuestRig, cloneSkinned, dressGuestAtlasDark } from "./crowd.js?v=19";

// Aloha coral for the shirt. Kept below full saturation because
// dressGuestAtlasDark multiplies each pixel's own luminance back in, so the
// folds brighten from here rather than clip.
const ROBE_HEX = 0xd94a2b;

// Sampled off the rig's own atlas at the forehead (#d19271) and brow (#d99c7d)
// by raycasting the face and reading the hit's UV. The scalp has to sit at this
// tone or the join at the hairline reads as a swimming cap.
const SKIN_CSS = "#d4966f";

// Going bald takes two edits to the atlas, because the rig wears its hair
// twice: a shell of geometry over the skull, and hair painted onto the skull
// underneath it.
//
// HAIR_UV is the shell's own UV island, measured off the geometry — every
// vertex addressing it sits above y = 1.68 on the skull and no other vertex in
// the mesh touches it. Erasing it (alpha 0, with alphaTest on the body
// material) deletes the shell outright. Merely recolouring it left the shell's
// silhouette in place, which is what read as a skullcap.
//
// SCALP_UV is the skull's own patch on the head texture, painted dark brown.
// Its lowest vertices stop at y = 1.732, above the eyes at y ≈ 1.718, so the
// eyes are not in it. Only genuinely dark pixels there are repainted, so the
// forehead skin the box also covers is left alone.
const HAIR_UV = { u0: 0.756, u1: 0.869, v0: 0.875, v1: 1.0 };
const SCALP_UV = { u0: 0.050, u1: 0.460, v0: 0.0, v1: 0.140 };

// Dialogue lines (French, flavorful & humorous martial arts sage wisdom)
const HERMIT_DIALOGUES = [
  {
    text: "Ho ho ho ! Bienvenue au Palais Céleste, jeune disciple ! L'air est si pur ici-haut... Idéal pour méditer, parfaire ses arts martiaux, ou piquer une sieste royale au soleil !"
  },
  {
    text: "Tu as vu cette lourde carapace sur mon dos ? Plus de 40 kilos de fonte céleste ! C'est le secret de ma forme olympique... Portée jour et nuit depuis trois siècles !"
  },
  {
    text: "Le précepte fondamental de l'école de la Tortue : Mange bien, dors bien, apprends avec rigueur et amuse-toi de tout ton cœur ! La vie est une grande aventure."
  },
  {
    text: "Dis-moi, tu n'aurais pas croisé un nuage jaune volant par hasard ? J'ai égaré le mien quelque part au-dessus de la mer de nuages... ho ho !"
  },
  {
    text: "Autrefois, j'ai passé cinquante ans à concentrer toute mon énergie spirituelle pour créer une onde déferlante légendaire ! Mais aujourd'hui, j'admire juste la Terre qui tourne depuis ce dôme doré."
  },
  {
    text: "Tu as du mérite d'avoir grimpé jusqu'ici. Si tu cherches la sérénité céleste, va contempler la Terre qui tourne dans l'aile Ouest du palais blanc !"
  }
];

let hermitGroup = null;
let hermitMixer = null;
let hermitHeadBone = null;
let headTurn = 0;
let gripBones = [];
// Fingers run down their own local +Y, so a curl is a rotation about local X.
const GRIP_AXIS = new THREE.Vector3(1, 0, 0);
let dialogueIndex = 0;
let dialogueActive = false;
let dialogueDom = null;

// ---------------------------------------------------------------------------
// Procedural texture helpers
// ---------------------------------------------------------------------------

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function blankCanvas(w, h = w) {
  return Object.assign(document.createElement("canvas"), { width: w, height: h });
}

function canvasTexture(canvas, { srgb = true, repeat = null } = {}) {
  const t = new THREE.CanvasTexture(canvas);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat[0], repeat[1]);
  }
  t.needsUpdate = true;
  return t;
}

/**
 * One hair card's worth of strands: fine tapering filaments drawn from the top
 * edge downwards, so the card's silhouette is the hair's silhouette. Ragged
 * strand ends give the tip its broken edge for free — that frayed outline is
 * most of what makes a beard read as hair.
 *
 * Colour and coverage are drawn onto two *opaque* canvases rather than one
 * RGBA one. A canvas with real transparency uploads premultiplied, so every
 * antialiased strand edge arrives with its colour already multiplied down and
 * the whole beard renders black.
 */
function makeHairMaps({ size = 256, strands = 42, seed = 5 } = {}) {
  const rgb = blankCanvas(size);
  const alpha = blankCanvas(size);
  const rctx = rgb.getContext("2d");
  const actx = alpha.getContext("2d");
  const rand = rng(seed);

  rctx.fillStyle = "#dedbd4";
  rctx.fillRect(0, 0, size, size);
  actx.fillStyle = "#000000";
  actx.fillRect(0, 0, size, size);
  rctx.lineCap = actx.lineCap = "round";

  for (let i = 0; i < strands; i++) {
    const x0 = rand() * size;
    const drift = (rand() - 0.5) * size * 0.30;
    const len = size * (0.55 + rand() * 0.45);
    // Chunky locks rather than single filaments: a hair one screen-pixel wide
    // is mostly eaten by the alpha cut and reads as a sparse wire brush.
    const width = 4.0 + rand() * 7.0;
    // Silver-white with a little warm grey scatter, so the mass has depth
    // instead of reading as one flat sheet of paint.
    const v = 214 + Math.floor(rand() * 41);
    const strokes = [
      [rctx, `rgb(${v},${v},${Math.min(255, v + 3)})`],
      [actx, `rgb(255,255,255)`],
    ];
    for (const [ctx, style] of strokes) {
      ctx.strokeStyle = style;
      ctx.lineWidth = width;
      ctx.beginPath();
      ctx.moveTo(x0, 0);
      ctx.bezierCurveTo(
        x0 + drift * 0.25, len * 0.35,
        x0 + drift * 0.75, len * 0.72,
        x0 + drift, len);
      ctx.stroke();
    }
  }
  return { rgb, alpha };
}

/**
 * Aloha print: a bright ground, monstera leaves and hibiscus blossoms. Every
 * motif is stamped nine times on a 3×3 offset lattice and clipped to the
 * canvas, so the pattern wraps cleanly and the repeat has no visible seam
 * running down the robe.
 */
function makeAlohaCanvas({
  size = 256, seed = 17,
  base = "#0f9fb2",
  leaf = "#0c7a58",
  petals = ["#fff6e2", "#ffd166"],
  heart = "#ef4f3a",
  flowers = 9, leaves = 11,
} = {}) {
  const c = blankCanvas(size);
  const ctx = c.getContext("2d");
  const rand = rng(seed);

  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);

  // Fine weave, so the cloth is not a flat plastic sheet.
  ctx.globalAlpha = 0.07;
  for (let i = 0; i < size; i += 2) {
    ctx.fillStyle = i % 4 === 0 ? "#000000" : "#ffffff";
    ctx.fillRect(i, 0, 1, size);
    ctx.fillRect(0, i, size, 1);
  }
  ctx.globalAlpha = 1;

  const tiled = (draw) => {
    for (const dx of [-size, 0, size]) {
      for (const dy of [-size, 0, size]) {
        ctx.save();
        ctx.translate(dx, dy);
        draw();
        ctx.restore();
      }
    }
  };

  // Monstera fronds, laid down first so the blossoms sit over them.
  for (let i = 0; i < leaves; i++) {
    const x = rand() * size, y = rand() * size;
    const r = size * (0.09 + rand() * 0.07);
    const rot = rand() * Math.PI * 2;
    const blades = 7;
    tiled(() => {
      ctx.translate(x, y);
      ctx.rotate(rot);
      ctx.fillStyle = leaf;
      ctx.globalAlpha = 0.62;
      for (let b = 0; b < blades; b++) {
        const a = (b / (blades - 1) - 0.5) * 2.1;
        ctx.save();
        ctx.rotate(a);
        ctx.beginPath();
        ctx.ellipse(0, -r * 0.55, r * 0.13, r * 0.55, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      ctx.globalAlpha = 1;
    });
  }

  // Hibiscus: five petals, a bright heart and a stamen.
  for (let i = 0; i < flowers; i++) {
    const x = rand() * size, y = rand() * size;
    const r = size * (0.055 + rand() * 0.045);
    const rot = rand() * Math.PI * 2;
    const petal = petals[Math.floor(rand() * petals.length)];
    tiled(() => {
      ctx.translate(x, y);
      ctx.rotate(rot);
      ctx.fillStyle = petal;
      for (let p = 0; p < 5; p++) {
        ctx.save();
        ctx.rotate((p / 5) * Math.PI * 2);
        ctx.beginPath();
        ctx.ellipse(0, -r * 0.62, r * 0.44, r * 0.62, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      ctx.fillStyle = heart;
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.26, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = heart;
      ctx.lineWidth = Math.max(1, r * 0.09);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(r * 0.34, -r * 0.46);
      ctx.stroke();
    });
  }

  return c;
}

/**
 * The carapace's own colouring: mottled olive over amber, with faint concentric
 * growth striations. Turtle shell is never one flat green — it is a stained,
 * translucent horn that darkens toward each scute's rim.
 */
function makeShellCanvas({ size = 512, seed = 31 } = {}) {
  const c = blankCanvas(size);
  const ctx = c.getContext("2d");
  const rand = rng(seed);

  // Mid olive-amber. Kept bright on purpose: this map is multiplied by the
  // material colour and then by the lighting, and a dark base leaves the whole
  // carapace reading as a black egg on his back.
  ctx.fillStyle = "#8e8a47";
  ctx.fillRect(0, 0, size, size);

  // Broad amber blotches — the warm, sun-bleached patches of the plates.
  for (let i = 0; i < 90; i++) {
    const x = rand() * size, y = rand() * size;
    const r = size * (0.03 + rand() * 0.10);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    const warm = 186 + Math.floor(rand() * 50);
    g.addColorStop(0, `rgba(${warm},${warm - 34},${74},${0.28 + rand() * 0.32})`);
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // Dark olive stain, pooling the way keratin does at the plate seams.
  for (let i = 0; i < 70; i++) {
    const x = rand() * size, y = rand() * size;
    const r = size * (0.02 + rand() * 0.07);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(58,64,26,${0.22 + rand() * 0.28})`);
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // Growth rings: concentric arcs around scattered centres.
  ctx.lineWidth = 1.4;
  for (let n = 0; n < 16; n++) {
    const cx = rand() * size, cy = rand() * size;
    for (let r = size * 0.012; r < size * 0.11; r += size * 0.011) {
      ctx.strokeStyle = `rgba(60,58,22,${0.10 + rand() * 0.13})`;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  return c;
}

/** Height-to-normal, so the shell's mottling also catches the light. */
function normalFromCanvas(src, strength = 1.6) {
  const size = src.width;
  const out = blankCanvas(size);
  const sctx = src.getContext("2d", { willReadFrequently: true });
  const octx = out.getContext("2d");
  const s = sctx.getImageData(0, 0, size, size).data;
  const d = octx.createImageData(size, size);
  const lum = i => (s[i] * 0.3 + s[i + 1] * 0.59 + s[i + 2] * 0.11) / 255;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const l = ((x + 1) % size) + y * size;
      const u = x + ((y + size - 1) % size) * size;
      const dx = (lum(l * 4) - lum(i)) * strength;
      const dy = (lum(u * 4) - lum(i)) * strength;
      const nz = 1 / Math.sqrt(dx * dx + dy * dy + 1);
      d.data[i] = (-dx * nz * 0.5 + 0.5) * 255;
      d.data[i + 1] = (-dy * nz * 0.5 + 0.5) * 255;
      d.data[i + 2] = (nz * 0.5 + 0.5) * 255;
      d.data[i + 3] = 255;
    }
  }
  octx.putImageData(d, 0, 0);
  return out;
}

// Built once, shared by every piece of hair on him.
let hairMat = null;
function getHairMaterial() {
  if (hairMat) return hairMat;
  const maps = makeHairMaps({ seed: 5 });
  hairMat = new THREE.MeshStandardMaterial({
    map: canvasTexture(maps.rgb),
    alphaMap: canvasTexture(maps.alpha, { srgb: false }),
    color: 0xffffff,
    roughness: 0.90,
    metalness: 0.0,
    // alphaTest rather than blending: hair cards overlap constantly, and a
    // transparent material would need a sort order that does not exist for
    // a mass of interpenetrating strips.
    alphaTest: 0.35,
    transparent: false,
    side: THREE.DoubleSide,
  });
  return hairMat;
}

/**
 * One tapered, curved strip of hair hanging from its top edge — pivot at the
 * root, tip swinging forward by `curve`.
 */
function hairCard(w, h, { curve = 0.02, taper = 0.55, segs = 7 } = {}) {
  const g = new THREE.PlaneGeometry(w, h, 2, segs);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const k = 1 - (p.getY(i) + h / 2) / h; // 0 at the root, 1 at the tip
    p.setZ(i, p.getZ(i) + curve * k * k);
    p.setX(i, p.getX(i) * (1 - taper * k));
  }
  p.needsUpdate = true;
  g.computeVertexNormals();
  g.translate(0, -h / 2, 0);
  const mesh = new THREE.Mesh(g, getHairMaterial());
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  return mesh;
}

// ---------------------------------------------------------------------------
// Accessories
// ---------------------------------------------------------------------------

/**
 * Small round smoked glasses on a thin tortoiseshell frame — the kind a
 * mountain ascetic would actually own, rather than sports wrap-arounds.
 */
function buildSunglasses() {
  const group = new THREE.Group();
  group.name = "HermitSunglasses";

  const frameMat = new THREE.MeshPhysicalMaterial({
    color: 0x2a1c12,
    roughness: 0.30,
    metalness: 0.20,
    clearcoat: 0.7,
    clearcoatRoughness: 0.18,
  });
  // Smoked amber rather than solid black: a flat black disc reads as a hole in
  // his face, whereas tinted glass keeps the eye sockets legible behind it.
  const lensMat = new THREE.MeshPhysicalMaterial({
    color: 0x3a2415,
    roughness: 0.05,
    metalness: 0.25,
    clearcoat: 1.0,
    clearcoatRoughness: 0.04,
    transparent: true,
    opacity: 0.72,
  });

  // Straight off the rig's own LeftEye/RightEye bones (±0.030, 0.088, 0.082),
  // pushed out to the face surface, which sits at z ≈ 0.117 at eye height.
  const EYE_Y = 0.088, EYE_Z = 0.118, EYE_X = 0.030, R = 0.024;

  for (const side of [-1, 1]) {
    const rim = new THREE.Mesh(new THREE.TorusGeometry(R, 0.0050, 8, 22), frameMat);
    rim.position.set(side * EYE_X, EYE_Y, EYE_Z + 0.004);

    const lens = new THREE.Mesh(new THREE.CircleGeometry(R - 0.001, 22), lensMat);
    lens.position.set(side * EYE_X, EYE_Y, EYE_Z + 0.004);

    // Temple arm sweeping back over the ear.
    const temple = new THREE.Mesh(new THREE.CylinderGeometry(0.0028, 0.0028, 0.115, 6), frameMat);
    temple.rotation.set(Math.PI / 2, 0, 0);
    temple.rotation.z = side * 0.10;
    temple.position.set(side * 0.058, EYE_Y, 0.055);

    group.add(rim, lens, temple);
  }

  // Bridge over the nose.
  const bridge = new THREE.Mesh(new THREE.CylinderGeometry(0.0028, 0.0028, 0.016, 6), frameMat);
  bridge.rotation.z = Math.PI / 2;
  bridge.position.set(0, EYE_Y, EYE_Z);
  group.add(bridge);

  return group;
}

/**
 * Erases the hair shell and repaints the scalp underneath — see HAIR_UV and
 * SCALP_UV for why both rectangles are safe to touch. Leaves a thinning grey
 * stubble rather than a bare pate, which is far more forgiving: painted hair
 * has no silhouette to give away, so it cannot read as a cap.
 *
 * The caller must set alphaTest on the material, or the erased shell stays.
 */
function shaveHead(texture) {
  const img = texture?.image;
  if (!img) return texture;
  const w = img.width, h = img.height;
  if (!w || !h) return texture;

  const c = blankCanvas(w, h);
  const ctx = c.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(img, 0, 0);

  // flipY is false on this atlas, so v maps straight onto the pixel row.
  const box = (uv) => ({
    x: Math.floor(uv.u0 * w), y: Math.floor(uv.v0 * h),
    w: Math.ceil((uv.u1 - uv.u0) * w), h: Math.ceil((uv.v1 - uv.v0) * h),
  });

  // 1. Delete the hair shell.
  const hair = box(HAIR_UV);
  ctx.clearRect(hair.x, hair.y, hair.w, hair.h);

  // 2. Repaint the dark hair painted on the skull, pixel by pixel so the
  //    forehead skin inside the same box survives untouched.
  const scalp = box(SCALP_UV);
  const data = ctx.getImageData(scalp.x, scalp.y, scalp.w, scalp.h);
  const p = data.data;
  const skin = [0xd4, 0x96, 0x6f];
  for (let i = 0; i < p.length; i += 4) {
    if (p[i + 3] < 16) continue;
    const lum = 0.3 * p[i] + 0.59 * p[i + 1] + 0.11 * p[i + 2];
    if (lum >= 95) continue;                       // already skin — leave it
    // Keep each pixel's own shading so the skull's modelling survives.
    const k = 0.72 + (lum / 95) * 0.34;
    p[i] = Math.min(255, skin[0] * k);
    p[i + 1] = Math.min(255, skin[1] * k);
    p[i + 2] = Math.min(255, skin[2] * k);
  }
  ctx.putImageData(data, scalp.x, scalp.y);

  // 3. Stipple sparse short grey hairs back over the crown only (v < 0.075 is
  //    the top of the skull; the forehead runs on down to v ≈ 0.13).
  const rand = rng(73);
  const crownH = Math.ceil(0.075 * h) - scalp.y;
  ctx.save();
  ctx.beginPath();
  ctx.rect(scalp.x, scalp.y, scalp.w, crownH);
  ctx.clip();
  ctx.lineCap = "round";
  for (let i = 0; i < 900; i++) {
    const x = scalp.x + rand() * scalp.w;
    const y = scalp.y + rand() * crownH;
    // Thinner toward the front, the way a receding scalp goes.
    if (rand() < (y - scalp.y) / crownH * 0.75) continue;
    const len = 3 + rand() * 7;
    const a = rand() * Math.PI * 2;
    const v = 150 + Math.floor(rand() * 70);
    ctx.strokeStyle = `rgba(${v},${v},${v - 4},${0.30 + rand() * 0.45})`;
    ctx.lineWidth = 0.8 + rand() * 1.4;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
    ctx.stroke();
  }
  ctx.restore();

  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.flipY = texture.flipY;
  t.wrapS = texture.wrapS;
  t.wrapT = texture.wrapT;
  t.anisotropy = texture.anisotropy || 8;
  t.needsUpdate = true;
  return t;
}

/**
 * The grey curls that puff out over each ear — the only hair he has left. They
 * also cover the sideburns painted onto the face texture, which sit outside the
 * hair shell's UV island and so survive the shave.
 */
function buildSideCurls() {
  const group = new THREE.Group();
  group.name = "HermitSideCurls";

  const curlMat = new THREE.MeshStandardMaterial({
    color: 0xd2cfc8,
    roughness: 0.93,
    metalness: 0.0,
  });

  // Ears measured at x ≈ ±0.086, y ≈ 0.06–0.09; the painted sideburns run from
  // there up to y ≈ 0.14, which is the band these have to blanket.
  const rand = rng(29);
  for (const side of [-1, 1]) {
    for (let i = 0; i < 30; i++) {
      const arc = -1.0 + (i / 29) * 2.0;          // back to front, in radians
      const tier = i % 4;
      const r = 0.018 + rand() * 0.014;
      const lobe = new THREE.Mesh(new THREE.SphereGeometry(r, 9, 8), curlMat);
      lobe.position.set(
        side * (0.082 + rand() * 0.020),
        0.092 + tier * 0.017 + rand() * 0.012,
        0.012 + Math.sin(arc) * 0.068 + (rand() - 0.5) * 0.016);
      lobe.scale.set(1.0, 0.86, 1.0);
      lobe.castShadow = true;
      group.add(lobe);
    }
    // Ringlets sitting proud of the puff, so a curl reads as a curl.
    for (let i = 0; i < 6; i++) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.022, 0.009, 6, 12), curlMat);
      ring.position.set(
        side * (0.098 + rand() * 0.010),
        0.100 + i * 0.013,
        0.040 - i * 0.019 + (rand() - 0.5) * 0.012);
      ring.rotation.set(rand() * 0.9, side * Math.PI / 2, rand() * 0.9);
      group.add(ring);
    }
  }

  return group;
}

/**
 * Brows, moustache and the long hermit beard, all as alpha-cut hair cards
 * arranged around the jaw. Three overlapping layers give the mass its depth:
 * a short dense inner ring that hides the skin, a mid layer, and a long outer
 * layer that is longest at the chin and shortens toward the ears.
 */
function buildBeardAndBrows() {
  const group = new THREE.Group();
  group.name = "HermitBeardAndBrows";

  // Jaw arc the cards are rooted on. Every number here is measured off the rig
  // rather than guessed: the eye bones sit at (±0.030, 0.088, 0.082) and the
  // face surface runs z ≈ 0.115 at the mouth, 0.132 at the nose tip, with the
  // chin at y ≈ -0.030. An arc centred at z = 0.030 with radius 0.085 lands on
  // that surface at the chin and on the cheeks at the ears.
  const JAW_CZ = 0.030, JAW_R = 0.085;
  const CHIN_Y = -0.030;
  const ARC = 1.60; // ±92°, ear to ear

  const layers = [
    { r: JAW_R - 0.012, n: 19, len: 0.075, spread: 0.50, curve: 0.008, w: 0.048 },
    { r: JAW_R,         n: 21, len: 0.140, spread: 0.58, curve: 0.016, w: 0.055 },
    { r: JAW_R + 0.011, n: 17, len: 0.200, spread: 0.66, curve: 0.026, w: 0.062 },
  ];

  for (const L of layers) {
    for (let i = 0; i < L.n; i++) {
      const t = L.n === 1 ? 0.5 : i / (L.n - 1);
      const a = -ARC + t * ARC * 2;
      const front = Math.cos(a); // 1 at the chin, 0 at the ears

      const x = Math.sin(a) * L.r;
      const z = JAW_CZ + front * L.r;
      // The jawline rises toward the ears; the chin is the low point.
      const y = CHIN_Y + (1 - front) * 0.062;

      // Longest at the chin, shortening around to the sideburns.
      const h = L.len * (1 - L.spread + L.spread * Math.max(0, front));
      if (h < 0.020) continue;

      const card = hairCard(L.w, h, { curve: L.curve * front, taper: 0.35 });
      card.position.set(x, y, z);
      card.rotation.y = a;
      card.rotation.x = -0.14 * front; // hangs slightly forward off the chin
      group.add(card);
    }
  }

  // The chin fall: the central hank, down to about mid-chest.
  for (let i = 0; i < 7; i++) {
    const off = (i - 3) / 3;
    const card = hairCard(0.058 - Math.abs(off) * 0.012, 0.205 - Math.abs(off) * 0.045,
      { curve: 0.026, taper: 0.40 });
    card.position.set(off * 0.024, CHIN_Y - 0.004, JAW_R + JAW_CZ - Math.abs(off) * 0.014);
    card.rotation.set(-0.20, off * 0.14, off * 0.09);
    group.add(card);
  }

  // Moustache: rooted under the nose (y ≈ 0.060, z ≈ 0.130) and falling over
  // the mouth, full enough to hide the dark stubble painted into the base
  // avatar's own texture, which no material tint can reach.
  for (const side of [-1, 1]) {
    for (let i = 0; i < 4; i++) {
      const card = hairCard(0.036, 0.062 + i * 0.010, { curve: 0.012, taper: 0.45 });
      card.position.set(side * (0.009 + i * 0.012), 0.056, 0.128 - i * 0.007);
      card.rotation.set(-0.28, side * (0.18 + i * 0.15), side * (0.18 + i * 0.13));
      group.add(card);
    }
  }

  // Brows: wide, short and arched, riding just above the eye line.
  for (const side of [-1, 1]) {
    for (let i = 0; i < 2; i++) {
      const card = hairCard(0.038, 0.026 + i * 0.007, { curve: 0.005, taper: 0.4 });
      // z clears the brow ridge (surface ≈ 0.113 here): at 0.112 they sank
      // under the skin and left the rig's own dark brows showing.
      card.position.set(side * (0.022 + i * 0.020), 0.116 - i * 0.004, 0.127 - i * 0.008);
      card.rotation.set(-1.10, side * (0.20 + i * 0.18), side * (0.26 + i * 0.14));
      group.add(card);
    }
  }

  return group;
}

/**
 * The legendary carapace. Sized to actually cover his back — the point of the
 * thing is that it is absurdly heavy — with real 3D scutes rather than a
 * painted pattern, because at conversation range a flat texture gives itself
 * away instantly.
 */
function buildTurtleShell() {
  const group = new THREE.Group();
  group.name = "HermitTurtleShell";

  const shellC = makeShellCanvas();
  const shellMap = canvasTexture(shellC);
  const shellNormal = canvasTexture(normalFromCanvas(shellC, 1.8), { srgb: false });

  // Wet-horn keratin: a mottled body under a thin clearcoat, so the dome picks
  // up a moving highlight instead of sitting matte.
  const shellMat = new THREE.MeshPhysicalMaterial({
    map: shellMap,
    normalMap: shellNormal,
    normalScale: new THREE.Vector2(0.7, 0.7),
    color: 0xffffff,
    roughness: 0.44,
    metalness: 0.05,
    clearcoat: 0.55,
    clearcoatRoughness: 0.30,
  });

  // Marginal scutes: the pale bone-and-tan band running round the edge.
  const rimMat = new THREE.MeshPhysicalMaterial({
    color: 0xd8bb8a,
    roughness: 0.42,
    metalness: 0.06,
    clearcoat: 0.45,
    clearcoatRoughness: 0.28,
  });

  // Seams: dark olive, so the plates read as separate horn without going black.
  const grooveMat = new THREE.MeshStandardMaterial({
    color: 0x3c431f,
    roughness: 0.66,
    metalness: 0.04,
  });

  const plateMat = new THREE.MeshPhysicalMaterial({
    map: shellMap,
    color: 0xcfc79a,
    roughness: 0.40,
    metalness: 0.06,
    clearcoat: 0.6,
    clearcoatRoughness: 0.26,
  });

  const strapMat = new THREE.MeshStandardMaterial({
    color: 0x4a2f22,
    roughness: 0.80,
    metalness: 0.04,
  });

  const buckleMat = new THREE.MeshStandardMaterial({
    color: 0xc8a642,
    roughness: 0.28,
    metalness: 0.85,
  });

  // Local convention: z = 0 is the rim plane, which the caller lays against his
  // back; the dome bulges away from him toward -z. Half-extents are in bone
  // space, which the rig scales by ~0.86 — so the shell ends up about 72 cm
  // across and 89 cm tall on a 1.58 m man. It overhangs his shoulders and
  // hangs to the hips, which is the joke.
  const HW = 0.42;
  const HH = 0.52;
  const DEPTH = 0.38;

  // Main dome. rotateX(-90°) sends the pole to -z, so the shell bulges off his
  // back and the open side faces into it; +90° pointed it out through his chest.
  const domeGeo = new THREE.SphereGeometry(1.0, 32, 20, 0, Math.PI * 2, 0, Math.PI * 0.5);
  domeGeo.rotateX(-Math.PI / 2);
  const dome = new THREE.Mesh(domeGeo, shellMat);
  dome.scale.set(HW, HH, DEPTH);
  dome.castShadow = true;
  group.add(dome);

  // Plastron lip closing the opening, so nothing shows through from the side.
  const lip = new THREE.Mesh(new THREE.CircleGeometry(1.0, 32), grooveMat);
  lip.scale.set(HW * 0.99, HH * 0.99, 1);
  group.add(lip);

  // Marginal rim wrapping the perimeter.
  const rimGeo = new THREE.TorusGeometry(HW, 0.050, 14, 40);
  rimGeo.scale(1.0, HH / HW, 0.85);
  const rim = new THREE.Mesh(rimGeo, rimMat);
  rim.position.z = -0.012;
  rim.castShadow = true;
  group.add(rim);

  // Scutes sit *on* the dome rather than at hand-guessed depths: solve the
  // ellipsoid for z at each plate's (u, v), then stand the plate proud along
  // the surface normal. Guessed depths buried half of them inside the dome.
  const PROUD = 0.016;
  const UP_Z = new THREE.Vector3(0, 0, 1);
  const addScute = (geo, radius, u, v, sx, sy) => {
    const inside = Math.max(0.04, 1 - u * u - v * v);
    const x = u * HW, y = v * HH, z = -DEPTH * Math.sqrt(inside);
    const n = new THREE.Vector3(x / (HW * HW), y / (HH * HH), z / (DEPTH * DEPTH)).normalize();

    const plate = new THREE.Mesh(geo, plateMat);
    plate.position.set(x, y, z).addScaledVector(n, PROUD);
    // The hex geometry's axis is +Z, so aiming +Z down the normal lays it flat
    // on the shell.
    plate.quaternion.setFromUnitVectors(UP_Z, n);
    plate.scale.set(sx, sy, 1);
    plate.castShadow = true;
    group.add(plate);

    // Seam ring in the plate's own frame, a hair wider than the plate.
    const seam = new THREE.Mesh(
      new THREE.TorusGeometry(radius * 1.04, radius * 0.09, 6, 6), grooveMat);
    seam.position.copy(plate.position).addScaledVector(n, -0.005);
    seam.quaternion.copy(plate.quaternion);
    seam.scale.set(sx, sy, 1);
    group.add(seam);
  };

  // Vertebral scutes: five plates down the spine, largest in the middle.
  const VR = 0.110;
  const hexGeo = new THREE.CylinderGeometry(VR * 0.86, VR, 0.024, 6);
  hexGeo.rotateX(Math.PI / 2);
  for (let i = 0; i < 5; i++) {
    const t = (i - 2) / 2;                      // -1 … 1
    const bulge = Math.cos(t * Math.PI / 2);    // fattest at the centre
    addScute(hexGeo, VR, 0, t * 0.62, 0.82 + bulge * 0.32, 0.76 + bulge * 0.28);
  }

  // Costal scutes: four plates a side, following the dome's fall-off.
  const CR = 0.086;
  const sideGeo = new THREE.CylinderGeometry(CR * 0.85, CR, 0.022, 6);
  sideGeo.rotateX(Math.PI / 2);
  for (const side of [-1, 1]) {
    for (let i = 0; i < 4; i++) {
      const t = (i - 1.5) / 1.5;                  // -1 … 1
      const bulge = Math.cos(t * Math.PI / 2.3);
      addScute(sideGeo, CR, side * (0.54 + 0.10 * bulge), t * 0.52,
        0.90 + bulge * 0.22, 0.84 + bulge * 0.26);
    }
  }

  // Harness: shoulder and waist straps running forward round his body.
  for (const side of [-1, 1]) {
    const strap = new THREE.Mesh(new THREE.BoxGeometry(0.048, 0.014, 0.32), strapMat);
    strap.position.set(side * 0.130, 0.180, 0.150);
    strap.rotation.set(-0.16, side * 0.12, side * 0.13);
    group.add(strap);

    const waist = new THREE.Mesh(new THREE.BoxGeometry(0.042, 0.013, 0.28), strapMat);
    waist.position.set(side * 0.150, -0.210, 0.140);
    waist.rotation.set(0.12, side * -0.10, side * -0.10);
    group.add(waist);
  }

  const buckle = new THREE.Mesh(new THREE.TorusGeometry(0.030, 0.007, 8, 18), buckleMat);
  buckle.position.set(0, 0.040, 0.290);
  group.add(buckle);

  return group;
}

/**
 * Hawaiian Bermuda boardshorts: a vibrant tropical aloha-print pair of shorts
 * covering the pelvis and thighs down to just above the knees, complete with
 * a tailored waistband, front drawstring with metal eyelets and knotted ties,
 * separate left and right flared leg barrels, hem cuffs and side pocket details.
 */
function buildHawaiianShorts() {
  const group = new THREE.Group();
  group.name = "HermitHawaiianShorts";

  // Vibrant turquoise tropical print with white-and-gold hibiscus and monstera leaves.
  const clothMat = new THREE.MeshStandardMaterial({
    map: canvasTexture(makeAlohaCanvas({
      size: 512,
      seed: 53,
      base: "#0f9fb2",
      leaf: "#0c7a58",
      petals: ["#ffffff", "#fff3b0", "#ffd166"],
      heart: "#ef4f3a",
      flowers: 12,
      leaves: 14,
    }), { repeat: [2.5, 2.5] }),
    color: 0xffffff,
    roughness: 0.82,
    metalness: 0.0,
    side: THREE.DoubleSide,
  });

  // Coral-red waistband with subtle aloha patterning.
  const waistMat = new THREE.MeshStandardMaterial({
    map: canvasTexture(makeAlohaCanvas({
      size: 256,
      base: "#ef4f3a",
      leaf: "#c8341f",
      petals: ["#ffe9c4"],
      heart: "#ffd166",
      seed: 41,
      flowers: 4,
      leaves: 3,
    }), { repeat: [4, 1] }),
    roughness: 0.78,
    metalness: 0.0,
    side: THREE.DoubleSide,
  });

  // Trim and hem band in sunny gold aloha print.
  const trimMat = new THREE.MeshStandardMaterial({
    map: canvasTexture(makeAlohaCanvas({
      size: 256,
      base: "#f7b32b",
      leaf: "#0c7a58",
      petals: ["#ffffff", "#ff8a5c"],
      heart: "#ef4f3a",
      seed: 23,
      flowers: 5,
      leaves: 4,
    }), { repeat: [3, 1] }),
    roughness: 0.84,
    metalness: 0.0,
    side: THREE.DoubleSide,
  });

  const cordMat = new THREE.MeshStandardMaterial({
    color: 0xfffaed,
    roughness: 0.65,
    metalness: 0.0,
  });

  const agletMat = new THREE.MeshStandardMaterial({
    color: 0xd4af37,
    roughness: 0.35,
    metalness: 0.85,
  });

  // 1. Pelvis / Trunk section: covers the hips from waist down to crotch.
  // Squashed slightly in Z to follow the pelvis's elliptical shape.
  const trunkGeo = new THREE.CylinderGeometry(0.200, 0.208, 0.185, 28, 2, true);
  const trunk = new THREE.Mesh(trunkGeo, clothMat);
  trunk.scale.set(1.02, 1.0, 0.88);
  trunk.position.set(0, -0.092, 0.008);
  trunk.castShadow = true;
  group.add(trunk);

  // 2. Elastic waistband: wraps around the top edge.
  const waistGeo = new THREE.CylinderGeometry(0.205, 0.200, 0.046, 28);
  const waistband = new THREE.Mesh(waistGeo, waistMat);
  waistband.scale.set(1.02, 1.0, 0.88);
  waistband.position.set(0, -0.005, 0.008);
  waistband.castShadow = true;
  group.add(waistband);

  // Rolled top rim on the waistband for a finished cloth edge.
  const waistRimGeo = new THREE.TorusGeometry(0.203, 0.010, 8, 30);
  waistRimGeo.rotateX(Math.PI / 2);
  const waistRim = new THREE.Mesh(waistRimGeo, waistMat);
  waistRim.scale.set(1.02, 1.0, 0.88);
  waistRim.position.set(0, 0.018, 0.008);
  group.add(waistRim);

  // 3. Boardshort front drawstrings & tie knot with gold aglets.
  const eyeletGeo = new THREE.TorusGeometry(0.0065, 0.0022, 6, 14);
  for (const side of [-1, 1]) {
    const eyelet = new THREE.Mesh(eyeletGeo, agletMat);
    eyelet.position.set(side * 0.022, -0.006, 0.185);
    eyelet.rotation.y = side * 0.08;
    group.add(eyelet);
  }

  // Drawstring knot (small tied bow).
  const knotCenter = new THREE.Mesh(new THREE.SphereGeometry(0.009, 8, 8), cordMat);
  knotCenter.position.set(0, -0.006, 0.190);
  knotCenter.scale.set(1.2, 0.9, 0.9);
  group.add(knotCenter);

  for (const side of [-1, 1]) {
    const loop = new THREE.Mesh(new THREE.TorusGeometry(0.014, 0.0035, 6, 14), cordMat);
    loop.position.set(side * 0.016, -0.004, 0.192);
    loop.rotation.set(0.25, side * 0.35, side * 0.55);
    group.add(loop);
  }

  // Dangling cord ends with golden aglet tips.
  const cordL = new THREE.Mesh(new THREE.CylinderGeometry(0.0035, 0.0035, 0.075, 8), cordMat);
  cordL.position.set(0.014, -0.046, 0.188);
  cordL.rotation.set(-0.10, 0, -0.16);
  const agletL = new THREE.Mesh(new THREE.CylinderGeometry(0.0045, 0.0040, 0.014, 8), agletMat);
  agletL.position.set(0, -0.038, 0);
  cordL.add(agletL);
  group.add(cordL);

  const cordR = new THREE.Mesh(new THREE.CylinderGeometry(0.0035, 0.0035, 0.082, 8), cordMat);
  cordR.position.set(-0.012, -0.050, 0.188);
  cordR.rotation.set(-0.08, 0, 0.14);
  const agletR = new THREE.Mesh(new THREE.CylinderGeometry(0.0045, 0.0040, 0.014, 8), agletMat);
  agletR.position.set(0, -0.042, 0);
  cordR.add(agletR);
  group.add(cordR);

  // 4. Crotch bridge / inseam gusset to seal the underside between the legs.
  const crotchGeo = new THREE.BoxGeometry(0.052, 0.042, 0.140);
  const crotch = new THREE.Mesh(crotchGeo, clothMat);
  crotch.position.set(0, -0.178, 0.008);
  group.add(crotch);

  // 5. Left and Right Bermuda Shorts Legs.
  // Each leg is a flared open cylinder running down to just above the knee.
  const LEG_H = 0.235;
  const LEG_R_TOP = 0.110;
  const LEG_R_BOT = 0.124;
  const LEG_X = 0.098;
  const LEG_Y = -0.280;
  const LEG_Z = 0.006;

  for (const side of [-1, 1]) {
    const legGroup = new THREE.Group();
    legGroup.position.set(side * LEG_X, LEG_Y, LEG_Z);
    // Slight outward flare following the natural thigh posture.
    legGroup.rotation.set(-0.02, 0, side * -0.05);

    // Main leg barrel.
    const legMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(LEG_R_TOP, LEG_R_BOT, LEG_H, 24, 2, true),
      clothMat);
    legMesh.castShadow = true;
    legGroup.add(legMesh);

    // Bottom hem cuff in sunny golden aloha trim.
    const hemMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(LEG_R_BOT + 0.002, LEG_R_BOT + 0.003, 0.022, 24, 1, true),
      trimMat);
    hemMesh.position.set(0, -LEG_H / 2 + 0.011, 0);
    hemMesh.castShadow = true;
    legGroup.add(hemMesh);

    // Outer side seam piping.
    const piping = new THREE.Mesh(
      new THREE.BoxGeometry(0.008, LEG_H, 0.014),
      waistMat);
    piping.position.set(side * (LEG_R_TOP + 0.004), 0, 0);
    legGroup.add(piping);

    group.add(legGroup);
  }

  // 6. Right side cargo / boardshort flap pocket for extra Hawaiian shorts style.
  const pocketMat = new THREE.MeshStandardMaterial({
    map: canvasTexture(makeAlohaCanvas({
      size: 256,
      base: "#0f9fb2",
      seed: 88,
      flowers: 3,
      leaves: 3,
    })),
    roughness: 0.82,
    metalness: 0.0,
  });
  const pocket = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.080, 0.085), pocketMat);
  pocket.position.set(-0.218, -0.270, 0.006);
  pocket.rotation.set(0, 0, 0.05);
  pocket.castShadow = true;

  const flap = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.024, 0.090), waistMat);
  flap.position.set(-0.220, -0.226, 0.006);
  flap.rotation.set(0, 0, 0.05);
  flap.castShadow = true;

  group.add(pocket, flap);

  return group;
}

const buildRobe = buildHawaiianShorts;

/**
 * Crossed kimono lapels down the chest. Flat panels on the front only — a
 * wrapped cylinder wide enough to clear his upper arms would stand off the
 * body like a barrel, and these are what actually hide the base avatar's
 * printed T-shirt.
 */
function buildLapels() {
  const group = new THREE.Group();
  group.name = "HermitLapels";

  // Sunny yellow lapels with coral blossoms, paired with the turquoise Hawaiian shorts.
  const mat = new THREE.MeshStandardMaterial({
    map: canvasTexture(makeAlohaCanvas({
      base: "#f7b32b", leaf: "#0c7a58", petals: ["#fffaf0", "#ff8a5c"],
      heart: "#ef4f3a", seed: 23, flowers: 7, leaves: 5,
    })),
    roughness: 0.86,
    metalness: 0.0,
    side: THREE.DoubleSide,
  });
  const trimMat = new THREE.MeshStandardMaterial({
    map: canvasTexture(makeAlohaCanvas({
      base: "#fdf6e6", leaf: "#7fd4c1", petals: ["#ffd166"],
      heart: "#ef4f3a", seed: 9, flowers: 4, leaves: 3,
    })),
    roughness: 0.90,
    metalness: 0.0,
    side: THREE.DoubleSide,
  });

  // The panels are arcs of a cylinder squashed in x, not flat boxes: an
  // elliptical shell follows the ribcage, where a box stood off the chest like
  // a signboard with a shadow gap behind it.
  const SQUASH = 0.66, R = 0.215;
  const arc = (thetaStart, thetaLength, h, material, radius) => {
    const m = new THREE.Mesh(
      new THREE.CylinderGeometry(radius, radius, h, 20, 1, true, thetaStart, thetaLength),
      material);
    m.scale.x = SQUASH;
    return m;
  };

  for (const side of [-1, 1]) {
    // Half the chest each, meeting at the sternum. theta 0 is straight ahead.
    const panel = arc(side < 0 ? -0.92 : 0, 0.92, 0.340, mat, R);
    panel.position.set(0, -0.055, 0);
    panel.castShadow = true;
    group.add(panel);

    // Pale collar edge, running down to the sternum to form the kimono V.
    const trim = arc(side < 0 ? -0.30 : 0, 0.30, 0.355, trimMat, R + 0.008);
    trim.position.set(0, -0.048, 0);
    trim.rotation.z = side * 0.16;
    group.add(trim);
  }

  return group;
}

/** Gnarled hardwood staff with a hanging calabash gourd. */
function buildMasterStaff() {
  const group = new THREE.Group();
  group.name = "HermitStaff";

  const woodMat = new THREE.MeshStandardMaterial({
    color: 0x59402c, roughness: 0.82, metalness: 0.02,
  });
  const goldRingMat = new THREE.MeshStandardMaterial({
    color: 0xc8a642, roughness: 0.30, metalness: 0.78,
  });
  const gourdMat = new THREE.MeshPhysicalMaterial({
    color: 0xc9821f, roughness: 0.36, metalness: 0.06,
    clearcoat: 0.5, clearcoatRoughness: 0.30,
  });
  const cordMat = new THREE.MeshStandardMaterial({
    color: 0xa8281f, roughness: 0.68, metalness: 0.0,
  });

  const shaft1 = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.021, 0.65, 8), woodMat);
  shaft1.position.set(0, 0.32, 0);
  const knot1 = new THREE.Mesh(new THREE.SphereGeometry(0.024, 8, 8), woodMat);
  knot1.position.set(0, 0.65, 0);
  knot1.scale.set(1.2, 0.8, 1.1);
  const shaft2 = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.016, 0.65, 8), woodMat);
  shaft2.position.set(0.008, 0.98, 0.005);
  shaft2.rotation.z = -0.025;
  const knot2 = new THREE.Mesh(new THREE.SphereGeometry(0.026, 8, 8), woodMat);
  knot2.position.set(0.015, 1.31, 0.01);
  const topShaft = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.018, 0.26, 8), woodMat);
  topShaft.position.set(0.02, 1.44, 0.015);
  topShaft.rotation.z = -0.06;
  const goldRing = new THREE.Mesh(new THREE.TorusGeometry(0.026, 0.006, 8, 16), goldRingMat);
  goldRing.position.set(0.022, 1.38, 0.016);
  goldRing.rotation.x = Math.PI / 2;
  const crook = new THREE.Mesh(new THREE.SphereGeometry(0.034, 10, 10), woodMat);
  crook.position.set(0.028, 1.57, 0.02);
  crook.scale.set(1.1, 1.3, 1.0);

  const gourd = new THREE.Group();
  gourd.position.set(0.065, 1.33, 0.04);
  const botBulb = new THREE.Mesh(new THREE.SphereGeometry(0.042, 12, 12), gourdMat);
  botBulb.position.set(0, -0.042, 0);
  const topBulb = new THREE.Mesh(new THREE.SphereGeometry(0.029, 12, 12), gourdMat);
  topBulb.position.set(0, 0.016, 0);
  const waistCord = new THREE.Mesh(new THREE.TorusGeometry(0.022, 0.005, 8, 16), cordMat);
  waistCord.position.set(0, -0.014, 0);
  waistCord.rotation.x = Math.PI / 2;
  const tassel = new THREE.Mesh(new THREE.ConeGeometry(0.012, 0.042, 8), cordMat);
  tassel.position.set(0.016, -0.075, 0.012);
  const cork = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.008, 0.02, 8), woodMat);
  cork.position.set(0, 0.048, 0);
  gourd.add(botBulb, topBulb, waistCord, tassel, cork);

  group.add(shaft1, knot1, shaft2, knot2, topShaft, goldRing, crook, gourd);
  group.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return group;
}

/**
 * A soft contact shadow under his feet plus a faint warm ring. The plaza has no
 * ambient occlusion of its own, so without the darkening he floats on the
 * checkerboard; the ring is what marks him as someone you can talk to.
 */
function buildGroundDecal() {
  const size = 256;
  const c = blankCanvas(size);
  const ctx = c.getContext("2d");
  const half = size / 2;

  const shadow = ctx.createRadialGradient(half, half, 0, half, half, half);
  shadow.addColorStop(0.00, "rgba(10,12,8,0.55)");
  shadow.addColorStop(0.42, "rgba(10,12,8,0.22)");
  shadow.addColorStop(1.00, "rgba(10,12,8,0)");
  ctx.fillStyle = shadow;
  ctx.fillRect(0, 0, size, size);

  ctx.strokeStyle = "rgba(255,186,92,0.42)";
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.arc(half, half, half * 0.80, 0, Math.PI * 2);
  ctx.stroke();

  const geo = new THREE.PlaneGeometry(1.5, 1.5);
  geo.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
    map: canvasTexture(c),
    transparent: true,
    opacity: 0.85,
    depthWrite: false,
  }));
  mesh.position.y = 0.012;
  mesh.renderOrder = 2;
  return mesh;
}

// ---------------------------------------------------------------------------
// Dialogue UI
// ---------------------------------------------------------------------------

function createDialogueUI() {
  if (document.getElementById("hermitDialogueBox")) return;

  const style = document.createElement("style");
  style.id = "hermit-dialogue-styles";
  style.textContent = `
    .hermit-dialog-container {
      position: fixed;
      bottom: 32px;
      left: 50%;
      transform: translateX(-50%) translateY(20px);
      width: min(640px, calc(100vw - 32px));
      background: linear-gradient(135deg, rgba(18, 24, 38, 0.94) 0%, rgba(28, 38, 56, 0.96) 100%);
      border: 2px solid rgba(230, 150, 40, 0.85);
      border-radius: 12px;
      box-shadow: 0 12px 36px rgba(0, 0, 0, 0.6), 0 0 24px rgba(230, 150, 40, 0.25);
      backdrop-filter: blur(12px);
      color: #f5f5f5;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", sans-serif;
      z-index: 100;
      opacity: 0;
      visibility: hidden;
      pointer-events: none;
      transition: opacity 0.2s ease, transform 0.2s ease, visibility 0.2s;
      padding: 18px 22px;
      box-sizing: border-box;
      user-select: none;
    }
    .hermit-dialog-container.show {
      opacity: 1;
      visibility: visible;
      pointer-events: auto;
      transform: translateX(-50%) translateY(0);
    }
    .hermit-dialog-header {
      display: flex;
      align-items: center;
      gap: 12px;
      border-bottom: 1px solid rgba(230, 150, 40, 0.3);
      padding-bottom: 10px;
      margin-bottom: 12px;
    }
    .hermit-avatar-badge {
      width: 44px;
      height: 44px;
      border-radius: 50%;
      background: radial-gradient(circle, #ff8f00 0%, #d84315 100%);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 24px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.4), inset 0 0 4px rgba(255,255,255,0.4);
      border: 2px solid #ffd54f;
      flex-shrink: 0;
    }
    .hermit-title-group {
      flex: 1;
      display: flex;
      flex-direction: column;
    }
    .hermit-name {
      font-size: 17px;
      font-weight: 700;
      letter-spacing: 0.4px;
      color: #ffb74d;
      text-shadow: 0 1px 2px rgba(0,0,0,0.5);
    }
    .hermit-subtitle {
      font-size: 11px;
      font-weight: 500;
      letter-spacing: 0.5px;
      text-transform: uppercase;
      color: #90caf9;
    }
    .hermit-dialog-close {
      background: transparent;
      border: 1px solid rgba(255, 255, 255, 0.2);
      border-radius: 6px;
      color: #aaa;
      font-size: 16px;
      width: 28px;
      height: 28px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: background 0.15s, color 0.15s;
    }
    .hermit-dialog-close:hover {
      background: rgba(255, 255, 255, 0.15);
      color: #fff;
    }
    .hermit-dialog-body {
      min-height: 64px;
      display: flex;
      align-items: center;
      padding: 4px 0 12px 0;
    }
    .hermit-dialog-text {
      font-size: 15px;
      line-height: 1.55;
      color: #ffffff;
      margin: 0;
      text-shadow: 0 1px 2px rgba(0,0,0,0.4);
    }
    .hermit-dialog-footer {
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-top: 1px solid rgba(255, 255, 255, 0.08);
      padding-top: 10px;
      font-size: 12px;
      color: #9e9e9e;
    }
    .hermit-dialog-hint b {
      color: #ffcc80;
    }
    .hermit-dialog-btn {
      background: linear-gradient(135deg, #ff8f00 0%, #e65100 100%);
      border: none;
      border-radius: 6px;
      color: #fff;
      font-weight: 600;
      font-size: 13px;
      padding: 7px 16px;
      cursor: pointer;
      box-shadow: 0 2px 6px rgba(0,0,0,0.3);
      transition: filter 0.15s, transform 0.1s;
    }
    .hermit-dialog-btn:hover {
      filter: brightness(1.15);
      transform: translateY(-1px);
    }
    .hermit-dialog-btn:active {
      transform: translateY(1px);
    }
  `;
  document.head.appendChild(style);

  const container = document.createElement("div");
  container.id = "hermitDialogueBox";
  container.className = "hermit-dialog-container";
  container.innerHTML = `
    <div class="hermit-dialog-header">
      <div class="hermit-avatar-badge">&#128034;</div>
      <div class="hermit-title-group">
        <span class="hermit-name">Vénérable Ermite Tortue</span>
        <span class="hermit-subtitle">Grand Sage des Nuages Célestes</span>
      </div>
      <button class="hermit-dialog-close" type="button" aria-label="Fermer">&#10005;</button>
    </div>
    <div class="hermit-dialog-body">
      <p class="hermit-dialog-text" id="hermitDialogText"></p>
    </div>
    <div class="hermit-dialog-footer">
      <span class="hermit-dialog-hint">Appuyez sur <b>[Espace]</b> ou cliquez sur <b>Continuer</b></span>
      <button class="hermit-dialog-btn" type="button" id="hermitNextBtn">Continuer &#10142;</button>
    </div>
  `;
  document.body.appendChild(container);

  dialogueDom = container;

  const closeBtn = container.querySelector(".hermit-dialog-close");
  const nextBtn = container.querySelector("#hermitNextBtn");

  closeBtn?.addEventListener("click", e => { e.stopPropagation(); closeDialogue(); });
  nextBtn?.addEventListener("click", e => { e.stopPropagation(); advanceDialogue(); });

  // The panel swallows its own clicks so they never reach the canvas, but a
  // click on the panel's background is not an answer — only the buttons and
  // the keyboard advance the conversation.
  container.addEventListener("click", e => e.stopPropagation());

  window.addEventListener("keydown", e => {
    if (!dialogueActive) return;
    if (e.code === "Space" || e.code === "KeyE" || e.code === "Enter") {
      e.preventDefault();
      e.stopPropagation();
      advanceDialogue();
    } else if (e.code === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      closeDialogue();
    }
  }, true);
}

function showDialogue(index = 0) {
  if (!dialogueDom) createDialogueUI();
  dialogueIndex = index % HERMIT_DIALOGUES.length;
  dialogueActive = true;

  const textEl = document.getElementById("hermitDialogText");
  if (textEl) textEl.textContent = HERMIT_DIALOGUES[dialogueIndex].text;

  const nextBtn = document.getElementById("hermitNextBtn");
  if (nextBtn) {
    const isLast = dialogueIndex === HERMIT_DIALOGUES.length - 1;
    nextBtn.innerHTML = isLast ? "Fermer [&#10005;]" : "Continuer &#10142;";
  }

  dialogueDom.classList.add("show");

  // Release pointer lock so the player can reach the buttons.
  if (document.pointerLockElement) document.exitPointerLock?.();
}

function advanceDialogue() {
  if (!dialogueActive) return;
  dialogueIndex++;
  if (dialogueIndex >= HERMIT_DIALOGUES.length) closeDialogue();
  else showDialogue(dialogueIndex);
}

function closeDialogue() {
  if (!dialogueActive) return;
  dialogueActive = false;
  dialogueDom?.classList.remove("show");
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

/**
 * Places the hermit on the celestial plaza. Defaults put him out on the open
 * checkerboard, clear of the colonnade behind him and the reflecting pool in
 * front, facing the stairhead the player arrives on.
 */
export async function initTurtleHermit({
  scene,
  furnitureInteractions,
  posX = 55,
  posY = 180.20,
  posZ = 20.5,
  yaw = 0,
}) {
  createDialogueUI();

  // The guest loader needs both clips: man.glb carries no animation of its
  // own, so idle and walk each come from their own file.
  const guestRig = await loadGuestRig({
    model: "./glb/visitors/man.glb",
    walk: "./glb/visitors/walk_m.glb",
    idle: "./glb/visitors/idle_m.glb",
    height: 1.58,
  });

  const hermitMesh = cloneSkinned(guestRig.scene);

  hermitMesh.traverse(o => {
    if (!o.isMesh && !o.isSkinnedMesh) return;
    o.castShadow = true;
    o.receiveShadow = true;
    o.frustumCulled = false;

    const list = Array.isArray(o.material) ? o.material : [o.material];
    const made = list.map(m => {
      if (!m) return m;
      const c = m.clone();
      // Dye the atlas' clothing quadrant only. His face, hands and hair keep
      // their own pixels — a flat colour on the material tints all three.
      if (c.map) {
        c.map = shaveHead(dressGuestAtlasDark(c.map, ROBE_HEX));
        c.map.anisotropy = 8;
        // shaveHead punches the hair shell's texels to alpha 0; this is what
        // actually drops those triangles. Every other texel is opaque, so no
        // other part of him is affected, and alphaTest needs no depth sorting.
        c.alphaTest = 0.5;
        c.transparent = false;
      }
      c.color.setHex(0xffffff);
      c.roughness = 0.74;
      c.metalness = 0.0;
      c.envMapIntensity = 1.0;
      return c;
    });
    o.material = Array.isArray(o.material) ? made : made[0];
  });

  hermitMesh.scale.setScalar(1.58 / (guestRig.measured || 1.7));

  hermitHeadBone = hermitMesh.getObjectByName("Head");
  const spine2Bone = hermitMesh.getObjectByName("Spine2");
  const hipsBone = hermitMesh.getObjectByName("Hips");

  if (hermitHeadBone) {
    hermitHeadBone.add(buildSunglasses());
    hermitHeadBone.add(buildBeardAndBrows());
    hermitHeadBone.add(buildSideCurls());
  }
  if (spine2Bone) {
    const shell = buildTurtleShell();
    // Rim plane laid against his back. Hung lower than the old -0.21 so the
    // bigger dome covers the whole back down to the hips without swallowing
    // the back of his head (top stays around +0.22 in Spine2 space).
    shell.position.set(0, -0.30, -0.10);
    spine2Bone.add(shell);
    spine2Bone.add(buildLapels());
  }
  if (hipsBone) hipsBone.add(buildHawaiianShorts());

  hermitMixer = new THREE.AnimationMixer(hermitMesh);
  if (guestRig.idleClip) {
    const action = hermitMixer.clipAction(guestRig.idleClip);
    action.timeScale = 0.92;
    action.play();
  }

  hermitGroup = new THREE.Group();
  hermitGroup.name = "TurtleHermitNPC";
  hermitGroup.position.set(posX, posY, posZ);
  hermitGroup.rotation.y = yaw;
  hermitGroup.add(hermitMesh, buildGroundDecal());
  scene.add(hermitGroup);

  // The staff goes in his right hand, not on the floor beside him. The hand
  // bone points off at an angle that has nothing to do with vertical, so the
  // mount cancels the hand's world rotation: the staff then hangs plumb at
  // rest and still swings with the arm, the way a held stick does.
  const handBone = hermitMesh.getObjectByName("RightHand");
  if (handBone) {
    hermitMixer.update(0.001);            // pose the arms before measuring
    hermitGroup.updateMatrixWorld(true);

    const mount = new THREE.Group();
    mount.name = "HermitStaffMount";
    mount.quaternion.copy(handBone.getWorldQuaternion(new THREE.Quaternion()).invert());
    handBone.add(mount);

    const staff = buildMasterStaff();
    const handWorld = handBone.getWorldPosition(new THREE.Vector3());
    const boneScale = handBone.getWorldScale(new THREE.Vector3()).x || 1;
    // Put the shaft through the middle of his fist and drop it until its foot
    // meets the plaza — both measured off the rig rather than guessed. It is
    // left exactly plumb on purpose: the staff pivots about its foot, so even a
    // 0.05 rad lean walked the shaft 4 cm clear of the hand up at grip height,
    // which is why it kept looking propped beside him rather than held.
    const palmBone = hermitMesh.getObjectByName("RightHandMiddle1") || handBone;
    const palmWorld = palmBone.getWorldPosition(new THREE.Vector3());
    staff.position.set(
      (palmWorld.x - handWorld.x) / boneScale,
      -(handWorld.y - posY) / boneScale,
      (palmWorld.z - handWorld.z) / boneScale);
    mount.add(staff);

    // Close the fingers round it. The idle clip re-poses these bones every
    // frame, so the curl is re-applied after the mixer runs, in updateTurtleHermit.
    gripBones = [
      ["RightHandThumb1", 0.42], ["RightHandThumb2", 0.34],
      ["RightHandIndex1", 1.05], ["RightHandIndex2", 1.15], ["RightHandIndex3", 0.85],
      ["RightHandMiddle1", 1.05], ["RightHandMiddle2", 1.20], ["RightHandMiddle3", 0.90],
      ["RightHandRing1", 1.00], ["RightHandRing2", 1.15], ["RightHandRing3", 0.90],
      ["RightHandPinky1", 0.95], ["RightHandPinky2", 1.10], ["RightHandPinky3", 0.85],
    ].map(([name, curl]) => ({ bone: hermitMesh.getObjectByName(name), curl }))
     .filter(g => g.bone);
  }

  furnitureInteractions.push({
    type: "talk_hermit",
    label: "Parler au Vénérable Maître Ermite  (E)",
    centerX: posX,
    centerZ: posZ,
    x: posX,
    y: posY,
    z: posZ,
    approachY: posY,
    // A person's footprint, not a room's — the old 1.4 m half-extents reached
    // most of the way across the open plaza.
    halfWidth: 0.7,
    halfDepth: 0.7,
    yaw,
    triggerDistance: 2.0,
    keepLock: false,
  });

  return hermitGroup;
}

const _headWorld = new THREE.Vector3();
const _extraTurn = new THREE.Quaternion();
const _euler = new THREE.Euler(0, 0, 0, "YXZ");

export function updateTurtleHermit(dt, playerPos) {
  if (hermitMixer) hermitMixer.update(dt);

  // Re-close the hand on the staff: the idle clip has just re-posed these
  // bones, so the curl has to be composed back on every frame.
  for (const g of gripBones) {
    _extraTurn.setFromAxisAngle(GRIP_AXIS, g.curl);
    g.bone.quaternion.multiply(_extraTurn);
  }

  if (!hermitGroup || !playerPos || !hermitHeadBone) return;

  const distance = hermitGroup.position.distanceTo(playerPos);

  // Target neck yaw, in the head bone's own space, clamped to a human range.
  let want = 0;
  if (distance < 9.0 && distance > 0.5) {
    hermitHeadBone.getWorldPosition(_headWorld);
    const world = Math.atan2(playerPos.x - _headWorld.x, playerPos.z - _headWorld.z);
    let local = world - hermitGroup.rotation.y;
    while (local > Math.PI) local -= Math.PI * 2;
    while (local < -Math.PI) local += Math.PI * 2;
    want = THREE.MathUtils.clamp(local, -1.15, 1.15) * 0.7;
  }
  headTurn += (want - headTurn) * Math.min(1, dt * 4.0);

  // Compose onto whatever the idle clip just posed, rather than replacing it —
  // overwriting the bone outright killed the animation's own head motion.
  if (Math.abs(headTurn) > 0.001) {
    _euler.set(0, headTurn, 0);
    _extraTurn.setFromEuler(_euler);
    hermitHeadBone.quaternion.multiply(_extraTurn);
  }
}

export function isHermitDialogueOpen() {
  return dialogueActive;
}

export function triggerHermitDialogue() {
  showDialogue(0);
}
