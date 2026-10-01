import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { seededRandom,terrainHeight,depthAt,BUNGALOWS,localPoint } from './resortLayout.js';
import { addCaustics } from './resortTerrain.js';
export function buildResortCorals(scene) {
  const rnd=seededRandom(81919),group=new THREE.Group();group.name='coral_gardens';scene.add(group);
  const branchParts=[];
  for(let i=0;i<7;i++){const g=new THREE.CylinderGeometry(.045,.085,.65,5);g.rotateZ((i-3)*.22);g.translate((i-3)*.11,.3,0);branchParts.push(g);}
  const geos=[new THREE.IcosahedronGeometry(.6,1),mergeGeometries(branchParts),new THREE.SphereGeometry(.65,8,4).scale(1,.18,1)],colors=[0x887154,0xb69a71,0x74977e],anim=[];
  const spots=[];
  // Reef patches, rather than uniformly isolated stones: leave sandy channels.
  for(let cluster=0;cluster<85;cluster++){
    const cx=(rnd()-.5)*300,cz=-25-rnd()*142;
    for(let j=0;j<9;j++){
      const angle=rnd()*6.28,r=2+rnd()*5,x=cx+Math.cos(angle)*r,z=cz+Math.sin(angle)*r,d=depthAt(x,z);
      if(d<1.2||d>6)continue;
      if(BUNGALOWS.some(b=>{const s=localPoint(b,-b.w/2+.8,b.d/2+b.terrace+2);return Math.hypot(x-s.x,z-s.z)<3;}))continue;
      spots.push({x,z,k:j%3,s:.8+rnd()*1.8,sy:Math.min(1,(d-.4)/.8)});
    }
  }
  const m=new THREE.Matrix4(),q=new THREE.Quaternion(),v=new THREE.Vector3();
  geos.forEach((g,k)=>{const list=spots.filter(s=>s.k===k),mat=new THREE.MeshStandardMaterial({color:colors[k],roughness:1});anim.push(addCaustics(mat));
    const im=new THREE.InstancedMesh(g,mat,list.length);list.forEach((a,i)=>{q.setFromAxisAngle(new THREE.Vector3(0,1,0),rnd()*6.28);im.setMatrixAt(i,m.compose(v.set(a.x,terrainHeight(a.x,a.z)+.22,a.z),q,new THREE.Vector3(a.s,a.sy,a.s)));});im.computeBoundingSphere();im.receiveShadow=true;group.add(im);});
  return {group,spots,update(t){anim.forEach(a=>a.update(t));},setStrength(k){anim.forEach(a=>a.strength.value=k);}};
}
