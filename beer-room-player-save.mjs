// Per-person return point. Only the physical player is saved; the editor camera
// never replaces it. Resolve against the authoritative layout before revealing.
export function createPlayerSave({camera,controls,environment,interior,getEditor,storage=localStorage}){
 let user={};try{user=JSON.parse(storage.getItem('currentUser')||'{}');}catch{}
 const key='kinosreda-room-position-v1:'+String(user.username||user.email||user.name||'guest').toLowerCase();let restored=false,tick=0;
 function read(){try{const p=JSON.parse(storage.getItem(key));if(!p||!['x','y','z','feetY','yaw','pitch'].every(k=>Number.isFinite(p[k]))||Math.abs(p.x)>190||p.z< -160||p.z>220||Math.abs(p.y)>80)return null;return p;}catch{return null;}}
 function save(){if(!restored)return;const w=getEditor(),s=w.active?w.saved.state:controls.state,p=w.active?w.saved.position:camera.position;let seat=null;if(s.seated)for(const r of w.registry?.records.values()||[]){const index=r.ss?.indexOf(s.seated);if(index>=0){seat={id:r.id,index};break;}}
 const value={x:p.x,y:p.y,z:p.z,feetY:s.feetY,yaw:s.yaw,pitch:s.pitch,open:environment.open,seat,seatYaw:s.seatYaw};if(s.toilet){value.x=s.toilet.exit?.x??p.x;value.z=s.toilet.exit?.z??p.z;value.feetY=environment.world.ground(value.x,value.z);value.y=value.feetY+1.64;value.seat=null;}
 try{storage.setItem(key,JSON.stringify(value));}catch{}
 }
 function restore(){if(restored)return;const p=read(),w=getEditor();if(p)environment.setOpen(p.open,{broadcast:false});const b=environment.world.bounds;
 let x=p?.x??(b.minX+b.maxX)/2+2,z=p?.z??(b.minZ+b.maxZ)/2+3;
 const seat=p?.seat&&w.registry?.getRecord(p.seat.id)?.ss?.[p.seat.index];if(seat&&!seat.disabled){camera.position.copy(seat.kind==='hammock'?seat.eyePosition:seat.seatPosition);camera.position.y=seat.kind==='hammock'?seat.eyePosition.y:seat.topY+.79;controls.setView(p.yaw,p.pitch);if(controls.sit(seat)){controls.state.seatYaw=seat.yaw??(Number.isFinite(p.seatYaw)?p.seatYaw:p.yaw);controls.setView(p.yaw,p.pitch);restored=true;return;}}
 function support(x,z){let y=environment.world.ground(x,z);if(p)for(const s of interior.surfaces){if(s.disabled||s.kind==='hammock'||!s.bounds||s.topY>p.feetY+.28||s.topY<p.feetY-.35)continue;const q=s.bounds;if(x>q.min.x&&x<q.max.x&&z>q.min.z&&z<q.max.z){const top=s.supportHeightAt?s.supportHeightAt(x,z):s.topY;if(top!=null)y=Math.max(y,top);}}return y;}
 function clear(x,z,y){return x>b.minX+.24&&x<b.maxX-.24&&z>b.minZ+.24&&z<b.maxZ-.24&&!interior.colliders.some(c=>!c.disabled&&x>=c.minX-.22&&x<=c.maxX+.22&&z>=c.minZ-.22&&z<=c.maxZ+.22&&y<(c.maxY??Infinity)-.012&&y+1.64>(c.minY??-Infinity)+.02&&(c.overlaps?c.overlaps(x,z,.22,y,1.64):true));}
 x=Math.max(b.minX+.3,Math.min(b.maxX-.3,x));z=Math.max(b.minZ+.3,Math.min(b.maxZ-.3,z));let feet=support(x,z);
 if(!clear(x,z,feet)){const cx=x,cz=z;search:for(let r=.35;r<=8;r+=.35)for(let angle=0;angle<Math.PI*2;angle+=.4){const nx=cx+Math.cos(angle)*r,nz=cz+Math.sin(angle)*r,ny=support(nx,nz);if(clear(nx,nz,ny)){x=nx;z=nz;feet=ny;break search;}}}
 const water=environment.world.water?.(x,z),swimming=water!=null&&water-feet>1;if(swimming)feet=water-.9;
 Object.assign(controls.state,{feetY:feet,eyeY:feet+(swimming?1.24:1.64),verticalVelocity:0,grounded:!swimming,swimming,waterBlend:swimming?1:0,seated:null});camera.position.set(x,controls.state.eyeY,z);controls.setView(p?.yaw??0,p?.pitch??0);camera.updateMatrixWorld(true);restored=true;
 }
 return{key,read,restore,save,get restored(){return restored;},update(dt){if(!restored)return;tick+=dt;if(tick>=1){tick=0;save();}}};
}
