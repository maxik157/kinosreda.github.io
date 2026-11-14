import {terrainHeights} from './beer-room-terrain-height.mjs';
import {barSite,toiletSite,woodshedSite} from './beer-room-site.mjs';
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x)),lerp=(a,b,t)=>a+(b-a)*t,smoothstep=(x,a,b)=>{const t=clamp((x-a)/(b-a),0,1);return t*t*(3-2*t);};
export const campLayout={fire:{x:5,z:14},gazebo:{x:-9,z:13.5},bench:{x:7,z:22.2},lake:{x:15,z:79,rx:66,rz:44,y:-4.6},bounds:{minX:-185,maxX:185,minZ:-155,maxZ:215}};
export function randomSource(seed=7823){return()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};}
export function lakeDistance(x,z){const l=campLayout.lake,dx=(x-l.x)/l.rx,dz=(z-l.z)/l.rz,a=Math.atan2(dz,dx);return Math.hypot(dx,dz)/(1+.045*Math.sin(a*5)+.025*Math.cos(a*9));}
// Raised campsite, rounded shoulder, descending bank and low shore. The bar
// floor stays at its existing height; these are terrain metres, not model scale.
export function baseGroundHeight(x,z){
 const r=lakeDistance(x,z),distance=Math.hypot(x,z-20);
 let y=-.08+(.85*Math.sin(x*.041)*Math.cos(z*.047)+.24*Math.sin(x*.13+z*.08))*smoothstep(distance,24,75);
 const shoulder=smoothstep(r,1.015,1.43);
 if(r<1.43)y=campLayout.lake.y+.18+(y-campLayout.lake.y-.18)*shoulder;
 if(r<1.015)y=campLayout.lake.y+.18+(r-1.015)*15;
 // Flat construction terraces blend into the hillside, avoiding floating legs.
 for(const [cx,cz,height,inner,outer]of [[0,barSite.z,-.015,10.8,14],[toiletSite.x,toiletSite.z,-.02,2,3.6],[woodshedSite.x,woodshedSite.z,-.03,2.7,4],[campLayout.gazebo.x,campLayout.gazebo.z,-.08,5.5,9],[campLayout.fire.x,campLayout.fire.z,-.22,5.3,8.8]]){
  const blend=1-smoothstep(Math.hypot(x-cx,z-cz),inner,outer);y=lerp(y,height,blend);
 }
 const hills=smoothstep(distance,105,420)*(13+7*Math.sin(x*.012+z*.008)+5*Math.cos(z*.018));
 y+=hills;
 if(Math.abs(x)<barSite.width/2+.4&&Math.abs(z-barSite.z)<8.8)y=-.015;
 return y;
}
export function groundHeight(x,z){return baseGroundHeight(x,z)+terrainHeights.sample(x,z);}
export function syncTerrainHeights(entries,force=false){return terrainHeights.snapshot(entries,baseGroundHeight,force);}
export function previewTerrainHeight(entry){return terrainHeights.preview(entry,baseGroundHeight);}
export function canWalkGround(x,z){return groundHeight(x,z)>campLayout.lake.y-.65;}
const walkingRoutes=[[[3,barSite.z+8],[3,-.5],[2,12]],[[3,-.5],[-15,-3],[toiletSite.x+2,toiletSite.z+1]],[[-6,barSite.z+5],[-10,barSite.z],[woodshedSite.x,woodshedSite.z+1.5]],[[5,7],[2,12],[-5,13.5],[campLayout.gazebo.x,campLayout.gazebo.z]],[[2,12],[5,13],[campLayout.fire.x,campLayout.fire.z]],[[2,12],[3,21],[4,28],[5,34],[4,37]],[[2,12],[-5,18],[-10,27],[-20,39]],[[7,2],[19,4],[30,0],[38,-10]]];
export function pathDistance(x,z){
 let d=Infinity;for(const route of walkingRoutes)for(let i=1;i<route.length;i++){const [ax,az]=route[i-1],[bx,bz]=route[i],vx=bx-ax,vz=bz-az,t=clamp(((x-ax)*vx+(z-az)*vz)/(vx*vx+vz*vz),0,1);d=Math.min(d,Math.hypot(x-ax-vx*t,z-az-vz*t));}return d;
}
