import { HAMMOCK,FOREST_GATE,terrainHeight } from './resortLayout.js';
import { PLAYER_LOUNGER } from './resortFurniture.js';
import { createIslandTravel } from './islandTravel.js';

const WAKE_KEYS=['KeyW','KeyA','KeyS','KeyD','KeyZ','KeyQ','Space','KeyE'];
export function createResortInteractions({ctrl,input,playerReady,getTime,onLeave,renderer}) {
  function button(id){
    const b=document.createElement('button');b.id=id;b.className='resort-action';b.hidden=true;document.body.appendChild(b);return b;
  }
  const prompt=button('resortAction'),liePrompt=button('resortLieAction');
  const travel=createIslandTravel({gate:FOREST_GATE,map:'jungle',arrival:'resort',getTime,onLeave});
  let restState=null,action=null,declined=null,hasPrompt=false;
  const nearHammock=()=>ctrl.mode==='ground'&&Math.abs(ctrl.pos.y-terrainHeight(HAMMOCK.returnX,HAMMOCK.returnZ))<.6&&Math.hypot(ctrl.pos.x-HAMMOCK.returnX,ctrl.pos.z-HAMMOCK.returnZ)<2.5;
  const nearLounger=()=>ctrl.mode==='ground'&&Math.abs(ctrl.pos.y-PLAYER_LOUNGER.floorY)<.45&&Math.hypot(ctrl.pos.x-PLAYER_LOUNGER.approach.x,ctrl.pos.z-PLAYER_LOUNGER.approach.z)<1.15;
  function hide(){prompt.hidden=true;liePrompt.hidden=true;hasPrompt=false;}
  function lock(){try{renderer?.domElement?.requestPointerLock?.()?.catch?.(()=>{});}catch(_){}}
  function show(){
    hasPrompt=!!(restState||action);prompt.hidden=!hasPrompt;
    liePrompt.hidden=!!restState||action!=='lounger';
    prompt.textContent=restState?'E · Se relever':action==='travel'?'E · Retour à la promenade tropicale':action==='lounger'?'E · S’asseoir sur le transat':'E · S’allonger dans le hamac';
    liePrompt.textContent='R · S’allonger sur le transat';
    prompt.setAttribute('aria-label',prompt.textContent);liePrompt.setAttribute('aria-label',liePrompt.textContent);
  }
  function stand(){
    const wasLounger=restState?.startsWith('lounger');
    const p=wasLounger?PLAYER_LOUNGER.exit:{x:HAMMOCK.returnX,y:terrainHeight(HAMMOCK.returnX,HAMMOCK.returnZ)+.015,z:HAMMOCK.returnZ};
    declined=wasLounger?'lounger':'hammock';restState=null;action=null;ctrl.mode='ground';
    ctrl.pos.set(p.x,p.y,p.z);ctrl.prevY=p.y;ctrl.vel.set(0,0,0);ctrl.furnitureCamera=null;
    const player=playerReady();if(player){player.group.rotation.order='XYZ';player.group.rotation.x=0;player.group.rotation.z=0;}
    hide();lock();
  }
  function rest(state){
    if(!playerReady())return;
    restState=state;ctrl.mode=state==='lounger-sit'?'sit':'lie';
    if(state==='hammock-lie'){
      ctrl.pos.set(HAMMOCK.x+Math.sin(HAMMOCK.yaw)*.85,HAMMOCK.y+.12,HAMMOCK.z+Math.cos(HAMMOCK.yaw)*.85);
    }else{
      const p=state==='lounger-sit'?PLAYER_LOUNGER.sit:PLAYER_LOUNGER.lie;
      ctrl.pos.set(p.x,p.y,p.z);ctrl.furnitureCamera=PLAYER_LOUNGER.camera;
      // Start on the open lagoon side; arrow keys and mouse still control the orbit.
      input.yaw=PLAYER_LOUNGER.yaw;input.pitch=-.18;
    }
    ctrl.prevY=ctrl.pos.y;ctrl.vel.set(0,0,0);ctrl.webOn=false;show();
    if(document.pointerLockElement)document.exitPointerLock?.();
  }
  function lie(){rest('hammock-lie');} // Existing hammock API.
  function activate(){if(restState)stand();else if(action==='travel')travel.go();else if(action==='lounger')rest('lounger-sit');else if(action==='hammock')lie();}
  prompt.addEventListener('click',activate);
  liePrompt.addEventListener('click',()=>{if(!restState&&action==='lounger')rest('lounger-lie');});
  function update(){
    if(travel.leaving){hide();return true;}
    if(restState){if(WAKE_KEYS.some(k=>input.pressed(k)))stand();else show();return true;}
    if(declined==='hammock'&&!nearHammock()||declined==='lounger'&&!nearLounger())declined=null;
    const prevAction=action;
    action=travel.near(ctrl.pos)?'travel':nearLounger()&&declined!=='lounger'?'lounger':nearHammock()&&declined!=='hammock'?'hammock':null;
    show();
    if(action&&!prevAction){if(document.pointerLockElement)document.exitPointerLock?.();}
    else if(!action&&prevAction)lock();
    if(action&&input.pressed('KeyE')){activate();return true;}
    if(action==='lounger'&&input.pressed('KeyR')){rest('lounger-lie');return true;}
    return false;
  }
  return {update,lie,stand,travel,prompt,liePrompt,lounger:PLAYER_LOUNGER,
    hide,get restState(){return restState;},get posture(){return restState==='lounger-sit'?'sit':restState?'lie':undefined;},
    get facingYaw(){return restState?.startsWith('lounger')?PLAYER_LOUNGER.yaw:restState?HAMMOCK.yaw:undefined;},
    get resting(){return restState!==null;},get hasPrompt(){return hasPrompt;}};
}
