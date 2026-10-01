import * as THREE from 'three';
import { createJungleOcean } from './jungleOcean.js';
import * as layout from './resortLayout.js';
export const RESORT_OCEAN_PRESET={waveScale:.18,rippleAmp:.32,colors:{shallow:0x35dfd4,mid:0x00b1cc,deep:0x0863ac},midDepth:4,deepDepth:15,alphaShallow:.45,alphaDeep:.92,alphaRampDepth:8,reflection:.24,roughness:.27,foamBreak:-2,shoreFoam:.3,swash:{period:8,reachMin:.15,reachMax:.5,base:-.1}};
export function createResortLagoon({scene,maxAniso,skyUniforms}) {
  const normal=new THREE.TextureLoader().load('./textures/la/water_normal.jpg');normal.wrapS=normal.wrapT=THREE.RepeatWrapping;
  const ocean=createJungleOcean({scene,waterNormal:normal,maxAniso,skyUniforms,layout,preset:RESORT_OCEAN_PRESET,
    bounds:{sea:{width:2200,depth:1700,sx:200,sz:160,z:-800},foam:{x0:-192,x1:192,z0:-8,z1:12,sx:192,sz:20}}});
  const original=ocean.sea.material.onBeforeCompile;
  const lagoonLight={value:1},waterDim={value:1};
  // Clip the surface against the actual shoreline, not a rectangular land overlap.
  ocean.sea.material.onBeforeCompile=sh=> {original(sh);sh.uniforms.uLagoonLight=lagoonLight;sh.uniforms.uWaterDim=waterDim;sh.fragmentShader=sh.fragmentShader.replace('#include <common>','#include <common>\nuniform float uLagoonLight,uWaterDim;').replace('float seaDepth = vDepth;','float seaDepth = vDepth;\nif (vWorldPos.z > 2.0 + 5.0*cos(vWorldPos.x*.012)+1.1*sin(vWorldPos.x*.036)+.1) discard;').replace('#include <opaque_fragment>', 'outgoingLight=mix(outgoingLight,seaCol*.85*uLagoonLight,.65)*uWaterDim;\n#include <opaque_fragment>');};
  ocean.setLagoonLight=(k,dim=1)=>{lagoonLight.value=k;waterDim.value=dim;};
  return ocean;
}
