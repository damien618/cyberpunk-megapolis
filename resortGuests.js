import * as THREE from 'three';
import { addRestaurantGuestLOD } from './resortGuestLOD.js';
import { loadGuestRig, makeVisitor, armReach, rootBoneOf } from './crowd.js?v=68';
import { RESTAURANT_SEATS, TEPPAN_SEATS } from './resortRestaurant.js';
import { CENTRAL_BUILDINGS, BUNGALOWS, GARDEN_BUNGALOWS, PLAYER_BUNGALOW_ID, localPoint, seededRandom, terrainHeight } from './resortLayout.js';

export function createResortGuests(scene) {
  const bar=CENTRAL_BUILDINGS.find(b=>b.kind==='bar'),reception=CENTRAL_BUILDINGS.find(b=>b.kind==='reception'),rnd=seededRandom(20261002),people=[];
  const solePoint=new THREE.Vector3();
  const ready=Promise.all([
    loadGuestRig({model:'./glb/visitors/woman.glb',walk:'./glb/visitors/walk.glb',idle:'./glb/visitors/idle.glb',height:1.68,recolor:'atlas',lit:true,shortsHem:.64}),
    loadGuestRig({model:'./glb/visitors/man.glb',walk:'./glb/visitors/walk_m.glb',idle:'./glb/visitors/idle_m.glb',height:1.80,recolor:'atlas-dark',lit:true,shortsHem:.64}),
  ]).then(rigs=>{
    function addGuest({b,x,z,yaw=0,staff=false,seated=false,route=null,venue=b?.kind,name}){
      const i=people.length,rig=rigs[i%2],holiday=!!route||(venue==='restaurant'&&!staff);
      const v=makeVisitor(rig.scene,rig.walkClip,rnd,{guest:rig,idleClip:rig.idleClip,playIdle:!route,seated,
        uniform:staff?{shirt:0xf7efdb,pants:0x176d70,hat:false}:null,look:staff?null:'beach',authoredBody:!holiday,barefoot:holiday,floral:holiday,shortsCut:holiday ? .82 : undefined});
      const p=b?localPoint(b,x,z):{x,z};v.group.position.set(p.x,b?b.y:terrainHeight(p.x,p.z),p.z);
      v.group.rotation.y=(b?.yaw??0)+yaw;v.group.name=name;
      v.shadowMeshes=[];v.group.traverse(o=>{if(o.isMesh){o.castShadow=true;v.shadowMeshes.push(o);}});
      v.reach=route||seated?null:armReach(v.group);v.staff=staff;v.venue=venue;v.buildingId=b?.id;v.seated=seated;
      v.phase=i*1.7;v.route=route;
      if(route){
        const xs=route.map(p=>p[0]);
        v.pathStart=Math.min(...xs)+.7;v.pathEnd=Math.max(...xs)-.7;
        v.straight=v.pathEnd-v.pathStart;v.routeLength=2*v.straight+2*Math.PI*.7;
        v.progress=rnd()*v.routeLength;
        const pace=.76+i%3*.055;
        v.walkAction.timeScale*=pace;
        v.speed*=pace*v.group.scale.y/v.height;
        v.bareLegs=v.group.getObjectByName('Wardrobe_BareLegs');
        if(v.bareLegs){
          const a=v.bareLegs.geometry.attributes.position;
          let low=Infinity;for(let j=0;j<a.count;j++)low=Math.min(low,a.getY(j));
          const sole=[];for(let j=0;j<a.count;j++)if(a.getY(j)<low+.025)sole.push(j);
          v.soleSamples=sole.filter((_,j)=>j%Math.max(1,Math.ceil(sole.length/32))===0);
        }
      }
      if(venue==='restaurant'){v.mixer.update(0);v.pose?.();}
      scene.add(v.group);v.group.updateMatrixWorld(true);
      // The imported rigs disable frustum culling. Give each mesh a generous
      // whole-person bound, so off-screen tourists no longer cost full draws.
      const bounds=new THREE.Sphere(new THREE.Vector3(p.x,v.group.position.y+v.height*.5,p.z),v.height*.9);
      for(const mesh of v.shadowMeshes){
        mesh.boundingSphere=bounds.clone().applyMatrix4(new THREE.Matrix4().copy(mesh.matrixWorld).invert());
        mesh.frustumCulled=true;
      }
      people.push(v);return v;
    }
    const spots=[
      ...[[-2,-1.7,0,true],[2,-1.7,0,true],[-3.4,4.6,Math.PI,false],[3.4,4.6,Math.PI,false],[3.4,7,.2,false]].map(spot=>[bar,...spot]),
      ...[[-2.2,-1.15,0,true],[2.2,-1.15,0,true],[-2.2,1.3,Math.PI,false],[2.2,1.6,Math.PI+.2,false]].map(spot=>[reception,...spot]),
    ];
    spots.forEach(([b,x,z,yaw,staff])=>{
      addGuest({b,x,z,yaw,staff,name:b.kind==='reception'?(staff?'maeva-receptionist':'maeva-visitor'):(staff?'lagon-server':'lagon-client')});
    });
    // One holidaymaker per bungalow, resting on the terrace or looking out
    // from beside the bed. Both doorways and the route to the pool stay clear.
    [...BUNGALOWS,...GARDEN_BUNGALOWS].forEach((b,i)=>{
      if(b.id===PLAYER_BUNGALOW_ID)return;
      const seated=i%3!==1;
      const x=seated?-b.w/2+1.25:b.w/2-.85,z=seated?b.d/2+.9:1.7;
      const v=addGuest({b,x,z,yaw:seated?0:-Math.PI/2,seated,venue:'bungalow',name:'resort-bungalow-tourist'});
      if(seated){
        v.mixer.update(0);v.pose?.();v.group.updateMatrixWorld(true);
        const hips=rootBoneOf(v.group);
        if(hips){const p=hips.position.clone();hips.getWorldPosition(p);v.group.position.y+=b.y+.86-p.y;}
      }
    });
    // Six well-separated holidaymakers, one per stretch of sandy avenue.
    for(const [x0,x1] of [[-96,-66],[-64,-34],[-32,-2],[0,30],[32,62],[64,98]]){
      addGuest({x:x0,z:47.3,route:[[x0,47.3],[x1,48.7]],venue:'street',name:'resort-strolling-tourist'});
    }
    const restaurant=CENTRAL_BUILDINGS.find(b=>b.kind==='restaurant');
    addGuest({b:restaurant,x:2.3,z:2.4,yaw:-.45,staff:true,venue:'restaurant',name:'fare-waiter'});
    const chef=addGuest({b:restaurant,x:0,z:-4.65,yaw:0,staff:true,venue:'restaurant',name:'fare-chef'});
    const head=chef.group.getObjectByName('Head');
    if(head){
      const toque=new THREE.Group();toque.name='fare-chef-toque';
      for(const [r,h,y] of [[.095,.065,.16],[.115,.16,.25]]){
        const hat=new THREE.Mesh(new THREE.CylinderGeometry(r,r,h,12),new THREE.MeshStandardMaterial({color:0xf5eddc,roughness:.95}));hat.position.y=y;toque.add(hat);
      }
      head.add(toque);
    }
    const diners=[...RESTAURANT_SEATS.filter((_,i)=>i%2===0),...TEPPAN_SEATS];
    for(const seat of diners){
      const v=addGuest({b:restaurant,...seat,seated:true,venue:'restaurant',name:'fare-diner'});
      v.mixer.update(0);v.pose?.();v.group.updateMatrixWorld(true);
      const hips=rootBoneOf(v.group),pos=new THREE.Vector3();
      if(hips){hips.getWorldPosition(pos);v.group.position.y+=restaurant.y+.56-pos.y;}
    }
    for(const v of people)if(v.venue==='restaurant')v.lod=addRestaurantGuestLOD(v);
    return people;
  });
  return {people,ready,update(dt,t,camera){
    for(const v of people){
      if(v.route){
        v.progress=(v.progress+Math.max(0,dt)*v.speed)%v.routeLength;
        let d=v.progress,x,z,yaw;
        const r=.7,arc=Math.PI*r;
        if(d<v.straight){x=v.pathStart+d;z=47.3;yaw=Math.PI/2;}
        else if((d-=v.straight)<arc){
          const a=-Math.PI/2+d/r;x=v.pathEnd+r*Math.cos(a);z=48+r*Math.sin(a);yaw=-a;
        }else if((d-=arc)<v.straight){x=v.pathEnd-d;z=48.7;yaw=-Math.PI/2;}
        else {d-=v.straight;const a=Math.PI/2+d/r;x=v.pathStart+r*Math.cos(a);z=48+r*Math.sin(a);yaw=-a;}
        v.group.position.set(x,terrainHeight(x,z),z);
        v.group.rotation.y=yaw;

      }
      const distance=v.group.position.distanceTo(camera);
      v.lod?.update(distance);
      const tourist=v.venue==='street'||v.venue==='bungalow';
      // The open restaurant must never look empty from the beach. Its guests
      // remain visible; individual meshes still use normal frustum culling.
      v.group.visible=v.venue==='restaurant'||distance<(v.venue==='street'?24:tourist?30:55);
      // Keep gait phase continuous while culled, so reappearing feet don't jump.
      if(v.route){
        v.mixer.update(Math.max(0,dt));
        // Constrain the lowest animated sole to the sand, leaving the other
        // foot free to swing. Sample skinned soles rather than a static capsule.
        if(v.soleSamples?.length){
          v.group.updateMatrixWorld(true);let clearance=Infinity;
          for(const j of v.soleSamples){
            solePoint.fromBufferAttribute(v.bareLegs.geometry.attributes.position,j);
            v.bareLegs.applyBoneTransform(j,solePoint);v.bareLegs.localToWorld(solePoint);
            clearance=Math.min(clearance,solePoint.y-terrainHeight(solePoint.x,solePoint.z));
          }
          v.groundOffset=.006-clearance;v.group.position.y+=v.groundOffset;
        }
      }
      if(!v.group.visible)continue;
      for(const mesh of v.shadowMeshes)mesh.castShadow=distance<(v.venue==='restaurant'?4:v.venue==='street'?7:tourist?12:20);
      if(!v.route&&(v.venue!=='restaurant'||distance<36))v.mixer.update(dt);v.pose?.();
      // Gentle serving gestures and conversations over the authored idle clip.
      if(v.reach&&(v.venue!=='restaurant'||distance<36)){
        const angle=(v.group.name==='fare-chef' ? .42 : .12)+.06*Math.sin(t*.8+v.phase);
        v.reach.lower[1]?.rotateX(-angle);
        v.reach.upper[1]?.rotateX(-angle*.4);
      }
    }
  }};
}
