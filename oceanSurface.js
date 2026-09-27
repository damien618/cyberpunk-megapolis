// oceanSurface.js — the island's sea-surface maths, as pure numbers: the wave
// table, the depth-based shoaling that lets the swell stand up and die on the
// shallows, and the GLSL twin of both. No THREE, no DOM — tests/jungle_ocean
// runs it under plain Chromium, the same contract jungleLayout.js keeps.
//
// One table feeds the JS (waterHeightAt, the tests) and the GLSL string the
// ocean material splices into its vertex shader, so the sea you see and the
// sea a floating thing will ride cannot drift apart. The swell is a lagoon's:
// three long trains and a short chop, under a metre from trough to crest.
//
// An island-reusable module by design: the two village maps will pass their
// own preset over OCEAN_PRESET (waveScale and colours at the least) and keep
// this file untouched.
// ---------------------------------------------------------------------------

const G = 9.81;
const TAU = Math.PI * 2;

// The default sea. Waves travel mostly toward +Z (ashore); dir is the
// horizontal propagation direction, len the wavelength (m), amp the crest
// height (m), steep the Gerstner steepness Q (0 = plain sine, crests pincer
// as it rises), phase a stagger so the trains do not align into rules.
export const OCEAN_PRESET = {
  // Master multiplier — per-map or per-zone tuning rides on this alone.
  waveScale: 1.0,
  // dir is (x, z): the big component goes on Z. The first version had
  // them swapped, so the swell ran ALONG the beach with its crests end-on
  // to the shore.
  waves: [
    { dir: [0.34, 0.94], len: 74, amp: 0.30, steep: 1.0, phase: 0.0 },
    { dir: [0.1, 0.995], len: 118, amp: 0.20, steep: 0.8, phase: 1.7 },
    { dir: [-0.53, 0.85], len: 46, amp: 0.15, steep: 0.5, phase: 3.9 },
    { dir: [0.24, 0.97], len: 34, amp: 0.08, steep: 0.3, phase: 5.1 },
  ],
  // Shoaling, from the real depth of water (metres): full swell seaward of
  // deepRef, amplitude eases up to shoalPeak as the bed rises to breakDepth,
  // and the swell is gone by dieDepth of water — where the foam takes over.
  deepRef: 10.0,
  shoalPeak: 1.3,
  breakDepth: 2.8,
  dieDepth: 0.35,
  // Fragment chop: the ripple the mesh cannot resolve lives in the normal
  // map, not in the vertices. rippleAmp multiplies it; it fades in shallows.
  rippleAmp: 1.0,
  // Colour ramp: turquoise over the sand, azures, then the deep channel.
  colors: { shallow: 0x6fe0d2, mid: 0x1fb0c8, deep: 0x0f6fa8 },   // deep: a saturated ocean blue; 0x145a7c read grey at grazing angles
  midDepth: 3.5,
  deepDepth: 14.0,
  // Transparency: the sand shows through the shallows; deep water does not.
  // The shallows read by COLOUR first (main-BEACH's rule): at 0.16 the whole
  // wadeable lagoon, 0–1.4 m deep, was mostly the sand under it, and the
  // player standing in the sea saw a beach.
  alphaShallow: 0.5,
  alphaDeep: 0.94,
  alphaRampDepth: 1.0,   // metres of water to reach alphaDeep
  // Sky reflection: Schlick fresnel picks how much of the dome comes back.
  reflection: 0.4,
  // Sun glint: the standard material's GGX highlight off the wave normal.
  // Broad enough to read as a glitter path, not a milk sheet, at grazing.
  roughness: 0.3,
  // White water: breakers draw where the water is foamBreak deep; the shore
  // band of thin wash foams the last shoreFoam metres before the sand.
  foamBreak: 1.1,
  shoreFoam: 0.8,
  // The swash: period of a run up the sand, how far it reaches (signed
  // metres from the waterline, base shoreward of it), matched to the wet
  // band the terrain paints (see terrainMasks' beachWet).
  swash: { period: 7.2, reachMin: 2.2, reachMax: 6.0, base: -1.4 },
};

// Overlay a per-map / per-zone preset on the default one, section by section.
export function resolvePreset(override) {
  const o = override || {};
  return {
    ...OCEAN_PRESET, ...o,
    waves: o.waves || OCEAN_PRESET.waves,
    colors: { ...OCEAN_PRESET.colors, ...(o.colors || {}) },
    swash: { ...OCEAN_PRESET.swash, ...(o.swash || {}) },
  };
}

// Per-wave derived numbers, computed once: wavenumber and the deep-water
// dispersion speed. Both the JS and the GLSL side bake these exact values.
export function resolveWaves(preset = OCEAN_PRESET) {
  return preset.waves.map(w => {
    const k = TAU / w.len;
    return { ...w, k, omega: Math.sqrt(G * k) };
  });
}

const clamp01 = v => (v < 0 ? 0 : v > 1 ? 1 : v);
const sstep = (x, a, b) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

// Amplitude scale from the depth of water here: 1 offshore, a little over 1
// as the bed shoals, and 0 where the water is too thin to carry a wave.
export function seaScaleAt(depth, preset = OCEAN_PRESET) {
  const alive = sstep(depth, preset.dieDepth, preset.breakDepth);
  const shoal = 1 + (preset.shoalPeak - 1) * (1 - sstep(depth, preset.breakDepth, preset.deepRef));
  return alive * shoal;
}

// Free-surface height at (x, z), the JS twin of the shader's displacement —
// vertical sum only: the Gerstner horizontal swirl is texture-space motion a
// floating thing need not follow. scale carries the shoaling (see above).
export function swellHeightAt(x, z, t, preset = OCEAN_PRESET, scale = 1) {
  let h = 0;
  for (const w of resolveWaves(preset)) {
    const A = w.amp * preset.waveScale * scale;
    h += A * Math.sin(w.k * (w.dir[0] * x + w.dir[1] * z) - w.omega * t + w.phase);
  }
  return h;
}

// What floats or wades asks the sea: level plus the full swell, shoaled and
// dying by the real depth here. depthAt(x, z) reports seaY minus the bed
// (the ocean module wires it to its layout's terrainHeight); it may report
// land as negative — clamped here. The fragment-only chop is deliberately
// not in the answer, so buoyancy never jitters against what the eye sees.
export function waterHeightAt(x, z, t, { seaY, depthAt, preset }) {
  const depth = Math.max(depthAt(x, z), 0);
  return seaY + swellHeightAt(x, z, t, preset, seaScaleAt(depth, preset));
}

// The GLSL twin, generated from the same table so the numbers cannot drift.
// Declares uWaveScale itself — the ocean material provides the value. Each
// wave is unrolled with its baked wavenumber, dispersion speed and phase.
// seaGerstner hands back height and horizontal displacement through the out
// parameters (all scaled by `scale`) and the world-space normal ingredients:
// gradOut = (dh/dx, dh/dz), gradZOut = Gerstner's vertical pinch sum, so the
// normal is normalize(vec3(-gradOut.x, 1 - gradZOut, -gradOut.y)).
export function gerstnerGLSL(preset = OCEAN_PRESET) {
  const f = v => Number(v).toFixed(6);
  const body = resolveWaves(preset).map((w, i) => `  { // wave ${i}: ${w.len} m, amp ${w.amp}, dir (${w.dir[0]}, ${w.dir[1]})
    vec2 D${i} = vec2(${f(w.dir[0])}, ${f(w.dir[1])});
    float k${i} = ${f(w.k)};
    float w${i} = ${f(w.omega)};
    float A${i} = ${f(w.amp)} * uWaveScale;
    float Q${i} = ${f(w.steep)};
    float ph${i} = k${i} * dot(D${i}, p) - w${i} * t + ${f(w.phase)};
    float S${i} = sin(ph${i}), C${i} = cos(ph${i});
    h += A${i} * S${i};
    disp += D${i} * (Q${i} * A${i} * C${i});
    grad.x += A${i} * k${i} * D${i}.x * C${i};
    grad.y += A${i} * k${i} * D${i}.y * C${i};
    grad.z += Q${i} * A${i} * k${i} * S${i};
  }`).join('\n');
  return `uniform float uWaveScale;
void seaGerstner(vec2 p, float t, float scale, out float h, out vec2 disp,
    out vec2 gradOut, out float gradZOut) {
  h = 0.0; disp = vec2(0.0); gradOut = vec2(0.0); gradZOut = 0.0;
  vec3 grad = vec3(0.0);
${body}
  h *= scale;
  disp *= scale;
  grad *= scale;
  gradOut = grad.xy;
  gradZOut = grad.z;
}`;
}

