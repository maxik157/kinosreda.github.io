import test from 'node:test';
import assert from 'node:assert/strict';
import {roomSocketBase} from '../beer-room-endpoints.mjs';
test('public scenes connect to the shared realtime host',()=>{for(const hostname of ['xn--80ahcljthqi.xn--p1ai','www.xn--80ahcljthqi.xn--p1ai','maxik157.github.io','kinosreda.github.io'])assert.equal(roomSocketBase({hostname,host:hostname,protocol:'https:'}),'wss://realtime.xn--80ahcljthqi.xn--p1ai/ws');});
test('local checks keep their isolated port and protocol',()=>{assert.equal(roomSocketBase({hostname:'127.0.0.1',host:'127.0.0.1:8090',protocol:'http:'}),'ws://127.0.0.1:8090/ws');assert.equal(roomSocketBase({hostname:'localhost',host:'localhost:8443',protocol:'https:'}),'wss://localhost:8443/ws');});
