import * as THREE from 'three';
import { BUILDINGS,HAMMOCK,localPoint,terrainHeight,BOUNDS } from './resortLayout.js';
export function buildResortProps({scene,batch,materials}) {
  const lanterns=[],group=new THREE.Group();scene.add(group);
  function box(b,mat,x,y,z,w,h,d,flags={}){const p=localPoint(b,x,z);batch.box(mat,p.x,b.y+y,p.z,w,h,d,b.yaw,{detail:true,...flags});}
  function lantern(x,y,z){batch.post('metal',x,y,z,.17,.38,.17);batch.post('lantern',x,y+.02,z,.13,.25,.13);lanterns.push({x,y:y+.02,z});}
  for(const b of BUILDINGS){
    const room=['water','garden'].includes(b.kind);
    if(room){
      box(b,'wood',0,.23,-.8,2.6,.45,3.1,{solid:true});box(b,'linen',0,.54,-.8,2.6,.24,3.1);
      box(b,'linen',-.65,.72,-1.75,.8,.2,.48);box(b,'linen',.65,.72,-1.75,.8,.2,.48);
      const tx=-b.w/2+1.25;
      box(b,'wood',tx,.28,b.d/2+.8,2.3,.45,.9,{solid:true});box(b,'linen',tx,.56,b.d/2+.8,2.25,.16,.85);
      box(b,'linen',tx,.86,b.d/2+.45,2.25,.65,.18);box(b,'blue',tx+.7,.85,b.d/2+.7,.42,.42,.16);
      const chairs=b.premium?[-2.6,-.9]:[-1.45,1.45];
      for(const x of chairs){box(b,'wood',x,.28,b.d/2+b.terrace-1.2,.7,.12,1.75,{solid:true});box(b,'linen',x,.38,b.d/2+b.terrace-1.2,.66,.1,1.65);
        box(b,'linen',x,.62,b.d/2+b.terrace-1.85,.66,.12,.65,{rx:.55});}
      // Garden terraces lead directly to the front door: keep their centre clear.
      const tableX=b.kind==='garden'?2:b.premium?-1.7:0,tableZ=b.kind==='garden'?2.2:b.d/2+b.terrace-1.4;
      box(b,'wood',tableX,.35,tableZ,.65,.09,.65,{solid:true});box(b,'wood',tableX,.18,tableZ,.1,.36,.1);
      box(b,'wood',tableX,.42,tableZ,.45,.035,.38);
      for(let i=0;i<4;i++)box(b,i%2?'pink':'fruit',tableX-.14+i*.09,.5,tableZ+.07*Math.sin(i),.13,.13,.13);
    }else{
      box(b,'wood',0,.65,0,b.kind==='restaurant'?4:b.w*.6,1.3,1,{solid:true});
      if(b.kind==='restaurant')for(const x of [-6,-2,2,6]){
        box(b,'wood',x,.72,3,1.8,.12,1.8,{solid:true});box(b,'wood',x,.35,3,.15,.7,.15);
        for(const s of [-1,1])box(b,'linen',x+s*1.1,.48,3,.6,.16,.6,{solid:true});
      }
      const canvas=Object.assign(document.createElement('canvas'),{width:512,height:128}),ctx=canvas.getContext('2d');ctx.fillStyle='#ded0ae';ctx.fillRect(0,0,512,128);ctx.fillStyle='#463722';ctx.font='40px serif';ctx.textAlign='center';ctx.fillText({reception:'MAEVA · Accueil',restaurant:'FARE · Restaurant',bar:'LAGON · Bar'}[b.kind],256,80);
      const tex=new THREE.CanvasTexture(canvas);tex.colorSpace=THREE.SRGBColorSpace;
      const sign=new THREE.Mesh(new THREE.PlaneGeometry(b.w*.65,1.2),new THREE.MeshStandardMaterial({map:tex,side:THREE.DoubleSide}));const p=localPoint(b,0,b.d/2+.11);sign.position.set(p.x,b.y+2,p.z);sign.rotation.y=b.yaw;group.add(sign);
    }
    const p=localPoint(b,b.w/2-.35,b.d/2);lantern(p.x,b.y+1.8,p.z);
  }
  for(let x=-110;x<=125;x+=15){const z=45,y=terrainHeight(x,z);batch.post('wood',x,y+.55,z,.09,1.1,.09);lantern(x,y+1.2,z);}
  for(let x of [-65,65])for(let z=-20;z>-145;z-=22)lantern(x,2.25,z);
  // A discreet buoy line makes the offshore swimming limit readable.
  const buoyPoints=[];
  for(let x=BOUNDS.x0+10;x<BOUNDS.x1;x+=22){batch.post('fruit',x,.12,BOUNDS.z0+8,.22,.25,.22);buoyPoints.push(new THREE.Vector3(x,.08,BOUNDS.z0+8));}
  group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(buoyPoints),new THREE.LineBasicMaterial({color:0xa7b7a1,transparent:true,opacity:.55})));
  // Catenary hammock; same reference frame is used by the player and the fabric.
  const hg=new THREE.PlaneGeometry(5.4,1.6,32,8);hg.rotateX(-Math.PI/2);
  const hp=hg.attributes.position;for(let i=0;i<hp.count;i++)hp.setY(i,.6*Math.pow(hp.getX(i)/2.7,2)+.06*Math.pow(hp.getZ(i)/.8,2));hg.computeVertexNormals();
  const hammock=new THREE.Mesh(hg,materials.linen);hammock.position.set(HAMMOCK.x,HAMMOCK.y,HAMMOCK.z);hammock.receiveShadow=true;hammock.castShadow=true;group.add(hammock);
  for(const s of [-1,1]){const curve=new THREE.LineCurve3(new THREE.Vector3(HAMMOCK.x+s*2.7,HAMMOCK.y+.6,HAMMOCK.z),new THREE.Vector3(HAMMOCK.x+s*3,HAMMOCK.y+.75,HAMMOCK.z));group.add(new THREE.Mesh(new THREE.TubeGeometry(curve,1,.025,5,false),materials.linen));}
  const boats=[];
  for(const [x,z,yaw] of [[-135,-14,.3],[130,-20,-.4]]){
    const boat=new THREE.Group(),g=new THREE.SphereGeometry(1,20,10,0,Math.PI*2,Math.PI/2,Math.PI/2);
    const hull=new THREE.Mesh(g,materials.wood);hull.scale.set(.65,.65,3.4);boat.add(hull);
    for(const zz of [-1.7,1.7]){const beam=new THREE.Mesh(new THREE.BoxGeometry(2.5,.1,.12),materials.wood);beam.position.set(.8,.15,zz);boat.add(beam);}
    const float=new THREE.Mesh(new THREE.SphereGeometry(1,12,6),materials.wood);float.scale.set(.16,.14,2.8);float.position.set(1.8,-.05,0);boat.add(float);
    boat.position.set(x,0,z);boat.rotation.y=yaw;scene.add(boat);boats.push(boat);
  }
  return {group,lanterns,hammock,boats,update(t,ocean){hammock.rotation.x=Math.sin(t*.75)*.012;boats.forEach(b=>{b.position.y=ocean.waterHeightAt(b.position.x,b.position.z,t)+.16;b.rotation.z=Math.sin(t*.65+b.position.x)*.018;});}};
}
