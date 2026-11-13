import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,copyFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
const temp=await mkdtemp(join(tmpdir(),'kinosreda-collision-'));
await writeFile(join(temp,'package.json'),JSON.stringify({type:'module'}));
await copyFile(new URL('../three.module.js',import.meta.url),join(temp,'three.module.js'));
await copyFile(new URL('../beer-room-collision.mjs',import.meta.url),join(temp,'beer-room-collision.mjs'));
const T=await import(pathToFileURL(join(temp,'three.module.js')));
const {setTransformedBox,captureCollider}=await import(pathToFileURL(join(temp,'beer-room-collision.mjs')));
test.after(()=>rm(temp,{recursive:true,force:true}));
import {moveWithCollisions} from '../beer-room-controls.mjs';
const box=new T.Box3(new T.Vector3(-2,0,-.26),new T.Vector3(2,.55,.26));
const matrix=(scale=1)=>new T.Matrix4().compose(new T.Vector3(),new T.Quaternion().setFromAxisAngle(new T.Vector3(0,1,0),Math.PI/4),new T.Vector3(scale,1.2,.65));
test('scaled rotated bench blocks its timber and leaves empty AABB corners walkable',()=>{
 const c=setTransformedBox({},box,matrix(1.7));
 assert.ok(c.overlaps(0,0,.22,0,1.64));assert.equal(c.overlaps(2,2,.22,0,1.64),false);assert.equal(c.supportHeightAt(2,2),null);assert.ok(Math.abs(c.supportHeightAt(0,0)-.66)<1e-6);
 const p={x:1.7,z:1.7};moveWithCollisions(p,.5,.5,[c],.22);assert.ok(p.x>2.19&&p.z>2.19);
 const q={x:0,z:1};moveWithCollisions(q,0,-2,[c],.22);assert.ok(q.z>.35);
 for(let i=0;i<20;i++)setTransformedBox(c,box,matrix(1.7));assert.equal(c.overlaps(2,2,.22,0,1.64),false);
});
test('local collision frame survives a rotated and scaled parent without AABB inflation',()=>{
 const root=new T.Group(),part=new T.Object3D();root.rotation.y=.7;root.scale.set(1.8,.7,.6);root.add(part);part.position.set(1,0,0);part.rotation.y=.3;root.updateMatrixWorld(true);
 const c={localRoot:part,localBox:box},captured=captureCollider(c,root),actual=root.matrixWorld.clone().multiply(captured.frame);assert.ok(actual.elements.every((x,i)=>Math.abs(x-part.matrixWorld.elements[i])<1e-10));
 setTransformedBox(c,captured.box,actual);const center=new T.Vector3(0,.2,0).applyMatrix4(part.matrixWorld);assert.ok(c.overlaps(center.x,center.z,.1,center.y,1));
});
test('tilted overhead panels allow walking underneath and block the actual canvas',()=>{
 const b=new T.Box3(new T.Vector3(-2,-.02,-1),new T.Vector3(2,.02,1)),m=new T.Matrix4().compose(new T.Vector3(0,2,0),new T.Quaternion().setFromAxisAngle(new T.Vector3(0,0,1),.35),new T.Vector3(1,1,1)),c=setTransformedBox({},b,m);
 assert.equal(c.overlaps(1,0,.22,0,1.64),false);assert.equal(c.overlaps(0,0,.22,1.6,1.64),true);
});
