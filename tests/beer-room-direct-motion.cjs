// Full application regression: hydrate away from origin, drink through the UI,
// then press/release/reverse controls on a real, network-owned SUP hull.
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),net=require('node:net'),pup=require('puppeteer-core');
const delay=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 const dir='.codex-artifacts/direct-motion-fix';await fs.mkdir(dir,{recursive:true});
 const temp=await fs.mkdtemp(path.join(os.tmpdir(),'room-direct-')),socket=net.createServer();await new Promise(r=>socket.listen(0,'127.0.0.1',r));const port=socket.address().port;await new Promise(r=>socket.close(r));
 const child=require('node:child_process').spawn(process.execPath,['server.js'],{env:{...process.env,PORT:String(port),BEER_WORLD_FILE:path.join(temp,'world.json'),BEER_RECOGNITION_DISABLED:'1'},stdio:'ignore'});
 let browser;const errors=[],results=[];
 try{
  for(let i=0;i<80;i++){try{if((await fetch(`http://127.0.0.1:${port}/health`)).ok)break;}catch{}await delay(100);}
  const catalog=JSON.parse(await fs.readFile('.cache/beer-package-fit/catalog.json')),fixture={'0':catalog['0'],'20':catalog['20']},png=await fs.readFile('.cache/beer-package-fit/0.png');
  browser=await pup.launch({headless:true,protocolTimeout:120000,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--no-sandbox','--use-angle=metal','--enable-gpu','--ignore-gpu-blocklist','--disable-background-timer-throttling','--disable-renderer-backgrounding']});
  async function page(){const ctx=await browser.createBrowserContext(),p=await ctx.newPage();await p.setViewport({width:1100,height:780});p.on('pageerror',e=>errors.push(e.stack));await p.setRequestInterception(true);p.on('request',r=>{const u=new URL(r.url());if(u.pathname.includes('firebase')&&u.pathname.endsWith('.js'))return r.respond({contentType:'text/javascript',body:`window.firebase={apps:[{}],database:()=>({ref:()=>({on:(e,c)=>c({val:()=>(${JSON.stringify(fixture)})})})})};`});if(u.pathname==='/fetch-image')return r.respond({contentType:'image/png',headers:{'access-control-allow-origin':'*'},body:png});r.continue();});await p.goto(`http://127.0.0.1:${port}/beer-room.html`,{waitUntil:'domcontentloaded'});await p.waitForFunction(()=>window.__kinosredaRoom?.startup.state.revealed&&__kinosredaRoom.online.connected&&__kinosredaRoom.hand.loaded&&__kinosredaRoom.beerModels.get('0')?.userData.packageAsset&&__kinosredaRoom.beerModels.get('20')?.userData.packageAsset,{timeout:120000});await p.evaluate(async()=>{window.T=await import('./three.module.js');__kinosredaRoom.controls.pause();});return p;}
  const a=await page(),id=await a.evaluate(()=>__kinosredaRoom.online.id);
  // Move before the observer joins: hydration must include a world transform.
  await a.evaluate(()=>{const r=__kinosredaRoom;r.player.feetY=0;r.camera.position.set(2,1.64,-7.5);r.controls.setView(1.1);r.online.sendPresence(true);});
  const b=await page();await b.waitForFunction(id=>__kinosredaRoom.online.users.get(id)?.group.userData.hydrated,{},id);
  await b.evaluate(id=>{window.traces=[];function trace(){const u=__kinosredaRoom.online.users.get(id),g=u?.group,m=g?.userData.humanoidModel;if(m&&u.action.gesture==='drinking'){g.updateMatrixWorld(true);const socket=g.userData.gripSocket,item=socket?.children[0],mouth=g.userData.mouthSocket.getWorldPosition(new T.Vector3()),head=m.getObjectByName('Head').getWorldPosition(new T.Vector3());if(item){const profile=item.userData.packageProfile,height=profile?(profile.kind.includes('bottle')?.30:.205):item.userData.height,unit=profile?height/profile.modelHeight:1,r=profile?g.userData.gripRadius*.36:item.userData.rTop-.004;traces.push({at:performance.now(),progress:u.action.drinkProgress,gap:item.localToWorld(new T.Vector3(0,height/unit,r/unit)).distanceTo(mouth),headGap:mouth.distanceTo(head),flex:g.userData.wristFlex,rotation:g.userData.wristRotation});}}requestAnimationFrame(trace);}trace();},id);
  for(const [i,model] of ['classic','casual','bearded','woman'].entries())for(const [j,held] of ['0','20','glass'].entries()){
   const pose=['standing','seated','lying'][(i+j)%3];
   if(pose==='lying'){
    await a.evaluate(()=>{const w=__kinosredaRoom.worldEditor;if(!w.registry.getRecord('added:drink-hammock'))__kinosredaRoom.online.send({type:'world_edit',requestId:'drink-hammock',patch:{id:'added:drink-hammock',source:'prop:hammock',expected:0,x:30,z:5,yaw:.8}});});
    await a.waitForFunction(()=>__kinosredaRoom.worldEditor.registry.getRecord('added:drink-hammock'));
   }
   await a.evaluate(({model,held,pose,i})=>{const r=__kinosredaRoom;r.controls.pause();r.hand.returnToShelf(true);r.controls.stand();r.camera.position.set(2,1.64,-7.5);r.player.feetY=0;r.player.grounded=true;r.controls.setView(1.1+i*.8);if(pose!=='standing'){const s=pose==='lying'?r.worldEditor.registry.getRecord('added:drink-hammock').ss.find(s=>s.seatPosition):r.interior.surfaces.find(s=>!s.disabled&&s.seatPosition&&s.kind!=='hammock');r.camera.position.copy(s.seatPosition);r.camera.position.y+=.2;if(!r.controls.sit(s))throw Error('cannot sit');}r.controls.enable();r.online.setAvatar({model});if(held==='glass'){const g=r.pouring.glasses[0];g.userData.fill=.85;r.hand.takeGlass(g);}else r.selectBeer(r.beerModels.get(held));r.online.sendPresence(true);},{model,held,pose,i});
   await a.waitForFunction(held=>__kinosredaRoom.hand.state===(held==='glass'?'GLASS_HOLDING':'HOLDING'),{},held);
   await b.waitForFunction(([id,model])=>__kinosredaRoom.online.users.get(id)?.group.userData.activeModel===model,{},[id,model]);
   await b.evaluate(id=>{const r=__kinosredaRoom,g=r.online.users.get(id).group;r.controls.pause();r.camera.position.copy(g.localToWorld(new T.Vector3(1.65,1.65,-1.9)));r.camera.lookAt(g.localToWorld(new T.Vector3(0,g.userData.poseHeight*.75,0)));window.traces=[];},id);
   await a.click('#sipGlass');await a.waitForFunction(()=>__kinosredaRoom.hand.state==='DRINKING'&&__kinosredaRoom.hand.time>.85&&__kinosredaRoom.hand.time<1.5);
   await b.waitForFunction(id=>__kinosredaRoom.online.users.get(id)?.action.drinkProgress>.99,{},id);
   const peak=await b.evaluate(()=>traces.filter(t=>t.progress>.99));assert.ok(peak.length);assert.ok(peak.every(t=>t.gap<.04&&t.headGap<.30&&t.flex<.85&&t.rotation<1.1),JSON.stringify({model,held,pose,peak}));
   if(j===0||pose==='lying')await b.screenshot({path:`${dir}/online-${model}-${held}-${pose}.png`});
   await a.waitForFunction(held=>__kinosredaRoom.hand.state===(held==='glass'?'GLASS_HOLDING':'HOLDING'),{},held);
   results.push({model,held,pose,maxGap:Math.max(...peak.map(t=>t.gap)),maxHeadGap:Math.max(...peak.map(t=>t.headGap)),maxFlex:Math.max(...peak.map(t=>t.flex))});console.log('drink',results.at(-1));
  }
  await a.evaluate(()=>{const r=__kinosredaRoom;r.hand.returnToShelf(true);r.controls.stand();r.environment.setOpen(true);});await a.waitForFunction(()=>__kinosredaRoom.environment.progress===1&&__kinosredaRoom.environment.outdoors.sup.assetsReady,{timeout:90000});
  await b.waitForFunction(()=>__kinosredaRoom.environment.open&&__kinosredaRoom.environment.progress===1,{timeout:90000});
  await a.bringToFront();await a.evaluate(()=>{const r=__kinosredaRoom,b=r.environment.outdoors.sup.boards[0];r.camera.position.set(b.position.x,b.userData.surface.topY+1.64,b.position.z-1);r.player.feetY=b.userData.surface.topY;r.player.grounded=true;r.camera.lookAt(b.position.x,b.userData.surface.topY,b.position.z);r.controls.setView(r.camera.rotation.y,r.camera.rotation.x);r.controls.enable();r.online.sendPresence(true);});await a.keyboard.press('KeyE');await a.waitForFunction(()=>__kinosredaRoom.player.sup?.userData.id==='sup-0');
  await a.evaluate(()=>{const r=__kinosredaRoom,o=r.online,send=o.send.bind(o),receive=o.onSup;
   // Even unordered/late pose acknowledgements cannot affect the driver's hull.
   o.send=d=>{if(d.type!=='sup_pose')return send(d);setTimeout(()=>send(d),d.seq%11<4?400:90);return true;};
   o.onSup=boards=>setTimeout(()=>receive(boards),220);
   window.samples=[];window.keyEvents=[];for(const type of ['keydown','keyup'])addEventListener(type,e=>keyEvents.push({type,code:e.code,at:performance.now()}));
   const update=r.environment.outdoors.sup.update;r.environment.outdoors.sup.update=dt=>{update(dt);const b=r.player.sup;if(b)samples.push({at:performance.now(),dt,x:b.position.x,z:b.position.z,yaw:b.rotation.y,speed:b.userData.state.speed,throttle:b.userData.state.throttle,cameraError:r.camera.position.x-(b.position.x-Math.sin(b.rotation.y)*.28)});};
  });
  await a.keyboard.down('KeyW');await delay(220);await a.keyboard.up('KeyW');await delay(650);
  await a.keyboard.down('KeyW');await delay(400);await a.keyboard.up('KeyW');await a.keyboard.down('KeyS');await delay(240);await a.keyboard.up('KeyS');await delay(650);
  await a.keyboard.down('KeyD');await delay(160);await a.keyboard.up('KeyD');await delay(650);
  const motion=await a.evaluate(()=>({samples,keyEvents,owner:__kinosredaRoom.player.sup.userData.owner,ack:__kinosredaRoom.player.sup.userData.target.poseSeq,sent:__kinosredaRoom.player.sup.userData.poseSeq}));
  function after(event,ms){return motion.samples.find(s=>s.at>=event.at+ms);}
  const [down,up,down2,up2,reverse,stop,turn,turnStop]=motion.keyEvents.filter(e=>['KeyW','KeyS','KeyD'].includes(e.code));
  assert.ok(after(down,70).speed>.9,'forward must respond before any network round trip');
  for(const e of [up,stop]){assert.ok(Math.abs(after(e,220).speed)<.06,'release must stop within 220ms');const quiet=motion.samples.filter(s=>s.at>e.at+300&&s.at<e.at+600);assert.ok(quiet.every(s=>Math.abs(s.speed)<.03),'delayed packets must not resurrect old movement');}
  assert.ok(after(reverse,100).speed<-.2,'reverse must replace the current command within 100ms');assert.ok(after(reverse,200).speed<-.85);
  const turnStart=after(turn,0).yaw;assert.ok(Math.abs(after(turn,80).yaw-turnStart)>.025);const stoppedYaw=after(turnStop,70).yaw;assert.ok(Math.abs(after(turnStop,550).yaw-stoppedYaw)<.001,'turning must stop on release');
  assert.ok(motion.ack>0&&motion.sent>motion.ack,'pose ownership must remain synchronized under packet delay');
  await a.evaluate(()=>{const r=__kinosredaRoom,b=r.player.sup;r.controls.setView(b.rotation.y,-.2);});await a.screenshot({path:dir+'/responsive-sup-first-person.png'});
  await b.evaluate(()=>{const r=__kinosredaRoom,b=r.environment.outdoors.sup.boards[0];r.controls.pause();r.camera.position.set(b.position.x+3,b.position.y+2.5,b.position.z+5);r.camera.lookAt(b.position.x,b.position.y+.7,b.position.z);});await b.screenshot({path:dir+'/responsive-sup-observer.png'});
  // Check that the observer, paddle grips and mounted drinks follow the hull.
  await delay(750);const synchronized=await b.evaluate(id=>{const r=__kinosredaRoom,b=r.environment.outdoors.sup.boards[0],g=r.online.users.get(id).group;return{avatarGap:Math.hypot(g.position.x-b.position.x,g.position.z-b.position.z),x:b.position.x,z:b.position.z,grip:g.userData.paddleGripError};},id);
  const own=await a.evaluate(()=>__kinosredaRoom.player.sup.position.toArray());assert.ok(Math.hypot(own[0]-synchronized.x,own[2]-synchronized.z)<.12,JSON.stringify(synchronized));assert.ok(synchronized.avatarGap<.001&&Object.values(synchronized.grip).every(e=>e<.01));
  await a.keyboard.press('Space');await b.waitForFunction(()=>!__kinosredaRoom.environment.outdoors.sup.boards[0].userData.owner);
  assert.deepEqual(errors,[]);await fs.writeFile(dir+'/application.json',JSON.stringify({drinks:results,motion,synchronized,errors},null,2));console.log('PASS actual two-player sips, short keys, release, reversal and turn under 620ms network delays');
 }finally{await browser?.close();child.kill();await fs.rm(temp,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
