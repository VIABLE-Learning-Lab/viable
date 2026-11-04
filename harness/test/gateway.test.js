// The gateway: an app changes one URL and gets the teacher's settings, a check and a record.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_FALLBACK, gatewayHandler, readRecords, recordedActivities, suggestChanges, teacherView } from '../../engine/src/index.js';
import { fileStore } from '../src/store/fileStore.js';
import { listen } from '../src/net/node.js';
import { memoryStore } from '../src/store/store.js';

const SRC = fileURLToPath(new URL('../src/', import.meta.url));
const CLI = fileURLToPath(new URL('../../engine/bin/viable-engine.mjs', import.meta.url));
const completion = (content, message = {}) => ({ id: 'chatcmpl-1', object: 'chat.completion', created: 1, model: 'tutor', choices: [{ index: 0, message: { role: 'assistant', content, ...message }, finish_reason: message.tool_calls ? 'tool_calls' : 'stop', logprobs: { content: ['secret'] } }], usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 } });
const TOOL_CALLS = [{ id: 'call_1', type: 'function', function: { name: 'lookup', arguments: '{"term":"fractions"}' } }];
const SETTINGS = { goal: 'Students add fractions with unlike denominators.', help: 'hint', watch_for: 'adds the denominators' };

// A scripted endpoint: each call takes the next answer (the last repeats). An Error is a network failure.
function endpoint(...answers) {
  const calls = [];
  const fetch = async (url, init = {}) => {
    calls.push({ url, method: init.method, headers: init.headers, body: init.body ? JSON.parse(init.body) : null });
    const next = answers.length > 1 ? answers.shift() : answers[0];
    if (next instanceof Error) throw next;
    if (typeof next === 'function') return next();
    return new Response(JSON.stringify(typeof next === 'string' ? completion(next) : next), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  return { fetch, calls };
}
const gateway = (fetch, options = {}) => gatewayHandler({ upstream: 'https://models.example/v1', apiKey: 'sk-gateway', fetch, ...options });
const post = (body, headers = {}, path = '/v1/chat/completions', host = 'http://localhost:8090') => new Request(`${host}${path}`, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
const asked = (extra = {}) => ({ model: 'tutor', messages: [{ role: 'system', content: 'You are a friendly tutor.' }, { role: 'user', content: 'What is 1/2 + 1/3?' }], ...extra });
const events = (text) => text.split('\n\n').filter(Boolean).map((block) => block.replace(/^data: /, ''));
const chunks = (text) => events(text).filter((item) => item !== '[DONE]').map((item) => JSON.parse(item));
const said = (parsed) => parsed.flatMap((chunk) => chunk.choices).map((choice) => choice.delta?.content ?? '').join('');

test('How the AI helps joins the app’s own instructions, and what the teacher wants to hear about stays out', async () => {
  const { fetch, calls } = endpoint('Try a common denominator.');
  const handle = gateway(fetch, { teaching: SETTINGS });
  const answer = await handle(post(asked()));
  assert.equal(answer.status, 200);
  const [system] = calls[0].body.messages;
  assert.match(system.content, /^You are a friendly tutor\.\n\nFrom the teacher of this activity:/);
  assert.match(system.content, /unlike denominators/);
  assert.match(system.content, /Give hints/);
  assert.ok(!JSON.stringify(calls).includes('adds the denominators'));
  assert.equal(calls[0].url, 'https://models.example/v1/chat/completions');

  const none = endpoint('Hi.');
  await gateway(none.fetch, { teaching: SETTINGS })(post({ model: 'tutor', messages: [{ role: 'user', content: 'Hello' }] }));
  assert.equal(none.calls[0].body.messages[0].role, 'system', 'an app with no instructions gets a system message');
  assert.equal(none.calls[0].body.messages.length, 2);
});

test('with checks off, a reply goes through as it came, and says it wasn’t checked', async () => {
  const { fetch, calls } = endpoint('It is 5/6.');
  const answer = await gateway(fetch)(post(asked()));
  const body = await answer.json();
  assert.equal(calls.length, 1);
  assert.equal(body.choices[0].message.content, 'It is 5/6.');
  assert.equal(body.viable.outcome, 'not_checked');
  assert.equal(body.viable.checked, false);
  assert.equal(body.viable.why, 'checks_off');
  assert.equal(answer.headers.get('x-viable-outcome'), 'not_checked');
  assert.equal(answer.headers.get('x-viable-rounds'), '0');
});

test('a reply that passes is sent exactly as written, with what the check added', async () => {
  const { fetch, calls } = endpoint(completion('  What do the denominators need?  '), 'PASS');
  const answer = await gateway(fetch, { reviewerModel: 'judge', teaching: SETTINGS })(post(asked(), { 'x-viable-activity': 'fractions' }));
  const body = await answer.json();
  assert.deepEqual(calls.map((call) => call.body.model), ['tutor', 'judge']);
  assert.equal(body.choices[0].message.content, '  What do the denominators need?  ');
  assert.deepEqual(body.choices[0].logprobs, { content: ['secret'] }, 'an unchanged reply keeps what the endpoint sent with it');
  assert.equal(body.usage.total_tokens, 15, 'usage stays the reply’s own');
  const { viable } = body;
  assert.equal(viable.outcome, 'passed');
  assert.equal(viable.checked, true);
  assert.equal(viable.delivered, 'reply');
  assert.equal(viable.rounds, 1);
  assert.equal(viable.added_tokens.total, 15);
  assert.equal(viable.reviewer, 'judge');
  assert.ok(Number.isInteger(viable.added_ms));
  assert.equal(answer.headers.get('x-viable-outcome'), 'passed');
  assert.equal(answer.headers.get('x-viable-added-tokens'), '15');
  assert.equal(answer.headers.get('x-viable-reviewer'), 'judge');
  assert.equal(answer.headers.get('x-viable-activity'), 'fractions');
  assert.match(calls[1].body.messages[0].content, /unlike denominators/, 'the reviewer judges against the teacher’s settings');
});

test('a reply that fails is rewritten, under the app’s and the teacher’s instructions, and reviewed again', async () => {
  const { fetch, calls } = endpoint('It is 5/6.', 'FAILED: Gives the answer.', 'What common denominator works?', 'PASS');
  const answer = await gateway(fetch, { reviewerModel: 'judge', teaching: SETTINGS })(post(asked()));
  const body = await answer.json();
  assert.deepEqual(calls.map((call) => call.body.model), ['tutor', 'judge', 'tutor', 'judge']);
  assert.equal(body.choices[0].message.content, 'What common denominator works?');
  assert.equal(body.choices[0].logprobs, null, 'nothing of the failed reply travels with the rewrite');
  assert.equal(body.viable.outcome, 'passed');
  assert.equal(body.viable.delivered, 'rewrite');
  assert.equal(body.viable.rounds, 2);
  assert.equal(body.viable.added_tokens.total, 45);
  const rewrite = calls[2].body.messages;
  assert.match(rewrite[0].content, /You are a friendly tutor\./);
  assert.match(rewrite[0].content, /unlike denominators/);
  assert.ok(rewrite.some((message) => /Gives the answer/.test(message.content)), 'the rewrite hears why');
});

test('a reply reviewed by the same model that wrote it says so', async () => {
  const { fetch } = endpoint(completion('What could both denominators become?'), 'PASS');
  const answer = await gateway(fetch, { reviewerModel: 'tutor', teaching: SETTINGS })(post(asked()));
  assert.equal(answer.headers.get('x-viable-warning'), 'same_model');
  assert.equal((await answer.json()).viable.warning, 'same_model');
  const other = endpoint(completion('What could both denominators become?'), 'PASS');
  assert.equal((await gateway(other.fetch, { reviewerModel: 'judge', teaching: SETTINGS })(post(asked()))).headers.get('x-viable-warning'), null);
});

test('a reply that never passes is replaced by the settings’ fallback and is never called checked', async () => {
  const { fetch, calls } = endpoint('It is 5/6.', 'FAILED: Gives the answer.', 'Still 5/6.', 'FAILED: Gives the answer.');
  const answer = await gateway(fetch, { reviewerModel: 'judge', rewrites: 1, teaching: { teaching: SETTINGS, fallback: 'Ask your teacher about this one.' } })(post(asked()));
  const body = await answer.json();
  assert.equal(calls.length, 4);
  assert.equal(body.choices[0].message.content, 'Ask your teacher about this one.');
  assert.equal(body.choices[0].finish_reason, 'stop');
  assert.equal(body.viable.outcome, 'unverified');
  assert.equal(body.viable.checked, false);
  assert.equal(body.viable.delivered, 'fallback');
  assert.equal(body.viable.why, 'MAX_ATTEMPTS_REACHED');
  assert.ok(!JSON.stringify(body).includes('5/6'));

  const without = endpoint('It is 5/6.', 'FAILED: No.');
  const standard = await (await gateway(without.fetch, { reviewerModel: 'judge', rewrites: 0 })(post(asked()))).json();
  assert.equal(standard.choices[0].message.content, DEFAULT_FALLBACK);
});

test('--on-unverified pass sends the reply, marked unverified', async () => {
  const { fetch } = endpoint('It is 5/6.', 'FAILED: Gives the answer.');
  const answer = await gateway(fetch, { reviewerModel: 'judge', rewrites: 0, onUnverified: 'pass' })(post(asked()));
  const body = await answer.json();
  assert.equal(body.choices[0].message.content, 'It is 5/6.');
  assert.equal(body.viable.outcome, 'unverified');
  assert.equal(body.viable.checked, false);
  assert.equal(answer.headers.get('x-viable-outcome'), 'unverified');
});

test('a reviewer that is down leaves the reply unverified, never passed', async () => {
  const down = () => new Response(JSON.stringify({ error: { message: 'overloaded' } }), { status: 503 });
  for (const [name, review] of [['an error', down], ['no connection', new Error('connect ECONNREFUSED')]]) {
    const { fetch } = endpoint('It is 5/6.', review);
    const body = await (await gateway(fetch, { reviewerModel: 'judge' })(post(asked()))).json();
    assert.equal(body.viable.outcome, 'unverified', name);
    assert.equal(body.viable.why, 'VERIFICATION_ERROR', name);
    assert.equal(body.choices[0].message.content, DEFAULT_FALLBACK, name);
  }
});

test('a safety concern in a rewrite sends the caring reply, marked attention', async () => {
  const { fetch } = endpoint('Fine.', 'FAILED: Ignores what they said.', '[REQUIRES_ATTENTION] Please talk to someone you trust.');
  const body = await (await gateway(fetch, { reviewerModel: 'judge' })(post(asked()))).json();
  assert.equal(body.viable.outcome, 'attention');
  assert.equal(body.viable.checked, false);
  assert.equal(body.choices[0].message.content, 'Please talk to someone you trust.');
});

test('the endpoint’s failure stays its failure: status and body reach the app, and no fallback pretends otherwise', async () => {
  const busy = () => new Response(JSON.stringify({ error: { message: 'Rate limit reached', code: 'rate_limit' } }), { status: 429, headers: { 'content-type': 'application/json', 'retry-after': '7', 'set-cookie': 'a=b' } });
  for (const options of [{}, { reviewerModel: 'judge' }]) {
    for (const stream of [false, true]) {
      const { fetch, calls } = endpoint(busy);
      const answer = await gateway(fetch, options)(post(asked({ stream })));
      assert.equal(answer.status, 429);
      assert.equal(answer.headers.get('retry-after'), '7');
      assert.equal(answer.headers.get('set-cookie'), null);
      assert.equal(answer.headers.get('x-viable-outcome'), 'not_checked');
      assert.equal(answer.headers.get('x-viable-why'), 'upstream_error');
      assert.equal((await answer.json()).error.message, 'Rate limit reached');
      assert.equal(calls.length, 1);
    }
  }
  const lines = [];
  const gone = await gateway(endpoint(new Error('connect ECONNREFUSED 10.0.0.7')).fetch, { log: (line) => lines.push(line) })(post(asked()));
  assert.equal(gone.status, 502);
  const failed = await gone.json();
  assert.equal(failed.error.code, 'upstream_unreachable');
  assert.ok(!JSON.stringify(failed).includes('10.0.0.7'), 'the caller isn’t told where the endpoint is');
  assert.match(lines[0].reason, /10\.0\.0\.7/);
});

test('tool calls go back to the app unchecked, as JSON and as a stream, and the text that follows is checked', async () => {
  const call = completion(null, { tool_calls: TOOL_CALLS });
  const first = endpoint(call);
  const json = await (await gateway(first.fetch, { reviewerModel: 'judge' })(post(asked({ tools: [{ type: 'function', function: { name: 'lookup', parameters: {} } }] })))).json();
  assert.equal(first.calls.length, 1, 'no review of a tool call');
  assert.ok(first.calls[0].body.tools, 'the tools go to the endpoint');
  assert.deepEqual(json.choices[0].message.tool_calls, TOOL_CALLS);
  assert.equal(json.viable.outcome, 'not_checked');
  assert.equal(json.viable.why, 'tool_calls');

  const second = endpoint(call);
  const parsed = chunks(await (await gateway(second.fetch, { reviewerModel: 'judge' })(post(asked({ stream: true })))).text());
  const delta = parsed.flatMap((chunk) => chunk.choices).find((choice) => choice.delta.tool_calls);
  assert.deepEqual(delta.delta.tool_calls, [{ index: 0, ...TOOL_CALLS[0] }]);
  assert.equal(parsed.at(-1).choices[0].finish_reason, 'tool_calls');

  const after = endpoint('Fractions need a common denominator.', 'PASS');
  const followUp = asked();
  followUp.messages.push({ role: 'assistant', content: null, tool_calls: TOOL_CALLS }, { role: 'tool', tool_call_id: 'call_1', content: 'common denominator' });
  const done = await (await gateway(after.fetch, { reviewerModel: 'judge' })(post(followUp))).json();
  assert.equal(done.viable.outcome, 'passed');
});

test('text beside a tool call is checked too: if it fails, the tool call goes on without it', async () => {
  const { fetch } = endpoint(completion('The answer is 5/6.', { tool_calls: TOOL_CALLS }), 'FAILED: Gives the answer.');
  const body = await (await gateway(fetch, { reviewerModel: 'judge', rewrites: 0 })(post(asked()))).json();
  const { message, finish_reason: finish } = body.choices[0];
  assert.equal(message.content, null);
  assert.deepEqual(message.tool_calls, TOOL_CALLS);
  assert.equal(finish, 'tool_calls');
  assert.equal(body.viable.delivered, 'tool_calls_only');
  assert.equal(body.viable.outcome, 'unverified');
});

test('a held stream is a proper one: the text in pieces, ending with what the check did, then [DONE]', async () => {
  const reply = 'First, line up the denominators.\n\n  Then ask: what number do\t2 and 3 both go into, and why does that help you add the two fractions?\n';
  const { fetch, calls } = endpoint(completion(reply), 'PASS');
  const answer = await gateway(fetch, { reviewerModel: 'judge' })(post(asked({ stream: true, stream_options: { include_usage: true } })));
  assert.match(answer.headers.get('content-type'), /text\/event-stream/);
  assert.equal(answer.headers.get('x-viable-outcome'), 'passed');
  assert.equal(calls[0].body.stream, false, 'the reply is held');
  assert.equal(calls[0].body.stream_options, undefined);
  const text = await answer.text();
  assert.equal(events(text).at(-1), '[DONE]');
  const parsed = chunks(text);
  assert.ok(parsed.length > 5, 'in pieces');
  assert.equal(parsed[0].choices[0].delta.role, 'assistant');
  assert.equal(said(parsed), reply, 'every character arrives, spaces and all');
  for (const chunk of parsed) assert.equal(chunk.object, 'chat.completion.chunk');
  const ending = parsed.find((chunk) => chunk.choices[0]?.finish_reason);
  assert.equal(ending.choices[0].finish_reason, 'stop');
  assert.equal(ending.viable.outcome, 'passed');
  assert.deepEqual(parsed.at(-1).choices, []);
  assert.equal(parsed.at(-1).usage.total_tokens, 15);
});

test('a stream never shows a learner the draft that failed', async () => {
  const { fetch } = endpoint('The answer is 5/6.', 'FAILED: Gives the answer.', 'It is 5/6, really.', 'FAILED: Gives the answer.', 'Still 5/6.', 'FAILED: Gives the answer.');
  const answer = await gateway(fetch, { reviewerModel: 'judge' })(post(asked({ stream: true })));
  const text = await answer.text();
  assert.ok(!text.includes('5/6'));
  assert.equal(said(chunks(text)), DEFAULT_FALLBACK);
  assert.equal(answer.headers.get('x-viable-delivered'), 'fallback');
});

test('over real HTTP: with checks off the stream isn’t buffered; with checks on it arrives whole and checked', async () => {
  let release;
  const held = new Promise((done) => { release = done; });
  const seen = [];
  const upstream = createServer(async (req, res) => {
    let raw = '';
    for await (const part of req) raw += part;
    const body = JSON.parse(raw);
    seen.push({ authorization: req.headers.authorization, body });
    if (body.stream) {
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      const chunk = (content) => res.write(`data: ${JSON.stringify({ id: 'c', object: 'chat.completion.chunk', model: body.model, choices: [{ index: 0, delta: { content }, finish_reason: null }] })}\n\n`);
      chunk('Common ');
      await held;
      chunk('denominators.');
      res.write(`data: ${JSON.stringify({ id: 'c', object: 'chat.completion.chunk', model: body.model, choices: [], usage: { total_tokens: 9 } })}\n\n`);
      res.end('data: [DONE]\n\n');
    } else {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(completion(body.model === 'judge' ? 'PASS' : 'Checked and whole.')));
    }
  });
  await new Promise((done) => { upstream.listen(0, '127.0.0.1', done); });
  const base = `http://127.0.0.1:${upstream.address().port}/v1`;
  const store = memoryStore();
  const open = await listen(gatewayHandler({ upstream: base, store, keepText: true }), { port: 0 });
  const checking = await listen(gatewayHandler({ upstream: base, reviewerModel: 'judge', store }), { port: 0 });
  try {
    const answer = await fetch(`${open.url}/v1/chat/completions`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer sk-caller', 'x-viable-learner': 's-0412' }, body: JSON.stringify(asked({ stream: true })) });
    assert.equal(answer.headers.get('x-viable-outcome'), 'not_checked');
    assert.equal(answer.headers.get('x-viable-why'), 'checks_off');
    const reader = answer.body.getReader();
    const decoder = new TextDecoder();
    const early = decoder.decode((await reader.read()).value);
    assert.match(early, /Common /, 'the first words arrive before the endpoint has finished');
    assert.ok(!early.includes('denominators.'));
    release();
    let rest = early;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      rest += decoder.decode(value, { stream: true });
    }
    assert.equal(said(chunks(rest)), 'Common denominators.');
    assert.equal(events(rest).at(-1), '[DONE]');
    assert.equal(seen[0].authorization, 'Bearer sk-caller', 'without a key of its own, the gateway sends on the caller’s');
    assert.equal(seen[0].body.stream, true);
    const { records, runs } = await readRecords(store);
    assert.equal(runs[0].output.text, 'Common denominators.');
    assert.equal(records[0].turns[0].message, 'What is 1/2 + 1/3?');
    assert.ok(Number.isFinite(records[0].turns[0].first_output_ms));
    assert.equal(runs[0].steps[0].tokens, 9);

    const whole = await fetch(`${checking.url}/v1/chat/completions`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(asked({ stream: true })) });
    assert.equal(whole.headers.get('x-viable-outcome'), 'passed');
    assert.equal(said(chunks(await whole.text())), 'Checked and whole.');
    assert.deepEqual(seen.slice(1).map((item) => item.body.model), ['tutor', 'judge']);
  } finally {
    release();
    for (const server of [upstream, open.server, checking.server]) await new Promise((done) => { server.close(done); });
  }
});

test('a client that hangs up on a passing stream stops it, and the call is still recorded', async () => {
  let cancelled = false;
  const sse = () => new Response(new ReadableStream({
    start(controller) { controller.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":"Hi"}}]}\n\n')); },
    cancel() { cancelled = true; }
  }), { headers: { 'content-type': 'text/event-stream' } });
  const store = memoryStore();
  const answer = await gateway(endpoint(sse).fetch, { store })(post(asked({ stream: true })));
  const reader = answer.body.getReader();
  await reader.read();
  await reader.cancel();
  assert.equal(cancelled, true);
  await new Promise((done) => { setTimeout(done, 5); });
  assert.equal((await readRecords(store)).runs.length, 1);
});

test('a learner’s ID never reaches the endpoint, wherever the app put it', async () => {
  const { fetch, calls } = endpoint('Fine.', 'FAILED: No.', 'Better.', 'PASS');
  const store = memoryStore();
  await gateway(fetch, { reviewerModel: 'judge', store })(post(asked({ user: 's-learner-77', safety_identifier: 's-learner-77', prompt_cache_key: 's-learner-77' }), { 'x-viable-learner': 's-learner-77', 'x-viable-section': 'sec_a' }));
  assert.equal(calls.length, 4);
  assert.ok(!JSON.stringify(calls).includes('s-learner-77'));
  assert.ok(calls.every((call) => !Object.keys(call.headers).some((name) => name.startsWith('x-viable'))));
  const { records } = await readRecords(store);
  assert.equal(records[0].user, 's-learner-77');
  assert.equal(records[0].learner_group, 'sec_a');
  const keys = await store.list('gateway/');
  assert.deepEqual(keys.map((key) => key.split('/').slice(1, 4).join('/')).sort(), ['_/records/s-learner-77', '_/runs/s-learner-77'], 'forgetting a learner is two folders');

  const embed = endpoint({ object: 'list', data: [] });
  await gateway(embed.fetch)(post({ model: 'e', input: 'x', user: 's-learner-77' }, {}, '/v1/embeddings'));
  assert.equal(embed.calls[0].url, 'https://models.example/v1/embeddings');
  assert.equal(embed.calls[0].body.user, undefined);
});

test('X-Viable-Learner must be pseudonymous; a name in the app’s own user field just names nobody', async () => {
  const refused = await gateway(endpoint('x').fetch)(post(asked(), { 'x-viable-learner': 'jane@school.example' }));
  assert.equal(refused.status, 400);
  assert.equal((await refused.json()).error.code, 'invalid_learner');
  for (const user of ['jane@school.example', 'Jane Smith', 7]) {
    const store = memoryStore();
    const answer = await gateway(endpoint('x').fetch, { store })(post(asked({ user })));
    assert.equal(answer.status, 200);
    const { records, runs } = await readRecords(store);
    assert.equal(records.length, 0, String(user));
    assert.equal(runs.length, 1);
    assert.ok(!JSON.stringify(runs).includes('Jane'));
  }
});

test('X-Viable-Activity picks the settings; a section gets its own; an unknown one is refused, not ignored', async () => {
  const activities = {
    fractions: { teaching: { ...SETTINGS, sections: { sec_a: { help: 'explain', note: 'They are new to this.' } } }, title: 'Adding fractions' },
    essays: { goal: 'Students revise their own essays.', help: 'check_only' }
  };
  const { fetch, calls } = endpoint('x');
  const handle = gateway(fetch, { activities });
  await handle(post(asked(), { 'x-viable-activity': 'essays' }));
  assert.match(calls[0].body.messages[0].content, /revise their own essays/);
  assert.ok(!calls[0].body.messages[0].content.includes('fractions with'));
  await handle(post(asked(), { 'x-viable-activity': 'fractions', 'x-viable-section': 'sec_a' }));
  assert.match(calls[1].body.messages[0].content, /They are new to this\./);
  assert.match(calls[1].body.messages[0].content, /show a worked example/);
  const unknown = await handle(post(asked(), { 'x-viable-activity': 'nope' }));
  assert.equal(unknown.status, 404);
  assert.equal((await unknown.json()).error.code, 'activity_not_found');
  const missing = await handle(post(asked()));
  assert.equal(missing.status, 400);
  assert.equal((await missing.json()).error.code, 'activity_required');
  assert.equal(calls.length, 2, 'neither reached the endpoint');
  assert.throws(() => gatewayHandler({ upstream: 'u', teaching: { answer_key: '5/6' } }), /needs the question/);
});

test('an activity’s answer key reaches only the reviewer, and its guideline the reviewer and any rewrite, not the first reply', async () => {
  const { fetch, calls } = endpoint('Think about it.', 'PASS');
  await gateway(fetch, { reviewerModel: 'judge', teaching: { teaching: SETTINGS, question: 'What is 1/2 + 1/3?', answer_key: '5/6' } })(post(asked()));
  assert.ok(!JSON.stringify(calls[0].body).includes('5/6'));
  assert.match(calls[1].body.messages[0].content, /Correct Answer 1: 5\/6/);
  const guided = endpoint('Think about it.', 'PASS');
  await gateway(guided.fetch, { reviewerModel: 'judge', teaching: { guideline: 'Never name the answer.' } })(post(asked()));
  assert.ok(!JSON.stringify(guided.calls[0].body).includes('Never name'));
  assert.match(guided.calls[1].body.messages[0].content, /Never name the answer\./);
});

test('what it can’t check it doesn’t pretend to: structured output goes through marked, and n above 1 is refused', async () => {
  const { fetch, calls } = endpoint('{"a":1}');
  const body = await (await gateway(fetch, { reviewerModel: 'judge' })(post(asked({ response_format: { type: 'json_object' } })))).json();
  assert.equal(calls.length, 1);
  assert.equal(body.choices[0].message.content, '{"a":1}');
  assert.equal(body.viable.outcome, 'not_checked');
  assert.equal(body.viable.why, 'structured_output');
  const many = await gateway(endpoint('x').fetch, { reviewerModel: 'judge' })(post(asked({ n: 2 })));
  assert.equal(many.status, 400);
  assert.equal((await many.json()).error.code, 'unsupported_n');
});

test('who may call: localhost without a token, a token anywhere else, and the upstream key said plainly', async () => {
  const away = 'https://gateway.school.example';
  const { fetch, calls } = endpoint({ object: 'list', data: [{ id: 'tutor' }] });
  const open = gateway(fetch);
  assert.equal((await open(post(asked(), {}, '/v1/chat/completions', away))).status, 403, 'no token, not localhost');
  assert.equal(calls.length, 0);
  assert.equal((await open(new Request(`${away}/health`))).status, 403, 'nor does it say anything of itself');
  assert.equal((await open(new Request('http://localhost:8090/health'))).status, 200);

  const locked = gateway(fetch, { token: 'gate-token' });
  assert.equal((await locked(post(asked(), {}, '/v1/chat/completions', 'http://localhost:1'))).status, 401, 'a token holds on localhost too');
  assert.equal((await locked(post(asked(), { authorization: 'Bearer wrong' }))).status, 401);
  const models = await locked(new Request(`${away}/v1/models`, { headers: { authorization: 'Bearer gate-token' } }));
  assert.equal(models.status, 200);
  assert.deepEqual((await models.json()).data, [{ id: 'tutor' }]);
  assert.equal(calls[0].url, 'https://models.example/v1/models');
  assert.equal(calls[0].headers.authorization, 'Bearer sk-gateway', 'the gateway’s own key, never the token');

  const passing = gatewayHandler({ upstream: 'https://models.example/v1', token: 'gate-token', fetch });
  const both = await passing(new Request(`${away}/v1/models`, { headers: { authorization: 'Bearer sk-theirs', 'x-viable-token': 'gate-token', 'openai-project': 'proj_1' } }));
  assert.equal(both.status, 200);
  assert.equal(calls[1].headers.authorization, 'Bearer sk-theirs', 'the caller’s key goes on');
  assert.equal(calls[1].headers['openai-project'], 'proj_1');
  assert.equal((await passing(new Request(`${away}/v1/models`, { headers: { authorization: 'Bearer gate-token' } }))).status, 401, 'in pass-through the bearer is the upstream key, not the token');
});

test('what the gateway won’t do, it says', async () => {
  const handle = gateway(endpoint('x').fetch);
  const responses = await handle(post({}, {}, '/v1/responses'));
  assert.equal(responses.status, 404);
  assert.match((await responses.json()).error.message, /chat completions/);
  const notJson = await handle(new Request('http://localhost:1/v1/chat/completions', { method: 'POST', headers: { 'content-type': 'text/plain' }, body: '{}' }));
  assert.equal(notJson.status, 415, 'so a web page can’t reach a local gateway with a simple form');
  assert.equal((await handle(post({ model: 'x' }))).status, 400);
  const broken = await handle(new Request('http://localhost:1/v1/chat/completions', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{nope' }));
  assert.equal((await broken.json()).error.code, 'invalid_json');
  const small = gateway(endpoint('x').fetch, { maxBodyBytes: 10 });
  assert.equal((await small(post(asked()))).status, 413);
  const garbled = await gateway(endpoint({ nope: true }).fetch, { reviewerModel: 'judge' })(post(asked()));
  assert.equal(garbled.status, 502);
  assert.throws(() => gatewayHandler({}), /upstream/);
  assert.throws(() => gatewayHandler({ upstream: 'u', onUnverified: 'maybe' }), /fallback or pass/);
  assert.throws(() => gatewayHandler({ upstream: 'u', rewrites: 20 }), /rewrites/);
});

test('without being asked, records hold no text from the learner or the AI', async () => {
  const store = memoryStore();
  const { fetch } = endpoint('SECRET-REPLY', 'FAILED: Gives the answer.', 'SECRET-REWRITE', 'PASS');
  await gateway(fetch, { reviewerModel: 'judge', store, teaching: SETTINGS })(post({ model: 'tutor', messages: [{ role: 'user', content: 'SECRET-EARLIER' }, { role: 'assistant', content: 'SECRET-OLD' }, { role: 'user', content: 'SECRET message of five words' }] }, { 'x-viable-learner': 's-1' }));
  const kept = JSON.stringify(await Promise.all((await store.list('gateway/')).map((key) => store.get(key))));
  assert.ok(!kept.includes('SECRET'), kept);
  assert.ok(!kept.includes('Gives the answer'), 'a reviewer’s reason can quote what was said, so it is text like the rest');
  const { records, runs } = await readRecords(store);
  assert.equal(records[0].turns[0].words, 5);
  assert.equal(records[0].turns[0].turn_index, 2);
  assert.equal(records[0].turns[0].vetting, 'passed');
  assert.match(records[0].turns[0].conversation_id, /^[0-9a-f]{16}$/);
  assert.equal(runs[0].teaching.watch_for, 'adds the denominators', 'the settings are for the teacher, who wrote them');
  const page = teacherView({ records, runs, teaching: runs[0].teaching });
  assert.match(page, /Not kept in this record\./);
  assert.ok(!page.includes('couldn’t be written'), 'a reply that wasn’t kept isn’t one that failed');
});

test('the teacher’s page reads what the gateway kept, for an app that never heard of VIABLE', async () => {
  const store = memoryStore();
  const script = [];
  for (let i = 0; i < 5; i += 1) script.push(`Reply ${i}`, 'PASS');
  for (let i = 0; i < 3; i += 1) script.push('<b>Reply</b> with the answer', 'FAILED: States the answer directly.');
  const { fetch } = endpoint(...script);
  const handle = gateway(fetch, { reviewerModel: 'judge', rewrites: 0, store, keepText: true, teaching: { teaching: SETTINGS, title: 'Adding fractions' } });
  for (let i = 0; i < 8; i += 1) {
    await handle(post({ model: 'tutor', messages: [{ role: 'user', content: i === 7 ? '<script>alert(1)</script>' : `Question ${i}` }] }, { 'x-viable-learner': `s-${i % 2}`, 'x-viable-activity': 'fractions' }));
  }
  const inputs = await readRecords(store, 'fractions');
  assert.equal(inputs.runs.length, 8);
  assert.equal(inputs.records.length, 8);
  assert.equal(inputs.title, 'Adding fractions');
  assert.equal(inputs.teaching.goal, SETTINGS.goal);
  const suggestions = suggestChanges(inputs);
  assert.deepEqual(suggestions.map((item) => item.rule), ['answers_given_away', 'replies_unverified']);
  assert.deepEqual(suggestions[0].patch, { help: 'ask_first' });
  const page = teacherView({ ...inputs, suggestions });
  assert.match(page, /Adding fractions/);
  assert.match(page, /States the answer directly/);
  assert.match(page, /<dd>5<\/dd>/, 'five passed');
  assert.match(page, /<dd>3<\/dd>/, 'three unverified');
  assert.ok(!page.includes('<script>alert'), 'escaped');
  assert.match(page, /s-0/);
  assert.match(page, /s-1/);

  assert.equal((await handle(new Request('http://localhost:8090/teacher'))).status, 401, 'on this machine too: a local proxy makes every visitor look local');
  const served = await gateway(fetch, { store, teacherToken: 'made-at-start' })(new Request('http://localhost:8090/teacher', { headers: { authorization: `Basic ${btoa('teacher:made-at-start')}` } }));
  assert.match(served.headers.get('content-type'), /text\/html/);
  assert.equal(served.headers.get('cache-control'), 'no-store');
  assert.match(await served.text(), /Adding fractions/);
});

test('the served page: a browser’s own password box holds the token, and several activities get a list', async () => {
  const store = memoryStore();
  const { fetch } = endpoint('x');
  const handle = gateway(fetch, { store, token: 'gate-token', activities: { essays: SETTINGS, fractions: { teaching: SETTINGS, title: 'Adding <fractions>' } } });
  const says = (headers) => handle(new Request('https://gateway.school.example/teacher', { headers }));
  const shut = await says({});
  assert.equal(shut.status, 401);
  assert.match(shut.headers.get('www-authenticate'), /^Basic/);
  const basic = { authorization: `Basic ${btoa('teacher:gate-token')}` };
  for (const id of ['essays', 'fractions']) await handle(post(asked(), { 'x-viable-token': 'gate-token', 'x-viable-activity': id }));
  assert.deepEqual(await recordedActivities(store), ['essays', 'fractions']);
  const list = await (await says(basic)).text();
  assert.match(list, /Which activity\?/);
  assert.match(list, /href="\?activity=essays"/);
  assert.match(list, /Adding &lt;fractions&gt;/);
  const one = await handle(new Request('https://gateway.school.example/teacher?activity=essays', { headers: basic }));
  assert.match(await one.text(), /What VETTING did/);
  assert.equal((await handle(new Request('https://gateway.school.example/teacher?activity=%3Cb', { headers: basic }))).status, 400);
  const noRecords = await gateway(fetch, { teacherToken: 't' })(new Request('http://localhost:1/teacher', { headers: { authorization: `Basic ${btoa('teacher:t')}` } }));
  assert.equal(noRecords.status, 404);
  assert.match((await noRecords.json()).error.message, /--data-dir/);
});

test('a record that can’t be written never costs the learner the reply, and waitUntil holds the write where a cloud has it', async () => {
  const lines = [];
  const broken = { ...memoryStore(), put: async () => { throw new Error('disk full'); } };
  const body = await (await gateway(endpoint('Fine.').fetch, { store: broken, log: (line) => lines.push(line) })(post(asked()))).json();
  assert.equal(body.choices[0].message.content, 'Fine.');
  assert.ok(lines.some((line) => line.code === 'record_failed'));

  const store = memoryStore();
  const waiting = [];
  await gateway(endpoint('Fine.').fetch, { store })(post(asked()), { waitUntil: (work) => waiting.push(work) });
  assert.equal(waiting.length, 1);
  await Promise.all(waiting);
  assert.equal((await readRecords(store)).runs.length, 1);
});

test('a log line says what happened, and nothing anyone wrote or who they are', async () => {
  const lines = [];
  await gateway(endpoint('A-REPLY', 'PASS').fetch, { reviewerModel: 'judge', log: (line) => lines.push(line) })(post(asked({ messages: [{ role: 'user', content: 'A-MESSAGE' }] }), { 'x-viable-learner': 'A-LEARNER' }));
  assert.equal(lines.length, 1);
  assert.equal(lines[0].outcome, 'passed');
  assert.equal(lines[0].rounds, 1);
  assert.ok(Number.isInteger(lines[0].added_ms));
  assert.ok(!JSON.stringify(lines).includes('A-'));
});

test('the components answer over plain HTTP, for a language with no MCP client', async () => {
  const { fetch, calls } = endpoint('FAILED: Gives the answer.', 'What do the denominators need?', 'PASS');
  const handle = gateway(fetch, { reviewerModel: 'judge', teaching: SETTINGS });
  const checked = await (await handle(post({ reply: 'It is 5/6.', message: 'What is 1/2 + 1/3?', question: 'What is 1/2 + 1/3?', answer_key: '5/6', rewrite: 1, model: 'tutor', history: [{ role: 'user', content: 'Hi' }, { role: 'nope', content: 'dropped' }] }, {}, '/v1/check'))).json();
  assert.equal(checked.outcome, 'passed');
  assert.equal(checked.reply, 'What do the denominators need?');
  assert.equal(checked.reviewer, 'judge');
  assert.deepEqual(calls.map((call) => call.body.model), ['judge', 'tutor', 'judge']);
  assert.ok(!JSON.stringify(calls[1].body).includes('dropped'));
  const refused = await handle(post({ reply: ' ' }, {}, '/v1/check'));
  assert.equal(refused.status, 400);
  assert.equal((await refused.json()).error.code, 'invalid_check');

  const own = await (await handle(post({}, {}, '/v1/teaching/instructions'))).json();
  assert.match(own.instructions, /unlike denominators/);
  assert.equal(own.watch_for, 'adds the denominators');
  assert.ok(!own.instructions.includes('adds the denominators'));
  const given = await (await handle(post({ teaching: { goal: 'Students read closely.', help: 'nope' } }, {}, '/v1/teaching/instructions'))).json();
  assert.match(given.instructions, /read closely/);
  assert.ok(given.errors.length);
  const none = await gateway(fetch)(post({}, {}, '/v1/teaching/instructions'));
  assert.equal(none.status, 400);

  const found = await (await handle(post({ text: 'adding fractions unlike denominators' }, {}, '/v1/misconceptions'))).json();
  assert.ok(found.data.length);
  assert.match(JSON.stringify(found.source), /CC BY/);
  assert.equal((await handle(post({ text: '' }, {}, '/v1/misconceptions'))).status, 400);
});

test('nothing the gateway reaches imports a Node built-in, so it deploys anywhere', () => {
  const seen = new Set();
  const visit = (path) => {
    if (seen.has(path)) return;
    seen.add(path);
    for (const [, spec] of readFileSync(path, 'utf8').matchAll(/(?:\bfrom\s*|\bimport\s*\(\s*|^\s*import\s*)['"]([^'"]+)['"]/gm)) {
      assert.ok(!spec.startsWith('node:'), `${path} imports ${spec}`);
      if (spec.startsWith('.')) visit(resolve(dirname(path), spec));
    }
  };
  visit(join(SRC, 'gateway.js'));
  assert.ok(seen.has(join(SRC, 'check.js')));
});

// A local endpoint for the commands below: the reviewer model fails what the script says.
async function localEndpoint(reply, verdict = 'PASS') {
  const server = createServer(async (req, res) => {
    let raw = '';
    for await (const part of req) raw += part;
    const body = JSON.parse(raw);
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(completion(body.model === 'judge' ? verdict : reply)));
  });
  await new Promise((done) => { server.listen(0, '127.0.0.1', done); });
  return { server, base: `http://127.0.0.1:${server.address().port}/v1` };
}

test('the command says what it will do, serves, keeps records in a folder, and view and suggest read that folder', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'gateway-'));
  const { server, base } = await localEndpoint('It is 5/6.', 'FAILED: States the answer.');
  const settings = join(dir, 'fractions.json');
  writeFileSync(settings, JSON.stringify({ teaching: SETTINGS, title: 'Adding fractions', fallback: 'Ask your teacher.' }));
  const data = join(dir, 'data');
  const child = spawn(process.execPath, [CLI, 'gateway', '--upstream', base, '--teaching', settings, '--reviewer-model', 'judge', '--rewrites', '0', '--data-dir', data, '--port', '0'], { env: { ...process.env, OPENAI_API_KEY: 'sk-gateway' }, stdio: ['ignore', 'pipe', 'pipe'] });
  try {
    let notes = '';
    const url = await new Promise((done, fail) => {
      child.stderr.on('data', (part) => {
        notes += part;
        const found = /OPENAI_BASE_URL=(\S+)/.exec(notes);
        if (found) done(found[1]);
      });
      child.once('exit', () => fail(new Error(notes)));
    });
    assert.match(notes, /Upstream key: from OPENAI_API_KEY/);
    assert.match(notes, /Callers: this machine only/);
    assert.match(notes, /Checks: on, reviewer judge, up to 0 rewrites/);
    assert.match(notes, /without what learners and the AI wrote/);
    const answer = await fetch(`${url}/chat/completions`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-viable-learner': 's-1' }, body: JSON.stringify(asked()) });
    const body = await answer.json();
    assert.equal(body.viable.outcome, 'unverified');
    assert.equal(body.choices[0].message.content, 'Ask your teacher.');
    const out = join(dir, 'page.html');
    const view = spawnSync(process.execPath, [CLI, 'view', data, '--out', out], { encoding: 'utf8' });
    assert.equal(view.status, 0, view.stderr);
    const page = readFileSync(out, 'utf8');
    assert.match(page, /Adding fractions/);
    assert.ok(!page.includes('States the answer'), 'a reason stays only with --keep-text');
    assert.ok(!page.includes('5/6'));
    const suggest = spawnSync(process.execPath, [CLI, 'suggest', data, '--json'], { encoding: 'utf8' });
    assert.equal(suggest.status, 0, suggest.stderr);
    assert.deepEqual(JSON.parse(suggest.stdout), []);
    const kept = await readRecords(fileStore(data));
    assert.equal(kept.runs.length, 1);
  } finally {
    child.kill();
    await new Promise((done) => { server.close(done); });
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the command refuses to serve past this machine without a token, and takes a folder of activities', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'gateway-'));
  try {
    const run = (args, env = {}) => spawnSync(process.execPath, [CLI, 'gateway', ...args], { encoding: 'utf8', timeout: 5000, env: { ...process.env, ...env } });
    const open = run(['--upstream', 'http://127.0.0.1:1/v1', '--host', '0.0.0.0']);
    assert.equal(open.status, 1);
    assert.match(open.stderr, /without a token/);
    assert.equal(run([]).status, 1);
    assert.match(run(['--upstream', 'u', '--token-env', 'NOT_SET_HERE']).stderr, /isn't set/);
    assert.match(run(['--upstream', 'u', '--teaching', 'a', '--activities', 'b']).stderr, /not both/);
    writeFileSync(join(dir, 'empty.json'), '{}');
    assert.match(run(['--upstream', 'u', '--teaching', join(dir, 'empty.json')]).stderr, /holds no teaching settings/);
    assert.match(run(['--upstream', 'u', '--activities', join(dir, 'nowhere')]).stderr, /ENOENT|no such/i);
    const activities = join(dir, 'activities');
    mkdirSync(activities);
    writeFileSync(join(activities, 'essays.json'), JSON.stringify({ goal: 'Students revise their own essays.' }));
    writeFileSync(join(activities, 'course.json'), JSON.stringify({ format: 'viable.course-package', course: { activities: [{ title: 'Adding fractions', teaching: SETTINGS }, { title: 'No settings' }] } }));
    const child = spawn(process.execPath, [CLI, 'gateway', '--upstream', 'http://127.0.0.1:1/v1', '--activities', activities, '--port', '0'], { stdio: ['ignore', 'ignore', 'pipe'] });
    let notes = '';
    await new Promise((done, fail) => {
      child.stderr.on('data', (part) => { notes += part; if (/OPENAI_BASE_URL/.test(notes)) done(); });
      child.once('exit', () => fail(new Error(notes)));
    });
    child.kill();
    assert.match(notes, /2 activities, picked by X-Viable-Activity: adding-fractions, essays/);
    assert.match(notes, /Checks: off/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('viable-harness test exits non-zero when a case fails, so a CI step fails with it', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'gateway-'));
  const passing = await localEndpoint('Think about the denominators.', '{"verdict":"pass","reason":"Fine."}');
  const failing = await localEndpoint('It is 5/6.', '{"verdict":"fail","reason":"Gives the answer."}');
  try {
    const agent = join(dir, 'tutor.agent.json');
    writeFileSync(agent, JSON.stringify({ format: 'viable.agent', format_version: 1, name: 'Tutor', graph: { entry: 'write', nodes: [{ id: 'write', type: 'llm', config: { model: 'tutor' }, next: 'out' }, { id: 'out', type: 'output', config: { text: '{{write.content}}' } }] } }));
    const cases = join(dir, 'cases.json');
    writeFileSync(cases, JSON.stringify({ format: 'viable.agent-tests', cases: [{ name: 'No answers', messages: [{ role: 'user', content: 'What is 1/2 + 1/3?' }], rubric: 'Guides without stating 5/6.' }] }));
    const run = (base) => new Promise((done) => {
      const child = spawn(process.execPath, [CLI, 'test', agent, cases, '--judge-model', 'judge'], { env: { ...process.env, OPENAI_BASE_URL: base, OPENAI_API_KEY: 'k' }, stdio: 'ignore' });
      child.once('exit', done);
    });
    assert.equal(await run(passing.base), 0);
    assert.equal(await run(failing.base), 1);
    assert.equal(await run('http://127.0.0.1:1/v1'), 1, 'a case that couldn’t run fails the step too');
  } finally {
    for (const { server } of [passing, failing]) await new Promise((done) => { server.close(done); });
    rmSync(dir, { recursive: true, force: true });
  }
});
