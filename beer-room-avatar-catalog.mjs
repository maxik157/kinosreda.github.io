export const AVATAR_MODELS = [
  {id:'classic',name:'В костюме',file:'./uploads_files_4440240_Action_suit_model_man.glb',height:1.84},
  {id:'casual',name:'В светлой куртке',file:'./assets/models/avatars/characters/casual-man.glb',height:1.82},
  {id:'bearded',name:'Лысый с чёрной бородой',file:'./assets/models/avatars/characters/casual-man.glb',height:1.86},
  {id:'woman',name:'В кожаной куртке',file:'./assets/models/avatars/characters/woman.glb',height:1.73}
];
export const avatarModel = id => AVATAR_MODELS.find(model=>model.id===id)||AVATAR_MODELS[0];
export function readAvatarPrefs(){
  let prefs={};try{prefs=JSON.parse(localStorage.getItem('kinosreda-beer-avatar')||'{}');}catch{}
  return {...prefs,model:avatarModel(prefs.model).id};
}
