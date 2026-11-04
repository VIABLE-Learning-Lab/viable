// The model settings: what is saved, what wins over it, where each role's calls go, and what happens to a key.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHandler } from '../src/server/handler.js';
import { modelPlan } from '../src/server/models.js';
import { agentsToServe, createRuntime } from '../src/server/runtime.js';
import { ENVIRONMENT, featuresOf, modelSettings } from '../src/server/settings.js';
import { fileStore } from '../../harness/src/store/fileStore.js';
import { memoryStore } from '../../harness/src/store/store.js';

const KEY = 'a-provider-key-that-must-stay-here';
const scratch = (t) => { const dir = mkdtempSync(join(tmpdir(), 'viable-settings-')); t.after(() => rmSync(dir, { recursive: true, force: true })); return dir; };
const allFiles = (dir) => readdirSync(dir, { withFileTypes: true, recursive: true }).filter((entry) => entry.isFile()).map((entry) => join(entry.parentPath, entry.name));
const reading = () => modelSettings({ store: memoryStore(), secret: 'a secret for this test' });

test('a provider’s key is never in what a browser is told, and has_key says it is there', async () => {
  const settings = reading();
  const { id } = await settings.addProvider({ name: 'One', base_url: 'https://one.example/v1/', key: KEY });
  await settings.setRole('reply', { provider: id, model: 'm1' });
  const view = await settings.view();
  assert.ok(!JSON.stringify(view).includes(KEY));
  assert.deepEqual(view.providers.map((item) => [item.name, item.base_url, item.has_key, item.key_unreadable]), [['One', 'https://one.example/v1', true, false]]);
  assert.equal(view.roles.reply.model, 'm1');
  assert.equal((await settings.resolve()).roles.reply.apiKey, KEY, 'a run still gets it');
});

test('changing an address drops the saved key, unless a new one comes with it', async () => {
  const settings = reading();
  const { id } = await settings.addProvider({ name: 'One', base_url: 'https://one.example/v1', key: KEY });
  assert.deepEqual(await settings.updateProvider(id, { name: 'One again', base_url: 'https://one.example/v1/' }), { id, key_dropped: false }, 'the same address, written differently');
  assert.equal((await settings.endpointOf(id)).apiKey, KEY);
  assert.deepEqual(await settings.updateProvider(id, { base_url: 'https://mine.example/v1' }), { id, key_dropped: true });
  assert.equal((await settings.endpointOf(id)).apiKey, null);
  assert.equal((await settings.view()).providers[0].has_key, false);
  await settings.updateProvider(id, { base_url: 'https://two.example/v1', key: 'a-new-key-for-two' });
  assert.equal((await settings.endpointOf(id)).apiKey, 'a-new-key-for-two');
  await settings.updateProvider(id, { clear_key: true });
  assert.equal((await settings.endpointOf(id)).apiKey, null);
});

test('what is saved is checked: an address, a name, a role, and how many', async () => {
  const settings = reading();
  for (const base_url of ['nothing', 'ftp://x.example', 'https://user:pass@x.example/v1', 'https://x.example/v1?key=abc', 'javascript:alert(1)']) await assert.rejects(settings.addProvider({ name: 'X', base_url }), (error) => error.status === 400, base_url);
  await assert.rejects(settings.addProvider({ name: ' ', base_url: 'https://x.example' }), /name/);
  await assert.rejects(settings.addProvider({ name: 'X', base_url: 'https://x.example', key: 'two words' }), /key/);
  await assert.rejects(settings.setRole('nonsense', { provider: 'x', model: 'm' }), (error) => error.status === 404);
  await assert.rejects(settings.setRole('__proto__', null), (error) => error.status === 404);
  await assert.rejects(settings.setRole('reply', { provider: 'nobody', model: 'm' }), (error) => error.code === 'provider_not_found');
  const { id } = await settings.addProvider({ name: 'X', base_url: 'https://x.example' });
  await assert.rejects(settings.setRole('reply', { provider: id, model: 'a\nb' }), /model/);
  await assert.rejects(settings.setRole('reply', { provider: ENVIRONMENT, model: 'm' }), (error) => error.code === 'provider_not_found', 'no environment to choose');
  await settings.setRole('reply', { provider: id, model: 'm' });
  await settings.setRole('hearing', { provider: id, model: 'h' });
  await settings.removeProvider(id);
  const view = await settings.view();
  assert.equal(view.roles.reply.saved, null, 'its roles go with it');
  assert.equal(view.roles.hearing.provider, null);
  for (let n = 0; n < 12; n += 1) await settings.addProvider({ name: `P${n}`, base_url: 'https://x.example' });
  await assert.rejects(settings.addProvider({ name: 'One more', base_url: 'https://x.example' }), (error) => error.code === 'too_many_providers');
});

test('keys are unreadable in the store’s files, the folder’s key is its owner’s alone, and another secret opens nothing', async (t) => {
  const dir = scratch(t);
  const settings = modelSettings({ store: fileStore(dir) });
  const { id } = await settings.addProvider({ name: 'One', base_url: 'https://one.example/v1', key: KEY });
  const everything = allFiles(dir).map((file) => readFileSync(file, 'utf8')).join('\n');
  assert.ok(!everything.includes(KEY), 'the key is on disk as it was given');
  assert.ok(!everything.includes(Buffer.from(KEY).toString('base64')));
  const own = join(dir, '.store-key');
  assert.equal(statSync(own).mode & 0o777, 0o600);
  assert.equal(readFileSync(own).length, 32);
  assert.ok(!(await fileStore(dir).list()).some((key) => key.includes('store-key')), 'the store doesn’t list it');
  assert.equal((await modelSettings({ store: fileStore(dir) }).endpointOf(id)).apiKey, KEY, 'another process with the same folder reads it');

  const other = modelSettings({ store: fileStore(dir), secret: 'another secret' });
  assert.equal((await other.endpointOf(id)).apiKey, null);
  assert.deepEqual((await other.view()).providers.map((item) => [item.has_key, item.key_unreadable]), [[true, true]], 'it says so, and asks for it again');

  // Someone who can edit the file can't move a saved key to their own address.
  const store = fileStore(dir);
  const held = await store.get('engine/settings');
  held.providers[0].base_url = 'https://mine.example/v1';
  await store.put('engine/settings', held);
  assert.equal((await modelSettings({ store: fileStore(dir) }).endpointOf(id)).apiKey, null);
});

test('with neither a secret nor a folder of its own, saving a key is refused and says what to do; with no store, nothing is saved', async () => {
  const noPlace = modelSettings({ store: memoryStore() });
  assert.equal((await noPlace.view()).keeps_keys, false);
  await assert.rejects(noPlace.addProvider({ name: 'One', base_url: 'https://one.example/v1', key: KEY }), (error) => error.code === 'key_not_kept' && /VIABLE_ENGINE_SECRET/.test(error.message));
  assert.deepEqual((await noPlace.view()).providers, [], 'and nothing of it is kept');
  const { id } = await noPlace.addProvider({ name: 'Local', base_url: 'http://127.0.0.1:11434/v1' });
  await assert.rejects(noPlace.updateProvider(id, { key: KEY }), (error) => error.code === 'key_not_kept');

  const none = modelSettings({ baseUrl: 'https://env.example/v1', apiKey: 'env-key' });
  const view = await none.view();
  assert.equal(view.saving, false);
  assert.deepEqual(view.providers.map((item) => [item.id, item.base_url, item.has_key]), [[ENVIRONMENT, 'https://env.example/v1', true]]);
  await assert.rejects(none.addProvider({ name: 'One', base_url: 'https://one.example/v1' }), (error) => error.code === 'no_store' && /--data-dir/.test(error.message));
  await assert.rejects(none.setRole('reply', { provider: ENVIRONMENT, model: 'm' }), (error) => error.code === 'no_store');
});

test('the environment wins over what is saved, and says it does', async () => {
  const store = memoryStore();
  const saving = modelSettings({ store, secret: 's' });
  const { id } = await saving.addProvider({ name: 'One', base_url: 'https://one.example/v1', key: KEY });
  for (const role of ['reply', 'reviewer', 'hearing', 'speaking']) await saving.setRole(role, { provider: id, model: `saved-${role}` });
  assert.equal((await saving.resolve()).roles.reply.baseUrl, 'https://one.example/v1', 'nothing in the environment: as saved');

  const address = modelSettings({ store, secret: 's', baseUrl: 'https://env.example/v1', apiKey: 'env-key' });
  const { roles, plan } = await address.resolve();
  assert.deepEqual([roles.reply.baseUrl, roles.reply.apiKey, roles.reply.model], ['https://env.example/v1', 'env-key', null], 'its address, and each agent’s own model names');
  assert.deepEqual(roles.reply.from, ['OPENAI_BASE_URL', 'OPENAI_API_KEY']);
  assert.equal(roles.reviewer.baseUrl, 'https://env.example/v1');
  assert.deepEqual([roles.hearing.baseUrl, roles.hearing.apiKey, roles.hearing.model], ['https://one.example/v1', KEY, 'saved-hearing'], 'it says nothing of hearing, so that stays');
  assert.equal(roles.hearing.apiKey === 'env-key', false, 'the environment’s key never goes to a saved provider');
  assert.equal(plan.reply, null);
  const shown = (await address.view()).roles;
  assert.deepEqual(shown.reply.from_environment, ['OPENAI_BASE_URL', 'OPENAI_API_KEY']);
  assert.equal(shown.reply.saved.model, 'saved-reply', 'what was saved is still there for when it is unset');
  assert.deepEqual(shown.hearing.from_environment, []);

  const onIt = modelSettings({ store, secret: 's', baseUrl: 'https://env.example/v1' });
  await onIt.setRole('reply', { provider: ENVIRONMENT, model: 'chosen-there' });
  assert.equal((await onIt.resolve()).roles.reply.model, 'chosen-there', 'a model can be chosen on the environment’s address');
  await saving.setRole('reply', { provider: id, model: 'saved-reply' });

  const flags = modelSettings({ store, secret: 's', plan: modelPlan({ model: 'flag-model', speechModel: 'flag-speech' }) });
  const flagged = await flags.resolve();
  assert.deepEqual([flagged.roles.reply.model, flagged.roles.reply.baseUrl], ['flag-model', 'https://one.example/v1'], 'a flag names the model, and with no address given the saved provider stays');
  assert.equal(flagged.plan.reply, 'flag-model');
  assert.equal(flagged.plan.reviewer, 'saved-reviewer', 'it says nothing of the reviewer');
  assert.equal(flagged.plan.speech, 'flag-speech');
  assert.deepEqual((await flags.view()).roles.reply.from_environment, ['a flag or a models file']);
  assert.equal((await flags.endpointOf(ENVIRONMENT)).baseUrl, 'https://api.openai.com/v1', 'a flag alone still has an address to test: where its model calls go without a provider');

  const whole = modelSettings({ baseUrl: 'https://env.example/v1', plan: modelPlan({ models: { reply: 'r', transcribe: 't', speech: 's', image: 'i', picker: 'p', meaning: 'e', reads: { r: ['images'] } } }) });
  const { roles: fromFile, reads } = await whole.resolve();
  assert.deepEqual(Object.fromEntries(Object.entries(fromFile).map(([role, value]) => [role, value?.model ?? null])), { reply: 'r', reviewer: null, picker: 'p', hearing: 't', speaking: 's', drawing: 'i', meaning: 'e' }, 'with no store, a models file can say all of it');
  assert.deepEqual(reads('r'), { images: true, files: false });
  const again = modelPlan({ models: JSON.parse(JSON.stringify(modelPlan({ models: { reply: 'r', picker: 'p', meaning: 'e', reads: { r: ['images', 'files'] } } }))) });
  assert.deepEqual([again.picker, again.meaning, again.reads], ['p', 'e', { r: ['images', 'files'] }], 'a scaffold’s models.json reads back what deploy wrote');
});

// A chat endpoint per host, answering PASS so a check step passes, and speech and pictures.
function endpoints() {
  const calls = [];
  const fetch = async (url, init = {}) => {
    const { host, pathname } = new URL(url);
    calls.push({ host, path: pathname.replace(/^\/v1/, ''), key: init.headers?.authorization ?? null, model: JSON.parse(init.body || '{}').model ?? null, redirect: init.redirect ?? null });
    if (pathname.endsWith('/audio/speech')) return new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'audio/mpeg' } });
    if (pathname.endsWith('/images/generations')) return new Response(JSON.stringify({ data: [{ b64_json: 'iVBORw0KGgo=' }] }), { headers: { 'content-type': 'application/json' } });
    return new Response(JSON.stringify({ choices: [{ message: { role: 'assistant', content: 'PASS' }, finish_reason: 'stop' }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } }), { headers: { 'content-type': 'application/json' } });
  };
  return { calls, fetch };
}
const graph = { entry: 'v', nodes: [
  { id: 'v', type: 'vetting', config: { model: 'named-writer', verification_model: 'named-reviewer', guideline: 'Be kind.' }, next: 's' },
  { id: 's', type: 'speech', config: { model: 'named-voice', text: 'Hello.' }, next: 'd' },
  { id: 'd', type: 'image', config: { model: 'named-brush', prompt: 'A fox' }, next: 'out' },
  { id: 'out', type: 'output', config: { text: '{{v.content}}' } }
] };
const agentDoc = { format: 'viable.agent', format_version: 1, name: 'Sea', graph };
const run = (handle, input = 'hi') => handle(new Request('https://school.example/v1/agents/sea/runs', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer t' }, body: JSON.stringify({ input }) }));
const serverOn = (settings, fetch) => createHandler({ agents: agentsToServe([{ doc: agentDoc, file: 'sea.json', name: 'sea.json' }]), runtime: createRuntime({ fetch, settings }), options: { token: 't', log: () => {} } });

test('each role reaches its own provider with its own key, and changing one applies to the next turn', async () => {
  const settings = reading();
  const made = {};
  for (const name of ['writes', 'checks', 'speaks', 'draws']) made[name] = (await settings.addProvider({ name, base_url: `https://${name}.example/v1`, key: `key-for-${name}` })).id;
  await settings.setRole('reply', { provider: made.writes, model: 'w1' });
  await settings.setRole('reviewer', { provider: made.checks, model: 'r1' });
  await settings.setRole('speaking', { provider: made.speaks, model: 's1' });
  await settings.setRole('drawing', { provider: made.draws, model: 'd1' });
  const { calls, fetch } = endpoints();
  const handle = serverOn(settings, fetch);
  assert.equal((await run(handle)).status, 200);
  const where = (path, model) => calls.find((call) => call.path === path && call.model === model);
  assert.deepEqual([where('/chat/completions', 'w1').host, where('/chat/completions', 'w1').key, where('/chat/completions', 'w1').redirect], ['writes.example', 'Bearer key-for-writes', 'manual']);
  assert.deepEqual([where('/chat/completions', 'r1').host, where('/chat/completions', 'r1').key], ['checks.example', 'Bearer key-for-checks']);
  assert.deepEqual([where('/audio/speech', 's1').host, where('/audio/speech', 's1').key, where('/audio/speech', 's1').redirect], ['speaks.example', 'Bearer key-for-speaks', 'manual']);
  assert.deepEqual([where('/images/generations', 'd1').host, where('/images/generations', 'd1').key], ['draws.example', 'Bearer key-for-draws']);
  assert.ok(!calls.some((call) => /^named-/.test(call.model)), 'a package’s own names are replaced');

  await settings.setRole('reply', { provider: made.checks, model: 'w2' });
  calls.length = 0;
  assert.equal((await run(handle)).status, 200);
  assert.equal(where('/chat/completions', 'w2').host, 'checks.example', 'with no restart');
});

test('the same model’s name on two providers still reaches each, with its real name', async () => {
  const settings = reading();
  const one = (await settings.addProvider({ name: 'One', base_url: 'https://one.example/v1', key: 'key-one' })).id;
  const two = (await settings.addProvider({ name: 'Two', base_url: 'https://two.example/v1', key: 'key-two' })).id;
  await settings.setRole('reply', { provider: one, model: 'same' });
  await settings.setRole('reviewer', { provider: two, model: 'same' });
  const { calls, fetch } = endpoints();
  assert.equal((await run(serverOn(settings, fetch))).status, 200);
  const chats = calls.filter((call) => call.path === '/chat/completions');
  assert.deepEqual([...new Set(chats.map((call) => `${call.host} ${call.model} ${call.key}`))].sort(), ['one.example same Bearer key-one', 'two.example same Bearer key-two']);
});

test('a saved provider’s requests never follow a redirect, on any host: what they carry stays', async () => {
  const settings = reading();
  const { id } = await settings.addProvider({ name: 'One', base_url: 'https://one.example/v1', key: KEY });
  await settings.setRole('reply', { provider: id, model: 'm' });
  const hosts = [];
  const fetch = async (url, init) => {
    hosts.push(new URL(url).host);
    assert.equal(init.redirect, 'manual', 'a Worker refuses redirect: error, so it is checked here');
    return new Response(null, { status: 307, headers: { location: 'https://mine.example/v1/chat/completions' } });
  };
  const original = console.error;
  console.error = () => {};
  try {
    const answered = await run(serverOn(settings, fetch));
    assert.equal(answered.status, 502);
    assert.match((await answered.json()).error.message, /redirect/);
  } finally { console.error = original; }
  assert.deepEqual(hosts, ['one.example'], 'nothing went to the other address');
});

test('with nothing saved and no store, a run goes as it always did: the environment’s address, each agent’s names', async () => {
  const settings = modelSettings({ baseUrl: 'https://env.example/v1', apiKey: 'env-key' });
  const { calls, fetch } = endpoints();
  assert.equal((await run(serverOn(settings, fetch))).status, 200);
  assert.deepEqual([...new Set(calls.map((call) => call.host))], ['env.example']);
  assert.ok(calls.some((call) => call.model === 'named-writer'));
  assert.ok(calls.every((call) => call.key === 'Bearer env-key' && call.redirect === null), 'its own redirects are its own business');
});

test('features say what is on and off, and why', async () => {
  const off = featuresOf(await reading().resolve());
  assert.ok(off.every((item) => item.on === false && item.why), JSON.stringify(off));
  assert.deepEqual(off.map((item) => item.id), ['replies', 'photos', 'pdfs', 'review', 'moment', 'voice', 'read_aloud', 'pictures', 'search']);
  const settings = reading();
  const { id } = await settings.addProvider({ name: 'One', base_url: 'https://one.example/v1' });
  await settings.setRole('reply', { provider: id, model: 'm' });
  await settings.setRole('hearing', { provider: id, model: 'h' });
  await settings.setModel(id, { model: 'm', images: true });
  const on = Object.fromEntries(featuresOf(await settings.resolve()).map((item) => [item.id, item.on]));
  assert.deepEqual(on, { replies: true, photos: true, pdfs: false, review: false, moment: false, voice: true, read_aloud: false, pictures: false, search: false });
});
