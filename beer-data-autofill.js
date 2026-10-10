(() => {
  const cache = new Map();
  const pending = new Map();
  const normalize = (value) => String(value || '').trim().replace(/\s+/g, ' ');
  const apiBase = () => String(window.BEER_DATA_API_BASE ||
    (['localhost', '127.0.0.1'].includes(location.hostname)
      ? location.origin
      : 'https://realtime.xn--80ahcljthqi.xn--p1ai')).replace(/\/$/, '');

  function prepareFiltrationSelect(select) {
    if (!select || [...select.options].some((option) => option.value === '')) return;
    select.add(new Option('Не подтверждено', ''), select.options[0]);
    select.value = '';
  }
  function prepareUnknownSelect(select) {
    if (!select || [...select.options].some((option) => option.value === '')) return;
    const previous = select.value;
    select.add(new Option('Не подтверждено', ''), select.options[0]);
    select.value = previous;
  }

  function restoreSavedValue(control, value) {
    const saved = String(value ?? '');
    if (control.tagName === 'SELECT' && saved && ![...control.options].some(option => option.value === saved)) {
      const normalizeLabel = text => text.replace(/[\u{1F1E6}-\u{1F1FF}]/gu, '').trim().toLocaleLowerCase('ru');
      const matching = [...control.options].find(option => normalizeLabel(option.text) === normalizeLabel(saved));
      control.add(new Option(matching?.text || saved, saved));
    }
    control.value = saved;
    control.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function prepareCalories(control, estimated = false) {
    if (!control) return;
    control.readOnly = false;
    control.dataset.estimated = String(Boolean(estimated));
    if (control.__caloriesEditable) return;
    control.__caloriesEditable = true;
    control.addEventListener('input', () => { control.dataset.estimated = 'false'; });
  }

  function ensureStatus(input) {
    if (!input) return null;
    let node = input.closest('label')?.querySelector('.beer-autofill-status');
    if (node) return node;
    node = document.createElement('span');
    node.className = 'beer-autofill-status';
    node.setAttribute('aria-live', 'polite');
    if (input.closest('label')) input.closest('label').append(node);
    else input.insertAdjacentElement('afterend', node);
    if (!document.getElementById('beerAutofillStyle')) {
      const style = document.createElement('style');
      style.id = 'beerAutofillStyle';
      style.textContent = '.beer-autofill-status{display:block;min-height:0;margin-top:2px;color:rgba(255,224,151,.78);font-size:9px;line-height:1.25;text-transform:none;letter-spacing:0;opacity:0;transition:opacity .12s ease}.beer-autofill-status:not(:empty){opacity:1}.beer-autofill-status.is-ok{color:#b9e7c6}.beer-autofill-status.is-muted{color:rgba(255,255,255,.46)}';
      document.head.append(style);
    }
    return node;
  }

  function fetchData(query, signal) {
    const key = normalize(query).toLocaleLowerCase('ru');
    const cached = cache.get(key);
    if (cached && Date.now() - cached.at < (cached.data.found >= 6 ? 30 * 60_000 : 60_000)) return Promise.resolve(cached.data);
    if (pending.has(key)) return pending.get(key);
    const url = `${apiBase()}/beer-data-search?q=${encodeURIComponent(query)}`;
    const promise = fetch(url, { signal, cache: 'no-store', headers: { Accept: 'application/json' } })
      .then((response) => response.ok ? response.json() : null)
      .then((data) => { if (data?.ok) cache.set(key, { data, at: Date.now() }); return data; })
      .finally(() => pending.delete(key));
    pending.set(key, promise);
    return promise;
  }

  function bind(fields = {}) {
    const name = fields.name;
    if (!name) return;
    if (name.__beerAutofillBound) return name.__beerAutofillController;
    name.__beerAutofillBound = true;
    const caloriesLabel = fields.calories?.closest('label');
    if (caloriesLabel) {
      for (const node of caloriesLabel.childNodes) {
        if (node.nodeType === Node.TEXT_NODE && /Калории/.test(node.nodeValue || '')) {
          node.nodeValue = 'Калории ≈ ккал/100 мл';
          break;
        }
      }
    }
    const statusNode = fields.status || ensureStatus(name);
    const controls = ['type', 'style', 'filtered', 'country', 'alcohol', 'calories']
      .map((key) => [key, fields[key]])
      .filter(([, control]) => control);
    const initialValues = new Map(controls.map(([key, control]) => [key, String(control.value || '')]));
    const dirty = new Set();
    const automatic = new Map();
    let updating = false;
    let sequence = 0;
    let nameChanged = false;
    let lastLookupQuery = '';
    let timer = null;

    const setStatus = (message, state = '') => {
      if (!statusNode) return;
      statusNode.textContent = message || '';
      statusNode.className = `beer-autofill-status${state ? ` is-${state}` : ''}`;
    };
    const setValue = (key, value) => {
      const control = fields[key];
      if (!control || value == null || value === '') return false;
      const next = String(value);
      if (control.tagName === 'SELECT') {
        const option = [...control.options].find((item) => item.value === next || item.textContent.trim() === next || item.textContent.trim().endsWith(` ${next}`) || item.textContent.trim().includes(next));
        if (!option) return false;
        if (control.value === option.value) { automatic.set(key, control.value); return true; }
        control.value = option.value;
      } else {
        if (String(control.value) === next) { automatic.set(key, next); return true; }
        control.value = next;
      }
      automatic.set(key, String(control.value));
      updating = true;
      const event = new Event('change', { bubbles: true });
      event.beerAutomatic = true;
      control.dispatchEvent(event);
      updating = false;
      return true;
    };
    const clearValue = (key) => {
      const control = fields[key];
      if (!control) return;
      automatic.set(key, '');
      updating = true;
      control.value = '';
      const event = new Event('change', { bubbles: true });
      event.beerAutomatic = true;
      control.dispatchEvent(event);
      updating = false;
    };
    const calculateCalories = () => {
      if (!fields.calories) return;
      if (dirty.has('calories')) return;
      const calories = window.BeerFacts.estimateCaloriesPer100ml(fields.alcohol?.value);
      fields.calories.dataset.estimated = String(calories != null);
      fields.calories.title = calories == null
        ? 'Для безалкогольного пива нужны данные с этикетки'
        : 'Оценка по крепости: ABV × 8,45 ккал/100 мл. Углеводы и добавки могут изменить фактическое значение.';
      if (calories == null) clearValue('calories');
      else setValue('calories', calories);
    };
    const applyNamedFiltration = () => {
      if (dirty.has('filtered')) return;
      const value = window.BeerFacts.detectFiltration(name.value);
      if (value) setValue('filtered', value);
    };
    const resetAutomaticValues = () => {
      for (const [key, control] of controls) {
        if (dirty.has(key) || automatic.get(key) !== String(control.value)) continue;
        const initial = initialValues.get(key) || '';
        if (String(control.value) === initial) continue;
        updating = true;
        control.value = initial;
        const event = new Event('change', { bubbles: true });
        event.beerAutomatic = true;
        control.dispatchEvent(event);
        updating = false;
        automatic.delete(key);
      }
    };

    controls.forEach(([key, control]) => {
      control.addEventListener('change', (event) => {
        if (event.beerAutomatic) { automatic.set(key, String(control.value)); return; }
        if (updating) return;
        if (automatic.get(key) !== String(control.value)) dirty.add(key);
      });
    });
    fields.alcohol?.addEventListener('input', calculateCalories);
    fields.alcohol?.addEventListener('change', calculateCalories);
    prepareCalories(fields.calories);
    fields.calories?.addEventListener('input', () => { dirty.add('calories'); });
    calculateCalories();
    applyNamedFiltration();

    const apply = (data) => {
      const source = data?.fields || {};
      const localMatch = window.BeerStyleDetect?.detect(name.value, fields.style);
      let applied = 0;
      for (const key of ['type', 'style', 'filtered', 'country', 'alcohol']) {
        if (source[key] == null || dirty.has(key)) continue;
        if (localMatch && key === 'style') continue;
        if (setValue(key, source[key])) applied += 1;
      }
      applyNamedFiltration();
      calculateCalories();
      if (applied) setStatus(`Данные найдены в интернете · заполнено: ${applied}`, 'ok');
      else if (data?.matched) setStatus('Совпадение найдено, но подтверждённых данных мало', 'muted');
      else setStatus('Подтверждённые данные не найдены', 'muted');
    };

    const lookup = () => {
      const query = normalize(name.value);
      if (query.length < 3) {
        lastLookupQuery = '';
        setStatus('');
        return;
      }
      if (query === lastLookupQuery) return;
      lastLookupQuery = query;
      const current = ++sequence;
      setStatus('Ищем данные о конкретном пиве…');
      resetAutomaticValues();
      if (!dirty.has('filtered')) clearValue('filtered');
      if (!dirty.has('country') && (nameChanged || !initialValues.get('alcohol'))) clearValue('country');
      applyNamedFiltration();
      const localMatch = window.BeerStyleDetect?.detect(query, fields.style);
      if (localMatch) {
        if (!dirty.has('type')) setValue('type', localMatch.type);
        if (!dirty.has('style')) setValue('style', localMatch.style);
      } else {
        for (const key of ['type', 'style']) if (!dirty.has(key)) clearValue(key);
      }
      calculateCalories();
      fetchData(query).then((data) => {
        if (current !== sequence) return;
        if (!data?.ok) { setStatus('Поиск временно недоступен', 'muted'); return; }
        apply(data);
      }).catch((error) => {
        if (error?.name === 'AbortError' || current !== sequence) return;
        setStatus('Поиск временно недоступен', 'muted');
      });
    };

    name.addEventListener('input', () => {
      nameChanged = true;
      ++sequence;
      lastLookupQuery = '';
      if (!dirty.has('filtered')) clearValue('filtered');
      if (!dirty.has('country')) clearValue('country');
      if (!window.BeerStyleDetect?.detect(name.value, fields.style)) {
        for (const key of ['type', 'style']) if (!dirty.has(key)) clearValue(key);
      }
      applyNamedFiltration();
      clearTimeout(timer);
      timer = setTimeout(lookup, 420);
    });
    name.addEventListener('blur', () => {
      if (normalize(name.value).length >= 3) { clearTimeout(timer); lookup(); }
    });
    const controller = { reset({ lookupInitial = true } = {}) {
      clearTimeout(timer); ++sequence; lastLookupQuery = ''; nameChanged = false;
      dirty.clear(); automatic.clear(); initialValues.clear();
      controls.forEach(([key, control]) => initialValues.set(key, String(control.value || '')));
      setStatus('');
      if (lookupInitial && normalize(name.value).length >= 3) lookup();
    } };
    name.__beerAutofillController = controller;
    if (normalize(name.value).length >= 3) lookup();
    return controller;
  }

  window.BeerDataAutofill = { bind, fetchData, prepareFiltrationSelect, prepareUnknownSelect, restoreSavedValue, prepareCalories };
})();
