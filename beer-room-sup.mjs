import * as THREE from './three.module.js';
import {mergeGeometries} from './BufferGeometryUtils.js';
import {SUP_SCALE,WATER_Y,createSupStates,advanceSupBoard} from './beer-room-sup-physics.mjs';
import {supProfile as spec} from './beer-room-sup-profile.mjs';

// Every longitudinal section follows the two photographed outlines.
function section(i){
 const t=i/spec.segments,p=spec.profiles[i],half=p.half/spec.maxHalf*spec.width/2;
 return{p,t,z:(t-.5)*spec.length,half,radius:Math.min(.026,half*.4),height:spec.thickness/2,rocker:.045*Math.pow(1-t,8)+.008*Math.pow(t,8)};
}
function geometry(positions,uv,indices){const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(indices);g.computeVertexNormals();g.computeBoundingBox();return g;}
export function createSupGeometry(){
 const cols=16,arcs=12,caps=[];
 for(const lower of [false,true]){
  const positions=[],uv=[],indices=[];
  for(let i=0;i<=spec.segments;i++){
   const s=section(i),face=lower?s.p.bottom:s.p.deck;
   for(let j=0;j<=cols;j++){const q=j/cols*2-1;positions.push(q*(s.half-s.radius),s.rocker+(lower?-1:1)*s.height,s.z);uv.push(face[0]+q*face[1]*(lower?-1:1),1-s.p.y);}
  }
  for(let i=0;i<spec.segments;i++)for(let j=0;j<cols;j++){const a=i*(cols+1)+j,b=a+1,c=a+cols+1,d=c+1;indices.push(...(lower?[a,b,c,b,d,c]:[a,c,b,b,c,d]));}
  caps.push(geometry(positions,uv,indices));
 }
 const positions=[],uv=[],indices=[],stride=arcs+1;
 for(const side of [-1,1]){
  const base=positions.length/3;
  for(let i=0;i<=spec.segments;i++){
   const s=section(i);
   for(let j=0;j<=arcs;j++){const angle=j/arcs*Math.PI;positions.push(side*(s.half-s.radius+s.radius*Math.sin(angle)),s.rocker+s.height*Math.cos(angle),s.z);uv.push((side===-1?0:.5)+.5/64+j/arcs*(.5-1/64),1-s.p.y);}
  }
  for(let i=0;i<spec.segments;i++)for(let j=0;j<arcs;j++){const a=base+i*stride+j,b=a+1,c=a+stride,d=c+1;indices.push(...(side===1?[a,c,b,b,c,d]:[a,b,c,b,d,c]));}
 }
 // Close the nose and tail cross-sections using the rail material.
 for(const i of [0,spec.segments]){
  const s=section(i),base=positions.length/3,points=[];
  for(const side of [1,-1])for(let j=0;j<=arcs;j++){const angle=(side===1?j:arcs-j)/arcs*Math.PI;points.push([side*(s.half-s.radius+s.radius*Math.sin(angle)),s.rocker+s.height*Math.cos(angle)]);}
  positions.push(0,s.rocker,s.z);uv.push(.25,1-s.p.y);
  for(const [x,y]of points){positions.push(x,y,s.z);uv.push(.25,1-s.p.y);}
  for(let j=0;j<points.length;j++){const a=base+1+j,b=base+1+(j+1)%points.length;indices.push(...(i===0?[base,a,b]:[base,b,a]));}
 }
 const rail=geometry(positions,uv,indices);
 // Join both sides without a hard normal or a white background fringe.
 for(let i=0;i<=spec.segments;i++)for(const [side,offset]of [[-1,0],[1,(spec.segments+1)*stride]])for(const lower of [false,true]){
  const cap=caps[lower?1:0],ci=i*(cols+1)+(side===1?cols:0),ri=offset+i*stride+(lower?arcs:0),n=new THREE.Vector3().fromBufferAttribute(cap.attributes.normal,ci).add(new THREE.Vector3().fromBufferAttribute(rail.attributes.normal,ri)).normalize();cap.attributes.normal.setXYZ(ci,n.x,n.y,n.z);rail.attributes.normal.setXYZ(ri,n.x,n.y,n.z);
 }
 return{deck:caps[0],bottom:caps[1],rail};
}
function pixelPoint(x,y){
 const t=THREE.MathUtils.clamp((y-13)/773,0,1),s=section(Math.round(t*spec.segments)),u=(x-178)/224;
 return new THREE.Vector3((u-s.p.deck[0])/s.p.deck[1]*(s.half-s.radius),s.rocker+s.height+.008,(t-.5)*spec.length);
}
function accessories(){
 const black=[],orange=[],up=new THREE.Vector3(0,1,0);
 function bar(a,b,r,list){const g=new THREE.CylinderGeometry(r,r,a.distanceTo(b),6);g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(up,b.clone().sub(a).normalize()));g.translate(...a.clone().add(b).multiplyScalar(.5).toArray());list.push(g);}
 const anchors=[[240,240],[341,240],[235,308],[345,308]].map(([x,y])=>pixelPoint(x,y));
 for(const [a,b]of [[0,1],[0,3],[1,2],[2,3]])bar(anchors[a],anchors[b],.0028,black);
 for(const a of anchors){const ring=new THREE.TorusGeometry(.014,.003,5,10);ring.rotateX(-Math.PI/2);ring.translate(...a.toArray());orange.push(ring);}
 const handle=pixelPoint(290,438);handle.y+=.028;const strap=new THREE.BoxGeometry(.034,.010,.205);strap.translate(...handle.toArray());orange.push(strap);
 for(const z of [-.09,.09]){const end=new THREE.BoxGeometry(.034,.028,.02);end.translate(handle.x,handle.y-.014,handle.z+z);orange.push(end);}
 const result={};for(const [key,list]of Object.entries({black,orange})){const parts=list.map(g=>g.index?g.toNonIndexed():g);result[key]=mergeGeometries(parts);parts.forEach(g=>g.dispose());list.forEach(g=>g.dispose());}return result;
}
export function buildSupBoards(group){
 const root=new THREE.Group();root.name='Three floating JP SUP boards';root.visible=false;group.add(root);
 const loader=new THREE.TextureLoader(),textures=[];
 function load(name){const t=loader.load('./assets/sup/jp-sup-'+name+'.webp',()=>{root.visible=textures.length===3&&textures.every(t=>t.image?.complete);});t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=4;textures.push(t);return t;}
 const materials={deck:new THREE.MeshStandardMaterial({map:load('deck'),roughness:.86}),bottom:new THREE.MeshStandardMaterial({map:load('bottom'),roughness:.86}),rail:new THREE.MeshStandardMaterial({map:load('rail'),roughness:.8}),black:new THREE.MeshStandardMaterial({color:0x202326,roughness:.75}),orange:new THREE.MeshStandardMaterial({color:0xe97617,roughness:.85})};
 const shapes=createSupGeometry(),details=accessories(),states=createSupStates(),boards=[],attachments=new Set();let network=null,time=0,lastInput=0,pending=null;
 const point=new THREE.Vector3(),q=new THREE.Quaternion();
 for(const [index,state]of states.entries()){
  const board=new THREE.Group();board.name=`JP SUP board ${index+1}`;board.scale.setScalar(SUP_SCALE);root.add(board);boards.push(board);
  const surface={kind:'sup-board',board,bounds:new THREE.Box3(),topY:0,
   localAt(x,z){board.updateWorldMatrix(true,false);return board.worldToLocal(new THREE.Vector3(x,board.position.y,z));},
   contains(x,z,margin=.02){const p=this.localAt(x,z),t=(p.z/spec.length+.5);if(t<.015||t>.985)return false;return Math.abs(p.x)<section(Math.round(t*spec.segments)).half-margin;},
   heightAt(x,z){if(this.disabled||!this.contains(x,z))return null;const p=this.localAt(x,z),t=THREE.MathUtils.clamp(p.z/spec.length+.5,0,1),sec=section(Math.round(t*spec.segments));p.y=sec.height+sec.rocker+.003;return board.localToWorld(p).y;}
  };
  board.userData={action:'sup-board',supIndex:index,id:state.id,state,surface,owner:null,velocity:{x:0,z:0},target:null};
  for(const [part,geo]of Object.entries({...shapes,...details})){const mesh=new THREE.Mesh(geo,materials[part]);mesh.name={deck:'JP printed deck',bottom:'JP printed underside',rail:'Rounded orange SUP rail',black:'Raised deck bungee',orange:'Orange carry handle and anchors'}[part];mesh.castShadow=mesh.receiveShadow=true;if(part==='deck')mesh.userData.surface=surface;board.add(mesh);}
  // The paddle and grip sockets use metres independently of the enlarged hull.
  const paddle=new THREE.Group();paddle.name='Animated SUP paddle';paddle.scale.setScalar(1/SUP_SCALE);
  const shaft=new THREE.Mesh(new THREE.CylinderGeometry(.014,.014,1.40,8),materials.black);shaft.position.y=.45;
  const blade=new THREE.Mesh(new THREE.CapsuleGeometry(.10,.25,4,8),materials.black);blade.scale.set(.7,1,.20);blade.position.y=-.34;
  const grip=new THREE.Mesh(new THREE.CapsuleGeometry(.023,.13,3,8),materials.black);grip.rotation.z=Math.PI/2;grip.position.y=1.15;
  const top=new THREE.Object3D(),bottom=new THREE.Object3D();top.position.set(0,1.15,0);bottom.position.set(0,1.0,0);paddle.add(shaft,blade,grip,top,bottom);board.add(paddle);board.userData.paddle=paddle;board.userData.paddleHands={left:top,right:bottom};
  const wake=new THREE.Mesh(new THREE.RingGeometry(.6,.64,32),new THREE.MeshBasicMaterial({color:0xd8eee3,transparent:true,opacity:0,depthWrite:false,side:THREE.DoubleSide}));wake.rotation.x=-Math.PI/2;wake.scale.set(.95,2.4,1);wake.position.y=WATER_Y+.012;root.add(wake);board.userData.wake=wake;
 }
 function setNetwork(value){network=value;}
 function requestMount(board){if(pending===board?.userData.id&&time-lastInput<1)return true;if(!network?.connected||!board||board.userData.owner&&board.userData.owner!==network.id)return false;pending=board.userData.id;lastInput=time;network.sendPresence(true);if(!network.send({type:'sup_claim',boardId:pending})){pending=null;return false;}return true;}
 function receive(snapshots){for(const snap of snapshots||[]){const b=boards.find(b=>b.userData.id===snap.id);if(!b)continue;const d=b.userData;b.visible=!snap.deleted;d.surface.disabled=!!snap.deleted;d.state.deleted=!!snap.deleted;d.owner=snap.owner;d.state.owner=snap.owner;for(const a of ['sx','sy','sz'])d.state[a]=snap[a]??1;d.target={...snap};d.receivedAt=time;if(!d.received){Object.assign(d.state,snap);d.received=true;}if(pending===snap.id&&snap.owner===network?.id){pending=null;api.onMount?.(b);}if(api.current===b&&snap.owner!==network?.id){api.onLost?.(b);}}}
 function drive(board,throttle,steer,brake){const d=board?.userData;if(!d||d.owner!==network?.id)return;Object.assign(d.state,{throttle,steer,brake});if(time-lastInput>.045){lastInput=time;network.send({type:'sup_input',boardId:d.id,throttle,steer,brake});}}
 function release(board){if(!board)return;network?.send({type:'sup_release',boardId:board.userData.id});Object.assign(board.userData.state,{throttle:0,steer:0,brake:true});api.current=null;}
 function anchorAt(board,worldPosition,worldQuaternion){board.updateWorldMatrix(true,false);return{boardId:board.userData.id,local:board.worldToLocal(worldPosition.clone()).toArray(),rotation:board.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(worldQuaternion).toArray()};}
 function attach(object,anchor){if(!object)return;attachments.delete(object);object.userData.supAnchor=anchor||null;if(!anchor)object.userData.movingSurface=null;if(anchor)attachments.add(object);}
 function updateAttachments(){for(const object of attachments){if(object.userData.held||!object.parent){attachments.delete(object);continue;}const a=object.userData.supAnchor,b=boards.find(b=>b.userData.id===a?.boardId);if(!b){attachments.delete(object);continue;}object.position.copy(b.localToWorld(point.fromArray(a.local)));object.quaternion.copy(b.getWorldQuaternion(q)).multiply(new THREE.Quaternion().fromArray(a.rotation));object.userData.movingSurface=b.userData.velocity;}}
 function denied(){pending=null;}
 function update(dt){time+=dt;for(const b of boards){const d=b.userData,s=d.state,t=d.target,local=d.owner&&d.owner===network?.id,oldX=b.position.x,oldZ=b.position.z;
   if(local)advanceSupBoard(s,dt);
   if(t){const blend=1-Math.exp(-dt*(local?3:16)),predicted={...t,phase:t.phase};if(local)advanceSupBoard(predicted,Math.min(.05,time-(d.receivedAt??time)));s.x+=(predicted.x-s.x)*blend;s.z+=(predicted.z-s.z)*blend;s.yaw+=(THREE.MathUtils.euclideanModulo(predicted.yaw-s.yaw+Math.PI,Math.PI*2)-Math.PI)*blend;if(!local)s.speed+=(t.speed-s.speed)*blend;if(!local){s.throttle=t.throttle||0;s.steer=t.steer||0;s.phase+=(Math.abs(s.throttle)>.05||Math.abs(s.steer)>.05?3.9:0)*dt;s.phase+=(t.phase-s.phase)*(1-Math.exp(-dt*5));}}
   b.scale.set(SUP_SCALE*(s.sx??1),SUP_SCALE*(s.sy??1),SUP_SCALE*(s.sz??1));b.position.set(s.x,WATER_Y-.025+Math.sin(time*1.6+d.supIndex)*.012,s.z);b.rotation.set(Math.sin(time*1.25+d.supIndex)*.005,s.yaw,Math.sin(time*1.1+d.supIndex*2)*.006,'YXZ');b.updateWorldMatrix(true,true);
   if(dt>0&&d.initialized){d.velocity.x=(b.position.x-oldX)/dt;d.velocity.z=(b.position.z-oldZ)/dt;}d.initialized=true;
   const surface=d.surface;surface.bounds.copy(shapes.deck.boundingBox).applyMatrix4(b.matrixWorld);surface.topY=surface.heightAt(b.position.x,b.position.z);
   const paddle=d.paddle,active=!!d.owner;const stroke=s.phase*(s.throttle<0?-1:1),work=Math.abs(s.throttle||0)>.05||Math.abs(s.steer||0)>.05;
   paddle.visible=active;paddle.scale.set(1/b.scale.x,1/b.scale.y,1/b.scale.z);paddle.position.set(.42*1.18/b.scale.x,(surface.topY-b.position.y+.03)/b.scale.y,(-.10+(work?Math.sin(stroke)*.10:0))*1.18/b.scale.z);paddle.rotation.set(-.16+(work?Math.cos(stroke)*.06:0),0,.40);paddle.updateMatrix();paddle.matrix.makeScale(1/b.scale.x,1/b.scale.y,1/b.scale.z).multiply(new THREE.Matrix4().makeRotationFromEuler(paddle.rotation)).setPosition(paddle.position);paddle.matrixAutoUpdate=false;paddle.updateWorldMatrix(true,true);
   const wake=d.wake;wake.position.x=s.x;wake.position.z=s.z;wake.rotation.z=-s.yaw;wake.material.opacity=Math.min(.17,Math.abs(s.speed)*.07);wake.scale.set(.9+Math.sin(time*6)*.05,2.7,1);
  }updateAttachments();}
 const api={group:root,colliders:[],boards,update,updateAttachments,setNetwork,requestMount,receive,denied,drive,release,anchorAt,attach,current:null,onMount:null,onLost:null,get assetsReady(){return textures.every(t=>t.image?.complete);}};update(0);return api;
}
