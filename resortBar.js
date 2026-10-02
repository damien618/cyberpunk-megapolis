import * as THREE from 'three';
import { localPoint } from './resortLayout.js';

// An open pavilion: keep both approach stairs and the central aisle clear.
export function buildResortBar({b,batch,materials,group,lantern}) {
  const box=(mat,x,y,z,w,h,d,flags={})=>{const p=localPoint(b,x,z);batch.box(mat,p.x,b.y+y,p.z,w,h,d,b.yaw,{detail:true,...flags});};
  const post=(mat,x,y,z,w,h)=>{const p=localPoint(b,x,z);batch.post(mat,p.x,b.y+y,p.z,w,h,w,b.yaw,{detail:true});};
  // Pale mineral top, sea-green slats, recessed toe kick and brass foot rail.
  box('barFrame',0,.53,-.5,7.5,1.06,1.05,{solid:true});
  box('barStone',0,1.12,-.5,7.9,.16,1.3,{solid:true});
  for(let i=0;i<38;i++)box('barSlats',-3.65+i*.197,.62,.045,.15,.86,.065);
  box('brass',0,.26,.25,7.3,.045,.045);
  for(const x of [-3.3,0,3.3])box('brass',x,.14,.25,.045,.28,.045);
  // Back bar with open shelving, visible through the pavilion.
  box('barSlats',0,1.25,-3.8,8.2,2.5,.12,{solid:true});
  for(const y of [.55,1.25,1.95])box('barShelf',0,y,-3.48,8.3,.09,.62);
  for(const x of [-4.08,-1.35,1.35,4.08])box('barFrame',x,1.28,-3.5,.11,2.55,.68);
  for(let row=0;row<3;row++)for(let i=0;i<14;i++){
    const x=-3.8+i*.58,y=.55+row*.7;
    post(i%4?'bottle':'fruit',x,y+.21,-3.45,.105,.32);
    post('brass',x,y+.41,-3.45,.048,.10);
    box('linen',x,y+.2,-3.386,.073,.10,.014);
  }
  // Serviceware and fruit bring small highlights to the countertop.
  for(const x of [-2.8,-1.8,2.2,2.7]){
    post('ceramic',x,1.31,-.28,.12,.22);
    post('fruit',x,1.45,-.28,.11,.04);
    box('brass',x+.035,1.56,-.28,.012,.22,.012,{rz:-.2});
  }
  box('barFrame',.65,1.23,-.48,.72,.05,.44);
  for(let i=0;i<5;i++)post(i%2?'fruit':'green',.38+i*.13,1.33,-.48,.13,.13);
  // Tall tables sit off the entrance axis, with stools fitted to their height.
  for(const x of [-3.4,3.4]){
    box('barStone',x,1.03,5.8,1.35,.10,1.35,{solid:true});
    post('barFrame',x,.5,5.8,.17,1);
    box('barFrame',x,.06,5.8,.8,.12,.8);
    for(const dx of [-.95,.95]){
      box('barShelf',x+dx,.69,5.8,.55,.12,.55,{solid:true});
      for(const sx of [-.19,.19])for(const sz of [-.19,.19])box('barFrame',x+dx+sx,.32,5.8+sz,.055,.64,.055);
      box('brass',x+dx,.28,5.8,.44,.035,.035);
    }
    post('ceramic',x-.2,1.18,5.8,.12,.20);post('fruit',x+.22,1.19,5.8,.16,.19);
  }
  // Compact fascia at eave height, above headroom rather than across the view.
  const canvas=Object.assign(document.createElement('canvas'),{width:1024,height:256}),g=canvas.getContext('2d');
  g.fillStyle='#173f40';g.fillRect(0,0,1024,256);g.strokeStyle='#d9bb7b';g.lineWidth=4;g.strokeRect(18,18,988,220);
  g.textAlign='center';g.fillStyle='#f4e5c5';g.font='54px Georgia';g.fillText('L A G O N',512,112);
  g.fillStyle='#d9bb7b';g.font='23px sans-serif';g.fillText('BAR  ·  COCKTAILS DU PACIFIQUE',512,174);
  const tex=new THREE.CanvasTexture(canvas);tex.colorSpace=THREE.SRGBColorSpace;tex.anisotropy=4;
  const sign=new THREE.Mesh(new THREE.BoxGeometry(3.4,.58,.10),[
    materials.barFrame,materials.barFrame,materials.barFrame,materials.barFrame,
    new THREE.MeshStandardMaterial({map:tex,roughness:.7}),materials.barFrame]);
  const p=localPoint(b,0,b.d/2+.85);sign.position.set(p.x,b.y+2.52,p.z);sign.rotation.y=b.yaw;sign.name='lagon-sign';sign.castShadow=true;group.add(sign);
  for(const x of [-1.4,1.4])box('brass',x,2.91,b.d/2+.85,.035,.22,.035);
  for(const x of [-3,3]){const p=localPoint(b,x,1.6);lantern(p.x,b.y+2.4,p.z);}
}
