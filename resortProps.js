import * as THREE from 'three';
import { buildResortBar } from './resortBar.js';
import { createResortFurniture } from './resortFurniture.js';
import { buildResortRestaurant } from './resortRestaurant.js';
import { buildReceptionDecor } from './resortReceptionDecor.js';
import { buildResortGallery } from './resortGallery.js';
import { BUILDINGS,HAMMOCK,localPoint,terrainHeight,BOUNDS } from './resortLayout.js';
export function buildResortProps({scene,batch,materials}) {
  const restaurantEffects=[],lanterns=[],group=new THREE.Group();scene.add(group);
  const furniture=createResortFurniture({group,batch,materials});let roomIndex=0,gallery=null;
  function box(b,mat,x,y,z,w,h,d,flags={}){const p=localPoint(b,x,z);batch.box(mat,p.x,b.y+y,p.z,w,h,d,b.yaw,{detail:true,...flags});}
  function lantern(x,y,z){batch.post('metal',x,y,z,.17,.38,.17);batch.post('lantern',x,y+.02,z,.13,.25,.13);lanterns.push({x,y:y+.02,z});}
  for(const b of BUILDINGS){
    const room=['water','garden'].includes(b.kind);
    if(room){
      furniture.room(b,roomIndex++);
      // Garden terraces lead directly to the front door: keep their centre clear.
      const tableX=b.kind==='garden'?2:b.premium?-1.7:0,tableZ=b.kind==='garden'?2.2:b.d/2+b.terrace-1.4;
      box(b,'wood',tableX,.35,tableZ,.65,.09,.65,{solid:true});box(b,'wood',tableX,.18,tableZ,.1,.36,.1);
      box(b,'wood',tableX,.42,tableZ,.45,.035,.38);
      for(let i=0;i<4;i++)box(b,i%2?'pink':'fruit',tableX-.14+i*.09,.5,tableZ+.07*Math.sin(i),.13,.13,.13);
    }else if(b.kind==='bar'){
      buildResortBar({b,batch,materials,group,lantern});
    }else if(b.kind==='restaurant'){
      restaurantEffects.push(buildResortRestaurant({b,batch,materials,group,lantern}));
    }else if(b.kind==='gallery'){
      gallery=buildResortGallery({b,batch,materials,group});
      lanterns.push({x:b.x,y:b.y+3,z:b.z,intensityScale:.08});
    }else{
      if(b.kind==='reception'){
        box(b,'barFrame',0,.53,0,b.w*.6,1.06,1,{solid:true});
        box(b,'barStone',0,1.12,0,b.w*.6+.18,.12,1.12,{solid:true});
        // Registration books and two small desk lamps for the welcome team.
        for(const x of [-2.2,2.2]){
          box(b,'barShelf',x,1.2,.10,.42,.045,.32);
          box(b,'linen',x,1.23,.10,.36,.018,.26);
          box(b,'brass',x+.65,1.34,-.18,.035,.38,.035);
          box(b,'linen',x+.65,1.55,-.18,.26,.16,.20);
        }
        buildReceptionDecor({b,batch,materials,group});
      }else box(b,'wood',0,.65,0,4,1.3,1,{solid:true});
      const canvas=Object.assign(document.createElement('canvas'),{width:512,height:128}),ctx=canvas.getContext('2d');ctx.fillStyle='#ded0ae';ctx.fillRect(0,0,512,128);ctx.fillStyle='#463722';ctx.font='40px serif';ctx.textAlign='center';ctx.fillText({reception:'MAEVA · Accueil',restaurant:'FARE · Restaurant',bar:'LAGON · Bar'}[b.kind],256,80);
      const tex=new THREE.CanvasTexture(canvas);tex.colorSpace=THREE.SRGBColorSpace;
      const reception=b.kind==='reception';
      const sign=new THREE.Mesh(new THREE.PlaneGeometry(reception?4.6:b.w*.65,reception?.65:1.2),new THREE.MeshStandardMaterial({map:tex,side:THREE.DoubleSide}));const p=localPoint(b,0,b.d/2+.11);sign.position.set(p.x,b.y+(reception?3.12:2),p.z);sign.rotation.y=b.yaw;sign.name=`${b.kind}-sign`;group.add(sign);batch.addDetailMesh(sign,85);
      if(reception)for(const x of [-1.9,1.9])box(b,'brass',x,3.49,b.d/2+.11,.035,.28,.035,{detail:true});
    }
    if(b.kind!=='gallery'){const p=localPoint(b,b.w/2-.35,b.d/2);lantern(p.x,b.y+1.8,p.z);}
  }
  const furnitureRecords=furniture.finish();
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
  return {group,lanterns,gallery,hammock,boats,furniture:furnitureRecords,update(t,ocean){restaurantEffects.forEach(effect=>effect.update(t));hammock.rotation.x=Math.sin(t*.75)*.012;boats.forEach(b=>{b.position.y=ocean.waterHeightAt(b.position.x,b.position.z,t)+.16;b.rotation.z=Math.sin(t*.65+b.position.x)*.018;});}};
}
