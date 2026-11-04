/**
 * Agent files and course packages answered over HTTP the way VIABLE's hosted platform answers an app's
 * agent runs (POST /v1/agents/{slug}/runs, reading a run back), as one function from a web-standard
 * Request to a Response, so that any host can serve it: a Worker as it is, node:http through
 * node.js, a function through its adapter. The request fields, results and errors are VIABLE's
 * where the behaviour is the same;
 * docs/self-hosting.md lists the rest. No Node built-ins.
 */
import { deliverOutput, requestedSourceStyle } from '../agents/citations.js';
import PACKAGE from '../../../package.json' with { type: 'json' };
import { isLocalName, refusedWithoutToken } from '../../../harness/src/net/local.js';
import { agentsFrom } from './library.js';
import { checkLearner } from './memory.js';
import { graphOf } from './runtime.js';

const VERSION = PACKAGE.version;

// What VIABLE composes from a course activity (what the learner has open, the teacher's instructions)
// never comes from a caller's context.
const SERVER_CONTEXT = ['teaching_view', 'workspace_view', 'workspace_place', 'workspace_reach'];
// Without a store, runs are kept in memory, the newest 500, until the process stops.
const KEPT_RUNS = 500;
const KEEP_ALIVE_MS = 15000;
// As VIABLE loads them: the latest 100 messages, or up to 400 for an agent that
// summarizes. A conversation keeps its newest 400.
const HISTORY = { recent: 100, summarizing: 400 };
const CONVERSATION_ID = /^agtc_[0-9a-f]{32}$/;
const LIBRARY_LOOK_MS = 3000;
const WRONG_TOKENS = 30;
// What one kept record may take, under what the stores hold (a Firestore document's 1 MiB, a D1 row's 2 MB).
const RECORD_BYTES = 900 * 1024;
const bytesOf = (value) => new TextEncoder().encode(JSON.stringify(value)).length;
const INPUT_REQUIRED = "Field 'input' is required and must be a non-empty string, content part array, or OpenAI-style user message array.";

const failure = (status, code, message) => Object.assign(new Error(message), { status, code });
const invalid = (message, code = 'invalid_request_structure') => failure(400, code, message);

// One of VIABLE's opaque request labels (user, learner_group): at most 128 characters, no control characters.
function label(value, field) {
  if (value == null || value === '') return null;
  if (typeof value !== 'string' || !value.trim() || value.length > 128 || /[\u0000-\u001f]/.test(value)) throw invalid(`${field} must be a string of at most 128 characters without control characters.`);
  return value.trim();
}

// A message's text: a string, or text parts. VIABLE's runs also take pictures and files; this server doesn't.
function textOf(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content) || !content.length) throw invalid(INPUT_REQUIRED);
  return content.map((part) => {
    if (part?.type !== 'text' && part?.type !== 'input_text') throw invalid(`This server takes text only: a ${String(part?.type || 'content').slice(0, 40)} part needs VIABLE's hosted platform.`, 'unsupported_input');
    if (typeof part.text !== 'string') throw invalid('Text content parts must include a string text field.');
    return part.text.trim();
  }).filter(Boolean).join('\n\n');
}

function messageOf(item) {
  if (!item || !['system', 'developer', 'user', 'assistant'].includes(item.role) || item.tool_calls || item.function_call || !('content' in item)) {
    throw invalid('Supported message roles: system, developer, user, assistant. Tool calls are not supported by this agent interface.');
  }
  return { role: item.role, content: textOf(item.content) };
}

function contextOf(value) {
  if (value == null) return null;
  if (typeof value !== 'object' || Array.isArray(value)) throw invalid('context must be a JSON object.');
  const visit = (item, depth) => {
    if (depth > 16) throw invalid('context exceeds the maximum nesting depth.');
    if (item && typeof item === 'object') {
      for (const [key, child] of Object.entries(item)) {
        if (['__proto__', 'prototype', 'constructor'].includes(key)) throw invalid('context contains a reserved key.');
        visit(child, depth + 1);
      }
    }
  };
  visit(value, 0);
  if (new TextEncoder().encode(JSON.stringify(value)).length > 128 * 1024) throw failure(413, 'agent_input_too_large', 'context exceeds 128 KiB.');
  const context = { ...value };
  for (const key of SERVER_CONTEXT) delete context[key];
  return context;
}

/**
 * A run request's turn, with VIABLE's field names and checks, in text: { text, history, context, user,
 * sources, trace, stream, mode, conversationId }. Messages before the last are the history (as VIABLE
 * seeds a new conversation, or keeps client history). A server that keeps conversations takes
 * conversation_id; without them it is refused.
 */
export function readTurn(body, { conversations = false } = {}) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw invalid('Agent request body must be a JSON object.');
  const mode = body.history_mode ?? 'server';
  if (!['server', 'client', 'none'].includes(mode)) throw invalid('history_mode must be server, client, or none.');
  if (body.conversation_id != null && !conversations) throw invalid('This server keeps no conversations: send the earlier messages in messages, with history_mode "client", instead of conversation_id.', 'unsupported_agent_parameter');
  if (body.conversation_id != null && mode !== 'server') throw invalid('conversation_id requires server-owned history.');
  if (body.conversation_id != null && Array.isArray(body.messages) && body.messages.length > 1) throw invalid('Use history_mode client for a full messages transcript.');
  if (mode === 'client' && (body.input != null || body.message != null)) throw invalid('Client history uses messages, not input or message.');
  let raw = body.input ?? body.message;
  let history = [];
  if (raw == null) {
    if (!Array.isArray(body.messages) || !body.messages.length || body.messages.length > 400) throw invalid(Array.isArray(body.messages) ? 'messages must contain between 1 and 400 messages.' : INPUT_REQUIRED);
    if (mode === 'none' && body.messages.length > 1) throw invalid('Use history_mode client for a full messages transcript.');
    const messages = body.messages.map(messageOf);
    if (messages.at(-1).role !== 'user') throw invalid('The final message must be a user message.');
    history = messages.slice(0, -1);
    raw = messages.at(-1).content;
  } else if (Array.isArray(raw) && raw.length && raw.every((item) => typeof item?.role === 'string')) {
    // The message array form: its last user message is the turn.
    raw = [...raw].reverse().find((item) => item.role === 'user');
    if (!raw) throw invalid('Agent input message arrays must include at least one user message.');
    raw = raw.content;
  } else if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    if (raw.role !== 'user') throw invalid('A single Agent input message must use role "user".');
    raw = raw.content;
  }
  const text = textOf(raw);
  if (!text.trim()) throw invalid(INPUT_REQUIRED);
  const user = label(body.user, 'user');
  if (body.learner_group != null && (!label(body.learner_group, 'learner_group') || !user)) throw invalid('learner_group requires a nonblank label and user; each must be at most 128 characters.');
  if (body.include != null && (!Array.isArray(body.include) || body.include.some((item) => item !== 'trace'))) throw invalid('include must be a list whose only allowed value is "trace".', 'invalid_include');
  return { text, history, context: contextOf(body.context), user, sources: requestedSourceStyle(body.sources), trace: body.include?.includes('trace') === true, stream: body.stream === true, mode, conversationId: body.conversation_id ?? null };
}

/** What an app sees of a run (VIABLE's AgentRunTrace): its time, each step, and each VETTING review round by round. */
export function runTrace(steps, startedAt, completedAt) {
  return {
    started_at: startedAt,
    completed_at: completedAt,
    duration_ms: Date.parse(completedAt) - Date.parse(startedAt),
    steps: steps.map((step) => ({ step_number: step.stepNumber, node_id: step.nodeId, node_type: step.nodeType, status: step.status, duration_ms: step.durationMs, model: step.model, tokens: step.tokens, cost: step.cost, error: step.error })),
    vetting: steps.filter((step) => step.nodeType === 'vetting' && step.output && typeof step.output === 'object').map((step) => ({
      step_number: step.stepNumber,
      node_id: step.nodeId,
      outcome: step.output.outcome ?? null,
      stop_reason: step.output.stop_reason ?? null,
      attempts: step.output.attempts ?? null,
      rounds: (step.output.attempt_details || []).map((round) => ({ attempt: round.attempt ?? null, source: round.source ?? 'generated', verdict: round.verdict ?? null, feedback: round.feedback ?? null, reply: round.reply ?? null }))
    }))
  };
}

// An error as VIABLE's agent routes answer it (agentErrorResponse): status, code and type.
function answerFor(error, timeoutMs) {
  if (timeoutMs) return { status: 504, code: 'provider_timeout', message: `The run took longer than ${timeoutMs / 1000} seconds, this server's limit.` };
  // Your own endpoint's answer, so its reason is passed on; its status isn't this request's.
  if (/provider_error$/.test(error?.code || '')) return { status: error.status === 429 ? 429 : 502, code: error.code, message: error.message };
  if (error?.status >= 400 && error.status < 500) return { status: error.status, code: error.code || 'agent_request_error', message: error.message };
  if (error?.code === 'provider_timeout') return { status: 504, code: error.code, message: error.message };
  return { status: 500, code: 'agent_run_failed', message: 'The agent run failed. Try again shortly.', unexpected: true };
}
const typeOf = (status) => (status === 404 ? 'not_found_error' : status === 403 ? 'permission_error' : status === 429 ? 'requests_error' : status >= 500 ? 'provider_error' : 'invalid_request_error');

// The request's body, at most limit bytes, whatever Content-Length says.
async function readBody(request, limit) {
  const tooLarge = () => failure(413, 'agent_input_too_large', `Agent request body exceeds the ${limit}-byte limit.`);
  if (Number(request.headers.get('content-length')) > limit) throw tooLarge();
  if (!request.body) return new Uint8Array();
  const reader = request.body.getReader();
  const chunks = [];
  let size = 0;
  for (let next = await reader.read(); !next.done; next = await reader.read()) {
    size += next.value.length;
    if (size > limit) {
      await reader.cancel();
      throw tooLarge();
    }
    chunks.push(next.value);
  }
  return new Uint8Array(await new Blob(chunks).arrayBuffer());
}

// Which packages are served, as their downloads say: a new version on VIABLE is a new download.
const packagesServed = (agents) => [...new Map(agents.map((agent) => [agent.doc, agent])).values()].map(({ doc, file }) => ({ file: file ?? null, format: doc?.format ?? null, title: doc?.title ?? doc?.course?.title ?? doc?.name ?? null, exported_at: doc?.exported_at ?? null }));

// A long conversation keeps its newest messages; count still says how many it has had.
function fitConversation(held) {
  const fitted = { ...held, messages: [...held.messages] };
  while (fitted.messages.length > 2 && bytesOf(fitted) > RECORD_BYTES) fitted.messages.splice(0, 2);
  return fitted;
}

// Pictures and audio from a host with no disk are data: URLs, and too large to keep.
const withoutDataUrls = (attachments = []) => attachments.map((item) => (typeof item?.url === 'string' && item.url.startsWith('data:') ? { ...item, url: null, not_kept: true } : item));

const PENDING_TURNS = 4;
const waitAtMost = async (promise, ms) => {
  let timer;
  await Promise.race([promise, new Promise((resolve) => { timer = setTimeout(resolve, ms); })]);
  clearTimeout(timer);
};

async function digest(text) {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
}

/**
 * The server as (request, context?) => Response; context is { address, waitUntil }, what the host knows
 * of the caller and of work that outlives the answer. agents: agentsToServe's. runtime: run(agent,
 * turn, { hooks, timed }) and memory (server/runtime.js's createRuntime, or serve.js's on a disk).
 * store (store.js): with one, runs last across processes and the runs route keeps conversations, as
 * VIABLE does (conversation_id); without one the server is stateless and runs stay in memory. routes:
 * modules tried in order before the built-in ones (and before the token: each does its own checks),
 * each (ctx) => async (request, url, context) => Response | null (with an optional sweep(expired), called
 * with the server's), where ctx is { served, runTurn, runInConversation, store, options, log, json, fail,
 * readBody, readJson, authorized }; request.signal aborts when the caller leaves, on a host that can tell (node.js's
 * adapter, a Worker with enable_request_signal). options: token (Authorization: Bearer), cors
 * (the one browser origin allowed to call it), maxBodyBytes per request, timeoutMs per run (its
 * endpoint calls are cut off then), maxRuns at once (per process), keepDays (how long a store keeps a
 * conversation, a run and, through the routes' own sweep, what a learner wrote; null keeps them until someone deletes them), info (what GET /v1/server adds),
 * features (what GET /v1/server says is on and off: settings.js's featuresOf, asked each time),
 * log (one JSON line per run, with its timing and outcome, never what the learner wrote). The function
 * returned also has sweep(), which deletes from the store what keepDays has passed. requireToken:
 * refuse agent calls until a token is set, for a host that is always public. With neither, it answers
 * only this computer (local.js).
 */
export function createHandler({ agents, runtime, store = null, options = {}, routes = [], library = null, documents = null, prepare = (agent) => agent }) {
  const { token = null, cors = null, maxBodyBytes = 1024 * 1024, timeoutMs = 300000, maxRuns = 30, keepDays = null, requireToken = false, info = {}, features = null, onlyLocalNames = false, log = (line) => console.log(JSON.stringify(line)) } = options;
  const served = new Map(agents.map((agent) => [agent.slug, agent]));
  const kept = new Map();
  const expired = (at) => keepDays != null && Date.now() - Date.parse(at) > keepDays * 86400000;
  const runsKept = {
    async get(id) {
      const run = store ? await store.get(`runs/${id}`) : kept.get(id) ?? null;
      return run && expired(run.completed_at) ? null : run;
    },
    async put(id, run) {
      if (store) return store.put(`runs/${id}`, run);
      kept.set(id, run);
      if (kept.size > KEPT_RUNS) kept.delete(kept.keys().next().value);
    }
  };
  const expected = token ? digest(token) : null;
  let running = 0;

  const corsHeaders = cors ? { 'access-control-allow-origin': cors, vary: 'Origin' } : {};
  const meta = (agent) => ({ object: 'agent', slug: agent.slug, name: agent.name, description: agent.description, published_version: null });
  const json = (status, body, headers = {}) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });
  const fail = (status, code, message, { type = typeOf(status), headers = {}, requestId } = {}) => json(status, { error: { message, type, code, ...(requestId ? { request_id: requestId } : {}) } }, headers);

  const callerLeft = () => failure(499, 'client_closed_request', 'The caller left before the run finished, so it was stopped.');
  const busy = () => Object.assign(failure(429, 'rate_limit_exceeded', `${maxRuns} runs are running, this server's limit. Retry shortly.`), { headers: { 'retry-after': '1' } });

  /**
   * A turn on the runtime, within this server's limits: maxRuns at once, timeoutMs each. turn.signal
   * (usually request.signal) stops it when the caller has gone: every model call is cut off, and none
   * more is made. A route that wants a turn to finish whoever is waiting leaves it out.
   */
  async function runTurn(agent, turn, hooks = {}) {
    if (running >= maxRuns) throw busy();
    running += 1;
    const timeout = AbortSignal.timeout(timeoutMs);
    const signal = turn.signal ? AbortSignal.any([turn.signal, timeout]) : timeout;
    const timed = (base) => (url, init = {}) => base(url, { ...init, signal: init.signal ? AbortSignal.any([init.signal, signal]) : signal });
    try {
      const result = await runtime.run(agent, turn, { hooks, timed });
      // A step may go on past a call that was cut off (a review with no answer), so this ends it either way.
      if (turn.signal?.aborted) throw callerLeft();
      return result;
    } catch (error) {
      if (turn.signal?.aborted) throw callerLeft();
      throw timeout.aborted ? Object.assign(error, { timedOut: true }) : error;
    } finally {
      running -= 1;
    }
  }

  async function readJson(request, limit = maxBodyBytes) {
    // Only what a page can't send to another site without asking first.
    if (!/^application\/json\b/i.test(request.headers.get('content-type') || '')) throw failure(415, 'unsupported_media_type', 'Send JSON, with Content-Type: application/json.');
    try { return JSON.parse(new TextDecoder().decode(await readBody(request, limit))); } catch (error) {
      throw error.status ? error : failure(400, 'invalid_json', 'Invalid request body: JSON parsing failed');
    }
  }

  /** Whether a request may run agents: no token set, or the right one (compared by hash, in constant time). */
  async function authorized(request) {
    if (!expected) return true;
    const given = /^Bearer\s+(.+)$/i.exec(request.headers.get('authorization') || '')?.[1];
    if (!given) return false;
    const [have, want] = await Promise.all([digest(given), expected]);
    return have.reduce((difference, byte, index) => difference | (byte ^ want[index]), 0) === 0;
  }

  // A kept conversation of this agent, or null: one of another agent, or past keepDays, isn't there.
  async function loadConversation(id, agent, keep = store) {
    if (!CONVERSATION_ID.test(id)) return null;
    const found = await keep.get(`conversations/${id}`);
    return found?.agent === agent.slug && !expired(found.updated_at) ? found : null;
  }
  const noConversation = () => failure(404, 'agent_conversation_not_found', 'Conversation not found for this agent.');

  // One turn at a time in a conversation, on this process: the next reads what the last one saved. As
  // on the platform a few may wait, and each ahead ends within timeoutMs, so that is what waiting for them
  // can take. A turn lost with its host (a Worker's request cancelled) never ends, so it has a limit.
  const turns = new Map();
  const oneAtATime = (id, work) => {
    const line = turns.get(id) ?? { pending: 0, last: null };
    if (line.pending >= PENDING_TURNS) throw Object.assign(failure(429, 'conversation_busy', 'Too many turns are waiting in this conversation. Retry shortly.'), { headers: { 'retry-after': '2' } });
    line.pending += 1;
    turns.set(id, line);
    const next = waitAtMost(line.last, timeoutMs * line.pending).then(work);
    line.last = next.catch(() => {}).then(() => {
      line.pending -= 1;
      if (!line.pending) turns.delete(id);
    });
    return next;
  };

  /**
   * A turn in its conversation: what it remembers goes to the run, and the exchange and what changed
   * are saved after it. Saved only once the run succeeds, so a failed first message leaves nothing.
   * { result, conversationId }, with no conversation for a turn that isn't the server's to keep.
   */
  async function runInConversation(agent, turn, hooks, keep = store) {
    if (!keep || turn.mode !== 'server') return { result: await runTurn(agent, turn, hooks), conversationId: null };
    const id = turn.conversationId ?? `agtc_${crypto.randomUUID().replaceAll('-', '')}`;
    return oneAtATime(id, async () => {
      const at = new Date().toISOString();
      const held = turn.conversationId ? await loadConversation(id, agent, keep) : { id, agent: agent.slug, created_at: at, updated_at: at, count: turn.history.length, messages: turn.history };
      if (!held) throw noConversation();
      const summarizes = graphOf(agent).nodes.some((node) => node.type === 'input' && node.config?.history === 'summarize');
      const history = held.messages.slice(-(summarizes ? HISTORY.summarizing : HISTORY.recent));
      const result = await runTurn(agent, { ...turn, history, conversation: { state: held.state, resume: held.resume, historySummary: held.history_summary, historyStart: held.count - history.length } }, hooks);
      // A reply already written reaches the learner even if keeping it fails.
      await keep.put(`conversations/${id}`, fitConversation({
        ...held, updated_at: new Date().toISOString(), count: held.count + 2,
        // What a spoken message said, and a note of what was attached: the bytes aren't kept.
        messages: [...held.messages, { role: 'user', content: [turn.text || result.transcript?.text, turn.note].filter(Boolean).join('\n') }, { role: 'assistant', content: result.archivedOutput?.text ?? result.output.text ?? '' }].slice(-HISTORY.summarizing),
        ...(result.state ? { state: result.state } : {}), ...(result.historySummary ? { history_summary: result.historySummary } : {}), resume: result.resume ?? null, user: turn.user ?? held.user ?? null
      })).catch((error) => console.error(`Couldn't keep conversation ${id}: ${error.message}`));
      return { result, conversationId: id };
    });
  }

  // The answer a turn gets, its log line written.
  async function answerTurn(agent, turn, requestId, started, hooks) {
    const line = { request_id: requestId, agent: agent.slug, run_id: null };
    let answer;
    let result = null;
    try {
      const runId = `agtr_${crypto.randomUUID().replaceAll('-', '')}`;
      const startedAt = new Date().toISOString();
      const ran = await runInConversation(agent, turn, hooks);
      result = ran.result;
      const conversationId = ran.conversationId;
      const completedAt = new Date().toISOString();
      const trace = runTrace(result.steps, startedAt, completedAt);
      await runsKept.put(runId, { object: 'agent.run', id: runId, agent: agent.slug, conversation_id: conversationId, ...(turn.user ? { user: turn.user } : {}), status: 'completed', started_at: startedAt, completed_at: completedAt, duration_ms: trace.duration_ms, output: { text: result.output.text ?? '', attachments: store ? withoutDataUrls(result.output.attachments) : result.output.attachments || [], data: result.output.data ?? null }, usage: { total: result.usage.total }, cost: result.cost, trace }).catch((error) => console.error(`Couldn't keep run ${runId}: ${error.message}`));
      line.run_id = runId;
      answer = { status: 200, body: { object: 'agent.run.result', agent: agent.slug, conversation_id: conversationId, run_id: runId, output: deliverOutput(result.output, turn.sources || 'none'), usage: result.usage, cost: result.cost, input_assets: [], ...(turn.trace ? { trace } : {}) } };
    } catch (error) {
      answer = errorAnswer(error, requestId);
    }
    log({ at: new Date().toISOString(), ...line, status: answer.status, ...(answer.body.error ? { code: answer.body.error.code } : {}), duration_ms: Date.now() - started, ...(result ? { model_calls: result.modelCalls, tokens: result.usage.total } : {}), stream: turn?.stream === true });
    return answer;
  }

  function errorAnswer(error, requestId) {
    const found = answerFor(error, error.timedOut ? timeoutMs : null);
    if (found.unexpected) console.error(error);
    return { status: found.status, headers: error.headers, body: { error: { message: found.message, type: typeOf(found.status), code: found.code, request_id: requestId } } };
  }

  // The turn as server-sent events: the answer's first bytes leave before the run starts.
  function streamTurn(agent, turn, requestId, started, context) {
    const encoder = new TextEncoder();
    let open = true;
    const body = new ReadableStream({
      start(controller) {
        const write = (text) => { if (open) controller.enqueue(encoder.encode(text)); };
        const sse = (name, data) => write(`event: ${name}\ndata: ${JSON.stringify(data)}\n\n`);
        sse('run.started', { object: 'agent.run.started', agent: agent.slug });
        const keepAlive = setInterval(() => write(': keep-alive\n\n'), KEEP_ALIVE_MS);
        const finished = answerTurn(agent, turn, requestId, started, { onAnswer: (text) => sse('run.delta', { text }) }).then((answer) => {
          sse(answer.status === 200 ? 'run.completed' : 'run.failed', answer.status === 200 ? answer.body : { status: answer.status, ...answer.body });
        }).finally(() => {
          clearInterval(keepAlive);
          if (open) controller.close();
          open = false;
        });
        // A run that stops for a reader who leaves does so through request.signal, where the host says
        // so; a host that ends work with the answer is asked to wait until the rest is done and logged.
        context.waitUntil?.(finished);
      },
      cancel() { open = false; }
    });
    return new Response(body, { headers: { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-cache, no-transform', 'x-accel-buffering': 'no' } });
  }

  async function postRun(request, agent, requestId, context) {
    const started = Date.now();
    let turn = null;
    try {
      turn = readTurn(await readJson(request), { conversations: Boolean(store) });
      // A turn in a conversation the caller knows finishes and is kept, as on the platform: its reply is
      // waiting there when they come back. One nobody could find again stops when its caller leaves.
      if (!(store && turn.mode === 'server' && turn.conversationId)) turn.signal = request.signal;
      if (runtime.memory && turn.user) checkLearner(turn.user);
      if (turn.conversationId && !await loadConversation(turn.conversationId, agent)) throw noConversation();
      if (running >= maxRuns) throw busy();
    } catch (error) {
      const answer = errorAnswer(error, requestId);
      log({ at: new Date().toISOString(), request_id: requestId, agent: agent.slug, run_id: null, status: answer.status, code: answer.body.error.code, duration_ms: Date.now() - started, stream: turn?.stream === true });
      return json(answer.status, answer.body, answer.headers);
    }
    if (turn.stream) return streamTurn(agent, turn, requestId, started, context);
    const answering = answerTurn(agent, turn, requestId, started, {});
    context.waitUntil?.(answering);
    const answer = await answering;
    return json(answer.status, answer.body, answer.headers);
  }

  async function answerRequest(request, url, requestId, context) {
    const path = url.pathname;
    const scoped = { ...context, requestId };
    for (const route of modules) {
      const answered = await route(request, url, scoped);
      if (answered) return answered;
    }
    if (cors && request.method === 'OPTIONS') return new Response(null, { status: 204, headers: { 'access-control-allow-methods': 'GET, POST', 'access-control-allow-headers': 'authorization, content-type, idempotency-key, x-platform-id, x-platform-name', 'access-control-max-age': '600' } });
    if (request.method === 'GET' && path === '/health') return json(200, { status: 'ok', agents: served.size });
    if (requireToken && !token) return fail(503, 'token_not_set', 'This server has no token set, so it refuses to run agents. Set VIABLE_ENGINE_TOKEN where it runs, then call it with Authorization: Bearer <token>.', { requestId });
    if (!await authorized(request)) {
      const given = /^Bearer\s+.+$/i.test(request.headers.get('authorization') || '');
      return fail(401, 'invalid_api_key', given ? 'Invalid token.' : 'Missing token: send Authorization: Bearer <token>.', { type: 'authentication_error', headers: { 'www-authenticate': 'Bearer realm="viable-harness"' }, requestId });
    }
    const notFound = () => fail(404, 'not_found', `No route ${request.method} ${path}.`, { requestId });
    const route = /^\/v1\/agents(?:\/([^/]+)(\/runs(?:\/([^/]+))?)?)?\/?$/.exec(path);
    if (path === '/v1/server' && request.method === 'GET') return json(200, { object: 'server', harness_version: VERSION, agents: served.size, conversations: Boolean(store), keep_days: keepDays, packages: packagesServed(agents), ...info, ...(features ? { features: await features() } : {}) });
    if (!route) return notFound();
    // Slugs and run IDs are plain letters, digits, dots, dashes and underscores: nothing to decode.
    const [, slug, runsPath, runId] = route;
    if (!slug) return request.method === 'GET' ? json(200, { object: 'list', data: [...served.values()].map(meta) }) : notFound();
    const agent = served.get(slug);
    if (!agent) return fail(404, 'agent_not_found', 'Agent not found.', { requestId });
    if (request.method === 'GET' && !runsPath) return json(200, meta(agent));
    if (request.method === 'POST' && runsPath && !runId) return postRun(request, agent, requestId, context);
    if (request.method === 'GET' && runId) {
      const run = await runsKept.get(runId);
      return run?.agent === slug ? json(200, run, { 'cache-control': 'no-store' }) : fail(404, 'run_not_found', 'Agent run not found.', { requestId });
    }
    return notFound();
  }

  const whenServedChanges = [];
  const ctx = { served, documents, onServedChange: (listener) => whenServedChanges.push(listener), runTurn, runInConversation, store, options, log, json, fail, readBody, readJson, authorized };
  const modules = routes.map((route) => route(ctx));

  // What is served follows the library, on any instance of this server: looked at every few seconds, and at once after a change here.
  let revision = null;
  let lookedAt = library ? Date.now() : 0;
  let looking = null;
  library?.onChange(() => { lookedAt = 0; });
  const lookAtLibrary = () => {
    if (!library || looking === null && Date.now() - lookedAt < LIBRARY_LOOK_MS) return looking;
    lookedAt = Date.now();
    looking ??= (async () => {
      const now = await library.revision();
      if (now === revision) return;
      const next = agentsFrom(await library.documents());
      served.clear();
      for (const agent of next.agents) served.set(agent.slug, prepare(agent));
      ctx.documents = next.documents;
      for (const listener of whenServedChanges) listener();
      revision = now;
    })().catch((error) => console.error(error)).finally(() => { looking = null; });
    return looking;
  };

  async function sweep() {
    if (!store || keepDays == null) return { deleted: 0 };
    let deleted = 0;
    for (const prefix of ['conversations/', 'runs/']) {
      for (const key of await store.list(prefix)) {
        const item = await store.get(key);
        if (!item || !expired(item.updated_at ?? item.completed_at)) continue;
        await store.delete(key);
        deleted += 1;
      }
    }
    for (const module of modules) deleted += (await module.sweep?.(expired)) || 0;
    return { deleted };
  }

  // Wrong tokens from one address, counted: a token tried by the thousand is refused as the sign-in form refuses it.
  const wrongTokens = new Map();
  const refusedForTokens = async (request, address) => {
    if (!expected || !/^Bearer\s/i.test(request.headers.get('authorization') || '')) return false;
    const key = address || 'unknown';
    const at = Date.now();
    if (wrongTokens.size > 10000) wrongTokens.clear();
    const held = wrongTokens.get(key);
    const counted = held && held.reset > at ? held : { count: 0, reset: at + 60000 };
    if (counted.count >= WRONG_TOKENS) return true;
    if (!await authorized(request)) { counted.count += 1; wrongTokens.set(key, counted); }
    return false;
  };

  return Object.assign(async function handle(request, context = {}) {
    const requestId = crypto.randomUUID();
    let response;
    try {
      const url = new URL(request.url);
      // A site can point its own name at this computer (DNS rebinding), so a server meant only for here answers only to this computer's names.
      if (onlyLocalNames && !isLocalName(url.hostname)) return fail(403, 'not_this_name', 'This server answers only at this computer’s own address. To reach it by another name, start it with --host 0.0.0.0, or give it a token with --token-env.', { requestId });
      if (await refusedForTokens(request, context.address)) return fail(429, 'too_many_wrong_tokens', 'Too many wrong tokens. Wait a minute and try again.', { requestId, headers: { 'retry-after': '60' } });
      await lookAtLibrary();
      // No token: this computer only, on every route. A public host's server (requireToken) stays shut another way.
      const refusal = !token && !requireToken ? refusedWithoutToken(request, url, context, cors) : null;
      response = refusal ? fail(403, 'local_only', refusal, { requestId }) : await answerRequest(request, url, requestId, context);
    } catch (error) {
      console.error(error);
      response = fail(500, 'server_error', 'The server failed to answer.', { requestId });
    }
    const headers = new Headers(response.headers);
    if (!headers.has('x-request-id')) headers.set('x-request-id', requestId);
    for (const [name, value] of Object.entries(corsHeaders)) if (!headers.has(name)) headers.set(name, value);
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  }, { sweep });
}
