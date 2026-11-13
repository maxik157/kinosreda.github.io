import * as THREE from './three.module.js';
import {lakeDistance,pathDistance,campLayout} from './beer-room-terrain.mjs';
// One persistent blend mask, shared by the terrain and grass. Photographs tile
// in metres; painting never stretches or rebakes the detail textures.
export const groundBounds={minX:-196,maxX:220,minZ:-169,maxZ:247,size:416};
const N=2048,px=N/groundBounds.size;
export const groundMaskGLSL=`uniform sampler2D uGroundMask;
float groundSoil(vec2 p){return texture2D(uGroundMask,vec2((p.x+196.)/416.,(p.y+169.)/416.)).r;}`;
function canvas(n){const c=document.createElement('canvas');c.width=c.height=n;return c;}
export function createGroundPaint(){
 const c=canvas(N),ctx=c.getContext('2d',{willReadFrequently:true}),base=canvas(512),b=base.getContext('2d'),image=b.createImageData(512,512);
 for(let j=0;j<512;j++)for(let i=0;i<512;i++){const x=groundBounds.minX+(i+.5)/512*416,z=groundBounds.maxZ-(j+.5)/512*416,l=lakeDistance(x,z),d=pathDistance(x,z),t=THREE.MathUtils.smoothstep(d,.65,1.9),shore=1-THREE.MathUtils.smoothstep(l,1.005,1.065),clearing=1-THREE.MathUtils.smoothstep(Math.hypot(x-campLayout.fire.x,z-campLayout.fire.z),2.7,4.6),soil=Math.max(1-t,shore,clearing),v=Math.round(255*soil),k=(j*512+i)*4;image.data.set([v,v,v,255],k);}
 b.putImageData(image,0,0);ctx.drawImage(base,0,0,N,N);const baseline=canvas(N);baseline.getContext('2d').drawImage(c,0,0);
 const texture=new THREE.CanvasTexture(c);texture.minFilter=THREE.LinearFilter;texture.magFilter=THREE.LinearFilter;texture.generateMipmaps=false;texture.wrapS=texture.wrapT=THREE.ClampToEdgeWrapping;
 const grassCanvas=canvas(N),grassContext=grassCanvas.getContext('2d',{willReadFrequently:true});grassContext.drawImage(c,0,0);const grassTexture=new THREE.CanvasTexture(grassCanvas);grassTexture.minFilter=grassTexture.magFilter=THREE.LinearFilter;grassTexture.generateMipmaps=false;
 const growthCanvas=canvas(N),growthContext=growthCanvas.getContext('2d',{willReadFrequently:true});growthContext.fillStyle='#000';growthContext.fillRect(0,0,N,N);
 const growthTexture=new THREE.CanvasTexture(growthCanvas);growthTexture.minFilter=growthTexture.magFilter=THREE.LinearFilter;growthTexture.generateMipmaps=false;
 let applied=[],signature='',preview=false,growthPreview=null,growthRevision=0;const stamps=new Map();
 function stampFor(e){const key=[e.radius,e.softness,e.strength,e.material].join(':');if(stamps.has(key))return stamps.get(key);if(stamps.size>24)stamps.clear();const n=Math.ceil(e.radius*px*2)+4,s=canvas(n),x=s.getContext('2d'),r=e.radius*px,shade=['soil','grass-remove'].includes(e.material)?255:0,g=x.createRadialGradient(n/2,n/2,r*(1-e.softness),n/2,n/2,r);g.addColorStop(0,`rgba(${shade},${shade},${shade},${e.strength})`);g.addColorStop(1,`rgba(${shade},${shade},${shade},0)`);x.fillStyle=g;x.fillRect(0,0,n,n);stamps.set(key,s);return s;}
 function dot(e,p){const s=stampFor(e);const x=(p[0]-groundBounds.minX)*px-s.width/2,y=(groundBounds.maxZ-p[1])*px-s.height/2;if(!e.material.startsWith('grass-'))ctx.drawImage(s,x,y);grassContext.drawImage(s,x,y);const growthStamp=stampFor({...e,material:e.material==='grass-add'?'soil':'grass'});growthContext.drawImage(growthStamp,x,y);}
 function segment(e,p,from){if(!from){dot(e,p);return;}const d=Math.hypot(p[0]-from[0],p[1]-from[1]),steps=Math.max(1,Math.ceil(d/Math.max(.06,e.radius*.16)));for(let k=1;k<=steps;k++)dot(e,[from[0]+(p[0]-from[0])*k/steps,from[1]+(p[1]-from[1])*k/steps]);}
 function draw(e){if(e.deleted||!['soil','grass','grass-add','grass-remove'].includes(e.material))return;e.points.forEach((p,i)=>segment(e,p,e.points[i-1]));}
 function snapshot(entries,force=false){const next=Object.values(entries).filter(e=>e.id.startsWith('terrain:')).sort((a,b)=>a.order-b.order||a.id.localeCompare(b.id)),sig=next.map(e=>e.id+':'+e.version+':'+!!e.deleted).join('|');if(!force&&!preview&&sig===signature)return;const append=!force&&!preview&&next.length>=applied.length&&applied.every((e,i)=>e.id===next[i].id&&e.version===next[i].version&&e.deleted===next[i].deleted);if(!append){ctx.drawImage(baseline,0,0);grassContext.drawImage(baseline,0,0);growthContext.fillStyle='#000';growthContext.fillRect(0,0,N,N);}for(let i=append?applied.length:0;i<next.length;i++)draw(next[i]);applied=next.map(e=>({...e}));signature=sig;preview=false;growthPreview=null;growthRevision++;texture.needsUpdate=grassTexture.needsUpdate=growthTexture.needsUpdate=true;}
 return{texture,growthUniform:{value:growthTexture},get growthRevision(){return growthRevision;},get growthAreas(){return [...applied.filter(e=>!e.deleted&&e.material==='grass-add'),...(growthPreview?.material==='grass-add'?[growthPreview]:[])];},growthPixels(x=0,y=0,width=N,height=N){return growthContext.getImageData(x,y,width,height).data;},uniform:{value:texture},grassUniform:{value:grassTexture},snapshot,previewPoint(e,p,from){if(!['soil','grass','grass-add','grass-remove'].includes(e.material))return;preview=true;growthPreview=e;growthRevision++;segment(e,p,from);texture.needsUpdate=grassTexture.needsUpdate=growthTexture.needsUpdate=true;},sample(x,z){return ctx.getImageData(Math.max(0,Math.min(N-1,Math.round((x+196)*px))),Math.max(0,Math.min(N-1,Math.round((247-z)*px))),1,1).data[0]/255;},sampleGrass(x,z){return 1-grassContext.getImageData(Math.max(0,Math.min(N-1,Math.round((x+196)*px))),Math.max(0,Math.min(N-1,Math.round((247-z)*px))),1,1).data[0]/255;},get strokeCount(){return applied.filter(e=>!e.deleted).length;}};
}
export function groundMaterial(paint){
 const loader=new THREE.TextureLoader(),maps={},pending=[];
 for(const kind of ['grass','soil'])for(const field of ['color','normal','roughness']){const t=loader.load(`./assets/forest/ground/${kind}-${field}.webp`);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.set(416/2.5,416/2.5);t.anisotropy=8;if(field==='color')t.colorSpace=THREE.SRGBColorSpace;maps[kind+field]=t;pending.push(t);}
 const m=new THREE.MeshStandardMaterial({map:maps.grasscolor,normalMap:maps.grassnormal,normalScale:new THREE.Vector2(.55,.55),roughness:1});
 m.onBeforeCompile=shader=>{shader.uniforms.uGroundMask=paint.uniform;for(const [k,t]of Object.entries(maps))shader.uniforms['uGround'+k]={value:t};shader.vertexShader='varying vec3 vGroundWorld;\n'+shader.vertexShader;shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvGroundWorld=(modelMatrix*vec4(transformed,1.)).xyz;');shader.fragmentShader='varying vec3 vGroundWorld;\n'+groundMaskGLSL+'\n'+Object.keys(maps).map(k=>'uniform sampler2D uGround'+k+';').join('\n')+'\n'+shader.fragmentShader;
 shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`vec2 groundUV=vGroundWorld.xz/2.5;
 float soilMix=groundSoil(vGroundWorld.xz);
 vec3 grassColor=texture2D(uGroundgrasscolor,groundUV).rgb*vec3(.83,.98,.74);
 vec3 soilColor=texture2D(uGroundsoilcolor,groundUV).rgb;
 diffuseColor.rgb*=mix(grassColor,soilColor,soilMix);`);
 shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>',`float roughnessFactor=mix(texture2D(uGroundgrassroughness,groundUV).r,texture2D(uGroundsoilroughness,groundUV).r,soilMix);roughnessFactor=clamp(roughnessFactor,.75,1.);`);
 shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_maps>',`vec3 groundN=mix(texture2D(uGroundgrassnormal,groundUV).xyz,texture2D(uGroundsoilnormal,groundUV).xyz,soilMix)*2.-1.;groundN.xy*=normalScale;normal=normalize(getTangentFrame(-vViewPosition,normal,groundUV)*groundN);`);
 };m.customProgramCacheKey=()=> 'forest-ground-blend-v1';return{material:m,get ready(){return pending.every(t=>t.image?.complete);}};
}
export function applyGroundGrassMask(material,paint,smallGrass=true){
 const previous=material.onBeforeCompile;material.onBeforeCompile=shader=>{previous?.(shader);shader.uniforms.uGroundMask=smallGrass?paint.grassUniform:paint.uniform;shader.vertexShader='varying vec3 vGrassGround;\n'+shader.vertexShader;shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
 vec4 groundPlant=vec4(transformed,1.);
 #ifdef USE_INSTANCING
 groundPlant=instanceMatrix*groundPlant;
 #endif
 vGrassGround=(modelMatrix*groundPlant).xyz;`);shader.fragmentShader='varying vec3 vGrassGround;\n'+groundMaskGLSL+'\n'+shader.fragmentShader;shader.fragmentShader=shader.fragmentShader.replace('#include <clipping_planes_fragment>',`#include <clipping_planes_fragment>
 float soilCoverage=groundSoil(vGrassGround.xz);
 if(soilCoverage>fract(sin(dot(floor(vGrassGround.xz*25.),vec2(12.9898,78.233)))*43758.5453))discard;`);};
}
