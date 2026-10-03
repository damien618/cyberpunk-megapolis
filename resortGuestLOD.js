import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// A complete, posed silhouette remains visible from the beach. At that scale
// facial topology and toes add cost without affecting the image.
export function addRestaurantGuestLOD(visitor) {
  let rig=null;
  visitor.group.traverse(o=>{if(!rig&&o.isSkinnedMesh&&['Head','LeftLeg','RightLeg'].every(n=>o.skeleton.bones.some(b=>b.name===n)))rig=o;});
  if(!rig)return null;
  const skin=visitor.group.getObjectByName('Wardrobe_BareLegs')?.material.color.clone()??new THREE.Color(0xbb8769);
  let shirt=new THREE.Color(0xeaddc6);
  const map=rig.material?.map;
  if(map?.image){
    const canvas=document.createElement('canvas');canvas.width=canvas.height=32;
    const ctx=canvas.getContext('2d',{willReadFrequently:true}),img=map.image;
    ctx.drawImage(img,0,img.height/2,img.width/2,img.height/2,0,0,32,32);
    const p=ctx.getImageData(0,0,32,32).data;let r=0,g=0,b=0;
    for(let i=0;i<p.length;i+=4){r+=p[i];g+=p[i+1];b+=p[i+2];}
    shirt.setRGB(r/(1024*255),g/(1024*255),b/(1024*255),THREE.SRGBColorSpace);
  }
  const pants=new THREE.Color(visitor.staff?0x283638:0x21444b),parts=[];
  const index=name=>rig.skeleton.bones.findIndex(b=>b.name===name),inv=rig.bindMatrix.clone().invert();
  const at=name=>new THREE.Vector3().setFromMatrixPosition(rig.skeleton.boneInverses[index(name)].clone().invert().premultiply(inv));
  function part(g,color,bone){
    const geo=g.index?g.toNonIndexed():g,n=geo.attributes.position.count,colors=new Float32Array(n*3),indices=new Uint16Array(n*4),weights=new Float32Array(n*4);
    for(let i=0;i<n;i++){colors.set([color.r,color.g,color.b],i*3);indices[i*4]=index(bone);weights[i*4]=1;}
    geo.setAttribute('color',new THREE.BufferAttribute(colors,3));geo.setAttribute('skinIndex',new THREE.BufferAttribute(indices,4));geo.setAttribute('skinWeight',new THREE.BufferAttribute(weights,4));parts.push(geo);
  }
  function limb(start,end,r0,r1,color,from=0,to=1){
    if(index(start)<0||index(end)<0)return;
    const a=at(start),b=at(end),p=a.clone().lerp(b,from),q=a.clone().lerp(b,to),direction=q.clone().sub(p);
    const g=new THREE.CylinderGeometry(r1,r0,direction.length(),7,1);g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),direction.normalize()));g.translate(...p.add(q).multiplyScalar(.5).toArray());part(g,color,start);
  }
  limb('Hips','Spine2',.14,.22,shirt);limb('Spine2','Neck',.20,.12,shirt);
  const head=at('Head');head.y+=.085;
  const hg=new THREE.SphereGeometry(1,8,6);hg.scale(.09,.125,.09);hg.translate(...head.toArray());part(hg,skin,'Head');
  if(visitor.group.name==='fare-chef'){const hat=new THREE.CylinderGeometry(.10,.095,.19,8);hat.translate(head.x,head.y+.19,head.z);part(hat,new THREE.Color(0xf5eddc),'Head');}
  for(const side of ['Left','Right']){
    limb(side+'Arm',side+'ForeArm',.075,.062,shirt,0,.43);
    limb(side+'Arm',side+'ForeArm',.063,.044,skin,.43,1);
    limb(side+'ForeArm',side+'Hand',.044,.032,skin);
    limb(side+'UpLeg',side+'Leg',.093,.075,pants,0,visitor.staff?1:.82);
    if(!visitor.staff)limb(side+'UpLeg',side+'Leg',.075,.060,skin,.82,1);
    limb(side+'Leg',side+'Foot',.060,.030,visitor.staff?pants:skin);
    const foot=at(side+'Foot');foot.z+=.045;foot.y-=.015;
    const fg=new THREE.SphereGeometry(1,7,4);fg.scale(.043,.03,.095);fg.translate(...foot.toArray());part(fg,visitor.staff?pants:skin,side+'Foot');
  }
  const mesh=new THREE.SkinnedMesh(mergeGeometries(parts,false),new THREE.MeshStandardMaterial({vertexColors:true,roughness:.87}));
  mesh.name='fare-guest-distant';mesh.bindMode=rig.bindMode;mesh.bind(rig.skeleton,rig.bindMatrix);mesh.bindMatrixInverse.copy(rig.bindMatrixInverse);
  mesh.position.copy(rig.position);mesh.quaternion.copy(rig.quaternion);mesh.scale.copy(rig.scale);mesh.receiveShadow=true;mesh.visible=false;mesh.frustumCulled=false;rig.parent.add(mesh);parts.forEach(g=>g.dispose());
  visitor.group.updateMatrixWorld(true);
  mesh.boundingSphere=new THREE.Sphere(new THREE.Vector3(visitor.group.position.x,visitor.group.position.y+.8,visitor.group.position.z),1.4).applyMatrix4(mesh.matrixWorld.clone().invert());
  mesh.frustumCulled=true;
  const detailed=[];visitor.group.traverse(o=>{if(o.isMesh&&o!==mesh)detailed.push({mesh:o,visible:o.visible});});
  return {update(distance){const far=distance>34;mesh.visible=far;for(const o of detailed)o.mesh.visible=!far&&o.visible;},mesh};
}
