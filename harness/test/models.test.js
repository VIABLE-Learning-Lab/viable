import test from 'node:test';
import assert from 'node:assert/strict';
import './no-network.js';
import { bodyAfterRefusal, endpointRequest, openAICompatible } from '../src/models.js';

const answer = (content = 'ok') => new Response(JSON.stringify({ choices: [{ message: { content }, finish_reason: 'stop' }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } }), { headers: { 'content-type': 'application/json' } });
const refuse = (message) => new Response(JSON.stringify({ error: { message } }), { status: 400, headers: { 'content-type': 'application/json' } });
const sentBy = (...answers) => {
  const bodies = [];
  const fetch = async (_url, init) => { bodies.push(JSON.parse(init.body)); return answers.shift()(); };
  return { bodies, fetch };
};

test('a host\'s option names become the endpoint\'s, and none is left undefined', () => {
  assert.deepEqual(endpointRequest({ model: 'gpt-4o', maxTokens: 10, topP: 0.5, temperature: 0.7, reasoningEffort: undefined, responseFormat: { type: 'json_object' } }), { model: 'gpt-4o', max_tokens: 10, top_p: 0.5, temperature: 0.7, response_format: { type: 'json_object' } });
});

test('OpenAI\'s newer models get the names they take, and no sampling they refuse; others keep theirs', () => {
  for (const model of ['gpt-5', 'gpt-5.5', 'gpt-6-luna', 'gpt-6.1-sol', 'o1', 'o3-mini', 'openai/gpt-5.4-mini']) {
    assert.deepEqual(endpointRequest({ model, maxTokens: 10, temperature: 0.7, topP: 0.5 }), { model, max_completion_tokens: 10 }, model);
  }
  for (const model of ['gpt-4o', 'gpt-4.1-mini', 'gpt-oss-120b', 'llama3.1', 'mistral', 'o-custom', 'gemma-4']) {
    assert.deepEqual(endpointRequest({ model, maxTokens: 10, temperature: 0.7 }), { model, max_tokens: 10, temperature: 0.7 }, model);
  }
  assert.equal(endpointRequest({ model: 'gpt-5', maxTokens: 10, maxCompletionTokens: 20 }).max_completion_tokens, 20, 'the one a host chose by name stands');
  assert.equal(endpointRequest({ model: 'named', maxTokens: 10 }, 'gpt-6').max_completion_tokens, 10, 'the model the request will be sent as decides');
});

test('what an endpoint refuses is changed and sent again, one option at a time', async () => {
  const { bodies, fetch } = sentBy(
    () => refuse("Unsupported parameter: 'max_tokens' is not supported with this model. Use 'max_completion_tokens' instead."),
    () => refuse("Unsupported value: 'temperature' does not support 0.7 with this model. Only the default (1) value is supported."),
    () => answer('done')
  );
  const call = openAICompatible({ baseUrl: 'http://models.test/v1', fetch });
  const result = await call(null, { model: 'a-name-with-no-rule', messages: [], maxTokens: 10, temperature: 0.7 });
  assert.equal(result.content, 'done');
  assert.equal(bodies[0].max_tokens, 10);
  assert.equal(bodies[1].max_completion_tokens, 10);
  assert.equal('max_tokens' in bodies[1], false);
  assert.equal('temperature' in bodies[2], false);
});

test('an older server that refuses the new name gets the old one', async () => {
  const { bodies, fetch } = sentBy(() => refuse('Unknown field max_completion_tokens'), () => answer());
  await openAICompatible({ baseUrl: 'http://models.test/v1', fetch })(null, { model: 'gpt-5', messages: [], maxTokens: 10 });
  assert.equal(bodies[0].max_completion_tokens, 10);
  assert.equal(bodies[1].max_tokens, 10);
});

test('two names can\'t swap for ever, and a refusal about anything else is the caller\'s error', async () => {
  const swaps = sentBy(...Array.from({ length: 8 }, (_, i) => () => refuse(i % 2 ? "Unsupported parameter: 'max_completion_tokens'" : "Unsupported parameter: 'max_tokens'")));
  await assert.rejects(openAICompatible({ baseUrl: 'http://models.test/v1', fetch: swaps.fetch })(null, { model: 'm', messages: [], maxTokens: 10 }), { status: 400, code: 'provider_error' });
  assert.ok(swaps.bodies.length <= 3, `sent ${swaps.bodies.length} times`);
  const other = sentBy(() => refuse('Your messages were too long.'));
  await assert.rejects(openAICompatible({ baseUrl: 'http://models.test/v1', fetch: other.fetch })(null, { model: 'm', messages: [], temperature: 0.2 }), /too long/);
  assert.equal(other.bodies.length, 1);
  assert.equal(bodyAfterRefusal({ temperature: 1 }, 'temperature must be at most 2'), null, 'a wrong value isn\'t an unknown option');
});

test('a reply streams in pieces, and an endpoint that refuses to stream answers whole', async () => {
  const streamed = new Response(['data: {"choices":[{"delta":{"content":"Hel"}}]}\n\n', 'data: {"choices":[{"delta":{"content":"lo"},"finish_reason":"stop"}]}\n\n', 'data: {"usage":{"prompt_tokens":3,"completion_tokens":2,"total_tokens":5},"choices":[]}\n\ndata: [DONE]\n\n'].join(''), { headers: { 'content-type': 'text/event-stream' } });
  const pieces = [];
  const one = sentBy(() => streamed);
  const got = await openAICompatible({ baseUrl: 'http://models.test/v1', fetch: one.fetch })(null, { model: 'm', messages: [] }, { onDelta: (text) => pieces.push(text) });
  assert.deepEqual(pieces, ['Hel', 'lo']);
  assert.equal(got.content, 'Hello');
  assert.equal(got.usage.total, 5);
  assert.equal(got.finishReason, 'stop');
  assert.equal(one.bodies[0].stream, true);
  const refused = sentBy(() => refuse('Streaming is off here.'), () => answer('whole'));
  const told = [];
  const whole = await openAICompatible({ baseUrl: 'http://models.test/v1', fetch: refused.fetch })(null, { model: 'm', messages: [] }, { onDelta: (text) => told.push(text) });
  assert.equal(whole.content, 'whole');
  assert.deepEqual(told, ['whole']);
  assert.equal(refused.bodies[1].stream, false);
  assert.equal('stream_options' in refused.bodies[1], false);
  const noOptions = sentBy(() => refuse("Unrecognized request argument supplied: stream_options"), () => answer('fine'));
  await openAICompatible({ baseUrl: 'http://models.test/v1', fetch: noOptions.fetch })(null, { model: 'm', messages: [] }, { onDelta: () => {} });
  assert.equal(noOptions.bodies[1].stream, true, 'it still streams without the option it refused');
  assert.equal('stream_options' in noOptions.bodies[1], false);
});

test('tool calls that arrive in pieces come back whole', async () => {
  const body = ['data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"c1","type":"function","function":{"name":"look","arguments":"{\\"q\\":"}}]}}]}\n\n', 'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"\\"x\\"}"}}]},"finish_reason":"tool_calls"}]}\n\n', 'data: [DONE]\n\n'].join('');
  const { fetch } = sentBy(() => new Response(body, { headers: { 'content-type': 'text/event-stream' } }));
  const got = await openAICompatible({ baseUrl: 'http://models.test/v1', fetch })(null, { model: 'm', messages: [] }, { onDelta: () => {} });
  assert.deepEqual(got.response.choices[0].message.tool_calls, [{ id: 'c1', type: 'function', function: { name: 'look', arguments: '{"q":"x"}' } }]);
});
