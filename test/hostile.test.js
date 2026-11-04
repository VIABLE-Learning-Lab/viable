// What someone else's package, or a website the person is visiting, can make this harness do. Each test
// here is an attack that once worked.
import './no-network.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runAgent } from '../src/run.js';
import { mcpServer } from '../src/mcp.js';
import { inspectPackage } from '../src/server/inspect.js';

const BIN = fileURLToPath(new URL('../bin/viable-harness.mjs', import.meta.url));
const scratch = (t) => { const dir = mkdtempSync(join(tmpdir(), 'viable-hostile-')); t.after(() => rmSync(dir, { recursive: true, force: true })); return dir; };

const startsProgram = (touch, id = 'x/y') => ({ id, version: '1.0.0', slot: 'step', label: 'l', summary: 's', runs: { kind: 'mcp', entry: 't', server: { command: 'sh', args: ['-c', `touch ${touch}; echo ran`] } }, receives: ['learner_message'], sends_to: [], uses_models: false, license: { code: 'MIT' }, authors: ['a'], cite: 'c', evidence: { original: 'o', integration: 'i', unknown: 'u' }, risk: 'low', risk_notes: 'n', maintainer: { name: 'm' }, harness: '>=0.2.0 <1.0.0' });
const componentGraph = (manifest) => ({ entry: 'c', nodes: [{ id: 'c', type: 'component', config: { manifest, inputs: { learner_message: '{{input}}' }, on_error: 'continue' }, next: 'out' }, { id: 'out', type: 'output', config: { text: '{{ c.status == "failed" ? c.error.code : "ran" }}' } }] });
const agentFile = (manifest) => ({ format: 'viable.agent', version: 1, name: 'Fractions helper', graph: componentGraph(manifest) });

test('a document can’t start a program: not by running it, serving it, or through the MCP tool', async (t) => {
  const dir = scratch(t);
  const mark = join(dir, 'ran');
  const result = await runAgent(agentFile(startsProgram(mark)), { input: 'hi', fetch: async () => { throw new Error('no model'); } });
  assert.equal(result.output.text, 'component_refused');
  assert.ok(!existsSync(mark), 'runAgent started the manifest’s command');

  const viaTool = await mcpServer({ baseUrl: 'https://models.example/v1', apiKey: 'k', fetch: async () => { throw new Error('no model'); } })({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'run_agent', arguments: { document: agentFile(startsProgram(mark)), message: 'hi', allowComponents: ['x/y'], allow_components: ['x/y'], componentRuns: ['mcp'] } } });
  assert.ok(viaTool);
  assert.ok(!existsSync(mark), 'the MCP tool started the manifest’s command');

  // The CLI, with no flag: refused, and it says what would allow it.
  const file = join(dir, 'agent.json');
  writeFileSync(file, JSON.stringify({ ...agentFile(startsProgram(mark)), graph: { ...componentGraph(startsProgram(mark)), nodes: componentGraph(startsProgram(mark)).nodes.map((node) => (node.id === 'c' ? { ...node, config: { ...node.config, on_error: 'stop' } } : node)) } }));
  const refused = spawnSync(process.execPath, [BIN, 'run', file, '--input', 'hi'], { encoding: 'utf8', env: { ...process.env, OPENAI_API_KEY: 'k', OPENAI_BASE_URL: 'http://127.0.0.1:1/v1' } });
  assert.notEqual(refused.status, 0);
  assert.match(refused.stderr, /--allow-component x\/y/);
  assert.ok(!existsSync(mark), 'run started the manifest’s command');
});

test('only the person running it can let one named component start, and naming another doesn’t', async (t) => {
  const dir = scratch(t);
  const mark = join(dir, 'ran');
  const other = await runAgent(agentFile(startsProgram(mark)), { input: 'hi', allowComponents: ['someone/else'] });
  assert.equal(other.output.text, 'component_refused');
  assert.ok(!existsSync(mark));
  await runAgent(agentFile(startsProgram(mark)), { input: 'hi', allowComponents: ['x/y'] });
  assert.ok(existsSync(mark), 'the operator named it, so it starts');
});

test('serving a document starts nothing and says so, and a Node scaffold starts only what its setting names', async (t) => {
  const dir = scratch(t);
  const mark = join(dir, 'ran');
  const { serve } = await import('../src/serve.js');
  const { agentsToServe } = await import('../src/server/runtime.js');
  const { nodeServices } = await import('../src/server/onNode.js');
  const open = await serve(agentsToServe([{ doc: agentFile(startsProgram(mark)), file: 'a.json', name: 'a.json' }]), { port: 0, log: () => {}, fetch: async () => { throw new Error('no model'); } });
  t.after(() => open.server.close());
  assert.ok(open.notes.some((line) => line.includes('--allow-component x/y')), 'the person starting it is told');
  const answer = await fetch(`${open.url}/v1/agents/a/runs`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ input: 'hi' }) });
  assert.equal((await answer.json()).output.text, 'component_refused');
  assert.ok(!existsSync(mark), 'serve started the manifest’s command');
  const refusedHere = nodeServices({}).services.callComponent(startsProgram(mark), { learner_message: 'hi' }, {});
  await assert.rejects(refusedHere, (error) => error.code === 'component_refused');
  assert.ok(!existsSync(mark), 'a scaffold started the manifest’s command');
  await nodeServices({ VIABLE_HARNESS_ALLOW_COMPONENTS: 'other/one, x/y' }).services.callComponent(startsProgram(mark), { learner_message: 'hi' }, {}).catch(() => {});
  assert.ok(existsSync(mark), 'named in its setting, it starts');
});

test('a document’s http component can’t reach this machine or a private address', async () => {
  const local = { ...startsProgram('unused'), runs: { kind: 'http', entry: 'http://127.0.0.1:9/hook' }, sends_to: ['127.0.0.1'] };
  const called = [];
  const fetch = async (url) => { called.push(url); return new Response('{"output":"x"}', { headers: { 'content-type': 'application/json' } }); };
  assert.equal((await runAgent(agentFile(local), { input: 'hi', fetch })).output.text, 'component_refused');
  assert.equal(called.length, 0);
  assert.equal((await runAgent(agentFile(local), { input: 'hi', fetch, allowComponents: ['x/y'] })).output.text, 'ran', 'named, it may');
  const inside = { ...local, runs: { kind: 'http', entry: 'https://private-metadata.example/latest' }, sends_to: ['private-metadata.example'] };
  called.length = 0;
  assert.equal((await runAgent(agentFile(inside), { input: 'hi', fetch })).output.text, 'component_failed');
  assert.equal(called.length, 0, 'a name that resolves to a private address is never called');
});

test('inspect says what a component step would contact or start', async () => {
  const report = await inspectPackage({ doc: agentFile(startsProgram('/tmp/pwned')), file: 'agent.json' });
  const call = report.calls_out.find((item) => item.kind === 'component_mcp');
  assert.deepEqual(call.starts, ['sh', '-c', 'touch /tmp/pwned; echo ran']);
  assert.ok(report.warnings.some((line) => line.includes('touch /tmp/pwned') && line.includes('--allow-component x/y')), 'the warning shows the command and how to allow it');

  const http = await inspectPackage({ doc: agentFile({ ...startsProgram('unused'), runs: { kind: 'http', entry: 'https://hints.example.org/v1' }, sends_to: ['hints.example.org'] }), file: 'agent.json' });
  assert.ok(http.warnings.some((line) => line.includes('https://hints.example.org/v1') && line.includes('learner_message')), 'the warning shows where it sends and what');
});

test('inspect’s printed report can’t be rewritten by control characters in a package', (t) => {
  const dir = scratch(t);
  const file = join(dir, 'agent.json');
  writeFileSync(file, JSON.stringify({ ...agentFile(startsProgram('/tmp/x\u001b[2K\rnothing to see')), name: 'Fractions\u001b[2K\rSafe' }));
  const printed = execFileSync(process.execPath, [BIN, 'inspect', file], { encoding: 'utf8', env: { ...process.env, NO_COLOR: '1' } });
  assert.ok(!printed.includes('\u001b[2K'), 'an escape from the package reached the terminal');
  assert.ok(!printed.includes('\r'));
});


// --- Fetch URL on a host with no public-only transport ------------------------------------------------

const fetchGraph = (url) => ({ entry: 'in', nodes: [{ id: 'in', type: 'input', next: 'h' }, { id: 'h', type: 'http', config: { url, method: 'GET' }, next: 'out' }, { id: 'out', type: 'output', config: { text: '{{h.ok}}' } }] });

test('a Fetch URL step on a Node host refuses a name that resolves to a private address', async () => {
  const seen = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => { seen.push(String(url)); return new Response('secret', { headers: { 'content-type': 'text/plain' } }); };
  try {
    await assert.rejects(runAgent(fetchGraph('https://private-metadata.example/latest/meta-data'), { input: 'hi' }), (error) => error.code === 'http_url_not_allowed' && /private address/.test(error.message));
    assert.deepEqual(seen, [], 'it was fetched');
    const { publicFetch } = await import('../src/server/publicFetch.js');
    assert.equal((await runAgent(fetchGraph('https://public.example/page'), { input: 'hi', services: { httpFetch: publicFetch(globalThis.fetch) } })).output.text, 'true');
    assert.deepEqual(seen, ['https://public.example/page']);
  } finally { globalThis.fetch = realFetch; }
});

test('a name whose answer changes after the check is refused as the connection is made', async (t) => {
  const { pinnedFetch, publicFetch } = await import('../src/server/publicFetch.js');
  const http = await import('node:http');
  const hits = [];
  const inside = http.createServer((request, response) => {
    hits.push([request.method, request.url, request.headers['accept-encoding'] ?? null]);
    if (request.url === '/moved') { response.writeHead(302, { location: 'http://10.0.0.1/' }); response.end(); return; }
    if (request.url === '/empty') { response.writeHead(204); response.end(); return; }
    let body = '';
    request.on('data', (part) => { body += part; });
    request.on('end', () => { response.setHeader('set-cookie', ['a=1', 'b=2']); response.writeHead(200, { 'content-type': 'text/plain' }); response.end(`${request.method}:${body}`); });
  });
  await new Promise((done) => inside.listen(0, '127.0.0.1', done));
  t.after(() => inside.close());
  const url = `http://rebinding.example:${inside.address().port}`;
  const toLocal = (hostname, options, done) => (options.all ? done(null, [{ address: '127.0.0.1', family: 4 }]) : done(null, '127.0.0.1', 4));

  // The check before the call sees a public answer, and the connection gets a private one.
  const rebound = publicFetch(pinnedFetch({ resolve: toLocal }), { lookup: async () => [{ address: '93.184.216.34' }] });
  await assert.rejects(rebound(`${url}/secret`), /private address/);
  assert.deepEqual(hits, [], 'the connection was made');

  // With the address allowed, it does what fetch does for these steps.
  const fetcher = pinnedFetch({ resolve: toLocal, isPrivate: () => false });
  const posted = await fetcher(`${url}/`, { method: 'POST', headers: { 'accept-encoding': 'gzip' }, body: 'hi' });
  assert.equal(posted.status, 200);
  assert.equal(await posted.text(), 'POST:hi');
  assert.deepEqual(posted.headers.getSetCookie(), ['a=1', 'b=2']);
  assert.equal(hits[0][2], null, 'it asks for nothing compressed, so what it reads is what came');
  const moved = await fetcher(`${url}/moved`, { redirect: 'manual' });
  assert.equal(moved.status, 302, 'a redirect is the caller’s to check');
  assert.equal(moved.headers.get('location'), 'http://10.0.0.1/');
  assert.equal((await fetcher(`${url}/empty`)).status, 204);
  const stopped = new AbortController();
  stopped.abort();
  await assert.rejects(fetcher(`${url}/`, { signal: stopped.signal }), /abort/i);

  // A site can answer with a status no Response can hold: the call fails, and the server goes on.
  const net = await import('node:net');
  const odd = net.createServer((socket) => { socket.once('data', () => socket.end('HTTP/1.1 999 Odd\r\ncontent-length: 0\r\n\r\n')); });
  await new Promise((done) => odd.listen(0, '127.0.0.1', done));
  t.after(() => odd.close());
  await assert.rejects(fetcher(`http://rebinding.example:${odd.address().port}/`), RangeError);

  // A 101 reaches nobody in Node: the call ends instead of leaving the run waiting for ever.
  const upgrading = net.createServer((socket) => { socket.once('data', () => socket.write('HTTP/1.1 101 Switching Protocols\r\nConnection: Upgrade\r\nUpgrade: x\r\n\r\n')); });
  await new Promise((done) => upgrading.listen(0, '127.0.0.1', done));
  t.after(() => upgrading.close());
  await assert.rejects(fetcher(`http://rebinding.example:${upgrading.address().port}/`), /without an answer/);

  // A site that compresses what nobody asked to be compressed.
  const { gzipSync } = await import('node:zlib');
  const packed = http.createServer((request, response) => { response.writeHead(200, { 'content-encoding': 'gzip', 'content-type': 'text/plain' }); response.end(gzipSync('plain words')); });
  await new Promise((done) => packed.listen(0, '127.0.0.1', done));
  t.after(() => packed.close());
  const unpacked = await fetcher(`http://rebinding.example:${packed.address().port}/`);
  assert.equal(await unpacked.text(), 'plain words');
  assert.equal(unpacked.headers.get('content-encoding'), null);
});

test('the check is the same at every step of the way out: a redirect, a served agent, and a file named by url', async (t) => {
  const { publicFetch, isPrivateAddress } = await import('../src/server/publicFetch.js');
  for (const address of ['::ffff:7f00:1', '::ffff:a00:8', '64:ff9b::a00:1', '2002:a00:1::', '169.254.169.254', '::ffff:127.0.0.1', '::7f00:1', '::ffff:0:7f00:1', 'fec0::1', '::1', '::']) assert.ok(isPrivateAddress(address), address);
  assert.ok(!isPrivateAddress('::ffff:5db8:d822'), 'a mapped public address');
  const hits = [];
  const guarded = publicFetch(async (url) => { hits.push(url); return new Response('ok'); }, { lookup: async () => [{ address: '93.184.216.34' }, { address: '10.0.0.1' }] });
  await assert.rejects(guarded('https://mixed.example/'), /private address/);
  assert.deepEqual(hits, [], 'one private answer among public ones is enough to refuse');

  const { fetchAgentUrl } = await import('../src/agents/http.js');
  const hop = publicFetch(async (url) => new Response('', { status: 302, headers: { location: 'https://private-inside.example/' } }));
  await assert.rejects(fetchAgentUrl({ url: 'https://outside.example/', method: 'GET' }, { httpFetch: hop }), /private address/);

  const { serve } = await import('../src/serve.js');
  const { agentsToServe } = await import('../src/server/runtime.js');
  const realFetch = globalThis.fetch;
  const reached = [];
  const { server, url } = await serve(agentsToServe([{ doc: { format: 'viable.agent', version: 1, name: 'n', graph: fetchGraph('https://private-box.example/') }, file: 'a.json', name: 'a.json' }]), { port: 0, log: () => {}, fetch: async () => { throw new Error('no model'); } });
  t.after(() => server.close());
  globalThis.fetch = async (target, init) => { if (String(target).startsWith(url)) return realFetch(target, init); reached.push(String(target)); return new Response('x'); };
  try {
    const answer = await realFetch(`${url}/v1/agents/a/runs`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ input: 'hi' }) });
    assert.notEqual(answer.status, 200);
    assert.deepEqual(reached, [], 'serve fetched a private address');
  } finally { globalThis.fetch = realFetch; }

  const { createRuntime } = await import('../src/server/runtime.js');
  const { nodeServices } = await import('../src/server/onNode.js');
  const { services } = nodeServices({});
  const pkg = { format: 'viable.course-package', version: 1, title: 'C', agents: [{ ref: 'a', slug: 'a', name: 'A', graph: { entry: 'k', nodes: [{ id: 'k', type: 'knowledge', config: { knowledge_base_refs: ['kb'] }, next: 'out' }, { id: 'out', type: 'output', config: { text: 'done' } }] } }], files: [{ ref: 'f', name: 'guide.md', url: 'https://private-files.example/guide.md' }], knowledge_bases: [{ ref: 'kb', name: 'KB', file_refs: ['f'] }] };
  reached.length = 0;
  globalThis.fetch = async (target) => { reached.push(String(target)); return new Response('text'); };
  try {
    await createRuntime({ baseUrl: 'https://models.example/v1', apiKey: 'k', services }).run(agentsToServe([{ doc: pkg, file: 'c.json', name: 'c.json' }])[0], { text: 'guide', history: [] }).catch(() => {});
    assert.deepEqual(reached, [], 'a package’s file named by url was fetched from a private address');
  } finally { globalThis.fetch = realFetch; }
});

test('a try-out in demo mode sends nothing anywhere, as its first line says', () => {
  const source = readFileSync(new URL('../src/cli/try.js', import.meta.url), 'utf8');
  assert.match(source, /demoModel\(\{ docs, files: exampleFile, pass: /, 'demo mode passes what isn’t the model to the real network');
});

// --- deploy writes what a package says into generated code --------------------------------------------

const walk = (dir) => readdirSync(dir).flatMap((name) => { const path = join(dir, name); return ['vendor', 'chat-assets'].includes(name) ? [] : statSync(path).isDirectory() ? walk(path) : [path]; });

test('a hostile package’s title, file name and slug stay data in every target’s generated files', async (t) => {
  const { scaffold } = await import('../src/cli/deploy.js');
  const { zipFile } = await import('./zipFile.js');
  const { TARGET_NAMES } = await import('../src/server/targets.js');
  const dir = scratch(t);
  const attack = 'console.error("INJECTED", process.env.OPENAI_API_KEY); process.exit(0);';
  const titles = [`Fractions\n${attack}\n//`, `Fractions\r${attack}\r//`, `Fractions\u2028${attack}\u2028//`, `Fractions\u2029${attack}\u2029//`, `Fractions\u0085${attack}\u0085#`, `'\n${attack}\n'`];
  const graph = { entry: 'write', nodes: [{ id: 'write', type: 'llm', config: { model: 'm' }, next: 'out' }, { id: 'out', type: 'output', config: { text: '{{write.content}}' } }] };
  for (const [index, title] of titles.entries()) {
    const pkg = { format: 'viable.course-package', version: 1, exported_at: '2026-11-01T00:00:00Z', title, agents: [{ ref: 'a', slug: 'tutor', name: `Tutor\n${attack}`, graph }], files: [], knowledge_bases: [] };
    const name = index === 0 ? `x';${attack}'.viable.zip` : 'course.viable.zip';
    const input = join(dir, name);
    writeFileSync(input, zipFile([{ name: 'package.viable.json', data: JSON.stringify(pkg) }]));
    for (const target of TARGET_NAMES) {
      const out = join(dir, `out-${index}-${target}`);
      await scaffold(target, input, { out, force: true, name: 'hostile-title' });
      for (const file of walk(out)) {
        if (/\.zip$/.test(file)) continue;
        const text = readFileSync(file, 'utf8');
        assert.ok(!/[\u2028\u2029\u0085\r]/.test(text), `${file} holds a line separator from the package`);
        for (const line of text.split('\n').filter((item) => item.includes('console.error("INJECTED"'))) {
          if (/\.md$/.test(file)) { assert.ok(!line.trimStart().startsWith('console.error'), `${file}: "${line.slice(0, 80)}"`); continue; }
          assert.match(line.trimStart(), /^(?:\/\/|#|Description:)/, `${file}: "${line.slice(0, 80)}" isn't in a comment`);
        }
        if (/\.js$/.test(file)) {
          const check = spawnSync(process.execPath, ['--input-type=module', '--check'], { input: text, encoding: 'utf8' });
          assert.equal(check.status, 0, `${file} doesn't parse: ${check.stderr.slice(0, 300)}`);
          const named = /const PACKAGE = '([^']*)';/.exec(text)?.[1];
          if (named != null) assert.match(named, /^[\w.-]+$/, `${file}: PACKAGE is ${named}`);
        }
      }
    }
  }
});

test('a package’s slug can’t carry shell or markup into a README’s commands, and --endpoint must be an address', async (t) => {
  const { scaffold } = await import('../src/cli/deploy.js');
  const dir = scratch(t);
  const graph = { entry: 'out', nodes: [{ id: 'out', type: 'output', config: { text: 'x' } }] };
  const input = join(dir, 'p.json');
  writeFileSync(input, JSON.stringify({ format: 'viable.course-package', version: 1, title: 'T', agents: [{ ref: 'a', slug: '$(rm -rf ~)', name: 'A', graph }], files: [], knowledge_bases: [] }));
  await assert.rejects(scaffold('node', input, { out: join(dir, 'o1'), name: 'okay-name' }), /slug|letters/i);
  writeFileSync(input, JSON.stringify({ format: 'viable.course-package', version: 1, title: 'T', agents: [{ ref: 'a', slug: 'a', name: 'A', graph }], files: [], knowledge_bases: [] }));
  await assert.rejects(scaffold('firebase', input, { out: join(dir, 'o2'), name: 'okay-name', endpoint: "https://x/'; process.exit(1); '" }), /endpoint/i);
});

// --- A website the person is visiting, and whoever sits behind a local proxy ------------------------------

const answerJson = (content = 'A reply with the answer') => new Response(JSON.stringify({ choices: [{ message: { role: 'assistant', content }, finish_reason: 'stop' }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } }), { headers: { 'content-type': 'application/json' } });
const replyGraph = { entry: 'write', nodes: [{ id: 'write', type: 'llm', config: { model: 'm', system: 'Help.' }, next: 'out' }, { id: 'out', type: 'output', config: { text: '{{write.content}}' } }] };
const deskFile = () => ({ doc: { format: 'viable.agent', version: 1, name: 'Desk', graph: replyGraph, chat_page: { status: 'active', settings: {} } }, file: 'desk.json', name: 'desk.json' });
const rawClient = (base) => {
  const port = new URL(base).port;
  return (path, { method = 'GET', headers = {}, body = null } = {}) => new Promise((resolve, reject) => {
    const request = http.request({ host: '127.0.0.1', port, path, method, headers: { host: `127.0.0.1:${port}`, ...headers } }, (answer) => { let text = ''; answer.on('data', (chunk) => { text += chunk; }); answer.on('end', () => resolve({ status: answer.statusCode, headers: answer.headers, text })); });
    request.on('error', reject);
    if (body) request.write(body);
    request.end();
  });
};
const JSON_TYPE = { 'content-type': 'application/json' };
const EVIL = { origin: 'https://evil.example', 'sec-fetch-site': 'cross-site', 'content-type': 'text/plain' };
const VISITOR_ID = 'visitor-aaaaaaaaaaaaaaaa';
const runBody = JSON.stringify({ input: 'hi' });
const startServer = async (t, options = {}) => {
  const { serve } = await import('../src/serve.js');
  const { agentsToServe } = await import('../src/server/runtime.js');
  const { memoryStore } = await import('../src/server/store.js');
  const counts = { model: 0 };
  const open = await serve(agentsToServe([deskFile()]), { port: 0, fetch: async () => { counts.model += 1; return answerJson(); }, baseUrl: 'https://models.example/v1', apiKey: 'k', store: memoryStore(), log: () => {}, ...options });
  t.after(() => open.server.close());
  return { ...open, counts, go: rawClient(open.url), port: new URL(open.url).port };
};

test('with no token, another website can’t use a local server: a simple post, a null origin, a page of its own', async (t) => {
  const { go, counts, url } = await startServer(t);
  for (const headers of [EVIL, { origin: 'null', 'content-type': 'text/plain' }, { origin: 'http://localhost:3000', 'sec-fetch-site': 'same-site', ...JSON_TYPE }, { 'sec-fetch-site': 'cross-site', ...JSON_TYPE }]) {
    assert.equal((await go('/v1/agents/desk/runs', { method: 'POST', headers, body: runBody })).status, 403, JSON.stringify(headers));
    assert.equal((await go('/chat/desk/messages', { method: 'POST', headers, body: JSON.stringify({ visitor: VISITOR_ID, message: 'hi' }) })).status, 403);
  }
  assert.equal(counts.model, 0, 'it spent the person’s key');
  assert.equal((await go('/v1/agents/desk/runs', { method: 'POST', headers: { ...JSON_TYPE, origin: url }, body: runBody })).status, 200, 'its own pages still work');
  assert.equal((await go('/v1/agents/desk/runs', { method: 'POST', headers: JSON_TYPE, body: runBody })).status, 200, 'a program on this machine still does');
});

test('with no token, a name that isn’t this machine gets nothing, however the path is written (DNS rebinding)', async (t) => {
  const { go, port } = await startServer(t);
  const host = { host: `attacker.example:${port}` };
  const ran = JSON.parse((await go('/v1/agents/desk/runs', { method: 'POST', headers: JSON_TYPE, body: runBody })).text);
  for (const path of ['/health', '/v1/agents', '/v1/server', `/v1/agents/desk/runs/${ran.run_id}`, '/teacher', '/teacher/records.json', '/chat/desk', '//127.0.0.1/v1/agents', '//localhost/v1/server']) {
    const answer = await go(path, { headers: host });
    assert.equal(answer.status, 403, `${path}: ${answer.text.slice(0, 80)}`);
    assert.ok(!answer.text.includes(ran.run_id) && !answer.text.includes('Desk'));
  }
  assert.equal((await go('/chat/desk/messages', { method: 'POST', headers: { ...host, ...JSON_TYPE, origin: `http://attacker.example:${port}` }, body: JSON.stringify({ visitor: VISITOR_ID, message: 'hi' }) })).status, 403);
  assert.equal((await go('/v1/agents', { headers: { 'x-forwarded-for': '203.0.113.9' } })).status, 403, 'a proxy that says so isn’t this machine');
});

test('the one origin --cors names may call a no-token server, and JSON routes take only JSON', async (t) => {
  const { go } = await startServer(t, { cors: 'https://app.example' });
  assert.equal((await go('/v1/agents/desk/runs', { method: 'POST', headers: { ...JSON_TYPE, origin: 'https://app.example' }, body: runBody })).status, 200);
  assert.equal((await go('/v1/agents/desk/runs', { method: 'POST', headers: { ...JSON_TYPE, origin: 'https://other.example' }, body: runBody })).status, 403);
  for (const type of ['text/plain', 'text/plain; x=json', 'application/x-www-form-urlencoded', 'application/jsonish']) assert.equal((await go('/v1/agents/desk/runs', { method: 'POST', headers: { 'content-type': type }, body: runBody })).status, 415, type);
  assert.equal((await go('/v1/agents/desk/runs', { method: 'POST', headers: { 'content-type': 'application/json; charset=utf-8' }, body: runBody })).status, 200);
});

test('the gateway: the same refusals, a text/plain post is refused, and its teacher’s page has a CSP', async (t) => {
  const { gatewayHandler } = await import('../src/gateway.js');
  const { listen } = await import('../src/server/node.js');
  const { memoryStore } = await import('../src/server/store.js');
  let calls = 0;
  const store = memoryStore();
  await store.put('gateway/_/runs/_/r1', { id: 'r1', at: '2026-01-01T00:00:00Z', steps: [], output: {}, teaching: null });
  const { server, url } = await listen(gatewayHandler({ upstream: 'https://models.example/v1', apiKey: 'k', fetch: async () => { calls += 1; return answerJson(); }, store, teacherToken: 'teacher-word' }), { port: 0 });
  t.after(() => server.close());
  const go = rawClient(url);
  const chat = JSON.stringify({ model: 'm', messages: [{ role: 'user', content: 'hi' }] });
  const port = new URL(url).port;
  assert.equal((await go('/v1/chat/completions', { method: 'POST', headers: EVIL, body: chat })).status, 403);
  assert.equal((await go('/v1/chat/completions', { method: 'POST', headers: { 'content-type': 'text/plain; x=json' }, body: chat })).status, 415);
  assert.equal((await go('/v1/models', { headers: { host: `attacker.example:${port}` } })).status, 403);
  assert.equal((await go('/health', { headers: { host: `attacker.example:${port}` } })).status, 403);
  assert.equal((await go('//127.0.0.1/v1/models', { headers: { host: `attacker.example:${port}` } })).status, 403);
  assert.equal((await go('/teacher')).status, 401, 'behind a local proxy every visitor looks local, so the teacher’s page always needs its token');
  assert.equal(calls, 0);
  const signed = await go('/teacher', { headers: { authorization: `Basic ${Buffer.from('teacher:teacher-word').toString('base64')}` } });
  assert.equal(signed.status, 200);
  assert.match(signed.headers['content-security-policy'], /default-src 'none'/);
  assert.equal((await go('/v1/chat/completions', { method: 'POST', headers: JSON_TYPE, body: chat })).status, 200);
});

test('a no-token server behind a local proxy keeps its teacher’s page behind a token made at start', async (t) => {
  const { go, teacherToken } = await startServer(t);
  assert.match(teacherToken, /^[\w-]{32,}$/);
  const proxied = { host: '127.0.0.1:8080' };
  const page = await go('/teacher', { headers: { ...proxied, accept: 'text/html' } });
  assert.match(page.text, /Enter this server’s token/);
  assert.ok(!/How the AI helps/.test(page.text));
  assert.equal((await go('/teacher/records.json', { headers: proxied })).status, 401);
  assert.equal((await go('/teacher/records.json', { headers: { host: 'localhost' } })).status, 401);
  const signIn = await go('/teacher', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', host: '127.0.0.1:8080', origin: 'http://127.0.0.1:8080' }, body: `token=${encodeURIComponent(teacherToken)}` });
  assert.equal(signIn.status, 303);
  assert.equal((await go('/teacher/records.json', { headers: { ...proxied, cookie: signIn.headers['set-cookie'][0].split(';')[0] } })).status, 200);
  assert.equal((await go('/teacher/records.json', { headers: { ...proxied, authorization: `Bearer ${teacherToken}` } })).status, 200);
});

test('--learner-header needs a token: whoever can send it is whoever it says', async (t) => {
  const { serve } = await import('../src/serve.js');
  const { agentsToServe } = await import('../src/server/runtime.js');
  await assert.rejects(serve(agentsToServe([deskFile()]), { port: 0, pages: { learnerHeader: 'x-user' }, log: () => {} }), /token/);
  const dir = scratch(t);
  const file = join(dir, 'desk.json');
  writeFileSync(file, JSON.stringify(deskFile().doc));
  const run = spawnSync(process.execPath, [BIN, 'serve', file, '--learner-header', 'x-user', '--port', '0'], { encoding: 'utf8', timeout: 20000 });
  assert.notEqual(run.status, 0);
  assert.match(run.stderr, /--learner-header.*--token-env/s);
});

test('POST /teacher reads at most a few kilobytes, whatever the server’s own limit', async () => {
  const { createHandler } = await import('../src/server/handler.js');
  const { learnerRoutes } = await import('../src/server/learner.js');
  const { agentsToServe, createRuntime } = await import('../src/server/runtime.js');
  const handle = createHandler({ agents: agentsToServe([deskFile()]), runtime: createRuntime({ baseUrl: 'https://m.example/v1', apiKey: 'k', fetch: async () => answerJson() }), routes: [learnerRoutes({})], options: { token: 'tok', log: () => {}, maxBodyBytes: 100 * 1048576 } });
  let sent = 0;
  const body = new ReadableStream({ pull(controller) { sent += 1 << 20; if (sent > 300 * (1 << 20)) return controller.close(); controller.enqueue(new Uint8Array(1 << 20)); } });
  const answer = await handle(new Request('https://school.example/teacher', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body, duplex: 'half' }), { address: '203.0.113.9' });
  assert.equal(answer.status, 413);
  assert.ok(sent < 8 * (1 << 20), `it read ${sent} bytes`);
});

// --- The teacher's session, on a shared computer -----------------------------------------------------------

const courseDoc = () => JSON.parse(readFileSync(new URL('../examples/fractions-practice.json', import.meta.url), 'utf8'));
const FORM = { 'content-type': 'application/x-www-form-urlencoded' };
async function panelServer({ panel = {}, traces = 'token', now = () => Date.now(), token = 'correct horse battery staple', address = '203.0.113.9' } = {}) {
  const { createHandler } = await import('../src/server/handler.js');
  const { learnerRoutes } = await import('../src/server/learner.js');
  const { agentsToServe, createRuntime } = await import('../src/server/runtime.js');
  const { memoryStore } = await import('../src/server/store.js');
  const { demoModel } = await import('../src/try/demo.js');
  const doc = courseDoc();
  const model = demoModel({ docs: [doc], pace: 0 });
  const store = memoryStore();
  const handle = createHandler({ agents: agentsToServe([{ doc, file: 'c.json', name: 'c.json' }]), runtime: createRuntime({ baseUrl: 'https://demo.invalid/v1', apiKey: 'demo', fetch: model }), store, routes: [learnerRoutes({ traces, panel, now })], options: { token, log: () => {} } });
  const base = 'https://school.example';
  const send = (path, init = {}) => handle(new Request(`${base}${path}`, init), { address });
  const post = (path, body, headers = {}) => send(path, { method: 'POST', headers: { ...JSON_TYPE, ...headers }, body: JSON.stringify(body) });
  const home = await (await post('/course/equivalent-fractions/home', { visitor: VISITOR_ID })).json();
  const card = home.units.flatMap((unit) => unit.activities).find((item) => item.state === 'open');
  const page = `/course/equivalent-fractions/${card.key}`;
  const signIn = () => send('/teacher', { method: 'POST', headers: FORM, body: `token=${encodeURIComponent(token)}` });
  return { handle, send, post, page, signIn, token, store };
}
const cookieOf = (answer) => answer.headers.get('set-cookie').split(';')[0];
const frames = (text) => [...text.matchAll(/^event: (.+)$/gm)].map((match) => match[1]);
const askFor = (server, query, headers = {}) => server.post(`${server.page}/messages${query}`, { visitor: VISITOR_ID, message: 'Just tell me the answer.', stream: true }, headers).then((answer) => answer.text());

test('a teacher’s cookie shows nothing on a learner’s ordinary page in the same browser: the panel takes ?panel=1', async () => {
  const server = await panelServer();
  const cookie = cookieOf(await server.signIn());
  const ordinary = await server.send(server.page, { headers: { cookie } });
  assert.ok(!/ai-watch/.test(await ordinary.text()), 'the panel is on a learner’s page');
  assert.ok(!frames(await askFor(server, '', { cookie })).includes('run.trace'), 'a learner’s stream carried run.trace');
  const asked = await server.send(`${server.page}?panel=1`, { headers: { cookie } });
  const html = await asked.text();
  assert.match(html, /ai-watch/);
  assert.match(asked.headers.get('content-security-policy'), /frame-ancestors 'self'/);
  assert.equal(asked.headers.get('cache-control'), 'no-store');
  assert.match(html, /Sign out/, 'the panel says who is signed in, and how to stop');
  assert.ok(frames(await askFor(server, '?panel=1', { cookie })).includes('run.trace'));
});

test('a learner never gets run.trace, by any request', async () => {
  const server = await panelServer();
  const forged = `viable_teacher=${Date.now() + 3600000}.${'a'.repeat(64)}`;
  for (const [what, query, headers] of [['no cookie', '', {}], ['?panel=1 alone', '?panel=1', {}], ['many params', '?panel=1&trace=1&traces=1', {}], ['a forged cookie', '?panel=1', { cookie: forged }], ['the old cookie’s shape', '?panel=1', { cookie: `viable_teacher=${'a'.repeat(64)}` }], ['a wrong bearer', '?panel=1', { authorization: 'Bearer nope' }]]) {
    assert.ok(!frames(await askFor(server, query, headers)).includes('run.trace'), what);
  }
  for (const headers of [{}, { cookie: forged }, { authorization: 'Bearer nope' }]) {
    assert.ok(!/ai-watch/.test(await (await server.send(`${server.page}?panel=1`, { headers })).text()));
    assert.equal((await server.send('/teacher/turns/agtr_abcdefgh/trace', { headers })).status, 404);
  }
  const cookie = cookieOf(await server.signIn());
  const crossSite = await askFor(server, '?panel=1', { cookie, origin: 'https://evil.example', 'sec-fetch-site': 'cross-site' });
  assert.ok(!frames(crossSite).includes('run.trace'), 'another site’s post with the cookie');
});

test('the session: a signed value with its expiry, narrow unless the panel needs it, and it can be ended', async () => {
  let at = 1800000000000;
  const server = await panelServer({ now: () => at });
  const signed = await server.signIn();
  const header = signed.headers.get('set-cookie');
  assert.match(header, /^viable_teacher=\d+\.[a-f0-9]{64};/);
  assert.match(header, /Path=\/;/, 'the panel’s pages are outside /teacher');
  assert.ok(!/Max-Age|Expires/i.test(header), 'it ends with the browser');
  const cookie = header.split(';')[0];
  const [exp, signature] = cookie.split('=')[1].split('.');
  assert.equal(Number(exp), at + 8 * 3600000);
  assert.ok(!cookie.includes(server.token));
  assert.equal((await server.send('/teacher/records.json', { headers: { cookie } })).status, 200);
  assert.equal((await server.send('/teacher/records.json', { headers: { cookie: `viable_teacher=${Number(exp) + 3600000}.${signature}` } })).status, 401, 'a later expiry on the same signature');
  at += 8 * 3600000 + 1;
  assert.equal((await server.send('/teacher/records.json', { headers: { cookie } })).status, 401, 'the server checks the expiry itself');

  const narrow = await panelServer({ panel: null, traces: false });
  assert.match((await narrow.signIn()).headers.get('set-cookie'), /Path=\/teacher;/);

  const out = await panelServer();
  assert.equal((await out.send('/teacher/signout', { method: 'POST', headers: { origin: 'https://evil.example' } })).status, 403);
  const ended = await out.send('/teacher/signout', { method: 'POST' });
  assert.equal(ended.status, 303);
  assert.match(ended.headers.get('set-cookie'), /^viable_teacher=;.*Max-Age=0/);
  assert.match(ended.headers.get('set-cookie'), /Path=\/;/);
  const page = await (await out.send('/teacher', { headers: { cookie: cookieOf(await out.signIn()) } })).text();
  assert.match(page, /action="\/teacher\/signout"/, 'the teacher’s page can end it too');
  assert.match(page, /panel=1/, 'and it links to a page with the panel');
});

test('too many tries from one address don’t lock out another, and a ceiling holds overall', async () => {
  const server = await panelServer({ address: '203.0.113.1' });
  const from = (address) => server.handle(new Request('https://school.example/teacher', { method: 'POST', headers: FORM, body: 'token=wrong' }), { address });
  for (let i = 0; i < 10; i += 1) assert.equal((await from('203.0.113.1')).status, 401);
  assert.equal((await from('203.0.113.1')).status, 429);
  assert.equal((await from('203.0.113.2')).status, 401, 'someone else may still sign in');
  let last = 0;
  for (let i = 0; i < 700 && last !== 429; i += 1) last = (await from(`198.51.100.${i % 250}`)).status;
  assert.equal(last, 429, 'many addresses meet a ceiling');
});

test('a proxy’s identities are stored salted, so a list of emails can’t be hashed to find them', async () => {
  const { createHandler } = await import('../src/server/handler.js');
  const { learnerRoutes } = await import('../src/server/learner.js');
  const { agentsToServe, createRuntime } = await import('../src/server/runtime.js');
  const { memoryStore } = await import('../src/server/store.js');
  const { createHash } = await import('node:crypto');
  const store = memoryStore();
  const doc = courseDoc();
  const handle = createHandler({ agents: agentsToServe([{ doc, file: 'c.json', name: 'c.json' }]), runtime: createRuntime({ baseUrl: 'https://m.example/v1', apiKey: 'k', fetch: async () => answerJson() }), store, routes: [learnerRoutes({ learnerHeader: 'x-user' })], options: { token: 't', log: () => {} } });
  const post = (visitor, user) => handle(new Request('https://school.example/course/equivalent-fractions/home', { method: 'POST', headers: { ...JSON_TYPE, 'x-user': user }, body: JSON.stringify({ visitor }) }), { address: '203.0.113.9' });
  const first = await (await post('visitor-aaaaaaaaaaaaaaaa', 'ada@school.example')).json();
  const again = await (await post('visitor-bbbbbbbbbbbbbbbb', 'ada@school.example')).json();
  assert.equal(first.learner.code, again.learner.code, 'the same person is the same learner on any browser');
  const keys = await store.list('courses/equivalent-fractions/identities/');
  assert.equal(keys.length, 1);
  assert.ok(!keys[0].endsWith(createHash('sha256').update('ada@school.example').digest('hex')), 'a plain hash of the email');
});

// --- The try server --------------------------------------------------------------------------------------

async function tryServer(t, options = {}) {
  const { serve } = await import('../src/serve.js');
  const { agentsToServe } = await import('../src/server/runtime.js');
  const { memoryStore } = await import('../src/server/store.js');
  const { demoModel, sampleRounds } = await import('../src/try/demo.js');
  const { readyToTry, tryOut } = await import('../src/try/server.js');
  const doc = courseDoc();
  const ready = readyToTry([{ doc, file: 'fractions.json', name: 'fractions.json' }]);
  const docs = ready.map((file) => file.doc);
  const counts = { model: 0 };
  const inner = demoModel({ docs, pace: 0 });
  const fetch = (url, init) => { if (String(url).endsWith('/chat/completions')) counts.model += 1; return inner(url, init); };
  const store = memoryStore();
  const parts = tryOut({ note: 'n', store, endpoint: { fetch }, rounds: sampleRounds(docs), ...options });
  const open = await serve(agentsToServe(ready), { port: 0, store, routes: parts.routes, pages: parts.pages, log: () => {}, fetch, httpFetch: fetch, baseUrl: 'https://demo.invalid/v1', apiKey: 'demo', models: null });
  t.after(() => open.server.close());
  return { ...open, counts, store, go: rawClient(open.url), port: new URL(open.url).port, slug: agentsToServe(ready)[0].slug };
}

test('a website can’t change a try-out’s settings, read its traces or spend the person’s key', async (t) => {
  const { go, store, counts, port, slug } = await tryServer(t);
  const pageId = 'equivalent-fractions/x';
  for (const route of ['teaching', 'accept', 'reset']) {
    assert.equal((await go(`/try/${route}`, { method: 'POST', headers: EVIL, body: JSON.stringify({ page: pageId, help: 'explain', patch: { help: 'explain' } }) })).status, 403, route);
    assert.equal((await go(`/try/${route}`, { method: 'POST', headers: { host: `attacker.example:${port}`, origin: `http://attacker.example:${port}`, ...JSON_TYPE }, body: '{}' })).status, 403, route);
  }
  assert.deepEqual(await store.list('try/'), []);
  assert.equal((await go(`/v1/agents/${slug}/runs`, { method: 'POST', headers: EVIL, body: runBody })).status, 403);
  assert.equal(counts.model, 0, 'a cross-site post spent the key');
  for (const path of ['/', '/teacher', '/teacher/records.json', '/teacher/turns/agtr_abcdefgh/trace', '/v1/agents']) assert.equal((await go(path, { headers: { host: `attacker.example:${port}` } })).status, 403, path);
  const fromElsewhere = await go('/teacher/turns/agtr_abcdefgh/trace', { headers: { origin: 'https://evil.example' } });
  assert.equal(fromElsewhere.headers['access-control-allow-origin'], undefined);
  assert.equal((await go('/teacher/records.json', { headers: { host: '127.0.0.1:1', 'x-forwarded-for': '203.0.113.9' } })).status, 403, 'behind a proxy that says so, no local grant');
});

test('a try-out’s chat config isn’t handed to other sites, and its tour runs only if asked for at start', async (t) => {
  const plain = await tryServer(t);
  const chat = (await plain.go('/')).text.match(/href="\/chat\/([^"?]+)"/)?.[1];
  if (chat) assert.equal((await plain.go(`/chat/${chat}/config`, { headers: { origin: 'https://evil.example' } })).headers['access-control-allow-origin'], undefined);
  const page = (await plain.go('/?tour=1')).text;
  assert.ok(!/\?tour=1/.test(page), 'a link to the tour');
  assert.ok(!/localStorage/.test(page), 'a site could send a person to /?tour=1 and clear their try-out');
  const asked = await tryServer(t, { tour: true });
  const script = (await asked.go('/')).text;
  assert.match(script, /viable-chat:/);
  assert.match(script, /viable-try:/);
  assert.ok(!/localStorage\.clear\(\)/.test(script), 'a tour clears only its own keys');
});

test('the teacher’s page in a try-out keeps a $ in what it shows', async () => {
  const source = readFileSync(new URL('../src/try/server.js', import.meta.url), 'utf8');
  assert.ok(!/\.replace\('<body>', `/.test(source) && !/\.replace\('<\/body>', `/.test(source), 'text as a replacement: $& and $` in it would be expanded');
});

test('serve --panel with no token makes one and prints it once; the grant is never decided by a header', async (t) => {
  const dir = scratch(t);
  const file = join(dir, 'desk.json');
  writeFileSync(file, JSON.stringify(deskFile().doc));
  const child = spawn(process.execPath, [BIN, 'serve', file, '--panel', '--port', '0'], { stdio: ['ignore', 'ignore', 'pipe'], env: { ...process.env, OPENAI_API_KEY: 'k', OPENAI_BASE_URL: 'http://127.0.0.1:1/v1' } });
  t.after(() => child.kill());
  let said = '';
  child.stderr.setEncoding('utf8');
  await new Promise((resolve, reject) => { child.stderr.on('data', (chunk) => { said += chunk; if (/shown once/.test(said) && /panel=1/.test(said)) resolve(); }); child.on('exit', () => reject(new Error(`It stopped: ${said}`))); });
  const url = /Serving .* at (http:\/\/[\d.]+:\d+)/.exec(said)[1];
  const token = /shown once: (\S+)/.exec(said)[1];
  assert.equal(said.split(token).length, 2, 'the token is printed once');
  const go = rawClient(url);
  const proxied = { host: '127.0.0.1:8080' };
  assert.ok(!/ai-watch/.test((await go('/chat/desk?panel=1', { headers: proxied })).text), 'a learner through a local proxy got the panel');
  const signed = await go('/teacher', { method: 'POST', headers: { ...FORM, ...proxied }, body: `token=${encodeURIComponent(token)}` });
  assert.equal(signed.status, 303);
  assert.match((await go('/chat/desk?panel=1', { headers: { ...proxied, cookie: signed.headers['set-cookie'][0].split(';')[0] } })).text, /ai-watch/);
});

// --- A static copy is published --------------------------------------------------------------------------

test('--export refuses a person’s own package unless they say what they mean, and strips what it can even then', async (t) => {
  const { exportStatic } = await import('../src/try/export.js');
  const dir = scratch(t);
  const mine = courseDoc();
  mine.title = 'My own course';
  mine.course.activities[0].teaching = { ...mine.course.activities[0].teaching, watch_for: 'TEACHER-ONLY-NOTE' };
  mine.notes = ['TEACHER-ONLY-PACKAGE-NOTE'];
  const files = [{ doc: mine, file: 'mine.json', name: 'mine.json' }];
  await assert.rejects(exportStatic(files, { dir: join(dir, 'refused') }), (error) => /--publish-answers/.test(`${error.message} ${error.next}`) && /answer key/i.test(`${error.message} ${error.next}`));
  assert.ok(!existsSync(join(dir, 'refused')), 'nothing was written');
  if (!existsSync(fileURLToPath(new URL('../dist/try/app.js', import.meta.url)))) return;
  const out = join(dir, 'published');
  const written = await exportStatic(files, { dir: out, publishAnswers: true });
  assert.ok(written.pages > 0);
  const everything = walk(out).filter((file) => /\.(json|html)$/.test(file)).map((file) => readFileSync(file, 'utf8')).join('\n');
  assert.ok(!everything.includes('TEACHER-ONLY-NOTE'), 'a teacher’s note went into the copy');
  assert.ok(!everything.includes('TEACHER-ONLY-PACKAGE-NOTE'));
  const bundled = await exportStatic([{ doc: courseDoc(), file: 'fractions-practice.json', name: 'fractions-practice.json' }], { dir: join(dir, 'bundled') });
  assert.ok(bundled.pages > 0, 'the bundled examples need no flag: they are public already');
  const launcher = readFileSync(join(dir, 'bundled', 'index.html'), 'utf8');
  assert.ok(!/localStorage\.clear\(\)/.test(launcher), 'a tour on a hosting site’s origin clears only its own keys');
  assert.match(launcher, /viable-try:/);
});

test('the command line asks for --publish-answers, and says what it publishes', (t) => {
  const dir = scratch(t);
  const file = join(dir, 'mine.json');
  const mine = courseDoc();
  mine.title = 'My own course';
  writeFileSync(file, JSON.stringify(mine));
  const refused = spawnSync(process.execPath, [BIN, 'try', file, '--export', join(dir, 'site')], { encoding: 'utf8' });
  assert.notEqual(refused.status, 0);
  assert.match(`${refused.stdout}${refused.stderr}`, /--publish-answers/);
  if (!existsSync(fileURLToPath(new URL('../dist/try/app.js', import.meta.url)))) return;
  const published = spawnSync(process.execPath, [BIN, 'try', file, '--export', join(dir, 'site'), '--publish-answers'], { encoding: 'utf8' });
  assert.equal(published.status, 0, published.stderr);
  assert.match(published.stdout, /answer key/);
});

test('docs/try.md says where not to host a static copy', () => {
  const doc = readFileSync(new URL('../docs/try.md', import.meta.url), 'utf8');
  assert.match(doc, /accounts/);
  assert.match(doc, /own path or subdomain/);
  assert.match(doc, /--publish-answers/);
});

// --- A small zip can hold a huge file --------------------------------------------------------------------

test('a zip’s inflated size is bounded by default, in text and in binary, per entry and over all', async (t) => {
  const { readZip } = await import('../src/utils/zip.js');
  const { zipFile } = await import('./zipFile.js');
  const huge = Buffer.alloc(80 * 1048576, 'a');
  const bomb = zipFile([{ name: 'word/document.xml', data: huge }]);
  assert.ok(bomb.length < 200 * 1024, 'small on the wire');
  const tooLarge = (error) => error.code === 'zip_entry_too_large' && error.status === 413;
  await assert.rejects(readZip(bomb, () => true), tooLarge, 'text mode');
  await assert.rejects(readZip(bomb, () => true, { binary: true }), tooLarge, 'binary mode');
  assert.equal((await readZip(bomb, () => true, { maxBytes: 100 * 1048576 })).get('word/document.xml').length, huge.length, 'a caller that needs more says so');
  const stored = zipFile([{ name: 'a', data: Buffer.alloc(2048), store: true }]);
  await assert.rejects(readZip(stored, () => true, { maxBytes: 1024 }), tooLarge, 'a stored entry too');
  const many = zipFile(Array.from({ length: 12 }, (_, i) => ({ name: `part-${i}`, data: Buffer.alloc(30 * 1048576) })));
  await assert.rejects(readZip(many, () => true, { binary: true }), (error) => tooLarge(error) && /come to more/.test(error.message), 'many entries under the limit, past the limit together');
  assert.equal((await readZip(zipFile([{ name: 'small.txt', data: 'hello' }]), () => true)).get('small.txt'), 'hello');
  const hostile = join(scratch(t), 'bomb.viable.zip');
  const graph = { entry: 'out', nodes: [{ id: 'out', type: 'output', config: { text: 'x' } }] };
  writeFileSync(hostile, zipFile([{ name: 'package.viable.json', data: JSON.stringify({ format: 'viable.course-package', version: 1, title: 'B', agents: [{ ref: 'a', slug: 'a', name: 'A', graph }], files: [{ ref: 'f', name: 'x.txt', path: 'files/x.txt' }], knowledge_bases: [] }) }, { name: 'files/x.txt', data: huge }]));
  const { readAgentFile } = await import('../src/run.js');
  const read = await readAgentFile(hostile);
  await assert.rejects(inspectPackage({ doc: { ...read.doc, knowledge_bases: [] }, zip: read.zip, file: 'bomb.viable.zip' }), tooLarge, 'inspect');
  const { scaffold } = await import('../src/cli/deploy.js');
  const before = process.memoryUsage().rss;
  await assert.rejects(scaffold('node', hostile, { out: join(scratch(t), 'o'), name: 'bomb-test', knowledge: { kb: scratch(t) } }));
  assert.ok(process.memoryUsage().rss - before < 400 * 1048576, 'it stopped reading');
});

test('the essays connector asks for what its real zip needs', () => {
  const source = readFileSync(new URL('../src/resources/essays.js', import.meta.url), 'utf8');
  assert.match(source, /train\.csv[^\n]*maxBytes/, 'ASAP’s file names its own limit');
});

// --- keepDays --------------------------------------------------------------------------------------------

test('keepDays takes all a learner wrote, on every host’s schedule, and what stays is said', async (t) => {
  const { createHandler } = await import('../src/server/handler.js');
  const { learnerRoutes } = await import('../src/server/learner.js');
  const { agentsToServe, createRuntime } = await import('../src/server/runtime.js');
  const { memoryStore } = await import('../src/server/store.js');
  const store = memoryStore();
  const doc = courseDoc();
  const handle = createHandler({ agents: agentsToServe([{ doc, file: 'c.json', name: 'c.json' }]), runtime: createRuntime({ baseUrl: 'https://m.example/v1', apiKey: 'k', fetch: async () => answerJson() }), store, routes: [learnerRoutes({ traces: 'token' })], options: { token: 't', keepDays: 30, log: () => {} } });
  const OLD = '2020-01-01T00:00:00.000Z';
  const NEW = new Date().toISOString();
  const old = {
    'courses/c/turns/lrn_1/2020-a': { started_at: OLD, message: 'an old question' },
    'courses/c/drafts/lrn_1/a/w': { draft: 'an old essay', updated_at: OLD },
    'courses/c/answers/lrn_1/a/q': { rows: [{ item: 'q1', data: { response: 'old answer' } }], updated_at: OLD },
    'courses/c/notes/lrn_1/a/r/ann_1': { note: 'an old highlight', updated_at: OLD },
    [`courses/c/events/lrn_1/a/${OLD}-aaaa`]: { activity: 'a', events: [{ type: 'writing.snapshot', data: { draft: 'old' } }] },
    'chats/desk/turns/owner/2020-a': { started_at: OLD, message: 'old' },
    'traces/agtr_old': { started_at: OLD, output: { text: 'old' } },
    'pages/desk/runs/agtr_old': { key: 'chats/desk/turns/owner/2020-a', owner: 'owner', started_at: OLD },
    'conversations/agtc_old': { updated_at: OLD, messages: [{ role: 'user', content: 'old' }] },
    'runs/agtr_old': { completed_at: OLD, output: { text: 'old' } }
  };
  const fresh = Object.fromEntries(Object.entries(old).map(([key, value]) => [key.replace(/old|2020-a|2020-01-01T00:00:00\.000Z/g, (word) => (word === 'old' ? 'new' : word === '2020-a' ? '2026-a' : NEW)).replace('lrn_1', 'lrn_2'), JSON.parse(JSON.stringify(value).replaceAll(OLD, NEW))]));
  const stays = { 'courses/c/learners/lrn_1': { id: 'lrn_1', code: 'ABCD2345', created_at: OLD }, 'courses/c/codes/ABCD2345': { learner: 'lrn_1' }, 'courses/c/progress/lrn_1/a': { opened_at: OLD, last_at: OLD, done_at: OLD }, 'memory/lrn_1': { facts: [] } };
  for (const [key, value] of Object.entries({ ...old, ...fresh, ...stays })) await store.put(key, value);
  await handle.sweep();
  for (const key of Object.keys(old)) assert.equal(await store.get(key), null, `${key} outlived keepDays`);
  for (const key of [...Object.keys(fresh), ...Object.keys(stays)]) assert.ok(await store.get(key), `${key} shouldn’t have gone`);

  const { scaffold } = await import('../src/cli/deploy.js');
  const dir = scratch(t);
  const input = join(dir, 'p.json');
  writeFileSync(input, JSON.stringify(deskFile().doc));
  await scaffold('aws-lambda', input, { out: join(dir, 'lambda'), name: 'sweep-test' });
  const template = readFileSync(join(dir, 'lambda', 'template.yaml'), 'utf8');
  assert.match(template, /Handler: index\.sweep/);
  assert.match(template, /Schedule: rate\(1 day\)/);
  assert.match(readFileSync(join(dir, 'lambda', 'index.js'), 'utf8'), /export const sweep/);
  const lambdaReadme = readFileSync(join(dir, 'lambda', 'README.md'), 'utf8');
  for (const part of ['drafts', 'answers', 'highlights', 'events', 'turns']) assert.match(lambdaReadme, new RegExp(part), `the Lambda README doesn’t say ${part}`);
  assert.match(lambdaReadme, /code/);
  await scaffold('firebase', input, { out: join(dir, 'firebase'), name: 'sweep-test' });
  assert.match(readFileSync(join(dir, 'firebase', 'functions', 'index.js'), 'utf8'), /onSchedule/);
  await scaffold('aws-lambda', input, { out: join(dir, 'lambda-none'), name: 'sweep-test', store: 'none' });
  assert.ok(!/index\.sweep/.test(readFileSync(join(dir, 'lambda-none', 'template.yaml'), 'utf8')), 'with no store there is nothing to sweep');
});
