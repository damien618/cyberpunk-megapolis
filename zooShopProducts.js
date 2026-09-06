import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// Shared geometry and PBR textures; one instanced draw per imported mesh.
// Display merchandise stays outside the collision world.
export function createShopProducts(scene, anisotropy) {
  const requests = [];
  const group = new THREE.Group();
  group.name = 'Zoo shop merchandise';
  scene.add(group);
  const ready = new GLTFLoader().loadAsync('./glb/zoo-shop/tea_set_01.gltf');
  function place(name, x, y, z, yaw, width, upright = false) {
    requests.push({ name, x, y, z, yaw, width, upright });
  }
  async function finish() {
    try {
      const gltf = await ready;
      const batches = new Map();
      for (const p of requests) {
        const source = gltf.scene.getObjectByName('tea_set_01_' + p.name);
        if (!source?.isMesh) throw new Error('Missing merchandise mesh: ' + p.name);
        const key = p.name + ':' + p.upright;
        if (!batches.has(key)) {
          const geometry = source.geometry.clone();
          if (p.upright) geometry.rotateX(Math.PI / 2);
          geometry.computeBoundingBox();
          const b = geometry.boundingBox;
          geometry.translate(-(b.min.x + b.max.x) / 2, -b.min.y, -(b.min.z + b.max.z) / 2);
          geometry.computeBoundingBox();
          const material = source.material;
          for (const t of [material.map, material.normalMap, material.roughnessMap, material.metalnessMap]) {
            if (t) t.anisotropy = anisotropy;
          }
          batches.set(key, { geometry, material, items: [] });
        }
        batches.get(key).items.push(p);
      }
      for (const { geometry, material, items } of batches.values()) {
        const mesh = new THREE.InstancedMesh(geometry, material, items.length);
        const transform = new THREE.Object3D();
        const size = geometry.boundingBox.getSize(new THREE.Vector3());
        items.forEach((p, i) => {
          transform.position.set(p.x, p.y, p.z);
          transform.rotation.set(0, p.yaw, 0);
          transform.scale.setScalar(p.width / size.x);
          transform.updateMatrix();
          mesh.setMatrixAt(i, transform.matrix);
        });
        mesh.castShadow = mesh.receiveShadow = true;
        mesh.instanceMatrix.needsUpdate = true;
        group.add(mesh);
      }
      group.userData.loaded = true;
    } catch (error) {
      group.userData.error = String(error);
      console.error('[zoo] Shop merchandise failed to load', error);
    }
  }
  return { place, finish, group };
}

export function shopSign(title, subtitle, background = '#234c40') {
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 256;
  const ctx = c.getContext('2d');
  ctx.fillStyle = background; ctx.fillRect(0, 0, 1024, 256);
  ctx.strokeStyle = '#d9b875'; ctx.lineWidth = 4; ctx.strokeRect(16, 16, 992, 224);
  ctx.fillStyle = '#fff2d7'; ctx.textAlign = 'center';
  ctx.font = '600 64px Georgia'; ctx.fillText(title, 512, 112);
  ctx.font = '30px sans-serif'; ctx.fillText(subtitle, 512, 185);
  const map = new THREE.CanvasTexture(c); map.colorSpace = THREE.SRGBColorSpace;
  return new THREE.MeshStandardMaterial({ map, roughness: 0.85, emissive: 0xffffff, emissiveMap: map, emissiveIntensity: 0.14 });
}

export function textileBump() {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#888'; ctx.fillRect(0, 0, 256, 256);
  let seed = 42;
  const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 15000; i++) {
    const shade = 70 + Math.floor(random() * 150);
    ctx.strokeStyle = `rgb(${shade},${shade},${shade})`;
    const x = random() * 256, y = random() * 256;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 1, y + 2 + random() * 4); ctx.stroke();
  }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(3, 3); return t;
}

// ---------------------------------------------------------------------------
// Painted surfaces. Everything inside the shops was a flat colour before this,
// which is what made the rooms read as cardboard: a shop is mostly its wall
// lining, its floor covering and what is framed on the walls, and a solid fill
// gives all three the same non-material.
// ---------------------------------------------------------------------------

// Tongue-and-groove lining for the back-bar. The grooves are what give the wall
// behind the shelves a scale, and they catch the shelf lighting edge-on so the
// panel stops being a lit rectangle.
export function beadboardTexture(repeat = 14) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 64;
  const ctx = c.getContext('2d');
  for (let i = 0; i < 4; i++) {
    const x = i * 64;
    const g = ctx.createLinearGradient(x, 0, x + 64, 0);
    g.addColorStop(0.00, '#9a917c');   // the groove itself
    g.addColorStop(0.06, '#cdc4ac');
    g.addColorStop(0.24, '#fbf5e6');   // bead, catching the light
    g.addColorStop(0.60, '#ece5d3');
    g.addColorStop(0.98, '#c2b9a2');
    ctx.fillStyle = g; ctx.fillRect(x, 0, 64, 64);
  }
  // Brush grain along the boards, or the gradient reads as printed plastic.
  let seed = 7;
  const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  ctx.globalAlpha = 0.06;
  for (let i = 0; i < 900; i++) {
    ctx.fillStyle = random() > 0.5 ? '#ffffff' : '#7d7361';
    const y = random() * 64;
    ctx.fillRect(random() * 256, y, 6 + random() * 26, 1);
  }
  ctx.globalAlpha = 1;
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, 1);
  return t;
}

// The rug. A 4 cm box of flat maroon is a puddle of paint on the floor; a woven
// field inside two borders is a rug, and the borders are most of the reason —
// they give the thing an edge that was made rather than cut.
export function rugTexture() {
  const S = 256;
  const c = document.createElement('canvas'); c.width = c.height = S;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#8e4536'; ctx.fillRect(0, 0, S, S);
  // Field: a lattice of stitched diamonds, deliberately low contrast.
  ctx.strokeStyle = '#a45a45'; ctx.lineWidth = 2;
  for (let i = -8; i <= 8; i++) {
    ctx.beginPath();
    ctx.moveTo(i * 32, 0); ctx.lineTo(i * 32 + S, S); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(i * 32, S); ctx.lineTo(i * 32 + S, 0); ctx.stroke();
  }
  // Two borders and a hairline between them.
  const band = (inset, w, fill) => {
    ctx.strokeStyle = fill; ctx.lineWidth = w;
    ctx.strokeRect(inset, inset, S - inset * 2, S - inset * 2);
  };
  band(11, 22, '#6d3226');
  band(26, 6, '#cba077');
  band(34, 3, '#6d3226');
  // Pile: fine speckle, which is what stops a rug looking like lino.
  let seed = 91;
  const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  ctx.globalAlpha = 0.16;
  for (let i = 0; i < 9000; i++) {
    ctx.fillStyle = random() > 0.5 ? '#d7a58c' : '#4d2018';
    ctx.fillRect(random() * S, random() * S, 2, 2);
  }
  ctx.globalAlpha = 1;
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Framed prints. The frames were hung with a blank cream card and a green blob
// in them, which at eye level is the one thing in the room you are guaranteed
// to look at. These are zoo posters: a colour field, a silhouette and a title.
const POSTERS = [
  { sky: '#e8b45c', ground: '#8a5a2c', ink: '#2a1d16', title: 'GIRAFES', animal: 'giraffe' },
  { sky: '#7fa8b8', ground: '#40606a', ink: '#16232a', title: 'ELEPHANTS', animal: 'elephant' },
  { sky: '#d98a72', ground: '#7c4234', ink: '#2b160f', title: 'AU ZOO', animal: 'bird' },
];

export function posterTexture(index) {
  const p = POSTERS[index % POSTERS.length];
  const W = 320, H = 420;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#f4ecdb'; ctx.fillRect(0, 0, W, H);           // paper margin
  const x0 = 18, y0 = 18, w = W - 36, h = H - 92;                // the image
  const sky = ctx.createLinearGradient(0, y0, 0, y0 + h);
  sky.addColorStop(0, p.sky); sky.addColorStop(1, '#f0dcb4');
  ctx.fillStyle = sky; ctx.fillRect(x0, y0, w, h);
  ctx.fillStyle = 'rgba(255,255,255,0.55)';                       // low sun
  ctx.beginPath(); ctx.arc(x0 + w * 0.68, y0 + h * 0.3, 46, 0, 7); ctx.fill();
  ctx.fillStyle = p.ground;                                       // horizon
  ctx.beginPath();
  ctx.moveTo(x0, y0 + h);
  ctx.lineTo(x0, y0 + h * 0.78);
  ctx.quadraticCurveTo(x0 + w * 0.5, y0 + h * 0.68, x0 + w, y0 + h * 0.8);
  ctx.lineTo(x0 + w, y0 + h); ctx.closePath(); ctx.fill();
  ctx.fillStyle = p.ink; ctx.strokeStyle = p.ink; ctx.lineCap = 'round';
  const cx = x0 + w * 0.42, base = y0 + h * 0.84;
  const oval = (ex, ey, rx, ry, rot = 0) => {
    ctx.beginPath(); ctx.ellipse(ex, ey, rx, ry, rot, 0, 7); ctx.fill();
  };
  if (p.animal === 'giraffe') {
    oval(cx, base - 52, 44, 26);                                  // body
    ctx.lineWidth = 13;                                            // neck
    ctx.beginPath(); ctx.moveTo(cx + 30, base - 62);
    ctx.quadraticCurveTo(cx + 58, base - 150, cx + 62, base - 178); ctx.stroke();
    oval(cx + 66, base - 186, 17, 11, -0.5);                       // head
    ctx.lineWidth = 8;
    for (const [lx, sw] of [[-28, -6], [-16, 4], [18, -5], [30, 5]]) {
      ctx.beginPath(); ctx.moveTo(cx + lx, base - 40);
      ctx.lineTo(cx + lx + sw, base); ctx.stroke();
    }
  } else if (p.animal === 'elephant') {
    oval(cx, base - 56, 52, 38);                                   // body
    oval(cx + 46, base - 74, 26, 26);                              // head
    oval(cx + 36, base - 74, 20, 24);                              // ear
    ctx.lineWidth = 12;                                            // trunk
    ctx.beginPath(); ctx.moveTo(cx + 66, base - 72);
    ctx.quadraticCurveTo(cx + 86, base - 40, cx + 72, base - 12); ctx.stroke();
    ctx.lineWidth = 16;
    for (const lx of [-34, -12, 22, 42]) {
      ctx.beginPath(); ctx.moveTo(cx + lx, base - 40);
      ctx.lineTo(cx + lx, base - 4); ctx.stroke();
    }
  } else {
    ctx.lineWidth = 9;                                             // branch
    ctx.beginPath(); ctx.moveTo(x0 + 10, base + 6);
    ctx.quadraticCurveTo(cx, base - 12, cx + 96, base - 4); ctx.stroke();
    oval(cx + 10, base - 54, 34, 30);                              // body
    oval(cx + 34, base - 84, 19, 17);                              // head
    ctx.beginPath();                                               // beak
    ctx.moveTo(cx + 48, base - 92); ctx.lineTo(cx + 92, base - 78);
    ctx.lineTo(cx + 48, base - 72); ctx.closePath(); ctx.fill();
    ctx.lineWidth = 7;                                             // tail
    ctx.beginPath(); ctx.moveTo(cx - 18, base - 50);
    ctx.lineTo(cx - 58, base - 30); ctx.stroke();
    ctx.lineWidth = 6;
    for (const lx of [2, 18]) {
      ctx.beginPath(); ctx.moveTo(cx + lx, base - 28);
      ctx.lineTo(cx + lx, base - 2); ctx.stroke();
    }
  }
  ctx.fillStyle = '#2a2018'; ctx.textAlign = 'center';
  ctx.font = '600 40px Georgia';
  ctx.fillText(p.title, W / 2, H - 40);
  ctx.font = '17px sans-serif';
  ctx.fillText('PARC ZOOLOGIQUE', W / 2, H - 16);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
