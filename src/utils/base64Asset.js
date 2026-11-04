// A base64 payload or data URI as bytes with its content type. Pure, for the engine and the asset store.
export function parseBase64Asset(value, fallbackContentType = 'application/octet-stream') {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error('Generated asset payload is missing base64 data.');
  }

  const trimmed = value.trim();
  const dataUriMatch = /^data:([^;,]+)(?:;[^,]*)?;base64,(.*)$/is.exec(trimmed);
  const contentType = dataUriMatch?.[1]?.toLowerCase() || fallbackContentType;
  const base64 = (dataUriMatch ? dataUriMatch[2] : trimmed).replace(/\s+/g, '');
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }

  return {
    bytes,
    contentType,
    byteLength: bytes.byteLength
  };
}
