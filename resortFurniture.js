import * as THREE from 'three';
import { localPoint, PLAYER_BUNGALOW } from './resortLayout.js';

// Pure furniture contract, shared by rendering, poses and interaction zones.
export function bungalowLoungers(b) {
  return (b.premium?[-2.6,-.9]:[-1.45,1.45]).map((x,index)=>{
    const z=b.d/2+b.terrace-1.2, seatHeight=.51;
    const point=(lx,lz,y=b.y)=>({...localPoint(b,lx,lz),y});
    const exit=point(x+.8,z-.9,b.y+.015);
    return {id:`${b.id}:lounger-${index+1}`,buildingId:b.id,local:{x,z},yaw:b.yaw,
      seatHeight,world:point(x,z,b.y+seatHeight),approach:exit,exit,
      sit:point(x,z+.55,b.y+seatHeight),lie:point(x,z+.78,b.y+seatHeight),
      lieTilt:.18,seatPose:{back:0,hipRise:.16,shinLean:0},floorY:b.y,
      camera:{lookHeight:.7,distance:2.8,minY:b.y+.85}};
  });
}
export const PLAYER_LOUNGER = bungalowLoungers(PLAYER_BUNGALOW)[1];

function cushionGeometry() {
  const g=new THREE.BoxGeometry(1,1,1,8,4,8),p=g.attributes.position,n=g.attributes.normal;
  const core=new THREE.Vector3(),delta=new THREE.Vector3();
  for(let i=0;i<p.count;i++){
    core.set(p.getX(i),p.getY(i),p.getZ(i)).clampScalar(-.36,.36);
    delta.set(p.getX(i),p.getY(i),p.getZ(i)).sub(core).normalize();
    const x=core.x+delta.x*.14,z=core.z+delta.z*.14,y=core.y+delta.y*.14;
    const sign=Math.sign(y),loft=.12*sign*(1-4*x*x)*(1-4*z*z);
    p.setXYZ(i,x,y+loft,z);
    delta.x+=.96*x*(1-4*z*z)*sign*delta.y;
    delta.z+=.96*z*(1-4*x*x)*sign*delta.y;delta.normalize();
    n.setXYZ(i,delta.x,delta.y,delta.z);
  }
  return g;
}
function blanketGeometry() {
  const g=new THREE.PlaneGeometry(1,1,24,20);g.rotateX(-Math.PI/2);
  const p=g.attributes.position;
  for(let i=0;i<p.count;i++){
    const x=p.getX(i),z=p.getZ(i),side=Math.max(0,(Math.abs(x)-.435)/.065),foot=Math.max(0,(z-.43)/.07);
    const folds=.009*Math.sin(x*39+z*13)+.005*Math.sin(z*47-x*8);
    p.setY(i,folds-.27*Math.pow(side,.8)-.18*foot);
  }
  g.computeVertexNormals();return g;
}
function pipingGeometry() {
  const points=[];
  for(const [cx,cz,start] of [[.36,.36,0],[-.36,.36,Math.PI/2],[-.36,-.36,Math.PI],[.36,-.36,Math.PI*1.5]])
    for(let i=0;i<8;i++){const a=start+i/7*Math.PI/2;points.push(new THREE.Vector3(cx+.14*Math.cos(a),0,cz+.14*Math.sin(a)));}
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points,true),40,.004,4,true);
}

// Shared soft geometry and instanced fabrics keep all 18 rooms affordable.
export function createResortFurniture({group,batch,materials}) {
  const shapes={cushion:cushionGeometry(),blanket:blanketGeometry(),piping:pipingGeometry()},bins=new Map();
  const records=[];
  function soft(b,shape,mat,x,y,z,w,h,d,rx=0,rz=0){
    const p=localPoint(b,x,z),key=`${shape}:${mat}:${Math.floor(p.x/64)},${Math.floor(p.z/64)}`;
    if(!bins.has(key))bins.set(key,{shape,mat,list:[]});
    const q=new THREE.Quaternion().setFromEuler(new THREE.Euler(rx,b.yaw,rz,'YXZ'));
    bins.get(key).list.push(new THREE.Matrix4().compose(new THREE.Vector3(p.x,b.y+y,p.z),q,new THREE.Vector3(w,h,d)));
  }
  const timber=(b,x,y,z,w,h,d,solid=false)=>{
    const p=localPoint(b,x,z);batch.box('barShelf',p.x,b.y+y,p.z,w,h,d,b.yaw,{detail:true,solid});
  };
  function room(b,index){
    const accent=['lagoonCloth','coralCloth','indigoCloth'][index%3];
    // Keep the original solid footprints, with a recessed plinth and headboard.
    timber(b,0,.23,-.8,2.6,.45,3.1,true);
    timber(b,0,.13,-.8,2.35,.24,2.85);
    timber(b,0,.86,-2.38,2.7,1.05,.13);
    soft(b,'cushion','sandCloth',0,.99,-2.28,2.51,.67,.15);
    soft(b,'cushion','cotton',0,.59,-.8,2.6,.29,3.1);
    for(const y of [.49,.68])soft(b,'piping','stitch',0,y,-.8,2.58,1,3.07);
    soft(b,'blanket',accent,0,.795,-.18,2.98,1,2.15);
    soft(b,'cushion',accent,0,.79,-1.24,2.55,.11,.30);
    for(const x of [-.65,.65]){
      soft(b,'cushion','cotton',x,.86,-1.88,1.03,.25,.63,.10,x<0?-.035:.035);
      soft(b,'piping','stitch',x,.865,-1.88,1.01,1,.60,.10);
      soft(b,'cushion',accent,x,.96,-2.02,.58,.40,.20,.22,x<0?-.12:.12);
    }
    const tx=-b.w/2+1.25,tz=b.d/2+.8;
    timber(b,tx,.28,tz,2.3,.45,.9,true);
    for(const x of [tx-1.12,tx+1.12])timber(b,x,.57,tz,.10,.47,.94);
    timber(b,tx,.79,tz-.41,2.26,.75,.10);
    for(const dx of [-.55,.55]){
      soft(b,'cushion','cotton',tx+dx,.60,tz,1.06,.26,.85);
      soft(b,'piping','stitch',tx+dx,.61,tz,1.04,1,.83);
      soft(b,'cushion','cotton',tx+dx,.94,tz-.32,1.07,.65,.24,.13);
    }
    soft(b,'cushion',accent,tx-.75,.91,tz-.03,.48,.46,.19,.19,-.16);
    soft(b,'cushion','sandCloth',tx+.75,.89,tz+.01,.47,.43,.20,.22,.18);
    // A casually draped throw covers one end, rather than the seating centre.
    soft(b,'blanket',accent,tx+.52,.785,tz+.03,.73,.65,1.02);
    for(const lounger of bungalowLoungers(b)){
      const {x,z}=lounger.local;
      timber(b,x,.28,z,.7,.12,1.75,true);
      soft(b,'cushion','cotton',x,lounger.seatHeight-.09,z,.66,.18,1.65);
      soft(b,'piping','stitch',x,lounger.seatHeight-.08,z,.65,1,1.63);
      soft(b,'cushion','cotton',x,.69,z-.64,.66,.19,.67,.55);
      soft(b,'cushion',accent,x,.84,z-.76,.48,.16,.25,.55);
    }
    records.push({id:b.id,accent,bed:true,bench:true,loungers:2,loungerPoints:bungalowLoungers(b)});
  }
  function chair(b,x,z){
    soft(b,'cushion','sandCloth',x,.48,z,.6,.19,.6);
    soft(b,'piping','stitch',x,.49,z,.58,1,.58);
  }
  function finish(){
    for(const [key,{shape,mat,list}] of bins){
      const mesh=new THREE.InstancedMesh(shapes[shape],materials[mat],list.length);
      list.forEach((m,i)=>mesh.setMatrixAt(i,m));mesh.instanceMatrix.needsUpdate=true;mesh.computeBoundingSphere();
      mesh.castShadow=shape!=='piping';mesh.receiveShadow=true;mesh.name=`resort-furniture:${key}`;group.add(mesh);
    }
    return records;
  }
  return {room,chair,finish};
}
