/**
 * What a server serves: the packages given when it started (files, a folder, a scaffold's bundle) and
 * the ones added or edited in the console. A package is the one thing a course is: the console changes
 * its document, each change a version in the store, and the same file downloads again. An edited copy
 * takes the place of the file it started from, at the same addresses, so a course keeps its learners.
 * With no store there is only what was given. No Node built-ins.
 */
import { writeZip } from '../../../harness/src/utils/zip.js';
import { graphAgentSlugs, graphKnowledgeRefs } from '../agents/graph.js';
import { validateDocument } from '../validate.js';
import { agentsToServe, packageAgent } from './runtime.js';
import { packageFileBytes } from './search.js';

const LIMITS = { versions: 30, packages: 200, archive: 50 * 1024 * 1024, document: 2 * 1024 * 1024, file: 25 * 1024 * 1024, paths: 5000, kept: 256 * 1024 * 1024 };
const PART_BYTES = 512 * 1024;
const REVISION = 'library/revision';
const ADDRESS = /^[a-z0-9][a-z0-9-]{0,63}$/;
const IN_STORE = 'library:';
const NO_STORE = 'This server has no store, so nothing can be saved here. Start it with a data folder (--data-dir).';

const refused = (message, status = 400, code = 'invalid_package') => Object.assign(new Error(message), { status, code });
const keyOf = {
  item: (id) => `library/items/${id}/`,
  meta: (id) => `library/items/${id}/meta`,
  doc: (id, version) => `library/items/${id}/v${version}`,
  file: (id, path) => `library/items/${id}/files/${encodeURIComponent(path)}`
};
const toBase64 = (bytes) => { let binary = ''; for (const byte of bytes) binary += String.fromCharCode(byte); return btoa(binary); };
const fromBase64 = (text) => Uint8Array.from(atob(text), (char) => char.charCodeAt(0));
const randomId = () => [...crypto.getRandomValues(new Uint8Array(8))].map((byte) => byte.toString(16).padStart(2, '0')).join('');
const sha256 = async (bytes) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map((byte) => byte.toString(16).padStart(2, '0')).join('');

// A path a document names is checked before it is read or kept: it stays inside the package.
const inPackage = (path) => !/^[A-Za-z]:|^[\\/]|(?:^|[\\/])\.\.(?:[\\/]|$)/.test(String(path));
// Everything a document names by path: its files, their text copies, its websites' pages.
const pathsOf = (doc) => [...(doc.files || []).flatMap((file) => [file.path, file.text_path]), ...(doc.knowledge_bases || []).flatMap((kb) => (kb.websites || []).flatMap((site) => (site.snapshot || []).map((page) => page.path)))].filter((path) => path != null);

export const slugOf = (text, fallback) => String(text ?? '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || fallback;
const firstFree = (base, taken) => { let name = base; for (let n = 2; taken.has(name); n += 1) name = `${base}-${n}`; return name; };

/** Where each course answers: the code it holds, else one from its title. Every course of the same documents, in order, gets the same one each time. */
export function courseCodes(docs) {
  const held = docs.flatMap((doc) => (doc.course && ADDRESS.test(doc.course.code ?? '') ? [doc.course.code] : []));
  const taken = new Set();
  const codes = new Map();
  for (const doc of docs) {
    if (!doc.course) continue;
    const own = ADDRESS.test(doc.course.code ?? '') && !taken.has(doc.course.code) ? doc.course.code : null;
    const code = own ?? firstFree(slugOf(doc.course.title, 'course'), new Set([...taken, ...held]));
    taken.add(code);
    codes.set(doc, code);
  }
  return codes;
}

/** Where each activity answers, in its course: the key it holds, else one from its title. */
export function activityKeys(activities) {
  const held = activities.flatMap((activity) => (ADDRESS.test(activity.key ?? '') ? [activity.key] : []));
  const taken = new Set();
  return activities.map((activity) => {
    const own = ADDRESS.test(activity.key ?? '') && !taken.has(activity.key) ? activity.key : null;
    const key = own ?? firstFree(slugOf(activity.title, 'activity'), new Set([...taken, ...held]));
    taken.add(key);
    return key;
  });
}

// A package from whatever a server can serve: an agent file or a bare graph becomes a package of one agent, answering where it did.
function asPackage(doc, slug = null) {
  if (doc?.format === 'viable.course-package') return structuredClone(doc);
  const graph = doc?.format === 'viable.agent' ? doc.graph : doc?.nodes ? doc : null;
  if (!graph) throw refused('That file isn’t a course package or an agent.');
  const name = doc.name || graph.name || 'Agent';
  const ref = slugOf(slug || name, 'agent');
  const agent = { ref, slug: ref, name, description: doc.description ?? null, graph, ...(doc.profile ? { profile: doc.profile } : {}), ...(doc.chat_page ? { chat_page: doc.chat_page } : {}) };
  return { format: 'viable.course-package', version: 1, title: name, agents: [agent] };
}

// One agent as a package of its own: it, the agents it calls, and the knowledge they search. A course stays behind.
function agentAlone(doc, ref) {
  const agents = new Map();
  const add = (agent) => {
    if (!agent || agents.has(agent.ref)) return;
    agents.set(agent.ref, agent);
    for (const slug of graphAgentSlugs(agent.graph)) add(packageAgent(doc.agents, slug));
  };
  add(doc.agents.find((agent) => agent.ref === ref));
  const [first] = agents.values();
  if (!first) throw refused('That agent isn’t in this package anymore.', 404, 'agent_not_found');
  const searched = new Set([...agents.values()].flatMap((agent) => graphKnowledgeRefs(agent.graph)));
  const knowledge = (doc.knowledge_bases || []).filter((kb) => searched.has(kb.ref));
  const read = new Set(knowledge.flatMap((kb) => kb.file_refs || []));
  const { course: _course, question_sets: _sets, ...rest } = doc;
  return { ...rest, title: first.name, description: first.description ?? null, agents: [...agents.values()], knowledge_bases: knowledge, files: (doc.files || []).filter((file) => read.has(file.ref)) };
}

// A program a package would start on this server. Serving a file with --allow-component names one on purpose; a package added in the browser never can.
const startsAProgram = (doc) => (doc.agents || []).flatMap((agent) => agent.graph?.nodes || []).find((node) => node?.type === 'component' && node.config?.manifest?.runs?.kind === 'mcp')?.config.manifest.id ?? null;
// An image at another address would tell its host each learner's address and when they came, on a page that says it loads nothing from elsewhere.
const withoutOutsideImages = (doc) => {
  const outside = (value) => /^(?:https?:)?\/\//i.test(String(value ?? ''));
  for (const holder of (doc.agents || []).flatMap((agent) => [agent.profile, agent.chat_page?.settings])) if (holder && outside(holder.avatar_url)) delete holder.avatar_url;
  return doc;
};
// Every question has an ID of its own, the one its answers are kept under.
const withQuestionIds = (doc) => {
  for (const set of doc.question_sets || []) {
    const used = new Set((set.items || []).map((item) => item?.id).filter(Boolean));
    (set.items || []).forEach((item, index) => { if (item && !item.id) { item.id = firstFree(`q${index + 1}`, used); used.add(item.id); } });
  }
  return doc;
};

// Going back to an older version brings back its work, not who could get in: the course's sign-in, what is open and which chat pages are on stay as they are now. An activity that wasn't there now comes back hidden, and a page that wasn't, paused.
function withAccessOf(current, older) {
  if (older.course && current.course) {
    for (const key of ['identify', 'identify_ask', 'identify_match', 'sections_from']) { if (current.course[key] === undefined) delete older.course[key]; else older.course[key] = current.course[key]; }
    const keys = activityKeys(current.course.activities || []);
    const nowBy = new Map((current.course.activities || []).map((activity, i) => [keys[i], activity]));
    const olderKeys = activityKeys(older.course.activities || []);
    (older.course.activities || []).forEach((activity, i) => {
      const held = nowBy.get(olderKeys[i]);
      activity.release = held?.release ?? 'hidden';
      activity.opens_at = held?.opens_at ?? null;
      activity.closes_at = held?.closes_at ?? null;
    });
  }
  const pages = new Map((current.agents || []).map((agent) => [agent.ref, agent.chat_page]));
  for (const agent of older.agents || []) if (agent.chat_page) agent.chat_page.status = pages.get(agent.ref)?.status ?? 'paused';
  return older;
}

// What an edit can't get past: the format, the graphs, and whatever makes pages of it.
function checked(doc, { trial }) {
  const { errors } = validateDocument(doc, 'course-package');
  if (errors.length) throw refused(`That wouldn’t work: ${errors.slice(0, 3).map((error) => `${error.path ?? ''} ${error.message ?? error}`.trim()).join('; ')}.`);
  const bytes = new TextEncoder().encode(JSON.stringify(doc));
  if (bytes.length > LIMITS.document) throw refused('That’s more than one package can hold (2 MB, without its files).', 413, 'package_too_large');
  try { trial?.(doc); } catch (error) { throw refused(error.message); }
  return bytes;
}

/** What can be served of these entries: { agents, documents }, leaving out and saying what can't sit beside the rest, such as a new file answering at an address already taken. */
export function agentsFrom(entries, log = console.error) {
  const documents = [];
  let agents = [];
  for (const entry of entries) {
    try { agents = agentsToServe([...documents, entry]); documents.push(entry); } catch (error) { log(`Not serving ${entry.file}: ${error.message}`); }
  }
  return { agents, documents };
}

/**
 * store (store.js) or null. given: [{ doc, dir, zip, file, name }], as loadAgents reads them. readPath
 * reads what a given package names by path in its folder. fetch reaches what it names by address. trial(doc)
 * throws what would stop a document's pages working.
 */
export function courseLibrary({ store = null, given = [], readPath = null, fetch = (...args) => globalThis.fetch(...args), trial = null, now = () => Date.now() } = {}) {
  const docs = new Map();
  const listeners = [];
  const givenId = (entry) => `file-${slugOf(entry.name || entry.file, 'package')}`;
  const givenList = given.map((entry) => ({ ...entry, id: givenId(entry) }));

  const putBytes = async (key, bytes) => {
    const parts = Math.ceil(bytes.length / PART_BYTES);
    for (let n = 0; n < parts; n += 1) await store.put(`${key}/${n}`, { data: toBase64(bytes.subarray(n * PART_BYTES, (n + 1) * PART_BYTES)) });
    await store.put(key, { bytes: bytes.length, parts });
  };
  const getBytes = async (key) => {
    const held = await store.get(key);
    if (!held) return null;
    const bytes = new Uint8Array(held.bytes);
    for (let n = 0; n < held.parts; n += 1) {
      const piece = await store.get(`${key}/${n}`);
      if (!piece) return null;
      bytes.set(fromBase64(piece.data), n * PART_BYTES);
    }
    return bytes;
  };
  const dropBytes = async (key) => {
    for (const part of await store.list(`${key}/`)) await store.delete(part);
    await store.delete(key);
  };

  const metas = async () => {
    if (!store) return [];
    const keys = (await store.list('library/items/')).filter((key) => key.endsWith('/meta'));
    return (await Promise.all(keys.map((key) => store.get(key)))).filter(Boolean).sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
  };
  const docOf = async (meta) => {
    const key = `${meta.id}:${meta.version}`;
    if (docs.has(key)) return docs.get(key);
    const bytes = await getBytes(keyOf.doc(meta.id, meta.version));
    if (!bytes) throw refused('That version isn’t kept anymore.', 404, 'version_not_found');
    const doc = JSON.parse(new TextDecoder().decode(bytes));
    for (const old of docs.keys()) if (old.startsWith(`${meta.id}:`)) docs.delete(old);
    docs.set(key, doc);
    return doc;
  };
  const changed = async () => {
    if (store) await store.put(REVISION, { value: randomId(), at: new Date(now()).toISOString() });
    for (const listener of listeners) listener();
  };

  /** Everything held, given and saved, in the order it is served: [{ id, doc, dir, zip, file, name, meta }]. */
  async function entries() {
    const saved = await metas();
    const savedIds = new Set(saved.map((meta) => meta.id));
    const fromGiven = givenList.filter((entry) => !savedIds.has(entry.id)).map((entry) => ({ ...entry, meta: { id: entry.id, title: entry.doc.title || entry.doc.course?.title || entry.doc.name || entry.name, version: 0, status: 'open', versions: [], origin: { file: entry.file } } }));
    const fromStore = await Promise.all(saved.map(async (meta) => ({ id: meta.id, doc: await docOf(meta), dir: `${IN_STORE}${meta.id}`, zip: null, file: meta.title, name: meta.title, meta })));
    return [...fromGiven, ...fromStore];
  }

  const open = async (id) => {
    const found = (await entries()).find((entry) => entry.id === id);
    if (!found) throw refused('That isn’t on this server anymore.', 404, 'package_not_found');
    return found;
  };
  // What a save has to fit beside: every other package's agents and addresses.
  const roomFor = async (doc, id) => {
    const others = (await entries()).filter((entry) => entry.id !== id);
    const slugs = new Set(others.flatMap((entry) => { try { return agentsToServe([entry]).map((agent) => agent.slug); } catch { return []; } }));
    for (const agent of doc.agents || []) {
      const own = slugOf(agent.slug || agent.ref, 'agent');
      agent.slug = firstFree(own, slugs);
      slugs.add(agent.slug);
    }
    if (doc.course) {
      // An address another course answers at isn't this one's to claim, whatever its file says: that course's learners are behind it.
      if (new Set(courseCodes(others.map((entry) => entry.doc)).values()).has(doc.course.code)) delete doc.course.code;
      const codes = courseCodes([...others.map((entry) => entry.doc), doc]);
      doc.course.code = codes.get(doc);
      const keys = activityKeys(doc.course.activities || []);
      (doc.course.activities || []).forEach((activity, i) => { activity.key = keys[i]; });
    }
    return doc;
  };
  const save = async (meta, doc) => {
    const bytes = checked(doc, { trial });
    const version = meta.version + 1;
    await putBytes(keyOf.doc(meta.id, version), bytes);
    const at = new Date(now()).toISOString();
    const versions = [{ version, at, note: meta.note ?? null }, ...(meta.versions || [])];
    for (const old of versions.slice(LIMITS.versions)) await dropBytes(keyOf.doc(meta.id, old.version));
    const next = { ...meta, note: undefined, title: doc.course?.title || doc.title || meta.title, version, versions: versions.slice(0, LIMITS.versions), updated_at: at, created_at: meta.created_at || at };
    await store.put(keyOf.meta(meta.id), next);
    docs.set(`${meta.id}:${version}`, doc);
    await changed();
    return next;
  };
  const needStore = () => { if (!store) throw refused(NO_STORE, 409, 'no_store'); };

  // A package's files go into the store once, so what serves it needs no archive, folder or address.
  const keepFiles = async (id, doc, source) => {
    const paths = pathsOf(doc);
    // A small zip can name the same large entry many times, so these count what is kept, not what came.
    if (paths.length > LIMITS.paths) throw refused(`That package names ${paths.length} files, more than a package can hold (${LIMITS.paths}).`, 413, 'package_too_large');
    let kept = 0;
    for (const path of paths) {
      if (!inPackage(path)) throw refused(`${path}: its path is outside the package.`);
      // What an edit has just put in the store isn't in the file it started from.
      if (await store.get(keyOf.file(id, path))) continue;
      const read = await packageFileBytes({ path }, { fetch, readPath, ...source });
      const bytes = read instanceof Uint8Array ? read : new Uint8Array(read);
      kept += bytes.length;
      if (kept > LIMITS.kept) throw refused(`That package’s files come to more than ${Math.round(LIMITS.kept / 1048576)} MB.`, 413, 'package_too_large');
      await putBytes(keyOf.file(id, path), bytes);
    }
  };
  const dropItem = async (id) => { for (const key of await store.list(keyOf.item(id))) await store.delete(key); };
  // One change at a time here, so two people saving at once get a conflict, not one silently lost. Per process: two instances of one server can still race.
  let line = Promise.resolve();
  const inLine = (work) => { const turn = line.then(work, work); line = turn.catch(() => {}); return turn; };
  // What has been deleted since (a file taken off a knowledge base) stays deleted: an older version comes back without it.
  const withoutGone = async (id, doc) => {
    const here = async (path) => path == null || Boolean(await store.get(keyOf.file(id, path)));
    const kept = async (list, pathOf) => { const out = []; for (const item of list) if (await here(pathOf(item))) out.push(item); return out; };
    if (doc.files) doc.files = await kept(doc.files, (file) => file.path);
    const files = new Set((doc.files || []).map((file) => file.ref));
    for (const kb of doc.knowledge_bases || []) {
      if (kb.file_refs) kb.file_refs = kb.file_refs.filter((ref) => files.has(ref));
      for (const site of kb.websites || []) site.snapshot = await kept(site.snapshot || [], (page) => page.path);
      if (kb.websites) kb.websites = kb.websites.filter((site) => site.snapshot.length);
    }
    for (const activity of doc.course?.activities || []) for (const panel of activity.workspace?.panels || []) if (panel.type === 'reading' && panel.file_ref != null && !files.has(panel.file_ref)) panel.file_ref = null;
    return doc;
  };

  return {
    /** A random value that changes when anything saved does, on any instance. */
    revision: async () => (store ? (await store.get(REVISION))?.value ?? null : null),
    onChange: (listener) => { listeners.push(listener); },
    entries,
    /** What to serve: every entry that isn't closed. */
    documents: async () => (await entries()).filter((entry) => entry.meta.status !== 'closed'),
    /** Every course here, each at its address: [{ id, doc, meta, file, code }]. */
    async courses() {
      const held = await entries();
      const codes = courseCodes(held.map((entry) => entry.doc));
      return held.filter((entry) => entry.doc.course).map((entry) => ({ ...entry, code: codes.get(entry.doc) }));
    },
    /** What a package names by path, wherever it is held. */
    readPath: async (name, dir) => {
      if (!String(dir ?? '').startsWith(IN_STORE)) { if (!readPath) throw refused('It is named by path, and this server has no folder to find it in.'); return readPath(name, dir); }
      const bytes = await getBytes(keyOf.file(String(dir).slice(IN_STORE.length), name));
      if (!bytes) throw refused(`The package has no ${name}.`, 404, 'file_not_found');
      return bytes;
    },
    get: async (id) => { const { doc, meta } = await open(id); return { doc, meta }; },
    /** A new package from a document, or from an upload's bytes (read). Its addresses are settled now. */
    add: (document, { zip = null, dir = null, title = null } = {}) => inLine(async () => {
      needStore();
      if ((await metas()).length >= LIMITS.packages) throw refused(`A server keeps at most ${LIMITS.packages} packages. Remove one first.`, 409, 'too_many_packages');
      let held;
      try { held = asPackage(document, title); } catch (error) { if (error instanceof RangeError) throw refused('That file is nested too deeply to be a package.'); throw error; }
      const doc = withQuestionIds(withoutOutsideImages(await roomFor(held, null)));
      const program = startsAProgram(doc);
      if (program) throw refused(`This package would start a program on this server (${program}). Read what it starts, then serve its file with --allow-component if you trust it.`, 400, 'starts_a_program');
      // Its document first, so what can't work leaves nothing behind.
      checked(doc, { trial });
      const id = `pkg_${randomId()}`;
      try {
        await keepFiles(id, doc, { zip, dir });
        const meta = await save({ id, title: doc.course?.title || doc.title || title || 'Package', version: 0, status: 'open', versions: [], origin: null, note: 'Added' }, doc);
        return { id, code: doc.course?.code ?? null, meta };
      } catch (error) {
        await dropItem(id);
        throw error;
      }
    }),
    /**
     * A change to a package's document, on a copy: work(doc) changes it and may refuse, and what comes out
     * is checked and saved as a new version. expected: the version the person was looking at, so two
     * people don't overwrite each other. The first change to a given file makes the copy that replaces it.
     */
    change: (id, expected, work, note = null) => inLine(async () => {
      needStore();
      const found = await open(id);
      if (expected != null && Number(expected) !== found.meta.version) throw refused('Someone changed this since you opened it. Reload to see what they did.', 409, 'version_conflict');
      const first = found.meta.version === 0;
      const doc = first ? asPackage(found.doc, found.name?.replace(/\.json$/i, '').replace(/\.agent$/i, '')) : structuredClone(found.doc);
      if (first && doc.course) {
        const served = await entries();
        doc.course.code = courseCodes(served.map((entry) => entry.doc)).get(found.doc);
      }
      const answer = await work(doc);
      await roomFor(doc, id);
      withQuestionIds(doc);
      checked(doc, { trial });
      if (first) await keepFiles(id, doc, { zip: found.zip, dir: found.dir });
      const meta = await save({ ...found.meta, created_at: found.meta.created_at, origin: first ? { file: found.file, hash: await sha256(new TextEncoder().encode(JSON.stringify(found.doc))) } : found.meta.origin, note }, doc);
      return { answer, meta, doc };
    }),
    /** An older version again, as a new one. */
    restore: (id, version) => inLine(async () => {
      needStore();
      const { meta, doc: now_ } = await open(id);
      const bytes = meta.versions.some((item) => item.version === Number(version)) ? await getBytes(keyOf.doc(id, Number(version))) : null;
      if (!bytes) throw refused('That version isn’t kept anymore.', 404, 'version_not_found');
      return save({ ...meta, note: `Back to version ${version}` }, withAccessOf(now_, await withoutGone(id, JSON.parse(new TextDecoder().decode(bytes)))));
    }),
    /** Closed: kept here and off learners' pages, its address still its own. */
    setStatus: (id, status) => inLine(async () => {
      needStore();
      const found = await open(id);
      if (found.meta.version === 0) throw refused('This one comes from a file the server was given. Edit it first, or stop serving the file.', 409, 'given_file');
      await store.put(keyOf.meta(id), { ...found.meta, status: status === 'closed' ? 'closed' : 'open' });
      await changed();
    }),
    /** Off this server, with its versions and files. Learners' work goes separately. */
    remove: (id) => inLine(async () => {
      needStore();
      const found = await open(id);
      if (found.meta.version === 0 && givenList.some((entry) => entry.id === id)) throw refused('This one comes from a file the server was given. Stop serving the file to remove it.', 409, 'given_file');
      await dropItem(id);
      await changed();
    }),
    /** A file into a package's store, by the path its document names it with. */
    async putFile(id, path, bytes) {
      needStore();
      if (!inPackage(path)) throw refused(`${path}: its path is outside the package.`);
      if (bytes.length > LIMITS.file) throw refused('A file can be at most 25 MB.', 413, 'file_too_large');
      await putBytes(keyOf.file(id, path), bytes);
      await changed();
    },
    dropFile: async (id, path) => { needStore(); await dropBytes(keyOf.file(id, path)); },
    /** The package as a file again: { name, type, bytes }, a .viable.zip when it has files. agent: one agent's ref, to take it alone. */
    async download(id, { agent = null } = {}) {
      const found = await open(id);
      const whole = asPackage(found.doc, found.name?.replace(/\.json$/i, '').replace(/\.agent$/i, ''));
      const doc = { ...(agent ? agentAlone(whole, agent) : whole), exported_at: new Date(now()).toISOString() };
      const named = pathsOf(doc);
      const base = slugOf(doc.course?.title || doc.title || found.meta.title, 'package');
      if (!named.length) return { name: `${base}.viable.json`, type: 'application/json', bytes: new TextEncoder().encode(JSON.stringify(doc, null, 2)) };
      const files = await Promise.all(named.map(async (path) => ({ name: path, data: found.meta.version ? await getBytes(keyOf.file(id, path)) : await packageFileBytes({ path }, { fetch, readPath, zip: found.zip, dir: found.dir }) })));
      return { name: `${base}.viable.zip`, type: 'application/zip', bytes: await writeZip([{ name: 'package.viable.json', data: JSON.stringify(doc, null, 2) }, ...files]) };
    }
  };
}

export { LIMITS as LIBRARY_LIMITS };
