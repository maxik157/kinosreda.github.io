(function () {
    const DB_NAME = "vice-city-archive-cache-v1";
    const DB_VERSION = 1;
    const FILE_STORE = "files";
    const META_STORE = "meta";
    const META_CATALOG = "catalog";
    const META_INSTALL = "install";

    function normalizeArchivePath(path) {
        return String(path || "")
            .trim()
            .replaceAll("\\", "/")
            .replace(/\/+/g, "/")
            .replace(/^\/+/, "")
            .toLowerCase();
    }

    function openDb() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);
            request.onupgradeneeded = () => {
                const db = request.result;
                if (!db.objectStoreNames.contains(FILE_STORE)) {
                    db.createObjectStore(FILE_STORE);
                }
                if (!db.objectStoreNames.contains(META_STORE)) {
                    db.createObjectStore(META_STORE);
                }
            };
            request.onerror = () => reject(request.error || new Error("Failed to open archive cache"));
            request.onsuccess = () => resolve(request.result);
        });
    }

    function transactionDone(tx) {
        return new Promise((resolve, reject) => {
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error || new Error("IndexedDB transaction failed"));
            tx.onabort = () => reject(tx.error || new Error("IndexedDB transaction aborted"));
        });
    }

    async function getMetaValue(key) {
        const db = await openDb();
        try {
            const tx = db.transaction(META_STORE, "readonly");
            const store = tx.objectStore(META_STORE);
            const request = store.get(key);
            const value = await new Promise((resolve, reject) => {
                request.onsuccess = () => resolve(request.result || null);
                request.onerror = () => reject(request.error || new Error(`Failed to read meta key ${key}`));
            });
            await transactionDone(tx);
            return value;
        } finally {
            db.close();
        }
    }

    async function putMetaValues(values) {
        const db = await openDb();
        try {
            const tx = db.transaction(META_STORE, "readwrite");
            const store = tx.objectStore(META_STORE);
            for (const [key, value] of Object.entries(values)) {
                store.put(value, key);
            }
            await transactionDone(tx);
        } finally {
            db.close();
        }
    }

    async function clearDatabase() {
        const db = await openDb();
        try {
            {
                const tx = db.transaction(FILE_STORE, "readwrite");
                tx.objectStore(FILE_STORE).clear();
                await transactionDone(tx);
            }
            {
                const tx = db.transaction(META_STORE, "readwrite");
                tx.objectStore(META_STORE).clear();
                await transactionDone(tx);
            }
        } finally {
            db.close();
        }
    }

    async function putFileBatch(batch) {
        if (!batch.length) {
            return;
        }
        const db = await openDb();
        try {
            const tx = db.transaction(FILE_STORE, "readwrite");
            const store = tx.objectStore(FILE_STORE);
            for (const item of batch) {
                store.put(item.blob, item.key);
            }
            await transactionDone(tx);
        } finally {
            db.close();
        }
    }

    async function getBlob(key) {
        const normalized = normalizeArchivePath(key);
        if (!normalized) {
            return null;
        }
        const db = await openDb();
        try {
            const tx = db.transaction(FILE_STORE, "readonly");
            const request = tx.objectStore(FILE_STORE).get(normalized);
            const value = await new Promise((resolve, reject) => {
                request.onsuccess = () => resolve(request.result || null);
                request.onerror = () => reject(request.error || new Error(`Failed to read file ${normalized}`));
            });
            await transactionDone(tx);
            return value;
        } finally {
            db.close();
        }
    }

    async function getArrayBuffer(key) {
        const blob = await getBlob(key);
        if (!blob) {
            return null;
        }
        if (blob instanceof Blob) {
            return await blob.arrayBuffer();
        }
        if (blob instanceof ArrayBuffer) {
            return blob;
        }
        if (ArrayBuffer.isView(blob)) {
            const view = blob;
            return view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength);
        }
        return null;
    }

    async function getCatalog() {
        return await getMetaValue(META_CATALOG);
    }

    async function hasInstall() {
        const catalog = await getCatalog();
        return !!(catalog && catalog.count > 0);
    }

    function emitStatus(detail) {
        window.dispatchEvent(new CustomEvent("vicecityarchive:status", { detail }));
    }

    function downloadBlobWithProgress(url, onProgress) {
        return new Promise((resolve, reject) => {
            const request = new XMLHttpRequest();
            request.open("GET", url, true);
            request.responseType = "blob";
            request.setRequestHeader("Cache-Control", "no-store");

            request.onprogress = (event) => {
                if (!onProgress) {
                    return;
                }
                onProgress({
                    phase: "download",
                    loaded: event.loaded || 0,
                    total: event.lengthComputable ? event.total : 0,
                });
            };

            request.onerror = () => reject(new Error("Archive download failed"));
            request.onabort = () => reject(new Error("Archive download aborted"));
            request.onload = () => {
                if (request.status !== 200 && request.status !== 206) {
                    reject(new Error(`Failed to download archive: ${request.status}`));
                    return;
                }
                const blob = request.response;
                if (!blob) {
                    reject(new Error("Archive download returned an empty response"));
                    return;
                }
                if (onProgress) {
                    const total = Number(request.getResponseHeader("Content-Length")) || 0;
                    onProgress({
                        phase: "download",
                        loaded: total || blob.size,
                        total: total || blob.size,
                    });
                }
                resolve(blob);
            };

            request.send();
        });
    }

    async function importZipReader(reader, sourceLabel, onProgress) {
        const archiveReader = new zip.ZipReader(reader);
        let entries = [];
        try {
            entries = await archiveReader.getEntries();
            const files = entries
                .filter((entry) => !entry.directory && entry.filename)
                .filter((entry) => normalizeArchivePath(entry.filename).startsWith("vc-assets/"));

            const catalog = {
                version: 1,
                source: sourceLabel,
                count: files.length,
                installedAt: new Date().toISOString(),
                entries: files.map((entry) => normalizeArchivePath(entry.filename)),
            };

            await clearDatabase();
            await putMetaValues({
                [META_INSTALL]: {
                    phase: "installing",
                    source: sourceLabel,
                    startedAt: new Date().toISOString(),
                },
            });

            const batch = [];
            let completed = 0;
            for (const entry of files) {
                const blob = await entry.getData(new zip.BlobWriter());
                batch.push({
                    key: normalizeArchivePath(entry.filename),
                    blob,
                });
                completed += 1;

                if (batch.length >= 24) {
                    await putFileBatch(batch.splice(0, batch.length));
                }

                if (onProgress) {
                    onProgress({
                        phase: "extract",
                        current: completed,
                        total: files.length,
                        filename: entry.filename,
                    });
                }
            }

            if (batch.length) {
                await putFileBatch(batch);
            }

            await putMetaValues({
                [META_CATALOG]: catalog,
                [META_INSTALL]: {
                    phase: "ready",
                    source: sourceLabel,
                    completedAt: new Date().toISOString(),
                    count: files.length,
                },
            });

            emitStatus({
                installed: true,
                installing: false,
                source: sourceLabel,
                count: files.length,
            });

            return catalog;
        } finally {
            try {
                await archiveReader.close();
            } catch (_) {}
        }
    }

    async function installFromBlob(blob, sourceLabel, onProgress) {
        zip.configure({ useWebWorkers: false });
        emitStatus({ installing: true, installed: false, source: sourceLabel });
        return await importZipReader(new zip.BlobReader(blob), sourceLabel, onProgress);
    }

    async function installFromUrl(url, onProgress) {
        zip.configure({ useWebWorkers: false });
        emitStatus({ installing: true, installed: false, source: url });
        const blob = await downloadBlobWithProgress(url, onProgress);
        return await importZipReader(new zip.BlobReader(blob), url, onProgress);
    }

    window.ViceCityArchiveCache = {
        normalizePath: normalizeArchivePath,
        openDb,
        getCatalog,
        getBlob,
        getArrayBuffer,
        hasInstall,
        installFromBlob,
        installFromUrl,
        clear: clearDatabase,
    };
})();
