const fs = require('node:fs');
const path = require('node:path');
const https = require('node:https');
const { spawn } = require('node:child_process');
const readline = require('node:readline');
const sharp = require('sharp');

// The browser cannot supply catalog URLs: the source is our configured database.
const DATABASE = process.env.BEER_RECOGNITION_DATABASE_URL || 'https://kinosreda-ce8ef-default-rtdb.europe-west1.firebasedatabase.app/beerRating.json';

function readCatalog() {
  return new Promise((resolve, reject) => {
    const request = https.get(DATABASE, { timeout: 8000 }, response => {
      if (response.statusCode !== 200) { response.resume(); reject(new Error('catalog_unavailable')); return; }
      const chunks = [];
      let size = 0;
      response.on('data', chunk => {
        size += chunk.length;
        if (size > 5 * 1024 * 1024) request.destroy(new Error('catalog_too_large'));
        else chunks.push(chunk);
      });
      response.on('error', reject);
      response.on('end', () => {
        try {
          const raw = JSON.parse(Buffer.concat(chunks).toString('utf8')) || {};
          if (!raw || typeof raw !== 'object') throw new Error('catalog_unavailable');
          const entries = Object.entries(raw).filter(([, record]) => record && typeof record === 'object' && record.name);
          resolve(Object.fromEntries(entries.map(([key, record]) => [key, { name: String(record.name), id: String(record.id || ''), imageUrl: String(record.imageUrl || '') }])));
        } catch (error) { reject(error); }
      });
    });
    request.on('timeout', () => request.destroy(new Error('catalog_timeout')));
    request.on('error', reject);
  });
}

function createRecognition({ fetchAndDecodeImage, readRequestBody, writeJsonResponse, loadCatalog = readCatalog }) {
  let worker, starting, refreshing, lastRefresh = 0, nextId = 0, active = null, activeScans = 0;
  const queue = [];
  const status = { ready: false, indexing: false, catalogLoaded: false, catalogSize: 0, indexed: 0, ocrAvailable: false };

  function failWorker() {
    status.ready = false;
    worker = null;
    if (active) { clearTimeout(active.timer); active.reject(new Error('recognition_unavailable')); active = null; }
    queue.splice(0).forEach(job => job.reject(new Error('recognition_unavailable')));
  }
  function drain() {
    if (active || !worker || !queue.length) return;
    active = queue.shift();
    active.timer = setTimeout(() => worker?.kill(), 10_000);
    worker.stdin.write(`${JSON.stringify({ id: active.id, ...active.payload })}\n`);
  }
  async function ensureWorker() {
    if (worker && status.ready) return;
    if (starting) return starting;
    starting = new Promise((resolve, reject) => {
      const root = path.resolve(__dirname, '..');
      const bundled = path.join(root, '.venv-beer', 'bin', 'python');
      const python = process.env.BEER_RECOGNITION_PYTHON || (fs.existsSync(bundled) ? bundled : process.env.PYTHON_BIN || 'python3');
      const child = spawn(python, ['-u', path.join(__dirname, 'beer_recognition_worker.py')], {
        cwd: root,
        stdio: ['pipe', 'pipe', 'pipe'],
        // The realtime host is deliberately small. Keep the OCR/SIFT worker
        // from competing with the API process for every CPU and BLAS arena.
        env: {
          ...process.env,
          OMP_NUM_THREADS: '1',
          OPENBLAS_NUM_THREADS: '1',
          MKL_NUM_THREADS: '1',
          NUMEXPR_NUM_THREADS: '1',
          OPENCV_OPENCL_RUNTIME: 'disabled'
        }
      });
      worker = child;
      const timer = setTimeout(() => { child.kill(); reject(new Error('recognition_unavailable')); }, 30_000);
      readline.createInterface({ input: child.stdout }).on('line', line => {
        if (worker !== child) return;
        let output;
        try { output = JSON.parse(line); } catch (_) { return; }
        if (output.ready) {
          clearTimeout(timer);
          Object.assign(status, { ready: true, ocrAvailable: output.ocrAvailable, indexed: 0, catalogSize: 0, catalogLoaded: false });
          lastRefresh = 0;
          resolve();
        } else if (active && output.id === active.id) {
          const job = active;
          clearTimeout(job.timer);
          active = null;
          if (output.error) job.reject(new Error('recognition_failed'));
          else job.resolve(output.result);
          drain();
        }
      });
      child.stderr.on('data', () => {}); // No uploaded photos or OCR text in logs.
      child.stdin.on('error', () => child.kill());
      child.on('error', () => { clearTimeout(timer); reject(new Error('recognition_unavailable')); });
      child.on('exit', () => { clearTimeout(timer); reject(new Error('recognition_unavailable')); if (worker === child) failWorker(); });
    }).finally(() => { starting = null; });
    return starting;
  }
  function command(payload, priority = false) {
    return new Promise((resolve, reject) => {
      const job = { id: ++nextId, payload, resolve, reject };
      if (priority) queue.unshift(job); else queue.push(job);
      drain();
    });
  }
  async function refresh() {
    await ensureWorker();
    if (refreshing) return refreshing;
    if (Date.now() - lastRefresh < 60_000) return;
    refreshing = (async () => {
      const catalog = await loadCatalog();
      const result = await command({ op: 'catalog', catalog });
      Object.assign(status, { catalogLoaded: true, catalogSize: result.catalogSize, indexed: result.indexed, indexing: true });
      // One bounded download at a time keeps catalog warmup from exhausting the
      // small realtime host. Interactive scans still jump ahead in the queue.
      const missing = [...result.missing];
      await Promise.all(Array.from({ length: 1 }, async () => {
        while (missing.length && worker) {
          const entry = missing.shift();
          try {
            const source = /^data:image\/(?:png|jpeg|webp);base64,/i.test(entry.url)
              ? Buffer.from(entry.url.split(',')[1], 'base64') : (await fetchAndDecodeImage(entry.url)).source;
            const image = await sharp(source, { limitInputPixels: 20_000_000 }).rotate()
              .resize({ width: 1000, height: 1000, fit: 'inside', withoutEnlargement: true }).png().toBuffer();
            const indexed = await command({ op: 'index', key: entry.key, image: image.toString('base64') });
            status.indexed = indexed.indexed;
          } catch (_) { /* One unavailable reference must not stop the catalog. */ }
        }
      }));
      await command({ op: 'prepare' });
      lastRefresh = Date.now();
    })().finally(() => { refreshing = null; status.indexing = false; });
    return refreshing;
  }
  async function handle(req, res, corsHeaders) {
    const reply = (code, data) => { if (!res.destroyed && !res.writableEnded) writeJsonResponse(res, code, corsHeaders, data); };
    if (req.method === 'GET') {
      try {
        await ensureWorker();
        refresh().catch(() => {});
        reply(200, { ...status });
      } catch (_) { reply(503, { error: 'recognition_unavailable' }); }
      return;
    }
    if (req.method !== 'POST') { reply(405, { error: 'method_not_allowed' }); return; }
    if (activeScans >= 1) {
      reply(429, { error: 'recognition_busy' }); return;
    }
    activeScans++;
    try {
      let image;
      try {
        if (!/^image\/(jpeg|png|webp)$/i.test(String(req.headers['content-type'] || ''))) throw new Error('invalid_image');
        const source = await readRequestBody(req, 3 * 1024 * 1024);
        image = await sharp(source, { limitInputPixels: 20_000_000, sequentialRead: true }).rotate()
          .resize({ width: 1000, height: 1000, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 88 }).toBuffer();
      } catch (_) { reply(400, { error: 'invalid_image' }); return; }
      try {
        await ensureWorker();
        refresh().catch(() => {});
        if (!status.catalogLoaded) { reply(503, { error: 'catalog_warming' }); return; }
        const result = await command({ op: 'recognize', image: image.toString('base64') }, true);
        reply(200, { ...result, indexing: status.indexing });
      } catch (_) { reply(503, { error: 'recognition_unavailable' }); }
    } finally { activeScans--; }
  }
  function close() { clearInterval(timer); worker?.kill(); }
  const timer = setInterval(() => { if (worker) refresh().catch(() => {}); }, 60_000);
  timer.unref();
  process.once('exit', close);
  return { handle, warmup: () => refresh().catch(() => {}), close };
}

module.exports = { createRecognition, readCatalog };
