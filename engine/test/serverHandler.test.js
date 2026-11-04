// The web-standard server: what a Worker or a function runs, with no Node built-ins and no disk.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHandler } from '../src/server/handler.js';
import { fileStore } from '../../harness/src/store/fileStore.js';
import { storeMemory } from '../src/server/memory.js';
import { agentsToServe, createRuntime, readPackage } from '../src/server/runtime.js';
import { memoryStore } from '../../harness/src/store/store.js';
import { zipFile } from './zipFile.js';

const SRC = fileURLToPath(new URL('../src/', import.meta.url));
const reply = (content) => new Response(JSON.stringify({ choices: [{ message: { role: 'assistant', content }, finish_reason: 'stop' }], usage: { prompt_tokens: 3, completion_tokens: 2, total_tokens: 5 } }), { status: 200, headers: { 'content-type': 'application/json' } });
const graph = { entry: 'write', nodes: [{ id: 'write', type: 'llm', config: { model: 'gpt-x' }, next: 'out' }, { id: 'out', type: 'output', config: { text: '{{write.content}}' } }] };
const file = (name = 'sea.agent.json') => ({ doc: { format: 'viable.agent', format_version: 1, name: 'Sea', graph }, file: name, name });
const post = (path, body, headers = {}) => new Request(`http://localhost${path}`, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body) });

function server(options = {}) {
  const calls = [];
  const runtime = createRuntime({ baseUrl: 'https://models.example/v1', apiKey: 'k', fetch: async (url, init) => { calls.push({ url, body: JSON.parse(init.body) }); return reply('Tide.'); } });
  return { calls, handle: createHandler({ agents: agentsToServe([file()]), runtime, options: { log: () => {}, ...options.handler }, ...options.server }) };
}

test('nothing the handler, runtime, memory or memory store reach imports a Node built-in', () => {
  const seen = new Set();
  const visit = (path) => {
    if (seen.has(path)) return;
    seen.add(path);
    for (const [, spec] of readFileSync(path, 'utf8').matchAll(/(?:\bfrom\s*|\bimport\s*\(\s*|^\s*import\s*)['"]([^'"]+)['"]/gm)) {
      assert.ok(!spec.startsWith('node:'), `${path} imports ${spec}`);
      if (spec.startsWith('.')) visit(resolve(dirname(path), spec));
    }
  };
  for (const name of ['server/app.js', 'server/handler.js', 'server/runtime.js', 'server/search.js', 'server/memory.js', '../../harness/src/store/store.js']) visit(join(SRC, name));
  assert.ok([...seen].some((path) => path.endsWith('agents/engine.js')), 'it reaches the engine');
});

test('a Request is answered with a Response: a run, its record read back, and an unknown route', async () => {
  const { handle, calls } = server();
  const response = await handle(post('/v1/agents/sea/runs', { input: 'Why tides?' }));
  assert.equal(response.status, 200);
  assert.match(response.headers.get('x-request-id'), /^[0-9a-f-]{36}$/);
  const run = await response.json();
  assert.equal(run.output.text, 'Tide.');
  assert.equal(calls[0].url, 'https://models.example/v1/chat/completions');
  const read = await handle(new Request(`http://localhost/v1/agents/sea/runs/${run.run_id}`));
  assert.equal((await read.json()).output.text, 'Tide.');
  const missing = await handle(new Request('http://localhost/nope'));
  assert.equal(missing.status, 404);
  assert.equal((await missing.json()).error.code, 'not_found');
});

test('a token guards all but health, and a wrong one is told apart from none', async () => {
  const { handle } = server({ handler: { token: 'secret' } });
  assert.equal((await handle(new Request('http://localhost/health'))).status, 200);
  const none = await handle(post('/v1/agents/sea/runs', { input: 'hi' }));
  assert.equal(none.status, 401);
  assert.match((await none.json()).error.message, /Missing token/);
  assert.match((await (await handle(post('/v1/agents/sea/runs', { input: 'hi' }, { authorization: 'Bearer wrong' }))).json()).error.message, /Invalid token/);
  assert.equal((await handle(post('/v1/agents/sea/runs', { input: 'hi' }, { authorization: 'Bearer secret' }))).status, 200);
});

test('a body past the limit is refused while it is read, whatever Content-Length says', async () => {
  const { handle } = server({ handler: { maxBodyBytes: 10 } });
  const body = new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode('x'.repeat(50))); controller.close(); } });
  const response = await handle(new Request('http://localhost/v1/agents/sea/runs', { method: 'POST', headers: { 'content-type': 'application/json' }, body, duplex: 'half' }));
  assert.equal(response.status, 413);
  assert.equal((await response.json()).error.code, 'agent_input_too_large');
});

test('extra routes come first, with the server’s parts, and a route that passes falls through', async () => {
  const seen = [];
  const route = (ctx) => async (request, url, context) => {
    seen.push(context.address);
    if (url.pathname === '/health') return null;
    if (url.pathname !== '/page') return null;
    const agent = ctx.served.get('sea');
    const result = await ctx.runTurn(agent, { text: 'From a page.', history: [], context: null, user: null });
    return ctx.json(200, { said: result.output.text, agents: ctx.served.size });
  };
  const { handle } = server({ handler: { token: 'secret' }, server: { routes: [route] } });
  const page = await handle(new Request('http://localhost/page'), { address: '203.0.113.9' });
  assert.deepEqual(await page.json(), { said: 'Tide.', agents: 1 });
  assert.ok(page.headers.get('x-request-id'));
  assert.equal(seen[0], '203.0.113.9');
  assert.equal((await handle(new Request('http://localhost/health'))).status, 200);
});

test('runs in a store are read back by another process’s handler', async () => {
  const store = memoryStore();
  const first = server({ server: { store } });
  const { run_id: id } = await (await first.handle(post('/v1/agents/sea/runs', { input: 'hi' }))).json();
  assert.deepEqual(await store.list('runs/'), [`runs/${id}`]);
  const second = server({ server: { store } });
  assert.equal((await (await second.handle(new Request(`http://localhost/v1/agents/sea/runs/${id}`))).json()).id, id);
});

test('streaming is a ReadableStream of VIABLE’s events, and work goes on through waitUntil', async () => {
  const { handle } = server();
  const waited = [];
  const response = await handle(post('/v1/agents/sea/runs', { input: 'hi', stream: true }), { waitUntil: (promise) => waited.push(promise) });
  assert.match(response.headers.get('content-type'), /event-stream/);
  const events = [...(await response.text()).matchAll(/^event: (.+)$/gm)].map((match) => match[1]);
  assert.equal(events[0], 'run.started');
  assert.equal(events.at(-1), 'run.completed');
  assert.equal(waited.length, 1);
});

test('a package’s knowledge is searched from the bytes of its zip, with no disk', async () => {
  const pkg = { format: 'viable.course-package', version: 1, course: { title: 'Sea' }, files: [{ ref: 'f1', name: 'tides.md', path: 'files/tides.md' }], knowledge_bases: [{ ref: 'kb-1', name: 'Sea', file_refs: ['f1'] }], agents: [{ ref: 'a1', slug: 'sea', name: 'Sea', graph: { entry: 'look', nodes: [{ id: 'look', type: 'knowledge', config: { knowledge_base_refs: ['kb-1'] }, next: 'write' }, { id: 'write', type: 'llm', config: { model: 'gpt-x', system: '{{look.context}}' }, next: 'out' }, { id: 'out', type: 'output', config: { text: '{{write.content}}' } }] } }] };
  const zip = zipFile([{ name: 'package.viable.json', data: JSON.stringify(pkg) }, { name: 'files/tides.md', data: '# Tides\n\nThe moon pulls the sea, and the tide rises twice a day along this coast.' }]);
  const read = await readPackage(zip, 'sea.viable.zip');
  assert.equal(read.doc.agents[0].slug, 'sea');
  const calls = [];
  const runtime = createRuntime({ baseUrl: 'https://models.example/v1', fetch: async (url, init) => { calls.push(JSON.parse(init.body)); return reply('Twice a day.'); } });
  const handle = createHandler({ agents: agentsToServe([{ ...read, file: 'sea.viable.zip' }]), runtime, options: { log: () => {} } });
  const answered = await (await handle(post('/v1/agents/sea/runs', { input: 'moon tide' }))).json();
  assert.equal(answered.output.text, 'Twice a day.');
  assert.match(JSON.stringify(calls[0].messages), /twice a day/);
});

test('memory in a store: saved, recalled, forgotten by deleting the key, and never by a name', async () => {
  const store = memoryStore();
  const memory = storeMemory(store);
  await memory.save('s-1', ['Likes tides']);
  assert.deepEqual((await memory.recall('s-1', 'tides')).map((item) => item.content), ['Likes tides']);
  await assert.rejects(memory.list('Ada Lovelace'), /pseudonymous/);
  await store.delete('memory/s-1');
  assert.deepEqual(await memory.list('s-1'), []);
});

test('fileStore keeps JSON per key, escapes keys, lists by prefix, and never climbs out of its folder', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'viable-harness-store-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const store = fileStore(join(dir, 'data'));
  assert.equal(await store.get('none/here'), null);
  assert.deepEqual(await store.list(), []);
  await store.put('runs/a:1', { n: 1 });
  await store.put('memory/s-1', [1, 2]);
  assert.deepEqual(await store.get('runs/a:1'), { n: 1 });
  assert.deepEqual(await store.list('runs/'), ['runs/a:1']);
  await assert.rejects(store.put('../outside', {}), /can't be a store key/);
  await store.delete('runs/a:1');
  await store.delete('runs/a:1');
  assert.deepEqual(await store.list(), ['memory/s-1']);
});

// Conversations: what a store keeps, as VIABLE keeps it.
function keeper(graphToServe, options = {}) {
  const calls = [];
  const store = options.store || memoryStore();
  const runtime = createRuntime({ baseUrl: 'https://models.example/v1', fetch: async (url, init) => { calls.push(JSON.parse(init.body)); return reply(options.reply || 'Noted.'); }, memory: options.memory ? storeMemory(store) : null });
  const agents = agentsToServe([{ doc: { format: 'viable.agent', name: 'Sea', graph: graphToServe }, file: 'sea.agent.json', name: 'sea.agent.json' }, { doc: { format: 'viable.agent', name: 'Other', graph }, file: 'other.agent.json', name: 'other.agent.json' }]);
  return { calls, store, handle: createHandler({ agents, runtime, store, options: { log: () => {}, ...options.handler } }) };
}
const ask = async (handle, body, agent = 'sea') => {
  const response = await handle(post(`/v1/agents/${agent}/runs`, body));
  return { status: response.status, body: await response.json() };
};

test('with a store, a turn starts a conversation and the next continues it; without one, conversation_id is refused', async () => {
  const { handle, calls, store } = keeper(graph);
  const first = await ask(handle, { input: 'Why tides?', user: 's-1' });
  assert.match(first.body.conversation_id, /^agtc_[0-9a-f]{32}$/);
  const second = await ask(handle, { input: 'And waves?', conversation_id: first.body.conversation_id });
  assert.equal(second.body.conversation_id, first.body.conversation_id);
  assert.deepEqual(calls[1].messages.filter((item) => item.role !== 'system').map((item) => item.content), ['Why tides?', 'Noted.', 'And waves?']);
  const held = await store.get(`conversations/${first.body.conversation_id}`);
  assert.equal(held.count, 4);
  assert.equal(held.user, 's-1');
  assert.equal((await (await handle(new Request(`http://localhost/v1/agents/sea/runs/${second.body.run_id}`))).json()).conversation_id, first.body.conversation_id);

  const { handle: stateless } = server();
  const refused = await (await stateless(post('/v1/agents/sea/runs', { input: 'hi', conversation_id: first.body.conversation_id }))).json();
  assert.equal(refused.error.code, 'unsupported_agent_parameter');
});

test('a conversation belongs to its agent, its ID is checked, and client history keeps nothing', async () => {
  const { handle, store } = keeper(graph);
  const { body } = await ask(handle, { input: 'hi' });
  const elsewhere = await ask(handle, { input: 'hi', conversation_id: body.conversation_id }, 'other');
  assert.equal(elsewhere.status, 404);
  assert.equal(elsewhere.body.error.code, 'agent_conversation_not_found');
  assert.equal((await ask(handle, { input: 'hi', conversation_id: '../../secrets' })).status, 404);
  assert.equal((await ask(handle, { input: 'hi', conversation_id: body.conversation_id, history_mode: 'none' })).status, 400);
  const client = await ask(handle, { messages: [{ role: 'user', content: 'a' }, { role: 'assistant', content: 'b' }, { role: 'user', content: 'c' }], history_mode: 'client' });
  assert.equal(client.body.conversation_id, null);
  assert.equal((await store.list('conversations/')).length, 1);
  assert.equal((await ask(handle, { messages: [{ role: 'user', content: 'a' }, { role: 'user', content: 'c' }], conversation_id: body.conversation_id })).status, 400);
});

test('messages before the last start a new conversation, which later turns read', async () => {
  const { handle, calls } = keeper(graph);
  const { body } = await ask(handle, { messages: [{ role: 'user', content: 'seed' }, { role: 'assistant', content: 'ok' }, { role: 'user', content: 'next' }] });
  await ask(handle, { input: 'later', conversation_id: body.conversation_id });
  assert.deepEqual(calls[1].messages.filter((item) => item.role !== 'system').map((item) => item.content), ['seed', 'ok', 'next', 'Noted.', 'later']);
});

test('an Ask step waits for the next message, and State lasts between turns', async () => {
  const asking = { entry: 'set', nodes: [
    { id: 'set', type: 'state', config: { scope: 'conversation', assignments: [{ name: 'seen', value: 'yes' }] }, next: 'ask' },
    { id: 'ask', type: 'ask', config: { text: 'Which coast?' }, next: 'out' },
    { id: 'out', type: 'output', config: { text: 'You said {{ask.answer}}, state {{vars.seen}}' } }
  ] };
  const { handle } = keeper(asking);
  const first = await ask(handle, { input: 'start' });
  assert.equal(first.body.output.awaiting_input, true);
  assert.equal(first.body.output.text, 'Which coast?');
  const second = await ask(handle, { input: 'West', conversation_id: first.body.conversation_id });
  assert.equal(second.body.output.text, 'You said West, state yes');
});

test('turns in one conversation run one at a time, so neither is lost', async () => {
  const { handle, store } = keeper(graph);
  const { body } = await ask(handle, { input: 'one' });
  await Promise.all([ask(handle, { input: 'two', conversation_id: body.conversation_id }), ask(handle, { input: 'three', conversation_id: body.conversation_id })]);
  const held = await store.get(`conversations/${body.conversation_id}`);
  assert.equal(held.count, 6);
  assert.deepEqual(held.messages.filter((item) => item.role === 'user').map((item) => item.content), ['one', 'two', 'three']);
});

test('a failed first turn leaves no conversation, and one the store can’t keep still answers', async () => {
  const store = memoryStore();
  const runtime = createRuntime({ baseUrl: 'https://models.example/v1', fetch: async () => new Response(JSON.stringify({ error: { message: 'down' } }), { status: 500 }) });
  const handle = createHandler({ agents: agentsToServe([file()]), runtime, store, options: { log: () => {} } });
  assert.equal((await handle(post('/v1/agents/sea/runs', { input: 'hi' }))).status, 502);
  assert.deepEqual(await store.list('conversations/'), []);

  const broken = { ...memoryStore(), put: async () => { throw new Error('the store is full'); }, get: async () => null };
  const { handle: still } = keeper(graph, { store: broken, reply: 'Still here.' });
  const errors = [];
  const original = console.error;
  console.error = (line) => errors.push(line);
  try {
    assert.equal((await ask(still, { input: 'hi' })).body.output.text, 'Still here.');
  } finally { console.error = original; }
  assert.ok(errors.some((line) => /the store is full/.test(line)));
  assert.ok(!errors.join().includes('hi'), 'what the learner wrote stays out of the log');
});

test('a long conversation is cut to fit one record, its count still true', async () => {
  const { handle, store } = keeper(graph);
  const { body } = await ask(handle, { input: 'x'.repeat(400 * 1024) }, 'sea');
  for (const n of [1, 2, 3]) await ask(handle, { input: `${n}${'y'.repeat(400 * 1024)}`, conversation_id: body.conversation_id });
  const held = await store.get(`conversations/${body.conversation_id}`);
  assert.equal(held.count, 8);
  assert.ok(new TextEncoder().encode(JSON.stringify(held)).length < 950 * 1024);
  assert.ok(held.messages.at(-2).content.startsWith('3y'), 'the newest stay');
});

test('keepDays: past it a conversation and a run are gone, and sweep deletes them', async () => {
  const { handle, store } = keeper(graph, { handler: { keepDays: 30 } });
  const { body } = await ask(handle, { input: 'old' });
  const { body: fresh } = await ask(handle, { input: 'new' });
  const key = `conversations/${body.conversation_id}`;
  await store.put(key, { ...await store.get(key), updated_at: '2020-01-01T00:00:00.000Z' });
  const runKey = `runs/${body.run_id}`;
  await store.put(runKey, { ...await store.get(runKey), completed_at: '2020-01-01T00:00:00.000Z' });
  assert.equal((await ask(handle, { input: 'hi', conversation_id: body.conversation_id })).status, 404);
  assert.equal((await handle(new Request(`http://localhost/v1/agents/sea/runs/${body.run_id}`))).status, 404);
  assert.deepEqual(await handle.sweep(), { deleted: 2 });
  assert.equal(await store.get(key), null);
  assert.ok(await store.get(`conversations/${fresh.conversation_id}`), 'what is younger stays');
});

test('a server says what it is running, behind its token', async () => {
  const { handle } = server({ handler: { token: 'secret' } });
  assert.equal((await handle(new Request('http://localhost/v1/server'))).status, 401);
  const said = await (await handle(new Request('http://localhost/v1/server', { headers: { authorization: 'Bearer secret' } }))).json();
  assert.equal(said.object, 'server');
  assert.equal(said.conversations, false);
  assert.equal(said.packages[0].file, 'sea.agent.json');
  assert.equal(said.packages[0].title, 'Sea');
});

test('a host that requires a token refuses every agent call until it has one, and says what to do', async () => {
  const { handle } = server({ handler: { requireToken: true } });
  assert.equal((await handle(new Request('http://localhost/health'))).status, 200);
  const refused = await handle(post('/v1/agents/sea/runs', { input: 'hi' }));
  assert.equal(refused.status, 503);
  const { error } = await refused.json();
  assert.equal(error.code, 'token_not_set');
  assert.match(error.message, /VIABLE_ENGINE_TOKEN/);
});
