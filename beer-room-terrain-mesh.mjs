import * as THREE from './three.module.js';
import {groundHeight} from './beer-room-terrain.mjs';
function coordinates(min,max,nearMin,nearMax){const values=[];let p=min;while(p<max){values.push(p);p=Math.min(max,p+(p>=nearMin&&p<nearMax?.7:3.2));}values.push(max);return values;}
// Detail where players can sculpt and walk; retain the original distant hills.
export function terrainGeometry(){
 const xs=coordinates(-196,220,-72,88),zs=coordinates(-169,247,-60,135),nx=xs.length,nz=zs.length,pos=new Float32Array(nx*nz*3),uv=new Float32Array(nx*nz*2),idx=[];
 for(let j=0;j<nz;j++)for(let i=0;i<nx;i++){const k=j*nx+i;pos.set([xs[i],groundHeight(xs[i],zs[j]),zs[j]],k*3);uv.set([(xs[i]+196)/416,1-(zs[j]+169)/416],k*2);if(i<nx-1&&j<nz-1)idx.push(k,k+nx,k+1,k+1,k+nx,k+nx+1);}
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(pos,3));g.setAttribute('uv',new THREE.BufferAttribute(uv,2));g.setIndex(idx);g.computeVertexNormals();g.userData.terrainGrid={xs,zs};return g;
}
