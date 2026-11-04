/**
 * How request and response payloads are kept in logs and traces: credential-named fields redacted,
 * media and base64 data as references, never bytes. Pure, so the agent engine (step inputs in its
 * trace) and the request logs (logging.js) keep payloads the same way.
 */

export const REDACTED = '[REDACTED]';
const SENSITIVE_PAYLOAD_NAMES = new Set([
  'apikey',
  'xapikey',
  'authorization',
  'accesstoken',
  'refreshtoken',
  'idtoken',
  'authtoken',
  'bearertoken',
  'token',
  'password',
  'secret',
  'clientsecret',
  'privatekey',
  'credential',
  'credentials'
]);
const BINARY_PAYLOAD_NAMES = new Set([
  'b64json',
  'filedata',
  'inputaudio',
  'audiodata',
  'imagedata'
]);

export const DEFAULT_LOG_CONTENT_MODE = 'research';

export function sanitizeRequestPayloadForLogging(value, options = {}) {
  return sanitizePayload(value, options);
}

function sanitizePayload(value, options = {}) {
  const mode = options.mode || DEFAULT_LOG_CONTENT_MODE;
  if (value == null) return value;
  if (typeof value === 'string') return summarizeBinaryLikeString(value);
  if (typeof value !== 'object') return value;
  if (mode === 'redacted') return sanitizeRedactedPayload(value);
  return sanitizeResearchPayload(value);
}

function sanitizeResearchPayload(value) {
  if (value == null) return value;
  if (Array.isArray(value)) return value.map((item) => sanitizeResearchPayload(item));
  if (typeof value === 'string') return value.startsWith('data:') ? summarizeFileReference(value) : value;
  if (typeof value !== 'object') return value;
  if (isBinaryContentPart(value)) return summarizeBinaryContentPart(value);

  const sanitized = {};
  for (const [key, child] of Object.entries(value)) {
    if (isSensitivePayloadName(key)) {
      sanitized[key] = REDACTED;
    } else if (isBinaryPayloadName(key) && typeof child === 'string') {
      sanitized[key] = summarizeBinaryLikeString(child);
    } else {
      sanitized[key] = sanitizeResearchPayload(child);
    }
  }
  return sanitized;
}

function isBinaryContentPart(value) {
  return value && typeof value === 'object' && (
    value.type === 'image_url' ||
    value.type === 'input_image' ||
    value.type === 'file' ||
    value.type === 'input_file'
  );
}

function summarizeBinaryContentPart(part) {
  const researchAsset = part.research_asset?.asset_id
    ? sanitizeResearchPayload(part.research_asset)
    : null;
  if (part.type === 'image_url' || part.type === 'input_image') {
    const url = part.image_url?.url || part.image_url || part.url || '';
    const detail = part.image_url?.detail || part.detail || null;
    return {
      type: part.type,
      image_url: {
        ...summarizeFileReference(url),
        ...(detail ? { detail } : {})
      },
      ...(researchAsset ? { research_asset: researchAsset } : {})
    };
  }
  const file = part.file || part.input_file || part;
  return {
    type: part.type,
    file: {
      filename: file.filename || file.name || null,
      mime_type: file.mime_type || file.mimeType || part.mime_type || null,
      source: summarizeFileReference(file.file_data || file.data || file.content || file.url || file.file_id || '')
    },
    ...(researchAsset ? { research_asset: researchAsset } : {})
  };
}

export function sanitizeResponsePayloadForLogging(value, options = {}) {
  const mode = options.mode || DEFAULT_LOG_CONTENT_MODE;
  if (value == null) return value;
  if (Array.isArray(value)) return value.map((item) => sanitizeResponsePayloadForLogging(item, options));
  if (typeof value === 'string') return mode === 'redacted' ? summarizeLargeString(value) : summarizeBinaryLikeString(value);
  if (typeof value !== 'object') return value;

  const sanitized = {};
  for (const [key, child] of Object.entries(value)) {
    if (isSensitivePayloadName(key)) {
      sanitized[key] = REDACTED;
    } else if (isBinaryPayloadName(key) && typeof child === 'string') {
      sanitized[key] = summarizeBase64String(child);
    } else if (key === 'data' && Array.isArray(child)) {
      sanitized[key] = child.map((item) => sanitizeResponsePayloadForLogging(item, options));
    } else {
      sanitized[key] = sanitizeResponsePayloadForLogging(child, options);
    }
  }
  return sanitized;
}

function sanitizeRedactedPayload(value) {
  if (value == null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((item) => sanitizeRedactedPayload(item));

  const sanitized = {};
  for (const [key, child] of Object.entries(value)) {
    if (isSensitivePayloadName(key)) {
      sanitized[key] = REDACTED;
    } else if (key === 'messages' && Array.isArray(child)) {
      sanitized[key] = child.map(sanitizeMessage);
    } else if (key === 'content' || key === 'input' || key === 'prompt') {
      sanitized[key] = summarizeContent(child);
    } else {
      sanitized[key] = sanitizeRedactedPayload(child);
    }
  }
  return sanitized;
}

function summarizeBase64String(value) {
  if (typeof value !== 'string') return value;
  const dataUriMatch = /^data:([^;,]+)(?:;[^,]*)?;base64,(.*)$/is.exec(value.trim());
  const base64 = (dataUriMatch ? dataUriMatch[2] : value).replace(/\s+/g, '');
  return {
    redacted: true,
    type: 'base64',
    mime_type: dataUriMatch?.[1]?.toLowerCase() || null,
    length: value.length,
    bytesApprox: Math.floor((base64.length * 3) / 4)
  };
}

function summarizeBinaryLikeString(value) {
  if (typeof value !== 'string') return value;
  if (value.startsWith('data:')) return summarizeFileReference(value);
  return value;
}

function summarizeLargeString(value) {
  if (value.length <= 4096) return value;
  return {
    redacted: true,
    type: 'large_string',
    length: value.length
  };
}

function isSensitivePayloadName(name) {
  return SENSITIVE_PAYLOAD_NAMES.has(canonicalPayloadName(name));
}

function isBinaryPayloadName(name) {
  return BINARY_PAYLOAD_NAMES.has(canonicalPayloadName(name));
}

function canonicalPayloadName(name) {
  return String(name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function sanitizeMessage(message) {
  if (!message || typeof message !== 'object') return message;
  return {
    ...message,
    content: summarizeContent(message.content)
  };
}

function summarizeContent(content) {
  if (typeof content === 'string') {
    return { redacted: true, type: 'text', length: content.length };
  }
  if (Array.isArray(content)) {
    return content.map((part) => summarizeContentPart(part));
  }
  if (content && typeof content === 'object') {
    return { redacted: true, keys: Object.keys(content) };
  }
  return content;
}

function summarizeContentPart(part) {
  if (!part || typeof part !== 'object') return part;
  if (part.type === 'text' || part.type === 'input_text') {
    return { ...part, text: { redacted: true, length: part.text?.length || 0 } };
  }
  if (part.type === 'image_url' || part.type === 'input_image') {
    const url = part.image_url?.url || part.image_url || part.url || '';
    return {
      type: part.type,
      image_url: summarizeFileReference(url)
    };
  }
  if (part.type === 'file' || part.type === 'input_file') {
    const file = part.file || part.input_file || part;
    return {
      type: part.type,
      file: {
        filename: file.filename || file.name || null,
        mime_type: file.mime_type || file.mimeType || part.mime_type || null,
        data: summarizeFileReference(file.file_data || file.data || file.content || '')
      }
    };
  }
  return { ...part, redacted: true };
}

function summarizeFileReference(value) {
  if (typeof value !== 'string') return { redacted: true };
  if (value.startsWith('data:')) {
    const match = /^data:([^;,]+)(?:;[^,]*)?;base64,(.*)$/i.exec(value);
    return {
      redacted: true,
      kind: 'data_uri',
      mime_type: match?.[1]?.toLowerCase() || null,
      bytesApprox: match?.[2] ? Math.floor((match[2].length * 3) / 4) : null
    };
  }
  if (/^https?:\/\//i.test(value)) {
    return { kind: 'remote_url', url: value };
  }
  if (value.startsWith('viablelab-research-asset://')) return { kind: 'research_asset_ref', url: value };
  return { redacted: true, length: value.length };
}
