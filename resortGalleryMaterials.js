import * as THREE from 'three';
import { seededRandom } from './resortLayout.js';

// Materials of the Matisse atelier. A Provençal room: waxed hexagonal terracotta
// tomettes on the floor, limewashed walls, and furniture that reads against both
// (ebonised oak, bottle-green leather, gilt frames).
//
// Every texture is mapped in world metres in the vertex shader, so the unit
// boxes of the batch and the baked gallery meshes never stretch their pattern.
function worldUV(material,{scale,floor=false,key}){
  material.onBeforeCompile=sh=>{
    sh.vertexShader=sh.vertexShader.replace('#include <uv_vertex>',`#include <uv_vertex>
      vec4 galleryPoint=vec4(position,1.0);
      #ifdef USE_INSTANCING
      galleryPoint=instanceMatrix*galleryPoint;
      #endif
      vec4 galleryWorld=modelMatrix*galleryPoint;
      vec3 gp=galleryWorld.xyz;
      vec2 galleryUV=${floor?'gp.xz':'(abs(normal.y)>.5?gp.xz:vec2(gp.x+gp.z,gp.y))'}*vec2(${scale[0].toFixed(5)},${scale[1].toFixed(5)});
      #ifdef USE_MAP
      vMapUv=galleryUV;
      #endif
      #ifdef USE_BUMPMAP
      vBumpMapUv=galleryUV;
      #endif
      #ifdef USE_ROUGHNESSMAP
      vRoughnessMapUv=galleryUV;
      #endif`);
  };
  material.customProgramCacheKey=()=>`resort-gallery-uv:${key}`;
  return material;
}
function canvasTexture(c,maxAniso,srgb){
  const t=new THREE.CanvasTexture(c);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.anisotropy=maxAniso;
  if(srgb)t.colorSpace=THREE.SRGBColorSpace;return t;
}
const canvas=(w,h)=>Object.assign(document.createElement('canvas'),{width:w,height:h});

// Flat-topped hexagons, 8 columns x 4 rows per seamless tile (32 distinct tomettes).
function tomettes(maxAniso){
  const rnd=seededRandom(9137),COLS=8,ROWS=4,R=1;          // lattice in units of the hex radius
  const W=COLS*1.5*R,H=ROWS*Math.sqrt(3)*R,tiles=[];
  for(let i=0;i<COLS;i++)for(let j=0;j<ROWS;j++){
    const burnt=rnd()<.08,pale=!burnt&&rnd()<.14;
    tiles.push({x:i*1.5*R,y:(j+(i%2?.5:0))*Math.sqrt(3)*R,
      hue:14+rnd()*8,sat:46+rnd()*12,light:burnt?35+rnd()*4:pale?49+rnd()*4:41+rnd()*6,
      rough:.42+rnd()*.22,seed:Math.floor(rnd()*1e6)});
  }
  function draw(px,mode){
    const s=px/W,c=canvas(px,Math.round(H*s)),g=c.getContext('2d');
    g.fillStyle=mode==='color'?'#6e5a48':mode==='rough'?'#f0f0f0':'#1c1c1c';g.fillRect(0,0,c.width,c.height);
    const hex=(cx,cy,r)=>{g.beginPath();for(let k=0;k<6;k++){const a=k*Math.PI/3;g.lineTo(cx+Math.cos(a)*r,cy+Math.sin(a)*r);}g.closePath();};
    for(const t of tiles)for(const dx of [-W,0,W])for(const dy of [-H,0,H]){
      const cx=(t.x+dx)*s,cy=(t.y+dy)*s,r=R*s*.93;
      if(cx<-2*r||cy<-2*r||cx>c.width+2*r||cy>c.height+2*r)continue;
      const local=seededRandom(t.seed);
      g.save();hex(cx,cy,r);g.clip();
      if(mode==='color'){
        g.fillStyle=`hsl(${t.hue},${t.sat}%,${t.light}%)`;g.fillRect(cx-r,cy-r,2*r,2*r);
        // Firing clouds: soft lighter/darker patches inside each tile.
        for(let k=0;k<7;k++){
          const bx=cx+(local()-.5)*1.6*r,by=cy+(local()-.5)*1.6*r,br=r*(.3+local()*.6),dl=(local()-.5)*10;
          const grad=g.createRadialGradient(bx,by,0,bx,by,br);
          grad.addColorStop(0,`hsla(${t.hue+(local()-.5)*6},${t.sat}%,${t.light+dl}%,.55)`);
          grad.addColorStop(1,`hsla(${t.hue},${t.sat}%,${t.light+dl}%,0)`);
          g.fillStyle=grad;g.fillRect(cx-r,cy-r,2*r,2*r);
        }
        // Grit, pits and wax wear.
        for(let k=0;k<260;k++){const v=local();g.fillStyle=v<.5?`rgba(40,16,8,${.10+local()*.18})`:`rgba(255,215,170,${.06+local()*.12})`;
          const d=.6+local()*1.8*s/80;g.fillRect(cx+(local()-.5)*2*r,cy+(local()-.5)*2*r,d,d);}
        const sheen=g.createLinearGradient(cx-r,cy-r,cx+r,cy+r);
        sheen.addColorStop(0,'rgba(255,230,200,.10)');sheen.addColorStop(.5,'rgba(255,230,200,0)');sheen.addColorStop(1,'rgba(30,10,0,.10)');
        g.fillStyle=sheen;g.fillRect(cx-r,cy-r,2*r,2*r);
        // Worn, darker arrises.
        hex(cx,cy,r);g.lineWidth=r*.12;g.strokeStyle='rgba(55,22,10,.28)';g.stroke();
      }else if(mode==='rough'){
        const v=Math.round(t.rough*255);g.fillStyle=`rgb(${v},${v},${v})`;g.fillRect(cx-r,cy-r,2*r,2*r);
        for(let k=0;k<5;k++){const bx=cx+(local()-.5)*1.4*r,by=cy+(local()-.5)*1.4*r,br=r*(.3+local()*.5);
          const grad=g.createRadialGradient(bx,by,0,bx,by,br),w=local()<.5?0:255;
          grad.addColorStop(0,`rgba(${w},${w},${w},.14)`);grad.addColorStop(1,`rgba(${w},${w},${w},0)`);g.fillStyle=grad;g.fillRect(cx-r,cy-r,2*r,2*r);}
        hex(cx,cy,r);g.lineWidth=r*.14;g.strokeStyle='rgba(230,230,230,.6)';g.stroke();
      }else{
        // Height: domed face with a soft bevel down into the grout joint.
        const grad=g.createRadialGradient(cx,cy,0,cx,cy,r);
        grad.addColorStop(0,'#e6e6e6');grad.addColorStop(.82,'#d2d2d2');grad.addColorStop(1,'#8a8a8a');
        g.fillStyle=grad;g.fillRect(cx-r,cy-r,2*r,2*r);
        for(let k=0;k<90;k++){g.fillStyle=`rgba(0,0,0,${.15+local()*.25})`;const d=1+local()*2;g.fillRect(cx+(local()-.5)*2*r,cy+(local()-.5)*2*r,d,d);}
      }
      g.restore();
    }
    return c;
  }
  const map=canvasTexture(draw(2048,'color'),maxAniso,true);
  const roughnessMap=canvasTexture(draw(1024,'rough'),maxAniso,false);
  const bumpMap=canvasTexture(draw(1024,'bump'),maxAniso,false);
  const radius=.085;   // 17 cm tomettes, Salernes size
  const material=new THREE.MeshStandardMaterial({map,roughnessMap,bumpMap,bumpScale:1.4,roughness:1,color:0xffffff,metalness:0});
  return worldUV(material,{scale:[1/(W*radius),1/(H*radius)],floor:true,key:'tomettes'});
}

// Limewash: broad, soft clouds of slightly warmer and cooler white, plus trowel grain.
function limewash(maxAniso){
  const rnd=seededRandom(4471),S=512,c=canvas(S,S),g=c.getContext('2d');
  g.fillStyle='#f1e8d6';g.fillRect(0,0,S,S);
  for(let k=0;k<160;k++){
    const x=rnd()*S,y=rnd()*S,r=20+rnd()*90,warm=rnd()<.5;
    for(const dx of [-S,0,S])for(const dy of [-S,0,S]){
      const grad=g.createRadialGradient(x+dx,y+dy,0,x+dx,y+dy,r);
      grad.addColorStop(0,warm?'rgba(214,190,150,.07)':'rgba(255,253,246,.16)');grad.addColorStop(1,'rgba(255,255,255,0)');
      g.fillStyle=grad;g.fillRect(x+dx-r,y+dy-r,2*r,2*r);
    }
  }
  for(let k=0;k<9000;k++){const v=rnd()<.5;g.fillStyle=v?`rgba(120,100,70,${.03+rnd()*.05})`:`rgba(255,255,255,${.05+rnd()*.08})`;g.fillRect(rnd()*S,rnd()*S,1+rnd()*2,1);}
  const map=canvasTexture(c,maxAniso,true);
  const material=new THREE.MeshStandardMaterial({map,bumpMap:map,bumpScale:.6,color:0xffffff,roughness:.97});
  return worldUV(material,{scale:[.45,.45],key:'limewash'});
}

// Leather: fine pebbled grain, mapped at ~25 cm per tile.
function leather(maxAniso){
  const rnd=seededRandom(7703),S=256,c=canvas(S,S),g=c.getContext('2d');
  g.fillStyle='#808080';g.fillRect(0,0,S,S);
  for(let k=0;k<2600;k++){const x=rnd()*S,y=rnd()*S,r=1+rnd()*2.6,v=rnd()<.5?60:200;
    for(const dx of [-S,0,S])for(const dy of [-S,0,S]){g.fillStyle=`rgba(${v},${v},${v},.35)`;g.beginPath();g.arc(x+dx,y+dy,r,0,Math.PI*2);g.fill();}}
  const grain=canvasTexture(c,maxAniso,false);
  const material=new THREE.MeshStandardMaterial({color:0x3b6e52,bumpMap:grain,bumpScale:.8,roughnessMap:grain,roughness:.62,metalness:0});
  return worldUV(material,{scale:[4,4],key:'leather'});
}

export function createGalleryMaterials(maxAniso,wood){
  const ebony=wood.clone();ebony.color.setHex(0x7a5840);ebony.roughness=.5;
  ebony.onBeforeCompile=wood.onBeforeCompile;ebony.customProgramCacheKey=()=>'resort-metric-wood';
  return {
    galleryFloor:tomettes(maxAniso),
    galleryPlaster:limewash(maxAniso),
    galleryEbony:ebony,
    galleryLeather:leather(maxAniso),
    galleryGilt:new THREE.MeshStandardMaterial({color:0xe0b866,metalness:.55,roughness:.32,emissive:0x4a3410,emissiveIntensity:.5}),
    galleryWire:new THREE.MeshStandardMaterial({color:0x9a8f80,metalness:.6,roughness:.4}),
  };
}
