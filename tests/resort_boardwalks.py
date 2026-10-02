"""Check rail supports and junction openings on both overwater pontoons."""
from resort_harness import resort_page, check, ROOT

with resort_page() as (page, errors):
    results = page.evaluate("""async () => {
      const {buildResortBoardwalks}=await import('/resortBoardwalks.js');
      const L=window.__resort.layout,rails=[],posts=[];
      buildResortBoardwalks({
        batch:{box:(mat,x,y,z,w,h,d,yaw)=>{if(h===.13)rails.push({x,z,d,yaw});},
               post:(mat,x,y,z)=>posts.push({x,z})},
        collision:{addSurface:()=>{}}
      });
      const ends=rails.flatMap(r=>[-1,1].map(s=>({
        x:r.x+s*Math.sin(r.yaw)*r.d/2,z:r.z+s*Math.cos(r.yaw)*r.d/2
      })));
      const freeEnds=ends.filter((p,i)=>!ends.some((q,j)=>i!==j&&Math.hypot(p.x-q.x,p.z-q.z)<.06));
      const supported=freeEnds.every(p=>posts.some(q=>Math.hypot(p.x-q.x,p.z-q.z)<.06));
      const branches=L.BUNGALOWS.every(b=>{
        return [-1,1].every(side=>rails.some(r=>{
          const p=L.toLocal(b,r.x,r.z);
          return Math.abs(p.x-side*.84)<.02&&Math.abs(p.z-(-b.d/2-4))<2;
        }));
      });
      return {supported,branches,freeEnds:freeEnds.length,posts:posts.length};
    }""")
    print(results)
    check('every exposed rail end has a support', results['supported'] and results['freeEnds'] > 0)
    check('both rail sides on all twelve bungalow approaches', results['branches'])
    (ROOT / 'scratch').mkdir(exist_ok=True)
    page.evaluate("""() => {
      const v=window.__resort,L=v.layout,b=L.BUNGALOWS[0],p=L.BOARDWALKS[0][24];
      v.camera.position.set(p[0],L.DECK_Y+2.1,p[1]);
      v.camera.lookAt(b.branch.x,L.DECK_Y+.5,b.branch.z);
      v.atmosphere.update(0,v.camera.position);
      v.architecture.update(v.camera.position);v.batch.update(v.camera.position);
      v.renderer.render(v.scene,v.camera);
    }""")
    page.screenshot(path=str(ROOT / 'scratch' / 'resort_boardwalk_junction.png'))
