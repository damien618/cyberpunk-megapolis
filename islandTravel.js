import * as THREE from 'three';
import { travelURL } from './islandGeography.js';
export function pathDistanceTo(points,x,z) {
  let best=Infinity;
  for(let i=0;i<points.length-1;i++){const [ax,az]=points[i],[bx,bz]=points[i+1],dx=bx-ax,dz=bz-az,t=Math.max(0,Math.min(1,((x-ax)*dx+(z-az)*dz)/(dx*dx+dz*dz)));best=Math.min(best,Math.hypot(x-ax-t*dx,z-az-t*dz));}
  return best;
}
export function createIslandPath(scene,points,heightAt) {
  const positions=[],indices=[];
  for(let i=0;i<points.length-1;i++){
    const [ax,az]=points[i],[bx,bz]=points[i+1],length=Math.hypot(bx-ax,bz-az),nx=-(bz-az)/length,nz=(bx-ax)/length,n=Math.ceil(length);
    for(let k=0;k<n;k++){
      const base=positions.length/3;
      for(const t of [k/n,(k+1)/n])for(const s of [-1,1]){const x=ax+(bx-ax)*t+nx*s,z=az+(bz-az)*t+nz*s;positions.push(x,heightAt(x,z)+.035,z);}
      indices.push(base,base+2,base+1,base+1,base+2,base+3);
    }
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setIndex(indices);g.computeVertexNormals();const mesh=new THREE.Mesh(g,new THREE.MeshStandardMaterial({color:0xb8a386,roughness:1,side:THREE.DoubleSide}));mesh.receiveShadow=true;scene.add(mesh);return mesh;
}
export function createIslandSign(scene,{x,z,y,label,yaw=0}) {
  const g=new THREE.Group();g.position.set(x,y,z);g.rotation.y=yaw;
  const mat=new THREE.MeshStandardMaterial({color:0x92704c,roughness:1});
  for(const px of [-.8,.8]){const post=new THREE.Mesh(new THREE.BoxGeometry(.12,1.9,.12),mat);post.position.set(px,.8,0);g.add(post);}
  const canvas=Object.assign(document.createElement('canvas'),{width:512,height:128}),ctx=canvas.getContext('2d');ctx.fillStyle='#d6bc8a';ctx.fillRect(0,0,512,128);ctx.fillStyle='#3d4d35';ctx.font='30px sans-serif';ctx.textAlign='center';ctx.fillText(label,256,57);ctx.font='22px sans-serif';ctx.fillText('E · Emprunter le sentier',256,95);
  const t=new THREE.CanvasTexture(canvas);t.colorSpace=THREE.SRGBColorSpace;
  const sign=new THREE.Mesh(new THREE.BoxGeometry(2.7,.7,.1),new THREE.MeshStandardMaterial({map:t,roughness:1}));sign.position.y=1.25;g.add(sign);scene.add(g);return g;
}
export function createIslandTravel({gate,map,arrival,getTime,onLeave=()=>{}}) {
  let leaving=false;
  const fade=document.createElement('div');Object.assign(fade.style,{position:'fixed',inset:'0',background:'#071219',opacity:'0',pointerEvents:'none',zIndex:'35',transition:'opacity .55s'});document.body.appendChild(fade);
  const near=pos=>Math.hypot(pos.x-gate.x,pos.z-gate.z)<gate.r;
  function go(){if(leaving)return;leaving=true;onLeave();fade.style.opacity='1';setTimeout(()=>{location.href=travelURL(map,arrival,getTime());},650);}
  return {near,go,get leaving(){return leaving;},url:()=>travelURL(map,arrival,getTime())};
}
