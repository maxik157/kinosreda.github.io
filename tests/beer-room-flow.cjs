// node tests/beer-room-flow.cjs (local site server on port 8090)
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict'),puppeteer=require('puppeteer-core');
(async()=>{
 const root=path.resolve('.cache/beer-package-fit'),catalog=JSON.parse(await fs.readFile(path.join(root,'catalog.json'))),images=new Map(Object.entries(catalog).map(([k,v])=>[v.imageUrl,k]));
 const browser=await puppeteer.launch({headless:true,executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 try{
  const width=Number(process.env.ROOM_WIDTH)||1280,height=Number(process.env.ROOM_HEIGHT)||900,narrow=width<700;
  const page=await browser.newPage();await page.setViewport({width,height,isMobile:narrow,hasTouch:narrow});const errors=[];page.on('pageerror',e=>errors.push(e.stack));
  await page.setRequestInterception(true);page.on('request',async req=>{const u=new URL(req.url());if(u.pathname==='/fetch-image'){const k=images.get(u.searchParams.get('url'));if(k)return req.respond({status:200,contentType:'image/png',body:await fs.readFile(path.join(root,k+'.png'))});}if(u.hostname.endsWith('firebasedatabase.app')&&u.pathname==='/beerRating.json')return req.respond({status:200,contentType:'application/json',body:JSON.stringify(catalog)});return req.continue();});
  await page.goto((process.env.ROOM_TEST_URL||'http://127.0.0.1:8090')+'/beer-room.html',{waitUntil:'domcontentloaded'});
  // Avoid repeatedly rendering 156 progressive shadow updates in SwiftShader
  // while the fixtures are loading; restore real rendering for visual checks.
  await page.waitForFunction(()=>window.__kinosredaRoom);
  await page.evaluate(()=>{const r=__kinosredaRoom;r.renderer.__render=r.renderer.render;r.renderer.render=()=>{};});
  await page.waitForFunction(()=>window.__kinosredaRoom?.hand.loaded&&__kinosredaRoom.beerModels.size===156&&[...__kinosredaRoom.beerModels.values()].every(m=>m.userData.packageAsset),{timeout:120000});
  await page.evaluate(()=>{const r=__kinosredaRoom;r.renderer.render=r.renderer.__render;delete r.renderer.__render;});
  assert.equal(await page.$('#enterRoom'),null);assert.equal(await page.evaluate(()=>__kinosredaRoom.player.enabled),true);
  await page.evaluate(async()=>{const {Clock}=await import('/three.module.js');Clock.prototype.getDelta=()=>0;window.advanceRoom=(seconds)=>{const r=__kinosredaRoom;for(let i=0;i<Math.ceil(seconds*60);i++){const dt=1/60;r.player.movementLocked=r.hand.state==='POURING';r.controls.update(dt);r.camera.updateMatrixWorld(true);r.hand.update(dt,r.player);r.pouring.update(dt,r.player)}}});
  const advance=s=>page.evaluate(s=>advanceRoom(s),s);
  const state=()=>page.evaluate(()=>({state:__kinosredaRoom.hand.state,kind:__kinosredaRoom.hand.heldKind,fill:__kinosredaRoom.hand.model?.userData.fill}));
  async function walk(x,z){return page.evaluate(([x,z])=>{const r=__kinosredaRoom;r.controls.clear();for(let i=0;i<900;i++){const dx=x-r.camera.position.x,dz=z-r.camera.position.z;if(Math.hypot(dx,dz)<.06)break;r.controls.setView(Math.atan2(-dx,-dz));r.controls.keys.add('KeyW');advanceRoom(1/60);}r.controls.clear();const d=Math.hypot(r.camera.position.x-x,r.camera.position.z-z);if(d>.12)throw Error('Unreachable waypoint '+JSON.stringify({x,z,p:r.camera.position.toArray(),d}));return r.camera.position.toArray()},[x,z]);}
  async function aimAt(point){await page.evaluate(point=>{const r=__kinosredaRoom,dx=point[0]-r.camera.position.x,dy=point[1]-r.camera.position.y,dz=point[2]-r.camera.position.z;r.controls.setView(Math.atan2(-dx,-dz),Math.atan2(dy,Math.hypot(dx,dz)));r.camera.updateMatrixWorld(true)},point);}
  async function screenshot(name){await page.evaluate(()=>{const r=__kinosredaRoom,overlay=!!r.hand.model&&r.hand.state!=='POURING';r.hand.rig.traverse(o=>o.layers.set(overlay?1:0));r.camera.layers.set(0);r.renderer.autoClear=true;r.renderer.render(r.scene,r.camera);if(overlay){const bg=r.scene.background;r.scene.background=null;r.renderer.autoClear=false;r.renderer.clearDepth();r.camera.layers.set(1);r.renderer.render(r.scene,r.camera);r.camera.layers.set(0);r.scene.background=bg;r.renderer.autoClear=true;}});await page.screenshot({path:path.join(root,'flow-'+(narrow?'narrow-':'')+name+'.png')});}
  await screenshot('entrance');
  // Reach the shelf using the same collision-aware walking controller as a player.
  for(const [x,z]of [[1.2,2],[6.1,2],[6.1,-6.3],[-4.5,-6.3],[-8.3979,-6.85]])await walk(x,z);
  const home=await page.evaluate(()=>__kinosredaRoom.beerModels.get('0').position.toArray());await aimAt([home[0],home[1]+.15,home[2]]);
  assert.equal(await page.evaluate(()=>__kinosredaRoom.findHit({x:0,y:0})?.userData.beerKey),'0');
  await page.keyboard.press('e');assert.equal((await state()).state,'HOLD_APPEARING');await advance(.75);assert.equal((await state()).kind,'beer');
  assert.equal(await page.evaluate(()=>__kinosredaRoom.beerModels.get('0').parent===__kinosredaRoom.hand.rig),true);await screenshot('bottle-grip');
  // Walk to the worktop with the package and activate the real glass hit.
  for(const [x,z]of [[-4.5,-6.3],[-3.5,-6.0]])await walk(x,z);
  const glass=await page.evaluate(()=>__kinosredaRoom.pouring.glasses[0].position.toArray());await aimAt([glass[0],glass[1]+.12,glass[2]]);
  assert.equal(await page.evaluate(()=>__kinosredaRoom.findHit({x:0,y:0})?.userData.action),'glass');await page.keyboard.press('e');assert.equal((await state()).state,'POURING');
  await advance(1.6);const partial=await page.evaluate(()=>({fill:__kinosredaRoom.pouring.glasses[0].userData.fill,stream:__kinosredaRoom.pouring.stream.visible}));assert.ok(partial.fill>0&&partial.fill<1&&partial.stream);await screenshot('pouring');
  await advance(3.2);assert.equal((await state()).state,'POUR_COMPLETE');assert.equal(await page.evaluate(()=>__kinosredaRoom.pouring.glasses[0].userData.fill),1);
  // A raycast and E, not takeGlass()/beginDrink() calls, must complete the flow.
  await page.keyboard.press('e');await advance(.75);assert.equal((await state()).state,'GLASS_HOLDING');assert.equal((await state()).fill,1);await screenshot('glass-held');
  await walk(-3.5,-6.3);await advance(.1);assert.ok(await page.evaluate(()=>__kinosredaRoom.hand.model.userData.held));
  const physics=await page.evaluate(async()=>{const{updateGlass}=await import('/beer-room-glass.mjs'),r=__kinosredaRoom,g=r.hand.model,d=g.userData;updateGlass(g,1/60,{velocity:{x:0,z:0}});updateGlass(g,1/60,{velocity:{x:3,z:0}});for(let i=0;i<8;i++)updateGlass(g,1/60,{velocity:{x:3,z:0}});const wave=d.slosh.length();updateGlass(g,1/60,{velocity:{x:0,z:0}});for(let i=0;i<240;i++)updateGlass(g,1/60,{velocity:{x:0,z:0}});return{wave,settled:d.slosh.length()}});
  assert.ok(physics.wave>.001,'Acceleration creates a liquid wave');assert.ok(physics.settled<physics.wave*.01,'Liquid settles when standing still');
  await page.keyboard.press('e');assert.equal((await state()).state,'DRINKING');await advance(.6);assert.equal((await state()).fill,1,'No beer disappears before the rim reaches the mouth');await advance(.5);
  const sipMid=await state();assert.ok(sipMid.fill<1&&sipMid.fill>.88);await screenshot('sip-at-mouth');
  const mouth=await page.evaluate(async()=>{const T=await import('/three.module.js'),r=__kinosredaRoom,d=r.hand.model.userData,rim=r.hand.rig.localToWorld(new T.Vector3(0,d.height,d.rTop-.004)),mouth=r.camera.localToWorld(new T.Vector3(.015,-.085,-.055)),up=new T.Vector3(0,1,0).applyQuaternion(r.hand.rig.quaternion).applyQuaternion(r.camera.getWorldQuaternion(new T.Quaternion()).invert());return{distance:rim.distanceTo(mouth),towardsCamera:up.z}});
  assert.ok(mouth.distance<.002,'The near rim reaches the mouth');assert.ok(mouth.towardsCamera>.5,'The glass tilts towards the viewer');
  await advance(1.2);assert.equal((await state()).state,'GLASS_HOLDING');const firstSip=(await state()).fill;assert.ok(Math.abs(firstSip-.88)<1e-6);await advance(1);assert.equal((await state()).fill,firstSip,'One press is one sip, not automatic emptying');
  await page.waitForFunction(()=>!document.querySelector('#sipGlass').disabled);await page.click('#sipGlass');await advance(2.3);assert.ok(Math.abs((await state()).fill-.76)<1e-6);
  await walk(-3.5,-6.0);await aimAt([glass[0],1.17,glass[2]]);await advance(.1);await page.waitForFunction(()=>!document.querySelector('#placeGlass').disabled);await page.click('#placeGlass');await advance(.75);assert.equal((await state()).state,'IDLE');
  assert.ok(Math.abs(await page.evaluate(()=>__kinosredaRoom.pouring.glasses[0].userData.fill)-.76)<1e-6);await screenshot('glass-returned');
  // Returning the package before pickup must not make a filled glass unusable.
  await aimAt([glass[0],glass[1]+.12,glass[2]]);await page.keyboard.press('e');await advance(.75);assert.equal((await state()).state,'GLASS_HOLDING');await page.keyboard.press('e');await advance(2.3);assert.ok(Math.abs((await state()).fill-.64)<1e-6);
  await aimAt([glass[0],1.17,glass[2]]);await page.keyboard.press('r');await advance(.75);assert.equal((await state()).state,'IDLE');
  await aimAt([glass[0],glass[1]+.12,glass[2]]);await page.keyboard.press('e');await advance(.75);
  for(let i=0;i<6;i++){await page.keyboard.press('e');await advance(2.3);}
  assert.equal((await state()).fill,0);await page.keyboard.press('e');assert.equal((await state()).state,'GLASS_HOLDING','Empty glass cannot start another sip');
  await page.waitForFunction(()=>document.querySelector('#sipGlass').disabled);await aimAt([glass[0],1.17,glass[2]]);await page.keyboard.press('r');await advance(.75);assert.equal((await state()).state,'IDLE');
  const liquidGeometry=await page.evaluate(async()=>{
   const T=await import('/three.module.js'),{createServingGlass,updateGlass}=await import('/beer-room-glass.mjs');let wallError=0,levelError=0;
   for(const shape of ['pint','tulip']){const g=createServingGlass(shape),d=g.userData;d.fill=.5;g.rotation.set(.45,0,.2);g.updateMatrixWorld(true);updateGlass(g,0);const p=d.foam.geometry.attributes.position,heights=[];
    for(let i=0;i<p.count;i++){const v=new T.Vector3().fromBufferAttribute(p,i),radius=d.rBottom-.004+(d.rTop-d.rBottom)*T.MathUtils.clamp((v.y-.002)/.20,0,1);wallError=Math.max(wallError,Math.hypot(v.x,v.z)-radius);heights.push(v.applyQuaternion(g.quaternion).y);}levelError=Math.max(levelError,Math.max(...heights)-Math.min(...heights));
    d.fill=0;updateGlass(g,0);if([d.liquid,d.foam,d.foamBubbles,d.bubbles].some(o=>o.visible))throw Error('Empty glass contains visible beer');
   }return{wallError,levelError};
  });
  assert.ok(liquidGeometry.wallError<1e-6,'Inclined liquid stays inside the tapered glass');assert.ok(liquidGeometry.levelError<1e-6,'Gravity keeps the liquid surface horizontal');
  // Free mouse look requires no pressed button.
  const yaw=await page.evaluate(()=>__kinosredaRoom.player.yaw);await page.mouse.click(width*.6,200);await page.mouse.move(width*.8,220,{steps:3});assert.notEqual(await page.evaluate(()=>__kinosredaRoom.player.yaw),yaw);
  await page.keyboard.press('Escape');assert.equal(await page.evaluate(()=>__kinosredaRoom.player.enabled),false,'Escape exits FPS walk mode');
  assert.deepEqual(errors,[]);console.log(JSON.stringify({viewport:[width,height],models:156,physicalRoute:true,raycastPickup:true,pour:partial,sips:[1,firstSip,.76,.64,0],physics,liquidGeometry,mouth,putAndRetake:true,fpsLook:true,escape:true,errors},null,2));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
