/**
 * The learner pages' browser files from a disk: what `npm run build:assets` wrote, or a folder that holds
 * the same. { names, read(path) } for learnerRoutes, or null when they aren't built (the pages then work
 * without them, and the server says so when it starts). node: built-ins allowed: a Worker's host serves these itself.
 */
import { readFile } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const BUILT = fileURLToPath(new URL('../../dist/v1/agents/chat-assets/', import.meta.url));

export async function fileAssets(dir = BUILT) {
  const root = resolve(dir);
  let names;
  try { names = JSON.parse(await readFile(join(root, 'manifest.json'), 'utf8')); } catch { return null; }
  return {
    names,
    async read(path) {
      const full = resolve(root, path);
      if (!full.startsWith(root + sep)) return null;
      try { return new Uint8Array(await readFile(full)); } catch { return null; }
    }
  };
}
