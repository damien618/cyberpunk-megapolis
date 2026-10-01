import * as THREE from 'three';
import { BOARDWALKS,BUNGALOWS,DECK_Y,terrainHeight,localPoint } from './resortLayout.js';
export function buildResortBoardwalks({batch,collision}) {
  const routes=[];
  function segment(a,b,width,y0=DECK_Y,y1=DECK_Y,rails=true){
    const dx=b[0]-a[0],dz=b[1]-a[1],len=Math.hypot(dx,dz),yaw=Math.atan2(dx,dz),x=(a[0]+b[0])/2,z=(a[1]+b[1])/2,y=(y0+y1)/2;
    const slope=(y1-y0)/len;
    batch.box('wood',x,y-.12,z,width,.24,len+.08,yaw,{rx:-Math.atan(slope)});
    collision.addSurface(x,z,width,len+.08,y,yaw,slope);
    if(rails)for(const side of [-1,1]){
      const nx=Math.cos(yaw)*side,nz=-Math.sin(yaw)*side;
      batch.box('wood',x+nx*(width/2-.06),y+.65,z+nz*(width/2-.06),.1,.13,len+.08,yaw,{solid:true});
      batch.box('wood',x+nx*(width/2-.06),y+.34,z+nz*(width/2-.06),.08,.09,len+.08,yaw,{solid:true});
    }
    return {x,z,y,yaw,len,width};
  }
  for(const p of BOARDWALKS){
    const route=[];
    for(let i=0;i<p.length-1;i++){
      const a=p[i],b=p[i+1],mx=(a[0]+b[0])/2,mz=(a[1]+b[1])/2;
      const junction=BUNGALOWS.some(h=>Math.hypot(h.branch.x-mx,h.branch.z-mz)<2.4);
      const s=segment(a,b,2.8,DECK_Y,DECK_Y,!junction);route.push(s);
      if(i%2===0)for(const side of [-1,1]){const x=s.x+Math.cos(s.yaw)*side*1.25,z=s.z-Math.sin(s.yaw)*side*1.25,bed=terrainHeight(x,z)-.4;
        batch.post('pile',x,(bed+DECK_Y)/2,z,.2,DECK_Y-bed,.2,s.yaw,{solid:true});
        if(!junction)batch.post('pile',x,DECK_Y+.45,z,.12,.9,.12,s.yaw,{solid:true});
      }
    }
    const a=p[0],land=[a[0],30];segment(a,land,2.8,DECK_Y,terrainHeight(...land)+.02,false);routes.push(route);
  }
  for(const b of BUNGALOWS){const door=localPoint(b,0,-b.d/2),a=[b.branch.x,b.branch.z],end=[door.x,door.z],len=Math.hypot(end[0]-a[0],end[1]-a[1]);
    const n=Math.ceil(len/2.5);for(let i=0;i<n;i++)segment(a.map((v,k)=>v+(end[k]-v)*i/n),a.map((v,k)=>v+(end[k]-v)*(i+1)/n),1.8,DECK_Y,DECK_Y,i>0);
  }
  return {routes};
}
