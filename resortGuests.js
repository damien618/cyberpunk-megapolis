import { loadGuestRig, makeVisitor, armReach } from './crowd.js?v=68';
import { CENTRAL_BUILDINGS, localPoint, seededRandom } from './resortLayout.js';

export function createResortGuests(scene) {
  const bar=CENTRAL_BUILDINGS.find(b=>b.kind==='bar'),reception=CENTRAL_BUILDINGS.find(b=>b.kind==='reception'),rnd=seededRandom(20261002),people=[];
  const ready=Promise.all([
    loadGuestRig({model:'./glb/visitors/woman.glb',walk:'./glb/visitors/walk.glb',idle:'./glb/visitors/idle.glb',height:1.68,recolor:'atlas'}),
    loadGuestRig({model:'./glb/visitors/man.glb',walk:'./glb/visitors/walk_m.glb',idle:'./glb/visitors/idle_m.glb',height:1.80,recolor:'atlas-dark'}),
  ]).then(rigs=>{
    const spots=[
      ...[[-2,-1.7,0,true],[2,-1.7,0,true],[-3.4,4.6,Math.PI,false],[3.4,4.6,Math.PI,false],[3.4,7,.2,false]].map(spot=>[bar,...spot]),
      ...[[-2.2,-1.15,0,true],[2.2,-1.15,0,true],[-2.2,1.3,Math.PI,false],[2.2,1.6,Math.PI+.2,false]].map(spot=>[reception,...spot]),
    ];
    spots.forEach(([b,x,z,yaw,staff],i)=>{
      const rig=rigs[i%2],v=makeVisitor(rig.scene,rig.walkClip,rnd,{guest:rig,idleClip:rig.idleClip,playIdle:true,
        uniform:staff?{shirt:0xf7efdb,pants:0x176d70,hat:false}:null,look:staff?null:'beach',authoredBody:true});
      const p=localPoint(b,x,z);v.group.position.set(p.x,b.y,p.z);v.group.rotation.y=b.yaw+yaw;
      v.group.name=b.kind==='reception'?(staff?'maeva-receptionist':'maeva-visitor'):(staff?'lagon-server':'lagon-client');
      v.group.traverse(o=>{if(o.isMesh)o.castShadow=true;});
      v.reach=armReach(v.group);v.staff=staff;v.venue=b.kind;v.phase=i*1.7;scene.add(v.group);people.push(v);
    });
    return people;
  });
  return {people,ready,update(dt,t,camera){
    for(const v of people){v.group.visible=v.group.position.distanceTo(camera)<55;if(!v.group.visible)continue;
      v.mixer.update(dt);v.pose?.();
      // Gentle serving gestures and conversations over the authored idle clip.
      if(v.reach){
        const angle=.12+.06*Math.sin(t*.8+v.phase);
        v.reach.lower[1]?.rotateX(-angle);
        v.reach.upper[1]?.rotateX(-angle*.4);
      }
    }
  }};
}
