import json
from resort_harness import resort_page, check
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
