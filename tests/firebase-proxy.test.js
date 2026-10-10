const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { createFirebaseRtdbProxy } = require('../services/firebase_rtdb_proxy');
const listen = server => new Promise(resolve => server.listen(0, '127.0.0.1', resolve));

test('Firebase timeout after partial response closes only that request and the API stays available', async t => {
  const origin = http.createServer((req, res) => {
    if (req.url === '/hang') { res.writeHead(200, { 'Content-Type': 'application/json' }); res.write('{'); return; }
    res.end('{"ok":true}');
  });
  await listen(origin);
  const proxy = createFirebaseRtdbProxy({ timeout: 50,
    buildUpstreamUrl: url => new URL(url.pathname, `http://127.0.0.1:${origin.address().port}`), buildLpPatch: () => '' });
  const server = http.createServer((req, res) => proxy(new URL(req.url, 'http://localhost'), req, res, {}));
  await listen(server);
  t.after(() => { server.closeAllConnections(); server.close(); origin.closeAllConnections(); origin.close(); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const partial = await fetch(base + '/hang');
  assert.equal(partial.status, 200);
  await assert.rejects(partial.text());
  const next = await fetch(base + '/healthy');
  assert.equal(next.status, 200);
  assert.deepEqual(await next.json(), { ok: true });
});
