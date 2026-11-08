// Regression checks use simulated media devices and API responses. They never
// request the physical camera or write records to Firebase.
document.querySelector('#run').onclick = async () => {
  const report = document.querySelector('#report'); report.textContent = '';
  const check = (condition, message) => { if (!condition) throw new Error(message); };
  const wait = async predicate => {
    for (let i = 0; i < 100; i++) { if (predicate()) return; await new Promise(resolve => setTimeout(resolve, 10)); }
    throw new Error('Переход сканера не завершился');
  };
  const get = selector => document.querySelector('.beer-scanner ' + selector);
  const originalFetch = window.fetch, originalMedia = navigator.mediaDevices.getUserMedia;
  const mediaDescriptors = Object.fromEntries(['srcObject', 'readyState', 'videoWidth', 'videoHeight', 'play'].map(key => [key, Object.getOwnPropertyDescriptor(HTMLVideoElement.prototype, key)]));
  const userAgentDescriptor = Object.getOwnPropertyDescriptor(navigator, 'userAgent');
  const desktopAgent = navigator.userAgent;
  const drawImage = CanvasRenderingContext2D.prototype.drawImage;
  let result, mediaCalls = 0, nativeCalls = 0, fileCalls = 0, denyCamera = false, added, returnFromForm;
  const records = [{key:'a',record:{id:'1',name:'Franziskaner Weissbier',ratings:{Макс:8}}}, {key:'b',record:{id:'2',name:'Franziskaner Weissbier Dunkel'}}];
  try {
    Object.defineProperties(HTMLVideoElement.prototype, {
      srcObject:{configurable:true,get(){return this.__stream},set(value){this.__stream=value}},
      readyState:{configurable:true,get:()=>4}, videoWidth:{configurable:true,get:()=>640},videoHeight:{configurable:true,get:()=>480},
      play:{configurable:true,value:async()=>{}}
    });
    CanvasRenderingContext2D.prototype.drawImage = function(source,...args) { if (!(source instanceof HTMLVideoElement)) drawImage.call(this,source,...args); };
    navigator.mediaDevices.getUserMedia = async () => {
      mediaCalls++;
      if (denyCamera) throw new DOMException('Denied', 'NotAllowedError');
      return {getTracks:()=>[{stop(){}}]};
    };
    window.fetch = async url => String(url).includes('/beer-recognize') ? {ok:true,json:async()=>result} : originalFetch(url);
    const open = async (mobile = false) => {
      Object.defineProperty(navigator,'userAgent',{configurable:true,value:mobile?'iPhone':desktopAgent});
      BeerScanner.open({getCatalog:()=>records,getUserName:()=> 'Макс',onAddRecord:(record,resume)=>{added=record;returnFromForm=resume}});
      get('[data-camera]').click = () => {nativeCalls++};
      get('[data-file]').click = () => {fileCalls++};
      await wait(()=>!get('[data-action=shoot]').disabled);
    };
    const close = () => get('.beer-scanner__close').click();
    const photo = document.createElement('canvas'); photo.width=100; photo.height=100;
    const blob = await new Promise(resolve=>photo.toBlob(resolve,'image/jpeg'));
    const upload = () => {
      const input=get('[data-camera]'), transfer=new DataTransfer();transfer.items.add(new File([blob],'label.jpg',{type:'image/jpeg'}));
      input.files=transfer.files;input.dispatchEvent(new Event('change'));
    };

    result={confident:true,matches:[{key:'a',name:records[0].record.name}]};
    await open(); get('[data-action=shoot]').click();await wait(()=>!get('.beer-scanner__card').hidden);
    for(let i=0;i<2;i++) {
      get('[data-action=retry]').click();await wait(()=>!get('[data-action=shoot]').disabled);
      check(!get('video').hidden && get('video').srcObject,'Повторное сканирование не открыло камеру');
      check(get('.beer-scanner__view img').hidden,'Остался старый снимок');
      get('[data-action=shoot]').click();await wait(()=>!get('.beer-scanner__card').hidden);
    }
    check(mediaCalls===3 && !fileCalls && !nativeCalls,'Камера была заменена выбором файла');close();
    report.textContent+='✓ Три последовательных сканирования открывают камеру\n';

    result={confident:false,matches:records.map(({key,record})=>({key,name:record.name})),ocrText:'NEW BREW\nSummer Wheat\n500 ml'};
    await open();get('[data-action=shoot]').click();await wait(()=>get('.beer-scanner__matches').children.length===2);
    check(!get('.beer-scanner__unknown').hidden,'Нет добавления рядом с похожими вариантами');
    get('[data-action=add]').click();check(added.name==='NEW BREW Summer Wheat','В форму передано название похожего пива вместо OCR');
    returnFromForm();check(!document.querySelector('.beer-scanner').hidden && get('.beer-scanner__matches').children.length===2,'Возврат не сохранил похожие варианты');close();
    report.textContent+='✓ Похожие варианты: добавление с названием с этикетки и возврат\n';

    denyCamera=true;await open(false);upload();await wait(()=>get('.beer-scanner__matches').children.length===2);
    get('[data-action=retry]').click();await wait(()=>!get('[data-action=shoot]').disabled);
    check(get('.beer-scanner__view img').hidden,'При отказе доступа показывается старое фото');
    get('[data-action=shoot]').click();await wait(()=>!get('[data-action=shoot]').disabled);
    check(!nativeCalls && !fileCalls,'На компьютере кнопка камеры открыла файловое окно');close();
    report.textContent+='✓ Отказ доступа на компьютере не подменяет камеру файлом\n';

    await open(true);get('[data-action=shoot]').click();check(nativeCalls===1,'Не открыта камера телефона');
    upload();await wait(()=>get('.beer-scanner__matches').children.length===2);
    get('[data-action=retry]').click();check(nativeCalls===2,'Повторный тап не открывает камеру телефона');
    check(get('.beer-scanner__view img').hidden && !get('.beer-scanner__view').hidden,'Снимок не сброшен при повторной съёмке');
    get('[data-action=shoot]').click();check(nativeCalls===3,'После отмены съёмки нельзя снова открыть камеру');close();
    report.textContent+='✓ Мобильная камера открывается повторно и после отмены\nВсе проверки пройдены.';
  } catch(error) {
    document.querySelector('.beer-scanner .beer-scanner__close')?.click();
    report.textContent+='ОШИБКА: '+error.stack;
  } finally {
    window.fetch=originalFetch;navigator.mediaDevices.getUserMedia=originalMedia;
    CanvasRenderingContext2D.prototype.drawImage=drawImage;
    Object.entries(mediaDescriptors).forEach(([key,descriptor])=>descriptor?Object.defineProperty(HTMLVideoElement.prototype,key,descriptor):delete HTMLVideoElement.prototype[key]);
    if(userAgentDescriptor)Object.defineProperty(navigator,'userAgent',userAgentDescriptor);else delete navigator.userAgent;
  }
};
