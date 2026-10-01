import * as THREE from 'three';
import { BUILDINGS,localPoint,terrainHeight } from './resortLayout.js';
import { roofGeometry } from './resortGeometry.js';
export function buildResortArchitecture({scene,batch,materials}) {
  const roofBins=new Map(),roofs=[];
  const box=(b,mat,x,y,z,w,h,d,flags={})=>{const p=localPoint(b,x,z);batch.box(mat,p.x,b.y+y,p.z,w,h,d,b.yaw,flags);};
  const post=(b,x,y,z,w,h,flags={})=>{const p=localPoint(b,x,z);batch.post('pile',p.x,b.y+y,p.z,w,h,w,b.yaw,flags);};
  for(const b of BUILDINGS){
    const central=!['garden','water'].includes(b.kind);
    box(b,'wood',0,-.13,0,b.w,.26,b.d,{floor:true,solid:true,groundOnly:true});
    if(!b.premium)box(b,'wood',0,-.13,b.d/2+b.terrace/2,b.w,.26,b.terrace,{floor:true,solid:true,groundOnly:true});
    else { // Leave a real hole in the deck for the private pool.
      box(b,'wood',-1.5,-.13,b.d/2+b.terrace/2,b.w-3,.26,b.terrace,{floor:true,solid:true,groundOnly:true});
      for(const z of [b.d/2+.15,b.d/2+b.terrace-.15])box(b,'wood',b.w/2-1.5,-.13,z,3,.26,.3,{floor:true,solid:true,groundOnly:true});
      box(b,'wood',b.w/2-.1,-.13,b.d/2+b.terrace/2,.2,.26,b.terrace,{floor:true,solid:true,groundOnly:true});
    }
    // Side walls with waist-high sills and open windows; real entrance at the rear.
    for(const s of [-1,1]){
      box(b,'wood',s*b.w/2,.5,0,.16,1,b.d,{solid:true});
      box(b,'wood',s*b.w/2,2.5,0,.16,.5,b.d,{solid:true});
      for(const z of [-b.d/2,0,b.d/2])box(b,'wood',s*b.w/2,1.65,z,.18,2.6,.18,{solid:true});
      const wing=(b.w-2.2)/2;
      box(b,'wood',s*(1.1+wing/2),1.35,-b.d/2,wing,2.7,.16,{solid:true});
      box(b,'wood',s*(1.1+wing/2),.55,b.d/2,wing,1.1,.16,{solid:true});
      box(b,'wood',s*(1.1+wing/2),2.5,b.d/2,wing,.45,.16,{solid:true});
    }
    for(const z of [-b.d/2,b.d/2])box(b,'wood',0,2.65,z,b.w,.18,.2,{solid:true});
    // Roof frame and supports, embedded well below the visible sea bed.
    for(const x of [-b.w/2+.2,b.w/2-.2])for(const z of [-b.d/2+.2,b.d/2+.2,b.d/2+b.terrace-.2]){
      const p=localPoint(b,x,z),bottom=terrainHeight(p.x,p.z)-.5;
      post(b,x,(bottom-b.y)/2,z,.24,b.y-bottom,{solid:true});
      if(z<=b.d/2+.2)post(b,x,1.4,z,.17,2.8,{solid:true});
    }
    // Low terrace rails with deliberate gaps for the swimming stair.
    for(const s of [-1,1]){box(b,'wood',s*b.w/2,.6,b.d/2+b.terrace/2,.12,.12,b.terrace,{solid:true});}
    if(b.kind==='water')box(b,'wood',.8,.6,b.d/2+b.terrace,b.w-1.6,.12,.12,{solid:true});
    else for(const s of [-1,1]){const wing=(b.w-2.2)/2;box(b,'wood',s*(1.1+wing/2),.6,b.d/2+b.terrace,wing,.12,.12,{solid:true});}
    for(const x of [-b.w/2,b.w/2])post(b,x,.45,b.d/2+b.terrace,.12,.9,{solid:true});
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
    const key=`${b.w},${b.d}`,item={b,h:central?4:3.2};
    if(!roofBins.has(key))roofBins.set(key,[]);roofBins.get(key).push(item);
    // Fringe at the eaves, batched rather than one mesh per straw.
    for(let k=0;k<Math.ceil(b.w*3);k++){
      const x=-b.w/2-.6+k/3;
      for(const z of [-b.d/2-.6,b.d/2+.6])box(b,'thatch',x,2.73,z,.19,.35,.20,{detail:true});
    }
  }
  for(const [key,list] of roofBins){const [w,d]=key.split(',').map(Number);
    const g=roofGeometry(w+1.6,d+1.6,list[0].h,8),low=roofGeometry(w+1.6,d+1.6,list[0].h,1);
    for(const [geometry,near] of [[g,true],[low,false]]){
      const im=new THREE.InstancedMesh(geometry,materials.thatch,list.length),m=new THREE.Matrix4();
      list.forEach(({b},i)=>{m.makeRotationY(b.yaw);m.setPosition(b.x,b.y+2.8,b.z);im.setMatrixAt(i,m);});im.computeBoundingSphere();im.castShadow=near;im.receiveShadow=true;im.userData.near=near;im.userData.entries=list;scene.add(im);roofs.push(im);
    }
  }
  return {buildings:BUILDINGS,roofs,update(pos){for(const im of roofs){const close=im.userData.entries.some(({b})=>Math.hypot(pos.x-b.x,pos.z-b.z)<55);im.visible=im.userData.near?close:!close;}}};
}
