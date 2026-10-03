import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
const unitBox=new THREE.BoxGeometry(1,1,1),unitPost=new THREE.CylinderGeometry(.5,.5,1,8);
// Instances by sector/material/shape. Floors and obstacles have independent proxies.
export function createResortBatch(scene,materials,collision) {
  const bins=new Map(), meshes=[],v=new THREE.Vector3(),q=new THREE.Quaternion(),sc=new THREE.Vector3();
  function add(shape,mat,x,y,z,w,h,d,yaw=0,flags={}) {
    const tile=flags.tile??96,key=`${shape}:${mat}:${Math.floor(x/tile)},${Math.floor(z/tile)}:${flags.detail?'detail':'base'}`;
    if(!bins.has(key))bins.set(key,{shape,mat,list:[],detail:!!flags.detail});
    bins.get(key).list.push({x,y,z,w,h,d,yaw,rx:flags.rx||0,rz:flags.rz||0});
    if(flags.solid)collision?.addBox(x,y,z,w,h,d,yaw,{groundOnly:!!flags.groundOnly,prop:!flags.groundOnly,camBlock:flags.camBlock!==false,ceiling:!!flags.ceiling});
    if(flags.floor)collision?.addSurface(x,z,w,d,y+h/2,yaw,flags.slope||0);
  }
  function box(mat,x,y,z,w,h,d,yaw=0,flags={}){add('box',mat,x,y,z,w,h,d,yaw,flags);}
  function post(mat,x,y,z,w,h,d,yaw=0,flags={}){add('post',mat,x,y,z,w,h,d,yaw,flags);}
  function finish(){
    for(const [key,b] of bins){const im=new THREE.InstancedMesh(b.shape==='post'?unitPost:unitBox,materials[b.mat],b.list.length);
      b.list.forEach((a,i)=>{q.setFromEuler(new THREE.Euler(a.rx,a.yaw,a.rz,'YXZ'));im.setMatrixAt(i,new THREE.Matrix4().compose(v.set(a.x,a.y,a.z),q,sc.set(a.w,a.h,a.d)));});
      im.instanceMatrix.needsUpdate=true;im.computeBoundingSphere();im.name=key;im.castShadow=!b.detail&&!['pool','galleryFloor'].includes(b.mat);im.receiveShadow=true;im.userData.detail=b.detail;scene.add(im);meshes.push(im);
    }
    bins.clear();return meshes;
  }
  function addDetailMesh(mesh,far=55){
    mesh.geometry.computeBoundingSphere();mesh.boundingSphere=mesh.geometry.boundingSphere.clone();
    mesh.userData.detail=true;mesh.userData.detailDistance=far;meshes.push(mesh);
  }
  function update(camera){for(const im of meshes)if(im.userData.detail)im.visible=im.userData.visibleAt?im.userData.visibleAt(camera):im.boundingSphere.center.distanceTo(camera)<(im.userData.detailDistance??55)+im.boundingSphere.radius;}
  return {box,post,finish,update,addDetailMesh,meshes,addObstacle:(...args)=>collision?.addBox(...args)};
}
// Hip roof laid as overlapping thatch courses: each band thickens toward a ragged
// butt edge that shades the course below, and straw rolls cover the four hips.
// UV v: 0–.12 hanging tips (alpha-cut), .12–.24 the cut-end butt, .24–1 the straw.
export function roofGeometry(w,d,h,rows=8) {
  const fine=rows>1,pos=[],uv=[],hash=(a,b)=>{const x=Math.sin(a*127.1+b*311.7)*43758.5453;return x-Math.floor(x);};
  const V=(x,y,z)=>new THREE.Vector3(x,y,z),apex=V(0,h,0);
  const tri=(a,b,c,ua,ub,uc,dir)=>{
    if(new THREE.Vector3().subVectors(b,a).cross(new THREE.Vector3().subVectors(c,a)).dot(dir)<0)[b,c,ub,uc]=[c,b,uc,ub];
    for(const p of [a,b,c])pos.push(p.x,p.y,p.z);uv.push(...ua,...ub,...uc);
  };
  const corners=[[-w/2,-d/2],[w/2,-d/2],[w/2,d/2],[-w/2,d/2]].map(([x,z])=>V(x,0,z));
  for(let side=0;side<4;side++){
    const p=corners[side],q=corners[(side+1)%4],len=p.distanceTo(q);
    const mid=p.clone().add(q).multiplyScalar(.5),down=mid.clone().sub(apex).normalize();
    const N=new THREE.Vector3().subVectors(q,p).cross(new THREE.Vector3().subVectors(apex,p)).normalize();
    if(N.y<0)N.negate();
    const at=(t,u)=>p.clone().lerp(q,u).multiplyScalar(1-t).add(V(0,h*t,0));
    for(let k=0;k<rows;k++){
      const t0=k/rows,t1=Math.min(1,(k+1)/rows+(fine?.015:0)),thick=fine?(k===0?.26:.14):.18;
      const n=fine?Math.max(2,Math.ceil(len*(1-t0)/.3)):1,shift=hash(side,k)*3;
      const top=[],out=[],inn=[],tip=[],us=[];
      for(let j=0;j<=n;j++){
        const u=j/n,r=fine&&j>0&&j<n?hash(side*31+k,j):.5,base=at(t0,u);
        // Ragged butts: each bundle stands proud or sags by a few centimetres.
        top.push(at(t1,u));inn.push(base.clone().addScaledVector(down,fine?.02:0));
        out.push(base.clone().addScaledVector(N,thick*(.8+.4*r)).addScaledVector(down,fine?.03+.07*r:0));
        tip.push(out[j].clone().addScaledVector(down,fine?.16+.08*r:0).addScaledVector(N,-.04));
        us.push((u-.5)*len*(1-t0)*.55+shift);
      }
      for(let j=0;j<n;j++){
        const [a,b]=[us[j],us[j+1]];
        tri(top[j],top[j+1],out[j+1],[a,1],[b,1],[b,.24],N);tri(top[j],out[j+1],out[j],[a,1],[b,.24],[a,.24],N);
        tri(out[j],out[j+1],inn[j+1],[a,.24],[b,.24],[b,.12],down);tri(out[j],inn[j+1],inn[j],[a,.24],[b,.12],[a,.12],down);
        if(fine){tri(out[j],out[j+1],tip[j+1],[a,.12],[b,.12],[b,0],N);tri(out[j],tip[j+1],tip[j],[a,.12],[b,0],[a,0],N);}
      }
    }
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
  g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.computeVertexNormals();
  if(!fine)return g;
  const parts=[g],Y=V(0,1,0);
  const place=(geom,from,to,lift)=>{
    const L=from.distanceTo(to),dir=to.clone().sub(from).normalize(),m=new THREE.Matrix4();
    geom=geom.toNonIndexed();const uvs=geom.getAttribute('uv');
    // Strands wrap across the roll; bundles repeat along it.
    for(let i=0;i<uvs.count;i++)uvs.setXY(i,uvs.getY(i)*L*.55,.3+.6*uvs.getX(i));
    m.compose(from.clone().add(to).multiplyScalar(.5).add(V(0,lift,0)),new THREE.Quaternion().setFromUnitVectors(Y,dir),V(1,L,1));
    parts.push(geom.applyMatrix4(m));
  };
  for(const c of corners){const foot=c.clone().multiplyScalar(1.02).add(V(0,-.05,0));place(new THREE.CylinderGeometry(.17,.21,1,7,1,true),foot,apex,.16);}
  const cap=new THREE.ConeGeometry(.34,1,8,1,true);place(cap,apex.clone().add(V(0,.05,0)),apex.clone().add(V(0,.6,0)),0);
  return mergeGeometries(parts);
}
