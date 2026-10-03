"""Inspect the upholstered village furniture and render its fabrics in real WebGL."""
import json
from resort_harness import resort_page, check, ROOT

with resort_page(viewport={'width': 1280, 'height': 800}) as (page, errors):
    result = page.evaluate('''() => {
      const v=window.__resort,records=v.props.furniture;
      const meshes=v.props.group.children.filter(m=>m.name.startsWith('resort-furniture:'));
      const arrow=v.props.arrow,b=v.layout.PLAYER_BUNGALOW;
      v.batch.update(new v.THREE.Vector3(b.branch.x,b.y+2,b.branch.z));
      const arrowOnPier=arrow.children.every(m=>m.visible);
      v.batch.update(new v.THREE.Vector3(0,10,-145));
      const arrowCulled=arrow.children.every(m=>!m.visible);
      return {rooms:records.length,styles:new Set(records.map(r=>r.accent)).size,
        arrowOnPier,arrowCulled,
        beds:records.filter(r=>r.bed).length,benches:records.filter(r=>r.bench).length,
        loungers:records.reduce((sum,r)=>sum+r.loungers,0),
        sharedLoungers:records.every(r=>r.loungerPoints.length===r.loungers&&r.loungerPoints.every(p=>p.buildingId===r.id&&Object.values(p.world).every(Number.isFinite))),
        sharedIndoor:records.every(r=>['bed','bench'].every(key=>{
          const a=r.furnitureAnchors[key];return a.buildingId===r.id&&[a.world,a.lie,a.approach,a.exit].every(p=>Object.values(p).every(Number.isFinite));
        })),
        finite:meshes.every(m=>Array.from(m.geometry.attributes.position.array).every(Number.isFinite)),
        textured:meshes.filter(m=>m.name.includes('cushion:')).every(m=>m.material.map&&m.material.bumpMap&&m.material.sheen>0)};
    }''')
    print(result)
    check('18 beds, 18 benches and 36 loungers', result['beds']==18 and result['benches']==18 and result['loungers']==36)
    check('three coordinated island palettes with woven surface relief', result['styles']==3 and result['textured'])
    check('all soft geometry finite', result['finite'])
    check('all rendered loungers expose their shared positions',result['sharedLoungers'])
    check('all rendered beds and benches expose finite shared anchors',result['sharedIndoor'])
    check('arrow visible on pier, culled in distant landscape',result['arrowOnPier'] and result['arrowCulled'])
    (ROOT / 'scratch').mkdir(exist_ok=True)
    results=[]
    for index in [0, 1, 2, 5, 12]:
        for view in ['bed', 'bench']:
            stats=page.evaluate('''([index,view]) => {
              const v=window.__resort,b=v.layout.BUILDINGS[index];
              const {x:tx,z:tz}=v.props.furniture.find(r=>r.id===b.id).furnitureAnchors.bench.local;
              const eye=view==='bed'?[1.6,1.95,1.65]:[tx+1.8,1.9,tz+2.3];
              const aim=view==='bed'?[0,.8,-.9]:[tx,.72,tz];
              const p=v.layout.localPoint(b,eye[0],eye[2]),a=v.layout.localPoint(b,aim[0],aim[2]);
              v.ctrl.pos.set(b.x,b.y,b.z);v.camera.position.set(p.x,b.y+eye[1],p.z);
              v.camera.lookAt(a.x,b.y+aim[1],a.z);
              v.atmosphere.update(0,v.ctrl.pos);v.architecture.update(v.camera.position);v.batch.update(v.camera.position);
              v.vegetation.update(v.camera.position,0);v.guests.update(0,0,v.camera.position);
              v.renderer.render(v.scene,v.camera);
              return {id:b.id,view,calls:v.renderer.info.render.calls,triangles:v.renderer.info.render.triangles};
            }''',[index,view])
            results.append(stats)
            page.screenshot(path=str(ROOT/'scratch'/f'resort_furniture_{index}_{view}.png'))
    print(json.dumps(results,indent=2))
    check('furniture views <=250 calls', max(r['calls'] for r in results)<=250)
    check('furniture views <=800k triangles', max(r['triangles'] for r in results)<=800000)
