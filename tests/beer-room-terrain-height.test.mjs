import test from 'node:test';import assert from 'node:assert/strict';
import {createTerrainHeightStore} from '../beer-room-terrain-height.mjs';
import {emptyWorld,applyWorldPatch,restoreWorld} from '../beer-room-world-state.mjs';
import {mkdtemp,copyFile,writeFile,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';import {pathToFileURL} from 'node:url';
const temp=await mkdtemp(join(tmpdir(),'kinosreda-terrain-'));await writeFile(join(temp,'package.json'),'{"type":"module"}');
for(const file of ['three.module.js','beer-room-terrain-mesh.mjs','beer-room-terrain-raycast.mjs','beer-room-terrain.mjs','beer-room-terrain-height.mjs','beer-room-site.mjs'])await copyFile(new URL('../'+file,import.meta.url),join(temp,file));
const T=await import(pathToFileURL(join(temp,'three.module.js'))),{terrainGeometry}=await import(pathToFileURL(join(temp,'beer-room-terrain-mesh.mjs'))),{accelerateTerrainRaycast}=await import(pathToFileURL(join(temp,'beer-room-terrain-raycast.mjs')));test.after(()=>rm(temp,{recursive:true,force:true}));
const brush=(id,material,extra={})=>({id:'terrain:'+id,expected:0,material,amount:.5,level:0,radius:3,softness:.7,strength:1,points:[[10,10]],...extra});
test('sculpting is deterministic, feathered, undoable, and restores original terrain',()=>{
 const w=emptyWorld(),a=createTerrainHeightStore(),base=(x,z)=>x*.1;
 const first=applyWorldPatch(w,brush('12345678-aaaa','raise',{points:[[10,10],[10.2,10],[10,10]]}));assert.ok(first.entry);
 a.snapshot(w.entries,base);assert.ok(Math.abs(a.sample(10,10)-.5)<1e-6);assert.ok(a.sample(12,10)>0&&a.sample(12,10)<.5);assert.equal(a.sample(14,10),0);
 applyWorldPatch(w,brush('12345678-bbbb','lower'));a.snapshot(w.entries,base);assert.ok(Math.abs(a.sample(10,10))<1e-6);
 applyWorldPatch(w,brush('12345678-cccc','flatten',{level:1.8}));a.snapshot(w.entries,base);assert.ok(Math.abs(a.sample(10,10)-.8)<1e-6);
 const b=createTerrainHeightStore();b.snapshot(restoreWorld(JSON.parse(JSON.stringify(w))).entries,base);assert.equal(b.sample(10,10),a.sample(10,10));
 applyWorldPatch(w,brush('12345678-dddd','restore'));a.snapshot(w.entries,base);assert.ok(Math.abs(a.sample(10,10))<1e-6);
 applyWorldPatch(w,{id:'terrain:12345678-dddd',expected:1,deleted:true});a.snapshot(w.entries,base);assert.ok(Math.abs(a.sample(10,10)-.8)<1e-6);
 a.preview(brush('12345678-gggg','raise',{points:[[60,60]]}),base);const cancelBounds=a.snapshot(w.entries,base);assert.ok(cancelBounds.maxX>=63&&cancelBounds.minX<=7);assert.equal(a.sample(60,60),0);
 const before=a.sample(10,10);a.preview(brush('12345678-eeee','lower'),base);assert.ok(a.sample(10,10)<before);assert.ok(a.snapshot(w.entries,base));assert.equal(a.sample(10,10),before);
 const c=createTerrainHeightStore();c.preview(brush('12345678-ffff','raise'),base);assert.ok(c.snapshot({},base));assert.equal(c.sample(10,10),0);
});
test('sculpt and four-corner fields validate without accepting malformed shared state',()=>{
 for(const bad of [{amount:0},{amount:2},{level:Infinity}])assert.ok(applyWorldPatch(emptyWorld(),brush('12345678-aaaa','raise',bad)).error);
 for(const material of ['grass-add','grass-remove'])assert.ok(applyWorldPatch(emptyWorld(),brush('12345678-aaaa',material)).entry);
 const w=emptyWorld();assert.ok(applyWorldPatch(w,{id:'added:12345678-aaaa',source:'prop:garland',expected:0,x:0,z:0,yaw:.477348,anchorA:'camp:gazebo',anchorCornerA:3}).entry);assert.equal(restoreWorld(JSON.parse(JSON.stringify(w))).entries['added:12345678-aaaa'].anchorCornerA,3);assert.ok(applyWorldPatch(w,{id:'added:12345678-aaaa',expected:1,anchorCornerA:4}).error);
});
test('adaptive terrain raycast matches real triangles before and after height edits',()=>{
 const geometry=terrainGeometry(),ground=new T.Mesh(geometry,new T.MeshBasicMaterial()),native=T.Mesh.prototype.raycast;accelerateTerrainRaycast(ground,geometry.userData.terrainGrid);ground.updateMatrixWorld(true);
 for(const [x,z]of [[10,10],[-110,150],[40,42]]){const ray=new T.Raycaster(new T.Vector3(x,30,z),new T.Vector3(0,-1,0),0,100),a=[],b=[];native.call(ground,ray,a);ground.raycast(ray,b);assert.equal(b.length,a.length);assert.ok(b.length);assert.ok(b[0].point.distanceTo(a[0].point)<1e-6);}
 const pos=geometry.attributes.position;for(let i=0;i<pos.count;i++)if(Math.hypot(pos.getX(i)-10,pos.getZ(i)-10)<3)pos.setY(i,pos.getY(i)+.7);geometry.computeBoundingSphere();geometry.computeBoundingBox();const ray=new T.Raycaster(new T.Vector3(10,30,10),new T.Vector3(0,-1,0),0,100),a=[],b=[];native.call(ground,ray,a);ground.raycast(ray,b);assert.ok(a[0].point.distanceTo(b[0].point)<1e-6);
});
