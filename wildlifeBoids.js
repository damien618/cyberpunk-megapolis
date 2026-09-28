// wildlifeBoids.js — light boids for the animals that move as a group: fish
// schooling in the pool, pelicans flying in line, a loose swarm of
// dragonflies. PURE: no THREE, no scene, no DOM, so tests can hold it to
// its rules and any motion (wildlifeMotion's `school`, `flock`) can drive it.
//
// A boid is any object with { x, y, z, vx, vy, vz }; the step writes new
// velocities and positions in place and allocates nothing. O(N²) — right for
// the handfuls the island needs (≤ 40 per group); a bigger crowd would want
// a grid first.
//
// Forces, each weighted by params:
//   separation  push off neighbours closer than `sepDist`
//   alignment   match the mean heading of neighbours within `viewDist`
//   cohesion    drift toward their centre
//   target      steer toward params.target { x, y, z } (a loop point, a
//               leader's slot, a flower) — the flock's intent — with
//               weight targetWeight
//   flee        away from params.threat { x, y, z } within `fleeDist`
//   bounds      bounds(b, out) writes a steering force into out {x,y,z}:
//               the water's bed and surface for fish, an altitude band
//               for birds. Optional.
// Speeds are clamped to [minSpeed, maxSpeed]; `planar: true` keeps y fixed
// (a line of pelicans holding its height is steered by `target` instead).

export const BOID_DEFAULTS = {
  sepDist: 0.6, viewDist: 3,
  separation: 1.6, alignment: 0.6, cohesion: 0.4, targetWeight: 0.5, flee: 3,
  fleeDist: 4, minSpeed: 0.3, maxSpeed: 1.6, maxForce: 4,
  planar: false,
  target: null,           // { x, y, z } the group heads for, or null
  threat: null,           // { x, y, z } it scatters from (the player), or null
};

const _f = { x: 0, y: 0, z: 0 };

export function stepBoids(boids, params, dt, bounds = null) {
  const P = params;
  const sep2 = P.sepDist * P.sepDist, view2 = P.viewDist * P.viewDist;
  const n = boids.length;
  for (let i = 0; i < n; i++) {
    const b = boids[i];
    let sx = 0, sy = 0, sz = 0, ax = 0, ay = 0, az = 0, cx = 0, cy = 0, cz = 0, k = 0;
    for (let j = 0; j < n; j++) {
      if (j === i) continue;
      const o = boids[j];
      const dx = b.x - o.x, dy = b.y - o.y, dz = b.z - o.z;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 > view2) continue;
      if (d2 < sep2 && d2 > 1e-8) {
        // Stronger the closer: 1/d falloff, normalised by sepDist.
        const w = (P.sepDist / Math.sqrt(d2)) - 1;
        sx += dx * w; sy += dy * w; sz += dz * w;
      }
      ax += o.vx; ay += o.vy; az += o.vz;
      cx += o.x; cy += o.y; cz += o.z;
      k++;
    }
    let fx = sx * P.separation, fy = sy * P.separation, fz = sz * P.separation;
    if (k) {
      fx += (ax / k - b.vx) * P.alignment + (cx / k - b.x) * P.cohesion;
      fy += (ay / k - b.vy) * P.alignment + (cy / k - b.y) * P.cohesion;
      fz += (az / k - b.vz) * P.alignment + (cz / k - b.z) * P.cohesion;
    }
    if (P.target) {
      fx += (P.target.x - b.x) * P.targetWeight;
      fy += (P.target.y - b.y) * P.targetWeight;
      fz += (P.target.z - b.z) * P.targetWeight;
    }
    if (P.threat) {
      const dx = b.x - P.threat.x, dy = b.y - P.threat.y, dz = b.z - P.threat.z;
      const d = Math.hypot(dx, dy, dz);
      if (d < P.fleeDist && d > 1e-6) {
        const w = P.flee * (1 - d / P.fleeDist) / d;
        fx += dx * w * P.maxSpeed; fy += dy * w * P.maxSpeed; fz += dz * w * P.maxSpeed;
      }
    }
    if (bounds) {
      _f.x = 0; _f.y = 0; _f.z = 0;
      bounds(b, _f);
      fx += _f.x; fy += _f.y; fz += _f.z;
    }
    // Clamp the steering, integrate, clamp the speed.
    const fl = Math.hypot(fx, fy, fz);
    if (fl > P.maxForce) { const s = P.maxForce / fl; fx *= s; fy *= s; fz *= s; }
    b.vx += fx * dt; b.vy += P.planar ? 0 : fy * dt; b.vz += fz * dt;
    if (P.planar) b.vy = 0;
    const v = Math.hypot(b.vx, b.vy, b.vz);
    const vc = Math.min(P.maxSpeed, Math.max(P.minSpeed, v));
    if (v > 1e-6) { const s = vc / v; b.vx *= s; b.vy *= s; b.vz *= s; }
  }
  // Move after every velocity is known, so the order of the array does not
  // bias the group.
  for (let i = 0; i < n; i++) {
    const b = boids[i];
    b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
  }
}

// Params over the defaults. Keep the result and mutate its target/threat
// each frame rather than rebuilding it.
export const boidParams = (o = {}) => ({ ...BOID_DEFAULTS, ...o });

// Helper for the common bound: a box, pushed back with `k` per metre of
// overshoot beyond a `margin` inside it (fish in a pool: x/z the pool's
// square, y between bed and surface).
export function boxBounds({ x, y, z }, margin = 0.3, k = 6) {
  const push = (v, a, b) => (v < a + margin ? (a + margin - v) * k : v > b - margin ? (b - margin - v) * k : 0);
  return (b, out) => {
    out.x = push(b.x, x[0], x[1]);
    out.y = push(b.y, y[0], y[1]);
    out.z = push(b.z, z[0], z[1]);
  };
}
