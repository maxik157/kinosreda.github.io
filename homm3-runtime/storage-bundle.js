const MAGIC = "KSVCMI1";
const HEADER_SIZE = 8 + 4;
const encoder = new TextEncoder();
const decoder = new TextDecoder();

function normalizePath(value) {
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
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength).slice();
  }
  return new Uint8Array(value || []);
}

function writeUint32(view, offset, value) {
  view.setUint32(offset, value >>> 0, true);
  return offset + 4;
}

function readUint32(view, offset) {
  return view.getUint32(offset, true);
}

function normalizeEntries(entriesLike) {
  const entries = [];
  if (entriesLike instanceof Map) {
    for (const [path, bytes] of entriesLike.entries()) {
      entries.push({ path, bytes });
    }
  } else if (Array.isArray(entriesLike)) {
    for (const entry of entriesLike) {
      if (Array.isArray(entry)) {
        entries.push({ path: entry[0], bytes: entry[1] });
      } else {
        entries.push(entry);
      }
    }
  }

  return entries
    .map((entry) => ({
      path: normalizePath(entry.path),
      bytes: toUint8Array(entry.bytes)
    }))
    .filter((entry) => entry.path.length > 0)
    .sort((left, right) => left.path.localeCompare(right.path, "ru"));
}

export function encodeBundle(entriesLike) {
  const entries = normalizeEntries(entriesLike);
  let totalLength = HEADER_SIZE;
  const prepared = entries.map((entry) => {
    const pathBytes = encoder.encode(entry.path);
    totalLength += 8 + pathBytes.length + entry.bytes.length;
    return { pathBytes, bytes: entry.bytes };
  });

  const payload = new Uint8Array(totalLength);
  const view = new DataView(payload.buffer);
  payload.set(encoder.encode(`${MAGIC}\0`), 0);
  let offset = 8;
  offset = writeUint32(view, offset, prepared.length);

  for (const entry of prepared) {
    offset = writeUint32(view, offset, entry.pathBytes.length);
    offset = writeUint32(view, offset, entry.bytes.length);
    payload.set(entry.pathBytes, offset);
    offset += entry.pathBytes.length;
    payload.set(entry.bytes, offset);
    offset += entry.bytes.length;
  }

  return payload;
}

export function decodeBundle(payloadLike) {
  const payload = toUint8Array(payloadLike);
  const magic = decoder.decode(payload.subarray(0, 8)).replace(/\0+$/, "");
  if (magic !== MAGIC) {
    throw new Error("Неизвестный формат bundle.");
  }

  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
  const count = readUint32(view, 8);
  const entries = [];
  let offset = HEADER_SIZE;

  for (let index = 0; index < count; index += 1) {
    const pathLength = readUint32(view, offset);
    offset += 4;
    const dataLength = readUint32(view, offset);
    offset += 4;

    const pathBytes = payload.subarray(offset, offset + pathLength);
    offset += pathLength;
    const bytes = payload.slice(offset, offset + dataLength);
    offset += dataLength;

    entries.push({
      path: decoder.decode(pathBytes),
      bytes
    });
  }

  return entries;
}
