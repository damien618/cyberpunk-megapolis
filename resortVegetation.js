import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { buildJungleVegetation } from './jungleVegetation.js';
import { createResortShrubs } from './resortShrubs.js';
import * as L from './resortLayout.js';
export function buildResortVegetation({scene,maxAniso,collision}) {
  const shrubs=createResortShrubs(maxAniso);
  const rnd=L.seededRandom(62719),vegetation=buildJungleVegetation({scene,rnd,maxAniso,layout:L,rules:{region:{x0:-154,x1:154,z0:10,z1:86},keepOffBuilt:L.keepOffBuilt,explicitPalms:L.HAMMOCK_PALMS,beds:[43,53],shrubs}});
  for(const c of vegetation.colliders)collision.addBox((c.x0+c.x1)/2,(c.y0+c.y1)/2,(c.z0+c.z1)/2,c.x1-c.x0,c.y1-c.y0,c.z1-c.z0,0,{camBlock:false});
  const petals=[];
  for(let k=0;k<5;k++){const g=new THREE.SphereGeometry(.17,5,2,0,Math.PI*2,0,Math.PI/2);g.scale(1,.25,1);g.translate(0,.055,.13);g.rotateY(k*Math.PI*2/5);petals.push(g);}
  const center=new THREE.CylinderGeometry(.012,.015,.20,5);center.translate(0,.065,0);petals.push(center);
  const flowerGeo=mergeGeometries(petals),spots=[],m=new THREE.Matrix4(),q=new THREE.Quaternion(),up=new THREE.Vector3(0,1,0),n=new THREE.Vector3();
  const bushMeshes=new Map(vegetation.group.children.filter(mesh=>mesh.name.startsWith('garden_bush@')).map(mesh=>[mesh.name.split('@')[1],mesh]));
  const foliageGeo=bushMeshes.values().next().value?.geometry;
  const probeMaterial=new THREE.MeshBasicMaterial({side:THREE.DoubleSide});
  const probe=new THREE.Mesh(foliageGeo,probeMaterial),ray=new THREE.Raycaster();
  const origin=new THREE.Vector3(),direction=new THREE.Vector3(),rotation=new THREE.Matrix4();
  // Intersect the actual lobed foliage instead of approximating a taller
  // ellipsoid. This includes its irregular silhouette and the bush rotation.
  for(const [bushIndex,b] of vegetation.spots.bushes.entries()){
    const inBed=[43,53].some(z=>Math.abs(b.z-z)<.01);if(!inBed&&rnd()>.3)continue;
    rotation.makeRotationY(b.ry);
    for(let k=0,count=inBed?6:3;k<count;k++){const a=rnd()*6.28,e=.3+rnd()*.95;
      direction.set(Math.cos(e)*Math.cos(a),Math.sin(e),Math.cos(e)*Math.sin(a));
      origin.copy(direction).multiplyScalar(3).add(new THREE.Vector3(0,.36,0));
      ray.set(origin,direction.clone().negate());
      const hit=ray.intersectObject(probe,false)[0];if(!hit)continue;
      n.copy(hit.face.normal).transformDirection(rotation);
      const p=hit.point.clone().multiplyScalar(b.s).applyMatrix4(rotation).add(new THREE.Vector3(b.x,b.y,b.z));
      // The ray hits the shaded core; lift the flower out to the leaf sprays.
      p.addScaledVector(n,.12*b.s);
      spots.push({x:p.x,y:p.y,z:p.z,n:n.clone(),s:.38+rnd()*.14,spin:rnd()*6.28,bushIndex,tile:`${Math.floor(b.x/64)},${Math.floor(b.z/64)}`});}
  }
  probeMaterial.dispose();
  const flowers=[],spin=new THREE.Quaternion();
  for(const [k,color] of [[0,0xe0283f],[1,0xf2668f]]){
    const mat=new THREE.MeshStandardMaterial({color,roughness:.7,side:THREE.DoubleSide}),tiles=new Map();
    spots.forEach((p,i)=>{if(i%2!==k)return;if(!tiles.has(p.tile))tiles.set(p.tile,[]);tiles.get(p.tile).push(p);});
    for(const [tile,list] of tiles){
      const im=new THREE.InstancedMesh(flowerGeo,mat,list.length);list.forEach((p,i)=>{q.setFromUnitVectors(up,p.n).multiply(spin.setFromAxisAngle(up,p.spin));im.setMatrixAt(i,m.compose(new THREE.Vector3(p.x,p.y,p.z),q,new THREE.Vector3(p.s,p.s,p.s)));});
      im.computeBoundingSphere();im.name=`resort-hibiscus@${tile}:${k}`;im.userData.bushMesh=bushMeshes.get(tile);scene.add(im);flowers.push(im);
    }
  }
  return {...vegetation,flowers,flowerSpots:spots,update(camera,dt=0){
    vegetation.update(camera,dt);shrubs.update(dt);
    for(const im of flowers)im.visible=im.userData.bushMesh.visible;
  }};
}
