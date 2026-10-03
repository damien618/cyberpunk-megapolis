"""Reclining torso with pelvis and bare heels supported by the lounger."""
import json
from resort_harness import resort_page, check, ROOT

with resort_page(viewport={'width':1280,'height':800}) as (page, errors):
    page.evaluate("""async () => {
      const v=window.__resort;await v.guestsReady;
      window.__renderResort=v.renderer.render.bind(v.renderer);v.renderer.render=()=>{};
      window.__stepResort=()=>{const raf=window.requestAnimationFrame;window.requestAnimationFrame=()=>0;
        try{window.__testAnimate();}finally{window.requestAnimationFrame=raf;}};
      window.__startResort();
      const c=v.interactions.lounger;v.ctrl.pos.set(c.approach.x,c.approach.y,c.approach.z);
      v.ctrl.mode='ground';v.ctrl.prevY=c.approach.y;v.ctrl.vel.set(0,0,0);window.__stepResort();
    }""")
    page.keyboard.press('r');page.evaluate('window.__stepResort()')
    result=page.evaluate("""() => {
      const v=window.__resort,p=v.player,c=v.interactions.lounger,b=v.layout.PLAYER_BUNGALOW,r={};
      const at=name=>p.bones[name].getWorldPosition(new v.THREE.Vector3());
      p.group.updateMatrixWorld(true);
      const pelvis=at('pelvis'),head=at('head'),left=at('foot_l'),right=at('foot_r');
      const base=at('spine_01'),upper=at('spine_03');
      const lo=v.layout.toLocal(b,base.x,base.z),hi=v.layout.toLocal(b,upper.x,upper.z);
      r.recliningState=v.interactions.restState==='lounger-lie'&&v.interactions.posture==='lie';
      r.backrestShared=c.liePose.backAngle===c.backrest.tilt&&v.props.furniture.find(f=>f.id===b.id).loungerPoints.find(a=>a.id===c.id).backrest.tilt===c.backrest.tilt;
      r.torsoFollowsBackrest=Math.abs(Math.atan2(upper.y-base.y,lo.z-hi.z)-c.backrest.tilt)<.08;
      r.rootStaysLevel=p.group.rotation.x===0&&p.group.rotation.z===0;
      r.heelsOnSeat=['l','r'].every(side=>{
        const mesh=p.wardrobe.swimLegs,q=new v.THREE.Vector3();let lowest=Infinity;
        for(const index of p.heelVertices(side)){mesh.getVertexPosition(index,q);mesh.localToWorld(q);lowest=Math.min(lowest,q.y);}
        return Math.abs(lowest-c.world.y)<.045;
      });
      const ctx={dt:1/60,mode:'lie',pos:v.ctrl.pos,vel:v.ctrl.vel,webOn:false,anchor:v.ctrl.anchor,posture:'lie',facingYaw:c.yaw};
      p.update(ctx);p.group.updateMatrixWorld(true);
      r.lowerBodyOnFlatSeat=at('pelvis').distanceTo(pelvis)<.001&&at('foot_l').distanceTo(left)<.001&&at('foot_r').distanceTo(right)<.001;
      r.onlyTorsoReclines=head.y-at('head').y>.25;
      for(let n=0;n<20;n++)window.__stepResort();p.group.updateMatrixWorld(true);
      r.poseStable=at('head').distanceTo(head)<.001&&at('pelvis').distanceTo(pelvis)<.001&&v.ctrl.vel.length()===0;
      // Switching back to flat furniture must remove the optional spine lean.
      r.flatPoseUnchanged=['bed','bench'].every(key=>{
        const a=v.interactions.furniture[key];p.group.rotation.x=0;
        p.update({...ctx,pos:new v.THREE.Vector3(a.lie.x,a.lie.y,a.lie.z),facingYaw:a.yaw});
        const bone=p.bones.spine_01,rest=p.restRotation.get('spine_01');
        return bone.quaternion.angleTo(rest)<.001&&p.poseRoot.rotation.x===-Math.PI/2;
      });
      window.__stepResort();return r;
    }""")
    for name,ok in result.items(): check(name,ok)
    (ROOT/'scratch').mkdir(exist_ok=True)
    shots=[]
    for name,eye,hour in [('side',[2.5,1.35,.1],'day'),('feet',[.3,1.6,2.5],'day'),
                          ('opposite',[-1.7,1.5,1.3],'day'),('night',[2.5,1.35,.1],'night')]:
        stats=page.evaluate("""([eye,hour])=>{
          const v=window.__resort,b=v.layout.PLAYER_BUNGALOW,c=v.interactions.lounger;
          window.__stepResort();v.setResortTime(hour,true);
          const p=v.layout.localPoint(b,c.local.x+eye[0],c.local.z+eye[2]);
          v.camera.position.set(p.x,b.y+eye[1],p.z);v.camera.lookAt(c.world.x,b.y+.76,c.world.z);
          v.atmosphere.update(0,v.ctrl.pos);v.architecture.update(v.camera.position);v.batch.update(v.camera.position);
          v.vegetation.update(v.camera.position,0);v.guests.update(0,0,v.camera.position);window.__renderResort(v.scene,v.camera);
          return {calls:v.renderer.info.render.calls,triangles:v.renderer.info.render.triangles};
        }""",[eye,hour])
        shots.append({'view':name,**stats});page.screenshot(path=str(ROOT/'scratch'/f'resort_lounger_corrected_{name}.png'),timeout=120000)
    print(json.dumps(shots,indent=2))
    check('corrected views within render budget',all(s['calls']<=250 and s['triangles']<=800000 for s in shots))
    page.keyboard.press('e');page.evaluate('window.__stepResort()')
    check('wake restores upright player and safe exit',page.evaluate("""()=>{
      const v=window.__resort,e=v.interactions.lounger.exit;
      return v.ctrl.mode==='ground'&&!v.interactions.resting&&v.ctrl.pos.distanceTo(new v.THREE.Vector3(e.x,e.y,e.z))<.001&&
        v.player.group.rotation.x===0&&v.player.poseRoot.rotation.x===0&&v.ctrl.furnitureCamera===null;
    }"""))
