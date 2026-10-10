(() => {
  const CAMERA_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h4l2-3h4l2 3h4v13H4z"/><circle cx="12" cy="13" r="4"/></svg>';
  const apiBase = () => String(window.BEER_RECOGNITION_API_BASE ||
    (['localhost', '127.0.0.1'].includes(location.hostname) ? location.origin : 'https://realtime.xn--80ahcljthqi.xn--p1ai')).replace(/\/$/, '');
  const value = v => v === undefined || v === null || v === '' ? 'Не указано' : String(v);
  const guessedName = text => String(text || '').split(/\n+/).map(line => line.trim())
    .filter(line => /[a-zа-яё]{3}/i.test(line) && !/(?:\b(?:ml|cl|vol|alc|ingredients|brewed|since|www|http|recycl|deposit|bottle|imported|produced|barcode)\b|состав|изготов|годен|производител|объем|объём)/i.test(line))
    .slice(0, 3).join(' ').replace(/\s+/g, ' ').slice(0, 120);
  const safeImage = url => /^(?:https?:\/\/|data:image\/(?:png|jpeg|webp);base64,)/i.test(String(url || '')) ? url : '';
  const ratingEntries = record => {
    const entries = Object.entries(record.ratings || {})
    .map(([name, rating]) => [name, Number(String(rating).replace(',', '.'))])
    .filter(([, rating]) => Number.isFinite(rating) && rating > 0 && rating <= 10);
    const legacy = Number(String(record.rating ?? '').replace(',', '.'));
    if (!entries.length && Number.isFinite(legacy) && legacy > 0 && legacy <= 10 && record.author) entries.push([String(record.author), legacy]);
    return entries;
  };
  let current = null;

  function bind(button, options) {
    if (!button || button.dataset.scannerBound) return;
    button.dataset.scannerBound = '1';
    button.classList.add('beer-scan-launch');
    button.innerHTML = `${CAMERA_ICON}<span>Сканировать</span>`;
    button.setAttribute('aria-label', 'Распознать пиво по этикетке');
    button.addEventListener('click', () => open(options, button));
    const warm = () => fetch(`${apiBase()}/beer-recognize/status`, { signal: AbortSignal.timeout(10_000) }).catch(() => {});
    button.addEventListener('pointerenter', warm, { once: true });
    button.addEventListener('focus', warm, { once: true });
    // Warm the existing reference index while the rating is being viewed.
    if ('IntersectionObserver' in window) {
      const observer = new IntersectionObserver(entries => {
        if (entries.some(entry => entry.isIntersecting)) { observer.disconnect(); warm(); }
      });
      observer.observe(button);
    }
  }

  function open(options, opener) {
    current?.close();
    const host = document.createElement('div');
    host.className = 'beer-scanner';
    host.innerHTML = `<section class="beer-scanner__panel" role="dialog" aria-modal="true" aria-labelledby="beerScannerTitle">
      <div class="beer-scanner__head"><h2 id="beerScannerTitle">Сканировать пиво</h2><button class="beer-scanner__close" type="button" aria-label="Закрыть">×</button></div>
      <div class="beer-scanner__scan">
      <p>Наведите камеру на этикетку. Название и рисунок должны быть видны целиком, без бликов.</p>
      <div class="beer-scanner__view"><video autoplay muted playsinline aria-label="Камера для этикетки"></video><img hidden alt="Снимок этикетки"><div class="beer-scanner__guide"></div></div>
      <div class="beer-scanner__actions"><button class="beer-scanner__primary" data-action="shoot" type="button" disabled>Сфотографировать</button><button data-action="file" type="button">Выбрать фото</button></div>
      <div class="beer-scanner__status" role="status" aria-live="polite"></div>
      <div class="beer-scanner__matches"></div><article class="beer-scanner__card" hidden></article>
      <div class="beer-scanner__unknown" hidden><p data-add-title>Этого пива пока нет в рейтинге</p><p data-ocr-name></p><button data-action="add" type="button">＋ Добавить пиво</button></div>
      <button class="beer-scanner__retry" data-action="retry" type="button" hidden>Сканировать ещё</button></div>
      <article class="beer-scanner__info" hidden></article>
      <input data-file type="file" accept="image/*" hidden><input data-camera type="file" accept="image/*" capture="environment" hidden>
    </section>`;
    document.body.append(host);
    const find = selector => host.querySelector(selector);
    const video = find('video'), preview = find('.beer-scanner__view img'), guide = find('.beer-scanner__guide');
    const shoot = find('[data-action=shoot]'), file = find('[data-file]'), nativeCamera = find('[data-camera]');
    const fileButton = find('[data-action=file]');
    const status = find('.beer-scanner__status'), results = find('.beer-scanner__matches'), card = find('article'), unknown = find('.beer-scanner__unknown');
    const scan = find('.beer-scanner__scan'), info = find('.beer-scanner__info'), title = find('h2');
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    let stream = null, closed = false, busy = false, photoUrl = null, request = null, sequence = 0, cameraSequence = 0;
    let selected = null, showingInfo = false, editing = false;
    let recognizedName = '';
    let cameraFallback = false;
    const nativeCaptureAvailable = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const panel = find('.beer-scanner__panel');
    const reveal = () => { panel.scrollTop = 0; };
    function openForm(action) {
      editing = true; host.hidden = true; document.removeEventListener('keydown', onKey, true);
      let resumed = false;
      const resume = () => {
        if (closed || resumed) return; resumed = true; editing = false; host.hidden = false;
        document.addEventListener('keydown', onKey, true);
        if (selected) backToScanner(); else { showingInfo = false; info.hidden = true; scan.hidden = false; reveal(); find('[data-action=add]')?.focus(); }
      };
      try { action(resume); } catch (_) { resume(); message('Не удалось открыть форму.'); }
    }
    const catalog = () => options.getCatalog().filter(item => item.record?.name);
    const message = (text, loading = false) => { status.textContent = text; status.setAttribute('aria-busy', String(loading)); };
    const stopCamera = () => { stream?.getTracks().forEach(track => track.stop()); stream = null; video.srcObject = null; };
    function close() {
      closed = true;
      sequence++; cameraSequence++;
      request?.abort(); stopCamera();
      if (photoUrl) URL.revokeObjectURL(photoUrl);
      host.remove(); document.removeEventListener('keydown', onKey, true);
      document.body.style.overflow = previousOverflow;
      if (current?.host === host) current = null;
      opener?.focus();
    }
    current = { close, host, refresh: () => { if (!closed && selected && !editing) showCard(selected, showingInfo); } };
    function onKey(event) {
      if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); if (showingInfo) backToScanner(); else close(); }
      if (event.key !== 'Tab') return;
      const controls = [...host.querySelectorAll('button,input,summary')].filter(el => !el.disabled && el.getClientRects().length);
      const first = controls[0], last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
    document.addEventListener('keydown', onKey, true);
    find('.beer-scanner__close').onclick = () => showingInfo ? backToScanner() : close();
    host.addEventListener('pointerdown', event => { if (event.target === host) { if (showingInfo) backToScanner(); else close(); } });
    find('.beer-scanner__close').focus();

    function latestItem(item) {
      return catalog().find(entry => item.record?.id && String(entry.record.id) === String(item.record.id)) ||
        catalog().find(entry => entry.key === item.key);
    }
    function backToScanner() {
      showingInfo = false; info.hidden = true; scan.hidden = false;
      host.classList.remove('is-info'); title.textContent = 'Сканировать пиво';
      find('.beer-scanner__close').setAttribute('aria-label', 'Закрыть');
      if (selected) showCard(selected);
      find('[data-action=details]')?.focus();
    }
    function showCard(item, full = false) {
      const latest = latestItem(item), record = latest?.record;
      if (!record) { message('Это пиво уже удалено из рейтинга. Попробуйте ещё раз.'); return; }
      selected = latest;
      host.classList.add('has-result'); unknown.hidden = true; results.hidden = true;
      find('[data-action=retry]').hidden = false;
      reveal();
      stopCamera();
      video.hidden = true; preview.hidden = true; guide.hidden = true;
      find('.beer-scanner__view').hidden = true;
      card.hidden = false; card.replaceChildren();
      const imageUrl = safeImage(record.imageUrl);
      if (imageUrl) { const image = document.createElement('img'); image.src = imageUrl; image.alt = record.name; card.append(image); }
      const name = document.createElement('h3'); name.textContent = record.name; card.append(name);
      const ratings = ratingEntries(record);
      const average = ratings.length ? (ratings.reduce((total, [, r]) => total + r, 0) / ratings.length).toFixed(1) : null;
      const userName = options.getUserName?.() || (() => { try { const user = JSON.parse(localStorage.getItem('currentUser') || '{}'); return user.name || user.username || ''; } catch (_) { return ''; } })();
      const personal = ratings.find(([name]) => name === userName)?.[1];
      const rating = document.createElement('p'); rating.className = 'beer-scanner__rating';
      rating.textContent = average ? `★ ${average} / 10` : 'Пока без оценок'; card.append(rating);
      if (average) { const count = document.createElement('span'); count.className = 'beer-scanner__rating-count'; count.textContent = `Оценок: ${ratings.length}`; rating.append(count); }
      if (personal !== undefined) { const mine = document.createElement('p'); mine.className = 'beer-scanner__personal'; mine.textContent = `Ваша оценка: ★ ${personal.toFixed(1)} / 10`; card.append(mine); }
      const subtitle = document.createElement('p'); subtitle.textContent = [record.style, record.country, record.alcohol !== undefined && record.alcohol !== '' ? `${record.alcohol}%` : null].filter(Boolean).join(' · '); card.append(subtitle);
      const detailsButton = document.createElement('button'); detailsButton.type = 'button'; detailsButton.dataset.action = 'details';
      detailsButton.textContent = 'Подробнее о пиве'; detailsButton.onclick = () => { showCard(selected, true); find('[data-action=back]')?.focus(); };
      card.append(detailsButton);
      if (!full) return;

      showingInfo = true; scan.hidden = true; info.hidden = false; info.replaceChildren();
      host.classList.add('is-info'); title.textContent = 'О пиве';
      find('.beer-scanner__close').setAttribute('aria-label', 'Вернуться к сканированию');
      const heading = document.createElement('h3'); heading.textContent = record.name; info.append(heading);
      const stats = document.createElement('div'); stats.className = 'beer-scanner__stats';
      const artwork = document.createElement('div'); artwork.className = 'beer-scanner__artwork';
      if (imageUrl) { const image = document.createElement('img'); image.src = imageUrl; image.alt = record.name; artwork.append(image); }
      else artwork.textContent = '🍺';
      stats.append(artwork);
      const fields = [['Крепость', record.alcohol !== undefined && record.alcohol !== '' ? `${record.alcohol}%` : null],
        ['Калории / 100 мл', record.calories !== undefined && record.calories !== '' ? `${record.caloriesEstimated ? '≈ ' : ''}${record.calories} ккал` : null],
        ['Вид', record.type], ['Стиль', record.style], ['Фильтрация', record.filtered],
        ['Объём', record.volume ? `${record.volume} л` : null], ['Страна', record.country], ['Рейтинг', average ? `★ ${average} / 10` : 'Без оценок']];
      fields.forEach(([label, content], index) => {
        const node = document.createElement('div'), number = document.createElement('b'), caption = document.createElement('span');
        node.className = `beer-scanner__stat ${index < 4 ? 'is-left' : 'is-right'}`;
        node.style.gridRow = String(index % 4 + 1); node.style.gridColumn = index < 4 ? '1' : '3';
        if (label === 'Фильтрация') node.classList.add('is-filtration');
        number.textContent = value(content); caption.textContent = label; node.append(number, caption); stats.append(node);
      });
      info.append(stats);
      if (personal !== undefined) { const mine = document.createElement('p'); mine.className = 'beer-scanner__personal'; mine.textContent = `Ваша оценка: ★ ${personal.toFixed(1)} / 10`; info.append(mine); }
      const metadata = [['Добавил', record.author]];
      if (record.timestamp && Number.isFinite(Number(record.timestamp))) metadata.push(['Добавлено', new Date(Number(record.timestamp)).toLocaleDateString('ru-RU')]);
      if (record.description) metadata.push(['Описание', record.description]);
      const details = document.createElement('dl');
      const row = (label, content, target = details) => {
        const div = document.createElement('div'), dt = document.createElement('dt'), dd = document.createElement('dd');
        dt.textContent = label; dd.textContent = value(content); div.append(dt, dd); target.append(div);
      };
      metadata.forEach(([label, content]) => row(label, content)); info.append(details);
      if (ratings.length) {
        const list = document.createElement('dl'); list.className = 'beer-scanner__ratings';
        const label = document.createElement('h4'); label.textContent = `Оценки (${ratings.length})`; info.append(label);
        ratings.forEach(([name, rating]) => row(name === userName ? `${name} (вы)` : name, `★ ${rating.toFixed(1)} / 10`, list)); info.append(list);
      }
      const actions = document.createElement('div'); actions.className = 'beer-scanner__actions beer-scanner__info-actions';
      const back = document.createElement('button'); back.type = 'button'; back.dataset.action = 'back'; back.textContent = '← Сканер'; back.setAttribute('aria-label', 'Вернуться к сканированию'); back.onclick = backToScanner; actions.append(back);
      if (options.onEditRecord) {
        const edit = document.createElement('button'); edit.type = 'button'; edit.textContent = 'Редактировать'; edit.dataset.action = 'edit';
        edit.onclick = () => openForm(resume => options.onEditRecord(latestItem(selected) || selected, resume));
        actions.append(edit);
      }
      info.append(actions);
    }

    function showAddOption(hasMatches = false) {
      if (!options.onAddRecord) return;
      find('[data-add-title]').textContent = hasMatches ? 'Вашего пива нет среди вариантов?' : 'Этого пива пока нет в рейтинге';
      find('[data-ocr-name]').textContent = recognizedName ? `С этикетки: ${recognizedName}` : 'Название не удалось прочитать — укажите его в форме.';
      find('[data-action=add]').textContent = hasMatches ? '＋ Добавить другое пиво' : '＋ Добавить пиво';
      unknown.hidden = false;
    }
    function showMatches(items) {
      results.replaceChildren(); results.hidden = false; host.classList.add('has-matches');
      find('[data-action=retry]').hidden = false;
      find('.beer-scanner__view').hidden = true; reveal();
      items.forEach(item => {
        const button = document.createElement('button'), label = document.createElement('span');
        button.className = 'beer-scanner__match'; button.type = 'button';
        const url = safeImage(item.record.imageUrl);
        if (url) { const image = document.createElement('img'); image.src = url; image.alt = ''; image.loading = 'lazy'; button.append(image); }
        label.textContent = item.record.name; button.append(label); button.onclick = () => { message('Пиво из нашего рейтинга'); showCard(item); }; results.append(button);
      });
      showAddOption(true);
    }
    find('[data-action=add]').onclick = () => {
      if (options.onAddRecord) openForm(resume => options.onAddRecord({ name: recognizedName }, resume));
    };
    find('[data-action=retry]').onclick = openCamera;

    async function prepare(source) {
      const canvas = document.createElement('canvas');
      let image = source, url;
      if (source instanceof Blob) {
        url = URL.createObjectURL(source); image = new Image();
        try { image.src = url; await image.decode(); }
        catch (_) { throw new Error('invalid_image'); }
        finally { URL.revokeObjectURL(url); }
      }
      const width = image.videoWidth || image.naturalWidth, height = image.videoHeight || image.naturalHeight;
      if (!width || !height) throw new Error('invalid_image');
      // iOS Safari is noticeably more reliable with a smaller, eagerly
      // decoded JPEG. The recognition service resizes again, so keeping the
      // upload below ~1 MB saves a mobile radio round trip without reducing
      // useful label detail.
      const scale = Math.min(1, 1000 / Math.max(width, height));
      canvas.width = Math.round(width * scale); canvas.height = Math.round(height * scale);
      canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
      return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('invalid_image')), 'image/jpeg', .82));
    }
    async function requestRecognition(blob, signal) {
      const maxAttempts = 3;
      let lastError;
      for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
        if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
        try {
          const response = await fetch(`${apiBase()}/beer-recognize`, {
            method: 'POST', headers: { 'Content-Type': 'image/jpeg', Accept: 'application/json' },
            body: blob, signal
          });
          const text = await response.text();
          let data = null;
          try { data = text ? JSON.parse(text) : null; } catch (_) {}
          if (response.ok && data) return data;
          const code = String(data?.error || '').toLowerCase();
          const retryable = [429, 502, 503, 504].includes(response.status) ||
            code === 'recognition_busy' || code === 'catalog_warming' || code === 'recognition_unavailable';
          lastError = new Error(code || `recognition_http_${response.status || 0}`);
          lastError.retryable = retryable;
          if (!retryable || attempt === maxAttempts - 1) throw lastError;
        } catch (error) {
          if (error?.name === 'AbortError') throw error;
          lastError = error;
          if (error.retryable === false || attempt === maxAttempts - 1) throw error;
        }
        await new Promise((resolve, reject) => {
          const abort = () => { clearTimeout(timer); reject(new DOMException('Aborted', 'AbortError')); };
          const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, 500 * (attempt + 1));
          signal.addEventListener('abort', abort, { once: true });
        });
      }
      throw lastError || new Error('recognition_unavailable');
    }
    async function recognize(source) {
      if (busy) return;
      const token = ++sequence; busy = true; shoot.disabled = true; fileButton.disabled = true;
      results.replaceChildren(); card.hidden = true; unknown.hidden = true;
      host.classList.remove('has-result', 'has-matches'); recognizedName = '';
      find('.beer-scanner__view').hidden = false;
      selected = null;
      message('Ищем пиво по этикетке…', true);
      request?.abort(); request = new AbortController();
      const controller = request;
      const timer = setTimeout(() => controller.abort(), 40_000);
      try {
        const blob = await prepare(source);
        if (closed || token !== sequence) return;
        stopCamera(); video.hidden = true; guide.hidden = true; preview.hidden = false;
        if (photoUrl) URL.revokeObjectURL(photoUrl);
        photoUrl = URL.createObjectURL(blob); preview.src = photoUrl;
        const data = await requestRecognition(blob, controller.signal);
        if (closed || token !== sequence) return;
        recognizedName = guessedName(data.ocrText);
        const entries = catalog();
        const matches = (data.matches || []).map(match => {
          const exact = entries.find(item => item.key === String(match.key) && item.record.name === match.name) ||
            entries.find(item => match.recordId && String(item.record.id) === match.recordId);
          const sameName = entries.filter(item => item.record.name === match.name);
          return exact || (sameName.length === 1 ? sameName[0] : null);
        }).filter(Boolean);
        if (data.confident && matches.length) { message('Пиво найдено'); showCard(matches[0]); }
        else if (matches.length) { message('Нашли похожие этикетки. Выберите ваше пиво.'); showMatches(matches); }
        else {
          message(data.indexing ? 'База фотографий ещё готовится. Попробуйте чуть позже.' : 'Совпадений в рейтинге нет. Можно добавить новое пиво.');
          if (!data.indexing && options.onAddRecord) {
            showAddOption(); host.classList.add('has-matches'); find('.beer-scanner__view').hidden = true; reveal();
            find('[data-action=retry]').hidden = false;
          }
        }
      } catch (error) {
        if (closed || token !== sequence) return;
        message(error.name === 'AbortError' ? 'Распознавание заняло слишком много времени. Проверьте интернет и попробуйте ещё раз.' :
          error.message === 'catalog_warming' ? 'База фотографий готовится. Попробуйте чуть позже.' :
          error.message === 'invalid_image' ? 'Не удалось прочитать фото. Выберите другое изображение.' :
          error.message === 'recognition_busy' ? 'Сейчас много снимков. Попробуйте ещё раз.' : 'Распознавание сейчас недоступно. Попробуйте ещё раз.');
      } finally {
        clearTimeout(timer);
        if (!closed && token === sequence) { busy = false; shoot.disabled = false; fileButton.disabled = false; shoot.textContent = 'Ещё снимок'; status.setAttribute('aria-busy', 'false'); }
      }
    }
    function resetCameraView() {
      card.hidden = true; results.replaceChildren(); results.hidden = true;
      unknown.hidden = true; host.classList.remove('has-result', 'has-matches');
      find('[data-action=retry]').hidden = true; find('.beer-scanner__view').hidden = false;
      selected = null; recognizedName = ''; showingInfo = false;
      host.classList.remove('is-info'); info.hidden = true; scan.hidden = false;
      title.textContent = 'Сканировать пиво';
      preview.hidden = true; preview.removeAttribute('src'); video.hidden = true; guide.hidden = true;
      if (photoUrl) { URL.revokeObjectURL(photoUrl); photoUrl = null; }
      reveal();
    }
    function openCamera() {
      if (busy) return;
      // Native mobile capture must open during the tap, not after an async
      // permission failure, when the browser has already lost user activation.
      if (cameraFallback && nativeCaptureAvailable) {
        ++cameraSequence; stopCamera(); resetCameraView();
        shoot.disabled = false; shoot.textContent = 'Открыть камеру';
        message('Сфотографируйте этикетку камерой телефона.');
        nativeCamera.click();
      } else startCamera();
    }
    async function startCamera() {
      if (busy) return;
      const token = ++cameraSequence;
      stopCamera(); resetCameraView();
      shoot.disabled = true; message('Открываем камеру…', true);
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('camera_unavailable');
        const next = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 960 } }, audio: false });
        if (closed || token !== cameraSequence) { next.getTracks().forEach(track => track.stop()); return; }
        stopCamera(); stream = next; video.srcObject = next;
        video.hidden = false; preview.hidden = true; guide.hidden = false; find('.beer-scanner__view').hidden = false;
        await video.play();
        if (closed || token !== cameraSequence) return;
        cameraFallback = false;
        shoot.disabled = false; shoot.textContent = 'Сфотографировать'; message('Этикетка целиком в кадре — можно снимать');
      } catch (error) {
        if (closed || token !== cameraSequence) return;
        cameraFallback = true;
        stopCamera(); video.hidden = true; guide.hidden = true;
        shoot.disabled = false; shoot.textContent = 'Открыть камеру';
        message(nativeCaptureAvailable ? 'Откройте камеру телефона или выберите готовое фото.' :
          error.name === 'NotAllowedError' ? 'Разрешите доступ к камере в браузере и нажмите «Открыть камеру».' :
          'Камера недоступна. Подключите её и нажмите «Открыть камеру» или выберите готовое фото.');
      }
    }
    shoot.onclick = () => {
      if (busy) return;
      if (stream && video.readyState >= 2) recognize(video);
      else openCamera();
    };
    find('[data-action=file]').onclick = () => file.click();
    [file, nativeCamera].forEach(input => { input.onchange = () => {
      const photo = input.files?.[0]; input.value = '';
      if (!photo) return;
      cameraSequence++; stopCamera();
      if (photo.size > 25 * 1024 * 1024) { message('Фото слишком большое. Выберите файл до 25 МБ.'); return; }
      recognize(photo);
    }; });
    startCamera();
  }
  window.BeerScanner = { bind, open, refresh: () => current?.refresh() };
})();
