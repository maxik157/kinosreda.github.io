import * as THREE from './three.module.js';
import {AnatomicalGrip} from './beer-hand-rig.mjs';
import {updateGlass} from './beer-room-glass.mjs';
const smooth=t=>{t=THREE.MathUtils.clamp(t,0,1);return t*t*(3-2*t);};
const holding=new Set(['HOLDING','WALKING_WITH_DRINK','RUNNING_WITH_DRINK','POUR_READY','POUR_COMPLETE']);
export class DrinkHand {
 constructor({scene,camera,onReturned,onPlaced}){
  Object.assign(this,{scene,camera,onReturned,onPlaced});this.state='IDLE';this.time=0;this.model=null;this.source=null;this.heldKind=null;this.transition=0;this.examine=false;
  this.rig=new THREE.Group();this.rig.name='Held object and right hand';this.rig.visible=false;scene.add(this.rig);
  this.arm=new AnatomicalGrip();this.rig.add(this.arm.group);this.ready=this.arm.ready.then(()=>{this.loaded=true;return this;});
  const fill=new THREE.PointLight(0xffeadb,.18,2,2);fill.position.set(.3,-.2,-.45);camera.add(fill);
 }
 take(source){
  if(this.state!=='IDLE'||!this.loaded||!source?.userData.packageProfile)return false;
  const surface=source.children.find(o=>o.name==='Continuous package surface');if(surface){surface.geometry=source.userData.packageAsset.geometry;surface.userData.sharedShelfGeometry=false;}
  source.children.forEach(o=>{if(o.userData.packageDisk)o.visible=true;});
  this.source=source;source.userData.homeAnchor=source.userData.supAnchor||null;this.onTake?.(source);this.heldKind='beer';this.served=false;
  this.source.userData.held=true;this.source.userData.homePosition=this.source.position.clone();this.source.userData.homeQuaternion=this.source.quaternion.clone();
  this.model=source;this.model.userData.fill??=1;this.model.name='Held beer';this.model.traverse(o=>{if(o.isMesh){o.castShadow=false;o.receiveShadow=false;o.frustumCulled=false;}});this.rig.add(this.model);
  const p=source.userData.packageProfile,bottle=p.kind.includes('bottle');this.height=bottle?.30:.205;this.scale=this.height/p.modelHeight;this.model.scale.setScalar(this.scale);this.model.position.set(0,0,0);this.model.rotation.set(0,0,0);
  this.gripHeight=this.height*(bottle?.34:.43);const row=p.rows.reduce((a,b)=>Math.abs(a.y*this.scale-this.gripHeight)<Math.abs(b.y*this.scale-this.gripHeight)?a:b);this.radius=row.radius*this.scale;
  this.setGrip(p.kind);this.state='HOLD_APPEARING';this.time=0;this.transition=0;this.examine=false;this.rig.visible=true;this.update(0);return true;
 }
 setGrip(kind){this.arm.pose(this.radius,kind);this.arm.group.position.copy(this.arm.wristOffset).add(new THREE.Vector3(0,this.gripHeight,0));}
 takeGlass(glass){
  if(!this.loaded||!['IDLE','POUR_COMPLETE'].includes(this.state)||glass?.userData.action!=='glass'||glass.userData.held)return false;
  if(this.model)this.finish();
  this.source=glass;glass.userData.homeAnchor=glass.userData.supAnchor||null;this.onTake?.(glass);this.model=glass;this.heldKind='glass';this.height=glass.userData.height;this.scale=1;this.gripHeight=.105;
  this.radius=glass.userData.rBottom+(glass.userData.rTop-glass.userData.rBottom)*this.gripHeight/.20;
  glass.userData.homePosition=glass.position.clone();glass.userData.homeQuaternion=glass.quaternion.clone();glass.userData.held=true;glass.userData.physicsStarted=false;
  this.rig.add(glass);glass.position.set(0,0,0);glass.quaternion.identity();glass.traverse(o=>{if(o.isMesh)o.frustumCulled=false;});
  this.setGrip('glass');this.state='HOLD_APPEARING';this.time=0;this.transition=0;this.rig.visible=true;this.update(0);return true;
 }
 canPutGlass(){return this.heldKind==='glass'&&this.state==='GLASS_HOLDING'&&!!this.findPlacement?.();}
 canPutBeer(){return this.heldKind==='beer'&&['HOLDING','WALKING_WITH_DRINK','RUNNING_WITH_DRINK','POUR_READY','POUR_COMPLETE'].includes(this.state)&&!!this.findPlacement?.();}
 putGlass(){if(this.heldKind!=='glass'||this.state!=='GLASS_HOLDING')return false;const target=this.findPlacement?.();if(!target)return false;this.model.userData.homePosition=target.clone();this.model.userData.homeAnchor=target.supAnchor||null;this.model.userData.placed=true;this.model.userData.homeQuaternion=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),this.camera.rotation.y);this.putStart=this.rig.position.clone();this.putStartQ=this.rig.quaternion.clone();this.putQ=this.model.userData.homeQuaternion.clone();this.putReleased=false;this.state='GLASS_PLACING';this.time=0;return true;}
 putBeer(){if(!this.canPutBeer())return false;const target=this.findPlacement?.();if(!target)return false;this.model.userData.homePosition=target.clone();this.model.userData.homeAnchor=target.supAnchor||null;this.model.userData.placed=true;this.model.userData.homeQuaternion=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),this.camera.rotation.y);this.putStart=this.rig.position.clone();this.putStartQ=this.rig.quaternion.clone();this.putQ=this.model.userData.homeQuaternion.clone();this.putReleased=false;this.state='BEER_PLACING';this.time=0;return true;}
 putHeld(){return this.heldKind==='glass'?this.putGlass():this.putBeer();}
 returnToShelf(immediate=false){
  if(!this.model)return false;
  if(this.heldKind==='glass'){if(immediate){this.finish();return true;}return this.putGlass();}
  if(['POURING','HOLD_DISAPPEARING'].includes(this.state)&&!immediate)return false;
  if(immediate){this.finish();return true;}
  this.fromTransition=this.transition;this.state='HOLD_DISAPPEARING';this.time=0;this.examine=false;return true;
 }
 finish(){
  const source=this.source;if(this.model)this.resolveHome?.(this.model);
  if(this.heldKind==='glass'&&this.model){const d=this.model.userData;this.scene.add(this.model);this.model.position.copy(d.homePosition);this.model.quaternion.copy(d.homeQuaternion);d.held=false;this.model.traverse(o=>o.layers.set(0));updateGlass(this.model,0);}
  else if(this.model){const d=this.model.userData;this.scene.add(this.model);if(d.homePosition)this.model.position.copy(d.homePosition);if(d.homeQuaternion)this.model.quaternion.copy(d.homeQuaternion);d.held=false;this.model.traverse(o=>o.layers.set(0));}
  this.model=null;this.source=null;this.heldKind=null;this.state='IDLE';this.rig.visible=false;this.transition=0;this.onReturned?.(source);
 }
 canPour(){return this.heldKind==='beer'&&holding.has(this.state)&&this.model.userData.fill>.002;}
 canDrink(){return !!this.model&&this.model.userData.fill>.002&&(this.heldKind==='glass'&&this.state==='GLASS_HOLDING'||this.heldKind==='beer'&&holding.has(this.state));}
 beginPour(glass){
  if(!this.canPour()||this.served||glass.userData.held||glass.userData.fill>.03)return false;
  this.pourStartFill=this.model.userData.fill;this.state='POURING';this.time=0;this.glass=glass;this.pourStart=this.rig.position.clone();this.pourStartQ=this.rig.quaternion.clone();this.examine=false;
  // Pronate forward over the glass. A sideways half-turn exposes the finger
  // backs and turns the wrist upside down; this keeps the wrist below the
  // package and the four fingers on its far/underside throughout the pour.
  this.pourQ=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),this.camera.rotation.y+(this.camera.aspect<.9?.12:.55)).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),-1.88));
  this.pourTarget=glass.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0,glass.userData.height+.075,0)).sub(new THREE.Vector3(0,this.height,0).applyQuaternion(this.pourQ));
  return true;
 }
 beginDrink(){if(!this.canDrink())return false;this.state='DRINKING';this.time=0;this.sipStartFill=this.model.userData.fill;this.sipReturnState=this.heldKind==='glass'?'GLASS_HOLDING':'HOLDING';this.sipAmount=Math.min(.12,this.sipStartFill);this.sipProgress=0;this.drinkFlow=false;return true;}
 holdingPose(player={}){
  const narrow=this.camera.aspect<.9,speed=Math.hypot(player.velocity?.x||0,player.velocity?.z||0),bob=Math.sin((player.distance||0)*6)*Math.min(.003,speed*.0006);
  const v=new THREE.Vector3(narrow?.105:.21,-this.height*.76-.045+bob-(1-this.transition)*.5,narrow?-.52:-.48);this.camera.localToWorld(v);
  const q=this.camera.getWorldQuaternion(new THREE.Quaternion());if(this.examine)q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),Math.sin(this.time*.7)*.4));return{v,q};
 }
 update(dt,player={}){
  if(!this.loaded||!this.model)return;if(['GLASS_PLACING','BEER_PLACING'].includes(this.state))this.resolveHome?.(this.model);this.time+=dt;this.drinkFlow=false;
  if(this.state==='HOLD_APPEARING'){this.transition=smooth(this.time/.65);if(this.time>=.65){this.transition=1;this.state=this.heldKind==='glass'?'GLASS_HOLDING':'HOLDING';this.time=0;}}
  else if(this.state==='HOLD_DISAPPEARING'){this.transition=this.fromTransition*(1-smooth(this.time/.5));if(this.time>=.5){this.finish();return;}}
  else if(holding.has(this.state)&&!['POUR_READY','POUR_COMPLETE'].includes(this.state)){const speed=Math.hypot(player.velocity?.x||0,player.velocity?.z||0);this.state=speed>4.8?'RUNNING_WITH_DRINK':speed>.12?'WALKING_WITH_DRINK':'HOLDING';}
  const normal=this.holdingPose(player),t=this.time;
  if(this.state==='GLASS_PLACING'){
   const u=smooth(t/.5),d=this.model.userData;this.rig.position.lerpVectors(this.putStart,d.homePosition,u);this.rig.quaternion.slerpQuaternions(this.putStartQ,this.putQ,u);
   // The glass is rotationally symmetric. Keep the wrist facing the viewer
   // rather than turning the hand through the glass's saved world rotation.
   if(t>=.5){
    if(!this.putReleased){this.scene.add(this.model);this.model.position.copy(d.homePosition);this.model.quaternion.copy(d.homeQuaternion);this.model.traverse(o=>o.layers.set(0));d.held=false;this.onRelease?.(this.model);this.putReleased=true;this.rig.visible=false;}
    const retreat=new THREE.Vector3(.12,-.38,.12).applyQuaternion(this.camera.getWorldQuaternion(new THREE.Quaternion()));
    this.rig.position.addScaledVector(retreat,smooth((t-.5)/.15));
   }
   if(t>=.65){this.finish();return;}
  }else if(this.state==='BEER_PLACING'){
   const u=smooth(t/.5),d=this.model.userData;this.rig.position.lerpVectors(this.putStart,d.homePosition,u);this.rig.quaternion.slerpQuaternions(this.putStartQ,this.putQ,u);
   if(t>=.5&&!this.putReleased){this.scene.add(this.model);this.model.position.copy(d.homePosition);this.model.quaternion.copy(d.homeQuaternion);d.held=false;d.placed=true;d.shelfSlot=null;this.onRelease?.(this.model);this.model.traverse(o=>{if(o.isMesh)o.castShadow=true;});this.model.traverse(o=>o.layers.set(0));this.putReleased=true;this.rig.visible=false;}
   if(t>=.65){const placedModel=this.model,placed={model:placedModel,beerKey:placedModel.userData.beerKey||null,itemId:placedModel.userData.onlineItemId||null,surface:{x:d.homePosition.x,y:d.homePosition.y,z:d.homePosition.z}};this.model=null;this.source=null;this.heldKind=null;this.state='IDLE';this.rig.visible=false;this.transition=0;this.onPlaced?.(placed);this.onReturned?.(null);return;}
  }else if(this.state==='DRINKING'){
   // Positive X rotation tips the rim towards the mouth (+camera Z), not
   // sideways away from the viewer. The near rim, not the glass origin, is
   // constrained to the mouth throughout the sip.
   const amount=smooth(t/.65)*(1-smooth((t-1.55)/.65));
   const levelAfterSip=.015+.19*Math.max(0,this.sipStartFill-this.sipAmount);
   const rimRadius=this.heldKind==='glass'?this.model.userData.rTop-.004:this.radius*.36;
   const tilt=this.heldKind==='glass'?Math.atan2(this.height-levelAfterSip,rimRadius)+.10:1.75+(1-this.sipStartFill)*.25;
   const q=(this.getMouthQuaternion?.()||this.camera.getWorldQuaternion(new THREE.Quaternion())).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),tilt));
   const mouth=this.getMouthPosition?.()||this.camera.localToWorld(new THREE.Vector3(.015,-.085,-.055)),localRim=new THREE.Vector3(0,this.height,rimRadius);
   // Move the rim along one continuous curve while rotating around it. A
   // second hard mouth constraint used to snap on at .85 s and kept the
   // glass pinned to the lips throughout the lowering phase.
   const restingRim=localRim.clone().applyQuaternion(normal.q).add(normal.v),rimTarget=restingRim.lerp(mouth,amount);
   this.rig.quaternion.slerpQuaternions(normal.q,q,amount);
   this.rig.position.copy(rimTarget).sub(localRim.applyQuaternion(this.rig.quaternion));
   const sip=smooth((t-.8)/.65);this.model.userData.fill=this.sipStartFill-this.sipAmount*sip;this.sipProgress=sip;this.drinkFlow=t>.8&&t<1.45;
   if(t>=2.2){this.state=this.sipReturnState;this.time=0;this.drinkFlow=false;}
  }else if(this.state==='POURING'){
   if(this.glass?.userData.supAnchor)this.pourTarget.copy(this.glass.getWorldPosition(new THREE.Vector3())).add(new THREE.Vector3(0,this.glass.userData.height+.075,0)).sub(new THREE.Vector3(0,this.height,0).applyQuaternion(this.pourQ));
   if(t<.85){const u=smooth(t/.85);this.rig.position.lerpVectors(this.pourStart,this.pourTarget,u);this.rig.quaternion.slerpQuaternions(this.pourStartQ,this.pourQ,u);}
   else if(t<3.9){this.rig.position.copy(this.pourTarget);this.rig.quaternion.copy(this.pourQ);}
   else{const u=smooth((t-3.9)/.75);this.rig.position.lerpVectors(this.pourTarget,normal.v,u);this.rig.quaternion.slerpQuaternions(this.pourQ,normal.q,u);if(t>=4.65){this.state='POUR_COMPLETE';this.time=0;}}
  }else{this.rig.position.copy(normal.v);this.rig.quaternion.copy(normal.q);}
  this.rig.updateMatrixWorld(true);
  this.arm.updateForearm(this.camera);
 }
 mouthPosition(){if(!this.model)return null;this.rig.updateMatrixWorld(true);return this.rig.localToWorld(new THREE.Vector3(0,this.height,0));}
}
