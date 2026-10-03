"""Restaurant access, seated diners, service area and real-browser render budget."""
from resort_harness import resort_page,check,ROOT
with resort_page(viewport={'width':1280,'height':800}) as (page,errors):
    page.evaluate('async()=>{await window.__resort.guestsReady;}')
    result=page.evaluate('''async()=>{
      const v=window.__resort,T=v.THREE,b=v.layout.CENTRAL_BUILDINGS.find(b=>b.kind==='restaurant');
      const {rootBoneOf}=await import('/crowd.js?v=68');
      const interior=v.props.group.getObjectByName('fare-restaurant-interior'),sign=v.props.group.getObjectByName('restaurant-sign');
      const people=v.guests.people.filter(p=>p.venue==='restaurant');
      const seated=people.filter(p=>p.seated);
      const seatsAligned=seated.every(p=>{p.mixer.update(0);p.pose?.();p.group.updateMatrixWorld(true);const hips=rootBoneOf(p.group),a=new T.Vector3();hips.getWorldPosition(a);return Math.abs(a.y-b.y-.56)<.04;});
      const start=v.layout.localPoint(b,0,12),end=v.layout.localPoint(b,0,-.8);
      v.ctrl.rescueTo(new T.Vector3(start.x,v.layout.terrainHeight(start.x,start.z)+.015,start.z));
      v.input.keys.clear();v.input.keys.add('KeyW');let reached=false;
      for(let i=0;i<1400;i++){
        if(Math.hypot(v.ctrl.pos.x-end.x,v.ctrl.pos.z-end.z)<.3){reached=true;break;}
        const yaw=Math.atan2(-(end.x-v.ctrl.pos.x),-(end.z-v.ctrl.pos.z));
        v.ctrl.update(1/60,v.input,yaw,new T.Vector3(-Math.sin(yaw),0,-Math.cos(yaw)));v.input.endFrame();
      }v.input.keys.clear();
      const roof=v.architecture.roofs.find(r=>r.userData.entries.some(e=>e.b.id===b.id));
      return {headroom:sign.position.y-.34-b.y,eaves:roof.userData.entries.find(e=>e.b.id===b.id).eaves,
        reached,tables:interior.userData.tables.length,seats:interior.userData.seats.length,seatsAligned,
        chef:people.filter(p=>p.group.name==='fare-chef').length,waiter:people.filter(p=>p.group.name==='fare-waiter').length,diners:seated.length};
    }''')
    print(result,flush=True)
    check('raised roof and sign give comfortable clearance',result['eaves']==3.95 and result['headroom']>3)
    check('player walks from sand to grill aisle',result['reached'])
    check('four tables and ten real chairs',result['tables']==4 and result['seats']==10)
    check('waiter chef and six seated diners',result['chef']==1 and result['waiter']==1 and result['diners']==6 and result['seatsAligned'])
    (ROOT/'scratch').mkdir(exist_ok=True)
    for time in ['day','sunset','night']:
      for view,eye,target in [('entrance',[0,2.6,13],[0,1.7,0]),('dining',[0,1.9,4.8],[-4,1.1,0]),('teppan',[2.4,1.7,-.3],[0,1.7,-4])]:
        stats=page.evaluate('''([time,eye,target])=>{
          const v=window.__resort,b=v.layout.CENTRAL_BUILDINGS.find(b=>b.kind==='restaurant');
          v.setResortTime(time,true);v.ctrl.pos.set(b.x,b.y,b.z+4);
          v.camera.position.set(b.x+eye[0],b.y+eye[1],b.z+eye[2]);v.camera.lookAt(b.x+target[0],b.y+target[1],b.z+target[2]);
          v.atmosphere.update(0,v.ctrl.pos);v.vegetation.update(v.camera.position,0);v.architecture.update(v.camera.position);v.batch.update(v.camera.position);
          v.guests.update(.016,2,v.camera.position);v.renderer.render(v.scene,v.camera);
          return {calls:v.renderer.info.render.calls,triangles:v.renderer.info.render.triangles};
        }''',[time,eye,target]);print(time,view,stats,flush=True)
        check('restaurant frame within graphics budget',stats['calls']<=250 and stats['triangles']<=800000)
        page.screenshot(path=str(ROOT/'scratch'/f'resort_restaurant_{time}_{view}.png'))
