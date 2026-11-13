import * as THREE from './three.module.js';
import {mergeGeometries} from './BufferGeometryUtils.js';

// Keep interactive surfaces, the switch and each editable furniture root intact.
// Only decorative, opaque parts sharing the exact render state become one draw.
export function batchBarDetails(records){
 const roots=new Set(records.map(r=>r.root)),stats={sources:0,batches:0};
 for(const {root}of records){
  root.updateWorldMatrix(true,true);const inverse=root.matrixWorld.clone().invert(),groups=new Map();
  function visit(node){
   if(node!==root&&(roots.has(node)||node.userData.action||node.userData.openSpaceShell))return;
   if(node.isMesh){
    node.updateMatrix();node.matrixAutoUpdate=false;
    const m=node.material;
    if(node.visible&&!node.isInstancedMesh&&!node.isSkinnedMesh&&!node.userData.surface&&!Array.isArray(m)&&!m.transparent){
     const key=[m.uuid,node.castShadow,node.receiveShadow,node.layers.mask,node.renderOrder,!!node.userData.placementOverlay,Object.keys(node.geometry.attributes).sort().join(',')].join(':');
     if(!groups.has(key))groups.set(key,[]);groups.get(key).push(node);
    }
   }
   for(const child of node.children)visit(child);
  }
  visit(root);
  for(const sources of groups.values()){
   if(sources.length<2)continue;
   const geometries=sources.map(source=>{const g=source.geometry.index?source.geometry.toNonIndexed():source.geometry.clone();return g.applyMatrix4(inverse.clone().multiply(source.matrixWorld));});
   const geometry=mergeGeometries(geometries);geometries.forEach(g=>g.dispose());if(!geometry)continue;
   const first=sources[0],mesh=new THREE.Mesh(geometry,first.material);mesh.name='Batched bar details';mesh.userData.placementOverlay=!!first.userData.placementOverlay;mesh.userData.renderBatchSources=sources;mesh.castShadow=first.castShadow;mesh.receiveShadow=first.receiveShadow;mesh.layers.mask=first.layers.mask;mesh.renderOrder=first.renderOrder;mesh.matrixAutoUpdate=false;
   for(const source of sources){source.visible=false;source.userData.renderBatched=true;source.raycast=()=>{};}
   root.add(mesh);stats.sources+=sources.length;stats.batches++;
  }
 }
 return stats;
}
