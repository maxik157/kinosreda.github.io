import * as THREE from './three.module.js';
import {barSite} from './beer-room-site.mjs';
import {RoundedBoxGeometry} from './RoundedBoxGeometry.js';
export const shelfLayout={levels:[.62,1.06,1.42],modules:[
 {id:'back-left',x:-4.7,z:-7.85,yaw:0,width:4.4,columns:12},
 {id:'back-centre',x:0,z:-7.85,yaw:0,width:4.4,columns:12},
 {id:'back-right',x:4.7,z:-7.85,yaw:0,width:4.4,columns:12},
 {id:'left-wing',x:-7.38,z:-4.4,yaw:Math.PI/2,width:4.2,columns:9},
 {id:'right-wing',x:7.38,z:-4.4,yaw:-Math.PI/2,width:4.2,columns:9}
]};
// One shared local coordinate system for every counter accessory. Keeping the
// stool, mat and glass Z positions here prevents them drifting when the bar
// width/depth changes.
export const barLayout={z:barSite.z-5.1, width:8.8, counterDepth:1.05, stoolZ:1.12, matZ:-.30, serviceXs:[-3.5,0,3.5], stoolXs:[-3.4,-1.7,0,1.7,3.4]};
export function shelfSlot(index){
 let remaining=index;
 for(const m of shelfLayout.modules){const capacity=m.columns*shelfLayout.levels.length;if(remaining<capacity){const row=Math.floor(remaining/m.columns),col=remaining%m.columns,offset=(col-(m.columns-1)/2)*(m.width-.42)/m.columns;return{x:m.x+Math.cos(m.yaw)*offset,y:shelfLayout.levels[row],z:barSite.z+m.z-Math.sin(m.yaw)*offset,yaw:m.yaw,module:m.id,row,col};}remaining-=capacity;}
 // Additional catalogue entries occupy another accessible row on new modules,
 // rather than stacking into unreachable levels or replacing existing beers.
 throw new Error('Для новой коллекции требуется дополнительная секция');
}
export function buildInterior(worldScene,renderer){
 const scene=new THREE.Group();scene.name="Bar construction layout";worldScene.add(scene);
 const colliders=[],textures=[],tables=[],chairs=[],stools=[],doors=[],surfaces=[],shellMeshes=[],shellColliders=[];
 const loader=new THREE.TextureLoader();
 const tex=(url,x,y)=>{const t=loader.load(url);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.set(x,y);t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());textures.push(t);return t;};
 const wood=new THREE.MeshStandardMaterial({color:0xb28b60,map:tex('./assets/textures/wood-floor.jpg',2,1),roughness:.55});
 const metal=new THREE.MeshStandardMaterial({color:0x292a2a,metalness:.7,roughness:.38});
 const brass=new THREE.MeshStandardMaterial({color:0xb88d4a,metalness:.7,roughness:.34});
 const leather=new THREE.MeshStandardMaterial({color:0x33524c,roughness:.82});
 function box(w,h,d,x,y,z,material,rounded=0,parent=scene){const mesh=new THREE.Mesh(rounded?new RoundedBoxGeometry(w,h,d,2,Math.min(rounded,w/3,h/3,d/3)):new THREE.BoxGeometry(w,h,d),material);mesh.position.set(x,y,z);mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);return mesh;}
 function shellBox(...args){const mesh=box(...args);mesh.castShadow=false;mesh.userData.openSpaceShell=true;shellMeshes.push(mesh);return mesh;}
 function surface(mesh,topY,kind,action){mesh.userData.surface={topY,kind,action};surfaces.push({mesh,topY,kind,action});return mesh;}
 function collider(x,z,w,d,label){colliders.push({minX:x-w/2,maxX:x+w/2,minZ:z-d/2,maxZ:z+d/2,label});}
 function cylinder(r1,r2,h,x,y,z,material,parent=scene){const m=new THREE.Mesh(new THREE.CylinderGeometry(r1,r2,h,32),material);m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;}
 const floorMat=new THREE.MeshStandardMaterial({color:0xbca185,map:tex('./assets/textures/wood-floor.jpg',6,5),roughness:.72});
 surface(box(16,.2,17,0,-.11,0,floorMat),-.01,'floor');
 const plasterMap=tex('./assets/textures/stucco-wall.jpg',5,2);
 const plaster=new THREE.MeshStandardMaterial({color:0xb7b3a4,map:plasterMap,bumpMap:plasterMap,bumpScale:.025,roughness:.95});
 shellBox(16,7,.22,0,3.5,-8.4,plaster);shellBox(.22,7,17,-8,3.5,0,plaster);shellBox(.22,7,17,8,3.5,0,plaster);shellBox(16,7,.22,0,3.5,8.4,plaster);
 const ceilingMap=tex('./assets/textures/wood-floor.jpg',5,4);shellBox(16,.18,17,0,7.04,0,new THREE.MeshStandardMaterial({color:0x302a25,map:ceilingMap,roughness:.86}));for(const x of [-6,-3,0,3,6]){const beam=shellBox(.16,.22,16.5,x,6.94,0,wood,.025);beam.castShadow=false;}
 // Timber skirting and panel mouldings keep the plaster visible above them.
 for(const x of [-7.85,7.85]){box(.12,1.1,16.5,x,.55,0,wood);box(.17,.075,16.5,x,1.15,0,brass);for(let z=-7.5;z<8;z+=1.25)box(.16,.9,.035,x,.56,z,metal);}
 for(const z of [-8.22,8.22])shellBox(15.7,.14,.13,0,.07,z,wood);
 const backwood=new THREE.MeshStandardMaterial({color:0x69523c,map:tex('./assets/textures/wood-floor.jpg',3,3),roughness:.76});
 const led=new THREE.MeshBasicMaterial({color:0xffc679});
 const shelfGroups=[];
 shelfLayout.modules.forEach(m=>{
  const g=new THREE.Group();g.name='Floor-supported shelf '+m.id;g.position.set(m.x,0,m.z);g.rotation.y=m.yaw;scene.add(g);shelfGroups.push(g);
  box(m.width,.16,.72,0,.08,-.12,wood,.025,g);box(m.width-.12,1.95,.10,0,1.10,-.42,backwood,.015,g);
  for(const x of [-m.width/2+.07,m.width/2-.07]){
   box(.11,2.16,.68,x,1.08,-.1,metal,.018,g);
   box(.18,.035,.74,x,.018,-.1,metal,.012,g);
   for(const y of [.22,.62,1.2,1.95]){const bolt=cylinder(.018,.018,.02,x,y,.25,brass,g);bolt.rotation.x=Math.PI/2;}
  }
  shelfLayout.levels.forEach(y=>{box(m.width-.12,.07,.66,0,y-.035,-.12,wood,.015,g);box(m.width-.22,.016,.025,0,y-.015,.215,brass,.005,g);box(m.width-.25,.02,.025,0,y+.44,-.10,led,.005,g);});
  box(m.width,.10,.7,0,2.12,-.12,wood,.02,g);
  const backOffset=new THREE.Vector3(0,0,-.15).applyAxisAngle(new THREE.Vector3(0,1,0),m.yaw);
  collider(m.x+backOffset.x,m.z+backOffset.z,m.yaw? .72:m.width,m.yaw?m.width:.72,'shelf '+m.id);
  const light=new THREE.PointLight(0xffd2a0,6,4,2);light.position.set(m.x+Math.sin(m.yaw)*.7,2.6,m.z+Math.cos(m.yaw)*.7);scene.add(light);
 });
 // Central professional counter; both ends give access to the bartender aisle.
 const bar=new THREE.Group();bar.name='Central bar with two open end aisles';bar.position.set(0,0,barLayout.z-barSite.z);scene.add(bar);
 const darkwood=new THREE.MeshStandardMaterial({color:0x36534b,roughness:.6});
 box(8.8,.95,1.05,0,.5,0,darkwood,.055,bar);box(9.15,.13,1.25,0,1.07,0,wood,.055,bar);box(8.7,.09,1.08,0,.055,0,metal,.02,bar);
 for(let x=-3.85;x<4;x+=.7)box(.028,.74,.035,x,.52,.535,brass,.005,bar);
 box(8.8,.035,.03,0,.94,.56,led,.009,bar);
 const rail=cylinder(.025,.025,8.2,0,.22,.67,brass,bar);rail.rotation.z=Math.PI/2;
 for(const x of [-3.7,-1.85,0,1.85,3.7]){box(.04,.18,.04,x,.12,.67,brass,.006,bar);}
 collider(0,-5.1,9.2,1.25,'central bar');
 for(const x of barLayout.stoolXs){
  const stool=new THREE.Group();stool.name='Bar stool '+x;stool.position.set(x,0,barLayout.stoolZ);bar.add(stool);stools.push(stool);
  surface(cylinder(.22,.22,.12,0,.72,0,leather,stool),.78,'stool','seat');cylinder(.04,.07,.7,0,.38,0,metal,stool);cylinder(.25,.25,.05,0,.028,0,metal,stool);
  const rest=new THREE.Mesh(new THREE.TorusGeometry(.17,.016,8,32),brass);rest.rotation.x=Math.PI/2;rest.position.set(0,.35,0);stool.add(rest);
 }
 // Rubber service mats, drip tray and grouped tap equipment on the worktop.
 for(const x of barLayout.serviceXs){surface(box(1.05,.012,.5,x,1.145,barLayout.matZ,metal,.01,bar),1.151,'counter');for(let k=0;k<12;k++){const rib=box(.015,.009,.36,x-.45+k*.08,1.156,barLayout.matZ,brass,.003,bar);rib.userData.placementOverlay=true;}}
 for(const x of [-1.25,1.25]){cylinder(.035,.035,.38,x,1.32,.17,brass,bar);box(.20,.045,.06,x+.07,1.50,.17,brass,.015,bar);cylinder(.065,.065,.15,x,1.58,.17,metal,bar);}
 // Physical Open Space switch: the mesh itself is the interaction target.
 const openSwitch=new THREE.Group();openSwitch.name='Open Space physical button';openSwitch.position.set(2.65,1.16,.25);bar.add(openSwitch);
 const switchBase=new THREE.Mesh(new THREE.CylinderGeometry(.16,.19,.045,32),new THREE.MeshStandardMaterial({color:0x77736b,metalness:.82,roughness:.28}));switchBase.position.y=-.035;switchBase.castShadow=true;openSwitch.add(switchBase);
 const switchCap=new THREE.Mesh(new THREE.CylinderGeometry(.105,.12,.11,32),new THREE.MeshPhysicalMaterial({color:0xc72825,emissive:0x2b0000,emissiveIntensity:.35,metalness:.08,roughness:.25,clearcoat:1}));switchCap.name='Red Open Space button';switchCap.userData.action='open-space-toggle';switchCap.position.y=.035;switchCap.castShadow=true;openSwitch.add(switchCap);
 const glow=new THREE.PointLight(0xff392e,.35,.9);glow.position.y=.16;openSwitch.add(glow);openSwitch.userData.action='open-space-toggle';openSwitch.userData.button=switchCap;openSwitch.userData.glow=glow;
 // Three matching tables on one line; every top has four grounded legs.
 for(const x of [-3.5,0,3.5]){
  const g=new THREE.Group();g.position.set(x,0,5.8);g.name='Dining table '+x;scene.add(g);tables.push(g);
  surface(box(1.65,.12,1.2,0,.92,0,wood,.045,g),.98,'table');
  for(const dx of [-.65,.65])for(const dz of [-.43,.43])box(.08,.86,.08,dx,.43,dz,metal,.015,g);
  for(const dz of [-1.05,1.05]){
   const chair=new THREE.Group();chair.name='Dining chair '+chairs.length;chair.position.z=dz;g.add(chair);chairs.push(chair);
   surface(box(.68,.12,.65,0,.5,0,leather,.045,chair),.56,'chair','seat');
   box(.68,.65,.1,0,.87,Math.sign(dz)*.29,leather,.04,chair);
   for(const dx of [-.25,.25])for(const zz of [-.23,.23])box(.045,.44,.045,dx,.22,zz,metal,.009,chair);
  }
  const candle=new THREE.MeshStandardMaterial({color:0xffdda3,emissive:0xffa448,emissiveIntensity:.4,roughness:.7});
  cylinder(.065,.065,.12,.38,1.05,.3,candle,g);
 }
 const couch=new THREE.Group();couch.position.set(-6.65,0,3.2);couch.name='Wall sofa';scene.add(couch);
 box(1.65,.34,3.9,0,.34,0,wood,.08,couch);box(.27,1.04,3.9,-.72,.94,0,leather,.1,couch);
 for(const z of [-1.22,0,1.22]){surface(box(1.3,.23,1.17,.04,.65,z,leather,.09,couch),.765,'sofa','seat');box(.2,.65,1.13,-.46,1.06,z,leather,.08,couch);}
 for(const z of [-1.95,1.95])box(1.56,.36,.2,0,.85,z,leather,.08,couch);
 // No refrigerator or workbench obstructs the aisle behind the bar.
 // Art and sconces alternate along the textured walls.
 for(const side of [-1,1])for(const [i,z] of [-4.6,.4,5.0].entries()){
  const c=document.createElement('canvas');c.width=400;c.height=520;const ctx=c.getContext('2d');ctx.fillStyle=['#273a36','#492f27','#262b38'][i];ctx.fillRect(0,0,400,520);ctx.strokeStyle='#caa46a';ctx.lineWidth=3;ctx.strokeRect(25,25,350,470);ctx.beginPath();ctx.arc(200,214,90,0,Math.PI*2);ctx.stroke();ctx.fillStyle='#e0c69e';ctx.textAlign='center';ctx.font='bold 35px serif';ctx.fillText(['CRAFT','CINEMA','КИНОСРЕДА'][i],200,365);ctx.font='16px serif';ctx.fillText('PRIVATE TASTING ROOM',200,409);const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;
  box(.075,1.9,1.5,side*7.78,3.25,z,brass,.025);const art=new THREE.Mesh(new THREE.PlaneGeometry(1.32,1.72),new THREE.MeshBasicMaterial({map:t}));art.rotation.y=-side*Math.PI/2;art.position.set(side*7.73,3.25,z);scene.add(art);
  const glow=new THREE.PointLight(0xffd7a4,3.5,4,2);glow.position.set(side*6.8,3.8,z);scene.add(glow);box(.08,.12,.8,side*7.65,4.32,z,brass,.03);
 }
 for(const x of [-5,0,5]){box(.025,1.0,.025,x,6.5,-1.5,metal);const shade=new THREE.Mesh(new THREE.ConeGeometry(.45,.3,48,1,true),new THREE.MeshStandardMaterial({color:0x242b29,metalness:.6,roughness:.4,side:THREE.DoubleSide}));shade.castShadow=false;shade.position.set(x,5.92,-1.5);scene.add(shade);cylinder(.22,.22,.03,x,5.78,-1.5,led);const light=new THREE.PointLight(0xffd5a2,7,8,2);light.castShadow=false;light.shadow.mapSize.set(512,512);light.shadow.bias=-.0004;light.shadow.normalBias=.055;light.shadow.radius=3;light.position.set(x,5.6,-1.5);scene.add(light);}
 scene.add(new THREE.HemisphereLight(0xc4d3e0,0x5b4030,1.45));scene.add(new THREE.AmbientLight(0x948477,.22));const key=new THREE.DirectionalLight(0xffead3,.95);key.position.set(-2,6,4);key.castShadow=true;key.shadow.mapSize.set(1024,1024);Object.assign(key.shadow.camera,{left:-11,right:11,top:9,bottom:-9,near:.1,far:40});key.shadow.camera.updateProjectionMatrix();key.shadow.normalBias=.055;key.shadow.radius=4;scene.add(key,key.target);
 // Wall trim, art and hanging fixtures belong to the removable shell too.
 // Mark them by their world-space placement after construction so their shared
 // furniture materials remain untouched when the interior is restored.
 scene.updateMatrixWorld(true);
 scene.traverse(mesh=>{
  if(!mesh.isMesh||mesh.userData.openSpaceShell)return;
  const p=mesh.getWorldPosition(new THREE.Vector3());
  if(mesh.parent===scene&&(Math.abs(p.x)>7.5||p.y>5.7)){mesh.userData.openSpaceShell=true;shellMeshes.push(mesh);}
 });
 const constructionRoots=[...scene.children];
 scene.position.z=barSite.z;worldScene.updateMatrixWorld(true);for(const child of [...scene.children])worldScene.attach(child);scene.removeFromParent();
 colliders.length=0;
 const solidMeshes=[];
 worldScene.traverse(mesh=>{
  if(!mesh.isMesh||!mesh.castShadow)return;
  const bounds=new THREE.Box3().setFromObject(mesh),size=bounds.getSize(new THREE.Vector3());
  if(bounds.max.y<.04||bounds.min.y>2.3||size.x>18||size.z>16)return;
  // Table tops block the torso during walking. Once feet clear the slab,
  // the same height bounds permit jumping and landing on its surface.
  if(mesh.userData.surface&&!['table','counter'].includes(mesh.userData.surface.kind))return;
  mesh.geometry.computeBoundingBox();const solid={localRoot:mesh,localBox:mesh.geometry.boundingBox.clone(),minX:bounds.min.x,maxX:bounds.max.x,minZ:bounds.min.z,maxZ:bounds.max.z,minY:bounds.min.y,maxY:bounds.max.y,label:mesh.name||'furniture',shell:!!mesh.userData.openSpaceShell};colliders.push(solid);if(solid.shell)shellColliders.push(solid);solidMeshes.push(mesh);
  if(!mesh.userData.surface&&size.x>.25&&size.z>.25&&bounds.max.y<2.2){mesh.userData.surface={kind:'surface'};surfaces.push({mesh,kind:'surface'});}
 });
 for(const s of surfaces){s.bounds=new THREE.Box3().setFromObject(s.mesh);s.topY=s.bounds.max.y;s.mesh.userData.surface=s;s.mesh.userData.action=s.action==='seat'?'seat':'surface';if(s.action==='seat'){s.seatPosition=s.bounds.getCenter(new THREE.Vector3());s.seatPosition.y=s.topY;if(s.kind==='sofa')s.seatPosition.x+=.34;s.exitPosition=s.seatPosition.clone();s.exitPosition.x+=s.kind==='sofa'?1.15:.85;s.yaw=s.kind==='sofa'?-Math.PI/2:s.kind==='chair'&&s.mesh.parent.position.z<0?Math.PI:0;}}
 const allColliders=colliders.slice(),baseColliders=allColliders.filter(c=>!c.shell);
 function setShellOpen(open){for(const mesh of shellMeshes)mesh.visible=!open;colliders.length=0;colliders.push(...(open?baseColliders:allColliders));}
 return {constructionRoots,site:barSite,colliders,allColliders,baseColliders,shellMeshes,shellColliders,textures,tables,chairs,stools,doors,shelfGroups,surfaces,solidMeshes,bar,shelfLayout,openSwitch,setShellOpen,update(){}};
}
