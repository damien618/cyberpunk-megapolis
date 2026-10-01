import * as THREE from 'three';
import { islandHeight } from './islandRelief.js';
export function buildResortBackdrop(scene) {
  const group=new THREE.Group();group.name='resort_backdrop';scene.add(group);
  const g=new THREE.PlaneGeometry(920,780,112,96);g.rotateX(-Math.PI/2);
  const p=g.attributes.position,col=[];
  for(let i=0;i<p.count;i++){
    const x=p.getX(i),z=p.getZ(i),base=islandHeight(x,z);
    const spire=75*Math.pow(Math.max(0,1-Math.hypot(x+52,z+38)/52),1.4)+45*Math.pow(Math.max(0,1-Math.hypot(x-45,z+25)/44),1.2);
    p.setY(i,base+(base>100?spire:0));
  }
  g.computeVertexNormals();const color=new THREE.Color();
  for(let i=0;i<p.count;i++){const h=p.getY(i),n=g.attributes.normal.getY(i);color.setHex(n<.55?0x48594d:0x397542);if(h>295&&n<.6)color.lerp(new THREE.Color(0x8a9381),.35);color.multiplyScalar(.78+.18*Math.sin(p.getX(i)*.08+p.getZ(i)*.07)+.08*Math.cos(h*.12));col.push(color.r,color.g,color.b);}
  g.setAttribute('color',new THREE.Float32BufferAttribute(col,3));
  const mountain=new THREE.Mesh(g,new THREE.MeshStandardMaterial({vertexColors:true,roughness:1}));mountain.position.set(-150,-8,600);mountain.rotation.y=.32;group.add(mountain);
  const sand=new THREE.MeshStandardMaterial({color:0xeae2c1,roughness:1}),green=new THREE.MeshStandardMaterial({color:0x3f7b42,roughness:1});
  for(const [x,z,r] of [[-390,-370,36],[330,-470,24],[560,-620,31]]){
    const islet=new THREE.Mesh(new THREE.SphereGeometry(1,24,10),sand);islet.position.set(x,-1.6,z);islet.scale.set(r,4,r*.55);group.add(islet);
    const trees=new THREE.Mesh(new THREE.SphereGeometry(1,16,8),green);trees.position.set(x,2.5,z);trees.scale.set(r*.7,4,r*.32);group.add(trees);
  }
  return {group,mountain};
}
