import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { localPoint } from './resortLayout.js';

// Original batik-inspired ornament and carved souvenirs, grouped by material
// so the welcome pavilion can stay detailed without one draw per trinket.
export function buildReceptionDecor({b,batch,materials,group}) {
  const display=new THREE.Group();display.name='maeva-reception-decor';group.add(display);
  const bins=new Map(),items=[];
  function texture(w,h,draw){
    const c=Object.assign(document.createElement('canvas'),{width:w,height:h});draw(c.getContext('2d'),w,h);
    const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=4;return t;
  }
  const batik=texture(1024,512,(g,W,H)=>{
    g.fillStyle='#173e43';g.fillRect(0,0,W,H);g.strokeStyle='#c5a46d';g.lineWidth=3;
    for(let y=0;y<H;y+=128)for(let x=0;x<W;x+=128){
      g.save();g.translate(x+64,y+64);
      for(let k=0;k<4;k++){g.rotate(Math.PI/2);g.beginPath();g.ellipse(0,-24,15,31,0,0,Math.PI*2);g.stroke();}
      g.fillStyle='#efe0b5';g.beginPath();g.arc(0,0,5,0,Math.PI*2);g.fill();g.restore();
      for(const [dx,dy] of [[9,9],[119,9],[9,119],[119,119]]){g.beginPath();g.arc(x+dx,y+dy,3,0,Math.PI*2);g.fill();}
    }
    g.strokeStyle='#edcf91';g.lineWidth=7;g.strokeRect(7,7,W-14,H-14);
  });
  const weave=texture(512,512,(g,W,H)=>{
    g.fillStyle='#8b643d';g.fillRect(0,0,W,H);
    for(let y=0;y<H;y+=16)for(let x=0;x<W;x+=16){
      g.fillStyle=(x+y)%32?'#c9a16a':'#b28751';g.fillRect(x+1,y+1,14,14);
      g.strokeStyle='#dfbd83';g.lineWidth=2;g.beginPath();g.moveTo(x+3,y+3);g.lineTo(x+13,y+13);g.stroke();
    }
  });weave.wrapS=weave.wrapT=THREE.RepeatWrapping;weave.repeat.set(2,2);
  const labels=texture(1024,256,(g,W,H)=>{
    g.fillStyle='#eddfbe';g.fillRect(0,0,W,H);g.fillStyle='#244c49';g.textAlign='center';
    g.font='bold 39px Georgia';g.fillText('SOUVENIRS',256,117);g.fillText('BAIGNADE',768,117);
    g.font='20px sans-serif';g.fillText('Artisanat · Motifs des îles',256,158);g.fillText('Masques · Tubas · Palmes',768,158);
    g.strokeStyle='#ac8853';g.lineWidth=3;g.strokeRect(12,55,488,137);g.strokeRect(524,55,488,137);
  });
  // Four printed pareos in one atlas: solid ground, white hibiscus, fringed hem.
  const pareo=texture(1024,512,(g,W,H)=>{
    ['#d9572b','#1f7f8c','#e8b33a','#7a3e8f'].forEach((ground,k)=>{
      const x0=k*256;g.fillStyle=ground;g.fillRect(x0,0,256,H);g.fillStyle='#fbf3e4';
      for(let n=0;n<7;n++){
        const cx=x0+40+((Math.sin(n*12.9+k*3.1)+1)/2)*176,cy=40+n*68+Math.sin(n*4.7+k)*14,r=14+(n+k)%3*7;
        for(let p=0;p<5;p++){g.save();g.translate(cx,cy);g.rotate(p*Math.PI*2/5+n);g.beginPath();g.ellipse(0,-r*.7,r*.42,r*.72,0,0,Math.PI*2);g.fill();g.restore();}
        g.fillStyle=ground;g.beginPath();g.arc(cx,cy,r*.18,0,Math.PI*2);g.fill();g.fillStyle='#fbf3e4';
      }
      g.fillRect(x0,H-26,256,5);for(let x=x0+3;x<x0+256;x+=7)g.fillRect(x,H-20,2,20);
    });
  });
  const palette={wood:materials.barShelf,brass:materials.brass,ceramic:materials.ceramic,cotton:materials.cotton,light:materials.lantern,
    batik:new THREE.MeshStandardMaterial({map:batik,roughness:.92,side:THREE.DoubleSide}),
    rattan:new THREE.MeshStandardMaterial({map:weave,bumpMap:weave,bumpScale:.008,roughness:.96,side:THREE.DoubleSide}),
    polymer:new THREE.MeshStandardMaterial({vertexColors:true,roughness:.48}),
    terry:new THREE.MeshStandardMaterial({vertexColors:true,roughness:.97}),
    pareo:new THREE.MeshStandardMaterial({map:pareo,roughness:.9,side:THREE.DoubleSide}),
    glass:new THREE.MeshStandardMaterial({color:0xa8e1df,transparent:true,opacity:.48,roughness:.16,depthWrite:false}),
    label:new THREE.MeshStandardMaterial({map:labels,roughness:.8,side:THREE.DoubleSide})};
  function add(key,geometry,x,y,z,sx=1,sy=1,sz=1,rx=0,ry=0,rz=0,color=0xffffff){
    if(geometry.index){const source=geometry;geometry=source.toNonIndexed();source.dispose();}
    const p=localPoint(b,x,z),q=new THREE.Quaternion().setFromEuler(new THREE.Euler(rx,b.yaw+ry,rz,'YXZ'));
    geometry.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(p.x,b.y+y,p.z),q,new THREE.Vector3(sx,sy,sz)));
    if((key==='polymer'||key==='terry')&&!geometry.attributes.color)tint(geometry,color);
    if(!bins.has(key))bins.set(key,[]);bins.get(key).push(geometry);
  }
  const box=(key,x,y,z,w,h,d)=>add(key,new THREE.BoxGeometry(w,h,d),x,y,z);
  // Each stall is laid out in its own turned frame so nothing lines up with the deck.
  function frame(cx,cz,a=0){
    const c=Math.cos(a),s=Math.sin(a),at=(u,w)=>[cx+c*u+s*w,cz-s*u+c*w];
    const f={
      add(key,g,u,y,w,sx=1,sy=1,sz=1,rx=0,ry=0,rz=0,color=0xffffff){const [x,z]=at(u,w);add(key,g,x,y,z,sx,sy,sz,rx,a+ry,rz,color);},
      box(key,u,y,w,W,H,D,ry=0,color){f.add(key,new THREE.BoxGeometry(W,H,D),u,y,w,1,1,1,0,ry,0,color);},
      sphere(key,u,y,w,W,H,D,color){f.add(key,new THREE.SphereGeometry(1,12,8),u,y,w,W,H,D,0,0,0,color);},
      solid(u,y,w,W,H,D){const [x,z]=at(u,w),p=localPoint(b,x,z);batch.box('barShelf',p.x,b.y+y,p.z,W,H,D,b.yaw+a,{solid:true,detail:true});},
      sub(u,w,ry=0){const [x,z]=at(u,w);return frame(x,z,a+ry);}
    };return f;
  }
  const root=frame(0,0);
  // Small multi-part objects are composed upright, then tilted as one piece.
  function piece(g,x=0,y=0,z=0,rx=0,ry=0,rz=0,sx=1,sy=1,sz=1,color){
    if(g.index){const source=g;g=source.toNonIndexed();source.dispose();}
    g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(x,y,z),new THREE.Quaternion().setFromEuler(new THREE.Euler(rx,ry,rz)),new THREE.Vector3(sx,sy,sz)));
    if(color!==undefined)tint(g,color);return g;
  }
  function tint(g,color){const c=new THREE.Color(color),v=[];for(let i=0;i<g.attributes.position.count;i++)v.push(c.r,c.g,c.b);g.setAttribute('color',new THREE.Float32BufferAttribute(v,3));}
  function merged(list){const g=mergeGeometries(list);list.forEach(p=>p.dispose());return g;}
  function drape(f,key,u,y,w,W,H,ry=0,folds=5,amp=.02){
    const g=new THREE.PlaneGeometry(W,H,folds*4,3),p=g.attributes.position;
    for(let i=0;i<p.count;i++){const t=(H/2-p.getY(i))/H;p.setZ(i,Math.sin((p.getX(i)/W+.5)*folds*Math.PI*2)*amp*t);}
    g.computeVertexNormals();f.add(key,g,u,y,w,1,1,1,0,ry);
  }
  function vessel(f,u,y,w,s,key){
    const profile=[[.065,0],[.105,.07],[.10,.16],[.05,.25],[.047,.30]].map(([r,h])=>new THREE.Vector2(r*s,h*s));
    f.add(key,new THREE.LatheGeometry(profile,14),u,y,w);
    f.add('brass',new THREE.TorusGeometry(.047*s,.008,5,16),u,y+.30*s,w,1,1,1,Math.PI/2);
  }
  function basket(f,u,y,w,r,h,lid=false){
    f.add('rattan',new THREE.SphereGeometry(1,14,6,0,Math.PI*2,Math.PI/2,Math.PI/2),u,y+h,w,r,h,r);
    f.add('rattan',new THREE.TorusGeometry(r,.018,5,22),u,y+h,w,1,1,1,Math.PI/2);
    if(lid){f.add('rattan',new THREE.SphereGeometry(1,14,4,0,Math.PI*2,0,Math.PI/2),u,y+h,w,r*1.02,h*.35,r*1.02);f.sphere('wood',u,y+h*1.38,w,.025,.02,.025);}
  }
  function carvedFace(f,y0){
    f.box('wood',0,y0+.02,0,.27,.045,.20);f.box('brass',0,y0+.18,-.02,.015,.31,.015);
    f.sphere('wood',0,y0+.34,.01,.115,.20,.055);
    for(const side of [-1,1]){f.sphere('polymer',side*.043,y0+.37,.059,.025,.012,.006,0x27312a);f.sphere('wood',side*.06,y0+.295,.058,.035,.028,.012);}
    f.sphere('wood',0,y0+.335,.07,.020,.047,.021);f.box('brass',0,y0+.25,.065,.065,.008,.010);
  }
  function boat(f,y0){
    f.add('wood',new THREE.SphereGeometry(1,16,8,0,Math.PI*2,Math.PI/2,Math.PI/2),0,y0+.14,0,.27,.13,.075);
    f.box('wood',0,y0+.03,0,.18,.06,.12);f.box('brass',0,y0+.28,0,.012,.28,.012);
    const sail=new THREE.BufferGeometry();sail.setAttribute('position',new THREE.Float32BufferAttribute([0,0,0,.17,0,0,0,.24,0],3));
    sail.setAttribute('uv',new THREE.Float32BufferAttribute([0,0,1,0,0,1],2));sail.computeVertexNormals();f.add('batik',sail,0,y0+.19,0);
    f.box('wood',.14,y0+.14,-.16,.36,.016,.022);f.sphere('wood',.19,y0+.11,-.22,.025,.025,.21);
  }
  // A-frame chalk sign; the label atlas holds both stall names side by side.
  function aSign(f,index){
    for(const s of [-1,1])f.add('wood',new THREE.BoxGeometry(.6,.82,.03),0,.39,s*.1,1,1,1,-s*.25);
    const g=new THREE.PlaneGeometry(.54,.27),uv=g.attributes.uv;
    for(let i=0;i<uv.count;i++)uv.setX(i,(uv.getX(i)+index)/2);
    f.add('label',g,0,.47,.094,1,1,1,-.25);
    f.box('wood',0,.22,0,.5,.025,.2);
  }

  // SOUVENIRS: pareos drying on a rope, a draped trestle table, a stepped stand
  // and baskets on the floor, all turned toward the entrance at varied angles.
  const tiki=frame(-6.55,2.0,Math.PI/2);
  tiki.box('wood',0,.05,0,.3,.1,.3);tiki.add('wood',new THREE.CylinderGeometry(.085,.11,2,10),0,1,0);
  for(const y of [.55,.95])tiki.add('wood',new THREE.TorusGeometry(.1,.025,6,16),0,y,0,1,1,1,Math.PI/2);
  tiki.sphere('wood',0,1.55,0,.14,.22,.12);tiki.sphere('wood',0,1.86,0,.1,.12,.1);
  for(const side of [-1,1]){tiki.sphere('polymer',side*.05,1.6,.105,.03,.022,.012,0x27312a);tiki.sphere('wood',side*.075,1.5,.1,.04,.03,.02);}
  tiki.box('brass',0,1.42,.115,.09,.012,.012);tiki.solid(0,1,0,.11,2,.11);
  const rope=new THREE.QuadraticBezierCurve3(new THREE.Vector3(-6.68,1.92,5.05),new THREE.Vector3(-6.66,1.55,3.55),new THREE.Vector3(-6.55,1.92,2.08));
  root.add('wood',new THREE.TubeGeometry(rope,18,.011,5,false),0,0,0);
  [[.2,0,.62],[.47,1,.55],[.74,2,.6]].forEach(([t,index,W],k)=>{
    const p=rope.getPoint(t),H=1.05-k*.12,g=new THREE.PlaneGeometry(W,H,14,4),pos=g.attributes.position,uv=g.attributes.uv;
    for(let i=0;i<pos.count;i++){const d=(H/2-pos.getY(i))/H;pos.setZ(i,Math.sin((pos.getX(i)/W+.5)*Math.PI*3+k)*.035*d);}
    for(let i=0;i<uv.count;i++)uv.setX(i,(uv.getX(i)+index)/4);g.computeVertexNormals();
    add('pareo',g,p.x+.02,p.y-H/2+.01,p.z,1,1,1,0,Math.PI/2,(k-1)*.04);
  });
  const table=frame(-4.85,3.15,.5);
  for(const u of [-.72,.72])for(const w of [-.28,.28])table.box('wood',u,.37,w,.06,.74,.06);
  table.solid(0,.76,0,1.6,.04,.72);
  table.add('batik',new THREE.PlaneGeometry(1.7,.82),0,.785,0,1,1,1,-Math.PI/2);
  drape(table,'batik',0,.56,.41,1.7,.45,0,6);
  for(const s of [-1,1])drape(table,'batik',s*.85,.635,0,.82,.3,s*Math.PI/2,3);
  [[-.62,-.14,1.3,'ceramic'],[-.43,.13,.8,'batik'],[-.27,-.2,1.05,'ceramic'],[-.12,.16,.65,'ceramic']].forEach(([u,w,s,key])=>vessel(table,u,.79,w,s,key));
  boat(table.sub(.12,-.12,.35),.79);
  carvedFace(table.sub(.5,-.2,-.25),.79);carvedFace(table.sub(.72,.06,.2),.79);
  table.add('rattan',new THREE.CylinderGeometry(.16,.14,.03,16),.32,.805,.22);
  for(let i=0;i<4;i++)table.add('ceramic',new THREE.TorusGeometry(.065-i*.008,.007,5,18),.32+Math.sin(i*2.1)*.03,.83+i*.012,.22+Math.cos(i*2.1)*.03,1,1,1,Math.PI/2-.1,0,i*.3);
  const steps=frame(-5.95,.55,.95);
  for(const u of [-.55,.55]){steps.box('wood',u,.475,0,.05,.95,.9);steps.solid(u,.475,0,.05,.95,.9);}
  [[.3,.3],[.6,0],[.9,-.3]].forEach(([y,w])=>{steps.box('wood',0,y,w,1.1,.04,.3);steps.box('rattan',0,y/2,w+.15,1.06,y,.02);});
  steps.solid(0,.15,.3,1.1,.3,.3);
  basket(steps,-.28,.32,.3,.13,.12,true);basket(steps,.22,.32,.3,.16,.1);
  [[-.3,.85,'batik'],[0,1.15,'ceramic'],[.3,.7,'ceramic']].forEach(([u,s,key])=>vessel(steps,u,.62,0,s,key));
  boat(steps.sub(-.22,-.3,-.3),.92);carvedFace(steps.sub(.25,-.3,.15),.92);
  [[-5.55,1.62,.24,.26,false],[-6.02,1.82,.2,.3,true],[-5.28,2.02,.15,.17,false]].forEach(([x,z,r,h,lid])=>basket(root,x,0,z,r,h,lid));
  aSign(frame(-3.1,4.5,.4),0);
  items.push('pareos','tiki-pole','draped-table','ceramic-vessels','woven-baskets','miniature-boats','carved-souvenirs','shell-necklaces','batik-fascia');

  // BAIGNADE: an open hanging rack, towels in a bin, fins against a crate,
  // bodyboards against the terrace rail and a furled parasol resting on the column.
  const rack=frame(5.5,2.3,-.45);
  for(const u of [-.8,.8]){rack.box('wood',u,.975,0,.07,1.95,.07);rack.solid(u,.04,0,.12,.08,.55);}
  rack.box('wood',0,1.92,0,1.68,.06,.06);rack.box('wood',0,.98,0,1.6,.04,.04);
  for(const [u,y,w,color,rz] of [[-.4,1.5,.1,0xf08b56,.06],[.32,1.46,.17,0x4eafb5,-.1]]){
    rack.add('polymer',new THREE.TorusGeometry(.33,.08,8,28),u,y,w,1,1,1,0,0,rz,color);
    for(const angle of [0,Math.PI])rack.add('cotton',new THREE.TorusGeometry(.33,.082,6,5,Math.PI/5),u,y,w,1,1,1,0,0,angle+rz);
    rack.add('wood',new THREE.CylinderGeometry(.008,.008,.14,4),u,1.86,w*.5);
  }
  for(const [u,color] of [[-.5,0xf1a34d],[-.05,0x4eafb5],[.42,0xf1a34d]]){
    const m=rack.sub(u,.05);
    for(const side of [-1,1]){
      m.add('polymer',new THREE.TorusGeometry(.075,.014,6,20),side*.088,.82,0,1,.77,1,0,0,0,color);
      m.add('glass',new THREE.CircleGeometry(.07,20),side*.088,.82,-.004,1,.77,1);
    }
    m.sphere('polymer',0,.795,.012,.03,.027,.022,color);m.add('brass',new THREE.CylinderGeometry(.006,.006,.12,4),0,.92,-.02);
    const curve=new THREE.CatmullRomCurve3([new THREE.Vector3(0,0,0),new THREE.Vector3(.02,-.18,0),new THREE.Vector3(.06,-.4,0)]);
    m.add('polymer',new THREE.TubeGeometry(curve,10,.019,6,false),.2,.97,.03,1,1,1,0,0,0,color);
  }
  const bin=frame(4.45,4.35,.2);
  bin.add('rattan',new THREE.CylinderGeometry(.3,.26,.48,18,1,true),0,.24,0);
  bin.add('wood',new THREE.CircleGeometry(.26,18),0,.02,0,1,1,1,-Math.PI/2);
  bin.add('rattan',new THREE.TorusGeometry(.3,.022,5,24),0,.48,0,1,1,1,Math.PI/2);
  [[0,0,0xf7f1e3],[.12,.07,0xe86f5a],[-.11,.09,0x2f8f9d],[.05,-.13,0xf2c14e],[-.08,-.1,0xe86f5a],[.15,-.06,0x2f8f9d],[-.15,0,0xf7f1e3]].forEach(([u,w,color],i)=>{
    bin.add('terry',new THREE.CylinderGeometry(.068,.068,.44,12),u,.4+(i%3)*.03,w,1,1,1,w*1.6,0,-u*1.6,color);
  });
  const crate=frame(6.1,3.9,.3);
  crate.solid(0,.22,0,.75,.44,.46);
  for(const y of [.09,.22,.35])crate.box('wood',0,y,.235,.77,.07,.015);
  for(const y of [.5,.58])crate.add('polymer',new THREE.TorusGeometry(.3,.075,8,26),.05,y,-.02+(y-.5),1,1,1,Math.PI/2,0,0,y>.55?0xf2c14e:0xe86f5a);
  const outline=new THREE.Shape();outline.moveTo(-.07,.23);outline.quadraticCurveTo(-.13,-.03,-.13,-.26);
  outline.quadraticCurveTo(0,-.31,.13,-.26);outline.quadraticCurveTo(.13,-.03,.07,.23);outline.closePath();
  [-.27,-.09,.09,.27].forEach((u,i)=>{
    const color=i<2?0x287d89:0xdd9363,lean=.36+(i%2)*.05;
    const fin=merged([
      piece(new THREE.ExtrudeGeometry(outline,{depth:.022,bevelEnabled:true,bevelThickness:.009,bevelSize:.012,bevelSegments:2,steps:1}),0,0,0,0,0,0,1,1,1,color),
      piece(new THREE.SphereGeometry(1,12,8),0,.13,.046,0,0,0,.071,.12,.048,0x253d43),
      ...[-.08,.08].map(dx=>piece(new THREE.BoxGeometry(.009,.31,.013),dx,-.09,.043,0,0,0,1,1,1,color))]);
    crate.add('polymer',fin,u,.3,.35+i%2*.02,1,1,1,-lean,0,(i-1.5)*.04);
  });
  const boards=frame(6.88,6.45,-Math.PI/2),deck=new THREE.Shape();
  deck.moveTo(-.25,-.5);deck.lineTo(.25,-.5);deck.quadraticCurveTo(.27,.3,.17,.5);deck.lineTo(-.17,.5);deck.quadraticCurveTo(-.27,.3,-.25,-.5);
  [[-.3,.3,0xf2c14e,.05],[.28,.3,0x2f8f9d,-.04]].forEach(([u,lean,color,rz])=>{
    boards.add('polymer',new THREE.ExtrudeGeometry(deck,{depth:.04,bevelEnabled:true,bevelThickness:.01,bevelSize:.012,bevelSegments:2,steps:1}),u,.49,0,1,1,1,-lean,0,rz,color);
  });
  const parasol=merged([
    piece(new THREE.CylinderGeometry(.018,.018,2.05,6),0,1.025,0,0,0,0,1,1,1,0xe9e0cc),
    piece(new THREE.ConeGeometry(.12,.9,12,1,true),0,1.45,0,Math.PI,0,0,1,1,1,0x2f8f9d),
    piece(new THREE.ConeGeometry(.07,.32,12,1,true),0,1.12,0,Math.PI,0,0,1,1,1,0xf7f1e3),
    piece(new THREE.SphereGeometry(.03,8,6),0,2.07,0,0,0,0,1,1,1,0xe9e0cc)]);
  root.add('polymer',parasol,6.43,0,5.2,1,1,1,0,0,-.12);
  aSign(frame(3.2,4.6,-.4),1);
  items.push('hanging-rack','inflatable-rings','diving-masks','snorkels','towel-bin','swimming-fins','bodyboards','parasol');
  // A patterned counter fascia and a thin woven welcome rug.
  box('batik',0,.64,.514,7.9,.53,.016);box('brass',0,.93,.53,7.95,.026,.022);
  add('rattan',new THREE.PlaneGeometry(4.2,2.25),0,.017,3.1,1,1,1,-Math.PI/2);
  // Pendant shades stay above head height; their bulbs share the night lamps.
  box('wood',0,3.50,2.1,13.8,.12,.12);
  for(const x of [-4.55,4.55]){
    add('rattan',new THREE.CylinderGeometry(.16,.29,.32,16,1,true),x,2.98,2.1);
    add('brass',new THREE.CylinderGeometry(.012,.012,.32,6),x,3.30,2.1);
    root.sphere('light',x,2.94,2.1,.07,.09,.07);
  }
  for(const [key,geometries] of bins){
    const geometry=mergeGeometries(geometries),mesh=new THREE.Mesh(geometry,palette[key]);
    mesh.name=`reception-decor:${key}`;mesh.receiveShadow=true;mesh.castShadow=key==='wood'||key==='rattan';
    display.add(mesh);batch.addDetailMesh(mesh,38);geometries.forEach(g=>g.dispose());
  }
  display.userData.items=items;return display;
}
