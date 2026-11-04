/**
 * Reads a package's websites again, on the rules it lists: a list's pages, a sitemap's or a crawl from
 * its start under its path prefix, up to its page limit. One page at a time, with a pause, as robots.txt
 * asks and only over public addresses. A new copy of the package goes to a folder, its snapshot brought
 * up to date. A page that can't be read keeps its old snapshot and is reported; a page the site says is
 * gone (404, 410) leaves it. Local only: a cloud runs this on its own schedule and deploys the result.
 */
import { lookup as dnsLookup } from 'node:dns/promises';
import { createHash } from 'node:crypto';
import { mkdir, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fetchAgentUrl, publicUrl } from './agents/http.js';
import { toMarkdown } from './markdown.js';
import { readAgentFile } from './run.js';
import { readZip } from './utils/zip.js';
import { readInFolder } from './knowledge.js';
import { isPrivateAddress, publicFetch } from './server/publicFetch.js';

const USER_AGENT = 'viable-harness-knowledge-refresh/1.0 (+https://github.com/VIABLE-Learning-Lab/viable-harness)';
export const REFRESH_LIMITS = Object.freeze({ crawlPages: 1000, sitemapPages: 20000, crawlDefault: 50, sitemapDefault: 5000, sitemaps: 60, bytes: 24 * 1024 * 1024, delayMs: 1000, longestDelayMs: 30000, pageBytes: 1024 * 1024 });
const FILE_LINK = /\.(png|jpe?g|gif|webp|svg|pdf|zip|mp4|mp3|css|js|ico|xml|docx?|pptx?|xlsx?)$/i;

export { isPrivateAddress };

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
  for (const match of String(xml).matchAll(/<(?:\w+:)?(url|sitemap)\b[^>]*>([\s\S]*?)<\/(?:\w+:)?\1>/gi)) {
    const loc = /<(?:\w+:)?loc>\s*(?:<!\[CDATA\[)?\s*([^<\]]+?)\s*(?:\]\]>)?\s*<\/(?:\w+:)?loc>/i.exec(match[2])?.[1];
    const lastmod = /<(?:\w+:)?lastmod>\s*([^<]+?)\s*<\/(?:\w+:)?lastmod>/i.exec(match[2])?.[1];
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
const inPackage = (path) => !/^[A-Za-z]:|^[\\/]|(?:^|[\\/])\.\.(?:[\\/]|$)/.test(String(path));

// One site's reader, a page at a time: a public address, within robots.txt, with a pause between requests.
function siteReader(origin, { fetch, lookup, delayMs, sleep }) {
  let rules = null;
  let last = 0;
  // Each hop of a redirect is looked up too; a name that resolves to a private address is refused.
  const checked = publicFetch(fetch, { lookup });
  const get = async (url, { xml = false } = {}) => {
    const wait = Math.min(Math.max(delayMs, rules?.delayMs || 0), REFRESH_LIMITS.longestDelayMs) - (Date.now() - last);
    if (last && wait > 0) await sleep(wait);
    last = Date.now();
    return fetchAgentUrl({ url, method: 'GET', headers: { 'User-Agent': USER_AGENT, Accept: xml ? 'application/xml,text/xml;q=0.9,*/*;q=0.5' : 'text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.5' } }, { httpFetch: checked, toMarkdown, knowledge: true, acceptXml: xml, timeoutMs: 20000, httpDeadline: Date.now() + 20000, maxTextBytes: xml ? 6 * 1024 * 1024 : REFRESH_LIMITS.pageBytes });
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
 * left in the package. write(text) stores a page and answers its path.
 */
async function refreshSite(site, { reader, room, write, log, now }) {
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
  while (queue.length && out.read + out.kept < limit) {
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
      for (const rest of queue) if (!seen.has(rest)) { seen.add(rest); keep(rest); }
      queue = [];
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
    out.snapshot.push({ url, title: pageTitle(page, text, url).slice(0, 300), path: await write(text), bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), read_at: now(), read_this_time: true });
    out.read += 1;
    log?.(`Read ${url}`);
  }
  // What was in the snapshot and wasn't reached this time stays, up to the limit.
  const reached = new Set(out.snapshot.map((page) => page.url));
  for (const [url, page] of old) if (!seen.has(url) && !reached.has(url) && kind !== 'sitemap') { out.snapshot.push(page); out.kept += 1; room.bytes -= page.bytes || 0; }
  return out;
}

/**
 * package: a package's .viable.zip, its JSON file, or a folder with its package.viable.json. out: the
 * folder its new copy goes to, with its files. Returns { sites: [{ knowledge_base, url, read, kept, gone,
 * failed, left, stopped }], path }. delayMs: the pause between requests to a site.
 */
export async function refreshPackage(packagePath, { out, fetch, lookup = dnsLookup, delayMs = REFRESH_LIMITS.delayMs, sleep = (ms) => new Promise((done) => { setTimeout(done, ms); }), log = null, now = () => new Date().toISOString() } = {}) {
  if (!out) throw new Error('Say where the refreshed package goes: --out <folder>.');
  const path = (await stat(packagePath)).isDirectory() ? join(packagePath, 'package.viable.json') : packagePath;
  const { doc, dir, zip } = await readAgentFile(path);
  if (doc?.format !== 'viable.course-package') throw new Error(`${path} isn't a course package: only a package carries websites.`);
  const folder = resolve(out);
  const put = async (name, data) => {
    if (!inPackage(name)) throw new Error(`The package names a file outside its folder: ${String(name).slice(0, 120)}.`);
    await mkdir(dirname(join(folder, name)), { recursive: true });
    await writeFile(join(folder, name), data);
  };
  // Its files, as they are.
  const held = zip ? await readZip(zip, () => true, { binary: true }) : null;
  const read = (name) => readInFolder(name, dir);
  const copy = async (name) => {
    if (name == null) return 0;
    const bytes = held ? held.get(name) : await read(name);
    if (!bytes) throw new Error(`The package has no ${name}.`);
    await put(name, bytes);
    return bytes.length;
  };
  let used = 0;
  for (const file of doc.files || []) used += await copy(file.path) + await copy(file.text_path);
  const room = { bytes: REFRESH_LIMITS.bytes - used };
  let page = 0;
  const write = async (text) => { page += 1; const name = `files/page-${String(page).padStart(4, '0')}.md`; await put(name, text); return name; };
  // A page kept from the old snapshot keeps its text, under a name of this copy's.
  const carried = async (entry) => {
    if (entry.read_this_time) { const { read_this_time: _now, ...fresh } = entry; return fresh; }
    const bytes = held ? held.get(entry.path) : await read(entry.path);
    return bytes ? { ...entry, path: await write(new TextDecoder().decode(bytes)) } : null;
  };
  const readers = new Map();
  const sites = [];
  const next = structuredClone(doc);
  for (const kb of next.knowledge_bases || []) {
    for (const site of kb.websites || []) {
      const origin = new URL(site.url).origin;
      if (!readers.has(origin)) readers.set(origin, siteReader(origin, { fetch, lookup, delayMs, sleep }));
      const done = await refreshSite(site, { reader: readers.get(origin), room, write, log, now });
      site.snapshot = (await Promise.all(done.snapshot.map(carried))).filter(Boolean);
      sites.push({ knowledge_base: kb.ref, url: site.url, read: done.read, kept: done.kept, gone: done.gone, failed: done.failed, left: done.left, stopped: done.stopped });
      if (done.left) (next.notes ||= []).push(`“${kb.name}”: ${done.left} of the pages of ${site.url} are left out of the snapshot, to keep the package under 25 MB.`);
    }
  }
  await put('package.viable.json', `${JSON.stringify(next, null, 2)}\n`);
  return { path: join(folder, 'package.viable.json'), sites };
}
