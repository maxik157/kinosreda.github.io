import * as THREE from './three.module.js';

// Test only grid cells touched by the finite interaction ray. The proxy shares
// the rendered vertices and original triangle order, so slopes hit identically.
export function accelerateTerrainRaycast(ground,segments){
 const source=ground.geometry,indices=source.index.array;
 source.computeBoundingBox();source.computeBoundingSphere();
 const grid=typeof segments==='object'?segments:null,nx=grid?grid.xs.length-1:segments,nz=grid?grid.zs.length-1:segments;
 const lower=(values,v)=>{let lo=0,hi=values.length-1;while(lo<hi){const mid=(lo+hi+1)>>1;if(values[mid]<=v)lo=mid;else hi=mid-1;}return lo;};
 const bounds=source.boundingBox,dx=(bounds.max.x-bounds.min.x)/nx,dz=(bounds.max.z-bounds.min.z)/nz;
 const geometry=new THREE.BufferGeometry();
 for(const [name,attribute]of Object.entries(source.attributes))geometry.setAttribute(name,attribute);
 geometry.boundingSphere=source.boundingSphere;
 const proxy=new THREE.Mesh(geometry,ground.material),inverse=new THREE.Matrix4(),start=new THREE.Vector3(),end=new THREE.Vector3();
 const native=THREE.Mesh.prototype.raycast;
 ground.raycast=function(raycaster,hits){
  if(!Number.isFinite(raycaster.far)){native.call(this,raycaster,hits);return;}
  inverse.copy(this.matrixWorld).invert();
  // This terrain is unscaled; use transformed endpoints to also support a
  // future scaled parent without changing the world-space reach.
  raycaster.ray.at(raycaster.near,start).applyMatrix4(inverse);
  raycaster.ray.at(raycaster.far,end).applyMatrix4(inverse);
  const minX=Math.max(0,(grid?lower(grid.xs,Math.min(start.x,end.x)):Math.floor((Math.min(start.x,end.x)-bounds.min.x)/dx))-1),maxX=Math.min(nx-1,(grid?lower(grid.xs,Math.max(start.x,end.x)):Math.floor((Math.max(start.x,end.x)-bounds.min.x)/dx))+1);
  const minZ=Math.max(0,(grid?lower(grid.zs,Math.min(start.z,end.z)):Math.floor((Math.min(start.z,end.z)-bounds.min.z)/dz))-1),maxZ=Math.min(nz-1,(grid?lower(grid.zs,Math.max(start.z,end.z)):Math.floor((Math.max(start.z,end.z)-bounds.min.z)/dz))+1);
  if(minX>maxX||minZ>maxZ)return;
  const subset=[];for(let z=minZ;z<=maxZ;z++)for(let x=minX;x<=maxX;x++){const offset=(z*nx+x)*6;for(let i=0;i<6;i++)subset.push(indices[offset+i]);}
  geometry.boundingSphere=source.boundingSphere;geometry.boundingBox=source.boundingBox;geometry.setIndex(subset);proxy.matrixWorld.copy(this.matrixWorld);proxy.material=this.material;
  const first=hits.length;native.call(proxy,raycaster,hits);for(let i=first;i<hits.length;i++){hits[i].object=this;const cell=Math.floor(hits[i].faceIndex/2),x=minX+cell%(maxX-minX+1),z=minZ+Math.floor(cell/(maxX-minX+1));hits[i].faceIndex=(z*nx+x)*2+hits[i].faceIndex%2;}
 };
}
