(() => {
  const aliases = [
    ['Kriek', ['delirium red', 'kriek', 'крик']],
    ['Dunkelweizen', ['hefeweizen dunkel', 'dunkel hefeweizen', 'weizen dunkel', 'dunkel weizen', 'weissbier dunkel', 'dunkel weissbier', 'dunkles weissbier', 'темное пшеничное']],
    ['Weizen', ['hefeweizen', 'hefe weizen', 'hefeweissbier', 'hefe weissbier', 'weissbier', 'weiss beer', 'weizenbier', 'wheat beer', 'пшеничное', 'пшеничное пиво', 'вайцен', 'вайзен', 'вайсбир', 'вайс']],
    ['Pilsner', ['pilsener', 'pils', 'пилснер', 'пильзнер', 'пилс']],
    ['Lager', ['лагер', 'лагерное']],
    ['Hell', ['helles', 'helles lager', 'hell lager', 'lager hell', 'хелль', 'хеллес', 'хелл']],
    ['Dunkel', ['dunkles', 'дункель']],
    ['NEIPA', ['new england ipa', 'hazy ipa', 'нью ингланд ипа']],
    ['Double IPA', ['dipa', 'imperial ipa', 'double india pale ale']],
    ['Session IPA', ['session india pale ale']],
    ['IPA', ['india pale ale', 'ипа']],
    ['APA', ['american pale ale', 'апа']],
    ['Pale Ale', ['пейл эль']],
    ['Stout', ['стаут']],
    ['Porter', ['портер']],
    ['Ale', ['эль']],
    ['Bock', ['бок']],
    ['Marzen', ['мерцен', 'мэрцен']],
    ['Kellerbier', ['keller', 'келлербир']],
    ['Witbier', ['витбир']],
    ['Kölsch', ['кельш']],
    ['Schwarzbier', ['шварцбир']],
    ['Altbier', ['альтбир']],
    ['Saison', ['сезон', 'сэзон']],
    ['Gose', ['гозе']],
    ['Cider', ['сидр']],
    ['Radler', ['радлер']]
  ];
  const darkStyles = new Set(['Dunkel', 'Dunkelweizen', 'Stout', 'Imperial Stout', 'Milk Stout', 'Porter', 'Baltic Porter', 'Schwarzbier', 'Brown Ale', 'Bock', 'Doppelbock', 'Dubbel', 'Altbier', 'Rauchbier', 'Barleywine']);
  const darkWords = ['dark', 'black', 'schwarz', 'dunkel', 'темное', 'темный', 'темная', 'черное', 'черный'];
  const lightWords = ['light', 'blond', 'blonde', 'hell', 'helles', 'светлое', 'светлый', 'светлая', 'белое', 'белый'];

  function normalize(value) {
    return String(value || '').normalize('NFKD').toLocaleLowerCase('ru')
      .replace(/ß/g, 'ss').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' ');
  }

  function contains(text, phrase) {
    return (' ' + text + ' ').includes(' ' + normalize(phrase) + ' ');
  }

  function detect(name, styleSelect) {
    const text = normalize(name);
    if (!text) return null;
    const available = new Set([...styleSelect.options].map(option => option.value));
    let best = null;
    const consider = (style, phrase, priority) => {
      if (!available.has(style) || !contains(text, phrase)) return;
      const length = normalize(phrase).length;
      if (!best || length > best.length || (length === best.length && priority > best.priority)) {
        best = { style, length, priority };
      }
    };
    aliases.forEach(([style, phrases]) => phrases.forEach(phrase => consider(style, phrase, 1)));
    available.forEach(style => consider(style, style, 0));
    if (!best) return null;
    let type = darkStyles.has(best.style) ? 'Тёмное' : 'Светлое';
    if (darkWords.some(word => contains(text, word))) type = 'Тёмное';
    if (lightWords.some(word => contains(text, word))) type = 'Светлое';
    return { style: best.style, type };
  }

  function bind(nameInput, typeSelect, styleSelect) {
    let lastMatch = null, manualValues = null, manualOverride = false, updating = false;
    const setValue = (select, value) => {
      if (select.value === value) return;
      select.value = value;
      const event = new Event('change', { bubbles: true });
      event.beerAutomatic = true;
      select.dispatchEvent(event);
    };
    const rememberManual = (event) => {
      if (updating || event.beerAutomatic || !manualValues) return;
      manualValues = { type: typeSelect.value, style: styleSelect.value };
      manualOverride = true;
    };
    typeSelect.addEventListener('change', rememberManual);
    styleSelect.addEventListener('change', rememberManual);
    nameInput.addEventListener('input', () => {
      const match = detect(nameInput.value, styleSelect);
      const key = match ? match.style + '|' + match.type : null;
      if (key === lastMatch) return;
      if (!match) {
        if (manualValues && !manualOverride) {
          updating = true;
          setValue(typeSelect, manualValues.type);
          setValue(styleSelect, manualValues.style);
          updating = false;
        }
        manualValues = null;
        manualOverride = false;
        lastMatch = null;
        return;
      }
      if (!manualValues) manualValues = { type: typeSelect.value, style: styleSelect.value };
      updating = true;
      setValue(typeSelect, match.type);
      setValue(styleSelect, match.style);
      updating = false;
      manualOverride = false;
      lastMatch = key;
    });
  }

  window.BeerStyleDetect = { detect, bind };
})();
