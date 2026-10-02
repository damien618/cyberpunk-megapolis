"""Inspect the upholstered village furniture and render its fabrics in real WebGL."""
import json
from resort_harness import resort_page, check, ROOT

with resort_page(viewport={'width': 1280, 'height': 800}) as (page, errors):
    result = page.evaluate('''() => {
      const v=window.__resort,records=v.props.furniture;
      const meshes=v.props.group.children.filter(m=>m.name.startsWith('resort-furniture:'));
      return {rooms:records.length,styles:new Set(records.map(r=>r.accent)).size,
        beds:records.filter(r=>r.bed).length,benches:records.filter(r=>r.bench).length,
        loungers:records.reduce((sum,r)=>sum+r.loungers,0),
        finite:meshes.every(m=>Array.from(m.geometry.attributes.position.array).every(Number.isFinite)),
        textured:meshes.filter(m=>m.name.includes('cushion:')).every(m=>m.material.map&&m.material.bumpMap&&m.material.sheen>0)};
    }''')
    print(result)
    check('18 beds, 18 benches and 36 loungers', result['beds']==18 and result['benches']==18 and result['loungers']==36)
    check('three coordinated island palettes with woven surface relief', result['styles']==3 and result['textured'])
    check('all soft geometry finite', result['finite'])
    (ROOT / 'scratch').mkdir(exist_ok=True)
    results=[]
    for index in [0, 1, 2, 5, 12]:
        for view in ['bed', 'bench']:
            stats=page.evaluate('''([index,view]) => {
              const v=window.__resort,b=v.layout.BUILDINGS[index];
              const tx=-b.w/2+1.25,tz=b.d/2+.8;
              const eye=view==='bed'?[1.6,1.95,1.65]:[tx+1.8,1.9,tz+2.3];
              const aim=view==='bed'?[0,.8,-.9]:[tx,.72,tz];
              const p=v.layout.localPoint(b,eye[0],eye[2]),a=v.layout.localPoint(b,aim[0],aim[2]);
              v.ctrl.pos.set(b.x,b.y,b.z);v.camera.position.set(p.x,b.y+eye[1],p.z);
              v.camera.lookAt(a.x,b.y+aim[1],a.z);
              v.atmosphere.update(0,v.ctrl.pos);v.architecture.update(v.camera.position);v.batch.update(v.camera.position);
              v.renderer.render(v.scene,v.camera);
              return {id:b.id,view,calls:v.renderer.info.render.calls,triangles:v.renderer.info.render.triangles};
            }''',[index,view])
            results.append(stats)
            page.screenshot(path=str(ROOT/'scratch'/f'resort_furniture_{index}_{view}.png'))
    print(json.dumps(results,indent=2))
    check('furniture views <=250 calls', max(r['calls'] for r in results)<=250)
    check('furniture views <=800k triangles', max(r['triangles'] for r in results)<=800000)
