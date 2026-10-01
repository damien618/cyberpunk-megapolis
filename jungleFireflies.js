// jungleFireflies.js — fireflies, the forest's night light. Only shown after
// dark (setNight), and the reason the path still reads under the canopy
// when the moon cannot reach it.
//
// One Points cloud, one draw call: every fly is a vertex, and its drift and
// its blink are both computed in the vertex shader from a per-fly phase, so
// update(t) writes one uniform and nothing else. Additive and depth-tested
// but not depth-writing, so trunks hide them and they never hide each other.
// They keep to where you walk: along the path and the stream, under the
// trees, 0.4–2.8 m off the ground.
import * as THREE from 'three';
import * as L from './jungleLayout.js';   // bare, like every element module

export function createJungleFireflies({ scene, count = 320, seed = 4242 }) {
  let s = seed >>> 0;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);

  const pos = [], phase = [];
  for (let tries = 0; pos.length < count * 3 && tries < count * 60; tries++) {
    const x = (rnd() * 2 - 1) * (L.PLAY_HALF_W - 6);
    const z = L.SAND_END - 4 + rnd() * (L.CLIFF_Z - L.SAND_END + 2);
    if (L.canopyAt(z) < 0.35) continue;
    const near = Math.min(L.pathDistance(x, z), L.streamDistance(x, z) + 1,
      Math.hypot(x - L.POOL.x, z - L.POOL.z) - L.POOL.r + 2);
    // Dense by the path and the water, thinning out into the trees.
    if (near > 18 || rnd() > Math.exp(-near / 7)) continue;
    // Not over open water.
    if (L.streamDistance(x, z) < L.STREAM_HALF_W
      || Math.hypot(x - L.POOL.x, z - L.POOL.z) < L.POOL.r) continue;
    pos.push(x, L.terrainHeight(x, z) + 0.4 + rnd() * rnd() * 2.4, z);
    phase.push(rnd() * 6.283, 0.55 + rnd() * 0.9, 0.7 + rnd() * 0.6);   // phase, rate, size
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aFly', new THREE.Float32BufferAttribute(phase, 3));

  const mat = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      uTime: { value: 0 },
      uScale: { value: 400 },
      uColor: { value: new THREE.Color(0xd4ff74) },
    }]),
    fog: true,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: `
      #include <fog_pars_vertex>
      uniform float uTime, uScale;
      attribute vec3 aFly;
      varying float vGlow;
      void main() {
        float ph = aFly.x, rate = aFly.y, t = uTime * rate;
        // A slow, wandering hover: three incommensurate sines per axis.
        vec3 p = position + vec3(
          sin(t * 0.37 + ph) * 0.9 + sin(t * 0.91 + ph * 2.1) * 0.25,
          sin(t * 0.53 + ph * 1.7) * 0.35,
          cos(t * 0.29 + ph * 0.6) * 0.9 + sin(t * 0.83 + ph * 3.3) * 0.25);
        // The flash: dark most of the time, a soft pulse once a cycle.
        float c = fract(t * 0.22 + ph * 0.159);
        vGlow = smoothstep(0.0, 0.08, c) * (1.0 - smoothstep(0.08, 0.38, c));
        vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        gl_PointSize = uScale * 0.16 * aFly.z * (0.35 + 0.65 * vGlow) / -mvPosition.z;
        #include <fog_vertex>
      }`,
    fragmentShader: `
      #include <fog_pars_fragment>
      uniform vec3 uColor;
      varying float vGlow;
      void main() {
        float r = length(gl_PointCoord - 0.5) * 2.0;
        float a = (exp(-r * r * 5.0) - 0.0067) * (0.12 + 0.88 * vGlow);
        if (a <= 0.0) discard;
        gl_FragColor = vec4(uColor * a * 2.4, 1.0);
        #include <fog_fragment>
      }`,
  });
  const points = new THREE.Points(g, mat);
  points.name = 'jungle_fireflies';
  points.frustumCulled = false;   // they drift past the static bounds
  points.visible = false;
  scene.add(points);

  return {
    points, count: pos.length / 3,
    setNight(on) { points.visible = on; },
    // Point size is in pixels at 1 m, so it follows the viewport.
    resize(heightPx) { mat.uniforms.uScale.value = heightPx; },
    update(t) { if (points.visible) mat.uniforms.uTime.value = t; },
  };
}
