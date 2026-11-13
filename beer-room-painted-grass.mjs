import * as THREE from './three.module.js';
import {groundBounds} from './beer-room-ground.mjs';
import {groundHeight,campLayout} from './beer-room-terrain.mjs';
// Explicit planting creates geometry even on previously bare ground. Existing
// instance IDs remain intact; this extra low grass is controlled by the brush.
export function createPaintedGrass({group,geometry,material,paint}){
 const root=new THREE.Group();root.name='Grass planted with the world brush';group.add(root);
 const barInverse={value:new THREE.Matrix4()},barMin={value:new THREE.Vector3()},barMax={value:new THREE.Vector3()},barActive={value:0};
 const mat=material.clone();mat.onBeforeCompile=shader=>{material.onBeforeCompile(shader);shader.uniforms.uGrassGrowth=paint.growthUniform;Object.assign(shader.uniforms,{uGrassBarInverse:barInverse,uGrassBarMin:barMin,uGrassBarMax:barMax,uGrassBarActive:barActive});shader.fragmentShader='uniform sampler2D uGrassGrowth;uniform mat4 uGrassBarInverse;uniform vec3 uGrassBarMin,uGrassBarMax;uniform float uGrassBarActive;\n'+shader.fragmentShader;shader.fragmentShader=shader.fragmentShader.replace('#include <clipping_planes_fragment>',`#include <clipping_planes_fragment>
 float planted=texture2D(uGrassGrowth,vec2((vGrassGround.x+196.)/416.,(vGrassGround.z+169.)/416.)).r;
 if(planted<.015)discard;
 vec3 barLocal=(uGrassBarInverse*vec4(vGrassGround,1.)).xyz;
 if(uGrassBarActive>.5&&all(greaterThan(barLocal,uGrassBarMin))&&all(lessThan(barLocal,uGrassBarMax)))discard;`);};mat.customProgramCacheKey=()=>material.customProgramCacheKey()+':planted-v2';
 const meshes=new Map(),step=.38,cell=12;let revision=-1,tick=1,count=0;
 const noise=(i,j,k)=>{const n=Math.sin(i*127.1+j*311.7+k*74.7)*43758.5453;return n-Math.floor(n);};
 function rebuild(){revision=paint.growthRevision;tick=0;const candidates=new Set();
  for(const e of paint.growthAreas)for(let n=0;n<e.points.length;n++){const p=e.points[n],from=e.points[n-1]||p,d=Math.hypot(p[0]-from[0],p[1]-from[1]),segments=Math.max(1,Math.ceil(d/Math.max(.2,e.radius*.35)));for(let k=0;k<=segments;k++){const x=from[0]+(p[0]-from[0])*k/segments,z=from[1]+(p[1]-from[1])*k/segments,r=e.radius+.25;for(let j=Math.floor((z-r)/step);j<=Math.ceil((z+r)/step);j++)for(let i=Math.floor((x-r)/step);i<=Math.ceil((x+r)/step);i++)if(Math.hypot(i*step-x,j*step-z)<r)candidates.add(i+','+j);}}
  const N=paint.growthUniform.value.image.width,groups=new Map(),tiles=new Map(),tileSize=128;count=0;
  // Read only touched mask tiles: a small brush need not copy the entire 16 MB map.
  function densityAt(px,py){const tx=Math.floor(px/tileSize),ty=Math.floor(py/tileSize),key=tx+','+ty;let pixels=tiles.get(key);if(!pixels){pixels=paint.growthPixels(tx*tileSize,ty*tileSize,tileSize,tileSize);tiles.set(key,pixels);}return pixels[((py%tileSize)*tileSize+px%tileSize)*4]/255;}
  for(const key of candidates){const [i,j]=key.split(',').map(Number),x=i*step+(noise(i,j,1)-.5)*.19,z=j*step+(noise(i,j,2)-.5)*.19,px=Math.max(0,Math.min(N-1,Math.round((x-groundBounds.minX)/groundBounds.size*N))),py=Math.max(0,Math.min(N-1,Math.round((groundBounds.maxZ-z)/groundBounds.size*N))),density=densityAt(px,py);
   if(density<.03||noise(i,j,3)>density||groundHeight(x,z)<=campLayout.lake.y+.015)continue;const cellKey=Math.floor(x/cell)+','+Math.floor(z/cell);if(!groups.has(cellKey))groups.set(cellKey,[]);groups.get(cellKey).push({x,z,yaw:noise(i,j,4)*Math.PI*2,scale:.78+noise(i,j,5)*.44});count++;
  }
  const dummy=new THREE.Object3D();for(const [key,points]of groups){let mesh=meshes.get(key);if(!mesh||mesh.instanceMatrix.count<points.length){if(mesh){root.remove(mesh);mesh.dispose();}mesh=new THREE.InstancedMesh(geometry,mat,Math.max(64,points.length));mesh.name='Painted low forest grass';mesh.receiveShadow=true;mesh.castShadow=false;root.add(mesh);meshes.set(key,mesh);}mesh.count=points.length;points.forEach((p,i)=>{dummy.position.set(p.x,groundHeight(p.x,p.z)+.003,p.z);dummy.rotation.set(0,p.yaw,0);dummy.scale.setScalar(p.scale);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);});mesh.instanceMatrix.needsUpdate=true;mesh.computeBoundingSphere();}
  for(const [key,mesh]of meshes)if(!groups.has(key)){root.remove(mesh);mesh.dispose();meshes.delete(key);}
 }
 return{root,setBarClearance(matrix,bounds,active){barInverse.value.copy(matrix).invert();barMin.value.copy(bounds.min);barMax.value.copy(bounds.max);barActive.value=active?1:0;},get count(){return count;},update(camera,range,dt=.016){tick+=dt;if(revision!==paint.growthRevision&&tick>=.09)rebuild();for(const [key,m]of meshes){const [i,j]=key.split(',').map(Number);m.visible=Math.hypot(camera.position.x-(i+.5)*cell,camera.position.z-(j+.5)*cell)<range+cell;}},refresh:rebuild};
}
