"""The open restaurant stays furnished and inhabited along the whole approach."""
from resort_harness import resort_page,check,ROOT
with resort_page(viewport={'width':1280,'height':800}) as (page,errors):
    page.evaluate('async()=>{await window.__resort.guestsReady;}')
    result=page.evaluate('''()=>{
      const v=window.__resort,b=v.layout.CENTRAL_BUILDINGS.find(b=>b.kind==='restaurant');
      const interior=v.props.group.getObjectByName('fare-restaurant-interior');
      const furniture=interior.children.filter(m=>m.name.startsWith('fare-interior:'));
      const guests=v.guests.people.filter(p=>p.venue==='restaurant');
      const samples=[];
      for(const distance of [100,70,55,45,35,25,19,18.1,17.9,13,8,25,55,100]){
        v.camera.position.set(b.x+distance*.3,Math.max(b.y,v.layout.terrainHeight(b.x+distance*.3,b.z+distance))+2.4,b.z+distance);v.camera.lookAt(b.x,b.y+1.4,b.z);
        v.ctrl.pos.copy(v.camera.position);v.atmosphere.update(0,v.ctrl.pos);v.vegetation.update(v.camera.position,0);
        v.architecture.update(v.camera.position);v.batch.update(v.camera.position);v.guests.update(.016,2,v.camera.position);
        v.renderer.render(v.scene,v.camera);
        samples.push({distance,furniture:furniture.every(m=>m.visible)||interior.getObjectByName('fare-interior-distant').visible,guests:guests.filter(p=>p.group.visible).length,
          represented:guests.every(p=>p.lod.mesh.visible||p.shadowMeshes.some(m=>m.visible)),calls:v.renderer.info.render.calls,triangles:v.renderer.info.render.triangles});
      }return samples;
    }''')
    print(result,flush=True)
    check('all furnishings and eight guests stay visible throughout approach',all(s['furniture'] and s['guests']==8 and s['represented'] for s in result))
    check('approach stays within graphics budget',all(s['calls']<=250 and s['triangles']<=800000 for s in result))
    (ROOT/'scratch').mkdir(exist_ok=True)
    page.evaluate('''()=>{const v=window.__resort,b=v.layout.CENTRAL_BUILDINGS.find(b=>b.kind==='restaurant');
      v.camera.position.set(b.x+16,b.y+2.2,b.z+42);v.camera.lookAt(b.x,b.y+1.6,b.z+1);v.ctrl.pos.copy(v.camera.position);
      v.atmosphere.update(0,v.ctrl.pos);v.vegetation.update(v.camera.position,0);v.architecture.update(v.camera.position);
      v.batch.update(v.camera.position);v.guests.update(.016,2,v.camera.position);v.renderer.render(v.scene,v.camera);}''')
    page.screenshot(path=str(ROOT/'scratch'/'resort_restaurant_distant.png'))
