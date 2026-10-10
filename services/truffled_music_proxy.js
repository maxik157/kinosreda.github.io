"use strict";
const https = require("node:https");
const { Transform } = require("node:stream");

const ORIGIN = "https://truffled.lol";
const PREFIX = "/truffled-music";
const agent = new https.Agent({
  keepAlive: true,
  maxSockets: 12,
  maxFreeSockets: 4,
});
const API_ROUTES =
  /^(?:search|chart|albums|recommendations|artwork)$|^(?:source|alternate|tracks|albums)\/[A-Za-z0-9_-]{1,160}$|^(?:media|hls)\/[A-Za-z0-9_./-]{1,200}$/;
const IMAGE_HOSTS =
  /^(?:[a-z0-9-]+\.)*(?:googleusercontent\.com|ytimg\.com|ggpht\.com)$/i;
const MAX_JSON = 2 * 1024 * 1024;
const MAX_MANIFEST = 256 * 1024;

function upstreamPathFor(url) {
  if (!url.pathname.startsWith(PREFIX + "/")) return null;
  const route = url.pathname.slice(PREFIX.length + 1);
  if (!API_ROUTES.test(route) || route.includes("..") || /%|\\/.test(route))
    return null;
  const query = new URLSearchParams();
  const allowed =
    route === "search" || route === "albums"
      ? ["q", "cursor"]
      : route === "recommendations"
        ? ["seed"]
        : route.startsWith("source/")
          ? ["fresh", "choice", "prefer"]
          : route === "artwork"
            ? ["url"]
            : [];
  for (const key of allowed) {
    const value = url.searchParams.get(key);
    if (!value) continue;
    if (value.length > (key === "cursor" || key === "url" ? 3000 : 200))
      return null;
    query.set(key, value);
  }
  if (route === "artwork") {
    try {
      const image = new URL(query.get("url"));
      if (
        image.protocol !== "https:" ||
        image.port ||
        image.username ||
        image.password ||
        !IMAGE_HOSTS.test(image.hostname)
      )
        return null;
    } catch (_) {
      return null;
    }
  }
  return "/api/music/" + route + (query.size ? "?" + query : "");
}

function localUrl(raw, base = "/api/music/") {
  let parsed;
  try {
    parsed = new URL(raw, new URL(base, ORIGIN));
  } catch (_) {
    return null;
  }
  if (parsed.origin !== ORIGIN || !parsed.pathname.startsWith("/api/music/"))
    return null;
  const mapped = new URL(
    "http://localhost" +
      PREFIX +
      parsed.pathname.slice("/api/music".length) +
      parsed.search,
  );
  return upstreamPathFor(mapped) ? mapped.pathname + mapped.search : null;
}

function rewriteData(data) {
  if (Array.isArray(data)) return data.map(rewriteData);
  if (!data || typeof data !== "object") return data;
  const result = {};
  for (const [key, value] of Object.entries(data)) {
    if (["permalink", "stream"].includes(key)) continue;
    if (typeof value === "string" && ["cover", "art", "url"].includes(key)) {
      result[key] =
        localUrl(value) ||
        (key === "url" ? "" : value.startsWith("/api/music/") ? "" : value);
    } else result[key] = rewriteData(value);
  }
  return result;
}

function rewriteManifest(body, base) {
  return body
    .split(/\r?\n/)
    .map((line) => {
      if (!line || (line.startsWith("#") && !line.includes('URI="')))
        return line;
      const resolve = (raw) => {
        const mapped = localUrl(raw, base);
        if (!mapped) throw new Error("unsupported_manifest_url");
        return mapped;
      };
      return line.startsWith("#")
        ? line.replace(/URI="([^"]+)"/g, (_, raw) => `URI="${resolve(raw)}"`)
        : resolve(line);
    })
    .join("\n");
}

function createTruffledMusicProxy({
  request = https.request,
  timeoutMs = 60_000,
  cacheTtlMs = 60_000,
} = {}) {
  const cache = new Map();
  function handle(url, req, res, cors = {}) {
    const respond = (status, payload) => {
      if (res.destroyed || res.writableEnded) return;
      if (res.headersSent) {
        res.destroy();
        return;
      }
      res.writeHead(status, {
        ...cors,
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
      });
      res.end(JSON.stringify(payload));
    };
    if (!["GET", "HEAD"].includes(req.method))
      return respond(405, { error: "method_not_allowed" });
    const path = upstreamPathFor(url);
    if (!path) return respond(400, { error: "invalid_music_path" });
    const isMedia = /\/api\/music\/(media|hls)\//.test(path);
    const isArtwork = path.startsWith("/api/music/artwork");
    const canCache =
      !isMedia && !isArtwork && !/\/(source|alternate)\//.test(path);
    const hit = cache.get(path);
    if (canCache && hit && hit.until > Date.now()) {
      res.writeHead(200, {
        ...cors,
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "private, max-age=30",
      });
      return res.end(req.method === "HEAD" ? undefined : hit.body);
    }
    let upstreamResponse;
    const upstream = request(
      new URL(path, ORIGIN),
      {
        method: req.method,
        agent,
        family: 4,
        headers: {
          Accept: "*/*",
          "User-Agent": "Kinosreda/1.0",
          ...(req.headers.range ? { Range: req.headers.range } : {}),
        },
        timeout: timeoutMs,
      },
      (response) => {
        upstreamResponse = response;
        const status = response.statusCode || 502;
        if (status >= 300 && status < 400) {
          response.resume();
          respond(502, { error: "unexpected_upstream_redirect" });
          return;
        }
        const type = String(response.headers["content-type"] || "");
        const isJson = type.includes("application/json");
        const isManifest = /mpegurl/i.test(type);
        if (
          !isJson &&
          !isManifest &&
          !isMedia &&
          !isArtwork &&
          req.method !== "HEAD"
        ) {
          response.resume();
          respond(502, { error: "invalid_upstream_response" });
          return;
        }
        const headers = {
          ...cors,
          "Cache-Control": "private, no-store",
          "X-Content-Type-Options": "nosniff",
        };
        for (const key of [
          "content-type",
          "content-length",
          "content-range",
          "accept-ranges",
          "etag",
          "last-modified",
          "content-disposition",
        ]) {
          if (response.headers[key]) headers[key] = response.headers[key];
        }
        if (req.method === "HEAD") {
          res.writeHead(status, headers);
          res.end();
          response.resume();
          return;
        }
        response.on("error", () =>
          respond(502, { error: "upstream_read_failed" }),
        );
        if (isJson || isManifest) {
          const chunks = [];
          let bytes = 0;
          response.on("data", (chunk) => {
            bytes += chunk.length;
            if (bytes > (isManifest ? MAX_MANIFEST : MAX_JSON)) {
              respond(502, { error: "upstream_response_too_large" });
              upstream.destroy();
              return;
            }
            chunks.push(chunk);
          });
          response.on("end", () => {
            if (res.destroyed || res.writableEnded) return;
            try {
              const raw = Buffer.concat(chunks).toString("utf8");
              const body = isManifest
                ? rewriteManifest(raw, path)
                : JSON.stringify(rewriteData(JSON.parse(raw)));
              if (status >= 200 && status < 300 && isJson) {
                const data = JSON.parse(body);
                if (
                  path.startsWith("/api/music/source/") &&
                  !localUrl(data.url.replace(PREFIX, "/api/music"))
                ) {
                  respond(502, { error: "invalid_audio_source" });
                  return;
                }
                if (canCache) {
                  cache.set(path, { body, until: Date.now() + cacheTtlMs });
                  while (cache.size > 100)
                    cache.delete(cache.keys().next().value);
                }
              }
              delete headers["content-length"];
              res.writeHead(status, {
                ...headers,
                "Content-Length": Buffer.byteLength(body),
              });
              res.end(body);
            } catch (_) {
              respond(502, { error: "invalid_upstream_payload" });
            }
          });
        } else {
          // Stream bytes immediately; avoid loading a whole track into Node memory.
          let bytes = 0;
          const limit = isArtwork ? 8 * 1024 * 1024 : 128 * 1024 * 1024;
          const bounded = new Transform({
            transform(chunk, encoding, callback) {
              bytes += chunk.length;
              if (bytes > limit) callback(new Error("media_too_large"));
              else callback(null, chunk);
            },
          });
          bounded.on("error", () => {
            upstream.destroy();
            res.destroy();
          });
          res.writeHead(status, headers);
          response.pipe(bounded).pipe(res);
        }
      },
    );
    upstream.on("timeout", () => {
      respond(504, { error: "truffled_timeout" });
      upstream.destroy();
    });
    upstream.on("error", () => respond(502, { error: "truffled_unavailable" }));
    const cancel = () => {
      upstream.destroy();
      upstreamResponse?.destroy();
    };
    req.once("aborted", cancel);
    res.once("close", cancel);
    upstream.end();
  }
  return { handle };
}
module.exports = {
  createTruffledMusicProxy,
  upstreamPathFor,
  localUrl,
  rewriteData,
  rewriteManifest,
};
