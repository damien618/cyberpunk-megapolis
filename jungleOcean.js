// jungleOcean.js — the sea in front of the cove: a swell displaced on the
// GPU, a pale-turquoise lagoon over the sand, and a swash of foam running up
// the beach and draining back.
//
// Adapted from main-BEACH.js (which exports nothing), keeping its hard-won
// rules: the swell is damped to nothing before the shallows, the shallows
// read by COLOUR rather than transparency, the foam rides the water surface
// rather than the bed, and the swash position is computed ONCE in JS and
// handed to the shader, so there is a single model of where the water is.
import * as THREE from 'three';
import { terrainHeight, shoreAt, SEA_Y, SHORE_Z } from './jungleLayout.js';

// Foam mottle. Every blob drawn nine times so the tile wraps.
function makeFoamTexture(maxAniso) {
  const S = 256;
  const c = Object.assign(document.createElement('canvas'), { width: S, height: S });
  const g = c.getContext('2d');
  g.fillStyle = '#000';
  g.fillRect(0, 0, S, S);
  g.globalCompositeOperation = 'lighter';
  let sd = 24680;
  const r = () => ((sd = (sd * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let i = 0; i < 150; i++) {
    const x = r() * S, y = r() * S, rad = 5 + r() * 20, k = 0.35 + r() * 0.5;
    for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) {
      const gr = g.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, rad);
      gr.addColorStop(0, `rgba(255,255,255,${k})`);
      gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr;
      g.beginPath();
      g.arc(x + ox, y + oy, rad, 0, Math.PI * 2);
      g.fill();
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = maxAniso;
  return t;
}

// The swell, in GLSL and (for anything that floats) in JS. Same numbers.
const SWELL_GLSL = `
  float seaH(vec2 p, float t, out vec2 grad) {
    float h = 0.0;
    grad = vec2(0.0);
    float k1 = 0.085, a1 = 0.36, s1 = 1.05;
    float p1 = p.y * k1 + t * s1;
    h += sin(p1) * a1;  grad.y += cos(p1) * a1 * k1;
    float k2 = 0.052, a2 = 0.26, s2 = 0.72;
    float p2 = (p.y * 0.96 + p.x * 0.28) * k2 - t * s2;
    h += sin(p2) * a2;
    grad.y += cos(p2) * a2 * k2 * 0.96;
    grad.x += cos(p2) * a2 * k2 * 0.28;
    float k3 = 0.24, a3 = 0.08, s3 = 2.1;
    float p3 = (p.y + p.x * 0.5) * k3 + t * s3;
    h += sin(p3) * a3;
    grad.y += cos(p3) * a3 * k3;
    grad.x += cos(p3) * a3 * k3 * 0.5;
    return h;
  }
  // Full swell offshore, none from the wade barrier in.
  float seaDeep(float wz) { return 1.0 - smoothstep(-95.0, -48.0, wz); }`;

export function swellAt(x, z, t) {
  const h = Math.sin(z * 0.085 + t * 1.05) * 0.36
    + Math.sin((z * 0.96 + x * 0.28) * 0.052 - t * 0.72) * 0.26
    + Math.sin((z + x * 0.5) * 0.24 + t * 2.1) * 0.08;
  return h * (1 - THREE.MathUtils.smoothstep(z, -95, -48));
}

export function createJungleOcean({ scene, waterNormal, maxAniso = 4 }) {
  const uniforms = {
    uTime: { value: 0 },
    uShallow: { value: new THREE.Color(0x6fe0d2) },
  };
  const mat = new THREE.MeshPhysicalMaterial({
    color: 0x17708f,
    roughness: 0.14,
    metalness: 0,
    transparent: true,
    opacity: 0.88,
    normalMap: waterNormal,
    normalScale: new THREE.Vector2(0.45, 0.45),
    clearcoat: 0.8,
    clearcoatRoughness: 0.12,
  });
  mat.onBeforeCompile = sh => {
    sh.uniforms.uTime = uniforms.uTime;
    sh.uniforms.uShallow = uniforms.uShallow;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
        uniform float uTime;
        varying float vWz;
        ${SWELL_GLSL}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vec2 wpos = (modelMatrix * vec4(position, 1.0)).xz;
        vWz = wpos.y;
        vec2 sGrad;
        float sH = seaH(wpos, uTime, sGrad);
        transformed.z += sH * seaDeep(wpos.y);`)
      .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
        {
          vec2 g2;
          vec2 wp2 = (modelMatrix * vec4(position, 1.0)).xz;
          seaH(wp2, uTime, g2);
          g2 *= seaDeep(wp2.y);
          objectNormal = normalize(vec3(-g2.x, g2.y, 1.0));
        }`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying float vWz;
        uniform vec3 uShallow;`)
      .replace('vec4 diffuseColor = vec4( diffuse, opacity );', `
        vec4 diffuseColor = vec4( diffuse, opacity );
        // Lagoon turquoise over the sand, deep blue past the reef line.
        float dep = clamp((${SHORE_Z.toFixed(1)} - vWz) / 42.0, 0.0, 1.0);
        diffuseColor.rgb = mix(uShallow, diffuseColor.rgb, dep);
        diffuseColor.a *= mix(0.72, 1.0, dep);`);
  };
  // The plane is XY rotated -90° about X, so local +Z is world +Y. 8 m cells
  // resolve the shortest (26 m) swell component.
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(1600, 1000, 200, 125), mat);
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(0, SEA_Y, SHORE_Z + 30 - 500);
  sea.name = 'jungle_sea';
  scene.add(sea);

  // --- Swash --------------------------------------------------------------
  const swash = { edge: 0, period: 7.2 };
  function updateSwash(t) {
    const cyc = Math.floor(t / swash.period);
    const ph = t / swash.period - cyc;
    const h = Math.abs(Math.sin(cyc * 12.9898) * 43758.5453) % 1;
    const reach = 2.2 + h * 3.8;       // a lagoon: gentler than L.A.'s surf
    const e = ph < 0.22
      ? THREE.MathUtils.smoothstep(ph, 0, 0.22)
      : 1 - THREE.MathUtils.smoothstep(ph, 0.22, 1);
    swash.edge = -1.4 + e * reach;
  }

  // --- Foam strip, conformed to max(bed, sea) -----------------------------
  const X0 = -130, X1 = 130, Z0 = -62, Z1 = 6, SX = 130, SZ = 34;
  const fg = new THREE.PlaneGeometry(X1 - X0, Z1 - Z0, SX, SZ);
  fg.rotateX(-Math.PI / 2);
  fg.translate((X0 + X1) / 2, 0, (Z0 + Z1) / 2);
  const fp = fg.getAttribute('position');
  const aD = new Float32Array(fp.count), aX = new Float32Array(fp.count);
  const aH = new Float32Array(fp.count);
  for (let i = 0; i < fp.count; i++) {
    const x = fp.getX(i), z = fp.getZ(i);
    const bed = terrainHeight(x, z);
    fp.setY(i, Math.max(bed, SEA_Y) + 0.07);
    aD[i] = z - shoreAt(x);
    aX[i] = x;
    // Height of the ground above the sea. The headlands climb out of the
    // water well before shoreAt says the shore is, and foam painted up a
    // ten-metre rock face is the first thing anyone would see.
    aH[i] = bed - SEA_Y;
  }
  fg.setAttribute('aD', new THREE.BufferAttribute(aD, 1));
  fg.setAttribute('aX', new THREE.BufferAttribute(aX, 1));
  fg.setAttribute('aH', new THREE.BufferAttribute(aH, 1));
  const foamUniforms = {
    uTime: { value: 0 },
    uEdge: { value: 0 },
    uMap: { value: makeFoamTexture(maxAniso) },
    uColor: { value: new THREE.Color(0xf4fcff) },
    uOpacity: { value: 0.55 },
  };
  const foamMat = new THREE.ShaderMaterial({
    uniforms: foamUniforms,
    transparent: true,
    depthWrite: false,
    fog: false,
    vertexShader: `
      attribute float aD;
      attribute float aX;
      attribute float aH;
      varying float vD;
      varying float vX;
      varying float vH;
      varying vec2 vUv;
      void main() {
        vD = aD; vX = aX; vH = aH; vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      uniform float uTime, uEdge, uOpacity;
      uniform sampler2D uMap;
      uniform vec3 uColor;
      varying float vD;
      varying float vX;
      varying float vH;
      varying vec2 vUv;
      void main() {
        float edge = uEdge + sin(vX * 0.047) * 1.1 + sin(vX * 0.017 + 2.1) * 1.6;
        float d = vD;
        float lead  = 1.0 - smoothstep(0.0, 1.4, abs(d - edge));
        float sheet = (1.0 - smoothstep(edge - 0.3, edge + 0.5, d))
                    * smoothstep(-8.0, -1.0, d) * 0.14;
        // A reef line offshore, where the lagoon's small waves break.
        float bl = -30.0 + sin(uTime * 0.4 + vX * 0.035) * 2.4;
        float brk = (1.0 - smoothstep(0.0, 2.6, abs(d - bl))) * 0.36;
        float a = clamp(lead + sheet + brk, 0.0, 1.0);
        float n = texture2D(uMap, vUv * vec2(50.0, 2.5)
                  + vec2(uTime * 0.013, uTime * 0.05)).r;
        a *= 0.55 + 0.45 * n;
        a *= 1.0 - smoothstep(0.5, 1.1, vH);
        if (a < 0.01) discard;
        gl_FragColor = vec4(uColor, a * uOpacity);
      }`,
  });
  const foam = new THREE.Mesh(fg, foamMat);
  foam.renderOrder = 2;
  foam.name = 'jungle_foam';
  scene.add(foam);

  function update(t) {
    uniforms.uTime.value = t;
    if (waterNormal) {
      waterNormal.offset.x = t * 0.006;
      waterNormal.offset.y = -t * 0.02;
    }
    updateSwash(t);
    foamUniforms.uTime.value = t;
    foamUniforms.uEdge.value = swash.edge;
  }

  return { sea, foam, uniforms, swash, update, swellAt };
}
