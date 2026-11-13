// Shared world coordinates for rendering, collision, terrain and networking.
export const barSite={x:0,z:-11,width:16,depth:17,bounds:{minX:-7.64,maxX:7.64,minZ:-18.95,maxZ:-3.05}};
export const toiletSite={x:-28,z:-9,width:2.45,depth:2.35,height:3.55,yaw:Math.atan2(5+28,14+9)};
export const woodshedSite={x:-12.5,z:-17,width:4.3,depth:1.25,height:3.6,yaw:0};
export function serviceClearance(x,z,padding=0){
 return Math.hypot(x-toiletSite.x,z-toiletSite.z)<2.8+padding||Math.abs(x-woodshedSite.x)<2.8+padding&&Math.abs(z-woodshedSite.z)<1.5+padding;
}
