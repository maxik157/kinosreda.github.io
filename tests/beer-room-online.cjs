// Real browser + two WebSocket clients; run against the local server on :8090.
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),puppeteer=require('puppeteer-core');
(async()=>{
 const catalog=JSON.parse(await fs.readFile('.cache/beer-package-fit/catalog.json','utf8')),fixture={'0':catalog['0']};
 const browser=await puppeteer.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-background-timer-throttling','--disable-renderer-backgrounding']});
 const errors=[];
 try{
  async function page(){
   const p=await browser.newPage();await p.setViewport({width:1000,height:750}); p.on('pageerror',e=>errors.push(e.message));
   await p.setRequestInterception(true);p.on('request',async r=>{const u=new URL(r.url());
    if(u.pathname.includes('firebase')&&u.pathname.endsWith('.js'))return r.respond({contentType:'text/javascript',body:`window.firebase={apps:[{}],database:()=>({ref:()=>({on:(event,cb)=>cb({val:()=>(${JSON.stringify(fixture)})})})})};`});
    if(u.pathname==='/fetch-image')return r.respond({contentType:'image/png',body:await fs.readFile('.cache/beer-package-fit/0.png')});r.continue();
   });
   await p.goto((process.env.ROOM_TEST_URL||'http://127.0.0.1:8090')+'/beer-room.html',{waitUntil:'domcontentloaded'});
   await p.waitForFunction(()=>window.__kinosredaRoom,{timeout:60000}).catch(async e=>{console.error('Bootstrap errors:',errors);await p.screenshot({path:'.codex-artifacts/forest-camp/online-bootstrap-failure.png'});throw e;});
   await p.evaluate(()=>{const r=__kinosredaRoom;r.renderer.savedRender=r.renderer.render;r.renderer.render=()=>{};});
   await p.waitForFunction(()=>__kinosredaRoom.hand.loaded&&__kinosredaRoom.beerModels.get('0')?.userData.packageAsset&&__kinosredaRoom.online.connected,{timeout:60000});
   await p.evaluate(()=>{window.networkRenderTimer=setInterval(()=>__kinosredaRoom.online.update(1/60),16)});return p;
  }
  const a=await page(),b=await page();
  const aid=await a.evaluate(()=>__kinosredaRoom.online.id),bid=await b.evaluate(()=>__kinosredaRoom.online.id);assert.notEqual(aid,bid);
  await b.waitForFunction(id=>__kinosredaRoom.online.users.has(id),{polling:50,timeout:60000},aid);
  // The actual picker persists and broadcasts a fully hydrated character.
  await a.bringToFront();await a.click('#chooseAvatar');await a.click('[data-model="bearded"]');
  await a.waitForFunction(()=>document.querySelector('#avatarPreview').getAttribute('aria-busy')==='false');
  await a.screenshot({path:'.cache/beer-package-fit/avatar-picker.png'});
  await a.click('#saveAvatar');
  await b.waitForFunction(id=>__kinosredaRoom.online.users.get(id)?.group.userData.activeModel==='bearded',{polling:50,timeout:60000},aid);
  assert.equal(await a.evaluate(()=>JSON.parse(localStorage.getItem('kinosreda-beer-avatar')).model),'bearded');
  // All stool parts share a single axis; mats stay wholly on the worktop.
  const layout=await a.evaluate(()=>{const r=__kinosredaRoom,bar=r.interior.bar;return {rests:bar.children.filter(o=>o.geometry?.type==='TorusGeometry').map(o=>o.position.z),seats:bar.children.filter(o=>o.userData.surface?.kind==='stool').map(o=>o.position.z),mats:r.interior.surfaces.filter(s=>s.kind==='counter').map(s=>[s.bounds.min.z,s.bounds.max.z]),glasses:r.pouring.glasses.map(g=>g.position.z)}});
  assert.deepEqual(layout.rests,layout.seats);layout.mats.forEach(([min,max],i)=>{assert.ok(min>=-5.725&&max<=-4.475);assert.ok(Math.abs((min+max)/2-layout.glasses[i])<1e-5)});
  async function place(p,remote=false){return p.evaluate(async(remote)=>{
   const r=__kinosredaRoom,T=await import('/three.module.js'),m=remote?r.online.items.get(window.testItemId):r.beerModels.get('0');
   r.selectBeer(m);for(let i=0;i<50;i++)r.hand.update(1/60,r.player);
   const old=r.hand.findPlacement;r.hand.findPlacement=()=>new T.Vector3(-.3,.982,5.8);
   r.hand.rig.traverse(o=>o.layers.set(1)); if(!r.hand.putBeer())throw Error('Cannot place beer');
   for(let i=0;i<45;i++)r.hand.update(1/60,r.player);r.hand.findPlacement=old;
   window.testBeer=m;return {id:m.userData.onlineItemId,scale:m.scale.x,texture:m.children[0].material.map.uuid,layers:m.children.map(o=>o.layers.mask),held:m.userData.held,parent:m.parent===r.scene};
  },remote);}
  await a.evaluate(()=>{const r=__kinosredaRoom;r.selectBeer(r.beerModels.get('0'));for(let i=0;i<50;i++)r.hand.update(1/60,r.player);});
  await b.waitForFunction(id=>__kinosredaRoom.online.users.get(id)?.group.getObjectByName('Remote held item')?.children.length,{polling:50,timeout:60000},aid);
  const attachment=await b.evaluate(async id=>{const r=__kinosredaRoom,g=r.online.users.get(id).group,{updateHumanAvatar}=await import('/beer-room-avatar.mjs');updateHumanAvatar(g,{kind:'walking',held:'beer',beerKey:'0'},.016,1);return {bone:g.getObjectByName('Remote held item').parent.name,beard:!!g.getObjectByName('Fitted black beard and moustache')};},aid);assert.deepEqual(attachment,{bone:'RightHand',beard:true});
  await a.evaluate(()=>__kinosredaRoom.hand.returnToShelf(true));
  const first=await place(a);assert.ok(first.parent&&!first.held);assert.ok(first.layers.every(m=>m===1));
  await b.waitForFunction(id=>__kinosredaRoom.online.items.has(id),{polling:50,timeout:60000},first.id);
  const remote=await b.evaluate(id=>{let m=__kinosredaRoom.online.items.get(id);return{scale:m.scale.x,asset:!!m.userData.packageAsset,pos:m.position.toArray(),layers:m.children.map(o=>o.layers.mask)}},first.id);
  const hitId=await b.evaluate(async()=>{const r=__kinosredaRoom;r.camera.position.set(-.3,1.64,4.5);r.controls.setView(Math.PI,Math.atan2(1.13-1.64,1.3));r.scene.updateMatrixWorld(true);return r.findHit({x:0,y:0})?.userData.onlineItemId;});assert.equal(hitId,first.id);
  assert.ok(remote.asset);assert.equal(remote.scale,first.scale);assert.deepEqual(remote.layers,first.layers);
  // Pickup by another owner, followed by placement, must retain the exact art.
  await b.evaluate(id=>window.testItemId=id,first.id);const second=await place(b,true);assert.equal(second.id,first.id);assert.equal(second.scale,first.scale);
  await a.waitForFunction(id=>__kinosredaRoom.online.items.get(id)?.userData.remoteItem,{polling:50,timeout:60000},first.id);
  await b.evaluate(()=>{const r=__kinosredaRoom,m=window.testBeer;r.selectBeer(m);for(let i=0;i<50;i++)r.hand.update(1/60,r.player)});
  await a.waitForFunction(id=>!__kinosredaRoom.online.items.has(id),{polling:50,timeout:60000},first.id);
  const held=await b.evaluate(()=>({parent:window.testBeer.parent===__kinosredaRoom.hand.rig,texture:!!window.testBeer.children[0].material.map,visible:window.testBeer.visible}));assert.deepEqual(held,{parent:true,texture:true,visible:true});
  // Cancel/return republishes the same placed object; no ghost or duplicate.
  await b.evaluate(()=>__kinosredaRoom.hand.returnToShelf(true));
  await a.waitForFunction(id=>__kinosredaRoom.online.items.has(id),{polling:50,timeout:60000},first.id);
  // Unknown artwork waits for the asset, never becoming a generic brown beer.
  const deferred=await b.evaluate(()=>{const r=__kinosredaRoom,o=r.online,src=r.beerModels.get('0');o.upsertItem({id:'pending-test',beerKey:'late',x:1,y:1,z:1});const pending=o.pendingItems.has('pending-test')&&!o.items.has('pending-test');r.beerModels.set('late',src);o.update(1/60);const exact=o.items.get('pending-test')?.userData.packageAsset===src.userData.packageAsset;o.removeItem('pending-test');return {pending,exact};});assert.deepEqual(deferred,{pending:true,exact:true});
  const interpolation=await b.evaluate(()=>{const o=__kinosredaRoom.online;o.upsert({id:'interpolation-test',x:0,y:0,z:0,yaw:3.12});const u=o.users.get('interpolation-test'),now=performance.now();u.snapshots=[{time:now-140,position:u.target.clone().set(0,0,0),yaw:3.12,action:{kind:'walking'}},{time:now-90,position:u.target.clone().set(1,0,0),yaw:-3.12,action:{kind:'walking'}}];o.update(1/60);const out={x:u.group.position.x,yaw:u.group.rotation.y};o.remove('interpolation-test');return out;});assert.ok(interpolation.x>.6&&interpolation.x<1);assert.ok(Math.abs(interpolation.yaw)>3);
  // Measure actual wire delivery while both render loops are active.
  await b.evaluate(id=>{window.packetTimes=[];__kinosredaRoom.online.ws.addEventListener('message',e=>{const d=JSON.parse(e.data);if(d.type==='beer_presence'&&d.user.id===id)packetTimes.push(performance.now())})},aid);
  await a.bringToFront();await a.evaluate(()=>{const r=__kinosredaRoom;r.controls.enable();r.controls.clear();r.controls.setView(0,0);r.camera.position.set(1,1.64,2);r.player.feetY=0;r.player.grounded=true;r.controls.keys.add('KeyW')});
  await new Promise(r=>setTimeout(r,1800));
  const movement=await b.evaluate(id=>{const r=__kinosredaRoom,u=r.online.users.get(id);return {packets:packetTimes.length,kind:u.action.kind,distance:u.distance,snapshots:u.snapshots.length}},aid);
  assert.ok(movement.packets>=25,JSON.stringify(movement));assert.equal(movement.kind,'walking');assert.ok(movement.distance>1);
  await a.evaluate(()=>__kinosredaRoom.controls.clear());
  // Imported walking must move bones without translating hips away from root.
  await b.waitForFunction(id=>__kinosredaRoom.online.users.get(id)?.group.userData.hydrated,{polling:50,timeout:60000},aid);
  const bones=await b.evaluate(async id=>{const {updateHumanAvatar}=await import('/beer-room-avatar.mjs');const g=__kinosredaRoom.online.users.get(id).group,actions=g.userData.motionActions;updateHumanAvatar(g,{kind:'walking'},.1,1);const left=g.userData.humanoidModel.getObjectByName('LeftUpLeg'),before=left.quaternion.clone();updateHumanAvatar(g,{kind:'walking'},.2,1.5);if(before.angleTo(left.quaternion)<.01)throw Error('Walking did not move the leg bone');return actions[1].getClip().tracks.filter(t=>/Hips.*\.position$/.test(t.name)).every(t=>Array.from(t.values).every((v,i)=>i%3===1||v===0))},aid);assert.ok(bones);
  // The physical switch controls one shared world; newcomers receive its mode.
  await a.evaluate(()=>__kinosredaRoom.environment.setOpen(true));
  await b.bringToFront();
  await b.waitForFunction(()=>__kinosredaRoom.environment.open&&__kinosredaRoom.environment.progress===1,{polling:50,timeout:60000});
  await b.evaluate(()=>{const r=__kinosredaRoom;r.camera.position.set(-9,1.56,20);r.player.feetY=-.08;r.online.sendPresence(true);});
  await a.waitForFunction(id=>__kinosredaRoom.online.users.get(id)?.target.z===20,{polling:50,timeout:60000},bid);
  await a.evaluate(()=>__kinosredaRoom.environment.setOpen(false));
  await b.waitForFunction(()=>!__kinosredaRoom.environment.open&&__kinosredaRoom.environment.progress===0,{polling:50,timeout:60000});
  assert.ok(await b.evaluate(()=>Math.abs(__kinosredaRoom.camera.position.z)<8));
  // Render one final frame for visual inspection.
  await b.evaluate(async()=>{const r=__kinosredaRoom,T=await import('/three.module.js');r.controls.clear();r.camera.position.set(-1.5,2.1,-2.4);r.controls.setView(-.1,-.32);r.camera.lookAt(0,1,-5.1);r.camera.updateMatrixWorld(true);r.renderer.savedRender.call(r.renderer,r.scene,r.camera);});
  await b.screenshot({path:'.cache/beer-package-fit/online-regression.png'});
  await b.evaluate(id=>__kinosredaRoom.online.sendAction({kind:'picked',itemId:id}),first.id);assert.deepEqual(errors,[]);console.log(JSON.stringify({layout,first,remote,second,deferred,interpolation,movement,bones,sharedWorld:true,errors},null,2));
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
