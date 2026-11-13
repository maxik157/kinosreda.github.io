import test from 'node:test';
import assert from 'node:assert/strict';
import {createPlayerSave} from '../beer-room-player-save.mjs';

function setup(){
 const data=new Map(),storage={getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v)};
 const vector=(x=0,y=0,z=0)=>({x,y,z,set(x,y,z){Object.assign(this,{x,y,z});},copy(p){Object.assign(this,{x:p.x,y:p.y,z:p.z});}});
 const camera={position:vector(),updateMatrixWorld(){}},controls={state:{feetY:0,yaw:0,pitch:0},setView(yaw,pitch){Object.assign(this.state,{yaw,pitch});},sit(s){this.state.seated=s;return true;}};
 const environment={open:false,world:{bounds:{minX:-20,maxX:20,minZ:-20,maxZ:20},ground:()=>0,water:()=>null},setOpen(value){this.open=!!value;}};
 const interior={colliders:[],surfaces:[]},records=new Map(),editor={active:false,registry:{records,getRecord:id=>records.get(id)}};
 const save=createPlayerSave({camera,controls,environment,interior,getEditor:()=>editor,storage});
 return{save,data,storage,camera,controls,environment,interior,records,editor,vector};
}
const position={x:4,y:1.64,z:5,feetY:0,yaw:.6,pitch:-.2,open:true};

test('return position waits for restore and avoids furniture moved into its place',()=>{
 const r=setup();r.storage.setItem(r.save.key,JSON.stringify(position));r.save.save();assert.deepEqual(r.save.read(),position);
 r.interior.colliders.push({minX:3.7,maxX:4.3,minZ:4.7,maxZ:5.3});r.save.restore();
 assert.ok(Math.hypot(r.camera.position.x-4,r.camera.position.z-5)>.5);assert.equal(r.controls.state.yaw,.6);assert.equal(r.environment.open,true);
 const p={...r.camera.position};r.save.restore();assert.deepEqual(r.camera.position,p);
});
test('corrupt saved data uses a safe newcomer location',()=>{
 const r=setup();r.storage.setItem(r.save.key,JSON.stringify({...position,x:9999}));r.save.restore();assert.equal(r.camera.position.x,2);assert.equal(r.camera.position.z,3);assert.equal(r.controls.state.feetY,0);
});
test('editor camera never overwrites the physical player position or view',()=>{
 const r=setup();r.save.restore();r.editor.active=true;r.editor.saved={position:r.vector(6,2.64,8),state:{feetY:1,yaw:.9,pitch:-.3}};r.camera.position.set(90,70,90);r.save.save();
 const p=r.save.read();assert.deepEqual([p.x,p.y,p.z,p.feetY,p.yaw,p.pitch],[6,2.64,8,1,.9,-.3]);
});
test('returning to a moved seat restores its current position',()=>{
 const r=setup(),seat={seatPosition:r.vector(9,.8,3),topY:.8};r.records.set('chair:1',{id:'chair:1',ss:[seat]});r.storage.setItem(r.save.key,JSON.stringify({...position,seat:{id:'chair:1',index:0}}));r.save.restore();
 assert.equal(r.controls.state.seated,seat);assert.equal(r.camera.position.x,9);assert.equal(r.camera.position.y,1.59);r.save.save();assert.deepEqual(r.save.read().seat,{id:'chair:1',index:0});
});

test('seated body heading restores independently from the camera heading',()=>{const r=setup(),seat={seatPosition:r.vector(9,.8,3),topY:.8};r.records.set('chair:1',{id:'chair:1',ss:[seat]});r.storage.setItem(r.save.key,JSON.stringify({...position,yaw:2.5,seatYaw:.7,seat:{id:'chair:1',index:0}}));r.save.restore();assert.equal(r.controls.state.yaw,2.5);assert.equal(r.controls.state.seatYaw,.7);r.save.save();assert.equal(r.save.read().seatYaw,.7);});
