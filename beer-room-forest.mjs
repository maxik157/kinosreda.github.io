import {barSite,serviceClearance} from './beer-room-site.mjs';
import * as THREE from './three.module.js';
import {treeBarkMaps,treeBarkMaterial,scaleBarkUV} from './beer-room-bark.mjs';
import {mergeGeometries} from './BufferGeometryUtils.js';
import {groundHeight,lakeDistance,pathDistance,randomSource,campLayout} from './beer-room-landscape.mjs';
const up=new THREE.Vector3(0,1,0),dummy=new THREE.Object3D(),leanEuler=new THREE.Euler(),yawQuaternion=new THREE.Quaternion();
export function barkTexture(){return treeBarkMaps().map;}
function branchGeometry(a,b,r){const g=scaleBarkUV(new THREE.CylinderGeometry(r*.4,r,a.distanceTo(b),r>.08?5:3,1,true),a.distanceTo(b),r);g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(up,b.clone().sub(a).normalize()));g.translate(...a.clone().add(b).multiplyScalar(.5).toArray());return g;}
export function needleTexture(species=0){
 const c=document.createElement('canvas');c.width=512;c.height=256;const x=c.getContext('2d'),rng=randomSource(133+species);x.clearRect(0,0,512,256);
 // Needles grow from terminal shoots, in bundles on Scots pine and in
 // short, dense combs on spruce. Transparent gaps retain the branch outline.
 for(let branch=0;branch<(species===4?13:9);branch++){
  const ax=22+branch*(species===4?33:48),ay=151+(rng()-.5)*24,bx=ax+75,by=45+rng()*65;
  x.strokeStyle='#726244';x.lineWidth=2.6;x.beginPath();x.moveTo(ax,ay);x.quadraticCurveTo(bx-20,ay,bx,by);x.stroke();
  for(let k=0;k<30;k++){
   const t=k/30,px=ax+(bx-ax)*t,py=ay+(by-ay)*t,a=Math.atan2(by-ay,bx-ax);
   const count=species===4?9:7;
   for(let j=0;j<count;j++){const side=j%2?1:-1,angle=a+side*(.35+rng()*1.4),length=species===4?16+rng()*27:19+rng()*32;
    x.strokeStyle=['#416334','#78934f','#a5ae69','#597a3c'][k%4];x.lineWidth=1.2+rng()*1.1;x.beginPath();x.moveTo(px,py);x.quadraticCurveTo(px+Math.cos(angle)*length*.65,py+Math.sin(angle)*length*.5,px+Math.cos(angle)*length,py+Math.sin(angle)*length);x.stroke();
   }
  }
 }
 const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;return t;
}
// All levels keep every branch tier and the terminal crown. Only twig
// density changes; distance must never turn a leafy tree into a bare pole.
function foliageCluster(parts,center,width,height,rng,cards=3){
 for(let i=0;i<cards;i++){const g=new THREE.PlaneGeometry(width,height);g.rotateY(i*Math.PI/cards+rng()*.5);g.rotateX((rng()-.5)*1.7);g.rotateZ((rng()-.5)*.5);g.translate(...center.toArray());parts.push(g);}
}
function finishTree(wood,leaves){const result={wood:mergeGeometries(wood),needles:mergeGeometries(leaves)};[...wood,...leaves].forEach(g=>g.dispose());return result;}
function trunkGeometry(height,radius){
 const g=scaleBarkUV(new THREE.CylinderGeometry(.105,radius,height,12,18),height,radius);g.translate(0,height/2-.42,0);const p=g.attributes.position;
 for(let i=0;i<p.count;i++){const y=p.getY(i),flare=1+Math.pow(Math.max(0,1-y/2),3)*.65;p.setX(i,p.getX(i)*flare+Math.sin(y/height*2.4)*.22);p.setZ(i,p.getZ(i)*flare+Math.sin(y/height*4)*.11);}g.computeVertexNormals();return g;
}
function pineGeometry(variant,lod){
 // Mature Scots pines: long clean trunk, broken lower boughs, and an
 // irregular, layered upper crown rather than a regular Christmas cone.
 const rng=randomSource(126),wood=[],leaves=[],height=34;
 wood.push(trunkGeometry(height,.57));
 for(let i=0;i<8;i++){const a=i*2.399,y=8+rng()*12;wood.push(branchGeometry(new THREE.Vector3(.1,y,0),new THREE.Vector3(Math.cos(a)*(.3+rng()*.55),y-.18,Math.sin(a)*(.3+rng()*.55)),.06));}
 for(let level=0;level<6;level++){
  const fraction=level/5,y=21+fraction*11+(rng()-.5),reach=(level===0?3.6:5.9)*Math.pow(1-fraction*.82,.40);
  const arms=level===5?4:6;
  for(let arm=0;arm<arms;arm++){
   const angle=arm/arms*Math.PI*2+level*2.399+rng()*.55,r=reach*(.72+rng()*.4),start=new THREE.Vector3(.15,y,0),elbow=new THREE.Vector3(Math.cos(angle)*r*.62,y-.6-rng()*.5,Math.sin(angle)*r*.62),end=new THREE.Vector3(Math.cos(angle)*r,y+.25+rng()*.9,Math.sin(angle)*r);
   wood.push(branchGeometry(start,elbow,.12*(1-fraction*.55)),branchGeometry(elbow,end,.065));
   for(let j=0;j<4;j++){
    const a=angle+(j%2?-.55:.55),pt=elbow.clone().lerp(end,.18+j*.26),fork=pt.clone().add(new THREE.Vector3(Math.cos(a)*.9,.25,Math.sin(a)*.9));wood.push(branchGeometry(pt,fork,.025));
    // Mostly horizontal bough fans, with a vertical spray to conceal the
    // card edge when seen from the shore or directly underneath a tree.
    for(let k=0;k<(lod===0?3:2);k++){const card=new THREE.PlaneGeometry(2.1+r*.12,1.15);card.rotateX(k===0?-Math.PI/2:-.35);card.rotateY(a+k*1.8);card.rotateZ((rng()-.5)*.35);card.translate(...fork.toArray());leaves.push(card);}
   }
  }
 }
 foliageCluster(leaves,new THREE.Vector3(.15,33.2,0),2.5,1.8,rng,4);
 return finishTree(wood,leaves);
}
export function leafTexture(species){
 const c=document.createElement('canvas');c.width=c.height=256;const ctx=c.getContext('2d'),rng=randomSource(species*77);
 for(let i=0;i<145;i++){const x=20+rng()*216,y=15+rng()*225,r=5+rng()*11;ctx.save();ctx.translate(x,y);ctx.rotate(rng()*6.28);ctx.fillStyle=['#799751','#5f843e','#a2ad65','#426b37'][i%4];ctx.beginPath();
  if(species===6){for(let j=0;j<18;j++){const a=j/18*Math.PI*2,k=j%2?.68:1;ctx.lineTo(Math.cos(a)*r*k,Math.sin(a)*r*1.4*k);}}else{ctx.ellipse(0,0,r*(species===7?.45:.72),r,0,0,Math.PI*2);}ctx.fill();ctx.strokeStyle='#a8b97a';ctx.lineWidth=.6;ctx.beginPath();ctx.moveTo(0,-r);ctx.lineTo(0,r);ctx.stroke();ctx.restore();}
 const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;return t;
}
export function birchTexture(){return treeBarkMaps(true).map;}
function broadleafGeometry(species,lod){
 const rng=randomSource(800+species),wood=[],leaves=[],height=species===6?14:17,arms=16;
 wood.push(branchGeometry(new THREE.Vector3(),new THREE.Vector3(.24,height*.84,0),species===6?.38:.23));
 for(let i=0;i<arms;i++){
  const a=i*2.399,y=height*(.36+.49*i/arms),reach=(species===6?4.5:species===7?3.3:2.9)*Math.pow(1-i/arms*.8,.5),start=new THREE.Vector3(.1,y,0),end=new THREE.Vector3(Math.cos(a)*reach,y+1.6,Math.sin(a)*reach);
  wood.push(branchGeometry(start,end,.09*(1-i/arms*.7)));
  for(let j=0;j<(lod===0?5:3);j++){
   const pt=start.clone().lerp(end,.45+j/(lod===0?4:2)*.65);pt.add(new THREE.Vector3((rng()-.5)*1.5,(rng()-.5)*1.4,(rng()-.5)*1.5));
   foliageCluster(leaves,pt,2.4,2.5,rng,lod===0?3:2);
  }
 }
 foliageCluster(leaves,new THREE.Vector3(.24,height-.3,0),2.5,2.7,rng,4);
 const result=finishTree(wood,leaves);result.wood.scale(1.55,1.7,1.55);result.needles.scale(1.55,1.7,1.55);return result;
}
function spruceGeometry(lod){
 const rng=randomSource(78),wood=[trunkGeometry(30,.48)],leaves=[];
 // Spruce branches are deliberately uneven: different tier heights, ragged
 // radial spacing and drooping tips break the procedural Christmas-tree cone.
 for(let level=0;level<19;level++){
  const t=level/19,y=2.1+t*27+rng()*.72,r=4.5*Math.pow(1-t,1.04)+.14+rng()*.22,arms=6+(level%3===0?1:0);
  for(let arm=0;arm<arms;arm++){
   const a=arm/arms*Math.PI*2+level*2.4+(rng()-.5)*.55,start=new THREE.Vector3((rng()-.5)*.10,y,(rng()-.5)*.10),length=r*(.78+rng()*.42),end=new THREE.Vector3(Math.cos(a)*length,y-.48-rng()*.75,Math.sin(a)*length);wood.push(branchGeometry(start,end,.065*(1-t*.8)));
   for(let j=0;j<4;j++){
    const pt=start.clone().lerp(end,.20+j*.24);pt.y+= (rng()-.5)*.18;
    for(let k=0;k<(lod===0?3:2);k++){const g=new THREE.PlaneGeometry(1.65+r*.25,1.72+rng()*.38);g.rotateZ(-.22+(rng()-.5)*.22);g.rotateX(k===0?-1.1+(rng()-.5)*.24:.28+(rng()-.5)*.25);g.rotateY(a+k*1.5+(rng()-.5)*.28);g.translate(pt.x,pt.y-.1,pt.z);leaves.push(g);}
   }
  }
 }
 foliageCluster(leaves,new THREE.Vector3(0,29.5,0),.65,1.9,rng,3);
 return finishTree(wood,leaves);
}
export function createTreeGeometry(species,detail=0){return species<4?pineGeometry(species,detail):species===4?spruceGeometry(detail):broadleafGeometry(species,detail);}
function treeImpostor(species){
 const parts=[];for(let i=0;i<3;i++){const g=new THREE.PlaneGeometry(24,48);g.translate(0,24,0);g.rotateY(i*Math.PI/3);const uv=g.attributes.uv;for(let j=0;j<uv.count;j++)uv.setX(j,(species+uv.getX(j))/8);parts.push(g);}const g=mergeGeometries(parts);parts.forEach(p=>p.dispose());return g;
}
export function buildForest(group){
 const rng=randomSource(),bark=barkTexture(),woodMat=treeBarkMaterial(),needleMat=new THREE.MeshStandardMaterial({roughness:1,color:0xc5d5ac,map:needleTexture(),alphaTest:.38,side:THREE.DoubleSide});
 const spruceMat=needleMat.clone();spruceMat.map=needleTexture(4);
 const whiteBark=treeBarkMaterial(true),leafMats=[5,6,7].map(v=>new THREE.MeshStandardMaterial({roughness:1,map:leafTexture(v),color:0xc3d1a5,alphaTest:.35,side:THREE.DoubleSide}));
 const atlas=new THREE.TextureLoader().load('./assets/forest/tree-crowns.png');atlas.colorSpace=THREE.SRGBColorSpace;atlas.anisotropy=4;const farMat=new THREE.MeshStandardMaterial({roughness:1,map:atlas,alphaTest:.32,side:THREE.DoubleSide});
 const pineTypes=[0,1].map(l=>createTreeGeometry(0,l)),types=Array.from({length:8},(_,v)=>v<4?pineTypes:[0,1].map(l=>createTreeGeometry(v,l))),farTypes=Array.from({length:8},(_,v)=>treeImpostor(v));
 const blocksBenchView=(x,z)=>Math.abs(x-campLayout.bench.x)<2.5&&z>campLayout.bench.z+1&&z<41;
 const trees=[],colliders=[],cells=new Map(),batches=[],speciesNames=['pine','pine','pine','pine','spruce','birch','oak','ash'];
 // Stratified irregular placement makes both banks continuous without costly
 // pairwise searches. The outer belt is cheap geometry from the start.
 for(let gz=-440;gz<=600;gz+=10)for(let gx=-510;gx<=530;gx+=10){
  const x=gx+(rng()-.5)*8,z=gz+(rng()-.5)*8,d=Math.hypot(x,z-30),near=d<300;
  if(d>610||rng()>(near?.83:.56))continue;
  const clear=Math.hypot(x/1.12,z-6)<29&&!(z>26&&Math.abs(x)<27);
  if(serviceClearance(x,z,1)||blocksBenchView(x,z)||Math.abs(x-campLayout.bench.x)<3&&Math.abs(z-campLayout.bench.z)<2.1||Math.hypot(x-campLayout.fire.x,z-campLayout.fire.z)<5.4||Math.hypot(x-campLayout.gazebo.x,z-campLayout.gazebo.z)<5.8||clear||lakeDistance(x,z)<1.055||pathDistance(x,z)<2.1||Math.abs(x)<barSite.width/2+1.2&&Math.abs(z-barSite.z)<10)continue;
  const choice=rng(),variant=choice<.48?Math.floor(rng()*4):choice<.63?4:choice<.79?5:choice<.91?6:7,scale=.91+rng()*.34;
  const t={x,z,y:groundHeight(x,z)-.22,variant,scale,yaw:rng()*Math.PI*2,near,species:speciesNames[variant]};t.id="tree:"+trees.length;t.slots=[];trees.push(t);
  const key=near?`${Math.floor(x/64)},${Math.floor(z/64)},${variant<4?0:variant},near`:`far,${x<0?0:1},${z<40?0:1},${variant<4?0:variant}`;if(!cells.has(key))cells.set(key,[]);cells.get(key).push(t);
  if(near)colliders.push({minX:x-.52*scale,maxX:x+.52*scale,minZ:z-.52*scale,maxZ:z+.52*scale,minY:t.y,maxY:t.y+34*scale,worldId:t.id,label:speciesNames[variant]+' trunk'});
 }
 // Shore woodland between the fire and gazebo; the central route is kept
 // clear all the way down the bank, not merely a gap between tree trunks.
 // The conifer on the left of the approach sits farther left and inland.
 for(const [x,z,v]of [[-21,29,5],[-16,30,0],[-10,30,5],[0,32,1],[11,30,5],[19,31,0],[25,32,6],[-27,34,4],[-18,35,7],[24,35,5],[-7.2,24.2,0],[-.8,24.2,1],[-23,27,0],[-12,32,1],[16.5,29,4],[17,34,1],[29,32,2],[-31,30,0]]){
  if(serviceClearance(x,z,1)||blocksBenchView(x,z)||lakeDistance(x,z)<1.035||Math.abs(x-campLayout.bench.x)<3&&Math.abs(z-campLayout.bench.z)<2.1)continue;
  const t={x,z,y:groundHeight(x,z)-.22,variant:v,scale:1.02+rng()*.20,yaw:rng()*6.28,near:true,species:speciesNames[v],shore:true};t.id="tree:"+trees.length;t.slots=[];trees.push(t);
  const key=`${Math.floor(x/64)},${Math.floor(z/64)},${v<4?0:v},near`;if(!cells.has(key))cells.set(key,[]);cells.get(key).push(t);colliders.push({minX:x-.58,maxX:x+.58,minZ:z-.58,maxZ:z+.58,minY:t.y,maxY:t.y+40,worldId:t.id,label:'shore tree'});
 }
 for(const list of cells.values()){
  const cell=new THREE.Group(),lod=new THREE.LOD(),center=new THREE.Vector3(list.reduce((s,t)=>s+t.x,0)/list.length,0,list.reduce((s,t)=>s+t.z,0)/list.length);cell.position.copy(center);group.add(cell);cell.add(lod);lod.autoUpdate=false;
  const species=list[0].variant;
  for(const level of list[0].near?[0,1,2]:[2]){
   const cluster=new THREE.Group(),g=level===2?{wood:null,needles:farTypes[species]}:types[species][level],foliage=level===2?farMat:species<4?needleMat:species===4?spruceMat:leafMats[species-5];
   for(const [geometry,material]of [[g.wood,species===5?whiteBark:woodMat],[g.needles,foliage]]){
    if(!geometry)continue;const batch=new THREE.InstancedMesh(geometry,material,list.length);batch.castShadow=false;batch.receiveShadow=true;
    list.forEach((t,i)=>{dummy.position.set(t.x-center.x,t.y,t.z-center.z);const gx=(groundHeight(t.x+.6,t.z)-groundHeight(t.x-.6,t.z))/1.2,gz=(groundHeight(t.x,t.z+.6)-groundHeight(t.x,t.z-.6))/1.2;
     t.leanX=THREE.MathUtils.clamp(gz*.12,-.065,.065)+Math.sin(t.yaw)*.009;t.leanZ=THREE.MathUtils.clamp(-gx*.12,-.065,.065)+Math.cos(t.yaw)*.009;
     dummy.quaternion.setFromEuler(leanEuler.set(t.leanX,0,t.leanZ)).multiply(yawQuaternion.setFromAxisAngle(up,t.yaw));dummy.scale.set(t.scale*(t.variant<4?.94+(t.variant%3)*.06:1),t.scale*(t.variant<4?1+(t.variant%3)*.055:1),t.scale);dummy.updateMatrix();batch.setMatrixAt(i,dummy.matrix);if(material===foliage)batch.setColorAt(i,new THREE.Color().setHSL(.24+(i%5)*.013,.16+(i%3)*.05,.78+(i%4)*.035));});batch.userData.treeFoliage=material===foliage;list.forEach((t,i)=>t.slots.push({mesh:batch,index:i}));batch.userData.worldIds=list.map(t=>t.id);batch.computeBoundingSphere();
    if(level<2){geometry.computeBoundingBox();const matrices=batch.instanceMatrix.array.slice(),boxes=list.map((t,i)=>{const local=new THREE.Matrix4().fromArray(matrices,i*16),b=geometry.boundingBox.clone().applyMatrix4(local);b.min.x+=center.x;b.max.x+=center.x;b.min.z+=center.z;b.max.z+=center.z;return b.expandByScalar(.4);});batch.userData.treeCull={matrices,colors:batch.instanceColor?.array.slice(),boxes,ids:null,revision:-1};batch.instanceMatrix.setUsage(THREE.DynamicDrawUsage);if(batch.instanceColor)batch.instanceColor.setUsage(THREE.DynamicDrawUsage);}
    cluster.add(batch);
   }lod.addLevel(cluster,[0,100,290][level],.12);
  }batches.push({cell,lod,near:list[0].near});
 }
 // Stable baked canopy shadows: independent of LOD and camera position.
 const shadowCanvas=document.createElement('canvas');shadowCanvas.width=shadowCanvas.height=128;const sx=shadowCanvas.getContext('2d'),sr=randomSource(777);
 for(let i=0;i<38;i++){const px=24+sr()*80,py=24+sr()*80,r=10+sr()*22,g=sx.createRadialGradient(px,py,0,px,py,r);g.addColorStop(0,'rgba(0,0,0,.20)');g.addColorStop(1,'rgba(0,0,0,0)');sx.fillStyle=g;sx.fillRect(px-r,py-r,r*2,r*2);}
 const shadowMap=new THREE.CanvasTexture(shadowCanvas),shadowMaterial=new THREE.MeshBasicMaterial({map:shadowMap,color:0x203027,transparent:true,opacity:.40,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2}),shadowParts=[];let shadowVertexCount=0;
 for(const t of trees.filter(t=>t.near)){
  const cx=t.x+4.5*t.scale,cz=t.z+2.4*t.scale;if(lakeDistance(cx,cz)<1.01)continue;
  const g=new THREE.PlaneGeometry((t.variant===6?11:8)*t.scale,8*t.scale,3,3);g.rotateX(-Math.PI/2);g.translate(cx,0,cz);const p=g.attributes.position;for(let i=0;i<p.count;i++)p.setY(i,groundHeight(p.getX(i),p.getZ(i))+.025);t.shadowStart=shadowVertexCount;t.shadowCount=g.attributes.position.count;shadowVertexCount+=t.shadowCount;shadowParts.push(g);
 }
 const shadows=new THREE.Mesh(mergeGeometries(shadowParts),shadowMaterial);shadows.name='Permanent soft forest canopy shadows';shadows.renderOrder=1;group.add(shadows);shadowParts.forEach(g=>g.dispose());
 const frustum=new THREE.Frustum(),projection=new THREE.Matrix4(),lastProjection=new THREE.Matrix4();let cullRevision=0,lastQuality='',lastCull=null;
 function compact(batch,full){const c=batch.userData.treeCull;if(!c)return;
  if(full){if(c.ids!==null){batch.instanceMatrix.array.set(c.matrices);batch.instanceMatrix.needsUpdate=true;if(c.colors){batch.instanceColor.array.set(c.colors);batch.instanceColor.needsUpdate=true;}}batch.count=c.boxes.length;c.ids=null;c.revision=-1;return;}
  if(c.revision===cullRevision)return;c.revision=cullRevision;const ids=[];for(let i=0;i<c.boxes.length;i++)if(frustum.intersectsBox(c.boxes[i]))ids.push(i);
  if(c.ids&&ids.length===c.ids.length&&ids.every((id,i)=>id===c.ids[i]))return;
  for(let i=0;i<ids.length;i++){const source=ids[i];for(let k=0;k<16;k++)batch.instanceMatrix.array[i*16+k]=c.matrices[source*16+k];if(c.colors)for(let k=0;k<3;k++)batch.instanceColor.array[i*3+k]=c.colors[source*3+k];}
  batch.count=ids.length;batch.instanceMatrix.needsUpdate=true;if(c.colors)batch.instanceColor.needsUpdate=true;c.ids=ids;
 }
 function update(camera,quality,cull=true){
  projection.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);const changed=!projection.equals(lastProjection)||quality!==lastQuality;if(!changed&&lastCull===cull)return;lastCull=cull;if(changed){lastProjection.copy(projection);lastQuality=quality;frustum.setFromProjectionMatrix(projection);cullRevision++;}
  for(const {cell,lod,near}of batches){cell.visible=camera.position.distanceTo(cell.position)<850;if(cell.visible&&near){const distance=camera.position.distanceTo(cell.position),limits=quality==='low'?[65,245]:quality==='high'?[125,355]:[100,300],index=distance<limits[0]?0:distance<limits[1]?1:2;
    for(let i=0;i<lod.levels.length;i++){const level=lod.levels[i].object;level.visible=i===index;if(level.visible)for(const batch of level.children)compact(batch,!cull);}
   }
  }
 }
 return{trees,colliders,batches,shadows,update,invalidate(){lastProjection.elements.fill(0);},get assetsReady(){return !!atlas.image?.complete;},stats:{treeCount:trees.length,nearTrees:trees.filter(t=>t.near).length,instancedCells:batches.length,lodLevels:3,species:Object.fromEntries([...new Set(speciesNames)].map(s=>[s,trees.filter(t=>t.species===s).length]))}};
}
