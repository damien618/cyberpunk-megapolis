import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { seededRandom,terrainHeight,depthAt,BUNGALOWS,localPoint } from './resortLayout.js';
import { addCaustics } from './resortTerrain.js';
export function buildResortCorals(scene) {
  const rnd=seededRandom(81919),group=new THREE.Group();group.name='coral_gardens';scene.add(group);
  // Branching coral: two rings of tilted fingers. Brain coral: a squashed, lumpy dome. Table coral: a plate on a foot.
  const branchParts=[];
  for(let i=0;i<10;i++){const a=i*2.4,tilt=.25+(i%3)*.17,g=new THREE.CylinderGeometry(.035,.075,.5+(i%4)*.1,5);g.translate(0,.25,0);g.rotateZ(tilt);g.rotateY(a);g.translate(Math.cos(a)*.08,.02,-Math.sin(a)*.08);branchParts.push(g);}
  const brain=new THREE.IcosahedronGeometry(.6,2),bp=brain.attributes.position;
  for(let i=0;i<bp.count;i++){const x=bp.getX(i),y=bp.getY(i),z=bp.getZ(i),k=1+.07*Math.sin(x*14)*Math.sin(y*13+z*11);bp.setXYZ(i,x*k,Math.max(-.1,y)*k,z*k);}
  brain.computeVertexNormals();
  const plate=mergeGeometries([new THREE.CylinderGeometry(.65,.6,.07,12).translate(0,.38,0),new THREE.CylinderGeometry(.08,.14,.38,6).translate(0,.19,0)]);
  const geos=[brain,mergeGeometries(branchParts),plate],anim=[];
  const palette=[[0xc8955a,0xb0607a,0x7f9a4e,0xd9a066],[0xe0506e,0x9a5cc0,0xf08a3c,0xd8708c],[0x5fa882,0xd0a850,0x7aa0b0,0xc07e4c]];
  const TOP=[.8,.75,.45],spots=[]; // tallest point of each shape at scale 1, with its seat offset

  // Reef patches, rather than uniformly isolated stones: leave sandy channels.
  for(let cluster=0;cluster<85;cluster++){
    const cx=(rnd()-.5)*300,cz=-25-rnd()*142;
    for(let j=0;j<9;j++){
      const angle=rnd()*6.28,r=2+rnd()*5,x=cx+Math.cos(angle)*r,z=cz+Math.sin(angle)*r,d=depthAt(x,z);
      if(d<1.2||d>6)continue;
      if(BUNGALOWS.some(b=>{const s=localPoint(b,-b.w/2+.8,b.d/2+b.terrace+2);return Math.hypot(x-s.x,z-s.z)<3;}))continue;
      const k=j%3,sc=.8+rnd()*1.8;spots.push({x,z,k,s:sc,sy:Math.min(1,(d-.45)/(TOP[k]*sc))});
    }
  }
  const m=new THREE.Matrix4(),q=new THREE.Quaternion(),v=new THREE.Vector3();
  geos.forEach((g,k)=>{const list=spots.filter(s=>s.k===k),mat=new THREE.MeshStandardMaterial({color:0xffffff,roughness:.9});anim.push(addCaustics(mat));
    const im=new THREE.InstancedMesh(g,mat,list.length),c=new THREE.Color();list.forEach((a,i)=>{q.setFromAxisAngle(new THREE.Vector3(0,1,0),rnd()*6.28);im.setMatrixAt(i,m.compose(v.set(a.x,terrainHeight(a.x,a.z)+(k===0?.12:.02),a.z),q,new THREE.Vector3(a.s,a.sy,a.s)));im.setColorAt(i,c.setHex(palette[k][Math.floor(rnd()*4)]).multiplyScalar(.85+rnd()*.3));});im.computeBoundingSphere();im.receiveShadow=true;group.add(im);});
  return {group,spots,update(t){anim.forEach(a=>a.update(t));},setStrength(k){anim.forEach(a=>a.strength.value=k);}};
}
