"""Compile all shaders and measure the complete frame, including shadow draws."""
import json
from resort_harness import resort_page, check, ROOT
POSES = [
    ('arrival', [10, 5, 26], [0, 2, -80]),
    ('lagoon', [0, 4, -95], [-10, 12, 45]),
    ('mountain', [0, 10, -145], [-150, 90, 600]),
    ('gardens', [-90, 4, 48], [70, 4, 48]),
    ('hamac', [-24, 4, 20], [-24, 2, 14]),
]
with resort_page() as (page, errors):
    (ROOT / 'scratch').mkdir(exist_ok=True)
    buildings = page.evaluate('''() => {
      const v=window.__resort,L=v.layout;
      return [L.BUNGALOWS[0],L.BUNGALOWS.find(b=>b.premium)].map(b=>{
        const p=L.localPoint(b,0,b.d/2+b.terrace+6);
        return [b.premium?'suite':'bungalow',[p.x,b.y+3,p.z],[b.x,b.y+1.5,b.z]];
      });
    }''')
    POSES += buildings
    results = []
    for time in ['day', 'sunset', 'night']:
        for name, pos, target in POSES:
            result = page.evaluate('''([time,pos,target]) => {
              const v=window.__resort;v.setResortTime(time,true);
              v.ctrl.pos.set(pos[0],v.layout.terrainHeight(pos[0],pos[2]),pos[2]);
              v.camera.position.set(...pos);v.camera.lookAt(...target);
              v.atmosphere.update(0,v.ctrl.pos);v.vegetation.update(v.camera.position,0);
              v.architecture.update(v.camera.position);v.renderer.render(v.scene,v.camera);
              return {calls:v.renderer.info.render.calls,triangles:v.renderer.info.render.triangles};
            }''', [time, pos, target])
            results.append({'view': name, 'time': time, **result})
            page.screenshot(path=str(ROOT / 'scratch' / f'resort_{time}_{name}.png'))
    print(json.dumps(results, indent=2))
    (ROOT / 'scratch' / 'resort_performance.json').write_text(json.dumps(results, indent=2))
    check('worst frame ≤250 calls', max(r['calls'] for r in results) <= 250)
    check('worst frame ≤800k triangles', max(r['triangles'] for r in results) <= 800000)
