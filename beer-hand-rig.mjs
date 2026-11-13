import * as THREE from './three.module.js';
import {GLTFLoader} from './GLTFLoader.js';
const fingerNames=['index','middle','ring','pinky'];
export class AnatomicalGrip {
 constructor(){this.group=new THREE.Group();this.group.name='Right hand, wrist and continuous forearm';this.ready=this.load();}
 async load(){
  const gltf=await new GLTFLoader().loadAsync(new URL('./assets/models/right-hand.glb',import.meta.url).href);this.mesh=gltf.scene;this.mesh.updateMatrixWorld(true);
  this.joints=new Map();this.mesh.traverse(o=>{if(o.isBone)this.joints.set(o.name,{bone:o,p:o.position.clone(),q:o.quaternion.clone()});});
  this.wrist=this.joints.get('wrist').p.clone();
  // A proper rotation (determinant +1), never a negative scale. The thumb
  // remains on the anatomical index side of this right hand.
  const matrix=new THREE.Matrix4().makeBasis(new THREE.Vector3(0,0,-1),new THREE.Vector3(1,0,0),new THREE.Vector3(0,-1,0));
  this.rotation=new THREE.Quaternion().setFromRotationMatrix(matrix);this.inverse=this.rotation.clone().invert();
  this.mesh.position.copy(this.wrist).negate().applyQuaternion(this.rotation);this.mesh.quaternion.copy(this.rotation);this.group.add(this.mesh);
  const canvas=document.createElement('canvas');canvas.width=canvas.height=128;const ctx=canvas.getContext('2d'),pixels=ctx.createImageData(128,128);let seed=23;for(let i=0;i<pixels.data.length;i+=4){seed=(seed*1664525+1013904223)>>>0;const v=124+seed%12;pixels.data.set([v,v,v,255],i);}ctx.putImageData(pixels,0,0);const texture=new THREE.CanvasTexture(canvas);texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.repeat.set(4,4);
  const skin=new THREE.MeshPhysicalMaterial({color:0xc48d70,roughness:.63,metalness:0,bumpMap:texture,bumpScale:.00035,clearcoat:.06,clearcoatRoughness:.8});
  this.mesh.traverse(o=>{if(o.isMesh){o.material=skin;o.frustumCulled=false;o.castShadow=false;o.receiveShadow=false;if(o.isSkinnedMesh)this.skin=o;}});
  this.nails=[];const nailMaterial=new THREE.MeshPhysicalMaterial({color:0xd6b39e,roughness:.48,clearcoat:.14,side:THREE.DoubleSide});
  const shape=new THREE.Shape();shape.absellipse(0,0,.0031,.0046,0,Math.PI*2,false,0);
  for(let i=0;i<5;i++){const nail=new THREE.Mesh(new THREE.ShapeGeometry(shape,20),nailMaterial);this.group.add(nail);this.nails.push(nail);}
  // One continuous sleeve follows a shoulder/elbow/wrist chain.
  const cloth=new THREE.MeshStandardMaterial({color:0x263c36,roughness:.94,bumpMap:texture,bumpScale:.0009});
  const curve=new THREE.CatmullRomCurve3([new THREE.Vector3(.005,.004,0),new THREE.Vector3(.075,-.055,.035),new THREE.Vector3(.13,-.19,.08),new THREE.Vector3(.18,-.39,.16)]);
  const sleeve=new THREE.Mesh(new THREE.TubeGeometry(curve,32,.030,24,false),cloth);sleeve.name='Continuous sleeve to lower screen edge';sleeve.frustumCulled=false;this.group.add(sleeve);this.sleeve=sleeve;
  const cuff=new THREE.Mesh(new THREE.TorusGeometry(.03,.003,12,48),cloth);this.group.add(cuff);this.cuff=cuff;
  this.loaded=true;return this;
 }
 updateForearm(camera){
  if(!this.loaded)return;
  this.group.updateWorldMatrix(true,false);
  const wrist=this.group.localToWorld(new THREE.Vector3(.005,.004,0));
  const shoulder=camera.localToWorld(new THREE.Vector3(.19,-.23,.03));
  const axis=wrist.clone().sub(shoulder),distance=axis.length();axis.normalize();
  const upper=.32,fore=.29,reach=Math.min(distance,upper+fore-.001);
  // A small torso lean covers the final centimetres of reaching, instead of
  // stretching the forearm or bending a tube directly out of the wrist.
  if(distance>reach)shoulder.addScaledVector(axis,distance-reach);
  const outward=new THREE.Vector3(.8,-1,.2).applyQuaternion(camera.getWorldQuaternion(new THREE.Quaternion()));
  const bend=outward.addScaledVector(axis,-outward.dot(axis)).normalize();
  const along=(upper*upper-fore*fore+reach*reach)/(2*reach),height=Math.sqrt(Math.max(0,upper*upper-along*along));
  const elbow=shoulder.clone().addScaledVector(axis,along).addScaledVector(bend,height);
  this.elbowWorld=elbow.clone();this.shoulderWorld=shoulder.clone();
  const start=this.group.worldToLocal(wrist),joint=this.group.worldToLocal(elbow),end=this.group.worldToLocal(shoulder);
  const curve=new THREE.CatmullRomCurve3([start,start.clone().lerp(joint,.82),joint,joint.clone().lerp(end,.18),end]);
  const direction=joint.clone().sub(start).normalize();this.cuff.position.copy(start).addScaledVector(direction,.004);this.cuff.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1),direction);
  const frames=curve.computeFrenetFrames(32,false),position=this.sleeve.geometry.attributes.position,normal=this.sleeve.geometry.attributes.normal;
  for(let i=0;i<=32;i++){
   const fraction=i/32,p=curve.getPointAt(fraction),radius=.03+.035*fraction;
   for(let j=0;j<=24;j++){
    const angle=j/24*Math.PI*2,n=frames.normals[i].clone().multiplyScalar(-Math.cos(angle)).addScaledVector(frames.binormals[i],Math.sin(angle)),v=p.clone().addScaledVector(n,radius),index=i*25+j;
    position.setXYZ(index,v.x,v.y,v.z);normal.setXYZ(index,n.x,n.y,n.z);
   }
  }
  position.needsUpdate=true;normal.needsUpdate=true;
 }
 palm(bind){return bind.clone().sub(this.wrist).applyQuaternion(this.rotation);}
 source(target){return target.clone().applyQuaternion(this.inverse).add(this.wrist);}
 pose(radius,kind){
  if(!this.loaded)return;
  const bottle=kind.includes('bottle');this.poseKind=bottle?'bottle-body':'can-body';
  this.wristOffset=new THREE.Vector3(radius+.09,-.012,-.026);
  const targets=new Map();targets.set('wrist',new THREE.Vector3());
  for(const finger of fingerNames){
   const names=[`${finger}-finger-metacarpal`,`${finger}-finger-phalanx-proximal`,`${finger}-finger-phalanx-intermediate`,`${finger}-finger-phalanx-distal`,`${finger}-finger-tip`];
   const worldBase=this.palm(this.joints.get(names[1]).p).add(this.wristOffset),ringRadius=radius+.0065;
   // Place the joint centres one finger-pad thickness outside the measured
   // package surface. Keeping a bind-pose radius leaves the fingertips floating.
   const radial=ringRadius/Math.hypot(worldBase.x,worldBase.z);worldBase.x*=radial;worldBase.z*=radial;
   targets.set(names[0],this.palm(this.joints.get(names[0]).p));targets.set(names[1],worldBase.clone().sub(this.wristOffset));
   let angle=Math.atan2(worldBase.z,worldBase.x);
   for(let i=2;i<names.length;i++){
    const length=this.joints.get(names[i]).p.distanceTo(this.joints.get(names[i-1]).p);
    angle-=2*Math.asin(Math.min(.8,length/(2*ringRadius)));
    const y=worldBase.y-(i-1)*.001;
    targets.set(names[i],new THREE.Vector3(Math.cos(angle)*ringRadius,y,Math.sin(angle)*ringRadius).sub(this.wristOffset));
   }
  }

  const thumbNames=['thumb-metacarpal','thumb-phalanx-proximal','thumb-phalanx-distal','thumb-tip'];
  targets.set(thumbNames[0],this.palm(this.joints.get(thumbNames[0]).p));
  const thumbRadius=radius+.012;
  [1.18,1.52,1.78].forEach((angle,i)=>targets.set(thumbNames[i+1],new THREE.Vector3(Math.cos(angle)*thumbRadius,.048-i*.004,Math.sin(angle)*thumbRadius).sub(this.wristOffset)));
  const chains=[...fingerNames.map(n=>[`${n}-finger-metacarpal`,`${n}-finger-phalanx-proximal`,`${n}-finger-phalanx-intermediate`,`${n}-finger-phalanx-distal`,`${n}-finger-tip`]),thumbNames];
  for(const {bone,p,q}of this.joints.values()){bone.position.copy(p);bone.quaternion.copy(q);}
  for(const chain of chains){
   for(let i=0;i<chain.length;i++){
    const entry=this.joints.get(chain[i]),next=i<chain.length-1?i+1:i,prev=i===chain.length-1?i-1:i;
    const original=this.joints.get(chain[next]).p.clone().sub(this.joints.get(chain[prev]).p).normalize();
    const wanted=this.source(targets.get(chain[next])).sub(this.source(targets.get(chain[prev]))).normalize();
    entry.bone.position.copy(this.source(targets.get(chain[i])));entry.bone.quaternion.copy(new THREE.Quaternion().setFromUnitVectors(original,wanted)).multiply(entry.q);
   }
  }
  for(let f=0;f<chains.length;f++){
   const chain=chains[f],a=targets.get(chain.at(-2)).clone().add(this.wristOffset),b=targets.get(chain.at(-1)).clone().add(this.wristOffset);
   const center=a.clone().lerp(b,.52),normal=new THREE.Vector3(center.x,0,center.z).normalize(),tangent=b.clone().sub(a).normalize();
   const side=new THREE.Vector3().crossVectors(tangent,normal).normalize(),up=new THREE.Vector3().crossVectors(normal,side).normalize();
   this.nails[f].position.copy(center.addScaledVector(normal,.0065).sub(this.wristOffset));this.nails[f].quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(side,up,normal));
  }
  this.group.updateMatrixWorld(true);this.skin.skeleton.update();
 }
}
