// Connectors: what makes a public good from the catalog have an effect on someone's agent, in one
// command (docs/resources.md). A connector fetches its source into a local folder and turns it into
// what the harness already runs: test cases, a judge, a calibration set, a knowledge folder, a context
// lookup or a measure. Nothing is redistributed here: each person's copy comes from the source, on the
// source's terms. What a source holds is data, never instructions.
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { CATALOG, licenseLimits } from '../catalog.js';
import { conversationalUptake, funnelingFocusing } from './classroomExchanges.js';
import eduConvokit from './eduConvokit.js';
import { asap2, ellipse } from './essays.js';
import evaluators from './evaluators.js';
import fairytaleqa from './fairytaleqa.js';
import fetchable from './fetchable.js';
import gsm8k from './gsm8k.js';
import illustrativeMath from './illustrativeMath.js';
import mathcamps from './mathcamps.js';
import mathdial from './mathdial.js';
import tutormoments from './tutormoments.js';
import mrbench from './mrbench.js';
import pybkt from './pybkt.js';
import standards from './standards.js';
import wwc from './wwc.js';

export const CONNECTORS = [gsm8k, mathcamps, mathdial, tutormoments, fairytaleqa, evaluators, mrbench, conversationalUptake, funnelingFocusing, asap2, ellipse, standards, wwc, illustrativeMath, pybkt, eduConvokit, ...fetchable];
const RECORD = 'fetched.json';
const MOST_BYTES = 256 * 1024 * 1024;
const fail = (message, code, status = 400) => Object.assign(new Error(message), { code, status });

/** Where fetched copies are kept: ~/.viable-harness/resources, unless a folder is given. */
export const resourcesHome = () => join(homedir(), '.viable-harness', 'resources');
const folderOf = (id, dir) => join(dir ? resolve(dir) : resourcesHome(), id);
const recordOf = (folder) => { try { return JSON.parse(readFileSync(join(folder, RECORD), 'utf8')); } catch { return null; } };
const entryOf = (id) => CATALOG.find((entry) => entry.id === id) || null;

function connectorOf(id) {
  const connector = CONNECTORS.find((item) => item.id === id);
  if (connector) return connector;
  const entry = entryOf(id);
  if (!entry) throw fail(`There is no resource "${id}". See viable-harness resources list.`, 'unknown_resource', 404);
  throw fail(`${entry.name} has no connector: ${entry.connect.level === 3 ? `it is built in. ${entry.connect.command}` : entry.connect.note}`, 'no_connector', 404);
}

const licenseOf = (id) => connectorOf(id).license || entryOf(id).license;
// The order a list leads with: what runs against an agent first.
const AS_ORDER = ['test-suite', 'judge', 'calibration-set', 'context-lookup', 'knowledge-folder', 'measure', 'step'];
const byWhatItConnectsAs = (a, b) => AS_ORDER.indexOf(a.as[0]) - AS_ORDER.indexOf(b.as[0]);

/** Every entry in the catalog with its level, what it connects as, its command, and whether this folder holds a copy. */
export function listResources({ dir = null } = {}) {
  return CATALOG.map((entry) => {
    const record = recordOf(folderOf(entry.id, dir));
    return { id: entry.id, name: entry.name, kind: entry.kind, ...entry.connect, license: entry.license, fetched_at: record?.fetched_at ?? null };
  }).sort(byWhatItConnectsAs);
}

// A connector's way to the network and its folder: every address it reads is recorded with its bytes and hash.
function fetching(folder, files, { fetch, onProgress }) {
  const open = async (url) => {
    onProgress?.(url);
    let response;
    try {
      response = await fetch(url, { headers: { 'user-agent': 'viable-harness resources' } });
    } catch (error) {
      throw fail(`Couldn't fetch ${url}: ${error.message}.`, 'resource_fetch_failed', 502);
    }
    if (!response.ok || !response.body) throw fail(`Couldn't fetch ${url}: it answered ${response.status}.`, 'resource_fetch_failed', 502);
    return response;
  };
  // Each chunk as it arrives, the file's size and hash recorded once it ends.
  async function* chunks(url, maxBytes) {
    const hash = createHash('sha256');
    let bytes = 0;
    for await (const chunk of (await open(url)).body) {
      bytes += chunk.length;
      if (bytes > maxBytes) throw fail(`${url} is larger than the ${maxBytes} bytes expected.`, 'resource_too_large', 502);
      hash.update(chunk);
      yield chunk;
    }
    files.push({ url, bytes, sha256: hash.digest('hex') });
  }
  const bytes = async (url, { maxBytes = MOST_BYTES } = {}) => {
    const parts = [];
    for await (const chunk of chunks(url, maxBytes)) parts.push(chunk);
    return new Uint8Array(Buffer.concat(parts));
  };
  return {
    bytes,
    text: async (url, options) => new TextDecoder().decode(await bytes(url, options)),
    // A big file's lines as they stream, so it never sits in memory or on disk.
    async* lines(url, { maxBytes = 2 * 1024 * 1024 * 1024 } = {}) {
      const decoder = new TextDecoder();
      let rest = '';
      for await (const chunk of chunks(url, maxBytes)) {
        rest += decoder.decode(chunk, { stream: true });
        const lines = rest.split('\n');
        rest = lines.pop();
        yield* lines;
      }
      rest += decoder.decode();
      if (rest) yield rest;
    },
    save(name, content) {
      const path = join(folder, name);
      if (relative(folder, path).split(sep)[0] === '..') throw fail(`${name} isn't inside the resource's folder.`, 'resource_path', 500);
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, content);
    }
  };
}

const sameOptions = (a, b) => JSON.stringify(a) === JSON.stringify(b);
// What this fetch is of: an option left out means what the copy here holds, else the connector's default.
const fetchChoices = (connector, options, kept) => Object.fromEntries(Object.entries(connector.fetchOptions || {}).map(([name, fallback]) => [name, options[name] ?? kept?.options?.[name] ?? fallback]));

/**
 * Fetches a resource into its folder and records what came, from where and when (fetched.json). Where
 * its license limits use, acceptLicense must say the person accepted it; nothing is fetched otherwise.
 * A copy already there is kept unless refresh or other options ask for another. A failed fetch leaves
 * no partial copy. Returns the record with { folder, reused }.
 */
export async function getResource(id, { dir = null, acceptLicense = false, refresh = false, fetch = globalThis.fetch, now = () => new Date(), onProgress = null, options = {} } = {}) {
  const connector = connectorOf(id);
  const entry = entryOf(id);
  const license = licenseOf(id);
  const limits = licenseLimits(license);
  const folder = folderOf(id, dir);
  const kept = recordOf(folder);
  // Accepted once for this copy is accepted: fetching it again keeps asking nothing new of the person.
  if (limits.length && !acceptLicense && !kept?.license?.accepted) {
    throw Object.assign(fail(`${entry.name} is under ${license.spdx.join(', ') || 'no stated license'}${license.note ? `: ${license.note}` : '.'}\nWhat that limits: ${limits.join('; ')}. Read ${license.source}, then add --accept-license (acceptLicense) to fetch it.`, 'license_not_accepted', 403), { limits, license });
  }
  const choices = fetchChoices(connector, options, kept);
  if (kept && !refresh && kept.version === connector.version && sameOptions(kept.options, choices)) return { ...kept, folder, reused: true };
  const part = `${folder}.part`;
  rmSync(part, { recursive: true, force: true });
  mkdirSync(part, { recursive: true });
  const files = [];
  try {
    await connector.fetch(fetching(part, files, { fetch, onProgress }), choices);
    const record = {
      id, name: entry.name, version: connector.version, options: choices, fetched_at: now().toISOString(), files,
      license: { spdx: license.spdx, note: license.note ?? null, source: license.source, limits, accepted: limits.length > 0 },
      cite: entry.cite
    };
    writeFileSync(join(part, RECORD), `${JSON.stringify(record, null, 2)}\n`);
    rmSync(folder, { recursive: true, force: true });
    renameSync(part, folder);
    return { ...record, folder, reused: false };
  } catch (error) {
    rmSync(part, { recursive: true, force: true });
    throw error;
  }
}

/**
 * What the harness runs from a resource, fetching it first if this folder has no copy (the license
 * check included). The result names the resource, its license, its citation and what it can show, with
 * what the connector makes: cases (test-suite), judge, cases and labels (calibration-set), knowledge
 * (a folder), found or standards (context-lookup), or manifest (measure).
 */
export async function useResource(id, { dir = null, acceptLicense = false, refresh = false, fetch = globalThis.fetch, now, onProgress = null, options = {} } = {}) {
  const connector = connectorOf(id);
  const entry = entryOf(id);
  if (!connector.as.length) throw fail(`${entry.name} comes down with resources get, but no connector turns it into something the harness runs yet: ${entry.connect.note}`, 'not_connected', 400);
  const fetched = await getResource(id, { dir, acceptLicense, refresh, fetch, now, onProgress, options });
  const read = (name) => readFileSync(join(fetched.folder, name), 'utf8');
  let made;
  try {
    made = await connector.use({ read, folder: fetched.folder, fetched }, options);
  } catch (error) {
    if (error.status) throw error;
    throw fail(`Couldn't read the copy of ${entry.name} in ${fetched.folder}: ${error.message}. Fetch it again with --refresh.`, 'resource_unreadable', 422);
  }
  // Each case says where it came from and under what license, so a result or a copy of it credits its source.
  if (Array.isArray(made?.cases)) made.cases = made.cases.map((item) => ({ ...item, source: { name: entry.name, resource: id, license: fetched.license?.spdx || entry.license.spdx, cite: entry.cite, url: entry.repository || entry.url } }));
  return { id, name: entry.name, as: connector.as, license: fetched.license, cite: entry.cite, shows: entry.connect.note, command: entry.connect.command, fetched_at: fetched.fetched_at, folder: fetched.folder, ...made };
}

/** What a judge name from the command line means: `<resource>/<evaluator>`. */
export async function resourceJudge(name, options = {}) {
  const [id, evaluator] = String(name).split('/');
  const used = await useResource(id, { ...options, options: { ...options.options, evaluator } });
  if (!used.judge || !used.as.includes('judge')) throw fail(`${used.name} isn't a judge. See viable-harness resources list.`, 'not_a_judge');
  return used;
}
