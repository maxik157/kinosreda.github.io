const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '..', 'beer-data-autofill.js'), 'utf8');

async function requestURL(location, override) {
  let requested;
  const context = {window: {BEER_DATA_API_BASE: override}, location,
    fetch: async url => {requested = url; return {ok: true, json: async () => ({ok: true, found: 1})};}};
  vm.runInNewContext(source, context);
  await context.window.BeerDataAutofill.fetchData('Franziskaner Weissbier');
  return requested;
}

test('published static pages send name lookups to the realtime API', async () => {
  assert.equal(await requestURL({hostname:'kinosreda.github.io',origin:'https://kinosreda.github.io'}),
    'https://realtime.xn--80ahcljthqi.xn--p1ai/beer-data-search?q=Franziskaner%20Weissbier');
});
test('local development uses the local server', async () => {
  assert.equal(await requestURL({hostname:'127.0.0.1',origin:'http://127.0.0.1:8090'}),
    'http://127.0.0.1:8090/beer-data-search?q=Franziskaner%20Weissbier');
});
test('an explicit API override is preserved', async () => {
  assert.equal(await requestURL({hostname:'example.com',origin:'https://example.com'},'https://custom.example/api/'),
    'https://custom.example/api/beer-data-search?q=Franziskaner%20Weissbier');
});
