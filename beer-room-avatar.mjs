import * as THREE from './three.module.js';
import {GLTFLoader} from './GLTFLoader.js';
import {clone as cloneSkeleton} from './SkeletonUtils.js';
import {createServingGlass, updateGlass} from './beer-room-glass.mjs';
import {avatarModel} from './beer-room-avatar-catalog.mjs';
import {solveArm,aimBone,createPaddleGrip,createAvatarGrip} from './beer-room-avatar-grip.mjs';
import {poseGroundedBody,blendBodyPose} from './beer-room-posture.mjs';
import {decorateAvatar} from './beer-room-avatar-style.mjs';
import {createPackageModel, disposePackageInstance} from './beer-package-model.mjs';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const material = (color, roughness = .78) => new THREE.MeshStandardMaterial({ color, roughness });
function releaseFallback(root) {
  for(const geometry of root.userData.fallbackGeometries||[])geometry.dispose();
  for(const mat of root.userData.fallbackMaterials||[])mat.dispose();
  root.userData.fallbackGeometries=[];root.userData.fallbackMaterials=[];
}
function releaseHeld(child) {
  if(child.userData.packageAsset)disposePackageInstance(child);
  else child.traverse(o=>{o.geometry?.dispose?.();o.material?.dispose?.();});
}
export function disposeHumanAvatar(root) {
  root.userData.disposed=true;for(const g of root.userData.firstPersonGeometries||[])g.dispose();for(const resource of root.userData.styleResources||[])resource.dispose();
  releaseFallback(root);root.userData.mixer?.stopAllAction();root.userData.mixer?.uncacheRoot(root.userData.humanoidModel);
  const held=root.getObjectByName('Remote held item');held?.children.forEach(releaseHeld);
  for(const child of root.children)if(child.isSprite){child.material.map?.dispose();child.material.dispose();}
  // The hydrated mesh and skin textures belong to the shared GLTF template.
  root.removeFromParent();
}
const templates=new Map(), scenes=new Map();
let motionPromise;
export function loadAvatarTemplate(id='classic') {
  const choice=avatarModel(id);if(templates.has(choice.id))return templates.get(choice.id);
  const loader=new GLTFLoader();
  if(!motionPromise)motionPromise=Promise.all(['M_Standing_Idle_001','M_Walk_001','M_Jog_Jump_001'].map(name=>loader.loadAsync(`./assets/models/avatars/${name}.glb`).then(g=>g.animations[0])));
  if(!scenes.has(choice.file))scenes.set(choice.file,loader.loadAsync(choice.file).then(g=>g.scene));
  const pending=Promise.all([scenes.get(choice.file),motionPromise]).then(([scene,clips])=>({scene,clips,model:choice.id,height:choice.height}));
  templates.set(choice.id,pending);return pending;
}
export function updateAvatarAppearance(root,prefs={}) {
  const choice=avatarModel(prefs.model);root.userData.prefs={...prefs,model:choice.id};
  if(root.userData.requestedModel===choice.id)return;
  root.userData.requestedModel=choice.id;
  loadAvatarTemplate(choice.id).then(template=>{if(!root.userData.disposed&&root.userData.requestedModel===choice.id)hydrateHumanAvatar(root,template);}).catch(error=>{root.userData.avatarError=String(error);root.userData.requestedModel=null;});
}

export function hydrateHumanAvatar(root, template) {
  if (!root || !template?.scene || root.userData.activeModel===template.model) return;
  const held = root.getObjectByName('Remote held item');
  const label = root.children.find(child => child.isSprite);
  if(held)root.add(held);for(const resource of root.userData.styleResources||[])resource.dispose();
  root.userData.mixer?.stopAllAction();root.userData.activeMotion=null;
  releaseFallback(root);
  root.children.slice().forEach(child => { if (child !== held && child !== label) root.remove(child); });
  const model = cloneSkeleton(template.scene);model.updateMatrixWorld(true);model.traverse(o=>{if(o.isSkinnedMesh)o.skeleton.update();});
  root.userData.styleResources=decorateAvatar(model,template.model);
  const box = new THREE.Box3().setFromObject(model,true), size = box.getSize(new THREE.Vector3());
  model.scale.setScalar(template.height / Math.max(.01, size.y));model.rotation.y=Math.PI; model.position.y = -box.min.y * model.scale.y;
  model.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true;if(o.isSkinnedMesh)o.frustumCulled=false; } });
  root.add(model);
  // Attach the lips to the head bone, so all poses (including reclining) use
  // the actual face rather than a guessed height above the pelvis.
  const headBone=model.getObjectByName('Head');
  if(headBone){
    // SkinnedMesh.updateMatrixWorld also refreshes bindMatrixInverse in
    // attached mode. updateWorldMatrix alone leaves the new parent's world
    // transform in getVertexPosition, moving the lip target away from the face
    // whenever the avatar hydrates at a translated/rotated network position.
    root.updateWorldMatrix(true,false);root.updateMatrixWorld(true);const points=[];
    model.traverse(mesh=>{if(!mesh.isSkinnedMesh)return;mesh.skeleton.update();
      const headIndices=new Set(mesh.skeleton.bones.map((bone,i)=>{for(let b=bone;b;b=b.parent)if(b===headBone)return i;return -1;}).filter(i=>i>=0));
      const indices=mesh.geometry.attributes.skinIndex,weights=mesh.geometry.attributes.skinWeight;
      if(!indices||!weights)return;
      for(let i=0;i<indices.count;i++){let weight=0;for(const get of ['getX','getY','getZ','getW'])if(headIndices.has(indices[get](i)))weight+=weights[get](i);if(weight>.6)points.push(root.worldToLocal(mesh.localToWorld(mesh.getVertexPosition(i,new THREE.Vector3()))));}
    });
    if(!points.length)points.push(root.worldToLocal(headBone.getWorldPosition(new THREE.Vector3())).add(new THREE.Vector3(-.08,0,-.10)),root.worldToLocal(headBone.getWorldPosition(new THREE.Vector3())).add(new THREE.Vector3(.08,.20,.08)));
    const faceBounds=new THREE.Box3().setFromPoints(points),size=faceBounds.getSize(new THREE.Vector3());
    const lips=new THREE.Object3D();lips.name='Avatar mouth socket';
    lips.position.copy(headBone.worldToLocal(root.localToWorld(new THREE.Vector3((faceBounds.min.x+faceBounds.max.x)/2,faceBounds.min.y+size.y*.37,faceBounds.min.z+.008))));
    lips.quaternion.copy(headBone.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(root.getWorldQuaternion(new THREE.Quaternion())));
    headBone.add(lips);root.userData.mouthSocket=lips;
  }
  root.userData.height=template.height;root.userData.grip=createAvatarGrip(root,model,held);
  root.userData.transportRest=new Map();model.traverse(b=>{if(b.isBone)root.userData.transportRest.set(b.name,{q:b.quaternion.clone(),p:b.position.clone()});});
  root.userData.bodyPose=null;root.userData.modelBaseY=model.position.y;root.userData.paddleGrips={left:createPaddleGrip(root,model,'Left'),right:createPaddleGrip(root,model,'Right')};
  const bindHip=model.getObjectByName('Hips')?.position.y||1;
  const mixer = new THREE.AnimationMixer(model);
  // Network position is authoritative. Strip root translation from imported
  // clips so a walk animation cannot make the avatar drift away from its
  // interpolated server position.
  const clips = (template.clips || []).filter(Boolean).map(source => {
    const clip = source.clone();
    clip.tracks = clip.tracks.filter(track => {
      if (!/Hips|mixamorig.*Hips/i.test(track.name) || !/\.position$/.test(track.name)) return true;
      const values = track.values.slice();
      const originalY=values[1];for (let i = 0; i < values.length; i += 3) { values[i] = 0; values[i+1]=values[i+1]-originalY+bindHip; values[i + 2] = 0; }
      track.values = values; return true;
    });
    return clip;
  });
  const actions = clips.map(clip => mixer.clipAction(clip));
  root.userData.activeModel=template.model;root.userData.hydrated = true; root.userData.humanoidModel = model; root.userData.mixer = mixer; root.userData.motionActions = actions;
}

function part(geometry, mat, parent, name) {
  const mesh = new THREE.Mesh(geometry, mat);
  mesh.name = name;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function capsule(radius, length, mat, parent, name) {
  return part(new THREE.CapsuleGeometry(radius, length, 6, 12), mat, parent, name);
}

export function createHumanAvatar(prefs = {}, getBeerModel = null) {
  const root = new THREE.Group();
  root.name = 'Human online avatar';
  const skin = material(prefs.color || '#b9784f', .82);
  const shirt = material(prefs.shirt || '#263b52', .7);
  const pants = material(prefs.pants || '#1b2029', .9);
  const shoes = material(prefs.shoes || '#161719', .72);
  const hair = material(prefs.hair || '#3a2419', .95);
  const face = new THREE.Group(); face.position.y = 1.66; root.add(face);

  const pelvis = part(new THREE.SphereGeometry(.22, 18, 12), pants, root, 'pelvis'); pelvis.scale.set(1.15, .72, .72); pelvis.position.y = .83;
  const torso = capsule(.255, .42, shirt, root, 'torso'); torso.scale.set(.86, 1, .64); torso.position.y = 1.16;
  const neck = part(new THREE.CylinderGeometry(.09, .1, .12, 16), skin, root, 'neck'); neck.position.y = 1.49;
  const head = part(new THREE.SphereGeometry(.205, 24, 18), skin, face, 'head'); head.scale.set(.9, 1.08, .88);
  const hairCap = part(new THREE.SphereGeometry(.216, 24, 12, 0, Math.PI * 2, 0, Math.PI * .48), hair, face, 'hair'); hairCap.position.y = .025;
  const eyeMat = material('#161419', .42);
  for (const x of [-.073, .073]) { const eye = part(new THREE.SphereGeometry(.022, 10, 8), eyeMat, face, 'eye'); eye.position.set(x, -.02, -.18); }
  const nose = part(new THREE.ConeGeometry(.025, .065, 8), skin, face, 'nose'); nose.rotation.x = -Math.PI / 2; nose.position.set(0, -.075, -.195);
  const mouth = part(new THREE.TorusGeometry(.045, .008, 6, 12, Math.PI), eyeMat, face, 'mouth'); mouth.rotation.x = Math.PI / 2; mouth.position.set(0, -.135, -.18);

  const leftArm = new THREE.Group(); leftArm.position.set(-.29, 1.35, 0); root.add(leftArm);
  const rightArm = new THREE.Group(); rightArm.position.set(.29, 1.35, 0); root.add(rightArm);
  for (const [arm, side] of [[leftArm, -1], [rightArm, 1]]) {
    const upper = capsule(.075, .30, shirt, arm, `${side < 0 ? 'left' : 'right'} upper arm`); upper.position.y = -.16;
    const elbow = new THREE.Group(); elbow.position.y = -.36; arm.add(elbow);
    const fore = capsule(.065, .28, skin, elbow, `${side < 0 ? 'left' : 'right'} forearm`); fore.position.y = -.14;
    const hand = part(new THREE.SphereGeometry(.075, 14, 10), skin, elbow, `${side < 0 ? 'left' : 'right'} hand`); hand.position.y = -.33;
    arm.userData.elbow = elbow; arm.userData.hand = hand;
  }
  const leftLeg = new THREE.Group(); leftLeg.position.set(-.12, .73, 0); root.add(leftLeg);
  const rightLeg = new THREE.Group(); rightLeg.position.set(.12, .73, 0); root.add(rightLeg);
  for (const [leg, side] of [[leftLeg, -1], [rightLeg, 1]]) {
    const thigh = capsule(.095, .30, pants, leg, `${side < 0 ? 'left' : 'right'} thigh`); thigh.position.y = -.18;
    const shin = new THREE.Group(); shin.position.y = -.42; leg.add(shin);
    const calf = capsule(.075, .27, pants, shin, `${side < 0 ? 'left' : 'right'} calf`); calf.position.y = -.14;
    const foot = part(new THREE.SphereGeometry(.105, 14, 8), shoes, shin, `${side < 0 ? 'left' : 'right'} shoe`); foot.scale.set(1.1, .55, 1.65); foot.position.set(0, -.32, -.075);
    leg.userData.shin = shin;
  }

  root.userData.name = String(prefs.name || 'Гость');

  const held = new THREE.Group(); held.name = 'Remote held item'; root.add(held);
  let heldType = '', heldBeerKey = '';
  function setHeld(action = {}) {
    const next = action.held === 'glass' || action.held === 'beer' ? action.held : (action.kind === 'glass' || action.kind === 'beer' ? action.kind : '');
    const nextKey = String(action.beerKey || '');
    if (next === heldType && nextKey === heldBeerKey && (next !== 'beer' || held.children.length)) return;
    while (held.children.length) {const child=held.children[0];held.remove(child);releaseHeld(child);}
    heldType = next; heldBeerKey = nextKey;
    if (next === 'beer') {
      const source = action.beerKey && getBeerModel?.(action.beerKey);
      if (source?.userData?.packageAsset) {
        const asset=source.userData.packageAsset,item=createPackageModel(asset),p=asset.profile;
        item.scale.setScalar((p.kind.includes('bottle')?.30:.205)/p.modelHeight); held.add(item);
      }
    } else if (next === 'glass') {
      const g=createServingGlass();g.userData.fill=Number(action.fill)||0;held.add(g);
    }
  }
  function animate(action = {}, dt = 1 / 60, distance = 0) {
    const kind = String(action.kind || 'idle');
    const walking = kind === 'walking' || kind === 'running';
    const seated = kind === 'seated';
    const jumping = kind === 'jump';
    const drinking = kind === 'drinking';
    const pouring = kind === 'pouring';
    const phase = (distance * (kind === 'running' ? 10 : 6)) % (Math.PI * 2);
    const swing = walking ? Math.sin(phase) * (kind === 'running' ? .55 : .34) : 0;
    leftLeg.rotation.x += (swing - leftLeg.rotation.x) * Math.min(1, dt * 12);
    rightLeg.rotation.x += (-swing - rightLeg.rotation.x) * Math.min(1, dt * 12);
    leftArm.rotation.x += (-swing * .62 - leftArm.rotation.x) * Math.min(1, dt * 12);
    rightArm.rotation.x += (swing * .62 - rightArm.rotation.x) * Math.min(1, dt * 12);
    if (jumping) {
      leftLeg.rotation.x = rightLeg.rotation.x = -.55;
      leftArm.rotation.x = rightArm.rotation.x = .35;
    } else if (seated) {
      leftLeg.rotation.x = rightLeg.rotation.x = -1.18;
      leftLeg.position.z = rightLeg.position.z = -.12;
      leftArm.rotation.x = rightArm.rotation.x = -.22;
    } else {
      leftLeg.position.z = rightLeg.position.z = 0;
    }
    if (pouring) { rightArm.rotation.x = -.95; rightArm.rotation.z = -.22; }
    if (drinking) { rightArm.rotation.x = -1.24; rightArm.rotation.z = -.15; }
    setHeld(action);
    held.visible = !!heldType;
    if(heldType==='glass'&&held.children[0]){held.children[0].userData.fill=Number(action.fill)||0;updateGlass(held.children[0],dt);}
    const actions = root.userData.motionActions;
    if (actions?.length) {
      const index = kind === 'jump' ? 2 : walking ? 1 : 0;
      const next = actions[index] || actions[0];
      if (next && root.userData.activeMotion !== next) {
        const previous=root.userData.activeMotion; next.reset().setEffectiveWeight(1).setEffectiveTimeScale(1).play();
        if(previous)next.crossFadeFrom(previous,.18,true); root.userData.activeMotion=next;
      }
      if(walking&&next)next.timeScale=kind==='running'?1.65:1;
      root.userData.mixer?.update(dt);
    }
    const model=root.userData.humanoidModel;
    if(model){
      const groundedPose=kind==='seated'||kind==='crouching'||kind==='crouch-walk';
      const special=groundedPose||kind==='lying'||kind==='paddling'||kind==='swimming'||kind==='urinating'||kind==='defecating',rest=root.userData.transportRest;
      model.rotation.set(0,Math.PI,0);model.position.y=root.userData.modelBaseY;
      if(special){for(const [name,r]of rest){const b=model.getObjectByName(name);b.quaternion.copy(r.q);b.position.copy(r.p);}
        const bend=(name,x,z=0)=>{const b=model.getObjectByName(name),r=rest.get(name);if(b&&r)b.quaternion.copy(r.q).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(x,0,z)));};
        model.position.z=0;
        if(groundedPose){poseGroundedBody(root,model,action,rest,distance);
        }else if(kind==='lying'){model.rotation.x=Math.PI/2;model.position.y=.11;model.position.z=-.92;bend('LeftArm',0,-1.15);bend('RightArm',0,1.15);bend('LeftForeArm',-.12);bend('RightForeArm',-.12);bend('LeftUpLeg',.05);bend('RightUpLeg',.05);bend('LeftLeg',-.10);bend('RightLeg',-.10);bend('Head',.06);
          model.updateWorldMatrix(true,true);
          for(const [side,sign]of [['Left',-1],['Right',1]]){const arm=model.getObjectByName(side+'Arm'),fore=model.getObjectByName(side+'ForeArm'),hand=model.getObjectByName(side+'Hand');if(arm&&fore&&hand)solveArm(arm,fore,hand,root.localToWorld(new THREE.Vector3(sign*.24,.20,-.12)),new THREE.Vector3(sign,.65,-.15).applyQuaternion(root.getWorldQuaternion(new THREE.Quaternion())));}
        }else if(kind==='urinating'||kind==='defecating'){
          const seated=kind==='defecating',t=(Date.now()-(action.startedAt||Date.now()))/1000;model.updateWorldMatrix(true,true);
          const hip=model.getObjectByName('Hips');if(seated&&hip)model.position.y+=.54-root.worldToLocal(hip.getWorldPosition(new THREE.Vector3())).y;
          bend('Spine',seated?.15+Math.sin(t*2)*.018:.04);bend('Head',seated?.14:.22);model.updateWorldMatrix(true,true);
          for(const [side,sign]of [['Left',-1],['Right',1]]){
            const thigh=model.getObjectByName(side+'UpLeg'),shin=model.getObjectByName(side+'Leg'),foot=model.getObjectByName(side+'Foot'),toe=model.getObjectByName(side+'ToeBase');
            if(thigh&&shin&&foot){solveArm(thigh,shin,foot,root.localToWorld(new THREE.Vector3(sign*(seated?.19:.14),.03,seated?-.38:-.03)),new THREE.Vector3(0,0,-1).applyQuaternion(root.getWorldQuaternion(new THREE.Quaternion())));if(toe)aimBone(foot,toe,root.localToWorld(new THREE.Vector3(sign*(seated?.19:.14),.02,seated?-.56:-.20)));}
            const arm=model.getObjectByName(side+'Arm'),fore=model.getObjectByName(side+'ForeArm'),hand=model.getObjectByName(side+'Hand');if(arm&&fore&&hand)solveArm(arm,fore,hand,root.localToWorld(new THREE.Vector3(sign*(seated?.19:side==='Left'?.20:.09),seated?.57:side==='Left'?.93:.86,seated?-.32:side==='Left'?-.09:-.18)),new THREE.Vector3(sign*.6,-.5,.15).applyQuaternion(root.getWorldQuaternion(new THREE.Quaternion())));if(!seated)for(const finger of ['Index','Middle','Ring','Pinky'])for(let j=1;j<=3;j++){const b=model.getObjectByName(side+'Hand'+finger+j),r=rest.get(side+'Hand'+finger+j);if(b&&r)b.quaternion.copy(r.q).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,0,1),(side==='Left'?-1:1)*.55));}
          }
        }else if(kind==='paddling'){
          model.updateWorldMatrix(true,true);const hip=model.getObjectByName('Hips');if(hip)model.position.y+=.48-root.worldToLocal(hip.getWorldPosition(new THREE.Vector3())).y;
          bend('Spine',.08+Math.cos(action.stroke||0)*.035);model.updateWorldMatrix(true,true);
          for(const [side,key,x]of [['Left','left',-.13],['Right','right',.13]]){
            const thigh=model.getObjectByName(side+'UpLeg'),shin=model.getObjectByName(side+'Leg'),foot=model.getObjectByName(side+'Foot'),toe=model.getObjectByName(side+'ToeBase');
            if(thigh&&shin&&foot){solveArm(thigh,shin,foot,root.localToWorld(new THREE.Vector3(x,.12,.40)),new THREE.Vector3(0,-.25,-1).applyQuaternion(root.getWorldQuaternion(new THREE.Quaternion())));if(toe)aimBone(foot,toe,root.localToWorld(new THREE.Vector3(x,.04,.64)));}
            root.userData.paddleGrips?.[key]?.update(action.paddle?.[key]);
          }
        }else{
          const t=performance.now()*.004;model.rotation.x=-Math.PI/2;model.position.y=1.0;model.position.z=1.5;
          bend('LeftArm',Math.sin(t)*1.0,-.45);bend('RightArm',Math.sin(t+Math.PI)*1.0,.45);bend('LeftForeArm',-.45);bend('RightForeArm',-.45);bend('LeftUpLeg',Math.sin(t*2)*.16);bend('RightUpLeg',-Math.sin(t*2)*.16);bend('LeftLeg',.16);bend('RightLeg',.16);
        }
      }else model.position.z=0;
      blendBodyPose(root,model,dt,kind);
      model.updateWorldMatrix(true,true);
      const head=model.getObjectByName('Head');root.userData.poseHeight=head?root.worldToLocal(head.getWorldPosition(new THREE.Vector3())).y+.12:root.userData.height;
    }
    root.userData.grip?.update(action);
  }
  root.userData.animate = animate;
  root.userData.height = 1.95;
  const geometries=new Set(),materials=new Set();root.traverse(o=>{if(o.isMesh){geometries.add(o.geometry);for(const mat of Array.isArray(o.material)?o.material:[o.material])materials.add(mat);}});
  root.userData.fallbackGeometries=geometries;root.userData.fallbackMaterials=materials;
  updateAvatarAppearance(root,prefs);return root;
}

export function updateHumanAvatar(root, action, dt, distance = 0) { root.userData.animate?.(action, dt, distance); }

// First-person body keeps complete arms/hands and legs while omitting the
// face and chest that would otherwise intersect the player's own camera.
export function prepareFirstPersonBody(root){
 for(const g of root.userData.firstPersonGeometries||[])g.dispose();root.userData.firstPersonGeometries=[];
 root.traverse(mesh=>{
  if(!mesh.isMesh)return;
  // Eyes, teeth, hair and the fitted beard can be separate meshes or use
  // eye/jaw bones instead of the head bone. Hide the complete head assembly.
  let headAttached=false;for(let p=mesh.parent;p&&p!==root;p=p.parent)if(/^(Head|Neck|.*Eye.*|Jaw)$/i.test(p.name))headAttached=true;
  if(headAttached||/Head|Eye|Teeth|Hair|Beard|Moustache/i.test(mesh.name)){mesh.visible=false;return;}
  if(!mesh.isSkinnedMesh)return;const source=mesh.geometry,indices=source.index,skin=source.attributes.skinIndex,weights=source.attributes.skinWeight;if(!skin||!weights)return;
  const hidden=new Set(mesh.skeleton.bones.map((b,i)=>{for(let p=b;p;p=p.parent)if(/Head|Neck|Eye|Jaw/i.test(p.name))return i;return -1;}).filter(i=>i>=0)),keep=[],groups=[],count=indices?indices.count:source.attributes.position.count;
  const invisible=v=>{let sum=0;for(const get of ['getX','getY','getZ','getW'])if(hidden.has(skin[get](v)))sum+=weights[get](v);return sum>.15;};
  for(let i=0;i<count;i+=3){const a=indices?indices.getX(i):i,b=indices?indices.getX(i+1):i+1,c=indices?indices.getX(i+2):i+2;if(!invisible(a)&&!invisible(b)&&!invisible(c)){const materialIndex=source.groups.find(g=>i>=g.start&&i<g.start+g.count)?.materialIndex||0,last=groups.at(-1);if(last&&last.materialIndex===materialIndex)last.count+=3;else groups.push({start:keep.length,count:3,materialIndex});keep.push(a,b,c);}}
  const geometry=source.clone();geometry.setIndex(keep);geometry.clearGroups();for(const g of groups)geometry.addGroup(g.start,g.count,g.materialIndex);mesh.geometry=geometry;mesh.castShadow=false;root.userData.firstPersonGeometries.push(geometry);
 });
}
