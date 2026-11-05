// viable-harness review: what it finds in a tool built in a hurry, what it leaves alone, and that a secret it finds is never repeated.
import './no-network.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { reviewProject } from '../src/builders/review.js';
import { readAgentTests } from '../src/agentTests.js';

const BIN = fileURLToPath(new URL('../bin/viable-harness.mjs', import.meta.url));
// Written in pieces, so nothing here looks like a real key to a scanner.
const FAKE_KEY = `sk-${'a1b2c3d4'.repeat(4)}`;

function project(t, files) {
  const folder = mkdtempSync(join(tmpdir(), 'review-'));
  t.after(() => rmSync(folder, { recursive: true, force: true }));
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(folder, path)), { recursive: true });
    writeFileSync(join(folder, path), text);
  }
  return folder;
}
const ids = (folder) => reviewProject(folder).findings.map((finding) => finding.id);

test('a quiz with a tutor, built in a hurry: each thing a classroom trips on is found, with where', (t) => {
  const folder = project(t, {
    'index.html': `<html><script src="https://www.googletagmanager.com/gtag/js?id=G-1"></script><script>
      const KEY = '${FAKE_KEY}';
      const questions = [{ question: 'What is 1/2 + 1/3?', answer: '5/6' }];
      localStorage.setItem('studentName', input.value);
      fetch('https://api.openai.com/v1/chat/completions', { body: JSON.stringify({ messages: [{ role: 'system', content: 'Answer key: 5/6' }] }) });
    </script></html>`,
    'firestore.rules': 'service cloud.firestore { match /databases/{d}/documents { match /{document=**} { allow read, write: if true; } } }',
    'server/limit.js': `import rateLimit from 'express-rate-limit';\nexport const limit = rateLimit({ windowMs: 60000, max: 10 });`,
    'server/chat.js': `const reply = await openai.chat.completions.create({ model, messages: [{ role: 'user', content: student.name + ' says ' + text }] });`,
    'src/signin.js': `import { createClient } from '@supabase/supabase-js';\nawait supabase.auth.signInAnonymously();`
  });
  const reviewed = reviewProject(folder);
  assert.deepEqual(reviewed.findings.map((finding) => finding.id), ['secret-in-code', 'model-called-from-the-page', 'open-database', 'limit-by-address', 'sign-in-limits', 'prompt-in-the-page', 'answers-in-the-page', 'no-output-limit', 'no-budget', 'no-teacher-view', 'names-to-the-model', 'name-kept-in-the-browser', 'trackers']);
  assert.equal(reviewed.must, 4);
  const secret = reviewed.findings.find((finding) => finding.id === 'secret-in-code');
  assert.deepEqual(secret.at, [{ file: 'index.html', line: 2 }]);
  assert.doesNotMatch(JSON.stringify(reviewed), new RegExp(FAKE_KEY), 'a secret it found is never repeated');
});

test('what is meant to be public, or kept on a server, is left alone', (t) => {
  const folder = project(t, {
    'src/firebase.js': `const firebaseConfig = { apiKey: 'AIza${'x'.repeat(35)}', authDomain: 'class.firebaseapp.com' }; document.title = 'x';`,
    'src/env.js': 'const url = import.meta.env.VITE_SUPABASE_ANON_KEY; const f = import.meta.env.VITE_FIREBASE_API_KEY; document.title = url + f;',
    'server/chat.js': `export default async (req) => { await spendFor(req.class); return openai.chat.completions.create({ model: 'x', max_tokens: 500, messages: [{ role: 'system', content: 'You are a tutor.' }] }); };`,
    'server/teacher.js': `export const page = () => 'What the class did';`,
    'public/labels.js': `const label = { learner: 'Learner', answer: 'Answer tried', hint: 'Hint shown and a good deal more text' };\ndocument.title = 'question';`,
    '.env.example': 'OPENAI_API_KEY=',
    'server/limit.js': `export const limit = rateLimit({ keyGenerator: (req) => req.session.learner, max: 30 });`,
    'node_modules/bad/index.js': `const KEY = '${FAKE_KEY}';`,
    'tests/fixture.js': `const KEY = '${FAKE_KEY}';`,
    'README.md': `Your key looks like ${FAKE_KEY}.`,
    'src/comment.js': `// const KEY = '${FAKE_KEY}';\ndocument.title = '';`
  });
  assert.deepEqual(ids(folder), []);
});

test('a limit by address is found however it is written', (t) => {
  for (const code of [
    `const limit = new Ratelimit({ limiter: Ratelimit.slidingWindow(10, '1 m') });\nconst { success } = await limit.limit(ip);`,
    `const limiter = rateLimiter();\nconst who = request.headers.get('x-forwarded-for');`,
    `const rate_limit = {};\nrate_limit[req.ip] = (rate_limit[req.ip] || 0) + 1;`
  ]) assert.deepEqual(ids(project(t, { 'server/a.js': code })), ['limit-by-address'], code);
  assert.deepEqual(ids(project(t, { 'api/a.py': 'from flask_limiter import Limiter\nlimiter = Limiter(key_func=get_remote_address)' })), ['limit-by-address']);
});

test('what a first try at a tool got past it before', (t) => {
  assert.deepEqual(ids(project(t, { 'public/scripts/chat.js': `fetch('https://api.openai.com/v1/chat/completions');` })), ['model-called-from-the-page', 'no-output-limit', 'no-budget', 'no-teacher-view'], 'a public folder reaches the browser, whatever its name inside');
  assert.deepEqual(ids(project(t, { 'server.js': `const hits = new Map();\nconst ip = req.socket.remoteAddress;\nif (hits.get(ip) > 10) res.writeHead(429);` })), ['limit-by-address']);
  assert.deepEqual(ids(project(t, { 'server.js': `app.use(express.static(__dirname));` })), ['server-shows-its-folder']);
  assert.deepEqual(ids(project(t, { 'public/quiz.js': `const items = [{ q: 'What is 1/2 + 1/3?', a: '5/6' }];` })), ['answers-in-the-page']);
  assert.deepEqual(ids(project(t, { 'prompt.txt': `Use the key ${FAKE_KEY} for this.` })), ['secret-in-code'], 'a prompt kept in a text file is read too');
  assert.deepEqual(ids(project(t, { '.env': 'OPENAI_API_KEY=x' })), ['env-can-be-committed']);
  assert.deepEqual(ids(project(t, { '.env': 'OPENAI_API_KEY=x', '.gitignore': 'node_modules\n.env\n' })), []);
});

test('a line someone has looked at can say so, with why', (t) => {
  const code = `const tries = new Map(); // too many wrong codes\n// viable-review: ok, a high ceiling on wrong codes, for a whole school\nconst ip = req.ip;`;
  assert.deepEqual(ids(project(t, { 'server/join.js': code })), []);
  assert.deepEqual(ids(project(t, { 'server/join.js': code.replace('viable-review: ok', 'a note') })), ['limit-by-address']);
});

test('in Next, a component without "use client" stays on the server', (t) => {
  const server = { 'next.config.js': 'module.exports = {};', 'app/page.tsx': `export default async function Page() { const r = await fetch('https://api.openai.com/v1/models'); return <p>x</p>; }` };
  assert.deepEqual(ids(project(t, server)), []);
  const client = { ...server, 'app/page.tsx': `'use client';\nexport default function Page() { fetch('https://api.openai.com/v1/models'); return <p>x</p>; }` };
  assert.deepEqual(ids(project(t, client)), ['model-called-from-the-page']);
});

test('the command says what to do, and fails only on what must be fixed', (t) => {
  const bad = project(t, { 'firestore.rules': 'allow read, write;' });
  const run = spawnSync(process.execPath, [BIN, 'review', bad], { encoding: 'utf8' });
  assert.equal(run.status, 1);
  assert.match(run.stdout, /Read 1 file\. No model was called/);
  assert.match(run.stdout, /Fix before learners use it/);
  assert.match(run.stdout, /firestore\.rules:1/);
  assert.match(run.stdout, /a clean result isn’t a pass/);

  const fine = spawnSync(process.execPath, [BIN, 'review', project(t, { 'index.html': '<p>A page.</p>' })], { encoding: 'utf8' });
  assert.equal(fine.status, 0);
  assert.match(fine.stdout, /Nothing it looks for turned up/);
  assert.match(fine.stdout, /a clean result isn’t a pass/, 'a clean result still says what it can’t see');

  const json = JSON.parse(spawnSync(process.execPath, [BIN, 'review', bad, '--json'], { encoding: 'utf8' }).stdout);
  assert.equal(json.findings[0].id, 'open-database');
});

test('the tests for a tutor are a file the test command takes, covering what the Skill says they cover', () => {
  const cases = readAgentTests(JSON.parse(readFileSync(new URL('../skills/building-for-learners/tutor-tests.json', import.meta.url), 'utf8')));
  assert.equal(cases.length, 14);
  assert.ok(cases.some((item) => item.messages?.length > 1), 'some are conversations, not single messages');
  for (const item of cases) assert.ok(item.must_not, `${item.name} says what a reply must not do`);
});
