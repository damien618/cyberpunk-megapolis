import { BOARDWALKS,BUNGALOWS,DECK_Y,terrainHeight,localPoint } from './resortLayout.js';

// Offset shared vertices, so neighbouring rail panels meet even on a bend.
function edgePoints(points, offset) {
  const normals=points.slice(1).map((b,i)=>{
    const a=points[i],len=Math.hypot(b[0]-a[0],b[1]-a[1]);
    return [(b[1]-a[1])/len,-(b[0]-a[0])/len];
  });
  return points.map((p,i)=>{
    const a=normals[Math.max(0,i-1)],b=normals[Math.min(i,normals.length-1)];
    const scale=offset/(1+a[0]*b[0]+a[1]*b[1]);
    return [p[0]+(a[0]+b[0])*scale,p[1]+(a[1]+b[1])*scale];
  });
}

// Clip a rail against another walkway's footprint. Only the connecting side
// opens, and branch rails end precisely at the edge of the main pontoon.
function insideInterval(a,b,footprint) {
  const {x,z,yaw,len,width}=footprint,c=Math.cos(yaw),s=Math.sin(yaw);
  const local=p=>[c*(p[0]-x)-s*(p[1]-z),s*(p[0]-x)+c*(p[1]-z)];
  const p=local(a),q=local(b),limits=[width/2-.06,len/2+.04];
  let lo=0,hi=1;
  for(let k=0;k<2;k++){
    const d=q[k]-p[k];
    if(Math.abs(d)<1e-9){if(Math.abs(p[k])>limits[k])return null;continue;}
    const t0=(-limits[k]-p[k])/d,t1=(limits[k]-p[k])/d;
    lo=Math.max(lo,Math.min(t0,t1));hi=Math.min(hi,Math.max(t0,t1));
    if(hi<=lo)return null;
  }
  return [lo,hi];
}

export function buildResortBoardwalks({batch,collision}) {
  const routes=[],paths=[];
  function segment(a,b,width,y0=DECK_Y,y1=DECK_Y){
    const dx=b[0]-a[0],dz=b[1]-a[1],len=Math.hypot(dx,dz),yaw=Math.atan2(dx,dz),x=(a[0]+b[0])/2,z=(a[1]+b[1])/2,y=(y0+y1)/2;
    const slope=(y1-y0)/len;
    batch.box('wood',x,y-.12,z,width,.24,len+.08,yaw,{rx:-Math.atan(slope)});
    collision.addSurface(x,z,width,len+.08,y,yaw,slope);
    return {x,z,y,yaw,len,width};
  }
  for(const p of BOARDWALKS){
    const route=p.slice(1).map((b,i)=>segment(p[i],b,2.8));
    paths.push({points:p,width:2.8,segments:route});routes.push(route);
    const a=p[0],land=[a[0],30];segment(a,land,2.8,DECK_Y,terrainHeight(...land)+.02);
  }
  for(const b of BUNGALOWS){
    const door=localPoint(b,0,-b.d/2),points=[[b.branch.x,b.branch.z],[door.x,door.z]];
    paths.push({points,width:1.8,segments:[segment(...points,1.8)]});
  }
  const posts=new Set();
  function post(p){
    const key=p.map(v=>Math.round(v*100)).join(',');if(posts.has(key))return;posts.add(key);
    const bottom=terrainHeight(...p)-.4,top=DECK_Y+.9;
    batch.post('pile',p[0],(bottom+top)/2,p[1],.14,top-bottom,.14,0,{solid:true});
  }
  function railRun(points){
    if(points.length<2)return;
    post(points[0]);let distance=0;
    for(let i=1;i<points.length;i++){
      const a=points[i-1],b=points[i],dx=b[0]-a[0],dz=b[1]-a[1],len=Math.hypot(dx,dz),yaw=Math.atan2(dx,dz);
      for(const [height,w,h] of [[.65,.1,.13],[.34,.08,.09]])
        batch.box('wood',(a[0]+b[0])/2,DECK_Y+height,(a[1]+b[1])/2,w,h,len+.02,yaw,{solid:true});
      for(let t=2.5-distance;t<=len;t+=2.5)post([a[0]+dx*t/len,a[1]+dz*t/len]);
      distance=(distance+len)%2.5;
    }
    post(points[points.length-1]);
  }
  for(const path of paths)for(const side of [-1,1]){
    const edge=edgePoints(path.points,side*(path.width/2-.06));
    const others=paths.filter(p=>p!==path).flatMap(p=>p.segments);
    let run=[];
    for(let i=1;i<edge.length;i++){
      const a=edge[i-1],b=edge[i],at=t=>a.map((v,k)=>v+(b[k]-v)*t);
      const cuts=others.map(f=>insideInterval(a,b,f)).filter(Boolean).sort((a,b)=>a[0]-b[0]);
      let start=0;
      function keep(end){
        if(end-start<1e-6)return;
        const p=at(start),q=at(end),last=run[run.length-1];
        if(last&&Math.hypot(last[0]-p[0],last[1]-p[1])>1e-5){railRun(run);run=[];}
        if(!run.length)run.push(p);run.push(q);
      }
      for(const [lo,hi] of cuts){
        if(lo>start)keep(lo);
        if(hi>start){railRun(run);run=[];start=hi;}
      }
      keep(1);
    }
    railRun(run);
  }
  return {routes};
}
