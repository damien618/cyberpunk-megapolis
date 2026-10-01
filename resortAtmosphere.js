import * as THREE from 'three';
import { seededRandom } from './resortLayout.js';
export const TIME_STATES={
  day:{sun:0xffefd7,intensity:2.7,dir:[-.4,.85,-.5],horizon:0xb4e8f4,zenith:0x0876cd,glow:0xfff2c9,fill:1.25,fog:0xb8dce5,lamps:0,caustics:.48,exposure:1},
  sunset:{sun:0xffb77b,intensity:1.7,dir:[-.7,.18,-.65],horizon:0xf5ba9b,zenith:0x597fc6,glow:0xffbc77,fill:.9,fog:0xe2bcb0,lamps:.65,caustics:.18,exposure:.95},
  night:{sun:0xabc9ee,intensity:.65,dir:[-.4,.5,-.7],horizon:0x142b43,zenith:0x041020,glow:0xc1dafa,fill:.8,fog:0x122c40,lamps:1,caustics:.025,exposure:1.05},
};
export function createResortAtmosphere({scene,renderer,camera}) {
  const skyUniforms={uHorizon:{value:new THREE.Color()},uZenith:{value:new THREE.Color()},uGlow:{value:new THREE.Color()},uGlowDir:{value:new THREE.Vector3()},uGlowStrength:{value:.38},uGlowTightness:{value:20}};
  const sky=new THREE.Mesh(new THREE.SphereGeometry(2200,32,18),new THREE.ShaderMaterial({side:THREE.BackSide,depthWrite:false,fog:false,uniforms:skyUniforms,
    vertexShader:'varying vec3 vDir; void main(){vDir=normalize(position);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader:`uniform vec3 uHorizon,uZenith,uGlow,uGlowDir;uniform float uGlowStrength,uGlowTightness;varying vec3 vDir;
      void main(){vec3 d=normalize(vDir);vec3 c=mix(uHorizon,uZenith,pow(max(0.0,d.y),.6));float a=max(0.0,dot(d,normalize(uGlowDir)));c+=uGlow*pow(a,uGlowTightness)*uGlowStrength;c+=uGlow*smoothstep(.9994,.9998,a)*.35;gl_FragColor=vec4(c,1.0);}` }));sky.frustumCulled=false;sky.renderOrder=-2;scene.add(sky);
  const sun=new THREE.DirectionalLight(0xffefd7,2.7);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);sun.shadow.camera.left=-42;sun.shadow.camera.right=42;sun.shadow.camera.top=42;sun.shadow.camera.bottom=-42;sun.shadow.camera.near=60;sun.shadow.camera.far=300;sun.shadow.normalBias=.04;sun.shadow.bias=-.0004;scene.add(sun,sun.target);
  const hemi=new THREE.HemisphereLight(0xd3edff,0xcfc5a1,1.2);scene.add(hemi);scene.fog=new THREE.Fog(0xb8dce5,260,1700);
  const rnd=seededRandom(65417),cloudMat=new THREE.MeshStandardMaterial({color:0xffffff,roughness:1}),clouds=new THREE.InstancedMesh(new THREE.SphereGeometry(1,10,7),cloudMat,70),m=new THREE.Matrix4();
  for(let i=0;i<70;i++){const cluster=Math.floor(i/7),a=cluster*.65,r=750+(cluster%3)*200,x=Math.cos(a)*r,z=Math.sin(a)*r,y=140+(i%7)*5;
    m.compose(new THREE.Vector3(x+(rnd()-.5)*90,y,z+(rnd()-.5)*55),new THREE.Quaternion(),new THREE.Vector3(35+rnd()*35,17+rnd()*25,25+rnd()*25));clouds.setMatrixAt(i,m);}clouds.computeBoundingSphere();scene.add(clouds);
  const sg=new THREE.BufferGeometry(),starsPos=[];for(let i=0;i<850;i++){const a=rnd()*6.28,y=.15+rnd()*.85,r=Math.sqrt(1-y*y);starsPos.push(Math.cos(a)*r*2100,y*2100,Math.sin(a)*r*2100);}sg.setAttribute('position',new THREE.Float32BufferAttribute(starsPos,3));
  const stars=new THREE.Points(sg,new THREE.PointsMaterial({color:0xe7f1ff,size:3,transparent:true,opacity:0,depthWrite:false,fog:false}));stars.frustumCulled=false;scene.add(stars);
  const lights=Array.from({length:6},()=>{const l=new THREE.PointLight(0xffbd77,0,9,2);scene.add(l);return l;});
  let state='day',first=true,current={...TIME_STATES.day},blend=1,start=current;
  let systems=null;
  function setTime(name,immediate=false){name=TIME_STATES[name]?name:'day';state=name;start={...current};blend=immediate||first?1:0;first=false;
    document.querySelectorAll('.brief-resort .tt-btn,[data-resort-time]').forEach(b=>b.classList.toggle('active',(b.dataset.time||b.dataset.resortTime)===state));window.__resortTime=state;}
  function update(dt,pos){blend=Math.min(1,blend+dt/3);const k=blend*blend*(3-2*blend),target=TIME_STATES[state];
    for(const key of ['intensity','fill','lamps','caustics','exposure'])current[key]=THREE.MathUtils.lerp(start[key],target[key],k);
    const color=(key)=>new THREE.Color(start[key]).lerp(new THREE.Color(target[key]),k);
    for(const key of ['sun','horizon','zenith','glow','fog'])current[key]=color(key).getHex();
    const dir=new THREE.Vector3(...start.dir).lerp(new THREE.Vector3(...target.dir),k).normalize();current.dir=dir.toArray();
    sun.color.setHex(current.sun);sun.intensity=current.intensity;sun.target.position.set(Math.round(pos.x/.041)*.041,pos.y,Math.round(pos.z/.041)*.041);sun.position.copy(sun.target.position).addScaledVector(dir,170);sun.target.updateMatrixWorld();
    hemi.intensity=current.fill;hemi.color.setHex(state==='night'?0x729ac0:0xd3edff);scene.fog.color.setHex(current.fog);renderer.toneMappingExposure=current.exposure;
    skyUniforms.uHorizon.value.setHex(current.horizon);skyUniforms.uZenith.value.setHex(current.zenith);skyUniforms.uGlow.value.setHex(current.glow);skyUniforms.uGlowDir.value.copy(dir);sky.position.copy(camera.position);stars.position.copy(camera.position);stars.material.opacity=state==='night'?k*.8:0;
    cloudMat.color.setHex(state==='night'?0x26394d:0xffffff);
    if(systems){systems.materials.lantern.emissiveIntensity=current.lamps*2.4;systems.terrain.caustics.strength.value=current.caustics;systems.corals.setStrength(current.caustics);systems.ocean.setNight(state==='night');systems.ocean.setLagoonLight(.08+.92*Math.pow(current.intensity/2.7,1.5));
      const near=systems.props.lanterns.map(p=>({p,d:Math.hypot(pos.x-p.x,pos.z-p.z)})).sort((a,b)=>a.d-b.d).slice(0,6);
      lights.forEach((l,i)=>{if(near[i])l.position.set(near[i].p.x,near[i].p.y,near[i].p.z);l.intensity=current.lamps*3.2;l.visible=current.lamps>.01&&near[i]?.d<24;});}
  }
  return {skyUniforms,sun,hemi,sky,lights,clouds,setTime,update,connect(s){systems=s;},get time(){return state;}};
}
