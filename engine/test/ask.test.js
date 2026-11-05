// Ask: what a teacher says becomes a course through the console's own routes, step by step; what reaches learners waits for a click
// the model can't make; and names never reach the model. A scripted model: no network.
import '../../harness/test/no-network.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { memoryStore } from '../../harness/src/store/store.js';
import { looksLikeClassList, settled } from '../src/console/ask.js';
import { createApp } from '../src/server/app.js';

const TOKEN = 'a-token-of-some-length';
const BASE = 'http://server.test';
const headers = { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' };
const call = (name, args, id = `call_${Math.random().toString(36).slice(2)}`) => ({ id, type: 'function', function: { name, arguments: JSON.stringify(args) } });

// The model, as a script of what it answers in turn: each a list of tool calls, or words. It keeps all it was sent.
function scripted(script) {
  const sent = [];
  let at = 0;
  const fetch = async (url, init = {}) => {
    if (String(url).endsWith('/models')) return new Response(JSON.stringify({ data: [{ id: 'reply-model' }] }), { headers: { 'content-type': 'application/json' } });
    const body = JSON.parse(init.body);
    sent.push(body);
    const next = typeof script === 'function' ? script(body, at) : script[at];
    at += 1;
    if (next === undefined) return new Response(JSON.stringify({ choices: [{ message: { role: 'assistant', content: 'That’s all.' }, finish_reason: 'stop' }] }), { headers: { 'content-type': 'application/json' } });
    if (next instanceof Response) return next;
    const message = Array.isArray(next) ? { role: 'assistant', content: null, tool_calls: next } : { role: 'assistant', content: next };
    return new Response(JSON.stringify({ choices: [{ message, finish_reason: 'stop' }], usage: { total_tokens: 7 } }), { headers: { 'content-type': 'application/json' } });
  };
  return { fetch, sent };
}

async function server(script, { model = true } = {}) {
  const store = memoryStore();
  const provider = scripted(script);
  const handler = await createApp({ bytes: null, name: 'x', vars: { VIABLE_ENGINE_TOKEN: TOKEN, VIABLE_ENGINE_SECRET: 'a-secret' }, store, fetch: provider.fetch, pages: { fetch: provider.fetch } });
  const api = (method, path, body) => handler(new Request(`${BASE}/console/api/${path}`, { method, headers, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) }));
  const ok = async (method, path, body) => { const response = await api(method, path, body); const data = await response.json(); assert.ok(response.ok, `${path}: ${JSON.stringify(data)}`); return data; };
  const page = async (path) => { const response = await handler(new Request(`${BASE}/console/${path}`, { headers: { authorization: `Bearer ${TOKEN}`, accept: 'text/html' } })); assert.equal(response.status, 200, path); return response.text(); };
  if (model) await ok('POST', 'providers', { name: 'A provider', base_url: 'http://model.test/v1', key: 'a-key' }).then(({ id }) => ok('PUT', 'roles/reply', { provider: id, model: 'reply-model' }));
  // One message, read to its end: the events, in order.
  const ask = async (message, thread) => {
    const response = await api('POST', 'ask', { message, ...(thread ? { thread } : {}) });
    assert.equal(response.status, 200, await response.clone().text());
    const text = await response.text();
    return text.split('\n\n').filter(Boolean).map((frame) => ({ name: /^event: (.+)$/m.exec(frame)?.[1], data: JSON.parse(/^data: (.+)$/m.exec(frame)?.[1] || 'null') }));
  };
  return { handler, api, ok, page, ask, store, sent: provider.sent };
}
const threadOf = (events) => events.find((event) => event.name === 'thread').data.id;
const allText = (events) => JSON.stringify(events);

const SETUP = [
  [call('create_course', { title: 'Fractions, period 2', audience: 'children', units: ['Week 1', 'Week 2'] })],
  (course) => [call('add_activity', { course, title: 'Practice: adding fractions', kind: 'questions', unit: 'Week 1', minutes: 20, goal: 'Add fractions with unlike denominators.', help: 'hint', questions: [
    { type: 'single', prompt: 'What is 1/2 + 1/3?', choices: ['2/5', '5/6'], right: ['5/6'], hints: ['What do the pieces need in common?'] },
    { type: 'fill', prompt: 'What is 1/4 + 1/4?', accept: ['1/2', '2/4'] }
  ] })],
  'I set up the course and one activity, hidden for now. I assumed grade 5.'
];
// What the model said next can use what came back: it reads the course's address from the tool's answer.
const following = (steps) => (body, at) => {
  const step = steps[at];
  if (typeof step !== 'function') return step;
  const answers = body.messages.filter((message) => message.role === 'tool').map((message) => JSON.parse(message.content));
  return step(answers.map((answer) => answer.course).filter(Boolean).at(-1));
};

test('a teacher’s words become a course, by the same routes a page uses, each step said as it happens', async () => {
  const s = await server(following(SETUP));
  const events = await s.ask('Fractions for my grade 5 class, period 2. They keep adding the denominators.');
  const steps = events.filter((event) => event.name === 'step');
  assert.deepEqual(steps.filter((step) => step.data.state === 'running').map((step) => step.data.label), ['Making the course “Fractions, period 2”', 'Adding “Practice: adding fractions”']);
  assert.ok(steps.filter((step) => step.data.state === 'done').every((step) => /ask-step/.test(step.data.html)));
  assert.equal(events.at(-1).name, 'done');
  assert.ok(events.some((event) => event.name === 'said' && /I set up the course/.test(event.data.html)));
  assert.ok(events.some((event) => event.name === 'card' && /Practice: adding fractions/.test(event.data.html) && /Hidden/.test(event.data.html) && /Try it as a learner/.test(event.data.html)), 'it ends with what was made, to use');

  const { course } = await s.ok('GET', 'courses/fractions-period-2/download');
  assert.equal(course.audience, 'children');
  assert.deepEqual(course.units.map((unit) => unit.title), ['Week 1', 'Week 2']);
  const made = course.activities[0];
  assert.equal(made.release, 'hidden', 'nothing reaches learners from a draft');
  assert.equal(made.teaching.help, 'hint');
  assert.equal(made.unit_ref, course.units[0].ref);
  assert.equal(made.minutes, 20);
  const { question_sets: sets } = await s.ok('GET', 'courses/fractions-period-2/download');
  const first = sets[0].items[0];
  assert.equal(first.choices.find((choice) => choice.id === first.answer.choice).text, '5/6', 'the key stays right however the choices are mixed');

  // The conversation comes back as a page, with its steps folded and its details a click away.
  const shown = await s.page(`ask/${threadOf(events)}`);
  assert.match(shown, /They keep adding the denominators/);
  assert.match(shown, /2 steps/);
  assert.match(shown, /add_activity/, 'what it did is there for whoever looks');
  assert.match(shown, /2 questions:/);
  assert.match(await s.page('ask'), /What are you teaching\?/);
  assert.match(await s.page('ask'), /Fractions for my grade 5 class/, 'earlier conversations are on the front door');
});

test('questions it writes are checked as a page’s are: a wrong answer key doesn’t become a question', async () => {
  const s = await server(following([
    [call('create_course', { title: 'Bad keys' })],
    (course) => [call('add_activity', { course, title: 'Check', kind: 'questions', questions: [{ type: 'single', prompt: 'Which?', choices: ['a', 'b'], right: ['c'] }] })],
    'I couldn’t add it.'
  ]));
  const events = await s.ask('A check');
  const failed = events.find((event) => event.name === 'step' && event.data.state === 'failed');
  assert.match(failed.data.label, /needs its right answer/);
  assert.match(failed.data.html, /<details open/, 'an error opens by itself');
  const told = s.sent.at(-1).messages.filter((message) => message.role === 'tool').map((message) => message.content).join();
  assert.match(told, /needs its right answer/, 'the model hears why, and can put it right');
});

test('what reaches learners waits for a person: the model can only propose it, and its own word changes nothing', async () => {
  const s = await server(following([
    ...SETUP.slice(0, 2),
    (course) => [call('open_activity', { course, activity: 'practice-adding-fractions' })],
    'It’s open now! https://made.up/link'
  ]));
  const events = await s.ask('Set it up and open it');
  const card = events.filter((event) => event.name === 'card').map((event) => event.data.html).find((html) => /Open “Practice/.test(html));
  assert.ok(card, 'a card asks');
  assert.match(card, /For everyone in the course/);
  assert.match(card, /gives hints only/);
  let { course } = await s.ok('GET', 'courses/fractions-period-2/download');
  assert.equal(course.activities[0].release, 'hidden', 'proposing changes nothing, whatever the model then says');
  assert.equal(s.sent.length, 3, 'a proposal ends the turn, so the model can’t go on to say it happened');
  assert.doesNotMatch(allText(events), /It’s open now|made\.up/);
  assert.ok(events.some((event) => event.name === 'said' && /Nothing changes for learners until you do/.test(event.data.html)));

  const thread = threadOf(events);
  const api = /data-api="POST (ask\/thr_[a-f0-9]+\/pending\/pnd_[a-f0-9]+)"/.exec(card)[1];
  await s.ok('POST', api, { yes: false });
  ({ course } = await s.ok('GET', 'courses/fractions-period-2/download'));
  assert.equal(course.activities[0].release, 'hidden', 'Not yet leaves it');
  assert.match(await s.page(`ask/${thread}`), /You said not yet/);
  assert.match((await s.ok('POST', api, { yes: true })).said, /already settled/, 'a card answers once');
  ({ course } = await s.ok('GET', 'courses/fractions-period-2/download'));
  assert.equal(course.activities[0].release, 'hidden');
});

test('a person’s click opens it, and the next turn’s model knows', async () => {
  const s = await server(following([
    ...SETUP.slice(0, 2),
    (course) => [call('open_activity', { course, activity: 'practice-adding-fractions' })],
    'Good, it’s open.'
  ]));
  const events = await s.ask('Set it up and open it');
  const card = events.filter((event) => event.name === 'card').map((event) => event.data.html).find((html) => /Open “Practice/.test(html));
  await s.ok('POST', /data-api="POST (ask\/thr_[a-f0-9]+\/pending\/pnd_[a-f0-9]+)"/.exec(card)[1], { yes: true });
  const { course } = await s.ok('GET', 'courses/fractions-period-2/download');
  assert.equal(course.activities[0].release, 'open');
  const thread = threadOf(events);
  const after = await s.page(`ask/${thread}`);
  assert.match(after, /You pressed Open/);
  assert.match(after, /Give your class/, 'pressing Open hands over the links');
  assert.doesNotMatch(after, /Nothing is open yet/);
  await s.ask('Thanks. What next?', thread);
  assert.match(JSON.stringify(s.sent.at(-1).messages), /The teacher pressed the button: open/);
});

test('a pasted class list never reaches the model or a thread, and goes in the list from a card', async () => {
  const s = await server(following(SETUP));
  await s.ask('Fractions for period 2');
  const count = s.sent.length;
  const list = 'Zora Neale\nToni Morrison\nMaya Angelou\nJames Baldwin';
  assert.ok(looksLikeClassList(list));
  const events = await s.ask(list);
  assert.equal(s.sent.length, count, 'no model was called');
  const card = events.find((event) => event.name === 'card')?.data.html;
  assert.match(card, /Zora Neale/, 'it is on the card, in the box, for them to add');
  assert.match(card, /The AI doesn’t read it/);
  const thread = await s.store.get(`ask/threads/${threadOf(events)}`);
  assert.doesNotMatch(JSON.stringify(thread), /Neale/, 'never kept in a thread');
  assert.doesNotMatch((await s.page(`ask/${threadOf(events)}`)), /Neale/);
  // The card's form posts straight to the class list; the names go nowhere near a model.
  await s.ok('POST', /data-api="POST (courses\/[\w-]+\/people)"/.exec(card)[1], { list });
  assert.equal(s.sent.length, count);
  // And nothing the model gets afterwards has them.
  await s.ask('How is the class doing?', threadOf(events));
  assert.doesNotMatch(JSON.stringify(s.sent), /Neale|Morrison|Baldwin/);
});

test('what it reads of a class is counts: names and work stay on the page', async () => {
  const s = await server(following([
    ...SETUP.slice(0, 2),
    (course) => [call('read_progress', { course }), call('read_course', { course })],
    'Nobody has started yet.'
  ]));
  await s.ok('POST', 'courses', { title: 'Other' });
  const created = await s.ask('Set up fractions and tell me how they’re doing');
  await s.ok('POST', 'courses/fractions-period-2/people', { name: 'Ada Lovelace' });
  assert.ok(created);
  const again = await server(following([
    [call('read_progress', { course: 'named' })],
    'One learner.'
  ]));
  await again.ok('POST', 'courses', { title: 'Named' });
  await again.ok('POST', 'courses/named/people', { name: 'Ada Lovelace' });
  const events = await again.ask('How are they doing?');
  assert.doesNotMatch(JSON.stringify(again.sent), /Lovelace/);
  const told = JSON.parse(again.sent.at(-1).messages.at(-1).content);
  assert.equal(told.learners, 1);
  assert.ok(events.some((event) => event.name === 'card' && /See each learner/.test(event.data.html)));
});

test('text from a model is text: a page can’t be written into, and a link stays only if the teacher gave it', async () => {
  const s = await server(['<script>alert(1)</script> **bold** [theirs](https://example.org/x) [made up](https://viable.math/x) see https://viable.math/y [bad](javascript:alert(1)) <img src=x onerror=alert(1)>']);
  const events = await s.ask('Use this page: https://example.org/x');
  const html = events.find((event) => event.name === 'said').data.html;
  assert.doesNotMatch(html, /<script|<img/);
  assert.match(html, /<strong>bold<\/strong>/);
  assert.match(html, /<a href="https:\/\/example.org\/x">theirs<\/a>/);
  assert.doesNotMatch(html, /viable\.math/);
  assert.match(html, /the link on the card/);
  assert.doesNotMatch(html, /href="javascript/);
});

test('a course or activity name written by someone else stays text on a card', async () => {
  const s = await server(following([[call('read_progress', { course: 'x-img-src-x-onerror-alert-1' })], 'Done.']));
  await s.ok('POST', 'courses', { title: 'x<img src=x onerror=alert(1)>' });
  const events = await s.ask('How is it going?');
  const card = events.find((event) => event.name === 'card')?.data.html || '';
  assert.doesNotMatch(card, /<img/);
});

test('with no model it says so and sends nothing, a model’s failure is said, and what was made stays', async () => {
  const none = await server([], { model: false });
  assert.match(await none.page('ask'), /Ask needs a model/);
  assert.equal((await none.api('POST', 'ask', { message: 'hi' })).status, 409);
  const redirect = await none.handler(new Request(`${BASE}/console`, { headers: { authorization: `Bearer ${TOKEN}`, accept: 'text/html' } }));
  assert.match(redirect.headers.get('location'), /\/console\/courses$/, 'until a model is set, the front door is the courses page');

  const s = await server(following([SETUP[0], new Response(JSON.stringify({ error: { message: 'Overloaded' } }), { status: 503 })]));
  const events = await s.ask('Fractions');
  assert.ok(events.some((event) => event.name === 'said' && event.data.failed));
  assert.equal(events.at(-1).name, 'done');
  await s.ok('GET', 'courses/fractions-period-2/download');
  const thread = await s.store.get(`ask/threads/${threadOf(events)}`);
  assert.equal(thread.running_at, null, 'a failure doesn’t hold the conversation');
});

test('a long run stops at its limit, an unknown tool is refused, a stop is heard, and a second message waits its turn', async () => {
  const loop = await server(() => [call('list_courses', {})]);
  const events = await loop.ask('Keep going');
  assert.ok(events.some((event) => event.name === 'said' && /more steps than I can take/.test(event.data.html)));
  assert.ok(loop.sent.length <= 14);

  const unknown = await server([[call('delete_everything', {})], 'I can’t do that.']);
  await unknown.ask('Delete everything');
  assert.match(unknown.sent.at(-1).messages.at(-1).content, /no such thing to do/);

  const s = await server(['Hello.']);
  const first = await s.ask('Hi');
  const thread = threadOf(first);
  const held = await s.store.get(`ask/threads/${thread}`);
  await s.store.put(`ask/threads/${thread}`, { ...held, running_at: new Date().toISOString() });
  assert.equal((await s.api('POST', 'ask', { message: 'Again', thread })).status, 409);
  await s.store.put(`ask/threads/${thread}`, { ...held, running_at: new Date(Date.now() - 600000).toISOString() });
  assert.equal((await s.api('POST', 'ask', { message: 'Again', thread })).status, 200, 'one that never finished doesn’t hold it for ever');

  await s.ok('POST', `ask/${thread}/stop`, {});
  assert.equal((await s.store.get(`ask/threads/${thread}`)).stop, true);
});

test('Ask can’t be reached without signing in, or from another site', async () => {
  const s = await server(['Hello.']);
  const anon = await s.handler(new Request(`${BASE}/console/api/ask`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ message: 'hi' }) }));
  assert.equal(anon.status, 401);
  const away = await s.handler(new Request(`${BASE}/console/api/ask`, { method: 'POST', headers: { ...headers, origin: 'https://evil.example', 'sec-fetch-site': 'cross-site' }, body: JSON.stringify({ message: 'hi' }) }));
  assert.equal(away.status, 403);
  assert.equal(s.sent.length, 0);
});

test('a list reads as a list in any form, and a note that reads like one goes through on a click', async () => {
  for (const list of [
    'ada lovelace\ngrace hopper\nkatherine johnson',
    '1. Ada Lovelace\n2. Grace Hopper\n3. Katherine Johnson',
    'Ada Lovelace 12345678\nGrace Hopper 12345679',
    'ada@school.org\ngrace@school.org',
    'Ada Lovelace <ada@school.org>\nGrace Hopper <grace@school.org>',
    '李雷\n韩梅梅\n王芳',
    'José García\nZoë Müller\nNguyễn Văn An',
    'Ada Lovelace\nGrace Hopper'
  ]) assert.equal(looksLikeClassList(list), true, list);
  for (const note of ['Fractions for grade 5', 'Grade 5\nFractions\nPlease add a quiz', 'A unit on photosynthesis.\nTwo activities, please.\nThey read at grade 7.', 'Hello']) assert.equal(looksLikeClassList(note), false, note);

  const { api, sent } = await server(['Fine.']);
  const held = await (await api('POST', 'ask', { message: 'Ada Lovelace\nGrace Hopper\nKatherine Johnson' })).text();
  assert.match(held, /data-send-anyway/);
  assert.equal(sent.length, 0);
  await (await api('POST', 'ask', { message: 'Ratios\nDecimals\nPercents', not_a_list: true })).text();
  assert.equal(sent.length, 1, 'said by a person, it goes');
});

test('a conversation cut off mid-step still reads as one', () => {
  const messages = [{ role: 'user', content: 'x' }, { role: 'assistant', content: null, tool_calls: [{ id: 'a' }, { id: 'b' }] }, { role: 'tool', tool_call_id: 'a', content: '{}' }];
  const fixed = settled(messages);
  assert.equal(fixed.length, 4);
  assert.equal(fixed.find((item) => item.tool_call_id === 'b').role, 'tool');
  assert.deepEqual(settled(fixed), fixed);
});

test('what would reach learners at once is refused: sections on a course in use, teaching or questions on what is open', async () => {
  const queue = [];
  const { ask, ok, page, sent } = await server(() => queue.shift());
  // What the model is told after each step it asked for.
  const say = async (...calls) => {
    queue.push(calls, 'Done.');
    sent.length = 0;
    await ask('go');
    return sent[1].messages.filter((message) => message.role === 'tool').at(-1).content;
  };
  const made = JSON.parse(await say(call('create_course', { title: 'Fractions', audience: 'children' })));
  assert.match(made.note, /nobody can open this until the teacher adds a class list/, 'children sign in with codes, and the model is told what that needs');
  const code = made.course;
  assert.match(await page(`courses/${code}/people`), /Personal codes on cards/);
  await say(call('add_activity', { course: code, title: 'Practice', kind: 'questions', questions: [{ type: 'single', prompt: 'What is 1/2 + 1/3?', choices: ['2/5', '5/6'], right: ['5/6'] }] }));

  // Before it opens, each of these goes through.
  const version = async () => /name="version" value="([^"]+)"/.exec(await page(`courses/${code}`))[1];
  assert.doesNotMatch(await say(call('set_how_ai_helps', { course: code, activity: 'practice', goal: 'Add fractions.' })), /is open/);

  await ok('POST', `courses/${code}/activities/practice/release`, { version: await version(), release: 'open' });
  assert.match(await say(call('add_questions', { course: code, activity: 'practice', questions: [{ type: 'fill', prompt: 'Next?', accept: ['1'] }] })), /is open and uses these questions/);
  assert.match(await say(call('set_how_ai_helps', { course: code, activity: 'practice', goal: 'Another goal.' })), /is open, so learners would get this/);
  assert.match(await say(call('add_sections', { course: code, names: ['Period 2'] })), /first section would stop each of them/);
});

test('one round of a model’s steps has a limit, and the ones past it are told to wait', async () => {
  const many = Array.from({ length: 12 }, (_, index) => call('list_courses', {}, `call_${index}`));
  const { ask, sent } = await server([many, 'Done.']);
  await ask('Look around');
  const tools = sent[1].messages.filter((message) => message.role === 'tool');
  assert.equal(tools.length, 12, 'each is answered, or the conversation is broken');
  assert.equal(tools.filter((message) => /At most 8 at a time/.test(message.content)).length, 4);
});

test('reading as a class list: lists are, sentences aren’t', () => {
  for (const list of ['Ada Lovelace\nGrace Hopper\nAlan Turing', 'Lovelace, Ada\nHopper, Grace\nTuring, Alan', 'Ada Lovelace\tPeriod 1\nGrace Hopper\tPeriod 2\nAlan Turing\tPeriod 1', '王小明\n李华\n张伟']) assert.ok(looksLikeClassList(list), list);
  for (const words of ['Fractions for grade 5', 'A course on fractions.\nThey keep adding denominators.\nMake it short.', 'Week 1\nWeek 2', 'Make three activities:\n- Practice\n- Check\n- Reflect']) assert.ok(!looksLikeClassList(words), words);
});
