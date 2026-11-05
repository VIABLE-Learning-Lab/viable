/**
 * Calls a component that runs out of process (docs/components.md): an HTTP endpoint, or a tool of a
 * stdio MCP server the harness starts. What a call may send and what each slot's answer must be are in
 * contract.js, which any host shares; this adds the MCP transport. It starts processes, so the Worker
 * never imports it.
 */
import { spawn } from 'node:child_process';
import { publicUrl } from '../net/publicUrl.js';
import { publicFetch } from '../net/publicFetch.js';
import { CALL_LIMITS, callOut, checkManifest, failed, overHttp, parse, refused, text } from './contract.js';
import PACKAGE from '../../package.json' with { type: 'json' };

export { CALL_LIMITS, checkManifest };

const VERSION = PACKAGE.version;
// The version mcp.js serves first; importing it from there would loop back through testRuns.js.
const PROTOCOL_VERSION = '2025-06-18';

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

/**
 * Calls an out-of-process component with payload, an object of the fields components may receive
 * (schemas/component.schema.json, receives), cut to the ones its manifest lists. Returns its answer,
 * read by its slot. Errors carry code component_refused (nothing was sent), component_failed or
 * component_timeout. An MCP server starts in dir with only PATH and env from the environment.
 */
export async function callComponent(manifest, payload, { timeoutMs, maxBytes, fetch = globalThis.fetch, checkEntry = null, dir = process.cwd(), env = {} } = {}) {
  if (manifest?.runs?.kind === 'data') return { items: checkManifest(manifest, 'context').runs.items };
  const transport = (component, sent, call) => (component.runs.kind === 'http' ? overHttp(component, sent, { ...call, fetch, checkEntry }) : overMcp(component, sent, { ...call, dir, env }));
  return callOut(manifest, payload, transport, { timeoutMs, maxBytes });
}

/**
 * The callComponent service for steps in a document. A package or an agent file is someone else's until
 * its reader says otherwise, so a step may use only the kinds in componentRuns, at a public address (as
 * VIABLE's hosted platform allows). allowComponents lifts both for the IDs the person running it named,
 * which is the only way a document starts a program; the person chooses, never the document or a tool's
 * caller. callComponent itself stays for a manifest a person points at deliberately.
 */
export function documentComponents({ componentRuns = ['http'], allowComponents = [], fetch, lookup, dir, env } = {}) {
  const outward = publicFetch(fetch, lookup ? { lookup } : {});
  return async (manifest, payload, options) => {
    checkManifest(manifest);
    const named = allowComponents.includes(manifest.id);
    if (!named && !componentRuns.includes(manifest.runs.kind)) throw refused(`${manifest.id} would start a program on this computer, which a document can't ask for. Read what it starts with viable-engine inspect, and if you trust it, run it with --allow-component ${manifest.id}.`);
    return callComponent(manifest, payload, { ...options, dir, env, fetch: named ? fetch : outward, checkEntry: named ? null : (url) => publicUrl(url.href) });
  };
}

// A record's events and turns; its pseudonymous id and the rest stay with the host.
const learningEvents = (record) => ({ learning_events: { events: record?.events ?? [], turns: record?.turns ?? [] } });

/** A detector's marks over one learner's record: { marks: [{ turn_index, label, evidence }] }. */
export const detect = async (manifest, record, options) => callComponent(checkManifest(manifest, 'detector'), learningEvents(record), options);
/** A measure over one learner's record: { measures: [{ id, value }] }. */
export const measure = async (manifest, record, options) => callComponent(checkManifest(manifest, 'measure'), learningEvents(record), options);
/** A context component's items for a query (a teacher's words, or a payload): { items: [{ text, source, attribution }] }. */
export const lookup = async (manifest, query, options) => {
  checkManifest(manifest, 'context');
  // A data component holds its items, so there is nothing to call and nothing is sent.
  return manifest.runs.kind === 'data' ? { items: manifest.runs.items } : callComponent(manifest, typeof query === 'string' ? { teacher_text: query } : query, options);
};
