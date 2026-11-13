import * as THREE from './three.module.js';
// A compact timber picnic shelter: a gabled sheet roof, four splayed posts,
// slatted floor/backrests and two three-person benches around one table.
export function buildPicnicShelter(g,{box,woodMap,iron}){
 const timber=new THREE.MeshStandardMaterial({map:woodMap,color:0x785039,roughness:.83}),floorWood=timber.clone(),frameWood=timber.clone();floorWood.color.setHex(0x946845);frameWood.color.setHex(0x67422e);
 const roofMat=new THREE.MeshStandardMaterial({color:0x65594c,roughness:.82,metalness:.12,side:THREE.DoubleSide}),boltMat=new THREE.MeshStandardMaterial({color:0x36322e,roughness:.6,metalness:.6});
 function beam(a,b,w=.13,d=.13,solid=false){const m=box(w,a.distanceTo(b),d,0,0,0,frameWood,g,false);m.position.copy(a).add(b).multiplyScalar(.5);m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),b.clone().sub(a).normalize());if(solid){g.updateWorldMatrix(true,true);const bounds=new THREE.Box3().setFromObject(m);m.geometry.computeBoundingBox();g.userData.shelterColliders.push({localRoot:m,localBox:m.geometry.boundingBox.clone(),minX:bounds.min.x,maxX:bounds.max.x,minZ:bounds.min.z,maxZ:bounds.max.z,minY:bounds.min.y,maxY:bounds.max.y,owner:g,label:'picnic shelter frame'});}return m;}
 g.name='Compact gabled timber picnic shelter';g.userData.shelterColliders=[];
 // The deck remains a single walkable surface; visible plank seams are shallow.
 const deck=box(3.18,.12,2.88,0,.07,0,floorWood,g,false,'deck');deck.name='Shelter slatted timber deck';
 for(let x=-1.45;x<=1.5;x+=.24)box(.008,.006,2.85,x,.133,0,frameWood,g);
 for(const x of [-1.42,1.42])box(.14,.12,2.98,x,.055,0,frameWood,g);
 for(const z of [-1.46,1.46])box(3.3,.15,.11,0,.075,z,frameWood,g);
 for(const x of [-1.28,1.28])for(const side of [-1,1]){
  beam(new THREE.Vector3(x,.12,side*1.30),new THREE.Vector3(x,2.37,side*.98),.13,.15,true);
  beam(new THREE.Vector3(x,.55,side*.95),new THREE.Vector3(x,2.33,side*.98),.09,.10);
  beam(new THREE.Vector3(x,1.83,side*1.05),new THREE.Vector3(x*.61,2.36,side*.98),.075,.09);
  for(const y of [.29,.70,2.20]){const screw=new THREE.Mesh(new THREE.CylinderGeometry(.019,.019,.012,8),boltMat);screw.rotation.x=Math.PI/2;screw.position.set(x,y,side*(1.30-(y-.12)/2.25*.32+.081));g.add(screw);}
 }
 // End A-frames tie the posts to the ridge; purlins support the roof sheets.
 for(const x of [-1.42,1.42]){beam(new THREE.Vector3(x,2.32,-1.42),new THREE.Vector3(x,2.32,1.42),.12,.13);for(const side of [-1,1])beam(new THREE.Vector3(x,2.27,side*1.59),new THREE.Vector3(x,2.98,0),.12,.14);}
 for(const z of [-1.44,-.78,0,.78,1.44])box(3.50,.09,.09,0,2.98-Math.abs(z)*.44-.075,z,frameWood,g);
 for(const side of [-1,1]){
  const positions=[],uv=[],indices=[],nx=96,ns=3;
  for(let i=0;i<=nx;i++)for(let j=0;j<=ns;j++){const x=-1.82+i/nx*3.64,z=side*j/ns*1.65;positions.push(x,3.00-Math.abs(z)*.44+Math.sin(i/nx*Math.PI*48)*.009,z);uv.push(i/nx,j/ns);if(i<nx&&j<ns){const k=i*(ns+1)+j;indices.push(k,k+1,k+ns+1,k+1,k+ns+2,k+ns+1);}}
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geometry.setIndex(indices);geometry.computeVertexNormals();const roof=new THREE.Mesh(geometry,roofMat);roof.name='Corrugated gable roof';roof.castShadow=roof.receiveShadow=true;g.add(roof);
  box(3.7,.15,.095,0,2.29,side*1.65,frameWood,g);
  for(const x of [-1.84,1.84])beam(new THREE.Vector3(x,2.25,side*1.69),new THREE.Vector3(x,3.045,0),.15,.075);
 }
 box(3.73,.055,.13,0,3.035,0,roofMat,g);
 // A 2.45m tabletop and six separate seat targets remain real surfaces.
 const table=box(2.46,.085,.86,0,.93,0,timber,g,true,'table');table.name='Picnic shelter table';
 for(const x of [-1.01,1.01]){box(.10,.77,.64,x,.515,0,frameWood,g,true);box(.12,.12,2.30,x,.42,0,frameWood,g);}
 for(const z of [-.215,.215])box(2.44,.006,.008,0,.976,z,frameWood,g);
 for(const side of [-1,1]){
  for(const x of [-1.01,1.01]){beam(new THREE.Vector3(x,.14,side*1.16),new THREE.Vector3(x,.55,side*.85),.09,.12);box(.12,.13,.60,x,.48,side*.99,frameWood,g);}
  for(let i=0;i<3;i++){const seat=box(.80,.055,.47,(i-1)*.82,.5525,side*.99,timber,g,false,'seat');seat.name='Picnic shelter bench seat';seat.userData.surface.gazeboSeat=i;seat.userData.surface.gazeboSide=side;box(.792,.004,.008,(i-1)*.82,.582,side*.99,frameWood,g);}
  for(const y of [.84,1.02,1.20]){const back=box(2.56,.135,.055,0,y,side*1.25,timber,g,true);back.rotation.x=-side*.08;}
 }
 // Small warm lantern and strings fit under the much lower roof.
 const lanternMat=new THREE.MeshStandardMaterial({color:0xffcd7c,emissive:0xffad47,emissiveIntensity:2});box(.12,.23,.12,0,2.59,0,lanternMat,g);box(.015,.18,.015,0,2.79,0,iron,g);const lantern=new THREE.PointLight(0xffbd72,3,6);lantern.position.set(0,2.45,0);g.add(lantern);
 const bulbMat=new THREE.MeshBasicMaterial({color:0xffc36c}),bulbs=new THREE.InstancedMesh(new THREE.SphereGeometry(.032,8,6),bulbMat,24),dummy=new THREE.Object3D(),wirePoints=[];let index=0;
 for(const side of [-1,1])for(let i=0;i<12;i++){const t=i/11,x=-1.55+t*3.1,y=2.27-Math.sin(t*Math.PI)*.11,z=side*1.42;dummy.position.set(x,y-.035,z);dummy.updateMatrix();bulbs.setMatrixAt(index++,dummy.matrix);if(i){const prev=(i-1)/11;wirePoints.push(-1.55+prev*3.1,2.27-Math.sin(prev*Math.PI)*.11,z,x,y,z);}}
 bulbs.name='Shelter warm string lights';g.add(bulbs);const wireGeo=new THREE.BufferGeometry();wireGeo.setAttribute('position',new THREE.Float32BufferAttribute(wirePoints,3));g.add(new THREE.LineSegments(wireGeo,new THREE.LineBasicMaterial({color:0x40362a})));
 return{lantern,lanternMat,bulbMat,colliders:g.userData.shelterColliders};
}
