// jungleOcean.js — the sea in front of the cove, and the island's sea: a
// Gerstner swell displaced on the GPU, damped by the REAL depth of water
// above the bed (read in-shader from jungleLayout's SEA_BED_GLSL — no depth
// texture, no extra pass), a lagoon that goes from thin turquoise over the
// sand to deep blue in the channel, breakers that ride their depth contour,
// a swash of foam running up the beach, and a fresnel reflection of the very
// sky dome the map draws.
//
// REUSABLE AT ISLAND SCALE: this module owns no map. It asks a `layout` for
// the bed and the waterline ({ terrainHeight, shoreAt, SEA_Y, SHORE_Z,
// bedGLSL } — defaulting to jungleLayout) and takes a `preset` over
// oceanSurface's OCEAN_PRESET for the waves, colours and foam. The two
// village maps will pass their own layout and a tuned preset; nothing here
// changes. waterHeightAt(x, z, t) is the one-call surface height for
// anything that floats or wades — kept in lockstep with the shader by the
// shared wave table (oceanSurface.js).
//
// Rules kept from main-BEACH.js: the swell dies on the shallows rather than
// at a hard line, the shallows read by COLOUR as well as transparency, the
// foam rides the water surface rather than the bed, and the swash position
// is computed ONCE in JS and handed to the shaders, so there is a single
// model of where the water is.
import * as THREE from 'three';
import { terrainHeight, shoreAt, SEA_Y, SHORE_Z, SEA_BED_GLSL } from './jungleLayout.js';
import { resolvePreset, gerstnerGLSL, waterHeightAt as waterSurfaceAt } from './oceanSurface.js';

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


// ---------------------------------------------------------------------------
// The sea.
// ---------------------------------------------------------------------------
export function createJungleOcean({
  scene, waterNormal, maxAniso = 4,
  layout,       // another map's bed: { terrainHeight, shoreAt, SEA_Y, SHORE_Z, bedGLSL }
  preset,       // overrides on OCEAN_PRESET (waveScale, colours, foam, swash)
  bounds,      // optional { sea: {width,depth,sx,sz,x,z}, foam: {x0,x1,z0,z1,sx,sz} }
  skyUniforms,  // the sky dome's uniforms — the reflection reads the same sky
}) {
  const P = resolvePreset(preset);
  const L = {
    terrainHeight, shoreAt, SEA_Y, SHORE_Z, bedGLSL: SEA_BED_GLSL,
    ...(layout || {}),
  };
  const seaY = L.SEA_Y;
  const f = v => Number(v).toFixed(4);

  const uniforms = {
    uTime: { value: 0 },
    uSeaY: { value: seaY },
    uWaveScale: { value: P.waveScale },
    uShallowCol: { value: new THREE.Color(P.colors.shallow) },
    uMidCol: { value: new THREE.Color(P.colors.mid) },
    uDeepCol: { value: new THREE.Color(P.colors.deep) },
    uMidDepth: { value: P.midDepth },
    uDeepDepth: { value: P.deepDepth },
    uAlphaShallow: { value: P.alphaShallow },
    uAlphaDeep: { value: P.alphaDeep },
    uAlphaRamp: { value: P.alphaRampDepth },
    uFoamBreak: { value: P.foamBreak },
    uShoreFoam: { value: P.shoreFoam },
    uRipple: { value: P.rippleAmp },
    uRefl: { value: P.reflection },
    uNormalMap: { value: waterNormal },   // the fragment chop rides this
    uEdge: { value: 0 },          // the swash edge, shared with the foam strip
    uFoamMap: { value: null },    // the strip's mottle, shared by the sea
  };

  // Standard, not physical: the sun glint is the light's own GGX highlight
  // off the wave normal, and the sky comes back by fresnel below — the
  // clearcoat pass bought nothing the sea needed.
  const mat = new THREE.MeshStandardMaterial({
    color: P.colors.deep,
    roughness: P.roughness,
    metalness: 0,
    transparent: true,
    opacity: 1.0,   // the fragment's depth ramp owns alpha; foam overrides it
  });

  mat.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, uniforms);
    if (skyUniforms) {
      sh.uniforms.uHorizon = skyUniforms.uHorizon;
      sh.uniforms.uZenith = skyUniforms.uZenith;
      sh.uniforms.uGlow = skyUniforms.uGlow;
      sh.uniforms.uGlowDir = skyUniforms.uGlowDir;
      sh.uniforms.uGlowStrength = skyUniforms.uGlowStrength;
      sh.uniforms.uGlowTightness = skyUniforms.uGlowTightness;
    }
    const skyGLSL = skyUniforms ? `
        uniform vec3 uHorizon, uZenith, uGlow, uGlowDir;
        uniform float uGlowStrength, uGlowTightness;
        vec3 seaSky(vec3 d) {
          float h = clamp(d.y * 0.5 + 0.5, 0.0, 1.0);
          vec3 col = mix(uHorizon, uZenith, pow(smoothstep(0.5, 1.0, h), 0.8));
          col += uGlow * pow(max(dot(d, normalize(uGlowDir)), 0.0), uGlowTightness) * uGlowStrength;
          return col;
        }` : '';
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
        uniform float uTime;
        uniform float uSeaY;
        varying float vDepth;
        varying float vShoreD;
        varying vec3 vWorldPos;
        varying vec3 vWaveN;
        ${L.bedGLSL}
        ${gerstnerGLSL(P)}`)
      .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
        // Depth, shore distance and the swell in one pass. The amplitude
        // scale shoals up and dies by the real depth of water here.
        vec3 seaWp = (modelMatrix * vec4(position, 1.0)).xyz;
        float seaDep = max(uSeaY - bedHeight(seaWp.xz), 0.0);
        float seaAlive = smoothstep(${f(P.dieDepth)}, ${f(P.breakDepth)}, seaDep);
        float seaShoal = 1.0 + ${f(P.shoalPeak - 1.0)}
          * (1.0 - smoothstep(${f(P.breakDepth)}, ${f(P.deepRef)}, seaDep));
        float seaH = 0.0; vec2 seaDisp = vec2(0.0);
        vec2 seaGrad = vec2(0.0); float seaPinch = 0.0;
        seaGerstner(seaWp.xz, uTime, seaAlive * seaShoal, seaH, seaDisp, seaGrad, seaPinch);
        vec3 seaWN = normalize(vec3(-seaGrad.x, 1.0 - seaPinch, -seaGrad.y));
        // The plane is XY rotated -90° about X: local +z is world +y, local
        // +y is world -z. The normal rides along.
        objectNormal = normalize(vec3(seaWN.x, -seaWN.z, seaWN.y));
        vDepth = seaDep;
        vShoreD = seaWp.y - shoreDist(seaWp.xz);
        vWaveN = seaWN;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        transformed.x += seaDisp.x;
        transformed.y -= seaDisp.y;
        transformed.z += seaH;
        vWorldPos = seaWp + vec3(seaDisp.x, seaH, seaDisp.y);`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform float uTime;
        uniform float uSeaY;
        uniform float uMidDepth, uDeepDepth, uAlphaShallow, uAlphaDeep, uAlphaRamp;
        uniform float uFoamBreak, uShoreFoam, uEdge, uRipple, uRefl;
        uniform vec3 uShallowCol, uMidCol, uDeepCol;
        uniform sampler2D uNormalMap, uFoamMap;
        varying float vDepth;
        varying float vShoreD;
        varying vec3 vWorldPos;
        varying vec3 vWaveN;
        ${skyGLSL}`)
      .replace('vec4 diffuseColor = vec4( diffuse, opacity );', `
        vec4 diffuseColor = vec4( diffuse, opacity );
        // Depth of water above the bed, passed from the vertex stage — the
        // same bed the terrain mesh stands on (jungleLayout's SEA_BED_GLSL).
        float seaDepth = vDepth;
        // Colour: turquoise over the sand through azures to the channel.
        vec3 seaCol = mix(uMidCol, uDeepCol, smoothstep(uMidDepth, uDeepDepth, seaDepth));
        seaCol = mix(uShallowCol, seaCol, smoothstep(0.0, uMidDepth, seaDepth));
        // White water: the breaker line rides its depth contour; the wash
        // over the last hand's width of sand stays calm while the strip
        // carries the swash that runs up the beach (same uEdge there).
        float seaMote = texture2D(uFoamMap, vWorldPos.xz * 0.05
          + vec2(uTime * 0.013, uTime * 0.05)).r;
        float seaBl = uFoamBreak
          + sin(uTime * 0.42 + vWorldPos.x * 0.033) * 0.55
          + sin(uTime * 0.27 + vWorldPos.x * 0.011) * 0.35;
        float seaBrk = exp(-pow((seaDepth - seaBl) / 0.28, 2.0)) * (0.3 + 0.7 * seaMote);
        float seaWash = (1.0 - smoothstep(0.0, uShoreFoam, seaDepth))
          * (0.45 + 0.55 * seaMote)
          * (0.5 + 0.5 * smoothstep(-3.0, -0.3, vShoreD));
        float seaFoam = clamp(seaBrk + seaWash, 0.0, 1.0);
        seaCol = mix(seaCol, vec3(0.94, 0.98, 1.0), seaFoam);
        diffuseColor.rgb = seaCol;
        // Transparency: the sand shows through the shallows; foam does not.
        diffuseColor.a *= mix(uAlphaShallow, uAlphaDeep, smoothstep(0.05, uAlphaRamp, seaDepth));
        diffuseColor.a = max(diffuseColor.a, seaFoam * 0.85);`)
      .replace('#include <normal_fragment_begin>', `#include <normal_fragment_begin>
        // Water normal, world axes: the swell from the vertex stage plus two
        // scrolled layers of normal map for the chop, calmed in the shallows.
        vec3 seaN = normalize(vWaveN);
        {
          float seaCalm = mix(0.4, 1.0, smoothstep(0.0, 1.5, seaDepth)) * uRipple;
          vec3 seaN1 = texture2D(uNormalMap, vWorldPos.xz * 0.055
            + vec2(uTime * 0.021, uTime * 0.033)).xyz * 2.0 - 1.0;
          vec3 seaN2 = texture2D(uNormalMap, vWorldPos.xz * 0.021
            + vec2(-uTime * 0.011, uTime * 0.017)).xyz * 2.0 - 1.0;
          seaN = normalize(seaN
            + vec3(seaN1.x, 0.0, seaN1.y) * 0.35 * seaCalm
            + vec3(seaN2.x, 0.0, seaN2.y) * 0.22 * seaCalm);
        }
        normal = normalize((viewMatrix * vec4(seaN, 0.0)).xyz);`)
      .replace('#include <opaque_fragment>', `
        ${skyUniforms ? `{
          // The missing envMap term: the dome's own colours come back by
          // fresnel, always in step with the sky overhead. The fresnel is
          // capped near water's real grazing answer, and the reflected ray
          // leans upward — wave slopes sample the bluer sky on average, so
          // the sea never reads as a milk mirror of the pale horizon.
          vec3 seaV = normalize(cameraPosition - vWorldPos);
          float seaF = 0.02 + 0.98 * pow(1.0 - clamp(dot(seaV, seaN), 0.0, 1.0), 5.0);
          vec3 seaR = reflect(-seaV, seaN);
          seaR.y = seaR.y * 0.35 + 0.3;
          seaR = normalize(seaR);
          outgoingLight = mix(outgoingLight, seaSky(seaR), min(seaF, 0.6) * uRefl);
        }` : ''}
        #include <opaque_fragment>`);
  };

  // The plane is XY rotated -90° about X, so local +Z is world +Y. 7.1 m
  // cells resolve the shortest (34 m) swell component with room to spare.
  const sb = { width: 1600, depth: 1000, sx: 224, sz: 140, x: 0, z: L.SHORE_Z + 30 - 500, ...bounds?.sea };
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(sb.width, sb.depth, sb.sx, sb.sz), mat);
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(sb.x, seaY, sb.z);
  sea.name = 'jungle_sea';
  scene.add(sea);

  // --- Swash --------------------------------------------------------------
  const swash = { edge: 0, period: P.swash.period };
  function updateSwash(t) {
    const cyc = Math.floor(t / swash.period);
    const ph = t / swash.period - cyc;
    const h = Math.abs(Math.sin(cyc * 12.9898) * 43758.5453) % 1;
    const reach = P.swash.reachMin + h * (P.swash.reachMax - P.swash.reachMin);
    const e = ph < 0.22
      ? THREE.MathUtils.smoothstep(ph, 0, 0.22)
      : 1 - THREE.MathUtils.smoothstep(ph, 0.22, 1);
    swash.edge = P.swash.base + e * reach;
  }

  // --- Foam strip, conformed to max(bed, sea) -----------------------------
  const foamTex = makeFoamTexture(maxAniso);
  uniforms.uFoamMap.value = foamTex;
  const fb = { x0: -130, x1: 130, z0: -62, z1: 6, sx: 130, sz: 34, ...bounds?.foam };
  const {x0: X0, x1: X1, z0: Z0, z1: Z1, sx: SX, sz: SZ} = fb;
  const fg = new THREE.PlaneGeometry(X1 - X0, Z1 - Z0, SX, SZ);
  fg.rotateX(-Math.PI / 2);
  fg.translate((X0 + X1) / 2, 0, (Z0 + Z1) / 2);
  const fp = fg.getAttribute('position');
  const aD = new Float32Array(fp.count), aX = new Float32Array(fp.count);
  const aH = new Float32Array(fp.count), aDep = new Float32Array(fp.count);
  for (let i = 0; i < fp.count; i++) {
    const x = fp.getX(i), z = fp.getZ(i);
    const bed = L.terrainHeight(x, z);
    fp.setY(i, Math.max(bed, seaY) + 0.07);
    aD[i] = z - L.shoreAt(x);
    aX[i] = x;
    // Height of the ground above the sea. The headlands climb out of the
    // water well before shoreAt says the shore is, and foam painted up a
    // ten-metre rock face is the first thing anyone would see.
    aH[i] = bed - seaY;
    // Real depth of water here — the breaker line rides its contour.
    aDep[i] = Math.max(0, seaY - bed);
  }
  fg.setAttribute('aD', new THREE.BufferAttribute(aD, 1));
  fg.setAttribute('aX', new THREE.BufferAttribute(aX, 1));
  fg.setAttribute('aH', new THREE.BufferAttribute(aH, 1));
  fg.setAttribute('aDep', new THREE.BufferAttribute(aDep, 1));
  const foamUniforms = {
    uTime: { value: 0 },
    uEdge: { value: 0 },
    uMap: { value: foamTex },
    uColor: { value: new THREE.Color(0xf4fcff) },
    uOpacity: { value: 0.55 },
    uBreak: { value: P.foamBreak },
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
      attribute float aDep;
      varying float vD;
      varying float vX;
      varying float vH;
      varying float vDep;
      varying vec2 vUv;
      void main() {
        vD = aD; vX = aX; vH = aH; vDep = aDep; vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      uniform float uTime, uEdge, uOpacity, uBreak;
      uniform sampler2D uMap;
      uniform vec3 uColor;
      varying float vD;
      varying float vX;
      varying float vH;
      varying float vDep;
      varying vec2 vUv;
      void main() {
        float edge = uEdge + sin(vX * 0.047) * 1.1 + sin(vX * 0.017 + 2.1) * 1.6;
        float d = vD;
        float lead  = 1.0 - smoothstep(0.0, 1.4, abs(d - edge));
        float sheet = (1.0 - smoothstep(edge - 0.3, edge + 0.5, d))
                    * smoothstep(-8.0, -1.0, d) * 0.14;
        // The lagoon's small waves fail where the water is about uBreak deep:
        // the white line rides the real depth contour instead of a fixed
        // offset, so it follows the cove's curve.
        float bl = uBreak + sin(uTime * 0.4 + vX * 0.035) * 0.5;
        float brk = (1.0 - smoothstep(0.0, 1.4, abs(vDep - bl))) * 0.4;
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

  // --- What floats asks the sea -------------------------------------------
  // The maths live in oceanSurface.js (pure, testable); this wrapper wires
  // them to the map's bed. The wading player, the tender and any floating
  // prop will ask this instead of keeping their own sea.
  function waterHeightAt(x, z, t) {
    return waterSurfaceAt(x, z, t, {
      seaY, preset: P,
      depthAt: (px, pz) => seaY - L.terrainHeight(px, pz),
    });
  }

  function update(t) {
    uniforms.uTime.value = t;
    // The chop scrolls in the fragment shader (two layers of uNormalMap at
    // different scales); the shared texture's offset stays untouched — the
    // waterfall's pool cloned it and scrolls its own.
    updateSwash(t);
    foamUniforms.uTime.value = t;
    foamUniforms.uEdge.value = swash.edge;
    uniforms.uEdge.value = swash.edge;
  }

  // The foam strip is unlit: by night it is dimmed to moonlit grey-blue.
  const foamDay = foamUniforms.uColor.value.clone();
  function setNight(on) {
    if (on) foamUniforms.uColor.value.setRGB(0.26, 0.32, 0.42);
    else foamUniforms.uColor.value.copy(foamDay);
  }

  return {
    sea, foam, uniforms, swash, update, setNight,
    waterHeightAt,
    swellAt: waterHeightAt,   // the old name — the swell died at a hard line
    preset: P,
  };
}

