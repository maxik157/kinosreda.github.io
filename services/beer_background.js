const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const https = require('node:https');
const { spawn } = require('node:child_process');

const serviceUrl = process.env.REMBG_SERVICE_URL || 'http://127.0.0.1:8787';
const serviceClient = new URL(serviceUrl).protocol === 'https:' ? https : http;
let worker = null;
let starting = null;
let idleTimer = null;
let workerError = '';

function healthy() {
  return new Promise((resolve) => {
    const request = serviceClient.get(`${serviceUrl}/health`, { timeout: 600 }, (response) => {
      response.resume();
      resolve(response.statusCode === 200);
    });
    request.on('timeout', () => request.destroy());
    request.on('error', () => resolve(false));
  });
}

function touchWorker() {
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => { worker?.kill(); }, 10 * 60 * 1000);
  idleTimer.unref();
}

async function ensureWorker() {
  touchWorker();
  if (await healthy()) return;
  if (starting) return starting;
  starting = (async () => {
    if (process.env.REMBG_SERVICE_URL) throw new Error('background_service_unavailable');
    const root = path.resolve(__dirname, '..');
    const bundled = path.join(root, '.venv-rembg', 'bin', process.platform === 'win32' ? 'python.exe' : 'python');
    const python = process.env.REMBG_PYTHON || (fs.existsSync(bundled) ? bundled : process.env.PYTHON_BIN || 'python3');
    if (!worker) {
      workerError = '';
      worker = spawn(python, ['-m', 'uvicorn', 'services.rembg_service:app', '--host', '127.0.0.1', '--port', '8787'], {
        cwd: root,
        env: { ...process.env, OMP_NUM_THREADS: '2', REMBG_MODEL: process.env.REMBG_MODEL || 'silueta', REMBG_QUEUE_TIMEOUT: '30', PYTHONUNBUFFERED: '1' },
        stdio: ['ignore', 'ignore', 'pipe']
      });
      worker.stderr.on('data', (data) => { workerError = (workerError + data).slice(-2000); });
      worker.on('error', (error) => { workerError = error.message; });
      worker.on('exit', () => { worker = null; });
    }
    for (let attempt = 0; attempt < 60; attempt++) {
      if (await healthy()) return;
      if (!worker) break;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    console.error('[beer-background] Worker unavailable:', workerError);
    throw new Error('background_service_unavailable');
  })().finally(() => { starting = null; });
  return starting;
}

async function handle(req, res, corsHeaders, { readRequestBody, writeJsonResponse }) {
  if (req.method !== 'POST') {
    writeJsonResponse(res, 405, corsHeaders, { error: 'method_not_allowed' });
    return;
  }
  let body;
  try {
    // Camera uploads are normalized in the browser. Keep the API bounded so
    // an accidental multi-megapixel/HEIC payload cannot occupy the realtime
    // process while the rembg worker is busy.
    body = await readRequestBody(req, 9 * 1024 * 1024);
    const payload = JSON.parse(body.toString('utf8'));
    if (typeof payload.image_base64 !== 'string' || !payload.image_base64 || payload.image_base64.length > 8 * 1024 * 1024) throw new Error('invalid_image');
  } catch (error) {
    writeJsonResponse(res, error.code === 'request_too_large' ? 413 : 400, corsHeaders, { error: 'invalid_image' });
    return;
  }
  try { await ensureWorker(); } catch (_) {
    writeJsonResponse(res, 503, corsHeaders, { error: 'background_service_unavailable' });
    return;
  }
  if (res.destroyed) return;
  const upstream = serviceClient.request(`${serviceUrl}/remove-bg`, {
    method: 'POST', timeout: 60000,
    headers: { 'Content-Type': 'application/json', 'Content-Length': body.length }
  }, (response) => {
    res.writeHead(response.statusCode, { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...(response.headers['retry-after'] ? { 'Retry-After': response.headers['retry-after'] } : {}) });
    response.on('error', () => res.destroy());
    response.pipe(res);
  });
  upstream.on('timeout', () => upstream.destroy(new Error('background_removal_timeout')));
  upstream.on('error', () => {
    if (!res.headersSent && !res.destroyed) writeJsonResponse(res, 502, corsHeaders, { error: 'background_removal_failed' });
  });
  res.on('close', () => upstream.destroy());
  upstream.end(body);
}

process.on('exit', () => { worker?.kill(); });
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => { worker?.kill(); process.exit(0); });
module.exports = { handle };
