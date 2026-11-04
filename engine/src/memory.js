/**
 * Memory that lasts between local runs, in a folder: one JSON file per learner, named by the learner's
 * pseudonymous ID (server/memory.js is what it does with them). Deleting a learner's file forgets them.
 */
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { checkLearner, memoryOver } from './server/memory.js';

export { checkLearner };

/** The engine's memory service, kept in dir (created when a fact is first saved). */
export function memoryFiles(dir) {
  const folder = resolve(dir);
  // The colon of an app's prefix (my-app:s-0412) is written %3A in the file name.
  const fileOf = (learner) => join(folder, `${checkLearner(learner).replaceAll(':', '%3A')}.json`);

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

  return memoryOver({ read, write });
}
