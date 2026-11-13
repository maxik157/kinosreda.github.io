// Local server on port 8090; uses the read-only catalog/image snapshot.
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict'),puppeteer=require('puppeteer-core');
(async()=>{
 const root=path.resolve('.cache/beer-package-fit'),catalog=JSON.parse(await fs.readFile(path.join(root,'catalog.json'))),byUrl=new Map(Object.entries(catalog).map(([k,v])=>[v.imageUrl,k]));
 const browser=await puppeteer.launch({headless:true,executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 try{
  const page=await browser.newPage();await page.setViewport({width:1200,height:900});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.setRequestInterception(true);page.on('request',async req=>{const u=new URL(req.url());if(u.pathname==='/fetch-image'){const k=byUrl.get(u.searchParams.get('url'));if(k)return req.respond({status:200,contentType:'image/png',body:await fs.readFile(path.join(root,k+'.png'))});}if(u.hostname.endsWith('firebasedatabase.app')&&u.pathname==='/beerRating.json')return req.respond({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify(catalog)});return req.continue()});
  await page.goto('http://127.0.0.1:8090/tests/beer-package-viewer.html?beer=0');await page.waitForFunction(()=>window.packageViewer?.ready,{timeout:30000}).catch(async e=>{console.error({errors,readout:await page.$eval('#readout',e=>e.textContent)});throw e;});
  const reports=[];
  for(const key of ['0','20']){
   await page.evaluate(k=>packageViewer.load(k),key);
   const report=await page.evaluate(()=>{
    const{asset,model}=packageViewer,c=asset.texture.image,w=c.width,h=c.height,data=c.getContext('2d').getImageData(0,0,w,h).data;
    let mismatches=0,transparent=0,joinDelta=0;
    for(let y=0;y<h;y++)for(let x=0;x<w/2;x++){
     const a=(y*w+x)*4,b=(y*w+x+w/2)*4;
     for(let k=0;k<3;k++)if(data[a+k]!==data[b+k])mismatches++;
     if(data[a+3]!==255||data[b+3]!==255)transparent++;
    }
    for(let y=0;y<h;y++)for(const x of [w/4,3*w/4])for(let k=0;k<3;k++)joinDelta=Math.max(joinDelta,Math.abs(data[(y*w+x)*4+k]-data[(y*w+x-1)*4+k]));
    const p=asset.geometry.attributes.position,n=asset.geometry.attributes.normal;let seamDelta=0;
    for(let i=0;i<p.count;i+=97)for(let k=0;k<3;k++)seamDelta=Math.max(seamDelta,Math.abs(p.getComponent(i,k)-p.getComponent(i+96,k)),Math.abs(n.getComponent(i,k)-n.getComponent(i+96,k)));
    return{mismatches,transparent,joinDelta,seamDelta,surfaces:model.children.filter(o=>o.name==='Continuous package surface').length,rearOverlay:!!model.getObjectByName('Readable rear label')};
   });
   assert.equal(report.mismatches,0,'The rear atlas half keeps the same non-mirrored reading direction');assert.equal(report.transparent,0);assert.ok(report.joinDelta<=1,'The side joins share the same edge colours');assert.ok(report.seamDelta<1e-6,'The closing edge shares positions and normals');assert.equal(report.surfaces,1);assert.equal(report.rearOverlay,false);
   for(const[name,angle]of [['front',0],['back',Math.PI],['side',Math.PI/2],['45',Math.PI/4]]){
    await page.evaluate(a=>{const v=packageViewer;v.rotation=a;v.model.rotation.y=a;v.renderer.render(v.scene,v.camera)},angle);await page.screenshot({path:path.join(root,`verified-${key}-${name}.png`)});
   }
   reports.push({key,...report});
  }
  assert.deepEqual(errors,[]);console.log(JSON.stringify({packages:reports,errors},null,2));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
