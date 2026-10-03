"""Real-browser wildlife motion, confinement, culling and render-budget checks."""
import json
from resort_harness import resort_page, check, ROOT

with resort_page({'width': 1280, 'height': 720}) as (page, errors):
    page.evaluate('async()=>{await __resort.guestsReady;}')
    result = page.evaluate('''async () => {
      const v=__resort,T=v.THREE,w=v.wildlife,d=w.debug,r={};
      const {createResortWildlife}=await import('./resortWildlife.js');
      const make=()=>createResortWildlife({scene:new T.Scene(),ocean:v.ocean,corals:v.corals,collision:v.collision});
      const a=make(),b=make(),zero=new T.Vector3();
      const poses=s=>s.debug.schools.map(s=>({home:s.home,fish:s.fish.map(f=>[f.x,f.y,f.z,f.length])}));
      r.counts=JSON.stringify(w.counts)===JSON.stringify({birds:6,fish:24,schools:3});
      r.deterministic=JSON.stringify(poses(a))===JSON.stringify(poses(b))&&JSON.stringify(poses(a))===JSON.stringify(poses(w));
      r.birdHomesDeterministic=JSON.stringify(a.debug.birds.agents.map(f=>f.home))===JSON.stringify(b.debug.birds.agents.map(f=>f.home));
      r.size=a.debug.schools.every(s=>s.fish.length===8&&s.fish.every(f=>f.length>=.2&&f.length<=.3));
      const room=v.layout.PLAYER_BUNGALOW,home=d.schools[0].home,local=v.layout.toLocal(room,home.x,home.z);
      r.reservedBungalow=local.z>room.d/2+room.terrace&&Math.hypot(home.x-room.x,home.z-room.z)<25;
      r.centralReefs=d.schools.slice(1).every((s,i)=>s.home.x*(i===0?-1:1)>0&&v.corals.spots.some(c=>Math.hypot(c.x-s.home.x,c.z-s.home.z)<10));
      const average=(fish,p)=>fish.reduce((sum,f)=>sum+Math.hypot(f.x-p.x,f.y-p.y,f.z-p.z),0)/fish.length;
      const spread=fish=>{const p=fish.reduce((p,f)=>({x:p.x+f.x/8,y:p.y+f.y/8,z:p.z+f.z/8}),{x:0,y:0,z:0});return average(fish,p);};
      const initial=a.debug.schools[0].fish.map(f=>[f.x,f.y,f.z]);
      const initialBirds=a.debug.birds.agents.map(f=>[f.x,f.z]);
      const swimmer=new T.Vector3(home.x,home.y,home.z),above=new T.Vector3(home.x,3,home.z);
      for(let k=0;k<180;k++){a.update(1/60,k/60,swimmer,zero);b.update(1/60,k/60,above,zero);}
      const disturbed=a.debug.schools[0].fish,calm=b.debug.schools[0].fish;
      r.realMovement=disturbed.every((f,i)=>Math.hypot(f.x-initial[i][0],f.y-initial[i][1],f.z-initial[i][2])>.1);
      r.birdsMove=a.debug.birds.agents.some((f,i)=>Math.hypot(f.x-initialBirds[i][0],f.z-initialBirds[i][1])>1);
      r.scatter=average(disturbed,swimmer)>average(calm,swimmer)+.3;
      r.swimmerOnly=b.debug.schools[0].params.threat===null;
      const wide=spread(disturbed);
      for(let k=180;k<1980;k++)a.update(1/60,k/60,above,zero);
      r.regroup=spread(disturbed)<wide&&spread(disturbed)<1.5;
      r.cohesion=true;r.submerged=true;r.bodyEnvelope=true;r.noObstacles=true;r.finite=true;
      for(const school of a.debug.schools){
        const observer=new T.Vector3(school.home.x,3,school.home.z);
        for(let k=0;k<1800;k++){
          const t=33+k/60;a.update(1/60,t,observer,zero);
          for(const f of school.fish){
            r.finite&&=[f.x,f.y,f.z,f.vx,f.vy,f.vz].every(Number.isFinite);
            r.cohesion&&=Math.hypot(f.x-school.home.x,f.z-school.home.z)<=5.001;
            const h=a.debug.limits(f.x,f.z,t);r.submerged&&=f.y>=h.min-1e-6&&f.y<=h.max+1e-6;
            // Independent physical bounds, including animation clearance around the body.
            const envelope=f.length/2+.025;
            r.bodyEnvelope&&=f.y+envelope<v.ocean.waterHeightAt(f.x,f.z,t)&&f.y-envelope>v.layout.terrainHeight(f.x,f.z);
            r.noObstacles&&=!a.debug.blocked(f.x,f.y,f.z);
          }
        }
      }
      // Force a proposed crossing of a support proxy: the last valid X/Z must win.
      const f=b.debug.schools[0].fish[0],old={x:f.x,y:f.y,z:f.z};
      const proxy=v.bw.aabbs.find(p=>p.y0<-1&&p.obb&&p.y1>0),saved={...proxy,obb:{...proxy.obb}};
      Object.assign(proxy,{x0:f.x+.18,x1:f.x+.23,z0:f.z-.05,z1:f.z+.05,y0:-3,y1:0,
        obb:{x:f.x+.205,z:f.z,w:.05,d:.1,yaw:0}});
      // Begin just outside the conservative envelope, with a fast velocity aimed at it.
      proxy.x0=f.x+b.debug.radius+.01;proxy.x1=proxy.x0+.05;
      proxy.obb.x=(proxy.x0+proxy.x1)/2;
      f.vx=30;f.vz=0;f.vy=0;
      const prior=b.stats.blockedMoves;b.update(.05,3,above,zero);
      r.rejectObstacle=b.stats.blockedMoves>prior&&Math.abs(f.x-old.x)<1e-9&&Math.abs(f.z-old.z)<1e-9;
      Object.assign(proxy,saved);
      const before=JSON.stringify(poses(a));a.update(.05,63,new T.Vector3(1000,0,1000),zero);
      r.distanceSleep=a.stats.visibleFish===0&&a.stats.visibleBirds===0&&a.stats.activeSchools===0&&JSON.stringify(poses(a))===before;
      a.update(.016,63,above,zero);r.wakes=a.stats.visibleFish>=8;
      a.setTime('night');a.update(.016,63,above,zero);r.nightBirds=!a.debug.birds.mesh.parent.visible&&a.stats.visibleBirds===0&&a.stats.visibleFish>=8;
      a.setTime('sunset');a.update(.016,63,new T.Vector3(0,0,0),zero);r.sunsetBirds=a.stats.visibleBirds===6;
      r.altitude=a.debug.birds.agents.every(f=>f.y>=12&&f.y<=18);
      r.noShadows=!d.fishMesh.castShadow&&!d.birds.mesh.castShadow;
      r.singleFishMesh=w.group.children.filter(m=>m.isInstancedMesh).length===1&&d.fishMesh.instanceMatrix.count===24;
      for(const temp of [a,b])temp.group.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});
      // Exercise the production animation function without scheduling a second frame.
      v.ctrl.pos.copy(above);v.setResortTime('day',true);
      const raf=window.requestAnimationFrame;window.requestAnimationFrame=()=>0;__testAnimate();window.requestAnimationFrame=raf;
      r.mainLoop=v.wildlife.stats.visibleFish>=8;
      v.camera.position.set(home.x+3,2,home.z+3);v.camera.lookAt(home.x,home.y,home.z);
      v.wildlife.update(.016,4,above,zero);v.batch.update(v.camera.position);v.architecture.update(v.camera.position);
      v.renderer.render(v.scene,v.camera);const on={...v.renderer.info.render};
      w.group.visible=false;v.renderer.render(v.scene,v.camera);const off={...v.renderer.info.render};w.group.visible=true;
      r.extraDraws=on.calls-off.calls;r.drawBudget=r.extraDraws<=2&&r.extraDraws>0;
      return r;
    }''')
    print(json.dumps(result, indent=2))
    for name, value in result.items():
        if name != 'extraDraws':
            check(name, value)

    views = page.evaluate('''()=>{
      const v=__resort,b=v.layout.PLAYER_BUNGALOW,h=v.wildlife.debug.schools[0].home;
      const p=v.layout.localPoint(b,0,b.d/2+b.terrace-1);
      const [px,pz]=v.layout.BOARDWALKS[0][18];
      v.player.group.visible=false;
      return [['beach',[10,3,15],[0,15,-15]],['pier',[px,3.2,pz],[h.x,9,h.z]],
        ['bungalow',[p.x,b.y+1.6,p.z],[h.x,0,h.z]],
        ['underwater',[h.x+1.4,h.y+.05,h.z+1.4],[h.x,h.y,h.z]]];
    }''')
    for time in ['day', 'sunset', 'night']:
        for name, pos, target in views:
            metrics = page.evaluate('''([time,pos,target])=>{
              const v=__resort;v.setResortTime(time,true);v.ctrl.pos.set(...pos);
              document.getElementById('mode').textContent=pos[1]<0?'swim':'ground';
              document.getElementById('height').textContent=pos[1].toFixed(1);
              v.camera.position.set(...pos);v.camera.lookAt(...target);
              v.ocean.update(4);v.corals.update(4);v.wildlife.update(1/60,4,v.ctrl.pos,v.ctrl.vel);
              v.atmosphere.update(0,v.ctrl.pos);v.vegetation.update(v.camera.position,0);v.architecture.update(v.camera.position);v.batch.update(v.camera.position);
              v.guests.update(.016,4,v.camera.position);v.renderer.render(v.scene,v.camera);
              return {calls:v.renderer.info.render.calls,triangles:v.renderer.info.render.triangles,birds:v.wildlife.stats.visibleBirds,fish:v.wildlife.stats.visibleFish};
            }''', [time, pos, target])
            print(time, name, metrics)
            check(f'{time}/{name} render budget', metrics['calls'] <= 250 and metrics['triangles'] <= 800000)
            page.screenshot(path=str(ROOT / 'scratch' / f'resort_wildlife_{time}_{name}.png'))
