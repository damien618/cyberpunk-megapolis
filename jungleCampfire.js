// jungleCampfire.js — a campfire on the sand, lit after dark: a ring of
// stones, a teepee of charred sticks over a bed of embers, flames, sparks
// going up, and two pieces of driftwood to sit on. The seat on the inland
// log faces the fire with the sea and the moon behind it.
//
// Cost: one PointLight (no shadow — a point shadow is six extra renders),
// four draw calls of geometry, one for the flames, one for the sparks.
// Nothing is shown by day, and the colliders are only handed over at night
// (main-JUNGLE.js adds them when it switches the hour).
//
// The flames are three crossed vertical planes running one unlit additive
// shader: a noise field scrolled upwards, cut into a tongue that narrows as
// it rises, coloured white-yellow at the core to red at the tips.
import * as THREE from 'three';

const NOISE = `
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float vnoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
               mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
  }`;

// The fire faces the sea: you sit on the inland side, looking toward -Z.
export function createJungleCampfire({ scene, terrainHeight, x, z }) {
  const group = new THREE.Group();
  group.name = 'jungle_campfire';
  const gy = terrainHeight(x, z);
  group.position.set(x, gy, z);
  group.visible = false;
  scene.add(group);

  let s = 777 >>> 0;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler();
  const _p = new THREE.Vector3(), _s = new THREE.Vector3();
  // Ground under a local (dx, dz), relative to the fire's own ground.
  const hAt = (dx, dz) => terrainHeight(x + dx, z + dz) - gy;

  // --- Stone ring --------------------------------------------------------
  const STONES = 11, RING = 0.62;
  const stoneGeo = new THREE.IcosahedronGeometry(0.15, 1);
  const stoneMat = new THREE.MeshStandardMaterial({ color: 0x625c55, roughness: 0.95, flatShading: true });
  const stones = new THREE.InstancedMesh(stoneGeo, stoneMat, STONES);
  for (let i = 0; i < STONES; i++) {
    const a = (i / STONES) * Math.PI * 2 + rnd() * 0.2;
    const dx = Math.cos(a) * RING, dz = Math.sin(a) * RING;
    const k = 0.8 + rnd() * 0.5;
    _p.set(dx, hAt(dx, dz) + 0.04, dz);
    _q.setFromEuler(_e.set(rnd() * 0.6, rnd() * 6.28, rnd() * 0.6));
    _s.set(k * 1.2, k * 0.75, k);
    stones.setMatrixAt(i, _m.compose(_p, _q, _s));
  }
  stones.castShadow = stones.receiveShadow = true;
  group.add(stones);

  // --- Ember bed and the stick teepee --------------------------------------
  const emberTex = (() => {
    const c = Object.assign(document.createElement('canvas'), { width: 128, height: 128 });
    const g = c.getContext('2d');
    g.fillStyle = '#1a0d06'; g.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 260; i++) {
      const r = 2 + rnd() * 7, px = rnd() * 128, py = rnd() * 128;
      const hot = rnd();
      const gr = g.createRadialGradient(px, py, 0, px, py, r);
      gr.addColorStop(0, hot > 0.6 ? '#ffb347' : hot > 0.25 ? '#e2541c' : '#5a2010');
      gr.addColorStop(1, 'rgba(30,10,4,0)');
      g.fillStyle = gr; g.beginPath(); g.arc(px, py, r, 0, 6.283); g.fill();
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  })();
  const emberMat = new THREE.MeshStandardMaterial({
    color: 0x2a1a12, roughness: 1, map: emberTex,
    emissive: 0xffffff, emissiveMap: emberTex, emissiveIntensity: 1.4,
  });
  const bed = new THREE.Mesh(new THREE.CircleGeometry(0.42, 20).rotateX(-Math.PI / 2), emberMat);
  bed.position.y = hAt(0, 0) + 0.03;
  group.add(bed);

  const charMat = new THREE.MeshStandardMaterial({
    color: 0x2b211b, roughness: 0.9, emissive: 0xff5a1a, emissiveIntensity: 0.25,
  });
  const stickGeo = new THREE.CylinderGeometry(0.035, 0.05, 0.85, 6);
  const sticks = new THREE.InstancedMesh(stickGeo, charMat, 6);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + rnd() * 0.3;
    // Feet out on the ember bed, tips leaning into a point over the middle.
    _p.set(Math.cos(a) * 0.17, 0.32, Math.sin(a) * 0.17);
    _q.setFromUnitVectors(new THREE.Vector3(0, 1, 0),
      new THREE.Vector3(-Math.cos(a) * 0.55, 1, -Math.sin(a) * 0.55).normalize());
    sticks.setMatrixAt(i, _m.compose(_p, _q, _s.set(1, 1, 1)));
  }
  sticks.castShadow = true;
  group.add(sticks);

  // --- Driftwood to sit on -------------------------------------------------
  const driftMat = new THREE.MeshStandardMaterial({ color: 0x8c7c68, roughness: 0.92 });
  const logGeo = new THREE.CylinderGeometry(0.2, 0.22, 2.2, 10).rotateZ(Math.PI / 2);
  // Bark-less, sea-worn: a slight taper and a couple of stubs read as wood.
  const stubGeo = new THREE.CylinderGeometry(0.05, 0.07, 0.28, 6);
  const logs = [
    { dx: 0, dz: 1.75, ry: 0.05 },          // the seat: inland, facing the sea
    { dx: 1.75, dz: 0.2, ry: Math.PI / 2 + 0.25 },   // a second one to the east
  ];
  const colliders = [];
  for (const L of logs) {
    const m = new THREE.Mesh(logGeo, driftMat);
    m.position.set(L.dx, hAt(L.dx, L.dz) + 0.18, L.dz);
    m.rotation.y = L.ry;
    m.castShadow = m.receiveShadow = true;
    group.add(m);
    const stub = new THREE.Mesh(stubGeo, driftMat);
    stub.position.set(0.7, 0.16, 0.06);
    stub.rotation.set(0.5, 0, -0.6);
    m.add(stub);
    const along = Math.abs(Math.cos(L.ry)) > 0.5;
    const hx = along ? 1.1 : 0.22, hz = along ? 0.22 : 1.1;
    colliders.push({
      x0: x + L.dx - hx, x1: x + L.dx + hx, z0: z + L.dz - hz, z1: z + L.dz + hz,
      y0: gy - 0.2, y1: gy + hAt(L.dx, L.dz) + 0.4,
    });
  }
  // The fire itself: you walk round it, not through it.
  colliders.push({ x0: x - 0.75, x1: x + 0.75, z0: z - 0.75, z1: z + 0.75, y0: gy - 0.2, y1: gy + 0.5 });

  // The seat: the hips sit on the log's crown. The anchor is 0.16 m in front
  // of it (player.js's SEAT_BACK carries the hips back that far).
  const seatLog = logs[0];
  const seatTop = gy + hAt(seatLog.dx, seatLog.dz) + 0.38;
  const seat = {
    x: x + seatLog.dx, z: z + seatLog.dz - 0.16, y: seatTop,
    floorY: terrainHeight(x + seatLog.dx, z + seatLog.dz - 0.55),
    yaw: Math.PI,          // facing -Z: the fire, the sea, the moon
    // The seat log as a capsule in world space, for anything that rests on
    // it (the blanket's hem).
    log: (() => {
      const cx = x + seatLog.dx, cy = gy + hAt(seatLog.dx, seatLog.dz) + 0.18, cz = z + seatLog.dz;
      const ux = Math.cos(seatLog.ry) * 1.1, uz = -Math.sin(seatLog.ry) * 1.1;
      return { a: new THREE.Vector3(cx - ux, cy, cz - uz), b: new THREE.Vector3(cx + ux, cy, cz + uz), r: 0.21 };
    })(),
  };

  // --- Flames --------------------------------------------------------------
  const flameUniforms = { uTime: { value: 0 } };
  const flameMat = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, flameUniforms]),
    fog: true, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    vertexShader: `
      #include <fog_pars_vertex>
      varying vec2 vUv;
      void main() {
        vUv = uv;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: `
      #include <fog_pars_fragment>
      uniform float uTime;
      varying vec2 vUv;
      ${NOISE}
      void main() {
        vec2 uv = vUv;
        float t = uTime;
        float n = vnoise(vec2(uv.x * 5.0, uv.y * 3.0 - t * 2.6)) * 0.6
                + vnoise(vec2(uv.x * 11.0 + 3.1, uv.y * 7.0 - t * 4.3)) * 0.4;
        // A tongue: wide at the base, narrowing and licking sideways higher up.
        float sway = (vnoise(vec2(t * 1.3, uv.y * 2.0)) - 0.5) * 0.22 * uv.y;
        float w = mix(0.42, 0.04, pow(uv.y, 0.8));
        float body = 1.0 - smoothstep(w * 0.55, w, abs(uv.x - 0.5 - sway));
        float f = body * smoothstep(1.0, 0.15, uv.y + (n - 0.5) * 0.55);
        f *= smoothstep(0.0, 0.08, uv.y);
        f = clamp(f * (0.65 + n * 0.8), 0.0, 1.0);
        vec3 col = mix(vec3(0.85, 0.16, 0.03), vec3(1.0, 0.55, 0.12), smoothstep(0.1, 0.5, f));
        col = mix(col, vec3(1.0, 0.92, 0.65), smoothstep(0.6, 0.95, f));
        gl_FragColor = vec4(col * f * 1.5, 1.0);
        #include <fog_fragment>
      }`,
  });
  const flames = new THREE.Group();
  const flameGeo = new THREE.PlaneGeometry(0.75, 1.15).translate(0, 0.575, 0);
  for (let i = 0; i < 3; i++) {
    const p = new THREE.Mesh(flameGeo, flameMat);
    p.rotation.y = (i / 3) * Math.PI;
    flames.add(p);
  }
  flames.position.y = hAt(0, 0) + 0.04;
  flames.renderOrder = 2;
  group.add(flames);

  // --- Sparks ----------------------------------------------------------------
  const SPARKS = 46;
  const sp = new Float32Array(SPARKS * 3), sd = new Float32Array(SPARKS * 3);
  for (let i = 0; i < SPARKS; i++) {
    sp.set([(rnd() - 0.5) * 0.4, 0, (rnd() - 0.5) * 0.4], i * 3);
    sd.set([rnd(), 0.35 + rnd() * 0.5, rnd() * 6.283], i * 3);   // phase, rate, swirl
  }
  const sparkGeo = new THREE.BufferGeometry();
  sparkGeo.setAttribute('position', new THREE.BufferAttribute(sp, 3));
  sparkGeo.setAttribute('aSpark', new THREE.BufferAttribute(sd, 3));
  const sparkMat = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog,
      { uTime: { value: 0 }, uScale: { value: 800 } }]),
    fog: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `
      #include <fog_pars_vertex>
      uniform float uTime, uScale;
      attribute vec3 aSpark;
      varying float vLife;
      void main() {
        float life = fract(uTime * aSpark.y * 0.5 + aSpark.x);
        vLife = life;
        vec3 p = position;
        p.y += life * life * 0.6 + life * 2.2;
        p.x += sin(uTime * 2.0 + aSpark.z) * 0.25 * life;
        p.z += cos(uTime * 1.7 + aSpark.z) * 0.25 * life;
        vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        gl_PointSize = uScale * 0.018 * (1.0 - life) / -mvPosition.z;
        #include <fog_vertex>
      }`,
    fragmentShader: `
      #include <fog_pars_fragment>
      varying float vLife;
      void main() {
        float r = length(gl_PointCoord - 0.5) * 2.0;
        float a = (1.0 - smoothstep(0.2, 1.0, r)) * (1.0 - vLife) * smoothstep(0.0, 0.05, vLife);
        gl_FragColor = vec4(vec3(1.0, 0.55, 0.18) * a * 2.0, 1.0);
        #include <fog_fragment>
      }`,
  });
  const sparks = new THREE.Points(sparkGeo, sparkMat);
  sparks.position.y = 0.25;
  sparks.frustumCulled = false;
  group.add(sparks);

  // --- Light -----------------------------------------------------------------
  const light = new THREE.PointLight(0xff8a3c, 0, 22, 2);
  light.position.set(0, hAt(0, 0) + 0.7, 0);
  group.add(light);
  const LIGHT_BASE = 14;

  function setNight(on) {
    group.visible = on;
    light.intensity = on ? LIGHT_BASE : 0;
  }

  function update(t) {
    if (!group.visible) return;
    flameUniforms.uTime.value = t;
    flameMat.uniforms.uTime.value = t;
    sparkMat.uniforms.uTime.value = t;
    // Flicker: a slow breath and a fast crackle, never below two thirds.
    const f = 0.82 + 0.1 * Math.sin(t * 2.3) + 0.06 * Math.sin(t * 7.9 + 1.3)
      + 0.05 * Math.sin(t * 13.7 + 0.4);
    light.intensity = LIGHT_BASE * f;
    light.position.x = Math.sin(t * 3.1) * 0.05;
    light.position.z = Math.cos(t * 2.7) * 0.05;
    emberMat.emissiveIntensity = 1.2 + 0.35 * Math.sin(t * 1.7) + 0.15 * Math.sin(t * 5.3);
  }

  return {
    group, light, seat, colliders, setNight, update,
    resize(heightPx) { sparkMat.uniforms.uScale.value = heightPx; },
  };
}
