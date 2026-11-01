import test from 'node:test';
import assert from 'node:assert/strict';

import { runAgentGraph } from '../src/agents/engine.js';
import { describePictures, loadPictureMemory, pictureScope, rememberPictures, resolvePictureSource } from '../src/agents/pictures.js';

const url = (name) => `https://assets.example/${name}.png`;
const imageResult = (urls) => ({
  publicData: { data: urls.map((u) => ({ url: u })) },
  resolution: { resolvedModel: 'img-model', provider: 'openai' },
  cost: 0.01 * urls.length,
  usage: { prompt: 1, completion: 1, total: 2 },
  imageCount: urls.length
});
const failure = (props) => Object.assign(new Error(props.message || 'failed'), props);
const chat = (json) => ({ content: JSON.stringify(json), usage: { prompt: 1, completion: 1, total: 2 }, cost: 0, resolution: { resolvedModel: 'gpt-6-luna', provider: 'openai' }, finishReason: 'stop' });

// A tutor in three steps: the model plans the reply and its pictures, one picture step draws them
// all, and the reply carries them.
function tutor(extra = {}) {
  return {
    entry: 'input',
    run_limits: { max_model_calls: 30 },
    nodes: [
      { id: 'input', type: 'input', next: 'tutor' },
      {
        id: 'tutor',
        type: 'llm',
        config: {
          model: 'gpt-6-luna',
          pictures: true,
          outputs: [
            { name: 'reply', type: 'string' },
            { name: 'pictures', type: 'list', max_items: 3, fields: [{ name: 'prompt', type: 'string' }, { name: 'label', type: 'string' }, { name: 'n', type: 'number' }, { name: 'source', type: 'number' }] }
          ]
        },
        next: 'draw'
      },
      { id: 'draw', type: 'image', config: { model: 'gpt-image-1', items: '{{tutor.json.pictures}}', ...extra }, next: 'out' },
      { id: 'out', type: 'output', config: { text: '{{tutor.json.reply}}', attachments: '{{draw.urls}}', data: { status: '{{draw.status}}', blocked: '{{draw.blocked_numbers}}' } } }
    ]
  };
}

function services(plan, draw) {
  const calls = [];
  const chats = [];
  return {
    calls,
    chats,
    callChatModel: async (_env, request) => { chats.push(request); return chat(plan); },
    generateImage: async (_env, body) => { calls.push(body); return draw(body, calls.length); }
  };
}

test('one scene, three pictures: a single call with n=3', async () => {
  const svc = services({ reply: 'Here are three foxes.', pictures: [{ prompt: 'a red fox in snow', label: 'Fox', n: 3, source: 0 }] }, (body) => imageResult([1, 2, 3].map((i) => url(`fox${i}`)).slice(0, body.n)));
  const result = await runAgentGraph({}, tutor(), { input: 'draw a fox three ways', services: svc });
  assert.equal(svc.calls.length, 1);
  assert.equal(svc.calls[0].n, 3);
  assert.equal(svc.calls[0].operation, 'generate');
  assert.deepEqual(result.output.attachments.map((a) => a.url), [url('fox1'), url('fox2'), url('fox3')]);
  const draw = result.outputs.draw;
  assert.equal(draw.ready_count, 3);
  assert.deepEqual(draw.pictures.map((p) => [p.number, p.slot, p.label, p.status]), [[1, 1, 'Fox', 'ready'], [2, 2, 'Fox', 'ready'], [3, 3, 'Fox', 'ready']]);
  assert.deepEqual(result.pictures.current.map((p) => p.number), [1, 2, 3]);
});

test('two scenes, one picture each: two calls with their own prompts', async () => {
  const svc = services({ reply: 'Beginning and end.', pictures: [{ prompt: 'the hero leaves home', label: 'Beginning', n: 1, source: 0 }, { prompt: 'the hero returns', label: 'End', n: 1, source: 0 }] }, (body) => imageResult([url(body.prompt.includes('leaves') ? 'start' : 'end')]));
  const result = await runAgentGraph({}, tutor(), { input: 'two moments of my story', services: svc });
  assert.deepEqual(svc.calls.map((c) => [c.prompt, c.n]), [['the hero leaves home', undefined], ['the hero returns', undefined]]);
  assert.deepEqual(result.outputs.draw.urls, [url('start'), url('end')]);
  assert.deepEqual(result.outputs.draw.pictures.map((p) => p.label), ['Beginning', 'End']);
});

test('a mixture: one scene twice and another once', async () => {
  const svc = services({ reply: 'ok', pictures: [{ prompt: 'castle', label: 'A', n: 2, source: 0 }, { prompt: 'dragon', label: 'B', n: 1, source: 0 }] }, (body) => imageResult(Array.from({ length: body.n || 1 }, (_, i) => url(`${body.prompt}${i}`))));
  const result = await runAgentGraph({}, tutor(), { input: 'go', services: svc });
  assert.equal(svc.calls.length, 2);
  assert.deepEqual(result.outputs.draw.pictures.map((p) => [p.number, p.label, p.item]), [[1, 'A', 1], [2, 'A', 1], [3, 'B', 2]]);
});

test('a safety refusal is blocked, never retried, and the run still replies with the rest', async () => {
  const svc = services({ reply: 'Two pictures.', pictures: [{ prompt: 'a calm lake', label: 'Lake', n: 1, source: 0 }, { prompt: 'something declined', label: 'Other', n: 1, source: 0 }] }, (body) => {
    if (body.prompt.includes('declined')) throw failure({ status: 400, code: 'image_generation_failed', imageFailureReason: 'safety' });
    return imageResult([url('lake')]);
  });
  const result = await runAgentGraph({}, tutor(), { input: 'go', services: svc });
  assert.equal(svc.calls.length, 2);
  assert.equal(result.output.text, 'Two pictures.');
  assert.deepEqual(result.output.attachments.map((a) => a.url), [url('lake')]);
  const draw = result.outputs.draw;
  assert.equal(draw.status, 'partial');
  assert.deepEqual(draw.blocked_numbers, [2]);
  assert.deepEqual(draw.pictures[1], { number: 2, url: null, prompt: 'something declined', label: 'Other', description: 'something declined', status: 'blocked', reason: 'safety', slot: 2, item: 2 });
  assert.deepEqual(draw.unfinished, [{ prompt: 'something declined', label: 'Other', description: 'something declined', slot: 2 }]);
  assert.deepEqual(pictureScope(result.pictures).unfinished, [{ number: 2, slot: 2, prompt: 'something declined', label: 'Other', description: 'something declined', reason: 'safety' }]);
});

test('a busy service is retried once; a timeout is not redrawn', async () => {
  let busy = 0;
  const svc = services({ reply: 'ok', pictures: [{ prompt: 'busy then fine', label: '', n: 1, source: 0 }, { prompt: 'too slow', label: '', n: 1, source: 0 }] }, (body) => {
    if (body.prompt === 'busy then fine' && busy++ === 0) throw failure({ status: 503, imageRetryable: true, retryAfterMs: 1 });
    if (body.prompt === 'too slow') throw Object.assign(new Error('The operation timed out.'), { name: 'TimeoutError' });
    return imageResult([url('fine')]);
  });
  const result = await runAgentGraph({}, tutor(), { input: 'go', services: svc });
  assert.equal(svc.calls.filter((c) => c.prompt === 'busy then fine').length, 2);
  assert.equal(svc.calls.filter((c) => c.prompt === 'too slow').length, 1);
  assert.deepEqual(result.outputs.draw.pictures.map((p) => [p.status, p.reason ?? null]), [['ready', null], ['failed', 'time']]);
  assert.equal(result.output.text, 'ok');
});

test('no pictures asked for: no calls, nothing remembered', async () => {
  const svc = services({ reply: 'Just words.', pictures: [] }, () => assert.fail('no call'));
  const result = await runAgentGraph({}, tutor(), { input: 'hi', services: svc, pictures: { current: [{ number: 1, url: url('old'), prompt: 'old', label: '' }] } });
  assert.equal(result.outputs.draw.status, 'skipped');
  assert.equal(result.pictures, null);
  assert.deepEqual(result.output.attachments, []);
});

test('the next turn edits picture 2 by number and keeps the rest', async () => {
  const saved = { current: [{ number: 1, url: url('a'), prompt: 'a cat', label: 'Cat' }, { number: 2, url: url('b'), prompt: 'a dog', label: 'Dog' }], history: [], turn: 1 };
  const svc = services({ reply: 'Your dog now wears a hat.', pictures: [{ prompt: 'the same dog wearing a hat', label: 'Dog', n: 1, source: 2 }] }, () => imageResult([url('b2')]));
  const result = await runAgentGraph({}, tutor(), { input: 'give the dog a hat', services: svc, pictures: saved });
  assert.equal(svc.calls[0].operation, 'edit');
  assert.deepEqual(svc.calls[0].images, [{ image_url: url('b') }]);
  // The model was told what the learner can see, by number.
  assert.match(svc.chats[0].messages[0].content, /1\. Cat: a cat\n2\. Dog: a dog/);
  assert.deepEqual(result.outputs.draw.pictures[0].slot, 2);
  assert.deepEqual(result.pictures.current.map((p) => [p.number, p.url]), [[1, url('a')], [2, url('b2')]]);
});

test('a number the conversation doesn\'t have is never drawn fresh', async () => {
  const svc = services({ reply: 'ok', pictures: [{ prompt: 'change it', label: '', n: 1, source: 5 }] }, () => assert.fail('no call'));
  const result = await runAgentGraph({}, tutor(), { input: 'go', services: svc });
  assert.deepEqual(result.outputs.draw.pictures.map((p) => [p.status, p.reason]), [['failed', 'source_missing']]);
});

test('finishing the rest fills the same numbers', async () => {
  const saved = { current: [{ number: 1, url: url('a'), prompt: 'one', label: '' }, { number: 2, url: null, prompt: 'two', label: '', reason: 'busy' }, { number: 3, url: null, prompt: 'three', label: '', reason: 'time' }], history: [], turn: 2 };
  const graph = { entry: 'input', nodes: [
    { id: 'input', type: 'input', next: 'draw' },
    { id: 'draw', type: 'image', config: { model: 'gpt-image-1', items: '{{conversation.unfinished}}' }, next: 'out' },
    { id: 'out', type: 'output', config: { text: 'Finished {{and_list(draw.ready_numbers)}}.', attachments: '{{draw.urls}}' } }
  ] };
  const calls = [];
  const result = await runAgentGraph({}, graph, { input: 'finish the rest', pictures: saved, services: { generateImage: async (_env, body) => { calls.push(body.prompt); return imageResult([url(body.prompt)]); } } });
  assert.deepEqual(calls, ['two', 'three']);
  assert.deepEqual(result.outputs.draw.pictures.map((p) => p.slot), [2, 3]);
  assert.deepEqual(result.pictures.current.map((p) => [p.number, p.url]), [[1, url('a')], [2, url('two')], [3, url('three')]]);
  assert.equal(result.output.text, 'Finished 1 and 2.');
});

test('a single picture step can edit a numbered picture with operation auto', async () => {
  const graph = { entry: 'input', nodes: [
    { id: 'input', type: 'input', next: 'draw' },
    { id: 'draw', type: 'image', config: { model: 'gpt-image-1', operation: 'auto', source: '{{vars.which}}', prompt: 'make it night' }, next: 'out' },
    { id: 'out', type: 'output', config: { text: 'done', attachments: '{{draw.urls}}' } }
  ] };
  const saved = { current: [{ number: 1, url: url('day'), prompt: 'day', label: '' }] };
  const calls = [];
  const svc = { generateImage: async (_env, body) => { calls.push(body); return imageResult([url('night')]); } };
  const edited = await runAgentGraph({}, graph, { input: 'x', pictures: saved, variables: { which: 1 }, services: svc });
  assert.equal(calls[0].operation, 'edit');
  assert.deepEqual(calls[0].images, [{ image_url: url('day') }]);
  assert.deepEqual(edited.pictures.current.map((p) => p.url), [url('night')]);
  const fresh = await runAgentGraph({}, graph, { input: 'x', pictures: saved, variables: { which: '' }, services: svc });
  assert.equal(calls[1].operation, 'generate');
  assert.equal(fresh.outputs.draw.status, 'completed');
  await assert.rejects(runAgentGraph({}, graph, { input: 'x', pictures: saved, variables: { which: 4 }, services: svc }), /changes picture "4"/);
});

test('picture memory: fresh sets, edits, fills, failed edits and limits', () => {
  let memory = loadPictureMemory(null);
  const req = (prompt, results, extra = {}) => ({ prompt, label: '', source: null, fill: null, results, ...extra });
  memory = rememberPictures(memory, [req('a', [{ url: url('a'), status: 'ready' }, { url: null, status: 'blocked', reason: 'safety' }])]);
  assert.deepEqual(memory.current.map((p) => [p.number, p.url, p.reason ?? null]), [[1, url('a'), null], [2, null, 'safety']]);
  // A failed edit of one picture keeps the picture it started from.
  memory = rememberPictures(memory, [req('a2', [{ url: null, status: 'failed', reason: 'busy' }], { source: { url: url('a'), slot: 1 } })]);
  assert.equal(memory.current[0].url, url('a'));
  // Filling number 2 keeps the rest of the set.
  memory = rememberPictures(memory, [req('b', [{ url: url('b'), status: 'ready' }], { fill: 2 })]);
  assert.deepEqual(memory.current.map((p) => [p.number, p.url]), [[1, url('a')], [2, url('b')]]);
  // One edit replaces its number and keeps the rest.
  memory = rememberPictures(memory, [req('c', [{ url: url('c'), status: 'ready' }], { source: { url: url('b'), slot: 2 }, description: 'b at night' })]);
  assert.deepEqual(memory.current.map((p) => [p.number, p.url, p.description]), [[1, url('a'), ''], [2, url('c'), 'b at night']]);
  // Two versions of picture 1 (or any mixture): a fresh set from 1, a failed version kept with its source.
  memory = rememberPictures(memory, [req('d', [{ url: url('d'), status: 'ready' }], { source: { url: url('a'), slot: 1 } }), req('d2', [{ url: null, status: 'failed', reason: 'busy' }], { source: { url: url('a'), slot: 1 } })]);
  assert.deepEqual(memory.current.map((p) => [p.number, p.url, p.source ?? null]), [[1, url('d'), null], [2, null, url('a')]]);
  // Only new pictures: a fresh set from 1.
  memory = rememberPictures(memory, [req('e', [{ url: url('e'), status: 'ready' }])]);
  assert.deepEqual(memory.current.map((p) => [p.number, p.url]), [[1, url('e')]]);
  assert.deepEqual(memory.history.map((p) => p.url), [url('a'), url('b'), url('c'), url('d'), url('e')]);
  assert.equal(memory.turn, 6);
  // Data URIs and huge values are never kept; prompts are clipped.
  memory = rememberPictures(memory, [req('x'.repeat(5000), [{ url: 'data:image/png;base64,AAAA', status: 'ready' }])]);
  assert.equal(memory.current.length, 0);
  for (let i = 0; i < 30; i++) memory = rememberPictures(memory, [req(`p${i}`, [{ url: url(`p${i}`), status: 'ready' }])]);
  assert.equal(memory.history.length, 20);
  assert.equal(loadPictureMemory({ current: [{ number: 1, url: url('z'), prompt: 'y'.repeat(5000) }] }).current[0].prompt.length, 1000);
});

test('picture sources name a number, a picture or an address', () => {
  const memory = loadPictureMemory({ current: [{ number: 1, url: url('a'), prompt: '', label: '' }, { number: 2, url: null, prompt: 'b', label: '', reason: 'safety' }] });
  assert.deepEqual(resolvePictureSource(1, memory), { url: url('a'), slot: 1 });
  assert.deepEqual(resolvePictureSource('1', memory), { url: url('a'), slot: 1 });
  assert.deepEqual(resolvePictureSource({ number: 1 }, memory), { url: url('a'), slot: 1 });
  assert.deepEqual(resolvePictureSource({ url: url('a') }, memory), { url: url('a'), slot: 1 });
  assert.deepEqual(resolvePictureSource(url('elsewhere'), memory), { url: url('elsewhere'), slot: null });
  assert.deepEqual(resolvePictureSource(2, memory), { missing: 2 });
  assert.deepEqual(resolvePictureSource('the cat', memory), { missing: 'the cat' });
  for (const none of [null, '', 0, '0', false]) assert.equal(resolvePictureSource(none, memory), null);
  assert.match(describePictures(memory), /2\. \(not drawn: the image model’s safety check declined it\) b/);
  // The picture drawn last is marked when older ones are still there, and descriptions win over prompts.
  const two = loadPictureMemory({ current: [{ number: 1, url: url('a'), prompt: 'a cat', turn: 1 }, { number: 2, url: url('b'), prompt: 'make it night', description: 'a cat at night', turn: 2 }] });
  assert.equal(describePictures(two).split('\n').slice(1).join('\n'), '1. a cat\n2. (newest) a cat at night');
  assert.equal(describePictures(loadPictureMemory(null)), 'Pictures in this conversation: none yet.');
});

test('pictures a run drew but its reply did not show are not remembered', async () => {
  const graph = (attach) => ({ entry: 'input', nodes: [
    { id: 'input', type: 'input', next: 'draw' },
    { id: 'draw', type: 'image', config: { model: 'gpt-image-1', items: '{{ [{prompt: "a fox", scene: "a red fox in snow"}] }}' }, next: 'out' },
    { id: 'out', type: 'output', config: { text: 'x', attachments: attach } }
  ] });
  const services = { generateImage: async () => imageResult([url('fox')]) };
  const shown = await runAgentGraph({}, graph('{{draw.urls}}'), { input: 'x', services });
  assert.deepEqual(shown.pictures.current.map((p) => [p.number, p.description]), [[1, 'a red fox in snow']]);
  assert.equal(pictureScope(shown.pictures).pictures[0].description, 'a red fox in snow');
  const hidden = await runAgentGraph({}, graph(''), { input: 'x', services });
  assert.equal(hidden.pictures, null);
});

test('without() keeps the items whose field differs', async () => {
  const { evaluateExpression } = await import('../src/agents/expression.js');
  const scope = { u: [{ n: 1, reason: 'safety' }, { n: 2, reason: 'busy' }, { n: 3 }] };
  assert.deepEqual(evaluateExpression('pluck(without(u, "reason", "safety"), "n")', scope), [2, 3]);
  assert.deepEqual(evaluateExpression('pluck(without(u, "reason"), "n")', scope), [3]);
});
