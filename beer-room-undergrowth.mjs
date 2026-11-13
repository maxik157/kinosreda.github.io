import {barSite,toiletSite,serviceClearance} from './beer-room-site.mjs';
import * as THREE from './three.module.js';
import {groundHeight,lakeDistance,pathDistance,randomSource,campLayout} from './beer-room-landscape.mjs';
import {createPaintedGrass} from './beer-room-painted-grass.mjs';
import {applyGroundGrassMask} from './beer-room-ground.mjs';
import {mergeGeometries} from './BufferGeometryUtils.js';
export function buildUndergrowth(group,trees,paint){
 const rng=randomSource(489),dummy=new THREE.Object3D(),batches=[],colliders=[],entries=[];
 const grassMat=new THREE.MeshStandardMaterial({color:0x647b39,roughness:1,side:THREE.DoubleSide}),fernMat=new THREE.MeshStandardMaterial({color:0x3d6c3b,roughness:1,side:THREE.DoubleSide}),stone=new THREE.MeshStandardMaterial({color:0x858779,roughness:1,flatShading:true}),bark=new THREE.MeshStandardMaterial({color:0x5c4832,roughness:1});
 function leafGeometry(w,h){const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute([0,0,0,-w*.5,h*.35,0,0,h*.48,.04,w*.5,h*.35,0,0,h,0],3));g.setAttribute('uv',new THREE.Float32BufferAttribute([.5,0,0,.35,.5,.48,1,.35,.5,1],2));g.setIndex([0,1,2,0,2,3,1,4,2,2,4,3]);g.computeVertexNormals();return g;}
 const fade={value:80};
 for(const material of [grassMat,fernMat])material.onBeforeCompile=shader=>{shader.uniforms.uPlantRange=fade;shader.vertexShader='varying vec3 vPlantWorld;\n'+shader.vertexShader;shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
 vec4 plant=vec4(transformed,1.);
 #ifdef USE_INSTANCING
 plant=instanceMatrix*plant;
 #endif
 vPlantWorld=(modelMatrix*plant).xyz;`);shader.fragmentShader='uniform float uPlantRange;varying vec3 vPlantWorld;\n'+shader.fragmentShader;shader.fragmentShader=shader.fragmentShader.replace('#include <clipping_planes_fragment>',`#include <clipping_planes_fragment>
 float fade=1.-smoothstep(uPlantRange*.68,uPlantRange,distance(cameraPosition.xz,vPlantWorld.xz));
 if(fract(sin(dot(vPlantWorld.xz,vec2(12.9898,78.233)))*43758.5453)>fade)discard;`);};
 // At lawn height a single tapered triangle preserves the blade silhouette;
 // retain clump density without paying for a four-triangle leaf per blade.
 const blades=[];for(let i=0;i<14;i++){const h=.045+rng()*.07,w=.012+rng()*.014,g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute([-w/2,0,0,w/2,0,0,w*.18,h,.016],3));g.setIndex([0,1,2]);g.computeVertexNormals();g.rotateZ((rng()-.5)*.9);g.rotateY(rng()*6.28);g.translate((rng()-.5)*.46,0,(rng()-.5)*.46);blades.push(g);}const grass=mergeGeometries(blades);blades.forEach(g=>g.dispose());
 const leaves=[];for(let a=0;a<9;a++)for(let k=1;k<10;k++)for(const side of [-1,1]){const t=k/10,g=leafGeometry(.055,.21*(1-t)+.04);g.rotateX(-.9);g.rotateZ(side*.9);g.translate(side*.025,Math.sin(t*2.3)*.30,t*.65);g.rotateY(a/9*Math.PI*2);leaves.push(g);}const fern=mergeGeometries(leaves);leaves.forEach(g=>g.dispose());
 function allowed(x,z,allowPath=false){return !serviceClearance(x,z)&&!(Math.abs(x-campLayout.bench.x)<2.5&&Math.abs(z-campLayout.bench.z)<1.4)&&!(Math.abs(x)<barSite.width/2+.6&&Math.abs(z-barSite.z)<9.4)&&(allowPath||Math.hypot(x-campLayout.fire.x,z-campLayout.fire.z)>4.5)&& (allowPath||!(Math.abs(x-campLayout.gazebo.x)<4.3&&Math.abs(z-campLayout.gazebo.z)<4))&&(allowPath||pathDistance(x,z)>1.4)&&lakeDistance(x,z)>1.005;}
 const items={grass:[],fern:[],rock:[],log:[],flower:[],reed:[],stump:[],shrub:[]};
 for(let i=0;i<71000;i++){const close=i<51000,x=close?-50+rng()*105:-105+rng()*220,z=close?-32+rng()*108:-85+rng()*260;if(!allowed(x,z))continue;const l=lakeDistance(x,z);let type=i%39===0?'fern':'grass';if(l<1.035){if(i%8)continue;type='reed';}if(i%390===0)type='rock';if(i%100===0)type='flower';if(type==='rock'&&Math.abs(x)<10&&z>barSite.z+8&&z<barSite.z+16)continue;items[type].push({x,z,scale:type==='rock'?.3+rng()*.9:type==='grass'?.72+rng()*.5:.5+rng(),yaw:rng()*6.28});}
 // Keep every existing plant ID/position stable: new paintable grass uses an
 // independent seed and is appended after the original placement sequence.
 const paintRng=randomSource(48831);
 for(let i=0;i<9000;i++){const x=-50+paintRng()*105,z=-32+paintRng()*108;if(!allowed(x,z,true)||allowed(x,z))continue;items.grass.push({x,z,scale:.72+paintRng()*.5,yaw:paintRng()*6.28});}
 // Roots follow the actual slope in short tapered sections. No raised
 // moss discs: the tree flare is buried and merges directly into the soil.
 const rootParts=[];let rootCount=0,rootVertexCount=0;
 for(const t of trees){if(Math.abs(t.x)>80||t.z>133||t.z< -65)continue;
  if(Math.hypot(t.x,t.z-20)<100)for(let j=0;j<5;j++){
   const angle=t.yaw+j*2.399,length=(.9+rng()*.9)*t.scale;
   for(let k=0;k<4;k++){const r0=.3+k/4*length,r1=.3+(k+1)/4*length,ax=t.x+Math.sin(angle)*r0,az=t.z+Math.cos(angle)*r0,bx=t.x+Math.sin(angle)*r1,bz=t.z+Math.cos(angle)*r1,a=new THREE.Vector3(ax,groundHeight(ax,az)+.12*(1-k/4)-.035,az),b=new THREE.Vector3(bx,groundHeight(bx,bz)+.12*(1-(k+1)/4)-.035,bz),geo=new THREE.CylinderGeometry(.13*(1-(k+1)/4)+.008,.13*(1-k/4)+.008,a.distanceTo(b),6);geo.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),b.clone().sub(a).normalize()));geo.translate(...a.add(b).multiplyScalar(.5).toArray());t.rootStart??=rootVertexCount;t.rootCount=(t.rootCount||0)+geo.attributes.position.count;rootVertexCount+=geo.attributes.position.count;rootParts.push(geo);}
   rootCount++;
  }
  if(rng()<.045)items.stump.push({x:t.x+2,z:t.z-2,scale:.7+rng()*.6,yaw:t.yaw});if(rng()<.08){const x=t.x+1.5,z=t.z+.5;if(allowed(x,z))items.log.push({x,z,scale:.8+rng(),yaw:rng()*6.28});}
 }
 if(rootParts.length){const roots=new THREE.Mesh(mergeGeometries(rootParts),bark);roots.name='Terrain-following buried roots';roots.receiveShadow=true;group.add(roots);for(const t of trees)if(t.rootCount)t.rootMesh=roots;rootParts.forEach(g=>g.dispose());}
 // Dense tall understorey at the clearing boundary, with deliberate openings
 // along the walking routes and down the central view towards the lake.
 for(let i=0;i<1600;i++){let x,z;if(i<700){const a=rng()*Math.PI*2,r=29+rng()*12;x=Math.cos(a)*r;z=6+Math.sin(a)*r;}else{x=-140+rng()*290;z=-100+rng()*295;}
  if(Math.abs(x-campLayout.bench.x)<3.5&&z>campLayout.bench.z-1&&z<43||!allowed(x,z)||Math.hypot(x/1.12,z-6)<25||lakeDistance(x,z)<1.045||pathDistance(x,z)<2.3)continue;
  items.shrub.push({x,z,scale:1.5+rng()*1.9,yaw:rng()*6.28});
 }
 const shrubCanvas=document.createElement('canvas');shrubCanvas.width=shrubCanvas.height=256;const sh=shrubCanvas.getContext('2d');for(let i=0;i<230;i++){const a=rng()*6.28,r=Math.sqrt(rng())*103,x=128+Math.cos(a)*r,y=128+Math.sin(a)*r;sh.fillStyle=['#66813f','#8e9f55','#405f31','#adba75'][i%4];sh.beginPath();sh.ellipse(x,y,4+rng()*9,3+rng()*7,rng()*3,0,6.28);sh.fill();}
 const shrubTexture=new THREE.CanvasTexture(shrubCanvas);shrubTexture.colorSpace=THREE.SRGBColorSpace;const shrubMat=new THREE.MeshStandardMaterial({map:shrubTexture,color:0xc4d0a6,alphaTest:.38,side:THREE.DoubleSide,roughness:1}),shrubParts=[];
 for(let i=0;i<28;i++){const a=i*2.399,y=.25+rng()*.65,r=.25+rng()*.4,g=new THREE.PlaneGeometry(.65,.7);g.rotateY(a);g.rotateX((rng()-.5)*1.4);g.translate(Math.cos(a)*r,y,Math.sin(a)*r);shrubParts.push(g);}const shrub=mergeGeometries(shrubParts);shrubParts.forEach(g=>g.dispose());
 const reed=new THREE.ConeGeometry(.035,1.5,4),rock=new THREE.DodecahedronGeometry(1,1),log=new THREE.CylinderGeometry(.16,.22,2.5,10);log.rotateZ(Math.PI/2);
 const flowerParts=[];for(let j=0;j<5;j++){const petal=new THREE.CircleGeometry(.026,6);petal.rotateX(-Math.PI/2+.18);petal.translate(0,.115,.026);petal.rotateY(j*Math.PI*2/5);flowerParts.push(petal);}for(let j=0;j<3;j++){const leaf=leafGeometry(.04,.08);leaf.rotateZ(.75);leaf.rotateY(j*2.399);leaf.translate(0,.03,0);flowerParts.push(leaf);}const flower=mergeGeometries(flowerParts);flowerParts.forEach(g=>g.dispose());
 const stumpGeo=new THREE.CylinderGeometry(.22,.32,.5,12);stumpGeo.translate(0,.23,0);
 const defs={shrub:[shrub,shrubMat],stump:[stumpGeo,bark],grass:[grass,grassMat],fern:[fern,fernMat],rock:[rock,stone],log:[log,bark],flower:[flower,new THREE.MeshStandardMaterial({color:0xffffff,roughness:1,side:THREE.DoubleSide})],reed:[reed,new THREE.MeshStandardMaterial({color:0x6a7346,roughness:1})]};
 // Keep nearby foliage outside the occupied cabin, including after a world edit.
 const utilityClearance={value:new THREE.Vector3(toiletSite.x,toiletSite.z,toiletSite.yaw)};
 for(const material of new Set(Object.values(defs).map(d=>d[1]))){const previous=material.onBeforeCompile;material.onBeforeCompile=shader=>{previous?.(shader);shader.uniforms.uUtilityClearance=utilityClearance;shader.vertexShader='varying vec3 vUtilityWorld;\n'+shader.vertexShader;shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
 vec4 utilityVertex=vec4(transformed,1.);
 #ifdef USE_INSTANCING
 utilityVertex=instanceMatrix*utilityVertex;
 #endif
 vUtilityWorld=(modelMatrix*utilityVertex).xyz;`);shader.fragmentShader='varying vec3 vUtilityWorld;uniform vec3 uUtilityClearance;\n'+shader.fragmentShader;shader.fragmentShader=shader.fragmentShader.replace('#include <clipping_planes_fragment>',`#include <clipping_planes_fragment>
 vec2 utilityDelta=vUtilityWorld.xz-uUtilityClearance.xy;
 float utilityCos=cos(uUtilityClearance.z),utilitySin=sin(uUtilityClearance.z);
 vec2 utilityLocal=vec2(utilityCos*utilityDelta.x-utilitySin*utilityDelta.y,utilitySin*utilityDelta.x+utilityCos*utilityDelta.y);
 if(abs(utilityLocal.x)<1.40&&abs(utilityLocal.y)<1.85)discard;`);};}
 for(const kind of ['grass','fern','flower'])applyGroundGrassMask(defs[kind][1],paint,kind==='grass');
 for(const [type,list]of Object.entries(items)){
 list.forEach((p,i)=>{p.id=`plant:${type}:${i}`;p.type=type;entries.push(p);});
 const cells=new Map();for(const p of list){const key=`${Math.floor(p.x/38)},${Math.floor(p.z/38)}`;if(!cells.has(key))cells.set(key,[]);cells.get(key).push(p);}for(const list of cells.values()){const [geometry,material]=defs[type],mesh=new THREE.InstancedMesh(geometry,material,list.length);let cx=0,cz=0;list.forEach((p,i)=>{const y=groundHeight(p.x,p.z);dummy.position.set(p.x,y+(type==='rock'?.15:type==='log'?.2:type==='reed'?.65:0),p.z);dummy.rotation.set(type==='rock'?rng():0,p.yaw,0);dummy.scale.setScalar(p.scale);if(type==='rock')dummy.scale.y*=.6;dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);p.slot={mesh,index:i};p.y=dummy.position.y;if(type==='flower')mesh.setColorAt(i,new THREE.Color([0xe5dfb9,0xc8b7de,0xe0c46b,0xe8e5d5][i%4]));cx+=p.x;cz+=p.z;if(type==='rock'&&p.scale>.7)colliders.push({minX:p.x-p.scale*.7,maxX:p.x+p.scale*.7,minZ:p.z-p.scale*.7,maxZ:p.z+p.scale*.7,minY:y,maxY:y+p.scale*.7,worldId:p.id,label:'boulder'});});mesh.userData.worldIds=list.map(p=>p.id);mesh.computeBoundingSphere();mesh.receiveShadow=true;mesh.castShadow=false;group.add(mesh);batches.push({mesh,x:cx/list.length,z:cz/list.length,type});}}
 const paintedGrass=createPaintedGrass({group,geometry:grass,material:grassMat,paint});
 function update(camera,quality){fade.value=quality==='high'?100:quality==='medium'?80:55;const range=quality==='high'?100:quality==='medium'?80:55;paintedGrass.update(camera,range);for(const b of batches)b.mesh.visible=Math.hypot(camera.position.x-b.x,camera.position.z-b.z)<(b.type==='shrub'?300:b.type==='rock'?range+100:range+24);}
 return{paintedGrass,setUtilityClearance(x,z,yaw){utilityClearance.value.set(x,z,yaw);},update,colliders,entries,batches,defs,stats:{...Object.fromEntries(Object.entries(items).map(([k,v])=>[k,v.length])),root:rootCount}};
}
