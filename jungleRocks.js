// Rounded, weathered stone. Shared geometry and a packed, tileable detail
// texture keep all boulders instanced; nothing here runs per frame.
import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { FALLS, POOL } from './jungleLayout.js';

export function makeRockGeo(salt) {
  const source = new THREE.IcosahedronGeometry(0.5, 5);
  // UV seams must not split normals. Texturing is projected in world space.
  source.deleteAttribute('uv');
  source.deleteAttribute('normal');
  const g = mergeVertices(source);
  source.dispose();
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i) * 2, y = p.getY(i) * 2, z = p.getZ(i) * 2;
    // Coherent erosion at two scales, rather than independent vertex jitter.
    // Radius stays within the existing conservative 0.64 collision bound.
    const broad = Math.sin(x * 3.2 + salt) * Math.cos(z * 3.7 - salt * 0.3)
      * Math.cos(y * 2.6 + 0.7);
    const chips = Math.sin(x * 8.1 + y * 3.2 + salt)
      * Math.sin(z * 7.3 - y * 4.1 + salt * 0.4);
    const r = 0.5 * (1 + 0.16 * broad + 0.045 * chips);
    p.setXYZ(i, x * r, y * r * 0.8, z * r);
  }
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

export function makeRockDetail(maxAniso) {
  const S = 512, data = new Uint8Array(S * S * 4);
  const hash = (x, y) => {
    const h = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
    return h - Math.floor(h);
  };
  const noise = (x, y, n) => {
    x *= n; y *= n;
    const ix = Math.floor(x), iy = Math.floor(y);
    const fx = x - ix, fy = y - iy;
    const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
    const h = (a, b) => hash((a + n) % n, (b + n) % n);
    return THREE.MathUtils.lerp(THREE.MathUtils.lerp(h(ix, iy), h(ix + 1, iy), u),
      THREE.MathUtils.lerp(h(ix, iy + 1), h(ix + 1, iy + 1), u), v);
  };
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const u = x / S, v = y / S, i = (y * S + x) * 4;
    const macro = noise(u, v, 8), medium = noise(u, v, 32);
    const grain = noise(u, v, 128), fine = noise(u, v, 256);
    const seam = 1 - THREE.MathUtils.smoothstep(Math.abs(medium - 0.5), 0.015, 0.055);
    data[i] = 255 * (0.28 + 0.36 * macro + 0.18 * medium + 0.18 * grain - 0.12 * seam);
    data[i + 1] = 255 * macro;
    data[i + 2] = 255 * (0.45 * medium + 0.35 * grain + 0.2 * fine - 0.15 * seam);
    data[i + 3] = 255;
  }
  const t = new THREE.DataTexture(data, S, S);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = maxAniso;
  t.needsUpdate = true;
  return t;
}

export function makeRockMaterial(color, detail) {
  const mat = new THREE.MeshStandardMaterial({
    color, roughness: 0.9, metalness: 0, bumpMap: detail, bumpScale: 0.075,
  });
  mat.name = 'jungle_weathered_stone';
  mat.onBeforeCompile = sh => {
    sh.uniforms.uRockDetail = { value: detail };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
        varying vec3 vStonePos, vStoneNormal;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vec4 stonePos = vec4(position, 1.0);
        #ifdef USE_INSTANCING
          stonePos = instanceMatrix * stonePos;
        #endif
        vStonePos = (modelMatrix * stonePos).xyz;
        vStoneNormal = inverseTransformDirection(transformedNormal, viewMatrix);`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform sampler2D uRockDetail;
        varying vec3 vStonePos, vStoneNormal;
        vec3 stoneDetail(vec3 p, vec3 w) {
          return texture2D(uRockDetail, p.yz * 0.24).rgb * w.x
            + texture2D(uRockDetail, p.xz * 0.24).rgb * w.y
            + texture2D(uRockDetail, p.xy * 0.24).rgb * w.z;
        }`)
      .replace('#include <map_fragment>', `#include <map_fragment>
        vec3 stoneN = normalize(vStoneNormal);
        vec3 stoneW = pow(abs(stoneN), vec3(4.0));
        stoneW /= max(dot(stoneW, vec3(1.0)), 0.0001);
        vec3 stoneTex = stoneDetail(vStonePos, stoneW);
        float spray = (1.0 - smoothstep(4.0, 15.0,
          distance(vStonePos.xz, vec2(${FALLS.x.toFixed(2)}, ${POOL.z.toFixed(2)}))))
          * (1.0 - smoothstep(${(POOL.waterY + 2).toFixed(2)}, ${(FALLS.topY + 1).toFixed(2)}, vStonePos.y));
        float moss = smoothstep(0.15, 0.7, stoneN.y)
          * smoothstep(0.4, 0.72, stoneTex.g) * spray * 0.65;
        diffuseColor.rgb *= 0.65 + stoneTex.r * 0.85;
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.09, 0.14, 0.045), moss);
        diffuseColor.rgb *= 1.0 - spray * 0.24;`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = clamp(0.82 + stoneTex.r * 0.18 - spray * 0.3 + moss * 0.2, 0.45, 1.0);`)
      .replace('#include <normal_fragment_maps>', `
        float stoneHeight = stoneTex.b;
        vec2 stoneSlope = vec2(
          stoneDetail(vStonePos + dFdx(vStonePos), stoneW).b - stoneHeight,
          stoneDetail(vStonePos + dFdy(vStonePos), stoneW).b - stoneHeight) * bumpScale;
        normal = perturbNormalArb(-vViewPosition, normal, stoneSlope, faceDirection);`);
  };
  mat.customProgramCacheKey = () => 'jungle-weathered-stone-v1';
  return mat;
}
