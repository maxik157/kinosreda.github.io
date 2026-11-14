import test from 'node:test';import assert from 'node:assert/strict';
import {createSupStates,boardFitsWater,advanceSupBoard,separateSupBoards,releaseSup,SUP_LENGTH,SUP_WIDTH,supBoardDistance} from '../beer-room-sup-physics.mjs';
test('three full-size hulls float inside the shoreline',()=>{const b=createSupStates();assert.equal(b.length,3);assert.ok(SUP_LENGTH>3.7&&SUP_WIDTH>.95);for(const s of b)assert.ok(boardFitsWater(s.x,s.z,s.yaw));});
test('paddling accelerates, turns, brakes and never crosses the bank',()=>{const b=createSupStates()[0];b.throttle=1;for(let i=0;i<200;i++)advanceSupBoard(b,.05);assert.ok(b.z>58);assert.ok(b.speed>2.6);const yaw=b.yaw;b.steer=1;for(let i=0;i<50;i++)advanceSupBoard(b,.05);assert.ok(Math.abs(b.yaw-yaw)>1);b.throttle=1;b.brake=true;for(let i=0;i<50;i++)advanceSupBoard(b,.05);assert.ok(b.speed<.01);b.throttle=1;b.brake=false;b.steer=0;for(let i=0;i<2000;i++)advanceSupBoard(b,.05);assert.ok(boardFitsWater(b.x,b.z,b.yaw));});
test('hulls separate and releasing one rider leaves the other boards occupied',()=>{const b=createSupStates();b[0].x=b[1].x;b[0].z=b[1].z;for(let i=0;i<15;i++)separateSupBoards(b);assert.ok(Math.hypot(b[0].x-b[1].x,b[0].z-b[1].z)>.8);b[0].owner='a';b[1].owner='b';releaseSup(b,'a');assert.equal(b[0].owner,null);assert.equal(b[1].owner,'b');});

test('edited hull dimensions affect shore checks and separation',()=>{const a={...createSupStates()[0],sx:2,sy:1.2,sz:1.7,x:5,z:39.6,yaw:Math.PI};assert.equal(boardFitsWater(a.x,a.z,a.yaw,a),false);Object.assign(a,{x:5,z:65,throttle:1});for(let i=0;i<1600;i++)advanceSupBoard(a,.05);assert.ok(boardFitsWater(a.x,a.z,a.yaw,a));const b={...a,id:'other',x:a.x+.5};for(let i=0;i<25;i++)separateSupBoards([a,b]);assert.ok(Math.hypot(a.x-b.x,a.z-b.z)>SUP_WIDTH*1.8);});

test('an enlarged hull touching the bank can paddle back to open water',()=>{const b={...createSupStates()[0],sx:2,sz:1.7,z:39.6,yaw:Math.PI,throttle:1};assert.equal(boardFitsWater(b.x,b.z,b.yaw,b),false);for(let i=0;i<240;i++)advanceSupBoard(b,.05);assert.ok(b.z>55);assert.ok(boardFitsWater(b.x,b.z,b.yaw,b));});
test('mount reach is measured from the hull, including scaled noses',()=>{const b={...createSupStates()[0],sz:2,yaw:0};assert.ok(supBoardDistance(b.x,b.z+SUP_LENGTH+.5,b)<.51);assert.ok(supBoardDistance(b.x+4,b.z,b)>3);});

test('short SUP input responds, releases and reverses without seconds of inertia',()=>{
 const b={...createSupStates()[0],x:15,z:70,yaw:0,throttle:1};
 for(let i=0;i<4;i++)advanceSupBoard(b,1/60);assert.ok(b.speed>1.5);
 for(let i=0;i<14;i++)advanceSupBoard(b,1/60);b.throttle=-1;
 for(let i=0;i<6;i++)advanceSupBoard(b,1/60);assert.ok(b.speed<-.4);
 b.throttle=0;for(let i=0;i<14;i++)advanceSupBoard(b,1/60);assert.ok(Math.abs(b.speed)<.015);
});
test('rider poses reject stale sequences, previous claims, invalid hulls and teleports',async()=>{
 const {applySupPose}=await import('../beer-room-sup-physics.mjs');
 const b={...createSupStates()[0],x:15,z:70,yaw:0,controlEpoch:2,lastInputAt:1000,poseSeq:0};
 const pose={controlEpoch:2,seq:1,sentAt:50,x:15,z:69.9,yaw:0,speed:2,phase:.1,throttle:1};
 assert.equal(applySupPose(b,pose,1100),true);
 assert.equal(applySupPose(b,{...pose,seq:3,sentAt:150,z:69.65},1200),true);const saved=JSON.stringify(b);
 for(const p of [{...pose,seq:2,sentAt:100},{...pose,seq:4,sentAt:200,controlEpoch:1},{...pose,seq:4,sentAt:200,x:80},{...pose,seq:4,sentAt:200,x:NaN},{...pose,seq:4,sentAt:200,speed:10},{...pose,seq:4,sentAt:100}])assert.equal(applySupPose(b,p,1250),false);
 assert.equal(JSON.stringify(b),saved);assert.equal(b.z,69.65);
});
