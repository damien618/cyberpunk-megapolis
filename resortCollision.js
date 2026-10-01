import * as THREE from 'three';
import { buildCityBoxes } from './cityBoxes.js';
import { terrainHeight, BOUNDS } from './resortLayout.js';
const boxGeo=new THREE.BoxGeometry(1,1,1), proxyMat=new THREE.MeshBasicMaterial({side:THREE.DoubleSide});
// Graphics are instanced separately. Proxies remain stable when a visual LOD changes.
export function createResortCollision() {
  const bw=buildCityBoxes(new THREE.Group(),25), surfaces=[], world=new THREE.Group();
  function addBox(x,y,z,w,h,d,yaw=0,flags={}) {
    const mesh=new THREE.Mesh(boxGeo,proxyMat);mesh.position.set(x,y,z);mesh.scale.set(w,h,d);mesh.rotation.y=yaw;mesh.updateMatrixWorld(true);
    const b=new THREE.Box3().setFromObject(mesh);
    const record={x0:b.min.x,x1:b.max.x,y0:b.min.y,y1:b.max.y,z0:b.min.z,z1:b.max.z,collide:true,prop:true,tall:false,...flags,mesh,obb:{x,z,w,d,yaw}};
    bw.add(record);world.add(mesh);return record;
  }
  function addSurface(x,z,w,d,y,yaw=0,slope=0) {surfaces.push({x,z,w,d,y,yaw,slope});}
  function groundFn(x,z,yFrom,feetY,prevY=feetY) {
    const cap=Math.min(yFrom,Math.max(feetY+.5,prevY+.3)); let best=terrainHeight(x,z);
    if(best>cap)best=null;
    for(const f of surfaces){const dx=x-f.x,dz=z-f.z,c=Math.cos(f.yaw),s=Math.sin(f.yaw),lx=c*dx-s*dz,lz=s*dx+c*dz;
      if(Math.abs(lx)>f.w/2+.015||Math.abs(lz)>f.d/2+.015)continue;
      const h=f.y+lz*f.slope;if(h<=cap&&(best===null||h>best))best=h;
    }
    return best===null?null:best+.015;
  }
  const ray=new THREE.Raycaster(), normal=new THREE.Vector3();
  function castFn(origin,dir,far,verifyBox) {
    ray.set(origin,dir);ray.far=far;
    const ids=bw.queryNearby(origin.x,origin.z,far+2),meshes=ids.map(i=>bw.aabbs[i]).filter(b=>b.collide&&b.mesh).map(b=>b.mesh);
    const hit=ray.intersectObjects(verifyBox?.mesh?[verifyBox.mesh]:meshes,false)[0];if(!hit)return null;
    normal.copy(hit.face.normal).transformDirection(hit.object.matrixWorld);
    return {point:hit.point,normal:normal.clone(),distance:hit.distance};
  }
  function boundaries() {
    for(const x of [BOUNDS.x0,BOUNDS.x1]) for(let z=BOUNDS.z0;z<BOUNDS.z1;z+=35)addBox(x,10,z+17.5,1,40,35,0,{camBlock:false});
    for(const z of [BOUNDS.z0,BOUNDS.z1])for(let x=BOUNDS.x0;x<BOUNDS.x1;x+=35)addBox(x+17.5,10,z,35,40,1,0,{camBlock:false});
  }
  return {bw,world,surfaces,addBox,addSurface,groundFn,castFn,boundaries};
}
