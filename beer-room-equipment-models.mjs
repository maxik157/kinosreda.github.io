import * as THREE from './three.module.js';
import {GLTFLoader} from './GLTFLoader.js';
const v=(x,y,z)=>new THREE.Vector3(x,y,z);
let nivaPromise,chipMap,chipBack;
const mat=(color,opts={})=>new THREE.MeshStandardMaterial({color,roughness:.65,...opts});
const orange=mat(0xf37420),graphite=mat(0x22272a),edge=mat(0xc6cbd0,{metalness:.55,roughness:.32}),blue=mat(0x203e85,{roughness:.43}),white=mat(0xf1f0eb,{roughness:.38});
function roundedShape(w,d,r){const s=new THREE.Shape(),x=-w/2,z=-d/2;s.moveTo(x+r,z);s.lineTo(x+w-r,z);s.quadraticCurveTo(x+w,z,x+w,z+r);s.lineTo(x+w,z+d-r);s.quadraticCurveTo(x+w,z+d,x+w-r,z+d);s.lineTo(x+r,z+d);s.quadraticCurveTo(x,z+d,x,z+d-r);s.lineTo(x,z+r);s.quadraticCurveTo(x,z,x+r,z);return s;}
function roundedBox(api,w,h,d,x,y,z,m,r=.02){const g=new THREE.ExtrudeGeometry(roundedShape(w,d,Math.min(r,w/3,d/3)),{depth:h,bevelEnabled:false,curveSegments:5});g.rotateX(-Math.PI/2);const o=api.mesh(g,m);o.position.set(x,y-h/2,z);return o;}
function printMap(text,color='#ffffff',background='#24282b',w=512,h=128){const c=document.createElement('canvas');c.width=w;c.height=h;const x=c.getContext('2d');x.fillStyle=background;x.fillRect(0,0,w,h);x.fillStyle=color;x.font=`bold ${Math.floor(h*.51)}px Arial`;x.textAlign='center';x.textBaseline='middle';x.fillText(text,w/2,h*.53,w*.92);const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;return t;}
function decal(api,w,d,x,y,z,map){const m=api.mesh(new THREE.PlaneGeometry(w,d),new THREE.MeshStandardMaterial({map,roughness:.68}));m.rotation.x=-Math.PI/2;m.position.set(x,y,z);return m;}
function extruded(api,points,thickness,material,y){const s=new THREE.Shape();s.moveTo(...points[0]);for(const p of points.slice(1))s.lineTo(...p);s.closePath();const g=new THREE.ExtrudeGeometry(s,{depth:thickness,bevelEnabled:true,bevelThickness:.002,bevelSize:.002,bevelSegments:2,steps:1});g.rotateX(-Math.PI/2);const m=api.mesh(g,material);m.position.y=y;return m;}
export function buildEquipment(kind,api){const{root,mesh,box,beam,solid,surface,R}=api;
 if(kind==='axe-splitting'||kind==='axe-universal'){
  const splitting=kind==='axe-splitting',length=splitting?.831:.494,head=length*.42;
  roundedBox(api,length-.11,.033,.048,-.04,.025,0,graphite,.021);
  roundedBox(api,length*.31,.039,.055,-length*.35,.025,0,orange,.022);
  roundedBox(api,.055,.047,.065,-length*.52,.025,0,orange,.023);
  // A wedge in plan: narrow sharp edge, deep splitting shoulders and a poll.
  extruded(api,[[head-.045,-.08],[head+.085,-.108],[head+.102,.07],[head+.03,.09],[head-.06,.045]],.065,graphite,.008);
  extruded(api,[[head+.064,-.106],[head+.089,-.111],[head+.107,.07],[head+.083,.081]],.061,edge,.010);
  decal(api,length*.21,.027,-.01,.043,0,printMap('FISKARS'));
  decal(api,.09,.03,-length*.30,.046,0,printMap(splitting?'X27':'X15','#22272a','#f37420'));
  for(let i=0;i<12;i++)box(.002,.001,.036,-length*.49+i*length*.022,.045,0,graphite);
 }else if(kind==='kitchen-knife'){
  extruded(api,[[-.17,.026],[-.14,-.028],[.04,-.027],[.055,.024]],.003,edge,.005);
  roundedBox(api,.132,.024,.036,.115,.015,0,graphite,.012);
  for(const x of [.075,.15]){const pin=mesh(new THREE.CylinderGeometry(.003,.003,.001,10),edge);pin.position.set(x,.028,0);}
  box(.008,.03,.039,.051,.015,0,edge);
 }else if(kind==='cutting-board'){
  const wood=R.wood.clone();wood.color.setHex(0xc89d61);const board=roundedBox(api,.38,.021,.26,0,.0105,0,wood,.028);surface(board);
  // Long grain and a shallow juice groove follow the rounded perimeter.
  const curve=new THREE.ShapeGeometry(roundedShape(.345,.226,.02));const points=roundedShape(.345,.226,.02).getPoints(48).map(p=>v(p.x,.022,-p.y));const groove=mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points,true),80,.0011,4,true),R.bark);
  const hole=mesh(new THREE.TorusGeometry(.009,.0018,6,16),R.bark);hole.rotation.x=-Math.PI/2;hole.position.set(-.155,.022,-.095);
 }else if(kind==='cooler'){
  const sections=[[0,.43,.29],[.025,.46,.31],[.34,.49,.33]],pos=[],idx=[];const rings=sections.map(([y,w,d])=>roundedShape(w,d,.035).getPoints(32).slice(0,-1));const n=rings[0].length;
  for(let j=0;j<rings.length;j++)for(const p of rings[j])pos.push(p.x,sections[j][0],p.y);
  for(let j=0;j<rings.length-1;j++)for(let i=0;i<n;i++){const a=j*n+i,b=j*n+(i+1)%n;idx.push(a,b,a+n,b,b+n,a+n);}const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setIndex(idx);g.setAttribute('uv',new THREE.Float32BufferAttribute(pos.flatMap((n,i)=>i%3===0?[n/.5+.5,pos[i+1]/.34]:[]),2));g.computeVertexNormals();const body=mesh(g,blue);body.material.side=THREE.DoubleSide;
  roundedBox(api,.46,.025,.31,0,.015,0,blue,.035);
  roundedBox(api,.50,.036,.346,0,.357,0,white,.032);
  const lid=roundedBox(api,.492,.071,.34,0,.409,0,white,.038);surface(lid);
  roundedBox(api,.096,.014,.012,0,.378,.176,graphite,.003);
  // One continuous U-shaped handle on both side pivots, with a rounded top.
  const points=[v(-.257,.333,0),v(-.257,.48,0),v(-.23,.526,0),v(-.17,.539,0),v(.17,.539,0),v(.23,.526,0),v(.257,.48,0),v(.257,.333,0)];
  mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points),48,.012,8,false),blue);
  for(const x of [-.255,.255]){const pivot=mesh(new THREE.CylinderGeometry(.026,.026,.012,16),blue);pivot.rotation.z=Math.PI/2;pivot.position.set(x,.338,0);}
  solid(0,.224,0,.50,.448,.35);
 }else if(kind==='shovel'){
  roundedBox(api,.84,.028,.032,-.10,.025,0,graphite,.014);
  const handle=new THREE.CurvePath();handle.add(new THREE.LineCurve3(v(-.52,.025,-.065),v(-.38,.025,-.032)));handle.add(new THREE.LineCurve3(v(-.38,.025,-.032),v(-.38,.025,.032)));handle.add(new THREE.LineCurve3(v(-.38,.025,.032),v(-.52,.025,.065)));handle.add(new THREE.LineCurve3(v(-.52,.025,.065),v(-.52,.025,-.065)));mesh(new THREE.TubeGeometry(handle,32,.012,8,false),orange);
  const bladeMat=graphite.clone();bladeMat.metalness=.75;bladeMat.roughness=.4;
  api.patch((u,t)=>{const half=.115*(.45+.55*Math.sin(Math.PI*t*.85));return[.28+t*.29,.012+Math.pow(u*2-1,2)*.032,(u*2-1)*half];},14,14,bladeMat,'Curved shovel blade');bladeMat.side=THREE.DoubleSide;
  for(const z of [-.04,0,.04])beam(v(.31,.019,z),v(.49,.019,z),.002,edge,5);
 }else if(kind==='doritos'){
  chipMap??=new THREE.TextureLoader().load('./assets/textures/equipment/doritos-front.webp');chipMap.colorSpace=THREE.SRGBColorSpace;chipMap.anisotropy=4;
  chipBack??=printMap('DORITOS  ·  235 g','#ffffff','#ac0c10',512,768);
  const red=mat(0xad1012,{roughness:.45}),front=mat(0xffffff,{map:chipMap,roughness:.5}),back=mat(0xffffff,{map:chipBack,roughness:.5});
  const outline=[0.91481, 0.97593, 0.95, 0.92037, 0.88333, 0.84444, 0.84074, 0.8463, 0.84444, 0.84259, 0.83889, 0.83333, 0.83519, 0.83889, 0.84259, 0.84259, 0.8463, 0.84815, 0.83519, 0.84815, 0.90185, 0.92778, 0.95185, 0.97407, 0.49259];
  const width=t=>{const f=(1-t)*(outline.length-1),i=Math.min(outline.length-2,Math.floor(f));return .10*(outline[i]+(outline[i+1]-outline[i])*(f-i));};
  for(const side of [1,-1]){
   const m=api.patch((u,t)=>{const depth=.0025+.032*Math.pow(Math.sin(Math.PI*u),.6)*Math.pow(Math.sin(Math.PI*t),.6),wrinkle=.0018*Math.sin(u*48+t*17)*Math.sin(t*Math.PI);return[(u*2-1)*width(t),.285*t,side*(depth+wrinkle)];},32,32,side===1?front:back,'Puffed Doritos bag');
   if(side<0){const a=m.geometry.getAttribute('uv');for(let i=0;i<a.count;i++)a.setX(i,1-a.getX(i));m.geometry.setIndex(Array.from(m.geometry.index.array).reduce((out,x,i,arr)=>{if(i%3===0)out.push(arr[i],arr[i+2],arr[i+1]);return out;},[]));m.geometry.computeVertexNormals();}

  }
  for(const side of [-1,1])api.patch((u,t)=>[side*width(t),.285*t,(u*2-1)*.0025],2,32,new THREE.MeshStandardMaterial({color:0xad1012,roughness:.5,side:THREE.DoubleSide}),'Sealed bag side');
  for(const y of [.004,.281]){box(.20,.008,.006,0,y,0,red);for(let i=0;i<40;i++)box(.001,.006,.0008,-.098+i*.005,y,.0036,orange);}
 }else if(kind==='lada-niva'){
  // Fixed metre-sized surfaces/colliders remain available while the cached GLB loads.
  solid(0,.82,0,1.68,1.64,3.72);
  const proxy=box(1.18,.015,1.32,0,1.53,.08,new THREE.MeshBasicMaterial({visible:false}));proxy.castShadow=false;surface(proxy);
  nivaPromise??=new GLTFLoader().loadAsync('./assets/models/equipment/lada-niva.glb').then(g=>g.scene).catch(e=>{nivaPromise=null;throw e;});
  root.userData.assetReady=nivaPromise.then(template=>{const model=template.clone(true);model.traverse(o=>{if(o.isMesh)o.castShadow=o.receiveShadow=true;});root.add(model);root.userData.assetLoaded=true;return model;});
 }
}
