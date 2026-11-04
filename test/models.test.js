// Replacing the models a package names: by role, by name, and the warning when a reviewer stops being a second model.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_VETTING_REVIEWER } from '../src/agents/graph.js';
import { runAgent } from '../src/run.js';
import { applyModels, mapOf, modelPlan, modelWarnings, stepModels } from '../src/server/models.js';

const CLI = fileURLToPath(new URL('../bin/viable-harness.mjs', import.meta.url));
const graph = { entry: 'route', nodes: [
  { id: 'route', type: 'router', config: { model: 'helper-1', routes: [{ name: 'a' }] }, branches: { a: 'write' }, next: 'write' },
  { id: 'write', type: 'vetting', config: { model: 'writer-1', verification_model: 'review-1', guideline: 'Be kind.' }, next: 'plain' },
  { id: 'plain', type: 'vetting', config: { model: 'writer-1', guideline: 'Be brief.' }, next: 'say' },
  { id: 'say', type: 'speech', config: { model: 'voice-1' }, next: 'draw' },
  { id: 'draw', type: 'image', config: { model: 'paint-1', prompt: 'x' }, next: 'out' },
  { id: 'out', type: 'output', config: { text: 'done' } }
] };

test('stepModels names every model by role, with the default reviewer a step gets if it names none', () => {
  const found = stepModels(graph).map((item) => [item.step, item.role, item.model]);
  assert.deepEqual(found, [['route', 'helper', 'helper-1'], ['write', 'reply', 'writer-1'], ['write', 'reviewer', 'review-1'], ['plain', 'reply', 'writer-1'], ['plain', 'reviewer', DEFAULT_VETTING_REVIEWER], ['say', 'speech', 'voice-1'], ['draw', 'image', 'paint-1']]);
});

test('a plan replaces by role and by name; reviewer wins over map, and map over its role', () => {
  const models = (plan) => Object.fromEntries(stepModels(applyModels(graph, plan)).map((item) => [`${item.step}.${item.field}`, item.model]));
  assert.equal(models(modelPlan({ model: 'x' }))['write.verification_model'], 'x', '--model replaces the reviewer too');
  assert.equal(models(modelPlan({ model: 'x' }))['route.model'], 'x', 'and every chat model');
  assert.equal(models(modelPlan({ model: 'x' }))['say.model'], 'voice-1', 'but not speech');
  const both = models(modelPlan({ model: 'x', reviewerModel: 'y' }));
  assert.equal(both['write.model'], 'x');
  assert.equal(both['write.verification_model'], 'y');
  assert.equal(both['plain.verification_model'], 'y');
  const mapped = models(modelPlan({ model: 'x', map: { 'writer-1': 'w', 'review-1': 'r' } }));
  assert.equal(mapped['write.model'], 'w');
  assert.equal(mapped['write.verification_model'], 'r');
  assert.equal(mapped['route.model'], 'x');
  assert.equal(models(modelPlan({ map: { 'review-1': 'r' }, reviewerModel: 'chosen' }))['write.verification_model'], 'chosen');
  const file = models(modelPlan({ models: { reply: 'a', reviewer: 'b', speech: 's', image: 'i', map: { 'helper-1': 'h' } } }));
  assert.deepEqual([file['write.model'], file['write.verification_model'], file['say.model'], file['draw.model'], file['route.model']], ['a', 'b', 's', 'i', 'h']);
  assert.equal(models(modelPlan({ models: { reply: { 'writer-1': 'just-this' } } }))['write.model'], 'just-this');
  assert.equal(modelPlan({}), null, 'nothing replaced, no plan');
  assert.equal(applyModels(graph, null), graph);
  assert.equal(graph.nodes[1].config.model, 'writer-1', 'the package itself is untouched');
});

test('a models file or a --map that makes no sense says so', () => {
  assert.throws(() => modelPlan({ models: { chat: 'x' } }), /has no "chat"/);
  assert.throws(() => modelPlan({ models: [] }), /JSON object/);
  assert.throws(() => modelPlan({ models: { reply: '' } }), /must be a model/);
  assert.throws(() => mapOf(['nothing']), /--map takes/);
  assert.deepEqual(mapOf(['a=b', 'c=d']), { a: 'b', c: 'd' });
  assert.equal(mapOf([]), null);
});

test('a reviewer that is the model it checks gets a warning, however it came about', () => {
  const agents = [{ slug: 'sea', graph }];
  assert.deepEqual(modelWarnings(agents, null), []);
  const replaced = modelWarnings(agents, modelPlan({ model: 'x' }));
  assert.equal(replaced.length, 2);
  assert.match(replaced[0], /sea, step "write": the reviewer is x, the same model that writes the reply \(--model replaces the reviewer too\)/);
  assert.match(replaced[0], /--reviewer-model/);
  assert.deepEqual(modelWarnings(agents, modelPlan({ model: 'x', reviewerModel: 'y' })), []);
  assert.equal(modelWarnings(agents, modelPlan({ map: { 'writer-1': 'same', 'review-1': 'same' } })).length, 1, 'a map can do it too, without naming --model');
  assert.equal(modelWarnings([{ slug: 'a', graph: { nodes: [{ id: 'v', type: 'vetting', config: { model: 'm', verification_model: 'm' } }] } }], null).length, 1, 'and so can the package itself');
});

test('a run sends each role’s model to the endpoint, a sub-agent’s and the summary too', async () => {
  const asked = [];
  const fetch = async (_url, init) => {
    const body = JSON.parse(init.body);
    asked.push(body.model);
    return new Response(JSON.stringify({ choices: [{ message: { role: 'assistant', content: 'PASS' }, finish_reason: 'stop' }], usage: {} }), { status: 200 });
  };
  const inner = { entry: 'write', nodes: [{ id: 'write', type: 'llm', config: { model: 'inner-1' }, next: 'out' }, { id: 'out', type: 'output', config: { text: 'ok' } }] };
  const outer = { entry: 'check', nodes: [{ id: 'check', type: 'vetting', config: { model: 'writer-1', verification_model: 'review-1', guideline: 'Be kind.' }, next: 'sub' }, { id: 'sub', type: 'subagent', config: { slug: 'inner' }, next: 'out' }, { id: 'out', type: 'output', config: { text: 'done' } }] };
  const pkg = { format: 'viable.course-package', version: 1, course: { title: 'Sea' }, agents: [{ ref: 'outer', name: 'Outer', graph: outer }, { ref: 'inner', name: 'Inner', graph: inner }] };
  const result = await runAgent(pkg, { input: 'hi', fetch, baseUrl: 'https://models.example/v1', models: modelPlan({ map: { 'writer-1': 'w', 'inner-1': 'i' }, reviewerModel: 'r' }) });
  assert.deepEqual(asked, ['w', 'r', 'i']);
  assert.equal(result.steps.find((step) => step.nodeType === 'vetting').model, 'w');
});

test('the CLI maps models on serve and warns when a reviewer stops being a second model', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'viable-harness-models-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const asked = [];
  const stub = createServer((req, res) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      asked.push(JSON.parse(Buffer.concat(chunks).toString()).model);
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content: 'PASS' }, finish_reason: 'stop' }], usage: {} }));
    });
  });
  await new Promise((resolve) => { stub.listen(0, '127.0.0.1', resolve); });
  t.after(() => stub.close());
  const file = join(dir, 'sea.agent.json');
  writeFileSync(file, JSON.stringify({ format: 'viable.agent', name: 'Sea', graph: { entry: 'v', nodes: [{ id: 'v', type: 'vetting', config: { model: 'writer-1', verification_model: 'review-1', guideline: 'Be kind.' }, next: 'out' }, { id: 'out', type: 'output', config: { text: '{{v.content}}' } }] } }));
  writeFileSync(join(dir, 'models.json'), JSON.stringify({ map: { 'writer-1': 'w' } }));
  const child = spawn(process.execPath, [CLI, 'serve', file, '--port', '0', '--models', join(dir, 'models.json'), '--map', 'review-1=w'], { env: { ...process.env, OPENAI_BASE_URL: `http://127.0.0.1:${stub.address().port}/v1` } });
  t.after(() => child.kill());
  let said = '';
  const url = await new Promise((resolve, reject) => {
    child.stderr.on('data', (chunk) => {
      said += chunk;
      const found = /at (http:\/\/127\.0\.0\.1:\d+)/.exec(said);
      if (found && /Warning:/.test(said)) resolve(found[1]);
    });
    child.on('exit', () => reject(new Error(said)));
  });
  assert.match(said, /Warning: sea, step "v": the reviewer is w, the same model that writes the reply/);
  const response = await globalThis.fetch(`${url}/v1/agents/sea/runs`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ input: 'hi' }) });
  assert.equal(response.status, 200);
  assert.deepEqual(asked, ['w', 'w']);
});

test('--keep-days needs --data-dir, and a bad models file stops the command', () => {
  const noDir = spawnSync(process.execPath, [CLI, 'serve', fileURLToPath(new URL('../examples/argument-writing.json', import.meta.url)), '--keep-days', '5'], { encoding: 'utf8' });
  assert.equal(noDir.status, 1);
  assert.match(noDir.stderr, /--keep-days deletes what --data-dir keeps/);
});
