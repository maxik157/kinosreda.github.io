import * as THREE from './three.module.js';
import {AVATAR_MODELS} from './beer-room-avatar-catalog.mjs';
import {createHumanAvatar,updateHumanAvatar,disposeHumanAvatar} from './beer-room-avatar.mjs';
export function createAvatarPicker({online,controls}){
  const dialog=document.getElementById('avatarDialog'),choices=document.getElementById('avatarChoices'),host=document.getElementById('avatarPreview');
  const scene=new THREE.Scene();scene.background=new THREE.Color(0x192321);
  scene.add(new THREE.HemisphereLight(0xe7f1ff,0x5c4b35,2.3));const key=new THREE.DirectionalLight(0xffdfbb,3);key.position.set(-2,4,-3);scene.add(key);
  const camera=new THREE.PerspectiveCamera(32,1,.05,20);camera.position.set(0,1.05,-3.6);camera.lookAt(0,.98,0);
  let renderer=null,avatar=null,selection=online.avatar.model,time=0;
  const select=id=>{selection=id;for(const button of choices.children)button.setAttribute('aria-checked',String(button.dataset.model===id));if(avatar)disposeHumanAvatar(avatar);avatar=createHumanAvatar({model:id});host.setAttribute('aria-busy','true');scene.add(avatar);};
  for(const model of AVATAR_MODELS){const button=document.createElement('button');button.type='button';button.dataset.model=model.id;button.setAttribute('role','radio');button.textContent=model.name;button.addEventListener('click',()=>select(model.id));choices.append(button);}
  const open=()=>{controls.pause();document.exitPointerLock?.();dialog.showModal();if(!renderer){renderer=new THREE.WebGLRenderer({antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;host.append(renderer.domElement);}select(online.avatar.model);};
  document.getElementById('chooseAvatar').addEventListener('click',open);
  document.getElementById('saveAvatar').addEventListener('click',()=>{online.setAvatar({model:selection});dialog.close();});
  document.getElementById('closeAvatar').addEventListener('click',()=>dialog.close());
  dialog.addEventListener('click',e=>{if(e.target===dialog)dialog.close();});
  dialog.addEventListener('close',()=>{if(avatar)disposeHumanAvatar(avatar);avatar=null;controls.enable();});
  return {update(dt){if(!dialog.open||!renderer||!avatar)return;host.setAttribute('aria-busy',String(!avatar.userData.hydrated));time+=dt;const w=host.clientWidth,h=host.clientHeight;renderer.setSize(w,h,false);camera.aspect=w/Math.max(1,h);camera.updateProjectionMatrix();avatar.rotation.y=Math.sin(time*.5)*.28;updateHumanAvatar(avatar,{kind:'idle'},dt);renderer.render(scene,camera);}};
}
