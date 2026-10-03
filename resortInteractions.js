import { HAMMOCK,FOREST_GATE,terrainHeight,PLAYER_BUNGALOW,toLocal } from './resortLayout.js';
import { PLAYER_LOUNGER,PLAYER_FURNITURE } from './resortFurniture.js';
import { createIslandTravel } from './islandTravel.js';

const WAKE_KEYS=['KeyW','KeyA','KeyS','KeyD','KeyZ','KeyQ','Space','KeyE'];
export function createResortInteractions({ctrl,input,playerReady,getTime,onLeave,renderer}) {
  function button(id){
    const b=document.createElement('button');b.id=id;b.className='resort-action';b.hidden=true;document.body.appendChild(b);return b;
  }
  const prompt=button('resortAction'),liePrompt=button('resortLieAction');
  const travel=createIslandTravel({gate:FOREST_GATE,map:'jungle',arrival:'resort',getTime,onLeave});
  const hammock={yaw:HAMMOCK.yaw,
    lie:{x:HAMMOCK.x+Math.sin(HAMMOCK.yaw)*.85,y:HAMMOCK.y+.12,z:HAMMOCK.z+Math.cos(HAMMOCK.yaw)*.85},
    exit:{x:HAMMOCK.returnX,y:terrainHeight(HAMMOCK.returnX,HAMMOCK.returnZ)+.015,z:HAMMOCK.returnZ}};
  const targets={hammock,lounger:PLAYER_LOUNGER,...PLAYER_FURNITURE};
  const states={
    'hammock-lie':{target:'hammock',posture:'lie'},
    'lounger-sit':{target:'lounger',posture:'sit'},
    'lounger-lie':{target:'lounger',posture:'lie'},
    'bed-lie':{target:'bed',posture:'lie'},
    'bench-lie':{target:'bench',posture:'lie'},
  };
  let restState=null,action=null,declined=null,hasPrompt=false;
  const pose=()=>states[restState];
  const restTarget=()=>targets[pose()?.target];
  const nearHammock=()=>ctrl.mode==='ground'&&Math.abs(ctrl.pos.y-hammock.exit.y)<.6&&Math.hypot(ctrl.pos.x-HAMMOCK.returnX,ctrl.pos.z-HAMMOCK.returnZ)<2.5;
  const nearLounger=()=>ctrl.mode==='ground'&&Math.abs(ctrl.pos.y-PLAYER_LOUNGER.floorY)<.45&&Math.hypot(ctrl.pos.x-PLAYER_LOUNGER.approach.x,ctrl.pos.z-PLAYER_LOUNGER.approach.z)<1.15;
  function nearFurniture(target){
    if(ctrl.mode!=='ground'||Math.abs(ctrl.pos.y-target.floorY)>.25)return false;
    const p=toLocal(PLAYER_BUNGALOW,ctrl.pos.x,ctrl.pos.z),z=target.zone;
    return p.x>z.x0&&p.x<z.x1&&p.z>z.z0&&p.z<z.z1&&
      Math.hypot(ctrl.pos.x-target.approach.x,ctrl.pos.z-target.approach.z)<target.approachRadius;
  }
  const near=key=>key==='hammock'?nearHammock():key==='lounger'?nearLounger():nearFurniture(targets[key]);
  function hide(){prompt.hidden=true;liePrompt.hidden=true;hasPrompt=false;}
  function lock(){try{renderer?.domElement?.requestPointerLock?.()?.catch?.(()=>{});}catch(_){}}
  function show(){
    hasPrompt=!!(restState||action);prompt.hidden=!hasPrompt;
    liePrompt.hidden=!!restState||action!=='lounger';
    const labels={travel:'E · Retour à la promenade tropicale',lounger:'E · S’asseoir sur le transat',
      bed:'E · S’allonger dans le lit',bench:'E · S’allonger sur la banquette',hammock:'E · S’allonger dans le hamac'};
    prompt.textContent=restState?'E · Se relever':labels[action]??'';
    liePrompt.textContent='R · S’allonger sur le transat';
    prompt.setAttribute('aria-label',prompt.textContent);liePrompt.setAttribute('aria-label',liePrompt.textContent);
  }
  function stand(){
    if(!restState)return;
    const p=restTarget().exit;
    declined=pose().target;restState=null;action=null;ctrl.mode='ground';
    ctrl.pos.set(p.x,p.y,p.z);ctrl.prevY=p.y;ctrl.vel.set(0,0,0);ctrl.furnitureCamera=null;
    const player=playerReady();if(player){player.group.rotation.order='XYZ';player.group.rotation.x=0;player.group.rotation.z=0;}
    hide();lock();
  }
  function hold(){
    const p=restTarget()[pose().posture];
    ctrl.mode=pose().posture;ctrl.pos.set(p.x,p.y,p.z);ctrl.prevY=p.y;ctrl.vel.set(0,0,0);ctrl.webOn=false;
  }
  function rest(state){
    if(!playerReady())return;
    restState=state;hold();
    const target=restTarget();ctrl.furnitureCamera=target.camera??null;
    if(target.camera){
      input.yaw=target.camera.yaw??target.yaw;input.pitch=target.camera.pitch??-.18;
    }
    show();
    if(document.pointerLockElement)document.exitPointerLock?.();
  }
  function lie(){rest('hammock-lie');} // Existing hammock API.
  function activate(){
    if(restState)stand();else if(action==='travel')travel.go();
    else if(action==='lounger')rest('lounger-sit');else if(action)rest(`${action}-lie`);
  }
  prompt.addEventListener('click',activate);
  liePrompt.addEventListener('click',()=>{if(!restState&&action==='lounger')rest('lounger-lie');});
  function update(){
    if(travel.leaving){hide();return true;}
    if(restState){if(WAKE_KEYS.some(k=>input.pressed(k)))stand();else{hold();show();}return true;}
    if(declined&&!near(declined))declined=null;
    const prevAction=action;
    const furniture=['bed','bench'].filter(key=>key!==declined&&near(key)).sort((a,b)=>
      Math.hypot(ctrl.pos.x-targets[a].approach.x,ctrl.pos.z-targets[a].approach.z)-
      Math.hypot(ctrl.pos.x-targets[b].approach.x,ctrl.pos.z-targets[b].approach.z));
    action=travel.near(ctrl.pos)?'travel':furniture[0]??(nearLounger()&&declined!=='lounger'?'lounger':nearHammock()&&declined!=='hammock'?'hammock':null);
    show();
    if(action&&!prevAction){if(document.pointerLockElement)document.exitPointerLock?.();}
    else if(!action&&prevAction)lock();
    if(action&&input.pressed('KeyE')){activate();return true;}
    if(action==='lounger'&&input.pressed('KeyR')){rest('lounger-lie');return true;}
    return false;
  }
  return {update,lie,stand,travel,prompt,liePrompt,lounger:PLAYER_LOUNGER,furniture:PLAYER_FURNITURE,
    hide,get restState(){return restState;},get posture(){return pose()?.posture;},
    get restTarget(){return restTarget();},get facingYaw(){return restTarget()?.yaw;},
    get resting(){return restState!==null;},get hasPrompt(){return hasPrompt;}};
}
