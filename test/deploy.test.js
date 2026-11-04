// A package on each cloud: inspect's report, the folder deploy writes, and each target's own entry
// run as its cloud would run it, against a scripted model on this machine. No cloud is touched.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { scaffold } from '../src/cli/deploy.js';
import { verifyServer } from '../src/cli/verify.js';
import { packageAgents, readAgentFile } from '../src/run.js';
import { createApp } from '../src/server/app.js';
import { inspectPackage } from '../src/server/inspect.js';
import { eventToRequest, lambdaHandler, lambdaStreamHandler } from '../src/server/lambda.js';
import { modelPlan } from '../src/server/models.js';
import { listen } from '../src/server/node.js';
import { openAICompatible } from '../src/server/runtime.js';
import { TARGET_NAMES, TARGETS } from '../src/server/targets.js';
import { validateDocument } from '../src/validate.js';
import { zipFile } from './zipFile.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const CLI = join(ROOT, 'bin', 'viable-harness.mjs');

const library = {
  format: 'viable.course-package', version: 1, exported_at: '2026-10-30T19:00:00.000Z', title: 'Riverside Library help',
  agents: [
    { ref: 'agent-1', slug: 'library-help', name: 'Library help', description: 'Finds sources.', graph: { entry: 'look', nodes: [
      { id: 'look', type: 'knowledge', config: { knowledge_base_refs: ['kb-guides'] }, next: 'answer' },
      { id: 'answer', type: 'vetting', config: { model: 'writer-1', verification_model: 'review-1', guideline: 'Use only the passages.', chat_prompt: 'Passages: {{look.context}}', max_attempts: 1 }, next: 'out' },
      { id: 'out', type: 'output', config: { text: '{{answer.content}}' } }
    ] } },
    { ref: 'agent-2', name: 'Citation coach', graph: { entry: 'coach', nodes: [{ id: 'coach', type: 'llm', config: { model: 'viable-3' }, next: 'out' }, { id: 'out', type: 'output', config: { text: '{{coach.content}}' } }] } }
  ],
  files: [{ ref: 'file-1', name: 'hours.md', path: 'files/hours.md' }, { ref: 'file-2', name: 'citing.pdf', path: 'files/citing.pdf', text_path: 'files/citing.md' }],
  knowledge_bases: [{ ref: 'kb-guides', name: 'Library guides', file_refs: ['file-1', 'file-2'], search_mode: 'hybrid', websites: [] }],
  course: { title: 'Riverside Library help', activities: [{ title: 'Finding a source', agent_ref: 'agent-1', teaching: { help_level: 'hint' } }] }
};
const zipOf = (pkg = library) => zipFile([
  { name: 'package.viable.json', data: JSON.stringify(pkg) },
  { name: 'files/hours.md', data: '# Hours\n\nThe Riverside library is open from nine to five on weekdays, and the reading room closes at four on Fridays.' },
  { name: 'files/citing.pdf', data: '%PDF-1.4 stand-in' },
  { name: 'files/citing.md', data: '# Citing\n\nCite the author, the year and the title of every source you use.' }
]);

function scratch(t) {
  const dir = mkdtempSync(join(tmpdir(), 'viable-harness-deploy-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

// A model on this machine; asked is what it was sent.
async function stubModel(t) {
  const asked = [];
  const server = createServer((req, res) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      const body = JSON.parse(Buffer.concat(chunks).toString());
      asked.push({ model: body.model, text: JSON.stringify(body.messages), auth: req.headers.authorization });
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content: 'PASS' }, finish_reason: 'stop' }], usage: { prompt_tokens: 4, completion_tokens: 1, total_tokens: 5 } }));
    });
  });
  await new Promise((resolve) => { server.listen(0, '127.0.0.1', resolve); });
  t.after(() => server.close());
  return { asked, url: `http://127.0.0.1:${server.address().port}/v1` };
}

function allFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? allFiles(path) : [path];
  });
}

// What a cloud's runtime provides, as packages in the folder's own node_modules.
function stubPackage(root, name, files) {
  const dir = join(root, 'node_modules', name);
  mkdirSync(dir, { recursive: true });
  for (const [file, text] of Object.entries(files)) {
    mkdirSync(join(dir, file, '..'), { recursive: true });
    writeFileSync(join(dir, file), text);
  }
}
function linkEntities(root) {
  mkdirSync(join(root, 'node_modules'), { recursive: true });
  symlinkSync(join(ROOT, 'node_modules', 'entities'), join(root, 'node_modules', 'entities'));
}

test('inspect reports agents, each model by role, knowledge, activities, settings and warnings, for machines and people', async (t) => {
  const report = await inspectPackage({ doc: library, zip: zipOf(), file: 'riverside.viable.zip' });
  assert.deepEqual(report.agents.map((agent) => [agent.slug, agent.address]), [['library-help', '/v1/agents/library-help/runs'], ['agent-2', '/v1/agents/agent-2/runs']]);
  assert.deepEqual(report.models.map((row) => [row.role, row.model]), [['reply', 'viable-3'], ['reply', 'writer-1'], ['reviewer', 'review-1']]);
  assert.deepEqual(report.knowledge_bases.map((kb) => [kb.name, kb.files, kb.text_copies, kb.search_on_viable, kb.missing.length]), [['Library guides', 2, 1, 'hybrid', 0]]);
  assert.deepEqual(report.activities.map((item) => [item.title, item.has_teaching]), [['Finding a source', true]]);
  assert.deepEqual(report.settings.map((item) => item.name), ['OPENAI_BASE_URL', 'OPENAI_API_KEY', 'VIABLE_HARNESS_TOKEN']);
  assert.ok(report.warnings.some((line) => /viable-3 is VIABLE's own name/.test(line)));
  assert.ok(report.warnings.some((line) => /searched by keywords and meaning on VIABLE/.test(line)));
  assert.match(report.next.command, /^viable-harness deploy <target> riverside\.viable\.zip --out/);
  assert.deepEqual(report.next.replace_models, ['viable-3', 'writer-1', 'review-1']);

  const mapped = await inspectPackage({ doc: library, zip: zipOf(), file: 'x.zip', plan: modelPlan({ model: 'same' }) });
  assert.deepEqual(mapped.models.map((row) => row.replaced_by), ['same', 'same', 'same']);
  assert.ok(mapped.warnings.some((line) => /the reviewer is same, the same model that writes the reply/.test(line)));

  const dir = scratch(t);
  const file = join(dir, 'riverside.viable.zip');
  writeFileSync(file, zipOf());
  const json = spawnSync(process.execPath, [CLI, 'inspect', file, '--json', '--map', 'viable-3=small', '--target', 'cloudflare'], { encoding: 'utf8' });
  assert.equal(json.status, 0, json.stderr);
  const parsed = JSON.parse(json.stdout);
  assert.equal(parsed.object, 'harness.inspection');
  assert.equal(parsed.models[0].replaced_by, 'small');
  assert.match(parsed.next.command, /deploy cloudflare/);
  const people = spawnSync(process.execPath, [CLI, 'inspect', file], { encoding: 'utf8' });
  assert.equal(people.status, 0);
  for (const words of ['Riverside Library help', 'library-help', 'reviewer', 'Library guides', 'keywords and meaning on VIABLE', 'VIABLE_HARNESS_TOKEN', 'Warnings', 'viable-harness deploy']) assert.ok(people.stdout.includes(words), words);
});

test('a package’s chat pages and snapshots are what inspect reports, and a scaffold carries the pages’ browser files', async (t) => {
  const dir = scratch(t);
  const graph = { entry: 'o', nodes: [{ id: 'o', type: 'output', config: { text: 'hi' } }] };
  const doc = { format: 'viable.course-package', version: 1, title: 'Desk', agents: [{ ref: 'a', slug: 'desk', name: 'Desk', graph, profile: { title: 'The desk' }, chat_page: { status: 'active', settings: { allowed_sites: ['https://library.example.org'], daily_limit: 120 } } }, { ref: 'b', name: 'Quiet', graph }], knowledge_bases: [{ ref: 'web', name: 'Guides', websites: [{ kind: 'crawl', url: 'https://guides.example.edu', snapshot: [{ url: 'https://guides.example.edu/a', path: 'files/page-1.md' }] }] }] };
  const report = await inspectPackage({ doc, file: 'desk.json' });
  assert.deepEqual(report.chat_pages, [{ agent_ref: 'a', slug: 'desk', status: 'active', address: '/chat/desk', title: 'The desk', sites: ['https://library.example.org'], daily_limit: 120 }]);
  assert.equal(report.knowledge_bases[0].websites[0].snapshot_pages, 1);
  assert.ok(!report.warnings.some((line) => /with no snapshot/.test(line)));
  const file = join(dir, 'desk.json');
  writeFileSync(file, JSON.stringify(doc));
  const built = join(dir, 'built');
  mkdirSync(join(built, 'pdf-1', 'wasm'), { recursive: true });
  writeFileSync(join(built, 'manifest.json'), '{"render":"render-1.js"}');
  writeFileSync(join(built, 'render-1.js'), '// the renderer');
  writeFileSync(join(built, 'pdf-1', 'wasm', 'x.wasm'), 'w');
  const cloudflare = await scaffold('cloudflare', file, { out: join(dir, 'cf'), pageFiles: built });
  assert.ok(existsSync(join(cloudflare.out, 'package', 'chat-assets', 'pdf-1', 'wasm', 'x.wasm')), 'private assets beside the package');
  assert.match(readFileSync(join(cloudflare.out, 'index.js'), 'utf8'), /pages: \{ assets: await pageFiles\(env\) \}/);
  assert.match(readFileSync(join(cloudflare.out, 'wrangler.toml'), 'utf8'), /html_handling = "none"/);
  for (const target of ['node', 'aws-lambda', 'firebase']) {
    const made = await scaffold(target, file, { out: join(dir, target), pageFiles: built });
    const root = target === 'firebase' ? join(made.out, 'functions') : made.out;
    assert.ok(existsSync(join(root, 'vendor', 'harness', 'dist', 'v1', 'agents', 'chat-assets', 'render-1.js')), `${target}: files in the function`);
    assert.ok(existsSync(join(root, 'vendor', 'harness', 'src', 'server', 'learnerAssets.js')), `${target}: what reads them`);
  }
  const without = await scaffold('node', file, { out: join(dir, 'none'), pageFiles: join(dir, 'nothing') });
  assert.ok(without.warnings.some((line) => /browser files aren't built/.test(line)));
});

test('an agent downloaded on its own, with no course: inspect, its page, what it calls, and every target', async (t) => {
  const dir = scratch(t);
  const helper = { ref: 'agent-2', slug: 'citation-helper-x1', name: 'Citation helper', graph: { entry: 'o', nodes: [{ id: 'o', type: 'output', config: { text: 'Cite the author.' } }] } };
  const desk = { ref: 'agent-1', slug: 'library-help', name: 'Library help', profile: { title: 'The desk', greeting: 'Ask the desk.' }, chat_page: { status: 'active', settings: { allowed_sites: ['https://library.example.org'] } }, graph: { entry: 'c', nodes: [
    { id: 'c', type: 'subagent', config: { slug: 'citation-helper-x1' }, next: 'gone' },
    { id: 'gone', type: 'subagent', config: { slug: 'not-in-here' }, next: 'o' },
    { id: 'o', type: 'output', config: { text: '{{c.text}}' } }
  ] } };
  const doc = { format: 'viable.course-package', version: 1, title: 'Library help', agents: [desk, helper], notes: ['“Library help” calls the agent “not-in-here”, which is left out: it isn’t published in this project.'] };
  assert.deepEqual(validateDocument(doc).errors, []);
  const report = await inspectPackage({ doc, file: 'library-help.json' });
  assert.equal(report.title, 'Library help');
  assert.deepEqual(report.activities, []);
  assert.deepEqual(report.chat_pages.map((page) => page.address), ['/chat/library-help'], 'the page it was given, and none for what it calls');
  assert.deepEqual(report.notes, doc.notes);
  assert.ok(report.warnings.some((line) => /library-help calls the agent "not-in-here", which this file doesn't hold/.test(line)));
  assert.ok(!report.warnings.some((line) => /citation-helper-x1/.test(line)), 'found by its slug');
  const called = await packageAgents(doc)('citation-helper-x1');
  assert.equal(called.id, 'agent-2');
  const file = join(dir, 'library-help.json');
  writeFileSync(file, JSON.stringify(doc));
  const people = spawnSync(process.execPath, [CLI, 'inspect', file], { encoding: 'utf8' });
  assert.match(people.stdout, /Left out when it was downloaded/);
  assert.doesNotMatch(people.stdout, /course package/);
  for (const target of TARGET_NAMES) await scaffold(target, file, { out: join(dir, target) });
  const zipped = join(dir, 'library-help.viable.zip');
  writeFileSync(zipped, zipFile([{ name: 'package.viable.json', data: JSON.stringify(doc) }]));
  const valid = spawnSync(process.execPath, [CLI, 'validate', zipped], { encoding: 'utf8' });
  assert.equal(valid.status, 0, valid.stderr);
  assert.match(valid.stdout, /a valid course-package file/);
  doc.agents[0].chat_page.settings.limits = { daily_cost: 5 };
  assert.ok((await inspectPackage({ doc, file: 'x.json' })).warnings.some((line) => /library-help: its daily spending cap \(5 dollars\) isn't enforced here/.test(line)));
});

test('inspect names what can’t run where, what isn’t readable, and what a package leaves out', async () => {
  const pkg = {
    format: 'viable.course-package', version: 1, title: 'Edge', agents: [{ ref: 'a', name: 'A', graph: { entry: 'k', nodes: [
      { id: 'k', type: 'knowledge', config: { knowledge_base_refs: ['web', 'pdf'] }, next: 'c' },
      { id: 'c', type: 'component', config: { manifest: JSON.parse(readFileSync(join(ROOT, 'test/fixtures/components/echo.json'), 'utf8')) }, next: 't' },
      { id: 't', type: 'transcribe', config: { model: 'whisper-1' }, next: 'h' },
      { id: 'h', type: 'http', config: { url: 'https://api.example.org/x' }, next: 'out' },
      { id: 'out', type: 'output', config: { text: 'done' } }
    ] } }],
    files: [{ ref: 'f', name: 'scan.pdf', path: 'files/scan.pdf' }],
    knowledge_bases: [{ ref: 'web', name: 'Guides', websites: [{ kind: 'crawl', url: 'https://guides.example.edu' }] }, { ref: 'pdf', name: 'Scans', file_refs: ['f'] }]
  };
  const report = await inspectPackage({ doc: pkg, file: 'edge.json' });
  const component = report.steps.find((step) => step.type === 'component');
  assert.deepEqual(Object.keys(component.limits).sort(), ['aws-lambda', 'cloudflare', 'firebase']);
  assert.deepEqual(Object.keys(report.steps.find((step) => step.type === 'transcribe').limits).sort(), [...TARGET_NAMES].sort());
  assert.ok(report.warnings.some((line) => /holds a website \(https:\/\/guides\.example\.edu\) with no snapshot/.test(line)));
  assert.ok(report.warnings.some((line) => /holds scan\.pdf with no text copy/.test(line)));
  assert.ok(report.warnings.some((line) => /leaves out a Fetch URL step's headers/.test(line)));
  assert.equal(report.knowledge_bases.find((kb) => kb.ref === 'web').search_on_viable, null);
});

test('deploy writes every target’s folder with nothing left unfilled, with and without a store', async (t) => {
  const dir = scratch(t);
  const file = join(dir, 'riverside.viable.zip');
  writeFileSync(file, zipOf());
  for (const target of TARGET_NAMES) {
    for (const store of [null, 'none']) {
      const out = join(dir, `${target}-${store ?? 'store'}`);
      const result = await scaffold(target, file, { out, store, endpoint: 'https://models.example/v1', plan: modelPlan({ reviewerModel: 'second', map: { 'writer-1': 'first', 'viable-3': 'first' } }) });
      assert.equal(result.package, 'riverside.viable.zip');
      assert.equal(result.store.kind, store ? 'none' : TARGETS[target].store.kind);
      const root = join(out, TARGETS[target].root);
      assert.ok(existsSync(join(root, 'package', 'riverside.viable.zip')));
      assert.deepEqual(JSON.parse(readFileSync(join(root, 'models.json'), 'utf8')), { reviewer: 'second', map: { 'writer-1': 'first', 'viable-3': 'first' } });
      for (const path of allFiles(out)) {
        if (path.includes('vendor') || path.endsWith('.zip') || path.includes('chat-assets')) continue;
        const text = readFileSync(path, 'utf8');
        assert.ok(!/\{\{[#^/]?[a-z_]*\}\}/.test(text), `${path} has an unfilled {{...}}`);
      }
      const readme = readFileSync(join(out, 'README.md'), 'utf8');
      assert.match(readme, /Riverside Library help/);
      assert.match(readme, /viable-harness verify/);
      assert.match(readme, /What it can't do here/);
      for (const line of TARGETS[target].limits) assert.ok(readme.includes(line), `${target}'s README says: ${line}`);
      assert.match(readme, store ? /Nothing between requests/ : /Conversations, runs, what learners wrote on pages and Memory steps' facts/);
      // Only what the target runs is copied, and everything it imports is there.
      assert.ok(existsSync(join(root, 'vendor/harness/src/server/handler.js')));
      assert.ok(existsSync(join(root, 'vendor/harness/LICENSE')));
      assert.ok(!existsSync(join(root, 'vendor/harness/src/mcp.js')), 'what it doesn\'t run isn\'t copied');
      assert.equal(existsSync(join(root, 'store.js')), !store && !TARGETS[target].entries.includes('server/fileStore.js'), `${target}: store.js`);
    }
  }
});

test('deploy refuses a full folder and a package too large for the target, and says what to do', async (t) => {
  const dir = scratch(t);
  const file = join(dir, 'riverside.viable.zip');
  writeFileSync(file, zipOf());
  const out = join(dir, 'full');
  mkdirSync(out);
  writeFileSync(join(out, 'mine.txt'), 'keep');
  const refused = spawnSync(process.execPath, [CLI, 'deploy', 'node', file, '--out', out, '--json'], { encoding: 'utf8' });
  assert.equal(refused.status, 1);
  assert.match(JSON.parse(refused.stdout).error.next, /--force/);
  assert.equal(spawnSync(process.execPath, [CLI, 'deploy', 'mars', file, '--out', out], { encoding: 'utf8' }).status, 2);
  assert.equal(spawnSync(process.execPath, [CLI, 'deploy', 'node', file], { encoding: 'utf8' }).status, 2);
  assert.equal(spawnSync(process.execPath, [CLI, 'deploy', 'node', file, '--out', join(dir, 'x'), '--store', 'redis'], { encoding: 'utf8' }).status, 2);
  const made = spawnSync(process.execPath, [CLI, 'deploy', 'node', file, '--out', join(dir, 'ok'), '--json'], { encoding: 'utf8' });
  assert.equal(made.status, 0, made.stderr);
  assert.equal(JSON.parse(made.stdout).object, 'harness.scaffold');

  const big = join(dir, 'big.viable.zip');
  writeFileSync(big, zipFile([{ name: 'package.viable.json', data: JSON.stringify(library) }, { name: 'large.bin', data: Buffer.alloc(26 * 1024 * 1024, 7), store: true }]));
  await assert.rejects(scaffold('cloudflare', big, { out: join(dir, 'big') }), /more than Cloudflare Workers takes/);
});

test('a JSON package, an agent file and knowledge folders all become one zip that searches the same', async (t) => {
  const dir = scratch(t);
  mkdirSync(join(dir, 'files'));
  writeFileSync(join(dir, 'files', 'hours.md'), '# Hours\n\nOpen from nine to five on weekdays.');
  writeFileSync(join(dir, 'files', 'citing.pdf'), '%PDF');
  writeFileSync(join(dir, 'files', 'citing.md'), '# Citing\n\nCite the author.');
  writeFileSync(join(dir, 'course.json'), JSON.stringify(library));
  const fromJson = await scaffold('node', join(dir, 'course.json'), { out: join(dir, 'a') });
  assert.equal(fromJson.package, 'course.viable.zip');
  const read = await readAgentFile(join(dir, 'a', 'package', 'course.viable.zip'));
  assert.equal(read.doc.title, 'Riverside Library help');

  mkdirSync(join(dir, 'guides'));
  writeFileSync(join(dir, 'guides', 'tides.md'), '# Tides\n\nThe moon pulls the sea twice a day.');
  writeFileSync(join(dir, 'sea.agent.json'), JSON.stringify({ format: 'viable.agent', name: 'Sea', graph: { entry: 'k', nodes: [{ id: 'k', type: 'knowledge', config: { knowledge_bases: ['kb_9'] }, next: 'w' }, { id: 'w', type: 'llm', config: { model: 'm', system: '{{k.context}}' }, next: 'out' }, { id: 'out', type: 'output', config: { text: '{{w.content}}' } }] } }));
  const fromAgent = await scaffold('node', join(dir, 'sea.agent.json'), { out: join(dir, 'b'), knowledge: { kb_9: join(dir, 'guides') } });
  assert.equal(fromAgent.package, 'sea.viable.zip');
  assert.ok(!fromAgent.warnings.some((line) => /has no files here/.test(line)));
  const model = await stubModel(t);
  const handle = await createApp({ bytes: readFileSync(join(dir, 'b', 'package', 'sea.viable.zip')), name: 'sea.viable.zip', vars: { OPENAI_BASE_URL: model.url, VIABLE_HARNESS_TOKEN: 't' }, log: () => {} });
  const answer = await handle(new Request('https://x.example/v1/agents/sea/runs', { method: 'POST', headers: { authorization: 'Bearer t', 'content-type': 'application/json' }, body: JSON.stringify({ input: 'moon sea' }) }));
  assert.equal(answer.status, 200);
  assert.match(model.asked[0].text, /twice a day/);

  const without = await scaffold('node', join(dir, 'sea.agent.json'), { out: join(dir, 'c') });
  assert.ok(without.warnings.some((line) => /--knowledge kb_9=<folder>/.test(line)));
});

test('node: the folder runs as its README says, keeps a conversation, and verify passes it', async (t) => {
  const dir = scratch(t);
  const model = await stubModel(t);
  const file = join(dir, 'riverside.viable.zip');
  writeFileSync(file, zipOf());
  const out = join(dir, 'node');
  await scaffold('node', file, { out, plan: modelPlan({ reviewerModel: 'second', map: { 'writer-1': 'first' } }) });
  linkEntities(out);
  const child = spawn(process.execPath, ['server.js'], { cwd: out, env: { PATH: process.env.PATH, PORT: '0', OPENAI_BASE_URL: model.url, OPENAI_API_KEY: 'model-key', VIABLE_HARNESS_TOKEN: 'walk-token', VIABLE_HARNESS_KEEP_DAYS: '30' } });
  t.after(() => child.kill());
  let said = '';
  const url = await new Promise((resolve, reject) => {
    child.stderr.on('data', (chunk) => {
      said += chunk;
      const found = /at (http:\/\/127\.0\.0\.1:\d+)/.exec(said);
      if (found) resolve(found[1]);
    });
    child.on('exit', () => reject(new Error(said)));
  });
  const headers = { authorization: 'Bearer walk-token', 'content-type': 'application/json' };
  const run = async (body) => (await globalThis.fetch(`${url}/v1/agents/library-help/runs`, { method: 'POST', headers, body: JSON.stringify(body) })).json();
  const first = await run({ input: 'When is the reading room open?', user: 's-1' });
  assert.match(first.conversation_id, /^agtc_/);
  const second = await run({ input: 'And on Fridays?', conversation_id: first.conversation_id });
  assert.equal(second.conversation_id, first.conversation_id);
  assert.equal(model.asked[0].model, 'first');
  assert.equal(model.asked[1].model, 'second');
  assert.equal(model.asked[0].auth, 'Bearer model-key');
  assert.match(model.asked[0].text, /reading room closes at four/, 'the search reads the zip');
  assert.match(model.asked[2].text, /When is the reading room open/, 'the next turn reads the last');
  assert.ok(existsSync(join(out, 'data', 'conversations', `${first.conversation_id}.json`)), 'kept in its folder');

  const report = await verifyServer(url, { token: 'walk-token', turn: true });
  assert.equal(report.ok, true, JSON.stringify(report.checks));
  assert.deepEqual(report.agents, ['library-help', 'agent-2']);
  assert.equal(report.server.conversations, true);
  assert.deepEqual(report.checks.map((item) => [item.id, item.status]), [['health', 'pass'], ['token', 'pass'], ['agents', 'pass'], ['package', 'pass'], ['chat_page', 'skip'], ['turn', 'pass']]);
  const noToken = await verifyServer(url, {});
  assert.equal(noToken.ok, true);
  assert.equal(noToken.checks.find((item) => item.id === 'agents').status, 'skip');
  const wrong = await verifyServer(url, { token: 'nope' });
  assert.equal(wrong.ok, false);
  assert.match(wrong.checks.find((item) => item.id === 'agents').detail, /token you gave was refused/);
});

test('verify: exit codes, a server with no token, an open server, and the line for a site', async (t) => {
  const model = await stubModel(t);
  const vars = { OPENAI_BASE_URL: model.url };
  const unset = await createApp({ bytes: zipOf(), name: 'r.zip', vars, log: () => {} });
  const a = await listen(unset, { port: 0 });
  t.after(() => a.server.close());
  const refused = await verifyServer(a.url, {});
  assert.equal(refused.ok, false);
  assert.match(refused.checks.find((item) => item.id === 'token').fix, /VIABLE_HARNESS_TOKEN/);

  // With learner routes: a page and a script, and so the embed line and the origins to allow.
  const pages = () => async (request, url) => (url.pathname.startsWith('/chat/') || url.pathname === '/embed.js' ? new Response('ok') : null);
  const set = await createApp({ bytes: zipOf(), name: 'r.zip', vars: { ...vars, VIABLE_HARNESS_TOKEN: 't' }, routes: [pages], log: () => {} });
  const b = await listen(set, { port: 0 });
  t.after(() => b.server.close());
  const found = await verifyServer(b.url, { token: 't', agent: 'library-help' });
  assert.equal(found.ok, true);
  assert.equal(found.embed.script, `<script src="${b.url}/embed.js" data-agent="library-help" async></script>`);
  assert.deepEqual(found.embed.content_security_policy, { 'script-src': [b.url], 'connect-src': [b.url], 'frame-src': [b.url], 'img-src': [b.url] });

  const gone = spawnSync(process.execPath, [CLI, 'verify', 'http://127.0.0.1:9/', '--json'], { encoding: 'utf8' });
  assert.equal(gone.status, 1);
  assert.equal(JSON.parse(gone.stdout).checks[0].status, 'fail');
  assert.equal(spawnSync(process.execPath, [CLI, 'verify'], { encoding: 'utf8' }).status, 2);
  assert.equal(spawnSync(process.execPath, [CLI, 'verify', 'not an address'], { encoding: 'utf8' }).status, 2);
  assert.equal(spawnSync(process.execPath, [CLI, 'verify', 'http://127.0.0.1:9/', '--token-env', 'VIABLE_UNSET_FOR_TEST'], { encoding: 'utf8' }).status, 2);
});

const functionUrlEvent = (method, path, body, headers = {}) => ({
  version: '2.0', routeKey: '$default', rawPath: path, rawQueryString: '', headers: { host: 'abc123.lambda-url.us-east-1.on.aws', 'x-forwarded-proto': 'https', ...headers },
  requestContext: { accountId: 'anonymous', apiId: 'abc123', domainName: 'abc123.lambda-url.us-east-1.on.aws', http: { method, path, protocol: 'HTTP/1.1', sourceIp: '203.0.113.7', userAgent: 'test' }, requestId: 'id', routeKey: '$default', stage: '$default', time: '03/Nov/2026:00:00:00 +0000', timeEpoch: 0 },
  ...(body == null ? {} : { body: Buffer.from(JSON.stringify(body)).toString('base64'), isBase64Encoded: true })
});

test('Lambda: a function URL’s event reaches the handler, base64 and all, and comes back whole', async () => {
  const seen = [];
  const handler = lambdaHandler(async (request, context) => {
    seen.push({ url: request.url, method: request.method, address: context.address, body: request.method === 'POST' ? await request.text() : null, cookie: request.headers.get('cookie') });
    return new Response(JSON.stringify({ ok: true }), { status: 201, headers: [['content-type', 'application/json'], ['set-cookie', 'a=1'], ['set-cookie', 'b=2']] });
  });
  const event = functionUrlEvent('POST', '/v1/agents/x/runs', { input: 'hi' });
  event.rawQueryString = 'a=1';
  event.cookies = ['one=1', 'two=2'];
  const result = await handler(event);
  assert.deepEqual(seen[0], { url: 'https://abc123.lambda-url.us-east-1.on.aws/v1/agents/x/runs?a=1', method: 'POST', address: '203.0.113.7', body: '{"input":"hi"}', cookie: 'one=1; two=2' });
  assert.equal(result.statusCode, 201);
  assert.equal(result.isBase64Encoded, false);
  assert.equal(result.body, '{"ok":true}');
  assert.deepEqual(result.cookies, ['a=1', 'b=2']);
  const binary = await lambdaHandler(async () => new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'application/octet-stream' } }))(functionUrlEvent('GET', '/f'));
  assert.equal(binary.isBase64Encoded, true);
  assert.equal(binary.body, 'AQID');
  assert.equal(eventToRequest(functionUrlEvent('GET', '/f')).method, 'GET');
});

test('aws-lambda: the folder’s handler answers function URL events, streaming, with its store in a stubbed S3', async (t) => {
  const dir = scratch(t);
  const model = await stubModel(t);
  const file = join(dir, 'riverside.viable.zip');
  writeFileSync(file, zipOf());
  const out = join(dir, 'lambda');
  await scaffold('aws-lambda', file, { out });
  linkEntities(out);
  // The S3 this stub keeps in memory answers as the SDK does, NoSuchKey included.
  stubPackage(out, '@aws-sdk/client-s3', { 'package.json': '{"name":"@aws-sdk/client-s3","type":"module","main":"index.js"}', 'index.js': `
    const buckets = globalThis.__s3 = new Map();
    class Command { constructor(input) { this.input = input; } }
    export class GetObjectCommand extends Command {}
    export class PutObjectCommand extends Command {}
    export class DeleteObjectCommand extends Command {}
    export class ListObjectsV2Command extends Command {}
    export class S3Client {
      async send(command) {
        const { Key, Body, Prefix } = command.input;
        if (command instanceof PutObjectCommand) { buckets.set(Key, Body); return {}; }
        if (command instanceof DeleteObjectCommand) { buckets.delete(Key); return {}; }
        if (command instanceof ListObjectsV2Command) return { Contents: [...buckets.keys()].filter((key) => key.startsWith(Prefix)).map((key) => ({ Key: key })) };
        if (!buckets.has(Key)) throw Object.assign(new Error('gone'), { name: 'NoSuchKey' });
        return { Body: { transformToString: async () => buckets.get(Key) } };
      }
    }` });
  // What Lambda's Node runtime gives a streaming function.
  const streams = [];
  globalThis.awslambda = {
    streamifyResponse: (work) => async (event) => {
      const stream = { written: [], ended: false };
      streams.push(stream);
      await work(event, stream, {});
      return stream;
    },
    HttpResponseStream: { from: (stream, prelude) => ({ write: (chunk) => stream.written.push(Buffer.from(chunk).toString()), end: () => { stream.ended = true; stream.prelude = prelude; } }) }
  };
  t.after(() => { delete globalThis.awslambda; delete globalThis.__s3; });
  Object.assign(process.env, { OPENAI_BASE_URL: model.url, VIABLE_HARNESS_TOKEN: 'lambda-token', VIABLE_STORE_BUCKET: 'bucket' });
  t.after(() => { for (const key of ['OPENAI_BASE_URL', 'VIABLE_HARNESS_TOKEN', 'VIABLE_STORE_BUCKET']) delete process.env[key]; });
  const { handler, sweep } = await import(pathToFileURL(join(out, 'index.js')));
  const auth = { authorization: 'Bearer lambda-token', 'content-type': 'application/json' };
  assert.equal(typeof (await sweep()).deleted, 'number', 'the daily function runs on the same store');

  const health = await handler(functionUrlEvent('GET', '/health'));
  assert.equal(health.prelude.statusCode, 200);
  assert.deepEqual(JSON.parse(health.written.join('')), { status: 'ok', agents: 2 });
  assert.equal((await handler(functionUrlEvent('GET', '/v1/agents'))).prelude.statusCode, 401);

  const first = await handler(functionUrlEvent('POST', '/v1/agents/library-help/runs', { input: 'When is the reading room open?' }, auth));
  const answer = JSON.parse(first.written.join(''));
  assert.equal(first.prelude.statusCode, 200);
  assert.match(answer.conversation_id, /^agtc_/);
  assert.ok(globalThis.__s3.has(`conversations/${answer.conversation_id}`), 'kept in the bucket');
  assert.match(model.asked[0].text, /reading room closes at four/);

  const streamed = await handler(functionUrlEvent('POST', '/v1/agents/library-help/runs', { input: 'And on Fridays?', conversation_id: answer.conversation_id, stream: true }, auth));
  assert.match(streamed.prelude.headers['content-type'], /event-stream/);
  assert.match(streamed.written.join(''), /event: run\.started[\s\S]*event: run\.completed/);
  assert.match(model.asked.at(-2).text, /When is the reading room open/);
});

// A response as Express gives one, enough for node.js's adapter: pipeline writes to it as a stream.
async function callExpress(listener, { method = 'GET', url = '/health', headers = {}, body = null, ip = '203.0.113.8' }) {
  const { ServerResponse, IncomingMessage } = await import('node:http');
  const { Socket } = await import('node:net');
  const req = new IncomingMessage(new Socket());
  Object.assign(req, { method, url, headers: { host: 'harness-abc.a.run.app', 'x-forwarded-proto': 'https', ...headers }, ip });
  if (body != null) req.rawBody = Buffer.from(JSON.stringify(body));
  const res = new ServerResponse(req);
  const chunks = [];
  const socket = new (await import('node:stream')).Writable({ write(chunk, _encoding, done) { chunks.push(chunk); done(); } });
  res.assignSocket(socket);
  await listener(req, res);
  const raw = Buffer.concat(chunks).toString();
  const [head, ...rest] = raw.split('\r\n\r\n');
  const chunked = /transfer-encoding: chunked/i.test(head);
  const text = rest.join('\r\n\r\n');
  return { status: Number(head.split(' ')[1]), head, body: chunked ? text.split('\r\n').filter((_, at) => at % 2).join('') : text };
}

test('firebase: the folder’s function answers Express-style requests whose body is already read', async (t) => {
  const dir = scratch(t);
  const model = await stubModel(t);
  const file = join(dir, 'riverside.viable.zip');
  writeFileSync(file, zipOf());
  const out = join(dir, 'firebase');
  await scaffold('firebase', file, { out });
  const functions = join(out, 'functions');
  linkEntities(functions);
  // firebase-functions, as far as a deployed function reaches it: secrets and strings from the environment, onRequest giving back the function.
  stubPackage(functions, 'firebase-functions', {
    'package.json': '{"name":"firebase-functions","type":"module","exports":{"./params":"./params.js","./v2/https":"./https.js","./v2/scheduler":"./scheduler.js"}}',
    'scheduler.js': 'export const onSchedule = (options, handler) => Object.assign(handler, { options });\n',
    'params.js': 'const param = (name, options = {}) => ({ value: () => process.env[name] ?? options.default ?? "" });\nexport const defineSecret = param;\nexport const defineString = param;\n',
    'https.js': 'export const onRequest = (options, handler) => Object.assign(handler, { options });\n'
  });
  stubPackage(functions, 'firebase-admin', {
    'package.json': '{"name":"firebase-admin","type":"module","exports":{"./app":"./app.js","./firestore":"./firestore.js"}}',
    'app.js': 'export const getApps = () => [1];\nexport const initializeApp = () => {};\n',
    'firestore.js': `
      const documents = globalThis.__firestore = new Map();
      const docOf = (id) => ({ get: async () => ({ exists: documents.has(id), data: () => documents.get(id) }), set: async (value) => { documents.set(id, value); }, delete: async () => { documents.delete(id); } });
      export const FieldPath = { documentId: () => '__name__' };
      export const getFirestore = () => ({ collection: () => ({
        doc: docOf,
        orderBy() { return { startAt: (from) => ({ endBefore: () => ({ select: () => ({ get: async () => ({ docs: [...documents.keys()].filter((id) => id.startsWith(from)).map((id) => ({ id })) }) }) }) }) }; }
      }) });`
  });
  t.after(() => { delete globalThis.__firestore; });
  Object.assign(process.env, { OPENAI_BASE_URL: model.url, OPENAI_API_KEY: 'k', VIABLE_HARNESS_TOKEN: 'firebase-token' });
  t.after(() => { for (const key of ['OPENAI_BASE_URL', 'OPENAI_API_KEY', 'VIABLE_HARNESS_TOKEN']) delete process.env[key]; });
  const { harness } = await import(pathToFileURL(join(functions, 'index.js')));
  assert.equal(harness.options.invoker, 'public');
  assert.equal(harness.options.secrets.length, 2);

  assert.equal((await callExpress(harness, {})).status, 200);
  const headers = { authorization: 'Bearer firebase-token', 'content-type': 'application/json' };
  const run = await callExpress(harness, { method: 'POST', url: '/v1/agents/library-help/runs', headers, body: { input: 'When is the reading room open?' } });
  assert.equal(run.status, 200, run.body);
  const answer = JSON.parse(run.body);
  assert.match(answer.conversation_id, /^agtc_/);
  assert.ok(globalThis.__firestore.has(encodeURIComponent(`conversations/${answer.conversation_id}`)), 'kept in Firestore');
  assert.equal((await callExpress(harness, { method: 'POST', url: '/v1/agents/library-help/runs', body: { input: 'hi' } })).status, 401);
  const stream = await callExpress(harness, { method: 'POST', url: '/v1/agents/library-help/runs', headers, body: { input: 'And on Fridays?', conversation_id: answer.conversation_id, stream: true } });
  assert.match(stream.body, /event: run\.started[\s\S]*event: run\.completed/);
});

test('cloudflare: its D1 store keeps JSON, escapes nothing it shouldn’t, and lists by exact prefix', async (t) => {
  const dir = scratch(t);
  const file = join(dir, 'riverside.viable.zip');
  writeFileSync(file, zipOf());
  await scaffold('cloudflare', file, { out: join(dir, 'cf') });
  const toml = readFileSync(join(dir, 'cf', 'wrangler.toml'), 'utf8');
  assert.match(toml, /run_worker_first = true/, 'the package is never served');
  assert.match(toml, /binding = "DB"/);
  const worker = readFileSync(join(dir, 'cf', 'index.js'), 'utf8');
  assert.match(worker, /d1Store\(env\.DB\)/);
  assert.ok(!/from 'node:/.test(worker));
  const { d1Store } = await import(pathToFileURL(join(dir, 'cf', 'store.js')));
  const sqlite = new DatabaseSync(':memory:');
  // D1's API over SQLite, as far as the store reaches it.
  const db = { prepare: (sql) => {
    const statement = sqlite.prepare(sql);
    const make = (args) => ({ run: async () => statement.run(...args), first: async () => statement.get(...args) ?? null, all: async () => ({ results: statement.all(...args) }), bind: (...next) => make(next) });
    return make([]);
  } };
  const store = d1Store(db);
  assert.equal(await store.get('none'), null);
  await store.put('runs/a', { n: 1 });
  await store.put('runs/a', { n: 2 });
  await store.put('runs_b', { n: 3 });
  await store.put('conversations/c', 'text');
  assert.deepEqual(await store.get('runs/a'), { n: 2 });
  assert.deepEqual(await store.list('runs/'), ['runs/a']);
  assert.deepEqual(await store.list(''), ['conversations/c', 'runs/a', 'runs_b']);
  await store.delete('runs/a');
  assert.equal(await store.get('runs/a'), null);
});

test('the node adapter streams a body to the handler, and refuses a large one with the connection closed', async (t) => {
  const handle = await createApp({ bytes: zipOf(), name: 'r.zip', vars: { VIABLE_HARNESS_TOKEN: 't', OPENAI_BASE_URL: 'http://127.0.0.1:9/v1' }, log: () => {} });
  const { server, url } = await listen(handle, { port: 0 });
  t.after(() => server.close());
  const big = 'x'.repeat(2 * 1024 * 1024);
  const response = await globalThis.fetch(`${url}/v1/agents/library-help/runs`, { method: 'POST', headers: { authorization: 'Bearer t', 'content-type': 'application/json' }, body: big });
  assert.equal(response.status, 413);
  assert.equal((await response.json()).error.code, 'agent_input_too_large');
});

test('the Dockerfile copies what the folder has (Docker itself isn’t run here)', async (t) => {
  const dir = scratch(t);
  const file = join(dir, 'riverside.viable.zip');
  writeFileSync(file, zipOf());
  for (const target of ['docker', 'cloud-run']) {
    const out = join(dir, target);
    await scaffold(target, file, { out });
    const sources = [...readFileSync(join(out, 'Dockerfile'), 'utf8').matchAll(/^COPY (.+) \S+$/gm)].flatMap((match) => match[1].split(' '));
    assert.ok(sources.length >= 4);
    for (const source of sources) assert.ok(existsSync(join(out, source)), `${target}: COPY ${source}`);
  }
});

// As Docker reads a .dockerignore: the last rule that matches a path, or a folder it is in, decides.
function leftOut(rules, path) {
  let out = false;
  for (const rule of rules) {
    const keep = rule.startsWith('!');
    const pattern = keep ? rule.slice(1) : rule;
    const parts = path.split('/');
    const hit = pattern === '*' || path === pattern || path.startsWith(`${pattern}/`)
      || (pattern.startsWith('**/') && parts.some((part) => part === pattern.slice(3) || (pattern.endsWith('*') && part.startsWith(pattern.slice(3, -1)))));
    if (hit) out = !keep;
  }
  return out;
}

test('the root Dockerfile: its .dockerignore lets through what it copies, and its first stage builds from only that', async (t) => {
  const docker = readFileSync(join(ROOT, 'Dockerfile'), 'utf8');
  const rules = readFileSync(join(ROOT, '.dockerignore'), 'utf8').split('\n').filter((line) => line.trim() && !line.startsWith('#'));
  const sourcesOf = (text) => [...text.matchAll(/^COPY (?!--from)(.+) \S+$/gm)].flatMap((match) => match[1].split(' '));
  const copied = sourcesOf(docker);
  assert.ok(copied.length >= 10);
  for (const source of copied) {
    assert.ok(existsSync(join(ROOT, source)), `COPY ${source}`);
    assert.equal(leftOut(rules, source), false, `.dockerignore leaves out ${source}`);
  }
  for (const path of ['.env', 'examples/.env.local', 'docs/self-hosting.md', 'node_modules/entities/package.json', 'src/node_modules/x', 'dist/_headers', 'scripts/prepare.mjs']) assert.equal(leftOut(rules, path), true, `a build shouldn't get ${path}`);

  const stage = docker.split(/^FROM /m)[1];
  assert.match(stage, /^--platform=\$BUILDPLATFORM /, 'esbuild crashes under QEMU in a cross-build');
  assert.match(stage, /npm ci --ignore-scripts/, 'prepare needs files not copied yet');
  if (!existsSync(join(ROOT, 'node_modules', 'esbuild'))) return t.skip('the build tools aren\'t installed');
  const dir = scratch(t);
  for (const source of sourcesOf(stage)) cpSync(join(ROOT, source), join(dir, source), { recursive: true });
  symlinkSync(join(ROOT, 'node_modules'), join(dir, 'node_modules'));
  const built = spawnSync(process.execPath, ['scripts/build-learner-assets.mjs'], { cwd: dir, encoding: 'utf8' });
  assert.equal(built.status, 0, built.stderr);
  assert.ok(existsSync(join(dir, 'dist', 'v1', 'agents', 'chat-assets', 'manifest.json')));
});

const startScaffold = (t, out, env) => {
  const child = spawn(process.execPath, ['server.js'], { cwd: out, env: { PATH: process.env.PATH, PORT: '0', VIABLE_HARNESS_TOKEN: 'walk-token', ...env } });
  t.after(() => child.kill('SIGKILL'));
  let said = '';
  const exited = new Promise((resolve) => { child.on('exit', (code) => resolve({ code, said })); });
  const url = new Promise((resolve) => {
    child.stderr.on('data', (chunk) => {
      said += chunk;
      const found = /at (http:\/\/127\.0\.0\.1:\d+)/.exec(said);
      if (found) resolve(found[1]);
    });
    exited.then(() => resolve(null));
  });
  return { child, url, exited };
};

test('a scaffold stopped with a run under way answers it and keeps it, then exits', async (t) => {
  const dir = scratch(t);
  const file = join(dir, 'riverside.viable.zip');
  writeFileSync(file, zipOf());
  const out = join(dir, 'docker');
  await scaffold('docker', file, { out, plan: modelPlan({ model: 'first' }) });
  linkEntities(out);
  let arrived;
  const asked = new Promise((resolve) => { arrived = resolve; });
  let release;
  const held = new Promise((resolve) => { release = resolve; });
  const model = createServer((req, res) => {
    req.resume();
    req.on('end', async () => {
      arrived();
      await held;
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content: 'PASS' }, finish_reason: 'stop' }], usage: {} }));
    });
  });
  await new Promise((resolve) => { model.listen(0, '127.0.0.1', resolve); });
  t.after(() => model.close());
  const { child, url, exited } = startScaffold(t, out, { OPENAI_BASE_URL: `http://127.0.0.1:${model.address().port}/v1`, VIABLE_HARNESS_DATA_DIR: join(dir, 'kept') });
  const turn = globalThis.fetch(`${await url}/v1/agents/agent-2/runs`, { method: 'POST', headers: { authorization: 'Bearer walk-token', 'content-type': 'application/json' }, body: JSON.stringify({ input: 'Help me cite this.', user: 's-1' }) });
  await asked;
  child.kill('SIGTERM');
  await new Promise((resolve) => { setTimeout(resolve, 150); });
  assert.equal(child.exitCode, null, 'it waits for the run');
  release();
  const answered = await (await turn).json();
  assert.match(answered.conversation_id, /^agtc_/);
  const started = Date.now();
  assert.equal((await exited).code, 0);
  assert.ok(Date.now() - started < 2000, 'and doesn\'t wait for a client that keeps its connection');
  assert.ok(existsSync(join(dir, 'kept', 'conversations', `${answered.conversation_id}.json`)));
});

test('a server that can\'t write its folder won\'t start, and says what to do', async (t) => {
  const dir = scratch(t);
  const file = join(dir, 'riverside.viable.zip');
  writeFileSync(file, zipOf());
  writeFileSync(join(dir, 'a-file'), '');
  const blocked = join(dir, 'a-file', 'data');
  const out = join(dir, 'docker');
  await scaffold('docker', file, { out });
  linkEntities(out);
  const { url, exited } = startScaffold(t, out, { VIABLE_HARNESS_DATA_DIR: blocked });
  assert.equal(await url, null);
  const { code, said } = await exited;
  assert.equal(code, 1);
  assert.match(said, /can't write to .*a-file\/data \(\w+\).*named volume/);
  const served = spawnSync(process.execPath, [CLI, 'serve', file, '--data-dir', blocked], { encoding: 'utf8' });
  assert.equal(served.status, 1);
  assert.match(served.stderr, /can't write to .*a-file\/data \(\w+\).*named volume/);
});

test('an endpoint it can\'t reach is a provider error that says what to do; a stop stays a stop', async (t) => {
  t.mock.method(console, 'error', () => {});
  const refused = () => { throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNREFUSED' } }); };
  const inContainer = openAICompatible({ baseUrl: 'http://localhost:11434/v1', model: 'm', fetch: refused });
  await assert.rejects(inContainer({}, { model: 'x', messages: [] }), (error) => {
    assert.equal(error.code, 'provider_error');
    assert.equal(error.status, 502);
    assert.match(error.message, /localhost:11434.*can't be reached: ECONNREFUSED.*OPENAI_BASE_URL.*host\.docker\.internal/);
    return true;
  });
  const elsewhere = openAICompatible({ baseUrl: 'https://models.example.edu/v1', model: 'm', fetch: refused });
  await assert.rejects(elsewhere({}, { model: 'x', messages: [] }), (error) => !/host\.docker\.internal/.test(error.message) && /OPENAI_BASE_URL/.test(error.message));
  const stopped = new DOMException('Stopped', 'AbortError');
  const cut = openAICompatible({ baseUrl: 'http://localhost:1/v1', model: 'm', fetch: () => { throw stopped; } });
  await assert.rejects(cut({}, { model: 'x', messages: [] }), (error) => error === stopped);

  const dir = scratch(t);
  const file = join(dir, 'riverside.viable.zip');
  writeFileSync(file, zipOf());
  const handle = await createApp({ bytes: zipOf(), name: 'riverside.viable.zip', vars: { VIABLE_HARNESS_TOKEN: 't', OPENAI_BASE_URL: 'http://localhost:11434/v1' }, fetch: refused, models: { reply: 'm' } });
  const answer = await handle(new Request('http://x.test/v1/agents/agent-2/runs', { method: 'POST', headers: { authorization: 'Bearer t', 'content-type': 'application/json' }, body: JSON.stringify({ input: 'Help me cite this.' }) }));
  assert.equal(answer.status, 502);
  assert.equal((await answer.json()).error.code, 'provider_error');
  const icon = await handle(new Request('http://x.test/favicon.ico'));
  assert.equal(icon.status, 204, 'not an error in every page\'s console');
});

test('the docker scaffold: records and forget from inside the container, and Compose', async (t) => {
  const dir = scratch(t);
  const file = join(dir, 'riverside.viable.zip');
  writeFileSync(file, zipOf());
  const out = join(dir, 'docker');
  await scaffold('docker', file, { out });
  linkEntities(out);
  const readme = readFileSync(join(out, 'README.md'), 'utf8');
  const name = /docker build -t (\S+) \./.exec(readme)[1];
  assert.match(readme, new RegExp(`docker exec ${name} node records.js forget`));
  assert.match(readme, /docker compose up -d --build/);
  assert.match(readFileSync(join(out, 'Dockerfile'), 'utf8'), /^COPY server\.js records\.js models\.json/m);
  const compose = readFileSync(join(out, 'compose.yaml'), 'utf8');
  assert.match(compose, new RegExp(`^  ${name}:$`, 'm'));
  assert.match(compose, /VIABLE_HARNESS_KEEP_DAYS: \$\{VIABLE_HARNESS_KEEP_DAYS:-180\}/);
  assert.match(compose, /- data:\/data/);
  assert.match(compose, /\$\{VIABLE_HARNESS_TOKEN:\?/, 'it refuses to start with no token');

  const data = join(dir, 'kept');
  const conversation = { id: 'agtc_1', agent: 'library-help', user: 's-0412', updated_at: new Date().toISOString(), messages: [] };
  mkdirSync(join(data, 'conversations'), { recursive: true });
  writeFileSync(join(data, 'conversations', 'agtc_1.json'), JSON.stringify(conversation));
  const records = (...args) => spawnSync(process.execPath, ['records.js', ...args], { cwd: out, encoding: 'utf8' });
  assert.equal(records('export', '--data-dir', data, '--out', join(dir, 'records')).status, 0);
  const gone = records('forget', 's-0412', '--data-dir', data);
  assert.equal(gone.status, 0, gone.stderr);
  assert.match(gone.stdout, /1 conversations/);
  assert.equal(existsSync(join(data, 'conversations', 'agtc_1.json')), false);
  assert.match(records().stderr, /viable-harness records export/);

  const none = join(dir, 'none');
  await scaffold('docker', file, { out: none, store: 'none' });
  assert.equal(existsSync(join(none, 'records.js')), false);
  assert.match(readFileSync(join(none, 'Dockerfile'), 'utf8'), /^COPY server\.js models\.json/m);
  assert.doesNotMatch(readFileSync(join(none, 'compose.yaml'), 'utf8'), /volumes|KEEP_DAYS/);
  assert.doesNotMatch(readFileSync(join(none, 'README.md'), 'utf8'), /records\.js/);
  const run = join(dir, 'cloud-run');
  await scaffold('cloud-run', file, { out: run });
  assert.equal(existsSync(join(run, 'compose.yaml')), false, 'Cloud Run has no Compose');
  assert.ok(existsSync(join(run, 'vendor', 'harness', 'src', 'cli', 'records.js')), 'its Dockerfile copies records.js, which needs this');
});

test('scaffolds keep the rules: no package files in what is served, no secrets in what is written', async (t) => {
  const dir = scratch(t);
  const file = join(dir, 'riverside.viable.zip');
  writeFileSync(file, zipOf());
  for (const target of TARGET_NAMES) {
    const out = join(dir, target);
    await scaffold(target, file, { out });
    for (const path of allFiles(out)) {
      if (path.includes('vendor') || path.endsWith('.zip') || path.includes('node_modules') || path.includes('chat-assets')) continue;
      const text = readFileSync(path, 'utf8');
      assert.ok(!/sk-[a-z0-9]{8}/i.test(text), path);
    }
  }
  assert.match(readFileSync(resolve(dir, 'node', '.gitignore'), 'utf8'), /\.env/);
  assert.match(readFileSync(resolve(dir, 'cloudflare', '.gitignore'), 'utf8'), /\.dev\.vars/);
});
