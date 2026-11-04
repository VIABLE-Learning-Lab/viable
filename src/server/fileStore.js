/**
 * The store (store.js) in a folder, one JSON file per key: conversations/<id> is
 * <dir>/conversations/<id>.json, each part of a key escaped so it can never climb out of the folder.
 * Written to a temporary file and renamed, so a crash leaves the old value or the new one. One
 * process at a time: two servers on one folder can overwrite each other's writes.
 */
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';

const SUFFIX = '.json';

/** Throws, saying what to do, if a store can't write here: better when it starts than on a learner's first message, when the reply goes out and nothing is kept. */
export async function writableFolder(dir) {
  const root = resolve(dir);
  const probe = join(root, `.write-check-${randomUUID().slice(0, 8)}`);
  try {
    await mkdir(root, { recursive: true });
    await writeFile(probe, '');
    await rm(probe, { force: true });
  } catch (error) {
    const user = process.getuid ? ` (uid ${process.getuid()})` : '';
    throw new Error(`This server can't write to ${root} (${error.code}), so it would keep nothing it was told. Give it a folder the user it runs as${user} can write. In a container, use a new named volume, such as -v site-data:/data, or chown a folder you mounted to that uid.`);
  }
}

export const fileStore = (dir) => {
  const root = resolve(dir);
  const pathOf = (key) => {
    const parts = String(key).split('/').map(encodeURIComponent);
    if (parts.some((part) => !part || part === '.' || part === '..')) throw new Error(`"${String(key).slice(0, 80)}" can't be a store key.`);
    return `${join(root, ...parts)}${SUFFIX}`;
  };
  return {
    async get(key) {
      let text;
      try { text = await readFile(pathOf(key), 'utf8'); } catch (error) {
        if (error.code === 'ENOENT') return null;
        throw error;
      }
      return JSON.parse(text);
    },
    async put(key, value) {
      const path = pathOf(key);
      await mkdir(dirname(path), { recursive: true });
      const temporary = `${path}.${randomUUID().slice(0, 8)}.tmp`;
      await writeFile(temporary, `${JSON.stringify(value)}\n`);
      await rename(temporary, path);
    },
    delete: (key) => rm(pathOf(key), { force: true }),
    async list(prefix = '') {
      let entries;
      try { entries = await readdir(root, { recursive: true, withFileTypes: true }); } catch (error) {
        if (error.code === 'ENOENT') return [];
        throw error;
      }
      return entries.filter((entry) => entry.isFile() && entry.name.endsWith(SUFFIX))
        .map((entry) => relative(root, join(entry.parentPath, entry.name)).slice(0, -SUFFIX.length).split(sep).map(decodeURIComponent).join('/'))
        .filter((key) => key.startsWith(prefix)).sort();
    }
  };
};
