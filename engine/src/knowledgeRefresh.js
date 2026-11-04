/**
 * Reads a package's websites again (server/siteRefresh.js), into a new copy of the package in a folder,
 * its snapshot brought up to date, only over public addresses. Local only: a cloud runs this on its own
 * schedule and deploys the result.
 */
import { lookup as dnsLookup } from 'node:dns/promises';
import { mkdir, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { readAgentFile } from './run.js';
import { readZip } from '../../harness/src/utils/zip.js';
import { readInFolder } from './knowledge.js';
import { isPrivateAddress, publicFetch } from '../../harness/src/net/publicFetch.js';
import { REFRESH_LIMITS, refreshSite, robotsRules, siteReader, sitemapEntries } from './server/siteRefresh.js';

export { REFRESH_LIMITS, isPrivateAddress, robotsRules, sitemapEntries };

const inPackage = (path) => !/^[A-Za-z]:|^[\\/]|(?:^|[\\/])\.\.(?:[\\/]|$)/.test(String(path));

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
      if (!readers.has(origin)) readers.set(origin, siteReader(origin, { fetch: publicFetch(fetch, { lookup }), delayMs, sleep }));
      const done = await refreshSite(site, { reader: readers.get(origin), room, write, log, now });
      site.snapshot = (await Promise.all(done.snapshot.map(carried))).filter(Boolean);
      sites.push({ knowledge_base: kb.ref, url: site.url, read: done.read, kept: done.kept, gone: done.gone, failed: done.failed, left: done.left, stopped: done.stopped });
      if (done.left) (next.notes ||= []).push(`“${kb.name}”: ${done.left} of the pages of ${site.url} are left out of the snapshot, to keep the package under 25 MB.`);
    }
  }
  await put('package.viable.json', `${JSON.stringify(next, null, 2)}\n`);
  return { path: join(folder, 'package.viable.json'), sites };
}
