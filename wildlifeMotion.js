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
// Only `ground` is implemented. The others are declared so a species that
// needs one finds its brief here; each throws a clear error until written.
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

const notYet = (name, brief) => ({
  brief,
  step() {
    throw new Error(`[wildlife] motion "${name}" is declared but not implemented yet — ${brief}`);
  },
});

export const MOTION = {
  ground: { step: groundStep, brief: 'on the terrain, steering at speed.turn' },

  // Tree frogs. Ballistic arcs between points (a.ty is the apex height): a
  // crouch, a hop of 0.3–1 m, a rest. Fleeing hops toward layout.waterAt
  // (the pool) and HIDDEN is underwater. Needs a.vy and gravity; stride
  // drives the legs' kick in the GLSL.
  hop: notYet('hop', 'ballistic arcs point to point; flee = hop into waterAt()'),

  // Dragonflies, hummingbirds. Hover at an anchor (flowers, the pool's
  // reeds) with a small figure-of-eight, then dart in straight zigzags to the
  // next one inside an altitude band above the ground or the water. Reads
  // layout.spots.* for anchors; a.ty is the height.
  flyFree: notYet('flyFree', 'hover at anchors, straight darting hops, altitude band'),

  // Bald eagle. Circles of radius R around a centre that drifts slowly over
  // the ridge; banks into the turn (a.roll from the turn rate); now and then
  // a long glide to a new centre. Never lands, never flees.
  glide: notYet('glide', 'soaring circles round a drifting centre, banked'),

  // Brown pelicans. A line abreast of the sea: the leader follows a loop over
  // the cove, the rest keep a slot behind and to one side through
  // wildlifeBoids (leader term + separation). Altitude follows the swell
  // (ctx.layout.waterAt) a few metres up; occasional plunge dive.
  flock: notYet('flock', 'follow-the-leader line via wildlifeBoids, over the sea'),

  // Silver fish in the pool. wildlifeBoids in 3-D, bounded by the bed
  // (terrainHeight) and the surface (waterAt(x, z).y); scatter from the
  // player when they wade in, regroup after.
  school: notYet('school', '3-D boids bounded by bed and surface (wildlifeBoids)'),

  // California sea lions. `ground` on the haul-out rocks (they need rock
  // spots offshore), then swimming at the surface (ocean.waterHeightAt) with
  // dives: HIDDEN is underwater, EMERGE surfaces somewhere else nearby.
  amphibious: notYet('amphibious', 'ground on rocks, surface swim and dives'),
};
