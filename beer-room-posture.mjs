import * as THREE from './three.module.js';
import {solveArm,aimBone} from './beer-room-avatar-grip.mjs';

// Seat coordinates describe the pelvis contact point, not standing feet.
// IK keeps the original limb lengths on every avatar and scaled seat.
export function poseGroundedBody(root,model,action,rest,distance=0){
 const sitting=action.kind==='seated',height=root.userData.height||1.84,scale=height/1.84;
 const reclined=sitting&&(action.seatKind==='sofa'||action.seatKind==='folding-chair');
 const stool=sitting&&action.seatKind==='stool',sofa=sitting&&action.seatKind==='sofa';
 const hip=model.getObjectByName('Hips');
 model.rotation.set(sitting?(reclined?.14:0):-.20,Math.PI,0);
 model.position.z=sitting?(reclined?.025:0):.09*scale;
 model.updateWorldMatrix(true,true);
 if(hip){const p=root.worldToLocal(hip.getWorldPosition(new THREE.Vector3()));model.position.y+=(sitting?(sofa?.16:.10)*scale:.48*scale)-p.y;model.position.z+=(sitting?0:.09*scale)-p.z;}
 model.updateWorldMatrix(true,true);
 const phase=distance*9,walking=action.kind==='crouch-walk',drop=sitting?Math.min(Math.max(.15,(Number(action.seatHeight)||.5)-.08),stool?.40:sofa?.44:.52)*scale:0;
 const worldQ=root.getWorldQuaternion(new THREE.Quaternion());
 for(const [side,sign]of [['Left',-1],['Right',1]]){
  const thigh=model.getObjectByName(side+'UpLeg'),shin=model.getObjectByName(side+'Leg'),foot=model.getObjectByName(side+'Foot'),toe=model.getObjectByName(side+'ToeBase');
  const stride=walking?Math.sin(phase+(sign<0?0:Math.PI))*.13*scale:0,lift=walking?Math.max(0,Math.cos(phase+(sign<0?0:Math.PI)))*.035:0;
  const ankle=new THREE.Vector3(sign*(sitting?.14:.16)*scale,sitting?-drop:.075*scale+lift,(sitting?(stool?-.24:sofa?-.48:-.40):-.10)*scale+stride);
  if(thigh&&shin&&foot){solveArm(thigh,shin,foot,root.localToWorld(ankle.clone()),new THREE.Vector3(sign*.08,0,-1).applyQuaternion(worldQ));if(toe)aimBone(foot,toe,root.localToWorld(ankle.clone().add(new THREE.Vector3(0,-.025,-.18*scale))));}
  const arm=model.getObjectByName(side+'Arm'),fore=model.getObjectByName(side+'ForeArm'),hand=model.getObjectByName(side+'Hand');
  if(arm&&fore&&hand)solveArm(arm,fore,hand,root.localToWorld(new THREE.Vector3(sign*.23*scale,sitting?.19*scale:.57*scale,(sitting?-.27:-.29)*scale-stride*.25)),new THREE.Vector3(sign*.7,-.4,.2).applyQuaternion(worldQ));
 }
 model.updateWorldMatrix(true,true);
}

// Blend skeleton transforms, not the player's seat anchor. Camera motion never
// enters this cache, so looking around cannot rotate or slide a seated body.
export function blendBodyPose(root,model,dt,kind){
 const d=root.userData,active=['seated','crouching','crouch-walk'].includes(kind),previous=d.bodyPose;
 const blend=previous&&(active||previous.active||previous.remaining>0)?1-Math.exp(-Math.min(dt,.05)*15):1;
 const pose=previous||{bones:[],position:new THREE.Vector3(),rotation:new THREE.Quaternion()};
 if(!previous)model.traverse(b=>{if(b.isBone)pose.bones.push({b,q:b.quaternion.clone(),p:b.position.clone()});});
 for(const entry of pose.bones){const {b,q,p}=entry;if(previous&&blend<1){b.quaternion.slerp(q,1-blend);b.position.lerp(p,1-blend);}q.copy(b.quaternion);p.copy(b.position);}
 if(previous&&blend<1){model.position.lerp(pose.position,1-blend);model.quaternion.slerp(pose.rotation,1-blend);}
 pose.active=active;pose.remaining=active?.35:Math.max(0,(pose.remaining||0)-dt);pose.position.copy(model.position);pose.rotation.copy(model.quaternion);d.bodyPose=pose;
}
