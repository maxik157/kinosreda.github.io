import * as THREE from './three.module.js';
export const sunDirection=new THREE.Vector3(-.42,.38,.82).normalize();
export const moonDirection=new THREE.Vector3(.12,.30,.95).normalize();
function cloudTexture(){
 const size=256,c=document.createElement('canvas');c.width=c.height=size;const ctx=c.getContext('2d'),pixels=ctx.createImageData(size,size);
 const hash=(x,y)=>{let n=Math.imul((x&255)+Math.imul(y&255,377),374761393);n=(n^(n>>>13));return ((Math.imul(n,1274126177)^(n>>>16))>>>0)/4294967295;};
 const noise=(x,y,period)=>{const a=Math.floor(x),b=Math.floor(y),u=x-a,v=y-b,s=u*u*(3-2*u),t=v*v*(3-2*v);const h=(px,py)=>hash((px%period+period)%period,(py%period+period)%period);return THREE.MathUtils.lerp(THREE.MathUtils.lerp(h(a,b),h(a+1,b),s),THREE.MathUtils.lerp(h(a,b+1),h(a+1,b+1),s),t);};
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){let n=0,weight=0;for(let i=0;i<5;i++){const k=2**i,w=1/k;n+=noise(x/size*8*k,y/size*8*k,8*k)*w;weight+=w;}const p=(y*size+x)*4;pixels.data.set([n/weight*255,n/weight*255,n/weight*255,255],p);}ctx.putImageData(pixels,0,0);const t=new THREE.CanvasTexture(c);t.wrapS=t.wrapT=THREE.RepeatWrapping;return t;
}
export function buildCampSky(group){
 const uniforms={uNight:{value:0},uTime:{value:0},uClouds:{value:cloudTexture()},uSun:{value:sunDirection},uMoon:{value:moonDirection}};
 const material=new THREE.ShaderMaterial({side:THREE.BackSide,depthWrite:false,uniforms,vertexShader:'varying vec3 vDirection;void main(){vDirection=position;vec4 clip=projectionMatrix*vec4(mat3(viewMatrix)*position,1.);gl_Position=clip.xyww;}',fragmentShader:`
 uniform float uNight;uniform float uTime;uniform sampler2D uClouds;uniform vec3 uSun;uniform vec3 uMoon;varying vec3 vDirection;
 float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
 void main(){
  vec3 d=normalize(vDirection);float h=smoothstep(-.05,.7,d.y);
  vec3 day=mix(vec3(.73,.80,.79),vec3(.20,.43,.68),h),night=mix(vec3(.026,.044,.074),vec3(.004,.009,.026),h);vec3 c=mix(day,night,uNight);
  float s=dot(d,uSun),m=dot(d,uMoon);
  c+=vec3(1.,.72,.37)*(pow(max(s,0.),24.)*.16+smoothstep(.99972,.99986,s)*7.)*(1.-uNight);
  c+=vec3(.22,.32,.55)*pow(max(m,0.),100.)*.24*uNight;
  vec2 stars=vec2(atan(d.x,d.z),asin(clamp(d.y,-1.,1.)))*600.;vec2 cell=floor(stars);float aa=max(length(fwidth(stars)),.02);float star=1.-smoothstep(.08,.08+aa,length(fract(stars)-.5));
  c+=vec3(.65,.78,1.)*star*step(.9975,hash(cell))*uNight*smoothstep(0.,.12,d.y)*(.6+hash(cell+3.));
  vec2 cloudUV=d.xz/max(.09,d.y)*.13+vec2(uTime*.0006,0.);
  float n=texture2D(uClouds,cloudUV).r*.75+texture2D(uClouds,cloudUV*2.1+vec2(.21,.09)).r*.25;
  float cloud=smoothstep(.46,.64,n)*smoothstep(.015,.16,d.y);
  vec3 cloudDay=mix(vec3(.56,.66,.72),vec3(1.,.97,.87),smoothstep(.49,.68,n));
  vec3 cloudNight=mix(vec3(.022,.035,.065),vec3(.075,.10,.16),pow(max(m,0.),10.));
  c=mix(c,mix(cloudDay,cloudNight,uNight),cloud*.88);
  gl_FragColor=vec4(c,1.);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
 }`});
 const sky=new THREE.Mesh(new THREE.SphereGeometry(1400,32,20),material);sky.name='Clouds, sun and stars';sky.frustumCulled=false;sky.renderOrder=-5;group.add(sky);
 const moonMaterial=new THREE.MeshBasicMaterial({map:new THREE.TextureLoader().load('./assets/sky/moon.jpg'),color:0xd6e5ff,transparent:true,opacity:0,depthWrite:false,fog:false});moonMaterial.map.colorSpace=THREE.SRGBColorSpace;
 moonMaterial.onBeforeCompile=shader=>{shader.vertexShader=shader.vertexShader.replace('#include <project_vertex>',`vec4 celestialWorld=modelMatrix*vec4(transformed,1.);vec4 mvPosition=vec4(mat3(viewMatrix)*celestialWorld.xyz,1.);gl_Position=projectionMatrix*mvPosition;`);};
 const moon=new THREE.Mesh(new THREE.SphereGeometry(12,48,32),moonMaterial);moon.position.copy(moonDirection).multiplyScalar(1000);moon.rotation.y=1.8;moon.frustumCulled=false;moon.name='Full moon';moon.renderOrder=-4;group.add(moon);
 function setNight(n){uniforms.uNight.value=n;moonMaterial.opacity=n;moon.visible=n>.001;}
 return{sky,moon,setNight,get assetsReady(){return !!moonMaterial.map.image?.complete;},update(dt){uniforms.uTime.value+=dt;},uniforms};
}
