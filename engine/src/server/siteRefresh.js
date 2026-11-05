/**
 * Reading a website's pages again, one site at a time, on the rules it lists: a list's pages, a sitemap's
 * or a crawl from its start under its path prefix, up to its page limit. One page at a time, with a pause,
 * as robots.txt asks, and only over the fetch it is given, which a host keeps to public addresses. A page
 * that can't be read keeps its old snapshot and is reported; a page the site says is gone (404, 410)
 * leaves it. What `viable-engine knowledge refresh` and the console's Knowledge page both run. No Node built-ins.
 */
import { fetchAgentUrl, publicUrl } from '../agents/http.js';
import { toMarkdown } from '../markdown.js';

const USER_AGENT = 'viable-harness-knowledge-refresh/1.0 (+https://github.com/VIABLE-Learning-Lab/viable)';
export const REFRESH_LIMITS = Object.freeze({ crawlPages: 1000, sitemapPages: 20000, crawlDefault: 50, sitemapDefault: 5000, sitemaps: 60, bytes: 24 * 1024 * 1024, delayMs: 1000, longestDelayMs: 30000, pageBytes: 1024 * 1024 });
const FILE_LINK = /\.(png|jpe?g|gif|webp|svg|pdf|zip|mp4|mp3|css|js|ico|xml|docx?|pptx?|xlsx?)$/i;

/**
 * What a site's robots.txt asks of anyone (User-agent: *): { allows(path), delayMs }. The longest rule
 * that matches a path decides, Allow winning a tie; * and $ work as they do for search engines.
 */
export function robotsRules(text) {
  const rules = [];
  let delayMs = 0;
  let applies = false;
  let inAgents = false;
  for (const raw of String(text || '').split(/\r?\n/)) {
    const line = /^\s*([A-Za-z-]+)\s*:\s*([^#]*?)\s*(?:#.*)?$/.exec(raw);
    if (!line) continue;
    const field = line[1].toLowerCase();
    if (field === 'user-agent') {
      applies = (inAgents && applies) || line[2] === '*';
      inAgents = true;
      continue;
    }
    inAgents = false;
    if (!applies) continue;
    if (field === 'crawl-delay' && Number(line[2]) > 0) delayMs = Number(line[2]) * 1000;
    if ((field === 'allow' || field === 'disallow') && line[2]) {
      const pattern = line[2].replace(/[.+?^{}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
      rules.push({ allow: field === 'allow', length: line[2].length, test: new RegExp(`^${pattern.endsWith('$') ? pattern : `${pattern}`}`) });
    }
  }
  return {
    delayMs,
    allows(path) {
      const matched = rules.filter((rule) => rule.test.test(path)).sort((a, b) => b.length - a.length || Number(b.allow) - Number(a.allow));
      return matched.length ? matched[0].allow : true;
    }
  };
}

/** The <loc> of each <url> (or child <sitemap> in an index), with its <lastmod>. */
export function sitemapEntries(xml) {
  const index = /<(?:\w+:)?sitemapindex[\s>]/i.test(xml);
  const decode = (value) => value.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
  const entries = [];
  // In one pass, as a sitemap comes from anywhere: a pattern with [^>]* or [\s\S]*? would look to its end again from every "<".
  const text = String(xml);
  const between = (inner, name) => {
    const found = new RegExp(`<(?:\\w+:)?${name}>([^<]*(?:<!\\[CDATA\\[[^\\]]*\\]\\]>)?[^<]*)<\\/(?:\\w+:)?${name}>`, 'i').exec(inner)?.[1];
    return found?.replace(/^\s*<!\[CDATA\[|\]\]>\s*$/g, '').trim() || null;
  };
  let open = null;
  for (const tag of text.matchAll(/<(\/?)(?:\w+:)?(url|sitemap)\b[^<>]*>/gi)) {
    if (!tag[1]) { open = { name: tag[2].toLowerCase(), from: tag.index + tag[0].length }; continue; }
    if (open?.name !== tag[2].toLowerCase()) continue;
    const inner = text.slice(open.from, tag.index);
    open = null;
    const loc = between(inner, 'loc');
    const lastmod = between(inner, 'lastmod');
    if (loc) entries.push({ url: decode(loc), lastmod: lastmod && !Number.isNaN(Date.parse(lastmod)) ? lastmod : null });
  }
  return { index, entries };
}

// A page's text as passages read it: link targets and image addresses dropped, their words kept. Linear
// on purpose: a link that doesn't close can't make the pattern try every way of splitting it.
function pageText(markdown) {
  return String(markdown)
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, (_, alt) => (alt.trim() ? `[Image: ${alt.trim()}]` : ''))
    .replace(/\[((?:[^[\]]|\[[^[\]]*\])*)\]\((?:[^()\s]|\([^()\s]*\))*(?:\s+(?:"[^"]*"|'[^']*'|\([^()]*\)))?\)/g, (_, text) => text)
    .replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

const pageTitle = (data, text, url) => (typeof data?.title === 'string' && data.title.trim()) || /^#\s+(.+)$/m.exec(text)?.[1] || new URL(url).pathname.split('/').filter(Boolean).pop() || new URL(url).hostname;
const pause = (ms) => new Promise((done) => { setTimeout(done, ms); });

/** One site's reader, a page at a time, within robots.txt, with a pause between requests. fetch: the host's public-only fetch, which every hop of a redirect goes through. */
export function siteReader(origin, { fetch, delayMs = REFRESH_LIMITS.delayMs, sleep = pause }) {
  let rules = null;
  let last = 0;
  const get = async (url, { xml = false } = {}) => {
    const wait = Math.min(Math.max(delayMs, rules?.delayMs || 0), REFRESH_LIMITS.longestDelayMs) - (Date.now() - last);
    if (last && wait > 0) await sleep(wait);
    last = Date.now();
    return fetchAgentUrl({ url, method: 'GET', headers: { 'User-Agent': USER_AGENT, Accept: xml ? 'application/xml,text/xml;q=0.9,*/*;q=0.5' : 'text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.5' } }, { httpFetch: fetch, toMarkdown, knowledge: true, acceptXml: xml, timeoutMs: 20000, httpDeadline: Date.now() + 20000, maxTextBytes: xml ? 6 * 1024 * 1024 : REFRESH_LIMITS.pageBytes });
  };
  return {
    get,
    async robots() {
      if (rules) return rules;
      let text = '';
      try { const answer = await get(`${origin}/robots.txt`); text = answer.ok && typeof answer.data === 'string' ? answer.data : ''; } catch { /* None to read: nothing is asked. */ }
      rules = { ...robotsRules(text), sitemaps: [...text.matchAll(/^\s*sitemap:\s*(\S+)/gim)].map((match) => match[1]) };
      return rules;
    }
  };
}

// The pages a sitemap lists under its prefix, up to the limit, with when each last changed.
async function sitemapPages(site, reader, max) {
  const robots = await reader.robots();
  const queue = /\.xml(\?|$)/i.test(new URL(site.url).pathname) ? [site.url] : robots.sitemaps.length ? [...robots.sitemaps] : [`${new URL(site.url).origin}/sitemap.xml`];
  const pages = new Map();
  const seen = new Set();
  while (queue.length && pages.size < max && seen.size < REFRESH_LIMITS.sitemaps) {
    const url = queue.shift();
    if (seen.has(url)) continue;
    seen.add(url);
    const answer = await reader.get(url, { xml: true });
    if (!answer.ok) { if (seen.size === 1) throw new Error(`the sitemap answered ${answer.status}`); continue; }
    const { index, entries } = sitemapEntries(typeof answer.data === 'string' ? answer.data : '');
    for (const entry of entries) {
      if (index) { queue.push(entry.url); continue; }
      if (!entry.url.startsWith('https://') || (site.path_prefix && !entry.url.startsWith(site.path_prefix)) || pages.has(entry.url)) continue;
      pages.set(entry.url, entry);
      if (pages.size >= max) break;
    }
  }
  return pages;
}

// Same host, under the prefix (default: the start's directory), no files.
function sameSiteLinks(page, url, prefix) {
  const base = new URL(url);
  const start = prefix || `${base.origin}${base.pathname.endsWith('/') ? base.pathname : base.pathname.replace(/[^/]*$/, '')}`;
  const links = [];
  for (const link of page?.links || []) {
    let target;
    try { target = new URL(link.url); } catch { continue; }
    target.hash = '';
    if (target.protocol !== 'https:' || target.host !== base.host || !target.href.startsWith(start) || target.href === base.href || FILE_LINK.test(target.pathname)) continue;
    if (!links.includes(target.href)) links.push(target.href);
  }
  return links;
}

/**
 * One website's snapshot read again: { snapshot, read, kept, gone, failed, left, stopped }. room: { bytes }
 * left in the package. write(text) stores a page and answers its path. until: when to stop reading, for a
 * caller someone is waiting on; what wasn't reached by then keeps its old snapshot.
 */
export async function refreshSite(site, { reader, room, write, log = null, now = () => new Date().toISOString(), until = null }) {
  const old = new Map((site.snapshot || []).map((page) => [page.url, page]));
  const kind = site.kind || 'crawl';
  const out = { snapshot: [], read: 0, kept: 0, gone: 0, failed: [], left: 0, stopped: null };
  const keep = (url, reason) => {
    if (reason) out.failed.push({ url, reason });
    if (old.has(url)) { out.snapshot.push(old.get(url)); out.kept += 1; room.bytes -= old.get(url).bytes || 0; }
  };
  const robots = await reader.robots();
  const limit = kind === 'crawl' ? Math.min(site.max_pages || REFRESH_LIMITS.crawlDefault, REFRESH_LIMITS.crawlPages) : kind === 'sitemap' ? Math.min(site.max_pages || REFRESH_LIMITS.sitemapDefault, REFRESH_LIMITS.sitemapPages) : Infinity;
  let queue;
  let changed = new Map();
  try {
    if (kind === 'list') queue = site.urls?.length ? [...site.urls] : [site.url];
    else if (kind === 'sitemap') { changed = await sitemapPages(site, reader, limit); queue = [...changed.keys()]; }
    else queue = [site.url];
  } catch (error) {
    // What lists the pages can't be read: the snapshot stays as it was.
    out.stopped = `${site.url}: ${error.message}`;
    for (const url of old.keys()) keep(url);
    return out;
  }
  const seen = new Set();
  const keepTheRest = () => {
    for (const rest of queue) if (!seen.has(rest)) { seen.add(rest); keep(rest); }
    queue = [];
  };
  while (queue.length && out.read + out.kept < limit) {
    if (until && Date.now() > until) { out.stopped = 'it ran out of time'; keepTheRest(); break; }
    const url = queue.shift();
    if (seen.has(url)) continue;
    seen.add(url);
    let address;
    try { address = publicUrl(url); } catch (error) { keep(url, error.message); continue; }
    if (!robots.allows(address.pathname + address.search)) { keep(url, 'robots.txt asks not to read it'); continue; }
    // A sitemap that dates a page says it hasn't changed since it was last read: not fetched again.
    const before = old.get(url);
    const dated = changed.get(url)?.lastmod;
    if (before?.read_at && dated && Date.parse(dated) <= Date.parse(before.read_at)) { keep(url); continue; }
    let answer;
    try { answer = await reader.get(url); } catch (error) { keep(url, error.message); continue; }
    if (answer.status === 404 || answer.status === 410) { out.gone += 1; continue; }
    if (answer.status === 429 || answer.status === 503) {
      // The site asks for less: stop reading it, and keep what it had.
      out.stopped = `${site.url} answered ${answer.status}, so the rest of it wasn't read`;
      keep(url);
      keepTheRest();
      break;
    }
    if (!answer.ok) { keep(url, `it answered ${answer.status}`); continue; }
    const page = answer.data && typeof answer.data === 'object' ? answer.data : null;
    const text = pageText(page?.markdown ?? (typeof answer.data === 'string' ? answer.data : JSON.stringify(answer.data, null, 2)));
    if (kind === 'crawl') for (const link of sameSiteLinks(page, url, site.path_prefix)) if (!seen.has(link) && !queue.includes(link)) queue.push(link);
    if (!text) { keep(url, 'it has no text'); continue; }
    const bytes = new TextEncoder().encode(text);
    if (bytes.length > room.bytes) { out.left += 1; keep(url); continue; }
    room.bytes -= bytes.length;
    out.snapshot.push({ url, title: pageTitle(page, text, url).slice(0, 300), path: await write(text), bytes: bytes.length, sha256: [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map((byte) => byte.toString(16).padStart(2, '0')).join(''), read_at: now(), read_this_time: true });
    out.read += 1;
    log?.(`Read ${url}`);
  }
  // What was in the snapshot and wasn't reached this time stays, up to the limit.
  const reached = new Set(out.snapshot.map((page) => page.url));
  for (const [url, page] of old) if (!seen.has(url) && !reached.has(url) && kind !== 'sitemap') { out.snapshot.push(page); out.kept += 1; room.bytes -= page.bytes || 0; }
  return out;
}
