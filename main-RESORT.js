import * as THREE from 'three';
import { Player } from './player.js?v=20261001-resort';
import { harmoniseHair } from './hair.js?v=8';
import { Controller } from './controller.js?v=20261001-resort';
import { Input } from './input.js';
import { CameraRig } from './cameraRig.js?v=20261001-resort';
import * as layout from './resortLayout.js';
import { createResortMaterials } from './resortMaterials.js';
import { createResortBatch } from './resortGeometry.js';
import { createResortCollision } from './resortCollision.js';
import { buildResortTerrain } from './resortTerrain.js';
import { buildResortBackdrop } from './resortBackdrop.js';
import { createResortLagoon } from './resortLagoon.js';
import { buildResortCorals } from './resortCorals.js';
import { buildResortArchitecture } from './resortArchitecture.js';
import { buildResortBoardwalks } from './resortBoardwalks.js';
import { buildResortPools } from './resortPools.js';
import { createResortGuests } from './resortGuests.js';
import { buildResortProps } from './resortProps.js';
import { buildResortVegetation } from './resortVegetation.js';
import { createResortAtmosphere } from './resortAtmosphere.js';
import { createWaterProbe } from './resortMovement.js';
import { createResortInteractions } from './resortInteractions.js?v=20261003-matisse-v4';
import { createIslandSign } from './islandTravel.js';
import { islandTime } from './islandGeography.js';
import * as galleryInteractionModule from './resortGalleryInteraction.js?v=20261003-matisse-v4';

const renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'});
renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.5));renderer.setSize(innerWidth,innerHeight);
renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.outputColorSpace=THREE.SRGBColorSpace;
document.getElementById('app').appendChild(renderer.domElement);
const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(68,innerWidth/innerHeight,.15,2600);
const maxAniso=Math.min(8,renderer.capabilities.getMaxAnisotropy()),clock=new THREE.Clock();
const collision=createResortCollision(),materials=createResortMaterials(maxAniso),batch=createResortBatch(scene,materials,collision);
const atmosphere=createResortAtmosphere({scene,renderer,camera});
const terrain=buildResortTerrain({scene,maxAniso}),backdrop=buildResortBackdrop(scene);
const ocean=createResortLagoon({scene,maxAniso,skyUniforms:atmosphere.skyUniforms}),corals=buildResortCorals(scene);
const architecture=buildResortArchitecture({scene,batch,materials});
const boardwalks=buildResortBoardwalks({batch,collision}),pools=buildResortPools({scene,batch});
const props=buildResortProps({scene,batch,materials}),vegetation=buildResortVegetation({scene,maxAniso,collision});
batch.finish();collision.boundaries();
createIslandSign(scene,{...layout.FOREST_GATE,y:layout.terrainHeight(layout.FOREST_GATE.x,layout.FOREST_GATE.z),label:'→ Forêt · La cascade',yaw:-Math.PI/2});
atmosphere.connect({materials,terrain,corals,props,ocean});
const params=new URLSearchParams(location.search),arrival=params.get('arrival')==='jungle'?layout.FOREST_ARRIVAL:layout.SPAWN;
const spawnPoint=new THREE.Vector3(arrival.x,layout.terrainHeight(arrival.x,arrival.z),arrival.z);
const waterProbe=createWaterProbe(ocean,()=>clock.elapsedTime);
let player=null,started=false,paused=false,leaving=false;
const ctrl=new Controller(collision.bw,collision.groundFn,collision.castFn,{onReset:()=>{interactions.stand();ctrl.rescueTo(spawnPoint);},onLand:k=>player?.onLand(k)},{waterProbe,allowWeb:false});
ctrl.rescueTo(spawnPoint);ctrl.speedMult=.55;
const input=new Input(renderer.domElement);input.yaw=arrival.yaw;
const rig=new CameraRig(camera,collision.bw);
const overlay=document.getElementById('overlay');
function lock(){try{renderer.domElement.requestPointerLock?.()?.catch?.(()=>{});}catch{}}
function setResortTime(name,immediate=false){atmosphere.setTime(islandTime(name),immediate);}
const initialTime=islandTime(params.get('time')??'day');setResortTime(initialTime,true);
// Reuse the avatar and wardrobe, with the same material records as the jungle.
const records=await fetch('./chars/data/materials.json').then(r=>r.json());
const textureCache=new Map(),loader=new THREE.TextureLoader();
function texture(file,srgb){const path=file.replace(/\.(tga|psd|tif|png)$/i,'.webp'),key=path+srgb;if(!textureCache.has(key)){const t=loader.load('./chars/textures/'+encodeURIComponent(path));t.flipY=false;t.colorSpace=srgb?THREE.SRGBColorSpace:THREE.LinearSRGBColorSpace;textureCache.set(key,t);}return textureCache.get(key);}
function avatarMaterial(name){const r=records[name];if(!r)return new THREE.MeshStandardMaterial({color:0xd6bb9d});const m=new THREE.MeshStandardMaterial({roughness:.8});m.color.setRGB(...r.color.slice(0,3));if(r.tex)m.map=texture(r.tex,true);if(r.normalTex)m.normalMap=texture(r.normalTex,false);if(r.mode===1){m.alphaTest=r.cutoff??.5;m.alphaToCoverage=true;}else if(r.mode>=2){m.transparent=true;m.opacity=Math.max(r.color[3]??1,.1);m.depthWrite=r.mode<3;}if(name.toLowerCase().includes('tshirt'))m.side=THREE.DoubleSide;return m;}
const loadingPlayer=new Player(scene);
const playerReady=loadingPlayer.load('girl',avatarMaterial,undefined,{deferAnimations:true}).then(async()=>{player=loadingPlayer;
  const img=file=>new Promise(resolve=>{const i=new Image();i.onload=()=>resolve(i);i.onerror=()=>resolve(null);i.src='./chars/textures/'+file.replace(/\.(tga|psd|tif|png)$/i,'.webp');});
  const [scalp,strands,strandsAO]=await Promise.all([img(records.MAT_SurvGirl_Head.tex),img(records.MAT_SurvGirl_Hair.tex),img(records.MAT_SurvGirl_Hair.aoTex)]);
  player.addWardrobePart('hairCrown',harmoniseHair(player,{scalp,strands,strandsAO}));return player;
}).catch(e=>{console.error('[resort avatar]',e);return null;});
const guests=createResortGuests(scene);
const guestsReady=guests.ready.catch(e=>{console.error('[resort guests]',e);return [];});
const interactions=createResortInteractions({ctrl,input,playerReady:()=>player,getTime:()=>atmosphere.time,onLeave:()=>{leaving=true;},renderer});
// The optional gallery interaction may still be an empty work-in-progress module.
const galleryInteraction=typeof galleryInteractionModule.createGalleryInteraction==='function'
  ?galleryInteractionModule.createGalleryInteraction({scene,camera,renderer,gallery:props.gallery,input,ctrl}):null;
const controls=document.createElement('nav');controls.id='resortTimeControls';controls.setAttribute('aria-label','Ambiance du village');
controls.innerHTML='<button data-resort-time="day">☀ Jour</button><button data-resort-time="sunset">◒ Coucher</button><button data-resort-time="night">☾ Nuit</button>';document.body.appendChild(controls);
document.querySelectorAll('.brief-resort .tt-btn,[data-resort-time]').forEach(b=>b.addEventListener('click',()=>setResortTime(b.dataset.time||b.dataset.resortTime)));
setResortTime(initialTime,true);
let environmentTarget=null,disposed=false,frameId=0;
const pmrem=new THREE.PMREMGenerator(renderer);
loader.load('./data/env_equirect.png',t=>{if(disposed){t.dispose();return;}t.mapping=THREE.EquirectangularReflectionMapping;t.colorSpace=THREE.SRGBColorSpace;const env=pmrem.fromEquirectangular(t);environmentTarget=env;scene.environment=env.texture;scene.environmentIntensity=.4;t.dispose();pmrem.dispose();});
function start(){if(!started){started=true;setResortTime(atmosphere.time,true);}paused=false;overlay.style.display='none';lock();}
window.__startResort=start;document.getElementById('startBtn').addEventListener('click',start);
renderer.domElement.addEventListener('click',()=>{if(started&&!paused&&!leaving&&!galleryInteraction?.isOpen&&!galleryInteraction?.hasPrompt&&!interactions.hasPrompt)lock();});
let usedLock=false;
document.addEventListener('pointerlockchange',()=>{
  usedLock=usedLock||document.pointerLockElement!==null;
  // Dropping the lock so prompt buttons can be clicked or paintings viewed is intentional.
  if((galleryInteraction?.isOpen||galleryInteraction?.hasPrompt||interactions.hasPrompt||interactions.resting||leaving)&&document.pointerLockElement===null){
    paused=false;overlay.style.display='none';return;
  }
  if(!usedLock||leaving)return;
  paused=!input.locked;
  overlay.style.display=paused?'flex':'none';
  interactions.prompt.hidden=paused;
});
document.addEventListener('keydown',e=>{
  if(galleryInteraction?.isOpen)return;
  if(galleryInteraction?.hasPrompt&&e.code==='Escape'){galleryInteraction.dismissPrompt?.();return;}
  if(e.code==='Escape'&&started&&!input.locked){paused=true;overlay.style.display='flex';}
  if(e.code==='Enter'&&paused)start();
});
const forward=new THREE.Vector3();
function animate(){if(disposed)return;frameId=requestAnimationFrame(animate);const dt=Math.min(.033,clock.getDelta()),t=clock.elapsedTime;
  const inArtModal=galleryInteraction?.update(camera)??false;
  if(started&&!paused&&!leaving&&!inArtModal){input.updateLook(dt);rig.forward(forward,input);if(!interactions.update())ctrl.update(dt,input,input.yaw,forward);if(ctrl.pos.y < -30)ctrl.rescueTo(spawnPoint);}
  ocean.update(t);terrain.update(t);corals.update(t);pools.update(t);props.update(t,ocean);guests.update(dt,t,camera.position);
  if(player){player.setOutfit({hat:false,backpack:false,pants:false,shoes:false,longSleeves:false,swim:true});player.update({dt,mode:ctrl.mode,pos:ctrl.pos,vel:ctrl.vel,webOn:false,anchor:ctrl.anchor,posture:interactions.resting?'lie':undefined,facingYaw:interactions.resting?layout.HAMMOCK.yaw:undefined,elapsedTime:t});}
  if(player)player.group.rotation.x=interactions.resting?props.hammock.rotation.x:0;
  rig.update(dt,input,ctrl);atmosphere.update(dt,ctrl.pos);vegetation.update(camera.position,dt);architecture.update(camera.position);batch.update(camera.position);
  document.getElementById('mode').textContent=ctrl.mode;document.getElementById('speed').textContent=Math.round(ctrl.vel.length()*3.6);document.getElementById('height').textContent=ctrl.pos.y.toFixed(1);
  renderer.render(scene,camera);input.endFrame();
}
function resize(){camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);}window.addEventListener('resize',resize);
function dispose(){
  if(disposed)return;disposed=true;cancelAnimationFrame(frameId);window.removeEventListener('resize',resize);
  props.gallery.dispose();
  galleryInteraction?.dispose();
  const geometries=new Set(),mats=new Set(),textures=new Set();
  scene.traverse(o=>{if(o.geometry)geometries.add(o.geometry);for(const m of (Array.isArray(o.material)?o.material:[o.material]))if(m){mats.add(m);for(const t of Object.values(m))if(t?.isTexture)textures.add(t);}});
  textures.forEach(t=>t.dispose());geometries.forEach(g=>g.dispose());mats.forEach(m=>m.dispose());environmentTarget?.dispose();renderer.dispose();
}
window.addEventListener('pagehide',event=>{if(!event.persisted)dispose();});
window.__resort={THREE,scene,camera,renderer,ctrl,input,rig,collision,batch,bw:collision.bw,world:collision.world,layout,terrainHeight:layout.terrainHeight,waterProbe,ocean,terrain,backdrop,architecture,boardwalks,pools,props,vegetation,corals,atmosphere,interactions,galleryInteraction,spawnPoint,setResortTime,playerReady,galleryReady:props.gallery.ready,guests,guestsReady,dispose,get player(){return player;},get time(){return atmosphere.time;}};
window.__villa=window.__resort;
if(params.get('arrival')==='jungle'||window.__startRequested)start();
animate();
