// A message's run in Ask (console/ask.js "A message's run"): it goes on when the page that sent it leaves, a page can come back
// to it, it is said to have stopped when its runner went, and a long one keeps the teacher's words and every call's answer.
// Its context in tokens (agents/context.js). A scripted model: no network.
import '../../harness/test/no-network.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { memoryStore } from '../../harness/src/store/store.js';
import { createApp } from '../src/server/app.js';
import { clearOlderResults, keepFrom, wholePairs } from '../src/agents/context.js';

const TOKEN = 'a-token-of-some-length';
const BASE = 'http://server.test';
const headers = { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' };
const call = (name, args, id = `call_${Math.random().toString(36).slice(2)}`) => ({ id, type: 'function', function: { name, arguments: JSON.stringify(args) } });
const answerOf = (next) => new Response(JSON.stringify({ choices: [{ message: Array.isArray(next) ? { role: 'assistant', content: null, tool_calls: next } : { role: 'assistant', content: next }, finish_reason: 'stop' }], usage: { total_tokens: 7 } }), { headers: { 'content-type': 'application/json' } });
const frames = (text) => text.split('\n\n').filter((frame) => /^event: /m.test(frame)).map((frame) => ({ seq: Number(/^id: (\d+)$/m.exec(frame)?.[1] || 0), name: /^event: (.+)$/m.exec(frame)[1], data: JSON.parse(/^data: (.+)$/m.exec(frame)?.[1] || 'null') }));

async function server(script, { pages = {}, window = null } = {}) {
  const store = memoryStore();
  const sent = [];
  const fetch = async (url, init = {}) => {
    if (String(url).endsWith('/models')) return new Response(JSON.stringify({ data: [{ id: 'reply-model', ...(window ? { context_window: window } : {}) }] }), { headers: { 'content-type': 'application/json' } });
    if ((init.method || 'GET') === 'GET') return pages[String(url)]?.() ?? new Response('nothing', { status: 404 });
    const body = JSON.parse(init.body);
    sent.push(body);
    // As a real request does, it ends when its signal does.
    const stopped = new Promise((_, fail) => init.signal?.addEventListener('abort', () => fail(Object.assign(new Error('aborted'), { name: 'AbortError' })), { once: true }));
    const next = await Promise.race([script(body, sent.length - 1), stopped]);
    return next instanceof Response ? next : answerOf(next ?? 'Done.');
  };
  const handler = await createApp({ bytes: null, name: 'x', vars: { VIABLE_ENGINE_TOKEN: TOKEN, VIABLE_ENGINE_SECRET: 'a-secret' }, store, fetch, pages: { fetch } });
  const api = (method, path, body) => handler(new Request(`${BASE}/console/api/${path}`, { method, headers, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) }));
  const ok = async (method, path, body) => { const response = await api(method, path, body); const data = await response.json(); assert.ok(response.ok, `${path}: ${JSON.stringify(data)}`); return data; };
  const page = async (path) => (await handler(new Request(`${BASE}/console/${path}`, { headers: { authorization: `Bearer ${TOKEN}`, accept: 'text/html' } }))).text();
  const { id } = await ok('POST', 'providers', { name: 'A provider', base_url: 'http://model.test/v1', key: 'a-key' });
  await ok('PUT', 'roles/reply', { provider: id, model: 'reply-model' });
  return { handler, api, ok, page, store, sent };
}
const until = async (check, ms = 5000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (await check()) return true; await new Promise((done) => setTimeout(done, 20)); }
  throw new Error('It never happened.');
};
// A model step held until the test lets it go.
function held() {
  let go;
  const promise = new Promise((done) => { go = done; });
  return { promise, go };
}

test('a message goes on when its page leaves, and a page that comes back sees what it did, then its end', async () => {
  const gate = held();
  const s = await server(async (_body, at) => {
    if (at === 0) return [call('list_courses', {})];
    if (at === 1) { await gate.promise; return [call('create_course', { title: 'Fractions, period 2', audience: 'children' })]; }
    return 'I set up the course.';
  });
  // The page reads the first of it, then is closed.
  const started = await s.api('POST', 'ask', { message: 'Fractions for grade 5.' });
  const reader = started.body.getReader();
  const first = new TextDecoder().decode((await reader.read()).value);
  const { id: thread, run } = frames(first)[0].data;
  await reader.cancel();
  assert.match(run, /^run_[a-f0-9]{24}$/);

  // Meanwhile the page drawn again knows a run is going, and leaves its message for the run's log to draw.
  await until(async () => s.sent.length >= 2);
  const midway = await s.page(`ask/${thread}`);
  assert.match(midway, new RegExp(`data-running="1" data-run="${run}"`));
  assert.doesNotMatch(midway, /You have no courses|Looking at your courses/, 'what it has done so far comes from the log, not the page');
  assert.equal((await s.api('POST', 'ask', { message: 'And another', thread })).status, 409, 'one run at a time');

  gate.go();
  await until(async () => (await s.store.get(`ask/runs/${thread}`))?.state === 'done');
  const kept = await s.store.get(`ask/threads/${thread}`);
  assert.ok(kept.shown.some((item) => item.kind === 'said' && /I set up the course/.test(item.text)), 'it finished with nobody watching');
  await s.ok('GET', 'courses/fractions-period-2/download');

  // A page that lost it comes back from the last event it heard, and hears the rest, to its end.
  const rest = frames(await (await s.api('GET', `ask/${thread}/events?run=${run}&after=1`)).text());
  assert.ok(rest.every((event) => event.seq > 1));
  assert.ok(rest.some((event) => event.name === 'said' && /I set up the course/.test(event.data.html)));
  assert.deepEqual([rest.at(-1).name, rest.at(-1).data.state], ['done', 'done']);
  // A run that is over, or someone else's, isn't followed.
  assert.equal((await s.api('GET', `ask/${thread}/events?run=run_000000000000000000000000`)).status, 409);
  assert.equal((await s.api('GET', 'ask/thr_000000000000000000000000/events?run=' + run)).status, 404);
});

test('a long message keeps the teacher’s words and every call’s answer in each request, and all of it is kept', async () => {
  // 50 steps of calls: a hundred messages in one message, past where the old window of 80 cut.
  const s = await server((_body, at) => (at < 50 ? [call('list_courses', {}, `call_${at}`)] : 'Looked everywhere.'));
  const events = frames(await (await s.api('POST', 'ask', { message: 'Look at everything I have, step by step.' })).text());
  assert.equal(events.at(-1).name, 'done');
  for (const request of s.sent) {
    const messages = request.messages.slice(1);
    assert.equal(messages[0].role, 'user', 'it starts with the teacher');
    assert.match(messages[0].content, /Look at everything I have/);
    const asked = new Set();
    for (const message of messages) {
      if (message.role === 'assistant') for (const each of message.tool_calls || []) asked.add(each.id);
      if (message.role === 'tool') assert.ok(asked.delete(message.tool_call_id), 'an answer follows its call');
    }
  }
  const thread = await s.store.get(`ask/threads/${events[0].data.id}`);
  assert.ok(thread.messages.length > 100, 'nothing of it is thrown away');
  // The next message still has the first one's words.
  const next = frames(await (await s.api('POST', 'ask', { message: 'Now the next thing.', thread: events[0].data.id })).text());
  assert.equal(next.at(-1).name, 'done');
  assert.match(JSON.stringify(s.sent.at(-1).messages), /Look at everything I have/);
});

test('a conversation past its budget clears older reads first, then folds into a handover that keeps the teacher’s words', async () => {
  const url = 'https://example.org/long';
  const long = `<html><main>${Array.from({ length: 400 }, (_, at) => `<p>Paragraph ${at} of a long page about fractions and how learners add the denominators by mistake.</p>`).join('')}</main></html>`;
  const handovers = [];
  // Long reads, which can be cleared, and long notes on the way, which can't: past both, the older part folds.
  const thinking = 'I am working through the page and noting what matters for the activity. '.repeat(250);
  const s = await server((body) => {
    if (/^You hand over a conversation/.test(body.messages[0].content)) { handovers.push(body); return 'The teacher asked: “Read this page about fractions, every part of it.” Done so far: read most of it.'; }
    const reads = body.messages.filter((message) => message.role === 'tool').length;
    if (reads >= 30) return 'Read it all.';
    return new Response(JSON.stringify({ choices: [{ message: { role: 'assistant', content: thinking, tool_calls: [call('read_link', { url, from: (reads % 4) * 24000 })] }, finish_reason: 'tool_calls' }] }), { headers: { 'content-type': 'application/json' } });
  }, { pages: { [url]: () => new Response(long, { headers: { 'content-type': 'text/html' } }) } });
  const events = frames(await (await s.api('POST', 'ask', { message: `Read this page about fractions, every part of it: ${url}` })).text());
  assert.equal(events.at(-1).name, 'done');
  const requests = s.sent.filter((body) => !/^You hand over/.test(body.messages[0].content));
  assert.ok(requests.some((body) => body.messages.some((message) => message.role === 'tool' && /Cleared to keep the conversation short/.test(message.content))), 'older reads clear first');
  assert.ok(handovers.length >= 1, 'then the older part folds');
  assert.match(handovers[0].messages[1].content, /Teacher: Read this page about fractions/, 'the handover is written from what was said');
  const after = requests.find((body) => /a handover written for you/.test(body.messages[0].content));
  assert.ok(after, 'what was folded goes as a handover');
  assert.match(after.messages[0].content, /The teacher's message you are working on now, in their words:\n"""\nRead this page about fractions, every part of it/, 'the teacher’s message is never folded away');
  for (const body of requests) {
    const weight = JSON.stringify(body.messages).length / 4;
    assert.ok(weight < 128_000, `every call stays under the window (${Math.round(weight)})`);
  }
  const thread = await s.store.get(`ask/threads/${events[0].data.id}`);
  assert.ok(thread.summary?.through > 0, 'the handover is kept with the conversation');
  assert.match(thread.messages[0].content, /Read this page about fractions/, 'and the conversation is kept whole beside it');
});

test('a run whose runner stopped is said to have stopped, with Continue, and frees the conversation', async () => {
  const s = await server(() => 'Hello.');
  const events = frames(await (await s.api('POST', 'ask', { message: 'Hi' })).text());
  const thread = events[0].data.id;
  // As a run whose process went away mid-message leaves it: running, and quiet for long.
  const long = new Date(Date.now() - 600_000).toISOString();
  await s.store.put(`ask/runs/${thread}`, { id: 'run_000000000000000000000002', state: 'running', started_at: long, beat_at: long, attempt: 0 });
  const html = await s.page(`ask/${thread}`);
  assert.doesNotMatch(html, /data-running/);
  assert.match(html, /stopped partway[\s\S]*data-say-this="Go on\."[\s\S]*Continue/);
  assert.equal((await s.store.get(`ask/runs/${thread}`)).state, 'interrupted');
  // Continue is a message like any other.
  const going = frames(await (await s.api('POST', 'ask', { message: 'Go on.', thread })).text());
  assert.equal(going.at(-1).data.state, 'done');
});

test('a message that fails after changing a course can still be undone', async () => {
  const s = await server((_body, at) => (at === 0 ? [call('create_course', { title: 'Fractions, period 2', audience: 'children' })] : new Response(JSON.stringify({ error: { message: 'bad request' } }), { status: 400 })));
  const events = frames(await (await s.api('POST', 'ask', { message: 'Fractions.' })).text());
  assert.equal(events.at(-1).data.state, 'failed');
  const thread = events[0].data.id;
  const html = await s.page(`ask/${thread}`);
  assert.match(html, /Changed “Fractions, period 2”[\s\S]*Undo/, 'what it changed before it failed can go back');
  const change = (await s.store.get(`ask/threads/${thread}`)).shown.find((item) => item.kind === 'changed');
  assert.match((await s.ok('POST', `ask/${thread}/undo/${change.id}`, {})).said, /Undone/);
  assert.equal((await s.store.get(`ask/threads/${thread}`)).shown.find((item) => item.kind === 'changed').state, 'undone');
});

test('a stop is heard while the model is answering', async () => {
  const gate = held();
  let thread = null;
  const s = await server(async (_body, at) => {
    if (at === 0) { await gate.promise; return [call('list_courses', {})]; }
    return 'Never reached.';
  });
  const started = s.api('POST', 'ask', { message: 'Take your time.' });
  await until(async () => s.sent.length === 1);
  thread = (await s.store.list('ask/threads/'))[0].split('/').at(-1);
  await s.ok('POST', `ask/${thread}/stop`, {});
  const events = frames(await (await started).text());
  gate.go();
  assert.ok(events.some((event) => event.name === 'said' && /Stopped/.test(event.data.html)));
  assert.equal(events.at(-1).data.state, 'stopped');
  assert.equal(s.sent.length, 1, 'nothing more is asked of the model');
});

test('context in tokens: whole pairs, cuts where an exchange begins, and older answers cleared first', () => {
  const asked = { role: 'assistant', content: '', tool_calls: [{ id: 'a', function: { name: 'x', arguments: '{}' } }, { id: 'b', function: { name: 'y', arguments: '{}' } }] };
  const fixed = wholePairs([{ role: 'tool', tool_call_id: 'z', content: 'orphan' }, { role: 'user', content: 'Hi' }, asked, { role: 'tool', tool_call_id: 'a', content: 'one' }, { role: 'user', content: 'Next' }]);
  assert.deepEqual(fixed.map((message) => `${message.role}:${message.tool_call_id || ''}`), ['user:', 'assistant:', 'tool:a', 'tool:b', 'user:']);
  assert.match(fixed[3].content, /cut off/);
  const many = Array.from({ length: 30 }, (_, at) => [{ role: 'assistant', content: '', tool_calls: [{ id: `c${at}`, function: { name: 'read', arguments: '{}' } }] }, { role: 'tool', tool_call_id: `c${at}`, content: 'x'.repeat(4000) }]).flat();
  const from = keepFrom([{ role: 'user', content: 'Go' }, ...many], 5000);
  assert.ok(from > 0);
  assert.equal([{ role: 'user', content: 'Go' }, ...many][from].role, 'assistant', 'never at an answer');
  const copy = structuredClone(many);
  assert.ok(clearOlderResults(copy, { keepTokens: 3000, note: 'cleared' }) > 20);
  assert.equal(copy.at(-1).content.length, 4000, 'the latest stays');
  assert.ok(copy.every((message) => message.role !== 'assistant' || message.tool_calls.length === 1), 'calls stay');
});

test('the model’s window is what its provider says, so a smaller one clears sooner', async () => {
  const url = 'https://example.org/long';
  const long = `<html><main>${Array.from({ length: 300 }, (_, at) => `<p>Paragraph ${at} about fractions and how learners add the denominators by mistake.</p>`).join('')}</main></html>`;
  const s = await server((body) => (body.messages.filter((message) => message.role === 'tool').length < 4 ? [call('read_link', { url })] : 'Read it.'), { window: 24_000, pages: { [url]: () => new Response(long, { headers: { 'content-type': 'text/html' } }) } });
  await (await s.api('POST', 'ask', { message: `Read this: ${url}` })).text();
  assert.ok(s.sent.some((body) => body.messages.some((message) => message.role === 'tool' && /Cleared to keep the conversation short/.test(message.content))), 'four reads are past what 24,000 tokens leave');
});

test('Earlier says which conversation is working, and which finished since it was opened', async () => {
  const gate = held();
  const s = await server(async (_body, at) => { if (at === 0) await gate.promise; return 'Done.'; });
  const started = s.api('POST', 'ask', { message: 'Hello there.' });
  await until(async () => s.sent.length === 1);
  assert.match(await s.page('ask'), /class="ask-working"[\s\S]*Working/);
  gate.go();
  const events = frames(await (await started).text());
  const home = await s.page('ask');
  assert.match(home, /class="is-unseen"[\s\S]*class="ask-new"/, 'a dot until it is opened');
  await s.page(`ask/${events[0].data.id}`);
  assert.doesNotMatch(await s.page('ask'), /ask-new/, 'opened, it isn’t new');
});
