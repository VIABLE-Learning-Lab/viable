import { decodeHTML, decodeHTMLAttribute, escapeUTF8 } from 'entities';
import { elementsIn, replaceElements, withoutComments } from '../../../harness/src/markdown.js';
import { publicUrl } from '../../../harness/src/net/publicUrl.js';

// Fetch only through Workers' public internet transport. Keep
// global_fetch_strictly_public enabled; never substitute a VPC/origin binding.
const MAX_BYTES = 5 * 1024 * 1024;
const MAX_TEXT_BYTES = 256 * 1024;
const MAX_REDIRECTS = 3;

function failure(message, code) {
  return Object.assign(new Error(message), { status: 400, code });
}

export { publicUrl };

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
// LibGuides marks two content areas as navigation: tabbed boxes (.s-lib-jqtabs), and in its side-nav
// layout the guide-pages container, which also holds the column of boxes under the page list (the
// librarian's profile, with name and email). Both stay; only the page list itself goes. Screen-reader
// hints ("This link opens in a new window" after every link) and skip links are noise in passages:
// the hidden-text classes of Bootstrap and Tailwind, WordPress, and Drupal, and common skip links.
const SCREEN_READER_ONLY = '.sr-only, .visually-hidden, .visually-hidden-focusable, .screen-reader-text, .element-invisible, .skip-link, #s-lg-public-skiplink';
const PAGE_CHROME = `nav, aside, noscript, svg, form, button, dialog, [role="navigation"]:not(.s-lib-jqtabs):not(#s-lg-guide-tabs), #s-lg-guide-tabs > ul.nav, [role="search"], [aria-hidden="true"], ${SCREEN_READER_ONLY}`;

/**
 * A line of text standing in for an embedded player, so a video or podcast on the page stays
 * findable with a link people can open: known players become their watch or listen pages.
 */
export function embedLine(src, title, label) {
  const url = new URL(src);
  const host = url.hostname.replace(/^www\./, '');
  const [, first, second, third] = url.pathname.split('/');
  let link = url.href;
  if (/^youtube(-nocookie)?\.com$/.test(host) && first === 'embed' && second) {
    label = 'Video';
    const list = url.searchParams.get('list');
    link = second === 'videoseries' && list ? `https://www.youtube.com/playlist?list=${encodeURIComponent(list)}` : `https://www.youtube.com/watch?v=${second}`;
  } else if (host === 'player.vimeo.com' && first === 'video' && second) {
    label = 'Video';
    link = `https://vimeo.com/${second}`;
  } else if (host === 'open.spotify.com' && /^embed(-podcast)?$/.test(first) && second && third) {
    label = 'Audio';
    link = `https://open.spotify.com/${second}/${third}`;
  } else if (/^embed\.(podcasts|music)\.apple\.com$/.test(host)) {
    label = 'Audio';
    link = `https://${host.slice('embed.'.length)}${url.pathname}${url.search}`;
  }
  const name = title.replace(/\s+/g, ' ').trim();
  return `<p>${escapeUTF8(`${label}: ${name ? `${name} — ` : ''}${link}`)}</p>`;
}

// A site behind Cloudflare's email protection serves "[email protected]" in place of each address and keeps the
// address, XOR-ed with its first byte, in data-cfemail or after /cdn-cgi/l/email-protection#; a visitor's
// browser writes it back with a script. Write it back here too, so the page reads as its visitors see it.
export function revealHiddenEmails(html) {
  if (!html.includes('data-cfemail') && !html.includes('/cdn-cgi/l/email-protection#')) return html;
  const address = (hex) => {
    const bytes = (hex.match(/../g) || []).map((pair) => parseInt(pair, 16));
    const key = bytes.shift();
    return escapeUTF8(new TextDecoder().decode(new Uint8Array(bytes.map((byte) => byte ^ key))));
  };
  // Neither pattern reads past the second "<" from where it starts, so a page that repeats one still reads in a pass.
  return html
    .replace(/<(a|span)(\s[^<>]*)>[^<]*<\/\1>/gi, (element, name, attributes) => {
      const hex = /\sdata-cfemail\s*=\s*["']?([0-9a-f]+)/i.exec(attributes)?.[1];
      return hex ? address(hex) : element;
    })
    .replace(/(\bhref\s*=\s*["']?)(?:https?:\/\/[^/"'\s<>]+)?\/cdn-cgi\/l\/email-protection#([0-9a-f]+)/gi, (_, start, hex) => `${start}mailto:${address(hex)}`);
}

/**
 * Readable Markdown for agents and knowledge bases: the page's main region when it
 * has one (else the converter's default, which drops header and footer), without
 * navigation or forms; email and phone link targets are written into the text so
 * "Email me" keeps its address, and addresses a site hid from scripts are written back
 * (revealHiddenEmails). Links and images are inventoried from the whole page;
 * `knowledge` adds a LibGuides page's own navigation as guide_pages and, for a page with more
 * links than the inventory holds, keeps the first ones instead of failing (knowledge bases only
 * use them to find more pages).
 */
export async function htmlToSource(html, sourceUrl, toMarkdown, signal, { knowledge = false } = {}) {
  if (!toMarkdown) throw failure('HTML conversion requires the Workers AI binding.', 'http_markdown_unavailable');
  html = revealHiddenEmails(html);
  if (typeof HTMLRewriter === 'undefined') return patternSource(html, sourceUrl, toMarkdown);
  let base = sourceUrl;
  let foundBase = false;
  let activeLink;
  let media = 'Video';
  let contact = null;
  let title = '';
  const regions = { main: false, role: false };
  const links = [];
  const images = [];
  const guide = [];
  let metadataBytes = 0;
  let metadataError;
  const add = (list, item) => {
    if (metadataBytes > MAX_TEXT_BYTES) return;
    metadataBytes += new TextEncoder().encode(JSON.stringify(item)).byteLength;
    if (metadataBytes > MAX_TEXT_BYTES && !knowledge) {
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
  // The inventory covers anchors and img src/data-src, not CSS backgrounds or
  // what JavaScript creates: a page drawn that way shows less here than in a browser.
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
    // LibGuides' own page navigation (side or top tabs), in order; knowledge bases can follow it.
    .on('#s-lg-guide-tabs ul.nav a[href], #s-lg-tabs-container ul.nav a[href]', { element(el) {
      const url = absolute(el.getAttribute('href'));
      if (url) add(guide, url);
    } })
    .on('iframe', { element(el) {
      const url = absolute(el.getAttribute('data-src') || el.getAttribute('src') || '');
      if (url) el.replace(embedLine(url, decodeHTMLAttribute(el.getAttribute('title') || ''), 'Embedded content'), { html: true });
      else el.remove();
    } })
    .on('video, audio', { element(el) {
      media = el.tagName === 'audio' ? 'Audio' : 'Video';
      const url = absolute(el.getAttribute('src') || '');
      if (url) el.before(embedLine(url, decodeHTMLAttribute(el.getAttribute('title') || ''), media), { html: true });
      el.removeAndKeepContent();
    } })
    .on('video source[src], audio source[src]', { element(el) {
      const url = absolute(el.getAttribute('src'));
      if (url) el.replace(embedLine(url, '', media), { html: true });
      else el.remove();
    } })
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
      title: decodeHTML(title).replace(/\s+/g, ' ').trim(),
      ...(knowledge && guide.length ? { guide_pages: [...new Set(guide)] } : {})
    };
  } finally { if (abort) signal.removeEventListener('abort', abort); }
}

// Outside Workers (the harness on Node) there is no HTMLRewriter: the page goes to toMarkdown whole,
// which drops scripts, styles and site chrome itself (src/markdown.js), and its title, links and
// images are read with patterns.
// shortcut: a LibGuides guide's other pages and embed lines aren't followed, and its inventory has no size cap; add them if a run on Node needs them.
async function patternSource(html, sourceUrl, toMarkdown) {
  const attribute = (tag, name) => {
    const match = new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i').exec(tag);
    return match ? decodeHTMLAttribute(match[1] ?? match[2] ?? match[3]) : '';
  };
  const absolute = (value, base) => {
    try {
      const url = new URL(value, base);
      return value && ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url.href : null;
    } catch { return null; }
  };
  // A page can be anything, and a pattern with [^>]* or [\s\S]*? would look to its end again from every "<".
  const page = replaceElements(withoutComments(String(html)), ['script', 'style', 'template']);
  const base = absolute(attribute(/<base\b[^<>]*>/i.exec(page)?.[0] || '', 'href'), sourceUrl) || sourceUrl;
  const text = (value) => decodeHTML(value.replace(/<[^<>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
  const links = [...elementsIn(page, ['a'])].map(({ attrs, inner }) => ({ url: absolute(attribute(attrs, 'href'), base), text: text(inner) })).filter((link) => link.url);
  const images = [...page.matchAll(/<img\b[^<>]*>/gi)].map(([tag]) => ({ url: absolute(attribute(tag, 'data-src') || attribute(tag, 'src'), base), alt: attribute(tag, 'alt') })).filter((image) => image.url);
  const selector = /<main[\s>]/i.test(page) ? 'main' : /\srole\s*=\s*["']?main\b/i.test(page) ? '[role="main"]' : null;
  const result = await toMarkdown({ name: 'source.html', blob: new Blob([page], { type: 'text/html' }) }, { conversionOptions: { html: { hostname: base, ...(selector ? { cssSelector: selector } : {}) } } });
  if (result?.format !== 'markdown' || typeof result.data !== 'string') {
    throw failure('The webpage could not be converted to Markdown. Try again or choose another source.', 'http_markdown_failed');
  }
  return {
    markdown: result.data,
    links: [...new Map(links.map((link) => [link.url, link])).values()],
    images: [...new Map(images.map((image) => [JSON.stringify(image), image])).values()],
    title: text(elementsIn(page, ['title']).next().value?.inner || '')
  };
}

// `knowledge` skips converting error pages; `acceptXml` and `maxTextBytes` let knowledge
// bases read sitemaps. Agent Fetch URL steps never set them.
/**
 * Download a public HTTPS file as bytes (a recording for a Transcribe step), with the same address
 * rules as Fetch URL: no private hosts, at most three redirects, and a size limit.
 */
export async function fetchAgentFile(value, { httpFetch, httpAllowlist, httpDeadline, maxBytes = 25 * 1024 * 1024, timeoutMs = 20000 }) {
  let url = publicUrl(value, httpAllowlist);
  const signal = AbortSignal.timeout(Math.max(1, Math.min(timeoutMs, (httpDeadline || Infinity) - Date.now())));
  const tooLarge = () => failure(`The file is larger than ${maxBytes / 1024 / 1024} MiB.`, 'http_response_too_large');
  try {
    for (let hop = 0; ; hop++) {
      const response = await httpFetch(url.href, { method: 'GET', signal, redirect: 'manual' });
      const location = response.headers.get('location');
      if ([301, 302, 303, 307, 308].includes(response.status) && location) {
        await response.body?.cancel();
        if (hop >= MAX_REDIRECTS) throw failure('The URL redirects too many times. Use its final address.', 'http_redirect_limit');
        url = publicUrl(new URL(location, url).href, httpAllowlist);
        continue;
      }
      if (!response.ok) {
        await response.body?.cancel();
        throw failure(`The file address answered with status ${response.status}.`, 'http_fetch_failed');
      }
      if (Number(response.headers.get('content-length')) > maxBytes) {
        await response.body?.cancel();
        throw tooLarge();
      }
      const chunks = [];
      let size = 0;
      const reader = response.body?.getReader();
      for (let part = await reader?.read(); part && !part.done; part = await reader.read()) {
        size += part.value.byteLength;
        if (size > maxBytes) {
          await reader.cancel();
          throw tooLarge();
        }
        chunks.push(part.value);
      }
      const bytes = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
      return { bytes, contentType: (response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase(), url: url.href };
    }
  } catch (error) {
    if (error.code && error.status) throw error;
    throw failure(signal.aborted ? 'Downloading the file timed out. Try a smaller file.' : 'Could not download this file. Check the address and whether the site allows automated requests.', signal.aborted ? 'http_timeout' : 'http_fetch_failed');
  }
}

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
        // Sites often redirect to their own pages over plain http:// (LibGuides does). Like a
        // browser, follow the HTTPS address instead; the insecure one is never fetched.
        const target = new URL(location, url);
        if (target.protocol === 'http:' && (!target.port || target.port === '80')) {
          target.protocol = 'https:';
          target.port = '';
        }
        let next;
        try {
          next = publicUrl(target.href, httpAllowlist);
        } catch (error) {
          throw failure(`The page redirects to ${target.href.slice(0, 200)}, which can't be fetched. ${error.message}`, error.code);
        }
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
      if (html && (response.ok || !knowledge)) data = await htmlToSource(text, url.href, toMarkdown, signal, { knowledge });
      if (!html) { try { data = JSON.parse(text); } catch { /* Plain text remains text. */ } }
      if (new TextEncoder().encode(JSON.stringify(data)).byteLength > maxTextBytes) {
        throw failure(`The readable source is larger than ${maxTextBytes >= 1024 * 1024 ? `${maxTextBytes / 1024 / 1024} MiB` : `${maxTextBytes / 1024} KiB`} after HTML cleanup. Choose a more focused page or API response.`, 'http_response_too_large');
      }
      return { status: response.status, ok: response.ok, data, url: url.href };
    }
  } catch (error) {
    if (error.code && error.status) throw error;
    throw failure(signal.aborted ? 'Fetch URL timed out. Try a faster source.' : 'Could not read this public URL. Check the address and whether the site allows automated requests.', signal.aborted ? 'http_timeout' : 'http_fetch_failed');
  }
}
