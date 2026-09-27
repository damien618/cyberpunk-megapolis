// jungleWaterfall.js — the falls, the plunge pool, the mist and the stream
// that drains the pool to the sea.
//
// Nothing here is textured and nothing is updated per particle on the CPU:
// the falling water is a curved ribbon whose streaks are value noise
// scrolling in its own shader, and the mist is a fixed Points cloud that the
// vertex shader animates from one time uniform. update(t) sets that uniform
// and that is the whole per-frame cost.
import * as THREE from 'three';
import {
  FALLS, POOL, terrainHeight, streamX, streamWaterY, STREAM_Z0, STREAM_HALF_W, shoreAt,
} from './jungleLayout.js';

const G = 9.8;
const LAUNCH = 2.3;          // m/s off the lip: how far the sheet arcs out

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

// Where the sheet is `drop` metres below the lip.
function fallsZ(drop) {
  return FALLS.z - 0.2 - LAUNCH * Math.sqrt(2 * Math.max(drop, 0) / G);
}

function buildFalls() {
  // The sheet leaves from the ground actually at the lip (the notch lowers
  // it a little below FALLS.topY), riding a hand's depth of water over it.
  const lipY = terrainHeight(FALLS.x, FALLS.z) + 0.12;
  const drop = lipY - POOL.waterY;
  const SEG_X = 10, SEG_Y = 36;
  const g = new THREE.PlaneGeometry(1, 1, SEG_X, SEG_Y);
  const p = g.getAttribute('position'), uv = g.getAttribute('uv');
  for (let i = 0; i < p.count; i++) {
    const u = uv.getX(i), v = 1 - uv.getY(i);              // v: 0 at the lip
    // The top eighth curls over the lip; the rest falls ballistically.
    const lip = 0.12;
    let y, z;
    if (v < lip) {
      const k = v / lip;
      y = lipY + 0.06 * Math.cos(k * Math.PI / 2);
      z = FALLS.z + 1.2 * (1 - k) - 0.2 * k;
    } else {
      const d = ((v - lip) / (1 - lip)) * (drop + 0.3);
      y = lipY - d;
      z = fallsZ(d);
    }
    // The sheet spreads a little as it falls, and its edges hang back.
    const spread = 1 + v * 0.35;
    const x = FALLS.x + (u - 0.5) * FALLS.width * spread;
    z += Math.pow(Math.abs(u - 0.5) * 2, 3) * 0.6;
    p.setXYZ(i, x, y, z);
  }
  g.computeVertexNormals();
  const mat = fogShader({
    uniforms: { uTime: { value: 0 } },
    vertex: {
      head: 'varying vec2 vUv;',
      body: 'vUv = uv; vec3 pos = position;',
    },
    fragment: {
      head: 'uniform float uTime; varying vec2 vUv;',
      body: `
        float v = 1.0 - vUv.y;                     // 0 at the lip
        // Vertical streaks: stretched noise scrolling down, two speeds.
        float s1 = vnoise(vec2(vUv.x * 22.0, v * 5.0 - uTime * 2.6));
        float s2 = vnoise(vec2(vUv.x * 55.0 + 3.1, v * 11.0 - uTime * 4.3));
        float streak = s1 * 0.65 + s2 * 0.35;
        vec3 deep = vec3(0.55, 0.72, 0.74);
        vec3 white = vec3(0.96, 0.98, 1.0);
        vec3 col = mix(deep, white, smoothstep(0.35, 0.8, streak) * 0.85 + v * 0.15);
        float edge = smoothstep(0.0, 0.14, vUv.x) * smoothstep(1.0, 0.86, vUv.x);
        float a = (0.55 + 0.4 * streak) * edge;
        a *= 1.0 - smoothstep(0.93, 1.0, v) * 0.6;    // melts into the spray
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

function buildPool(waterNormal) {
  const normal = waterNormal.clone();
  normal.repeat.set(2.2, 2.2);
  normal.needsUpdate = true;
  const mat = new THREE.MeshStandardMaterial({
    color: 0x2a7d74, roughness: 0.08, metalness: 0.1,
    transparent: true, opacity: 0.82,
    normalMap: normal, normalScale: new THREE.Vector2(0.35, 0.35),
  });
  const mesh = new THREE.Mesh(new THREE.CircleGeometry(POOL.r + 2.2, 48).rotateX(-Math.PI / 2), mat);
  mesh.position.set(POOL.x, POOL.waterY, POOL.z);
  mesh.name = 'jungle_pool';
  return { mesh, normal };
}

// A churned disc where the sheet hits the pool.
function buildImpactFoam(impact) {
  const mat = fogShader({
    uniforms: { uTime: { value: 0 } },
    vertex: { head: 'varying vec2 vUv;', body: 'vUv = uv; vec3 pos = position;' },
    fragment: {
      head: 'uniform float uTime; varying vec2 vUv;',
      body: `
        vec2 c = vUv - 0.5;
        float r = length(c) * 2.0;
        float a = atan(c.y, c.x);
        float n = vnoise(vec2(a * 4.0, r * 6.0 - uTime * 1.6));
        float ring = 1.0 - smoothstep(0.35, 1.0, r + (n - 0.5) * 0.35);
        float alpha = ring * (0.45 + 0.45 * n);
        if (alpha < 0.02) discard;
        gl_FragColor = vec4(vec3(0.95, 0.98, 1.0), alpha * 0.85);`,
    },
    transparent: true,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(FALLS.width * 1.9, 6.5).rotateX(-Math.PI / 2), mat);
  mesh.position.set(impact.x, POOL.waterY + 0.03, impact.z);
  mesh.renderOrder = 3;
  mesh.name = 'jungle_falls_foam';
  return mesh;
}

// Mist: a cloud that rises and drifts out from the foot of the falls. Each
// point carries a seed; its whole life is a function of (seed, time).
function buildMist(impact, count = 280) {
  const g = new THREE.BufferGeometry();
  const seeds = new Float32Array(count * 4);
  for (let i = 0; i < count * 4; i++) seeds[i] = Math.random();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
  g.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 4));
  const mat = fogShader({
    uniforms: {
      uTime: { value: 0 },
      uOrigin: { value: new THREE.Vector3(impact.x, POOL.waterY, impact.z) },
      uWidth: { value: FALLS.width },
      uScale: { value: 300 },
    },
    vertex: {
      head: `uniform float uTime, uWidth, uScale; uniform vec3 uOrigin;
             attribute vec4 aSeed; varying float vLife;`,
      body: `
        float life = fract(uTime * (0.16 + aSeed.w * 0.12) + aSeed.x);
        vLife = life;
        vec3 pos = uOrigin;
        pos.x += (aSeed.y - 0.5) * uWidth * (1.0 + life * 1.4);
        pos.z -= life * (2.5 + aSeed.z * 6.0);           // drifts out over the pool
        pos.y += 0.3 + life * (3.0 + aSeed.z * 6.0);`,
      tail: 'gl_PointSize = (0.9 + life * 3.2) * uScale / -mvPosition.z;',
    },
    fragment: {
      head: 'varying float vLife;',
      body: `
        vec2 c = gl_PointCoord - 0.5;
        float d = length(c);
        if (d > 0.5) discard;
        float a = (1.0 - smoothstep(0.1, 0.5, d)) * sin(vLife * 3.14159) * 0.22;
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

// The stream: a ribbon along its centreline at the water height the layout
// computes, flowing -Z.
function buildStream() {
  const zs = [];
  for (let z = STREAM_Z0 + 1.5; z > shoreAt(streamX(z)) - 3; z -= 1) zs.push(z);
  const ACROSS = 4;
  const pos = new Float32Array(zs.length * ACROSS * 3);
  const uv = new Float32Array(zs.length * ACROSS * 2);
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
      const w = STREAM_HALF_W * 0.9;
      const j = i * ACROSS + k;
      pos[j * 3] = x + nx * s * w; pos[j * 3 + 1] = y; pos[j * 3 + 2] = z + nz * s * w;
      uv[j * 2] = k / (ACROSS - 1); uv[j * 2 + 1] = along;
    }
  }
  const idx = [];
  for (let i = 0; i < zs.length - 1; i++) for (let k = 0; k < ACROSS - 1; k++) {
    const a = i * ACROSS + k, b = a + 1, c = a + ACROSS, d = c + 1;
    idx.push(a, b, c, b, d, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx);
  const mat = fogShader({
    uniforms: { uTime: { value: 0 } },
    vertex: { head: 'varying vec2 vUv;', body: 'vUv = uv; vec3 pos = position;' },
    fragment: {
      head: 'uniform float uTime; varying vec2 vUv;',
      body: `
        float n = vnoise(vec2(vUv.x * 5.0, vUv.y * 0.9 - uTime * 1.3))
                + 0.5 * vnoise(vec2(vUv.x * 11.0, vUv.y * 2.3 - uTime * 2.1));
        vec3 col = mix(vec3(0.16, 0.42, 0.40), vec3(0.62, 0.80, 0.78), smoothstep(0.7, 1.3, n));
        float edge = smoothstep(0.0, 0.2, vUv.x) * smoothstep(1.0, 0.8, vUv.x);
        gl_FragColor = vec4(col, (0.62 + 0.25 * n) * edge);`,
    },
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(g, mat);
  mesh.name = 'jungle_stream';
  mesh.renderOrder = 1;
  return mesh;
}

export function createJungleWaterfall({ scene, waterNormal }) {
  const impact = { x: FALLS.x, z: fallsZ(terrainHeight(FALLS.x, FALLS.z) + 0.12 - POOL.waterY) };
  const falls = buildFalls();
  const pool = buildPool(waterNormal);
  const foam = buildImpactFoam(impact);
  const mist = buildMist(impact);
  const stream = buildStream();
  for (const o of [falls, pool.mesh, foam, mist, stream]) scene.add(o);

  const timed = [falls, foam, mist, stream].map(o => o.material.uniforms.uTime);
  return {
    falls, pool: pool.mesh, foam, mist, stream, impact,
    // Mist point size is in pixels at 1 m, so it follows the viewport.
    resize(heightPx) { mist.material.uniforms.uScale.value = heightPx * 0.45; },
    update(t) {
      for (const u of timed) u.value = t;
      pool.normal.offset.set(Math.sin(t * 0.3) * 0.02, -t * 0.03);
    },
  };
}
