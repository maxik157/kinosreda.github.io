(() => {
  const resultCache = new Map();
  const apiBase = (base = 'https://realtime.xn--80ahcljthqi.xn--p1ai') =>
    (['localhost', '127.0.0.1'].includes(location.hostname) ? location.origin : base).replace(/\/$/, '');
  const load = (url) => new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('invalid_image'));
    image.src = url;
  });
  const dataUrl = (blob) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
  const blob = (canvas, type = 'image/png', quality) => new Promise((resolve, reject) => {
    canvas.toBlob((value) => value ? resolve(value) : reject(new Error('image_encode_failed')), type, quality);
  });
  function pixels(image, maxSide = Infinity) {
    const canvas = document.createElement('canvas');
    const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return { canvas, context, data: context.getImageData(0, 0, canvas.width, canvas.height).data };
  }
  async function hasTransparency(url) {
    const { data } = pixels(await load(url), 256);
    let transparent = 0, foreground = 0;
    for (let index = 3; index < data.length; index += 4) {
      if (data[index] < 16) transparent++;
      if (data[index] > 128) foreground++;
    }
    return transparent > data.length / 4 * 0.01 && foreground > 16;
  }
  async function prepare(url) {
    const image = await load(url);
    const scale = Math.min(1, 1200 / Math.max(image.naturalWidth, image.naturalHeight));
    if (scale === 1 && url.length < 1024 * 1024) return url;
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(image.naturalWidth * scale);
    canvas.height = Math.round(image.naturalHeight * scale);
    canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
    // Keep real alpha images lossless; opaque camera photos need a compact
    // JPEG rather than a multi-megabyte PNG on mobile.
    const transparent = /^data:image\/(?:png|webp)/i.test(url) && await hasTransparency(url);
    return dataUrl(await blob(canvas, transparent ? 'image/png' : 'image/jpeg', 0.86));
  }
  async function request(endpoint, body, signal) {
    const controller = new AbortController();
    const abort = () => controller.abort();
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    signal?.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(abort, 65000);
    try {
      const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, signal: controller.signal });
      const out = await response.json().catch(() => ({}));
      const raw = out.result_base64 || out.image_base64 || out.data;
      if (!response.ok || typeof raw !== 'string') {
        const error = new Error(out.detail || out.error || `remove_bg_${response.status}`);
        error.retryable = [429, 502, 503, 504].includes(response.status);
        throw error;
      }
      const result = raw.startsWith('data:image/') ? raw : `data:image/png;base64,${raw}`;
      if (!await hasTransparency(result)) throw new Error('empty_background_mask');
      return result;
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
    }
  }
  async function remove(url, { signal, base = 'https://realtime.xn--80ahcljthqi.xn--p1ai' } = {}) {
    if (await hasTransparency(url)) return url;
    if (resultCache.has(url)) return resultCache.get(url);
    const endpoints = [`${apiBase(base)}/remove-bg`];
    const body = JSON.stringify({ image_base64: (await prepare(url)).split(',')[1] });
    let lastError;
    for (const endpoint of endpoints) {
      for (let attempt = 0; attempt < 2; attempt++) {
        if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
        try {
          const result = await request(endpoint, body, signal);
          resultCache.set(url, result);
          while (resultCache.size > 3) resultCache.delete(resultCache.keys().next().value);
          return result;
        } catch (error) {
          if (signal?.aborted) throw error;
          lastError = error;
          if (!error.retryable || attempt) break;
          await new Promise((resolve) => setTimeout(resolve, 1200));
        }
      }
    }
    throw lastError || new Error('remove_bg_unavailable');
  }
  async function normalize(url) {
    const { canvas: source, data } = pixels(await load(url));
    let left = source.width, top = source.height, right = -1, bottom = -1;
    for (let y = 0; y < source.height; y++) for (let x = 0; x < source.width; x++) {
      if (data[(y * source.width + x) * 4 + 3] > 24) {
        left = Math.min(left, x); top = Math.min(top, y);
        right = Math.max(right, x); bottom = Math.max(bottom, y);
      }
    }
    if (right < left) throw new Error('empty_foreground');
    const padding = Math.max(2, Math.round((right - left + 1) * 0.02));
    left = Math.max(0, left - padding); right = Math.min(source.width - 1, right + padding);
    top = Math.max(0, top - 2);
    const width = right - left + 1, height = bottom - top + 1;
    const output = document.createElement('canvas');
    output.height = Math.min(2040, height);
    output.width = Math.round(output.height * 270 / 510);
    const scale = Math.min(1, output.width * 0.92 / width, output.height / height);
    const context = output.getContext('2d');
    context.imageSmoothingQuality = 'high';
    context.drawImage(source, left, top, width, height, (output.width - width * scale) / 2, output.height - height * scale, width * scale, height * scale);
    // WebP preserves alpha but is several times smaller than a PNG for product photos.
    return blob(output, 'image/webp', 0.92);
  }
  async function fetchImage(url, { signal, base } = {}) {
    const controller = new AbortController();
    const abort = () => controller.abort();
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    signal?.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(abort, 35000);
    try {
      const response = await fetch(`${apiBase(base)}/fetch-image`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }), signal: controller.signal
      });
      const out = await response.json().catch(() => ({}));
      const raw = out.result_base64 || out.image_base64 || out.data;
      if (!response.ok || typeof raw !== 'string' || !raw) throw new Error(out.error || `fetch_image_${response.status}`);
      return raw.startsWith('data:image/') ? raw : `data:image/png;base64,${raw}`;
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
    }
  }
  window.BeerImageProcess = { apiBase, fetchImage, prepare, remove, normalize, hasTransparency };
})();
