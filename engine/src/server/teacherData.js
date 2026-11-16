/**
 * What the console's teaching pages need of a course beyond its document, kept in a store: classes (who is in it,
 * its sections, a section's own opening) and records (who has done what, and their work). A host that keeps these
 * somewhere else passes its own two with the same shape, and the pages don't change. No Node built-ins.
 */
import { acceptedOf, addLines, addSection, changeLearner, changeSection, classKeys, extendFor, forgetActivity, keepAccepted, learnersNamed, makeLearner, newCodeFor, peopleOf, releasesOf, removeFromList, removeSection, sectionsOf, setRelease } from './classList.js';
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
    addLines: (code, text, options) => addLines(store, code, text, options),
    change: (code, id, change) => changeLearner(store, code, id, change),
    /** { activity's key: instant } of more time one learner has. */
    extensions: async (code, id) => (store ? (await store.get(classKeys.learner(code, id)))?.extensions || {} : {}),
    extend: (code, id, key, closesAt) => extendFor(store, code, id, key, closesAt),
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

const TEMPORARY_MS = 86_400_000;
const LIVE_RUNS = new Set(['queued', 'running']);
/**
 * Where Ask keeps its conversations. A thread holds no learner's name: a class list never goes in one. Each has at most one run at a
 * time (console/ask.js "A message's run"): its state is kept apart from the thread, which the run writes, and so is its log, what
 * a page watching it reads. One process serves a store, so a thread's run changes go one at a time here.
 */
export function storeThreads(store, { now = () => Date.now() } = {}) {
  if (!store) return null;
  const key = (id) => `ask/threads/${id}`;
  const runKey = (id) => `ask/runs/${id}`;
  const logKey = (id) => `ask/run-logs/${id}`;
  const at = () => new Date(now()).toISOString();
  const queues = new Map();
  const oneAtATime = (id, work) => {
    const next = (queues.get(id) || Promise.resolve()).then(work, work);
    queues.set(id, next.catch(() => {}));
    return next;
  };
  const changeRun = (id, change) => oneAtATime(id, async () => {
    const run = await store.get(runKey(id));
    const next = change(run);
    if (!next) return null;
    await store.put(runKey(id), next);
    return next;
  });
  return {
    async get(id) {
      const thread = await store.get(key(id));
      if (!thread) return null;
      const run = await store.get(runKey(id));
      return run ? { ...thread, run } : thread;
    },
    put: ({ run: _run, ...thread }) => store.put(key(thread.id), thread),
    async remove(id) { await store.delete(key(id)); await store.delete(runKey(id)); await store.delete(logKey(id)); },
    /** A new run, unless one is going and was seen alive since staleBefore. Its log starts empty. */
    async claimRun(id, run, { staleBefore }) {
      const taken = await changeRun(id, (held) => (held && LIVE_RUNS.has(held.state) && (held.beat_at || held.started_at) >= staleBefore ? null : { id: run, state: 'queued', started_at: at(), beat_at: at(), attempt: 0, stop_at: null }));
      if (taken) await store.put(logKey(id), { run, events: [] });
      return Boolean(taken);
    },
    /** The run, for its runner: waiting to be taken, or taken by one that stopped showing it was alive (a second attempt). */
    takeRun: (id, run, { staleBefore }) => changeRun(id, (held) => {
      if (held?.id !== run || !(held.state === 'queued' || (held.state === 'running' && held.beat_at < staleBefore))) return null;
      return { ...held, state: 'running', beat_at: at(), attempt: held.state === 'running' ? held.attempt + 1 : held.attempt };
    }),
    beatRun: (id, run) => changeRun(id, (held) => (held?.id === run && held.state === 'running' ? { ...held, beat_at: at() } : null)),
    /** Handed on by its runner, to be taken by the next as the same attempt. */
    continueRun: (id, run) => changeRun(id, (held) => (held?.id === run && held.state === 'running' ? { ...held, state: 'queued', beat_at: at() } : null)),
    async endRun(id, run, state, ending = null, { onlyLive = false } = {}) {
      return Boolean(await changeRun(id, (held) => (held?.id === run && (!onlyLive || LIVE_RUNS.has(held.state)) ? { ...held, state, ending, ended_at: at() } : null)));
    },
    stopRun: (id) => changeRun(id, (held) => (held && LIVE_RUNS.has(held.state) ? { ...held, stop_at: at() } : null)),
    // When the teacher last had it in front of them: a run that ended since is new to them.
    markSeen: (id) => changeRun(id, (held) => (held ? { ...held, seen_at: at() } : null)),
    stopAsked: async (id, run) => { const held = await store.get(runKey(id)); return Boolean(held?.id === run && held.stop_at); },
    addEvents: (id, run, events) => oneAtATime(`log:${id}`, async () => {
      const held = await store.get(logKey(id));
      await store.put(logKey(id), { run, events: [...(held?.run === run ? held.events : []), ...events] });
    }),
    async eventsAfter(id, run, after) {
      const held = await store.get(logKey(id));
      return held?.run === run ? held.events.filter((event) => event.seq > after) : [];
    },
    keepCheckpoint: (body) => store.put(`ask/checkpoints/${body.id}`, body),
    checkpoint: (id) => store.get(`ask/checkpoints/${id}`),
    /** The latest first: { id, title, updated_at }. A conversation that isn't remembered is never here, and goes a day after it was last used. */
    async list() {
      const held = (await Promise.all((await store.list('ask/threads/')).slice(-60).map((name) => store.get(name)))).filter(Boolean);
      for (const thread of held) if (thread.temporary && Date.now() - Date.parse(thread.updated_at) > TEMPORARY_MS) { await store.delete(key(thread.id)); await store.delete(runKey(thread.id)); await store.delete(logKey(thread.id)); }
      const listed = held.filter((thread) => !thread.temporary).sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at))).slice(0, 40);
      // Whether each is working now, or ended since it was last opened.
      const lately = new Date(now() - 300_000).toISOString();
      return Promise.all(listed.map(async ({ id, title, updated_at }) => {
        const run = await store.get(runKey(id));
        const working = Boolean(run && LIVE_RUNS.has(run.state) && (run.beat_at || '') >= lately);
        const unseen = Boolean(!working && run?.ended_at && (!run.seen_at || run.seen_at < run.ended_at));
        return { id, title, updated_at, ...(working ? { working } : unseen ? { unseen } : {}) };
      }));
    },
    /** Earlier conversations whose words meet the query, the best first (memory.js searchConversations), from the latest 200. */
    async search(query, { limit } = {}) {
      const held = (await Promise.all((await store.list('ask/threads/')).map((name) => store.get(name)))).filter((thread) => thread && !thread.temporary)
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
