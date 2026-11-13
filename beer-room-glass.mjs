import * as THREE from './three.module.js';
const clamp=THREE.MathUtils.clamp;
// The glass and all of its contents are one object. It moves between the
// worktop and the hand; there is never a stale cloned liquid or duplicate glass.
export function createServingGlass(shape='pint'){
 const group=new THREE.Group();group.name='Serving glass';
 const height=.23,rBottom=shape==='tulip'?.041:.036,rTop=shape==='tulip'?.055:.061;
 const points=[[0,0],[rBottom,0],[rBottom+.002,.012],[rTop,.20],[rTop-.002,height],[rTop-.005,height],[rTop-.004,.20],[rBottom-.004,.015],[0,.015]].map(p=>new THREE.Vector2(...p));
 const material=new THREE.MeshPhysicalMaterial({color:0xe2f0ef,transparent:true,opacity:.19,roughness:.08,metalness:.04,clearcoat:1,depthWrite:false,side:THREE.DoubleSide});
 const body=new THREE.Mesh(new THREE.LatheGeometry(points,64),material);body.name='Glass wall';body.renderOrder=4;group.add(body);
 const rim=new THREE.Mesh(new THREE.TorusGeometry(rTop-.003,.0013,8,64),new THREE.MeshPhysicalMaterial({color:0xeaf6f1,transparent:true,opacity:.65,roughness:.08,depthWrite:false}));rim.rotation.x=Math.PI/2;rim.position.y=height;rim.renderOrder=5;group.add(rim);
 const liquidGeometry=new THREE.CylinderGeometry(1,1,1,64,1),foamGeometry=new THREE.CircleGeometry(1,64);foamGeometry.rotateX(-Math.PI/2);
 const liquid=new THREE.Mesh(liquidGeometry,new THREE.MeshPhysicalMaterial({color:0xd58c19,roughness:.18,transparent:true,opacity:.91,clearcoat:.5}));liquid.name='Glass liquid';liquid.renderOrder=2;group.add(liquid);
 const foam=new THREE.Mesh(foamGeometry,new THREE.MeshStandardMaterial({color:0xffefcd,roughness:1,side:THREE.DoubleSide}));foam.name='Glass foam';foam.renderOrder=3;group.add(foam);
 const bubbles=new THREE.InstancedMesh(new THREE.SphereGeometry(.0012,5,4),new THREE.MeshStandardMaterial({color:0xffdfa0,transparent:true,opacity:.5}),24);bubbles.name='Carbonation';group.add(bubbles);
 const foamBubbles=new THREE.InstancedMesh(new THREE.SphereGeometry(1,6,4),new THREE.MeshStandardMaterial({color:0xffefcf,roughness:1}),40);foamBubbles.name='Foam bubbles';foamBubbles.renderOrder=3;group.add(foamBubbles);
 group.userData={action:'glass',shape,fill:0,height,rBottom,rTop,liquid,foam,bubbles,foamBubbles,liquidRest:liquidGeometry.attributes.position.array.slice(),foamRest:foamGeometry.attributes.position.array.slice(),slosh:new THREE.Vector2(),sloshVelocity:new THREE.Vector2(),lastVelocity:new THREE.Vector3(),lastQuaternion:new THREE.Quaternion(),physicsStarted:false,held:false};
 updateGlass(group,0);return group;
}
export function updateGlass(glass,dt,player={},camera=null,time=0){
 const d=glass.userData;d.fill=clamp(d.fill,0,1);dt=clamp(dt,0,.05);
 // Empty glasses have no fluid simulation. Resting full glasses keep their
 // cached fluid geometry while carbonation continues at the same visual rate.
 if(d.fill<=.002){d.liquid.visible=d.foam.visible=d.foamBubbles.visible=d.bubbles.visible=false;d.fluidSignature=null;d.physicsStarted=false;return;}
 const motion=d.held?player.velocity:d.movingSurface;const velocity=new THREE.Vector3(motion?.x||0,0,motion?.z||0),q=glass.getWorldQuaternion(new THREE.Quaternion()),inverse=q.clone().invert();
 const up=new THREE.Vector3(0,1,0).applyQuaternion(inverse),acceleration=new THREE.Vector3();
 if((d.held||d.movingSurface)&&d.physicsStarted&&dt>0)acceleration.copy(velocity).sub(d.lastVelocity).divideScalar(dt).applyQuaternion(inverse).clampLength(0,18);
 const target=new THREE.Vector2(-acceleration.x/9.81,-acceleration.z/9.81);
 if((d.held||d.movingSurface)&&d.physicsStarted&&dt>0){const dq=d.lastQuaternion.clone().invert().multiply(q);target.x+=clamp(dq.z/dt,-3,3)*.18;target.y+=clamp(dq.x/dt,-3,3)*.18;}
 target.clampLength(0,.55);
 // Damped spring retains a small wave after braking instead of oscillating
 // forever at constant walking speed. Gravity keeps a tilted glass level.
 d.sloshVelocity.addScaledVector(target.clone().sub(d.slosh),dt*55).multiplyScalar(Math.exp(-dt*7));d.slosh.addScaledVector(d.sloshVelocity,dt).clampLength(0,.6);
 if(target.lengthSq()<1e-12&&d.slosh.lengthSq()<1e-10&&d.sloshVelocity.lengthSq()<1e-10){d.slosh.set(0,0);d.sloshVelocity.set(0,0);}
 d.lastVelocity.copy(velocity);d.lastQuaternion.copy(q);d.physicsStarted=true;
 const slopeX=clamp(-up.x/Math.max(.06,up.y)+d.slosh.x,-8,8),slopeZ=clamp(-up.z/Math.max(.06,up.y)+d.slosh.y,-8,8);
 const level=.015+.19*d.fill, radiusAt=y=>d.rBottom-.004+(d.rTop-d.rBottom)*clamp(y/.20,0,1);
 const bottomRadius=radiusAt(.015),amp=d.held?Math.min(.002,d.slosh.length()*.004):0;
 const heightAt=(x,z)=>clamp(level+slopeX*x+slopeZ*z+Math.sin(time*8+x*80)*amp,.015,d.height-.006);
 // Intersect the inclined surface with the actual tapered wall, rather than
 // tilting a fixed-width disk that protrudes through the narrow side of a pint.
 const surfacePoint=(ux,uz)=>{
  const length=Math.hypot(ux,uz);if(length<1e-8)return[0,level,0];
  const slope=(slopeX*ux+slopeZ*uz)/length,k=(d.rTop-d.rBottom)/.20;
  const denominator=1-slope*k;
  let edge=denominator>0?(level+slope*(d.rBottom-.004))/denominator:d.height;
  if(edge>.20)edge=level+slope*radiusAt(.20);
  const radius=radiusAt(clamp(edge,.015,d.height-.006)),x=ux*radius,z=uz*radius;
  return[x,heightAt(x,z),z];
 };
 const fluidSignature=[d.fill,slopeX,slopeZ,amp?time:0].join(':');
 const fluidChanged=d.fluidSignature!==fluidSignature;d.fluidSignature=fluidSignature;
 if(fluidChanged){
 const pos=d.liquid.geometry.attributes.position;
 for(let i=0;i<pos.count;i++){const x=d.liquidRest[i*3],y=d.liquidRest[i*3+1],z=d.liquidRest[i*3+2];if(y>0)pos.setXYZ(i,...surfacePoint(x,z));else pos.setXYZ(i,x*bottomRadius,.014,z*bottomRadius);}
 pos.needsUpdate=true;d.liquid.geometry.computeVertexNormals();d.liquid.frustumCulled=false;
 const fp=d.foam.geometry.attributes.position;
 for(let i=0;i<fp.count;i++){const[x,y,z]=surfacePoint(d.foamRest[i*3],d.foamRest[i*3+2]);fp.setXYZ(i,x,y+.002,z);}fp.needsUpdate=true;d.foam.geometry.computeVertexNormals();d.foam.frustumCulled=false;
 }
 const dummy=new THREE.Object3D();
 if(fluidChanged){
 for(let i=0;i<40;i++){const a=i*2.39996,r=Math.sqrt((i+.5)/40)*.95,[x,y,z]=surfacePoint(Math.cos(a)*r,Math.sin(a)*r),size=.0014+(i%7)*.00025;dummy.position.set(x,y+.002,z);dummy.scale.set(size,size*.45,size);dummy.updateMatrix();d.foamBubbles.setMatrixAt(i,dummy.matrix);}d.foamBubbles.instanceMatrix.needsUpdate=true;
 }
 for(let i=0;i<24;i++){const a=i*2.39996,r=bottomRadius*.65*Math.sqrt((i+.5)/24),x=Math.cos(a)*r,z=Math.sin(a)*r;dummy.position.set(x,.017+((time*.024+i*.027)%Math.max(.001,heightAt(x,z)-.018)),z);dummy.scale.setScalar(1);dummy.updateMatrix();d.bubbles.setMatrixAt(i,dummy.matrix);}d.bubbles.instanceMatrix.needsUpdate=true;
 d.liquid.visible=d.fill>.002;d.foam.visible=d.fill>.025;d.foamBubbles.visible=d.foam.visible;d.bubbles.visible=d.fill>.04;
 d.surfaceSlope=[slopeX,slopeZ];
}
