"""Reception columns, entrance clearance, guest placement and full-frame rendering."""
from resort_harness import resort_page, check, ROOT

with resort_page(viewport={'width':1280,'height':800}) as (page, errors):
    page.evaluate('async()=>{await window.__resort.guestsReady;}')
    result=page.evaluate('''() => {
      const v=window.__resort,T=v.THREE,b=v.layout.CENTRAL_BUILDINGS.find(b=>b.kind==='reception');
      const columns=[],rails=[],m=new T.Matrix4(),p=new T.Vector3(),q=new T.Quaternion(),s=new T.Vector3();
      for(const mesh of v.batch.meshes){
        if(!mesh.name.startsWith('post:barFrame:')&&!mesh.name.startsWith('box:barFrame:'))continue;
        for(let i=0;i<mesh.count;i++){
          mesh.getMatrixAt(i,m);m.decompose(p,q,s);const local=v.layout.toLocal(b,p.x,p.z);
          if(Math.abs(local.x)>b.w/2+.3||Math.abs(local.z)>b.d/2+b.terrace+.3)continue;
          const record={bottom:p.y-s.y/2,top:p.y+s.y/2,ground:v.layout.terrainHeight(p.x,p.z)};
          if(s.y>3&&Math.abs(record.top-(b.y+3.65))<.01)columns.push(record);
          if(Math.abs(local.z-(b.d/2+b.terrace))<.01&&s.y>.7)rails.push(record);
        }
      }
      const sign=v.props.group.getObjectByName('reception-sign');
      const people=v.guests.people.filter(p=>p.venue==='reception');
      const headroom=sign.position.y-.325-b.y;
      // Walk from the forecourt through the actual staircase and entrance.
      const start=v.layout.localPoint(b,0,9),end=v.layout.localPoint(b,0,2);
      v.ctrl.rescueTo(new T.Vector3(start.x,v.layout.terrainHeight(start.x,start.z)+.015,start.z));
      v.input.keys.clear();v.input.keys.add('KeyW');let reached=false;
      for(let i=0;i<1200;i++){
        if(Math.hypot(v.ctrl.pos.x-end.x,v.ctrl.pos.z-end.z)<.3){reached=true;break;}
        const yaw=Math.atan2(-(end.x-v.ctrl.pos.x),-(end.z-v.ctrl.pos.z));
        v.ctrl.update(1/60,v.input,yaw,new T.Vector3(-Math.sin(yaw),0,-Math.cos(yaw)));v.input.endFrame();
      }
      v.input.keys.clear();
      return {columns,rails,headroom,reached,staff:people.filter(p=>p.staff).length,visitors:people.filter(p=>!p.staff).length,
        feet:people.every(p=>Math.abs(p.group.position.y-b.y)<.01)};
    }''')
    print(result)
    check('four full-height roof columns anchored to the ground',len(result['columns'])==4 and all(p['bottom']<=p['ground'] for p in result['columns']))
    check('six anchored terrace rail posts',len(result['rails'])==6 and all(p['bottom']<=p['ground'] for p in result['rails']))
    check('sign leaves ample headroom',result['headroom']>2.7)
    check('two receptionists and two visitors on the deck',result['staff']==2 and result['visitors']==2 and result['feet'])
    check('entrance remains walkable',result['reached'])
    (ROOT/'scratch').mkdir(exist_ok=True)
    for time in ['day','sunset','night']:
        stats=page.evaluate('''time=>{
          const v=window.__resort;v.setResortTime(time,true);v.ctrl.pos.set(12,2.1,45);
          v.camera.position.set(17,4.8,48);v.camera.lookAt(12,3.7,34);
          v.vegetation.update(v.camera.position,0);v.atmosphere.update(0,v.ctrl.pos);
          v.architecture.update(v.camera.position);v.batch.update(v.camera.position);
          v.guests.update(.016,2,v.camera.position);v.renderer.render(v.scene,v.camera);
          return {calls:v.renderer.info.render.calls,triangles:v.renderer.info.render.triangles};
        }''',time)
        print(time,stats)
        check('reception frame within graphics budgets',stats['calls']<=250 and stats['triangles']<=800000)
        page.screenshot(path=str(ROOT/'scratch'/f'resort_reception_{time}.png'))
