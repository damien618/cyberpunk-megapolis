import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { localPoint } from './resortLayout.js';

// The entrance and the 3.2 m central aisle remain clear all the way to the grill.
export const RESTAURANT_TABLES=[[-5.5,1.5],[5.5,1.5],[-5.5,6.2],[5.5,6.2]];
export const RESTAURANT_SEATS=RESTAURANT_TABLES.flatMap(([x,z])=>[
  {x:x-1.25,z,yaw:Math.PI/2,tableX:x,tableZ:z},
  {x:x+1.25,z,yaw:-Math.PI/2,tableX:x,tableZ:z},
]);
export const TEPPAN_SEATS=[{x:-1.8,z:-1.2,yaw:Math.PI},{x:1.8,z:-1.2,yaw:Math.PI}];

export function buildResortRestaurant({b,batch,materials,group,lantern}) {
  const room=new THREE.Group();room.name='fare-restaurant-interior';group.add(room);
  const bins=new Map();
  function tex(draw){const c=Object.assign(document.createElement('canvas'),{width:1024,height:512});draw(c.getContext('2d'));const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=4;return t;}
  const woven=tex(g=>{
    g.fillStyle='#e7d9bb';g.fillRect(0,0,1024,512);
    for(let y=0;y<512;y+=4)for(let x=0;x<1024;x+=4){g.fillStyle=(x+y)%8?'#ddcfb0':'#f5e9d0';g.fillRect(x,y,3,1);g.fillRect(x,y,1,3);}
    g.fillStyle='#176566';g.fillRect(0,38,1024,12);g.fillRect(0,462,1024,12);
    g.strokeStyle='#b78742';g.lineWidth=3;
    for(let x=16;x<1024;x+=32){g.beginPath();g.moveTo(x,18);g.lineTo(x+12,31);g.lineTo(x,44);g.lineTo(x-12,31);g.closePath();g.stroke();}
  });
  const steel=tex(g=>{const gradient=g.createLinearGradient(0,0,0,512);gradient.addColorStop(0,'#738783');gradient.addColorStop(.38,'#ccd8d3');gradient.addColorStop(.46,'#9baaab');gradient.addColorStop(.75,'#bdc9c3');gradient.addColorStop(1,'#7c8e8a');g.fillStyle=gradient;g.fillRect(0,0,1024,512);for(let y=0;y<512;y++){g.fillStyle=`rgba(255,255,255,${.015+.035*(1+Math.sin(y*7.3))})`;g.fillRect(0,y,1024,1);}g.fillStyle='rgba(30,35,33,.15)';g.fillRect(8,8,1008,5);});
  const art=tex(g=>{g.fillStyle='#184b4e';g.fillRect(0,0,1024,512);g.strokeStyle='#e4c794';g.lineWidth=6;g.strokeRect(15,15,994,482);for(let x=70;x<1024;x+=145){g.beginPath();g.moveTo(x,400);g.quadraticCurveTo(x-45,265,x+40,130);g.stroke();for(let y=180;y<390;y+=65){g.save();g.translate(x,y);g.rotate(-.7);g.beginPath();g.ellipse(0,0,17,48,0,0,Math.PI*2);g.stroke();g.restore();}}});
  const mats={timber:materials.barShelf,frame:materials.barFrame,stone:materials.barStone,brass:materials.brass,
    ceramic:materials.ceramic,green:materials.green,fruit:materials.fruit,linen:materials.cotton,
    weave:new THREE.MeshStandardMaterial({map:woven,bumpMap:woven,bumpScale:.003,roughness:.95}),
    steel:new THREE.MeshStandardMaterial({map:steel,metalness:.75,roughness:.42}),
    hot:new THREE.MeshStandardMaterial({color:0x342c24,roughness:.65,metalness:.55}),
    food:new THREE.MeshStandardMaterial({color:0xc87943,roughness:.82}),sear:new THREE.MeshStandardMaterial({color:0x683d25,roughness:.9}),
    glass:new THREE.MeshStandardMaterial({color:0xaddbd5,metalness:.1,roughness:.15}),
    art:new THREE.MeshStandardMaterial({map:art,roughness:.9})};
  const world=new THREE.Matrix4().makeRotationY(b.yaw);world.setPosition(b.x,b.y,b.z);
  function add(mat,g,x,y,z,rx=0,ry=0,rz=0){
    const local=new THREE.Matrix4().compose(new THREE.Vector3(x,y,z),new THREE.Quaternion().setFromEuler(new THREE.Euler(rx,ry,rz)),new THREE.Vector3(1,1,1));
    const geo=g.index?g.toNonIndexed():g;geo.applyMatrix4(local.premultiply(world));
    // Standardise attributes before merging geometry with different primitives.
    for(const key of Object.keys(geo.attributes))if(!['position','normal','uv'].includes(key))geo.deleteAttribute(key);
    if(!bins.has(mat))bins.set(mat,[]);bins.get(mat).push(geo);
  }
  function box(mat,x,y,z,w,h,d,flags={}){
    add(mat,new THREE.BoxGeometry(w,h,d),x,y,z,0,flags.yaw||0);
    if(flags.solid){const p=localPoint(b,x,z);batch.addObstacle(p.x,b.y+y,p.z,w,h,d,b.yaw+(flags.yaw||0),{prop:true});}
  }
  function cylinder(mat,x,y,z,r,h){add(mat,new THREE.CylinderGeometry(r,r,h,16),x,y,z);}
  function dish(x,z,y=.845){
    cylinder('ceramic',x,y,z,.205,.026);cylinder('ceramic',x,y+.02,z,.165,.02);
    for(const dx of [-.29,.29]){box('brass',x+dx,y+.01,z,.022,.012,.24);box('brass',x+dx,y+.01,z-.15,.055,.012,.08);}
    box('weave',x+.39,y-.01,z,.21,.015,.30);
    cylinder('glass',x+.29,y+.13,z-.31,.055,.23);cylinder('fruit',x+.29,y+.11,z-.31,.044,.17);
  }
  function chair({x,z,yaw},stool=false){
    // Proper backs and four tapered-looking legs, rather than floating pads.
    const piece=(m,dx,y,dz,w,h,d)=>{const c=Math.cos(yaw),s=Math.sin(yaw);box(m,x+c*dx+s*dz,y,z-s*dx+c*dz,w,h,d,{yaw});};
    box('timber',x,.41,z,.66,.08,.67,{solid:true,yaw});
    const cushion=new THREE.SphereGeometry(1,16,8);cushion.scale(.33,.07,.32);add('weave',cushion,x,.49,z,0,yaw);
    for(const dx of [-.26,.26])for(const dz of [-.25,.25])piece('frame',dx,.20,dz,.045,.40,.045);
    for(const dx of [-.28,.28])piece('frame',dx,.72,-.29,.045,.62,.045);
    if(!stool){piece('weave',0,.88,-.3,.60,.30,.055);piece('timber',0,1.07,-.3,.67,.04,.075);}
    else piece('timber',0,.81,-.3,.62,.13,.06);
  }
  for(const [x,z] of RESTAURANT_TABLES){
    const shape=new THREE.Shape(),w=.855,d=.755,r=.08;
    shape.moveTo(-w+r,-d);shape.lineTo(w-r,-d);shape.quadraticCurveTo(w,-d,w,-d+r);shape.lineTo(w,d-r);shape.quadraticCurveTo(w,d,w-r,d);shape.lineTo(-w+r,d);shape.quadraticCurveTo(-w,d,-w,d-r);shape.lineTo(-w,-d+r);shape.quadraticCurveTo(-w,-d,-w+r,-d);
    const slab=new THREE.ExtrudeGeometry(shape,{depth:.07,bevelEnabled:true,bevelSize:.02,bevelThickness:.015,bevelSegments:2,steps:1,curveSegments:5});slab.rotateX(Math.PI/2);
    add('timber',slab,x,.805,z);
    const tp=localPoint(b,x,z);batch.addObstacle(tp.x,b.y+.77,tp.z,1.75,.10,1.55,b.yaw,{prop:true});
    for(const dx of [-.67,.67])for(const dz of [-.58,.58])box('frame',x+dx,.36,z+dz,.07,.72,.07);
    box('weave',x,.83,z,.52,.018,1.50);
    dish(x-.55,z);dish(x+.55,z);
    cylinder('ceramic',x,.94,z-.3,.075,.19);
    for(let k=0;k<3;k++)add('green',new THREE.SphereGeometry(.06,8,5),x+.035*Math.cos(k*2),1.07+k*.045,z-.30);
  }
  RESTAURANT_SEATS.forEach(s=>chair(s));TEPPAN_SEATS.forEach(s=>chair(s,true));
  // Teppanyaki island, stainless griddle, extraction hood and rear prep bench.
  box('frame',0,.47,-3.0,6,.94,1.7,{solid:true});box('stone',0,.98,-3,6.3,.12,1.95);
  box('steel',0,1.055,-3.0,3.8,.035,1.13);box('hot',0,1.078,-3.0,3.48,.015,.95);
  for(const x of [-2.75,2.75]){box('weave',x,.59,-2.12,.42,.60,.035);box('brass',x,.24,-2.1,.43,.025,.025);}
  for(const x of [-2.6,2.6])dish(x,-2.45,1.065);
  for(let i=0;i<5;i++){
    const food=new THREE.SphereGeometry(1,12,6);food.scale(.14,.038,.095);add('food',food,-.95+i*.39,1.116,-3,0,i*.3);
    for(let k=0;k<3;k++)box('sear',-.99+i*.39+k*.036,1.15,-3,.009,.003,.12);
    const vegetable=new THREE.SphereGeometry(.08,8,6);vegetable.scale(1,.6,1);add('green',vegetable,-.8+i*.37,1.125,-3.3);
  }
  for(const x of [-1.3,1.3]){cylinder('steel',x,1.11,-3.55,.21,.06);box('frame',x+.31,1.14,-3.55,.40,.045,.065);}
  box('steel',1.45,1.105,-2.7,.095,.024,.22);box('frame',1.45,1.12,-2.45,.045,.035,.27);
  box('steel',0,3.25,-3,4.2,.32,1.5);box('steel',0,3.55,-3,.65,.45,.6);
  for(const x of [-1.8,1.8])box('frame',x,3.76,-3,.035,.30,.035);
  box('frame',0,.49,-5.5,7.7,.98,.65,{solid:true});box('stone',0,1.025,-5.5,7.9,.08,.80);
  box('steel',-2.45,1.065,-5.5,.95,.02,.50);
  add('steel',new THREE.TorusGeometry(.10,.014,6,16,Math.PI),-2.45,1.23,-5.53);
  box('timber',2.3,1.095,-5.5,.70,.055,.46);
  for(let i=0;i<6;i++)cylinder('ceramic',-.65,1.09+i*.026,-5.48,.20,.022);
  for(const x of [-3.2,-2.9,3,3.3])cylinder('fruit',x,1.2,-5.5,.065,.28);
  // Slatted rear screens and botanical panels, leaving the sea-facing sides open.
  for(const x of [-7.1,7.1]){
    for(let k=0;k<14;k++)box('timber',x-.95+k*.15,1.55,-5.65,.075,3,.10);
    box('art',x,2.05,-5.53,1.9,1.18,.065);
    box('stone',x,.24,-5,.52,.48,.52);
    for(let k=0;k<5;k++){const leaf=new THREE.SphereGeometry(1,10,6);leaf.scale(.075,.44,.025);add('green',leaf,x+Math.sin(k)*.15,.76,-5+Math.cos(k)*.15,.3,k,Math.sin(k)*.5);}
  }
  for(const [x,z] of RESTAURANT_TABLES){
    cylinder('weave',x,3.10,z,.32,.34);cylinder('linen',x,2.96,z,.27,.04);box('brass',x,3.57,z,.018,.58,.018);
    const p=localPoint(b,x,z);lantern(p.x,b.y+2.98,p.z);
  }
  const label=tex(g=>{g.fillStyle='#194b4c';g.fillRect(0,0,1024,512);g.strokeStyle='#d8b67a';g.lineWidth=8;g.strokeRect(18,18,988,476);g.fillStyle='#f3e4c6';g.textAlign='center';g.font='85px Georgia';g.fillText('FARE',512,223);g.font='38px sans-serif';g.fillText('RESTAURANT · TEPPANYAKI',512,340);});
  const sign=new THREE.Mesh(new THREE.BoxGeometry(4.6,.68,.10),[materials.barFrame,materials.barFrame,materials.barFrame,materials.barFrame,new THREE.MeshStandardMaterial({map:label,roughness:.85}),materials.barFrame]);
  const p=localPoint(b,0,b.d/2+.14);sign.position.set(p.x,b.y+3.43,p.z);sign.rotation.y=b.yaw;sign.name='restaurant-sign';room.add(sign);
  for(const x of [-1.9,1.9])box('brass',x,3.83,b.d/2+.14,.025,.19,.025);
  const distantParts=[],flatColors={timber:0x65492f,frame:0x3c2a20,stone:0xdbd3be,brass:0xb5945a,ceramic:0xeee6d3,green:0x41833e,fruit:0xffbe39,linen:0xf0e6cf,weave:0xdcccaa,steel:0xa8b4b1,hot:0x342c24,food:0xc87943,sear:0x683d25,glass:0xaddbd5,art:0x184b4e};
  const nearby=pos=>Math.hypot(pos.x-b.x,pos.z-b.z)<60;
  for(const [key,gs] of bins){
    const geo=mergeGeometries(gs,false),mesh=new THREE.Mesh(geo,mats[key]);mesh.name=`fare-interior:${key}`;mesh.receiveShadow=true;room.add(mesh);
    mesh.userData.visibleAt=nearby;batch.addDetailMesh(mesh,Infinity);
    const distant=geo.clone(),color=new THREE.Color(flatColors[key]),colors=new Float32Array(geo.attributes.position.count*3);
    for(let i=0;i<colors.length;i+=3)colors.set([color.r,color.g,color.b],i);
    distant.setAttribute('color',new THREE.BufferAttribute(colors,3));distantParts.push(distant);gs.forEach(g=>g.dispose());
  }
  // Preserve every table, chair and kitchen shape; far away their small texture
  // details can share one draw instead of a separate draw for each material.
  const distantInterior=new THREE.Mesh(mergeGeometries(distantParts,false),new THREE.MeshStandardMaterial({vertexColors:true,roughness:.86}));
  distantInterior.name='fare-interior-distant';distantInterior.receiveShadow=true;room.add(distantInterior);
  distantInterior.userData.visibleAt=pos=>!nearby(pos)&&Math.hypot(pos.x-b.x,pos.z-b.z)<125;batch.addDetailMesh(distantInterior,Infinity);distantParts.forEach(g=>g.dispose());

  const steamTexture=tex(g=>{g.clearRect(0,0,1024,512);const gradient=g.createRadialGradient(512,256,0,512,256,220);gradient.addColorStop(0,'rgba(255,250,231,.8)');gradient.addColorStop(1,'rgba(255,250,231,0)');g.fillStyle=gradient;g.fillRect(0,0,1024,512);});
  const steamGeo=new THREE.BufferGeometry().setAttribute('position',new THREE.BufferAttribute(new Float32Array(36),3));
  const steam=new THREE.Points(steamGeo,new THREE.PointsMaterial({map:steamTexture,color:0xffefdc,size:.32,transparent:true,opacity:.18,depthWrite:false}));
  const smokePosition=localPoint(b,0,-3);steam.position.set(smokePosition.x,b.y,smokePosition.z);steam.name='fare-grill-steam';room.add(steam);
  function update(t){const p=steamGeo.attributes.position;for(let i=0;i<12;i++){const phase=(t*.24+i/12)%1;p.setXYZ(i,(i%3-1)*.65+Math.sin(t*.6+i)*.08,1.15+phase*.75,Math.cos(t*.5+i)*.10);}p.needsUpdate=true;}
  update(0);
  room.userData.tables=RESTAURANT_TABLES;room.userData.seats=[...RESTAURANT_SEATS,...TEPPAN_SEATS];
  return {update};
}
