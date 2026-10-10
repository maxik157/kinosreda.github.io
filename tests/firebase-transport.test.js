const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

test('Firebase bypass preserves SDK statics and selects transport before creating the database', () => {
  const calls = [];
  const instance = { marker: 'database' };
  const database = () => { calls.push('connect'); return instance; };
  database.INTERNAL = { forceWebSockets: () => calls.push('websocket'), forceLongPolling: () => calls.push('longpoll') };
  database.ServerValue = { TIMESTAMP: { '.sv': 'timestamp' } };
  const firebase = { database, initializeApp: () => ({}) };
  const document = { querySelectorAll: () => [] };
  const window = { firebase, document, location: new URL('https://kinosreda.github.io/recipes.html') };
  window.window = window;
  const context = vm.createContext({ window, firebase, URL, setTimeout: () => 0 });
  vm.runInContext(fs.readFileSync(require.resolve('../firebase-rtdb-rf-bypass.js'), 'utf8'), context);
  assert.equal(firebase.database.INTERNAL, database.INTERNAL);
  assert.equal(firebase.database.ServerValue, database.ServerValue);
  calls.length = 0;
  firebase.database.INTERNAL.forceLongPolling();
  assert.deepEqual(calls, ['websocket']);
  calls.length = 0;
  assert.equal(firebase.database(), instance);
  assert.deepEqual(calls, ['websocket', 'connect']);
});
