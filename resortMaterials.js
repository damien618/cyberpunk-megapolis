import * as THREE from 'three';
import { seededRandom } from './resortLayout.js';
import { createResortTextiles } from './resortTextiles.js';
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
  // One thatch course per tile (see roofGeometry): straw bundles running down the
  // slope, shadowed under the course above, bleached at the cut ends, then the
  // butt (v .12–.24) and loose tips over transparent gaps (v < .12).
  const thatchMap=canvasTexture((g,S)=> {
    const butt=S*.76,fringe=S*.88;
    g.fillStyle='#4a3d2c';g.fillRect(0,0,S,fringe);
    const strand=(sx,y0,y1,lean)=>{g.strokeStyle=`hsl(${34+rnd()*10},${12+rnd()*22}%,${32+rnd()*34}%)`;g.lineWidth=.8+rnd()*2.2;
      for(const o of [-S,0,S]){g.beginPath();g.moveTo(sx+o,y0);g.quadraticCurveTo(sx+o+lean*.3,(y0+y1)/2,sx+o+lean,y1);g.stroke();}};
    for(let x=0;x<S;){
      const bw=14+rnd()*30,end=butt-rnd()*S*.05;
      for(let i=0;i<bw*1.6;i++)strand(x+rnd()*bw,-8,end+rnd()*14,(rnd()-.5)*14);
      x+=bw*.75;
    }
    let grad=g.createLinearGradient(0,0,0,S*.45);
    grad.addColorStop(0,'rgba(14,9,4,.75)');grad.addColorStop(1,'rgba(14,9,4,0)');g.fillStyle=grad;g.fillRect(0,0,S,S*.45);
    // Cut ends.
    g.fillStyle='#3e3122';g.fillRect(0,butt+4,S,fringe-butt-4);
    for(let i=0;i<5000;i++){const r=1+rnd()*2.5;g.fillStyle=`hsl(${34+rnd()*10},${14+rnd()*20}%,${28+rnd()*36}%)`;g.fillRect(rnd()*S,butt+4+rnd()*(fringe-butt-8),r,r*(1+rnd()));}
    // Loose tips hanging below the butt; everything else down there stays clear.
    g.clearRect(0,fringe,S,S-fringe);
    for(let i=0;i<1400;i++)strand(rnd()*S,fringe-6,fringe+rnd()*rnd()*(S-fringe),(rnd()-.5)*10);
  },1024);
  thatchMap.wrapT=THREE.ClampToEdgeWrapping;
  thatchMap.anisotropy=maxAniso;
  const fabricMap=canvasTexture((g,S)=> {g.fillStyle='#f6f2e5';g.fillRect(0,0,S,S);g.strokeStyle='#e5dfd0';g.lineWidth=1;for(let i=0;i<S;i+=4){g.beginPath();g.moveTo(i,0);g.lineTo(i,S);g.moveTo(0,i);g.lineTo(S,i);g.stroke();}});
  const materials={wood,pile:new THREE.MeshStandardMaterial({color:0x75664c,roughness:1}),
    thatch:new THREE.MeshStandardMaterial({map:thatchMap,bumpMap:thatchMap,bumpScale:.5,alphaTest:.5,color:0xe2d6bd,roughness:1,side:THREE.DoubleSide}),
    linen:new THREE.MeshStandardMaterial({map:fabricMap,color:0xffffff,roughness:.94,side:THREE.DoubleSide}),
    blue:new THREE.MeshStandardMaterial({color:0x61bcc9,roughness:.9}),
    metal:new THREE.MeshStandardMaterial({color:0x483b2c,roughness:.7,metalness:.35}),
    lantern:new THREE.MeshStandardMaterial({color:0xffecd1,emissive:0xffb75b,emissiveIntensity:0}),
    pool:new THREE.MeshStandardMaterial({color:0x5cc6d6,roughness:.55}),
    fruit:new THREE.MeshStandardMaterial({color:0xffbe39,roughness:.65}),
    pink:new THREE.MeshStandardMaterial({color:0xec647f,roughness:.85,side:THREE.DoubleSide}),
    green:new THREE.MeshStandardMaterial({color:0x41833e,roughness:.9}),
  };
  // Reuse metric grain and normal/roughness maps with distinct timber finishes.
  for(const [name,color] of [['barDeck',0xe4ceb0],['barFrame',0x806551],['barSlats',0xbfe0d8],['barShelf',0x9c7652]]){
    const m=wood.clone();m.color.setHex(color);m.onBeforeCompile=wood.onBeforeCompile;
    m.customProgramCacheKey=()=> 'resort-metric-wood';materials[name]=m;
  }
  const paleGrain=canvasTexture((g,S)=>{
    g.fillStyle='#e7ddc7';g.fillRect(0,0,S,S);
    for(let i=0;i<1800;i++){const y=rnd()*S;g.strokeStyle=`rgba(114,93,65,${.025+rnd()*.07})`;g.lineWidth=.4+rnd();g.beginPath();g.moveTo(0,y);g.bezierCurveTo(S*.3,y+(rnd()-.5)*6,S*.7,y+(rnd()-.5)*6,S,y);g.stroke();}
    g.strokeStyle='rgba(83,65,45,.4)';g.lineWidth=2;for(let y=0;y<S;y+=128){g.beginPath();g.moveTo(0,y);g.lineTo(S,y);g.stroke();}
  });paleGrain.anisotropy=maxAniso;
  materials.barDeck.map=paleGrain;
  materials.barSlats.map=paleGrain;materials.barSlats.color.setHex(0x79bcb5);
  const stone=canvasTexture((g,S)=>{g.fillStyle='#eee6d5';g.fillRect(0,0,S,S);
    for(let i=0;i<7500;i++){const v=180+Math.floor(rnd()*65);g.fillStyle=`rgba(${v},${v-5},${v-15},.35)`;g.fillRect(rnd()*S,rnd()*S,1+rnd()*3,1+rnd()*2);}
    g.strokeStyle='rgba(140,130,112,.2)';for(let i=0;i<12;i++){g.beginPath();g.moveTo(rnd()*S,0);g.bezierCurveTo(rnd()*S,S*.3,rnd()*S,S*.7,rnd()*S,S);g.stroke();}
  });stone.anisotropy=maxAniso;
  materials.barStone=new THREE.MeshStandardMaterial({map:stone,bumpMap:stone,bumpScale:.025,color:0xfff7e6,roughness:.45});
  materials.brass=new THREE.MeshStandardMaterial({color:0xc4a164,metalness:.72,roughness:.32});
  materials.bottle=new THREE.MeshStandardMaterial({color:0x267d70,metalness:.15,roughness:.22});
  materials.ceramic=new THREE.MeshStandardMaterial({color:0xfaf6e9,roughness:.28});
  Object.assign(materials,createResortTextiles(maxAniso));
  return materials;
}
