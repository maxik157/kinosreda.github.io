import * as THREE from './three.module.js';
const cache=new Map(),loader=new THREE.TextureLoader();
export function treeBarkMaps(birch=false){
 const key=birch?'birch':'bark_brown_02';if(cache.has(key))return cache.get(key);
 const maps={};for(const [field,suffix]of [['map','color'],['normalMap','normal'],['roughnessMap','roughness']]){const t=loader.load('./assets/forest/bark/'+key+'-'+suffix+'.webp'+(birch?'?v=2':''));t.wrapS=t.wrapT=THREE.RepeatWrapping;t.anisotropy=8;if(field==='map')t.colorSpace=THREE.SRGBColorSpace;maps[field]=t;}
 cache.set(key,maps);return maps;
}
export function treeBarkMaterial(birch=false){
 const material=new THREE.MeshStandardMaterial({...treeBarkMaps(birch),color:birch?0xe0ded5:0xeee4d9,roughness:1,normalScale:new THREE.Vector2(.7,.7)});
 if(birch){const rough=treeBarkMaps();material.onBeforeCompile=shader=>{shader.uniforms.uBirchFoot={value:rough.map};shader.uniforms.uBirchFootNormal={value:rough.normalMap};shader.vertexShader='varying float vBirchHeight;\n'+shader.vertexShader;shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvBirchHeight=position.y;');shader.fragmentShader='varying float vBirchHeight;uniform sampler2D uBirchFoot;uniform sampler2D uBirchFootNormal;\n'+shader.fragmentShader;
 shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`#include <map_fragment>
 vec3 birchFoot=texture2D(uBirchFoot,vMapUv).rgb;
 float footGrey=dot(birchFoot,vec3(.299,.587,.114));
 float footBlend=(1.-smoothstep(.12,1.85,vBirchHeight))*(.78+.22*sin(vMapUv.x*25.+sin(vMapUv.y*8.)));
 diffuseColor.rgb=mix(diffuseColor.rgb,vec3(footGrey)*vec3(.88,.89,.83),footBlend);`);
 shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_maps>',`vec3 mapN=mix(texture2D(normalMap,vNormalMapUv).xyz,texture2D(uBirchFootNormal,vNormalMapUv).xyz,footBlend)*2.-1.;mapN.xy*=normalScale;normal=normalize(tbn*mapN);`);
 };material.customProgramCacheKey=()=> 'birch-grey-scarred-foot-v3';}return material;
}
export function scaleBarkUV(geometry,length,radius){
 const uv=geometry.attributes.uv;for(let i=0;i<uv.count;i++)uv.setXY(i,uv.getX(i)*Math.max(.12,2*Math.PI*radius/1.8),uv.getY(i)*length/1.8);return geometry;
}
