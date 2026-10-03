"""Matisse gallery: real movement, atlas orientation, persistent LOD and rendering.

Run .venv/bin/python tests/resort_gallery.py [--headed] with serve.py on :8000.
"""
import argparse
import json
from PIL import Image
from resort_harness import resort_page, check, ROOT

parser = argparse.ArgumentParser()
parser.add_argument('--headed', action='store_true', help='Use the actual GPU instead of SwiftShader')
args = parser.parse_args()
works = json.loads((ROOT/'textures/resort-matisse/works.json').read_text())
check('seven documented local Matisse reproductions', len(works) == 7 and len({w['file'] for w in works}) == 7)
check('old Cézanne images removed', not (ROOT/'textures/resort-cezanne').exists())
for work in works:
    with Image.open(ROOT/'textures/resort-matisse'/work['file']) as image:
        image.load()
        check(work['file']+' dimensions and licence', image.size == (work['width'], work['height'])
              and max(image.size) <= 2048 and work['license'] == 'Public domain' and work['artist'] == 'Henri Matisse' and bool(work['reproductionSource']) and bool(work['credit']))

with resort_page(viewport={'width':1280,'height':800}, headless=not args.headed) as (page, errors):
    failed_resources = []
    page.on('requestfailed', lambda request: failed_resources.append(request.url))
    page.evaluate('async()=>{await window.__resort.galleryReady;await window.__resort.guestsReady;}')
    geometry = page.evaluate('''()=>{
      const v=window.__resort,T=v.THREE,b=v.layout.CENTRAL_BUILDINGS.find(b=>b.kind==='gallery'),g=v.props.gallery;
      v.scene.updateMatrixWorld(true);
      const works=g.artworks.map(a=>{
        const p=a.mesh.geometry.attributes.position,n=a.mesh.geometry.attributes.normal;
        const centre=new T.Vector3(),normal=new T.Vector3();
        let x0=Infinity,x1=-Infinity,y0=Infinity,y1=-Infinity,z0=Infinity,z1=-Infinity;
        for(let i=a.vertexStart;i<a.vertexStart+a.vertexCount;i++){
          const pos=new T.Vector3().fromBufferAttribute(p,i).applyMatrix4(a.mesh.matrixWorld);
          centre.add(pos);normal.add(new T.Vector3().fromBufferAttribute(n,i).transformDirection(a.mesh.matrixWorld));
          x0=Math.min(x0,pos.x);x1=Math.max(x1,pos.x);y0=Math.min(y0,pos.y);y1=Math.max(y1,pos.y);z0=Math.min(z0,pos.z);z1=Math.max(z1,pos.z);
        }
        centre.divideScalar(a.vertexCount);normal.normalize();
        const target=new T.Vector3(b.x,centre.y,b.z),width=Math.hypot(x1-x0,z1-z0),height=y1-y0;
        return {file:a.work.file,facing:normal.dot(target.sub(centre)),ratio:width/height,
          expected:a.work.width/a.work.height,width,height,eye:centre.y-b.y,
          cartelClearance:y0-(a.cartelY+a.cartelHeight/2),centre:centre.toArray(),normal:normal.toArray()};
      });
      const labels=g.group.getObjectByName('matisse-cartels').geometry,cartelFacing=[];
      for(let i=0;i<labels.attributes.position.count;i+=6){
        const p=new T.Vector3(),n=new T.Vector3();
        for(let j=i;j<i+6;j++)p.add(new T.Vector3().fromBufferAttribute(labels.attributes.position,j));
        p.divideScalar(6);n.fromBufferAttribute(labels.attributes.normal,i);
        cartelFacing.push(n.dot(new T.Vector3(b.x,p.y,b.z).sub(p)));
      }
      const sign=g.group.getObjectByName('gallery-sign');sign.geometry.computeBoundingBox();
      const ext=v.renderer.getContext().getExtension('WEBGL_debug_renderer_info');
      return {works,atlases:g.artMeshes.length,atlasSize:g.artMeshes.map(m=>[m.material.map.image.width,m.material.map.image.height]),
        materials:g.artMeshes.every(m=>m.material.isMeshStandardMaterial&&m.material.map===m.material.emissiveMap&&m.material.emissiveIntensity===.27),
        floor:v.collision.groundFn(12,58.5,b.y+3,b.y+.015),
        renderer:ext?v.renderer.getContext().getParameter(ext.UNMASKED_RENDERER_WEBGL):'unavailable',
        signHeadroom:sign.geometry.boundingBox.min.y-b.y,cartelFacing,
        lamps:v.props.lanterns.filter(p=>p.intensityScale===.08)};
    }''')
    print('geometry',geometry,flush=True)
    check('all art faces inward with preserved proportions and clear labels', all(
        a['facing'] > 0 and abs(a['ratio']-a['expected']) < .0001 and abs(a['eye']-1.6) < .0001
        and a['width'] <= 1.8001 and a['height'] <= 1.4501 and a['cartelClearance'] > .08 for a in geometry['works']))
    check('two standard-material image atlases', geometry['atlases'] == 2 and geometry['materials'])
    check('cartels face inward and the exterior sign clears the entrance',
          all(n > 0 for n in geometry['cartelFacing']) and geometry['signHeadroom'] > 2.7)
    for i, a in enumerate(geometry['works']):
        for other in geometry['works'][i+1:]:
            if sum(x*y for x,y in zip(a['normal'],other['normal'])) > .99:
                distance = sum((x-y)**2 for x,y in zip(a['centre'],other['centre']))**.5
                check('visible gap between neighbouring frames', distance-(a['width']+other['width'])/2-.13 > .5)
    check('walkable deck and one weak central pooled lamp', abs(geometry['floor']-2.265) < .001
          and len(geometry['lamps']) == 1 and geometry['lamps'][0]['y'] == 5.25)
    if args.headed:
        check('headed browser uses hardware rendering', 'swiftshader' not in geometry['renderer'].lower()
              and 'software' not in geometry['renderer'].lower() and geometry['renderer'] != 'unavailable')

    movement = page.evaluate('''()=>{
      const v=window.__resort,T=v.THREE,L=v.layout,b=L.CENTRAL_BUILDINGS.find(b=>b.kind==='gallery'),c=v.ctrl,input=v.input;
      function start(x,z){c.rescueTo(new T.Vector3(x,L.terrainHeight(x,z)+.015,z));}
      function walk(x,z,frames=1000){
        input.keys.clear();input.keys.add('KeyW');let reached=false,minY=Infinity;
        for(let i=0;i<frames;i++){
          if(Math.hypot(c.pos.x-x,c.pos.z-z)<.18){reached=true;break;}
          input.yaw=Math.atan2(-(x-c.pos.x),-(z-c.pos.z));
          c.update(1/60,input,input.yaw,new T.Vector3(-Math.sin(input.yaw),0,-Math.cos(input.yaw)));
          input.endFrame();minY=Math.min(minY,c.pos.y);
        }
        input.keys.clear();return {reached,x:c.pos.x,y:c.pos.y,z:c.pos.z,minY};
      }
      const lanes=[11.5,12,12.5].map(x=>{start(x,48);return {x,inbound:walk(x,58.5),outbound:walk(x,48)};});
      start(12,48);walk(12,58.5);
      const tour=[[13.8,58.5],[13.8,62],[10.2,62],[10.2,58.5],[12,58.5]].map(([x,z])=>walk(x,z));
      const blocks=[];
      for(const [name,from,to] of [['left',[-3,0],[-5.5,0]],['right',[3,0],[5.5,0]],['back',[2,-2.8],[2,-5.5]],
        ['front-wing',[2.5,2.7],[2.5,5]],['bench',[0,1.5],[0,-1.8]],['rail',[2.4,5.3],[2.4,7.5]]]){
        const a=L.localPoint(b,...from),end=L.localPoint(b,...to);c.rescueTo(new T.Vector3(a.x,b.y+.015,a.z));
        const r=walk(end.x,end.z,180);blocks.push({name,...r});
      }
      return {lanes,tour,blocks};
    }''')
    print('movement',movement,flush=True)
    check('three real entrance/exit lanes', all(l['inbound']['reached'] and l['outbound']['reached']
          and abs(l['inbound']['y']-2.265)<.03 and abs(l['outbound']['y']-1.965)<.03 for l in movement['lanes']))
    check('walk around both sides of the bench', all(r['reached'] and r['minY'] > 2.2 for r in movement['tour']))
    check('walls bench and terrace rails block movement', all(not r['reached'] for r in movement['blocks']))

    lod = page.evaluate('''()=>{
      const v=window.__resort,b=v.layout.CENTRAL_BUILDINGS.find(b=>b.kind==='gallery'),g=v.props.gallery,records=[];
      const obstacles=v.collision.bw.aabbs.length,surfaces=v.collision.surfaces.length;
      for(const distance of [100,70,56,55,54,10,54,55,56,70,100]){
        v.camera.position.set(b.x+distance*.6,b.y+2,b.z-distance*.8);v.camera.lookAt(b.x,b.y+1.6,b.z);
        v.ctrl.pos.copy(v.camera.position);v.atmosphere.update(0,v.ctrl.pos);v.vegetation.update(v.camera.position,0);
        v.architecture.update(v.camera.position);v.batch.update(v.camera.position);v.guests.update(.016,2,v.camera.position);
        v.renderer.render(v.scene,v.camera);
        const near=Math.hypot(v.camera.position.x-b.x,v.camera.position.z-b.z)<55;
        records.push({distance,near,consistent:g.nearMeshes.every(m=>m.visible===near)&&g.farMeshes.every(m=>m.visible===!near),
          art:g.artMeshes.every(m=>m.visible),calls:v.renderer.info.render.calls,triangles:v.renderer.info.render.triangles,
          collisions:v.collision.bw.aabbs.length===obstacles&&v.collision.surfaces.length===surfaces});
      }return records;
    }''')
    print('LOD',lod,flush=True)
    check('interior and art persist on both sides of 55 m', all(r['consistent'] and r['art'] and r['collisions'] for r in lod))
    check('both LODs stay within graphics ceilings', all(r['calls']<=250 and r['triangles']<=800000 for r in lod))

    (ROOT/'scratch').mkdir(exist_ok=True)
    prefix = 'resort_gallery_gpu' if args.headed else 'resort_gallery'
    for time in ['day','sunset','night']:
        for view,eye,target in [
            ('avenue',[0,1.8,12],[0,1.6,0]),
            ('interior',[0,1.7,3],[0,1.6,-3.84]),
            ('left',[1.3,1.65,0],[-4.34,1.6,0]),
            ('right',[-1.3,1.65,0],[4.34,1.6,0]),
            ('back',[0,1.7,2.5],[0,1.6,-3.84]),
        ]:
            stats = page.evaluate('''([time,eye,target])=>{
              const v=window.__resort,b=v.layout.CENTRAL_BUILDINGS.find(b=>b.kind==='gallery'),L=v.layout;
              const p=L.localPoint(b,eye[0],eye[2]),t=L.localPoint(b,target[0],target[2]);
              v.camera.position.set(p.x,b.y+eye[1],p.z);v.camera.lookAt(t.x,b.y+target[1],t.z);
              v.ctrl.pos.set(p.x,b.y,p.z);v.setResortTime(time,true);v.atmosphere.update(0,v.ctrl.pos);
              v.vegetation.update(v.camera.position,0);v.architecture.update(v.camera.position);v.batch.update(v.camera.position);
              v.guests.update(.016,2,v.camera.position);v.renderer.render(v.scene,v.camera);
              return {calls:v.renderer.info.render.calls,triangles:v.renderer.info.render.triangles};
            }''',[time,eye,target])
            print(time,view,stats,flush=True)
            check('gallery view within graphics ceilings', stats['calls']<=250 and stats['triangles']<=800000)
            page.screenshot(path=str(ROOT/'scratch'/f'{prefix}_{time}_{view}.png'))
    # A close view checks the actual atlas pixels, margins, frame and cartel.
    page.evaluate('''()=>{
      const v=window.__resort,a=v.props.gallery.artworks[0];v.setResortTime('day',true);
      v.camera.position.copy(a.centre).addScaledVector(a.normal,2);v.camera.position.y+=.08;
      v.camera.lookAt(a.centre.clone().add(new v.THREE.Vector3(0,-.15,0)));v.ctrl.pos.copy(v.camera.position);
      v.atmosphere.update(0,v.ctrl.pos);v.vegetation.update(v.camera.position,0);v.architecture.update(v.camera.position);v.batch.update(v.camera.position);
      v.renderer.render(v.scene,v.camera);
    }''')
    page.screenshot(path=str(ROOT/'scratch'/f'{prefix}_painting_detail.png'))
    disposed = page.evaluate('''async()=>{
      const v=window.__resort,{buildResortGallery}=await import('/resortGallery.js');
      const root=new v.THREE.Group(),b=v.layout.CENTRAL_BUILDINGS.find(b=>b.kind==='gallery');
      const batch={box(){},addObstacle(){},addDetailMesh(){}};
      const mat=key=>v.props.gallery.group.getObjectByName(`matisse-interior:${key}`).material;
      const materials={galleryEbony:mat('ebony'),galleryLeather:mat('leather'),galleryGilt:mat('gilt'),galleryWire:mat('wire')};
      const temporary=buildResortGallery({b,batch,materials,group:root});
      temporary.dispose();await temporary.ready;
      const count=temporary.artMeshes.length;
      root.traverse(o=>{o.geometry?.dispose();if(o.material){o.material.map?.dispose();o.material.dispose();}});
      return count;
    }''')
    check('disposing during loading prevents late atlas allocation', disposed == 0)
    check('all gallery resources loaded without errors', not failed_resources and not errors)
