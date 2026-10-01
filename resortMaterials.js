import * as THREE from 'three';
import { seededRandom } from './resortLayout.js';
function canvasTexture(draw, size=512) {
  const c=Object.assign(document.createElement('canvas'),{width:size,height:size});
  draw(c.getContext('2d'),size);
  const t=new THREE.CanvasTexture(c); t.wrapS=t.wrapT=THREE.RepeatWrapping;
  t.colorSpace=THREE.SRGBColorSpace; return t;
}
export function createResortMaterials(maxAniso=4) {
  const loader=new THREE.TextureLoader(),rnd=seededRandom(5417);
  const texture=(name,srgb=false)=> {const t=loader.load(`./textures/nature/${name}.jpg`);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.anisotropy=maxAniso;if(srgb)t.colorSpace=THREE.SRGBColorSpace;return t;};
  const wood=new THREE.MeshStandardMaterial({map:texture('wood_diff',true),normalMap:texture('wood_n'),roughnessMap:texture('wood_r'),color:0xc6aa82,roughness:0.94,normalScale:new THREE.Vector2(0.45,0.45),side:THREE.DoubleSide});
  wood.onBeforeCompile=sh=>{
    // Derive metric UVs after the instance transform so boards never stretch.
    sh.vertexShader=sh.vertexShader.replace('#include <uv_vertex>',`#include <uv_vertex>
      vec4 woodPoint=vec4(position,1.0);
      #ifdef USE_INSTANCING
      woodPoint=instanceMatrix*woodPoint;
      #endif
      vec3 wp=woodPoint.xyz;
      vec2 woodUV=abs(normal.y)>.5?wp.xz*.45:vec2(wp.x+wp.z,wp.y)*.45;
      vMapUv=woodUV;vNormalMapUv=woodUV;vRoughnessMapUv=woodUV;`);
  };
  const thatchMap=canvasTexture((g,S)=> {
    g.fillStyle='#857052';g.fillRect(0,0,S,S);
    for(let i=0;i<3200;i++){const x=rnd()*S,y=rnd()*S;g.strokeStyle=`hsl(36,${18+rnd()*18}%,${25+rnd()*40}%)`;g.lineWidth=0.6+rnd()*2;g.beginPath();g.moveTo(x,y);g.lineTo(x+(rnd()-.5)*12,y+12+rnd()*75);g.stroke();}
  });
  const fabricMap=canvasTexture((g,S)=> {g.fillStyle='#f6f2e5';g.fillRect(0,0,S,S);g.strokeStyle='#e5dfd0';g.lineWidth=1;for(let i=0;i<S;i+=4){g.beginPath();g.moveTo(i,0);g.lineTo(i,S);g.moveTo(0,i);g.lineTo(S,i);g.stroke();}});
  const materials={wood,pile:new THREE.MeshStandardMaterial({color:0x75664c,roughness:1}),
    thatch:new THREE.MeshStandardMaterial({map:thatchMap,color:0xcbb68e,roughness:1,side:THREE.DoubleSide}),
    linen:new THREE.MeshStandardMaterial({map:fabricMap,color:0xffffff,roughness:.94,side:THREE.DoubleSide}),
    blue:new THREE.MeshStandardMaterial({color:0x61bcc9,roughness:.9}),
    metal:new THREE.MeshStandardMaterial({color:0x483b2c,roughness:.7,metalness:.35}),
    lantern:new THREE.MeshStandardMaterial({color:0xffecd1,emissive:0xffb75b,emissiveIntensity:0}),
    pool:new THREE.MeshStandardMaterial({color:0x7fcacb,roughness:.8}),
    fruit:new THREE.MeshStandardMaterial({color:0xffbe39,roughness:.65}),
    pink:new THREE.MeshStandardMaterial({color:0xec647f,roughness:.85,side:THREE.DoubleSide}),
    green:new THREE.MeshStandardMaterial({color:0x41833e,roughness:.9}),
  };
  return materials;
}
