// Run with the local site server: node tests/beer-room-browser.cjs
const assert=require('node:assert/strict');const puppeteer=require('puppeteer-core');
(async()=>{
 const browser=await puppeteer.launch({headless:true,executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 try{
 const p=await browser.newPage();await p.setViewport({width:1000,height:800});const errors=[];p.on('pageerror',e=>errors.push(e.message));await p.goto('http://127.0.0.1:8090/tests/beer-room-input.html');await p.waitForFunction(()=>window.fixture);
 await p.evaluate(()=>fixture.controls.setView(Math.PI/2));await p.keyboard.down('w');await p.evaluate(()=>fixture.step());await p.keyboard.up('w');let v=await p.evaluate(()=>fixture.camera.position.toArray());assert.ok(v[0]<-2&&Math.abs(v[2]-2)<.001,'W follows the quarter-turned camera');
 await p.evaluate(()=>{fixture.controls.clear();fixture.camera.position.set(0,1.64,2);fixture.controls.setView(0)});
 await p.mouse.move(500,250);await p.mouse.wheel({deltaY:100,deltaX:0});await p.evaluate(()=>fixture.step());v=await p.evaluate(()=>fixture.camera.position.toArray());assert.ok(v[2]<1.7,'two-finger scroll moves forward');
 await p.keyboard.down('Shift');await p.mouse.wheel({deltaX:40,deltaY:20});await p.keyboard.up('Shift');let yaw=await p.evaluate(()=>fixture.controls.state.yaw);assert.ok(yaw<-.1,'Shift + trackpad scroll looks around');
 await p.mouse.move(400,200);await p.mouse.down();await p.mouse.move(650,260,{steps:10});await p.mouse.up();assert.equal(await p.evaluate(()=>fixture.interactions),0,'a drag cannot pick up a drink');
 await p.mouse.click(450,210);assert.equal(await p.evaluate(()=>fixture.interactions),1,'a tap interacts once');
 await p.evaluate(()=>{fixture.controls.clear();fixture.controls.setView(0);fixture.camera.position.set(0,1.64,2)});
 await p.keyboard.down('ArrowUp');await p.evaluate(()=>fixture.step());await p.keyboard.up('ArrowUp');assert.ok(await p.evaluate(()=>fixture.camera.position.z<0),'arrow keys move');
 await p.keyboard.press('c');await p.evaluate(()=>fixture.step());assert.ok(await p.evaluate(()=>fixture.camera.position.y>1.6),'released crouch stands up');
 await p.keyboard.down('Control');await p.evaluate(()=>fixture.step());assert.ok(await p.evaluate(()=>fixture.camera.position.y<1.1),'crouch is smooth and reaches target');await p.keyboard.up('Control');await p.evaluate(()=>fixture.step());
 await p.keyboard.press('Space');await p.evaluate(()=>fixture.step(10));assert.ok(await p.evaluate(()=>fixture.controls.state.eyeY>1.9),'jump has upward velocity');await p.evaluate(()=>fixture.step(90));assert.ok(await p.evaluate(()=>fixture.controls.state.grounded),'gravity lands on floor');
 await p.keyboard.down('w');await p.evaluate(()=>dispatchEvent(new Event('blur')));assert.equal(await p.evaluate(()=>fixture.controls.keys.size),0,'focus loss releases movement');await p.keyboard.up('w');
 // Standard gamepad axes and buttons, including one interaction per press.
 await p.evaluate(()=>{const pad={connected:true,axes:[0,-1,.6,0],buttons:Array.from({length:12},()=>({pressed:false}))};pad.buttons[2].pressed=true;Object.defineProperty(navigator,'getGamepads',{value:()=>[pad],configurable:true});fixture.controls.clear();fixture.controls.setView(0);fixture.camera.position.set(0,1.64,2);fixture.step();});
 assert.ok(await p.evaluate(()=>fixture.camera.position.z<0),'gamepad left stick walks');assert.ok(await p.evaluate(()=>fixture.controls.state.yaw<-.5),'gamepad right stick looks');assert.equal(await p.evaluate(()=>fixture.interactions),2,'gamepad button interacts once while held');
 // Simultaneous joystick and look fingers, delivered as native touch events.
 await p.setViewport({width:600,height:800,isMobile:true,hasTouch:true});await p.reload();await p.waitForFunction(()=>window.fixture);const cdp=await p.createCDPSession();
 const rect=await p.$eval('#pad',e=>{const r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}});
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:rect.x,y:rect.y,id:1},{x:450,y:200,id:2}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:rect.x,y:rect.y-36,id:1},{x:520,y:230,id:2}]});await p.evaluate(()=>fixture.step());
 assert.ok(await p.evaluate(()=>fixture.camera.position.z<1),'joystick moves with a second finger looking');assert.ok(await p.evaluate(()=>fixture.controls.state.yaw<-.2),'touch swipe turns view');
 await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});assert.equal(await p.evaluate(()=>fixture.interactions),0,'touch drag cannot pick up a drink');assert.equal(await p.evaluate(()=>fixture.controls.touch.y),0,'joystick releases');
 assert.deepEqual(errors,[]);console.log('Passed: keyboard, camera direction, arrows, trackpad, click/drag separation, jump, crouch, focus loss, gamepad axes/buttons, simultaneous touch joystick/look.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
