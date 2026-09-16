"""Browser smoke test and reproducible visual checkpoints for Cruise arts.

The galleries live INSIDE the hull now — aft of the atrium, under the casino,
floored at y = 1.9 and decked at 7.45 — so there is no crossing left to test:
no fade, no teleport, no second copy of the map at x = 1000. What matters is
that every surface down there carries the player and that the whole run, from
the atrium to the stage, is walkable in one go.
"""
import json
import os
from pathlib import Path
from playwright.sync_api import sync_playwright

# The dev server the map is actually served from; override with CRUISE_PORT.
PORT = os.environ.get('CRUISE_PORT', '8000')
OUT = Path(__file__).resolve().parents[1] / 'scratch'
OUT.mkdir(exist_ok=True)
with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, args=['--ignore-gpu-blocklist', '--enable-webgl'])
    page = browser.new_page(viewport={'width': 1440, 'height': 1000})
    # Defer the first expensive ship render until loading has completed.
    def defer_animation(route):
        response = route.fetch()
        route.fulfill(response=response,
                      body=response.text().replace('\nanimate();', '\nwindow.__testAnimate = animate;'))
    page.route('**/main-CRUISE.js?*', defer_animation)
    errors = []
    page.on('pageerror', lambda e: (errors.append(str(e)), print('ERROR', str(e), flush=True)))
    page.on('console', lambda m: print(m.text, flush=True) if m.type == 'error' or '[cruise]' in m.text else None)
    page.goto(f'http://127.0.0.1:{PORT}/index.html?map=cruise&arrival=beach', wait_until='domcontentloaded')
    page.wait_for_function('!!(window.__cruise && window.__cruise.player && window.__startCruise)',
                           polling=100, timeout=120000)
    print('READY', flush=True)
    page.evaluate('window.__startCruise()')
    page.evaluate('''() => {const c=window.__cruise;c.renderer.shadowMap.enabled=false;
      c.renderer.setPixelRatio(.7);c.ctrl.pos.set(0,1.92,-22);window.__testAnimate();}''')
    images = page.evaluate('window.__cruise.artsGallery.ready')
    page.wait_for_timeout(3000)
    page.evaluate('''() => {const c=window.__cruise;window._rigUpdate=c.rig.update;c.rig.update=()=>{};}''')
    reports = []
    for name, pos, cam, target in [
        ('gallery', [2, 1.92, -22], [2, 3.6, -17.5], [0, 3.2, -40]),
        ('gallery-far', [0, 1.92, -40], [0, 3.6, -42], [0, 3.2, -20]),
        ('foyer', [0, 1.92, -46], [0, 3.6, -44.5], [0, 3.4, -54]),
        ('opera', [0, 1.92, -53], [0, 3.5, -50.5], [0, 4.0, -64]),
        ('balcony', [13.6, 4.52, -52], [13.6, 6.0, -50], [-4, 3.4, -62]),
        ('stage', [0, 2.72, -66], [0, 4.4, -65], [0, 3.4, -52]),
        ('opera-night', [0, 1.92, -53], [0, 3.5, -50.5], [0, 4.0, -64]),
        # Aboard: the well in the forward starboard quarter of the atrium, and
        # the flight that goes down through it into the Monet hall.
        ('atrium', [0, 8.03, -4], [-2, 11.2, -1], [5, 7.4, -10]),
        ('arts-stair', [5, 6.5, -10.5], [5, 9.2, -5.4], [4, 3.0, -20]),
    ]:
        page.evaluate('name=>window.__cruise.setCruiseTime(name.includes("night")?"night":"day")', name)
        page.evaluate('''a=>{const c=window.__cruise;c.ctrl.pos.set(...a.pos);c.ctrl.vel.set(0,0,0);
          c.camera.position.set(...a.cam);c.camera.lookAt(...a.target);}''',
                      dict(pos=pos, cam=cam, target=target))
        page.wait_for_timeout(1500)
        page.screenshot(path=str(OUT / f'arts-{name}.png'), timeout=180000)  # SwiftShader is slow
        reports.append(page.evaluate(
            '''name=>{const c=window.__cruise;return {name,pos:c.ctrl.pos.toArray(),draw:c.renderer.info.render}}''', name))
    # All walkable surfaces need actual ground support, including every tread.
    ground = page.evaluate('''() => {const c=window.__cruise, missing=[];
      const probe=(x,y,z,name)=>{const g=c.groundFn(x,z,y+1,y+0.03,y+0.03);
        if(g===null||Math.abs(g-y)>0.35)missing.push({name,x,y:+y.toFixed(2),z:+z.toFixed(1),g});};
      const s=c.ARTS_STAIR,rise=(8-c.ARTS_Y)/s.steps,tread=(s.zTop-s.zBot)/s.steps;
      for(let i=0;i<s.steps;i++)probe(5,8-i*rise,s.zTop-(i+.5)*tread,'arts stair');
      for(let z=-18;z>-47;z-=1)probe(0,c.ARTS_Y,z,'gallery + foyer');
      for(let x=-9;x<=9;x+=3)for(const z of [-20,-30,-42])probe(x,c.ARTS_Y,z,'gallery width');
      for(let z=-50;z>-62;z-=1)probe(0,c.ARTS_Y,z,'opera parterre');
      for(let x=-13;x<=13;x+=4)probe(x,c.ARTS_Y,-52,'opera width');
      for(let z=-64;z>-69;z-=1)probe(0,2.7,z,'stage');
      for(const side of [-1,1]){
        for(let z=-49;z>-57;z-=1)probe(side*13.6,4.5,z,'balcony arm');
        for(let x=-13;x<=13;x+=4)probe(x,4.5,-49.6,'balcony front');
        for(let i=0;i<13;i++)probe(side*14.05,1.9+(i+1)*(4.5-1.9)/13,-57.4-4.6+i*0.34+0.18,'balcony stair');
      }
      return missing;}''')
    walks = page.evaluate('''() => {const c=window.__cruise, out=[];
      function walk(name,start,end){c.ctrl.pos.set(...start);c.ctrl.vel.set(0,0,0);c.ctrl.mode='ground';
        const target=new c.THREE.Vector3(...end),dir=new c.THREE.Vector3();
        const input={pressed:()=>false,down:k=>k==='KeyW',moveVector:v=>v.copy(dir)};
        for(let i=0;i<3600;i++){dir.copy(target).sub(c.ctrl.pos);dir.y=0;if(dir.length()<.2)break;
          dir.normalize();c.ctrl.update(1/60,input,Math.atan2(-dir.x,-dir.z),dir);}
        const error=Math.hypot(c.ctrl.pos.x-end[0],c.ctrl.pos.z-end[2]);
        out.push({name,error:+error.toFixed(2),y:+c.ctrl.pos.y.toFixed(2),
                  ok:error<.5&&Math.abs(c.ctrl.pos.y-end[1])<.4});}
      walk('atrium down to the gallery',[5,8.05,-6.4],[5,1.92,-19]);
      walk('back up to the atrium',[5,1.92,-19],[5,8.05,-6.4]);
      walk('gallery aisle',[5,1.92,-19],[0,1.92,-42]);
      walk('through the foyer',[0,1.92,-42],[0,1.92,-50]);
      walk('into the stalls',[0,1.92,-50],[0,1.92,-60]);
      walk('up to the balcony',[14.05,1.92,-61.4],[14.05,4.52,-57.3]);
      walk('along the balcony arm',[14.05,4.52,-57.3],[13.6,4.52,-49.5]);
      walk('onto the stage',[3.8,1.92,-60.4],[3.8,2.72,-64.5]);
      walk('cabin stairs',[-5,8.02,-5],[-5,3.82,7]);
      return out;}''')
    # Nothing may stick out through the hull: the pocket is all there is.
    fit = page.evaluate('''() => {const c=window.__cruise,w=c.ARTS_WELL,bad=[];
      for(const [n,r] of [['gallery',c.artsGallery],['opera',c.artsOpera]]){
        const bb=new c.THREE.Box3().setFromObject(r.group);
        if(bb.min.x<w.x0||bb.max.x>w.x1||bb.min.z<w.z0||bb.max.z>w.z1||bb.min.y<w.y-0.01||bb.max.y>8.0)
          bad.push({n,min:bb.min.toArray(),max:bb.max.toArray()});}
      return bad;}''')
    report = dict(errors=errors, images=images, checkpoints=reports,
                  missingGround=ground, walks=walks, outsideHull=fit)
    (OUT / 'arts-report.json').write_text(json.dumps(report, indent=2))
    print(json.dumps(report, indent=2), flush=True)
    browser.close()
    assert not errors and len(images) == 8 and all(images) and not ground \
        and not fit and all(w['ok'] for w in walks)
