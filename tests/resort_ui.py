"""Check avatar poses, time selection and the running pause/resume flow."""
from resort_harness import resort_page,ROOT,check
with resort_page() as (page,errors):
    for pose in ['hamac','swim']:
        page.evaluate('''pose=>{
          const v=window.__resort,L=v.layout;
          if(pose==='hamac')v.interactions.lie();else {v.interactions.stand();v.ctrl.pos.set(0,-1.1,-75);v.ctrl.mode='swim';v.ctrl.waterY=0;}
          v.player.setOutfit({swim:true,backpack:false,hat:false,pants:false,shoes:false});
          for(let i=0;i<60;i++)v.player.update({dt:1/60,mode:v.ctrl.mode,pos:v.ctrl.pos,vel:v.ctrl.vel,webOn:false,anchor:v.ctrl.anchor,posture:pose==='hamac'?'lie':undefined,facingYaw:pose==='hamac'?L.HAMMOCK.yaw:0,elapsedTime:i/60});
          if(pose==='hamac'){v.camera.position.set(-24,4,18);v.camera.lookAt(-24,2,14);}else{v.camera.position.set(4,2,-72);v.camera.lookAt(0,.05,-75);}
          v.atmosphere.update(0,v.ctrl.pos);v.scene.updateMatrixWorld(true);v.renderer.render(v.scene,v.camera);
        }''',pose)
        page.screenshot(path=str(ROOT/'scratch'/('resort_player_'+pose+'.png')))
    page.evaluate("window.__resort.interactions.stand();document.getElementById('overlay').style.display='flex'")
    page.locator('.brief-resort [data-time=sunset]').click()
    page.locator('#startBtn').click()
    check('start keeps selected sunset',page.evaluate("window.__resort.time==='sunset'"))
    page.evaluate('window.__testAnimate()')
    page.wait_for_timeout(700)
    page.keyboard.press('Escape')
    page.wait_for_timeout(400)
    check('escape opens pause',page.evaluate("getComputedStyle(document.getElementById('overlay')).display==='flex'"))
    page.keyboard.press('Enter')
    page.wait_for_timeout(400)
    check('enter resumes',page.evaluate("getComputedStyle(document.getElementById('overlay')).display==='none'"))
