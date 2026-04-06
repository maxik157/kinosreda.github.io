const params = new URLSearchParams(window.location.search);
const cloudSavesStatus = document.getElementById('cloud-saves-status');
var statusElement = document.getElementById("status");
var progressElement = document.getElementById("progress");
var spinnerElement = document.getElementById('spinner');
var wasm_content = params.get("wasm");
const profileInput = document.getElementById("profile-input");
const loaderContainer = document.getElementById("loaderContainer");
const loaderTitle = document.getElementById("loaderTitle");
const loaderDetail = document.getElementById("loaderDetail");
const archiveStatus = document.getElementById("archive-status");
const installServerButton = document.getElementById("install-server-button");
const installFileButton = document.getElementById("install-file-button");
const archiveFileInput = document.getElementById("archive-file-input");
const startContainer = document.querySelector(".start-container");
const buttonContainer = document.querySelector(".button-container");
const developedBy = document.querySelector(".developed-by");
const jsdosKeyBlock = document.querySelector(".jsdos-key");
let serverSaveKey = "";
let serverSaveUrl = "";
let usingServerSaves = false;
let manifestPromise = null;
let packManifestPromise = null;
let preloadPromise = null;
let startRequested = false;
let startupOverlayDismissed = false;
let startupPackBufferPromise = null;
let archiveInstallPromise = null;
let localArchiveReady = false;
let localArchiveCatalog = null;
const assetCache = new Map();
const packChunkCache = new Map();
const prefetchedPacks = new Set();
const preloadListUrl = "preload_files.list";
const assetManifestUrl = "data-files.json";
const assetPackManifestUrl = "asset-packs.json";
const assetPackCacheName = "vice-city-pack-cache-v2";
const serverArchiveUrl = "../assets/gtavcruslang.zip?v=20260406-archivefix1";
const dataBaseUrl = "../data/";

const isMobile = /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
let isTouch = isMobile && window.matchMedia('(pointer: coarse)').matches;

document.body.dataset.isTouch = isTouch ? 1 : 0;

const dataSize = 130 * 1024 * 1024;
const textDecoder = new TextDecoder();
(function () {
    const translations = {
        en: {
            clickToPlayDemo: "Click to play demo",
            clickToPlayFull: "Click to play",
            invalidKey: "invalid key",
            checking: "checking...",
            cloudSaves: "Cloud saves:",
            enabled: "enabled",
            disabled: "disabled",
            playDemoText: "You can play the DEMO version, or provide the original game files to play the full version.",
            disclaimer: "DISCLAIMER:",
            disclaimerSources: "This game is based on an open source version of GTA: Vice City. It is not a commercial release and is not affiliated with Rockstar Games.",
            disclaimerCheckbox: "I own the original game",
            disclaimerPrompt: "You need to provide a file from the original game to confirm ownership of the original game.",
            cantContinuePlaying: "You can't continue playing in DEMO version. Please provide the original game files to continue playing.",
            demoAlert: "The demo version is intended only for familiarizing yourself with the game technology. All features are available, but you won’t be able to progress through the game’s storyline. Please provide the original game files to launch the full version.",
            downloading: "Downloading",
            enterKey: "enter your key",
            clickToContinue: "Click to continue...",
            enterJsDosKey: "Enter js-dos key",
            portBy: "HTML5 port by:",
            ruTranslate: "",
            demoOffDisclaimer: "Due to the unexpectedly high popularity of the project, resulting in significant traffic costs, and in order to avoid any risk of the project being shut down due to rights holder claims, we have disabled the demo version. You can still run the full version by providing the original game resources.",
        },
        ru: {
            clickToPlayDemo: "Играть в демо версию",
            clickToPlayFull: "Играть",
            invalidKey: "неверный ключ",
            checking: "проверка...",
            cloudSaves: "Облачные сохранения:",
            enabled: "включены",
            disabled: "выключены",
            playDemoText: "Вы можете играть в демо версию, или предоставить оригинальные файлы игры для полной версии.",
            disclaimer: "ОТКАЗ ОТ ОТВЕТСТВЕННОСТИ:",
            disclaimerSources: "Эта игра основана на открытой версии GTA: Vice City. Она не является коммерческим изданием и не связана с Rockstar Games.",
            disclaimerCheckbox: "Я владею оригинальной игрой",
            disclaimerPrompt: "Вам потребуется приложить какой-либо файл из оригинальной игры для подтверждения владения оригинальной игрой.",
            cantContinuePlaying: "Вы не можете продолжить игру в демо версии. Пожалуйста, предоставьте оригинальные файлы игры для продолжения игры.",
            demoAlert: "Демо версия предназначена только для ознакомления с технологией игры. Все функции доступны, но вы не сможете продолжить игру по сюжету. Пожалуйста, предоставьте оригинальные файлы игры для запуска полной версии.",
            downloading: "Загрузка",
            enterKey: "введите ваш ключ",
            clickToContinue: "Нажмите для продолжения...",
            enterJsDosKey: "Введите ключ js-dos",
            portBy: "Авторы HTML5 порта:",
            ruTranslate: `
<div class="translated-by">
    <span>Переведено на русский студией</span>
    <a href="https://www.gamesvoice.ru/" target="_blank">GamesVoice</a>
</div>
`,
            demoOffDisclaimer: "В связи с неожиданно высокой популярностью проекта, как следствие — значительными расходами на трафик, а также во избежание рисков закрытия проекта из-за претензий правообладателей, мы отключили возможность запуска демо-версии. При этом вы по-прежнему можете запустить полную версию, предоставив оригинальные ресурсы.",
        },
    };

    let currentLanguage = navigator.language.split("-")[0] === "ru" ? "ru" : "en";
    if (params.get("lang") === "ru") {
        currentLanguage = "ru";
    }
    if (params.get("lang") === "en") {
        currentLanguage = "en";
    }

    window.t = function (key) {
        return translations[currentLanguage][key];
    }
})();

function normalizeSaveKey(raw) {
    const normalized = String(raw || "").trim().toLowerCase();
    return /^[a-f0-9]{24,64}$/.test(normalized) ? normalized : "";
}

function applySaveKey(raw) {
    serverSaveKey = normalizeSaveKey(raw);
    serverSaveUrl = serverSaveKey ? `/vice-city/save/${serverSaveKey}.bin` : "";
    usingServerSaves = !!serverSaveUrl;
}

applySaveKey(params.get("saveKey") || localStorage.getItem("vcsky.saveKey") || "");

if (profileInput) {
    profileInput.value = params.get("profile")
        || localStorage.getItem("vcsky.saveProfile")
        || "";
}

async function sha256Hex(input) {
    const source = new TextEncoder().encode(input);
    const digest = await crypto.subtle.digest("SHA-256", source);
    return Array.from(new Uint8Array(digest)).map((value) => value.toString(16).padStart(2, "0")).join("");
}

async function ensureProfileReady() {
    if (serverSaveKey) {
        return true;
    }
    if (!profileInput) {
        return false;
    }
    const rawProfile = profileInput.value.trim();
    if (!rawProfile) {
        profileInput.focus();
        return false;
    }
    const computedSaveKey = await sha256Hex(`vice-city:${rawProfile.toLowerCase()}`);
    localStorage.setItem("vcsky.saveProfile", rawProfile);
    localStorage.setItem("vcsky.saveKey", computedSaveKey);
    applySaveKey(computedSaveKey);
    return true;
}

function setLoaderState({ visible, title, detail }) {
    if (!loaderContainer) {
        return;
    }
    if (clickToPlay) {
        clickToPlay.classList.toggle('is-loading', !!visible);
    }
    if (visible) {
        loaderContainer.hidden = false;
    } else {
        loaderContainer.hidden = true;
        if (startRequested && startContainer) {
            startContainer.style.display = "none";
        }
    }
    if (title && loaderTitle) {
        loaderTitle.textContent = title;
    }
    if (detail && loaderDetail) {
        loaderDetail.textContent = detail;
    }
}

function hideStartupOverlay() {
    if (startupOverlayDismissed) {
        return;
    }
    startupOverlayDismissed = true;
    if (clickToPlay) {
        clickToPlay.classList.remove('is-loading');
        clickToPlay.style.display = "none";
    }
    if (loaderContainer) {
        loaderContainer.hidden = true;
        loaderContainer.style.display = "none";
    }
    if (buttonContainer) {
        buttonContainer.style.display = "none";
    }
    if (startContainer) {
        startContainer.hidden = true;
        startContainer.style.display = "none";
        startContainer.style.visibility = "hidden";
        startContainer.style.pointerEvents = "none";
    }
}

async function dismissStartupOverlay() {
    setLoaderState({ visible: true });
    await new Promise((resolve) => window.setTimeout(resolve, 60));
    hideStartupOverlay();
}

function normalizePath(path) {
    return String(path || "")
        .trim()
        .replaceAll("\\", "/")
        .replace(/\/+/g, "/")
        .replace(/^\/+/, "")
        .replace(/^data\//i, "");
}

function formatMegabytes(value) {
    return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function setArchiveStatus(text, isError = false) {
    if (!archiveStatus) {
        return;
    }
    archiveStatus.innerHTML = isError ? `<strong>${text}</strong>` : text;
}

function setInstallButtonsState(disabled) {
    if (installServerButton) {
        installServerButton.disabled = disabled;
    }
    if (installFileButton) {
        installFileButton.disabled = disabled;
    }
}

function updateInstallVisibility() {
    if (installServerButton) {
        installServerButton.hidden = localArchiveReady;
    }
}

function updatePlayButtonState() {
    if (!clickToPlayButton) {
        return;
    }
    if (startRequested) {
        clickToPlayButton.disabled = true;
        clickToPlayButton.textContent = "Запуск...";
        return;
    }
    clickToPlayButton.textContent = t('clickToPlayFull');
    clickToPlayButton.disabled = !localArchiveReady;
    if (!localArchiveReady) {
        clickToPlayButton.title = "Сначала установите архив ресурсов";
        return;
    }
    clickToPlayButton.removeAttribute("title");
}

function splitResourceLine(line) {
    const matches = [...line.matchAll(/vc-assets\/.*?(?=vc-assets\/|$)/ig)];
    return matches.length ? matches.map((match) => match[0]) : [line];
}

async function loadAssetManifest() {
    if (!manifestPromise) {
        manifestPromise = fetch(assetManifestUrl, { cache: "force-cache" })
            .then(async (response) => {
                if (!response.ok) {
                    throw new Error(`Failed to fetch asset manifest: ${response.status}`);
                }
                const files = await response.json();
                const fileSet = new Set();
                const lowerMap = new Map();
                for (const rawPath of files) {
                    const normalized = normalizePath(rawPath);
                    if (!normalized) {
                        continue;
                    }
                    fileSet.add(normalized);
                    const key = normalized.toLowerCase();
                    if (!lowerMap.has(key)) {
                        lowerMap.set(key, normalized);
                    }
                }
                return { fileSet, lowerMap };
            });
    }
    return manifestPromise;
}

async function loadPackManifest() {
    if (!packManifestPromise) {
        packManifestPromise = fetch(assetPackManifestUrl, { cache: "force-cache" })
            .then(async (response) => {
                if (response.status === 404) {
                    return null;
                }
                if (!response.ok) {
                    throw new Error(`Failed to fetch asset pack manifest: ${response.status}`);
                }
                return await response.json();
            })
            .catch((error) => {
                console.warn("Asset pack manifest unavailable, falling back to direct files.", error);
                return null;
            });
    }
    return packManifestPromise;
}

async function fetchArchiveCachedAsset(path) {
    if (!localArchiveReady || !window.ViceCityArchiveCache) {
        return null;
    }
    try {
        return await window.ViceCityArchiveCache.getArrayBuffer(path);
    } catch (error) {
        console.warn(`Failed to read asset from local archive cache: ${path}`, error);
        return null;
    }
}

async function refreshArchiveState() {
    if (!window.ViceCityArchiveCache) {
        localArchiveReady = false;
        localArchiveCatalog = null;
        setArchiveStatus("Локальный кэш браузера недоступен. Игра будет работать хуже.", true);
        updateInstallVisibility();
        updatePlayButtonState();
        return;
    }
    localArchiveCatalog = await window.ViceCityArchiveCache.getCatalog();
    localArchiveReady = !!(localArchiveCatalog && localArchiveCatalog.count > 0);
    if (localArchiveReady) {
        setArchiveStatus("Локальный кэш готов.");
    } else {
        setArchiveStatus("Локальный кэш не найден. Установите архив ресурсов перед запуском.");
    }
    updateInstallVisibility();
    updatePlayButtonState();
}

async function ensureServerArchiveAvailable() {
    try {
        const response = await fetch(serverArchiveUrl, {
            method: "HEAD",
            cache: "no-store",
            credentials: "same-origin",
        });
        if (!response.ok) {
            throw new Error(`Archive HEAD failed: ${response.status}`);
        }
        if (installServerButton) {
            installServerButton.textContent = "Установить";
        }
        updateInstallVisibility();
        return true;
    } catch (error) {
        console.warn("Server archive is unavailable", error);
        if (installServerButton) {
            installServerButton.disabled = true;
            installServerButton.textContent = "Архив на сервере недоступен";
            installServerButton.hidden = false;
        }
        return false;
    }
}

async function runArchiveInstall(installer, sourceLabel) {
    if (archiveInstallPromise) {
        return archiveInstallPromise;
    }
    assetCache.clear();
    startupPackBufferPromise = null;
    archiveInstallPromise = (async () => {
        setInstallButtonsState(true);
        updatePlayButtonState();
        try {
            await installer(({ phase, current, total, filename, loaded }) => {
                if (phase === "download") {
                    const totalText = total ? formatMegabytes(total) : "неизвестно";
                    const loadedText = formatMegabytes(loaded || 0);
                    setArchiveStatus(`Скачиваем архив с сервера: ${loadedText} / ${totalText}`);
                    return;
                }
                if (phase === "extract") {
                    const shortName = filename ? filename.split("/").pop() : "";
                    setArchiveStatus(`Импортируем архив в локальный кэш: ${current} / ${total}${shortName ? `<br><span>${shortName}</span>` : ""}`);
                    return;
                }
                setArchiveStatus("Подготавливаем установку архива...");
            });
            await refreshArchiveState();
            setArchiveStatus("Локальный кэш готов.");
        } catch (error) {
            console.error("Archive install failed", error);
            setArchiveStatus("Не удалось установить архив ресурсов.", true);
            throw error;
        } finally {
            archiveInstallPromise = null;
            setInstallButtonsState(false);
            updatePlayButtonState();
        }
    })();
    return archiveInstallPromise;
}

async function installArchiveFromServer() {
    if (!window.ViceCityArchiveCache) {
        return;
    }
    return await runArchiveInstall(
        (onProgress) => window.ViceCityArchiveCache.installFromUrl(serverArchiveUrl, onProgress),
        "сервера"
    );
}

async function installArchiveFromFile(file) {
    if (!window.ViceCityArchiveCache || !file) {
        return;
    }
    return await runArchiveInstall(
        (onProgress) => window.ViceCityArchiveCache.installFromBlob(file, file.name || "архива", onProgress),
        "архива"
    );
}

async function resolveAssetPath(path) {
    const normalized = normalizePath(path);
    if (!normalized) {
        return null;
    }
    const manifest = await loadAssetManifest();
    if (manifest.fileSet.has(normalized)) {
        return normalized;
    }
    return manifest.lowerMap.get(normalized.toLowerCase()) || null;
}

function buildAssetUrl(path) {
    return new URL(dataBaseUrl + path.replace(/^\/+/, ""), document.baseURI).toString();
}

async function openPackCache() {
    if (!("caches" in window)) {
        return null;
    }
    try {
        return await caches.open(assetPackCacheName);
    } catch (error) {
        console.warn("Pack cache unavailable", error);
        return null;
    }
}

async function fetchStartupPackBuffer(onProgress) {
    if (!startupPackBufferPromise) {
        startupPackBufferPromise = (async () => {
            const manifest = await loadPackManifest();
            const startupPack = manifest && manifest.packs && manifest.packs.startup;
            if (!startupPack) {
                return null;
            }
            const response = await fetch(buildAssetUrl(startupPack.path), {
                cache: "force-cache",
                credentials: "same-origin",
            });
            if (!response.ok) {
                throw new Error(`Failed to fetch startup pack: ${response.status}`);
            }
            const total = Number(response.headers.get("content-length")) || startupPack.size || 0;
            if (!response.body || !response.body.getReader) {
                const buffer = await response.arrayBuffer();
                if (onProgress) {
                    onProgress(buffer.byteLength, total || buffer.byteLength);
                }
                return buffer;
            }
            const reader = response.body.getReader();
            const chunks = [];
            let loaded = 0;
            while (true) {
                const { done, value } = await reader.read();
                if (done) {
                    break;
                }
                chunks.push(value);
                loaded += value.byteLength;
                if (onProgress) {
                    onProgress(loaded, total || loaded);
                }
            }
            const buffer = new Uint8Array(loaded);
            let offset = 0;
            for (const chunk of chunks) {
                buffer.set(chunk, offset);
                offset += chunk.byteLength;
            }
            return buffer.buffer;
        })();
    }
    return startupPackBufferPromise;
}

async function getPackChunk(packName, chunkIndex) {
    const manifest = await loadPackManifest();
    if (!manifest || !manifest.packs || !manifest.packs[packName]) {
        throw new Error(`Unknown asset pack: ${packName}`);
    }
    const chunkSize = manifest.chunkSize || (1024 * 1024);
    const pack = manifest.packs[packName];
    const key = `${packName}:${chunkIndex}`;
    if (packChunkCache.has(key)) {
        return packChunkCache.get(key);
    }
    const promise = (async () => {
        const packUrl = buildAssetUrl(pack.path);
        const cacheUrl = `${packUrl}?chunk=${chunkIndex}`;
        const cache = await openPackCache();
        if (cache) {
            const cached = await cache.match(cacheUrl);
            if (cached) {
                return await cached.arrayBuffer();
            }
        }
        const start = chunkIndex * chunkSize;
        const endExclusive = Math.min(start + chunkSize, pack.size);
        const response = await fetch(packUrl, {
            cache: "force-cache",
            credentials: "same-origin",
            headers: {
                Range: `bytes=${start}-${endExclusive - 1}`,
            },
        });
        if (!(response.status === 206 || response.status === 200)) {
            throw new Error(`Failed to fetch pack chunk ${packName}:${chunkIndex} (${response.status})`);
        }
        let buffer = await response.arrayBuffer();
        if (response.status === 200 && buffer.byteLength === pack.size && buffer.byteLength !== (endExclusive - start)) {
            buffer = buffer.slice(start, endExclusive);
        }
        if (cache) {
            try {
                await cache.put(cacheUrl, new Response(buffer, {
                    headers: {
                        "Content-Type": "application/octet-stream",
                    },
                }));
            } catch (_) {}
        }
        return buffer;
    })();
    packChunkCache.set(key, promise);
    return promise;
}

async function fetchPackedAsset(path) {
    const manifest = await loadPackManifest();
    if (!manifest || !manifest.files) {
        return null;
    }
    const entry = manifest.files[path];
    if (!entry) {
        return null;
    }
    const [packName, offset, size] = entry;
    if (packName === "startup" && startupPackBufferPromise) {
        const startupPack = await startupPackBufferPromise;
        if (startupPack) {
            return startupPack.slice(offset, offset + size);
        }
    }
    const chunkSize = manifest.chunkSize || (1024 * 1024);
    const firstChunk = Math.floor(offset / chunkSize);
    const lastChunk = Math.floor((offset + size - 1) / chunkSize);
    const chunks = await Promise.all(
        Array.from({ length: lastChunk - firstChunk + 1 }, (_, index) => getPackChunk(packName, firstChunk + index))
    );
    const result = new Uint8Array(size);
    let written = 0;
    for (let chunkNumber = firstChunk; chunkNumber <= lastChunk; chunkNumber += 1) {
        const chunk = new Uint8Array(chunks[chunkNumber - firstChunk]);
        const chunkStart = chunkNumber * chunkSize;
        const copyStart = Math.max(offset, chunkStart);
        const copyEnd = Math.min(offset + size, chunkStart + chunk.byteLength);
        const sourceStart = copyStart - chunkStart;
        const sourceEnd = copyEnd - chunkStart;
        result.set(chunk.subarray(sourceStart, sourceEnd), written);
        written += (sourceEnd - sourceStart);
    }
    return result.buffer;
}

async function prefetchPack(packName) {
    const manifest = await loadPackManifest();
    if (!manifest || !manifest.packs || !manifest.packs[packName] || prefetchedPacks.has(packName)) {
        return;
    }
    prefetchedPacks.add(packName);
    const pack = manifest.packs[packName];
    const chunkSize = manifest.chunkSize || (1024 * 1024);
    const chunkCount = Math.ceil(pack.size / chunkSize);
    for (let chunkIndex = 0; chunkIndex < chunkCount; chunkIndex += 1) {
        try {
            await getPackChunk(packName, chunkIndex);
        } catch (error) {
            console.warn(`Failed to prefetch pack ${packName} chunk ${chunkIndex}`, error);
            break;
        }
        if (chunkIndex % 4 === 0) {
            await new Promise((resolve) => window.setTimeout(resolve, 0));
        }
    }
}

async function fetchAsset(path) {
    const resolved = await resolveAssetPath(path);
    if (!resolved) {
        throw new Error(`Asset not found in manifest: ${path}`);
    }
    if (!assetCache.has(resolved)) {
        assetCache.set(resolved, (async () => {
            const archiveBuffer = await fetchArchiveCachedAsset(resolved);
            if (archiveBuffer) {
                return archiveBuffer;
            }
            const packedBuffer = await fetchPackedAsset(resolved);
            if (packedBuffer) {
                return packedBuffer;
            }
            const response = await fetch(buildAssetUrl(resolved), {
                cache: "force-cache",
                credentials: "same-origin",
            });
            if (!response.ok) {
                assetCache.delete(resolved);
                throw new Error(`Failed to fetch ${resolved}: ${response.status}`);
            }
            return await response.arrayBuffer();
        })());
    }
    return assetCache.get(resolved);
}

async function getPreloadFiles() {
    if (!preloadPromise) {
        preloadPromise = Promise.all([
            fetch(preloadListUrl, { cache: "force-cache" }).then((response) => response.text()),
            loadAssetManifest(),
        ]).then(([text, manifest]) => {
            const seen = new Set();
            const resolved = [];
            for (const rawLine of text.replace(/\r/g, "").split("\n")) {
                const line = rawLine.trim();
                if (!line || line[0] === "#") {
                    continue;
                }
                for (const entry of splitResourceLine(line)) {
                    const normalized = normalizePath(entry);
                    const actualPath = manifest.fileSet.has(normalized)
                        ? normalized
                        : manifest.lowerMap.get(normalized.toLowerCase());
                    if (!actualPath) {
                        continue;
                    }
                    const key = actualPath.toLowerCase();
                    if (seen.has(key)) {
                        continue;
                    }
                    seen.add(key);
                    resolved.push(actualPath);
                }
            }
            return resolved;
        });
    }
    return preloadPromise;
}

async function loadData() {
};

async function startGame(e) {
    e.stopPropagation();
    if (startRequested) {
        return;
    }
    if (!localArchiveReady) {
        setArchiveStatus("Сначала установите архив ресурсов в локальный кэш браузера.", true);
        updatePlayButtonState();
        return;
    }
    if (!await ensureProfileReady()) {
        return;
    }
    startRequested = true;
    updateToken('');
    if (clickToPlayButton) {
        clickToPlayButton.disabled = true;
        clickToPlayButton.textContent = "Запуск...";
    }
    setLoaderState({
        visible: true,
        title: "Загрузка движка",
        detail: "Подготавливаем запуск игры.",
        progress: 0.02,
    });
    loadGame();
}

function setStatus(text) {
    console.log(text);
};

async function loadGame() {
    var Module = {
        initFS: async () => {
            const files = await getPreloadFiles();
            const packManifest = localArchiveReady ? null : await loadPackManifest();
            const startupEntries = new Map();
            let startupBuffer = null;
            if (packManifest && packManifest.files && packManifest.packs && packManifest.packs.startup) {
                let startupTotalBytes = 0;
                for (const file of files) {
                    const entry = packManifest.files[file];
                    if (!entry || entry[0] !== "startup") {
                        continue;
                    }
                    startupEntries.set(file, entry);
                    startupTotalBytes += entry[2];
                }
                startupBuffer = await fetchStartupPackBuffer((loadedBytes, totalBytes) => {
                    const knownTotal = totalBytes || startupTotalBytes || loadedBytes;
                    setLoaderState({
                        visible: true,
                        title: "Загрузка стартовых ресурсов",
                        detail: `${formatMegabytes(loadedBytes)} / ${formatMegabytes(knownTotal)}`,
                        progress: knownTotal ? Math.min(0.92, 0.05 + (loadedBytes / knownTotal) * 0.87) : 0.1,
                    });
                });
            }
            let loaded = 0;

            setLoaderState({
                visible: true,
                title: "Загрузка стартовых ресурсов",
                detail: startupBuffer ? `0 / ${files.length}` : `0 / ${files.length}`,
                progress: startupBuffer ? 0.92 : 0.1,
            });

            for (const file of files) {
                let buffer;
                const startupEntry = startupEntries.get(file);
                if (startupBuffer && startupEntry) {
                    buffer = startupBuffer.slice(startupEntry[1], startupEntry[1] + startupEntry[2]);
                } else {
                    buffer = await fetchAsset(file);
                }
                const bytes = new Uint8Array(buffer);
                const parts = file.split('/');
                let path = '';
                for (let i = 0; i < parts.length - 1; i++) {
                    path += '/' + parts[i];
                    try {
                        Module.FS.mkdir(path);
                    } catch (_) {
                        // Directory already exists, ignore error
                    }
                }
                Module.FS.createDataFile(file, 0, bytes, bytes.length);
                loaded += 1;
                const progress = startupBuffer
                    ? (files.length ? 0.92 + (loaded / files.length) * 0.08 : 1)
                    : (files.length ? Math.min(1, 0.05 + (loaded / files.length) * 0.95) : 1);
                setLoaderState({
                    visible: true,
                    title: "Загрузка стартовых ресурсов",
                    detail: `${loaded} / ${files.length}`,
                    progress,
                });
            }

            if (!isMobile) {
                try {
                    if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
                        await document.documentElement.requestFullscreen();
                    }
                } catch (_) {}
                function lockMouseIfNeeded() {
                    if (!document.pointerLockElement && typeof Module !== 'undefined' && Module.canvas) {
                        Module.canvas.requestPointerLock({
                            unadjustedMovement: true,
                        }).catch(() => {
                            console.warn('Failed to lock in unadjusted movement mode');
                            Module.canvas.requestPointerLock().catch(() => {
                                console.error('Failed to lock in default mode');
                            });
                        });
                    }
                }
                document.addEventListener("mousedown", lockMouseIfNeeded, { capture: true });
                if (navigator.keyboard && navigator.keyboard.lock) {
                    navigator.keyboard.lock(["Escape", "KeyW"]);
                }
            }
        },
        getAsyncUrl: async (file) => {
            const buffer = await fetchAsset(file);
            return URL.createObjectURL(new Blob([buffer]));
        },
        mainCalled: async () => {
            try {
                Module.FS.mkdir("/vc-assets");
                Module.FS.mkdir("/vc-assets/local");

                await Module.initFS();

                try {
                    Module.FS.unlink("/vc-assets/local/revc.ini");
                } catch (e) {
                    // ignore
                }
                Module.FS.createDataFile("/vc-assets/local/revc.ini", 0, revc_ini, revc_ini.length);
                setLoaderState({
                    visible: true,
                    title: "Запуск игры",
                    detail: "Движок запущен, открываем игру.",
                    progress: 1,
                });
                await dismissStartupOverlay();
                window.setTimeout(() => {
                    Module['_async_main']();
                }, 0);
            } catch (e) {
                console.error('mainCalled error:', e);
            }
        },
        syncRevcIni: () => {
            try {
                const path = Module.FS.lookupPath("/vc-assets/local/revc.ini");
                if (path && path.node && path.node.contents) {
                    localStorage.setItem('vcsky.revc.ini', textDecoder.decode(path.node.contents));
                }
            } catch (e) {
                console.error('syncRevcIni error:', e);
            }
        },
        preRun: [],
        postRun: [],
        print: (...args) => console.log(args.join(' ')),
        printErr: (...args) => console.error(args.join(' ')),
        canvas: function () {
            const canvas = document.getElementById('canvas');
            canvas.addEventListener('webglcontextlost', (e) => {
                if (statusElement) {
                    statusElement.textContent = 'WebGL context lost. Please reload the page.';
                }
                e.preventDefault();
            });
            return canvas;
        }(),
        setStatus,
        totalDependencies: 0,
        monitorRunDependencies: (num) => {
            Module.totalDependencies = Math.max(Module.totalDependencies, num);
            Module.setStatus(`Preparing... (${Module.totalDependencies - num}/${Module.totalDependencies})`);
        },
        hotelMission: () => {
            if (!haveOriginalGame) {
                showWasted();
                alert(t("cantContinuePlaying"));
                throw new Error(t("cantContinuePlaying"));
            }
        },
    };
    Module.log = Module.print;
    Module.instantiateWasm = async (
        info,
        receiveInstance,
    ) => {
        setLoaderState({
            visible: true,
            title: "Загрузка движка",
            detail: "Загружаем WebAssembly модуль игры.",
            progress: 0.04,
        });
        const wasm = await (await fetch(wasm_content ? wasm_content : "index.wasm")).arrayBuffer();
        const module = await WebAssembly.instantiate(wasm, info);
        return receiveInstance(module.instance, module);
    };
    Module.arguments = window.location.search
        .slice(1)
        .split('&')
        .filter(Boolean)
        .map(decodeURIComponent);
    window.onbeforeunload = function (event) {
        event.preventDefault();
        return '';
    };

    window.Module = Module;
    const script = document.createElement('script');
    script.async = true;
    script.src = 'index.js';
    document.body.appendChild(script);

    document.body.classList.add('gameIsStarted');

    const emulator = new GamepadEmulator();
    const gamepad = emulator.AddEmulatedGamepad(null, true);
    const gamepadEmulatorConfig = {
        directions: { up: true, down: true, left: true, right: true },
        dragDistance: 100,
        tapTarget: move,
        lockTargetWhilePressed: true,
        xAxisIndex: 0,
        yAxisIndex: 1,
        swapAxes: false,
        invertX: false,
        invertY: false,
    };
    emulator.AddDisplayJoystickEventListeners(0, [gamepadEmulatorConfig]);
    const gamepadEmulatorConfig1 = {
        directions: { up: true, down: true, left: true, right: true },
        dragDistance: 100,
        tapTarget: look,
        lockTargetWhilePressed: true,
        xAxisIndex: 2,
        yAxisIndex: 3,
        swapAxes: false,
        invertX: false,
        invertY: false,
    };
    emulator.AddDisplayJoystickEventListeners(0, [gamepadEmulatorConfig1]);

    emulator.AddDisplayButtonEventListeners(0, [{
        buttonIndex: 9,
        lockTargetWhilePressed: false,
        tapTarget: document.querySelector('.touch-control.menu'),
    }]);
    emulator.AddDisplayButtonEventListeners(0, [{
        buttonIndex: 3,
        lockTargetWhilePressed: false,
        tapTarget: document.querySelector('.touch-control.car.getIn'),
    }]);
    emulator.AddDisplayButtonEventListeners(0, [{
        buttonIndex: 0,
        lockTargetWhilePressed: false,
        tapTarget: document.querySelector('.touch-control.run'),
    }]);
    emulator.AddDisplayButtonEventListeners(0, [{
        buttonIndex: 1,
        lockTargetWhilePressed: false,
        tapTarget: document.querySelector('.touch-control.fist'),
    }]);
    emulator.AddDisplayButtonEventListeners(0, [{
        buttonIndex: 5,
        lockTargetWhilePressed: false,
        tapTarget: document.querySelector('.touch-control.drift'),
    }]);
    emulator.AddDisplayButtonEventListeners(0, [{
        buttonIndex: 2,
        lockTargetWhilePressed: false,
        tapTarget: document.querySelector('.touch-control.jump'),
    }]);
    emulator.AddDisplayButtonEventListeners(0, [{
        buttonIndex: 4,
        lockTargetWhilePressed: false,
        tapTarget: document.querySelector('.touch-control.mobile'),
    }]);
    emulator.AddDisplayButtonEventListeners(0, [{
        buttonIndex: 11,
        lockTargetWhilePressed: false,
        tapTarget: document.querySelector('.touch-control.job'),
    }]);
    emulator.AddDisplayButtonEventListeners(0, [{
        buttonIndex: 4,
        lockTargetWhilePressed: false,
        tapTarget: document.querySelector('.touch-control.radio'),
    }]);
    emulator.AddDisplayButtonEventListeners(0, [{
        buttonIndex: 7,
        lockTargetWhilePressed: false,
        tapTarget: document.querySelector('.touch-control.weapon'),
    }]);
    emulator.AddDisplayButtonEventListeners(0, [{
        buttonIndex: 8,
        lockTargetWhilePressed: false,
        tapTarget: document.querySelector('.touch-control.camera'),
    }]);
    emulator.AddDisplayButtonEventListeners(0, [{
        buttonIndex: 10,
        lockTargetWhilePressed: false,
        tapTarget: document.querySelector('.touch-control.horn'),
    }]);
    emulator.AddDisplayButtonEventListeners(0, [{
        buttonIndex: 7,
        buttonIndexes: [1, 7],
        lockTargetWhilePressed: false,
        tapTarget: document.querySelector('.touch-control.fireRight'),
    }]);
    emulator.AddDisplayButtonEventListeners(0, [{
        buttonIndex: 6,
        buttonIndexes: [1, 6],
        lockTargetWhilePressed: false,
        tapTarget: document.querySelector('.touch-control.fireLeft'),
    }]);
}

const clickToPlay = document.querySelector('.click-to-play');
clickToPlay.addEventListener('click', (e) => {
    if (e.target === clickToPlayButton) {
        startGame(e);
    }
});

const savesMountPoint = "/vc-assets/local/userfiles";
const savesFile = "vcsky.saves";
wrapIDBFS(console.log).addListener({
    onLoad: async (_, mount) => {
        if (mount.mountpoint !== savesMountPoint || !serverSaveUrl) {
            return null;
        }

        try {
            const response = await fetch(serverSaveUrl, {
                cache: "no-store",
                credentials: "same-origin",
            });
            if (response.status === 204 || response.status === 404) {
                return null;
            }
            if (!response.ok) {
                throw new Error(`Failed to load server save: ${response.status}`);
            }
            const payload = new Uint8Array(await response.arrayBuffer());
            console.log("[ServerSave] onLoad", serverSaveKey, payload.length / 1024, "kb");
            return payload;
        } catch (error) {
            console.error("[ServerSave] onLoad error", error);
            return null;
        }
    },
    onSave: (getData, _, mount) => {
        if (mount.mountpoint !== savesMountPoint || !serverSaveUrl) {
            return;
        }

        getData().then(async (payload) => {
            if (!payload || payload.length === 0) {
                return;
            }

            try {
                const response = await fetch(serverSaveUrl, {
                    method: "PUT",
                    credentials: "same-origin",
                    headers: {
                        "Content-Type": "application/octet-stream",
                    },
                    body: payload,
                });
                if (!response.ok) {
                    throw new Error(`Failed to save on server: ${response.status}`);
                }
                console.log("[ServerSave] onSave", serverSaveKey, payload.length / 1024, "kb");
            } catch (error) {
                console.error("[ServerSave] onSave error", error);
            }
        });
    },
});


function updateToken(token) {
    if (!cloudSavesStatus || !keyStatus) {
        return;
    }
    cloudSavesStatus.textContent = t('cloudSaves');
    keyStatus.textContent = usingServerSaves ? t('enabled') : t('disabled');
    keyStatus.style.color = usingServerSaves ? 'green' : 'red';
    keyStatus.style.fontWeight = 'bold';
}

const keyInput = document.querySelector('.jsdos-key-input');
const keyStatus = document.querySelector('.jsdos-key-status');
if (keyInput) {
    keyInput.style.display = 'none';
}

const clickToPlayButton = document.getElementById('click-to-play-button');
if (profileInput) {
    profileInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            event.preventDefault();
            startGame(event);
        }
    });
}
if (installServerButton) {
    installServerButton.addEventListener('click', async () => {
        try {
            await installArchiveFromServer();
        } catch (_) {}
    });
}
if (installFileButton && archiveFileInput) {
    installFileButton.addEventListener('click', () => {
        archiveFileInput.click();
    });
    archiveFileInput.addEventListener('change', async (event) => {
        const file = event.target.files && event.target.files[0];
        if (!file) {
            return;
        }
        try {
            await installArchiveFromFile(file);
        } catch (_) {
            // Error text is already shown in the status block.
        } finally {
            archiveFileInput.value = "";
        }
    });
}
window.addEventListener("vicecityarchive:status", (event) => {
    const detail = event.detail || {};
    if (detail.installing) {
        setArchiveStatus("Подготавливаем локальный кэш ресурсов...");
        return;
    }
    if (detail.installed) {
        refreshArchiveState().catch((error) => {
            console.error("Failed to refresh archive state after install event", error);
        });
    }
});
updatePlayButtonState();
refreshArchiveState().catch((error) => {
    console.error("Failed to initialize archive state", error);
});
ensureServerArchiveAvailable().catch((error) => {
    console.error("Failed to check server archive", error);
});
const cloudSavesLink = document.getElementById('cloud-saves-link');
if (cloudSavesLink) {
    cloudSavesLink.textContent = t('cloudSaves');
    cloudSavesLink.removeAttribute('href');
}
updateToken('');
if (developedBy) {
    developedBy.innerHTML += t('ruTranslate');
}
const portBy = document.getElementById('port-by');
if (portBy) {
    portBy.textContent = t('portBy');
}

function stripDosZoneBranding(root = document.body) {
    if (!root || !root.querySelectorAll) {
        return;
    }
    const patterns = [
        /vice\s*city\s*by\s*dos\s*zone\s*team/i,
        /dos\.zone\/revcdos/i,
        /@dos\s*zone\s*team/i,
        /dos\s*zone\s*team,\s*2025/i,
    ];
    for (const node of root.querySelectorAll('*')) {
        const text = (node.textContent || '').trim();
        if (!text) {
            continue;
        }
        if (!patterns.some((pattern) => pattern.test(text))) {
            continue;
        }
        if (node === document.body || node === document.documentElement) {
            continue;
        }
        node.remove();
    }
}

const brandingObserver = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
            if (node.nodeType !== Node.ELEMENT_NODE) {
                continue;
            }
            stripDosZoneBranding(node);
        }
    }
});

stripDosZoneBranding();
brandingObserver.observe(document.body, { childList: true, subtree: true });
window.setInterval(() => stripDosZoneBranding(), 1500);


const revc_iniDefault = `
[VideoMode]
Width=800
Height=600
Depth=32
Subsystem=0
Windowed=0
[Controller]
HeadBob1stPerson=0
HorizantalMouseSens=0.002500
InvertMouseVertically=1
DisableMouseSteering=1
Vibration=0
Method=${isTouch ? '1' : '0'}
InvertPad=0
JoystickName=
PadButtonsInited=0
[Audio]
SfxVolume=36
MusicVolume=37
MP3BoostVolume=0
Radio=0
SpeakerType=0
Provider=0
DynamicAcoustics=1
[Display]
Brightness=256
DrawDistance=1.800000
Subtitles=0
ShowHud=1
RadarMode=0
ShowLegends=0
PedDensity=1.200000
CarDensity=1.200000
CutsceneBorders=1
FreeCam=0
[Graphics]
AspectRatio=0
VSync=1
Trails=1
FrameLimiter=0
MultiSampling=0
IslandLoading=0
PS2AlphaTest=1
ColourFilter=2
MotionBlur=0
VehiclePipeline=0
NeoRimLight=0
NeoLightMaps=0
NeoRoadGloss=0
[General]
SkinFile=$$""
Language=0
DrawVersionText=0
NoMovies=0
[CustomPipesValues]
PostFXIntensity=1.000000
NeoVehicleShininess=1.000000
NeoVehicleSpecularity=1.000000
RimlightMult=1.000000
LightmapMult=1.000000
GlossMult=1.000000
[Rendering]
BackfaceCulling=1
NewRenderer=1
[Draw]
ProperScaling=1
FixRadar=1
FixSprites=1
[Bindings]
PED_FIREWEAPON=mouse:LEFT,2ndKbd:PAD5
PED_CYCLE_WEAPON_RIGHT=2ndKbd:PADENTER,mouse:WHLDOWN,kbd:E
PED_CYCLE_WEAPON_LEFT=kbd:PADDEL,mouse:WHLUP,2ndKbd:Q
GO_FORWARD=kbd:UP,2ndKbd:W
GO_BACK=kbd:DOWN,2ndKbd:S
GO_LEFT=2ndKbd:A,kbd:LEFT
GO_RIGHT=kbd:RIGHT,2ndKbd:D
PED_SNIPER_ZOOM_IN=kbd:PGUP,2ndKbd:Z,mouse:WHLUP
PED_SNIPER_ZOOM_OUT=kbd:PGDN,2ndKbd:X,mouse:WHLDOWN
VEHICLE_ENTER_EXIT=kbd:ENTER,2ndKbd:F
CAMERA_CHANGE_VIEW_ALL_SITUATIONS=kbd:HOME,2ndKbd:V
PED_JUMPING=kbd:RCTRL,2ndKbd:SPC
PED_SPRINT=2ndKbd:LSHIFT,kbd:RSHIFT
PED_LOOKBEHIND=2ndKbd:CAPSLK,mouse:MIDDLE,kbd:PADINS
PED_DUCK=kbd:C
PED_ANSWER_PHONE=kbd:TAB
VEHICLE_FIREWEAPON=kbd:PADINS,2ndKbd:LCTRL,mouse:LEFT
VEHICLE_ACCELERATE=2ndKbd:W
VEHICLE_BRAKE=2ndKbd:S
VEHICLE_CHANGE_RADIO_STATION=kbd:INS,2ndKbd:R
VEHICLE_HORN=2ndKbd:LSHIFT,kbd:RSHIFT
TOGGLE_SUBMISSIONS=kbd:PLUS,2ndKbd:CAPSLK
VEHICLE_HANDBRAKE=kbd:RCTRL,2ndKbd:SPC,mouse:RIGHT
PED_1RST_PERSON_LOOK_LEFT=kbd:PADLEFT
PED_1RST_PERSON_LOOK_RIGHT=kbd:PADHOME
VEHICLE_LOOKLEFT=kbd:PADEND,2ndKbd:Q
VEHICLE_LOOKRIGHT=kbd:PADDOWN,2ndKbd:E
VEHICLE_LOOKBEHIND=mouse:MIDDLE
VEHICLE_TURRETLEFT=kbd:PADLEFT
VEHICLE_TURRETRIGHT=kbd:PAD5
VEHICLE_TURRETUP=kbd:PADPGUP,2ndKbd:UP
VEHICLE_TURRETDOWN=kbd:PADRIGHT,2ndKbd:DOWN
PED_CYCLE_TARGET_LEFT=kbd:[,2ndKbd:PADEND
PED_CYCLE_TARGET_RIGHT=2ndKbd:],kbd:PADDOWN
PED_CENTER_CAMERA_BEHIND_PLAYER=kbd:#
PED_LOCK_TARGET=kbd:DEL,mouse:RIGHT,2ndKbd:PADRIGHT
NETWORK_TALK=kbd:T
PED_1RST_PERSON_LOOK_UP=kbd:PADPGUP
PED_1RST_PERSON_LOOK_DOWN=kbd:PADUP
_CONTROLLERACTION_36=
TOGGLE_DPAD=
SWITCH_DEBUG_CAM_ON=
TAKE_SCREEN_SHOT=
SHOW_MOUSE_POINTER_TOGGLE=
UNKNOWN_ACTION=

`;

const revc_ini = (() => {
    const cached = localStorage.getItem('vcsky.revc.ini');
    if (cached) {
        return cached;
    }
    return revc_iniDefault;
})();
