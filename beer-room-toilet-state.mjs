import {groundHeight} from './beer-room-terrain.mjs';
import {toiletSite} from './beer-room-site.mjs';
export const toiletDurations={pee:8000,poop:11000};
export function createToiletState(){return{owner:null,mode:null,startedAt:0,duration:0};}
export function toiletPosition(mode,layout){const site={...toiletSite,...layout},z=(mode==='poop'?-.55:.17)*(site.sz??1);return{x:site.x+Math.sin(site.yaw)*z,y:groundHeight(site.x,site.z)+(mode==='poop'?.68*(site.sy??1)-.54:.14*(site.sy??1)),z:site.z+Math.cos(site.yaw)*z,yaw:site.yaw+(mode==='poop'?Math.PI:0)};}
export function claimToilet(state,user,mode,open,now=Date.now(),layout){
 const site={...toiletSite,...layout};
 if(layout?.deleted)return 'Туалет сейчас недоступен';
 if(!open||!toiletDurations[mode])return 'Туалет сейчас недоступен';
 if(state.owner&&state.owner!==user.id)return 'Туалет занят';
 if(!Number.isFinite(user.x)||!Number.isFinite(user.z)||Math.hypot(user.x-site.x,user.z-site.z)>4.2)return 'Подойдите к туалету';
 Object.assign(state,{owner:user.id,mode,startedAt:now,duration:toiletDurations[mode]});return null;
}
export function releaseToilet(state,id){if(state.owner===id){Object.assign(state,createToiletState());return true;}return false;}
export function expireToilet(state,users,now=Date.now()){if(state.owner&&(!users.has(state.owner)||now>=state.startedAt+state.duration)){releaseToilet(state,state.owner);return true;}return false;}
