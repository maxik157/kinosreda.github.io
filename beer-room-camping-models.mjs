import * as THREE from './three.module.js';
import {setTransformedBox} from './beer-room-collision.mjs';
import {treeBarkMaterial,scaleBarkUV} from './beer-room-bark.mjs';
import {needleTexture,leafTexture} from './beer-room-forest.mjs';
const v=(x,y,z)=>new THREE.Vector3(x,y,z);

export function buildCampTent(kind,a){
 if(kind==='tent-xdome')return buildXDome(a);
 const {root,mesh,box,beam,patch,R,colors,colliders}=a,xdome=kind==='tent-xdome',vestibule=kind==='tent-vestibule'||xdome,ridge=kind==='tent-ridge';
 const w=xdome?.76:ridge?1.20:vestibule?1.13:1.0,h=xdome?1.28:ridge?1.65:vestibule?1.48:1.38,len=xdome?2.55:vestibule?2.55:2.30;
 colors.outerColor=new THREE.MeshStandardMaterial({color:xdome?0x83978a:0x788449,map:R.cloth,side:THREE.DoubleSide,roughness:.92});
 colors.innerColor=new THREE.MeshStandardMaterial({color:xdome?0xc8c7ac:0xd9ba7a,map:R.cloth,side:THREE.DoubleSide,roughness:1});
 const endScale=xdome?.96:ridge?1:.90;
 const cross=(u,t=0)=>v(ridge?(2*u-1)*w:-Math.cos(u*Math.PI)*w,.065+h*(ridge?1-Math.abs(2*u-1):Math.sin(u*Math.PI))*(endScale+(1-endScale)*Math.sin(t*Math.PI)),(t-.5)*len);
 patch((u,t)=>cross(u,t).toArray(),40,28,colors.outerColor,'Наружный тент');
 patch((u,t)=>{const p=cross(u,t*.90+.05);p.x*=.87;p.y=.065+(p.y-.065)*.88;return p.toArray();},32,24,colors.innerColor,'Внутренний тент');
 box(w*1.74,.035,len*.90,0,.04,0,R.black);
 // Closed rear walls for both layers; no view through the rear of the tent.
 const cap=(scale,t,material,door=false)=>{const shape=new THREE.Shape(),left=cross(0,t);shape.moveTo(left.x*scale,.06);for(let i=0;i<=40;i++){const p=cross(i/40,t);shape.lineTo(p.x*scale,.065+(p.y-.065)*scale);}shape.lineTo(w*scale,.06);shape.closePath();
  const doorW=Math.min(.48,w*.64),doorH=Math.min(1.21,.065+h*(endScale+(1-endScale)*Math.sin(t*Math.PI))*scale-.025);
  if(door){const hole=new THREE.Path();hole.moveTo(-doorW,.06);if(ridge){hole.lineTo(0,doorH);hole.lineTo(doorW,.06);}else{hole.lineTo(-doorW,doorH-.12);hole.quadraticCurveTo(-doorW,doorH,0,doorH);hole.quadraticCurveTo(doorW,doorH,doorW,doorH-.12);hole.lineTo(doorW,.06);}hole.closePath();shape.holes.push(hole);}
  const m=mesh(new THREE.ShapeGeometry(shape,28),material,door?'Вход с открытой молнией':'Сплошная задняя стенка');m.position.z=(t-.5)*len;
  return{doorW,doorH};};
 cap(1,0,colors.outerColor);cap(.87,.05,colors.innerColor);
 const front=cap(.87,.95,colors.innerColor,true);if(!vestibule)cap(1,1,colors.outerColor,true);
 // The door is rolled and tied to the jamb instead of detached triangular flaps.
 const doorZ=len*.45+.01,zip=[];zip.push(...(ridge?[v(-front.doorW,.07,doorZ),v(0,front.doorH,doorZ),v(front.doorW,.07,doorZ)]:[v(-front.doorW,.07,doorZ),v(-front.doorW,front.doorH-.13,doorZ),v(0,front.doorH,doorZ),v(front.doorW,front.doorH-.13,doorZ),v(front.doorW,.07,doorZ)]));
 mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(zip),56,.004,5,false),R.trim,'Молния входа');
 beam(v(front.doorW+.025,.14,doorZ),ridge?v(.045,front.doorH-.08,doorZ):v(front.doorW+.025,front.doorH-.10,doorZ),.018,colors.innerColor,10);
 for(const y of [.25,front.doorH-.20])beam(v(front.doorW-.005,y,doorZ+.028),v(front.doorW+.07,y,doorZ+.028),.008,R.trim,6);
 if(xdome){
  for(const sign of [-1,1]){const points=[];for(let i=0;i<=56;i++){const t=i/56,p=cross(sign>0?t:1-t,t);p.y+=.026;points.push(p);}mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points),64,.009,7,false),R.steel,'Перекрёстная дуга X-Dome');}
  beam(v(-.68,h+.08,0),v(.68,h+.08,0),.010,R.steel,8);
 }else if(ridge){beam(v(0,.03,-len*.5),v(0,h+.09,-len*.5),.012,R.steel);beam(v(0,.03,len*.5),v(0,h+.09,len*.5),.012,R.steel);beam(v(0,h+.09,-len*.5),v(0,h+.09,len*.5),.011,R.steel);}
 else for(const t of [.18,.82]){const points=[];for(let i=0;i<=40;i++){const p=cross(i/40,t);p.multiplyScalar(1.012);points.push(p);}mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points),48,.010,7,false),R.steel,'Дуга палатки');}
 if(vestibule){
  const ext=xdome?.78:1.0;
  // Two fly panels converge on a real open vestibule, with tied-back entry edges.
  for(const side of [-1,1])patch((u,t)=>{const p=cross(side<0?u*.5:1-u*.5,1);return[p.x*(1-t*.38),.06+(p.y-.06)*(1-t*.40),len*.5+t*ext];},24,16,colors.outerColor,'Тент тамбура');
  const edge=[];for(let i=0;i<=40;i++)edge.push(v(-Math.cos(i/40*Math.PI)*w*.62,.06+Math.sin(i/40*Math.PI)*h*endScale*.60,len*.5+ext));mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(edge),48,.003,5,false),R.trim,'Край открытого тамбура');
 }
 for(const side of [-1,1])for(const t of [0,1]){const p=cross(side<0?.06:.94,t),peg=v(side*(w+.40),.012,(t-.5)*(len+.52));beam(p,peg,.0028,R.white,4);beam(peg,peg.clone().add(v(0,-.11,.03)),.006,R.steel,6);}
 function colliderPanel(p,q,depth,z=0){const size=p.distanceTo(q),frame=new THREE.Matrix4().compose(p.clone().add(q).multiplyScalar(.5).setZ(z),new THREE.Quaternion().setFromUnitVectors(v(0,1,0),q.clone().sub(p).normalize()),v(1,1,1)),b=new THREE.Box3(v(-.018,-size/2,-depth/2),v(.018,size/2,depth/2)),c={owner:root,localRoot:root,localBox:b,localFrame:frame,label:'tent canvas'};setTransformedBox(c,b,frame);colliders.push(c);}
 // The solid canvas follows its profile, leaving an avatar-width entry.
 // These are thin panels, never a solid bounding box around the whole tent.
 const sections=ridge?2:12;for(let slice=0;slice<4;slice++){const t=(slice+.5)/4;for(let i=0;i<sections;i++)colliderPanel(cross(i/sections,t).setZ(0),cross((i+1)/sections,t).setZ(0),len/4,(t-.5)*len);}
 for(const side of [-1,1]){const dw=front.doorW;const cx=side*(dw+(w*.87-dw)/2),cw=w*.87-dw;a.solid(cx,front.doorH/2,doorZ,cw,front.doorH,.035);}
 for(let i=0;i<16;i++){const x=-w+(i+.5)*w/8,u=ridge?(x/w+1)/2:Math.acos(-x/w)/Math.PI,top=cross(u,0).y;a.solid(x,top/2,-len*.495,w/8,top,.035);}
 root.userData.tent={width:w*2,length:len,height:h,doorWidth:front.doorW*2,doorHeight:front.doorH,crouch:true,rearClosed:true};
}

export function buildHelinoxChair(a){
 const {root,patch,beam,mesh,box,surface,solid,R}=a,cloth=R.clothMat;
 // Side reference: a reclining bucket, two side hubs and straight radial tubes.
 // The long rear uprights lean ~31 degrees from vertical; the low front lip
 // hangs in front of the hubs rather than making a vertical dining-chair back.
 const seat=(u,t)=>{const x=2*u-1;if(t<=.40){const q=t/.40;return[x*(.25-.04*Math.sin(q*Math.PI/2)),.39-.035*Math.sin(q*Math.PI)+.055*x*x,.28-.43*q];}const q=(t-.40)/.60;return[x*(.21+.06*q),.39+.55*q+(.055-.015*q)*x*x,-.15-.35*q];};
 const fabric=patch(seat,40,48,cloth,'Наклонный тканевый ковш кресла');
 const frame=[];const tube=(p,q,role)=>{beam(p,q,.0105,R.blue,10);frame.push({a:p.toArray(),b:q.toArray(),radius:.0105,role});};
 for(const side of [-1,1]){
  const hub=v(side*.31,.28,.03),front=v(side*.275,.445,.28),back=v(side*.29,.98,-.50),frontFoot=v(side*.34,.025,.373),rearFoot=v(side*.34,.025,-.36);
  tube(frontFoot,hub,'front-leg');tube(rearFoot,hub,'rear-leg');tube(hub,front,'seat-pole');tube(hub,back,'back-pole');
  const socket=mesh(new THREE.SphereGeometry(.028,12,8),R.black);socket.scale.set(1,.8,1.2);socket.position.copy(hub);
  for(const p of [frontFoot,rearFoot]){const foot=mesh(new THREE.CapsuleGeometry(.022,.035,4,10),R.black);foot.rotation.z=Math.PI/2;foot.position.copy(p);foot.position.y=.026;}
  // Leg-restraint webbing forms the X visible below the bucket in the reference.
  const opposite=v(-side*.34,.036,-.36);beam(frontFoot.clone().setY(.036),opposite,.006,R.black,4);
  patch((u,t)=>{const lower=new THREE.Vector3(...seat(side<0?0:1,u)),upper=front.clone().lerp(back,u);return lower.lerp(upper,t).toArray();},32,12,cloth,'Боковина тканевого ковша');
  const border=[];for(let i=0;i<=48;i++)border.push(new THREE.Vector3(...seat(side<0?0:1,i/48)));mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(border),56,.003,6,false),R.black,'Шов и окантовка');
  for(const p of [front,back]){const pocket=mesh(new THREE.SphereGeometry(.025,10,8),cloth,'Усиленный карман крепления ткани');pocket.scale.set(1,.75,1);pocket.position.copy(p);}
 }
 tube(v(-.31,.28,.03),v(.31,.28,.03),'crossbar');
 const proxy=box(.40,.008,.34,0,.385,.06,new THREE.MeshBasicMaterial({transparent:true,opacity:0,depthWrite:false}));proxy.castShadow=proxy.receiveShadow=false;const s=surface(proxy,'seat');s.seatKind='folding-chair';for(const m of root.children)if(m.material===cloth)m.userData={action:'seat',surface:s};
 solid(0,.23,.02,.52,.44,.55);root.userData.chairFrame=frame;root.userData.chairCloth=fabric.uuid;
}

export function buildHammock(a){
 const {root,mesh,patch,R,surface,colliders}=a,cloth=R.clothMat.clone();cloth.color.setHex(0x637c60);
 const fabric=patch(()=>[0,0,0],48,18,cloth,'Ткань гамака'),rope=mesh(new THREE.BufferGeometry(),R.white,'Подвесы гамака'),trim=mesh(new THREE.BufferGeometry(),R.trim,'Кромка гамака');const bed=surface(fabric,'hammock');bed.action='lie';fabric.userData.action='lie';const collision={owner:root,localRoot:root,localBox:new THREE.Box3(),dynamic:true};colliders.push(collision);let signature='';
 return(from,to,sag)=>{
  const key=[...from.toArray(),...to.toArray(),sag].map(n=>n.toFixed(3)).join(':');if(key===signature)return false;signature=key;
  const delta=to.clone().sub(from),length=delta.length(),axis=delta.clone().normalize(),side=v(-axis.z,0,axis.x).normalize(),middle=from.clone().add(to).multiplyScalar(.5),body=Math.min(2.9,length*.76),start=middle.clone().addScaledVector(axis,-body/2),end=middle.clone().addScaledVector(axis,body/2);start.y-=.12;end.y-=.12;
  const point=(u,t)=>{const cross=2*t-1,width=.66*Math.pow(Math.sin(Math.PI*u),.65),p=start.clone().lerp(end,u).addScaledVector(side,cross*width);p.y-=Math.sin(Math.PI*u)*(sag+.10)*(1-.30*cross*cross);return p;};
  const p=fabric.geometry.attributes.position;let i=0;for(let t=0;t<=18;t++)for(let u=0;u<=48;u++){const v=point(u/48,t/18);p.setXYZ(i++,v.x,v.y,v.z);}p.needsUpdate=true;fabric.geometry.computeVertexNormals();fabric.geometry.computeBoundingSphere();
  const parts=[];for(const [x,y]of [[from,start],[end,to]])parts.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([x,x.clone().lerp(y,.5).add(v(0,-.015,0)),y]),12,.008,6,false));
  const borders=[];for(const t of [0,1]){const pts=[];for(let j=0;j<=48;j++)pts.push(point(j/48,t));borders.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts),48,.005,6,false));}
  const merge=geos=>{const positions=[],normals=[],uvs=[];for(const g of geos){const n=g.toNonIndexed();positions.push(...n.attributes.position.array);normals.push(...n.attributes.normal.array);uvs.push(...n.attributes.uv.array);n.dispose();g.dispose();}const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));return g;};
  rope.geometry.dispose();rope.geometry=merge(parts);trim.geometry.dispose();trim.geometry=merge(borders);fabric.geometry.computeBoundingBox();collision.localBox.copy(fabric.geometry.boundingBox).expandByScalar(.035);Object.assign(collision,{minX:collision.localBox.min.x,maxX:collision.localBox.max.x,minY:collision.localBox.min.y,maxY:collision.localBox.max.y,minZ:collision.localBox.min.z,maxZ:collision.localBox.max.z});bed.localLying=point(.5,.5).add(v(0,.06,0));bed.localEye=point(.74,.5).add(v(0,.34,0));bed.localExit=point(.5,.5).addScaledVector(side,1.15);bed.localYaw=Math.atan2(axis.x,axis.z);bed.seatPosition=bed.localLying.clone();bed.eyePosition=bed.localEye.clone();bed.exitPosition=bed.localExit.clone();bed.yaw=bed.localYaw;bed.pitch=.12;bed.topY=bed.seatPosition.y;root.userData.hammockSurface=bed;return true;
 };
}

let youngMaterials;
export function buildYoungTree(kind,a){
 const {root,mesh,beam,solid}=a;if(!youngMaterials)youngMaterials={wood:treeBarkMaterial(),birch:treeBarkMaterial(true),pine:new THREE.MeshStandardMaterial({map:needleTexture(),alphaTest:.38,side:THREE.DoubleSide,roughness:1,color:0xd4e0c5}),spruce:new THREE.MeshStandardMaterial({map:needleTexture(4),alphaTest:.38,side:THREE.DoubleSide,roughness:1,color:0xc3d2b9}),leaf:new THREE.MeshStandardMaterial({map:leafTexture(5),alphaTest:.35,side:THREE.DoubleSide,roughness:1})};
 const birch=kind==='young-birch',spruce=kind==='young-spruce',height=birch?4.4:spruce?3.5:4.0,bark=birch?youngMaterials.birch:youngMaterials.wood;
 const stem=mesh(scaleBarkUV(new THREE.CylinderGeometry(.012,birch?.070:.085,height,12,12),height,.08),bark,'Ствол молодого дерева');stem.position.y=height/2;
 let seed=kind.length*337;const rand=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
 const foliage=(p,width,mat,angle)=>{for(let k=0;k<3;k++){const g=new THREE.PlaneGeometry(width,width*(birch?1.1:.70),2,2);g.rotateX(birch?(rand()-.5)*2.4:k===0?-1.1:.15);g.rotateY(angle+k*1.04);const m=mesh(g,mat);m.position.copy(p);if(birch)m.position.add(v((rand()-.5)*.24,(rand()-.5)*.28,(rand()-.5)*.24));}};
 const levels=birch?13:spruce?11:8;for(let level=0;level<levels;level++){const t=level/levels,y=(birch?1.0:.42)+t*(height-(birch?1.3:.65))+(rand()-.5)*.12,reach=birch?1.25*Math.pow(Math.sin((.16+.78*t)*Math.PI),.75):(spruce?1.10:1.15)*Math.pow(1-t,.72),arms=birch?1:3+level%3;
  for(let j=0;j<arms;j++){const angle=level*2.399+j*6.28/arms+(rand()-.5)*.5,length=reach*(.75+rand()*.45),start=v(0,y+(rand()-.5)*(spruce?.25:.08),0),end=v(Math.cos(angle)*length,y+(birch?.38:spruce?-.16:.18)+(rand()-.5)*.17,Math.sin(angle)*length);beam(start,end,.018*(1-t*.75),bark,6);
   for(let k=0;k<(birch?4:3);k++){const p=start.clone().lerp(end,.43+k*.19),mat=birch?youngMaterials.leaf:spruce?youngMaterials.spruce:youngMaterials.pine;foliage(p,(birch?.55:.55)*(1-t*.5),mat,angle);}
  }
 }
 foliage(v(0,height-.1,0),.38,birch?youngMaterials.leaf:spruce?youngMaterials.spruce:youngMaterials.pine,0);solid(0,height/2,0,.16,height,.16);root.userData.youngTree=true;
}

function buildXDome(a){
 const {root,mesh,box,beam,patch,solid,colors,R,colliders}=a,w=.78,half=1.30,h=1.24;
 colors.outerColor=new THREE.MeshStandardMaterial({color:0x83978a,map:R.cloth,side:THREE.DoubleSide,roughness:.94});colors.innerColor=new THREE.MeshStandardMaterial({color:0xc8c7ac,map:R.cloth,side:THREE.DoubleSide,roughness:1});
 const p=(u,t)=>v(-w*Math.cos(u*Math.PI),.055+h*Math.sin(u*Math.PI)*Math.pow(.34+.66*Math.sin(t*Math.PI),.55),(2*t-1)*half);
 const sheet=(u0,u1,t0,t1,inner=false)=>patch((u,t)=>{const q=p(u0+(u1-u0)*u,t0+(t1-t0)*t);if(inner){q.x*=.88;q.y=.055+(q.y-.055)*.90;q.z*=.90;}return q.toArray();},28,24,inner?colors.innerColor:colors.outerColor,inner?'Внутренний купол X-Dome':'Панель внешнего купола X-Dome');
 // A side doorway sits between the end panels. The fly opens towards its
 // asymmetrical vestibule, rather than making this a tunnel with an end door.
 for(const inner of [false,true]){sheet(0,.57,0,1,inner);sheet(.57,1,0,.23,inner);sheet(.57,1,.77,1,inner);}
 box(1.29,.035,2.32,0,.045,0,R.black);for(const x of [-.64,.64])box(.025,.13,2.32,x,.10,0,R.black);for(const z of [-1.15,1.15])box(1.29,.13,.025,0,.10,z,R.black);
 for(const t of [0,1]){const shape=new THREE.Shape();shape.moveTo(-w,.055);for(let i=0;i<=40;i++){const q=p(i/40,t);shape.lineTo(q.x,q.y);}shape.closePath();const wall=mesh(new THREE.ShapeGeometry(shape,24),colors.outerColor,'Закрытый торец X-Dome');wall.position.z=(2*t-1)*half;}
 for(const sign of [-1,1]){const points=[];for(let i=0;i<=64;i++){const t=i/64,q=p(sign>0?t:1-t,t);q.y+=.022;points.push(q);}mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points),72,.009,7,false),R.steel,'Дуга перекрёстного каркаса X-Dome');}
 beam(v(-.28,h+.075,0),v(.28,h+.075,0),.010,R.steel,8);
 // The open side has a tensioned rear vestibule panel and a tied-back front
 // panel. All edges connect to the canopy or a ground peg; no floating flaps.
 const peak=v(.22,1.23,0),pegBack=v(1.55,.045,-.70),pegFront=v(1.55,.045,.70),rearRoof=p(.72,.23),frontRoof=p(.72,.77);
 patch((u,t)=>p(.57,.23+u*.27).lerp(pegBack,t).toArray(),24,18,colors.outerColor,'Задняя панель бокового тамбура');
 const rolled=[];for(let i=0;i<=32;i++)rolled.push(p(.57+i/32*.43,.77).add(v(.012,0,.006)));mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(rolled),40,.012,7,false),colors.outerColor,'Свёрнутая дверь вдоль края тента');
 for(const q of [rearRoof,frontRoof])beam(q,q.clone().multiply(v(1.65,0,1.13)).setY(.02),.0025,R.white,4);
 for(const q of [pegBack,pegFront])beam(peak,q,.003,R.trim,5);
 const jamb=[v(.29,.15,-.60),v(.29,.96,-.60),v(.24,1.14,0),v(.29,.96,.60),v(.29,.15,.60)];mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(jamb),56,.004,5,false),R.trim,'Молния бокового входа');
 // Exact thin canopy panels, excluding the open side entrance.
 function panel(q,r,depth,z){const len=q.distanceTo(r),frame=new THREE.Matrix4().compose(q.clone().add(r).multiplyScalar(.5).setZ(z),new THREE.Quaternion().setFromUnitVectors(v(0,1,0),r.clone().sub(q).normalize()),v(1,1,1)),b=new THREE.Box3(v(-.018,-len/2,-depth/2),v(.018,len/2,depth/2)),c={owner:root,localRoot:root,localBox:b,localFrame:frame,label:'X-Dome canvas'};setTransformedBox(c,b,frame);colliders.push(c);}
 for(let s=0;s<6;s++){const t=(s+.5)/6;for(let i=0;i<12;i++){if(t>.23&&t<.77&&i>=7)continue;panel(p(i/12,t),p((i+1)/12,t),half/3,(2*t-1)*half);}}
 for(const side of [-1,1])for(let i=0;i<14;i++){const x=-w+(i+.5)*w/7,top=p(Math.acos(-x/w)/Math.PI,side<0?0:1).y;solid(x,top/2,side*half,w/7,top,.035);}
 root.userData.tent={width:1.56,length:2.6,height:1.295,doorWidth:1.2,doorHeight:1.14,entryAxis:'x',crouch:true,rearClosed:true};
}
