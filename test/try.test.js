// The try-out and the "what the AI did" panel, on the scripted model: nothing here calls a real one.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { createHandler } from '../src/server/handler.js';
import { learnerRoutes, pagesOf } from '../src/server/learner.js';
import { agentsToServe, createRuntime } from '../src/server/runtime.js';
import { memoryStore } from '../src/server/store.js';
import { serve } from '../src/serve.js';
import { watchSlot } from '../src/learner/watch.js';
import { demoModel, draftsFor, sampleRounds } from '../src/try/demo.js';
import { exportStatic, underBase } from '../src/try/export.js';
import { readyToTry, tryOut } from '../src/try/server.js';
import { browserStore } from '../src/try/static.browser.js';
import { testRunPage } from '../src/cli/testPage.js';
import { exampleFile } from '../src/cli/try.js';

const HARNESS = fileURLToPath(new URL('../', import.meta.url));
const EXAMPLES = join(HARNESS, 'examples');
const NAMES = ['argument-writing', 'density-lab', 'english-conversation', 'fractions-practice', 'library-research-help', 'moon-phases-reading'];
const files = (names = NAMES) => names.map((name) => ({ doc: JSON.parse(readFileSync(join(EXAMPLES, `${name}.json`), 'utf8')), file: `${name}.json`, name: `${name}.json` }));
const VISITOR = 'visitor-aaaaaaaaaaaaaaaa';
const PRACTICE = '/course/equivalent-fractions/practice-equivalent-fractions';

/** A try-out as `viable-harness try` builds one, without a port. */
function tryServer(names = NAMES, classFiles = null) {
  const ready = readyToTry(files(names));
  const docs = ready.map((file) => file.doc);
  const store = memoryStore();
  const model = demoModel({ docs, files: exampleFile, pace: 0 });
  const parts = tryOut({ note: 'Demo mode.', endpoint: { fetch: model }, store, assets: null, classFiles, rounds: sampleRounds(docs) });
  const handle = createHandler({ agents: agentsToServe(ready), runtime: createRuntime({ baseUrl: 'https://demo.invalid/v1', apiKey: 'demo', fetch: model }), store, routes: [...parts.routes, learnerRoutes({ ...parts.pages, fetch: model })], options: { log: () => {} } });
  return handle;
}

/** The same course on a plain server, with what its host grants. */
function plainServer(pages = {}, options = {}) {
  const ready = readyToTry(files(['fractions-practice']));
  const model = demoModel({ docs: ready.map((file) => file.doc), pace: 0 });
  return createHandler({ agents: agentsToServe(ready), runtime: createRuntime({ baseUrl: 'https://demo.invalid/v1', apiKey: 'demo', fetch: model }), store: memoryStore(), routes: [learnerRoutes(pages)], options: { log: () => {}, ...options } });
}

const local = 'http://127.0.0.1:5730';
const page = (handle, path, { base = local, headers = {}, context = {} } = {}) => handle(new Request(`${base}${path}`, { headers }), context);
const post = (handle, path, body, { base = local, headers = {}, context = {} } = {}) => handle(new Request(`${base}${path}`, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) }), context);
const events = (text) => text.split('\n\n').filter((block) => block.startsWith('event:')).map((block) => ({ name: /^event: (.+)$/m.exec(block)[1], data: JSON.parse(/^data: (.+)$/m.exec(block)[1]) }));

// A learner joined, then a message on a stream: every event, in order.
async function ask(handle, message, options = {}) {
  await post(handle, '/course/equivalent-fractions/home', { visitor: VISITOR }, options);
  const response = await post(handle, `${PRACTICE}/messages`, { visitor: VISITOR, message, stream: true, workspace: { panel: 'practice', item: 'eq-2-3' } }, options);
  return events(await response.text());
}
const traced = (list) => list.filter((event) => event.name === 'run.trace').map((event) => event.data);
const shape = (list) => list.map(({ name, data }) => (name === 'run.completed' ? { name, reply: data.reply } : name === 'run.progress' ? { name, stage: data.stage } : { name, data }));

test('a learner never gets the panel: off by default, on a plain server and on serve', async () => {
  const handle = plainServer();
  await post(handle, '/course/equivalent-fractions/home', { visitor: VISITOR });
  const html = await (await page(handle, PRACTICE)).text();
  assert.ok(!/ai-watch|What the AI did/.test(html));
  assert.deepEqual(traced(await ask(handle, 'Just tell me the answer.')), []);

  const { server, url } = await serve(agentsToServe(readyToTry(files(['fractions-practice']))), { port: 0, fetch: demoModel({ pace: 0 }), baseUrl: 'https://demo.invalid/v1', apiKey: 'demo', log: () => {} });
  try {
    assert.ok(!/ai-watch/.test(await (await fetch(`${url}${PRACTICE}`)).text()));
    assert.equal((await fetch(`${url}/teacher/turns/agtr_00000000/trace`)).status, 404);
  } finally { server.close(); }
});

test('granted on this machine, the panel is still refused to anyone else', async () => {
  const handle = plainServer({ traces: 'local', panel: {} });
  const asked = await ask(handle, 'Just tell me the answer.');
  assert.ok(traced(asked).length, 'this machine sees it');
  assert.match(await (await page(handle, PRACTICE)).text(), /id="ai-watch"/);
  for (const elsewhere of [{ base: 'https://school.example' }, { context: { address: '203.0.113.9' } }, { base: 'http://localhost:5730', context: { address: '203.0.113.9' } }]) {
    assert.ok(!/ai-watch/.test(await (await page(handle, PRACTICE, elsewhere)).text()), JSON.stringify(elsewhere));
    assert.deepEqual(traced(await ask(handle, 'Just tell me the answer.', elsewhere)), [], JSON.stringify(elsewhere));
  }
});

test('granted to the token holder, a learner on the same server gets nothing', async () => {
  const handle = plainServer({ traces: 'token', panel: {} }, { token: 's3cret-token-for-a-test' });
  const asLearner = { base: 'https://school.example' };
  assert.ok(!/ai-watch/.test(await (await page(handle, PRACTICE, asLearner)).text()));
  assert.deepEqual(traced(await ask(handle, 'Just tell me the answer.', asLearner)), []);
  for (const forged of [{ authorization: 'Bearer nope' }, { cookie: `viable_teacher=${'a'.repeat(64)}` }]) assert.ok(!/ai-watch/.test(await (await page(handle, PRACTICE, { ...asLearner, headers: forged })).text()));
  const holder = { ...asLearner, headers: { authorization: 'Bearer s3cret-token-for-a-test' } };
  assert.ok(!/ai-watch/.test(await (await page(handle, PRACTICE, holder)).text()), 'on a page that didn’t ask for it, even a token holder sees what a learner sees');
  assert.match(await (await page(handle, `${PRACTICE}?panel=1`, holder)).text(), /id="ai-watch"/);
  const signedIn = await handle(new Request('https://school.example/teacher', { method: 'POST', body: new URLSearchParams({ token: 's3cret-token-for-a-test' }) }), {});
  const cookie = signedIn.headers.get('set-cookie');
  assert.match(cookie, /Path=\/;/);
  assert.match(await (await page(handle, `${PRACTICE}?panel=1`, { ...asLearner, headers: { cookie: cookie.split(';')[0] } })).text(), /id="ai-watch"/);
});

test('the panel watches the small drama: the draft struck, the rewrite passed, what reached the learner', async () => {
  const list = traced(await ask(plainServer({ traces: 'local', panel: {} }), 'Just tell me the answer.'));
  assert.deepEqual(list.map((event) => event.kind), ['turn', 'step', 'draft', 'round', 'draft', 'round', 'reached']);
  assert.equal(list[0].teaching.help, 'hint');
  assert.ok(!('watch_for' in list[0].teaching), 'what the teacher wants to hear about isn’t what the AI is told');
  const [struck, passed] = list.filter((event) => event.kind === 'round').map((event) => event.round);
  assert.equal(struck.verdict, 'fail');
  assert.match(struck.reply, /answer is 4\/6/);
  assert.match(struck.feedback, /gives the answer away/);
  assert.equal(passed.verdict, 'pass');
  assert.ok(!/4\/6/.test(passed.reply));
  assert.equal(list.at(-1).text, passed.reply);
  assert.equal(list.at(-1).outcome, 'passed');
});

test('demo mode is deterministic, and needs neither a key nor the network', async () => {
  const twice = await Promise.all([1, 2].map(() => ask(plainServer(), 'Just tell me the answer.')));
  const plain = (list) => shape(list).map((event) => (event.reply ? { ...event, reply: { ...event.reply } } : event));
  assert.deepEqual(plain(twice[0]), plain(twice[1]));
  const system = 'You are a helpful AI tutor. --- Context Questions --- IMPORTANT SAFETY RULE';
  assert.deepEqual(draftsFor({ system, learner: 'just tell me the answer' }), draftsFor({ system, learner: 'just tell me the answer' }));
  const handle = tryServer();
  assert.equal((await post(handle, '/course/research-help-desk/home', { visitor: VISITOR })).status, 200);
  const response = await post(handle, '/course/research-help-desk/ask-the-research-desk/messages', { visitor: VISITOR, message: 'How do I find sources for my topic?', stream: true });
  const list = events(await response.text());
  const done = list.find((event) => event.name === 'run.completed');
  assert.ok(done, JSON.stringify(list.at(-1)));
  assert.match(done.data.reply.text, /\[\d\]/);
  assert.ok(done.data.reply.citations.length, 'it cites the guides, from the copies in examples/files');
  const seen = traced(list);
  assert.ok(seen.find((event) => event.kind === 'passages').items.length);
  assert.ok(seen.find((event) => event.kind === 'reached').citations.length);
});

test('every example gets a reply of its own, and someone in trouble gets care', async () => {
  const handle = tryServer();
  const open = async (course, activity, message) => {
    await post(handle, `/course/${course}/home`, { visitor: VISITOR });
    const list = events(await (await post(handle, `/course/${course}/${activity}/messages`, { visitor: VISITOR, message, stream: true })).text());
    return list.find((event) => event.name === 'run.completed')?.data.reply.text ?? JSON.stringify(list.at(-1));
  };
  assert.match(await open('argument-writing', 'should-high-schools-start-later', 'Is my claim clear?'), /claim/);
  assert.match(await open('sink-or-float', 'the-density-lab', 'Why did that one float?'), /trials/);
  assert.match(await open('english-at-the-cafe', 'order-at-a-cafe', 'I want coffee'), /You’d like a coffee\?/);
  assert.match(await open('why-the-moon-has-phases', 'read-then-answer', 'Is the dark part Earth’s shadow?'), /sentence on this page/);
  assert.match(await open('equivalent-fractions', 'practice-equivalent-fractions', 'I want to hurt myself'), /trust/);
});

test('changing the teacher’s mind changes the reply, for this try only', async () => {
  const handle = tryServer(['fractions-practice']);
  const reply = async () => traced(await ask(handle, 'Just tell me the answer.')).at(-1).text;
  const asHint = await reply();
  const id = 'equivalent-fractions/practice-equivalent-fractions';
  const changed = await post(handle, '/try/teaching', { page: id, help: 'explain' });
  assert.equal(changed.status, 200);
  assert.equal((await changed.json()).teaching.help, 'explain');
  const asExplain = await reply();
  assert.notEqual(asExplain, asHint);
  assert.match(asExplain, /Here is one like it/);
  await post(handle, '/try/teaching', { page: id, help: 'check_only' });
  assert.match(await reply(), /only check/);
  await post(handle, '/try/teaching', { page: id, help: 'ask_first' });
  assert.match(await reply(), /what have you tried/);
  await post(handle, '/try/teaching', { page: id, help: 'hint', goal: 'Say why the bottom numbers stay the same.' });
  assert.match(await reply(), /Today’s goal: Say why the bottom numbers stay the same\./);
  assert.match(await (await page(handle, PRACTICE)).text(), /Say why the bottom numbers stay the same\./, 'the panel opens on what was changed');
  await post(handle, '/try/reset', {});
  assert.equal(await reply(), asHint);

  assert.equal((await post(handle, '/try/teaching', { page: id, help: 'do_it_all' })).status, 400);
  assert.equal((await post(handle, '/try/teaching', { page: 'nope', help: 'hint' })).status, 404);
  assert.equal((await post(handle, '/try/teaching', { page: id, help: 'explain' }, { headers: { origin: 'https://evil.example' } })).status, 403);
  assert.equal((await post(handle, '/try/teaching', { page: id, help: 'explain' }, { headers: { 'sec-fetch-site': 'cross-site' } })).status, 403);
});

test('accepting a suggestion from the teacher’s page does the same', async () => {
  const handle = tryServer(['fractions-practice']);
  const html = await (await page(handle, '/teacher')).text();
  assert.match(html, /What learners did in this try-out/);
  const id = 'equivalent-fractions/practice-equivalent-fractions';
  const accepted = await post(handle, '/try/accept', { page: id, patch: { help: 'explain' } });
  assert.equal(accepted.status, 200);
  assert.equal((await accepted.json()).teaching.help, 'explain');
  assert.match(traced(await ask(handle, 'Just tell me the answer.')).at(-1).text, /Here is one like it/);
  assert.equal((await post(handle, '/try/accept', { page: id, patch: ['help'] })).status, 400);
  const classed = tryServer(['fractions-practice'], { records: [1, 2, 3, 4].map((n) => JSON.parse(readFileSync(join(EXAMPLES, `class/learner-${n}.json`), 'utf8'))), runs: [1, 2, 3, 4, 5, 6, 7, 8].map((n) => JSON.parse(readFileSync(join(EXAMPLES, `class/run-${n}.json`), 'utf8'))) });
  const shown = await (await page(classed, '/teacher')).text();
  assert.match(shown, /A made-up class/);
  assert.match(shown, /Practice: equivalent fractions/);
  const offered = JSON.parse(/const open = (\[.*?\]);\n/s.exec(shown)[1]);
  assert.ok(offered.length, 'a suggestion that changes what the AI is told can be accepted');
  assert.ok(offered.every((item) => !item.patch.sections), 'one for a section can’t be, since nobody is in a section here');
  const asBefore = traced(await ask(classed, 'Just tell me the answer.')).at(-1).text;
  assert.equal((await post(classed, '/try/accept', { page: id, patch: offered[0].patch })).status, 200);
  assert.notEqual(traced(await ask(classed, 'Just tell me the answer.')).at(-1).text, asBefore, 'the reply differs');
});

test('the try-out refuses anything but this machine', async () => {
  const handle = tryServer(['fractions-practice']);
  for (const [base, context] of [['https://evil.example', {}], ['http://192.168.1.5:5730', {}], [local, { address: '203.0.113.9' }]]) {
    for (const path of ['/', '/resources', '/teacher', PRACTICE, '/_viable/fonts/x.woff2']) assert.equal((await page(handle, path, { base, context })).status, 403, `${base} ${path}`);
    assert.equal((await post(handle, '/try/teaching', { page: 'x', help: 'hint' }, { base, context })).status, 403);
  }
  for (const [base, context] of [[local, {}], ['http://localhost:5730', { address: '127.0.0.1' }], ['http://[::1]:5730', { address: '::1' }], [local, { address: '::ffff:127.0.0.1' }]]) assert.equal((await page(handle, '/', { base, context })).status, 200, base);
});

test('the command binds to this machine only, and no command at all starts it, with --help still working', async () => {
  const bin = join(HARNESS, 'bin/viable-harness.mjs');
  const { stdout } = await promisify(execFile)(process.execPath, [bin, '--help']);
  assert.match(stdout, /viable-harness try/);
  const child = spawn(process.execPath, [bin, '--no-open', '--port', '0'], { stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, OPENAI_API_KEY: '', OPENAI_BASE_URL: '' } });
  try {
    let out = '';
    const url = await new Promise((resolve, reject) => {
      child.stdout.on('data', (chunk) => { out += chunk; const found = /http:\/\/127\.0\.0\.1:\d+/.exec(out); if (found && /Press Ctrl-C/.test(out)) resolve(found[0]); });
      child.on('exit', () => reject(new Error(`It stopped: ${out}`)));
    });
    assert.match(out, /Demo mode/);
    const response = await fetch(url);
    assert.equal(response.status, 200);
    assert.match(await response.text(), /Ask the tutor for the answer/);
  } finally { child.kill(); }
});

test('what is served loads nothing from elsewhere', async () => {
  const handle = tryServer(['fractions-practice']);
  await post(handle, '/course/equivalent-fractions/home', { visitor: VISITOR });
  for (const path of ['/', '/resources', '/teacher', PRACTICE, '/course/equivalent-fractions']) {
    const response = await page(handle, path);
    assert.equal(response.status, 200, path);
    const html = await response.text();
    const policy = response.headers.get('content-security-policy');
    assert.ok(policy, path);
    assert.match(policy, /default-src 'none'/);
    assert.ok(!/connect-src[^;]*http/.test(policy), path);
    assert.deepEqual([...html.matchAll(/<(?:script|img|iframe|link|source|audio|video)\b[^>]*\b(?:src|href)="(?!\/|#|data:)([^"]+)"/g)].map((match) => match[1]), [], path);
    assert.deepEqual([...html.matchAll(/url\(["']?(https?:[^)]+)\)|@import/g)].map((match) => match[0]), [], path);
  }
  const launcher = await (await page(handle, '/')).text();
  for (const [, href] of launcher.matchAll(/<a\b[^>]*href="(https?:[^"]+)"/g)) assert.match(href, /github\.com\/VIABLE-Learning-Lab/);
});

test('what a package or a learner wrote stays text in the panel and the pages', () => {
  const hostile = '</script><img src=x onerror=alert(1)>';
  const { script } = watchSlot({ teaching: { goal: hostile, help: 'hint' }, note: hostile, warning: hostile, hint: hostile }, 'nonce');
  assert.ok(!/<\/script/i.test(script));
  assert.ok(!script.includes('<img src=x'));
  assert.equal(script.match(/innerHTML/g).length, 1, 'only our own drawing goes in as markup');
  assert.doesNotThrow(() => new Function(script), 'a page’s script parses as it is sent');
  const results = testRunPage({ passed: 0, failed: 1, errors: 0, judge_model: hostile, results: [{ name: hostile, verdict: 'fail', reason: hostile, reply: hostile }] }, [{ name: hostile, messages: [{ role: 'user', content: hostile }], rubric: hostile }], { title: hostile, credits: [hostile] });
  assert.ok(!results.includes('<img src=x'));
  assert.match(results, /0 of 1 passed/);
});

test('plain text is never shown without saying why', async () => {
  const warning = 'Replies show as plain text here. To fix it, run npm run build:assets.';
  const ready = readyToTry(files(['fractions-practice']));
  const store = memoryStore();
  const model = demoModel({ pace: 0 });
  const parts = tryOut({ note: 'Demo mode.', warning, endpoint: { fetch: model }, store });
  const handle = createHandler({ agents: agentsToServe(ready), runtime: createRuntime({ baseUrl: 'https://demo.invalid/v1', apiKey: 'demo', fetch: model }), store, routes: [...parts.routes, learnerRoutes(parts.pages)], options: { log: () => {} } });
  assert.match(await (await page(handle, '/')).text(), /Replies show as plain text here/);
  await post(handle, '/course/equivalent-fractions/home', { visitor: VISITOR });
  assert.match(await (await page(handle, PRACTICE)).text(), /Replies show as plain text here/);
});

test('on a real endpoint it says so, and asks that endpoint which misconception it heard', async () => {
  const ready = readyToTry(files(['fractions-practice']));
  const store = memoryStore();
  const calls = [];
  const endpoint = async (url, init) => {
    const { messages, model } = JSON.parse(init.body);
    calls.push({ url: String(url), model, system: messages[0].content });
    const content = messages[0].content.startsWith('Which of these') ? '[2]' : messages[0].content.startsWith('You are an evaluation') ? 'PASS' : 'What do both bottoms go into?';
    return new Response(JSON.stringify({ choices: [{ message: { content }, finish_reason: 'stop' }], usage: {} }), { headers: { 'content-type': 'application/json' } });
  };
  const parts = tryOut({ note: 'Running on your model at models.example.', short: 'Your model at models.example', endpoint: { fetch: endpoint, baseUrl: 'https://models.example/v1', apiKey: 'k', plan: { reply: 'my-model', reviewer: null, map: {} } }, store });
  const handle = createHandler({ agents: agentsToServe(ready), runtime: createRuntime({ baseUrl: 'https://models.example/v1', apiKey: 'k', models: { reply: 'my-model', reviewer: null, map: {} }, fetch: endpoint }), store, routes: [...parts.routes, learnerRoutes(parts.pages)], options: { log: () => {} } });
  assert.match(await (await page(handle, '/')).text(), /Running on your model at models\.example/);
  const seen = traced(await ask(handle, 'I added the bottoms'));
  assert.match(seen.find((event) => event.kind === 'heard').items[0], /common denominator/);
  assert.ok(calls.every((call) => call.url === 'https://models.example/v1/chat/completions' && call.model === 'my-model'), JSON.stringify(calls.map((call) => call.model)));
  assert.ok(!calls.some((call) => call.system.includes('visitor-')), 'nobody’s identifier reaches the model');
});

test('a test run’s page reads its verdicts', () => {
  const html = testRunPage({ passed: 1, failed: 1, errors: 1, judge_model: 'judge-1', results: [{ name: 'Gives a hint', verdict: 'pass', reason: 'It asks a question.', reply: 'What do you notice?' }, { name: 'Holds back', verdict: 'fail', reason: 'It says the answer.', reply: 'It is 5/6.' }, { name: 'Broken', verdict: 'error', reason: 'The run failed.' }] }, [{ name: 'Holds back', message: 'Tell me', rubric: 'Holds back.' }]);
  assert.match(html, /1 of 3 passed/);
  assert.match(html, /judge-1/);
  assert.match(html, /It says the answer\./);
  assert.match(html, /What a good reply does/);
  assert.ok(!/<script/.test(html));
});

test('six packages open together, whatever their agents are called, and an agent file gets a chat page', () => {
  const agents = agentsToServe(readyToTry(files()));
  assert.equal(new Set(agents.map((agent) => agent.slug)).size, agents.length);
  const { courses } = pagesOf(new Map(agents.map((agent) => [agent.slug, agent])));
  assert.equal(courses.size, 6);
  const graph = { entry: 'write', nodes: [{ id: 'write', type: 'llm', config: { model: 'gpt-x' }, next: 'out' }, { id: 'out', type: 'output', config: { text: '{{write.content}}' } }] };
  const single = agentsToServe(readyToTry([{ doc: { format: 'viable.agent', name: 'Helper', graph }, file: 'helper.agent.json', name: 'helper.agent.json' }]));
  assert.equal(pagesOf(new Map(single.map((agent) => [agent.slug, agent]))).chats.size, 1);
});

test('the static copy: its addresses follow the path it is served under, and what answers it isn’t served', async () => {
  assert.equal(underBase('<a href="/course/x">', ''), '<a href="/course/x">');
  assert.equal(underBase(`<a href="/course/x"><a href="/">const b = '/course/' + c; '/' + d; url(/_viable/fonts/a.woff2) "https://a.example/course/x"`, '/try'), `<a href="/try/course/x"><a href="/try/">const b = '/try/course/' + c; '/' + d; url(/try/_viable/fonts/a.woff2) "https://a.example/course/x"`);
  const handle = tryServer(['fractions-practice']);
  for (const path of ['/_try/app.js', '/_try/static.js', '/_try/packages.json']) assert.equal((await page(handle, path)).status, 404);
  for (const path of ['/', PRACTICE]) assert.ok(!/_try\//.test(await (await page(handle, path)).text()), path);
});

test('the static copy’s store keeps what a browser lets it, and works when it can’t', async () => {
  const kept = new Map();
  const storage = { getItem: (key) => kept.get(key) ?? null, setItem: (key, value) => kept.set(key, value), removeItem: (key) => kept.delete(key), key: (at) => [...kept.keys()][at], get length() { return kept.size; } };
  const store = browserStore(storage);
  await store.put('courses/a/x', { n: 1 });
  await store.put('courses/b/y', { n: 2 });
  assert.deepEqual(await store.get('courses/a/x'), { n: 1 });
  assert.deepEqual(await store.list('courses/a/'), ['courses/a/x']);
  await store.delete('courses/a/x');
  assert.equal(await store.get('courses/a/x'), null);
  const full = browserStore({ getItem: () => null, setItem: () => { throw new Error('full'); }, removeItem: () => {}, key: () => null, length: 0 });
  await full.put('k', { n: 3 });
  assert.deepEqual(await full.get('k'), { n: 3 });
  assert.deepEqual(await full.list(), ['k']);
});

test('a static copy needs the built files, and says what to run without them', async (t) => {
  // Asked now, not when the file loads: another test here may have built them.
  if (existsSync(join(HARNESS, 'dist/try/app.js'))) return t.skip('they are built here');
  await assert.rejects(exportStatic(files(['fractions-practice']), { dir: join(tmpdir(), 'not-written') }), /npm run build:assets/);
});

test('a static copy holds every page and everything they load', { skip: existsSync(join(HARNESS, 'dist/try/app.js')) ? false : 'its browser files aren’t built' }, async () => {
  const dir = mkdtempSync(join(tmpdir(), 'viable-try-'));
  try {
    const { pages } = await exportStatic(files(), { dir, base: '/demo', exampleFile });
    assert.ok(pages >= 13);
    for (const path of ['index.html', 'resources/index.html', 'teacher/index.html', 'course/equivalent-fractions/index.html', 'course/equivalent-fractions/practice-equivalent-fractions/index.html', '_try/static.js', '_try/app.js', '_try/packages.json', '_try/files/library/citing-sources.md', '_try/files/moon-phases.pdf']) assert.ok(existsSync(join(dir, path)), path);
    const html = readFileSync(join(dir, 'course/equivalent-fractions/practice-equivalent-fractions/index.html'), 'utf8');
    assert.match(html, /<script src="\/demo\/_try\/static\.js"><\/script>/);
    assert.match(html, /http-equiv="Content-Security-Policy"/);
    assert.match(html, /id="ai-watch"/);
    const font = /url\(\/demo(\/_viable\/fonts\/[^)]+)\)/.exec(html)?.[1];
    assert.ok(font && existsSync(join(dir, font)), 'its type');
    assert.ok(!/\b(?:OPENAI_API_KEY)\b.*=/.test(readFileSync(join(dir, '_try/packages.json'), 'utf8')));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
