'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createYandexTrackResolver } = require('../services/yandex_track_resolver');
function fixture(responses) {
  const calls = [];
  const resolve = createYandexTrackResolver({
    apiOrigin: 'https://api.music.yandex.net',
    fetchText: async (url, headers) => {
      calls.push({url: url.href, headers});
      const next = responses.shift();
      assert.ok(next, 'unexpected upstream request');
      return { statusCode: next.status || 200, body: typeof next.body === 'string' ? next.body : JSON.stringify(next.body) };
    },
    buildHeaders: () => ({ authorization: 'OAuth fixture', 'user-agent': 'fixture' }),
    buildDirectLink: m => m.host && m.path && m.ts && m.s ? `https://${m.host}/get-mp3/sign/${m.ts}${m.path}` : '',
    proxyUrl: (_,url) => 'https://realtime.example/ym-audio-stream?url=' + encodeURIComponent(url),
    allowedHost: host => host === 'api.music.yandex.net' || host.endsWith('.yandex.net'),
  });
  return {calls, resolve};
}
test('legacy track without album resolves full audio and proxies it for CORS/Range', async () => {
  const f = fixture([
    {body:{result:[{codec:'mp3',preview:false,bitrateInKbps:192,downloadInfoUrl:'https://api.music.yandex.net/get-mp3/location'}]}},
    {body:{host:'storage.yandex.net',path:'/track.mp3',ts:'123',s:'salt'}},
  ]);
  const result = await f.resolve({headers:{}}, '217948');
  assert.equal(result.preview,false);
  assert.equal(result.trackId,'217948');
  assert.ok(result.directLink.startsWith('https://realtime.example/ym-audio-stream?'));
  assert.match(f.calls[0].url,/tracks\/217948\/download-info\?get-direct-links=true/);
  assert.match(f.calls[1].url,/format=json/);
  assert.equal(f.calls[1].headers.authorization,undefined);
});
test('stale saved album falls back to track ID and chooses full MP3 over preview', async () => {
  const f = fixture([
    {status:404,body:{}},
    {body:{result:[{codec:'mp3',preview:true,directLink:'https://storage.yandex.net/preview'},
      {codec:'aac',preview:false,bitrateInKbps:256,directLink:'https://storage.yandex.net/aac'},
      {codec:'mp3',preview:false,bitrateInKbps:192,directLink:'https://storage.yandex.net/full'}]}},
  ]);
  const result = await f.resolve({headers:{}},'123','999');
  assert.equal(result.rawDirectLink,'https://storage.yandex.net/full');
  assert.match(f.calls[0].url,/123:999/);
  assert.match(f.calls[1].url,/tracks\/123\/download-info/);
});
test('XML location metadata and next codec fallback remain supported', async () => {
  const f = fixture([
    {body:{result:[{codec:'mp3',preview:false,downloadInfoUrl:'https://api.music.yandex.net/missing'},
      {codec:'aac',preview:false,downloadInfoUrl:'https://api.music.yandex.net/location'}]}},
    {status:503,body:{}},
    {body:'<download-info><host>storage.yandex.net</host><path>/audio</path><ts>123</ts><s>salt</s></download-info>'},
  ]);
  assert.equal((await f.resolve({headers:{}},'123')).codec,'aac');
});
test('preview-only tracks return an explicit error instead of a short clip', async () => {
  const f = fixture([{body:{result:[{codec:'mp3',preview:true,directLink:'https://storage.yandex.net/preview'}]}}]);
  await assert.rejects(f.resolve({headers:{}},'123'),/yandex_full_track_unavailable/);
});
test('untrusted audio and location hosts cannot become proxy targets', async () => {
  for (const item of [{directLink:'https://attacker.example/audio'}, {downloadInfoUrl:'https://attacker.example/location'}]) {
    const f = fixture([{body:{result:[{codec:'mp3',preview:false,...item}]}}]);
    await assert.rejects(f.resolve({headers:{}},'123'),/invalid_yandex_audio_host/);
    assert.equal(f.calls.length,1);
  }
});
