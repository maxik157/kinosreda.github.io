import test from 'node:test';
import assert from 'node:assert/strict';
import {RemoteTimeline,SupPrediction} from '../beer-room-motion.mjs';
import {advanceSupBoard} from '../beer-room-sup-physics.mjs';
const state=()=>({id:'sup-0',owner:'a',x:15,z:75,yaw:0,speed:0,phase:0,throttle:0,steer:0});
test('sender timeline absorbs irregular packet arrival and interpolates gestures',()=>{
 const t=new RemoteTimeline(),positions=[];
 // Monotonic delivery with variable delay, including a missing update.
 const arrivals=[40,80,125,126,190,210,270,271,318];let j=0;
 for(let now=0;now<500;now+=5){while(j<arrivals.length&&arrivals[j]<=now){t.push({seq:j,sentAt:j*33,x:j*.099,y:0,z:0,yaw:0,action:{kind:'walking',drinkProgress:j/10}},now);j++;}const p=t.sample(now);if(p)positions.push(p.x);}
 const steps=positions.slice(1).map((p,i)=>p-positions[i]);assert.ok(Math.min(...steps)>-.04);assert.ok(Math.max(...steps)<.19);assert.ok(positions.at(-1)>.95);
 assert.equal(t.push({seq:1,sentAt:1},600),false);
});
test('three locally predicted boards respond immediately despite 180ms round trips',()=>{
 for(let n=0;n<3;n++){
  const p=new SupPrediction(),local=state(),server=state(),ideal=state(),packets=[],acks=[];local.x=server.x=ideal.x=12+n*4;let maxCorrection=0;
  for(let frame=0;frame<360;frame++){
   const now=frame/60,controls={throttle:frame<250?1:0,steer:frame>60&&frame<150?.6:0,brake:frame>=250};Object.assign(local,controls);Object.assign(ideal,controls);p.step(local,1/60);advanceSupBoard(ideal,1/60);
   if(frame%3===0)packets.push({at:now+.07+(frame%7)*.002,inputs:p.take()});
   while(packets[0]?.at<=now){for(const c of packets.shift().inputs){Object.assign(server,c);advanceSupBoard(server,c.dt);server.inputSeq=c.seq;}acks.push({at:now+.09,state:{...server}});}
   while(acks[0]?.at<=now){const error=p.reconcile(local,acks.shift().state);maxCorrection=Math.max(maxCorrection,Math.hypot(error.x,error.z));}
   assert.ok(Math.hypot(local.x-ideal.x,local.z-ideal.z)<.0001);
   if(frame===4)assert.ok(local.speed>.2,'input must work before any acknowledgement');
  }
  assert.ok(maxCorrection<1e-8);assert.ok(p.pending.length<20);
 }
});
