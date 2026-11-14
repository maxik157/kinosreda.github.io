// Authoritative, deterministic height field in metres. Independent of WebGL:
// server shore/transport checks and browser collisions sample the same grid.
const MIN_X=-196,MIN_Z=-169,STEP=.5,N=833;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export const sculptModes=new Set(['raise','lower','flatten','restore']);
export function createTerrainHeightStore(){
 const data=new Float32Array(N*N);let signature='',previewBase=null,revision=0,changed=null;
 function sample(x,z){const fx=clamp((x-MIN_X)/STEP,0,N-1),fz=clamp((z-MIN_Z)/STEP,0,N-1),ix=Math.min(N-2,Math.floor(fx)),iz=Math.min(N-2,Math.floor(fz)),tx=fx-ix,tz=fz-iz,k=iz*N+ix;return (data[k]*(1-tx)+data[k+1]*tx)*(1-tz)+(data[k+N]*(1-tx)+data[k+N+1]*tx)*tz;}
 function draw(e,base){if(e.deleted||!sculptModes.has(e.material))return;const weights=new Map(),r=e.radius;
  const stamp=p=>{const x0=clamp(Math.floor((p[0]-r-MIN_X)/STEP),0,N-1),x1=clamp(Math.ceil((p[0]+r-MIN_X)/STEP),0,N-1),z0=clamp(Math.floor((p[1]-r-MIN_Z)/STEP),0,N-1),z1=clamp(Math.ceil((p[1]+r-MIN_Z)/STEP),0,N-1);for(let j=z0;j<=z1;j++)for(let i=x0;i<=x1;i++){const d=Math.hypot(MIN_X+i*STEP-p[0],MIN_Z+j*STEP-p[1])/r;if(d>=1)continue;const t=clamp((1-d)/e.softness,0,1),w=t*t*(3-2*t),k=j*N+i;if(w>(weights.get(k)||0))weights.set(k,w);}};
  e.points.forEach((p,i)=>{const a=e.points[i-1];if(!a){stamp(p);return;}const n=Math.max(1,Math.ceil(Math.hypot(p[0]-a[0],p[1]-a[1])/Math.max(.15,r*.18)));for(let j=1;j<=n;j++)stamp([a[0]+(p[0]-a[0])*j/n,a[1]+(p[1]-a[1])*j/n]);});
  for(const [k,w]of weights){const j=Math.floor(k/N),i=k%N,x=MIN_X+i*STEP,z=MIN_Z+j*STEP,t=w*e.strength;let v=data[k];if(e.material==='raise'||e.material==='lower')v+=(e.material==='raise'?1:-1)*(e.amount??.35)*t;else if(e.material==='restore')v*=1-t;else v+=(e.level-base(x,z)-v)*t;data[k]=clamp(v,-8,8);}
 }
 function bounds(entries){let b=null;for(const e of entries)if(sculptModes.has(e.material)&&!e.deleted)for(const [x,z]of e.points){b??={minX:x-e.radius,maxX:x+e.radius,minZ:z-e.radius,maxZ:z+e.radius};b.minX=Math.min(b.minX,x-e.radius);b.maxX=Math.max(b.maxX,x+e.radius);b.minZ=Math.min(b.minZ,z-e.radius);b.maxZ=Math.max(b.maxZ,z+e.radius);}return b;}
 let prior=[];
 function snapshot(entries,base,force=false){const es=Object.values(entries).filter(e=>e.id.startsWith('terrain:')&&sculptModes.has(e.material)).sort((a,b)=>a.order-b.order||a.id.localeCompare(b.id)),sig=es.map(e=>e.id+':'+e.version+':'+e.deleted).join('|');if(!force&&!previewBase&&sig===signature)return null;const oldById=new Map(prior.map(e=>[e.id,e])),newById=new Map(es.map(e=>[e.id,e]));let region=bounds([...prior.filter(e=>!newById.has(e.id)||newById.get(e.id).version!==e.version||previewBase),...es.filter(e=>!oldById.has(e.id)||oldById.get(e.id).version!==e.version||previewBase)].map(e=>({...e,deleted:false})));if(previewBase&&changed)region=region?{minX:Math.min(region.minX,changed.minX),maxX:Math.max(region.maxX,changed.maxX),minZ:Math.min(region.minZ,changed.minZ),maxZ:Math.max(region.maxZ,changed.maxZ)}:changed;const appendOnly=!force&&!previewBase&&es.length>=prior.length&&prior.every((e,i)=>es[i].id===e.id&&es[i].version===e.version&&es[i].deleted===e.deleted);if(!appendOnly)data.fill(0);for(const e of appendOnly?es.slice(prior.length):es)draw(e,base);signature=sig;prior=es.map(e=>({...e}));previewBase=null;revision++;changed=region;return region;}
 return{sample,snapshot,preview(e,base){previewBase??=data.slice();data.set(previewBase);draw(e,base);revision++;changed=bounds([e]);return changed;},get revision(){return revision;},get changed(){return changed;},reset(){data.fill(0);signature='';prior=[];previewBase=null;revision++;}};
}
export const terrainHeights=createTerrainHeightStore();
