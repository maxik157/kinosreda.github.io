(function installFirebaseRtdbRfBypass() {
  if (typeof window === 'undefined') return;
  if (window.__KINOSREDA_RTDB_RF_BYPASS_INSTALLED__) return;
  window.__KINOSREDA_RTDB_RF_BYPASS_INSTALLED__ = true;

  var TARGET_NS = 'kinosreda-ce8ef-default-rtdb';
  var CANONICAL_RTDB_HOST = 'kinosreda-ce8ef-default-rtdb.europe-west1.firebasedatabase.app';
  var BYPASS_VERSION = '2026-03-03-fix-planning-ws-constants';
  var RTDB_SUFFIX = '.firebasedatabase.app';
  var FIREBASEIO_SUFFIX = '.firebaseio.com';
  var RTDB_PROXY_PATH = '/firebase-rtdb';
  var proxyBaseCandidates = [];

  function addProxyBase(value) {
    var raw = String(value || '').trim();
    if (!raw) return;
    var normalized = raw.replace(/\/+$/, '');
    if (!normalized) return;
    if (proxyBaseCandidates.indexOf(normalized) === -1) {
      proxyBaseCandidates.push(normalized);
    }
  }

  addProxyBase(window.KINOSREDA_RTDB_PROXY_BASE);
  if (window.location && window.location.origin) {
    var currentHost = String(window.location.hostname || '').toLowerCase();
    if (currentHost.indexOf('realtime.') === 0) {
      addProxyBase(String(window.location.origin || '') + RTDB_PROXY_PATH);
    }
  }
  addProxyBase('https://realtime.киносреда.рф/firebase-rtdb');
  addProxyBase('https://realtime.xn--80ahcljthqi.xn--p1ai/firebase-rtdb');

  var activeProxyBase = proxyBaseCandidates.length ? proxyBaseCandidates[0] : '';

  function toUrl(raw) {
    try {
      return new URL(String(raw || ''), window.location.href);
    } catch (_) {
      return null;
    }
  }

  function isProxyUrl(urlObj) {
    if (!activeProxyBase || !urlObj || !urlObj.hostname) return false;
    var proxyUrl = toUrl(activeProxyBase);
    if (!proxyUrl) return false;
    var proxyHost = String(proxyUrl.hostname || '').toLowerCase();
    var proxyPath = String(proxyUrl.pathname || '').replace(/\/+$/, '');
    var host = String(urlObj.hostname || '').toLowerCase();
    var path = String(urlObj.pathname || '');
    if (host !== proxyHost) return false;
    return path === proxyPath || path.indexOf(proxyPath + '/') === 0;
  }

  function shouldRewrite(urlObj) {
    if (!urlObj || !urlObj.hostname) return false;
    if (isProxyUrl(urlObj)) return false;

    var host = String(urlObj.hostname || '').toLowerCase();
    var isRtdbHost = host.endsWith(RTDB_SUFFIX) || host.endsWith(FIREBASEIO_SUFFIX);
    if (!isRtdbHost) return false;

    var ns = String(urlObj.searchParams.get('ns') || '').toLowerCase();
    if (ns && ns !== TARGET_NS) return false;

    if (host.startsWith('s-')) return true;
    if (host.indexOf('gke') !== -1 || host.indexOf('-nssi') !== -1 || host.indexOf('-nss') !== -1) return true;
    if (ns === TARGET_NS) return true;
    if (host === CANONICAL_RTDB_HOST) return true;

    return false;
  }

  function buildProxyUrl(urlObj) {
    if (!activeProxyBase) return null;
    var proxyUrl = toUrl(activeProxyBase);
    if (!proxyUrl) return null;

    var basePath = String(proxyUrl.pathname || '').replace(/\/+$/, '');
    var sourcePath = String(urlObj.pathname || '/');
    if (!sourcePath.startsWith('/')) sourcePath = '/' + sourcePath;

    proxyUrl.pathname = (basePath + sourcePath).replace(/\/{2,}/g, '/');
    proxyUrl.search = String(urlObj.search || '');
    proxyUrl.searchParams.set('ns', TARGET_NS);
    return proxyUrl.toString();
  }

  function rewriteUrl(raw) {
    var urlObj = toUrl(raw);
    if (!shouldRewrite(urlObj)) return null;

    var proxied = buildProxyUrl(urlObj);
    if (proxied) return proxied;

    urlObj.hostname = CANONICAL_RTDB_HOST;
    urlObj.searchParams.set('ns', TARGET_NS);
    return String(urlObj.toString() || '');
  }

  function patchFetchIn(targetWin) {
    if (!targetWin || typeof targetWin.fetch !== 'function') return;
    if (targetWin.__KINOSREDA_RTDB_FETCH_PATCHED__) return;
    var nativeFetch = targetWin.fetch.bind(targetWin);
    targetWin.fetch = function patchedFetch(input, init) {
      try {
        if (typeof input === 'string' || input instanceof URL) {
          var rewrittenString = rewriteUrl(String(input));
          if (rewrittenString) return nativeFetch(rewrittenString, init);
        }

        var ReqCtor = targetWin.Request || (typeof Request !== 'undefined' ? Request : null);
        if (ReqCtor && input instanceof ReqCtor) {
          var rewrittenRequestUrl = rewriteUrl(input.url);
          if (rewrittenRequestUrl) {
            var rewrittenRequest = new ReqCtor(rewrittenRequestUrl, input);
            return nativeFetch(rewrittenRequest, init);
          }
        }
      } catch (_) {}
      return nativeFetch(input, init);
    };
    targetWin.__KINOSREDA_RTDB_FETCH_PATCHED__ = true;
  }

  function patchXhrIn(targetWin) {
    if (!targetWin || typeof targetWin.XMLHttpRequest === 'undefined') return;
    var proto = targetWin.XMLHttpRequest && targetWin.XMLHttpRequest.prototype;
    if (!proto || proto.__KINOSREDA_RTDB_XHR_PATCHED__) return;
    var nativeOpen = proto.open;
    proto.open = function patchedOpen(method, url) {
      try {
        var rewritten = rewriteUrl(url);
        if (rewritten) {
          arguments[1] = rewritten;
        }
      } catch (_) {}
      return nativeOpen.apply(this, arguments);
    };
    proto.__KINOSREDA_RTDB_XHR_PATCHED__ = true;
  }

  function patchElementSrcSetter(ElementCtor) {
    if (typeof ElementCtor === 'undefined' || !ElementCtor.prototype) return;
    var proto = ElementCtor.prototype;
    if (proto.__KINOSREDA_RTDB_SRC_PATCHED__) return;

    var srcDescriptor = Object.getOwnPropertyDescriptor(proto, 'src');
    if (srcDescriptor && typeof srcDescriptor.get === 'function' && typeof srcDescriptor.set === 'function') {
      try {
        Object.defineProperty(proto, 'src', {
          configurable: true,
          enumerable: srcDescriptor.enumerable,
          get: function getSrc() {
            return srcDescriptor.get.call(this);
          },
          set: function setSrc(value) {
            var rewritten = rewriteUrl(value);
            return srcDescriptor.set.call(this, rewritten || value);
          }
        });
      } catch (_) {}
    }

    if (typeof proto.setAttribute === 'function') {
      var nativeSetAttribute = proto.setAttribute;
      proto.setAttribute = function patchedSetAttribute(name, value) {
        try {
          if (String(name || '').toLowerCase() === 'src') {
            var rewritten = rewriteUrl(value);
            if (rewritten) value = rewritten;
          }
        } catch (_) {}
        return nativeSetAttribute.call(this, name, value);
      };
    }

    proto.__KINOSREDA_RTDB_SRC_PATCHED__ = true;
  }

  function patchDomSrcRoutingIn(targetWin) {
    if (!targetWin) return;
    patchElementSrcSetter(typeof targetWin.HTMLScriptElement === 'function' ? targetWin.HTMLScriptElement : undefined);
    patchElementSrcSetter(typeof targetWin.HTMLIFrameElement === 'function' ? targetWin.HTMLIFrameElement : undefined);
  }

  function patchWebSocketIn(targetWin) {
    if (!targetWin || typeof targetWin.WebSocket !== 'function') return;
    if (targetWin.__KINOSREDA_RTDB_WS_PATCHED__) return;

    var NativeWebSocket = targetWin.WebSocket;

    function PatchedWebSocket(url, protocols) {
      var finalUrl = url;
      try {
        var rewritten = rewriteUrl(url);
        if (rewritten) {
          finalUrl = rewritten.replace(/^https:/i, 'wss:').replace(/^http:/i, 'ws:');
        }
      } catch (_) {}
      if (protocols === undefined) return new NativeWebSocket(finalUrl);
      return new NativeWebSocket(finalUrl, protocols);
    }

    PatchedWebSocket.prototype = NativeWebSocket.prototype;
    try {
      Object.setPrototypeOf(PatchedWebSocket, NativeWebSocket);
    } catch (_) {}
    var wsStateFallback = {
      CONNECTING: 0,
      OPEN: 1,
      CLOSING: 2,
      CLOSED: 3
    };
    ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED'].forEach(function (key) {
      var stateValue = Number(NativeWebSocket[key]);
      if (!Number.isFinite(stateValue)) {
        stateValue = wsStateFallback[key];
      }
      try {
        Object.defineProperty(PatchedWebSocket, key, {
          configurable: true,
          enumerable: true,
          writable: false,
          value: stateValue
        });
      } catch (_) {
        PatchedWebSocket[key] = stateValue;
      }
      try {
        Object.defineProperty(PatchedWebSocket.prototype, key, {
          configurable: true,
          enumerable: true,
          writable: false,
          value: stateValue
        });
      } catch (_) {}
    });

    targetWin.WebSocket = PatchedWebSocket;
    targetWin.__KINOSREDA_RTDB_WS_PATCHED__ = true;
  }

  function patchWindowOpenIn(targetWin) {
    if (!targetWin || typeof targetWin.open !== 'function') return;
    if (targetWin.__KINOSREDA_RTDB_OPEN_PATCHED__) return;
    var nativeOpen = targetWin.open.bind(targetWin);
    targetWin.open = function patchedWindowOpen(url, name, specs) {
      try {
        var rewritten = rewriteUrl(url);
        if (rewritten) return nativeOpen(rewritten, name, specs);
      } catch (_) {}
      return nativeOpen(url, name, specs);
    };
    targetWin.__KINOSREDA_RTDB_OPEN_PATCHED__ = true;
  }

  function getSameOriginWindowFromIframe(iframeEl) {
    try {
      if (!iframeEl || !iframeEl.contentWindow) return null;
      var frameWin = iframeEl.contentWindow;
      if (!frameWin || !frameWin.location) return null;
      // Access check for cross-origin frames.
      var _ = frameWin.location.href;
      return frameWin;
    } catch (_) {
      return null;
    }
  }

  function patchIframeElement(iframeEl) {
    if (!iframeEl) return;

    try {
      if (!iframeEl.__KINOSREDA_RTDB_IFRAME_HOOKED__) {
        iframeEl.__KINOSREDA_RTDB_IFRAME_HOOKED__ = true;
        iframeEl.addEventListener('load', function () {
          var frameWinOnLoad = getSameOriginWindowFromIframe(iframeEl);
          if (frameWinOnLoad) applyRuntimePatches(frameWinOnLoad);
        });
      }
    } catch (_) {}

    var frameWin = getSameOriginWindowFromIframe(iframeEl);
    if (frameWin) applyRuntimePatches(frameWin);
  }

  function patchCreateElementForSrcIn(targetWin) {
    if (!targetWin || !targetWin.document || typeof targetWin.document.createElement !== 'function') return;
    var doc = targetWin.document;
    if (doc.__KINOSREDA_RTDB_CREATE_EL_PATCHED__) return;

    var nativeCreateElement = doc.createElement.bind(doc);
    doc.createElement = function patchedCreateElement(tagName) {
      var element = nativeCreateElement(tagName);
      try {
        var tag = String(tagName || '').toLowerCase();
        if (tag === 'script' || tag === 'iframe') {
          var nativeSetAttribute = element.setAttribute;
          if (typeof nativeSetAttribute === 'function') {
            element.setAttribute = function patchedSetAttribute(name, value) {
              if (String(name || '').toLowerCase() === 'src') {
                var rewritten = rewriteUrl(value);
                if (rewritten) value = rewritten;
              }
              return nativeSetAttribute.call(this, name, value);
            };
          }
        }

        if (tag === 'iframe') {
          try {
            setTimeout(function () { patchIframeElement(element); }, 0);
            setTimeout(function () { patchIframeElement(element); }, 50);
            setTimeout(function () { patchIframeElement(element); }, 200);
          } catch (_) {}
        }
      } catch (_) {}
      return element;
    };

    doc.__KINOSREDA_RTDB_CREATE_EL_PATCHED__ = true;
  }

  function patchFrameAttachmentIn(targetWin) {
    if (!targetWin || !targetWin.Node || !targetWin.Node.prototype) return;
    var proto = targetWin.Node.prototype;
    if (proto.__KINOSREDA_RTDB_NODE_PATCHED__) return;

    function handleMaybeFrame(node) {
      try {
        if (!node || !node.tagName) return;
        var tag = String(node.tagName || '').toLowerCase();
        if (tag === 'iframe') {
          patchIframeElement(node);
        }
        if (typeof node.querySelectorAll === 'function') {
          var nested = node.querySelectorAll('iframe');
          for (var i = 0; i < nested.length; i += 1) {
            patchIframeElement(nested[i]);
          }
        }
      } catch (_) {}
    }

    var nativeAppendChild = proto.appendChild;
    proto.appendChild = function patchedAppendChild(node) {
      var out = nativeAppendChild.apply(this, arguments);
      handleMaybeFrame(node);
      return out;
    };

    var nativeInsertBefore = proto.insertBefore;
    proto.insertBefore = function patchedInsertBefore(node) {
      var out = nativeInsertBefore.apply(this, arguments);
      handleMaybeFrame(node);
      return out;
    };

    var nativeReplaceChild = proto.replaceChild;
    proto.replaceChild = function patchedReplaceChild(node) {
      var out = nativeReplaceChild.apply(this, arguments);
      handleMaybeFrame(node);
      return out;
    };

    proto.__KINOSREDA_RTDB_NODE_PATCHED__ = true;
  }

  function scanAndPatchIframesIn(targetWin) {
    if (!targetWin || !targetWin.document) return;
    try {
      var list = targetWin.document.querySelectorAll('iframe');
      for (var i = 0; i < list.length; i += 1) {
        patchIframeElement(list[i]);
      }
    } catch (_) {}
  }

  function applyRuntimePatches(targetWin) {
    if (!targetWin) return;
    if (targetWin.__KINOSREDA_RTDB_RUNTIME_PATCHED__) return;

    patchFetchIn(targetWin);
    patchXhrIn(targetWin);
    patchDomSrcRoutingIn(targetWin);
    patchCreateElementForSrcIn(targetWin);
    patchFrameAttachmentIn(targetWin);
    patchWindowOpenIn(targetWin);
    patchWebSocketIn(targetWin);
    scanAndPatchIframesIn(targetWin);

    targetWin.__KINOSREDA_RTDB_RUNTIME_PATCHED__ = true;
  }

  function startIframePatchLoop() {
    var ticks = 0;
    var maxTicks = 180;

    (function loop() {
      ticks += 1;
      applyRuntimePatches(window);
      scanAndPatchIframesIn(window);

      if (ticks >= maxTicks) return;
      try {
        setTimeout(loop, 250);
      } catch (_) {}
    })();
  }

  function applyLongPollingPatch() {
    try {
      if (!window.firebase || !firebase.database || !firebase.database.INTERNAL) return false;
      var internal = firebase.database.INTERNAL;
      var nativeForceLongPolling = typeof internal.forceLongPolling === 'function'
        ? internal.forceLongPolling.bind(internal)
        : null;
      if (!nativeForceLongPolling) return false;

      nativeForceLongPolling();

      if (typeof internal.forceWebSockets === 'function') {
        internal.forceWebSockets = function forceWebSocketsPatched() {
          nativeForceLongPolling();
        };
      }
      return true;
    } catch (_) {
      return false;
    }
  }

  function scheduleLongPollingPatch(timeoutMs) {
    var startedAt = Date.now();
    var maxDuration = Math.max(5000, Number(timeoutMs) || 20000);

    (function tick() {
      if (applyLongPollingPatch()) return;
      if ((Date.now() - startedAt) >= maxDuration) return;
      try {
        setTimeout(tick, 300);
      } catch (_) {}
    })();
  }

  function hookFirebaseInitializeApp() {
    try {
      if (!window.firebase || typeof firebase.initializeApp !== 'function') return;
      if (firebase.__KINOSREDA_RTDB_INIT_HOOKED__) return;
      var nativeInitializeApp = firebase.initializeApp.bind(firebase);
      firebase.initializeApp = function patchedInitializeApp() {
        var app = nativeInitializeApp.apply(firebase, arguments);
        scheduleLongPollingPatch(60000);
        return app;
      };
      firebase.__KINOSREDA_RTDB_INIT_HOOKED__ = true;
    } catch (_) {}
  }

  function patchFirebaseDatabaseAccessor() {
    try {
      if (!window.firebase || typeof firebase.database !== 'function') return;
      if (firebase.__KINOSREDA_RTDB_DATABASE_HOOKED__) return;

      var nativeDatabase = firebase.database.bind(firebase);
      firebase.database = function patchedDatabase() {
        scheduleLongPollingPatch(30000);
        return nativeDatabase.apply(firebase, arguments);
      };

      var staticKeys = Object.getOwnPropertyNames(nativeDatabase);
      staticKeys.forEach(function (key) {
        if (key === 'length' || key === 'name' || key === 'prototype') return;
        try {
          firebase.database[key] = nativeDatabase[key];
        } catch (_) {}
      });

      firebase.__KINOSREDA_RTDB_DATABASE_HOOKED__ = true;
    } catch (_) {}
  }

  function bootstrapFirebaseTransportGuards() {
    scheduleLongPollingPatch(60000);
    hookFirebaseInitializeApp();
    patchFirebaseDatabaseAccessor();

    var retries = 0;
    var maxRetries = 100;
    (function retryHooks() {
      retries += 1;
      hookFirebaseInitializeApp();
      patchFirebaseDatabaseAccessor();
      scheduleLongPollingPatch(20000);
      if (retries >= maxRetries) return;
      try {
        setTimeout(retryHooks, 500);
      } catch (_) {}
    })();
  }

  applyRuntimePatches(window);
  startIframePatchLoop();
  bootstrapFirebaseTransportGuards();

  window.__KINOSREDA_RTDB_RF_BYPASS__ = {
    version: BYPASS_VERSION,
    activeProxyBase: activeProxyBase,
    targetHost: CANONICAL_RTDB_HOST,
    targetNs: TARGET_NS,
    rewriteUrl: rewriteUrl,
    setProxyBase: function setProxyBase(nextBase) {
      var parsed = toUrl(nextBase);
      if (!parsed) return false;
      activeProxyBase = String(nextBase || '').replace(/\/+$/, '');
      return true;
    }
  };
})();
