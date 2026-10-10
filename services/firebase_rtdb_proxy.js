const http = require('node:http');
const https = require('node:https');

function createFirebaseRtdbProxy({ buildUpstreamUrl, buildLpPatch, routePrefix = '/firebase-rtdb', timeout = 130000 }) {
  return function proxyFirebaseRtdbRequest(urlObj, req, res, cors) {
    const method = String(req.method || 'GET').toUpperCase();
    const fail = (code, message) => {
      if (res.destroyed || res.writableEnded) return;
      if (res.headersSent) { res.destroy(); return; }
      res.writeHead(code, { ...cors, 'Content-Type': 'text/plain; charset=utf-8' });
      res.end(message);
    };
    if (!['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
      fail(405, 'method_not_allowed'); return;
    }
    let url;
    try { url = buildUpstreamUrl(urlObj); }
    catch (_) { fail(400, 'invalid_path'); return; }
    const headers = { ...req.headers, host: url.host, origin: `${url.protocol}//${url.host}` };
    delete headers['accept-encoding'];
    let upstreamResponse;
    const upstream = (url.protocol === 'https:' ? https : http).request(url, {
      method, headers, timeout, family: 4
    }, response => {
      upstreamResponse = response;
      if (res.destroyed || res.writableEnded) { response.destroy(); return; }
      const responseHeaders = { ...cors, 'x-rtdb-proxy': '1' };
      for (const key of ['content-type', 'cache-control', 'etag', 'last-modified', 'expires', 'pragma', 'content-length']) {
        if (response.headers[key]) responseHeaders[key] = response.headers[key];
      }
      const isLp = urlObj.pathname === `${routePrefix}/.lp`;
      const patch = method === 'GET' && isLp && response.statusCode >= 200 && response.statusCode < 300;
      response.on('error', () => fail(502, 'rtdb_proxy_upstream_read_error'));
      if (!patch) {
        if (isLp) responseHeaders['x-rtdb-lp-context-patched'] = '0';
        res.writeHead(response.statusCode || 502, responseHeaders);
        response.pipe(res);
        return;
      }
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => {
        if (res.destroyed || res.writableEnded) return;
        const payload = Buffer.from(buildLpPatch() + Buffer.concat(chunks).toString('utf8'));
        res.writeHead(response.statusCode, { ...responseHeaders, 'x-rtdb-lp-context-patched': '1', 'content-length': String(payload.length) });
        res.end(payload);
      });
    });
    // Timeout and close can arrive after a streamed response has begun. Never
    // write another status line; terminate only this response, not the server.
    upstream.on('timeout', () => {
      fail(504, 'rtdb_proxy_timeout');
      upstream.destroy();
      upstreamResponse?.destroy();
    });
    upstream.on('error', () => fail(502, 'rtdb_proxy_error'));
    const cancel = () => { upstream.destroy(); upstreamResponse?.destroy(); };
    req.once('aborted', cancel);
    res.once('close', cancel);
    req.pipe(upstream);
  };
}
module.exports = { createFirebaseRtdbProxy };
