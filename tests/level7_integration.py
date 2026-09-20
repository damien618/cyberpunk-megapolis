"""Exercise the real city controller, raycasts and apartment envelope.

Run: python3 tests/level7_integration.py (starts a temporary local server).
Screenshots and the detailed report are written to scratch/.
"""
import base64
import json
import os
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'scratch'
OUT.mkdir(exist_ok=True)


class Handler(SimpleHTTPRequestHandler):
    def log_message(self, *_):
        pass


class Server(ThreadingHTTPServer):
    request_queue_size = 128


server = Server(('127.0.0.1', 0), partial(Handler, directory=str(ROOT)))
Thread(target=server.serve_forever, daemon=True).start()
PORT = os.environ.get('CYBERPUNK_PORT', str(server.server_port))

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, args=['--ignore-gpu-blocklist', '--enable-webgl'])
    page = browser.new_page(viewport={'width': 1280, 'height': 800})
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.on('console', lambda msg: print(msg.text, flush=True) if msg.type == 'error' or '[build]' in msg.text else None)

    def instrument(route):
        source = (ROOT / 'main.js').read_text().replace('  animate();', '  /* Manual render in regression test. */')
        source += '''\nwindow.__level7Test = {THREE, scene, world, bw, level7, ctrl, rig, input, camera, renderer,
          groundAt, castRay, players, updateTravelInteraction, leaveApartmentFurniture,
          get chosen(){return chosen}, get phase(){return phase},
          get activeFurnitureInteraction(){return activeFurnitureInteraction}};'''
        route.fulfill(content_type='text/javascript', body=source)

    page.route('**/main.js?*', instrument)
    page.goto(f'http://127.0.0.1:{PORT}/index.html?arrival=apartment', wait_until='domcontentloaded')
    page.wait_for_function('!!window.__level7Test', timeout=180000, polling=100)
    print('City loaded', flush=True)
    page.evaluate("window.__startGame('girl')")
    page.wait_for_timeout(100)
    report = page.evaluate('''async () => {
      const c = window.__level7Test, T = c.THREE, results = [];
      c.scene.updateMatrixWorld(true);
      const check = (name, ok, detail) => results.push({name, ok, detail});
      const reset = pos => { c.ctrl.rescueTo(new T.Vector3(...pos)); c.ctrl.mode = 'ground'; };
      const direction = new T.Vector3();
      let sprint = false;
      const input = {pressed: () => false, down: k => k === 'KeyW' || (sprint && k === 'ShiftLeft'),
        moveVector: v => v.copy(direction)};
      const step = dt => c.ctrl.update(dt, input, Math.atan2(-direction.x, -direction.z), direction);
      const walk = (target, dt = 1/30) => {
        for (let i = 0; i < 180; i++) {
          direction.set(target[0] - c.ctrl.pos.x, 0, target[2] - c.ctrl.pos.z);
          if (direction.length() < .18) break;
          direction.normalize(); step(dt);
        }
        return Math.hypot(c.ctrl.pos.x-target[0], c.ctrl.pos.z-target[2]) < .25
          && Math.abs(c.ctrl.pos.y-target[1]) < .25;
      };

      // Every intended route stays usable, including the previously unsupported threshold.
      reset([-48, .02, 7.7]);
      for (const [name, target] of [
        ['up the stairs', [-48,4.22,15.05]],
        ['left into the corridor', [-53.9,4.22,15.05]],
        ['through door 704', [-53.9,4.22,13.4]],
        ['into the apartment', [-54.5,4.22,12.5]],
        ['back through door 704', [-53.9,4.22,15.05]],
        ['back to the landing', [-48,4.22,15.05]],
        ['down the stairs', [-48,.02,7.7]],
      ]) check(name, walk(target), c.ctrl.pos.toArray());

      // Walk/sprint into the end wall at normal and worst supported frame times.
      for (const dt of [1/60, 1/30, .05]) for (const running of [false,true]) {
        reset([-48,4.22,14.8]); sprint=running; direction.set(0,0,1);
        for(let i=0;i<90;i++) step(dt);
        check(`landing blocks ${running?'sprint':'walk'} at ${Math.round(1/dt)} fps`,
          c.ctrl.pos.z <= 15.54 && Math.abs(c.ctrl.pos.y-4.22)<.05, c.ctrl.pos.toArray());
      }
      // A fast frame arriving from the stairs must also hit the real wall.
      reset([-48,4.22,15.4]); c.ctrl.vel.set(0,0,40); direction.set(0,0,1); step(.05);
      check('swept landing collision', c.ctrl.pos.z <= 15.54, c.ctrl.pos.toArray());
      sprint=true;
      for(const [name,start,dir,valid] of [
        ['rear west corner',[-58.7,4.22,13.3],[0,0,1],p=>p.z<=13.58],
        ['window pane',[-55.3,4.22,8.2],[0,0,-1],p=>p.z>=7.54],
        ['stairwell left wall',[-48.8,3.82,13.7],[-1,0,0],p=>p.x>=-49.09],
      ]) {
        reset(start); direction.set(...dir); for(let i=0;i<50;i++)step(.05);
        check(name, valid(c.ctrl.pos), c.ctrl.pos.toArray());
      }
      for(const z of [13.99,14.05,14.12,14.2,14.24]) {
        const y=c.groundAt(-53.9,z,6,4.22,4.22);
        check(`door threshold support ${z}`, Math.abs(y-4.22)<.01, y);
      }
      // Test above the sill: its collision must not mask a missing glass pane.
      const paneHit=c.castRay(new T.Vector3(-55.3,5.5,8),new T.Vector3(0,0,-1),1.2);
      check('glass pane has a swept-ray surface',!!paneHit && Math.abs(paneHit.point.z-7.12)<.01,
        paneHit?.point.toArray());
      reset([-55.3,5.2,8]); c.ctrl.mode='air'; c.ctrl.vel.set(0,0,-40);
      direction.set(0,0,-1); step(.05);
      check('airborne player cannot cross glass',c.ctrl.pos.z>=7.54,c.ctrl.pos.toArray());
      for (const [name,pos] of [['apartment',[-54.5,4.22,12.5]],['landing',[-48,4.22,15.05]]]) {
        reset(pos); c.ctrl.mode='air'; c.ctrl.vel.set(0,13,0); direction.set(0,0,0);
        let maxY=c.ctrl.pos.y;
        for(let i=0;i<40;i++){step(.05);maxY=Math.max(maxY,c.ctrl.pos.y);}
        check(`${name} ceiling stops a jump vertically`, maxY<=5.321 &&
          Math.hypot(c.ctrl.pos.x-pos[0],c.ctrl.pos.z-pos[2])<.01 &&
          Math.abs(c.ctrl.pos.y-4.22)<.01, {maxY,pos:c.ctrl.pos.toArray()});
      }
      // Probe the actual opaque room shell at several heights and all corners.
      const ray=new T.Raycaster();
      for(const y of [4.35,5.5,6.9]) for(let x=-59.05;x<-51.2;x+=.2) {
        if(x>-54.65 && x<-53.15 && y<6.52) continue; // intentional door opening
        ray.set(new T.Vector3(x,y,13.8),new T.Vector3(0,0,1)); ray.far=.5;
        const hit=ray.intersectObjects(c.level7.collisionMeshes,false)[0];
        check(`rear wall ray ${x.toFixed(2)},${y}`,!!hit,hit?.distance);
      }
      // A close wall must keep both the lens and the avatar inside the landing.
      reset([-48,4.22,15.5]); c.ctrl.vel.set(0,0,0);
      c.rig.initialized=false; c.rig.collT=1; c.rig.blendT=0;
      c.rig.update(1/60,{yaw:0,pitch:0},c.ctrl);
      check('camera stays inside landing wall',c.camera.position.z<15.95,c.camera.position.toArray());
      check('camera stays outside avatar at landing',
        c.camera.position.distanceTo(c.rig.smoothLook)>=1.2,c.camera.position.toArray());

      // Around walls and furniture, every cardinal viewing direction must
      // retain a readable third-person distance instead of entering the body.
      for (const [place,pos] of [['bedroom',[-54.5,4.22,11.2]],['window',[-55.3,4.22,7.8]],
                                  ['rear wall',[-58.7,4.22,13.4]],['corridor',[-53.9,4.22,14.8]]])
        for (const yaw of [0,Math.PI/2,Math.PI,-Math.PI/2]) {
          reset(pos); c.ctrl.vel.set(0,0,0); c.rig.initialized=false;
          c.rig.collT=1;c.rig.occlusionAngle=0;c.rig.blendT=0;
          for(let i=0;i<45;i++)c.rig.update(1/60,{yaw,pitch:0},c.ctrl);
          const distance=c.camera.position.distanceTo(c.rig.smoothLook);
          check(`${place} camera readable at yaw ${yaw.toFixed(2)}`,distance>=1.2,
            {distance,pos:c.camera.position.toArray(),angle:c.rig.occlusionAngle});
        }

      // Holding an arrow key has to turn the view at once. The wall-dodge used
      // to answer each degree of yaw with an opposite offset, so indoors the
      // key appeared dead until the offsets ran out and the view jumped.
      const yawSpeed = 1.8;  // input.js updateLook
      for (const [place,pos] of [['bedroom',[-54.5,4.22,11.2]],['window',[-55.3,4.22,7.8]],
                                  ['rear wall',[-58.7,4.22,13.4]],['corridor',[-53.9,4.22,14.8]],
                                  ['landing',[-48,4.22,15.3]]])
        for (const sign of [1,-1]) {
          reset(pos); c.ctrl.vel.set(0,0,0); c.rig.initialized=false;
          c.rig.collT=1;c.rig.occlusionAngle=0;c.rig.blendT=0;c.rig.prevYaw=null;
          const look={yaw:0,pitch:-.05};
          for(let i=0;i<45;i++)c.rig.update(1/60,look,c.ctrl);   // settle, dodge may engage
          const azimuth=()=>Math.atan2(c.camera.position.x-c.rig.smoothLook.x,
                                       c.camera.position.z-c.rig.smoothLook.z);
          let previous=azimuth(), travelled=0, worstStep=Infinity;
          for(let i=0;i<60;i++){
            look.yaw+=sign*yawSpeed/60; c.rig.update(1/60,look,c.ctrl);
            let d=azimuth()-previous;
            while(d>Math.PI)d-=Math.PI*2; while(d<-Math.PI)d+=Math.PI*2;
            previous+=d; travelled+=d*sign; worstStep=Math.min(worstStep,d*sign);
          }
          const expected=yawSpeed;   // one second of held key, in radians
          check(`${place} view follows a held arrow key (${sign>0?'left':'right'})`,
            travelled>=expected*.7 && worstStep>-1e-3, {travelled,expected,worstStep});
        }

      // The prompt must be a real focused button, and a click must seat the
      // player on the following game frame.
      const chair=c.level7.apartmentFurniture.find(item=>item.type==='sit');
      reset([chair.x,chair.approachY,chair.z]);c.ctrl.mode='ground';
      c.updateTravelInteraction(1/60);
      await new Promise(resolve=>setTimeout(resolve,50));
      const prompt=document.getElementById('furniturePrompt');
      check('gamer prompt is visible with a free pointer',prompt.classList.contains('show') &&
        getComputedStyle(prompt).pointerEvents==='auto' && !document.pointerLockElement && c.phase==='play',
        {shown:prompt.className,active:document.activeElement?.id,phase:c.phase,
          locked:document.pointerLockElement?.tagName});
      prompt.click();
      const lockedOnSeatingFrame=c.updateTravelInteraction(1/60);
      check('gamer prompt click seats player',c.activeFurnitureInteraction?.type==='sit' &&
        c.ctrl.mode==='sit',{active:c.activeFurnitureInteraction?.type,mode:c.ctrl.mode});
      // The frame that seats her must ALSO lock the controller. animate() runs
      // `if (!locked) ctrl.update(...)`, so returning false here integrates one
      // more physics step over an avatar already parked on the cushion — and
      // this seat is pulled up under the desk, i.e. inside its collision
      // volume, so the solver threw her 26 cm backwards into the backrest and
      // the lock then held her there. One frame, permanent result.
      check('the seating frame locks the controller',lockedOnSeatingFrame===true,
        {returned:lockedOnSeatingFrame});
      // And the consequence, checked directly: running the real loop must not
      // move her off the anchor. Every pose measurement in this file places
      // the avatar by hand and so could never have caught that.
      for(let f=0;f<40;f++){
        const locked=c.updateTravelInteraction(1/60);
        if(!locked) c.ctrl.update(1/60,{pressed:()=>false,down:()=>false,
          moveVector:v=>v.set(0,0,0)},0,new T.Vector3(0,0,1));
      }
      check('the seated player stays on the anchor once the loop runs',
        Math.hypot(c.ctrl.pos.x-chair.x,c.ctrl.pos.z-chair.z)<.002 &&
        Math.abs(c.ctrl.pos.y-chair.y)<.002,
        {anchor:[chair.x,chair.y,chair.z],pos:c.ctrl.pos.toArray()});
      check('gamer seat opens with a readable full-body camera',
        c.ctrl.furnitureCamera?.distance>=2.7 && c.ctrl.furnitureCamera?.lookHeight<.9 &&
        Math.abs(c.input.yaw-chair.camera.yaw)<1e-6 && Math.abs(c.input.pitch-chair.camera.pitch)<1e-6,
        {camera:c.ctrl.furnitureCamera,yaw:c.input.yaw,pitch:c.input.pitch});
      const cushion=c.level7.interiorGroup.getObjectByName('Level7_GamerSeat');
      const cushionBounds=new T.Box3().setFromObject(cushion);
      const backBounds=new T.Box3().setFromObject(c.level7.interiorGroup.getObjectByName('Level7_GamerBackrest'));
      // The keyboard has no name of its own; it is the one 0.46 x 0.22 plane.
      let keyboard=null;
      c.level7.interiorGroup.traverse(o=>{ const pr=o.isMesh&&o.geometry?.parameters;
        if(!keyboard&&pr&&Math.abs((pr.width??0)-.46)<1e-6&&Math.abs((pr.height??0)-.22)<1e-6) keyboard=o; });
      const kbBounds=new T.Box3().setFromObject(keyboard);
      check('gamer seat uses the visible cushion surface',
        Math.abs(c.ctrl.pos.y-cushionBounds.max.y)<.002,
        {anchor:c.ctrl.pos.y,surface:cushionBounds.max.y});
      for(const [gender,player] of Object.entries(c.players)) {
        const scale=player.group.scale.clone();
        player.setOutfit({pyjama:true});
        for(let i=0;i<4;i++)player.update({dt:1/60,mode:'sit',pos:c.ctrl.pos,vel:c.ctrl.vel,
          posture:'sit',facingYaw:c.activeFurnitureInteraction.yaw,floorY:chair.approachY,
          seatPose:chair.pose});
        player.group.updateMatrixWorld(true);
        const forward=new T.Vector3(0,0,1).applyQuaternion(player.group.quaternion);
        const hip=player.bones.thigh_l.getWorldPosition(new T.Vector3());
        const knee=player.bones.calf_l.getWorldPosition(new T.Vector3());
        const foot=player.bones.foot_l.getWorldPosition(new T.Vector3());
        const chest=player.bones.spine_03.getWorldPosition(new T.Vector3());
        check(`${gender} faces the gamer screens`,forward.x>.999 && knee.x>hip.x+.2,
          {forward:forward.toArray(),hip:hip.toArray(),knee:knee.toArray()});
        check(`${gender} sits above the cushion with feet at floor height`,
          hip.y>cushionBounds.max.y+.09 && hip.y<cushionBounds.max.y+.35 &&
          foot.y>chair.approachY && foot.y<chair.approachY+.25,
          {hip:hip.toArray(),foot:foot.toArray(),cushion:cushionBounds.max.y});
        check(`${gender} retains normal scale when seated`,player.group.scale.equals(scale),scale.toArray());
        check(`${gender} pelvis clears the backrest and stays over the cushion`,
          hip.x>backBounds.max.x+.08 && hip.x<cushionBounds.max.x-.12,
          {hipX:hip.x,backrestFront:backBounds.max.x,seatFront:cushionBounds.max.x});
        // The thighs must lie ALONG the cushion, not dive through its front
        // lip: at the old 58 cm seat height they dropped 30 cm over their own
        // length and came out of the underside of the seat.
        check(`${gender} thighs rest along the cushion instead of diving through it`,
          hip.y-knee.y<.14 && knee.x>cushionBounds.max.x,
          {hipY:hip.y,kneeY:knee.y,kneeX:knee.x,seatFront:cushionBounds.max.x});
        // Typing, not lounging: the trunk carries ahead of the pelvis and the
        // shoulder blades stay off the backrest. The margin is 1 cm, not the
        // lean itself: the seat states ONE trunk pitch and the two rigs answer
        // it differently — the same -9 deg carries the girl's chest 4.9 cm
        // ahead of her pelvis and the man's 1.9 cm. Both are forward, which is
        // what this checks; the backrest clearance below is what matters.
        check(`${gender} leans into the desk rather than into the backrest`,
          chest.x>hip.x+.01 && chest.x>backBounds.max.x+.15,
          {chestX:chest.x,hipX:hip.x,backrestFront:backBounds.max.x});
        // The source combat trousers have a deliberately loose rear panel.
        // At a 90-degree hip bend it used to fan out behind the chair like a
        // second pelvis, making the seated avatar look cut in half.
        const pyjamaPants=player.wardrobe.pyjamaPants;
        let trouserRear=Infinity;
        if(pyjamaPants){
          const p=new T.Vector3(),pos=pyjamaPants.geometry.attributes.position;
          for(let i=0;i<pos.count;i++){
            pyjamaPants.getVertexPosition(i,p);pyjamaPants.localToWorld(p);
            if(p.y>cushionBounds.max.y-.04&&p.y<cushionBounds.max.y+.42)
              trouserRear=Math.min(trouserRear,p.x);
          }
        }
        check(`${gender} pyjama seat keeps a single body silhouette`,
          Number.isFinite(trouserRear)&&hip.x-trouserRear<.22,
          {hipX:hip.x,trouserRear,rearDepth:hip.x-trouserRear});
        const seatedMeshRear={};
        player.model.traverse(mesh=>{
          if(!mesh.isSkinnedMesh||!mesh.visible)return;
          const mats=Array.isArray(mesh.material)?mesh.material:[mesh.material];
          if(mats.every(m=>!m||m.visible===false))return;
          const p=new T.Vector3(),pos=mesh.geometry.attributes.position;
          let rear=Infinity;
          for(let i=0;i<pos.count;i++){
            mesh.getVertexPosition(i,p);mesh.localToWorld(p);
            if(p.y>cushionBounds.max.y&&p.y<cushionBounds.max.y+.65)rear=Math.min(rear,p.x);
          }
          if(Number.isFinite(rear))seatedMeshRear[mesh.name||mesh.uuid]=hip.x-rear;
        });
        check(`${gender} seated wardrobe keeps one attached silhouette`,
          Object.entries(seatedMeshRear).filter(([name])=>name.startsWith('Wardrobe_'))
            .every(([,depth])=>depth<.22),
          seatedMeshRear);
        if(player.wardrobe.pyjamaTop){
          check(`${gender} pyjama top hem stays fitted behind the chair`,
            seatedMeshRear.Wardrobe_PyjamaTop<.115,
            {rearDepth:seatedMeshRear.Wardrobe_PyjamaTop});
        }
        // The one check that speaks for all of them: no visible skin or
        // garment may be INSIDE any part of the chair. Bones are no use here —
        // the pelvis cleared the backrest by 15 cm while the buttock, which is
        // 15 cm of flesh behind that joint, sat 0.3 mm inside it, and the
        // thigh cleared the cushion top while dipping 2.3 cm into its front
        // lip. So sweep the skinned mesh itself, every vertex, and report the
        // deepest entry with the part it entered.
        let deepest={depth:0,what:null,at:null};
        const vtx=new T.Vector3(), chairParts=[];
        c.level7.interiorGroup.getObjectByName('Level7_GamerChair')
          .traverse(o=>{ if(o.isMesh) chairParts.push({name:o.name||o.geometry.type,
            box:new T.Box3().setFromObject(o)}); });
        player.model.traverse(mesh=>{
          if(!mesh.isSkinnedMesh||!mesh.visible) return;
          const mats=Array.isArray(mesh.material)?mesh.material:[mesh.material];
          if(mats.every(m=>!m||m.visible===false)) return;   // retired wardrobe pieces
          const pos=mesh.geometry.attributes.position;
          for(let i=0;i<pos.count;i++){
            mesh.getVertexPosition(i,vtx); mesh.localToWorld(vtx);
            for(const part of chairParts){
              if(!part.box.containsPoint(vtx)) continue;
              const d=Math.min(vtx.x-part.box.min.x,part.box.max.x-vtx.x,
                               vtx.y-part.box.min.y,part.box.max.y-vtx.y,
                               vtx.z-part.box.min.z,part.box.max.z-vtx.z);
              if(d>deepest.depth) deepest={depth:d,what:`${mesh.name} in ${part.name}`,
                at:[+vtx.x.toFixed(3),+vtx.y.toFixed(3),+vtx.z.toFixed(3)]};
            }
          }
        });
        // 8 mm of give: a cushion is upholstery, and a contact patch that
        // grazes it reads as weight on the seat rather than as a clip.
        check(`${gender} body does not enter the chair`, deepest.depth<.008, deepest);
        // Both wrists land on the board, a knuckle over the keys.
        for(const side of ['l','r']) {
          const wrist=player.bones[`hand_${side}`].getWorldPosition(new T.Vector3());
          check(`${gender} ${side} hand rests on the keyboard`,
            wrist.x>kbBounds.min.x-.12 && wrist.x<kbBounds.max.x &&
            wrist.z>kbBounds.min.z && wrist.z<kbBounds.max.z &&
            wrist.y>kbBounds.max.y && wrist.y<kbBounds.max.y+.12,
            {wrist:wrist.toArray(),keyboard:[kbBounds.min.toArray(),kbBounds.max.toArray()]});
        }
      }
      c.leaveApartmentFurniture();

      return results;
    }''')
    (OUT / 'level7-integration.json').write_text(json.dumps(report, indent=2))
    for result in report:
        if not result['ok']:
            print('FAIL', result, flush=True)
    print(f"{sum(r['ok'] for r in report)}/{len(report)} checks passed", flush=True)

    if os.environ.get('LEVEL7_SEAT_VISUAL') == '1':
        def save_canvas(name):
            encoded = page.evaluate('''() => {
              const c=window.__level7Test,r=c.renderer,gl=r.getContext();
              r.render(c.scene,c.camera);
              const w=r.domElement.width,h=r.domElement.height;
              const raw=new Uint8Array(w*h*4), flipped=new Uint8ClampedArray(w*h*4);
              gl.readPixels(0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,raw);
              for(let y=0;y<h;y++)flipped.set(raw.subarray((h-1-y)*w*4,(h-y)*w*4),y*w*4);
              const copy=document.createElement('canvas');copy.width=w;copy.height=h;
              copy.getContext('2d').putImageData(new ImageData(flipped,w,h),0,0);
              return copy.toDataURL('image/png');
            }''')
            (OUT / name).write_bytes(base64.b64decode(encoded.split(',', 1)[1]))

        page.evaluate('''() => {
          const c=window.__level7Test,chair=c.level7.apartmentFurniture.find(s=>s.type==='sit');
          c.ctrl.pos.set(chair.x,chair.approachY,chair.z);c.ctrl.mode='ground';
          c.updateTravelInteraction(1);document.getElementById('furniturePrompt').click();
          c.updateTravelInteraction(1/60);
          for(let i=0;i<120;i++) {
            c.chosen.update({dt:1/60,mode:'sit',pos:c.ctrl.pos,vel:c.ctrl.vel,
              posture:'sit',facingYaw:chair.yaw,floorY:chair.approachY,seatPose:chair.pose});
            c.rig.update(1/60,c.input,c.ctrl);
          }
          c.renderer.setPixelRatio(1);c.renderer.setSize(640,400,false);
          c.camera.aspect=1.6;c.camera.updateProjectionMatrix();
          c.renderer.shadowMap.enabled=false;
          // Render the actual in-game chair camera rather than a diagnostic
          // free camera: this catches the close wide-angle view that made the
          // avatar appear half-sized even though its scale stayed at one.
          c.renderer.render(c.scene,c.camera);
          for(const id of ['loader','menu','pause'])document.getElementById(id).style.display='none';
        }''')
        save_canvas('level7-gamer-seated.png')
        page.evaluate('''() => {
          const c=window.__level7Test,chair=c.level7.apartmentFurniture.find(s=>s.type==='sit');
          c.camera.position.set(chair.x+.3,chair.y+1.0,chair.z+1.55);
          c.camera.lookAt(chair.x+.3,chair.y+.5,chair.z);
        }''')
        save_canvas('level7-gamer-seated-side.png')
        page.evaluate('''() => {
          const c=window.__level7Test;
          if(c.chosen.wardrobe?.pyjamaPants)c.chosen.wardrobe.pyjamaPants.visible=false;
          c.renderer.render(c.scene,c.camera);
        }''')
        save_canvas('level7-gamer-seated-side-no-pants.png')

    if os.environ.get('LEVEL7_FAST') != '1':
        camera_report = page.evaluate('''() => {
          const c=window.__level7Test, dt=1/60;
          c.ctrl.rescueTo(new c.THREE.Vector3(-54.5,4.22,11.2));
          c.ctrl.mode='ground';c.ctrl.vel.set(0,0,0);
          c.rig.initialized=false;c.rig.collT=1;c.rig.occlusionAngle=0;c.rig.blendT=0;
          for(let i=0;i<90;i++)c.rig.update(dt,{yaw:-Math.PI/2,pitch:-.05},c.ctrl);
          c.chosen.update({dt,mode:c.ctrl.mode,pos:c.ctrl.pos,vel:c.ctrl.vel});
          c.renderer.setPixelRatio(1);c.renderer.shadowMap.enabled=false;
          c.renderer.render(c.scene,c.camera);
          document.getElementById('loader').style.display='none';
          document.getElementById('menu')?.classList.remove('show');
          return {camera:c.camera.position.toArray(),player:c.ctrl.pos.toArray(),
            distance:c.camera.position.distanceTo(c.rig.smoothLook),angle:c.rig.occlusionAngle};
        }''')
        print('Player camera', camera_report, flush=True)
        page.screenshot(path=str(OUT / 'level7-player-camera.png'),timeout=120000)

    for name, cam, target in [
        ('rear-wall', [-54.7,5.9,10.7], [-58.4,5.6,14]),
        ('landing', [-48,5.8,13.5], [-49.2,5.5,15.95]),
        ('door', [-54.2,5.8,12.5], [-53.9,5.5,15.5]),
    ]:
        if os.environ.get('LEVEL7_FAST') == '1':
            break
        if os.environ.get('LEVEL7_CAMERA_ONLY') == '1':
            break
        page.evaluate('''a => {const c=window.__level7Test;
          c.renderer.setPixelRatio(1);c.renderer.shadowMap.enabled=false;
          c.camera.position.set(...a.cam);c.camera.lookAt(...a.target);
          c.renderer.render(c.scene,c.camera);
          document.getElementById('loader').style.display='none';
          document.getElementById('menu')?.classList.remove('show');
        }''', dict(cam=cam,target=target))
        page.screenshot(path=str(OUT / f'level7-{name}.png'),timeout=120000)
    browser.close()
    assert not errors, errors
    assert all(result['ok'] for result in report), 'See scratch/level7-integration.json'
