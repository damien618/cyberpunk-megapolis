// wildlifeMotion.js — how the island's animals get from A to B. One entry per
// kind of locomotion; a species names its kind in `motion` (see WILDLIFE.md).
//
// CONTRACT. A motion is { step(a, sp, dt, ctx, speed) → arrived }:
//   a      the agent: moves a.x/a.y/a.z toward its target (a.tx, a.tz and,
//          for flyers and swimmers, a.ty), sets a.speed (m/s actually
//          covered — the legs' stride and the gait read it) and turns a.yaw
//          (radians about +Y; the model's local +Z is its front).
//   sp     the species runtime: sp.def (merged definition), sp.rng.
//   ctx    { t, px, pz, pSpeed, layout, STATE } — the layout adapter
//          answers every ground and water question (wildlife.js, LAYOUT).
//   speed  cruising speed the state asks for (def.speed.walk or .flee).
// Return true once the target is reached. The manager owns the state
// machine; a motion only moves. It must not allocate per call.
//
// Optional, beside step:
//   init(sp, ctx)  once, at creation, after the homes are placed: put the
//                  agents where the motion keeps them (a flock formed on its
//                  loop, an eagle on its circle), so frame one is not a jump.
//   smooth: true   step every frame at any distance: past the near tier the
//                  manager otherwise thinks one frame in four, which a big or
//                  fast body (a bird crossing the sky) shows as a judder.
//   group: true    one simulation for the whole species (a school, a flock):
//                  woken and put to sleep together, never half a school.
//
// Kinds: ground, hop, flyFree, glide, flock, school, amphibious (MOTION, at
// the bottom). A new kind starts as a brief there and its step here.
import { stepBoids, boidParams } from './wildlifeBoids.js';

export const wrapAngle = a => Math.atan2(Math.sin(a), Math.cos(a));

const ARRIVE = 0.06;   // m

// ---------------------------------------------------------------------------
// ground — crabs, foxes, lizards, snakes. Steers toward the target at a
// bounded turn rate, sits on the analytic terrain, and (in wildlife.js)
// tilts with the ground normal. `body.sideways` animals (crabs) travel along
// their local ±X: the body keeps its yaw and the heading does the turning.
// ---------------------------------------------------------------------------
function groundStep(a, sp, dt, ctx, speed) {
  const { def } = sp;
  const dx = a.tx - a.x, dz = a.tz - a.z;
  const d = Math.hypot(dx, dz);
  if (d < ARRIVE) { a.speed = 0; return true; }
  const want = Math.atan2(dx, dz);
  const turn = def.speed.turn * dt;
  a.heading += Math.max(-turn, Math.min(turn, wrapAngle(want - a.heading)));
  // Slow into the last few centimetres so nothing overshoots and circles.
  const v = Math.min(speed, d / Math.max(dt, 1e-3), speed * (0.35 + d * 2));
  const step = Math.min(v * dt, d);
  a.x += Math.sin(a.heading) * step;
  a.z += Math.cos(a.heading) * step;
  a.y = ctx.layout.terrainHeight(a.x, a.z);
  a.speed = step / Math.max(dt, 1e-3);
  // The body follows the heading (plus the sideways offset) at the same rate.
  const body = a.heading + (def.body.sideways ? def.body.yawOffset * a.side : def.body.yawOffset);
  a.yaw += Math.max(-turn, Math.min(turn, wrapAngle(body - a.yaw)));
  return false;
}


// ---------------------------------------------------------------------------
// hop — tree frogs. Ballistic sub-hops toward the target: crouch, leap,
// land, and again until it arrives. The hop's own state lives on the agent —
// a.hopPhase (0 crouch, 1 air, 2 grounded), a.hopT, a.vy, the launch point
// a.hx/hy/hz and the air time a.hT — like the crab's a.retreat. vy is
// solved so the arc lands exactly on the terrain at the target (flat-earth
// 9.8; air time from the speed the state asked for), and the arc is walked
// parametrically, so a stuttering frame lands instead of overshooting.
// a.speed carries the horizontal m/s covered: stride climbs about half a
// turn per leap, which the GLSL reads as one leg extension per hop.
// ---------------------------------------------------------------------------
const HOP_G = 9.8;                 // m/s²
const HOP_MIN = 0.3, HOP_MAX = 1.0; // m per leap

function hopStep(a, sp, dt, ctx, speed) {
  const { def, rng } = sp;
  const turn = def.speed.turn * dt;

  // Airborne: walk the arc by its own clock.
  if (a.hopPhase === 1) {
    a.hopT += dt;
    if (a.hopT >= a.hT) {
      a.x = a.lx; a.z = a.lz;
      a.y = ctx.layout.terrainHeight(a.x, a.z);
      a.hopPhase = 2; a.speed = 0;
    } else {
      const p = a.hopT / a.hT;
      a.x = a.hx + (a.lx - a.hx) * p;
      a.z = a.hz + (a.lz - a.hz) * p;
      a.y = a.hy + a.vy * a.hopT - 0.5 * HOP_G * a.hopT * a.hopT;
      a.speed = Math.hypot(a.lx - a.hx, a.lz - a.hz) / a.hT;
    }
    a.yaw += Math.max(-turn, Math.min(turn, wrapAngle(a.heading + def.body.yawOffset - a.yaw)));
    return false;
  }

  // Crouched: hold the squash, then launch.
  if (a.hopPhase === 0) {
    a.speed = 0;
    a.hopT -= dt;
    if (a.hopT > 0) {
      a.yaw += Math.max(-turn, Math.min(turn, wrapAngle(a.heading + def.body.yawOffset - a.yaw)));
      return false;
    }
    const dx = a.tx - a.x, dz = a.tz - a.z;
    const d = Math.hypot(dx, dz);
    if (d < ARRIVE) { a.hopPhase = 2; return true; }
    // One leap of 0.3–1 m toward the target — chains, never a flea shot.
    // Near the target the last leap is exact: no overshoot and hop back.
    const len = d < 0.6 ? d : Math.min(d, HOP_MIN + rng() * (HOP_MAX - HOP_MIN));
    const lx = a.x + (dx / d) * len, lz = a.z + (dz / d) * len;
    const T = Math.min(0.5, Math.max(0.3, len / Math.max(speed, 0.3)));
    a.hx = a.x; a.hy = a.y; a.hz = a.z;
    a.lx = lx; a.lz = lz;
    a.hT = T; a.hopT = 0; a.hopPhase = 1;
    a.vy = (ctx.layout.terrainHeight(lx, lz) - a.hy + 0.5 * HOP_G * T * T) / T;
    return false;
  }

  // Grounded (or never hopped): face the target, crouch, then go.
  const dx = a.tx - a.x, dz = a.tz - a.z;
  if (Math.hypot(dx, dz) < ARRIVE) { a.speed = 0; return true; }
  a.heading = Math.atan2(dx, dz);
  a.hopPhase = 0;
  a.hopT = 0.05 + rng() * 0.07;
  a.speed = 0;
  return false;
}

// ---------------------------------------------------------------------------
// school — the pool's fish (wildlifeFish.js). The group's sim lives on the
// species runtime (sp.school, built on the first step, when sp.agents
// exists), integrates ONCE per frame — several agents step the same frame,
// so the first to arrive does it, guarded on sp.frame — and each agent then
// reads its own boid (same index in the array). Bounded by the water itself,
// the brief's three walls: the waterline in x/z, the bed (terrainHeight)
// below, the surface (waterAt(x, z).y) above. The wading player is the
// boids' threat — the school parts around them at double speed and closes
// again when they wade out. No allocation per call.
// ---------------------------------------------------------------------------
function schoolInit(sp, ctx) {
  const L = ctx.layout;
  let s;
  {
    // One-time: the water read off its own agents — centre from their mean,
    // surface and kind (pool, stream, lagoon…) from the water there,
    // waterline by probing eight rays out.
    let cx = 0, cz = 0;
    for (const b of sp.agents) { cx += b.x; cz += b.z; }
    cx /= sp.agents.length; cz /= sp.agents.length;
    const w0 = L.waterAt ? L.waterAt(cx, cz) : null;
    const surf = w0 ? w0.y : sp.agents[0].y + 0.3;
    const kind = w0 ? w0.kind : null;
    let r = 2;
    for (let i = 0; i < 8; i++) {
      const th = i * 0.7853981633974483 + 0.4, sx = Math.sin(th), sz = Math.cos(th);
      for (let d = 1; d < 20; d += 0.5) {
        const w = L.waterAt(cx + sx * d, cz + sz * d);
        if (!w || w.kind !== kind) break;
        if (d > r) r = d;
      }
    }
    const boids = sp.agents.map(b => ({
      x: b.x, y: surf - 0.35, z: b.z,
      vx: Math.sin(b.heading) * 0.35, vy: 0, vz: Math.cos(b.heading) * 0.35,
    }));
    for (const b of sp.agents) {
      b.y = surf - 0.35;
      b.yaw = b.heading + sp.def.body.yawOffset;
    }
    s = sp.school = {
      cx, cz, r: Math.max(2, r - 1.2), surf, kind,
      guard: -1,
      threat: { x: 0, y: surf - 0.3, z: 0 },
      target: { x: cx, y: surf - 0.35, z: cz },
      params: boidParams({
        sepDist: 0.4, viewDist: 2.2,
        separation: 2.2, alignment: 1.1, cohesion: 0.8,
        targetWeight: 0.35,
        flee: 3.5, fleeDist: 2.6,
        minSpeed: 0.22, maxSpeed: 0.55, maxForce: 5,
      }),
      boids,
      // bounds(b, out) — the brief's walls. Nothing is allocated.
      bound(b, out) {
        out.x = 0; out.y = 0; out.z = 0;
        const dx = b.x - s.cx, dz = b.z - s.cz;
        const d = Math.hypot(dx, dz) || 1;
        if (d > s.r) {                       // the rim: a soft push back in
          const k = (s.r - d) * 8;
          out.x = dx / d * k; out.z = dz / d * k;
        } else {
          const w = L.waterAt(b.x, b.z);
          if (!w || w.kind !== s.kind) {     // out of the water: hard pull home
            out.x = -dx / d * 10; out.z = -dz / d * 10;
          }
        }
        // Between the bed and the surface — but where the bowl shoals the
        // band would invert (its bed rises past the surface), so it is
        // pinched shut and the fish held just under the surface instead.
        const top = s.surf - 0.09;
        let bed = L.terrainHeight(b.x, b.z) + 0.12;
        if (bed > top - 0.04) bed = top - 0.04;
        out.y = b.y < bed ? (bed - b.y) * 9 : b.y > top ? (top - b.y) * 9 : 0;
      },
    };
  }
  return s;
}

function schoolStep(a, sp, dt, ctx, speed) {
  const s = sp.school || schoolInit(sp, ctx);
  // The group steps once per frame; the first agent to think this frame
  // integrates it, everyone reads their own boid after. (A group motion is
  // woken whole and thinks every frame — wildlife.js — so dt is the frame's.)
  if (s.guard !== sp.frame) {
    s.guard = sp.frame;
    const P = s.params;
    // The school's intent is itself: the centroid. Spread-out fish (and the
    // scattered ones, once you wade out) swim back toward the group.
    let tx = 0, ty = 0, tz = 0;
    for (const b of s.boids) { tx += b.x; ty += b.y; tz += b.z; }
    const n = s.boids.length;
    s.target.x = tx / n; s.target.y = ty / n; s.target.z = tz / n;
    P.target = s.target;
    const scared = Math.hypot(ctx.px - s.cx, ctx.pz - s.cz) < s.r + 1.2;
    if (scared) {
      s.threat.x = ctx.px; s.threat.z = ctx.pz;
      P.threat = s.threat;
      P.maxSpeed = Math.max(speed, 1.25);    // the scatter burst
    } else {
      P.threat = null;
      P.maxSpeed = speed;
    }
    stepBoids(s.boids, P, dt, s.bound);
  }
  // Read: this agent rides its boid, nose along the velocity.
  const b = s.boids[a.i];
  a.x = b.x; a.y = b.y; a.z = b.z;
  a.speed = Math.hypot(b.vx, b.vy, b.vz);
  if (a.speed > 1e-4) {
    a.heading = Math.atan2(b.vx, b.vz);
    const turn = sp.def.speed.turn * dt;
    a.yaw += Math.max(-turn, Math.min(turn, wrapAngle(a.heading - a.yaw)));
  }
  return false;   // a school never "arrives"; their tick keeps them in MOVE
}

// ---------------------------------------------------------------------------
// flock — the cove's brown pelicans (wildlifePelican.js). The group's sim
// lives on the species runtime (sp.flock, built on the first step, when
// sp.agents exists), integrates ONCE per frame — several agents step the
// same frame, so the first to think does it, guarded on sp.frame like the
// school's — and each agent then reads its own boid (same index).
//
// The leader (boid 0) is no boid: it rides a constant-speed oval laid over
// the water its homes were sampled on — centre from their mean, then held
// so the whole oval stays inside the homes' bounding box where that fits
// and hangs offshore of it where it cannot (the sea beyond the homes is
// open water; the sea inshore of them is the shore). The band rides
// fly.low..fly.high metres above the water's surface (seaHeightAt, else
// waterAt, else the terrain). The leader's own path is kept as a short
// time-stamped trail; the rest of the line are boids (wildlifeBoids) whose
// shared target is the trail point fly.delay seconds back — the file
// streams out behind the leader, nose to tail. Now and then (fly.diveEvery)
// the leader folds off the band into a plunge dive — a parametric arc down
// to the surface and back up — and the line sweeps down the same curve in
// cascade: the chase point is down, so the file is allowed the speed
// (maxSpeed raised) that reads gait 1, which the species' GLSL turns into
// the folded, nose-down pose. The boids' bounds hold the band over the sea
// and the file offshore. No allocation per call.
//
// Optional definition keys (def.fly; a species that leaves it out flies on
// these defaults):
//   loopX 30, loopZ 11   the oval's half-extents, metres
//   low 3.2, high 5.2    the band above the water, metres
//   delay 1.15           how far back down the trail the file flies, seconds
//   diveEvery [16, 34]   seconds between plunge dives
//   diveDur 6.5          how long a plunge takes, seconds
// ---------------------------------------------------------------------------
const FLOCK_TRAIL = 128;   // trail samples, about 4 s at the 30 Hz pace

function flockSeaY(x, z, L, t) {
  if (L.seaHeightAt) return L.seaHeightAt(x, z, t);
  const w = L.waterAt ? L.waterAt(x, z) : null;
  return w ? w.y : L.terrainHeight(x, z);
}
// smoothstep — the down-and-back arc of the plunge in the leader's altitude.
const flockArc = (a, b, x) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

function flockInit(sp, ctx) {
  const L = ctx.layout, speed = sp.def.speed.walk;
  let s;
  {
    let cx = 0, cz = 0, x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const b of sp.agents) {
      cx += b.x; cz += b.z;
      if (b.x < x0) x0 = b.x; if (b.x > x1) x1 = b.x;
      if (b.z < z0) z0 = b.z; if (b.z > z1) z1 = b.z;
    }
    cx /= sp.agents.length; cz /= sp.agents.length;
    const F = sp.def.fly || EMPTY_FLY;
    const rx = F.loopX ?? 30, rz = F.loopZ ?? 11;
    cx = Math.min(x1 - rx + 1, Math.max(cx, x0 + rx - 1));
    cz = Math.min(z1 - rz + 1, Math.max(cz, z0 + rz - 1));
    const low = F.low ?? 3.2, high = F.high ?? 5.2;
    const surf0 = flockSeaY(cx, cz, L, ctx.t);
    const mid = low + 0.5 * (high - low);
    const th0 = Math.atan2((sp.agents[0].x - cx) / rx, (sp.agents[0].z - cz) / rz);
    s = sp.flock = {
      cx, cz, rx, rz, low, high,
      th: th0,
      delay: F.delay ?? 1.15,
      diveEvery: F.diveEvery ?? [16, 34],
      diveDur: F.diveDur ?? 6.5,
      dive: -1, diveT: sp.rng.range(F.diveEvery ?? [16, 34]),
      trail: new Float32Array(FLOCK_TRAIL * 4),
      head: 0, count: 0, lastSample: -1, lastT: -1, clock: 0, prevLy: surf0 + mid,
      lx: 0, ly: 0, lz: 0, lvx: 0, lvz: 0, lspeed: speed,
      target: { x: cx, y: surf0 + mid, z: cz },
      boids: sp.agents.map((b, i) => {
        // The file starts formed: each bird a slot behind the leader on the
        // loop (0.16 rad is about 4.5 m of its arc), already flying along
        // it. The homes picked the water the loop circles, not where each
        // bird sits — a line of pelicans is already in line when you first
        // see it.
        const th = th0 - i * 0.16;
        const x = cx + Math.sin(th) * rx, z = cz + Math.cos(th) * rz;
        const y = flockSeaY(x, z, L, ctx.t) + mid;
        const tl = Math.hypot(Math.cos(th) * rx, Math.sin(th) * rz) || 1;
        const vx = Math.cos(th) * rx / tl * speed, vz = -Math.sin(th) * rz / tl * speed;
        // The agent starts where its boid does, so the first frame drawn
        // is already the formed line, not the scattered homes.
        b.x = x; b.y = y; b.z = z;
        b.heading = Math.atan2(vx, vz); b.yaw = b.heading;
        return { x, y, z, vx, vy: 0, vz };
      }),
      params: boidParams({
        sepDist: 2.4, viewDist: 9,
        separation: 1.8, alignment: 1.0, cohesion: 0.15, targetWeight: 1.6,
        minSpeed: 4.2, maxSpeed: 5.8, maxForce: 9,
      }),
      zIn: cz + rz + 4,       // nobody inshore of the loop's near edge
      guard: -1,
      // bounds(b, out) — the band above the sea and the file offshore. The
      // plunge punches through the band, so the floor is the surface itself.
      bound(b, out) {
        out.x = 0; out.y = 0; out.z = 0;
        const w = L.waterAt ? L.waterAt(b.x, b.z) : null;
        if (!w || w.kind !== 'sea') {
          const dx = s.cx - b.x, dz = s.cz - b.z, d = Math.hypot(dx, dz) || 1;
          out.x += dx / d * 10; out.z += dz / d * 10;
        }
        if (b.z > s.zIn) out.z -= (b.z - s.zIn) * 8;
        const surf = flockSeaY(b.x, b.z, L, ctx.t);
        if (b.y < surf + 0.35) out.y += (surf + 0.35 - b.y) * 16;
        else if (b.y < surf + s.low) out.y += (surf + s.low - b.y) * 5;
        else if (b.y > surf + s.high) out.y -= (b.y - surf - s.high) * 5;
      },
    };
  }
  return s;
}

function flockStep(a, sp, dt, ctx, speed) {
  const L = ctx.layout;
  const s = sp.flock || flockInit(sp, ctx);
  // The flight steps once per frame; the first agent to think this frame
  // flies the leader on, samples the trail and integrates the boids. The
  // group has its own clock — the real time since the last integration —
  // because the engine hands each thinker the time since ITS last think
  // (an agent past the near tier thinks one frame in four, but the flight
  // flies on at one second per second).
  if (s.guard !== sp.frame) {
    s.guard = sp.frame;
    // The group's own clock. The real time since the last integration — an
    // agent past the near tier thinks one frame in four, but the flight
    // flies on at one second per second — and monotonic: the map hands the
    // update a clock any section may restart, so a rewind reads as a plain
    // frame here and only the group's clock timestamps the trail.
    let raw = ctx.t - s.lastT;
    if (raw <= 0) raw = Math.min(dt, 1 / 30);
    const fdt = s.lastT < 0 ? 1 / 30 : Math.min(0.05, raw);
    s.lastT = ctx.t;
    s.clock += fdt;
    const P = s.params;
    // The leader: constant speed round the oval — the loop angle advances
    // faster where the oval runs narrow — in the band or on the plunge.
    const T = Math.hypot(Math.cos(s.th) * s.rx, Math.sin(s.th) * s.rz) || 1;
    s.lvx = (Math.cos(s.th) * s.rx / T) * speed;
    s.lvz = (-Math.sin(s.th) * s.rz / T) * speed;
    s.lx = s.cx + Math.sin(s.th) * s.rx;
    s.lz = s.cz + Math.cos(s.th) * s.rz;
    s.th += speed / T * fdt;
    const surf = flockSeaY(s.lx, s.lz, L, ctx.t);
    const mid = s.low + 0.5 * (s.high - s.low);
    s.lspeed = speed;
    s.ly = surf + mid + Math.sin(ctx.t * 0.7) * 0.2;
    if (s.dive >= 0) {
      s.dive += fdt;
      const u = s.dive / s.diveDur;
      if (u >= 1) { s.dive = -1; s.diveT = sp.rng.range(s.diveEvery); }
      else {
        const h = 1 - flockArc(0.04, 0.3, u) + flockArc(0.55, 0.98, u);
        s.ly = surf + 0.25 + h * (mid - 0.25);
        s.lspeed = speed * (1 + 1.6 * Math.sin(Math.PI * u) ** 2);   // the gait reads it
      }
    } else {
      s.diveT -= fdt;
      if (s.diveT <= 0) s.dive = 0;
    }
    // The trail: the leader's own recent path, stamped with the group's clock.
    if (s.lastSample < 0 || s.clock - s.lastSample >= 1 / 30) {
      s.lastSample = s.clock;
      s.head = (s.head + 1) % FLOCK_TRAIL;
      const o = s.head * 4;
      s.trail[o] = s.clock; s.trail[o + 1] = s.lx; s.trail[o + 2] = s.ly; s.trail[o + 3] = s.lz;
      if (s.count < FLOCK_TRAIL) s.count++;
    }
    // The file's chase point: fly.delay back down the trail — or the oldest
    // sample, before the trail has filled that far.
    let pick = s.head;
    for (let k = 0; k < s.count; k++) {
      const i = (s.head - k + FLOCK_TRAIL) % FLOCK_TRAIL;
      pick = i;
      if (s.trail[i * 4] <= s.clock - s.delay) break;
    }
    const o = pick * 4;
    s.target.x = s.trail[o + 1]; s.target.y = s.trail[o + 2]; s.target.z = s.trail[o + 3];
    // The chase point never leads the file under a metre and a half of the
    // water: the leader alone touches the surface, the file swoops to it.
    const tSurf = flockSeaY(s.target.x, s.target.z, L, ctx.t);
    if (s.target.y < tSurf + 1.6) s.target.y = tSurf + 1.6;
    // The boids: the file, chasing that point. The leader rides slot 0 so
    // the others keep their distance from it, and is put back afterwards.
    const b0 = s.boids[0];
    b0.x = s.lx; b0.y = s.ly; b0.z = s.lz;
    b0.vx = s.lvx; b0.vy = (s.ly - s.prevLy) / fdt; b0.vz = s.lvz;
    s.prevLy = s.ly;
    P.target = s.target;
    // The plunge's catch-up burst: with the chase point down low the file
    // may fly fast enough to fold (gait 1); back up top, cruise. And the
    // file closes on its lagging birds: the farther the farthest bird sits
    // from the chase point, the faster the line may fly — up to 7.6 m/s,
    // just under the gait that reads as the fold. At its slot, cruise.
    let far = 0;
    for (let i = 1; i < s.boids.length; i++) {
      const b = s.boids[i];
      const d = Math.hypot(b.x - s.target.x, b.y - s.target.y, b.z - s.target.z);
      if (d > far) far = d;
    }
    P.maxSpeed = s.target.y - tSurf < 2.5 ? 10.5
      : Math.min(7.6, 5.8 + Math.max(0, far - 3) * 0.35);
    stepBoids(s.boids, P, fdt, s.bound);
    b0.x = s.lx; b0.y = s.ly; b0.z = s.lz;
  }
  // Read: the leader rides the loop; the rest ride their boid, nose along
  // the velocity. Nobody ever arrives — the tick keeps the machine in MOVE.
  const turn = sp.def.speed.turn * dt;
  if (a.i === 0) {
    a.x = s.lx; a.y = s.ly; a.z = s.lz;
    a.speed = s.lspeed;
    a.heading = Math.atan2(s.lvx, s.lvz);
    a.yaw += Math.max(-turn, Math.min(turn, wrapAngle(a.heading - a.yaw)));
  } else {
    const b = s.boids[a.i];
    a.x = b.x; a.y = b.y; a.z = b.z;
    a.speed = Math.hypot(b.vx, b.vy, b.vz);
    if (a.speed > 1e-4) {
      a.heading = Math.atan2(b.vx, b.vz);
      a.yaw += Math.max(-turn, Math.min(turn, wrapAngle(a.heading - a.yaw)));
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// flyFree — the pool's dragonflies (wildlifeDragonfly.js). Two phases live on
// the agent — a.dartOn/a.dartT (the dart) and a.hoverT (the stop) — because
// the manager's IDLE never lands one: the species' tick hands every IDLE
// straight back to MOVE, and this motion owns the whole cycle. A dart walks
// the chord to its target parametrically (like the hop's arc, so a
// stuttering frame lands instead of overshooting), swinging sideways through
// it — the zigzag — while it climbs on an exponential ease to a.ty, a height
// picked at the dart's start inside a band above the surface under the
// target (waterAt's water where there is water, the terrain everywhere
// else). A guard holds the band while the ground rises under a turn, so
// nothing skirts into a bank or the cliff. Arrived, it hangs at the anchor
// on a small figure-of-eight (a Lissajous pair, velocity carried into the
// heading) until the hover runs out, then reports in: the machine idles for
// a frame and the tick retargets. A target the machine changes mid-dart or
// mid-hover (a.ftx/a.ftz hold the one the flight was planned for) restarts
// the dart from where the body is. No allocation per call.
//
// Optional definition keys (def.fly; a species that leaves it out flies on
// these defaults):
//   low 0.35, high 2.2   the band above the surface, in metres
//   hover [0.6, 1.8]     seconds at each anchor
//   hoverR 0.2           the figure-of-eight's radius
//   hoverRate 1.3        how fast it circles the eight, rad/s
//   zigzag 0.38          the sideways swing's amplitude, metres
//   zigFreq 9            the swing's angular rate, rad/s
//   climb 2.6            the exponential ease into a.ty (1/s)
// ---------------------------------------------------------------------------
const FLY_HOVER = [0.6, 1.8];
const EMPTY_FLY = {};

function flySurfaceY(x, z, L) {
  const w = L.waterAt ? L.waterAt(x, z) : null;
  return w ? w.y : L.terrainHeight(x, z);
}

function flyFreeStep(a, sp, dt, ctx, speed) {
  const L = ctx.layout;
  const F = sp.def.fly || EMPTY_FLY;
  const LOW = F.low ?? 0.35, HIGH = F.high ?? 2.2;
  const turn = sp.def.speed.turn * dt;

  if (a.flyPhase !== 0 && a.flyPhase !== 1) { a.flyPhase = 1; a.dartOn = false; }
  // The machine moved the target (a fresh wander, a flight from the player):
  // whatever the dart or the hover was doing, leave for it from HERE. The
  // dart walks a chord planned from its start, so carrying on with a new end
  // would teleport the body down the new chord.
  if (a.tx !== a.ftx || a.tz !== a.ftz) { a.flyPhase = 1; a.dartOn = false; }

  // --- the dart: the zigzag chord to the target ----------------------------
  if (a.flyPhase === 1) {
    if (!a.dartOn) {
      const dx = a.tx - a.x, dz = a.tz - a.z;
      const d = Math.hypot(dx, dz);
      a.ftx = a.tx; a.ftz = a.tz;
      a.dartOn = true; a.dartT = 0;
      a.hx = a.x; a.hy = a.y; a.hz = a.z;
      if (d < ARRIVE) {
        // Nowhere to go: hang right here.
        a.flyPhase = 0; a.hoverT = sp.rng.range(F.hover || FLY_HOVER);
        a.ax = a.tx; a.az = a.tz; a.ay = a.y;
      } else {
        a.dartLen = d;
        a.px = -dz / d; a.pz = dx / d;          // the swing's sideways
        a.hT = d / Math.max(speed, 0.2);
        a.ty = flySurfaceY(a.tx, a.tz, L) + LOW + sp.rng() * (HIGH - LOW);
      }
    }
    if (a.flyPhase === 1) {
      a.dartT += dt;
      const p = Math.min(1, a.dartT / a.hT);
      const bx = a.hx + (a.tx - a.hx) * p, bz = a.hz + (a.tz - a.hz) * p;
      const swing = Math.sin(a.dartT * (F.zigFreq ?? 9) + a.phase)
        * (F.zigzag ?? 0.38) * Math.sin(p * Math.PI);
      const nx = bx + a.px * swing, nz = bz + a.pz * swing;
      // Climb/dive on an ease toward a.ty, then the band guard for ground
      // that rises under the chord — the skim up over a bank or the cliff.
      let y = a.hy + (a.ty - a.hy) * (1 - Math.exp(-(F.climb ?? 2.6) * a.dartT));
      const surf = flySurfaceY(nx, nz, L);
      if (y < surf + LOW) y = Math.min(surf + LOW, y + 3 * dt);
      else if (y > surf + HIGH) y = Math.max(surf + HIGH, y - 3 * dt);
      // Point where it actually went — through the zigzag, not along it.
      const mx = nx - a.x, mz = nz - a.z;
      const moved = Math.hypot(mx, mz);
      if (moved > 1e-5) {
        a.heading = Math.atan2(mx, mz);
        a.yaw += Math.max(-turn, Math.min(turn, wrapAngle(a.heading - a.yaw)));
      }
      a.x = nx; a.y = y; a.z = nz;
      a.speed = moved / Math.max(dt, 1e-3);
      if (p >= 1) {
        a.flyPhase = 0;
        a.hoverT = sp.rng.range(F.hover || FLY_HOVER);
        a.ax = a.tx; a.az = a.tz; a.ay = a.ty;
      }
      return false;
    }
    // else: the no-op dart above fell straight through into the hover.
  }

  // --- the hover: hang at the anchor on a small figure-of-eight ------------
  a.hoverT -= dt;
  const R = F.hoverR ?? 0.2, rate = F.hoverRate ?? 1.3;
  const u = ctx.t * rate + a.phase;
  a.x = a.ax + Math.sin(u) * R;
  a.z = a.az + Math.sin(u * 2) * R * 0.55;
  const vx = Math.cos(u) * R * rate, vz = Math.cos(u * 2) * 2 * R * 0.55 * rate;
  if (Math.hypot(vx, vz) > 1e-4) {
    a.heading = Math.atan2(vx, vz);
    a.yaw += Math.max(-turn, Math.min(turn, wrapAngle(a.heading - a.yaw)));
  }
  // The anchor's height with a breath of bob, held over the band's floor —
  // and eased toward, 3 m/s at most, like the dart's guard: an eight that
  // brushes a bank climbs over it and settles back instead of snapping.
  let y = a.ay + Math.sin(ctx.t * 2.1 + a.phase) * 0.04;
  const minY = flySurfaceY(a.x, a.z, L) + LOW;
  if (y < minY) y = minY;
  a.y += Math.max(-3 * dt, Math.min(3 * dt, y - a.y));
  a.speed = Math.min(Math.hypot(vx, vz), 0.5);
  if (a.hoverT <= 0) { a.flyPhase = 1; a.dartOn = false; return true; }
  return false;
}

// ---------------------------------------------------------------------------
// glide — the bald eagle (wildlifeEagle.js). Soaring circles of radius R
// round a centre that drifts slowly over the ridge, the bird banked into the
// turn (a.roll, which wildlife.js's writeInstances applies as a lean about
// the body's own forward axis); now and then a long glide carries it to a
// fresh centre and the circles resume, the other way round. Never lands,
// never flees: the species' tick hands an IDLE straight back to MOVE (the
// pelican's) and fear.radius is 0.
//
// State lives on the agent, like the hop's a.hopPhase:
//   a.gPh     0 circling, 1 the re-centre glide
//   a.cx/cz   the circle's centre, drifting on the wind inside homeRange
//   a.cR      the circle's radius, per individual (a.cRad, the one flown)
//   a.cTh     the angle round the circle
//   a.cDir    which way round (flips at each re-centre)
//   a.cT      seconds to the next re-centre
//   a.tx/tz   the glide's destination centre
//   a.roll    the bank in radians, eased toward what the turn asks
//
// Optional definition keys (def.fly; a species that leaves it out flies on
// these defaults):
//   circleR [11, 16]    the circle's radius range, metres
//   low 18, high 32     the band above the ground or the water, metres
//   drift 0.18          how fast the centre wanders on the wind, m/s
//   recenter [38, 80]   seconds between the long glides
//   bank 2.2            how much the turn's lean is scaled to read at a
//                       distance (the physics lean of a wide soar is a few
//                       degrees — too faint to see from the valley floor)
// ---------------------------------------------------------------------------
const GLIDE_G = 9.8;   // m/s², for the lean of a steady turn

// The band's middle over the ground here and GLIDE_LOOK metres ahead — so
// the bird is already rising when a cliff comes under it — reached at a
// soaring bird's pace: up to 2.5 m/s climbing, 1.5 m/s sinking.
const GLIDE_LOOK = 12;
function glideAltitude(a, L, dt, mid) {
  const ahead = flySurfaceY(a.x + Math.sin(a.yaw) * GLIDE_LOOK, a.z + Math.cos(a.yaw) * GLIDE_LOOK, L);
  const want = Math.max(flySurfaceY(a.x, a.z, L), ahead) + mid;
  const v = (want - a.y) * (want > a.y ? 2 : 0.35);
  a.y += Math.max(-1.5, Math.min(2.5, v)) * dt;
}

// First flight: take up a circle over the home, already at altitude and
// already on its rim (the motion's init runs this for every agent at
// creation, so the first frame drawn is the bird in its circle).
function glideJoin(a, sp, ctx) {
  const F = sp.def.fly || EMPTY_FLY;
  const low = F.low ?? 18, high = F.high ?? 32;
  a.gPh = 0;
  a.cx = a.home.x; a.cz = a.home.z;
  const R = F.circleR ?? [11, 16];
  a.cR = R[0] + sp.rng() * (R[1] - R[0]);
  a.cRad = a.cR;                          // the radius flown, eased to cR
  a.cTh = sp.rng() * Math.PI * 2;
  a.cDir = sp.rng() < 0.5 ? -1 : 1;
  a.cT = sp.rng.range(F.recenter ?? [38, 80]);
  a.roll = 0;
  a.x = a.cx + Math.sin(a.cTh) * a.cR;
  a.z = a.cz + Math.cos(a.cTh) * a.cR;
  a.y = flySurfaceY(a.x, a.z, ctx.layout) + low + 0.5 * (high - low);
  a.heading = Math.atan2(a.cDir * Math.cos(a.cTh), -a.cDir * Math.sin(a.cTh));
  a.yaw = a.heading;
}

function glideStep(a, sp, dt, ctx, speed) {
  const L = ctx.layout;
  const F = sp.def.fly || EMPTY_FLY;
  const turn = sp.def.speed.turn * dt;
  const low = F.low ?? 18, high = F.high ?? 32;
  const mid = low + 0.5 * (high - low);

  if (a.gPh !== 0 && a.gPh !== 1) glideJoin(a, sp, ctx);

  // --- the long glide to a fresh centre: wings level, ground keeping pace ---
  if (a.gPh === 1) {
    const dx = a.tx - a.x, dz = a.tz - a.z;
    const d = Math.hypot(dx, dz);
    if (d > 1e-4) a.heading = Math.atan2(dx, dz);
    a.yaw += Math.max(-turn, Math.min(turn, wrapAngle(a.heading - a.yaw)));
    a.roll += (0 - a.roll) * Math.min(1, dt * 1.5);
    const step = Math.min(speed * dt, d);
    a.x += Math.sin(a.yaw) * step; a.z += Math.cos(a.yaw) * step;
    glideAltitude(a, L, dt, mid);
    a.speed = step / Math.max(dt, 1e-3);
    // It joins the fresh circle where it meets the rim, not at the centre:
    // from the centre the circle's first point would be a radius away.
    if (d - step <= a.cR) {
      a.gPh = 0; a.cx = a.tx; a.cz = a.tz;
      a.cTh = Math.atan2(a.x - a.cx, a.z - a.cz);
      a.cRad = Math.hypot(a.x - a.cx, a.z - a.cz);   // eased out to cR below
    }
    return false;
  }

  // --- now and then: pick a fresh centre and glide to it ---------------------
  a.cT -= dt;
  if (a.cT <= 0) {
    const HR = sp.def.homeRange;
    const r = HR * Math.sqrt(sp.rng()), th = sp.rng() * Math.PI * 2;
    a.tx = a.home.x + Math.cos(th) * r;
    a.tz = a.home.z + Math.sin(th) * r;
    a.cT = sp.rng.range(F.recenter ?? [38, 80]);
    a.cDir = -a.cDir;                       // the circles resume the other way
    a.gPh = 1;
    return false;
  }

  // --- the circle: the centre drifts, the bird rides the rim, banked ---------
  const drift = F.drift ?? 0.18;
  let ncx = a.cx + Math.sin(ctx.t * 0.05 + a.phase) * drift * dt;
  let ncz = a.cz + Math.cos(ctx.t * 0.043 + a.phase) * drift * dt;
  const hx = ncx - a.home.x, hz = ncz - a.home.z, hd = Math.hypot(hx, hz);
  if (hd > sp.def.homeRange) {
    ncx = a.home.x + hx / hd * sp.def.homeRange;
    ncz = a.home.z + hz / hd * sp.def.homeRange;
  }
  a.cx = ncx; a.cz = ncz;

  // A circle joined inside its rim spirals out to it.
  a.cRad += (a.cR - a.cRad) * Math.min(1, dt * 0.25);
  a.cTh += a.cDir * speed / Math.max(a.cRad, 2) * dt;   // the pace on the rim, any radius
  a.x = a.cx + Math.sin(a.cTh) * a.cRad;
  a.z = a.cz + Math.cos(a.cTh) * a.cRad;
  a.heading = Math.atan2(a.cDir * Math.cos(a.cTh), -a.cDir * Math.sin(a.cTh));
  a.yaw += Math.max(-turn, Math.min(turn, wrapAngle(a.heading - a.yaw)));
  glideAltitude(a, L, dt, mid);
  a.speed = speed;
  // The bank: a steady turn at v round R leans atan(v²/gR), read from the
  // turn's direction and scaled to read at a distance; eased, so a flip of
  // the circle reads as a slow wing-over, not a snap.
  const lean = Math.atan(speed * speed / (GLIDE_G * a.cR)) * (F.bank ?? 2.2);
  const rollWant = Math.max(-0.55, Math.min(0.55, lean)) * a.cDir;
  a.roll += (rollWant - a.roll) * Math.min(1, dt * 1.5);
  return false;
}

// ---------------------------------------------------------------------------
// amphibious — the California sea lions (wildlifeSeaLion.js). Ground on the
// haul-out rocks — layout.spots.haulouts, whose spots carry the walkable top
// in y — and surface swimming between them; the dive itself is the species'
// tick running the manager's own HIDDEN (the body sinks) and EMERGE (it
// surfaces nearby), so the motion only ever walks or swims. One steering,
// two floors: within AMPH_ROCK_REACH of a haul-out's edge the agent walks up
// its top, outside it the sea carries it (seaHeightAt's live surface,
// waterAt, else the terrain — flockSeaY above). The speed the state asks
// for is the crawl; the swim rides def.dive.swim times it. No allocation
// per call.
//
// Optional definition keys (def.dive; a species that leaves it out swims on
// these defaults):
//   swim 2.4             the swim's speed as a multiple of the crawl
//   anchors 'haulouts'   the layout.spots index of the rocks it hauls out on
// ---------------------------------------------------------------------------
const AMPH_ROCK_REACH = 2.2;   // m: how far off a haul-out's edge the climb starts
const AMPH_SWIM = 2.4;         // the swim's default multiple of the crawl

// The floor under (x, z): every haul-out within reach lifts it, the highest
// lift wins — so the floor stays continuous between two rocks, where "the
// nearest rock" would flip and jump the body from one top to the other.
// Module scratch, no allocation per call: amphK is how far up a rock the
// point is (0 open water, 1 on a top). Exported for a species' own hooks
// (the sea lion's dive asks the same question as its motion).
export const amphFloor = { k: 0, y: 0 };
let _amphSea = 0, _amphBest = 0;
function amphVisit(s, d) {
  // d is signed (negative inside the spot), so the ramp clamps — deep inside
  // a rock k would run past 1 and the cubic would dive below the sea.
  const k = Math.min(1, Math.max(0, 1 - d / AMPH_ROCK_REACH));
  const sk = k * k * (3 - 2 * k);
  const lift = (s.y - _amphSea) * sk;
  if (lift > _amphBest) { _amphBest = lift; amphFloor.k = sk; }
}
export function amphibiousFloor(x, z, L, t, anchors = 'haulouts') {
  _amphSea = flockSeaY(x, z, L, t);
  _amphBest = 0; amphFloor.k = 0;
  const rocks = L.spots && L.spots[anchors];
  if (rocks) rocks.each(x, z, AMPH_ROCK_REACH, amphVisit);
  amphFloor.y = _amphSea + _amphBest;
  return amphFloor.y;
}

function amphibiousStep(a, sp, dt, ctx, speed) {
  const L = ctx.layout;
  const dx = a.tx - a.x, dz = a.tz - a.z;
  const d = Math.hypot(dx, dz);
  if (d < ARRIVE) { a.speed = 0; return true; }
  const want = Math.atan2(dx, dz);
  const turn = sp.def.speed.turn * dt;
  a.heading += Math.max(-turn, Math.min(turn, wrapAngle(want - a.heading)));
  // The crawl is what the state asked for; the swim rides dive.swim times it,
  // blended across the rock's skirt as the floor is.
  const D = sp.def.dive || EMPTY_FLY;
  amphibiousFloor(a.x, a.z, L, ctx.t, D.anchors);
  const swimK = 1 + ((D.swim || AMPH_SWIM) - 1) * (1 - amphFloor.k);
  // Slow into the last few centimetres so nothing overshoots and circles.
  const v = Math.min(speed * swimK, d / Math.max(dt, 1e-3), speed * swimK * (0.35 + d * 2));
  const step = Math.min(v * dt, d);
  a.x += Math.sin(a.heading) * step;
  a.z += Math.cos(a.heading) * step;
  // The floor: the rocks' tops blended into the live sea across their skirts.
  a.y = amphibiousFloor(a.x, a.z, L, ctx.t, D.anchors);
  a.speed = step / Math.max(dt, 1e-3);
  // The body follows the heading (an amphibious has no sideways walk).
  const body = a.heading + sp.def.body.yawOffset;
  a.yaw += Math.max(-turn, Math.min(turn, wrapAngle(body - a.yaw)));
  return false;
}

export const MOTION = {
  ground: { step: groundStep, brief: 'on the terrain, steering at speed.turn' },

  hop: { step: hopStep, brief: 'ballistic sub-hops point to point; flee = hop into waterAt()' },

  // Dragonflies, hummingbirds. Hover at an anchor (flowers, the pool's
  // reeds) with a small figure-of-eight, then dart in straight zigzags to the
  // next one inside an altitude band above the ground or the water. Reads
  // layout.spots.* for anchors; a.ty is the height.
  flyFree: { step: flyFreeStep, smooth: true, brief: 'hover at anchors, straight darting hops, altitude band' },

  // Bald eagle. — implemented for wildlifeEagle.js, the roster's planned
  // glide species: slow banked circles round a centre that drifts on the
  // wind inside homeRange, in a band above the ground or the water (glideStep
  // above); now and then a long glide to a fresh centre and the circles
  // resume the other way round. The bank is a.roll, applied by the engine.
  glide: {
    step: glideStep, smooth: true,
    init(sp, ctx) { for (const a of sp.agents) glideJoin(a, sp, ctx); },
    brief: 'soaring circles round a drifting centre, banked',
  },

  // Brown pelicans. A line abreast of the sea: the leader follows a loop over
  // the cove, the rest keep a slot behind and to one side through
  // wildlifeBoids (leader term + separation). Altitude follows the swell
  // a few metres up; occasional plunge dive. — implemented for
  // wildlifePelican.js, the roster's planned flock species: the leader
  // rides a constant-speed oval over the water its homes were sampled on;
  // the file behind it chases a point fly.delay seconds back down the
  // leader's own trail through wildlifeBoids; the band rides seaHeightAt's
  // water; now and then the leader plunges and the line follows it down.
  flock: {
    step: flockStep, smooth: true, group: true,
    init(sp, ctx) { if (sp.agents.length) flockInit(sp, ctx); },
    brief: 'follow-the-leader line via wildlifeBoids, over the sea',
  },

  // Silver fish in the pool. wildlifeBoids in 3-D, bounded by the bed
  // (terrainHeight) and the surface (waterAt(x, z).y); scatter from the
  // player when they wade in, regroup after. — implemented for
  // wildlifeFish.js, the roster's planned school species.
  school: {
    step: schoolStep, smooth: true, group: true,
    init(sp, ctx) { if (sp.agents.length) schoolInit(sp, ctx); },
    brief: '3-D boids bounded by bed and surface (wildlifeBoids)',
  },

  // California sea lions. — implemented for wildlifeSeaLion.js, the roster's
  // planned amphibious species: the crawl on the haul-out rocks' tops
  // (spots.haulouts) and the surface swim between them, one steering with
  // the floor blended across the rock's skirt (amphibiousStep above); the
  // dive is the species' own tick running the manager's own HIDDEN (the
  // body sinks by body.sinkDepth, out of the draw at full sink) and EMERGE
  // (its emergeAt surfaces it nearby).
  amphibious: { step: amphibiousStep, brief: 'ground on the haul-out rocks, surface swim between them' },
};
