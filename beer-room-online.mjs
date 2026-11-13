import * as THREE from './three.module.js';
import {roomSocketBase} from './beer-room-endpoints.mjs';
import {createHumanAvatar, updateHumanAvatar, updateAvatarAppearance, disposeHumanAvatar} from './beer-room-avatar.mjs';
import {createPackageModel, disposePackageInstance} from './beer-package-model.mjs';
import {createServingGlass} from './beer-room-glass.mjs';
import {readAvatarPrefs, avatarModel} from './beer-room-avatar-catalog.mjs';

function localId() {
  const key = 'kinosreda-beer-room-client';
  try { let value = sessionStorage.getItem(key); if (!value) { value = crypto.randomUUID(); sessionStorage.setItem(key, value); } return value; } catch { return `beer-${Math.random().toString(16).slice(2)}`; }
}
function name() { try { const user = JSON.parse(localStorage.getItem('currentUser') || '{}'); return user.name || user.username || user.email || 'Гость'; } catch { return 'Гость'; } }

function labelSprite(text) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 96; const x = c.getContext('2d');
  x.fillStyle = 'rgba(7,8,11,.76)'; x.roundRect(4, 4, 504, 88, 24); x.fill(); x.strokeStyle = 'rgba(244,185,65,.65)'; x.stroke();
  x.fillStyle = '#ffe8b0'; x.font = '700 30px RoomComfortaa, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(String(text || 'Гость').slice(0, 26), 256, 48);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthTest: false })); sprite.scale.set(.9, .17, 1); sprite.position.y = 2.12; return sprite;
}

export class BeerRoomOnline {
  constructor({scene, getBeerModel, getLocalState,onWorld,onSup,onSupDenied,onItem,onItemRemoved,getSup,onToilet,onToiletDenied,getToilet,onWorldLayout,onWorldPatch,onWorldEditDenied,onStateReady}) {
    Object.assign(this, {scene, getBeerModel, getLocalState,onWorld,onSup,onSupDenied,onItem,onItemRemoved,getSup,onToilet,onToiletDenied,getToilet,onWorldLayout,onWorldPatch,onWorldEditDenied,onStateReady});
    this.avatar=readAvatarPrefs();this.id = localId(); this.name = name(); this.users = new Map(); this.ws = null; this.connected = false; this.retry = 0; this.lastSent = 0; this.lastAction = '';
    this.disposed = false; this.items = new Map(); this.pendingItems = new Map(); this.presenceTimer = setInterval(() => this.sendPresence(), 50);
    this.connect();
  }
  connect() {
    if (this.ws || this.disposed) return;
    try { this.ws = new WebSocket(`${roomSocketBase()}?room=kinosreda-beer-room&id=${encodeURIComponent(this.id)}&name=${encodeURIComponent(this.name)}`); } catch { this.ws = null; this.retryLater(); return; }
    const socket=this.ws;
    this.ws.addEventListener('open', () => { if(this.ws!==socket)return;this.connected = true; clearTimeout(this.retry); this.retry = 0; this.sendPresence(true); });
    this.ws.addEventListener('message', event => { if(this.ws!==socket)return;let data; try { data = JSON.parse(event.data); } catch { return; } this.receive(data); });
    const closed = () => { if(this.ws!==socket)return;this.connected = false; this.ws = null; this.retryLater(); };
    this.ws.addEventListener('close', closed); this.ws.addEventListener('error', closed);
  }
  retryLater() { if (this.retry || this.disposed) return; this.retry = setTimeout(() => { this.retry = 0; this.connect(); }, 1500); }
  send(data) {
    if (!this.connected || this.ws?.readyState !== WebSocket.OPEN) return false;
    try { this.ws.send(JSON.stringify(data)); return true; } catch { return false; }
  }
  reconnect() {
    if (this.disposed) return;
    const socket=this.ws;this.ws=null;this.connected=false;
    clearTimeout(this.retry);this.retry=0;
    try { socket?.close(); } catch {}
    this.retryLater();
  }
  sendPresence(force = false) {
    const s = this.getLocalState?.(); if (!s) return;
    const now = performance.now(); const actionKey = JSON.stringify(s.action || {});
    if (!force && now - this.lastSent < 45 && actionKey === this.lastAction) return;
    this.lastSent = now; this.lastAction = actionKey;
    this.send({type:'presence', id:this.id, name:this.name, x:s.x, y:s.y, z:s.z, yaw:s.yaw, pitch:s.pitch, avatar:this.avatar, action:s.action});
  }
  setAvatar(prefs){this.avatar={...this.avatar,...prefs,model:avatarModel(prefs.model||this.avatar.model).id};try{localStorage.setItem('kinosreda-beer-avatar',JSON.stringify(this.avatar));}catch{}this.sendPresence(true);}
  sendWorld(open){this.send({type:'beer_world',open:!!open});}
  sendAction(action) { if(action.kind==='picked'){this.scene.userData.shadowsDirty=true;this.items.delete(String(action.itemId));this.pendingItems.delete(String(action.itemId));}this.send({type:'beer_action', id:this.id, name:this.name, ...action}); this.lastAction = ''; this.sendPresence(true); }
  placed(model) {
    const d=model.userData, id=d.onlineItemId || `${this.id}:${crypto.randomUUID()}`;
    this.scene.userData.shadowsDirty=true; d.onlineItemId=id; d.placed=true; this.items.set(id,model); this.pendingItems.delete(id);
    this.onItem?.(model,d.supAnchor);
    this.sendAction({kind:'placed',itemType:d.action==='glass'?'glass':'beer',glassShape:d.shape||'pint',liquidColor:d.liquid?.material.color.getHex(),fill:d.fill||0,anchor:d.supAnchor||null,beerKey:d.beerKey,itemId:id,surface:{x:model.position.x,y:model.position.y,z:model.position.z},rotation:{x:model.quaternion.x,y:model.quaternion.y,z:model.quaternion.z,w:model.quaternion.w}});
  }
  receive(data) {
    if(data.type==='world_patch'){this.onWorldPatch?.(data);return;}
    if(data.type==='world_edit_denied'){this.onWorldEditDenied?.(data);return;}
    if(data.type==='toilet_state'){this.onToilet?.(data.toilet);return;}
    if(data.type==='toilet_denied'){this.onToiletDenied?.(data.reason);return;}
    if(data.type==='sup_state'){this.onSup?.(data.boards);return;}
    if(data.type==='sup_denied'){this.onSupDenied?.(data);return;}
    if(data.type==='beer_world'){this.onWorld?.(!!data.open);return;}
    if (data.type === 'beer_state') {
      this.canEditWorld=!!data.canEditWorld;this.onWorldLayout?.(data.worldLayout);this.onWorld?.(!!data.openSpace);this.onSup?.(data.boards);this.onToilet?.(data.toilet);
      const userIds=new Set((data.users||[]).map(u=>String(u.id))), itemIds=new Set((data.items||[]).map(i=>String(i.id)));
      for(const id of this.users.keys())if(!userIds.has(id))this.remove(id);
      for(const id of this.items.keys())if(!itemIds.has(id))this.removeItem(id);
      (data.users||[]).forEach(user=>{if(user.id!==this.id)this.upsert(user);});
      (data.items||[]).forEach(item=>this.upsertItem(item));this.onStateReady?.(); return;
    }
    if (data.type === 'beer_user_join' || data.type === 'beer_presence' || data.type === 'beer_action') { if (data.user?.id !== this.id) this.upsert(data.user); return; }
    if (data.type === 'beer_user_leave') { this.remove(data.id); }
    if (data.type === 'beer_placed' && data.item?.owner!==this.id) { this.upsertItem(data.item); this.upsert(data.user); }
    if (data.type === 'beer_removed' && data.user?.id!==this.id) { this.removeItem(data.itemId); this.upsert(data.user); }
  }
  upsertItem(item) {
    if(!item?.id)return; const id=String(item.id), source=item.beerKey&&this.getBeerModel?.(item.beerKey);
    let group=this.items.get(id);
    if(!group){
      if(item.itemType==='glass'){group=createServingGlass(item.glassShape);group.userData.fill=Number(item.fill)||0;}
      else{if(!source?.userData?.packageAsset){this.pendingItems.set(id,item);return;}group=createPackageModel(source.userData.packageAsset);const p=source.userData.packageAsset.profile;group.scale.setScalar((p.kind.includes('bottle')?.30:.205)/p.modelHeight);}
      group.userData.remoteItem=true;group.userData.beerKey=item.beerKey;group.userData.onlineItemId=id;
      group.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;}});this.scene.add(group);this.items.set(id,group);
    }
    if(group.userData.held)return;if(item.itemType==='glass'){group.userData.fill=Number(item.fill)||0;if(Number.isInteger(item.liquidColor))group.userData.liquid.material.color.setHex(item.liquidColor);}
    group.position.set(Number(item.x)||0,Number(item.y)||0,Number(item.z)||0); group.quaternion.set(Number(item.qx)||0,Number(item.qy)||0,Number(item.qz)||0,Number.isFinite(Number(item.qw))?Number(item.qw):1).normalize();
    this.scene.userData.shadowsDirty=true; group.userData.placed=true; group.layers.set(0); this.pendingItems.delete(id);group.userData.supAnchor=item.anchor||null;this.onItem?.(group,item.anchor);
  }
  removeItem(id) {
    const key=String(id),group=this.items.get(key);this.pendingItems.delete(key);if(!group)return;this.items.delete(key);if(group.userData.held)return;
    this.scene.userData.shadowsDirty=true;this.scene.remove(group);this.onItemRemoved?.(group);
    if(group.userData.remoteItem){if(group.userData.packageAsset)disposePackageInstance(group);else group.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});}
  }
  upsert(user) {
    if (!user?.id) return;
    let remote = this.users.get(String(user.id));
    if (!remote) {
      const group = createHumanAvatar({...user.avatar, name:user.name}, key => this.getBeerModel?.(key));
      group.position.set(Number(user.x) || 0, Number(user.y) || 0, Number(user.z) || 0); this.scene.add(group);
      const label = labelSprite(user.name); group.add(label);
      group.rotation.y=Number(user.yaw)||0; remote = {snapshots:[],group, target:new THREE.Vector3(group.position.x,group.position.y,group.position.z), yaw:Number(user.yaw)||0, action:{kind:'idle'}, distance:0, label}; remote.group.userData.onlineId=String(user.id);this.users.set(String(user.id), remote);
    }
    updateAvatarAppearance(remote.group,user.avatar||{});
    remote.target.set(Number(user.x)||0, Number(user.y)||0, Number(user.z)||0); remote.yaw=Number(user.yaw)||0; remote.action=user.action||{kind:'idle'}; remote.group.userData.name=user.name||'Гость';
    const now=performance.now(); remote.snapshots.push({time:now,position:remote.target.clone(),yaw:remote.yaw,action:remote.action});
    if(remote.snapshots.length>32)remote.snapshots.shift();
  }
  remove(id) { const remote=this.users.get(String(id)); if (!remote)return; this.scene.userData.shadowsDirty=true; disposeHumanAvatar(remote.group); this.users.delete(String(id)); }
  update(dt) {
    for (const remote of this.users.values()) {
      const before=remote.group.position.clone(), frames=remote.snapshots, renderAt=performance.now()-100;
      while(frames.length>2&&frames[1].time<=renderAt)frames.shift();
      const a=frames[0],b=frames[1]||a;
      if(a){
        const t=b.time>a.time?THREE.MathUtils.clamp((renderAt-a.time)/(b.time-a.time),0,1):1;
        remote.group.position.lerpVectors(a.position,b.position,t);
        const dy=THREE.MathUtils.euclideanModulo(b.yaw-a.yaw+Math.PI,Math.PI*2)-Math.PI;
        remote.group.rotation.y=a.yaw+dy*t; remote.action=t<.5?a.action:b.action;
      }
      const board=this.getSup?.()?.boards.find(b=>b.userData.owner===remote.group.userData.onlineId);
      if(board){remote.group.position.copy(board.position);remote.group.position.y=board.userData.surface.topY;remote.group.rotation.y=board.rotation.y;remote.action={...remote.action,kind:'paddling',stroke:board.userData.state.phase,paddle:board.userData.paddleHands};}
      const toilet=this.getToilet?.();if(toilet?.state.owner===remote.group.userData.onlineId){const pose=toilet.poses[toilet.state.mode];remote.group.position.copy(pose.position);remote.group.rotation.y=pose.yaw;remote.action={kind:toilet.state.mode==='pee'?'urinating':'defecating',startedAt:toilet.state.startedAt};}
      if(remote.poseKind!==remote.action.kind){remote.poseKind=remote.action.kind;remote.poseShadowUntil=performance.now()+450;}
      const moved=before.distanceTo(remote.group.position);if(moved>.003||performance.now()<remote.poseShadowUntil||['walking','running','crouch-walk','jump','paddling','swimming','drinking','pouring'].includes(remote.action.kind))this.scene.userData.dynamicShadows=true;remote.distance+=moved; updateHumanAvatar(remote.group,remote.action,dt,remote.distance);remote.label.position.y=remote.action.kind==='lying'?.65:remote.action.kind==='paddling'?1.65:remote.action.kind==='swimming'?1.30:remote.action.kind==='defecating'?1.65:remote.action.kind==='seated'?1.15:['crouching','crouch-walk'].includes(remote.action.kind)?1.40:2.12;
    }
    if(this.pendingItems.size){for(const item of this.pendingItems.values())this.upsertItem(item);}
  }
  close() { this.disposed=true; clearInterval(this.presenceTimer); this.send({type:'leave',id:this.id}); try { this.ws?.close(); } catch {} this.ws=null; clearTimeout(this.retry); }
}
