"""Compare HEAD ship and the working tree at identical low-cost test settings.

Reports GPU-completed frame times in this headless browser, not desktop FPS.
Run while a local server serves the project on port 8765.
"""
import json
import subprocess
from pathlib import Path
from playwright.sync_api import sync_playwright

root=Path(__file__).resolve().parents[1]
baseline=subprocess.check_output(['git','show','HEAD:main-CRUISE.js'],cwd=root,text=True)
results=[]
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True)
    for version in ['HEAD','working-tree']:
        page=browser.new_page(viewport={'width':960,'height':640})
        def defer(route):
            response=route.fetch()
            source=baseline if version=='HEAD' else response.text()
            route.fulfill(response=response,body=source.replace('\nanimate();','\n// Deferred for fixed-camera benchmark.'))
        page.route('**/main-CRUISE.js?*',defer)
        page.goto('http://127.0.0.1:8765/index.html?map=cruise',wait_until='domcontentloaded')
        page.wait_for_function('!!window.__startCruise',polling=100,timeout=120000)
        for zone in (['atrium'] if version=='HEAD' else ['atrium','gallery','opera']):
            result=page.evaluate('''zone=>{const c=window.__cruise;
              c.renderer.shadowMap.enabled=false;c.renderer.setPixelRatio(1);c.setCruiseTime('day');
              // The rooms are in the hull now: one coordinate system, no crossing.
              const z=zone==='atrium'?-4:zone==='opera'?-53:-22;
              c.ctrl.pos.set(0,zone==='atrium'?8.03:1.92,z);
              c.camera.position.set(x,zone==='atrium'?11:8,zone==='atrium'?-10:z);
              c.camera.lookAt(x,zone==='opera'?12:8,zone==='atrium'?0:z+30);
              c.renderer.render(c.scene,c.camera);const gl=c.renderer.getContext();gl.finish();
              const ms=[];for(let i=0;i<8;i++){const t=performance.now();c.renderer.render(c.scene,c.camera);gl.finish();ms.push(performance.now()-t);}
              ms.sort((a,b)=>a-b);return {zone,medianMs:ms[4],maxMs:ms[7],calls:c.renderer.info.render.calls,triangles:c.renderer.info.render.triangles};
            }''',zone)
            results.append(dict(version=version,**result))
        page.close()
    browser.close()
(root/'scratch'/'arts-performance.json').write_text(json.dumps(results,indent=2)+'\n')
print(json.dumps(results,indent=2))
