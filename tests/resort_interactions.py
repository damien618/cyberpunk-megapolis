import json
from resort_harness import resort_page, check, ROOT
with resort_page(url='index.html?map=resort&arrival=jungle&time=sunset') as (page, errors):
    result = page.evaluate('''async () => {
      const v=window.__resort,L=v.layout,r={};
      r.arrival=v.ctrl.pos.x===L.FOREST_ARRIVAL.x;
      r.time=v.time==='sunset';r.travel=v.interactions.travel.url().includes('time=sunset')&&v.interactions.travel.url().includes('map=jungle');
      v.ctrl.pos.set(L.HAMMOCK.returnX,L.terrainHeight(L.HAMMOCK.returnX,L.HAMMOCK.returnZ),L.HAMMOCK.returnZ);v.ctrl.mode='ground';
      v.interactions.update();r.hammockPrompt=!v.interactions.prompt.hidden;
      v.interactions.lie();r.lying=v.ctrl.mode==='lie'&&v.interactions.resting;
      v.player.update({dt:.016,mode:'lie',pos:v.ctrl.pos,vel:v.ctrl.vel,webOn:false,anchor:v.ctrl.anchor,posture:'lie',facingYaw:L.HAMMOCK.yaw});
      v.input.justPressed.add('KeyE');v.interactions.update();v.input.endFrame();
      r.exit=v.ctrl.mode==='ground'&&!v.interactions.resting&&v.ctrl.pos.z===L.HAMMOCK.returnZ;
      v.interactions.update();r.noInstantRepeat=v.interactions.prompt.hidden;
      v.setResortTime('night');v.atmosphere.update(3,v.ctrl.pos);r.night=v.time==='night'&&v.atmosphere.lights.filter(l=>l.visible).length<=6;
      v.setResortTime('day');v.atmosphere.update(3,v.ctrl.pos);r.day=v.time==='day'&&v.atmosphere.lights.every(l=>!l.visible);
      r.oneSelected=document.querySelectorAll('[data-resort-time].active').length===1;
      return r;
    }''')
    print(json.dumps(result, indent=2))
    for name, ok in result.items():
        check(name, ok)

# Drive the production frame, keyboard handlers and clickable actions deterministically.
# Defer GPU draws to the explicit capture renders so repeated input checks do
# not build up a SwiftShader queue; controller, player and camera still update.
with resort_page(viewport={'width':1280,'height':800}) as (page, errors):
    page.evaluate("async () => {await window.__resort.guestsReady;const v=window.__resort;window.__renderResort=v.renderer.render.bind(v.renderer);v.renderer.render=()=>{};window.__stepResort=()=>{const raf=window.requestAnimationFrame;window.requestAnimationFrame=()=>0;try{window.__testAnimate();}finally{window.requestAnimationFrame=raf;}};window.__startResort();}")
    result=page.evaluate("""() => {
      const v=window.__resort,L=v.layout,b=L.PLAYER_BUNGALOW,c=v.interactions.lounger,r={};
      r.reserved=L.BUNGALOWS.includes(b)&&b.id===L.PLAYER_BUNGALOW_ID&&b.kind==='water'&&!b.premium;
      const arrows=[];v.scene.traverse(o=>{if(o.name==='player-bungalow-arrow')arrows.push(o);});
      const a=arrows[0];r.oneArrow=arrows.length===1;
      r.arrowAbove=a.position.toArray().every(Number.isFinite)&&a.position.x===b.x&&a.position.z===b.z&&a.position.y>b.y+6.8&&a.userData.buildingId===b.id;
      v.props.update(0,v.ocean);const y=a.position.y;v.props.update(Math.PI/2/1.4,v.ocean);
      r.bob=a.position.y-y>.15&&a.position.y-y<.25;v.props.update(0,v.ocean);
      v.props.update(-Math.PI/2/1.4,v.ocean);
      r.arrowClearsRoof=new v.THREE.Box3().setFromObject(a).min.y>b.y+6.7;v.props.update(0,v.ocean);
      r.ownLounger=c.buildingId===b.id&&v.props.furniture.find(f=>f.id===b.id).loungerPoints.some(p=>p.id===c.id&&p.world.x===c.world.x&&p.world.z===c.world.z);
      r.unoccupied=!v.guests.people.some(p=>p.buildingId===b.id);
      const local=L.toLocal(b,c.exit.x,c.exit.z);
      r.safeExit=Object.values(c.exit).every(Number.isFinite)&&Math.abs(local.x)<b.w/2-.35&&local.z>b.d/2+.35&&local.z<b.d/2+b.terrace-.35&&c.exit.y===b.y+.015&&Math.abs(v.collision.groundFn(c.exit.x,c.exit.z,c.exit.y+3,c.exit.y,c.exit.y)-c.exit.y)<.001;
      // Capsule clearance against the actual oriented solid proxies, excluding floor.
      r.clearExit=v.bw.aabbs.every(box=>{
        if(!box.collide||box.groundOnly||c.exit.y+1.7<box.y0||c.exit.y>box.y1)return true;
        const p=L.toLocal(box.obb,c.exit.x,c.exit.z);
        return Math.abs(p.x)>box.obb.w/2+.3||Math.abs(p.z)>box.obb.d/2+.3;
      });
      r.otherRooms=L.BUILDINGS.filter(b=>['water','garden'].includes(b.kind)&&b.id!==L.PLAYER_BUNGALOW_ID).every(b=>{
        const f=v.props.furniture.find(f=>f.id===b.id);
        return f.loungerPoints.every(p=>{v.ctrl.pos.set(p.approach.x,p.approach.y,p.approach.z);v.ctrl.mode='ground';v.interactions.update();return v.interactions.prompt.hidden&&v.interactions.liePrompt.hidden;});
      });
      const decorative=v.props.furniture.find(f=>f.id===b.id).loungerPoints[0];
      v.ctrl.pos.set(decorative.approach.x,decorative.approach.y,decorative.approach.z);v.interactions.update();
      r.secondLoungerDecorative=v.interactions.prompt.hidden&&v.interactions.liePrompt.hidden;
      // The water below the same X/Z must never trigger furniture actions.
      v.ctrl.pos.set(c.approach.x,-1,c.approach.z);v.ctrl.mode='ground';v.interactions.update();r.notUnderDeck=v.interactions.prompt.hidden;
      return r;
    }""")
    for name,ok in result.items(): check(name,ok)
    def approach():
        page.evaluate("""() => {const v=window.__resort,c=v.interactions.lounger;v.ctrl.pos.set(0,2,30);v.ctrl.mode='ground';v.interactions.update();v.ctrl.pos.set(c.approach.x,c.approach.y,c.approach.z);window.__stepResort();}""")
    def frame(): page.evaluate('window.__stepResort()')
    approach()
    check('two accessible keyboard actions',page.evaluate("""() => {const i=window.__resort.interactions;return !i.prompt.hidden&&!i.liePrompt.hidden&&i.prompt.textContent.includes('S’asseoir')&&i.liePrompt.textContent.includes('R · S’allonger')&&!!i.prompt.getAttribute('aria-label')&&!!i.liePrompt.getAttribute('aria-label');}"""))
    check('travel priority over lounger',page.evaluate("""() => {const i=window.__resort.interactions,near=i.travel.near;i.travel.near=()=>true;i.update();const ok=i.prompt.textContent.includes('Retour')&&i.liePrompt.hidden;i.travel.near=near;i.update();return ok;}"""))
    for posture in ['sit','lie']:
        for wake in ['e','Space','w','a','s','d','z','q','click']:
            approach()
            # Exercise both real buttons and both advertised keyboard shortcuts.
            if wake in ['e','w','s','z']:
                page.keyboard.press('e' if posture=='sit' else 'r');frame()
            else:
                page.locator('#resortAction' if posture=='sit' else '#resortLieAction').click();frame()
            check(f'{posture}/{wake}: production pose and controller blocked',page.evaluate("""posture => {
              const v=window.__resort,i=v.interactions,c=v.ctrl,p=v.player;
              const before=c.pos.clone();v.input.keys.add('KeyW');window.__stepResort();v.input.keys.clear();
              return c.mode===posture&&i.restState===`lounger-${posture}`&&i.posture===posture&&c.pos.equals(before)&&c.vel.length()===0&&Math.abs(p.group.rotation.y-i.lounger.yaw)<.001&&
                (posture==='sit'?Math.abs(p.poseRoot.rotation.x)<.001:Math.abs(p.poseRoot.rotation.x+Math.PI/2)<.001)&&!i.prompt.hidden&&i.liePrompt.hidden;
            }""",posture))
            if wake=='click': page.locator('#resortAction').click()
            else: page.keyboard.press(wake)
            frame()
            check(f'{posture}/{wake}: safe wake and no repeat',page.evaluate("""() => {
              const v=window.__resort,i=v.interactions,c=v.ctrl,e=i.lounger.exit;
              const exact=c.mode==='ground'&&!i.resting&&c.pos.x===e.x&&c.pos.y===e.y&&c.pos.z===e.z&&c.prevY===e.y&&c.vel.length()===0&&c.furnitureCamera===null&&v.player.group.rotation.x===0;
              i.update();return exact&&i.prompt.hidden&&i.liePrompt.hidden;
            }"""))
    approach();page.locator('#resortAction').click();frame()
    page.keyboard.press('Escape');frame()
    check('Escape pauses without waking',page.evaluate("window.__resort.interactions.restState==='lounger-sit'&&document.getElementById('overlay').style.display==='flex'&&window.__resort.interactions.prompt.hidden&&window.__resort.interactions.liePrompt.hidden"))
    page.keyboard.press('Enter');frame()
    check('resume restores wake action',page.locator('#resortAction').is_visible())
    # Extreme orbit pitches stay above the deck; existing hammock defaults remain intact.
    check('rest camera above deck and finite',page.evaluate("""() => {const v=window.__resort;return [-1.25,1.35].every(p=>{v.input.pitch=p;for(let k=0;k<90;k++)v.rig.update(1/60,v.input,v.ctrl);return v.camera.position.toArray().every(Number.isFinite)&&v.camera.position.y>=v.layout.PLAYER_BUNGALOW.y+.85;});}"""))
    page.locator('#resortAction').click();frame()
    (ROOT/'scratch').mkdir(exist_ok=True)
    shots=[]
    for view in ['bungalow','sit','lie']:
        approach()
        if view!='bungalow':
            page.locator('#resortAction' if view=='sit' else '#resortLieAction').click();frame()
        for hour in (['day','sunset','night'] if view=='bungalow' else ['day']):
            stats=page.evaluate("""([view,hour]) => {
              const v=window.__resort,b=v.layout.PLAYER_BUNGALOW,c=v.interactions.lounger;
              const eye=view==='bungalow'?[13,11,-12]:[4.4,3.2,8.9],aim=view==='bungalow'?[0,3,0]:[c.local.x,.9,c.local.z];
              const e=v.layout.localPoint(b,eye[0],eye[2]),a=v.layout.localPoint(b,aim[0],aim[2]);
              v.setResortTime(hour,true);v.camera.position.set(e.x,b.y+eye[1],e.z);v.camera.lookAt(a.x,b.y+aim[1],a.z);
              v.atmosphere.update(0,v.ctrl.pos);v.architecture.update(v.camera.position);v.batch.update(v.camera.position);v.vegetation.update(v.camera.position,0);window.__renderResort(v.scene,v.camera);
              return {view,hour,calls:v.renderer.info.render.calls,triangles:v.renderer.info.render.triangles};
            }""",[view,hour])
            shots.append(stats);page.screenshot(path=str(ROOT/'scratch'/f'resort_player_{view}_{hour}.png'),timeout=120000)
        if view!='bungalow': page.locator('#resortAction').click();frame()
    print(json.dumps(shots,indent=2))
    check('reservation views within render budget',all(s['calls']<=250 and s['triangles']<=800000 for s in shots))
    check('arrow geometry and material disposed',page.evaluate("""() => {const v=window.__resort,a=v.props.arrow;let geometry=0,material=0;for(const m of a.children)m.geometry.addEventListener('dispose',()=>geometry++);a.children[0].material.addEventListener('dispose',()=>material++);v.dispose();return geometry===2&&material===1;}"""))

# Indoor furniture uses the same anchors as its instanced construction.
with resort_page(viewport={'width':1280,'height':800}) as (page, errors):
    page.evaluate("async () => {await window.__resort.guestsReady;const v=window.__resort;window.__renderResort=v.renderer.render.bind(v.renderer);v.renderer.render=()=>{};window.__stepResort=()=>{const raf=window.requestAnimationFrame;window.requestAnimationFrame=()=>0;try{window.__testAnimate();}finally{window.requestAnimationFrame=raf;}};window.__startResort();}")
    result=page.evaluate("""async () => {
      const v=window.__resort,L=v.layout,b=L.PLAYER_BUNGALOW,r={},
        {getBungalowFurnitureAnchors}=await import('./resortFurniture.js'),f=v.interactions.furniture;
      const clear=p=>v.bw.aabbs.every(box=>{
        if(!box.collide||box.groundOnly||p.y+1.7<box.y0||p.y>box.y1)return true;
        const q=L.toLocal(box.obb,p.x,p.z);
        return Math.abs(q.x)>box.obb.w/2+.3||Math.abs(q.z)>box.obb.d/2+.3;
      });
      const rendered=v.props.furniture.find(a=>a.id===b.id).furnitureAnchors;
      r.sharedAnchors=['bed','bench'].every(key=>JSON.stringify(f[key])===JSON.stringify(rendered[key])&&JSON.stringify(f[key])===JSON.stringify(getBungalowFurnitureAnchors(b)[key]));
      r.reservedOnly=Object.values(f).every(a=>a.buildingId===L.PLAYER_BUNGALOW_ID);
      r.finite=Object.values(f).every(a=>[a.world,a.lie,a.exit,a.approach].every(p=>Object.values(p).every(Number.isFinite)));
      r.interiorAndClear=Object.values(f).every(a=>{
        const p=L.toLocal(b,a.exit.x,a.exit.z),w=L.toLocal(b,a.world.x,a.world.z);
        return Math.abs(p.x)<b.w/2-.35&&Math.abs(p.z)<b.d/2-.35&&Math.abs(w.z)<b.d/2&&clear(a.exit)&&a.exit.y===b.y+.015&&
          Math.abs(v.collision.groundFn(a.exit.x,a.exit.z,a.exit.y+3,a.exit.y,a.exit.y)-a.exit.y)<.001;
      });
      r.otherRooms=L.BUILDINGS.filter(a=>['water','garden'].includes(a.kind)&&a.id!==b.id).every(a=>Object.values(getBungalowFurnitureAnchors(a)).every(t=>{
        v.ctrl.pos.set(t.approach.x,t.approach.y,t.approach.z);v.ctrl.mode='ground';v.interactions.update();
        return v.interactions.prompt.hidden&&v.interactions.liePrompt.hidden;
      }));
      r.wallsAndOtherSpaces=[[3.1,-.65],[-3.1,2.35],[0,4.3],[-1.6,4.3],[2.05,2],[0,-4.2],[0,-.8]].every(([x,z])=>{
        const p=L.localPoint(b,x,z);v.ctrl.pos.set(p.x,b.y+.015,p.z);v.ctrl.mode='ground';v.interactions.update();
        return v.interactions.prompt.hidden&&v.interactions.liePrompt.hidden;
      });
      r.groundOnly=['swim','air'].every(mode=>Object.values(f).every(a=>{
        v.ctrl.pos.set(a.approach.x,a.approach.y,a.approach.z);v.ctrl.mode=mode;v.interactions.update();return v.interactions.prompt.hidden;
      }));
      r.notBelowFloor=Object.values(f).every(a=>{
        v.ctrl.pos.set(a.approach.x,-1,a.approach.z);v.ctrl.mode='ground';v.interactions.update();return v.interactions.prompt.hidden;
      });
      return r;
    }""")
    for name,ok in result.items(): check(name,ok)
    def frame(): page.evaluate('window.__stepResort()')
    def approach(key):
        page.evaluate("""key=>{const v=window.__resort,a=v.interactions.furniture[key];v.ctrl.pos.set(0,2,30);v.ctrl.mode='ground';v.interactions.update();v.ctrl.pos.set(a.approach.x,a.approach.y,a.approach.z);v.ctrl.prevY=a.approach.y;v.ctrl.vel.set(0,0,0);window.__stepResort();}""",key)
    for key,label in [('bed','S’allonger dans le lit'),('bench','S’allonger sur la banquette')]:
        approach(key)
        check(f'{key}: travel has priority',page.evaluate("""()=>{
          const i=window.__resort.interactions,near=i.travel.near;i.travel.near=()=>true;i.update();
          const ok=i.prompt.textContent.includes('Retour')&&i.liePrompt.hidden;i.travel.near=near;i.update();return ok;
        }"""))
        for wake in ['e','Space','w','a','s','d','z','q','click']:
            approach(key)
            check(f'{key}/{wake}: single French prompt',page.evaluate("""label=>{const i=window.__resort.interactions;return !i.prompt.hidden&&i.liePrompt.hidden&&i.prompt.textContent.includes(label);}""",label))
            if wake in ['e','w','s','z']: page.keyboard.press('e');frame()
            else: page.locator('#resortAction').click();frame()
            check(f'{key}/{wake}: production pose holds controller',page.evaluate("""key=>{
              const v=window.__resort,i=v.interactions,a=i.furniture[key],before=v.ctrl.pos.clone();
              v.input.keys.add('KeyW');v.ctrl.vel.set(3,-4,5);window.__stepResort();v.input.keys.clear();
              return i.restState===`${key}-lie`&&i.posture==='lie'&&i.restTarget===a&&v.ctrl.mode==='lie'&&v.ctrl.pos.equals(before)&&v.ctrl.vel.length()===0&&
                Math.abs(v.player.group.rotation.y-a.yaw)<.001&&Math.abs(v.player.poseRoot.rotation.x+Math.PI/2)<.001&&v.player.group.rotation.x===0&&
                !i.prompt.hidden&&i.prompt.textContent==='E · Se relever'&&i.liePrompt.hidden&&Math.abs(a.yaw-(key==='bed'?v.layout.PLAYER_BUNGALOW.yaw:v.layout.PLAYER_BUNGALOW.yaw-Math.PI/2))<.001;
            }""",key))
            if wake=='click': page.locator('#resortAction').click()
            else: page.keyboard.press(wake)
            frame()
            check(f'{key}/{wake}: safe wake without repeat',page.evaluate("""key=>{
              const v=window.__resort,i=v.interactions,c=v.ctrl,e=i.furniture[key].exit;
              const ok=c.mode==='ground'&&!i.resting&&c.pos.x===e.x&&c.pos.y===e.y&&c.pos.z===e.z&&c.prevY===e.y&&c.vel.length()===0&&c.furnitureCamera===null&&v.player.group.rotation.x===0&&v.player.group.rotation.z===0;
              i.update();return ok&&i.prompt.hidden&&i.liePrompt.hidden;
            }""",key))
        approach(key);page.keyboard.press('e');frame()
        check(f'{key}: camera stays inside at every angle, including entry',page.evaluate("""key=>{
          const v=window.__resort,a=v.interactions.furniture[key],b=v.layout.PLAYER_BUNGALOW;
          const inside=()=>{const p=v.layout.toLocal(b,v.camera.position.x,v.camera.position.z);
            return v.camera.position.toArray().every(Number.isFinite)&&Math.abs(p.x)<=b.w/2-.39&&Math.abs(p.z)<=b.d/2-.39&&v.camera.position.y>=a.camera.minY&&v.camera.position.y<=a.camera.maxY;
          };
          if(!inside())return false;
          v.rig.blendT=0;
          return [-1.25,-.28,1.35].every(pitch=>[0,Math.PI/2,Math.PI,Math.PI*1.5].every(yaw=>{
            v.input.pitch=pitch;v.input.yaw=b.yaw+yaw;for(let n=0;n<90;n++)v.rig.update(1/60,v.input,v.ctrl);return inside();
          }));
        }""",key))
        page.keyboard.press('Escape');frame()
        check(f'{key}: Escape pauses',page.evaluate("window.__resort.interactions.resting&&document.getElementById('overlay').style.display==='flex'&&window.__resort.interactions.prompt.hidden"))
        page.keyboard.press('Enter');frame();page.keyboard.press('e');frame()
    (ROOT/'scratch').mkdir(exist_ok=True)
    shots=[]
    views=[('bed_side','bed',[2.5,1.7,-.7]),('bed_foot','bed',[.2,1.8,1.6]),
           ('bench_inside','bench',[-1.7,1.65,3.5]),('bench_entry','bench',[.35,1.7,3.5]),
           ('bed_exit','bed',[1.9,2.1,2.1]),('bench_exit','bench',[.5,2,3.5]),
           ('bed_night','bed',[2.5,1.7,-.7]),('bench_night','bench',[-1.7,1.65,3.5])]
    for view,key,eye in views:
        approach(key);page.keyboard.press('e');frame()
        if view.endswith('exit'): page.keyboard.press('e');frame()
        stats=page.evaluate("""([view,key,eye])=>{
          const v=window.__resort,b=v.layout.PLAYER_BUNGALOW,a=v.interactions.furniture[key],p=v.layout.localPoint(b,eye[0],eye[2]);
          v.setResortTime(view.endsWith('night')?'night':'day',true);
          const target=view.endsWith('exit')?v.ctrl.pos:a.world;
          v.camera.position.set(p.x,b.y+eye[1],p.z);v.camera.lookAt(target.x,target.y+(view.endsWith('exit')?.8:.2),target.z);
          v.atmosphere.update(0,v.ctrl.pos);v.architecture.update(v.camera.position);v.batch.update(v.camera.position);v.vegetation.update(v.camera.position,0);v.guests.update(0,0,v.camera.position);window.__renderResort(v.scene,v.camera);
          return {view,calls:v.renderer.info.render.calls,triangles:v.renderer.info.render.triangles};
        }""",[view,key,eye])
        shots.append(stats);page.screenshot(path=str(ROOT/'scratch'/f'resort_indoor_{view}.png'),timeout=120000)
        if not view.endswith('exit'): page.keyboard.press('e');frame()
    print(json.dumps(shots,indent=2))
    check('indoor views within render budget',all(s['calls']<=250 and s['triangles']<=800000 for s in shots))

# Exercise the real navigation and the jungle's sunset compatibility.
with resort_page(url='index.html?map=resort&arrival=jungle&time=sunset') as (page, errors):
    page.evaluate('window.__resort.interactions.travel.go()')
    page.wait_for_url('**map=jungle&arrival=resort&time=sunset', timeout=30000)
    page.wait_for_function('window.__jungle && window.__jungle.resortTravel', timeout=180000)
    check('jungle keeps sunset, renders day', page.evaluate("window.__jungle.jungleTime === 'day' && window.__jungle.islandTravelTime === 'sunset'"))
    check('arrival outside return trigger', page.evaluate('!window.__jungle.resortTravel.near(window.__jungle.ctrl.pos)'))
    check('forest branch reaches the resort gate', page.evaluate('''() => {
      const v=window.__jungle,c=v.ctrl,i=v.input,points=v.resortPathPoints;
      c.rescueTo(new v.THREE.Vector3(points[0][0],v.terrainHeight(...points[0])+.015,points[0][1]));
      c.mode='ground';i.keys.clear();i.keys.add('KeyW');let reached=true;
      for(const [x,z] of points.slice(1)){
        let done=false;
        for(let n=0;n<900;n++){
          if(Math.hypot(x-c.pos.x,z-c.pos.z)<.3){done=true;break;}
          i.yaw=Math.atan2(-(x-c.pos.x),-(z-c.pos.z));
          c.update(1/60,i,i.yaw,new v.THREE.Vector3(-Math.sin(i.yaw),0,-Math.cos(i.yaw)));i.endFrame();
        }
        if(!done){reached=false;break;}
      }
      i.keys.clear();return reached&&v.resortTravel.near(c.pos);
    }'''))
    page.evaluate('window.__jungle.resortTravel.go()')
    page.wait_for_url('**map=resort&arrival=jungle&time=sunset', timeout=30000)
    page.wait_for_function('window.__resort && window.__resort.time === "sunset"', timeout=180000)
    check('round trip preserves hour', True)
