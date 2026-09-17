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
FAST = os.environ.get('CRUISE_FAST') == '1'
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
        if not FAST:
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
        for(let x=-10;x<=10;x+=5)probe(x,4.5,-50.1,'balcony cross aisle');
        for(let x=-10;x<=10;x+=5)probe(x,4.5,-52.6,'balcony rail promenade');
        for(let i=0;i<13;i++)probe(side*13.675,1.9+(i+1)*(4.5-1.9)/13,
                                  -57.4-0.185-(12-i)*0.3,'balcony stair');
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
      function route(name,side){
        c.ctrl.pos.set(side*11.0,1.92,-55.0);c.ctrl.vel.set(0,0,0);c.ctrl.mode='ground';
        const dir=new c.THREE.Vector3();
        const input={pressed:()=>false,down:k=>k==='KeyW',moveVector:v=>v.copy(dir)};
        for(const end of [[side*11.0,1.92,-61.9],[side*13.55,1.92,-61.9],
                          [side*13.675,4.52,-57.15],
                          [side*13.35,4.52,-55.8],[side*13.35,4.52,-50.1],
                          [side*11.15,4.52,-50.1],[0,4.52,-50.1],
                          [side*11.15,4.52,-52.6],[0,4.52,-52.6]]){
          const target=new c.THREE.Vector3(...end);
          for(let i=0;i<1200;i++){dir.copy(target).sub(c.ctrl.pos);dir.y=0;if(dir.length()<.2)break;
            dir.normalize();c.ctrl.update(1/60,input,Math.atan2(-dir.x,-dir.z),dir);}
        }
        const error=Math.hypot(c.ctrl.pos.x,c.ctrl.pos.z+52.6);
        out.push({name,error:+error.toFixed(2),y:+c.ctrl.pos.y.toFixed(2),
                  ok:error<.5&&Math.abs(c.ctrl.pos.y-4.52)<.4});}
      walk('atrium down to the gallery',[5,8.05,-6.4],[5,1.92,-19]);
      walk('back up to the atrium',[5,1.92,-19],[5,8.05,-6.4]);
      walk('gallery aisle',[5,1.92,-19],[0,1.92,-42]);
      walk('through the foyer',[0,1.92,-42],[0,1.92,-50]);
      walk('into the stalls',[0,1.92,-50],[0,1.92,-60]);
      route('starboard stair through landing into balcony seats',1);
      route('port stair through landing into balcony seats',-1);
      walk('along the balcony arm',[14.05,4.52,-57.3],[13.6,4.52,-49.5]);
      walk('onto the stage',[3.8,1.92,-60.4],[3.8,2.72,-64.5]);
      walk('cabin stairs',[-5,8.02,-5],[-5,3.82,7]);
      return out;}''')
    # The cross aisle between the two balcony rows has to be a passage, not a
    # gap to shuffle through, and the front row must not stand in the rail.
    aisle = page.evaluate('''() => {const c=window.__cruise,out=[];
      const dir=new c.THREE.Vector3();
      const input={pressed:()=>false,down:k=>k==='KeyW',moveVector:v=>v.copy(dir)};
      const reach=(x,from,to)=>{c.ctrl.pos.set(x,4.52,from);c.ctrl.vel.set(0,0,0);c.ctrl.mode='ground';
        const t=new c.THREE.Vector3(x,4.52,to);
        for(let i=0;i<600;i++){dir.copy(t).sub(c.ctrl.pos);dir.y=0;if(dir.length()<.15)break;
          dir.normalize();c.ctrl.update(1/60,input,Math.atan2(-dir.x,-dir.z),dir);}
        return c.ctrl.pos.z;};
      for(const x of [0.4,4,8,10]){
        const aft=reach(x,-50.1,-54),fwd=reach(x,-50.1,-46);
        out.push({where:'cross aisle',x,width:+(fwd-aft).toFixed(2)});}
      for(const x of [0.4,4,8,10]){
        const aft=reach(x,-52.6,-56),fwd=reach(x,-52.6,-48);
        out.push({where:'rail promenade',x,width:+(fwd-aft).toFixed(2)});}
      return out;}''')

    # The swell is 2.75 m of real geometry over a deck floored at 1.9. Pitch the
    # camera down in the gallery — the boom goes up through the deckhead — and
    # the sea still must not be drawn.
    sea = page.evaluate('''async () => {const c=window.__cruise,out=[];
      c.rig.update=window._rigUpdate;                 // the checkpoints froze it
      const s=c.scene.children.find(o=>o.geometry&&o.geometry.parameters
        &&o.geometry.parameters.width===3600);
      const frame=()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
      // The last four are on and under the atrium's flight, where the ceiling
      // is cut open: that well is the one place the boom can leave the hold
      // while she is still in it, and it is where the swell used to show.
      for(const [name,pos] of [['gallery',[0,1.92,-22]],['foyer',[0,1.92,-46]],
                               ['stalls',[0,1.92,-56]],['balcony',[13.6,4.52,-52]],
                               ['stair-top',[5,7.4,-8.5]],['stair-mid',[5,5.0,-12]],
                               ['stair-foot',[5,2.0,-16.5]],['under-well',[5,1.92,-19]]])
        for(const pitch of [0,-0.5,-0.9,-1.2]){
          c.ctrl.pos.set(...pos);c.ctrl.vel.set(0,0,0);c.ctrl.mode='ground';
          c.input.pitch=pitch;
          await frame();await frame();
          const cp=c.camera.position,w=c.ARTS_WELL;
          // What the old camera-only rule would have decided, for comparison.
          const wasHidden=cp.y<7.6&&cp.x>w.x0-1&&cp.x<w.x1+1&&cp.z>w.z0-1&&cp.z<w.z1+1;
          out.push({name,pitch,camY:+cp.y.toFixed(2),visible:s.visible,
                    cameraOnlyRuleWouldShowIt:!wasHidden});}
      c.input.pitch=0;c.rig.update=()=>{};
      return out;}''')

    # The side aisles feed the two flights: measure what the capsule can
    # actually use between the last seat and the stair's balustrade.
    sideAisle = page.evaluate('''() => {const c=window.__cruise,out=[];
      const dir=new c.THREE.Vector3();
      const input={pressed:()=>false,down:k=>k==='KeyW',moveVector:v=>v.copy(dir)};
      const reach=(z,from,to)=>{c.ctrl.pos.set(from,1.92,z);c.ctrl.vel.set(0,0,0);c.ctrl.mode='ground';
        const t=new c.THREE.Vector3(to,1.92,z);
        for(let i=0;i<700;i++){dir.copy(t).sub(c.ctrl.pos);dir.y=0;if(dir.length()<.15)break;
          dir.normalize();c.ctrl.update(1/60,input,Math.atan2(-dir.x,-dir.z),dir);}
        return c.ctrl.pos.x;};
      for(const z of [-52,-55,-58,-61]){
        const inb=reach(z,12.2,0);
        out.push({z,inboardEdge:+inb.toFixed(2),width:+(12.53-inb).toFixed(2)});}
      return out;}''')

    # Nothing may stick out through the hull: the pocket is all there is.
    fit = page.evaluate('''() => {const c=window.__cruise,w=c.ARTS_WELL,bad=[];
      for(const [n,r] of [['gallery',c.artsGallery],['opera',c.artsOpera]]){
        const bb=new c.THREE.Box3().setFromObject(r.group);
        if(bb.min.x<w.x0||bb.max.x>w.x1||bb.min.z<w.z0||bb.max.z>w.z1||bb.min.y<w.y-0.01||bb.max.y>8.0)
          bad.push({n,min:bb.min.toArray(),max:bb.max.toArray()});}
      return bad;}''')
    report = dict(errors=errors, images=images, checkpoints=reports,
                  missingGround=ground, walks=walks, outsideHull=fit,
                  balconyAisle=aisle, sideAisle=sideAisle, seaInHold=sea)
    (OUT / 'arts-report.json').write_text(json.dumps(report, indent=2))
    print(json.dumps(report, indent=2), flush=True)
    browser.close()
    assert not errors and len(images) == 8 and all(images) and not ground \
        and not fit and all(w['ok'] for w in walks) \
        and all(a['width'] > 1.0 for a in aisle) \
        and all(a['width'] > 1.9 for a in sideAisle) \
        and not any(s['visible'] for s in sea)
