// What a page offers when a model is set, through the page routes on a real serve: voice, reading aloud,
// photos and PDFs, pictures, and replies in pieces. The providers are stubs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { serve } from '../src/serve.js';
import { agentsToServe } from '../src/server/runtime.js';
import { memoryStore } from '../../harness/src/store/store.js';

const EXAMPLES = fileURLToPath(new URL('../../examples/', import.meta.url));
const VISITOR = 'visitor-aaaaaaaaaaaaaaaa';
const MP3 = new Uint8Array(1200).fill(7);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
const RECORDING = `data:audio/webm;base64,${Buffer.alloc(64, 9).toString('base64')}`;
const json = (body, init = {}) => new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' }, ...init });

const plainGraph = { entry: 'write', nodes: [{ id: 'write', type: 'llm', config: { model: 'gpt-x' }, next: 'out' }, { id: 'out', type: 'output', config: { text: '{{write.content}}' } }] };
const desk = (extra = {}, graph = plainGraph) => ({ doc: { format: 'viable.agent', format_version: 1, name: 'Desk', graph, chat_page: { status: 'active', settings: { limits: { visitor_per_minute: 30 }, ...extra } } }, file: 'desk.json', name: 'desk.json' });

// A provider per host. Each says who it is; a test changes what /chat/completions answers with chat.
function providers({ chat = null, hear = null } = {}) {
  const calls = [];
  const fetch = async (url, init = {}) => {
    const { host, pathname } = new URL(url);
    const path = pathname.replace(/^\/v1/, '');
    const isForm = init.body instanceof FormData;
    const body = isForm ? Object.fromEntries(init.body.entries()) : init.body ? JSON.parse(init.body) : null;
    const call = { host, path, key: init.headers?.authorization ?? null, body };
    calls.push(call);
    if (path === '/chat/completions') return chat ? chat(call) : json({ choices: [{ message: { role: 'assistant', content: `A reply from ${host}.` }, finish_reason: 'stop' }], usage: {} });
    if (path === '/audio/transcriptions') return hear ? hear(call) : json({ text: 'What is a fraction?', language: 'en' });
    if (path === '/audio/speech') return new Response(MP3, { headers: { 'content-type': 'audio/mpeg' } });
    if (path === '/images/generations') return json({ data: [{ b64_json: Buffer.from(PNG).toString('base64') }], output_format: 'png' });
    throw new Error(`Nothing answers ${url}`);
  };
  return { calls, fetch };
}

async function started(t, files, { roles = {}, reads = {}, endpoint = {}, options = {} } = {}) {
  const stub = providers(endpoint);
  const store = memoryStore();
  const { server, url, settings } = await serve(agentsToServe(files), { port: 0, fetch: stub.fetch, store, secret: 'a secret for this test', log: () => {}, token: 'tok', baseUrl: '', apiKey: '', ...options });
  t.after(() => server.close());
  const { id } = await settings.addProvider({ name: 'Main', base_url: 'https://main.example/v1', key: 'main-key' });
  for (const [role, model] of Object.entries(roles)) await settings.setRole(role, { provider: id, model });
  for (const [model, what] of Object.entries(reads)) await settings.setModel(id, { model, ...what });
  const post = (path, body, headers = {}) => globalThis.fetch(`${url}${path}`, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
  return { url, post, settings, store, providerId: id, ...stub };
}
const configOf = async (url, path) => JSON.parse(/const CONFIG = (\{.*?\});\n/s.exec(await (await globalThis.fetch(`${url}${path}`)).text())[1]);
const framesOf = (text) => text.split('\n\n').filter((block) => block.startsWith('event:')).map((block) => ({ name: /^event: (.+)$/m.exec(block)[1], data: JSON.parse(/^data: (.+)$/m.exec(block)[1]) }));

test('a page offers only what a model is set for, and the routes agree', async (t) => {
  const { url, post, settings, providerId } = await started(t, [desk()], { roles: { reply: 'm1' } });
  const before = await configOf(url, '/chat/desk');
  assert.deepEqual([before.voice, before.speaks, before.attach], [false, false, { images: false, files: false }]);
  assert.equal((await (await post('/chat/desk/transcribe', { visitor: VISITOR, audio: RECORDING })).json()).error.code, 'voice_not_available');
  assert.equal((await (await post('/chat/desk/messages', { visitor: VISITOR, message: 'Hi', audio: RECORDING })).json()).error.code, 'voice_not_available');
  assert.equal((await (await post('/chat/desk/messages', { visitor: VISITOR, message: 'Hi', attachments: [{ data: `data:image/png;base64,${Buffer.from(PNG).toString('base64')}` }] })).json()).error.code, 'attachments_not_available');

  await settings.setRole('hearing', { provider: providerId, model: 'whisper' });
  await settings.setRole('speaking', { provider: providerId, model: 'tts' });
  await settings.setModel(providerId, { model: 'm1', images: true });
  const after = await configOf(url, '/chat/desk');
  assert.deepEqual([after.voice, after.handsFree, after.speaks, after.attach], [true, true, true, { images: true, files: false }], 'with no restart');
});

test('a page’s own settings still decide: voice off, attachments off', async (t) => {
  const { url } = await started(t, [desk({ voice: { input: false, hands_free: false }, attachments: { images: false, files: false } })], { roles: { reply: 'm1', hearing: 'whisper' }, reads: { m1: { images: true, files: true } } });
  const config = await configOf(url, '/chat/desk');
  assert.deepEqual([config.voice, config.handsFree, config.attach], [false, false, { images: false, files: false }]);
});

test('dictation: a recording becomes text on the hearing provider, as a form, and isn’t kept', async (t) => {
  const { post, calls, store } = await started(t, [desk()], { roles: { reply: 'm1', hearing: 'whisper-1' } });
  const answered = await post('/chat/desk/transcribe', { visitor: VISITOR, audio: RECORDING });
  assert.equal(answered.status, 200);
  assert.deepEqual(await answered.json(), { object: 'chat.dictation', text: 'What is a fraction?', language: 'en' });
  const [call] = calls.filter((item) => item.path === '/audio/transcriptions');
  assert.deepEqual([call.host, call.key, call.body.model, call.body.file.type, call.body.file.name], ['main.example', 'Bearer main-key', 'whisper-1', 'audio/webm', 'voice-message.webm']);
  assert.equal((await call.body.file.arrayBuffer()).byteLength, 64);
  for (const key of await store.list('')) assert.ok(!JSON.stringify(await store.get(key)).includes(RECORDING.slice(-40)), `${key} keeps the recording`);
  assert.equal((await (await post('/chat/desk/transcribe', { visitor: VISITOR, audio: 'data:text/plain;base64,AAAA' })).json()).error.code, 'unsupported_voice_format');
  assert.equal((await (await post('/chat/desk/transcribe', { visitor: VISITOR, audio: 'nonsense' })).json()).error.code, 'invalid_voice_message');
  assert.equal((await (await post('/chat/desk/transcribe', { visitor: 'x', audio: RECORDING })).json()).error.code, 'invalid_visitor');
});

test('a provider that fails to hear tells a learner nothing of itself', async (t) => {
  const { post } = await started(t, [desk()], { roles: { reply: 'm1', hearing: 'whisper-1' }, endpoint: { hear: () => json({ error: { message: 'bad key main-key at https://main.example' } }, { status: 401 }) } });
  const failed = await post('/chat/desk/transcribe', { visitor: VISITOR, audio: RECORDING });
  assert.equal(failed.status, 502);
  const text = await failed.text();
  assert.ok(!/main-key|main\.example|stack/.test(text), text);
  const spoken = await post('/chat/desk/messages', { visitor: VISITOR, audio: RECORDING });
  assert.equal(spoken.status, 502);
  assert.ok(!/main-key|main\.example/.test(await spoken.text()));
});

test('talking to an agent with no Transcribe or Speech step: it hears what was said, and the reply is read aloud and can be played', async (t) => {
  const { url, post, calls, store } = await started(t, [desk()], { roles: { reply: 'm1', hearing: 'whisper-1', speaking: 'tts-1' } });
  const streamed = await post('/chat/desk/messages', { visitor: VISITOR, audio: RECORDING, stream: true });
  const frames = framesOf(await streamed.text());
  const heard = frames.find((frame) => frame.name === 'run.transcript');
  assert.equal(heard.data.text, 'What is a fraction?');
  const chat = calls.find((call) => call.path === '/chat/completions');
  assert.equal(chat.body.messages.at(-1).content, 'What is a fraction?', 'the agent gets the words');
  const done = frames.find((frame) => frame.name === 'run.completed').data;
  assert.equal(done.transcript.text, 'What is a fraction?');
  assert.deepEqual(calls.filter((call) => call.path === '/audio/speech').map((call) => [call.host, call.key, call.body.model, call.body.input]), [['main.example', 'Bearer main-key', 'tts-1', 'A reply from main.example.']]);
  const [clip] = done.reply.audio;
  assert.ok(clip.url.startsWith(`${url}/media/`), clip.url);
  const played = await globalThis.fetch(clip.url);
  assert.equal(played.status, 200);
  assert.equal(played.headers.get('content-type'), 'audio/mpeg');
  assert.equal(played.headers.get('cache-control'), 'no-store');
  assert.match(played.headers.get('content-security-policy'), /sandbox/);
  assert.deepEqual(new Uint8Array(await played.arrayBuffer()), MP3);
  const part = await globalThis.fetch(clip.url, { headers: { range: 'bytes=0-1' } });
  assert.equal(part.status, 206);
  assert.equal(part.headers.get('content-range'), `bytes 0-1/${MP3.length}`);
  assert.equal((await part.arrayBuffer()).byteLength, 2);
  assert.equal((await globalThis.fetch(`${url}/media/${'a'.repeat(32)}.mp3`)).status, 404);
  assert.equal((await globalThis.fetch(`${url}/media/..%2f..%2fetc%2fpasswd`)).status, 404);
  // What was said goes into the conversation as words, and the next turn reads them.
  const next = await post('/chat/desk/messages', { visitor: VISITOR, message: 'And then?', conversation_id: done.conversation_id });
  assert.equal(next.status, 200);
  const chats = calls.filter((call) => call.path === '/chat/completions');
  assert.ok(chats.at(-1).body.messages.some((message) => message.role === 'user' && message.content === 'What is a fraction?'));
  assert.equal(calls.filter((call) => call.path === '/audio/speech').length, 1, 'a typed message isn’t read aloud by an agent with no Speech step');
  for (const key of await store.list('')) assert.ok(!JSON.stringify(await store.get(key)).includes(RECORDING.slice(-40)), `${key} keeps the recording`);
});

test('a recording with no words in it is said so, and nothing is answered', async (t) => {
  const { post, calls } = await started(t, [desk()], { roles: { reply: 'm1', hearing: 'whisper-1' }, endpoint: { hear: () => json({ text: '   ' }) } });
  const answered = await post('/chat/desk/messages', { visitor: VISITOR, audio: RECORDING });
  assert.equal(answered.status, 422);
  assert.equal((await answered.json()).error.code, 'nothing_heard');
  assert.equal(calls.filter((call) => call.path === '/chat/completions').length, 0);
});

test('reading aloud failing never loses the reply', async (t) => {
  const stub = providers();
  const failing = async (url, init) => (String(url).endsWith('/audio/speech') ? json({ error: { message: 'no voice' } }, { status: 500 }) : stub.fetch(url, init));
  const original = console.error;
  console.error = () => {};
  t.after(() => { console.error = original; });
  const { server, url, settings } = await serve(agentsToServe([desk()]), { port: 0, fetch: failing, store: memoryStore(), secret: 's', token: 'tok', log: () => {}, baseUrl: '', apiKey: '' });
  t.after(() => server.close());
  const { id } = await settings.addProvider({ name: 'Main', base_url: 'https://main.example/v1', key: 'k' });
  for (const [role, model] of [['reply', 'm1'], ['hearing', 'w'], ['speaking', 't']]) await settings.setRole(role, { provider: id, model });
  const answered = await globalThis.fetch(`${url}/chat/desk/messages`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ visitor: VISITOR, audio: RECORDING }) });
  assert.equal(answered.status, 200);
  const { reply } = await answered.json();
  assert.equal(reply.text, 'A reply from main.example.');
  assert.deepEqual(reply.audio, []);
});

test('a course’s agent with Transcribe and Speech steps: its own steps hear and read, piece by piece, on the roles’ models', async (t) => {
  const doc = JSON.parse(readFileSync(join(EXAMPLES, 'english-conversation.json'), 'utf8'));
  doc.course.identify = 'browser';
  const { url, post, calls } = await started(t, [{ doc, file: 'c.json', name: 'c.json' }], { roles: { reply: 'm1', hearing: 'whisper-1', speaking: 'tts-1' } });
  const code = 'english-conversation';
  const course = (await (await globalThis.fetch(`${url}/`, { redirect: 'manual' })).headers.get('location')) || '';
  const home = await (await post(`${new URL(course, url).pathname}/home`, { visitor: VISITOR })).json();
  assert.ok(home.learner, code);
  const card = home.units.flatMap((unit) => unit.activities)[0];
  const page = `${new URL(course, url).pathname}/${card.key}`;
  const config = await configOf(url, page);
  assert.deepEqual([config.voice, config.speaks, config.autoplay, config.handsFree], [true, true, 'always', true], 'the activity’s own voice settings');
  const frames = framesOf(await (await post(`${page}/messages`, { visitor: VISITOR, audio: RECORDING, stream: true })).text());
  const names = frames.map((frame) => frame.name);
  assert.ok(names.includes('run.transcript'), names.join());
  assert.ok(names.includes('run.delta'));
  assert.ok(names.includes('run.audio'), `read aloud as it is written: ${names.join()}`);
  assert.deepEqual(new Uint8Array(Buffer.from(frames.find((frame) => frame.name === 'run.audio').data.audio, 'base64')), MP3);
  const done = frames.find((frame) => frame.name === 'run.completed').data;
  assert.equal(done.transcript.text, 'What is a fraction?');
  assert.ok(done.reply.audio[0].url.startsWith(`${url}/media/`));
  assert.ok(calls.filter((call) => call.path === '/audio/speech').every((call) => call.body.model === 'tts-1'));
  assert.equal(calls.find((call) => call.path === '/audio/transcriptions').body.language, 'en', 'the step’s own language');
  const chat = calls.find((call) => call.path === '/chat/completions');
  assert.equal(chat.body.model, 'm1');
  assert.match(JSON.stringify(chat.body.messages), /What is a fraction\?/);
  const again = await (await post(`${page}/transcribe`, { visitor: VISITOR, audio: RECORDING })).json();
  assert.equal(again.text, 'What is a fraction?', 'dictating there uses its step too');
});

test('photos and PDFs reach the reply model as content, and aren’t kept', async (t) => {
  const image = `data:image/png;base64,${Buffer.from(PNG).toString('base64')}`;
  const pdf = `data:application/pdf;base64,${Buffer.alloc(30, 5).toString('base64')}`;
  const { post, calls, store } = await started(t, [desk()], { roles: { reply: 'm1' }, reads: { m1: { images: true, files: true } } });
  const answered = await post('/chat/desk/messages', { visitor: VISITOR, message: 'Look at these', attachments: [{ data: image, name: 'photo.png' }, { data: pdf, name: 'notes.pdf' }] });
  assert.equal(answered.status, 200, await answered.clone().text());
  const content = calls.find((call) => call.path === '/chat/completions').body.messages.at(-1).content;
  assert.deepEqual(content, [{ type: 'text', text: 'Look at these' }, { type: 'image_url', image_url: { url: image } }, { type: 'file', file: { filename: 'notes.pdf', file_data: pdf } }]);
  const { conversation_id: conversationId } = await answered.json();
  const kept = await store.get(`conversations/${conversationId}`);
  assert.equal(kept.messages[0].content, 'Look at these\n[Attached: a picture, notes.pdf]');
  for (const key of await store.list('')) assert.ok(!JSON.stringify(await store.get(key)).includes(Buffer.alloc(30, 5).toString('base64')), `${key} keeps the attachment`);
  const alone = await post('/chat/desk/messages', { visitor: VISITOR, attachments: [{ data: image, name: 'photo.png' }] });
  assert.equal(alone.status, 200, 'a photo needs no words');
});

test('attachments are refused over the limits, in the wrong form, or where the model can’t read them', async (t) => {
  const image = `data:image/png;base64,${Buffer.from(PNG).toString('base64')}`;
  const { post, calls } = await started(t, [desk()], { roles: { reply: 'm1' }, reads: { m1: { images: true } } });
  const code = async (attachments) => { const answered = await post('/chat/desk/messages', { visitor: VISITOR, message: 'Hi', attachments }); return [answered.status, (await answered.json()).error?.code]; };
  const big = (megabytes) => ({ data: `data:image/png;base64,${Buffer.alloc(Math.round(megabytes * 1024 * 1024), 1).toString('base64')}` });
  assert.deepEqual(await code([{ data: image }, { data: image }, { data: image }, { data: image }, { data: image }]), [400, 'too_many_attachments']);
  assert.deepEqual(await code([big(9)]), [413, 'attachment_too_large']);
  assert.deepEqual(await code([big(6), big(4.2)]), [413, 'attachment_too_large']);
  assert.deepEqual(await code([{ data: 'data:text/html;base64,AAAA' }]), [415, 'unsupported_attachment']);
  assert.deepEqual(await code([{ data: 'https://elsewhere.example/x.png' }]), [400, 'invalid_attachment']);
  assert.deepEqual(await code([{ data: 'data:application/pdf;base64,AAAA' }]), [400, 'attachments_not_available'], 'it reads images, not PDFs');
  assert.equal(calls.filter((call) => call.path === '/chat/completions').length, 0);
  // Over a megabyte, the server's usual limit: a page that takes them takes them.
  const answered = await post('/chat/desk/messages', { visitor: VISITOR, message: 'Hi', attachments: [big(5)] });
  assert.equal(answered.status, 200);
  const tooBig = await post('/chat/desk/messages', { visitor: VISITOR, message: 'x'.repeat(15 * 1024 * 1024) });
  assert.equal(tooBig.status, 413);
});

test('a page that takes no media keeps the server’s own body limit', async (t) => {
  const { post } = await started(t, [desk()], { roles: { reply: 'm1' } });
  assert.equal((await post('/chat/desk/messages', { visitor: VISITOR, message: 'x'.repeat(2 * 1024 * 1024) })).status, 413);
});

test('a reply arrives in pieces on serve, each as the provider writes it', async (t) => {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const piece = (content) => `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`;
  const chat = () => new Response(new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      controller.enqueue(encoder.encode(piece('Two ')));
      await gate;
      controller.enqueue(encoder.encode(`${piece('halves.')}data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } })}\n\ndata: [DONE]\n\n`));
      controller.close();
    }
  }), { headers: { 'content-type': 'text/event-stream' } });
  const { post, calls } = await started(t, [desk()], { roles: { reply: 'm1' }, endpoint: { chat } });
  const response = await post('/chat/desk/messages', { visitor: VISITOR, message: 'Half of four?', stream: true });
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let text = '';
  const deltas = [];
  const timer = setTimeout(() => { release(); }, 5000);
  t.after(() => clearTimeout(timer));
  let sawFirstWhileHeld = false;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    text += decoder.decode(value, { stream: true });
    const frames = framesOf(text);
    deltas.length = 0;
    deltas.push(...frames.filter((frame) => frame.name === 'run.delta').map((frame) => frame.data.text));
    if (deltas.length === 1 && !sawFirstWhileHeld) { sawFirstWhileHeld = true; clearTimeout(timer); release(); }
  }
  assert.ok(sawFirstWhileHeld, 'the first piece reached the page while the provider was still writing');
  assert.deepEqual(deltas, ['Two ', 'halves.']);
  assert.equal(calls.find((call) => call.path === '/chat/completions').body.stream, true);
  assert.equal(framesOf(text).find((frame) => frame.name === 'run.completed').data.reply.text, 'Two halves.');
});

test('a picture an agent draws reaches its page from this server', async (t) => {
  const graph = { entry: 'draw', nodes: [{ id: 'draw', type: 'image', config: { model: 'named', prompt: 'A fox' }, next: 'out' }, { id: 'out', type: 'output', config: { text: 'Here it is.', attachments: '{{draw.urls}}' } }] };
  const { url, post, calls } = await started(t, [desk({}, graph)], { roles: { reply: 'm1', drawing: 'brush-1' } });
  const { reply } = await (await post('/chat/desk/messages', { visitor: VISITOR, message: 'Draw a fox' })).json();
  assert.equal(calls.find((call) => call.path === '/images/generations').body.model, 'brush-1');
  assert.equal(reply.images.length, 1);
  assert.ok(reply.images[0].url.startsWith(`${url}/media/`) && reply.images[0].url.endsWith('.png'), reply.images[0].url);
  const shown = await globalThis.fetch(reply.images[0].url);
  assert.equal(shown.headers.get('content-type'), 'image/png');
  assert.deepEqual(new Uint8Array(await shown.arrayBuffer()), PNG);
});

test('--no-speech keeps a page silent, whatever is set', async (t) => {
  const { url, post, calls } = await started(t, [desk()], { roles: { reply: 'm1', hearing: 'whisper-1', speaking: 'tts-1' }, options: { silent: true } });
  assert.equal((await configOf(url, '/chat/desk')).speaks, false);
  await post('/chat/desk/messages', { visitor: VISITOR, audio: RECORDING });
  assert.equal(calls.filter((call) => call.path === '/audio/speech').length, 0);
});

test('what a turn made leaves with keepDays, and with forget', async (t) => {
  const { forgetLearner } = await import('../src/server/learner.js');
  const { post, store } = await started(t, [desk()], { roles: { reply: 'm1', hearing: 'whisper-1', speaking: 'tts-1' }, options: { keepDays: 1 } });
  await post('/chat/desk/messages', { visitor: VISITOR, audio: RECORDING });
  const before = await store.list('media/');
  assert.ok(before.length >= 2, before.join());
  assert.equal((await store.get(before.find((key) => key.split('/').length === 2))).type, 'audio/mpeg');
  const owner = (await store.get(before.find((key) => key.split('/').length === 2))).user;
  assert.match(owner, /^chat:/);
  await forgetLearner(store, owner);
  assert.deepEqual(await store.list('media/'), []);
});

