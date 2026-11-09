// What a server holds, and the console that changes it: a package edited in the browser reaches learners with no restart, on every instance, and comes back out as the same format.
import test from 'node:test';
import assert from 'node:assert/strict';
import { memoryStore } from '../../harness/src/store/store.js';
import { readZip } from '../../harness/src/utils/zip.js';
import { createApp } from '../src/server/app.js';
import { courseLibrary } from '../src/server/library.js';
import { validateDocument } from '../src/validate.js';

const TOKEN = 'a-token-of-some-length';
const URL_BASE = 'http://server.test';
const headers = { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' };

const pkg = (title = 'Fractions') => ({
  format: 'viable.course-package', version: 1, title,
  files: [{ ref: 'guide', name: 'guide.md', type: 'text/markdown', path: 'files/guide.md' }],
  agents: [{ ref: 'tutor', name: 'Tutor', graph: { version: 1, name: 'Tutor', entry: 'input', variables: {}, nodes: [{ id: 'input', type: 'input', config: {}, next: 'reply' }, { id: 'reply', type: 'llm', config: { model: 'm', system: 'Help.' }, next: 'output' }, { id: 'output', type: 'output', config: { text: '{{reply.content}}' } }] } }],
  course: { title, audience: 'adults', identify: 'browser', sections_from: 'none', data_level: 'minimal', units: [], activities: [{ title: 'First steps', role: 'instruction', agent_ref: 'tutor', release: 'open', done_when: 'auto' }] }
});
const app = (store = memoryStore()) => createApp({ bytes: null, name: 'x', vars: { VIABLE_ENGINE_TOKEN: TOKEN, VIABLE_ENGINE_SECRET: 'a-secret' }, store, fetch: async () => new Response('{}') });
const call = (handler, method, path, body) => handler(new Request(`${URL_BASE}/console/api/${path}`, { method, headers, ...(body ? { body: JSON.stringify(body) } : {}) }));
const json = async (response) => { const data = await response.json(); assert.ok(response.ok, JSON.stringify(data)); return data; };
const page = (handler, path) => handler(new Request(`${URL_BASE}${path}`, { headers: { accept: 'text/html' } }));
const visit = (handler, path, body) => handler(new Request(`${URL_BASE}${path}`, { method: 'POST', headers: { origin: URL_BASE, 'content-type': 'application/json' }, body: JSON.stringify(body) }));

test('a package added keeps its files in the store, and comes back out whole', async () => {
  const store = memoryStore();
  const reads = [];
  const library = courseLibrary({ store, readPath: async (name, dir) => { reads.push([name, dir]); return new TextEncoder().encode('# A guide'); } });
  const { id, code } = await library.add(pkg(), { dir: '/somewhere' });
  assert.equal(code, 'fractions');
  assert.deepEqual(reads, [['files/guide.md', '/somewhere']]);
  // Read from the store now, with no folder.
  const [entry] = await library.documents();
  assert.equal(new TextDecoder().decode(await library.readPath('files/guide.md', entry.dir)), '# A guide');
  const file = await library.download(id);
  assert.equal(file.name, 'fractions.viable.zip');
  const unpacked = await readZip(file.bytes, () => true, { binary: true });
  assert.equal(new TextDecoder().decode(unpacked.get('files/guide.md')), '# A guide');
  const again = JSON.parse(new TextDecoder().decode(unpacked.get('package.viable.json')));
  assert.deepEqual(validateDocument(again, 'course-package').errors, []);
  assert.equal(again.course.code, 'fractions');
});

test('addresses stay when titles change, two packages never share one, and two people can’t overwrite each other', async () => {
  const library = courseLibrary({ store: memoryStore(), readPath: async () => new Uint8Array([1]) });
  const first = await library.add(pkg(), { dir: '/x' });
  const second = await library.add(pkg(), { dir: '/x' });
  assert.deepEqual([first.code, second.code], ['fractions', 'fractions-2']);
  const held = await library.documents();
  assert.deepEqual([first.id, second.id].map((id) => held.find((entry) => entry.id === id).doc.agents[0].slug), ['tutor', 'tutor-2']);
  const { doc, meta } = await library.change(first.id, 1, (draft) => { draft.course.title = 'A new name'; draft.course.activities[0].title = 'Renamed'; });
  assert.equal(meta.version, 2);
  assert.equal(doc.course.code, 'fractions');
  assert.equal(doc.course.activities[0].key, 'first-steps');
  await assert.rejects(library.change(first.id, 1, () => {}), { code: 'version_conflict' });
  await assert.rejects(library.change(first.id, 2, (draft) => { draft.course.activities[0].agent_ref = 'nobody'; }), { code: 'invalid_package' }, 'what wouldn’t run isn’t saved');
  assert.equal((await library.get(first.id)).meta.version, 2);
  await library.restore(first.id, 1);
  const restored = await library.get(first.id);
  assert.equal(restored.doc.course.title, 'Fractions');
  assert.equal(restored.meta.version, 3);
});

test('a file given at the start is served until it is edited, and the copy takes its place, at the same address', async () => {
  const store = memoryStore();
  const given = [{ doc: { ...pkg('Given'), files: [] }, dir: null, zip: null, file: 'given.json', name: 'given.json' }];
  const library = courseLibrary({ store, given });
  const [entry] = await library.entries();
  assert.equal(entry.meta.version, 0);
  await assert.rejects(library.remove(entry.id), { code: 'given_file' });
  const { doc } = await library.change(entry.id, 0, (draft) => { draft.course.title = 'Edited'; });
  assert.equal(doc.course.code, 'given');
  const after = await library.entries();
  assert.equal(after.length, 1);
  assert.equal(after[0].doc.course.title, 'Edited');
  // The next start finds the copy, not the file.
  const later = await courseLibrary({ store, given }).entries();
  assert.equal(later.length, 1);
  assert.equal(later[0].doc.course.title, 'Edited');
});

test('no store: what was given is served, and nothing can be changed', async () => {
  const library = courseLibrary({ store: null, given: [{ doc: pkg(), file: 'a.json', name: 'a.json' }] });
  assert.equal((await library.documents()).length, 1);
  await assert.rejects(library.add(pkg()), { code: 'no_store' });
});

test('a course made in the console reaches learners with no restart, and a change reaches another instance', async () => {
  const store = memoryStore();
  const one = await app(store);
  const other = await app(store);
  assert.match(await (await page(other, '/course/fractions')).text(), /isn’t open right now/, 'an unknown course says so on a page');
  const { go } = await json(await call(one, 'POST', 'courses', { title: 'Fractions' }));
  assert.equal(go, '/console/courses/fractions');
  const course = await (await page(one, '/course/fractions')).text();
  assert.match(course, /Fractions/);
  const seen = await json(await call(one, 'POST', 'courses/fractions/activities', { title: 'Practice', kind: 'chat', version: 1 }));
  assert.equal(seen.go, '/console/courses/fractions/activities/practice');
  // The other instance looks every few seconds.
  await new Promise((resolve) => { setTimeout(resolve, 3100); });
  assert.match(await (await page(other, '/course/fractions')).text(), /Fractions/);
});

test('an activity: saved through its form, hidden from learners until opened, and the file it makes passes the format', async () => {
  const handler = await app();
  await json(await call(handler, 'POST', 'courses', { title: 'Fractions' }));
  await json(await call(handler, 'POST', 'courses/fractions/activities', { title: 'Practice', kind: 'chat', version: 1 }));
  const saved = { version: 2, title: 'Practice, renamed', summary: 'A line', minutes: 20, kind: 'chat', agent_ref: 'tutor', teaching: { goal: 'Add fractions.', help: 'hint', watch_for: 'Tell me who is stuck.' }, release: 'hidden', done_when: 'auto' };
  await json(await call(handler, 'PUT', 'courses/fractions/activities/practice', saved));
  const visitor = 'a'.repeat(32);
  const home = await json(await visit(handler, '/course/fractions/home', { visitor }));
  assert.deepEqual(home.units, [], 'a hidden activity isn’t on the home');
  assert.equal((await visit(handler, '/course/fractions/practice/messages', { visitor, message: 'hi' })).status, 403);
  await json(await call(handler, 'POST', 'courses/fractions/activities/practice/release', { release: 'open' }));
  const opened = await json(await visit(handler, '/course/fractions/home', { visitor }));
  assert.equal(opened.units[0].activities[0].title, 'Practice, renamed', 'its address didn’t change with its title');
  // What the AI reads comes back on the page; what the teacher wants to hear doesn’t.
  const editor = await (await handler(new Request(`${URL_BASE}/console/courses/fractions/activities/practice`, { headers: { authorization: `Bearer ${TOKEN}` } }))).text();
  assert.match(editor, /Add fractions\./);
  const moment = await json(await call(handler, 'GET', 'courses/fractions/activities/practice/brief?message=is%201%2F2%20%2B%201%2F3%20%3D%202%2F5%3F'));
  assert.match(moment.html, /gave an answer/);
  assert.doesNotMatch(moment.html, /Tell me who is stuck/);
  const file = await call(handler, 'GET', 'courses/fractions/download');
  const doc = JSON.parse(await file.text());
  assert.deepEqual(validateDocument(doc, 'course-package').errors, []);
  assert.equal(doc.course.activities[0].teaching.help, 'hint');
});

test('a scheduled activity stays a hidden one in the file, so another platform’s import leaves it hidden', async () => {
  const handler = await app();
  await json(await call(handler, 'POST', 'courses', { title: 'Later' }));
  await json(await call(handler, 'POST', 'courses/later/activities', { title: 'Soon', kind: 'chat', version: 1 }));
  const opens = new Date(Date.now() + 3600000).toISOString();
  await json(await call(handler, 'PUT', 'courses/later/activities/soon', { version: 2, title: 'Soon', kind: 'chat', agent_ref: 'tutor', teaching: {}, release: 'scheduled', opens_at: opens, done_when: 'auto' }));
  const home = await json(await visit(handler, '/course/later/home', { visitor: 'b'.repeat(32) }));
  assert.equal(home.units[0].activities[0].state, 'upcoming');
  const doc = JSON.parse(await (await call(handler, 'GET', 'courses/later/download')).text());
  assert.equal(doc.course.activities[0].release, 'hidden');
  assert.equal(doc.course.activities[0].opens_at, opens);
});

test('questions: written on the page, checked as a package’s are, and refused when they wouldn’t work', async () => {
  const handler = await app();
  await json(await call(handler, 'POST', 'courses', { title: 'Quiz' }));
  await json(await call(handler, 'POST', 'courses/quiz/activities', { title: 'Check', kind: 'questions', version: 1 }));
  await json(await call(handler, 'POST', 'courses/quiz/questions/check/items', { type: 'single' }));
  const body = { prompt: 'What is 1/2 + 1/2?', choices: '* 1\n2/4', hints: 'Add the tops.', explanation: 'Two halves make one.' };
  await json(await call(handler, 'PUT', 'courses/quiz/questions/check/items/q1', body));
  const bare = await call(handler, 'PUT', 'courses/quiz/questions/check/items/q1', { ...body, explanation: '' });
  assert.equal(bare.status, 200, 'a question needs no explanation');
  await json(await call(handler, 'PUT', 'courses/quiz/questions/check/items/q1', body));
  const none = await call(handler, 'PUT', 'courses/quiz/questions/check/items/q1', { ...body, choices: '1\n2/4' });
  assert.equal(none.status, 400);
  assert.match((await none.json()).error.message, /Put \* before/);
  const doc = JSON.parse(await (await call(handler, 'GET', 'courses/quiz/download')).text());
  assert.deepEqual(doc.question_sets[0].items[0].answer, { choice: 'a' });
  assert.deepEqual(validateDocument(doc, 'course-package').errors, []);
});

test('who holds the token can try what is hidden, as a learner apart; nobody else can, and it isn’t counted', async () => {
  const store = memoryStore();
  const handler = await app(store);
  await json(await call(handler, 'POST', 'courses', { title: 'Tried' }));
  await json(await call(handler, 'POST', 'courses/tried/activities', { title: 'Hidden one', kind: 'chat', version: 1 }));
  assert.match(await (await page(handler, '/course/tried/hidden-one')).text(), /isn’t open yet/);
  assert.match(await (await handler(new Request(`${URL_BASE}/course/tried/hidden-one`, { headers: { authorization: `Bearer ${TOKEN}`, accept: 'text/html' } }))).text(), /isn’t open yet/, 'a session alone lifts nothing: a teacher may have left it on a shared computer');
  const asTeacher = await handler(new Request(`${URL_BASE}/course/tried/hidden-one?try=1`, { headers: { authorization: `Bearer ${TOKEN}`, accept: 'text/html' } }));
  assert.match(await asTeacher.text(), /isn’t counted/);
  const home = await handler(new Request(`${URL_BASE}/course/tried/home?try=1`, { method: 'POST', headers: { ...headers, origin: URL_BASE }, body: JSON.stringify({ visitor: 'c'.repeat(32) }) }));
  assert.equal((await json(home)).units[0].activities[0].title, 'Hidden one');
  const records = await (await handler(new Request(`${URL_BASE}/teacher/records.json?course=tried`, { headers: { authorization: `Bearer ${TOKEN}` } }))).json();
  assert.deepEqual(records.records, [], 'what the teacher tried isn’t what learners did');
});

test('an activity’s AI gets what the moment needs, unless the teacher turned that off', async () => {
  const sent = [];
  const store = memoryStore();
  const handler = await createApp({ bytes: null, name: 'x', vars: { VIABLE_ENGINE_TOKEN: TOKEN, OPENAI_API_KEY: 'a-key' }, store, fetch: async (_url, init) => {
    sent.push(JSON.parse(init.body).messages.map((message) => message.content).join('\n'));
    return new Response(JSON.stringify({ id: 'x', choices: [{ message: { role: 'assistant', content: 'How did you get that?' } }], usage: { prompt_tokens: 1, completion_tokens: 1 } }), { headers: { 'content-type': 'application/json' } });
  } });
  await json(await call(handler, 'POST', 'courses', { title: 'Moments' }));
  await json(await call(handler, 'POST', 'courses/moments/activities', { title: 'Talk', kind: 'chat', version: 1 }));
  const form = (version, on) => ({ version, title: 'Talk', kind: 'chat', agent_ref: 'tutor', teaching: { goal: 'Add fractions.', help: 'hint', turn_brief: on }, release: 'open', done_when: 'auto' });
  await json(await call(handler, 'PUT', 'courses/moments/activities/talk', form(2, true)));
  const visitor = 'f'.repeat(32);
  await json(await visit(handler, '/course/moments/home', { visitor }));
  assert.ok((await visit(handler, '/course/moments/talk/messages', { visitor, message: 'Just tell me the answer.' })).ok);
  assert.match(sent.at(-1), /Right now: The learner wants the answer\./);
  await json(await call(handler, 'PUT', 'courses/moments/activities/talk', form(3, false)));
  assert.ok((await visit(handler, '/course/moments/talk/messages', { visitor, message: 'Just tell me the answer.' })).ok);
  assert.doesNotMatch(sent.at(-1), /Right now:/);
  assert.match(sent.at(-1), /Goal: Add fractions\./);
});

test('with no model set, a learner’s message goes nowhere, and the page says why', async () => {
  const called = [];
  const handler = await createApp({ bytes: null, name: 'x', vars: { VIABLE_ENGINE_TOKEN: TOKEN }, store: memoryStore(), fetch: async (url) => { called.push(String(url)); return new Response('{}'); } });
  await json(await call(handler, 'POST', 'courses', { title: 'Empty' }));
  await json(await call(handler, 'POST', 'courses/empty/activities', { title: 'Talk', kind: 'chat', version: 1 }));
  await json(await call(handler, 'POST', 'courses/empty/activities/talk/release', { release: 'open' }));
  const visitor = 'e'.repeat(32);
  await json(await visit(handler, '/course/empty/home', { visitor }));
  const sent = await visit(handler, '/course/empty/talk/messages', { visitor, message: 'hello' });
  assert.equal(sent.status, 503);
  assert.match((await sent.json()).error.message, /isn’t set up yet/);
  assert.deepEqual(called, []);
});

test('a reading’s PDF, added to a course that came from a file, is kept and comes back in the download', async () => {
  const store = memoryStore();
  const doc = pkg('Given course');
  doc.files = [];
  doc.course.activities[0].workspace = { ai: 'right', title: null, layout: { ai_width: 36, resizable: true, collapsible: true }, panels: [] };
  const handler = await createApp({ bytes: new TextEncoder().encode(JSON.stringify(doc)), name: 'given.json', vars: { VIABLE_ENGINE_TOKEN: TOKEN }, store });
  const pdf = new TextEncoder().encode('%PDF-1.4 a small reading');
  const sent = await handler(new Request(`${URL_BASE}/console/api/courses/given-course/activities/first-steps/reading`, { method: 'POST', headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/octet-stream', 'x-file-name': encodeURIComponent('moon.pdf') }, body: pdf }));
  await json(sent);
  const file = await call(handler, 'GET', 'courses/given-course/download');
  assert.equal(file.headers.get('content-type'), 'application/zip');
  const unpacked = await readZip(new Uint8Array(await file.arrayBuffer()), () => true, { binary: true });
  assert.equal(new TextDecoder().decode(unpacked.get('files/moon.pdf')), '%PDF-1.4 a small reading');
  const kept = JSON.parse(new TextDecoder().decode(unpacked.get('package.viable.json')));
  assert.equal(kept.course.activities[0].workspace.panels[0].file_ref, 'moon');
  assert.equal(kept.course.code, 'given-course', 'at the address it had');
});

test('archived, a course waits under Archived with what learners did, and comes back as it was or is deleted from there', async () => {
  const store = memoryStore();
  const handler = await app(store);
  const consolePage = async (path) => (await handler(new Request(`${URL_BASE}${path}`, { headers: { authorization: `Bearer ${TOKEN}`, accept: 'text/html' } }))).text();
  await json(await call(handler, 'POST', 'courses', { title: 'Kept' }));
  await json(await visit(handler, '/course/kept/home', { visitor: 'e'.repeat(32) }));
  const work = await store.list('courses/kept/');
  assert.ok(work.length > 0);
  assert.match(await consolePage('/console/courses/kept/settings'), /data-api="POST courses\/kept\/archive"/, 'settings archive it, and delete nothing');
  assert.doesNotMatch(await consolePage('/console/courses/kept/settings'), /Delete this course/);

  // Archived: off the list and learners' pages, its learners' work kept, and what the browser fetched ahead dropped.
  const archived = await call(handler, 'POST', 'courses/kept/archive', {});
  assert.equal(archived.headers.get('clear-site-data'), '"prefetchCache"');
  assert.equal((await json(archived)).go, '/console/courses?archived=kept#archived');
  const listed = await consolePage('/console/courses?archived=kept');
  assert.doesNotMatch(listed, /class="course-card"/);
  assert.match(listed, /<details class="archived" id="archived" open>/);
  assert.match(listed, /<li id="archived-kept" class="is-just"[^>]*><div><strong>Kept<\/strong><small>Archived just now<\/small>/);
  assert.match(await (await page(handler, '/course/kept')).text(), /isn’t open right now/);
  assert.deepEqual(await store.list('courses/kept/'), work);
  assert.equal((await call(handler, 'GET', 'courses/kept')).status, 404);

  // Restored, it is back as it was.
  assert.equal((await json(await call(handler, 'POST', 'archived/kept/restore', {}))).go, '/console/courses');
  assert.match(await consolePage('/console/courses'), /href="\/console\/courses\/kept"/);
  assert.doesNotMatch(await consolePage('/console/courses'), /id="archived"/, 'nothing left under Archived');
  assert.doesNotMatch(await (await page(handler, '/course/kept')).text(), /isn’t open right now/);

  // Deleted from Archived, it and its learners' work leave the server; the page says so first, and asks for the word.
  await json(await call(handler, 'POST', 'courses/kept/archive', {}));
  assert.match(await consolePage('/console/courses'), /data-api="DELETE archived\/kept" data-confirm="This deletes “Kept”, its versions and everything its learners did from this server\. It can’t be undone\." data-type="DELETE"/);
  assert.equal((await json(await call(handler, 'DELETE', 'archived/kept', {}))).go, '/console/courses?archived=#archived');
  assert.deepEqual(await store.list('courses/kept/'), []);
  assert.deepEqual(await store.list('library/items/'), []);
  assert.equal((await call(handler, 'POST', 'archived/kept/restore', {})).status, 404);
  // A read changes nothing, so it leaves what the browser fetched ahead.
  const read = await call(handler, 'GET', 'ask/choices');
  assert.equal(read.status, 200);
  assert.equal(read.headers.get('clear-site-data'), null);
});

test('deleting a course deletes what learners did in it', async () => {
  const store = memoryStore();
  const handler = await app(store);
  await json(await call(handler, 'POST', 'courses', { title: 'Gone' }));
  await json(await visit(handler, '/course/gone/home', { visitor: 'd'.repeat(32) }));
  assert.ok((await store.list('courses/gone/')).length > 0);
  await json(await call(handler, 'DELETE', 'courses/gone', {}));
  assert.deepEqual(await store.list('courses/gone/'), []);
  assert.deepEqual(await store.list('library/items/'), []);
  assert.match(await (await page(handler, '/course/gone')).text(), /isn’t open right now/);
});
