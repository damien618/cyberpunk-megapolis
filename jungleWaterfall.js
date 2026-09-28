// jungleWaterfall.js — the falls, the plunge pool, the foam and spray at its
// foot, the mist that rises off the pool, and the stream that drains the pool
// to the sea.
//
// Nothing here is textured and nothing is updated per particle on the CPU:
// every animation is a function of one time uniform inside the shaders (the
// falling sheet, the crest feed, the foam, the splash droplets, the mist, the
// pool's ripple rings, the stream), so update(t) sets uniforms and that is
// the whole per-frame cost. Every transparent layer sets depthWrite:false,
// discards dead fragments early and rides an ordered renderOrder — on a
// MacBook Air the fill rate is what runs out first.
//
// REUSABLE AT ISLAND SCALE, like jungleOcean: createJungleWaterfall takes a
// `preset` over CASCADE_PRESET (flow, mist, splash, foam, ripples, colours)
// and derives its geometry from a falls spec — lip position, drop, width —
// that defaults to the layout's FALLS/POOL. A second falls or a river
// elsewhere on the island is another spec and preset plus the exported
// builders, not a copy of this file. The pool and the stream share one
// fresh-water ramp (freshShallow / freshDeep) and one material law, so the
// water cannot change character where it leaves the pool.
//
// SOUND (prepared, not implemented): the returned `audioAnchor` is the
// Object3D a spatialised cascade hangs on. When this map gets audio, put one
// THREE.AudioListener on the camera (main-CRUISE.js's ballroom pattern) and
// then:
//   const sound = new THREE.PositionalAudio(listener);
//   sound.setBuffer(cascadeBuffer);   // AudioLoader, looped
//   sound.setRefDistance(6);          // audible from the path, full at the pool
//   sound.setRolloffFactor(1.4);
//   falls.audioAnchor.add(sound);
// The anchor sits ~2.5 m above the impact, at the foot of the sheet.
import * as THREE from 'three';
import {
  FALLS, POOL, POOL_IMPACT, terrainHeight,
  FALLS_LAUNCH, FALLS_LIP_Y,
  streamX, streamWaterY, STREAM_Z0, STREAM_HALF_W, shoreAt,
} from './jungleLayout.js';


// Per-map / per-zone tuning, overlay-able section by section (jungleOcean's
// preset contract). Defaults describe THIS map's cascade.
export const CASCADE_PRESET = {
  flow: 1.0,     // visual throughput: scroll speed and aeration of the sheet
  foam: 1.0,     // the churned disc where the sheet lands
  splash: 1.0,   // impact droplets
  mist: 1.0,     // the rising mist (also scales the active particle count)
  ripples: 1.0,  // the pool's concentric rings spreading from the impact
  fallsDeep: 0x8cb8bd,   // the sheet's body (the old vec3(.55,.72,.74))
  fallsWhite: 0xf6fbff,  // its aerated white
  // Fresh water, pool and stream alike. Not the lagoon's colours: its pale
  // turquoise is what water looks like over WHITE SAND, and over the dark
  // forest floor it read as a milky film on the stream.
  freshShallow: 0x3f7d68,
  freshDeep: 0x1b5f6c,
};

function resolveCascadePreset(override) {
  const o = override || {};
  return { ...CASCADE_PRESET, ...o };
}

const NOISE_GLSL = `
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float vnoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
               mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
  }`;

// ShaderMaterials do not get scene fog unless they ask for it. Without it
// the falls glowed through 150 m of haze as if pasted on the fog.
function fogShader({ uniforms, vertex, fragment, ...opts }) {
  return new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, uniforms]),
    fog: true,
    vertexShader: `
      #include <fog_pars_vertex>
      ${vertex.head || ''}
      void main() {
        ${vertex.body}
        vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        ${vertex.tail || ''}
        #include <fog_vertex>
      }`,
    fragmentShader: `
      #include <fog_pars_fragment>
      ${NOISE_GLSL}
      ${fragment.head || ''}
      void main() {
        ${fragment.body}
        #include <fog_fragment>
      }`,
    ...opts,
  });
}

// Where the free-falling sheet is `drop` metres below a lip at lipZ. For
// this map's falls it is exactly jungleLayout's fallsSheetZ — the curve the
// cliff rocks are kept clear of; another spec gets the same physics.
function sheetZ(lipZ, drop) {
  return lipZ - 0.2 - FALLS_LAUNCH * Math.sqrt(2 * Math.max(drop, 0) / 9.8);
}

// The falls this map shows: everything derives from the layout, so the sheet
// cannot disagree with the terrain. Another cascade elsewhere passes its own
// spec ({ x, lipZ, lipY, waterY, width }).
function defaultSpec() {
  const lipY = FALLS_LIP_Y;
  const drop = lipY - POOL.waterY;
  return {
    x: FALLS.x, lipZ: FALLS.z, lipY,
    waterY: POOL.waterY, width: FALLS.width, drop,
    impactZ: sheetZ(FALLS.z, drop),
  };
}

// The sheet: a curved ribbon whose top curls over the lip and whose body
// free-falls clear of the wall (the layout keeps the cliff rocks out of its
// way), and whose shader draws ropes of water — fat and white mid-sheet,
// thin veils at the edges — aerating as it falls. It does not hug the face:
// drawn 6 cm off the terrain it passed behind the boulders stacked on that
// face and disappeared into them.
function buildFallsSheet(spec, P) {
  const { x, lipZ, lipY, waterY, width, drop } = spec;
  const SEG_X = 12, SEG_Y = 40;
  const g = new THREE.PlaneGeometry(1, 1, SEG_X, SEG_Y);
  const p = g.getAttribute('position'), uv = g.getAttribute('uv');
  for (let i = 0; i < p.count; i++) {
    const u = uv.getX(i), v = 1 - uv.getY(i);   // v: 0 at the lip
    const lip = 0.12;
    let y, z;
    if (v < lip) {
      // The top curls over the lip, riding a hand's depth of water.
      const k = v / lip;
      y = lipY + 0.06 * Math.cos(k * Math.PI / 2);
      z = lipZ + 0.55 * (1 - k) - 0.15 * k;   // a tight hood, not a pipe
    } else {
      const t = (v - lip) / (1 - lip);
      const d = t * (drop + 0.3);
      y = lipY - d;
      z = sheetZ(lipZ, d);
    }
    // The sheet spreads a little as it falls, and its edges hang back.
    const spread = 1 + v * 0.35;
    const px = x + (u - 0.5) * width * spread;
    z += Math.pow(Math.abs(u - 0.5) * 2, 3) * 0.6;
    // The notch is narrower than the sheet: over the lip the curl's edges
    // ride the real ground, never under it.
    if (v < 0.12) y = Math.max(y, terrainHeight(px, z) + 0.05);
    p.setXYZ(i, px, y, z);
  }
  g.computeVertexNormals();
  const mat = fogShader({
    uniforms: {
      uTime: { value: 0 },
      uFlow: { value: P.flow },
      uDeepCol: { value: new THREE.Color(P.fallsDeep) },
      uWhiteCol: { value: new THREE.Color(P.fallsWhite) },
    },
    vertex: { head: 'varying vec2 vUv;', body: 'vUv = uv; vec3 pos = position;' },
    fragment: {
      head: 'uniform float uTime, uFlow; uniform vec3 uDeepCol, uWhiteCol; varying vec2 vUv;',
      body: `
        float v = 1.0 - vUv.y;                     // 0 at the lip
        // Streaks: stretched noise scrolling down at two speeds, riding
        // uFlow so a lazy cascade reads lazier end to end.
        float s1 = vnoise(vec2(vUv.x * 22.0, v * 5.0 - uTime * 2.6 * uFlow));
        float s2 = vnoise(vec2(vUv.x * 55.0 + 3.1, v * 11.0 - uTime * 4.3 * uFlow));
        // Ropes: near-static columns that break the evenness — water falls
        // in ropes, not in a woven curtain.
        float ropes = vnoise(vec2(vUv.x * 7.5 + 7.7, v * 1.4 - uTime * 0.5 * uFlow));
        float streak = s1 * 0.48 + s2 * 0.26 + ropes * 0.26;
        // Transverse profile: a fat white rope mid-sheet, thin veils at the
        // edges; the whole sheet aerates (whitens, thickens) as it falls.
        float across = abs(vUv.x - 0.5) * 2.0;
        float mid = 1.0 - smoothstep(0.16, 0.6, across);
        float aeration = smoothstep(0.12, 0.95, v);
        vec3 body = uDeepCol * (1.0 - 0.18 * aeration);
        vec3 col = mix(body, uWhiteCol, clamp(
          smoothstep(0.38, 0.9, streak) * 0.85 + v * 0.12 + mid * 0.4, 0.0, 1.0));
        col = mix(col, uWhiteCol, smoothstep(0.06, 0.0, v) * 0.55);  // white crest at the lip
        float edge = smoothstep(0.0, 0.14, vUv.x) * smoothstep(1.0, 0.86, vUv.x);
        float a = mix(0.22, 0.9, mid) * (0.42 + 0.58 * streak);
        a *= 0.8 + 0.35 * aeration;
        a *= edge;
        a *= 1.0 - smoothstep(0.93, 1.0, v) * 0.6;    // melts into the spray
        if (a < 0.02) discard;
        gl_FragColor = vec4(col, a);`,
    },
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(g, mat);
  mesh.name = 'jungle_falls';
  mesh.renderOrder = 3;
  return mesh;
}

// The feed: a thin sheet over the notch's level bed just behind the lip, so
// the water ARRIVES instead of appearing. Six rows ride the real bed (read
// from the layout through terrainHeight); the flow scrolls toward the lip,
// the ribbon funnels into the notch and its upstream end fades out so it is
// born in the bed, not at a seam.
function buildCrestRivulet(spec, P) {
  const { x, lipZ } = spec;
  const ROWS = 6, ACROSS = 4;
  const Z0 = lipZ + 0.9, Z1 = lipZ + 4.0;       // downstream -> upstream
  const pos = new Float32Array(ROWS * ACROSS * 3);
  const uvA = new Float32Array(ROWS * ACROSS * 2);
  const idx = [];
  for (let i = 0; i < ROWS; i++) {
    const t = i / (ROWS - 1);                   // 0 at the lip, 1 upstream
    const z = Z0 + (Z1 - Z0) * t;
    const y = terrainHeight(x, z) + 0.07;
    const w = 1.0 - 0.3 * t;                    // funnels toward the lip
    for (let k = 0; k < ACROSS; k++) {
      const s = (k / (ACROSS - 1)) * 2 - 1;
      const j = i * ACROSS + k;
      pos[j * 3] = x + s * w; pos[j * 3 + 1] = y; pos[j * 3 + 2] = z;
      uvA[j * 2] = k / (ACROSS - 1);
      uvA[j * 2 + 1] = 1 - t;                   // v grows downstream
    }
  }
  for (let i = 0; i < ROWS - 1; i++) for (let k = 0; k < ACROSS - 1; k++) {
    const a = i * ACROSS + k, b = a + 1, c = a + ACROSS, d2 = c + 1;
    idx.push(a, b, c, b, d2, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uvA, 2));
  g.setIndex(idx);
  const mat = fogShader({
    uniforms: { uTime: { value: 0 }, uFlow: { value: P.flow } },
    vertex: { head: 'varying vec2 vUv;', body: 'vUv = uv; vec3 pos = position;' },
    fragment: {
      head: 'uniform float uTime, uFlow; varying vec2 vUv;',
      body: `
        float n = vnoise(vec2(vUv.x * 7.0, vUv.y * 6.0 - uTime * 1.7 * uFlow))
                + 0.5 * vnoise(vec2(vUv.x * 16.0 + 4.2, vUv.y * 12.0 - uTime * 3.1 * uFlow));
        vec3 col = mix(vec3(0.22, 0.40, 0.42), vec3(0.66, 0.82, 0.84), smoothstep(0.55, 1.25, n));
        float edge = smoothstep(0.0, 0.38, vUv.x) * smoothstep(1.0, 0.62, vUv.x);
        float a = (0.2 + 0.22 * n) * edge;
        a *= smoothstep(0.0, 0.45, vUv.y);      // born in the bed, not at a seam
        if (a < 0.02) discard;
        gl_FragColor = vec4(col, a);`,
    },
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(g, mat);
  mesh.name = 'jungle_falls_crest';
  mesh.renderOrder = 2;
  return mesh;
}

// The pool: a Standard material spliced like the sea's (jungleOcean's
// pattern) so it keeps the scene lights, fog and normal-map chop, with the
// lagoon's own colour ramp over the real bowl — depth from the ground under
// each vertex (aBed, baked from terrainHeight at build: the whole bed,
// outlet channel included; a GLSL twin of the bowl alone left the channel
// out, so the water stopped short of it and the stream's head showed dry)
// drives colour, transparency and a soft rim where the bed crosses the
// waterline — and concentric rings from the impact tilted into the normal
// so the sun glint rides them.
function buildPool(waterNormal, P, spec) {
  // The pool keeps the sea's normal map but at its own tile scale: the disc
  // spans its own 0..1 UV, so the sea's repeat would tile ~22x across 18 m.
  // But the sea's map streams in asynchronously (TextureLoader), and a clone
  // taken before it lands copies image = null forever — no chop, and a
  // console warning on every bind. So the clone only claims to be ready when
  // the image exists; createJungleWaterfall's update() adopts it otherwise,
  // one `===` per frame until it does.
  const normal = waterNormal.clone();
  normal.repeat.set(2.2, 2.2);
  // clone() → copy() flags needsUpdate itself; unflag it while the image is null.
  if (waterNormal.image) normal.needsUpdate = true; else normal.version = 0;
  const uniforms = {
    uTime: { value: 0 },
    uPoolY: { value: spec.waterY },
    uImpact: { value: new THREE.Vector2(POOL_IMPACT.x, POOL_IMPACT.z) },
    // The outlet, and the axis from the pool's centre to it: the pool's
    // surface drifts toward it so you see the water leave for the stream.
    uOutlet: { value: new THREE.Vector2(streamX(STREAM_Z0), STREAM_Z0) },
    uAxis: { value: new THREE.Vector2(streamX(STREAM_Z0) - POOL.x, STREAM_Z0 - POOL.z).normalize() },
    uFlow: { value: P.flow },
    uRipples: { value: P.ripples },
    uShallowCol: { value: new THREE.Color(P.freshShallow) },
    uDeepCol: { value: new THREE.Color(P.freshDeep) },
    uMidDepth: { value: 1.0 },
    uAlphaShallow: { value: 0.3 },
    uAlphaDeep: { value: 0.88 },
    uAlphaRamp: { value: 1.15 },
  };
  const mat = new THREE.MeshStandardMaterial({
    color: P.freshDeep,
    roughness: 0.08, metalness: 0.05,
    transparent: true, opacity: 0.85,
    normalMap: normal, normalScale: new THREE.Vector2(0.35, 0.35),
  });
  mat.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
        uniform float uPoolY;
        attribute float aBed;
        varying vec3 vPoolWp;
        varying float vPoolDep;
        varying float vPoolRaw;`)
      .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
        vec3 poolWp = (modelMatrix * vec4(position, 1.0)).xyz;
        vPoolWp = poolWp;
        vPoolRaw = uPoolY - aBed;
        vPoolDep = max(vPoolRaw, 0.0);`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform float uTime, uRipples;
        uniform float uMidDepth, uAlphaShallow, uAlphaDeep, uAlphaRamp;
        uniform vec3 uShallowCol, uDeepCol;
        uniform vec2 uImpact, uOutlet, uAxis;
        uniform float uFlow;
        varying vec3 vPoolWp;
        varying float vPoolDep;
        varying float vPoolRaw;
        ${NOISE_GLSL}
        // The current toward the outlet: a funnel of drifting flecks,
        // strongest at the mouth, fading back into the still pool. The
        // pattern slides along the axis at ~1.6 m/s, the stream's pace.
        float poolDrift(vec2 p, out float w) {
          vec2 q = p - uOutlet;
          float along = dot(q, uAxis);                 // < 0 inside the pool
          float across = dot(q, vec2(-uAxis.y, uAxis.x));
          float back = max(-along, 0.0);
          w = exp(-back / 4.5)
            * (1.0 - smoothstep(1.4 + 0.45 * back, 2.8 + 0.8 * back, abs(across)));
          return vnoise(vec2(across * 2.2 / (1.0 + 0.12 * back),
                             along * 0.8 - uTime * 1.3 * uFlow));
        }`)
      .replace('vec4 diffuseColor = vec4( diffuse, opacity );', `
        vec4 diffuseColor = vec4( diffuse, opacity );
        // Depth colour: the lagoon's ramp over the pool's real bowl.
        // Shallow at the rim, deep in the middle (the arguments were once
        // swapped, which painted the rim dark and the deep centre pale).
        diffuseColor.rgb = mix(uShallowCol, uDeepCol, smoothstep(0.0, uMidDepth, vPoolDep));
        float driftW;
        float drift = poolDrift(vPoolWp.xz, driftW);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.9, 0.96, 0.95),
          smoothstep(0.62, 0.9, drift) * driftW * 0.45);
        // Transparency by depth; the signed depth fades the disc out over
        // the rim — the waterline is where the bed crosses the surface,
        // not where the mesh ends.
        diffuseColor.a *= smoothstep(-0.18, 0.5, vPoolRaw)
          * mix(uAlphaShallow, uAlphaDeep, smoothstep(0.02, uAlphaRamp, vPoolDep));
        // Down the outlet the water is the stream's from here on: the pool
        // fades out over two metres where the stream is already opaque.
        diffuseColor.a *= 1.0 - smoothstep(${(POOL.r + 1.5).toFixed(2)}, ${(POOL.r + 3.5).toFixed(2)},
          length(vPoolWp.xz - vec2(${POOL.x.toFixed(2)}, ${POOL.z.toFixed(2)})));`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        // Concentric rings spreading from the impact, tilted into the normal
        // in view space (the sea's chop trick, radial) so the glint rides.
        {
          vec2 dImp = vPoolWp.xz - uImpact;
          float dLen = max(length(dImp), 0.001);
          float slope = cos(dLen * 2.4 - uTime * 3.0) * exp(-dLen * 0.5) * uRipples;
          vec3 vs = (viewMatrix * vec4(dImp.x / dLen, 0.0, dImp.y / dLen, 0.0)).xyz;
          normal = normalize(normal + vec3(vs.x, vs.y, 0.0) * slope * 0.7);
          // The drift's ridges catch the light too.
          float dw;
          float dn = poolDrift(vPoolWp.xz, dw);
          vec3 va = (viewMatrix * vec4(uAxis.x, 0.0, uAxis.y, 0.0)).xyz;
          normal = normalize(normal + vec3(va.x, va.y, 0.0) * (dn - 0.5) * 0.5 * dw);
        }`);
  };
  const R = POOL.r + 2.2;
  // 0.65 m cells: fine enough to draw the 3.6 m outlet channel's banks.
  const g = new THREE.PlaneGeometry(R * 2, R * 2, 40, 40).rotateX(-Math.PI / 2);
  g.translate(POOL.x, spec.waterY, POOL.z);
  const gp = g.getAttribute('position');
  const bed = new Float32Array(gp.count);
  for (let i = 0; i < gp.count; i++) bed[i] = terrainHeight(gp.getX(i), gp.getZ(i));
  g.setAttribute('aBed', new THREE.BufferAttribute(bed, 1));
  const mesh = new THREE.Mesh(g, mat);
  mesh.name = 'jungle_pool';
  // The disc is a 26 m square whose corners are fully transparent. Writing
  // depth, those invisible corners hid everything just under the surface —
  // the stream's first metres, 4 cm below the pool — and left a dry bar of
  // ground between pool and stream. Drawn after the stream (1), before the
  // falls (3), without depth writes.
  mat.depthWrite = false;
  mesh.renderOrder = 2;
  return { mesh, normal, uniforms };
}

// A churned disc where the sheet hits the pool: a low dome of spray that
// heaves in the vertex stage, with ragged rings running outward through it
// in the fragment stage. uStrength (preset.foam) scales the whole thing.
function buildImpactFoam(impact, P, waterY) {
  const mat = fogShader({
    uniforms: { uTime: { value: 0 }, uStrength: { value: P.foam } },
    vertex: {
      head: 'uniform float uTime; varying vec2 vUv;',
      body: `
        vUv = uv; vec3 pos = position;
        vec2 c = vUv - 0.5;
        float dome = 1.0 - smoothstep(0.0, 0.5, length(c) * 2.0);
        pos.y += dome * (0.22 + 0.1 * sin(uTime * 2.7 + vUv.x * 9.0) * sin(uTime * 3.9 + vUv.y * 7.0));`,
    },
    fragment: {
      head: 'uniform float uTime, uStrength; varying vec2 vUv;',
      body: `
        vec2 c = vUv - 0.5;
        float r = length(c) * 2.0;
        float ang = atan(c.y, c.x);
        float n1 = vnoise(vec2(ang * 4.0, r * 6.0 - uTime * 1.6));
        float n2 = vnoise(vec2(ang * 7.0 + 2.2, r * 11.0 - uTime * 2.8));
        // Ragged rings running outward through the churn.
        float rings = 0.5 + 0.5 * sin(r * 14.0 - uTime * 2.6 + n1 * 3.0);
        float core = 1.0 - smoothstep(0.0, 0.42, r);
        float band = (1.0 - smoothstep(0.3, 1.0, r + (n2 - 0.5) * 0.45))
                   * smoothstep(0.05, 0.35, r);
        float alpha = (core * 0.9 + band * (0.3 + 0.55 * rings) * (0.55 + 0.45 * n2)) * uStrength;
        alpha *= 1.0 - smoothstep(0.75, 1.05, r + (n1 - 0.5) * 0.3);
        if (alpha < 0.02) discard;
        gl_FragColor = vec4(vec3(0.95, 0.98, 1.0), alpha * 0.9);`,
    },
    transparent: true,
    depthWrite: false,
  });
  const g = new THREE.PlaneGeometry(FALLS.width * 2.2, 7.5, 12, 8).rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(g, mat);
  mesh.position.set(impact.x, waterY + 0.05, impact.z);
  mesh.renderOrder = 3;
  mesh.name = 'jungle_falls_foam';
  return mesh;
}

// Spray: a small ballistic droplet cloud driven entirely in the vertex
// shader — each point's flight is a function of (seed, time), launch speed
// included, so it rises, arcs and falls back into the pool with no CPU work
// and no per-frame buffer writes. Kept to ~90 points: it shares the falls'
// fill-rate budget on the integrated GPU.
function buildSplash(impact, P, waterY, count = 90) {
  const g = new THREE.BufferGeometry();
  const seeds = new Float32Array(count * 4);
  for (let i = 0; i < count * 4; i++) seeds[i] = Math.random();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
  g.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 4));
  const mat = fogShader({
    uniforms: {
      uTime: { value: 0 },
      uOrigin: { value: new THREE.Vector3(impact.x, waterY + 0.1, impact.z) },
      uStrength: { value: P.splash },
      uScale: { value: 300 },
    },
    vertex: {
      head: `uniform float uTime, uStrength, uScale; uniform vec3 uOrigin;
             attribute vec4 aSeed; varying float vLife;`,
      body: `
        float life = fract(uTime * (0.55 + aSeed.w * 0.5) + aSeed.x);
        vLife = life;
        float up0 = 1.8 + aSeed.z * 2.8;            // launch speed, m/s
        float T = 2.0 * up0 / 9.8;                  // back to launch height
        float tt = T * life;
        float ang = aSeed.y * 6.2831853;
        float rad = (0.3 + aSeed.z * 1.2) * (0.4 + life * 1.4);
        vec3 pos = uOrigin;
        pos.x += cos(ang) * rad;
        pos.z += sin(ang) * rad * 0.7 - life * 0.8; // biased seaward by the sheet
        pos.y += up0 * tt - 4.9 * tt * tt;`,
      tail: 'gl_PointSize = clamp((0.22 + life * 0.3) * uScale / -mvPosition.z, 1.0, 26.0);',
    },
    fragment: {
      head: 'uniform float uStrength; varying float vLife;',
      body: `
        vec2 c = gl_PointCoord - 0.5;
        float d = length(c);
        if (d > 0.5) discard;
        float a = (1.0 - smoothstep(0.12, 0.5, d)) * sin(vLife * 3.14159) * 0.5 * uStrength;
        if (a < 0.02) discard;
        gl_FragColor = vec4(vec3(0.94, 0.97, 1.0), a);`,
    },
    transparent: true,
    depthWrite: false,
  });
  const pts = new THREE.Points(g, mat);
  pts.frustumCulled = false;       // positions live in the shader
  pts.name = 'jungle_falls_splash';
  pts.renderOrder = 3;
  return pts;
}

// Mist: a cloud that rises and drifts out from the foot of the falls. Each
// point carries a seed; its whole life is a function of (seed, time).
// preset.mist scales the alpha through uIntensity AND the active count
// (draw range, set once at build — no per-frame cost), and the sprite size
// is capped so a close-up mist blob cannot eat the fill rate.
function buildMist(impact, P, waterY, count = 280) {
  const g = new THREE.BufferGeometry();
  const seeds = new Float32Array(count * 4);
  for (let i = 0; i < count * 4; i++) seeds[i] = Math.random();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
  g.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 4));
  g.setDrawRange(0, Math.round(count * Math.min(1, Math.max(0.2, P.mist))));
  const mat = fogShader({
    uniforms: {
      uTime: { value: 0 },
      uOrigin: { value: new THREE.Vector3(impact.x, waterY, impact.z) },
      uWidth: { value: FALLS.width },
      uScale: { value: 300 },
      uIntensity: { value: P.mist },
    },
    vertex: {
      head: `uniform float uTime, uWidth, uScale, uIntensity; uniform vec3 uOrigin;
             attribute vec4 aSeed; varying float vLife;`,
      body: `
        float life = fract(uTime * (0.16 + aSeed.w * 0.12) + aSeed.x);
        vLife = life;
        vec3 pos = uOrigin;
        pos.x += (aSeed.y - 0.5) * uWidth * (1.0 + life * 1.4);
        pos.z -= life * (2.5 + aSeed.z * 6.0);           // drifts out over the pool
        pos.y += 0.3 + life * (3.0 + aSeed.z * 6.0);`,
      tail: 'gl_PointSize = min((0.9 + life * 3.2) * uScale / -mvPosition.z, 46.0);',
    },
    fragment: {
      head: 'uniform float uIntensity; varying float vLife;',
      body: `
        vec2 c = gl_PointCoord - 0.5;
        float d = length(c);
        if (d > 0.5) discard;
        float a = (1.0 - smoothstep(0.1, 0.5, d)) * sin(vLife * 3.14159) * 0.22;
        a *= 0.35 + 0.65 * uIntensity;
        gl_FragColor = vec4(vec3(0.94, 0.97, 1.0), a);`,
    },
    transparent: true,
    depthWrite: false,
  });
  const pts = new THREE.Points(g, mat);
  pts.frustumCulled = false;       // positions live in the shader
  pts.name = 'jungle_mist';
  pts.renderOrder = 4;
  return pts;
}

// The stream: the pool's own water, carried down the channel. Same lit
// Standard material, same colour ramp by depth and the same alpha law, so
// where the stream leaves the pool the two waters meet without a seam. (The
// first stream was an unlit ShaderMaterial with a fixed colour: brighter
// than the pool it came out of, and blind to the forest's shade.)
//
// The ribbon is laid wider than the channel and knows the real bed under
// every vertex (aBed): its edges stop where the bank rises out of the water,
// not where the mesh happens to end, so it sits IN its bed instead of lying
// on the ground like a soft band. The head starts well inside the pool,
// under its surface, and is at full strength before the pool fades out.
function buildStream(waterNormal, P) {
  const zs = [];
  for (let z = STREAM_Z0 + 4; z > shoreAt(streamX(z)) - 3; z -= 1) zs.push(z);
  const ACROSS = 9;
  const HALF = STREAM_HALF_W + 2.6;            // past both banks
  const pos = new Float32Array(zs.length * ACROSS * 3);
  const uv = new Float32Array(zs.length * ACROSS * 2);
  const bed = new Float32Array(zs.length * ACROSS);
  let along = 0;
  for (let i = 0; i < zs.length; i++) {
    const z = zs[i], x = streamX(z);
    const dxdz = (streamX(z + 0.5) - streamX(z - 0.5));
    const l = Math.hypot(dxdz, 1);
    const nx = 1 / l, nz = -dxdz / l;
    if (i) along += Math.hypot(x - streamX(zs[i - 1]), z - zs[i - 1]);
    const y = streamWaterY(z);
    for (let k = 0; k < ACROSS; k++) {
      const s = (k / (ACROSS - 1)) * 2 - 1;
      const j = i * ACROSS + k;
      const px = x + nx * s * HALF, pz = z + nz * s * HALF;
      pos[j * 3] = px; pos[j * 3 + 1] = y; pos[j * 3 + 2] = pz;
      uv[j * 2] = (s * HALF) / 3; uv[j * 2 + 1] = along / 3;   // metres / 3
      bed[j] = terrainHeight(px, pz);
    }
  }
  const idx = [];
  for (let i = 0; i < zs.length - 1; i++) for (let k = 0; k < ACROSS - 1; k++) {
    const a = i * ACROSS + k, b = a + 1, c = a + ACROSS, d = c + 1;
    idx.push(a, b, c, b, d, c);      // wound to face up (+Y)
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setAttribute('aBed', new THREE.BufferAttribute(bed, 1));
  g.setIndex(idx);
  g.computeVertexNormals();

  // Its own clone of the sea's normal map, scrolled downstream in update().
  const normal = waterNormal.clone();
  // clone() → copy() flags needsUpdate itself; unflag it while the image is null.
  if (waterNormal.image) normal.needsUpdate = true; else normal.version = 0;
  const uniforms = {
    uTime: { value: 0 },
    uFlow: { value: P.flow },
    uShallowCol: { value: new THREE.Color(P.freshShallow) },
    uDeepCol: { value: new THREE.Color(P.freshDeep) },
    uMidDepth: { value: 1.0 },          // the pool's numbers, on purpose
    uAlphaShallow: { value: 0.3 },
    uAlphaDeep: { value: 0.88 },
    uAlphaRamp: { value: 1.15 },
  };
  const mat = new THREE.MeshStandardMaterial({
    color: P.freshDeep, roughness: 0.1, metalness: 0.05,
    transparent: true, depthWrite: false,
    normalMap: normal, normalScale: new THREE.Vector2(0.45, 0.45),
  });
  mat.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
        attribute float aBed;
        varying float vRaw;
        varying vec2 vFlowUv;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vRaw = position.y - aBed;
        vFlowUv = uv;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform float uTime, uFlow, uMidDepth, uAlphaShallow, uAlphaDeep, uAlphaRamp;
        uniform vec3 uShallowCol, uDeepCol;
        varying float vRaw;
        varying vec2 vFlowUv;
        ${NOISE_GLSL}`)
      .replace('vec4 diffuseColor = vec4( diffuse, opacity );', `
        vec4 diffuseColor = vec4( diffuse, opacity );
        float dep = max(vRaw, 0.0);
        diffuseColor.rgb = mix(uShallowCol, uDeepCol, smoothstep(0.0, uMidDepth, dep));
        // The current: flecks carried downstream at ~1.6 m/s (uv is metres
        // / 3), the pool's drift pace, so the water visibly leaves the pool
        // and keeps going; whiter over the shallows where it runs fast.
        float streak = vnoise(vec2(vFlowUv.x * 7.0, vFlowUv.y * 2.4 - uTime * 1.3 * uFlow))
                     * 0.7 + 0.3 * vnoise(vec2(vFlowUv.x * 15.0 + 3.1, vFlowUv.y * 5.0 - uTime * 2.1 * uFlow));
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.9, 0.96, 0.95),
          smoothstep(0.55, 0.85, streak) * (0.3 + 0.25 * (1.0 - smoothstep(0.2, 0.6, dep))));
        // Water only where the bed is under it: the edge is the bank.
        diffuseColor.a *= smoothstep(-0.04, 0.12, vRaw)
          * mix(uAlphaShallow, uAlphaDeep, smoothstep(0.02, uAlphaRamp, dep));
        // Born under the pool's surface over its first metre.
        diffuseColor.a *= smoothstep(0.0, 0.34, vFlowUv.y);
        if (diffuseColor.a < 0.01) discard;`);
  };
  const mesh = new THREE.Mesh(g, mat);
  mesh.name = 'jungle_stream';
  mesh.renderOrder = 1;
  mesh.receiveShadow = true;
  return { mesh, normal, uniforms };
}

// Build the whole cascade. `preset` overlays CASCADE_PRESET (flow, foam,
// splash, mist, ripples, colours — a second falls on the island tunes its
// character through this alone); `spec` overrides the geometry for a falls
// somewhere else (defaults derive from the layout, so this map's sheet
// cannot disagree with the terrain it falls down).
export function createJungleWaterfall({ scene, waterNormal, preset }) {
  const P = resolveCascadePreset(preset);
  const spec = defaultSpec();
  const impact = { x: spec.x, z: spec.impactZ };
  const crest = buildCrestRivulet(spec, P);
  const falls = buildFallsSheet(spec, P);
  const pool = buildPool(waterNormal, P, spec);
  const foam = buildImpactFoam(impact, P, spec.waterY);
  const splash = buildSplash(impact, P, spec.waterY);
  const mist = buildMist(impact, P, spec.waterY);
  const streamParts = buildStream(waterNormal, P);
  const stream = streamParts.mesh;
  for (const o of [crest, falls, pool.mesh, foam, splash, mist, stream]) scene.add(o);

  // Sound anchor (see the header note): ~2.5 m above the impact, at the
  // foot of the sheet, where a PositionalAudio will sit when this map gets
  // its soundscape. No audio is created here.
  const audioAnchor = new THREE.Object3D();
  audioAnchor.name = 'jungle_falls_audio';
  audioAnchor.position.set(impact.x, spec.waterY + 2.5, impact.z);
  scene.add(audioAnchor);

  const timed = [crest, falls, foam, splash, mist]
    .map(o => o.material.uniforms.uTime);
  return {
    crest, falls, pool: pool.mesh, poolUniforms: pool.uniforms,
    foam, splash, mist, stream, impact, audioAnchor,
    preset: P, spec,
    // Mist/splash point size is in pixels at 1 m, so it follows the viewport.
    resize(heightPx) {
      mist.material.uniforms.uScale.value = heightPx * 0.45;
      splash.material.uniforms.uScale.value = heightPx * 0.45;
    },
    update(t) {
      for (const u of timed) u.value = t;
      pool.uniforms.uTime.value = t;
      streamParts.uniforms.uTime.value = t;
      // The stream's chop runs downstream (its v grows with the current).
      streamParts.normal.offset.set(0, -t * 0.55 * P.flow);
      if (!pool.normal.image && waterNormal.image) {
        // The sea's map just landed: adopt it and let this upload through.
        pool.normal.image = waterNormal.image;
        pool.normal.needsUpdate = true;
      }
      if (!streamParts.normal.image && waterNormal.image) {
        streamParts.normal.image = waterNormal.image;
        streamParts.normal.needsUpdate = true;
      }
      pool.normal.offset.set(Math.sin(t * 0.3) * 0.02, -t * 0.03);
    },
  };
}








