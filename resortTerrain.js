import * as THREE from 'three';
import { makeGrainTexture, makeDetailTexture } from './islandTerrainMaterials.js';
import { terrainHeight, shoreAt, pathDistance, smoothstep } from './resortLayout.js';
export function addCaustics(material,strength={value:.38}) {
  const time={value:0},old=material.onBeforeCompile;
  material.onBeforeCompile=sh=> {
    old?.call(material,sh);sh.uniforms.uCausticTime=time;sh.uniforms.uCausticStrength=strength;
    sh.vertexShader=sh.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vCausticPos;').replace('#include <worldpos_vertex>',`#include <worldpos_vertex>
      vec4 cp=vec4(transformed,1.0);
      #ifdef USE_INSTANCING
      cp=instanceMatrix*cp;
      #endif
      vCausticPos=(modelMatrix*cp).xyz;`);
    sh.fragmentShader=sh.fragmentShader.replace('#include <common>','#include <common>\nuniform float uCausticTime,uCausticStrength; varying vec3 vCausticPos;').replace('#include <color_fragment>',`#include <color_fragment>
      vec2 c=vCausticPos.xz;
      float net=abs(sin(c.x*2.4+sin(c.y*1.9+uCausticTime*.6))*cos(c.y*2.1+sin(c.x*1.4-uCausticTime*.45)));
      float ca=pow(1.0-net,20.0);
      float submerged=1.0-smoothstep(-.12,.05,vCausticPos.y);
      diffuseColor.rgb+=vec3(.35,.48,.38)*ca*uCausticStrength*submerged*exp(min(0.0,vCausticPos.y)*.12);`);
  };
  material.customProgramCacheKey=()=> 'resort-caustics-v1';return {update(t){time.value=t;},strength};
}
export function buildResortTerrain({scene,maxAniso=4}) {
  const grain=makeGrainTexture(maxAniso),detail=makeDetailTexture(maxAniso);
  const mat=new THREE.MeshStandardMaterial({map:grain,vertexColors:true,roughness:1});
  const caustics=addCaustics(mat),meshes=[];
  for(let ix=-192;ix<192;ix+=64)for(let iz=-256;iz<128;iz+=64){
    const step=iz < -192?4:2,g=new THREE.PlaneGeometry(64,64,64/step,64/step);g.rotateX(-Math.PI/2);g.translate(ix+32,0,iz+32);
    const pos=g.attributes.position,uv=g.attributes.uv,col=[],c=new THREE.Color();
    for(let i=0;i<pos.count;i++) {const x=pos.getX(i),z=pos.getZ(i),h=terrainHeight(x,z);pos.setY(i,h);uv.setXY(i,x/3,z/3);
      c.setHex(h<0?0xe7e1c7:0xf5edda);if(z>28&&pathDistance(x,z)>2.1)c.lerp(new THREE.Color(0x889559),smoothstep(z,28,60)*.7);
      col.push(c.r,c.g,c.b);
    }
    g.setAttribute('color',new THREE.Float32BufferAttribute(col,3));g.computeVertexNormals();const m=new THREE.Mesh(g,mat);m.receiveShadow=true;scene.add(m);meshes.push(m);
  }
  // Fine sea-bottom undulations use the shared terrain detail texture.
  const prior=mat.onBeforeCompile;
  mat.onBeforeCompile=sh=>{prior(sh);sh.uniforms.uSandDetail={value:detail};sh.fragmentShader=sh.fragmentShader.replace('#include <common>','#include <common>\nuniform sampler2D uSandDetail;').replace('#include <color_fragment>','#include <color_fragment>\ndiffuseColor.rgb*=.92+.12*texture2D(uSandDetail,vCausticPos.xz*.24).b;\nfloat attenuation=smoothstep(.1,3.0,-vCausticPos.y);diffuseColor.rgb*=mix(vec3(1.0),vec3(.26,.78,.72),attenuation);');};
  return {meshes,caustics,update:caustics.update,dispose(){meshes.forEach(m=>{scene.remove(m);m.geometry.dispose();});mat.dispose();grain.dispose();detail.dispose();}};
}
