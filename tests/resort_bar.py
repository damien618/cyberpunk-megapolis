"""Lagon pavilion: anchored columns, headroom, population and complete-frame budgets."""
import json
from resort_harness import resort_page, check, ROOT
with resort_page(viewport={'width':1280,'height':800}) as (page, errors):
    page.evaluate('async()=>{await window.__resort.guestsReady;}')
    result=page.evaluate('''()=>{
      const v=window.__resort,b=v.layout.CENTRAL_BUILDINGS.find(b=>b.kind==='bar');
      const sign=v.props.group.getObjectByName('lagon-sign');
      const posts=[];const m=new v.THREE.Matrix4(),p=new v.THREE.Vector3(),q=new v.THREE.Quaternion(),s=new v.THREE.Vector3();
      for(const mesh of v.scene.children){if(!mesh.isInstancedMesh||!mesh.name.startsWith('post:barFrame:'))continue;
        for(let i=0;i<mesh.count;i++){mesh.getMatrixAt(i,m);m.decompose(p,q,s);if(s.y>2.8)posts.push({bottom:p.y-s.y/2,ground:v.layout.terrainHeight(p.x,p.z),top:p.y+s.y/2});}
      }
      return {headroom:sign.position.y-.29-b.y,posts:posts.filter(p=>Math.abs(p.top-4.7)<.01),servers:v.guests.people.filter(p=>p.venue==='bar'&&p.staff).length,clients:v.guests.people.filter(p=>p.venue==='bar'&&!p.staff).length};
    }''')
    check('sign above standing headroom',result['headroom']>2.2)
    check('four roof columns reach the ground',len(result['posts'])==4 and all(p['bottom']<=p['ground'] and abs(p['top']-4.7)<.01 for p in result['posts']))
    check('two servers and three clients',result['servers']==2 and result['clients']==3)
    results=[]
    for time in ['day','sunset','night']:
        stats=page.evaluate('''time=>{
          const v=window.__resort;v.setResortTime(time,true);v.ctrl.pos.set(101,2,37);
          v.camera.position.set(101,4.8,40);v.camera.lookAt(101,3.1,23);
          v.atmosphere.update(0,v.ctrl.pos);v.vegetation.update(v.camera.position,0);
          v.architecture.update(v.camera.position);v.batch.update(v.camera.position);
          v.guests.update(.016,2,v.camera.position);v.renderer.render(v.scene,v.camera);
          return {calls:v.renderer.info.render.calls,triangles:v.renderer.info.render.triangles};
        }''',time)
        results.append({'time':time,**stats})
        page.screenshot(path=str(ROOT/'scratch'/f'resort_bar_{time}.png'))
    print(json.dumps(results,indent=2))
    check('bar complete frame <=250 calls',max(r['calls'] for r in results)<=250)
    check('bar complete frame <=800k triangles',max(r['triangles'] for r in results)<=800000)
