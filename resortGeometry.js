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
      im.instanceMatrix.needsUpdate=true;im.computeBoundingSphere();im.name=key;im.castShadow=!b.detail&&b.mat!=='pool';im.receiveShadow=true;im.userData.detail=b.detail;scene.add(im);meshes.push(im);
    }
    bins.clear();return meshes;
  }
  function update(camera){for(const im of meshes)if(im.userData.detail)im.visible=im.boundingSphere.center.distanceTo(camera)<55+im.boundingSphere.radius;}
  return {box,post,finish,update,meshes};
}
export function roofGeometry(w,d,h,rows=8) {
  const parts=[];
  for(let row=0;row<rows;row++){
    const a=row/rows,b=(row+1)/rows;
    const verts=[];
    for(let side=0;side<4;side++){
      const corners=[[-w/2,-d/2],[w/2,-d/2],[w/2,d/2],[-w/2,d/2]],p=corners[side],q=corners[(side+1)%4];
      const A=[p[0]*(1-a),h*a,p[1]*(1-a)],B=[q[0]*(1-a),h*a,q[1]*(1-a)],C=[q[0]*(1-b),h*b+.07,q[1]*(1-b)],D=[p[0]*(1-b),h*b+.07,p[1]*(1-b)];
      verts.push(...A,...C,...B,...A,...D,...C);
    }
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(verts,3));
    const uv=[];for(let i=0;i<verts.length;i+=3)uv.push((verts[i]+verts[i+2])*.35,verts[i+1]*.5);g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.computeVertexNormals();parts.push(g);
  }
  return mergeGeometries(parts);
}
