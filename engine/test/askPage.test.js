// Ask's page around a message (console ask.js): when each was said, copy and code, helpful or not with a note, the latest message
// again or changed with its earlier answers kept to look at, and no browser tooltips. A scripted model: no network.
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
  const frames = async (response) => (await response.text()).split('\n\n').filter(Boolean).map((frame) => ({ name: /^event: (.+)$/m.exec(frame)?.[1], data: JSON.parse(/^data: (.+)$/m.exec(frame)?.[1] || 'null') }));
  const ask = async (message, thread) => frames(await api('POST', 'ask', { message, ...(thread ? { thread } : {}) }));
  await ok('POST', 'providers', { name: 'A provider', base_url: 'http://model.test/v1', key: 'a-key' }).then(({ id }) => ok('PUT', 'roles/reply', { provider: id, model: 'reply-model' }));
  return { api, ok, page, ask, frames, sent, store };
}
const threadOf = (events) => events.find((event) => event.name === 'thread').data.id;
const saidOf = (events) => events.filter((event) => event.name === 'said').at(-1).data;

test('a message and its reply say when they were said; a reply has an id for feedback, and code keeps its lines', async () => {
  const s = await server(['A start:\n\n```\n2/4 = 4/8\n```\n\nMore?']);
  const events = await s.ask('Plan fractions for grade 5');
  const thread = threadOf(events);
  const reply = saidOf(events);
  assert.match(reply.id, /^say_[a-f0-9]{24}$/);
  assert.ok(Date.parse(reply.at));
  assert.match(events.find((event) => event.name === 'thread').data.you, /^you_[a-f0-9]{24}$/, 'the page learns which message is its own');
  const shown = await s.page(`ask/${thread}`);
  assert.match(shown, /<div class="ask-you-all" data-you="you_[a-f0-9]{24}" data-at="[^"]+">/);
  assert.match(shown, new RegExp(`data-said="${reply.id}" data-at="`));
  assert.match(shown, /<div class="ask-code"><pre><code>2\/4 = 4\/8<\/code><\/pre><\/div>/);
  assert.doesNotMatch(shown, / title="/, 'no browser tooltips: the console has its own');
  assert.match(shown, /data-tip="Rename"/);
});

test('helpful or not is kept with the reply, a note with not helpful, and taken back by pressing again', async () => {
  const s = await server(['Here is a plan.']);
  const events = await s.ask('Plan fractions');
  const thread = threadOf(events);
  const { id } = saidOf(events);
  assert.deepEqual(await s.ok('POST', `ask/${thread}/feedback/${id}`, { rating: 'down' }), { rating: 'down', note: null });
  assert.deepEqual(await s.ok('POST', `ask/${thread}/feedback/${id}`, { rating: 'down', note: 'It should have asked how long the lesson is.' }), { rating: 'down', note: 'It should have asked how long the lesson is.' });
  const held = (await s.store.get(`ask/threads/${thread}`)).shown.find((item) => item.id === id);
  assert.equal(held.rating, 'down');
  assert.equal(held.note, 'It should have asked how long the lesson is.');
  assert.match(await s.page(`ask/${thread}`), new RegExp(`data-said="${id}"[^>]*data-rating="down"`));
  assert.deepEqual(await s.ok('POST', `ask/${thread}/feedback/${id}`, { rating: null }), { rating: null, note: null });
  assert.equal((await s.store.get(`ask/threads/${thread}`)).shown.find((item) => item.id === id).rating, undefined);
  assert.equal((await s.api('POST', `ask/${thread}/feedback/say_${'0'.repeat(24)}`, { rating: 'up' })).status, 404);
});

test('the latest message again, as it was or changed: the earlier answer stays as a version, and the model never hears it', async () => {
  const s = await server((body, at) => `Draft ${at + 1}.`);
  const first = await s.ask('Plan fractions for grade 5');
  const thread = threadOf(first);
  const again = await s.frames(await s.api('POST', `ask/${thread}/again`, {}));
  assert.equal(saidOf(again).html, '<p>Draft 2.</p>');
  assert.doesNotMatch(JSON.stringify(s.sent.at(-1).messages), /Draft 1/, 'the answer it replaced isn’t in what the model hears');
  assert.equal(s.sent.at(-1).messages.filter((message) => message.role === 'user').length, 1, 'the message once');
  assert.ok(s.sent.at(-1).messages.every((message) => !('turn' in message)), 'the page’s own marks never reach the model');

  const changed = await s.frames(await s.api('POST', `ask/${thread}/again`, { text: 'Plan fractions for grade 6, 45 minutes' }));
  assert.equal(saidOf(changed).html, '<p>Draft 3.</p>');
  assert.equal(s.sent.at(-1).messages.at(-1).content, 'Plan fractions for grade 6, 45 minutes');
  const shown = await s.page(`ask/${thread}`);
  assert.match(shown, /data-versions="2"/);
  assert.match(shown, /Plan fractions for grade 6, 45 minutes/);
  const earlier = await s.ok('GET', `ask/${thread}/versions/1`);
  assert.equal(earlier.text, 'Plan fractions for grade 5');
  assert.match(earlier.html, /Draft 1\./);
  assert.match((await s.ok('GET', `ask/${thread}/versions/2`)).html, /Draft 2\./);
  assert.equal((await s.api('GET', `ask/${thread}/versions/3`)).status, 404);

  // Once the conversation goes on, the earlier answers are history: only the latest message has versions.
  await s.ask('Now make it shorter', thread);
  assert.doesNotMatch(await s.page(`ask/${thread}`), /data-versions=/);
});

test('trying again undoes what the answer changed before it asks again', async () => {
  const s = await server((body, at) => (at === 0 ? [call('create_course', { title: 'Fractions, grade 5' })] : at === 1 ? 'Made it.' : 'Made nothing this time.'));
  const first = await s.ask('Make a fractions course');
  const thread = threadOf(first);
  const listed = async () => { const shown = await s.page('courses'); const cut = shown.indexOf('id="archived"'); return cut < 0 ? shown : shown.slice(0, cut); };
  assert.match(await listed(), /Fractions, grade 5/);
  await s.frames(await s.api('POST', `ask/${thread}/again`, {}));
  assert.doesNotMatch(await listed(), /Fractions, grade 5/, 'the course it made is put back as before the answer: under Archived, on a server of one’s own');
  const earlier = await s.ok('GET', `ask/${thread}/versions/1`);
  assert.match(earlier.html, /What this answer changed was undone when you asked again/);
});

test('a conversation that isn’t remembered uses and keeps nothing of memory, isn’t in Earlier, and isn’t searched', async () => {
  let sentNow;
  const s = await server((body) => { sentNow = body; return 'Here is a plan.'; });
  await s.ok('POST', 'ask/memory', { text: 'Prefers short replies', always: true });
  await s.ask('Plan fractions with a pizza prompt');
  assert.match(sentNow.messages[0].content, /Prefers short replies/, 'a remembered conversation uses memory');
  const unseen = await s.frames(await s.api('POST', 'ask', { message: 'Plan a lab safety check with goggles', temporary: true }));
  const id = threadOf(unseen);
  assert.doesNotMatch(sentNow.messages[0].content, /Prefers short replies|What you know about this person/);
  assert.deepEqual((sentNow.tools || []).map((tool) => tool.function.name).filter((name) => ['remember', 'forget', 'recall', 'search_conversations'].includes(name)), []);
  assert.equal((await s.store.get(`ask/threads/${id}`)).temporary, true);
  const home = await s.page('ask');
  assert.doesNotMatch(home, new RegExp(`/console/ask/${id}`), 'not in Earlier');
  assert.match(home, /id="ask-unseen"[^>]*aria-pressed="false"/, 'a new conversation can be one that isn’t remembered');
  assert.match(await s.page(`ask/${id}`), /<p class="ask-unseen-note" id="ask-unseen-note">/, 'its page says so');
  // Looking back from a remembered conversation never finds it.
  const s2 = await server((body, at) => (at === 0 ? 'ok' : at === 1 ? 'ok' : at === 2 ? [call('search_conversations', { words: 'goggles' })] : 'Found nothing.'));
  await s2.api('POST', 'ask', { message: 'Plan a lab safety check with goggles', temporary: true }).then((response) => response.text());
  await s2.ask('Something else about fractions');
  const looked = await s2.ask('What did I do with goggles?');
  assert.match(JSON.stringify(looked), /Found nothing in earlier conversations|found nothing/i);
});

test('what was made before includes archived courses, and looking back that finds nothing offers the latest conversations', async () => {
  const s = await server((body, at) => (at === 0 ? 'Here is a plan.' : at === 1 ? [call('list_courses', {}), call('search_conversations', { words: 'volcano eruption' })] : 'Done.'));
  const { go } = await s.ok('POST', 'courses', { title: 'Old fractions' });
  const code = go.split('/').at(-1);
  await s.ok('POST', `courses/${code}/archive`, {});
  const first = await s.ask('Plan fractions with a pizza');
  const looked = await s.ask('What did I make before?');
  const told = s.sent.at(-1).messages.filter((message) => message.role === 'tool').map((message) => message.content).join('\n');
  assert.match(told, /Old fractions[^}]*"archived":true/, 'an archived course is what they made too');
  assert.match(told, /Nothing had those words/);
  assert.match(told, /"latest":\[\{"title":"Plan fractions with a pizza"/);
  const steps = JSON.stringify(looked);
  assert.match(steps, /Found nothing with those words/);
  assert.match(steps, new RegExp(`/console/ask/${threadOf(first)}`), 'a link to each of the latest');
});

test('before learners come, a checklist card says what would stop the course working, each with where to fix it', async () => {
  const s = await server((body, at) => (at === 0 ? [call('check_course', { course: 'fractions' })] : 'One thing to look at.'));
  await s.ok('POST', 'courses', { title: 'Fractions' });
  const events = await s.ask('Is my fractions course ready?');
  const card = events.filter((event) => event.name === 'card').map((event) => event.data.html).join('');
  assert.match(card, /Before learners come: \d+ things? to look at/);
  assert.match(card, /<li class="is-todo">[\s\S]*?No activities yet<\/span><a class="v-btn is-small" href="\/console\/courses\/fractions#add-title">Add one<\/a>/);
  assert.match(card, /<li class="is-ok">[\s\S]*?A model writes the AI’s replies/);
  assert.match(card, /Nothing is open to learners yet/);
  const told = s.sent.at(-1).messages.filter((message) => message.role === 'tool').map((message) => message.content).join('');
  assert.match(told, /Say only the one that matters most/);
});

test('a question with its likely answers is a card of buttons, and once answered they are history', async () => {
  const s = await server((body, at) => (at === 0 ? [call('offer_choices', { question: 'Which grade?', choices: ['Grade 4', 'Grade 5', 'Grade 6'] })] : at === 1 ? '' : 'Grade 5 it is.'));
  const first = await s.ask('Make a fractions practice');
  const thread = threadOf(first);
  const live = first.filter((event) => event.name === 'card').map((event) => event.data.html).join('');
  assert.match(live, /<h3>Which grade\?<\/h3>[\s\S]*data-say-this="Grade 5"/);
  assert.match(await s.page(`ask/${thread}`), /data-say-this="Grade 4"/, 'still the latest: still buttons');
  await s.ask('Grade 5', thread);
  const after = await s.page(`ask/${thread}`);
  assert.doesNotMatch(after, /data-say-this=/, 'answered: the choices are history');
  assert.match(after, /Grade 4 · Grade 5 · Grade 6/);
});
