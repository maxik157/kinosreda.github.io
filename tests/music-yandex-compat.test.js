'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const source = fs.readFileSync(require.resolve('../music-app.js'), 'utf8');
const normalizeSource = source.slice(source.indexOf('  function normalize('), source.indexOf('  let noticeTimer;'));
const normalize = vm.runInNewContext(normalizeSource + '\nnormalize;', {safeCover: url => url || 'fallback'});
test('saved Yandex tracks keep Firebase identity, likes and artist metadata', () => {
  const result = normalize({trackId:'217948', title:'Old song', artists:['Artist'], likes:{max:true}, albumId:'123'},'firebase-key');
  assert.equal(result.provider,'yandex');
  assert.equal(result.key,'firebase-key');
  assert.equal(result.likes.max,true);
  assert.equal(result.albumId,'123');
});
test('compound Yandex ID from legacy records restores both IDs', () => {
  const result = normalize({provider:'yandex',trackId:' 217948:228585 ',artists:[{name:'Artist'}]},'legacy-key');
  assert.equal(result.trackId,'217948');
  assert.equal(result.albumId,'228585');
  assert.equal(result.artists[0],'Artist');
});
test('new Yandex search results and Truffled tracks remain supported', () => {
  const result = normalize({provider:'yandex', id:123, albums:[{id:456}], durationMs:120000});
  assert.equal(result.trackId,'123');
  assert.equal(result.albumId,'456');
  assert.equal(result.durationMs,120000);
  assert.equal(normalize({provider:'truffled',id:'abc_DEF-123'}).trackId,'abc_DEF-123');
  assert.equal(normalize({provider:'youtube',id:'abc_DEF-123'}),null);
});
