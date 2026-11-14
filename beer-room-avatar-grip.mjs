import * as THREE from './three.module.js';
const up=new THREE.Vector3(0,1,0);
const fingerNames=['Index','Middle','Ring','Pinky'];
const worldPoint=o=>o.getWorldPosition(new THREE.Vector3());
export function aimBone(bone,child,target){
  const origin=worldPoint(bone),from=worldPoint(child).sub(origin).normalize(),to=target.clone().sub(origin).normalize();
  const q=new THREE.Quaternion().setFromUnitVectors(from,to).multiply(bone.getWorldQuaternion(new THREE.Quaternion()));
  bone.quaternion.copy(bone.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(q));bone.updateWorldMatrix(false,true);
}
export function solveArm(upper,fore,hand,target,bendHint){
  const shoulder=worldPoint(upper),elbow=worldPoint(fore),wrist=worldPoint(hand),a=shoulder.distanceTo(elbow),b=elbow.distanceTo(wrist);
  const delta=target.clone().sub(shoulder),d=THREE.MathUtils.clamp(delta.length(),Math.abs(a-b)+.005,a+b-.005),axis=delta.normalize();
  const bend=bendHint.clone().addScaledVector(axis,-bendHint.dot(axis)).normalize();
  const along=(a*a-b*b+d*d)/(2*d),height=Math.sqrt(Math.max(0,a*a-along*along));
  const wantedElbow=shoulder.clone().addScaledVector(axis,along).addScaledVector(bend,height);
  aimBone(upper,fore,wantedElbow);aimBone(fore,hand,shoulder.addScaledVector(axis,d));
}
export function createAvatarGrip(root,model,held){
  const hand=model.getObjectByName('RightHand'),upper=model.getObjectByName('RightArm'),fore=model.getObjectByName('RightForeArm');
  if(!hand||!upper||!fore)return null;
  model.updateWorldMatrix(true,true);
  const fingers=fingerNames.map(name=>[1,2,3,4].map(i=>model.getObjectByName(`RightHand${name}${i}`)));
  const thumb=[1,2,3,4].map(i=>model.getObjectByName(`RightHandThumb${i}`));
  const localPoint=bone=>hand.worldToLocal(worldPoint(bone));
  const index=localPoint(fingers[0][0]),pinky=localPoint(fingers[3][0]),middle=localPoint(fingers[1][0]);
  const across=index.clone().sub(pinky).normalize(),long=middle.clone().addScaledVector(across,-middle.dot(across)).normalize();
  const normal=new THREE.Vector3().crossVectors(across,long).normalize();
  const basis=new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(long,across,normal.clone().negate()));
  const palm=index.clone().add(pinky).multiplyScalar(.5).multiplyScalar(.96);
  const rest=new Map([...fingers.flat(),...thumb].filter(Boolean).map(bone=>[bone,bone.quaternion.clone()]));
  const socket=held;socket.position.set(0,0,0);socket.quaternion.copy(basis);hand.add(socket);
  root.userData.gripSocket=socket;root.userData.handBone=hand;
  let radius=.03,gripHeight=.10,shapeKey='',lastRoll=0,fingerPose=null;
  const neutralWrist=hand.quaternion.clone();
  function configure(item){
    fingerPose=null;
    const profile=item.userData.packageProfile,scale=model.scale.x;
    if(profile){
      const height=profile.kind.includes('bottle')?.30:.205,unit=height/profile.modelHeight;
      gripHeight=height*(profile.kind.includes('bottle')?.34:.43);
      const row=profile.rows.reduce((a,b)=>Math.abs(a.y*unit-gripHeight)<Math.abs(b.y*unit-gripHeight)?a:b);
      radius=row.radius*unit;item.scale.setScalar(unit/scale);
    }else{gripHeight=.105;radius=item.userData.rBottom+(item.userData.rTop-item.userData.rBottom)*gripHeight/.20;item.scale.setScalar(1/scale);}
    socket.position.copy(palm).addScaledVector(normal,(radius+.005)/scale);socket.quaternion.copy(basis);
    item.position.set(0,-gripHeight/scale,0);item.quaternion.identity();
  }
  function curl(){
    if(fingerPose){for(const [bone,q]of fingerPose)bone.quaternion.copy(q);hand.updateWorldMatrix(false,true);return;}
    for(const [bone,q]of rest)bone.quaternion.copy(q);
    hand.updateWorldMatrix(true,true);
    const center=socket.position,scale=model.scale.x;
    for(const chain of fingers){
      const start=localPoint(chain[0]),relative=start.clone().sub(center),axial=relative.dot(across);
      const ring=Math.max(radius/scale+.003,Math.hypot(relative.dot(long),relative.dot(normal)));
      let angle=Math.atan2(relative.dot(normal),relative.dot(long));
      for(let i=0;i<3;i++){
        const length=chain[i+1].position.length();angle+=2*Math.asin(Math.min(.95,length/(2*ring)));
        const target=center.clone().addScaledVector(across,axial).addScaledVector(long,Math.cos(angle)*ring).addScaledVector(normal,Math.sin(angle)*ring);
        aimBone(chain[i],chain[i+1],hand.localToWorld(target));
      }
    }
    // The thumb meets the opposite side of the cylinder; rotations only, so
    // phalanx lengths and the skinned palm remain anatomically connected.
    const target=hand.localToWorld(center.clone().addScaledVector(across,.025).addScaledVector(long,-(radius+.006)/scale).addScaledVector(normal,.006));
    for(let pass=0;pass<7;pass++)for(let i=2;i>=0;i--){
      const bone=thumb[i],origin=worldPoint(bone),from=worldPoint(thumb[3]).sub(origin).normalize(),to=target.clone().sub(origin).normalize();
      const delta=new THREE.Quaternion().setFromUnitVectors(from,to),angle=2*Math.acos(THREE.MathUtils.clamp(delta.w,-1,1));
      if(angle>.35)delta.slerpQuaternions(new THREE.Quaternion(),delta,.35/angle);
      const q=delta.multiply(bone.getWorldQuaternion(new THREE.Quaternion()));bone.quaternion.copy(bone.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(q));bone.updateWorldMatrix(false,true);
    }
    fingerPose=new Map([...rest.keys()].map(bone=>[bone,bone.quaternion.clone()]));
  }
  return {socket,hand,fingers,thumb,update(action={}){
    const item=socket.children[0];if(!item||!socket.visible){shapeKey='';return;}
    if(shapeKey!==item.uuid){configure(item);shapeKey=item.uuid;}
    const height=root.userData.poseHeight||root.userData.height||1.84,drinking=action.kind==='drinking'||action.gesture==='drinking',pouring=action.kind==='pouring'||action.gesture==='pouring';
    const progress=THREE.MathUtils.clamp(action.drinkProgress??1,0,1),amount=progress*progress*(3-2*progress);
    const localQ=new THREE.Quaternion().setFromEuler(new THREE.Euler(pouring?1.8:0,Math.PI,0,'YXZ'));
    const desiredQ=root.getWorldQuaternion(new THREE.Quaternion()).multiply(localQ);
    let center=root.localToWorld(new THREE.Vector3(.30,height*.60,-.30));
    if(drinking&&root.userData.mouthSocket){
      const mouth=root.userData.mouthSocket,mouthQ=mouth.getWorldQuaternion(new THREE.Quaternion());
      const tilt=item.userData.packageProfile?1.85:Math.atan2((item.userData.height||.23)-(.015+.19*(action.fill??.5)),item.userData.rTop-.004)+.10;
      const drinkQ=mouthQ.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),tilt));
      desiredQ.slerp(drinkQ,amount);
      const rim=new THREE.Vector3(0,(item.userData.packageProfile?(item.userData.packageProfile.kind.includes('bottle')?.30:.205):item.userData.height)-gripHeight,item.userData.packageProfile?radius*.36:item.userData.rTop-.004);
      const drinkCenter=worldPoint(mouth).sub(rim.applyQuaternion(drinkQ));center.lerp(drinkCenter,amount);
    }else if(pouring)center=root.localToWorld(new THREE.Vector3(.34,height*.64,-.48));
    model.updateWorldMatrix(true,true);
    // A cylindrical grip can roll around the container. Choose that freedom
    // together with the elbow plane, rather than folding the wrist to a fixed roll.
    const shoulder=worldPoint(upper),a=shoulder.distanceTo(worldPoint(fore)),b=worldPoint(fore).distanceTo(worldPoint(hand));
    const baseQ=desiredQ.clone(),baseCenter=center.clone(),hint=new THREE.Vector3(.85,-.65,.12).applyQuaternion(root.getWorldQuaternion(new THREE.Quaternion()));
    const mouth=root.userData.mouthSocket,mouthPosition=mouth?worldPoint(mouth):null,drinkBase=mouth?mouth.getWorldQuaternion(new THREE.Quaternion()):null;
    const physicalHeight=item.userData.packageProfile?(item.userData.packageProfile.kind.includes('bottle')?.30:.205):item.userData.height;
    const rim=new THREE.Vector3(0,physicalHeight-gripHeight,item.userData.packageProfile?radius*.36:item.userData.rTop-.004),resting=root.localToWorld(new THREE.Vector3(.30,height*.60,-.30));
    if(drinkBase){const tilt=item.userData.packageProfile?1.85:Math.atan2((item.userData.height||.23)-(.015+.19*(action.fill??.5)),item.userData.rTop-.004)+.10;drinkBase.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),tilt));}
    const inverseBasis=basis.clone().invert(),offset=socket.position.clone().multiplyScalar(model.scale.x),preferredBend=hint.clone().normalize();
    let best;
    const evaluate=roll=>{
      const q=baseQ.clone().multiply(new THREE.Quaternion().setFromAxisAngle(up,roll)),hq=q.clone().multiply(inverseBasis);
      const c=baseCenter.clone();
      if(drinking&&drinkBase)c.copy(resting).lerp(mouthPosition.clone().sub(rim.clone().applyQuaternion(drinkBase.clone().multiply(new THREE.Quaternion().setFromAxisAngle(up,roll)))),amount);
      const target=c.sub(offset.clone().applyQuaternion(hq)),delta=target.clone().sub(shoulder),distance=THREE.MathUtils.clamp(delta.length(),Math.abs(a-b)+.005,a+b-.005),axis=delta.normalize(),forward=long.clone().applyQuaternion(hq);
      const bend=forward.clone().negate().addScaledVector(axis,forward.dot(axis));if(bend.lengthSq()<1e-6)bend.copy(hint).addScaledVector(axis,-hint.dot(axis));bend.normalize();
      const along=(a*a-b*b+distance*distance)/(2*distance),rise=Math.sqrt(Math.max(0,a*a-along*along)),elbow=shoulder.clone().addScaledVector(axis,along).addScaledVector(bend,rise),foreDirection=target.clone().sub(elbow).normalize();
      const flex=Math.acos(THREE.MathUtils.clamp(forward.dot(foreDirection),-1,1)),turn=Math.atan2(Math.sin(roll-lastRoll),Math.cos(roll-lastRoll));
      const score=flex*flex+.025*(1-bend.dot(preferredBend))+.002*turn*turn;
      if(!best||score<best.score)best={score,roll,hq,target,bend,flex};
    };
    for(let i=0;i<24;i++)evaluate(i*Math.PI/12);
    for(let step=Math.PI/24;step>.001;step*=.5){const r=best.roll;evaluate(r-step);evaluate(r+step);}
    lastRoll=best.roll;const handQ=best.hq;
    solveArm(upper,fore,hand,best.target,best.bend);
    // Put pronation into the forearm. The wrist then supplies only the small
    // remaining flexion, instead of a 180-degree twist at the hand joint.
    const axis=worldPoint(hand).sub(worldPoint(fore)).normalize(),neutral=fore.getWorldQuaternion(new THREE.Quaternion()).multiply(neutralWrist),delta=handQ.clone().multiply(neutral.invert()),projection=axis.x*delta.x+axis.y*delta.y+axis.z*delta.z;
    const twist=new THREE.Quaternion(axis.x*projection,axis.y*projection,axis.z*projection,delta.w).normalize();
    fore.quaternion.copy(fore.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(twist.multiply(fore.getWorldQuaternion(new THREE.Quaternion()))));fore.updateWorldMatrix(false,true);
    hand.quaternion.copy(hand.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(handQ));hand.updateWorldMatrix(false,true);curl();
    root.userData.wristFlex=best.flex;root.userData.wristRotation=hand.quaternion.angleTo(neutralWrist);
    root.userData.gripRadius=radius;root.userData.gripHeight=gripHeight;
  }};
}

// Both palms remain on the same animated shaft sockets as the visible paddle.
export function createPaddleGrip(root,model,side){
 const hand=model.getObjectByName(side+'Hand'),upper=model.getObjectByName(side+'Arm'),fore=model.getObjectByName(side+'ForeArm');if(!hand||!upper||!fore)return null;
 const fingers=fingerNames.map(n=>[1,2,3,4].map(i=>model.getObjectByName(side+'Hand'+n+i)));if(fingers.some(c=>c.some(b=>!b)))return null;
 const thumb=[1,2,3,4].map(i=>model.getObjectByName(side+'HandThumb'+i));
 model.updateWorldMatrix(true,true);const local=b=>hand.worldToLocal(worldPoint(b)),index=local(fingers[0][0]),pinky=local(fingers[3][0]),middle=local(fingers[1][0]);
 const across=index.clone().sub(pinky).normalize(),long=middle.clone().addScaledVector(across,-middle.dot(across)).normalize(),normal=new THREE.Vector3().crossVectors(across,long).normalize(),basis=new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(long,across,normal.clone().negate()));
 const rest=new Map([...fingers.flat(),...thumb].filter(Boolean).map(b=>[b,b.quaternion.clone()])),scale=model.scale.x,radius=.016/scale;
 const center=index.clone().add(pinky).multiplyScalar(.48).addScaledVector(normal,.021/scale);
 return{update(handle){if(!handle)return;for(const[b,q]of rest)b.quaternion.copy(q);
  const desiredQ=handle.getWorldQuaternion(new THREE.Quaternion()).multiply(new THREE.Quaternion().setFromAxisAngle(up,side==='Left'?Math.PI/2:-Math.PI/2)).multiply(basis.clone().invert());
  const target=worldPoint(handle).sub(center.clone().multiplyScalar(scale).applyQuaternion(desiredQ)),hint=new THREE.Vector3(side==='Left'?-.85:.85,-.5,.2).applyQuaternion(root.getWorldQuaternion(new THREE.Quaternion()));
  model.updateWorldMatrix(true,true);solveArm(upper,fore,hand,target,hint);hand.quaternion.copy(hand.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(desiredQ));hand.updateWorldMatrix(false,true);
  for(const chain of fingers){const relative=local(chain[0]).sub(center),axial=relative.dot(across),ring=Math.max(radius,Math.hypot(relative.dot(long),relative.dot(normal)));let angle=Math.atan2(relative.dot(normal),relative.dot(long));for(let i=0;i<3;i++){angle+=2*Math.asin(Math.min(.95,chain[i+1].position.length()/(2*ring)));const t=center.clone().addScaledVector(across,axial).addScaledVector(long,Math.cos(angle)*ring).addScaledVector(normal,Math.sin(angle)*ring);aimBone(chain[i],chain[i+1],hand.localToWorld(t));}}
  root.userData.paddleGripError??={};root.userData.paddleGripError[side]=hand.localToWorld(center.clone()).distanceTo(worldPoint(handle));
  const tip=hand.localToWorld(center.clone().addScaledVector(across,.02/scale).addScaledVector(long,-radius));if(thumb.every(Boolean))for(let pass=0;pass<5;pass++)for(let i=2;i>=0;i--){const b=thumb[i],o=worldPoint(b),q=new THREE.Quaternion().setFromUnitVectors(worldPoint(thumb[3]).sub(o).normalize(),tip.clone().sub(o).normalize());q.slerpQuaternions(new THREE.Quaternion(),q,.35);b.quaternion.copy(b.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(q.multiply(b.getWorldQuaternion(new THREE.Quaternion()))));b.updateWorldMatrix(false,true);}
 }};
}
