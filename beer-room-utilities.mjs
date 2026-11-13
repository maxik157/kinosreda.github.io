import * as THREE from './three.module.js';
import {mergeGeometries} from './BufferGeometryUtils.js';
import {barSite,toiletSite,woodshedSite} from './beer-room-site.mjs';
import {groundHeight,randomSource} from './beer-room-landscape.mjs';
import {barkTexture} from './beer-room-forest.mjs';

function grainTexture(end=false){
 const c=document.createElement('canvas');c.width=c.height=256;const ctx=c.getContext('2d'),rng=randomSource(end?887:965);ctx.fillStyle=end?'#d4c2a0':'#967247';ctx.fillRect(0,0,256,256);
 if(end){for(let i=0;i<36;i++){ctx.beginPath();ctx.strokeStyle=i%3?'rgba(87,56,26,.34)':'rgba(241,218,163,.42)';ctx.lineWidth=.6+rng();const r=4+i*3.7;for(let j=0;j<=80;j++){const a=j/80*Math.PI*2,p=r*(1+.035*Math.sin(a*7+i));const x=129+Math.cos(a)*p,y=125+Math.sin(a)*p;if(j)ctx.lineTo(x,y);else ctx.moveTo(x,y);}ctx.stroke();}for(let i=0;i<7;i++){const a=rng()*6.28;ctx.strokeStyle='#755333';ctx.beginPath();ctx.moveTo(128+Math.cos(a)*88,128+Math.sin(a)*88);ctx.lineTo(128+Math.cos(a)*126,128+Math.sin(a)*126);ctx.stroke();}}
 else{for(let i=0;i<350;i++){const x=rng()*256;ctx.beginPath();ctx.strokeStyle=i%4?'rgba(54,34,19,.20)':'rgba(239,204,142,.24)';ctx.lineWidth=.5+rng()*1.6;ctx.moveTo(x,0);for(let y=0;y<=256;y+=12)ctx.lineTo(x+Math.sin(y*.035+i)*2.4,y);ctx.stroke();}for(let i=0;i<9;i++){ctx.strokeStyle='rgba(43,28,16,.36)';ctx.beginPath();ctx.ellipse(rng()*256,rng()*256,2+rng()*3,7+rng()*7,0,0,6.28);ctx.stroke();}}
 const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;t.wrapS=t.wrapT=THREE.RepeatWrapping;t.anisotropy=4;return t;
}
export function buildCampUtilities(parent){
 const group=new THREE.Group();group.name='Camp sanitary cabin and firewood storage';parent.add(group);const colliders=[],surfaces=[],rng=randomSource(5172);
 const grain=grainTexture(),ends=grainTexture(true),bark=barkTexture();
 const timber=new THREE.MeshStandardMaterial({map:grain,color:0x87735c,roughness:.94}),trim=new THREE.MeshStandardMaterial({map:grain,color:0xdba16b,roughness:.84}),dark=new THREE.MeshStandardMaterial({map:grain,color:0x4a3b2e,roughness:1}),iron=new THREE.MeshStandardMaterial({color:0x2d302d,metalness:.5,roughness:.65}),stone=new THREE.MeshStandardMaterial({color:0x77776a,roughness:1,flatShading:true});
 const staticParts=new Map();
 function box(w,h,d,x,y,z,mat=timber,root=group,batch=true){const geo=new THREE.BoxGeometry(w,h,d),m=new THREE.Mesh(geo,mat);m.position.set(x,y,z);m.castShadow=m.receiveShadow=true;root.add(m);if(batch){if(!staticParts.has(root))staticParts.set(root,[]);staticParts.get(root).push(m);}return m;}
 function beam(a,b,width,depth,mat,root){const m=box(width,a.distanceTo(b),depth,0,0,0,mat,root);m.position.copy(a).add(b).multiplyScalar(.5);m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),b.clone().sub(a).normalize());return m;}
 function solid(root,x,y,z,w,h,d,label){root.updateWorldMatrix(true,false);const bounds=new THREE.Box3(new THREE.Vector3(x-w/2,y-h/2,z-d/2),new THREE.Vector3(x+w/2,y+h/2,z+d/2)).applyMatrix4(root.matrixWorld);colliders.push({localRoot:root,localBox:new THREE.Box3(new THREE.Vector3(x-w/2,y-h/2,z-d/2),new THREE.Vector3(x+w/2,y+h/2,z+d/2)),minX:bounds.min.x,maxX:bounds.max.x,minZ:bounds.min.z,maxZ:bounds.max.z,minY:bounds.min.y,maxY:bounds.max.y,owner:root,label,overlaps(px,pz,r){const p=root.worldToLocal(new THREE.Vector3(px,root.position.y,pz));const dx=p.x-Math.max(x-w/2,Math.min(x+w/2,p.x)),dz=p.z-Math.max(z-d/2,Math.min(z+d/2,p.z));const scale=root.getWorldScale(new THREE.Vector3());return (dx*scale.x)**2+(dz*scale.z)**2<r*r-1e-9;}});}
 function world(root,x,y,z){root.updateWorldMatrix(true,false);return root.localToWorld(new THREE.Vector3(x,y,z));}
 const cabin=new THREE.Group();cabin.name='A-frame woodland toilet';cabin.position.set(toiletSite.x,groundHeight(toiletSite.x,toiletSite.z),toiletSite.z);cabin.rotation.y=toiletSite.yaw;group.add(cabin);
 const w=toiletSite.width,h=toiletSite.height,d=toiletSite.depth;
 // Three narrow floor boards around the receiving pit; no false floor over it.
 box(w-.12,.14,1.24,0,.075,.48,timber,cabin);box(.38,.14,.90,-.77,.075,-.60,timber,cabin);box(.38,.14,.90,.77,.075,-.60,timber,cabin);box(.10,.14,d,0,.075,0,timber,cabin);
 for(const x of [-.96,.96]){box(.16,.18,d-.08,x,-.015,0,dark,cabin);for(const z of [-.83,.83]){const rock=new THREE.Mesh(new THREE.DodecahedronGeometry(.24,0),stone);rock.position.set(x,-.09,z);rock.scale.set(1.1,.6,.8);cabin.add(rock);}}
 for(const side of [-1,1]){
  const count=20,run=Math.hypot(w/2,h),angle=Math.atan2(h,-side*w/2);
  for(let i=0;i<count;i++){const t=(i+.5)/count,m=box(run/count+.022,.065,d+.26,side*w/2*(1-t),h*t,0,timber,cabin);m.rotation.z=angle;}
  for(const z of [-d/2-.06,d/2+.06])beam(new THREE.Vector3(side*(w/2+.08),-.04,z),new THREE.Vector3(-side*.085,h+.20,z),.15,.17,trim,cabin);
  for(const y of [.16,.85,1.55,2.25,2.95]){const half=w/2*(1-y/h);box(half*2,.14,.07,0,y,-d/2-.01,dark,cabin);}
 }
 // Front cladding follows the triangular silhouette and leaves a full door opening.
 for(let y=.19;y<h-.08;y+=.17){const half=w/2*(1-y/h)-.04;if(y<2.12){const sideWidth=half-.43;if(sideWidth>0)for(const sign of [-1,1])box(sideWidth,.16,.09,sign*(.43+sideWidth/2),y,d/2,timber,cabin);}else if(half>.03)box(half*2,.16,.09,0,y,d/2,timber,cabin);}
 // Solid rear triangle of horizontal boards.
 for(let y=.19;y<h-.08;y+=.17){const half=w/2*(1-y/h)-.035;if(half>.03)box(half*2,.16,.09,0,y,-d/2,timber,cabin);}
 const hinge=new THREE.Group();hinge.name='Toilet hinged plank door';hinge.position.set(-.43,.15,d/2+.06);cabin.add(hinge);
 for(let i=0;i<5;i++)box(.164,1.94,.075,.086+i*.168,.97,0,i%2?timber:dark,hinge);
 for(const y of [.18,1.70])box(.81,.105,.035,.42,y,-.06,trim,hinge);
 beam(new THREE.Vector3(.09,.22,-.07),new THREE.Vector3(.75,1.67,-.07),.075,.03,trim,hinge);
 for(const y of [.35,1.62]){box(.15,.055,.025,.02,y,.055,iron,hinge);const pin=new THREE.Mesh(new THREE.CylinderGeometry(.017,.017,.13,8),iron);pin.position.set(0,y,.06);hinge.add(pin);}
 const handle=new THREE.Mesh(new THREE.TorusGeometry(.065,.013,8,20,Math.PI*1.65),iron);handle.rotation.z=-.45;handle.position.set(.72,.94,.075);hinge.add(handle);
 const heart=new THREE.Shape();heart.moveTo(0,0);heart.bezierCurveTo(-.19,.14,-.14,.30,0,.19);heart.bezierCurveTo(.14,.30,.19,.14,0,0);const vent=new THREE.Mesh(new THREE.ShapeGeometry(heart),new THREE.MeshBasicMaterial({color:0x16140e,side:THREE.DoubleSide}));vent.position.set(0,2.30,d/2+.055);cabin.add(vent);
 // A shaped wooden seat with a genuine aperture, over a dark receiving pit.
 const seatShape=new THREE.Shape();seatShape.moveTo(-.68,-.39);seatShape.lineTo(.68,-.39);seatShape.lineTo(.68,.39);seatShape.lineTo(-.68,.39);seatShape.closePath();const hole=new THREE.Path();hole.absellipse(0,0,.17,.225,0,Math.PI*2,true);seatShape.holes.push(hole);
 const seatGeo=new THREE.ExtrudeGeometry(seatShape,{depth:.075,bevelEnabled:true,bevelSegments:2,steps:1,bevelSize:.012,bevelThickness:.008,curveSegments:32});seatGeo.rotateX(-Math.PI/2);const seat=new THREE.Mesh(seatGeo,trim);seat.position.set(0,.49,-.65);seat.castShadow=seat.receiveShadow=true;cabin.add(seat);
 for(const x of [-.62,.62])box(.12,.41,.72,x,.29,-.65,dark,cabin);box(1.34,.4,.08,0,.29,-.99,dark,cabin);box(.43,.4,.08,-.45,.29,-.3,dark,cabin);box(.43,.4,.08,.45,.29,-.3,dark,cabin);
 const pit=new THREE.Mesh(new THREE.CylinderGeometry(.19,.19,.8,24,1,true),new THREE.MeshStandardMaterial({color:0x12100c,roughness:1,side:THREE.DoubleSide}));pit.position.set(0,.12,-.65);cabin.add(pit);const black=new THREE.Mesh(new THREE.CircleGeometry(.185,32),new THREE.MeshBasicMaterial({color:0x080705}));black.rotation.x=-Math.PI/2;black.position.set(0,.20,-.65);cabin.add(black);
 // Roll, shelf, metal hook and vent pipe make the interior readable at player distance.
 box(.34,.04,.22,-.46,1.02,-.85,timber,cabin);const roll=new THREE.Mesh(new THREE.CylinderGeometry(.064,.064,.12,24),new THREE.MeshStandardMaterial({color:0xded6bc,roughness:1}));roll.rotation.z=Math.PI/2;roll.position.set(-.45,1.105,-.85);cabin.add(roll);box(.08,.16,.005,-.45,1.0,-.775,new THREE.MeshStandardMaterial({color:0xded6bc,roughness:1}),cabin);
 const pipe=new THREE.Mesh(new THREE.CylinderGeometry(.047,.047,2.95,10),iron);pipe.position.set(.32,1.62,-d/2-.14);cabin.add(pipe);const cap=new THREE.Mesh(new THREE.ConeGeometry(.105,.07,12),iron);cap.position.set(.32,3.14,-d/2-.14);cabin.add(cap);
 // Only side/rear walls are solid; the doorway and interaction slots remain open.
 for(const x of [-1.11,1.11])solid(cabin,x,1,0,.16,2,d,'toilet side');solid(cabin,0,1,-d/2,w,2,.12,'toilet rear');solid(cabin,0,.31,-.72,1.4,.57,.82,'toilet seat cabinet');
 for(const [kind,x]of [['pee',-.22],['poop',.22]]){const button=box(.19,.23,.045,x,1.12,d/2+.12,kind==='pee'?trim:timber,hinge,false);button.position.set(kind==='pee'?.24:.57,1.20,.065);button.userData={action:'toilet-use',toiletMode:kind};button.name=kind==='pee'?'Urinate in woodland toilet':'Use woodland toilet seat';}
 cabin.userData={action:'toilet',id:'woodland-toilet'};const entry=world(cabin,0,.14,d/2+1),pee=world(cabin,0,.14,.17),poop=world(cabin,0,.14,-.55),exit=world(cabin,0,.14,d/2+1.05);
 const poses={pee:{position:pee,yaw:toiletSite.yaw,eye:1.64,pitch:-1.02},poop:{position:poop,yaw:toiletSite.yaw+Math.PI,eye:1.14,pitch:-.36}};
 let state={owner:null,mode:null,startedAt:0,duration:0},door=0,preview=false;
 const streamPoints=32,streamGeo=new THREE.BufferGeometry(),streamPos=new Float32Array((streamPoints+1)*2*3),streamIndices=[];
 streamGeo.setAttribute('position',new THREE.BufferAttribute(streamPos,3));for(let i=0;i<streamPoints;i++)streamIndices.push(i*2,i*2+1,i*2+2,i*2+1,i*2+3,i*2+2);streamGeo.setIndex(streamIndices);
 const stream=new THREE.Mesh(streamGeo,new THREE.MeshBasicMaterial({color:0xead05c,transparent:true,opacity:.77,side:THREE.DoubleSide,depthWrite:false}));stream.name='Animated urine stream visible to all players';stream.visible=false;stream.frustumCulled=false;cabin.add(stream);
 const drops=new THREE.InstancedMesh(new THREE.SphereGeometry(.008,5,4),new THREE.MeshBasicMaterial({color:0xe4c45e,transparent:true,opacity:.74}),12);drops.name='Pit splash droplets';drops.visible=false;cabin.add(drops);
 const waste=new THREE.InstancedMesh(new THREE.CapsuleGeometry(.033,.085,3,7),new THREE.MeshStandardMaterial({color:0x685137,roughness:1}),3);waste.name='Waste falling inside pit';waste.visible=false;cabin.add(waste);
 const dummy=new THREE.Object3D();
 function setState(next){state={...state,...next};if(!state.owner)state.mode=null;}
 function update(dt){door+=(Number(!!state.owner||preview)*1.55-door)*(1-Math.exp(-dt*6));hinge.rotation.y=-door;const elapsed=Math.max(0,(Date.now()-(state.startedAt||0))/1000),progress=elapsed/Math.max(1,(state.duration||8000)/1000),active=!!state.owner&&progress>.11&&progress<.9;stream.visible=active&&state.mode==='pee';drops.visible=stream.visible;waste.visible=active&&state.mode==='poop';
  if(stream.visible){const scale=cabin.getWorldScale(new THREE.Vector3()),start=new THREE.Vector3(.01/scale.x,.14+.84/scale.y,.17-.07/scale.z),end=new THREE.Vector3(0,.50,-.65),distance=start.distanceTo(end),lift=.20;
   for(let i=0;i<=streamPoints;i++){const t=i/streamPoints,x=start.x+(end.x-start.x)*t+Math.sin(elapsed*17-t*12)*.004*t,y=start.y+(end.y-start.y)*t+Math.sin(Math.PI*t)*lift,z=start.z+(end.z-start.z)*t,r=.0045*(1-t*.35);for(let side=0;side<2;side++){const n=(i*2+side)*3;streamPos[n]=x+(side?1:-1)*r;streamPos[n+1]=y;streamPos[n+2]=z;}}
   streamGeo.attributes.position.needsUpdate=true;for(let i=0;i<12;i++){const t=(elapsed*1.9+i/12)%1,a=i*2.39996;dummy.position.set(Math.cos(a)*t*.085,.51+Math.sin(t*Math.PI)*.075,-.65+Math.sin(a)*t*.10);dummy.scale.setScalar(1-t*.7);dummy.updateMatrix();drops.setMatrixAt(i,dummy.matrix);}drops.instanceMatrix.needsUpdate=true;
  }
  if(waste.visible){for(let i=0;i<3;i++){const t=(elapsed*.5+i/3)%1;dummy.position.set((i-1)*.035,.68-t*.9,-.65);dummy.rotation.set(t*2,i,0);dummy.scale.setScalar(t<.8?1:0);dummy.updateMatrix();waste.setMatrixAt(i,dummy.matrix);}waste.instanceMatrix.needsUpdate=true;}
 }
 const shed=new THREE.Group();shed.name='Triangular woodshed with mixed split firewood';shed.position.set(woodshedSite.x,groundHeight(woodshedSite.x,woodshedSite.z),woodshedSite.z);shed.rotation.y=woodshedSite.yaw;group.add(shed);
 const sw=woodshedSite.width,sh=woodshedSite.height,sd=woodshedSite.depth;
 box(sw,.16,sd,0,.08,0,dark,shed);for(const side of [-1,1]){for(const z of [-sd/2,sd/2])beam(new THREE.Vector3(side*sw/2,.08,z),new THREE.Vector3(0,sh+.10,z),.18,.19,trim,shed);const length=Math.hypot(sw/2,sh);for(let i=0;i<18;i++){const t=(i+.5)/18,m=box(length/18+.04,.06,sd+.34,side*sw/2*(1-t),sh*t+.05,0,dark,shed);m.rotation.z=Math.atan2(sh,-side*sw/2);}}
 for(let y=.20;y<sh;y+=.18){const half=sw/2*(1-y/sh);box(half*2,.175,.06,0,y,-sd/2,timber,shed);}
 const logs=[],barkMat=new THREE.MeshStandardMaterial({map:bark,color:0x8c7251,roughness:1}),endMat=new THREE.MeshStandardMaterial({map:ends,color:0xd2c8ad,roughness:1}),circles=[];
 // Settle differently sized rounds into the A-frame, then fill the remaining
 // pockets with thin branches. Each circle is checked against the sloped roof.
 for(let pass=0;pass<2;pass++)for(let attempt=0;attempt<(pass?13000:6000);attempt++){
  const radius=pass?.028+rng()*.035:.075+rng()*.10,x=(rng()-.5)*(sw-.30),y=.18+rng()*(sh-.38),half=(sw/2-.16)*(1-y/sh);
  if(y-radius<.16||Math.abs(x)+radius*1.22>half||circles.some(c=>Math.hypot(x-c.x,y-c.y)<radius+c.r+.008))continue;
  circles.push({x,y,r:radius});const length=.73+rng()*.46,geo=new THREE.CylinderGeometry(radius*(.87+rng()*.13),radius,length,7+Math.floor(rng()*5),1,false);geo.rotateX(Math.PI/2);geo.rotateZ((rng()-.5)*.12);geo.translate(x,y,.04+(rng()-.5)*.09);logs.push(geo);
 }
 // Cylinder material groups preserve bark on the sides and rings on both ends.
 const merged=mergeGeometries(logs,false),logMesh=new THREE.Mesh(merged,[barkMat,endMat,endMat]);merged.clearGroups();let offset=0;for(const geo of logs){for(const part of geo.groups)merged.addGroup(offset+part.start,part.count,part.materialIndex);offset+=geo.index.count;geo.dispose();}logMesh.name='Individually sized bark logs and end grain';logMesh.castShadow=logMesh.receiveShadow=true;shed.add(logMesh);
 const splitGeo=new THREE.CylinderGeometry(.15,.17,.87,5,1,false,0,Math.PI*1.22),splits=new THREE.InstancedMesh(splitGeo,[barkMat,endMat,endMat],12);for(let i=0;i<12;i++){dummy.position.set(-1.66+i%6*.22,.27+Math.floor(i/6)*.24,.18);dummy.rotation.set(Math.PI/2,(rng()-.5)*.10,rng()*Math.PI);dummy.scale.set(.75+rng()*.4,.8+rng()*.3,.85+rng()*.4);dummy.updateMatrix();splits.setMatrixAt(i,dummy.matrix);}splits.castShadow=splits.receiveShadow=true;shed.add(splits);shed.userData.logCount=logs.length+12;
 solid(shed,0,1.5,0,sw,3,sd,'stacked firewood');
 // Merge static boards by material within each rigid assembly, keeping the door animated.
 for(const [root,meshes]of staticParts){const batches=new Map();for(const mesh of meshes){mesh.updateMatrix();const geo=mesh.geometry.clone().applyMatrix4(mesh.matrix);if(!batches.has(mesh.material))batches.set(mesh.material,[]);batches.get(mesh.material).push(geo);mesh.removeFromParent();mesh.geometry.dispose();}for(const [mat,geos]of batches){const merged=new THREE.Mesh(mergeGeometries(geos),mat);merged.name='Batched weathered timber';merged.castShadow=merged.receiveShadow=true;root.add(merged);geos.forEach(g=>g.dispose());}}
 update(0);
 function refreshPoses(){cabin.updateWorldMatrix(true,true);entry.copy(world(cabin,0,.14,d/2+1));exit.copy(world(cabin,0,.14,d/2+1.05));pee.copy(world(cabin,0,.14,.17));poop.copy(world(cabin,0,.68,-.55)).add(new THREE.Vector3(0,-.54,0));poses.pee.yaw=cabin.rotation.y;poses.poop.yaw=cabin.rotation.y+Math.PI;}
 return{refreshPoses,group,cabin,shed,colliders,surfaces,hinge,stream,drops,waste,poses,entry,exit,update,setState,setPreview(v){preview=v;},get state(){return state;}};
}
