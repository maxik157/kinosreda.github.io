import {supBoardDistance} from './beer-room-sup-physics.mjs';
// World-space movement follows the same YXZ convention as the camera.
export function viewBasis(yaw) {
  return { forward: { x: -Math.sin(yaw), z: -Math.cos(yaw) }, right: { x: Math.cos(yaw), z: -Math.sin(yaw) } };
}
export function bodyPresence(state,position){
 const seat=state.seated;return {x:seat?.seatPosition.x??position.x,y:state.feetY,z:seat?.seatPosition.z??position.z,yaw:seat?(state.seatYaw??seat.yaw??state.yaw):state.yaw};
}
export function overlaps(x, z, radius, box) {
  const dx = x - Math.max(box.minX, Math.min(box.maxX, x));
  const dz = z - Math.max(box.minZ, Math.min(box.maxZ, z));
  return dx * dx + dz * dz < radius * radius - 1e-9;
}
export function colliderBlocks(b,x,z,radius,feetY,height){
 return !b.disabled&&x>=b.minX-radius&&x<=b.maxX+radius&&z>=b.minZ-radius&&z<=b.maxZ+radius&&(b.maxY===undefined||(feetY<b.maxY-.012&&feetY+height>(b.minY??0)+.02))&&(b.overlaps?b.overlaps(x,z,radius,feetY,height):overlaps(x,z,radius,b));
}
export function moveWithCollisions(position, dx, dz, colliders, radius = .24, feetY=0,bodyHeight=1.64,world=null) {
 const bounds=world?.bounds||{minX:-9.64,maxX:9.64,minZ:-7.95,maxZ:7.95};
 const reach=Math.hypot(dx,dz)+2.5;colliders=colliders.filter(b=>!b.disabled&&position.x+reach>=b.minX&&position.x-reach<=b.maxX&&position.z+reach>=b.minZ&&position.z-reach<=b.maxZ);
 const valid=(x,z)=>x>=bounds.minX&&x<=bounds.maxX&&z>=bounds.minZ&&z<=bounds.maxZ&&(!world?.canWalk||world.canWalk(x,z));
 const blocked=(x,z)=>!valid(x,z)||colliders.some(b=>colliderBlocks(b,x,z,radius,feetY,bodyHeight));
 // Landing beside a rotated/scaled object or a world edit can place the capsule
 // inside a solid. Find the nearest free position, rather than blocking every
 // subsequent input forever. Run the search only when penetration exists.
 if(blocked(position.x,position.z)){
  const candidates=[],x=position.x,z=position.z;
  for(const b of colliders)if(colliderBlocks(b,x,z,radius,feetY,bodyHeight)){
   for(const px of [b.minX-radius-.005,b.maxX+radius+.005])candidates.push({x:px,z});
   for(const pz of [b.minZ-radius-.005,b.maxZ+radius+.005])candidates.push({x,z:pz});
  }
  for(let r=.08;r<=2.01;r+=.08)for(let i=0;i<24;i++)candidates.push({x:x+Math.cos(i*Math.PI/12)*r,z:z+Math.sin(i*Math.PI/12)*r});
  candidates.sort((a,b)=>(a.x-x)**2+(a.z-z)**2-((b.x-x)**2+(b.z-z)**2));
  const free=candidates.find(p=>Math.hypot(p.x-x,p.z-z)<=2.1&&!blocked(p.x,p.z));
  if(free){position.x=free.x;position.z=free.z;}
 }
 const steps=Math.max(1,Math.ceil(Math.hypot(dx,dz)/.045));
 for(let i=0;i<steps;i++){
  if(!blocked(position.x+dx/steps,position.z))position.x+=dx/steps;
  if(!blocked(position.x,position.z+dz/steps))position.z+=dz/steps;
 }
 return !blocked(position.x,position.z);
}
const keyMap = { KeyW:'forward', ArrowUp:'forward', KeyS:'back', ArrowDown:'back', KeyA:'left', ArrowLeft:'left', KeyD:'right', ArrowRight:'right', ShiftLeft:'run', ShiftRight:'run', ControlLeft:'crouch', ControlRight:'crouch', KeyC:'crouch' };
const deadzone = v => Math.abs(v) < .16 ? 0 : Math.sign(v) * (Math.abs(v) - .16) / .84;
export function createRoomControls({ camera, canvas, colliders, surfaces=[], onInteract, onPointerInteract, onEscape, onSecondary, onSeat, onMode, movement={}, freeLook=false, fps=false }) {
  const speeds={walk:3.5,run:6.8,crouch:1.3,...movement};
  const keys = new Set();
  const state = { enabled:false, yaw:0, pitch:0, velocity:{x:0,z:0}, speed:speeds.walk, eyeY:1.64, feetY:0,verticalVelocity:0, grounded:true, crouched:false, seated:null,seatYaw:0,seatHeight:.5,toilet:null,sup:null,swimming:false,waterBlend:0,distance:0, inputMode:'keyboard' };
  const touch = { x:0, y:0 }, wheel = { x:0, y:0 };
  let drag = null, jumpHeld = false, interactHeld = false;
  function mode(value) { if(state.inputMode!==value){state.inputMode=value;onMode?.(value);} }
  function look(dx, dy, sensitivity=.0027) { state.yaw -= dx*sensitivity; state.pitch=Math.max(-1.42,Math.min(1.42,state.pitch-dy*sensitivity)); }
  function clear() { keys.clear();touch.x=touch.y=wheel.x=wheel.y=0;state.velocity.x=state.velocity.z=0;drag=null; }
  function pause(){clear();state.enabled=false;canvas.style.cursor='';}
  async function lock(){try{state.enabled=true;canvas.style.cursor='none';canvas.focus();await canvas.requestPointerLock?.();return document.pointerLockElement===canvas;}catch{pause();return false;}}
  function stand(){if(state.toilet){api.onToiletExit?.();return true;}if(state.sup){const board=state.sup;api.world?.sup?.release(board);state.sup=null;state.deckSupport=null;camera.position.x=board.position.x+Math.cos(board.rotation.y)*.95;camera.position.z=board.position.z-Math.sin(board.rotation.y)*.95;state.feetY=board.position.y+.12;state.grounded=false;state.verticalVelocity=0;clear();return true;}if(!state.seated)return false;const exit=state.seated.exitPosition;camera.position.x=exit.x;camera.position.z=exit.z;state.seated=null;state.feetY=api.world?.ground(camera.position.x,camera.position.z)||0;state.grounded=false;state.verticalVelocity=0;clear();return true;}
  function mountSup(board,confirmed=false){if(!board||!confirmed&&supBoardDistance(camera.position.x,camera.position.z,board.userData.state)>1.8)return false;if(!confirmed)return api.world?.sup?.requestMount(board)||false;if(state.sup&&state.sup!==board)stand();clear();state.seated=null;state.deckSupport=null;state.sup=board;state.swimming=false;state.verticalVelocity=0;state.grounded=true;state.yaw=board.rotation.y;state.supYaw=board.rotation.y;state.pitch=-.28;api.world.sup.current=board;return true;}
  function sit(surface){if(surface?.disabled||!surface?.seatPosition||camera.position.distanceTo(surface.seatPosition)>2.4)return false;clear();state.seated=surface;state.crouched=false;state.seatYaw=surface.yaw??state.yaw;state.seatHeight=Math.max(.1,surface.topY-(api.world?.ground(surface.seatPosition.x,surface.seatPosition.z)??0));state.feetY=surface.topY;state.grounded=true;if(surface.yaw!==undefined)state.yaw=surface.yaw;state.pitch=surface.pitch??0;return true;}
  function jump(){if(state.toilet){stand();return;}if(state.sup){stand();state.verticalVelocity=3.5;return;}if(state.seated){stand();return;}if(state.enabled&&(state.grounded||state.swimming)&&!state.crouched){state.verticalVelocity=state.swimming?4.8:5.25;state.swimming=false;state.grounded=false;state.deckSupport=null;}}
  addEventListener('keydown', e=>{
    if(!state.enabled||e.target.closest?.('input,textarea,select'))return;
    if(keyMap[e.code]){keys.add(e.code);e.preventDefault();mode('keyboard');}
    if(e.code==='Space'){e.preventDefault();if(!e.repeat)jump();}
    if(e.code==='KeyE'&&!e.repeat){e.preventDefault();onInteract();}
    if(e.code==='KeyR'&&!e.repeat){e.preventDefault();onSecondary?.();}
    if(e.code==='KeyF'&&!e.repeat){e.preventDefault();if(!stand())onSeat?.();}
    if(e.code==='Escape'){if(fps)pause();else clear();document.exitPointerLock?.();onEscape?.();}
  });
  addEventListener('keyup', e=>keys.delete(e.code));
  addEventListener('blur',clear);document.addEventListener('visibilitychange',()=>{if(document.hidden)clear();});
  document.addEventListener('pointerlockchange',()=>{clear();state.pointerLocked=document.pointerLockElement===canvas;if(fps&&!state.pointerLocked)pause();});
  canvas.addEventListener('contextmenu',e=>e.preventDefault());
  canvas.addEventListener('pointerdown',e=>{
    if(fps&&e.pointerType!=='touch'&&e.button===0&&document.pointerLockElement!==canvas){mode('pointer');lock();return;}
    if(!state.enabled)return;
    if(document.pointerLockElement===canvas){if(e.button===0)onInteract();return;}
    if(drag)return;
    mode(e.pointerType==='touch'?'touch':'pointer');
    drag={id:e.pointerId,startX:e.clientX,startY:e.clientY,x:e.clientX,y:e.clientY,moved:false,button:e.button};
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove',e=>{
    if(!state.enabled)return;
    if(document.pointerLockElement===canvas){look(e.movementX,e.movementY,.0022);return;}
    if(fps&&e.pointerType!=='touch')return;
    if(freeLook&&e.pointerType!=='touch'){look(e.movementX,e.movementY,.0022);if(drag&&Math.hypot(e.clientX-drag.startX,e.clientY-drag.startY)>5)drag.moved=true;return;}
    if(!drag||drag.id!==e.pointerId)return;
    if(Math.hypot(e.clientX-drag.startX,e.clientY-drag.startY)>5)drag.moved=true;
    if(drag.moved)look(e.clientX-drag.x,e.clientY-drag.y,e.pointerType==='touch'?.004:.003);
    drag.x=e.clientX;drag.y=e.clientY;
  });
  canvas.addEventListener('pointerup',e=>{
    if(!drag||drag.id!==e.pointerId)return;
    const tap=!drag.moved&&drag.button===0;drag=null;
    if(tap){if(freeLook&&e.pointerType!=='touch')onInteract();else onPointerInteract(e.clientX,e.clientY);}
  });
  canvas.addEventListener('pointercancel',()=>drag=null);
  canvas.addEventListener('lostpointercapture',()=>drag=null);
  canvas.addEventListener('wheel',e=>{
    if(!state.enabled||e.ctrlKey)return;e.preventDefault();
    mode('trackpad');const scale=e.deltaMode===1?16:e.deltaMode===2?canvas.clientHeight:1;
    const dx=Math.max(-120,Math.min(120,e.deltaX*scale)),dy=Math.max(-120,Math.min(120,e.deltaY*scale));
    if(e.shiftKey){look(dx||dy,dx?dy:0,.003);return;}
    wheel.x=Math.max(-1,Math.min(1,wheel.x+dx*.004));wheel.y=Math.max(-1,Math.min(1,wheel.y+dy*.004));
  },{passive:false});
  function update(dt){
    if(!state.enabled&&!state.toilet){if(state.sup)api.world?.sup?.drive(state.sup,0,0,true);return;}dt=Math.min(dt,.05);if(state.movementLocked&&!state.sup&&!state.toilet){state.velocity.x=state.velocity.z=0;return;}
    if(state.toilet){const pose=state.toilet;state.velocity.x=state.velocity.z=0;state.feetY=pose.position.y;state.grounded=true;camera.position.x+=(pose.position.x-Math.sin(pose.yaw)*.20-camera.position.x)*(1-Math.exp(-dt*13));camera.position.z+=(pose.position.z-Math.cos(pose.yaw)*.20-camera.position.z)*(1-Math.exp(-dt*13));camera.position.y+=(pose.position.y+pose.eye-camera.position.y)*(1-Math.exp(-dt*13));camera.rotation.set(state.pitch,state.yaw,0,'YXZ');return;}
    const actions=new Set([...keys].map(k=>keyMap[k]));
    let x=Number(actions.has('right'))-Number(actions.has('left'))+touch.x;
    let y=Number(actions.has('forward'))-Number(actions.has('back'))-touch.y;
    const pad=[...(navigator.getGamepads?.()||[])].find(p=>p?.connected);
    if(pad){const px=deadzone(pad.axes[0]||0),py=deadzone(pad.axes[1]||0),lx=deadzone(pad.axes[2]||0),ly=deadzone(pad.axes[3]||0);if(px||py||lx||ly){mode('gamepad');x+=px;y-=py;look(lx*dt*650,ly*dt*650);}if(pad.buttons[0]?.pressed&&!jumpHeld)jump();jumpHeld=!!pad.buttons[0]?.pressed;if(pad.buttons[2]?.pressed&&!interactHeld)onInteract();interactHeld=!!pad.buttons[2]?.pressed;if(pad.buttons[1]?.pressed)actions.add('crouch');if(pad.buttons[10]?.pressed)actions.add('run');}
    const length=Math.max(1,Math.hypot(x,y));x/=length;y/=length;
    if(state.sup){
      const board=state.sup,consume=1-Math.exp(-dt/.065),wx=wheel.x*consume,wy=wheel.y*consume;wheel.x-=wx;wheel.y-=wy;
      api.world?.sup?.drive(board,state.movementLocked?0:Math.max(-1,Math.min(1,y+wy*6)),state.movementLocked?0:Math.max(-1,Math.min(1,x+wx*6)),state.movementLocked||actions.has('crouch'));
      state.yaw+=Math.atan2(Math.sin(board.rotation.y-state.supYaw),Math.cos(board.rotation.y-state.supYaw));state.supYaw=board.rotation.y;
      state.feetY=board.userData.surface.topY;state.velocity.x=board.userData.velocity.x;state.velocity.z=board.userData.velocity.z;state.distance+=Math.hypot(state.velocity.x,state.velocity.z)*dt;
      const blend=1-Math.exp(-dt*18);camera.position.x+=(board.position.x-Math.sin(board.rotation.y)*.28-camera.position.x)*blend;camera.position.z+=(board.position.z-Math.cos(board.rotation.y)*.28-camera.position.z)*blend;camera.position.y+=(state.feetY+1.22-camera.position.y)*blend;camera.rotation.set(state.pitch,state.yaw,0,'YXZ');return;
    }
    if(state.seated){state.velocity.x=state.velocity.z=0;const blend=1-Math.exp(-dt*12);state.feetY=state.seated.topY;const lying=state.seated.kind==='hammock',aim=lying?state.seated.eyePosition:state.seated.seatPosition;camera.position.x+=(aim.x-camera.position.x)*blend;camera.position.z+=(aim.z-camera.position.z)*blend;const eye=lying?aim.y:state.seated.topY+.79;camera.position.y+=(eye-camera.position.y)*(1-Math.exp(-dt*12));camera.rotation.set(state.pitch,state.yaw,0,'YXZ');return;}
    state.crouched=actions.has('crouch')||(state.crouched&&colliders.some(b=>colliderBlocks(b,camera.position.x,camera.position.z,.22,state.feetY,1.64)));
    const landSpeed=state.crouched?speeds.crouch:actions.has('run')?speeds.run:state.speed;
    const speed=(landSpeed+(2.15-landSpeed)*state.waterBlend)*(api.world?.speed(camera.position.x,camera.position.z)||1);
    const basis=viewBasis(state.yaw),factor=1-Math.exp(-dt*(x||y?14:20));
    state.velocity.x+=((basis.forward.x*y+basis.right.x*x)*speed-state.velocity.x)*factor;
    state.velocity.z+=((basis.forward.z*y+basis.right.z*x)*speed-state.velocity.z)*factor;
    const consume=1-Math.exp(-dt/ .065),wx=wheel.x*consume,wy=wheel.y*consume;wheel.x-=wx;wheel.y-=wy;
    if(state.deckSupport&&state.grounded){const {board,local}=state.deckSupport;board.updateWorldMatrix(true,false);const moved=board.localToWorld(local.clone());camera.position.x=moved.x;camera.position.z=moved.z;state.feetY=moved.y;}
    const oldX=camera.position.x,oldZ=camera.position.z;
    const previousFeet=state.feetY;
    if(!state.grounded&&!state.swimming){state.verticalVelocity-=11.5*dt;state.feetY+=state.verticalVelocity*dt;
      // Sweep vertically before horizontal resolution. Catch a tabletop on the
      // descending frame and a ceiling on ascent; never step into their slab.
      for(const b of colliders){if(b.disabled||b.maxY===undefined||camera.position.x<b.minX-.22||camera.position.x>b.maxX+.22||camera.position.z<b.minZ-.22||camera.position.z>b.maxZ+.22)continue;
       const inside=b.containsXZ?b.containsXZ(camera.position.x,camera.position.z):camera.position.x>=b.minX&&camera.position.x<=b.maxX&&camera.position.z>=b.minZ&&camera.position.z<=b.maxZ;
       if(state.verticalVelocity<=0&&inside){const top=b.supportHeightAt?b.supportHeightAt(camera.position.x,camera.position.z):b.maxY;if(top!==null&&previousFeet>=top-.02&&state.feetY<=top){state.feetY=top;state.verticalVelocity=0;state.grounded=true;}}
       const height=state.crouched?1.08:1.64,bottom=b.minY??0;
       if(state.verticalVelocity>0&&previousFeet+height<=bottom+.02&&state.feetY+height>bottom&&colliderBlocks(b,camera.position.x,camera.position.z,.22,state.feetY,height)){state.feetY=bottom-height-.025;state.verticalVelocity=0;}
      }}
    const free=moveWithCollisions(camera.position,state.velocity.x*dt+basis.forward.x*wy+basis.right.x*wx,state.velocity.z*dt+basis.forward.z*wy+basis.right.z*wx,colliders,.22,state.feetY,state.crouched?1.08:1.64,api.world);
    if(!free&&state.lastSafe){const safe=state.lastSafe,bounds=api.world?.bounds||{minX:-9.64,maxX:9.64,minZ:-7.95,maxZ:7.95};if(safe.x>=bounds.minX&&safe.x<=bounds.maxX&&safe.z>=bounds.minZ&&safe.z<=bounds.maxZ&&!colliders.some(b=>colliderBlocks(b,safe.x,safe.z,.22,safe.y,state.crouched?1.08:1.64))){camera.position.x=safe.x;camera.position.z=safe.z;state.feetY=safe.y;state.verticalVelocity=0;state.grounded=true;}}
    state.distance+=Math.hypot(camera.position.x-oldX,camera.position.z-oldZ);
    let support=api.world?.ground(camera.position.x,camera.position.z)||0;
    for(const b of colliders)if(!b.disabled&&b.maxY!==undefined&&camera.position.x>b.minX-.10&&camera.position.x<b.maxX+.10&&camera.position.z>b.minZ-.10&&camera.position.z<b.maxZ+.10){const y=b.supportHeightAt?b.supportHeightAt(camera.position.x,camera.position.z):b.maxY;if(y!==null&&y<=Math.max(previousFeet,state.feetY)+.035)support=Math.max(support,y);}
    let deck=null;for(const s of surfaces){if(s.disabled)continue;if(s.kind==='sup-board'){const h=s.heightAt(camera.position.x,camera.position.z);if(h!==null&&h>=support&&h<=Math.max(previousFeet,state.feetY)+.09&&state.verticalVelocity<=0){support=h;deck=s;}continue;}const b=s.bounds;if(!b||s.topY>Math.max(previousFeet,state.feetY)+(state.grounded&&['deck','floor'].includes(s.kind)?.22:.035))continue;if(camera.position.x>b.min.x-.12&&camera.position.x<b.max.x+.12&&camera.position.z>b.min.z-.12&&camera.position.z<b.max.z+.12){const y=s.supportHeightAt?s.supportHeightAt(camera.position.x,camera.position.z):s.topY;if(y!==null)support=Math.max(support,y);}}
    const water=api.world?.water?.(camera.position.x,camera.position.z);
    const depth=water==null?0:Math.max(0,water-support),wet=deck?0:Math.max(0,Math.min(1,(depth-.25)/.95));
    state.waterBlend+=(wet-state.waterBlend)*(1-Math.exp(-dt*5));
    state.swimming=water!=null&&depth>1.0&&state.feetY<water-.32&&state.verticalVelocity<=0&&!deck;
    if(state.swimming){const target=water-.90;state.feetY+=(target-state.feetY)*(1-Math.exp(-dt*5));state.feetY=Math.max(support,state.feetY);state.verticalVelocity=0;state.grounded=false;state.deckSupport=null;}
    else if(state.verticalVelocity<=0&&state.feetY<=support+.09){state.feetY=support;state.verticalVelocity=0;state.grounded=true;}
    else if(state.grounded&&state.feetY>support+.04){state.grounded=false;}
    if(state.grounded&&support-state.feetY<=.22&&support>=state.feetY-.22)state.feetY=support;
    if(state.grounded&&!colliders.some(b=>colliderBlocks(b,camera.position.x,camera.position.z,.22,state.feetY,state.crouched?1.08:1.64)))state.lastSafe={x:camera.position.x,y:state.feetY,z:camera.position.z};
    state.deckSupport=deck&&state.grounded?{board:deck.board,local:deck.board.worldToLocal(camera.position.clone().setY(state.feetY))}:null;
    const eye=state.feetY+(state.crouched&&!state.swimming?1.08:1.64-.40*state.waterBlend);state.eyeY=eye;
    camera.position.y+=(eye-camera.position.y)*(1-Math.exp(-dt*18));
    camera.rotation.set(state.pitch,state.yaw,0,'YXZ');
  }
  function bindJoystick(pad,knob){
    let id=null,rect;
    const update=e=>{const dx=e.clientX-(rect.left+rect.width/2),dy=e.clientY-(rect.top+rect.height/2),max=rect.width*.32,k=Math.max(1,Math.hypot(dx,dy)/max);touch.x=dx/k/max;touch.y=dy/k/max;knob.style.transform=`translate(${dx/k}px,${dy/k}px)`;};
    pad.addEventListener('pointerdown',e=>{e.preventDefault();id=e.pointerId;rect=pad.getBoundingClientRect();pad.setPointerCapture(id);mode('touch');update(e);});
    pad.addEventListener('pointermove',e=>{if(e.pointerId===id)update(e);});
    const end=()=>{id=null;touch.x=touch.y=0;knob.style.transform='';};['pointerup','pointercancel','lostpointercapture'].forEach(event=>pad.addEventListener(event,end));
  }
  function enterToilet(pose){if(state.sup)stand();clear();state.seated=null;state.swimming=false;state.deckSupport=null;state.verticalVelocity=0;state.toilet=pose;state.yaw=pose.yaw;state.pitch=pose.pitch;}
  function leaveToilet(exit){state.toilet=null;clear();camera.position.x=exit.x;camera.position.z=exit.z;state.feetY=api.world?.ground(exit.x,exit.z)||0;state.verticalVelocity=0;state.grounded=true;camera.position.y=state.feetY+1.64;}
  const api={enterToilet,leaveToilet,state,speeds,update,clear,jump,keys,touch,bindJoystick,pause,lock,sit,stand,mountSup,enable(){state.enabled=true;if(fps)canvas.style.cursor='none';canvas.focus();},setView(yaw,pitch=0){state.yaw=yaw;state.pitch=pitch;camera.rotation.set(pitch,yaw,0,'YXZ');}};return api;
}
