import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { buildJungleVegetation } from './jungleVegetation.js';
import * as L from './resortLayout.js';
export function buildResortVegetation({scene,maxAniso,collision}) {
  const rnd=L.seededRandom(62719),vegetation=buildJungleVegetation({scene,rnd,maxAniso,layout:L,rules:{region:{x0:-154,x1:154,z0:10,z1:86},keepOffBuilt:L.keepOffBuilt,explicitPalms:L.HAMMOCK_PALMS,beds:[43,53]}});
  for(const c of vegetation.colliders)collision.addBox((c.x0+c.x1)/2,(c.y0+c.y1)/2,(c.z0+c.z1)/2,c.x1-c.x0,c.y1-c.y0,c.z1-c.z0,0,{camBlock:false});
  const petals=[];
  for(let k=0;k<5;k++){const g=new THREE.SphereGeometry(.17,7,4,0,Math.PI*2,0,Math.PI/2);g.scale(1,.25,1);g.translate(0,0,.13);g.rotateY(k*Math.PI*2/5);g.rotateX(.65);petals.push(g);}
  const center=new THREE.CylinderGeometry(.012,.015,.20,5);center.rotateX(Math.PI/2);petals.push(center);
  const flowerGeo=mergeGeometries(petals),spots=[],m=new THREE.Matrix4(),q=new THREE.Quaternion();
  for(let x=-115;x<=130;x+=2.2)for(const z of [43,53]){
    const px=x+(rnd()-.5),pz=z+(rnd()-.5);if(!L.keepOffBuilt(px,pz))continue;
    for(let k=0;k<3;k++)spots.push({x:px+(rnd()-.5)*.7,z:pz+(rnd()-.5)*.7,y:L.terrainHeight(px,pz)+.45+rnd()*.35});
  }
  const stems=new THREE.InstancedMesh(new THREE.CylinderGeometry(.014,.024,1,5),new THREE.MeshStandardMaterial({color:0x387f38,roughness:1}),spots.length);
  spots.forEach((p,i)=>{const base=L.terrainHeight(p.x,p.z),height=p.y-base;m.makeScale(1,height,1);m.setPosition(p.x,base+height/2,p.z);stems.setMatrixAt(i,m);});stems.computeBoundingSphere();scene.add(stems);
  const flowers=[];
  for(const [k,color] of [[0,0xeb3c56],[1,0xf578a0]]){const list=spots.filter((_,i)=>i%2===k),mat=new THREE.MeshStandardMaterial({color,roughness:.85,side:THREE.DoubleSide});
    const im=new THREE.InstancedMesh(flowerGeo,mat,list.length);list.forEach((p,i)=>{q.setFromEuler(new THREE.Euler(-.3,rnd()*6.28,0));im.setMatrixAt(i,m.compose(new THREE.Vector3(p.x,p.y,p.z),q,new THREE.Vector3(1,1,1)));});im.computeBoundingSphere();scene.add(im);flowers.push(im);}
  return {...vegetation,flowers,flowerSpots:spots};
}
