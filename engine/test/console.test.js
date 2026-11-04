// The console: behind the teacher's token, on its session, and it never hands back a key.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { serve } from '../src/serve.js';
import { createApp } from '../src/server/app.js';
import { agentsToServe } from '../src/server/runtime.js';
import { inspectPackage } from '../src/server/inspect.js';
import { modelPlan } from '../src/server/models.js';
import { verifyServer } from '../src/cli/verify.js';
import { memoryStore } from '../../harness/src/store/store.js';

const KEY = 'a-provider-key-that-must-stay-here';
const BIN = fileURLToPath(new URL('../bin/viable-engine.mjs', import.meta.url));
const TOKEN = 'the-token-of-this-server';
const JSON_TYPE = { 'content-type': 'application/json' };
const FORM = { 'content-type': 'application/x-www-form-urlencoded' };
const json = (body, init = {}) => new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' }, ...init });
const desk = { doc: { format: 'viable.agent', format_version: 1, name: 'Desk', graph: { entry: 'write', nodes: [{ id: 'write', type: 'llm', config: { model: 'gpt-x' }, next: 'out' }, { id: 'out', type: 'output', config: { text: '{{write.content}}' } }] }, chat_page: { status: 'active', settings: {} } }, file: 'desk.json', name: 'desk.json' };

function stubProvider() {
  const calls = [];
  const fetch = async (url, init = {}) => {
    const { host, pathname } = new URL(url);
    calls.push({ host, path: pathname.replace(/^\/v1/, ''), key: init.headers?.authorization ?? null, redirect: init.redirect ?? null, body: init.body ? JSON.parse(init.body) : null });
    if (pathname.endsWith('/models')) return host.startsWith('refuses') ? json({ error: { message: `Your key ${KEY} is wrong.` } }, { status: 401 }) : host.startsWith('platform') ? json({ default_model: 'b-model', available_models: [{ id: 'b-model' }] }) : json({ data: [{ id: 'b-model' }, { id: 'a-model' }] });
    if (pathname.endsWith('/chat/completions')) return json({ choices: [{ message: { role: 'assistant', content: 'OK' }, finish_reason: 'stop' }], usage: {} });
    throw new Error(`Nothing answers ${url}`);
  };
  return { calls, fetch };
}

async function started(t, files = [desk], options = {}) {
  const stub = stubProvider();
  const { server, url, settings, teacherToken } = await serve(agentsToServe(files), { port: 0, fetch: stub.fetch, store: memoryStore(), secret: 'a secret for this test', log: () => {}, token: TOKEN, baseUrl: '', apiKey: '', ...options });
  t.after(() => server.close());
  const session = async (token = options.token === undefined ? TOKEN : teacherToken) => {
    const signed = await globalThis.fetch(`${url}/teacher?next=console`, { method: 'POST', redirect: 'manual', headers: { ...FORM, origin: url }, body: new URLSearchParams({ token }) });
    assert.equal(signed.status, 303);
    assert.equal(new URL(signed.headers.get('location'), url).pathname, '/console');
    return signed.headers.getSetCookie();
  };
  const cookieFor = (cookies, path) => cookies.find((cookie) => cookie.includes(`Path=${path};`)).split(';')[0];
  const api = (method, path, body, headers = {}) => globalThis.fetch(`${url}/console/api/${path}`, { method, headers: { ...(method === 'GET' ? {} : { ...JSON_TYPE, origin: url }), ...headers }, ...(method === 'GET' ? {} : { body: JSON.stringify(body ?? {}) }) });
  return { url, settings, session, cookieFor, api, teacherToken, ...stub };
}

test('with no session the console asks for the token, opens nothing, and never takes one from an address', async (t) => {
  const { url, api, calls, settings } = await started(t);
  const page = await globalThis.fetch(`${url}/console`, { headers: { accept: 'text/html' }, redirect: 'manual' });
  assert.equal(page.status, 200);
  const text = await page.text();
  assert.match(text, /Enter this server’s token/);
  assert.match(text, /action="\/teacher\?next=console"/);
  assert.ok(!/Providers|What each model is for/.test(text));
  assert.equal((await globalThis.fetch(`${url}/console/models`)).status, 401);
  assert.equal((await api('GET', 'models')).status, 401);
  for (const [method, path] of [['POST', 'providers'], ['PUT', 'roles/reply'], ['DELETE', 'providers/x'], ['POST', 'providers/x/test']]) {
    assert.equal((await api(method, path, { name: 'X', base_url: 'https://x.example' })).status, 401, `${method} ${path}`);
  }
  for (const cookie of ['viable_teacher=abc', `viable_teacher=${Date.now() + 3600000}.${'a'.repeat(64)}`]) assert.equal((await api('GET', 'models', null, { cookie })).status, 401, cookie);
  assert.equal((await api('GET', 'models', null, { authorization: 'Bearer nope' })).status, 401);
  for (const path of [`/console?token=${TOKEN}`, `/console/models?token=${TOKEN}`, `/console/api/models?token=${TOKEN}`]) {
    const answered = await globalThis.fetch(`${url}${path}`, { redirect: 'manual' });
    assert.equal(answered.status, 400, path);
    assert.equal((await answered.json()).error.code, 'token_in_url');
  }
  assert.equal(calls.length, 0);
  assert.deepEqual((await settings.view()).providers, []);
});

test('one sign-in opens the console and the teacher’s page, and signing out ends both; a learner’s page gets no cookie', async (t) => {
  const { url, session, cookieFor } = await started(t);
  const cookies = await session();
  assert.equal(cookies.length, 3);
  for (const cookie of cookies) { assert.match(cookie, /HttpOnly/); assert.match(cookie, /SameSite=Strict/); assert.ok(!cookie.includes(TOKEN)); }
  assert.deepEqual(cookies.map((cookie) => /Path=([^;]+)/.exec(cookie)[1]).sort(), ['/console', '/course', '/teacher'], 'a chat page’s address never carries it');
  const page = await globalThis.fetch(`${url}/console/models`, { headers: { cookie: cookieFor(cookies, '/console') } });
  assert.equal(page.status, 200);
  assert.match(await page.text(), /<h1>Models<\/h1>/);
  assert.equal((await globalThis.fetch(`${url}/teacher/records.json`, { headers: { cookie: cookieFor(cookies, '/teacher') } })).status, 200);
  assert.match(page.headers.get('content-security-policy'), /script-src 'nonce-[a-f0-9]+'/);
  assert.match(page.headers.get('content-security-policy'), /frame-ancestors 'none'/);
  assert.equal(page.headers.get('cache-control'), 'no-store');
  const wrong = await globalThis.fetch(`${url}/teacher?next=console`, { method: 'POST', redirect: 'manual', headers: { ...FORM, origin: url }, body: 'token=nope' });
  assert.equal(wrong.status, 401);
  assert.match(await wrong.text(), /action="\/teacher\?next=console"/, 'asked again for the same place');
  assert.equal(new URL((await globalThis.fetch(`${url}/teacher?next=https://evil.example`, { method: 'POST', redirect: 'manual', headers: { ...FORM, origin: url }, body: new URLSearchParams({ token: TOKEN }) })).headers.get('location'), url).pathname, '/teacher', 'it goes back to nowhere else');
  const out = await globalThis.fetch(`${url}/teacher/signout?next=console`, { method: 'POST', redirect: 'manual', headers: { origin: url, cookie: cookieFor(cookies, '/teacher') } });
  assert.equal(new URL(out.headers.get('location'), url).pathname, '/console');
  assert.deepEqual(out.headers.getSetCookie().map((cookie) => /Path=([^;]+)/.exec(cookie)[1]).sort(), ['/', '/console', '/course', '/teacher']);
  assert.ok(out.headers.getSetCookie().every((cookie) => /Max-Age=0/.test(cookie)));
});

test('a change needs this console’s own page: another origin, another site, a form or no origin at all are refused', async (t) => {
  const { url, session, cookieFor, api, settings } = await started(t);
  const cookie = cookieFor(await session(), '/console');
  const body = { name: 'Mine', base_url: 'https://mine.example/v1' };
  const send = (headers) => globalThis.fetch(`${url}/console/api/providers`, { method: 'POST', headers: { ...JSON_TYPE, cookie, ...headers }, body: JSON.stringify(body) });
  assert.equal((await send({ origin: 'https://evil.example' })).status, 403);
  assert.equal((await send({ origin: 'null' })).status, 403);
  assert.equal((await send({ origin: url, 'sec-fetch-site': 'cross-site' })).status, 403);
  assert.equal((await send({ origin: url, 'sec-fetch-site': 'same-site' })).status, 403);
  assert.equal((await send({})).status, 403, 'a browser says where a post comes from; with only a cookie, no origin is refused');
  assert.equal((await send({ origin: 'https://evil.example', authorization: `Bearer ${TOKEN}` })).status, 403, 'and the token doesn’t help another site');
  assert.equal((await globalThis.fetch(`${url}/console/api/providers`, { method: 'POST', headers: { 'content-type': 'text/plain', origin: url, cookie }, body: JSON.stringify(body) })).status, 415);
  assert.equal((await globalThis.fetch(`${url}/console/api/providers`, { method: 'POST', headers: { ...FORM, origin: url, cookie }, body: 'name=Mine&base_url=https://mine.example' })).status, 415);
  assert.equal((await api('POST', 'providers', [1, 2], { cookie })).status, 400);
  assert.equal((await globalThis.fetch(`${url}/console/api/providers`, { method: 'POST', headers: { ...JSON_TYPE, origin: url, cookie }, body: '{ nope' })).status, 400);
  assert.deepEqual((await settings.view()).providers, []);
  assert.equal((await send({ origin: url })).status, 200, 'its own page');
  assert.equal((await send({ authorization: `Bearer ${TOKEN}` })).status, 200, 'a program holding the token');
});

test('the whole way through: add, test, try, say what each is for; a key goes in and never comes out', async (t) => {
  const { url, api, session, cookieFor, calls } = await started(t);
  const cookie = cookieFor(await session(), '/console');
  const headers = { cookie };
  const added = await api('POST', 'providers', { name: 'Good', base_url: 'https://good.example/v1/', key: KEY }, headers);
  assert.equal(added.status, 200);
  const { id } = await added.json();
  const tested = await (await api('POST', `providers/${id}/test`, {}, headers)).json();
  assert.deepEqual(tested, { ok: true, count: 2, kept: true });
  assert.deepEqual(calls.at(-1), { host: 'good.example', path: '/models', key: `Bearer ${KEY}`, redirect: 'manual', body: null });
  const asked = await (await api('POST', `providers/${id}/try`, { model: 'a-model' }, headers)).json();
  assert.equal(asked.ok, true);
  assert.equal(asked.reply, 'OK');
  assert.deepEqual([calls.at(-1).path, calls.at(-1).body.model, calls.at(-1).key, calls.at(-1).redirect], ['/chat/completions', 'a-model', `Bearer ${KEY}`, 'manual']);
  assert.equal((await api('PUT', `providers/${id}/model`, { model: 'a-model', images: true }, headers)).status, 200);
  assert.equal((await api('PUT', 'roles/reply', { provider: id, model: 'a-model' }, headers)).status, 200);
  assert.equal((await api('PUT', 'roles/hearing', { provider: id, model: 'c-typed-by-hand' }, headers)).status, 200);
  const view = await (await api('GET', 'models', null, headers)).json();
  assert.deepEqual(view.providers[0].models.map((model) => [model.id, model.images, model.files]), [['a-model', true, false], ['b-model', false, false], ['c-typed-by-hand', false, false]]);
  const features = Object.fromEntries(view.features.map((item) => [item.id, item.on]));
  assert.deepEqual([features.replies, features.photos, features.pdfs, features.voice, features.read_aloud], [true, true, false, true, false]);
  const page = await (await globalThis.fetch(`${url}/console/models`, { headers })).text();
  for (const words of ['What each model is for', 'Writes replies', 'Reviews replies', 'Reads the moment', 'Hears learners', 'Reads aloud', 'Draws pictures', 'Searches by meaning', 'Voice in activities: on', 'Reading aloud: off', 'Photos from learners: on', 'Search by meaning: off', 'OpenRouter', 'Ollama', 'LM Studio', 'Other OpenAI-compatible']) assert.ok(page.includes(words), words);
  for (const said of [JSON.stringify(view), page, JSON.stringify(tested), JSON.stringify(asked)]) assert.ok(!said.includes(KEY), 'the key came back');
  // Pointing it at another address takes the key off it.
  const moved = await (await api('PUT', `providers/${id}`, { base_url: 'https://mine.example/v1' }, headers)).json();
  assert.equal(moved.key_dropped, true);
  await api('POST', `providers/${id}/test`, {}, headers);
  assert.deepEqual([calls.at(-1).host, calls.at(-1).key], ['mine.example', null], 'a saved key never reaches the new address');
  assert.equal((await api('DELETE', `providers/${id}`, {}, headers)).status, 200);
  assert.equal((await api('POST', `providers/${id}/test`, {}, headers)).status, 404);
  assert.equal((await (await api('GET', 'models', null, headers)).json()).roles.reply.saved, null);
});

test('the Developer Platform can be a provider: its list of models is read too', async (t) => {
  const { api, settings } = await started(t);
  const { id } = await settings.addProvider({ name: 'Platform', base_url: 'https://platform.example/v1', key: KEY });
  assert.deepEqual(await (await api('POST', `providers/${id}/test`, {}, { authorization: `Bearer ${TOKEN}` })).json(), { ok: true, count: 1, kept: true });
});

test('what a provider says back never carries its key, and a test that fails says why', async (t) => {
  const { api, settings } = await started(t);
  const { id } = await settings.addProvider({ name: 'Refuses', base_url: 'https://refuses.example/v1', key: KEY });
  const headers = { authorization: `Bearer ${TOKEN}` };
  const answered = await (await api('POST', `providers/${id}/test`, {}, headers)).json();
  assert.equal(answered.ok, false);
  assert.match(answered.message, /answered 401/);
  assert.match(answered.message, /Check the key/);
  assert.ok(!answered.message.includes(KEY));
});

test('with no store the page says so and takes nothing; the environment shows, and can be tested', async (t) => {
  const { url, api, calls } = await started(t, [desk], { store: null, baseUrl: 'https://env.example/v1', apiKey: 'env-key-value', plan: null, models: modelPlan({ model: 'flag-model' }) });
  const headers = { authorization: `Bearer ${TOKEN}` };
  const page = await (await globalThis.fetch(`${url}/console/models`, { headers })).text();
  assert.match(page, /This server has no store, so nothing here is saved/);
  assert.match(page, /From the environment/);
  assert.match(page, /Set where this server starts: OPENAI_BASE_URL, OPENAI_API_KEY, and a flag or a models file/);
  assert.ok(!page.includes('env-key-value'));
  assert.ok(!page.includes('id="new-provider"'), 'no way to add what can’t be kept');
  assert.equal((await api('POST', 'providers', { name: 'X', base_url: 'https://x.example' }, headers)).status, 409);
  assert.deepEqual(await (await api('POST', 'providers/environment/test', {}, headers)).json(), { ok: true, count: 2, kept: false });
  assert.deepEqual([calls.at(-1).host, calls.at(-1).key, calls.at(-1).redirect], ['env.example', 'Bearer env-key-value', null]);
});

test('a key is refused where it can’t be kept, and the page says what to do', async (t) => {
  const { url, api } = await started(t, [desk], { secret: null });
  const headers = { authorization: `Bearer ${TOKEN}` };
  assert.match(await (await globalThis.fetch(`${url}/console/models`, { headers })).text(), /Set <code>VIABLE_ENGINE_SECRET<\/code>/);
  const refused = await api('POST', 'providers', { name: 'X', base_url: 'https://x.example', key: KEY }, headers);
  assert.equal(refused.status, 409);
  assert.match((await refused.json()).error.message, /VIABLE_ENGINE_SECRET/);
});

test('what a person saved can’t inject into the page', async (t) => {
  const { url, settings } = await started(t);
  const { id } = await settings.addProvider({ name: '<img src=x onerror=alert(1)>', base_url: 'https://x.example/v1' });
  await settings.setModel(id, { model: '"><script>alert(2)</script>', images: true });
  const page = await (await globalThis.fetch(`${url}/console/models`, { headers: { authorization: `Bearer ${TOKEN}` } })).text();
  assert.ok(!page.includes('<img src=x'));
  assert.ok(!page.includes('<script>alert(2)'));
  assert.equal([...page.matchAll(/<script/g)].length, 1, 'only the page’s own, under its nonce');
});

test('on a server with no token of its own, it opens with the one made at start, on this computer only', async (t) => {
  const { url, teacherToken, session, cookieFor } = await started(t, [desk], { token: null });
  assert.match(teacherToken, /^[\w-]{32,}$/);
  assert.equal((await globalThis.fetch(`${url}/console/models`)).status, 401);
  const cookie = cookieFor(await session(teacherToken), '/console');
  assert.equal((await globalThis.fetch(`${url}/console/models`, { headers: { cookie } })).status, 200);
  const elsewhere = await globalThis.fetch(`${url}/console/models`, { headers: { cookie, 'x-forwarded-for': '203.0.113.9' } });
  assert.equal(elsewhere.status, 403);
});

test('a deployed server keeps it shut until it has a token, then opens it on the same terms', async () => {
  const bytes = new TextEncoder().encode(JSON.stringify(desk.doc));
  const shut = await createApp({ bytes, name: 'desk.json', vars: {}, log: () => {} });
  const page = await shut(new Request('https://school.example/console/models', { headers: { accept: 'text/html' } }), {});
  assert.equal(page.status, 503);
  const store = memoryStore();
  const open = await createApp({ bytes, name: 'desk.json', vars: { VIABLE_ENGINE_TOKEN: TOKEN, VIABLE_ENGINE_SECRET: 'deployed secret' }, store, log: () => {}, fetch: async () => json({ data: [] }) });
  const auth = { authorization: `Bearer ${TOKEN}` };
  assert.equal((await open(new Request('https://school.example/console/api/models', { headers: auth }), {})).status, 200);
  const added = await open(new Request('https://school.example/console/api/providers', { method: 'POST', headers: { ...JSON_TYPE, ...auth }, body: JSON.stringify({ name: 'One', base_url: 'https://one.example/v1', key: KEY }) }), {});
  assert.equal(added.status, 200);
  assert.ok(!JSON.stringify(await store.get('engine/settings')).includes(KEY));
  const server = await (await open(new Request('https://school.example/v1/server', { headers: auth }), {})).json();
  assert.equal(server.features.find((item) => item.id === 'voice').on, false);
  assert.ok(!JSON.stringify(server).includes(KEY));
});

test('with no agents, serve starts and sends the person to the console', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'viable-console-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const child = spawn(process.execPath, [BIN, 'serve', dir, '--port', '0', '--data-dir', join(dir, 'data')], { env: { ...process.env, OPENAI_API_KEY: '', OPENAI_BASE_URL: '' } });
  t.after(() => child.kill());
  let said = '';
  const found = await new Promise((resolve, reject) => {
    child.stderr.on('data', (chunk) => { said += chunk; const made = /console, to set up models and courses: (http:\/\/\S+?)\/console, with this token for this run, shown once: (\S+)/.exec(said); if (made && /No model writes replies yet/.test(said)) resolve(made); });
    child.on('close', () => reject(new Error(said)));
  });
  assert.match(said, /No agent file or course package in .*in a container, mount them/s, 'an empty mounted folder keeps its help');
  const [, url, token] = found;
  const first = await globalThis.fetch(`${url}/`, { redirect: 'manual' });
  assert.equal(first.status, 302);
  assert.equal(new URL(first.headers.get('location')).pathname, '/console');
  assert.equal((await globalThis.fetch(`${url}/console/models`, { headers: { authorization: `Bearer ${token}` } })).status, 200);
  const added = await globalThis.fetch(`${url}/console/api/providers`, { method: 'POST', headers: { ...JSON_TYPE, authorization: `Bearer ${token}` }, body: JSON.stringify({ name: 'One', base_url: 'https://one.example/v1', key: KEY }) });
  assert.equal(added.status, 200, 'a store’s folder keeps a key of its own');
  const health = await (await globalThis.fetch(`${url}/health`)).json();
  assert.deepEqual(health, { status: 'ok', agents: 0 });
});

test('inspect says what a package’s models turn on, and verify what a running server has on', async (t) => {
  const doc = JSON.parse(readFileSync(new URL('../../examples/english-conversation.json', import.meta.url), 'utf8'));
  const bare = await inspectPackage({ doc, file: 'c.json' });
  const on = (report, id) => report.features.find((item) => item.id === id);
  assert.equal(on(bare, 'voice').on, false);
  assert.match(on(bare, 'voice').why, /microphone/);
  assert.equal(on(bare, 'voice').models_file, 'transcribe');
  assert.equal(on(bare, 'replies').on, true, 'its own names, on your endpoint');
  const planned = await inspectPackage({ doc, file: 'c.json', plan: modelPlan({ models: { reply: 'r', transcribe: 'w', speech: 's', meaning: 'e', reads: { r: ['images', 'files'] } } }) });
  for (const id of ['voice', 'read_aloud', 'search', 'photos', 'pdfs']) assert.equal(on(planned, id).on, true, id);
  assert.equal(on(planned, 'pictures').on, false);

  const { url, settings } = await started(t);
  const asked = await verifyServer(url, { token: TOKEN, fetch: (...args) => globalThis.fetch(...args) });
  assert.equal(asked.features.find((item) => item.id === 'voice').on, false);
  const { id } = await settings.addProvider({ name: 'One', base_url: 'https://one.example/v1' });
  await settings.setRole('hearing', { provider: id, model: 'w' });
  const later = await verifyServer(url, { token: TOKEN, fetch: (...args) => globalThis.fetch(...args) });
  assert.equal(later.features.find((item) => item.id === 'voice').on, true);
  assert.equal((await verifyServer(url, { fetch: (...args) => globalThis.fetch(...args) })).features, null, 'it takes the token');
});
