import * as THREE from './three.module.js';
import {barLayout} from './beer-room-interior.mjs';
import {createServingGlass,updateGlass} from './beer-room-glass.mjs';
export function drinkColour(beer){const type=[beer.type,beer.style,beer.name].filter(Boolean).join(' ').toLowerCase();return /stout|porter|dunkel|schwarz|т[её]мн|стаут|портер/.test(type)?0x48220c:/red|amber|красн|янтар/.test(type)?0xad4810:/weiss|wheat|пшен|нефильтр/.test(type)?0xdcae3e:0xd58c19;}
export class BeerPouring {
 constructor(scene,hand,{barZ=-.95}={}){
  Object.assign(this,{scene,hand});this.glasses=[];this.active=null;this.elapsed=0;
  for(const [i,x]of barLayout.serviceXs.entries()){const glass=createServingGlass(i===1?'tulip':'pint');glass.position.set(x,1.17,barZ+barLayout.matZ);glass.userData.rim=glass.position.clone().add(new THREE.Vector3(0,glass.userData.height,0));scene.add(glass);this.glasses.push(glass);}
  const material=new THREE.MeshPhysicalMaterial({color:0xd58c19,transparent:true,opacity:.86,roughness:.15});
  this.stream=new THREE.Mesh(new THREE.CylinderGeometry(.003,.003,1,8),material);this.stream.visible=false;this.stream.frustumCulled=false;this.stream.name='Beer from package opening';scene.add(this.stream);
  this.spill=new THREE.Mesh(this.stream.geometry.clone(),material.clone());this.spill.name='Sip from glass rim to mouth';this.spill.visible=false;this.spill.frustumCulled=false;scene.add(this.spill);
 }
 reachable(glass,camera){const p=glass.userData.held?glass.userData.homePosition:glass.position;return Math.hypot(camera.position.x-p.x,camera.position.z-p.z)<(camera.position.y<1.7?1.65:1.25);}
 available(glass,camera){return !glass.userData.held&&this.hand.canPour()&&!this.hand.served&&glass.userData.fill<.03&&this.reachable(glass,camera);}
 start(glass,camera,beer){if(this.active||!this.available(glass,camera)||!this.hand.beginPour(glass))return false;glass.userData.beer=beer;glass.userData.liquid.material.color.setHex(drinkColour(beer));this.stream.material.color.setHex(drinkColour(beer));this.active=glass;return true;}
 fill(glass,fraction,time=this.elapsed){glass.userData.fill=THREE.MathUtils.clamp(fraction,0,1);updateGlass(glass,0,{},null,time);}
 curveStream(mesh,start,end,radius){const mid=start.clone().lerp(end,.5).add(new THREE.Vector3(0,-.008,0));mesh.geometry.dispose();mesh.geometry=new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(start,mid,end),16,radius,8,false);mesh.visible=true;}
 update(dt,player={}){
  this.elapsed+=dt;this.stream.visible=false;this.spill.visible=false;
  if(this.active){
   const glass=this.active,t=this.hand.time;
   if(this.hand.state==='POURING'&&t>=.85&&t<3.9){
    const progress=(t-.85)/3.05;glass.userData.fill=progress*(this.hand.pourStartFill??1);
    const start=this.hand.mouthPosition(),end=glass.position.clone().add(new THREE.Vector3(0,.018+.19*progress,0));this.curveStream(this.stream,start,end,.0028);glass.userData.streamStart=start.toArray();glass.userData.streamEnd=end.toArray();
   }
   if(this.hand.state==='POUR_COMPLETE'){glass.userData.fill=this.hand.pourStartFill??1;this.hand.model.userData.fill=0;this.hand.served=true;glass.name='Filled serving glass';this.active=null;}
  }
  if(this.hand.drinkFlow&&this.hand.heldKind==='glass'){
   const d=this.hand.model.userData,start=this.hand.rig.localToWorld(new THREE.Vector3(0,d.height,d.rTop-.004)),end=this.hand.getMouthPosition?.()||this.hand.camera.localToWorld(new THREE.Vector3(.015,-.085,-.048));this.spill.material.color.copy(d.liquid.material.color);this.spill.layers.set(1);this.curveStream(this.spill,start,end,.002);
  }
  for(const glass of this.glasses)updateGlass(glass,dt,glass.userData.held?player:{},this.hand.camera,this.elapsed);
 }
}
