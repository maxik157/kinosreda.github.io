import {barSite,toiletSite,woodshedSite} from './beer-room-site.mjs';
import * as THREE from './three.module.js';
import {createGroundPaint,groundMaterial} from './beer-room-ground.mjs';
import {terrainGeometry} from './beer-room-terrain-mesh.mjs';
import {accelerateTerrainRaycast} from './beer-room-terrain-raycast.mjs';
import {buildCampSky,sunDirection,moonDirection} from './beer-room-sky.mjs';
import {campLayout,groundHeight,lakeDistance,pathDistance,randomSource} from './beer-room-terrain.mjs';
export {campLayout,groundHeight,lakeDistance,pathDistance,randomSource,canWalkGround} from './beer-room-terrain.mjs';
export function buildLandscape(group){
 const geometry=terrainGeometry();
 const paint=createGroundPaint(),detail=groundMaterial(paint),ground=new THREE.Mesh(geometry,detail.material);ground.name='Rolling forest terrain and lake bed';ground.receiveShadow=true;ground.userData.environmentGround=true;ground.userData.surface={kind:'ground',topY:0};accelerateTerrainRaycast(ground,geometry.userData.terrainGrid);group.add(ground);
 // A coarse outer terrain ring extends far beyond the playable area. Its
 // outer boundary is beyond the fog and far plane, including across the lake.
 const farPositions=[],farColors=[],farIndices=[],steps=192,radii=[207,320,390,510,680,900,1200];
 for(let ring=0;ring<radii.length;ring++)for(let i=0;i<=steps;i++){
  const a=i/steps*Math.PI*2,edge=ring===0?Math.max(Math.abs(Math.cos(a)),Math.abs(Math.sin(a))):1;
  const radius=radii[ring]/edge,x=12+Math.cos(a)*radius,z=39+Math.sin(a)*radius;
  farPositions.push(x,groundHeight(x,z),z);const c=new THREE.Color(0x69784e).multiplyScalar(.88+.08*Math.sin(x*.08+z*.04));farColors.push(c.r,c.g,c.b);
  if(ring<radii.length-1&&i<steps){const k=ring*(steps+1)+i;farIndices.push(k,k+1,k+steps+1,k+1,k+steps+2,k+steps+1);}
 }
 const farGeometry=new THREE.BufferGeometry();farGeometry.setAttribute('position',new THREE.Float32BufferAttribute(farPositions,3));farGeometry.setAttribute('color',new THREE.Float32BufferAttribute(farColors,3));farGeometry.setIndex(farIndices);farGeometry.computeVertexNormals();
 const horizon=new THREE.Mesh(farGeometry,new THREE.MeshStandardMaterial({vertexColors:true,roughness:1}));horizon.name='Continuous distant wooded hills';group.add(horizon);
 const skySystem=buildCampSky(group),{sky,moon}=skySystem;
 const ambient=new THREE.HemisphereLight(0xc1d8e1,0x61533b,1.65);group.add(ambient);const sun=new THREE.DirectionalLight(0xffdcaa,2.15);sun.position.set(-70,100,0);sun.target.position.set(0,0,40);group.add(sun.target);sun.castShadow=true;sun.shadow.mapSize.set(1024,1024);Object.assign(sun.shadow.camera,{left:-170,right:170,top:170,bottom:-170,near:1,far:500});sun.shadow.camera.updateProjectionMatrix();sun.shadow.normalBias=.065;sun.shadow.bias=-.0002;sun.shadow.radius=5;group.add(sun);
 function setNight(n,visibility=1){
  skySystem.setNight(n);sun.color.set(0xffdcaa).lerp(new THREE.Color(0x9ebaff),n);sun.intensity=THREE.MathUtils.lerp(2.15,.58,n)*visibility;
  sun.position.copy(sunDirection).lerp(moonDirection,n).multiplyScalar(190).add(sun.target.position);
  ambient.color.set(0xc1d8e1).lerp(new THREE.Color(0x7e9fcf),n);ambient.groundColor.set(0x61533b).lerp(new THREE.Color(0x111d35),n);ambient.intensity=THREE.MathUtils.lerp(1.65,.32,n)*visibility;
 }
 function refreshHeight(bounds){if(!bounds)return;const a=geometry.attributes.position;for(let i=0;i<a.count;i++){const x=a.getX(i),z=a.getZ(i);if(x>=bounds.minX-1&&x<=bounds.maxX+1&&z>=bounds.minZ-1&&z<=bounds.maxZ+1)a.setY(i,groundHeight(x,z));}a.needsUpdate=true;geometry.computeVertexNormals();geometry.computeBoundingBox();geometry.computeBoundingSphere();}
 return{ground,paint,refreshHeight,horizon,sky,moon,sun,ambient,setNight,get assetsReady(){return skySystem.assetsReady&&detail.ready;},update:skySystem.update};
}
