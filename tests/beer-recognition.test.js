const assert = require('node:assert/strict');
const http = require('node:http');
const test = require('node:test');
const sharp = require('sharp');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createRecognition } = require('../services/beer_recognition');

test('recognition HTTP API uses the catalog and returns verified label matches', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'beer-recognition-test-'));
  const previousCache = process.env.BEER_RECOGNITION_CACHE;
  process.env.BEER_RECOGNITION_CACHE = path.join(directory, 'features.sqlite');
  let shapes = '';
  let seed = 17;
  const random = max => { seed = (seed * 16807) % 2147483647; return seed % max; };
  for (let i = 0; i < 150; i++) shapes += `<circle cx="${20 + random(230)}" cy="${20 + random(460)}" r="${3 + random(12)}" stroke="#${random(0xffffff).toString(16).padStart(6, '0')}" fill="none" stroke-width="2"/>`;
  const image = await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="270" height="510"><rect width="270" height="510" fill="white"/>${shapes}</svg>`)).png().toBuffer();
  let downloads = 0;
  let holdUpload = null;
  let releaseUpload = null;
  const service = createRecognition({
    loadCatalog: async () => ({ beer: { id: 'test-123', name: 'Test Amber Lager', imageUrl: 'https://example.com/reference' } }),
    fetchAndDecodeImage: async () => { downloads++; return { source: image }; },
    readRequestBody: async req => { if (req.headers['x-hold-upload']) { holdUpload(); await new Promise(resolve => { releaseUpload = resolve; }); } const chunks = []; for await (const chunk of req) chunks.push(chunk); return Buffer.concat(chunks); },
    writeJsonResponse: (res, code, headers, result) => { res.writeHead(code, { ...headers, 'Content-Type': 'application/json' }); res.end(JSON.stringify(result)); }
  });
  const server = http.createServer((req, res) => service.handle(req, res, {}));
  t.after(() => {
    service.close(); server.close();
    if (previousCache === undefined) delete process.env.BEER_RECOGNITION_CACHE;
    else process.env.BEER_RECOGNITION_CACHE = previousCache;
    fs.rmSync(directory, { recursive: true, force: true });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  await service.warmup();
  const ready = await fetch(base).then(r => r.json());
  assert.equal(ready.ready, true);
  assert.equal(ready.indexed, 1);
  assert.equal(downloads, 1);

  const response = await fetch(base, { method: 'POST', headers: { 'Content-Type': 'image/png' }, body: image });
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.confident, true);
  assert.equal(result.matches[0].key, 'beer');
  assert.equal(result.matches[0].recordId, 'test-123');
  assert.equal(result.matches[0].name, 'Test Amber Lager');
  assert.equal(downloads, 1, 'scanning must not download catalog photos again');

  const admitted = new Promise(resolve => { holdUpload = resolve; });
  const firstScan = fetch(base, { method: 'POST', headers: { 'Content-Type': 'image/png', 'X-Hold-Upload': '1' }, body: image });
  await admitted;
  const competing = await fetch(base, { method: 'POST', headers: { 'Content-Type': 'image/png' }, body: image });
  assert.equal(competing.status, 429, 'concurrent scans must not allocate another image pyramid');
  assert.equal((await competing.json()).error, 'recognition_busy');
  const duringScan = await fetch(base);
  assert.equal(duringScan.status, 200, 'status remains responsive during a scan');
  releaseUpload();
  assert.equal((await firstScan).status, 200);

  const invalid = await fetch(base, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"url":"http://localhost/secret"}' });
  assert.equal(invalid.status, 400);
  assert.equal((await invalid.json()).error, 'invalid_image');
  const method = await fetch(base, { method: 'PUT' });
  assert.equal(method.status, 405);
});
