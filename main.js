// Cyberpunk Megapolis — three.js web explorer
// Data + assets produced by the unitypackage-to-web pipeline (see SKILL.md).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { Player } from './player.js?v=3';

// build stamp: shown in the HUD + console so a stale-cache session is
// recognizable at a glance (a mixed old/new module graph once reproduced the
// "restart from the sky every few seconds" loop with zero errors)
const BUILD = '2026-07-15a1';
console.log(`[build] ${BUILD}`);

// ---------- coordinate convention (verified: case A — Blender FBX->glTF export_yup) ----------
// three world == mirrorX(unity world): glTF geometry is already the X-mirror of Unity's,
// so transforms are CONJUGATED: pos(-x,y,z), quat(x,-y,-z,w), scale unchanged.
const convPos  = t => new THREE.Vector3(-t[0], t[1], t[2]);
const convQuat = r => new THREE.Quaternion(r[0], -r[1], -r[2], r[3]);
// three r169 PropertyBinding.sanitizeNodeName (GLTFLoader applies it to node names)
const sanitize = s => s.replace(/\s/g, '_').replace(/[\[\].:\\/]/g, '');
const strip = n => n.replace(/\.\d{3}$/, '');   // Blender .001 suffixes

const $ = id => document.getElementById(id);
// ---------- real loading progress (bar + counter) ----------
const loadMsg = m => { $('loadMsg').textContent = m; };
const loadMgr = new THREE.LoadingManager();
let loadDone = false;
loadMgr.onLoad = () => {
  loadDone = true;
  $('barFill').style.width = '100%';
  $('loadPct').textContent = '100%';
  if (window.__showMenu) window.__showMenu();
};
loadMgr.onProgress = (url, loaded, total) => {
  const pct = Math.round(loaded / total * 100);
  $('barFill').style.width = pct + '%';
  $('loadPct').textContent = pct + '%';
  loadMsg(`loading assets · ${loaded} / ${total}`);
};
window.addEventListener('error', e => { loadMsg('ERROR: ' + e.message); });

// ---------- fatal error surface: context loss / unhandled rejection ----------
const errOv = $('errOv'), errMsg = $('errMsg');
function showFatal(msg) {
  if (errOv.classList.contains('show')) return;
  errMsg.textContent = msg;
  errOv.classList.add('show');
}
$('errRetry').addEventListener('click', () => location.reload());
window.addEventListener('unhandledrejection', e => {
  console.error('unhandledrejection:', e.reason);
  showFatal('加载或运行出错 · ' + (e.reason?.message || e.reason || 'unknown') + ' — 请点击重试。');
});

const J = u => { loadMgr.itemStart(u); return fetch(u).then(r => r.json()).finally(() => loadMgr.itemEnd(u)); };

// ---------- renderer / scene ----------
const renderer = new THREE.WebGLRenderer({
  antialias: true, powerPreference: 'high-performance',
  logarithmicDepthBuffer: true,   // 5.8km city + near 0.3m: kills z-fighting flicker
});
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));   // 2.0 retina cost ~2x GPU for little gain at motion
renderer.setSize(innerWidth, innerHeight);
// production: skip per-program shader-log checks — some drivers return null
// info logs, and the check costs a GL roundtrip per program on first use
renderer.debug.checkShaderErrors = false;
// surface GPU context loss instead of silently freezing on a blank canvas
renderer.domElement.addEventListener('webglcontextlost', e => {
  e.preventDefault();
  showFatal('WebGL 上下文丢失（GPU 资源不足或驱动重置）— 点击重试恢复。');
});
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;
renderer.info.autoReset = false;   // composer renders multiple passes per frame; HUD sums them
renderer.domElement.setAttribute('aria-label',
  'Cyberpunk Megapolis 3D 游戏画面：WASD 移动，鼠标转动视角，空格跳跃/按住发射蛛丝，E 飞掠，R 重新跃入，T 切换昼夜');
$('app').appendChild(renderer.domElement);
// touch devices get a clear notice instead of dead controls (no touch gameplay)
if (matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window) {
  const t = document.createElement('div');
  t.style.cssText = 'position:fixed;left:50%;bottom:18px;transform:translateX(-50%);z-index:25;' +
    'font-size:12px;letter-spacing:.18em;color:#eef1f8;background:rgba(8,10,22,0.72);' +
    'border:1px solid rgba(140,160,255,0.25);border-radius:8px;padding:9px 18px;' +
    'backdrop-filter:blur(3px);pointer-events:none;';
  t.textContent = '请使用键盘和鼠标 · PLEASE USE A KEYBOARD AND MOUSE';
  document.body.appendChild(t);
}
const MAXANISO = renderer.capabilities.getMaxAnisotropy();

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x454c56, 0.00085);

const camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.3, 9000);

// ---------- procedural sky dome (shader-built; day / dusk / night presets) ----------
const skyUniforms = {
  uSunDir:   { value: new THREE.Vector3(0, -1, 0) },
  uZenith:   { value: new THREE.Color(0x23272e) },
  uHorizon:  { value: new THREE.Color(0x555c66) },
  uGround:   { value: new THREE.Color(0x2a2e34) },
  uSunColor: { value: new THREE.Color(0xfff4e0) },
  uSunSize:  { value: 0.012 },   // disk radius (radians)
  uSunGlow:  { value: 300.0 },   // halo tightness
  uHalo:     { value: 0.0 },     // halo strength
  uSunDisk:  { value: 2.5 },     // disk HDR intensity (feeds bloom — keep moderate)
  uTime:     { value: 0.0 },
  uCloudCover: { value: 0.52 },
  uCloudCol: { value: new THREE.Color(0x262c38) },
  uCloudLit: { value: 0.35 },
  uCloudAlpha: { value: 0.8 },
  uCloudScale: { value: 0.85 },
  uWind:     { value: new THREE.Vector2(0.012, 0.005) },
  uStars:    { value: 1.0 },
  uMoon:     { value: 1.0 },
  uMoonDir:  { value: new THREE.Vector3(-0.45, 0.5, -0.35).normalize() },
  uMoonCol:  { value: new THREE.Color(0xdfe6ff) },
  uMoonSize: { value: 0.022 },
};
const skyDome = new THREE.Mesh(
  new THREE.SphereGeometry(100, 32, 16),
  new THREE.ShaderMaterial({
    uniforms: skyUniforms,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    vertexShader: /* glsl */`
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_Position.z = gl_Position.w;   // pin to far plane — dome follows camera
      }`,
    fragmentShader: /* glsl */`
      varying vec3 vDir;
      uniform vec3 uSunDir, uZenith, uHorizon, uGround, uSunColor;
      uniform float uSunSize, uSunGlow, uHalo, uSunDisk;
      uniform float uTime, uCloudCover, uCloudLit, uCloudAlpha, uCloudScale;
      uniform vec3 uCloudCol;
      uniform vec2 uWind;
      uniform float uStars, uMoon, uMoonSize;
      uniform vec3 uMoonDir, uMoonCol;

      float hash(vec2 p){ p = fract(p*vec2(123.34, 345.45)); p += dot(p, p+34.345); return fract(p.x*p.y); }
      float vnoise(vec2 p){
        vec2 i = floor(p), f = fract(p);
        vec2 u = f*f*(3.0-2.0*f);
        return mix(mix(hash(i+vec2(0.,0.)), hash(i+vec2(1.,0.)), u.x),
                   mix(hash(i+vec2(0.,1.)), hash(i+vec2(1.,1.)), u.x), u.y);
      }
      float fbm(vec2 p){
        float v = 0.0, a = 0.55;
        for(int i=0;i<5;i++){ v += a*vnoise(p); p = p*2.03 + 7.1; a *= 0.5; }
        return v;
      }
      float hash3(vec3 p){ p = fract(p*0.3183099 + 0.1); p *= 17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }

      void main() {
        vec3 v = normalize(vDir);
        float h = v.y;
        float sky = pow(clamp(h, 0.0, 1.0), 0.45);
        vec3 col = mix(uHorizon, uZenith, sky);
        col = mix(uGround, col, smoothstep(-0.22, 0.04, h));   // below horizon

        // sun
        float d = max(dot(v, uSunDir), 0.0);
        col += uSunColor * pow(d, uSunGlow) * uHalo;           // halo
        float ang = acos(d);
        float disk = 1.0 - smoothstep(uSunSize * 0.85, uSunSize, ang);
        col += uSunColor * disk * uSunDisk;                    // HDR disk (blooms)

        // stars (night)
        if (uStars > 0.001 && h > 0.0) {
          vec3 ip = floor(v * 260.0);
          float sh = hash3(ip);
          float star = smoothstep(0.9965, 1.0, sh);
          star *= 0.75 + 0.25 * sin(uTime * 2.5 + sh * 90.0);  // twinkle
          star *= smoothstep(0.0, 0.35, h);                    // fade near horizon
          col += vec3(star) * uStars;
        }

        // moon (night)
        if (uMoon > 0.001) {
          float md = max(dot(v, uMoonDir), 0.0);
          float mang = acos(md);
          float mdisk = 1.0 - smoothstep(uMoonSize * 0.92, uMoonSize, mang);
          float mott = fbm(v.xy * 6.0 + 11.0);
          col += uMoonCol * (0.72 + 0.28 * mott) * mdisk * 2.6 * uMoon;
          col += uMoonCol * pow(md, 400.0) * 0.6 * uMoon;      // glow
        }

        // clouds — planar projection, two FBM layers, sun-lit tint
        if (uCloudAlpha > 0.001) {
          float proj = h + 0.18;
          vec2 cuv = v.xz / max(proj, 0.035) * uCloudScale + uWind * uTime;
          float n1 = fbm(cuv);
          float n2 = fbm(cuv * 2.13 + 19.7 - uWind * uTime * 0.6);
          float cd = smoothstep(uCloudCover, uCloudCover + 0.28, n1);
          cd = max(cd, smoothstep(uCloudCover + 0.12, uCloudCover + 0.42, n2) * 0.85);
          cd *= smoothstep(0.015, 0.22, h);                    // fade at horizon
          float sunFace = pow(max(dot(normalize(vec3(v.x, 0.3, v.z)), uSunDir), 0.0), 3.0);
          vec3 cc = mix(uCloudCol, uSunColor, clamp(sunFace * uCloudLit, 0.0, 1.0));
          cc *= 0.85 + 0.15 * n2;                              // internal shading
          col = mix(col, cc, clamp(cd * uCloudAlpha, 0.0, 1.0));
        }

        gl_FragColor = vec4(col, 1.0);
      }`,
  }));
skyDome.frustumCulled = false;
skyDome.renderOrder = -1;
scene.add(skyDome);

// ---------- environment map from the pack's own reflection probe (cross -> equirect, see SKILL.md) ----------
const pmrem = new THREE.PMREMGenerator(renderer);
new THREE.TextureLoader(loadMgr).load('./data/env_equirect.png', tex => {
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  scene.environment = pmrem.fromEquirectangular(tex).texture;
  scene.environmentIntensity = SKY_PRESETS[presetName].envInt;
  tex.dispose();
});

// ---------- lights (driven by the sky preset) ----------
const hemi = new THREE.HemisphereLight(0x9aa6b4, 0x2a2622, 1.3);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xcfd8e4, 0.55);
scene.add(sun);

// presets: sky colors + sun + light + post + fog per time of day
const SKY_PRESETS = {
  night: {  // moon + stars + dark cloud silhouettes over the pack's own overcast mood
    zenith: 0x141821, horizon: 0x3a414c, ground: 0x0d1015,
    sunDir: [0, -1, 0], sunColor: 0xfff4e0, sunSize: 0.012, sunGlow: 300, halo: 0,
    cloudCover: 0.52, cloudCol: 0x2b323f, cloudLit: 0.3, cloudAlpha: 0.8, cloudScale: 0.85,
    wind: [0.012, 0.005], stars: 1.0, moon: 1.0,
    moonDir: [-0.45, 0.5, -0.35], moonCol: 0xdfe6ff, moonSize: 0.022,
    hemiSky: 0x9aa6b4, hemiGnd: 0x2a2622, hemiInt: 1.3,
    sunInt: 0.55, sunLightCol: 0xcfd8e4,
    exposure: 1.12, bloom: [0.55, 0.5, 0.82], fog: 0x454c56, fogD: 0.00085,
    envInt: 0.55, clouds: 0x9aa0a8, bg: 0x141821,
  },
  day: {  // blue sky with white drifting clouds
    zenith: 0x2a6ad0, horizon: 0xc9dff2, ground: 0x1a2027,
    sunDir: [0.35, 0.75, 0.45], sunColor: 0xfff4e0, sunSize: 0.011, sunGlow: 380, halo: 1.0, sunDisk: 2.5,
    cloudCover: 0.46, cloudCol: 0xf4f8fc, cloudLit: 0.55, cloudAlpha: 0.92, cloudScale: 1.0,
    wind: [0.02, 0.008], stars: 0.0, moon: 0.0,
    moonDir: [-0.45, 0.5, -0.35], moonCol: 0xdfe6ff, moonSize: 0.022,
    hemiSky: 0xbcd6f5, hemiGnd: 0x6b655c, hemiInt: 1.75,
    sunInt: 1.6, sunLightCol: 0xfff2dd,
    exposure: 1.0, bloom: [0.3, 0.4, 0.95], fog: 0xb9c9d8, fogD: 0.00045,
    envInt: 0.9, clouds: 0xffffff, bg: 0x9fc2e8,
  },
  dusk: {  // sunset clouds lit pink/orange, first stars, neon pops
    zenith: 0x262a55, horizon: 0xf2a06a, ground: 0x1e222b,
    sunDir: [0.8, 0.12, 0.35], sunColor: 0xffb27a, sunSize: 0.014, sunGlow: 140, halo: 1.4, sunDisk: 2.0,
    cloudCover: 0.42, cloudCol: 0x54465e, cloudLit: 1.6, cloudAlpha: 0.92, cloudScale: 0.9,
    wind: [0.015, 0.006], stars: 0.3, moon: 0.0,
    moonDir: [-0.45, 0.5, -0.35], moonCol: 0xdfe6ff, moonSize: 0.022,
    hemiSky: 0x8a86b0, hemiGnd: 0x4a3f38, hemiInt: 1.35,
    sunInt: 0.95, sunLightCol: 0xffb98a,
    exposure: 1.08, bloom: [0.6, 0.5, 0.8], fog: 0x8d7f8e, fogD: 0.0007,
    envInt: 0.65, clouds: 0xf0c0a0, bg: 0x262a55,
  },
};
const PRESET_ORDER = ['night', 'day', 'dusk'];
let presetName = 'night';
const cloudMeshes = [];   // filled during scene build; tinted per preset
function applyPreset(name) {
  presetName = name;
  const p = SKY_PRESETS[name];
  skyUniforms.uZenith.value.set(p.zenith);
  skyUniforms.uHorizon.value.set(p.horizon);
  skyUniforms.uGround.value.set(p.ground);
  skyUniforms.uSunColor.value.set(p.sunColor);
  skyUniforms.uSunDir.value.set(...p.sunDir).normalize();
  skyUniforms.uSunSize.value = p.sunSize;
  skyUniforms.uSunGlow.value = p.sunGlow;
  skyUniforms.uHalo.value = p.halo;
  skyUniforms.uSunDisk.value = p.sunDisk ?? 2.5;
  skyUniforms.uCloudCover.value = p.cloudCover;
  skyUniforms.uCloudCol.value.set(p.cloudCol);
  skyUniforms.uCloudLit.value = p.cloudLit;
  skyUniforms.uCloudAlpha.value = p.cloudAlpha;
  skyUniforms.uCloudScale.value = p.cloudScale;
  skyUniforms.uWind.value.set(p.wind[0], p.wind[1]);
  skyUniforms.uStars.value = p.stars;
  skyUniforms.uMoon.value = p.moon;
  skyUniforms.uMoonDir.value.set(...p.moonDir).normalize();
  skyUniforms.uMoonCol.value.set(p.moonCol);
  skyUniforms.uMoonSize.value = p.moonSize;
  hemi.color.set(p.hemiSky); hemi.groundColor.set(p.hemiGnd); hemi.intensity = p.hemiInt;
  sun.color.set(p.sunLightCol); sun.intensity = p.sunInt;
  sun.position.copy(skyUniforms.uSunDir.value).multiplyScalar(400);
  renderer.toneMappingExposure = p.exposure;
  bloom.strength = p.bloom[0]; bloom.radius = p.bloom[1]; bloom.threshold = p.bloom[2];
  scene.fog.color.set(p.fog); scene.fog.density = p.fogD;
  scene.background = new THREE.Color(p.bg);
  scene.environmentIntensity = p.envInt;
  for (const c of cloudMeshes) c.material.color.set(p.clouds);
}

// ---------- data ----------
const [MATS, PREFABS, SCALES, SCENE, SIGN_FIXES, FBXORD] = await Promise.all([
  J('./data/materials.json'), J('./data/prefabs.json'),
  J('./data/scales.json'), J('./data/scene.json'),
  J('./data/sign_fixes.json'), J('./data/fbx_mat_order.json'),
]);
loadMsg('loading models & textures…');

// procedural deck/plaza clutter (scripts/gen_deck_clutter.py): the bare
// stacked-slum platforms and synthetic plazas read as empty plates — scatter
// the pack's own props over them. Placements merge into the normal pipeline
// (same per-prefab InstancedMeshes, zero extra draw calls). ?noclutter skips
// (the generator uses it to probe the raw surfaces).
if (!location.search.includes('noclutter')) {
  const [clutter, belt] = await Promise.all([
    fetch('./data/deck_clutter.json').then(r => (r.ok ? r.json() : null)).catch(() => null),
    fetch('./data/belt.json').then(r => (r.ok ? r.json() : null)).catch(() => null),
  ]);
  if (clutter?.length) SCENE.placements.push(...clutter);
  if (belt?.length) SCENE.placements.push(...belt);
  console.log(`deck clutter: ${clutter?.length ?? 0} props, belt: ${belt?.length ?? 0} props`);
}

// synthetic material for the slums' elevated deck surfaces (see bakePrefab):
// their authored UVs stretch the city-photo's highway strip into blank gray
// "steel plates" — re-projected planar UVs + tiled concrete read as real decks
MATS.CP_Deck = {
  tex: 'CP_Concrete_03_A.tga', normalTex: 'CP_Concrete_03_N.tga',
  texScale: [1, 1], color: [0.32, 0.335, 0.365, 1], emission: [0, 0, 0, 1],
  metallic: 0, smoothness: 0.08, mode: 0, cutoff: 0.5, bumpScale: 1, shader: 'builtin',
};


// ---------- texture factory ----------
// deploy build: prefer .webp (manifest), fall back to .png (master bundle)
const WEBP_SET = new Set(await fetch('./data/textures_webp.json')
  .then(r => (r.ok ? r.json() : [])).catch(() => []));
function texFile(file) {
  const base = file.replace(/\.(tga|psd|tif|png)$/i, '');
  return WEBP_SET.has(base + '.webp') ? base + '.webp' : base + '.png';
}
const texCache = {};
function texture(file, srgb = true) {
  file = texFile(file);
  const key = file + (srgb ? '' : '#lin');
  if (!texCache[key]) {
    const t = new THREE.TextureLoader(loadMgr).load('./textures/' + encodeURIComponent(file));
    t.flipY = false;                       // glTF UV convention
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.LinearSRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = MAXANISO;
    texCache[key] = t;
  }
  return texCache[key];
}
// Unity MetallicSmoothness (R=metallic, A=smoothness) -> three metalnessMap(B)/roughnessMap(G)
const msCache = {};
function packMetalRough(file, onReady) {
  const url = './textures/' + encodeURIComponent(texFile(file));
  if (msCache[url]) return onReady(msCache[url]);
  const img = new Image();
  img.onload = () => {
    const c = Object.assign(document.createElement('canvas'), { width: img.width, height: img.height });
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(0, 0, c.width, c.height), px = d.data;
    for (let i = 0; i < px.length; i += 4) {
      const metal = px[i], smooth = px[i + 3];
      px[i + 1] = 255 - smooth;   // G = roughness
      px[i + 2] = metal;          // B = metalness
      px[i] = 0; px[i + 3] = 255;
    }
    ctx.putImageData(d, 0, 0);
    const t = new THREE.CanvasTexture(c);
    t.flipY = false; t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = THREE.LinearSRGBColorSpace;
    t.anisotropy = MAXANISO;
    msCache[url] = t;
    onReady(t);
  };
  img.onerror = () => console.warn('MS texture missing:', url);
  img.src = url;
}

// ---------- material factory ----------
const matCache = {};
function tiledClone(base, repeat) {
  const t = base.clone();
  t.needsUpdate = true;
  t.repeat.set(repeat[0], repeat[1]);
  return t;
}
function matFor(name) {
  if (!name || !MATS[name]) name = 'CP_Base';
  if (matCache[name]) return matCache[name];
  const i = MATS[name], m = new THREE.MeshStandardMaterial({ name });
  const rep = i.texScale || [1, 1], tiled = rep[0] !== 1 || rep[1] !== 1;
  m.color.setRGB(i.color[0], i.color[1], i.color[2], THREE.SRGBColorSpace);
  if (i.tex) m.map = tiled ? tiledClone(texture(i.tex), rep) : texture(i.tex);
  if (i.normalTex) {
    m.normalMap = tiled ? tiledClone(texture(i.normalTex, false), rep) : texture(i.normalTex, false);
    m.normalScale.setScalar(i.bumpScale ?? 1);
  }
  if (i.metalTex) {
    m.metalness = 1; m.roughness = 1;
    packMetalRough(i.metalTex, t => {
      m.metalnessMap = tiled ? tiledClone(t, rep) : t;
      m.roughnessMap = m.metalnessMap;
      m.needsUpdate = true;
    });
  } else {
    m.metalness = Math.min(i.metallic ?? 0, 0.5);
    m.roughness = THREE.MathUtils.clamp(1 - (i.smoothness ?? 0.3), 0.35, 1);
  }
  if (i.aoTex) m.aoMap = texture(i.aoTex, false);
  if (i.emission[0] + i.emission[1] + i.emission[2] > 0.03) {
    m.emissive.setRGB(i.emission[0], i.emission[1], i.emission[2], THREE.SRGBColorSpace);
    m.emissiveMap = i.emisTex ? texture(i.emisTex) : (m.map || null);
  }
  if (i.mode === 1) {                                   // cutout (signboards, grates)
    m.alphaTest = i.cutoff ?? 0.5;
    m.alphaToCoverage = true;
  } else if (i.mode >= 2) {                             // transparent (decals, glass)
    m.transparent = true;
    m.opacity = Math.max(i.color[3], 0.25);
    m.depthWrite = false;
    m.side = THREE.DoubleSide;
    m.polygonOffset = true; m.polygonOffsetFactor = -2; m.polygonOffsetUnits = -2;
  }
  return (matCache[name] = m);
}

// ---------- model templates from category GLBs ----------
const templates = {};          // sanitized model name -> ROOT_ node
const dracoLoader = new DRACOLoader(loadMgr).setDecoderPath('./vendor/draco/');
const glbLoader = new GLTFLoader(loadMgr).setDRACOLoader(dracoLoader);
const glbFiles = ['Background', 'Car', 'Combined_Building', 'Decals', 'Environment',
                  'Facade_Details', 'Metro', 'Modules', 'Street'];
await Promise.all(glbFiles.map(f => glbLoader.loadAsync('./glb/' + f + '.glb').then(gltf => {
  gltf.scene.traverse(o => {
    if (o.name.startsWith('ROOT_')) {
      const name = o.name.slice(5);
      templates[name] = o;
      o.userData.skinned = false;
      o.traverse(c => { if (c.isSkinnedMesh) o.userData.skinned = true; });
      const gs = SCALES[name];                       // per-model globalScale fix (none in this pack)
      if (gs && gs !== 1) for (const c of o.children) {
        c.scale.multiplyScalar(gs); c.position.multiplyScalar(gs);
      }
    }
  });
})));
loadMsg('binding materials…');

// ---------- bind materials to primitives ----------
// Unity submesh j renders prefab m_Materials[j], and j follows the FIRST-
// APPEARANCE order of material indices over the FBX polygons — Blender's
// FBX→glTF path emits primitives in CONNECTION order instead, so binding by
// primitive index rotated whole atlases onto the wrong surfaces (building
// facades baked onto the slums ground = the "flattened stickers" bug).
// The GLB primitives keep FBX-internal material names; fbx_mat_order.json
// (scripts/extract_fbx_mat_order.py) maps name -> Unity slot.
function assignMaterials(modelName) {
  const tpl = templates[sanitize(modelName)];
  if (!tpl || tpl.userData.matsDone) return tpl;
  tpl.userData.matsDone = true;
  const parts = {};
  const raw = partsByModel[modelName] || {};
  for (const k in raw) parts[sanitize(strip(k))] = raw[k];
  const orders = {};
  const rawOrd = FBXORD[modelName] || {};
  for (const k in rawOrd) orders[sanitize(strip(k))] = rawOrd[k];
  tpl.traverse(o => {
    if (!o.isMesh) return;
    const key = sanitize(strip(o.name));
    const parentKey = o.parent ? sanitize(strip(o.parent.name)) : '';
    const fbxName = (o.material?.name || '').replace(/\.\d+$/, '');
    const mats = parts[key] || parts[parentKey];
    if (mats?.length) {
      const order = orders[key] || orders[parentKey];
      let idx = order ? order.indexOf(fbxName) : -1;
      if (idx < 0) {
        // no slot table / unknown name — legacy sibling-order fallback
        const sibs = o.parent.children.filter(c => c.isMesh);
        idx = sibs.length > 1 ? Math.min(Math.max(sibs.indexOf(o), 0), mats.length - 1) : 0;
      }
      o.material = matFor(mats[Math.min(idx, mats.length - 1)]);
    } else if (MATS[fbxName]) {
      // renderers the prefab table doesn't cover (LOD copies, extra parts like
      // doors, car wheels): the FBX material name is a real material — use it
      o.material = matFor(fbxName);
    } else {
      o.material = matFor(null);
    }
  });
  return tpl;
}
const partsByModel = {};
for (const pn in PREFABS) {
  const p = PREFABS[pn];
  if (p.model && p.parts) partsByModel[p.model] = p.parts;
}

// ---------- bake each prefab: one merged geometry per material ----------
function normalizeGeo(g, world) {
  const out = g.clone().applyMatrix4(world);
  for (const k of Object.keys(out.attributes))
    if (!['position', 'normal', 'uv', 'uv2'].includes(k)) out.deleteAttribute(k);
  if (!out.attributes.uv)
    out.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(out.attributes.position.count * 2), 2));
  if (!out.attributes.uv2)
    out.setAttribute('uv2', new THREE.BufferAttribute(out.attributes.uv.array.slice(0), 2)); // aoMap uses uv2
  out.morphAttributes = {};
  return out;
}
const bakeCache = {};
// Unity LODGroups (603/609 prefabs) render ONE level; the GLBs carry all of
// them — without this filter LOD1/LOD2 draw stacked on LOD0 (coplanar
// z-fighting patches + ~168 redundant meshes). Collider hulls (16
// `*_Collider` nodes, MeshCollider-only in Unity) must not render either —
// they used to draw as gray shells over the combined buildings.
const LOD_RE = /_lod[1-9]\d*(?:[_.]|$)/i;
const COLLIDER_RE = /collider/i;
function bakePrefab(prefabName) {
  if (bakeCache[prefabName] !== undefined) return bakeCache[prefabName];
  const model = PREFABS[prefabName]?.model;
  const tpl = model && assignMaterials(model);
  if (!tpl || tpl.userData.skinned) return (bakeCache[prefabName] = null);
  tpl.updateMatrixWorld(true);
  const rootInv = new THREE.Matrix4().copy(tpl.matrixWorld).invert();
  const byMat = new Map();
  tpl.traverse(o => {
    if (!o.isMesh) return;
    if (LOD_RE.test(o.name) || (o.parent && LOD_RE.test(o.parent.name))) return;
    if (COLLIDER_RE.test(o.name) || (o.parent && COLLIDER_RE.test(o.parent.name))) return;
    const rel = new THREE.Matrix4().multiplyMatrices(rootInv, o.matrixWorld);
    const list = byMat.get(o.material) || byMat.set(o.material, []).get(o.material);
    list.push(normalizeGeo(o.geometry, rel));
  });
  const merged = [];
  for (const [mat, geos] of byMat) {
    const list = geos.map(g => g.index ? g : g);           // keep as-is
    const g = list.length === 1 ? list[0] : BufferGeometryUtils.mergeGeometries(list, false);
    if (g) merged.push({ geo: g, mat });
  }
  // Stacked-city surfaces: CP_City_Ground primitives hold base grounds AND
  // elevated decks/plates whose authored UVs collapse onto the photo texture's
  // highway strip — from the air they smear into blank "steel plates". Detect
  // degenerate mapping PER TRIANGLE (uv-area vs world-area density) and rebuild
  // those faces with planar UVs + tiled concrete; healthy faces (real grounds,
  // highway ribbons with lane markings) keep the authored photo mapping.
  const DECK_UV_DENSITY = 1.5e-6;   // photo tile baseline ≈ (1/200 m)² = 2.5e-5
  for (let mi = merged.length - 1; mi >= 0; mi--) {
    // huge-triangle plates exist under SEVERAL materials (City_Ground photo
    // planes AND slums-atlas-smeared deck faces) — the area rule is universal;
    // the UV-density rule stays City_Ground-only (atlas walls are legit)
    const isCG = merged[mi].mat.name === 'CP_City_Ground';
    if (merged[mi].mat === matFor('CP_Deck')) continue;
    const src = merged[mi].geo.index ? merged[mi].geo.toNonIndexed() : merged[mi].geo;
    const p = src.attributes.position, srcUv = src.attributes.uv;
    const bp = [], bu = [], dp = [];
    const e1 = new THREE.Vector3(), e2 = new THREE.Vector3(), cr = new THREE.Vector3();
    for (let t = 0; t < p.count; t += 3) {
      e1.set(p.getX(t + 1) - p.getX(t), p.getY(t + 1) - p.getY(t), p.getZ(t + 1) - p.getZ(t));
      e2.set(p.getX(t + 2) - p.getX(t), p.getY(t + 2) - p.getY(t), p.getZ(t + 2) - p.getZ(t));
      cr.crossVectors(e1, e2);
      const worldArea = cr.length() / 2;
      const horiz = worldArea > 0 && Math.abs(cr.y) / (worldArea * 2) > 0.75;   // face points up/down
      const du1 = srcUv.getX(t + 1) - srcUv.getX(t), dv1 = srcUv.getY(t + 1) - srcUv.getY(t);
      const du2 = srcUv.getX(t + 2) - srcUv.getX(t), dv2 = srcUv.getY(t + 2) - srcUv.getY(t);
      const uvArea = Math.abs(du1 * dv2 - du2 * dv1) / 2;
      const density = uvArea / Math.max(worldArea, 1e-9);
      // deck plates come in three flavors: giant photo quads (20k-80k m^2/tri),
      // photo planes with near-zero UV density, and TESSELLATED atlas-smeared
      // faces (7-180 m^2/tri, density orders below any legit atlas mapping
      // ~4e-3). Convert HORIZONTAL degenerate faces only — smeared walls would
      // turn into striped concrete. Healthy mappings (streets ~1.6e-2, highway
      // ribbons, shack roofs) stay authored.
      const degenerate = horiz && (worldArea > 2500 ||
                         (isCG && worldArea > 1 && density < DECK_UV_DENSITY) ||
                         (!isCG && worldArea > 4 && density < 6e-4));   // smears ~1.3e-4, legit atlas ~4e-3
      if (degenerate) {
        for (let k = 0; k < 3; k++) dp.push(p.getX(t + k), p.getY(t + k), p.getZ(t + k));
      } else {
        for (let k = 0; k < 3; k++) {
          bp.push(p.getX(t + k), p.getY(t + k), p.getZ(t + k));
          bu.push(srcUv.getX(t + k), srcUv.getY(t + k));
        }
      }
    }
    if (!dp.length) continue;
    const out = [];
    if (bp.length) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(bp, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(bu, 2));
      geo.setAttribute('uv2', new THREE.Float32BufferAttribute(bu.slice(0), 2));
      geo.computeVertexNormals();
      out.push({ geo, mat: merged[mi].mat });
    }
    const dgeo = new THREE.BufferGeometry();
    dgeo.setAttribute('position', new THREE.Float32BufferAttribute(dp, 3));
    const duv = new Float32Array((dp.length / 3) * 2);
    for (let v = 0, u = 0; v < dp.length; v += 3, u += 2) {
      duv[u] = dp[v] * 0.12; duv[u + 1] = dp[v + 2] * 0.12;   // ~8.3 m tiles
    }
    dgeo.setAttribute('uv', new THREE.BufferAttribute(duv, 2));
    dgeo.setAttribute('uv2', new THREE.BufferAttribute(duv.slice(0), 2));
    dgeo.computeVertexNormals();
    out.push({ geo: dgeo, mat: matFor('CP_Deck') });
    merged.splice(mi, 1, ...out);
  }
  return (bakeCache[prefabName] = { merged });
}

// ---------- build the city: one InstancedMesh per (prefab, material) ----------
const world = new THREE.Group();
scene.add(world);
// placements: drop byte-identical duplicates (author errors); same-spot rotated
// layers (the pack stacks 90°-rotated slum blocks for density) get a 3cm lift so
// their coplanar ground planes don't z-fight
const dupSeen = new Map();
const placements = [];
let fixCount = 0;
const fixSign = pl => {   // snap authored-floating billboards onto the nearest tower facade
  for (const f of SIGN_FIXES) {
    if (f.p === pl.p && Math.abs(f.ot[0] - pl.t[0]) < 0.6 &&
        Math.abs(f.ot[1] - pl.t[1]) < 0.6 && Math.abs(f.ot[2] - pl.t[2]) < 0.6) {
      fixCount++;
      return { p: pl.p, t: f.t.slice(), r: f.r.slice(), s: pl.s };
    }
  }
  return pl;
};
for (const pl of SCENE.placements) {
  const k = pl.p + '|' + pl.t.map(v => v.toFixed(2)).join(',');
  const prev = dupSeen.get(k);
  if (prev) {
    if (prev.r === pl.r.join(',') && prev.s === pl.s.join(',')) continue;   // exact dup — drop
    placements.push(fixSign({ p: pl.p, t: [pl.t[0], pl.t[1] + 0.03, pl.t[2]], r: pl.r, s: pl.s }));
  } else {
    dupSeen.set(k, { r: pl.r.join(','), s: pl.s.join(',') });
    placements.push(fixSign(pl));
  }
}
const byPrefab = new Map();
for (const pl of placements) {
  if (!byPrefab.has(pl.p)) byPrefab.set(pl.p, []);
  byPrefab.get(pl.p).push(pl);
}
const _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3();
const _m = new THREE.Matrix4();
let skipped = 0, drawMeshes = 0;
const cloudPlacements = [];
const towerAnchors = [];   // skyscraper tops — web-swing aim-assist anchors
for (const [prefabName, list] of byPrefab) {
  const baked = bakePrefab(prefabName);
  if (!baked) {                                // pure-FX prefab (smoke/dust/clouds/air lanes)
    skipped += list.length;
    if (prefabName.startsWith('CP_Cloud')) cloudPlacements.push(...list);
    continue;
  }
  const isTower = prefabName.startsWith('CP_Skyscraper') || prefabName.startsWith('CP_Combined_Building');
  // split negative-scale instances (mirrored copies) — need DoubleSide material
  const neg = list.filter(pl => pl.s[0] * pl.s[1] * pl.s[2] < 0);
  const pos = list.filter(pl => pl.s[0] * pl.s[1] * pl.s[2] >= 0);
  for (const { geo, mat } of baked.merged) {
    if (isTower) {
      // NOTE: several CP_Skyscraper_* FBXs have 200–400 m internal vertex offsets —
      // the anchor must use the RENDERED center (box center × instance matrix)
      geo.computeBoundingBox();
      const bc = geo.boundingBox.getCenter(new THREE.Vector3());
      const topY = geo.boundingBox.max.y;
      for (const pl of list) {
        _m.compose(convPos(pl.t), convQuat(pl.r), _s.set(pl.s[0], pl.s[1], pl.s[2]));
        const c = bc.clone().applyMatrix4(_m);
        towerAnchors.push(new THREE.Vector3(c.x, pl.t[1] + topY * pl.s[1], c.z));
      }
    }
    for (const [group, flip] of [[pos, false], [neg, true]]) {
      if (!group.length) continue;
      const material = flip ? Object.assign(mat.clone(), { side: THREE.DoubleSide }) : mat;
      const im = new THREE.InstancedMesh(geo, material, group.length);
      im.userData.prefab = prefabName;
      group.forEach((pl, i) => {
        _m.compose(convPos(pl.t), convQuat(pl.r), _s.set(pl.s[0], pl.s[1], pl.s[2]));
        im.setMatrixAt(i, _m);
      });
      im.instanceMatrix.needsUpdate = true;
      im.computeBoundingSphere();
      if (mat.transparent) im.renderOrder = 2;
      world.add(im);
      drawMeshes++;
    }
  }
}
console.log(`city built: ${drawMeshes} instanced meshes from ${placements.length}/${SCENE.placements.length} placements ` +
            `(${SCENE.placements.length - placements.length} duplicates dropped, ${skipped} FX-only skipped, ` +
            `${fixCount}/${SIGN_FIXES.length} sign fixes applied)`);

// ---------- city ground plane: REMOVED (see bundle/main.js) ----------

// ---------- scene-native meshes (neon strips: builtin Cube/Plane/Cylinder) ----------
for (const e of SCENE.meshes || []) {
  let geo = null;
  if (e.builtin === 'Cube') geo = new THREE.BoxGeometry(1, 1, 1);
  else if (e.builtin === 'Plane') geo = new THREE.PlaneGeometry(10, 10).rotateX(-Math.PI / 2);
  else if (e.builtin === 'Cylinder') geo = new THREE.CylinderGeometry(0.5, 0.5, 2, 24);
  else continue;
  const mat = matFor(e.mats?.[0]);
  const mesh = new THREE.Mesh(geo, mat);
  _m.compose(convPos(e.t), convQuat(e.r), _s.set(e.s[0], e.s[1], e.s[2]));
  mesh.applyMatrix4(_m);
  world.add(mesh);
}

// ---------- sky clouds (particle billboards -> camera-facing, low opacity) ----------
// plain textured planes at 450–960 m read as floating concrete slabs from the
// air; billboards with soft blending stay wispy from every angle
for (const pl of cloudPlacements) {
  const texFile = pl.p + '.png';
  const mat = new THREE.MeshBasicMaterial({
    map: texture(texFile), transparent: true, depthWrite: false,
    opacity: 0.45, side: THREE.DoubleSide, fog: true, color: 0x9aa0a8,
  });
  const sc = Math.min(pl.s[0], 20);
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(30 * sc / pl.s[0], 15 * sc / pl.s[0]), mat);
  _m.compose(convPos(pl.t), convQuat(pl.r), _s.set(pl.s[0], pl.s[1], pl.s[2]));
  mesh.applyMatrix4(_m);
  mesh.renderOrder = 1;
  world.add(mesh);
  cloudMeshes.push(mesh);
}

// ---------- street-level paving over authored voids: REMOVED by user decision ----------
// The paving grid (29.6k sidewalk quads at y=-0.02) z-fought with 128 authored
// road/sidewalk pieces sharing those cells (8 cm apart) and read as a giant
// forcibly-added dark lot. Falls into genuine holes are handled by the
// lastSafe rescue instead.

// ---------- landmarks (computed from placement data) ----------
function centroid(pred) {
  const ps = SCENE.placements.filter(pl => pred(pl.p));
  if (!ps.length) return null;
  const c = new THREE.Vector3();
  for (const pl of ps) c.add(convPos(pl.t));
  return c.multiplyScalar(1 / ps.length);
}
const bounds = new THREE.Box3();
for (const pl of SCENE.placements) bounds.expandByPoint(convPos(pl.t));
const center = bounds.getCenter(new THREE.Vector3());

// invisible physics floor over authored voids; the visual slab sits 1 cm under
const SAFETY_FLOOR_Y = -1.24;
// Deliberate openings in the safety slab (metro trench + stairwell). Keep the
// definition shared by rendering and physics so a visible opening is also a
// real opening, while the rest of the concrete slab remains solid.
const SAFETY_FLOOR_HOLES = [
  { x0: -20, z0: 20, x1: 20, z1: 92 },
  { x0: 112, z0: 88, x1: 132, z1: 108 },
];
const overSafetyFloorHole = (x, z) => SAFETY_FLOOR_HOLES.some(
  h => x > h.x0 && x < h.x1 && z > h.z0 && z < h.z1);
const insideSafetyFloor = (x, z) =>
  !overSafetyFloorHole(x, z) &&
  x > bounds.min.x - 20 && x < bounds.max.x + 20 &&
  z > bounds.min.z - 20 && z < bounds.max.z + 20;

// the pack's scene-native photo-carpet planes ("city from above" mattes) —
// giant flat plain Meshes rendered above the slab. groundAt stands the player
// on them; gen_belt.py keeps props off them.
const matteRects = [];
{
  const _bb = new THREE.Box3();
  for (const c of world.children) {
    if (c.isInstancedMesh || !c.isMesh || !c.geometry) continue;
    if (!c.geometry.boundingBox) c.geometry.computeBoundingBox();
    _bb.copy(c.geometry.boundingBox).applyMatrix4(c.matrix);   // world group is at origin
    if (_bb.max.x - _bb.min.x < 100 || _bb.max.z - _bb.min.z < 100) continue;
    if (_bb.max.y <= SAFETY_FLOOR_Y) continue;           // below the slab: irrelevant
    if (_bb.max.y > 5) continue;             // high sheet (pre-billboard cloud), not ground
    if (_bb.max.y - _bb.min.y > 4) continue;             // not a flat carpet
    matteRects.push({ x0: _bb.min.x, z0: _bb.min.z, x1: _bb.max.x, z1: _bb.max.z,
                      y: _bb.max.y + 0.02 });
  }
  if (matteRects.length) console.log(`photo mattes: ${matteRects.length}`);
}

// ---------- ground slab: the pack only paves the authored corridor + district
// tiles; everywhere else the demo scene has NOTHING below street level (the
// Unity demo camera never leaves the corridor). A city-wide asphalt slab turns
// those authored voids into plain empty lots — no more sky-under-your-feet —
// and gives the invisible safety floor a visible surface. Kept OUT of `world`
// so it never enters collision raycasts or city boxes.
{
  const pad = 80;
  const x0 = bounds.min.x - pad, x1 = bounds.max.x + pad;
  const z0 = bounds.min.z - pad, z1 = bounds.max.z + pad;
  const shape = new THREE.Shape([
    new THREE.Vector2(x0, z0), new THREE.Vector2(x1, z0),
    new THREE.Vector2(x1, z1), new THREE.Vector2(x0, z1),
  ]);
  // probed open-air sub-street areas (metro trench, stairwell) stay open
  for (const { x0: hx0, z0: hz0, x1: hx1, z1: hz1 } of SAFETY_FLOOR_HOLES) {
    shape.holes.push(new THREE.Path([
      new THREE.Vector2(hx0, hz0), new THREE.Vector2(hx1, hz0),
      new THREE.Vector2(hx1, hz1), new THREE.Vector2(hx0, hz1),
    ]));
  }
  // full asphalt PBR (albedo+normal+MS), identical to the streets' material,
  // so the filler ground is indistinguishable from authored pavement.
  // ShapeGeometry UVs are raw meters — tile every 9 m like the road meshes.
  const rep = 1 / 9;
  const ta = texture('CP_Asphalt_A.tga').clone();
  ta.needsUpdate = true; ta.repeat.set(rep, rep);
  const tn = texture('CP_Asphalt_N.tga', false).clone();
  tn.needsUpdate = true; tn.repeat.set(rep, rep);
  const slabMat = new THREE.MeshStandardMaterial({
    map: ta, normalMap: tn, color: 0xffffff, metalness: 0, roughness: 0.75,
    side: THREE.DoubleSide });
  // macro variation: the 9 m tile repeated over ~1 km reads as one synthetic
  // sheet from eye level. Multiply albedo by 3 octaves of world-XZ value noise
  // (170/41/9.5 m) so the expanse breaks into weathered patches and stains.
  slabMat.onBeforeCompile = sh => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vSlabW;')
      .replace('#include <worldpos_vertex>',
        '#include <worldpos_vertex>\nvSlabW = (modelMatrix * vec4(position, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vSlabW;
float slabHash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float slabNoise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(slabHash(i), slabHash(i + vec2(1.0, 0.0)), u.x),
             mix(slabHash(i + vec2(0.0, 1.0)), slabHash(i + vec2(1.0, 1.0)), u.x), u.y);
}`)
      .replace('#include <map_fragment>', `#include <map_fragment>
{
  float n1 = slabNoise(vSlabW.xz / 170.0);
  float n2 = slabNoise(vSlabW.xz / 41.0 + 7.3);
  float n3 = slabNoise(vSlabW.xz / 9.5 + 2.1);
  float shade = 0.68 + 0.47 * (0.55 * n1 + 0.33 * n2 + 0.12 * n3);
  diffuseColor.rgb *= shade;
}`);
  };
  packMetalRough('CP_Asphalt_MS.tga', t => {
    const tc = t.clone();
    tc.needsUpdate = true; tc.repeat.set(rep, rep);
    slabMat.metalnessMap = tc; slabMat.roughnessMap = tc;
    slabMat.metalness = 1; slabMat.roughness = 1;
    slabMat.needsUpdate = true;
  });
  const slab = new THREE.Mesh(new THREE.ShapeGeometry(shape).rotateX(Math.PI / 2), slabMat);
  // BELOW every authored surface: the slum districts' own grounds sit at
  // y≈-1..-0.42 — a slab at street level buried them (and all their clutter)
  slab.position.y = SAFETY_FLOOR_Y - 0.01;
  scene.add(slab);
}
// frame a district: stand back from its centroid and look at it
function frameView(c, back = 55, up = 9, lookUp = 3) {
  if (!c) return [null, null];
  const pos = c.clone().add(new THREE.Vector3(back, up, back));
  const q = new THREE.Quaternion().setFromRotationMatrix(
    new THREE.Matrix4().lookAt(pos, c.clone().setY(c.y + lookUp), new THREE.Vector3(0, 1, 0)));
  return [pos, q];
}
const metro = centroid(p => p.startsWith('CP_Metro'));
const slums = centroid(p => p.startsWith('CP_Slums'));
const towers = centroid(p => p.startsWith('CP_Skyscraper'));
const aerialPos = center.clone().setY(bounds.max.y + 260);
const aerialQuat = new THREE.Quaternion().setFromRotationMatrix(
  new THREE.Matrix4().lookAt(aerialPos, center, new THREE.Vector3(0, 0, -1)));
const LANDMARKS = [
  ['1 街道起点', convPos(SCENE.camera.t), convQuat(SCENE.camera.r)],
  ['2 地铁站', ...frameView(metro)],
  ['3 贫民窟', ...frameView(slums)],
  ['4 摩天楼', ...frameView(towers, 140, 90, 50)],
  ['5 鸟瞰全城', aerialPos, aerialQuat],
];

// ---------- character materials (Survivors pack) ----------
const CHAR_MATS = await J('./chars/data/materials.json');
const charTexCache = {};
function charTexture(file, srgb = true) {
  file = texFile(file);
  if (!charTexCache[file]) {
    const t = new THREE.TextureLoader(loadMgr).load('./chars/textures/' + encodeURIComponent(file));
    t.flipY = false;
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.LinearSRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = MAXANISO;
    charTexCache[file] = t;
  }
  return charTexCache[file];
}
// character MetallicSmoothness repack (loads from ./chars/textures/)
function charPackMetalRough(file, onReady) {
  const img = new Image();
  img.onload = () => {
    const c = Object.assign(document.createElement('canvas'), { width: img.width, height: img.height });
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(0, 0, c.width, c.height), px = d.data;
    for (let i = 0; i < px.length; i += 4) {
      const metal = px[i], smooth = px[i + 3];
      px[i + 1] = 255 - smooth; px[i + 2] = metal; px[i] = 0; px[i + 3] = 255;
    }
    ctx.putImageData(d, 0, 0);
    const t = new THREE.CanvasTexture(c);
    t.flipY = false; t.colorSpace = THREE.LinearSRGBColorSpace;
    onReady(t);
  };
  img.src = './chars/textures/' + encodeURIComponent(texFile(file));
}
function charMatFor(name) {
  const rec = CHAR_MATS[name];
  if (!rec) return new THREE.MeshStandardMaterial({ color: 0xff00ff });
  const m = new THREE.MeshStandardMaterial();
  m.color.setRGB(rec.color[0], rec.color[1], rec.color[2], THREE.SRGBColorSpace);
  if (rec.tex) m.map = charTexture(rec.tex);
  if (rec.normalTex) { m.normalMap = charTexture(rec.normalTex, false); m.normalScale.setScalar(rec.bumpScale ?? 1); }
  if (rec.metalTex) {
    m.metalness = 1; m.roughness = 1;
    charPackMetalRough(rec.metalTex, t => { m.metalnessMap = t; m.roughnessMap = t; m.needsUpdate = true; });
  } else {
    m.metalness = Math.min(rec.metallic ?? 0, 0.4);
    m.roughness = THREE.MathUtils.clamp(1 - (rec.smoothness ?? 0.3), 0.4, 1);
  }
  if (rec.aoTex) m.aoMap = charTexture(rec.aoTex, false);
  if (rec.mode === 1) { m.alphaTest = rec.cutoff ?? 0.5; m.alphaToCoverage = true; }
  else if (rec.mode >= 2) {
    m.transparent = true;
    // mode 3 = glass layers (cornea!): honor near-zero authored alpha — the old
    // 0.35 floor put a white film over the eyeballs and erased the pupils
    m.opacity = Math.max(rec.color[3], rec.mode >= 3 ? 0.04 : 0.35);
    m.depthWrite = rec.mode < 3;
  }
  return m;
}


// ---------- game layer (architecture adapted from the web-slinger reference) ----------
import { buildCityBoxes } from './cityBoxes.js?v=3';
import { Controller } from './controller.js?v=3';
import { CameraRig } from './cameraRig.js?v=3';
import { Input } from './input.js?v=3';

// ---------- floating-decal cull ----------
// Ground decals (road markings, manholes, dirt) are authored ON surfaces the
// pack never built in the void blocks — they hover as lone stickers over the
// sunken slab. Hide every FLAT decal instance with no opaque support just
// beneath it. Wall posters (tall AABBs) are untouched.
{
  const ray = new THREE.Raycaster();
  const down = new THREE.Vector3(0, -1, 0);
  const org = new THREE.Vector3();
  const _m = new THREE.Matrix4();
  const _c = new THREE.Vector3();
  const isDecalMat = m => (m.transparent && m.polygonOffset) || m.alphaTest > 0;   // mode>=2 decals + mode 1 cutouts
  const supported = (x, y, z, selfIm) => {
    ray.set(org.set(x, y + 0.3, z), down);
    ray.far = 1.9;
    for (const im of world.children) {
      if (!im.isInstancedMesh || im === selfIm || isDecalMat(im.material)) continue;
      if (ray.intersectObject(im, false).length) return true;
    }
    return false;
  };
  let culled = 0;
  for (const im of [...world.children]) {
    if (!im.isInstancedMesh || !isDecalMat(im.material)) continue;
    if (!im.geometry.boundingBox) im.geometry.computeBoundingBox();
    const bb = im.geometry.boundingBox;
    const kept = [];
    for (let i = 0; i < im.count; i++) {
      im.getMatrixAt(i, _m);
      let y0 = 1e9, y1 = -1e9, cx = 0, cz = 0;
      for (const xx of [bb.min.x, bb.max.x]) for (const yy of [bb.min.y, bb.max.y])
        for (const zz of [bb.min.z, bb.max.z]) {
          _c.set(xx, yy, zz).applyMatrix4(_m);
          y0 = Math.min(y0, _c.y); y1 = Math.max(y1, _c.y);
          cx += _c.x / 8; cz += _c.z / 8;
        }
      const flat = y1 - y0 < 0.2;                   // ground decal, not a wall poster
      if (!flat || supported(cx, (y0 + y1) / 2, cz, im)) kept.push(_m.clone());
      else culled++;
    }
    if (kept.length < im.count) {
      kept.forEach((m, i) => im.setMatrixAt(i, m));
      im.count = kept.length;
      im.instanceMatrix.needsUpdate = true;
      im.computeBoundingSphere();
    }
  }
  console.log(`floating decals culled: ${culled}`);
}

// ---------- foundation podiums (auto-generated) ----------
// The stage set stacks baked upper blocks on top of street-level facade
// modules (blocks start at ~5 m, facades only dress the street side), and
// props like monorail columns are authored against terrain that was never
// paved — from the open side those bases visibly hover. For every rendered
// instance whose perimeter hangs in the air, extrude a dark plinth from its
// base down to whatever is below (slab at worst). Added to `world` BEFORE the
// box build so podiums collide, occlude and take webs like real structure.
{
  const SKIP_RE = /Signboard|Wires|Canopy|Air_Traffic|Cloud|Overhang|Cable|Lamp|Light|Antenna|Vent|Conditioner|Pipe|Feeder|Camera|Banner|Decal|Track|Train|Rail|Tunnel|Smoke|Dust/i;
  const ray = new THREE.Raycaster();
  const down = new THREE.Vector3(0, -1, 0);
  const org = new THREE.Vector3();
  const probe = (x, y, z, far) => {   // nearest surface below (x,y,z), else null
    ray.set(org.set(x, y, z), down);
    ray.far = far;
    let best = null;
    for (const im of world.children) {
      if (!im.isInstancedMesh) continue;
      const hits = ray.intersectObject(im, false);
      if (hits.length && (best === null || hits[0].point.y > best)) best = hits[0].point.y;
    }
    return best;
  };
  const _bm = new THREE.Matrix4();
  const _bc = new THREE.Vector3();
  const pods = [];
  for (const im of [...world.children]) {
    if (!im.isInstancedMesh) continue;
    if (SKIP_RE.test(im.userData.prefab || '')) continue;
    if (!im.geometry.boundingBox) im.geometry.computeBoundingBox();
    const bb = im.geometry.boundingBox;
    for (let i = 0; i < im.count; i++) {
      im.getMatrixAt(i, _bm);
      let x0 = 1e9, z0 = 1e9, x1 = -1e9, z1 = -1e9, y0 = 1e9, y1 = -1e9;
      for (const xx of [bb.min.x, bb.max.x]) for (const yy of [bb.min.y, bb.max.y])
        for (const zz of [bb.min.z, bb.max.z]) {
          _bc.set(xx, yy, zz).applyMatrix4(_bm);
          if (_bc.x < x0) x0 = _bc.x; if (_bc.x > x1) x1 = _bc.x;
          if (_bc.z < z0) z0 = _bc.z; if (_bc.z > z1) z1 = _bc.z;
          if (_bc.y < y0) y0 = _bc.y; if (_bc.y > y1) y1 = _bc.y;
        }
      const fx = x1 - x0, fz = z1 - z0;
      if (y1 - y0 < 2.5 || y0 < 0.45) continue;          // not building-sized / grounded
      // ONLY real near-ground structure gets a plinth. The Background category
      // "miniature city block" fillers (footprints 100-150 m, bases 30-40 m up,
      // stacked over the districts as skyline filler) used to spawn monstrous
      // 100 m concrete decks — the "steel plate" plateaus — which also blocked
      // mid-air flight paths ("stuck in the air while landing").
      if (fx > 60 || fz > 60) continue;                  // background blocks / districts
      if (y0 > 24) continue;                             // high-altitude filler, not a building base
      const ins = 0.12;
      const pts = [
        [x0 + fx * ins, z0 + fz * ins], [x1 - fx * ins, z0 + fz * ins],
        [x0 + fx * ins, z1 - fz * ins], [x1 - fx * ins, z1 - fz * ins],
        [(x0 + x1) / 2, (z0 + z1) / 2],
      ];
      let anyDeep = false, allDeep = true, groundMin = Infinity;
      for (const [px, pz] of pts) {
        const g = probe(px, y0 + 0.35, pz, y0 + 3) ?? SAFETY_FLOOR_Y;   // slab as last resort
        if (y0 - g > 1.2) anyDeep = true; else allDeep = false;
        if (g < groundMin) groundMin = g;
      }
      // big blocks: any hanging edge gets a plinth (flush behind street facades);
      // small props: only if fully airborne (roof-edge clutter must not grow 30 m piers)
      if (!(anyDeep && (Math.max(fx, fz) > 8 || allDeep))) continue;
      const depth = y0 - groundMin + 0.15;
      // keep plinths for REAL structure only — shallow gaps under small clutter
      // (fences, crates) read as random gray blocks, worse than the gap itself
      if (depth < 2.2 || depth > 80) continue;
      if (!(Math.max(fx, fz) > 8 || depth > 5 || (y1 - y0) > 8)) continue;
      pods.push({ cx: (x0 + x1) / 2, cz: (z0 + z1) / 2, sx: Math.max(fx * 0.96, 0.4),
                  sz: Math.max(fz * 0.96, 0.4), top: y0 + 0.08, depth });
    }
  }
  if (pods.length) {
    // dress plinths in the pack's own concrete so they read as foundations,
    // not gray boxes (box UVs are 0..1 per face; repeat 2×2 keeps grain)
    const pt = texture('CP_Concrete_03_A.tga').clone();
    pt.needsUpdate = true;
    pt.repeat.set(2, 2);
    const pn = texture('CP_Concrete_03_N.tga', false).clone();
    pn.needsUpdate = true;
    pn.repeat.set(2, 2);
    const mat = new THREE.MeshStandardMaterial({
      map: pt, normalMap: pn, color: 0x8f959c, roughness: 0.92, metalness: 0.03 });
    const pim = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), mat, pods.length);
    pim.userData.prefab = '__podium';
    const q = new THREE.Quaternion();
    pods.forEach((p, i) => {
      _bm.compose(_bc.set(p.cx, p.top - p.depth / 2, p.cz), q,
                  new THREE.Vector3(p.sx, p.depth, p.sz));
      pim.setMatrixAt(i, _bm);
    });
    pim.instanceMatrix.needsUpdate = true;
    pim.computeBoundingSphere();
    world.add(pim);
  }
  console.log(`foundation podiums: ${pods.length}`);
}

const bw = buildCityBoxes(world);
console.log(`city boxes: ${bw.aabbs.length} (${bw.aabbs.filter(b => b.collide).length} collidable)`);

// Raycast ground on all opaque world geometry. Most of the city is instanced,
// but scene-native concrete plates and photo carpets are regular Mesh objects;
// ignoring them makes a rendered floor non-existent to the player.
const _groundRay = new THREE.Raycaster();
const _down = new THREE.Vector3(0, -1, 0);
const _gOrigin = new THREE.Vector3();
function groundRayHit(x, z, yFrom, far, capY = Infinity) {
  _groundRay.set(_gOrigin.set(x, yFrom, z), _down);
  _groundRay.far = far;
  let best = null;
  for (const mesh of world.children) {
    if (!mesh.isMesh) continue;
    // Clouds, decals and other blended planes must never become walkable just
    // because they momentarily face upward.
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    if (!mesh.isInstancedMesh && materials.some(m => m?.transparent)) continue;
    const hits = _groundRay.intersectObject(mesh, false);
    // hits come sorted by distance (straight down => by descending y): skip
    // everything ABOVE the cap (roofs/awnings over the head, not ground) and
    // take this mesh's first surface at or under it
    for (const h of hits) {
      if (h.point.y > capY) continue;
      if (!best || h.distance < best.distance) best = h;
      break;
    }
  }
  return best;
}
// the body is a 0.28 m disc, not a point: probe center + 4 offsets and stand
// on the HIGHEST surface near the feet — a single center ray drops the
// character into seams and buries the feet beside raised curbs/markings
// (street surfaces undulate 0–7 cm). Offset hits only count near the feet so
// a fall beside a roof edge can't get yanked up onto it.
// far is a fixed reach below the feet (NOT yFrom-relative: absolute-y far broke
// all ground support below y≈-11, i.e. the whole metro level).
const GROUND_PROBES = [[0.28, 0], [-0.28, 0], [0, 0.28], [0, -0.28]];
function groundAt(x, z, yFrom, feetY = yFrom - 3, prevY = feetY) {
  const far = yFrom - feetY + 11;
  // overhang filter: a surface above this ceiling is a roof/awning over the
  // head, NOT ground — the ray started above it must find the street beneath,
  // or standing under any canopy reads as "no support" and the player falls
  // through the world (the controller's landing guard then blocks every
  // re-land). Mirrors the landing rule: step-ups (<=0.55) and surfaces
  // actually crossed this frame (<=prevY+0.3) still count.
  const cap = Math.max(feetY + 0.55, prevY + 0.3);
  const center = groundRayHit(x, z, yFrom, far, cap);
  // fast paths: flat ground right under the feet (the common walking frame),
  // or ground far below (mid-air) — no need for the 4-probe disc every frame
  if (center) {
    const cy = center.point.y;
    if (Math.abs(cy - feetY) < 0.04) return cy;
    // Do not fast-return buried geometry below the visible safety slab. It
    // needs to reach the fallback below and be replaced by SAFETY_FLOOR_Y.
    if (cy < feetY - 1.5 &&
        (!insideSafetyFloor(x, z) || feetY <= SAFETY_FLOOR_Y - 3.6 ||
         cy >= SAFETY_FLOOR_Y - 0.08)) return cy;
  }
  let best = center ? center.point.y : null;
  for (const [ox, oz] of GROUND_PROBES) {
    const h = groundRayHit(x + ox, z + oz, yFrom, far, cap);
    if (h && Math.abs(h.point.y - feetY) < 1.2 && (best === null || h.point.y > best))
      best = h.point.y;
  }
  // safety floor at street level: the pack never paves block interiors (~21%
  // of in-bounds columns have NO geometry — walking off the wrong roof edge
  // fell through the world into the rescue-reset loop). Applies only inside
  // the city bounds and near/above street level — the threshold must exceed
  // one frame of terminal fall (68 m/s × 0.05 s = 3.4 m) or a fast fall can
  // cross it between frames; the metro (y≈−20) keeps its real floors and
  // off-map falls still trigger the rescue dive.
  // A ray can find metro/decor geometry far below the visible concrete. That
  // must still count as an unsupported column: otherwise `best !== null`
  // bypasses the safety floor and the player sinks through the rendered slab.
  // Only the authored slab openings are allowed to expose lower geometry.
  const needsSafetyFloor = best === null || best < SAFETY_FLOOR_Y - 0.08;
  if (needsSafetyFloor && insideSafetyFloor(x, z) &&
      feetY > SAFETY_FLOOR_Y - 3.6) {
    // the pack's giant photo-carpet planes render ABOVE the slab; stand ON
    // the picture, not 24 cm inside it (they are plain Meshes — no raycast)
    for (const r of matteRects)
      if (x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1) return r.y;
    return SAFETY_FLOOR_Y;
  }
  return best;
}

// generic geometry ray for the controller: verifies wall pushes (air walls),
// snaps web anchors onto facades, validates zip targets
const _castRC = new THREE.Raycaster();
const _instMat = new THREE.Matrix4();
const _normMat = new THREE.Matrix3();
function castRay(origin, dir, far) {
  _castRC.set(origin, dir);
  _castRC.near = 0;
  _castRC.far = far;
  let best = null;
  for (const im of world.children) {
    if (!im.isInstancedMesh) continue;
    const hits = _castRC.intersectObject(im, false);
    if (hits.length && (!best || hits[0].distance < best.distance)) best = hits[0];
  }
  if (!best) return null;
  let normal = null;
  if (best.face) {
    normal = best.face.normal.clone();
    if (best.instanceId !== undefined) {
      best.object.getMatrixAt(best.instanceId, _instMat);
      normal.applyMatrix3(_normMat.getNormalMatrix(_instMat)).normalize();
    }
  }
  return { point: best.point, normal, distance: best.distance };
}

// ---------- characters ----------
loadMsg('loading characters…');
const startPos = convPos(SCENE.camera.t);
const players = {};
for (const g of ['man', 'girl']) {
  const p = new Player(scene);
  await p.load(g, charMatFor, loadMgr);
  players[g] = p;
  p.group.position.set(startPos.x + (g === 'man' ? 2.4 : -2.4), 0, startPos.z + 5);
  p.group.rotation.y = p.yaw = Math.PI;
}

const ctrl = new Controller(bw, groundAt, castRay, {
  onLand: impact => chosen?.onLand(impact),
  onThwip: () => {},
  onReset: () => doDive(true, 'KeyR'),
});
const rig = new CameraRig(camera, bw);
const input = new Input(renderer.domElement);

let phase = 'menu';          // menu | play | pause
let chosen = null;
let selGender = null;

// ---------- menu ----------
const menuEl = $('menu'), enterBtn = $('enterBtn');
function selectGender(g) {
  selGender = g;
  document.querySelectorAll('.m-card').forEach(c => c.classList.toggle('sel', c.dataset.g === g));
  enterBtn.disabled = false;
  enterBtn.classList.add('ready');
}
document.querySelectorAll('.m-card').forEach(c =>
  c.addEventListener('click', () => selectGender(c.dataset.g)));
addEventListener('keydown', e => {
  if (phase === 'menu') {
    if (e.code === 'ArrowLeft' || e.code === 'ArrowRight')
      selectGender(selGender === 'man' ? 'girl' : 'man');
    if (e.code === 'ArrowUp') selectGender('man');
    if (e.code === 'ArrowDown') selectGender('girl');
    if (e.code === 'Enter' && selGender) startGame();
  } else if (phase === 'pause' && e.code === 'Enter') {
    renderer.domElement.requestPointerLock?.();
  }
  if (e.code === 'KeyT' && !e.repeat)
    applyPreset(PRESET_ORDER[(PRESET_ORDER.indexOf(presetName) + 1) % PRESET_ORDER.length]);
});
enterBtn.addEventListener('click', () => selGender && startGame());

function startGame() {
  // Re-entry guard — THE "restarts from the sky every few seconds" bug:
  // starting via a mouse click leaves ENTER GAME focused even after the menu
  // fades (pointer-events:none doesn't drop focus), and the browser treats
  // Space/Enter on a focused <button> as a click — so the first web-swing
  // Space (or the pause screen's own "press Enter to resume") silently
  // re-ran startGame. Guard on phase and drop the focus.
  if (phase !== 'menu') {
    console.log(`[startGame] ignored re-entry (phase=${phase}, likely focused-button activation)`);
    return;
  }
  document.activeElement?.blur?.();
  enterBtn.disabled = true;
  chosen = players[selGender];
  const other = players[selGender === 'man' ? 'girl' : 'man'];
  scene.remove(other.group);
  window.__player = chosen;
  doDive(false);
  rig.blendFrom(camera, 1.5);   // carry the aerial menu shot straight into the plunge
  menuEl.classList.add('gone');
  $('stats').classList.add('on');
  phase = 'play';   // game logic must not depend on pointer lock (headless can't lock)
  renderer.domElement.requestPointerLock?.();
}

function doDive(isReset, cause = isReset ? 'manual-R' : 'start') {
  console.log(`[dive] cause=${cause} hasSafe=${ctrl.hasSafe} ` +
              `from=(${ctrl.pos.x.toFixed(0)},${ctrl.pos.y.toFixed(0)},${ctrl.pos.z.toFixed(0)})`);
  // The main detailed street is the z≈0 band spanning x −140…+60 (probed via
  // castRay height map). Dive ALONG it facing −x so idle drift, held-W and
  // held-S all end on pavement — the old drop (z−55, drifting +z) landed on
  // background-block roofs whose baked textures read as "flattened collage".
  const p = new THREE.Vector3(startPos.x + 25, 430, startPos.z - 2);
  const v = new THREE.Vector3(-10, -6, 0.7);
  input.yaw = Math.PI / 2;      // camera faces down the street (−x)
  input.pitch = -0.12;
  ctrl.diveFrom(p, v);
  rig.initialized = false;
  if (isReset) {
    const f = $('fade');
    f.style.opacity = '0.85';
    setTimeout(() => { f.style.opacity = '0'; }, 380);
    showMsg('重新跃入城市', 1.6);
  }
}

// ---------- pause on pointer-unlock (their UX) ----------
let usedLock = false;
document.addEventListener('pointerlockchange', () => {
  usedLock = usedLock || document.pointerLockElement !== null;
  if (phase === 'menu' || !usedLock) return;
  if (document.pointerLockElement === renderer.domElement) {
    phase = 'play';
    $('pause').classList.remove('show');
  } else if (phase === 'play') {
    phase = 'pause';
    $('pause').classList.add('show');
  }
});
$('pause').addEventListener('click', () => renderer.domElement.requestPointerLock?.());

// ---------- HUD ----------
const statsEl = { speed: $('stSpeed'), height: $('stHeight'), state: $('stState') };
if (location.search.includes('nofps')) $('fps').style.display = 'none';   // production builds can hide the perf line
let msgTimer = 0;
function showMsg(text, seconds = 2.2) {
  const el = $('msg');
  el.textContent = text;
  el.style.opacity = '1';
  msgTimer = seconds;
}
const MODE_CN = { ground: '地面', air: '空中', swing: '摆荡', wallrun: '墙跑', zip: '飞掠' };

// ---------- debug hooks ----------
window.__world = world;
window.__camera = camera;
window.__ctrl = ctrl;
window.__input = input;
window.__renderer = renderer;
window.__startGame = g => { selectGender(g); startGame(); };
window.__tp = (x, y, z) => { window.__freeCam = true; window.__fcPos = new THREE.Vector3(x, y, z); };
window.__lookAt = (x, y, z) => { window.__freeCam = true; window.__fcLook = [x, y, z]; };
window.__groundAt = groundAt;
window.__castRay = (ox, oy, oz, dx, dy, dz, far) =>
  castRay(new THREE.Vector3(ox, oy, oz), new THREE.Vector3(dx, dy, dz).normalize(), far);

// ---------- post: TAA + bloom ----------
const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(
  innerWidth, innerHeight, { samples: 4, type: THREE.HalfFloatType }));
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.55, 0.5, 0.82);
composer.addPass(bloom);
composer.addPass(new OutputPass());
window.__composer = composer;
applyPreset('dusk');

// ---------- loop ----------
const camDir = new THREE.Vector3();
let frames = 0, fpsT = performance.now(), fps = 0;
let menuT = 0;
const clock = new THREE.Clock();
function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);

  if (phase === 'menu') {
    // aerial menu: slow orbit high above the dive drop point, sunset city
    // below — startGame spawns the diver right here, so the camera-rig blend
    // carries this exact shot straight into the plunge
    menuT += dt * 0.045;
    const cx = startPos.x + 25, cz = startPos.z - 2;    // == doDive drop point
    camera.position.set(cx + Math.sin(menuT) * 26, 398 + Math.sin(menuT * 0.6) * 7,
                        cz + Math.cos(menuT) * 26);
    camera.lookAt(cx - 130, 322, cz + 8);               // down the street, horizon high in frame
    for (const g in players) players[g].mixer?.update(dt);
  } else {
    rig.forward(camDir, input);
    if (phase === 'play') ctrl.update(dt, input, input.yaw, camDir);
    if (chosen) {
      chosen.update({
        dt,
        mode: ctrl.mode,
        pos: ctrl.pos,
        vel: ctrl.vel,
        anchor: ctrl.webOn ? ctrl.anchor : null,
        webOn: ctrl.webOn,
        webHand: ctrl.webHand,
        ropeSlack: ctrl.webOn
          ? Math.max(0, (ctrl.ropeLen - ctrl.pos.distanceTo(ctrl.anchor)) / Math.max(ctrl.ropeLen, 1))
          : 0,
      });
    }
    rig.update(dt, input, ctrl);
    if (window.__freeCam && window.__fcPos) {   // debug screenshots: let __tp/__lookAt own the camera
      camera.position.copy(window.__fcPos);
      if (window.__fcLook) camera.lookAt(...window.__fcLook);
    }
    // void rescue: only deep free-fall counts — the metro level sits at y≈-20…-26
    // and must stay walkable. Snap back to the last solid stand instead of a full
    // sky re-dive (unpaved gaps exist at several levels; re-diving felt like a
    // forced restart loop).
    if (phase === 'play' && (ctrl.pos.y < -80 ||
        (ctrl.pos.y < -32 && ctrl.mode === 'air' && ctrl.vel.y < -18))) {
      if (ctrl.hasSafe) {
        console.log(`[rescue] from=(${ctrl.pos.x.toFixed(0)},${ctrl.pos.y.toFixed(0)},${ctrl.pos.z.toFixed(0)}) ` +
                    `to=(${ctrl.lastSafe.x.toFixed(0)},${ctrl.lastSafe.y.toFixed(1)},${ctrl.lastSafe.z.toFixed(0)})`);
        ctrl.rescueTo(ctrl.lastSafe);
        rig.initialized = false;
        const f = $('fade');
        f.style.opacity = '0.85';
        setTimeout(() => { f.style.opacity = '0'; }, 380);
        showMsg('已拉回附近的安全点', 1.6);
      } else doDive(true, 'void-nosafe');
    }
    input.endFrame();

    statsEl.speed.textContent = Math.round(ctrl.vel.length() * 3.6);
    statsEl.height.textContent = Math.max(0, Math.round(ctrl.pos.y));
    statsEl.state.textContent = MODE_CN[ctrl.mode] || ctrl.mode;
    if (msgTimer > 0) {
      msgTimer -= dt;
      if (msgTimer <= 0) $('msg').style.opacity = '0';
    }
  }

  skyDome.position.copy(camera.position);
  for (const c of cloudMeshes) c.quaternion.copy(camera.quaternion);   // clouds = billboards
  skyUniforms.uTime.value += dt;
  composer.render();
  frames++;
  const now = performance.now();
  if (now - fpsT > 500) { fps = Math.round(frames * 1000 / (now - fpsT)); frames = 0; fpsT = now; }
  $('fps').textContent = `${fps} fps · draw ${renderer.info.render.calls} · ${BUILD}`;
  renderer.info.reset();
}

// ---------- go ----------
// warm-up: upload every loaded texture to the GPU NOW — first-visibility
// uploads during the dive were a major source of fall judder
setTimeout(() => {
  for (const cache of [texCache, charTexCache, msCache]) {
    for (const k in cache) {
      const t = cache[k];
      if (t && t.image && t.image.width) renderer.initTexture(t);
    }
  }
}, 1200);

loadMsg('choose your runner');
const loaderEl = $('loader');
// show the menu only when the loading queue is REALLY drained (was a fixed 400 ms —
// on slow links users stared at "LOADING CHARACTERS…" with no idea of progress)
let menuShown = false;
function showMenu() {
  if (menuShown) return;
  menuShown = true;
  loadMsg('choose your runner');
  loaderEl.style.opacity = '0';
  setTimeout(() => { loaderEl.style.display = 'none'; }, 600);
  menuEl.classList.add('show');
  animate();
}
window.__showMenu = showMenu;
if (loadDone) showMenu();   // the queue may have drained before showMenu existed
setTimeout(showMenu, 30000);   // fallback, never trap the user on the loader

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  composer.setSize(innerWidth, innerHeight);
});
