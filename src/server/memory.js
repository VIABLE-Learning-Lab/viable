/**
 * Memory that lasts between runs, wherever it is kept: the engine's memory service (list, recall,
 * save, remove) over a read and a write of one learner's facts. Each learner's facts are a list of
 * { id, content, created_at }, newest last; nothing else about the learner or the run is kept. Recall
 * ranks by keywords (BM25, as the package knowledge search does), then by recency, as VIABLE's memory
 * does. memory.js beside run.js keeps it in a folder; storeMemory keeps it in a store (store.js).
 */
import { rankByKeywords, searchTerms } from './search.js';

// As VIABLE keeps them: the newest 200 facts per learner, 1,000 characters each.
const LIMITS = { perLearner: 200, chars: 1000 };

// A pseudonymous ID: no spaces or @, so a full name or an email doesn't fit. The colon of an app's
// prefix (my-app:s-0412, as VIABLE's apps name learners) is allowed.
const PSEUDONYM = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

export function checkLearner(id) {
  if (id == null || id === '') throw Object.assign(new Error('Memory needs the learner\'s pseudonymous ID (learner, or --learner <id> on the command line).'), { status: 400, code: 'invalid_learner' });
  if (typeof id !== 'string' || !PSEUDONYM.test(id)) {
    throw Object.assign(new Error(`"${String(id).slice(0, 40)}" isn't a pseudonymous learner ID: use 1 to 128 letters, digits, dots, dashes, underscores or colons (such as s-0412 or my-app:s-0412), never a name or an email.`), { status: 400, code: 'invalid_learner' });
  }
  return id;
}

/** The engine's memory service over read(learner) (a list; [] for none) and write(learner, items). */
export function memoryOver({ read, write }) {
  // One write at a time per learner: an Agent step may save several facts at once.
  const queues = new Map();
  const serial = (learner, work) => {
    const next = (queues.get(learner) || Promise.resolve()).then(work, work);
    queues.set(learner, next.catch(() => {}));
    return next;
  };
  const list = async (learner, limit = LIMITS.perLearner) => (await read(learner)).slice(-Math.max(1, limit)).reverse();
  return {
    list,
    async recall(learner, query, limit = 8) {
      const items = await list(learner);
      const ranked = rankByKeywords(items, searchTerms(query), { text: (item) => item.content }).map((entry) => entry.item);
      return [...ranked, ...items.filter((item) => !ranked.includes(item))].slice(0, limit);
    },
    save: (learner, contents) => serial(learner, async () => {
      const items = await read(learner);
      const known = new Set(items.map((item) => String(item.content).trim().toLowerCase()));
      const fresh = [...new Set(contents.map((value) => String(value).trim().slice(0, LIMITS.chars)).filter((value) => value && !known.has(value.toLowerCase())))];
      if (!fresh.length) return [];
      const at = new Date().toISOString();
      const saved = fresh.map((content) => ({ id: `mem_${crypto.randomUUID()}`, content, created_at: at }));
      await write(learner, [...items, ...saved].slice(-LIMITS.perLearner));
      return saved;
    }),
    remove: (learner, ids) => serial(learner, async () => {
      if (!ids.length) return;
      const items = await read(learner);
      const kept = items.filter((item) => !ids.includes(item.id));
      if (kept.length < items.length) await write(learner, kept);
    })
  };
}

// A learner's facts in a store, under memory/<learner>; deleting the key forgets them.
export const storeMemory = (store) => {
  const keyOf = (learner) => `memory/${checkLearner(learner)}`;
  return memoryOver({
    read: async (learner) => (await store.get(keyOf(learner))) ?? [],
    write: (learner, items) => store.put(keyOf(learner), items)
  });
};
