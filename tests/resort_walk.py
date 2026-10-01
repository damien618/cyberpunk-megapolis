import json
from resort_harness import resort_page, check
with resort_page() as (page, errors):
    results = page.evaluate('''() => {
      const v=window.__resort,L=v.layout,ctrl=v.ctrl,input=v.input,results=[];
      function walk(points,startY) {
        ctrl.pos.set(points[0][0],startY,points[0][1]);ctrl.prevY=startY;ctrl.vel.set(0,0,0);ctrl.mode='ground';
        input.keys.clear();input.keys.add('KeyW');let reached=0,minY=Infinity;
        for(let j=1;j<points.length;j++){
          const [x,z]=points[j];let done=false;
          for(let n=0;n<900;n++){
            const d=Math.hypot(x-ctrl.pos.x,z-ctrl.pos.z);if(d<.28){done=true;break;}
            input.yaw=Math.atan2(-(x-ctrl.pos.x),-(z-ctrl.pos.z));
            ctrl.update(1/60,input,input.yaw,new v.THREE.Vector3(-Math.sin(input.yaw),0,-Math.cos(input.yaw)));input.endFrame();minY=Math.min(minY,ctrl.pos.y);
          }
          if(!done)break;reached++;
        }
        input.keys.clear();return {reached,expected:points.length-1,minY,x:ctrl.pos.x,z:ctrl.pos.z,mode:ctrl.mode};
      }
      for(let arm=0;arm<2;arm++)results.push({name:'whole-pier-'+arm,...walk(L.BOARDWALKS[arm].filter((_,i)=>i%4===0),L.DECK_Y+.015)});
      for(const b of L.BUNGALOWS){const p=L.localPoint(b,0,-3.2),side=L.localPoint(b,1.9,-3.2),front=L.localPoint(b,1.9,3.2),door=L.localPoint(b,0,3.2),terrace=L.localPoint(b,0,5.0);
        results.push({name:b.id,...walk([[b.branch.x,b.branch.z],[p.x,p.z],[side.x,side.z],[front.x,front.z],[door.x,door.z],[terrace.x,terrace.z]],b.y+.015)});
      }
      for(const b of L.GARDEN_BUNGALOWS){const out={x:b.x,z:48},inside=L.localPoint(b,0,3.3);
        results.push({name:b.id,...walk([[out.x,out.z],[inside.x,inside.z]],L.terrainHeight(out.x,out.z)+.015)});
      }
      for(const b of L.BUNGALOWS){
        const top=L.localPoint(b,-b.w/2+.8,b.d/2+b.terrace+.25),bottom=L.localPoint(b,-b.w/2+.8,b.d/2+b.terrace+.25+12*.38);
        results.push({name:b.id+'-water-stair',...walk([[bottom.x,bottom.z],[top.x,top.z]],-.95)});
      }
      // A low rail is solid, not a steppable floor.
      const b=L.BUNGALOWS[0],a=L.localPoint(b,b.w/2-1,2),end=L.localPoint(b,b.w/2+1,2);
      const r=walk([[a.x,a.z],[end.x,end.z]],b.y+.015);results.push({name:'side-wall-blocks',blocked:r.reached===0,...r});
      return results;
    }''')
    print(json.dumps(results, indent=2))
    for result in results:
        check(result['name'], result.get('blocked', result['reached'] == result['expected']) and result['minY'] > (-1.6 if 'water-stair' in result['name'] else -0.2))
