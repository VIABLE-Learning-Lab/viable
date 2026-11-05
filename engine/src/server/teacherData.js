/**
 * What the console's teaching pages need of a course beyond its document, kept in a store: classes (who is in it,
 * its sections, a section's own opening) and records (who has done what, and their work). A host that keeps these
 * somewhere else passes its own two with the same shape, and the pages don't change. No Node built-ins.
 */
import { acceptedOf, addLines, addSection, changeLearner, changeSection, forgetActivity, keepAccepted, learnersNamed, makeLearner, newCodeFor, peopleOf, releasesOf, removeFromList, removeSection, sectionsOf, setRelease } from './classList.js';
import { forgetChat, forgetCourse, forgetLearner, learnerRecords } from './learner.js';

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
    /** The latest first: { id, title, updated_at }. */
    async list() {
      const held = await Promise.all((await store.list('ask/threads/')).slice(-40).map((name) => store.get(name)));
      return held.filter(Boolean).map(({ id, title, updated_at }) => ({ id, title, updated_at })).sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)));
    }
  };
}
