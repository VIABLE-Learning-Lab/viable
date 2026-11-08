// Who is in a course, on a server of your own: the class list and its codes, typed names, sections, a section's own opening, and the rule that a name never reaches a model.
import test from 'node:test';
import assert from 'node:assert/strict';
import { memoryStore } from '../../harness/src/store/store.js';
import { createApp } from '../src/server/app.js';
import { listLines, showCode, readCode, cleanEntry } from '../src/server/classList.js';
import { forgetLearner, learnerRecords } from '../src/server/learner.js';

const TOKEN = 'a-token-of-some-length';
const BASE = 'http://server.test';
const headers = { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' };
const visitorId = (n) => String(n).padStart(32, 'a');
const NAME = 'Zanzibar Quillfeather';

const reply = (content = 'A reply.') => new Response(JSON.stringify({ choices: [{ message: { role: 'assistant', content }, finish_reason: 'stop' }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } }), { headers: { 'content-type': 'application/json' } });
const provider = (sent) => async (url, init) => {
  if (String(url).endsWith('/models')) return new Response(JSON.stringify({ data: [{ id: 'm' }] }), { headers: { 'content-type': 'application/json' } });
  sent.push(String(init?.body ?? ''));
  return reply();
};

async function server({ store = memoryStore(), sent = [], vars = {}, pages = {} } = {}) {
  const handler = await createApp({ bytes: null, name: 'x', vars: { VIABLE_ENGINE_TOKEN: TOKEN, VIABLE_ENGINE_SECRET: 'a-secret', OPENAI_BASE_URL: 'https://models.example/v1', OPENAI_API_KEY: 'k', ...vars }, store, fetch: provider(sent), pages, log: () => {} });
  const api = async (method, path, body) => {
    const response = await handler(new Request(`${BASE}/console/api/${path}`, { method, headers, ...(body ? { body: JSON.stringify(body) } : {}) }));
    const data = await response.clone().json().catch(() => null);
    return { status: response.status, data, response };
  };
  const ok = async (method, path, body) => { const made = await api(method, path, body); assert.ok(made.status < 400, JSON.stringify(made.data)); return made.data; };
  const page = (path) => handler(new Request(`${BASE}${path}`, { headers: { authorization: `Bearer ${TOKEN}`, accept: 'text/html' } }));
  const learnerPage = (path) => handler(new Request(`${BASE}${path}`, { headers: { accept: 'text/html' } }));
  const post = async (path, body, { address = '203.0.113.9' } = {}) => {
    const response = await handler(new Request(`${BASE}${path}`, { method: 'POST', headers: { origin: BASE, 'content-type': 'application/json' }, body: JSON.stringify(body) }), { address });
    return { status: response.status, data: await response.json().catch(() => null) };
  };
  return { handler, api, ok, page, learnerPage, post, store, sent };
}

// A course with an open activity, and how far it has got.
async function course(s, { how = null, title = 'Fractions' } = {}) {
  await s.ok('POST', 'courses', { title });
  const code = title.toLowerCase();
  await s.ok('POST', `courses/${code}/activities`, { title: 'Practice', kind: 'chat', version: 1 });
  await s.ok('POST', `courses/${code}/activities/practice/release`, { release: 'open' });
  if (how) await s.ok('PUT', `courses/${code}/people/how`, { version: 3, ...how });
  return code;
}
const onList = async (s, code) => {
  const page = await (await s.page(`/console/courses/${code}/people`)).text();
  return [...page.matchAll(/<a href="\/console\/courses\/[\w-]+\/people\/(lrn_\w+)">([^<]+)<\/a>[\s\S]*?<code class="code">([^<]+)<\/code>/g)].map((row) => ({ id: row[1], name: row[2], code: row[3] }));
};
const version = async (s, code) => Number(/name="version" value="(\d+)"/.exec(await (await s.page(`/console/courses/${code}/settings`)).text())[1]);

test('a course’s tabs come in the order of the work', async () => {
  const s = await server();
  const code = await course(s);
  const page = await (await s.page(`/console/courses/${code}/people`)).text();
  const tabs = /<nav class="tabs"[\s\S]*?<\/nav>/.exec(page)[0];
  assert.deepEqual([...tabs.matchAll(/>([A-Z][a-z]+)<\/a>/g)].map((match) => match[1]), ['Activities', 'People', 'Progress', 'Settings']);
  assert.match(tabs, /aria-current="page">People</);
});

test('reading a pasted list and a code', () => {
  assert.deepEqual(listLines('Ada Lovelace\tPeriod 2\n\n  Alan Turing , Period 3 \nBen\nLovelace, Ada\tPeriod 2').map(({ name, section }) => [name, section]), [['Ada Lovelace', 'Period 2'], ['Alan Turing', 'Period 3'], ['Ben', ''], ['Lovelace, Ada', 'Period 2']]);
  assert.equal(showCode('K7Q2M9XC'), 'K7Q2-M9XC');
  assert.equal(readCode(' k7q2-m9xc '), 'K7Q2M9XC');
  assert.equal(cleanEntry(' Ｚoë​   Smith '), 'Zoë Smith', 'another form of a name is that name');
});

test('the class list: pasted, reported, kept in the store and never in the package', async () => {
  const s = await server();
  const code = await course(s);
  const added = await s.ok('POST', `courses/${code}/people`, { list: 'Ada Lovelace, Period 2\nAlan Turing\tPeriod 3\nAda Lovelace, Period 2\nBen' });
  assert.match(added.said, /Added 3 people/);
  assert.match(added.said, /Made 2 sections: Period 2, Period 3/);
  assert.match(added.said, /Skipped 1 already on the list: Ada Lovelace/);
  const moved = await s.ok('POST', `courses/${code}/people`, { list: `Ben, Period 2\nCarla\n${'x'.repeat(130)}` });
  assert.match(moved.said, /Added 1 person/);
  assert.match(moved.said, /Moved 1 to the section given/);
  assert.match(moved.said, /Skipped 1 too long/);
  const headed = await s.ok('POST', `courses/${code}/people`, { list: 'Name\tSection\nDana Scott\tPeriod 2' });
  assert.match(headed.said, /Left out the first line/);
  assert.match(headed.said, /Added 1 person/);
  await s.ok('POST', `courses/${code}/people/${(await onList(s, code)).find((row) => row.name === 'Dana Scott').id}/remove`, {});
  const last = await s.api('POST', `courses/${code}/people`, { list: 'Lovelace, Ada\nTuring, Alan\nHopper, Grace' });
  assert.equal(last.status, 400);
  assert.match(last.data.error.message, /“Last, First”/, 'nobody gets a section of their first name');
  const list = await onList(s, code);
  assert.deepEqual(list.map((row) => row.name), ['Ada Lovelace', 'Alan Turing', 'Ben', 'Carla']);
  for (const row of list) assert.match(row.code, /^[2-9A-HJKMNP-Z]{4}-[2-9A-HJKMNP-Z]{4}$/);
  // Nothing of it travels.
  const file = await (await s.api('GET', `courses/${code}/download`)).response.text();
  for (const words of ['Ada Lovelace', 'Period 2', list[0].code.replace('-', '')]) assert.ok(!file.includes(words), `the package holds ${words}`);
  assert.equal(JSON.parse(file).course.sections_from, 'roster', 'a list that names sections says where they come from');
  // The CSV is the one file that joins names and codes, and a formula in a name stays text.
  await s.ok('POST', `courses/${code}/people`, { name: '=HYPERLINK("x")' });
  const csv = await (await s.api('GET', `courses/${code}/people.csv`)).response;
  assert.match(csv.headers.get('content-disposition'), /class-list-fractions\.csv/);
  const lines = (await csv.text()).split('\r\n');
  assert.match(lines[0], /^﻿?Name,Section,Personal code,Personal link,On the list,Last seen$/);
  assert.ok(lines.some((line) => line.startsWith('Ada Lovelace,Period 2,') && line.includes(list[0].code)));
  assert.ok(lines.some((line) => line.startsWith('"\'=HYPERLINK')));
});

test('personal codes: only a code on the list opens the course, with or without its dash, and a new code ends the old', async () => {
  const s = await server();
  const code = await course(s, { how: { identify: 'code' } });
  const empty = await (await s.page(`/console/courses/${code}/people`)).text();
  assert.match(empty, /nobody can open this course/);
  assert.match(await (await s.page(`/console/courses/${code}`)).text(), /nobody is on it yet/, 'and the tab a teacher starts from says so');
  await s.ok('POST', `courses/${code}/people`, { list: 'Ada Lovelace\nBen' });
  const [ada, ben] = await onList(s, code);
  const who = visitorId(1);
  assert.equal((await s.post(`/course/${code}/home`, { visitor: who })).data.needs, 'join');
  assert.equal((await s.post(`/course/${code}/practice/messages`, { visitor: who, message: 'hi' })).status, 403);
  const wrong = await s.post(`/course/${code}/join`, { visitor: who, code: 'NOPE-2345' });
  assert.equal(wrong.status, 404);
  assert.equal(wrong.data.error.message, 'That code isn’t on the list. Check it with whoever gave it to you.');
  assert.equal((await s.post(`/course/${code}/join`, { visitor: who, fresh: true })).status, 400, 'no starting afresh on a class list');
  const joined = await s.post(`/course/${code}/join`, { visitor: who, code: ada.code.toLowerCase() });
  assert.equal(joined.data.name, 'Ada Lovelace', 'their own browser may see their own name');
  assert.equal((await s.post(`/course/${code}/join`, { visitor: visitorId(2), code: ben.code.replace('-', '') })).data.name, 'Ben', 'without its dash too');
  const home = await s.post(`/course/${code}/home`, { visitor: who });
  assert.equal(home.data.learner.name, 'Ada Lovelace');
  assert.ok(!JSON.stringify(home.data).includes('Ben'), 'nobody else’s');
  assert.match(await (await s.page(`/console/courses/${code}/people`)).text(), /<time data-local/, 'last seen shows');
  // A new code: the old stops working, and browsers holding it are signed out.
  await s.ok('POST', `courses/${code}/people/${ada.id}/new-code`, {});
  assert.equal((await s.post(`/course/${code}/home`, { visitor: who })).data.needs, 'join');
  assert.equal((await s.post(`/course/${code}/join`, { visitor: who, code: ada.code })).status, 404);
  const [renewed] = await onList(s, code);
  assert.notEqual(renewed.code, ada.code);
  assert.equal((await s.post(`/course/${code}/join`, { visitor: who, code: renewed.code })).status, 200);
});

test('off the list: their work stays, under their code; never signed in, nothing stays; deleting takes the work', async () => {
  const s = await server();
  const code = await course(s, { how: { identify: 'code' } });
  await s.ok('POST', `courses/${code}/people`, { list: 'Ada Lovelace\nBen\nCarla' });
  const [ada, ben, carla] = await onList(s, code);
  const who = visitorId(1);
  await s.post(`/course/${code}/join`, { visitor: who, code: ada.code });
  assert.equal((await s.post(`/course/${code}/practice/messages`, { visitor: who, message: 'A message of Ada’s' })).status, 200);
  await s.ok('POST', `courses/${code}/people/${ada.id}/remove`, {});
  assert.equal((await s.post(`/course/${code}/home`, { visitor: who })).data.needs, 'join', 'signed out');
  assert.equal((await s.post(`/course/${code}/join`, { visitor: who, code: ada.code })).status, 404, 'their code no longer opens it');
  const { records } = await learnerRecords(s.store, code);
  assert.equal(records[0].turns[0].message, 'A message of Ada’s', 'their work stays');
  const grid = await (await s.page(`/console/courses/${code}/progress`)).text();
  assert.ok(grid.includes(ada.code) && !grid.includes('Ada Lovelace'), 'by their code, with no name');
  // A name again, and they are back with their work.
  await s.ok('PUT', `courses/${code}/people/${ada.id}`, { name: 'Ada Byron' });
  assert.equal((await s.post(`/course/${code}/join`, { visitor: who, code: ada.code })).data.name, 'Ada Byron');
  // Never signed in: gone altogether.
  await s.ok('POST', `courses/${code}/people/${ben.id}/remove`, {});
  assert.ok(!(await onList(s, code)).some((row) => row.id === ben.id));
  assert.equal(await s.store.get(`courses/${code}/codes/${ben.code.replace('-', '')}`), null);
  // Deleting takes everything, the name's way in too.
  await s.ok('POST', `courses/${code}/people/${ada.id}/forget`, {});
  assert.deepEqual((await learnerRecords(s.store, code)).records, []);
  const left = (await s.store.list(`courses/${code}/`)).join(' ');
  assert.ok(!left.includes(ada.id));
  assert.ok((await onList(s, code)).some((row) => row.id === carla.id), 'others stay');
});

test('a typed name: the first time or on the device already theirs; anywhere else their code', async () => {
  const s = await server();
  const code = await course(s, { how: { identify: 'ask', identify_ask: 'name', identify_match: 'any' } });
  const first = visitorId(1);
  const page = await (await s.learnerPage(`/course/${code}`)).text();
  assert.match(page, /What’s your name\?/);
  const asked = await s.post(`/course/${code}/join`, { visitor: first, entry: '  Zoë   Smith ' });
  assert.equal(asked.status, 409);
  assert.equal(asked.data.error.code, 'entry_new', 'a new one is shown back to them first');
  const joined = await s.post(`/course/${code}/join`, { visitor: first, entry: '  Zoë   Smith ', confirm_new: true });
  assert.equal(joined.data.name, 'Zoë Smith');
  assert.equal((await s.post(`/course/${code}/home`, { visitor: first })).data.learner.name, 'Zoë Smith');
  // Another browser types the same name, in any form: it takes their code.
  const other = visitorId(2);
  for (const typed of ['zoë smith', 'ZOË  SMITH', 'Zoë Smith', 'Zoë​ Smith']) {
    const refused = await s.post(`/course/${code}/join`, { visitor: other, entry: typed });
    assert.equal(refused.status, 409, typed);
    assert.equal(refused.data.error.code, 'code_required');
  }
  assert.equal((await s.post(`/course/${code}/home`, { visitor: other })).data.needs, 'join', 'they read nothing of hers');
  assert.equal((await s.post(`/course/${code}/join`, { visitor: first, entry: 'zoë smith' })).status, 200, 'the device already theirs');
  assert.equal((await s.post(`/course/${code}/join`, { visitor: other, code: joined.data.code })).data.name, 'Zoë Smith', 'and their code, anywhere');
  // A listed name opens the first time, then only for them.
  await s.ok('POST', `courses/${code}/people`, { list: 'Ada Lovelace' });
  const third = visitorId(3);
  assert.equal((await s.post(`/course/${code}/join`, { visitor: third, entry: 'ada lovelace' })).data.name, 'Ada Lovelace', 'no confirming: the list knows her');
  assert.equal((await s.post(`/course/${code}/join`, { visitor: visitorId(4), entry: 'Ada Lovelace' })).data.error.code, 'code_required');
});

test('two people with one name are never guessed, and only the list gets in when it says so', async () => {
  const s = await server();
  const code = await course(s, { how: { identify: 'ask', identify_ask: 'name', identify_match: 'roster' } });
  await s.ok('POST', `courses/${code}/people`, { name: 'Sam Lee' });
  const second = await s.ok('POST', `courses/${code}/people`, { name: 'sam lee' });
  assert.match(second.said, /need their personal codes/);
  const who = visitorId(1);
  const twin = await s.post(`/course/${code}/join`, { visitor: who, entry: 'Sam Lee' });
  assert.equal(twin.status, 409);
  assert.equal(twin.data.error.code, 'entry_ambiguous');
  const stranger = await s.post(`/course/${code}/join`, { visitor: who, entry: 'Nobody Here', confirm_new: true });
  assert.equal(stranger.status, 404);
  assert.equal(stranger.data.error.code, 'entry_not_listed');
  assert.equal((await s.post(`/course/${code}/home`, { visitor: who })).data.needs, 'join');
  const [one] = await onList(s, code);
  assert.equal((await s.post(`/course/${code}/join`, { visitor: who, code: one.code })).status, 200, 'their code tells them apart');
});

test('a student ID is typed the same way, and the page asks for it', async () => {
  const s = await server();
  const code = await course(s, { how: { identify: 'ask', identify_ask: 'student_id', identify_match: 'roster' } });
  assert.match(await (await s.learnerPage(`/course/${code}`)).text(), /Enter your student ID/);
  await s.ok('POST', `courses/${code}/people`, { list: 'S1042' });
  assert.equal((await s.post(`/course/${code}/join`, { visitor: visitorId(1), entry: 's1042' })).status, 200);
  assert.match((await s.post(`/course/${code}/join`, { visitor: visitorId(2), entry: 'S9' })).data.error.message, /That student ID isn’t on the class list/);
});

test('the server’s class code and proxy header win over the course’s setting', async () => {
  const withClass = await server({ vars: { VIABLE_ENGINE_CLASS_CODE: 'moon-42' } });
  const code = await course(withClass, { how: { identify: 'code' } });
  assert.match(await (await withClass.page(`/console/courses/${code}/people`)).text(), /started with a class code/);
  const joined = await withClass.post(`/course/${code}/join`, { visitor: visitorId(1), code: 'MOON 42' });
  assert.equal(joined.status, 200, 'not on any list, and in');
  const proxied = await server({ vars: { VIABLE_ENGINE_LEARNER_HEADER: 'x-user' } });
  const other = await course(proxied, { how: { identify: 'code' } });
  assert.match(await (await proxied.page(`/console/courses/${other}/people`)).text(), /sign in through your school/);
  const home = await proxied.handler(new Request(`${BASE}/course/${other}/home`, { method: 'POST', headers: { origin: BASE, 'content-type': 'application/json', 'x-user': 's-0412' }, body: JSON.stringify({ visitor: visitorId(1) }) }));
  assert.equal((await home.json()).course.identify, 'browser');
});

test('30 learners on one address all sign in at once, and one browser guessing is stopped', async () => {
  const s = await server();
  const code = await course(s, { how: { identify: 'code' } });
  await s.ok('POST', `courses/${code}/people`, { list: Array.from({ length: 30 }, (_, i) => `Learner ${i + 1}`).join('\n') });
  const list = await onList(s, code);
  assert.equal(list.length, 30);
  const answers = await Promise.all(list.map(async (row, i) => {
    // Some mistype theirs first, as a class does.
    if (i % 5 === 0) await s.post(`/course/${code}/join`, { visitor: visitorId(i + 1), code: 'WRONG-CODE' });
    const joined = await s.post(`/course/${code}/join`, { visitor: visitorId(i + 1), code: row.code });
    const home = await s.post(`/course/${code}/home`, { visitor: visitorId(i + 1) });
    const opened = await s.post(`/course/${code}/practice/open`, { visitor: visitorId(i + 1) });
    return [joined.status, home.status, opened.status];
  }));
  assert.ok(answers.every((statuses) => statuses.every((status) => status === 200)), JSON.stringify(answers));
  const guesser = visitorId(99);
  const tries = [];
  for (let i = 0; i < 12; i += 1) tries.push((await s.post(`/course/${code}/join`, { visitor: guesser, code: `GUESS${i}XX` })).status);
  assert.deepEqual(tries.slice(0, 10), Array(10).fill(404));
  assert.deepEqual(tries.slice(10), [429, 429], 'stopped');
  assert.equal((await s.post(`/course/${code}/join`, { visitor: visitorId(1), code: list[0].code })).status, 200, 'and it costs the class nothing');
});

test('sections: a link, a choice made once, the list’s; removing one with learners is refused', async () => {
  const s = await server();
  const code = await course(s);
  await s.ok('POST', `courses/${code}/sections`, { name: 'Period 2' });
  await s.ok('POST', `courses/${code}/sections`, { name: 'Period 3' });
  const sections = (await s.store.get(`courses/${code}/sections`)).list;
  assert.deepEqual(sections.map((section) => section.key), ['period-2', 'period-3']);
  for (const section of sections) assert.match(section.id, /^sec_[A-Za-z0-9_-]{1,64}$/);
  const file = JSON.parse(await (await s.api('GET', `courses/${code}/download`)).response.text());
  assert.equal(file.course.sections_from, 'link', 'the first section takes its link');
  assert.ok(!JSON.stringify(file).includes('Period 2'));
  // By a section's link.
  const byLink = await s.post(`/course/${code}/home?section=period-3`, { visitor: visitorId(1) });
  assert.equal(byLink.data.learner.section, 'Period 3');
  assert.equal((await s.post(`/course/${code}/home?section=period-2`, { visitor: visitorId(1) })).data.learner.section, 'Period 3', 'only a teacher changes it after that');
  assert.match(await (await s.learnerPage(`/course/${code}?section=period-3`)).text(), /"query":"\?section=period-3"/, 'the page carries it to its calls');
  // By the course's own link: asked once.
  const asked = await s.post(`/course/${code}/home`, { visitor: visitorId(2) });
  assert.equal(asked.data.needs, 'section');
  assert.deepEqual(asked.data.sections.map((item) => item.name), ['Period 2', 'Period 3']);
  assert.equal((await s.post(`/course/${code}/practice/learner`, { visitor: visitorId(2) })).data.needs, 'section', 'an activity sends them to choose');
  assert.equal((await s.post(`/course/${code}/section`, { visitor: visitorId(2), section: 'nope' })).status, 400);
  assert.equal((await s.post(`/course/${code}/section`, { visitor: visitorId(2), section: 'period-2' })).data.section, 'Period 2');
  assert.equal((await s.post(`/course/${code}/home`, { visitor: visitorId(2) })).data.needs, null);
  assert.equal((await s.post(`/course/${code}/section`, { visitor: visitorId(2), section: 'period-3' })).data.section, 'Period 2', 'chosen once');
  // Someone on the list keeps theirs, and a link changes nothing when the list decides.
  await s.ok('PUT', `courses/${code}/people/sections-from`, { version: await version(s, code), sections_from: 'roster' });
  const roster = await s.post(`/course/${code}/home?section=period-2`, { visitor: visitorId(3) });
  assert.equal(roster.data.learner.section, null);
  assert.equal(roster.data.needs, null);
  // Moving, and removing.
  const page = await (await s.page(`/console/courses/${code}/people`)).text();
  const someone = /people\/(lrn_\w+)">/.exec(page)[1];
  await s.ok('PUT', `courses/${code}/people/${someone}`, { section: sections[0].id });
  assert.equal((await s.api('PUT', `courses/${code}/people/${someone}`, { section: 'sec_nope' })).status, 404);
  const inUse = await s.api('DELETE', `courses/${code}/sections/${sections[0].id}`, {});
  assert.equal(inUse.status, 409);
  assert.match(inUse.data.error.message, /Move them first/);
  await s.ok('PUT', `courses/${code}/sections/${sections[0].id}`, { name: 'Second period', key: 'second' });
  assert.equal((await s.store.get(`courses/${code}/sections`)).list[0].key, 'second');
  assert.equal((await s.api('PUT', `courses/${code}/sections/${sections[0].id}`, { name: 'Second period', key: 'period-3' })).status, 409, 'a link key is its section’s own');
});

test('a section’s own opening: on the home, the activity’s page and every endpoint, at once and with no new version', async () => {
  const s = await server();
  const code = await course(s);
  await s.ok('POST', `courses/${code}/sections`, { name: 'Period 2' });
  await s.ok('POST', `courses/${code}/sections`, { name: 'Period 3' });
  const [two, three] = (await s.store.get(`courses/${code}/sections`)).list;
  await s.ok('POST', `courses/${code}/activities`, { title: 'Quiz', kind: 'chat', version: await version(s, code) });
  const inTwo = visitorId(2);
  const inThree = visitorId(3);
  await s.post(`/course/${code}/home?section=period-2`, { visitor: inTwo });
  await s.post(`/course/${code}/home?section=period-3`, { visitor: inThree });
  const cards = async (who) => (await s.post(`/course/${code}/home`, { visitor: who })).data.units.flatMap((unit) => unit.activities).map((card) => card.key);
  assert.deepEqual(await cards(inTwo), ['practice'], 'hidden for the course');
  assert.match(await (await s.learnerPage(`/course/${code}/quiz`)).text(), /isn’t open yet/);
  const before = await version(s, code);
  // Open early, for one section.
  await s.ok('POST', `courses/${code}/activities/quiz/for-section`, { section: two.id, release: 'open' });
  assert.equal(await version(s, code), before, 'a teacher mid-class, not a new version');
  assert.deepEqual(await cards(inTwo), ['practice', 'quiz']);
  assert.deepEqual(await cards(inThree), ['practice']);
  assert.ok((await s.learnerPage(`/course/${code}/quiz`)).status === 200 && !/isn’t open yet/.test(await (await s.learnerPage(`/course/${code}/quiz`)).text()), 'the page is served, and each endpoint decides');
  assert.equal((await s.post(`/course/${code}/quiz/open`, { visitor: inTwo })).status, 200);
  assert.equal((await s.post(`/course/${code}/quiz/messages`, { visitor: inTwo, message: 'hi' })).status, 200);
  const refused = await s.post(`/course/${code}/quiz/open`, { visitor: inThree });
  assert.equal(refused.status, 403);
  assert.equal(refused.data.error.code, 'activity_not_open');
  assert.equal((await s.post(`/course/${code}/quiz/messages`, { visitor: inThree, message: 'hi' })).status, 403);
  assert.equal((await s.post(`/course/${code}/quiz/events`, { visitor: inThree, events: [] })).status, 200, 'an activity with no panels has nothing to gate there');
  // Hidden from one section, while the course has it open.
  await s.ok('POST', `courses/${code}/activities/practice/for-section`, { section: three.id, release: 'hidden' });
  assert.deepEqual(await cards(inThree), []);
  assert.equal((await s.post(`/course/${code}/practice/messages`, { visitor: inThree, message: 'hi' })).status, 403);
  assert.equal((await s.post(`/course/${code}/practice/messages`, { visitor: inTwo, message: 'hi' })).status, 200);
  // The console says so, and back to the course's.
  const rows = await (await s.page(`/console/courses/${code}`)).text();
  assert.match(rows, /For one section: Period 2 open/);
  assert.match(rows, /Hidden from this section/);
  await s.ok('POST', `courses/${code}/activities/practice/for-section`, { section: three.id, release: null });
  assert.deepEqual(await cards(inThree), ['practice']);
  // Removing a section takes its openings.
  await s.api('POST', `courses/${code}/people/${(await s.store.get(`courses/${code}/visitors/${inTwo}`)).learner}/forget`, {});
  await s.ok('DELETE', `courses/${code}/sections/${two.id}`, {});
  assert.deepEqual((await s.store.list(`courses/${code}/release/`)), []);
});

test('a section’s help and note reach only its learners’ runs, and what the teacher wants to hear about reaches none', async () => {
  const sent = [];
  const s = await server({ sent });
  const code = await course(s);
  await s.ok('POST', `courses/${code}/sections`, { name: 'Period 2' });
  await s.ok('POST', `courses/${code}/sections`, { name: 'Period 3' });
  const [two] = (await s.store.get(`courses/${code}/sections`)).list;
  const editor = await (await s.page(`/console/courses/${code}/activities/practice`)).text();
  assert.match(editor, /Different for a section/);
  assert.match(editor, /Write about the group, not one learner: notes go to the AI model\./);
  await s.ok('PUT', `courses/${code}/activities/practice`, { version: await version(s, code), title: 'Practice', kind: 'chat', agent_ref: 'tutor', release: 'open', done_when: 'auto', teaching: { goal: 'Add fractions.', help: 'hint', watch_for: 'WATCHWORD who is stuck', sections: { [two.id]: { help: 'explain', note: 'NOTE-FOR-TWO this group reads below level.' } } } });
  assert.match(await (await s.page(`/console/courses/${code}/activities/practice`)).text(), /For Period 2/, 'the page shows what that group’s AI reads');
  await s.post(`/course/${code}/home?section=period-2`, { visitor: visitorId(2) });
  await s.post(`/course/${code}/home?section=period-3`, { visitor: visitorId(3) });
  assert.equal((await s.post(`/course/${code}/practice/messages`, { visitor: visitorId(3), message: 'one' })).status, 200);
  const three = sent.join('\n');
  assert.ok(!three.includes('NOTE-FOR-TWO'), 'no other section’s note');
  assert.ok(three.includes('Add fractions.'));
  sent.length = 0;
  assert.equal((await s.post(`/course/${code}/practice/messages`, { visitor: visitorId(2), message: 'two' })).status, 200);
  const twoSent = sent.join('\n');
  assert.ok(twoSent.includes('NOTE-FOR-TWO'), 'its own note');
  assert.ok(!twoSent.includes('WATCHWORD'), 'never sent to the AI');
  const { records } = await learnerRecords(s.store, code);
  assert.deepEqual(records.map((record) => record.learner_group).sort(), [two.id, (await s.store.get(`courses/${code}/sections`)).list[1].id].sort());
  assert.equal(records.find((record) => record.learner_group === two.id).turns[0].teaching_section, two.id);
  const look = await (await s.page(`/console/courses/${code}/progress/look`)).text();
  assert.match(look, /WATCHWORD who is stuck/, 'for the teacher, here');
  // A removed section's notes go with it.
  await s.api('POST', `courses/${code}/people/${(await s.store.get(`courses/${code}/visitors/${visitorId(2)}`)).learner}/forget`, {});
  await s.ok('DELETE', `courses/${code}/sections/${two.id}`, {});
  const file = JSON.parse(await (await s.api('GET', `courses/${code}/download`)).response.text());
  assert.ok(!JSON.stringify(file).includes('NOTE-FOR-TWO'));
});

test('a listed name reaches no model, trace, memory key, record or export', async () => {
  const sent = [];
  const store = memoryStore();
  const s = await server({ sent, store, pages: { traces: 'token' } });
  const code = await course(s, { how: { identify: 'code' } });
  await s.ok('POST', `courses/${code}/people`, { list: `${NAME}, Period 2` });
  const [row] = await onList(s, code);
  const who = visitorId(1);
  const joined = await s.post(`/course/${code}/join`, { visitor: who, code: row.code });
  assert.equal(joined.data.name, NAME);
  assert.equal((await s.post(`/course/${code}/practice/messages`, { visitor: who, message: 'What do I do first?' })).status, 200);
  assert.ok(sent.length > 0, 'the stand-in model was called');
  assert.ok(sent.every((body) => !body.includes(NAME) && !body.includes('Period 2') && !body.includes(row.code.replace('-', ''))), 'nothing sent to a model holds their name, section name or code');
  const records = await learnerRecords(store, code);
  assert.ok(!JSON.stringify(records).includes(NAME));
  assert.equal(records.records[0].user, row.code.replace('-', ''));
  const exported = await (await s.api('GET', `courses/${code}/records.json`)).response.text();
  assert.ok(!exported.includes(NAME), 'records.json stays pseudonymous');
  const teacher = await (await s.handler(new Request(`${BASE}/teacher/records.json?course=${code}`, { headers: { authorization: `Bearer ${TOKEN}` } }))).text();
  assert.ok(!teacher.includes(NAME));
  // Anywhere else it could have been kept: traces, conversations, runs, memory, and any key at all.
  for (const key of await store.list('')) {
    assert.ok(!key.includes(NAME), `a key holds the name: ${key}`);
    const held = JSON.stringify(await store.get(key));
    if (key.startsWith(`courses/${code}/learners/`)) continue;
    assert.ok(!held.includes(NAME), `${key} holds the name`);
  }
  assert.ok((await store.list('traces/')).length > 0, 'a trace was kept and read');
  // Forgetting a name's way in, too.
  await forgetLearner(store, row.code);
  assert.deepEqual(await store.list(`courses/${code}/names/`), []);
});

test('who was only trying it out appears nowhere a teacher counts', async () => {
  const s = await server();
  const code = await course(s, { how: { identify: 'code' } });
  const tried = await s.handler(new Request(`${BASE}/course/${code}/home?try=1`, { method: 'POST', headers: { ...headers, origin: BASE }, body: JSON.stringify({ visitor: visitorId(1) }) }));
  const data = await tried.json();
  assert.ok(data.learner, 'the token holder needs no code');
  assert.equal(data.needs, null);
  assert.equal((await s.store.list(`courses/${code}/learners/`)).length, 1);
  const list = await (await s.page('/console/courses')).text();
  assert.match(list, /0 learners/);
  assert.match(await (await s.page(`/console/courses/${code}/people`)).text(), /Nobody here yet/);
  assert.match(await (await s.page(`/console/courses/${code}/progress`)).text(), /Nobody here yet/);
  assert.deepEqual((await learnerRecords(s.store, code)).records, []);
});

test('progress: a grid with a section filter, one learner’s work behind the token, and a hostile name stays text', async () => {
  const s = await server();
  const code = await course(s, { how: { identify: 'code' } });
  const hostile = '<script>alert(1)</script>';
  await s.ok('POST', `courses/${code}/people`, { list: `Ada Lovelace, Period 2\n${hostile}, Period 3\nBen` });
  const list = await onList(s, code);
  const ada = list.find((row) => row.name === 'Ada Lovelace');
  await s.post(`/course/${code}/join`, { visitor: visitorId(1), code: ada.code });
  await s.post(`/course/${code}/practice/messages`, { visitor: visitorId(1), message: 'Why <b>this</b>?' });
  await s.post(`/course/${code}/practice/done`, { visitor: visitorId(1) });
  const all = await (await s.page(`/console/courses/${code}/progress`)).text();
  assert.match(all, /Ada Lovelace/);
  assert.match(all, /1 of 1 done/);
  assert.match(all, /not signed in yet/);
  assert.match(all, /<span class="sr">Practice: Done<\/span>/);
  assert.match(all, /<span class="sr">Practice: Not started<\/span>/);
  assert.ok(!all.includes(hostile) && all.includes('&lt;script&gt;'));
  assert.equal([...all.matchAll(/<script(?![^>]* nonce="[a-f0-9]+")/g)].length, 0, 'only the page’s own');
  assert.match(all, /never by name/);
  const [two] = (await s.store.get(`courses/${code}/sections`)).list;
  const one = await (await s.page(`/console/courses/${code}/progress?section=${two.id}`)).text();
  assert.ok(one.includes('Ada Lovelace') && !one.includes('Ben'));
  const none = await (await s.page(`/console/courses/${code}/progress?section=none`)).text();
  assert.ok(none.includes('Ben') && !none.includes('Ada Lovelace'));
  // One learner.
  const work = await (await s.page(`/console/courses/${code}/progress/${ada.id}`)).text();
  assert.match(work, /Why &lt;b&gt;this&lt;\/b&gt;\?/);
  assert.match(work, /A reply\./);
  assert.match(work, /Done <time/);
  const shut = await (await s.learnerPage(`/console/courses/${code}/progress/${ada.id}`)).text();
  assert.match(shut, /Enter this server’s token/, 'behind the token');
  assert.ok(!shut.includes('Why &lt;b&gt;'));
  assert.equal((await s.learnerPage(`/console/api/courses/${code}/people.csv`)).status, 401);
  assert.equal((await s.learnerPage(`/console/api/courses/${code}/records.json`)).status, 401);
  // A learner’s drafts and answers.
  await s.ok('POST', `courses/${code}/activities`, { title: 'Write', kind: 'writing', version: await version(s, code) });
  await s.ok('POST', `courses/${code}/activities/write/release`, { release: 'open' });
  await s.post(`/course/${code}/write/draft`, { visitor: visitorId(1), panel: 'writing', draft: 'My first sentence.' });
  assert.match(await (await s.page(`/console/courses/${code}/progress/${ada.id}`)).text(), /My first sentence\./);
});

test('what to look at: how replies went, hard moments, and a suggestion accepted with one button', async () => {
  const s = await server();
  const code = await course(s);
  await s.ok('PUT', `courses/${code}/activities/practice`, { version: await version(s, code), title: 'Practice', kind: 'chat', agent_ref: 'tutor', release: 'open', done_when: 'auto', teaching: { goal: 'Add fractions.', help: 'explain', watch_for: 'Tell me who is stuck' } });
  const sections = await s.ok('POST', `courses/${code}/people`, { list: 'Ada Lovelace' });
  assert.ok(sections);
  const [ada] = await onList(s, code);
  // Six replies the reviewer failed for giving the answer away, as a run keeps them.
  const id = ada.id;
  const failing = { nodeType: 'vetting', durationMs: 6000, output: { outcome: 'passed', attempt_details: [{ attempt: 1, verdict: 'fail', reply: 'The answer is 5/6.', feedback: 'FAILED: gives the answer away.' }, { attempt: 2, verdict: 'pass', reply: 'What did you try?' }] }, input: { message: 'Tell me.' } };
  for (let i = 0; i < 6; i += 1) {
    const at = new Date(Date.now() - 60000 + i * 1000).toISOString();
    await s.store.put(`courses/${code}/turns/${id}/${at}-agtr_${i}`, { run_id: `agtr_${i}`, activity: 'practice', conversation_id: 'agtc_one', turn_index: i + 1, started_at: at, message: `Tell me ${i}`, reply: 'What did you try?', rating: i === 0 ? -1 : null, flag: i === 5 ? 'struggling' : undefined, run: { run_id: `agtr_${i}`, label: `Practice, ${at}`, agent: 'Tutor', activity: 'Practice', teaching: null, output: { text: 'What did you try?' }, steps: [failing] } });
  }
  const look = await (await s.page(`/console/courses/${code}/progress/look`)).text();
  assert.match(look, /How replies went/);
  assert.match(look, /Checking took about \d+ s a reply/, 'how long learners wait, with where to change it');
  assert.match(look, /Allow fewer tries/);
  assert.match(look, /Hard moments/);
  assert.match(look, /Said a reply didn’t help/);
  assert.match(look, /the AI was asked to tell them their teacher can help/);
  assert.match(look, /Tell me who is stuck/);
  assert.match(look, /Lower how far the AI helps/);
  assert.ok(!look.includes('iframe'));
  assert.match(look, /Accept this change/);
  assert.equal((await s.api('POST', `courses/${code}/activities/practice/suggestions/accept`, { id: 'nothing_like_it', version: await version(s, code) })).status, 409);
  const before = await version(s, code);
  await s.ok('POST', `courses/${code}/activities/practice/suggestions/accept`, { id: 'answers_given_away', version: before });
  const file = JSON.parse(await (await s.api('GET', `courses/${code}/download`)).response.text());
  assert.equal(file.course.activities[0].teaching.help, 'step_up', 'a change like any other, through the course’s versions');
  assert.equal(await version(s, code), before + 1);
  const after = await (await s.page(`/console/courses/${code}/progress/look`)).text();
  assert.match(after, /Accepted/);
  assert.ok(!after.includes('Accept this change'), 'it shows as done, and what came before doesn’t count again');
  assert.match(after, /gives the answer away/, 'what happened is still there to read');
  assert.equal((await s.api('POST', `courses/${code}/activities/practice/suggestions/accept`, { id: 'answers_given_away', version: before + 1 })).status, 409);
  // What learners do after it can call for it again.
  const later = new Date(Date.now() + 60000);
  for (let i = 0; i < 6; i += 1) {
    const at = new Date(later.getTime() + i * 1000).toISOString();
    await s.store.put(`courses/${code}/turns/${id}/${at}-agtr_later${i}`, { run_id: `agtr_later${i}`, activity: 'practice', conversation_id: 'agtc_two', turn_index: i + 1, started_at: at, message: 'Tell me', reply: 'What did you try?', run: { run_id: `agtr_later${i}`, label: `Practice, ${at}`, agent: 'Tutor', activity: 'Practice', teaching: null, output: { text: 'What did you try?' }, steps: [failing] } });
  }
  const again = await (await s.page(`/console/courses/${code}/progress/look`)).text();
  assert.match(again, /Accept this change/);
});

test('a learner going round in circles shows as a hard moment, from what their own turns kept', async () => {
  const s = await server();
  const code = await course(s);
  await s.ok('PUT', `courses/${code}/activities/practice`, { version: await version(s, code), title: 'Practice', kind: 'chat', agent_ref: 'tutor', release: 'open', done_when: 'auto', teaching: { goal: 'Add fractions.', help: 'hint' } });
  await s.ok('POST', `courses/${code}/people`, { list: 'Ada Lovelace' });
  const [ada] = await onList(s, code);
  const who = visitorId(1);
  await s.post(`/course/${code}/join`, { visitor: who, code: ada.code });
  let conversation = null;
  for (const n of [1, 2, 3, 4, 5, 6]) {
    const sent = await s.post(`/course/${code}/practice/messages`, { visitor: who, message: `is it ${n}/6?`, ...(conversation ? { conversation_id: conversation } : {}) });
    assert.equal(sent.status, 200);
    conversation = sent.data.conversation_id;
  }
  const { records } = await learnerRecords(s.store, code);
  assert.ok(records[0].turns.some((turn) => turn.flag === 'struggling'), 'a turn says so');
  const look = await (await s.page(`/console/courses/${code}/progress/look`)).text();
  assert.match(look, /<a href="[^"]*progress\/lrn_\w+">Ada Lovelace<\/a>/);
  assert.match(look, /their teacher can help/);
});

test('share: a link, QR codes as inline SVG, section links and a poster; a local address says so', async () => {
  const s = await server();
  const code = await course(s);
  await s.ok('POST', `courses/${code}/sections`, { name: 'Period 2' });
  const page = await (await s.page(`/console/courses/${code}/share`)).text();
  assert.match(page, /http:\/\/server\.test\/course\/fractions/);
  assert.match(page, /<svg class="qr"[^>]*role="img"/);
  assert.match(page, /\?section=period-2/);
  assert.match(page, /share\/poster\?section=period-2/);
  assert.ok(!/only opens on this computer/.test(page));
  assert.match(await (await s.page(`/console/courses/${code}/share/poster?section=period-2`)).text(), /data-print/);
  const head = await (await s.page(`/console/courses/${code}`)).text();
  assert.match(head, /courses\/fractions\/share/);
  await s.ok('POST', `courses/${code}/people`, { list: 'Ada Lovelace' });
  const cards = await (await s.page(`/console/courses/${code}/people/cards`)).text();
  assert.match(cards, /data-print/);
  assert.match(cards, /@media print/);
  assert.match(cards, /Ada Lovelace/);
  assert.match(cards, /<code|card-code/);
  assert.match(cards, /<svg class="qr"/);
  // On this computer's own address.
  const local = (path) => s.handler(new Request(`http://127.0.0.1:8080${path}`, { headers: { authorization: `Bearer ${TOKEN}`, accept: 'text/html' } }));
  const here = await (await local(`/console/courses/${code}/share`)).text();
  assert.match(here, /only opens on this computer/);
  assert.match(await (await local(`/console/courses/${code}`)).text(), /only opens on this computer/);
});

test('a class on this network gets the address it can reach, when the page’s own only opens here', async () => {
  const { serve } = await import('../src/serve.js');
  const started = await serve([], { port: 0, store: memoryStore(), token: TOKEN, secret: 'a-secret', log: () => {}, consoleOptions: { addresses: ['http://192.168.1.20:8080'] }, baseUrl: 'https://models.example/v1', apiKey: 'k', fetch: async () => reply() });
  try {
    const call = (path, init = {}) => globalThis.fetch(`${started.url}${path}`, { ...init, headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json', accept: 'text/html', ...init.headers } });
    assert.equal((await call('/console/api/courses', { method: 'POST', body: JSON.stringify({ title: 'Fractions' }) })).status, 200);
    const page = await (await call('/console/courses/fractions/share')).text();
    assert.match(page, /192\.168\.1\.20:8080\/course\/fractions/);
    assert.match(page, /only opens on this computer/);
    assert.ok(page.includes('aria-label="QR code for http://192.168.1.20:8080/course/fractions"'));
  } finally { started.server.close(); }
});

test('a course from a file the server was given keeps its address and learners when its People change', async () => {
  const doc = { format: 'viable.course-package', version: 1, title: 'Given', agents: [{ ref: 'tutor', name: 'Tutor', graph: { version: 1, name: 'Tutor', entry: 'input', variables: {}, nodes: [{ id: 'input', type: 'input', config: {}, next: 'reply' }, { id: 'reply', type: 'llm', config: { model: 'm', system: 'Help.' }, next: 'output' }, { id: 'output', type: 'output', config: { text: '{{reply.content}}' } }] } }], course: { title: 'Given', identify: 'code', sections_from: 'none', data_level: 'minimal', units: [], activities: [{ title: 'First', role: 'instruction', agent_ref: 'tutor', release: 'open', done_when: 'auto' }] } };
  const store = memoryStore();
  const handler = await createApp({ bytes: new TextEncoder().encode(JSON.stringify(doc)), name: 'given.json', vars: { VIABLE_ENGINE_TOKEN: TOKEN, VIABLE_ENGINE_SECRET: 'a-secret', OPENAI_BASE_URL: 'https://models.example/v1', OPENAI_API_KEY: 'k' }, store, fetch: provider([]), log: () => {} });
  const api = (method, path, body) => handler(new Request(`${BASE}/console/api/${path}`, { method, headers, body: JSON.stringify(body) }));
  const post = (path, body) => handler(new Request(`${BASE}${path}`, { method: 'POST', headers: { origin: BASE, 'content-type': 'application/json' }, body: JSON.stringify(body) }));
  assert.equal((await (await post('/course/given/home', { visitor: visitorId(1) })).json()).needs, 'join', 'its package says codes, and it has no list yet');
  assert.equal((await api('POST', 'courses/given/people', { list: 'Ada Lovelace, Period 2' })).status, 200);
  assert.equal((await api('POST', 'courses/given/activities/first/for-section', { section: (await store.get('courses/given/sections')).list[0].id, release: 'hidden' })).status, 200, 'an activity keeps its address before it is ever saved');
  await store.delete((await store.list('courses/given/release/'))[0]);
  const held = await store.get((await store.list('courses/given/learners/'))[0]);
  assert.equal((await post('/course/given/join', { visitor: visitorId(1), code: held.code })).status, 200);
  // Its first change, the list naming a section, made the copy that takes the file's place: the same address, with the same people.
  assert.equal((await api('PUT', 'courses/given/people/how', { version: 1, identify: 'ask', identify_ask: 'name', identify_match: 'roster' })).status, 200);
  const home = await (await post('/course/given/home', { visitor: visitorId(1) })).json();
  assert.equal(home.learner.name, 'Ada Lovelace');
  assert.equal(home.course.identify, 'ask');
});

test('with no store the tabs say so and take nothing, and learners are as the package says', async () => {
  const doc = { format: 'viable.course-package', version: 1, title: 'Bare', agents: [{ ref: 'tutor', name: 'Tutor', graph: { version: 1, name: 'Tutor', entry: 'input', variables: {}, nodes: [{ id: 'input', type: 'input', config: {}, next: 'output' }, { id: 'output', type: 'output', config: { text: 'x' } }] } }], course: { title: 'Bare', identify: 'browser', sections_from: 'none', data_level: 'minimal', units: [], activities: [] } };
  const handler = await createApp({ bytes: new TextEncoder().encode(JSON.stringify(doc)), name: 'bare.json', vars: { VIABLE_ENGINE_TOKEN: TOKEN }, store: null, log: () => {} });
  const page = (path) => handler(new Request(`${BASE}${path}`, { headers: { authorization: `Bearer ${TOKEN}`, accept: 'text/html' } }));
  const people = await (await page('/console/courses/bare/people')).text();
  assert.match(people, /no store, so it can’t keep a class list/);
  assert.ok(!people.includes('id="paste"'));
  assert.match(await (await page('/console/courses/bare/progress')).text(), /keeps nothing to show here/);
  assert.equal((await page('/console/courses/bare/progress/look')).status, 200);
  assert.equal((await handler(new Request(`${BASE}/console/api/courses/bare/people`, { method: 'POST', headers, body: JSON.stringify({ list: 'Ada' }) }))).status, 409);
  assert.equal((await handler(new Request(`${BASE}/console/api/courses/bare/sections`, { method: 'POST', headers, body: JSON.stringify({ name: 'One' }) }))).status, 409);
  // A package that says codes opens for each browser here: nothing could ever be on its list.
  const codes = await createApp({ bytes: new TextEncoder().encode(JSON.stringify({ ...doc, course: { ...doc.course, identify: 'code' } })), name: 'bare.json', vars: { VIABLE_ENGINE_TOKEN: TOKEN }, store: null, log: () => {} });
  const home = await codes(new Request(`${BASE}/course/bare/home`, { method: 'POST', headers: { origin: BASE, 'content-type': 'application/json' }, body: JSON.stringify({ visitor: visitorId(1) }) }));
  assert.ok((await home.json()).learner);
});

test('an activity that has closed can be opened again for one section', async () => {
  const s = await server();
  const code = await course(s);
  await s.ok('POST', `courses/${code}/sections`, { name: 'Period 2' });
  const [two] = (await s.store.get(`courses/${code}/sections`)).list;
  const inTwo = visitorId(2);
  await s.post(`/course/${code}/home?section=period-2`, { visitor: inTwo });
  const past = new Date(Date.now() - 60000).toISOString();
  await s.ok('PUT', `courses/${code}/activities/practice`, { version: await version(s, code), title: 'Practice', kind: 'chat', agent_ref: 'tutor', teaching: {}, release: 'open', closes_at: past, done_when: 'auto' });
  assert.equal((await s.post(`/course/${code}/practice/open`, { visitor: inTwo })).data.error.code, 'activity_closed');
  assert.match(await (await s.page(`/console/courses/${code}`)).text(), /As the course: Closed/);
  await s.ok('POST', `courses/${code}/activities/practice/for-section`, { section: two.id, release: 'open' });
  assert.equal((await s.post(`/course/${code}/practice/open`, { visitor: inTwo })).status, 200);
});

test('an activity removed takes its section openings, so a new one with its title doesn’t inherit them', async () => {
  const s = await server();
  const code = await course(s);
  await s.ok('POST', `courses/${code}/sections`, { name: 'Period 2' });
  const [two] = (await s.store.get(`courses/${code}/sections`)).list;
  await s.ok('POST', `courses/${code}/activities`, { title: 'Quiz', kind: 'chat', version: await version(s, code) });
  await s.ok('POST', `courses/${code}/activities/quiz/for-section`, { section: two.id, release: 'open' });
  await s.ok('DELETE', `courses/${code}/activities/quiz`, {});
  assert.deepEqual(await s.store.list(`courses/${code}/release/`), []);
});
