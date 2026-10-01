import * as THREE from 'three';
import { islandHeight } from './islandRelief.js';

// Forest canopy grain, evaluated in world space so the 8 m vertex grid never shows.
function addCanopyGrain(material) {
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vCanopyPos;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvCanopyPos=(modelMatrix*vec4(transformed,1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vCanopyPos;
float canopyHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float canopyNoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
  return mix(mix(canopyHash(i),canopyHash(i+vec2(1,0)),f.x),mix(canopyHash(i+vec2(0,1)),canopyHash(i+vec2(1,1)),f.x),f.y);}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
{vec2 q=vCanopyPos.xz+vCanopyPos.y*vec2(.31,-.27);
 float n=canopyNoise(q*.075)*.45+canopyNoise(q*.27)*.35+canopyNoise(q*.9)*.2;
 float green=smoothstep(.0,.08,diffuseColor.g-diffuseColor.r);
 diffuseColor.rgb*=mix(.92+.16*n,.62+.7*n,green);}`);
  };
  return material;
}

export function buildResortBackdrop(scene) {
  const group=new THREE.Group();group.name='resort_backdrop';scene.add(group);
  const g=new THREE.PlaneGeometry(920,780,112,96);g.rotateX(-Math.PI/2);
  const p=g.attributes.position,col=[];
  for(let i=0;i<p.count;i++){
    const x=p.getX(i),z=p.getZ(i),base=islandHeight(x,z);
    // One basalt crest, rounded at the top, instead of two needles on a cone.
    const crest=48*Math.pow(Math.max(0,1-Math.hypot((x+52)/1.25,z+38)/60),1.9);
    p.setY(i,base+(base>110?crest*Math.min(1,(base-110)/40):0));
  }
  g.computeVertexNormals();
  const forest=new THREE.Color(0x24561f),forestLight=new THREE.Color(0x3d7a2a),ridge=new THREE.Color(0x355a2a),
    rock=new THREE.Color(0x4f4b42),beach=new THREE.Color(0xd9cfa8),c=new THREE.Color();
  for(let i=0;i<p.count;i++){
    const x=p.getX(i),z=p.getZ(i),h=p.getY(i),ny=g.attributes.normal.getY(i);
    const patch=.5+.5*Math.sin(x*.031+Math.cos(z*.027)*2.1)*Math.cos(z*.023-x*.011);
    c.copy(forest).lerp(forestLight,patch*.75).lerp(ridge,THREE.MathUtils.smoothstep(h,150,280)*.6);
    // Bare rock only on true cliffs; vegetation clings to everything else.
    c.lerp(rock,THREE.MathUtils.smoothstep(.5-ny,0,.22)*(.55+.45*THREE.MathUtils.smoothstep(h,80,200)));
    if(h<2.5)c.lerp(beach,THREE.MathUtils.smoothstep(2.5-h,0,2.5));
    col.push(c.r,c.g,c.b);
  }
  g.setAttribute('color',new THREE.Float32BufferAttribute(col,3));
  const mountain=new THREE.Mesh(g,addCanopyGrain(new THREE.MeshStandardMaterial({vertexColors:true,roughness:.95})));
  mountain.position.set(-150,-8,600);mountain.rotation.y=.32;group.add(mountain);
  // Motus: a low sand ring, a green crown and a fringe of palm silhouettes.
  const sand=new THREE.MeshStandardMaterial({color:0xeae2c1,roughness:1}),green=addCanopyGrain(new THREE.MeshStandardMaterial({color:0x3a7a35,roughness:1}));
  const trunkGeo=new THREE.CylinderGeometry(.25,.4,1,5);trunkGeo.translate(0,.5,0);
  const crownGeo=new THREE.ConeGeometry(1,.35,7);crownGeo.translate(0,1,0);
  const motus=[[-390,-370,36],[330,-470,24],[560,-620,31]],palmCount=motus.reduce((n,[, ,r])=>n+Math.round(r*.9),0);
  const trunks=new THREE.InstancedMesh(trunkGeo,new THREE.MeshStandardMaterial({color:0x7a6a55,roughness:1}),palmCount);
  const crowns=new THREE.InstancedMesh(crownGeo,new THREE.MeshStandardMaterial({color:0x2f6a2a,roughness:1}),palmCount);
  const m=new THREE.Matrix4(),q=new THREE.Quaternion(),e=new THREE.Euler();let k=0;
  for(const [x,z,r] of motus){
    const islet=new THREE.Mesh(new THREE.SphereGeometry(1,28,8),sand);islet.position.set(x,-1.2,z);islet.scale.set(r,2.6,r*.55);group.add(islet);
    const trees=new THREE.Mesh(new THREE.SphereGeometry(1,20,8),green);trees.position.set(x,.6,z);trees.scale.set(r*.62,5.5,r*.3);group.add(trees);
    for(let j=0,n=Math.round(r*.9);j<n;j++){
      const a=j/n*Math.PI*2+Math.sin(j*7.3)*.2,rr=.7+.12*Math.sin(j*3.1),px=x+Math.cos(a)*r*rr*.92,pz=z+Math.sin(a)*r*.55*rr*.92,h=9+4*Math.abs(Math.sin(j*5.7));
      e.set(Math.sin(j*2.3)*.18,0,Math.cos(j*1.7)*.18);q.setFromEuler(e);
      m.compose(new THREE.Vector3(px,.4,pz),q,new THREE.Vector3(1,h,1));trunks.setMatrixAt(k,m);
      m.compose(new THREE.Vector3(px,.4,pz),q,new THREE.Vector3(4.2,h,4.2));crowns.setMatrixAt(k,m);k++;
    }
  }
  trunks.computeBoundingSphere();crowns.computeBoundingSphere();group.add(trunks,crowns);
  return {group,mountain};
}
