// Every example in examples/ runs locally as it is, on a scripted OpenAI-compatible endpoint.
import '../../harness/test/no-network.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runAgent } from '../src/index.js';

const EXAMPLES = fileURLToPath(new URL('../../examples/', import.meta.url));
const GUIDES = fileURLToPath(new URL('./fixtures/library/', import.meta.url));
const json = (path) => JSON.parse(readFileSync(path, 'utf8'));
const MP3 = new Uint8Array([0x49, 0x44, 0x33, 3, 0, 0, 0, 0, 0, 0, 0xff, 0xfb, 0x90, 0x00]);

// The endpoint answers chat (a VETTING review passes), speech (a few MP3 bytes), and serves the
// library guides at their addresses, as developers.viablelab.org does.
function endpoint() {
  const calls = [];
  const fetch = async (url, init = {}) => {
    calls.push({ url, body: init.body ? JSON.parse(init.body) : null });
    if (url.startsWith('https://developers.viablelab.org/docs/examples/files/library/')) {
      return new Response(readFileSync(join(GUIDES, url.split('/').pop())), { headers: { 'content-type': 'text/markdown' } });
    }
    if (url.endsWith('/audio/speech')) return new Response(MP3, { headers: { 'content-type': 'audio/mpeg' } });
    const review = calls.at(-1).body.messages.some((message) => String(message.content).includes('"PASS"'));
    const content = review ? 'PASS' : 'Check who wrote it [1]. What could you look up first?';
    return new Response(JSON.stringify({ choices: [{ message: { role: 'assistant', content }, finish_reason: 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 } }), { headers: { 'content-type': 'application/json' } });
  };
  return { fetch, calls };
}

test('all six examples run locally, each step done or skipped with its reason', async (t) => {
  const audioDir = mkdtempSync(join(tmpdir(), 'viable-harness-test-'));
  t.after(() => rmSync(audioDir, { recursive: true, force: true }));
  const files = readdirSync(EXAMPLES).filter((name) => name.endsWith('.json'));
  assert.equal(files.length, 6);
  const results = {};
  for (const name of files) {
    const { fetch, calls } = endpoint();
    const result = await runAgent(json(join(EXAMPLES, name)), { input: 'How do I know if a website is trustworthy?', fetch, audioDir });
    results[name] = { result, calls };
    for (const step of result.steps) {
      assert.equal(step.status, 'completed', `${name}: ${step.nodeId} ${step.error || ''}`);
      if (step.output?.skipped) assert.ok(typeof step.output.skipped === 'string' || step.output.reason, `${name}: ${step.nodeId} says why it was skipped`);
    }
    assert.ok(result.output.text, `${name} replies`);
  }

  const library = results['library-research-help.json'];
  const search = library.result.steps.find((step) => step.nodeType === 'knowledge');
  assert.equal(search.output.results[0].title, 'Evaluating sources', 'the guide on judging sources ranks first');
  assert.equal(library.calls.filter((call) => call.url.endsWith('.md')).length, 4, 'each guide is downloaded once');
  assert.deepEqual(library.result.output.citations.map((item) => [item.index, item.title, item.knowledge_base_id]), [[1, 'Evaluating sources', 'guides']]);
  assert.match(library.calls.at(-1).body.messages[0].content, /\[1\] Evaluating sources \(https:\/\/developers\.viablelab\.org\/docs\/examples\/files\/library\/evaluating-sources\.md\)/);

  const english = results['english-conversation.json'];
  assert.equal(english.result.steps.find((step) => step.nodeType === 'transcribe').output.skipped, 'No recording was sent.');
  const speech = english.calls.find((call) => call.url.endsWith('/audio/speech'));
  assert.deepEqual(speech.body, { model: 'kokoro', input: 'Check who wrote it. What could you look up first?', voice: 'af_heart', speed: 0.9 });
  const [audio] = english.result.output.attachments;
  assert.equal(audio.type, 'audio');
  assert.ok(audio.url.startsWith(audioDir) && audio.url.endsWith('.mp3'));
  assert.deepEqual(new Uint8Array(readFileSync(audio.url)), MP3);

  const fractions = results['fractions-practice.json'].result;
  assert.equal(fractions.steps.find((step) => step.nodeType === 'vetting').output.outcome, 'passed');
});

test('the CLI saves a Speech step’s audio and prints its path; --no-speech passes it on', async (t) => {
  const audioDir = mkdtempSync(join(tmpdir(), 'viable-harness-test-'));
  t.after(() => rmSync(audioDir, { recursive: true, force: true }));
  const asked = [];
  const server = createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      asked.push({ url: req.url, body: JSON.parse(body) });
      if (req.url.endsWith('/audio/speech')) { res.setHeader('content-type', 'audio/mpeg'); return res.end(Buffer.from(MP3)); }
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ choices: [{ message: { content: 'A coffee with milk? Sure!' }, finish_reason: 'stop' }], usage: { prompt_tokens: 3, completion_tokens: 2, total_tokens: 5 } }));
    });
  });
  await new Promise((done) => server.listen(0, '127.0.0.1', done));
  t.after(() => server.close());
  const run = (...args) => new Promise((done) => {
    const bin = fileURLToPath(new URL('../bin/viable-engine.mjs', import.meta.url));
    const env = { ...process.env, OPENAI_BASE_URL: `http://127.0.0.1:${server.address().port}/v1`, OPENAI_API_KEY: 'local' };
    const child = spawn(process.execPath, [bin, 'run', join(EXAMPLES, 'english-conversation.json'), '--input', 'I want coffee', ...args], { env });
    let out = '';
    let err = '';
    child.stdout.on('data', (chunk) => { out += chunk; });
    child.stderr.on('data', (chunk) => { err += chunk; });
    child.on('close', (code) => done({ code, out, err }));
  });

  const spoken = await run('--audio-dir', audioDir, '--speech-model', 'gpt-4o-mini-tts');
  assert.equal(spoken.code, 0, spoken.err);
  assert.match(spoken.out, /hear \(transcribe\) completed.*\n {7}skipped: No recording was sent\./);
  const path = /speak \(speech\) completed.*\n {7}audio: (.+\.mp3)/.exec(spoken.out)?.[1];
  assert.ok(path?.startsWith(audioDir) && existsSync(path), spoken.out);
  const speech = asked.find((call) => call.url === '/v1/audio/speech').body;
  assert.equal(speech.model, 'gpt-4o-mini-tts');
  assert.equal(speech.voice, 'nova', 'af_heart becomes the OpenAI voice of its gender');

  const silent = await run('--no-speech');
  assert.equal(silent.code, 0, silent.err);
  assert.match(silent.out, /speak \(speech\) completed.*\n {7}skipped: Replies aren’t read aloud here\./);
  assert.equal(asked.filter((call) => call.url === '/v1/audio/speech').length, 1);
});

test('the CLI runs the library desk from an unzipped package, its guides in files/', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'viable-harness-test-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  mkdirSync(join(dir, 'files'));
  const library = json(join(EXAMPLES, 'library-research-help.json'));
  // As a .viable.zip holds them: by path, still checked against their sha256.
  library.files = library.files.map(({ url: _url, ...file }) => {
    copyFileSync(join(GUIDES, file.name), join(dir, 'files', file.name));
    return { ...file, path: `files/${file.name}` };
  });
  writeFileSync(join(dir, 'package.viable.json'), JSON.stringify(library));
  const server = createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      const cited = /\[1\] Evaluating sources\n/.test(JSON.parse(body).messages[0].content);
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ choices: [{ message: { content: cited ? 'Look up who wrote it [1].' : 'No guide.' }, finish_reason: 'stop' }] }));
    });
  });
  await new Promise((done) => server.listen(0, '127.0.0.1', done));
  t.after(() => server.close());
  const bin = fileURLToPath(new URL('../bin/viable-engine.mjs', import.meta.url));
  const env = { ...process.env, OPENAI_BASE_URL: `http://127.0.0.1:${server.address().port}/v1` };
  const child = spawn(process.execPath, [bin, 'run', join(dir, 'package.viable.json'), '--input', 'Is this website trustworthy?', '--model', 'mistral'], { env });
  let out = '';
  let err = '';
  child.stdout.on('data', (chunk) => { out += chunk; });
  child.stderr.on('data', (chunk) => { err += chunk; });
  assert.equal(await new Promise((done) => child.on('close', done)), 0, err);
  assert.match(out, /Look up who wrote it \[1\]\./);
  assert.match(out, /2\. search \(knowledge\) completed/);
});
