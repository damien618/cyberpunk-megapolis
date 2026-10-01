import json
from resort_harness import resort_page, check
with resort_page() as (page, errors):
    results = page.evaluate('''() => {
      const v=window.__resort,c=v.ctrl,i=v.input,T=v.THREE,r={};
      const step=(n)=>{for(let k=0;k<n;k++){c.update(1/60,i,i.yaw,new T.Vector3(-Math.sin(i.yaw),0,-Math.cos(i.yaw)));i.endFrame();}};
      c.pos.set(0,v.layout.terrainHeight(0,-55),-55);c.prevY=c.pos.y;c.vel.set(0,0,0);c.mode='ground';i.keys.clear();step(30);
      r.deepWaterSwim=c.mode==='swim';r.floating=Math.abs(c.pos.y-(v.waterProbe(c.pos.x,c.pos.z).surfaceY-1.1))<.2;
      i.keys.add('KeyW');i.yaw=Math.PI;step(1800);r.beachExit=c.mode==='ground'&&c.pos.z>10;
      i.keys.clear();c.pos.set(0,2,-55);c.prevY=2;c.vel.set(0,-5,0);c.mode='air';step(180);r.fallIntoWater=c.mode==='swim';
      r.poolSwim=[];r.poolExit=[];
      for(const p of v.pools.pools){const b=p.building,pt=v.layout.localPoint(b,p.lx,p.lz+.6);c.pos.set(pt.x,p.bottomY,pt.z);c.prevY=c.pos.y;c.mode='ground';c.vel.set(0,0,0);i.keys.clear();step(45);r.poolSwim.push(c.mode==='swim');
        i.yaw=b.yaw;i.keys.add('KeyW');let exited=false;for(let n=0;n<300;n++){step(1);if(c.mode==='ground'&&c.pos.y>b.y-.2){exited=true;break;}}r.poolExit.push(exited);console.log('pool exit',p.id,c.mode,c.pos.y,JSON.stringify(v.layout.toLocal(b,c.pos.x,c.pos.z)));i.keys.clear();}
      c.pos.set(0,-1.1,-60);c.mode='swim';c.vel.set(0,0,0);i.justPressed.add('KeyE');i.keys.add('Space');step(60);r.webDisabled=!c.webOn&&c.mode==='swim';i.keys.clear();
      v.rig.update(.1,i,c);r.cameraAboveWater=v.camera.position.y>c.waterY;
      v.player.update({dt:1/60,mode:'swim',pos:c.pos,vel:c.vel,webOn:false,anchor:c.anchor,elapsedTime:1});
      v.player.group.updateMatrixWorld(true);
      r.headAboveWater=v.player.bones.head.getWorldPosition(new T.Vector3()).y>c.waterY;
      // Swim into a real support pile beneath a bungalow, with its deck above us.
      const b=v.layout.BUNGALOWS[0],px=b.w/2-.2,pz=-b.d/2+.2;
      const a=v.layout.localPoint(b,px-1.8,pz);c.pos.set(a.x,-1.1,a.z);c.prevY=c.pos.y;c.mode='swim';c.vel.set(0,0,0);
      i.yaw=b.yaw-Math.PI/2;i.keys.add('KeyW');step(180);i.keys.clear();
      r.pileBlocks=v.layout.toLocal(b,c.pos.x,c.pos.z).x<px-.4;
      c.pos.set(0,-1.1,v.layout.BOUNDS.z0+3);c.prevY=c.pos.y;c.mode='swim';c.vel.set(0,0,0);
      i.yaw=0;i.keys.add('KeyW');step(300);i.keys.clear();
      r.offshoreLimit=c.pos.z>v.layout.BOUNDS.z0;
      return r;
    }''')
    print(json.dumps(results, indent=2))
    for name, value in results.items():
        check(name, all(value) if isinstance(value, list) else value)
