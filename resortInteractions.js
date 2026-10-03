import { HAMMOCK,FOREST_GATE,terrainHeight } from './resortLayout.js';
import { createIslandTravel } from './islandTravel.js';

export function createResortInteractions({ctrl,input,playerReady,getTime,onLeave,renderer}) {
  const prompt=document.createElement('button');prompt.id='resortAction';prompt.className='resort-action';prompt.hidden=true;document.body.appendChild(prompt);
  const travel=createIslandTravel({gate:FOREST_GATE,map:'jungle',arrival:'resort',getTime,onLeave});
  let resting=false,action=null,declined=false,hasPrompt=false;
  const nearHammock=()=>ctrl.mode==='ground'&&Math.hypot(ctrl.pos.x-HAMMOCK.returnX,ctrl.pos.z-HAMMOCK.returnZ)<2.5;

  function stand(){
    resting=false;ctrl.mode='ground';
    ctrl.pos.set(HAMMOCK.returnX,terrainHeight(HAMMOCK.returnX,HAMMOCK.returnZ)+.015,HAMMOCK.returnZ);
    ctrl.prevY=ctrl.pos.y;ctrl.vel.set(0,0,0);declined=true;prompt.hidden=true;hasPrompt=false;
    try{renderer?.domElement?.requestPointerLock?.();}catch(_){}
  }

  function lie(){
    if(!playerReady())return;resting=true;ctrl.mode='lie';
    // The lying pose extends back from the avatar's feet. Centre its body in
    // the hammock and clear the fabric as it rises towards the suspension ropes.
    ctrl.pos.set(HAMMOCK.x+Math.sin(HAMMOCK.yaw)*.85,HAMMOCK.y+.12,HAMMOCK.z+Math.cos(HAMMOCK.yaw)*.85);
    ctrl.prevY=ctrl.pos.y;ctrl.vel.set(0,0,0);ctrl.webOn=false;
    prompt.textContent='E · Se relever';prompt.hidden=false;hasPrompt=true;
    if(document.pointerLockElement)document.exitPointerLock?.();
  }

  function activate(){if(resting)stand();else if(action==='travel')travel.go();else if(action==='hammock')lie();}
  prompt.addEventListener('click',activate);

  function update(){
    if(travel.leaving){prompt.hidden=true;hasPrompt=false;return true;}
    if(resting){
      if(['KeyW','KeyA','KeyS','KeyD','Space','KeyE'].some(k=>input.pressed(k)))stand();
      return true;
    }
    if(!nearHammock())declined=false;
    const prevAction=action;
    action=travel.near(ctrl.pos)?'travel':nearHammock()&&!declined?'hammock':null;
    hasPrompt=!!action;
    prompt.hidden=!action;
    prompt.textContent=action==='travel'?'E · Retour à la promenade tropicale':'E · S’allonger dans le hamac';
    if(action&&!prevAction){
      if(document.pointerLockElement)document.exitPointerLock?.();
    }else if(!action&&prevAction&&!resting){
      try{renderer?.domElement?.requestPointerLock?.();}catch(_){}
    }
    if(action&&input.pressed('KeyE')){activate();return true;}
    return false;
  }

  return {update,lie,stand,travel,prompt,get resting(){return resting;},get hasPrompt(){return hasPrompt;}};
}
