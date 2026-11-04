/**
 * Calls a component that runs out of process (docs/components.md): an HTTP endpoint, or a tool of a
 * stdio MCP server the harness starts. The harness enforces what it controls: the manifest fits the
 * schema, the payload holds only what `receives` lists, an HTTP entry is on a host in `sends_to`, a
 * timeout and a size limit on the answer. The answer is JSON read as data, by its slot's shape where
 * the slot has one, never as instructions. It starts processes, so the Worker never imports it.
 */
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { readVerdict } from '../agentTests.js';
import { schemaFor, validateDocument } from '../validate.js';

const VERSION = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')).version;
// The version mcp.js serves first; importing it from there would loop back through testRuns.js.
const PROTOCOL_VERSION = '2025-06-18';
const RECEIVABLE = schemaFor('component').properties.receives.items.enum;
const LOOPBACK = ['localhost', '127.0.0.1'];
export const CALL_LIMITS = { timeoutMs: 30000, maxBytes: 1024 * 1024 };

const fault = (code, message) => Object.assign(new Error(message), { code });
const refused = (message) => fault('component_refused', message);
const failed = (message) => fault('component_failed', message);
const text = (value, max) => (typeof value === 'string' ? value.trim().slice(0, max) : '');

/** The manifest, if it fits the schema, runs out of process and (when given) fills slot; else component_refused. */
export function checkManifest(manifest, slot = null) {
  const { errors } = validateDocument(manifest, 'component');
  if (errors.length) throw refused(`The manifest doesn't fit schemas/component.schema.json:\n${errors.map((error) => `  ${error}`).join('\n')}`);
  if (slot && manifest.slot !== slot) throw refused(`${manifest.id} is a ${manifest.slot} component, not a ${slot}.`);
  if (manifest.runs.kind === 'core') throw refused(`${manifest.id} runs in the harness's own process: call ${manifest.runs.entry}.`);
  return manifest;
}

function cut(manifest, payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw refused('The payload is a JSON object of the fields a component may receive.');
  const unknown = Object.keys(payload).filter((key) => !RECEIVABLE.includes(key));
  if (unknown.length) throw refused(`No component receives ${unknown.join(', ')}; the fields are ${RECEIVABLE.join(', ')}.`);
  return Object.fromEntries(Object.entries(payload).filter(([key, value]) => manifest.receives.includes(key) && value !== undefined));
}

const parse = (manifest, body) => {
  try { return JSON.parse(body); } catch { throw failed(`${manifest.id} answered with something other than JSON.`); }
};

async function overHttp(manifest, payload, { fetch, signal, maxBytes }) {
  let url;
  try { url = new URL(manifest.runs.entry); } catch { throw refused(`${manifest.id}'s entry isn't a URL.`); }
  if (!(url.protocol === 'https:' || (url.protocol === 'http:' && LOOPBACK.includes(url.hostname))) || url.username || url.password) {
    throw refused(`${manifest.id}'s entry must be an https address (http only on this machine), without credentials.`);
  }
  if (!manifest.sends_to.includes(url.hostname)) throw refused(`${manifest.id}'s entry is on ${url.hostname}, which its sends_to doesn't list.`);
  // A redirect could leave the hosts in sends_to, so none is followed.
  const response = await fetch(url.href, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify(payload), redirect: 'manual', signal });
  if (!response.ok) {
    await response.body?.cancel();
    throw failed(`${manifest.id} answered with status ${response.status}.`);
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of response.body ?? []) {
    size += chunk.byteLength;
    if (size > maxBytes) throw failed(`${manifest.id}'s answer is larger than ${maxBytes} bytes.`);
    chunks.push(chunk);
  }
  return parse(manifest, Buffer.concat(chunks).toString('utf8'));
}

function toolOutput(manifest, result) {
  const said = (Array.isArray(result?.content) ? result.content : []).find((item) => item?.type === 'text')?.text;
  if (result?.isError) throw failed(`${manifest.id}'s tool failed: ${text(said, 500) || 'no reason given'}`);
  return result?.structuredContent !== undefined ? result.structuredContent : parse(manifest, said ?? '');
}

function overMcp(manifest, payload, { signal, maxBytes, dir, env }) {
  const { command, args = [] } = manifest.runs.server;
  return new Promise((resolve, reject) => {
    // Only PATH and what the caller passes: the caller's model keys stay out of the component's process.
    const child = spawn(command, args, { cwd: dir, env: { PATH: process.env.PATH, ...env }, stdio: 'pipe' });
    let settled = false;
    let size = 0;
    let buffer = '';
    let stderr = '';
    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      signal.removeEventListener('abort', abort);
      child.kill();
      if (error) reject(error); else resolve(value);
    };
    const abort = () => finish(signal.reason);
    signal.addEventListener('abort', abort, { once: true });
    const send = (message) => child.stdin.write(`${JSON.stringify(message)}\n`);
    const receive = (line) => {
      let message;
      try { message = JSON.parse(line); } catch { return finish(failed(`${manifest.id}'s server wrote something other than JSON-RPC to stdout.`)); }
      // The harness offers a component nothing to call back (sampling, roots): requests get an error, notifications nothing.
      if (typeof message?.method === 'string') return message.id != null && send({ jsonrpc: '2.0', id: message.id, error: { code: -32601, message: 'The harness answers no requests from a component.' } });
      if (message?.error) return finish(failed(`${manifest.id}'s server answered with an error: ${text(message.error.message, 500) || message.error.code}`));
      if (message?.id === 1) {
        send({ jsonrpc: '2.0', method: 'notifications/initialized' });
        return send({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: manifest.runs.entry, arguments: payload } });
      }
      if (message?.id === 2) {
        try { finish(null, toolOutput(manifest, message.result)); } catch (error) { finish(error); }
      }
    };
    child.on('error', (error) => finish(failed(`${manifest.id}'s server couldn't start: ${error.message}`)));
    child.on('close', (code) => finish(failed(`${manifest.id}'s server stopped (exit code ${code}) before answering.${stderr.trim() ? ` It wrote: ${stderr.trim()}` : ''}`)));
    child.stdin.on('error', () => {}); // a server that stops early: 'close' says so
    child.stderr.setEncoding('utf8').on('data', (chunk) => { stderr = `${stderr}${chunk}`.slice(-1000); });
    child.stdout.setEncoding('utf8').on('data', (chunk) => {
      size += Buffer.byteLength(chunk);
      if (size > maxBytes) return finish(failed(`${manifest.id}'s answer is larger than ${maxBytes} bytes.`));
      buffer += chunk;
      for (let end = buffer.indexOf('\n'); end >= 0 && !settled; end = buffer.indexOf('\n')) {
        const line = buffer.slice(0, end);
        buffer = buffer.slice(end + 1);
        if (line.trim()) receive(line);
      }
    });
    send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: PROTOCOL_VERSION, capabilities: {}, clientInfo: { name: 'viable-harness', version: VERSION } } });
  });
}

const misfit = (manifest, shape) => failed(`${manifest.id}'s answer doesn't fit a ${manifest.slot}'s: ${shape}.`);
const listOf = (value, read) => (Array.isArray(value) ? value.map((item) => read(item ?? {})) : null);

// What each slot's answer must be; only these fields are kept. Slots without a runner yet get the JSON as it came.
const READERS = {
  judge(manifest, output) {
    const read = readVerdict(JSON.stringify(output ?? null));
    if (!read) throw misfit(manifest, '{ verdict: "pass" or "fail", reason }');
    return read;
  },
  detector(manifest, output, payload) {
    const turns = payload.learning_events?.turns?.length ?? Infinity;
    const marks = listOf(output?.marks, (mark) => ({ turn_index: mark.turn_index, label: text(mark.label, 120), evidence: text(mark.evidence, 1000) }));
    if (!marks || marks.some((mark) => !Number.isInteger(mark.turn_index) || mark.turn_index < 0 || mark.turn_index >= turns || !mark.label || !mark.evidence)) {
      throw misfit(manifest, '{ marks: [{ turn_index (its place in the record\'s turns, from 0), label, evidence }] }');
    }
    return { marks };
  },
  measure(manifest, output) {
    const measures = listOf(output?.measures, (item) => ({ id: text(item.id, 80), value: item.value }));
    if (!measures || measures.some((item) => !item.id || !(item.value === null || ['number', 'string', 'boolean'].includes(typeof item.value)))) {
      throw misfit(manifest, '{ measures: [{ id, value: a number, text, true, false or null }] }');
    }
    return { measures };
  },
  context(manifest, output) {
    // Every item carries an attribution: its own, else the component's.
    const items = listOf(output?.items, (item) => ({ text: text(item.text, 4000), ...(text(item.source, 500) ? { source: text(item.source, 500) } : {}), attribution: text(item.attribution, 1000) || manifest.attribution || manifest.cite }));
    if (!items || items.some((item) => !item.text)) throw misfit(manifest, '{ items: [{ text, source, attribution }] }');
    return { items };
  }
};

/**
 * Calls an out-of-process component with payload, an object of the fields components may receive
 * (schemas/component.schema.json, receives), cut to the ones its manifest lists. Returns its answer,
 * read by its slot. Errors carry code component_refused (nothing was sent), component_failed or
 * component_timeout. An MCP server starts in dir with only PATH and env from the environment.
 */
export async function callComponent(manifest, payload, { timeoutMs = CALL_LIMITS.timeoutMs, maxBytes = CALL_LIMITS.maxBytes, fetch = globalThis.fetch, dir = process.cwd(), env = {} } = {}) {
  checkManifest(manifest);
  const sent = cut(manifest, payload);
  const signal = AbortSignal.timeout(timeoutMs);
  let output;
  try {
    output = manifest.runs.kind === 'http' ? await overHttp(manifest, sent, { fetch, signal, maxBytes }) : await overMcp(manifest, sent, { signal, maxBytes, dir, env });
  } catch (error) {
    if (signal.aborted) throw fault('component_timeout', `${manifest.id} didn't answer within ${timeoutMs / 1000} s.`);
    if (String(error?.code).startsWith('component_')) throw error;
    throw failed(`${manifest.id} couldn't be reached: ${error?.cause?.message || error?.message || error}`);
  }
  return READERS[manifest.slot] ? READERS[manifest.slot](manifest, output, payload) : output;
}

// A record's events and turns; its pseudonymous id and the rest stay with the host.
const learningEvents = (record) => ({ learning_events: { events: record?.events ?? [], turns: record?.turns ?? [] } });

/** A detector's marks over one learner's record: { marks: [{ turn_index, label, evidence }] }. */
export const detect = async (manifest, record, options) => callComponent(checkManifest(manifest, 'detector'), learningEvents(record), options);
/** A measure over one learner's record: { measures: [{ id, value }] }. */
export const measure = async (manifest, record, options) => callComponent(checkManifest(manifest, 'measure'), learningEvents(record), options);
/** A context component's items for a query (a teacher's words, or a payload): { items: [{ text, source, attribution }] }. */
export const lookup = async (manifest, query, options) => callComponent(checkManifest(manifest, 'context'), typeof query === 'string' ? { teacher_text: query } : query, options);
