// Fetch only through Workers' public internet transport. Keep
// global_fetch_strictly_public enabled; never substitute a VPC/origin binding.
const MAX_BYTES = 256 * 1024;
const MAX_REDIRECTS = 3;

function failure(message, code) {
  return Object.assign(new Error(message), { status: 400, code });
}

function publicUrl(value, allowlist) {
  let url;
  try { url = new URL(value); } catch {
    throw failure('Fetch URL needs a complete HTTPS address.', 'invalid_http_url');
  }
  const host = url.hostname.toLowerCase().replace(/\.$/, '');
  // Reject IP literals (including URL-normalized decimal/hex IPv4), local names,
  // credentials and nonstandard ports. Workers also rejects private DNS targets
  // at connection time, avoiding a DNS-check/fetch rebinding race.
  if (url.protocol !== 'https:' || url.username || url.password || url.port ||
      !host.includes('.') || host.includes(':') || /^\d+\.\d+\.\d+\.\d+$/.test(host) ||
      /(^|\.)(localhost|local|internal|lan|home|test|invalid)$/.test(host)) {
    throw failure('Use a public HTTPS hostname on port 443, without URL credentials. Local addresses and IP literals are not supported.', 'http_url_not_allowed');
  }
  if (allowlist?.length && !allowlist.some(entry => {
    const allowed = String(entry).toLowerCase().replace(/^\*\./, '').replace(/\.$/, '');
    return host === allowed || host.endsWith(`.${allowed}`);
  })) throw failure('This URL is outside the operator-configured hostname restrictions.', 'http_host_not_allowed');
  url.hash = '';
  return url;
}

async function boundedText(response) {
  if (Number(response.headers.get('content-length')) > MAX_BYTES) {
    await response.body?.cancel();
    throw failure('The source is larger than 256 KiB. Choose a smaller page or API response.', 'http_response_too_large');
  }
  if (!response.body) return '';
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let size = 0;
  let text = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BYTES) {
        await reader.cancel();
        throw failure('The source is larger than 256 KiB. Choose a smaller page or API response.', 'http_response_too_large');
      }
      text += decoder.decode(value, { stream: true });
    }
    return text + decoder.decode();
  } finally { reader.releaseLock(); }
}

export async function htmlToText(html) {
  // Native parsing handles malformed markup; no browser or JavaScript execution.
  const cleaned = new HTMLRewriter()
    .on('script, style, noscript, template, svg, nav, footer, form, [hidden], [aria-hidden="true"]', { element: el => el.remove() })
    .transform(new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } }));
  const parts = [];
  await new HTMLRewriter()
    .on('p, div, section, article, h1, h2, h3, h4, h5, h6, li, tr, br', {
      element(el) { parts.push('\n'); if (el.tagName !== 'br') el.onEndTag(() => parts.push('\n')); }
    })
    .onDocument({ text: chunk => parts.push(chunk.text) })
    .transform(cleaned).text();
  return parts.join('').replace(/[\t ]+/g, ' ').replace(/ *\n\s*/g, '\n').trim();
}

export async function fetchAgentUrl(config, { httpFetch, httpAllowlist, httpDeadline }) {
  let url = publicUrl(config.url, httpAllowlist);
  // Preserve the historic runtime default for imported graphs. The editor and
  // templates explicitly use GET for new Fetch URL steps.
  const method = String(config.method || 'POST').toUpperCase();
  if (!['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
    throw failure('Unsupported Fetch URL request method.', 'invalid_http_method');
  }
  const readOnly = method === 'GET' || method === 'HEAD';
  if (readOnly && config.body != null) throw failure('GET and HEAD requests must have an empty request body.', 'invalid_http_body');
  let headers = new Headers(config.headers || { 'Content-Type': 'application/json' });
  if (['host', 'connection', 'content-length', 'transfer-encoding', 'upgrade', 'proxy-authorization'].some(name => headers.has(name))) {
    throw failure('Fetch URL cannot override transport or proxy headers.', 'invalid_http_headers');
  }
  const signal = AbortSignal.timeout(Math.max(1, Math.min(10000, (httpDeadline || Infinity) - Date.now())));
  const body = config.body != null ? JSON.stringify(config.body) : undefined;
  try {
    for (let hop = 0; ; hop++) {
      const response = await httpFetch(url.href, { method, headers, body, signal, redirect: 'manual' });
      const location = response.headers.get('location');
      if ([301, 302, 303, 307, 308].includes(response.status) && location) {
        await response.body?.cancel();
        if (!readOnly) throw failure('Redirects for write requests are not followed. Use the final URL directly.', 'http_redirect_not_allowed');
        if (hop >= MAX_REDIRECTS) throw failure('The URL redirects too many times. Use its final address.', 'http_redirect_limit');
        const next = publicUrl(new URL(location, url).href, httpAllowlist);
        // No custom headers, cookies or credentials cross an origin boundary.
        if (next.origin !== url.origin) headers = new Headers();
        url = next;
        continue;
      }
      const contentType = (response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
      if (contentType && !contentType.startsWith('text/') && !/^(application\/(json|[\w.+-]+\+json|xhtml\+xml))$/.test(contentType)) {
        await response.body?.cancel();
        throw failure('Fetch URL reads text, JSON and HTML. Use a text source instead of a PDF, image or other download.', 'http_content_type_not_supported');
      }
      const text = await boundedText(response);
      let data = text;
      if (contentType === 'text/html' || contentType === 'application/xhtml+xml') data = await htmlToText(text);
      else { try { data = JSON.parse(text); } catch { /* Plain text remains text. */ } }
      return { status: response.status, ok: response.ok, data, url: url.href };
    }
  } catch (error) {
    if (error.code && error.status) throw error;
    throw failure(signal.aborted ? 'Fetch URL timed out. Try a faster source.' : 'Could not read this public URL. Check the address and whether the site allows automated requests.', signal.aborted ? 'http_timeout' : 'http_fetch_failed');
  }
}
