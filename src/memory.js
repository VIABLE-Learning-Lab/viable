/**
 * Memory that lasts between local runs: the engine's memory service (list, recall, save, remove)
 * over a folder, one JSON file per learner, named by the learner's pseudonymous ID. Each file is a
 * list of { id, content, created_at }, newest last; nothing else about the learner or the run is
 * kept. Recall ranks by keywords (BM25, as the package knowledge search does), then by recency, as
 * VIABLE's memory does. Deleting a learner's file forgets them.
 */
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { rankByKeywords, searchTerms } from './knowledge.js';

// As VIABLE keeps them (src/utils/agentMemory.js): the newest 200 facts per learner, 1,000 characters each.
const LIMITS = { perLearner: 200, chars: 1000 };

// A pseudonymous ID that is also a safe file name: no spaces or @, so a full name or an email doesn't fit.
const PSEUDONYM = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

export function checkLearner(id) {
  if (id == null || id === '') throw Object.assign(new Error('Memory needs the learner\'s pseudonymous ID (learner, or --learner <id> on the command line).'), { status: 400, code: 'invalid_learner' });
  if (typeof id !== 'string' || !PSEUDONYM.test(id)) {
    throw Object.assign(new Error(`"${String(id).slice(0, 40)}" isn't a pseudonymous learner ID: use 1 to 128 letters, digits, dots, dashes or underscores (such as s-0412), never a name or an email.`), { status: 400, code: 'invalid_learner' });
  }
  return id;
}

/** The engine's memory service, kept in dir (created when a fact is first saved). */
export function memoryFiles(dir) {
  const folder = resolve(dir);
  const fileOf = (learner) => join(folder, `${checkLearner(learner)}.json`);
  // One write at a time per learner: an Agent step may save several facts at once.
  const queues = new Map();
  const serial = (learner, work) => {
    const next = (queues.get(learner) || Promise.resolve()).then(work, work);
    queues.set(learner, next.catch(() => {}));
    return next;
  };

  async function read(learner) {
    const path = fileOf(learner);
    let text;
    try { text = await readFile(path, 'utf8'); } catch (error) {
      if (error.code === 'ENOENT') return [];
      throw error;
    }
    try {
      const items = JSON.parse(text);
      if (Array.isArray(items)) return items;
    } catch { /* Said below. */ }
    // Never overwritten: a file someone edited by hand is theirs to fix.
    throw Object.assign(new Error(`${path} isn't a memory file (a JSON list of facts). Fix or delete it.`), { status: 500, code: 'memory_file_unreadable' });
  }

  async function write(learner, items) {
    await mkdir(folder, { recursive: true });
    const path = fileOf(learner);
    // shortcut: one process at a time; two runs for the same learner at once can lose a fact. Lock the file if that happens.
    const temporary = `${path}.${randomUUID().slice(0, 8)}.tmp`;
    await writeFile(temporary, `${JSON.stringify(items, null, 2)}\n`);
    await rename(temporary, path);
  }

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
      const saved = fresh.map((content) => ({ id: `mem_${randomUUID()}`, content, created_at: at }));
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
