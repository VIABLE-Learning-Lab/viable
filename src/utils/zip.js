/**
 * A minimal ZIP reader: the central directory, then stored or deflated entries, as text or, with
 * `binary`, as bytes of at most maxBytes each (zip_entry_too_large, 413, past it: a small zip can hold
 * a huge file). Web APIs only (DecompressionStream), so VIABLE's API reads Office documents and course
 * packages with it, and a local run reads a .viable.zip. Entries are looked up by name and never
 * written to disk, so a name such as ../x can't reach outside the archive.
 */
const failure = (message, code, status) => Object.assign(new Error(message), { status, code });
const tooLarge = (maxBytes) => failure(`A file in the zip is larger than ${Math.floor(maxBytes / 1048576)} MB.`, 'zip_entry_too_large', 413);

// A deflated entry's bytes, refused once it inflates past maxBytes.
async function inflateBounded(raw, maxBytes) {
  const reader = new Blob([raw]).stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader();
  const parts = [];
  let size = 0;
  for (let next = await reader.read(); !next.done; next = await reader.read()) {
    size += next.value.length;
    if (size > maxBytes) { await reader.cancel(); throw tooLarge(maxBytes); }
    parts.push(next.value);
  }
  return new Uint8Array(await new Blob(parts).arrayBuffer());
}

/** The entries whose name `wanted` accepts (at most 400), name → text, or bytes with `binary`. */
export async function readZip(bytes, wanted, { binary = false, maxBytes = Infinity } = {}) {
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
    const raw = data.subarray(start, start + size);
    if (binary && method === 0) { if (raw.length > maxBytes) throw tooLarge(maxBytes); files.set(name, raw.slice()); }
    else if (binary && method === 8) files.set(name, await inflateBounded(raw, maxBytes));
    else if (binary) continue;
    else if (method === 0) files.set(name, new TextDecoder().decode(raw));
    else if (method === 8) files.set(name, await new Response(new Blob([raw]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).text());
  }
  return files;
}
