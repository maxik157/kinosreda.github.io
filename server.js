const http = require('http');
const https = require('https');
const zlib = require('zlib');
const fs = require('fs');
const path = require('path');
const os = require('os');
const nodeCrypto = require('crypto');
const { spawn } = require('child_process');
const WebSocket = require('ws');
const sharp = require('sharp');
const worldEditorService=require('./services/beer_world_editor')(__dirname);
const worldTerrainPromise=import('./beer-room-terrain.mjs');let worldTerrain;worldTerrainPromise.then(api=>{worldTerrain=api;});
let worldProtocol,worldLayout;
const worldProtocolReady=import('./beer-room-world-state.mjs').then(async api=>{worldProtocol=api;worldLayout=api.restoreWorld(worldEditorService.read());worldTerrain=await worldTerrainPromise;worldTerrain.syncTerrainHeights(worldLayout.entries);});
const BeerFacts = require('./beer-facts');
const beerBackground = require('./services/beer_background');
const { createRecognition } = require('./services/beer_recognition');

// Lightweight .env loader (no external deps)
(() => {
  try {
    const envPath = path.join(__dirname, '.env');
    if (!fs.existsSync(envPath)) return;
    const content = fs.readFileSync(envPath, 'utf8');
    content.split('\n').forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return;
      const idx = trimmed.indexOf('=');
      if (idx === -1) return;
      const key = trimmed.slice(0, idx).trim();
      const value = trimmed.slice(idx + 1).trim();
      if (!key || Object.prototype.hasOwnProperty.call(process.env, key)) return;
      process.env[key] = value;
    });
  } catch (_) {}
})();

const STATE_TTL_SECONDS = 12;
const MAX_CHAT_SESSIONS = 200;
const MAX_CHAT_MESSAGES = 500;
const PLANNING_CURSOR_TTL_MS = Math.max(4000, Number(process.env.PLANNING_CURSOR_TTL_MS || 15000) || 15000);
const PLANNING_ACTION_LIMIT = Math.max(20, Number(process.env.PLANNING_ACTION_LIMIT || 120) || 120);
const PLANNING_ROOM_IDLE_MS = Math.max(30_000, Number(process.env.PLANNING_ROOM_IDLE_MS || 20 * 60 * 1000) || (20 * 60 * 1000));
const PUTER_PROXY_HOSTS = new Set([
  'puter.com',
  'js.puter.com',
  'api.puter.com',
  'assets.puter.com',
  'assets.puter.site'
]);
const EQUIPMENT_CATALOG_PROXY_HOSTS = new Set([
  'decathlon-usa.myshopify.com',
  'garage-grown-gear-dev.myshopify.com',
  'hyperlite.myshopify.com',
  'zpacks.myshopify.com',
  'gossamer-gear.myshopify.com',
  'outdoorvitals.myshopify.com',
  'six-moon-designs.myshopify.com',
  'pxqnfy-fs.myshopify.com',
  'e12f1b.myshopify.com',
  'qe10ec-cr.myshopify.com',
  'wildbounds.myshopify.com',
  'valleyandpeak-co-uk.myshopify.com',
  'kammok.myshopify.com',
  'durstongear.myshopify.com',
  'katabatic-gear.myshopify.com',
  'finsling.myshopify.com',
  'www-bigagnes-com.myshopify.com',
  'seatosummitusa.myshopify.com',
  'nashville-pack-and-equipment-company.myshopify.com',
  'storefeatheredfriends.myshopify.com',
  'ce6df2-8b.myshopify.com'
]);
const OPENFOODFACTS_BASE_URL = 'https://ru.openfoodfacts.org/cgi/search.pl';
const OPENFOODFACTS_SORT_BY = 'product_name';
const KINOPOISK_UNOFFICIAL_API_BASE = 'https://kinopoiskapiunofficial.tech';
const KINOPOISK_UNOFFICIAL_DAILY_LIMIT = Math.max(
  1,
  Number(process.env.KINOPOISK_UNOFFICIAL_DAILY_LIMIT || 500) || 500
);
const DEFAULT_KINOPOISK_UNOFFICIAL_API_KEYS = [
  '157601e2-4618-42d6-b65f-bffefb7714cd',
  'bbe5ad5e-8a05-4975-9c5c-c18a801207cd',
  '8f863797-1abf-4906-b627-0e9b3ccd8728',
  '37874394-a083-4bf8-b068-e428f6d61f13',
  '1c7eb825-c618-4a31-ade0-404eafe66bdf'
];
const KINOPOISK_UNOFFICIAL_API_KEYS = (() => {
  const fromEnv = String(
    process.env.KINOPOISK_UNOFFICIAL_API_KEYS
    || process.env.KINOPOISK_UNOFFICIAL_API_TOKEN
    || ''
  ).trim();
  const raw = fromEnv ? fromEnv.split(/[,\n;]+/g) : DEFAULT_KINOPOISK_UNOFFICIAL_API_KEYS;
  const seen = new Set();
  const keys = [];
  raw.forEach((item) => {
    const token = String(item || '').trim().replace(/[^\w-]/g, '');
    if (!token || seen.has(token)) return;
    seen.add(token);
    keys.push(token);
  });
  return keys;
})();
const kinopoiskUnofficialKeyState = {
  dayKey: '',
  activeIndex: 0,
  usage: new Map()
};
const FATSECRET_TOKEN_URL = 'https://oauth.fatsecret.com/connect/token';
const FATSECRET_SEARCH_URL = 'https://platform.fatsecret.com/rest/foods/search/v1';
const FATSECRET_FOOD_URL = 'https://platform.fatsecret.com/rest/food/v5';
const YANDEX_MUSIC_API_ORIGIN = process.env.YANDEX_MUSIC_API_ORIGIN || 'https://api.music.yandex.net';
const DEFAULT_YANDEX_MUSIC_TOKEN = 'y0__xCNnNMeGN74BiChnMyqFjD35puJCPKibaHUNGZzP4F5yir07oLgMEsh';
const YANDEX_MUSIC_SERVER_TOKEN = process.env.YANDEX_MUSIC_TOKEN || DEFAULT_YANDEX_MUSIC_TOKEN;
const YANDEX_MUSIC_CLIENT_HEADER = process.env.YANDEX_MUSIC_CLIENT_HEADER || 'YandexMusicAndroid/24023231';
const DEFAULT_YANDEX_OAUTH_CLIENT_ID = '3c6ee128ac25410685d426232c743093';
const DEFAULT_YANDEX_OAUTH_REDIRECT_URI = 'https://kinosreda.github.io/music.html';
const YANDEX_OAUTH_CLIENT_ID = process.env.YANDEX_OAUTH_CLIENT_ID || DEFAULT_YANDEX_OAUTH_CLIENT_ID;
const YANDEX_OAUTH_AUTHORIZE_URL = process.env.YANDEX_OAUTH_AUTHORIZE_URL || 'https://oauth.yandex.ru/authorize';
const YANDEX_OAUTH_REDIRECT_URI = process.env.YANDEX_OAUTH_REDIRECT_URI || DEFAULT_YANDEX_OAUTH_REDIRECT_URI;
const PYTHON_BIN = process.env.PYTHON_BIN || 'python3';
const YTMUSIC_BRIDGE_SCRIPT_ENV = String(process.env.YTMUSIC_BRIDGE_SCRIPT || '').trim();
const PUBLIC_BASE_URL = String(process.env.PUBLIC_BASE_URL || '').trim().replace(/\/+$/, '');
const LOCAL_SERVER_HOST = String(process.env.HOST || '127.0.0.1').trim() || '127.0.0.1';
const LOCAL_SERVER_PORT = Math.max(1, Number(process.env.PORT || 8090) || 8090);
const POSTIMAGES_API_ENDPOINT = String(process.env.POSTIMAGES_API_ENDPOINT || 'https://api.imageban.ru/v1').trim();
const IMAGE_PROXY_MAX_BODY_BYTES = Math.max(
  1_024_000,
  Number(process.env.IMAGE_PROXY_MAX_BODY_BYTES || (15 * 1024 * 1024)) || (15 * 1024 * 1024)
);
const IMAGE_PROXY_MAX_SOURCE_BYTES = Math.max(
  1_024_000,
  Number(process.env.IMAGE_PROXY_MAX_SOURCE_BYTES || (15 * 1024 * 1024)) || (15 * 1024 * 1024)
);
const SERPER_API_URL = 'https://google.serper.dev/images';
const SERPER_API_KEY = String(process.env.SERPER_API_KEY || '').trim();
const MAX_BEER_IMAGE_SEARCH_RESULTS = 8;
const MAX_BEER_IMAGE_SEARCH_QUERY_CHARS = 180;
const BEER_DATA_SEARCH_URL = 'https://r.jina.ai/http://html.duckduckgo.com/html/';
const BEER_DATA_CACHE_TTL_MS = 30 * 60 * 1000;
const BEER_DATA_CACHE_MAX_ITEMS = 300;
const beerDataSearchCache = new Map();
const beerDataSearchInflight = new Map();
const LOCAL_STATIC_MIME_TYPES = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.mjs', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.map', 'application/json; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.gif', 'image/gif'],
  ['.webp', 'image/webp'],
  ['.avif', 'image/avif'],
  ['.ico', 'image/x-icon'],
  ['.woff', 'font/woff'],
  ['.woff2', 'font/woff2'],
  ['.ttf', 'font/ttf'],
  ['.otf', 'font/otf'],
  ['.wasm', 'application/wasm'],
  ['.txt', 'text/plain; charset=utf-8'],
  ['.bin', 'application/octet-stream'],
  ['.mp3', 'audio/mpeg'],
  ['.mp4', 'video/mp4'],
  ['.webm', 'video/webm'],
  ['.glb', 'model/gltf-binary'],
  ['.gltf', 'model/gltf+json']
]);
const DEFAULT_YTM_PROXY_URL = '';
function isTruthyEnv(rawValue = '') {
  const value = String(rawValue || '').trim().toLowerCase();
  return ['1', 'true', 'yes', 'on'].includes(value);
}
function normalizeYtmEgressMode(rawValue = '') {
  const value = String(rawValue || '').trim().toLowerCase();
  if (['amneziawg', 'awg', 'wireguard', 'wg'].includes(value)) return 'amneziawg';
  if (['proxy', 'socks', 'socks5'].includes(value)) return 'proxy';
  if (['direct', 'none', 'off'].includes(value)) return 'direct';
  return '';
}
function normalizeProxyUrl(rawValue = '') {
  const raw = String(rawValue || '').trim();
  if (!raw) return '';
  const lowered = raw.toLowerCase();
  if (['direct', 'none', 'off', '-', '0', 'false'].includes(lowered)) return '';
  if (lowered.startsWith('socks5://')) return `socks5h://${raw.slice('socks5://'.length)}`;
  if (lowered.startsWith('socks4://')) return `socks4a://${raw.slice('socks4://'.length)}`;
  return raw;
}
function resolveAwgInterfaceName(rawValue = '') {
  const candidates = [];
  const pushCandidate = (value = '') => {
    const normalized = String(value || '').trim();
    if (!normalized || candidates.includes(normalized)) return;
    candidates.push(normalized);
  };
  pushCandidate(rawValue);
  pushCandidate(process.env.AWG_INTERFACE || '');
  pushCandidate(process.env.AMNEZIAWG_INTERFACE || '');
  pushCandidate('kinosreda-awg');
  pushCandidate('awg0');
  pushCandidate('amneziawg0');
  pushCandidate('wg0');

  for (const candidate of candidates) {
    try {
      if (fs.existsSync(path.join('/sys/class/net', candidate))) {
        return candidate;
      }
    } catch (_) {}
  }
  return String(rawValue || '').trim();
}
const YTM_EGRESS_MODE = normalizeYtmEgressMode(
  process.env.YTM_EGRESS_MODE || process.env.YTM_NETWORK_MODE || ''
);
const YTM_USE_AMNEZIAWG = (
  YTM_EGRESS_MODE === 'amneziawg'
  || isTruthyEnv(process.env.YTM_USE_AMNEZIAWG || '')
);
const YTM_AWG_INTERFACE = YTM_USE_AMNEZIAWG
  ? resolveAwgInterfaceName(process.env.YTM_AWG_INTERFACE || '')
  : '';
const YTM_AWG_SOURCE_IP = YTM_USE_AMNEZIAWG
  ? String(process.env.YTM_AWG_SOURCE_IP || process.env.YTM_EGRESS_SOURCE_IP || '').trim()
  : '';
const YTM_PROXY_URL = (
  YTM_USE_AMNEZIAWG
    ? ''
    : (
        normalizeProxyUrl(process.env.YTM_PROXY_URL || DEFAULT_YTM_PROXY_URL)
        || normalizeProxyUrl(process.env.YTM_DEFAULT_PROXY_URL || '')
        || normalizeProxyUrl(process.env.HTTPS_PROXY || process.env.https_proxy || '')
        || normalizeProxyUrl(process.env.HTTP_PROXY || process.env.http_proxy || '')
      )
);
const PROXY_ENV_KEYS = [
  'HTTP_PROXY',
  'HTTPS_PROXY',
  'ALL_PROXY',
  'http_proxy',
  'https_proxy',
  'all_proxy',
  'YTM_PROXY_URL',
  'YTM_DEFAULT_PROXY_URL',
  'YTM_FORCE_PROXY_ONLY',
  'YTM_ENABLE_DIRECT_FALLBACK'
];
function buildYtmExecEnv(envOverrides = null) {
  const env = { ...process.env };
  if (YTM_USE_AMNEZIAWG) {
    PROXY_ENV_KEYS.forEach((key) => {
      delete env[key];
    });
    env.YTM_EGRESS_MODE = 'amneziawg';
    env.YTM_USE_AMNEZIAWG = '1';
    env.YTM_PROXY_URL = 'direct';
    env.YTM_DEFAULT_PROXY_URL = '';
    env.YTM_FORCE_PROXY_ONLY = '0';
    env.YTM_ENABLE_DIRECT_FALLBACK = '0';
    if (YTM_AWG_INTERFACE) {
      env.YTM_AWG_INTERFACE = YTM_AWG_INTERFACE;
    }
  }
  if (envOverrides && typeof envOverrides === 'object') {
    Object.assign(env, envOverrides);
  }
  return env;
}

function guessImageContentType(rawUrl = '') {
  try {
    const parsed = new URL(String(rawUrl || ''));
    const pathname = String(parsed.pathname || '').toLowerCase();
    if (pathname.endsWith('.png')) return 'image/png';
    if (pathname.endsWith('.webp')) return 'image/webp';
    if (pathname.endsWith('.gif')) return 'image/gif';
    if (pathname.endsWith('.avif')) return 'image/avif';
    if (pathname.endsWith('.svg')) return 'image/svg+xml';
    if (pathname.endsWith('.jpg') || pathname.endsWith('.jpeg') || pathname.endsWith('.jfif')) return 'image/jpeg';
  } catch (_) {}
  return 'image/jpeg';
}
const HOST_CPU_COUNT = (() => {
  try {
    const count = Number(Array.isArray(os.cpus()) ? os.cpus().length : 0);
    return Number.isFinite(count) && count > 0 ? Math.floor(count) : 1;
  } catch (_) {
    return 1;
  }
})();
const HOST_TOTAL_MEM_BYTES = (() => {
  try {
    const value = Number(os.totalmem() || 0);
    return Number.isFinite(value) && value > 0 ? value : 0;
  } catch (_) {
    return 0;
  }
})();
const LOW_RESOURCE_HOST = (
  HOST_CPU_COUNT <= 1
  || (HOST_TOTAL_MEM_BYTES > 0 && HOST_TOTAL_MEM_BYTES <= (1536 * 1024 * 1024))
);
const DEFAULT_YTMUSIC_BRIDGE_MAX_CONCURRENCY = LOW_RESOURCE_HOST ? 2 : 4;
const DEFAULT_YTMUSIC_TRACK_BRIDGE_MAX_CONCURRENCY = LOW_RESOURCE_HOST ? 1 : 2;
const DEFAULT_YTMUSIC_STREAM_BRIDGE_MAX_CONCURRENCY = LOW_RESOURCE_HOST ? 1 : 2;
const DEFAULT_YTMUSIC_BRIDGE_MAX_QUEUE = LOW_RESOURCE_HOST ? 80 : 120;
const DEFAULT_YTMUSIC_TRACK_BRIDGE_MAX_QUEUE = LOW_RESOURCE_HOST ? 60 : 120;
const DEFAULT_YTMUSIC_STREAM_BRIDGE_MAX_QUEUE = LOW_RESOURCE_HOST ? 40 : 120;
const DEFAULT_FETCH_IMAGE_CURL_MAX_ACTIVE = LOW_RESOURCE_HOST ? 12 : 24;
const YTMUSIC_BRIDGE_TIMEOUT_MS = Math.max(2000, Number(process.env.YTMUSIC_BRIDGE_TIMEOUT_MS || 30000) || 30000);
const YTMUSIC_SEARCH_BRIDGE_TIMEOUT_MS = Math.max(
  5000,
  Number(process.env.YTMUSIC_SEARCH_BRIDGE_TIMEOUT_MS || 30000) || 30000
);
const YTMUSIC_STREAM_BRIDGE_TIMEOUT_MS = Math.max(
  YTMUSIC_BRIDGE_TIMEOUT_MS,
  Number(process.env.YTMUSIC_STREAM_BRIDGE_TIMEOUT_MS || 180000) || 180000
);
const YTMUSIC_STREAM_RESOLVE_TIMEOUT_MS = Math.max(
  5000,
  Number(process.env.YTMUSIC_STREAM_RESOLVE_TIMEOUT_MS || 18000) || 18000
);
const YTMUSIC_AUDIO_PROXY_TIMEOUT_MS = Math.max(
  300000,
  Number(process.env.YTMUSIC_AUDIO_PROXY_TIMEOUT_MS || 420000) || 420000
);
const YTMUSIC_AUDIO_RESOLVE_TIMEOUT_MS = Math.max(
  4000,
  Number(process.env.YTMUSIC_AUDIO_RESOLVE_TIMEOUT_MS || 12000) || 12000
);
const YTMUSIC_AUDIO_START_TIMEOUT_MS = Math.max(
  4000,
  Number(process.env.YTMUSIC_AUDIO_START_TIMEOUT_MS || 15000) || 15000
);
const YTMUSIC_CURL_CONNECT_TIMEOUT_SEC = Math.max(
  3,
  Number(process.env.YTMUSIC_CURL_CONNECT_TIMEOUT_SEC || 12) || 12
);
const YTMUSIC_STREAM_CACHE_TTL_MS = Math.max(
  10_000,
  Number(process.env.YTMUSIC_STREAM_CACHE_TTL_MS || 120_000) || 120_000
);
const YTMUSIC_STREAM_LINK_TTL_MS = Math.max(
  60_000,
  Number(process.env.YTMUSIC_STREAM_LINK_TTL_MS || 3_600_000) || 3_600_000
);
const YTMUSIC_STREAM_FALLBACK_CANDIDATES = Math.max(
  3,
  Number(process.env.YTMUSIC_STREAM_FALLBACK_CANDIDATES || 8) || 8
);
const YTMUSIC_STREAM_FAST_PROXY_TIMEOUT_MS = Math.max(
  3000,
  Number(process.env.YTMUSIC_STREAM_FAST_PROXY_TIMEOUT_MS || 9000) || 9000
);
const YTMUSIC_STREAM_FAST_DIRECT_TIMEOUT_MS = Math.max(
  3000,
  Number(process.env.YTMUSIC_STREAM_FAST_DIRECT_TIMEOUT_MS || 11000) || 11000
);
const YTMUSIC_DIRECT_MODE_COOLDOWN_MS = Math.max(
  15_000,
  Number(process.env.YTMUSIC_DIRECT_MODE_COOLDOWN_MS || 180_000) || 180_000
);
const YTMUSIC_TRACK_BRIDGE_TIMEOUT_MS = Math.max(
  4000,
  Number(process.env.YTMUSIC_TRACK_BRIDGE_TIMEOUT_MS || 15_000) || 15_000
);
const YTMUSIC_TRACK_CACHE_TTL_MS = Math.max(
  10_000,
  Number(process.env.YTMUSIC_TRACK_CACHE_TTL_MS || 10 * 60 * 1000) || (10 * 60 * 1000)
);
const YTMUSIC_TRACK_CACHE_MAX_ITEMS = Math.max(
  50,
  Number(process.env.YTMUSIC_TRACK_CACHE_MAX_ITEMS || 1500) || 1500
);
const YTMUSIC_BRIDGE_MAX_CONCURRENCY = Math.max(1, Math.min(
  LOW_RESOURCE_HOST ? 2 : 8,
  Number(process.env.YTMUSIC_BRIDGE_MAX_CONCURRENCY || DEFAULT_YTMUSIC_BRIDGE_MAX_CONCURRENCY) || DEFAULT_YTMUSIC_BRIDGE_MAX_CONCURRENCY
));
const YTMUSIC_TRACK_BRIDGE_MAX_CONCURRENCY = Math.max(1, Math.min(
  LOW_RESOURCE_HOST ? 1 : 4,
  Number(process.env.YTMUSIC_TRACK_BRIDGE_MAX_CONCURRENCY || DEFAULT_YTMUSIC_TRACK_BRIDGE_MAX_CONCURRENCY) || DEFAULT_YTMUSIC_TRACK_BRIDGE_MAX_CONCURRENCY
));
const YTMUSIC_STREAM_BRIDGE_MAX_CONCURRENCY = Math.max(1, Math.min(
  LOW_RESOURCE_HOST ? 1 : 4,
  Number(process.env.YTMUSIC_STREAM_BRIDGE_MAX_CONCURRENCY || DEFAULT_YTMUSIC_STREAM_BRIDGE_MAX_CONCURRENCY) || DEFAULT_YTMUSIC_STREAM_BRIDGE_MAX_CONCURRENCY
));
const YTMUSIC_BRIDGE_MAX_QUEUE = Math.max(1, Math.min(
  LOW_RESOURCE_HOST ? 120 : 500,
  Number(process.env.YTMUSIC_BRIDGE_MAX_QUEUE || DEFAULT_YTMUSIC_BRIDGE_MAX_QUEUE) || DEFAULT_YTMUSIC_BRIDGE_MAX_QUEUE
));
const YTMUSIC_TRACK_BRIDGE_MAX_QUEUE = Math.max(1, Math.min(
  LOW_RESOURCE_HOST ? 90 : 300,
  Number(process.env.YTMUSIC_TRACK_BRIDGE_MAX_QUEUE || DEFAULT_YTMUSIC_TRACK_BRIDGE_MAX_QUEUE) || DEFAULT_YTMUSIC_TRACK_BRIDGE_MAX_QUEUE
));
const YTMUSIC_STREAM_BRIDGE_MAX_QUEUE = Math.max(1, Math.min(
  LOW_RESOURCE_HOST ? 80 : 300,
  Number(process.env.YTMUSIC_STREAM_BRIDGE_MAX_QUEUE || DEFAULT_YTMUSIC_STREAM_BRIDGE_MAX_QUEUE) || DEFAULT_YTMUSIC_STREAM_BRIDGE_MAX_QUEUE
));
const YTMUSIC_BRIDGE_QUEUE_WAIT_MS = Math.max(
  1000,
  Number(process.env.YTMUSIC_BRIDGE_QUEUE_WAIT_MS || 10_000) || 10_000
);
const YTMUSIC_STREAM_BRIDGE_QUEUE_WAIT_MS = Math.max(
  YTMUSIC_BRIDGE_QUEUE_WAIT_MS,
  Math.min(
    30_000,
    Number(process.env.YTMUSIC_STREAM_BRIDGE_QUEUE_WAIT_MS || (LOW_RESOURCE_HOST ? 15_000 : 12_000)) || (LOW_RESOURCE_HOST ? 15_000 : 12_000)
  )
);
const FETCH_IMAGE_CACHE_TTL_MS = Math.max(
  5_000,
  Number(process.env.FETCH_IMAGE_CACHE_TTL_MS || 30 * 60 * 1000) || (30 * 60 * 1000)
);
const FETCH_IMAGE_CACHE_MAX_ITEMS = Math.max(
  50,
  Number(process.env.FETCH_IMAGE_CACHE_MAX_ITEMS || 1200) || 1200
);
const FETCH_IMAGE_CACHE_MAX_BYTES = Math.max(
  64 * 1024,
  Number(process.env.FETCH_IMAGE_CACHE_MAX_BYTES || 2_500_000) || 2_500_000
);
const FETCH_IMAGE_CURL_MAX_ACTIVE = Math.max(2, Math.min(
  LOW_RESOURCE_HOST ? 12 : 64,
  Number(process.env.FETCH_IMAGE_CURL_MAX_ACTIVE || DEFAULT_FETCH_IMAGE_CURL_MAX_ACTIVE) || DEFAULT_FETCH_IMAGE_CURL_MAX_ACTIVE
));
const GOOGLE_TRANSLATE_URL = 'https://translate.googleapis.com/translate_a/single';
const MYMEMORY_TRANSLATE_URL = 'https://api.mymemory.translated.net/get';
const LIBRE_TRANSLATE_URL = process.env.LIBRE_TRANSLATE_URL || 'https://libretranslate.com/translate';
const FATSECRET_CLIENT_ID = process.env.FATSECRET_CLIENT_ID || '35a99e6d7b8b43f98907bec6a695eb7c';
const FATSECRET_CLIENT_SECRET = process.env.FATSECRET_CLIENT_SECRET || '64650d81dfee477098c4f10c8cc77e25';
const FATSECRET_ACCESS_TOKEN = process.env.FATSECRET_ACCESS_TOKEN || '';
const FATSECRET_ACCESS_TOKEN_EXPIRES_IN = process.env.FATSECRET_ACCESS_TOKEN_EXPIRES_IN || '';
const FATSECRET_ACCESS_TOKEN_EXPIRES_AT = process.env.FATSECRET_ACCESS_TOKEN_EXPIRES_AT || '';
const FATSECRET_SCOPE = process.env.FATSECRET_SCOPE || 'premier';
const FATSECRET_REGION = process.env.FATSECRET_REGION || '';
const FATSECRET_LANGUAGE = process.env.FATSECRET_LANGUAGE || 'ru';
const FATSECRET_GENERIC_DESCRIPTION = process.env.FATSECRET_GENERIC_DESCRIPTION || 'weight';
const TRANSLATE_PROVIDER = process.env.TRANSLATE_PROVIDER || 'google';
const DEEPL_API_KEY = process.env.DEEPL_API_KEY || '';
const DEEPL_API_URL = process.env.DEEPL_API_URL || 'https://api-free.deepl.com/v2/translate';
const OPENFOODFACTS_CACHE_TTL_MS = 5 * 60 * 1000;
const openFoodFactsCache = new Map();
const openFoodFactsFilteredCache = new Map();
const fatSecretSearchCache = new Map();
const fatSecretFoodCache = new Map();
const FATSECRET_CACHE_TTL_MS = 120000;
const KINOBOX_UPSTREAM_URL = process.env.KINOBOX_UPSTREAM_URL || 'https://api.kinobox.tv/api/players';
const KINOBOX_PROXY_TIMEOUT_MS = Math.max(
  2500,
  Number(process.env.KINOBOX_PROXY_TIMEOUT_MS || 10000) || 10000
);
const KINOBOX_PROXY_CACHE_TTL_MS = Math.max(
  10_000,
  Number(process.env.KINOBOX_PROXY_CACHE_TTL_MS || 90_000) || 90_000
);
const KINOBOX_PROXY_STALE_TTL_MS = Math.max(
  KINOBOX_PROXY_CACHE_TTL_MS,
  Number(process.env.KINOBOX_PROXY_STALE_TTL_MS || 8 * 60 * 1000) || (8 * 60 * 1000)
);
const KINOBOX_PROXY_MAX_ITEMS = Math.max(
  100,
  Number(process.env.KINOBOX_PROXY_MAX_ITEMS || 2500) || 2500
);
const KINOBOX_PROXY_MAX_BODY_BYTES = Math.max(
  64 * 1024,
  Number(process.env.KINOBOX_PROXY_MAX_BODY_BYTES || 2_500_000) || 2_500_000
);
const KINOBOX_PROXY_RETRY_MAX = Math.max(
  1,
  Math.min(6, Number(process.env.KINOBOX_PROXY_RETRY_MAX || 3) || 3)
);
const KINOBOX_PROXY_RETRY_BASE_MS = Math.max(
  80,
  Number(process.env.KINOBOX_PROXY_RETRY_BASE_MS || 220) || 220
);
const KINOBOX_CURL_ENABLED = !['0', 'false', 'off'].includes(
  String(process.env.KINOBOX_CURL_ENABLED || '1').trim().toLowerCase()
);
const KINOBOX_COOKIE_ROTATE_BUCKETS = Math.max(
  1,
  Math.min(16, Number(process.env.KINOBOX_COOKIE_ROTATE_BUCKETS || 6) || 6)
);
const KINOBOX_COOKIE_BUCKET_TTL_MS = Math.max(
  60_000,
  Number(process.env.KINOBOX_COOKIE_BUCKET_TTL_MS || (20 * 60 * 1000)) || (20 * 60 * 1000)
);
const KINOBOX_COOKIE_JAR_DIR = process.env.KINOBOX_COOKIE_JAR_DIR || path.join(os.tmpdir(), 'kinobox-cookie-jars');
const KINOBOX_PROXY_POOL = (() => {
  const raw = String(process.env.KINOBOX_PROXY_POOL || '').trim();
  const rows = raw ? raw.split(/[\n,;]+/) : [];
  const set = new Set();
  set.add('direct');
  rows.forEach((item) => {
    const value = String(item || '').trim();
    if (!value) return;
    if (value.toLowerCase() === 'direct') {
      set.add('direct');
      return;
    }
    set.add(value);
  });
  return Array.from(set);
})();
const KINOBOX_PROXY_RATE_WINDOW_MS = Math.max(
  1_000,
  Number(process.env.KINOBOX_PROXY_RATE_WINDOW_MS || 12_000) || 12_000
);
const KINOBOX_PROXY_RATE_LIMIT_PER_IP = Math.max(
  5,
  Number(process.env.KINOBOX_PROXY_RATE_LIMIT_PER_IP || 80) || 80
);
const KINOBOX_ALLOWED_QUERY_KEYS = ['title', 'query', 'imdb', 'tmdb', 'kinopoisk'];
const KINOBOX_UA_POOL = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_7_2) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.3 Safari/605.1.15',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36'
];
const KINOBOX_ACCEPT_LANGUAGE_POOL = ['ru-RU,ru;q=0.9,en;q=0.8', 'ru,en-US;q=0.9,en;q=0.8'];
const ALLOHA_UPSTREAM_URL = process.env.ALLOHA_UPSTREAM_URL || 'https://api.alloha.tv/';
const ALLOHA_TOKEN = String(process.env.ALLOHA_TOKEN || 'd317441359e505c343c2063edc97e7').trim();
const ALLOHA_PROXY_TIMEOUT_MS = Math.max(
  2500,
  Number(process.env.ALLOHA_PROXY_TIMEOUT_MS || 12000) || 12000
);
const ALLOHA_PROXY_MAX_BODY_BYTES = Math.max(
  64 * 1024,
  Number(process.env.ALLOHA_PROXY_MAX_BODY_BYTES || 2_500_000) || 2_500_000
);
const ALLOHA_ALLOW_INSECURE_TLS = !['0', 'false', 'off'].includes(
  String(process.env.ALLOHA_ALLOW_INSECURE_TLS || '1').trim().toLowerCase()
);
const COLLAPS_UPSTREAM_URL = process.env.COLLAPS_UPSTREAM_URL || 'https://apicollaps.cc/list';
const COLLAPS_TOKEN = String(process.env.COLLAPS_TOKEN || 'eedefb541aeba871dcfc756e6b31c02e').trim();
const COLLAPS_PROXY_TIMEOUT_MS = Math.max(
  2500,
  Number(process.env.COLLAPS_PROXY_TIMEOUT_MS || 12000) || 12000
);
const COLLAPS_PROXY_MAX_BODY_BYTES = Math.max(
  64 * 1024,
  Number(process.env.COLLAPS_PROXY_MAX_BODY_BYTES || 2_500_000) || 2_500_000
);
const KINOBD_UPSTREAM_URL = process.env.KINOBD_UPSTREAM_URL || 'https://kinobd.net/api/player/search';
const KINOBD_PROXY_TIMEOUT_MS = Math.max(
  2500,
  Number(process.env.KINOBD_PROXY_TIMEOUT_MS || 12000) || 12000
);
const KINOBD_PROXY_MAX_BODY_BYTES = Math.max(
  64 * 1024,
  Number(process.env.KINOBD_PROXY_MAX_BODY_BYTES || 2_500_000) || 2_500_000
);
const ytmStreamCache = new Map();
const ytmStreamInflight = new Map();
const ytmStreamFastInflight = new Map();
const ytmTrackCache = new Map();
const ytmTrackInflight = new Map();
const ytmStreamLinkCache = new Map();
const ytmVideoLinkCache = new Map();
const fetchImageCache = new Map();
const kinoboxProxyCache = new Map();
const kinoboxProxyInflight = new Map();
const kinoboxProxyRate = new Map();
let fetchImageCurlActive = 0;
let ytmPreferDirectUntil = 0;
const LOCAL_STORE_MAP = {
  vv: 'ВкусВилл',
  lenta: 'Лента',
  magnit: 'Магнит',
  samokat: 'Самокат',
  pyatka: 'Пятерочка',
  perek: 'Перекресток'
};
const DEFAULT_LOCAL_FOODS_DIR = path.join(__dirname, 'data', 'foods');
const FALLBACK_LOCAL_FOODS_DIR = '/opt/kinosreda-realtime';
const LOCAL_FOODS_DIR = process.env.LOCAL_FOODS_DIR
  || (fs.existsSync(DEFAULT_LOCAL_FOODS_DIR)
    ? DEFAULT_LOCAL_FOODS_DIR
    : (fs.existsSync(FALLBACK_LOCAL_FOODS_DIR) ? FALLBACK_LOCAL_FOODS_DIR : DEFAULT_LOCAL_FOODS_DIR));
const LOCAL_FOODS_CACHE_TTL_MS = 5 * 60 * 1000;
let localFoodsCache = { items: [], search: [], loadedAt: 0, files: [] };
const TRANSLATION_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const translationCache = new Map();
let fatSecretToken = null;
let fatSecretTokenExpiresAt = 0;
let fatSecretTokenPromise = null;

if (FATSECRET_ACCESS_TOKEN) {
  fatSecretToken = FATSECRET_ACCESS_TOKEN;
  const expiresAt = parseInt(FATSECRET_ACCESS_TOKEN_EXPIRES_AT, 10);
  if (Number.isFinite(expiresAt) && expiresAt > 0) {
    fatSecretTokenExpiresAt = expiresAt;
  } else {
    const expiresIn = parseInt(FATSECRET_ACCESS_TOKEN_EXPIRES_IN, 10);
    if (Number.isFinite(expiresIn) && expiresIn > 0) {
      fatSecretTokenExpiresAt = Date.now() + (expiresIn * 1000);
    } else {
      fatSecretTokenExpiresAt = Date.now() + (55 * 60 * 1000);
    }
  }
}

const state = {
  users: new Map(),
  ladders: new Map(),
  boardScroll: { target: 0, updatedAt: Date.now() },
  beerAdd: { open: false, data: null, updatedAt: Date.now() },
  video: { url: '', time: 0, playing: false, open: false, updatedAt: Date.now() },
  wallDraw: { strokes: new Map(), texts: new Map() },
  light: { color: '#f5c15c', intensity: 3.2, spread: 0.85, off: false, updatedAt: Date.now() },
  chatRooms: new Map(),
  planningRooms: new Map(),
  beerRooms: new Map()
};

const STATE_FILE = process.env.REALTIME_STATE_PATH || path.join(__dirname, 'state.json');
const FIREBASE_RTDB_NAMESPACE = String(
  process.env.FIREBASE_RTDB_NAMESPACE || 'kinosreda-ce8ef-default-rtdb'
).trim();
const FIREBASE_RTDB_UPSTREAM_ORIGIN = String(
  process.env.FIREBASE_RTDB_UPSTREAM_ORIGIN
  || `https://${FIREBASE_RTDB_NAMESPACE}.europe-west1.firebasedatabase.app`
).trim().replace(/\/+$/, '');
const FIREBASE_RTDB_ROUTE_PREFIX = '/firebase-rtdb';
const HOMM3_STORAGE_ROOT = path.resolve(
  process.env.HOMM3_STORAGE_ROOT || path.join(__dirname, 'data', 'homm3-storage')
);
const HOMM3_STORAGE_MAX_BYTES = Math.max(
  32 * 1024 * 1024,
  Number(process.env.HOMM3_STORAGE_MAX_BYTES || (768 * 1024 * 1024)) || (768 * 1024 * 1024)
);
const HOMM3_BUNDLE_JS_BASE = String(
  process.env.HOMM3_BUNDLE_JS_BASE || 'https://sec.dos.zone/vcmi/dosvcmi-v8/'
).trim();
const HOMM3_BUNDLE_BINARY_BASE = String(
  process.env.HOMM3_BUNDLE_BINARY_BASE || 'https://br.cdn.dos.zone/vcmi/dosvcmi-v8/'
).trim();
const HOMM3_STORAGE_KINDS = new Set(['saves']);
const STALKER_STORAGE_ROOT = path.resolve(
  process.env.STALKER_STORAGE_ROOT || path.join(__dirname, 'data', 'stalker-storage')
);
const STALKER_STORAGE_MAX_FILE_BYTES = Math.max(
  1024 * 1024,
  Number(process.env.STALKER_STORAGE_MAX_FILE_BYTES || (64 * 1024 * 1024)) || (64 * 1024 * 1024)
);

function isAllowedPuterHost(hostname) {
  if (!hostname) return false;
  if (PUTER_PROXY_HOSTS.has(hostname)) return true;
  for (const host of PUTER_PROXY_HOSTS) {
    if (hostname.endsWith(`.${host}`)) return true;
  }
  return false;
}

function proxyRequest(targetUrl, req, res, corsHeaders) {
  let url;
  try {
    url = new URL(targetUrl);
  } catch (_) {
    res.writeHead(400, corsHeaders);
    res.end('invalid_url');
    return;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    res.writeHead(400, corsHeaders);
    res.end('invalid_protocol');
    return;
  }
  if (!isAllowedPuterHost(url.hostname)) {
    res.writeHead(403, corsHeaders);
    res.end('forbidden');
    return;
  }
  const client = url.protocol === 'https:' ? https : http;
  const headers = { ...req.headers };
  headers.host = url.host;
  headers.origin = url.origin;
  delete headers['accept-encoding'];

  const upstream = client.request(url, {
    method: req.method,
    headers
  }, (upres) => {
    const responseHeaders = {
      ...corsHeaders,
      'content-type': upres.headers['content-type'] || 'application/octet-stream'
    };
    res.writeHead(upres.statusCode || 502, responseHeaders);
    upres.pipe(res);
  });

  upstream.on('error', () => {
    res.writeHead(502, corsHeaders);
    res.end('proxy_error');
  });

  req.pipe(upstream);
}

const equipmentCatalogProxyCache = new Map();
const EQUIPMENT_CATALOG_PROXY_CACHE_TTL_MS = 2 * 60 * 1000;
const EQUIPMENT_CATALOG_PROXY_MAX_RESPONSE_BYTES = 2 * 1024 * 1024;

function proxyEquipmentCatalogRequest(urlObj, req, res, corsHeaders) {
  if (req.method !== 'POST') {
    writeJsonResponse(res, 405, corsHeaders, { ok: false, error: 'method_not_allowed' });
    return;
  }

  const endpointValue = String(urlObj.searchParams.get('endpoint') || '').trim();
  const token = String(urlObj.searchParams.get('token') || '').trim();
  const query = String(urlObj.searchParams.get('query') || '').trim();
  const variablesValue = String(urlObj.searchParams.get('variables') || '').trim();
  let variables = {};
  if (variablesValue) {
    try {
      variables = JSON.parse(variablesValue);
    } catch (_) {
      writeJsonResponse(res, 400, corsHeaders, { ok: false, error: 'invalid_catalog_variables' });
      return;
    }
  }
  let endpoint;
  try {
    endpoint = new URL(endpointValue);
  } catch (_) {
    writeJsonResponse(res, 400, corsHeaders, { ok: false, error: 'invalid_catalog_endpoint' });
    return;
  }

  if (endpoint.protocol !== 'https:'
    || !EQUIPMENT_CATALOG_PROXY_HOSTS.has(endpoint.hostname)
    || !endpoint.pathname.startsWith('/api/')) {
    writeJsonResponse(res, 403, corsHeaders, { ok: false, error: 'catalog_source_not_allowed' });
    return;
  }
  if (!/^[a-z0-9_-]{16,128}$/i.test(token) || !query || query.length > 12000 || variablesValue.length > 2000) {
    writeJsonResponse(res, 400, corsHeaders, { ok: false, error: 'invalid_catalog_request' });
    return;
  }

  const cacheKey = nodeCrypto.createHash('sha256').update(`${endpointValue}\n${token}\n${query}\n${JSON.stringify(variables)}`).digest('hex');
  const cached = equipmentCatalogProxyCache.get(cacheKey);
  if (cached && (Date.now() - cached.at) < EQUIPMENT_CATALOG_PROXY_CACHE_TTL_MS) {
    res.writeHead(cached.status, {
      ...corsHeaders,
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'public, max-age=60',
      'X-Gear-Catalog-Cache': 'hit'
    });
    res.end(cached.body);
    return;
  }

  const requestBody = Buffer.from(JSON.stringify({ query, variables }), 'utf8');
  const upstream = https.request(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': String(requestBody.length),
      'Accept': 'application/json',
      'User-Agent': 'KinosredaGearCatalog/1.0',
      'X-Shopify-Storefront-Access-Token': token
    },
    timeout: 18000
  }, (upres) => {
    const chunks = [];
    let size = 0;
    upres.on('data', (chunk) => {
      size += chunk.length;
      if (size > EQUIPMENT_CATALOG_PROXY_MAX_RESPONSE_BYTES) {
        upstream.destroy(new Error('catalog_response_too_large'));
        return;
      }
      chunks.push(chunk);
    });
    upres.on('end', () => {
      if (res.writableEnded) return;
      const body = Buffer.concat(chunks);
      const status = Number(upres.statusCode) || 502;
      if (status >= 200 && status < 300 && body.length) {
        equipmentCatalogProxyCache.set(cacheKey, { at: Date.now(), status, body });
        if (equipmentCatalogProxyCache.size > 500) equipmentCatalogProxyCache.clear();
      }
      res.writeHead(status, {
        ...corsHeaders,
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Gear-Catalog-Proxy': '1'
      });
      res.end(body);
    });
  });
  upstream.on('timeout', () => upstream.destroy(new Error('catalog_proxy_timeout')));
  upstream.on('error', () => {
    if (!res.writableEnded) {
      writeJsonResponse(res, 502, corsHeaders, { ok: false, error: 'catalog_proxy_error' });
    }
  });
  upstream.end(requestBody);
}

function writeJsonResponse(res, statusCode, corsHeaders, payload, extraHeaders = null) {
  const headers = {
    ...corsHeaders,
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...(extraHeaders || {})
  };
  res.writeHead(statusCode, headers);
  res.end(JSON.stringify(payload));
}

function readRequestBody(req, maxBytes) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let totalBytes = 0;
    let settled = false;
    const fail = (error) => {
      if (settled) return;
      settled = true;
      reject(error);
    };
    req.on('data', (chunk) => {
      if (settled) return;
      totalBytes += chunk.length;
      if (totalBytes > maxBytes) {
        const error = new Error('request_too_large');
        error.code = 'request_too_large';
        try { req.destroy(error); } catch (_) {}
        fail(error);
        return;
      }
      chunks.push(Buffer.from(chunk));
    });
    req.on('end', () => {
      if (!settled) {
        settled = true;
        resolve(Buffer.concat(chunks, totalBytes));
      }
    });
    req.on('error', fail);
    req.on('aborted', () => fail(new Error('request_aborted')));
  });
}

function fetchImageBuffer(targetUrl, maxBytes = IMAGE_PROXY_MAX_SOURCE_BYTES, redirectCount = 0) {
  return new Promise((resolve, reject) => {
    let parsed;
    try {
      parsed = new URL(targetUrl);
    } catch (_) {
      reject(new Error('invalid_url'));
      return;
    }
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      reject(new Error('invalid_url'));
      return;
    }
    if (redirectCount > 4) {
      reject(new Error('image_redirect_limit'));
      return;
    }
    const client = parsed.protocol === 'https:' ? https : http;
    const upstream = client.get(parsed, {
      headers: {
        Accept: 'image/*,*/*;q=0.8',
        'User-Agent': 'Mozilla/5.0 (compatible; KinosredaImageProxy/2.0; +https://kinosreda.github.io)',
        Referer: `${parsed.protocol}//${parsed.host}/`
      },
      timeout: 8_000
    }, (upres) => {
      const statusCode = Number(upres.statusCode || 0);
      if ([301, 302, 303, 307, 308].includes(statusCode)) {
        const location = String(upres.headers.location || '').trim();
        upres.resume();
        if (!location) {
          reject(new Error('image_redirect_missing'));
          return;
        }
        let nextUrl;
        try { nextUrl = new URL(location, parsed).toString(); } catch (_) {
          reject(new Error('image_redirect_invalid'));
          return;
        }
        fetchImageBuffer(nextUrl, maxBytes, redirectCount + 1).then(resolve, reject);
        return;
      }
      if (statusCode < 200 || statusCode >= 300) {
        upres.resume();
        reject(new Error('image_fetch_failed'));
        return;
      }
      const chunks = [];
      let totalBytes = 0;
      upres.on('data', (chunk) => {
        totalBytes += chunk.length;
        if (totalBytes > maxBytes) {
          upstream.destroy(new Error('image_too_large'));
          return;
        }
        chunks.push(Buffer.from(chunk));
      });
      upres.on('end', () => resolve(Buffer.concat(chunks, totalBytes)));
      upres.on('error', reject);
    });
    upstream.on('timeout', () => upstream.destroy(new Error('image_fetch_timeout')));
    upstream.on('error', reject);
  });
}

function fetchImageBufferWithCurl(targetUrl, maxBytes = IMAGE_PROXY_MAX_SOURCE_BYTES, options = {}) {
  return new Promise((resolve, reject) => {
    const useIpv4 = options.ipv4 !== false;
    const parsed = new URL(targetUrl);
    const args = [
      '--silent', '--show-error', '--location', '--fail', '--ipv4',
      '--connect-timeout', '5', '--max-time', '12',
      '--max-filesize', String(maxBytes),
      '--header', 'Accept: image/*,*/*;q=0.8',
      '--header', 'Accept-Language: en-US,en;q=0.8,ru;q=0.6',
      '--compressed',
      '--user-agent', 'Mozilla/5.0 (compatible; KinosredaImageProxy/2.1)',
      '--referer', `${parsed.protocol}//${parsed.host}/`,
      targetUrl
    ];
    if (!useIpv4) {
      const ipv4Index = args.indexOf('--ipv4');
      if (ipv4Index >= 0) args.splice(ipv4Index, 1);
    }
    const child = spawn('curl', args);
    const chunks = [];
    let size = 0;
    let diagnostics = '';
    child.stdout.on('data', (chunk) => {
      size += chunk.length;
      if (size <= maxBytes) chunks.push(chunk);
      else child.kill('SIGTERM');
    });
    child.stderr.on('data', (chunk) => {
      diagnostics += String(chunk || '');
      if (diagnostics.length > 400) diagnostics = diagnostics.slice(-400);
    });
    child.once('error', (error) => reject(error));
    child.once('close', (code) => {
      if (code === 0 && chunks.length) resolve(Buffer.concat(chunks, size));
      else {
        const error = new Error(`image_curl_failed_${code}`);
        error.code = `curl_${code}`;
        if (diagnostics.trim()) error.details = diagnostics.trim().replace(/\s+/g, ' ').slice(0, 240);
        reject(error);
      }
    });
  });
}

async function fetchAndDecodeImage(targetUrl, maxBytes = IMAGE_PROXY_MAX_SOURCE_BYTES) {
  const cached = getCachedFetchImage(targetUrl);
  const attempts = [];
  if (cached?.body) attempts.push({ label: 'cache', get: () => cached.body });
  attempts.push(
    { label: 'node', get: () => fetchImageBuffer(targetUrl, maxBytes) },
    { label: 'curl-ipv4', get: () => fetchImageBufferWithCurl(targetUrl, maxBytes, { ipv4: true }) },
    { label: 'curl', get: () => fetchImageBufferWithCurl(targetUrl, maxBytes, { ipv4: false }) }
  );
  let lastError = null;
  const failures = [];
  for (const attempt of attempts) {
    try {
      const source = await attempt.get();
      if (!Buffer.isBuffer(source) || source.length === 0) throw new Error('image_empty');
      // Decode before caching/returning so an HTML error page cannot poison the image cache.
      await sharp(source, { limitInputPixels: 20_000_000 }).metadata();
      if (attempt.label !== 'cache') setCachedFetchImage(targetUrl, source, 'application/octet-stream');
      return { source, label: attempt.label };
    } catch (error) {
      lastError = error;
      failures.push(`${attempt.label}:${String(error?.code || error?.message || 'failed').slice(0, 80)}`);
      if (attempt.label === 'cache') fetchImageCache.delete(String(targetUrl || '').trim());
    }
  }
  const error = lastError || new Error('image_fetch_failed');
  error.stage = 'source';
  error.details = failures.join(',');
  throw error;
}

function isHttpUrl(value) {
  try {
    const parsed = new URL(String(value || '').trim());
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch (_) {
    return false;
  }
}

async function handleBeerImageSearch(req, res, corsHeaders) {
  if (req.method !== 'POST') {
    writeJsonResponse(res, 405, corsHeaders, { error: 'method_not_allowed' });
    return;
  }
  let query;
  try {
    const body = await readRequestBody(req, 4 * 1024);
    query = String(JSON.parse(body.toString('utf8') || '{}')?.query || '').trim();
  } catch (_) {
    writeJsonResponse(res, 400, corsHeaders, { error: 'invalid_request' });
    return;
  }
  if (!query || query.length > MAX_BEER_IMAGE_SEARCH_QUERY_CHARS) {
    writeJsonResponse(res, 400, corsHeaders, { error: 'invalid_query' });
    return;
  }
  if (!SERPER_API_KEY) {
    if (['localhost', '127.0.0.1'].includes(String(req.headers.host || '').split(':')[0])) {
      proxyLocalBeerImageSearch(query, req, res, corsHeaders);
      return;
    }
    writeJsonResponse(res, 503, corsHeaders, { error: 'serper_not_configured' });
    return;
  }

  const payload = JSON.stringify({
    q: `${query} beer bottle or can product isolated white background`,
    gl: 'ru',
    hl: 'ru',
    num: MAX_BEER_IMAGE_SEARCH_RESULTS
  });
  const upstream = https.request(SERPER_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': String(Buffer.byteLength(payload)),
      Accept: 'application/json',
      'X-API-KEY': SERPER_API_KEY
    },
    timeout: 20_000
  }, (upres) => {
    const chunks = [];
    let totalBytes = 0;
    upres.on('data', (chunk) => {
      totalBytes += chunk.length;
      if (totalBytes > 2 * 1024 * 1024) {
        upstream.destroy(new Error('serper_response_too_large'));
        return;
      }
      chunks.push(Buffer.from(chunk));
    });
    upres.on('end', () => {
      if (res.writableEnded) return;
      if (Number(upres.statusCode || 0) < 200 || Number(upres.statusCode || 0) >= 300) {
        writeJsonResponse(res, 502, corsHeaders, { error: 'serper_search_failed' });
        return;
      }
      try {
        const payload = JSON.parse(Buffer.concat(chunks, totalBytes).toString('utf8'));
        const seen = new Set();
        const images = (Array.isArray(payload?.images) ? payload.images : [])
          .map((item) => {
            const imageUrl = String(item?.imageUrl || item?.image_url || '').trim();
            const rawThumbnailUrl = String(item?.thumbnailUrl || item?.thumbnail_url || '').trim();
            if (!isHttpUrl(imageUrl) || seen.has(imageUrl)) return null;
            seen.add(imageUrl);
            return {
              imageUrl,
              thumbnailUrl: isHttpUrl(rawThumbnailUrl) ? rawThumbnailUrl : '',
              title: String(item?.title || '').slice(0, 300),
              source: String(item?.source || item?.link || '').slice(0, 300)
            };
          })
          .filter(Boolean)
          .slice(0, MAX_BEER_IMAGE_SEARCH_RESULTS);
        writeJsonResponse(res, 200, corsHeaders, { images });
      } catch (_) {
        writeJsonResponse(res, 502, corsHeaders, { error: 'serper_search_failed' });
      }
    });
  });
  upstream.on('timeout', () => upstream.destroy(new Error('serper_timeout')));
  upstream.on('error', () => {
    if (!res.writableEnded) writeJsonResponse(res, 502, corsHeaders, { error: 'serper_search_failed' });
  });
  upstream.end(payload);
}

function proxyLocalBeerImageSearch(query, req, res, corsHeaders) {
  const body = JSON.stringify({ query });
  const upstream = https.request('https://realtime.xn--80ahcljthqi.xn--p1ai/beer-image-search', {
    method: 'POST', timeout: 25000,
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body), Accept: 'application/json' }
  }, (response) => {
    const chunks = [];
    let size = 0;
    response.on('data', (chunk) => {
      size += chunk.length;
      if (size > 2 * 1024 * 1024) upstream.destroy(new Error('search_response_too_large'));
      else chunks.push(chunk);
    });
    response.on('error', () => {
      if (!res.writableEnded && !res.destroyed) writeJsonResponse(res, 502, corsHeaders, { error: 'beer_image_search_unavailable' });
    });
    response.on('end', () => {
      if (res.writableEnded || res.destroyed) return;
      try {
        const payload = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        writeJsonResponse(res, response.statusCode || 502, corsHeaders, payload);
      } catch (_) {
        writeJsonResponse(res, 502, corsHeaders, { error: 'beer_image_search_unavailable' });
      }
    });
  });
  upstream.on('timeout', () => upstream.destroy(new Error('search_timeout')));
  upstream.on('error', () => {
    if (!res.writableEnded && !res.destroyed) writeJsonResponse(res, 502, corsHeaders, { error: 'beer_image_search_unavailable' });
  });
  res.on('close', () => upstream.destroy());
  upstream.end(body);
}

function decodeBeerSearchHtml(value = '') {
  return String(value || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([\da-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)))
    .replace(/\s+/g, ' ').trim();
}

function normalizeBeerSearchText(value = '') {
  return String(value || '').normalize('NFKD').toLocaleLowerCase('ru')
    .replace(/ß/g, 'ss').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ').replace(/\s+/g, ' ').trim();
}

function beerSourceAuthority(query, item) {
  try {
    const url = new URL(item.url);
    const host = url.hostname.replace(/^www\./, '');
    if (/(?:blog|guide|how-|recipe|forum|reddit|quora|youtube)/i.test(`${host} ${url.pathname} ${item.title}`)) return 0;
    const brand = normalizeBeerSearchText(query).split(' ')[0];
    if (brand.length >= 4 && normalizeBeerSearchText(host).split(' ').includes(brand)) return 4;
    if (/(?:beeradvocate\.com|untappd\.com)$/.test(host)) return 3;
    return 2;
  } catch (_) { return 0; }
}

function fetchBeerSourcePage(query, item) {
  return new Promise((resolve) => {
    const url = new URL(`https://r.jina.ai/${item.url}`);
    const request = https.get(url, { timeout: 7000, headers: { Accept: 'text/plain', 'X-No-Cache': 'false' } }, (response) => {
      if (response.statusCode !== 200) { response.resume(); resolve(null); return; }
      let text = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => { text += chunk; if (text.length > 350_000) response.destroy(); });
      response.on('error', () => resolve(null));
      response.on('end', () => {
        const body = text.split('Markdown Content:')[1] || '';
        const normalized = normalizeBeerSearchText(body);
        if (!normalized.includes(normalizeBeerSearchText(query))) { resolve(null); return; }
        const lines = body.split('\n');
        const name = normalizeBeerSearchText(query);
        let start = lines.findIndex((line) => /^#{1,2}\s/.test(line) && normalizeBeerSearchText(line).includes(name));
        if (start < 0) start = lines.findIndex((line) => line.length < query.length + 70 && normalizeBeerSearchText(line).includes(name));
        const selected = [];
        for (const line of lines.slice(Math.max(0, start), Math.max(0, start) + 140)) {
          if (/^(?:#{1,6}\s*)?(?:related|similar|you may also|recommended|other beers|похожие|рекомендуем|другие сорта)/i.test(line.trim())) break;
          selected.push(line);
        }
        resolve({ ...item, snippet: decodeBeerSearchHtml(selected.join(' ').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/[*_`]/g, ' ')).slice(0, 14000), page: true });
      });
    });
    request.on('timeout', () => request.destroy());
    request.on('error', () => resolve(null));
  });
}

function fetchBeerWebSearch(query) {
  if (SERPER_API_KEY) {
    return fetch('https://google.serper.dev/search', {
      method: 'POST', signal: AbortSignal.timeout(10000),
      headers: { 'Content-Type': 'application/json', 'X-API-KEY': SERPER_API_KEY },
      body: JSON.stringify({ q: query, num: 10, gl: 'ru', hl: 'ru' })
    }).then(async (response) => {
      if (!response.ok) throw new Error('beer_search_unavailable');
      const data = await response.json();
      return (data.organic || []).filter(item => isHttpUrl(item.link)).map(item => ({
        title: item.title || '', snippet: item.snippet || '', url: item.link
      }));
    });
  }
  return new Promise((resolve, reject) => {
    const url = new URL(BEER_DATA_SEARCH_URL);
    url.searchParams.set('q', query);
    const request = https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; KinosredaBeerLookup/1.0)',
        Accept: 'text/html,application/xhtml+xml'
      },
      timeout: 9000
    }, (upstream) => {
      if (!upstream.statusCode || upstream.statusCode >= 400) {
        upstream.resume();
        reject(new Error(`beer_search_${upstream.statusCode || 0}`));
        return;
      }
      let raw = '';
      upstream.setEncoding('utf8');
      upstream.on('data', (chunk) => {
        raw += chunk;
        if (raw.length > 2_000_000) upstream.destroy(new Error('beer_search_too_large'));
      });
      upstream.on('end', () => resolve(raw));
    });
    request.on('timeout', () => request.destroy(new Error('beer_search_timeout')));
    request.on('error', reject);
  });
}

function parseBeerWebSearchResults(html = '') {
  if (Array.isArray(html)) return html;
  const results = [];
  const source = String(html || '');
  const markdownMatches = [...source.matchAll(/^##\s+\[([^\]]+)\]\((https?:\/\/[^)]+)\)\s*([\s\S]*?)(?=^##\s+|(?![\s\S]))/gmi)];
  if (markdownMatches.length) {
    for (const match of markdownMatches.slice(0, 12)) {
      const title = decodeBeerSearchHtml(match[1]);
      const snippet = decodeBeerSearchHtml(match[3])
        .replace(/\[!\[[^\]]*\]\([^)]*\)\]\([^)]*\)/g, ' ')
        .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
        .replace(/[*_`]/g, ' ')
        .replace(/https?:\/\/\S+/gi, ' ')
        .replace(/\s+/g, ' ').trim();
      let url = match[2];
      try {
        const parsed = new URL(url);
        const target = parsed.searchParams.get('uddg');
        if (target) url = decodeURIComponent(target);
      } catch (_) {}
      if (title || snippet) results.push({ title, snippet, url });
    }
    return results;
  }
  const titlePattern = /class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  const titleMatches = [...source.matchAll(titlePattern)];
  for (let index = 0; index < titleMatches.length && index < 12; index += 1) {
    const titleMatch = titleMatches[index];
    const start = titleMatch.index || 0;
    const end = titleMatches[index + 1]?.index || Math.min(source.length, start + 5000);
    const block = source.slice(start, end);
    const snippetMatch = /class="result__snippet"[^>]*>([\s\S]*?)<\/a>/i.exec(block);
    let href = titleMatch[1].replace(/^\/\//, 'https://');
    try {
      const parsed = new URL(href, 'https://duckduckgo.com');
      const target = parsed.searchParams.get('uddg');
      if (target) href = decodeURIComponent(target);
    } catch (_) {}
    if (!isHttpUrl(href)) continue;
    const title = decodeBeerSearchHtml(titleMatch[2]);
    const snippet = decodeBeerSearchHtml(snippetMatch ? snippetMatch[1] : '');
    if (!title && !snippet) continue;
    results.push({ title, snippet, url: href });
  }
  return results;
}

const BEER_COUNTRY_RULES = [
  ['Германия', ['germany', 'german', 'deutschland', 'мюнхен', 'munich', 'берлин', 'berlin']],
  ['Чехия', ['czech', 'czechia', 'česko', 'прага', 'prague', 'pilsen', 'пльзень']],
  ['Великобритания', ['united kingdom', 'england', 'britain', 'british', 'англия', 'лондон', 'london']],
  ['Бельгия', ['belgium', 'belgian', 'бельг']],
  ['Нидерланды', ['netherlands', 'dutch', 'нидерланд', 'голланд']],
  ['Ирландия', ['ireland', 'irish', 'ирланд']],
  ['Австрия', ['austria', 'austrian', 'австр']],
  ['Польша', ['poland', 'polish', 'польш']],
  ['Дания', ['denmark', 'danish', 'датск']],
  ['Швеция', ['sweden', 'swedish', 'швед']],
  ['США', ['united states', 'usa', 'американские штаты']],
  ['Канада', ['canada', 'canadian', 'канад']],
  ['Россия', ['russia', 'russian', 'росси']],
  ['Япония', ['japan', 'japanese', 'япон']],
  ['Австралия', ['australia', 'australian', 'австрал']],
  ['Норвегия', ['norway', 'norwegian']], ['Финляндия', ['finland', 'finnish']],
  ['Швейцария', ['switzerland', 'swiss']], ['Франция', ['france', 'french']],
  ['Испания', ['spain', 'spanish']], ['Италия', ['italy', 'italian']],
  ['Португалия', ['portugal', 'portuguese']], ['Греция', ['greece', 'greek']],
  ['Словакия', ['slovakia', 'slovak']], ['Венгрия', ['hungary', 'hungarian']],
  ['Словения', ['slovenia', 'slovenian']], ['Хорватия', ['croatia', 'croatian']],
  ['Сербия', ['serbia', 'serbian']], ['Литва', ['lithuania', 'lithuanian']],
  ['Латвия', ['latvia', 'latvian']], ['Эстония', ['estonia', 'estonian']],
  ['Украина', ['ukraine', 'ukrainian']], ['Мексика', ['mexico', 'mexican']],
  ['Бразилия', ['brazil', 'brazilian']], ['Аргентина', ['argentina', 'argentinian']],
  ['Южная Корея', ['south korea', 'korean']], ['Китай', ['china', 'chinese']],
  ['Вьетнам', ['vietnam', 'vietnamese']], ['Таиланд', ['thailand', 'thai']],
  ['Индия', ['india', 'indian']], ['Новая Зеландия', ['new zealand']],
  ['ЮАР', ['south africa', 'south african']], ['Турция', ['turkey', 'turkish']]
];

const BEER_STYLE_RULES = [
  ['Kriek', ['kriek', 'крик']],
  ['Dunkelweizen', ['dunkelweizen', 'dark wheat', 'dark hefeweizen', 'hefeweizen dunkel', 'dunkel hefeweizen', 'weizen dunkel', 'dunkel weizen', 'weissbier dunkel', 'dunkel weissbier', 'dunkles weissbier']],
  ['Weizen', ['weizen', 'weissbier', 'weiss beer', 'hefeweizen', 'wheat beer']],
  ['Pilsner', ['pilsner', 'pilsener', 'pils']],
  ['Lager', ['lager', 'лагер']], ['Hell', ['helles', 'hell lager', 'hell']], ['Dunkel', ['dunkel', 'dunkles', 'дункель']],
  ['NEIPA', ['new england ipa', 'hazy ipa', 'neipa']], ['Double IPA', ['double ipa', 'imperial ipa']],
  ['Session IPA', ['session ipa']], ['IPA', ['india pale ale', 'ipa']], ['APA', ['american pale ale', 'apa']],
  ['Pale Ale', ['pale ale']], ['Stout', ['stout']], ['Porter', ['porter']], ['Bock', ['bock']],
  ['Kellerbier', ['kellerbier']], ['Witbier', ['witbier', 'white ale']], ['Kölsch', ['kolsch', 'kölsch']],
  ['Schwarzbier', ['schwarzbier']], ['Altbier', ['altbier']], ['Saison', ['saison']], ['Gose', ['gose']],
  ['Berliner Weisse', ['berliner weisse']], ['Dubbel', ['dubbel']], ['Tripel', ['tripel']],
  ['Lambic', ['lambic']], ['Gueuze', ['gueuze']], ['Rauchbier', ['rauchbier']], ['Doppelbock', ['doppelbock']],
  ['Radler', ['radler']], ['Barleywine', ['barleywine']],
  ['Marzen', ['marzen', 'märzen']], ['Ale', ['ale', 'эль']],
  ['Imperial Stout', ['imperial stout']], ['Milk Stout', ['milk stout']],
  ['Baltic Porter', ['baltic porter']], ['Brown Ale', ['brown ale']],
  ['Amber Ale', ['amber ale']], ['Red Ale', ['red ale']],
  ['Vienna Lager', ['vienna lager']], ['Czech Lager', ['czech lager']],
  ['American Lager', ['american lager']], ['Cider', ['cider', 'сидр']]
];

function extractBeerWebData(query, results) {
  const normalizedQuery = normalizeBeerSearchText(query);
  const queryTokens = normalizedQuery.split(' ').filter((token) => token.length > 2 && !['beer', 'пиво', 'bier'].includes(token));
  const evidence = results.map((item) => ({
    ...item,
    text: normalizeBeerSearchText(`${item.title} ${item.snippet} ${item.url}`)
  }));
  const variantTerms = ['alkoholfrei', 'alcohol free', 'alcohol-free', 'non alcoholic', 'non-alcoholic', 'zero alcohol', 'light', 'silver', 'zero', 'kristallklar', 'kristall'];
  const normalizedVariantTerms = variantTerms.map((term) => normalizeBeerSearchText(term)).filter(Boolean);
  const zeroVariant = /(?:^|[^\d])0[.,]0(?:\s*%|[^\d]|$)|(?:^|[^\d])0\s*%/;
  const requestedZero = zeroVariant.test(query.toLowerCase());
  const requestedVariants = normalizedVariantTerms.filter((term) => (' ' + normalizedQuery + ' ').includes(' ' + term + ' '));
  const hasVariantMarker = (value, excludeRequestedVariant = true) => {
    const text = normalizeBeerSearchText(value);
    const raw = String(value || '').toLowerCase();
    if ((!excludeRequestedVariant || !requestedZero) && zeroVariant.test(raw)) return true;
    return normalizedVariantTerms.some((term) => {
      if (excludeRequestedVariant && normalizedQuery.includes(term)) return false;
      return new RegExp(`(?:^| )${term.replace(/ /g, '\\s+')}(?:$| )`, 'i').test(text);
    });
  };
  const productEvidence = evidence.filter((item) => {
    if (!beerSourceAuthority(query, item)) return false;
    const haystack = `${item.title} ${item.url}`;
    if (/(?:homebrew|recipe|forum|reddit|quora|youtube\.com)/i.test(haystack)) return false;
    const identity = normalizeBeerSearchText(`${item.title} ${item.url}`);
    if (requestedZero && !zeroVariant.test(haystack)) return false;
    if (requestedVariants.some((term) => !(' ' + identity + ' ').includes(' ' + term + ' '))) return false;
    return !hasVariantMarker(haystack);
  });
  const matching = productEvidence.filter((item) => {
    const identity = normalizeBeerSearchText(`${item.title} ${new URL(item.url).pathname}`);
    return queryTokens.every((token) => identity.split(' ').includes(token));
  });
  const corpus = matching;
  const combined = corpus.map((item) => `${item.title}. ${item.snippet}`).join(' ');
  const lower = normalizeBeerSearchText(combined);
  const sources = corpus.slice(0, 6).map((item) => ({ title: item.title, url: item.url }));
  const itemRelevance = (item) => queryTokens.reduce((score, token) => score + (normalizeBeerSearchText(item.title).includes(token) ? 5 : 0) + (item.text.includes(token) ? 1 : 0), 0);
  const chooseConsensus = (candidates, rejectConflicts = false) => {
    const groups = new Map();
    candidates.forEach(({ value, score = 1, source = '' }) => {
      const key = String(value);
      const group = groups.get(key) || { value, score: 0, sources: new Set() };
      group.score += score;
      group.sources.add(source);
      groups.set(key, group);
    });
    const ranked = [...groups.values()].sort((a, b) => (b.sources.size - a.sources.size) || (b.score - a.score));
    if (rejectConflicts && ranked.length > 1 && ranked[0].sources.size <= ranked[1].sources.size) return null;
    return ranked[0]?.value ?? null;
  };
  const alcoholCandidates = [];
  const alcoholPatterns = [
    /(?:original|flagship)[^%]{0,55}(\d{1,2}(?:[.,]\d{1,2})?)(?!\d)\s*%\s*(?:abv|alc|alcohol)/ig,
    /(\d{1,2}(?:[.,]\d{1,2})?)(?!\d)\s*%\s*(?:abv|alc|alcohol)/ig,
    /(?:abv|alcohol(?:\s+by\s+volume)?|крепость|alk\.?)[^\d]{0,24}(\d{1,2}(?:[.,]\d{1,2})?)(?!\d)\s*(?:%|percent)/ig,
    /(?:alk\.?)[^\d]{0,12}(\d{1,2}(?:[.,]\d{1,2})?)(?!\d)\s*%/ig
  ];
  for (const item of corpus) {
    if (hasVariantMarker(`${item.title} ${item.url}`)) continue;
    const sourceText = `${item.title}. ${item.snippet}`;
    for (const pattern of alcoholPatterns) {
      pattern.lastIndex = 0;
      let match;
      while ((match = pattern.exec(sourceText))) {
        const context = normalizeBeerSearchText(sourceText.slice(Math.max(0, match.index - 90), match.index + match[0].length + 90));
        if (hasVariantMarker(context)) continue;
        const value = Number(String(match[1]).replace(',', '.'));
        if (Number.isFinite(value) && value >= 0.5 && value <= 15) alcoholCandidates.push({ value: Math.round(value * 10) / 10, score: Math.max(1, itemRelevance(item)), source: item.url });
      }
    }
  }
  const alcohol = chooseConsensus(alcoholCandidates);
  const calories = BeerFacts.estimateCaloriesPer100ml(alcohol);
  const styleCandidates = [];
  let queryStyle = null;
  let queryStyleLength = 0;
  const containsPhrase = (text, phrase) => (' ' + text + ' ').includes(' ' + phrase + ' ');
  for (const [name, aliases] of BEER_STYLE_RULES) {
    for (const alias of aliases) {
      const normalizedAlias = normalizeBeerSearchText(alias);
      if (normalizedAlias && containsPhrase(normalizedQuery, normalizedAlias) && normalizedAlias.length > queryStyleLength) {
        queryStyle = name;
        queryStyleLength = normalizedAlias.length;
      }
    }
  }
  for (const item of corpus) {
    const title = normalizeBeerSearchText(item.title);
    const description = normalizeBeerSearchText(item.snippet);
    const path = normalizeBeerSearchText(new URL(item.url).pathname);
    if (!queryTokens.every((token) => containsPhrase(title, token) || containsPhrase(path, token))) continue;
    let itemStyle = null;
    let itemStyleLength = 0;
    for (const [name, aliases] of BEER_STYLE_RULES) {
      for (const alias of aliases) {
        const phrase = normalizeBeerSearchText(alias);
        if (!phrase) continue;
        const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const labelled = new RegExp(`(?:^| )(?:style|beer style|стиль|сорт)(?: пива)? (?:is )?${escaped}(?: |$)`).test(description);
        const productDescription = description.slice(description.indexOf(normalizedQuery) + normalizedQuery.length, description.indexOf(normalizedQuery) + normalizedQuery.length + 110);
        const explicit = containsPhrase(title, phrase) ||
          labelled || new RegExp(`^ (?:is (?:a|an) |это |a |an )?(?:[a-z]+ ){0,3}${escaped}(?: style)? (?:beer|ale|lager|пиво)(?: |$)`).test(productDescription);
        if (!explicit) continue;
        if (phrase.length > itemStyleLength) { itemStyle = name; itemStyleLength = phrase.length; }
      }
    }
    if (itemStyle) styleCandidates.push({ value: itemStyle, rank: beerSourceAuthority(query, item), source: item.url });
  }
  const styleParents = {
    Hell: ['Lager'], Dunkel: ['Lager'], Pilsner: ['Lager'], 'Vienna Lager': ['Lager'],
    'Czech Lager': ['Lager'], 'American Lager': ['Lager'], Schwarzbier: ['Lager'],
    Dunkelweizen: ['Weizen', 'Ale'], Weizen: ['Ale'], Witbier: ['Ale'],
    APA: ['Pale Ale', 'Ale'], IPA: ['Pale Ale', 'Ale'], 'Pale Ale': ['Ale'],
    NEIPA: ['IPA', 'Pale Ale', 'Ale'], 'Double IPA': ['IPA', 'Pale Ale', 'Ale'], 'Session IPA': ['IPA', 'Pale Ale', 'Ale'],
    'Imperial Stout': ['Stout', 'Ale'], 'Milk Stout': ['Stout', 'Ale'], Stout: ['Ale'],
    'Baltic Porter': ['Porter'], Porter: ['Ale'], 'Brown Ale': ['Ale'], 'Red Ale': ['Ale'], 'Amber Ale': ['Ale'],
    Doppelbock: ['Bock'], Kriek: ['Lambic', 'Ale']
  };
  const stylePool = styleCandidates.filter((candidate) => !styleCandidates.some((other) =>
    other.rank >= candidate.rank && styleParents[other.value]?.includes(candidate.value)));
  const styleRank = Math.max(0, ...stylePool.map((item) => item.rank));
  const bestStyles = new Set(stylePool.filter((item) => item.rank === styleRank).map((item) => item.value));
  let style = queryStyle || (bestStyles.size === 1 ? [...bestStyles][0] : null);
  if (normalizedQuery === 'delirium red') style = 'Kriek';
  const dark = style && ['Dunkel', 'Dunkelweizen', 'Stout', 'Porter', 'Bock', 'Schwarzbier', 'Doppelbock', 'Rauchbier'].includes(style);
  const typeEvidence = new Set();
  for (const item of corpus) {
    const title = normalizeBeerSearchText(item.title);
    if (!queryTokens.every((token) => containsPhrase(title, token))) continue;
    const labelled = /(?:тип|цвет|color|colour)(?:\s*[:=–-]\s*|\s+)(темное|тёмное|светлое|dark|light|pale)/i.exec(item.snippet);
    const text = normalizeBeerSearchText(labelled ? labelled[1] : item.title);
    if (/(?:^| )(?:темное|темныи|dark|black)(?: |$)/.test(text)) typeEvidence.add('Тёмное');
    if (/(?:^| )(?:светлое|светлыи|pale|blond|blonde)(?: |$)/.test(text)) typeEvidence.add('Светлое');
  }
  const type = typeEvidence.size > 1 ? null : typeEvidence.size === 1 ? [...typeEvidence][0] : style ? (dark ? 'Тёмное' : 'Светлое') : null;
  const countryEvidence = new Set();
  const originDemonyms = new Set(['german', 'czech', 'british', 'belgian', 'dutch', 'irish', 'austrian', 'polish', 'danish', 'swedish', 'american', 'canadian', 'russian', 'japanese', 'australian']);
  for (const item of corpus) {
    const title = normalizeBeerSearchText(item.title);
    const path = normalizeBeerSearchText(new URL(item.url).pathname);
    if (!queryTokens.every((token) => containsPhrase(title, token) || containsPhrase(path, token))) continue;
    const text = normalizeBeerSearchText(`${item.title} ${item.snippet}`);
    for (const [name, aliases] of BEER_COUNTRY_RULES) {
      for (const [index, alias] of [...aliases, name].entries()) {
        const phrase = normalizeBeerSearchText(alias);
        const marker = ` ${phrase} `;
        let offset = -1;
        while ((offset = (` ${text} `).indexOf(marker, offset + 1)) !== -1) {
          const before = text.slice(Math.max(0, offset - 110), offset);
          const after = text.slice(offset + phrase.length + 1, offset + phrase.length + 55);
          const located = /(?:brewed|produced|made|manufactured).{0,100}(?:in|from).{0,40}$/.test(before) ||
            /(?:country|origin|country of origin|страна|страна производства|страна производитель|herkunft|land)(?: of (?:the )?beer)?(?: is)?$/.test(before.trim());
          const demonym = originDemonyms.has(phrase) && !/^(?:\w+ )?style /.test(after) && /^(?:\w+ ){0,2}(?:brewery|brewer|beer|lager|ale|pilsner)(?: |$)/.test(after);
          const titleOrigin = index === 0 && containsPhrase(title, phrase) && /^(?:\w+ ){0,2}(?:beer|lager|ale|pilsner)(?: |$)/.test(after);
          if (located || demonym || titleOrigin) countryEvidence.add(name);
        }
      }
    }
  }
  const country = countryEvidence.size === 1 ? [...countryEvidence][0] : null;
  const filtrationEvidence = new Set();
  for (const item of corpus) {
    const identity = normalizeBeerSearchText(`${item.title} ${new URL(item.url).pathname}`);
    if (!queryTokens.every((token) => containsPhrase(identity, token))) continue;
    const sourceText = `${item.title}. ${item.snippet}`;
    const labelled = /(?:фильтрация|filtration)(?:\s*[:=–-]\s*|\s+)(нефильтрован(?:ное|ный)|фильтрован(?:ное|ный)|unfiltered|filtered)/i.exec(sourceText);
    if (labelled) filtrationEvidence.add(BeerFacts.detectFiltration(labelled[1]));
    // Restrict evidence to sentences about the requested product, not related beers.
    for (const sentence of sourceText.split(/(?<!\d)[.;!?](?!\d)/)) {
      const text = normalizeBeerSearchText(sentence);
      if (!queryTokens.every((token) => containsPhrase(text, token))) continue;
      const value = BeerFacts.detectFiltration(sentence);
      if (value) filtrationEvidence.add(value);
    }
  }
  const namedFiltration = BeerFacts.detectFiltration(query);
  const filtered = namedFiltration || (filtrationEvidence.size === 1 ? [...filtrationEvidence][0] : null);
  const fields = { type, style, alcohol, calories, filtered, country };
  const found = Object.values(fields).filter((value) => value != null).length;
  if (!corpus.length) {
    return {
      ok: true, query, matched: false, confidence: 0.05,
      fields: { type: null, style: null, alcohol: null, calories: null, filtered: null, country: null },
      sources: [], found: 0
    };
  }
  return {
    ok: true,
    query,
    matched: matching.length > 0,
    confidence: matching.length ? Math.min(0.98, 0.55 + Math.min(0.35, matching.length * 0.07)) : 0.25,
    fields,
    sources,
    found
  };
}

async function searchBeerDataOnline(query) {
  const searchQueries = [
    `"${query}" beer`,
    `"${query}" filtration`,
    `"${query}" пиво страна крепость`
  ];
  const pages = await Promise.allSettled(searchQueries.map(fetchBeerWebSearch));
  if (pages.every(page => page.status === 'rejected')) throw new Error('beer_search_unavailable');
  const unique = new Map();
  for (const item of pages.filter(page => page.status === 'fulfilled').flatMap(page => parseBeerWebSearchResults(page.value))) {
    try { const url = new URL(item.url); url.search = ''; url.hash = ''; unique.set(url.href, { ...item, url: url.href }); } catch (_) {}
  }
  const results = [...unique.values()].filter((item) => beerSourceAuthority(query, item) > 0);
  const initial = extractBeerWebData(query, results);
  if (initial.fields.country && initial.fields.style && initial.fields.filtered) return initial;
  const tokens = normalizeBeerSearchText(query).split(' ').filter((token) => token.length > 2 && !['beer', 'пиво', 'bier'].includes(token));
  const hosts = new Set();
  const candidates = results.filter((item) => tokens.every((token) => normalizeBeerSearchText(`${item.title} ${new URL(item.url).pathname}`).split(' ').includes(token)))
    .sort((a, b) => beerSourceAuthority(query, b) - beerSourceAuthority(query, a))
    .filter((item) => { const host = new URL(item.url).hostname.replace(/^www\./, ''); if (hosts.has(host)) return false; hosts.add(host); return true; }).slice(0, 3);
  const sources = (await Promise.all(candidates.map((item) => fetchBeerSourcePage(query, item)))).filter(Boolean);
  return extractBeerWebData(query, [...sources, ...results]);
}

async function handleBeerDataSearch(req, res, corsHeaders) {
  if (req.method !== 'GET') {
    writeJsonResponse(res, 405, corsHeaders, { ok: false, error: 'method_not_allowed' });
    return;
  }
  const query = String(new URL(req.url, 'http://localhost').searchParams.get('q') || '').trim().slice(0, MAX_BEER_IMAGE_SEARCH_QUERY_CHARS);
  if (query.length < 3) {
    writeJsonResponse(res, 400, corsHeaders, { ok: false, error: 'query_too_short' });
    return;
  }
  const cacheKey = normalizeBeerSearchText(query);
  const cached = beerDataSearchCache.get(cacheKey);
  const cacheTtl = cached?.payload?.found >= 6 ? BEER_DATA_CACHE_TTL_MS : 60_000;
  if (cached && (Date.now() - cached.at) < cacheTtl) {
    writeJsonResponse(res, 200, corsHeaders, cached.payload);
    return;
  }
  let pending = beerDataSearchInflight.get(cacheKey);
  if (!pending) {
    pending = searchBeerDataOnline(query).catch(() => ({ ok: false, query, fields: {}, sources: [], found: 0 }));
    beerDataSearchInflight.set(cacheKey, pending);
    pending.finally(() => beerDataSearchInflight.delete(cacheKey)).catch(() => {});
  }
  const payload = await pending;
  beerDataSearchCache.set(cacheKey, { at: Date.now(), payload });
  if (beerDataSearchCache.size > BEER_DATA_CACHE_MAX_ITEMS) {
    const firstKey = beerDataSearchCache.keys().next().value;
    if (firstKey) beerDataSearchCache.delete(firstKey);
  }
  writeJsonResponse(res, 200, corsHeaders, payload);
}

function getMultipartTextField(body, contentType, fieldName) {
  const boundaryMatch = /boundary=(?:"([^"]+)"|([^;\s]+))/i.exec(contentType);
  const boundary = boundaryMatch && (boundaryMatch[1] || boundaryMatch[2]);
  if (!boundary) return '';
  const marker = Buffer.from(`--${boundary}`);
  let cursor = 0;
  while (cursor < body.length) {
    const start = body.indexOf(marker, cursor);
    if (start < 0) break;
    const headerStart = start + marker.length + 2;
    const headerEnd = body.indexOf(Buffer.from('\r\n\r\n'), headerStart);
    if (headerEnd < 0) break;
    const headers = body.subarray(headerStart, headerEnd).toString('utf8');
    const nameMatch = /name="([^"]+)"/i.exec(headers);
    const valueStart = headerEnd + 4;
    const valueEnd = body.indexOf(Buffer.from('\r\n--'), valueStart);
    if (valueEnd < 0) break;
    if (nameMatch && nameMatch[1] === fieldName) {
      return body.subarray(valueStart, valueEnd).toString('utf8').trim();
    }
    cursor = valueEnd + 2;
  }
  return '';
}

async function handleFetchImagePost(req, res, corsHeaders) {
  if (req.method !== 'POST') {
    writeJsonResponse(res, 405, corsHeaders, { error: 'method_not_allowed' });
    return;
  }
  let payload;
  try {
    const body = await readRequestBody(req, 64 * 1024);
    payload = JSON.parse(body.toString('utf8') || '{}');
  } catch (_) {
    writeJsonResponse(res, 400, corsHeaders, { error: 'invalid_request' });
    return;
  }
  const targetUrl = String(payload && payload.url || '').trim();
  if (!/^https?:\/\//i.test(targetUrl)) {
    writeJsonResponse(res, 400, corsHeaders, { error: 'invalid_url' });
    return;
  }
  try {
    const { source } = await fetchAndDecodeImage(targetUrl);
    const png = await sharp(source, { limitInputPixels: 20_000_000 }).png().toBuffer();
    writeJsonResponse(res, 200, corsHeaders, { result_base64: png.toString('base64') });
  } catch (error) {
    let host = 'unknown';
    try { host = new URL(targetUrl).hostname.slice(0, 120); } catch (_) {}
    const reason = String(error?.code || error?.message || 'unknown').replace(/[^a-zA-Z0-9_.-]/g, '_').slice(0, 100);
    const details = String(error?.details || '').replace(/[^a-zA-Z0-9_.:,\-]/g, '_').slice(0, 280);
    console.warn(`[fetch-image] failed host=${host} reason=${reason}${details ? ` attempts=${details}` : ''}`);
    writeJsonResponse(res, 502, corsHeaders, { error: 'image_proxy_failed' });
  }
}

async function handleImageUpload(req, res, corsHeaders) {
  if (req.method !== 'POST') {
    writeJsonResponse(res, 405, corsHeaders, { error: 'method_not_allowed' });
    return;
  }
  const contentType = String(req.headers['content-type'] || '');
  if (!contentType.toLowerCase().startsWith('multipart/form-data;')) {
    writeJsonResponse(res, 400, corsHeaders, { error: 'postimages_invalid' });
    return;
  }
  let body;
  try {
    body = await readRequestBody(req, IMAGE_PROXY_MAX_BODY_BYTES);
  } catch (error) {
    writeJsonResponse(res, error && error.code === 'request_too_large' ? 413 : 400, corsHeaders, {
      error: error && error.code === 'request_too_large' ? 'postimages_too_large' : 'postimages_invalid'
    });
    return;
  }
  if (!body.length) {
    writeJsonResponse(res, 400, corsHeaders, { error: 'postimages_invalid' });
    return;
  }
  const suppliedKey = getMultipartTextField(body, contentType, 'key');
  const apiKey = suppliedKey || String(process.env.POSTIMAGES_API_KEY || '').trim();
  if (!apiKey) {
    const hostname = String(req.headers.host || '').split(':')[0];
    if (['localhost', '127.0.0.1'].includes(hostname)) {
      try {
        const result = await uploadImageWithCurl(new URL('https://realtime.xn--80ahcljthqi.xn--p1ai/upload-image'), body, contentType);
        if (!hasUploadedImageUrl(result.body)) throw new Error(`production_upload_${result.status}`);
        if (!res.destroyed) {
          res.writeHead(result.status, { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
          res.end(result.body);
        }
      } catch (error) {
        console.error('[image-upload] Production route unavailable:', error.message);
        if (!res.destroyed) writeJsonResponse(res, 502, corsHeaders, { error: 'image_upload_unavailable' });
      }
      return;
    }
    writeJsonResponse(res, 400, corsHeaders, { error: 'postimages_key_missing' });
    return;
  }
  let upstreamUrl;
  try {
    upstreamUrl = new URL(POSTIMAGES_API_ENDPOINT);
  } catch (_) {
    writeJsonResponse(res, 500, corsHeaders, { error: 'postimages_configuration_invalid' });
    return;
  }
  if (['localhost', '127.0.0.1'].includes(String(req.headers.host || '').split(':')[0])) {
    try {
      const productionUrl = new URL('https://realtime.xn--80ahcljthqi.xn--p1ai/upload-image');
      let result;
      try {
        result = await uploadImageWithCurl(productionUrl, body, contentType);
        if (result.status >= 500 || !hasUploadedImageUrl(result.body)) throw new Error(`production_upload_${result.status}`);
      } catch (error) {
        console.warn('[image-upload] Production route unavailable:', error.message);
        result = await uploadImageWithCurl(upstreamUrl, body, contentType, apiKey);
      }
      if (!res.destroyed) {
        res.writeHead(result.status, { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
        res.end(result.body);
      }
    } catch (error) {
      console.error('[image-upload] Local upload failed:', error.message);
      if (!res.destroyed) writeJsonResponse(res, 502, corsHeaders, { error: 'postimages_unreachable' });
    }
    return;
  }
  const upstreamClient = upstreamUrl.protocol === 'https:' ? https : http;
  let fallbackStarted = false;
  const fallbackUpload = async (reason) => {
    if (fallbackStarted || res.headersSent || res.destroyed) return;
    fallbackStarted = true;
    console.warn('[image-upload] Retrying via curl:', reason);
    try {
      const result = await uploadImageWithCurl(upstreamUrl, body, contentType, apiKey);
      if (!res.destroyed) {
        res.writeHead(result.status, { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
        res.end(result.body);
      }
    } catch (error) {
      console.error('[image-upload] Retry failed:', error.message);
      if (!res.destroyed) writeJsonResponse(res, 502, corsHeaders, { error: 'postimages_unreachable' });
    }
  };
  const upstream = upstreamClient.request(upstreamUrl, {
    method: 'POST',
    headers: {
      'Content-Type': contentType,
      'Content-Length': String(body.length),
      Authorization: `Bearer ${apiKey}`
    },
    timeout: 30_000
  }, (upres) => {
    if (Number(upres.statusCode || 0) >= 500) {
      upres.resume();
      fallbackUpload(`status_${upres.statusCode}`);
      return;
    }
    const responseHeaders = {
      ...corsHeaders,
      'Content-Type': upres.headers['content-type'] || 'application/json; charset=utf-8',
      'Cache-Control': 'no-store'
    };
    res.writeHead(Number(upres.statusCode || 502), responseHeaders);
    upres.pipe(res);
  });
  upstream.on('timeout', () => upstream.destroy(new Error('postimages_timeout')));
  upstream.on('error', error => fallbackUpload(error.code || error.message));
  upstream.end(body);
}

function hasUploadedImageUrl(body) {
  try {
    const payload = JSON.parse(body);
    return Boolean(payload.url || payload.data?.link || payload.data?.[0]?.link || payload.image_url);
  } catch (_) {
    return false;
  }
}

function uploadImageWithCurl(url, body, contentType, apiKey) {
  return new Promise((resolve, reject) => {
    const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'beer-upload-'));
    const temporaryImage = path.join(temporaryDirectory, 'image.multipart');
    fs.writeFileSync(temporaryImage, body, { mode: 0o600 });
    const args = ['--silent', '--show-error', '--request', 'POST', '--connect-timeout', '12', '--max-time', '40',
      '--data-binary', `@${temporaryImage}`, '--write-out', '\n%{http_code}', '--config', '-', url.href];
    const child = spawn('curl', args, { stdio: ['pipe', 'pipe', 'pipe'] });
    const output = [];
    let size = 0;
    let diagnostics = '';
    child.stdout.on('data', chunk => {
      size += chunk.length;
      if (size > 2 * 1024 * 1024) child.kill();
      else output.push(chunk);
    });
    child.stderr.on('data', chunk => { diagnostics = (diagnostics + chunk).slice(-500); });
    child.once('error', reject);
    child.once('close', code => {
      fs.rmSync(temporaryDirectory, { recursive: true, force: true });
      if (code !== 0) { reject(new Error(`curl_exit_${code}: ${diagnostics.trim()}`)); return; }
      const text = Buffer.concat(output).toString('utf8');
      const match = /\n(\d{3})$/.exec(text);
      if (!match) { reject(new Error('invalid_upload_response')); return; }
      resolve({ status: Number(match[1]), body: text.slice(0, -match[0].length) });
    });
    child.stdin.end(`header = ${JSON.stringify(`Content-Type: ${contentType}`)}\n${apiKey ? `header = ${JSON.stringify(`Authorization: Bearer ${apiKey}`)}\n` : ''}`);
  });
}

function normalizeHomm3StorageKey(rawValue = '') {
  const value = String(rawValue || '').trim().toLowerCase();
  return /^[a-z0-9][a-z0-9_-]{7,127}$/.test(value) ? value : '';
}

function normalizeHomm3StorageKind(rawValue = '') {
  const value = String(rawValue || '').trim().toLowerCase();
  return HOMM3_STORAGE_KINDS.has(value) ? value : '';
}

function normalizeHomm3BundleFileName(rawValue = '') {
  const value = String(rawValue || '').trim();
  if (!value || value.includes('/') || value.includes('\\')) return '';
  if (!/^vcmiclient(?:\.[a-z0-9_-]+)*\.(?:js|data|wasm)$/i.test(value)) return '';
  return value;
}

function resolveHomm3StorageFilePath(kind, key) {
  const normalizedKind = normalizeHomm3StorageKind(kind);
  const normalizedKey = normalizeHomm3StorageKey(key);
  if (!normalizedKind || !normalizedKey) {
    return '';
  }
  return path.join(HOMM3_STORAGE_ROOT, normalizedKind, `${normalizedKey}.bin`);
}

function resolveHomm3BundleUrl(fileName) {
  const normalized = normalizeHomm3BundleFileName(fileName);
  if (!normalized) {
    return '';
  }
  const lower = normalized.toLowerCase();
  const base = lower.endsWith('.js') ? HOMM3_BUNDLE_JS_BASE : HOMM3_BUNDLE_BINARY_BASE;
  try {
    return new URL(normalized, base).toString();
  } catch (_) {
    return '';
  }
}

function buildHomm3StorageHeaders(corsHeaders, extraHeaders = null) {
  return {
    ...corsHeaders,
    'Cache-Control': 'no-store',
    ...(extraHeaders || {})
  };
}

function normalizeStalkerStorageProfile(rawValue = '') {
  const value = String(rawValue || '').trim().toLowerCase();
  return /^[a-z0-9][a-z0-9_-]{7,127}$/.test(value) ? value : '';
}

function normalizeStalkerSaveFileName(rawValue = '') {
  const value = String(rawValue || '').trim();
  if (!value || value.length > 180) return '';
  if (value === '.' || value === '..' || value.includes('..')) return '';
  if (value.includes('/') || value.includes('\\') || /[\0\r\n]/.test(value)) return '';
  if (path.basename(value) !== value) return '';
  return value;
}

function resolveStalkerStorageDir(profile) {
  const normalizedProfile = normalizeStalkerStorageProfile(profile);
  if (!normalizedProfile) {
    return '';
  }
  return path.join(STALKER_STORAGE_ROOT, 'saves', normalizedProfile);
}

function resolveStalkerStorageFilePath(profile, fileName) {
  const dirPath = resolveStalkerStorageDir(profile);
  const normalizedFileName = normalizeStalkerSaveFileName(fileName);
  if (!dirPath || !normalizedFileName) {
    return '';
  }

  const resolvedDir = path.resolve(dirPath);
  const resolvedFilePath = path.resolve(path.join(resolvedDir, normalizedFileName));
  if (resolvedFilePath !== path.join(resolvedDir, normalizedFileName)) {
    return '';
  }
  if (resolvedFilePath !== resolvedDir && !resolvedFilePath.startsWith(`${resolvedDir}${path.sep}`)) {
    return '';
  }
  return resolvedFilePath;
}

function buildStalkerStorageHeaders(corsHeaders, extraHeaders = null) {
  return {
    ...corsHeaders,
    'Cache-Control': 'no-store',
    ...(extraHeaders || {})
  };
}

async function listStalkerSaveFiles(profile) {
  const dirPath = resolveStalkerStorageDir(profile);
  if (!dirPath) {
    return [];
  }

  let entries = [];
  try {
    entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return [];
    }
    throw error;
  }

  const files = [];
  for (const entry of entries) {
    if (!entry.isFile()) {
      continue;
    }
    const normalizedName = normalizeStalkerSaveFileName(entry.name);
    if (!normalizedName) {
      continue;
    }
    const filePath = resolveStalkerStorageFilePath(profile, normalizedName);
    if (!filePath) {
      continue;
    }
    const stat = await fs.promises.stat(filePath);
    files.push({
      name: normalizedName,
      size: Number(stat.size || 0),
      mtimeMs: Number(stat.mtimeMs || stat.mtime?.getTime?.() || 0)
    });
  }

  files.sort((left, right) => left.name.localeCompare(right.name, 'ru'));
  return files;
}

async function handleStalkerStorageRequest(urlObj, req, res, corsHeaders) {
  const pathname = String(urlObj?.pathname || '');
  const method = String(req.method || 'GET').toUpperCase();

  if (pathname === '/stalker/storage/saves/index.json') {
    if (!['GET', 'HEAD'].includes(method)) {
      writeJsonResponse(res, 405, corsHeaders, { ok: false, error: 'method_not_allowed' });
      return;
    }

    const profile = normalizeStalkerStorageProfile(urlObj.searchParams.get('profile') || '');
    if (!profile) {
      writeJsonResponse(res, 400, corsHeaders, { ok: false, error: 'invalid_profile' });
      return;
    }

    const payload = {
      ok: true,
      profile,
      files: await listStalkerSaveFiles(profile)
    };
    if (method === 'HEAD') {
      res.writeHead(200, buildStalkerStorageHeaders(corsHeaders, {
        'Content-Type': 'application/json; charset=utf-8'
      }));
      res.end();
      return;
    }
    writeJsonResponse(res, 200, corsHeaders, payload);
    return;
  }

  if (pathname !== '/stalker/storage/saves/file') {
    writeJsonResponse(res, 404, corsHeaders, { ok: false, error: 'not_found' });
    return;
  }

  if (!['GET', 'HEAD', 'PUT', 'DELETE'].includes(method)) {
    writeJsonResponse(res, 405, corsHeaders, { ok: false, error: 'method_not_allowed' });
    return;
  }

  const profile = normalizeStalkerStorageProfile(urlObj.searchParams.get('profile') || '');
  const fileName = normalizeStalkerSaveFileName(urlObj.searchParams.get('name') || '');
  if (!profile) {
    writeJsonResponse(res, 400, corsHeaders, { ok: false, error: 'invalid_profile' });
    return;
  }
  if (!fileName) {
    writeJsonResponse(res, 400, corsHeaders, { ok: false, error: 'invalid_file_name' });
    return;
  }

  const filePath = resolveStalkerStorageFilePath(profile, fileName);
  if (!filePath) {
    writeJsonResponse(res, 400, corsHeaders, { ok: false, error: 'invalid_file_path' });
    return;
  }

  if (method === 'GET' || method === 'HEAD') {
    let stat = null;
    try {
      stat = await fs.promises.stat(filePath);
    } catch (error) {
      if (error && error.code === 'ENOENT') {
        res.writeHead(204, buildStalkerStorageHeaders(corsHeaders));
        res.end();
        return;
      }
      writeJsonResponse(res, 500, corsHeaders, { ok: false, error: 'storage_read_failed' });
      return;
    }

    const headers = buildStalkerStorageHeaders(corsHeaders, {
      'Content-Type': 'application/octet-stream',
      'Content-Length': String(stat.size),
      'Last-Modified': stat.mtime.toUTCString()
    });
    res.writeHead(200, headers);
    if (method === 'HEAD') {
      res.end();
      return;
    }

    const stream = fs.createReadStream(filePath);
    stream.on('error', () => {
      if (!res.headersSent) {
        writeJsonResponse(res, 500, corsHeaders, { ok: false, error: 'storage_read_failed' });
      } else if (!res.writableEnded) {
        res.destroy();
      }
    });
    stream.pipe(res);
    return;
  }

  if (method === 'DELETE') {
    try {
      await fs.promises.rm(filePath, { force: true });
      res.writeHead(204, buildStalkerStorageHeaders(corsHeaders));
      res.end();
    } catch (_) {
      writeJsonResponse(res, 500, corsHeaders, { ok: false, error: 'storage_delete_failed' });
    }
    return;
  }

  const declaredLength = Number(req.headers['content-length'] || 0);
  if (Number.isFinite(declaredLength) && declaredLength > STALKER_STORAGE_MAX_FILE_BYTES) {
    writeJsonResponse(res, 413, corsHeaders, { ok: false, error: 'payload_too_large' });
    return;
  }

  const tempPath = `${filePath}.${process.pid}.${Date.now()}.${nodeCrypto.randomBytes(6).toString('hex')}.tmp`;
  try {
    await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
    await streamRequestToFile(req, tempPath, STALKER_STORAGE_MAX_FILE_BYTES);
    await fs.promises.rename(tempPath, filePath);
    res.writeHead(204, buildStalkerStorageHeaders(corsHeaders));
    res.end();
  } catch (error) {
    await fs.promises.rm(tempPath, { force: true }).catch(() => {});
    if (error && error.code === 'PAYLOAD_TOO_LARGE') {
      writeJsonResponse(res, 413, corsHeaders, { ok: false, error: 'payload_too_large' });
      return;
    }
    if (error && error.code === 'REQUEST_ABORTED') {
      writeJsonResponse(res, 400, corsHeaders, { ok: false, error: 'request_aborted' });
      return;
    }
    writeJsonResponse(res, 500, corsHeaders, { ok: false, error: 'storage_write_failed' });
  }
}

function streamRequestToFile(req, filePath, maxBytes) {
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(filePath, { flags: 'wx' });
    let totalBytes = 0;
    let settled = false;

    const fail = (error) => {
      if (settled) return;
      settled = true;
      try { output.destroy(); } catch (_) {}
      fs.rm(filePath, { force: true }, () => reject(error));
    };

    output.on('error', fail);
    req.on('error', fail);
    req.on('aborted', () => fail(Object.assign(new Error('request_aborted'), { code: 'REQUEST_ABORTED' })));
    req.on('data', (chunk) => {
      if (settled) return;
      totalBytes += chunk.length;
      if (totalBytes > maxBytes) {
        fail(Object.assign(new Error('payload_too_large'), { code: 'PAYLOAD_TOO_LARGE' }));
        try { req.resume(); } catch (_) {}
        return;
      }
      if (!output.write(chunk)) {
        try { req.pause(); } catch (_) {}
      }
    });
    output.on('drain', () => {
      try { req.resume(); } catch (_) {}
    });
    req.on('end', () => {
      if (settled) return;
      output.end();
    });
    output.on('finish', () => {
      if (settled) return;
      settled = true;
      resolve(totalBytes);
    });
  });
}

async function handleHomm3StorageRequest(urlObj, req, res, corsHeaders) {
  const match = String(urlObj?.pathname || '').match(/^\/homm3\/storage\/(saves)\/([A-Za-z0-9_-]+)\.bin$/);
  if (!match) {
    writeJsonResponse(res, 404, corsHeaders, { ok: false, error: 'not_found' });
    return;
  }

  const method = String(req.method || 'GET').toUpperCase();
  if (!['GET', 'HEAD', 'PUT', 'DELETE'].includes(method)) {
    writeJsonResponse(res, 405, corsHeaders, { ok: false, error: 'method_not_allowed' });
    return;
  }

  const filePath = resolveHomm3StorageFilePath(match[1], match[2]);
  if (!filePath) {
    writeJsonResponse(res, 400, corsHeaders, { ok: false, error: 'invalid_storage_key' });
    return;
  }

  if (method === 'GET' || method === 'HEAD') {
    let stat = null;
    try {
      stat = await fs.promises.stat(filePath);
    } catch (error) {
      if (error && error.code === 'ENOENT') {
        res.writeHead(204, buildHomm3StorageHeaders(corsHeaders));
        res.end();
        return;
      }
      writeJsonResponse(res, 500, corsHeaders, { ok: false, error: 'storage_read_failed' });
      return;
    }

    const headers = buildHomm3StorageHeaders(corsHeaders, {
      'Content-Type': 'application/octet-stream',
      'Content-Length': String(stat.size),
      'Last-Modified': stat.mtime.toUTCString()
    });
    res.writeHead(200, headers);
    if (method === 'HEAD') {
      res.end();
      return;
    }

    const stream = fs.createReadStream(filePath);
    stream.on('error', () => {
      if (!res.headersSent) {
        writeJsonResponse(res, 500, corsHeaders, { ok: false, error: 'storage_read_failed' });
      } else if (!res.writableEnded) {
        res.destroy();
      }
    });
    stream.pipe(res);
    return;
  }

  if (method === 'DELETE') {
    try {
      await fs.promises.rm(filePath, { force: true });
      res.writeHead(204, buildHomm3StorageHeaders(corsHeaders));
      res.end();
    } catch (_) {
      writeJsonResponse(res, 500, corsHeaders, { ok: false, error: 'storage_delete_failed' });
    }
    return;
  }

  const declaredLength = Number(req.headers['content-length'] || 0);
  if (Number.isFinite(declaredLength) && declaredLength > HOMM3_STORAGE_MAX_BYTES) {
    writeJsonResponse(res, 413, corsHeaders, { ok: false, error: 'payload_too_large' });
    return;
  }

  const tempPath = `${filePath}.${process.pid}.${Date.now()}.${nodeCrypto.randomBytes(6).toString('hex')}.tmp`;
  try {
    await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
    await streamRequestToFile(req, tempPath, HOMM3_STORAGE_MAX_BYTES);
    await fs.promises.rename(tempPath, filePath);
    res.writeHead(204, buildHomm3StorageHeaders(corsHeaders));
    res.end();
  } catch (error) {
    await fs.promises.rm(tempPath, { force: true }).catch(() => {});
    if (error && error.code === 'PAYLOAD_TOO_LARGE') {
      writeJsonResponse(res, 413, corsHeaders, { ok: false, error: 'payload_too_large' });
      return;
    }
    if (error && error.code === 'REQUEST_ABORTED') {
      writeJsonResponse(res, 400, corsHeaders, { ok: false, error: 'request_aborted' });
      return;
    }
    writeJsonResponse(res, 500, corsHeaders, { ok: false, error: 'storage_write_failed' });
  }
}

function proxyHomm3BundleResponse(targetUrl, req, res, corsHeaders, redirectsLeft = 5) {
  let upstreamUrl;
  try {
    upstreamUrl = new URL(targetUrl);
  } catch (_) {
    writeJsonResponse(res, 500, corsHeaders, { ok: false, error: 'invalid_bundle_target' });
    return;
  }

  const client = upstreamUrl.protocol === 'https:' ? https : http;
  const method = String(req.method || 'GET').toUpperCase();
  const headers = {
    'User-Agent': req.headers['user-agent'] || 'Mozilla/5.0',
    Accept: req.headers.accept || '*/*'
  };
  ['if-none-match', 'if-modified-since', 'range', 'cache-control', 'accept-language'].forEach((headerName) => {
    const value = req.headers[headerName];
    if (value) {
      headers[headerName] = value;
    }
  });

  const upstream = client.request(upstreamUrl, { method, headers }, (upres) => {
    const statusCode = upres.statusCode || 502;
    if (
      redirectsLeft > 0
      && [301, 302, 303, 307, 308].includes(statusCode)
      && upres.headers.location
    ) {
      upres.resume();
      const nextUrl = new URL(upres.headers.location, upstreamUrl).toString();
      proxyHomm3BundleResponse(nextUrl, req, res, corsHeaders, redirectsLeft - 1);
      return;
    }

    const responseHeaders = {
      ...corsHeaders,
      'Cache-Control': upres.headers['cache-control'] || 'public, max-age=3600',
      'Cross-Origin-Resource-Policy': 'cross-origin'
    };
    ['content-type', 'content-length', 'etag', 'last-modified', 'accept-ranges', 'content-range', 'content-encoding'].forEach((headerName) => {
      const value = upres.headers[headerName];
      if (value !== undefined) {
        responseHeaders[headerName] = value;
      }
    });

    res.writeHead(statusCode, responseHeaders);
    if (method === 'HEAD') {
      upres.resume();
      res.end();
      return;
    }
    upres.pipe(res);
  });

  upstream.on('error', () => {
    writeJsonResponse(res, 502, corsHeaders, { ok: false, error: 'bundle_proxy_failed' });
  });

  upstream.end();
}

function handleHomm3BundleRequest(urlObj, req, res, corsHeaders) {
  const method = String(req.method || 'GET').toUpperCase();
  if (!['GET', 'HEAD'].includes(method)) {
    writeJsonResponse(res, 405, corsHeaders, { ok: false, error: 'method_not_allowed' });
    return;
  }

  let fileName = '';
  try {
    const rawFileName = String(urlObj?.pathname || '').replace(/^\/homm3\/bundle\//, '');
    fileName = normalizeHomm3BundleFileName(decodeURIComponent(rawFileName));
  } catch (_) {
    fileName = '';
  }
  if (!fileName) {
    writeJsonResponse(res, 400, corsHeaders, { ok: false, error: 'invalid_bundle_file' });
    return;
  }

  const targetUrl = resolveHomm3BundleUrl(fileName);
  if (!targetUrl) {
    writeJsonResponse(res, 500, corsHeaders, { ok: false, error: 'bundle_target_unavailable' });
    return;
  }

  proxyHomm3BundleResponse(targetUrl, req, res, corsHeaders);
}

function isFirebaseRtdbProxyPath(pathname = '') {
  const pathName = String(pathname || '');
  return pathName === FIREBASE_RTDB_ROUTE_PREFIX || pathName.startsWith(`${FIREBASE_RTDB_ROUTE_PREFIX}/`);
}

function buildFirebaseRtdbUpstreamUrl(urlObj) {
  const pathname = String(urlObj?.pathname || '');
  const suffix = pathname.slice(FIREBASE_RTDB_ROUTE_PREFIX.length) || '/';
  const normalizedSuffix = suffix.startsWith('/') ? suffix : `/${suffix}`;
  const upstreamUrl = new URL(`${normalizedSuffix}${urlObj?.search || ''}`, FIREBASE_RTDB_UPSTREAM_ORIGIN);
  if (FIREBASE_RTDB_NAMESPACE && !upstreamUrl.searchParams.get('ns')) {
    upstreamUrl.searchParams.set('ns', FIREBASE_RTDB_NAMESPACE);
  }
  return upstreamUrl;
}

function buildFirebaseRtdbUpstreamWsUrl(urlObj) {
  const upstreamUrl = buildFirebaseRtdbUpstreamUrl(urlObj);
  upstreamUrl.protocol = upstreamUrl.protocol === 'https:' ? 'wss:' : 'ws:';
  return upstreamUrl;
}

function buildFirebaseRtdbLpContextPatch() {
  const nsJson = JSON.stringify(String(FIREBASE_RTDB_NAMESPACE || '').toLowerCase());
  const routePrefixJson = JSON.stringify(String(FIREBASE_RTDB_ROUTE_PREFIX || '/firebase-rtdb'));
  return `;(function(){try{var NS=${nsJson};var PREFIX=${routePrefixJson};var SUF1='.firebasedatabase.app';var SUF2='.firebaseio.com';function toU(raw){try{return new URL(String(raw||''),self.location.href);}catch(_){return null;}}function rw(raw){var u=toU(raw);if(!u||!u.hostname)return null;var h=String(u.hostname||'').toLowerCase();if(!(h.endsWith(SUF1)||h.endsWith(SUF2)))return null;var ns=String(u.searchParams.get('ns')||'').toLowerCase();if(ns&&NS&&ns!==NS)return null;var p=String(PREFIX||'/firebase-rtdb').replace(/\\/+$/,'');var path=String(u.pathname||'/');if(!path.startsWith('/'))path='/'+path;u.protocol=self.location.protocol;u.host=self.location.host;u.pathname=(p+path).replace(/\\/{2,}/g,'/');if(NS)u.searchParams.set('ns',NS);return u.toString();}if(typeof self.fetch==='function'){var nf=self.fetch.bind(self);self.fetch=function(i,n){try{if(typeof i==='string'||i instanceof URL){var r=rw(i);if(r)return nf(r,n);}else if(typeof Request!=='undefined'&&i instanceof Request){var rr=rw(i.url);if(rr)return nf(new Request(rr,i),n);}}catch(_){}return nf(i,n);};}if(typeof XMLHttpRequest!=='undefined'&&XMLHttpRequest.prototype&&typeof XMLHttpRequest.prototype.open==='function'){var xo=XMLHttpRequest.prototype.open;XMLHttpRequest.prototype.open=function(m,u){try{var r=rw(u);if(r)arguments[1]=r;}catch(_){}return xo.apply(this,arguments);};}if(typeof self.WebSocket==='function'){var OWS=self.WebSocket;function PWS(url,protocols){var finalUrl=url;try{var r=rw(url);if(r)finalUrl=r.replace(/^https:/i,'wss:').replace(/^http:/i,'ws:');}catch(_){}if(protocols===undefined)return new OWS(finalUrl);return new OWS(finalUrl,protocols);}PWS.prototype=OWS.prototype;try{Object.setPrototypeOf(PWS,OWS);}catch(_){}self.WebSocket=PWS;}if(self.document&&typeof self.document.createElement==='function'){var ce=self.document.createElement.bind(self.document);self.document.createElement=function(tag){var el=ce(tag);try{var t=String(tag||'').toLowerCase();if(t==='script'||t==='iframe'){var sa=el.setAttribute;if(typeof sa==='function'){el.setAttribute=function(n,v){try{if(String(n||'').toLowerCase()==='src'){var r=rw(v);if(r)v=r;}}catch(_){}return sa.call(this,n,v);};}}}catch(_){}return el;};}}catch(_){}})();\n`;
}

const { createFirebaseRtdbProxy } = require('./services/firebase_rtdb_proxy');
const proxyFirebaseRtdbRequest = createFirebaseRtdbProxy({
  buildUpstreamUrl: buildFirebaseRtdbUpstreamUrl,
  buildLpPatch: buildFirebaseRtdbLpContextPatch,
  routePrefix: FIREBASE_RTDB_ROUTE_PREFIX
});

function proxyYandexMusicRequest(urlObj, req, res, corsHeaders) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, corsHeaders);
    res.end('method_not_allowed');
    return;
  }

  const routePrefix = '/yandex-music';
  let apiPath = urlObj.pathname.slice(routePrefix.length);
  if (!apiPath || apiPath === '/') apiPath = '/search';
  if (!apiPath.startsWith('/')) apiPath = `/${apiPath}`;

  let upstreamUrl;
  try {
    upstreamUrl = new URL(apiPath, YANDEX_MUSIC_API_ORIGIN);
  } catch (_) {
    res.writeHead(400, corsHeaders);
    res.end('invalid_path');
    return;
  }

  urlObj.searchParams.forEach((value, key) => {
    upstreamUrl.searchParams.append(key, value);
  });

  const headers = {
    accept: req.headers.accept || 'application/json',
    'accept-language': req.headers['accept-language'] || 'ru,en;q=0.9',
    'user-agent': req.headers['user-agent'] || 'Mozilla/5.0 (KinosredaRealtimeProxy)'
  };
  if (YANDEX_MUSIC_SERVER_TOKEN) {
    headers.authorization = /^OAuth\s+/i.test(YANDEX_MUSIC_SERVER_TOKEN)
      ? YANDEX_MUSIC_SERVER_TOKEN
      : `OAuth ${YANDEX_MUSIC_SERVER_TOKEN}`;
  } else if (req.headers.authorization) {
    headers.authorization = req.headers.authorization;
  }
  if (req.headers['x-yandex-music-client']) {
    headers['x-yandex-music-client'] = req.headers['x-yandex-music-client'];
  } else if (YANDEX_MUSIC_CLIENT_HEADER) {
    headers['x-yandex-music-client'] = YANDEX_MUSIC_CLIENT_HEADER;
  }

  const upstream = https.request(upstreamUrl, {
    method: req.method,
    headers,
    timeout: 15000
  }, (upres) => {
    const responseHeaders = {
      ...corsHeaders,
      'content-type': upres.headers['content-type'] || 'application/json; charset=utf-8',
      'cache-control': upres.headers['cache-control'] || 'no-store'
    };
    res.writeHead(upres.statusCode || 502, responseHeaders);
    upres.pipe(res);
  });

  upstream.on('timeout', () => {
    upstream.destroy();
    if (!res.writableEnded) {
      res.writeHead(504, corsHeaders);
      res.end('proxy_timeout');
    }
  });

  upstream.on('error', () => {
    if (!res.writableEnded) {
      res.writeHead(502, corsHeaders);
      res.end('proxy_error');
    }
  });

  upstream.end();
}

function resolveKinopoiskUnofficialPath(pathname = '') {
  const path = String(pathname || '').trim();
  if (!path) return '';
  if (path === '/films/search-by-keyword') return '/api/v2.1/films/search-by-keyword';
  if (path === '/films') return '/api/v2.2/films';
  if (path === '/staff') return '/api/v1/staff';
  const seasons = path.match(/^\/films\/(\d+)\/seasons$/);
  if (seasons) return `/api/v2.2/films/${seasons[1]}/seasons`;
  const byId = path.match(/^\/films\/(\d+)$/);
  if (byId) return `/api/v2.2/films/${byId[1]}`;
  return '';
}

function getKinopoiskDayKey() {
  const date = new Date();
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function resetKinopoiskUsageIfNeeded() {
  const dayKey = getKinopoiskDayKey();
  if (kinopoiskUnofficialKeyState.dayKey === dayKey) return;
  kinopoiskUnofficialKeyState.dayKey = dayKey;
  kinopoiskUnofficialKeyState.usage.clear();
  kinopoiskUnofficialKeyState.activeIndex = 0;
}

function getKinopoiskUsage(index) {
  return Number(kinopoiskUnofficialKeyState.usage.get(index) || 0);
}

function incrementKinopoiskUsage(index) {
  const current = getKinopoiskUsage(index);
  kinopoiskUnofficialKeyState.usage.set(index, current + 1);
}

function pickKinopoiskKeyIndex(startOffset = 0) {
  resetKinopoiskUsageIfNeeded();
  const total = KINOPOISK_UNOFFICIAL_API_KEYS.length;
  if (!total) return -1;
  for (let i = 0; i < total; i += 1) {
    const index = (kinopoiskUnofficialKeyState.activeIndex + startOffset + i) % total;
    if (getKinopoiskUsage(index) < KINOPOISK_UNOFFICIAL_DAILY_LIMIT) {
      return index;
    }
  }
  return -1;
}

function requestKinopoiskUnofficialUpstream(upstreamUrl, reqMethod, keyValue, userAgent = '') {
  return new Promise((resolve, reject) => {
    const headers = {
      Accept: 'application/json, text/plain, */*',
      'User-Agent': userAgent || 'Kinosreda-Realtime/1.0',
      'X-API-KEY': keyValue
    };
    const upstream = https.request(upstreamUrl, {
      method: reqMethod,
      headers,
      timeout: 20000
    }, (upres) => {
      const chunks = [];
      upres.on('data', (chunk) => {
        if (Buffer.isBuffer(chunk)) chunks.push(chunk);
      });
      upres.on('end', () => {
        resolve({
          statusCode: Number(upres.statusCode || 0) || 502,
          headers: upres.headers || {},
          body: chunks.length ? Buffer.concat(chunks) : Buffer.alloc(0)
        });
      });
    });
    upstream.on('timeout', () => {
      upstream.destroy(new Error('upstream_timeout'));
    });
    upstream.on('error', reject);
    upstream.end();
  });
}

function proxyKinopoiskUnofficialRequest(urlObj, req, res, corsHeaders) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: false, error: 'method_not_allowed' }));
    return;
  }

  const routePrefix = '/ytm/kinopoisk';
  let apiPath = urlObj.pathname.slice(routePrefix.length);
  if (!apiPath) apiPath = '/films';
  if (!apiPath.startsWith('/')) apiPath = `/${apiPath}`;
  const upstreamPath = resolveKinopoiskUnofficialPath(apiPath);

  if (!upstreamPath) {
    res.writeHead(404, { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: false, error: 'not_found' }));
    return;
  }

  let upstreamUrl;
  try {
    upstreamUrl = new URL(`${KINOPOISK_UNOFFICIAL_API_BASE}${upstreamPath}`);
  } catch (_) {
    res.writeHead(500, { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: false, error: 'upstream_url_error' }));
    return;
  }

  urlObj.searchParams.forEach((value, key) => {
    const k = String(key || '').trim().toLowerCase();
    if (!k || k === 'token' || k === 'x-api-key') return;
    upstreamUrl.searchParams.append(key, value);
  });

  const ua = String(req.headers['user-agent'] || '').trim();
  const attemptsLimit = Math.max(1, KINOPOISK_UNOFFICIAL_API_KEYS.length);
  let lastError = null;
  let lastResponse = null;

  const run = async () => {
    for (let attempt = 0; attempt < attemptsLimit; attempt += 1) {
      const keyIndex = pickKinopoiskKeyIndex(attempt);
      if (keyIndex < 0) break;
      const keyValue = KINOPOISK_UNOFFICIAL_API_KEYS[keyIndex];
      incrementKinopoiskUsage(keyIndex);
      try {
        const response = await requestKinopoiskUnofficialUpstream(upstreamUrl, req.method, keyValue, ua);
        if (response.statusCode >= 200 && response.statusCode < 300) {
          kinopoiskUnofficialKeyState.activeIndex = keyIndex;
          const responseHeaders = {
            ...corsHeaders,
            'Content-Type': response.headers['content-type'] || 'application/json; charset=utf-8',
            'Cache-Control': 'no-store',
            'X-KP-Key-Index': String(keyIndex)
          };
          res.writeHead(response.statusCode, responseHeaders);
          if (req.method === 'HEAD') {
            res.end();
            return;
          }
          res.end(response.body);
          return;
        }
        // На первой ошибке переключаем ключ и делаем ретрай на следующий.
        lastResponse = { ...response, keyIndex };
      } catch (error) {
        lastError = error;
      }
    }

    if (res.writableEnded) return;
    if (lastResponse) {
      res.writeHead(lastResponse.statusCode || 502, {
        ...corsHeaders,
        'Content-Type': lastResponse.headers['content-type'] || 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-KP-Key-Index': String(lastResponse.keyIndex)
      });
      if (req.method === 'HEAD') {
        res.end();
        return;
      }
      res.end(lastResponse.body);
      return;
    }
    const allKeysExhausted = pickKinopoiskKeyIndex(0) < 0;
    res.writeHead(allKeysExhausted ? 429 : 502, { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({
      ok: false,
      error: allKeysExhausted ? 'all_api_keys_daily_limit_exhausted' : 'proxy_error',
      details: String(lastError?.message || 'kinopoisk_error')
    }));
  };
  run().catch((error) => {
    if (res.writableEnded) return;
    res.writeHead(502, { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: false, error: 'proxy_error', details: String(error?.message || 'kinopoisk_error') }));
  });
}

const movieCatalog = require('./services/movie_catalog').createMovieCatalog({
  async request(apiPath, params = {}) {
    const url = new URL(apiPath, KINOPOISK_UNOFFICIAL_API_BASE);
    Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, String(value)));
    for (let attempt = 0; attempt < Math.max(1, KINOPOISK_UNOFFICIAL_API_KEYS.length); attempt++) {
      const index = pickKinopoiskKeyIndex(attempt);
      if (index < 0) throw new Error('catalog_rate_limit');
      incrementKinopoiskUsage(index);
      const response = await requestKinopoiskUnofficialUpstream(url, 'GET', KINOPOISK_UNOFFICIAL_API_KEYS[index]);
      if (response.statusCode === 401 || response.statusCode === 402 || response.statusCode === 429) continue;
      if (response.statusCode < 200 || response.statusCode >= 300) throw new Error(`catalog_upstream_${response.statusCode}`);
      return JSON.parse(response.body.toString('utf8'));
    }
    throw new Error('catalog_rate_limit');
  }
});

async function handleMovieCatalog(urlObj, req, res, corsHeaders) {
  if (req.method !== 'GET') return writeJsonResponse(res, 405, corsHeaders, { error: 'method_not_allowed' });
  try {
    const input = Object.fromEntries(urlObj.searchParams);
    for (const name of ['genres', 'countries', 'types']) input[name] = urlObj.searchParams.getAll(name);
    const payload = urlObj.pathname.endsWith('/filters') ? await movieCatalog.directory()
      : urlObj.pathname.endsWith('/random') ? await movieCatalog.randomBatch(input) : await movieCatalog.query(input);
    writeJsonResponse(res, 200, corsHeaders, payload);
  } catch (error) {
    writeJsonResponse(res, ['unknown_filter', 'invalid_filter_range'].includes(error.message) ? 400 : 503, corsHeaders, { error: error.message || 'catalog_unavailable' });
  }
}

function normalizeAllohaKpId(urlObj) {
  const candidates = [
    urlObj.searchParams.get('kp'),
    urlObj.searchParams.get('kp_id'),
    urlObj.searchParams.get('kinopoisk_id'),
    urlObj.searchParams.get('kinopoiskId'),
    urlObj.searchParams.get('id')
  ];
  for (const candidate of candidates) {
    const normalized = String(candidate || '').trim();
    if (!normalized) continue;
    const digitsOnly = normalized.replace(/[^\d]/g, '');
    if (digitsOnly) return digitsOnly;
  }
  return '';
}

function parseJsonBufferSafe(body) {
  if (!Buffer.isBuffer(body) || body.length <= 0) return null;
  const text = body.toString('utf8').trim();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch (_) {
    return null;
  }
}

function normalizeIframeEmbedUrl(rawUrl = '') {
  let value = String(rawUrl || '').trim();
  if (!value) return '';
  if (
    (value.startsWith('"') && value.endsWith('"'))
    || (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1).trim();
  }
  value = value
    .replace(/\\\//g, '/')
    .replace(/\\u0026/gi, '&')
    .replace(/\\u003f/gi, '?')
    .replace(/\\u003d/gi, '=')
    .replace(/\\u002f/gi, '/');
  if (value.startsWith('//')) value = `https:${value}`;
  if (!/^https?:\/\//i.test(value)) {
    const match = value.match(/https?:\\\/\\\/[^\s"'<>]+|https?:\/\/[^\s"'<>]+/i);
    if (match && match[0]) {
      value = String(match[0]).replace(/\\\//g, '/');
    }
  }
  return /^https?:\/\//i.test(value) ? value : '';
}

function pushAllohaSource(target, dedupe, sourceName, iframeUrl) {
  const normalizedUrl = normalizeIframeEmbedUrl(iframeUrl);
  if (!normalizedUrl) return;
  if (!/^https?:\/\//i.test(normalizedUrl)) return;
  if (dedupe.has(normalizedUrl)) return;
  dedupe.add(normalizedUrl);
  const name = String(sourceName || '').trim() || 'Alloha';
  target.push({ source: name, iframeUrl: normalizedUrl });
}

function extractAllohaSources(payload) {
  const sources = [];
  const dedupe = new Set();
  const data = payload && typeof payload === 'object' ? (payload.data || payload) : null;
  if (!data || typeof data !== 'object') return sources;

  pushAllohaSource(sources, dedupe, 'Alloha', data.iframe);

  const addTranslationSource = (name, row) => {
    if (row && typeof row === 'object') {
      pushAllohaSource(sources, dedupe, name, row.iframe || row.url || '');
      return;
    }
    pushAllohaSource(sources, dedupe, name, row);
  };

  const translation = data.translation_iframe;
  if (Array.isArray(translation)) {
    translation.forEach((row, index) => addTranslationSource(`Озвучка ${index + 1}`, row));
  } else if (translation && typeof translation === 'object') {
    Object.entries(translation).forEach(([key, value]) => addTranslationSource(key, value));
  }

  pushAllohaSource(sources, dedupe, 'Трейлер', data.iframe_trailer);
  pushAllohaSource(sources, dedupe, 'Alloha', data.player_iframe);
  pushAllohaSource(sources, dedupe, 'Alloha', data.iframe_url);

  return sources;
}

function requestAllohaUpstream(urlObj, reqMethod, userAgent = '') {
  return new Promise((resolve, reject) => {
    const requestHeaders = {
      Accept: 'application/json, text/plain, */*',
      'Accept-Language': 'ru-RU,ru;q=0.9,en;q=0.8',
      'User-Agent': userAgent || 'Kinosreda-Realtime/1.0',
      'Accept-Encoding': 'gzip, deflate, br'
    };
    const upstream = https.request(urlObj, {
      method: reqMethod,
      headers: requestHeaders,
      timeout: ALLOHA_PROXY_TIMEOUT_MS,
      rejectUnauthorized: !ALLOHA_ALLOW_INSECURE_TLS
    }, (upres) => {
      const chunks = [];
      let totalLength = 0;
      upres.on('data', (chunk) => {
        if (!Buffer.isBuffer(chunk)) return;
        totalLength += chunk.length;
        if (totalLength > ALLOHA_PROXY_MAX_BODY_BYTES) {
          upstream.destroy(new Error('alloha_body_too_large'));
          return;
        }
        chunks.push(chunk);
      });
      upres.on('end', () => {
        resolve({
          statusCode: Number(upres.statusCode || 0) || 502,
          headers: upres.headers || {},
          body: chunks.length ? Buffer.concat(chunks, totalLength) : Buffer.alloc(0)
        });
      });
    });
    upstream.on('timeout', () => {
      upstream.destroy(new Error('alloha_upstream_timeout'));
    });
    upstream.on('error', reject);
    upstream.end();
  });
}

function proxyAllohaPlayersRequest(urlObj, req, res, corsHeaders) {
  const method = String(req.method || '').toUpperCase();
  if (method !== 'GET' && method !== 'HEAD') {
    res.writeHead(405, { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: false, error: 'method_not_allowed' }));
    return;
  }

  const kpId = normalizeAllohaKpId(urlObj);
  const rawMode = ['1', 'true', 'yes', 'raw'].includes(
    String(urlObj.searchParams.get('raw') || '').trim().toLowerCase()
  ) || /\/alloha\/raw$/i.test(String(urlObj.pathname || ''));
  if (!kpId) {
    res.writeHead(400, { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: false, error: 'missing_kp_id' }));
    return;
  }
  if (!ALLOHA_TOKEN) {
    res.writeHead(500, { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: false, error: 'missing_alloha_token' }));
    return;
  }

  let upstreamUrl;
  try {
    upstreamUrl = new URL(ALLOHA_UPSTREAM_URL);
    upstreamUrl.searchParams.set('token', ALLOHA_TOKEN);
    upstreamUrl.searchParams.set('kp', kpId);
    urlObj.searchParams.forEach((value, key) => {
      const k = String(key || '').trim().toLowerCase();
      if (!k || k === 'token' || k === 'kp' || k === 'kp_id' || k === 'kinopoisk_id' || k === 'kinopoiskid' || k === 'id') return;
      upstreamUrl.searchParams.append(key, value);
    });
  } catch (_) {
    res.writeHead(500, { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: false, error: 'upstream_url_error' }));
    return;
  }

  const ua = String(req.headers['user-agent'] || '').trim();
  requestAllohaUpstream(upstreamUrl, method, ua).then((response) => {
    const contentType = String(response?.headers?.['content-type'] || '').toLowerCase();
    const contentEncoding = String(response?.headers?.['content-encoding'] || '').trim();
    const decodedBody = kinoboxDecodeCompressedBody(response.body, contentEncoding);
    if (rawMode) {
      const statusCode = response.statusCode >= 200 && response.statusCode < 300
        ? 200
        : (Number(response.statusCode || 0) || 502);
      res.writeHead(statusCode, {
        ...corsHeaders,
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Alloha-Mode': 'raw'
      });
      if (method === 'HEAD') {
        res.end();
        return;
      }
      res.end(decodedBody);
      return;
    }
    const payload = parseJsonBufferSafe(decodedBody);

    if (!payload || typeof payload !== 'object') {
      const preview = String(decodedBody?.toString('utf8') || '').trim().slice(0, 200);
      const errorPayload = {
        ok: false,
        error: 'alloha_non_json_response',
        details: preview || 'empty_response',
        statusCode: Number(response.statusCode || 0) || 502
      };
      res.writeHead(502, {
        ...corsHeaders,
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store'
      });
      if (method === 'HEAD') {
        res.end();
        return;
      }
      res.end(JSON.stringify(errorPayload));
      return;
    }

    const sources = extractAllohaSources(payload);
    const responsePayload = {
      ok: true,
      status: payload.status || '',
      kpId,
      sources,
      total: sources.length
    };
    const statusCode = response.statusCode >= 200 && response.statusCode < 300
      ? 200
      : (Number(response.statusCode || 0) || 502);

    res.writeHead(statusCode, {
      ...corsHeaders,
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Alloha-Sources': String(sources.length),
      'X-Alloha-Upstream-Content-Type': contentType || 'application/json'
    });
    if (method === 'HEAD') {
      res.end();
      return;
    }
    res.end(JSON.stringify(responsePayload));
  }).catch((error) => {
    if (res.writableEnded) return;
    res.writeHead(502, {
      ...corsHeaders,
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store'
    });
    res.end(JSON.stringify({
      ok: false,
      error: 'alloha_proxy_error',
      details: String(error?.message || 'alloha_request_failed')
    }));
  });
}

function extractCollapsSources(payload) {
  const sources = [];
  const dedupe = new Set();
  if (!payload || typeof payload !== 'object') return sources;
  const rows = Array.isArray(payload.results) ? payload.results : [];
  rows.forEach((row, index) => {
    if (!row || typeof row !== 'object') return;
    const normalizedUrl = normalizeIframeEmbedUrl(row.iframe_url || row.iframe || row.url || '');
    if (!normalizedUrl) return;
    if (!/^https?:\/\//i.test(normalizedUrl)) return;
    if (dedupe.has(normalizedUrl)) return;
    dedupe.add(normalizedUrl);
    const translator = String(row.translator || row.translate || row.name || '').trim();
    const sourceName = translator ? `Collaps · ${translator}` : (index === 0 ? 'Collaps' : `Collaps ${index + 1}`);
    sources.push({ source: sourceName, iframeUrl: normalizedUrl });
  });
  return sources;
}

function requestCollapsUpstream(urlObj, reqMethod, userAgent = '') {
  return new Promise((resolve, reject) => {
    const requestHeaders = {
      Accept: 'application/json, text/plain, */*',
      'Accept-Language': 'ru-RU,ru;q=0.9,en;q=0.8',
      'User-Agent': userAgent || 'Kinosreda-Realtime/1.0',
      'Accept-Encoding': 'gzip, deflate, br'
    };
    const upstream = https.request(urlObj, {
      method: reqMethod,
      headers: requestHeaders,
      timeout: COLLAPS_PROXY_TIMEOUT_MS
    }, (upres) => {
      const chunks = [];
      let totalLength = 0;
      upres.on('data', (chunk) => {
        if (!Buffer.isBuffer(chunk)) return;
        totalLength += chunk.length;
        if (totalLength > COLLAPS_PROXY_MAX_BODY_BYTES) {
          upstream.destroy(new Error('collaps_body_too_large'));
          return;
        }
        chunks.push(chunk);
      });
      upres.on('end', () => {
        resolve({
          statusCode: Number(upres.statusCode || 0) || 502,
          headers: upres.headers || {},
          body: chunks.length ? Buffer.concat(chunks, totalLength) : Buffer.alloc(0)
        });
      });
    });
    upstream.on('timeout', () => {
      upstream.destroy(new Error('collaps_upstream_timeout'));
    });
    upstream.on('error', reject);
    upstream.end();
  });
}

function proxyCollapsPlayersRequest(urlObj, req, res, corsHeaders) {
  const method = String(req.method || '').toUpperCase();
  if (method !== 'GET' && method !== 'HEAD') {
    res.writeHead(405, { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: false, error: 'method_not_allowed' }));
    return;
  }

  const kpId = normalizeAllohaKpId(urlObj);
  if (!kpId) {
    res.writeHead(400, { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: false, error: 'missing_kp_id' }));
    return;
  }
  if (!COLLAPS_TOKEN) {
    res.writeHead(500, { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: false, error: 'missing_collaps_token' }));
    return;
  }

  let upstreamUrl;
  try {
    upstreamUrl = new URL(COLLAPS_UPSTREAM_URL);
    upstreamUrl.searchParams.set('token', COLLAPS_TOKEN);
    upstreamUrl.searchParams.set('kinopoisk_id', kpId);
    const season = String(urlObj.searchParams.get('season') || '').trim();
    const episode = String(urlObj.searchParams.get('episode') || '').trim();
    if (season) upstreamUrl.searchParams.set('season', season);
    if (episode) upstreamUrl.searchParams.set('episode', episode);
  } catch (_) {
    res.writeHead(500, { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: false, error: 'upstream_url_error' }));
    return;
  }

  const ua = String(req.headers['user-agent'] || '').trim();
  requestCollapsUpstream(upstreamUrl, method, ua).then((response) => {
    const contentType = String(response?.headers?.['content-type'] || '').toLowerCase();
    const contentEncoding = String(response?.headers?.['content-encoding'] || '').trim();
    const decodedBody = kinoboxDecodeCompressedBody(response.body, contentEncoding);
    const payload = parseJsonBufferSafe(decodedBody);

    if (!payload || typeof payload !== 'object') {
      const preview = String(decodedBody?.toString('utf8') || '').trim().slice(0, 200);
      res.writeHead(502, {
        ...corsHeaders,
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store'
      });
      if (method === 'HEAD') {
        res.end();
        return;
      }
      res.end(JSON.stringify({
        ok: false,
        error: 'collaps_non_json_response',
        details: preview || 'empty_response',
        statusCode: Number(response.statusCode || 0) || 502
      }));
      return;
    }

    const sources = extractCollapsSources(payload);
    const statusCode = response.statusCode >= 200 && response.statusCode < 300
      ? 200
      : (Number(response.statusCode || 0) || 502);
    res.writeHead(statusCode, {
      ...corsHeaders,
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store'
    });
    if (method === 'HEAD') {
      res.end();
      return;
    }
    res.end(JSON.stringify({
      ok: true,
      status: payload.status || '',
      kpId,
      sources,
      total: sources.length
    }));
  }).catch((error) => {
    if (res.writableEnded) return;
    res.writeHead(502, {
      ...corsHeaders,
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store'
    });
    res.end(JSON.stringify({
      ok: false,
      error: 'collaps_proxy_error',
      details: String(error?.message || 'collaps_request_failed')
    }));
  });
}

function resolveKinoBdIframeUrl(rawValue = '') {
  const value = String(rawValue || '').trim();
  if (!value) return '';
  const tryNormalize = (candidate) => {
    const normalized = normalizeIframeEmbedUrl(
      String(candidate || '')
        .replace(/&amp;/gi, '&')
        .replace(/&#x2f;/gi, '/')
        .replace(/&#47;/gi, '/')
    );
    return normalized;
  };
  const patterns = [
    /<iframe[^>]*\bdata-src\s*=\s*["']([^"']+)["']/i,
    /<iframe[^>]*\bsrc\s*=\s*["']([^"']+)["']/i
  ];
  for (const pattern of patterns) {
    const match = value.match(pattern);
    if (!match || !match[1]) continue;
    const normalized = tryNormalize(match[1]);
    if (normalized) return normalized;
  }
  return tryNormalize(value);
}

function normalizeDigitsOnly(value) {
  const normalized = String(value || '').trim().replace(/[^\d]/g, '');
  return normalized || '';
}

function escapeHtmlAttr(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function buildKinoBdEmbedUrl(baseUrl, row = {}, fallbackKpId = '') {
  const inid = normalizeDigitsOnly(row.inid || row.id);
  if (!inid) return '';
  const kpId = normalizeDigitsOnly(row.kinopoisk_id || row.kp_id || fallbackKpId);
  const title = String(row.name_russian || row.name_original || '').trim();
  const upstreamIframe = resolveKinoBdIframeUrl(row.iframe || row.iframe_url || row.url || '');
  let origin = String(baseUrl || '').trim().replace(/\/+$/, '');
  if (!origin) origin = `http://localhost:${LOCAL_SERVER_PORT}`;
  const embedUrl = new URL('/ytm/kinobd/embed', origin);
  embedUrl.searchParams.set('inid', inid);
  if (kpId) embedUrl.searchParams.set('kp', kpId);
  if (title) embedUrl.searchParams.set('title', title);
  if (upstreamIframe) embedUrl.searchParams.set('fallback_iframe', upstreamIframe);
  return embedUrl.toString();
}

function extractKinoBdSources(payload, options = {}) {
  const list = Array.isArray(payload)
    ? payload
    : (Array.isArray(payload?.data) ? payload.data : []);
  const baseUrl = String(options.baseUrl || '').trim();
  const fallbackKpId = String(options.kpId || '').trim();
  const dedupe = new Set();
  const sources = [];
  list.forEach((row, index) => {
    if (!row || typeof row !== 'object') return;
    const embedUrl = buildKinoBdEmbedUrl(baseUrl, row, fallbackKpId);
    const directUrl = resolveKinoBdIframeUrl(
      row.iframe_url
      || row.iframeUrl
      || row.url
      || row.player_url
      || row.iframe
      || row.player
      || ''
    );
    const url = embedUrl || directUrl;
    if (!url || dedupe.has(url)) return;
    dedupe.add(url);
    const label = String(
      row.translation
      || row.translator
      || row.voice
      || row.name
      || ''
    ).trim();
    sources.push({
      source: label ? `KinoBD · ${label}` : (index === 0 ? 'KinoBD' : `KinoBD ${index + 1}`),
      iframeUrl: url
    });
  });
  return sources;
}

function proxyKinoBdEmbedPage(urlObj, req, res, corsHeaders) {
  const method = String(req.method || '').toUpperCase();
  if (method !== 'GET' && method !== 'HEAD') {
    res.writeHead(405, { ...corsHeaders, 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('method_not_allowed');
    return;
  }
  const inid = normalizeDigitsOnly(urlObj.searchParams.get('inid') || urlObj.searchParams.get('id'));
  if (!inid) {
    res.writeHead(400, { ...corsHeaders, 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end('missing_inid');
    return;
  }
  const kpId = normalizeDigitsOnly(urlObj.searchParams.get('kp') || '');
  const title = String(urlObj.searchParams.get('title') || '').trim().slice(0, 200);
  const fallbackIframe = resolveKinoBdIframeUrl(String(urlObj.searchParams.get('fallback_iframe') || ''));
  const payloadAttrs = [
    `id="kinobd"`,
    `data-fast="1"`,
    `data-inid="${escapeHtmlAttr(inid)}"`,
    `data-player="collaps,voidboost,videocdn,alloha,ashdi,kodik,vibix,bazon,youtube,hdvb,iframe,pleer,ustore,cdnmovies,kholobok,kinotochka,ext,trailer,nf,torrent"`
  ];
  if (kpId) payloadAttrs.push(`data-kinopoisk="${escapeHtmlAttr(kpId)}"`);
  if (title) payloadAttrs.push(`data-title="${escapeHtmlAttr(title)}"`);
  const fallbackMarkup = fallbackIframe
    ? `<iframe src="${escapeHtmlAttr(fallbackIframe)}" title="KinoBD fallback" allowfullscreen frameborder="0"></iframe>`
    : '';
  const html = `<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
  <title>KinoBD Player</title>
  <style>
    html,body{margin:0;padding:0;width:100%;height:100%;background:#000;overflow:hidden}
    #kinobd,#kinobd-wrapper{position:relative;width:100%;height:100%;min-height:100%}
    iframe{width:100%;height:100%;border:0}
  </style>
</head>
<body>
  <div ${payloadAttrs.join(' ')}>${fallbackMarkup}</div>
  <script src="https://kinobd.net/js/player_.js"></script>
</body>
</html>`;
  res.writeHead(200, {
    ...corsHeaders,
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  if (method === 'HEAD') {
    res.end();
    return;
  }
  res.end(html);
}

function requestKinoBdUpstream(urlObj, reqMethod, userAgent = '') {
  return new Promise((resolve, reject) => {
    const requestHeaders = {
      Accept: 'application/json, text/plain, */*',
      'Accept-Language': 'ru-RU,ru;q=0.9,en;q=0.8',
      'User-Agent': userAgent || 'Kinosreda-Realtime/1.0',
      'Accept-Encoding': 'gzip, deflate, br'
    };
    const upstream = https.request(urlObj, {
      method: reqMethod,
      headers: requestHeaders,
      timeout: KINOBD_PROXY_TIMEOUT_MS
    }, (upres) => {
      const chunks = [];
      let totalLength = 0;
      upres.on('data', (chunk) => {
        if (!Buffer.isBuffer(chunk)) return;
        totalLength += chunk.length;
        if (totalLength > KINOBD_PROXY_MAX_BODY_BYTES) {
          upstream.destroy(new Error('kinobd_body_too_large'));
          return;
        }
        chunks.push(chunk);
      });
      upres.on('end', () => {
        resolve({
          statusCode: Number(upres.statusCode || 0) || 502,
          headers: upres.headers || {},
          body: chunks.length ? Buffer.concat(chunks, totalLength) : Buffer.alloc(0)
        });
      });
    });
    upstream.on('timeout', () => {
      upstream.destroy(new Error('kinobd_upstream_timeout'));
    });
    upstream.on('error', reject);
    upstream.end();
  });
}

function proxyKinoBdPlayersRequest(urlObj, req, res, corsHeaders) {
  const method = String(req.method || '').toUpperCase();
  if (method !== 'GET' && method !== 'HEAD') {
    res.writeHead(405, { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: false, error: 'method_not_allowed' }));
    return;
  }

  const kpId = normalizeAllohaKpId(urlObj);
  const q = String(urlObj.searchParams.get('q') || kpId).trim();
  if (!q) {
    res.writeHead(400, { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: false, error: 'missing_query_or_kp_id' }));
    return;
  }

  let upstreamUrl;
  try {
    upstreamUrl = new URL(KINOBD_UPSTREAM_URL);
    upstreamUrl.searchParams.set('q', q);
    upstreamUrl.searchParams.set(
      'type',
      String(urlObj.searchParams.get('type') || (kpId ? 'kp_id' : 'query')).trim() || 'kp_id'
    );
    const page = String(urlObj.searchParams.get('page') || '1').trim();
    if (/^\d+$/.test(page) && Number(page) > 0) {
      upstreamUrl.searchParams.set('page', page);
    }
  } catch (_) {
    res.writeHead(500, { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: false, error: 'upstream_url_error' }));
    return;
  }

  const ua = String(req.headers['user-agent'] || '').trim();
  requestKinoBdUpstream(upstreamUrl, method, ua).then((response) => {
    const contentEncoding = String(response?.headers?.['content-encoding'] || '').trim();
    const decodedBody = kinoboxDecodeCompressedBody(response.body, contentEncoding);
    const payload = parseJsonBufferSafe(decodedBody);
    if (!payload || typeof payload !== 'object') {
      const preview = String(decodedBody?.toString('utf8') || '').trim().slice(0, 200);
      res.writeHead(502, {
        ...corsHeaders,
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store'
      });
      if (method === 'HEAD') {
        res.end();
        return;
      }
      res.end(JSON.stringify({
        ok: false,
        error: 'kinobd_non_json_response',
        details: preview || 'empty_response',
        statusCode: Number(response.statusCode || 0) || 502
      }));
      return;
    }

    const sources = extractKinoBdSources(payload, {
      baseUrl: getRequestBaseUrl(req),
      kpId
    });
    const statusCode = response.statusCode >= 200 && response.statusCode < 300
      ? 200
      : (Number(response.statusCode || 0) || 502);
    res.writeHead(statusCode, {
      ...corsHeaders,
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store'
    });
    if (method === 'HEAD') {
      res.end();
      return;
    }
    res.end(JSON.stringify({
      ok: true,
      kpId,
      query: q,
      total: sources.length,
      sources
    }));
  }).catch((error) => {
    if (res.writableEnded) return;
    res.writeHead(502, {
      ...corsHeaders,
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store'
    });
    res.end(JSON.stringify({
      ok: false,
      error: 'kinobd_proxy_error',
      details: String(error?.message || 'kinobd_request_failed')
    }));
  });
}

function isAllowedYandexDownloadHost(hostname) {
  if (!hostname) return false;
  if (hostname === 'storage.mds.yandex.net' || hostname.endsWith('.mds.yandex.net')) return true;
  if (hostname === 'api.music.yandex.net' || hostname === 'api.music.yandex.ru') return true;
  if (hostname.endsWith('.music.yandex.net') || hostname.endsWith('.music.yandex.ru')) return true;
  return false;
}

function isAllowedYandexStreamHost(hostname) {
  if (!hostname) return false;
  if (isAllowedYandexDownloadHost(hostname)) return true;
  if (hostname.endsWith('.yandex.net') || hostname.endsWith('.yandex.ru')) return true;
  return false;
}

function getRequestBaseUrl(req) {
  if (PUBLIC_BASE_URL) return PUBLIC_BASE_URL;
  const forwardedProtoRaw = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim();
  let protocol = forwardedProtoRaw;
  if (!protocol) {
    const originRaw = String(req.headers.origin || '').trim();
    if (originRaw) {
      try {
        protocol = new URL(originRaw).protocol.replace(':', '').toLowerCase();
      } catch (_) {}
    }
  }
  if (!protocol) {
    const hostRaw = String(req.headers.host || '').trim().toLowerCase();
    if (hostRaw.includes('localhost') || hostRaw.startsWith('127.0.0.1') || hostRaw.startsWith('0.0.0.0')) {
      protocol = 'http';
    } else {
      // Behind reverse proxy (nginx), req.socket.encrypted can be false even for HTTPS public origin.
      // Prefer HTTPS for non-local hosts unless proxy explicitly says otherwise.
      protocol = 'https';
    }
  }
  const host = String(req.headers.host || '').trim();
  if (!host) return '';
  return `${protocol}://${host}`;
}

function buildYandexStreamProxyUrl(req, targetUrl) {
  const base = getRequestBaseUrl(req);
  if (!base) return String(targetUrl || '');
  return `${base}/ym-audio-stream?url=${encodeURIComponent(String(targetUrl || ''))}`;
}

function isAllowedYouTubeStreamHost(hostname) {
  if (!hostname) return false;
  if (hostname === 'googlevideo.com' || hostname.endsWith('.googlevideo.com')) return true;
  if (hostname === 'youtube.com' || hostname.endsWith('.youtube.com')) return true;
  if (hostname === 'youtube-nocookie.com' || hostname.endsWith('.youtube-nocookie.com')) return true;
  if (hostname === 'ytimg.com' || hostname.endsWith('.ytimg.com')) return true;
  if (hostname === 'googleusercontent.com' || hostname.endsWith('.googleusercontent.com')) return true;
  return false;
}

function buildYouTubeStreamProxyUrl(req, targetUrl, mode = '') {
  const base = getRequestBaseUrl(req);
  if (!base) return String(targetUrl || '');
  let safeMode = String(mode || '').trim().toLowerCase();
  if (!safeMode && YTM_PROXY_URL) {
    safeMode = 'proxy';
  }
  const suffix = safeMode === 'proxy' || safeMode === 'direct'
    ? `&mode=${encodeURIComponent(safeMode)}`
    : '';
  return `${base}/ytm-audio-stream?url=${encodeURIComponent(String(targetUrl || ''))}${suffix}`;
}

function cleanupYtMusicStreamLinkCache() {
  const now = Date.now();
  for (const [key, value] of ytmStreamLinkCache.entries()) {
    const expiresAt = Number(value && value.expiresAt || 0);
    if (expiresAt > 0 && expiresAt <= now) {
      ytmStreamLinkCache.delete(key);
    }
  }
  for (const [key, value] of ytmVideoLinkCache.entries()) {
    const expiresAt = Number(value && value.expiresAt || 0);
    if (expiresAt > 0 && expiresAt <= now) {
      ytmVideoLinkCache.delete(key);
    }
  }
}

function cleanupYtMusicTrackCache() {
  const now = Date.now();
  for (const [key, value] of ytmTrackCache.entries()) {
    const expiresAt = Number(value && value.expiresAt || 0);
    if (expiresAt > 0 && expiresAt <= now) {
      ytmTrackCache.delete(key);
    }
  }
  while (ytmTrackCache.size > YTMUSIC_TRACK_CACHE_MAX_ITEMS) {
    const oldestKey = ytmTrackCache.keys().next().value;
    if (oldestKey == null) break;
    ytmTrackCache.delete(oldestKey);
  }
}

function getCachedYtMusicTrack(videoId, { allowStale = false } = {}) {
  const key = extractYouTubeVideoId(videoId);
  if (!key) return null;
  const row = ytmTrackCache.get(key);
  if (!row || typeof row !== 'object') return null;
  const expiresAt = Number(row.expiresAt || 0);
  if (!allowStale && expiresAt > 0 && expiresAt <= Date.now()) {
    ytmTrackCache.delete(key);
    return null;
  }
  const payload = row.payload;
  if (!payload || typeof payload !== 'object') return null;
  return payload;
}

function setCachedYtMusicTrack(videoId, payload, ttlMs = YTMUSIC_TRACK_CACHE_TTL_MS) {
  const key = extractYouTubeVideoId(videoId);
  if (!key || !payload || typeof payload !== 'object') return;
  cleanupYtMusicTrackCache();
  ytmTrackCache.set(key, {
    payload,
    expiresAt: Date.now() + Math.max(5000, Number(ttlMs || 0) || YTMUSIC_TRACK_CACHE_TTL_MS)
  });
}

function buildFallbackYtMusicTrackPayload(videoId, warning = '') {
  const id = extractYouTubeVideoId(videoId);
  if (!id) return { ok: false, error: 'invalid_video_id' };
  const result = {
    track: {
      provider: 'youtube',
      trackId: id,
      videoId: id,
      title: `Track ${id}`,
      artists: [],
      durationMs: 0,
      coverUrl: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
      sourceUrl: `https://music.youtube.com/watch?v=${id}`
    }
  };
  const payload = { ok: true, result };
  if (warning) payload.warning = String(warning || '');
  return payload;
}

function cleanupFetchImageCache() {
  const now = Date.now();
  for (const [key, value] of fetchImageCache.entries()) {
    const expiresAt = Number(value && value.expiresAt || 0);
    if (expiresAt > 0 && expiresAt <= now) {
      fetchImageCache.delete(key);
    }
  }
  while (fetchImageCache.size > FETCH_IMAGE_CACHE_MAX_ITEMS) {
    const oldestKey = fetchImageCache.keys().next().value;
    if (oldestKey == null) break;
    fetchImageCache.delete(oldestKey);
  }
}

function getCachedFetchImage(targetUrl, { allowStale = false } = {}) {
  const key = String(targetUrl || '').trim();
  if (!key) return null;
  const row = fetchImageCache.get(key);
  if (!row || typeof row !== 'object') return null;
  const expiresAt = Number(row.expiresAt || 0);
  if (!allowStale && expiresAt > 0 && expiresAt <= Date.now()) {
    fetchImageCache.delete(key);
    return null;
  }
  const body = row.body;
  if (!Buffer.isBuffer(body) || body.length <= 0) return null;
  return {
    body,
    contentType: String(row.contentType || '').trim() || guessImageContentType(key)
  };
}

function setCachedFetchImage(targetUrl, body, contentType = '') {
  const key = String(targetUrl || '').trim();
  if (!key || !Buffer.isBuffer(body) || body.length <= 0) return;
  if (body.length > FETCH_IMAGE_CACHE_MAX_BYTES) return;
  cleanupFetchImageCache();
  fetchImageCache.set(key, {
    body,
    contentType: String(contentType || '').trim() || guessImageContentType(key),
    expiresAt: Date.now() + FETCH_IMAGE_CACHE_TTL_MS
  });
}

const kinoboxHttpAgent = new https.Agent({
  keepAlive: true,
  maxSockets: 24,
  maxFreeSockets: 8,
  timeout: KINOBOX_PROXY_TIMEOUT_MS,
  ALPNProtocols: ['http/1.1']
});
const kinoboxUpstreamOrigin = (() => {
  try {
    return new URL(KINOBOX_UPSTREAM_URL);
  } catch (_) {
    return new URL('https://api.kinobox.tv/api/players');
  }
})();

function kinoboxSleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(ms || 0) || 0)));
}

function kinoboxPickRandom(list, fallback = '') {
  if (!Array.isArray(list) || list.length === 0) return String(fallback || '');
  try {
    const index = nodeCrypto.randomInt(0, list.length);
    return String(list[index] || fallback || '');
  } catch (_) {
    const index = Math.floor(Math.random() * list.length);
    return String(list[index] || fallback || '');
  }
}

function cleanupKinoboxProxyRate() {
  const now = Date.now();
  for (const [ip, row] of kinoboxProxyRate.entries()) {
    if (!row || Number(row.resetAt || 0) <= now) {
      kinoboxProxyRate.delete(ip);
    }
  }
}

function consumeKinoboxProxyRate(ipRaw) {
  const ip = String(ipRaw || '').trim() || 'unknown';
  cleanupKinoboxProxyRate();
  const now = Date.now();
  const existing = kinoboxProxyRate.get(ip);
  if (!existing || Number(existing.resetAt || 0) <= now) {
    kinoboxProxyRate.set(ip, { count: 1, resetAt: now + KINOBOX_PROXY_RATE_WINDOW_MS });
    return { ok: true, remaining: KINOBOX_PROXY_RATE_LIMIT_PER_IP - 1 };
  }
  if (existing.count >= KINOBOX_PROXY_RATE_LIMIT_PER_IP) {
    return { ok: false, remaining: 0, retryAfterMs: Math.max(250, existing.resetAt - now) };
  }
  existing.count += 1;
  kinoboxProxyRate.set(ip, existing);
  return { ok: true, remaining: Math.max(0, KINOBOX_PROXY_RATE_LIMIT_PER_IP - existing.count) };
}

function cleanupKinoboxProxyCache() {
  const now = Date.now();
  for (const [key, row] of kinoboxProxyCache.entries()) {
    if (!row || typeof row !== 'object') {
      kinoboxProxyCache.delete(key);
      continue;
    }
    const staleExpiresAt = Number(row.staleExpiresAt || 0);
    if (staleExpiresAt > 0 && staleExpiresAt <= now) {
      kinoboxProxyCache.delete(key);
    }
  }
  while (kinoboxProxyCache.size > KINOBOX_PROXY_MAX_ITEMS) {
    const oldestKey = kinoboxProxyCache.keys().next().value;
    if (oldestKey == null) break;
    kinoboxProxyCache.delete(oldestKey);
  }
}

function setCachedKinoboxProxy(key, payload) {
  if (!key || !payload || typeof payload !== 'object') return;
  const body = payload.body;
  if (!Buffer.isBuffer(body) || body.length <= 0) return;
  cleanupKinoboxProxyCache();
  kinoboxProxyCache.set(key, {
    body,
    contentType: String(payload.contentType || '').trim() || 'application/json; charset=utf-8',
    etag: String(payload.etag || '').trim(),
    lastModified: String(payload.lastModified || '').trim(),
    expiresAt: Date.now() + KINOBOX_PROXY_CACHE_TTL_MS,
    staleExpiresAt: Date.now() + KINOBOX_PROXY_STALE_TTL_MS,
    cacheControl: String(payload.cacheControl || '').trim()
  });
}

function getCachedKinoboxProxy(key, { allowStale = false } = {}) {
  const row = kinoboxProxyCache.get(String(key || ''));
  if (!row || typeof row !== 'object') return null;
  const now = Date.now();
  const expiresAt = Number(row.expiresAt || 0);
  const staleExpiresAt = Number(row.staleExpiresAt || 0);
  if (!allowStale && expiresAt > 0 && expiresAt <= now) return null;
  if (allowStale && staleExpiresAt > 0 && staleExpiresAt <= now) return null;
  if (!Buffer.isBuffer(row.body) || row.body.length <= 0) return null;
  return row;
}

function getKinoboxClientIp(req) {
  const forwarded = String(req.headers['x-forwarded-for'] || '').trim();
  if (forwarded) {
    const first = forwarded.split(',')[0];
    if (first && first.trim()) return first.trim();
  }
  return String((req.socket && req.socket.remoteAddress) || '').trim() || 'unknown';
}

function normalizeKinoboxQuery(urlObj) {
  const params = new URLSearchParams();
  KINOBOX_ALLOWED_QUERY_KEYS.forEach((key) => {
    let value = String(urlObj.searchParams.get(key) || '').trim();
    if (!value) return;
    if (key === 'imdb') {
      const imdb = value.match(/tt\d+/i);
      value = imdb ? imdb[0].toLowerCase() : '';
    } else if (key === 'tmdb' || key === 'kinopoisk') {
      const id = value.match(/\d+/);
      value = id ? id[0] : '';
    } else if (key === 'title' || key === 'query') {
      value = value.slice(0, 180);
    }
    if (!value) return;
    params.set(key, value);
  });
  return params;
}

function isRetryableKinoboxStatus(statusCode) {
  const code = Number(statusCode || 0);
  return code === 408 || code === 425 || code === 429 || code >= 500;
}

function kinoboxEnsureCookieJarDir() {
  try {
    fs.mkdirSync(KINOBOX_COOKIE_JAR_DIR, { recursive: true });
  } catch (_) {}
}

function kinoboxPickProxyForAttempt(attempt = 0) {
  const pool = Array.isArray(KINOBOX_PROXY_POOL) && KINOBOX_PROXY_POOL.length
    ? KINOBOX_PROXY_POOL
    : ['direct'];
  const baseOffset = Math.floor(Date.now() / KINOBOX_COOKIE_BUCKET_TTL_MS) % pool.length;
  const index = (baseOffset + Math.max(0, Number(attempt || 0) || 0)) % pool.length;
  return String(pool[index] || 'direct').trim() || 'direct';
}

function kinoboxBuildCookieJarPath(proxyValue = 'direct', attempt = 0) {
  const safeProxy = String(proxyValue || 'direct').trim() || 'direct';
  const hash = nodeCrypto.createHash('sha1').update(safeProxy).digest('hex').slice(0, 14);
  const bucketBase = Math.floor(Date.now() / KINOBOX_COOKIE_BUCKET_TTL_MS);
  const bucket = (bucketBase + Math.max(0, Number(attempt || 0) || 0)) % KINOBOX_COOKIE_ROTATE_BUCKETS;
  return path.join(KINOBOX_COOKIE_JAR_DIR, `jar-${hash}-${bucket}.txt`);
}

function kinoboxParseHeaderBlock(rawHeaders = '') {
  const text = String(rawHeaders || '');
  if (!text) return { statusCode: 0, headers: {} };
  const parts = text.split(/\r?\n\r?\n/g).map((item) => item.trim()).filter(Boolean);
  let block = '';
  for (let i = parts.length - 1; i >= 0; i -= 1) {
    if (/^HTTP\/\d/i.test(parts[i])) {
      block = parts[i];
      break;
    }
  }
  if (!block && parts.length) block = parts[parts.length - 1];
  const lines = block.split(/\r?\n/g).map((line) => line.trim()).filter(Boolean);
  const statusLine = lines[0] || '';
  const statusMatch = statusLine.match(/^HTTP\/\d(?:\.\d)?\s+(\d{3})/i);
  const statusCode = statusMatch ? Number(statusMatch[1]) : 0;
  const headers = {};
  lines.slice(1).forEach((line) => {
    const separator = line.indexOf(':');
    if (separator <= 0) return;
    const key = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();
    if (!key) return;
    headers[key] = headers[key] ? `${headers[key]}, ${value}` : value;
  });
  return { statusCode, headers };
}

function kinoboxDecodeCompressedBody(body, contentEncoding = '') {
  if (!Buffer.isBuffer(body) || body.length <= 0) return body;
  const encoding = String(contentEncoding || '').trim().toLowerCase();
  if (!encoding || encoding === 'identity') return body;
  try {
    if (encoding.includes('gzip')) return zlib.gunzipSync(body);
    if (encoding.includes('deflate')) return zlib.inflateSync(body);
    if (encoding.includes('br')) return zlib.brotliDecompressSync(body);
  } catch (_) {
    return body;
  }
  return body;
}

function kinoboxNormalizeJsonBody(body, contentType = '') {
  if (!Buffer.isBuffer(body) || body.length <= 0) {
    return {
      body: Buffer.isBuffer(body) ? body : Buffer.alloc(0),
      contentType: String(contentType || '').trim() || 'application/json; charset=utf-8'
    };
  }
  const normalizedType = String(contentType || '').trim().toLowerCase();
  if (normalizedType.includes('application/json')) {
    return { body, contentType: String(contentType || '').trim() || 'application/json; charset=utf-8' };
  }
  const text = body.toString('utf8').trim();
  if (!text) return { body, contentType: String(contentType || '').trim() || 'application/octet-stream' };
  if (text[0] !== '{' && text[0] !== '[') {
    return { body, contentType: String(contentType || '').trim() || 'application/octet-stream' };
  }
  try {
    const parsed = JSON.parse(text);
    return {
      body: Buffer.from(JSON.stringify(parsed), 'utf8'),
      contentType: 'application/json; charset=utf-8'
    };
  } catch (_) {
    return { body, contentType: String(contentType || '').trim() || 'application/octet-stream' };
  }
}

function requestKinoboxUpstreamNative(params, cacheRow = null) {
  return new Promise((resolve, reject) => {
    const upstreamUrl = new URL(kinoboxUpstreamOrigin.toString());
    upstreamUrl.search = params.toString();
    const headers = {
      Accept: 'application/json, text/plain, */*',
      'Accept-Language': kinoboxPickRandom(KINOBOX_ACCEPT_LANGUAGE_POOL, 'ru,en;q=0.8'),
      'User-Agent': kinoboxPickRandom(KINOBOX_UA_POOL, 'Mozilla/5.0'),
      'Accept-Encoding': 'gzip, deflate, br',
      Origin: 'https://kinobox.tv',
      Referer: 'https://kinobox.tv/',
      Connection: 'keep-alive',
      'Cache-Control': 'no-cache',
      Pragma: 'no-cache'
    };
    if (cacheRow && cacheRow.etag) headers['If-None-Match'] = cacheRow.etag;
    if (cacheRow && cacheRow.lastModified) headers['If-Modified-Since'] = cacheRow.lastModified;

    const request = https.request(upstreamUrl, {
      method: 'GET',
      headers,
      agent: kinoboxHttpAgent
    }, (response) => {
      const chunks = [];
      let totalLength = 0;
      response.on('data', (chunk) => {
        if (!Buffer.isBuffer(chunk)) return;
        totalLength += chunk.length;
        if (totalLength > KINOBOX_PROXY_MAX_BODY_BYTES) {
          request.destroy(new Error('kinobox_body_too_large'));
          return;
        }
        chunks.push(chunk);
      });
      response.on('end', () => {
        const rawBody = chunks.length ? Buffer.concat(chunks, totalLength) : Buffer.alloc(0);
        const contentType = String(response.headers['content-type'] || '').trim();
        const contentEncoding = String(response.headers['content-encoding'] || '').trim();
        const decodedBody = kinoboxDecodeCompressedBody(rawBody, contentEncoding);
        const normalized = kinoboxNormalizeJsonBody(decodedBody, contentType);
        resolve({
          statusCode: Number(response.statusCode || 0),
          body: normalized.body,
          contentType: normalized.contentType,
          etag: String(response.headers.etag || '').trim(),
          lastModified: String(response.headers['last-modified'] || '').trim(),
          cacheControl: String(response.headers['cache-control'] || '').trim(),
          transport: 'native'
        });
      });
    });

    request.on('error', reject);
    request.setTimeout(KINOBOX_PROXY_TIMEOUT_MS, () => {
      request.destroy(new Error('kinobox_upstream_timeout'));
    });
    request.end();
  });
}

function requestKinoboxUpstreamViaCurl(params, cacheRow = null, attempt = 0) {
  return new Promise((resolve, reject) => {
    const upstreamUrl = new URL(kinoboxUpstreamOrigin.toString());
    upstreamUrl.search = params.toString();
    kinoboxEnsureCookieJarDir();

    const proxyValue = kinoboxPickProxyForAttempt(attempt);
    const cookieJarPath = kinoboxBuildCookieJarPath(proxyValue, attempt);
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kinobox-curl-'));
    const headerFile = path.join(tempDir, 'headers.txt');
    const bodyFile = path.join(tempDir, 'body.bin');
    const ua = kinoboxPickRandom(KINOBOX_UA_POOL, 'Mozilla/5.0');
    const lang = kinoboxPickRandom(KINOBOX_ACCEPT_LANGUAGE_POOL, 'ru,en;q=0.8');
    const connectTimeoutSec = Math.max(3, Math.ceil(KINOBOX_PROXY_TIMEOUT_MS / 3000));
    const maxTimeSec = Math.max(5, Math.ceil((KINOBOX_PROXY_TIMEOUT_MS + 2500) / 1000));

    const args = [
      '--silent',
      '--show-error',
      '--location',
      '--http1.1',
      '--ipv4',
      '--compressed',
      '--connect-timeout',
      String(connectTimeoutSec),
      '--max-time',
      String(maxTimeSec),
      '--output',
      bodyFile,
      '--dump-header',
      headerFile,
      '--cookie',
      cookieJarPath,
      '--cookie-jar',
      cookieJarPath,
      '--user-agent',
      ua,
      '--header',
      'Accept: application/json, text/plain, */*',
      '--header',
      `Accept-Language: ${lang}`,
      '--header',
      'Accept-Encoding: gzip, deflate, br',
      '--header',
      'Origin: https://kinobox.tv',
      '--header',
      'Referer: https://kinobox.tv/',
      '--header',
      'Cache-Control: no-cache',
      '--header',
      'Pragma: no-cache'
    ];

    if (cacheRow && cacheRow.etag) {
      args.push('--header', `If-None-Match: ${cacheRow.etag}`);
    }
    if (cacheRow && cacheRow.lastModified) {
      args.push('--header', `If-Modified-Since: ${cacheRow.lastModified}`);
    }
    if (proxyValue && proxyValue.toLowerCase() !== 'direct') {
      args.push('--proxy', proxyValue);
    } else {
      args.push('--noproxy', '*');
    }
    args.push(upstreamUrl.toString());

    const env = buildYtmExecEnv(null);
    PROXY_ENV_KEYS.forEach((key) => delete env[key]);
    const child = spawn('curl', args, { env });
    let stderr = '';
    child.stderr.on('data', (chunk) => {
      stderr += Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk || '');
    });

    const cleanup = () => {
      try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (_) {}
    };

    child.on('error', (error) => {
      cleanup();
      reject(error);
    });
    child.on('close', (code) => {
      try {
        if (Number(code || 0) !== 0) {
          cleanup();
          reject(new Error(`kinobox_curl_exit_${code}:${String(stderr || '').trim().slice(0, 240)}`));
          return;
        }
        const headersRaw = fs.existsSync(headerFile) ? fs.readFileSync(headerFile, 'utf8') : '';
        const { statusCode, headers } = kinoboxParseHeaderBlock(headersRaw);
        const rawBody = fs.existsSync(bodyFile) ? fs.readFileSync(bodyFile) : Buffer.alloc(0);
        const contentType = String(headers['content-type'] || '').trim();
        const contentEncoding = String(headers['content-encoding'] || '').trim();
        const decodedBody = kinoboxDecodeCompressedBody(rawBody, contentEncoding);
        const normalized = kinoboxNormalizeJsonBody(decodedBody, contentType);
        cleanup();
        resolve({
          statusCode: Number(statusCode || 0),
          body: normalized.body,
          contentType: normalized.contentType,
          etag: String(headers.etag || '').trim(),
          lastModified: String(headers['last-modified'] || '').trim(),
          cacheControl: String(headers['cache-control'] || '').trim(),
          transport: proxyValue && proxyValue.toLowerCase() !== 'direct' ? 'curl-proxy' : 'curl-direct'
        });
      } catch (error) {
        cleanup();
        reject(error);
      }
    });
  });
}

async function requestKinoboxUpstream(params, cacheRow = null, attempt = 0) {
  let nativeError = null;
  try {
    return await requestKinoboxUpstreamNative(params, cacheRow);
  } catch (error) {
    nativeError = error;
  }
  if (!KINOBOX_CURL_ENABLED) {
    throw nativeError || new Error('kinobox_native_failed');
  }
  try {
    return await requestKinoboxUpstreamViaCurl(params, cacheRow, attempt);
  } catch (curlError) {
    const message = `native:${String(nativeError?.message || 'failed')};curl:${String(curlError?.message || 'failed')}`;
    throw new Error(message);
  }
}

async function performKinoboxUpstreamFetch(cacheKey, params) {
  const staleRow = getCachedKinoboxProxy(cacheKey, { allowStale: true });
  let attempt = 0;
  let lastError = null;

  while (attempt < KINOBOX_PROXY_RETRY_MAX) {
    try {
      const response = await requestKinoboxUpstream(params, staleRow, attempt);
      if (response.statusCode === 304 && staleRow) {
        setCachedKinoboxProxy(cacheKey, {
          body: staleRow.body,
          contentType: staleRow.contentType,
          etag: staleRow.etag || response.etag,
          lastModified: staleRow.lastModified || response.lastModified,
          cacheControl: staleRow.cacheControl || response.cacheControl
        });
        const fresh = getCachedKinoboxProxy(cacheKey, { allowStale: false }) || staleRow;
        return { statusCode: 200, row: fresh, cache: 'revalidated', transport: response.transport || 'native' };
      }
      if (response.statusCode >= 200 && response.statusCode < 300 && response.body.length) {
        setCachedKinoboxProxy(cacheKey, response);
        const fresh = getCachedKinoboxProxy(cacheKey, { allowStale: false });
        if (fresh) return { statusCode: 200, row: fresh, cache: 'miss', transport: response.transport || 'native' };
      }
      if (isRetryableKinoboxStatus(response.statusCode)) {
        throw new Error(`kinobox_status_${response.statusCode}`);
      }
      return {
        statusCode: response.statusCode || 502,
        row: {
          body: response.body,
          contentType: response.contentType || 'application/json; charset=utf-8',
          etag: response.etag || '',
          lastModified: response.lastModified || '',
          cacheControl: response.cacheControl || ''
        },
        cache: 'bypass',
        transport: response.transport || 'native'
      };
    } catch (error) {
      lastError = error;
      attempt += 1;
      if (attempt >= KINOBOX_PROXY_RETRY_MAX) break;
      const jitter = Math.floor(Math.random() * 120);
      const delay = Math.min(2200, (KINOBOX_PROXY_RETRY_BASE_MS * (2 ** (attempt - 1))) + jitter);
      await kinoboxSleep(delay);
    }
  }

  if (staleRow) {
    return {
      statusCode: 200,
      row: staleRow,
      cache: 'stale-fallback',
      transport: 'cache-stale',
      warning: String(lastError?.message || 'kinobox_upstream_error')
    };
  }
  throw lastError || new Error('kinobox_upstream_error');
}

function sendKinoboxProxyResponse(res, corsHeaders, payload, method = 'GET') {
  const headers = {
    ...corsHeaders,
    'Content-Type': String(payload?.row?.contentType || 'application/json; charset=utf-8'),
    'Cache-Control': 'public, max-age=30, stale-while-revalidate=120',
    'X-Kinobox-Cache': String(payload?.cache || 'miss'),
    'X-Kinobox-Transport': String(payload?.transport || 'cache')
  };
  if (payload?.warning) headers['X-Kinobox-Warning'] = String(payload.warning);
  if (payload?.row?.etag) headers.ETag = String(payload.row.etag);
  if (payload?.row?.lastModified) headers['Last-Modified'] = String(payload.row.lastModified);
  const statusCode = Number(payload?.statusCode || 200) || 200;
  const body = Buffer.isBuffer(payload?.row?.body) ? payload.row.body : Buffer.alloc(0);
  res.writeHead(statusCode, headers);
  if (String(method || 'GET').toUpperCase() === 'HEAD') {
    res.end();
    return;
  }
  res.end(body);
}

function handleKinoboxPlayersProxy(urlObj, req, res, corsHeaders) {
  const method = String(req.method || '').toUpperCase();
  if (method !== 'GET' && method !== 'HEAD') {
    res.writeHead(405, { ...corsHeaders, 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: 'method_not_allowed' }));
    return;
  }
  const normalizedParams = normalizeKinoboxQuery(urlObj);
  if (!normalizedParams || !normalizedParams.toString()) {
    res.writeHead(400, { ...corsHeaders, 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: 'missing_query_params' }));
    return;
  }

  const ip = getKinoboxClientIp(req);
  const rate = consumeKinoboxProxyRate(ip);
  if (!rate.ok) {
    res.writeHead(429, {
      ...corsHeaders,
      'Content-Type': 'application/json',
      'Retry-After': String(Math.ceil((Number(rate.retryAfterMs || 1000)) / 1000))
    });
    res.end(JSON.stringify({ ok: false, error: 'rate_limited' }));
    return;
  }

  const cacheKey = `v2:${normalizedParams.toString()}`;
  const fresh = getCachedKinoboxProxy(cacheKey, { allowStale: false });
  if (fresh) {
    sendKinoboxProxyResponse(res, corsHeaders, { statusCode: 200, row: fresh, cache: 'hit', transport: 'cache-hit' }, method);
    return;
  }

  const existingInflight = kinoboxProxyInflight.get(cacheKey);
  if (existingInflight) {
    existingInflight
      .then((result) => sendKinoboxProxyResponse(res, corsHeaders, result, method))
      .catch(() => {
        res.writeHead(502, { ...corsHeaders, 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: 'proxy_error' }));
      });
    return;
  }

  const inflight = performKinoboxUpstreamFetch(cacheKey, normalizedParams)
    .finally(() => {
      kinoboxProxyInflight.delete(cacheKey);
    });
  kinoboxProxyInflight.set(cacheKey, inflight);
  inflight
    .then((result) => sendKinoboxProxyResponse(res, corsHeaders, result, method))
    .catch((error) => {
      res.writeHead(502, { ...corsHeaders, 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: 'proxy_error', details: String(error?.message || 'kinobox_failed') }));
    });
}

function buildYtMusicVideoCacheKey(videoId, mode = '') {
  const id = extractYouTubeVideoId(videoId);
  if (!id) return '';
  const normalizedMode = String(mode || '').trim().toLowerCase() === 'direct' ? 'direct' : 'proxy';
  return `${id}|${normalizedMode}`;
}

function putYtMusicVideoToken(videoId, mode = '', token = '', ttlMs = YTMUSIC_STREAM_LINK_TTL_MS) {
  const key = buildYtMusicVideoCacheKey(videoId, mode);
  const safeToken = String(token || '').trim();
  if (!key || !safeToken) return;
  cleanupYtMusicStreamLinkCache();
  ytmVideoLinkCache.set(key, {
    token: safeToken,
    expiresAt: Date.now() + Math.max(5_000, Number(ttlMs || 0) || YTMUSIC_STREAM_LINK_TTL_MS)
  });
}

function getYtMusicVideoToken(videoId, mode = '') {
  const key = buildYtMusicVideoCacheKey(videoId, mode);
  if (!key) return '';
  cleanupYtMusicStreamLinkCache();
  const row = ytmVideoLinkCache.get(key);
  if (!row || typeof row !== 'object') return '';
  const token = String(row.token || '').trim();
  return token || '';
}

function putYtMusicStreamLink(rawUrl, mode = '', meta = null) {
  const normalizedUrl = String(rawUrl || '').trim();
  if (!normalizedUrl) return '';
  const normalizedMode = String(mode || '').trim().toLowerCase() === 'direct' ? 'direct' : 'proxy';
  const normalizedMeta = meta && typeof meta === 'object'
    ? {
        ext: String(meta.ext || '').trim().toLowerCase(),
        mimeType: String(meta.mimeType || '').trim().toLowerCase()
      }
    : { ext: '', mimeType: '' };
  cleanupYtMusicStreamLinkCache();
  const token = nodeCrypto.randomBytes(12).toString('base64url');
  ytmStreamLinkCache.set(token, {
    url: normalizedUrl,
    mode: normalizedMode,
    ext: normalizedMeta.ext,
    mimeType: normalizedMeta.mimeType,
    expiresAt: Date.now() + YTMUSIC_STREAM_LINK_TTL_MS
  });
  return token;
}

function getYtMusicStreamLink(token) {
  const key = String(token || '').trim();
  if (!key) return null;
  const row = ytmStreamLinkCache.get(key);
  if (!row || typeof row !== 'object') return null;
  const expiresAt = Number(row.expiresAt || 0);
  if (expiresAt > 0 && expiresAt <= Date.now()) {
    ytmStreamLinkCache.delete(key);
    return null;
  }
  return row;
}

function buildYtMusicShortProxyUrl(req, token, videoId = '') {
  const base = getRequestBaseUrl(req);
  if (!base) return '';
  const safeToken = String(token || '').trim();
  if (!safeToken) return '';
  const safeVideoId = extractYouTubeVideoId(videoId);
  const suffix = safeVideoId ? `&video_id=${encodeURIComponent(safeVideoId)}` : '';
  return `${base}/ytm-audio-stream?sid=${encodeURIComponent(safeToken)}${suffix}`;
}

function normalizeYtMusicAudioMode(rawMode = '') {
  const value = String(rawMode || '').trim().toLowerCase();
  if (value === 'direct') return 'direct';
  if (value === 'proxy') return YTM_PROXY_URL ? 'proxy' : 'direct';
  return '';
}

function getYtMusicVideoTokenForPreferredMode(videoId, preferredMode = '') {
  const safeVideoId = extractYouTubeVideoId(videoId);
  if (!safeVideoId) return '';
  const normalizedPreferred = normalizeYtMusicAudioMode(preferredMode);
  const modes = [];
  if (normalizedPreferred) modes.push(normalizedPreferred);
  ['direct', 'proxy'].forEach((mode) => {
    if (!modes.includes(mode)) modes.push(mode);
  });
  for (const mode of modes) {
    const token = getYtMusicVideoToken(safeVideoId, mode);
    if (token) return token;
  }
  return '';
}

function buildYtMusicVideoProxyUrl(req, videoId, mode = '') {
  const safeVideoId = extractYouTubeVideoId(videoId);
  if (!safeVideoId) return '';
  const base = getRequestBaseUrl(req);
  const normalizedMode = normalizeYtMusicAudioMode(mode) || (YTM_PROXY_URL ? 'proxy' : 'direct');
  const suffix = normalizedMode ? `&mode=${encodeURIComponent(normalizedMode)}` : '';
  if (base) {
    return `${base}/ytm-audio-stream?video_id=${encodeURIComponent(safeVideoId)}${suffix}`;
  }
  return `/ytm-audio-stream?video_id=${encodeURIComponent(safeVideoId)}${suffix}`;
}

function cacheYtMusicPrimaryToken(requestedVideoId, meta, modeHint = '') {
  const safeRequestedVideoId = extractYouTubeVideoId(requestedVideoId);
  if (!meta || typeof meta !== 'object') return '';
  const rawDirectLink = String(meta.rawDirectLink || '').trim();
  if (!rawDirectLink) return '';
  const resolvedMode = normalizeYtMusicAudioMode(meta.resolvedVia || modeHint)
    || (YTM_PROXY_URL ? 'proxy' : 'direct');
  const ext = String(meta.ext || '').trim().toLowerCase();
  const mimeType = String(meta.mimeType || '').trim().toLowerCase();
  const token = putYtMusicStreamLink(rawDirectLink, resolvedMode, { ext, mimeType });
  if (!token) return '';
  const safeMetaVideoId = extractYouTubeVideoId(meta.videoId || '');
  if (safeMetaVideoId) putYtMusicVideoToken(safeMetaVideoId, resolvedMode, token);
  if (safeRequestedVideoId) putYtMusicVideoToken(safeRequestedVideoId, resolvedMode, token);
  return token;
}

function buildYtMusicStreamResult(req, requestedVideoId, meta, { cacheLabel = '', warning = '', modeHint = '' } = {}) {
  const safeRequestedVideoId = extractYouTubeVideoId(requestedVideoId);
  const source = meta && typeof meta === 'object' ? meta : {};
  const safeVideoId = extractYouTubeVideoId(source.videoId || safeRequestedVideoId) || safeRequestedVideoId || '';
  const resolvedMode = normalizeYtMusicAudioMode(source.resolvedVia || modeHint)
    || (YTM_PROXY_URL ? 'proxy' : 'direct');
  const rawDirectLink = String(source.rawDirectLink || '').trim();
  const ext = String(source.ext || '').trim().toLowerCase();
  const mimeType = String(source.mimeType || '').trim().toLowerCase();

  const primaryToken = cacheYtMusicPrimaryToken(safeRequestedVideoId || safeVideoId, {
    ...source,
    resolvedVia: resolvedMode,
    rawDirectLink,
    ext,
    mimeType
  }, resolvedMode);
  let directLink = primaryToken
    ? (buildYtMusicShortProxyUrl(req, primaryToken, safeVideoId)
      || buildYouTubeStreamProxyUrl(req, rawDirectLink, resolvedMode))
    : '';
  if (!directLink) {
    directLink = buildYtMusicVideoProxyUrl(req, safeRequestedVideoId || safeVideoId, resolvedMode);
  }

  const streamCandidates = Array.isArray(source.candidateStreams)
    ? source.candidateStreams.map((item) => {
        const row = item && typeof item === 'object' ? item : {};
        const rowDirectLink = String(row.rawDirectLink || '').trim();
        const rowExt = String(row.ext || '').trim().toLowerCase();
        const rowMimeType = String(row.mimeType || '').trim().toLowerCase();
        let candidateLink = '';
        if (rowDirectLink) {
          const token = putYtMusicStreamLink(rowDirectLink, resolvedMode, { ext: rowExt, mimeType: rowMimeType });
          candidateLink = token
            ? (buildYtMusicShortProxyUrl(req, token, safeVideoId)
              || buildYouTubeStreamProxyUrl(req, rowDirectLink, resolvedMode))
            : '';
        }
        if (!candidateLink) {
          candidateLink = directLink;
        }
        return {
          directLink: candidateLink,
          rawDirectLink: rowDirectLink,
          host: String(row.host || ''),
          path: String(row.path || ''),
          bitrateInKbps: Number(row.bitrateInKbps || 0),
          ext: rowExt,
          mimeType: rowMimeType
        };
      }).filter((item) => item.directLink)
    : [];

  if (!streamCandidates.length && directLink) {
    streamCandidates.push({
      directLink,
      rawDirectLink,
      host: String(source.host || ''),
      path: String(source.path || ''),
      bitrateInKbps: Number(source.bitrateInKbps || 0),
      ext,
      mimeType
    });
  }

  const result = {
    videoId: safeVideoId || safeRequestedVideoId,
    directLink,
    rawDirectLink,
    host: String(source.host || ''),
    path: String(source.path || ''),
    resolvedVia: resolvedMode,
    bitrateInKbps: Number(source.bitrateInKbps || 0),
    ext,
    mimeType,
    durationSec: Number(source.durationSec || 0),
    streamCandidates,
    requestedVideoId: String(source.requestedVideoId || ''),
    fallbackVideoId: String(source.fallbackVideoId || '')
  };
  if (cacheLabel) result.cache = String(cacheLabel || '');
  if (warning) result.warning = String(warning || '');
  return result;
}

function buildDeferredYtMusicStreamResult(req, videoId, mode = '', warning = '') {
  const safeVideoId = extractYouTubeVideoId(videoId);
  const resolvedMode = normalizeYtMusicAudioMode(mode) || (YTM_PROXY_URL ? 'proxy' : 'direct');
  const directLink = buildYtMusicVideoProxyUrl(req, safeVideoId, resolvedMode);
  const result = {
    videoId: safeVideoId,
    directLink,
    rawDirectLink: '',
    host: '',
    path: '',
    resolvedVia: resolvedMode,
    bitrateInKbps: 0,
    ext: '',
    mimeType: '',
    durationSec: 0,
    streamCandidates: directLink
      ? [{
          directLink,
          rawDirectLink: '',
          host: '',
          path: '',
          bitrateInKbps: 0,
          ext: '',
          mimeType: ''
        }]
      : [],
    cache: 'deferred'
  };
  if (warning) result.warning = String(warning || '');
  return result;
}

function inferYouTubeAudioExt(rawUrl = '') {
  const value = String(rawUrl || '').trim();
  if (!value) return '';
  try {
    const parsed = new URL(value);
    const mime = String(parsed.searchParams.get('mime') || '').toLowerCase();
    if (mime.includes('audio/webm')) return 'webm';
    if (mime.includes('audio/mp4') || mime.includes('audio/m4a')) return 'm4a';
    if (mime.includes('audio/mpeg') || mime.includes('audio/mp3')) return 'mp3';
    const itag = Number(parsed.searchParams.get('itag') || 0);
    if ([249, 250, 251].includes(itag)) return 'webm';
    if ([139, 140, 141].includes(itag)) return 'm4a';
  } catch (_) {}
  return '';
}

function mapExtToAudioContentType(ext = '') {
  const normalized = String(ext || '').trim().toLowerCase();
  if (!normalized) return '';
  if (normalized === 'webm') return 'audio/webm';
  if (normalized === 'm4a' || normalized === 'mp4') return 'audio/mp4';
  if (normalized === 'mp3' || normalized === 'mpeg') return 'audio/mpeg';
  return '';
}

function isAppleBrowserUserAgent(req) {
  const ua = String((req && req.headers && req.headers['user-agent']) || '');
  const isSafari = /Safari/i.test(ua) && !/(Chrome|CriOS|Edg|OPR|Firefox|FxiOS|SamsungBrowser)/i.test(ua);
  const isIOS = /(iPhone|iPad|iPod)/i.test(ua);
  return isSafari || isIOS;
}

function normalizeAudioRangeHeaderForClient(req, rawRangeHeader = '') {
  const raw = String(rawRangeHeader || '').trim();
  if (!raw) return '';
  return raw;
}

function fetchTextWithRedirect(url, headers = {}, redirectLeft = 2) {
  return new Promise((resolve, reject) => {
    const upstream = https.request(url, {
      method: 'GET',
      headers,
      timeout: 15000
    }, (upres) => {
      const statusCode = upres.statusCode || 0;
      const location = upres.headers.location;

      if ([301, 302, 303, 307, 308].includes(statusCode) && location && redirectLeft > 0) {
        upres.resume();
        let nextUrl;
        try {
          nextUrl = new URL(location, url);
        } catch (_) {
          reject(new Error('invalid_redirect'));
          return;
        }
        fetchTextWithRedirect(nextUrl, headers, redirectLeft - 1).then(resolve).catch(reject);
        return;
      }

      const chunks = [];
      upres.on('data', (chunk) => chunks.push(chunk));
      upres.on('end', () => {
        resolve({
          statusCode,
          headers: upres.headers || {},
          body: Buffer.concat(chunks).toString('utf8')
        });
      });
    });

    upstream.on('timeout', () => {
      upstream.destroy();
      reject(new Error('timeout'));
    });
    upstream.on('error', reject);
    upstream.end();
  });
}

function parseTagValue(xmlText, tag) {
  const re = new RegExp(`<${tag}>([^<]+)</${tag}>`, 'i');
  const m = String(xmlText || '').match(re);
  return m ? String(m[1]).trim() : '';
}

function extractTrackId(value) {
  const raw = String(value || '');
  const match = raw.match(/(\d+)/);
  return match ? match[1] : '';
}

function extractYouTubeVideoId(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (/^[A-Za-z0-9_-]{11}$/.test(raw)) return raw;
  const watchMatch = raw.match(/[?&]v=([A-Za-z0-9_-]{11})/);
  if (watchMatch) return watchMatch[1];
  const shortMatch = raw.match(/youtu\.be\/([A-Za-z0-9_-]{11})/i);
  if (shortMatch) return shortMatch[1];
  const pathMatch = raw.match(/\/watch\/([A-Za-z0-9_-]{11})/i);
  if (pathMatch) return pathMatch[1];
  return '';
}

function parseBridgeJson(rawText) {
  const text = String(rawText || '').trim();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch (_) {
    return null;
  }
}

function resolveYtMusicBridgeScriptPath() {
  const candidates = [
    YTMUSIC_BRIDGE_SCRIPT_ENV,
    path.join(__dirname, 'scripts', 'ytmusic_bridge.py'),
    path.join(process.cwd(), 'scripts', 'ytmusic_bridge.py'),
    '/opt/kinosreda-realtime/scripts/ytmusic_bridge.py',
    '/opt/kinosreda-realtime/kinosreda.github.io/scripts/ytmusic_bridge.py'
  ]
    .map((item) => String(item || '').trim())
    .filter(Boolean);

  const seen = new Set();
  for (const candidate of candidates) {
    const normalized = path.resolve(candidate);
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    if (fs.existsSync(normalized)) {
      return { scriptPath: normalized, checked: Array.from(seen) };
    }
  }

  return { scriptPath: '', checked: Array.from(seen) };
}

function createConcurrencyLimiter(maxActive = 4, maxQueue = 100, waitTimeoutMs = 10000) {
  const safeMaxActive = Math.max(1, Number(maxActive || 0) || 1);
  const safeMaxQueue = Math.max(1, Number(maxQueue || 0) || 1);
  const safeWaitTimeoutMs = Math.max(1000, Number(waitTimeoutMs || 0) || 1000);
  let active = 0;
  const queue = [];

  const pump = () => {
    while (active < safeMaxActive && queue.length) {
      const row = queue.shift();
      if (!row || row.cancelled) continue;
      if (row.timer) clearTimeout(row.timer);
      active += 1;
      let released = false;
      row.resolve(() => {
        if (released) return;
        released = true;
        active = Math.max(0, active - 1);
        pump();
      });
    }
  };

  return async function runWithLimit(task, options = {}) {
    const waitMs = Math.max(
      1000,
      Number(options && options.waitTimeoutMs || safeWaitTimeoutMs) || safeWaitTimeoutMs
    );
    const release = await new Promise((resolve, reject) => {
      if (active < safeMaxActive) {
        active += 1;
        let released = false;
        resolve(() => {
          if (released) return;
          released = true;
          active = Math.max(0, active - 1);
          pump();
        });
        return;
      }
      if (queue.length >= safeMaxQueue) {
        reject(new Error('limiter_queue_overflow'));
        return;
      }
      const row = {
        cancelled: false,
        timer: null,
        resolve,
        reject
      };
      row.timer = setTimeout(() => {
        row.cancelled = true;
        reject(new Error('limiter_queue_timeout'));
      }, waitMs);
      queue.push(row);
    });
    try {
      return await task();
    } finally {
      try { release(); } catch (_) {}
    }
  };
}

const runYtmBridgeLimited = createConcurrencyLimiter(
  YTMUSIC_BRIDGE_MAX_CONCURRENCY,
  YTMUSIC_BRIDGE_MAX_QUEUE,
  YTMUSIC_BRIDGE_QUEUE_WAIT_MS
);
const runYtmTrackBridgeLimited = createConcurrencyLimiter(
  YTMUSIC_TRACK_BRIDGE_MAX_CONCURRENCY,
  YTMUSIC_TRACK_BRIDGE_MAX_QUEUE,
  YTMUSIC_BRIDGE_QUEUE_WAIT_MS
);
const runYtmStreamBridgeLimited = createConcurrencyLimiter(
  YTMUSIC_STREAM_BRIDGE_MAX_CONCURRENCY,
  YTMUSIC_STREAM_BRIDGE_MAX_QUEUE,
  YTMUSIC_STREAM_BRIDGE_QUEUE_WAIT_MS
);

function runYtMusicBridge(args, timeoutMs = YTMUSIC_BRIDGE_TIMEOUT_MS, envOverrides = null) {
  const bridgeCommand = String(Array.isArray(args) && args.length ? args[0] : '').trim().toLowerCase();
  const runLimited = bridgeCommand === 'track'
    ? runYtmTrackBridgeLimited
    : (bridgeCommand === 'stream' ? runYtmStreamBridgeLimited : runYtmBridgeLimited);
  const safeTimeoutMs = Math.max(2000, Number(timeoutMs || YTMUSIC_BRIDGE_TIMEOUT_MS) || YTMUSIC_BRIDGE_TIMEOUT_MS);
  const queueWaitMs = bridgeCommand === 'stream'
    ? Math.min(YTMUSIC_STREAM_BRIDGE_QUEUE_WAIT_MS, safeTimeoutMs)
    : Math.min(YTMUSIC_BRIDGE_QUEUE_WAIT_MS, safeTimeoutMs);
  return runLimited(() => new Promise((resolve, reject) => {
    const { scriptPath, checked } = resolveYtMusicBridgeScriptPath();
    if (!scriptPath) {
      const checkedPaths = checked.length ? checked.join('|') : 'none';
      reject(new Error(`ytmusic_bridge_not_found:${checkedPaths}`));
      return;
    }

    const child = spawn(PYTHON_BIN, [scriptPath, ...args], {
      cwd: __dirname,
      env: buildYtmExecEnv(envOverrides)
    });
    let stdout = '';
    let stderr = '';
    let finished = false;

    const safeFinish = (handler) => {
      if (finished) return;
      finished = true;
      handler();
    };

    const timer = setTimeout(() => {
      try { child.kill('SIGKILL'); } catch (_) {}
      safeFinish(() => reject(new Error('ytmusic_bridge_timeout')));
    }, safeTimeoutMs);

    child.stdout.on('data', (chunk) => {
      stdout += String(chunk || '');
      if (stdout.length > 2_000_000) stdout = stdout.slice(-2_000_000);
    });
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk || '');
      if (stderr.length > 100_000) stderr = stderr.slice(-100_000);
    });
    child.on('error', (error) => {
      clearTimeout(timer);
      safeFinish(() => reject(error));
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      safeFinish(() => {
        const payload = parseBridgeJson(stdout);
        if (payload && typeof payload === 'object') {
          if (payload.ok === false) {
            const errMessage = String(payload.message || payload.error || 'ytmusic_bridge_error');
            reject(new Error(errMessage));
            return;
          }
          resolve(payload);
          return;
        }
        const errorText = (stderr || stdout || '').trim();
        if (code !== 0) {
          reject(new Error(errorText || `ytmusic_bridge_exit_${code}`));
          return;
        }
        reject(new Error(errorText || 'ytmusic_bridge_invalid_output'));
      });
    });
  }), { waitTimeoutMs: queueWaitMs });
}

function serveLocalHtml(res, fileName, extraHeaders = null, method = 'GET', urlObj = null) {
  const safeFileName = String(fileName || '').trim();
  if (!safeFileName) return false;
  const filePath = path.join(__dirname, safeFileName);
  if (!fs.existsSync(filePath)) return false;
  const rawBody = fs.readFileSync(filePath);
  const body = maybeInjectLocalHtmlRuntime(rawBody, filePath);
  const headers = {
    'Content-Type': 'text/html; charset=utf-8',
    'Content-Length': String(body.length),
    'Cache-Control': 'no-store',
    ...getCrossOriginIsolationHeadersForRequest(urlObj, filePath)
  };
  res.writeHead(200, extraHeaders ? { ...headers, ...extraHeaders } : headers);
  if (String(method || '').toUpperCase() === 'HEAD') {
    res.end();
  } else {
    res.end(body);
  }
  return true;
}

function buildCrossOriginIsolationHeaders() {
  return {
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Embedder-Policy': 'credentialless',
    'Origin-Agent-Cluster': '?1'
  };
}

function normalizeComparablePathname(pathname = '') {
  const value = String(pathname || '').trim() || '/';
  if (value === '/') return '/';
  return value.replace(/\/+$/, '');
}

function shouldApplyCrossOriginIsolation(urlObj = null, filePath = '') {
  const safeFilePath = String(filePath || '').replace(/\\/g, '/').toLowerCase();
  if (
    safeFilePath.endsWith('/homm3.html')
    || safeFilePath.includes('/homm3-runtime/')
    || safeFilePath.endsWith('/vendor/webtorrent.min.js')
    || safeFilePath.endsWith('/coi-serviceworker.js')
  ) {
    return true;
  }

  try {
    const pathname = normalizeComparablePathname(urlObj && urlObj.pathname ? urlObj.pathname : '');
    if (
      pathname === '/homm3.html'
      || pathname === '/coi-serviceworker.js'
      || pathname === '/vendor/webtorrent.min.js'
      || pathname === '/homm3-runtime/index.html'
      || pathname.startsWith('/homm3-runtime/')
    ) {
      return true;
    }
    if ((pathname === '/' || pathname === '/index.html') && urlObj && urlObj.searchParams.get('page') === 'svc_homm3') {
      return true;
    }
  } catch (_) {}

  return false;
}

function getCrossOriginIsolationHeadersForRequest(urlObj = null, filePath = '') {
  return shouldApplyCrossOriginIsolation(urlObj, filePath)
    ? buildCrossOriginIsolationHeaders()
    : {};
}

function buildLocalHtmlRuntimeScript() {
  return `<script>
;(() => {
  try {
    const host = String(window.location.hostname || '').trim().toLowerCase();
    if (!['127.0.0.1', 'localhost', '::1'].includes(host)) return;
    if (window.__KINOSREDA_LOCAL_RUNTIME_PATCHED__) return;
    window.__KINOSREDA_LOCAL_RUNTIME_PATCHED__ = true;

    const RELOAD_MESSAGES = new Set(['reload', 'refreshcss']);
    const NativeWebSocket = window.WebSocket;
    if (typeof NativeWebSocket === 'function') {
      const isLikelyLiveReloadSocket = (urlLike) => {
        try {
          const url = new URL(String(urlLike || ''), window.location.href);
          if (url.host !== window.location.host) return false;
          const pathname = String(url.pathname || '').toLowerCase();
          const hasQuery = String(url.search || '').length > 0;
          if (/\\/livereload(?:\\/|$)/i.test(pathname)) return true;
          return /\\/ws$/i.test(pathname) && !hasQuery;
        } catch (_) {
          return false;
        }
      };
      const shouldSuppressLiveReloadEvent = (urlLike, event) => {
        if (!isLikelyLiveReloadSocket(urlLike)) return false;
        const rawData = event && Object.prototype.hasOwnProperty.call(event, 'data') ? event.data : '';
        const text = String(rawData || '').trim().toLowerCase();
        if (RELOAD_MESSAGES.has(text)) return true;
        if (!text || (text[0] !== '{' && text[0] !== '[')) return false;
        try {
          const parsed = JSON.parse(text);
          const command = String(
            (parsed && (parsed.command || parsed.type || parsed.action || parsed.event)) || ''
          ).trim().toLowerCase();
          return RELOAD_MESSAGES.has(command);
        } catch (_) {
          return false;
        }
      };

      class StableWebSocket extends NativeWebSocket {
        constructor(url, protocols) {
          super(url, protocols);
          this.__stableWsUrl = String(url || '');
          this.__stableWsOnMessage = null;
          this.__stableWsListeners = new Map();
          super.addEventListener('message', (event) => {
            if (shouldSuppressLiveReloadEvent(this.__stableWsUrl, event)) return;
            if (typeof this.__stableWsOnMessage === 'function') {
              this.__stableWsOnMessage.call(this, event);
            }
          });
        }

        get onmessage() {
          return this.__stableWsOnMessage;
        }

        set onmessage(listener) {
          this.__stableWsOnMessage = typeof listener === 'function' ? listener : null;
        }

        addEventListener(type, listener, options) {
          if (type === 'message' && typeof listener === 'function') {
            const wrapped = (event) => {
              if (shouldSuppressLiveReloadEvent(this.__stableWsUrl, event)) return;
              listener.call(this, event);
            };
            this.__stableWsListeners.set(listener, wrapped);
            return super.addEventListener(type, wrapped, options);
          }
          return super.addEventListener(type, listener, options);
        }

        removeEventListener(type, listener, options) {
          if (type === 'message' && typeof listener === 'function') {
            const wrapped = this.__stableWsListeners.get(listener);
            if (wrapped) {
              this.__stableWsListeners.delete(listener);
              return super.removeEventListener(type, wrapped, options);
            }
          }
          return super.removeEventListener(type, listener, options);
        }
      }

      window.WebSocket = StableWebSocket;
    }
  } catch (_) {}
})();
</script>`;
}

function maybeInjectLocalHtmlRuntime(body, filePath = '') {
  const normalizedPath = String(filePath || '').toLowerCase();
  if (!normalizedPath.endsWith('.html')) {
    return body;
  }
  let html = '';
  try {
    html = Buffer.isBuffer(body) ? body.toString('utf8') : String(body || '');
  } catch (_) {
    return body;
  }
  if (!html || html.includes('__KINOSREDA_LOCAL_RUNTIME_PATCHED__')) {
    return Buffer.isBuffer(body) ? body : Buffer.from(String(body || ''), 'utf8');
  }
  const injection = buildLocalHtmlRuntimeScript();
  const headCloseIndex = html.search(/<\/head>/i);
  const augmented = headCloseIndex >= 0
    ? `${html.slice(0, headCloseIndex)}${injection}${html.slice(headCloseIndex)}`
    : `${injection}${html}`;
  return Buffer.from(augmented, 'utf8');
}

function buildLocalStaticCacheControl(filePath = '') {
  const ext = path.extname(String(filePath || '')).toLowerCase();
  if (ext === '.html') {
    return 'no-store';
  }
  if ([
    '.js', '.mjs', '.cjs', '.css', '.json', '.map', '.svg', '.png', '.jpg', '.jpeg',
    '.gif', '.webp', '.avif', '.ico', '.woff', '.woff2', '.ttf', '.otf', '.wasm',
    '.mp3', '.mp4', '.webm', '.glb', '.gltf', '.txt', '.bin'
  ].includes(ext)) {
    return 'public, max-age=0, must-revalidate';
  }
  return 'public, max-age=0, must-revalidate';
}

function buildLocalStaticEtag(stat) {
  if (!stat || !Number.isFinite(stat.size) || !Number.isFinite(stat.mtimeMs)) {
    return '';
  }
  return `W/"${stat.size.toString(16)}-${Math.floor(stat.mtimeMs).toString(16)}"`;
}

function isLocalStaticNotModified(req, etag, stat) {
  const ifNoneMatch = String(req.headers['if-none-match'] || '').trim();
  if (etag && ifNoneMatch && ifNoneMatch === etag) {
    return true;
  }
  const ifModifiedSince = String(req.headers['if-modified-since'] || '').trim();
  if (!ifModifiedSince || !stat || !Number.isFinite(stat.mtimeMs)) {
    return false;
  }
  const modifiedSinceMs = Date.parse(ifModifiedSince);
  if (!Number.isFinite(modifiedSinceMs)) {
    return false;
  }
  return Math.floor(stat.mtimeMs / 1000) * 1000 <= modifiedSinceMs;
}

function resolveLocalStaticFilePath(pathname = '') {
  const sourcePath = String(pathname || '').trim() || '/';
  const requestPath = sourcePath === '/' ? '/index.html' : sourcePath;
  let decodedPath = '';
  try {
    decodedPath = decodeURIComponent(requestPath.split('?')[0]);
  } catch (_) {
    return null;
  }
  const normalizedPath = path.normalize(decodedPath).replace(/^(\.\.[/\\])+/, '');
  const rootDir = path.resolve(__dirname);
  const resolved = path.resolve(path.join(rootDir, normalizedPath));

  if (resolved !== rootDir && !resolved.startsWith(`${rootDir}${path.sep}`)) {
    return null;
  }

  try {
    const stat = fs.statSync(resolved);
    if (stat.isDirectory()) {
      const indexPath = path.join(resolved, 'index.html');
      const indexStat = fs.statSync(indexPath);
      if (indexStat.isFile()) {
        return indexPath;
      }
    }
    if (stat.isFile()) {
      return resolved;
    }
  } catch (_) {}

  if (!path.extname(resolved)) {
    const htmlPath = `${resolved}.html`;
    try {
      const htmlStat = fs.statSync(htmlPath);
      if (htmlStat.isFile()) {
        return htmlPath;
      }
    } catch (_) {}
  }

  return null;
}

function guessLocalStaticContentType(filePath = '') {
  const ext = path.extname(String(filePath || '')).toLowerCase();
  return LOCAL_STATIC_MIME_TYPES.get(ext) || 'application/octet-stream';
}

function serveLocalStaticFile(urlObj, req, res, corsHeaders) {
  const method = String(req.method || 'GET').toUpperCase();
  if (!['GET', 'HEAD'].includes(method)) {
    return false;
  }

  const filePath = resolveLocalStaticFilePath(urlObj && urlObj.pathname ? urlObj.pathname : '/');
  if (!filePath) {
    return false;
  }

  let stat = null;
  try {
    stat = fs.statSync(filePath);
  } catch (_) {
    return false;
  }

  const contentType = guessLocalStaticContentType(filePath);
  const isHtml = /^text\/html\b/i.test(contentType);
  if (isHtml) {
    const rawBody = fs.readFileSync(filePath);
    const body = maybeInjectLocalHtmlRuntime(rawBody, filePath);
    const headers = {
      ...corsHeaders,
      ...getCrossOriginIsolationHeadersForRequest(urlObj, filePath),
      'Content-Type': contentType,
      'Content-Length': String(body.length),
      'Cache-Control': 'no-store'
    };
    res.writeHead(200, headers);
    if (method === 'HEAD') {
      res.end();
      return true;
    }
    res.end(body);
    return true;
  }

  const etag = buildLocalStaticEtag(stat);
  const cacheControl = buildLocalStaticCacheControl(filePath);
  if (isLocalStaticNotModified(req, etag, stat)) {
    res.writeHead(304, {
      ...corsHeaders,
      ...getCrossOriginIsolationHeadersForRequest(urlObj, filePath),
      'Cache-Control': cacheControl,
      ETag: etag,
      'Last-Modified': stat.mtime.toUTCString()
    });
    res.end();
    return true;
  }

  const headers = {
    ...corsHeaders,
    ...getCrossOriginIsolationHeadersForRequest(urlObj, filePath),
    'Content-Type': contentType,
    'Content-Length': String(stat.size),
    'Cache-Control': cacheControl,
    ETag: etag,
    'Last-Modified': stat.mtime.toUTCString()
  };
  res.writeHead(200, headers);
  if (method === 'HEAD') {
    res.end();
    return true;
  }

  const stream = fs.createReadStream(filePath);
  stream.on('error', () => {
    if (!res.headersSent) {
      res.writeHead(500, { ...corsHeaders, 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('local_static_read_failed');
    } else if (!res.writableEnded) {
      res.destroy();
    }
  });
  stream.pipe(res);
  return true;
}

function matchVoiceRoomRoute(pathname = '') {
  const normalized = String(pathname || '').trim().replace(/\/+$/, '') || '/';
  const patterns = [
    { regex: /^\/call(?:\/([a-z]+))?$/i, fileName: 'call.html' },
    { regex: /^\/meet(?:\/([a-z]+))?$/i, fileName: 'meet.html' },
    { regex: /^\/call\.html$/i, fileName: 'call.html' },
    { regex: /^\/meet\.html$/i, fileName: 'meet.html' }
  ];
  for (const row of patterns) {
    if (row.regex.test(normalized)) {
      return { fileName: row.fileName };
    }
  }
  return null;
}

function isYtConnectivityStreamError(message) {
  const text = String(message || '').toLowerCase();
  return (
    text.includes('unable to download api page')
    || text.includes('unexpected_eof_while_reading')
    || text.includes('ssl')
    || text.includes('network is unreachable')
    || text.includes('timed out')
    || text.includes('connection reset')
    || text.includes('proxy')
    || text.includes('http error 429')
    || text.includes('ytmusic_bridge_timeout')
    || text.includes('limiter_queue_timeout')
    || text.includes('limiter_queue_overflow')
  );
}

function getCachedYtMusicStreamMeta(videoId, { allowStale = false } = {}) {
  const key = String(videoId || '').trim();
  if (!key) return null;
  const cached = ytmStreamCache.get(key);
  if (!cached || typeof cached !== 'object') return null;
  const expiresAt = Number(cached.expiresAt || 0);
  const now = Date.now();
  if (!allowStale && expiresAt > 0 && expiresAt < now) return null;
  if (!cached.meta || typeof cached.meta !== 'object') return null;
  return cached.meta;
}

function getYtStreamUrlExpireMs(rawUrl) {
  const value = String(rawUrl || '').trim();
  if (!value) return 0;
  try {
    const parsed = new URL(value);
    const expireSec = Number(parsed.searchParams.get('expire') || 0);
    if (Number.isFinite(expireSec) && expireSec > 0) {
      return expireSec * 1000;
    }
  } catch (_) {}
  return 0;
}

function setCachedYtMusicStreamMeta(videoId, meta) {
  const key = String(videoId || '').trim();
  if (!key || !meta || typeof meta !== 'object') return;
  const now = Date.now();
  const candidateUrls = [];
  const primary = String(meta.rawDirectLink || '').trim();
  if (primary) candidateUrls.push(primary);
  if (Array.isArray(meta.candidateStreams)) {
    meta.candidateStreams.forEach((item) => {
      const rowUrl = String(item && item.rawDirectLink || '').trim();
      if (rowUrl) candidateUrls.push(rowUrl);
    });
  }
  let minExpireMs = Number.POSITIVE_INFINITY;
  candidateUrls.forEach((item) => {
    const exp = getYtStreamUrlExpireMs(item);
    if (exp > 0) minExpireMs = Math.min(minExpireMs, exp);
  });

  let ttlMs = YTMUSIC_STREAM_CACHE_TTL_MS;
  if (Number.isFinite(minExpireMs)) {
    ttlMs = Math.max(30_000, Math.min(6 * 60 * 60 * 1000, minExpireMs - now - 60_000));
  }

  ytmStreamCache.set(key, {
    expiresAt: now + ttlMs,
    meta
  });
}

function buildYtMusicStreamMetaFromPayload(payload, fallbackVideoId = '', resolvedVia = '') {
  const result = payload && payload.result && typeof payload.result === 'object' ? payload.result : {};
  const candidateStreams = [];
  const seen = new Set();
  const pushCandidate = (rawUrl, meta = {}) => {
    const rawDirect = String(rawUrl || '').trim();
    if (!rawDirect || seen.has(rawDirect)) return;
    let parsed;
    try {
      parsed = new URL(rawDirect);
    } catch (_) {
      return;
    }
    if (parsed.protocol !== 'https:' || !isAllowedYouTubeStreamHost(parsed.hostname)) {
      return;
    }
    seen.add(parsed.toString());
    candidateStreams.push({
      rawDirectLink: parsed.toString(),
      host: parsed.hostname,
      path: parsed.pathname,
      bitrateInKbps: Number(meta.bitrateInKbps || 0),
      ext: String(meta.ext || ''),
      mimeType: String(meta.mimeType || '')
    });
  };

  if (Array.isArray(result.streamCandidates)) {
    result.streamCandidates.forEach((item) => {
      if (!item || typeof item !== 'object') return;
      pushCandidate(
        item.directLink || item.rawDirectLink || item.url,
        {
          bitrateInKbps: item.bitrateInKbps,
          ext: item.ext,
          mimeType: item.mimeType
        }
      );
    });
  }
  pushCandidate(
    result.directLink || result.rawDirectLink,
    {
      bitrateInKbps: result.bitrateInKbps,
      ext: result.ext,
      mimeType: result.mimeType
    }
  );
  if (!candidateStreams.length) {
    throw new Error('stream_url_missing');
  }
  const primary = candidateStreams[0];
  const durationSecRaw = Number(result.durationSec || result.duration || 0);
  const durationSec = Number.isFinite(durationSecRaw) && durationSecRaw > 0 ? durationSecRaw : 0;

  const resolvedVideoId = extractYouTubeVideoId(result.videoId || result.id || fallbackVideoId) || fallbackVideoId;
  return {
    videoId: resolvedVideoId,
    rawDirectLink: primary.rawDirectLink,
    host: primary.host,
    path: primary.path,
    resolvedVia: String(resolvedVia || ''),
    bitrateInKbps: Number(primary.bitrateInKbps || 0),
    ext: String(primary.ext || ''),
    mimeType: String(primary.mimeType || ''),
    durationSec,
    candidateStreams
  };
}

async function resolveYtMusicStreamDirectMeta(videoId, timeoutMs = YTMUSIC_STREAM_BRIDGE_TIMEOUT_MS) {
  const key = String(videoId || '').trim();
  const totalBudgetMs = Math.max(3000, Number(timeoutMs || YTMUSIC_STREAM_RESOLVE_TIMEOUT_MS) || YTMUSIC_STREAM_RESOLVE_TIMEOUT_MS);
  const startedAt = Date.now();
  const preferDirect = Date.now() < ytmPreferDirectUntil;

  const attemptSpecs = [];
  attemptSpecs.push({
    forceDirect: true,
    timeoutMs: Math.min(totalBudgetMs, YTMUSIC_STREAM_FAST_DIRECT_TIMEOUT_MS)
  });
  if (YTM_PROXY_URL) {
    attemptSpecs.push({
      forceDirect: false,
      timeoutMs: Math.min(totalBudgetMs, YTMUSIC_STREAM_FAST_PROXY_TIMEOUT_MS)
    });
    // If direct is preferred but first direct probe was too short, retry one more direct pass.
    if (preferDirect) {
      attemptSpecs.push({
        forceDirect: true,
        timeoutMs: Math.min(totalBudgetMs, Math.max(YTMUSIC_STREAM_FAST_DIRECT_TIMEOUT_MS, 7000))
      });
    }
  }

  let lastError = null;
  for (const attempt of attemptSpecs) {
    const elapsed = Date.now() - startedAt;
    const remaining = totalBudgetMs - elapsed;
    if (remaining < 1200) break;
    const bridgeTimeout = Math.max(1500, Math.min(attempt.timeoutMs, remaining));
    try {
      const payload = await runYtMusicBridge(
        ['stream', '--video-id', key],
        bridgeTimeout,
        attempt.forceDirect ? { YTM_PROXY_URL: 'direct' } : null
      );
      return buildYtMusicStreamMetaFromPayload(payload, key, attempt.forceDirect ? 'direct' : 'proxy');
    } catch (error) {
      lastError = error;
      const message = String(error && error.message || error);
      if (!isYtRecoverableStreamError(message)) {
        throw error;
      }
      if (!attempt.forceDirect && isYtConnectivityStreamError(message)) {
        ytmPreferDirectUntil = Date.now() + YTMUSIC_DIRECT_MODE_COOLDOWN_MS;
      }
      continue;
    }
  }

  throw (lastError || new Error('stream_resolve_failed'));
}

function isYtRecoverableStreamError(message) {
  const text = String(message || '').toLowerCase();
  return (
    text.includes('video unavailable')
    || text.includes('this video is not available')
    || text.includes('private video')
    || text.includes('members-only')
    || text.includes('age-restricted')
    || text.includes('confirm you’re not a bot')
    || text.includes("confirm you're not a bot")
    || text.includes('unable to download api page')
    || text.includes('unexpected_eof_while_reading')
    || text.includes('ssl')
    || text.includes('http error 429')
    || text.includes('limiter_queue_timeout')
    || text.includes('limiter_queue_overflow')
  );
}

async function resolveYtMusicFallbackQuery(videoId) {
  try {
    const payload = await runYtMusicBridge(
      ['track', '--video-id', String(videoId || '').trim()],
      YTMUSIC_SEARCH_BRIDGE_TIMEOUT_MS
    );
    const track = payload && payload.result && payload.result.track && typeof payload.result.track === 'object'
      ? payload.result.track
      : {};
    const title = String(track.title || '').trim();
    const artists = Array.isArray(track.artists) ? track.artists.map((item) => String(item || '').trim()).filter(Boolean) : [];
    const query = [artists.slice(0, 2).join(' '), title].filter(Boolean).join(' ').trim();
    return query || String(videoId || '').trim();
  } catch (_) {
    return String(videoId || '').trim();
  }
}

async function resolveYtMusicStreamViaSearchFallback(videoId) {
  const query = await resolveYtMusicFallbackQuery(videoId);
  if (!query) return null;

  const searchTimeoutMs = Math.min(YTMUSIC_SEARCH_BRIDGE_TIMEOUT_MS, 12000);
  const searchPayload = await runYtMusicBridge(
    ['search', '--query', query, '--limit', String(YTMUSIC_STREAM_FALLBACK_CANDIDATES), '--page', '0'],
    searchTimeoutMs
  );
  const root = searchPayload && searchPayload.result && typeof searchPayload.result === 'object' ? searchPayload.result : {};
  const tracks = Array.isArray(root.tracks) ? root.tracks : [];
  for (const row of tracks) {
    const candidateVideoId = extractYouTubeVideoId(row && (row.videoId || row.trackId || row.id || ''));
    if (!candidateVideoId || candidateVideoId === videoId) continue;
    try {
      const perCandidateTimeout = Math.min(YTMUSIC_STREAM_RESOLVE_TIMEOUT_MS, 10000);
      const meta = await resolveYtMusicStreamDirectMeta(
        candidateVideoId,
        perCandidateTimeout
      );
      return {
        ...meta,
        requestedVideoId: videoId,
        fallbackVideoId: candidateVideoId
      };
    } catch (_) {
      continue;
    }
  }
  return null;
}

async function resolveYtMusicStreamMetaForMode(videoId, mode = '', timeoutMs = YTMUSIC_STREAM_BRIDGE_TIMEOUT_MS) {
  const key = String(videoId || '').trim();
  if (!key) throw new Error('missing_video_id');
  const normalizedMode = String(mode || '').trim().toLowerCase() === 'proxy' ? 'proxy' : 'direct';
  if (normalizedMode === 'proxy' && !YTM_PROXY_URL) {
    throw new Error('proxy_not_configured');
  }
  const bridgeTimeoutMs = Math.max(2_500, Number(timeoutMs || YTMUSIC_STREAM_BRIDGE_TIMEOUT_MS) || YTMUSIC_STREAM_BRIDGE_TIMEOUT_MS);
  const payload = await runYtMusicBridge(
    ['stream', '--video-id', key],
    bridgeTimeoutMs,
    normalizedMode === 'direct' ? { YTM_PROXY_URL: 'direct' } : null
  );
  return buildYtMusicStreamMetaFromPayload(payload, key, normalizedMode);
}

async function resolveYtMusicStreamMeta(videoId) {
  const key = String(videoId || '').trim();
  if (!key) throw new Error('missing_video_id');

  const cachedFresh = getCachedYtMusicStreamMeta(key);
  if (cachedFresh) return cachedFresh;

  const inflight = ytmStreamInflight.get(key);
  if (inflight) return await inflight;

  const promise = (async () => {
    let meta;
    try {
      meta = await resolveYtMusicStreamDirectMeta(
        key,
        YTMUSIC_STREAM_RESOLVE_TIMEOUT_MS
      );
    } catch (error) {
      let message = String(error && error.message || error);
      if (!isYtRecoverableStreamError(message)) {
        throw error;
      }
      if (meta) {
        setCachedYtMusicStreamMeta(key, meta);
        return meta;
      }
      const fallbackMeta = await resolveYtMusicStreamViaSearchFallback(key);
      if (!fallbackMeta) {
        throw error;
      }
      meta = fallbackMeta;
    }
    setCachedYtMusicStreamMeta(key, meta);
    if (meta && meta.fallbackVideoId) {
      setCachedYtMusicStreamMeta(meta.fallbackVideoId, meta);
    }
    return meta;
  })();

  ytmStreamInflight.set(key, promise);
  try {
    return await promise;
  } finally {
    ytmStreamInflight.delete(key);
  }
}

async function resolveYtMusicStreamMetaFast(videoId, preferredMode = '', timeoutMs = YTMUSIC_AUDIO_RESOLVE_TIMEOUT_MS) {
  const key = String(videoId || '').trim();
  if (!key) throw new Error('missing_video_id');
  const normalizedPreferredMode = normalizeYtMusicAudioMode(preferredMode) || 'direct';
  const inflightKey = `${key}|${normalizedPreferredMode}`;
  const inflight = ytmStreamFastInflight.get(inflightKey);
  if (inflight) return await inflight;

  const promise = (async () => {
    const fresh = getCachedYtMusicStreamMeta(key);
    if (fresh && fresh.rawDirectLink) return fresh;
    const stale = getCachedYtMusicStreamMeta(key, { allowStale: true });

    const totalBudgetMs = Math.max(
      3000,
      Number(timeoutMs || YTMUSIC_AUDIO_RESOLVE_TIMEOUT_MS) || YTMUSIC_AUDIO_RESOLVE_TIMEOUT_MS
    );
    const startedAt = Date.now();

    const attempts = [];
    if (normalizedPreferredMode === 'proxy') {
      attempts.push({ type: 'mode', mode: 'proxy' });
      attempts.push({ type: 'mode', mode: 'direct' });
      attempts.push({ type: 'direct', mode: '' });
    } else {
      attempts.push({ type: 'mode', mode: 'direct' });
      attempts.push({ type: 'direct', mode: '' });
      if (YTM_PROXY_URL) attempts.push({ type: 'mode', mode: 'proxy' });
    }

    let lastError = null;
    for (const attempt of attempts) {
      const elapsed = Date.now() - startedAt;
      const remaining = totalBudgetMs - elapsed;
      if (remaining < 1200) break;
      const perAttemptTimeout = Math.max(1500, Math.min(remaining, 9000));
      try {
        let meta = null;
        if (attempt.type === 'mode') {
          meta = await resolveYtMusicStreamMetaForMode(key, attempt.mode, perAttemptTimeout);
        } else {
          meta = await resolveYtMusicStreamDirectMeta(key, perAttemptTimeout);
        }
        if (meta && typeof meta === 'object' && meta.rawDirectLink) {
          setCachedYtMusicStreamMeta(key, meta);
          if (meta.videoId && meta.videoId !== key) {
            setCachedYtMusicStreamMeta(meta.videoId, meta);
          }
          return meta;
        }
      } catch (error) {
        lastError = error;
        const message = String(error && error.message || error);
        if (
          !isYtRecoverableStreamError(message)
          && !isYtConnectivityStreamError(message)
          && !message.includes('proxy_not_configured')
        ) {
          throw error;
        }
      }
    }

    if (stale && stale.rawDirectLink) return stale;
    throw (lastError || new Error('stream_resolve_failed'));
  })();

  ytmStreamFastInflight.set(inflightKey, promise);
  try {
    return await promise;
  } finally {
    if (ytmStreamFastInflight.get(inflightKey) === promise) {
      ytmStreamFastInflight.delete(inflightKey);
    }
  }
}

function buildYandexDirectLink({ host, path, ts, s }) {
  if (!host || !path || !ts || !s) return '';
  const cleanPath = String(path).startsWith('/') ? String(path).slice(1) : String(path);
  const secret = 'XGRlBW9FXlekgbPrRHuSiA';
  const signSource = `${secret}${cleanPath}${String(s)}`;
  const sign = nodeCrypto.createHash('md5').update(signSource).digest('hex');
  const normalizedPath = String(path).startsWith('/') ? String(path) : `/${String(path)}`;
  return `https://${host}/get-mp3/${sign}/${String(ts)}${normalizedPath}`;
}

function buildYandexUpstreamHeaders(req, extraHeaders = {}) {
  const headers = {
    accept: req.headers.accept || 'application/json',
    'accept-language': req.headers['accept-language'] || 'ru,en;q=0.9',
    'user-agent': req.headers['user-agent'] || 'Mozilla/5.0 (KinosredaRealtimeProxy)'
  };
  if (YANDEX_MUSIC_SERVER_TOKEN) {
    headers.authorization = /^OAuth\s+/i.test(YANDEX_MUSIC_SERVER_TOKEN)
      ? YANDEX_MUSIC_SERVER_TOKEN
      : `OAuth ${YANDEX_MUSIC_SERVER_TOKEN}`;
  } else if (req.headers.authorization) {
    headers.authorization = req.headers.authorization;
  }
  if (req.headers['x-yandex-music-client']) {
    headers['x-yandex-music-client'] = req.headers['x-yandex-music-client'];
  } else if (YANDEX_MUSIC_CLIENT_HEADER) {
    headers['x-yandex-music-client'] = YANDEX_MUSIC_CLIENT_HEADER;
  }
  return { ...headers, ...extraHeaders };
}

function parseJsonSafe(text, fallback = {}) {
  try {
    const parsed = JSON.parse(String(text || ''));
    if (parsed && typeof parsed === 'object') return parsed;
    return fallback;
  } catch (_) {
    return fallback;
  }
}

async function handleYandexResolveDownload(urlObj, req, res, corsHeaders) {
  if (req.method !== 'GET') {
    res.writeHead(405, { ...corsHeaders, 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: 'method_not_allowed' }));
    return;
  }
  const rawUrl = (urlObj.searchParams.get('url') || '').trim();
  if (!rawUrl) {
    res.writeHead(400, { ...corsHeaders, 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: 'missing_url' }));
    return;
  }

  let targetUrl;
  try {
    targetUrl = new URL(rawUrl);
  } catch (_) {
    res.writeHead(400, { ...corsHeaders, 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: 'invalid_url' }));
    return;
  }
  if (targetUrl.protocol !== 'https:') {
    res.writeHead(400, { ...corsHeaders, 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: 'invalid_protocol' }));
    return;
  }
  if (!isAllowedYandexDownloadHost(targetUrl.hostname)) {
    res.writeHead(403, { ...corsHeaders, 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: 'forbidden_host' }));
    return;
  }

  const isApiGetMp3Endpoint = (
    (
      targetUrl.hostname === 'api.music.yandex.net'
      || targetUrl.hostname === 'api.music.yandex.ru'
      || targetUrl.hostname.endsWith('.music.yandex.net')
      || targetUrl.hostname.endsWith('.music.yandex.ru')
    )
    && String(targetUrl.pathname || '').startsWith('/get-mp3/')
  );

  // For /get-mp3 endpoints the response can be metadata (host/path/ts/s) required to build final stream URL.
  if (isApiGetMp3Endpoint && !targetUrl.searchParams.has('format')) {
    targetUrl.searchParams.set('format', 'json');
  }

  try {
    const response = await fetchTextWithRedirect(targetUrl, {
      accept: 'application/xml, text/xml, application/json;q=0.9, */*;q=0.1',
      'user-agent': req.headers['user-agent'] || 'Mozilla/5.0 (KinosredaRealtimeProxy)'
    });

    if (response.statusCode < 200 || response.statusCode >= 300) {
      res.writeHead(502, { ...corsHeaders, 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: 'upstream_error', statusCode: response.statusCode }));
      return;
    }

    const bodyText = String(response.body || '');
    const contentType = String(response.headers['content-type'] || '').toLowerCase();

    let host = '';
    let pathValue = '';
    let ts = '';
    let s = '';
    let src = '';

    if (contentType.includes('json')) {
      try {
        const parsed = JSON.parse(bodyText);
        const source = parsed && typeof parsed === 'object'
          ? (parsed.result && typeof parsed.result === 'object' ? parsed.result : parsed)
          : {};
        host = String(source.host || '').trim();
        pathValue = String(source.path || '').trim();
        ts = String(source.ts || '').trim();
        s = String(source.s || '').trim();
        src = String(source.src || source.url || '').trim();
      } catch (_) {}
    }

    if (!host || !pathValue || !ts || !s) {
      host = parseTagValue(bodyText, 'host');
      pathValue = parseTagValue(bodyText, 'path');
      ts = parseTagValue(bodyText, 'ts');
      s = parseTagValue(bodyText, 's');
      if (!src) src = parseTagValue(bodyText, 'src');
    }

    const builtDirectLink = buildYandexDirectLink({ host, path: pathValue, ts, s });
    const directLink = builtDirectLink || src;
    if (!directLink) {
      res.writeHead(502, { ...corsHeaders, 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: 'resolve_failed' }));
      return;
    }

    let resolvedRawDirectLink = directLink;
    let finalDirectLink = directLink;
    try {
      const parsed = new URL(directLink);
      if (isAllowedYandexStreamHost(parsed.hostname)) {
        const deeplyResolved = await resolveYandexGetMp3UrlIfNeeded(parsed, req, 12);
        const resolvedUrl = deeplyResolved && deeplyResolved.toString ? deeplyResolved.toString() : parsed.toString();
        resolvedRawDirectLink = resolvedUrl;
        finalDirectLink = buildYandexStreamProxyUrl(req, resolvedUrl);
      }
    } catch (_) {}

    res.writeHead(200, { ...corsHeaders, 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      ok: true,
      result: {
        directLink: finalDirectLink,
        rawDirectLink: directLink,
        resolvedRawDirectLink,
        host,
        path: pathValue,
        ts
      }
    }));
  } catch (error) {
    res.writeHead(502, { ...corsHeaders, 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: 'resolve_error', message: String(error && error.message || error) }));
  }
}

async function handleYandexTrackLink(urlObj, req, res, corsHeaders) {
  if (req.method !== 'GET') {
    res.writeHead(405, { ...corsHeaders, 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: 'method_not_allowed' }));
    return;
  }

  const trackId = extractTrackId(urlObj.searchParams.get('track_id') || urlObj.searchParams.get('trackId'));
  let albumId = extractTrackId(urlObj.searchParams.get('album_id') || urlObj.searchParams.get('albumId'));
  if (!trackId) {
    res.writeHead(400, { ...corsHeaders, 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: 'missing_track_id' }));
    return;
  }

  try {
    const upstreamHeaders = buildYandexUpstreamHeaders(req, { accept: 'application/json' });

    if (!albumId) {
      const trackInfoUrl = new URL(`/tracks/${trackId}`, YANDEX_MUSIC_API_ORIGIN);
      const trackInfoResponse = await fetchTextWithRedirect(trackInfoUrl, upstreamHeaders, 2);
      const trackPayload = parseJsonSafe(trackInfoResponse.body, {});
      const trackRows = Array.isArray(trackPayload.result) ? trackPayload.result : [];
      const row = trackRows[0] && typeof trackRows[0] === 'object' ? trackRows[0] : {};
      albumId = extractTrackId(
        row.albumId
        || (row.albums && row.albums[0] && row.albums[0].id)
        || (row.album && row.album.id)
      );
    }

    const compoundTrackId = albumId ? `${trackId}:${albumId}` : `${trackId}`;
    const retpath = albumId
      ? `https://music.yandex.ru/album/${albumId}/track/${trackId}`
      : `https://music.yandex.ru/track/${trackId}`;

    const handlersUrl = new URL(`https://music.yandex.ru/api/v2.1/handlers/track/${compoundTrackId}/web-album_track-track-track-main/download/m`);
    handlersUrl.searchParams.set('hq', '1');

    const handlerHeaders = buildYandexUpstreamHeaders(req, {
      accept: 'application/json',
      referer: retpath,
      origin: 'https://music.yandex.ru',
      'x-retpath-y': retpath
    });
    const stage1 = await fetchTextWithRedirect(handlersUrl, handlerHeaders, 4);
    if (stage1.statusCode < 200 || stage1.statusCode >= 300) {
      res.writeHead(502, { ...corsHeaders, 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: 'handlers_request_failed', statusCode: stage1.statusCode }));
      return;
    }

    const stage1Payload = parseJsonSafe(stage1.body, {});
    let src = String(stage1Payload.src || (stage1Payload.result && stage1Payload.result.src) || '').trim();
    if (!src) {
      res.writeHead(502, { ...corsHeaders, 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: 'handlers_src_missing' }));
      return;
    }
    if (src.startsWith('//')) src = `https:${src}`;

    let srcUrl;
    try {
      srcUrl = new URL(src, 'https://api.music.yandex.net');
    } catch (_) {
      res.writeHead(502, { ...corsHeaders, 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: 'handlers_src_invalid' }));
      return;
    }
    srcUrl.searchParams.set('format', 'json');
    if (!srcUrl.searchParams.has('external-domain')) {
      srcUrl.searchParams.set('external-domain', 'music.yandex.ru');
    }

    const stage2 = await fetchTextWithRedirect(srcUrl, handlerHeaders, 4);
    if (stage2.statusCode < 200 || stage2.statusCode >= 300) {
      res.writeHead(502, { ...corsHeaders, 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: 'location_request_failed', statusCode: stage2.statusCode }));
      return;
    }

    const stage2Payload = parseJsonSafe(stage2.body, {});
    const source = stage2Payload && typeof stage2Payload === 'object'
      ? (stage2Payload.result && typeof stage2Payload.result === 'object' ? stage2Payload.result : stage2Payload)
      : {};

    let host = String(source.host || '').trim();
    let pathValue = String(source.path || '').trim();
    let ts = String(source.ts || '').trim();
    let s = String(source.s || '').trim();
    let src2 = String(source.src || source.url || '').trim();

    if (!host || !pathValue || !ts || !s) {
      host = parseTagValue(stage2.body, 'host');
      pathValue = parseTagValue(stage2.body, 'path');
      ts = parseTagValue(stage2.body, 'ts');
      s = parseTagValue(stage2.body, 's');
      if (!src2) src2 = parseTagValue(stage2.body, 'src');
    }

    const builtDirectLink = buildYandexDirectLink({ host, path: pathValue, ts, s });
    const rawDirectLink = builtDirectLink || src2;
    if (!rawDirectLink) {
      res.writeHead(502, { ...corsHeaders, 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: 'track_link_resolve_failed' }));
      return;
    }

    let resolvedRawDirectLink = rawDirectLink;
    let directLink = rawDirectLink;
    try {
      const parsedRaw = new URL(rawDirectLink);
      if (isAllowedYandexStreamHost(parsedRaw.hostname)) {
        const deeplyResolved = await resolveYandexGetMp3UrlIfNeeded(parsedRaw, req, 12);
        const resolvedUrl = deeplyResolved && deeplyResolved.toString ? deeplyResolved.toString() : parsedRaw.toString();
        resolvedRawDirectLink = resolvedUrl;
        directLink = buildYandexStreamProxyUrl(req, resolvedUrl);
      }
    } catch (_) {}

    res.writeHead(200, { ...corsHeaders, 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      ok: true,
      result: {
        trackId,
        albumId: albumId || '',
        directLink,
        rawDirectLink,
        resolvedRawDirectLink
      }
    }));
  } catch (error) {
    res.writeHead(502, { ...corsHeaders, 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: 'track_link_error', message: String(error && error.message || error) }));
  }
}

async function resolveYandexGetMp3UrlIfNeeded(targetUrl, req, maxSteps = 12) {
  let currentUrl = targetUrl;
  const seen = new Set();

  for (let step = 0; step < maxSteps; step += 1) {
    const isGetMp3Endpoint = (
      (
        currentUrl.hostname === 'api.music.yandex.net'
        || currentUrl.hostname === 'api.music.yandex.ru'
        || currentUrl.hostname.endsWith('.music.yandex.net')
        || currentUrl.hostname.endsWith('.music.yandex.ru')
      )
      && String(currentUrl.pathname || '').startsWith('/get-mp3/')
    );
    if (!isGetMp3Endpoint) break;

    const currentKey = currentUrl.toString();
    if (seen.has(currentKey)) break;
    seen.add(currentKey);

    const metaUrl = new URL(currentUrl.toString());
    metaUrl.searchParams.set('format', 'json');

    let response;
    try {
      response = await fetchTextWithRedirect(metaUrl, {
        accept: 'application/json, application/xml, text/xml;q=0.9, */*;q=0.1',
        'user-agent': req.headers['user-agent'] || 'Mozilla/5.0 (KinosredaRealtimeProxy)'
      });
    } catch (_) {
      break;
    }
    if (response.statusCode < 200 || response.statusCode >= 300) break;

    const bodyText = String(response.body || '');
    const contentType = String(response.headers['content-type'] || '').toLowerCase();
    let host = '';
    let pathValue = '';
    let ts = '';
    let s = '';
    let src = '';

    if (contentType.includes('json')) {
      try {
        const parsed = JSON.parse(bodyText);
        const source = parsed && typeof parsed === 'object'
          ? (parsed.result && typeof parsed.result === 'object' ? parsed.result : parsed)
          : {};
        host = String(source.host || '').trim();
        pathValue = String(source.path || '').trim();
        ts = String(source.ts || '').trim();
        s = String(source.s || '').trim();
        src = String(source.src || source.url || '').trim();
      } catch (_) {}
    }

    if (!host || !pathValue || !ts || !s) {
      host = parseTagValue(bodyText, 'host');
      pathValue = parseTagValue(bodyText, 'path');
      ts = parseTagValue(bodyText, 'ts');
      s = parseTagValue(bodyText, 's');
      if (!src) src = parseTagValue(bodyText, 'src');
    }

    const builtDirectLink = buildYandexDirectLink({ host, path: pathValue, ts, s });
    const directLink = builtDirectLink || src;
    if (!directLink) break;

    let nextUrl;
    try {
      nextUrl = new URL(directLink);
    } catch (_) {
      break;
    }
    if (!isAllowedYandexStreamHost(nextUrl.hostname)) break;
    if (nextUrl.toString() === currentKey) break;
    currentUrl = nextUrl;
  }

  return currentUrl;
}

function proxyYandexAudioStreamResolved(targetUrl, req, res, corsHeaders, redirectLeft = 12) {
  resolveYandexGetMp3UrlIfNeeded(targetUrl, req, Math.max(4, redirectLeft))
    .then((resolvedUrl) => {
      proxyYandexAudioStream(resolvedUrl || targetUrl, req, res, corsHeaders, redirectLeft);
    })
    .catch(() => {
      proxyYandexAudioStream(targetUrl, req, res, corsHeaders, redirectLeft);
    });
}

function proxyYandexAudioStream(targetUrl, req, res, corsHeaders, redirectLeft = 12) {
  const sendProxyError = (statusCode, message) => {
    if (res.writableEnded || res.destroyed) return;
    if (res.headersSent) {
      // Headers/body are already being streamed; safest option is to abort socket.
      res.destroy();
      return;
    }
    try {
      res.writeHead(statusCode, { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: false, error: message || 'proxy_error' }));
    } catch (_) {
      try { res.destroy(); } catch (_) {}
    }
  };

  const requestHeaders = {
    accept: req.headers.accept || '*/*',
    'accept-language': req.headers['accept-language'] || 'ru,en;q=0.9',
    'user-agent': req.headers['user-agent'] || 'Mozilla/5.0 (KinosredaRealtimeProxy)'
  };
  if (req.headers.range) requestHeaders.range = req.headers.range;
  if (YANDEX_MUSIC_SERVER_TOKEN) {
    requestHeaders.authorization = /^OAuth\s+/i.test(YANDEX_MUSIC_SERVER_TOKEN)
      ? YANDEX_MUSIC_SERVER_TOKEN
      : `OAuth ${YANDEX_MUSIC_SERVER_TOKEN}`;
  } else if (req.headers.authorization) {
    requestHeaders.authorization = req.headers.authorization;
  }
  if (req.headers['x-yandex-music-client']) {
    requestHeaders['x-yandex-music-client'] = req.headers['x-yandex-music-client'];
  } else if (YANDEX_MUSIC_CLIENT_HEADER) {
    requestHeaders['x-yandex-music-client'] = YANDEX_MUSIC_CLIENT_HEADER;
  }

  const method = req.method === 'HEAD' ? 'HEAD' : 'GET';
  const upstream = https.request(targetUrl, {
    method,
    headers: requestHeaders,
    timeout: 20000
  }, (upres) => {
    const statusCode = upres.statusCode || 0;
    const location = upres.headers.location;

    if ([301, 302, 303, 307, 308].includes(statusCode) && location && redirectLeft > 0) {
      upres.resume();
      let nextUrl;
      try {
        nextUrl = new URL(location, targetUrl);
      } catch (_) {
        sendProxyError(502, 'invalid_redirect');
        return;
      }
      if (!isAllowedYandexStreamHost(nextUrl.hostname)) {
        sendProxyError(403, 'forbidden_redirect_host');
        return;
      }
      proxyYandexAudioStreamResolved(nextUrl, req, res, corsHeaders, redirectLeft - 1);
      return;
    }

    const contentType = String(upres.headers['content-type'] || '').toLowerCase();
    const isMetadataPayload = (
      statusCode >= 200
      && statusCode < 300
      && (
        contentType.includes('xml')
        || contentType.includes('json')
        || contentType.startsWith('text/')
      )
    );

    if (isMetadataPayload && redirectLeft > 0) {
      const chunks = [];
      upres.on('data', (chunk) => chunks.push(chunk));
      upres.on('end', () => {
        const bodyText = Buffer.concat(chunks).toString('utf8');

        let host = '';
        let pathValue = '';
        let ts = '';
        let s = '';
        let src = '';

        if (contentType.includes('json')) {
          try {
            const parsed = JSON.parse(bodyText);
            const source = parsed && typeof parsed === 'object'
              ? (parsed.result && typeof parsed.result === 'object' ? parsed.result : parsed)
              : {};
            host = String(source.host || '').trim();
            pathValue = String(source.path || '').trim();
            ts = String(source.ts || '').trim();
            s = String(source.s || '').trim();
            src = String(source.src || source.url || '').trim();
          } catch (_) {}
        }

        if (!host || !pathValue || !ts || !s) {
          host = parseTagValue(bodyText, 'host');
          pathValue = parseTagValue(bodyText, 'path');
          ts = parseTagValue(bodyText, 'ts');
          s = parseTagValue(bodyText, 's');
          if (!src) src = parseTagValue(bodyText, 'src');
        }

        const builtDirectLink = buildYandexDirectLink({ host, path: pathValue, ts, s });
        const directLink = builtDirectLink || src;
        if (!directLink) {
          sendProxyError(502, 'unsupported_metadata_response');
          return;
        }

        let nextUrl;
        try {
          nextUrl = new URL(directLink);
        } catch (_) {
          sendProxyError(502, 'invalid_metadata_url');
          return;
        }
        if (!isAllowedYandexStreamHost(nextUrl.hostname)) {
          sendProxyError(403, 'forbidden_metadata_host');
          return;
        }
        proxyYandexAudioStreamResolved(nextUrl, req, res, corsHeaders, redirectLeft - 1);
      });
      return;
    }
    if (isMetadataPayload && redirectLeft <= 0) {
      upres.resume();
      sendProxyError(502, 'metadata_depth_exceeded');
      return;
    }

    const responseHeaders = { ...corsHeaders };
    const passthrough = [
      'content-type',
      'content-length',
      'content-range',
      'accept-ranges',
      'cache-control',
      'etag',
      'last-modified',
      'expires'
    ];
    passthrough.forEach((key) => {
      if (upres.headers[key] != null) responseHeaders[key] = upres.headers[key];
    });
    if (!responseHeaders['content-type']) responseHeaders['content-type'] = 'audio/mpeg';

    if (res.writableEnded || res.destroyed) {
      upres.resume();
      return;
    }
    if (res.headersSent) {
      upres.destroy();
      return;
    }
    try {
      res.writeHead(statusCode || 502, responseHeaders);
    } catch (_) {
      upres.destroy();
      try { res.destroy(); } catch (_) {}
      return;
    }
    if (method === 'HEAD') {
      upres.resume();
      res.end();
      return;
    }
    upres.pipe(res);
  });

  upstream.on('timeout', () => {
    upstream.destroy();
    sendProxyError(504, 'proxy_timeout');
  });
  upstream.on('error', () => {
    sendProxyError(502, 'proxy_error');
  });
  upstream.end();
}

function handleYandexAudioStream(urlObj, req, res, corsHeaders) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { ...corsHeaders, 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: 'method_not_allowed' }));
    return;
  }
  const rawUrl = String(urlObj.searchParams.get('url') || '').trim();
  if (!rawUrl) {
    res.writeHead(400, { ...corsHeaders, 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: 'missing_url' }));
    return;
  }

  let targetUrl;
  try {
    targetUrl = new URL(rawUrl);
  } catch (_) {
    res.writeHead(400, { ...corsHeaders, 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: 'invalid_url' }));
    return;
  }

  if (targetUrl.protocol !== 'https:') {
    res.writeHead(400, { ...corsHeaders, 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: 'invalid_protocol' }));
    return;
  }
  if (!isAllowedYandexStreamHost(targetUrl.hostname)) {
    res.writeHead(403, { ...corsHeaders, 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: 'forbidden_host' }));
    return;
  }

  proxyYandexAudioStreamResolved(targetUrl, req, res, corsHeaders);
}

async function handleYtMusicSearch(urlObj, req, res, corsHeaders) {
  if (req.method !== 'GET') {
    res.writeHead(405, { ...corsHeaders, 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: 'method_not_allowed' }));
    return;
  }

  const query = String(urlObj.searchParams.get('q') || urlObj.searchParams.get('text') || '').trim();
  const limit = Math.min(50, Math.max(1, parseInt(urlObj.searchParams.get('limit') || '20', 10) || 20));
  const page = Math.max(0, parseInt(urlObj.searchParams.get('page') || '0', 10) || 0);
  const includeCollections = ['1', 'true', 'yes', 'on']
    .includes(String(urlObj.searchParams.get('include_collections') || '').trim().toLowerCase());
  const requestedModeRaw = String(
    urlObj.searchParams.get('mode')
    || urlObj.searchParams.get('criterion')
    || ''
  ).trim().toLowerCase();
  const searchMode = ['all', 'tracks', 'artists', 'albums', 'playlists'].includes(requestedModeRaw)
    ? requestedModeRaw
    : (includeCollections ? 'all' : 'tracks');
  if (!query) {
    res.writeHead(200, { ...corsHeaders, 'Content-Type': 'application/json' });
    const result = {
      tracks: [],
      artists: [],
      albums: [],
      playlists: [],
      total: 0,
      page,
      limit,
      mode: searchMode
    };
    res.end(JSON.stringify({ ok: true, result }));
    return;
  }

  try {
    const bridgeArgs = ['search', '--query', query, '--limit', String(limit), '--page', String(page)];
    if (includeCollections) bridgeArgs.push('--include-collections');
    bridgeArgs.push('--mode', searchMode);
    const payload = await runYtMusicBridge(
      bridgeArgs,
      YTMUSIC_SEARCH_BRIDGE_TIMEOUT_MS
    );
    res.writeHead(200, { ...corsHeaders, 'Content-Type': 'application/json' });
    res.end(JSON.stringify(payload));
  } catch (error) {
    // Degrade gracefully: search should not fail hard for the client UI.
    res.writeHead(200, { ...corsHeaders, 'Content-Type': 'application/json' });
    const result = {
      tracks: [],
      artists: [],
      albums: [],
      playlists: [],
      total: 0,
      page,
      limit,
      mode: searchMode,
      warning: `ytmusic_search_error:${String(error && error.message || error)}`
    };
    res.end(JSON.stringify({
      ok: true,
      result
    }));
  }
}

async function handleYtMusicCollection(urlObj, req, res, corsHeaders) {
  if (req.method !== 'GET') {
    res.writeHead(405, { ...corsHeaders, 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: 'method_not_allowed' }));
    return;
  }

  const kindRaw = String(urlObj.searchParams.get('kind') || urlObj.searchParams.get('type') || '').trim().toLowerCase();
  const kind = kindRaw === 'album' ? 'album' : (kindRaw === 'playlist' ? 'playlist' : '');
  const collectionId = String(
    urlObj.searchParams.get('id')
    || urlObj.searchParams.get('collection_id')
    || urlObj.searchParams.get('collectionId')
    || urlObj.searchParams.get('browseId')
    || urlObj.searchParams.get('playlistId')
    || ''
  ).trim();
  const limit = Math.min(300, Math.max(1, parseInt(urlObj.searchParams.get('limit') || '120', 10) || 120));

  if (!kind) {
    res.writeHead(400, { ...corsHeaders, 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: 'invalid_collection_kind' }));
    return;
  }
  if (!collectionId) {
    res.writeHead(400, { ...corsHeaders, 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: 'missing_collection_id' }));
    return;
  }

  try {
    const payload = await runYtMusicBridge(
      ['collection', '--kind', kind, '--id', collectionId, '--limit', String(limit)],
      Math.max(10_000, YTMUSIC_SEARCH_BRIDGE_TIMEOUT_MS)
    );
    res.writeHead(200, { ...corsHeaders, 'Content-Type': 'application/json' });
    res.end(JSON.stringify(payload));
  } catch (error) {
    res.writeHead(502, { ...corsHeaders, 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      ok: false,
      error: 'ytmusic_collection_error',
      message: String(error && error.message || error)
    }));
  }
}

async function handleYtMusicTrack(urlObj, req, res, corsHeaders) {
  if (req.method !== 'GET') {
    res.writeHead(405, { ...corsHeaders, 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: 'method_not_allowed' }));
    return;
  }

  const rawVideoId = urlObj.searchParams.get('video_id')
    || urlObj.searchParams.get('videoId')
    || urlObj.searchParams.get('id')
    || '';
  const videoId = extractYouTubeVideoId(rawVideoId);
  if (!videoId) {
    res.writeHead(400, { ...corsHeaders, 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: 'missing_video_id' }));
    return;
  }

  const cachedFresh = getCachedYtMusicTrack(videoId);
  if (cachedFresh) {
    res.writeHead(200, { ...corsHeaders, 'Content-Type': 'application/json' });
    res.end(JSON.stringify(cachedFresh));
    return;
  }

  try {
    const inflight = ytmTrackInflight.get(videoId);
    const payloadPromise = inflight || (async () => {
      const payload = await runYtMusicBridge(
        ['track', '--video-id', videoId],
        Math.min(YTMUSIC_SEARCH_BRIDGE_TIMEOUT_MS, YTMUSIC_TRACK_BRIDGE_TIMEOUT_MS)
      );
      setCachedYtMusicTrack(videoId, payload);
      return payload;
    })();
    if (!inflight) ytmTrackInflight.set(videoId, payloadPromise);
    let payload;
    try {
      payload = await payloadPromise;
    } finally {
      if (!inflight) ytmTrackInflight.delete(videoId);
    }
    res.writeHead(200, { ...corsHeaders, 'Content-Type': 'application/json' });
    res.end(JSON.stringify(payload));
  } catch (error) {
    const stale = getCachedYtMusicTrack(videoId, { allowStale: true });
    if (stale && typeof stale === 'object') {
      const stalePayload = { ...stale };
      if (!stalePayload.ok) stalePayload.ok = true;
      stalePayload.warning = `ytmusic_track_stale:${String(error && error.message || error)}`;
      res.writeHead(200, { ...corsHeaders, 'Content-Type': 'application/json' });
      res.end(JSON.stringify(stalePayload));
      return;
    }
    const fallbackPayload = buildFallbackYtMusicTrackPayload(
      videoId,
      `ytmusic_track_fallback:${String(error && error.message || error)}`
    );
    setCachedYtMusicTrack(videoId, fallbackPayload, Math.min(YTMUSIC_TRACK_CACHE_TTL_MS, 60_000));
    res.writeHead(200, { ...corsHeaders, 'Content-Type': 'application/json' });
    res.end(JSON.stringify(fallbackPayload));
  }
}

async function handleYtMusicStream(urlObj, req, res, corsHeaders) {
  if (req.method !== 'GET') {
    res.writeHead(405, { ...corsHeaders, 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: 'method_not_allowed' }));
    return;
  }

  const rawVideoId = urlObj.searchParams.get('video_id')
    || urlObj.searchParams.get('videoId')
    || urlObj.searchParams.get('id')
    || '';
  const videoId = extractYouTubeVideoId(rawVideoId);
  if (!videoId) {
    res.writeHead(400, { ...corsHeaders, 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: 'missing_video_id' }));
    return;
  }

  const requestedMode = normalizeYtMusicAudioMode(String(urlObj.searchParams.get('mode') || ''))
    || (YTM_PROXY_URL ? 'proxy' : 'direct');
  const forceResolve = isTruthyEnv(
    String(urlObj.searchParams.get('resolve') || urlObj.searchParams.get('eager') || '')
  );
  const sendResult = (result) => {
    res.writeHead(200, { ...corsHeaders, 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, result }));
  };
  const warmupInBackground = () => {
    resolveYtMusicStreamMetaFast(
      videoId,
      requestedMode,
      Math.min(YTMUSIC_AUDIO_RESOLVE_TIMEOUT_MS, 10_000)
    )
      .then((meta) => {
        if (!meta || typeof meta !== 'object' || !meta.rawDirectLink) return;
        cacheYtMusicPrimaryToken(videoId, meta, requestedMode);
      })
      .catch(() => {});
  };

  const cachedSid = getYtMusicVideoTokenForPreferredMode(videoId, requestedMode);
  if (cachedSid) {
    const mapped = getYtMusicStreamLink(cachedSid);
    if (mapped && mapped.url) {
      let host = '';
      let streamPath = '';
      try {
        const parsed = new URL(String(mapped.url || '').trim());
        host = parsed.hostname || '';
        streamPath = parsed.pathname || '';
      } catch (_) {}
      sendResult(buildYtMusicStreamResult(req, videoId, {
        videoId,
        rawDirectLink: String(mapped.url || '').trim(),
        host,
        path: streamPath,
        resolvedVia: String(mapped.mode || requestedMode || '').trim().toLowerCase(),
        ext: String(mapped.ext || '').trim().toLowerCase(),
        mimeType: String(mapped.mimeType || '').trim().toLowerCase(),
        candidateStreams: []
      }, { cacheLabel: 'token-cache', modeHint: requestedMode }));
      return;
    }
  }

  const cachedMeta = getCachedYtMusicStreamMeta(videoId);
  if (cachedMeta && cachedMeta.rawDirectLink) {
    sendResult(buildYtMusicStreamResult(
      req,
      videoId,
      cachedMeta,
      { cacheLabel: 'meta-cache', modeHint: requestedMode }
    ));
    return;
  }

  if (!forceResolve) {
    warmupInBackground();
    sendResult(buildDeferredYtMusicStreamResult(req, videoId, requestedMode));
    return;
  }

  try {
    const meta = await resolveYtMusicStreamMetaFast(
      videoId,
      requestedMode,
      Math.min(YTMUSIC_AUDIO_RESOLVE_TIMEOUT_MS, 12_000)
    );
    sendResult(buildYtMusicStreamResult(
      req,
      videoId,
      meta,
      { cacheLabel: 'resolved-fast', modeHint: requestedMode }
    ));
  } catch (error) {
    const rawMessage = String(error && error.message || error);
    console.warn(`[ytm] stream_resolve_failed videoId=${videoId} message=${rawMessage.slice(0, 300)}`);
    const stale = getCachedYtMusicStreamMeta(videoId, { allowStale: true });
    if (stale && stale.rawDirectLink) {
      sendResult(buildYtMusicStreamResult(
        req,
        videoId,
        stale,
        {
          cacheLabel: 'stale-fallback',
          warning: `ytmusic_stream_stale:${rawMessage}`,
          modeHint: requestedMode
        }
      ));
      return;
    }
    warmupInBackground();
    sendResult(buildDeferredYtMusicStreamResult(
      req,
      videoId,
      requestedMode,
      `stream_deferred:${rawMessage.slice(0, 220)}`
    ));
  }
}

function sanitizeAttachmentFilename(rawName) {
  const base = String(rawName || '').trim();
  if (!base) return 'track.m4a';
  const normalized = base
    .replace(/[\\/:*?"<>|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return normalized || 'track.m4a';
}

function buildContentDispositionHeader(filename) {
  const safeName = sanitizeAttachmentFilename(filename);
  const asciiName = safeName
    .replace(/[^\x20-\x7E]+/g, '_')
    .replace(/["\\]/g, '_');
  const encodedUtf8 = encodeURIComponent(safeName);
  return `attachment; filename="${asciiName}"; filename*=UTF-8''${encodedUtf8}`;
}

function buildInlineContentDispositionHeader(filename) {
  const safeName = sanitizeAttachmentFilename(filename);
  const asciiName = safeName
    .replace(/[^\x20-\x7E]+/g, '_')
    .replace(/["\\]/g, '_');
  const encodedUtf8 = encodeURIComponent(safeName);
  return `inline; filename="${asciiName}"; filename*=UTF-8''${encodedUtf8}`;
}

function proxyYouTubeAudioStream(targetUrl, req, res, corsHeaders, attachmentFilename = '', redirectLeft = 8, fallbackContentType = '', onStartupFailure = null) {
  let recoveredViaFallback = false;
  const tryStartupFallback = (reason = '') => {
    if (recoveredViaFallback) return false;
    if (typeof onStartupFailure !== 'function') return false;
    if (res.writableEnded || res.destroyed || res.headersSent) return false;
    recoveredViaFallback = true;
    try {
      onStartupFailure(String(reason || '').trim());
      return true;
    } catch (_) {
      return false;
    }
  };
  const sendProxyError = (statusCode, message) => {
    if (tryStartupFallback(message || `http_${statusCode || 0}`)) return;
    if (res.writableEnded || res.destroyed) return;
    if (res.headersSent) {
      res.destroy();
      return;
    }
    try {
      res.writeHead(statusCode, { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: false, error: message || 'proxy_error' }));
    } catch (_) {
      try { res.destroy(); } catch (_) {}
    }
  };

  const hasStartupFallback = typeof onStartupFailure === 'function';
  const effectiveRequestTimeoutMs = hasStartupFallback
    ? Math.min(Math.max(12_000, Number(YTMUSIC_AUDIO_PROXY_TIMEOUT_MS) || 30_000), 20_000)
    : YTMUSIC_AUDIO_PROXY_TIMEOUT_MS;

  const rawRangeHeader = String(req.headers.range || '').trim();
  const effectiveRangeHeader = normalizeAudioRangeHeaderForClient(req, rawRangeHeader);

  const requestHeaders = {
    accept: req.headers.accept || '*/*',
    'accept-language': req.headers['accept-language'] || 'ru,en;q=0.9',
    'user-agent': req.headers['user-agent'] || 'Mozilla/5.0 (KinosredaRealtimeProxy)'
  };
  if (effectiveRangeHeader) requestHeaders.range = effectiveRangeHeader;

  const method = req.method === 'HEAD' ? 'HEAD' : 'GET';
  const upstream = https.request(targetUrl, {
    method,
    headers: requestHeaders,
    timeout: effectiveRequestTimeoutMs
  }, (upres) => {
    const statusCode = upres.statusCode || 0;
    const location = upres.headers.location;
    if ([301, 302, 303, 307, 308].includes(statusCode) && location && redirectLeft > 0) {
      upres.resume();
      let nextUrl;
      try {
        nextUrl = new URL(location, targetUrl);
      } catch (_) {
        sendProxyError(502, 'invalid_redirect');
        return;
      }
      if (nextUrl.protocol !== 'https:' || !isAllowedYouTubeStreamHost(nextUrl.hostname)) {
        sendProxyError(403, 'forbidden_redirect_host');
        return;
      }
      proxyYouTubeAudioStream(nextUrl, req, res, corsHeaders, attachmentFilename, redirectLeft - 1, fallbackContentType, onStartupFailure);
      return;
    }
    if (statusCode >= 400) {
      upres.resume();
      sendProxyError(statusCode, `upstream_http_${statusCode}`);
      return;
    }

    const responseHeaders = { ...corsHeaders };
    const passthrough = [
      'content-type',
      'content-length',
      'content-range',
      'accept-ranges',
      'cache-control',
      'etag',
      'last-modified',
      'expires'
    ];
    passthrough.forEach((key) => {
      if (upres.headers[key] != null) responseHeaders[key] = upres.headers[key];
    });
    if (!responseHeaders['content-type']) responseHeaders['content-type'] = fallbackContentType || 'audio/mp4';
    if (attachmentFilename) {
      responseHeaders['content-disposition'] = buildContentDispositionHeader(attachmentFilename);
      responseHeaders['x-content-type-options'] = 'nosniff';
    }

    if (res.writableEnded || res.destroyed) {
      upres.resume();
      return;
    }
    if (res.headersSent) {
      upres.destroy();
      return;
    }
    try {
      res.writeHead(statusCode || 502, responseHeaders);
    } catch (_) {
      upres.destroy();
      try { res.destroy(); } catch (_) {}
      return;
    }

    if (method === 'HEAD') {
      upres.resume();
      res.end();
      return;
    }
    upres.pipe(res);
  });

  upstream.on('timeout', () => {
    upstream.destroy();
    sendProxyError(504, 'proxy_timeout');
  });
  upstream.on('error', () => {
    sendProxyError(502, 'proxy_error');
  });
  upstream.end();
}

function proxyYouTubeAudioStreamViaCurl(
  targetUrl,
  req,
  res,
  corsHeaders,
  attachmentFilename = '',
  fallbackContentType = '',
  onStartupFailure = null,
  proxyUrlOverride = null,
  streamOptions = null
) {
  const APPLE_OPEN_RANGE_CHUNK_BYTES = 256 * 1024;
  let recoveredViaFallback = false;
  const tryStartupFallback = (reason = '') => {
    if (recoveredViaFallback) return false;
    if (typeof onStartupFailure !== 'function') return false;
    if (res.writableEnded || res.destroyed || res.headersSent) return false;
    recoveredViaFallback = true;
    try {
      onStartupFailure(String(reason || '').trim());
      return true;
    } catch (_) {
      return false;
    }
  };
  const sendProxyError = (statusCode, message) => {
    if (tryStartupFallback(message || `http_${statusCode || 0}`)) return;
    if (res.writableEnded || res.destroyed) return;
    if (res.headersSent) {
      res.destroy();
      return;
    }
    try {
      res.writeHead(statusCode, { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: false, error: message || 'proxy_error' }));
    } catch (_) {
      try { res.destroy(); } catch (_) {}
    }
  };

  const hasStartupFallback = typeof onStartupFailure === 'function';
  const startupTimeoutOverrideMs = Math.max(
    0,
    Number(streamOptions && streamOptions.startupTimeoutMs || 0) || 0
  );
  const rawRangeHeader = String(req.headers.range || '').trim();
  const isAppleClient = isAppleBrowserUserAgent(req);

  const parseRequestedRange = (rawHeader = '') => {
    const raw = String(rawHeader || '').trim();
    // Accept "bytes=0-1", "bytes=0-", "-500", and first range of "bytes=0-1,100-200"
    const m = raw.match(/^bytes\s*=\s*(\d*)\s*-\s*(\d*)/i);
    if (!m) return null;
    const startRaw = m[1] || '';
    const endRaw = m[2] || '';
    if (!startRaw && !endRaw) return null;
    if (!startRaw) {
      const suffix = Number(endRaw);
      if (!Number.isFinite(suffix) || suffix <= 0) return null;
      return { suffix };
    }
    const start = Number(startRaw);
    if (!Number.isFinite(start) || start < 0) return null;
    const end = endRaw === '' ? null : Number(endRaw);
    if (end != null && (!Number.isFinite(end) || end < start)) return null;
    return { start, end };
  };

  const declaredTotalBytes = (() => {
    const raw = String(
      targetUrl.searchParams.get('clen')
      || targetUrl.searchParams.get('content_length')
      || ''
    ).trim();
    const value = Number(raw);
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
  })();

  const upstreamRangeHeader = (() => {
    if (!rawRangeHeader) return '';
    const parsed = parseRequestedRange(rawRangeHeader);
    if (!parsed) return rawRangeHeader;
    if (parsed.suffix != null && declaredTotalBytes > 0) {
      const suffixLen = Math.max(1, parsed.suffix);
      const start = Math.max(0, declaredTotalBytes - suffixLen);
      const end = declaredTotalBytes - 1;
      return `bytes=${start}-${end}`;
    }
    if (parsed.start != null && parsed.end != null && declaredTotalBytes > 0) {
      const boundedEnd = Math.min(parsed.end, declaredTotalBytes - 1);
      return `bytes=${parsed.start}-${Math.max(parsed.start, boundedEnd)}`;
    }
    if (parsed.start != null && parsed.end == null && isAppleClient) {
      const start = Math.max(0, parsed.start);
      if (start > 0) return rawRangeHeader;
      const targetEnd = APPLE_OPEN_RANGE_CHUNK_BYTES - 1;
      if (declaredTotalBytes > 0) {
        const boundedEnd = Math.min(targetEnd, declaredTotalBytes - 1);
        return `bytes=${start}-${Math.max(start, boundedEnd)}`;
      }
      return `bytes=${start}-${Math.max(start, targetEnd)}`;
    }
    return rawRangeHeader;
  })();
  const effectiveRangeHeader = normalizeAudioRangeHeaderForClient(req, upstreamRangeHeader);

  const effectiveProxyUrl = typeof proxyUrlOverride === 'string'
    ? String(proxyUrlOverride || '').trim()
    : String(YTM_PROXY_URL || '').trim();

  const baseTimeoutSec = Math.max(12, Math.ceil((Number(YTMUSIC_AUDIO_PROXY_TIMEOUT_MS) || 30_000) / 1000));
  const timeoutSec = hasStartupFallback ? Math.min(baseTimeoutSec, 25) : baseTimeoutSec;
  const baseArgs = [
    '--silent',
    '--show-error',
    '--no-buffer',
    '--location',
    '--fail',
    '--http1.1',
    '--ipv4',
    '--connect-timeout',
    String(YTMUSIC_CURL_CONNECT_TIMEOUT_SEC),
    '--speed-time',
    '12',
    '--speed-limit',
    '1',
    '--max-time',
    String(timeoutSec),
    '--header',
    `User-Agent: ${req.headers['user-agent'] || 'Mozilla/5.0 (KinosredaRealtimeProxy)'}`,
    '--header',
    `Accept: ${req.headers.accept || '*/*'}`
  ];
  if (YTM_USE_AMNEZIAWG) {
    baseArgs.push('--noproxy', '*');
    if (YTM_AWG_INTERFACE) {
      baseArgs.push('--interface', YTM_AWG_INTERFACE);
    }
  }
  if (effectiveProxyUrl) {
    baseArgs.push('--proxy', effectiveProxyUrl);
  }
  if (effectiveRangeHeader) {
    baseArgs.push('--header', `Range: ${effectiveRangeHeader}`);
  }

  const parseCurlHeaderDump = (text) => {
    const raw = String(text || '').replace(/\r/g, '');
    const chunks = raw.split('\n');
    const blocks = [];
    let current = null;
    for (const line of chunks) {
      if (!line.trim()) {
        if (current) {
          blocks.push(current);
          current = null;
        }
        continue;
      }
      if (line.startsWith('HTTP/')) {
        if (current) blocks.push(current);
        current = { statusLine: line, headers: {} };
        continue;
      }
      if (!current) continue;
      const idx = line.indexOf(':');
      if (idx <= 0) continue;
      const key = line.slice(0, idx).trim().toLowerCase();
      const value = line.slice(idx + 1).trim();
      if (key) current.headers[key] = value;
    }
    if (current) blocks.push(current);
    const last = blocks.length ? blocks[blocks.length - 1] : null;
    if (!last) return { statusCode: 0, headers: {} };
    const match = last.statusLine.match(/\s(\d{3})\b/);
    const statusCode = match ? Number(match[1]) : 0;
    return { statusCode, headers: last.headers || {} };
  };

  const probeHeadersViaCurl = () => new Promise((resolve, reject) => {
    const args = [
      ...baseArgs,
      '--dump-header',
      '-',
      '--output',
      '/dev/null',
      targetUrl.toString()
    ];
    let stdout = '';
    let stderr = '';
    const proc = spawn('curl', args, { env: buildYtmExecEnv(null) });
    proc.stdout.on('data', (chunk) => {
      stdout += String(chunk || '');
      if (stdout.length > 20000) stdout = stdout.slice(-20000);
    });
    proc.stderr.on('data', (chunk) => {
      stderr += String(chunk || '');
      if (stderr.length > 5000) stderr = stderr.slice(-5000);
    });
    proc.on('close', (code) => {
      if (code === 0) {
        resolve(parseCurlHeaderDump(stdout));
        return;
      }
      reject(new Error(stderr || `curl_probe_exit_${code}`));
    });
    proc.on('error', reject);
  });

  const createResponseHeaders = (upstreamHeaders = {}, statusCode = 200) => {
    const responseHeaders = {
      ...corsHeaders,
      'Content-Type': upstreamHeaders['content-type'] || fallbackContentType || 'audio/mp4',
      'Cache-Control': upstreamHeaders['cache-control'] || 'no-store',
      'Accept-Ranges': upstreamHeaders['accept-ranges'] || 'bytes',
      'X-Accel-Buffering': 'no'
    };
    const passthrough = ['content-length', 'content-range', 'etag', 'last-modified', 'expires'];
    passthrough.forEach((key) => {
      if (upstreamHeaders[key] != null) responseHeaders[key] = upstreamHeaders[key];
    });
    if (responseHeaders['accept-ranges']) {
      responseHeaders['Accept-Ranges'] = responseHeaders['accept-ranges'];
      delete responseHeaders['accept-ranges'];
    }
    if (attachmentFilename) {
      responseHeaders['Content-Disposition'] = buildContentDispositionHeader(attachmentFilename);
      responseHeaders['X-Content-Type-Options'] = 'nosniff';
    } else {
      delete responseHeaders['Content-Disposition'];
      delete responseHeaders['content-disposition'];
    }
    if (statusCode === 206) {
      const requestedRange = parseRequestedRange(effectiveRangeHeader);
      if (!responseHeaders['content-range'] && requestedRange) {
        const knownTotal = declaredTotalBytes > 0 ? declaredTotalBytes : 0;
        const upstreamLen = Number(upstreamHeaders['content-length'] || 0);
        if (knownTotal > 0 && requestedRange.start != null) {
          const start = Math.min(Math.max(0, requestedRange.start), knownTotal - 1);
          const end = requestedRange.end != null
            ? Math.min(requestedRange.end, knownTotal - 1)
            : (knownTotal - 1);
          const boundedEnd = Math.max(start, end);
          responseHeaders['content-range'] = `bytes ${start}-${boundedEnd}/${knownTotal}`;
          if (!responseHeaders['content-length']) {
            responseHeaders['content-length'] = String(Math.max(0, boundedEnd - start + 1));
          }
        } else if (Number.isFinite(upstreamLen) && upstreamLen > 0 && requestedRange.start != null) {
          const end = requestedRange.end != null
            ? requestedRange.end
            : (requestedRange.start + upstreamLen - 1);
          responseHeaders['content-range'] = `bytes ${requestedRange.start}-${Math.max(requestedRange.start, end)}/*`;
          responseHeaders['content-length'] = String(upstreamLen);
        } else if (requestedRange.start != null && requestedRange.end != null) {
          responseHeaders['content-range'] = `bytes ${requestedRange.start}-${requestedRange.end}/*`;
        }
      }
      responseHeaders['Accept-Ranges'] = 'bytes';
    }
    return responseHeaders;
  };

  const streamBodyViaCurl = (statusCode, upstreamHeaders = {}, expectedBodyBytes = 0) => {
    const args = [...baseArgs, targetUrl.toString()];
    let stderr = '';
    const proc = spawn('curl', args, { env: buildYtmExecEnv(null) });
    let sentHeaders = false;
    let wroteAnyBody = false;
    let bytesForwarded = 0;
    const maxBytes = Number.isFinite(Number(expectedBodyBytes)) && Number(expectedBodyBytes) > 0
      ? Math.floor(Number(expectedBodyBytes))
      : 0;
    let forceStoppedByCap = false;
    let abortedByStartupDeadline = false;
    let startupTimer = null;
    const defaultStartupDeadlineMs = Math.max(
      5000,
      Math.min(Number(YTMUSIC_AUDIO_START_TIMEOUT_MS) || 15000, timeoutSec * 1000)
    );
    const startupDeadlineMs = startupTimeoutOverrideMs > 0
      ? Math.max(2500, Math.min(startupTimeoutOverrideMs, timeoutSec * 1000))
      : defaultStartupDeadlineMs;
    const clearStartupTimer = () => {
      if (startupTimer) {
        clearTimeout(startupTimer);
        startupTimer = null;
      }
    };
    startupTimer = setTimeout(() => {
      startupTimer = null;
      if (res.writableEnded || res.destroyed || res.headersSent || sentHeaders || wroteAnyBody) return;
      abortedByStartupDeadline = true;
      try { proc.kill('SIGKILL'); } catch (_) {}
      sendProxyError(504, 'proxy_start_timeout');
    }, startupDeadlineMs);

    proc.stdout.on('data', (chunk) => {
      clearStartupTimer();
      if (res.writableEnded || res.destroyed) return;
      if (!sentHeaders) {
        sentHeaders = true;
        if (!res.headersSent) {
          try {
            res.writeHead(statusCode, createResponseHeaders(upstreamHeaders, statusCode));
          } catch (_) {
            try { proc.kill('SIGKILL'); } catch (_) {}
            try { res.destroy(); } catch (_) {}
            return;
          }
        }
      }
      let outChunk = chunk;
      if (maxBytes > 0) {
        const remain = maxBytes - bytesForwarded;
        if (remain <= 0) return;
        if (chunk.length > remain) {
          outChunk = chunk.subarray(0, remain);
        }
      }
      if (!outChunk || !outChunk.length) return;
      wroteAnyBody = true;
      bytesForwarded += outChunk.length;
      try { res.write(outChunk); } catch (_) {}
      if (maxBytes > 0 && bytesForwarded >= maxBytes) {
        forceStoppedByCap = true;
        try { proc.kill('SIGTERM'); } catch (_) {}
      }
    });

    proc.stderr.on('data', (chunk) => {
      stderr += String(chunk || '');
      if (stderr.length > 5000) stderr = stderr.slice(-5000);
    });

    const stopProc = () => {
      clearStartupTimer();
      try { proc.kill('SIGTERM'); } catch (_) {}
    };
    req.on('close', stopProc);
    res.on('close', stopProc);

    proc.on('close', (code) => {
      clearStartupTimer();
      req.off('close', stopProc);
      res.off('close', stopProc);
      if (abortedByStartupDeadline) return;
      if (code === 0 || forceStoppedByCap) {
        if (!sentHeaders && !res.headersSent) {
          sendProxyError(502, 'empty_upstream');
          return;
        }
        if (!res.writableEnded) res.end();
        return;
      }
      if (res.headersSent || sentHeaders || wroteAnyBody) {
        if (!res.writableEnded) res.destroy();
        return;
      }
      const errText = String(stderr || '').toLowerCase();
      if (errText.includes('timed out') || errText.includes('timeout')) {
        sendProxyError(504, 'proxy_timeout');
        return;
      }
      sendProxyError(502, 'proxy_error');
    });
  };

  if (req.method === 'HEAD') {
    probeHeadersViaCurl()
      .then((probe) => {
        if (probe.statusCode >= 400) {
          if (tryStartupFallback(`upstream_http_${probe.statusCode}`)) return;
        }
        const statusCode = effectiveRangeHeader ? 206 : (probe.statusCode || 200);
        if (!res.headersSent) res.writeHead(statusCode, createResponseHeaders(probe.headers, statusCode));
        res.end();
      })
      .catch(() => {
        const statusCode = effectiveRangeHeader ? 206 : 200;
        if (!res.headersSent) res.writeHead(statusCode, createResponseHeaders({}, statusCode));
        res.end();
      });
    return;
  }

  if (effectiveRangeHeader) {
    const requestedRange = parseRequestedRange(effectiveRangeHeader);
    if (requestedRange && requestedRange.start != null) {
      if (declaredTotalBytes > 0) {
        const boundedStart = Math.min(Math.max(0, requestedRange.start), declaredTotalBytes - 1);
        const boundedEnd = requestedRange.end != null
          ? Math.min(requestedRange.end, declaredTotalBytes - 1)
          : (isAppleClient
              ? (boundedStart === 0
                ? Math.min(APPLE_OPEN_RANGE_CHUNK_BYTES - 1, declaredTotalBytes - 1)
                : (declaredTotalBytes - 1))
              : (declaredTotalBytes - 1));
        const safeEnd = Math.max(boundedStart, boundedEnd);
        const exactLen = Math.max(0, safeEnd - boundedStart + 1);
        const exactHeaders = {
          'content-length': String(exactLen),
          'accept-ranges': 'bytes',
          'content-range': `bytes ${boundedStart}-${safeEnd}/${declaredTotalBytes}`
        };
        streamBodyViaCurl(206, exactHeaders, exactLen);
        return;
      }
      if (requestedRange.end == null && isAppleClient) {
        const start = Math.max(0, requestedRange.start);
        if (start > 0) {
          streamBodyViaCurl(206, { 'accept-ranges': 'bytes' });
          return;
        }
        const end = APPLE_OPEN_RANGE_CHUNK_BYTES - 1;
        const exactLen = Math.max(0, end - start + 1);
        const exactHeaders = {
          'content-length': String(exactLen),
          'accept-ranges': 'bytes',
          'content-range': `bytes ${start}-${end}/*`
        };
        streamBodyViaCurl(206, exactHeaders, exactLen);
        return;
      }
      if (requestedRange.end != null) {
        const safeEnd = Math.max(requestedRange.start, requestedRange.end);
        const exactLen = Math.max(0, safeEnd - requestedRange.start + 1);
        const exactHeaders = {
          'content-length': String(exactLen),
          'accept-ranges': 'bytes',
          'content-range': `bytes ${requestedRange.start}-${safeEnd}/*`
        };
        streamBodyViaCurl(206, exactHeaders, exactLen);
        return;
      }
      // Open-ended range with unknown total: stream as partial and rely on upstream.
      streamBodyViaCurl(206, { 'accept-ranges': 'bytes' });
      return;
    }
    if (requestedRange && requestedRange.suffix != null && declaredTotalBytes > 0) {
      const suffixLen = Math.max(1, requestedRange.suffix);
      const start = Math.max(0, declaredTotalBytes - suffixLen);
      const end = declaredTotalBytes - 1;
      const exactLen = Math.max(0, end - start + 1);
      const exactHeaders = {
        'content-length': String(exactLen),
        'accept-ranges': 'bytes',
        'content-range': `bytes ${start}-${end}/${declaredTotalBytes}`
      };
      streamBodyViaCurl(206, exactHeaders, exactLen);
      return;
    }
    // Unknown/non-standard range form: probe once to preserve valid 206 headers for Safari.
    probeHeadersViaCurl()
      .then((probe) => {
        if (probe.statusCode >= 400) {
          if (tryStartupFallback(`upstream_http_${probe.statusCode}`)) return;
          sendProxyError(probe.statusCode || 502, 'proxy_error');
          return;
        }
        const statusCode = probe.statusCode && probe.statusCode > 0
          ? probe.statusCode
          : 206;
        streamBodyViaCurl(statusCode, probe.headers || {});
      })
      .catch(() => {
        sendProxyError(504, 'proxy_timeout');
      });
    return;
  }

  streamBodyViaCurl(200, {});
}

function proxyYouTubeAudioStreamAsMp3(targetUrl, req, res, corsHeaders, attachmentFilename = '', useProxy = false) {
  const sendProxyError = (statusCode, message) => {
    if (res.writableEnded || res.destroyed) return;
    if (res.headersSent) {
      try { res.destroy(); } catch (_) {}
      return;
    }
    try {
      res.writeHead(statusCode, { ...corsHeaders, 'Content-Type': 'text/plain; charset=utf-8' });
      res.end(message);
    } catch (_) {
      try { res.destroy(); } catch (_) {}
    }
  };

  const responseHeaders = {
    ...corsHeaders,
    'Content-Type': 'audio/mpeg',
    'Cache-Control': 'no-store',
    'Accept-Ranges': 'none'
  };
  if (attachmentFilename) {
    responseHeaders['Content-Disposition'] = buildContentDispositionHeader(attachmentFilename.replace(/\.[^.]+$/, '.mp3'));
    responseHeaders['X-Content-Type-Options'] = 'nosniff';
  }
  const fallbackContentType = mapExtToAudioContentType(inferYouTubeAudioExt(targetUrl.toString())) || '';

  if (req.method === 'HEAD') {
    if (!res.headersSent) res.writeHead(200, responseHeaders);
    res.end();
    return;
  }

  const timeoutSec = Math.max(30, Math.ceil(YTMUSIC_AUDIO_PROXY_TIMEOUT_MS / 1000));
  const curlArgs = [
    '--silent',
    '--show-error',
    '--location',
    '--fail',
    '--ipv4',
    '--connect-timeout',
    String(YTMUSIC_CURL_CONNECT_TIMEOUT_SEC),
    '--max-time',
    String(timeoutSec),
    '--header',
    `User-Agent: ${req.headers['user-agent'] || 'Mozilla/5.0 (KinosredaRealtimeProxy)'}`,
    '--header',
    `Accept: ${req.headers.accept || '*/*'}`,
    targetUrl.toString()
  ];
  if (YTM_USE_AMNEZIAWG) {
    curlArgs.splice(5, 0, '--noproxy', '*');
    if (YTM_AWG_INTERFACE) {
      curlArgs.splice(5, 0, '--interface', YTM_AWG_INTERFACE);
    }
  }
  if (useProxy && YTM_PROXY_URL) {
    curlArgs.splice(5, 0, '--proxy', YTM_PROXY_URL);
  }

  const ffmpegArgs = [
    '-nostdin',
    '-hide_banner',
    '-loglevel',
    'error',
    '-i',
    'pipe:0',
    '-vn',
    '-acodec',
    'libmp3lame',
    '-b:a',
    '320k',
    '-f',
    'mp3',
    'pipe:1'
  ];

  let ffmpeg;
  let curl;
  let sentHeaders = false;
  let curlErr = '';
  let ffmpegErr = '';

  const cleanup = () => {
    try { req.off('close', onClosed); } catch (_) {}
    try { res.off('close', onClosed); } catch (_) {}
  };
  const onClosed = () => {
    try { if (curl && !curl.killed) curl.kill('SIGTERM'); } catch (_) {}
    try { if (ffmpeg && !ffmpeg.killed) ffmpeg.kill('SIGTERM'); } catch (_) {}
  };
  req.on('close', onClosed);
  res.on('close', onClosed);

  try {
    curl = spawn('curl', curlArgs, { env: buildYtmExecEnv(null) });
    ffmpeg = spawn('ffmpeg', ffmpegArgs, { env: process.env });
  } catch (_) {
    cleanup();
    if (useProxy && YTM_PROXY_URL) {
      proxyYouTubeAudioStreamViaCurl(targetUrl, req, res, corsHeaders, attachmentFilename, fallbackContentType);
      return;
    }
    proxyYouTubeAudioStream(targetUrl, req, res, corsHeaders, attachmentFilename, 8, fallbackContentType);
    return;
  }

  curl.stdout.pipe(ffmpeg.stdin);

  curl.stderr.on('data', (chunk) => {
    curlErr += String(chunk || '');
    if (curlErr.length > 8000) curlErr = curlErr.slice(-8000);
  });
  ffmpeg.stderr.on('data', (chunk) => {
    ffmpegErr += String(chunk || '');
    if (ffmpegErr.length > 8000) ffmpegErr = ffmpegErr.slice(-8000);
  });

  ffmpeg.stdout.on('data', (chunk) => {
    if (res.writableEnded || res.destroyed) return;
    if (!sentHeaders) {
      sentHeaders = true;
      if (!res.headersSent) {
        try { res.writeHead(200, responseHeaders); } catch (_) {}
      }
    }
    try { res.write(chunk); } catch (_) {}
  });

  const fallbackToSource = () => {
    try { if (curl && !curl.killed) curl.kill('SIGTERM'); } catch (_) {}
    try { if (ffmpeg && !ffmpeg.killed) ffmpeg.kill('SIGTERM'); } catch (_) {}
    cleanup();
    if (res.writableEnded || res.destroyed || res.headersSent) return;
    if (useProxy && YTM_PROXY_URL) {
      proxyYouTubeAudioStreamViaCurl(targetUrl, req, res, corsHeaders, attachmentFilename, fallbackContentType);
      return;
    }
    proxyYouTubeAudioStream(targetUrl, req, res, corsHeaders, attachmentFilename, 8, fallbackContentType);
  };

  curl.on('error', fallbackToSource);
  ffmpeg.on('error', fallbackToSource);

  ffmpeg.on('close', (code) => {
    cleanup();
    if (code === 0 && sentHeaders) {
      if (!res.writableEnded) res.end();
      return;
    }
    if (!sentHeaders) {
      fallbackToSource();
      return;
    }
    if (!res.writableEnded) {
      try { res.destroy(); } catch (_) {}
    }
  });

  curl.on('close', (code) => {
    if (code === 0) return;
    try { if (ffmpeg && !ffmpeg.killed) ffmpeg.kill('SIGTERM'); } catch (_) {}
    if (!sentHeaders) {
      const errText = `${curlErr}\n${ffmpegErr}`.toLowerCase();
      if (errText.includes('timed out') || errText.includes('timeout')) {
        sendProxyError(504, 'proxy_timeout');
        return;
      }
      fallbackToSource();
    }
  });
}

function handleYtMusicAudioStream(urlObj, req, res, corsHeaders) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { ...corsHeaders, 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: 'method_not_allowed' }));
    return;
  }
  const sid = String(urlObj.searchParams.get('sid') || '').trim();
  const mapped = sid ? getYtMusicStreamLink(sid) : null;
  const normalizeAudioMode = normalizeYtMusicAudioMode;
  const resolveVideoTokenByMode = getYtMusicVideoTokenForPreferredMode;
  const requestedMode = String(urlObj.searchParams.get('mode') || '').trim().toLowerCase();
  const explicitRequestedMode = requestedMode === 'proxy' || requestedMode === 'direct'
    ? normalizeAudioMode(requestedMode)
    : '';
  const mappedMode = normalizeAudioMode(String(mapped && mapped.mode || '').trim().toLowerCase());
  const rawVideoId = urlObj.searchParams.get('video_id')
    || urlObj.searchParams.get('videoId')
    || urlObj.searchParams.get('id')
    || '';
  const fallbackVideoId = extractYouTubeVideoId(rawVideoId);
  const rawUrl = (mapped && mapped.url)
    ? String(mapped.url || '').trim()
    : String(urlObj.searchParams.get('url') || '').trim();
  let resolvedRawUrl = rawUrl;
  if (!resolvedRawUrl && fallbackVideoId) {
    const cachedSid = resolveVideoTokenByMode(fallbackVideoId, explicitRequestedMode);
    if (cachedSid) {
      const cachedMapped = getYtMusicStreamLink(cachedSid);
      if (cachedMapped && cachedMapped.url) {
        resolvedRawUrl = String(cachedMapped.url || '').trim();
      }
    }
  }
  if (!resolvedRawUrl && fallbackVideoId) {
    const desiredMode = explicitRequestedMode || '';
    const resolveMetaPromise = resolveYtMusicStreamMetaFast(
      fallbackVideoId,
      desiredMode,
      Math.min(YTMUSIC_AUDIO_RESOLVE_TIMEOUT_MS, 12_000)
    );
    // Robust fallback for stale/invalid sid across restarts/workers.
    // Re-resolve by video_id so playback can proceed.
    resolveMetaPromise
      .then((meta) => {
        const fallbackUrl = String(meta && meta.rawDirectLink || '').trim();
        if (!fallbackUrl) throw new Error('stream_url_missing');
        const mode = normalizeAudioMode(String(meta && meta.resolvedVia || '').trim().toLowerCase())
          || normalizeAudioMode(desiredMode)
          || (YTM_PROXY_URL ? 'proxy' : 'direct');
        const ext = String(meta && meta.ext || '').trim().toLowerCase();
        const mimeType = String(meta && meta.mimeType || '').trim().toLowerCase();
        const fallbackMode = normalizeAudioMode(mode || desiredMode || (YTM_PROXY_URL ? 'proxy' : 'direct'))
          || (YTM_PROXY_URL ? 'proxy' : 'direct');
        const token = putYtMusicStreamLink(fallbackUrl, fallbackMode, { ext, mimeType });
        putYtMusicVideoToken(fallbackVideoId, fallbackMode, token);
        const continueUrlObj = new URL(urlObj.toString());
        if (token) {
          continueUrlObj.searchParams.set('sid', token);
          continueUrlObj.searchParams.delete('url');
        } else {
          continueUrlObj.searchParams.set('url', fallbackUrl);
        }
        if (fallbackMode) {
          continueUrlObj.searchParams.set('mode', fallbackMode);
        } else {
          continueUrlObj.searchParams.delete('mode');
        }
        handleYtMusicAudioStream(continueUrlObj, req, res, corsHeaders);
      })
      .catch((error) => {
        if (!res.writableEnded) {
          res.writeHead(504, { ...corsHeaders, 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            ok: false,
            error: 'stream_resolve_failed',
            message: String(error && error.message || error || '')
          }));
        }
      });
    return;
  }
  if (!resolvedRawUrl) {
    res.writeHead(400, { ...corsHeaders, 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: sid ? 'invalid_stream_id' : 'missing_url' }));
    return;
  }

  let targetUrl;
  try {
    targetUrl = new URL(resolvedRawUrl);
  } catch (_) {
    res.writeHead(400, { ...corsHeaders, 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: 'invalid_url' }));
    return;
  }
  if (targetUrl.protocol !== 'https:') {
    res.writeHead(400, { ...corsHeaders, 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: 'invalid_protocol' }));
    return;
  }
  if (!isAllowedYouTubeStreamHost(targetUrl.hostname)) {
    res.writeHead(403, { ...corsHeaders, 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: 'forbidden_host' }));
    return;
  }

  const forceDownload = ['1', 'true', 'yes', 'on'].includes(
    String(urlObj.searchParams.get('download') || '').trim().toLowerCase()
  );
  const attachmentFilename = forceDownload
    ? sanitizeAttachmentFilename(urlObj.searchParams.get('filename') || '')
    : '';
  const requestedFormat = String(urlObj.searchParams.get('format') || '').trim().toLowerCase();
  const mappedExt = String(mapped && mapped.ext || '').trim().toLowerCase();
  const mappedMimeType = String(mapped && mapped.mimeType || '').trim().toLowerCase();
  const inferredExt = inferYouTubeAudioExt(targetUrl.toString());
  const streamExt = mappedExt || inferredExt;
  const fallbackContentType = mappedMimeType || mapExtToAudioContentType(streamExt) || '';
  const mode = normalizeAudioMode(
    (mapped && mapped.url ? mappedMode : '')
    || explicitRequestedMode
    || mappedMode
    || requestedMode
    || ''
  )
    || (YTM_PROXY_URL ? 'proxy' : 'direct');
  const useProxyMode = mode === 'proxy' && Boolean(YTM_PROXY_URL);
  const attemptedStartupUrls = new Set();
  const normalizeAudioCandidateUrl = (rawValue = '') => {
    const raw = String(rawValue || '').trim();
    if (!raw) return '';
    try {
      const parsed = new URL(raw);
      if (parsed.protocol !== 'https:' || !isAllowedYouTubeStreamHost(parsed.hostname)) return '';
      return parsed.toString();
    } catch (_) {
      return '';
    }
  };
  const markAttemptedStartupUrl = (rawValue = '') => {
    const normalized = normalizeAudioCandidateUrl(rawValue);
    if (!normalized) return '';
    attemptedStartupUrls.add(normalized);
    return normalized;
  };
  const hasAttemptedStartupUrl = (rawValue = '') => {
    const normalized = normalizeAudioCandidateUrl(rawValue);
    return Boolean(normalized && attemptedStartupUrls.has(normalized));
  };
  markAttemptedStartupUrl(targetUrl.toString());
  let startupFallbackInProgress = false;
  let startupBridgeRefreshUsed = false;
  const configuredStartupTimeoutMs = Math.max(
    4000,
    Number(YTMUSIC_AUDIO_START_TIMEOUT_MS) || 12_000
  );
  const firstAttemptStartupTimeoutMs = Math.max(
    3500,
    Math.min(configuredStartupTimeoutMs, 7000)
  );
  const pickFallbackStartupTimeoutMs = (index = 0, total = 1) => {
    const safeIndex = Math.max(0, Number(index) || 0);
    const safeTotal = Math.max(1, Number(total) || 1);
    const quickTimeoutMs = Math.max(3200, Math.min(configuredStartupTimeoutMs, 5200));
    const mediumTimeoutMs = Math.max(
      quickTimeoutMs + 900,
      Math.min(Math.max(configuredStartupTimeoutMs, 8000), 10_000)
    );
    const finalTimeoutMs = Math.max(configuredStartupTimeoutMs, 16_000);
    if (safeTotal <= 1) return finalTimeoutMs;
    if (safeIndex === 0) return quickTimeoutMs;
    if (safeIndex >= safeTotal - 1) return finalTimeoutMs;
    return mediumTimeoutMs;
  };

  const restartWithResolvedMode = (desiredMode = 'direct', options = {}) => {
    const modeValue = normalizeAudioMode(desiredMode) || 'direct';
    const forceBridgeResolve = Boolean(options && options.forceBridgeResolve);
    const failureReason = String(options && options.reason || '').trim();
    if (res.writableEnded || res.destroyed || res.headersSent) return;
    if (startupFallbackInProgress) return;

    const launchSingle = (
      nextUrl,
      modeHint,
      ctypeHint = '',
      onStartupFailure = null,
      streamLaunchOptions = null
    ) => {
      const useProxy = modeHint === 'proxy' && Boolean(YTM_PROXY_URL);
      proxyYouTubeAudioStreamViaCurl(
        nextUrl,
        req,
        res,
        corsHeaders,
        attachmentFilename,
        ctypeHint,
        onStartupFailure,
        useProxy ? YTM_PROXY_URL : '',
        streamLaunchOptions
      );
    };

    if (!fallbackVideoId) {
      launchSingle(targetUrl, modeValue, fallbackContentType);
      return;
    }

    startupFallbackInProgress = true;
    const resolvePromise = forceBridgeResolve
      ? resolveYtMusicStreamMetaForMode(
          fallbackVideoId,
          modeValue,
          Math.min(YTMUSIC_STREAM_RESOLVE_TIMEOUT_MS, 12_000)
        )
      : resolveYtMusicStreamMetaFast(
          fallbackVideoId,
          modeValue,
          Math.min(YTMUSIC_AUDIO_RESOLVE_TIMEOUT_MS, 12_000)
        );

    resolvePromise
      .then((meta) => {
        const resolvedMode = normalizeAudioMode(String(meta && meta.resolvedVia || '').trim().toLowerCase()) || modeValue;
        const metaVideoId = extractYouTubeVideoId(meta && meta.videoId || fallbackVideoId) || fallbackVideoId;
        const candidates = [];
        const seen = new Set();
        const pushCandidate = (rawValue, extValue = '', mimeTypeValue = '') => {
          const normalizedUrl = normalizeAudioCandidateUrl(rawValue);
          if (!normalizedUrl || seen.has(normalizedUrl)) return;
          seen.add(normalizedUrl);
          if (hasAttemptedStartupUrl(normalizedUrl)) return;
          const ext = String(extValue || '').trim().toLowerCase();
          const mimeType = String(mimeTypeValue || '').trim().toLowerCase();
          const contentType = mimeType || mapExtToAudioContentType(ext) || fallbackContentType || '';
          candidates.push({ url: normalizedUrl, ext, mimeType, contentType });
        };

        pushCandidate(meta && meta.rawDirectLink, meta && meta.ext, meta && meta.mimeType);
        if (Array.isArray(meta && meta.candidateStreams)) {
          meta.candidateStreams.forEach((row) => {
            if (!row || typeof row !== 'object') return;
            pushCandidate(
              row.rawDirectLink || row.directLink || row.url,
              row.ext,
              row.mimeType
            );
          });
        }
        if (!candidates.length) throw new Error('stream_candidates_exhausted');

        startupFallbackInProgress = false;
        const launchFromIndex = (index = 0, reason = '') => {
          if (res.writableEnded || res.destroyed || res.headersSent) return;
          let nextIndex = Math.max(0, Number(index) || 0);
          while (nextIndex < candidates.length && hasAttemptedStartupUrl(candidates[nextIndex].url)) {
            nextIndex += 1;
          }
          if (nextIndex >= candidates.length) {
            if (!forceBridgeResolve && !startupBridgeRefreshUsed) {
              startupBridgeRefreshUsed = true;
              restartWithResolvedMode(resolvedMode, {
                forceBridgeResolve: true,
                reason: String(reason || failureReason || 'candidates_exhausted')
              });
              return;
            }
            if (res.writableEnded || res.destroyed || res.headersSent) return;
            res.writeHead(504, { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ ok: false, error: 'proxy_timeout' }));
            return;
          }

          const candidate = candidates[nextIndex];
          if (!candidate || !candidate.url) {
            launchFromIndex(nextIndex + 1, reason);
            return;
          }
          markAttemptedStartupUrl(candidate.url);
          const token = putYtMusicStreamLink(candidate.url, resolvedMode, {
            ext: candidate.ext,
            mimeType: candidate.mimeType
          });
          if (token) {
            putYtMusicVideoToken(fallbackVideoId, resolvedMode, token);
            if (metaVideoId) putYtMusicVideoToken(metaVideoId, resolvedMode, token);
          }

          let nextUrl;
          try {
            nextUrl = new URL(candidate.url);
          } catch (_) {
            launchFromIndex(nextIndex + 1, 'invalid_candidate_url');
            return;
          }
          launchSingle(
            nextUrl,
            resolvedMode,
            candidate.contentType || fallbackContentType || '',
            (startupReason = '') => {
              launchFromIndex(nextIndex + 1, startupReason);
            },
            {
              startupTimeoutMs: pickFallbackStartupTimeoutMs(nextIndex, candidates.length)
            }
          );
        };

        launchFromIndex(0, failureReason);
      })
      .catch((error) => {
        startupFallbackInProgress = false;
        const message = String(error && error.message || error || '');
        if (!forceBridgeResolve && !startupBridgeRefreshUsed) {
          startupBridgeRefreshUsed = true;
          restartWithResolvedMode(modeValue, {
            forceBridgeResolve: true,
            reason: message || failureReason
          });
          return;
        }
        if (res.writableEnded || res.destroyed || res.headersSent) return;
        res.writeHead(504, { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: false, error: 'proxy_timeout' }));
      });
  };

  const startupFallbackHandler = fallbackVideoId
    ? (reason = '') => {
        const fallbackMode = useProxyMode
          ? 'direct'
          : (YTM_PROXY_URL ? 'proxy' : 'direct');
        markAttemptedStartupUrl(targetUrl.toString());
        restartWithResolvedMode(fallbackMode, { reason: String(reason || '') });
      }
    : null;
  const initialStreamOptions = startupFallbackHandler
    ? { startupTimeoutMs: firstAttemptStartupTimeoutMs }
    : null;
  if (requestedFormat === 'mp3') {
    proxyYouTubeAudioStreamAsMp3(
      targetUrl,
      req,
      res,
      corsHeaders,
      forceDownload ? attachmentFilename : '',
      useProxyMode
    );
    return;
  }

  // Keep the same egress path as used during URL resolving.
  // If resolver used proxy, stream should also go via proxy to avoid IP-bound signature mismatch.
  if (useProxyMode) {
    proxyYouTubeAudioStreamViaCurl(
      targetUrl,
      req,
      res,
      corsHeaders,
      attachmentFilename,
      fallbackContentType,
      startupFallbackHandler,
      YTM_PROXY_URL,
      initialStreamOptions
    );
    return;
  }
  proxyYouTubeAudioStreamViaCurl(
    targetUrl,
    req,
    res,
    corsHeaders,
    attachmentFilename,
    fallbackContentType,
    startupFallbackHandler,
    '',
    initialStreamOptions
  );
}

function handleYandexOAuthConfig(req, res, corsHeaders) {
  if (req.method !== 'GET') {
    res.writeHead(405, { ...corsHeaders, 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: 'method_not_allowed' }));
    return;
  }
  const hasClientId = Boolean(String(YANDEX_OAUTH_CLIENT_ID || '').trim());
  const hasRedirect = Boolean(String(YANDEX_OAUTH_REDIRECT_URI || '').trim());
  res.writeHead(200, { ...corsHeaders, 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    ok: true,
    result: {
      configured: hasClientId,
      clientId: YANDEX_OAUTH_CLIENT_ID,
      authorizeUrl: YANDEX_OAUTH_AUTHORIZE_URL,
      redirectUri: YANDEX_OAUTH_REDIRECT_URI,
      missing: {
        clientId: !hasClientId,
        redirectUri: !hasRedirect
      }
    }
  }));
}

function handleYandexOAuthStart(urlObj, req, res) {
  if (req.method !== 'GET') {
    res.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('method_not_allowed');
    return;
  }

  const clientId = String(YANDEX_OAUTH_CLIENT_ID || '').trim();
  const redirectUri = String(urlObj.searchParams.get('redirect_uri') || YANDEX_OAUTH_REDIRECT_URI || '').trim();
  const stateParam = String(urlObj.searchParams.get('state') || '').trim();

  if (!clientId || !redirectUri) {
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('oauth_not_configured');
    return;
  }

  let authUrl;
  try {
    authUrl = new URL(YANDEX_OAUTH_AUTHORIZE_URL);
  } catch (_) {
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('oauth_url_invalid');
    return;
  }
  authUrl.searchParams.set('response_type', 'token');
  authUrl.searchParams.set('client_id', clientId);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  if (stateParam) authUrl.searchParams.set('state', stateParam);

  res.writeHead(302, {
    Location: authUrl.toString(),
    'Cache-Control': 'no-store'
  });
  res.end();
}

function parseNutrientNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function parseFatSecretNumber(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  const normalized = raw.replace(',', '.');
  const num = parseFloat(normalized);
  return Number.isFinite(num) ? num : null;
}

function parseFatSecretDescription(description) {
  const desc = String(description || '').trim();
  if (!desc) return { perLabel: '', calories: null, fat: null, carbs: null, protein: null, perAmount: null, perUnit: '' };
  const perMatch = desc.match(/^Per\s+(.+?)\s*-\s*/i);
  const perLabel = perMatch ? perMatch[1].trim() : '';
  const perUnitMatch = perLabel.match(/(\d+(?:[.,]\d+)?)\s*(g|ml)\b/i);
  const perAmount = perUnitMatch ? parseFatSecretNumber(perUnitMatch[1]) : null;
  const perUnit = perUnitMatch ? perUnitMatch[2].toLowerCase() : '';
  const calories = parseFatSecretNumber((desc.match(/Calories:\s*([\d.,]+)/i) || [])[1]);
  const fat = parseFatSecretNumber((desc.match(/Fat:\s*([\d.,]+)/i) || [])[1]);
  const carbs = parseFatSecretNumber((desc.match(/Carbs:\s*([\d.,]+)/i) || desc.match(/Carbohydrates:\s*([\d.,]+)/i) || [])[1]);
  const protein = parseFatSecretNumber((desc.match(/Protein:\s*([\d.,]+)/i) || [])[1]);
  return { perLabel, calories, fat, carbs, protein, perAmount, perUnit };
}

function normalizeFatSecretPer100({ calories, fat, carbs, protein, perAmount, perUnit, perLabel }) {
  if (!perAmount || !perUnit || !['g', 'ml'].includes(perUnit)) {
    return { calories, fat, carbs, protein, perLabel: perLabel ? `Per ${perLabel}` : '' };
  }
  const factor = 100 / perAmount;
  const round = (val) => (val == null ? null : Math.round(val * factor * 10) / 10);
  const normalizedLabel = `Per 100${perUnit}`;
  return {
    calories: round(calories),
    fat: round(fat),
    carbs: round(carbs),
    protein: round(protein),
    perLabel: normalizedLabel
  };
}

function toArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function pickFatSecretServing(servings) {
  if (!servings.length) return null;
  const byId = servings.find((item) => String(item.serving_id) === '0');
  if (byId) return byId;
  const byExact100 = servings.find((item) => {
    const unit = String(item.metric_serving_unit || '').toLowerCase();
    const amt = parseFatSecretNumber(item.metric_serving_amount);
    return (unit === 'g' || unit === 'ml') && amt === 100;
  });
  if (byExact100) return byExact100;
  const byMetric = servings.find((item) => {
    const unit = String(item.metric_serving_unit || '').toLowerCase();
    const amt = parseFatSecretNumber(item.metric_serving_amount);
    return (unit === 'g' || unit === 'ml') && amt != null;
  });
  return byMetric || servings[0];
}

function normalizeFatSecretServing(serving) {
  if (!serving) return null;
  const unit = String(serving.metric_serving_unit || '').toLowerCase();
  const amt = parseFatSecretNumber(serving.metric_serving_amount);
  const calories = parseFatSecretNumber(serving.calories);
  const fat = parseFatSecretNumber(serving.fat);
  const carbs = parseFatSecretNumber(serving.carbohydrate);
  const protein = parseFatSecretNumber(serving.protein);
  if (amt && (unit === 'g' || unit === 'ml')) {
    const factor = 100 / amt;
    const round = (val) => (val == null ? null : Math.round(val * factor * 10) / 10);
    return {
      calories: round(calories),
      fat: round(fat),
      carbs: round(carbs),
      protein: round(protein),
      perLabel: `Per 100${unit}`
    };
  }
  const fallbackLabel = serving.serving_description ? `Per ${serving.serving_description}` : '';
  return { calories, fat, carbs, protein, perLabel: fallbackLabel };
}

function buildFatSecretTokenPayload(scope, includeCredentials) {
  const payload = new URLSearchParams({
    grant_type: 'client_credentials'
  });
  if (scope) payload.set('scope', scope);
  if (includeCredentials) {
    payload.set('client_id', FATSECRET_CLIENT_ID);
    payload.set('client_secret', FATSECRET_CLIENT_SECRET);
  }
  return payload.toString();
}

function parseFatSecretError(raw) {
  const text = String(raw || '').trim();
  if (!text) return '';
  try {
    const data = JSON.parse(text);
    const err = data.error || '';
    const desc = data.error_description || '';
    const combined = [err, desc].filter(Boolean).join(':');
    return combined || text.slice(0, 200);
  } catch (_) {
    return text.slice(0, 200);
  }
}

function requestFatSecretTokenOnce(scope, useBasicAuth, includeCredentialsInBody) {
  return new Promise((resolve, reject) => {
    if (!FATSECRET_CLIENT_ID || !FATSECRET_CLIENT_SECRET) {
      reject(new Error('fatsecret_credentials_missing'));
      return;
    }
    const payload = buildFatSecretTokenPayload(scope, includeCredentialsInBody);
    const url = new URL(FATSECRET_TOKEN_URL);
    const headers = {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Content-Length': Buffer.byteLength(payload)
    };
    if (useBasicAuth) {
      const auth = Buffer.from(`${FATSECRET_CLIENT_ID}:${FATSECRET_CLIENT_SECRET}`).toString('base64');
      headers['Authorization'] = `Basic ${auth}`;
    }
    const req = https.request(url, { method: 'POST', headers }, (res) => {
      let raw = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { raw += chunk; });
      res.on('end', () => {
        if (res.statusCode && res.statusCode >= 400) {
          const details = parseFatSecretError(raw);
          const suffix = details ? `:${details}` : '';
          reject(new Error(`fatsecret_token_${res.statusCode}${suffix}`));
          return;
        }
        try {
          const data = JSON.parse(raw || '{}');
          if (!data.access_token) {
            reject(new Error('fatsecret_token_missing'));
            return;
          }
          resolve(data);
        } catch (err) {
          reject(err);
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(15000, () => {
      req.destroy(new Error('timeout'));
    });
    req.write(payload);
    req.end();
  });
}

function normalizeScopeList(list) {
  const set = new Set();
  list.forEach((scope) => {
    const value = String(scope || '').trim();
    if (!value) return;
    set.add(value);
  });
  return Array.from(set);
}

function isCyrillic(text) {
  return /[А-Яа-яЁё]/.test(String(text || ''));
}

function isLatin(text) {
  return /[A-Za-z]/.test(String(text || ''));
}

function getCachedTranslation(key) {
  const cached = translationCache.get(key);
  if (!cached) return null;
  if (Date.now() - cached.at > TRANSLATION_CACHE_TTL_MS) {
    translationCache.delete(key);
    return null;
  }
  return cached.value;
}

function setCachedTranslation(key, value) {
  translationCache.set(key, { at: Date.now(), value });
  if (translationCache.size > 500) translationCache.clear();
}

function translateWithMyMemory(text, source, target) {
  return new Promise((resolve, reject) => {
    const url = new URL(MYMEMORY_TRANSLATE_URL);
    url.searchParams.set('q', text);
    url.searchParams.set('langpair', `${source}|${target}`);
    const req = https.get(url, (res) => {
      let raw = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { raw += chunk; });
      res.on('end', () => {
        try {
          const data = JSON.parse(raw || '{}');
          const translated = data && data.responseData && data.responseData.translatedText
            ? String(data.responseData.translatedText).trim()
            : '';
          if (!translated) {
            reject(new Error('translate_empty'));
            return;
          }
          resolve(translated);
        } catch (err) {
          reject(err);
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(10000, () => req.destroy(new Error('timeout')));
  });
}

function translateWithGoogle(text, source, target) {
  return new Promise((resolve, reject) => {
    const url = new URL(GOOGLE_TRANSLATE_URL);
    url.searchParams.set('client', 'gtx');
    url.searchParams.set('sl', source);
    url.searchParams.set('tl', target);
    url.searchParams.set('dt', 't');
    url.searchParams.set('q', text);
    const req = https.get(url, (res) => {
      let raw = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { raw += chunk; });
      res.on('end', () => {
        if (res.statusCode && res.statusCode >= 400) {
          reject(new Error(`google_${res.statusCode}`));
          return;
        }
        try {
          const data = JSON.parse(raw || '[]');
          const parts = Array.isArray(data) && Array.isArray(data[0]) ? data[0] : [];
          const translated = parts.map(part => Array.isArray(part) ? part[0] : '').join('').trim();
          if (!translated) {
            reject(new Error('translate_empty'));
            return;
          }
          resolve(translated);
        } catch (err) {
          reject(err);
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(10000, () => req.destroy(new Error('timeout')));
  });
}

function translateWithLibre(text, source, target) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({
      q: text,
      source,
      target,
      format: 'text'
    });
    const url = new URL(LIBRE_TRANSLATE_URL);
    const headers = {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payload)
    };
    const req = https.request(url, { method: 'POST', headers }, (res) => {
      let raw = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { raw += chunk; });
      res.on('end', () => {
        if (res.statusCode && res.statusCode >= 400) {
          reject(new Error(`libre_${res.statusCode}`));
          return;
        }
        try {
          const data = JSON.parse(raw || '{}');
          const translated = data && data.translatedText ? String(data.translatedText).trim() : '';
          if (!translated) {
            reject(new Error('translate_empty'));
            return;
          }
          resolve(translated);
        } catch (err) {
          reject(err);
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(10000, () => req.destroy(new Error('timeout')));
    req.write(payload);
    req.end();
  });
}

function translateWithDeepL(text, source, target) {
  return new Promise((resolve, reject) => {
    if (!DEEPL_API_KEY) {
      reject(new Error('deepl_key_missing'));
      return;
    }
    const payload = new URLSearchParams({
      text,
      source_lang: source.toUpperCase(),
      target_lang: target.toUpperCase()
    }).toString();
    const url = new URL(DEEPL_API_URL);
    const headers = {
      'Authorization': `DeepL-Auth-Key ${DEEPL_API_KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Content-Length': Buffer.byteLength(payload)
    };
    const req = https.request(url, { method: 'POST', headers }, (res) => {
      let raw = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { raw += chunk; });
      res.on('end', () => {
        if (res.statusCode && res.statusCode >= 400) {
          reject(new Error(`deepl_${res.statusCode}`));
          return;
        }
        try {
          const data = JSON.parse(raw || '{}');
          const translated = data && Array.isArray(data.translations) && data.translations[0]
            ? String(data.translations[0].text || '').trim()
            : '';
          if (!translated) {
            reject(new Error('translate_empty'));
            return;
          }
          resolve(translated);
        } catch (err) {
          reject(err);
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(10000, () => req.destroy(new Error('timeout')));
    req.write(payload);
    req.end();
  });
}

function shouldTranslate(text, source) {
  if (!text) return false;
  if (source === 'ru') return isCyrillic(text);
  if (source === 'en') return isLatin(text);
  return true;
}

async function translateText(text, source, target) {
  const sourceText = String(text || '').trim();
  if (!sourceText || source === target || !shouldTranslate(sourceText, source)) return sourceText;
  const cacheKey = `${source}|${target}|${sourceText.toLowerCase()}`;
  const cached = getCachedTranslation(cacheKey);
  if (cached) return cached;
  const provider = ['deepl', 'google', 'mymemory', 'libre'].includes(TRANSLATE_PROVIDER)
    ? TRANSLATE_PROVIDER
    : 'google';
  let translated = '';
  try {
    if (provider === 'deepl' && DEEPL_API_KEY) {
      translated = await translateWithDeepL(sourceText, source, target);
    } else if (provider === 'google') {
      translated = await translateWithGoogle(sourceText, source, target);
    } else if (provider === 'libre') {
      translated = await translateWithLibre(sourceText, source, target);
    } else {
      translated = await translateWithMyMemory(sourceText, source, target);
    }
  } catch (_) {
    if (provider === 'deepl') {
      try {
        translated = await translateWithMyMemory(sourceText, source, target);
      } catch (_) {
        translated = '';
      }
    } else {
      try {
        translated = await translateWithLibre(sourceText, source, target);
      } catch (_) {
        translated = '';
      }
      if (!translated) {
        try {
          translated = await translateWithMyMemory(sourceText, source, target);
        } catch (_) {
          translated = '';
        }
      }
    }
  }
  const finalText = translated || '';
  if (finalText && finalText.toLowerCase() !== sourceText.toLowerCase()) {
    setCachedTranslation(cacheKey, finalText);
    return finalText;
  }
  return sourceText;
}

async function translateRuToEn(text) {
  return translateText(text, 'ru', 'en');
}

async function translateEnToRu(text) {
  return translateText(text, 'en', 'ru');
}

async function translateFatSecretItems(items) {
  if (!Array.isArray(items) || !items.length) return items;
  const delimiter = '|||';
  await Promise.all(items.map(async (item) => {
    if (!item) return;
    const name = item.name || '';
    const brand = item.brand || '';
    const per = item.per || '';
    if (![name, brand, per].some(isLatin)) return;
    const combined = [name, brand, per].map(val => String(val).replace(/\|\|\|/g, '|')).join(delimiter);
    const translated = await translateEnToRu(combined);
    const parts = translated.split(delimiter).map(part => part.trim());
    if (parts.length >= 3) {
      if (parts[0]) item.name = parts[0];
      if (parts[1]) item.brand = parts[1];
      if (parts[2]) item.per = parts[2];
      return;
    }
    const nameRu = await translateEnToRu(name);
    const brandRu = await translateEnToRu(brand);
    const perRu = await translateEnToRu(per);
    if (nameRu) item.name = nameRu;
    if (brandRu) item.brand = brandRu;
    if (perRu) item.per = perRu;
  }));
  return items;
}

async function requestFatSecretToken() {
  const scopeCandidates = normalizeScopeList([
    FATSECRET_SCOPE,
    'premier',
    'basic'
  ]);
  scopeCandidates.push(''); // try without scope last

  const errors = [];
  for (const scope of scopeCandidates) {
    try {
      return await requestFatSecretTokenOnce(scope, true, false);
    } catch (err) {
      errors.push(err);
      if (!(err && err.message && err.message.startsWith('fatsecret_token_400'))) {
        throw err;
      }
    }
    try {
      return await requestFatSecretTokenOnce(scope, false, true);
    } catch (err) {
      errors.push(err);
      if (!(err && err.message && err.message.startsWith('fatsecret_token_400'))) {
        throw err;
      }
    }
  }
  if (errors.length) throw errors[errors.length - 1];
  throw new Error('fatsecret_token_400');
}

function getFatSecretToken() {
  const now = Date.now();
  if (fatSecretToken && now < fatSecretTokenExpiresAt - 60000) {
    return Promise.resolve(fatSecretToken);
  }
  if (fatSecretTokenPromise) return fatSecretTokenPromise;
  fatSecretTokenPromise = requestFatSecretToken()
    .then((data) => {
      fatSecretToken = data.access_token;
      const expiresIn = parseInt(data.expires_in || '3600', 10);
      fatSecretTokenExpiresAt = now + (Number.isFinite(expiresIn) ? expiresIn * 1000 : 3600 * 1000);
      return fatSecretToken;
    })
    .finally(() => {
      fatSecretTokenPromise = null;
    });
  return fatSecretTokenPromise;
}

function fetchFatSecretJson(url, token) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json'
      }
    }, (res) => {
      let raw = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { raw += chunk; });
      res.on('end', () => {
        if (res.statusCode && res.statusCode >= 400) {
          let details = '';
          try {
            const data = JSON.parse(raw || '{}');
            const err = data && data.error ? data.error : '';
            const desc = data && data.error_description ? data.error_description : '';
            details = [err, desc].filter(Boolean).join(':');
          } catch (_) {}
          const suffix = details ? `:${details}` : '';
          reject(new Error(`fatsecret_api_${res.statusCode}${suffix}`));
          return;
        }
        try {
          resolve(JSON.parse(raw || '{}'));
        } catch (err) {
          reject(err);
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(15000, () => {
      req.destroy(new Error('timeout'));
    });
  });
}

function parseCookies(cookieHeader = '') {
  const cookies = {};
  String(cookieHeader || '')
    .split(';')
    .map(part => part.trim())
    .filter(Boolean)
    .forEach((part) => {
      const idx = part.indexOf('=');
      if (idx === -1) return;
      const key = part.slice(0, idx).trim();
      const value = part.slice(idx + 1).trim();
      if (!key) return;
      cookies[key] = decodeURIComponent(value);
    });
  return cookies;
}

function isHttpsRequest(req) {
  const proto = String(req.headers['x-forwarded-proto'] || '').toLowerCase();
  if (proto.includes('https')) return true;
  return !!req.socket.encrypted;
}

function buildFatSecretCookies(token, expiresAt, req) {
  const now = Date.now();
  const maxAge = Math.max(60, Math.floor((expiresAt - now) / 1000));
  const sameSite = isHttpsRequest(req) ? 'None' : 'Lax';
  const secure = isHttpsRequest(req) ? '; Secure' : '';
  const base = `; Max-Age=${maxAge}; Path=/; SameSite=${sameSite}${secure}`;
  return [
    `fatsecret_token=${encodeURIComponent(token)}${base}; HttpOnly`,
    `fatsecret_token_exp=${expiresAt}${base}`
  ];
}

function readFatSecretCookie(req) {
  const cookies = parseCookies(req.headers.cookie || '');
  const token = String(cookies.fatsecret_token || '').trim();
  const expRaw = parseInt(cookies.fatsecret_token_exp || '0', 10);
  const exp = Number.isFinite(expRaw) ? expRaw : 0;
  const expired = exp > 0 && exp <= Date.now() + 60000;
  return { token, exp, expired };
}

function extractFatSecretTokenFromRequest(req) {
  const direct = String(req.headers['x-fatsecret-token'] || req.headers['x-fatsecret-access-token'] || '').trim();
  if (direct) return direct;
  const auth = String(req.headers['authorization'] || '').trim();
  const match = auth.match(/Bearer\s+(.+)/i);
  return match ? match[1].trim() : '';
}

async function fetchFatSecretSearch(query, limit, page, token) {
  const url = new URL(FATSECRET_SEARCH_URL);
  url.searchParams.set('search_expression', query);
  url.searchParams.set('page_number', String(Math.max(page - 1, 0)));
  url.searchParams.set('max_results', String(limit));
  url.searchParams.set('format', 'json');
  if (FATSECRET_GENERIC_DESCRIPTION) url.searchParams.set('generic_description', FATSECRET_GENERIC_DESCRIPTION);
  if (FATSECRET_REGION) url.searchParams.set('region', FATSECRET_REGION);
  if (FATSECRET_LANGUAGE) url.searchParams.set('language', FATSECRET_LANGUAGE);
  return fetchFatSecretJson(url, token);
}

async function fetchFatSecretFood(foodId, token) {
  const url = new URL(FATSECRET_FOOD_URL);
  url.searchParams.set('food_id', String(foodId));
  url.searchParams.set('format', 'json');
  if (FATSECRET_REGION) url.searchParams.set('region', FATSECRET_REGION);
  if (FATSECRET_LANGUAGE) url.searchParams.set('language', FATSECRET_LANGUAGE);
  return fetchFatSecretJson(url, token);
}

function normalizeFatSecretFoodList(data) {
  const foods = data && data.foods ? data.foods : {};
  const rawList = foods.food ? toArray(foods.food) : [];
  const items = rawList.map((item) => {
    const desc = item.food_description || '';
    const parsed = parseFatSecretDescription(desc);
    const normalized = normalizeFatSecretPer100(parsed);
    return {
      id: item.food_id ? String(item.food_id) : '',
      name: item.food_name || '',
      brand: item.brand_name || '',
      type: item.food_type || '',
      description: desc,
      per: normalized.perLabel,
      kcal: normalized.calories,
      fat: normalized.fat,
      carbs: normalized.carbs,
      protein: normalized.protein
    };
  });
  const maxResults = parseInt(foods.max_results || '0', 10);
  const totalResults = parseInt(foods.total_results || '0', 10);
  const pageNumber = parseInt(foods.page_number || '0', 10);
  return {
    items,
    pageNumber: Number.isFinite(pageNumber) ? pageNumber : 0,
    pageSize: Number.isFinite(maxResults) && maxResults > 0 ? maxResults : items.length,
    totalResults: Number.isFinite(totalResults) ? totalResults : null
  };
}

async function handleFatSecretSearch(urlObj, req, res, corsHeaders) {
  if (req.method !== 'GET') {
    res.writeHead(405, corsHeaders);
    res.end('method_not_allowed');
    return;
  }
  const manualToken = extractFatSecretTokenFromRequest(req);
  const cookieToken = readFatSecretCookie(req);
  const rawQuery = (urlObj.searchParams.get('q') || '').trim();
  if (rawQuery.length < 2) {
    res.writeHead(400, { ...corsHeaders, 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: 'query_too_short' }));
    return;
  }
  const query = await translateRuToEn(rawQuery);
  if (!manualToken && (!FATSECRET_CLIENT_ID || !FATSECRET_CLIENT_SECRET) && !FATSECRET_ACCESS_TOKEN) {
    res.writeHead(500, { ...corsHeaders, 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: 'fatsecret_credentials_missing' }));
    return;
  }
  const limitRaw = parseInt(urlObj.searchParams.get('limit') || '20', 10);
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 50) : 20;
  const pageRaw = parseInt(urlObj.searchParams.get('page') || '1', 10);
  const page = Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 1;
  const cacheKey = `${query.toLowerCase()}|${limit}|${page}`;
  let token = manualToken || (cookieToken.token && !cookieToken.expired ? cookieToken.token : '');
  let setCookies = null;
  if (!token && !manualToken) {
    try {
      await getFatSecretToken();
      token = fatSecretToken;
      const expiresAt = fatSecretTokenExpiresAt || (Date.now() + 55 * 60 * 1000);
      setCookies = buildFatSecretCookies(token, expiresAt, req);
    } catch (err) {
      const errorCode = err && err.message && err.message.startsWith('fatsecret_')
        ? err.message
        : 'fatsecret_token_400';
      res.writeHead(502, { ...corsHeaders, 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: errorCode }));
      return;
    }
  }
  const cached = fatSecretSearchCache.get(cacheKey);
  if (cached && (Date.now() - cached.at) < FATSECRET_CACHE_TTL_MS) {
    const headers = { ...corsHeaders, 'Content-Type': 'application/json' };
    if (setCookies) headers['Set-Cookie'] = setCookies;
    res.writeHead(200, headers);
    res.end(JSON.stringify(cached.payload));
    return;
  }
  try {
    const data = await fetchFatSecretSearch(query, limit, page, token);
    const normalized = normalizeFatSecretFoodList(data);
    await translateFatSecretItems(normalized.items);
    const hasMore = normalized.totalResults != null
      ? ((normalized.pageNumber + 1) * normalized.pageSize < normalized.totalResults)
      : normalized.items.length >= normalized.pageSize;
    const payload = {
      ok: true,
      items: normalized.items,
      page,
      pageSize: normalized.pageSize,
      totalResults: normalized.totalResults,
      hasMore
    };
    fatSecretSearchCache.set(cacheKey, { at: Date.now(), payload });
    if (fatSecretSearchCache.size > 300) fatSecretSearchCache.clear();
    const headers = { ...corsHeaders, 'Content-Type': 'application/json' };
    if (setCookies) headers['Set-Cookie'] = setCookies;
    res.writeHead(200, headers);
    res.end(JSON.stringify(payload));
  } catch (err) {
    if (err && err.message === 'fatsecret_api_401' && !manualToken) {
      try {
        await getFatSecretToken();
        token = fatSecretToken;
        const expiresAt = fatSecretTokenExpiresAt || (Date.now() + 55 * 60 * 1000);
        setCookies = buildFatSecretCookies(token, expiresAt, req);
        const retryData = await fetchFatSecretSearch(query, limit, page, token);
        const normalized = normalizeFatSecretFoodList(retryData);
        await translateFatSecretItems(normalized.items);
        const hasMore = normalized.totalResults != null
          ? ((normalized.pageNumber + 1) * normalized.pageSize < normalized.totalResults)
          : normalized.items.length >= normalized.pageSize;
        const payload = {
          ok: true,
          items: normalized.items,
          page,
          pageSize: normalized.pageSize,
          totalResults: normalized.totalResults,
          hasMore
        };
        fatSecretSearchCache.set(cacheKey, { at: Date.now(), payload });
        if (fatSecretSearchCache.size > 300) fatSecretSearchCache.clear();
        const headers = { ...corsHeaders, 'Content-Type': 'application/json' };
        if (setCookies) headers['Set-Cookie'] = setCookies;
        res.writeHead(200, headers);
        res.end(JSON.stringify(payload));
        return;
      } catch (retryErr) {
        const errorCode = retryErr && retryErr.message && retryErr.message.startsWith('fatsecret_')
          ? retryErr.message
          : 'upstream_error';
        res.writeHead(502, { ...corsHeaders, 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: errorCode }));
        return;
      }
    }
    const errorCode = err && err.message && err.message.startsWith('fatsecret_')
      ? err.message
      : 'upstream_error';
    res.writeHead(502, { ...corsHeaders, 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: errorCode }));
  }
}

async function handleFatSecretFood(urlObj, req, res, corsHeaders) {
  if (req.method !== 'GET') {
    res.writeHead(405, corsHeaders);
    res.end('method_not_allowed');
    return;
  }
  const manualToken = extractFatSecretTokenFromRequest(req);
  const cookieToken = readFatSecretCookie(req);
  const id = (urlObj.searchParams.get('id') || '').trim();
  if (!id) {
    res.writeHead(400, { ...corsHeaders, 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: 'missing_id' }));
    return;
  }
  if (!manualToken && (!FATSECRET_CLIENT_ID || !FATSECRET_CLIENT_SECRET) && !FATSECRET_ACCESS_TOKEN) {
    res.writeHead(500, { ...corsHeaders, 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: 'fatsecret_credentials_missing' }));
    return;
  }
  const cacheKey = String(id);
  let token = manualToken || (cookieToken.token && !cookieToken.expired ? cookieToken.token : '');
  let setCookies = null;
  if (!token && !manualToken) {
    try {
      await getFatSecretToken();
      token = fatSecretToken;
      const expiresAt = fatSecretTokenExpiresAt || (Date.now() + 55 * 60 * 1000);
      setCookies = buildFatSecretCookies(token, expiresAt, req);
    } catch (err) {
      const errorCode = err && err.message && err.message.startsWith('fatsecret_')
        ? err.message
        : 'fatsecret_token_400';
      res.writeHead(502, { ...corsHeaders, 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: errorCode }));
      return;
    }
  }
  const cached = fatSecretFoodCache.get(cacheKey);
  if (cached && (Date.now() - cached.at) < FATSECRET_CACHE_TTL_MS) {
    const headers = { ...corsHeaders, 'Content-Type': 'application/json' };
    if (setCookies) headers['Set-Cookie'] = setCookies;
    res.writeHead(200, headers);
    res.end(JSON.stringify(cached.payload));
    return;
  }
  try {
    const data = await fetchFatSecretFood(id, token);
    const food = data && data.food ? data.food : null;
    const servings = food && food.servings ? toArray(food.servings.serving) : [];
    const picked = pickFatSecretServing(servings);
    const normalized = normalizeFatSecretServing(picked);
    const payload = {
      ok: true,
      id,
      name: food && food.food_name ? food.food_name : '',
      brand: food && food.brand_name ? food.brand_name : '',
      per: normalized ? normalized.perLabel : '',
      kcal: normalized ? normalized.calories : null,
      fat: normalized ? normalized.fat : null,
      carbs: normalized ? normalized.carbs : null,
      protein: normalized ? normalized.protein : null
    };
    payload.name = await translateEnToRu(payload.name);
    payload.brand = await translateEnToRu(payload.brand);
    payload.per = await translateEnToRu(payload.per);
    fatSecretFoodCache.set(cacheKey, { at: Date.now(), payload });
    if (fatSecretFoodCache.size > 300) fatSecretFoodCache.clear();
    const headers = { ...corsHeaders, 'Content-Type': 'application/json' };
    if (setCookies) headers['Set-Cookie'] = setCookies;
    res.writeHead(200, headers);
    res.end(JSON.stringify(payload));
  } catch (err) {
    if (err && err.message === 'fatsecret_api_401' && !manualToken) {
      try {
        await getFatSecretToken();
        token = fatSecretToken;
        const expiresAt = fatSecretTokenExpiresAt || (Date.now() + 55 * 60 * 1000);
        setCookies = buildFatSecretCookies(token, expiresAt, req);
        const data = await fetchFatSecretFood(id, token);
        const food = data && data.food ? data.food : null;
        const servings = food && food.servings ? toArray(food.servings.serving) : [];
        const picked = pickFatSecretServing(servings);
        const normalized = normalizeFatSecretServing(picked);
        const payload = {
          ok: true,
          id,
          name: food && food.food_name ? food.food_name : '',
          brand: food && food.brand_name ? food.brand_name : '',
          per: normalized ? normalized.perLabel : '',
          kcal: normalized ? normalized.calories : null,
          fat: normalized ? normalized.fat : null,
          carbs: normalized ? normalized.carbs : null,
          protein: normalized ? normalized.protein : null
        };
        payload.name = await translateEnToRu(payload.name);
        payload.brand = await translateEnToRu(payload.brand);
        payload.per = await translateEnToRu(payload.per);
        fatSecretFoodCache.set(cacheKey, { at: Date.now(), payload });
        if (fatSecretFoodCache.size > 300) fatSecretFoodCache.clear();
        const headers = { ...corsHeaders, 'Content-Type': 'application/json' };
        if (setCookies) headers['Set-Cookie'] = setCookies;
        res.writeHead(200, headers);
        res.end(JSON.stringify(payload));
        return;
      } catch (retryErr) {
        const errorCode = retryErr && retryErr.message && retryErr.message.startsWith('fatsecret_')
          ? retryErr.message
          : 'upstream_error';
        res.writeHead(502, { ...corsHeaders, 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: errorCode }));
        return;
      }
    }
    const errorCode = err && err.message && err.message.startsWith('fatsecret_')
      ? err.message
      : 'upstream_error';
    res.writeHead(502, { ...corsHeaders, 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: errorCode }));
  }
}

function normalizeSearchText(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizeLocalSearchText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/\s+/g, ' ')
    .trim();
}

function detectCsvDelimiter(line) {
  const candidates = [',', ';', '\t', '|'];
  let best = ',';
  let bestCount = -1;
  candidates.forEach((delim) => {
    const count = line.split(delim).length - 1;
    if (count > bestCount) {
      bestCount = count;
      best = delim;
    }
  });
  return best;
}

function parseCsvLine(line, delimiter) {
  const out = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (char === delimiter && !inQuotes) {
      out.push(current);
      current = '';
      continue;
    }
    current += char;
  }
  out.push(current);
  return out.map((cell) => cell.trim());
}

function normalizeCsvHeader(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/["']/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function getHeaderMap(headers) {
  const map = {};
  headers.forEach((header, index) => {
    const key = normalizeCsvHeader(header);
    if (!key) return;
    map[key] = index;
  });
  return map;
}

function pickHeaderIndex(map, keys) {
  for (const key of keys) {
    if (map[key] != null) return map[key];
  }
  return null;
}

function parseCsvNumber(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  const normalized = raw.replace(',', '.');
  const num = parseFloat(normalized);
  return Number.isFinite(num) ? num : null;
}

function buildLocalFoodItem(row, headerMap, sourceId, storeName) {
  const nameIndex = pickHeaderIndex(headerMap, ['название', 'наименование', 'продукт', 'product', 'name']);
  if (nameIndex == null) return null;
  const name = (row[nameIndex] || '').trim();
  if (!name) return null;
  const brandIndex = pickHeaderIndex(headerMap, ['бренд', 'brand']);
  const portionIndex = pickHeaderIndex(headerMap, ['порция', 'portion', 'serving']);
  const caloriesIndex = pickHeaderIndex(headerMap, ['калории', 'ккал', 'energy', 'calories']);
  const proteinIndex = pickHeaderIndex(headerMap, ['белки', 'protein', 'proteins']);
  const fatIndex = pickHeaderIndex(headerMap, ['жиры', 'fat']);
  const carbsIndex = pickHeaderIndex(headerMap, ['углеводы', 'carbs', 'carbohydrates']);

  const brand = brandIndex != null ? (row[brandIndex] || '').trim() : '';
  const portion = portionIndex != null ? (row[portionIndex] || '').trim() : '';
  const calories = caloriesIndex != null ? parseCsvNumber(row[caloriesIndex]) : null;
  const protein = proteinIndex != null ? parseCsvNumber(row[proteinIndex]) : null;
  const fat = fatIndex != null ? parseCsvNumber(row[fatIndex]) : null;
  const carbs = carbsIndex != null ? parseCsvNumber(row[carbsIndex]) : null;

  const code = `${sourceId}:${name}:${brand}:${portion}`.toLowerCase();
  return {
    code,
    name,
    brand,
    quantity: portion,
    store: storeName || '',
    store_id: sourceId || '',
    kcal_100g: calories,
    proteins_100g: protein,
    fat_100g: fat,
    carbs_100g: carbs
  };
}

function listLocalFoodFiles() {
  if (!fs.existsSync(LOCAL_FOODS_DIR)) return [];
  return fs.readdirSync(LOCAL_FOODS_DIR)
    .filter((file) => file.toLowerCase().endsWith('.csv'))
    .map((file) => path.join(LOCAL_FOODS_DIR, file));
}

function loadLocalFoods(force = false) {
  const now = Date.now();
  if (!force && localFoodsCache.items.length && (now - localFoodsCache.loadedAt) < LOCAL_FOODS_CACHE_TTL_MS) {
    return localFoodsCache;
  }
  const files = listLocalFoodFiles();
  const items = [];
  const search = [];
  files.forEach((filePath) => {
    const raw = fs.readFileSync(filePath, 'utf8');
    const lines = raw.split(/\r?\n/).filter((line) => line.trim().length);
    if (!lines.length) return;
    const delimiter = detectCsvDelimiter(lines[0]);
    const headers = parseCsvLine(lines[0], delimiter);
    const headerMap = getHeaderMap(headers);
    const sourceId = path.basename(filePath, path.extname(filePath));
    const storeName = LOCAL_STORE_MAP[sourceId] || sourceId;
    for (let i = 1; i < lines.length; i += 1) {
      const row = parseCsvLine(lines[i], delimiter);
      if (!row.length) continue;
      const item = buildLocalFoodItem(row, headerMap, sourceId, storeName);
      if (!item) continue;
      items.push(item);
      const searchText = normalizeLocalSearchText([item.name, item.brand, item.quantity].filter(Boolean).join(' '));
      search.push(searchText);
    }
  });
  localFoodsCache = {
    items,
    search,
    loadedAt: now,
    files
  };
  return localFoodsCache;
}

function searchLocalFoods(query, limit, page, forceReload = false, storeFilter = null) {
  const data = loadLocalFoods(forceReload);
  const normalized = normalizeLocalSearchText(query);
  const tokens = normalized.split(' ').filter(Boolean);
  if (!tokens.length) return { items: [], total: 0 };
  const matches = [];
  for (let i = 0; i < data.items.length; i += 1) {
    const hay = data.search[i];
    if (!hay) continue;
    if (storeFilter && storeFilter.size) {
      const storeId = data.items[i].store_id || '';
      if (!storeFilter.has(storeId)) continue;
    }
    let ok = true;
    for (const token of tokens) {
      if (!hay.includes(token)) {
        ok = false;
        break;
      }
    }
    if (ok) matches.push(data.items[i]);
  }
  const start = (Math.max(page, 1) - 1) * limit;
  const items = matches.slice(start, start + limit);
  return { items, total: matches.length };
}

function buildFallbackSearchQuery(query) {
  const tokens = normalizeSearchText(query).split(/\s+/).filter(Boolean);
  if (!tokens.length) return '';
  const fallbackTokens = tokens.map((token) => (token.length > 4 ? token.slice(0, 4) : token));
  return fallbackTokens.join(' ').trim();
}

function filterItemsByQuery(items, query) {
  const q = normalizeSearchText(query);
  if (!q) return items;
  return items.filter((item) => {
    if (!item) return false;
    const haystack = [
      item.name || '',
      item.brand || '',
      item.quantity || ''
    ].map((val) => String(val).toLowerCase()).join(' ');
    return haystack.includes(q);
  });
}

function normalizeOpenFoodFactsProduct(product) {
  if (!product || typeof product !== 'object') return null;
  const code = product.code != null ? String(product.code).trim() : '';
  const name = String(product.product_name_ru || product.product_name || product.generic_name || '').trim();
  if (!name) return null;
  const nutriments = product.nutriments || {};
  let kcal = parseNutrientNumber(nutriments['energy-kcal_100g']);
  if (kcal == null) kcal = parseNutrientNumber(nutriments['energy-kcal']);
  if (kcal == null) {
    const energyKj = parseNutrientNumber(nutriments['energy_100g']);
    if (energyKj != null) kcal = Math.round((energyKj / 4.184) * 10) / 10;
  }
  return {
    code,
    name,
    brand: product.brands ? String(product.brands).trim() : '',
    quantity: product.quantity ? String(product.quantity).trim() : '',
    kcal_100g: kcal,
    proteins_100g: parseNutrientNumber(nutriments['proteins_100g']),
    fat_100g: parseNutrientNumber(nutriments['fat_100g']),
    carbs_100g: parseNutrientNumber(nutriments['carbohydrates_100g'])
  };
}

function fetchOpenFoodFactsSearch(query, limit, page = 1) {
  return new Promise((resolve, reject) => {
    const url = new URL(OPENFOODFACTS_BASE_URL);
    url.searchParams.set('search_terms', query);
    url.searchParams.set('search_simple', '1');
    url.searchParams.set('action', 'process');
    url.searchParams.set('json', '1');
    url.searchParams.set('page_size', String(limit));
    url.searchParams.set('page', String(page));
    url.searchParams.set('sort_by', OPENFOODFACTS_SORT_BY);
    url.searchParams.set('fields', 'code,product_name,product_name_ru,generic_name,brands,quantity,nutriments');

    const upstream = https.get(url, { headers: { 'User-Agent': 'kinosreda-snacks/1.0' } }, (upres) => {
      if (!upres.statusCode || upres.statusCode >= 400) {
        upres.resume();
        reject(new Error('upstream_error'));
        return;
      }
      let raw = '';
      upres.setEncoding('utf8');
      upres.on('data', (chunk) => { raw += chunk; });
      upres.on('end', () => {
        try {
          const data = JSON.parse(raw || '{}');
          const products = Array.isArray(data.products) ? data.products : [];
          const items = products
            .map(normalizeOpenFoodFactsProduct)
            .filter(Boolean);
          const rawPage = parseInt(data.page || page, 10);
          const rawPageCount = parseInt(data.page_count || '0', 10);
          const rawCount = parseInt(data.count || '0', 10);
          resolve({
            items,
            page: Number.isFinite(rawPage) ? rawPage : page,
            pageCount: Number.isFinite(rawPageCount) && rawPageCount > 0 ? rawPageCount : null,
            total: Number.isFinite(rawCount) && rawCount > 0 ? rawCount : null
          });
        } catch (err) {
          reject(err);
        }
      });
    });

    upstream.on('error', reject);
    upstream.setTimeout(15000, () => {
      upstream.destroy(new Error('timeout'));
    });
  });
}

async function fetchFilteredSearchPage(query, limit, page) {
  const prefix = buildFallbackSearchQuery(query);
  if (!prefix) return { items: [], hasMore: false };
  const key = normalizeSearchText(query);
  const now = Date.now();
  let entry = openFoodFactsFilteredCache.get(key);
  const pageSize = Math.min(Math.max(limit * 4, 20), 80);

  if (!entry || (now - entry.at) > OPENFOODFACTS_CACHE_TTL_MS || entry.prefix !== prefix || entry.pageSize !== pageSize) {
    entry = {
      prefix,
      pageSize,
      items: [],
      scannedPage: 0,
      pageCount: null,
      at: now
    };
    openFoodFactsFilteredCache.set(key, entry);
  } else {
    entry.at = now;
  }

  const targetEnd = Math.max(1, page) * limit;
  while (entry.items.length < targetEnd) {
    if (entry.pageCount !== null && entry.scannedPage >= entry.pageCount) break;
    const nextPage = entry.scannedPage + 1;
    const res = await fetchOpenFoodFactsSearch(prefix, entry.pageSize, nextPage);
    entry.scannedPage = res.page || nextPage;
    if (res.pageCount !== null) entry.pageCount = res.pageCount;
    if (!res.items.length && (entry.pageCount === null || entry.scannedPage >= entry.pageCount)) break;
    const filtered = filterItemsByQuery(res.items, query);
    entry.items.push(...filtered);
  }

  if (openFoodFactsFilteredCache.size > 200) openFoodFactsFilteredCache.clear();

  const start = (Math.max(1, page) - 1) * limit;
  const items = entry.items.slice(start, start + limit);
  const hasMore = entry.items.length > start + limit
    || (entry.pageCount !== null && entry.scannedPage < entry.pageCount);
  return { items, hasMore };
}

function handleOpenFoodFactsSearch(urlObj, req, res, corsHeaders) {
  if (req.method !== 'GET') {
    res.writeHead(405, corsHeaders);
    res.end('method_not_allowed');
    return;
  }
  const query = (urlObj.searchParams.get('q') || '').trim();
  if (query.length < 2) {
    res.writeHead(400, { ...corsHeaders, 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: 'query_too_short' }));
    return;
  }
  const limitRaw = parseInt(urlObj.searchParams.get('limit') || '8', 10);
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 40) : 8;
  const pageRaw = parseInt(urlObj.searchParams.get('page') || '1', 10);
  const page = Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 1;
  const cacheKey = `${query.toLowerCase()}|${limit}|${page}`;
  const cached = openFoodFactsCache.get(cacheKey);
  if (cached && (Date.now() - cached.at) < OPENFOODFACTS_CACHE_TTL_MS) {
    res.writeHead(200, { ...corsHeaders, 'Content-Type': 'application/json' });
    res.end(JSON.stringify(cached.payload));
    return;
  }
  fetchOpenFoodFactsSearch(query, limit, page)
    .then((result) => {
      if (result.items.length || query.length < 4) {
        const effectivePageCount = result.pageCount || (result.total ? Math.ceil(result.total / limit) : null);
        return {
          items: result.items,
          hasMore: effectivePageCount ? page < effectivePageCount : result.items.length === limit
        };
      }
      const fallbackQuery = buildFallbackSearchQuery(query);
      if (!fallbackQuery || fallbackQuery === normalizeSearchText(query)) {
        return { items: result.items, hasMore: false };
      }
      return fetchFilteredSearchPage(query, limit, page);
    })
    .then((payloadData) => {
      const payload = {
        ok: true,
        items: payloadData.items,
        page,
        pageSize: limit,
        hasMore: !!payloadData.hasMore
      };
      openFoodFactsCache.set(cacheKey, { at: Date.now(), payload });
      if (openFoodFactsCache.size > 300) openFoodFactsCache.clear();
      res.writeHead(200, { ...corsHeaders, 'Content-Type': 'application/json' });
      res.end(JSON.stringify(payload));
    })
    .catch(() => {
      res.writeHead(502, { ...corsHeaders, 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: 'upstream_error' }));
    });
}

function handleLocalFoodsSearch(urlObj, req, res, corsHeaders) {
  if (req.method !== 'GET') {
    res.writeHead(405, corsHeaders);
    res.end('method_not_allowed');
    return;
  }
  const query = (urlObj.searchParams.get('q') || '').trim();
  if (query.length < 2) {
    res.writeHead(400, { ...corsHeaders, 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: 'query_too_short' }));
    return;
  }
  const limitRaw = parseInt(urlObj.searchParams.get('limit') || '20', 10);
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 50) : 20;
  const pageRaw = parseInt(urlObj.searchParams.get('page') || '1', 10);
  const page = Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 1;
  const storeParam = (urlObj.searchParams.get('stores') || urlObj.searchParams.get('store') || '').trim();
  const storeFilter = storeParam
    ? new Set(storeParam.split(/[,|]/).map((item) => item.trim().toLowerCase()).filter(Boolean))
    : null;
  const forceReload = urlObj.searchParams.get('reload') === '1';
  try {
    const result = searchLocalFoods(query, limit, page, forceReload, storeFilter);
    const start = (page - 1) * limit;
    const hasMore = result.total > start + limit;
    const payload = {
      ok: true,
      items: result.items,
      page,
      pageSize: limit,
      total: result.total,
      hasMore
    };
    res.writeHead(200, { ...corsHeaders, 'Content-Type': 'application/json' });
    res.end(JSON.stringify(payload));
  } catch (err) {
    res.writeHead(502, { ...corsHeaders, 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: 'localfoods_error' }));
  }
}

function serializeWallDraw() {
  return {
    strokes: Object.fromEntries(Array.from(state.wallDraw.strokes.entries())),
    texts: Object.fromEntries(Array.from(state.wallDraw.texts.entries()).map(([wallId, map]) => [
      wallId,
      Array.from(map.values())
    ]))
  };
}

function serializeChatRooms() {
  const rooms = {};
  state.chatRooms.forEach((sessionsMap, roomName) => {
    const sessions = [];
    sessionsMap.forEach((session) => {
      sessions.push({
        id: session.id,
        title: session.title,
        updatedAt: session.updatedAt,
        messages: Array.isArray(session.messages) ? session.messages : []
      });
    });
    rooms[roomName] = { sessions };
  });
  return rooms;
}

function persistState() {
  try {
    const payload = JSON.stringify({
      wallDraw: serializeWallDraw(),
      light: state.light,
      chatRooms: serializeChatRooms()
    });
    fs.writeFileSync(STATE_FILE, payload);
  } catch (_) {}
}

function loadPersistedWallDraw() {
  try {
    if (!fs.existsSync(STATE_FILE)) return;
    const raw = fs.readFileSync(STATE_FILE, 'utf8');
    const data = JSON.parse(raw);
    const wallDraw = data && data.wallDraw;
    if (!wallDraw) return;
    const strokes = wallDraw.strokes || {};
    const texts = wallDraw.texts || {};
    state.wallDraw.strokes = new Map(Object.entries(strokes).map(([wallId, list]) => [
      wallId,
      Array.isArray(list) ? list : []
    ]));
    state.wallDraw.texts = new Map(Object.entries(texts).map(([wallId, list]) => {
      const map = new Map();
      if (Array.isArray(list)) {
        list.forEach((item) => {
          if (!item || !item.id) return;
          map.set(String(item.id), item);
        });
      }
      return [wallId, map];
    }));
    if (data && data.light && typeof data.light === 'object') {
      state.light = {
        color: typeof data.light.color === 'string' ? data.light.color : '#f5c15c',
        intensity: Number.isFinite(data.light.intensity) ? Number(data.light.intensity) : 3.2,
        spread: Number.isFinite(data.light.spread) ? Number(data.light.spread) : 0.85,
        off: !!data.light.off,
        updatedAt: Number.isFinite(data.light.updatedAt) ? Number(data.light.updatedAt) : Date.now()
      };
    }
    const chatRooms = data && data.chatRooms && typeof data.chatRooms === 'object' ? data.chatRooms : null;
    if (chatRooms) {
      Object.keys(chatRooms).forEach((roomName) => {
        const payload = chatRooms[roomName];
        const sessions = payload && Array.isArray(payload.sessions) ? payload.sessions : [];
        const roomMap = getChatRoom(roomName);
        sessions.forEach((session) => {
          if (!session || !session.id) return;
          const messages = Array.isArray(session.messages) ? session.messages : [];
          const messageIds = new Set(messages.map(m => m && m.id).filter(Boolean));
          roomMap.set(String(session.id), {
            id: String(session.id),
            title: String(session.title || 'Новый чат').slice(0, 120),
            updatedAt: Number(session.updatedAt) || Date.now(),
            messages,
            messageIds
          });
        });
      });
    }
  } catch (_) {}
}

loadPersistedWallDraw();

function pruneUsers() {
  const now = Date.now();
  for (const [id, user] of state.users) {
    if (!user.lastSeen || (now - user.lastSeen) > STATE_TTL_SECONDS * 1000) {
      state.users.delete(id);
    }
  }
}

let toiletProtocol;
const toiletProtocolReady=import('./beer-room-toilet-state.mjs').then(api=>{toiletProtocol=api;});
let supPhysics;
const supPhysicsReady=import('./beer-room-sup-physics.mjs').then(api=>{supPhysics=api;});

function getBeerRoom(roomName = 'kinosreda-beer-room') {
  const key = String(roomName || 'kinosreda-beer-room').slice(0, 120);
  if (!state.beerRooms.has(key)) state.beerRooms.set(key, { users: new Map(), items: new Map(), openSpace:false, boards:null });
  const room=state.beerRooms.get(key);if(!room.boards&&supPhysics)room.boards=supPhysics.createSupStates().map(b=>({...b,...worldLayout?.entries['sup:'+b.id],id:b.id}));if(!room.toilet&&toiletProtocol)room.toilet=toiletProtocol.createToiletState();return room;
}

function pruneBeerRoom(roomName) {
  const room = getBeerRoom(roomName);
  const now = Date.now();
  for (const [id, user] of room.users) {
    if (!user?.lastSeen || now - user.lastSeen > STATE_TTL_SECONDS * 1000) room.users.delete(id);
  }
  return room;
}

function serializeBeerUser(user) {
  if (!user) return null;
  const out = { ...user };
  delete out.lastSeen;
  return out;
}

function getVideoState() {
  const now = Date.now();
  let time = state.video.time || 0;
  if (state.video.playing) {
    time += (now - state.video.updatedAt) / 1000;
  }
  return {
    url: state.video.url || '',
    time,
    playing: !!state.video.playing,
    open: !!state.video.open
  };
}

function getChatRoom(roomName) {
  const key = String(roomName || 'ai-chat');
  if (!state.chatRooms.has(key)) {
    state.chatRooms.set(key, new Map());
  }
  return state.chatRooms.get(key);
}

function getChatState(roomName) {
  const sessions = [];
  const messages = {};
  const room = getChatRoom(roomName);
  room.forEach((session) => {
    sessions.push({ id: session.id, title: session.title, updatedAt: session.updatedAt });
    messages[session.id] = Array.isArray(session.messages) ? session.messages : [];
  });
  return { sessions, messages };
}

function pruneChatSessions(roomName) {
  const room = getChatRoom(roomName);
  if (room.size <= MAX_CHAT_SESSIONS) return;
  const items = Array.from(room.values()).sort((a, b) => (a.updatedAt || 0) - (b.updatedAt || 0));
  const toRemove = items.slice(0, room.size - MAX_CHAT_SESSIONS);
  toRemove.forEach((session) => room.delete(session.id));
}

function upsertChatSession(roomName, session) {
  if (!session || !session.id) return null;
  const id = String(session.id);
  const room = getChatRoom(roomName);
  const existing = room.get(id);
  const merged = {
    id,
    title: String(session.title || existing?.title || 'Новый чат').slice(0, 120),
    updatedAt: Number(session.updatedAt) || Date.now(),
    messages: existing?.messages || [],
    messageIds: existing?.messageIds || new Set()
  };
  room.set(id, merged);
  pruneChatSessions(roomName);
  return merged;
}

function addChatMessage(roomName, chatId, message) {
  if (!chatId || !message || !message.id) return null;
  const room = getChatRoom(roomName);
  const session = room.get(String(chatId)) || upsertChatSession(roomName, { id: chatId });
  if (!session) return null;
  if (!session.messageIds) session.messageIds = new Set();
  if (session.messageIds.has(message.id)) return null;
  session.messageIds.add(message.id);
  const payload = {
    id: String(message.id),
    role: message.role === 'assistant' ? 'assistant' : 'user',
    content: String(message.content || ''),
    ts: Number(message.ts) || Date.now(),
    modelLabel: message.modelLabel ? String(message.modelLabel).slice(0, 120) : '',
    modelId: message.modelId ? String(message.modelId).slice(0, 120) : ''
  };
  session.messages = Array.isArray(session.messages) ? session.messages : [];
  session.messages.push(payload);
  session.messages.sort((a, b) => (a.ts || 0) - (b.ts || 0));
  if (session.messages.length > MAX_CHAT_MESSAGES) {
    session.messages = session.messages.slice(-MAX_CHAT_MESSAGES);
    session.messageIds = new Set(session.messages.map(m => m.id));
  }
  session.updatedAt = Math.max(session.updatedAt || 0, payload.ts);
  if (!session.title || session.title === 'Новый чат') {
    if (payload.role === 'user' && payload.content) {
      session.title = payload.content.slice(0, 42);
    }
  }
  room.set(session.id, session);
  pruneChatSessions(roomName);
  return payload;
}

function normalizePlanningEventKey(rawValue = '') {
  return String(rawValue || '').trim().slice(0, 120);
}

function normalizePlanningName(rawValue = '') {
  const value = String(rawValue || '').trim();
  return (value || 'Гость').slice(0, 48);
}

function normalizePlanningColor(rawValue = '') {
  const value = String(rawValue || '').trim();
  if (!value) return '#f59e0b';
  if (/^#[0-9a-fA-F]{3,8}$/.test(value)) return value;
  if (/^hsl\(/.test(value) || /^rgb\(/.test(value)) return value.slice(0, 40);
  return '#f59e0b';
}

function sanitizePlanningCoord(rawValue = 0) {
  const value = Number(rawValue);
  if (!Number.isFinite(value)) return 0;
  if (value < -1) return -1;
  if (value > 1) return 1;
  return value;
}

function sanitizePlanningDocCoord(rawValue = 0) {
  const value = Number(rawValue);
  if (!Number.isFinite(value)) return 0;
  if (value < -1) return -1;
  if (value > 2000000) return 2000000;
  return value;
}

function sanitizePlanningTs(rawValue, now = Date.now()) {
  const value = Number(rawValue);
  if (!Number.isFinite(value)) return now;
  if (Math.abs(value - now) > 600000) return now;
  return value;
}

function sanitizePlanningAnchor(rawValue) {
  if (!rawValue || typeof rawValue !== 'object' || Array.isArray(rawValue)) return null;
  const out = {};
  const entries = Object.entries(rawValue).slice(0, 18);
  for (const [rawKey, rawVal] of entries) {
    const key = String(rawKey || '').trim().slice(0, 24);
    if (!key) continue;
    if (typeof rawVal === 'string') {
      out[key] = rawVal.slice(0, 280);
      continue;
    }
    if (typeof rawVal === 'number') {
      if (!Number.isFinite(rawVal)) continue;
      out[key] = rawVal;
      continue;
    }
    if (typeof rawVal === 'boolean') {
      out[key] = rawVal;
    }
  }
  return Object.keys(out).length ? out : null;
}

function sanitizePlanningRtcDescription(rawValue) {
  if (!rawValue || typeof rawValue !== 'object' || Array.isArray(rawValue)) return null;
  const type = String(rawValue.type || '').trim().toLowerCase();
  if (!type || !['offer', 'answer', 'pranswer', 'rollback'].includes(type)) return null;
  const out = { type };
  const sdp = typeof rawValue.sdp === 'string' ? rawValue.sdp.slice(0, 200000) : '';
  if (sdp) out.sdp = sdp;
  if ((type === 'offer' || type === 'answer' || type === 'pranswer') && !out.sdp) return null;
  return out;
}

function sanitizePlanningRtcCandidate(rawValue) {
  if (!rawValue || typeof rawValue !== 'object' || Array.isArray(rawValue)) return null;
  const candidate = String(rawValue.candidate || '').slice(0, 4096);
  if (!candidate) return null;
  const out = { candidate };
  if (typeof rawValue.sdpMid === 'string') {
    out.sdpMid = rawValue.sdpMid.slice(0, 64);
  }
  if (Number.isFinite(Number(rawValue.sdpMLineIndex))) {
    out.sdpMLineIndex = Math.max(0, Math.min(512, Number(rawValue.sdpMLineIndex)));
  }
  if (typeof rawValue.usernameFragment === 'string') {
    out.usernameFragment = rawValue.usernameFragment.slice(0, 256);
  }
  return out;
}

function sanitizePlanningVoiceSignalData(rawValue) {
  if (!rawValue || typeof rawValue !== 'object' || Array.isArray(rawValue)) return null;
  const description = sanitizePlanningRtcDescription(rawValue.description);
  const candidate = sanitizePlanningRtcCandidate(rawValue.candidate);
  if (!description && !candidate) return null;
  const out = {};
  if (description) out.description = description;
  if (candidate) out.candidate = candidate;
  return out;
}

function normalizePlanningPeerId(rawValue = '') {
  return String(rawValue || '').trim().slice(0, 120);
}

function getPlanningRoom(eventKey) {
  const key = normalizePlanningEventKey(eventKey);
  if (!key) return null;
  if (!state.planningRooms.has(key)) {
    state.planningRooms.set(key, {
      cursors: new Map(),
      actions: [],
      updatedAt: Date.now()
    });
  }
  return state.planningRooms.get(key);
}

function prunePlanningRoom(eventKey) {
  const room = getPlanningRoom(eventKey);
  if (!room) return;
  const now = Date.now();
  for (const [id, cursor] of room.cursors.entries()) {
    if (!cursor || !Number.isFinite(cursor.ts) || (now - cursor.ts) > PLANNING_CURSOR_TTL_MS) {
      room.cursors.delete(id);
    }
  }
  if (room.actions.length > PLANNING_ACTION_LIMIT) {
    room.actions = room.actions.slice(-PLANNING_ACTION_LIMIT);
  }
  room.updatedAt = now;
}

function prunePlanningRooms() {
  const now = Date.now();
  for (const [eventKey, room] of state.planningRooms.entries()) {
    const hasCursors = room && room.cursors && room.cursors.size > 0;
    const isStale = !room || !Number.isFinite(room.updatedAt) || (now - room.updatedAt) > PLANNING_ROOM_IDLE_MS;
    if (!hasCursors && isStale) {
      state.planningRooms.delete(eventKey);
    }
  }
}

function getPlanningSnapshot(eventKey) {
  const room = getPlanningRoom(eventKey);
  if (!room) return { cursors: [], actions: [] };
  prunePlanningRoom(eventKey);
  prunePlanningRooms();
  const cursors = Array.from(room.cursors.values());
  const actions = Array.isArray(room.actions) ? room.actions.slice(-40) : [];
  return { cursors, actions };
}

function applyPlanningMessage(eventKey, id, name, color, data) {
  if (!eventKey || !data || typeof data.type !== 'string') return null;
  const room = getPlanningRoom(eventKey);
  if (!room) return null;
  const now = Date.now();
  const userId = String(id || nodeCrypto.randomUUID());
  const userName = normalizePlanningName(data.name || name);
  const userColor = normalizePlanningColor(data.color || color);

  if (data.type === 'cursor') {
    const cursor = {
      id: userId,
      name: userName,
      color: userColor,
      x: sanitizePlanningCoord(data.x),
      y: sanitizePlanningCoord(data.y),
      docX: sanitizePlanningDocCoord(data.docX),
      docY: sanitizePlanningDocCoord(data.docY),
      anchor: sanitizePlanningAnchor(data.anchor),
      ts: sanitizePlanningTs(data.ts, now)
    };
    room.cursors.set(userId, cursor);
    room.updatedAt = now;
    prunePlanningRoom(eventKey);
    return { kind: 'cursor', cursor };
  }

  if (data.type === 'leave') {
    room.cursors.delete(userId);
    room.updatedAt = now;
    prunePlanningRoom(eventKey);
    return { kind: 'leave', id: userId };
  }

  if (data.type === 'action') {
    const text = String(data.text || '').trim().slice(0, 220);
    if (!text) return null;
    const entry = {
      id: userId,
      name: userName,
      color: userColor,
      text,
      ts: sanitizePlanningTs(data.ts, now)
    };
    room.actions.push(entry);
    room.updatedAt = now;
    prunePlanningRoom(eventKey);
    return { kind: 'action', entry };
  }

  if (data.type === 'click') {
    const click = {
      id: userId,
      name: userName,
      color: userColor,
      x: sanitizePlanningCoord(data.x),
      y: sanitizePlanningCoord(data.y),
      docX: sanitizePlanningDocCoord(data.docX),
      docY: sanitizePlanningDocCoord(data.docY),
      anchor: sanitizePlanningAnchor(data.anchor),
      ts: sanitizePlanningTs(data.ts, now)
    };
    room.updatedAt = now;
    prunePlanningRoom(eventKey);
    return { kind: 'click', click };
  }

  if (data.type === 'voice:signal') {
    const target = normalizePlanningPeerId(data.target);
    if (!target || target === userId) return null;
    const signalData = sanitizePlanningVoiceSignalData(data.data);
    if (!signalData) return null;
    room.updatedAt = now;
    prunePlanningRoom(eventKey);
    return {
      kind: 'voice:signal',
      signal: {
        type: 'voice:signal',
        target,
        from: userId,
        data: signalData
      }
    };
  }

  if (data.type === 'voice:talking') {
    room.updatedAt = now;
    prunePlanningRoom(eventKey);
    return {
      kind: 'voice:talking',
      talking: {
        type: 'voice:talking',
        id: userId,
        speaking: Boolean(data.speaking),
        ts: now
      }
    };
  }

  return null;
}

function getState(id, roomName) {
  pruneUsers();
  return {
    type: 'state',
    id,
    users: Array.from(state.users.values()).map(u => {
      const { lastSeen, ...rest } = u;
      return rest;
    }),
    ladders: Array.from(state.ladders.values()),
    boardScroll: state.boardScroll,
    beerAdd: state.beerAdd,
    video: getVideoState(),
    light: state.light,
    chat: getChatState(roomName),
    wallDraw: {
      strokes: Object.fromEntries(
        Array.from(state.wallDraw.strokes.entries()).map(([wallId, list]) => {
          const filtered = (list || []).filter(s => s.tool !== 'eraser');
          if (filtered.length !== (list || []).length) {
            state.wallDraw.strokes.set(wallId, filtered);
          }
          return [wallId, filtered];
        })
      ),
      texts: Object.fromEntries(
        Array.from(state.wallDraw.texts.entries()).map(([wallId, map]) => [
          wallId,
          Array.from(map.values())
        ])
      )
    }
  };
}

function applyMessage(id, name, data, roomName) {
  if (!data || typeof data.type !== 'string') return;

  if (data.type === 'presence') {
    const user = state.users.get(id) || { id, name, x: 0, y: 0, z: 0, yaw: 0 };
    user.name = String(data.name || user.name || name || 'Guest').slice(0, 48);
    user.x = Number(data.x) || 0;
    user.y = Number(data.y) || 0;
    user.z = Number(data.z) || 0;
    user.yaw = Number(data.yaw) || 0;
    if (data.avatar && typeof data.avatar === 'object') {
      user.avatar = data.avatar;
    }
    user.lastSeen = Date.now();
    state.users.set(id, user);
    return { kind: 'presence' };
  }

  if (data.type === 'ladder') {
    const ladderId = String(data.id || id);
    if (data.action === 'remove') {
      state.ladders.delete(ladderId);
      return;
    }
    const payload = {
      id: ladderId,
      action: 'add',
      position: data.position || { x: 0, y: 0, z: 0 },
      rotationY: Number.isFinite(data.rotationY) ? data.rotationY : 0,
      height: Number.isFinite(data.height) ? data.height : 0,
      width: Number.isFinite(data.width) ? data.width : 0,
      depth: Number.isFinite(data.depth) ? data.depth : 0,
      platformDepth: Number.isFinite(data.platformDepth) ? data.platformDepth : 0
    };
    state.ladders.set(ladderId, payload);
    return { kind: 'ladder' };
  }

  if (data.type === 'board_scroll') {
    state.boardScroll = { target: Number(data.target) || 0, updatedAt: Date.now() };
    return { kind: 'board_scroll' };
  }

  if (data.type === 'beer_add') {
    state.beerAdd = { open: !!data.open, data: data.data || null, updatedAt: Date.now() };
    return { kind: 'beer_add' };
  }

  if (data.type === 'chat:session') {
    if (data.session && data.session.id) {
      const session = upsertChatSession(roomName, data.session);
      persistState();
      return session ? { kind: 'chat:session', session } : null;
    }
    return;
  }

  if (data.type === 'chat:message') {
    if (data.chatId && data.message) {
      const message = addChatMessage(roomName, data.chatId, data.message);
      persistState();
      return message ? { kind: 'chat:message', chatId: String(data.chatId), message } : null;
    }
    return;
  }
  if (data.type === 'chat:delete') {
    if (data.chatId) {
      const id = String(data.chatId);
      const room = getChatRoom(roomName);
      if (room.has(id)) {
        room.delete(id);
        persistState();
        return { kind: 'chat:delete', chatId: id };
      }
    }
    return;
  }

  if (data.type.startsWith('video:')) {
    const now = Date.now();
    if (data.type === 'video:set') {
      state.video.url = String(data.url || '').slice(0, 2048);
      state.video.time = Number.isFinite(data.time) ? Number(data.time) : 0;
      state.video.playing = false;
      state.video.updatedAt = now;
    } else if (data.type === 'video:open') {
      state.video.open = true;
      state.video.updatedAt = now;
    } else if (data.type === 'video:close') {
      state.video.open = false;
      state.video.updatedAt = now;
    } else if (data.type === 'video:play') {
      state.video.playing = true;
      if (Number.isFinite(data.time)) state.video.time = Number(data.time);
      state.video.updatedAt = now;
    } else if (data.type === 'video:pause') {
      state.video.playing = false;
      if (Number.isFinite(data.time)) state.video.time = Number(data.time);
      state.video.updatedAt = now;
    } else if (data.type === 'video:seek') {
      if (Number.isFinite(data.time)) state.video.time = Number(data.time);
      state.video.updatedAt = now;
    }
    return { kind: 'video' };
  }
  if (data.type === 'light' && data.state && typeof data.state === 'object') {
    const next = data.state || {};
    state.light = {
      color: typeof next.color === 'string' ? next.color : state.light.color,
      intensity: Number.isFinite(next.intensity) ? Number(next.intensity) : state.light.intensity,
      spread: Number.isFinite(next.spread) ? Number(next.spread) : state.light.spread,
      off: !!next.off,
      updatedAt: Date.now()
    };
    persistState();
    return { kind: 'light' };
  }
  if (data.type === 'wall_draw') {
    const action = String(data.action || '');
    const wallId = String(data.wallId || '');
    if (action === 'stroke' && wallId) {
      if (data.tool === 'eraser') {
        const list = state.wallDraw.strokes.get(wallId) || [];
        const cleaned = list.filter(s => s.tool !== 'eraser');
        if (cleaned.length !== list.length) {
          state.wallDraw.strokes.set(wallId, cleaned);
        }
        persistState();
        return { kind: 'wall_draw' };
      }
      const list = (state.wallDraw.strokes.get(wallId) || []).filter(s => s.tool !== 'eraser');
      const strokeId = String(data.strokeId || `${Date.now()}-${Math.random()}`);
      const next = {
        id: strokeId,
        tool: data.tool === 'eraser' ? 'eraser' : 'pen',
        color: data.color || '#f59e0b',
        size: Number(data.size) || 8,
        x1: Number(data.x1) || 0,
        y1: Number(data.y1) || 0,
        x2: Number(data.x2) || 0,
        y2: Number(data.y2) || 0
      };
      const idx = list.findIndex(s => String(s.id) === strokeId);
      if (idx >= 0) {
        list[idx] = next;
      } else {
        list.push(next);
      }
      state.wallDraw.strokes.set(wallId, list);
      persistState();
      return { kind: 'wall_draw' };
    }
    if (action === 'text' && wallId) {
      const textId = String(data.textId || '');
      if (!textId) return { kind: 'wall_draw' };
      const texts = state.wallDraw.texts.get(wallId) || new Map();
      const textValue = String(data.text || '');
      if (!textValue.trim()) {
        texts.delete(textId);
      } else {
        texts.set(textId, {
          id: textId,
          x: Number(data.x) || 0,
          y: Number(data.y) || 0,
          text: textValue,
          size: Number(data.size) || 24,
          color: data.color || '#f59e0b'
        });
      }
      state.wallDraw.texts.set(wallId, texts);
      persistState();
      return { kind: 'wall_draw' };
    }
    if (action === 'delete' && wallId) {
      const itemType = String(data.itemType || '');
      const itemId = String(data.itemId || '');
      if (!itemId) return { kind: 'wall_draw' };
      if (itemType === 'stroke') {
        const list = state.wallDraw.strokes.get(wallId) || [];
        const next = list.filter(s => String(s.id) !== itemId);
        state.wallDraw.strokes.set(wallId, next);
        if (next.length === list.length) {
          for (const [key, strokes] of state.wallDraw.strokes.entries()) {
            const filtered = (strokes || []).filter(s => String(s.id) !== itemId);
            if (filtered.length !== (strokes || []).length) {
              state.wallDraw.strokes.set(key, filtered);
              break;
            }
          }
        }
      } else if (itemType === 'text') {
        const texts = state.wallDraw.texts.get(wallId) || new Map();
        texts.delete(itemId);
        state.wallDraw.texts.set(wallId, texts);
      }
      persistState();
      return { kind: 'wall_draw' };
    }
    if (action === 'delete' && !wallId) {
      const itemType = String(data.itemType || '');
      const itemId = String(data.itemId || '');
      if (!itemId) return { kind: 'wall_draw' };
      if (itemType === 'stroke') {
        for (const [key, strokes] of state.wallDraw.strokes.entries()) {
          const filtered = (strokes || []).filter(s => String(s.id) !== itemId);
          if (filtered.length !== (strokes || []).length) {
            state.wallDraw.strokes.set(key, filtered);
            break;
          }
        }
      } else if (itemType === 'text') {
        for (const [key, texts] of state.wallDraw.texts.entries()) {
          if (texts.delete(itemId)) {
            state.wallDraw.texts.set(key, texts);
            break;
          }
        }
      }
      persistWallDraw();
      return { kind: 'wall_draw' };
    }
    if (action === 'clear' && wallId) {
      state.wallDraw.strokes.delete(wallId);
      state.wallDraw.texts.delete(wallId);
      persistWallDraw();
      return { kind: 'wall_draw' };
    }
    if (action === 'clear_all') {
      state.wallDraw.strokes.clear();
      state.wallDraw.texts.clear();
      persistState();
      return { kind: 'wall_draw' };
    }
  }
  return { kind: 'raw' };
}

function applyBeerMessage(id, name, data, roomName) {
  if (!data || typeof data.type !== 'string') return null;
  const room = pruneBeerRoom(roomName);
  const user = room.users.get(id) || { id, name: name || 'Guest' };
  user.name = String(data.name || user.name || name || 'Guest').slice(0, 48);
  user.lastSeen = Date.now();
  if(data.type==='beer_world'&&typeof data.open==='boolean'){room.openSpace=data.open;if(!data.open){if(room.boards)for(const b of room.boards)supPhysics.releaseSup(room.boards,b.owner);if(room.toilet)toiletProtocol.releaseToilet(room.toilet,room.toilet.owner);}return{kind:'world',open:room.openSpace};}
  if(data.type==='toilet_use'){
    const reason=toiletProtocol.claimToilet(room.toilet,user,data.mode,room.openSpace,Date.now(),worldLayout?.entries['utility:toilet']);if(reason)return{kind:'toilet_denied',reason};
    if(room.boards)supPhysics.releaseSup(room.boards,id);room.users.set(id,user);return{kind:'toilet_state'};
  }
  if(data.type==='toilet_leave'){if(toiletProtocol.releaseToilet(room.toilet,id))return{kind:'toilet_state'};return null;}
  if(data.type==='sup_claim'||data.type==='sup_input'||data.type==='sup_release'){
    const board=room.boards?.find(b=>b.id===data.boardId);if(!board||board.deleted||!room.openSpace)return{kind:'sup_denied',boardId:data.boardId,reason:'Сапборд недоступен'};
    if(data.type==='sup_claim'){
      if(room.toilet?.owner===id)return{kind:'sup_denied',boardId:board.id,reason:'Сначала выйдите из туалета'};
      if(board.owner&&board.owner!==id)return{kind:'sup_denied',boardId:board.id,reason:'Этот сапборд уже занят'};
      if(!Number.isFinite(user.x)||Math.hypot(user.x-board.x,user.z-board.z)>3.6)return{kind:'sup_denied',boardId:board.id,reason:'Подойдите ближе к сапборду'};
      supPhysics.releaseSup(room.boards,id);board.owner=id;board.brake=false;board.lastInputAt=Date.now();return{kind:'sup_state'};
    }
    if(board.owner!==id)return null;
    if(data.type==='sup_release'){supPhysics.releaseSup(room.boards,id);return{kind:'sup_state'};}
    board.throttle=Math.max(-1,Math.min(1,Number(data.throttle)||0));board.steer=Math.max(-1,Math.min(1,Number(data.steer)||0));board.brake=!!data.brake;board.lastInputAt=Date.now();return null;
  }
  if (data.type === 'presence') {
    for (const key of ['x','y','z','yaw','pitch']) {
      const value = Number(data[key]);
      if (Number.isFinite(value)) user[key] = Math.max(-250, Math.min(250, value));
    }
    if (data.avatar && typeof data.avatar === 'object') user.avatar = {
      color: String(data.avatar.color || '#b9784f').slice(0, 20),
      shirt: String(data.avatar.shirt || '#263b52').slice(0, 20),
      hair: String(data.avatar.hair || '#3a2419').slice(0, 20),
      model: ['classic','casual','bearded','woman'].includes(data.avatar.model)?data.avatar.model:'classic'
    };
    if (data.action && typeof data.action === 'object') user.action = {
      kind: String(data.action.kind || 'idle').slice(0, 32),
      supId: room.boards?.some(b=>b.owner===id&&b.id===data.action.supId)?data.action.supId:null,
      stroke: Number(data.action.stroke)||0,
      seatKind: ['seat','chair','stool','sofa','folding-chair','hammock'].includes(data.action.seatKind)?data.action.seatKind:null,
      seatHeight: Math.max(.1,Math.min(3,Number(data.action.seatHeight)||.5)),
      gesture: ['drinking','pouring'].includes(data.action.gesture)?data.action.gesture:null,
      held: data.action.held === 'beer' || data.action.held === 'glass' ? data.action.held : null,
      beerKey: data.action.beerKey == null ? null : String(data.action.beerKey).slice(0, 80),
      fill: Number.isFinite(Number(data.action.fill)) ? Math.max(0, Math.min(1, Number(data.action.fill))) : null,
      ts: Date.now()
    };
    if(room.toilet?.owner===id){Object.assign(user,toiletProtocol.toiletPosition(room.toilet.mode,worldLayout?.entries["utility:toilet"]));user.action={kind:room.toilet.mode==='pee'?'urinating':'defecating',toiletId:'woodland-toilet',startedAt:room.toilet.startedAt};}
    room.users.set(id, user);
    return { kind: 'presence', user: serializeBeerUser(user) };
  }
  if (data.type === 'beer_action') {
    user.action = {
      kind: String(data.kind || 'idle').slice(0, 32),
      held: data.held === 'beer' || data.held === 'glass' ? data.held : null,
      beerKey: data.beerKey == null ? null : String(data.beerKey).slice(0, 80),
      fill: Number.isFinite(Number(data.fill)) ? Math.max(0, Math.min(1, Number(data.fill))) : null,
      surface: data.surface && typeof data.surface === 'object' ? {
        x: Number(data.surface.x) || 0, y: Number(data.surface.y) || 0, z: Number(data.surface.z) || 0
      } : null,
      ts: Date.now()
    };
    room.users.set(id, user);
    if (data.kind === 'placed' && (data.beerKey||data.itemType==='glass') && data.surface && typeof data.surface === 'object') {
      const rotation = data.rotation || {};
      const item = { id: String(data.itemId || `${id}:${data.beerKey}`).slice(0, 120), owner: id, beerKey: data.beerKey==null?null:String(data.beerKey).slice(0, 80), itemType:data.itemType==='glass'?'glass':'beer',glassShape:data.glassShape==='tulip'?'tulip':'pint',liquidColor:Number.isInteger(data.liquidColor)?Math.max(0,Math.min(0xffffff,data.liquidColor)):0xd58c19, fill:Math.max(0,Math.min(1,Number(data.fill)||0)), anchor:null, x: Number(data.surface.x) || 0, y: Number(data.surface.y) || 0, z: Number(data.surface.z) || 0, qx: Number(rotation.x)||0, qy: Number(rotation.y)||0, qz: Number(rotation.z)||0, qw: Number.isFinite(Number(rotation.w))?Number(rotation.w):1, updatedAt: Date.now() };
      const anchor=data.anchor,boat=anchor&&room.boards?.find(b=>b.id===anchor.boardId);if(boat&&Array.isArray(anchor.local)&&anchor.local.length===3&&anchor.local.every(Number.isFinite)&&Math.abs(anchor.local[0])<.42&&Math.abs(anchor.local[2])<1.62&&anchor.local[1]>.03&&anchor.local[1]<.25){item.anchor={boardId:boat.id,local:anchor.local,rotation:Array.isArray(anchor.rotation)&&anchor.rotation.length===4&&anchor.rotation.every(Number.isFinite)?anchor.rotation:[0,0,0,1]};}
      room.items.set(item.id, item);
      return { kind: 'placed', user: serializeBeerUser(user), item };
    }
    if (data.kind === 'picked' && data.itemId) {
      const item = room.items.get(String(data.itemId));
      if (item) room.items.delete(String(data.itemId));
      return { kind: 'picked', user: serializeBeerUser(user), itemId: String(data.itemId) };
    }
    return { kind: 'beer_action', user: serializeBeerUser(user) };
  }
  if (data.type === 'leave') { room.users.delete(id);if(room.toilet&&toiletProtocol.releaseToilet(room.toilet,id))broadcast({type:'toilet_state',toilet:room.toilet},roomName);if(room.boards)supPhysics.releaseSup(room.boards,id);return { kind: 'leave', id }; }
  return null;
}

function getBeerState(id, roomName) {
  const room = pruneBeerRoom(roomName);
  return { type: 'beer_state', worldLayout, id, openSpace:!!room.openSpace,toilet:room.toilet, boards:room.boards?.map(supPhysics.publicSupState)||[], users: Array.from(room.users.values()).map(serializeBeerUser).filter(Boolean), items: Array.from(room.items.values()) };
}

const beerRecognition = createRecognition({ fetchAndDecodeImage, readRequestBody, writeJsonResponse });
const server = http.createServer((req, res) => {
  const rawOrigin = String(req.headers.origin || '').trim();
  const hasOrigin = Boolean(rawOrigin);
  const origin = hasOrigin ? rawOrigin : '*';
  const reqHeaders = req.headers['access-control-request-headers'];
  const corsHeaders = {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': reqHeaders || 'Content-Type, Authorization, X-Yandex-Music-Client',
    'Access-Control-Expose-Headers': 'Content-Type, Content-Length, Cache-Control, ETag, Last-Modified, Accept-Ranges, Content-Range, Retry-After, X-Kinobox-Cache, X-Kinobox-Transport, X-Kinobox-Warning, X-Alloha-Sources, X-Alloha-Upstream-Content-Type',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin'
  };
  if (req.method === 'OPTIONS') {
    res.writeHead(204, corsHeaders);
    res.end();
    return;
  }
  const urlObj = new URL(req.url, 'http://localhost');
  if(urlObj.pathname==='/beer-room/editor-session'){worldEditorService.handle(req,res);return;}
  // Recover old cached clients that resolved the shelf link relative to /call/.
  if (/^\/call\/beer-shelf\.html$/i.test(urlObj.pathname) && (req.method === 'GET' || req.method === 'HEAD')) {
    res.writeHead(302, { ...corsHeaders, Location: '/beer-shelf.html' });
    res.end();
    return;
  }
  const voiceRoomRoute = matchVoiceRoomRoute(urlObj.pathname);
  if (voiceRoomRoute && (req.method === 'GET' || req.method === 'HEAD')) {
    if (serveLocalHtml(res, voiceRoomRoute.fileName, corsHeaders, req.method)) {
      return;
    }
  }
  if (isFirebaseRtdbProxyPath(urlObj.pathname)) {
    proxyFirebaseRtdbRequest(urlObj, req, res, corsHeaders);
    return;
  }
  if (urlObj.pathname === '/gear-catalog-proxy') {
    proxyEquipmentCatalogRequest(urlObj, req, res, corsHeaders);
    return;
  }
  if (req.url.startsWith('/puter-proxy') || (urlObj.pathname === '/' && urlObj.searchParams.get('url'))) {
    const target = (urlObj.searchParams.get('url') || '').trim();
    if (!target) {
      res.writeHead(400, corsHeaders);
      res.end('missing_url');
      return;
    }
    proxyRequest(target, req, res, corsHeaders);
    return;
  }
  if (urlObj.pathname.startsWith('/stalker/storage/')) {
    handleStalkerStorageRequest(urlObj, req, res, corsHeaders).catch(() => {
      if (!res.headersSent) {
        writeJsonResponse(res, 500, corsHeaders, { ok: false, error: 'storage_request_failed' });
      } else if (!res.writableEnded) {
        res.destroy();
      }
    });
    return;
  }
  if (urlObj.pathname.startsWith('/homm3/storage/')) {
    handleHomm3StorageRequest(urlObj, req, res, corsHeaders).catch(() => {
      if (!res.headersSent) {
        writeJsonResponse(res, 500, corsHeaders, { ok: false, error: 'storage_request_failed' });
      } else if (!res.writableEnded) {
        res.destroy();
      }
    });
    return;
  }
  if (urlObj.pathname.startsWith('/homm3/bundle/')) {
    handleHomm3BundleRequest(urlObj, req, res, corsHeaders);
    return;
  }
  if (
    urlObj.pathname === '/kinobox/players'
    || urlObj.pathname === '/api/kinobox/players'
    || urlObj.pathname === '/ytm/kinobox/players'
  ) {
    handleKinoboxPlayersProxy(urlObj, req, res, corsHeaders);
    return;
  }
  if (
    urlObj.pathname === '/alloha/players'
    || urlObj.pathname === '/api/alloha/players'
    || urlObj.pathname === '/ytm/alloha/players'
    || urlObj.pathname === '/alloha/raw'
    || urlObj.pathname === '/api/alloha/raw'
    || urlObj.pathname === '/ytm/alloha/raw'
  ) {
    proxyAllohaPlayersRequest(urlObj, req, res, corsHeaders);
    return;
  }
  if (
    urlObj.pathname === '/collaps/players'
    || urlObj.pathname === '/api/collaps/players'
    || urlObj.pathname === '/ytm/collaps/players'
  ) {
    proxyCollapsPlayersRequest(urlObj, req, res, corsHeaders);
    return;
  }
  if (
    urlObj.pathname === '/kinobd/players'
    || urlObj.pathname === '/api/kinobd/players'
    || urlObj.pathname === '/ytm/kinobd/players'
  ) {
    proxyKinoBdPlayersRequest(urlObj, req, res, corsHeaders);
    return;
  }
  if (
    urlObj.pathname === '/kinobd/embed'
    || urlObj.pathname === '/api/kinobd/embed'
    || urlObj.pathname === '/ytm/kinobd/embed'
  ) {
    proxyKinoBdEmbedPage(urlObj, req, res, corsHeaders);
    return;
  }
  if (urlObj.pathname === '/players' || urlObj.pathname === '/api/players') {
    const provider = String(
      urlObj.searchParams.get('provider')
      || urlObj.searchParams.get('source')
      || 'alloha'
    ).trim().toLowerCase();
    if (provider === 'collaps') {
      proxyCollapsPlayersRequest(urlObj, req, res, corsHeaders);
      return;
    }
    if (provider === 'kinobd') {
      proxyKinoBdPlayersRequest(urlObj, req, res, corsHeaders);
      return;
    }
    proxyAllohaPlayersRequest(urlObj, req, res, corsHeaders);
    return;
  }
  if (urlObj.pathname === '/openfoodfacts/search') {
    handleOpenFoodFactsSearch(urlObj, req, res, corsHeaders);
    return;
  }
  if (urlObj.pathname === '/localfoods/search') {
    handleLocalFoodsSearch(urlObj, req, res, corsHeaders);
    return;
  }
  if (urlObj.pathname === '/fatsecret/search') {
    handleFatSecretSearch(urlObj, req, res, corsHeaders);
    return;
  }
  if (urlObj.pathname === '/fatsecret/food') {
    handleFatSecretFood(urlObj, req, res, corsHeaders);
    return;
  }
  if (urlObj.pathname === '/yandex-oauth/config') {
    handleYandexOAuthConfig(req, res, corsHeaders);
    return;
  }
  if (urlObj.pathname.startsWith('/ytm/kinopoisk')) {
    if (['/ytm/kinopoisk/catalog', '/ytm/kinopoisk/catalog/filters', '/ytm/kinopoisk/catalog/random'].includes(urlObj.pathname)) {
      handleMovieCatalog(urlObj, req, res, corsHeaders);
      return;
    }
    proxyKinopoiskUnofficialRequest(urlObj, req, res, corsHeaders);
    return;
  }
  if (urlObj.pathname === '/ytm/search') {
    handleYtMusicSearch(urlObj, req, res, corsHeaders);
    return;
  }
  if (urlObj.pathname === '/ytm/collection') {
    handleYtMusicCollection(urlObj, req, res, corsHeaders);
    return;
  }
  if (urlObj.pathname === '/ytm/track') {
    handleYtMusicTrack(urlObj, req, res, corsHeaders);
    return;
  }
  if (urlObj.pathname === '/ytm/stream') {
    handleYtMusicStream(urlObj, req, res, corsHeaders);
    return;
  }
  if (urlObj.pathname === '/ytm-audio-stream') {
    handleYtMusicAudioStream(urlObj, req, res, corsHeaders);
    return;
  }
  if (urlObj.pathname === '/yandex-oauth/start') {
    handleYandexOAuthStart(urlObj, req, res);
    return;
  }
  if (urlObj.pathname === '/yandex-music/resolve-download' || urlObj.pathname === '/ym-resolve-download') {
    handleYandexResolveDownload(urlObj, req, res, corsHeaders);
    return;
  }
  if (urlObj.pathname === '/ym-track-link') {
    handleYandexTrackLink(urlObj, req, res, corsHeaders);
    return;
  }
  if (urlObj.pathname === '/ym-audio-stream') {
    handleYandexAudioStream(urlObj, req, res, corsHeaders);
    return;
  }
  if (urlObj.pathname.startsWith('/yandex-music')) {
    proxyYandexMusicRequest(urlObj, req, res, corsHeaders);
    return;
  }
  if (urlObj.pathname === '/beer-image-search') {
    handleBeerImageSearch(req, res, corsHeaders);
    return;
  }
  if (urlObj.pathname === '/beer-recognize' || urlObj.pathname === '/beer-recognize/status') {
    beerRecognition.handle(req, res, corsHeaders).catch(() => {
      if (!res.headersSent && !res.destroyed) writeJsonResponse(res, 503, corsHeaders, { error: 'recognition_unavailable' });
    });
    return;
  }
  if (urlObj.pathname === '/beer-data-search') {
    handleBeerDataSearch(req, res, corsHeaders);
    return;
  }
  if (urlObj.pathname === '/fetch-image' && req.method === 'POST') {
    handleFetchImagePost(req, res, corsHeaders);
    return;
  }
  if (urlObj.pathname === '/upload-image') {
    handleImageUpload(req, res, corsHeaders);
    return;
  }
  if (urlObj.pathname === '/remove-bg') {
    beerBackground.handle(req, res, corsHeaders, { readRequestBody, writeJsonResponse });
    return;
  }
  if (req.url.startsWith('/fetch-image')) {
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    };
    const safeRespond = (status, body, extraHeaders = null) => {
      if (res.writableEnded || res.headersSent) return;
      res.writeHead(status, extraHeaders ? { ...corsHeaders, ...extraHeaders } : corsHeaders);
      res.end(body);
    };
    if (req.method === 'OPTIONS') {
      safeRespond(204, '');
      return;
    }
    const url = new URL(req.url, 'http://localhost');
    const target = (url.searchParams.get('url') || '').trim();
    if (!target || (!target.startsWith('http://') && !target.startsWith('https://'))) {
      safeRespond(400, 'invalid_url');
      return;
    }
    const cachedImage = getCachedFetchImage(target);
    if (cachedImage) {
      safeRespond(200, cachedImage.body, {
        'Content-Type': cachedImage.contentType,
        'Cache-Control': 'public, max-age=300',
        'X-Image-Cache': 'hit'
      });
      return;
    }
    const staleImage = getCachedFetchImage(target, { allowStale: true });
    const fallbackContentType = guessImageContentType(target);
    let curlFallbackStarted = false;
    const awgBindValue = String(YTM_AWG_SOURCE_IP || YTM_AWG_INTERFACE || '').trim();
    const tryCurlFallback = () => {
      if (curlFallbackStarted || res.writableEnded || res.headersSent) return false;
      if (fetchImageCurlActive >= FETCH_IMAGE_CURL_MAX_ACTIVE) {
        if (staleImage) {
          safeRespond(200, staleImage.body, {
            'Content-Type': staleImage.contentType,
            'Cache-Control': 'public, max-age=60',
            'X-Image-Cache': 'stale-overload'
          });
        } else {
          safeRespond(503, 'fetch_busy');
        }
        return true;
      }
      curlFallbackStarted = true;
      fetchImageCurlActive += 1;
      const curlArgs = [
        '--silent',
        '--show-error',
        '--location',
        '--fail',
        '--ipv4',
        '--connect-timeout',
        '8',
      '--max-time',
        '12',
        '--header',
        'User-Agent: Mozilla/5.0',
        '--header',
        'Accept: image/*,*/*;q=0.8',
        target
      ];
      if (YTM_USE_AMNEZIAWG) {
        curlArgs.splice(5, 0, '--noproxy', '*');
        if (awgBindValue) {
          curlArgs.splice(5, 0, '--interface', awgBindValue);
        }
      }
      const proc = spawn('curl', curlArgs, { env: buildYtmExecEnv(null) });
      let wroteBody = false;
      let captureBytes = 0;
      const captureChunks = [];
      let cleanedUp = false;
      const cleanupProc = () => {
        if (cleanedUp) return;
        cleanedUp = true;
        fetchImageCurlActive = Math.max(0, fetchImageCurlActive - 1);
        req.off('close', stopProc);
        res.off('close', stopProc);
      };
      const stopProc = () => {
        try { if (!proc.killed) proc.kill('SIGTERM'); } catch (_) {}
      };
      req.on('close', stopProc);
      res.on('close', stopProc);
      proc.stdout.on('data', (chunk) => {
        if (res.writableEnded || res.destroyed) return;
        if (!res.headersSent) {
          try {
            res.writeHead(200, { ...corsHeaders, 'Content-Type': fallbackContentType });
          } catch (_) {
            try { proc.kill('SIGKILL'); } catch (_) {}
            return;
          }
        }
        wroteBody = true;
        if (captureBytes < FETCH_IMAGE_CACHE_MAX_BYTES) {
          const nextSize = captureBytes + chunk.length;
          if (nextSize <= FETCH_IMAGE_CACHE_MAX_BYTES) {
            captureChunks.push(Buffer.from(chunk));
            captureBytes = nextSize;
          } else {
            captureBytes = FETCH_IMAGE_CACHE_MAX_BYTES + 1;
          }
        }
        try { res.write(chunk); } catch (_) {}
      });
      proc.on('close', (code) => {
        cleanupProc();
        if (code === 0 && wroteBody) {
          if (captureBytes > 0 && captureBytes <= FETCH_IMAGE_CACHE_MAX_BYTES && captureChunks.length) {
            setCachedFetchImage(target, Buffer.concat(captureChunks, captureBytes), fallbackContentType);
          }
          if (!res.writableEnded) res.end();
          return;
        }
        if (!res.headersSent) {
          if (staleImage) {
            safeRespond(200, staleImage.body, {
              'Content-Type': staleImage.contentType,
              'Cache-Control': 'public, max-age=60',
              'X-Image-Cache': 'stale-error'
            });
            return;
          }
          safeRespond(502, 'fetch_failed');
        } else if (!res.writableEnded) {
          res.destroy();
        }
      });
      proc.on('error', () => {
        cleanupProc();
        if (!res.headersSent) {
          if (staleImage) {
            safeRespond(200, staleImage.body, {
              'Content-Type': staleImage.contentType,
              'Cache-Control': 'public, max-age=60',
              'X-Image-Cache': 'stale-error'
            });
            return;
          }
          safeRespond(502, 'fetch_failed');
        } else if (!res.writableEnded) {
          res.destroy();
        }
      });
      return true;
    };
    if (YTM_USE_AMNEZIAWG) {
      if (!tryCurlFallback()) {
        safeRespond(502, 'fetch_failed');
      }
      return;
    }
    const client = target.startsWith('https://') ? https : http;
    const requestOptions = {
      headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'image/*,*/*;q=0.8' }
    };
    if (YTM_USE_AMNEZIAWG && YTM_AWG_SOURCE_IP) {
      requestOptions.localAddress = YTM_AWG_SOURCE_IP;
      requestOptions.family = 4;
    }
    const upstream = client.get(target, requestOptions, (upres) => {
      if (!upres.statusCode || upres.statusCode >= 400) {
        if (YTM_USE_AMNEZIAWG && tryCurlFallback()) {
          upres.resume();
          return;
        }
        safeRespond(upres.statusCode || 502, 'fetch_failed');
        upres.resume();
        return;
      }
      const contentType = upres.headers['content-type'] || 'image/png';
      if (!res.headersSent) {
        res.writeHead(200, { ...corsHeaders, 'Content-Type': contentType });
      }
      const captureChunks = [];
      let captureBytes = 0;
      upres.on('data', (chunk) => {
        if (captureBytes <= FETCH_IMAGE_CACHE_MAX_BYTES) {
          const nextSize = captureBytes + chunk.length;
          if (nextSize <= FETCH_IMAGE_CACHE_MAX_BYTES) {
            captureChunks.push(Buffer.from(chunk));
            captureBytes = nextSize;
          } else {
            captureBytes = FETCH_IMAGE_CACHE_MAX_BYTES + 1;
          }
        }
        if (!res.writableEnded && !res.destroyed) {
          try { res.write(chunk); } catch (_) {}
        }
      });
      upres.on('end', () => {
        if (captureBytes > 0 && captureBytes <= FETCH_IMAGE_CACHE_MAX_BYTES && captureChunks.length) {
          setCachedFetchImage(target, Buffer.concat(captureChunks, captureBytes), contentType);
        }
        if (!res.writableEnded) res.end();
      });
    });
    upstream.on('error', () => {
      if (curlFallbackStarted) return;
      if (YTM_USE_AMNEZIAWG && tryCurlFallback()) return;
      safeRespond(502, 'fetch_failed');
    });
    upstream.setTimeout(15000, () => {
      if (curlFallbackStarted) return;
      if (YTM_USE_AMNEZIAWG && tryCurlFallback()) {
        upstream.destroy();
        return;
      }
      upstream.destroy();
      safeRespond(504, 'fetch_timeout');
    });
    return;
  }
  if (req.url.startsWith('/state')) {
    const url = new URL(req.url, 'http://localhost');
    const id = url.searchParams.get('id') || '';
    const roomName = url.searchParams.get('room') || 'ai-chat';
    const payload = getState(id, roomName);
    res.writeHead(200, { ...corsHeaders, 'Content-Type': 'application/json' });
    res.end(JSON.stringify(payload));
    return;
  }
  if (urlObj.pathname === '/planning-sync/wt') {
    res.writeHead(426, { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({
      ok: false,
      error: 'webtransport_upgrade_required',
      hint: 'Enable HTTP/3 WebTransport upstream for /planning-sync/wt or use /planning-sync/ws fallback.'
    }));
    return;
  }
  if (urlObj.pathname === '/planning-sync/state') {
    const eventKey = normalizePlanningEventKey(urlObj.searchParams.get('event') || '');
    if (!eventKey) {
      res.writeHead(400, { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: false, error: 'event_required' }));
      return;
    }
    const snapshot = getPlanningSnapshot(eventKey);
    res.writeHead(200, { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({
      ok: true,
      type: 'init',
      event: eventKey,
      ...snapshot
    }));
    return;
  }
  if (urlObj.pathname === '/planning-sync/event' && req.method === 'POST') {
    const eventKey = normalizePlanningEventKey(urlObj.searchParams.get('event') || '');
    if (!eventKey) {
      res.writeHead(400, { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: false, error: 'event_required' }));
      return;
    }
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      let data = null;
      try { data = JSON.parse(body || '{}'); } catch (_) {}
      const id = String(urlObj.searchParams.get('id') || nodeCrypto.randomUUID());
      const name = normalizePlanningName(urlObj.searchParams.get('name') || '');
      const color = normalizePlanningColor(urlObj.searchParams.get('color') || '');
      const result = applyPlanningMessage(eventKey, id, name, color, data);
      publishPlanningResult(eventKey, result);
      res.writeHead(200, { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: true }));
    });
    return;
  }
  if (req.url.startsWith('/event') && req.method === 'POST') {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      let data = null;
      try { data = JSON.parse(body || '{}'); } catch (_) {}
      if (data) {
        const url = new URL(req.url, 'http://localhost');
        const id = url.searchParams.get('id') || crypto.randomUUID();
        const name = (url.searchParams.get('name') || 'Guest').slice(0, 48);
        const roomName = url.searchParams.get('room') || 'ai-chat';
        const result = applyMessage(id, name, data, roomName) || {};
        if (result.kind === 'presence') {
          broadcast({ type: 'presence', user: state.users.get(id) });
        } else if (result.kind === 'video') {
          broadcast({ type: 'video', state: getVideoState() });
        } else if (result.kind === 'light') {
          broadcast({ type: 'light', state: state.light });
        } else if (result.kind === 'wall_draw') {
          broadcast(data);
        } else if (result.kind === 'chat:session') {
          broadcast({ type: 'chat:session', session: result.session }, roomName);
        } else if (result.kind === 'chat:message') {
          broadcast({ type: 'chat:message', chatId: result.chatId, message: result.message }, roomName);
        } else if (result.kind === 'chat:delete') {
          broadcast({ type: 'chat:delete', chatId: result.chatId }, roomName);
        } else {
          broadcast(data);
        }
      }
      res.writeHead(200, { ...corsHeaders, 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    });
    return;
  }
  if (urlObj.pathname === '/health' || urlObj.pathname === '/healthz') {
    res.writeHead(200, { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: true, status: 'healthy' }));
    return;
  }
  if (serveLocalStaticFile(urlObj, req, res, corsHeaders)) {
    return;
  }
  res.writeHead(404, { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify({
    ok: false,
    error: 'not_found',
    path: String(urlObj.pathname || ''),
    hint: 'Use /ytm/alloha/players, /ytm/collaps/players or /ytm/kinobd/players'
  }));
});

const wss = new WebSocket.Server({ noServer: true });
const clients = new Map();
const planningWss = new WebSocket.Server({ noServer: true });
const planningClients = new Map();
const firebaseRtdbProxyWss = new WebSocket.Server({ noServer: true });

function broadcast(data, roomName = null) {
  const payload = JSON.stringify(data);
  for (const [ws, meta] of clients.entries()) {
    if (roomName && meta && meta.room !== roomName) continue;
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(payload);
    }
  }
}

function broadcastPlanning(eventKey, data) {
  const payload = JSON.stringify(data);
  for (const [ws, meta] of planningClients.entries()) {
    if (!meta || meta.event !== eventKey) continue;
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(payload);
    }
  }
}

function publishPlanningResult(eventKey, result) {
  if (!eventKey || !result || !result.kind) return;
  if (result.kind === 'cursor' && result.cursor) {
    broadcastPlanning(eventKey, { type: 'cursor', cursor: result.cursor });
    return;
  }
  if (result.kind === 'action' && result.entry) {
    broadcastPlanning(eventKey, { type: 'action', entry: result.entry });
    return;
  }
  if (result.kind === 'leave' && result.id) {
    broadcastPlanning(eventKey, { type: 'leave', id: result.id });
    return;
  }
  if (result.kind === 'click' && result.click) {
    broadcastPlanning(eventKey, { type: 'click', click: result.click });
    return;
  }
  if (result.kind === 'voice:signal' && result.signal) {
    broadcastPlanning(eventKey, result.signal);
    return;
  }
  if (result.kind === 'voice:talking' && result.talking) {
    broadcastPlanning(eventKey, result.talking);
  }
}

server.on('upgrade', (req, socket, head) => {
  let url;
  try {
    url = new URL(req.url, 'http://localhost');
  } catch (_) {
    try { socket.destroy(); } catch (_) {}
    return;
  }

  if (url.pathname === `${FIREBASE_RTDB_ROUTE_PREFIX}/.ws`) {
    firebaseRtdbProxyWss.handleUpgrade(req, socket, head, (ws) => {
      firebaseRtdbProxyWss.emit('connection', ws, req);
    });
    return;
  }

  if (url.pathname === '/ws') {
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, req);
    });
    return;
  }

  if (url.pathname === '/planning-sync/ws') {
    planningWss.handleUpgrade(req, socket, head, (ws) => {
      planningWss.emit('connection', ws, req);
    });
    return;
  }

  try { socket.destroy(); } catch (_) {}
});

firebaseRtdbProxyWss.on('connection', (clientWs, req) => {
  let urlObj;
  try {
    urlObj = new URL(req.url, 'http://localhost');
  } catch (_) {
    try { clientWs.close(1002, 'invalid_url'); } catch (_) {}
    return;
  }

  let upstreamWsUrl;
  let upstreamOrigin;
  try {
    upstreamWsUrl = buildFirebaseRtdbUpstreamWsUrl(urlObj);
    const upstreamHttpUrl = buildFirebaseRtdbUpstreamUrl(urlObj);
    upstreamOrigin = `${upstreamHttpUrl.protocol}//${upstreamHttpUrl.host}`;
  } catch (_) {
    try { clientWs.close(1011, 'invalid_upstream'); } catch (_) {}
    return;
  }

  const rawProtocols = req.headers['sec-websocket-protocol'];
  const parsedProtocols = Array.isArray(rawProtocols)
    ? rawProtocols
    : (typeof rawProtocols === 'string' ? rawProtocols.split(',') : []);
  const protocols = parsedProtocols.map((item) => String(item || '').trim()).filter(Boolean);

  const upstreamHeaders = {
    'User-Agent': req.headers['user-agent'] || 'Mozilla/5.0 (KinosredaRealtimeProxy)',
    Origin: upstreamOrigin
  };

  const upstreamWs = protocols.length
    ? new WebSocket(upstreamWsUrl.toString(), protocols, { headers: upstreamHeaders })
    : new WebSocket(upstreamWsUrl.toString(), { headers: upstreamHeaders });

  clientWs.on('message', (data, isBinary) => {
    if (upstreamWs.readyState !== WebSocket.OPEN) return;
    try {
      upstreamWs.send(data, { binary: !!isBinary });
    } catch (_) {}
  });

  upstreamWs.on('message', (data, isBinary) => {
    if (clientWs.readyState !== WebSocket.OPEN) return;
    try {
      clientWs.send(data, { binary: !!isBinary });
    } catch (_) {}
  });

  clientWs.on('close', () => {
    try {
      if (upstreamWs.readyState === WebSocket.OPEN || upstreamWs.readyState === WebSocket.CONNECTING) {
        upstreamWs.terminate();
      }
    } catch (_) {}
  });
  clientWs.on('error', () => {
    try { upstreamWs.terminate(); } catch (_) {}
  });

  upstreamWs.on('close', () => {
    try {
      if (clientWs.readyState === WebSocket.OPEN || clientWs.readyState === WebSocket.CONNECTING) {
        clientWs.terminate();
      }
    } catch (_) {}
  });
  upstreamWs.on('error', () => {
    try {
      if (clientWs.readyState === WebSocket.OPEN || clientWs.readyState === WebSocket.CONNECTING) {
        clientWs.close(1011, 'upstream_error');
      }
    } catch (_) {}
  });
});

setInterval(()=>{if(!supPhysics)return;const now=Date.now();for(const [roomName,room]of state.beerRooms){if(room.toilet&&toiletProtocol.expireToilet(room.toilet,room.users,now))broadcast({type:'toilet_state',toilet:room.toilet},roomName);if(!room.openSpace||!room.boards||!room.users.size)continue;const moving=room.boards.some(b=>b.owner||Math.abs(b.speed)>.002);if(!moving)continue;for(const b of room.boards){if(b.owner&&!room.users.has(b.owner))supPhysics.releaseSup(room.boards,b.owner);if(now-(b.lastInputAt||0)>700){b.throttle=b.steer=0;}supPhysics.advanceSupBoard(b,.05);}supPhysics.separateSupBoards(room.boards);broadcast({type:'sup_state',boards:room.boards.map(supPhysics.publicSupState)},roomName);}},50).unref();

wss.on('connection', async (ws, req) => {
  const url = new URL(req.url, 'http://localhost');
  const id = url.searchParams.get('id') || crypto.randomUUID();
  const name = (url.searchParams.get('name') || 'Guest').slice(0, 48);
  const roomName = url.searchParams.get('room') || 'ai-chat';

  const isBeerRoom = roomName === 'kinosreda-beer-room';
  if (isBeerRoom) {
    try{await worldProtocolReady;}catch{ws.close(1011,'world_unavailable');return;}if(ws.readyState!==WebSocket.OPEN)return;
    clients.set(ws, { id, room: roomName, beerRoom: true });
    ws.send(JSON.stringify({...getBeerState(id, roomName),canEditWorld:worldEditorService.authorized(req)}));
    // The first real presence announces the player at their restored position.
    ws.on('message', (raw) => {
      let data = null;
      try { data = JSON.parse(raw.toString()); } catch (_) {}
      if(data?.type==='world_edit'){
        const requestId=String(data.requestId||'').slice(0,100);
        const deny=reason=>ws.send(JSON.stringify({type:'world_edit_denied',requestId,reason,worldLayout}));

        const room=getBeerRoom(roomName);if(data.patch?.id==='utility:toilet'&&room.toilet?.owner){deny('Сначала освободите туалет');return;}
        const board=data.patch?.id?.startsWith('sup:')?room.boards?.find(b=>'sup:'+b.id===data.patch.id):null;
        if(board?.owner){deny('Сначала освободите сапборд');return;}
        if(board&&data.patch.deleted&&[...room.items.values()].some(item=>item.anchor?.boardId===board.id)){deny('Сначала уберите напитки с сапборда');return;}
        const next=structuredClone(worldLayout),result=worldProtocol.applyWorldPatch(next,data.patch);
        if(result.error){deny(result.error);return;}
        if(board){const pose={...board,...result.entry};if(!pose.deleted&&!supPhysics.boardFitsWater(pose.x,pose.z,pose.yaw,pose)){deny('Сапборд должен целиком находиться на воде');return;}}
        try{worldEditorService.save(next);}catch{deny('Не удалось сохранить расстановку');return;}
        worldLayout=next;if(data.patch.id.startsWith('terrain:'))worldTerrain.syncTerrainHeights(worldLayout.entries);if(board){Object.assign(board,result.entry,{id:board.id,speed:0,throttle:0,steer:0,brake:true});broadcast({type:'sup_state',boards:room.boards.map(supPhysics.publicSupState)},roomName);}
        broadcast({type:'world_patch',...result,requestId,author:id},roomName);return;
      }
      const result = applyBeerMessage(id, name, data, roomName);
      if (!result) return;
      if(result.kind==='toilet_denied'){ws.send(JSON.stringify({type:'toilet_denied',reason:result.reason}));}
      else if(result.kind==='toilet_state'){const r=getBeerRoom(roomName);broadcast({type:'toilet_state',toilet:r.toilet},roomName);broadcast({type:'sup_state',boards:r.boards?.map(supPhysics.publicSupState)||[]},roomName);}
      else if(result.kind==='sup_denied'){ws.send(JSON.stringify({type:'sup_denied',boardId:result.boardId,reason:result.reason}));}
      else if(result.kind==='sup_state'){broadcast({type:'sup_state',boards:getBeerRoom(roomName).boards.map(supPhysics.publicSupState)},roomName);}
      else if(result.kind==='world'){broadcast({type:'toilet_state',toilet:getBeerRoom(roomName).toilet},roomName);broadcast({type:'beer_world',open:result.open},roomName);broadcast({type:'sup_state',boards:getBeerRoom(roomName).boards?.map(supPhysics.publicSupState)||[]},roomName);}
      else if (result.kind === 'presence' || result.kind === 'beer_action') {
        broadcast({ type: result.kind === 'presence' ? 'beer_presence' : 'beer_action', user: result.user }, roomName);
      } else if (result.kind === 'placed') {
        broadcast({ type: 'beer_placed', user: result.user, item: result.item }, roomName);
      } else if (result.kind === 'picked') {
        broadcast({ type: 'beer_removed', user: result.user, itemId: result.itemId }, roomName);
      } else if (result.kind === 'leave') {
        broadcast({ type: 'beer_user_leave', id: result.id }, roomName);
      }
    });
    const cleanupBeer = () => {
      clients.delete(ws);
      const beerRoom=getBeerRoom(roomName);beerRoom.users.delete(id);if(toiletProtocol.releaseToilet(beerRoom.toilet,id))broadcast({type:'toilet_state',toilet:beerRoom.toilet},roomName);if(beerRoom.boards)supPhysics.releaseSup(beerRoom.boards,id);
      broadcast({type:'sup_state',boards:beerRoom.boards?.map(supPhysics.publicSupState)||[]},roomName);
      broadcast({ type: 'beer_user_leave', id }, roomName);
    };
    ws.on('close', cleanupBeer);
    ws.on('error', cleanupBeer);
    return;
  }

  clients.set(ws, { id, room: roomName });

  ws.send(JSON.stringify(getState(id, roomName)));
  broadcast({ type: 'user_join', user: { id, name, x: 0, y: 0, z: 0, yaw: 0 } });

  ws.on('message', (raw) => {
    let data = null;
    try { data = JSON.parse(raw.toString()); } catch (_) {}
    if (!data) return;
    const result = applyMessage(id, name, data, roomName) || {};
    if (result.kind === 'presence') {
      broadcast({ type: 'presence', user: state.users.get(id) });
    } else if (result.kind === 'video') {
      broadcast({ type: 'video', state: getVideoState() });
    } else if (result.kind === 'light') {
      broadcast({ type: 'light', state: state.light });
    } else if (result.kind === 'wall_draw') {
      broadcast(data);
    } else if (result.kind === 'chat:session') {
      broadcast({ type: 'chat:session', session: result.session }, roomName);
    } else if (result.kind === 'chat:message') {
      broadcast({ type: 'chat:message', chatId: result.chatId, message: result.message }, roomName);
    } else if (result.kind === 'chat:delete') {
      broadcast({ type: 'chat:delete', chatId: result.chatId }, roomName);
    } else {
      broadcast(data);
    }
  });

  const cleanup = () => {
    clients.delete(ws);
    state.users.delete(id);
    broadcast({ type: 'user_leave', id });
  };
  ws.on('close', cleanup);
  ws.on('error', cleanup);
});

planningWss.on('connection', (ws, req) => {
  const url = new URL(req.url, 'http://localhost');
  const eventKey = normalizePlanningEventKey(url.searchParams.get('event') || url.searchParams.get('room') || '');
  if (!eventKey) {
    ws.close(1008, 'event_required');
    return;
  }
  const id = String(url.searchParams.get('id') || nodeCrypto.randomUUID());
  const name = normalizePlanningName(url.searchParams.get('name') || '');
  const color = normalizePlanningColor(url.searchParams.get('color') || '');
  planningClients.set(ws, { id, event: eventKey, name, color });

  ws.send(JSON.stringify({
    type: 'init',
    event: eventKey,
    ...getPlanningSnapshot(eventKey)
  }));

  ws.on('message', (raw) => {
    let data = null;
    try { data = JSON.parse(raw.toString()); } catch (_) {}
    if (!data) return;
    const result = applyPlanningMessage(eventKey, id, name, color, data);
    publishPlanningResult(eventKey, result);
  });

  const cleanup = () => {
    planningClients.delete(ws);
    const result = applyPlanningMessage(eventKey, id, name, color, { type: 'leave' });
    publishPlanningResult(eventKey, result);
    prunePlanningRooms();
  };

  ws.on('close', cleanup);
  ws.on('error', cleanup);
});

server.listen(LOCAL_SERVER_PORT, LOCAL_SERVER_HOST, () => {
  if (process.env.BEER_RECOGNITION_DISABLED !== '1') beerRecognition.warmup();
  console.log(`WS state server on http://${LOCAL_SERVER_HOST}:${LOCAL_SERVER_PORT}`);
  if (YTM_USE_AMNEZIAWG) {
    console.log(`[ytm] egress: amneziawg${YTM_AWG_INTERFACE ? ` (${YTM_AWG_INTERFACE})` : ''}`);
  } else if (YTM_PROXY_URL) {
    console.log(`[ytm] proxy enabled: ${YTM_PROXY_URL}`);
  } else {
    console.log('[ytm] proxy disabled: set YTM_EGRESS_MODE=amneziawg or YTM_PROXY_URL/HTTPS_PROXY');
  }
  console.log(
    `[ytm] host_profile: cpu=${HOST_CPU_COUNT} mem_mb=${Math.round(HOST_TOTAL_MEM_BYTES / (1024 * 1024) || 0)} low_resource=${LOW_RESOURCE_HOST ? '1' : '0'}`
  );
  console.log(
    `[ytm] limits: bridge=${YTMUSIC_BRIDGE_MAX_CONCURRENCY}/${YTMUSIC_BRIDGE_MAX_QUEUE} track_bridge=${YTMUSIC_TRACK_BRIDGE_MAX_CONCURRENCY}/${YTMUSIC_TRACK_BRIDGE_MAX_QUEUE} stream_bridge=${YTMUSIC_STREAM_BRIDGE_MAX_CONCURRENCY}/${YTMUSIC_STREAM_BRIDGE_MAX_QUEUE} fetch_image_curl=${FETCH_IMAGE_CURL_MAX_ACTIVE}`
  );
});
