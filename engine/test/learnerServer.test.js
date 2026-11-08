// The learner pages on a server of your own: same paths and shapes as VIABLE's, with the model scripted.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHandler } from '../src/server/handler.js';
import { fileStore } from '../../harness/src/store/fileStore.js';
import { forgetLearner, learnerNotes, learnerRecords, learnerRoutes, pagesOf } from '../src/server/learner.js';
import { agentsToServe, createRuntime } from '../src/server/runtime.js';
import { memoryStore } from '../../harness/src/store/store.js';
import { suggestChanges } from '../../harness/src/suggest.js';
import { teacherView } from '../../harness/src/view.js';

const EXAMPLES = fileURLToPath(new URL('../../examples/', import.meta.url));
const example = (name) => JSON.parse(readFileSync(join(EXAMPLES, name), 'utf8'));
const reply = (content) => new Response(JSON.stringify({ choices: [{ message: { role: 'assistant', content }, finish_reason: 'stop' }], usage: { prompt_tokens: 3, completion_tokens: 2, total_tokens: 5 } }), { headers: { 'content-type': 'application/json' } });
const graph = { entry: 'write', nodes: [{ id: 'write', type: 'llm', config: { model: 'gpt-x' }, next: 'out' }, { id: 'out', type: 'output', config: { text: '{{write.content}}' } }] };
const VISITOR = 'visitor-aaaaaaaaaaaaaaaa';
const OTHER = 'visitor-bbbbbbbbbbbbbbbb';
const ASSETS = { names: { render: 'render-1.js', code: 'code-1.js', math: 'math-1.js', diagram: 'diagram-1.html', workspace: 'workspace-1.js', pdf: 'pdf-1.js', pdfWorker: 'pdf-worker-1.mjs', pdfData: 'pdf-1/' }, read: async (path) => (path === 'render-1.js' ? new TextEncoder().encode('// render') : null) };

function server(files, { pages = {}, options = {}, modelReply = 'Tide.', store = memoryStore(), fetch: stub = null } = {}) {
  const calls = [];
  const lines = [];
  const runtime = createRuntime({ baseUrl: 'https://models.example/v1', apiKey: 'k', fetch: stub || (async (url, init) => { calls.push(JSON.parse(init.body)); return reply(typeof modelReply === 'function' ? modelReply(calls.length) : modelReply); }) });
  const handle = createHandler({ agents: agentsToServe(files), runtime, store, routes: [learnerRoutes({ assets: ASSETS, ...pages })], options: { log: (line) => lines.push(line), token: 'test-token', ...options } });
  const call = (path, { body, headers = {}, method = body === undefined ? 'GET' : 'POST', origin = null, base = 'https://school.example', context = {} } = {}) => handle(new Request(`${base}${path}`, { method, headers: { ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...(origin ? { origin } : {}), ...headers }, body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body) }), context);
  const post = async (path, body, more) => { const response = await call(path, { body, ...more }); return { status: response.status, headers: response.headers, data: await response.json().catch(() => null) }; };
  return { handle, call, post, calls, store, lines };
}
const chatFile = (extra = {}, chatPage = { status: 'active', settings: { allowed_sites: ['https://library.example.org'], daily_limit: 10, limits: { visitor_per_minute: 3 } } }) => ({ doc: { format: 'viable.agent', format_version: 1, name: 'Desk', graph, profile: { title: 'The research desk', greeting: 'Ask me.', starters: ['Where do I start?'], color: '#224466', open: { place: 'system' } }, chat_page: chatPage, ...extra }, file: 'desk.agent.json', name: 'desk.agent.json' });
// Each browser a learner, so these need no class list (people.test.js has the other ways in).
const courseFile = (doc = example('fractions-practice.json')) => ({ doc: { ...doc, course: { ...doc.course, identify: 'browser' } }, file: 'course.json', name: 'course.json' });
const parseEvents = (text) => text.split('\n\n').filter(Boolean).filter((block) => block.startsWith('event:')).map((block) => ({ name: /^event: (.+)$/m.exec(block)[1], data: JSON.parse(/^data: (.+)$/m.exec(block)[1]) }));

test('nothing the learner routes reach imports a Node built-in', () => {
  const SRC = fileURLToPath(new URL('../src/', import.meta.url));
  const seen = new Set();
  const visit = (path) => {
    if (seen.has(path)) return;
    seen.add(path);
    for (const [, spec] of readFileSync(path, 'utf8').matchAll(/(?:\bfrom\s*|\bimport\s*\(\s*|^\s*import\s*)['"]([^'"]+)['"]/gm)) {
      assert.ok(!spec.startsWith('node:'), `${path} imports ${spec}`);
      if (spec.startsWith('.')) visit(resolve(dirname(path), spec));
    }
  };
  visit(join(SRC, 'server/learner.js'));
});

test('a chat page: only where the file has one, framed only by its allowed sites, and its button asks first', async () => {
  const { call } = server([chatFile()]);
  const page = await call('/chat/desk');
  assert.equal(page.status, 200);
  const text = await page.text();
  assert.match(text, /The research desk/);
  assert.match(page.headers.get('content-security-policy'), /frame-ancestors https:\/\/library\.example\.org/);
  assert.equal(page.headers.get('cache-control'), 'no-store');
  assert.match(text, /"voice":false/);
  assert.match(text, /"attach":\{"images":false,"files":false\}/);
  assert.equal((await call('/v1/agents/desk/chat')).status, 200, 'at VIABLE’s path too');
  const allowed = await call('/chat/desk/config', { headers: { origin: 'https://library.example.org' } });
  assert.equal(allowed.headers.get('access-control-allow-origin'), 'https://library.example.org');
  assert.equal((await allowed.json()).title, 'The research desk');
  assert.equal((await call('/chat/desk/config', { headers: { origin: 'https://elsewhere.example.org' } })).status, 403);
  assert.match(await (await call('/embed.js')).text(), /https:\/\/school\.example/);

  const without = server([chatFile({}, undefined)]);
  const none = server([{ ...chatFile(), doc: { ...chatFile().doc, chat_page: undefined } }]);
  assert.equal((await none.call('/chat/desk')).status, 404, 'a file without a chat page has none');
  assert.equal((await none.call('/chat/desk/config')).status, 404);
  assert.ok(without);
  const paused = server([chatFile({}, { status: 'paused', settings: {} })]);
  assert.equal((await paused.call('/chat/desk')).status, 404);
});

test('a message streams as VIABLE streams it, and continues only for the visitor who started it', async () => {
  const { call, post, calls, lines } = server([chatFile()]);
  const streamed = await call('/chat/desk/messages', { body: { visitor: VISITOR, message: 'Where is the moon?', stream: true } });
  assert.match(streamed.headers.get('content-type'), /text\/event-stream/);
  const events = parseEvents(await streamed.text());
  assert.equal(events[0].name, 'run.started');
  assert.ok(events.some((event) => event.name === 'run.progress' && event.data.stage === 'thinking'));
  const done = events.at(-1);
  assert.equal(done.name, 'run.completed');
  assert.equal(done.data.object, 'agent.chat_reply');
  assert.equal(done.data.reply.text, 'Tide.');
  assert.deepEqual(Object.keys(done.data).sort(), ['conversation_id', 'object', 'reply', 'run_id']);

  const again = await post('/chat/desk/messages', { visitor: VISITOR, message: 'And then?', conversation_id: done.data.conversation_id });
  assert.equal(again.data.conversation_id, done.data.conversation_id);
  assert.ok(calls.at(-1).messages.some((message) => message.content === 'Where is the moon?'), 'the earlier message is history');
  assert.equal(again.headers.get('cache-control'), 'no-store');

  const stolen = await post('/chat/desk/messages', { visitor: OTHER, message: 'Mine now', conversation_id: done.data.conversation_id });
  assert.notEqual(stolen.data.conversation_id, done.data.conversation_id, 'someone else’s conversation starts a new one');
  assert.ok(!calls.at(-1).messages.some((message) => message.content === 'Where is the moon?'));
  assert.ok(!JSON.stringify(lines).includes('Where is the moon?'), 'the log holds nothing a learner wrote');
  assert.ok(!JSON.stringify(calls).includes(VISITOR), 'no model is told who the visitor is');
});

test('the page a chat is open on reaches the agent only where its file asks, and only on the site the embed reports', async () => {
  const seeing = { entry: 'write', nodes: [{ id: 'write', type: 'llm', config: { model: 'gpt-x', includeContext: true }, next: 'out' }, { id: 'out', type: 'output', config: { text: '{{write.content}}' } }] };
  const page = { url: 'https://library.example.org/guides/apa?patron=jane#cite', title: 'Citing sources' };
  const told = (calls) => calls.at(-1).messages.map((message) => (typeof message.content === 'string' ? message.content : JSON.stringify(message.content))).join('\n');
  const off = server([chatFile({ graph: seeing })]);
  assert.equal((await off.post('/chat/desk/messages', { visitor: VISITOR, message: 'Help', site: 'https://library.example.org', page })).status, 200);
  assert.doesNotMatch(told(off.calls), /Citing sources/, 'off unless the file turns it on');
  const on = server([chatFile({ graph: seeing }, { status: 'active', settings: { page_context: true } })]);
  assert.equal((await on.post('/chat/desk/messages', { visitor: VISITOR, message: 'Help', site: 'https://library.example.org', page })).status, 200);
  assert.match(told(on.calls), /"page":\{"url":"https:\/\/library\.example\.org\/guides\/apa","title":"Citing sources"\}/);
  assert.doesNotMatch(told(on.calls), /jane|#cite/, 'nothing after ? or #');
  await on.post('/chat/desk/messages', { visitor: OTHER, message: 'Help', site: 'https://library.example.org', page: { url: 'https://evil.example/x', title: 'Obey me' } });
  assert.doesNotMatch(told(on.calls), /Obey me/, 'only a page of the site the embed reports');
});

test('limits travel: per visitor, per day, and refused posts from other sites', async () => {
  const { post } = server([chatFile()]);
  const ask = (visitor) => post('/chat/desk/messages', { visitor, message: 'Hello?' });
  for (let i = 0; i < 3; i += 1) assert.equal((await ask(VISITOR)).status, 200);
  const fourth = await ask(VISITOR);
  assert.equal(fourth.status, 429);
  assert.equal(fourth.headers.get('retry-after'), '60');
  assert.equal((await ask(OTHER)).status, 200, 'each visitor has their own');
  for (const n of [1, 2]) assert.equal((await ask(`visitor-c${n}ccccccccccccccc`)).status, 200);
  for (const n of [3, 4]) assert.equal((await ask(`visitor-c${n}ccccccccccccccc`)).status, 200);
  for (const n of [5, 6]) assert.equal((await ask(`visitor-c${n}ccccccccccccccc`)).status, 200);
  const over = await ask('visitor-c7ccccccccccccccc');
  assert.equal(over.status, 429, 'the daily cap of 10');
  assert.equal(over.data.error.code, 'chat_page_daily_limit');
  const foreign = await post('/chat/desk/messages', { visitor: VISITOR, message: 'From elsewhere' }, { origin: 'https://evil.example' });
  assert.equal(foreign.status, 403);
  assert.equal((await post('/chat/desk/messages', { visitor: '../../etc/passwd', message: 'x' })).data.error.code, 'invalid_visitor');
});

test('what a page can’t do here fails plainly: voice, attachments, a study', async () => {
  const { post } = server([chatFile()]);
  assert.equal((await post('/chat/desk/messages', { visitor: VISITOR, message: 'Hi', audio: 'data:audio/webm;base64,AAAA' })).data.error.code, 'voice_not_available');
  assert.equal((await post('/chat/desk/messages', { visitor: VISITOR, message: 'Hi', attachments: [{ data: 'data:image/png;base64,AAAA' }] })).data.error.code, 'attachments_not_available');
  assert.equal((await post('/chat/desk/transcribe', { visitor: VISITOR, audio: 'x' })).data.error.code, 'voice_not_available');
  assert.equal((await post('/chat/desk/study', { visitor: VISITOR, decision: 'consented' })).status, 404);
  assert.deepEqual((await post('/chat/desk/learner', { visitor: VISITOR })).data, { object: 'chat.learner', identify: 'browser', joined: false, code: null, name: null, study: null });
});

test('errors tell a learner nothing of the server: no stack, no endpoint, no internal reason', async () => {
  const { post, call } = server([chatFile()], { fetch: async () => new Response(JSON.stringify({ error: { message: 'bad key sk-secret at https://models.example' } }), { status: 401 }) });
  const failed = await post('/chat/desk/messages', { visitor: VISITOR, message: 'Hi' });
  assert.equal(failed.status, 502);
  assert.equal(failed.data.error.code, 'chat_unavailable');
  assert.ok(!/sk-secret|models\.example|stack/.test(JSON.stringify(failed.data)));
  const streamed = await call('/chat/desk/messages', { body: { visitor: OTHER, message: 'Hi', stream: true } });
  const last = parseEvents(await streamed.text()).at(-1);
  assert.equal(last.name, 'run.failed');
  assert.ok(!/sk-secret|models\.example/.test(JSON.stringify(last.data)));
  const tooBig = server([chatFile()], { options: { maxBodyBytes: 100 } });
  assert.equal((await tooBig.post('/chat/desk/messages', { visitor: VISITOR, message: 'x'.repeat(200) })).status, 413);
});

test('a course: a browser’s own learner with a code, questions graded here with no key sent, and hidden activities closed', async () => {
  const { call, post, store, calls } = server([courseFile()]);
  const home = await call('/course/equivalent-fractions');
  assert.equal(home.status, 200);
  const page = await home.text();
  assert.match(page, /Equivalent fractions/);
  assert.match(page, /Start fresh/);
  assert.ok(!/studied|consent/i.test(page), 'no study in a page that has none');
  const first = await post('/course/equivalent-fractions/home', { visitor: VISITOR });
  assert.equal(first.data.needs, null);
  assert.match(first.data.learner.code, /^[2-9A-HJKMNP-Z]{8}$/);
  assert.equal(first.data.learner.name, null);
  assert.deepEqual(first.data.units.flatMap((unit) => unit.activities.map((card) => card.key)), ['practice-equivalent-fractions'], 'the hidden check isn’t listed');
  assert.equal((await post('/course/equivalent-fractions/home', { visitor: VISITOR })).data.learner.code, first.data.learner.code, 'the same learner on a reload');

  const activity = await call('/course/equivalent-fractions/practice-equivalent-fractions');
  const html = await activity.text();
  assert.equal(activity.status, 200);
  const doc = example('fractions-practice.json');
  const items = doc.question_sets.find((set) => set.ref === 'practice').items;
  const shown = JSON.parse(/<script type="application\/json" id="ws-config">(.*?)<\/script>/s.exec(html)[1]);
  const asked = shown.panels.find((panel) => panel.type === 'questions').items;
  assert.equal(asked.length, items.length);
  for (const item of asked) {
    for (const hidden of ['answer', 'explanation', 'rubric']) assert.ok(!(hidden in item), `no ${hidden} in the page`);
    assert.equal(typeof item.hints, 'number', 'how many hints, not what they say');
  }
  for (const item of items) {
    if (item.explanation) assert.ok(!html.includes(item.explanation), 'no explanation in the page');
    for (const hint of item.hints || []) assert.ok(!html.includes(hint), 'no hint in the page');
  }
  assert.ok(!html.includes(doc.course.activities[0].teaching.watch_for), 'no teacher’s note in the page');

  const closed = await call('/course/equivalent-fractions/check-equivalent-fractions');
  assert.match(await closed.text(), /isn’t open yet/);
  assert.equal((await post('/course/equivalent-fractions/check-equivalent-fractions/questions', { visitor: VISITOR, action: 'state', panel: 'check' })).status, 403, 'a hidden activity takes nothing');

  const base = '/course/equivalent-fractions/practice-equivalent-fractions';
  const item = items[0];
  const wrong = await post(`${base}/questions`, { visitor: VISITOR, panel: 'practice', item: item.id, response: 'surely not this', rt_ms: 1200 });
  assert.equal(wrong.data.object, 'question.answer');
  assert.equal(wrong.data.correct, false);
  assert.equal(wrong.data.attempt, 1);
  assert.ok(!('answer' in wrong.data) && !JSON.stringify(wrong.data).includes('accept'));
  assert.equal((await post(`${base}/questions`, { visitor: VISITOR, panel: 'practice', action: 'state' })).data.items[item.id].tries, 1);
  assert.equal((await post(`${base}/questions`, { visitor: OTHER, panel: 'practice', action: 'state' })).status, 403, 'someone who hasn’t joined can’t ask');
  assert.equal((await post(`${base}/questions`, { visitor: VISITOR, panel: '../../x', action: 'state' })).status, 404, 'a panel is one of the page’s');

  const told = await post(`${base}/messages`, { visitor: VISITOR, message: 'Can you help?', workspace: { panel: 'practice', item: item.id } });
  assert.equal(told.status, 200);
  const prompt = JSON.stringify(calls[0]);
  assert.ok(prompt.includes(doc.course.activities[0].teaching.goal), 'How the AI helps reaches the AI');
  assert.ok(!prompt.includes(doc.course.activities[0].teaching.watch_for), 'the teacher’s note doesn’t');
  assert.ok(!prompt.includes(first.data.learner.code), 'the learner’s code doesn’t');

  const { records, runs } = await learnerRecords(store, 'equivalent-fractions');
  assert.equal(records.length, 1);
  assert.equal(records[0].user, first.data.learner.code);
  assert.ok(records[0].events.some((event) => event.type === 'questions.answer'));
  assert.equal(records[0].turns[0].message, 'Can you help?');
  assert.equal(runs.length, 1);
  assert.match(teacherView({ records, runs, teaching: doc.course.activities[0].teaching, suggestions: suggestChanges({ teaching: doc.course.activities[0].teaching, runs, records }) }), /Equivalent|fractions|learner/i);
});

test('the AI writes first only at a moment the teacher chose, as often as they said, and the page carries only those moments', async () => {
  const doc = example('fractions-practice.json');
  const activities = doc.course.activities.map((activity, index) => (index ? activity : { ...activity, teaching: { ...activity.teaching, speaks_up: { wrong: { after: 2 }, most: 1 } } }));
  // The reply, then its review, which passes.
  const { call, post, calls, store } = server([courseFile({ ...doc, course: { ...doc.course, activities } })], { modelReply: (n) => (n % 2 ? 'How did you get that?' : 'PASS') });
  await post('/course/equivalent-fractions/home', { visitor: VISITOR });
  const base = '/course/equivalent-fractions/practice-equivalent-fractions';
  const html = await (await call(base)).text();
  assert.match(html, /"speaksUp":\{"wrong":\{"after":2\},"most":1,"gap":3\}/, 'the page knows the moments, and nothing else of the teacher’s settings');
  // Its scripts parse, whatever the page holds.
  for (const [, code] of html.matchAll(/<script nonce="[^"]+">([\s\S]*?)<\/script>/g)) assert.doesNotThrow(() => new Function(code));
  const first = await post(`${base}/messages`, { visitor: VISITOR, event: { kind: 'wrong' }, workspace: { panel: 'practice' } });
  assert.equal(first.status, 200);
  assert.equal(first.data.reply.text, 'How did you get that?');
  const asked = calls.find((sent) => /Right now:/.test(sent.messages[0].content)).messages;
  assert.match(asked[0].content, /Right now: The learner has just checked an answer and it wasn’t right, for the second time\./);
  assert.match(asked.at(-1).content, /^\[Not from the learner: /);
  assert.equal((await post(`${base}/messages`, { visitor: VISITOR, event: { kind: 'wrong' } })).data.error.code, 'speaks_first_limit', 'once a step, as the teacher said');
  assert.equal((await post(`${base}/messages`, { visitor: VISITOR, event: { kind: 'quiet' } })).data.error.code, 'speaks_first_off', 'not a moment the teacher chose');
  const { records } = await learnerRecords(store, 'equivalent-fractions');
  const turn = records.flatMap((record) => record.turns || []).find((item) => item.signals?.source === 'ai_first');
  if (turn) assert.equal(turn.message, '', 'no message of the learner’s is kept for it');
  assert.equal((await post(`${base}/watch`, { visitor: VISITOR })).status, 403, 'what the AI did only where the teacher asked for it');
});

test('a shared computer: “Not you?” starts over, and a code brings a learner’s work back anywhere', async () => {
  const { post } = server([courseFile(example('argument-writing.json'))]);
  const code = 'should-high-schools-start-later';
  const course = 'argument-writing';
  const pages = await post(`/course/${course}/home`, { visitor: VISITOR });
  const courseCode = pages.status === 404 ? null : course;
  assert.ok(courseCode, 'the course is at its title’s slug');
  const { learner } = pages.data;
  const base = `/course/${course}/${pages.data.units[0].activities[0].key}`;
  assert.ok(base.includes(code));
  const panel = 'essay';
  const saved = await post(`${base}/draft`, { visitor: VISITOR, panel, draft: 'Schools should start later.', plan: '', base: null });
  assert.equal(saved.data.object, 'workspace.draft');
  assert.equal(saved.data.words, 4);
  const changed = await post(`${base}/draft`, { visitor: VISITOR, panel, draft: 'Saved over?', base: null });
  assert.equal(changed.status, 409, 'nothing written elsewhere is saved over');
  assert.equal(changed.data.error.code, 'draft_changed');
  assert.equal(changed.data.error.details.draft.draft, 'Schools should start later.');

  // Another computer: a new browser re-enters the code, and has the draft.
  assert.equal((await post(`/course/${course}/join`, { visitor: OTHER, code: 'NOPE2345' })).data.error.code, 'code_not_found');
  const back = await post(`/course/${course}/join`, { visitor: OTHER, code: learner.code.toLowerCase() });
  assert.equal(back.data.code, learner.code);
  assert.equal((await post(`${base}/draft`, { visitor: OTHER, action: 'load' })).data.drafts[panel].draft, 'Schools should start later.');
  assert.equal((await post(`${base}/learner`, { visitor: OTHER })).data.joined, true);

  // Starting fresh on this browser: a new learner, with none of it.
  const third = 'visitor-dddddddddddddddd';
  const fresh = await post(`/course/${course}/join`, { visitor: third, fresh: true });
  assert.notEqual(fresh.data.code, learner.code);
  assert.deepEqual((await post(`${base}/draft`, { visitor: third, action: 'load' })).data.drafts, {});
});

test('a class code keeps out whoever hasn’t got it; a learner’s own code still works', async () => {
  const { post, call } = server([courseFile()], { pages: { classCode: 'moon-42' } });
  const course = '/course/equivalent-fractions';
  assert.equal((await post(`${course}/home`, { visitor: VISITOR })).data.needs, 'join');
  assert.doesNotMatch(await (await call(course)).text(), /Start fresh/);
  assert.equal((await post(`${course}/join`, { visitor: VISITOR, fresh: true })).status, 400);
  assert.equal((await post(`${course}/join`, { visitor: VISITOR, code: 'wrong' })).status, 404);
  const joined = await post(`${course}/join`, { visitor: VISITOR, code: 'MOON 42' });
  assert.match(joined.data.code, /^[2-9A-HJKMNP-Z]{8}$/);
  assert.equal((await post(`${course}/home`, { visitor: VISITOR })).data.learner.code, joined.data.code);
  assert.equal((await post(`${course}/join`, { visitor: OTHER, code: joined.data.code })).data.code, joined.data.code);
});

test('steps: a later panel isn’t in the page or open until the learner gets there', async () => {
  const doc = example('moon-phases-reading.json');
  const clock = { at: Date.parse('2026-11-03T15:00:00Z') };
  const { post, call } = server([courseFile(doc)], { pages: { now: () => clock.at } });
  const course = `/course/${(await pagesKey(doc))}`;
  const home = await post(`${course}/home`, { visitor: VISITOR });
  const base = `${course}/${home.data.units[0].activities[0].key}`;
  const page = await (await call(base)).text();
  const steps = doc.course.activities[0].workspace.steps;
  const later = doc.question_sets[0].items[0];
  if (steps) {
    assert.ok(!page.includes(later.prompt), 'a later step’s questions aren’t in the page');
    const now = await post(`${base}/step`, { visitor: VISITOR });
    assert.equal(now.data.object, 'workspace.step');
    assert.equal(now.data.index, 0);
    assert.equal((await post(`${base}/questions`, { visitor: VISITOR, panel: 'check', action: 'state' })).data?.error?.code, 'step_closed');
    const soon = await post(`${base}/step`, { visitor: VISITOR, action: 'next', to: 1, by: 'ready' });
    assert.equal(soon.data.error.code, 'step_not_open', 'its minutes aren’t up');
    clock.at += 4 * 60000;
    const moved = await post(`${base}/step`, { visitor: VISITOR, action: 'next', to: 1, by: 'ready' });
    assert.equal(moved.data.index, 1);
    assert.ok(moved.data.panels.some((panel) => panel.items?.length));
    for (const item of moved.data.panels.flatMap((panel) => panel.items || [])) assert.ok(!('answer' in item) && !('explanation' in item), 'no keys come with them');
  }
});
test('the model is told only a panel open at the learner’s step, and the hints the server gave them', async () => {
  const clock = { at: Date.parse('2026-11-03T15:00:00Z') };
  const doc = example('fractions-practice.json');
  const activity = doc.course.activities[0];
  const practice = activity.workspace.panels.find((panel) => panel.type === 'questions');
  const item = { ...doc.question_sets[0].items[0], hints: ['HINT-ONE same size pieces', 'HINT-TWO count them'] };
  doc.question_sets[0].items[0] = item;
  doc.course.activities[0] = { ...activity, workspace: { ...activity.workspace, panels: [{ id: 'notes', type: 'writing', title: 'Notes', prompt: 'Why?' }, ...activity.workspace.panels], steps: [{ title: 'Write', panels: ['notes'] }, { title: 'Practice', panels: [practice.id], move: 'ready' }] } };
  const { post, calls } = server([courseFile(doc)], { pages: { now: () => clock.at } });
  const course = `/course/${await pagesKey(doc)}`;
  const home = await post(`${course}/home`, { visitor: VISITOR });
  const base = `${course}/${home.data.units[0].activities[0].key}`;
  const say = async (workspace) => { const told = await post(`${base}/messages`, { visitor: VISITOR, message: 'Help', workspace }); assert.equal(told.status, 200, JSON.stringify(told.data)); return JSON.stringify(calls.splice(0)); };

  const locked = await say({ panel: practice.id, item: item.id, hints: 9 });
  assert.ok(!locked.includes(item.prompt), 'a later step’s question isn’t told');
  assert.ok(!locked.includes('Correct answer'), 'nor does its key reach a review');
  assert.ok(!locked.includes('HINT-ONE'));
  clock.at += 60 * 60000;
  assert.equal((await post(`${base}/step`, { visitor: VISITOR, action: 'next', to: 1, by: 'ready' })).data.index, 1);

  const open = await say({ panel: practice.id, item: item.id, hints: 9 });
  assert.ok(open.includes(item.prompt), 'at its step it is');
  assert.ok(!open.includes('HINT-ONE'), 'no hint has been given');
  assert.equal((await post(`${base}/questions`, { visitor: VISITOR, panel: practice.id, item: item.id, action: 'hint', index: 0 })).data.object, 'question.hint');
  const hinted = await say({ panel: practice.id, item: item.id, hints: 9 });
  assert.ok(hinted.includes('HINT-ONE'));
  assert.ok(!hinted.includes('HINT-TWO'));
});
const pagesKey = async (doc) => [...pagesOf(new Map(agentsToServe([courseFile(doc)]).map((agent) => [agent.slug, agent])), { assets: ASSETS }).courses.keys()][0];

test('what can’t be shown here isn’t: spoken questions, a reading with no PDF or no pdf.js, and the server says so', () => {
  const doc = example('moon-phases-reading.json');
  const served = new Map(agentsToServe([courseFile(doc)]).map((agent) => [agent.slug, agent]));
  const [withPdfJs] = [...pagesOf(served, { assets: ASSETS }).courses.values()];
  const [without] = [...pagesOf(served, { assets: null }).courses.values()];
  const panels = (course) => [...course.activities.values()][0].workspace.panels.map((panel) => panel.type);
  assert.ok(panels(withPdfJs).includes('reading'));
  assert.ok(!panels(without).includes('reading'), 'no pdf.js built, no Reading panel');
  assert.match(learnerNotes(served, { assets: null }).join(' '), /browser files aren't built/);
  const spoken = structuredClone(doc);
  spoken.question_sets[0].items.push({ id: 'say', type: 'spoken', prompt: 'Say it aloud.', max_seconds: 30 });
  const servedSpoken = new Map(agentsToServe([courseFile(spoken)]).map((agent) => [agent.slug, agent]));
  const [course] = [...pagesOf(servedSpoken, { assets: ASSETS }).courses.values()];
  assert.ok(![...course.sets.values()][0].items.some((item) => item.type === 'spoken'));
  assert.match(learnerNotes(servedSpoken, { assets: ASSETS }).join(' '), /spoken questions aren't asked/);
});

test('the teacher’s page is behind the token, which is never taken from an address', async () => {
  const { call, post, handle } = server([courseFile()], { options: { token: 'teacher-token' } });
  await post('/course/equivalent-fractions/home', { visitor: VISITOR });
  const open = await call('/teacher');
  assert.ok([200, 401].includes(open.status));
  assert.match(await open.text(), /Enter this server’s token/);
  const inAddress = await call('/teacher?token=teacher-token');
  assert.ok(!/What the AI did|How the AI helps/.test(await inAddress.text()), 'a token in the address opens nothing');
  const wrong = await call('/teacher', { method: 'POST', body: 'token=nope', headers: { 'content-type': 'application/x-www-form-urlencoded' } });
  assert.equal(wrong.status, 401);
  assert.equal((await call('/teacher', { method: 'POST', body: 'token=teacher-token', origin: 'https://evil.example', headers: { 'content-type': 'application/x-www-form-urlencoded' } })).status, 403, 'not from another site');
  assert.equal(open.headers.get('referrer-policy'), 'same-origin', 'so its form’s post says where it comes from: with no referrer a browser sends the origin null');
  assert.equal((await call('/teacher', { method: 'POST', body: 'token=teacher-token', origin: 'null', headers: { 'content-type': 'application/x-www-form-urlencoded' } })).status, 403);
  assert.equal((await call('/teacher', { method: 'POST', body: 'token=teacher-token', origin: 'https://school.example', headers: { 'content-type': 'application/x-www-form-urlencoded' } })).status, 303);
  const signed = await call('/teacher', { method: 'POST', body: 'token=teacher-token', headers: { 'content-type': 'application/x-www-form-urlencoded' } });
  assert.equal(signed.status, 303);
  const cookie = signed.headers.get('set-cookie');
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Strict/);
  assert.match(cookie, /Secure/);
  assert.ok(!cookie.includes('teacher-token'));
  const page = await call('/teacher', { headers: { cookie: cookie.split(';')[0] } });
  assert.equal(page.status, 200);
  assert.match(await page.text(), /How the AI helps/);
  assert.equal(page.headers.get('cache-control'), 'no-store');
  assert.equal((await call('/teacher/records.json', { headers: { authorization: 'Bearer teacher-token' } })).status, 200);
  assert.equal((await call('/teacher/records.json', { headers: { cookie: 'viable_teacher=' + 'a'.repeat(64) } })).status, 401);
  assert.ok(handle);

  const noToken = server([courseFile()], { options: { token: null } });
  assert.equal((await noToken.call('/teacher')).status, 403, 'without a token, not from another computer');
  assert.equal((await noToken.call('/teacher', { base: 'http://localhost:5701', context: { address: '127.0.0.1' } })).status, 403, 'nor on this machine, with no token to take: through a local proxy everyone looks local');
  const madeOne = server([courseFile()], { options: { token: null }, pages: { teacherToken: 'made-at-start' } });
  const local = { base: 'http://localhost:5701', context: { address: '127.0.0.1' } };
  assert.equal((await madeOne.call('/teacher', local)).status, 401);
  assert.equal((await madeOne.call('/teacher', { ...local, headers: { authorization: 'Bearer made-at-start' } })).status, 200);
  assert.equal((await noToken.call('/teacher', { base: 'http://localhost:5701', context: { address: '203.0.113.9' } })).status, 403, 'a name in a header doesn’t make it local');
});

test('what the AI did on a turn is off by default, and never a learner’s', async () => {
  const ask = async (server_) => (await server_.post('/chat/desk/messages', { visitor: VISITOR, message: 'Hi' })).data.run_id;
  const off = server([chatFile()], { options: { token: 't' } });
  const run = await ask(off);
  assert.equal((await off.call(`/teacher/turns/${run}/trace`, { headers: { authorization: 'Bearer t' } })).status, 404, 'off unless granted');
  assert.equal(await off.store.get(`traces/${run}`), null, 'and not kept');

  const granted = server([chatFile()], { pages: { traces: 'token' }, options: { token: 't' } });
  const id = await ask(granted);
  const path = `/teacher/turns/${id}/trace`;
  for (const asLearner of [{}, { headers: { cookie: 'viable_teacher=abc' } }, { headers: { authorization: 'Bearer nope' } }]) {
    const response = await granted.call(path, asLearner);
    assert.equal(response.status, 404, 'a learner gets nothing, not even that it exists');
    assert.ok(!(await response.text()).includes('steps'));
  }
  assert.equal((await granted.call(`${path}?visitor=${VISITOR}`)).status, 404);
  const trace = await (await granted.call(path, { headers: { authorization: 'Bearer t' } })).json();
  assert.equal(trace.object, 'turn.trace');
  assert.ok(Array.isArray(trace.steps) && trace.steps.length);
  const local = server([chatFile()], { pages: { traces: 'local' }, options: { token: null } });
  const here = (await local.post('/chat/desk/messages', { visitor: VISITOR, message: 'Hi' }, { base: 'http://localhost:5701', context: { address: '127.0.0.1' } })).data.run_id;
  assert.equal((await local.call(`/teacher/turns/${here}/trace`)).status, 403, 'try mode only on this machine');
  assert.equal((await local.call(`/teacher/turns/${here}/trace`, { base: 'http://127.0.0.1:5701', context: { address: '127.0.0.1' } })).status, 200);
  assert.equal((await local.call(`/teacher/turns/${here}/trace`, { base: 'http://127.0.0.1:5701', context: { address: '198.51.100.3' } })).status, 403);
});

test('a server made for a public host stays shut until it has its token', async () => {
  const unset = server([chatFile()], { options: { requireToken: true, token: null } });
  for (const path of ['/chat/desk', '/teacher', '/embed.js', '/v1/agents/desk/chat']) assert.equal((await unset.call(path)).status, 503, path);
  assert.equal((await unset.post('/chat/desk/messages', { visitor: VISITOR, message: 'Hi' })).status, 503);
  assert.equal(unset.calls.length, 0, 'nothing reached the model');
  const set = server([chatFile()], { options: { requireToken: true, token: 't' } });
  assert.equal((await set.call('/chat/desk')).status, 200);
});

test('keepDays takes a learner’s text with it', async () => {
  const clock = { at: Date.parse('2026-11-03T15:00:00Z') };
  const { handle, post, store } = server([courseFile()], { pages: { now: () => clock.at }, options: { keepDays: 30 } });
  await post('/course/equivalent-fractions/home', { visitor: VISITOR });
  await post('/course/equivalent-fractions/practice-equivalent-fractions/messages', { visitor: VISITOR, message: 'An old question' });
  assert.equal((await learnerRecords(store, 'equivalent-fractions')).records[0].turns.length, 1);
  for (const key of await store.list('courses/')) if (key.includes('/turns/')) await store.put(key, { ...(await store.get(key)), started_at: '2020-01-01T00:00:00.000Z' });
  const { deleted } = await handle.sweep();
  assert.ok(deleted >= 1);
  assert.equal((await learnerRecords(store, 'equivalent-fractions')).records.flatMap((record) => record.turns).length, 0);
});

test('forgetting a learner takes their work, conversations, runs, memory and an app’s gateway records', async () => {
  const { post, store, handle } = server([courseFile()]);
  const { learner } = (await post('/course/equivalent-fractions/home', { visitor: VISITOR })).data;
  const base = '/course/equivalent-fractions/practice-equivalent-fractions';
  const asked = await post(`${base}/messages`, { visitor: VISITOR, message: 'Help me with fractions' });
  assert.equal(asked.status, 200);
  const stored = (await store.list('conversations/')).length;
  assert.ok(stored >= 1, 'its conversation is kept');
  const id = (await store.get(`courses/equivalent-fractions/codes/${learner.code}`)).learner;
  await store.put(`memory/${id}`, [{ id: 'm', content: 'Likes pies' }]);
  await store.put(`gateway/lesson/records/${id}/run-1`, { user: id });
  await store.put(`gateway/lesson/runs/${id}/run-1`, {});
  await store.put('gateway/lesson/records/someone-else/run-1', { user: 'someone-else' });
  // Someone else's stays.
  const other = await post('/course/equivalent-fractions/home', { visitor: OTHER });
  await post(`${base}/messages`, { visitor: OTHER, message: 'Mine stays' });
  const removed = await forgetLearner(store, learner.code);
  assert.deepEqual(removed.courses, ['equivalent-fractions']);
  assert.equal(removed.conversations, 1);
  assert.equal(removed.memory, 1);
  assert.equal(removed.gateway, 2);
  const left = JSON.stringify(await Promise.all((await store.list('')).map(async (key) => [key, await store.get(key)])));
  assert.ok(!left.includes('Help me with fractions'), 'no word of theirs is left');
  assert.ok(!left.includes(id) && !left.includes(learner.code), 'no mention of them');
  assert.ok(left.includes('Mine stays'));
  assert.ok(left.includes(other.data.learner.code));
  assert.ok(left.includes('someone-else'));
  assert.ok(handle);
});

test('a learner named by a proxy’s header is that learner on any browser, and nobody without it gets in', async () => {
  const { post, call, store } = server([courseFile()], { pages: { learnerHeader: 'x-school-id' } });
  const course = '/course/equivalent-fractions';
  const as = (who) => ({ headers: who ? { 'x-school-id': who } : {} });
  assert.equal((await post(`${course}/home`, { visitor: VISITOR }, as(null))).status, 401);
  assert.equal((await post(`${course}/home`, { visitor: VISITOR }, as(null))).data.error.code, 'sign_in_required');
  const first = await post(`${course}/home`, { visitor: VISITOR }, as('s-0412'));
  assert.equal(first.status, 200);
  assert.equal(first.data.course.identify, 'browser', 'nothing is asked on the page');
  const again = await post(`${course}/home`, { visitor: OTHER }, as('s-0412'));
  assert.equal(again.data.learner.code, first.data.learner.code, 'the same learner on another browser');
  const someone = await post(`${course}/home`, { visitor: OTHER }, as('s-0999'));
  assert.notEqual(someone.data.learner.code, first.data.learner.code, 'a shared browser follows who is signed in');
  assert.equal((await post(`${course}/home`, { visitor: VISITOR }, as('s-0412'))).data.learner.code, first.data.learner.code);
  assert.doesNotMatch(await (await call(course)).text(), /Start fresh/);
  const kept = JSON.stringify(await Promise.all((await store.list('')).map(async (key) => [key, await store.get(key)])));
  assert.ok(!kept.includes('s-0412'), 'the school’s ID is kept only as a hash');
});

test('a citation links to a package’s file only where its knowledge base allows, and the file is never run here', async () => {
  const text = '### Page 3\n\nThe reading room opens at nine on weekdays, and at noon on Saturdays.';
  const zipped = { 'files/a.md': new TextEncoder().encode(text), 'files/page.html': new TextEncoder().encode('<script>alert(1)</script>') };
  const graphWith = { entry: 's', nodes: [{ id: 's', type: 'knowledge', config: { knowledge_base_refs: ['open'] }, next: 'write' }, { id: 'write', type: 'llm', config: { model: 'm', citations: true, system: '{{s.context}}' }, next: 'o' }, { id: 'o', type: 'output', config: { text: '{{write.content}} [1]', sources: true } }] };
  const doc = { format: 'viable.course-package', version: 1, course: { title: 'Help desk' }, files: [{ ref: 'a', name: 'hours.md', path: 'files/a.md' }, { ref: 'b', name: 'page.html', path: 'files/page.html' }, { ref: 'c', name: 'closed.md', path: 'files/a.md' }], knowledge_bases: [{ ref: 'open', name: 'Open', file_links: true, file_refs: ['a', 'b'] }, { ref: 'shut', name: 'Shut', file_refs: ['c'] }], agents: [{ ref: 'desk', name: 'Desk', graph: graphWith }] };
  const readPath = async (name) => { if (!zipped[name]) throw new Error('no'); return zipped[name]; };
  const { call } = server([{ doc, dir: '/nowhere', file: 'c.json', name: 'c.json' }], { pages: { readPath } });
  const file = await call('/package-files/help-desk/a');
  assert.equal(file.status, 200);
  assert.match(file.headers.get('content-disposition'), /^attachment/);
  assert.equal(file.headers.get('x-content-type-options'), 'nosniff');
  assert.match(file.headers.get('content-security-policy'), /sandbox/);
  const page = await call('/package-files/help-desk/b');
  assert.match(page.headers.get('content-type'), /^text\/plain/, 'an HTML file isn’t run on this server’s address');
  assert.equal((await call('/package-files/help-desk/c')).status, 404, 'a knowledge base that doesn’t allow links keeps its files');
  assert.equal((await call('/package-files/help-desk/..%2F..%2Fpackage.json')).status, 404);
  assert.equal((await call('/package-files/other/a')).status, 404);
});

test('an agent’s package with no course: its chat page, no course home, and its file behind the citation', async () => {
  const doc = { format: 'viable.course-package', version: 1, title: 'Library help', files: [{ ref: 'file-1', name: 'hours.md', path: 'files/hours.md' }], knowledge_bases: [{ ref: 'kb-1', name: 'Guides', file_links: true, file_refs: ['file-1'] }], agents: [{ ref: 'agent-1', slug: 'library-help', name: 'Library help', graph, profile: { greeting: 'Ask the desk.' }, chat_page: { status: 'active', settings: {} } }] };
  const { call, post } = server([{ doc, dir: '/nowhere', file: 'p.json', name: 'p.json' }], { pages: { readPath: async () => new TextEncoder().encode('Open at nine.') } });
  const page = await (await call('/chat/library-help')).text();
  assert.match(page, /Ask the desk\./);
  assert.equal((await post('/chat/library-help/messages', { visitor: VISITOR, message: 'When?' })).status, 200);
  assert.equal((await call('/package-files/library-help/file-1')).status, 200, 'named by the package’s title');
  assert.equal((await call('/course/library-help')).status, 404);
});

test('the teacher’s page reads a chat page’s records too, and offers a choice when there is more than one', async () => {
  const both = server([chatFile(), courseFile()], { options: { token: 't' } });
  const auth = { headers: { authorization: 'Bearer t', accept: 'text/html' } };
  await both.post('/chat/desk/messages', { visitor: VISITOR, message: 'From the desk' });
  const choice = await (await both.call('/teacher', auth)).text();
  assert.match(choice, /What would you like to read\?/);
  assert.match(choice, /href="\/teacher\?chat=desk"/);
  assert.match(choice, /course=equivalent-fractions&amp;activity=practice-equivalent-fractions/);
  const chat = await (await both.call('/teacher?chat=desk', auth)).text();
  assert.match(chat, /From the desk|What VETTING did/);
  const records = await (await both.call('/teacher/records.json?chat=desk', auth)).json();
  assert.equal(records.records[0].turns[0].message, 'From the desk');
  assert.match(records.records[0].user, /^chat:[a-f0-9]{32}$/, 'a visitor is an anonymous hash');
  assert.equal((await both.call('/teacher/records.json?chat=nope', auth)).status, 404);
  assert.equal((await both.call('/teacher/records.json?chat=desk')).status, 401);
});

test('store keys and asset paths are checked, and a learner can be removed in one call', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'viable-learner-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const store = fileStore(dir);
  const { post, call } = server([courseFile()], { store });
  const first = await post('/course/equivalent-fractions/home', { visitor: VISITOR });
  for (const path of ['/v1/agents/chat-assets/../../secret', '/v1/agents/chat-assets/%2e%2e/secret', '/v1/agents/chat-assets/a/../../b']) assert.notEqual((await call(path)).status, 200, path);
  assert.equal((await call('/v1/agents/chat-assets/render-1.js')).status, 200);
  assert.equal((await call('/v1/agents/chat-assets/render-1.js')).headers.get('x-content-type-options'), 'nosniff');
  assert.equal((await post('/course/equivalent-fractions/home', { visitor: 'a/b/c/d/e/f/g/h/i/j/k/l' })).status, 400);
  const base = '/course/equivalent-fractions/practice-equivalent-fractions';
  await post(`${base}/questions`, { visitor: VISITOR, panel: 'practice', item: example('fractions-practice.json').question_sets[0].items[0].id, response: 'x' });
  assert.equal((await learnerRecords(store, 'equivalent-fractions')).records.length, 1);
  assert.deepEqual((await forgetLearner(store, first.data.learner.code)).courses, ['equivalent-fractions']);
  assert.deepEqual(await learnerRecords(store, 'equivalent-fractions'), { records: [], runs: [] });
  assert.equal((await post(`${base}/draft`, { visitor: VISITOR, action: 'load' })).status, 403, 'their browser is no longer anyone');
  assert.deepEqual(await forgetLearner(store, 'NOPE2345'), { courses: [], conversations: 0, runs: 0, records: 0, memory: 0, gateway: 0 });
});

test('hostile text from a package stays text in the page', async () => {
  const hostile = '</script><script>alert(1)</script><img src=x onerror=alert(2)>';
  const { call } = server([chatFile({ profile: { title: hostile, tagline: hostile, greeting: hostile, starters: [hostile], notice: hostile, placeholder: hostile } })]);
  const page = await (await call('/chat/desk')).text();
  assert.ok(!page.includes('<script>alert(1)'), 'nothing breaks out of its place');
  assert.ok(!page.includes('<img src=x'));
});
