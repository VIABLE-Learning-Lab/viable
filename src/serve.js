/**
 * viable-harness serve: agent files and course packages answered over HTTP the way VIABLE's hosted
 * platform answers an app's agent runs (POST /v1/agents/{slug}/runs, reading a run back), on your own
 * machine and model keys. The request fields, results and errors are VIABLE's (src/routes/agents.js and
 * src/utils/agentInput.js in its API) where the behaviour is the same; docs/self-hosting.md lists the
 * rest. Local-only: node:http, no dependency.
 */
import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import { readdir, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { basename, join } from 'node:path';
import { deliverOutput, requestedSourceStyle } from './agents/citations.js';
import { linkKnowledgeRefs, validateGraph } from './agents/graph.js';
import { knowledgeFolders, packageKnowledge, readsLocally } from './knowledge.js';
import { checkLearner, memoryFiles } from './memory.js';
import { pickAgent, readAgentFile, runAgent } from './run.js';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);
// What VIABLE composes from a course activity (what the learner has open, the teacher's instructions)
// never comes from a caller's context.
const SERVER_CONTEXT = ['teaching_view', 'workspace_view', 'workspace_place', 'workspace_reach'];
// shortcut: runs are kept in memory, the newest 500, until the server stops; keep them in a database if apps must read runs back after a restart.
const KEPT_RUNS = 500;
const KEEP_ALIVE_MS = 15000;
const INPUT_REQUIRED = "Field 'input' is required and must be a non-empty string, content part array, or OpenAI-style user message array.";

const failure = (status, code, message) => Object.assign(new Error(message), { status, code });
const invalid = (message, code = 'invalid_request_structure') => failure(400, code, message);
const isPackage = (doc) => doc?.format === 'viable.course-package';
const graphOf = (agent) => {
  const { graph } = pickAgent(agent.doc, agent.ref);
  return isPackage(agent.doc) ? linkKnowledgeRefs(graph, (ref) => ref) : graph;
};
const knowledgeIds = (graph) => [...new Set(graph.nodes.flatMap((node) => [node.type === 'knowledge' ? node.config?.knowledge_bases : null, node.config?.tools?.knowledge_bases]).filter(Array.isArray).flat())];

/**
 * The agents to serve from agent files, course packages (.json or .viable.zip) and folders of them:
 * { agents: [{ slug, ref, name, description, doc, dir, zip, file }], skipped }, skipped being a
 * folder's files that hold no agent. An agent file answers at its file's name (VIABLE exports it as
 * <slug>.agent.json), a package's agents at their slugs from VIABLE (else their refs). Each graph is checked now, and two agents
 * with one slug are an error, so a server never starts with an agent it can't run.
 */
export async function loadAgents(paths) {
  const agents = [];
  const skipped = [];
  for (const path of paths) {
    const inFolder = (await stat(path)).isDirectory();
    const files = inFolder ? (await readdir(path)).filter((name) => /\.(json|zip)$/i.test(name) && !name.startsWith('.')).sort().map((name) => join(path, name)) : [path];
    for (const file of files) {
      let read;
      try {
        read = await readAgentFile(file);
        pickAgent(read.doc);
      } catch (error) {
        if (!inFolder) throw error;
        skipped.push(`${file}: ${error.message}`);
        continue;
      }
      const from = { doc: read.doc, dir: read.dir, zip: read.zip, file };
      if (isPackage(read.doc)) for (const item of read.doc.agents) agents.push({ ...from, slug: item.slug || item.ref, ref: item.ref, name: item.name, description: item.description ?? null });
      else agents.push({ ...from, slug: basename(file).replace(/\.json$/i, '').replace(/\.agent$/i, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''), ref: null, name: read.doc.name || 'agent', description: read.doc.description ?? null });
    }
  }
  const seen = new Map();
  for (const agent of agents) {
    if (!agent.slug) throw new Error(`${agent.file}: its name gives no slug to serve it at; rename the file.`);
    if (seen.has(agent.slug)) throw new Error(`Two agents would answer at /v1/agents/${agent.slug}: ${seen.get(agent.slug).file} and ${agent.file}. Rename one file, or serve them from two servers.`);
    seen.set(agent.slug, agent);
    try { validateGraph(graphOf(agent)); } catch (error) { throw new Error(`${agent.file}${agent.ref ? ` (agent ${agent.ref})` : ''}: ${error.message}`); }
  }
  return { agents, skipped };
}

// What a knowledge base an agent searches can't do here, said before the first learner finds out.
function knowledgeNotes(agents, folders) {
  const notes = Object.entries(folders?.skipped || {}).map(([id, names]) => `Knowledge base ${id}: left out ${names.join(', ')} (only text, Markdown, CSV, JSON and HTML files are read).`);
  for (const agent of agents) {
    for (const id of knowledgeIds(graphOf(agent))) {
      if (folders?.dirs.has(id)) continue;
      const kb = isPackage(agent.doc) ? (agent.doc.knowledge_bases || []).find((item) => item.ref === id) : null;
      const named = (isPackage(agent.doc) ? kb?.name : agent.doc.requires?.knowledge_bases?.find((item) => item.id === id)?.name) || null;
      const label = `${agent.slug}: knowledge base ${id}${named ? ` (${named})` : ''}`;
      const unread = (kb?.file_refs || []).map((ref) => (agent.doc.files || []).find((file) => file.ref === ref)).filter((file) => file && !readsLocally(file)).map((file) => file.name);
      if (!kb) notes.push(`${label} has no folder, so its searches fail: add --knowledge ${id}=<folder>.`);
      else if (kb.websites?.length || unread.length) notes.push(`${label} holds ${unread.length ? unread.join(', ') : 'websites'}, which a local run doesn't read, so its searches fail: save its files as text or Markdown in a folder and add --knowledge ${id}=<folder>.`);
    }
  }
  return notes;
}

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
  if (Buffer.byteLength(JSON.stringify(value)) > 128 * 1024) throw failure(413, 'agent_input_too_large', 'context exceeds 128 KiB.');
  const context = { ...value };
  for (const key of SERVER_CONTEXT) delete context[key];
  return context;
}

/**
 * A run request's turn, with VIABLE's field names and checks, in text: { text, history, context, user,
 * sources, include, stream }. Without server conversations, messages before the last are the history
 * (as VIABLE seeds a new conversation, or keeps client history), and conversation_id is refused.
 */
export function readTurn(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw invalid('Agent request body must be a JSON object.');
  const mode = body.history_mode ?? 'server';
  if (!['server', 'client', 'none'].includes(mode)) throw invalid('history_mode must be server, client, or none.');
  if (body.conversation_id != null) throw invalid('This server keeps no conversations: send the earlier messages in messages, with history_mode "client", instead of conversation_id.', 'unsupported_agent_parameter');
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
  return { text, history, context: contextOf(body.context), user, sources: requestedSourceStyle(body.sources), trace: body.include?.includes('trace') === true, stream: body.stream === true };
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

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const tooLarge = () => failure(413, 'agent_input_too_large', `Agent request body exceeds the ${limit}-byte limit.`);
    if (Number(req.headers['content-length']) > limit) return reject(tooLarge());
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size <= limit) return chunks.push(chunk);
      req.removeAllListeners('data');
      reject(tooLarge());
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

/**
 * Starts serving agents (loadAgents) on host:port: { server, url, notes }, notes being what the person
 * starting it should know about its knowledge bases. Without a token (Authorization: Bearer), only
 * this machine may be served. Limits: maxBodyBytes per request, timeoutMs per run (its endpoint calls
 * are cut off then), maxRuns at once. cors: the one browser origin allowed to call it. A run logs
 * one JSON line (log) with its timing and outcome, never what the learner wrote. The other options
 * are runAgent's, and knowledge ({ id: folder }) and memoryDir are shared by every agent and run.
 */
export async function serve(agents, { port = 8080, host = '127.0.0.1', token = null, cors = null, maxBodyBytes = 1024 * 1024, timeoutMs = 300000, maxRuns = 4, knowledge = null, memoryDir = null, model = null, speechModel = null, imageModel = null, mediaDir = null, silent = false, baseUrl, apiKey, fetch = (...args) => globalThis.fetch(...args), log = (line) => process.stdout.write(`${JSON.stringify(line)}\n`) } = {}) {
  if (!token && !LOCAL_HOSTS.has(host)) throw new Error(`Serving on ${host} without a token would let anyone who can reach this machine run these agents on your model keys. Give a token with --token-env <NAME>, or serve on 127.0.0.1.`);
  const folders = knowledge ? await knowledgeFolders(knowledge) : null;
  // One search and one memory for all runs: files are read once, and a learner's facts are saved one at a time.
  const served = new Map(agents.map((agent) => [agent.slug, { ...agent, searchKnowledge: isPackage(agent.doc) || folders ? packageKnowledge(isPackage(agent.doc) ? agent.doc : null, { dir: agent.dir, zip: agent.zip, folders, fetch }) : null }]));
  const memory = memoryDir ? memoryFiles(memoryDir) : null;
  const expected = token ? createHash('sha256').update(token).digest() : null;
  const runs = new Map();
  let running = 0;

  const corsHeaders = cors ? { 'access-control-allow-origin': cors, vary: 'Origin' } : {};
  const meta = (agent) => ({ object: 'agent', slug: agent.slug, name: agent.name, description: agent.description, published_version: null });

  async function postRun(req, res, agent, send, requestId) {
    const started = Date.now();
    const line = { request_id: requestId, agent: agent.slug, run_id: null };
    let turn = null;
    let answer;
    let result = null;
    let sse = null;
    try {
      let body;
      try { body = JSON.parse((await readBody(req, maxBodyBytes)).toString('utf8')); } catch (error) {
        throw error.status ? error : failure(400, 'invalid_json', 'Invalid request body: JSON parsing failed');
      }
      turn = readTurn(body);
      if (memory && turn.user) checkLearner(turn.user);
      if (running >= maxRuns) throw Object.assign(failure(429, 'rate_limit_exceeded', `${maxRuns} runs are running, this server's limit. Retry shortly.`), { headers: { 'retry-after': '1' } });
      running += 1;
      const runId = `agtr_${randomUUID().replaceAll('-', '')}`;
      const startedAt = new Date().toISOString();
      const signal = AbortSignal.timeout(timeoutMs);
      const timed = (base) => (url, init = {}) => base(url, { ...init, signal: init.signal ? AbortSignal.any([init.signal, signal]) : signal });
      if (turn.stream) {
        res.writeHead(200, { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-cache, no-transform', 'x-accel-buffering': 'no', 'x-request-id': requestId, ...corsHeaders });
        sse = (name, data) => res.write(`event: ${name}\ndata: ${JSON.stringify(data)}\n\n`);
        sse('run.started', { object: 'agent.run.started', agent: agent.slug });
      }
      const keepAlive = sse && setInterval(() => res.write(': keep-alive\n\n'), KEEP_ALIVE_MS);
      try {
        result = await runAgent(agent.doc, {
          input: turn.text, history: turn.history, context: turn.context, agent: agent.ref, dir: agent.dir, zip: agent.zip,
          model, speechModel, imageModel, mediaDir, silent, baseUrl, apiKey, fetch: timed(fetch),
          learner: memory ? turn.user : null,
          services: { httpFetch: timed((...args) => globalThis.fetch(...args)), ...(agent.searchKnowledge ? { searchKnowledge: agent.searchKnowledge } : {}), ...(memory ? { memory } : {}) },
          hooks: sse ? { onAnswer: (text) => sse('run.delta', { text }) } : {}
        });
      } catch (error) {
        throw signal.aborted ? Object.assign(error, { timedOut: true }) : error;
      } finally {
        running -= 1;
        clearInterval(keepAlive);
      }
      const completedAt = new Date().toISOString();
      const trace = runTrace(result.steps, startedAt, completedAt);
      runs.set(runId, { object: 'agent.run', id: runId, agent: agent.slug, conversation_id: null, status: 'completed', started_at: startedAt, completed_at: completedAt, duration_ms: trace.duration_ms, output: { text: result.output.text ?? '', attachments: result.output.attachments || [], data: result.output.data ?? null }, usage: { total: result.usage.total }, cost: result.cost, trace });
      if (runs.size > KEPT_RUNS) runs.delete(runs.keys().next().value);
      line.run_id = runId;
      answer = { status: 200, body: { object: 'agent.run.result', agent: agent.slug, conversation_id: null, run_id: runId, output: deliverOutput(result.output, turn.sources || 'none'), usage: result.usage, cost: result.cost, input_assets: [], ...(turn.trace ? { trace } : {}) } };
    } catch (error) {
      const found = answerFor(error, error.timedOut ? timeoutMs : null);
      if (found.unexpected) console.error(error);
      answer = { status: found.status, headers: error.headers, body: { error: { message: found.message, type: typeOf(found.status), code: found.code, request_id: requestId } } };
    }
    log({ at: new Date().toISOString(), ...line, status: answer.status, ...(answer.body.error ? { code: answer.body.error.code } : {}), duration_ms: Date.now() - started, ...(result ? { model_calls: result.modelCalls, tokens: result.usage.total } : {}), stream: turn?.stream === true });
    if (!sse) return send(answer.status, answer.body, answer.headers);
    sse(answer.status === 200 ? 'run.completed' : 'run.failed', answer.status === 200 ? answer.body : { status: answer.status, ...answer.body });
    res.end();
  }

  const server = createServer(async (req, res) => {
    const requestId = randomUUID();
    const send = (status, body, headers = {}) => {
      res.writeHead(status, { 'content-type': 'application/json', 'x-request-id': requestId, ...corsHeaders, ...(status === 413 ? { connection: 'close' } : {}), ...headers });
      res.end(JSON.stringify(body));
    };
    const fail = (status, code, message, type = typeOf(status), headers = {}) => send(status, { error: { message, type, code, request_id: requestId } }, headers);
    try {
      const path = new URL(req.url, 'http://localhost').pathname;
      if (cors && req.method === 'OPTIONS') {
        res.writeHead(204, { ...corsHeaders, 'access-control-allow-methods': 'GET, POST', 'access-control-allow-headers': 'authorization, content-type, idempotency-key, x-platform-id, x-platform-name', 'access-control-max-age': '600' });
        return res.end();
      }
      if (req.method === 'GET' && path === '/health') return send(200, { status: 'ok', agents: served.size });
      if (expected) {
        const given = /^Bearer\s+(.+)$/i.exec(req.headers.authorization || '')?.[1];
        if (!given || !timingSafeEqual(createHash('sha256').update(given).digest(), expected)) {
          return fail(401, 'invalid_api_key', given ? 'Invalid token.' : 'Missing token: send Authorization: Bearer <token>.', 'authentication_error', { 'www-authenticate': 'Bearer realm="viable-harness"' });
        }
      }
      const route = /^\/v1\/agents(?:\/([^/]+)(\/runs(?:\/([^/]+))?)?)?\/?$/.exec(path);
      if (!route) return fail(404, 'not_found', `No route ${req.method} ${path}.`);
      // Slugs and run IDs are plain letters, digits, dots, dashes and underscores: nothing to decode.
      const [, slug, runsPath, runId] = route;
      const isRuns = Boolean(runsPath) && !runId;
      if (!slug) return req.method === 'GET' ? send(200, { object: 'list', data: [...served.values()].map(meta) }) : fail(404, 'not_found', `No route ${req.method} ${path}.`);
      const agent = served.get(slug);
      if (!agent) return fail(404, 'agent_not_found', 'Agent not found.');
      if (req.method === 'GET' && !runsPath) return send(200, meta(agent));
      if (req.method === 'POST' && isRuns) return await postRun(req, res, agent, send, requestId);
      if (req.method === 'GET' && runId) {
        const run = runs.get(runId);
        return run?.agent === slug ? send(200, run, { 'cache-control': 'no-store' }) : fail(404, 'run_not_found', 'Agent run not found.');
      }
      return fail(404, 'not_found', `No route ${req.method} ${path}.`);
    } catch (error) {
      console.error(error);
      if (!res.headersSent) fail(500, 'server_error', 'The server failed to answer.');
      else res.end();
    }
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => { server.off('error', reject); resolve(); });
  });
  const address = server.address();
  return { server, url: `http://${address.family === 'IPv6' ? `[${address.address}]` : address.address}:${address.port}`, notes: knowledgeNotes(agents, folders) };
}
