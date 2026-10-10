"""Patch only the Yandex track-link handler in an existing realtime server."""
import pathlib
import sys

path = pathlib.Path(sys.argv[1])
text = path.read_text()
start = text.index('async function handleYandexTrackLink(')
end = text.index('async function resolveYandexGetMp3UrlIfNeeded(', start)
replacement = '''const yandexTrackResolver = require('./services/yandex_track_resolver').createYandexTrackResolver({
  apiOrigin: YANDEX_MUSIC_API_ORIGIN,
  fetchText: fetchTextWithRedirect,
  buildHeaders: buildYandexUpstreamHeaders,
  buildDirectLink: buildYandexDirectLink,
  proxyUrl: buildYandexStreamProxyUrl,
  allowedHost: isAllowedYandexStreamHost
});

async function handleYandexTrackLink(urlObj, req, res, corsHeaders) {
  const headers = { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };
  if (req.method !== 'GET') {
    res.writeHead(405, headers);
    res.end(JSON.stringify({ ok: false, error: 'method_not_allowed' }));
    return;
  }
  const trackId = extractTrackId(urlObj.searchParams.get('track_id') || urlObj.searchParams.get('trackId'));
  const albumId = extractTrackId(urlObj.searchParams.get('album_id') || urlObj.searchParams.get('albumId'));
  if (!trackId) {
    res.writeHead(400, headers);
    res.end(JSON.stringify({ ok: false, error: 'missing_track_id' }));
    return;
  }
  try {
    const result = await yandexTrackResolver(req, trackId, albumId);
    res.writeHead(200, headers);
    res.end(JSON.stringify({ ok: true, result }));
  } catch (error) {
    res.writeHead(502, headers);
    res.end(JSON.stringify({ ok: false, error: String(error.message || 'yandex_stream_unavailable') }));
  }
}

'''
# Repeated runs replace the resolver declaration as well.
declaration = "const yandexTrackResolver = require('./services/yandex_track_resolver')"
if declaration in text[:start]:
    start = text.index(declaration)
text = text[:start] + replacement + text[end:]
old_mime = "    if (!responseHeaders['content-type']) responseHeaders['content-type'] = 'audio/mpeg';"
new_mime = r"""    // Yandex storage often labels MP3 bytes as a generic binary download.
    // Supply an audio MIME type for Safari and the browser download controls.
    if (!responseHeaders['content-type'] || /^(application\/octet-stream|binary\/octet-stream)(;|$)/i.test(responseHeaders['content-type'])) {
      const codec = new URL(req.url, 'http://localhost').searchParams.get('codec');
      responseHeaders['content-type'] = codec === 'aac' ? 'audio/aac' : 'audio/mpeg';
    }"""
# Only update the Yandex stream function, leaving other proxies untouched.
stream_start = text.index('function proxyYandexAudioStream(targetUrl,')
stream_end = text.index('function handleYandexAudioStream(', stream_start)
stream = text[stream_start:stream_end]
if old_mime in stream:
    text = text[:stream_start] + stream.replace(old_mime, new_mime, 1) + text[stream_end:]
path.write_text(text)
