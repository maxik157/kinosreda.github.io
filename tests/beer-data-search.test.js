const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
const lookupCode = source.slice(source.indexOf('function decodeBeerSearchHtml'), source.indexOf('async function searchBeerDataOnline'));
const BeerFacts = require('../beer-facts');
const context = { URL, BeerFacts };
vm.createContext(context);
vm.runInContext(`${lookupCode}\nthis.extract = extractBeerWebData;`, context);

const result = (title, snippet, url = `https://example.com/beer/${title.toLowerCase().replace(/\s+/g, '-')}`) => ({ title, snippet, url });
const fields = (query, results) => context.extract(query, results).fields;

test('estimates per-100-ml calories from ABV without using bottle calories', () => {
  const beer = result('Spaten Dunkel 5,1% 0,5l', 'Spaten Dunkel has 5.1% ABV. The full 500ml bottle contains 225 kcal.');
  assert.equal(fields('Spaten Dunkel', [beer]).calories, 43);
  assert.equal(BeerFacts.estimateCaloriesPer100ml(5), 42);
  assert.equal(BeerFacts.estimateCaloriesPer100ml(8), 68);
  assert.equal(BeerFacts.estimateCaloriesPer100ml('5,5'), 46);
});

test('requires valid ABV and does not claim zero-calorie alcohol-free beer', () => {
  for (const value of ['', null, undefined, 0, -1, 'invalid', 101]) {
    assert.equal(BeerFacts.estimateCaloriesPer100ml(value), null);
  }
  assert.equal(fields('Sample Beer', [result('Sample Beer', '150 calories per bottle')]).calories, null);
});

test('separates regular and alcohol-free variants', () => {
  const results = [
    result('Heineken Original', '5% ABV. 42 kcal per 100ml'),
    result('Heineken 0.0', '0% ABV. 21 kcal per 100ml')
  ];
  assert.equal(fields('Heineken Original', results).calories, 42);
  assert.equal(fields('Heineken 0.0', results).calories, null);
});

test('keeps Delirium Red as Kriek despite an unrelated APA mention', () => {
  const beer = result('Delirium Red', 'Delirium Red has 8% ABV. Other APA style beer is also available.');
  assert.equal(fields('Delirium Red', [beer]).style, 'Kriek');
  assert.equal(fields('Delirium Red', [beer]).calories, 68);
  const styleCode = fs.readFileSync(path.join(__dirname, '..', 'beer-style-detect.js'), 'utf8');
  const styleContext = { window: {} };
  vm.runInNewContext(styleCode, styleContext);
  assert.equal(styleContext.window.BeerStyleDetect.detect('Delirium Red', { options: [{ value: 'Kriek' }, { value: 'APA' }] }).style, 'Kriek');
});

test('does not infer a style from another beer mentioned in the snippet', () => {
  const beer = result('Sample Beer', 'Sample Beer has 42 kcal per 100ml. Another APA style beer is popular.');
  assert.equal(fields('Sample Beer', [beer]).style, null);
});

test('does not infer the producing country from a retailer domain', () => {
  const retailer = result('Heineken Original', '42 kcal per 100ml', 'https://shop.example.de/heineken-original');
  assert.equal(fields('Heineken Original', [retailer]).country, null);
  const origin = result('Heineken Original', 'The Dutch brewery makes Heineken Original.');
  assert.equal(fields('Heineken Original', [retailer, origin]).country, 'Нидерланды');
});

test('uses named filtration markers without guessing from generic styles', () => {
  assert.equal(BeerFacts.detectFiltration('Allgauer Stolz Hefeweizen'), 'Нефильтрованное');
  assert.equal(BeerFacts.detectFiltration('Paulaner Kristallweizen'), 'Фильтрованное');
  assert.equal(BeerFacts.detectFiltration('Unfiltered Lager'), 'Нефильтрованное');
  assert.equal(BeerFacts.detectFiltration('This beer is not filtered'), 'Нефильтрованное');
  assert.equal(BeerFacts.detectFiltration('Фильтрованный сорт'), 'Фильтрованное');
  assert.equal(BeerFacts.detectFiltration('Нефильтрованный сорт'), 'Нефильтрованное');
  assert.equal(BeerFacts.detectFiltration('Hefeweißbier'), 'Нефильтрованное');
  assert.equal(BeerFacts.detectFiltration('Spaten Dunkel'), null);
  assert.equal(BeerFacts.detectFiltration('Lager'), null);
  assert.equal(BeerFacts.detectFiltration('Hefeweizen and filtered Kristallweizen'), null);
});

test('requires matching product evidence and rejects conflicting filtration', () => {
  const filtered = result('Sample Beer', 'Sample Beer is a filtered beer.');
  const unfiltered = result('Sample Beer', 'Sample Beer is an unfiltered beer.');
  const unrelated = result('Sample Beer', 'Sample Beer has 5% ABV. Other Beer is unfiltered.');
  assert.equal(fields('Sample Beer', [filtered]).filtered, 'Фильтрованное');
  assert.equal(fields('Sample Beer', [filtered, unrelated]).filtered, 'Фильтрованное');
  assert.equal(fields('Sample Beer', [filtered, unfiltered]).filtered, null);
  assert.equal(fields('Sample Beer', [unrelated]).filtered, null);
});

test('recognizes explicit country labels and ignores style geography', () => {
  assert.equal(fields('Sample Beer', [result('Sample Beer', 'Страна производства: Германия. Стиль: Pilsner. Фильтрация: фильтрованное.')]).country, 'Германия');
  assert.equal(fields('Sample Beer', [result('Sample Beer', 'Herkunft: Deutschland.')]).country, 'Германия');
  assert.equal(fields('Sample Beer', [result('Sample Beer', 'Sample Beer is a Belgian style beer.')]).country, null);
});

test('prefers a supported subtype over a generic lager description', () => {
  const data = fields('Sample Beer', [result('Sample Beer', 'Style: Lager.'), result('Sample Beer', 'Style: Helles.')]);
  assert.equal(data.style, 'Hell');
});
