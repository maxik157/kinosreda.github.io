import * as THREE from './three.module.js';

const edges=[[0,1],[0,2],[0,4],[1,3],[1,5],[2,3],[2,6],[3,7],[4,5],[4,6],[5,7],[6,7]];
const cross=(a,b,c)=>(b.x-a.x)*(c.z-a.z)-(b.z-a.z)*(c.x-a.x);
function hull(points){
 const p=points.slice().sort((a,b)=>a.x-b.x||a.z-b.z),lo=[],hi=[];
 for(const v of p){while(lo.length>1&&cross(lo.at(-2),lo.at(-1),v)<=1e-10)lo.pop();lo.push(v);}
 for(let i=p.length-1;i>=0;i--){const v=p[i];while(hi.length>1&&cross(hi.at(-2),hi.at(-1),v)<=1e-10)hi.pop();hi.push(v);}
 return lo.slice(0,-1).concat(hi.slice(0,-1));
}
function circlePolygon(x,z,r,p){
 if(!p.length)return false;let inside=true;
 for(let i=0;i<p.length;i++){const a=p[i],b=p[(i+1)%p.length];if(cross(a,b,{x,z})<0)inside=false;const dx=b.x-a.x,dz=b.z-a.z,t=THREE.MathUtils.clamp(((x-a.x)*dx+(z-a.z)*dz)/(dx*dx+dz*dz||1),0,1);if((x-a.x-dx*t)**2+(z-a.z-dz*t)**2<r*r-1e-10)return true;}
 return inside;
}

// Keep the original local box. Repeated world AABB -> local AABB conversions
// expand rotated furniture and turn empty corners into invisible walls.
export function setTransformedBox(c,box,matrix){
 const corners=Array.from({length:8},(_,i)=>new THREE.Vector3(i&1?box.max.x:box.min.x,i&2?box.max.y:box.min.y,i&4?box.max.z:box.min.z).applyMatrix4(matrix)),bounds=new THREE.Box3().setFromPoints(corners),inverse=matrix.clone().invert();
 Object.assign(c,{minX:bounds.min.x,maxX:bounds.max.x,minY:bounds.min.y,maxY:bounds.max.y,minZ:bounds.min.z,maxZ:bounds.max.z});
 const footprint=hull(corners);let slab='',polygon=[];
 c.overlaps=(x,z,r,feet=c.minY,height=c.maxY-c.minY)=>{
  if(x+r<c.minX||x-r>c.maxX||z+r<c.minZ||z-r>c.maxZ||feet>=c.maxY-.012||feet+height<=c.minY+.02)return false;
  const key=feet+':'+height;if(key!==slab){slab=key;const low=feet+.02,high=feet+height,points=corners.filter(p=>p.y>=low&&p.y<=high);for(const [i,j]of edges){const a=corners[i],b=corners[j];for(const y of [low,high])if((a.y-y)*(b.y-y)<0)points.push(a.clone().lerp(b,(y-a.y)/(b.y-a.y)));}polygon=hull(points);}
  return circlePolygon(x,z,r,polygon);
 };
 c.containsXZ=(x,z,r=0)=>circlePolygon(x,z,r,footprint);
 c.supportHeightAt=(x,z)=>{if(!c.containsXZ(x,z))return null;const ray=new THREE.Ray(new THREE.Vector3(x,c.maxY+.05,z),new THREE.Vector3(0,-1,0)).applyMatrix4(inverse),p=ray.intersectBox(box,new THREE.Vector3());return p?p.applyMatrix4(matrix).y:null;};
 return c;
}

export function captureCollider(c,root){
 root.updateWorldMatrix(true,true);const inverse=root.matrixWorld.clone().invert();
 if(c.localBox&&c.localRoot){c.localRoot.updateWorldMatrix(true,false);return{c,box:c.localBox.clone(),frame:inverse.multiply(c.localRoot.matrixWorld).multiply(c.localFrame||new THREE.Matrix4())};}
 return{c,box:new THREE.Box3(new THREE.Vector3(c.minX,c.minY??0,c.minZ),new THREE.Vector3(c.maxX,c.maxY??3,c.maxZ)).applyMatrix4(inverse),frame:new THREE.Matrix4()};
}
