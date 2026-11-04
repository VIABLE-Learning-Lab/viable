/**
 * A minimal ZIP reader: the central directory, then stored or deflated entries, as text or, with
 * `binary`, as bytes, of at most maxBytes each and maxTotalBytes together (zip_entry_too_large, 413,
 * past either: a small zip can hold a huge file). Web APIs only (DecompressionStream), so VIABLE's API reads Office documents and course
 * packages with it, and a local run reads a .viable.zip. Entries are looked up by name and never
 * written to disk, so a name such as ../x can't reach outside the archive.
 */
const failure = (message, code, status) => Object.assign(new Error(message), { status, code });
const MIB = 1048576;
// Well past any document or package these read, and far short of what a small zip could make a server hold.
export const ZIP_READ_LIMITS = Object.freeze({ maxBytes: 64 * MIB, maxTotalBytes: 256 * MIB });

// A deflated entry's bytes, refused by tooLarge once it inflates past limit.
async function inflateBounded(raw, limit, tooLarge) {
  const reader = new Blob([raw]).stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader();
  const parts = [];
  let size = 0;
  for (let next = await reader.read(); !next.done; next = await reader.read()) {
    size += next.value.length;
    if (size > limit) { await reader.cancel(); throw tooLarge(); }
    parts.push(next.value);
  }
  return new Uint8Array(await new Blob(parts).arrayBuffer());
}

/** The entries whose name `wanted` accepts (at most 400), name → text, or bytes with `binary`. A caller that needs more than ZIP_READ_LIMITS says so. */
export async function readZip(bytes, wanted, { binary = false, maxBytes = ZIP_READ_LIMITS.maxBytes, maxTotalBytes = ZIP_READ_LIMITS.maxTotalBytes } = {}) {
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let eocd = -1;
  for (let i = data.length - 22; i >= Math.max(0, data.length - 65557); i -= 1) {
    if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw failure('This file is not a whole zip file.', 'zip_unreadable', 422);
  const count = view.getUint16(eocd + 10, true);
  let offset = view.getUint32(eocd + 16, true);
  const files = new Map();
  let room = maxTotalBytes;
  const entry = async (raw, method) => {
    const tooLarge = () => failure(maxBytes <= room ? `A file in the zip is larger than ${Math.floor(maxBytes / MIB)} MB.` : `The files in the zip come to more than ${Math.floor(maxTotalBytes / MIB)} MB.`, 'zip_entry_too_large', 413);
    const limit = Math.min(maxBytes, room);
    if (method === 0 && raw.length > limit) throw tooLarge();
    const out = method === 0 ? raw.slice() : await inflateBounded(raw, limit, tooLarge);
    room -= out.length;
    return out;
  };
  for (let i = 0; i < count && offset + 46 <= data.length; i += 1) {
    if (view.getUint32(offset, true) !== 0x02014b50) break;
    const method = view.getUint16(offset + 10, true);
    const size = view.getUint32(offset + 20, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const local = view.getUint32(offset + 42, true);
    const name = new TextDecoder().decode(data.subarray(offset + 46, offset + 46 + nameLength));
    offset += 46 + nameLength + extraLength + commentLength;
    if (!wanted(name) || files.size >= 400) continue;
    const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
    if (method !== 0 && method !== 8) continue;
    const out = await entry(data.subarray(start, start + size), method);
    files.set(name, binary ? out : new TextDecoder().decode(out));
  }
  return files;
}

const CRC_TABLE = Uint32Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = (bytes) => { let c = 0xffffffff; for (const byte of bytes) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };

/** A zip of [{ name, data }] (text or bytes), each entry deflated, what readZip reads back. Web APIs only. */
export async function writeZip(entries) {
  const encoder = new TextEncoder();
  const parts = [];
  const central = [];
  let offset = 0;
  for (const { name, data } of entries) {
    const bytes = typeof data === 'string' ? encoder.encode(data) : data;
    const packed = new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer());
    const fileName = encoder.encode(name);
    const local = new DataView(new ArrayBuffer(30));
    const entry = new DataView(new ArrayBuffer(46));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    entry.setUint32(0, 0x02014b50, true);
    entry.setUint16(4, 20, true);
    entry.setUint16(6, 20, true);
    for (const [view, at] of [[local, 8], [entry, 10]]) {
      view.setUint16(at, 8, true);
      view.setUint32(at + 6, crc32(bytes), true);
      view.setUint32(at + 10, packed.length, true);
      view.setUint32(at + 14, bytes.length, true);
      view.setUint16(at + 18, fileName.length, true);
    }
    entry.setUint32(42, offset, true);
    parts.push(new Uint8Array(local.buffer), fileName, packed);
    central.push(new Uint8Array(entry.buffer), fileName);
    offset += 30 + fileName.length + packed.length;
  }
  const size = central.reduce((total, part) => total + part.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, entries.length, true);
  end.setUint16(10, entries.length, true);
  end.setUint32(12, size, true);
  end.setUint32(16, offset, true);
  return new Uint8Array(await new Blob([...parts, ...central, new Uint8Array(end.buffer)]).arrayBuffer());
}
