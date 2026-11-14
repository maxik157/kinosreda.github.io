// Shared deterministic transport simulation. No rendering or browser APIs.
export const SUP_SCALE=1.48;
export const SUP_LENGTH=3.2004*SUP_SCALE;
export const SUP_WIDTH=.8128*SUP_SCALE;
export const WATER_Y=-4.6;
export function createSupStates(){return [5.6,7.65,9.7].map((x,i)=>({id:'sup-'+i,x,z:41.5+i*.18,yaw:Math.PI+(i-1)*.09,speed:0,owner:null,throttle:0,steer:0,brake:false,phase:i*.5,updatedAt:0}));}
export function lakeRadius(x,z){const dx=(x-15)/66,dz=(z-79)/44,a=Math.atan2(dz,dx);return Math.hypot(dx,dz)/(1+.045*Math.sin(a*5)+.025*Math.cos(a*9));}
export function supBoardDistance(x,z,b){
 const dx=x-b.x,dz=z-b.z,along=Math.abs(dx*Math.sin(b.yaw)+dz*Math.cos(b.yaw)),across=Math.abs(dx*Math.cos(b.yaw)-dz*Math.sin(b.yaw));
 return Math.hypot(Math.max(0,along-SUP_LENGTH/2*(b.sz??1)),Math.max(0,across-SUP_WIDTH/2*(b.sx??1)));
}
function waterExtent(x,z,yaw,size={}){let max=0;for(const along of [-SUP_LENGTH/2*(size.sz??1),0,SUP_LENGTH/2*(size.sz??1)])for(const across of [-SUP_WIDTH/2*(size.sx??1),SUP_WIDTH/2*(size.sx??1)])max=Math.max(max,lakeRadius(x+Math.sin(yaw)*along+Math.cos(yaw)*across,z+Math.cos(yaw)*along-Math.sin(yaw)*across));return max;}
export function boardFitsWater(x,z,yaw,size={}){
 return waterExtent(x,z,yaw,size)<=.985;
}
export function advanceSupBoard(b,dt){
 if(b.deleted)return b;
 dt=Math.max(0,Math.min(.05,dt));const throttle=Math.max(-1,Math.min(1,Number(b.throttle)||0)),steer=Math.max(-1,Math.min(1,Number(b.steer)||0));
 const target=b.brake?0:throttle*(throttle<0?1.05:2.75);
 // Short, perceptible easing without storing a player's old intention as
 // seconds of momentum. Releasing/reversing a key must work immediately.
 const response=b.brake?24:!throttle||b.speed*target<0?20:14;
 const blend=1-Math.exp(-dt*response);b.speed+=(target-b.speed)*blend;if(Math.abs(b.speed)<.002)b.speed=0;
 const yaw=b.yaw-steer*dt*(.70+Math.min(1,Math.abs(b.speed)/2.75)*.55),x=b.x-Math.sin(yaw)*b.speed*dt,z=b.z-Math.cos(yaw)*b.speed*dt;
 if(boardFitsWater(x,z,yaw,b)||waterExtent(x,z,yaw,b)<waterExtent(b.x,b.z,b.yaw,b)-1e-8){b.x=x;b.z=z;b.yaw=yaw;}else{b.speed*=Math.exp(-dt*14);if(boardFitsWater(b.x,b.z,yaw,b)||waterExtent(b.x,b.z,yaw,b)<waterExtent(b.x,b.z,b.yaw,b)-1e-8)b.yaw=yaw;}
 b.phase+=((Math.abs(throttle)>.05||Math.abs(steer)>.05)?3.9:0)*dt;
 return b;
}
export function separateSupBoards(boards){
 // Capsules approximate the hull, keeping the noses and rails from crossing.

 for(let i=0;i<boards.length;i++)for(let j=i+1;j<boards.length;j++){
  const a=boards[i],b=boards[j];if(a.deleted||b.deleted)continue;const ra=SUP_WIDTH*.5*(a.sx??1),rb=SUP_WIDTH*.5*(b.sx??1),ha=Math.max(0,SUP_LENGTH*.5*(a.sz??1)-ra),hb=Math.max(0,SUP_LENGTH*.5*(b.sz??1)-rb);let best=Infinity,dx=0,dz=0;
  for(let sample=-2;sample<=2;sample++){
   const ax=a.x+Math.sin(a.yaw)*ha*sample/2,az=a.z+Math.cos(a.yaw)*ha*sample/2;
   const t=Math.max(-hb,Math.min(hb,(ax-b.x)*Math.sin(b.yaw)+(az-b.z)*Math.cos(b.yaw))),bx=b.x+Math.sin(b.yaw)*t,bz=b.z+Math.cos(b.yaw)*t,d=Math.hypot(ax-bx,az-bz);
   if(d<best){best=d;dx=ax-bx;dz=az-bz;}
  }
  if(best>=ra+rb+.04)continue;const amount=(ra+rb+.04-best)*.5;if(best<.001){dx=1;dz=0;best=1;}
  const ax=a.x+dx/best*amount,az=a.z+dz/best*amount,bx=b.x-dx/best*amount,bz=b.z-dz/best*amount;
  if(boardFitsWater(ax,az,a.yaw,a)){a.x=ax;a.z=az;}if(boardFitsWater(bx,bz,b.yaw,b)){b.x=bx;b.z=bz;}a.speed*=.85;b.speed*=.85;
 }
}
// A rider publishes its current hull pose, never a backlog of control commands.
// Sequence + claim epoch reject delayed packets from a previous ride. Bounds
// allow ordinary packet jitter while rejecting teleports or invalid poses.
export function applySupPose(b,pose,now=Date.now()){
 if(pose.controlEpoch!==b.controlEpoch||!Number.isSafeInteger(pose.seq)||pose.seq<=(b.poseSeq||0))return false;
 if(!['x','z','yaw','speed','phase','sentAt'].every(k=>Number.isFinite(pose[k])))return false;
 if(Math.abs(pose.speed)>2.76||Math.abs(pose.x)>250||Math.abs(pose.z)>250||pose.phase<0||Math.abs(pose.yaw)>1e6)return false;
 if(b.poseSeq&&pose.sentAt<=(b.clientAt||0))return false;
 const elapsed=b.poseSeq?(pose.sentAt-b.clientAt)/1000:Math.max(0,(now-b.lastInputAt)/1000);
 if(Math.hypot(pose.x-b.x,pose.z-b.z)>.35+3.2*Math.min(5,Math.max(0,elapsed)))return false;
 if(waterExtent(pose.x,pose.z,pose.yaw,b)>Math.max(.995,waterExtent(b.x,b.z,b.yaw,b)+.002))return false;
 for(const k of ['x','z','yaw','speed','phase'])b[k]=pose[k];
 b.throttle=Math.max(-1,Math.min(1,Number(pose.throttle)||0));b.steer=Math.max(-1,Math.min(1,Number(pose.steer)||0));b.brake=!!pose.brake;
 b.poseSeq=pose.seq;b.clientAt=pose.sentAt;b.lastInputAt=now;b.poseDriven=true;
 return true;
}
export function releaseSup(boards,id){for(const b of boards)if(b.owner===id){if(b.poseDriven)b.speed=0;b.poseDriven=false;b.owner=null;b.throttle=b.steer=0;b.brake=true;}}
export function publicSupState(b){return{id:b.id,deleted:!!b.deleted,sx:b.sx??1,sy:b.sy??1,sz:b.sz??1,x:b.x,z:b.z,yaw:b.yaw,speed:b.speed,owner:b.owner,phase:b.phase,inputSeq:b.inputSeq||0,controlEpoch:b.controlEpoch||0,poseSeq:b.poseSeq||0,clientAt:b.clientAt,serverAt:Date.now(),brake:!!b.brake,throttle:b.throttle,steer:b.steer};}
