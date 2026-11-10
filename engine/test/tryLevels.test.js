// Try it on the Engine: what the AI did beside the page, and another help level for that try alone, as on the teacher's door.
// The activity keeps its own level, and a learner's page never has either.
import test from 'node:test';
import assert from 'node:assert/strict';
import { memoryStore } from '../../harness/src/store/store.js';
import { HELP_LEVELS, teachingAtLevel } from '../../harness/src/utils/teaching.js';
import { createApp } from '../src/server/app.js';

const TOKEN = 'a-token-of-some-length';
const BASE = 'http://server.test';
const TEACHER = { authorization: `Bearer ${TOKEN}` };
const VISITOR = 'e'.repeat(32);

async function course() {
  const sent = [];
  const handler = await createApp({ bytes: null, name: 'x', vars: { VIABLE_ENGINE_TOKEN: TOKEN, OPENAI_API_KEY: 'a-key' }, store: memoryStore(), log: () => {}, fetch: async (_url, init) => {
    sent.push(JSON.parse(init.body).messages.map((message) => message.content).join('\n'));
    return new Response(JSON.stringify({ id: 'x', choices: [{ message: { role: 'assistant', content: 'What have you tried?' } }], usage: { prompt_tokens: 1, completion_tokens: 1 } }), { headers: { 'content-type': 'application/json' } });
  } });
  const call = async (method, path, body) => {
    const response = await handler(new Request(`${BASE}/console/api/${path}`, { method, headers: { ...TEACHER, 'content-type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) }));
    const data = await response.json();
    assert.ok(response.ok, JSON.stringify(data));
    return data;
  };
  await call('POST', 'courses', { title: 'Levels' });
  await call('POST', 'courses/levels/activities', { title: 'Talk', kind: 'chat', version: 1 });
  await call('PUT', 'courses/levels/activities/talk', { version: 2, title: 'Talk', kind: 'chat', agent_ref: 'tutor', teaching: { goal: 'Add fractions.', help: 'hint' }, release: 'open', done_when: 'auto' });
  const open = (query, headers = TEACHER) => handler(new Request(`${BASE}/course/levels/talk${query}`, { headers: { ...headers, accept: 'text/html' } }));
  const page = (query, headers) => open(query, headers).then((response) => response.text());
  const post = (path, body, headers = TEACHER) => handler(new Request(`${BASE}/course/levels${path}`, { method: 'POST', headers: { ...headers, origin: BASE, 'content-type': 'application/json' }, body: JSON.stringify(body) }));
  const own = async () => JSON.parse(await (await handler(new Request(`${BASE}/console/api/courses/levels/download`, { headers: TEACHER }))).text()).course.activities[0].teaching.help;
  return { sent, open, page, post, own };
}

test('Try it has what the AI did beside it, with the activity’s own level chosen', async () => {
  const { open, page } = await course();
  const response = await open('?try=1');
  const html = await response.text();
  assert.match(html, /id="ai-watch"/);
  assert.match(html, /"control":\{"param":"help","own":"hint","tried":null\}/);
  assert.match(response.headers.get('content-security-policy'), /font-src data:/, 'its type comes with it, where no route serves it');
  assert.match(response.headers.get('content-security-policy'), /frame-ancestors 'self'/);
  assert.doesNotMatch(await page('', {}), /ai-watch/, 'a learner’s page never has it');
  assert.doesNotMatch(await page('?try=1&help=explain', {}), /ai-watch|help=explain/, 'nor one that asks for a try without the token');
});

test('another level is for that try’s own turns: the page reopens with it, and the activity keeps its own', async () => {
  const { sent, page, post, own } = await course();
  const html = await page('?try=1&help=explain');
  assert.match(html, /"control":\{"param":"help","own":"hint","tried":"explain"\}/);
  assert.match(html, /"query":"\?try=1&help=explain"/, 'what the page calls carries the level');
  assert.ok((await post('/home?try=1&help=explain', { visitor: VISITOR })).ok);
  const tried = await post('/talk/messages?try=1&help=explain', { visitor: VISITOR, message: 'I am stuck.', stream: true });
  const frames = await tried.text();
  assert.match(frames, /event: run\.trace/, 'the panel hears the turn');
  assert.match(frames, /"help":"explain"/, 'and the level it ran at');
  assert.ok(sent.at(-1).includes(HELP_LEVELS.explain), 'the AI was told the level tried');
  assert.ok(!sent.at(-1).includes(HELP_LEVELS.hint));
  assert.equal(await own(), 'hint', 'nothing was saved to the activity');

  assert.ok((await post('/home', { visitor: 'f'.repeat(32) }, {})).ok);
  assert.ok((await post('/talk/messages?help=explain', { visitor: 'f'.repeat(32), message: 'I am stuck.' }, {})).ok);
  assert.ok(sent.at(-1).includes(HELP_LEVELS.hint), 'a learner gets the activity’s own level, whatever the address says');
  assert.ok(!sent.at(-1).includes(HELP_LEVELS.explain));

  assert.match(await page('?try=1&help=everything'), /"tried":null/, 'only a level');
  assert.match(await page('?try=1&help=hint'), /"query":"\?try=1"/, 'the activity’s own level is no other level');
});

test('a level tried is the section’s too, and anything else leaves the settings as they are', () => {
  const teaching = { goal: 'Add fractions.', help: 'hint', sections: { sec_a: { help: 'check_only' }, sec_b: { note: 'Second period.' } } };
  const tried = teachingAtLevel(teaching, 'explain');
  assert.equal(tried.help, 'explain');
  assert.equal(tried.sections.sec_a.help, 'explain', 'a section’s own level would win again where it is read');
  assert.equal(tried.sections.sec_b.help, null, 'a section with no level of its own keeps none');
  assert.equal(tried.goal, 'Add fractions.');
  assert.equal(teachingAtLevel(teaching, 'everything'), teaching);
  assert.equal(teachingAtLevel(null, 'explain').help, 'explain', 'an activity with nothing set can try one');
  assert.equal(teaching.help, 'hint', 'and what it was given is unchanged');
});
