import * as THREE from 'three';
import { BUILDINGS,localPoint,terrainHeight } from './resortLayout.js';
import { roofGeometry } from './resortGeometry.js';
export function buildResortArchitecture({scene,batch,materials}) {
  const roofBins=new Map(),roofs=[];
  const box=(b,mat,x,y,z,w,h,d,flags={})=>{const p=localPoint(b,x,z);batch.box(mat,p.x,b.y+y,p.z,w,h,d,b.yaw,flags);};
  const post=(b,x,y,z,w,h,flags={})=>{const p=localPoint(b,x,z);batch.post('pile',p.x,b.y+y,p.z,w,h,w,b.yaw,flags);};
  for(const b of BUILDINGS){
    const central=!['garden','water'].includes(b.kind),bar=b.kind==='bar',reception=b.kind==='reception';
    const pavilion=bar||reception,eaves=reception?3.65:2.8,frame=pavilion?'barFrame':'wood';
    const timber=bar?'barDeck':'wood';
    box(b,timber,0,-.13,0,b.w,.26,b.d,{floor:true,solid:true,groundOnly:true});
    if(!b.premium)box(b,timber,0,-.13,b.d/2+b.terrace/2,b.w,.26,b.terrace,{floor:true,solid:true,groundOnly:true});
    else { // Leave a real hole in the deck for the private pool.
      box(b,'wood',-1.5,-.13,b.d/2+b.terrace/2,b.w-3,.26,b.terrace,{floor:true,solid:true,groundOnly:true});
      for(const z of [b.d/2+.15,b.d/2+b.terrace-.15])box(b,'wood',b.w/2-1.5,-.13,z,3,.26,.3,{floor:true,solid:true,groundOnly:true});
      box(b,'wood',b.w/2-.1,-.13,b.d/2+b.terrace/2,.2,.26,b.terrace,{floor:true,solid:true,groundOnly:true});
    }
    // Side walls with waist-high sills and open windows; real entrance at the rear.
    if(!pavilion)for(const s of [-1,1]){
      box(b,'wood',s*b.w/2,.5,0,.16,1,b.d,{solid:true});
      box(b,'wood',s*b.w/2,2.5,0,.16,.5,b.d,{solid:true});
      for(const z of [-b.d/2,0,b.d/2])box(b,'wood',s*b.w/2,1.65,z,.18,2.6,.18,{solid:true});
      const wing=(b.w-2.2)/2;
      box(b,'wood',s*(1.1+wing/2),1.35,-b.d/2,wing,2.7,.16,{solid:true});
      box(b,'wood',s*(1.1+wing/2),.55,b.d/2,wing,1.1,.16,{solid:true});
      box(b,'wood',s*(1.1+wing/2),2.5,b.d/2,wing,.45,.16,{solid:true});
    }
    for(const z of [-b.d/2,b.d/2])box(b,frame,0,eaves-.15,z,b.w,.18,.2,{solid:true});
    if(reception)for(const x of [-b.w/2,b.w/2])box(b,frame,x,eaves-.15,0,.2,.18,b.d,{solid:true});
    // Roof frame and supports, embedded well below the visible sea bed.
    for(const x of [-b.w/2+.2,b.w/2-.2])for(const z of [-b.d/2+.2,b.d/2+.2,b.d/2+b.terrace-.2]){
      const p=localPoint(b,x,z),bottom=terrainHeight(p.x,p.z)-.5;
      post(b,x,(bottom-b.y)/2,z,.24,b.y-bottom,{solid:true});
      if(z<=b.d/2+.2){
        // Start every column at the deck, including the tapering beach below.
        const top=b.y+eaves,base=Math.min(b.y-.13,bottom);
        const p=localPoint(b,x,z);
        batch.post(pavilion?'barFrame':'pile',p.x,(base+top)/2,p.z,pavilion?.23:.17,top-base,pavilion?.23:.17,b.yaw,{solid:true});
      }
    }
    // Low terrace rails with deliberate gaps for the swimming stair.
    for(const s of [-1,1]){box(b,bar?'barFrame':'wood',s*b.w/2,.6,b.d/2+b.terrace/2,.12,.12,b.terrace,{solid:true});}
    if(b.kind==='water')box(b,'wood',.8,.6,b.d/2+b.terrace,b.w-1.6,.12,.12,{solid:true});
    else for(const s of [-1,1]){const wing=(b.w-2.2)/2;box(b,bar?'barFrame':'wood',s*(1.1+wing/2),.6,b.d/2+b.terrace,wing,.12,.12,{solid:true});}
    if(pavilion){
      // Both rail ends need supports: keep the 2.2 m entrance gap clear.
      const edge=b.d/2+b.terrace;
      for(const side of [-1,1])for(const distance of [1.1,(1.1+b.w/2)/2,b.w/2]){
        const x=side*distance,p=localPoint(b,x,edge);
        const bottom=Math.min(b.y-.26,terrainHeight(p.x,p.z)-.35),top=b.y+.78;
        batch.box('barFrame',p.x,(bottom+top)/2,p.z,.18,top-bottom,.18,b.yaw,{solid:true});
        box(b,'barShelf',x,.81,edge,.24,.06,.24);
      }
    }else for(const x of [-b.w/2,b.w/2])post(b,x,.45,b.d/2+b.terrace,.12,.9,{solid:true});
    // An open stair to the lagoon; garden buildings have a short approach stair.
    if(b.kind==='water'){
      for(let k=0;k<13;k++)box(b,'wood',-b.w/2+.8,-.23*k,b.d/2+b.terrace+.25+k*.38,1.4,.16,.4,{floor:true,solid:true,groundOnly:true});
    }else{
      for(const side of [-1,1]){
        const edge=side<0?-b.d/2:b.d/2+b.terrace;
        const ground=localPoint(b,0,edge+side*1),base=terrainHeight(ground.x,ground.z);
        const n=Math.max(1,Math.ceil((b.y-base)/.23));
        for(let k=0;k<n;k++)box(b,'wood',0,-.23*(k+1),edge+side*(.25+k*.38),2,.18,.4,{floor:true,solid:true,groundOnly:true});
      }
    }
    const key=`${b.w},${b.d}`,item={b,h:central?4:3.2,eaves};
    if(!roofBins.has(key))roofBins.set(key,[]);roofBins.get(key).push(item);
  }
  for(const [key,list] of roofBins){const [w,d]=key.split(',').map(Number);
    const g=roofGeometry(w+1.6,d+1.6,list[0].h,10),low=roofGeometry(w+1.6,d+1.6,list[0].h,1);
    for(const [geometry,near] of [[g,true],[low,false]]){
      const im=new THREE.InstancedMesh(geometry,materials.thatch,list.length),m=new THREE.Matrix4();
      list.forEach(({b,eaves},i)=>{m.makeRotationY(b.yaw);m.setPosition(b.x,b.y+eaves,b.z);im.setMatrixAt(i,m);});im.computeBoundingSphere();im.castShadow=near;im.receiveShadow=true;im.userData.near=near;im.userData.entries=list;scene.add(im);roofs.push(im);
    }
  }
  return {buildings:BUILDINGS,roofs,update(pos){for(const im of roofs){const close=im.userData.entries.some(({b})=>Math.hypot(pos.x-b.x,pos.z-b.z)<55);im.visible=im.userData.near?close:!close;}}};
}
