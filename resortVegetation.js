import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { buildJungleVegetation } from './jungleVegetation.js';
import * as L from './resortLayout.js';
export function buildResortVegetation({scene,maxAniso,collision}) {
  const rnd=L.seededRandom(62719),vegetation=buildJungleVegetation({scene,rnd,maxAniso,layout:L,rules:{region:{x0:-154,x1:154,z0:10,z1:86},keepOffBuilt:L.keepOffBuilt,explicitPalms:L.HAMMOCK_PALMS,beds:[43,53]}});
  for(const c of vegetation.colliders)collision.addBox((c.x0+c.x1)/2,(c.y0+c.y1)/2,(c.z0+c.z1)/2,c.x1-c.x0,c.y1-c.y0,c.z1-c.z0,0,{camBlock:false});
  const petals=[];
  for(let k=0;k<5;k++){const g=new THREE.SphereGeometry(.17,5,2,0,Math.PI*2,0,Math.PI/2);g.scale(1,.25,1);g.translate(0,0,.13);g.rotateY(k*Math.PI*2/5);g.rotateX(.65);petals.push(g);}
  const center=new THREE.CylinderGeometry(.012,.015,.20,5);center.rotateX(Math.PI/2);petals.push(center);
  const flowerGeo=mergeGeometries(petals),spots=[],m=new THREE.Matrix4(),q=new THREE.Quaternion(),up=new THREE.Vector3(0,1,0),n=new THREE.Vector3();
  // Hibiscus blooms sit in the bed shrubs (bushGeo: lobe of radius s, squashed to .62 s, centred .3 s up),
  // facing out of the foliage; no bare stems.
  for(const b of vegetation.spots.bushes){
    const inBed=[43,53].some(z=>Math.abs(b.z-z)<.01);if(!inBed&&rnd()>.3)continue;
    for(let k=0,count=inBed?6:3;k<count;k++){const a=rnd()*6.28,e=.3+rnd()*.95;
      n.set(Math.cos(e)*Math.cos(a),Math.sin(e)/.62,Math.cos(e)*Math.sin(a)).normalize();
      spots.push({x:b.x+Math.cos(e)*Math.cos(a)*b.s*.97,y:b.y+b.s*(.3+.62*Math.sin(e))+.01,z:b.z+Math.cos(e)*Math.sin(a)*b.s*.97,n:n.clone(),s:.38+rnd()*.14,spin:rnd()*6.28});}
  }
  const flowers=[],spin=new THREE.Quaternion();
  for(const [k,color] of [[0,0xe0283f],[1,0xf2668f]]){const list=spots.filter((_,i)=>i%2===k),mat=new THREE.MeshStandardMaterial({color,roughness:.7,side:THREE.DoubleSide});
    const im=new THREE.InstancedMesh(flowerGeo,mat,list.length);list.forEach((p,i)=>{q.setFromUnitVectors(up,p.n).multiply(spin.setFromAxisAngle(up,p.spin));im.setMatrixAt(i,m.compose(new THREE.Vector3(p.x,p.y,p.z),q,new THREE.Vector3(p.s,p.s,p.s)));});im.computeBoundingSphere();scene.add(im);flowers.push(im);}
  return {...vegetation,flowers,flowerSpots:spots};
}
