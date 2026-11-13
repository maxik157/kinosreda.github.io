import * as THREE from './three.module.js';

// SAT against the transformed building, rather than its enlarged world AABB.
// This keeps props beside the corners of a rotated/scaled bar visible.
export function createBarVolume(localBox,matrix){
 const center=localBox.getCenter(new THREE.Vector3()).applyMatrix4(matrix),half=localBox.getSize(new THREE.Vector3()).multiplyScalar(.5),e=matrix.elements;
 const sides=[new THREE.Vector3(e[0],e[1],e[2]).multiplyScalar(half.x),new THREE.Vector3(e[4],e[5],e[6]).multiplyScalar(half.y),new THREE.Vector3(e[8],e[9],e[10]).multiplyScalar(half.z)],worldAxes=[new THREE.Vector3(1,0,0),new THREE.Vector3(0,1,0),new THREE.Vector3(0,0,1)],axes=[...worldAxes];
 for(let i=0;i<3;i++){axes.push(new THREE.Vector3().crossVectors(sides[i],sides[(i+1)%3]));for(const a of worldAxes)axes.push(new THREE.Vector3().crossVectors(sides[i],a));}
 const tests=axes.filter(a=>a.lengthSq()>1e-14).map(a=>({axis:a.normalize(),radius:0}));for(const t of tests)t.radius=sides.reduce((v,s)=>v+Math.abs(s.dot(t.axis)),0);
 const broad=localBox.clone().applyMatrix4(matrix),objectCenter=new THREE.Vector3(),objectHalf=new THREE.Vector3(),delta=new THREE.Vector3();
 return{bounds:broad,center,sides,intersectsVolume(other){
  if(!broad.intersectsBox(other.bounds))return false;
  const axes=[];for(const edges of [sides,other.sides])for(let i=0;i<3;i++)axes.push(new THREE.Vector3().crossVectors(edges[i],edges[(i+1)%3]));
  for(const a of sides)for(const b of other.sides)axes.push(new THREE.Vector3().crossVectors(a,b));
  const delta=other.center.clone().sub(center);
  for(const a of axes){if(a.lengthSq()<1e-14)continue;a.normalize();const radius=sides.reduce((r,s)=>r+Math.abs(a.dot(s)),0)+other.sides.reduce((r,s)=>r+Math.abs(a.dot(s)),0);if(Math.abs(delta.dot(a))>=radius-1e-5)return false;}
  return true;
 },intersects(box){if(box.isEmpty()||!broad.intersectsBox(box))return false;box.getCenter(objectCenter);box.getSize(objectHalf).multiplyScalar(.5);delta.copy(objectCenter).sub(center);for(const {axis:a,radius}of tests)if(Math.abs(delta.dot(a))>=radius+Math.abs(a.x)*objectHalf.x+Math.abs(a.y)*objectHalf.y+Math.abs(a.z)*objectHalf.z-1e-5)return false;return true;}};
}
