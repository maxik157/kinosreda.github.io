const assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),pup=require('puppeteer-core'),net=require('node:net');const delay=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{const temp=await fs.mkdtemp(path.join(os.tmpdir(),'bar-posture-')),file=path.join(temp,'world.json'),socket=net.createServer();await new Promise(r=>socket.listen(0,'127.0.0.1',r));const port=socket.address().port;await new Promise(r=>socket.close(r));await fs.writeFile(file,JSON.stringify({format:1,revision:1,entries:{}}));const child=require('node:child_process').spawn(process.execPath,['server.js'],{env:{...process.env,PORT:String(port),HOST:'127.0.0.1',BEER_WORLD_FILE:file,BEER_RECOGNITION_DISABLED:'1'},stdio:'ignore'});let browser;const errors=[];try{for(let i=0;i<80;i++){try{if((await fetch('http://127.0.0.1:'+port+'/beer-room.html')).ok)break;}catch{}await delay(100);}browser=await pup.launch({headless:true,protocolTimeout:180000,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--no-sandbox','--use-angle=metal','--enable-gpu','--ignore-gpu-blocklist']});const page=await browser.newPage();await page.setViewport({width:1600,height:700});page.on('pageerror',e=>errors.push(e.stack));await page.setRequestInterception(true);page.on('request',r=>new URL(r.url()).pathname==='/__posture_test'?r.respond({contentType:'text/html',body:'<html><body style="margin:0"></body></html>'}):r.continue());await page.goto('http://127.0.0.1:'+port+'/__posture_test');
 const results=await page.evaluate(async()=>{
 const T=await import('/three.module.js'),A=await import('/beer-room-avatar.mjs');window.demo={T,A};const scene=new T.Scene();scene.background=new T.Color('#b7c1c6');scene.add(new T.HemisphereLight(0xffffff,0x383b40,2.4));const sun=new T.DirectionalLight(0xffffff,3);sun.position.set(3,8,6);scene.add(sun);const camera=new T.PerspectiveCamera(34,1600/700,.01,100);camera.position.set(6,3.5,11.5);camera.lookAt(0,.6,0);const renderer=new T.WebGLRenderer({antialias:true});renderer.setSize(1600,700);document.body.append(renderer.domElement);const grid=new T.GridHelper(30,60);scene.add(grid);Object.assign(demo,{scene,camera,renderer,roots:[]});
 const results=[];for(const id of ['classic','casual','bearded','woman']){
  const template=await A.loadAvatarTemplate(id),row=[];
  for(const [i,kind]of ['chair','stool','sofa','folding-chair','seat','crouching','crouch-walk'].entries()){
   const avatar=A.createHumanAvatar({model:id});A.hydrateHumanAvatar(avatar,template);avatar.position.x=(i-3)*1.8;avatar.rotation.y=-.65;scene.add(avatar);const seated=!kind.startsWith('crouch'),h=kind==='stool'?.78:kind==='sofa'?.765:kind==='folding-chair'?.389:.56;avatar.position.y=seated?h:0;
   const action={kind:seated?'seated':kind,seatKind:kind,seatHeight:h};for(let j=0;j<90;j++)A.updateHumanAvatar(avatar,action,1/60,kind==='crouch-walk'?j*.013:0);avatar.updateMatrixWorld(true);
   const model=avatar.userData.humanoidModel,point=n=>avatar.worldToLocal(model.getObjectByName(n).getWorldPosition(new T.Vector3())),hip=point('Hips'),thigh=point('LeftUpLeg'),knee=point('LeftLeg'),foot=point('LeftFoot'),angle=thigh.clone().sub(knee).angleTo(foot.clone().sub(knee))*180/Math.PI;
   row.push({id,kind,hip:hip.toArray(),knee:knee.toArray(),foot:foot.toArray(),angle,head:point('Head').y});
   if(seated){const seat=new T.Mesh(new T.BoxGeometry(.48,.07,.44),new T.MeshStandardMaterial({color:0x73502f}));seat.position.set(0,-.035,0);avatar.add(seat);}
   demo.roots.push(avatar);
  }
  renderer.render(scene,camera);results.push(...row);
  // Return each avatar row as a data URL for screenshot verification.
  demo.images??=[];demo.images.push({id,png:renderer.domElement.toDataURL('image/png')});for(const root of demo.roots)root.removeFromParent();demo.roots=[];
 }
 return results;
 });
 await fs.mkdir('.codex-artifacts/posture',{recursive:true});for(const row of await page.evaluate(()=>demo.images))await fs.writeFile('.codex-artifacts/posture/'+row.id+'.png',Buffer.from(row.png.split(',')[1],'base64'));
 for(const r of results){assert.ok(r.angle<150,JSON.stringify(r));assert.ok(r.angle>30,JSON.stringify(r));assert.ok(Math.abs(r.hip[1]-(r.kind.startsWith('crouch')?.48:r.kind==='sofa'?.16:.10)*({classic:1.84,casual:1.82,bearded:1.86,woman:1.73}[r.id]/1.84))<.025,JSON.stringify(r));}
 await fs.writeFile('.codex-artifacts/posture/bones.json',JSON.stringify(results,null,2));assert.deepEqual(errors,[]);console.log('PASS',JSON.stringify({poses:results.length,errors}));
 }finally{await browser?.close();child.kill();await fs.rm(temp,{recursive:true,force:true});}})().catch(e=>{console.error(e);process.exitCode=1;});
