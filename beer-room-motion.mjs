import {advanceSupBoard} from './beer-room-sup-physics.mjs';
const angle=x=>Math.atan2(Math.sin(x),Math.cos(x));
// Sender time removes packet-arrival jitter from the animation timeline.
export class RemoteTimeline {
 constructor(){this.frames=[];this.offset=Infinity;this.lastSeq=-1;}
 push(frame,arrival){
  if(Number.isFinite(frame.seq)&&frame.seq<=this.lastSeq)return false;
  const stamp=Number.isFinite(frame.sentAt)?frame.sentAt:arrival;
  if(Number.isFinite(frame.seq))this.lastSeq=frame.seq;
  if(this.frames.length&&stamp<=this.frames.at(-1).stamp)return false;
  this.offset=Math.min(this.offset,arrival-stamp);
  this.frames.push({...frame,stamp});if(this.frames.length>40)this.frames.shift();return true;
 }
 sample(now){
  const frames=this.frames;if(!frames.length)return null;
  const at=now-this.offset-50;
  while(frames.length>2&&frames[1].stamp<=at)frames.shift();
  const a=frames[0],b=frames[1]||a,span=b.stamp-a.stamp,t=span>0?Math.max(0,Math.min(1,(at-a.stamp)/span)):1;
  const out={x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,z:a.z+(b.z-a.z)*t,yaw:a.yaw+angle(b.yaw-a.yaw)*t,action:{...(t<.5?a.action:b.action)}};
  if(at>b.stamp&&['walking','running','jump','crouch-walk','swimming'].includes(b.action.kind)&&span>5&&span<300){
   const ahead=Math.min(140,at-b.stamp)/span,dx=b.x-a.x,dy=b.y-a.y,dz=b.z-a.z;
   if(Math.hypot(dx,dy,dz)/span<.015){out.x+=dx*ahead;out.y+=dy*ahead;out.z+=dz*ahead;}
  }
  if(a.action.kind===b.action.kind&&a.action.held===b.action.held){for(const k of ['drinkProgress','fill','stroke'])if(Number.isFinite(a.action[k])&&Number.isFinite(b.action[k]))out.action[k]=a.action[k]+(b.action[k]-a.action[k])*t;}
  return out;
 }
}
// Replay only unacknowledged input. Never attract a moving board to a stale pose.
export class SupPrediction {
 constructor(){this.seq=0;this.pending=[];this.outgoing=[];}
 step(state,dt){const cmd={seq:++this.seq,dt:Math.min(.05,Math.max(0,dt)),throttle:state.throttle||0,steer:state.steer||0,brake:!!state.brake};advanceSupBoard(state,cmd.dt);this.pending.push(cmd);this.outgoing.push(cmd);if(this.pending.length>240)this.pending.shift();}
 take(){return this.outgoing.splice(0);}
 reconcile(state,snapshot){
  this.pending=this.pending.filter(c=>c.seq>(snapshot.inputSeq||0));
  const controls={throttle:state.throttle,steer:state.steer,brake:state.brake},old={x:state.x,z:state.z,yaw:state.yaw};Object.assign(state,snapshot);
  for(const cmd of this.pending){Object.assign(state,{throttle:cmd.throttle,steer:cmd.steer,brake:cmd.brake});advanceSupBoard(state,cmd.dt);}
  Object.assign(state,controls);return{x:old.x-state.x,z:old.z-state.z,yaw:angle(old.yaw-state.yaw)};
 }
}
