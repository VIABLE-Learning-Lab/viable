import { decodeHTML, decodeHTMLAttribute } from 'entities';

// Fetch only through Workers' public internet transport. Keep
// global_fetch_strictly_public enabled; never substitute a VPC/origin binding.
const MAX_BYTES = 5 * 1024 * 1024;
const MAX_TEXT_BYTES = 256 * 1024;
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
    throw failure('The download is larger than 5 MiB. Choose a smaller page or API response.', 'http_response_too_large');
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
        throw failure('The download is larger than 5 MiB. Choose a smaller page or API response.', 'http_response_too_large');
      }
      text += decoder.decode(value, { stream: true });
    }
    return text + decoder.decode();
  } finally { reader.releaseLock(); }
}

// Site chrome that repeats on every page; removed before conversion (its links stay in the inventory).
const PAGE_CHROME = 'nav, aside, noscript, svg, iframe, form, button, dialog, [role="navigation"], [role="search"], [aria-hidden="true"]';

/**
 * Readable Markdown for agents and knowledge bases: the page's main region when it
 * has one (else the converter's default, which drops header and footer), without
 * navigation or forms; email and phone link targets are written into the text so
 * "Email me" keeps its address. Links and images are inventoried from the whole page.
 */
export async function htmlToSource(html, sourceUrl, toMarkdown, signal) {
  if (!toMarkdown) throw failure('HTML conversion requires the Workers AI binding.', 'http_markdown_unavailable');
  let base = sourceUrl;
  let foundBase = false;
  let activeLink;
  let contact = null;
  let title = '';
  const regions = { main: false, role: false };
  const links = [];
  const images = [];
  let metadataBytes = 0;
  let metadataError;
  const add = (list, item) => {
    metadataBytes += new TextEncoder().encode(JSON.stringify(item)).byteLength;
    if (metadataBytes > MAX_TEXT_BYTES) {
      metadataError = failure('The page contains more than 256 KiB of links and image metadata. Choose a more focused source.', 'http_response_too_large');
      throw metadataError;
    }
    list.push(item);
  };
  const absolute = value => {
    try {
      const url = new URL(decodeHTMLAttribute(value), base);
      return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url.href : null;
    } catch { return null; }
  };
  // ponytail: inventory covers anchors and img src/data-src, not CSS backgrounds
  // or JavaScript-created content; add rendered-page extraction only when needed.
  // Extract independently of Markdown conversion. These URLs are metadata only:
  // never fetch linked pages/images or execute page scripts.
  const rewriter = new HTMLRewriter()
      .on('title', { text(chunk) { if (title.length < 300) title += chunk.text; } })
      .on('main', { element() { regions.main = true; } })
      .on('[role="main"]', { element() { regions.role = true; } })
      .on(PAGE_CHROME, { element: el => el.remove() })
      .on('a[href^="mailto:"], a[href^="MAILTO:"], a[href^="tel:"]', {
        element(el) {
          const href = el.getAttribute('href') || '';
          let address = '';
          try { address = decodeURIComponent(href.replace(/^(mailto|tel):/i, '').split('?')[0]).trim(); } catch { address = ''; }
          contact = address ? { address, text: '' } : null;
          el.removeAttribute('href');
          const current = contact;
          el.onEndTag((end) => {
            if (current && !current.text.replace(/\s+/g, '').includes(current.address.replace(/\s+/g, ''))) end.after(` (${current.address})`);
            contact = null;
          });
        },
        text(chunk) { if (contact) contact.text += chunk.text; }
      });
  const cleaned = await rewriter
    .on('base[href]', { element(el) {
      if (!foundBase) { base = absolute(el.getAttribute('href')) || base; foundBase = true; }
      el.remove();
    } })
    .on('script, style, template', { element: el => el.remove() })
    .on('a[href]', {
      element(el) {
        // Contact links were handled above; a second end-tag handler would replace theirs.
        if (contact) return;
        const url = absolute(el.getAttribute('href'));
        activeLink = url ? { url, text: '' } : null;
        if (activeLink) { add(links, activeLink); el.setAttribute('href', url); }
        else el.removeAttribute('href');
        el.onEndTag(() => { activeLink = null; });
      },
      text(chunk) { if (activeLink) activeLink.text += chunk.text; }
    })
    .on('img', { element(el) {
      const url = absolute(el.getAttribute('data-src') || el.getAttribute('src') || '');
      if (url && (el.getAttribute('data-src') || el.getAttribute('src'))) {
        add(images, { url, alt: decodeHTMLAttribute(el.getAttribute('alt') || '') });
        el.setAttribute('src', url);
      } else el.removeAttribute('src');
      el.removeAttribute('srcset');
      el.removeAttribute('data-src');
    } })
    .transform(new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })).text().catch(error => { throw metadataError || error; });
  let abort;
  try {
    signal.throwIfAborted();
    const result = await Promise.race([
      toMarkdown({ name: 'source.html', blob: new Blob([cleaned], { type: 'text/html' }) },
        { conversionOptions: { html: { hostname: base, ...(regions.main ? { cssSelector: 'main' } : regions.role ? { cssSelector: '[role="main"]' } : {}) } } }),
      new Promise((_, reject) => { abort = () => reject(signal.reason); signal.addEventListener('abort', abort, { once: true }); })
    ]);
    if (result?.format !== 'markdown' || typeof result.data !== 'string') {
      throw failure('The webpage could not be converted to Markdown. Try again or choose another source.', 'http_markdown_failed');
    }
    return {
      markdown: result.data,
      links: [...new Map(links.map(link => [link.url, { ...link, text: decodeHTML(link.text).replace(/\s+/g, ' ').trim() }])).values()],
      images: [...new Map(images.map(image => [JSON.stringify(image), image])).values()],
      title: decodeHTML(title).replace(/\s+/g, ' ').trim()
    };
  } finally { if (abort) signal.removeEventListener('abort', abort); }
}

// `knowledge` skips converting error pages; `acceptXml` and `maxTextBytes` let knowledge
// bases read sitemaps. Agent Fetch URL steps never set them.
export async function fetchAgentUrl(config, { httpFetch, httpAllowlist, httpDeadline, toMarkdown, knowledge = false, acceptXml = false, maxTextBytes = MAX_TEXT_BYTES, timeoutMs = 10000 }) {
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
  const signal = AbortSignal.timeout(Math.max(1, Math.min(timeoutMs, (httpDeadline || Infinity) - Date.now())));
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
      const xml = acceptXml && /^application\/([\w.+-]+\+)?xml$/.test(contentType);
      if (contentType && !xml && !contentType.startsWith('text/') && !/^(application\/(json|[\w.+-]+\+json|xhtml\+xml))$/.test(contentType)) {
        await response.body?.cancel();
        throw failure('Fetch URL reads text, JSON and HTML. Use a text source instead of a PDF, image or other download.', 'http_content_type_not_supported');
      }
      const text = await boundedText(response);
      let data = text;
      const html = contentType === 'text/html' || contentType === 'application/xhtml+xml';
      if (html && (response.ok || !knowledge)) data = await htmlToSource(text, url.href, toMarkdown, signal);
      if (!html) { try { data = JSON.parse(text); } catch { /* Plain text remains text. */ } }
      if (new TextEncoder().encode(JSON.stringify(data)).byteLength > maxTextBytes) {
        throw failure('The readable source is larger than 256 KiB after HTML cleanup. Choose a more focused page or API response.', 'http_response_too_large');
      }
      return { status: response.status, ok: response.ok, data, url: url.href };
    }
  } catch (error) {
    if (error.code && error.status) throw error;
    throw failure(signal.aborted ? 'Fetch URL timed out. Try a faster source.' : 'Could not read this public URL. Check the address and whether the site allows automated requests.', signal.aborted ? 'http_timeout' : 'http_fetch_failed');
  }
}
