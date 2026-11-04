/**
 * viable-harness gateway: an OpenAI-compatible endpoint in front of any other, so an AI app gets a
 * teacher's settings, a check on each reply and a record by changing one URL (docs/with-your-stack.md).
 * It sends How the AI helps with the app's messages, runs checkReply's VETTING on the text a learner
 * would read, and keeps records in the shape viable-harness view and suggest read. Web-standard with
 * no Node imports: gatewayHandler returns (Request) => Response, so it deploys anywhere.
 */
import { checkReply } from './check.js';
import { suggestChanges } from './suggest.js';
import { teachingContext, teachingSettings } from './teaching.js';
import { findMisconceptions } from './utils/misconceptions.js';
import { wordCount } from './utils/researchMetrics.js';
import { validateDocument } from './validate.js';
import { refusedWithoutToken } from './server/local.js';
import { markSvg, themeCss } from './ui/theme.js';
import { TEACHER_PAGE_HEADERS, teacherView, viewInputs } from './view.js';

export const DEFAULT_FALLBACK = 'I can’t give you a checked answer to that right now. Try asking another way, or ask your teacher.';
// As memory.js takes a learner: no spaces or @, so a full name or an email doesn't fit.
const PSEUDONYM = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
// Where OpenAI's own request names an end user. A learner's ID never goes to a model's endpoint.
const IDENTITY = ['user', 'safety_identifier', 'prompt_cache_key'];
const CALLER_HEADERS = ['openai-organization', 'openai-project'];
const ANSWER_HEADERS = /^(content-type|retry-after|x-request-id|x-ratelimit-.*)$/;
const NO_TOKENS = { prompt: 0, completion: 0, total: 0 };
// A key's part for a call that named no activity or learner; a pseudonym can't start with this.
const UNNAMED = '_';
// shortcut: the teacher's page reads the newest 500 runs and records, one read each; keep a summary per activity if a class outgrows that.
const PAGE_DOCS = 500;

const failure = (status, code, message) => Object.assign(new Error(message), { status, code });
const typeOf = (status) => (status === 401 ? 'authentication_error' : status >= 500 ? 'upstream_error' : 'invalid_request_error');
const json = (status, body, headers = {}) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });
const errorBody = (status, code, message) => ({ error: { message, type: typeOf(status), param: null, code } });
const textOf = (content) => (typeof content === 'string' ? content : Array.isArray(content) ? content.filter((part) => typeof part?.text === 'string').map((part) => part.text).join('\n\n') : '');
const bearerOf = (request) => /^Bearer\s+(.+)$/i.exec(request.headers.get('authorization') || '')?.[1] ?? null;
const sha256 = async (text) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))].map((byte) => byte.toString(16).padStart(2, '0')).join('');
const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (value) => String(value).replace(/[&<>"']/g, (char) => ESCAPES[char]);

function basicPassword(request) {
  const encoded = /^Basic\s+(.+)$/i.exec(request.headers.get('authorization') || '')?.[1];
  try { return encoded ? atob(encoded).split(':').slice(1).join(':') : null; } catch { return null; }
}

/** An activity's settings: a teaching settings file, or { teaching, title, fallback, guideline, reference, question, answer_key, key_concepts, explanation }. */
function activityOf(doc) {
  if (doc?.answer_key && !doc.question) throw new Error('An activity\'s answer_key needs the question it answers.');
  return {
    teaching: teachingSettings(doc?.teaching ?? doc), title: doc?.title ?? null, fallback: doc?.fallback ? String(doc.fallback) : null,
    check: { guideline: doc?.guideline, reference: doc?.reference, question: doc?.question, answerKey: doc?.answer_key, keyConcepts: doc?.key_concepts, explanation: doc?.explanation }
  };
}

// The teacher's instructions join the app's own, after them, in the words the engine uses (teachingNote).
function withTeaching(messages, text) {
  if (!text) return messages;
  const note = `From the teacher of this activity:\n${text}`;
  const at = messages.findLastIndex((item) => item?.role === 'system' || item?.role === 'developer');
  if (at < 0) return [{ role: 'system', content: note }, ...messages];
  return messages.map((item, index) => (index !== at ? item : { ...item, content: Array.isArray(item.content) ? [...item.content, { type: 'text', text: note }] : `${item.content ?? ''}\n\n${note}` }));
}

// The conversation as the check and the record read it: text only.
function turnOf(messages) {
  const said = messages.filter((item) => item?.role === 'user' || item?.role === 'assistant').map((item) => ({ role: item.role, content: textOf(item.content) })).filter((item) => item.content.trim());
  const at = said.findLastIndex((item) => item.role === 'user');
  const asked = said.filter((item) => item.role === 'user');
  return {
    message: at < 0 ? '' : said[at].content,
    history: at < 0 ? said : said.slice(0, at),
    instructions: messages.filter((item) => item?.role === 'system' || item?.role === 'developer').map((item) => textOf(item.content)).filter(Boolean).join('\n\n'),
    first: asked[0]?.content ?? '',
    index: asked.length
  };
}

const withoutIdentity = (body) => Object.fromEntries(Object.entries(body).filter(([name]) => !IDENTITY.includes(name)));

// A held reply as OpenAI streams one: the text in pieces of a few words, then the ending with what the check did.
function asStream(completion, choice, viable, includeUsage) {
  const base = { id: completion.id || `chatcmpl-${viable.run}`, object: 'chat.completion.chunk', created: completion.created ?? Math.floor(Date.now() / 1000), model: completion.model };
  const delta = (part, finish = null) => ({ ...base, choices: [{ index: 0, delta: part, finish_reason: finish }] });
  const { message, finish_reason: finish } = choice;
  const chunks = [
    delta({ role: 'assistant', content: '', ...(message.refusal ? { refusal: message.refusal } : {}) }),
    ...(textOf(message.content).match(/(?:\S+\s*){1,6}|\s+/g) || []).map((content) => delta({ content })),
    ...(message.tool_calls || []).map((call, index) => delta({ tool_calls: [{ index, ...call }] })),
    ...(message.function_call ? [delta({ function_call: message.function_call })] : []),
    { ...delta({}, finish ?? 'stop'), viable },
    ...(includeUsage ? [{ ...base, choices: [], usage: completion.usage ?? null }] : [])
  ];
  return `${chunks.map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`).join('')}data: [DONE]\n\n`;
}

// An upstream stream passed on as it comes, chunk by chunk at the client's pace; a client that hangs up stops it.
function watched(body, finished) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  const seen = { firstAt: null, text: '', usage: null };
  let pending = '';
  let ended = false;
  const finish = () => {
    if (ended) return null;
    ended = true;
    return finished(seen);
  };
  const read = (bytes) => {
    const lines = (pending + decoder.decode(bytes, { stream: true })).split(/\r?\n/);
    pending = lines.pop();
    for (const line of lines) {
      if (!line.startsWith('data:')) continue;
      try {
        const chunk = JSON.parse(line.slice(5));
        seen.text += chunk.choices?.[0]?.delta?.content ?? '';
        seen.usage = chunk.usage ?? seen.usage;
      } catch { /* [DONE], or something that isn't ours to read. */ }
    }
  };
  return new ReadableStream({
    async pull(controller) {
      try {
        const { done, value } = await reader.read();
        if (done) {
          await finish();
          return controller.close();
        }
        seen.firstAt ??= Date.now();
        read(value);
        controller.enqueue(value);
      } catch (error) {
        await finish();
        controller.error(error);
      }
    },
    cancel(reason) {
      finish();
      return reader.cancel(reason);
    }
  });
}

/** The activities a gateway has records for: IDs, with '_' for calls that named none. */
export const recordedActivities = async (store) => [...new Set((await store.list('gateway/')).map((key) => key.split('/')[1]))];

/**
 * What a gateway kept, as viable-harness view and suggest read it: { records, runs, teaching, title }.
 * activity: that activity's ID; else everything, with the settings of whichever run comes first.
 */
export async function readRecords(store, activity = null) {
  const last = (key) => key.slice(key.lastIndexOf('/') + 1);
  const keys = (await store.list(`gateway/${activity ? `${activity}/` : ''}`)).sort((a, b) => last(a).localeCompare(last(b))).slice(-PAGE_DOCS);
  const docs = await Promise.all(keys.map(async (name) => ({ name, doc: await store.get(name) })));
  return viewInputs(docs.filter((item) => item.doc));
}

function activitiesPage(ids, titleOf) {
  const name = (id) => (id === UNNAMED ? 'Calls that named no activity' : titleOf(id) || id);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Which activity? | The teacher's page</title>
<style>${themeCss({ mono: false })}
main{max-width:40rem;margin:0 auto;padding:clamp(40px,9vw,96px) 16px}
main svg{display:block;margin-bottom:28px}
.v-lead{margin:16px 0 32px}
.v-rows>li{padding:0}
.v-rows a{display:block;padding:12px 0;color:var(--public-ink);font-size:1.0625rem;text-decoration:none}
.v-rows a:hover{color:var(--ink-blue)}</style>
</head>
<body>
<main>
${markSvg({ size: 36 })}
<h1>Which activity?</h1>
<p class="v-lead">This gateway keeps records for ${ids.length} activities. Each has its own page, with its own settings.</p>
<ul class="v-rows">${ids.map((id) => `<li><a href="?activity=${encodeURIComponent(id)}">${esc(name(id))}</a></li>`).join('')}</ul>
</main>
</body>
</html>
`;
}

/**
 * The gateway: (request, context?) => Response. upstream: the OpenAI-compatible endpoint's base URL.
 * apiKey: its key, or null to send on the key each caller sends as Authorization: Bearer. token: what
 * callers must send (X-Viable-Token; or Authorization: Bearer when the gateway holds apiKey); without
 * one it answers only this computer, and teacherToken alone opens its teacher's page (as a Basic
 * password), which every visitor through a local proxy could otherwise read. teaching: one activity's settings for every call, or activities:
 * { id: settings }, picked by X-Viable-Activity. reviewerModel turns the check on: a reply fails after
 * rewrites rewrites, and then onUnverified 'fallback' sends the settings' fallback text and 'pass' sends
 * the reply, marked unverified. store ({ get, put, delete, list }) keeps records; keepText puts what the
 * learner and the AI wrote in them. log gets one line per call, never what anyone wrote or who.
 * context.waitUntil, where a cloud has it, keeps a record's write alive after the answer.
 */
export function gatewayHandler({ upstream, apiKey = null, token = null, teacherToken = null, teaching = null, activities = null, reviewerModel = null, rewrites = 2, onUnverified = 'fallback', store = null, keepText = false, maxBodyBytes = 20 * 1024 * 1024, timeoutMs = 300000, fetch = (...args) => globalThis.fetch(...args), log = () => {} } = {}) {
  if (!upstream) throw new Error('Name the model endpoint to stand in front of (upstream).');
  if (!['fallback', 'pass'].includes(onUnverified)) throw new Error('onUnverified is fallback or pass.');
  if (!Number.isInteger(rewrites) || rewrites < 0 || rewrites > 9) throw new Error('rewrites is a whole number from 0 to 9.');
  const base = String(upstream).replace(/\/+$/, '');
  const one = teaching ? activityOf(teaching) : null;
  const many = activities ? new Map(Object.entries(activities).map(([id, doc]) => [id, activityOf(doc)])) : null;
  const tokenHash = token ? sha256(token) : null;
  const teacherHash = teacherToken ? sha256(teacherToken) : null;

  async function allowed(request, path) {
    if (!token) {
      if (path !== '/teacher') return true;
      const password = basicPassword(request);
      return Boolean(teacherHash) && password != null && (await sha256(password)) === (await teacherHash);
    }
    const given = request.headers.get('x-viable-token') ?? (apiKey ? bearerOf(request) : null) ?? basicPassword(request);
    // Comparing hashes, so the time taken says nothing about the token.
    return given != null && (await sha256(given)) === (await tokenHash);
  }

  async function readBody(request) {
    if (!/^application\/json\b/i.test(request.headers.get('content-type') || '')) throw failure(415, 'unsupported_media_type', 'Send JSON, with Content-Type: application/json.');
    const tooLarge = () => failure(413, 'request_too_large', `The request is larger than this gateway's limit of ${maxBodyBytes} bytes.`);
    if (Number(request.headers.get('content-length')) > maxBodyBytes) throw tooLarge();
    const parts = [];
    let size = 0;
    for await (const part of request.body ?? []) {
      size += part.length;
      if (size > maxBodyBytes) throw tooLarge();
      parts.push(part);
    }
    let body;
    try { body = JSON.parse(await new Blob(parts).text()); } catch { throw failure(400, 'invalid_json', 'The request body isn\'t valid JSON.'); }
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw failure(400, 'invalid_json', 'The request body must be a JSON object.');
    return body;
  }

  // Which settings and whom: X-Viable-Activity, X-Viable-Section, and X-Viable-Learner or the request's own user.
  function whoOf(request, body, { needsActivity = true } = {}) {
    const id = request.headers.get('x-viable-activity');
    if (id != null && !PSEUDONYM.test(id)) throw failure(400, 'invalid_activity', 'X-Viable-Activity takes 1 to 128 letters, digits, dots, dashes, underscores or colons.');
    if (many && id != null && !many.has(id)) throw failure(404, 'activity_not_found', `This gateway has no activity "${id}".`);
    if (many && id == null && needsActivity) throw failure(400, 'activity_required', 'This gateway holds several activities: say which with X-Viable-Activity.');
    const named = request.headers.get('x-viable-learner');
    if (named != null && !PSEUDONYM.test(named)) throw failure(400, 'invalid_learner', 'X-Viable-Learner takes a pseudonymous ID: 1 to 128 letters, digits, dots, dashes, underscores or colons, never a name or an email.');
    // An app that never heard of VIABLE may send a name in user: then it names nobody in the records.
    const learner = named ?? (typeof body?.user === 'string' && PSEUDONYM.test(body.user) ? body.user : null);
    return { id, activity: many ? many.get(id) ?? null : one, section: request.headers.get('x-viable-section'), learner };
  }

  const keyOf = (request) => apiKey ?? bearerOf(request);
  const signalOf = (request) => AbortSignal.any([request.signal, AbortSignal.timeout(timeoutMs)].filter(Boolean));

  async function callUpstream(request, path, { method = 'POST', body = null, signal = signalOf(request) } = {}) {
    const key = keyOf(request);
    const headers = { ...(body ? { 'content-type': 'application/json' } : {}), ...(key ? { authorization: `Bearer ${key}` } : {}) };
    for (const name of CALLER_HEADERS) if (request.headers.has(name)) headers[name] = request.headers.get(name);
    try {
      return await fetch(`${base}${path}`, { method, headers, ...(body ? { body: JSON.stringify(body) } : {}), signal });
    } catch (error) {
      if (signal.aborted) throw error;
      log({ at: new Date().toISOString(), code: 'upstream_unreachable', reason: String(error?.message || error).slice(0, 200) });
      throw failure(502, 'upstream_unreachable', 'The model endpoint couldn\'t be reached.');
    }
  }

  const answerHeaders = (answer) => Object.fromEntries([...answer.headers].filter(([name]) => ANSWER_HEADERS.test(name)));

  // Keeps one call: a run's trace, and for a named learner a turn in a record of its own, so two calls
  // at once never overwrite each other. Both are under the learner's ID, so forgetting one is two folders.
  async function keep({ run, at, who, body, turn, reply, first, viable, upstreamMs, usage, checked }) {
    if (!store) return;
    const where = `gateway/${who.id ?? UNNAMED}`;
    const reviewed = checked ? [{
      stepNumber: 2, nodeId: 'vetting', nodeType: 'vetting', status: 'completed', durationMs: viable.added_ms, model: viable.reviewer, tokens: viable.added_tokens.total,
      input: keepText ? { message: turn.message } : {},
      output: {
        outcome: checked.outcome, passed: checked.passed, stop_reason: checked.stop_reason, attempts: checked.rounds.length,
        // A reviewer's reason can quote what was said, so it stays only with the text.
        attempt_details: keepText ? checked.rounds : checked.rounds.map(({ reply: _reply, verification: _verification, feedback: _feedback, ...round }) => round),
        ...(keepText ? { content: checked.reply } : {})
      }
    }] : [];
    await store.put(`${where}/runs/${who.learner ?? UNNAMED}/${run}`, {
      id: run, label: `${at.slice(0, 19).replace('T', ' ')} UTC`, at, agent: body.model ?? null, activity: who.activity?.title ?? who.id ?? null, teaching: who.activity?.teaching ?? null, viable,
      steps: [{ stepNumber: 1, nodeId: 'reply', nodeType: 'llm', status: 'completed', durationMs: upstreamMs, model: body.model ?? null, tokens: usage?.total_tokens ?? null }, ...reviewed],
      output: keepText ? { text: reply } : {}
    });
    if (!who.learner) return;
    await store.put(`${where}/records/${who.learner}/${run}`, {
      user: who.learner, ...(who.id ? { activity: who.id } : {}), ...(who.section ? { learner_group: who.section } : {}), events: [],
      turns: [{
        started_at: at, conversation_id: (await sha256(`${who.learner}\n${turn.first}`)).slice(0, 16), turn_index: turn.index,
        first_output_ms: first, words: wordCount(turn.message), ...(checked ? { vetting: checked.outcome } : {}),
        ...(keepText ? { message: turn.message, reply } : {})
      }]
    });
  }

  // A record that can't be written never costs the learner the reply.
  async function saved(context, work) {
    const saving = work.catch((error) => log({ at: new Date().toISOString(), code: 'record_failed', reason: String(error?.message || error).slice(0, 200) }));
    context.waitUntil?.(saving);
    if (!context.waitUntil) await saving;
  }

  async function runCheck(request, signal, { text, turn, body, who }) {
    const began = Date.now();
    let checked;
    try {
      checked = await checkReply({
        reply: text, message: turn.message, history: turn.history, instructions: turn.instructions, ...who.activity?.check,
        teaching: who.activity?.teaching ?? null, section: who.section, rewrite: rewrites, model: body.model, reviewer: reviewerModel,
        baseUrl: base, apiKey: keyOf(request), fetch: (url, init) => fetch(url, { ...init, signal })
      });
    } catch (error) {
      log({ at: new Date().toISOString(), code: 'check_failed', reason: String(error?.message || error).slice(0, 200) });
      checked = { outcome: 'unverified', passed: false, reply: text, revised: false, stop_reason: 'CHECK_ERROR', rounds: [], reviewer: reviewerModel, usage: NO_TOKENS };
    }
    return { ...checked, ms: Date.now() - began };
  }

  const report = ({ run, outcome, ...fields }) => ({ run, outcome, checked: outcome === 'passed', delivered: 'reply', why: null, rounds: 0, added_ms: 0, added_tokens: NO_TOKENS, reviewer: null, ...fields });
  const reportHeaders = (viable) => ({
    'x-viable-run': viable.run, 'x-viable-outcome': viable.outcome, 'x-viable-delivered': viable.delivered, 'x-viable-rounds': String(viable.rounds),
    'x-viable-added-ms': String(viable.added_ms), 'x-viable-added-tokens': String(viable.added_tokens.total),
    ...(viable.why ? { 'x-viable-why': viable.why } : {}), ...(viable.warning ? { 'x-viable-warning': viable.warning } : {}), ...(viable.reviewer ? { 'x-viable-reviewer': viable.reviewer } : {}), ...(viable.activity ? { 'x-viable-activity': viable.activity } : {})
  });
  const upstreamError = (answer, viable) => new Response(answer.body, { status: answer.status, headers: { ...answerHeaders(answer), ...reportHeaders(viable) } });
  const logCall = (fields) => log({ at: new Date().toISOString(), ...fields });

  // With no check to run, the reply goes straight through, stream or not.
  async function passThrough(request, context, { run, at, started, signal, outgoing, turn, body, who, why }) {
    const viable = report({ run, outcome: 'not_checked', why, activity: who.id, taught: who.taught });
    const answer = await callUpstream(request, '/chat/completions', { body: outgoing, signal });
    const line = { run, status: answer.status, outcome: viable.outcome, why, stream: body.stream === true };
    if (!answer.ok) {
      logCall({ ...line, upstream_ms: Date.now() - started });
      return upstreamError(answer, { ...viable, why: 'upstream_error' });
    }
    if (/event-stream/.test(answer.headers.get('content-type') || '') && answer.body) {
      const stream = watched(answer.body, (seen) => {
        const upstreamMs = Date.now() - started;
        logCall({ ...line, upstream_ms: upstreamMs });
        return saved(context, keep({ run, at, who, body, turn, reply: seen.text, first: seen.firstAt ? seen.firstAt - started : null, viable, upstreamMs, usage: seen.usage }));
      });
      return new Response(stream, { status: 200, headers: { ...answerHeaders(answer), 'cache-control': 'no-cache, no-transform', 'x-accel-buffering': 'no', ...reportHeaders(viable) } });
    }
    const completion = await answer.json().catch(() => null);
    if (!completion) throw failure(502, 'upstream_invalid', 'The model endpoint\'s answer isn\'t JSON.');
    const upstreamMs = Date.now() - started;
    logCall({ ...line, upstream_ms: upstreamMs, tokens: completion.usage?.total_tokens ?? null });
    await saved(context, keep({ run, at, who, body, turn, reply: textOf(completion.choices?.[0]?.message?.content), first: upstreamMs, viable, upstreamMs, usage: completion.usage }));
    return json(200, { ...completion, viable }, { ...answerHeaders(answer), 'content-type': 'application/json', ...reportHeaders(viable) });
  }

  // With checks on: the whole reply first, then the check, and only then an answer, as JSON or as a stream.
  async function held(request, context, { run, at, started, signal, outgoing, turn, body, who }) {
    const plain = Object.fromEntries(Object.entries(outgoing).filter(([name]) => name !== 'stream_options'));
    const answer = await callUpstream(request, '/chat/completions', { body: { ...plain, stream: false }, signal });
    const upstreamMs = Date.now() - started;
    const unchecked = report({ run, outcome: 'not_checked', activity: who.id, taught: who.taught });
    if (!answer.ok) {
      logCall({ run, status: answer.status, outcome: unchecked.outcome, why: 'upstream_error', stream: body.stream === true, upstream_ms: upstreamMs });
      return upstreamError(answer, { ...unchecked, why: 'upstream_error' });
    }
    const completion = await answer.json().catch(() => null);
    const choice = completion?.choices?.[0];
    if (!choice?.message) throw failure(502, 'upstream_invalid', 'The model endpoint\'s answer has no reply in it.');
    const { message } = choice;
    const text = textOf(message.content);
    const calls = Boolean(message.tool_calls?.length || message.function_call);
    let viable;
    let delivered = choice;
    let checked = null;
    if (!text.trim()) {
      // Only text to the learner is checked: a tool call goes back to the app, whose next call brings the text.
      viable = { ...unchecked, why: calls ? 'tool_calls' : 'no_text' };
    } else {
      checked = await runCheck(request, signal, { text, turn, body, who });
      const unverified = checked.outcome === 'unverified' && onUnverified === 'fallback';
      const final = unverified ? (calls ? null : who.activity?.fallback || DEFAULT_FALLBACK) : checked.revised ? checked.reply : text;
      if (final !== text) {
        delivered = { index: 0, message: { role: 'assistant', content: final, ...(message.tool_calls ? { tool_calls: message.tool_calls } : {}), ...(message.function_call ? { function_call: message.function_call } : {}) }, finish_reason: calls ? choice.finish_reason : 'stop', logprobs: null };
      }
      viable = report({
        run, outcome: checked.outcome, activity: who.id, taught: who.taught, why: checked.outcome === 'passed' ? null : checked.stop_reason,
        delivered: final === text ? 'reply' : unverified ? (calls ? 'tool_calls_only' : 'fallback') : 'rewrite',
        rounds: checked.rounds.filter((round) => round.verdict !== 'safety' && round.reply !== null).length, added_ms: checked.ms, added_tokens: checked.usage ?? NO_TOKENS, reviewer: checked.reviewer ?? reviewerModel,
        // The point of the check is a second model: say so when the reply and the review came from one.
        ...((checked.reviewer ?? reviewerModel) === body.model ? { warning: 'same_model' } : {})
      });
    }
    const first = Date.now() - started;
    logCall({ run, status: 200, outcome: viable.outcome, why: viable.why, delivered: viable.delivered, rounds: viable.rounds, stream: body.stream === true, upstream_ms: upstreamMs, added_ms: viable.added_ms, tokens: completion.usage?.total_tokens ?? null, added_tokens: viable.added_tokens.total });
    await saved(context, keep({ run, at, who, body, turn, reply: textOf(delivered.message.content), first, viable, upstreamMs, usage: completion.usage, checked }));
    const headers = { ...answerHeaders(answer), ...reportHeaders(viable) };
    if (body.stream === true) return new Response(asStream(completion, delivered, viable, body.stream_options?.include_usage === true), { status: 200, headers: { ...headers, 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-cache, no-transform' } });
    return json(200, { ...completion, choices: [delivered], viable }, { ...headers, 'content-type': 'application/json' });
  }

  async function completions(request, context) {
    const started = Date.now();
    const at = new Date(started).toISOString();
    const body = await readBody(request);
    if (!Array.isArray(body.messages) || !body.messages.length) throw failure(400, 'invalid_messages', 'messages must be a list with at least one message.');
    const who = whoOf(request, body);
    const taught = who.activity?.teaching ? teachingContext(who.activity.teaching, who.section) : null;
    who.taught = Boolean(taught);
    const structured = ['json_object', 'json_schema'].includes(body.response_format?.type);
    if (reviewerModel && !structured && Number(body.n ?? 1) > 1) throw failure(400, 'unsupported_n', 'With checks on, ask for one reply at a time (n = 1): each reply is held until it passes.');
    const shared = {
      // A run's name sorts by time across a store's kinds of key.
      run: `${at.replace(/[-:.]/g, '')}-${crypto.randomUUID().slice(0, 8)}`,
      at, started, signal: signalOf(request), body, who, turn: turnOf(body.messages),
      outgoing: withoutIdentity({ ...body, messages: withTeaching(body.messages, taught?.text) })
    };
    if (!reviewerModel) return passThrough(request, context, { ...shared, why: 'checks_off' });
    // A reply in a schema is for the app's code, and a rewrite or a fallback would break it.
    if (structured) return passThrough(request, context, { ...shared, why: 'structured_output' });
    return held(request, context, shared);
  }

  async function checkRoute(request) {
    const body = await readBody(request);
    const who = whoOf(request, null, { needsActivity: false });
    const signal = signalOf(request);
    const given = Object.fromEntries(Object.entries({ guideline: body.guideline, reference: body.reference, question: body.question, answerKey: body.answer_key, explanation: body.explanation, instructions: body.instructions }).filter(([, value]) => typeof value === 'string'));
    const said = (Array.isArray(body.history) ? body.history : []).filter((item) => ['user', 'assistant'].includes(item?.role) && typeof item.content === 'string');
    return json(200, await checkReply({
      ...who.activity?.check, ...given, ...(body.key_concepts != null ? { keyConcepts: body.key_concepts } : {}),
      reply: body.reply, message: typeof body.message === 'string' ? body.message : '', history: said,
      teaching: body.teaching ?? who.activity?.teaching ?? null, section: body.section ?? who.section, rewrite: body.rewrite ?? 0,
      model: body.model ?? null, reviewer: body.reviewer ?? reviewerModel,
      baseUrl: base, apiKey: keyOf(request), fetch: (url, init) => fetch(url, { ...init, signal })
    }));
  }

  async function instructionsRoute(request) {
    const body = await readBody(request);
    const who = whoOf(request, null, { needsActivity: false });
    const settings = body.teaching ?? who.activity?.teaching;
    if (!settings) throw failure(400, 'invalid_teaching', 'Give teaching settings as teaching, or name an activity with X-Viable-Activity.');
    const section = body.section ?? who.section;
    const taught = teachingContext(settings, section);
    return json(200, { instructions: taught?.text ?? null, settings: taught?.context ?? null, watch_for: teachingSettings(settings)?.watch_for ?? null, errors: validateDocument(settings, 'teaching').errors });
  }

  async function misconceptionsRoute(request) {
    const body = await readBody(request);
    return json(200, findMisconceptions(String(body.text ?? '').slice(0, 4000)));
  }

  async function teacherPage(url) {
    if (!store) throw failure(404, 'no_records', 'This gateway keeps no records: start it with a store (--data-dir).');
    const page = (html) => new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8', ...TEACHER_PAGE_HEADERS } });
    let activity = url.searchParams.get('activity');
    if (activity && activity !== UNNAMED && !PSEUDONYM.test(activity)) throw failure(400, 'invalid_activity', 'That isn\'t an activity\'s ID.');
    if (!activity) {
      const ids = await recordedActivities(store);
      if (ids.length > 1) return page(activitiesPage(ids, (id) => many?.get(id)?.title));
      [activity] = ids;
    }
    const inputs = await readRecords(store, activity);
    return page(teacherView({ ...inputs, suggestions: suggestChanges(inputs) }));
  }

  return async (request, context = {}) => {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';
    const route = `${request.method} ${path}`;
    try {
      const refusal = token ? null : refusedWithoutToken(request, url, context);
      if (refusal) return json(403, errorBody(403, 'local_only', refusal));
      if (route === 'GET /health') return json(200, { status: 'ok', checks: Boolean(reviewerModel), records: Boolean(store) });
      if (!(await allowed(request, path))) {
        const message = token ? 'Missing or wrong token: send X-Viable-Token.' : 'The teacher\'s page needs the password this gateway printed when it started, with any user name.';
        return json(401, errorBody(401, 'invalid_token', message), { 'www-authenticate': path === '/teacher' ? 'Basic realm="viable-harness"' : 'Bearer realm="viable-harness"' });
      }
      if (route === 'POST /v1/chat/completions') return await completions(request, context);
      if (route === 'GET /v1/models' || (request.method === 'GET' && /^\/v1\/models\/[^/]+$/.test(path))) {
        const answer = await callUpstream(request, path.slice(3), { method: 'GET' });
        return new Response(answer.body, { status: answer.status, headers: answerHeaders(answer) });
      }
      if (route === 'POST /v1/embeddings') {
        const answer = await callUpstream(request, '/embeddings', { body: withoutIdentity(await readBody(request)) });
        return new Response(answer.body, { status: answer.status, headers: answerHeaders(answer) });
      }
      if (route === 'POST /v1/check') return await checkRoute(request);
      if (route === 'POST /v1/teaching/instructions') return await instructionsRoute(request);
      if (route === 'POST /v1/misconceptions') return await misconceptionsRoute(request);
      if (route === 'GET /teacher') return await teacherPage(url);
      if (path === '/v1/responses') throw failure(404, 'unsupported_endpoint', 'The gateway checks /v1/chat/completions only, so it doesn\'t pass /v1/responses on unchecked. Point your client at chat completions.');
      throw failure(404, 'not_found', `No route ${route}. The gateway answers POST /v1/chat/completions, GET /v1/models and POST /v1/embeddings, and POST /v1/check, /v1/teaching/instructions and /v1/misconceptions.`);
    } catch (error) {
      if (request.signal?.aborted) return new Response(null, { status: 499 });
      if (error?.name === 'TimeoutError') return json(504, errorBody(504, 'upstream_timeout', `The call took longer than ${timeoutMs / 1000} seconds, this gateway's limit.`));
      if (error?.status >= 400 && error.status < 600) return json(error.status, errorBody(error.status, error.code || 'gateway_error', error.message));
      log({ at: new Date().toISOString(), code: 'gateway_failed', reason: String(error?.message || error).slice(0, 200) });
      return json(500, errorBody(500, 'gateway_failed', 'The gateway failed to answer.'));
    }
  };
}
