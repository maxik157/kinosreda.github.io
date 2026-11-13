import {sculptModes} from './beer-room-terrain-height.mjs';
import {propMeta} from './beer-room-prop-catalog.mjs';
// Small authoritative layout patches. Render assets never cross the socket.
export const WORLD_FORMAT=1;
export const worldIdPattern=/^(prop:[a-z-]{3,40}|sup:sup-[0-2]|camp:(fire|gazebo|bench|fire-bench:[0-5])|utility:(toilet|woodshed)|tree:\d{1,5}|plant:(grass|fern|rock|log|flower|reed|stump|shrub):\d{1,5}|bar:[a-z0-9:-]{1,64}|added:[a-z0-9-]{8,64}|terrain:[a-z0-9-]{8,64})$/;
export function emptyWorld(){return{format:WORLD_FORMAT,revision:0,entries:{}};}
export function applyWorldPatch(state,patch){
 if(!patch||!worldIdPattern.test(patch.id||''))return{error:'Неизвестный объект'};
 if(patch.id.startsWith('prop:'))return{error:'Образец можно только добавить в мир'};
 const old=state.entries[patch.id],version=old?.version||0;
 if(patch.expected!==version)return{error:'Объект уже изменён. Повторите действие',conflict:true};
 if(!old&&Object.keys(state.entries).length>=5000)return{error:'Достигнут предел сохранённых объектов'};
 const entry={...old,id:patch.id,version:version+1};
 if(patch.id.startsWith('terrain:')){
  if(patch.deleted!==undefined&&typeof patch.deleted!=='boolean')return{error:'Некорректное удаление мазка'};
  if(!old||patch.points!==undefined){
   if(!['soil','grass','grass-add','grass-remove',...sculptModes].includes(patch.material)||!Array.isArray(patch.points)||!patch.points.length||patch.points.length>256||patch.points.some(p=>!Array.isArray(p)||p.length!==2||!p.every(Number.isFinite)||Math.abs(p[0])>190||p[1]<-160||p[1]>220))return{error:'Некорректный мазок почвы'};
   for(const [key,min,max]of [['radius',.3,12],['softness',.15,1],['strength',.1,1]])if(!Number.isFinite(patch[key])||patch[key]<min||patch[key]>max)return{error:'Некорректная кисть'};
   if(sculptModes.has(patch.material)&&(!Number.isFinite(patch.amount)||patch.amount<.05||patch.amount>1||!Number.isFinite(patch.level)||patch.level< -50||patch.level>60))return{error:'Некорректная высота кисти'};
   Object.assign(entry,{...(sculptModes.has(patch.material)?{amount:patch.amount,level:patch.level}:{}),material:patch.material,radius:patch.radius,softness:patch.softness,strength:patch.strength,points:patch.points.map(p=>p.map(v=>Math.round(v*1000)/1000))});
  }
  entry.order=old?.order??state.revision+1;entry.deleted=patch.deleted??old?.deleted??false;
  state.entries[entry.id]=entry;state.revision++;return{entry,revision:state.revision};
 }

 if(patch.id.startsWith('added:')){const source=old?.source||patch.source;if(!worldIdPattern.test(source||'')||source.startsWith('prop:')&&!propMeta(source)||(source.startsWith('added:')||source.startsWith('terrain:'))||source==='utility:toilet'||source.startsWith('sup:')||source==='bar:building')return{error:'Недоступный образец'};entry.source=source;}
 if(patch.deleted!==undefined){if(typeof patch.deleted!=='boolean')return{error:'Некорректное удаление'};entry.deleted=patch.deleted;}
 if(patch.x!==undefined||patch.z!==undefined||patch.yaw!==undefined){
  if(!Number.isFinite(patch.x)||!Number.isFinite(patch.z)||!Number.isFinite(patch.yaw)||Math.abs(patch.x)>190||patch.z< -160||patch.z>220)return{error:'Место за пределами доступной карты'};
  Object.assign(entry,{x:Math.round(patch.x*1000)/1000,z:Math.round(patch.z*1000)/1000,yaw:Math.atan2(Math.sin(patch.yaw),Math.cos(patch.yaw))});
 }
 for(const axis of ['sx','sy','sz'])if(patch[axis]!==undefined){if(!Number.isFinite(patch[axis])||patch[axis]<.1||patch[axis]>5)return{error:'Размер должен быть от 10 до 500%'};entry[axis]=Math.round(patch[axis]*10000)/10000;}
 for(const [field,min,max]of [['rx',-Math.PI/3,Math.PI/3],['rz',-Math.PI/3,Math.PI/3],['lift',-10,30],['span',.5,30],['startY',.1,15],['endY',.1,15],['sag',0,5],['brightness',0,3]])if(patch[field]!==undefined){if(!Number.isFinite(patch[field])||patch[field]<min||patch[field]>max)return{error:'Некорректные параметры объекта'};entry[field]=Math.round(patch[field]*10000)/10000;}
 for(const field of ['anchorCornerA','anchorCornerB'])if(patch[field]!==undefined){if(!Number.isInteger(patch[field])||patch[field]<0||patch[field]>3)return{error:'Некорректный угол крепления'};entry[field]=patch[field];}
 for(const field of ['innerColor','outerColor'])if(patch[field]!==undefined){if(typeof patch[field]!=='string'||!/^#[0-9a-f]{6}$/i.test(patch[field]))return{error:'Некорректный цвет'};entry[field]=patch[field].toLowerCase();}
 for(const field of ['anchorA','anchorB'])if(patch[field]!==undefined){const id=patch[field];if(typeof id!=='string'||id&&(!worldIdPattern.test(id)||id.startsWith('prop:')||id.startsWith('terrain:')||id===patch.id))return{error:'Некорректная точка крепления'};entry[field]=id;}
 if(entry.source&&!Number.isFinite(entry.x))return{error:'Укажите место для нового объекта'};
 state.entries[entry.id]=entry;state.revision++;return{entry,revision:state.revision};
}
export function restoreWorld(raw){const state=emptyWorld();if(raw?.format!==WORLD_FORMAT)return state;for(const e of Object.values(raw.entries||{}).sort((a,b)=>(a.order??0)-(b.order??0))){const p={...e,expected:0};const result=applyWorldPatch(state,p);if(!result.error){state.entries[e.id].version=Math.max(1,Math.min(1e9,Number(e.version)||1));if(e.id.startsWith('terrain:')&&Number.isSafeInteger(e.order)&&e.order>0)state.entries[e.id].order=e.order;}}state.revision=Math.max(state.revision,Number(raw.revision)||0);return state;}
