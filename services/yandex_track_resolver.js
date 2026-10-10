'use strict';

// Resolve full tracks through the authenticated Music API. The obsolete web
// download handler no longer returns a src, so it must not be the primary path.
function createYandexTrackResolver({ apiOrigin, fetchText, buildHeaders, buildDirectLink, proxyUrl, allowedHost }) {
  function safeUrl(value) {
    const url = new URL(String(value).replace(/^http:/, 'https:'));
    if (url.protocol !== 'https:' || !allowedHost(url.hostname) || url.username || url.password)
      throw new Error('invalid_yandex_audio_host');
    return url;
  }
  async function get(url, headers) {
    const response = await fetchText(url, headers, 2);
    if (response.statusCode < 200 || response.statusCode >= 300)
      throw new Error(`yandex_upstream_${response.statusCode}`);
    return response;
  }
  return async function resolve(req, trackId, albumId = '') {
    if (!/^\d+$/.test(trackId) || (albumId && !/^\d+$/.test(albumId)))
      throw new Error('invalid_track_id');
    const headers = buildHeaders(req, { accept: 'application/json' });
    const ids = albumId ? [`${trackId}:${albumId}`, trackId] : [trackId];
    let lastError;
    for (const id of ids) {
      try {
        const infoUrl = new URL(`/tracks/${id}/download-info`, apiOrigin);
        infoUrl.searchParams.set('get-direct-links', 'true');
        const response = await get(infoUrl, headers);
        const payload = JSON.parse(response.body);
        const options = (Array.isArray(payload.result) ? payload.result : [])
          .filter(item => !item.preview && /^(mp3|aac)$/.test(item.codec || '') &&
            (item.directLink || item.direct_link || item.url || item.downloadInfoUrl || item.download_info_url))
          .sort((a,b) => (a.codec === 'mp3' ? 1 : 0) - (b.codec === 'mp3' ? 1 : 0) ||
            Number(a.bitrateInKbps || 0) - Number(b.bitrateInKbps || 0)).reverse();
        if (!options.length) throw new Error('yandex_full_track_unavailable');
        for (const item of options) {
          try {
            let raw = item.directLink || item.direct_link || item.url;
            if (!raw) {
              const locationUrl = safeUrl(item.downloadInfoUrl || item.download_info_url);
              locationUrl.searchParams.set('format', 'json');
              const location = await get(locationUrl, { accept: 'application/json, application/xml', 'user-agent': headers['user-agent'] });
              let metadata;
              try { const json = JSON.parse(location.body); metadata = json.result || json; }
              catch (_) {
                metadata = Object.fromEntries(['host','path','ts','s','src'].map(name =>
                  [name, String(location.body).match(new RegExp(`<${name}>([^<]+)</${name}>`, 'i'))?.[1] || '']));
              }
              raw = buildDirectLink(metadata) || metadata.src || metadata.url;
            }
            const audioUrl = safeUrl(raw);
            return { trackId, albumId, directLink: proxyUrl(req, audioUrl.href) + `&codec=${encodeURIComponent(item.codec)}`,
              rawDirectLink: audioUrl.href, resolvedRawDirectLink: audioUrl.href,
              codec: item.codec, bitrateInKbps: Number(item.bitrateInKbps || 0), preview: false };
          } catch (error) { lastError = error; }
        }
      } catch (error) { lastError = error; }
    }
    throw lastError || new Error('yandex_stream_unavailable');
  };
}
module.exports = { createYandexTrackResolver };
