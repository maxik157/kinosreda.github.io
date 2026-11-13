// A single, monotonic reveal. Resources may finish in any order, but none of
// their individual callbacks can hide/reopen the loading screen.
export function createSceneStartup({app,loader,renderer,scene,camera,ready,onReveal}){
 const state={revealed:false,preparing:false};let stable=0,generation=0;

 function update(){if(state.revealed)return;if(!ready()){stable=0;generation++;return;}if(++stable<3||state.preparing)return;state.preparing=true;const token=generation;
 Promise.resolve(document.fonts.ready).then(()=>renderer.compileAsync?renderer.compileAsync(scene,camera):renderer.compile(scene,camera)).then(()=>{if(token!==generation||!ready()){state.preparing=false;stable=0;return;}
 scene.updateMatrixWorld(true);renderer.shadowMap.needsUpdate=true;renderer.render(scene,camera);
 requestAnimationFrame(()=>{if(token!==generation||!ready()){state.preparing=false;stable=0;return;}state.revealed=true;app.classList.add('is-ready','is-active');loader.classList.add('is-done');onReveal();});
 }).catch(()=>{state.preparing=false;stable=0;});}
 return{state,update};
}
export function trackSceneLoads(manager){let pending=0,revision=0;const start=manager.itemStart.bind(manager),end=manager.itemEnd.bind(manager);manager.itemStart=url=>{pending++;revision++;start(url);};manager.itemEnd=url=>{pending=Math.max(0,pending-1);end(url);};return{get pending(){return pending;},get revision(){return revision;}};}
