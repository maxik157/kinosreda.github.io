import * as THREE from './three.module.js';
import {campLayout} from './beer-room-landscape.mjs';
import {moonDirection} from './beer-room-sky.mjs';
export function buildLake(group,scene,renderer,camera){
 const l=campLayout.lake,segments=160,rings=28,positions=[],uvs=[],indices=[];
 for(let r=0;r<=rings;r++)for(let i=0;i<=segments;i++){const a=i/segments*Math.PI*2,k=r/rings,edge=1+.045*Math.sin(a*5)+.025*Math.cos(a*9);positions.push(l.x+Math.cos(a)*l.rx*k*edge,l.y,l.z+Math.sin(a)*l.rz*k*edge);uvs.push(i/segments,k);if(r<rings&&i<segments){const s=r*(segments+1)+i;indices.push(s,s+1,s+segments+1,s+1,s+segments+2,s+segments+1);}}
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));geometry.setIndex(indices);const normals=new Float32Array(positions.length);for(let i=1;i<normals.length;i+=3)normals[i]=1;geometry.setAttribute('normal',new THREE.BufferAttribute(normals,3));
 const night={value:0},moon={value:moonDirection},time={value:0},cubeUniform={value:null},ready={value:0},blur={value:.018},material=new THREE.MeshPhysicalMaterial({color:0x648c7a,metalness:.18,roughness:.34,transparent:true,opacity:.92,clearcoat:.28,envMapIntensity:.8,side:THREE.DoubleSide});
 material.onBeforeCompile=shader=>{Object.assign(shader.uniforms,{uLakeTime:time,uLakeCube:cubeUniform,uLakeReady:ready,uLakeBlur:blur,uLakeNight:night,uLakeMoon:moon});shader.vertexShader='uniform float uLakeTime;varying vec3 vLakeWorld;\n'+shader.vertexShader;shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
 transformed.y+=sin(position.x*.38+uLakeTime*.8)*.018+cos(position.z*.44-uLakeTime*.61)*.012;
 vLakeWorld=transformed;`);
 shader.fragmentShader='uniform float uLakeNight;uniform vec3 uLakeMoon;uniform samplerCube uLakeCube;uniform float uLakeReady;uniform float uLakeBlur;uniform float uLakeTime;varying vec3 vLakeWorld;\n'+shader.fragmentShader;shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_maps>',`#include <normal_fragment_maps>
 normal=normalize(normal+vec3(sin(vLakeWorld.x*1.4+uLakeTime*.7)*.018,cos(vLakeWorld.z*1.3-uLakeTime*.6)*.018,0.));`);
 shader.fragmentShader=shader.fragmentShader.replace('#include <opaque_fragment>',`
 vec3 incident=normalize(vLakeWorld-cameraPosition);
 vec3 lakeNormal=normalize(vec3(sin(vLakeWorld.x*1.7+uLakeTime*.7)*.008,1.,cos(vLakeWorld.z*1.3-uLakeTime*.6)*.008));
 vec3 direction=reflect(incident,lakeNormal),reflection=textureCube(uLakeCube,direction,1.5).rgb*.4;
 reflection+=textureCube(uLakeCube,normalize(direction+vec3(uLakeBlur,0.,0.)),1.5).rgb*.15;
 reflection+=textureCube(uLakeCube,normalize(direction-vec3(uLakeBlur,0.,0.)),1.5).rgb*.15;
 reflection+=textureCube(uLakeCube,normalize(direction+vec3(0.,uLakeBlur,0.)),1.5).rgb*.15;
 reflection+=textureCube(uLakeCube,normalize(direction-vec3(0.,uLakeBlur,0.)),1.5).rgb*.15;
 float fresnel=pow(clamp(1.-abs(dot(-incident,lakeNormal)),0.,1.),3.);
 outgoingLight=mix(outgoingLight,reflection,uLakeReady*(.30+fresnel*.62));
 // Directional lunar highlights stay live even though the forest capture
 // is static. Narrow across the moon azimuth, stretched along the ripples.
 vec3 halfMoon=normalize(-incident+uLakeMoon);
 float azimuth=halfMoon.x*30.;
 float road=exp(-azimuth*azimuth)*pow(max(0.,halfMoon.y),34.);
 float phase=clamp(.5+.5*sin(vLakeWorld.z*12.+sin(vLakeWorld.x*3.)*2.-uLakeTime*1.1),0.,1.);
 float bands=.35+.65*phase*phase*phase;
 float lunarDisc=smoothstep(.99965,.99988,dot(direction,uLakeMoon));
 outgoingLight+=vec3(.58,.72,1.)*uLakeNight*(road*bands*1.35+lunarDisc*2.2);
 #include <opaque_fragment>`);};
 const water=new THREE.Mesh(geometry,material);water.name='Lake with soft static environment and immediate view response';water.userData.water=true;water.renderOrder=0;group.add(water);
 let baked=false,baking=false,environmentTarget=null,bakeCount=0,quality='medium',mode='day';const captures=new Map();
 // Capture only the static landscape once. The water shader computes the
 // reflected direction for the current view every frame, without replaying
 // the scene or reusing a projection from an earlier camera position.
 function bakeReflection(){
  if(baked||baking)return;baking=true;
  const target=new THREE.WebGLCubeRenderTarget(quality==='low'?128:256,{type:THREE.HalfFloatType,generateMipmaps:true,minFilter:THREE.LinearMipmapLinearFilter}),cube=new THREE.CubeCamera(.2,1600,target);cube.position.set(l.x,l.y+1.5,l.z);cube.layers.set(3);
  const shadow=renderer.shadowMap.needsUpdate,auto=renderer.autoClear,oldTarget=renderer.getRenderTarget();water.visible=false;
  try{scene.updateMatrixWorld(true);renderer.shadowMap.needsUpdate=false;renderer.autoClear=true;cube.update(renderer,scene);environmentTarget=target;captures.set(mode,target);cubeUniform.value=target.texture;ready.value=1;baked=true;bakeCount++;}
  finally{if(!baked)target.dispose();renderer.setRenderTarget(oldTarget);renderer.shadowMap.needsUpdate=shadow;renderer.autoClear=auto;water.visible=true;baking=false;}
 }
 function applyQuality(value){quality=value;material.roughness=value==='low'?.42:.34;blur.value=value==='high'?.012:value==='low'?.035:.018;}
 function update(dt,value,active){time.value+=dt;quality=value;if(active&&!baked)bakeReflection();}
 function setNight(n){night.value=n;const key=n>=.5?'night':'day';if(key!==mode){mode=key;environmentTarget=captures.get(mode)||null;baked=!!environmentTarget;cubeUniform.value=environmentTarget?.texture||null;ready.value=baked?1:0;}}
 return{water,material,update,applyQuality,bakeReflection,setNight,get reflectionTarget(){return environmentTarget;},invalidateReflection(){baked=false;ready.value=0;for(const t of captures.values())t.dispose();captures.clear();environmentTarget=null;},get stats(){return{bakeCount,perFrameReflectionPasses:0,quality,cachedModes:captures.size};},dispose(){for(const t of captures.values())t.dispose();geometry.dispose();material.dispose();}};
}
