import * as THREE from 'three';
import * as L from './resortLayout.js';
import { createWildlife, makeCreatureMaterial } from './wildlife.js?v=20261001-sealion1';
import { GULL } from './wildlifeSoarer.js?v=20261001-sealion1';
import { buildFish, FISH_GLSL } from './wildlifeFish.js?v=20261001-sealion1';
import { boidParams, stepBoids } from './wildlifeBoids.js?v=20261001-sealion1';

const SCHOOL_SIZE=8, SCHOOL_RADIUS=5, ACTIVE_RADIUS=35;
const PALETTE=[0xffd747,0x2de0df,0xff8465];
const SIDES=[[1,0],[-1,0],[0,1],[0,-1]];

export function createResortWildlife({scene,ocean,corals,collision}) {
  const group=new THREE.Group();group.name='resort-wildlife';scene.add(group);
  const birds=createWildlife({scene:group,seed:'resort-seabirds',layout:{
    bounds:{x:[L.BOUNDS.x0,L.BOUNDS.x1],z:[L.BOUNDS.z0,L.BOUNDS.z1]},terrainHeight:L.terrainHeight,
    shoreDistance:(x,z)=>z-L.shoreAt(x),waterAt:()=>({y:L.SEA_Y}),
  },species:[{def:GULL,id:'resort-seabird',count:6,activeRadius:80,homeRange:12,
    habitat:{region:{x:[-75,75],z:[-33,-27]},test:(x,z)=>z<L.shoreAt(x)-5},
    fly:{circleR:[8,14],low:12,high:18,drift:.2,recenter:[22,45],bank:2.6},
    build:()=>{
      const result=GULL.build(),g=result.geometry,c=g.attributes.color,p=g.attributes.aPart;
      // Pearl-white wings; preserve the original dark tips, eyes and yellow bill.
      for(let i=0;i<c.count;i++)if(p.getX(i)>=5&&c.getX(i)>.08)c.setXYZ(i,.92,.94,.95);
      return result;
    },castShadow:false,
  }]});

  const {geometry}=buildFish();geometry.computeBoundingBox();
  const box=geometry.boundingBox,modelLength=box.max.z-box.min.z;
  // A sphere encloses the entire animated fish, including its tail sweep.
  const radius=.3/modelLength*Math.max(box.min.length(),box.max.length())+.025;
  const anim=new THREE.InstancedBufferAttribute(new Float32Array(24*4),4);
  anim.setUsage(THREE.DynamicDrawUsage);geometry.setAttribute('aAnim',anim);
  const colors=geometry.attributes.color,parts=geometry.attributes.aPart;
  for(let i=0;i<colors.count;i++)if(parts.getX(i)!==4){
    const shade=parts.getX(i)===0?.85:1;colors.setXYZ(i,shade,shade,shade);
  }
  const fishMesh=new THREE.InstancedMesh(geometry,makeCreatureMaterial({id:'resort-reef-fish',animGLSL:FISH_GLSL,roughness:.45,metalness:.15}),24);
  fishMesh.name='resort-reef-fish';fishMesh.castShadow=false;fishMesh.receiveShadow=true;
  fishMesh.frustumCulled=false;fishMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);fishMesh.count=0;group.add(fishMesh);
  const underwaterBoxes=collision.bw.aabbs.filter(b=>b.collide&&!b.groundOnly&&b.y0<.4);
  const reefs=corals.spots;
  const reefGrid=new Map(),reefCell=6;
  for(const s of reefs){
    const key=`${Math.floor(s.x/reefCell)},${Math.floor(s.z/reefCell)}`;
    if(!reefGrid.has(key))reefGrid.set(key,[]);
    reefGrid.get(key).push({...s,top:L.terrainHeight(s.x,s.z)+[.92,.85,.55][s.k]*s.s*s.sy});
  }
  const surface=(x,z,t)=>ocean.waterHeightAt(x,z,t);
  function floorAt(x,z) {
    let floor=L.terrainHeight(x,z);
    for(const [dx,dz] of SIDES)floor=Math.max(floor,L.terrainHeight(x+dx*radius,z+dz*radius));
    const cx=Math.floor(x/reefCell),cz=Math.floor(z/reefCell);
    for(let dx=-1;dx<=1;dx++)for(let dz=-1;dz<=1;dz++){
      const nearby=reefGrid.get(`${cx+dx},${cz+dz}`);
      if(nearby)for(const s of nearby)if(Math.hypot(x-s.x,z-s.z)<s.s+radius)floor=Math.max(floor,s.top);
    }
    return floor;
  }
  function limits(x,z,t) {
    // Surface gradients are tiny, but sample the envelope rather than only its centre.
    let top=surface(x,z,t);
    for(const [dx,dz] of SIDES)top=Math.min(top,surface(x+dx*radius,z+dz*radius,t));
    return {min:floorAt(x,z)+radius+.04,max:top-radius-.04};
  }
  function blocked(x,y,z,extra=0) {
    const r=radius+extra;
    return underwaterBoxes.some(b=>{
      if(y+r<b.y0||y-r>b.y1||x+r<b.x0||x-r>b.x1||z+r<b.z0||z-r>b.z1)return false;
      const o=b.obb;
      if(!o)return true;
      const dx=x-o.x,dz=z-o.z,c=Math.cos(o.yaw),s=Math.sin(o.yaw);
      return Math.abs(c*dx-s*dz)<o.w/2+r&&Math.abs(s*dx+c*dz)<o.d/2+r;
    });
  }
  function isPositionValid(p,t) {
    const h=limits(p.x,p.z,t);
    return p.y>=h.min&&p.y<=h.max&&!blocked(p.x,p.y,p.z);
  }
  const reserved=L.PLAYER_BUNGALOW;
  const nearRoom=L.localPoint(reserved,0,reserved.d/2+reserved.terrace+7);
  function reefNear(x,z) {
    const candidates=reefs.filter(s=>L.depthAt(s.x,s.z)>1.4);
    const s=candidates.reduce((best,s)=>!best||Math.hypot(s.x-x,s.z-z)<Math.hypot(best.x-x,best.z-z)?s:best,null);
    if(!s)throw new Error('Le lagon ne contient aucun récif pour la faune.');
    return {x:s.x,z:s.z};
  }
  function findHome(target) {
    // Deterministic rings find open water beside the reef, never inside its meshes.
    for(let ring=0;ring<20;ring++)for(let i=0;i<24;i++){
      const angle=i/24*Math.PI*2,x=target.x+ring*.5*Math.cos(angle),z=target.z+ring*.5*Math.sin(angle);
      const h=limits(x,z,0),y=Math.min(-.65,h.max-.1);
      if(h.min<y-.25&&L.keepOffBuilt(x,z)&&!blocked(x,y,z,1.5))return {x,y,z};
    }
    throw new Error('Aucun emplacement immergé sûr pour un banc de poissons.');
  }
  const rng=L.seededRandom(20261003);
  const schools=[nearRoom,reefNear(-30,-70),reefNear(30,-70)].map((target,index)=>{
    const home=findHome(target),fish=[];
    for(let i=0;i<SCHOOL_SIZE;i++){
      let p;
      for(let attempt=0;attempt<500;attempt++){
        const angle=rng()*Math.PI*2,d=.2+rng()*.9;
        p={x:home.x+Math.cos(angle)*d,y:home.y+(rng()-.5)*.12,z:home.z+Math.sin(angle)*d};
        if(isPositionValid(p,0))break;p=null;
      }
      if(!p)throw new Error('Placement initial de poisson impossible.');
      fish.push({...p,vx:.35,vz:.15,vy:0,length:.2+rng()*.1,phase:rng()*Math.PI*2,stride:rng()*Math.PI*2});
    }
    const params=boidParams({sepDist:.35,viewDist:4,cohesion:.85,targetWeight:.35,
      minSpeed:.2,maxSpeed:.9,flee:5,fleeDist:2.8,maxForce:5,target:{...home}});
    return {id:index===0?'player-bungalow':index===1?'west-reef':'east-reef',home,fish,params,active:false};
  });
  const dummy=new THREE.Object3D(),color=new THREE.Color();
  const stats={visibleBirds:0,visibleFish:0,activeSchools:0,blockedMoves:0,ms:0};
  let night=false;
  function setTime(time){night=time==='night';birds.group.visible=!night;}
  function update(dt,t,playerPos,playerVel) {
    const start=performance.now();dt=Math.max(0,Math.min(dt,.05));
    // This also advances the shared shader clock for swimming fins at night.
    birds.update(night?0:dt,t,night?{x:1e6,z:1e6}:playerPos,playerVel);
    stats.visibleBirds=night?0:birds.stats.visible;stats.visibleFish=0;stats.activeSchools=0;
    let slot=0;
    for(const school of schools){
      const {home,fish,params}=school;
      school.active=Math.hypot(playerPos.x-home.x,playerPos.z-home.z)<ACTIVE_RADIUS;
      if(!school.active)continue;
      stats.activeSchools++;
      params.threat=playerPos.y<surface(playerPos.x,playerPos.z,t)+.1?playerPos:null;
      params.target.x=home.x+Math.cos(t*.12+school.index)*.6;
      params.target.z=home.z+Math.sin(t*.12)*.6;
      // Bound steering supplements boids; final validation remains authoritative.
      for(const f of fish){f.prevX=f.x;f.prevY=f.y;f.prevZ=f.z;}
      stepBoids(fish,params,dt,(f,out)=>{
        const h=limits(f.x,f.z,t),d=Math.hypot(f.x-home.x,f.z-home.z);
        out.y=(Math.max(h.min,Math.min(h.max,home.y))-f.y)*3;
        if(d>SCHOOL_RADIUS-1){out.x=(home.x-f.x)*2;out.z=(home.z-f.z)*2;}
        if(blocked(f.x+f.vx*.6,f.y,f.z+f.vz*.6,.1)){out.x+=(home.x-f.x)*3-f.vx*4;out.z+=(home.z-f.z)*3-f.vz*4;}
      });
      for(const f of fish){
        let h=limits(f.x,f.z,t);f.y=Math.max(h.min,Math.min(h.max,f.y));
        if(!isPositionValid(f,t)||Math.hypot(f.x-home.x,f.z-home.z)>SCHOOL_RADIUS){
          f.x=f.prevX;f.z=f.prevZ;h=limits(f.x,f.z,t);
          f.y=Math.max(h.min,Math.min(h.max,f.prevY));
          f.vx=(home.x-f.x)*.3;f.vz=(home.z-f.z)*.3;f.vy=0;stats.blockedMoves++;
        }
        const speed=Math.hypot(f.vx,f.vy,f.vz);
        f.stride+=speed*90*dt;
        dummy.position.set(f.x,f.y,f.z);dummy.rotation.set(0,Math.atan2(f.vx,f.vz),0);
        dummy.scale.setScalar(f.length/modelLength);dummy.updateMatrix();fishMesh.setMatrixAt(slot,dummy.matrix);
        color.setHex(PALETTE[school.index]);fishMesh.setColorAt(slot,color);
        anim.setXYZW(slot,f.phase,Math.min(1,speed/.9),params.threat?1:0,f.stride);slot++;
      }
    }
    fishMesh.count=slot;fishMesh.visible=slot>0;stats.visibleFish=slot;
    if(slot){fishMesh.instanceMatrix.needsUpdate=true;fishMesh.instanceColor.needsUpdate=true;anim.needsUpdate=true;}
    stats.ms=performance.now()-start;
  }
  schools.forEach((school,index)=>{school.index=index;});
  return {group,update,setTime,counts:{birds:birds.counts['resort-seabird'],fish:24,schools:3},stats,
    debug:{schools,birds:birds.debug.species['resort-seabird'],fishMesh,radius,modelLength,limits,isPositionValid,blocked,activeRadius:ACTIVE_RADIUS}};
}
