import * as THREE from './three.module.js';
import {optimizeLocalLights} from './beer-room-local-lights.mjs';
optimizeLocalLights();
import {barSite} from './beer-room-site.mjs';
import {buildOutdoors} from './beer-room-outdoors.mjs';
import {campLayout,groundHeight,canWalkGround} from './beer-room-landscape.mjs';
export function createEnvironment({scene,renderer,camera,interior,controls,onChange=()=>{}}){
 const editorIndoor={colliders:[],surfaces:[]};let barVisible=localStorage.getItem('kinosreda-bar-visible')!=='hidden',barRoot=null;const hiddenBarRoots=new Map();const barRoots=new Set([...interior.constructionRoots,...interior.tables,...interior.chairs,...interior.stools,...interior.shelfGroups,interior.bar,scene.getObjectByName('Wall sofa'),...scene.children.filter(r=>r.userData.barBuilding)].filter(Boolean));
 let outdoors=null,open=false,progress=0,target=0,press=0,quality=localStorage.getItem('kinosreda-camp-quality')||'medium';
 let nightTarget=localStorage.getItem('kinosreda-camp-time')==='night'?1:0,night=nightTarget,lastVisual='';
 let closedBounds=barSite.bounds;
 const baseSurfaces=interior.surfaces.slice(),baseFog=scene.fog.clone(),baseBackground=scene.background.clone(),lights=[];
 scene.traverse(o=>{if(o.isLight)lights.push({light:o,intensity:o.intensity,shadow:o.castShadow,shell:o.parent===scene&&(o.position.y>5||Math.abs(o.position.x)>8.7&&o.position.y>3)});});
 const accent=new THREE.Group();accent.name='Warm bar lighting at night';scene.add(accent);
 const stripMaterial=new THREE.MeshBasicMaterial({color:0xffc375});
 const strip=new THREE.Mesh(new THREE.BoxGeometry(8.65,.022,.024),stripMaterial);strip.position.set(0,.95,interior.bar.position.z+.57);accent.add(strip);
 for(const x of [-2.8,2.8]){const light=new THREE.PointLight(0xffb967,0,8,2);light.position.set(x,1.0,interior.bar.position.z+1.2);light.layers.enable(1);accent.add(light);}
 accent.visible=false;
 function setTimeOfDay(value){nightTarget=value==='night'?1:0;localStorage.setItem('kinosreda-camp-time',nightTarget?'night':'day');scene.userData.shadowsDirty=true;}
 const shell=interior.shellMeshes.map(mesh=>{const original=mesh.material,materials=(Array.isArray(original)?original:[original]).map(m=>{const c=m.clone();c.transparent=true;return c;});mesh.material=Array.isArray(original)?materials:materials[0];return {mesh,original,materials,opacity:materials.map(m=>m.opacity)};});
 const world={get bounds(){return open?campLayout.bounds:closedBounds;},ground(x,z){return open?groundHeight(x,z):0;},canWalk(x,z){return true;},water(x,z){return open&&groundHeight(x,z)<campLayout.lake.y?campLayout.lake.y:null;},speed(x,z){return 1;},get sup(){return open?outdoors?.sup:null;}};
 controls.world=world;
 function configureCollisions(){closedBounds=interior.editableBounds||barSite.bounds;interior.colliders.splice(0,interior.colliders.length,...(barVisible?(open?interior.baseColliders:interior.allColliders):[]),...(open&&outdoors?outdoors.colliders:editorIndoor.colliders));interior.surfaces.splice(0,interior.surfaces.length,...(barVisible?baseSurfaces:[]),...(open&&outdoors?outdoors.surfaces:editorIndoor.surfaces));}
 function prepareOutdoors(){if(!outdoors){outdoors=buildOutdoors(scene,renderer,camera);outdoors.group.visible=false;outdoors.group.traverse(o=>{if(o.isLight)o.layers.enable(1);});applyQuality(quality);}return outdoors;}
 function setOpen(value,{broadcast=true}={}){
  value=!!value||!barVisible;if(value===open)return;press=.24;
  if(value)prepareOutdoors();
  open=value;target=value?1:0;
  if(!open&&(camera.position.x<closedBounds.minX||camera.position.x>closedBounds.maxX||camera.position.z<closedBounds.minZ||camera.position.z>closedBounds.maxZ||controls.state.seated&&!baseSurfaces.includes(controls.state.seated))){controls.stand();camera.position.set(2,1.64,barSite.z+1);Object.assign(controls.state,{feetY:0,verticalVelocity:0,grounded:true,seated:null,toilet:null,sup:null,swimming:false,deckSupport:null});controls.clear();}
  configureCollisions();scene.userData.shadowsDirty=true;if(broadcast)onChange(open);
 }
 function applyBarVisibility(){if(barRoot)barRoot.visible=barVisible&&!barRoot.userData.worldDeleted;else for(const root of barRoots){if(!barVisible){if(!hiddenBarRoots.has(root))hiddenBarRoots.set(root,root.visible);root.visible=false;}else if(hiddenBarRoots.has(root)){root.visible=hiddenBarRoots.get(root);hiddenBarRoots.delete(root);}}accent.visible=barVisible&&night*progress>.001;for(const l of lights)if(!l.light.isAmbientLight&&!l.light.isHemisphereLight&&!l.light.isDirectionalLight)l.light.visible=barVisible;scene.userData.shadowsDirty=true;outdoors?.lake.invalidateReflection();}
 function bindBarRoot(root){for(const [node,visible]of hiddenBarRoots)node.visible=visible;hiddenBarRoots.clear();barRoot=root;applyBarVisibility();}
 function setBarVisible(value){barVisible=!!value;localStorage.setItem('kinosreda-bar-visible',barVisible?'shown':'hidden');if(!barVisible&&!open)setOpen(true,{broadcast:false});if(!barVisible&&controls.state.seated&&baseSurfaces.includes(controls.state.seated))controls.stand();applyBarVisibility();configureCollisions();api.onBarVisibility?.();}
 function applyQuality(value){quality=['high','medium','low'].includes(value)?value:'medium';localStorage.setItem('kinosreda-camp-quality',quality);renderer.setPixelRatio(Math.min(devicePixelRatio,quality==='high'?1.75:quality==='medium'?1.35:1));if(outdoors){outdoors.lake.applyQuality(quality);outdoors.landscape.sun.castShadow=quality!=='low';}scene.userData.shadowsDirty=true;}
 applyQuality(quality);
 function update(dt){
  press=Math.max(0,press-dt);interior.openSwitch.userData.button.position.y=.035-Math.sin(press/.24*Math.PI)*.03;
  progress=THREE.MathUtils.clamp(progress+Math.sign(target-progress)*Math.min(Math.abs(target-progress),dt/1.15),0,1);
  night+=Math.sign(nightTarget-night)*Math.min(Math.abs(nightTarget-night),dt/1.8);
  const t=progress*progress*(3-2*progress),visual=`${progress}:${night}`;
  if(visual!==lastVisual){lastVisual=visual;for(const s of shell){s.mesh.visible=t<.999;s.materials.forEach((m,i)=>{m.opacity=s.opacity[i]*(1-t);m.depthWrite=t<.2;});}
   for(const l of lights){const ambient=l.light.isAmbientLight||l.light.isHemisphereLight||l.light.isDirectionalLight;const outdoorLevel=ambient ? .32*(1-night*.76):l.shell?night*.85:.32+night*.68;l.light.intensity=l.intensity*THREE.MathUtils.lerp(1,outdoorLevel,t);l.light.castShadow=l.shadow&&t<.1;}
   const fogColor=new THREE.Color(0xc0c6b1).lerp(new THREE.Color(0x101e35),night),background=new THREE.Color(0xaac3cb).lerp(new THREE.Color(0x081020),night);
   scene.fog.color.copy(baseFog.color).lerp(fogColor,t);scene.fog.near=THREE.MathUtils.lerp(baseFog.near,300,t);scene.fog.far=THREE.MathUtils.lerp(baseFog.far,850,t);scene.background.copy(baseBackground).lerp(background,t);
   camera.far=THREE.MathUtils.lerp(60,1600,t);camera.updateProjectionMatrix();
   accent.visible=barVisible&&night*t>.001;stripMaterial.color.set(0xffc375).multiplyScalar(1+night*2);accent.children.forEach(o=>{if(o.isLight)o.intensity=20*night*t;});
   interior.openSwitch.userData.glow.color.setHex(open?0x89cc92:0xff392e);scene.userData.shadowsDirty=true;
  }
  if(outdoors){outdoors.group.visible=progress>0;outdoors.setNight(night,progress);if(progress>0)outdoors.update(dt,quality,progress===1&&night===nightTarget);}

 }
 const api={bindBarRoot,setBarVisible,onBarVisibility:null,get barVisible(){return barVisible;},get editorIndoor(){return editorIndoor;},set editorIndoor(value){Object.assign(editorIndoor,value);},prepareOutdoors,refreshCollisions:configureCollisions,world,setOpen,setTimeOfDay,get timeOfDay(){return nightTarget?'night':'day';},get night(){return night;},nightLights:accent,toggle(){setOpen(!open);},update,applyQuality,get quality(){return quality;},get open(){return open;},get progress(){return progress;},get outdoors(){return outdoors;}};if(!barVisible){setOpen(true,{broadcast:false});applyBarVisibility();configureCollisions();}return api;
}
