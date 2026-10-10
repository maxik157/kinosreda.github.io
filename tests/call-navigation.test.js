'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '../call.html'), 'utf8');
const home = fs.readFileSync(require('node:path').join(__dirname, '../index.html'), 'utf8');
function declaration(text, name) {
  const re = new RegExp('^      (?:async )?function '+name+'\\(', 'm');
  const start = text.search(re);
  assert.ok(start >= 0, name);
  const tail = text.slice(start + 1);
  const end = tail.search(/^      (?:async )?function /m);
  return text.slice(start, end < 0 ? undefined : start + 1 + end);
}
function harness(names, globals) {
  const context = vm.createContext({...globals});
  vm.runInContext(names.map(name => declaration(source, name)).join('\n'),context);
  return context;
}
const deferred = () => { let resolve; const promise = new Promise(r => resolve=r); return {promise,resolve}; };
test('leaving during microphone permission stops the late stream without attaching it', async () => {
  const permission = deferred(); let stopped=0,attached=0;
  const state={mediaEpoch:1,joined:true,selectedInputId:'',mode:'vad'};
  const context=harness(['ensureLocalAudio'],{state,navigator:{mediaDevices:{getUserMedia:()=>permission.promise}},applyLocalStream:()=>attached++});
  const pending=context.ensureLocalAudio();
  state.joined=false; state.pageDeparted=true; state.mediaEpoch++;
  permission.resolve({getTracks:()=>[{stop:()=>stopped++}]});
  await assert.rejects(pending,/call_cancelled/);
  assert.equal(stopped,1); assert.equal(attached,0); assert.equal(state.voiceInitPromise,null);
});
test('leaving during camera or screen permission releases late video tracks', async () => {
  for (const name of ['startCameraShare','startScreenShare']) {
    const permission=deferred(); let stopped=0;
    const state={mediaEpoch:1,joined:true,self:{id:'me'}};
    const context=harness([name],{state,navigator:{mediaDevices:{getUserMedia:()=>permission.promise,getDisplayMedia:()=>permission.promise}},getCameraQualityProfile:()=>({}),getScreenQualityProfile:()=>({}),getRemoteActiveScreenOwnerId:()=>'',showToast:()=>{}});
    const pending=context[name](); state.joined=false; state.mediaEpoch++; state.pageDeparted=true;
    permission.resolve({getTracks:()=>[{stop:()=>stopped++}]});
    await pending; assert.equal(stopped,1,name); assert.equal(state.cameraStream,undefined); assert.equal(state.screenStream,undefined);
  }
});
test('navigation closes transport, media, VAD and both audio contexts and is repeatable', () => {
  const calls=[]; const state={mediaEpoch:0,joined:true,ws:{readyState:1,send:p=>calls.push(JSON.parse(p).type)},localAudioContext:{state:'running',close:()=>{calls.push('local-context');return Promise.resolve();}},remoteAudioContext:{state:'running',close:()=>{calls.push('remote-context');return Promise.resolve();}}};
  const stubs={};
  for (const name of ['stopCameraShare','stopScreenShare','closeControlPip','stopPresenceLoop','stopPruneLoop','stopStatsLoop','stopTalkingHeartbeat','clearReconnectTimer','closeAllPeers','stopLocalAudio','stopVadLoop','updateConnectButton','updateTransportBadge','updateDockStatus']) stubs[name]=()=>calls.push(name);
  stubs.closeSocket=()=>{calls.push('socket');state.ws=null;};
  const context=harness(['shutdownAll','stopCallForNavigation'],{state,...stubs,WS_OPEN:1,sendPacket:p=>calls.push(p.type)});
  context.stopCallForNavigation(); context.stopCallForNavigation();
  assert.equal(state.joined,false); assert.equal(state.pageDeparted,true);
  for (const name of ['leave','socket','stopLocalAudio','stopCameraShare','stopScreenShare','stopVadLoop','stopTalkingHeartbeat','clearReconnectTimer','local-context','remote-context']) assert.ok(calls.includes(name),name);
  assert.equal(state.localAudioContext,null); assert.equal(state.remoteAudioContext,null);
  assert.equal(calls.filter(x=>x==='local-context').length,1);
});
test('stale signalling connection cannot attach after navigation', async () => {
  const connection=deferred(); let closed=0,attached=0;
  const state={mediaEpoch:1,joined:true,roomReady:true,roomKey:'test'};
  const context=harness(['connectRealtime'],{state,WebSocket:{CONNECTING:0},WS_OPEN:1,clearReconnectTimer:()=>{},updateTransportBadge:()=>{},buildWsCandidates:()=>['wss://test'],attemptSocketCandidates:()=>connection.promise,attachSocket:()=>attached++,scheduleReconnect:()=>{}});
  context.connectRealtime(); state.pageDeparted=true;state.mediaEpoch++;
  connection.resolve({socket:{close:()=>closed++}});
  await new Promise(r=>setImmediate(r)); assert.equal(closed,1);assert.equal(attached,0);
});
test('parent stops and unloads call iframe when changing site section', () => {
  const re=/        function unloadServiceFrame\(section\) \{[\s\S]*?(?=\n        function )/;
  const fn=home.match(re)?.[0]; assert.ok(fn);
  const actions=[];
  const frame={dataset:{unload:'1'},getAttribute:()=> 'call.html',contentWindow:{stopCallForNavigation:()=>actions.push('stop'),postMessage:()=>actions.push('message')},removeAttribute:n=>actions.push(n)};
  const section={id:'svc_call',classList:{contains:()=>true},querySelector:()=>frame};
  const pending=new Set([section]);
  const context=vm.createContext({isEmbeddedInputFrameActive:()=>false,pendingServiceFrameEnsureSections:pending,window:{location:{origin:'https://киносреда.рф'}}});
  vm.runInContext(fn,context); context.unloadServiceFrame(section);
  assert.deepEqual(actions,['stop','message','src']);assert.equal(pending.has(section),false);
});
