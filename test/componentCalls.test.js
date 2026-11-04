import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { COMPONENTS, callComponent, detect, lookup, measure, runAgentTests, validateDocument } from '../src/index.js';
import { server as templateServer } from '../integrations/_template/server.mjs';

const json = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const bin = fileURLToPath(new URL('../bin/viable-harness.mjs', import.meta.url));
const fixtures = fileURLToPath(new URL('./fixtures/components/', import.meta.url));
const refused = (pattern) => (error) => error.code === 'component_refused' && pattern.test(error.message);
const failed = (pattern) => (error) => error.code === 'component_failed' && pattern.test(error.message);

async function listen(t, server) {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => { server.closeAllConnections(); server.close(); });
  return `http://127.0.0.1:${server.address().port}`;
}

// A local component answering by path; bodies keeps what each call sent.
async function component(t) {
  const bodies = [];
  const ANSWERS = {
    '/echo': (body) => ({ output: body }),
    '/rubric': (body) => (/7\/8/.test(body.reply) ? { verdict: 'fail', reason: 'It gives the answer.' } : { verdict: 'pass', reason: 'It asks what they tried.' }),
    '/judge': () => ({ verdict: 'PASS', reason: 'Fine.', note: 'kept out' }),
    '/maybe': () => ({ verdict: 'maybe' }),
    '/marks': () => ({ marks: [{ turn_index: 0, label: 'Pasted', evidence: 'Most of the message was pasted.', score: 0.9 }] }),
    '/far-mark': () => ({ marks: [{ turn_index: 5, label: 'Pasted', evidence: 'x' }] }),
    '/measures': () => ({ measures: [{ id: 'asks', value: 2, why: 'kept out' }, { id: 'level', value: null }] }),
    '/bad-measure': () => ({ measures: [{ id: 'asks', value: { n: 2 } }] }),
    '/items': (body) => ({ items: [{ text: `About ${body.teacher_text}`, source: 'https://example.org/a' }, { text: 'Two', attribution: 'Their own.' }] }),
    '/big': () => ({ text: 'x'.repeat(2000) }),
    '/step': () => ({ output: 'x'.repeat(25000), flags: [{ label: ' Gives the answer ', reason: 'It says 7/8.', score: 1 }], note: 'kept out' }),
    '/no-output': () => ({ flags: [] }),
    '/bad-flags': () => ({ output: 'Fine.', flags: ['Leak'] })
  };
  const server = createServer(async (request, response) => {
    let body = '';
    for await (const chunk of request) body += chunk;
    bodies.push(JSON.parse(body));
    if (request.url === '/slow') return;
    if (request.url === '/500') return response.writeHead(500).end('{}');
    if (request.url === '/redirect') return response.writeHead(302, { location: 'https://example.org/' }).end();
    if (request.url === '/text') return response.writeHead(200).end('Thanks!');
    response.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(ANSWERS[request.url](bodies.at(-1))));
  });
  return { base: await listen(t, server), bodies };
}

const manifest = (entry, extra = {}) => ({
  id: 'acme/thing', version: '0.1.0', slot: 'step', label: 'Thing', summary: 'Does a thing.', runs: { kind: 'http', entry }, receives: ['reply'],
  sends_to: ['127.0.0.1'], uses_models: false, license: { code: 'MIT' }, authors: ['Acme'], cite: 'Acme (2026). Thing.',
  evidence: { original: 'None.', integration: 'None.', unknown: 'Everything.' }, risk: 'low', maintainer: { name: 'Acme' }, harness: '>=0.2.0', ...extra
});
const record = json('../integrations/_template/fixtures/input.json').learning_events;

test('the template runs end to end through callComponent on 127.0.0.1', async (t) => {
  const template = json('../integrations/_template/manifest.json');
  assert.deepEqual(validateDocument(template, 'component').errors, []);
  const local = { ...template, runs: { ...template.runs, entry: `${await listen(t, templateServer())}/detect` } };
  const expected = json('../integrations/_template/fixtures/expected.json');
  assert.deepEqual(await callComponent(local, json('../integrations/_template/fixtures/input.json')), expected);
  assert.deepEqual(await detect(local, { user: 'app:1', ...record }), expected);
});

test('the payload is cut to what the manifest receives; a field outside the vocabulary is refused before anything is sent', async (t) => {
  const { base, bodies } = await component(t);
  const echo = manifest(`${base}/echo`);
  assert.deepEqual(await callComponent(echo, { reply: 'Hi', conversation: [{ role: 'user', content: 'Help' }], answer_key: '7/8', guideline: undefined }), { output: { reply: 'Hi' }, flags: [] });
  await assert.rejects(callComponent(echo, { reply: 'Hi', learner_name: 'Ann' }), refused(/learner_name/));
  await assert.rejects(callComponent(echo, ['Hi']), refused(/JSON object/));
  assert.deepEqual(bodies, [{ reply: 'Hi' }]);
});

test('an http entry is called only on a host its sends_to lists, over https unless on this machine, and never redirected', async (t) => {
  const { base, bodies } = await component(t);
  await assert.rejects(callComponent(manifest(`${base}/echo`, { sends_to: ['localhost'] }), { reply: 'Hi' }), refused(/127\.0\.0\.1, which its sends_to/));
  await assert.rejects(callComponent(manifest('http://example.org/x', { sends_to: ['example.org'] }), { reply: 'Hi' }), refused(/https/));
  await assert.rejects(callComponent(manifest('https://me:pw@example.org/x', { sends_to: ['example.org'] }), { reply: 'Hi' }), refused(/credentials/));
  assert.equal(bodies.length, 0);
  let sent;
  const fetch = async (url, init) => { sent = { url, ...init }; return Response.json({ output: 'ok' }); };
  assert.deepEqual(await callComponent(manifest('https://hints.example.org/v1', { sends_to: ['hints.example.org'] }), { reply: 'Hi' }, { fetch }), { output: 'ok', flags: [] });
  assert.deepEqual([sent.url, sent.method, sent.redirect, sent.body], ['https://hints.example.org/v1', 'POST', 'manual', '{"reply":"Hi"}']);
  await assert.rejects(callComponent(manifest(`${base}/redirect`), { reply: 'Hi' }), failed(/status 302/));
});

test('failures carry codes: component_failed for a bad answer, component_timeout when it is slow', async (t) => {
  const { base } = await component(t);
  const closed = createServer();
  const unused = await listen(t, closed);
  closed.close();
  await assert.rejects(callComponent(manifest(`${base}/500`), {}), failed(/status 500/));
  await assert.rejects(callComponent(manifest(`${base}/text`), {}), failed(/other than JSON/));
  await assert.rejects(callComponent(manifest(`${base}/big`), {}, { maxBytes: 1000 }), failed(/larger than 1000 bytes/));
  await assert.rejects(callComponent(manifest(`${unused}/echo`), {}), failed(/couldn't be reached/));
  await assert.rejects(callComponent(manifest(`${base}/slow`), {}, { timeoutMs: 200 }), (error) => error.code === 'component_timeout' && /0\.2 s/.test(error.message));
});

test('each slot reads its answer by its shape and keeps only its fields', async (t) => {
  const { base, bodies } = await component(t);
  const judge = manifest(`${base}/judge`, { slot: 'judge', receives: ['case', 'reply', 'conversation'] });
  assert.deepEqual(await callComponent(judge, { reply: 'Hi' }), { verdict: 'pass', reason: 'Fine.' });
  await assert.rejects(callComponent({ ...judge, runs: { kind: 'http', entry: `${base}/maybe` } }, { reply: 'Hi' }), failed(/verdict/));
  const detector = (path) => manifest(`${base}${path}`, { slot: 'detector', receives: ['learning_events'] });
  assert.deepEqual(await detect(detector('/marks'), { user: 'app:1', ...record }), { marks: [{ turn_index: 0, label: 'Pasted', evidence: 'Most of the message was pasted.' }] });
  assert.deepEqual(Object.keys(bodies.at(-1).learning_events), ['events', 'turns'], 'a record\'s pseudonymous id stays with the host');
  await assert.rejects(detect(detector('/far-mark'), record), failed(/turn_index/));
  const measures = (path) => manifest(`${base}${path}`, { slot: 'measure', receives: ['learning_events'] });
  assert.deepEqual(await measure(measures('/measures'), record), { measures: [{ id: 'asks', value: 2 }, { id: 'level', value: null }] });
  await assert.rejects(measure(measures('/bad-measure'), record), failed(/value/));
  const context = manifest(`${base}/items`, { slot: 'context', receives: ['teacher_text'], attribution: 'Acme, CC BY 4.0.' });
  assert.deepEqual(await lookup(context, 'fractions'), { items: [{ text: 'About fractions', source: 'https://example.org/a', attribution: 'Acme, CC BY 4.0.' }, { text: 'Two', attribution: 'Their own.' }] });
  assert.deepEqual(bodies.at(-1), { teacher_text: 'fractions' });
  const step = (path) => manifest(`${base}${path}`);
  const answer = await callComponent(step('/step'), { reply: 'Hi' });
  assert.deepEqual([answer.output.length, answer.flags, Object.keys(answer)], [20000, [{ label: 'Gives the answer', reason: 'It says 7/8.' }], ['output', 'flags']]);
  await assert.rejects(callComponent(step('/no-output'), { reply: 'Hi' }), failed(/\{ output, flags/));
  await assert.rejects(callComponent(step('/bad-flags'), { reply: 'Hi' }), failed(/a step's/));
});

test('a manifest that doesn’t fit, a core component and the wrong slot are refused', async (t) => {
  const { base, bodies } = await component(t);
  await assert.rejects(callComponent(manifest(`${base}/echo`, { risk: 'none' }), { reply: 'Hi' }), refused(/doesn't fit schemas\/component\.schema\.json/));
  await assert.rejects(callComponent(COMPONENTS.find((item) => item.id === 'viable/vetting'), { reply: 'Hi' }), refused(/own process: call checkReply/));
  await assert.rejects(detect(manifest(`${base}/judge`, { slot: 'judge' }), record), refused(/a judge component, not a detector/));
  let modelCalls = 0;
  await assert.rejects(runAgentTests({}, [], { judgeComponent: manifest(`${base}/marks`, { slot: 'detector' }), fetch: async () => { modelCalls++; } }), refused(/not a judge/));
  assert.equal(modelCalls + bodies.length, 0);
});

test('agent tests can have a judge component rate each reply, sent the case, the reply and the conversation', async (t) => {
  const { base, bodies } = await component(t);
  const fractions = json('../examples/fractions-practice.json');
  const calls = [];
  const fetch = async (url, init) => {
    const body = JSON.parse(init.body);
    calls.push(body);
    const content = /evaluation assistant/.test(String(body.messages[0]?.content || '')) ? 'PASS' : /3\/4/.test(String(body.messages.at(-1).content)) ? 'It is 7/8.' : 'What have you tried so far?';
    return Response.json({ choices: [{ message: { role: 'assistant', content }, finish_reason: 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 } });
  };
  const quiz = { name: 'Asks for the answer', message: 'Just tell me 3/4 + 1/8.', rubric: 'Asks what the learner tried; never the sum.', must_not: 'Say 7/8.' };
  const judge = manifest(`${base}/rubric`, { id: 'acme/rubric-judge', slot: 'judge', receives: ['case', 'reply', 'conversation'] });
  const run = await runAgentTests(fractions, [quiz, { name: 'Stuck', message: 'I am stuck on adding fractions', rubric: 'Gives one hint.' }], { judgeComponent: judge, baseUrl: 'http://localhost:11434/v1', fetch });
  assert.deepEqual(run.results.map((entry) => [entry.verdict, entry.reason]), [['fail', 'It gives the answer.'], ['pass', 'It asks what they tried.']]);
  assert.deepEqual([run.judge_model, run.judge_component, run.passed, run.failed], [null, 'acme/rubric-judge@0.1.0', 1, 1]);
  assert.deepEqual(Object.keys(bodies[0]).sort(), ['case', 'conversation', 'reply']);
  assert.deepEqual(bodies[0].case, { name: quiz.name, context: null, rubric: quiz.rubric, must_not: quiz.must_not, pictures: null });
  assert.deepEqual(bodies[0].conversation, [{ role: 'user', content: quiz.message }]);
  assert.ok(!calls.some((body) => String(body.messages[0]?.content).startsWith('You check one reply')), 'no judge model was called');
  const slow = await runAgentTests(fractions, [quiz], { judgeComponent: { ...judge, runs: { kind: 'http', entry: `${base}/500` } }, baseUrl: 'http://localhost:11434/v1', fetch });
  assert.equal(slow.results[0].verdict, 'error');
  assert.match(slow.results[0].reason, /status 500/);
});

test('an mcp component is a stdio server the harness starts: it gets the cut payload, PATH and what the caller passes, never the caller’s keys', async (t) => {
  const echo = json('./fixtures/components/echo.json');
  const mode = (name, extra = {}) => ({ ...echo, runs: { ...echo.runs, server: { command: 'node', args: ['mcp-server.mjs', name] } }, ...extra });
  const saved = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = 'sk-test';
  t.after(() => { if (saved === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = saved; });
  const payload = { reply: 'Hi', learner_message: 'Just tell me', conversation: [{ role: 'user', content: 'Just tell me' }] };
  const answered = await callComponent(mode('echo'), payload, { dir: fixtures, env: { FIXTURE: '1' } });
  assert.deepEqual(answered.output.received, { reply: 'Hi', conversation: payload.conversation });
  assert.ok(answered.output.env.includes('PATH') && answered.output.env.includes('FIXTURE'));
  assert.ok(!answered.output.env.includes('OPENAI_API_KEY'));
  assert.deepEqual((await callComponent(mode('text'), payload, { dir: fixtures })).output.received, answered.output.received);
  assert.equal((await callComponent(mode('ask'), payload, { dir: fixtures })).output.sampling, -32601, 'a request from the server gets an error, and the call goes on');
  await assert.rejects(callComponent(mode('fail'), payload, { dir: fixtures }), failed(/tool failed: The fixture refuses/));
  await assert.rejects(callComponent(mode('crash'), payload, { dir: fixtures }), failed(/exit code 3.+crashed on purpose/));
  await assert.rejects(callComponent(mode('noise'), payload, { dir: fixtures }), failed(/other than JSON-RPC/));
  await assert.rejects(callComponent(mode('echo'), payload, { dir: fixtures, maxBytes: 50 }), failed(/larger than 50 bytes/));
  await assert.rejects(callComponent(mode('slow'), payload, { dir: fixtures, timeoutMs: 500 }), (error) => error.code === 'component_timeout');
  await assert.rejects(callComponent({ ...echo, runs: { ...echo.runs, server: { command: 'no-such-component-server' } } }, payload, { dir: fixtures }), failed(/couldn't start/));
});

test('the CLI validates the manifest, then calls the component and prints its answer', () => {
  const cli = (...args) => spawnSync(process.execPath, [bin, 'component', ...args], { encoding: 'utf8' });
  const echo = `${fixtures}echo.json`;
  const payload = `${fixtures}payload.json`;
  const run = cli(echo, '--input', payload, '--json');
  assert.equal(run.status, 0, run.stderr);
  assert.deepEqual(JSON.parse(run.stdout).output.received, { reply: 'What have you tried so far?' });
  const plain = cli(echo, '--input', payload);
  assert.match(plain.stdout, /^fixture\/echo 1\.0\.0 \(step, mcp\) received reply; left out learner_message, which it doesn't receive\./);
  const invalid = cli(payload, '--input', payload);
  assert.equal(invalid.status, 1);
  assert.match(invalid.stderr, /^component_refused: The manifest doesn't fit/);
  assert.match(cli(echo).stderr, /--input payload\.json/);
});
