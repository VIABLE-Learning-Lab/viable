/**
 * What the console's teaching pages need of a course beyond its document, kept in a store: classes (who is in it,
 * its sections, a section's own opening) and records (who has done what, and their work). A host that keeps these
 * somewhere else passes its own two with the same shape, and the pages don't change. No Node built-ins.
 */
import { acceptedOf, addLines, addSection, changeLearner, changeSection, forgetActivity, keepAccepted, learnersNamed, makeLearner, newCodeFor, peopleOf, releasesOf, removeFromList, removeSection, sectionsOf, setRelease } from './classList.js';
import { forgetChat, forgetCourse, forgetLearner, learnerRecords } from './learner.js';
import { keptTurnEvents } from '../learner/watch.js';
import { MEMORY_LIMITS, foldText, searchConversations } from '../../../harness/src/memory.js';

const TURNS_SHOWN = 200;

export function storeClasses(store) {
  return {
    saving: Boolean(store),
    people: (code) => peopleOf(store, code),
    sections: (code) => sectionsOf(store, code),
    releases: (code) => releasesOf(store, code),
    named: (code, name) => learnersNamed(store, code, name),
    add: (code, fields) => makeLearner(store, code, fields),
    addLines: (code, text) => addLines(store, code, text),
    change: (code, id, change) => changeLearner(store, code, id, change),
    newCode: (code, id) => newCodeFor(store, code, id),
    takeOff: (code, id) => removeFromList(store, code, id),
    forget: (_code, id) => forgetLearner(store, id),
    addSection: (code, input) => addSection(store, code, input),
    changeSection: (code, id, input) => changeSection(store, code, id, input),
    removeSection: (code, id) => removeSection(store, code, id),
    setRelease: (code, key, section, release, closesAt) => setRelease(store, code, key, section, release, closesAt),
    forgetActivity: (code, key) => forgetActivity(store, code, key),
    forgetCourse: async ({ code, doc }) => {
      await forgetCourse(store, code);
      for (const agent of doc.agents || []) await forgetChat(store, agent.slug || agent.ref);
    },
    accepted: (code, key) => acceptedOf(store, code, key),
    keepAccepted: (code, key, item) => keepAccepted(store, code, key, item)
  };
}

export function storeRecords(store) {
  return {
    saving: Boolean(store),
    /** What the AI did on one of the course's turns, for the page of a learner's work: { run_id, events } or null. */
    async turn(code, runId) {
      if (!store) return null;
      const name = (await store.list(`courses/${code}/turns/`)).find((key) => key.endsWith(`-${runId}`));
      const turn = name ? await store.get(name) : null;
      return turn ? { run_id: turn.run_id, events: keptTurnEvents(turn) } : null;
    },
    /** What the AI did on the teacher's own tries of one activity (Try it), the latest last: [{ run_id, events }]. */
    async tried(code, key, limit = 30) {
      if (!store) return [];
      const kept = [];
      for (const name of (await store.list(`courses/${code}/turns/`)).slice(-2000)) { const turn = await store.get(name); if (turn?.tried && turn.activity === key) kept.push(turn); }
      return kept.sort((a, b) => String(a.started_at).localeCompare(String(b.started_at))).slice(-limit).map((turn) => ({ run_id: turn.run_id, events: keptTurnEvents(turn) }));
    },
    /** { learner's id: { activity's key: { opened_at, last_at, done_at, done_how } } } */
    async cells(code) {
      const cells = {};
      if (store) for (const key of await store.list(`courses/${code}/progress/`)) { const [id, activity] = key.split('/').slice(-2); (cells[id] ||= {})[activity] = await store.get(key); }
      return cells;
    },
    /** What is held of one learner, by activity: { work: { drafts, answers, notes, progress, turns }, cut: whether older messages are left out, shown: how many are shown }. */
    async work(code, id) {
      const under = async (part) => {
        const found = {};
        for (const key of await store.list(`courses/${code}/${part}/${id}/`)) { const [activity, panel] = key.split('/').slice(4); ((found[activity] ||= {})[panel] = await store.get(key)); }
        return found;
      };
      const answers = await under('answers');
      for (const panels of Object.values(answers)) for (const panel of Object.keys(panels)) panels[panel] = panels[panel]?.rows || [];
      const notes = {};
      for (const key of await store.list(`courses/${code}/notes/${id}/`)) { const [activity, panel] = key.split('/').slice(4); ((notes[activity] ||= {})[panel] ||= []).push(await store.get(key)); }
      const progress = {};
      for (const key of await store.list(`courses/${code}/progress/${id}/`)) progress[key.split('/').at(-1)] = await store.get(key);
      const turnKeys = await store.list(`courses/${code}/turns/${id}/`);
      const turns = {};
      for (const key of turnKeys.slice(-TURNS_SHOWN)) { const turn = await store.get(key); if (turn?.activity) (turns[turn.activity] ||= []).push(turn); }
      return { work: { drafts: await under('drafts'), answers, notes, progress, turns }, cut: turnKeys.length > TURNS_SHOWN, shown: TURNS_SHOWN };
    },
    /** { records, runs }, what suggested changes and the What to look at page read. */
    of: (code, query) => learnerRecords(store, code, query)
  };
}

/** Where Ask keeps its conversations. A thread holds no learner's name: a class list never goes in one. */
export function storeThreads(store) {
  if (!store) return null;
  const key = (id) => `ask/threads/${id}`;
  return {
    get: (id) => store.get(key(id)),
    put: (thread) => store.put(key(thread.id), thread),
    remove: (id) => store.delete(key(id)),
    keepCheckpoint: (body) => store.put(`ask/checkpoints/${body.id}`, body),
    checkpoint: (id) => store.get(`ask/checkpoints/${id}`),
    /** The latest first: { id, title, updated_at }. */
    async list() {
      const held = await Promise.all((await store.list('ask/threads/')).slice(-40).map((name) => store.get(name)));
      return held.filter(Boolean).map(({ id, title, updated_at }) => ({ id, title, updated_at })).sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)));
    },
    /** Earlier conversations whose words meet the query, the best first (memory.js searchConversations), from the latest 200. */
    async search(query, { limit } = {}) {
      const held = (await Promise.all((await store.list('ask/threads/')).map((name) => store.get(name)))).filter(Boolean)
        .sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at))).slice(0, 200);
      return searchConversations(held.map((thread) => ({ id: thread.id, title: thread.title, updated_at: thread.updated_at, text: threadText(thread) })), query, { limit });
    }
  };
}

/**
 * What the person and Ask said in a conversation, as plain text to search, never what a tool sent back: folded (memory.js foldText),
 * so a platform's database finds fracción by fraccion and Дробь by дробь.
 */
export const threadText = (thread) => foldText((thread?.messages || []).filter((message) => ['user', 'assistant'].includes(message.role) && typeof message.content === 'string' && message.content.trim())
  .map((message) => message.content.trim()).join('\n')).slice(0, 40_000);

/**
 * A person's memory for Ask on this server (open/harness/src/memory.js): what they or Ask kept, and their two switches, keep (Ask keeps
 * and uses what they tell it) and look_back (Ask may search their earlier conversations). One person signs in to a console: one memory.
 */
export function storeMemory(store, { now = () => Date.now() } = {}) {
  if (!store) return null;
  const KEY = 'ask/memory';
  const read = async () => { const held = await store.get(KEY); return { items: held?.items || [], settings: { keep: true, look_back: true, ...held?.settings } }; };
  const at = () => new Date(now()).toISOString();
  const missing = () => Object.assign(new Error('That isn’t in what Ask remembers anymore.'), { status: 404, code: 'memory_not_found' });
  const change = async (work) => { const doc = await read(); const out = await work(doc); await store.put(KEY, doc); return out; };
  return {
    settings: async () => (await read()).settings,
    setSettings: (next) => change((doc) => { for (const name of ['keep', 'look_back']) if (typeof next?.[name] === 'boolean') doc.settings[name] = next[name]; return doc.settings; }),
    list: async () => (await read()).items,
    keep: ({ text, always = false, source = null }) => change((doc) => {
      if (doc.items.length >= MEMORY_LIMITS.items) throw Object.assign(new Error(`Ask keeps up to ${MEMORY_LIMITS.items} things. Delete some first.`), { status: 409, code: 'memory_full' });
      const item = { id: `mem_${crypto.randomUUID().replace(/-/g, '').slice(0, 20)}`, text: String(text).trim(), always: Boolean(always), source, created_at: at(), updated_at: at(), used_at: null };
      doc.items.push(item);
      return item;
    }),
    change: (id, next) => change((doc) => {
      const item = doc.items.find((entry) => entry.id === id);
      if (!item) throw missing();
      if (typeof next?.text === 'string') item.text = next.text.trim();
      if (typeof next?.always === 'boolean') item.always = next.always;
      item.updated_at = at();
      return item;
    }),
    drop: (id) => change((doc) => { const before = doc.items.length; doc.items = doc.items.filter((entry) => entry.id !== id); if (doc.items.length === before) throw missing(); return { id, deleted: true }; }),
    dropAll: () => change((doc) => { const count = doc.items.length; doc.items = []; return { deleted: count }; }),
    // A conversation deleted: what Ask kept in it stays, and says where it came from without a link to it.
    unlink: (threadId) => change((doc) => { for (const item of doc.items) if (item.source?.kind === 'ask' && item.source.id === threadId) item.source = { ...item.source, id: null }; return null; }),
    used: (ids) => change((doc) => { const stamp = at(); for (const item of doc.items) if (ids.includes(item.id)) item.used_at = stamp; return null; })
  };
}
