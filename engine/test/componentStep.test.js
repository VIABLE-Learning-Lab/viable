import '../../harness/test/no-network.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { callComponent, runAgent } from '../src/index.js';
import { runAgentGraph } from '../src/agents/engine.js';
import { validateGraph } from '../src/agents/graph.js';

const bin = fileURLToPath(new URL('../bin/viable-engine.mjs', import.meta.url));
const fixtures = fileURLToPath(new URL('../../harness/test/fixtures/components/', import.meta.url));
const echo = JSON.parse(readFileSync(new URL('../../harness/test/fixtures/components/echo.json', import.meta.url), 'utf8'));

const hints = (extra = {}) => ({
  id: 'acme/fraction-hints', version: '0.1.0', slot: 'step', label: 'Fraction hints', summary: 'Writes one hint for a fraction problem.',
  runs: { kind: 'http', entry: 'https://hints.example.org/v1/hint' }, receives: ['learner_message', 'reply'], sends_to: ['hints.example.org'],
  uses_models: false, license: { code: 'MIT' }, authors: ['Acme'], cite: 'Acme (2026). Fraction hints.',
  evidence: { original: 'None.', integration: 'None.', unknown: 'Everything.' }, risk: 'high', maintainer: { name: 'Acme' }, harness: '>=0.2.0', ...extra
});
// Input → the component → a reply that reads its answer, or says it failed.
const graph = (config) => ({ entry: 'in', nodes: [
  { id: 'in', type: 'input', next: 'hint' },
  { id: 'hint', type: 'component', config: { manifest: hints(), inputs: { learner_message: '{{input}}' }, ...config }, next: 'reply' },
  { id: 'reply', type: 'output', config: { text: '{{ hint.status == "failed" ? "No hint: " + hint.error.code : hint.output }}' } }
] });
// A scripted component at hints.example.org: answer(body) is what it says back.
function component(answer) {
  const calls = [];
  const fetch = async (url, init) => {
    calls.push({ url, init, body: JSON.parse(init.body) });
    const said = await answer(calls.at(-1).body, init);
    return said instanceof Response ? said : Response.json(said);
  };
  return { fetch, calls };
}

test('a local run sends a component step only the fields its inputs and manifest name, and later steps read its answer', async () => {
  const { fetch, calls } = component((body) => ({ output: `Try a common denominator for “${body.learner_message}”.`, flags: [{ label: 'Stuck', reason: 'Asks for the answer.' }], note: 'kept out' }));
  const doc = graph({ inputs: { learner_message: '{{input}}', reply: '' } });
  const result = await runAgent(doc, { input: 'What is 1/2 + 1/3?', fetch });
  assert.equal(result.output.text, 'Try a common denominator for “What is 1/2 + 1/3?”.');
  assert.equal(calls.length, 1);
  assert.deepEqual([calls[0].url, calls[0].init.method, calls[0].init.redirect], ['https://hints.example.org/v1/hint', 'POST', 'manual']);
  assert.deepEqual(calls[0].body, { learner_message: 'What is 1/2 + 1/3?', reply: '' });
  const step = result.steps.find((item) => item.nodeId === 'hint');
  assert.deepEqual(step.input, { component: 'acme/fraction-hints@0.1.0', entry: 'https://hints.example.org/v1/hint', inputs: { learner_message: 'What is 1/2 + 1/3?', reply: '' } });
  assert.deepEqual(result.outputs.hint, { output: 'Try a common denominator for “What is 1/2 + 1/3?”.', flags: [{ label: 'Stuck', reason: 'Asks for the answer.' }], component: 'acme/fraction-hints@0.1.0', status: 'completed' });
  assert.equal(result.modelCalls, 0);
});

test('a component that fails, times out or is refused stops the run, or with on_error continue goes on without its answer', async () => {
  const broken = component(() => new Response('{}', { status: 500 }));
  await assert.rejects(runAgent(graph(), { input: 'Hi', fetch: broken.fetch }), (error) => error.code === 'component_failed' && error.status === 502 && /Component step "hint": acme\/fraction-hints answered with status 500/.test(error.message));
  const kept = await runAgent(graph({ on_error: 'continue' }), { input: 'Hi', fetch: broken.fetch });
  assert.equal(kept.output.text, 'No hint: component_failed');
  assert.deepEqual(kept.steps.map((step) => [step.nodeId, step.status]), [['in', 'completed'], ['hint', 'failed'], ['reply', 'completed']]);
  assert.deepEqual(kept.outputs.hint.error, { code: 'component_failed', message: 'acme/fraction-hints answered with status 500.' });

  const shapeless = component(() => ({ hint: 'no output field' }));
  assert.equal((await runAgent(graph({ on_error: 'continue' }), { input: 'Hi', fetch: shapeless.fetch })).output.text, 'No hint: component_failed');

  // The call ends with the run: a component slower than the run's time left times out.
  const slow = component((_, init) => new Promise((resolve, reject) => init.signal.addEventListener('abort', () => reject(init.signal.reason))));
  const services = { callComponent: (manifest, payload, options) => callComponent(manifest, payload, { ...options, fetch: slow.fetch }) };
  const timed = await runAgentGraph({}, graph({ on_error: 'continue' }), { input: 'Hi', budgets: { timeoutMs: 300 }, services });
  assert.equal(timed.output.text, 'No hint: component_timeout');

  // A host's own rules can refuse an entry the manifest allows; nothing is sent.
  const refusing = { callComponent: async () => { throw Object.assign(new Error('acme/fraction-hints\'s entry can\'t be called here.'), { code: 'component_refused' }); } };
  await assert.rejects(runAgentGraph({}, graph(), { input: 'Hi', services: refusing }), (error) => error.code === 'component_refused' && error.status === 422);
  assert.equal((await runAgentGraph({}, graph({ on_error: 'continue' }), { input: 'Hi', services: refusing })).output.text, 'No hint: component_refused');
});

test('a run without a component service fails saying so, whatever on_error says', async () => {
  await assert.rejects(runAgentGraph({}, graph({ on_error: 'continue' }), { input: 'Hi' }), (error) => error.code === 'host_service_missing' && /no component service/.test(error.message));
});

test('an mcp component step runs as a stdio server started in the agent’s folder', async () => {
  const doc = (mode, config = {}) => ({ entry: 'in', nodes: [
    { id: 'in', type: 'input', next: 'echo' },
    { id: 'echo', type: 'component', config: { manifest: { ...echo, runs: { ...echo.runs, server: { command: 'node', args: ['mcp-server.mjs', mode] } } }, inputs: { reply: '{{input}}' }, ...config }, next: 'reply' },
    { id: 'reply', type: 'output', config: { text: '{{ echo.status == "failed" ? echo.error.message : echo.output.received.reply }}' } }
  ] });
  const named = { dir: fixtures, allowComponents: ['fixture/echo'] };
  const result = await runAgent(doc('echo'), { input: 'What have you tried?', ...named });
  assert.equal(result.output.text, 'What have you tried?');
  assert.deepEqual(result.outputs.echo.flags, [{ label: 'Echoed', reason: 'The fixture answers with what it got.' }]);
  assert.ok(!result.outputs.echo.output.env.includes('OPENAI_API_KEY'));
  await assert.rejects(runAgent(doc('fail'), { input: 'Hi', ...named }), (error) => error.code === 'component_failed' && /tool failed: The fixture refuses/.test(error.message));
  assert.match((await runAgent(doc('crash', { on_error: 'continue' }), { input: 'Hi', ...named })).output.text, /exit code 3/);
});

test('validation checks a component step’s manifest, its slot, how it runs, and the fields its inputs name', () => {
  const details = (config, options) => {
    try { validateGraph(graph(config), options); return []; } catch (error) { return error.details; }
  };
  assert.deepEqual(details({}), []);
  assert.deepEqual(details({ manifest: undefined }), ['Component node "hint" requires config.manifest, the component\'s manifest as JSON (schemas/component.schema.json).']);
  assert.deepEqual(details({ manifest: hints({ risk: 'none' }) }), ['Component node "hint" manifest $.risk: must be one of "low", "medium", "high".']);
  assert.match(details({ manifest: hints({ slot: 'judge' }) })[0], /a judge component; a Component step runs step components/);
  assert.match(details({ manifest: hints({ sends_to: ['other.example.org'] }) })[0], /on hints\.example\.org, which its sends_to doesn't list/);
  assert.match(details({ inputs: { learner_message: '{{input}}', conversation: '{{history}}' } })[0], /sends conversation, which acme\/fraction-hints doesn't receive \(it receives learner_message, reply\)/);
  assert.match(details({ on_error: 'retry' })[0], /on_error must be stop or continue/);
  assert.deepEqual(details({ manifest: echo, inputs: { reply: '{{input}}' } }), []);
  assert.deepEqual(details({ manifest: echo, inputs: { reply: '{{input}}' } }, { componentRuns: ['http'] }), ['Component node "hint" runs fixture/echo over mcp, which this host can\'t: it runs only http components. An MCP server runs with viable-harness on your own machine.']);
});

test('viable-engine run runs a graph with a component step', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'component-step-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const manifest = { ...echo, runs: { ...echo.runs, server: { command: process.execPath, args: [join(fixtures, 'mcp-server.mjs'), 'echo'] } } };
  const agent = { format: 'viable.agent', version: 1, name: 'Echo', graph: { entry: 'in', nodes: [
    { id: 'in', type: 'input', next: 'echo' },
    { id: 'echo', type: 'component', config: { manifest, inputs: { reply: '{{input}}' } }, next: 'reply' },
    { id: 'reply', type: 'output', config: { text: 'Echoed: {{echo.output.received.reply}}' } }
  ] } };
  writeFileSync(join(dir, 'echo.agent.json'), JSON.stringify(agent));
  const run = spawnSync(process.execPath, [bin, 'run', join(dir, 'echo.agent.json'), '--input', 'Hello', '--allow-component', 'fixture/echo'], { encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /Echoed: Hello/);
  assert.match(run.stdout, /2\. echo \(component\) completed in \d+ ms\n {7}flag: Echoed: The fixture answers with what it got\./);
});
