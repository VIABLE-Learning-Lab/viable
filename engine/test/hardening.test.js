// What an adversarial review found, kept found: each of these once went wrong.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { memoryStore } from '../../harness/src/store/store.js';
import { fileStore } from '../../harness/src/store/fileStore.js';
import { openAICompatible } from '../../harness/src/models.js';
import { createApp } from '../src/server/app.js';
import { courseLibrary } from '../src/server/library.js';
import { addLines, addSection, sectionsOf, setRelease } from '../src/server/classList.js';

const TOKEN = 'a-token-of-some-length';
const BASE = 'http://server.test';
const headers = { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' };
const VISITOR = 'v'.repeat(32);
const graph = { version: 1, name: 'Tutor', entry: 'input', variables: {}, nodes: [{ id: 'input', type: 'input', config: {}, next: 'reply' }, { id: 'reply', type: 'llm', config: { model: 'm', system: 'Help.' }, next: 'output' }, { id: 'output', type: 'output', config: { text: '{{reply.content}}' } }] };
const pkg = (title, more = {}, course = {}) => ({ format: 'viable.course-package', version: 1, title, agents: [{ ref: 'tutor', name: 'Tutor', graph }], course: { title, audience: 'adults', identify: 'browser', sections_from: 'none', data_level: 'minimal', units: [], activities: [{ title: 'First', role: 'instruction', agent_ref: 'tutor', release: 'open', done_when: 'auto' }], ...course }, ...more });
const reply = () => new Response(JSON.stringify({ id: 'x', choices: [{ message: { role: 'assistant', content: 'Fine.' } }], usage: { prompt_tokens: 1, completion_tokens: 1 } }), { headers: { 'content-type': 'application/json' } });
const app = (store = memoryStore(), more = {}) => createApp({ bytes: null, name: 'x', vars: { VIABLE_ENGINE_TOKEN: TOKEN, VIABLE_ENGINE_SECRET: 'a-secret', OPENAI_API_KEY: 'a-key' }, store, fetch: async () => reply(), ...more });
const api = (handler, method, path, body) => handler(new Request(`${BASE}/console/api/${path}`, { method, headers, ...(body ? { body: JSON.stringify(body) } : {}) }));
const ok = async (response) => { const data = await response.clone().json().catch(() => null); assert.ok(response.ok, JSON.stringify(data)); return data; };
const upload = (handler, doc, name = 'it.json') => handler(new Request(`${BASE}/console/api/courses/from-file`, { method: 'POST', headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/octet-stream', 'x-file-name': encodeURIComponent(name) }, body: JSON.stringify(doc) }));
const post = (handler, path, body, extra = {}) => handler(new Request(`${BASE}${path}`, { method: 'POST', headers: { origin: BASE, 'content-type': 'application/json' }, body: JSON.stringify(body) }), extra);
const page = async (handler, path) => (await handler(new Request(`${BASE}${path}`, { headers: { accept: 'text/html' } }))).text();

test('a visitor that isn’t one is refused before it is a key, however long', async () => {
  const handler = await app();
  await ok(await upload(handler, pkg('Long')));
  const big = 'x'.repeat(1024 * 1024 - 100);
  const rated = await post(handler, '/course/long/first/rate', { visitor: big, run_id: 'x', rating: 1 });
  assert.equal(rated.status, 400);
  assert.equal((await post(handler, '/course/long/first/after', { visitor: big })).status, 204);
});

test('an uploaded agent file’s chat page starts paused, as the page says', async () => {
  const handler = await app();
  await ok(await upload(handler, { format: 'viable.agent', name: 'Selfstart', graph, chat_page: { status: 'active', settings: { daily_limit: 5000 } } }, 'selfstart.agent.json'));
  assert.match(await page(handler, '/chat/selfstart'), /isn’t available|not available|Not available/i);
  const { providers } = await ok(await api(handler, 'GET', 'models'));
  assert.ok(Array.isArray(providers));
});

test('a chat page that can’t work is refused when it is turned on, and one already held can’t stop a server', async () => {
  const handler = await app();
  const bad = { ...pkg('Bad page'), agents: [{ ref: 'tutor', name: 'Tutor', graph, chat_page: { status: 'active', settings: { daily_limit: 'not a number' } } }] };
  await ok(await upload(handler, bad));
  const refused = await api(handler, 'POST', 'chat-pages/tutor/status', { status: 'active' });
  assert.ok(refused.status >= 400 && refused.status < 500, String(refused.status));
  assert.match((await refused.json()).error.message, /daily_limit|whole number/);
  await ok(await api(handler, 'POST', 'courses', { title: 'Still going' }));
  assert.match(await page(handler, '/course/still-going'), /Still going/, 'nothing else stopped');
  // One saved before this check, or by another version: the rest still serves.
  const store = memoryStore();
  const held = courseLibrary({ store });
  await held.add({ ...bad, agents: [{ ...bad.agents[0], chat_page: { status: 'active', settings: { daily_limit: 'not a number' } } }] });
  const errors = console.error;
  console.error = () => {};
  try {
    const started = await app(store);
    assert.match(await page(started, '/course/bad-page'), /Bad page/);
    await ok(await api(started, 'POST', 'courses', { title: 'Another' }));
    assert.match(await page(started, '/course/another'), /Another/, 'a later change still reaches learners');
  } finally { console.error = errors; }
});

test('a question’s ID can’t climb out of an address', async () => {
  const handler = await app();
  const doc = pkg('Evil', { question_sets: [{ ref: 'quiz', title: 'Quiz', items: [{ id: '../../../../../courses/victim', type: 'open', prompt: 'Why?' }] }] });
  assert.equal((await upload(handler, doc)).status, 400);
  await ok(await upload(handler, pkg('Odd', { question_sets: [{ ref: 'quiz', title: 'Quiz', items: [{ type: 'open', prompt: 'Why?' }] }] })));
  assert.match(await (await handler(new Request(`${BASE}/console/courses/odd/questions/quiz`, { headers }))).text(), /items\/q1/, 'one with no ID gets one');
});

test('an upload can’t take the address of a course already answering there', async () => {
  const store = memoryStore();
  const handler = await createApp({ bytes: new TextEncoder().encode(JSON.stringify(pkg('Fractions'))), name: 'given.json', vars: { VIABLE_ENGINE_TOKEN: TOKEN }, store });
  const home = await ok(await post(handler, '/course/fractions/home', { visitor: VISITOR }));
  const made = await ok(await upload(handler, pkg('Attacker', {}, { code: 'fractions' })));
  assert.equal(made.go, '/console/courses/attacker');
  const again = await ok(await post(handler, '/course/fractions/home', { visitor: VISITOR }));
  assert.equal(again.course.title, 'Fractions');
  assert.equal(again.learner.code, home.learner.code);
});

test('a package added in the browser can’t start a program, even with an allowed ID', async () => {
  const handler = await app();
  const manifest = { id: 'acme/trusted', name: 'x', slot: 'step', runs: { kind: 'mcp', command: 'sh' } };
  const doc = { ...pkg('Runs'), agents: [{ ref: 'tutor', name: 'Tutor', graph: { ...graph, nodes: [graph.nodes[0], { id: 'reply', type: 'component', config: { manifest }, next: 'output' }, graph.nodes[2]] } }] };
  const refused = await upload(handler, doc);
  assert.equal(refused.status, 400);
});

test('a survey’s host gets an ID that opens nothing, at an https address only', async () => {
  const handler = await app();
  const survey = (url) => pkg('Survey', {}, { activities: [{ title: 'Tell us', role: 'survey', release: 'open', done_when: 'opened', survey: { url } }] });
  await ok(await upload(handler, survey('https://survey.example/s')));
  const home = await ok(await post(handler, '/course/survey/home', { visitor: VISITOR }));
  const opened = await ok(await post(handler, '/course/survey/tell-us/open', { visitor: VISITOR }));
  const pid = new URL(opened.redirect).searchParams.get('pid');
  assert.notEqual(pid, home.learner.code);
  assert.equal((await post(handler, '/course/survey/join', { visitor: 'w'.repeat(32), code: pid })).status, 404, 'it signs in to nothing');
  await ok(await upload(handler, pkg('Script', {}, { activities: [{ title: 'Bad', role: 'survey', release: 'open', done_when: 'opened', survey: { url: 'javascript:alert(1)' } }] })));
  await ok(await post(handler, '/course/script/home', { visitor: VISITOR }));
  assert.equal((await post(handler, '/course/script/bad/open', { visitor: VISITOR })).status, 409);
});

const questions = { question_sets: [{ ref: 'quiz', title: 'Quiz', items: [{ id: 'one', type: 'single', prompt: 'A question only for the class', choices: [{ id: 'a', text: 'Yes' }, { id: 'b', text: 'No' }], answer: { choice: 'a' } }] }] };
const quiz = (course = {}, activity = {}) => pkg('Quiz', questions, { activities: [{ title: 'Check', role: 'instruction', agent_ref: 'tutor', release: 'open', done_when: 'auto', workspace: { ai: 'right', title: null, layout: { ai_width: 36, resizable: true, collapsible: true }, panels: [{ id: 'questions', type: 'questions', title: 'Questions', set_ref: 'quiz', feedback: 'each', tries: 2, hints: false }] }, ...activity }], ...course });

test('a page for some, not all, holds only its panels’ names until the server knows who is asking', async () => {
  const store = memoryStore();
  const handler = await app(store);
  await ok(await upload(handler, quiz({ identify: 'code' })));
  const html = await page(handler, '/course/quiz/check');
  assert.doesNotMatch(html, /A question only for the class/);
  assert.match(html, /"waiting":true/);
  assert.equal((await post(handler, '/course/quiz/check/panels', { visitor: VISITOR })).status, 403, 'nobody yet');
  const list = await ok(await api(handler, 'POST', 'courses/quiz/people', { list: 'Ada Lovelace' }));
  assert.ok(list);
  const [key] = await store.list('courses/quiz/learners/');
  const { code } = await store.get(key);
  await ok(await post(handler, '/course/quiz/join', { visitor: VISITOR, code }));
  const panels = await ok(await post(handler, '/course/quiz/check/panels', { visitor: VISITOR }));
  assert.match(JSON.stringify(panels.panels), /A question only for the class/);
  assert.equal(panels.panels[0].items[0].answer, undefined, 'never its key');
});

test('open to everyone, a course that asks nobody keeps its panels in the page', async () => {
  const handler = await app();
  await ok(await upload(handler, quiz()));
  assert.match(await page(handler, '/course/quiz/check'), /A question only for the class/);
});

test('hidden but open for one section: others get names only, and the section gets the questions', async () => {
  const store = memoryStore();
  const handler = await app(store);
  await ok(await upload(handler, quiz({ sections_from: 'choose' }, { release: 'hidden' })));
  const { section } = await addSection(store, 'quiz', { name: 'Period A' });
  await addSection(store, 'quiz', { name: 'Period B' });
  const [, b] = await sectionsOf(store, 'quiz');
  await setRelease(store, 'quiz', 'check', section.id, 'open');
  const html = await page(handler, '/course/quiz/check');
  assert.doesNotMatch(html, /A question only for the class/);
  await ok(await post(handler, '/course/quiz/home', { visitor: VISITOR }));
  await ok(await post(handler, '/course/quiz/section', { visitor: VISITOR, section: b.key }));
  assert.equal((await post(handler, '/course/quiz/check/panels', { visitor: VISITOR })).status, 403);
  const other = 'p'.repeat(32);
  await ok(await post(handler, '/course/quiz/home', { visitor: other }));
  await ok(await post(handler, '/course/quiz/section', { visitor: other, section: section.key }));
  assert.match(JSON.stringify((await ok(await post(handler, '/course/quiz/check/panels', { visitor: other }))).panels), /A question only for the class/);
});

test('a small zip can’t keep more than a package may hold, and a failure leaves nothing behind', async () => {
  const store = memoryStore();
  const library = courseLibrary({ store, readPath: async () => new Uint8Array(30 * 1024 * 1024) });
  const files = Array.from({ length: 10 }, (_, i) => ({ ref: `f${i}`, name: `f${i}.md`, path: `files/f${i}.md` }));
  await assert.rejects(library.add(pkg('Bomb', { files }), { dir: '/x' }), { code: 'package_too_large' });
  assert.deepEqual((await store.list('library/items/')), []);
});

test('new learners from one address have a ceiling far under a script’s, and a whole class is under it', async () => {
  const handler = await app();
  await ok(await upload(handler, pkg('Crowd')));
  const statuses = [];
  for (let i = 0; i < 305; i += 1) statuses.push((await post(handler, '/course/crowd/home', { visitor: `v${String(i).padStart(31, '0')}` }, { address: '9.9.9.9' })).status);
  assert.equal(statuses.slice(0, 30).every((status) => status === 200), true);
  assert.ok(statuses.at(-1) === 429);
});

test('wrong tokens are counted, as at the sign-in form', async () => {
  const handler = await app();
  const wrong = () => handler(new Request(`${BASE}/console/api/models`, { headers: { authorization: 'Bearer nope' } }), { address: '8.8.8.8' });
  for (let i = 0; i < 30; i += 1) assert.equal((await wrong()).status, 401);
  assert.equal((await wrong()).status, 429);
  assert.equal((await handler(new Request(`${BASE}/console/api/models`, { headers }), { address: '7.7.7.7' })).status, 200, 'others aren’t locked out');
});

test('two saves on one version: one gets a conflict, not one silently lost', async () => {
  const handler = await app();
  await ok(await api(handler, 'POST', 'courses', { title: 'Race' }));
  const save = (title) => api(handler, 'PUT', 'courses/race', { version: 1, title, audience: 'adults', data_level: 'minimal' });
  const [a, b] = await Promise.all([save('One'), save('Two')]);
  assert.deepEqual([a.status, b.status].sort(), [200, 409]);
});

test('sections and a pasted list added at once are all kept, once', async () => {
  const store = memoryStore();
  await Promise.all(['A', 'B', 'C', 'D'].map((name) => addSection(store, 'race', { name })));
  assert.equal((await sectionsOf(store, 'race')).length, 4);
  await Promise.all([addLines(store, 'race', 'Ada\nGrace'), addLines(store, 'race', 'Ada\nGrace')]);
  assert.equal((await store.list('courses/race/learners/')).length, 2);
});

test('answers sent at once count as tries, and a lock on handing in holds', async () => {
  const handler = await app();
  await ok(await upload(handler, quiz()));
  await ok(await post(handler, '/course/quiz/home', { visitor: VISITOR }));
  const tries = await Promise.all(Array.from({ length: 6 }, () => post(handler, '/course/quiz/check/questions', { visitor: VISITOR, panel: 'questions', action: 'answer', item: 'one', response: { choice: 'b' } })));
  assert.equal(tries.filter((response) => response.ok).length, 2);
});

test('a store’s files and folders are its owner’s alone', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'viable-store-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const store = fileStore(join(dir, 'data'));
  await store.put('courses/a/learners/one', { name: 'Ada' });
  assert.equal(statSync(join(dir, 'data', 'courses', 'a', 'learners', 'one.json')).mode & 0o077, 0);
  assert.equal(statSync(join(dir, 'data', 'courses', 'a')).mode & 0o077, 0);
  assert.deepEqual(await store.list('courses/a/learners/'), ['courses/a/learners/one']);
  assert.deepEqual(await store.list('courses/a/lear'), ['courses/a/learners/one'], 'a prefix may end anywhere');
  assert.deepEqual(await store.list('nothing/here/'), []);
});

test('going back to a version doesn’t widen who gets in', async () => {
  const handler = await app();
  await ok(await upload(handler, pkg('Back')));
  await ok(await api(handler, 'PUT', 'courses/back/people/how', { identify: 'code', sections_from: 'none' }));
  await ok(await api(handler, 'POST', 'courses/back/restore', { to: 1 }));
  const html = await (await handler(new Request(`${BASE}/console/courses/back/people`, { headers }))).text();
  assert.match(html, /Personal codes on cards/);
  assert.match(JSON.stringify(await (await post(handler, '/course/back/home', { visitor: VISITOR })).json()), /join/, 'a visitor is still asked');
});

test('a package’s image at another address doesn’t reach learners', async () => {
  const handler = await app();
  const doc = { ...pkg('Image'), agents: [{ ref: 'tutor', name: 'Tutor', graph, profile: { avatar_url: 'https://tracker.example/pixel.png' } }] };
  await ok(await upload(handler, doc));
  assert.doesNotMatch(await page(handler, '/course/image/first'), /tracker\.example/);
});

test('a provider’s words can’t carry its key onward', async () => {
  const call = openAICompatible({ baseUrl: 'https://p.example/v1', apiKey: 'sk-secret-key', model: 'm', fetch: async () => new Response(JSON.stringify({ error: { message: 'Bad key sk-secret-key' } }), { status: 401, headers: { 'content-type': 'application/json' } }) });
  await assert.rejects(call({}, { model: 'm', messages: [{ role: 'user', content: 'hi' }] }), (error) => !error.message.includes('sk-secret-key') && /\[its key\]/.test(error.message));
});

test('signing out clears the session wherever a sign-in set it, and the root lists nothing', async () => {
  const handler = await app();
  await ok(await upload(handler, pkg('One')));
  await ok(await upload(handler, pkg('Two')));
  const out = await handler(new Request(`${BASE}/teacher/signout`, { method: 'POST', headers: { origin: BASE } }));
  const paths = out.headers.getSetCookie().map((cookie) => /Path=([^;]+)/.exec(cookie)[1]);
  for (const path of ['/teacher', '/console', '/course']) assert.ok(paths.includes(path), path);
  const root = await page(handler, '/');
  assert.doesNotMatch(root, /\/course\/one|\/course\/two/);
});

test('a closed course’s linked files stop being served', async () => {
  const handler = await app();
  const doc = pkg('Linked', { files: [{ ref: 'guide', name: 'guide.md', path: 'files/guide.md' }], knowledge_bases: [{ ref: 'kb', name: 'KB', file_refs: ['guide'], file_links: true }] });
  doc.agents[0].graph = { ...graph, nodes: [graph.nodes[0], { id: 'search', type: 'knowledge', config: { knowledge_base_refs: ['kb'] }, next: 'reply' }, graph.nodes[1], graph.nodes[2]] };
  doc.agents[0].graph.nodes[0] = { ...graph.nodes[0], next: 'search' };
  const zip = await (await import('../../harness/src/utils/zip.js')).writeZip([{ name: 'package.viable.json', data: JSON.stringify(doc) }, { name: 'files/guide.md', data: '# Guide' }]);
  const up = await handler(new Request(`${BASE}/console/api/courses/from-file`, { method: 'POST', headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/octet-stream', 'x-file-name': 'linked.viable.zip' }, body: zip }));
  await ok(up);
  assert.equal((await handler(new Request(`${BASE}/package-files/linked/guide`))).status, 200);
  await ok(await api(handler, 'POST', 'courses/linked/status', { status: 'closed' }));
  assert.equal((await handler(new Request(`${BASE}/package-files/linked/guide`))).status, 404);
});

test('a learner’s daily limit is the learner’s, on any browser', async () => {
  const handler = await app();
  await ok(await upload(handler, pkg('Daily', {}, { learner_daily_messages: 1 })));
  const home = await ok(await post(handler, '/course/daily/home', { visitor: VISITOR }));
  assert.ok((await post(handler, '/course/daily/first/messages', { visitor: VISITOR, message: 'one' })).ok);
  const other = 'o'.repeat(32);
  await ok(await post(handler, '/course/daily/join', { visitor: other, code: home.learner.code }));
  assert.equal((await post(handler, '/course/daily/first/messages', { visitor: other, message: 'two' })).status, 429);
});

test('links a course shows are web addresses, and odd addresses and themes aren’t errors', async () => {
  const handler = await app();
  await ok(await upload(handler, pkg('Links', {}, { appearance: { theme: 'constructor' }, info: { links: [{ label: 'Bad', url: 'javascript:alert(1)' }, { label: 'Good', url: 'https://good.example/' }] } })));
  const home = await page(handler, '/course/links');
  assert.doesNotMatch(home, /javascript:alert/);
  assert.equal((await handler(new Request(`${BASE}/console/api/%E0%A4%A`, { headers }))).status, 400);
  assert.equal((await handler(new Request(`${BASE}/embed.js`))).headers.get('vary'), 'host');
});

test('a section’s own moments the AI writes first at, set on the activity’s page, replace the activity’s for its learners only', async () => {
  const store = memoryStore();
  const handler = await app(store);
  const made = await ok(await upload(handler, pkg('Speaks', {}, { sections_from: 'choose' })));
  const { section: a } = await addSection(store, 'speaks', { name: 'Period A' });
  const { section: b } = await addSection(store, 'speaks', { name: 'Period B' });
  const form = { version: made.version, title: 'First', release: 'open', teaching: { goal: 'Practice.', speaks_up: { wrong: '1' }, sections: { [a.id]: { help: '', note: '', speaks: 'own', speaks_up: { quiet: '3', most: '2', gap: '3' } }, [b.id]: { help: '', note: '', speaks: 'off' } } } };
  const saved = await ok(await api(handler, 'PUT', 'courses/speaks/activities/first', form));
  assert.ok(saved);
  const html = await (await handler(new Request(`${BASE}/console/courses/speaks/activities/first`, { headers: { accept: 'text/html', authorization: `Bearer ${TOKEN}` } }))).text();
  assert.match(html, /Period A’s moments/, 'each section’s moments are on the activity’s page');
  const say = async (visitor, kind) => (await post(handler, '/course/speaks/first/messages', { visitor, event: { kind } })).json();
  const join = async (visitor, section) => { await ok(await post(handler, '/course/speaks/home', { visitor })); await ok(await post(handler, '/course/speaks/section', { visitor, section: section.key })); };
  const inA = 'a'.repeat(32), inB = 'b'.repeat(32);
  await join(inA, a);
  await join(inB, b);
  assert.equal((await say(inA, 'wrong')).error?.code, 'speaks_first_off', 'Period A has moments of its own, and a wrong answer isn’t one');
  assert.equal((await say(inA, 'quiet')).reply?.text, 'Fine.');
  assert.equal((await say(inB, 'wrong')).error?.code, 'speaks_first_off', 'never, for Period B');
  const learner = async (visitor) => ok(await post(handler, '/course/speaks/first/learner', { visitor }));
  assert.deepEqual((await learner(inA)).speaks_up, { quiet: { minutes: 3 }, most: 2, gap: 3 });
  assert.equal((await learner(inB)).speaks_up, null);
  assert.match(await page(handler, '/course/speaks/first'), /"asks":true/, 'the page asks who it is, to watch for their section’s moments');
});
