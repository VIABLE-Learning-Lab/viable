import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { HELP_LEVELS, endpointModel, runAgent } from '../src/index.js';

const json = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const argument = json('../examples/argument-writing.json');
const fractions = json('../examples/fractions-practice.json');

// A scripted OpenAI-compatible endpoint: each call takes the next reply (the last one repeats).
function scriptedFetch(...replies) {
  const calls = [];
  const fetch = async (url, init) => {
    const body = JSON.parse(init.body);
    calls.push({ url, headers: init.headers, body });
    const content = replies.length > 1 ? replies.shift() : replies[0];
    return new Response(JSON.stringify({ choices: [{ message: { role: 'assistant', content }, finish_reason: 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 } }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  return { fetch, calls };
}

test('an example agent runs locally on an OpenAI-compatible endpoint, with its activity’s teaching settings', async () => {
  const { fetch, calls } = scriptedFetch('Your claim is clear: it takes a side.');
  const result = await runAgent(argument, { input: 'Is my claim clear?', baseUrl: 'http://localhost:11434/v1/', apiKey: 'sk-test', fetch });
  assert.equal(result.output.text, 'Your claim is clear: it takes a side.');
  assert.equal(result.agent, 'Argument writing coach');
  assert.equal(result.activity, 'Should high schools start later?');
  assert.deepEqual(result.steps.map((step) => [step.nodeId, step.status]), [['input', 'completed'], ['coach', 'completed'], ['reply', 'completed']]);
  assert.equal(calls[0].url, 'http://localhost:11434/v1/chat/completions');
  assert.equal(calls[0].headers.authorization, 'Bearer sk-test');
  assert.equal(calls[0].body.model, endpointModel('gpt-oss-120b'), 'the example’s model is sent as its provider names it');
  assert.equal(endpointModel('viable-3'), 'gpt-6-luna', 'a VIABLE model name becomes its provider model');
  assert.equal(calls[0].body.stream, false);
  const system = calls[0].body.messages[0];
  assert.equal(system.role, 'system');
  assert.match(system.content, /From the teacher of this activity:/);
  assert.ok(system.content.includes(HELP_LEVELS.check_only), 'check_only reaches the reply step');
  assert.ok(!system.content.includes('pasting in text'), 'what the teacher watches for stays with the teacher');
  assert.equal(calls.at(-1).body.messages.at(-1).content, 'Is my claim clear?');
});

test('--model replaces every model, and a failing endpoint says which one', async () => {
  const { fetch, calls } = scriptedFetch('ok');
  await runAgent(argument, { input: 'hi', model: 'llama3.1', fetch, teaching: false });
  assert.equal(calls[0].body.model, 'llama3.1');
  assert.ok(!calls[0].body.messages[0].content.includes('From the teacher'), 'teaching: false runs without the teacher');
  const failing = async () => new Response(JSON.stringify({ error: { message: 'model not found' } }), { status: 404 });
  await assert.rejects(runAgent(argument, { input: 'hi', model: 'nope', baseUrl: 'http://127.0.0.1:1/v1', fetch: failing }), /127\.0\.0\.1:1\/v1\/chat\/completions, model nope\) answered 404: model not found/);
});

test('teaching settings given to a run reach the reply step as the teacher’s instructions', async () => {
  const teaching = json('../schemas/examples/teaching.example.json');
  const { fetch, calls } = scriptedFetch('What do you think the strongest evidence is?');
  const result = await runAgent(json('../schemas/examples/agent.example.json'), { input: 'Summarize it for me', teaching, fetch });
  const system = calls[0].body.messages[0].content;
  assert.match(system, /Skill: CT\.2\.2 \(Carnegie Skills Progressions, level Integrating\)/);
  assert.match(system, /At this level, the learner:\n- Distinguishes between weaker and stronger evidence/);
  assert.ok(system.includes(HELP_LEVELS.ask_first));
  assert.ok(!system.includes(teaching.watch_for));
  assert.equal(result.teaching, teaching);

  const sectioned = { help: 'explain', sections: { sec_es: { help: 'hint', note: 'Many in this group are learning English.' } } };
  const own = scriptedFetch('ok');
  await runAgent(argument, { input: 'hi', teaching: sectioned, section: 'sec_es', fetch: own.fetch });
  assert.ok(own.calls[0].body.messages[0].content.includes(HELP_LEVELS.hint), 'a section’s own help level applies to its learners');
  assert.match(own.calls[0].body.messages[0].content, /learning English/);
  const rest = scriptedFetch('ok');
  await runAgent(argument, { input: 'hi', teaching: sectioned, fetch: rest.fetch });
  assert.ok(rest.calls[0].body.messages[0].content.includes(HELP_LEVELS.explain) && !/learning English/.test(rest.calls[0].body.messages[0].content), 'and to no one else');
});

test('a VETTING step’s rounds are in the trace', async () => {
  const { fetch } = scriptedFetch('The answer is 5/6.', 'FAIL: it gives the answer away.', 'What could the denominators become?', 'PASS');
  const result = await runAgent(fractions, { input: 'What is 1/2 + 1/3?', fetch });
  assert.equal(result.output.text, 'What could the denominators become?');
  const vetting = result.steps.find((step) => step.nodeType === 'vetting');
  assert.equal(vetting.nodeId, 'vet_general', 'no question open: the general review');
  assert.equal(vetting.output.outcome, 'passed');
  assert.deepEqual(vetting.output.attempt_details.map((round) => round.verdict), ['fail', 'pass']);
  assert.match(vetting.output.attempt_details[0].feedback, /gives the answer away/);
  assert.equal(result.modelCalls, 4);
});

test('steps that need VIABLE’s services fail clearly or are skipped', async () => {
  const graph = (step) => ({ entry: 's', nodes: [{ id: 's', ...step, next: 'out' }, { id: 'out', type: 'output', config: { text: 'done' } }] });
  await assert.rejects(runAgent(graph({ type: 'knowledge', config: { knowledge_bases: ['kb_1'] } }), { input: 'hi' }), (error) => error.code === 'knowledge_unavailable' && /VIABLE's hosted service/.test(error.message));
  await assert.rejects(runAgent(graph({ type: 'image', config: { model: 'gpt-image-1' } }), { input: 'a fox' }), (error) => error.code === 'needs_viable' && /Image steps need VIABLE's hosted service/.test(error.message));
  await assert.rejects(runAgent(graph({ type: 'subagent', config: { slug: 'helper' } }), { input: 'hi' }), { code: 'subagent_disabled' });
  const memory = await runAgent(graph({ type: 'memory', config: { mode: 'recall' } }), { input: 'hi' });
  assert.equal(memory.outputs.s.skipped, true);
  assert.equal(memory.output.text, 'done');
});

test('the CLI runs an example against a local endpoint and prints the reply and the steps', async () => {
  const server = createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      const asked = JSON.parse(body);
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ choices: [{ message: { content: `${req.url} ${asked.model} ${req.headers.authorization}` }, finish_reason: 'stop' }], usage: { prompt_tokens: 3, completion_tokens: 2, total_tokens: 5 } }));
    });
  });
  await new Promise((done) => server.listen(0, '127.0.0.1', done));
  try {
    const bin = fileURLToPath(new URL('../bin/viable-harness.mjs', import.meta.url));
    // The density lab's coach runs locally as it is (the library desk's Knowledge step needs VIABLE).
    const example = fileURLToPath(new URL('../examples/density-lab.json', import.meta.url));
    const env = { ...process.env, OPENAI_BASE_URL: `http://127.0.0.1:${server.address().port}/v1`, OPENAI_API_KEY: 'local' };
    const child = spawn(process.execPath, [bin, 'run', example, '--input', 'Help me narrow my topic', '--model', 'qwen3'], { env });
    let out = '';
    let err = '';
    child.stdout.on('data', (chunk) => { out += chunk; });
    child.stderr.on('data', (chunk) => { err += chunk; });
    const code = await new Promise((done) => child.on('close', done));
    assert.equal(code, 0, err);
    assert.match(out, /^Agent: .+ \(with the teaching settings of "The density lab"\)/);
    assert.match(out, /\/v1\/chat\/completions qwen3 Bearer local/);
    assert.match(out, /Steps:\n {2}1\. input \(input\) completed/);
    assert.match(out, /1 model calls, 5 tokens\./);
  } finally {
    server.close();
  }
});
