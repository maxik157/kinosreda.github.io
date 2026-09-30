(function (root) {
  function estimateCaloriesPer100ml(value) {
    const text = String(value ?? '').trim().replace(',', '.');
    const abv = Number(text);
    if (!text || !Number.isFinite(abv) || abv <= 0 || abv > 100) return null;
    // Homebrew Academy: kcal = ABV (%) * 2.5 * US fluid ounces.
    return Math.round(abv * 2.5 * (100 / 29.5735295625));
  }

  function detectFiltration(value) {
    const text = String(value || '').normalize('NFKD').toLowerCase()
      .replace(/ß/g, 'ss').replace(/[\u0300-\u036f]/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
    const unfiltered = /(?:^| )(?:unfiltered|unfiltriert(?:es|e|er)?|ungefiltert|naturtrub(?:es|e)?|нефильтрован(?:ное|ныи|ная)?|hefeweizen|hefeweissbier|hefe weissbier|hefe weizen|mit hefe|kellerbier|zwickel(?:bier)?)(?: |$)/.test(text) || /(?:not filtered|не фильтрован)/.test(text);
    const positiveText = text.replace(/(?:not filtered|не фильтрован(?:ное|ныи|ная)?)/g, '');
    const filtered = /(?:^| )(?:filtered|filtriert(?:es|e|er)?|gefiltert|фильтрован(?:ное|ныи|ная)?|kristall(?:klar|weizen|weissbier)?|krystal)(?: |$)/.test(positiveText);
    if (filtered && unfiltered) return null;
    return filtered ? 'Фильтрованное' : unfiltered ? 'Нефильтрованное' : null;
  }

  const facts = { estimateCaloriesPer100ml, detectFiltration };
  if (typeof module === 'object' && module.exports) module.exports = facts;
  else root.BeerFacts = facts;
})(typeof globalThis === 'object' ? globalThis : this);
