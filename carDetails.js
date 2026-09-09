import * as THREE from 'three';

function canvasTexture(draw, width = 512, height = 256, color = true) {
  const canvas = Object.assign(document.createElement('canvas'), { width, height });
  draw(canvas.getContext('2d'), width, height);
  const texture = new THREE.CanvasTexture(canvas);
  if (color) texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

// One atlas per lamp: dark housing, two concentric projector reflectors and
// a separate light-guide strip. The emissive mask leaves the housing dark.
function drawLamp(g, w, h, mask = false) {
  g.fillStyle = mask ? '#000' : '#17212b'; g.fillRect(0, 0, w, h);
  if (!mask) {
    g.strokeStyle = '#7e919e'; g.lineWidth = 9; g.strokeRect(9, 9, w - 18, h - 18);
  }
  for (const x of [w * 0.30, w * 0.69]) {
    const radius = h * 0.31;
    const gradient = g.createRadialGradient(x - 12, h * 0.44, 2, x, h * 0.48, radius);
    gradient.addColorStop(0, mask ? '#a8bbcf' : '#e5f5ff');
    gradient.addColorStop(0.30, mask ? '#394c61' : '#6589a2');
    gradient.addColorStop(0.58, mask ? '#101820' : '#172632');
    gradient.addColorStop(0.77, mask ? '#000' : '#a6b8c3');
    gradient.addColorStop(0.9, mask ? '#111' : '#34424c');
    gradient.addColorStop(1, mask ? '#000' : '#d0dce3');
    g.fillStyle = gradient; g.beginPath(); g.arc(x, h * 0.48, radius, 0, Math.PI * 2); g.fill();
  }
  g.strokeStyle = mask ? '#fff' : '#e6f4ff'; g.lineWidth = 10;
  g.lineJoin = 'round'; g.beginPath(); g.moveTo(30, h * 0.68);
  g.lineTo(44, h * 0.84); g.lineTo(w - 44, h * 0.84); g.lineTo(w - 30, h * 0.68); g.stroke();
}
export const lampMap = canvasTexture((g,w,h) => drawLamp(g,w,h));
export const lampEmission = canvasTexture((g,w,h) => drawLamp(g,w,h,true));

const grilleMap = canvasTexture((g,w,h) => {
  g.fillStyle = '#080c10'; g.fillRect(0,0,w,h);
  for (let row = -1; row < 14; row++) for (let col = -1; col < 30; col++) {
    const x = col * 20 + (row % 2) * 10, y = row * 18;
    g.beginPath();
    for (let k = 0; k < 6; k++) {
      const angle = Math.PI / 3 * k;
      const px = x + 10 * Math.cos(angle), py = y + 10 * Math.sin(angle);
      if (k === 0) g.moveTo(px,py); else g.lineTo(px,py);
    }
    g.closePath(); g.strokeStyle = '#46515a'; g.lineWidth = 2; g.stroke();
  }
});
const grille = new THREE.MeshStandardMaterial({
  color: 0xb0bac2, map: grilleMap, bumpMap: grilleMap, bumpScale: 0.008,
  roughness: 0.48, metalness: 0.55,
});

export function mapHeadlights(mesh) {
  const geometry = mesh.geometry.clone(), p = geometry.attributes.position;
  const boxes = [new THREE.Box3(), new THREE.Box3()];
  for (let i = 0; i < p.count; i++) {
    const v = new THREE.Vector3().fromBufferAttribute(p,i); boxes[v.x < 0 ? 0 : 1].expandByPoint(v);
  }
  const uv = [];
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), box = boxes[x < 0 ? 0 : 1];
    uv.push((x - box.min.x) / Math.max(0.001,box.max.x-box.min.x),
      (p.getY(i)-box.min.y) / Math.max(0.001,box.max.y-box.min.y));
  }
  geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
  mesh.geometry = geometry;
}

// Grey also contains wheels, rear plates and trim. Select only the central
// forward-facing insert, retaining all other triangles and their material.
export function detailGrille(mesh) {
  if (/Wheel/i.test(mesh.name)) return;
  const geometry = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
  const p = geometry.attributes.position, selected = [];
  for (let i = 0; i < p.count; i += 3) {
    selected.push([0,1,2].every(j => p.getZ(i+j) > 1.4 && Math.abs(p.getX(i+j)) < 0.55));
  }
  if (!selected.some(Boolean)) { geometry.dispose(); return; }
  const bounds = new THREE.Box3();
  selected.forEach((yes,t) => { if (yes) for(let j=0;j<3;j++) bounds.expandByPoint(new THREE.Vector3().fromBufferAttribute(p,t*3+j)); });
  const uv = geometry.attributes.uv || new THREE.Float32BufferAttribute(new Float32Array(p.count*2),2);
  geometry.clearGroups();
  let groupStart = 0;
  selected.forEach((yes,t) => {
    if (t === selected.length - 1 || selected[t + 1] !== yes) {
      geometry.addGroup(groupStart * 3, (t - groupStart + 1) * 3, yes ? 1 : 0);
      groupStart = t + 1;
    }
    if(yes) for(let j=0;j<3;j++) { const i=t*3+j; uv.setXY(i,(p.getX(i)-bounds.min.x)/(bounds.max.x-bounds.min.x),(p.getY(i)-bounds.min.y)/Math.max(0.001,bounds.max.y-bounds.min.y)); }
  });
  geometry.setAttribute('uv',uv);
  mesh.geometry = geometry; mesh.material = [mesh.material, grille];
}
