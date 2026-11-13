import {preparePackage} from './beer-package-model.mjs';
import * as THREE from './three.module.js';

const IMAGE_CACHE='kinosreda-room-images-v2',pending=new Map();
const keyFor=source=>new URL('/__kinosreda_cached_beer?source='+encodeURIComponent(source),location.origin).href;
const MODEL_VERSION='atlas-v11';
let database;
const db=()=>database??=new Promise((resolve,reject)=>{const r=indexedDB.open('kinosreda-room-packages',1);r.onupgradeneeded=()=>r.result.createObjectStore('models');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
async function saved(source){try{const d=await db();return await new Promise((resolve,reject)=>{const r=d.transaction('models').objectStore('models').get(MODEL_VERSION+':'+source);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}catch{return null;}}
async function persist(source,asset){try{
 const atlas=await new Promise(resolve=>asset.texture.image.toBlob(resolve,'image/png'));if(!atlas)return;
 const record={atlas,profile:asset.profile,capColor:asset.capColor,index:asset.geometry.index.array,...Object.fromEntries(['position','normal','uv'].map(k=>[k,asset.geometry.attributes[k].array]))};
 const d=await db();await new Promise((resolve,reject)=>{const t=d.transaction('models','readwrite');t.objectStore('models').put(record,MODEL_VERSION+':'+source);t.oncomplete=resolve;t.onerror=()=>reject(t.error);});
}catch{}}
async function restore(record,anisotropy){
 const bitmap=await createImageBitmap(record.atlas),canvas=document.createElement('canvas');canvas.width=bitmap.width;canvas.height=bitmap.height;canvas.getContext('2d').drawImage(bitmap,0,0);bitmap.close();
 const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;texture.wrapS=THREE.RepeatWrapping;texture.anisotropy=anisotropy;
 const geometry=new THREE.BufferGeometry();for(const [name,size]of [['position',3],['normal',3],['uv',2]])geometry.setAttribute(name,new THREE.BufferAttribute(record[name],size));geometry.setIndex(new THREE.BufferAttribute(record.index,1));geometry.computeBoundingBox();geometry.computeBoundingSphere();
 return{profile:record.profile,capColor:record.capColor,texture,geometry,fromPersistentCache:true};
}

async function getBlob(source,url){
 let cache=null;try{cache=await caches.open(IMAGE_CACHE);}catch{}
 const key=keyFor(source),cached=await cache?.match(key);
 if(cached){try{const blob=await cached.blob(),probe=await createImageBitmap(blob);probe.close();return blob;}catch{await cache.delete(key);}}
 const response=await fetch(url,{cache:'force-cache',signal:AbortSignal.timeout(45000)});
 if(!response.ok)throw Error(`Не удалось загрузить упаковку: ${response.status}`);
 const blob=await response.blob(),probe=await createImageBitmap(blob);probe.close();
 try{await cache?.put(key,new Response(blob,{headers:{'content-type':blob.type||'image/png'}}));}catch{}
 return blob;
}

export async function loadCachedPackage(source,url,anisotropy=4){
 if(pending.has(source))return pending.get(source);
 const request=(async()=>{const record=await saved(source);if(record){try{return await restore(record,anisotropy);}catch{}}
  const blob=await getBlob(source,url),bitmap=await createImageBitmap(blob);let asset;try{asset=preparePackage(bitmap,anisotropy);}finally{bitmap.close();}
  persist(source,asset);return asset;
 })();
 pending.set(source,request);try{return await request;}catch(error){pending.delete(source);throw error;}
}
export const packageCacheNames={images:IMAGE_CACHE};
