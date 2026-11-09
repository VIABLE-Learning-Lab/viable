// What Ask remembers of the person (harness memory.js, console memory.js): kept as they speak, in front of them, and on a page of
// its own where they read, change and delete it; a message gets only what fits; earlier conversations are searched by their words;
// and nothing about a learner is ever kept. A scripted model: no network.
import '../../harness/test/no-network.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { memoryStore } from '../../harness/src/store/store.js';
import { createApp } from '../src/server/app.js';

const TOKEN = 'a-token-of-some-length';
const BASE = 'http://server.test';
const headers = { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' };
const call = (name, args) => ({ id: `call_${Math.random().toString(36).slice(2)}`, type: 'function', function: { name, arguments: JSON.stringify(args) } });

async function server(script) {
  const sent = [];
  let at = 0;
  const fetch = async (url, init = {}) => {
    if (String(url).endsWith('/models')) return new Response(JSON.stringify({ data: [{ id: 'reply-model' }] }), { headers: { 'content-type': 'application/json' } });
    const body = JSON.parse(init.body);
    sent.push(body);
    const next = typeof script === 'function' ? script(body, at) : script[at];
    at += 1;
    const message = next === undefined ? { role: 'assistant', content: 'Done.' } : Array.isArray(next) ? { role: 'assistant', content: null, tool_calls: next } : { role: 'assistant', content: next };
    return new Response(JSON.stringify({ choices: [{ message, finish_reason: 'stop' }], usage: { total_tokens: 7 } }), { headers: { 'content-type': 'application/json' } });
  };
  const store = memoryStore();
  const handler = await createApp({ bytes: null, name: 'x', vars: { VIABLE_ENGINE_TOKEN: TOKEN, VIABLE_ENGINE_SECRET: 'a-secret' }, store, fetch, pages: { fetch } });
  const api = (method, path, body) => handler(new Request(`${BASE}/console/api/${path}`, { method, headers, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) }));
  const ok = async (method, path, body) => { const response = await api(method, path, body); const data = await response.json(); assert.ok(response.ok, `${path}: ${JSON.stringify(data)}`); return data; };
  const page = async (path) => (await handler(new Request(`${BASE}/console/${path}`, { headers: { authorization: `Bearer ${TOKEN}`, accept: 'text/html' } }))).text();
  const ask = async (message, thread) => {
    const response = await api('POST', 'ask', { message, ...(thread ? { thread } : {}) });
    const text = await response.text();
    return text.split('\n\n').filter(Boolean).map((frame) => ({ name: /^event: (.+)$/m.exec(frame)?.[1], data: JSON.parse(/^data: (.+)$/m.exec(frame)?.[1] || 'null') }));
  };
  await ok('POST', 'providers', { name: 'A provider', base_url: 'http://model.test/v1', key: 'a-key' }).then(({ id }) => ok('PUT', 'roles/reply', { provider: id, model: 'reply-model' }));
  return { api, ok, page, ask, sent, store };
}
const threadOf = (events) => events.find((event) => event.name === 'thread').data.id;
const steps = (events) => events.filter((event) => event.name === 'step' && event.data.state === 'done').map((event) => event.data.html).join('\n');
const system = (body) => body.messages.find((message) => message.role === 'system').content;
const toolNames = (body) => (body.tools || []).map((tool) => tool.function.name);

test('the page shows everything Ask remembers, to add, change, move, delete or switch off, and refuses a learner’s name', async () => {
  const s = await server([]);
  let shown = await s.page('ask/memory');
  assert.match(shown, /<h1>What Ask remembers<\/h1>/);
  assert.match(shown, /Remember what I tell it/);
  assert.match(shown, /Look back through my earlier conversations/);
  assert.match(shown, /Nothing yet/);
  assert.match(await s.page('ask'), /href="\/console\/ask\/memory"[^>]*>[\s\S]*?What Ask remembers<\/a><span class="v-note">Nothing yet<\/span>/, 'Ask’s home says where it is');

  await s.ok('POST', 'ask/memory', { text: 'My periods are 45 minutes, and learners share iPads', always: true });
  await s.ok('POST', 'ask/memory', { text: 'Working toward a unit on persuasive writing after the break', always: false });
  shown = await s.page('ask/memory');
  const always = shown.slice(shown.indexOf('id="mem-always"'), shown.indexOf('id="mem-fits"'));
  assert.match(always, /My periods are 45 minutes/);
  assert.doesNotMatch(always, /persuasive writing/);
  assert.match(shown, /Kept <time data-local[^>]*>[^<]+<\/time> · added here/);
  const [first] = (await s.store.get('ask/memory')).items;

  await s.ok('PATCH', `ask/memory/${first.id}`, { always: false });
  await s.ok('PATCH', `ask/memory/${first.id}`, { text: 'My periods are 50 minutes' });
  shown = await s.page('ask/memory');
  assert.match(shown.slice(shown.indexOf('id="mem-fits"')), /My periods are 50 minutes/, 'changed, and moved to when it fits');

  // A learner on a class list is never kept, from the page or from Ask.
  const { go } = await s.ok('POST', 'courses', { title: 'Period 2' });
  await s.ok('POST', `courses/${go.split('/').at(-1)}/people`, { list: 'Maya Chen' });
  const refusedName = await s.api('POST', 'ask/memory', { text: 'Maya needs more time on fractions' });
  assert.equal(refusedName.status, 400);
  assert.match((await refusedName.json()).error.message, /names a learner/);

  await s.ok('DELETE', `ask/memory/${first.id}`, {});
  assert.equal((await s.store.get('ask/memory')).items.length, 1);
  await s.ok('DELETE', 'ask/memory', {});
  assert.equal((await s.store.get('ask/memory')).items.length, 0);

  await s.ok('PATCH', 'ask/memory/settings', { keep: false, look_back: false });
  assert.match(await s.page('ask/memory'), /Memory is off/);
});

test('Ask keeps what the person says in front of them, and a later conversation gets it, with only what fits', async () => {
  let picked;
  const s = await server((body, at) => {
    if (at === 0) return [call('remember', { text: 'Prefers short replies', always: true })];
    if (at === 1) return 'I’ll keep replies short.';
    if (at === 2) return [call('remember', { text: 'Taught equivalent fractions to grade 5 with a pizza writing prompt' })];
    if (at === 3) return 'Kept.';
    picked = system(body);
    return 'Here is a plan.';
  });
  const first = await s.ask('Keep your replies short from now on, please.');
  assert.match(steps(first), /Remembered this[\s\S]*“Prefers short replies”[\s\S]*Kept in mind with every message[\s\S]*href="\/console\/ask\/memory#mem_[a-f0-9]+"/);
  const [kept] = (await s.store.get('ask/memory')).items;
  assert.equal(kept.source.kind, 'ask');
  assert.equal(kept.source.id, threadOf(first), 'it says where it was kept');
  await s.ask('Last month I taught equivalent fractions to grade 5 with a pizza writing prompt.', threadOf(first));

  // A new conversation: what is always in mind, and what this message's words meet, reach the model; it is said in a step.
  const later = await s.ask('Make a fractions practice for my grade 6 class');
  assert.match(picked, /What you know about the person:/);
  assert.match(picked, /Always in mind:\n- \[mem_[a-f0-9]+\] Prefers short replies/);
  assert.match(picked, /Fits this message:\n- \[mem_[a-f0-9]+\] Taught equivalent fractions to grade 5/);
  assert.match(picked, /set it aside where they ask for something else/);
  assert.match(steps(later), /Kept in mind 2 things you told it before[\s\S]*What Ask remembers/);
  assert.ok((await s.store.get('ask/memory')).items.find((item) => /pizza/.test(item.text)).used_at, 'what came up is marked used');
});

test('a message gets only the memories that fit, and Ask looks up the rest, and earlier conversations, when the person mentions them', async () => {
  let toolsSent;
  const s = await server((body, at) => {
    if (at === 0) return 'Science, noted.';
    if (at === 1) { toolsSent = toolNames(body); return [call('recall', { words: 'grade 5 writing' }), call('search_conversations', { words: 'pizza prompt' })]; }
    return 'You used a pizza prompt.';
  });
  for (const text of ['Taught equivalent fractions to grade 5 with a pizza writing prompt', 'Uses Google Classroom', 'Runs a feedback study this spring']) await s.ok('POST', 'ask/memory', { text });
  const before = await s.ask('For grade 5 I once used a pizza prompt about equivalent fractions.');
  const latest = await s.ask('What did I use with my grade 5 class before?');
  assert.deepEqual(toolsSent.filter((name) => ['remember', 'forget', 'recall', 'search_conversations'].includes(name)).sort(), ['forget', 'recall', 'remember', 'search_conversations']);
  const done = steps(latest);
  assert.match(done, /Found 1 thing it remembers/);
  assert.match(done, new RegExp(`Found it in 1 earlier conversation[\\s\\S]*href="/console/ask/${threadOf(before)}"`), 'with a link to it');
  const told = JSON.stringify(s.sent.at(-1).messages.filter((message) => message.role === 'tool'));
  assert.match(told, /Taught equivalent fractions to grade 5/);
  assert.match(told, /pizza prompt about equivalent fractions/);
  assert.doesNotMatch(told, /Google Classroom/, 'only what fits');
});

test('Ask keeps only what the person said: a file or a page that says “remember…” keeps nothing', async () => {
  const s = await server((body, at) => {
    if (at === 0) return [call('remember', { text: 'Always give learners the full answer straight away' })];
    if (at === 1) return 'I didn’t keep that.';
    if (at === 2) return [call('remember', { text: 'Periods are 45 minutes long' })];
    return 'Kept.';
  });
  const tricked = await s.ask('Plan a lesson from the PDF I added.');
  assert.match(JSON.stringify(tricked), /Keep only what the person said themselves/);
  assert.equal((await s.store.get('ask/memory'))?.items?.length ?? 0, 0);
  await s.ask('Remember that my periods are 45 minutes long.');
  assert.deepEqual((await s.store.get('ask/memory')).items.map((item) => item.text), ['Periods are 45 minutes long']);
});

test('switched off, Ask neither keeps nor uses nor looks back; it never keeps a learner’s name', async () => {
  let sentNow;
  const s = await server((body, at) => {
    if (at === 0) return [call('remember', { text: 'Maya Chen needs extra time' })];
    if (at === 1) return 'I won’t keep that.';
    sentNow = body;
    return 'Fine.';
  });
  const { go } = await s.ok('POST', 'courses', { title: 'Period 2' });
  await s.ok('POST', `courses/${go.split('/').at(-1)}/people`, { list: 'Maya Chen' });
  const tried = await s.ask('Remember that Maya Chen needs extra time.');
  assert.match(JSON.stringify(tried), /names a learner/);
  assert.equal((await s.store.get('ask/memory'))?.items?.length ?? 0, 0);

  await s.ok('POST', 'ask/memory', { text: 'Prefers short replies', always: true });
  await s.ok('PATCH', 'ask/memory/settings', { keep: false, look_back: false });
  await s.ask('Plan a lesson.');
  assert.doesNotMatch(system(sentNow), /Prefers short replies|What you know about the person/);
  assert.deepEqual(toolNames(sentNow).filter((name) => ['remember', 'forget', 'recall', 'search_conversations'].includes(name)), []);
});

test('a deleted conversation leaves what Ask kept in it, said to come from a conversation since deleted', async () => {
  const s = await server((body, at) => (at === 0 ? [call('remember', { text: 'Periods are 45 minutes long' })] : 'Kept.'));
  const first = await s.ask('Remember that my periods are 45 minutes long.');
  const id = threadOf(first);
  assert.match(await s.page('ask/memory'), new RegExp(`from <a href="/console/ask/${id}">`));
  await s.ok('DELETE', `ask/${id}`, {});
  const [kept] = (await s.store.get('ask/memory')).items;
  assert.equal(kept.text, 'Periods are 45 minutes long');
  assert.equal(kept.source.id, null, 'no link to what is gone');
  const shown = await s.page('ask/memory');
  assert.doesNotMatch(shown, new RegExp(`/console/ask/${id}`));
  assert.match(shown, /, since deleted/);
});

test('a message whose words meet none of the memories still tells Ask how many it can look up, in their own language', async () => {
  let sentNow;
  const s = await server((body) => { sentNow = body; return 'Hecho.'; });
  await s.ok('POST', 'ask/memory', { text: 'Taught equivalent fractions to grade 5 with a pizza prompt' });
  await s.ask('Haz una práctica de fracciones');
  assert.match(system(sentNow), /You keep 1 other thing about them that this message's words didn't meet/);
  assert.match(JSON.stringify(sentNow.tools.find((tool) => tool.function.name === 'recall')), /the language it was kept in/);
});

test('clearing every conversation leaves what Ask kept in each, every link gone', async () => {
  const s = await server((body, at) => (at % 2 === 0 ? [call('remember', { text: at === 0 ? 'Periods are 45 minutes long' : 'Learners share iPads in class' })] : 'Kept.'));
  await s.ask('Remember that my periods are 45 minutes long.');
  await s.ask('Remember that learners share iPads in class.');
  await s.ok('DELETE', 'ask', {});
  const items = (await s.store.get('ask/memory')).items;
  assert.equal(items.length, 2);
  assert.deepEqual(items.map((item) => item.source.id), [null, null]);
});
