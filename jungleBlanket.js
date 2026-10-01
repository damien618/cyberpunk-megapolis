// jungleBlanket.js — a wool blanket round the shoulders of the seated
// avatar, its two front edges gathered in her fists at the breastbone: the
// campfire's "rest" pose.
//
// SIMULATED, NOT SKINNED. A small cloth — a grid of particles, Verlet
// integration, distance constraints (structural, shear, a soft bend) — that
// falls under gravity onto the body, read off the rig as capsules (neck,
// chest, belly, the shoulder line, sleeved arms, fists, thighs) plus the log
// she sits on and the sand. The collar rings are pinned to the shoulders, the
// front edges to the fists; everything else hangs, rests where it touches
// (friction) and moves: a sea breeze in gusts pushes on whatever face meets
// it, a ripple runs through the folds, and her breathing lifts the shoulders.
// It starts from a loose drape (the top dropped onto the shoulders, the rest
// hanging from them) and is given a second of settling before it is shown.
// Cost while seated: ~900 particles, 6 passes, one or two sub-steps a frame.
// The sheet is then given a thickness (an inner skin and a border strip),
// and the outermost ring of quads all round is the BINDING — a satin band
// in a second material, as on a real blanket.
//
// The wool is woven, not painted: a tartan sett laid as warp and weft
// threads in a 2/2 twill, with a matching normal map (each thread a little
// cylinder, a fibre noise over it) and a physical SHEEN, which is what
// makes cloth read as cloth when the fire rakes across it.
import * as THREE from 'three';

// ---------------------------------------------------------------------------
// The wool.
// ---------------------------------------------------------------------------
// A muted tartan: madder red ground, charcoal and bottle-green bands, a fine
// ochre and cream overcheck. Thread counts for half the sett; it mirrors.
const SETT = [
  ['r', 28], ['k', 4], ['r', 4], ['k', 14], ['g', 14], ['k', 2], ['y', 2],
  ['k', 2], ['g', 14], ['k', 14], ['r', 4], ['w', 2],
];
const PALETTE = {
  r: [138, 38, 32], k: [34, 30, 30], g: [36, 58, 42], y: [196, 152, 72], w: [214, 200, 172],
};
const THREAD_PX = 2;

function buildWool() {
  const half = [];
  for (const [c, n] of SETT) for (let i = 0; i < n; i++) half.push(c);
  const sett = half.concat(half.slice().reverse());
  const S = sett.length * THREAD_PX;                 // one full sett: the tile
  let seed = 1234567;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  // Per-thread jitter: no two threads dyed quite alike.
  const jit = sett.map(() => 0.9 + rnd() * 0.2);

  const colC = Object.assign(document.createElement('canvas'), { width: S, height: S });
  const nrmC = Object.assign(document.createElement('canvas'), { width: S, height: S });
  const cg = colC.getContext('2d'), ng = nrmC.getContext('2d');
  const col = cg.createImageData(S, S), hgt = new Float32Array(S * S);

  for (let y = 0; y < S; y++) {
    const ty = (y / THREAD_PX) | 0, fy = (y % THREAD_PX + 0.5) / THREAD_PX;
    for (let x = 0; x < S; x++) {
      const tx = (x / THREAD_PX) | 0, fx = (x % THREAD_PX + 0.5) / THREAD_PX;
      // 2/2 twill: warp over two, under two, stepping one each pick.
      const warpUp = ((tx + ty) & 3) < 2;
      const c = PALETTE[warpUp ? sett[tx] : sett[ty]];
      const j = warpUp ? jit[tx] : jit[ty];
      // Each float is a little cylinder: bright on its crown, dark at its
      // sides; the float's length runs along its own thread.
      const across = warpUp ? fx : fy;
      const crown = Math.sin(across * Math.PI);
      const fuzz = 0.86 + rnd() * 0.28;
      const k = j * fuzz * (0.72 + 0.32 * crown);
      const i = (y * S + x) * 4;
      col.data[i] = Math.min(255, c[0] * k);
      col.data[i + 1] = Math.min(255, c[1] * k);
      col.data[i + 2] = Math.min(255, c[2] * k);
      col.data[i + 3] = 255;
      hgt[y * S + x] = crown * 0.8 + rnd() * 0.35;
    }
  }
  // Stray fibres: short, pale, at random angles — the nap of brushed wool.
  cg.putImageData(col, 0, 0);
  cg.lineWidth = 0.6;
  for (let i = 0; i < 1400; i++) {
    const x = rnd() * S, y = rnd() * S, a = rnd() * Math.PI, l = 2 + rnd() * 5;
    cg.strokeStyle = `rgba(255,236,214,${0.05 + rnd() * 0.08})`;
    cg.beginPath(); cg.moveTo(x, y); cg.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); cg.stroke();
  }

  // Height to tangent-space normals, wrapped so the tile stays seamless.
  const nrm = ng.createImageData(S, S);
  const H = (x, y) => hgt[((y + S) % S) * S + ((x + S) % S)];
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const dx = (H(x + 1, y) - H(x - 1, y)) * 1.6, dy = (H(x, y + 1) - H(x, y - 1)) * 1.6;
      const l = Math.hypot(dx, dy, 1);
      const i = (y * S + x) * 4;
      nrm.data[i] = (-dx / l * 0.5 + 0.5) * 255;
      nrm.data[i + 1] = (dy / l * 0.5 + 0.5) * 255;
      nrm.data[i + 2] = (1 / l * 0.5 + 0.5) * 255;
      nrm.data[i + 3] = 255;
    }
  }
  ng.putImageData(nrm, 0, 0);

  const tex = (c, srgb) => {
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    return t;
  };
  return { map: tex(colC, true), normalMap: tex(nrmC, false) };
}

// One sett across this many metres of cloth.
const SETT_M = 0.2;

// ---------------------------------------------------------------------------
// The body, as capsules read off the rig.
// ---------------------------------------------------------------------------
const CAPSULES = [
  // [bone a, bone b (or null: a sphere), radius]
  ['neck_01', 'head', 0.06],
  ['neck_01', 'spine_03', 0.11],
  ['spine_03', 'spine_02', 0.135],
  ['spine_02', 'pelvis', 0.14],
  ['upperarm_l', 'upperarm_r', 0.075],     // the shoulder line
  // Sleeved arms, not bare ones: the long-sleeve top is a good centimetre
  // proud of the skin, and more at the elbow.
  ['upperarm_l', 'lowerarm_l', 0.08],
  ['upperarm_r', 'lowerarm_r', 0.08],
  ['lowerarm_l', 'hand_l', 0.07],
  ['lowerarm_r', 'hand_r', 0.07],
  ['lowerarm_l', null, 0.09],
  ['lowerarm_r', null, 0.09],
  ['hand_l', null, 0.06],
  ['hand_r', null, 0.06],
  ['thigh_l', 'calf_l', 0.085],
  ['thigh_r', 'calf_r', 0.085],
];
const THICK = 0.012;           // the wool's own thickness

function segDist(p, a, b) {
  const abx = b.x - a.x, aby = b.y - a.y, abz = b.z - a.z;
  const l2 = abx * abx + aby * aby + abz * abz;
  let t = l2 > 0 ? ((p.x - a.x) * abx + (p.y - a.y) * aby + (p.z - a.z) * abz) / l2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return Math.hypot(p.x - a.x - abx * t, p.y - a.y - aby * t, p.z - a.z - abz * t);
}

// ---------------------------------------------------------------------------
// The cloth.
// ---------------------------------------------------------------------------
const COLS = 40;               // round the body, edge to edge
const TOP_ROWS = 6;            // lying on the shoulders
const HANG_ROWS = 16;          // hanging from them
const ROWS = TOP_ROWS + HANG_ROWS;
const W = COLS + 1, N = ROWS * W;
const PINNED_ROWS = 3;         // collar and the first rings: held on the shoulders

const STEP = 1 / 60;           // fixed sub-step
const ITER = 6;                // constraint passes per sub-step
const GRAVITY = -9.8;
const DAMP = 0.982;            // heavy wool: it settles, it does not swing
const FRICTION = 0.55;         // how much a touching particle's motion is killed
const MARGIN = THICK + 0.008;  // the sheet's mid-plane keeps this off the body

// Front gap (half-angle from straight ahead) down the rows: a V at the neck,
// shut where the fists are, open again over the lap.
function gapAt(v, vHands) {
  if (v < vHands) return THREE.MathUtils.lerp(0.62, 0.1, Math.pow(v / vHands, 0.8));
  return THREE.MathUtils.lerp(0.1, 0.85, Math.pow((v - vHands) / (1 - vHands), 1.2));
}

// A cheap, smooth gust: the sea breeze freshening and easing.
function gust(t) {
  return 0.55 + 0.25 * Math.sin(t * 0.37) + 0.15 * Math.sin(t * 1.13 + 1.7) + 0.05 * Math.sin(t * 3.1);
}

export function createBlanket(scene) {
  const wool = buildWool();
  const woolMat = new THREE.MeshPhysicalMaterial({
    map: wool.map, normalMap: wool.normalMap, normalScale: new THREE.Vector2(0.5, 0.5),
    roughness: 0.92, metalness: 0,
    sheen: 1, sheenRoughness: 0.55, sheenColor: new THREE.Color(0xe8b8a0),
  });
  const bindMat = new THREE.MeshPhysicalMaterial({
    color: 0x3b1714, roughness: 0.45, metalness: 0,
    sheen: 0.6, sheenRoughness: 0.3, sheenColor: new THREE.Color(0xc87a6a),
  });
  const mesh = new THREE.Mesh(new THREE.BufferGeometry(), [woolMat, bindMat]);
  mesh.name = 'campfire_blanket';
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  mesh.visible = false;
  scene.add(mesh);

  const caps = CAPSULES.map(([a, b, r]) => ({ a, b, r, on: true, pa: new THREE.Vector3(), pb: new THREE.Vector3() }));
  let extras = [];               // world capsules that are not the body (the log)
  let floorY = -Infinity;
  const S = new THREE.Vector3(), P = new THREE.Vector3(), L = new THREE.Vector3(), R = new THREE.Vector3();
  const ax = new THREE.Vector3(), ay = new THREE.Vector3(), az = new THREE.Vector3();
  const hl = new THREE.Vector3(), hr = new THREE.Vector3();
  const q = new THREE.Vector3(), p = new THREE.Vector3();
  const wind = new THREE.Vector3(0.25, 0, 1).normalize();   // off the sea, up the beach

  // The cloth state.
  const x = new Float32Array(N * 3), px = new Float32Array(N * 3), inv = new Float32Array(N);
  const nrm = new Float32Array(N * 3);
  let cons = null, rest = null, stiff = null;
  let pins = [];                 // { i, frame: 'body' | 'l' | 'r', local: Vector3 }
  let ready = false, since = 0, acc = 0, clock = 0, outSign = 1;
  const INIT_AT = 0.25;          // seconds after sitting: the pose has settled

  // ---- the body ------------------------------------------------------------
  function readBody(player) {
    const b = player.bones;
    player.group.updateMatrixWorld(true);
    for (const c of caps) {
      c.on = !!(b[c.a] && (!c.b || b[c.b]));
      if (!c.on) continue;
      b[c.a].getWorldPosition(c.pa);
      if (c.b) b[c.b].getWorldPosition(c.pb);
    }
    b.upperarm_l.getWorldPosition(L);
    b.upperarm_r.getWorldPosition(R);
    b.pelvis.getWorldPosition(P);
    b.hand_l.getWorldPosition(hl);
    b.hand_r.getWorldPosition(hr);
    S.addVectors(L, R).multiplyScalar(0.5);
    ay.subVectors(S, P).normalize();
    ax.subVectors(L, R);
    ax.addScaledVector(ay, -ax.dot(ay)).normalize();
    az.crossVectors(ax, ay).normalize();
  }
  function clearance(pt, extra) {
    let m = Infinity;
    for (const c of caps) {
      if (!c.on) continue;
      const d = (c.b ? segDist(pt, c.pa, c.pb) : pt.distanceTo(c.pa)) - c.r - extra;
      if (d < m) m = d;
    }
    return m;
  }
  const toWorld = (lx, ly, lz, out) => out.copy(S)
    .addScaledVector(ax, lx).addScaledVector(ay, ly).addScaledVector(az, lz);

  // ---- the starting drape --------------------------------------------------
  // Where the cloth starts before gravity has its say: the top dropped onto
  // the shoulders, the rest hanging loosely from them — the sim lets it
  // fall onto the arms, the thighs and the log from there.
  function initialDrape() {
    const shoulderHalf = L.distanceTo(R) * 0.5;
    const torso = S.distanceTo(P);
    const hemY = -torso - 0.12;
    const handY = (q.copy(hl).sub(S).dot(ay) + p.copy(hr).sub(S).dot(ay)) * 0.5;
    const vHands = TOP_ROWS / ROWS + (1 - TOP_ROWS / ROWS) * THREE.MathUtils.clamp(-handY / (-hemY), 0, 1);
    const reach = new Float32Array(W), topY = new Float32Array(W);
    for (let r = 0; r < ROWS; r++) {
      const v = r / (ROWS - 1);
      const gap = gapAt(v, vHands);
      for (let c = 0; c <= COLS; c++) {
        const th = gap + (c / COLS) * (Math.PI * 2 - 2 * gap);
        const sx = Math.sin(th), cz = Math.cos(th) * 0.72;
        if (r < TOP_ROWS) {
          const k = r / (TOP_ROWS - 1);
          const edge = THREE.MathUtils.lerp(0.18, shoulderHalf + 0.1, sx * sx);
          const rho = THREE.MathUtils.lerp(0.085, edge, k);
          let y = 0.32;
          for (; y > -0.25; y -= 0.004) {
            toWorld(sx * rho, y, cz * rho, p);
            if (clearance(p, MARGIN + 0.004) < 0) break;
          }
          y += 0.004 - k * k * 0.03;
          reach[c] = rho; topY[c] = y;
          toWorld(sx * rho, y, cz * rho, p);
        } else {
          const k = (r - TOP_ROWS + 1) / HANG_ROWS;
          const y = THREE.MathUtils.lerp(topY[c] - 0.02, hemY - 0.03 * (1 - Math.cos(th)), k);
          let rho = reach[c];
          toWorld(sx * rho, y, cz * rho, p);
          for (let i = 0; i < 90 && clearance(p, MARGIN + 0.004) < 0; i++) {
            rho += 0.006;
            toWorld(sx * rho, y, cz * rho, p);
          }
          reach[c] = rho;
        }
        x.set([p.x, p.y, p.z], (r * W + c) * 3);
      }
    }
    // Into the fists.
    const fistL = hl.clone().addScaledVector(az, 0.035).addScaledVector(ax, -0.02);
    const fistR = hr.clone().addScaledVector(az, 0.035).addScaledVector(ax, 0.02);
    const rHands = vHands * (ROWS - 1);
    for (let r = 0; r < ROWS; r++) {
      const wr = Math.exp(-Math.pow((r - rHands) / 2.8, 2));
      for (let k = 0; k < 5; k++) {
        const w = wr * Math.exp(-k * 0.6);
        for (const [c, f] of [[k, fistL], [COLS - k, fistR]]) {
          const i = (r * W + c) * 3;
          x[i] += (f.x - x[i]) * w; x[i + 1] += (f.y - x[i + 1]) * w; x[i + 2] += (f.z - x[i + 2]) * w;
        }
      }
    }
    px.set(x);

    // Pins: the collar rings to the body; the edge where it meets the fist.
    pins = [];
    inv.fill(1);
    const local = (i, o) => {
      q.set(x[i * 3] - o.x, x[i * 3 + 1] - o.y, x[i * 3 + 2] - o.z);
      return new THREE.Vector3(q.dot(ax), q.dot(ay), q.dot(az));
    };
    for (let r = 0; r < PINNED_ROWS; r++) {
      for (let c = 0; c <= COLS; c++) {
        const i = r * W + c;
        pins.push({ i, frame: 'body', local: local(i, S), row: r });
        inv[i] = 0;
      }
    }
    const rh = Math.round(rHands);
    for (let r = Math.max(PINNED_ROWS, rh - 1); r <= Math.min(ROWS - 1, rh + 1); r++) {
      for (const [c, side, o] of [[0, 'l', hl], [COLS, 'r', hr]]) {
        const i = r * W + c;
        pins.push({ i, frame: side, local: local(i, o), row: r });
        inv[i] = 0;
      }
    }

    // Constraints: structural, shear and (soft) bend, at their rest lengths.
    const C = [], K = [];
    const add = (a, b, k) => { C.push(a, b); K.push(k); };
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c <= COLS; c++) {
        const i = r * W + c;
        if (c < COLS) add(i, i + 1, 1);
        if (r < ROWS - 1) add(i, i + W, 1);
        if (c < COLS && r < ROWS - 1) { add(i, i + W + 1, 0.6); add(i + 1, i + W, 0.6); }
        if (c < COLS - 1) add(i, i + 2, 0.18);
        if (r < ROWS - 2) add(i, i + 2 * W, 0.18);
      }
    }
    cons = Int32Array.from(C);
    stiff = Float32Array.from(K);
    rest = new Float32Array(K.length);
    for (let k = 0; k < K.length; k++) {
      const a = cons[2 * k] * 3, b = cons[2 * k + 1] * 3;
      // Structural links a touch short: the wool hangs taut-ish from the
      // shoulders instead of sagging into a sack.
      rest[k] = Math.hypot(x[a] - x[b], x[a + 1] - x[b + 1], x[a + 2] - x[b + 2]) * (K[k] === 1 ? 0.97 : 1);
    }
  }

  // ---- one sub-step ----------------------------------------------------------
  function placePins(t) {
    // Breathing: a slow 4 s rise and fall of the shoulders, ~4 mm.
    const breath = Math.sin(t * Math.PI * 2 / 4.2) * 0.004;
    for (const pin of pins) {
      const o = pin.frame === 'body' ? S : pin.frame === 'l' ? hl : hr;
      p.copy(o).addScaledVector(ax, pin.local.x).addScaledVector(ay, pin.local.y + breath)
        .addScaledVector(az, pin.local.z);
      const i = pin.i * 3;
      px[i] = x[i]; px[i + 1] = x[i + 1]; px[i + 2] = x[i + 2];
      x[i] = p.x; x[i + 1] = p.y; x[i + 2] = p.z;
    }
  }

  function step(t) {
    const g = gust(t);
    const h2 = STEP * STEP;
    for (let i = 0; i < N; i++) {
      if (!inv[i]) continue;
      const j = i * 3;
      // Wind pushes on the face it meets: |n·w| × the gust, with a ripple
      // travelling through the cloth so the folds do not all breathe at once.
      const nw = Math.abs(nrm[j] * wind.x + nrm[j + 1] * wind.y + nrm[j + 2] * wind.z);
      const ripple = 0.6 + 0.4 * Math.sin(t * 3.3 - x[j + 2] * 9 + x[j] * 7 + x[j + 1] * 5);
      const f = 1.6 * g * nw * ripple;
      const vx = (x[j] - px[j]) * DAMP, vy = (x[j + 1] - px[j + 1]) * DAMP, vz = (x[j + 2] - px[j + 2]) * DAMP;
      px[j] = x[j]; px[j + 1] = x[j + 1]; px[j + 2] = x[j + 2];
      x[j] += vx + wind.x * f * h2;
      x[j + 1] += vy + GRAVITY * h2;
      x[j + 2] += vz + wind.z * f * h2;
    }
    placePins(t);
    for (let it = 0; it < ITER; it++) {
      for (let k = 0, n = stiff.length; k < n; k++) {
        const a = cons[2 * k], b = cons[2 * k + 1];
        const wa = inv[a], wb = inv[b], ws = wa + wb;
        if (!ws) continue;
        const ia = a * 3, ib = b * 3;
        const dx = x[ib] - x[ia], dy = x[ib + 1] - x[ia + 1], dz = x[ib + 2] - x[ia + 2];
        const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (len < 1e-7) continue;
        const s = (len - rest[k]) / len * stiff[k] / ws;
        x[ia] += dx * s * wa; x[ia + 1] += dy * s * wa; x[ia + 2] += dz * s * wa;
        x[ib] -= dx * s * wb; x[ib + 1] -= dy * s * wb; x[ib + 2] -= dz * s * wb;
      }
      if (it === 1 || it === ITER - 1) collide();
    }
  }

  // Out of every capsule along the shortest way; friction kills the motion
  // of whatever is touching, so the wool rests on the shoulders and the log
  // instead of sliding off them.
  const cp = new THREE.Vector3();
  function pushOut(j, a, b, rad) {
    let cx, cy, cz;
    if (b) {
      const abx = b.x - a.x, aby = b.y - a.y, abz = b.z - a.z;
      const l2 = abx * abx + aby * aby + abz * abz;
      let tt = l2 > 0 ? ((x[j] - a.x) * abx + (x[j + 1] - a.y) * aby + (x[j + 2] - a.z) * abz) / l2 : 0;
      tt = tt < 0 ? 0 : tt > 1 ? 1 : tt;
      cx = a.x + abx * tt; cy = a.y + aby * tt; cz = a.z + abz * tt;
    } else { cx = a.x; cy = a.y; cz = a.z; }
    const dx = x[j] - cx, dy = x[j + 1] - cy, dz = x[j + 2] - cz;
    const d2 = dx * dx + dy * dy + dz * dz;
    if (d2 >= rad * rad) return;
    const d = Math.sqrt(d2) || 1e-6;
    const k = rad / d;
    x[j] = cx + dx * k; x[j + 1] = cy + dy * k; x[j + 2] = cz + dz * k;
    px[j] += (x[j] - px[j]) * FRICTION;
    px[j + 1] += (x[j + 1] - px[j + 1]) * FRICTION;
    px[j + 2] += (x[j + 2] - px[j + 2]) * FRICTION;
  }
  function collide() {
    for (let i = 0; i < N; i++) {
      if (!inv[i]) continue;
      const j = i * 3;
      for (const c of caps) if (c.on) pushOut(j, c.pa, c.b ? c.pb : null, c.r + MARGIN);
      for (const e of extras) pushOut(j, e.a, e.b, e.r + MARGIN);
      if (x[j + 1] < floorY + MARGIN) {
        x[j + 1] = floorY + MARGIN;
        px[j] += (x[j] - px[j]) * FRICTION; px[j + 2] += (x[j + 2] - px[j + 2]) * FRICTION;
      }
    }
  }

  // ---- render geometry -------------------------------------------------------
  // Built once (index, groups, UVs); positions and normals rewritten per frame.
  // Outer skin [0, N), inner skin [N, 2N), then the border strip, 4 per edge.
  let ring = null, geo = null, posAttr = null, nrmAttr = null;
  function gridNormals() {
    const t1 = [0, 0, 0], t2 = [0, 0, 0];
    for (let r = 0; r < ROWS; r++) {
      const r0 = Math.max(0, r - 1), r1 = Math.min(ROWS - 1, r + 1);
      for (let c = 0; c <= COLS; c++) {
        const c0 = Math.max(0, c - 1), c1 = Math.min(COLS, c + 1);
        const a = (r * W + c1) * 3, b = (r * W + c0) * 3, d = (r1 * W + c) * 3, e = (r0 * W + c) * 3;
        t1[0] = x[a] - x[b]; t1[1] = x[a + 1] - x[b + 1]; t1[2] = x[a + 2] - x[b + 2];
        t2[0] = x[d] - x[e]; t2[1] = x[d + 1] - x[e + 1]; t2[2] = x[d + 2] - x[e + 2];
        let nx = t2[1] * t1[2] - t2[2] * t1[1], ny = t2[2] * t1[0] - t2[0] * t1[2], nz = t2[0] * t1[1] - t2[1] * t1[0];
        const l = Math.hypot(nx, ny, nz) || 1;
        const j = (r * W + c) * 3;
        nrm[j] = nx / l * outSign; nrm[j + 1] = ny / l * outSign; nrm[j + 2] = nz / l * outSign;
      }
    }
  }
  function buildGeometry() {
    // Which way is out: the sign that points most normals away from the axis.
    outSign = 1;
    gridNormals();
    let vote = 0;
    for (let i = 0; i < N; i++) {
      const j = i * 3;
      q.set(x[j] - S.x, x[j + 1] - S.y, x[j + 2] - S.z);
      q.addScaledVector(ay, -q.dot(ay));
      vote += nrm[j] * q.x + nrm[j + 1] * q.y + nrm[j + 2] * q.z;
    }
    outSign = vote < 0 ? -1 : 1;
    gridNormals();

    ring = [];
    for (let c = 0; c <= COLS; c++) ring.push(c);
    for (let r = 1; r < ROWS; r++) ring.push(r * W + COLS);
    for (let c = COLS - 1; c >= 0; c--) ring.push((ROWS - 1) * W + c);
    for (let r = ROWS - 2; r > 0; r--) ring.push(r * W);
    const total = 2 * N + ring.length * 4;

    // UVs in metres along the cloth, from the back's centre line.
    const uv = new Float32Array(total * 2);
    const dist = (a, b) => Math.hypot(x[a * 3] - x[b * 3], x[a * 3 + 1] - x[b * 3 + 1], x[a * 3 + 2] - x[b * 3 + 2]);
    for (let c = 0; c <= COLS; c++) {
      let d = 0;
      for (let r = 0; r < ROWS; r++) {
        if (r) d += dist(r * W + c, (r - 1) * W + c);
        uv[(r * W + c) * 2 + 1] = d / SETT_M;
      }
    }
    const mid = COLS / 2;
    for (let r = 0; r < ROWS; r++) {
      let d = 0;
      for (let c = mid; c <= COLS; c++) {
        if (c > mid) d += dist(r * W + c, r * W + c - 1);
        uv[(r * W + c) * 2] = d / SETT_M;
      }
      d = 0;
      for (let c = mid - 1; c >= 0; c--) {
        d -= dist(r * W + c, r * W + c + 1);
        uv[(r * W + c) * 2] = d / SETT_M;
      }
    }
    for (let i = 0; i < N; i++) {
      uv[(N + i) * 2] = uv[i * 2] * 0.97;
      uv[(N + i) * 2 + 1] = uv[i * 2 + 1] * 0.97;
    }

    const idxWool = [], idxBind = [];
    for (let r = 0; r < ROWS - 1; r++) {
      for (let c = 0; c < COLS; c++) {
        const a = r * W + c, b = a + 1, cc = a + W, d = cc + 1;
        const edge = r === 0 || r === ROWS - 2 || c === 0 || c === COLS - 1;
        const list = edge ? idxBind : idxWool;
        if (outSign > 0) {
          list.push(a, cc, b, b, cc, d);
          list.push(N + a, N + b, N + cc, N + b, N + d, N + cc);
        } else {
          list.push(a, b, cc, b, d, cc);
          list.push(N + a, N + cc, N + b, N + b, N + cc, N + d);
        }
      }
    }
    for (let k = 0; k < ring.length; k++) {
      const base = 2 * N + k * 4;
      // Both windings: the strip is 1 cm wide, and two-sided is cheaper than
      // getting its orientation right at every corner.
      idxBind.push(base, base + 2, base + 1, base + 1, base + 2, base + 3);
      idxBind.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
    }

    geo = new THREE.BufferGeometry();
    posAttr = new THREE.BufferAttribute(new Float32Array(total * 3), 3);
    nrmAttr = new THREE.BufferAttribute(new Float32Array(total * 3), 3);
    posAttr.setUsage(THREE.DynamicDrawUsage);
    nrmAttr.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', posAttr);
    geo.setAttribute('normal', nrmAttr);
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setIndex(idxWool.concat(idxBind));
    geo.addGroup(0, idxWool.length, 0);
    geo.addGroup(idxWool.length, idxBind.length, 1);
    mesh.geometry.dispose();
    mesh.geometry = geo;
  }

  function writeGeometry() {
    gridNormals();
    const P = posAttr.array, Nn = nrmAttr.array;
    for (let i = 0; i < N; i++) {
      const j = i * 3, k = (N + i) * 3;
      P[j] = x[j]; P[j + 1] = x[j + 1]; P[j + 2] = x[j + 2];
      Nn[j] = nrm[j]; Nn[j + 1] = nrm[j + 1]; Nn[j + 2] = nrm[j + 2];
      P[k] = x[j] - nrm[j] * THICK; P[k + 1] = x[j + 1] - nrm[j + 1] * THICK; P[k + 2] = x[j + 2] - nrm[j + 2] * THICK;
      Nn[k] = -nrm[j]; Nn[k + 1] = -nrm[j + 1]; Nn[k + 2] = -nrm[j + 2];
    }
    for (let k = 0; k < ring.length; k++) {
      const i1 = ring[k], i2 = ring[(k + 1) % ring.length];
      const base = (2 * N + k * 4) * 3;
      // Across the edge: the cloth's normal crossed with the edge direction.
      const ex = x[i2 * 3] - x[i1 * 3], ey = x[i2 * 3 + 1] - x[i1 * 3 + 1], ez = x[i2 * 3 + 2] - x[i1 * 3 + 2];
      const nx = nrm[i1 * 3], ny = nrm[i1 * 3 + 1], nz = nrm[i1 * 3 + 2];
      let sx = ey * nz - ez * ny, sy = ez * nx - ex * nz, sz = ex * ny - ey * nx;
      const l = Math.hypot(sx, sy, sz) || 1; sx /= l; sy /= l; sz /= l;
      let o = base;
      for (const [i, inner] of [[i1, 0], [i2, 0], [i1, 1], [i2, 1]]) {
        const t = inner ? THICK : 0;
        P[o] = x[i * 3] - nrm[i * 3] * t; P[o + 1] = x[i * 3 + 1] - nrm[i * 3 + 1] * t; P[o + 2] = x[i * 3 + 2] - nrm[i * 3 + 2] * t;
        Nn[o] = sx; Nn[o + 1] = sy; Nn[o + 2] = sz;
        o += 3;
      }
    }
    posAttr.needsUpdate = true;
    nrmAttr.needsUpdate = true;
    geo.computeBoundingSphere();
  }

  // Call after player.update, every frame while seated. `t` is the game's
  // clock (for the wind).
  function fit(player, dt = 0, t = 0) {
    if (!mesh.visible || !player?.bones?.pelvis) return;
    since += dt;
    if (!ready) {
      if (since < INIT_AT) return;
      readBody(player);
      initialDrape();
      buildGeometry();
      // Let it fall before anyone sees it: a second of settling, once.
      clock = t;
      for (let k = 0; k < 60; k++) step(clock + k * STEP);
      ready = true;
      writeGeometry();
      return;
    }
    readBody(player);
    acc = Math.min(acc + dt, STEP * 2);
    while (acc >= STEP) {
      clock += STEP;
      step(clock);
      acc -= STEP;
    }
    writeGeometry();
  }

  return {
    mesh,
    // extra: { capsules: [{ a, b, r }] in world space, floorY } — what the
    // hem can rest on besides the body.
    show(on, extra = {}) {
      mesh.visible = on;
      ready = false; since = 0; acc = 0;
      extras = extra.capsules || [];
      floorY = extra.floorY ?? -Infinity;
      if (on) { mesh.geometry.dispose(); mesh.geometry = new THREE.BufferGeometry(); }
    },
    fit,
    get ready() { return ready; },
  };
}
