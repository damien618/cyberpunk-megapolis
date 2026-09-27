// jungleLayout.js — the plan of "Promenade tropicale — la cascade".
//
// This is a cove on the island the liner passes in main-CRUISE.js, so the map
// is read the same way as the L.A. beach: the sea is -Z, inland is +Z, and you
// walk the whole thing by heading +Z from the water to the waterfall.
//
//   open sea → wade barrier → cove & jetty → sandy beach → forest edge
//            → forest (the path climbs gently) → plunge pool → cliff & falls
//            → plateau and volcanic peaks (backdrop, out of bounds)
//
// Everything here is a PURE FUNCTION of (x, z): no THREE, no scene, no DOM.
// The terrain mesh, the ground probe, the vegetation scatter, the foam and
// the fog all ask this module the same questions, so they cannot disagree —
// and tests/jungle_layout.mjs can check the numbers under plain node.
// ---------------------------------------------------------------------------

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export function smoothstep(x, a, b) {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}
const lerp = (a, b, t) => a + (b - a) * t;

// ---------------------------------------------------------------------------
// Plan constants (metres).
// ---------------------------------------------------------------------------
export const SEA_Y = 0;
export const SHORE_Z = -22;          // mean waterline at the cove's horns
export const COVE_BOW = 6;           // how far the water pushes inland mid-cove
export const WADE_Z = -38;           // invisible barrier, ~0.8–1.2 m of water
export const SAND_END = 12;          // top of the beach, where the forest starts
export const SAND_TOP = 2.2;         // sand height at SAND_END
export const CLIFF_Z = 152;          // foot of the cliff, mid-map
export const CLIFF_TOP = 30;         // plateau at the lip of the falls
export const PLAY_HALF_W = 80;       // side walls, |x|
export const RIDGE_X = 66;           // side ridges start climbing here

// Plunge pool. Water level is a constant rather than "whatever the ground
// does": a pool is flat, and the waterfall, the mist and the wading test all
// need to agree on one number.
export const POOL = { x: 22, z: 141, r: 11, waterY: 10.0, depth: 0.85 };
// The lip of the falls, straight above the back of the pool.
export const FALLS = { x: 22, z: CLIFF_Z + 2.5, topY: CLIFF_TOP, width: 7 };

// Landing jetty for the liner's tender. Deck height is set so the step off
// the sand at its root stays under the controller's 0.5 m STEP_H.
export const JETTY = { x: -40, z0: -6, z1: -34, halfW: 1.6, deckY: 0.85 };

// ---------------------------------------------------------------------------
// Shoreline. The cove bows inland in the middle, and no two stretches of it
// repeat: a slow asymmetry between the horns, a mid-scale wiggle and the old
// fine line ride on the bow. The foam and the wet band read signed distance
// from this curve, never height (see the beach's note), and the layout tests
// hold its range so the water at the wade barrier stays wadeable.
// ---------------------------------------------------------------------------
export function shoreAt(x) {
  return SHORE_Z
    + COVE_BOW * Math.cos(clamp(x / 120, -1, 1) * Math.PI / 2)
    + Math.sin(x * 0.011 + 4.2) * 1.3
    + Math.sin(x * 0.032 + 0.6) * 0.9
    + Math.sin(x * 0.041) * 1.2;
}

// ---------------------------------------------------------------------------
// The promenade path. Catmull-Rom through hand-placed points, sampled once
// into a polyline. It keeps west of the stream the whole way, so the skeleton
// needs no bridge.
// ---------------------------------------------------------------------------
export const PATH_POINTS = [
  [-8, -8], [-10, 6], [-16, 22], [-6, 40], [-14, 60], [-20, 78],
  [-10, 96], [-14, 112], [-2, 124], [8, 133],
];
export const PATH_HALF_W = 1.4;
export const PATH = (() => {
  const P = PATH_POINTS;
  const out = [];
  for (let i = 0; i < P.length - 1; i++) {
    const p0 = P[Math.max(0, i - 1)], p1 = P[i], p2 = P[i + 1], p3 = P[Math.min(P.length - 1, i + 2)];
    const n = 12;
    for (let k = 0; k < n; k++) {
      const t = k / n, t2 = t * t, t3 = t2 * t;
      const f = (a, b, c, d) => 0.5 * ((2 * b) + (-a + c) * t
        + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  out.push(P[P.length - 1].slice());
  return out;
})();
// Cumulative length, for the ribbon's UVs.
export const PATH_LEN = (() => {
  const L = [0];
  for (let i = 1; i < PATH.length; i++)
    L.push(L[i - 1] + Math.hypot(PATH[i][0] - PATH[i - 1][0], PATH[i][1] - PATH[i - 1][1]));
  return L;
})();

// Distance from (x, z) to the path polyline, plus the arc length of the
// nearest point (the ribbon's UVs need it, and so does the corridor carve),
// and — in the shared scratch — the nearest segment and its parameter, so
// the corridor can interpolate the trail's own profile without a second
// scan. A bounding test first, because the terrain asks this for ~40 000
// vertices and most are nowhere near it. pathDistance wraps it without
// allocating.
export function pathFrame(x, z, out) {
  if (z < -20 || z > 145 || x < -40 || x > 30) {
    if (out) { out.d = 99; out.s = 0; out.i = 0; out.t = 0; return out; }
    return { d: 99, s: 0 };
  }
  let best = 1e9, bestS = 0, bestI = 0, bestT = 0;
  for (let i = 0; i < PATH.length - 1; i++) {
    const [ax, az] = PATH[i], [bx, bz] = PATH[i + 1];
    const dx = bx - ax, dz = bz - az;
    const t = clamp(((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz), 0, 1);
    const d = Math.hypot(x - ax - dx * t, z - az - dz * t);
    if (d < best) {
      best = d; bestS = PATH_LEN[i] + (PATH_LEN[i + 1] - PATH_LEN[i]) * t;
      bestI = i; bestT = t;
    }
  }
  if (out) {
    out.d = best; out.s = bestS; out.i = bestI; out.t = bestT;
    return out;
  }
  return { d: best, s: bestS };
}
const _pf = { d: 0, s: 0, i: 0, t: 0 };
export function pathDistance(x, z) {
  return pathFrame(x, z, _pf).d;
}

// ---------------------------------------------------------------------------
// The stream: out of the front of the pool, east of the path, down to the
// sea across the beach.
// ---------------------------------------------------------------------------
export const STREAM_Z0 = POOL.z - POOL.r + 1;   // leaves the pool here
export function streamX(z) {
  return 30 + 7 * Math.sin((STREAM_Z0 - z) * 0.034) + 3 * Math.sin(z * 0.09);
}
export const STREAM_HALF_W = 1.8;
export function streamDistance(x, z) {
  if (z > STREAM_Z0 + 2) return 99;
  return Math.abs(x - streamX(z));
}

// ---------------------------------------------------------------------------
// Terrain.
// ---------------------------------------------------------------------------
// The forest floor's mean slope: SAND_TOP at the edge of the beach up to the
// foot of the cliff. About 7 %, which the path can take head-on. The hills
// below ride on it; the path profile flattens its own corridor later.
function forestBase(z) {
  return SAND_TOP + (Math.max(z, SAND_END) - SAND_END) / (CLIFF_Z - SAND_END) * 9.5;
}

// The cliff line. It steps back behind the pool so the falls land in the
// water, and wanders elsewhere so it is not a ruled wall.
export function cliffZ(x) {
  const wander = Math.sin(x * 0.07) * 3 + Math.sin(x * 0.023 + 1) * 4;
  // Pinned to CLIFF_Z behind the pool, so the lip sits over the water.
  return CLIFF_Z + wander * (1 - Math.exp(-(((x - POOL.x) / 16) ** 2)));
}
// The face runs from cliffZ - CLIFF_FOOT to cliffZ + CLIFF_LIP.
export const CLIFF_FOOT = 1.5, CLIFF_LIP = 2.5;

// Where the falls actually land: just off the cliff's foot, which the layout
// pins over the pool's back half. The plunge pool scoops deepest here.
export const POOL_IMPACT = { x: FALLS.x, z: cliffZ(FALLS.x) - CLIFF_FOOT };

// 0 in the valley, 1 up on the side ridges.
export function ridgeAt(x) {
  return smoothstep(Math.abs(x), RIDGE_X, RIDGE_X + 36);
}

// Small relief on the forest floor, damped on the path, the stream and the
// beach so none of them grows lumps.
function floorNoise(x, z) {
  return Math.sin(x * 0.11 + z * 0.03) * 0.7 + Math.cos(z * 0.13 - x * 0.05) * 0.55
    + Math.sin((x + z) * 0.27) * 0.18;
}

// Broad, soft hills under the forest — the eye reads them as a ground swell,
// not as bumps: wavelengths 55–140 m, so the mesh's 2.5 m cells resolve them
// with room to spare, and the same damps as the fine noise keep the path,
// the stream and the beach free of them.
function hillNoise(x, z) {
  return Math.sin(x * 0.045 + 1.7) * Math.cos(z * 0.052 - 0.4) * 2.2
    + Math.sin(x * 0.083 - z * 0.061 + 2.9) * 1.1
    + Math.sin((x * 0.5 + z) * 0.11 + 0.8) * 0.7;
}

// ---------------------------------------------------------------------------
// The trail's own corridor. A real path is a line of consistent grade cut
// slightly below the ground around it, with the spoil heaped at its edges.
// The profile is forestBase sampled along PATH — the hills are already
// damped off the tread, so the profile IS the trail's grade — and the
// corridor blends the terrain toward it: a hand's width of cut at the
// centre, low spoil berms just outside the tread, both fading by
// PATH_CARVE_W and fading in over the first metres of forest.
// ---------------------------------------------------------------------------
const PATH_CARVE_W = PATH_HALF_W + 2.1;   // corridor half width
const PATH_CUT = 0.12;                    // tread below grade
const PATH_BERM = 0.16;                   // spoil heap height
const PATH_BERM_AT = PATH_HALF_W + 0.7;   // where the spoil sits
const PATH_PROFILE = PATH.map(([, z]) => forestBase(z));

function pathCorridor(x, z, y, pf) {
  if (pf.d >= PATH_CARVE_W) return y;
  const a = PATH_PROFILE[pf.i], b = PATH_PROFILE[pf.i + 1];
  const bank = a + (b - a) * pf.t;
  const tread = 1 - smoothstep(pf.d, 0, PATH_CARVE_W);
  const fade = smoothstep(z, SAND_END, SAND_END + 3);
  const cut = PATH_CUT * Math.exp(-(pf.d * pf.d) / (PATH_HALF_W * PATH_HALF_W));
  const berm = PATH_BERM * Math.exp(-((pf.d - PATH_BERM_AT) ** 2) / 0.8);
  return y + (bank - y) * tread + (berm - cut) * tread * fade;
}

// Everything except the two cuts (stream bed, pool bowl). Split out because
// the stream's bed is derived FROM this ground, and must not feed on itself.
function uncutHeight(x, z) {
  const shore = shoreAt(x);
  let y;
  if (z < shore) {
    // Sea bed: a wading shelf that keeps falling away past the barrier.
    const d = shore - z;
    y = SEA_Y - (d * 0.034 + (d / 40) ** 2 * 1.9);
    if (d > 60) y -= (d - 60) * 0.12;
  } else if (z < SAND_END) {
    // Beach: a near-flat swash shelf at the waterline, then a gentle concave
    // rise — the profile water actually lays down — with low cusps scalloping
    // along it, faded at both ends so the jetty root and the forest edge keep
    // their heights.
    const t = (z - shore) / (SAND_END - shore);
    const SWASH = 0.18;
    const shelf = SWASH * SAND_TOP;
    if (t < SWASH) {
      y = SEA_Y + shelf * smoothstep(t / SWASH, 0, 1);
    } else {
      const u = (t - SWASH) / (1 - SWASH);
      y = SEA_Y + shelf + (SAND_TOP - shelf) * (u * u * 0.5 + u * 0.5);
    }
    // Cusps scalloping along the beach — calmed around the jetty root so the
    // step off the planks stays under the controller's STEP_H.
    const calm = smoothstep(Math.abs(x - JETTY.x), 3, 9);
    y += Math.sin(x * 0.16 + Math.cos(x * 0.021) * 1.7) * 0.14 * t * (1 - t) * 4 * calm;
  } else {
    y = forestBase(z);
    const pf = pathFrame(x, z, _pf);
    const damp = smoothstep(z, SAND_END, SAND_END + 14)
      * smoothstep(pf.d, PATH_HALF_W + 0.5, PATH_HALF_W + 6)
      * smoothstep(streamDistance(x, z), STREAM_HALF_W + 1, STREAM_HALF_W + 6);
    y += (hillNoise(x, z) + floorNoise(x, z)) * damp;
    y = pathCorridor(x, z, y, pf);
  }

  // Cliff and plateau. The face is a short concave ramp so nothing reads it
  // as a hill; a lumpy talus of scree spills from its foot; and behind the
  // falls the lip is notched into an alcove the sheet pours out of. Steep
  // enough that the ground probe cannot climb it, and backed by invisible
  // walls either way.
  const cz = cliffZ(x);
  const w = z - cz;
  // Scree at the foot, fading out around the falls' own slot so the pool's
  // cliff-side rim stays clean rock.
  if (w < -0.5) {
    const apron = smoothstep(w, -5.5, -2.5) * (1 - smoothstep(w, -2.5, -1));
    if (apron > 0) {
      const slot = smoothstep(Math.abs(x - POOL.x), FALLS.width * 0.5 + 1, FALLS.width * 0.5 + 5);
      y += apron * slot * (1.1 + 0.5 * Math.sin(x * 0.31) + 0.4 * Math.sin(x * 0.17 + 2.0));
    }
  }
  const up = smoothstep(w, -CLIFF_FOOT, CLIFF_LIP);
  if (up > 0) {
    const plateau = CLIFF_TOP + Math.max(0, w - 20) * 0.35
      + Math.sin(x * 0.02) * 6 * smoothstep(w, 20, 80)
      + 90 * Math.exp(-(((x + 60) / 120) ** 2) - (((z - 380) / 110) ** 2));
    // Concave face: slow off the talus, steep under the lip.
    const face = Math.pow(up, 1.3);
    // The notch the falls pour through: the lip and the channel behind it
    // are lowered TOGETHER, so the bed is level up to the edge. A hollow
    // just behind the lip (the first version, 2.2 m deep at w = 5) left the
    // lip standing a metre above its own channel — water would have had to
    // climb out of the dip to fall.
    const alcove = (1 - smoothstep(Math.abs(x - FALLS.x), 2.5, 6))
      * smoothstep(w, 0.5, CLIFF_LIP) * 0.6;
    y = lerp(y, plateau - alcove, face);
  }

  // Side ridges close the valley, and run on into the sea as headlands.
  const rf = ridgeAt(x);
  if (rf > 0) {
    y += rf * (26 + Math.sin(z * 0.045) * 5 + Math.cos(x * 0.09 + z * 0.02) * 3)
      * (1 - smoothstep(-z, 30, 90));
  }

  // The pool sits on a terrace. The forest floor at its front is at water
  // level give or take the noise, so without this the pool had no front rim
  // and the water plane surfaced through the undergrowth.
  const pr = Math.hypot(x - POOL.x, z - POOL.z);
  if (pr < POOL.r + 8) {
    y = Math.max(y, lerp(POOL.waterY + 0.6, y, smoothstep(pr, POOL.r + 1.5, POOL.r + 8)));
  }
  return y;
}

// The stream bed along its centreline, sampled every half metre from the
// pool down to the sea as a RUNNING MINIMUM, so the water can never be asked
// to run uphill wherever the forest floor has a bump.
const STREAM_STEP = 0.5;
const STREAM_BED = (() => {
  const bed = [];
  let lo = POOL.waterY - 0.55;
  for (let z = STREAM_Z0; z > SHORE_Z - 30; z -= STREAM_STEP) {
    lo = Math.min(lo, uncutHeight(streamX(z), z) - 0.85);
    bed.push(lo);
  }
  return bed;
})();
function streamBedAt(z) {
  const f = (STREAM_Z0 - z) / STREAM_STEP;
  const i = Math.max(0, Math.min(STREAM_BED.length - 2, Math.floor(f)));
  return lerp(STREAM_BED[i], STREAM_BED[i + 1], clamp(f - i, 0, 1));
}

export function terrainHeight(x, z) {
  let y = uncutHeight(x, z);

  // Stream bed.
  const sd = streamDistance(x, z);
  if (sd < STREAM_HALF_W + 3) {
    // Faded out on the sea bed: the channel spills into the cove, it does
    // not dredge a trench out to the wade barrier.
    const shore = shoreAt(x);
    const fade = smoothstep(z, shore - 8, shore);
    if (fade > 0) {
      const cut = lerp(streamBedAt(z), y, smoothstep(sd, STREAM_HALF_W * 0.45, STREAM_HALF_W + 3));
      y = Math.min(y, lerp(y, cut, fade));
    }
  }

  // Plunge pool, cut last so nothing above fills it in again. The bowl is
  // scooped deepest where the falls land and shallows toward the stream
  // outlet, the way a real plunge pool wears itself.
  const pr = Math.hypot(x - POOL.x, z - POOL.z);
  if (pr < POOL.r + 2) {
    const scoop = 0.9 * (1 - smoothstep(Math.hypot(x - POOL_IMPACT.x, z - POOL_IMPACT.z), 0, 5.5));
    const floor = POOL.waterY - POOL.depth - scoop;
    const bowl = lerp(floor, POOL.waterY + 0.9, smoothstep(pr, POOL.r * 0.55, POOL.r + 2));
    y = Math.min(y, bowl);
  }
  return y;
}

// Height of the stream's water surface: a steady depth over a bed that only
// ever falls, capped by the pool it leaves and floored by the sea.
export function streamWaterY(z) {
  return Math.max(SEA_Y + 0.04, Math.min(POOL.waterY - 0.12, streamBedAt(z) + 0.4));
}

// The ocean's shader twin of shoreAt() and the sea-bed branch of
// terrainHeight(), generated from the same constants. The sea material
// splices it in so depth — the colour ramp, the transparency, the foam
// lines, the dying of the swell — is read from the same bed the mesh stands
// on: no depth texture, no extra pass, and no way for the paint and the
// water to disagree. Not ported: the stream's cut (a hand's width of bed at
// the waterline, where the sea is a film) and the headlands' exact height
// (the sea only needs to know they are land, and depth clamps at 0).
export const SEA_BED_GLSL = `
  float shoreDist(vec2 p) {
    float x = p.x;
    return ${SHORE_Z.toFixed(1)}
      + ${COVE_BOW.toFixed(1)} * cos(clamp(x / 120.0, -1.0, 1.0) * 1.5707963)
      + sin(x * 0.011 + 4.2) * 1.3
      + sin(x * 0.032 + 0.6) * 0.9
      + sin(x * 0.041) * 1.2;
  }
  float bedHeight(vec2 p) {
    float d = shoreDist(p) - p.y;          // metres of run off the waterline
    float y = ${SEA_Y.toFixed(1)} - (d * 0.034 + (d * d) * 0.0011875);  // (d/40)^2 * 1.9
    if (d > 60.0) y -= (d - 60.0) * 0.12;
    return y;
  }`;


// ---------------------------------------------------------------------------
// Ground queries: slope, normal, surface masks, soil type.
// ---------------------------------------------------------------------------
// One model of "what the ground is here" that the mesh's colours, the
// vegetation's scatter and later the agents all read, so what you see and
// what the game obeys cannot drift apart. Pure numbers — no THREE — so the
// layout tests can hold them to it under plain node.
const GROUND_STEP = 1;    // matches how the mesh estimates its own slope

// Tangent of the inclination (0 flat, 1 = 45°).
export function terrainSlope(x, z) {
  const e = GROUND_STEP;
  const dx = (terrainHeight(x + e, z) - terrainHeight(x - e, z)) / (2 * e);
  const dz = (terrainHeight(x, z + e) - terrainHeight(x, z - e)) / (2 * e);
  return Math.hypot(dx, dz);
}

// Unit surface normal, a plain {x, y, z} to keep the layout THREE-free.
export function terrainNormal(x, z) {
  const e = GROUND_STEP;
  const dx = (terrainHeight(x + e, z) - terrainHeight(x - e, z)) / (2 * e);
  const dz = (terrainHeight(x, z + e) - terrainHeight(x, z - e)) / (2 * e);
  const l = Math.hypot(dx, 1, dz);
  return { x: -dx / l, y: 1 / l, z: -dz / l };
}

// Standing mottle of the forest floor — which patches wear litter and which
// grow moss. The mesh paints by it; anything wanting the same patchwork
// asks for it instead of re-inventing one.
export function forestMottle(x, z) {
  return 0.5 + 0.5 * Math.sin(x * 0.21 + Math.cos(z * 0.17) * 2.3);
}

// Continuous surface masks, 0..1 each. The base surfaces are near-exclusive —
// seabed | sand | forest floor (litter + moss) | rock — with the path's dirt
// carved out of the floor, and `wet` overlays moisture on any of them.
// `pre` may carry { h, slope } the caller has already paid for (the mesh's
// vertex loop does).
export function terrainMasks(x, z, pre) {
  const h = pre && pre.h !== undefined ? pre.h : terrainHeight(x, z);
  const slope = pre && pre.slope !== undefined ? pre.slope : terrainSlope(x, z);
  const d = z - shoreAt(x);
  const dry = d < 0 ? 0 : 1;                    // hard split at the waterline

  // The forest floor takes the land over at the head of the beach.
  const forest = smoothstep(z, SAND_END - 6, SAND_END + 10);

  // Rock wherever the ground is steep: the cliff face, the ridges' shoulders.
  const rock = smoothstep(slope, 0.55, 1.1) * dry;

  // Path dirt, cut into the forest floor only — on the sand the ribbon and
  // the footprints do the telling.
  const pf = pathFrame(x, z, _pf);
  const dirt = (1 - smoothstep(pf.d, PATH_HALF_W - 0.2, PATH_HALF_W + 1.6)) * forest * (1 - rock);

  // Moisture: the swash line on the beach, the stream banks and the pool rim
  // in the forest. The beach band is the swash's envelope: the water's edge
  // oscillates between -1.4 and +4.6 m from the waterline (jungleOcean's
  // swash), so sand stays saturated a little past the common reach and dries
  // out toward the top of the biggest runs — wet paint lags the water, as it
  // does on a real beach.
  const beachWet = d >= 0 ? 1 - smoothstep(d, 2.5, 7) : 1;
  const margins = Math.max(
    1 - smoothstep(streamDistance(x, z), STREAM_HALF_W, STREAM_HALF_W + 2.5),
    1 - smoothstep(Math.hypot(x - POOL.x, z - POOL.z), POOL.r, POOL.r + 3),
  ) * forest;
  const wet = Math.max(beachWet * dry, margins);

  const floor = forest * (1 - rock) * (1 - dirt);
  const mottle = forestMottle(x, z) * 0.7;      // as the mesh mixes it
  return {
    seabed: 1 - dry,
    sand: dry * (1 - forest) * (1 - rock),
    litter: floor * (1 - mottle),
    moss: floor * mottle,
    rock, dirt, wet,
  };
}

// The soil types soilAt reports.
export const SOIL = { SHALLOW: 0, WET: 1, SAND: 2, DIRT: 3, FOREST: 4, ROCK: 5 };

// What the ground IS at (x, z). Placement, footfall and outfit decisions ask
// this instead of re-deriving their own idea of the ground.
export function soilAt(x, z, pre) {
  const m = terrainMasks(x, z, pre);
  if (m.seabed > 0.5) return SOIL.SHALLOW;
  const h = pre && pre.h !== undefined ? pre.h : terrainHeight(x, z);
  // Standing water: the pool bowl and the stream channel.
  if (Math.hypot(x - POOL.x, z - POOL.z) < POOL.r - 0.5 && h < POOL.waterY + 0.05) return SOIL.SHALLOW;
  if (streamDistance(x, z) < STREAM_HALF_W && h < streamWaterY(z) + 0.05) return SOIL.SHALLOW;
  if (m.rock > 0.5) return SOIL.ROCK;
  if (m.dirt > 0.5) return SOIL.DIRT;
  if (m.wet > 0.5) return SOIL.WET;
  if (m.litter + m.moss > 0.5) return SOIL.FOREST;
  return SOIL.SAND;
}

// ---------------------------------------------------------------------------
// Zones.
// ---------------------------------------------------------------------------
// How much forest belongs here, 0..1. The vegetation scatter multiplies its
// density by this; clearings are just places where it is low.
export function forestDensity(x, z) {
  if (Math.abs(x) > PLAY_HALF_W + 30) return 0;
  const edge = smoothstep(z, SAND_END - 4, SAND_END + 16);
  const clearPath = smoothstep(pathDistance(x, z), PATH_HALF_W + 0.6, PATH_HALF_W + 3.5);
  const clearStream = smoothstep(streamDistance(x, z), STREAM_HALF_W + 0.5, STREAM_HALF_W + 3);
  const clearPool = smoothstep(Math.hypot(x - POOL.x, z - POOL.z), POOL.r + 1, POOL.r + 6);
  const clearCliff = 1 - smoothstep(z, cliffZ(x) - 5, cliffZ(x) - 1);
  return edge * clearPath * clearStream * clearPool * clearCliff;
}

// 0 on the open beach, 1 under the canopy — what the fog and the light blend on.
export function canopyAt(z) {
  return smoothstep(z, SAND_END - 2, SAND_END + 30);
}

// Where the walker must not be able to go. Built into the collision world by
// main-JUNGLE.js; kept here so the tests can check it without a browser.
// Each run is ≤ 64 m because cityBoxes ignores anything longer than 80 m.
export function boundaryWalls() {
  const walls = [];
  const run = (x0, z0, x1, z1, y0, y1) => {
    const n = Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(z1 - z0)) / 60));
    for (let i = 0; i < n; i++) {
      walls.push({
        x0: lerp(x0, x1, i / n), x1: lerp(x0, x1, (i + 1) / n),
        z0: lerp(z0, z1, i / n), z1: lerp(z0, z1, (i + 1) / n), y0, y1,
      });
    }
  };
  // Wade barrier across the cove.
  run(-PLAY_HALF_W - 4, WADE_Z - 1.2, PLAY_HALF_W + 4, WADE_Z, -12, 14);
  // Side walls, from the sea to behind the cliff.
  for (const s of [-1, 1]) {
    run(s * PLAY_HALF_W - 0.6, WADE_Z - 1.2, s * PLAY_HALF_W + 0.6, CLIFF_Z + 12, -12, 60);
  }
  // Cliff foot: short chords that follow cliffZ, kept just in front of it.
  for (let x = -PLAY_HALF_W; x < PLAY_HALF_W; x += 6) {
    const za = Math.min(cliffZ(x), cliffZ(x + 6)) - 2.2;
    walls.push({ x0: x, x1: x + 6, z0: za - 0.6, z1: za + 8, y0: -5, y1: 60 });
  }
  return walls;
}

// Arrival spots.
// yaw follows input.js: forward = (-sin yaw, -cos yaw), so π faces +Z (inland).
export const SPAWN = { x: -8, z: -4, yaw: Math.PI };          // on the sand, facing inland
export const TENDER_SPOT = { x: JETTY.x, z: JETTY.z1 + 1.8, yaw: Math.PI };  // jetty head, facing shore
