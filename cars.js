// cars.js — procedural road cars for the villa map.
//
// A car is lofted from a dozen cross-sections rather than boxed together: it is
// the way `hw` swells over each axle and pinches at the bumpers that makes a
// silhouette read as a car at all. Three profiles, drawn from what actually
// parks in these hills — a rear-engined coupe, a long-bonnet saloon, a big SUV.
//
// Every map (tread, sidewall, alloy face, grille mesh, plate, paint flake) is
// baked to a canvas at load: no image files to ship, no network, and the maps
// stay correct under any lighting because they carry no baked highlights.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// ---------------------------------------------------------------------------
// Canvas-baked maps
// ---------------------------------------------------------------------------
function paint2d(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  return c;
}
function toMap(canvas, { repeatX = 1, repeatY = 1, srgb = true } = {}) {
  const t = new THREE.CanvasTexture(canvas);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeatX, repeatY);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = 8;                 // clamped to the device max on upload
  return t;
}

// Cylinder side UVs run u around the circumference and v across the tread, so
// circumferential grooves are horizontal here and the sipes are vertical.
const treadMap = toMap(paint2d(64, 128, (g, w, h) => {
  g.fillStyle = '#1b1c1f'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#0a0b0c';
  g.fillRect(0, h * 0.28, w, h * 0.07);
  g.fillRect(0, h * 0.65, w, h * 0.07);
  g.fillStyle = '#101113';
  for (const [y0, y1] of [[0, h * 0.28], [h * 0.35, h * 0.65], [h * 0.72, h]]) {
    g.save();
    g.beginPath(); g.rect(0, y0, w, y1 - y0); g.clip();
    g.translate(w * 0.5, (y0 + y1) / 2); g.rotate(-0.32); g.translate(-w * 0.5, -(y0 + y1) / 2);
    g.fillRect(w * 0.06, y0 - 20, w * 0.17, y1 - y0 + 40);
    g.fillRect(w * 0.58, y0 - 20, w * 0.17, y1 - y0 + 40);
    g.restore();
  }
  g.fillStyle = 'rgba(255,255,255,0.05)';
  g.fillRect(0, h * 0.35, w, 2); g.fillRect(0, h * 0.70, w, 2);
}), { repeatX: 26 });

// The outer face of a wheel in one disc: sidewall, rim lip, spokes, brake disc,
// hub. CircleGeometry maps planar so polar drawing lands exactly where drawn.
function wheelFaceMap({ spokes = 5, twin = false, lip = '#cdd3da', face = '#b6bcc4' } = {}) {
  return toMap(paint2d(512, 512, (g, w) => {
    const C = w / 2, R = w / 2;
    g.fillStyle = '#08090a'; g.fillRect(0, 0, w, w);

    // Tyre sidewall — rubber with two moulded ridges and a size marking
    const side = g.createRadialGradient(C, C, R * 0.58, C, C, R);
    side.addColorStop(0, '#212327'); side.addColorStop(0.75, '#191a1d'); side.addColorStop(1, '#0e0f11');
    g.fillStyle = side;
    g.beginPath(); g.arc(C, C, R, 0, 7); g.arc(C, C, R * 0.575, 0, 7, true); g.fill();
    g.strokeStyle = '#2c2f34'; g.lineWidth = R * 0.012;
    for (const r of [0.63, 0.93]) { g.beginPath(); g.arc(C, C, R * r, 0, 7); g.stroke(); }
    g.fillStyle = '#4a4e55'; g.font = `600 ${R * 0.055}px system-ui, sans-serif`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    for (let i = 0; i < 4; i++) {
      g.save(); g.translate(C, C); g.rotate(i * Math.PI / 2 + 0.25);
      g.fillText('SPORT CONTACT  275/35 ZR20', 0, -R * 0.78);
      g.restore();
    }

    // Rim lip, then the dark barrel the spokes sit in
    const lipGrad = g.createLinearGradient(0, C - R * 0.57, 0, C + R * 0.57);
    lipGrad.addColorStop(0, '#eef1f4'); lipGrad.addColorStop(0.5, lip); lipGrad.addColorStop(1, '#7d838b');
    g.fillStyle = lipGrad;
    g.beginPath(); g.arc(C, C, R * 0.575, 0, 7); g.fill();
    g.fillStyle = '#0d0f12';
    g.beginPath(); g.arc(C, C, R * 0.515, 0, 7); g.fill();

    // Vented brake disc behind the spokes
    const disc = g.createRadialGradient(C - R * 0.1, C - R * 0.1, 0, C, C, R * 0.44);
    disc.addColorStop(0, '#5c6066'); disc.addColorStop(1, '#33363b');
    g.fillStyle = disc;
    g.beginPath(); g.arc(C, C, R * 0.44, 0, 7); g.fill();
    g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = R * 0.008;
    for (let r = 0.16; r < 0.44; r += 0.035) { g.beginPath(); g.arc(C, C, R * r, 0, 7); g.stroke(); }

    // Spokes — tapered from hub to lip, lit from the top left
    const n = twin ? spokes * 2 : spokes;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + (twin ? (i % 2 ? 0.16 : -0.16) : 0);
      const wide = (twin ? 0.055 : 0.115);
      g.save(); g.translate(C, C); g.rotate(a);
      const sp = g.createLinearGradient(-R * wide, 0, R * wide, 0);
      sp.addColorStop(0, '#8d939b'); sp.addColorStop(0.35, '#e6eaee');
      sp.addColorStop(0.7, face); sp.addColorStop(1, '#6e747c');
      g.fillStyle = sp;
      g.beginPath();
      g.moveTo(-R * wide * 0.55, -R * 0.10);
      g.lineTo(R * wide * 0.55, -R * 0.10);
      g.lineTo(R * wide, -R * 0.545);
      g.lineTo(-R * wide, -R * 0.545);
      g.closePath(); g.fill();
      g.restore();
    }

    // Hub cap and lug bolts
    const hub = g.createRadialGradient(C - R * 0.03, C - R * 0.03, 0, C, C, R * 0.155);
    hub.addColorStop(0, '#3b3f45'); hub.addColorStop(1, '#16181b');
    g.fillStyle = hub;
    g.beginPath(); g.arc(C, C, R * 0.155, 0, 7); g.fill();
    g.strokeStyle = '#aeb4bc'; g.lineWidth = R * 0.014;
    g.beginPath(); g.arc(C, C, R * 0.155, 0, 7); g.stroke();
    g.fillStyle = '#9aa0a8';
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
      g.beginPath(); g.arc(C + Math.cos(a) * R * 0.105, C + Math.sin(a) * R * 0.105, R * 0.022, 0, 7); g.fill();
    }
  }));
}

const grilleMap = toMap(paint2d(64, 64, (g, w, h) => {
  g.fillStyle = '#0b0c0e'; g.fillRect(0, 0, w, h);
  g.strokeStyle = '#2b2f35'; g.lineWidth = 3;
  for (let i = -h; i < w + h; i += 12) {
    g.beginPath(); g.moveTo(i, 0); g.lineTo(i + h, h); g.stroke();
    g.beginPath(); g.moveTo(i + h, 0); g.lineTo(i, h); g.stroke();
  }
}), { repeatX: 7, repeatY: 2 });

const plateMap = toMap(paint2d(256, 64, (g, w, h) => {
  g.fillStyle = '#f2f3ef'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#1f3f8f'; g.fillRect(0, 0, w * 0.11, h);
  g.fillStyle = '#f2c94c'; g.font = '700 13px system-ui, sans-serif';
  g.textAlign = 'center'; g.fillText('CA', w * 0.055, h * 0.62);
  g.fillStyle = '#15161a'; g.font = '700 34px system-ui, sans-serif';
  g.fillText('7KMB204', w * 0.57, h * 0.72);
  g.strokeStyle = '#9aa0a6'; g.lineWidth = 3; g.strokeRect(2, 2, w - 4, h - 4);
}));

// Metallic-flake roughness: three multiplies material.roughness by this, so the
// low-contrast noise breaks up the clearcoat highlight instead of dulling it.
const flakeMap = toMap(paint2d(96, 96, (g, w, h) => {
  const img = g.createImageData(w, h);
  for (let i = 0; i < w * h; i++) {
    const v = 168 + Math.random() * 58;
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
}), { repeatX: 4, repeatY: 4, srgb: false });

// ---------------------------------------------------------------------------
// Shared materials (paint is per-car, everything else is shared)
// ---------------------------------------------------------------------------
function alloyMaterial(opts) {
  return new THREE.MeshStandardMaterial({
    map: wheelFaceMap(opts), roughness: 0.34, metalness: 0.82,
  });
}
const alloyFace = {
  sport: alloyMaterial({ spokes: 5, twin: true }),
  luxury: alloyMaterial({ spokes: 10, lip: '#dfe3e8', face: '#c8ced6' }),
  suv: alloyMaterial({ spokes: 5, face: '#9aa1aa', lip: '#b0b6bd' }),
};

const MAT = {
  tyre: new THREE.MeshStandardMaterial({ map: treadMap, color: 0xffffff, roughness: 0.92, metalness: 0.0 }),
  glass: new THREE.MeshPhysicalMaterial({
    color: 0x11161c, roughness: 0.045, metalness: 0.25,
    transparent: true, opacity: 0.68, clearcoat: 1, clearcoatRoughness: 0.03,
    side: THREE.DoubleSide, depthWrite: false,
  }),
  trim: new THREE.MeshStandardMaterial({ color: 0x141619, roughness: 0.62, metalness: 0.18 }),
  rubber: new THREE.MeshStandardMaterial({ color: 0x0d0e10, roughness: 0.88, metalness: 0.02 }),
  chrome: new THREE.MeshStandardMaterial({ color: 0xdfe4ea, roughness: 0.09, metalness: 1.0 }),
  grille: new THREE.MeshStandardMaterial({ map: grilleMap, color: 0x8f959c, roughness: 0.5, metalness: 0.7 }),
  plate: new THREE.MeshStandardMaterial({ map: plateMap, roughness: 0.55, metalness: 0.05 }),
  cabin: new THREE.MeshStandardMaterial({ color: 0x24262a, roughness: 0.78, metalness: 0.05 }),
  // Daylight scene: the lens is mostly a dark reflective optic, and only the
  // DRL blade actually emits. Pushing either harder just clips under ACES.
  headlight: new THREE.MeshPhysicalMaterial({
    color: 0x20262e, roughness: 0.06, metalness: 0.35,
    clearcoat: 1, clearcoatRoughness: 0.03, emissive: 0x2b3a4a, emissiveIntensity: 0.5,
  }),
  drl: new THREE.MeshStandardMaterial({
    color: 0xeaf4ff, emissive: 0xd8ecff, emissiveIntensity: 1.4, roughness: 0.2,
  }),
  taillight: new THREE.MeshStandardMaterial({
    color: 0x5c0d0d, emissive: 0xb81810, emissiveIntensity: 0.85, roughness: 0.28,
  }),
};

function paintMaterial(color, metallic = true) {
  return new THREE.MeshPhysicalMaterial({
    color,
    roughnessMap: flakeMap,
    roughness: metallic ? 0.42 : 0.34,
    metalness: metallic ? 0.62 : 0.12,
    clearcoat: 1.0,
    clearcoatRoughness: 0.045,
    envMapIntensity: 1.35,
  });
}

// ---------------------------------------------------------------------------
// Lofted shells
// ---------------------------------------------------------------------------
// A station is a superellipse cross-section in the (z, y) plane: `hw` half
// width, `y0`..`y1` the vertical extent, `yw` the shoulder line where the body
// is widest, and `pt`/`pb` how square the upper and lower halves are.
function ring(st, n) {
  const { hw, y0, y1 } = st;
  const yw = st.yw ?? y0 + (y1 - y0) * 0.58;
  const pt = st.pt ?? 3.4, pb = st.pb ?? 5.5;
  const out = new Float64Array(n * 2);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const ca = Math.cos(a), sa = Math.sin(a);
    const top = sa >= 0;
    const e = 2 / (top ? pt : pb);
    const hh = top ? y1 - yw : yw - y0;
    out[i * 2] = hw * Math.sign(ca) * Math.abs(ca) ** e;
    out[i * 2 + 1] = yw + (top ? 1 : -1) * hh * Math.abs(sa) ** e;
  }
  return out;
}

// Where the flank actually is: the half-width of the lofted shell at (x, y),
// found by inverting the superellipse. Lamps, handles, mirrors and arch rings
// are placed against this rather than against guessed coordinates, which is
// what keeps them flush across three bodies of different width.
function stationAt(stations, x) {
  let i = 0;
  while (i < stations.length - 2 && stations[i + 1].x < x) i++;
  const a = stations[i], b = stations[i + 1];
  const t = Math.max(0, Math.min(1, (x - a.x) / (b.x - a.x)));
  const lerp = (k, d) => (a[k] ?? d) + ((b[k] ?? d) - (a[k] ?? d)) * t;
  const y0 = lerp('y0', 0), y1 = lerp('y1', 1);
  return {
    hw: lerp('hw', 1), y0, y1,
    yw: a.yw !== undefined || b.yw !== undefined ? lerp('yw', y0) : y0 + (y1 - y0) * 0.58,
    pt: lerp('pt', 3.4), pb: lerp('pb', 5.5),
  };
}
function halfWidthAt(stations, x, y) {
  const st = stationAt(stations, x);
  const top = y >= st.yw;
  const hh = Math.max(1e-4, top ? st.y1 - st.yw : st.yw - st.y0);
  const p = top ? st.pt : st.pb;
  const s = Math.min(1, Math.abs(y - st.yw) / hh) ** (p / 2);
  const c = Math.sqrt(Math.max(0, 1 - s * s));
  return st.hw * c ** (2 / p);
}
// The mirror of halfWidthAt: how high the roof is at a given offset from centre.
function topYAt(stations, x, z) {
  const st = stationAt(stations, x);
  const c = Math.min(1, Math.abs(z) / st.hw) ** (st.pt / 2);
  const s = Math.sqrt(Math.max(0, 1 - c * c));
  return st.yw + (st.y1 - st.yw) * s ** (2 / st.pt);
}

// Stitches consecutive stations into quads. Winding: going i→i+1 at the crown
// travels -Z and s→s+1 travels +X, and (+X)×(-Z) = +Y, so (a,c,b)/(b,c,d) puts
// the front face outward; the end caps fan the opposite way from each other.
function loft(stations, { n = 32, split = null } = {}) {
  const S = stations.length;
  const rings = stations.map(st => ring(st, n));
  const pos = [], uv = [];
  for (let s = 0; s < S; s++) {
    const r = rings[s], x = stations[s].x;
    for (let i = 0; i < n; i++) { pos.push(x, r[i * 2 + 1], r[i * 2]); uv.push(i / n, s / (S - 1)); }
  }
  const groups = [[], []];
  for (let s = 0; s < S - 1; s++) {
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const a = s * n + i, b = s * n + j, c = (s + 1) * n + i, d = (s + 1) * n + j;
      const gi = split ? split((stations[s].x + stations[s + 1].x) / 2, ((i + 0.5) / n) * Math.PI * 2) : 0;
      groups[gi].push(a, c, b, b, c, d);
    }
  }
  // End caps, fanned from a centre vertex on each terminal station
  for (const [s, front] of [[0, false], [S - 1, true]]) {
    const r = rings[s], x = stations[s].x;
    let cy = 0, cz = 0;
    for (let i = 0; i < n; i++) { cz += r[i * 2]; cy += r[i * 2 + 1]; }
    const centre = pos.length / 3;
    pos.push(x, cy / n, cz / n); uv.push(0.5, front ? 1 : 0);
    for (let i = 0; i < n; i++) {
      const a = s * n + i, b = s * n + (i + 1) % n;
      groups[split ? 1 : 0].push(...(front ? [centre, b, a] : [centre, a, b]));
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex([...groups[0], ...groups[1]]);
  if (split) {
    geo.clearGroups();
    geo.addGroup(0, groups[0].length, 0);
    geo.addGroup(groups[0].length, groups[1].length, 1);
  }
  geo.computeVertexNormals();
  return geo;
}

// ---------------------------------------------------------------------------
// Part collector — geometries are baked into car space, then merged per material
// so a finished car costs a handful of draw calls instead of thirty.
// ---------------------------------------------------------------------------
function collector() {
  const bins = new Map();
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
  return {
    bins,
    add(geo, key, { x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1 } = {}) {
      e.set(rx, ry, rz, 'YXZ'); q.setFromEuler(e);
      m.compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(sx, sy, sz));
      const g = geo.clone().applyMatrix4(m);
      g.deleteAttribute('uv1'); g.deleteAttribute('normal');
      g.computeVertexNormals();
      if (!bins.has(key)) bins.set(key, []);
      bins.get(key).push(g);
    },
    // Mirrored pair — the same part on both flanks
    pair(geo, key, opts) {
      this.add(geo, key, opts);
      this.add(geo, key, { ...opts, z: -(opts.z ?? 0), ry: -(opts.ry ?? 0), rz: -(opts.rz ?? 0) });
    },
  };
}

const UNIT = {
  box: new THREE.BoxGeometry(1, 1, 1),
  cyl: new THREE.CylinderGeometry(0.5, 0.5, 1, 18),
  disc: new THREE.CircleGeometry(0.5, 24),
  well: new THREE.CircleGeometry(0.5, 22),
};

// ---------------------------------------------------------------------------
// Wheels
// ---------------------------------------------------------------------------
function wheelMesh(spec) {
  const { r, width, style } = spec.wheel;
  const tread = new THREE.CylinderGeometry(r, r, width, 30, 1, true).rotateX(Math.PI / 2);
  const outer = new THREE.CircleGeometry(r, 30).translate(0, 0, width / 2);
  const inner = new THREE.CircleGeometry(r, 30).rotateY(Math.PI).translate(0, 0, -width / 2);
  const geo = mergeGeometries([tread, outer, inner], true);
  const mesh = new THREE.Mesh(geo, [MAT.tyre, alloyFace[style], alloyFace[style]]);
  mesh.castShadow = true;
  return mesh;
}

// ---------------------------------------------------------------------------
// Car assembly
// ---------------------------------------------------------------------------
function assemble(spec, color, metallic) {
  const c = collector();
  const { body, cabin, roofX, wheel, lights, det } = spec;

  c.add(loft(body, { n: 34 }), 'paint');
  // Greenhouse: glass everywhere except the roof panel, which stays body colour
  // (the underside is buried in the body, so it goes to paint as well).
  c.add(loft(cabin, {
    n: 30,
    split: (x, a) =>
      ((a > Math.PI * 0.23 && a < Math.PI * 0.77 && x > roofX[0] && x < roofX[1]) || a > Math.PI) ? 1 : 0,
  }), 'cabinSplit');

  // Every detail below hangs off the shell's own surface rather than a guessed
  // offset, so one set of rules fits all three bodies.
  const noseTip = body[body.length - 1].x, tailTip = body[0].x;
  const flank = (x, y) => halfWidthAt(body, x, y);
  // Nose and tail fittings are pinned to the terminal cross-section and sized as
  // a fraction of it. Searching for the x at which the shell is a given width
  // collapses onto the tip whenever the tip is still broad, which is exactly
  // where a box has nothing to sit against.
  const noseCap = stationAt(body, noseTip), tailCap = stationAt(body, tailTip);
  const capY = (st, f) => st.y0 + (st.y1 - st.y0) * f;

  // Interior, so the glass has something behind it
  const cy0 = cabin[3].y0, seatH = Math.min(0.42, (cabin[3].y1 - cy0) * 0.62);
  const seatZ = cabin[3].hw * 0.45;
  c.add(UNIT.box, 'cabinDark', { x: det.dash, y: cy0 + 0.08, z: 0, sx: 0.30, sy: 0.18, sz: cabin[5].hw * 1.7 });
  for (const sx of [det.seatFront, det.seatRear]) {
    c.pair(UNIT.box, 'cabinDark', { x: sx, y: cy0 - 0.05, z: seatZ, sx: 0.46, sy: 0.14, sz: 0.44 });
    c.pair(UNIT.box, 'cabinDark', { x: sx - 0.24, y: cy0 + seatH * 0.40, z: seatZ, sx: 0.13, sy: seatH, sz: 0.44, rz: 0.2 });
  }

  // The arch openings are carved by the body stations themselves (y0 lifts over
  // each axle), so all that is left here is a dark disc inboard of each wheel to
  // give the opening a wheel well instead of a view straight through the car.
  const wellZ = wheel.z - wheel.width / 2 - 0.008;
  for (const ax of [wheel.front, wheel.rear])
    for (const s of [1, -1])
      c.add(UNIT.well, 'wellDark', { x: ax, y: wheel.r, z: s * wellZ, ry: s > 0 ? 0 : Math.PI, sx: wheel.r * 2.4, sy: wheel.r * 2.4 });

  // Floor pan closing the gap between the arches, then rocker skirt and diffuser
  const midX = (wheel.front + wheel.rear) / 2;
  const sillY = stationAt(body, midX).y0;
  c.add(UNIT.box, 'trim', {
    x: midX, y: sillY, z: 0,
    sx: wheel.front - wheel.rear + wheel.r * 1.4, sy: 0.32, sz: (wheel.z - wheel.width / 2 - 0.03) * 2,
  });
  c.pair(UNIT.box, 'trim', {
    x: midX, y: det.skirtY, z: flank(midX, det.skirtY) - 0.025,
    sx: wheel.front - wheel.rear - wheel.r * 2.6, sy: 0.12, sz: 0.09,
  });
  c.add(UNIT.box, 'trim', { x: tailTip + 0.16, y: det.skirtY - 0.02, z: 0, sx: 0.3, sy: 0.15, sz: tailCap.hw * 1.5 });

  // Lamps ride on the front corners, a little behind the tip where there is
  // still flank to sit against; the DRL blade tucks under each one.
  const hy = Math.min(lights.headY, noseCap.y1 - 0.02);
  const hx = noseTip - 0.18;
  const hz = flank(hx, hy) - 0.10;
  c.pair(UNIT.box, 'headlight', { x: hx, y: hy, z: hz, sx: 0.28, sy: lights.headH, sz: 0.24 });
  c.pair(UNIT.box, 'drl', { x: hx + 0.02, y: hy - lights.headH * 0.75, z: hz + 0.01, sx: 0.22, sy: 0.035, sz: 0.21 });

  // Full-width bar across the tail
  c.add(UNIT.box, 'taillight', {
    x: tailTip - 0.02, y: capY(tailCap, 0.66), z: 0,
    sx: 0.08, sy: lights.tailH, sz: tailCap.hw * 1.56,
  });

  // Grille and the two lower intakes, proud of the nose cap
  const gy = capY(noseCap, 0.44);
  const gH = Math.min(det.grilleH, (noseCap.y1 - noseCap.y0) * 0.42);
  c.add(UNIT.box, 'grille', { x: noseTip + 0.02, y: gy, z: 0, sx: 0.08, sy: gH, sz: noseCap.hw });
  c.pair(UNIT.box, 'grille', {
    x: noseTip + 0.01, y: capY(noseCap, 0.15), z: noseCap.hw * 0.54,
    sx: 0.07, sy: 0.11, sz: noseCap.hw * 0.34,
  });

  // Mirrors sit on the beltline — the widest point of the door, not the flank
  // height, which at the cabin base has already tucked back in to nothing.
  const mSt = stationAt(body, det.mirrorX);
  const mz = mSt.hw - 0.02, my = mSt.y1 - 0.05;
  c.pair(UNIT.box, 'trim', { x: det.mirrorX, y: my, z: mz + 0.05, sx: 0.08, sy: 0.045, sz: 0.12 });
  c.pair(UNIT.box, 'paint', { x: det.mirrorX, y: my + 0.025, z: mz + 0.15, sx: 0.19, sy: 0.085, sz: 0.1, ry: 0.14 });

  // Door handles
  for (const hxx of det.handles)
    c.pair(UNIT.box, 'chrome', { x: hxx, y: det.handleY, z: flank(hxx, det.handleY) - 0.004, sx: 0.17, sy: 0.038, sz: 0.035 });

  // Plates, sat on the bumper faces
  c.add(UNIT.box, 'plate', { x: tailTip - 0.045, y: capY(tailCap, 0.3), z: 0, sx: 0.02, sy: 0.11, sz: 0.38, ry: Math.PI / 2 });
  c.add(UNIT.box, 'plate', { x: noseTip + 0.065, y: gy, z: 0, sx: 0.02, sy: 0.11, sz: 0.38, ry: -Math.PI / 2 });

  // Exhaust tips
  if (det.exhaust) {
    const ex = det.exhaust;
    c.pair(UNIT.cyl, 'chrome', {
      x: tailTip - 0.04, y: capY(tailCap, 0.12), z: tailCap.hw * ex.z,
      rz: Math.PI / 2, sx: ex.r * 2, sy: 0.16, sz: ex.r * 2,
    });
  }

  // Roof rails, sat on the roof's actual height at their own offset from centre
  // Kept to the flat span of the roof; past it the roof falls away and a
  // straight rail would float.
  if (spec.roofRails) {
    const r0 = cabin[2].x, r1 = cabin[4].x;
    const rx = (r0 + r1) / 2, rz = cabin[3].hw * 0.62;
    c.pair(UNIT.box, 'trim', {
      x: rx, y: topYAt(cabin, rx, rz) - 0.01, z: rz, sx: r1 - r0, sy: 0.05, sz: 0.06,
    });
  }

  // ---- bake ----
  const paint = paintMaterial(color, metallic);
  const matFor = {
    paint, cabinDark: MAT.cabin, trim: MAT.trim, chrome: MAT.chrome, wellDark: MAT.rubber,
    grille: MAT.grille, plate: MAT.plate, headlight: MAT.headlight,
    drl: MAT.drl, taillight: MAT.taillight,
  };
  const car = new THREE.Group();
  for (const [key, geos] of c.bins) {
    if (key === 'cabinSplit') continue;
    const mesh = new THREE.Mesh(geos.length > 1 ? mergeGeometries(geos) : geos[0], matFor[key]);
    mesh.castShadow = true;
    mesh.receiveShadow = key === 'paint';
    car.add(mesh);
  }
  // The greenhouse keeps its two groups, so it is added with a material array
  const green = new THREE.Mesh(c.bins.get('cabinSplit')[0], [MAT.glass, paint]);
  green.castShadow = true;
  car.add(green);

  const wheels = [];
  for (const ax of [wheel.front, wheel.rear])
    for (const z of [wheel.z, -wheel.z]) {
      const w = wheelMesh(spec);
      w.position.set(ax, wheel.r, z);
      car.add(w);
      wheels.push(w);
    }

  // Direct properties rather than userData: Object3D.clone() round-trips
  // userData through JSON, which cannot carry mesh references.
  car.wheels = wheels;
  car.wheelRadius = wheel.r;
  return car;
}

// ---------------------------------------------------------------------------
// Profiles
// ---------------------------------------------------------------------------
const SPECS = {
  // Rear-engined coupe: hips over the back axle, fastback roof, low nose.
  coupe: {
    length: 4.55, width: 1.88, height: 1.32,
    // y0 lifts to ~0.47 over each axle: that step is the wheel arch.
    body: [
      { x: -2.25, hw: 0.60, y0: 0.50, y1: 0.86 },
      { x: -2.05, hw: 0.84, y0: 0.40, y1: 0.99 },
      { x: -1.84, hw: 0.92, y0: 0.32, y1: 1.04 },
      { x: -1.74, hw: 0.935, y0: 0.44, y1: 1.06 },
      { x: -1.38, hw: 0.945, y0: 0.47, y1: 1.07 },
      { x: -1.02, hw: 0.935, y0: 0.44, y1: 1.05 },
      { x: -0.92, hw: 0.915, y0: 0.28, y1: 1.03 },
      { x: -0.30, hw: 0.895, y0: 0.26, y1: 0.98 },
      { x: 0.35, hw: 0.895, y0: 0.26, y1: 0.94 },
      { x: 0.88, hw: 0.905, y0: 0.28, y1: 0.92 },
      { x: 0.98, hw: 0.925, y0: 0.44, y1: 0.92 },
      { x: 1.32, hw: 0.935, y0: 0.47, y1: 0.91 },
      { x: 1.66, hw: 0.925, y0: 0.44, y1: 0.90 },
      { x: 1.76, hw: 0.90, y0: 0.30, y1: 0.88 },
      { x: 2.08, hw: 0.82, y0: 0.34, y1: 0.80 },
      { x: 2.28, hw: 0.56, y0: 0.40, y1: 0.68 },
    ],
    cabin: [
      { x: -1.62, hw: 0.30, y0: 0.99, y1: 1.04 },
      { x: -1.35, hw: 0.62, y0: 0.99, y1: 1.14 },
      { x: -0.95, hw: 0.72, y0: 0.99, y1: 1.26 },
      { x: -0.45, hw: 0.755, y0: 0.99, y1: 1.32 },
      { x: 0.05, hw: 0.745, y0: 0.99, y1: 1.31 },
      { x: 0.42, hw: 0.68, y0: 0.99, y1: 1.20 },
      { x: 0.88, hw: 0.52, y0: 0.96, y1: 1.01 },
    ],
    roofX: [-1.30, 0.20],
    wheel: { r: 0.345, width: 0.28, front: 1.32, rear: -1.38, z: 0.795, style: 'sport' },
    lights: { headY: 0.72, headZ: 0.58, headW: 0.30, headH: 0.13, tailY: 0.84, tailH: 0.10 },
    det: {
      grilleY: 0.50, grilleH: 0.15,
      mirrorX: 0.52, mirrorY: 1.02, handles: [-0.35], handleY: 0.90,
      skirtY: 0.34, plateY: 0.52, dash: 0.55, seatFront: 0.05, seatRear: -0.72,
      exhaust: { z: 0.55, r: 0.055 },
    },
    archTrim: false,
  },

  // Long-bonnet saloon: three boxes, upright grille, chrome window surround.
  sedan: {
    length: 5.15, width: 1.92, height: 1.48,
    body: [
      { x: -2.55, hw: 0.66, y0: 0.44, y1: 0.96 },
      { x: -2.32, hw: 0.85, y0: 0.34, y1: 1.04 },
      { x: -1.98, hw: 0.93, y0: 0.28, y1: 1.08 },
      { x: -1.88, hw: 0.945, y0: 0.46, y1: 1.09 },
      { x: -1.50, hw: 0.955, y0: 0.49, y1: 1.10 },
      { x: -1.12, hw: 0.945, y0: 0.46, y1: 1.10 },
      { x: -1.02, hw: 0.925, y0: 0.27, y1: 1.09 },
      { x: -0.30, hw: 0.915, y0: 0.25, y1: 1.08 },
      { x: 0.50, hw: 0.915, y0: 0.25, y1: 1.06 },
      { x: 1.04, hw: 0.925, y0: 0.27, y1: 1.05 },
      { x: 1.14, hw: 0.945, y0: 0.46, y1: 1.04 },
      { x: 1.52, hw: 0.955, y0: 0.49, y1: 1.03 },
      { x: 1.90, hw: 0.945, y0: 0.46, y1: 1.02 },
      { x: 2.00, hw: 0.925, y0: 0.30, y1: 1.01 },
      { x: 2.40, hw: 0.87, y0: 0.32, y1: 0.97 },
      { x: 2.55, hw: 0.60, y0: 0.38, y1: 0.88 },
    ],
    cabin: [
      { x: -1.72, hw: 0.34, y0: 1.05, y1: 1.10 },
      { x: -1.52, hw: 0.66, y0: 1.05, y1: 1.24 },
      { x: -1.10, hw: 0.76, y0: 1.05, y1: 1.40 },
      { x: -0.50, hw: 0.80, y0: 1.05, y1: 1.47 },
      { x: 0.20, hw: 0.79, y0: 1.05, y1: 1.47 },
      { x: 0.62, hw: 0.72, y0: 1.05, y1: 1.34 },
      { x: 1.15, hw: 0.50, y0: 1.02, y1: 1.07 },
    ],
    roofX: [-1.20, 0.34],
    wheel: { r: 0.36, width: 0.26, front: 1.52, rear: -1.50, z: 0.80, style: 'luxury' },
    lights: { headY: 0.80, headZ: 0.62, headW: 0.32, headH: 0.12, tailY: 0.90, tailH: 0.11 },
    det: {
      grilleY: 0.62, grilleH: 0.30,
      mirrorX: 0.72, mirrorY: 1.09, handles: [0.05, -1.00], handleY: 0.95,
      skirtY: 0.33, plateY: 0.55, dash: 0.78, seatFront: 0.30, seatRear: -0.85,
      exhaust: { z: 0.62, r: 0.06 },
    },
    archTrim: false,
  },

  // Full-size SUV: tall glasshouse, squared shoulders, black arch trim, rails.
  suv: {
    length: 5.00, width: 2.00, height: 1.72,
    body: [
      { x: -2.48, hw: 0.74, y0: 0.52, y1: 1.06 },
      { x: -2.28, hw: 0.92, y0: 0.42, y1: 1.14 },
      { x: -1.98, hw: 0.99, y0: 0.36, y1: 1.18 },
      { x: -1.88, hw: 1.00, y0: 0.52, y1: 1.19 },
      { x: -1.48, hw: 1.01, y0: 0.55, y1: 1.19 },
      { x: -1.08, hw: 1.00, y0: 0.52, y1: 1.19 },
      { x: -0.98, hw: 0.985, y0: 0.36, y1: 1.18 },
      { x: -0.30, hw: 0.98, y0: 0.34, y1: 1.18 },
      { x: 0.55, hw: 0.98, y0: 0.34, y1: 1.16 },
      { x: 1.00, hw: 0.985, y0: 0.36, y1: 1.15 },
      { x: 1.10, hw: 1.00, y0: 0.52, y1: 1.14 },
      { x: 1.48, hw: 1.01, y0: 0.55, y1: 1.12 },
      { x: 1.86, hw: 1.00, y0: 0.52, y1: 1.10 },
      { x: 1.96, hw: 0.985, y0: 0.38, y1: 1.09 },
      { x: 2.36, hw: 0.90, y0: 0.42, y1: 1.02 },
      { x: 2.48, hw: 0.66, y0: 0.48, y1: 0.94 },
    ],
    cabin: [
      { x: -1.98, hw: 0.42, y0: 1.15, y1: 1.22 },
      { x: -1.80, hw: 0.76, y0: 1.15, y1: 1.42 },
      { x: -1.30, hw: 0.88, y0: 1.15, y1: 1.62 },
      { x: -0.40, hw: 0.90, y0: 1.15, y1: 1.70 },
      { x: 0.35, hw: 0.89, y0: 1.15, y1: 1.70 },
      { x: 0.85, hw: 0.82, y0: 1.15, y1: 1.56 },
      { x: 1.42, hw: 0.58, y0: 1.12, y1: 1.18 },
    ],
    roofX: [-1.88, 0.48],
    wheel: { r: 0.40, width: 0.30, front: 1.48, rear: -1.48, z: 0.84, style: 'suv' },
    lights: { headY: 0.92, headZ: 0.66, headW: 0.32, headH: 0.14, tailY: 1.00, tailH: 0.12 },
    det: {
      grilleY: 0.74, grilleH: 0.34,
      mirrorX: 0.80, mirrorY: 1.22, handles: [0.10, -1.00], handleY: 1.05,
      skirtY: 0.44, plateY: 0.66, dash: 0.90, seatFront: 0.40, seatRear: -0.75,
      exhaust: { z: 0.62, r: 0.065 },
    },
    archTrim: true,
    roofRails: true,
  },
};

/**
 * Build a car. `type` is 'coupe' | 'sedan' | 'suv'. The group's origin sits on
 * the road surface with +X forward, and its `wheels` roll via `rollCars`.
 */
export function buildCar(type = 'coupe', color = 0x1d222a, { metallic = true } = {}) {
  const spec = SPECS[type];
  if (!spec) throw new Error(`unknown car type: ${type}`);
  return assemble(spec, color, metallic);
}

/** Overall size in metres — the villa uses it to size the collision proxy. */
export function carBounds(type) {
  const { length, width, height } = SPECS[type];
  return { length, width, height };
}

/** Roll every wheel by the distance its car travelled this frame. */
export function rollCars(cars, dt) {
  for (const c of cars) {
    const d = (c.speed * dt) / c.mesh.wheelRadius;
    for (const w of c.mesh.wheels) w.rotation.z -= d;
  }
}
