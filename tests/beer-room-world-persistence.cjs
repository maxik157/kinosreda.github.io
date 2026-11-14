const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const create=require('../services/beer_world_editor');
test('journal acknowledges concurrent durable edits without blocking other work, and replays after restart',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'world-journal-'));process.env.BEER_WORLD_FILE=path.join(dir,'world.json');
 try{const service=create(dir);let state={format:1,revision:0,entries:{}},ticks=0;const timer=setInterval(()=>ticks++,1);let queue=Promise.resolve();for(let i=1;i<=100;i++)queue=queue.then(async()=>{const entry={id:'tree:'+i,x:i,z:0,yaw:0,version:1};state={...state,revision:i,entries:{...state.entries,[entry.id]:entry}};await service.save(state,entry);});await queue;clearInterval(timer);assert.ok(ticks>0);assert.deepEqual(create(dir).read(),state);await service.flush();assert.deepEqual(JSON.parse(await fs.readFile(process.env.BEER_WORLD_FILE)),state);assert.deepEqual(create(dir).read(),state);
 // A torn tail must not swallow the next complete operation.
 await fs.appendFile(process.env.BEER_WORLD_FILE+'.journal','{"incomplete":');const entry={id:'tree:101',x:1,z:0,yaw:0,version:1};state={...state,revision:101,entries:{...state.entries,[entry.id]:entry}};await service.save(state,entry);assert.deepEqual(create(dir).read(),state);await service.flush();
 }finally{delete process.env.BEER_WORLD_FILE;await fs.rm(dir,{recursive:true,force:true});}
});
