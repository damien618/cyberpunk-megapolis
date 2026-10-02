"""Blooms must intersect their own foliage and disappear with distant shrubs."""
from resort_harness import resort_page, check, ROOT

with resort_page(viewport={'width':1280,'height':800}) as (page, errors):
    result=page.evaluate('''() => {
      const v=window.__resort,T=v.THREE,veg=v.vegetation;
      const foliage=veg.group.children.find(m=>m.name.startsWith('garden_bush@'));
      const material=new T.MeshBasicMaterial({side:T.DoubleSide}),probe=new T.Mesh(foliage.geometry,material);
      const ray=new T.Raycaster(),gaps=[];
      for(const p of veg.flowerSpots){
        const b=veg.spots.bushes[p.bushIndex];probe.position.set(b.x,b.y,b.z);
        probe.scale.setScalar(b.s);probe.rotation.y=b.ry;probe.updateMatrixWorld(true);
        const root=new T.Vector3(p.x,p.y,p.z),normal=p.n.clone();
        ray.set(root.addScaledVector(normal,.4),normal.negate());ray.far=.8;
        const hit=ray.intersectObject(probe,false)[0];gaps.push(hit?hit.distance-.4:Infinity);
      }
      material.dispose();
      veg.update(new T.Vector3(900,2,900),0);
      const hidden=veg.flowers.every(m=>!m.visible);
      v.ctrl.pos.set(0,v.layout.terrainHeight(0,48),48);
      v.camera.position.set(2,3.6,48);v.camera.lookAt(0,2.3,53);
      veg.update(v.camera.position,0);v.architecture.update(v.camera.position);v.batch.update(v.camera.position);
      v.atmosphere.update(0,v.ctrl.pos);v.renderer.render(v.scene,v.camera);
      return {count:gaps.length,maxGap:Math.max(...gaps),hidden,
        synced:veg.flowers.every(m=>m.visible===m.userData.bushMesh.visible)};
    }''')
    print(result)
    check('all flower roots embedded in actual foliage',result['count']>100 and result['maxGap']<=-.015)
    check('flowers disappear with their shrubs',result['hidden'] and result['synced'])
    (ROOT/'scratch').mkdir(exist_ok=True)
    page.screenshot(path=str(ROOT/'scratch'/'resort_flowers_attached.png'))
    page.evaluate('''() => {
      const v=window.__resort,b=v.vegetation.spots.bushes.find(b=>b.z===53&&Math.abs(b.x)<4);
      v.camera.position.set(b.x+1.2,b.y+1.1,b.z-1.5);v.camera.lookAt(b.x,b.y+.45,b.z);
      v.vegetation.update(v.camera.position,0);v.atmosphere.update(0,v.camera.position);
      v.architecture.update(v.camera.position);v.batch.update(v.camera.position);
      v.renderer.render(v.scene,v.camera);
    }''')
    page.screenshot(path=str(ROOT/'scratch'/'resort_flowering_shrub_detail.png'))
