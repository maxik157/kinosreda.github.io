// Recognition runs in its own systemd service, so OCR memory pressure cannot
// interrupt Firebase, planning collaboration, calls or music requests.
const http = require('node:http');
const https = require('node:https');
const { execFile } = require('node:child_process');
const sharp = require('sharp');
const { createRecognition } = require('./beer_recognition');

sharp.cache(false);
sharp.concurrency(1);

function fetchReference(url, redirects = 0) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol) || redirects > 4) {
      reject(new Error('invalid_reference_url'));
      return;
    }
    const request = (parsed.protocol === 'https:' ? https : http).get(parsed, {
      timeout: 8000,
      headers: { Accept: 'image/*,*/*;q=0.8', 'User-Agent': 'Mozilla/5.0 (compatible; KinosredaImageProxy/2.0)', Referer: `${parsed.protocol}//${parsed.host}/` }
    }, response => {
      if ([301, 302, 303, 307, 308].includes(response.statusCode)) {
        response.resume();
        if (!response.headers.location) { reject(new Error('reference_redirect')); return; }
        fetchReference(new URL(response.headers.location, parsed).href, redirects + 1).then(resolve, reject);
        return;
      }
      if (response.statusCode !== 200) { response.resume(); reject(new Error('reference_unavailable')); return; }
      const chunks = [];
      let size = 0;
      response.on('data', chunk => {
        size += chunk.length;
        if (size > 15 * 1024 * 1024) request.destroy(new Error('reference_too_large'));
        else chunks.push(chunk);
      });
      response.on('error', reject);
      response.on('end', () => resolve({ source: Buffer.concat(chunks) }));
    });
    request.on('timeout', () => request.destroy(new Error('reference_timeout')));
    request.on('error', reject);
  });
}

async function fetchAndDecodeImage(url) {
  try { return await fetchReference(url); }
  catch (error) {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) throw error;
    // Match the main image proxy's IPv4 fallback for image hosts whose IPv6
    // routing or anti-bot handling rejects Node's native client.
    const source = await new Promise((resolve, reject) => {
      execFile('curl', ['--silent', '--show-error', '--fail', '--location', '--ipv4',
        '--proto', '=http,https', '--proto-redir', '=http,https', '--max-redirs', '4',
        '--connect-timeout', '5', '--max-time', '12', '--max-filesize', '15728640',
        '--user-agent', 'Mozilla/5.0 (compatible; KinosredaImageProxy/2.1)',
        '--referer', `${parsed.protocol}//${parsed.host}/`, url],
      { encoding: 'buffer', maxBuffer: 15 * 1024 * 1024, timeout: 13000 },
      (err, stdout) => err ? reject(err) : resolve(stdout));
    });
    return { source };
  }
}

function readRequestBody(req, maxBytes) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', chunk => {
      size += chunk.length;
      if (size > maxBytes) { req.destroy(); reject(new Error('image_too_large')); }
      else chunks.push(chunk);
    });
    req.on('error', reject);
    req.on('aborted', () => reject(new Error('request_aborted')));
    req.on('end', () => resolve(Buffer.concat(chunks)));
  });
}

function writeJsonResponse(res, code, headers, data) {
  res.writeHead(code, { ...headers, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(data));
}

const recognition = createRecognition({ fetchAndDecodeImage, readRequestBody, writeJsonResponse });
const server = http.createServer((req, res) => {
  const cors = {
    'Access-Control-Allow-Origin': req.headers.origin || '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin'
  };
  if (req.method === 'OPTIONS') { res.writeHead(204, cors); res.end(); return; }
  const pathname = new URL(req.url, 'http://localhost').pathname;
  if (!['/beer-recognize', '/beer-recognize/status'].includes(pathname)) {
    writeJsonResponse(res, 404, cors, { error: 'not_found' });
    return;
  }
  recognition.handle(req, res, cors).catch(() => {
    if (!res.headersSent && !res.destroyed) writeJsonResponse(res, 503, cors, { error: 'recognition_unavailable' });
  });
});
server.listen(Number(process.env.BEER_RECOGNITION_PORT) || 8092, '127.0.0.1', () => recognition.warmup());
process.once('SIGTERM', () => { recognition.close(); server.close(); });
