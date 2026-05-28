/*!
 * Local cross-origin isolation helper for HoMM3.
 * Based on the MIT-licensed idea from gzuidhof/coi-serviceworker.
 */

let coepCredentialless = true;

function normalizePathname(pathname = "/") {
  const value = String(pathname || "/").trim() || "/";
  return value === "/" ? "/" : value.replace(/\/+$/, "");
}

function isHomm3IsolatedRoute(urlLike) {
  let url = null;
  try {
    url = urlLike instanceof URL ? urlLike : new URL(String(urlLike), self.location ? self.location.href : window.location.href);
  } catch (_) {
    return false;
  }

  const pathname = normalizePathname(url.pathname);
  if (pathname === "/homm3.html") {
    return true;
  }
  if (pathname === "/homm3-runtime/index.html" || pathname.startsWith("/homm3-runtime/")) {
    return true;
  }
  if (pathname === "/vendor/webtorrent.min.js") {
    return true;
  }
  if ((pathname === "/" || pathname === "/index.html") && url.searchParams.get("page") === "svc_homm3") {
    return true;
  }
  return false;
}

if (typeof window === "undefined") {
  self.addEventListener("install", () => self.skipWaiting());
  self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

  self.addEventListener("message", (event) => {
    if (!event.data) {
      return;
    }
    if (event.data.type === "deregister") {
      self.registration
        .unregister()
        .then(() => self.clients.matchAll())
        .then((clients) => {
          clients.forEach((client) => client.navigate(client.url));
        });
      return;
    }
    if (event.data.type === "coepCredentialless") {
      coepCredentialless = !!event.data.value;
    }
  });

  self.addEventListener("fetch", (event) => {
    const request = event.request;
    if (request.cache === "only-if-cached" && request.mode !== "same-origin") {
      return;
    }

    const url = new URL(request.url);
    const patchedRequest = coepCredentialless && request.mode === "no-cors"
      ? new Request(request, { credentials: "omit" })
      : request;

    event.respondWith(
      fetch(patchedRequest).then((response) => {
        if (response.status === 0 || !isHomm3IsolatedRoute(url)) {
          return response;
        }

        const headers = new Headers(response.headers);
        headers.set("Cross-Origin-Embedder-Policy", coepCredentialless ? "credentialless" : "require-corp");
        headers.set("Cross-Origin-Opener-Policy", "same-origin");
        headers.set("Origin-Agent-Cluster", "?1");
        if (!coepCredentialless) {
          headers.set("Cross-Origin-Resource-Policy", "cross-origin");
        }

        return new Response(response.body, {
          status: response.status,
          statusText: response.statusText,
          headers
        });
      })
    );
  });
} else {
  (() => {
    const reloadedBySelf = window.sessionStorage.getItem("coiReloadedBySelf");
    window.sessionStorage.removeItem("coiReloadedBySelf");
    const coepDegrading = reloadedBySelf === "coepdegrade";

    const shouldUseCoi = () => {
      const host = String(window.location.hostname || "").trim().toLowerCase();
      const isLoopback = host === "127.0.0.1" || host === "localhost" || host === "::1";
      return isLoopback && isHomm3IsolatedRoute(window.location.href);
    };

    const coi = {
      shouldRegister: () => shouldUseCoi(),
      shouldDeregister: () => !shouldUseCoi(),
      coepCredentialless: () => true,
      coepDegrade: () => true,
      doReload: () => window.location.reload(),
      quiet: true,
      ...window.coi
    };

    const n = navigator;
    const controlling = n.serviceWorker && n.serviceWorker.controller;

    if (controlling && coi.shouldRegister() && !window.crossOriginIsolated) {
      window.sessionStorage.setItem("coiCoepHasFailed", "true");
    }
    const coepHasFailed = window.sessionStorage.getItem("coiCoepHasFailed");

    if (controlling) {
      const reloadToDegrade = coi.shouldRegister() && coi.coepDegrade() && !(coepDegrading || window.crossOriginIsolated);
      n.serviceWorker.controller.postMessage({
        type: "coepCredentialless",
        value: (reloadToDegrade || (coepHasFailed && coi.coepDegrade()))
          ? false
          : coi.coepCredentialless()
      });

      if (reloadToDegrade) {
        window.sessionStorage.setItem("coiReloadedBySelf", "coepdegrade");
        coi.doReload("coepdegrade");
        return;
      }

      if (coi.shouldDeregister()) {
        n.serviceWorker.controller.postMessage({ type: "deregister" });
        return;
      }
    }

    if (window.crossOriginIsolated === true || !coi.shouldRegister()) {
      return;
    }
    if (!window.isSecureContext || !n.serviceWorker) {
      return;
    }

    n.serviceWorker.register(window.document.currentScript.src).then((registration) => {
      registration.addEventListener("updatefound", () => {
        window.sessionStorage.setItem("coiReloadedBySelf", "updatefound");
        coi.doReload("updatefound");
      });
      if (registration.active && !n.serviceWorker.controller) {
        window.sessionStorage.setItem("coiReloadedBySelf", "notcontrolling");
        coi.doReload("notcontrolling");
      }
    }).catch(() => {});
  })();
}
