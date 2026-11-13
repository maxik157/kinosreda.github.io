import * as THREE from './three.module.js';

// Retain every measured silhouette row and UV. Only angular samples below a
// fraction of a screen pixel are skipped; held bottles use the original mesh.
export function createShelfDetail({camera,getModels}){
 const variants=new WeakMap(),position=new THREE.Vector3(),normal=new THREE.Vector3(),view=new THREE.Vector3();let tick=1;
 function geometry(asset,step){
  if(step===1)return asset.geometry;let set=variants.get(asset);if(!set){set={};variants.set(asset,set);}if(set[step])return set[step];
  const source=asset.geometry,columns=97,rows=source.attributes.position.count/columns;if(!Number.isInteger(rows))return source;
  const indices=[];for(let j=0;j<rows-1;j++)for(let i=0;i<96;i+=step){const a=j*columns+i,b=a+columns;indices.push(a,b,a+step,a+step,b,b+step);}
  const g=new THREE.BufferGeometry();for(const [name,a]of Object.entries(source.attributes))g.setAttribute(name,a);g.setIndex(indices);g.boundingBox=source.boundingBox?.clone();g.boundingSphere=source.boundingSphere?.clone();set[step]=g;(asset.shelfGeometries??=new Set()).add(g);return g;
 }
 return{update(dt){tick+=dt;if(tick<.1)return;tick=0;for(const model of getModels().values()){
  const asset=model.userData.packageAsset;if(!asset)continue;const mesh=model.children.find(c=>c.name==='Continuous package surface');if(!mesh)continue;
  const held=model.userData.held,dist=model.getWorldPosition(position).distanceTo(camera.position),step=held||dist<1.8?1:dist<4?2:4;
  for(const disk of model.children.filter(c=>c.userData.packageDisk)){disk.getWorldPosition(position);normal.set(0,0,1).transformDirection(disk.matrixWorld);view.copy(camera.position).sub(position);disk.visible=held||normal.dot(view)>-1e-7;}
  mesh.geometry=geometry(asset,step);mesh.userData.sharedShelfGeometry=mesh.geometry!==asset.geometry;
 }}};
}
