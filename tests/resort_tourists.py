"""Tourists occupy all rooms; walking routes stay on the sandy avenue."""
from resort_harness import resort_page, check, ROOT

with resort_page(viewport={'width':1280,'height':800}) as (page, errors):
    page.evaluate('async()=>{await window.__resort.guestsReady;}')
    result=page.evaluate('''async () => {
      const v=window.__resort,L=v.layout,{rootBoneOf}=await import('/crowd.js?v=68');
      const roomGuests=v.guests.people.filter(p=>p.venue==='bungalow'),walkers=v.guests.people.filter(p=>p.venue==='street');
      const camera=new v.THREE.Vector3(0,3,48);
      v.guests.update(0,0,camera);
      const gaitContinuous=walkers.every(p=>{
        const before=p.walkAction.time;
        v.guests.update(.1,0,new v.THREE.Vector3(1000,1000,1000));
        return p.walkAction.time!==before;
      });
      // Exercise both rounded ends, including crossing each segment boundary.
      let smoothTurns=true;
      for(const p of walkers){
        for(const boundary of [p.straight,p.straight+Math.PI*.7,2*p.straight+Math.PI*.7,p.routeLength]){
          p.progress=boundary-.002;v.guests.update(0,0,camera);
          const start=p.group.position.clone(),yaw=p.group.rotation.y;
          v.guests.update(.01,0,camera);
          const turn=Math.atan2(Math.sin(p.group.rotation.y-yaw),Math.cos(p.group.rotation.y-yaw));
          smoothTurns&&=Math.abs(turn)<.08&&p.group.position.distanceTo(start)<.03;
        }
      }
      const bareLegs=walkers.every(p=>!!p.group.getObjectByName('Wardrobe_BareLegs'));
      const starts=walkers.map(p=>p.group.position.clone());let onAvenue=true,onGround=true;
      for(let frame=0;frame<1200;frame++){
        v.guests.update(1/60,frame/60,camera);
        for(const p of walkers){const a=p.group.position;
          onAvenue&&=a.x>=-96&&a.x<=98&&a.z>=47.3-1e-6&&a.z<=48.7+1e-6;
          onGround&&=Math.abs(a.y-L.terrainHeight(a.x,a.z)-(p.groundOffset??0))<.001;
        }
      }
      const soleContact=walkers.every(p=>{
        p.group.updateMatrixWorld(true);let clearance=Infinity;
        for(const j of p.soleSamples){const q=new v.THREE.Vector3().fromBufferAttribute(p.bareLegs.geometry.attributes.position,j);
          p.bareLegs.applyBoneTransform(j,q);p.bareLegs.localToWorld(q);
          clearance=Math.min(clearance,q.y-L.terrainHeight(q.x,q.z));}
        return Math.abs(clearance-.006)<.002;
      });
      const seated=roomGuests.filter(p=>p.seated);
      const seatedCorrect=seated.every(p=>{
        const b=L.BUILDINGS.find(b=>b.id===p.buildingId),hips=rootBoneOf(p.group),pos=new v.THREE.Vector3();
        p.group.updateMatrixWorld(true);hips.getWorldPosition(pos);
        return Math.abs(pos.y-(b.y+.86))<.10;
      });
      const doorsClear=roomGuests.every(p=>{
        const b=L.BUILDINGS.find(b=>b.id===p.buildingId),a=L.toLocal(b,p.group.position.x,p.group.position.z);
        return Math.abs(a.x)>1.1;
      });
      return {rooms:new Set(roomGuests.map(p=>p.buildingId)).size,walkers:walkers.length,seated:seated.length,
        smoothTurns,gaitContinuous,bareLegs,soleContact,moved:walkers.every((p,i)=>p.group.position.distanceTo(starts[i])>1),onAvenue,onGround,seatedCorrect,doorsClear};
    }''')
    print(result)
    check('every bungalow inhabited',result['rooms']==18)
    check('six animated walkers move along the avenue',result['walkers']==6 and result['moved'] and result['onAvenue'] and result['onGround'])
    check('rounded turns and continuous offscreen gait',result['smoothTurns'] and result['gaitContinuous'])
    check('shorts expose anatomical skinned legs',result['bareLegs'])
    check('animated soles meet the sand',result['soleContact'])
    check('seated guests correctly placed and doors clear',result['seated']>0 and result['seatedCorrect'] and result['doorsClear'])
    (ROOT/'scratch').mkdir(exist_ok=True)
    for view in ['street','bungalow','outfit','outfit-female']:
        stats=page.evaluate('''view=>{
          const v=window.__resort,L=v.layout;
          if(view==='street'){v.ctrl.pos.set(-30,2,48);v.camera.position.set(-36,4,46);v.camera.lookAt(15,3,49);}
          else if(view.startsWith('outfit')){const p=v.guests.people.filter(p=>p.venue==='street')[view==='outfit-female'?1:0];
            v.guests.update(0,20,p.group.position);const a=p.group.position;
            const forward=new v.THREE.Vector3(Math.sin(p.group.rotation.y),0,Math.cos(p.group.rotation.y));
            v.camera.position.copy(a).addScaledVector(forward,3.2);v.camera.position.y+=1.35;
            v.ctrl.pos.copy(a);v.camera.lookAt(a.x,a.y+.9,a.z);}
          else {const b=L.BUNGALOWS[0],p=L.localPoint(b,0,b.d/2+b.terrace+3),a=L.localPoint(b,-b.w/2+1.25,b.d/2+.8);
            v.ctrl.pos.set(b.x,b.y,b.z);v.camera.position.set(p.x,b.y+2.1,p.z);v.camera.lookAt(a.x,b.y+1,a.z);}
          v.vegetation.update(v.camera.position,0);v.atmosphere.update(0,v.ctrl.pos);
          v.architecture.update(v.camera.position);v.batch.update(v.camera.position);
          v.guests.update(.016,20,v.camera.position);v.renderer.render(v.scene,v.camera);
          return {calls:v.renderer.info.render.calls,triangles:v.renderer.info.render.triangles};
        }''',view)
        print(view,stats)
        check('populated view within graphics budget',stats['calls']<=250 and stats['triangles']<=800000)
        page.screenshot(path=str(ROOT/'scratch'/f'resort_tourists_{view}.png'))
