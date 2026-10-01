import * as THREE from 'three';
import { BUNGALOWS,localPoint,toLocal } from './resortLayout.js';
export const POOLS=BUNGALOWS.filter(b=>b.premium).map(b=>({id:`pool-${b.id}`,building:b,lx:b.w/2-1.5,lz:b.d/2+b.terrace/2,w:2.5,d:4,surfaceY:b.y-.10,bottomY:b.y-1.45}));
export function poolAt(x,z) {return POOLS.find(p=>{const q=toLocal(p.building,x,z);return Math.abs(q.x-p.lx)<p.w/2&&Math.abs(q.z-p.lz)<p.d/2;});}
export function buildResortPools({scene,batch}) {
  const group=new THREE.Group();scene.add(group);
  const mat=new THREE.MeshStandardMaterial({color:0x1fa9c4,roughness:.08,metalness:.1,transparent:true,opacity:.72,side:THREE.DoubleSide,depthWrite:false});
  for(const p of POOLS){const b=p.building,c=localPoint(b,p.lx,p.lz);
    batch.box('pool',c.x,p.bottomY-.08,c.z,p.w,.16,p.d,b.yaw,{floor:true});
    for(const [x,z,w,d] of [[p.lx-p.w/2-.09,p.lz,.18,p.d+.36],[p.lx+p.w/2+.09,p.lz,.18,p.d+.36],[p.lx-(p.w+1.1)/4,p.lz-p.d/2-.09,(p.w-1.1)/2,.18],[p.lx+(p.w+1.1)/4,p.lz-p.d/2-.09,(p.w-1.1)/2,.18],[p.lx,p.lz+p.d/2+.09,p.w,.18]]){
      const c=localPoint(b,x,z);batch.box('pool',c.x,b.y-.63,c.z,w,1.65,d,b.yaw,{solid:true});
    }
    // Under the deck the tank is boxed in timber, like the suites it copies.
    const skirtTop=b.y-.26,skirtH=skirtTop-(p.bottomY-.2),sy=skirtTop-skirtH/2,o=.21;
    for(const [x,z,w,d] of [[p.lx-p.w/2-o,p.lz,.06,p.d+2*o+.06],[p.lx+p.w/2+o,p.lz,.06,p.d+2*o+.06],[p.lx,p.lz-p.d/2-o,p.w+2*o,.06],[p.lx,p.lz+p.d/2+o,p.w+2*o,.06]]){
      const c=localPoint(b,x,z);batch.box('wood',c.x,sy,c.z,w,skirtH,d,b.yaw);}
    batch.box('wood',c.x,p.bottomY-.2,c.z,p.w+2*o,.06,p.d+2*o,b.yaw);
    // Four small steps inside the pool are the only exit through its coping.
    for(let k=0;k<6;k++){const c=localPoint(b,p.lx,p.lz-p.d/2+.28+k*.28),top=b.y-.05-k*.23;
      batch.box('pool',c.x,top-.1,c.z,1.0,.2,.3,b.yaw,{floor:true,solid:true,groundOnly:true});}
    const water=new THREE.Mesh(new THREE.PlaneGeometry(p.w,p.d,8,12),mat);water.rotation.set(-Math.PI/2,0,-b.yaw);water.position.set(c.x,p.surfaceY,c.z);water.renderOrder=1;water.name=p.id;group.add(water);
  }
  return {group,pools:POOLS,update(t){mat.opacity=.72+Math.sin(t*.8)*.02;}};
}
