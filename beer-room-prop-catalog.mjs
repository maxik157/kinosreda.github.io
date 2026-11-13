// Stable catalogue identifiers shared by the server and the renderer.
export const propCatalog={
 'tent-dome':{label:'Палатка купольная',category:'camping',tent:true},
 'tent-ridge':{label:'Палатка двускатная',category:'camping',tent:true},
 'tent-vestibule':{label:'Палатка с тамбуром',category:'camping',tent:true},
 'tent-xdome':{label:'Палатка X-Dome 1+',category:'camping',tent:true,defaults:{outerColor:'#83978a',innerColor:'#c8c7ac'}},
 'young-pine':{label:'Молодая сосна',category:'trees',tree:true},
 'young-spruce':{label:'Молодая ель',category:'trees',tree:true},
 'young-birch':{label:'Молодая берёза',category:'trees',tree:true},
 'hammock':{label:'Подвесной гамак',category:'camping',suspended:true,defaults:{span:4.4,startY:1.65,endY:1.65,sag:.48}},
 'stump-wide':{label:'Пень со спилом',category:'nature'},
 'stump-broken':{label:'Убранный пень',category:'nature',retired:true},
 'water-reeds-sparse':{label:'Камыш · редкий',category:'water',water:true},
 'water-reeds-dense':{label:'Камыш · густой',category:'water',water:true},
 'water-lilies':{label:'Кувшинки',category:'water',water:true},
 'water-rush':{label:'Осока · плотная',category:'water',water:true},
 'firewood-round':{label:'Дрова · берёзовые поленья',category:'camping'},
 'firewood-split':{label:'Дрова · колотые',category:'camping'},
 'firewood-stack':{label:'Небольшая поленница',category:'camping'},
 'plate':{noCollision:true,label:'Эмалированная тарелка',category:'small',onSurface:true},
 'glass':{noCollision:true,label:'Гранёный стакан',category:'small',onSurface:true},
 'mug':{noCollision:true,label:'Походная кружка',category:'small',onSurface:true},
 'guitar':{label:'Акустическая гитара',category:'camping'},
 'garland':{label:'Гирлянда на двух подвесах',category:'lighting',garland:true},
 'lantern':{noCollision:true,label:'Походный фонарь',category:'lighting',onSurface:true,light:true},
 'lamp-post':{label:'Фонарь на стойке',category:'lighting',light:true},
 'folding-chair':{label:'Складное кресло',category:'furniture'},
 'brazier':{label:'Мангал с углями',category:'camping'},
 'grill-rack':{label:'Решётка для мангала с ручкой',category:'small',onSurface:true}
};
export const propSourcePattern=/^prop:[a-z-]+$/;
export function propMeta(source){return propCatalog[String(source||'').replace(/^prop:/,'')];}
