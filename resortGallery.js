import * as THREE from 'three';
import { mergeGeometries,mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { localPoint } from './resortLayout.js';

// Upholstered cushion: rounded-rectangle plan extruded with a soft bevel,
// centred on the origin with its thickness along Y.
function cushionGeometry(w,h,d,r){
  const s=new THREE.Shape(),x=w/2-r,z=d/2-r,c=Math.min(x,z,.06);
  s.moveTo(-x+c,-z);s.lineTo(x-c,-z);s.quadraticCurveTo(x,-z,x,-z+c);s.lineTo(x,z-c);s.quadraticCurveTo(x,z,x-c,z);
  s.lineTo(-x+c,z);s.quadraticCurveTo(-x,z,-x,z-c);s.lineTo(-x,-z+c);s.quadraticCurveTo(-x,-z,-x+c,-z);
  const g=new THREE.ExtrudeGeometry(s,{depth:h-2*r,bevelEnabled:true,bevelThickness:r,bevelSize:r,bevelSegments:4,curveSegments:6});
  g.rotateX(-Math.PI/2);g.translate(0,-(h-2*r)/2,0);
  g.deleteAttribute('normal');g.deleteAttribute('uv');
  const welded=mergeVertices(g,1e-5);g.dispose();welded.computeVertexNormals();return welded;
}

// Geometry is baked into world coordinates, matching the reception/restaurant
// decorators. Art stays present at both LODs; only labels and fine trim switch.
export function buildResortGallery({b,batch,materials,group}) {
  const room=new THREE.Group();room.name='matisse-gallery-interior';group.add(room);
  const artworks=[],nearMeshes=[],farMeshes=[],artMeshes=[],bins=new Map();
  let disposed=false;
  const nearby=pos=>Math.hypot(pos.x-b.x,pos.z-b.z)<55;
  const matrix=(x,y,z,ry=0)=>{
    const p=localPoint(b,x,z);
    return new THREE.Matrix4().compose(new THREE.Vector3(p.x,b.y+y,p.z),
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),b.yaw+ry),new THREE.Vector3(1,1,1));
  };
  function addBox(key,x,y,z,w,h,d,ry=0){
    const source=new THREE.BoxGeometry(w,h,d),g=source.toNonIndexed();source.dispose();g.applyMatrix4(matrix(x,y,z,ry));
    if(!bins.has(key))bins.set(key,[]);bins.get(key).push(g);
  }
  function plane(w,h,x,y,z,ry=0,rect=null){
    const source=new THREE.PlaneGeometry(w,h),g=source.toNonIndexed();source.dispose();
    if(rect){const uv=g.attributes.uv;for(let i=0;i<uv.count;i++)uv.setXY(i,rect.u+uv.getX(i)*rect.w,rect.v+uv.getY(i)*rect.h);}
    return g.applyMatrix4(matrix(x,y,z,ry));
  }
  function canvas(w,h){return Object.assign(document.createElement('canvas'),{width:w,height:h});}
  function texture(c){const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=4;return t;}
  function printMaterial(map,emissiveIntensity){return new THREE.MeshStandardMaterial({map,emissiveMap:map,
    color:0xffffff,emissive:0xffffff,emissiveIntensity,roughness:.92,metalness:0});}
  const inRange=pos=>Math.hypot(pos.x-b.x,pos.z-b.z)<101;
  function attach(name,geometry,material,lod=null){
    const mesh=new THREE.Mesh(geometry,material);mesh.name=name;mesh.receiveShadow=true;room.add(mesh);
    if(lod){mesh.userData.visibleAt=lod==='near'?nearby:pos=>!nearby(pos)&&inRange(pos);batch.addDetailMesh(mesh,Infinity);
      (lod==='near'?nearMeshes:farMeshes).push(mesh);}
    else {mesh.userData.visibleAt=inRange;batch.addDetailMesh(mesh,Infinity);}
    return mesh;
  }
  function caption(text,w,h,font){
    const c=canvas(w,h),g=c.getContext('2d');g.fillStyle='#eadfc8';g.fillRect(0,0,w,h);
    g.strokeStyle='#a88a55';g.lineWidth=3;g.strokeRect(8,8,w-16,h-16);
    g.fillStyle='#463722';g.textAlign='center';g.font=font;g.fillText(text,w/2,h*.64,w-40);return texture(c);
  }
  // Exterior lettering remains visible from the avenue at any distance.
  attach('gallery-sign',plane(4.6,.65,0,3.03,b.d/2+.11),
    printMaterial(caption('ATELIER · Matisse',1024,160,'80px Georgia'),.08));
  attach('gallery-welcome',plane(4.6,.28,0,2.42,-b.d/2+.13),
    printMaterial(caption('HENRI MATISSE · La joie de la couleur',2048,128,'76px Georgia'),.10),'near');
  const floorG=new THREE.PlaneGeometry(b.w-.2,b.d-.2);floorG.rotateX(-Math.PI/2);
  const floorMesh=floorG.toNonIndexed();floorG.dispose();floorMesh.applyMatrix4(matrix(0,.005,0));
  attach('cezanne-floor',floorMesh,materials.galleryFloor,'near');
  function addGeometry(key,source,x,y,z,ry=0){
    const g=source.index?source.toNonIndexed():source.clone();source.dispose();
    for(const name of Object.keys(g.attributes))if(!['position','normal','uv'].includes(name))g.deleteAttribute(name);
    // Materials here are mapped in world space; uv only has to exist to merge.
    if(!g.attributes.uv)g.setAttribute('uv',new THREE.BufferAttribute(new Float32Array(g.attributes.position.count*2),2));
    g.applyMatrix4(matrix(x,y,z,ry));if(!bins.has(key))bins.set(key,[]);bins.get(key).push(g);
  }
  // Register this obstacle once, independently of the visual representations.
  const bench=localPoint(b,0,-.8);batch.addObstacle(bench.x,b.y+.4,bench.z,2.1,.8,.65,b.yaw,{prop:true});
  // Backless museum banquette: dark ebonised oak against the terracotta, a
  // tufted bottle-green leather cushion and brass sabots, so it reads at a glance.
  addBox('ebony',0,.405,-.8,2.06,.07,.6);                                    // seat frame / apron
  addGeometry('leather',cushionGeometry(2.0,.1,.56,.03),0,.49,-.8);           // cushion
  for(const [z,count] of [[-.93,6],[-.67,5]])for(let i=0;i<count;i++){       // staggered tufting buttons
    const s=new THREE.SphereGeometry(.016,8,6);s.scale(1,.45,1);
    addGeometry('leather',s,-(count-1)*.15+i*.3,.54,z);
  }
  for(const x of [-.94,.94])for(const z of [-1.03,-.57]){
    addBox('ebony',x,.205,z,.07,.33,.07);                                    // legs
    addBox('gilt',x,.02,z,.078,.04,.078);                                    // brass sabots
  }
  for(const z of [-1.03,-.57])addBox('ebony',0,.11,z,1.82,.04,.035);        // long stretchers
  for(const x of [-.94,.94])addBox('ebony',x,.11,-.8,.035,.04,.42);         // end stretchers
  // Gilt picture rail (cimaise) along the three hanging walls.
  for(const s of [-1,1])addBox('gilt',s*(b.w/2-.09),2.36,0,.025,.035,b.d-.2);
  addBox('gilt',0,2.36,-b.d/2+.09,b.w-.2,.035,.025);
  // Shared emissive strips; the only pooled gallery light is high at its centre.
  for(const x of [-b.w/2+.22,b.w/2-.22])for(const z of [-2.6,0,2.6]){
    const p=localPoint(b,x,z);batch.box('lantern',p.x,b.y+2.48,p.z,.05,.06,.85,b.yaw);
  }
  batch.box('barShelf',b.x,b.y+3.02,b.z,b.w,.10,.12,b.yaw,{solid:true});
  batch.box('lantern',b.x,b.y+2.94,b.z,.45,.06,.45,b.yaw);

  function loadImage(file){return new Promise((resolve,reject)=>{
    const image=new Image();image.onload=()=>resolve(image);image.onerror=()=>reject(new Error(`Missing gallery image: ${file}`));
    image.src=new URL(`./textures/resort-matisse/${file}`,import.meta.url).href;
  });}
  const ready=(async()=>{
    const response=await fetch(new URL('./textures/resort-matisse/works.json',import.meta.url));
    if(!response.ok)throw new Error(`Gallery manifest: HTTP ${response.status}`);
    const works=await response.json();
    if(works.length<6||works.length>7)throw new Error('Gallery requires six to seven works');
    for(const w of works)if(!/^[a-z0-9-]+\.jpg$/.test(w.file)||!(w.width>0&&w.height>0&&w.displayWidth>0))throw new Error('Invalid gallery work');
    const images=await Promise.all(works.map(w=>loadImage(w.file)));
    if(disposed)return [];
    const atlasParts=[],labelParts=[],labelCanvas=canvas(2048,1024),labelContext=labelCanvas.getContext('2d');
    const atlasSize=4096,slot=2048,padding=16;
    const atlasCanvases=Array.from({length:Math.ceil(works.length/4)},()=>canvas(atlasSize,atlasSize));
    const atlasContexts=atlasCanvases.map(c=>c.getContext('2d'));
    function wrap(text,maxWidth,font){
      labelContext.font=font;const lines=[],words=text.split(' ');let line='';
      for(const word of words){const next=line?`${line} ${word}`:word;if(line&&labelContext.measureText(next).width>maxWidth){lines.push(line);line=word;}else line=next;}
      if(line)lines.push(line);return lines;
    }
    works.forEach((work,i)=>{
      const image=images[i];if(image.naturalWidth!==work.width||image.naturalHeight!==work.height)throw new Error(`Gallery dimensions mismatch: ${work.file}`);
      const atlasIndex=Math.floor(i/4),cell=i%4,cx=(cell%2)*slot,cy=Math.floor(cell/2)*slot;
      const scale=Math.min(1,(slot-padding*2)/work.width,(slot-padding*2)/work.height);
      const iw=work.width*scale,ih=work.height*scale,ix=cx+(slot-iw)/2,iy=cy+(slot-ih)/2,g=atlasContexts[atlasIndex];
      // Extrude edge pixels into the gutter to protect mipmaps at grazing angles.
      g.drawImage(image,ix,iy,iw,ih);
      g.drawImage(image,0,0,1,work.height,ix-padding,iy,padding,ih);
      g.drawImage(image,work.width-1,0,1,work.height,ix+iw,iy,padding,ih);
      g.drawImage(image,0,0,work.width,1,ix-padding,iy-padding,iw+2*padding,padding);
      g.drawImage(image,0,work.height-1,work.width,1,ix-padding,iy+ih,iw+2*padding,padding);
      const rect={u:ix/atlasSize,v:1-(iy+ih)/atlasSize,w:iw/atlasSize,h:ih/atlasSize};
      const side=i<3?-1:1,back=i===6;
      const x=back?0:side*(b.w/2-.16),z=back?-b.d/2+.16:[-2.6,0,2.6][i%3],ry=back?0:side<0?Math.PI/2:-Math.PI/2;
      const width=work.displayWidth,height=width*work.height/work.width;
      const normal=new THREE.Vector3(0,0,1).applyAxisAngle(new THREE.Vector3(0,1,0),b.yaw+ry);
      const frameAt=(u,v,depth)=>{const c=Math.cos(ry),s=Math.sin(ry);return [x+c*u+s*depth,1.6+v,z-s*u+c*depth];};
      for(const [key,thickness,depth,deep] of [['gilt',.07,-.045,.06],['ebony',.014,-.02,.03]]){
        for(const sx of [-1,1]){const p=frameAt(sx*(width/2+thickness/2),0,depth);addBox(key,...p,thickness,height+2*thickness,deep,ry);}
        for(const sy of [-1,1]){const p=frameAt(0,sy*(height/2+thickness/2),depth);addBox(key,...p,width,thickness,deep,ry);}
      }
      // Two hanging wires from the gilt picture rail to the top of the frame.
      const frameTop=1.6+height/2+.07;
      if(frameTop<2.32)for(const sx of [-1,1]){
        const p=frameAt(sx*width*.36,0,-.068);addBox('wire',p[0],(frameTop+2.35)/2,p[2],.006,2.35-frameTop,.006,ry);
      }
      if(!atlasParts[atlasIndex])atlasParts[atlasIndex]=[];
      const art=plane(width,height,x,1.6,z,ry,rect),vertexStart=atlasParts[atlasIndex].reduce((n,p)=>n+p.attributes.position.count,0);
      atlasParts[atlasIndex].push(art);
      const lx=(i%2)*1024,ly=Math.floor(i/2)*256;
      labelContext.fillStyle='#eadfc8';labelContext.fillRect(lx,ly,1024,256);labelContext.fillStyle='#463722';labelContext.textAlign='center';
      const titleLines=wrap(`Henri Matisse · ${work.title}`,950,'32px Georgia');
      titleLines.forEach((line,j)=>labelContext.fillText(line,lx+512,ly+45+j*43));
      const museumLines=wrap(`${work.date} · ${work.museum}`,950,'28px sans-serif');
      museumLines.forEach((line,j)=>labelContext.fillText(line,lx+512,ly+160+j*38));
      const cartelY=1.6-height/2-.24;
      labelParts.push(plane(1.5,.28,x+.006*Math.sin(ry),cartelY,z+.006*Math.cos(ry),ry,
        {u:lx/2048,v:1-(ly+256)/1024,w:.5,h:.25}));
      const centre=localPoint(b,x,z);
      artworks.push({work,atlasIndex,vertexStart,vertexCount:art.attributes.position.count,width,height,
        centre:new THREE.Vector3(centre.x,b.y+1.6,centre.z),cartelY:b.y+cartelY,cartelHeight:.28,normal});
    });
    atlasParts.forEach((parts,i)=>{
      const mesh=attach(`matisse-art-atlas:${i}`,mergeGeometries(parts,false),printMaterial(texture(atlasCanvases[i]),.27));
      artMeshes.push(mesh);parts.forEach(g=>g.dispose());
      artworks.filter(a=>a.atlasIndex===i).forEach(a=>{a.mesh=mesh;});
    });
    attach('matisse-cartels',mergeGeometries(labelParts,false),printMaterial(texture(labelCanvas),.10),'near');labelParts.forEach(g=>g.dispose());
    const distant=[];
    const palette={ebony:[materials.galleryEbony,0x5a4030],leather:[materials.galleryLeather,0x3b6e52],
      gilt:[materials.galleryGilt,0xc9a052],wire:[materials.galleryWire,0x9a8f80]};
    for(const [key,parts] of bins){
      const [mat,flat]=palette[key],geometry=mergeGeometries(parts,false);
      attach(`matisse-interior:${key}`,geometry,mat,'near');parts.forEach(g=>g.dispose());
      if(key==='wire')continue;
      const low=geometry.clone(),color=new THREE.Color(flat),colors=new Float32Array(low.attributes.position.count*3);
      for(let j=0;j<colors.length;j+=3)colors.set([color.r,color.g,color.b],j);
      low.setAttribute('color',new THREE.BufferAttribute(colors,3));distant.push(low);
    }
    attach('matisse-interior-distant',mergeGeometries(distant,false),new THREE.MeshStandardMaterial({vertexColors:true,roughness:.86}),'far');
    distant.forEach(g=>g.dispose());bins.clear();
    return artworks;
  })();
  // Keep failures observable through ready, without an unhandled rejection.
  ready.catch(error=>{if(!disposed)console.error('[resort gallery]',error.message);});
  return {group:room,ready,artworks,artMeshes,nearMeshes,farMeshes,dispose(){
    disposed=true;for(const parts of bins.values())parts.forEach(g=>g.dispose());bins.clear();
  }};
}
