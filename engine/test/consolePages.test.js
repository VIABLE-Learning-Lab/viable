// The console's Agents, Chat pages and Knowledge: a library's chat button from an empty server, what a form can
// and can't change, and what an upload or an address can't get past. Stubs only: no model, no network.
import test from 'node:test';
import assert from 'node:assert/strict';
import { memoryStore } from '../../harness/src/store/store.js';
import { readZip, writeZip } from '../../harness/src/utils/zip.js';
import { formOf, graphFrom } from '../src/console/agentShape.js';
import { starterTutor } from '../src/console/course.js';
import { applyModels, stepModels } from '../src/server/models.js';
import { consoleRoutes } from '../src/console/index.js';
import { createApp } from '../src/server/app.js';
import { courseLibrary } from '../src/server/library.js';
import { validateGraph, linkKnowledgeRefs } from '../src/agents/graph.js';
import { validateDocument } from '../src/validate.js';

const TOKEN = 'a-token-of-some-length';
const BASE = 'http://server.test';
const KEY = 'a-provider-key-that-must-stay-here';
const VISITOR = 'a'.repeat(32);
const headers = { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' };

const reply = (content) => new Response(JSON.stringify({ choices: [{ message: { role: 'assistant', content }, finish_reason: 'stop' }], usage: { total_tokens: 7 } }), { headers: { 'content-type': 'application/json' } });

// A provider that says what it is told to, and keeps what it was sent.
function provider(answer = () => 'From the guides [1].') {
  const calls = [];
  const fetch = async (url, init = {}) => {
    const body = init.body ? JSON.parse(init.body) : null;
    calls.push({ url: String(url), body, key: init.headers?.authorization ?? null });
    return String(url).endsWith('/models') ? new Response(JSON.stringify({ data: [{ id: 'reply-model' }] }), { headers: { 'content-type': 'application/json' } }) : reply(answer(body));
  };
  return { calls, fetch };
}

// A made-up website, behind what stands for the server's public-only fetch.
function site(pages) {
  const asked = [];
  const made = { asked };
  const fetch = async (url, init) => {
    if (made.respond) return made.respond(url, init);
    asked.push(String(url));
    const page = pages[url];
    if (page === undefined) return new Response('nothing here', { status: 404, headers: { 'content-type': 'text/plain' } });
    return new Response(page, { status: 200, headers: { 'content-type': url.endsWith('.txt') ? 'text/plain' : 'text/html' } });
  };
  return Object.assign(made, { fetch });
}
const htmlPage = (title, words, links = []) => `<html><head><title>${title}</title></head><body><main><h1>${title}</h1><p>${words}</p>${links.map((href) => `<a href="${href}">link</a>`).join('')}</main></body></html>`;

async function server({ answer, pages = {}, store = memoryStore() } = {}) {
  const model = provider(answer);
  const web = site(pages);
  const handler = await createApp({ bytes: null, name: 'x', vars: { VIABLE_ENGINE_TOKEN: TOKEN, VIABLE_ENGINE_SECRET: 'a-secret' }, store, fetch: model.fetch, services: { httpFetch: web.fetch }, pages: { fetch: web.fetch } });
  const call = (method, path, body) => handler(new Request(`${BASE}/console/api/${path}`, { method, headers, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) }));
  const ok = async (method, path, body) => { const response = await call(method, path, body); const data = await response.json(); assert.ok(response.ok, `${path}: ${JSON.stringify(data)}`); return data; };
  const page = async (path) => { const response = await handler(new Request(`${BASE}/console/${path}`, { headers: { authorization: `Bearer ${TOKEN}`, accept: 'text/html' } })); assert.equal(response.status, 200, path); return response.text(); };
  const upload = (path, name, bytes) => handler(new Request(`${BASE}/console/api/${path}`, { method: 'POST', headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/octet-stream', 'x-file-name': encodeURIComponent(name) }, body: bytes }));
  const visit = (path, body, extra = {}) => handler(new Request(`${BASE}${path}`, { method: 'POST', headers: { origin: BASE, 'content-type': 'application/json', ...extra }, body: JSON.stringify(body) }));
  await ok('POST', 'providers', { name: 'A provider', base_url: 'http://model.test/v1', key: KEY }).then(({ id }) => ok('PUT', 'roles/reply', { provider: id, model: 'reply-model' }));
  return { handler, call, ok, page, upload, visit, store, model, web };
}
const guide = (title, words) => `# ${title}\n\n${words}\n`;
const kbPath = (go) => go.replace('/console/', '');
const version = async (s, path) => Number(/name="version" value="(\d+)"/.exec(await s.page(path))[1]);
const plainAgent = (ref = 'custom') => ({ ref, name: 'Custom', graph: { version: 1, name: 'Custom', entry: 'input', variables: {}, nodes: [{ id: 'input', type: 'input', config: {}, next: 'route' }, { id: 'route', type: 'condition', config: { field: 'context.x', op: 'truthy' }, branches: { true: 'a', false: 'a' } }, { id: 'a', type: 'llm', config: { model: 'named-model', system: 'Help.' }, next: 'b' }, { id: 'b', type: 'output', config: { text: '{{a.content}}' } }] } });

// --- The form's graphs --------------------------------------------------------------------------------

const VALUES = [
  { instructions: 'Help.', knowledge: [], check: false, web: false, memory: false },
  { instructions: 'Help.', knowledge: ['guides'], check: false, web: false, memory: false },
  { instructions: 'Help.', knowledge: ['guides', 'more'], check: true, web: false, memory: false },
  { instructions: 'Help.', knowledge: [], check: true, web: false, memory: false },
  { instructions: 'Help.', knowledge: [], check: false, web: true, memory: false },
  { instructions: 'Help.', knowledge: [], check: false, web: false, memory: true },
  { instructions: 'Help.\n\nWith two lines.', knowledge: ['guides'], check: true, web: true, memory: true }
];

test('each graph the form makes reads back as the form’s values, and runs', () => {
  for (const values of VALUES) {
    const graph = graphFrom({ name: 'A desk', ...values });
    assert.deepEqual(formOf(graph), { tries: 3, ...values });
    assert.deepEqual(formOf({ ...graph, nodes: graph.nodes.map(({ x: _x, y: _y, ...node }) => node) }), { tries: 3, ...values }, 'where the steps sit on a canvas doesn’t matter');
    validateGraph(linkKnowledgeRefs(graph, (ref) => `kb_${ref}`));
    assert.deepEqual(validateDocument({ format: 'viable.course-package', version: 1, knowledge_bases: [{ ref: 'guides', name: 'G' }, { ref: 'more', name: 'M' }], agents: [{ ref: 'desk', name: 'A desk', graph }] }, 'course-package').errors, []);
  }
});

test('how many tries a check takes is the form’s, and an agent from elsewhere can change it too', async () => {
  const quick = graphFrom({ name: 'A', instructions: 'Help.', check: true, tries: 1 });
  assert.equal(quick.nodes.find((node) => node.type === 'vetting').config.max_attempts, 1);
  assert.equal(formOf(quick).tries, 1);
  const s = await server();
  const checked = { ...plainAgent(), graph: { entry: 'in', nodes: [{ id: 'in', type: 'input', next: 'one' }, { id: 'one', type: 'vetting', next: 'two', config: { model: 'm', guideline: 'Be kind.', max_attempts: 3 } }, { id: 'two', type: 'vetting', next: 'out', config: { model: 'm', guideline: 'Be brief.' } }, { id: 'out', type: 'output', config: { text: '{{two.content}}' } }] } };
  await s.upload('courses/from-file', 'custom.viable.json', JSON.stringify({ format: 'viable.course-package', version: 1, title: 'From elsewhere', agents: [checked], knowledge_bases: [] }));
  const page = await s.page('agents/custom');
  assert.match(page, /Tries for each reply/);
  assert.match(page, /the shortest wait/);
  await s.ok('PUT', 'agents/custom/tries', { version: await version(s, 'agents/custom'), tries: 1 });
  const doc = await s.ok('GET', 'agents/custom/download');
  assert.deepEqual(doc.agents[0].graph.nodes.filter((node) => node.type === 'vetting').map((node) => node.config.max_attempts), [1, 1]);
  const refused = await s.call('PUT', 'agents/custom/tries', { version: await version(s, 'agents/custom'), tries: 9 });
  assert.equal(refused.status, 400);
});

test('a graph the form didn’t make is left alone, so a save can’t drop what someone set elsewhere', () => {
  const made = graphFrom({ name: 'A', instructions: 'Help.' });
  const changed = (work) => { const graph = structuredClone(made); work(graph); return graph; };
  assert.equal(formOf(changed((graph) => { graph.nodes[1].config.model = 'named-model'; })), null, 'a model of its own');
  assert.equal(formOf(changed((graph) => { graph.nodes[1].config.temperature = 0.2; })), null, 'a setting the form has no field for');
  assert.equal(formOf(changed((graph) => { graph.run_limits = { max_model_calls: 3 }; })), null, 'run limits');
  assert.equal(formOf(changed((graph) => { graph.nodes.push({ id: 'extra', type: 'note', config: { text: 'x' } }); })), null, 'another step');
  assert.equal(formOf(plainAgent().graph), null);
  assert.equal(formOf(null), null);
  assert.deepEqual(formOf(starterTutor().graph).knowledge, [], 'a blank course’s tutor is one the form can change');
});

test('the form’s models come from the console’s roles, and an agent’s check is a second model when one is set', () => {
  const graph = graphFrom({ name: 'A', instructions: 'Help.', check: true });
  const reviewed = stepModels(applyModels(graph, { reply: 'writes', reviewer: 'reads', map: {} }));
  assert.deepEqual(reviewed.map((row) => [row.step, row.role, row.model]), [['reply', 'reply', 'writes'], ['check', 'reply', 'writes'], ['check', 'reviewer', 'reads']]);
  const check = graph.nodes.find((node) => node.id === 'check');
  assert.equal(check.config.mode, 'simple');
  assert.equal(check.config.guideline, 'Help.');
  assert.equal(check.config.draft, '{{reply.content}}');
  assert.deepEqual(new Set(Object.keys(check.branches)), new Set(['passed', 'attention', 'unverified']));
});

// --- A library's whole case ---------------------------------------------------------------------------

test('from an empty server: knowledge, a chat page on it, and a visitor’s message answered from the guides, with nothing restarted', async () => {
  const s = await server();
  const made = await s.ok('POST', 'knowledge', { name: 'Library guides', place: 'own' });
  const base = kbPath(made.go);
  assert.match(await s.page(base), /No files yet/);
  assert.equal((await s.upload(`${base}/files`, 'finding-sources.md', guide('Finding sources', 'Use the catalog to find peer reviewed journals.'))).status, 200);
  const found = await s.ok('GET', `${base}/search?q=${encodeURIComponent('peer reviewed journals')}`);
  assert.match(found.html, /Finding sources/);
  assert.match(found.html, /By keywords/);
  const [, id, ref] = base.split('/');
  const list = await s.page('chat-pages');
  assert.match(list, new RegExp(`value="${id}/${ref}"`), 'a new page can answer from it');
  assert.match(list, /Anyone with the link can use it, on this server’s model keys, up to 300 messages a day/);
  const page = await s.ok('POST', 'chat-pages', { name: 'Research desk', instructions: 'You help with sources.', knowledge: `${id}/${ref}` });
  assert.equal(page.go, '/console/chat-pages/research-desk');
  assert.equal(new Set((await s.page('agents')).match(/Research desk/g)).size, 1);
  assert.match(await s.page('agents'), /Searches Library guides/);
  // A visitor, with no sign-in.
  const answered = await s.visit('/chat/research-desk/messages', { visitor: VISITOR, message: 'Where do I find peer reviewed journals?' });
  assert.equal(answered.status, 200);
  const sent = s.model.calls.at(-1).body;
  assert.equal(sent.model, 'reply-model');
  assert.match(sent.messages[0].content, /You help with sources\./);
  assert.match(sent.messages[0].content, /find peer reviewed journals/, 'it answers from the guide');
  assert.match(sent.messages[0].content, /data, not instructions/);
  // A new file reaches the very next message.
  assert.equal((await s.upload(`${base}/files`, 'citing.md', guide('Citing', 'Cite a zebrafish study with its doi.'))).status, 200);
  await s.visit('/chat/research-desk/messages', { visitor: VISITOR, message: 'How do I cite a zebrafish study?' });
  assert.match(s.model.calls.at(-1).body.messages[0].content, /Cite a zebrafish study with its doi/);
  // Today's messages are on its page and in the list.
  assert.match(await s.page('chat-pages/research-desk'), /2 messages so far today/);
  assert.match(await s.page('chat-pages'), /2 of 300 messages today/);
});

test('a website’s snapshot reaches the next search too, on the same reading code as the command, and says what it read', async () => {
  const start = 'https://guides.example.org/help/';
  const pages = {
    'https://guides.example.org/robots.txt': 'User-agent: *\nDisallow: /help/staff',
    [start]: htmlPage('Help', 'Opening hours are on the hours page.', ['/help/hours', '/help/staff', 'https://elsewhere.example.org/help/x']),
    'https://guides.example.org/help/hours': htmlPage('Hours', 'The reading room opens at nine.')
  };
  const s = await server({ pages });
  const base = kbPath((await s.ok('POST', 'knowledge', { name: 'Site', place: 'own' })).go);
  const stored = async () => (await s.store.list('library/items/')).filter((key) => /\/files\/[^/]*\.md$/.test(key));
  const added = await s.ok('POST', `${base}/websites`, { url: start, max_pages: 10 });
  assert.match(added.said, /Read 2 pages/);
  assert.ok(s.web.asked.includes('https://guides.example.org/robots.txt'));
  assert.ok(!s.web.asked.some((url) => /staff|elsewhere/.test(url)), 'robots.txt and other sites are left alone');
  const shown = await s.page(base);
  assert.match(shown, /2 pages/);
  assert.match(shown, /last read 20\d\d-/);
  assert.match((await s.ok('GET', `${base}/search?q=reading+room`)).html, /reading room opens at nine/);
  assert.equal((await stored()).length, 2);
  // An agent beside it searches the same pages.
  const [, id, ref] = base.split('/');
  await s.ok('POST', 'chat-pages', { name: 'Desk', instructions: 'Help.', knowledge: `${id}/${ref}` });
  await s.visit('/chat/desk/messages', { visitor: VISITOR, message: 'When does the reading room open?' });
  assert.match(s.model.calls.at(-1).body.messages[0].content, /opens at nine/);
  // Read again: what changed is what is found next, with no restart, and the old pages' bytes go.
  pages['https://guides.example.org/help/hours'] = htmlPage('Hours', 'The reading room opens at ten.');
  assert.match((await s.ok('POST', `${base}/websites/read`, { url: start })).said, /Read 2 pages/);
  assert.match((await s.ok('GET', `${base}/search?q=reading+room`)).html, /opens at ten/);
  await s.visit('/chat/desk/messages', { visitor: VISITOR, message: 'When does the reading room open?' });
  assert.match(s.model.calls.at(-1).body.messages[0].content, /opens at ten/);
  assert.equal((await stored()).length, 2);
  // A site that answers nothing now leaves what was read, and says so.
  for (const key of Object.keys(pages)) delete pages[key];
  const quiet = await s.ok('POST', `${base}/websites/read`, { url: start });
  assert.match(quiet.said, /Read 0 pages/);
  // Removed: not searched, and its bytes are gone.
  await s.ok('DELETE', `${base}/websites`, { url: start });
  assert.doesNotMatch((await s.ok('GET', `${base}/search?q=reading+room`)).html, /opens at/);
  assert.deepEqual(await stored(), []);
});

test('an address where nothing can be read isn’t added, so it can’t break a search', async () => {
  const s = await server({ pages: {} });
  const base = kbPath((await s.ok('POST', 'knowledge', { name: 'Site', place: 'own' })).go);
  const refused = await s.call('POST', `${base}/websites`, { url: 'https://nothing.example.org/' });
  assert.equal(refused.status, 422);
  assert.match((await refused.json()).error.message, /Nothing could be read/);
  assert.doesNotMatch(await s.page(base), /nothing\.example\.org/);
  assert.match((await s.ok('GET', `${base}/search?q=anything`)).html, /Nothing found/);
});

test('an address on a private network, or one that resolves to one, is never read', async () => {
  const s = await server();
  const base = kbPath((await s.ok('POST', 'knowledge', { name: 'Site', place: 'own' })).go);
  for (const url of ['http://guides.example.org/', 'https://127.0.0.1/', 'https://10.0.0.8/admin', 'https://localhost/x', 'https://[::1]/', 'https://169.254.169.254/latest/meta-data', 'https://intranet.local/', 'file:///etc/passwd', 'not an address']) {
    const answer = await s.call('POST', `${base}/websites`, { url });
    assert.equal(answer.status, 400, url);
    assert.match((await answer.json()).error.message, /https/);
  }
  assert.deepEqual(s.web.asked, [], 'nothing was fetched');
  // What the server's own fetch refuses (a name that resolves privately) leaves nothing behind.
  const refusing = memoryStore();
  const t = await createApp({ bytes: null, name: 'x', vars: { VIABLE_ENGINE_TOKEN: TOKEN }, store: refusing, fetch: provider().fetch, pages: { fetch: async () => { throw Object.assign(new Error('that name resolves to a private address, which this server doesn’t fetch.'), { status: 422, code: 'http_url_not_allowed' }); } } });
  const call = (method, path, body) => t(new Request(`${BASE}/console/api/${path}`, { method, headers, body: JSON.stringify(body) }));
  const { go } = await (await call('POST', 'knowledge', { name: 'Site', place: 'own' })).json();
  const refused = await call('POST', `${kbPath(go)}/websites`, { url: 'https://sneaky.example.org/' });
  assert.equal(refused.status, 422);
  assert.match((await refused.json()).error.message, /private address/);
  assert.equal((await refusing.list('library/items/')).filter((key) => key.includes('/files/')).length, 0, 'no page was kept');
});

// --- Files --------------------------------------------------------------------------------------------

test('a file: what is read goes in, a name is only text, and nothing else gets past', async () => {
  const s = await server();
  const base = kbPath((await s.ok('POST', 'knowledge', { name: 'Guides', place: 'own' })).go);
  const refused = async (name, bytes, pattern) => {
    const answer = await s.upload(`${base}/files`, name, bytes);
    assert.equal(answer.status, 400, name);
    assert.match((await answer.json()).error.message, pattern);
  };
  await refused('thesis.pdf', '%PDF-1.7 something', /PDF isn’t read here/);
  await refused('slides.pptx', 'PK something', /reads text, Markdown, CSV, JSON and HTML/);
  await refused('renamed.md', new Uint8Array([35, 32, 0, 1, 2]), /isn’t a text file/);
  await refused('empty.md', new Uint8Array(), /is empty/);
  // A name that tries to climb out, and to run in a page.
  assert.equal((await s.upload(`${base}/files`, '../../evil"><img src=x onerror=alert(1)>.md', guide('Plain', 'Harmless words about otters.'))).status, 200);
  const shown = await s.page(base);
  assert.doesNotMatch(shown, /<img src=x/);
  assert.match(shown, /evil__/);
  const [, id] = base.split('/');
  const held = await s.store.list(`library/items/${id}/files/`);
  assert.ok(held.every((key) => !/\.\./.test(decodeURIComponent(key))), 'its path is one of the server’s own');
  // What a file says stays text on the page.
  assert.equal((await s.upload(`${base}/files`, 'page.html', '<html><body><h1>Otters</h1><script>alert(2)</script><p>Otters float on their backs &lt;script&gt;x&lt;/script&gt;.</p></body></html>')).status, 200);
  const found = await s.ok('GET', `${base}/search?q=otters+float`);
  assert.doesNotMatch(found.html, /<script/);
  assert.match(found.html, /Otters float/);
  // A file with the same name takes its place, under the same ref, and its old bytes go.
  assert.equal((await s.upload(`${base}/files`, 'notes.txt', 'Otters eat clams while floating in the kelp.')).status, 200);
  const before = (await s.store.list(`library/items/${id}/files/`)).length;
  const replaced = await s.upload(`${base}/files`, 'notes.txt', 'Otters eat urchins while floating in the kelp.');
  assert.match((await replaced.json()).said, /Replaced notes\.txt/);
  assert.equal((await s.store.list(`library/items/${id}/files/`)).length, before);
  const after = await s.ok('GET', `${base}/search?q=otters+eat`);
  assert.match(after.html, /urchins/);
  assert.doesNotMatch(after.html, /clams/);
});

test('removing a file deletes it, and an older version comes back without it', async () => {
  const store = memoryStore();
  const library = courseLibrary({ store });
  const { id } = await library.add({ format: 'viable.course-package', version: 1, title: 'P', agents: [], files: [], knowledge_bases: [{ ref: 'kb', name: 'KB', file_refs: [] }] });
  const path = 'files/a.md';
  await library.putFile(id, path, new TextEncoder().encode('# A'));
  const { meta } = await library.change(id, null, (doc) => { doc.files.push({ ref: 'a', name: 'a.md', bytes: 3, path }); doc.knowledge_bases[0].file_refs.push('a'); });
  await library.change(id, null, (doc) => { doc.files = []; doc.knowledge_bases[0].file_refs = []; });
  await library.dropFile(id, path);
  await library.restore(id, meta.version);
  const { doc } = await library.get(id);
  assert.deepEqual(doc.files, []);
  assert.deepEqual(doc.knowledge_bases[0].file_refs, []);
});

test('a file’s path is checked wherever one comes from', async () => {
  const library = courseLibrary({ store: memoryStore() });
  const { id } = await library.add({ format: 'viable.course-package', version: 1, agents: [], knowledge_bases: [{ ref: 'kb', name: 'KB' }] });
  for (const path of ['../other/x', '/etc/passwd', 'C:\\x', 'files/../../x']) await assert.rejects(library.putFile(id, path, new Uint8Array([1])), { code: 'invalid_package' }, path);
  await assert.rejects(library.add({ format: 'viable.course-package', version: 1, knowledge_bases: [{ ref: 'kb', name: 'KB', websites: [{ url: 'https://a.example.org/', snapshot: [{ url: 'https://a.example.org/', path: '../../secret' }] }] }] }, { dir: '/x' }), { code: 'invalid_package' });
});

test('a package keeps and gives back all it names: a text copy, and a website’s pages', async () => {
  const held = { 'files/report.pdf': '%PDF-1.7', 'files/report.md': '# Report\n\nThe report says otters are thriving.', 'files/page-0001.md': '# Hours\n\nOpen at nine.' };
  const library = courseLibrary({ store: memoryStore(), readPath: async (name) => new TextEncoder().encode(held[name]) });
  const doc = { format: 'viable.course-package', version: 1, title: 'P', files: [{ ref: 'report', name: 'report.pdf', path: 'files/report.pdf', text_path: 'files/report.md' }], knowledge_bases: [{ ref: 'kb', name: 'KB', file_refs: ['report'], websites: [{ url: 'https://a.example.org/', snapshot: [{ url: 'https://a.example.org/', path: 'files/page-0001.md' }] }] }], agents: [{ ref: 'a', name: 'A', graph: graphFrom({ name: 'A', instructions: 'Help.', knowledge: ['kb'] }) }] };
  const { id } = await library.add(doc, { dir: '/somewhere' });
  const [entry] = await library.documents();
  assert.equal(new TextDecoder().decode(await library.readPath('files/report.md', entry.dir)), held['files/report.md']);
  const file = await library.download(id);
  const unpacked = await readZip(file.bytes, () => true, { binary: true });
  assert.deepEqual([...unpacked.keys()].sort(), ['files/page-0001.md', 'files/report.md', 'files/report.pdf', 'package.viable.json']);
});

// --- An agent's page ----------------------------------------------------------------------------------

test('an agent made in the form: changed there, run as it is saved, and saved as its shapes', async () => {
  const s = await server();
  const base = kbPath((await s.ok('POST', 'knowledge', { name: 'Guides', place: 'own' })).go);
  const [, id, ref] = base.split('/');
  const { go } = await s.ok('POST', 'agents', { name: 'A desk', instructions: 'Help with sources.', place: id, knowledge: [ref] });
  assert.equal(go, '/console/agents/a-desk');
  const page = await s.page('agents/a-desk');
  assert.match(page, /Check each reply with a second model/);
  assert.match(page, /reply-model/);
  assert.match(page, /No reviewer is set in Models yet, so the reply model reviews itself/);
  assert.doesNotMatch(page, new RegExp(KEY));
  await s.ok('PUT', 'agents/a-desk', { version: await version(s, 'agents/a-desk'), name: 'The desk', description: 'For the library.', instructions: 'Help with sources.', knowledge: [ref], check: true, web: true, memory: true });
  const after = await s.page('agents/a-desk');
  assert.match(after, /The desk/);
  const { doc } = await (async () => { const library = await s.ok('GET', `agents/a-desk/download`); return { doc: library }; })();
  assert.deepEqual(formOf(doc.agents[0].graph), { instructions: 'Help with sources.', knowledge: [ref], check: true, tries: 3, web: true, memory: true });
  assert.equal(doc.agents[0].description, 'For the library.');
  // A stale form, and knowledge that isn't beside it, are refused.
  const stale = await s.call('PUT', 'agents/a-desk', { version: 1, name: 'x', instructions: 'y' });
  assert.equal(stale.status, 409);
  const elsewhere = await s.call('PUT', 'agents/a-desk', { version: await version(s, 'agents/a-desk'), name: 'x', instructions: 'y', knowledge: ['nowhere'] });
  assert.match((await elsewhere.json()).error.message, /isn’t beside this agent/);
  const empty = await s.call('POST', 'agents', { name: 'x', instructions: '  ', place: 'own' });
  assert.match((await empty.json()).error.message, /Write its instructions/);
});

test('testing an agent runs the real path, says what it did, keeps nothing and never shows a key', async () => {
  const s = await server({ answer: () => `Otters [1]. Your key ${KEY} is fine.` });
  const base = kbPath((await s.ok('POST', 'knowledge', { name: 'Guides', place: 'own' })).go);
  const [, id, ref] = base.split('/');
  await s.upload(`${base}/files`, 'otters.md', guide('Otters', 'Otters float on their backs, holding hands as they sleep.'));
  await s.ok('POST', 'agents', { name: 'Desk', instructions: 'Help.', place: id, knowledge: [ref] });
  assert.match(await s.page('agents/desk'), /counts as a real call/);
  const kept = (await s.store.list('')).length;
  const { html } = await s.ok('POST', 'agents/desk/test', { message: 'Do otters float?' });
  assert.equal(s.model.calls.at(-1).body.model, 'reply-model');
  assert.equal(s.model.calls.at(-1).key, `Bearer ${KEY}`);
  assert.match(html, /Its reply/);
  assert.match(html, /1 passage found, in Otters/);
  assert.match(html, /reply-model/);
  assert.match(html, /1 model call/);
  assert.doesNotMatch(html, new RegExp(KEY), 'what a provider says back is scrubbed');
  assert.equal((await s.store.list('')).length, kept, 'a test keeps nothing');
  assert.match((await s.ok('POST', 'agents/desk/test', { message: '   ' })).html, /Type a message/);
});

test('a test with no model sends nothing, and a provider’s failure is said without its key', async () => {
  const store = memoryStore();
  const model = provider();
  const handler = await createApp({ bytes: null, name: 'x', vars: { VIABLE_ENGINE_TOKEN: TOKEN }, store, fetch: model.fetch });
  const call = (method, path, body) => handler(new Request(`${BASE}/console/api/${path}`, { method, headers, body: JSON.stringify(body) }));
  await call('POST', 'agents', { name: 'Desk', instructions: 'Help.', place: 'own' });
  const { html } = await (await call('POST', 'agents/desk/test', { message: 'Hello?' })).json();
  assert.match(html, /No model writes replies yet/);
  assert.equal(model.calls.length, 0);
  const shown = await (await handler(new Request(`${BASE}/console/agents/desk`, { headers: { authorization: `Bearer ${TOKEN}` } }))).text();
  assert.match(shown, /No model writes replies yet/);

  const failing = memoryStore();
  const bad = await createApp({ bytes: null, name: 'x', vars: { VIABLE_ENGINE_TOKEN: TOKEN, VIABLE_ENGINE_SECRET: 'a-secret' }, store: failing, fetch: async () => new Response(JSON.stringify({ error: { message: `Your key ${KEY} is wrong.` } }), { status: 401, headers: { 'content-type': 'application/json' } }) });
  const on = (method, path, body) => bad(new Request(`${BASE}/console/api/${path}`, { method, headers, body: JSON.stringify(body) })).then((response) => response.json());
  const { id } = await on('POST', 'providers', { name: 'P', base_url: 'http://model.test/v1', key: KEY });
  await on('PUT', 'roles/reply', { provider: id, model: 'm' });
  await on('POST', 'agents', { name: 'Desk', instructions: 'Help.', place: 'own' });
  const failed = await on('POST', 'agents/desk/test', { message: 'Hello?' });
  assert.match(failed.html, /It didn’t answer/);
  assert.doesNotMatch(failed.html, new RegExp(KEY));
});

test('what the form turns on really runs: a check that passes keeps the reply, web pages come through the public-only fetch, and memory is each visitor’s', async () => {
  const isReview = (body) => String(body.messages.at(-1)?.content).startsWith('Assistant Response:');
  let verdict = 'PASS';
  const toolSteps = [];
  const s = await server({
    pages: { 'https://guides.example.org/hours': htmlPage('Hours', 'The reading room opens at nine.') },
    answer: (body) => (isReview(body) ? verdict : toolSteps.shift() ?? 'A reply as it was written.')
  });
  const version_ = () => version(s, 'agents/desk');
  await s.ok('POST', 'agents', { name: 'Desk', instructions: 'Only talk about the library.', place: 'own' });
  await s.ok('PUT', 'agents/desk', { version: await version_(), name: 'Desk', instructions: 'Only talk about the library.', check: true });
  const passed = await s.ok('POST', 'agents/desk/test', { message: 'Hello?' });
  assert.match(passed.html, /A reply as it was written/);
  assert.match(passed.html, /passed after 1 review/);
  verdict = 'FAIL: it talks about the weather.';
  const failed = await s.ok('POST', 'agents/desk/test', { message: 'Hello?' });
  assert.match(failed.html, /I couldn’t get a reply ready/);
  assert.match(failed.html, /none passed after 3 reviews/);
  verdict = 'PASS';
  // Web pages.
  await s.ok('PUT', 'agents/desk', { version: await version_(), name: 'Desk', instructions: 'Only talk about the library.', web: true });
  toolSteps.push(JSON.stringify({ tool: 'fetch_url', arguments: { url: 'https://guides.example.org/hours' } }), JSON.stringify({ final: 'It opens at nine.' }));
  const read = await s.ok('POST', 'agents/desk/test', { message: 'When does it open? https://guides.example.org/hours' });
  assert.match(read.html, /It opens at nine/);
  assert.match(read.html, /1 tool call: fetch_url/);
  assert.ok(s.web.asked.includes('https://guides.example.org/hours'));
  // Memory, on a chat page, for one visitor.
  await s.ok('PUT', 'agents/desk', { version: await version_(), name: 'Desk', instructions: 'Only talk about the library.', memory: true });
  await s.ok('POST', 'chat-pages/desk/status', { status: 'active' });
  toolSteps.push(JSON.stringify({ tool: 'save_memory', arguments: { fact: 'Studies marine biology.' } }), JSON.stringify({ final: 'Noted.' }));
  assert.equal((await s.visit('/chat/desk/messages', { visitor: VISITOR, message: 'I study marine biology.' })).status, 200);
  const held = (await s.store.list('memory/')).filter((key) => key.startsWith('memory/chat:'));
  assert.equal(held.length, 1, 'the visitor’s, under an anonymous hash');
  assert.match(JSON.stringify(await s.store.get(held[0])), /marine biology/);
});

test('an agent from elsewhere runs as it is: its steps are shown read-only with their models, and its look and page can still change', async () => {
  const s = await server();
  const pkg = { format: 'viable.course-package', version: 1, title: 'From elsewhere', agents: [plainAgent()], knowledge_bases: [] };
  const added = await s.upload('courses/from-file', 'custom.viable.json', JSON.stringify(pkg));
  assert.equal((await added.json()).go, '/console/agents');
  const page = await s.page('agents/custom');
  assert.match(page, /steps were made elsewhere and run as they are/);
  assert.match(page, /changed here/);
  assert.match(page, /reply-model/, 'the model it uses now');
  assert.match(page, /Branch/);
  assert.doesNotMatch(page, /Its instructions/);
  const refused = await s.call('PUT', 'agents/custom', { version: await version(s, 'agents/custom'), name: 'x', instructions: 'y' });
  assert.match((await refused.json()).error.message, /Developer Platform/);
  await s.ok('PUT', 'agents/custom/look', { version: await version(s, 'agents/custom'), title: 'Custom desk', greeting: 'Hello there', starters: 'One\nTwo\n\nThree', color: '#7a2b2b', theme: 'light', notice: '', placeholder: 'Ask' });
  await s.ok('POST', 'chat-pages/custom/status', { status: 'active' });
  const open = await (await s.handler(new Request(`${BASE}/chat/custom`, { headers: { accept: 'text/html' } }))).text();
  assert.match(open, /Custom desk/);
  assert.match(open, /Hello there/);
  assert.match(open, /Three/);
  assert.match(open, /7a2b2b/);
  assert.match(await s.page('agents/custom'), /Custom desk/);
});

test('removing an agent is refused while an activity or another agent uses it, and says which', async () => {
  const s = await server();
  await s.ok('POST', 'courses', { title: 'Fractions' });
  await s.ok('POST', 'courses/fractions/activities', { title: 'Practice', kind: 'chat', version: 1 });
  const refused = await s.call('DELETE', 'agents/tutor', {});
  assert.equal(refused.status, 409);
  assert.match((await refused.json()).error.message, /“Practice” uses this agent/);
  const kept = await s.page('agents/tutor');
  assert.match(kept, /“Practice” uses this agent, so it can’t be removed/, 'said before anyone asks');
  assert.doesNotMatch(kept, /id="remove-agent"/);
  assert.match(kept, /On the Developer Platform, models it doesn’t have become its default/, 'its file names this server’s model');
  assert.match(await s.page('courses/fractions/activities/practice'), /href="\/console\/agents\/tutor"/, 'the activity links to it');
  assert.match(await s.page('agents'), /Used in .*Practice/);
  // One called by another.
  const caller = graphFrom({ name: 'Caller', instructions: 'Help.' });
  caller.nodes[1] = { ...caller.nodes[1], type: 'agent', config: { ...caller.nodes[1].config, tools: { agents: ['helper'] } } };
  const pkg = { format: 'viable.course-package', version: 1, title: 'Two', agents: [{ ref: 'caller', name: 'Caller', graph: caller }, { ref: 'helper', name: 'Helper', graph: graphFrom({ name: 'Helper', instructions: 'Help.' }) }] };
  await s.upload('courses/from-file', 'two.viable.json', JSON.stringify(pkg));
  const called = await s.call('DELETE', 'agents/helper', {});
  assert.match((await called.json()).error.message, /“Caller” calls this agent/);
  // A file with both downloads with both: an agent travels with those it calls.
  const down = await (await s.call('GET', 'agents/caller/download')).json();
  assert.deepEqual(down.agents.map((agent) => agent.ref), ['caller', 'helper']);
  assert.deepEqual((await s.ok('GET', 'agents/helper/download')).agents.map((agent) => agent.ref), ['helper']);
});

test('removing an agent with a chat page removes what visitors said; knowledge beside it stays for the next agent', async () => {
  const s = await server();
  const base = kbPath((await s.ok('POST', 'knowledge', { name: 'Guides', place: 'own' })).go);
  const [, id, ref] = base.split('/');
  await s.ok('POST', 'chat-pages', { name: 'Desk', instructions: 'Help.', knowledge: `${id}/${ref}` });
  await s.visit('/chat/desk/messages', { visitor: VISITOR, message: 'Hello?' });
  assert.ok((await s.store.list('chats/desk/')).length > 0);
  const inUse = await s.call('DELETE', base, {});
  assert.equal(inUse.status, 409);
  assert.match((await inUse.json()).error.message, /“Desk” searches this/);
  assert.match((await s.ok('DELETE', 'agents/desk', {})).go, /agents$/);
  assert.deepEqual(await s.store.list('chats/desk/'), []);
  assert.deepEqual(await s.store.list('conversations/'), []);
  assert.equal((await s.handler(new Request(`${BASE}/chat/desk`, { headers: { accept: 'text/html' } }))).status, 404);
  assert.match(await s.page(base), /No agent searches it yet/);
  // The last thing in a package takes the package with it.
  assert.equal((await s.ok('DELETE', base, {})).go, '/console/knowledge');
  assert.deepEqual(await s.store.list(`library/items/${id}/`), []);
  await s.ok('POST', 'agents', { name: 'Alone', instructions: 'Help.', place: 'own' });
  const held = (await s.store.list('library/items/')).length;
  assert.ok(held > 0);
  await s.ok('DELETE', 'agents/alone', {});
  assert.deepEqual(await s.store.list('library/items/'), []);
});

test('an agent’s file holds it and the knowledge it searches, leaves a course behind, passes the format, and opens on another server', async () => {
  const s = await server();
  await s.ok('POST', 'courses', { title: 'Fractions' });
  const base = kbPath((await s.ok('POST', 'knowledge', { name: 'Guides', place: 'own' })).go);
  await s.upload(`${base}/files`, 'otters.md', guide('Otters', 'Otters float on their backs, holding hands as they sleep.'));
  const [, id, ref] = base.split('/');
  await s.ok('POST', 'chat-pages', { name: 'Desk', instructions: 'Help.', knowledge: `${id}/${ref}` });
  const file = await s.call('GET', 'agents/desk/download');
  assert.match(file.headers.get('content-disposition'), /desk\.viable\.zip/);
  const bytes = new Uint8Array(await file.arrayBuffer());
  const unpacked = await readZip(bytes, () => true, { binary: true });
  const doc = JSON.parse(new TextDecoder().decode(unpacked.get('package.viable.json')));
  assert.deepEqual(validateDocument(doc, 'course-package').errors, []);
  assert.equal(doc.course, undefined);
  assert.deepEqual(doc.agents.map((agent) => agent.name), ['Desk']);
  assert.deepEqual(doc.knowledge_bases.map((kb) => kb.name), ['Guides']);
  assert.equal(doc.agents[0].chat_page.status, 'active');
  // A course's agent alone leaves its course and its activities behind.
  const tutor = await s.ok('GET', 'agents/tutor/download');
  assert.equal(tutor.course, undefined);
  assert.deepEqual(validateDocument(tutor, 'course-package').errors, []);
  // On another server, what the file says of its page waits to be turned on, and the knowledge came with it.
  const other = await server();
  const added = await other.upload('courses/from-file', 'desk.viable.zip', bytes);
  assert.equal((await added.json()).go, '/console/agents');
  assert.match(await other.page('agents'), /Chat page paused/);
  assert.equal((await other.handler(new Request(`${BASE}/chat/desk`, { headers: { accept: 'text/html' } }))).status, 404);
  const { html } = await other.ok('POST', 'agents/desk/test', { message: 'Do otters float?' });
  assert.match(html, /1 passage found/);
});

test('what the server was given at the start changes here too: the first change makes the copy, with what was uploaded beside its own files', async () => {
  const graph = graphFrom({ name: 'Given', instructions: 'Help.', knowledge: ['kb'] });
  const doc = { format: 'viable.course-package', version: 1, title: 'Given', files: [{ ref: 'old', name: 'old.md', path: 'files/old.md' }], knowledge_bases: [{ ref: 'kb', name: 'Given guides', file_refs: ['old'] }], agents: [{ ref: 'given', name: 'Given', graph }] };
  const bytes = await writeZip([{ name: 'package.viable.json', data: JSON.stringify(doc) }, { name: 'files/old.md', data: guide('Old', 'Otters were here first, and they floated on their backs.') }]);
  const model = provider();
  const handler = await createApp({ bytes, name: 'given.viable.zip', vars: { VIABLE_ENGINE_TOKEN: TOKEN, VIABLE_ENGINE_SECRET: 'a-secret' }, store: memoryStore(), fetch: model.fetch });
  const call = (method, path, body) => handler(new Request(`${BASE}/console/api/${path}`, { method, headers, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) }));
  const shown = await (await handler(new Request(`${BASE}/console/agents/given`, { headers: { authorization: `Bearer ${TOKEN}` } }))).text();
  assert.match(shown, /The first change makes a copy/);
  const entry = /href="\/console\/knowledge\/([\w-]+)\/kb"/.exec(await (await handler(new Request(`${BASE}/console/knowledge`, { headers: { authorization: `Bearer ${TOKEN}` } }))).text())[1];
  const added = await handler(new Request(`${BASE}/console/api/knowledge/${entry}/kb/files`, { method: 'POST', headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/octet-stream', 'x-file-name': 'new.md' }, body: guide('New', 'Otters arrived again later, and they also float on their backs.') }));
  assert.equal(added.status, 200, await added.clone().text());
  const found = await (await call('GET', `knowledge/${entry}/kb/search?q=otters+float`)).json();
  assert.match(found.html, /Old/);
  assert.match(found.html, /New/);
  // And an agent file with no package of its own.
  const plain = await createApp({ bytes: new TextEncoder().encode(JSON.stringify({ format: 'viable.agent', format_version: 1, name: 'Desk', graph: graphFrom({ name: 'Desk', instructions: 'Help.' }) })), name: 'desk.agent.json', vars: { VIABLE_ENGINE_TOKEN: TOKEN, VIABLE_ENGINE_SECRET: 'a-secret' }, store: memoryStore(), fetch: model.fetch });
  const at = (method, path, body) => plain(new Request(`${BASE}/console/api/${path}`, { method, headers, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) }));
  assert.equal((await at('POST', 'chat-pages/desk/status', { status: 'active' })).status, 200);
  assert.equal((await plain(new Request(`${BASE}/chat/desk`, { headers: { accept: 'text/html' } }))).status, 200);
  const file = await (await at('GET', 'agents/desk/download')).json();
  assert.deepEqual(validateDocument(file, 'course-package').errors, []);
});

// --- A chat page --------------------------------------------------------------------------------------

test('a chat page: what turning it on says, its limits, and pausing it', async () => {
  const s = await server();
  await s.ok('POST', 'agents', { name: 'Desk', instructions: 'Help.', place: 'own' });
  const setup = await s.page('chat-pages/desk');
  assert.match(setup, /no chat page yet/);
  assert.match(setup, /Anyone with the link can use it, on this server’s model keys, up to 300 messages a day/);
  assert.equal((await s.handler(new Request(`${BASE}/chat/desk`, { headers: { accept: 'text/html' } }))).status, 404, 'nothing is public until it is turned on');
  await s.ok('POST', 'chat-pages/desk/status', { status: 'active' });
  const on = await s.page('chat-pages/desk');
  assert.match(on, /<svg class="qr"/, 'its QR code is inline');
  assert.doesNotMatch(on, /only opens on this computer/);
  assert.match(on, new RegExp(`${BASE}/embed\\.js`));
  assert.match(on, /data-agent=&quot;desk&quot;/);
  assert.doesNotMatch(on, /spending cap/i, 'a cap this server doesn’t enforce isn’t offered');
  assert.doesNotMatch(on, new RegExp(KEY));
  assert.equal((await s.handler(new Request(`${BASE}/chat/desk`, { headers: { accept: 'text/html' } }))).status, 200);
  // Limits go through the page's own settings, and a limit is enforced on the very next message.
  const form = { version: await version(s, 'chat-pages/desk'), daily_limit: 10, visitor_per_minute: 2, visitor_per_day: 1, allowed_sites: '', button_label: 'Ask us', button_side: 'left' };
  await s.ok('PUT', 'chat-pages/desk', form);
  assert.equal((await s.visit('/chat/desk/messages', { visitor: VISITOR, message: 'One' })).status, 200);
  const stopped = await s.visit('/chat/desk/messages', { visitor: VISITOR, message: 'Two' });
  assert.equal(stopped.status, 429);
  const config = await (await s.handler(new Request(`${BASE}/chat/desk/config`, { headers: { origin: 'https://any.example.org' } }))).json();
  assert.deepEqual([config.launcher.label, config.launcher.position], ['Ask us', 'left']);
  for (const [field, value] of [['daily_limit', 3], ['daily_limit', 999999], ['visitor_per_minute', 0], ['visitor_per_day', -1]]) {
    const bad = await s.call('PUT', 'chat-pages/desk', { ...form, version: await version(s, 'chat-pages/desk'), [field]: value });
    assert.equal(bad.status, 400, `${field} ${value}`);
  }
  // Allowed sites: a bad address is refused, and a site not on the list gets no button.
  const badSite = await s.call('PUT', 'chat-pages/desk', { ...form, version: await version(s, 'chat-pages/desk'), allowed_sites: 'http://plain.example.org' });
  assert.match((await badSite.json()).error.message, /not a website address/);
  await s.ok('PUT', 'chat-pages/desk', { ...form, version: await version(s, 'chat-pages/desk'), allowed_sites: 'guides.example.edu\nhttps://guides.example.edu/deep/path' });
  const allowed = await s.handler(new Request(`${BASE}/chat/desk/config`, { headers: { origin: 'https://guides.example.edu' } }));
  assert.equal(allowed.status, 200);
  assert.equal((await s.handler(new Request(`${BASE}/chat/desk/config`, { headers: { origin: 'https://other.example.org' } }))).status, 403);
  assert.match(await s.page('chat-pages/desk'), /https:\/\/guides\.example\.edu/);
  // Paused: its link says so, and its settings wait.
  await s.ok('POST', 'chat-pages/desk/status', { status: 'paused' });
  const paused = await s.handler(new Request(`${BASE}/chat/desk`, { headers: { accept: 'text/html' } }));
  assert.equal(paused.status, 404);
  assert.match(await paused.text(), /isn’t available/);
  assert.match(await s.page('chat-pages'), /Paused/);
  assert.match(await s.page('chat-pages/desk'), /Ask us/);
});

test('a new page’s limits stay conservative, and a page from a file starts paused', async () => {
  const s = await server();
  await s.ok('POST', 'chat-pages', { name: 'New', instructions: 'Help.' });
  const { agents: [agent] } = await s.ok('GET', 'agents/new/download');
  assert.equal(agent.chat_page.status, 'active');
  assert.equal(agent.chat_page.settings.daily_limit, 300);
  assert.equal(agent.chat_page.settings.limits.visitor_per_minute, 8);
  assert.equal(agent.chat_page.settings.limits.visitor_per_day, 50);
  assert.equal(agent.chat_page.settings.title, undefined, 'its look stays the agent’s');
  const pkg = { format: 'viable.course-package', version: 1, title: 'Live', agents: [{ ...plainAgent('live'), chat_page: { status: 'active', settings: {} } }] };
  await s.upload('courses/from-file', 'live.viable.json', JSON.stringify(pkg));
  assert.equal((await s.handler(new Request(`${BASE}/chat/live`, { headers: { accept: 'text/html' } }))).status, 404);
  assert.match(await s.page('chat-pages'), /Paused/);
});

test('a page in a file whose settings don’t hold is still shown, and is told why when it is turned on', async () => {
  const s = await server();
  const pkg = { format: 'viable.course-package', version: 1, title: 'Bad', agents: [{ ...plainAgent('bad'), chat_page: { status: 'active', settings: { allowed_sites: ['http://plain.example.org'] } } }] };
  assert.equal((await s.upload('courses/from-file', 'bad.viable.json', JSON.stringify(pkg))).status, 200);
  assert.match(await s.page('chat-pages/bad'), /Paused/);
  assert.match(await s.page('chat-pages'), /Paused/);
  const turned = await s.call('POST', 'chat-pages/bad/status', { status: 'active' });
  assert.equal(turned.status, 400);
  assert.match((await turned.json()).error.message, /not a website address/);
  assert.equal((await s.handler(new Request(`${BASE}/chat/bad`, { headers: { accept: 'text/html' } }))).status, 404);
});

test('a spending cap a package set is said not to hold here', async () => {
  const s = await server();
  const pkg = { format: 'viable.course-package', version: 1, title: 'Capped', agents: [{ ...plainAgent('capped'), chat_page: { status: 'active', settings: { limits: { daily_cost: 5 } } } }] };
  await s.upload('courses/from-file', 'capped.viable.json', JSON.stringify(pkg));
  assert.match(await s.page('chat-pages/capped'), /cap isn’t enforced here/);
});

test('this computer’s own address says so, and gives the network’s addresses instead', async () => {
  const run = async (origin, addresses) => {
    const store = memoryStore();
    const library = courseLibrary({ store });
    await library.add({ format: 'viable.course-package', version: 1, title: 'D', agents: [{ ref: 'desk', name: 'Desk', graph: graphFrom({ name: 'Desk', instructions: 'Help.' }), chat_page: { status: 'active', settings: {} } }] });
    const { modelSettings } = await import('../src/server/settings.js');
    const settings = modelSettings({ store });
    const route = consoleRoutes({ settings, library, teacherToken: TOKEN, addresses })({ options: {}, store, served: new Map(), runTurn: null, readBody: null, readJson: null });
    return (await route(new Request(`${origin}/console/chat-pages/desk`, { headers: { authorization: `Bearer ${TOKEN}` } }), new URL(`${origin}/console/chat-pages/desk`))).text();
  };
  const alone = await run('http://127.0.0.1:5621', []);
  assert.match(alone, /only opens on this computer/);
  assert.doesNotMatch(alone, /class="qr"/, 'no QR code for a link no phone can open');
  const networked = await run('http://localhost:8080', ['http://192.168.1.20:8080']);
  assert.match(networked, /http:\/\/192\.168\.1\.20:8080\/chat\/desk/);
  assert.match(networked, /http:\/\/192\.168\.1\.20:8080\/embed\.js/);
  assert.doesNotMatch(networked, /localhost:8080\/chat\/desk/);
  const reachable = await run('https://desk.library.example.edu', []);
  assert.doesNotMatch(reachable, /only opens on this computer/);
  assert.match(reachable, /https:\/\/desk\.library\.example\.edu\/embed\.js/);
});

// --- The first door -----------------------------------------------------------------------------------

test('the navigation, and the door for someone who only wants a chat page', async () => {
  const s = await server();
  const courses = await s.page('courses');
  const nav = /<nav aria-label="The console">(.*?)<\/nav>/s.exec(courses)[1];
  assert.deepEqual([...nav.matchAll(/>([^<]+)<\/a>/g)].map((match) => match[1]), ['Ask', 'Courses', 'Chat pages', 'Agents', 'Knowledge', 'Models']);
  assert.match(courses, /href="\/console\/chat-pages">Start with a chat page/);
  await s.ok('POST', 'courses', { title: 'A course' });
  assert.doesNotMatch(await s.page('courses'), /Start with a chat page/);
});

test('where a knowledge base lives: in a course, beside an agent, or on its own; and an agent picks only what is beside it', async () => {
  const s = await server();
  await s.ok('POST', 'courses', { title: 'Fractions' });
  const entries = await s.page('knowledge');
  const place = /value="(pkg_[0-9a-f]+)">In the course “Fractions”/.exec(entries)[1];
  const made = await s.ok('POST', 'knowledge', { name: 'Fractions notes', place });
  assert.match(await s.page(kbPath(made.go)), /Fractions notes/);
  assert.match(await s.page('knowledge'), /<h2 class="group">Fractions<\/h2>/);
  assert.match(await s.page('agents/tutor'), /Fractions notes/);
  await s.ok('POST', 'agents', { name: 'Alone', instructions: 'Help.', place: 'own' });
  const alone = await s.page('agents/alone');
  assert.doesNotMatch(alone, /Fractions notes/);
  assert.match(alone, /Add a knowledge base/);
  // Ten fills a package; the eleventh is told so, plainly.
  for (let n = 2; n <= 10; n += 1) await s.ok('POST', 'knowledge', { name: `Notes ${n}`, place });
  const full = await s.call('POST', 'knowledge', { name: 'One more', place });
  assert.match((await full.json()).error.message, /at most 10 knowledge bases/);
  // A package that holds only knowledge isn't a course, and isn't served as one.
  await s.ok('POST', 'knowledge', { name: 'Alone too', place: 'own' });
  assert.equal(((await s.page('courses')).match(/class="course-card/g) || []).length, 1);
});

test('guidance in an activity shows in the console, and saving the page keeps it', async () => {
  const s = await server();
  const agent = plainAgent();
  await s.upload('courses/from-file', 'with.viable.json', JSON.stringify({ format: 'viable.course-package', version: 1, title: 'With guidance', agents: [agent], knowledge_bases: [], course: { code: 'with-guidance', title: 'With guidance', activities: [{ key: 'practice', title: 'Practice', agent_ref: agent.ref, teaching: { goal: 'Add fractions.', guidance: [{ text: 'Ask how they got it.', when: ['attempt'], source: 'A framework' }] } }] } }));
  const path = 'courses/with-guidance/activities/practice';
  const page = await s.page(path);
  assert.match(page, /Guidance from research/);
  assert.match(page, /Ask how they got it\./);
  await s.ok('PUT', path, { version: await version(s, path), title: 'Practice', kind: 'chat', agent_ref: agent.ref, release: 'open', done_when: 'auto', teaching: { goal: 'Add fractions well.', help: 'hint' } });
  const { course } = await s.ok('GET', 'courses/with-guidance/download');
  assert.equal(course.activities[0].teaching.goal, 'Add fractions well.');
  assert.deepEqual(course.activities[0].teaching.guidance.map((item) => item.text), ['Ask how they got it.']);
});

test('guidance from research: browsed by topic with what isn\'t known, chosen once each, up to the limit, and removed', async () => {
  const { GUIDANCE } = await import('../../harness/src/components/guidance.js');
  const { ok, call, page } = await server();
  const { go } = await ok('POST', 'courses', { title: 'Fractions' });
  const code = go.split('/').at(-1);
  const added = await ok('POST', `courses/${code}/activities`, { title: 'Practice', kind: 'chat' });
  const key = added.go.split('/').at(-1);
  const api = `courses/${code}/activities/${key}`;
  const shown = await page(`courses/${code}/activities/${key}`);
  assert.match(shown, /Choose from what research says/);
  for (const framework of GUIDANCE) assert.ok(shown.includes(framework.label), framework.label);
  assert.ok(GUIDANCE.every((framework) => framework.evidence.unknown), 'each says what isn’t known');

  const framework = GUIDANCE[0];
  await ok('POST', `${api}/guidance`, { component: framework.id, item: 1 });
  await ok('POST', `${api}/guidance`, { component: framework.id, item: 1 });
  const after = await page(`courses/${code}/activities/${key}`);
  assert.ok(after.includes('Chosen'));
  assert.ok(after.includes(`DELETE ${api}/guidance/0`));
  assert.ok(!after.includes(`DELETE ${api}/guidance/1`), 'chosen once');

  assert.equal((await call('POST', `${api}/guidance`, { component: 'nobody/nothing', item: 1 })).status, 404);
  assert.equal((await call('POST', `${api}/guidance`, { component: framework.id, item: 99 })).status, 404);

  let items = 1;
  for (const each of GUIDANCE) for (let number = 1; number <= each.runs.items.length && items < 20; number += 1) {
    if (each === framework && number === 1) continue;
    await ok('POST', `${api}/guidance`, { component: each.id, item: number });
    items += 1;
  }
  const full = await call('POST', `${api}/guidance`, { component: GUIDANCE.at(-1).id, item: GUIDANCE.at(-1).runs.items.length });
  assert.equal(full.status, 400);
  await ok('DELETE', `${api}/guidance/0`, {});
  assert.ok(!(await page(`courses/${code}/activities/${key}`)).includes(`DELETE ${api}/guidance/19`));
});

test('a detector: nothing is sent until someone asks, no names go, its marks come back joined to the class, and only https is taken', async () => {
  const asked = [];
  const answers = { marks: [{ turn_index: 0, label: 'Gaming the hints', evidence: 'Asked for the next hint at once, three times.' }] };
  const store = memoryStore();
  const s = await server({ store, answer: () => 'A reply.' });
  const { go } = await s.ok('POST', 'courses', { title: 'Marks' });
  const code = go.split('/').at(-1);
  const added = await s.ok('POST', `courses/${code}/activities`, { title: 'Talk', kind: 'chat' });
  const key = added.go.split('/').at(-1);
  await s.ok('POST', `courses/${code}/activities/${key}/release`, { release: 'open' });
  await s.ok('POST', `courses/${code}/people`, { name: 'Ada Lovelace' });
  const manifest = { id: 'lab/hints', version: '1.0.0', slot: 'detector', label: 'Hint use', summary: 'Marks hints asked for without trying.', runs: { kind: 'http', entry: 'https://lab.example/detect' }, receives: ['learning_events'], sends_to: ['lab.example'], uses_models: false, license: { code: 'MIT' }, authors: ['A Lab'], cite: 'A Lab (2026).', evidence: { original: 'x', integration: 'y', unknown: 'z' }, risk: 'medium', maintainer: { name: 'A Lab' }, harness: '>=0.3.0 <1.0.0' };
  const before = await s.upload(`courses/${code}/detectors`, 'manifest.json', JSON.stringify(manifest));
  assert.equal(before.status, 200, await before.clone().text());
  const local = await s.upload(`courses/${code}/detectors`, 'manifest.json', JSON.stringify({ ...manifest, id: 'lab/local', runs: { kind: 'mcp', entry: 'tool', server: { command: 'node', args: ['x.js'] } } }));
  assert.equal(local.status, 400, 'this page can’t start a program');
  const shown = await s.page(`courses/${code}/progress/look`);
  assert.match(shown, /From detectors/);
  assert.match(shown, /to lab\.example/);
  assert.equal(s.web.asked.length, 0, 'adding one sends nothing');
  // A learner, with a turn on record.
  const people = await store.list(`courses/${code}/learners/`);
  const learner = await store.get(people[0]);
  await store.put(`courses/${code}/turns/${learner.id}/2026-11-05T10:00:00.000Z-a`, { activity: key, conversation_id: 'agtc_aaaaaaaaaaaa', run_id: 'agtr_a', message: 'give me the hint', reply: 'What did you try?', at: '2026-11-05T10:00:00.000Z' });
  s.web.respond = (url, init) => { asked.push({ url: String(url), body: JSON.parse(init.body) }); return new Response(JSON.stringify(answers), { status: 200, headers: { 'content-type': 'application/json' } }); };
  const ran = await s.ok('POST', `courses/${code}/detectors/lab--hints/run`, {});
  assert.match(ran.said, /1 mark from 1 record/);
  assert.equal(asked.length, 1);
  assert.equal(asked[0].url, 'https://lab.example/detect');
  assert.ok(!JSON.stringify(asked[0].body).includes('Ada'), 'no name goes');
  assert.ok(!JSON.stringify(asked[0].body).includes(learner.code), 'no code goes');
  const after = await s.page(`courses/${code}/progress/look`);
  assert.match(after, /Ada Lovelace/);
  assert.match(after, /Gaming the hints/);
  await s.ok('DELETE', `courses/${code}/detectors/lab--hints`, {});
  assert.doesNotMatch(await s.page(`courses/${code}/progress/look`), /Gaming the hints/);
});
