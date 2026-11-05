/**
 * What calling a component out of process means wherever it runs (docs/components.md): the manifest
 * fits the schema, the payload holds only what `receives` lists, an HTTP entry is on a host in
 * `sends_to` and never redirected, a timeout and a size limit on the answer, and each slot's reading
 * of the answer, as data, never as instructions. No Node built-ins, so a Worker bundles it: call.js
 * adds the MCP transport for a local run, and a host may call HTTP components with callOut and its own
 * address rules (checkEntry).
 */
import { readVerdict } from '../agentTests.js';
import { checkSchema, schemaFor } from '../schemas.js';

const RECEIVABLE = schemaFor('component').properties.receives.items.enum;
const LOOPBACK = ['localhost', '127.0.0.1'];
export const CALL_LIMITS = { timeoutMs: 30000, maxBytes: 1024 * 1024 };

export const fault = (code, message) => Object.assign(new Error(message), { code });
export const refused = (message) => fault('component_refused', message);
export const failed = (message) => fault('component_failed', message);
export const text = (value, max) => (typeof value === 'string' ? value.trim().slice(0, max) : '');

/** The manifest, if it fits the schema, runs out of process and (when given) fills slot; else component_refused. */
export function checkManifest(manifest, slot = null) {
  const errors = checkSchema(schemaFor('component'), manifest);
  if (errors.length) throw refused(`The manifest doesn't fit schemas/component.schema.json:\n${errors.map((error) => `  ${error}`).join('\n')}`);
  if (slot && manifest.slot !== slot) throw refused(`${manifest.id} is a ${manifest.slot} component, not a ${slot}.`);
  if (manifest.runs.kind === 'core') throw refused(`${manifest.id} runs in the harness's own process: call ${manifest.runs.entry}.`);
  if (manifest.runs.kind === 'data' && manifest.slot !== 'context') throw refused(`${manifest.id} holds data, which only a context component can: it has nothing to run as a ${manifest.slot}.`);
  return manifest;
}

/**
 * A context component's items as an activity's guidance (teaching.guidance), each carrying where it came from.
 * items: what lookup answered, or a data component's own. chosen: which of them, by number from 1; left out, all.
 */
export function guidanceFrom(manifest, { items = manifest.runs?.items ?? [], chosen = null } = {}) {
  const numbers = chosen ?? items.map((_, index) => index + 1);
  const unknown = numbers.filter((number) => !Number.isInteger(number) || number < 1 || number > items.length);
  if (unknown.length) throw refused(`${manifest.id} has items 1 to ${items.length}, so there is no ${unknown.join(', ')}.`);
  return numbers.map((number) => {
    const { text: said, when, about, source, attribution } = items[number - 1];
    return { text: said, ...(when ? { when } : {}), ...(about ? { about } : {}), component: `${manifest.id}@${manifest.version}`, source: source || manifest.label, attribution: attribution || manifest.attribution || manifest.cite };
  });
}

/** Why an http manifest's entry can't be called (a sentence), or null: https unless on this machine, no credentials, a host in sends_to. */
export function entryProblem(manifest) {
  let url;
  try { url = new URL(manifest.runs.entry); } catch { return `${manifest.id}'s entry isn't a URL.`; }
  if (!(url.protocol === 'https:' || (url.protocol === 'http:' && LOOPBACK.includes(url.hostname))) || url.username || url.password) {
    return `${manifest.id}'s entry must be an https address (http only on this machine), without credentials.`;
  }
  if (!manifest.sends_to.includes(url.hostname)) return `${manifest.id}'s entry is on ${url.hostname}, which its sends_to doesn't list.`;
  return null;
}

function cut(manifest, payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw refused('The payload is a JSON object of the fields a component may receive.');
  const unknown = Object.keys(payload).filter((key) => !RECEIVABLE.includes(key));
  if (unknown.length) throw refused(`No component receives ${unknown.join(', ')}; the fields are ${RECEIVABLE.join(', ')}.`);
  return Object.fromEntries(Object.entries(payload).filter(([key, value]) => manifest.receives.includes(key) && value !== undefined));
}

export const parse = (manifest, body) => {
  try { return JSON.parse(body); } catch { throw failed(`${manifest.id} answered with something other than JSON.`); }
};

/**
 * POSTs the payload to an http component's entry and reads its JSON answer, at most maxBytes, never
 * following a redirect. checkEntry(url), a host's own address rules, throws to refuse the entry.
 */
export async function overHttp(manifest, payload, { fetch, signal, maxBytes, checkEntry = null }) {
  const problem = entryProblem(manifest);
  if (problem) throw refused(problem);
  const url = new URL(manifest.runs.entry);
  try { checkEntry?.(url); } catch (error) { throw refused(`${manifest.id}'s entry can't be called here: ${error.message}`); }
  // A redirect could leave the hosts in sends_to, so none is followed.
  const response = await fetch(url.href, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify(payload), redirect: 'manual', signal });
  if (!response.ok) {
    await response.body?.cancel();
    throw failed(`${manifest.id} answered with status ${response.status}.`);
  }
  const reader = response.body?.getReader();
  const decoder = new TextDecoder();
  let size = 0;
  let body = '';
  for (let part = await reader?.read(); part && !part.done; part = await reader.read()) {
    size += part.value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      throw failed(`${manifest.id}'s answer is larger than ${maxBytes} bytes.`);
    }
    body += decoder.decode(part.value, { stream: true });
  }
  return parse(manifest, body + decoder.decode());
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
  },
  // What later steps of a graph read: output as it came (text cut to 20,000 characters), and at most 20 flags.
  step(manifest, output) {
    const flags = output?.flags == null ? [] : listOf(output.flags, (flag) => ({ label: text(flag.label, 120), reason: text(flag.reason, 600) }));
    if (!output || typeof output !== 'object' || Array.isArray(output) || output.output === undefined || !flags || flags.some((flag) => !flag.label)) {
      throw misfit(manifest, '{ output, flags: [{ label, reason }] }');
    }
    return { output: typeof output.output === 'string' ? output.output.slice(0, 20000) : output.output, flags: flags.slice(0, 20) };
  }
};

/**
 * Calls an out-of-process component through transport(manifest, sent, { signal, maxBytes }), with
 * payload cut to the fields its manifest receives, and returns the answer read by its slot. Errors
 * carry code component_refused (nothing was sent), component_failed or component_timeout.
 */
export async function callOut(manifest, payload, transport, { timeoutMs = CALL_LIMITS.timeoutMs, maxBytes = CALL_LIMITS.maxBytes } = {}) {
  checkManifest(manifest);
  const sent = cut(manifest, payload);
  // A timer that holds the process open while it waits (AbortSignal.timeout's doesn't, so a run
  // whose only pending work is a silent component could end before it times out).
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new DOMException('The component took too long.', 'TimeoutError')), timeoutMs);
  const { signal } = controller;
  let output;
  try {
    output = await transport(manifest, sent, { signal, maxBytes });
  } catch (error) {
    if (signal.aborted) throw fault('component_timeout', `${manifest.id} didn't answer within ${timeoutMs / 1000} s.`);
    if (String(error?.code).startsWith('component_')) throw error;
    throw failed(`${manifest.id} couldn't be reached: ${error?.cause?.message || error?.message || error}`);
  } finally {
    clearTimeout(timer);
  }
  return READERS[manifest.slot] ? READERS[manifest.slot](manifest, output, payload) : output;
}
