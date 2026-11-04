/**
 * Calling a model: any OpenAI-compatible endpoint (OpenAI, or an open-weight model behind vLLM, Ollama,
 * llama.cpp, LM Studio...). Everything in the Harness that calls a model takes this, or a host's own
 * function of the same shape. No Node built-ins.
 */
// A Worker has no process; a key there is passed as an option.
const shellValue = (name) => globalThis.process?.env?.[name];

// A call that reached nothing. The endpoint is the person's own, so why is passed on, with what to do. A stop (the caller left, time ran out) stays what it is.
export async function reach(fetch, url, init, { what, id, code }) {
  try { return await fetch(url, init); } catch (error) {
    if (['AbortError', 'TimeoutError'].includes(error?.name)) throw error;
    const inside = /^https?:\/\/(localhost|127\.|\[::1\])/i.test(url) ? ' In a container, localhost is the container itself: use the address of the machine the endpoint runs on, such as http://host.docker.internal:11434/v1.' : '';
    const message = `The ${what} endpoint (${url}, model ${id}) can't be reached: ${error?.cause?.code || error?.cause?.message || error?.message}. Check OPENAI_BASE_URL.${inside}`;
    console.error(message);
    throw Object.assign(new Error(message), { status: 502, code });
  }
}

// What a host's request calls its options, and the names an OpenAI-compatible endpoint takes.
const SNAKE = { maxTokens: 'max_tokens', maxCompletionTokens: 'max_completion_tokens', topP: 'top_p', reasoningEffort: 'reasoning_effort', responseFormat: 'response_format', toolChoice: 'tool_choice', frequencyPenalty: 'frequency_penalty', presencePenalty: 'presence_penalty' };
// OpenAI's GPT-5 and later and its o-series take max_completion_tokens, and only their own temperature and top_p. Through a router the name may have a prefix.
const NEWER_OPENAI = /(?:^|\/)(?:gpt-(?:[5-9]|\d{2,})|o[1-9](?:-|$))/i;

/** A request as an endpoint reads it: its options in the endpoint's own names, for this model, and none left undefined. */
export function endpointRequest(request, model = request.model) {
  const out = {};
  for (const [key, value] of Object.entries(request)) {
    if (value === undefined) continue;
    out[SNAKE[key] ?? key] = value;
  }
  if (NEWER_OPENAI.test(String(model || ''))) {
    if (out.max_tokens != null) {
      out.max_completion_tokens ??= out.max_tokens;
      delete out.max_tokens;
    }
    delete out.temperature;
    delete out.top_p;
  }
  return out;
}

// What an endpoint can refuse about a request and still answer it another way. Which models take which option
// changes, and a local server or a router has its own list, so what it says outranks the rule above.
const REFUSED = /unsupported|not supported|does not support|unrecognized|unknown|not allowed|not permitted|only the default|extra (?:fields?|inputs?)|use '?max_/i;
const INSTEAD = {
  max_tokens: (body) => { body.max_completion_tokens ??= body.max_tokens; delete body.max_tokens; },
  max_completion_tokens: (body) => { body.max_tokens ??= body.max_completion_tokens; delete body.max_completion_tokens; },
  temperature: (body) => { delete body.temperature; },
  top_p: (body) => { delete body.top_p; },
  reasoning_effort: (body) => { delete body.reasoning_effort; },
  stream_options: (body) => { delete body.stream_options; }
};

/** The body changed as a refusal asks, or null when it names nothing that can be changed. tried: options already changed once, so two names can't swap for ever. */
export function bodyAfterRefusal(body, reason, tried = new Set()) {
  if (!REFUSED.test(reason)) return null;
  const option = Object.keys(INSTEAD).find((name) => body[name] !== undefined && !tried.has(name) && new RegExp(`\\b${name}\\b`).test(reason));
  if (!option) return null;
  tried.add(option);
  const next = { ...body };
  INSTEAD[option](next);
  return next;
}

/**
 * callChatModel for any OpenAI-compatible /chat/completions endpoint. `model` replaces every model a
 * request names, and map ({ named: replacement }) the ones it lists; without them each request's model is
 * sent as named (a VIABLE alias such as viable-3 means nothing to another endpoint, so replace it).
 * With options.onDelta and an endpoint that streams, the reply arrives word by word.
 */
export function openAICompatible({ baseUrl = shellValue('OPENAI_BASE_URL') || 'https://api.openai.com/v1', apiKey = shellValue('OPENAI_API_KEY'), model = null, map = null, fetch = (...args) => globalThis.fetch(...args) } = {}) {
  const url = `${String(baseUrl).replace(/\/+$/, '')}/chat/completions`;
  return async (_env, request, options = {}) => {
    const id = map?.[request.model] || model || request.model;
    const stream = typeof options.onDelta === 'function';
    const send = (body) => reach(fetch, url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}) },
      body: JSON.stringify(body),
      ...(options.signal ? { signal: options.signal } : {})
    }, { what: 'model', id, code: 'provider_error' });
    let body = { ...endpointRequest(request, id), model: id, stream, ...(stream ? { stream_options: { include_usage: true } } : {}) };
    let response = await send(body);
    const tried = new Set();
    while (response.status === 400 && response.clone) {
      const next = bodyAfterRefusal(body, await response.clone().text().catch(() => ''), tried);
      if (!next) break;
      body = next;
      response = await send(body);
    }
    // An endpoint that refuses to stream still answers whole.
    if (stream && response.status === 400) {
      const { stream_options: _options, ...whole } = body;
      response = await send({ ...whole, stream: false });
    }
    const isStream = stream && response.ok && /event-stream/i.test(response.headers?.get?.('content-type') || '');
    const data = isStream ? await readStream(response, options.onDelta) : await response.json().catch(() => null);
    if (!response.ok || !data || data.error) {
      const said = String(data?.error?.message || data?.error || response.statusText || 'no JSON in the answer');
      // A provider may say its key back; its words go on to whoever called.
      const reason = apiKey ? said.replaceAll(apiKey, '[its key]') : said;
      throw Object.assign(new Error(`The model endpoint (${url}, model ${id}) answered ${response.status}: ${reason}`), { status: response.ok ? 502 : response.status, code: 'provider_error' });
    }
    const content = data.choices?.[0]?.message?.content ?? '';
    // An endpoint that answered whole still tells whoever is listening, once.
    if (content && stream && !isStream) options.onDelta(content);
    const usage = data.usage || {};
    const prompt = usage.prompt_tokens || 0;
    const completion = usage.completion_tokens || 0;
    return {
      content,
      usage: { prompt, completion, total: usage.total_tokens || prompt + completion },
      // Your endpoint, your bill: the Harness doesn't price calls.
      cost: 0,
      response: data,
      resolution: { resolvedModel: id, provider: 'openai-compatible' },
      finishReason: data.choices?.[0]?.finish_reason || null
    };
  };
}

// An event stream read into what a whole answer would have held, telling onDelta as the words come.
async function readStream(response, onDelta) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const message = { role: 'assistant', content: '' };
  const toolCalls = [];
  let finish = null;
  let usage = null;
  let error = null;
  let buffer = '';
  const line = (raw) => {
    if (!raw.startsWith('data:')) return;
    const text = raw.slice(5).trim();
    if (!text || text === '[DONE]') return;
    let chunk;
    try { chunk = JSON.parse(text); } catch { return; }
    if (chunk.error) error = chunk.error;
    if (chunk.usage) usage = chunk.usage;
    const choice = chunk.choices?.[0];
    if (!choice) return;
    if (choice.finish_reason) finish = choice.finish_reason;
    const delta = choice.delta || {};
    if (typeof delta.content === 'string' && delta.content) {
      message.content += delta.content;
      onDelta(delta.content);
    }
    for (const call of delta.tool_calls || []) {
      const at = call.index ?? toolCalls.length;
      const held = (toolCalls[at] ||= { id: call.id, type: call.type || 'function', function: { name: '', arguments: '' } });
      if (call.id) held.id = call.id;
      if (call.function?.name) held.function.name += call.function.name;
      if (call.function?.arguments) held.function.arguments += call.function.arguments;
    }
  };
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop();
    for (const raw of lines) line(raw);
  }
  if (buffer) line(buffer);
  if (toolCalls.length) message.tool_calls = toolCalls;
  return { choices: [{ message, finish_reason: finish }], usage, ...(error ? { error } : {}) };
}
