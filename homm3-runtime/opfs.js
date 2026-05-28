import { opfsFlush, opfsList, opfsRead, opfsUnlink, opfsWrite } from "./opfs-worker.js";

export const VCMI_OPFS_ROOT = "/home/web_user/.local/share/vcmi";
const OPFS_STATS_FILE = ".emscripten-opfs-stats";

function normalizeRelativePath(value) {
  return String(value || "")
    .replaceAll("\\", "/")
    .replace(/\/+/g, "/")
    .replace(/^\/+/, "")
    .trim();
}

function toUint8Array(value) {
  if (value instanceof Uint8Array) {
    return value;
  }
  if (value instanceof ArrayBuffer) {
    return new Uint8Array(value);
  }
  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength));
  }
  return new Uint8Array(value || []);
}

function matchesPrefix(path, prefix) {
  if (!prefix) {
    return true;
  }
  return path === prefix || path.startsWith(`${prefix}/`);
}

async function resolveRawDirectory(rootPath, options = {}) {
  const create = !!options.create;
  let dir = await navigator.storage.getDirectory();
  for (const part of normalizeRelativePath(rootPath).split("/").filter(Boolean)) {
    dir = await dir.getDirectoryHandle(part, { create });
  }
  return dir;
}

export async function repairMetadata(rootPath = VCMI_OPFS_ROOT) {
  let rootDir;
  try {
    rootDir = await resolveRawDirectory(rootPath, { create: false });
  } catch (_) {
    return { repaired: false, fileCount: 0 };
  }

  const meta = { nodes: {} };
  let fileCount = 0;

  const walk = async (dirHandle, prefix = "") => {
    for await (const [name, handle] of dirHandle.entries()) {
      if (name === OPFS_STATS_FILE) {
        continue;
      }
      const nextPath = prefix ? `${prefix}/${name}` : name;
      if (handle.kind === "directory") {
        meta.nodes[nextPath] = {
          t: Date.now(),
          m: 0o040755,
          d: true,
          l: 0
        };
        await walk(handle, nextPath);
        continue;
      }
      const file = await handle.getFile();
      meta.nodes[nextPath] = {
        t: Number(file.lastModified || Date.now()),
        m: 0o100666,
        d: false,
        l: Number(file.size || 0)
      };
      fileCount += 1;
    }
  };

  await walk(rootDir, "");
  if (!fileCount) {
    return { repaired: false, fileCount: 0 };
  }

  const statsHandle = await rootDir.getFileHandle(OPFS_STATS_FILE, { create: true });
  const writer = await statsHandle.createWritable();
  await writer.write(new TextEncoder().encode(JSON.stringify(meta)));
  await writer.close();
  return { repaired: true, fileCount };
}

export async function flushRoot(rootPath = VCMI_OPFS_ROOT) {
  await opfsFlush(rootPath);
}

export async function writeFile(rootPath, relativePath, bytes) {
  const normalizedPath = normalizeRelativePath(relativePath);
  const payload = toUint8Array(bytes);
  await opfsWrite(rootPath, normalizedPath, 0, payload.slice(0), payload.byteLength);
  await flushRoot(rootPath);
}

export async function createWritableFile(rootPath, relativePath) {
  const normalizedPath = normalizeRelativePath(relativePath);
  let offset = 0;

  return new WritableStream({
    async write(chunk) {
      const payload = toUint8Array(chunk);
      await opfsWrite(rootPath, normalizedPath, offset, payload.slice(0), undefined);
      offset += payload.byteLength;
    },
    async close() {
      await flushRoot(rootPath);
    },
    async abort() {
      await flushRoot(rootPath);
    }
  });
}

export async function readFile(rootPath, relativePath) {
  const normalizedPath = normalizeRelativePath(relativePath);
  const result = await opfsRead(rootPath, normalizedPath, 0);
  return result && result.contents instanceof Uint8Array
    ? result.contents
    : new Uint8Array(result?.contents || []);
}

export async function listFiles(rootPath = VCMI_OPFS_ROOT, options = {}) {
  const prefix = normalizeRelativePath(options.prefix || "");
  const entries = await opfsList(rootPath);

  return Object.entries(entries || {})
    .map(([absolutePath, meta]) => {
      const relativePath = normalizeRelativePath(String(absolutePath || "").replace(`${rootPath}/`, ""));
      return {
        path: relativePath,
        size: Number(meta?.length || 0),
        lastModified: meta?.timestamp ? new Date(meta.timestamp).getTime() : 0,
        isDir: meta?.isDir === true
      };
    })
    .filter((entry) => entry.path && !entry.isDir && matchesPrefix(entry.path, prefix))
    .sort((left, right) => left.path.localeCompare(right.path, "ru"));
}

export async function removeEntry(rootPath, relativePath) {
  const normalizedPath = normalizeRelativePath(relativePath);
  if (!normalizedPath) {
    return;
  }
  try {
    await opfsUnlink(rootPath, normalizedPath);
    await flushRoot(rootPath);
  } catch (_) {}
}

export async function clearDirectories(rootPath, directories = []) {
  const targets = Array.from(new Set((directories || []).map((value) => normalizeRelativePath(value)).filter(Boolean)));
  if (!targets.length) {
    return;
  }

  const entries = await opfsList(rootPath);
  const paths = Object.entries(entries || {})
    .map(([absolutePath, meta]) => ({
      path: normalizeRelativePath(String(absolutePath || "").replace(`${rootPath}/`, "")),
      isDir: meta?.isDir === true
    }))
    .filter((entry) => entry.path && targets.some((target) => matchesPrefix(entry.path, target)))
    .sort((left, right) => right.path.length - left.path.length);

  for (const entry of paths) {
    try {
      await opfsUnlink(rootPath, entry.path);
    } catch (_) {}
  }

  await flushRoot(rootPath);
}
