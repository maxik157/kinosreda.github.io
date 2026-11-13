import test from 'node:test';
import assert from 'node:assert/strict';
import {viewBasis,moveWithCollisions,overlaps,bodyPresence} from '../beer-room-controls.mjs';
test('forward follows the camera at every yaw, including a quarter turn',()=>{
 for(const yaw of [0,.6,Math.PI/2,Math.PI,-Math.PI/2]){const {forward:f,right:r}=viewBasis(yaw);assert.ok(Math.abs(f.x*r.x+f.z*r.z)<1e-10);assert.ok(Math.abs(f.x+Math.sin(yaw))<1e-10);assert.ok(Math.abs(f.z+Math.cos(yaw))<1e-10);}
 assert.ok(viewBasis(Math.PI/2).forward.x<-.99);
});
test('collision blocks crossing a thin wall even at high speed, while allowing sliding',()=>{
 const box={minX:1,maxX:1.1,minZ:-10,maxZ:10};const p={x:0,z:0};moveWithCollisions(p,5,3,[box]);assert.ok(p.x<.77);assert.ok(p.z>2.99);assert.equal(overlaps(p.x,p.z,.24,box),false);
});
test('central aisle reaches the front of shelves with no invisible counter',()=>{
 const shelves={minX:-8.875,maxX:8.875,minZ:-7.82,maxZ:-6.82};for(const x of [-6,0,6]){const p={x,z:4};moveWithCollisions(p,0,-20,[shelves]);assert.ok(p.z< -6.5&&p.z>= -6.59);}
});
test('diagonal collision cannot leave the room or enter a furniture corner',()=>{
 const box={minX:2,maxX:3,minZ:2,maxZ:4},p={x:1,z:1};moveWithCollisions(p,2,2,[box]);assert.equal(overlaps(p.x,p.z,.24,box),false);moveWithCollisions(p,100,100,[box]);assert.ok(p.x<=9.64&&p.z<=7.95);
});

test('seated body stays at the seat anchor and heading while camera turns and settles',()=>{const state={feetY:.56,yaw:0,seatYaw:.7,seated:{seatPosition:{x:2,z:3},yaw:.7}},camera={x:1,z:4};const before=bodyPresence(state,camera);state.yaw=2.9;camera.x=2;camera.z=3;assert.deepEqual(bodyPresence(state,camera),before);state.seated=null;assert.equal(bodyPresence(state,camera).yaw,2.9);});
