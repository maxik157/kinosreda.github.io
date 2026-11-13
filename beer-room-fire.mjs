import * as THREE from './three.module.js';
import {randomSource} from './beer-room-landscape.mjs';
// Flame frames extracted from Cary Bass's public-domain campfire footage.
// Three crossed sheets retain volume from every seat, without per-frame
// video decoding or a volume raymarch on the player's GPU.
export function buildCampfire(parent){
 const rng=randomSource(812),atlas=new THREE.TextureLoader().load('./assets/fire/campfire-flames.webp');atlas.colorSpace=THREE.SRGBColorSpace;atlas.generateMipmaps=true;
 const uniforms={uAtlas:{value:atlas},uFrame:{value:0}};
 const material=new THREE.ShaderMaterial({uniforms,transparent:true,depthWrite:false,side:THREE.DoubleSide,blending:THREE.AdditiveBlending,toneMapped:false,
 vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
 fragmentShader:`uniform sampler2D uAtlas;uniform float uFrame;varying vec2 vUv;
 vec4 frame(float index){float f=mod(index,64.);vec2 cell=vec2(mod(f,8.),7.-floor(f/8.));return texture2D(uAtlas,(cell+clamp(vUv,vec2(.002),vec2(.998)))/8.);}
 void main(){vec4 c=mix(frame(floor(uFrame)),frame(floor(uFrame)+1.),fract(uFrame));float edge=smoothstep(0.,.09,vUv.x)*smoothstep(0.,.09,1.-vUv.x)*smoothstep(0.,.08,vUv.y);gl_FragColor=vec4(c.rgb*1.2,c.a*edge*.72);}`});
 const flames=new THREE.Group();flames.name='Filmed campfire flame';parent.add(flames);
 for(let i=0;i<3;i++){const m=new THREE.Mesh(new THREE.PlaneGeometry(1.05,1.15),material);m.position.set(Math.sin(i*2.1)*.08,.70,Math.cos(i*2.1)*.08);m.rotation.y=i*Math.PI/3;m.renderOrder=4;flames.add(m);}
 const canvas=document.createElement('canvas');canvas.width=128;canvas.height=256;const x=canvas.getContext('2d');x.fillStyle='#221d19';x.fillRect(0,0,128,256);for(let i=0;i<500;i++){x.strokeStyle=i%7===0?'#b54616':['#484036','#0e1010','#675442'][i%3];x.lineWidth=1+rng()*4;x.beginPath();const a=rng()*128,b=rng()*256;x.moveTo(a,b);x.lineTo(a+(rng()-.5)*12,b+7+rng()*35);x.stroke();}const bark=new THREE.CanvasTexture(canvas);bark.colorSpace=THREE.SRGBColorSpace;bark.wrapS=bark.wrapT=THREE.RepeatWrapping;
 const charred=new THREE.MeshStandardMaterial({map:bark,roughness:1,color:0x857a70}),ember=new THREE.MeshStandardMaterial({color:0x421b0b,emissive:0xff3905,emissiveIntensity:1.8,roughness:1});
 for(let i=0;i<8;i++){const a=i*2.4,g=new THREE.CylinderGeometry(.07,.10,.98,11,3),m=new THREE.Mesh(g,charred);m.rotation.set(Math.PI/2,0,a);m.position.set(Math.cos(a)*.12,.12+i*.024,Math.sin(a)*.12);m.castShadow=m.receiveShadow=true;parent.add(m);}
 const embers=new THREE.InstancedMesh(new THREE.DodecahedronGeometry(.045,0),ember,52),dummy=new THREE.Object3D();for(let i=0;i<52;i++){const a=rng()*Math.PI*2,r=Math.sqrt(rng())*.48;dummy.position.set(Math.cos(a)*r,.055+rng()*.05,Math.sin(a)*r);dummy.rotation.set(rng(),rng(),rng());dummy.scale.set(1+rng(),.4,1+rng());dummy.updateMatrix();embers.setMatrixAt(i,dummy.matrix);}parent.add(embers);
 let time=0;return{flames,atlas,uniforms,update(dt){time+=dt;uniforms.uFrame.value=(time*24)%64;ember.emissiveIntensity=1.65+Math.sin(time*3.2)*.15;},get assetsReady(){return !!atlas.image?.complete;}};
}
