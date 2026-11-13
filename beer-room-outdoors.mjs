import * as THREE from './three.module.js';
import {buildLandscape} from './beer-room-landscape.mjs';
import {buildForest} from './beer-room-forest.mjs';
import {buildLake} from './beer-room-water.mjs';
import {buildCamp} from './beer-room-camp.mjs';
import {buildUndergrowth} from './beer-room-undergrowth.mjs';
import {buildCampUtilities} from './beer-room-utilities.mjs';
import {buildSupBoards} from './beer-room-sup.mjs';
export function buildOutdoors(scene,renderer,camera){
 const group=new THREE.Group();group.name='Kinosreda forest camp';scene.add(group);
 let lastNight=-1,lastProgress=-1;
 const landscape=buildLandscape(group),forest=buildForest(group),lake=buildLake(group,scene,renderer,camera),camp=buildCamp(group),utilities=buildCampUtilities(group),sup=buildSupBoards(group,landscape.ground),undergrowth=buildUndergrowth(group,forest.trees,landscape.paint);
 // Static environment capture is separate from players, beer, particles and
 // close grass. This layer is used only for the one-time water lighting bake.
 for(const root of [landscape.ground,landscape.horizon,landscape.sky,landscape.moon,landscape.sun,landscape.ambient,...forest.batches.map(b=>b.cell)])root.traverse(o=>{if(o.isMesh||o.isLight)o.layers.enable(3);});
 return{group,landscape,forest,lake,camp,utilities,sup,undergrowth,colliders:[...utilities.colliders,...forest.colliders,...camp.colliders,...undergrowth.colliders],surfaces:[...utilities.surfaces,...camp.surfaces,...sup.boards.map(b=>b.userData.surface)],
  setNight(n,progress=1){if(n===lastNight&&progress===lastProgress)return;lastNight=n;lastProgress=progress;landscape.setNight(n,progress);camp.setNight(n);lake.setNight(n);},
  update(dt,quality,bakeReady=true){landscape.update(dt);const ready=group.visible&&bakeReady&&forest.assetsReady&&landscape.assetsReady&&sup.assetsReady,willCapture=ready&&!lake.reflectionTarget;
   // A cube capture needs every direction. Restore full tree batches for
   // that one pass, then compact them for the player's camera again.
   forest.update(camera,quality,!willCapture);undergrowth.update(camera,quality);camp.update(dt);utilities.update(dt);lake.update(dt,quality,ready);if(willCapture)forest.update(camera,quality,true);}};
}
