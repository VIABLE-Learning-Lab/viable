// viable-engine knowledge refresh: a package's websites read again on their own rules, politely, and
// never off the public internet. Sites are scripted; nothing reaches the network.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { isPrivateAddress, refreshPackage, robotsRules, sitemapEntries } from '../src/knowledgeRefresh.js';
import { runAgent } from '../src/run.js';
import { zipFile } from './zipFile.js';

const scratch = (t) => { const dir = mkdtempSync(join(tmpdir(), 'viable-refresh-')); t.after(() => rmSync(dir, { recursive: true, force: true })); return dir; };
const html = (title, body, links = []) => `<html><head><title>${title}</title></head><body><main><h1>${title}</h1><p>${body}</p>${links.map((href) => `<a href="${href}">link</a>`).join('')}</main></body></html>`;
const publicName = async () => [{ address: '93.184.216.34', family: 4 }];

function site(pages) {
  const asked = [];
  const fetch = async (url, init) => {
    asked.push({ url, agent: new Headers(init?.headers).get('user-agent') });
    const page = pages[url];
    if (page === undefined) return new Response('nothing here', { status: 404, headers: { 'content-type': 'text/plain' } });
    if (typeof page === 'number') return new Response('', { status: page, headers: { 'content-type': 'text/plain' } });
    const type = url.endsWith('.xml') ? 'application/xml' : url.endsWith('.txt') ? 'text/plain' : 'text/html';
    return new Response(page, { status: 200, headers: { 'content-type': type } });
  };
  return { fetch, asked };
}
const pkg = (websites, extra = {}) => ({ format: 'viable.course-package', version: 1, course: { title: 'Help' }, agents: [{ ref: 'desk', name: 'Desk', graph: { entry: 'o', nodes: [{ id: 'o', type: 'output', config: { text: 'hi' } }] } }], knowledge_bases: [{ ref: 'kb-1', name: 'Guides', websites }], ...extra });
const write = (dir, doc, name = 'package.json') => { const path = join(dir, name); writeFileSync(path, JSON.stringify(doc)); return path; };
const refresh = (path, options) => refreshPackage(path, { lookup: publicName, delayMs: 0, sleep: async () => {}, ...options });

test('robots.txt: the longest matching rule decides, for anyone', () => {
  const rules = robotsRules('User-agent: other\nDisallow: /\n\nUser-agent: *\nDisallow: /private\nAllow: /private/open\nDisallow: /*.pdf\nCrawl-delay: 2\nSitemap: https://x.example/s.xml');
  assert.equal(rules.allows('/guide'), true);
  assert.equal(rules.allows('/private/x'), false);
  assert.equal(rules.allows('/private/open/x'), true);
  assert.equal(rules.allows('/a/b.pdf'), false);
  assert.equal(rules.delayMs, 2000);
  assert.equal(robotsRules('').allows('/anything'), true);
  const ends = robotsRules('User-agent: *\nDisallow: /*.pdf$\nDisallow: /only$\nAllow: /a*b*c');
  assert.deepEqual(['/x.pdf', '/x.pdf?page=2', '/only', '/only/more', '/a1b2c3', '/acb'].map((path) => ends.allows(path)), [false, true, false, true, true, true]);
  // A site's own file can't make a rule that stalls the server: twelve stars on a long address answer at once.
  const stars = robotsRules(`User-agent: *\nDisallow: /${'*a'.repeat(12)}*b`);
  const began = Date.now();
  assert.equal(stars.allows(`/${'a'.repeat(4000)}`), true);
  assert.ok(Date.now() - began < 200);
});

test('private and local addresses are refused, as they resolve', () => {
  for (const address of ['10.0.0.8', '127.0.0.1', '169.254.169.254', '172.16.0.1', '192.168.1.1', '100.64.0.1', '::1', 'fd00::1', 'fe80::1', '::ffff:10.0.0.1']) assert.ok(isPrivateAddress(address), address);
  for (const address of ['93.184.216.34', '172.32.0.1', '2606:2800:220:1::1', '::ffff:93.184.216.34']) assert.ok(!isPrivateAddress(address), address);
});

test('sitemaps: pages and an index', () => {
  assert.deepEqual(sitemapEntries('<urlset><url><loc>https://a.example/x?a=1&amp;b=2</loc><lastmod>2026-01-02</lastmod></url><url><loc><![CDATA[https://a.example/y]]></loc></url></urlset>'), { index: false, entries: [{ url: 'https://a.example/x?a=1&b=2', lastmod: '2026-01-02' }, { url: 'https://a.example/y', lastmod: null }] });
  assert.equal(sitemapEntries('<sitemapindex><sitemap><loc>https://a.example/s.xml</loc></sitemap></sitemapindex>').index, true);
});

test('a crawl follows same-site links under its prefix, up to its limit, skipping what robots.txt asks and files', async (t) => {
  const dir = scratch(t);
  const start = 'https://guides.example.org/help/';
  const { fetch, asked } = site({
    'https://guides.example.org/robots.txt': 'User-agent: *\nDisallow: /help/staff',
    [start]: html('Help', 'Start here for hours.', ['/help/hours', '/help/staff', '/help/map.pdf', '/other', 'https://elsewhere.example.org/help/x']),
    'https://guides.example.org/help/hours': html('Hours', 'The library opens at nine.', ['/help/fines', '/help/rooms']),
    'https://guides.example.org/help/fines': html('Fines', 'No fines for books.'),
    'https://guides.example.org/help/rooms': html('Rooms', 'Never reached: the limit is three pages.')
  });
  const out = join(dir, 'out');
  const { sites, path } = await refresh(write(dir, pkg([{ kind: 'crawl', url: start, max_pages: 3 }])), { out, fetch });
  assert.equal(sites[0].read, 3);
  const doc = JSON.parse(readFileSync(path, 'utf8'));
  const { snapshot } = doc.knowledge_bases[0].websites[0];
  assert.deepEqual(snapshot.map((page) => page.url), [start, 'https://guides.example.org/help/hours', 'https://guides.example.org/help/fines']);
  assert.match(readFileSync(join(out, snapshot[1].path), 'utf8'), /opens at nine/);
  assert.equal(snapshot[1].title, 'Hours');
  assert.ok(asked.every((call) => /viable-harness-knowledge-refresh/.test(call.agent)), 'it says who is reading');
  assert.ok(!asked.some((call) => /staff|map\.pdf|elsewhere|\/other/.test(call.url)));
});

test('a page that can’t be reached keeps its snapshot, a page that is gone leaves it, and local search reads the result', async (t) => {
  const dir = scratch(t);
  const url = (name) => `https://guides.example.org/${name}`;
  const old = [{ url: url('hours'), title: 'Hours', path: 'files/a.md' }, { url: url('gone'), title: 'Gone', path: 'files/b.md' }, { url: url('new'), title: 'New', path: 'files/c.md' }];
  const zip = join(dir, 'help.viable.zip');
  const doc = pkg([{ kind: 'list', url: url('hours'), urls: [url('hours'), url('gone'), url('new'), url('fresh')], snapshot: old }]);
  writeFileSync(zip, zipFile([{ name: 'package.viable.json', data: JSON.stringify(doc) }, { name: 'files/a.md', data: 'The old hours: nine to five on weekdays.' }, { name: 'files/b.md', data: 'A gone page.' }, { name: 'files/c.md', data: 'An old page.' }]));
  const { fetch } = site({ [url('hours')]: 500, [url('new')]: html('New', 'Fresh words about parking behind the main library building.'), [url('fresh')]: html('Fresh', 'A page first read now.') });
  const out = join(dir, 'out');
  const { sites, path } = await refresh(zip, { out, fetch });
  assert.deepEqual([sites[0].read, sites[0].kept, sites[0].gone], [2, 1, 1]);
  assert.deepEqual(sites[0].failed, [{ url: url('hours'), reason: 'it answered 500' }]);
  const next = JSON.parse(readFileSync(path, 'utf8'));
  const { snapshot } = next.knowledge_bases[0].websites[0];
  assert.deepEqual(snapshot.map((page) => page.url).sort(), [url('fresh'), url('hours'), url('new')]);
  const kept = snapshot.find((page) => page.url === url('hours'));
  assert.equal(readFileSync(join(out, kept.path), 'utf8'), 'The old hours: nine to five on weekdays.');
  const searched = { ...next, agents: [{ ref: 'desk', name: 'Desk', graph: { entry: 's', nodes: [{ id: 's', type: 'knowledge', config: { knowledge_base_refs: ['kb-1'] }, next: 'o' }, { id: 'o', type: 'output', config: { text: '{{s.context}}' } }] } }] };
  const result = await runAgent(searched, { input: 'Where is the parking?', dir: out });
  assert.match(result.output.text, /Fresh words about parking/);
});

test('a site that asks for less is left alone, and a name that resolves privately is never fetched', async (t) => {
  const dir = scratch(t);
  const url = (name) => `https://busy.example.org/${name}`;
  const { fetch, asked } = site({ [url('a')]: 429, [url('b')]: html('B', 'Not read.') });
  const first = await refresh(write(dir, pkg([{ kind: 'list', url: url('a'), urls: [url('a'), url('b')] }])), { out: join(dir, 'one'), fetch });
  assert.match(first.sites[0].stopped, /answered 429/);
  assert.ok(!asked.some((call) => call.url === url('b')), 'it stopped');

  const second = site({ 'https://inside.example.org/x': html('X', 'Secret.') });
  const privately = await refresh(write(dir, pkg([{ kind: 'list', url: 'https://inside.example.org/x' }]), 'inside.json'), { out: join(dir, 'two'), fetch: second.fetch, lookup: async () => [{ address: '10.0.0.5', family: 4 }] });
  assert.equal(second.asked.length, 0, 'nothing was fetched');
  assert.equal(privately.sites[0].read, 0);
  assert.match(privately.sites[0].failed[0].reason, /public URL|private address/);
});

test('the pause between requests is kept, and robots.txt can ask for a longer one', async (t) => {
  const dir = scratch(t);
  const url = (name) => `https://slow.example.org/${name}`;
  const { fetch } = site({ 'https://slow.example.org/robots.txt': 'User-agent: *\nCrawl-delay: 3', [url('a')]: html('A', 'One.'), [url('b')]: html('B', 'Two.') });
  const waits = [];
  await refresh(write(dir, pkg([{ kind: 'list', url: url('a'), urls: [url('a'), url('b')] }])), { out: join(dir, 'out'), fetch, delayMs: 1000, sleep: async (ms) => { waits.push(ms); } });
  assert.ok(waits.length >= 2);
  assert.ok(waits.at(-1) > 2000 && waits.at(-1) <= 3000, `waited ${waits.at(-1)}`);
});

test('a package can’t write outside the folder it goes to', async (t) => {
  const dir = scratch(t);
  const doc = pkg([], { files: [{ ref: 'f', name: 'x.md', path: '../../escape.md' }] });
  await assert.rejects(refresh(write(dir, doc), { out: join(dir, 'out'), fetch: site({}).fetch }), /outside/);
});
